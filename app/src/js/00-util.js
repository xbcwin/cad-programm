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
  function parse(src, vars = {}, tables, depth = 0, rad = false) {
    let s = String(src ?? '');
    if (!s.trim()) throw new Error('Formel ist leer.');
    if (rad) {
      s = s
        .replace(/−/g, '-')
        .replace(/[×·]/g, '*')
        .replace(/(\d)\s*π/g, '$1*pi')
        .replace(/π/g, 'pi')
        .replace(/(\d)\s*(pi)(?![A-Za-zÄÖÜäöüß_0-9])/gi, '$1*$2');
    }
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
        try { kv = parse(rawKey, vars, rawTbls, depth + 1, rad); okKey = true; } catch (_) {}
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
        return parse(rv, vars, rawTbls, depth + 1, rad);
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
        if (rad && /^tau$/i.test(node.name)) return Math.PI * 2;
        const key = Object.keys(vars || {}).find((k) => k.toLowerCase() === node.name.toLowerCase());
        if (key === undefined) {
          if (rad && /^e$/i.test(node.name)) return Math.E;
          throw new Error(`Unbekanntes Maß „${node.name}“ – leg es links unter „Maße“ an.`);
        }
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
          return Math[low](rad ? args[0] : (args[0] * Math.PI) / 180);
        }
        if (rad) {
          if (low === 'asin' || low === 'acos') {
            if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`);
            if (args[0] < -1 - 1e-12 || args[0] > 1 + 1e-12) throw new Error(`${node.name} verlangt einen Wert zwischen -1 und 1.`);
            return Math[low](clamp(args[0], -1, 1));
          }
          if (low === 'atan') { if (args.length !== 1) throw new Error('atan braucht genau eine Zahl.'); return Math.atan(args[0]); }
          if (low === 'atan2') { if (args.length !== 2) throw new Error('atan2 braucht 2 Angaben: atan2(y; x).'); return Math.atan2(args[0], args[1]); }
          if (low === 'sinh' || low === 'cosh' || low === 'tanh') { if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`); return Math[low](args[0]); }
          if (low === 'exp') { if (args.length !== 1) throw new Error('exp braucht genau eine Zahl.'); return Math.exp(args[0]); }
          if (low === 'ln') {
            if (args.length !== 1) throw new Error('ln braucht genau eine Zahl.');
            if (args[0] <= 0) throw new Error('ln verlangt eine Zahl größer als 0.');
            return Math.log(args[0]);
          }
          if (low === 'log' || low === 'log10') {
            if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`);
            if (args[0] <= 0) throw new Error(`${node.name} verlangt eine Zahl größer als 0.`);
            return Math.log10(args[0]);
          }
          if (low === 'sign' || low === 'sgn') { if (args.length !== 1) throw new Error(`${node.name} braucht genau eine Zahl.`); return Math.sign(args[0]); }
          if (low === 'rad') { if (args.length !== 1) throw new Error('rad braucht genau eine Zahl.'); return (args[0] * Math.PI) / 180; }
          if (low === 'deg') { if (args.length !== 1) throw new Error('deg braucht genau eine Zahl.'); return (args[0] * 180) / Math.PI; }
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
  const evalRad = (src, vars, tables) => parse(src, vars, tables, 0, true);
  function tryEvalRad(src, vars, tables) {
    try { return { ok: true, value: evalRad(src, vars, tables) }; }
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
  return { eval: parse, tryEval, evalRad, tryEvalRad, names };
})();

// ---------- Einheiten je Projekt (BE-10): Anzeige und Eingabe in mm, cm, m oder Zoll; intern immer mm ----------
const Units = (() => {
  const DEFS = {
    mm: { k: 'mm', label: 'mm', get name() { return typeof T === 'function' ? T('unit.mm') : 'Millimeter (mm)'; }, fac: 1, dec: 2, inputDec: 3, step: 1, shiftStep: 10, areaLabel: 'mm²', areaFac: 1, volLabel: 'cm³', volFac: 1000 },
    cm: { k: 'cm', label: 'cm', get name() { return typeof T === 'function' ? T('unit.cm') : 'Zentimeter (cm)'; }, fac: 10, dec: 2, inputDec: 4, step: 0.1, shiftStep: 1, areaLabel: 'cm²', areaFac: 100, volLabel: 'cm³', volFac: 1000 },
    m:  { k: 'm',  label: 'm',  get name() { return typeof T === 'function' ? T('unit.m')  : 'Meter (m)'; },       fac: 1000, dec: 3, inputDec: 5, step: 0.01, shiftStep: 0.1, areaLabel: 'm²', areaFac: 1e6, volLabel: 'm³', volFac: 1e9 },
    in: { k: 'in', label: 'in', get name() { return typeof T === 'function' ? T('unit.in') : 'Zoll (in)'; },       fac: 25.4, dec: 3, inputDec: 4, step: 0.1, shiftStep: 1, areaLabel: 'in²', areaFac: 645.16, volLabel: 'in³', volFac: 16387.064 },
  };
  const ORDER = ['mm', 'cm', 'm', 'in'];
  const getOptions = () => ORDER.map((k) => [k, DEFS[k].name]);
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
  return { DEFS, ORDER, get OPTIONS() { return getOptions(); }, key, def, label, areaLabel, volLabel, factor, fromMM, toMM, areaFromMM2, volFromMM3, fmtLen, fmtLenU, fmtLenFixed, fmtLenFixedU, fmtArea, fmtAreaU, fmtVolU, fmtInput, parseLen, set };
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
  sketchBlock: '<rect x="3" y="3" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/>',
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
  ellipseArc: '<path d="M3 13.5A9 5.5 0 0 1 20.5 10.5" /><circle cx="3" cy="13.5" r="1.5" fill="currentColor"/><circle cx="20.5" cy="10.5" r="1.5" fill="currentColor"/><path d="M12 13.5h.01" />',
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9z" />',
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
  cam: '<path d="M12 4c3.8 0 6.5 3.6 6.5 7.5A6.5 6.5 0 1 1 5.5 11.5C5.5 7.6 8.2 4 12 4z" /><circle cx="12" cy="13" r="2.2" /><path d="M12 1.5v2.5" />',
  snap: '<path d="M6 20V6h4v10l4-3 4 3" />',
  ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z" />',
  arrowR: '<path d="M5 12h13 M13 6l6 6-6 6" />',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8 M10.5 7.5v6 M7.5 10.5h6" />',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8 M7.5 10.5h6" />',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />',
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
  freeze: '<path d="M12 2v20M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5M6.2 10.6 7.5 7.5 4.4 6.2M17.8 13.4l-1.3 3.1 3.1 1.3"/>',
  projectEdge: '<path d="M7 3h10l4 4v6" opacity=".45"/><path d="M7 3v6M17 3v6" opacity=".45"/><path d="M12 11v6" stroke-dasharray="2 2"/><path d="M8 15l4 4 4-4"/><path d="M3 21h18" />',
  compare: '<rect x="3.5" y="4.5" width="11" height="11" rx="1.5" opacity=".6"/><rect x="9.5" y="8.5" width="11" height="11" rx="1.5"/>',
  silhouette2d: '<ellipse cx="12" cy="7" rx="6.5" ry="3" opacity=".45"/><path d="M5.5 7v5c0 1.6 2.9 3 6.5 3s6.5-1.4 6.5-3V7" opacity=".45"/><path d="M12 15v3" stroke-dasharray="2 2"/><rect x="4" y="18" width="16" height="3.5" rx="1"/>',
  intersectCurve: '<path d="M3 9c4-3 14-3 18 0v8c-4-3-14-3-18 0z" opacity=".4"/><path d="M6 4l12 4v11L6 15z" opacity=".4"/><path d="M6 9.5c3.5-1.8 8.5-1.2 12 .8" stroke-width="2.4"/>',
  wall2d: '<path d="M4 18c3-8 9-12 16-12" stroke-dasharray="2.5 2" opacity=".5"/><path d="M3 15.5C6 8 12 4 19 3.5M5.5 20.5c3-7.5 9-11.5 16-12M3 15.5l2.5 5M19 3.5l2.5 5" />',
  offset2d: '<path d="M4 16h6M16 4v6" opacity=".4"/><path d="M4 20V11a7 7 0 0 1 7-7h9M10 20v-9a1 1 0 0 1 1-1h9" />',
  project: '<path d="M3 16l6-3 12 2-6 4z" opacity=".4"/><path d="M7 5v11M17 7v11" stroke-dasharray="3 2.5" opacity=".5"/><path d="M7 5l10 2M7 16l10 2"/><circle cx="7" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1.6" fill="currentColor" stroke="none"/>',
  cHoriz: '<path d="M6 8h12" stroke-dasharray="3 2.5" opacity=".4"/><path d="M4 12h16"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="2" fill="currentColor" stroke="none"/>',
  cVert: '<path d="M16 6v12" stroke-dasharray="3 2.5" opacity=".4"/><path d="M12 4v16"/><circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="2" fill="currentColor" stroke="none"/>',
  cParallel: '<path d="M5 17 15 5M9 19 19 7" />',
  cCollinear: '<path d="M3 19 9.5 12.5M14.5 7.5 21 1" /><circle cx="12" cy="10" r="1.2" />',
  cPerp: '<path d="M12 14h5v5" opacity=".5"/><path d="M4 19h16M12 19V5" />',
  cTangent: '<circle cx="10" cy="14" r="6"/><path d="M5.6 3.2 20 14"/><circle cx="13.6" cy="9.2" r="1.8" fill="currentColor" stroke="none"/>',
  cCurvature: '<path d="M3 18a7 7 0 0 1 7-7c4 0 7-2 11-7"/><path d="M5 13l-2.5-1M8 11l-1-2.5M12 11l.5-2.5M16 9l1.5-2" opacity=".55"/><circle cx="10" cy="11" r="1.8" fill="currentColor" stroke="none"/>',
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
  deform: '<path d="M5 18C5 10.5 10.5 5 18 5v4.5C13 9.5 9.5 13 9.5 18z" fill="currentColor" opacity=".2"/><path d="M5 18C5 10.5 10.5 5 18 5v4.5C13 9.5 9.5 13 9.5 18zM14 14l4 4M18 14v4h-4" />',
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
  oring: '<circle cx="12" cy="12" r="8" stroke-width="3.6" opacity=".28"/><circle cx="12" cy="12" r="9.6"/><circle cx="12" cy="12" r="6.2"/>',
  oringGroove: '<path d="M3 16h5.5v-5h7v5H21v4H3z" fill="currentColor" opacity=".2"/><path d="M3 16h5.5v-5h7v5H21"/><circle cx="12" cy="11.5" r="2.6"/>',
  shaftSeal: '<path d="M4 6h16v12H4z" opacity=".18" fill="currentColor"/><path d="M4 6h16v12H4z"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="6.4" stroke-dasharray="2.2 1.8"/>',
  compSpring: '<path d="M6 4h12M6 20h12" stroke-width="2"/><path d="M7 6.5l10 2.7-10 2.8 10 2.8-10 2.7"/>',
  extSpring: '<circle cx="12" cy="5" r="2.2"/><path d="M10.5 7.5 16 9.5 8 11.8 16 14 8 16.2l5.5 1.3"/><circle cx="12" cy="19.5" r="2.2"/>',
  replace: '<path d="M16 3l4 4-4 4 M20 7H8a4 4 0 0 0-4 4v1 M8 21l-4-4 4-4 M4 17h12a4 4 0 0 0 4-4v-1"/>',
  deleteBody: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" stroke-dasharray="2.5 2" opacity=".55"/><path d="M9 9l6 6M15 9l-6 6" />',
  helix: '<path d="M6 6.5c0-1.9 2.7-3 6-3s6 1.1 6 3-2.7 3-6 3-6 1.1-6 3 2.7 3 6 3 6 1.1 6 3-2.7 3-6 3-6-1.1-6-3" /><path d="M6 6.5c0 1.4 1.6 2.3 4 2.8 M18 12.5c0 1.4-1.6 2.3-4 2.8" opacity=".45"/>',
  stretch: '<path d="M3 7h11v10H3z" opacity=".45"/><path d="M10 4h8v16h-8z" stroke-dasharray="2.5 2"/><path d="M14 12h7M18 9l3 3-3 3"/>',
  patternFill: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="14" cy="8" r="1.4" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
  conic: '<path d="M4 17l8-11 8 11" stroke-dasharray="2.2 2" opacity=".5"/><path d="M4 17Q12 6 20 17" /><circle cx="12" cy="11.5" r="1.7" fill="currentColor"/><circle cx="4" cy="17" r="1.4" fill="currentColor"/><circle cx="20" cy="17" r="1.4" fill="currentColor"/>',
  bridge: '<path d="M3 16h3.5M17.5 8H21" opacity=".55"/><path d="M6.5 16C11 16 13 8 17.5 8" /><circle cx="6.5" cy="16" r="1.6" fill="currentColor"/><circle cx="17.5" cy="8" r="1.6" fill="currentColor"/>',
  boss: '<ellipse cx="12" cy="7" rx="5" ry="2.2"/><ellipse cx="12" cy="7" rx="2.2" ry="1"/><path d="M7 7v9c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V7"/><path d="M3 18l4-3v3H3zM21 18l-4-3v3h4z" fill="currentColor" opacity=".25"/><path d="M3 18h4M17 18h4M3 18l4-3M21 18l-4-3" />',
  lipGroove: '<path d="M4 4h16v5h-6v3h-4V9H4z" fill="currentColor" opacity=".2"/><path d="M4 4h16v5h-6v3h-4V9H4zM4 20h16v-5h-5v-2.5h-6V15H4z" />',
  vent: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6.5 8h11M6.5 12h11M6.5 16h11" stroke-width="2.1"/>',
  fins: '<path d="M3 19h18"/><path d="M5 19V7M9.5 19V7M14.5 19V7M19 19V7" stroke-width="2"/><path d="M5 7v12M9.5 7v12M14.5 7v12M19 7v12" opacity=".3"/>',
  web: '<rect x="3" y="3" width="18" height="18" rx="1.5" opacity=".45"/><path d="M3 12h18M12 3v18M6 6l12 12M18 6L6 18" />',
  splitFace: '<path d="M4 17c4-3 12-3 16 0V7c-4-3-12-3-16 0z" opacity=".35" fill="currentColor"/><path d="M4 17c4-3 12-3 16 0V7c-4-3-12-3-16 0z"/><circle cx="12" cy="11.5" r="3.4" stroke-dasharray="2 1.5"/>',
  dome: '<path d="M3 16h18v4H3z" opacity=".35" fill="currentColor"/><path d="M3 16h18v4H3z"/><path d="M4 16c0-6.5 3.6-10 8-10s8 3.5 8 10" fill="currentColor" opacity=".2"/><path d="M4 16c0-6.5 3.6-10 8-10s8 3.5 8 10"/>',
  undercut: '<path d="M4 6h7v4l3 2h6v6H4z" fill="currentColor" opacity=".2"/><path d="M4 6h7v4l3 2h6M4 18h16M11 6v4l3 2" />',
  circlipGroove: '<path d="M4 7h6v4h4V7h6v10H4z" fill="currentColor" opacity=".2"/><path d="M4 7h6v4h4V7h6M4 17h16" />',
  knurl: '<rect x="5" y="4" width="14" height="16" rx="1.5" fill="currentColor" opacity=".15"/><rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M5 9l5-5M5 15l10-10M8 20L19 9M14 20l5-5M19 9l-5-5M19 15L9 5M16 20L5 9M10 20l-5-5" opacity=".75"/>',
  gripPattern: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" opacity=".14"/><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="7.5" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.5" cy="9" r="1.2" fill="currentColor" stroke="none"/><path d="M6 13.5h12M6 16.5h12" stroke-width="1.8"/>',
  splineShaft: '<circle cx="12" cy="12" r="5.5" opacity=".35"/><path d="M10.5 3h3v2.6a6.8 6.8 0 0 1 2.9 1.7l2.2-1.3 1.5 2.6-2.2 1.3a6.8 6.8 0 0 1 0 3.4l2.2 1.3-1.5 2.6-2.2-1.3a6.8 6.8 0 0 1-2.9 1.7V21h-3v-2.6a6.8 6.8 0 0 1-2.9-1.7l-2.2 1.3-1.5-2.6 2.2-1.3a6.8 6.8 0 0 1 0-3.4L3.9 8.6 5.4 6l2.2 1.3a6.8 6.8 0 0 1 2.9-1.7z"/>',
  helicalGear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M9.5 3l3.2 1.8M15.5 4.2l1.8 3.2M19.8 9.2l-.5 3.6M19 15.8l-2.7 2.5M14.2 20.4l-3.6.3M8.5 19.6l-2.8-2.4M4.2 14.8l.5-3.6M5 8.2L7.7 5.7"/><path d="M8.5 7.5l7 9" opacity=".45" stroke-dasharray="2 1.5"/>',
  bevelGear: '<ellipse cx="12" cy="16.5" rx="9" ry="3.5" fill="currentColor" opacity=".2"/><ellipse cx="12" cy="16.5" rx="9" ry="3.5"/><ellipse cx="12" cy="7.5" rx="4.5" ry="1.8"/><path d="M3 16.5L7.5 7.5M21 16.5L16.5 7.5M7 19l2.6-10M12 20V9.3M17 19l-2.6-10"/>',
  steppedShaft: '<path d="M3 9h5V7h8v2h5v6h-5v2H8v-2H3z" fill="currentColor" opacity=".18"/><path d="M3 9h5V7h8v2h5v6h-5v2H8v-2H3z"/><path d="M8 7v10M16 7v10M1 12h22" opacity=".45" stroke-dasharray="2 1.5"/>',
  shaftCollar: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="currentColor" opacity=".18"/><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.8"/><path d="M12 4v3M10.5 2.5h3" stroke-width="1.9"/>',
  shaftCoupling: '<rect x="3" y="6.5" width="18" height="11" rx="2" fill="currentColor" opacity=".18"/><rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M12 6.5v11M7.5 6.5v3M16.5 6.5v3M2 12h20" stroke-dasharray="2 1.5" opacity=".6"/>',
  commentPin: '<path d="M12 21s-6-5.6-6-10.5a6 6 0 1 1 12 0C18 15.4 12 21 12 21z" fill="currentColor" opacity=".18"/><path d="M12 21s-6-5.6-6-10.5a6 6 0 1 1 12 0C18 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" />',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8.5 4v16 M15.5 4v16" />',
  illustration: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z M4 7.5 12 12l8-4.5 M12 12v9" stroke-width="1.9" />',
  quadView: '<rect x="3" y="3" width="8" height="8" rx="1.2"/><rect x="13" y="3" width="8" height="8" rx="1.2"/><rect x="3" y="13" width="8" height="8" rx="1.2"/><rect x="13" y="13" width="8" height="8" rx="1.2"/>',
  gdt: '<rect x="2.5" y="6.5" width="19" height="11" rx="1"/><path d="M9 6.5v11 M15.5 6.5v11 M4.7 14.5l1.6-5 M6.8 14.5l1.6-5 M12.2 12a1.3 1.3 0 1 0 0 .01 M17.2 14.5l1.3-5 1.3 5 M17.7 13.1h1.6"/>',
  surface: '<path d="M4 13l4.5 6.5L15.5 5H21M6.3 16.3h6.2"/>',
  weld: '<path d="M3 18l5-6h13M11 12v-5l5 5"/>',
  symbols: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2"/><path d="M5.5 8l1.2-2.8L8 8M15.8 6.8h3M17.3 5.3v3"/>',
  internalGear: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="2.1 1.6"/><circle cx="12" cy="12" r="7.5" opacity=".3"/>',
  gearRack: '<path d="M3 18h18v-5H3z" fill="currentColor" opacity=".2"/><path d="M3 18h18v-5h-2v-3h-2.5v3h-2.5v-3H11.5v3H9v-3H6.5v3H3z"/>',
  worm: '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M7 8l10-2.2M7 12l10-2.2M7 16l10-2.2M12 2v2M12 20v2"/>',
  wormWheel: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M8.5 5.3l7 1.4M7.2 8.8l9.6 2M7.2 13.2l9.6 2M8.5 16.7l7 1.4" opacity=".6"/>',
  timingPulley: '<circle cx="12" cy="12" r="9.5" stroke-dasharray="2.4 1.6"/><circle cx="12" cy="12" r="6.8"/><circle cx="12" cy="12" r="2.8"/><path d="M12 5.2V3.5M16.8 7.2l1.2-1.2M18.8 12h1.7M16.8 16.8l1.2 1.2M12 18.8v1.7M7.2 16.8L6 18M5.2 12H3.5M7.2 7.2L6 6"/>',
  sprocket: '<circle cx="12" cy="12" r="3.4"/><path d="M10.8 2.8h2.4l.7 2.7a6.6 6.6 0 0 1 2.2.9l2.1-1.8 1.7 1.7-1.8 2.1a6.6 6.6 0 0 1 .9 2.2l2.7.7v2.4l-2.7.7a6.6 6.6 0 0 1-.9 2.2l1.8 2.1-1.7 1.7-2.1-1.8a6.6 6.6 0 0 1-2.2.9l-.7 2.7h-2.4l-.7-2.7a6.6 6.6 0 0 1-2.2-.9l-2.1 1.8-1.7-1.7 1.8-2.1a6.6 6.6 0 0 1-.9-2.2l-2.7-.7v-2.4l2.7-.7a6.6 6.6 0 0 1 .9-2.2L4.2 6.3l1.7-1.7 2.1 1.8a6.6 6.6 0 0 1 2.2-.9z"/>',
  mountPattern: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="currentColor" opacity=".14"/><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
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
  "hilfe": "Zeichne in einer Skizze einen offenen Pfad aus Linien, Bögen oder einer Spline und klick „Fertig“. Wähle „Entlang Pfad“, den Querschnitt (rund, rechteckig oder eigene Form), optional eine Verdrehung in Grad sowie „Schneiden (Nut)“ für Nuten entlang einer Kurve. Alles lässt sich danach rechts weiter anpassen.",
  "tipp": "Gut für Kabelkanäle, Rohre, verdrehte Streben sowie gebogene Nuten und Rillen in einem Körper."
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
  "tip": "Körper aushöhlen wie eine Schachtel (innen, außen oder mittig)",
  "hilfe": "Klick die Fläche an, die offen sein soll, und wähle „Aushöhlen“. Rechts unter „Wandstärke“ stellst du die Standard-Wanddicke, die Richtung (nach innen, nach außen oder mittig) sowie über „Fläche mit eigener Stärke“ abweichende Wanddicken für einzelne Flächen wie z. B. den Boden ein.",
  "tipp": "Klickst du eine zweite Fläche an und wieder „Aushöhlen“, wird auch sie offen – oder wieder zu. Nach außen bleibt der Innenraum genau so groß wie dein Ausgangskörper."
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
  "tip": "Projekt-, STEP-, IGES-, BREP-, STL-, 3MF-, OBJ-, AMF-, PLY-, Punkte- (CSV/XYZ), DXF- oder SVG-Datei öffnen bzw. ins Fenster ziehen",
  "hilfe": "Über „Datei öffnen“ oder einfach ins Fenster ziehen (beim Ziehen erscheint ein Hinweis-Rahmen): Eine Projektdatei (.json) öffnet das Projekt. Eine .step-, .stp-, .igs-, .iges-, .brep-, .stl-, .3mf-, .obj-, .amf- oder .ply-Datei wird als Teil ins Projekt geladen – bei .3mf, .obj und .amf entstehen für mehrere Objekte eigene Teile (bei .3mf und .amf mit Farben und umgerechneter Maßeinheit, bei .ply auch reine Punktwolken). Eine .csv- oder .xyz-Punktedatei lädst du wahlweise als 3D-Punktwolke, als Skizzenpunkte oder als Spline. Bei STEP, IGES, BREP, STL und OBJ stellst du rechts ein, in welcher Einheit die Datei gemessen ist. Eine .dxf-Datei (2D-Zeichnung, zum Beispiel ein Platten-Umriss) wird eine 3 mm dicke Platte: Der Umriss liegt als Skizze dahinter und lässt sich mit „Skizze bearbeiten“ ändern, Löcher bleiben Löcher. Eine .svg-Datei (zum Beispiel ein Logo) wird genauso eine dünne Platte (1 mm) – als „Loch“ in eine andere Platte gesetzt ergibt das eine Gravur.",
  "tipp": "STEP, IGES und BREP sind genauer als STL, 3MF, OBJ, AMF und PLY: Kanten lassen sich runden und Bohrungen erkennen. BREP ist das direkte Format des OpenCascade-Kerns (verlustfrei, auch für FreeCAD), IGES hilft bei älteren CAD-/CAM-Programmen. STL, 3MF, OBJ, AMF und PLY sind Dreiecksnetze zum Anschauen, Ausrichten oder für Druckmodelle (3MF, AMF und PLY bringen Farben direkt mit). DXF muss als Text (ASCII) gespeichert sein; Zoll, Zentimeter und Meter werden in Millimeter umgerechnet. Zeichnungen in Blöcken vorher im anderen Programm auflösen. In SVG-Dateien muss Text vorher in Pfade umgewandelt sein. Ist gerade eine Skizze offen, landen DXF, SVG, CSV und XYZ direkt in dieser Skizze."
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
 "startupTimes": {
  "tip": "Gemessene Startzeiten für Oberfläche, CAD-Kern und Schriften",
  "hilfe": "Tracery startet die Oberfläche sofort und lädt den OpenCascade-CAD-Kern sowie die eingebauten Schriften erst, wenn ein 3D-Schritt gerechnet oder Text gezeichnet wird. Hier siehst du die genauen Zeiten bis zur Bedienbarkeit und bis zum bereiten Kern.",
  "tipp": "Du kannst nach dem Öffnen direkt eine 2D-Skizze beginnen, ohne auf den CAD-Kern zu warten."
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
 },
 "printerSelect": {
  "tip": "3D-Drucker wählen, Bauraum prüfen und Drehvorschlag nutzen",
  "hilfe": "Wählt einen bekannten 3D-Drucker (Bambu Lab A1 / A1 mini / P1S / X1C, Prusa MK4 / Mini, Ender 3, Voron 2.4) oder eine eigene Bauraum-Größe. Passt das Teil nicht aufs Druckbett, warnt Tracery in Warnfarbe und schlägt eine Drehung vor – zum Beispiel 45° diagonal.",
  "tipp": "Mit „So drehen“ richtest du das Modell mit einem Klick passend auf dem Druckbett aus."
 },
 "holeComp": {
  "tip": "Runde Löcher beim STL/3MF-Export vergrößern (+0,1 bis +0,4 mm)",
  "hilfe": "Beim 3D-Druck schrumpfen runde Bohrungen oft leicht nach innen. Mit dem Loch-Ausgleich (+0,1 bis +0,4 mm Durchmesser) werden alle runden inneren Löcher beim Export als STL oder 3MF entsprechend größer gerechnet.",
  "tipp": "Dein CAD-Modell selbst sowie STEP, IGES und BREP bleiben dabei unverändert exakt."
 },
 "printFit": {
  "tip": "Passungs-Vorgaben für 3D-Druckteile: lose 0,4 / gleitend 0,2 / fest 0,1 / Presssitz 0 mm",
  "hilfe": "Gedruckte Teile brauchen etwas Spiel, damit Bolzen, Stifte und Schrauben sauber passen. Wähle eine Vorgabe: bei Bohrungen wird das Spiel auf den Durchmesser addiert, bei Bolzen und Stiften abgezogen – als Projekt-Vorgabe oder direkt am Teil.",
  "tipp": "Für bewegliche Deckel und Gleitsitze nimm „Gleitend“ (0,2 mm), für stramme Verbindungen „Fest“ (0,1 mm)."
 },
 "nozzleWall": {
  "tip": "Prüft alle Wände gegen die gewählte Düse (Warnung unter 2 × Düse)",
  "hilfe": "Wände dünner als zwei Bahnen der Druckdüse (unter 2 × Düse, z. B. 0,8 mm bei einer 0,4-mm-Düse) druckt der Slicer nicht mehr stabil oder lässt Lücken. Tracery warnt im Projekt-Panel, an der Ampel und bei den Schwachstellen.",
  "tipp": "Klick auf „Stellen zeigen“, um alle zu dünnen Bereiche rot am Modell hervorzuheben."
 },
 "orientPrint": {
  "tip": "Dreht das Teil automatisch so, dass möglichst wenig Überhang entsteht",
  "hilfe": "„Für den Druck ausrichten“ prüft alle sinnvollen Liegerichtungen des Teils und dreht es in die Lage mit der kleinsten Überhangfläche und sicherem Stand auf dem Druckbett (Z = 0).",
  "tipp": "Wähle ein einzelnes Teil aus oder richte das ganze Modell auf einmal aus – ein Klick auf Rückgängig dreht es wieder zurück."
 },
 "userLibrary": {
  "tip": "Eigene Teile mit Vorschaubild und Maßen lokal speichern und überall einsetzen",
  "hilfe": "Rechtsklick auf ein Teil → „In meine Bibliothek“: Das Teil wird samt Vorschaubild in diesem Browser gespeichert. Alle benutzten Maße mit Namen (oder Zahlenmaße) wählst du als Eingabefelder aus. Unter „Bauteile → Meine Teile“ lässt es sich in jedes andere Projekt einsetzen und dort je Kopie mit eigenen Maßen anpassen.",
  "tipp": "Ideal für wiederkehrende Halterungen, Stecker-Ausschnitte oder fertige Baugruppen-Teile."
 },
 "drawingSheets": {
  "tip": "Mehrere Zeichnungsblätter unten über Tabs verwalten",
  "hilfe": "In der Tab-Leiste unten legst du mit „+ Blatt“ weitere Blätter an, wechselst zwischen ihnen, benennst sie um (Stift-Symbol oder Doppelklick) oder löschst einzelne Blätter. Beim PDF-Export landen alle Blätter nacheinander in einer einzigen PDF-Datei – jedes in seiner eigenen Seitengröße.",
  "tipp": "Wenn das Feld „Blatt“ im Schriftfeld leer bleibt, zählt Tracery automatisch als 1/2, 2/2 usw."
 },
 "drawingFormat": {
  "tip": "Blattformat A4 bis A0 im Hoch- oder Querformat wählen",
  "hilfe": "Du kannst jedes Blatt einzeln auf DIN A4, A3, A2, A1 oder A0 sowie zwischen Quer- und Hochformat umstellen. Rahmen (20 mm Heftrand links, 10 bzw. 20 mm Außenrand) und das Schriftfeld passen sich der gewählten Blattgröße automatisch an.",
  "tipp": "Größere Formate wie A2, A1 oder A0 eignen sich besonders für Baugruppen oder große Werkstücke im Maßstab 1:1."
 },
 "drawingViews": {
  "tip": "Isometrische oder freie 3D-Ansichten zur Zeichnung hinzufügen",
  "hilfe": "Über „Ansicht +“ oder rechts unter „Ansichten“ fügst du eine isometrische Ansicht oder eine freie Ansicht aus deiner aktuellen 3D-Kamera hinzu – wahlweise gleich schattiert. Bei freien Ansichten kannst du den Blickwinkel später über „Aktuelle 3D-Ansicht übernehmen“ aktualisieren.",
  "tipp": "Mit Klick auf eine Ansicht auf dem Blatt oder in der Liste rechts wählst du sie aus und stellst sie einzeln ein."
 },
 "drawingViewProps": {
  "tip": "Maßstab, Kantenarten und Schattierung je Ansicht einstellen",
  "hilfe": "Für die gewählte Ansicht legst du einen eigenen Maßstab („Wie Blatt“ oder einen Normmaßstab), verdeckte Kanten (gestrichelt), tangentiale Übergangskanten (dünne Volllinie an Rundungen) und eine schattierte 3D-Füllung fest. Alles wird auch im PDF und SVG gespeichert.",
  "tipp": "Schalte verdeckte Kanten in der Isometrie aus und nur in den Schnitt- oder Hauptansichten ein, damit das Blatt übersichtlich bleibt."
 },
 "drawingDetail": {
  "tip": "Ausschnitt einer Ansicht vergrößert als Detailansicht (z. B. Detail Z, 4:1) darstellen",
  "hilfe": "Ziehe einen Kreis um einen Bereich der Vorder-, Drauf- oder Seitenansicht, wähle den Vergrößerungsmaßstab (z. B. 2:1, 4:1 oder 5:1) sowie einen Kennbuchstaben und platziere die Detailansicht frei auf dem Blatt. Beide Stellen tragen denselben Kennbuchstaben, und Maße innerhalb der Detailansicht zeigen immer die wahren Längen am Modell.",
  "tipp": "Nach dem Platzieren kannst du die Detailansicht auf dem Blatt verschieben und Maßstab, Buchstabe oder Kreisradius rechts anpassen."
 },
 "drawingSection": {
  "tip": "Schnittlinie A–A durch eine Ansicht ziehen – Schnittansicht mit Schraffur erzeugen",
  "hilfe": "Klicke „Schnittansicht“ (Taste S) und ziehe mit gedrückter Maus oder zwei Klicks eine Schnittlinie quer durch eine Ansicht. Tracery schneidet das 3D-Modell an dieser Ebene, legt eine Schnittansicht („Schnitt A–A“) an und füllt alle geschnittenen Flächen mit normgerechter 45°-Schraffur.",
  "tipp": "Löcher und Hohlräume bleiben un-schraffiert. Rechts im Panel kannst du die Blickrichtung der Pfeile umkehren oder weitere Schnitte (B–B, C–C …) hinzufügen."
 },
 "drawingDimTypes": {
  "tip": "Maß-Arten: Kettenmaß, Bezugsmaß, Winkel, Radius (R), Durchmesser (Ø) und Fase (1×45°)",
  "hilfe": "Wähle rechts unter „Bemaßung“ oder über „Maß-Arten“ in der Leiste die gewünschte Maß-Art: Kettenmaß setzt mehrere Maße hintereinander auf eine Linie, Bezugsmaß staffelt alle Maße ab einer gemeinsamen Kante, Winkel misst zwischen zwei Kanten, R und Ø bemaßen Rundungen und Bohrungen, und Fase erkennt abgeschrägte Kanten wie 1×45°.",
  "tipp": "Bei Ketten- und Bezugsmaß klickst du einfach weitere Punkte an; Enter schließt die Reihe ab. Bei Winkelmaßen kannst du nach dem Anklicken rechts auf „Gegenwinkel“ umschalten."
 },
 "drawingCenters": {
  "tip": "Mittelkreuze und Mittellinien für Bohrungen und Zylinder automatisch ein- und ausblenden",
  "hilfe": "Bohrungen und Zylinder erhalten in jeder Ansicht automatisch strichpunktierte Mittelkreuze (Draufsicht bzw. Blick auf die Öffnung) und Mittellinien (Seiten- und Schnittansichten). Klicke ein einzelnes Mittelkreuz oder eine Mittellinie im Blatt an und drücke Entf (oder Rechtsklick → Ausblenden), um es auszublenden – oder schalte sie rechts in der Liste einzeln ein und aus.",
  "tipp": "Mit „Alle einblenden“ holst du einzeln ausgeblendete Mittellinien jederzeit mit einem Klick zurück; alle Änderungen lassen sich rückgängig machen."
 },
 "drawingDimStyle": {
  "tip": "Maß-Stil je Blatt festlegen: Pfeilart, Schriftgröße und Nachkommastellen",
  "hilfe": "Stelle für jedes Zeichnungsblatt getrennt ein, wie Maße gezeichnet werden: Pfeilart (gefüllt, offen, 45°-Schrägstrich oder Punkt), Schriftgröße in Millimetern (2,5 bis 10 mm) und die Anzahl der Nachkommastellen (0 bis 4 oder wie in den Einstellungen).",
  "tipp": "Alle Änderungen am Maß-Stil gelten sofort für alle Maße und Hinweislinien auf dem aktiven Blatt – auch in SVG, PDF und DXF."
 },
 "drawingLeader": {
  "tip": "Notiz mit Hinweislinie an eine Kante (Pfeil) oder Fläche (Punkt) heften",
  "hilfe": "Wähle „Hinweislinie“ (Taste N), klicke auf eine Kante (Pfeilspitze) oder direkt in eine Fläche (Punkt) einer Ansicht, platziere danach die Textfahne und gib deinen Text ein. Die Hinweislinie ist an die Ansicht gebunden und wandert beim Verschieben oder Maßstabswechsel exakt mit.",
  "tipp": "Nach dem Setzen kannst du die Textfahne frei verschieben, die Spitze zwischen Pfeil und Punkt umschalten und den Text per Doppelklick oder rechts bearbeiten."
 },
 "drawingTolerance": {
  "tip": "Toleranz (± symmetrisch, Abmaße oder Grenzmaße) und Passung an einem Maß festlegen",
  "hilfe": "Klicke auf dem Zeichnungsblatt ein Längen-, Durchmesser- oder Radiusmaß an. Rechts wählst du zwischen symmetrischer Toleranz (±), ungleichen Abmaßen (oben/unten), direkten Grenzmaßen (Höchst-/Mindestmaß) oder einer genormten ISO-286-Passung (wie H7 oder g6).",
  "tipp": "Ohne eigene Toleranz gilt die Allgemeintoleranz ISO 2768-m aus dem Schriftfeld. Alle Toleranzen werden im PDF-, SVG- und DXF-Export mit ausgegeben."
 },
 "drawingFit": {
  "tip": "ISO-286-Passungen (H7, g6, h6, k6, m6 …) aus der Normtabelle wählen",
  "hilfe": "Wähle ein Passungs-Kurzzeichen nach DIN EN ISO 286-2:2010: Großbuchstaben (z. B. H7, K7, P7) für Bohrungen, Kleinbuchstaben (z. B. g6, h6, k6, m6, p6) für Wellen. Tracery schlägt die Abmaße passend zum Nennmaß automatisch in der Tabelle nach (z. B. Ø20 H7 → +0,021 / 0 und Ø20 g6 → −0,007 / −0,020) und zeigt die Grenzmaße direkt daneben.",
  "tipp": "Unter „Anzeige“ stellst du ein, ob Kurzzeichen samt Abmaßen, nur das Kurzzeichen, nur Abmaße oder die Grenzmaße auf dem Blatt stehen."
 },
 "drawingLostDims": {
  "tip": "Verlorene Maße bei Modelländerungen erkennen, neu zuordnen oder löschen",
  "hilfe": "Änderst du das 3D-Modell, rechnen sich alle Ansichten und Maße automatisch neu aus – veränderte Längen, Durchmesser oder Radien zeigen direkt den neuen Wert. Fehlt eine Bohrung, Rundung oder Kante nach einer Änderung, wird ihr Maß auf dem Blatt rot markiert und oben rechts in der Liste „Verlorene Maße“ angezeigt.",
  "tipp": "Klicke in der Liste „Verlorene Maße“ auf „Neu zuordnen“, um das Maß samt Toleranz an eine andere Kante oder Bohrung zu hängen, oder auf „Löschen“."
 },
 "drawingExportDxf": {
  "tip": "Zeichnung als DXF-Datei mit Layern je Linienart speichern",
  "hilfe": "Speichert das aktive Zeichnungsblatt als DXF-Datei (AC1009/R12) in Millimetern mit echten Linien, Kreisen, Bögen, Texten und dem Schriftfeld. Sichtbare Kanten, verdeckte Kanten, Tangentialkanten, Mittellinien, Schraffuren, Schnittlinien, Bemaßungen und der Rahmen liegen auf eigenen Layern mit passenden Linienarten.",
  "tipp": "Bei mehreren Blättern kannst du zusätzlich alle Blätter zusammen als ZIP-Archiv speichern."
 },
 "drawingExportPng": {
  "tip": "Zeichnung als PNG-Bild in wählbarer Auflösung speichern",
  "hilfe": "Rendert das aktive Zeichnungsblatt gestochen scharf als PNG-Bild. Wähle eine feste Breite (1600, 2400 oder 3840 Pixel), eine Druckauflösung (150 oder 300 DPI) oder eine eigene Breite in Pixeln – die Höhe passt sich automatisch dem Blattformat an.",
  "tipp": "Aktiviere „Durchsichtiger Hintergrund“, wenn du die Zeichnung direkt in eine Präsentation oder Dokumentation einfügen willst."
 },
 "drawingBalloons": {
  "tip": "Positionsnummern (nummerierte Kreise mit Hinweislinie) an Teile und Gruppen setzen",
  "hilfe": "Setzt automatisch oder einzeln (Taste B) nummerierte Positionskreise mit Hinweislinie an jedes eindeutige Teil oder jede Gruppe auf dem Blatt. Die Nummern stimmen genau mit der Stückliste überein, wandern beim Verschieben einer Ansicht mit und lassen sich frei anordnen.",
  "tipp": "Gleiche Teile mit gleichem Namen und Werkstoff erhalten dieselbe Positionsnummer – so zeigt die Stückliste direkt die richtige Menge."
 },
 "drawingBom": {
  "tip": "Stückliste (Pos., Menge, Name, Werkstoff) direkt auf dem Zeichnungsblatt einblenden",
  "hilfe": "Zeigt die Stückliste des Modells als normgerechte Tabelle mit Positionsnummer, Menge, Teilename und Werkstoff (oder Kaufteil) auf dem Zeichnungsblatt – passend zur Stückliste unter „Projekt“. Die Tabelle steht standardmäßig über dem Schriftfeld und lässt sich auf dem Blatt frei verschieben.",
  "tipp": "Ändern sich Namen, Mengen oder Werkstoffe im Modell, aktualisieren sich Tabelle und Positionsnummern automatisch – auch in PDF, SVG und DXF."
 },
 "copyBetweenTabs": {
  "tip": "Ausgewählte Körper mit Strg C / Strg V in andere Projekte oder Tabs kopieren",
  "hilfe": "Kopiert die gewählten Körper samt ihren zugehörigen Schritten, Bohrungen, Rundungen, Werkstoffen, Farben und verwendeten Maßen in die Zwischenablage. Im anderen Projekt oder Browser-Tab fügt Strg V (oder Rechtsklick → Einfügen) alles wieder ein. Hängt ein Teil an Bezügen außerhalb der Auswahl, wird es automatisch als feste Form (BREP) mitgenommen.",
  "tipp": "Im selben Projekt rückt eingefügter Ersatz um 10 mm zur Seite; in einem anderen Tab landet der Körper genau an seiner ursprünglichen Stelle."
 },
 "projectTabs": {
  "tip": "Mehrere Projekte gleichzeitig in Tabs öffnen und wechseln",
  "hilfe": "In der Tab-Leiste oben arbeitest du an mehreren Projekten parallel. Mit „+“ öffnest du ein neues leeres Projekt, eine Vorlage, eine Datei oder ein bereits gespeichertes Projekt in einem neuen Tab. Ein Klick auf einen Tab wechselt samt eigenem Verlauf und eigenem Rückgängig dorthin; „×“ schließt den Tab und fragt bei ungespeicherten Änderungen nach.",
  "tipp": "Mit einem Doppelklick auf den Tab-Namen benennst du das Projekt um, und ein Rechtsklick schließt bei Bedarf alle anderen Tabs."
 },
 "multiWorker": {
  "tip": "Unabhängige Körper gleichzeitig auf mehreren Rechen-Helfern berechnen",
  "hilfe": "Enthält dein Projekt mehrere unabhängige Körper, verteilt Tracery sie automatisch auf bis zu 4 eigene Rechen-Helfer (je nach Anzahl der Kerne deines Rechners), ohne etwas aus dem Netz nachzuladen. Bei Bedarf kannst du das hier in den Profi-Einstellungen abschalten.",
  "tipp": "Körper, die voneinander abhängen (z. B. durch Vereinigen, Abziehen oder „Bis zur Fläche“), werden automatisch zusammen auf demselben Helfer gerechnet."
 },
 "language": {
  "tip": "Sprache der Oberfläche zwischen Deutsch und Englisch umschalten",
  "hilfe": "Stellt die Sprache von Menüs, Werkzeugen, Panels und Meldungen sofort um. Standardmäßig nutzt Tracery die Sprache deines Browsers (Englisch oder Deutsch, sonst Deutsch). Fehlt eine Übersetzung, erscheint automatisch der deutsche Text.",
  "tipp": "Du kannst jederzeit zwischen „Wie der Browser“, „Deutsch“ und „English“ wechseln – die Einstellung wird in deinem Browser gespeichert."
 },
 "tabletPanels": {
  "tip": "Seitenleiste ein- und ausklappen",
  "hilfe": "Auf schmalen Bildschirmen und am Tablet lassen sich Verlauf (links) und Eigenschaften (rechts) ein- und ausklappen, damit mehr Platz für die 3D-Ansicht bleibt. Tippe in die 3D-Ansicht oder auf das Schließen-Symbol, um die Leiste wieder einzuklappen.",
  "tipp": "Am Tablet wählt ein Antippen den Körper, und zwei Finger drehen und zoomen die Ansicht."
 },
 "assemblyDoc": {
  "tip": "Baugruppe aus eigenen Bauteil-Dokumenten als Verweise zusammensetzen",
  "hilfe": "Eine Baugruppe speichert keine Kopien deiner Bauteile, sondern nur Verweise auf deren Dokumente samt ihrer Lage im Raum. Änderst du ein Bauteil später in seinem eigenen Tab, aktualisiert sich die Baugruppe automatisch.",
  "tipp": "Klicke im Verlauf, im Eigenschaften-Panel oder per Doppelklick auf ein eingesetztes Teil, um direkt das zugehörige Bauteil zum Bearbeiten zu öffnen."
 },
 "insertPart": {
  "tip": "Ein Bauteil als Verweis mit eigener Lage in die Baugruppe einsetzen",
  "hilfe": "Öffnet eine Liste aller gespeicherten oder in Tabs geöffneten Bauteile. Das gewählte Bauteil erscheint in der Baugruppe als Verweis und lässt sich dort frei verschieben, drehen, färben oder mehrfach einsetzen.",
  "tipp": "Über „Bauteil öffnen“ springst du jederzeit in das Original-Bauteil, um Maße oder Skizzen zu ändern."
 },
 "assemblyPartTab": {
  "tip": "Bauteil aus einer Baugruppe im eigenen Tab öffnen und nach dem Speichern aktualisieren",
  "hilfe": "Mach einen Doppelklick auf ein Teil in der Baugruppe (im 3D-Bild oder links im Verlauf), um das zugehörige Bauteil in einem eigenen Tab zu öffnen. Dort siehst du alle seine eigenen Schritte und Maße. Nach dem Speichern oder beim Zurückwechseln aktualisiert sich die Baugruppe mit allen Kopien dieses Bauteils automatisch.",
  "tipp": "Oben im Bauteil-Tab erscheint ein Hinweis-Banner mit „Speichern“ und „Zurück zur Baugruppe“ – so wechselst du mit einem Klick zurück."
 },
 "mateCyl": {
  "tip": "Welle in Bohrung: Achsen deckungsgleich ausrichten, Drehen und Schieben erlauben",
  "hilfe": "Richtet zwei Teile entlang ihrer runden Flächen oder Kreisränder exakt auf derselben Achse aus. Danach lässt sich das zweite Teil frei um diese Achse drehen und entlang der Achse verschieben – genau wie ein Bolzen in einer Bohrung.",
  "tipp": "Klick zuerst auf die Bohrung am festen Teil und dann auf die Welle am beweglichen Teil. Rechts kannst du Winkel, Weg, Anschläge und „Bewegung abspielen“ nutzen."
 },
 "matePlanar": {
  "tip": "Fläche auf Fläche: bündig aneinanderlegen, Schieben in der Ebene und Drehen erlauben",
  "hilfe": "Legt zwei ebene Flächen verschiedener Teile ohne Abstand exakt aufeinander. Das zweite Teil lässt sich anschließend frei auf dieser Ebene in zwei Richtungen verschieben und um die Flächennormale drehen, ohne abzuheben.",
  "tipp": "Auch beim Ziehen mit der Maus im 3D-Bild oder beim Ändern von X/Y/Z bleibt der Abstand zwischen den beiden Flächen exakt 0."
 },
 "fixedJoint": {
  "tip": "Zwei Teile an gewählten Flächen oder Punkten fest verbinden",
  "hilfe": "Legt das zweite gewählte Teil bündig an das erste (Flächen gegeneinander und Mitten übereinander oder Punkt auf Punkt). Das verbundene Teil wandert bei jeder Bewegung oder Größenänderung des ersten Teils mit und lässt sich nicht mehr einzeln verschieben. Unter „Verbindungen“ links im Verlauf kannst du die Verbindung jederzeit umdrehen, drehen, einen Abstand setzen oder lösen.",
  "tipp": "Halte während der Wahl die rechte Maustaste gedrückt, um das Modell zu drehen und verdeckte Unterseiten bequem anzuklicken."
 },
 "mateParallel": {
  "tip": "Zwei ebene Flächen parallel zueinander ausrichten",
  "hilfe": "Dreht das zweite Teil so, dass beide gewählten Flächen exakt parallel stehen. Das Teil bleibt frei verschiebbar (in allen drei Richtungen) und lässt sich weiter um die Flächennormale drehen – und du kannst diese Verbindung mit weiteren Abständen oder Gelenken kombinieren.",
  "tipp": "Mit „Richtung umkehren“ im Eigenschaften-Panel drehst du die gewählte Fläche um 180° auf die Gegenseite."
 },
 "mateTangent": {
  "tip": "Ebene Fläche tangential an einen Zylinder legen",
  "hilfe": "Richtet eine ebene Fläche und eine runde Zylinderfläche so aus, dass sich beide genau an einer Linie berühren (Reihenfolge egal). Änderst du später den Durchmesser des Zylinders oder schiebst das erste Teil, wandert die tangentiale Lage automatisch mit.",
  "tipp": "Mit „Seite umkehren“ springt das Teil auf die gegenüberliegende Seite des Zylinders bzw. der Ebene."
 },
 "mateDistance": {
  "tip": "Zwei ebene Flächen parallel im festen Abstand halten",
  "hilfe": "Hält zwei ebene Flächen verschiedener Teile parallel und genau im angegebenen Abstand – mit Zahl, Einheit oder Formel (z. B. spalt + 2). Der Abstand lässt sich jederzeit rechts oder in der Maße-Tabelle ändern und mit weiteren Verbindungen (z. B. Eben oder einem zweiten Abstand quer dazu) kombinieren.",
  "tipp": "Ein negativer Abstand oder „Seite umkehren“ legt die Fläche auf die andere Seite – perfekt für Überlappungen oder Anschläge."
 },
 "subAssembly": {
  "tip": "Eine Baugruppe als bewegliches Ganzes in eine andere Baugruppe einsetzen",
  "hilfe": "Du kannst eine gespeicherte oder geöffnete Baugruppe genau wie ein Bauteil in eine größere Baugruppe einsetzen. Alle enthaltenen Teile und Unterbaugruppen bleiben verknüpft und bewegen, drehen und verschieben sich gemeinsam als eine Einheit.",
  "tipp": "Klicke im Verlauf auf den Pfeil neben der Unterbaugruppe, um ihre Teile anzusehen, oder öffne sie zum Bearbeiten per Doppelklick im eigenen Tab."
 },
 "groundPart": {
  "tip": "Ein Teil fest an seiner Stelle verankern, damit nichts verrutscht",
  "hilfe": "Per Rechtsklick → „Festsetzen“ wird ein Teil wie an einem Schraubstock fixiert. Es lässt sich weder mit der Maus noch über Pfeiltasten, Lage-Felder oder Verbindungen und Gelenke verschieben. Im Verlauf links zeigt ein Schloss-Symbol den festen Stand.",
  "tipp": "Setze in jeder Baugruppe zuerst das Grundteil fest, bevor du andere Teile damit verbindest – mit Rechtsklick → „Festsetzen lösen“ gibst du es jederzeit wieder frei."
 },
 "mateAngle": {
  "tip": "Zwei ebene Flächen oder gerade Kanten in einem genauen Winkel zueinander ausrichten",
  "hilfe": "Dreht das zweite gewählte Teil so, dass seine Fläche oder Kante exakt im eingestellten Winkel zur Fläche oder Kante des ersten Teils steht. Der Winkel lässt sich rechts jederzeit als Zahl oder als Formel mit Maßen (z. B. Neigung) ändern und bei Bedarf umkehren.",
  "tipp": "Du kannst zwei Flächen, zwei gerade Kanten oder auch eine Fläche mit einer Kante verbinden."
 },
 "mateCenter": {
  "tip": "Ein Teil genau mittig zwischen zwei parallelen Flächen eines anderen ausrichten",
  "hilfe": "Wähle zuerst zwei gegenüberliegende parallele Flächen (z. B. die beiden Seitenwände einer Nut) und danach das Teil oder zwei seiner eigenen Außenflächen. Tracery stellt das Teil so ein, dass links und rechts exakt derselbe Abstand bleibt – auch wenn du die Nut oder das Teil später verschiebst oder in der Größe änderst.",
  "tipp": "Im Modus „Ganzes Teil“ reichen 3 Klicks (Nutwand 1, Nutwand 2, Teil); mit „2 Flächen“ richtest du zusätzlich eine schiefe Ausrichtung über zwei Außenflächen exakt parallel zu den Nutwänden aus."
 },
 "mateBall": {
  "tip": "Kugelgelenk: zwei Punkte fallen zusammen, Drehen in alle Richtungen frei",
  "hilfe": "Legt einen gewählten Punkt (oder die Mitte einer Kugel) am zweiten Teil genau auf einen Punkt am ersten Teil. Beide Punkte bleiben zusammen, während sich das zweite Teil frei um X, Y und Z in alle Richtungen drehen lässt.",
  "tipp": "Auch wenn du das Teil mit der Maus ziehst oder rechts bei der Lage verschiebst, bleibt der Gelenkpunkt fest am Platz."
 },
 "mateSlot": {
  "tip": "Stift im Langloch: gleitet entlang der Mittellinie bis zum Endanschlag",
  "hilfe": "Setzt einen Stift (Zylinder, Kreisrand oder Punkt) genau auf die Mittellinie eines Langlochs. Der Stift lässt sich entlang des Langlochs schieben und drehen und bleibt am Anfang und Ende des Langlochs automatisch am Anschlag stehen.",
  "tipp": "Klick zuerst auf die Innenfläche oder den Rand des Langlochs und dann auf den Stift. Rechts kannst du Weg, Drehwinkel und die Anschläge jederzeit anpassen."
 },
 "dockSnap": {
  "tip": "Andock-Punkte beim Ziehen: automatisch einrasten und verbinden",
  "hilfe": "Beim Ziehen eines Teils zeigen sich Lochmitten, Flächenmitten und Kantenmitten an den anderen Teilen. Ziehst du ein Teil (zum Beispiel eine Schraube) nahe an einen passenden Punkt, rastet es genau ausgerichtet ein. Im Modus „Einfach“ wird dabei automatisch eine feste Verbindung angelegt, im Modus „Profi“ wählst du beim Loslassen die gewünschte Verbindungsart.",
  "tipp": "Halte Strg (Mac: cmd) gedrückt, um frei ohne Einrasten zu ziehen. In der Profi-Auswahl übernimmt Enter „Fest“ und Esc rastet nur ohne Verbindung ein."
 },
 "clashCheck": {
  "tip": "Prüft alle Teile der Baugruppe paarweise auf Durchdringungen und listet jede Überschneidung",
  "hilfe": "Sucht in der ganzen Baugruppe nach Stellen, an denen zwei Teile ineinanderstecken. Jedes betroffene Paar erscheint in einer Liste mit seinem Überschneidungs-Volumen. Klickst du auf einen Eintrag, springt die Kamera direkt hin und hebt den gemeinsamen Überschneidungskörper rot hervor.",
  "tipp": "Teile, die sich nur exakt Fläche an Fläche berühren, werden nicht als Fehler gemeldet – nur echte Überschneidungen mit Volumen."
 },
 "replacePart": {
  "tip": "Tauscht das gewählte Teil gegen ein anderes Bauteil oder eine STEP- bzw. Projektdatei aus",
  "hilfe": "Rechtsklick auf ein Teil → „Teil ersetzen …“ tauscht es gegen ein gespeichertes Bauteil, eine Unterbaugruppe oder eine Datei (.step, .tracery.json) aus. Die Lage bleibt erhalten, und passende Verbindungen richten das neue Teil automatisch wieder an seinem Platz aus.",
  "tipp": "Verbindungen auf Flächen oder Kanten, die es am neuen Teil nicht mehr gibt (z. B. Kugel statt Quader), werden sauber entfernt – mit Strg+Z machst du den ganzen Tausch rückgängig."
 },
 "insertFromFile": {
  "tip": "Setzt eine STEP-Datei oder ein gespeichertes Tracery-Projekt als Teil ins offene Modell ein",
  "hilfe": "Lädt eine CAD-Datei (.step, .iges, .brep, .stl) oder ein anderes Tracery-Projekt (.tracery.json) direkt in das laufende Projekt, ohne dein bisheriges Modell zu schließen. Eingefügte Tracery-Projekte bleiben als verknüpfte Bauteile bearbeitbar.",
  "tipp": "Ideal, um Zukaufteile aus dem Netz (STEP) oder fertige eigene Bauteile direkt in deine Baugruppe einzusetzen."
 },
 "partProps": {
  "tip": "Teilenummer, Beschreibung, Lieferant und Stückpreis für dieses Teil eintragen",
  "hilfe": "Hier hinterlegst du feste Angaben zum Teil – wie Teilenummer, kurze Beschreibung, Lieferant und Stückpreis in Euro. Alle Werte erscheinen als eigene Spalten in der Stückliste und im CSV-Export, und die Stückliste rechnet automatisch den Gesamtpreis aller Teile aus.",
  "tipp": "Gleiche Teile mit denselben Angaben werden in der Stückliste automatisch zusammengefasst und mit ihrer Stückzahl malgenommen."
 },
 "dimModes": {
  "tip": "Maß-Art wählen: automatisch, Bogenlänge, Winkel über 3 Punkte oder Koordinatenmaße",
  "hilfe": "Mit „Automatisch“ bemaßt du Linien, Kreise, Abstände und Winkel wie gewohnt. Für Sonderfälle wählst du „Bogenlänge“ (Länge entlang des Bogens statt Radius), „Winkel über 3 Punkte“ (Endpunkt, Scheitelpunkt, Endpunkt) oder im Profi-Modus „Koordinatenmaße“ von einer gemeinsamen Nullkante.",
  "tipp": "Bei einem Bogen kannst du auch direkt im kleinen Eingabefeld über das Symbol ⌒ zwischen Radius und Bogenlänge umschalten."
 },
 "ordinateDim": {
  "tip": "Alle Abstände von einer gemeinsamen Nullkante oder einem Nullpunkt messen",
  "hilfe": "Koordinatenmaße (Profi) sparen Maßketten: Klicke zuerst eine Linie als Nullkante (0) an und danach der Reihe nach alle Punkte oder Kanten. Jedes Maß wird ab derselben Nullkante gemessen – positive Werte auf der ersten Seite, negative auf der Gegenseite.",
  "tipp": "Mit „Neue Nullkante wählen“ oder Esc setzt du den Bezug jederzeit neu."
 },
 "circleEdgeDim": {
  "tip": "Abstand zwischen zwei Kreisen: Mitte, kleinster oder größter Randabstand",
  "hilfe": "Klickst du im Maß-Werkzeug zwei Kreise oder Bögen nacheinander an, misst Tracery wahlweise von Mitte zu Mitte, den kleinsten Abstand zwischen den Rändern (Wandstärke dazwischen) oder den größten Abstand bis zu den Außenkanten.",
  "tipp": "Du kannst die Art rechts im Panel vorab wählen oder jederzeit direkt im kleinen Maßfeld zwischen Mitte, Min und Max umschalten."
 },
 "sketchLock": {
  "tip": "Skizze komplett sperren, damit nichts mehr versehentlich verrutscht",
  "hilfe": "Ein Klick auf das Schloss friert die ganze Skizze ein: Alle Maße, Regeln und Linien bleiben fest am Platz, nichts lässt sich mehr verschieben, zeichnen oder löschen. Auswählen, prüfen und zu einem Körper fertigstellen bleibt weiter möglich.",
  "tipp": "Die Sperre bleibt auch beim Speichern im Projekt erhalten – ein zweiter Klick auf das Schloss gibt die Skizze wieder frei."
 },
 "revolveAxis": {
  "tip": "Linie als Drehachse markieren, damit „Drehen“ sie von selbst übernimmt",
  "hilfe": "Hake bei einer gewählten Linie „Als Drehachse markieren“ an. Sie erscheint dann als lila Strichpunkt-Achse und „Fertig → Drehen“ benutzt sie automatisch als Achse für den Drehkörper.",
  "tipp": "Pro Skizze kann genau eine Linie als Drehachse markiert sein; eine alleinstehende Drehachse wird nicht als offenes Ende bemängelt."
 },
 "ellipseArc": {
  "tip": "Teil einer Ellipse (elliptischer Bogen) zeichnen",
  "hilfe": "Klick zuerst den Mittelpunkt, dann das Ende der ersten Halbachse, die zweite Halbachse sowie Start- und Endwinkel. Oder tipp nach dem Mittelpunkt direkt beide Halbachsen mit Tab dazwischen ein.",
  "tipp": "Schließt du die Enden mit einer Linie oder einem weiteren Bogen, entsteht sofort eine geschlossene Fläche zum Hochziehen."
 },
 "sketchShapes": {
  "tip": "Fertige Formen wie Stern, Pfeil, Herz, Zahnrad-Umriss oder Schlüsselloch einfügen",
  "hilfe": "Wähl eine Form aus der Sammlung, stell die Maße wie Zacken, Radien, Modul oder Breite ein und klick auf „In Mitte einfügen“ oder platziere sie frei im Bild.",
  "tipp": "Jede Form ist sofort ein geschlossener Umriss und lässt sich direkt hochziehen oder mit anderen Linien weiterbearbeiten."
 },
 "formulaCurve": {
  "tip": "Kurve aus einer mathematischen Formel (y = f(x) oder x(t), y(t)) erzeugen",
  "hilfe": "Gib eine Gleichung wie y = sin(x) oder parametrisch x(t) und y(t) samt Bereich (z. B. 0 bis 2*pi) und Punktzahl an – oder wähl eine Vorlage wie Sinus oder Evolvente. Während du tippst, siehst du die Kurve gestrichelt in der Vorschau.",
  "tipp": "Hier rechnen sin, cos und tan im Bogenmaß (Radiant), und du kannst neben pi/π auch Projektmaße aus „Maße“ verwenden."
 },
 "csvCurve": {
  "tip": "Kurve durch 2D-Punkte aus einer CSV-Datei oder Texttabelle anlegen",
  "hilfe": "Lade eine .csv- oder Textdatei mit X/Y-Koordinaten (oder füg die Zeilen direkt ins Textfeld ein) und wähl zwischen einer weichen Spline genau durch alle Punkte oder einem geraden Linienzug.",
  "tipp": "Spalten dürfen mit Semikolon (;), Komma (,), Tab oder Leerzeichen getrennt sein; eine Überschrift wie x;y wird automatisch übersprungen."
 },
 "datumPointCom": {
  "tip": "Bezugspunkt genau im Volumen-Schwerpunkt eines Körpers anlegen",
  "hilfe": "Legt einen Bezugspunkt im räumlichen Schwerpunkt des gewählten Körpers an. Ändert sich die Größe, Form oder Lage des Körpers (z. B. durch Bohrungen oder Verschieben), wandert der Punkt automatisch in den neuen Schwerpunkt mit.",
  "tipp": "Praktisch, um eine Achse oder ein eigenes Koordinatensystem exakt durch die Mitte der Masse eines unregelmäßigen Bauteils zu legen."
 },
 "datumStyle": {
  "tip": "Bezugsebene größer ziehen und zur besseren Übersicht einfärben",
  "hilfe": "Zieh im 3D-Bild an einem der vier weißen Ecken-Griffe einer gewählten Bezugsebene, um ihre dargestellte Breite und Höhe frei anzupassen – oder tipp die Maße hier ein. Darunter kannst du die Ebene farblich markieren.",
  "tipp": "Halte beim Ziehen die Alt-Taste für eine quadratische Ebene oder die Umschalttaste für feine 0,1-mm-Schritte."
 },
 "datumSeries": {
  "tip": "Mehrere parallele Bezugsebenen im gleichen Abstand auf einmal anlegen",
  "hilfe": "Erzeugt eine Ebenen-Schar aus beliebig vielen parallelen Bezugsebenen (z. B. 4 Ebenen alle 10 mm) ausgehend von einer Grundebene, einer gewählten ebenen Fläche oder einer bestehenden Bezugsebene – alles in einem Rückgängig-Schritt.",
  "tipp": "Ideal für Spanten, Rippen oder Schnitte in festen Abständen; als Abstand kannst du auch eine Formel mit Projektmaßen eingeben."
 },
 "deleteBody": {
  "tip": "Körper als Schritt im Verlauf löschen (abschaltbar – kommt beim Unterdrücken zurück)",
  "hilfe": "Entfernt den gewählten Körper ab diesem Schritt aus dem Modell, ohne ihn aus der Zeitleiste zu tilgen. Frühere Schritte wie Kopien oder Ableitungen bleiben erhalten, und durch Unterdrücken oder Zurückrollen des Markers ist der Körper sofort wieder da.",
  "tipp": "Ideal für Hilfskörper zum Ausrichten oder Verrechnen, die am Ende nicht mehr im fertigen Bauteil erscheinen sollen."
 },
 "measureParam": {
  "tip": "Maß direkt aus einer Kantenlänge am Modell übernehmen (wandert mit)",
  "hilfe": "Klicke auf das Lineal-Symbol und wähle danach eine Kante im 3D-Bild. Tracery legt unter „Maße“ einen verknüpften Messwert an und trägt ihn als Formel hier ein. Ändert sich die Kante später, wächst oder schrumpft dieses Maß automatisch mit.",
  "tipp": "Du kannst den angelegten Messwert-Namen im Feld auch weiterrechnen lassen, zum Beispiel als „Messung_1 / 2“ oder „Messung_1 + 2“."
 },
 "helix": {
  "tip": "Feder, Kegel-Feder oder flache Spirale mit Steigung, Windungen und Draht-Ø anlegen",
  "hilfe": "Legt eine räumliche Schraubenlinie (zylindrisch oder konisch mit Anfangs- und Endradius) oder eine flache Spirale an und zieht einen Kreis (Draht-Ø), ein Rechteck oder einen eigenen Skizzen-Umriss daran entlang. Im Modus „Einfach“ erhältst du sofort eine fertige Feder mit Draht-Ø.",
  "tipp": "Im Profi-Modus kannst du frei wählen, ob du die Feder über Steigung & Windungen, Höhe & Windungen oder Höhe & Steigung festlegst – in allen Feldern funktionieren Formeln."
 },
 "sweepTwist": {
  "tip": "Querschnitt über die gesamte Pfadlänge um einen Winkel verdrehen",
  "hilfe": "Dreht den Querschnitt beim Ziehen entlang des Pfads gleichmäßig vom Anfang bis zum Ende – z. B. um 90° für eine Vierteldrehung oder −90° in Gegenrichtung. Funktioniert bei geraden Linien, gebogenen Kurven und 3D-Pfaden sowie mit Formeln.",
  "tipp": "Ideal für gedrehte Streben, Propeller-Übergänge oder geführte Drall-Kanäle. Bei engen Kurven einen kleineren Winkel oder schmaleren Querschnitt wählen."
 },
 "sweepCut": {
  "tip": "Entlang Pfad direkt von einem Körper abziehen (z. B. Nut entlang einer Kurve)",
  "hilfe": "Schneidet das entlang des Pfads gezogene Profil sofort als Nut, Rille oder Kanal aus einem bestehenden Körper heraus – wahlweise gleich beim Abschließen der Skizze oder nachträglich rechts unter „Körper“.",
  "tipp": "Zeichne den Pfad direkt auf der Oberfläche des Körpers; mit der Querschnitts-Höhe bestimmst du, wie tief die Nut einschneidet."
 },
 "exportAmfPly": {
  "tip": "Als AMF (Druck-XML mit Farben) oder PLY (Polygonnetz für Scans & Blender) speichern",
  "hilfe": "AMF (Additive Manufacturing File Format) speichert Dreiecksnetze als XML mit Maßeinheit, Teilenamen und Farben für Slicer. PLY (Polygon File Format) schreibt ein kompaktes binäres Polygonnetz mit Eckpunkt-Farben – ideal für 3D-Scans, MeshLab und Blender.",
  "tipp": "Beide Formate unterstützen „Nur die Auswahl“, „Jeder Körper als eigene Datei“ und einen gewählten Nullpunkt; beim Wiederöffnen in Tracery bleiben Dreiecksanzahl, Maße und Farben erhalten."
 },
 "pointCloudImport": {
  "tip": "CSV- oder XYZ-Punktedatei als 3D-Punktwolke oder Skizzenpunkte laden",
  "hilfe": "Liest Mess- und Scan-Punkte aus .csv- oder .xyz-Dateien (Komma, Semikolon, Tab oder Leerzeichen als Trenner, optional mit Überschrift und RGB-Farben). Du kannst sie als 3D-Punktwolke im Raum anzeigen oder direkt als Skizzenpunkte bzw. Spline auf der XY-Ebene anlegen.",
  "tipp": "Eine 3D-Punktwolke lässt sich rechts in Punktgröße, Farbe und Maßeinheit anpassen und jederzeit über „Als Skizzenpunkte übernehmen“ in eine Skizze übertragen."
 },
 "draftAnalysis": {
  "tip": "Schräge und Hinterschnitte für Guss- oder Spritzgussformen farbig prüfen",
  "hilfe": "Färbt alle Flächen passend zur gewählten Entformungsrichtung: Grün bedeutet genug Entformungsschräge ab dem eingestellten Winkel, Gelb bedeutet zu wenig Schräge (z. B. senkrechte Wände), und Rot zeigt Hinterschnitte, an denen das Teil in der Form hängen bleibt.",
  "tipp": "Wähl über „Fläche“ direkt eine ebene Modellfläche als Auszugsrichtung und schalte bei einteiligen Formen (z. B. Silikonabguss) „Zweiteilige Form“ aus."
 },
 "settingsFile": {
  "tip": "Persönliche Einstellungen als Datei speichern oder laden",
  "hilfe": "Sichert Tastenkürzel, Werkzeugleisten-Favoriten, Maus-Steuerung, Nachkommastellen, Oberflächen-Größe, Sprache und Darstellungs-Einstellungen in einer .json-Datei – praktisch zum Mitnehmen auf einen anderen Rechner.",
  "tipp": "Gespeicherte Einstellungsdateien kannst du auch einfach ins Fenster ziehen oder über „Datei öffnen“ laden."
 },
 "uiScale": {
  "tip": "Größe von Schriften, Knöpfen und Leisten (80–150 %)",
  "hilfe": "Vergrößert oder verkleinert die gesamte Bedienoberfläche stufenlos von 80 % bis 150 % oder über die Schnellwahl-Knöpfe. Die 3D-Ansicht bleibt unabhängig davon gestochen scharf.",
  "tipp": "Auf großen oder hochauflösenden Bildschirmen helfen 125 % oder 150 % für entspanntes Lesen."
 },
 "fullFillet": {
  "tip": "Drei Flächen wählen – die mittlere wird nahtlos ganz rund (z. B. Steg-Ende)",
  "hilfe": "Klicke nacheinander erste Seitenfläche, mittlere Stirnfläche und zweite Seitenfläche eines Körpers an. Tracery rundet die mittlere Fläche mit dem exakten vollen Radius zwischen den beiden Seitenflächen ab.",
  "tipp": "Ideal für abgerundete Stege, Laschen oder Rippenenden – der Radius passt sich automatisch an, wenn sich die Steg-Dicke später ändert."
 },
 "cornerChamfer": {
  "tip": "Eine Körper-Ecke schräg mit drei verschiedenen Abständen abschneiden",
  "hilfe": "Klicke eine Ecke an, in der drei Kanten zusammenlaufen. Danach kannst du rechts für jede der drei Kanten einen eigenen Abstand einstellen (oder als Formel eingeben), sodass eine dreieckige schräge Fläche entsteht.",
  "tipp": "Mit dem Dreh-Symbol neben „Ecken-Fase“ tauschst du die drei Abstände reihum durch die drei Kanten."
 },
 "calcCancel": {
  "tip": "Laufende Berechnung abbrechen und zum letzten guten Stand zurückkehren",
  "hilfe": "Dauert ein Rechenschritt länger als 2 Sekunden, erscheint hier „Abbrechen“. Ein Klick stoppt den CAD-Kern sofort und stellt automatisch das zuletzt fertig gerechnete Modell wieder her.",
  "tipp": "Ideal bei versehentlich zu feinen Rundungen, großen Mustern oder komplexen Texten – nichts geht verloren."
 },
 "noticeCenter": {
  "tip": "Meldungs-Zentrale: Fehler und Hinweise dieser Sitzung ansehen",
  "hilfe": "Die Glocke sammelt alle Rechenfehler, Warnungen und Hinweise dieser Sitzung mit genauer Uhrzeit. Du kannst nach Fehlern oder Hinweisen filtern und bei Schritt-Fehlern mit „Hinspringen“ direkt das betroffene Teil markieren.",
  "tipp": "Ein roter Punkt zeigt unbehobene oder neue Fehler; über „Leeren“ räumst du die Liste wieder auf."
 },
 "thirdPartyLibs": {
  "tip": "Liste aller mitgelieferten fremden Bausteine mit Lizenz und Lizenztext anzeigen",
  "hilfe": "Zeigt alle fremden Bibliotheken und Schriften an, die Tracery mitliefert – zum Beispiel three.js für die 3D-Ansicht, die Schrift Inter sowie OpenCascade und replicad – jeweils mit Urheber, Lizenzart und dem zugehörigen Lizenztext.",
  "tipp": "Klick bei einem Baustein auf „Lizenztext anzeigen“, um die vollständigen Bedingungen einzublenden."
 },
 "curvatureComb": {
  "tip": "Krümmungskamm an Splines, Bögen und Ellipsen ein- oder ausblenden (Profi)",
  "hilfe": "Zeigt entlang von Splines, Kreisbögen, Ellipsen und Teil-Ellipsen feine Striche nach außen, deren Länge genau der Krümmung an jeder Stelle entspricht. Je länger die Zähne, desto stärker die Biegung – Sprünge oder Wellen in einer Kurve werden sofort sichtbar.",
  "tipp": "Ideal zum Prüfen weicher Übergänge (z. B. nach „Krümmungsglatt (G2)“): Stoßen zwei Kurven glatt aneinander, treffen auch ihre Krümmungskämme genau auf gleicher Höhe zusammen."
 },
 "cCurvature": {
  "tip": "Krümmungsglatt (G2): Spline geht nicht nur glatt, sondern auch mit gleicher Krümmung in die Nachbarkurve über (Profi)",
  "hilfe": "Verbindet ein Ende einer offenen Spline (mit mindestens 3 Punkten) mit einem Bogen, einer Linie, einer anderen Spline oder einem Kreis, sodass am Übergang Punkt, Richtung (Tangente) und Krümmungsradius nahtlos übereinstimmen.",
  "tipp": "Schalte „Krümmung zeigen“ ein, um den nahtlosen Übergang direkt als gleich hohen Krümmungskamm zu prüfen."
 },
 "stretch2d": {
  "tip": "Einen Teil der Skizze per Rahmen in eine Richtung strecken",
  "hilfe": "Zieh im Profi-Modus einen Rahmen über die Endpunkte oder Kanten, die wandern sollen. Danach gibst du rechts die Richtung (X, Y, Winkel oder X/Y) und den Weg ein. Nur die Punkte im Rahmen verschieben sich, der Rest bleibt stehen und bestehende Regeln sowie Maße bleiben erhalten.",
  "tipp": "Zieh den Rahmen zum Beispiel nur über die rechte Kante eines Rechtecks und gib 5 mm in X ein – die linke Kante bleibt stehen und die Breite wächst um 5 mm."
 },
 "liveMirror": {
  "tip": "Live-Spiegeln: Alles neu Gezeichnete entsteht sofort auch gespiegelt",
  "hilfe": "Schalte im Profi-Modus „Live-Spiegeln“ ein und wähle eine vorhandene Linie (oder die X-/Y-Achse). Jede Linie, jeder Kreis, Bogen, Spline oder Umriss, den du danach zeichnest, entsteht sofort auch gespiegelt mit der Regel „Symmetrisch“ – so bleiben beide Seiten dauerhaft verknüpft.",
  "tipp": "Klick oben oder rechts erneut auf „Live-Spiegeln“, um das automatische Spiegeln wieder auszuschalten."
 },
 "innerRadius": {
  "tip": "Innenrundungen prüfen: Sind alle Ecken groß genug für den Fräser?",
  "hilfe": "Misst alle nach innen gewölbten Rundungen und Bohrungen am Modell und vergleicht sie mit deinem eingestellten Fräser-Radius. Alles, was kleiner als der Fräser ist, leuchtet rot auf und erscheint in der Liste – so siehst du sofort, wo der Fräser nicht hineinkommt.",
  "tipp": "Mit „Bohrungen mitprüfen“ kannst du festlegen, ob kreisrunde Löcher (die meist gebohrt werden) mitgezählt werden oder nur gefräste Taschen-Ecken."
 },
 "symmetryCheck": {
  "tip": "Prüft, ob das Modell zu einer gewählten Ebene genau spiegelgleich ist",
  "hilfe": "Spiegelt alle sichtbaren Körper an einer Grundebene (YZ, XZ, XY), einer Bezugsebene oder einer ebenen Fläche und vergleicht sie exakt mit dem Original. Unterschiede erscheinen farbig im Bild: Rot liegt nur auf dieser Seite, Blau fehlt auf der Gegenseite.",
  "tipp": "Liegt dein Teil nicht genau auf dem Nullpunkt, klick auf „Mitte“, um die Prüfebene automatisch in die Bauteilmitte zu schieben."
 },
 "patternCurve2d": {
  "tip": "Elemente der Skizze entlang einer Linie, eines Bogens oder einer Spline vervielfältigen",
  "hilfe": "Wähle zuerst die Elemente, die wiederholt werden sollen, und klick dann auf „Leitkurve wählen“, um eine Linie, einen Bogen, einen Kreis oder eine Spline anzuklicken. Du kannst eine feste Anzahl über die gesamte Kurve verteilen oder einen genauen Abstand entlang der Kurve vorgeben.",
  "tipp": "Mit „An Kurve ausrichten“ drehen sich die Kopien mit der Kurve mit – praktisch für Schlitze oder Zähne auf einem Bogen."
 },
 "patternFill2d": {
  "tip": "Eine geschlossene Fläche automatisch mit Löchern füllen (Raster, versetzt oder Waben)",
  "hilfe": "Klick eine geschlossene Fläche in der Skizze an (bei nur einer Fläche ist sie schon gewählt). Stelle Musterart (Raster, versetzte Kreise oder Sechseck-Waben), Lochgröße, Abstand von Mitte zu Mitte und Randabstand ein – kein Loch schneidet den Rand.",
  "tipp": "Der Steg zwischen den Löchern ist Abstand minus Lochgröße. Nach „Füllung anlegen“ lässt sich jedes Loch wie gewohnt einzeln bearbeiten oder löschen."
 },
 "conic2d": {
  "tip": "Kegelschnitt aus Start, Ende, Schulterpunkt und Rho-Wert",
  "hilfe": "Klicke im Profi-Modus Startpunkt, Endpunkt und den spitzen Schulterpunkt (Tangentenschnittpunkt) an und ziehe die Kurve über den Rho-Wert auf (oder tippe ihn ein). Unter 0,5 entsteht ein Ellipsenstück, bei genau 0,5 eine Parabel und darüber eine Hyperbel.",
  "tipp": "Mit Rho = 0,5 bekommst du exakt eine Parabel; den Rho-Wert kannst du danach rechts jederzeit zwischen 0,05 und 0,95 nachstellen."
 },
 "bridge2d": {
  "tip": "Brückenkurve: weicher Übergang zwischen zwei offenen Kurvenenden",
  "hilfe": "Klicke im Profi-Modus nacheinander zwei offene Kurvenenden (Linie, Bogen, Teil-Ellipse, Spline, Kegelschnitt oder Brücke) an. Wähle rechts „Tangential (G1)“ für einen knickfreien Übergang oder „Krümmungsglatt (G2)“, wenn auch die Krümmung ohne Sprung anschließen soll.",
  "tipp": "Mit „Stärke 1“ und „Stärke 2“ steuerst du, wie weit die Brückenkurve an jedem Ende in die bestehende Richtung weiterläuft. Änderst du später eine der beiden Kurven, wandert die Brücke automatisch mit."
 },
 "splineControl": {
  "tip": "Weiche Formkurve über Kontrollpunkte (Profi)",
  "hilfe": "Bei „Mit Kontrollpunkten“ beginnt die Kurve exakt im ersten Punkt und endet im letzten Punkt. Alle Punkte dazwischen ziehen die Kurve wie Magnete weich an, ohne dass sie durch jeden Punkt hindurch muss.",
  "tipp": "Ideal für glatte Übergänge ohne Dellen – am rechten Rand oder vor dem Zeichnen kannst du jederzeit zwischen „Durch Punkte“ und „Mit Kontrollpunkten“ wechseln."
 },
 "splineHandles": {
  "tip": "Tangenten-Griffe an jedem Punkt einer Durchgangs-Spline einstellen (Profi)",
  "hilfe": "Wähle eine Durchgangs-Spline aus, um an jedem Punkt einen Griff für Richtung (Winkel) und Stärke (Länge) der Tangente zu sehen. Ziehe ein Griffende direkt im Bild oder gib Winkel und Stärke rechts bzw. mit dem Maß-Werkzeug (D) exakt ein.",
  "tipp": "Mit „Griff zurücksetzen“ übernimmt der Punkt wieder automatisch die weiche Standard-Tangente seiner Nachbarpunkte."
 },
 "sketchBlocks": {
  "tip": "Skizzen-Blöcke: Gruppen aus Elementen speichern, mehrfach einsetzen und zentral ändern (Profi)",
  "hilfe": "Wähle in der Skizze ein oder mehrere zusammengehörige Elemente (z. B. ein Lochbild oder Profil) und speichere sie mit „Als Block speichern“ als wiederverwendbaren Block. Mit dem Block-Werkzeug setzt du beliebig viele Einsätze ab und kannst jeden Einsatz verschieben oder drehen.",
  "tipp": "Wenn du einen Block über „Block bearbeiten“ öffnest und zum Beispiel einen Kreisradius änderst, passen sich sofort alle Einsätze dieses Blocks in der Skizze automatisch an. Mit „Block auflösen“ wird ein einzelner Einsatz wieder zu normalen Skizzen-Elementen."
 },
 "silhouette2d": {
  "tip": "Umriss holen (Silhouette): Äußeren Schatten-Umriss eines Körpers auf die Skizzen-Ebene projizieren (Profi)",
  "hilfe": "Klick im Profi-Modus einen Körper im Bild an – Tracery projiziert seinen äußeren Umriss (ohne innere Kanten) auf die Skizzen-Ebene. Ändert sich der Körper später, wandert der Umriss automatisch mit.",
  "tipp": "Ideal für Schattenrisse von Rohren, Wellen oder liegenden Zylindern, um passende Ausschnitte oder Halter drum herum zu zeichnen."
 },
 "intersectCurve2d": {
  "tip": "Schnittkurve zweier Flächen verbunden in die Skizze holen (Profi)",
  "hilfe": "Klick im Profi-Modus nacheinander zwei sich schneidende Flächen an (vom selben oder von zwei verschiedenen Körpern). Die exakte 3D-Schnittlinie wird auf die Skizzen-Ebene projiziert und bleibt mit beiden Flächen verbunden.",
  "tipp": "Damit übernimmst du z. B. die genaue Durchdringungskurve zweier Rohre oder gebogener Schalen direkt in deine Skizze."
 },
 "polarGrid": {
  "tip": "Zwischen rechteckigem und polarem Raster (Ringe und Strahlen) umschalten (Profi)",
  "hilfe": "Im Profi-Modus schaltet das polare Raster konzentrische Ringe um den Nullpunkt und Winkelstrahlen ein. Punkte und Zeichenwerkzeuge fangen genau auf jedem Ring-Abstand und Winkel-Schritt.",
  "tipp": "Mit einem Klick auf das Ecksymbol links oben zwischen den Linealen schaltest du jederzeit direkt zwischen rechteckig und polar um."
 },
 "rulerGuides": {
  "tip": "Hilfslinien vom Lineal-Rand in die Skizze ziehen (Profi)",
  "hilfe": "Ziehe aus dem linken Lineal eine senkrechte X-Hilfslinie oder aus dem oberen Lineal eine waagerechte Y-Hilfslinie in die Skizze. Alle Zeichenwerkzeuge und gezogene Punkte rasten magnetisch auf diesen Linien und ihren Schnittpunkten ein.",
  "tipp": "Im Auswahl-Werkzeug kannst du jede Hilfslinie verschieben – ziehst du sie zurück aufs Lineal, verschwindet sie wieder."
 },
 "vent": {
  "tip": "Lüftungsgitter: Schlitze mit Rahmen und Winkel in eine Fläche schneiden",
  "hilfe": "Wähle eine ebene Körperfläche und klicke auf „Lüftungsgitter“. Tracery schneidet parallele Schlitze mit umlaufendem Rahmen in die Wand. Anzahl, Schlitzbreite, Rahmen, Winkel, Tiefe (0 = genau durch die Wand) und runde oder eckige Enden stellst du rechts jederzeit um.",
  "tipp": "Bei einem Gehäuse mit Deckel und Boden durchstößt Tiefe 0 automatisch nur die angeklickte Wand und lässt die Rückwand heil."
 },
 "fins": {
  "tip": "Kühlrippen: parallele Rippen auf eine ebene Fläche setzen",
  "hilfe": "Wähle eine ebene Körperfläche und klicke auf „Kühlrippen“. Tracery setzt gleichmäßig verteilte Rippen innerhalb des Randabstands auf die Fläche und verschmilzt sie direkt mit dem Körper. Anzahl, Dicke, Höhe, Randabstand, Winkel und Schräge bleiben im Verlauf änderbar.",
  "tipp": "Mit einer kleinen Schräge von 1° bis 3° lassen sich die Kühlrippen auch aus einer Gussform oder Spritzgussform sauber entformen."
 },
 "web": {
  "tip": "Steg-Netz: viele Rippen aus einer offenen Skizze (auch Kreuzungen und Gitter)",
  "hilfe": "Zeichne eine offene Skizze mit mehreren Linien, Bögen, Kreuzungen oder T-Stößen über einem ausgehöhlten Körper oder einer Schale. Das Steg-Netz extrudiert alle Pfade gemeinsam mit Dicke und Höhe und verlängert freie Enden automatisch bis an die Wände.",
  "tipp": "Mit Tiefe 0 wachsen die Stege genau bis zum Schalenboden; eine feste Tiefe lässt das Netz frei auf gewünschter Höhe enden."
 },
 "sketch3d": {
  "tip": "3D-Skizze mit Linien und Bögen frei im Raum zeichnen (Profi)",
  "hilfe": "Im Profi-Modus startest du eine 3D-Skizze ohne feste Ebene (über „Skizze → 3D-Skizze“ oder die Befehlssuche). Setze Punkte per Klick im Raum, fange exakt an Körperecken und Kantenmitten oder gib X, Y und Z rechts ein. Jede Linie und jeder 3-Punkt-Bogen lässt sich über Längenmaße (auch Formeln) festlegen und anschließend mit „Entlang Pfad“ zu einem Körper ziehen.",
  "tipp": "Wenn du an einer Körperecke fängst, merkt sich die 3D-Skizze diesen Körper und wandert mit, falls sich der Körper verschiebt."
 },
 "boss": {
  "tip": "Schraubdom mit 0–6 Stützrippen und Loch auf eine Fläche setzen",
  "hilfe": "Wähle eine ebene Fläche eines Körpers und klicke auf „Schraubdom“. Tracery baut einen zylindrischen Dom mit Außen- und Lochdurchmesser, Höhe und bis zu 6 strahlenförmigen Rippen rundherum – alles wird direkt mit dem Körper vereinigt.",
  "tipp": "Rechts kannst du Versatz U/V, Rippenlänge, Rippendicke und Winkel genau einstellen oder Formeln nutzen."
 },
 "lipGroove": {
  "tip": "Lippe und Nut mit Spiel für zwei Gehäusehälften anlegen",
  "hilfe": "Wähle eine Trennkante, eine ebene Trennfläche oder beide Gehäusehälften und starte „Lippe und Nut“. Die eine Hälfte bekommt eine umlaufende Stecklippe (innen oder außen), die andere Hälfte die passende Nut samt einstellbarem Spiel.",
  "tipp": "Mit 0,2 mm Spiel lassen sich gedruckte Gehäusehälften ohne Klemmen zusammenstecken und zentrieren."
 },
 "loftClosed": {
  "tip": "Geschlossener Übergang (Ring): verbindet den letzten Umriss zurück zum ersten (Profi)",
  "hilfe": "Wähle mindestens drei Skizzenkörper im Kreis oder schalte rechts beim Übergang „Geschlossen (Ring)“ ein. Tracery schließt die Form nahtlos vom letzten Querschnitt wieder an den ersten an – wahlweise weich oder mit geraden Flächen.",
  "tipp": "Ideal für nahtlose Ringe, Rahmen, Griffe oder geschlossene Kanäle – mit „Körper → Abziehen von“ lässt sich der Ring direkt als Nut oder Kanal aus einem Körper schneiden."
 },
 "loftCut": {
  "tip": "Übergang direkt als Schnitt von einem Körper abziehen (Profi)",
  "hilfe": "Wähle zwei oder mehr Skizzenkörper (und bei Bedarf gleich den Zielkörper mit) und klicke auf „Übergang abziehen“. Der Übergang wird direkt vom Zielkörper abgezogen, um verjüngte Kanäle, Aussparungen oder konische Taschen zu schneiden.",
  "tipp": "Auch einen bestehenden Übergang kannst du jederzeit rechts unter „Körper“ auf „Abziehen von …“, „Vereinigen mit …“ oder „Schnittmenge mit …“ umstellen."
 },
 "loftContinuity": {
  "tip": "Start und Ende des Übergangs tangential (G1) oder krümmungsglatt (G2) an Nachbarflächen anschließen (Profi)",
  "hilfe": "Im Profi-Modus legst du unter „Weicher Anschluss“ für Start und Ende einzeln fest, ob der Übergang frei, tangential (ohne Knick) oder krümmungsglatt (gleiche Wölbung) an den benachbarten Körper anschließt. Berührende Nachbarflächen erkennt Tracery automatisch oder du wählst sie über „Fläche wählen“ selbst aus.",
  "tipp": "Mit dem Regler „Stärke“ bestimmst du von 0,1 bis 3,0, wie weit der Übergang die Anschlussrichtung hält, bevor er zum nächsten Umriss einlenkt."
 },
 "shellFaceWall": {
  "tip": "Einer einzelnen Fläche eine eigene Wandstärke geben",
  "hilfe": "Klick nach diesem Knopf eine geschlossene Fläche deines ausgehöhlten Körpers an (z. B. den Boden oder eine Seitenwand). Sie bekommt rechts ein eigenes Eingabefeld für ihre Wandstärke – auch mit Formeln – während alle übrigen Wände bei der Standard-Wandstärke bleiben.",
  "tipp": "So baust du zum Beispiel ein Gehäuse mit 1,5 mm dünnen Seitenwänden und einem 3 mm dicken, stabilen Boden."
 },
 "deform": {
  "tip": "Körper biegen, verdrehen oder verjüngen (Profi)",
  "hilfe": "Wähle einen Körper und klicke auf „Verformen“ (im Profi-Modus in der Kontextleiste, unter Körper oder per Rechtsklick im Verlauf). Rechts wählst du zwischen „Biegen“ (Winkel um eine Achse), „Verdrehen“ (Grad über die Länge) und „Verjüngen“ (Faktor am Ende, z. B. 0,5 für halb so breit).",
  "tipp": "Alle Winkel und Faktoren akzeptieren Formeln. Beim Biegen wählst du die Längs- und die Biegeachse getrennt; mit „Richtung umkehren“ biegst oder verjüngst du zur anderen Seite."
 },
 "splitFace": {
  "tip": "Kurve auf eine Fläche projizieren und die Fläche daran teilen (Profi)",
  "hilfe": "Wähle eine ebene oder gekrümmte Fläche (z. B. einen Zylindermantel oder eine Kugel) und klicke auf „Fläche teilen“. Zeichne eine geschlossene Form oder eine offene Kurve und bestätige mit „Fertig“. Tracery projiziert die Kurve auf die Fläche und teilt nur diese Oberfläche – der Körper bleibt ein einzelnes Stück.",
  "tipp": "Jede entstandene Teilfläche kannst du anschließend einzeln anklicken, mit einer eigenen Farbe versehen oder gezielt weiterbearbeiten."
 },
 "dome": {
  "tip": "Glatte Kuppel auf eine ebene Fläche setzen (Profi)",
  "hilfe": "Wähle eine ebene Körperfläche und klicke auf „Kuppel“. Tracery wölbt eine nahtlose Kuppel vom Außenrand der Fläche bis zur gewählten Höhe (auch per Formel) und verschmilzt sie direkt mit dem Körper.",
  "tipp": "Mit „Flach gewölbt (Kugelkappe)“ wird die Kuppel flacher, und mit „Nach innen (Vertiefung)“ entsteht eine glatte Schale im Körper."
 },
 "faceFillet": {
  "tip": "Rundung mit Radius zwischen zwei gewählten Flächen anlegen (Profi)",
  "hilfe": "Klick nach diesem Knopf zwei Flächen deines Körpers an. Tracery rundet den Übergang dazwischen mit dem gewählten Radius – auch wenn beide Flächen sich nicht berühren und eine Fase oder Stufe dazwischen liegt.",
  "tipp": "Den Radius kannst du anschließend rechts im Kanten-Panel anpassen (auch mit Formeln) oder über „Flächen neu wählen“ andere Flächen festlegen."
 },
 "partingDraft": {
  "tip": "Entformungsschräge ab einer Trennlinie nach oben und unten anlegen (Profi)",
  "hilfe": "Wähle einen Körper (oder direkt eine Kante auf halber Höhe) und klicke auf „Schräge an Trennlinie“. Seitenflächen werden ab der Trennebene geteilt und beide Hälften in Gegenrichtung geneigt, damit das Teil aus einer zweiteiligen Form entformt werden kann.",
  "tipp": "Rechts wählst du zwischen Mitte, fester Lage, gewählter Kante oder Bezugsebene – und auf Wunsch getrennte Winkel für oben und unten."
 },
 "patternGrowth": {
  "tip": "Größe und Abstand je Muster-Kopie schrittweise wachsen oder schrumpfen lassen (Profi)",
  "hilfe": "Im Profi-Modus legst du unter „Wachstum je Kopie“ fest, um wie viel Prozent (%) oder Millimeter (bzw. Grad beim Kreismuster) jede folgende Kopie größer/kleiner wird und wie stark sich der Abstand zwischen den Kopien ändert.",
  "tipp": "Bei +10 % je Kopie wächst die Größe schrittweise im Verhältnis (z. B. 1,1×, 1,21×, 1,33×, 1,46×); negative Werte lassen die Kopien kleiner werden."
 },
 "splitAdvanced": {
  "tip": "Körper an einer anderen Fläche, Bezugsebene oder gezeichneten Skizze teilen (Profi)",
  "hilfe": "Statt nur waagerecht oder senkrecht zu schneiden, kannst du im Profi-Modus beim Teilen eine ebene oder gekrümmte Fläche eines anderen Körpers (oder eine Bezugsebene) wählen oder eine eigene Kurve (Linie, Bogen, Spline) durch den Körper zeichnen.",
  "tipp": "Mit „Behalten“ und „Spalt“ entscheidest du auch bei gebogenen Schnitten, ob beide Teile bleiben oder eine Seite ausgeblendet wird."
 },
 "fillPattern": {
  "tip": "Ebene Fläche mit Löchern oder Sechseck-Waben füllen (Profi)",
  "hilfe": "Wähle eine ebene Körperfläche und klicke auf „Füllmuster“. Tracery schneidet gleichmäßige runde Löcher (im Raster oder versetzt) oder Sechseck-Waben direkt durch das Bauteil – und lässt dabei nur Löcher zu, die den eingestellten Randabstand zu Außenkanten und bestehenden Durchbrüchen einhalten.",
  "tipp": "Mit „Tiefe“ größer als 0 entstehen Sacklöcher statt Durchbrüchen, und über „Drehwinkel“ drehst du das ganze Muster."
 },
 "patternPoints": {
  "tip": "Körper, Bohrung oder Schritt an Skizzenpunkten vervielfachen (Profi)",
  "hilfe": "Wähle einen Körper, eine Bohrung oder einen Formschritt und klicke auf „Muster an Skizzenpunkten“. Setze in der Skizze beliebig viele Punkte – oder wähle rechts unter „Punkt-Quelle“ eine bestehende Skizze mit Punkten. An jedem Punkt entsteht genau eine Kopie.",
  "tipp": "Mit einem Klick auf eine Kopie im Bild oder auf ihre Nummer rechts lässt sich jeder einzelne Punkt auslassen."
 },
 "patternTable": {
  "tip": "Körper, Bohrung oder Schritt aus einer CSV-Koordinatentabelle vervielfachen (Profi)",
  "hilfe": "Wähle einen Körper, eine Bohrung oder einen Formschritt und klicke auf „Muster aus Tabelle (CSV)“. Trage Koordinaten (X, Y, optional Z und Drehwinkel rot) Zeile für Zeile ein oder lade eine CSV-Datei. Jede Zeile erzeugt eine Kopie.",
  "tipp": "Du kannst wählen, ob die Zahlen als Zielposition im Modell oder als Versatz (dX, dY, dZ) vom Original gerechnet werden."
 },
 "undercut": {
  "tip": "Gewinde-Freistich nach DIN 76-1 am Gewindeende schneiden",
  "hilfe": "Wähle eine runde Welle oder Bohrung und klicke auf „Freistich“. Tracery schlägt Steigung und Freistichmaße (Durchmesser, Breite, 30°-Auslauf) passend zum Durchmesser nach DIN 76-1 vor – wahlweise als Form A (normal) oder Form B (kurz).",
  "tipp": "Wenn auf der Fläche schon ein kosmetisches Gewinde markiert ist, übernimmt der Freistich automatisch genau dessen Steigung."
 },
 "circlipGroove": {
  "tip": "Einstich für Sicherungsring nach DIN 471 (Welle) oder DIN 472 (Bohrung)",
  "hilfe": "Wähle eine Außenwelle oder Innenbohrung und klicke auf „Einstich“. Tracery sucht automatisch Nutbreite und Nutdurchmesser aus der DIN-471- bzw. DIN-472-Tabelle heraus und schneidet die Nut am gewählten Abstand ein.",
  "tipp": "Wählst du rechts eine andere Nenngröße aus der Liste, passen sich Breite (m) und Nutdurchmesser (d₂) sofort normgerecht an."
 },
 "keywayStep": {
  "tip": "Passfeder-Nut nach DIN 6885 direkt auf Welle oder Nabe fräsen",
  "hilfe": "Wähle eine Welle oder Nabenbohrung und klicke auf „Passfeder-Nut“. Tracery bestimmt die passende DIN-6885-Größe zum Durchmesser und fräst die Nut mit Tiefe t₁ (Welle, rundstirnig) bzw. t₂ (Nabe, gerade) direkt in den Körper.",
  "tipp": "Mit „Winkel um Achse“ drehst du die Nut rund um die Welle, und über „Versatz längs“ schiebst du sie exakt an die gewünschte Position."
 },
 "splineProfile": {
  "tip": "Keilwellen-Profil nach DIN ISO 14 auf Welle oder Bohrung schneiden",
  "hilfe": "Wähle eine Welle oder Bohrung und klicke auf „Keilwelle“. Tracery wählt das passende DIN-ISO-14-Profil mit geraden parallelen Flanken und schneidet die Keile über die gewählte Länge oder über die ganze Welle ein.",
  "tipp": "Lässt du die Länge auf 0, läuft das Keilwellen-Profil automatisch über die gesamte Zylinderlänge."
 },
 "splineShaft": {
  "tip": "Normteil: fertige Keilwelle nach DIN ISO 14 einfügen",
  "hilfe": "Erzeugt eine eigenständige Keilwelle nach DIN ISO 14 (6 oder 8 Keile, parallele Flanken, Innenzentrierung) mit wählbarem Profil, Länge und optionaler Mittenbohrung.",
  "tipp": "Wähle bei „Profil“ „Eigene Maße“, wenn du Zähnezahl, Innendurchmesser, Außendurchmesser und Keilbreite frei festlegen möchtest."
 },
 "variantTable": {
  "tip": "Varianten als Tabelle ausfüllen, umschalten und als CSV tauschen (Profi)",
  "hilfe": "Öffne im Profi-Modus unter „Maße“ → „Varianten“ auf „Tabelle“ (oder per Befehlssuche „Varianten-Tabelle“). Jede Zeile ist eine Variante, jede Spalte ein Maß sowie der Werkstoff. Du kannst Werte direkt eintippen, Zeilen hinzufügen oder duplizieren und die ganze Tabelle als CSV exportieren und wieder importieren.",
  "tipp": "Ein Klick auf eine Zeile schaltet das Modell sofort auf diese Variante um; mit Enter oder den Pfeiltasten springst du senkrecht von Zeile zu Zeile."
 },
 "compareBodies": {
  "tip": "Zwei Körper oder Versionen farbig vergleichen: neu (grün), weg (rot), gleich (grau) (Profi)",
  "hilfe": "Vergleicht zwei Körper im Projekt oder zwei gespeicherte Versionen mit dem exakten CAD-Kern. Hinzugekommene Bereiche leuchten grün, entfernte Bereiche (z. B. Bohrungen) rot und unveränderte Teile bleiben grau.",
  "tipp": "Klicke auf die Farbfelder (Neu / Weg / Gleich), um einzelne Gruppen auszublenden, oder aktiviere „Aufeinander legen“, wenn zwei Vergleichskörper nebeneinander stehen."
 },
 "silhouetteArea": {
  "tip": "Projizierte Schattenriss-Fläche der Körper in Blickrichtung in mm² messen (Profi)",
  "hilfe": "Berechnet die Fläche, die deine sichtbaren (oder ausgewählten) Körper aus der aktuellen Kamerarichtung oder einer gewählten Standardansicht bzw. Fläche verdecken – exakt in mm².",
  "tipp": "Ideal für die Stirnfläche gegen Fahrtwind, die Projektionsfläche beim Spritzguss oder den benötigten Bauraum in einer Richtung."
 },
 "decal": {
  "tip": "Bild oder Logo (PNG, JPG, SVG) als Aufkleber auf eine ebene Fläche legen",
  "hilfe": "Wähle eine ebene Körperfläche und lade eine PNG-, JPG- oder SVG-Datei. Der Aufkleber wird direkt auf der Fläche angezeigt, im Projekt gespeichert und lässt sich rechts verschieben, drehen, skalieren und spiegeln.",
  "tipp": "PNG- und SVG-Dateien behalten ihren durchsichtigen Hintergrund – ideal für Logos, Typenschilder und Beschriftungen."
 },
 "bodyTexture": {
  "tip": "Oberflächen-Textur (Holz, Metall gebürstet, Karbon) auf den Körper legen",
  "hilfe": "Überzieht alle Flächen des ausgewählten Körpers nahtlos mit einer lokalen Textur (Holzmaserung, gebürstetes Metall oder Karbon-Gewebe) inkl. einstellbarer Größe und Drehung.",
  "tipp": "Kombiniere eine Textur mit einer eigenen Körperfarbe, um Holz oder gebürstetes Metall einzufärben."
 },
 "printCost": {
  "tip": "Filamentmenge, Materialkosten und Druckzeit für den 3D-Druck schätzen",
  "hilfe": "Rechnet aus Volumen, Oberfläche, Füllung (Infill), Wandlinien, Schichthöhe, Filament-Material und Drucker-Profil eine Schätzung für Filamentgewicht (g), Drahtlänge (m bei 1,75 mm), Materialkosten (€) und Druckzeit.",
  "tipp": "Passe den Filament-Preis je kg und die Füllung oben im Fenster an – du siehst sofort, wie sich Kosten und Druckzeit verändern."
 },
 "reportPdf": {
  "tip": "Prüfbericht als PDF mit 3D-Bild, Maßen, Volumen, Masse und Wandstärke erstellen",
  "hilfe": "Stellt alle wichtigen Modelldaten auf einer übersichtlichen A4-PDF-Seite zusammen: 3D-Ansicht, Hüllmaße, Volumen, Oberfläche, Masse, Schwerpunkt, kleinste Wandstärke, Düsen- und Bauraum-Prüfung, 3D-Druck-Schätzung und Teileübersicht – komplett lokal im Browser erzeugt.",
  "tipp": "Wenn du vorher die 3D-Druck-Schätzung anpasst, übernimmt der PDF-Prüfbericht deine Werte automatisch."
 },
 "studioFloorLight": {
  "tip": "Studio-Boden mit Spiegelung, eigenes Umgebungsbild und bis zu 3 Lichter von Hand einstellen",
  "hilfe": "Öffnet die Live-Steuerung für das Studio-Aussehen (in Einfach und Profi): Schalte den spiegelnden Studio-Boden mit einstellbarer Stärke ein, lade ein eigenes Umgebungsbild (PNG, JPG oder HDR) und stelle bis zu 3 eigene Lichter nach Richtung, Höhe, Farbe und Stärke ein.",
  "tipp": "Alle Einstellungen wirken sofort im 3D-Bild und bleiben in diesem Browser gespeichert."
 },
 "studioFloor": {
  "tip": "Studio-Boden unter dem Modell mit einstellbarer Spiegelung und weichen Schatten",
  "hilfe": "Legt im Studio-Look einen sanft auslaufenden Boden unter das Modell, der Umgebungslicht spiegelt und Schatten auffängt. Über den Regler stellst du die Spiegelungs-Stärke von matt bis hochglänzend ein.",
  "tipp": "Für echte Lichtreflexe am Boden schalte den Modus oben unter „Ansicht“ auf „Studio-Look“."
 },
 "customEnv": {
  "tip": "Eigenes 360°-Umgebungsbild (PNG, JPG, WebP oder HDR) als Spiegel-Umgebung laden",
  "hilfe": "Ersetzt die eingebaute Studio-Umgebung durch ein eigenes Bild vom Rechner. Glänzende Metalle, klare Lacke und der Studio-Boden spiegeln dieses Bild sofort wieder.",
  "tipp": "Mit einem Klick auf „Studio“, „Hell“, „Werkstatt“ oder „Entfernen“ kehrst du jederzeit zur eingebauten Umgebung zurück."
 },
 "manualLights": {
  "tip": "Bis zu 3 eigene Lichter mit Richtung, Höhe, Farbe und Stärke von Hand einstellen",
  "hilfe": "Schaltet von der automatischen 3-Punkt-Beleuchtung auf bis zu 3 frei einstellbare Richtungslichter um. Für jedes Licht wählst du Richtung (Azimut), Höhe, Lichtfarbe und Stärke – Licht 1 wirft dabei die Schatten.",
  "tipp": "Nutze z. B. ein warmes Hauptlicht von vorne-rechts und ein kühles Gegenlicht von hinten-links für mehr Tiefe."
 },
 "commentPins": {
  "tip": "Kommentar-Pin an eine Stelle des Modells setzen und als erledigt abhaken",
  "hilfe": "Heftet eine nummerierte Kommentar-Stecknadel direkt an eine Stelle des 3D-Modells. Jeder Pin speichert seinen Text und einen Erledigt-Haken direkt in der Projektdatei. Alle Pins stehen übersichtlich in der Pin-Liste zum Anspringen und Abhaken.",
  "tipp": "Klick auf einen Pin in der Liste, um die Kamera direkt auf diese Stelle zu richten."
 },
 "workspaceLayout": {
  "tip": "Anordnung der Panels (offen, Breite, Seite) als Arbeitsfläche speichern und wechseln",
  "hilfe": "Merkt sich, welche Seitenleisten offen sind, wie breit sie sind und auf welcher Seite Verlauf und Eigenschaften liegen. Du kannst eigene Arbeitsflächen wie „Zeichnen“ oder „Prüfen“ benennen und mit einem Klick wechseln.",
  "tipp": "Zieh am inneren Rand eines Panels, um seine Breite anzupassen – ein Doppelklick setzt die Breite zurück."
 },
 "knurl": {
  "tip": "Gerades, gekreuztes oder schräges Rändel auf einen Zylindermantel schneiden (Profi)",
  "hilfe": "Wähle den Außenmantel eines Zylinders oder einer Welle und klicke auf „Rändel“. Du kannst zwischen gekreuztem Rändel (Diamantmuster), geraden Rillen und schrägen Rillen wählen sowie Teilung, Tiefe, Winkel und Länge exakt festlegen.",
  "tipp": "Der maximale Außendurchmesser bleibt beim Rändeln erhalten – die Spitzen liegen genau auf dem ursprünglichen Zylindermantel."
 },
 "gripPattern": {
  "tip": "Rillen oder Noppen als Griffmuster auf Fläche oder Zylindermantel setzen (Profi)",
  "hilfe": "Wähle eine ebene Fläche oder einen Zylindermantel und klicke auf „Griffmuster“. Entscheide dich für parallele bzw. umlaufende Rillen (V-Profil, rund oder rechteckig) oder für Noppen (Halbkugel, Kegel oder Zylinder, versetzt oder im Raster) – jeweils vertieft oder erhaben.",
  "tipp": "Mit „Randabstand“ und „Länge“ grenzt du den Griffbereich sauber gegen Kanten und Schultern ab."
 },
 "whatIsThis": {
  "tip": "„Was ist das?“-Modus: Klick auf ein Element erklärt es",
  "hilfe": "Schaltet den Erklär-Modus ein. Solange er aktiv ist, löst kein Klick eine Aktion aus – stattdessen erscheint direkt am angeklickten Knopf, Feld oder Bauteil eine kurze Erklärung in Du-Form.",
  "tipp": "Mit Esc oder einem erneuten Klick auf „?“ verlässt du den Modus sofort wieder."
 },
 "radialMenu": {
  "tip": "Kreis-Menü an der Maus (Q oder rechte Maus gedrückt halten): 8 schnelle Befehle, frei einstellbar",
  "hilfe": "Öffnet direkt am Mauszeiger ein rundes Schnellmenü mit deinen 8 wichtigsten Befehlen. Mit dem Zahnrad in der Mitte belegst du alle 8 Plätze nach Wunsch.",
  "tipp": "Halte die rechte Maustaste kurz gedrückt, ziehe direkt auf das gewünschte Feld und lass los – so wählst du Befehle in einer flüssigen Bewegung."
 },
 "paintSelect": {
  "tip": "Malen-Auswahl (V): Mit gedrückter Maus über mehrere Flächen oder Kanten streichen",
  "hilfe": "Aktiviert die Malen-Auswahl: Fahre mit gedrückter linker Maustaste einfach über Flächen oder Kanten, um sie der Reihe nach auszuwählen – ideal zum gemeinsamen Abrunden, Abschrägen oder Einfärben.",
  "tipp": "Umschalt hält die bestehende Auswahl zum Dazunehmen, Alt streicht ausgewählte Flächen oder Kanten wieder ab, und Esc beendet den Modus."
 },
 "installApp": {
  "tip": "Tracery wie ein Programm auf deinem Gerät installieren und ohne Internet nutzen",
  "hilfe": "Tracery speichert seine Programmdateien und den CAD-Kern automatisch im Browser-Speicher. Danach öffnet es auch ohne Internetverbindung sofort. Über die Adresszeile oder das Teilen-Menü kannst du es als eigenes Fenster (App) auf Schreibtisch, Dock oder Startbildschirm legen.",
  "tipp": "Sobald der grüne Punkt „Ohne Internet nutzbar“ erscheint, liegen alle Dateien inklusive CAD-Kern lokal auf deinem Gerät."
 },
 "highContrast": {
  "tip": "Hoher Kontrast: kräftige Rahmen, klare Farben und extra deutlicher Fokusrahmen",
  "hilfe": "Verstärkt alle Ränder, Schriften, Knöpfe und Fokus-Umrandungen im hellen und dunklen Design, damit die Oberfläche auch bei grellem Licht oder schwachem Sehvermögen leicht lesbar bleibt.",
  "tipp": "Alle Knöpfe lassen sich außerdem per Tab, Pfeiltasten, Enter und Esc komplett ohne Maus bedienen."
 },
 "filletG2": {
  "tip": "Form der Rundung wählen: klassisch rund (Kreisbogen) oder krümmungsglatt (G2, weicher Einlauf, Profi)",
  "hilfe": "Bei „Rund“ entsteht ein normaler Kreisbogen. Bei „Krümmungsglatt (G2)“ läuft die Rundung ohne Krümmungssprung sanft aus den Nachbarflächen heraus (Kegelschnitt-artiger Verlauf) – ideal für glatte Gehäuseteile und schöne Lichtreflexe.",
  "tipp": "Die gewählte Größe steuert weiterhin denselben Einlauf-Abstand auf den Nachbarflächen."
 },
 "illustration": {
  "tip": "Technische Illustration: weiße Flächen mit klaren Umrissen und Kanten auf weißem Grund (Profi)",
  "hilfe": "Stellt alle Körper wie in einer technischen Zeichnung oder Anleitung dar: weiße Flächen verdecken die Rückseite, während alle Kanten und äußeren Umrisse als scharfe dunkle Linien auf weißem Hintergrund gezeichnet werden.",
  "tipp": "Ideal zusammen mit „Bild speichern (PNG)“ für Anleitungen, Dokumentationen oder Patentskizzen."
 },
 "quadView": {
  "tip": "Vierfach-Ansicht: Vorn, Oben, Rechts und Schräg gleichzeitig im Bild (Profi)",
  "hilfe": "Teilt das 3D-Fenster in vier Bereiche (Vorn, Oben, Rechts und Schräg). Jeden Bereich kannst du einzeln mit der Maus drehen, zoomen und verschieben, per Knopf zwischen orthografisch und perspektivisch umschalten oder auf seine Grundrichtung zurücksetzen.",
  "tipp": "Ein Klick auf „1 Ansicht“ oben rechts oder erneut auf „Vierfach-Ansicht“ im Ansicht-Menü kehrt sofort zur großen Einzelansicht zurück."
 },
 "exportBundle": {
  "tip": "Alles als Paket (ZIP): Projekt, Zeichnungen (PDF), STEP und STL je Körper zusammen speichern",
  "hilfe": "Packt dein gesamtes Projekt in eine einzige ZIP-Datei: die Tracery-Projektdatei zum Weiterbauen, alle technischen Zeichnungen als PDF, das komplette Modell als STEP sowie eine eigene STL-Datei für jeden sichtbaren Körper.",
  "tipp": "Ideal zum Weitergeben, Archivieren oder für den Fertiger – alle wichtigen Formate sind direkt dabei."
 },
 "touchGestures": {
  "tip": "Trackpad-, Touch- und Stift-Gesten für 3D-Ansicht und Skizze ein- oder ausschalten",
  "hilfe": "Mit zwei Fingern auf Trackpad oder Touchscreen drehst du das Modell (in der Skizze verschiebst du), Zusammenziehen und Aufziehen zoomt, langes Drücken am Touchscreen öffnet das Rechtsklick-Menü und ein Eingabestift zeichnet in der Skizze mit hoher Genauigkeit und Handballen-Schutz.",
  "tipp": "Wenn du am Laptop lieber klassisch nur mit Mausrad-Zoom arbeiten möchtest, schaltest du die Gesten hier einfach ab."
 },
 "noHistory": {
  "tip": "Ohne Verlauf arbeiten: Körper einfrieren und direkt verschieben, bohren und runden (Profi)",
  "hilfe": "Friert deinen aktuellen Körper als feste Form ein und blendet die Schritte-Liste aus. Neue Änderungen wie Verschieben, Bohren oder Abrunden wirken sofort direkt am Körper, ohne neue Schritte zu sammeln. Rückgängig (Strg Z) funktioniert weiter wie gewohnt.",
  "tipp": "Wenn du wieder mit Schritten arbeiten willst, nimm das Häkchen einfach wieder heraus – nach einer kurzen Rückfrage startet der eingefrorene Stand als erster Schritt im Verlauf."
 },
 "filletCorner": {
  "tip": "Eck-Übergang bei drei abgerundeten Kanten an einer Ecke wählen: Kugel-Ecke oder weicher Übergang (Profi)",
  "hilfe": "Treffen drei abgerundete Kanten an einer Ecke zusammen, füllt „Kugel-Ecke“ die dreieckige Ecke direkt bündig zwischen den drei Rundungen. „Weicher Übergang“ zieht die Rundungen vor der Ecke etwas früher zurück und spannt ein größeres, sanft überlaufendes Eckfeld auf.",
  "tipp": "Funktioniert sowohl bei krümmungsglatten (G2) als auch bei klassisch runden Kanten."
 },
 "exampleGallery": {
  "tip": "Beispiel-Galerie: fertige CAD-Projekte als eigene Kopie zum Ausprobieren öffnen",
  "hilfe": "Hier findest du eine Sammlung fertiger Projekte – vom Handyhalter über Zahnräder und eine gedrehte Vase bis hin zur beweglichen Scharnier-Baugruppe und einer technischen Zeichnung. Ein Klick öffnet immer eine frische Kopie für dich, sodass du nach Lust und Laune ändern kannst.",
  "tipp": "Schau bei den Beispielen in den Verlauf und unter „Maße“ – dort siehst du, wie andere Teile sauber und änderbar aufgebaut sind."
 },
 "coupleScrew": {
  "tip": "Schrauben-Kopplung: Drehen erzeugt Vorschub je Umdrehung (Profi)",
  "hilfe": "Koppelt eine Drehbewegung mit einer Schiebebewegung – entweder direkt an einem zylindrischen Gelenk (Schraube im Gewinde) oder zwischen einer Gewindespindel und einem Schlitten. Bei 360° Drehung bewegt sich das Teil genau um die eingestellte Steigung in Millimetern weiter.",
  "tipp": "Aktiviere „Linksgewinde“, wenn sich das Teil beim Drehen in die entgegengesetzte Richtung verschieben soll."
 },
 "coupleBelt": {
  "tip": "Riemen-Kopplung: Zwei Räder drehen mit gleicher Umfangsgeschwindigkeit (Profi)",
  "hilfe": "Verbindet zwei Drehgelenke über Zähnezahlen oder Raddurchmesser wie bei einem Zahn- oder Keilriemen. Hat Rad 1 beispielsweise 20 Zähne und Rad 2 40 Zähne, dreht Rad 2 genau halb so schnell wie Rad 1 – und beim Drehen von Rad 2 läuft Rad 1 doppelt so schnell mit.",
  "tipp": "Schalte „Gekreuzter Riemen“ ein, damit sich das zweite Rad entgegengesetzt dreht."
 },
 "coupleLinear": {
  "tip": "Lineare Kopplung: Zwei Schiebebewegungen im festen Verhältnis koppeln (Profi)",
  "hilfe": "Verbindet zwei Schiebegelenke (oder Schubrichtungen) so, dass sich das zweite Teil immer im eingestellten Verhältnis mitbewegt – zum Beispiel 1:1 synchron, 2:1 doppelt so weit oder gegenläufig bei umgekehrter Richtung.",
  "tipp": "Die Kopplung wirkt in beide Richtungen: Egal welches der beiden Teile du schiebst oder ziehst, das andere folgt sofort."
 },
 "coupleCam": {
  "tip": "Kurvenscheibe / Nocken: Ein Stößel folgt beim Drehen der Außenkontur einer Scheibe – mit Weg-Kurve als Diagramm (Profi)",
  "hilfe": "Verbindet ein Drehgelenk an einer Scheibe (Nocken oder Exzenter) mit einem Schiebegelenk an einem Stößel. Dreht sich die Scheibe, tastet der Stößel automatisch ihre Außenkontur ab – als Kontur-/Rollenstößel oder als Flachstößel. Das Weg-Kurven-Diagramm zeigt den gesamten Hub über 360° und lässt sich direkt anklicken.",
  "tipp": "Klicke im Diagramm auf einen Winkel oder nutze „An Kontur anlegen“, um den Stößel direkt an die Scheibe zu fahren."
 },
 "coupleGear": {
  "tip": "Zahnrad-Kopplung: Zwei Drehgelenke über Zähnezahl oder Verhältnis koppeln (Profi)",
  "hilfe": "Verbindet zwei Drehgelenke wie ein Zahnradpaar. Aus den Zähnezahlen (z. B. 20 : 40) oder einem eigenen Verhältnis (z. B. 1:2) dreht sich das zweite Zahnrad im passenden Verhältnis mit – und zwar in beide Richtungen.",
  "tipp": "Wenn beide Teile Zahnräder aus der Bibliothek sind, übernimmt Tracery die Zähnezahlen automatisch."
 },
 "coupleRack": {
  "tip": "Zahnstangen-Kopplung: Drehen eines Ritzels schiebt die Zahnstange um π · d · Winkel / 360 (Profi)",
  "hilfe": "Verbindet ein Drehgelenk (Ritzel) mit einem Schiebegelenk (Zahnstange). Aus dem Teilkreis-Durchmesser d (oder aus Modul × Zähnezahl) schiebt jede Drehung die Zahnstange genau um den abgerollten Umfang π · d · Winkel / 360 weiter.",
  "tipp": "Auch Ziehen an der Zahnstange dreht das Ritzel sofort im passenden Winkel zurück."
 },
 "explodeSteps": {
  "tip": "Explosion in Schritten: jedes Teil bewegt sich nacheinander in seiner eigenen Richtung und Weite, mit gestrichelten Wegen-Linien",
  "hilfe": "Unter „Explosion“ kannst du auf „Schritte“ umschalten und festlegen, welches Teil sich wann, in welche Richtung und wie weit bewegt. Beim Abspielen fahren die Teile genau in deiner Reihenfolge auseinander; gestrichelte Linien zeigen den Weg zum Ursprung.",
  "tipp": "Mit den Pfeilen ↑/↓ änderst du die Reihenfolge, und ein Klick auf einen Schritt öffnet ihn zum Bearbeiten."
 },
 "explodeVideo": {
  "tip": "Explosions-Video speichern: nimmt die schrittweise Explosion lokal als WebM- oder MP4-Video auf",
  "hilfe": "Spielt deine Explosion einmal vor der Kamera ab und speichert sie direkt im Browser als Video-Datei – wahlweise nur auseinander oder hin und zurück, mit oder ohne gestrichelte Wegen-Linien.",
  "tipp": "Drehe dir die Baugruppe vorher in eine schöne Schrägansicht – das Video filmt genau aus diesem Blickwinkel."
 },
 "namedPoses": {
  "tip": "Benannte Stellungen: Gelenk-Positionen wie „auf“, „zu“ oder „halb“ speichern und per Klick einnehmen",
  "hilfe": "Merkt sich die aktuellen Winkel und Wege aller beweglichen Gelenke unter einem Namen wie „auf“, „zu“ oder „halb“. Ein Klick auf eine gespeicherte Stellung fährt alle zugehörigen Teile sofort wieder genau dorthin – auch über ganze Gelenk-Ketten hinweg und dauerhaft mit dem Projekt gespeichert.",
  "tipp": "Über das Speichern-Symbol an einer vorhandenen Stellung überschreibst du sie mit der aktuellen Lage; per Rechtsklick kannst du sie umbenennen."
 },
 "partRefs": {
  "tip": "Bezüge zwischen Teilen verwalten: übernommene Maße, Kanten und Flächen einfrieren oder lösen (Profi)",
  "hilfe": "Zeigt alle Bezüge eines Teils auf andere Teile in der Baugruppe (z. B. übernommene Messwerte, Skizzen-Flächen, übernommene Kanten, Umrisse oder „bis Fläche“-Ziele). Eingefrorene Bezüge behalten ihren aktuellen Stand und rechnen nicht mehr mit; gelöste Bezüge werden dauerhaft getrennt.",
  "tipp": "Friere Bezüge kurz ein, wenn du ein Nachbarteil frei umbauen willst – danach taust du den Bezug mit einem Klick wieder auf."
 },
 "motionStudy": {
  "tip": "Bewegungs-Studie: Motoren an Gelenken über eine Zeitachse abspielen und Punkt-Kurven zeichnen (Profi)",
  "hilfe": "Treibt deine Baugruppe über eine echte Zeitachse an. Jeder Motor steuert ein Gelenk mit fester Drehzahl oder Geschwindigkeit (z. B. 60°/s) oder über eine Stützpunkt-Kurve (Weg über Zeit). Gleichzeitig verfolgt Tracery auf Wunsch den Weg einzelner Punkte am Bauteil als 3D-Bahnkurve im Bild und als Weg-Zeit-Diagramm.",
  "tipp": "Ziehe am Zeitschieber oder klicke direkt ins Weg-Zeit-Diagramm, um jede Zwischenstellung sofort im 3D-Modell zu prüfen."
 },
 "stackHole": {
  "tip": "Bohrung durch Stapel: bohrt ein Loch gleichzeitig durch mehrere Teile der Baugruppe (Profi)",
  "hilfe": "Setzt ein einfaches Loch, eine genormte Schrauben-Durchgangsbohrung (wahlweise mit Senk- oder Zylinderkopf), ein Sackloch oder eine Passbohrung H7 direkt als Schritt in der Baugruppe. Alle getroffenen oder gezielt ausgewählten Teile erhalten gleichzeitig dasselbe Loch, bleiben aber getrennte Körper und verändern keine verknüpften Bauteil-Dateien.",
  "tipp": "Unter „Zielteile“ kannst du auf „Nur gewählte Teile“ umschalten, wenn das Loch z. B. nur durch zwei bestimmte Platten gehen soll."
 },
 "asmCut": {
  "tip": "Baugruppen-Schnitt: schneidet eine Skizze gleichzeitig durch mehrere Teile der Baugruppe (Profi)",
  "hilfe": "Erzeugt auf einer gewählten Fläche oder Ebene einen geschlossenen Schnitt-Umriss und zieht ihn gleichzeitig von allen getroffenen oder ausgewählten Teilen der Baugruppe ab. Die Teile bleiben einzelne Baugruppen-Komponenten.",
  "tipp": "Mit „Skizze bearbeiten“ passt du den Ausschnitt später an – alle betroffenen Teile werden sofort mitgeändert."
 },
 "autoScrews": {
  "tip": "Schrauben automatisch einsetzen: erkennt Bohrungen in Bauteilen und setzt passende Normschrauben ein",
  "hilfe": "Sucht alle runden Durchgangs-, Kern- und Sacklöcher in deinen Bauteilen, ordnet ihnen die passende metrische Normschraube (M1.6–M24 nach ISO 273 / DIN 336) zu und schlägt anhand der Materialstärke – auch über mehrere gestapelte Platten hinweg – eine Normlänge vor. Du kannst Größe, Kopfform, Länge sowie Scheiben und Muttern vor dem Einsetzen noch anpassen.",
  "tipp": "Fahre mit der Maus über eine Zeile in der Tabelle, um die zugehörige Bohrung sofort im 3D-Bild markiert zu sehen."
 },
 "asmPattern": {
  "tip": "Teile in der Baugruppe als verknüpfte Kopien vervielfältigen (Reihe, Rechteck oder Kreis)",
  "hilfe": "Ordnet ein Bauteil in Reihe, im Rechteck oder im Kreis mehrfach an. Alle Kopien bleiben mit der Vorlage verknüpft und zählen in der Stückliste zusammen – änderst du die Vorlage, ändern sich sofort alle Kopien mit.",
  "tipp": "Anzahl und Abstände kannst du später jederzeit rechts bei einem der Teile anpassen; mit „Muster auflösen“ bleiben die Kopien unabhängig stehen."
 },
 "asmMirror": {
  "tip": "Teil in der Baugruppe spiegeln (verknüpfte Kopie)",
  "hilfe": "Erzeugt eine gespiegelte, verknüpfte Kopie des gewählten Teils an einer Grund- oder Bezugsebene. Änderungen an der Vorlage übernehmen sich automatisch auf das Spiegelbild.",
  "tipp": "Verschiebst du die Spiegelebene über den Abstand, wandert die gespiegelte Kopie direkt mit."
 },
 "lightweightMode": {
  "tip": "Leichtmodus für große Baugruppen (Profi): zeigt Teile zuerst nur als schnelles Netz",
  "hilfe": "Im Leichtmodus speichert Tracery die fertigen Dreiecks-Netze aller Teile. Beim nächsten Öffnen werden unveränderte Teile sofort aus diesem Netz-Speicher angezeigt, ohne den CAD-Kern jedes Mal neu zu rechnen. Sobald du ein Teil bearbeitest, ein Maß änderst oder auf „Voll laden“ klickst, rechnet der Kern dieses einzelne Teil exakt nach.",
  "tipp": "Verschieben und Drehen ganzer Teile klappt auch im Leichtmodus sofort ohne Neuberechnung."
 },
 "simplifiedEnvelope": {
  "tip": "Vereinfachte Hülle (Profi): fasst eine ganze Baugruppe zu einem einfachen Teil zusammen",
  "hilfe": "Erzeugt aus vielen Einzelteilen einen einzigen einfachen Körper, der nur die Außenhaut mit gleichen Außenmaßen behält. Verdeckte Innenteile, innere Hohlräume und wahlweise Bohrungen oder kleine Rundungen fallen weg – ideal, um eine große Unterbaugruppe leicht und schnell weiterzuverwenden.",
  "tipp": "Als „Außenhaut“ bleiben abgestufte Formen erhalten; „Einzel-Kästchen“ oder „Hüllquader“ machen die Hülle noch kleiner."
 },
 "displayStates": {
  "tip": "Anzeige-Zustände: speichern, welche Teile sichtbar, durchsichtig oder farbig sind (Profi)",
  "hilfe": "Merkt sich für jedes Teil der Baugruppe Sichtbarkeit, Durchsichtigkeit, eigene Farbe sowie die Darstellungsart unter einem Namen wie „ohne Deckel“ oder „Innenleben“. Ein Klick schaltet die ganze Ansicht sofort um, ohne am Modell etwas zu ändern.",
  "tipp": "Du findest die Anzeige-Zustände im Verlauf, rechts im Projekt-Panel, im Ansichtsmenü und im Studio-Licht-Panel."
 },
 "asmVariants": {
  "tip": "Varianten für Baugruppen: verschiedene Längen, aktive Teile oder Ersatz-Bauteile umschalten (Profi)",
  "hilfe": "Speichert verschiedene Ausführungen deiner Baugruppe – etwa „Standard“ und „lang“ – mit eigenen Baugruppen-Maßen, ein- oder ausgeschalteten Teilen, eingesetzten Bauteil-Varianten oder getauschten Verweisen auf andere Bauteile. Beim Umschalten passt sich die ganze Baugruppe automatisch an.",
  "tipp": "Im Fenster „Verwalten“ kannst du jeder Variante auch gleich einen passenden Anzeige-Zustand zuordnen."
 },
 "asmSingleBody": {
  "tip": "Baugruppe als einen Körper speichern: verschmilzt alle Teile zu einem einzigen Körper für Export, 3D-Druck oder Weiterarbeit (Profi)",
  "hilfe": "Fasst alle sichtbaren Teile einer Baugruppe über den CAD-Kern zu einem einzigen Körper zusammen und speichert ihn als STEP, STL, 3MF, BREP oder als neues Bauteil im eigenen Tab. So kannst du eine fertige Baugruppe wie ein einzelnes Teil weitergeben oder drucken.",
  "tipp": "Im Export-Fenster gibt es zusätzlich das Häkchen „Als einen Körper“, wenn du mehrere Formate auf einmal als Einzelkörper in eine ZIP-Datei packen willst."
 },
 "tolChain": {
  "tip": "Toleranzkette in einer Richtung rechnen: Maße mit ± auswählen, schlimmster Fall und Mittelwert werden berechnet (Profi)",
  "hilfe": "Misst gewählte Teile der Baugruppe entlang einer Achse (X, Y, Z oder senkrecht zu einer gewählten Fläche) und rechnet die Toleranzkette sofort aus: sowohl den schlimmsten Fall (Summe aller ± Toleranzen) als auch den wahrscheinlichen Bereich um den Mittelwert (Wurzelsumme der Quadrate).",
  "tipp": "Mit dem Knopf „+“ vor einer Zeile wechselst du das Vorzeichen auf „−“, um ein Spiel oder einen Spalt (Schließmaß) gegen die übrigen Maße zu prüfen."
 },
 "dragCollisionStop": {
  "tip": "Beim Ziehen anhalten, wenn sich Teile berühren (Profi)",
  "hilfe": "Prüft beim Verschieben, Anheben, Drehen oder Ziehen an Gelenken laufend, ob das bewegte Teil auf ein anderes Teil stößt. Sobald die Oberflächen sich berühren, hält das Teil genau dort an, statt hindurchzufahren.",
  "tipp": "Ziehst du ein Teil schräg gegen eine Wand, gleitet es an der Fläche entlang weiter. Zum Durchziehen einfach kurz den Schalter wieder ausmachen."
 },
 "clearanceCheck": {
  "tip": "Luft prüfen: listet alle Teilepaare mit weniger als X mm Abstand auf (Profi)",
  "hilfe": "Misst im CAD-Kern den genauen kleinsten Abstand zwischen allen sichtbaren Körpern und Bauteilen. Jedes Paar unter deinem Grenzwert (z. B. 1 mm) erscheint in der Liste – Klick markiert die engste Stelle im Modell und fährt die Kamera direkt dorthin.",
  "tipp": "Schalte „Berührende Paare (0 mm) mit listen“ nur ein, wenn du zusätzlich auch gewollte Anlageflächen prüfen willst."
 },
 "asmCable": {
  "tip": "Kabel oder Schlauch zwischen zwei Anschlusspunkten mit Durchmesser und Biegeradius verlegen (Profi)",
  "hilfe": "Erzeugt eine weiche 3D-Kurve zwischen zwei Punkten (direkt eingeben oder auf Bauteilflächen anklicken) mit frei wählbarem Durchmesser, Wandstärke (bei Schläuchen) und Biegeradius. Werden die Anschlusspunkte auf Bauteile geklickt, wandert das Kabel beim Verschieben mit, und die exakte Länge erscheint in der Stückliste.",
  "tipp": "Wähle „Schlauch (hohl)“, um einen Innenhohlraum über die Wandstärke zu erhalten, oder füge rechts im Panel Zwischenpunkte hinzu."
 },
 "skeletonSketch": {
  "tip": "Skelett-Skizze (Profi): eine Hauptskizze steuert mehrere Teile der Baugruppe",
  "hilfe": "In einer Skelett-Skizze zeichnest du die wichtigen Linien und Maße der gesamten Baugruppe an einer zentralen Stelle. Jedes benannte Maß wird automatisch als verknüpfter Parameter bereitgestellt – änderst du später ein Maß in der Hauptskizze, rechnen alle damit verbundenen Teile sofort neu.",
  "tipp": "Auch eingesetzte Bauteile aus eigenen Dokumenten lassen sich im Skelett-Panel direkt über „Verknüpfen“ mit einem Steuer-Maß verbinden."
 },
 "drawingBreakView": {
  "tip": "Lange Teile mit Bruchlinien verkürzen (Profi): Maße zeigen trotzdem die echte Länge",
  "hilfe": "Klicke in einer Zeichnungsansicht zuerst auf die erste Bruchstelle und dann auf die zweite. Das lange Zwischenstück wird mit Zickzack- oder Wellenlinien auf einen kurzen Restspalt zusammengeschoben. Alle automatischen und von Hand gesetzten Maße zeigen weiterhin die ungekürzte, echte Modelllänge.",
  "tipp": "Mit gedrückter Umschalt-Taste wechselst du beim ersten Klick zwischen waagerechtem und senkrechtem Kürzen; im rechten Panel stellst du Spaltbreite und Linienart nachträglich um."
 },
 "drawingAuxView": {
  "tip": "Hilfsansicht senkrecht zu einer schrägen Kante (Profi): zeigt schräge Flächen unverzerrt",
  "hilfe": "Klicke im Werkzeug „Hilfsansicht“ auf eine schräge oder gerade Kante einer Zeichnungsansicht. Tracery legt genau senkrecht zu dieser Kante eine neue Ansicht („Ansicht A“) mit Blickpfeil an der Kante an, sodass schräge Flächen in wahrer Größe und Form erscheinen und sich direkt bemaßen lassen.",
  "tipp": "Wenn die Hilfsansicht von der falschen Seite auf die Kante schaut, drehst du den Blick im rechten Panel mit „Umkehren“."
 },
 "drawingNormThreads": {
  "tip": "Gewinde in der Zeichnung nach Norm als Dreiviertelkreis und dünne Linien darstellen (Profi)",
  "hilfe": "Zeichnet alle Gewinde im Modell (Gewindebohrungen, gedruckte Innengewinde, Gewindebolzen, Normschrauben, Muttern und kosmetische Gewinde) nach DIN ISO 6410-1: In der Draufsicht erscheint ein dünner Dreiviertelkreis (270°), in der Seiten- und Schnittansicht dünne parallele Linien samt Gewindegrenze.",
  "tipp": "Bei Durchgangs- und Sacklochgewinden steht in der Bemaßung automatisch das Gewindemaß wie „M6“ statt nur der Bohrloch-Durchmesser."
 },
 "drawingMaterialHatch": {
  "tip": "Schnittflächen in der Zeichnung je nach Werkstoff unterschiedlich schraffieren (Profi)",
  "hilfe": "Passt die Schraffur jeder geschnittenen Fläche automatisch an den zugewiesenen Werkstoff des Bauteils an (z. B. einfache 45°-Linien für Stahl, Doppellinien für Aluminium, abwechselnde Strichlinien für Messing/Kupfer und Kreuzschraffur für Kunststoffe).",
  "tipp": "Eine kleine Legende direkt darunter zeigt dir alle im Modell verwendeten Werkstoffe und ihre Schraffur-Muster auf einen Blick."
 },
 "drawingSectionKinds": {
  "tip": "Weitere Schnittarten in der Zeichnung (Profi): Halbschnitt, abgesetzter Schnitt und Ausbruch",
  "hilfe": "Im Profi-Modus stehen dir neben dem normalen Vollschnitt drei weitere Schnittarten zur Wahl: Beim Halbschnitt siehst du die eine Hälfte als Außenansicht und die andere als Schnitt (ideal für runde oder symmetrische Teile). Beim abgesetzten Schnitt knickst du die Schnittlinie im rechten Winkel ab, um versetzte Bohrungen oder Taschen gemeinsam zu schneiden. Beim Ausbruch brichst du nur einen gezeichneten Bereich bis zur gewünschten Tiefe auf.",
  "tipp": "Beim Halbschnitt kannst du die geschnittene Seite jederzeit rechts im Panel wechseln; beim Ausbruch lässt sich die Schnitttiefe dort genau eintippen."
 },
 "drawingExplode": {
  "tip": "Explosionsansicht der Baugruppe auf das Blatt legen",
  "hilfe": "Zieht alle Teile der Baugruppe auseinander und zeigt sie als 3D-Ansicht samt gestrichelten Wegen-Linien auf der Zeichnung. Du kannst den Abstand stufenlos verstellen, eigene Explosions-Schritte nutzen und den Blickwinkel aus dem 3D-Modell übernehmen.",
  "tipp": "Mit „Positionsnummern automatisch“ wandern die Nummernkreise direkt an die auseinandergezogenen Teile."
 },
 "drawingProjection": {
  "tip": "Projektion zwischen Europa (ISO E) und USA (ISO A) umschalten",
  "hilfe": "Bestimmt, wo Draufsicht und Seitenansicht rund um die Vorderansicht liegen: Bei Europa (ISO E, Methode 1) stehen Draufsicht unten und Seitenansicht rechts; bei USA (ISO A, Methode 3) stehen Draufsicht oben und Seitenansicht links. Das Normsymbol im Schriftfeld wechselt automatisch mit.",
  "tipp": "Die Einstellung gilt pro Blatt – so kannst du bei Bedarf auch internationale Fertigungsblätter kombinieren."
 },
 "drawingModelDims": {
  "tip": "Maße aus Skizzen und Schritten des 3D-Modells übernehmen und ohne Überlappen auf dem Blatt ordnen",
  "hilfe": "Liest die gespeicherten Maße aus deinen Skizzen, Grundkörpern, Auszügen, Bohrungen, Rundungen und Fasen aus, legt sie in die jeweils passenden Ansichten (Vorder-, Drauf- oder Seitenansicht) und rückt alle Maßtexte so zurecht, dass sich nichts überdeckt.",
  "tipp": "Mit „Maße ordnen“ kannst du auch später hinzugefügte Maße jederzeit wieder sauber auseinanderrücken."
 },
 "drawingOrdArc": {
  "tip": "Koordinatenmaße ab einem Nullpunkt und Bogenlängen-Maße (Profi)",
  "hilfe": "Mit „Koordinaten“ bemaßt du mehrere Löcher oder Kanten übersichtlich ab einem gemeinsamen Nullpunkt (0) entlang der X- oder Y-Achse ohne viele Maßlinien. Mit „Bogenlänge“ misst du die gekrümmte Länge entlang eines Kreisbogens oder einer Rundung (⌒).",
  "tipp": "Beim Koordinatenmaß kannst du nach dem ersten Ziel einfach weitere Lochmitten oder Ecken anklicken und mit Enter abschließen."
 },
 "drawingDualDims": {
  "tip": "Doppelmaße in Millimetern und Zoll [eckige Klammer] je Blatt einblenden (Profi)",
  "hilfe": "Schreibt auf dem aktuellen Blatt hinter jedes Maß zusätzlich den umgerechneten Wert in Zoll in eckigen Klammern, zum Beispiel 25,4 [1.000]. Steht das Projekt auf Zoll, erscheint umgekehrt der Wert in Millimetern in Klammern.",
  "tipp": "Die Nachkommastellen der Zoll-Angabe (2, 3 oder 4 Stellen) kannst du direkt darunter unter „Maß-Stil“ wählen."
 },
 "drawingGdt": {
  "tip": "Form- und Lagetoleranzen: Toleranzrahmen und Bezugsbuchstaben (A, B, C …) an Kanten oder Maßen (Profi)",
  "hilfe": "Legt normgerechte Toleranzrahmen nach ISO 1101 für Geradheit, Ebenheit, Rundheit, Zylindrizität, Parallelität, Rechtwinkligkeit, Neigung, Position, Konzentrizität, Symmetrie sowie Rund- und Gesamtlauf auf das Blatt. Zuerst kannst du mit „Bezug setzen“ eine Kante oder ein Maß als Bezug A (B, C …) festlegen und danach den passenden Toleranzrahmen anhängen.",
  "tipp": "Wählst du ein bestehendes Maß an, kannst du rechts direkt mit „+ Bezug“ oder „+ Rahmen“ einen Bezugsbuchstaben oder Toleranzrahmen genau unter das Maß hängen."
 },
 "drawingTables": {
  "tip": "Bohrungstabelle, Änderungstabelle und freie Tabellen auf das Blatt legen (Profi)",
  "hilfe": "Über dieses Menü blendest du automatisch berechnete Bohrungstabellen, eine Änderungsliste mit Revisionsständen sowie frei bearbeitbare Tabellen auf dem Zeichnungsblatt ein. Alle Tabellen lassen sich frei auf dem Blatt verschieben und kommen mit in PDF, SVG und DXF.",
  "tipp": "Klicke eine Tabelle auf dem Blatt direkt an, um sie zu verschieben oder ihre Spalten und Zeilen rechts zu bearbeiten."
 },
 "drawingHoleTable": {
  "tip": "Bohrungstabelle mit X/Y-Lage, Durchmesser, Tiefe und Nummern am Loch (Profi)",
  "hilfe": "Erkennt alle zylindrischen Bohrungen der gewählten Ansicht automatisch, vergibt Nummern wie A1, B1, C1 direkt an den Löchern und listet X- und Y-Abstand ab dem gewählten Nullpunkt sowie Durchmesser, Gewinde, Senkungen und Tiefe (Durchgang oder Sackloch) übersichtlich auf.",
  "tipp": "Mit „Nullpunkt klicken“ kannst du jede beliebige Ecke oder Lochmitte als (0, 0)-Bezugspunkt für die X/Y-Koordinaten festlegen."
 },
 "drawingRevTable": {
  "tip": "Änderungstabelle (Revisionen) oben auf dem Blatt (Profi)",
  "hilfe": "Hält Konstruktionsstände mit Revisionsbuchstabe (A, B, C …), Beschreibung, Datum und Name direkt auf dem Zeichnungsblatt fest. Neue Revisionen zählen automatisch weiter und füllen das heutige Datum vor.",
  "tipp": "Mit „+ Änderung“ legst du eine neue Zeile an und kannst alle vier Spalten sofort rechts im Panel ausfüllen."
 },
 "drawingFreeTable": {
  "tip": "Frei bearbeitbare Tabelle mit eigenen Überschriften, Spalten und Zeilen (Profi)",
  "hilfe": "Erstellt eine beliebige Tabelle auf dem Zeichnungsblatt – zum Beispiel für Prüfwerte, Anzugsmomente, Werkstoffhinweise oder Pinbelegungen. Anzahl der Spalten und Zeilen sowie alle Zelleninhalte lassen sich rechts frei bearbeiten.",
  "tipp": "Lass die Überschrift leer, wenn nur Spaltenköpfe und Werte ohne Titelzeile erscheinen sollen."
 },
 "drawingTitleBlock": {
  "tip": "Schriftfeld-Vorlage wählen (ISO, DIN, ANSI) oder eigene Felder, Logo und Linien gestalten",
  "hilfe": "Über die Vorlagen wechselst du mit einem Klick zwischen ISO 7200, DIN EN ISO 7200 und ANSI/ASME Y14.1. Mit „Schriftfeld gestalten …“ passt du Breite, Höhe, beliebige Text- und Automatik-Felder, Trennlinien sowie ein Firmenlogo an und speicherst deinen Entwurf als eigene Vorlage für alle künftigen Zeichnungen.",
  "tipp": "Klicke in der Live-Vorschau des Schriftfeld-Editors direkt auf ein Feld, um Beschriftung, Lage oder Größe sofort zu ändern."
 },
 "drawingInspection": {
  "tip": "Maße als Prüfmaße (1, 2, 3 …) markieren und als Prüftabelle (CSV) exportieren (Profi)",
  "hilfe": "Markiere wichtige Maße direkt am gewählten Maß rechts im Panel als Prüfmaß. Sie erhalten fortlaufende Nummern-Ballons (1, 2, 3 …), lassen sich auf Wunsch als Prüftabelle auf dem Blatt einblenden und als CSV-Datei mit Nennmaß, Toleranz, Min/Max sowie leeren Spalten für Istwert und Prüfung speichern.",
  "tipp": "Wähle zuerst ein Maß auf dem Blatt an, hake rechts „Als Prüfmaß markieren“ an und exportiere danach die fertige Prüftabelle als CSV."
 },
 "drawingTiledPrint": {
  "tip": "Große Zeichnungen im Maßstab 1:1 über mehrere A4-Seiten mit Klebemarken drucken (Profi)",
  "hilfe": "Teilt große Blätter (wie A3, A2, A1 oder A0) exakt im Maßstab 1:1 auf mehrere A4- oder A3-Seiten auf. Jede Kachel enthält Schnitt- und Klebemarken (A1, B1, A2 …) und auf Seite 1 einen 50-mm-Kontrollbalken zum Nachmessen nach dem Ausdruck.",
  "tipp": "Stelle im Druckdialog deines PDF-Betrachters immer „Tatsächliche Größe“ oder „100 %“ (ohne Seitenanpassung) ein, damit die 1:1-Schablone exakt stimmt."
 },
 "drawingLayers": {
  "tip": "Linienarten und Strichstärken nach Norm einstellen sowie Ebenen (Layer) ein- und ausblenden (Profi)",
  "hilfe": "Hier steuerst du die Liniengruppe nach ISO 128 (0,35 / 0,50 / 0,70 mm) sowie jede Zeichnungsebene einzeln: Sichtbare Kanten, Verdeckte Kanten, Mittellinien, Maße, Schraffur, Schnittlinien, Gewinde, Rahmen und Bilder lassen sich getrennt ein- und ausblenden und in Linienart sowie Strichstärke anpassen – alle Layer-Namen und Zustände landen auch im DXF-Export.",
  "tipp": "Blende zum Prüfen der reinen Bauteilkontur kurz die Ebene „Maße & Hinweise“ über das Auge aus."
 },
 "drawingSheetImage": {
  "tip": "Bild oder Firmenlogo aus einer lokalen Datei frei auf dem Zeichnungsblatt platzieren (Profi)",
  "hilfe": "Lädt ein lokales Bild (PNG, JPG, WebP oder SVG) ohne Internetverbindung direkt auf das aktuelle Blatt. Du kannst das Bild frei über das Blatt ziehen, Breite und Höhe (wahlweise proportional), Deckkraft und einen Rahmen einstellen – und beim Export in SVG, PDF und PNG bleibt es gestochen scharf erhalten.",
  "tipp": "Klicke das Bild auf dem Blatt an, um es mit der Maus zu verschieben oder rechts exakt auf den Millimeter auszurichten."
 },
 "drawingSymbols": {
  "tip": "Oberflächenzeichen (Ra), Schweißsymbole, Kantenzustand und Symbol-Sammlung auf dem Blatt (Profi)",
  "hilfe": "Setzt normgerechte Oberflächenzeichen nach ISO 1302 (z. B. Ra 1,6 mit spanend/ohne Abtrag und Rillenrichtung), Schweißsymbole nach ISO 2553 (Kehlnaht, V-Naht, Rundum, Baustelle), Kantenzustände nach ISO 13715 (Grat/Entgraten) sowie Norm-Symbole aus der Sammlung direkt an Kanten oder frei aufs Blatt.",
  "tipp": "Alle Symbole lassen sich nachträglich per Ziehen verschieben, rechts im Panel anpassen und werden in SVG, PDF und DXF als echte Vektoren ausgegeben."
 },
 "drawingSymbolLibrary": {
  "tip": "Symbol-Sammlung mit Normzeichen für Geometrie, Bohrungen, Toleranzen und Fertigung (Profi)",
  "hilfe": "Öffnet eine Sammlung technischer Normsymbole (z. B. Mittellinie, Durchmesser, Neigung, Kegel, Kegelsenkung, Flachsenkung, Tiefe, Hüllbedingung, Trennlinie, Erdung) zum schnellen Stempeln oder Anhängen mit Hinweislinie.",
  "tipp": "Über das Suchfeld und die Kategorie-Knöpfe oben im Fenster findest du das passende Symbol sofort."
 },
 "stdORing": {
  "tip": "Norm-O-Ring nach DIN 3771 / ISO 3601 samt passenden Einbaunut-Maßen",
  "hilfe": "Erzeugt einen O-Ring aus wählbarem Innendurchmesser d₁ und Schnurstärke d₂ (oder eigener Größe) mit dem Werkstoff TPU. Rechts siehst du sofort die passenden Nutbreiten und Nuttiefen für statischen, dynamischen und axialen Einbau.",
  "tipp": "Klicke rechts auf „Passende Nut anlegen“, um direkt eine passende O-Ring-Nut als Lochkörper zu erzeugen."
 },
 "stdORingGroove": {
  "tip": "Passende Einbaunut für einen O-Ring (axial, Welle oder Bohrung) nach DIN 3771 / ISO 3601-2",
  "hilfe": "Erzeugt den ringförmigen Schneidkörper für eine O-Ring-Nut als Planflächennut (axial), Wellennut (radial außen) oder Gehäusebohrungsnut (radial innen) mit Normtiefe und Normbreite für statische oder dynamische Abdichtung.",
  "tipp": "Wähle „Axial (Planfläche)“ für Deckelflansche oder „Radial (Welle)“ für Kolben und Buchsen."
 },
 "stdShaftSeal": {
  "tip": "Radial-Wellendichtring (Simmerring) nach DIN 3760 / ISO 6194-1",
  "hilfe": "Erzeugt einen Wellendichtring mit Wellen-Ø d (Passung h11), Gehäuse-Ø D (Passung H8) und Breite b wahlweise als Bauform AS (mit Schutz-/Staublippe) oder Bauform A (ohne Staublippe).",
  "tipp": "Der Hinweis rechts zeigt direkt die empfohlenen Toleranzfelder h11 für die Welle und H8 für die Gehäusebohrung."
 },
 "stdCompSpring": {
  "tip": "Norm-Schrauben-Druckfeder nach DIN EN 13906-1 / DIN 2098 mit berechneter Federrate",
  "hilfe": "Erzeugt eine zylindrische Druckfeder aus Drahtdurchmesser d, mittlerem Windungsdurchmesser Dm, Windungszahl n und Steigung P (oder freier Länge L₀), wahlweise mit angelegten und geschliffenen oder offenen Enden. Rechts werden Außen-/Innen-Ø, Blocklänge Lc und Federrate R angezeigt.",
  "tipp": "Ändere die Windungszahl n oder die freie Länge L₀ direkt rechts, um Einbauraum und Federkraft sofort zu prüfen."
 },
 "stdExtSpring": {
  "tip": "Norm-Schrauben-Zugfeder nach DIN EN 13906-2 mit 1/1 deutschen Ösen",
  "hilfe": "Erzeugt eine eng gewickelte Zugfeder mit beidseitigen 1/1 deutschen Ösen (0° in einer Ebene oder 90° gedreht) und berechnet Gesamtlänge, Abstand zwischen den Ösen L₀ und Federrate R.",
  "tipp": "Mit „Ösen-Stellung 90°“ richtest du die beiden Einhängeösen um eine Vierteldrehung zueinander aus."
 },
 "pmi3d": {
  "tip": "Maße, Toleranzen und Hinweise direkt am 3D-Modell anbringen (PMI, Profi)",
  "hilfe": "Setzt bleibende Maße (Kanten, Durchmesser, Radien, Abstände, Winkel), Toleranzen (±, Abmaße, Grenzmaße, ISO-Passungen wie H7) und Hinweislinien direkt ans 3D-Modell. Über das Auge am Ansichtswürfel oder im Verlauf blendest du alle 3D-Maße gemeinsam oder einzeln aus, und neue Zeichnungen übernehmen sie automatisch samt Toleranz.",
  "tipp": "Klicke auf ein 3D-Maßschildchen im Bild, um rechts im Panel jederzeit seine Toleranz oder den Abstand zu ändern."
 },
 "drawingFinish": {
  "tip": "Zeichnung auf Knopfdruck mit Ansichten, Maßstab, Maßen, Mittellinien und Schriftfeld fertig machen",
  "hilfe": "Schaltet Vorder-, Drauf-, Seiten- und isometrische Ansicht ein, wählt einen passenden Standard-Maßstab ohne Überlauf über den Blattrand, übernimmt die Maße aus dem Modell ohne Überlappen, blendet Mittellinien an allen Bohrungen und Zylindern ein und füllt leere Felder im Schriftfeld automatisch aus.",
  "tipp": "Du kannst jederzeit einzelne Maße, Ansichten oder Schriftfeld-Angaben nachträglich ändern – und mit Rückgängig stellst du den vorherigen Stand wieder her."
 },
 "internalGear": {
  "tip": "Innenzahnrad (Hohlrad) mit innenliegenden Zähnen passend zum Modul (Profi)",
  "hilfe": "Erzeugt ein geschlossenes Hohlrad mit Evolventen-Innenverzahnung (Eingriffswinkel 20°) für Planeten- oder Innengetriebe. Wähle Zähnezahl, Modul, Dicke und Außenwandstärke – außen bleibt ein sauberer Ring stehen.",
  "tipp": "Für ein Planetengetriebe wählst du beim Sonnen- und Planetenrad exakt denselben Modul; es gilt z_Hohlrad = z_Sonne + 2 · z_Planet."
 },
 "gearRack": {
  "tip": "Gerade Zahnstange passend zum Modul (Profi)",
  "hilfe": "Erstellt eine gerade Zahnstange mit trapezförmigem Normprofil (20° Flankenwinkel). Jede Zahnteilung ist exakt π · Modul lang, die Gesamtlänge beträgt damit genau π · Modul · Zähne.",
  "tipp": "Kombiniere die Zahnstange im selben Modul mit einem Stirnrad und einer Zahnstangen-Kopplung (BG-14) für lineare Antriebe."
 },
 "worm": {
  "tip": "Zylinderschnecke (1- bis 4-gängig) passend zum Modul (Profi)",
  "hilfe": "Erzeugt eine gewindeartige Schneckenwelle mit Norm-Trapezprofil (20°) und einstellbarer Gangzahl, Teilkreisdurchmesser, Länge, Bohrung und Steigungsrichtung. Über den Knopf rechts setzt du direkt ein passendes Schneckenrad im richtigen Achsabstand daneben.",
  "tipp": "Eingängige Schnecken mit kleinem Steigungswinkel wirken meist selbsthemmend; für höhere Geschwindigkeiten erhöhst du die Gangzahl (z₁)."
 },
 "wormWheel": {
  "tip": "Schrägverzahntes Schneckenrad passend zu Modul und Schnecke (Profi)",
  "hilfe": "Erzeugt ein Zahnrad, dessen Zähne genau um den Steigungswinkel γ der zugehörigen Schnecke geneigt sind. Stelle denselben Modul, Schnecken-Durchmesser, Gangzahl und Steigungsrichtung ein – rechts siehst du sofort Übersetzung und Achsabstand a = (d₁ + d₂) / 2.",
  "tipp": "Nutze den Knopf „Passende Schnecke hinzufügen“ im Panel rechts, um beide Teile sofort passend auszurichten."
 },
 "helicalGear": {
  "tip": "Schrägverzahntes Stirnrad oder Pfeilverzahnung mit Modul, Zähnezahl und Schrägungswinkel (Profi)",
  "hilfe": "Erzeugt ein Stirnrad mit schrägen Evolventen-Zähnen (rechtssteigend, linkssteigend oder als Pfeilverzahnung). Kopfkreis (m · (z + 2)) und Teilkreis (m · z) stimmen exakt mit geraden Stirnrädern desselben Stirnmoduls überein; über „Passendes Gegenrad hinzufügen“ setzt Tracery direkt ein gegensinnig schräges Rad im richtigen Achsabstand.",
  "tipp": "Schrägzahnräder brauchen für parallele Wellen eine entgegengesetzte Steigung (rechts ↔ links) – mit „Pfeilverzahnung“ heben sich axiale Kräfte ganz auf."
 },
 "bevelGear": {
  "tip": "Geradverzahntes Kegelrad für abgewinkelte Wellen (z. B. 90°-Winkelgetriebe, Profi)",
  "hilfe": "Erzeugt ein Kegelrad nach der Tredgold-Näherung mit wählbarem Modul, eigener Zähnezahl, Gegenrad-Zähnezahl und Achswinkel (Standard 90°). Der Kegelwinkel wird automatisch passend zur Übersetzung berechnet, und über „Passendes Gegenrad hinzufügen“ entsteht sofort das im Achswinkel greifende Paar mit gemeinsamer Kegelspitze.",
  "tipp": "Lass „Kegelwinkel“, „Zahnbreite“ und „Rückenhöhe“ leer für automatische Normwerte – oder trag eigene Maße ein, wenn du ein bestehendes Gehäuse nachbaust."
 },
 "steppedShaft": {
  "tip": "Runde Welle mit Absätzen sowie End- und Absatzfasen (Einfach & Profi)",
  "hilfe": "Erzeugt eine abgesetzte Antriebs- oder Lagerwelle mit Hauptdurchmesser d, Gesamtlänge L, bis zu zwei kleineren oder größeren Absätzen an den Enden sowie einstellbaren Fasen an Enden und Schultern. Im rechten Panel kannst du per Klick gleich einen passenden Stellring oder eine Wellenkupplung direkt auf die Welle setzen.",
  "tipp": "Setze „Absatz 2 Ø“ auf 0, wenn du nur einen Absatz am unteren Wellenende brauchst."
 },
 "shaftCollar": {
  "tip": "Stellring nach DIN 705 mit Gewindestift oder als geschlitzter Klemm-Stellring",
  "hilfe": "Erzeugt einen genormten Stellring (DIN 705, Ø 3–40 mm) oder eigene Maße als axialen Anschlag auf Wellen – wahlweise mit radialer Gewindestift-Bohrung (Form A) oder als geschlitzter Klemm-Stellring mit tangentialer Klemmschraube. Ein kleines Laufspiel (0,05 mm) sorgt dafür, dass der Stellring sauber über die Welle passt.",
  "tipp": "Für den 3D-Druck wählst du rechts unter „Druck-Passung“ einfach „locker“ oder „gleitend“, damit der Ring ohne Nacharbeit auf die Welle gleitet."
 },
 "shaftCoupling": {
  "tip": "Einfache Wellenkupplung (starr mit Gewindestiften, Klemm- oder Flanschkupplung)",
  "hilfe": "Verbindet zwei Wellenenden koaxial miteinander – mit gleichen oder unterschiedlichen Bohrungsdurchmessern (d₁ × d₂) und wahlweise als starre Hülsenkupplung mit Gewindestiften, als geschlitzte Klemmkupplung oder als Flanschkupplung mit 4 Schraubenlöchern.",
  "tipp": "Wähle „Eigene Maße“, um unterschiedliche Wellendurchmesser wie Ø 8 mm auf Ø 10 mm direkt zu verbinden."
 },
 "timingPulley": {
  "tip": "Zahnriemenscheibe (GT2 und HTD) mit optionalen Bordscheiben und Nabe",
  "hilfe": "Erzeugt eine Zahnriemenscheibe für GT2- (2 / 3 / 5 mm) oder HTD-Zahnriemen (3M / 5M / 8M) mit exaktem Teilkreis Ø = Zähne · Teilung / π, abgerundeten Zahnlücken, einstellbarer Riemenbreite, Bohrung, Bordscheiben und Nabe.",
  "tipp": "Wähle „Zweite Riemenscheibe daneben“ im Eigenschaften-Panel und verbinde beide über eine Riemen-Kopplung."
 },
 "sprocket": {
  "tip": "Rollenkettenrad nach Teilung (DIN 8187 / ISO 606, z. B. 1/2\", 3/8\" oder eigene Teilung)",
  "hilfe": "Erzeugt ein Kettenrad für genormte Rollenketten (04B–16B inkl. 1/2\" Standard- und Fahrradkette) oder eine eigene Kettenteilung mit exaktem Teilkreis Ø = p / sin(π / Zähne), Zahnbreite, optionaler Nabe und Bohrung.",
  "tipp": "Für eigene Teilungen oder Kettenräder mit Bund stellst du rechts einfach „Eigene Teilung“ bzw. eine Nabenhöhe größer 0 ein."
 },
 "mountPattern": {
  "tip": "Norm-Lochbilder für Lüfter (25–140 mm), Schrittmotoren (NEMA 14/17/23) und Servos",
  "hilfe": "Schneidet komplette Befestigungs-Lochbilder samt passendem Mittel- oder Gehäuseausschnitt als eigenen Formschritt in eine ebene Fläche. Enthält Axiallüfter von 25 bis 140 mm, Schrittmotoren nach NEMA ICS 16 (NEMA 14, 17, 23) sowie gängige Servos (Standard, Mini, Micro 9g, Groß-Servo). Alle Durchmesser, der Ausschnitt, die Lage (X/Y), Drehung, Tiefe und eine optionale 3D-Druck-Passung lassen sich rechts anpassen.",
  "tipp": "Schalte „Mittelloch schneiden“ aus, wenn du nur die Befestigungslöcher brauchst, oder wähle „gleitend“ unter Druck-Passung, damit Schrauben und Zentrierbund nach dem 3D-Druck sauber passen."
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

