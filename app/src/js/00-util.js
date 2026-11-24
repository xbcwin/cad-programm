// ================= Hilfsfunktionen =================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svgEl(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p = 'i') => p + '_' + Math.random().toString(36).slice(2, 9);
function debounce(fn, ms) { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; f.cancel = () => clearTimeout(t); return f; }
function throttle(fn, ms) { let last = 0, t = null; return (...a) => { const now = performance.now(); const run = () => { last = performance.now(); t = null; fn(...a); }; if (now - last >= ms) run(); else if (!t) t = setTimeout(run, ms - (now - last)); }; }
function round(v, d = 3) { const f = Math.pow(10, d); return Math.round(v * f) / f; }
const FMT = { dec: 2, angle: 1 };   // Einstellung „Nachkommastellen“: Anzeige (0–4) und Winkel (0–4)
function fmtFixed(v, d = 2) {
  if (typeof v !== 'number' || !isFinite(v)) return '–';
  const dc = clamp(Math.round(d), 0, 12);
  let r = round(v, dc);
  if (Object.is(r, -0)) r = 0;
  const s = dc > 0 ? r.toFixed(dc) : String(Math.round(r));
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',');
}
function fmt(v, d) {
  return fmtFixed(v, FMT.dec);
}
function fmtAngle(v) {
  return fmtFixed(v, FMT.angle);
}
function fmtAngleU(v) {
  return typeof v !== 'number' || !isFinite(v) ? '–' : fmtAngle(v) + '°';
}
function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return parseFloat(t);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normTxt = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function storageGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
function storageDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

// ---------- Formel-Rechner (für Parameter wie „Breite/2 + 3“, wenn, runden, tabelle) ----------
const Expr = (() => {
  const unquote = (s) => {
    const t = String(s ?? '').trim();
    return ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) && t.length >= 2 ? t.slice(1, -1) : t;
  };
  function scanTableArgs(src, openIdx) {
    let p = openIdx + 1, depth = 1, q = null, argStart = p;
    const rawArgs = [];
    while (p < src.length) {
      const ch = src[p];
      if (q) {
        if (ch === '\\' && p + 1 < src.length) { p += 2; continue; }
        if (ch === q) q = null;
      } else {
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            if (src.slice(openIdx + 1, p).trim() !== '' || rawArgs.length) rawArgs.push(src.slice(argStart, p));
            p++;
            return { rawArgs, end: p };
          }
        } else if (ch === ';' && depth === 1) {
          rawArgs.push(src.slice(argStart, p));
          argStart = p + 1;
        }
      }
      p++;
    }
    throw new Error('Schließende Klammer ) bei tabelle(…) fehlt.');
  }
  function tokenize(src) {
    const out = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i; while (j < src.length && /[0-9.,]/.test(src[j])) j++;
        const rawOrig = src.slice(i, j), raw = rawOrig.replace(/,/g, '.');
        if ((raw.match(/\./g) || []).length > 1) {
          throw new Error(`Zahl nicht lesbar: „${rawOrig}“ – trenne Angaben mit Semikolon ; (z. B. runden(2,345; 1)).`);
        }
        let v = parseFloat(raw);
        if (!isFinite(v)) throw new Error(`Zahl nicht lesbar: „${rawOrig}“.`);
        // Einheiten direkt hinter der Zahl: 2 cm, 1 in, 1", 0,5 m, 30° (Ergebnis immer in mm bzw. Grad)
        const um = /^\s*(mm|cm|m|in|zoll|"|°)(?![A-Za-zÄÖÜäöüß_0-9])/i.exec(src.slice(j));
        if (um) { v *= { mm: 1, cm: 10, m: 1000, in: 25.4, zoll: 25.4, '"': 25.4, '°': 1 }[um[1].toLowerCase()]; j += um[0].length; }
        out.push({ t: 'n', v, s: i, e: j }); i = j; continue;
      }
      if (/[A-Za-zÄÖÜäöüß_]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-zÄÖÜäöüß_0-9]/.test(src[j])) j++;
        const id = src.slice(i, j);
        if (id.toLowerCase() === 'tabelle') {
          let k = j; while (k < src.length && /\s/.test(src[k])) k++;
          if (src[k] === '(') {
            const sc = scanTableArgs(src, k);
            out.push({ t: 'tcall', rawArgs: sc.rawArgs, s: i, e: sc.end });
            i = sc.end;
            continue;
          }
        }
        out.push({ t: 'id', v: id, s: i, e: j }); i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, val = '';
        while (j < src.length && src[j] !== c) {
          if (src[j] === '\\' && j + 1 < src.length) { val += src[j + 1]; j += 2; }
          else { val += src[j]; j++; }
        }
        if (j >= src.length) throw new Error('Anführungszeichen in der Formel nicht geschlossen.');
        out.push({ t: 'str', v: val, s: i, e: j + 1 }); i = j + 1; continue;
      }
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
        out.push({ t: two, s: i, e: i + 2 }); i += 2; continue;
      }
      if (c === '=') throw new Error('Für Vergleiche nutze == statt = (z. B. wenn(b == 50; 3; 2)).');
      if (c === '!') throw new Error('Meintest du != für „ungleich“?');
      if (c === ',') throw new Error('Trenne mehrere Angaben in Funktionen mit Semikolon ; statt Komma (z. B. runden(2,345; 1)).');
      if ('+-*/^();<>'.includes(c)) { out.push({ t: c, s: i, e: i + 1 }); i++; continue; }
      throw new Error(`Unbekanntes Zeichen in der Formel: „${c}“.`);
    }
    return out;
  }
  const CMPS = new Set(['<', '>', '<=', '>=', '==', '!=']);
  function normTables(raw) {
    if (Array.isArray(raw)) return raw.filter((t) => t && t.name);
    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([name, obj]) => ({
        name,
        rows: Array.isArray(obj) ? obj : Object.entries(obj || {}).map(([key, val]) => ({ key, val })),
      }));
    }
    return [];
  }
  function roundMode(name, mode, args) {
    if (args.length < 1 || args.length > 2) throw new Error(`${name} braucht 1 oder 2 Angaben, z. B. ${name}(2,345; 1).`);
    const x = args[0], dRaw = args.length === 2 ? args[1] : 0;
    if (Math.abs(dRaw - Math.round(dRaw)) > 1e-9) throw new Error(`Die Nachkommastellen in ${name} müssen eine ganze Zahl sein.`);
    const d = Math.round(dRaw);
    if (d < -12 || d > 12) throw new Error(`Die Nachkommastellen in ${name} müssen zwischen -12 und 12 liegen.`);
    const f = Math.pow(10, d), s = x * f;
    let c;
    if (mode === 'round') c = Math.round(s + (s >= 0 ? 1e-12 : -1e-12));
    else if (mode === 'ceil') c = Math.abs(s - Math.round(s)) < 1e-12 ? Math.round(s) : Math.ceil(s);
    else c = Math.abs(s - Math.round(s)) < 1e-12 ? Math.round(s) : Math.floor(s);
    const r = d >= 0 ? Number((c / f).toFixed(d)) : Math.round(c / f);
    return Object.is(r, -0) ? 0 : r;
  }
  function parse(src, vars = {}, tables, depth = 0) {
    const s = String(src ?? '');
    if (!s.trim()) throw new Error('Formel ist leer.');
    const tk = tokenize(s);
    let p = 0;
    const peek = () => tk[p], next = () => tk[p++];
    const expect = (t) => { const x = next(); if (!x || x.t !== t) throw new Error(`Erwartet: ${t}`); };
    function primary() {
      const x = next();
      if (!x) throw new Error('Formel unvollständig – es fehlt eine Zahl oder ein Name.');
      if (x.t === 'n') return { k: 'num', v: x.v };
      if (x.t === '(') { const v = cmp(); expect(')'); return v; }
      if (x.t === '-' || x.t === '+') return { k: 'un', op: x.t, a: pow() };
      if (x.t === 'tcall') return { k: 'tcall', rawArgs: x.rawArgs };
      if (x.t === 'id') {
        const name = x.v;
        if (peek() && peek().t === '(') {
          next(); const args = [];
          if (peek() && peek().t !== ')') {
            args.push(cmp());
            while (peek() && peek().t === ';') { next(); args.push(cmp()); }
          }
          expect(')');
          const low = name.toLowerCase();
          if (low === 'wenn' || low === 'if') {
            if (args.length !== 3) throw new Error('wenn braucht 3 Angaben: wenn(Bedingung; dann; sonst).');
            return { k: 'if', c: args[0], a: args[1], b: args[2] };
          }
          return { k: 'call', name, args };
        }
        return { k: 'var', name };
      }
      throw new Error(`Unerwartetes Zeichen „${x.v ?? x.t}“ in der Formel.`);
    }
    function pow() {
      const v = primary();
      if (peek() && peek().t === '^') { next(); return { k: 'bin', op: '^', l: v, r: pow() }; }
      return v;
    }
    function mul() {
      let v = pow();
      while (peek() && (peek().t === '*' || peek().t === '/')) { const op = next().t; v = { k: 'bin', op, l: v, r: pow() }; }
      return v;
    }
    function add() {
      let v = mul();
      while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; v = { k: 'bin', op, l: v, r: mul() }; }
      return v;
    }
    function cmp() {
      const v = add();
      if (peek() && CMPS.has(peek().t)) {
        const op = next().t, r = add();
        if (peek() && CMPS.has(peek().t)) throw new Error('Vergleiche lassen sich nicht direkt verketten – nutze verschachtelte wenn(…)-Ausdrücke.');
        return { k: 'bin', op, l: v, r };
      }
      return v;
    }
    const ast = cmp();
    if (p < tk.length) throw new Error(`Formel nicht lesbar ab „${tk[p].v ?? tk[p].t}“.`);

    const rawTbls = tables !== undefined ? tables : (vars && vars.__tables) || [];
    const tblList = normTables(rawTbls);

    function lookupTable(rawArgs) {
      if (rawArgs.length !== 2) throw new Error('tabelle braucht Name und Schlüssel, z. B. tabelle(Schraube; M5).');
      const tName = unquote(rawArgs[0]);
      if (!tName) throw new Error('Tabellenname in tabelle(…) fehlt.');
      const tbl = tblList.find((tb) => String(tb.name || '').trim().toLowerCase() === tName.toLowerCase());
      if (!tbl) {
        if (!tblList.length) throw new Error(`Tabelle „${tName}“ nicht gefunden – leg sie links unter „Maße“ an.`);
        throw new Error(`Tabelle „${tName}“ nicht gefunden (vorhanden: ${tblList.map((t) => t.name).join(', ')}).`);
      }
      const rawKey = String(rawArgs[1] ?? '').trim();
      if (!rawKey) throw new Error(`Schlüssel in tabelle(${tbl.name}; …) fehlt.`);
      const isQuoted = ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) && rawKey.length >= 2;
      const litKey = unquote(rawKey);
      const rows = Array.isArray(tbl.rows) ? tbl.rows : [];
      const findRow = (kStr, kNum) => {
        const ks = String(kStr ?? '').trim(), kl = ks.toLowerCase(), kn = kl.replace(/,/g, '.');
        let r = rows.find((x) => String(x.key ?? '').trim().toLowerCase() === kl);
        if (r) return r;
        r = rows.find((x) => String(x.key ?? '').trim().toLowerCase().replace(/,/g, '.') === kn);
        if (r) return r;
        if (kNum != null && isFinite(kNum)) {
          r = rows.find((x) => { const rn = parseNum(x.key); return isFinite(rn) && Math.abs(rn - kNum) <= 1e-9; });
          if (r) return r;
        }
        return null;
      };
      let row = findRow(litKey, parseNum(litKey));
      if (!row && !isQuoted) {
        let kv = NaN, okKey = false;
        try { kv = parse(rawKey, vars, rawTbls, depth + 1); okKey = true; } catch (_) {}
        if (okKey) {
          row = findRow(String(kv), kv);
          if (!row) throw new Error(`Schlüssel „${fmtFixed(kv, 4)}“ nicht in Tabelle „${tbl.name}“ gefunden.`);
        }
      }
      if (!row) throw new Error(`Schlüssel „${litKey}“ nicht in Tabelle „${tbl.name}“ gefunden.`);
      if (typeof row.val === 'number') {
        if (!isFinite(row.val)) throw new Error(`Wert für „${row.key}“ in Tabelle „${tbl.name}“ ist keine gültige Zahl.`);
        return row.val;
      }
      const rv = String(row.val ?? '').trim();
      if (!rv) throw new Error(`Wert für „${row.key}“ in Tabelle „${tbl.name}“ fehlt.`);
      if (depth >= 16) throw new Error(`Tabelle „${tbl.name}“ verweist im Kreis auf sich selbst.`);
      try {
        return parse(rv, vars, rawTbls, depth + 1);
      } catch (e) {
        throw new Error(`Wert für „${row.key}“ in Tabelle „${tbl.name}“ ist ungültig: ${e.message}`);
      }
    }

    function evalNode(node) {
      if (node.k === 'num') return node.v;
      if (node.k === 'un') { const a = evalNode(node.a); return node.op === '-' ? -a : +a; }
      if (node.k === 'if') {
        const cv = evalNode(node.c);
        return Math.abs(cv) > 1e-12 ? evalNode(node.a) : evalNode(node.b);
      }
      if (node.k === 'tcall') return lookupTable(node.rawArgs);
      if (node.k === 'var') {
        if (/^pi$/i.test(node.name)) return Math.PI;
        const key = Object.keys(vars || {}).find((k) => k.toLowerCase() === node.name.toLowerCase());
        if (key === undefined) throw new Error(`Unbekanntes Maß „${node.name}“ – leg es links unter „Maße“ an.`);
        return vars[key];
      }
      if (node.k === 'call') {
        const args = node.args.map(evalNode);
        const low = node.name.toLowerCase();
        if (low === 'runden' || low === 'round') return roundMode(node.name, 'round', args);
        if (low === 'aufrunden' || low === 'ceil') return roundMode(node.name, 'ceil', args);
        if (low === 'abrunden' || low === 'floor') return roundMode(node.name, 'floor', args);
        if (low === 'min' || low === 'max') {
          if (args.length < 1) throw new Error(`${node.name} braucht mindestens eine Zahl.`);
          return low === 'min' ? Math.min(...args) : Math.max(...args);
        }
        if (low === 'abs') { if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`); return Math.abs(args[0]); }
        if (low === 'sqrt' || low === 'wurzel') {
          if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`);
          if (args[0] < 0) throw new Error('Wurzel aus einer negativen Zahl ist nicht möglich.');
          return Math.sqrt(args[0]);
        }
        if (low === 'sin' || low === 'cos' || low === 'tan') {
          if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`);
          return Math[low]((args[0] * Math.PI) / 180);
        }
        throw new Error(`Unbekannte Funktion „${node.name}“.`);
      }
      if (node.k === 'bin') {
        const l = evalNode(node.l), r = evalNode(node.r), op = node.op;
        if (op === '+') return l + r;
        if (op === '-') return l - r;
        if (op === '*') return l * r;
        if (op === '/') { if (Math.abs(r) === 0) throw new Error('Division durch 0 ist nicht möglich.'); return l / r; }
        if (op === '^') return Math.pow(l, r);
        const tol = 1e-9 * Math.max(1, Math.abs(l), Math.abs(r));
        if (op === '==') return Math.abs(l - r) <= tol ? 1 : 0;
        if (op === '!=') return Math.abs(l - r) > tol ? 1 : 0;
        if (op === '<') return l < r - tol ? 1 : 0;
        if (op === '>') return l > r + tol ? 1 : 0;
        if (op === '<=') return l <= r + tol ? 1 : 0;
        if (op === '>=') return l >= r - tol ? 1 : 0;
      }
      throw new Error('Formel nicht lesbar.');
    }

    const v = evalNode(ast);
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('Ergebnis ist keine gültige Zahl.');
    return v;
  }
  function tryEval(src, vars, tables) {
    try { return { ok: true, value: parse(src, vars, tables) }; }
    catch (e) { return { ok: false, error: e && e.message ? e.message : 'Formel nicht lesbar.' }; }
  }
  function names(src) {
    try {
      const out = [];
      for (const t of tokenize(String(src ?? ''))) {
        if (t.t === 'id') out.push(t.v);
        else if (t.t === 'tcall') {
          out.push('tabelle');
          if (t.rawArgs[0]) { const tn = unquote(t.rawArgs[0]); if (tn) out.push(tn); }
          if (t.rawArgs[1]) out.push(...names(t.rawArgs[1]));
        }
      }
      return out;
    } catch (_) { return []; }
  }
  return { eval: parse, tryEval, names };
})();

// ---------- Einheiten je Projekt (BE-10): Anzeige und Eingabe in mm, cm, m oder Zoll; intern immer mm ----------
const Units = (() => {
  const DEFS = {
    mm: { k: 'mm', label: 'mm', name: 'Millimeter (mm)', fac: 1, dec: 2, inputDec: 3, step: 1, shiftStep: 10, areaLabel: 'mm²', areaFac: 1, volLabel: 'cm³', volFac: 1000 },
    cm: { k: 'cm', label: 'cm', name: 'Zentimeter (cm)', fac: 10, dec: 2, inputDec: 4, step: 0.1, shiftStep: 1, areaLabel: 'cm²', areaFac: 100, volLabel: 'cm³', volFac: 1000 },
    m:  { k: 'm',  label: 'm',  name: 'Meter (m)',       fac: 1000, dec: 3, inputDec: 5, step: 0.01, shiftStep: 0.1, areaLabel: 'm²', areaFac: 1e6, volLabel: 'm³', volFac: 1e9 },
    in: { k: 'in', label: 'in', name: 'Zoll (in)',       fac: 25.4, dec: 3, inputDec: 4, step: 0.1, shiftStep: 1, areaLabel: 'in²', areaFac: 645.16, volLabel: 'in³', volFac: 16387.064 },
  };
  const ORDER = ['mm', 'cm', 'm', 'in'];
  const OPTIONS = ORDER.map((k) => [k, DEFS[k].name]);
  const curDoc = (doc) => doc || (typeof App !== 'undefined' ? App.doc : null);
  function key(doc) {
    const d = curDoc(doc);
    const u = d && d.settings && d.settings.unit;
    return DEFS[u] ? u : 'mm';
  }
  const def = (doc) => DEFS[key(doc)];
  const label = (doc) => def(doc).label;
  const areaLabel = (doc) => def(doc).areaLabel;
  const volLabel = (doc) => def(doc).volLabel;
  const factor = (doc) => def(doc).fac;
  const fromMM = (mm, doc) => mm / def(doc).fac;
  const toMM = (v, doc) => v * def(doc).fac;
  const areaFromMM2 = (mm2, doc) => mm2 / def(doc).areaFac;
  const volFromMM3 = (mm3, doc) => mm3 / def(doc).volFac;
  const decFor = (d, doc) => (def(doc).k === 'mm' ? d : Math.max(d, def(doc).dec));
  function fmtLen(mm, d, doc) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '–';
    return fmtFixed(fromMM(mm, doc), FMT.dec);
  }
  function fmtLenU(mm, d, doc) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '–';
    return `${fmtLen(mm, d, doc)} ${label(doc)}`;
  }
  function fmtLenFixed(mm, d = 2, doc) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '–';
    return fmtFixed(fromMM(mm, doc), decFor(d, doc));
  }
  function fmtLenFixedU(mm, d = 2, doc) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '–';
    return `${fmtLenFixed(mm, d, doc)} ${label(doc)}`;
  }
  function fmtArea(mm2, d, doc) {
    if (typeof mm2 !== 'number' || !isFinite(mm2)) return '–';
    const u = def(doc);
    return fmtFixed(mm2 / u.areaFac, u.k === 'm' ? Math.max(FMT.dec, 4) : FMT.dec);
  }
  function fmtAreaU(mm2, d, doc) {
    if (typeof mm2 !== 'number' || !isFinite(mm2)) return '–';
    return `${fmtArea(mm2, d, doc)} ${def(doc).areaLabel}`;
  }
  function fmtVolU(mm3, d, doc) {
    if (typeof mm3 !== 'number' || !isFinite(mm3)) return '–';
    const u = def(doc);
    return `${fmtFixed(mm3 / u.volFac, u.k === 'm' ? Math.max(FMT.dec, 5) : FMT.dec)} ${u.volLabel}`;
  }
  function fmtInput(mm, doc) {
    if (typeof mm !== 'number' || !isFinite(mm)) return '';
    return fmtFixed(fromMM(mm, doc), Math.max(def(doc).inputDec, FMT.dec, 4));
  }
  const UFAC = { mm: 1, cm: 10, m: 1000, in: 25.4, zoll: 25.4, '"': 25.4, '°': 1 };
  function parseLen(raw, V, { expr = true, doc } = {}) {
    const s = String(raw ?? '').trim();
    if (!s) return { ok: false };
    const n = parseNum(s);
    if (!isNaN(n)) {
      const mm = round(toMM(n, doc), 6);
      return { ok: true, value: mm, num: mm };
    }
    const um = /^([-+()\d.,\s*/]+?)\s*(mm|cm|m|in|zoll|"|°)$/i.exec(s);
    if (um) {
      try {
        const mm = round(Expr.eval(um[1], {}) * UFAC[um[2].toLowerCase()], 6);
        if (isFinite(mm)) return { ok: true, value: mm, num: mm };
      } catch (_) {}
    } else if (/^[-+()\d.,\s*/]+((mm|cm|m|in|zoll|"|°)[-+()\d.,\s*/]*)+$/i.test(s)) {
      try {
        const mm = round(Expr.eval(s, {}), 6);
        if (isFinite(mm)) return { ok: true, value: mm, num: mm };
      } catch (_) {}
    }
    if (!/[A-Za-zÄÖÜäöüß_]/.test(s) && (!expr || key(doc) !== 'mm')) {
      try {
        const v = Expr.eval(s, {});
        if (isFinite(v)) {
          const mm = round(toMM(v, doc), 6);
          return { ok: true, value: mm, num: mm };
        }
      } catch (_) {}
    }
    if (!expr) return { ok: false };
    const res = typeof Model !== 'undefined' && Model.evalInfo ? Model.evalInfo(s, V || {}) : Expr.tryEval(s, V || {});
    if (!res.ok || !isFinite(res.value)) return { ok: false, error: res.error };
    return { ok: true, value: s, num: res.value };
  }
  function set(u) {
    if (!DEFS[u] || typeof App === 'undefined' || !App.doc || key() === u) return false;
    App.change('Einheit: ' + DEFS[u].name, (doc) => { doc.settings = doc.settings || {}; doc.settings.unit = u; });
    return true;
  }
  return { DEFS, ORDER, OPTIONS, key, def, label, areaLabel, volLabel, factor, fromMM, toMM, areaFromMM2, volFromMM3, fmtLen, fmtLenU, fmtLenFixed, fmtLenFixedU, fmtArea, fmtAreaU, fmtVolU, fmtInput, parseLen, set };
})();

// ---------- Symbole ----------
const IC = {
  cube: '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z M4 7.5 12 12l8-4.5 M12 12v9" />',
  sketch: '<path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4" /><path d="M3 3h6M3 3v6" opacity=".55"/>',
  parts: '<path d="M8.5 3.5h7L20 8v8l-4.5 4.5h-7L4 16V8z" /><circle cx="12" cy="12" r="3.2"/>',
  measure: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z M7 12.5l2 2 M9.5 10l1.5 1.5 M12 7.5l2 2 M14.5 5l1.5 1.5" />',
  export: '<path d="M12 3v12 M7 8l5-5 5 5 M5 14v5h14v-5" />',
  undo: '<path d="M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />',
  redo: '<path d="m15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />',
  menu: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  list: '<path d="M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01" />',
  sliders: '<path d="M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0" /><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4"/>',
  shadow: '<path d="M7 4h7v9H7z"/><path d="M3 20c3-3 6-4 10-4s6 1 8 4" opacity=".6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3"/>',
  // Notizstift (Entwurf Gemini, geprüft)
  noteDraw: '<path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L11 16l-4 1 1-4Z"/><path d="M15 6l3 3"/><path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  noteErase: '<path d="M8 21h4l9-9a2 2 0 0 0 0-3l-4-4a2 2 0 0 0-3 0l-9 9a2 2 0 0 0 0 3Z"/><path d="M10 9l7 7"/><line x1="3" y1="21" x2="21" y2="21"/>',
  noteText: '<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',
  notesShow: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path d="M15 4c1.5-1.5 3-1.5 4.5 0S21 5.5 22 4"/>',
  notesHide: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path d="M15 4c1.5-1.5 3-1.5 4.5 0S21 5.5 22 4"/><line x1="3" y1="3" x2="21" y2="21"/>',
  eyeOff: '<path d="M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1 M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2" />',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2" />',
  trash: '<path d="M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" />',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />',
  group: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M11 7h4a2 2 0 0 1 2 2v4 M13 17H9a2 2 0 0 1-2-2v-4" />',
  ungroup: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M15 7h2v2 M7 15v2h2" />',
  mirror: '<path d="M12 3v18 M8 6 3 18h5z M16 6l5 12h-5z" />',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7 M20 4v5h-5" />',
  solid: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity=".25"/><rect x="4" y="4" width="16" height="16" rx="2"/>',
  hole: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/><path d="M8 16 16 8 M8 11l3-3 M13 16l3-3" opacity=".8"/>',
  fillet: '<path d="M4 20V10a6 6 0 0 1 6-6h10" /><path d="M4 4h4 M4 4v4" opacity=".4"/>',
  chamfer: '<path d="M4 20V9l5-5h11" /><path d="M4 4h4 M4 4v4" opacity=".4"/>',
  plus: '<path d="M12 5v14 M5 12h14" />',
  minus: '<path d="M5 12h14" />',
  chevR: '<path d="m9 5 7 7-7 7" />',
  chevD: '<path d="m5 9 7 7 7-7" />',
  close: '<path d="M6 6l12 12 M18 6 6 18" />',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5" />',
  warn: '<path d="M12 3 2 20h20z M12 10v4.5 M12 17.5h.01" />',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7.5h.01" />',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.3-2.7 4 M12 17.5h.01" />',
  spark: '<path d="M12 2.5l1.9 5.2 5.2 1.9-5.2 1.9L12 16.7l-1.9-5.2-5.2-1.9 5.2-1.9z" fill="currentColor" stroke="none"/><path d="M19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9z" fill="currentColor" stroke="none"/>',
  printer: '<path d="M6 9V3h12v6 M6 18H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-2 M7 14h10v7H7z" />',
  sheet: '<path d="M4 4h16v16H4z M4 16h16 M13 16v4" /><path d="M7 8h6 M7 11h3" opacity=".6"/>',
  dim: '<path d="M4 7v10 M20 7v10 M4 12h16 M7 9.5 4 12l3 2.5 M17 9.5l3 2.5-3 2.5" />',
  line: '<path d="M5 19 19 5" /><circle cx="5" cy="19" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  circle: '<circle cx="12" cy="12" r="8"/><path d="M12 12h.01" />',
  arc: '<path d="M4 18a9 9 0 0 1 16 0" /><circle cx="4" cy="18" r="1.6" fill="currentColor"/><circle cx="20" cy="18" r="1.6" fill="currentColor"/>',
  slot: '<path d="M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z" />',
  polygon: '<path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8z" />',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />',
  chainEdges: '<path d="M4 16c3 0 4-8 8-8s5 8 8 8" /><circle cx="4" cy="16" r="1.8" fill="currentColor"/><circle cx="12" cy="8" r="1.8" fill="currentColor"/><circle cx="20" cy="16" r="1.8" fill="currentColor"/>',
  point: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" opacity=".55"/>',
  splitLine: '<path d="M4 18 10 12M14 10l6-6" /><circle cx="12" cy="11" r="2.2"/><path d="M9 6l6 10" opacity=".5" stroke-dasharray="2 2"/>',
  extend: '<path d="M4 18 13 9" /><path d="M13 9l5-5" stroke-dasharray="2.5 2"/><path d="M18 3v8M14 7h8" opacity=".55"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9.5 3v4M12 3v4M14.5 3v4M9.5 17v4M12 17v4M14.5 17v4M3 9.5h4M3 12h4M3 14.5h4M17 9.5h4M17 12h4M17 14.5h4" />',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M12 12h.01" />',
  rectCenter: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M12 12h.01 M12 12 20 18" opacity=".55"/>',
  text: '<path d="M5 6h14 M12 6v13 M9 19h6" />',
  construct: '<path d="M4 20 20 4" stroke-dasharray="3 3"/>',
  pointer: '<path d="M5 3l14 7-6 2-2 6z" />',
  fit: '<path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" /><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  home: '<path d="M4 11 12 4l8 7 M6 9.5V20h12V9.5" />',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />',
  save: '<path d="M5 3h11l3 3v15H5z M8 3v5h7V3 M8 21v-7h8v7" />',
  file: '<path d="M6 3h8l4 4v14H6z M14 3v4h4" />',
  newfile: '<path d="M6 3h8l4 4v14H6z M14 3v4h4 M12 11v6 M9 14h6" />',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z" />',
  layers: '<path d="M12 3 3 8l9 5 9-5z M3 13l9 5 9-5" />',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3"/>',
  similar: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity=".25"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M14 7h4v3M10 17H6v-3" stroke-dasharray="2 2"/>',
  up: '<path d="M12 19V5 M6 11l6-6 6 6" />',
  lift: '<path d="M12 20V6 M7 10l5-5 5 5 M5 20h14" />',
  push: '<path d="M12 4v11 M7 10l5 5 5-5 M5 20h14" />',
  bolt: '<path d="M9 3h6v4H9z M10 7v14 M14 7v14 M10 10h4 M10 13h4 M10 16h4" />',
  hex: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><circle cx="12" cy="12" r="3"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M10.5 3h3l.5 2.5 2 1 2.3-1.3 2.1 2.1L19.1 9.6l1 2L22.5 12v3l-2.4.5-1 2 1.3 2.3-2.1 2.1-2.3-1.3-2 1-.5 2.4h-3l-.5-2.4-2-1-2.3 1.3-2.1-2.1 1.3-2.3-1-2L1.5 15v-3l2.4-.4 1-2L3.6 7.3l2.1-2.1L8 6.5l2-1z" />',
  hinge: '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/><path d="M10 8h4 M10 12h4 M10 16h4" />',
  snap: '<path d="M6 20V6h4v10l4-3 4 3" />',
  ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z" />',
  arrowR: '<path d="M5 12h13 M13 6l6 6-6 6" />',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8 M10.5 7.5v6 M7.5 10.5h6" />',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8 M7.5 10.5h6" />',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  cursor: '<path d="M6 3v15l4-4 3 7 2-1-3-7h6z" />',
  play: '<path d="M8 5v14l11-7z" />',
  box3: '<path d="M3 8 12 3l9 5-9 5z M3 8v8l9 5 9-5V8 M12 13v8" />',
  logo: '<g transform="translate(12 12) scale(.885) translate(-12 -10.2)" stroke-width="1.92"><polygon points="12 2 21 7 21 17 12 22 3 17 3 7" /><path d="M12 22V12" /><path d="M12 12L21 7" /><path d="M12 12L3 7" /><path d="M3 7A9 9 0 0 1 21 7" /><path d="M21 7A9 9 0 0 1 12 22" /><path d="M12 22A9 9 0 0 1 3 7" /></g>',
  // --- Icon-Set v2 (Entwurf Gemini, überarbeitet) ---
  originPlanes: '<path d="M12 13 4 17l8 4 8-4z" fill="currentColor" opacity=".25"/><path d="M12 13V4L4 8v9l8 4 8-4V8l-8-4M4 17l8-4 8 4" />',
  planeXY: '<path d="M12 3v18M4 8l16 8M4 16 20 8" opacity=".4"/><path d="M3 12l9-4.5 9 4.5-9 4.5z" fill="currentColor" opacity=".25"/><path d="M3 12l9-4.5 9 4.5-9 4.5z" />',
  planeXZ: '<path d="M12 3v18M4 8l16 8M4 16 20 8" opacity=".4"/><path d="M5 9l14-6v12L5 21z" fill="currentColor" opacity=".25"/><path d="M5 9l14-6v12L5 21z" />',
  planeYZ: '<path d="M12 3v18M4 8l16 8M4 16 20 8" opacity=".4"/><path d="M5 3l14 6v12L5 15z" fill="currentColor" opacity=".25"/><path d="M5 3l14 6v12L5 15z" />',
  axes: '<path d="M12 13V3M9.5 5.5 12 3l2.5 2.5M12 13 3.5 18M4 14.5 3.5 18 7 18.5M12 13l8.5 5M20 14.5l.5 3.5-3.5.5" />',
  viewOrtho: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9" />',
  viewPersp: '<path d="M12 3 3 7.5 6 17l6 4 6-4 3-9.5zM3 7.5 12 13l9-5.5M12 13v8" />',
  grid: '<path d="M6 3v18M18 3v18M3 6h18M3 18h18" opacity=".4"/><path d="M12 3v18M3 12h18" />',
  section: '<path d="M9 9.5 17 5.5v9l-8 4z" fill="currentColor" opacity=".25"/><path d="M12 3 4 7v9l5 2.5 8-4v-9zM4 7l5 2.5v9M9 9.5l8-4"/><path d="M9 18.5 13 21l8-4V8l-4-2.5" stroke-dasharray="3 2.5" opacity=".5"/>',
  xray: '<path d="M13 3v10L4 17M13 13l7 4" stroke-dasharray="3 2.5" opacity=".5"/><path d="M13 3 4 7v10l7 4 9-4V7zM4 7l7 4 9-4M11 11v10" />',
  explode: '<path d="M12 2 6 5l6 3 6-3zM3 10l6 3v7l-6-3zM21 10l-6 3v7l6-3z"/><path d="M12 8v4m-3 1.5 3-1.5 3 1.5" opacity=".5"/>',
  focusView: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" opacity=".5"/><path d="M12 7 7 9.5v5L12 17l5-2.5v-5zM7 9.5 12 12l5-2.5M12 12v5" />',
  timeline: '<path d="M2 12h20" opacity=".4"/><rect x="3" y="8" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="8" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1" fill="currentColor" opacity=".25"/><rect x="17" y="8" width="4" height="8" rx="1"/>',
  rollback: '<path d="M13 4v16M8 8 4 12l4 4M4 12h9"/><rect x="16" y="8" width="4" height="8" rx="1" opacity=".4"/>',
  suppress: '<path d="M9 5h8a2 2 0 0 1 2 2v8M15 19H7a2 2 0 0 1-2-2V9" opacity=".5"/><path d="M3 3l18 18" />',
  params: '<path d="M3 8h12M8 3v17M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3" opacity=".5"/><path d="M12 20v-7a2 2 0 0 1 2-2h1M10.5 15h4M17 15l4 5M21 15l-4 5" />',
  log: '<path d="M3 6h14M3 11h7M3 16h5"/><circle cx="16" cy="16" r="5"/><path d="M16 13.5V16l1.8 1.2" />',
  sketchFace: '<path d="M4 8 9 3h11v11l-6 5M14 8l6-5" opacity=".4"/><rect x="4" y="8" width="10" height="11" rx="1"/><circle cx="9" cy="13.5" r="2.5"/>',
  sketch3d: '<path d="M4 17 12 21l8-4" opacity=".4"/><path d="M6 8v8M12 12v9M18 5v11" stroke-dasharray="3 2.5" opacity=".5"/><path d="M6 8l6 4 6-7"/><circle cx="6" cy="8" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="18" cy="5" r="1.8" fill="currentColor" stroke="none"/>',
  spline: '<path d="M4 18 7 6l10 12 3-12" stroke-dasharray="3 2.5" opacity=".4"/><path d="M4 18C7 6 17 18 20 6"/><circle cx="4" cy="18" r="1.8" fill="currentColor" stroke="none"/><circle cx="20" cy="6" r="1.8" fill="currentColor" stroke="none"/>',
  trim: '<path d="M9 12h6" stroke-dasharray="3 2.5" opacity=".5"/><path d="M11 4 7 20M3 12h6M17 10l4 4M21 10l-4 4" />',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  overhang: '<path d="M3 20h18" opacity=".45"/><path d="M5 20V9h9"/><path d="M14 9h6v4h-6z" fill="currentColor" fill-opacity=".35"/><path d="M15 15l1.5 2M18 15l1.5 2" opacity=".6"/>',
  actionMount: '<rect x="4" y="17" width="16" height="4" rx="1"/><path d="M7 17v-6a2.5 2.5 0 0 1 5 0v6M12 17v-6a2.5 2.5 0 0 1 5 0v6"/><circle cx="12" cy="11" r="1.2"/>',
  plugMount: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 9h7l2 2v4H8z"/><circle cx="5.5" cy="12" r=".8"/><circle cx="18.5" cy="12" r=".8" opacity="0"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  projectEdge: '<path d="M7 3h10l4 4v6" opacity=".45"/><path d="M7 3v6M17 3v6" opacity=".45"/><path d="M12 11v6" stroke-dasharray="2 2"/><path d="M8 15l4 4 4-4"/><path d="M3 21h18" />',
  wall2d: '<path d="M4 18c3-8 9-12 16-12" stroke-dasharray="2.5 2" opacity=".5"/><path d="M3 15.5C6 8 12 4 19 3.5M5.5 20.5c3-7.5 9-11.5 16-12M3 15.5l2.5 5M19 3.5l2.5 5" />',
  offset2d: '<path d="M4 16h6M16 4v6" opacity=".4"/><path d="M4 20V11a7 7 0 0 1 7-7h9M10 20v-9a1 1 0 0 1 1-1h9" />',
  project: '<path d="M3 16l6-3 12 2-6 4z" opacity=".4"/><path d="M7 5v11M17 7v11" stroke-dasharray="3 2.5" opacity=".5"/><path d="M7 5l10 2M7 16l10 2"/><circle cx="7" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1.6" fill="currentColor" stroke="none"/>',
  cHoriz: '<path d="M6 8h12" stroke-dasharray="3 2.5" opacity=".4"/><path d="M4 12h16"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="2" fill="currentColor" stroke="none"/>',
  cVert: '<path d="M16 6v12" stroke-dasharray="3 2.5" opacity=".4"/><path d="M12 4v16"/><circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/>',
  cParallel: '<path d="M5 17 15 5M9 19 19 7" />',
  cCollinear: '<path d="M3 19 9.5 12.5M14.5 7.5 21 1" /><circle cx="12" cy="10" r="1.2" />',
  cPerp: '<path d="M12 14h5v5" opacity=".5"/><path d="M4 19h16M12 19V5" />',
  cTangent: '<circle cx="10" cy="14" r="6"/><path d="M5.6 3.2 20 14"/><circle cx="13.6" cy="9.2" r="1.8" fill="currentColor" stroke="none"/>',
  cEqual: '<path d="M10 10h4M10 14h4" opacity=".6"/><path d="M4 19 9 5M15 19l5-14" />',
  cSymmetric: '<path d="M12 3v18" stroke-dasharray="3 2.5" opacity=".5"/><path d="M8 7 4 12l4 5M16 7l4 5-4 5" />',
  cMid: '<path d="M4 17 20 7" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  cConcentric: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01" />',
  cFix: '<circle cx="12" cy="6" r="2"/><path d="M12 8v12M8 11h8M5 14a7 7 0 0 0 14 0" />',
  cCoincident: '<circle cx="16" cy="8" r="4" opacity=".4"/><path d="M4 19 16 8M4 6l12 2"/><circle cx="16" cy="8" r="2" fill="currentColor" stroke="none"/>',
  extrude: '<path d="M12 14 4 17.5 12 21l8-3.5z" fill="currentColor" opacity=".25"/><path d="M4 17.5V10l8 3.5 8-3.5v7.5L12 21z" opacity=".5"/><path d="M12 14 4 17.5 12 21l8-3.5zM12 14V3M8.5 6.5 12 3l3.5 3.5" />',
  cutExtrude: '<path d="M3 11h5v5h8v-5h5v9H3z" fill="currentColor" opacity=".25"/><path d="M3 11h5v5h8v-5h5v9H3z" /><path d="M8 11h8" stroke-dasharray="3 2.5" opacity=".5"/><path d="M12 2.5v7 M9.5 7 12 9.5 14.5 7" />',
  revolve: '<path d="M6 2v20" stroke-dasharray="3 2.5" opacity=".5"/><rect x="9" y="5" width="5" height="8" rx="1" fill="currentColor" opacity=".25"/><rect x="9" y="5" width="5" height="8" rx="1"/><path d="M3 17c0 2 4 3.5 9 3.5s9-1.5 9-3.5-2.7-3-6-3.3 M15 14.2l2.2-1.7 M15 14.2l2 1.9" />',
  sweep: '<path d="M6 18C6 10 18 14 18 6" stroke-dasharray="3 2.5" opacity=".5"/><circle cx="6" cy="18" r="3" fill="currentColor" opacity=".25"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M3 18C3 9 15 13 15 6 M9 18C9 11 21 15 21 6" opacity=".75"/>',
  loft: '<path d="M12 15 3 18l9 3 9-3z" fill="currentColor" opacity=".25"/><path d="M7 6 3 18M17 6l4 12" opacity=".5"/><path d="M7 6a5 2.5 0 1 0 10 0 5 2.5 0 1 0-10 0M12 15 3 18l9 3 9-3z" />',
  shell: '<path d="M12 5.5 7.5 8 12 10.5 16.5 8z" fill="currentColor" opacity=".25"/><path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9M12 5.5 7.5 8 12 10.5 16.5 8z" />',
  holeWizard: '<path d="M12 2.5v19" stroke-dasharray="3 2.5" opacity=".5"/><path d="M2 6h5v4h2.5v8H2z M22 6h-5v4h-2.5v8H22z" fill="currentColor" opacity=".25"/><path d="M2 6h5v4h2.5v8H2 M22 6h-5v4h-2.5v8H22" />',
  countersink: '<path d="M12 2.5v19" stroke-dasharray="3 2.5" opacity=".5"/><path d="M2 6h5l2.5 4v8H2z M22 6h-5l-2.5 4v8H22z" fill="currentColor" opacity=".25"/><path d="M2 6h5l2.5 4v8H2 M22 6h-5l-2.5 4v8H22" />',
  patternRect: '<rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor" opacity=".25"/><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  patternPath: '<path d="M3 19C6 9 14 5 21 5" stroke-dasharray="3 2.5" opacity=".4"/><rect x="2" y="16" width="4" height="4" rx=".8" fill="currentColor" opacity=".25"/><rect x="2" y="16" width="4" height="4" rx=".8"/><rect x="7.5" y="9" width="4" height="4" rx=".8" transform="rotate(-35 9.5 11)"/><rect x="17" y="3" width="4" height="4" rx=".8" transform="rotate(-10 19 5)"/>',
  patternCirc: '<circle cx="12" cy="12" r="7" stroke-dasharray="3 2.5" opacity=".4"/><circle cx="12" cy="5" r="2.2" fill="currentColor" opacity=".25"/><circle cx="12" cy="5" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/><circle cx="5" cy="12" r="2.2"/>',
  boolUnion: '<path d="M3 3h11v6h6v11H9v-6H3z" fill="currentColor" opacity=".25"/><path d="M3 3h11v6h6v11H9v-6H3z" />',
  boolSubtract: '<path d="M3 3h11v6H9v5H3z" fill="currentColor" opacity=".25"/><path d="M3 3h11v6H9v5H3z"/><path d="M14 9h6v11H9v-6" stroke-dasharray="3 2.5" opacity=".5"/>',
  boolIntersect: '<rect x="9" y="9" width="5" height="5" fill="currentColor" opacity=".25"/><rect x="9" y="9" width="5" height="5"/><path d="M3 3h11v6M3 3v11h6M14 9h6v11H9v-6" stroke-dasharray="3 2.5" opacity=".5"/>',
  split: '<path d="M3 21 21 3" stroke-dasharray="3 2.5" opacity=".6"/><path d="M4 15V4h11zM20 9v11H9z" />',
  massProps: '<path d="M6 9h12l2 11H4z" fill="currentColor" opacity=".25"/><path d="M6 9h12l2 11H4zM9 9V6.5a3 3 0 0 1 6 0V9" />',
  cog: '<path d="M12 12V6a6 6 0 0 1 6 6H6a6 6 0 0 0 6 6v-6z" fill="currentColor" opacity=".25"/><circle cx="12" cy="12" r="6"/><path d="M12 3v18M3 12h18" />',
  clearance: '<rect x="2" y="5" width="4" height="14" rx="1"/><rect x="18" y="5" width="4" height="14" rx="1"/><path d="M6 12h12M9 9l-3 3 3 3M15 9l3 3-3 3" />',
  drone: '<circle cx="6" cy="6" r="3.5"/><circle cx="18" cy="6" r="3.5"/><circle cx="6" cy="18" r="3.5"/><circle cx="18" cy="18" r="3.5"/><path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
  frame: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><rect x="9" y="7" width="6" height="10" rx="1.5"/><path d="M6.5 6.5 9 9M17.5 6.5 15 9M6.5 17.5 9 15M17.5 17.5 15 15" />',
  motor: '<path d="M9 10v3M12 10v3M15 10v3" opacity=".5"/><path d="M12 3v4M5 9l2-2h10l2 2v6H5zM8 15v4M16 15v4M4 19h16" />',
  prop: '<circle cx="12" cy="12" r="2.5"/><path d="M13.8 10.2C16.5 5.5 20 3 21 4s-1.5 4.5-6.2 7.2M10.2 13.8C7.5 18.5 4 21 3 20s1.5-4.5 6.2-7.2" />',
  stack: '<path d="M6 9v6M18 9v6M12 12v7" opacity=".5"/><path d="M12 3 3 7.5 12 12l9-4.5zM3 15 12 19.5 21 15"/><circle cx="12" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>',
  battery: '<path d="M7.5 8v10M12 8v10" opacity=".4"/><rect x="3" y="8" width="14" height="10" rx="2"/><path d="M17 12h2a2 2 0 0 0 2-2V6"/><rect x="19" y="3" width="3" height="3" rx=".5"/>',
  fpvCam: '<rect x="5" y="5" width="14" height="14" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M2 12h3M19 12h3M2 9v6M22 9v6" />',
  antenna: '<path d="M6 5.5a6.5 6.5 0 0 0 0 7M18 5.5a6.5 6.5 0 0 1 0 7" opacity=".5"/><circle cx="12" cy="9" r="3.5" fill="currentColor" opacity=".25"/><circle cx="12" cy="9" r="3.5"/><path d="M12 12.5V21M9 21h6" />',
  standoff: '<path d="M10 3v4h4V3M10 21v-4h4v4" opacity=".5"/><rect x="8" y="3" width="8" height="18" rx="1"/><path d="M8 10h8M8 14h8" />',
  strap: '<path d="M10 7v3M13 7v3" opacity=".5"/><rect x="3" y="7" width="4" height="10" rx="1"/><path d="M7 15h10a4 4 0 0 0 0-8H7M7 10h8V7" />',
  thread: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 8l12-2M6 12l12-2M6 16l12-2M6 19l8-1.3"/>',
  moveStep: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />',
  scaleBody: '<rect x="3" y="13" width="8" height="8" rx="1" opacity=".5"/><rect x="7" y="3" width="14" height="14" rx="1.5" fill="currentColor" opacity=".18"/><rect x="7" y="3" width="14" height="14" rx="1.5"/><path d="M11 13l7-7M14 6h4v4" />',
  thicken: '<path d="M4 15l8 4 8-4-8-4z" opacity=".45" stroke-dasharray="2.5 2"/><path d="M4 9l8 4 8-4-8-4z" fill="currentColor" opacity=".25"/><path d="M4 9l8 4 8-4-8-4zM4 9v6l8 4 8-4V9" />',
  rib: '<path d="M3 5v14h18V5" /><path d="M5 17L19 9v8z" fill="currentColor" opacity=".25"/><path d="M5 17L19 9" />',
  wrap: '<ellipse cx="12" cy="5.5" rx="6.5" ry="2.2"/><path d="M5.5 5.5v13c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v-13"/><path d="M5.5 10.5c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v4.5c0 1.2-2.9 2.2-6.5 2.2s-6.5-1-6.5-2.2z" fill="currentColor" opacity=".25"/>',
  emboss: '<path d="M3 16c4-3.5 14-3.5 18 0" /><path d="M7 14v-3.5c3-1.6 7-1.6 10 0V14" fill="currentColor" opacity=".25"/><path d="M7 14v-3.5c3-1.6 7-1.6 10 0V14M10 10.2V7h4v3.2" />',
  star: '<path d="M12 3.2l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.6 6.8 19.4l1-5.9-4.3-4.1 5.9-.9z" />',
  starFill: '<path d="M12 3.2l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.6 6.8 19.4l1-5.9-4.3-4.1 5.9-.9z" fill="currentColor" />',
  grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  pin: '<path d="M8 5.5 9.5 3.5h5L16 5.5v13l-1.5 2h-5L8 18.5z" fill="currentColor" opacity=".18"/><path d="M8 5.5 9.5 3.5h5L16 5.5v13l-1.5 2h-5L8 18.5zM8 5.5h8M8 18.5h8"/>',
  key: '<rect x="3" y="8" width="18" height="8" rx="4" fill="currentColor" opacity=".2"/><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M7 12h10" opacity=".45"/>',
  keyway: '<circle cx="12" cy="13" r="8" opacity=".45"/><path d="M9.5 5.4V9h5V5.4"/><rect x="9.5" y="4.5" width="5" height="4.5" rx=".8" fill="currentColor" opacity=".25"/>',
  bearing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="5.4" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.7" cy="8.7" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.7" cy="15.3" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="18.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="6.3" cy="15.3" r="1.3" fill="currentColor" stroke="none"/><circle cx="6.3" cy="8.7" r="1.3" fill="currentColor" stroke="none"/>',
  sleeve: '<ellipse cx="12" cy="6" rx="6.5" ry="2.6" fill="currentColor" opacity=".2"/><path d="M5.5 6v12c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V6"/><ellipse cx="12" cy="6" rx="6.5" ry="2.6"/><ellipse cx="12" cy="6" rx="3.4" ry="1.3"/>',
};
function icon(name, extra = '') {
  const body = IC[name] || IC.cube;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}
function iconEl(name) { return svgEl(icon(name)); }

// ---------- Materialien (Dichte in g/cm³, Aussehen & Quellen; Quelle: app/data/materialien.json) ----------
const MATERIAL_DATA = /*JSON:materialien.json*/null;
const MATERIALS = ((MATERIAL_DATA && MATERIAL_DATA.materialien) || []).map((m) => ({
  k: m.kurzname, name: m.name, rho: m.dichte_g_cm3, col: m.farbe_hex,
  cat: m.kategorie || 'Sonstige', e: m.e_modul_gpa, rm: m.zugfestigkeit_mpa,
  use: m.typische_verwendung || '', src: m.quelle || '', look: m.aussehen || null,
}));

// ---------- Fehlermeldungen (Quelle: app/data/fehlermeldungen.json, Entwurf Gemini, angepasst) ----------
const ERRORS = {"sketchOverConstrained": {"titel": "Zu viele Regeln in der Skizze", "erklaerung": "Das neue Maß oder die neue Regel widerspricht deinen bisherigen Angaben, weshalb sich die Zeichnung nicht weiter anpassen kann.", "loesung": "Mache den letzten Schritt rückgängig oder lösche eines der rot markierten Maße, damit wieder Platz für Änderungen ist."}, "sketchUnderConstrained": {"titel": "Einige Linien sind noch lose", "erklaerung": "Manche Teile deiner Zeichnung haben noch keine festen Maße und können aus Versehen mit der Maus verschoben werden.", "loesung": "Du kannst problemlos weiterbauen oder die noch blauen Linien mit Maßen und Regeln festlegen, damit nichts mehr verrutscht."}, "sketchOpen": {"titel": "Umriss hat noch eine Lücke", "erklaerung": "Deine gezeichnete Form ist an mindestens einer Stelle offen, aber für einen 3D-Körper muss der Rand komplett geschlossen sein.", "loesung": "Zoome nah an die Ecken heran und verbinde offene Endpunkte miteinander oder schneide überstehende Linien ab."}, "sketchSelfIntersect": {"titel": "Linien kreuzen sich selbst", "erklaerung": "Die Linien deiner Form überkreuzen sich wie bei einer Acht, wodurch das Programm nicht weiß, wo innen und außen ist.", "loesung": "Ziehe die Eckpunkte auseinander oder nutze das Werkzeug „Trimmen“, um die sich kreuzenden Linienstücke wegzuschneiden."}, "extrudeZero": {"titel": "Höhe darf nicht null sein", "erklaerung": "Ohne eine eingegebene Höhe oder Dicke bleibt deine Zeichnung flach und kann kein 3D-Körper werden.", "loesung": "Ziehe am Pfeil im 3D-Fenster oder tippe im Eingabefeld eine Zahl größer als null ein."}, "cutNothing": {"titel": "Der Schnitt geht ins Leere", "erklaerung": "Dein Schneide-Werkzeug bewegt sich durch den freien Raum und trifft dabei auf kein einziges Bauteil.", "loesung": "Drehe die Richtung des Pfeils um oder ziehe den Schnitt tiefer, sodass er mitten durch deinen 3D-Körper geht."}, "revolveAxisCrosses": {"titel": "Drehachse läuft mitten durchs Profil", "erklaerung": "Die Linie, um die gedreht werden soll, schneidet deine gezeichnete Fläche, wodurch sich der Körper beim Drehen selbst durchdringen würde.", "loesung": "Wähle eine andere Linie am Rand als Drehachse aus oder zeichne deine Form nur auf einer Seite der Achse."}, "sweepSelfIntersect": {"titel": "Kurve ist zu eng fürs Profil", "erklaerung": "Deine Form ist zu breit für die engen Biegungen des Pfades und stößt in den Kurven mit sich selbst zusammen.", "loesung": "Mache die gezeichnete Fläche etwas kleiner oder gestalte die Kurven deiner Pfad-Linie weicher und weiter."}, "loftMismatch": {"titel": "Formen lassen sich nicht verbinden", "erklaerung": "Die ausgewählten Flächen sind zu unterschiedlich oder verdreht, sodass kein glatter Übergang zwischen ihnen berechnet werden kann.", "loesung": "Achte darauf, dass die Profile nicht über Kreuz verbunden sind, oder verwende Formen mit ähnlich vielen Ecken."}, "shellTooThick": {"titel": "Wandstärke ist zu dick gewählt", "erklaerung": "Die eingegebene Wanddicke ist größer als der Platz im Bauteil, sodass beim Aushöhlen im Inneren nichts mehr übrig bleibt.", "loesung": "Tippe einen deutlich kleineren Wert für die Wandstärke ein, beispielsweise 1 oder 2 Millimeter."}, "filletTooBig": {"titel": "Rundung passt nicht auf Kante", "erklaerung": "Der Radius für die Abrundung ist breiter als die angrenzenden Flächen deines Bauteils und hat dort keinen Platz.", "loesung": "Gib einen kleineren Radius ein – den größten möglichen Wert zeigt dir Tracery direkt im Panel rechts an."}, "booleanFailed": {"titel": "Körper konnten nicht verrechnet werden", "erklaerung": "Die Bauteile berühren sich entweder gar nicht oder treffen an einer winzigen Kante so ungünstig aufeinander, dass das Berechnen scheitert.", "loesung": "Schiebe die Körper ein kleines Stückchen weiter ineinander, damit sie sich klar und deutlich überschneiden."}, "patternOverlap": {"titel": "Kopien stecken fehlerhaft ineinander", "erklaerung": "Der Abstand zwischen deinen wiederholten Elementen ist zu klein, wodurch sich die Kopien gegenseitig im Weg stehen.", "loesung": "Vergrößere den Abstand im Menü oder verringere die Anzahl der Kopien, damit jedes Teil genug Platz hat."}, "referenceLost": {"titel": "Ursprüngliche Fläche oder Kante fehlt", "erklaerung": "Dieser Arbeitsschritt sucht nach einer Fläche oder Kante aus einem früheren Schritt, die durch eine Änderung verschwunden ist.", "loesung": "Klicke den Schritt in der Zeitleiste an und wähle die Fläche oder Kante am Bauteil einfach neu aus."}, "holeOutside": {"titel": "Bohrung landet neben dem Bauteil", "erklaerung": "Der Mittelpunkt für dein Loch liegt außerhalb des 3D-Körpers, weshalb in die Luft gebohrt wird.", "loesung": "Ziehe den Mittelpunkt der Bohrung mit der Maus direkt auf die Oberfläche deines Bauteils."}, "importFailed": {"titel": "Datei konnte nicht geöffnet werden", "erklaerung": "Die ausgewählte Datei ist entweder beschädigt oder hat ein Format, das dieses Programm nicht versteht.", "loesung": "Prüfe, ob es eine Tracery-Projektdatei (.tracery.json) oder eine unterstützte 3D-Datei ist, und exportiere sie im Ursprungsprogramm notfalls noch einmal neu."}};
// Fehlercodes des CAD-Kerns → Eintrag oben
const ERROR_FOR_CODE = { edges: 'referenceLost', toobig: 'filletTooBig', cut: 'booleanFailed', dim: 'sketchDimBad', over: 'sketchOverConstrained', shell: 'shellTooThick' };
ERRORS.sketchDimBad = { titel: 'Ein Skizzen-Maß geht nicht auf', erklaerung: 'Ein Maß in der Skizze benutzt einen Namen oder Wert, den es nicht (mehr) gibt.', loesung: 'Prüfe unter „Maße“, ob der Name noch da ist, oder öffne die Skizze per Doppelklick und ändere das rote Maß.' };

// ---------- Hilfetexte für Werkzeuge (Entwurf Gemini, an Tracery angepasst) ----------
// tip: kurz, hilfe: wie benutzen, tipp: typischer Fehler oder Trick. Erscheinen beim längeren Überfahren.
// Formel-Beispiele für „Maße“ (Entwurf Gemini, mit Tracerys Rechner nachgeprüft)
const FORMULA_EXAMPLES = [{"f": "breite / 2", "e": "Damit setzt du ein Loch oder eine Mittellinie immer automatisch genau in die Mitte deines Bauteils."}, {"f": "breite - 2 * wand", "e": "Berechnet den freien Innenraum einer Box, indem links und rechts die Wandstärke abgezogen wird."}, {"f": "schraube + 0,4", "e": "Gibt einem Bohrloch ein kleines bisschen Spielraum, damit die Schraube beim Zusammenbauen nicht klemmt."}, {"f": "breite / (anzahl + 1)", "e": "Verteilt mehrere Löcher in einer Reihe so, dass alle Abstände zueinander und zum Rand exakt gleich groß sind."}, {"f": "max(wand; schraube * 1,5)", "e": "Sorgt dafür, dass die Wand rund um eine Schraube immer mindestens anderthalbmal so dick ist wie die Schraube selbst."}, {"f": "breite * pi", "e": "Rechnet den äußeren Umfang eines Rades oder Rohres aus, wenn du die Breite als Durchmesser nimmst."}, {"f": "pi * (schraube / 2) ^ 2", "e": "Bestimmt die genaue Querschnittsfläche deines runden Schraubenlochs in Quadratmillimetern."}, {"f": "wurzel(breite ^ 2 + hoehe ^ 2)", "e": "Berechnet die exakte Länge einer schrägen Verstärkungsstrebe quer durch dein Rechteck von Ecke zu Ecke."}, {"f": "floor((breite - 2 * wand) / (schraube * 2,5))", "e": "Rundet auf eine ganze Zahl ab, um zu prüfen, wie viele Schraubenlöcher mit genug Abstand nebeneinander in deine Box passen."}, {"f": "(breite / 2) * tan(30)", "e": "Ergibt die genaue Dachhöhe, wenn du auf dein Bauteil eine dreieckige Spitze mit 30 Grad Schräge setzt."}, {"f": "(schraube + wand) / cos(30)", "e": "Rechnet eine Schlüsselweite (hier schraube + wand) in das Maß von Ecke zu Ecke um – so breit muss eine Sechskant-Tasche mindestens sein."}, {"f": "breite * sin(180 / anzahl) - schraube", "e": "Zeigt dir, wie viel Material zwischen zwei Nachbarlöchern übrig bleibt, wenn du sie im Kreis auf dem Durchmesser verteilst."}];
const FORMULA_DEMO = { breite: 40, hoehe: 20, wand: 2, schraube: 3, anzahl: 4 };
const HELP = {
 "sketchFace": {
  "tip": "Neue 2D-Zeichnung auf Fläche starten",
  "hilfe": "Klicke auf eine flache Seite deines 3D-Bauteils oder auf eine Grundebene. Die Ansicht dreht sich automatisch passend hin. Unter „Skizze“ gibt es außerdem zwei Hilfsebenen: „Mittig zwischen zwei Flächen“ (zwei parallele Flächen anklicken – die Skizze liegt genau in der Mitte) und „Durch drei Punkte“ (drei Punkte auf Körpern anklicken, Ecken und Kantenmitten rasten ein).",
  "tipp": "Eine Skizze geht nur auf flachen Ebenen, nicht auf gewölbten Rundungen."
 },
 "line": {
  "tip": "Gerade Linien und tangentiale Bögen im Wechsel",
  "hilfe": "Klicke für den Startpunkt und noch einmal für den Endpunkt. Du kannst direkt weiterklicken, um eine Kette zu zeichnen. Drücke beim Linienzug die Taste A, um auf einen tangentialen Bogen umzuschalten – er schließt ohne Knick an das vorige Stück an. Noch einmal A schaltet zurück auf Linie.",
  "tipp": "Drücke Enter oder Escape, um den Linienzug zu beenden, ohne die ganze Skizze zu schließen."
 },
 "select": {
  "tip": "Elemente wählen, Rahmen ziehen und Punkte verschieben",
  "hilfe": "Klicke ein Element an, um es rechts zu bearbeiten, oder ziehe im Leeren einen Rahmen auf: Von links nach rechts wählt nur Elemente ganz im Rahmen, von rechts nach links (gestrichelt) alles, was berührt wird. Umschalt fügt zur Auswahl hinzu. Endpunkte und Spline-Punkte lassen sich ziehen. Entf löscht das Gewählte, H verschiebt oder dreht es.",
  "tipp": "Feste Maße und Regeln bleiben beim Ziehen erhalten. Blaue Teile sind noch beweglich, dunkle liegen fest."
 },
 "rect": {
  "tip": "Rechteck über zwei Ecken aufziehen",
  "hilfe": "Klicke für die erste Ecke, ziehe die Maus schräg herüber und klicke für die gegenüberliegende Ecke. Rechts kannst du auf „Von der Mitte aus“ umschalten: Dann ist der erste Klick die Mitte – klickst du dafür auf den Nullpunkt oder einen Kreismittelpunkt, bleibt das Rechteck dort mittig. „Gedreht“ zeichnet zuerst eine schräge Kante und dann die Höhe.",
  "tipp": "Tippe die Maße direkt nach dem ersten Klick auf der Tastatur ein und wechsle mit der Tab-Taste zwischen Breite und Höhe."
 },
 "circle": {
  "tip": "Runden Kreis vom Mittelpunkt aufziehen",
  "hilfe": "Setze den ersten Klick in die Mitte, ziehe den Kreis groß und klicke ein zweites Mal für den Rand. Rechts kannst du auch „Zwei Punkte“ (Durchmesser) oder „Drei Punkte“ wählen – praktisch, wenn ein Kreis genau durch vorhandene Punkte gehen soll.",
  "tipp": "Tracery fragt nach dem Durchmesser (der ganzen Breite), nicht nach dem Radius."
 },
 "arc": {
  "tip": "Gebogene Linie über drei Punkte",
  "hilfe": "Klicke zuerst auf den Startpunkt, dann auf den Endpunkt und bestimme mit dem dritten Klick die Biegung. Mit „Tangential“ klickst du auf das Ende einer Linie oder eines Bogens und dann auf den Endpunkt – der Bogen schließt ohne Knick an.",
  "tipp": "Wenn der Bogen in die falsche Richtung schnappt, ziehe den Mauszeiger einfach über die gedachte Verbindungslinie auf die andere Seite."
 },
 "slot": {
  "tip": "Langloch für bewegliche Schrauben zeichnen",
  "hilfe": "Klicke den ersten und zweiten Punkt für die Mittellinie und ziehe dann mit dem dritten Klick die Breite auf. Rechts auf „Gebogen“ umschalten: Mitte, Anfang, Ende (gegen den Uhrzeigersinn) und Breite – z. B. für verstellbare Halterungen.",
  "tipp": "Langlöcher sind perfekt, wenn du beim späteren Zusammenbauen noch etwas Spielraum zum Verschieben brauchst."
 },
 "polygon": {
  "tip": "Vieleck wie Sechskant zeichnen",
  "hilfe": "Klicke auf den Mittelpunkt, ziehe die Größe auf und tippe im Eingabefeld die Anzahl der Ecken ein. Mit „Über die Flächen“ ist das getippte Maß die Schlüsselweite – ideal für Mutternfallen (M3: 5,5 mm).",
  "tipp": "Für einen Sechskant-Schraubenkopf stellst du einfach die Eckenanzahl auf 6. Nach dem Zeichnen drehst du das Vieleck rechts mit „Drehung“ – oder mit einem Klick auf „Ecke oben“ bzw. „Fläche oben“."
 },
 "spline": {
  "tip": "Geschwungene Freihand-Kurve durch Punkte legen",
  "hilfe": "Klicke nacheinander die Punkte, durch die die Kurve laufen soll. Zum Beenden drückst du Enter oder klickst doppelt auf den letzten Punkt. Ein Klick auf den ersten Punkt schließt die Kurve zu einer Fläche.",
  "tipp": "Setze so wenige Punkte wie möglich, dann wird die Kurve gleichmäßiger. Später kannst du jeden Punkt einzeln ziehen. Für das Hochziehen wird die Kurve in sehr kurze gerade Stücke zerlegt."
 },
 "trim": {
  "tip": "Überstehende Linienstücke einfach wegschneiden",
  "hilfe": "Fahre mit der Maus über ein Stück zwischen zwei Schnittpunkten. Es leuchtet rot und verschwindet beim Klicken. Bei einem Rechteck, Vieleck oder Langloch wird die Form dafür in einzelne Linien zerlegt.",
  "tipp": "Halte die Maustaste gedrückt und wische wie mit einem Radiergummi über mehrere Stücke. Ein Stück ohne Schnittpunkt wird ganz gelöscht."
 },
 "offset2d": {
  "tip": "Parallele Kopie im Abstand erstellen – auch mehrfach und beidseitig",
  "hilfe": "Klicke eine Linie, einen Bogen, Kreis, eine Ellipse oder eine Form an. Rechts kannst du vorher Anzahl, Beidseitig (innen und außen) und Ecken (spitz oder rund) einstellen. Bewege dann die Maus auf eine Seite und klicke – oder tippe den Abstand ein und drücke Enter (auch als Formel).",
  "tipp": "Jede Kopie bleibt über eine Regel mit dem Original verbunden. Ändert sich das Original, wandert die Kopie mit. Klick auf das Regel-Symbol, um den Abstand später zu ändern – bei einer Kette gilt der neue Abstand für alle Stücke zusammen. Bei einer Ellipse wird die Kopie eine Spline genau im Abstand (sie bleibt nicht verbunden)."
 },
 "wall2d": {
  "tip": "Aus einer offenen Linie eine Wand mit Dicke machen",
  "hilfe": "Stell rechts die Wandstärke ein und klicke eine offene Linie, einen Linienzug, einen Bogen oder eine Spline an. Tracery legt auf beiden Seiten die halbe Dicke an und schließt die Enden – die Linie bleibt als Hilfslinie in der Mitte. Mit „Fertig“ ziehst du die Wand hoch.",
  "tipp": "Ideal für Rippen, Stege und dünne Halter, z. B. einen Kabelhalter: Bogen zeichnen, Wand 2 mm, 8 mm hochziehen. Ändert sich die Linie, wandert die Wand mit."
 },
 "project2d": {
  "tip": "Kante oder ganze ebene Fläche in die Skizze holen",
  "hilfe": "Klick in der Skizze auf eine Kante eines Körpers – sie kommt als Linie, Bogen, Kreis oder Spline in die Skizze und bleibt mit dem Körper verbunden. Mit Umschalt + Klick auf eine ebene Körperfläche übernimmst du alle Randkanten (Außenkontur und Löcher) auf einmal. Im Feld „Versatz“ stellst du bei Bedarf einen Abstand ein (+ nach außen, − nach innen). Ein normaler Klick auf eine Fläche holt den Schnitt des Körpers mit der Skizzen-Ebene.",
  "tipp": "So passt ein Deckel oder eine Dichtung mit Spiel: Skizze auf die Oberseite, Versatz auf 0,2 mm oder 2 mm stellen und mit Umschalt + Klick die Fläche übernehmen – Außenrand und Löcher entstehen versetzt auf einmal und wachsen mit."
 },
 "mirror2d": {
  "tip": "Elemente an einer Linie spiegeln",
  "hilfe": "Klicke zuerst die Linie an, an der gespiegelt wird. Dann klickst du die Elemente an, die ein Spiegelbild bekommen sollen, und drückst Enter. Ohne Auswahl wird alles gespiegelt.",
  "tipp": "Das Spiegelbild hängt über Symmetrie-Regeln am Original: Zeichnest du nur eine Hälfte um, bleibt die andere automatisch deckungsgleich. Als Spiegelachse eignet sich eine Hilfslinie (Taste X)."
 },
 "patternRect2d": {
  "tip": "Elemente in Reihen und Spalten vervielfachen",
  "hilfe": "Klicke die Elemente an, die vervielfacht werden sollen. Rechts stellst du Anzahl und Abstand in X und Y ein. Mit dem Knopf „Muster anlegen“ oder Enter entstehen die Kopien.",
  "tipp": "Die Kopien hängen am Original. Änderst du dort Größe oder Lage, ziehen alle Kopien mit. Zum Beispiel für ein Lochraster."
 },
 "patternCirc2d": {
  "tip": "Elemente im Kreis vervielfachen",
  "hilfe": "Klicke die Elemente an, die vervielfacht werden sollen. Rechts stellst du Anzahl und Gesamtwinkel ein und wählst bei Bedarf den Mittelpunkt (sonst gilt der Nullpunkt). Dann Enter.",
  "tipp": "360° verteilt die Kopien rund herum. Bei weniger Grad liegt die letzte Kopie genau am Ende des Winkels. Typisch für Lochkreise und Flansche."
 },
 "construct2d": {
  "tip": "Hilfslinien: zeichnen, aber nicht zur Fläche zählen",
  "hilfe": "Mit Taste X schaltest du auf Hilfslinien um. Alles, was du dann zeichnest, ist gestrichelt und hilft nur beim Fangen, Spiegeln und Bemaßen. Ist ein Element gewählt, wandelt X dieses um.",
  "tipp": "Hilfslinien werden beim Hochziehen ignoriert. Eine Mittellinie als Hilfslinie ist die beste Achse zum Spiegeln."
 },
 "project": {
  "tip": "Kante der Fläche in die Skizze übernehmen",
  "hilfe": "Geht in einer Skizze auf einer Körperfläche: Klicke eine gestrichelte Kante der Fläche an. Sie wird zu einer festen Linie deiner Skizze, die du zum Zeichnen und für Regeln mitbenutzen kannst.",
  "tipp": "Die übernommene Linie ist fixiert. Ändert sich der Körper später, passt sie sich noch nicht von selbst an – dann einfach neu übernehmen."
 },
 "dimension": {
  "tip": "Genaue Länge oder Winkel festlegen",
  "hilfe": "Klicke eine Linie, eine Rechteck-Seite oder einen Kreis an und tippe deinen Wunschwert ein – auch eine Formel wie breite/2 mit Namen aus „Maße“.",
  "tipp": "Feste Maße zeigen ein Schloss und bleiben beim Ziehen erhalten. Klick aufs Schloss, um ein Maß wieder zu lösen."
 },
 "cHoriz": {
  "tip": "Linie exakt waagerecht ausrichten",
  "hilfe": "Klicke eine schräge Linie oder zwei Punkte an. Sie richten sich sofort waagerecht aus, also parallel zur X-Richtung der Skizze.",
  "tipp": "Wenn sich nichts bewegt, hat die Linie wahrscheinlich schon eine andere feste Regel, die du erst anklicken und löschen musst."
 },
 "cVert": {
  "tip": "Linie exakt senkrecht ausrichten",
  "hilfe": "Klicke eine Linie oder zwei Punkte an, damit sie kerzengerade von oben nach unten stehen.",
  "tipp": "Nutze das für zwei Punkte, um sie exakt übereinander zu stapeln, ohne eine sichtbare Linie dazwischen zu zeichnen."
 },
 "cParallel": {
  "tip": "Zwei Linien im gleichen Winkel",
  "hilfe": "Klicke zwei Linien nacheinander an. Tracery dreht sie so wenig wie möglich, bis sie exakt parallel laufen.",
  "tipp": "Soll eine der beiden sicher stehen bleiben, gib ihr vorher eine Regel wie „Waagerecht“ oder ein Maß."
 },
 "cPerp": {
  "tip": "Rechten Winkel (90 Grad) erzwingen",
  "hilfe": "Klicke zwei Linien nacheinander an, damit sie exakt im 90-Grad-Winkel aufeinandertreffen.",
  "tipp": "Die Linien müssen sich dafür nicht direkt berühren – auch ihre gedachten Verlängerungen stehen danach im rechten Winkel."
 },
 "cTangent": {
  "tip": "Linie weich an Kreis anlegen",
  "hilfe": "Klicke eine Linie und einen Kreis oder Bogen an – oder zwei Kreise. Danach berühren sie sich genau an einer Stelle, ohne Knick.",
  "tipp": "Unverzichtbar, wenn du Riemenscheiben oder runde Übergänge ohne scharfe Ecken zeichnen willst."
 },
 "cEqual": {
  "tip": "Gleiche Größe für Elemente erzwingen",
  "hilfe": "Klicke zwei Linien oder zwei Kreise nacheinander an. Beide bekommen sofort exakt dieselbe Länge oder denselben Durchmesser.",
  "tipp": "Bemaße danach nur noch eines der beiden Teile – das andere ändert seine Größe automatisch mit."
 },
 "cSymmetric": {
  "tip": "Gleichmäßig an einer Mittellinie ausrichten",
  "hilfe": "Klicke zwei Punkte oder zwei Kreise an und zum Schluss die Linie, an der gespiegelt wird.",
  "tipp": "Ziehst du danach an einer Seite, bewegt sich die andere Seite wie vor einem Spiegel automatisch mit."
 },
 "cFix": {
  "tip": "Punkt oder Linie festpinnen",
  "hilfe": "Klicke auf ein Element in deiner Skizze, um es wie mit einer Reißzwecke festzupinnen, sodass es nicht mehr verrutscht.",
  "tipp": "Nutze das sparsam: Es ist meistens besser, Teile mit Maßen zum Mittelpunkt festzulegen, statt sie einfach einzufrieren."
 },
 "cCoincident": {
  "tip": "Punkte und Linien fest zusammenkleben",
  "hilfe": "Klicke auf zwei Punkte, um sie zu verschmelzen, oder auf einen Punkt und eine Linie, um ihn auf ihr einzurasten.",
  "tipp": "Wenn sich deine Skizze später nicht in 3D hochziehen lässt, ist oft eine Ecke offen – hiermit schließt du die Lücke."
 },
 "extrude": {
  "tip": "Flache Skizze zu 3D-Körper hochziehen",
  "hilfe": "Klicke in eine geschlossene Fläche deiner Skizze und ziehe am Pfeil, um ihr eine Höhe oder Dicke zu geben.",
  "tipp": "Du kannst nur komplett geschlossene Formen hochziehen; bei Lücken im Umriss streikt das Werkzeug."
 },
 "cutExtrude": {
  "tip": "Loch oder Form aus 3D-Körper stanzen",
  "hilfe": "Wähle deine Skizzenfläche aus und ziehe den Pfeil mitten durch deinen vorhandenen 3D-Körper, um Material wegzuschneiden.",
  "tipp": "Stelle die Tiefe im Menü auf 'Durch alles', damit das Loch garantiert offen bleibt, auch wenn das Bauteil später dicker wird."
 },
 "revolve": {
  "tip": "Skizze im Kreis zu 3D-Körper drehen",
  "hilfe": "Klicke zuerst auf deine gezeichnete Fläche und wähle dann eine gerade Linie als Drehachse aus.",
  "tipp": "Zeichne für runde Dinge wie Räder, Flaschen oder Schüsseln immer nur die halbe Querschnittsform bis zur Mitte."
 },
 "sweep": {
  "tip": "Querschnitt entlang eines Pfads ziehen (Sweep)",
  "hilfe": "Zeichne in einer Skizze einen offenen Pfad aus Linien, Bögen oder einer Spline und klick „Fertig“. Tracery zieht dann ein Rohr mit 6 mm Durchmesser daran entlang. Rechts stellst du rund oder rechteckig, die Größe und eine Wand für hohle Rohre ein.",
  "tipp": "Gut für Kabelkanäle, Rohre, Bügel und Leisten. Ecken im Pfad werden automatisch rund übergangen."
 },
 "loft": {
  "tip": "Weicher Übergang durch mehrere Umrisse (Loft)",
  "hilfe": "Zeichne zwei oder mehr Umrisse auf verschiedenen Ebenen (z. B. ein Rechteck unten und einen Kreis 30 mm darüber – mit „Ebene verschieben“ in der Skizze). Wähle die Skizzenkörper in der Reihenfolge, durch die der Körper laufen soll, und klick „Übergang“. Bei einem einzelnen Skizzenkörper macht „Zur Spitze“ daraus eine Spitze. Rechts unter „Mittellinie“ kannst du den Übergang an einer gebogenen Linie entlangführen.",
  "tipp": "Unter „Spitze verlängern“ stellst du ein, wie weit die Spitze hinter dem letzten Umriss liegt. Mit „Mittellinie zeichnen“ biegst du den Übergang entlang einer Kurve; mit „Führungskurve zeichnen“ gibst du die Seitenlinie vor und machst ihn bauchig oder schlank – die Umrisse bleiben dabei, wo sie sind. Eine „Zweite Führungskurve“ quer zur ersten formt die andere Richtung: z. B. die Höhe von der Seite und die Breite von oben. Für Übergänge, Düsen und Griffe danach die Kanten runden."
 },
 "holeWizard": {
  "tip": "Schraubenloch, Sackloch, Passbohrung H7, Zentrierbohrung, Einsatz oder Mutternfalle",
  "hilfe": "Klick auf eine Fläche und dann auf „Bohrung“ – das geht auch auf runden Flächen wie Rohren und Zylindern. Wähle die Art (Durchgang, Kernloch, Sackloch mit 118°-Spitze, Passbohrung H7, Zentrierbohrung DIN 332 A, Gewindeeinsatz oder Mutternfalle) und die Maße. Unten siehst du den Querschnitt als Vorschau; ein Klick auf „Löcher setzen“ bohrt und jeder weitere Klick setzt noch ein Loch.",
  "tipp": "„Sackloch“ hängt unten eine echte 118°-Bohrspitze an die Zylindertiefe. „Passbohrung H7“ bohrt genau das Nennmaß und nennt die ISO-286-Toleranz."
 },
 "countersink": {
  "tip": "Trichter-Rand für flache Schraubenköpfe",
  "hilfe": "Klicke auf die obere Kante eines runden Lochs, damit der Rand schräg angeschnitten wird und eine Senkkopfschraube bündig verschwindet.",
  "tipp": "So steht später kein Schraubenkopf mehr störend aus der Oberfläche deines Bauteils heraus."
 },
 "fillet": {
  "tip": "Scharfe 3D-Kanten schön abrunden",
  "hilfe": "Klicke eine oder mehrere Kanten deines 3D-Körpers an und schiebe den Pfeil, um die Rundung größer oder kleiner zu machen. Rechts unter „Kanten“ macht „Von … bis“ eine Rundung, die entlang der Kante wächst – z. B. von 1 mm auf 4 mm; „Richtung tauschen“ dreht sie um.",
  "tipp": "Gerundete Ecken sehen besser aus und reißen bei Belastung seltener ein, zum Beispiel an Halterungen und Winkeln."
 },
 "chamfer": {
  "tip": "Kante im Winkel schräg anschneiden",
  "hilfe": "Klicke auf eine Kante und ziehe am Pfeil, um die scharfe Ecke durch eine gerade Schräge (Fase) zu ersetzen. Rechts unter „Kanten“ wählst du die Art: „Gleich“ (auf beiden Seiten gleich weit), „Zwei Abstände“ (z. B. 2 mm auf der einen, 4 mm auf der anderen Fläche) oder „Mit Winkel“ (Abstand und Winkel); „Seiten tauschen“ dreht sie um.",
  "tipp": "Eine kleine Fase nimmt Kanten die Schärfe – an gefrästen Platten oder Gehäusen sind die Ränder dann angenehm glatt."
 },
 "shell": {
  "tip": "Körper aushöhlen wie eine Schachtel",
  "hilfe": "Klick die Fläche an, die offen sein soll, und wähle „Aushöhlen“. Rechts unter „Wandstärke“ tippst du ein, wie dick die Wände bleiben.",
  "tipp": "Klickst du eine zweite Fläche an und wieder „Aushöhlen“, wird auch sie offen – oder wieder zu."
 },
 "patternRect": {
  "tip": "Körper in geraden Reihen kopieren",
  "hilfe": "Wähle einen Körper und dann „Muster“ → „Rechteckmuster“. Rechts stellst du Anzahl und Abstand für X und Y ein – auch mit Formeln.",
  "tipp": "Änderst du das Original, ziehen alle Kopien mit. „Auflösen“ macht das Muster wieder rückgängig."
 },
 "patternCirc": {
  "tip": "Körper gleichmäßig im Kreis kopieren",
  "hilfe": "Wähle einen Körper und dann „Muster“ → „Kreismuster“. Rechts stellst du Anzahl, Winkel und die Drehachse ein: senkrecht, quer, längs – oder „Achse im Bild wählen“ und eine gerade Kante, einen runden Rand oder eine runde Fläche (Welle, Loch) anklicken, auch schräg.",
  "tipp": "Perfekt für Lochkreise und Speichen. 360° verteilt die Kopien ganz rundherum."
 },
 "patternPath": {
  "tip": "Kopien entlang einer Kurve setzen",
  "hilfe": "Wähle einen Körper oder ein Loch und dann „Muster“ → „Muster entlang Kurve“. Zeichne die Kurve – Linie, Bogen, Spline oder Kreis – und drück „Fertig“. Rechts stellst du Anzahl, Abstand und Ausrichtung ein; „Kurve bearbeiten“ ändert die Kurve später.",
  "tipp": "Abstand 0 verteilt die Kopien gleichmäßig über die ganze Kurve. Ein Kreis als Kurve mit Ausrichtung „Mit der Kurve“ wirkt wie ein Kreismuster."
 },
 "mirror": {
  "tip": "Gespiegelte Kopie anlegen",
  "hilfe": "Wähle einen Körper und dann „Muster“ → „Gespiegelte Kopie“. Rechts wählst du die Spiegelebene und wo sie liegt.",
  "tipp": "Bei symmetrischen Teilen – etwa einem Gehäuse oder Winkel – baust du nur eine Hälfte und spiegelst sie. Das spart die halbe Arbeit."
 },
 "boolUnion": {
  "tip": "Mehrere Körper zu einem verschmelzen",
  "hilfe": "Klick mit gedrückter Umschalttaste mehrere Körper an und wähle „Boolesch“ → „Vereinigen“.",
  "tipp": "Teile, die am Ende ein einziges Bauteil sein sollen, verbindest du hiermit zu einem Körper."
 },
 "boolSubtract": {
  "tip": "Einen Körper vom anderen abziehen",
  "hilfe": "Klick zuerst das Teil an, das bleiben soll, dann mit Umschalttaste die Körper, die herausgeschnitten werden. Dann „Boolesch“ → „Abziehen“.",
  "tipp": "Damit schneidest du passgenaue Abdrücke oder Halterungen für andere Gegenstände in dein Bauteil."
 },
 "boolIntersect": {
  "tip": "Nur das gemeinsame Stück behalten",
  "hilfe": "Klick mit Umschalttaste zwei Körper an, die ineinanderstecken, und wähle „Boolesch“ → „Schnittmenge“. Übrig bleibt nur, was beide zugleich ausfüllen.",
  "tipp": "Ideal, um eine Form aus zwei Richtungen gleichzeitig zuzuschneiden."
 },
 "split": {
  "tip": "Körper an einer Ebene durchschneiden",
  "hilfe": "Wähle einen Körper und dann „Teilen“. Rechts stellst du die Schnittebene ein, wo sie liegt und welche Hälfte bleibt.",
  "tipp": "Mit „Spalt“ rücken die Hälften auseinander – praktisch, wenn ein Teil zu groß für den Drucker ist."
 },
 "section": {
  "tip": "Modell aufschneiden mit bis zu drei Ebenen",
  "hilfe": "Oben „Ansicht“ → „Schnitt“ oder Taste C. Schalte bis zu drei Schnittebenen (X, Y, Z) einzeln an oder aus und schiebe jede Lage genau ein. Geschnittene Körper erhalten eine farbige, schraffierte Kappe.",
  "tipp": "Keine Sorge: Dein Bauteil geht dabei nicht kaputt, es ist nur ein Blick ins Innere. „Kappe füllen“ lässt sich ausblenden, und mit dem Spiegelsymbol drehst du jede Ebene um."
 },
 "xray": {
  "tip": "Körper halb durchsichtig machen",
  "hilfe": "Taste X oder der Knopf rechts im Bild: Alle Körper werden wie Milchglas, Kanten sieht man auch von hinten. Ein zweiter Klick auf dieselbe Stelle wählt das Teil dahinter.",
  "tipp": "Hilft, wenn du ein Teil im Inneren eines Gehäuses anklicken willst, das sonst verdeckt ist."
 },
 "explode": {
  "tip": "Teile für die Übersicht auseinanderziehen",
  "hilfe": "Oben „Ansicht“ → „Explosion“ oder Taste U. Mit dem Regler stellst du ein, wie weit die Teile auseinanderschweben – wie in einer Bauanleitung.",
  "tipp": "Anklicken und rechts ändern geht weiter. Zum Verschieben, Zeichnen oder Bohren setzt Tracery alles von selbst wieder zusammen."
 },
 "measure": {
  "tip": "Abstände, Winkel, Flächen und Durchmesser nachmessen",
  "hilfe": "Oben „Messen“ (Taste M). Zwei Punkte an Kanten ergeben den Abstand, zwei Flächen den Abstand oder Winkel, ein Punkt und eine Fläche den senkrechten Abstand. Eine Fläche allein zeigt ihre Größe in mm².",
  "tipp": "Klickst du auf eine runde Kante, siehst du sofort den Durchmesser."
 },
 "massProps": {
  "tip": "Gewicht, Volumen und Schwerpunkt",
  "hilfe": "Klick ein Teil an: Rechts unter „Material und Gewicht“ wählst du sein Material und siehst sein Gewicht. Ohne Auswahl steht dort das Gewicht des ganzen Projekts mit dem Schwerpunkt.",
  "tipp": "Wenn es auf Gewicht und Balance ankommt, hilft dir „Schwerpunkt im Bild zeigen“, ihn direkt im Modell zu sehen."
 },
 "timeline": {
  "tip": "Verlauf aller bisherigen Arbeitsschritte",
  "hilfe": "Unten am Bildschirmrand siehst du jedes Werkzeug als kleines Symbol in der Reihenfolge, in der du es benutzt hast.",
  "tipp": "Klick auf ein Symbol, um diesen Schritt zu bearbeiten. Ein Doppelklick schiebt den Marker genau hinter diesen Schritt. Hältst du die Maus kurz über ein Symbol, siehst du, wie das Modell nach diesem Schritt aussah – der Marker bleibt, wo er ist."
 },
 "rollback": {
  "tip": "Zeitreise zurück zu früheren Bauschritten",
  "hilfe": "Fasse den farbigen Balken in der Zeitleiste an und schiebe ihn nach links vor einen bestimmten Schritt.",
  "tipp": "Wenn du etwas vergessen hast, reise in der Zeit zurück, füge es ein und schiebe den Balken wieder ganz nach rechts."
 },
 "suppress": {
  "tip": "Arbeitsschritt vorübergehend ausschalten",
  "hilfe": "Rechtsklick auf einen Schritt in der Zeitleiste und „Unterdrücken“ wählen – oder im Verlauf links auf das durchgestrichene Symbol.",
  "tipp": "Das ist viel besser als Löschen, wenn du nur mal schnell testen willst, wie dein Bauteil ohne ein bestimmtes Loch oder eine Rundung aussieht."
 },
 "params": {
  "tip": "Maße zentral mit Variablen steuern",
  "hilfe": "Lege im Tab „Maße“ eigene Namen an (z. B. wand = 3) und tippe beim Bemaßen einfach „wand“ statt einer Zahl ein.",
  "tipp": "Änderst du später den Wert in der Tabelle, passen sich alle Wände im gesamten Modell auf einen Schlag gleichzeitig an."
 },
 "focusView": {
  "tip": "Gewähltes Teil groß in einem zweiten Fenster",
  "hilfe": "Oben „Ansicht“ → „Fokus-Vorschau“. Links erscheint ein kleines Fenster, das immer das gewählte Teil allein und formatfüllend zeigt.",
  "tipp": "Im kleinen Fenster ziehen dreht nur die Vorschau, ein Doppelklick schaut wieder genauso wie die große Ansicht."
 },
 "selectFilter": {
  "tip": "Nur Körper, Flächen oder Kanten wählen",
  "hilfe": "Der Pfeil-Knopf rechts im Bild: „Nur Kanten“ macht es leicht, dünne Kanten zu treffen, „Nur Körper“ wählt immer das ganze Teil.",
  "tipp": "Vergiss nicht, den Filter wieder auf „Alles“ zu stellen – solange er an ist, leuchtet der Knopf."
 },
 "similar": {
  "tip": "Alle gleichen Teile oder Kanten dazuwählen",
  "hilfe": "Wähle ein Teil oder eine Kante und drück „Ähnliche“ oder Taste A. Gewählt wird alles mit derselben Art und denselben Maßen – zum Beispiel alle M3-Bohrungen.",
  "tipp": "Mit ähnlichen Kanten rundest du alle gleich langen Kanten mit einem Klick ab."
 },
 "versions": {
  "tip": "Stände speichern, vergleichen und zurückholen",
  "hilfe": "Projektmenü → „Versionen …“: Speichere den jetzigen Stand mit Namen. Später zeigt „Vergleichen“, was sich geändert hat – auch im Bild als roter Umriss –, und „Zurückholen“ setzt das Projekt auf diese Version.",
  "tipp": "Speichere eine Version, bevor du etwas Großes ausprobierst. Versionen kommen mit in die Projektdatei."
 },
 "droneLib": {
  "tip": "Frame-Assistent, Kaufteile und Lochbilder für Drohnen",
  "hilfe": "Oben „Drohne“: Der Frame-Assistent baut einen ganzen Rahmen. Darunter wählst du Motoren, Akkus, Videosender, Empfänger und mehr – anklicken oder auf eine Fläche ziehen. Unter „Lochbilder und Bausteine“ liegen Stack- und Motor-Lochbilder.",
  "tipp": "Kaufteile haben ihre echte Form und die Maße und das Gewicht aus dem Datenblatt. So stimmen Platz, Gewicht und Schwerpunkt schon beim Konstruieren."
 },
 "frameAssist": {
  "tip": "Drohnenrahmen in einem Schritt bauen – eigener oder nach Hersteller",
  "hilfe": "Wähle Propellergröße, Rahmenform, Stack, Motor, Videosystem und Akku. Tracery rechnet den Achsabstand so, dass zwischen den Propellern genug Luft bleibt, und warnt, wenn etwas nicht passt. Unter „Vorlage“ baust du echte Rahmen von Herstellern nach (TBS, GEPRC, iFlight, SpeedyBee, AOS RC): Achsabstand, Armdicke, Plattendicke und Stack stimmen, die Umrisse sind vereinfacht. Neue Formen: Cinewhoop mit Ducts um die Propeller und Speed-Rumpf – ein Stromlinien-Rumpf mit Kamera in der Nase, Akku innen und geneigten Motoren.",
  "tipp": "Beim Deadcat sind die vorderen Arme weiter gespreizt – dann sind die Propeller nicht im Kamerabild. Beim Speed-Rumpf stehen die Motoren schräg (Motorneigung): So liegt der Rumpf im schnellen Flug genau im Fahrtwind. Beim H-Rahmen laufen links und rechts zwei Längsträger von Motor zu Motor, vorne und hinten verbinden zwei Querträger sie mit der Mittelplatte – viel Platz in der Mitte für Akku und Elektronik. Bei True-, Stretched- und Wide-X kannst du unter „Arme“ einzelne Arme wählen (Sandwich): Jeder Arm trägt ein Viertel der Mittelplatte, darunter liegt eine Bodenplatte – ein gebrochener Arm lässt sich dann allein tauschen, und jeder Arm kommt als eigene DXF."
 },
 "holePattern": {
  "tip": "Vier Löcher für Stack oder Motor auf einmal",
  "hilfe": "Zieh ein Lochbild auf eine Fläche. Rechts wählst du Stack 30,5 / 25,5 / 20 / 16 oder einen Motor-Lochkreis, die Schraube, die Drehung und das Mittelloch.",
  "tipp": "Stack-Maße sind Quadrate, Motor-Maße sind Lochkreise – „Motor 16“ heißt: vier Löcher auf einem Kreis mit 16 mm Durchmesser."
 },
 "zipTie": {
  "tip": "Zwei Schlitze für einen Kabelbinder",
  "hilfe": "Zieh die Kabelbinder-Schlitze auf eine Fläche. Das Kabel liegt dazwischen, der Binder läuft unten durch.",
  "tipp": "Praktisch für Kabel, Schläuche und kleine Elektronik-Module."
 },
 "droneCheck": {
  "tip": "Rahmen prüfen: Propeller, Teile, Gewicht, Schwerpunkt, Schub, Flugzeit",
  "hilfe": "Drohne → „Drohnen-Check“ (oder rechts unter „Projekt“): Tracery rechnet mit dem CAD-Kern nach, ob sich die Propeller berühren, ob ein Teil in einen Propellerkreis ragt, ob Teile ineinanderstecken, wie schwer die Drohne ist, wo der Schwerpunkt liegt und – wenn du den Schub pro Motor einträgst – wie viel Schub sie im Verhältnis zum Gewicht hat. Beim Nachbau eines Herstellerrahmens vergleicht er das Rahmengewicht mit dem Original. Das geht auch mit einem selbst gebauten Rahmen: Setz mindestens drei Motoren aus „Kaufteile“ auf (gern einen Motor und ein Kreismuster) und dazu Propeller – oder trag die Propellergröße im Check ein. Heißt dein Akku zum Beispiel „Akku 6S 1300 mAh“, schätzt der Check auch die Flugzeit im Schweben.",
  "tipp": "Der Schwerpunkt sollte fast genau in der Mitte zwischen den Motoren liegen. Liegt er daneben, schiebt „Akku verschieben“ den Akku genau an die richtige Stelle. Die Flugzeit ist eine grobe Schätzung fürs ruhige Schweben – beim schnellen Fliegen hält der Akku meist nur ein Drittel bis halb so lang."
 },
 "plateDxf": {
  "tip": "Flache Platten als 2D-Zeichnung für Fräse oder Laser",
  "hilfe": "Exportieren → „Platten als DXF“: Jede flache Platte (bis 12 mm dick) kommt als eigene DXF-Datei in Originalgröße in die ZIP – Außenkontur und alle Löcher, in Millimetern. Die Plattendicke steht im Dateinamen.",
  "tipp": "Fräs- und Laserdienste brauchen genau das: eine DXF pro Platte und die Dicke. Gekaufte Teile kommen nicht mit."
 },
 "variants": {
  "tip": "Mehrere Sätze von Maßen und Schritten speichern und umschalten",
  "hilfe": "Unter „Maße“ ganz oben: „Neue Variante“ merkt sich alle Maße und welche Schritte gerade unterdrückt sind unter einem Namen, z. B. „mit Loch“ oder „ohne Loch“. Unter „Schritte in dieser Variante“ hakst du einzelne Schritte je Variante an oder ab. Mit der Auswahl schaltest du um, „Vergleichen“ zeigt die Unterschiede samt Gewicht.",
  "tipp": "Änderst du ein Maß oder unterdrückst du einen Schritt in der Zeitleiste, meldet Tracery die Abweichung – über „Überschreiben“ übernimmst du den Stand in die aktive Variante."
 },
 "explainStep": {
  "tip": "Lass dir einen Schritt erklären",
  "hilfe": "Rechtsklick auf einen Schritt in der Zeitleiste oder im Verlauf → „Erklär diesen Schritt“ (oder das ?-Symbol rechts neben dem Namen). Tracery sagt dir, was der Schritt baut, wie groß er ist, an welchen Maßen er hängt und welche Löcher er schneidet. In Claude kann die KI es noch genauer erklären.",
  "tipp": "Hängt ein Schritt an einem Maß, wandert er mit, wenn du das Maß änderst – genau das zeigt dir die Erklärung."
 },
 "weakSpots": {
  "tip": "Schwachstellen suchen: Lochrand, dünne Wände, Überhänge",
  "hilfe": "Rechts unter „Projekt“ → „Schwachstellen suchen“: Tracery prüft mit Faustregeln, ob Löcher zu nah am Rand oder aneinander liegen, ob Wände für ihr Material zu dünn sind und ob Druckteile große Überhänge haben. „Zeigen“ markiert die Stelle mit roten Ringen. In Claude erklärt die KI die Funde und schlägt Verbesserungen vor, die du mit „Umsetzen“ übernimmst.",
  "tipp": "Faustregeln ersetzen keinen Test: Grün heißt nur, dass nichts Auffälliges gefunden wurde."
 },
 "aiSteps": {
  "tip": "Schritte, die die KI gebaut hat",
  "hilfe": "Was der KI-Helfer baut, wird ein normaler Schritt in der Zeitleiste – mit einem kleinen Funken-Symbol. Überfahr ihn, dann siehst du, auf welche Bitte er entstand. Du kannst ihn wie jeden Schritt ändern, unterdrücken oder mit Strg Z zurücknehmen.",
  "tipp": "Schreib unten in die Zeile, was du willst, z. B. „Mach die Wände 3 mm dick“ oder „Bau mir ein Gehäuse 80 × 50 × 30 mit vier Schraubenlöchern“."
 },
 "levelSwitch": {
  "tip": "Einfache Oberfläche oder alle Werkzeuge",
  "hilfe": "Oben rechts (oder auf der Startseite) schaltest du zwischen „Einfach“ und „Profi“ um. Einfach zeigt nur die wichtigsten Werkzeuge: Körper, Skizze, Bauteile und Exportieren – Messen, Notizen, Ansicht und Profi-Werkzeuge findest du dann unter „Mehr“. Dein Modell bleibt gleich, es ändert sich nur, was du siehst.",
  "tipp": "Zum Anfangen ist „Einfach“ gut. Die Eingabezeile unten findet trotzdem jedes Werkzeug."
 },
 "aiCoworker": {
  "tip": "Der KI-Kollege arbeitet große Aufträge selbstständig ab",
  "hilfe": "Schreib unten in die Zeile, was passieren soll – auch große Aufträge wie „Mach alles als Verbund“, „Richte alles mittig aus“ oder „Prüf das Modell auf Schwachstellen und behebe sie“. Der KI-Kollege macht einen Plan, setzt ihn in Runden um, rechnet nach jeder Runde nach und behebt Fehler selbst. Ist etwas unklar, fragt er mit Antwort-Knöpfen zurück. „Selbstständig“ oben im Fenster schaltet das Arbeiten in Runden ab.",
  "tipp": "Der ganze Auftrag ist danach ein einziger Rückgängig-Schritt. „Alles als Verbund“ geht auch ohne KI – Kaufteile bleiben dabei einzeln, damit ihr Gewicht stimmt."
 },
 "ellipse": {
  "tip": "Ellipse vom Mittelpunkt aus",
  "hilfe": "Klick zuerst den Mittelpunkt, dann das Ende der ersten Achse – damit legst du Länge und Drehung fest. Der dritte Klick bestimmt die zweite Achse. Du kannst auch Breite und Höhe eintippen.",
  "tipp": "Gut für Griffmulden, ovale Durchbrüche und Kamera-Ausschnitte. Breite, Höhe und Drehung kannst du rechts jederzeit ändern."
 },
 "corner2d": {
  "tip": "Ecke in der Skizze runden oder fasen",
  "hilfe": "Stell rechts Rundung oder Fase und den Radius ein und klick dann auf eine Ecke – zwischen zwei Linien, an einem Rechteck oder an einem Vieleck. Beim Überfahren siehst du die Rundung schon in Orange.",
  "tipp": "Die Rundung bleibt tangential und behält ihren Radius als Maß. Ist der Radius zu groß, sagt Tracery dir, wie groß er höchstens sein darf. Unter „Art“ gibt es außerdem „Ecke bilden“: zwei Linien anklicken, und sie treffen sich genau an ihrem Schnittpunkt."
 },
 "cMid": {
  "tip": "Punkt genau in die Mitte einer Linie",
  "hilfe": "Klick einen Punkt oder Kreis an und dann die Linie. Der Punkt sitzt danach immer genau in ihrer Mitte – auch wenn du die Linie verlängerst.",
  "tipp": "Praktisch für Bohrungen, die mittig auf einer Kante sitzen sollen."
 },
 "cConcentric": {
  "tip": "Gleicher Mittelpunkt für zwei Kreise",
  "hilfe": "Klick zwei Kreise, Bögen, Vielecke oder Ellipsen an. Sie teilen sich danach denselben Mittelpunkt.",
  "tipp": "Ideal für Ringe, Senkungen und Lagersitze: Verschiebst du einen Kreis, wandert der andere mit."
 },
 "sketchText": {
  "tip": "Text als Umriss in die Skizze setzen",
  "hilfe": "Tipp rechts den Text ein, stell Höhe, Schrift und Ausrichtung ein und klick ins Bild. Der Text wird zu echten Umrissen: Liegt er in einem Rechteck, wird er beim Hochziehen ausgeschnitten (graviert) – wählst du nur die Buchstaben, stehen sie erhaben.",
  "tipp": "Die Höhe gilt für Großbuchstaben. Text, Schrift und Drehung kannst du später rechts ändern, wenn du den Text anklickst. Mit „Bogen-Radius“ läuft der Text auf einem Kreis (positiv wölbt er sich nach oben, negativ nach unten); „An Kreis legen“ setzt ihn genau auf den nächsten Kreis oder Bogen der Skizze – z. B. als Schrift am Rand einer runden Platte. Unter „Entlang“ legst du den Text auf eine Linie, einen Bogen oder eine Spline der Skizze – er folgt ihr, auch wenn du sie später änderst; „Andere Seite“ dreht ihn auf die andere Seite, „Verschieben entlang“ schiebt ihn auf der Kurve. Am besten ist die Kurve eine Hilfslinie."
 },
 "sketchImage": {
  "tip": "Foto oder Zeichnung zum Nachzeichnen hinterlegen",
  "hilfe": "Lade ein Bild, zum Beispiel ein Foto von einer Platine oder ein Datenblatt. Mit „Maßstab festlegen“ klickst du zwei Punkte an, deren echten Abstand du kennst, und tippst ihn ein – dann hat das Bild die richtige Größe. Ziehen verschiebt das Bild.",
  "tipp": "Leg für den Maßstab eine möglichst lange bekannte Strecke an, das wird genauer. Das Bild kommt nicht in den Körper und nicht in den Export."
 },
 "magnet": {
  "tip": "Teile rasten an sinnvollen Stellen ein",
  "hilfe": "Beim Ziehen und beim Setzen von Löchern rastet Tracery an der Mitte einer Fläche, an Mittellinien, an Lochmitten und im gleichen Randabstand ein. Auf runden Flächen wie Rohren, Kugeln und Zylindern rastet es „ganz oben“, „ganz unten“, an den Seiten und in der Mitte der Länge ein – das Teil steht dann genau senkrecht auf der Rundung. Körper rasten bündig oder mittig zu anderen Körpern ein. Rosa Hilfslinien zeigen, woran.",
  "tipp": "Halte Strg (Mac: cmd) gedrückt, um frei ohne Einrasten zu ziehen. Ganz abschalten kannst du es im Projekt rechts unter „Fangen beim Verschieben“."
 },
 "importCad": {
  "tip": "Projekt-, STEP-, IGES-, BREP-, STL-, 3MF-, OBJ-, DXF- oder SVG-Datei öffnen bzw. ins Fenster ziehen",
  "hilfe": "Über „Datei öffnen“ oder einfach ins Fenster ziehen (beim Ziehen erscheint ein Hinweis-Rahmen): Eine Projektdatei (.json) öffnet das Projekt. Eine .step-, .stp-, .igs-, .iges-, .brep-, .stl-, .3mf- oder .obj-Datei wird als Teil ins Projekt geladen – bei .3mf und .obj entstehen für mehrere Objekte eigene Teile (bei .3mf mit Farben und umgerechneter Maßeinheit). Bei STEP, IGES, BREP, STL und OBJ stellst du rechts ein, in welcher Einheit die Datei gemessen ist. Eine .dxf-Datei (2D-Zeichnung, zum Beispiel ein Platten-Umriss) wird eine 3 mm dicke Platte: Der Umriss liegt als Skizze dahinter und lässt sich mit „Skizze bearbeiten“ ändern, Löcher bleiben Löcher. Eine .svg-Datei (zum Beispiel ein Logo) wird genauso eine dünne Platte (1 mm) – als „Loch“ in eine andere Platte gesetzt ergibt das eine Gravur.",
  "tipp": "STEP, IGES und BREP sind genauer als STL, 3MF und OBJ: Kanten lassen sich runden und Bohrungen erkennen. BREP ist das direkte Format des OpenCascade-Kerns (verlustfrei, auch für FreeCAD), IGES hilft bei älteren CAD-/CAM-Programmen. STL, 3MF und OBJ sind Dreiecksnetze und eignen sich vor allem zum Anschauen, Ausrichten oder Weiterbearbeiten von Druckmodellen (3MF bringt Farben und Teile-Namen direkt mit). DXF muss als Text (ASCII) gespeichert sein; Zoll, Zentimeter und Meter werden in Millimeter umgerechnet. Zeichnungen in Blöcken vorher im anderen Programm auflösen. In SVG-Dateien muss Text vorher in Pfade umgewandelt sein. Stimmt die Größe nicht: „Skizze bearbeiten“ und rechts unter „Größe der Skizze“ die Breite eintippen – alles wächst mit. Ist gerade eine Skizze offen, landet die DXF oder SVG in dieser Skizze statt als neue Platte – praktisch für ein Logo auf einer Fläche."
 },
 "sketchTemplate": {
  "tip": "Fertige Umrisse mit echten Maßen einsetzen",
  "hilfe": "Wähle rechts eine Schablone – Pin-Raster, Lüftungsgitter, ein Chip-Gehäuse (QFP, QFN, BGA, SOIC, DIP), einen USB-C-Ausschnitt oder Befestigungslöcher – und stell Anzahl, Raster und Größen ein. Ein Klick ins Bild setzt sie mit der Mitte an diese Stelle; am Nullpunkt oder an Mittelpunkten rastet sie ein.",
  "tipp": "Für einen Chip das Gehäuse hochziehen und die Pins als eigene Flächen etwas niedriger – oder alles als Aussparung für einen Halter. Beim USB-C-Ausschnitt: „Buchse“, wenn die Buchse bündig an der Wand sitzt, „Stecker“, wenn sie dahinter liegt und der Stecker samt Gummikappe hinein muss. Die Standardmaße bitte mit dem Datenblatt vergleichen."
 },
 "extend2d": {
  "tip": "Linie bis zur nächsten Kante verlängern",
  "hilfe": "Klick nahe an das Ende einer Linie. Sie wächst geradeaus bis zur nächsten Linie, zum nächsten Bogen oder Kreis und hängt dort per Regel fest – beim Überfahren siehst du es gestrichelt.",
  "tipp": "Das Gegenstück zu „Trimmen“: Zusammen schließt du damit Umrisse schnell, ohne Punkte genau treffen zu müssen."
 },
 "draft": {
  "tip": "Seitenwände schräg stellen (Entformungsschräge)",
  "hilfe": "„Schräge“ unter „Kanten“ neigt alle senkrechten Seitenwände des Körpers um den eingestellten Winkel (Standard 3°). Die Unterseite behält ihre Form, nach oben wird der Körper schmaler.",
  "tipp": "Wichtig für Gussformen und Silikonteile: Mit 1–3° lässt sich ein Teil viel leichter aus der Form lösen. Negative Winkel machen ihn nach oben breiter."
 },
 "threadRod": {
  "tip": "Außengewinde zum Drucken",
  "hilfe": "Ein Bolzen mit echtem metrischem Gewinde (M3 bis M16). Verbinde ihn mit einem Körper, z. B. für einen Schraubdeckel oder ein Stativgewinde.",
  "tipp": "Unter M5 werden gedruckte Gewinde selten sauber – dort lieber Gewindeeinsätze oder echte Schrauben nehmen."
 },
 "threadHole": {
  "tip": "Innengewinde zum Drucken",
  "hilfe": "Ein Loch mit echtem metrischem Innengewinde und etwas Spiel, damit eine normale Schraube oder ein gedruckter Bolzen hineinpasst.",
  "tipp": "Das Spiel (Standard 0,3 mm) hängt vom Drucker ab: Klemmt es, mach es größer; wackelt es, kleiner."
 },
 "split2d": {
  "tip": "Linie oder Bogen in zwei Stücke teilen",
  "hilfe": "Klick auf eine Linie oder einen Bogen. An dieser Stelle (sie fängt an Mitte und Schnittpunkten) wird das Element geteilt. Beide Stücke bleiben verbunden und in einer Flucht.",
  "tipp": "Praktisch, wenn nur ein Teil einer Kante ein Maß oder eine Rundung bekommen soll."
 },
 "point": {
  "tip": "Einzelner Punkt in der Skizze",
  "hilfe": "Klick setzt einen Punkt. Er bildet keine Fläche, ist aber ein fester Bezug: Maße zu anderen Punkten oder Linien, Regeln wie „Mittig“ oder „Deckungsgleich“. Liegt die Skizze auf einer Körperfläche und enthält nur Punkte, wird beim „Fertig“ an jedem Punkt eine Bohrung gesetzt – Art und Größe wählst du im Bohrungs-Assistenten.",
  "tipp": "Praktisch für Lochbilder mit genauen Maßen, z. B. vier Befestigungslöcher auf einer Platte: vier Punkte setzen, bemaßen, „Fertig“ – fertig sind die vier Schraubenlöcher."
 },
 "chainEdges": {
  "tip": "Kantenkette wählen",
  "hilfe": "Wähle eine Kante und klick „Kette“: Alle Kanten, die ohne Knick weiterlaufen – etwa ein Umriss mit gerundeten Ecken – kommen dazu.",
  "tipp": "Danach „Abrunden“ oder „Abschrägen“ – so rundest du einen ganzen Rand in einem Schritt."
 },
 "goproMount": {
  "tip": "Halterung für GoPro und andere Action-Kameras",
  "hilfe": "Finger mit Loch für die M5-Rändelschraube auf einer Grundplatte. 3 Finger passen zur Kamera (sie hat 2), 2 Finger zu einer Halterung mit 3. Am äußeren Finger sitzt eine Nabe mit Sechskant-Tasche für die M5-Mutter.",
  "tipp": "Die Vorgaben (Finger 3 mm, Spalt 3,2 mm, Loch 5,2 mm) beruhen auf Messungen an Original-Halterungen plus etwas Spiel – drucke einmal zur Probe, am besten in TPU."
 },
 "xt60Holder": {
  "tip": "Platte, die einen Akkustecker festhält",
  "hilfe": "Ausschnitt in der Form eines XT60 (zwei abgeschrägte Ecken) mit Spiel, dazu zwei Schraubenlöcher. Für andere Stecker Breite, Höhe und Abschrägung ändern.",
  "tipp": "Die Steckermaße sind Schätzwerte – miss deinen Stecker nach. Mit 0,2 bis 0,3 mm Spiel sitzt er stramm."
 },
 "antennaMount": {
  "tip": "Röhrchen, die Antennen in Form halten",
  "hilfe": "Eine Grundplatte mit einem oder zwei Röhrchen. Spreizung (V-Winkel zwischen den Röhrchen) und Neigung nach hinten sind einstellbar, den Innen-Ø passt du an deine Antenne an.",
  "tipp": "Für zwei Empfangsantennen 90° Spreizung, dann liegen sie über Kreuz und der Empfang bleibt auch in Kurven gut. Am besten in TPU drucken."
 },
 "overhang": {
  "tip": "Zeigt, wo beim 3D-Druck Stützen nötig sind",
  "hilfe": "Färbt alle Flächen rot, die steiler als der Grenzwinkel nach unten zeigen und nicht auf dem Druckbett liegen – dort hängt das Material beim Drucken in der Luft. Das Druckbett ist die Unterseite deiner Teile. Unten steht, wie viel Fläche Stützen braucht.",
  "tipp": "45° schaffen die meisten Drucker ohne Stützen. Wird viel rot: Teil anders hinlegen, eine Fase statt einer waagerechten Kante, oder in zwei Teile teilen."
 },
 "wind": {
  "tip": "Stirnfläche: so viel Fläche zeigt die Drohne dem Fahrtwind",
  "hilfe": "Ansicht → „Fahrtwind (Stirnfläche)“: Die Kamera schaut aus der Richtung, aus der der Wind kommt, wenn die Drohne nach vorne fliegt. Mit „Neigung“ kippst du die Drohne wie im schnellen Flug mit der Nase nach unten. Unten steht die Fläche, die sie dem Wind zeigt – Tracery misst sie genau aus dem Schattenriss. Propeller zählen nur mit, wenn du das Häkchen setzt. Mit „Form“ (cw-Wert) und „Tempo“ rechnet Tracery den Luftwiderstand in Newton und die Leistung dafür aus. Steht im Drohnen-Check der Schub pro Motor, schätzt es auch die Höchstgeschwindigkeit.",
  "tipp": "Vergleich zwei Varianten bei der gleichen Neigung: Die mit der kleineren Stirnfläche bremst weniger. Der cw-Wert ist ein Richtwert – ein offener Rahmen bremst etwa doppelt so stark wie ein Stromlinien-Rumpf mit gleicher Fläche. Die Höchstgeschwindigkeit ist eine obere Grenze: Propeller schieben bei hohem Tempo weniger als auf dem Prüfstand."
 },
 "route3d": {
  "tip": "Rohr durch Punkte im Raum – auf Körpern oder frei",
  "hilfe": "Körper → „Rohr im Raum“: Klick nacheinander Punkte an. Auf einem Körper liegt das Rohr auf der Fläche auf, daneben bleibt es auf der Höhe des letzten Punkts. Ziehen dreht die Ansicht wie immer, Rückschritt nimmt den letzten Punkt weg, Enter oder Doppelklick ist fertig. Rechts änderst du jeden Punkt als Zahl, den Durchmesser, die Wand und den Querschnitt. Zwischen zwei Punkten gibt es Regeln wie in einer Skizze, nur im Raum: „entlang X/Y/Z“ legt das Stück genau auf eine Achse, „rechtwinklig“ oder „parallel zum vorigen“ richtet es am Stück davor aus, „Länge“ macht es genau so lang – die Punkte dahinter wandern mit. Ist das Rohr gewählt, steht an jedem Stück seine Länge im Bild – anklicken, Zahl tippen, Enter: dann ist sie fest (🔒). Punkte, die du auf einen Körper klickst, hängen an ihm: Verschiebst oder drehst du den Körper, wandert der Punkt mit („lösen“ rechts macht ihn wieder frei).",
  "tipp": "Gut für Kabelkanäle, Leitungen und Bügel, die um Teile herum laufen. „Gerade Stücke, runde Ecken“ ergibt einen Knick-Verlauf wie bei gebogenem Rohr. Zum Beispiel das erste Stück „entlang Z“ mit 25 mm Länge, das zweite „entlang Y“ mit 15 mm – dann steht es genau senkrecht und knickt genau im rechten Winkel ab. Eine Länge 0 macht das Stück wieder frei."
 },
 "armFairing": {
  "tip": "Stromlinien-Hülle über einen Arm (Speed-Drohne)",
  "hilfe": "Drohne → „Lochbilder und Bausteine“ → „Armverkleidung“: eine Hülle mit Tropfenprofil, die über einen Arm geschoben wird. Gib Armbreite und Armdicke ein – Tracery macht das Profil genau so dick, dass der Arm mit der eingestellten Wand hineinpasst (0,15 mm Spiel je Seite). Die Hülle liegt längs der X-Achse, die runde Nase zeigt nach vorne; dreh sie mit dem Arm mit.",
  "tipp": "Das Profil ist die genormte NACA-Form mit der dicksten Stelle bei 30 % der Tiefe. Eine größere Profiltiefe macht die Hülle schlanker. Ob sie wirklich schneller macht, zeigt dir die Ansicht „Fahrtwind“ nur über die Fläche – den Luftwiderstand misst Tracery nicht."
 },
 "motorFairing": {
  "tip": "Stromlinien-Becher um einen Motor (Speed-Drohne)",
  "hilfe": "Drohne → „Lochbilder und Bausteine“ → „Motorverkleidung“: ein Becher, der von unten über Arm und Motor geschoben wird. Oben ist er offen für den Propeller, unten läuft er als Heck spitz zu, seitlich hat er einen Schlitz für den Arm (0,15 mm Spiel je Seite). Gib Motor-Durchmesser, Motorhöhe, Armbreite und Armdicke ein. Der Motorfuß sitzt auf Höhe 0, der Schlitz zeigt nach +X – dreh die Hülle, bis er zum Arm passt.",
  "tipp": "Zum Drucken stell die Hülle auf den oberen Rand (Spitze nach oben), dann braucht sie keine Stützen. Ein langes Heck (etwa so lang wie der Motor breit ist oder länger) lässt die Luft sauber abfließen; „Luft um den Motor“ hält Abstand zur drehenden Glocke – nimm nicht weniger als 0,5 mm. Die Motorkabel laufen durch den Arm-Schlitz."
 },
 "bom": {
  "tip": "Alle Teile mit Anzahl und Gewicht als Liste",
  "hilfe": "Rechts unter „Projekt“ → „Stückliste“: eine Tabelle mit allen Teilen ganz oben im Verlauf – Name, Anzahl, Art (Kaufteil oder Material) und Gewicht. Gleiche Teile wie „Fuß 1“ bis „Fuß 4“ stehen in einer Zeile. Ein Klick auf eine Zeile wählt die Teile im Bild aus. Mit „Als Tabelle speichern“ bekommst du eine CSV-Datei, die Excel, Numbers und Google Tabellen öffnen. Darunter steht, wie viele Schrauben, Muttern und Gewindeeinsätze du brauchst – gezählt aus deinen Schraubenlöchern und Lochbildern.",
  "tipp": "Die Liste ist deine Einkaufs- und Wiegeliste: Kaufteile zum Bestellen, Platten zum Fräsen, Druckteile zum Drucken. Steht bei einem Kaufteil „fehlt“, trag sein Gewicht rechts in den Eigenschaften ein."
 },
 "look": {
  "tip": "Wie die Teile aussehen: Studio-Look, einfach oder Prüfansicht",
  "hilfe": "Ansicht → unten im Menü. „Studio-Look“ zeigt jedes Teil in seinem Werkstoff: Alu und Stahl glänzen und spiegeln das Licht, Kohlefaser ist dunkel mit Klarlack, Polycarbonat ist durchsichtig, Kunststoffe behalten ihre Farbe. Dazu kommen weiche Schatten auf dem Boden. Mit „Licht“ wählst du die Stimmung (Studio, Hell, Werkstatt). „Einfach“ ist matt und am schnellsten. Die Prüfansichten „Ton“ und „Chrom-Streifen“ zeigen, ob Flächen glatt sind.",
  "tipp": "Den Werkstoff wählst du rechts bei einem Teil unter „Material“, für das ganze Projekt in den Projekt-Eigenschaften. Eine eigene Farbe (bunter Kreis bei den Farben) überschreibt die Werkstoff-Farbe, „Farbe vom Werkstoff“ nimmt das zurück."
 },
 "bodyOp": {
  "tip": "Teil als eigenen Körper lassen oder mit einem anderen verrechnen",
  "hilfe": "Rechts unter „Körper“ wählst du, was mit dem Teil passiert: „Eigener Körper“ lässt es allein. „Vereinigen mit …“ verschmilzt es mit einem früheren Körper zu einem Teil ohne Naht. „Abziehen von …“ schneidet es nur aus diesem einen Körper heraus – anders als ein Loch, das alles schneidet, was es trifft. „Schnittmenge mit …“ lässt nur das Stück übrig, das in beiden steckt.",
  "tipp": "Das verrechnete Teil bleibt im Verlauf und lässt sich weiter ändern – im Bild siehst du nur den fertigen Körper. Im Verlauf steht dahinter ∪, − oder ∩ und der Name des Zielkörpers."
 },
 "thruAll": {
  "tip": "Loch oder Abzieh-Schritt geht durch das ganze Modell",
  "hilfe": "Mit dem Haken „Durch alles“ ist die Tiefe so groß, dass der Schritt sicher durch alle Körper geht. Wird dein Modell später größer, wächst die Tiefe von selbst mit.",
  "tipp": "„Beidseitig verschieden“ zieht die Skizze in beide Richtungen, mit einer eigenen Höhe für jede Seite."
 },
 "display": {
  "tip": "Wie Körper gezeichnet werden: Flächen, Kanten, Drahtgitter",
  "hilfe": "Ansicht → unten im Menü: „Flächen mit Kanten“ (Standard), „Nur Flächen“ (ruhiger, für Bilder), „Drahtgitter“ (nur Kanten, du siehst durch alles hindurch) und „Verdeckte Kanten zeigen“ (Körper halb durchsichtig, alle Kanten sichtbar).",
  "tipp": "Im Drahtgitter kannst du Teile weiter anklicken – das gewählte Teil wird leicht eingefärbt."
 },
 "savedViews": {
  "tip": "Blickwinkel speichern und wieder aufrufen",
  "hilfe": "Ansicht → „Ansicht speichern …“ merkt sich den Blickwinkel, den Ausschnitt und ob orthografisch. Die Ansicht wird im Projekt gespeichert und steht danach im selben Menü zum Anklicken.",
  "tipp": "Rechtsklick auf eine ebene Fläche → „Blick senkrecht auf die Fläche“ dreht die Ansicht genau von vorne auf diese Fläche."
 },
 "opacity": {
  "tip": "Teil durchsichtig machen",
  "hilfe": "Rechts bei den Farben: „Sichtbarkeit“ unter 100 % macht das Teil durchsichtig – praktisch für Gehäuse, in die man hineinsehen will. Das ändert nur die Anzeige, nicht das Teil.",
  "tipp": "Für einen kurzen Blick durch alles ist das Röntgen (Taste X) schneller."
 },
 "datum": {
  "tip": "Eigene Ebene zum Skizzieren anlegen",
  "hilfe": "Skizze → „Neue Bezugsebene …“: Eine Ebene mit Abstand zur Arbeitsfläche, nach vorne oder zur Seite, auch geneigt; oder mit Abstand zu einer ebenen Fläche, die du vorher anklickst – dann wandert die Ebene mit, wenn sich der Körper ändert. Dazu „Mittig zwischen zwei Flächen“ und „Durch drei Punkte“. Die Ebenen stehen im Verlauf unter „Bezugsebenen“.",
  "tipp": "Doppelklick auf eine Bezugsebene im Verlauf startet gleich eine Skizze darauf."
 },
 "faceColor": {
  "tip": "Einzelne Fläche einfärben",
  "hilfe": "Klick eine Fläche an – rechts erscheint „Farbe dieser Fläche“. Wähl einen Ton oder mit dem bunten Kreis jede Farbe. Die Farbe gilt nur für die Anzeige, für Bilder und für Präsentationen.",
  "tipp": "Ändert sich das Teil, findet Tracery ebene Flächen über ihre Richtung und Lage wieder. „Flächenfarbe entfernen“ nimmt die Farbe zurück."
 },
 "textCurves": {
  "tip": "Buchstaben zu Linien und Kurven machen",
  "hilfe": "In der Skizze einen Text anklicken → „In Kurven umwandeln“. Danach sind die Buchstaben normale Linien und Splines: Du kannst sie trimmen, versetzen (z. B. für eine Gravur mit Rand) oder einzelne Punkte verschieben.",
  "tipp": "Danach lässt sich der Text nicht mehr als Text ändern – Rückgängig holt ihn zurück."
 },
 "sketchMeasure": {
  "tip": "Fläche und Umfang der Skizze",
  "hilfe": "Rechts in der Skizze (Werkzeug Auswahl, nichts gewählt) steht die Fläche aller geschlossenen Formen – Löcher abgezogen – und der Umfang, Lochränder mitgezählt.",
  "tipp": "Der Umfang ist zum Beispiel die Schnittlänge für Laser oder Fräse."
 },
 "stdScrew": {
  "tip": "Echte Schraube nach Norm (M1.6–M24)",
  "hilfe": "Bauteile → „Schraube (Norm)“: Zylinderkopf (ISO 4762), Sechskantkopf (ISO 4017) oder Senkkopf (ISO 10642, ab M3; M24 DIN 7991). Größe M1.6 bis M24 und Länge wählst du rechts. Der Kopf sitzt auf der Fläche, der Schaft zeigt nach unten.",
  "tipp": "Normteile sind aus Edelstahl und zählen mit ihrem Gewicht in der Stückliste. Das Gewinde ist nur angedeutet – für ein gedrucktes Gewinde nimm „Gewindebolzen“."
 },
 "stdNut": {
  "tip": "Sechskantmutter nach Norm (M1.6–M24)",
  "hilfe": "Bauteile → „Mutter (Norm)“: Sechskantmutter ISO 4032, M1.6 bis M24.",
  "tipp": "Normteile sind aus Edelstahl und zählen mit ihrem Gewicht in der Stückliste. Das Gewinde ist nur angedeutet – für ein gedrucktes Gewinde nimm „Gewindebolzen“."
 },
 "stdWasher": {
  "tip": "Unterlegscheibe nach Norm (M1.6–M24)",
  "hilfe": "Bauteile → „Scheibe (Norm)“: Unterlegscheibe ISO 7089, M1.6 bis M24.",
  "tipp": "Normteile sind aus Edelstahl und zählen mit ihrem Gewicht in der Stückliste. Das Gewinde ist nur angedeutet – für ein gedrucktes Gewinde nimm „Gewindebolzen“."
 },
 "minDistance": {
  "tip": "Kleinster Abstand zwischen zwei Teilen",
  "hilfe": "Wähl zwei Teile (Umschalt + Klick). Rechts steht der kleinste Abstand zwischen ihnen – genau aus dem CAD-Kern – und im Bild zeigt eine gestrichelte Linie, wo er liegt.",
  "tipp": "„berühren sich“ heißt Abstand 0 – die Teile stoßen aneinander oder stecken ineinander."
 },
 "bboxSize": {
  "tip": "Länge, Breite und Höhe des Teils",
  "hilfe": "Die Hüllmaße sind die Größe der kleinsten achsparallelen Kiste, in die das Teil passt – praktisch für Verpackung oder das Druckbett.",
  "tipp": "Die Oberfläche steht darüber – zum Beispiel für Lack oder Beschichtung."
 },
 "linkedCopy": {
  "tip": "Kopie, die dem Original folgt",
  "hilfe": "„Verknüpft duplizieren“ (Strg Umschalt D oder Rechtsklick) legt eine Kopie an, die ihre Form vom Original bekommt: Änderst du Maße oder Rundungen am Original, ändern sich alle verknüpften Kopien mit. Lage, Name, Farbe und Werkstoff bleiben bei jeder Kopie eigen.",
  "tipp": "„Verknüpfung lösen“ macht aus der Kopie wieder ein eigenes Teil. Im Verlauf erkennst du verknüpfte Kopien am ↔."
 },
 "dependencies": {
  "tip": "Worauf das Teil aufbaut und was daran hängt",
  "hilfe": "Unter „Bezüge“ siehst du, mit welchen Teilen dieses Teil zusammenhängt: wovon es abgezogen oder womit es vereinigt wird, wessen Kopie es ist, von wem eine Skizze Kanten übernimmt – und andersherum, welche Teile und Bezugsebenen an diesem Teil hängen. Ein Klick auf eine Zeile wählt das andere Teil.",
  "tipp": "Bevor du ein Teil löschst, schau hier nach. Löschst du es trotzdem, behalten die abhängigen Teile ihre letzte Form, und Tracery sagt dir, welche es waren."
 },
 "cCollinear": {
  "tip": "Zwei Linien auf derselben Geraden",
  "hilfe": "Klicke zwei Linien nacheinander an. Danach liegen beide auf einer gemeinsamen Geraden – wie die zwei Stücke einer Kante, die von einem Ausschnitt unterbrochen wird. Zieht man an einer, wandert die andere mit.",
  "tipp": "Die Linien müssen sich nicht berühren. Für Linien, die nur in dieselbe Richtung zeigen sollen, nimm „Parallel“."
 },
 "refDim": {
  "tip": "Maß nur zum Ablesen",
  "hilfe": "Ein Maß in Klammern legt nichts fest. Es zeigt nur, wie groß etwas gerade ist, und ändert sich mit, wenn du die Skizze änderst. Im Maß-Feld macht der Knopf „( )“ aus einem Maß ein Maß zum Ablesen. Liegt ein Wert schon durch andere Maße fest, legt Tracery das neue Maß gleich so an.",
  "tipp": "Praktisch für eine Gesamtlänge, die sich aus Einzelmaßen ergibt. Klickst du ein Maß in Klammern an und tippst einen Wert, wird es wieder ein festes Maß – wenn das zu den anderen Regeln passt."
 },
 "copyValue": {
  "tip": "Messwert kopieren",
  "hilfe": "Wählst du eine Kante, steht oben in der Leiste ihre Länge – bei mehreren Kanten die Summe, bei einem Kreis oder einer runden Fläche der Durchmesser. Ein Klick auf diesen Wert kopiert ihn. Auch die Schilder beim Messen kopieren ihren Wert, wenn du sie anklickst.",
  "tipp": "Mit Strg V fügst du den Wert in jedes Maß-Feld ein, zum Beispiel um ein neues Teil genauso lang zu machen."
 },
 "viewBack": {
  "tip": "Zurück zur vorigen Ansicht",
  "hilfe": "Tracery merkt sich die letzten 40 Blickwinkel – nach dem Drehen, Zoomen, einer Standard-Ansicht oder „Heranzoomen“. Umschalt Z (oder Rechtsklick ins Leere → „Vorige Ansicht“) springt Schritt für Schritt zurück.",
  "tipp": "Hast du dich verdreht, kommst du so schnell wieder zu dem Blick, den du vorher hattest. Für Blicke, die du öfter brauchst, nimm „Ansicht speichern“."
 },
 "selectBehind": {
  "tip": "Teil dahinter wählen",
  "hilfe": "Liegt ein Teil vor dem, das du willst, halte Alt gedrückt und klick: Tracery wählt das nächste Teil an dieser Stelle dahinter. Noch ein Alt-Klick geht noch eine Ebene tiefer, am Ende wieder nach vorne. Im Rechtsklick-Menü stehen die Teile dahinter auch mit Namen.",
  "tipp": "Praktisch bei Gehäusen: So wählst du die Platine im Inneren, ohne den Deckel auszublenden."
 },
 "faceEdges": {
  "tip": "Alle Kanten einer Fläche",
  "hilfe": "Wähl eine Fläche und klick oben in der Leiste auf „Ihre Kanten“. Dann kannst du alle Kanten rund um diese Fläche auf einmal wählen, abrunden oder abschrägen – zum Beispiel die ganze Oberkante eines Gehäuses.",
  "tipp": "Nach dem Abrunden änderst du den Radius rechts beim Teil. Mit „Kanten wählen“ kannst du vorher noch einzelne Kanten mit Umschalt + Klick dazu- oder abwählen."
 },
 "stepNote": {
  "tip": "Notiz zu diesem Schritt",
  "hilfe": "Schreib dir auf, warum ein Schritt so ist, wie er ist. Die Notiz steht rechts beim Teil und erscheint in der Zeitleiste, wenn du mit der Maus über den Schritt fährst. Ein kleiner Punkt am Schritt zeigt, dass es eine Notiz gibt.",
  "tipp": "Gut für Maße, die man später nicht mehr versteht – und für alle, mit denen du das Projekt teilst."
 },
 "xmove": {
  "tip": "Verschieben oder drehen mit genauen Werten",
  "hilfe": "Klick in der Skizze die Elemente an, die sich bewegen sollen (nochmal klicken wählt ab). Rechts stellst du ein: verschieben um X und Y oder drehen um einen Winkel – um die Mitte der Auswahl oder einen Punkt, den du wählst. Mit „Als Kopie“ bleibt das Original stehen. Enter oder der Knopf führt es aus.",
  "tipp": "Feste Maße für X und Y wandern beim Verschieben mit. Wird ein Rechteck schräg gedreht, wird es zu vier Linien."
 },
 "coords": {
  "tip": "Lage unter der Maus",
  "hilfe": "Unten rechts steht, wo die Maus gerade ist: auf einem Körper die Lage auf seiner Oberfläche, daneben auf dem Boden (Z = 0), in einer Skizze X und Y der Skizze – mit Einrasten, so wie der nächste Klick gesetzt würde.",
  "tipp": "Praktisch, um schnell zu sehen, ob etwas wirklich bei null beginnt oder wie hoch eine Fläche liegt."
 },
 "exportSelection": {
  "tip": "Nur einen Teil exportieren",
  "hilfe": "Ist beim Exportieren etwas gewählt, kannst du nur diese Teile in die Dateien schreiben. Löcher und Formschritte, die in die gewählten Teile schneiden, zählen trotzdem mit. Mit „Jeder Körper als eigene Datei“ kommt zusätzlich ein Ordner „Einzeln“ ins ZIP – eine STL bzw. 3MF pro Körper, benannt nach dem Teil.",
  "tipp": "Für den 3D-Druck: Einzelne Dateien lassen sich im Slicer getrennt drehen und anordnen."
 },
 "sketchExport": {
  "tip": "Skizze als 2D-Datei",
  "hilfe": "„Als DXF speichern“ schreibt die Skizze in Originalgröße (Millimeter) für Laser, Fräse oder ein anderes CAD. „Als SVG speichern“ ist für Plotter, Schneideplotter und Grafikprogramme. Hilfslinien und Punkte kommen nicht mit.",
  "tipp": "Die Knöpfe stehen rechts, wenn nichts in der Skizze gewählt ist."
 },
 "faceExport": {
  "tip": "Fläche als 2D-Datei",
  "hilfe": "Rechtsklick auf eine ebene Fläche eines Körpers → „Fläche als DXF speichern“ oder „… als SVG“. Du bekommst den Umriss dieser Fläche samt Löchern in Originalgröße, so als würdest du senkrecht darauf schauen.",
  "tipp": "Praktisch für Platten und Bleche, die gelasert oder gefräst werden, und für Schablonen zum Ausdrucken."
 },
 "thinWalls": {
  "tip": "Zu dünne Stellen zeigen",
  "hilfe": "Ansicht → „Wandstärke (3D-Druck)“ färbt alle Stellen rot, an denen das Teil dünner ist als die gewählte Grenze – gemessen senkrecht von der Oberfläche nach innen. Unten steht, wie viel Fläche betroffen ist und wie dünn die dünnste Stelle ist. Beim Messen zeigt ein Klick auf eine Fläche auch die Wandstärke genau dort.",
  "tipp": "Mit einer 0,4-mm-Düse sollten Wände mindestens 0,8 bis 1,2 mm haben, tragende Teile eher 2 mm und mehr."
 },
 "inertia": {
  "tip": "Wie schwer sich das Teil drehen lässt",
  "hilfe": "Die Trägheitsmomente sagen, wie viel Kraft es braucht, das Teil um seinen Schwerpunkt zu drehen – um die X-, die Y- und die Z-Richtung. Sie hängen vom Material und davon ab, wie weit die Masse vom Schwerpunkt entfernt liegt. Einheit: g·cm².",
  "tipp": "Wichtig für alles, was sich dreht oder schnell lenkt: Räder, Rotoren, Arme. Masse nah am Schwerpunkt macht ein Teil wendiger."
 },
 "stability": {
  "tip": "Steht das Teil oder kippt es?",
  "hilfe": "So wie das Teil gerade liegt: Liegt der Schwerpunkt über der Fläche, auf der es steht, steht es. Der Winkel sagt, wie weit man es neigen kann, bevor es umfällt. „Kippt um“ heißt: Der Schwerpunkt liegt neben der Standfläche.",
  "tipp": "Ein tiefer Schwerpunkt und eine breite Standfläche machen ein Teil standfester – zum Beispiel ein schwerer Fuß oder ein breiterer Boden."
 },
 "treeFilter": {
  "tip": "Im Verlauf suchen",
  "hilfe": "Ab sechs Schritten steht über dem Verlauf ein Suchfeld. Es findet Schritte nach Name, Art (zum Beispiel „Zylinder“) und Notiz. Daneben wählst du, was gezeigt wird: nur Körper, nur Löcher, ausgeblendete Teile, Schritte mit Fehler, mit Notiz oder von der KI. Gruppen mit Treffern klappen von selbst auf.",
  "tipp": "Esc im Suchfeld leert es wieder."
 },
 "paramsCsv": {
  "tip": "Maße als Tabelle tauschen",
  "hilfe": "„Als CSV speichern“ schreibt alle Maße mit Namen, Wert und Ergebnis in eine Tabelle, die Excel, Numbers oder LibreOffice öffnen. „CSV laden“ liest so eine Tabelle wieder ein: Maße mit bekanntem Namen werden geändert, neue kommen dazu. Es zählen die ersten beiden Spalten: Name und Wert (Zahl oder Formel).",
  "tipp": "So kannst du Maße in der Tabellenkalkulation vorbereiten oder zwischen Projekten tauschen."
 },
 "selSets": {
  "tip": "Auswahl merken",
  "hilfe": "Wähl mehrere Teile aus, Rechtsklick → „Auswahl speichern …“ und gib ihr einen Namen. Später wählt Rechtsklick ins Leere → „Auswahl: Name“ genau diese Teile wieder. Die Auswahl wird mit dem Projekt gespeichert.",
  "tipp": "Praktisch für Teile, die du immer wieder zusammen ausblendest, verschiebst oder exportierst."
 },
 "exportSettings": {
  "tip": "Feinheit und Format der Netze",
  "hilfe": "STL und 3MF beschreiben die Form mit Dreiecken. „Feinheit“ bestimmt, wie viele: Grob gibt kleine Dateien mit sichtbaren Kanten an Rundungen, Sehr fein glatte Rundungen und große Dateien. STEP ist davon nicht betroffen – es bleibt immer exakt. Das STL-Format „Text“ brauchen nur wenige ältere Programme.",
  "tipp": "Für den 3D-Druck reicht fast immer „Normal“. Für Renderings großer, runder Teile lohnt „Fein“."
 },
 "slowSteps": {
  "tip": "Welcher Schritt ist langsam?",
  "hilfe": "Im Protokoll zeigt „Rechenzeit je Schritt“ die fünf Schritte, die beim letzten Neurechnen am längsten gebraucht haben. Ein Klick wählt den Schritt. So findest du, was ein großes Modell träge macht.",
  "tipp": "Typische Zeitfresser: Rundungen über sehr viele Kanten, echte Gewinde und Muster mit vielen Kopien. Ein Gewinde kannst du zum Beispiel erst am Ende einschalten."
 },
 "edgeRules": {
  "tip": "Kanten nach Art wählen",
  "hilfe": "„Alle äußeren Kanten“ wählt jede Kante, an der das Teil nach außen eine Ecke hat – die typischen Kanten zum Abrunden. „Alle inneren Kanten“ wählt die Kehlen, zum Beispiel wo eine Wand auf den Boden trifft. Glatte Übergänge (etwa am Rand einer Rundung) zählen zu keiner der beiden.",
  "tipp": "Innere Kanten mit einer kleinen Rundung machen Druckteile deutlich stabiler."
 },
 "replaneSketch": {
  "tip": "Skizze auf eine andere Ebene legen",
  "hilfe": "Rechts beim Teil unter „Skizze umhängen“ wählst du eine andere Ebene – eine Grundebene oder eine deiner Bezugsebenen. Die Skizze behält Form, Maße und Regeln, nur ihre Lage im Raum ändert sich. Das Teil wird dabei an die neue Ebene gesetzt.",
  "tipp": "Hast du aus Versehen auf der falschen Ebene gezeichnet, musst du so nicht neu anfangen. Rückgängig holt die alte Lage zurück."
 },
 "present": {
  "tip": "Modell vorführen",
  "hilfe": "„Vorführen“ (Taste P) blendet alle Leisten aus, schaltet auf Vollbild und dreht das Modell langsam – eine Runde in 40 Sekunden. Mit der Maus kannst du trotzdem drehen und zoomen. Unten rechts hältst du das Drehen an. Esc beendet den Modus.",
  "tipp": "Zusammen mit dem Studio-Look (Ansicht → unten im Menü) wirkt das Modell am besten."
 },
 "mouseStyle": {
  "tip": "Maus wie in deinem gewohnten Programm",
  "hilfe": "Unter Menü → Einstellungen → „Maus-Steuerung“ stellst du die Maus so ein, wie du es aus Onshape, SolidWorks, Fusion oder Blender kennst. Bei diesen Arten zieht die linke Maustaste im Leeren einen Auswahl-Rahmen auf; gedreht und verschoben wird mit Mitte oder rechts.",
  "tipp": "Das Mausrad zoomt immer. Rechtsklick ohne Ziehen öffnet weiter das Menü."
 },
 "turntable": {
  "tip": "Video vom Modell",
  "hilfe": "Ansicht → „Drehteller-Video …“ nimmt ein kurzes Video auf: Das Modell dreht sich einmal um sich selbst, genau so, wie es gerade im Bild zu sehen ist. Du wählst 4 bis 15 Sekunden; gespeichert wird eine WebM-Datei, die Browser, VLC und die meisten Präsentations-Programme abspielen.",
  "tipp": "Vorher Studio-Look einschalten und den Blick einstellen – leicht von oben sieht meist am besten aus."
 },
 "dimTable": {
  "tip": "Alle Maße auf einen Blick",
  "hilfe": "Ist in der Skizze nichts gewählt, steht rechts „Alle Maße“: jedes Maß mit seinem Element und seinem Wert. Du kannst Werte und Formeln dort direkt ändern – praktisch, wenn viele Maße im Bild eng beieinander stehen.",
  "tipp": "Maße zum Ablesen stehen mit „(ablesen)“ da; tippst du dort einen Wert, wird es ein festes Maß."
 },
 "sketchCheck": {
  "tip": "Offene Enden, Lücken und doppelte Linien finden",
  "hilfe": "Prüft deine Skizze auf Stellen, die eine geschlossene Fläche verhindern: offene Enden, winzige Lücken unter 0,05 mm und übereinanderliegende (doppelte) Linien. Klick auf einen Treffer in der Liste, um die Stelle im Bild hervorzuheben.",
  "tipp": "Wenn „Fertig“ keine Fläche erkennt, obwohl alles geschlossen aussieht, hilft der Skizzen-Prüfer fast immer sofort."
 },
 "sketchRepair": {
  "tip": "Lücken schließen und doppelte Linien löschen",
  "hilfe": "Schließt alle winzigen Lücken unter 0,05 mm mit der Regel „Deckungsgleich“ und löscht übereinanderliegende doppelte Linien auf einmal. Alles passiert in einem einzigen Rückgängig-Schritt.",
  "tipp": "Größere offene Enden verbindest du von Hand, zum Beispiel mit „Linie“ oder „Ecke bilden“."
 },
 "customShortcuts": {
  "tip": "Eigene Tastenkürzel festlegen (nur Profi)",
  "hilfe": "Unter Menü → Einstellungen → „Tastenkürzel“ änderst du die Tasten für Werkzeuge, Ansicht, Modell und Dateien. Klick auf ein Kürzel, drück die neue Taste und es wirkt sofort – gespeichert in deinem Browser. Doppelte Tasten meldet Tracery, damit nichts aus Versehen überschrieben wird.",
  "tipp": "Mit „Zurücksetzen“ stellst du jederzeit alle Standard-Tasten wieder her."
 },
 "blindHole": {
  "tip": "Sackloch mit fester Tiefe und 118°-Bohrspitze",
  "hilfe": "Bohrt ein Loch mit rundem Querschnitt und einer Kegelspitze am Boden (Standard 118° wie ein Spiralbohrer, oder 140° / flach). „Tiefe (Zylinder)“ ist die zylindrische Länge; die Spitze kommt darunter noch dazu.",
  "tipp": "In der Vorschau und rechts im Feld siehst du die genaue Gesamttiefe bis zur Kegelspitze – so brichst du nicht versehentlich durch die Rückseite."
 },
 "fitHole": {
  "tip": "Passbohrung H7 auf genaues Nennmaß",
  "hilfe": "Bohrt einen genauen Zylinder ohne zusätzliches Spiel (exaktes Nennmaß für Lager, Wellen oder Passstifte) und zeigt das passende Abmaß nach ISO 286 H7 an (z. B. +0,012 / 0 mm bei Ø 6).",
  "tipp": "Für Metallteile zum späteren Aufreiben auf Maß oder für präzise gedruckte Lagersitze."
 },
 "centerHole": {
  "tip": "Zentrierbohrung nach DIN 332 Form A",
  "hilfe": "Erzeugt eine genormte Zentrierbohrung mit 60°-Senkkegel, kurzer Führungsbohrung und 118°-Bohrspitze am Grund – so wie sie ein Zentrierbohrer auf der Drehbank oder Fräse herstellt.",
  "tipp": "Wähle die Größe (A 1,0 bis A 6,3) passend zum Durchmesser der Welle oder des Werkstücks."
 },
 "cosmeticThread": {
  "tip": "Gewinde als schnelle Markierung auf runder Fläche",
  "hilfe": "Markiert eine runde Zylinderfläche (außen wie ein Bolzen oder innen wie ein Kernloch) mit einem metrischen Gewinde (Größe M2 bis M16 und Länge). Das Gewinde wird farbig gestreift angezeigt, rechnet ohne Zeitverlust und erscheint in der Stückliste sowie normgerecht in der technischen Zeichnung.",
  "tipp": "Wenn du das Teil 3D-drucken willst, klicke rechts auf „Echt machen“ – dann wird aus der Markierung ein echtes 3D-Gewinde."
 },
 "thinWall": {
  "tip": "Offene Linien oder Umrisse als dünne Wand hochziehen",
  "hilfe": "Schaltet „Dünne Wand“ ein: Offene Linien, Bögen und Splines werden mit der eingestellten Wandstärke hochgezogen; geschlossene Umrisse werden zu einem hohlen Rohr-Profil. Mit „Wand-Lage“ wählst du, ob die Wand mittig auf der Linie, nach innen oder nach außen wächst.",
  "tipp": "Ideal für Gehäuse-Wände, Rippen, Rahmen und Profile – Wandstärke und Lage kannst du auch später rechts jederzeit ändern."
 },
 "exportObjGlb": {
  "tip": "Als OBJ (mit MTL-Farben) oder GLB speichern",
  "hilfe": "OBJ kommt zusammen mit einer MTL-Datei für Farben und Glanz (in Millimetern, ideal für Blender und ältere 3D-Programme). GLB (glTF 2.0 binär) speichert jedes Teil als eigenen Knoten mit Namen samt Werkstoff-Aussehen aus dem Studio-Look (Metall, Rauheit, Klarlack, Durchsichtigkeit).",
  "tipp": "Für Web-Ansichten und schnelle Vorschauen nimm GLB; für klassische Render-Programme OBJ + MTL."
 },
 "measureKeep": {
  "tip": "Messung dauerhaft im Projekt behalten",
  "hilfe": "Speichert die aktuelle Messung als eigenes Objekt in der Liste „Messungen“ im Verlauf. Ändert sich ein Körper oder Maß, rechnet Tracery den Wert selbstständig neu; fehlt ein Bezug, erscheint „verloren“. Du kannst jede Messung ein- und ausblenden, umbenennen oder löschen.",
  "tipp": "Klick ein Mess-Schild im Bild an, um seine Art und den vollen Text rechts zu sehen; ein Doppelklick kopiert den Zahlenwert."
 },
 "saveFolder": {
  "tip": "Projekt in einen Ordner speichern und automatisch mitschreiben",
  "hilfe": "Wählt einen Ordner auf deinem Rechner (in Chrome und Edge). Tracery legt die Projektdatei dort ab und schreibt Änderungen automatisch mit – gebündelt alle 10 Sekunden. Oben in der Leiste siehst du, in welchen Ordner gespeichert wird.",
  "tipp": "Klick oben auf „gespeichert in …“, um sofort zu speichern, den Ordner zu wechseln oder die Verbindung zu trennen."
 },
 "moveStep": {
  "tip": "Körper als Schritt im Verlauf verschieben, drehen oder kopieren",
  "hilfe": "Legt einen eigenen Schritt „Verschieben/Drehen“ im Verlauf an. Rechts stellst du Verschiebung (X/Y/Z), Drehung um die Mitte, den Ursprung oder einen Punkt sowie „Als Kopie“ ein – auch mit Formeln.",
  "tipp": "Wenn du diesen Schritt unterdrückst oder den Marker davor schiebst, springt der Körper sofort an seinen alten Platz zurück."
 },
 "datumEdgeAngle": {
  "tip": "Bezugsebene durch eine gerade Kante im Winkel zu einer Fläche",
  "hilfe": "Wählt eine gerade Körperkante und eine ebene Fläche als Winkel-Bezug. Die Ebene läuft durch die Kante und kippt um den eingestellten Winkel (z. B. 30°) zur Fläche. Ändert sich der Körper, wandert die Ebene mit.",
  "tipp": "Ideal für schräge Bohrungen, Nuten oder Anschlüsse an einer Bauteilkante – den Winkel änderst du rechts jederzeit, auch mit „Richtung umkehren“."
 },
 "datumAxis": {
  "tip": "Bezugsachse als Dreh- oder Musterachse anlegen",
  "hilfe": "Legt eine eigene Achse im Projekt an: durch zwei Punkte (Ecken und Kantenmitten rasten ein), durch die Mitte einer runden Fläche (Zylinder, Kegel, Ring) oder eines Kreises, oder senkrecht auf eine ebene Fläche an einem Punkt. Sie wandert mit dem Teil mit und lässt sich direkt für Kreismuster und Drehen (Revolve) wählen.",
  "tipp": "Im Verlauf unter „Bezugsachsen“ kannst du jede Achse benennen, ein- oder ausblenden und beim Kreismuster einfach aus der Liste „Drehachse“ auswählen."
 },
 "projectUnit": {
  "tip": "Einheit für dieses Projekt wählen (mm, cm, m oder Zoll)",
  "hilfe": "Legt die Anzeige- und Standard-Einheit für dieses Projekt fest. Alle Maße, Schilder, Koordinaten, Messungen und die Stückliste zeigen in dieser Einheit; Eingaben ohne Einheit gelten darin. Eingaben mit Einheit (z. B. 25,4 mm oder 1 in) funktionieren immer.",
  "tipp": "Du kannst die Einheit jederzeit umschalten – die echte Geometrie bleibt immer exakt erhalten."
 },
 "angleSnap": {
  "tip": "Linien in 15°-Schritten und runden Längen fangen",
  "hilfe": "Rastet Linien und Linienzüge beim Zeichnen mit der Maus in 15°-Schritten mit Hilfslinie und Winkel-Schild ein und rundet die Länge auf 1 mm (bei starkem Zoom auf 0,5 oder 0,1 mm). Die Einstellung wird für diesen Browser gespeichert.",
  "tipp": "Halte beim Zeichnen die Umschalttaste gedrückt, um Winkelfang und runde Längen vorübergehend abzuschalten."
 },
 "sketchAutoDefine": {
  "tip": "Fehlende Regeln und Maße automatisch vorschlagen",
  "hilfe": "Prüft deine Skizze und schlägt fehlende Regeln vor: Waagerecht oder Senkrecht bei Linien unter 2° Abweichung, Deckungsgleich bei Punkten unter 0,05 mm Abstand, dazu fehlende Maße für Längen, Durchmesser, Radien und die Lage zum Ursprung. Alle Vorschläge erscheinen zuerst gestrichelt im Bild – „Übernehmen“ legt alles in einem einzigen Rückgängig-Schritt an, „Abbrechen“ verwirft sie.",
  "tipp": "Danach ist die Skizze voll bestimmt (alle Linien dunkel) und kann nicht mehr aus Versehen verrutschen."
 },
 "datumTangent": {
  "tip": "Bezugsebene tangential an Zylinder oder Kegel anlegen",
  "hilfe": "Klick auf die runde Fläche eines Zylinders oder Kegels. Die neue Ebene berührt die Fläche genau an dieser Stelle und folgt der Rundung, wenn sich der Durchmesser oder die Lage ändert.",
  "tipp": "Rechts im Feld „Winkel um Achse“ drehst du die Ebene jederzeit rund um das Teil – praktisch für seitliche Bohrungen oder Aufsätze auf Rohren."
 },
 "datumNormalCurve": {
  "tip": "Bezugsebene senkrecht zu einer Kante oder Kurve",
  "hilfe": "Wählt eine gerade Kante, einen Bogen, Kreis oder eine Kurve. Die Ebene steht senkrecht auf der Kante – am Anfang, in der Mitte, am Ende oder an jedem Prozentwert dazwischen.",
  "tipp": "Ideal, um ein Profil genau am Ende oder auf halbem Weg einer Kante aufzubauen; wächst die Kante, wandert die Ebene mit."
 },
 "datumEdgePoint": {
  "tip": "Bezugsebene durch eine gerade Kante und einen Punkt",
  "hilfe": "Klick zuerst eine gerade Körperkante und dann einen Punkt (Ecken und Kantenmitten rasten ein). Die Ebene spannt sich genau zwischen beiden auf und wandert mit dem Körper mit.",
  "tipp": "Damit legst du schräge Schnitte oder Skizzenebenen diagonal durch ein Bauteil."
 },
 "datumTwoEdges": {
  "tip": "Bezugsebene durch zwei gerade Kanten",
  "hilfe": "Wählt zwei gerade Kanten, die parallel sind oder sich schneiden. Die Ebene läuft durch beide Kanten und passt sich an, sobald sich die Maße des Körpers ändern.",
  "tipp": "Windschiefe Kanten (die aneinander vorbeilaufen) liegen nicht in einer Ebene – nutze dort lieber „Durch Kante & Punkt“."
 },
 "loadFont": {
  "tip": "Eigene TrueType-Schrift (.ttf) aus einer Datei laden",
  "hilfe": "Lädt eine TrueType-Schriftdatei (.ttf) von deinem Gerät, liest die Buchstaben-Umrisse und eventuelle Unterschneidungs-Paare (Kerning) direkt im Browser und speichert die Schrift im Projekt. Danach steht sie in der Schriftliste und bleibt beim Speichern und Öffnen erhalten.",
  "tipp": "Wenn die Schrift eigene Zeichenabstände (kern-Tabelle) mitbringt, werden sie automatisch genutzt – zusätzlich kannst du rechts jederzeit den Zeichenabstand anpassen."
 },
 "sketchFreeSpots": {
  "tip": "Freie Punkte und fehlende Angaben anzeigen",
  "hilfe": "Markiert alle noch beweglichen Punkte und Elemente pulsierend in Orange und zeigt die Zahl der fehlenden Angaben. Klickst du auf eine freie Stelle, wackelt sie kurz in der Richtung, in der sie noch Spiel hat.",
  "tipp": "Mit Umschalt + F schaltest du die Anzeige direkt in der Skizze ein oder aus – so siehst du sofort, wo noch ein Maß oder eine Regel fehlt."
 },
 "datumPoint": {
  "tip": "Bezugspunkt als eigenen Schritt anlegen",
  "hilfe": "Setzt einen Bezugspunkt an einer Kantenmitte, Flächenmitte, am Schnittpunkt zwischen Kante und Ebene oder bei einem Prozentwert entlang einer Kurve. Der Punkt wandert automatisch mit, wenn sich der Körper ändert.",
  "tipp": "Du kannst jeden Bezugspunkt als Ursprung für ein eigenes Koordinatensystem, eine Bezugsebene oder eine Bezugsachse verwenden."
 },
 "datumCsys": {
  "tip": "Eigenes Koordinatensystem anlegen und als Export-Nullpunkt wählen",
  "hilfe": "Legt ein eigenes rechtshändiges Koordinatensystem mit Ursprung an einem Punkt und Achsen entlang gewählter Kanten an. Beim Exportieren (STEP, STL, 3MF, OBJ, GLB) kannst du dieses System als Nullpunkt wählen.",
  "tipp": "Ideal für den 3D-Druck, CNC oder Baugruppen: Lege das Koordinatensystem an eine Ecke und zwei Kanten – dann beginnen die exportierten Maße genau bei 0."
 },
 "rib": {
  "tip": "Offene Skizzenlinie als Versteifungs-Rippe bis an die Wände ziehen",
  "hilfe": "Verlängert eine offene Linie, einen Bogen oder eine Kurve in deiner Skizze mit einstellbarer Dicke (mittig oder einseitig) bis zu den angrenzenden Wänden des Zielkörpers und verschmilzt sie direkt damit. Optional kannst du eine Schräge und feste Tiefe angeben oder von senkrecht (Steg in einer Schale) auf in der Ebene (Stützrippe) umschalten.",
  "tipp": "Die Linie muss die Wand in der Skizze nicht exakt berühren – Tracery verlängert sie automatisch sauber bis an die nächste Wand, ohne nach außen überzustehen."
 },
 "extrudeToFace": {
  "tip": "Bis zur nächsten Fläche oder bis zu einer angeklickten Fläche hochziehen",
  "hilfe": "Unter „Bis“ wählst du beim Hochziehen statt einer festen Höhe „Bis zur nächsten Fläche“ (stößt an die erste Fläche in Ziehrichtung) oder „Bis zu gewählter Fläche“ (du klickst eine Körperfläche oder Bezugsebene im Bild an). Wandert die Zielfläche später oder ändert sich die Größe des Zielkörpers, wächst das Teil von selbst mit.",
  "tipp": "Ideal für Stege, Bolzen und Taschen zwischen zwei Platten – du brauchst keinen Abstand auszurechnen, und beim Verschieben der Platte passt die Höhe weiter."
 },
 "revolveOptions": {
  "tip": "Drehen mit Winkel, symmetrisch, beidseitig oder bis zu einer Fläche",
  "hilfe": "Bestimmt, wie weit und in welche Richtung sich deine Skizze um die Achse dreht: in eine Richtung, umgekehrt, symmetrisch zu beiden Seiten (z. B. 90° als 2×45°), mit zwei eigenen Winkeln oder bis zu einer gewählten Körperfläche bzw. Bezugsebene. Bei Teil-Umdrehungen erscheint ein Ziehgriff für den Winkel.",
  "tipp": "Wenn sich das Zielteil später verschiebt, wandert der Drehkörper bei „Bis zu gewählter Fläche“ automatisch mit."
 },
 "treeReorder": {
  "tip": "Schritte im Verlauf per Ziehen umsortieren",
  "hilfe": "Zieh einen Schritt oder einen Ordner im Verlauf an eine neue Stelle, um die Reihenfolge zu ändern. Unabhängige Schritte lassen sich frei tauschen – nicht erlaubte Plätze (etwa ein Loch oder abhängiger Schritt vor seinem Zielkörper) werden rot markiert und beim Loslassen abgelehnt.",
  "tipp": "Wenn du auf die grüne/rote Linie achtest, siehst du schon beim Ziehen, ob der neue Platz erlaubt ist."
 },
 "treeFolder": {
  "tip": "Mehrere gewählte Schritte in einen auf- und zuklappbaren Ordner legen",
  "hilfe": "Wähle zwei oder mehr Schritte mit Umschalt + Klick und klick auf „In Ordner“ (oder nutze das Rechtsklick-Menü). Ein Ordner hält den Verlauf links übersichtlich und lässt sich auf- und zuklappen, umbenennen, als Ganzes verschieben und jederzeit wieder auflösen – die 3D-Körper bleiben davon unberührt.",
  "tipp": "Per Doppelklick auf den Ordnernamen benennst du ihn um; weitere Schritte ziehst du einfach direkt auf den Ordner."
 },
 "treeDuplicate": {
  "tip": "Schritt im Verlauf duplizieren",
  "hilfe": "Legt direkt hinter dem gewählten Schritt eine exakte Kopie mit denselben Maßen und derselben Rolle an (10 mm versetzt). Steckt der Schritt in einem Ordner, landet die Kopie direkt daneben im selben Ordner.",
  "tipp": "Du kannst dafür auch das Kopieren-Symbol in der Zeile oder Strg + D nutzen."
 },
 "bodyList": {
  "tip": "Mehrere getrennte Körper in einem Teil verwalten",
  "hilfe": "Enthält ein Teil mehrere getrennte Körper (zum Beispiel zwei Inseln aus einer Skizze oder nach dem Teilen), zeigt der Verlauf darunter jeden Körper einzeln. Du kannst ihn benennen, einfärben sowie ein- und ausblenden – beim Export „Jeder Körper als eigene Datei“ übernimmt Tracery die Namen.",
  "tipp": "Ein Doppelklick auf den Körpernamen benennt ihn direkt um, ein Klick auf das Farbfeld daneben ändert seine Farbe."
 },
 "patternSkip": {
  "tip": "Einzelne Kopien im Muster auslassen oder wieder einschalten",
  "hilfe": "Rechteck-, Kreis- und Kurvenmuster funktionieren nicht nur für ganze Körper, sondern auch für Formschritte wie Taschen, Nuten oder Rippen – alle Kopien schneiden oder verstärken denselben Zielkörper. Klicke im 3D-Bild auf einen kleinen Zahlen-Punkt oder rechts unter „Kopien“ auf ein Feld, um genau diese Kopie auszulassen (durchgestrichen) oder wieder einzuschalten.",
  "tipp": "Praktisch, wenn an einer Stelle ein Steg, eine Schraube oder ein Bauteil im Weg ist: Mindestens eine Kopie bleibt immer aktiv, und jede Änderung lässt sich rückgängig machen."
 },
 "scaleBody": {
  "tip": "Körper gleichmäßig oder je Achse als Schritt skalieren",
  "hilfe": "Legt einen Schritt „Skalieren“ im Verlauf an. Rechts stellst du einen gemeinsamen Faktor (z. B. ×2) oder getrennte Faktoren für X, Y und Z ein sowie den Bezugspunkt: Schwerpunkt des Körpers oder Ursprung (0 · 0 · 0).",
  "tipp": "Als Schritt im Verlauf kannst du das Skalieren jederzeit ändern, unterdrücken oder den Marker davor schieben."
 },
 "thickenFace": {
  "tip": "Fläche zu einer Platte mit fester Dicke aufdicken",
  "hilfe": "Macht aus einer gewählten ebenen oder gewölbten Körperfläche eine feste Platte mit Dicke – nach außen, nach innen oder mittig. Rechts wählst du, ob sie mit dem Körper vereinigt, als eigene Platte angelegt oder abgezogen wird.",
  "tipp": "Wenn du nach innen aufdickst, siehst du das Ergebnis nur als „Eigene Platte“ oder „Vom Körper abziehen“."
 },
 "refFix": {
  "tip": "Verlorene Kante oder Fläche neu wählen",
  "hilfe": "Verliert eine Rundung, Fase, Wandstärke oder Skizze ihre ursprüngliche Kante oder Fläche (etwa weil ein früheres Maß geändert wurde), erscheint im Verlauf ein gelbes Warnzeichen. Mit „Neu wählen“ blendet Tracery die alte Lage gelb gestrichelt ein – ein Klick auf die neue Kante oder Fläche repariert den Bezug, und alles rechnet weiter.",
  "tipp": "Du kannst die Ansicht währenddessen wie gewohnt drehen, um die gewünschte Kante oder Fläche gut anzuklicken."
 },
 "threadFace": {
  "tip": "Echtes oder kosmetisches Gewinde direkt auf eine runde Fläche setzen",
  "hilfe": "Rechtsklick auf einen Bolzen (außen) oder eine Bohrung (innen) → „Gewinde …“. Tracery schlägt die passende metrische Größe (M2 bis M24) samt Regelsteigung direkt aus dem Durchmesser vor. Du kannst Länge, Steigung und Ende wählen sowie zwischen echtem 3D-Gewinde und schneller Markierung umschalten.",
  "tipp": "Bei gedruckten Innengewinden hilft ein kleines Spiel (Standard 0,3 mm), damit Schrauben leicht hineingehen."
 },
 "mirrorStep": {
  "tip": "Einzelnen Formschritt an einer Ebene oder Fläche im selben Körper spiegeln",
  "hilfe": "Spiegelt nur den gewählten Formschritt – zum Beispiel eine Tasche, Erhöhung, Rippe, ein Loch oder Aufdicken – an einer Grundebene, einer Bezugsebene oder einer gewählten ebenen Körperfläche direkt im selben Körper. Rechts wählst du Spiegelebene, Abstand oder weitere Schritte.",
  "tipp": "Änderst du später Tiefe, Größe oder Form des ursprünglichen Schritts, passt sich die gespiegelte Seite automatisch mit an."
 },
 "threadStandards": {
  "tip": "Metrische Regel-, Feingewinde, Zoll UNC/UNF und Rohrgewinde G",
  "hilfe": "Wählt im Bohrungs-Assistenten die Gewindenorm: Metrisch Regelgewinde (M1.6–M12), Metrisch Feingewinde (z. B. M8×1, M10×1,25 nach DIN 13 / DIN 336), Zoll-Gewinde UNC und UNF (#4 bis 1/2\" nach ASME B1.1 mit 82°-Senkung) oder zylindrisches Rohrgewinde G1/8 bis G1 (ISO 228-1 mit Flachsenkung nach DIN 3852-2).",
  "tipp": "Für zöllige Kameragehäuse oder US-Bauteile wählst du UNC/UNF; bei Hydraulik-, Pneumatik- oder Schlauchanschlüssen passt Rohrgewinde G."
 },
 "formulaTable": {
  "tip": "Nachschlagetabelle für Formeln anlegen",
  "hilfe": "Legt unter „Maße“ eine kleine Tabelle mit Schlüssel und Wert an – zum Beispiel „Schraube“ mit den Zeilen M3 = 3,4 und M5 = 5,5. In jeder Formel holst du den Wert mit tabelle(Schraube; M5). Außerdem verstehen Formeln wenn(Bedingung; dann; sonst) mit < > <= >= == != sowie runden(x; Stellen), aufrunden und abrunden.",
  "tipp": "Mehrere Angaben in Funktionen trennst du mit Semikolon ; – zum Beispiel runden(2,345; 1) oder wenn(b > 50; 3; 2)."
 },
 "exportIgesBrep": {
  "tip": "Als IGES (.igs) oder BREP (.brep) speichern",
  "hilfe": "IGES (.igs) speichert exakte Flächen und Körper im verbreiteten Austauschformat – besonders hilfreich für ältere CAD- und CAM-Programme. BREP (.brep) ist das eigene, verlustfreie Format des OpenCascade-Kerns (zum Beispiel für FreeCAD oder zum exakten Wiederladen in Tracery). Beide beachten „Nur die Auswahl“ und einen gewählten Nullpunkt.",
  "tipp": "Für den Austausch mit Fusion, SolidWorks oder Onshape ist meist STEP die erste Wahl; IGES hilft bei älteren CAM-Programmen und BREP bei direktem Austausch mit FreeCAD."
 },
 "emboss": {
  "tip": "Text oder Logo erhaben oder vertieft auf eine Fläche prägen (auch Zylinder oder Kugel)",
  "hilfe": "Projiziert geschlossene Flächen aus deiner Skizze – zum Beispiel Text oder ein Logo – senkrecht auf die gewählte ebene oder gewölbte Körperfläche (Zylinder, Kugel, Kegel …) und überträgt sie als Erhöhung (erhaben) oder Gravur (vertieft) mit fester Höhe direkt in den Körper.",
  "tipp": "Klick zuerst die runde oder ebene Zielfläche an und starte „Prägen“ – Tracery legt die Skizzenebene automatisch passend vor die Fläche."
 },
 "importCheck": {
  "tip": "Importierte Geometrie mit BRepCheck auf Fehler, Lücken und offene Kanten prüfen",
  "hilfe": "Untersucht das importierte Teil mit dem OpenCascade-Prüfer (BRepCheck) auf offene Kanten, schmale Lücken zwischen Flächen, falsch herum orientierte Flächen sowie auf eine geschlossene Hülle für echte Volumenkörper.",
  "tipp": "Nach jedem 3D-Import läuft diese Prüfung automatisch und meldet sich oben im Bild, falls etwas repariert werden sollte."
 },
 "importHeal": {
  "tip": "Offene Kanten schließen, Flächen richten und Lücken mit Toleranz vernähen",
  "hilfe": "Repariert ein fehlerhaftes Import-Teil in mehreren Schritten: Einzelflächen korrigieren (ShapeFix), benachbarte Flächen mit der eingestellten Näh-Toleranz verbinden, einfache offene Löcher schließen und daraus wieder einen geschlossenen Volumenkörper bauen. Danach siehst du die Vorher/Nachher-Zahlen.",
  "tipp": "Bleiben nach dem Heilen noch Lücken offen, erhöhe rechts beim Teil die Näh-Toleranz etwas (z. B. von 0,1 auf 0,3 mm) und klick erneut auf „Heilen“."
 },
 "exportStep": {
  "tip": "STEP mit Teilenamen, Farben und Baugruppen-Struktur speichern und einlesen",
  "hilfe": "Schreibt alle sichtbaren Körper als exakte B-Rep-Geometrie nach STEP AP214/AP242 (XCAF). Dabei kommen die Namen, Farben sowie Gruppen und Ordner als echte Baugruppen-Struktur mit – andere CAD-Programme wie Fusion, FreeCAD oder SolidWorks zeigen alles direkt sortiert und gefärbt an. Beim erneuten Öffnen in Tracery entstehen Gruppen, Teile, Namen und Farben wieder genauso.",
  "tipp": "Wenn Teile eine Gruppe bilden, bleiben beim Export alle darin enthaltenen Einzelteile mit ihren eigenen Namen und Farben erhalten."
 },
 "wrapCyl": {
  "tip": "Ebene Skizze ohne Verzerrung um einen Zylinder wickeln",
  "hilfe": "Legt deine 2D-Skizze exakt nach Bogenlänge um eine gewählte Zylinderfläche – wahlweise als erhabene oder vertiefte Prägung oder als Linie auf der Oberfläche (auch für „Entlang Pfad“). Eine Breite von genau π × Ø umschließt den ganzen Umfang (360°), die halbe Breite genau 180°.",
  "tipp": "Wähle im Modus „Linie“ danach „Entlang Pfad ziehen“, um zum Beispiel eine schräge Nut oder eine Spirale um den Zylinder zu führen."
 },
 "toolbarCustomize": {
  "tip": "Werkzeugleiste anpassen, sortieren und Favoriten ganz links anheften",
  "hilfe": "Mach einen Rechtsklick auf die Werkzeugleiste oben und wähle „Anpassen …“. Links siehst du deine aktiven Werkzeuge, rechts alle weiteren Werkzeuge wie Abrunden, Bohren oder Schnitt. Zieh Werkzeuge per Maus zwischen den Listen hin und her oder sortiere sie neu. Ein Klick auf den Stern markiert ein Werkzeug als Favorit – Favoriten stehen in der Leiste immer ganz links. Alle Änderungen werden in deinem Browser gespeichert; „Zurücksetzen“ stellt den Anfangszustand wieder her.",
  "tipp": "Mit einem Rechtsklick direkt auf ein Werkzeug in der Leiste kannst du es auch ohne Umweg als Favorit markieren oder entfernen."
 },
 "precision": {
  "tip": "Nachkommastellen für Anzeige (0–4) und Winkel (0–4) getrennt wählen",
  "hilfe": "In den Einstellungen stellst du getrennt ein, wie viele Stellen nach dem Komma bei Längen, Maßen, Schildern, Messungen und Panels (0 bis 4) sowie bei Winkeln (0 bis 4) angezeigt werden. Alle eingegebenen Maße, Formeln und der CAD-Kern rechnen im Hintergrund immer mit voller Genauigkeit weiter.",
  "tipp": "Auch wenn 0 Stellen eingestellt sind, kannst du jederzeit exakte Werte wie 12,3456 eintippen – sie bleiben genau so gespeichert und sichtbar, sobald du mehr Stellen wählst."
 },
 "geomCheck": {
  "tip": "Modell auf kaputte Flächen, winzige Kanten und Selbstschnitte prüfen",
  "hilfe": "Prüfen → „Geometrie prüfen“ untersucht alle sichtbaren Körper mit dem OpenCascade-Kern auf beschädigte oder zusammengefallene Flächen, winzige Kanten unter 0,01 mm (oft durch zwei fast gleiche Maße) sowie sich selbst schneidende Flächen. Ein Klick auf einen Eintrag in der Liste hebt die betroffene Stelle rot im Modell hervor und fährt die Kamera heran.",
  "tipp": "Wenn eine Rundung oder ein Export unerwartet scheitert, deckt die Geometrie-Prüfung winzige Kanten oder kaputte Flächen meist sofort auf."
 },
 "statusSel": {
  "tip": "Auswahl-Info in der Statusleiste",
  "hilfe": "Zeigt unten rechts sofort, was du gerade gewählt hast – zum Beispiel die Länge einer Kante, die Summe mehrerer Kanten, den Flächeninhalt einer Fläche, den Durchmesser einer Rundung oder die Größe eines Körpers.",
  "tipp": "Ein Klick auf das Auswahl-Schild kopiert den Zahlenwert in die Zwischenablage."
 },
 "statusUnit": {
  "tip": "Aktuelle Projekt-Einheit – Klick öffnet die Einstellung",
  "hilfe": "Zeigt die gerade eingestellte Einheit dieses Projekts (mm, cm, m oder Zoll). Alle Längen, Flächen und Maßeingaben ohne eigene Einheit richten sich danach.",
  "tipp": "Klick direkt auf die Einheit, um sie in den Einstellungen umzustellen."
 },
 "statusCalc": {
  "tip": "Rechenzustand des CAD-Kerns",
  "hilfe": "Zeigt auf einen Blick, ob der OpenCascade-Kern gerade rechnet, bereit ist oder ob ein Schritt im Verlauf einen Fehler meldet.",
  "tipp": "Bei „1 Fehler“ klickst du rechts daneben auf die Ampel oder im Verlauf auf den rot markierten Schritt für Details."
 },
 "projectTemplates": {
  "tip": "Neues Projekt aus einer Vorlage starten (mm, Zoll, 3D-Druck, Laser, Gehäuse)",
  "hilfe": "Öffnet die Auswahl für neue Projekte: Leer in Millimetern oder Zoll, 3D-Druck mit eingeblendetem Druckbett und 0,4-mm-Düse, Laser mit 3-mm-Platte, ein fertiges Gehäuse sowie deine selbst gespeicherten Vorlagen.",
  "tipp": "Du kannst auch jedes eigene Projekt als Vorlage ablegen und später mit einem Klick wieder als Startpunkt öffnen."
 },
 "saveTemplate": {
  "tip": "Aktuelles Projekt lokal als eigene Vorlage speichern",
  "hilfe": "Speichert den aktuellen Stand samt Maßen, Einheiten, Material und Druckbett-Einstellung als eigene Vorlage in diesem Browser. Sie erscheint danach direkt unter „Neues Projekt“ und auf der Startseite.",
  "tipp": "Ideal für wiederkehrende Halterungen, eigene Druckerprofile oder Gehäuse-Grundformen."
 },
 "printBed": {
  "tip": "Druckbett-Größe im 3D-Bild zeigen und Düsendurchmesser merken",
  "hilfe": "Zeichnet den Bauraum deines 3D-Druckers als Rahmen auf der Arbeitsfläche ein und prüft, ob das Modell noch auf das Druckbett passt. Außerdem wird der Düsendurchmesser für Wandstärken gespeichert.",
  "tipp": "Die Vorlage „3D-Druck“ aktiviert das Druckbett automatisch mit 220 × 220 × 250 mm und 0,4-mm-Düse."
 },
 "crashRecovery": {
  "tip": "Ungesicherten Stand nach einem Absturz oder Neuladen wiederherstellen",
  "hilfe": "Tracery merkt sich laufende Änderungen automatisch in der Browser-Datenbank – auch bei großen Projekten mit importierten 3D-Modellen. Wird die Seite ohne Speichern geschlossen oder neu geladen, erscheint beim nächsten Start dieses Angebot mit Projektname und Uhrzeit.",
  "tipp": "Mit „Wiederherstellen“ holst du alle ungesicherten Änderungen sofort zurück; „Verwerfen“ kehrt zum letzten gespeicherten Stand zurück."
 },
 "stdPin": {
  "tip": "Zylinderstift nach ISO 2338 zum genauen Ausrichten und Fixieren",
  "hilfe": "Bauteile → Normteile → „Zylinderstift (ISO 2338)“: Genormter Passstift von Ø 1 bis 20 mm mit 15°-Endfasen. Durchmesser, Länge und Toleranzfeld (m6 oder h8) stellst du rechts im Panel ein.",
  "tipp": "Für das Gegenstück nimm „Passbohrung H7“ mit demselben Nenndurchmesser – rechts steht gleich das passende H7-Abmaß."
 },
 "stdKey": {
  "tip": "Rundstirnige Passfeder nach DIN 6885 Form A",
  "hilfe": "Bauteile → Normteile → „Passfeder (DIN 6885 A)“: Überträgt Drehmoment zwischen Welle und Nabe. Rechts wählst du den Querschnitt (b × h) und die Länge l – dazu siehst du den passenden Wellendurchmesser und die zugehörigen Nuttiefen t₁ und t₂.",
  "tipp": "Klick rechts auf „Passende Nut anlegen“, um direkt eine Passfedernut mit derselben Größe und Länge zu erzeugen."
 },
 "stdKeyway": {
  "tip": "Passfedernut für Welle oder Nabe nach DIN 6885",
  "hilfe": "Bauteile → Normteile → „Passfedernut (DIN 6885)“: Schneidet die zur Passfeder gehörende Nut aus – als rundstirnige Wellennut mit Tiefe t₁ oder als gerade Nabennut mit Tiefe t₂.",
  "tipp": "Zieh die Nut direkt auf die Welle oder die Bohrungskante, oder richte sie über „Loch hier“ und die Lagewerte exakt aus."
 },
 "stdBearing": {
  "tip": "Rillenkugellager nach DIN 625-1 (608, 6000er und 6200er Reihe)",
  "hilfe": "Bauteile → Normteile → „Kugellager (Norm)“: Genormtes Kugellager mit exaktem Innen-Ø d, Außen-Ø D, Breite B und Kantenabstand r_min – wahlweise geschlossen (2RS/ZZ) oder offen mit sichtbaren Kugeln.",
  "tipp": "Das 608-Lager (Ø 8 × 22 × 7 mm) ist als Standard vorgewählt – für Lagersitze passt eine „Passbohrung H7“ mit Durchmesser D."
 },
 "stdSleeve": {
  "tip": "Gleitlagerbuchse nach ISO 3547 / DIN 1850",
  "hilfe": "Bauteile → Normteile → „Gleitlager (Norm)“: Zylindrische Gleitlagerbuchse (Form C) oder Bundbuchse (Form F) aus Messing mit genormtem Innen-Ø d, Außen-Ø D und Wanddicke s₃.",
  "tipp": "Eine Bundbuchse stützt sich mit dem Bund seitlich an der Bohrung ab – wähle die Gehäusebohrung passend zu Außen-Ø D in H7."
 }
};


// ---------- Einfache Ereignisse ----------
function makeEmitter() {
  const map = new Map();
  return {
    on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => map.get(ev).delete(fn); },
    emit(ev, ...a) { const s = map.get(ev); if (s) for (const fn of [...s]) { try { fn(...a); } catch (e) { console.error(e); } } },
  };
}
const Bus = makeEmitter();

