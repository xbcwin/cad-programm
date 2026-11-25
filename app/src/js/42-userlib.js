// ================= Eigene Teile-Bibliothek (BI-08) =================
const UserLib = (() => {
  const STORAGE_KEY = 'tracery-bibliothek';
  const ev = makeEmitter();
  let cache = null;

  const RESERVED_IDS = new Set(['wenn', 'if', 'runden', 'round', 'aufrunden', 'ceil', 'abrunden', 'floor', 'tabelle', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'pow', 'log', 'exp', 'mm', 'cm', 'm', 'in', 'zoll']);
  const SKIP_P_KEYS = new Set(['lib', 'op', 'pt', 'plane', 'extent', 'dir', 'wallSide', 'shape', 'profName', 'target', 'pivot', 'mode', 'side', 'face', 'toFace', 'axisId', 'axis3d', 'axis', 'wrapId', 'blobId', 'fmt', 'data', 'stepEntity', 'stepMat', 'sketch', 'sketches', 'path', 'rail', 'rail2', 'prof', 'path3d', 'features', 'datumId', 'faceRef', 'bind', 'places', 'skip', 'assembly', 'uniform', 'flip', 'ruled', 'head', 'fit', 'size', 'tipAngle', 'kind', 'seal', 'flange', 'pat', 'nut', 'form', 'conn', 'tol', 'align', 'sel']);

  function readStorage() {
    if (cache) return cache;
    try {
      const raw = storageGet(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      cache = Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object' && x.id && x.item) : [];
    } catch (_) {
      cache = [];
    }
    return cache;
  }
  function writeStorage(arr) {
    cache = arr;
    const ok = storageSet(STORAGE_KEY, JSON.stringify(arr));
    ev.emit('change', arr.slice());
    return ok;
  }
  function list() {
    return readStorage().map((x) => deepClone(x));
  }
  function get(id) {
    const found = readStorage().find((x) => x.id === id);
    return found ? deepClone(found) : null;
  }
  function canSave(it) {
    if (!it) return false;
    if (it.kind === 'transform' && !(it.p && it.p.copy)) return false;
    if (it.kind === 'scale' || it.kind === 'deform' || it.kind === 'deleteBody' || it.kind === 'sketch3d') return false;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return false;
    if (it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'boss' || it.kind === 'lipGroove') return false;
    return true;
  }

  function cleanSketchLinks(sk) {
    if (!sk || !Array.isArray(sk.ents)) return;
    for (const e of sk.ents) if (e && e.link) delete e.link;
  }
  function cleanItemTree(it) {
    if (!it || typeof it !== 'object') return;
    delete it.ai;
    delete it.op;
    delete it.link;
    delete it.linkLost;
    delete it.suppressed;
    delete it.hidden;
    if (it.p) {
      if (it.p.sketch) cleanSketchLinks(it.p.sketch);
      if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) cleanSketchLinks(s);
      if (it.p.path) cleanSketchLinks(it.p.path);
      if (it.p.rail) cleanSketchLinks(it.p.rail);
      if (it.p.rail2) cleanSketchLinks(it.p.rail2);
      if (it.p.prof) cleanSketchLinks(it.p.prof);
      if (it.kind === 'import' && it.p.blobId && typeof Store !== 'undefined' && Store.getBlobSync) {
        const u8 = Store.getBlobSync(it.p.blobId);
        if (u8) {
          it.p.data = Store.bytesToBase64(u8);
          delete it.p.blobId;
        }
      }
    }
    if (Array.isArray(it.children)) for (const c of it.children) cleanItemTree(c);
  }
  function hasFormulaT(t) {
    if (!t) return false;
    for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) {
      if (typeof t[k] === 'string' && Model.isExpr(t[k])) return true;
    }
    return false;
  }
  function prepareItem(doc, itemId) {
    const f = Model.find(doc, itemId);
    if (!f || !canSave(f.item)) return null;
    let clone = deepClone(f.item);
    const isTop = Array.isArray(doc.items) && doc.items.includes(f.item);
    if (isTop) {
      const mergedOps = Model.activeItems(doc).filter((x) => x.id !== f.item.id && x.op && x.op.target === f.item.id && (x.op.type === 'cut' || x.op.type === 'join') && canSave(x));
      if (mergedOps.length) {
        const baseM = Model.worldMatrix(doc, f.item.id);
        const baseInv = baseM.clone().invert();
        const kids = [];
        clone.t = Model.T0();
        delete clone.op;
        kids.push(clone);
        for (const opIt of mergedOps) {
          const oc = deepClone(opIt);
          const relM = baseInv.clone().multiply(Model.worldMatrix(doc, opIt.id));
          Model.setFromMatrix(oc, relM);
          oc.role = opIt.op.type === 'cut' ? 'hole' : 'solid';
          delete oc.op;
          kids.push(oc);
        }
        const g = Model.newItem('group', {}, { name: Model.label(f.item), color: f.item.color, role: f.item.role || 'solid' });
        g.t = Model.T0();
        g.children = kids;
        clone = g;
      }
    }
    cleanItemTree(clone);
    if (hasFormulaT(clone.t)) {
      const g = Model.newItem('group', {}, { name: clone.name || Model.label(f.item), color: clone.color, role: clone.role || 'solid' });
      g.t = Model.T0();
      g.children = [clone];
      clone = g;
    } else {
      clone.t = Model.T0();
    }
    return clone;
  }

  function extractExprTokens(str, idsOut, tblsOut) {
    if (typeof str !== 'string' || !str.trim()) return;
    const tblRe = /tabelle\s*\(\s*["']?([^"';)]+)["']?\s*;/gi;
    let tm;
    while ((tm = tblRe.exec(str))) tblsOut.add(tm[1].trim().toLowerCase());
    const stripped = str.replace(/"[^"]*"|'[^']*'/g, ' ');
    const idRe = /[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*/g;
    let m;
    while ((m = idRe.exec(stripped))) {
      const tok = m[0];
      const low = tok.toLowerCase();
      if (!RESERVED_IDS.has(low)) idsOut.add(low);
    }
  }
  function collectItemExprRefs(it, idsOut, tblsOut) {
    if (!it || typeof it !== 'object') return;
    const scanSk = (sk) => {
      if (!sk || !Array.isArray(sk.dims)) return;
      for (const d of sk.dims) if (d && typeof d.v === 'string') extractExprTokens(d.v, idsOut, tblsOut);
    };
    if (it.p) {
      for (const k of Object.keys(it.p)) {
        if (SKIP_P_KEYS.has(k)) continue;
        if (typeof it.p[k] === 'string') extractExprTokens(it.p[k], idsOut, tblsOut);
      }
      if (it.p.sketch) scanSk(it.p.sketch);
      if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) scanSk(s);
      if (it.p.path) scanSk(it.p.path);
      if (it.p.rail) scanSk(it.p.rail);
      if (it.p.rail2) scanSk(it.p.rail2);
      if (it.p.prof) scanSk(it.p.prof);
      if (it.p.path3d) {
        for (const pt of it.p.path3d.pts || []) for (const c of pt || []) if (typeof c === 'string') extractExprTokens(c, idsOut, tblsOut);
        for (const r of it.p.path3d.rules || []) if (r && typeof r.len === 'string') extractExprTokens(r.len, idsOut, tblsOut);
      }
    }
    if (it.t) {
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) if (typeof it.t[k] === 'string') extractExprTokens(it.t[k], idsOut, tblsOut);
    }
    for (const f of it.finishes || []) {
      if (typeof f.r === 'string') extractExprTokens(f.r, idsOut, tblsOut);
      if (typeof f.r2 === 'string') extractExprTokens(f.r2, idsOut, tblsOut);
      if (typeof f.a === 'string') extractExprTokens(f.a, idsOut, tblsOut);
      if (typeof f.d1 === 'string') extractExprTokens(f.d1, idsOut, tblsOut);
      if (typeof f.d2 === 'string') extractExprTokens(f.d2, idsOut, tblsOut);
      if (typeof f.d3 === 'string') extractExprTokens(f.d3, idsOut, tblsOut);
    }
    if (it.userPart && Array.isArray(it.userPart.params)) {
      for (const up of it.userPart.params) if (up && typeof up.expr === 'string') extractExprTokens(up.expr, idsOut, tblsOut);
    }
    if (Array.isArray(it.children)) for (const c of it.children) collectItemExprRefs(c, idsOut, tblsOut);
  }
  function sanitizeParamName(raw, usedLower) {
    let s = String(raw || 'Mass').replace(/[^A-Za-zÄÖÜäöüß_0-9]/g, '_').replace(/^[^A-Za-zÄÖÜäöüß_]+/, '');
    if (!s || RESERVED_IDS.has(s.toLowerCase())) s = 'Mass_' + (s || '1');
    let out = s, n = 2;
    while (usedLower.has(out.toLowerCase()) || RESERVED_IDS.has(out.toLowerCase())) out = s + n++;
    usedLower.add(out.toLowerCase());
    return out;
  }
  function detectParams(item, doc) {
    const docParams = (doc && Array.isArray(doc.params)) ? doc.params : [];
    const docTables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    const V = doc ? Model.itemVars(doc, item.id) : {};
    const ids = new Set();
    const tbls = new Set();
    collectItemExprRefs(item, ids, tbls);

    const ownMap = new Map();
    const candidates = [];
    const seenNames = new Set();

    if (item.userPart && Array.isArray(item.userPart.params)) {
      for (const up of item.userPart.params) {
        if (!up || !up.name) continue;
        const low = String(up.name).toLowerCase();
        if (seenNames.has(low)) continue;
        seenNames.add(low);
        ownMap.set(low, up);
        const val = Model.num(up.expr, V, 0);
        candidates.push({ source: 'param', checked: true, name: up.name, label: up.label || up.name, expr: up.expr, val, unit: up.unit ?? 'mm' });
      }
    }

    // Transitiv verwendete Projekt-Parameter nachziehen
    const neededParams = new Set();
    let added = true;
    while (added) {
      added = false;
      for (const dp of docParams) {
        const low = String(dp.name || '').toLowerCase();
        if (!low || ownMap.has(low) || neededParams.has(low)) continue;
        if (ids.has(low)) {
          neededParams.add(low);
          added = true;
          if (typeof dp.expr === 'string') extractExprTokens(dp.expr, ids, tbls);
        }
      }
    }
    for (const dp of docParams) {
      const low = String(dp.name || '').toLowerCase();
      if (!neededParams.has(low) || seenNames.has(low)) continue;
      seenNames.add(low);
      const val = Model.num(dp.expr, V, 0);
      candidates.push({ source: 'param', checked: true, name: dp.name, label: dp.name, expr: dp.expr, val, unit: 'mm' });
    }

    const usedTables = [];
    const seenTbls = new Set();
    for (const tb of docTables) {
      if (!tb || !tb.name) continue;
      if (tbls.has(tb.name.toLowerCase()) && !seenTbls.has(tb.name.toLowerCase())) {
        seenTbls.add(tb.name.toLowerCase());
        usedTables.push(deepClone(tb));
      }
    }
    if (item.userPart && Array.isArray(item.userPart.tables)) {
      for (const tb of item.userPart.tables) {
        if (!tb || !tb.name || seenTbls.has(tb.name.toLowerCase())) continue;
        seenTbls.add(tb.name.toLowerCase());
        usedTables.push(deepClone(tb));
      }
    }

    // Direkte Zahlenfelder am Wurzelteil anbieten (z. B. Breite, Tiefe, Höhe beim Quader)
    const defaultCheckFields = candidates.length === 0;
    const addFieldCandidate = (field, label, val, unit, source = 'field', extra = {}) => {
      if (typeof val !== 'number' || !isFinite(val)) return;
      const pName = sanitizeParamName(label || field, seenNames);
      candidates.push({ source, field, label: label || field, name: pName, expr: val, val, unit: unit ?? 'mm', checked: defaultCheckFields, ...extra });
    };
    if (item.kind !== 'group') {
      if (KINDS[item.kind] && Array.isArray(KINDS[item.kind].params) && KINDS[item.kind].params.length) {
        for (const q of KINDS[item.kind].params) {
          addFieldCandidate(q.k, q.label, item.p && item.p[q.k], q.unit ?? 'mm');
        }
      } else if (item.kind === 'part' && item.p && typeof LIBMAP !== 'undefined' && LIBMAP[item.p.lib]) {
        const def = LIBMAP[item.p.lib];
        for (const q of def.params || []) {
          if (q.type !== 'select') addFieldCandidate(q.k, q.label, item.p[q.k], q.unit ?? 'mm');
        }
      } else if (item.kind === 'extrude' && item.p) {
        if (!item.p.thru && item.p.extent !== 'toNext' && item.p.extent !== 'toFace') {
          addFieldCandidate('dist', 'Höhe', item.p.dist, 'mm');
        }
        if (item.p.thin) addFieldCandidate('wall', 'Wandstärke', item.p.wall, 'mm');
        const dims = (item.p.sketch && Array.isArray(item.p.sketch.dims)) ? item.p.sketch.dims : [];
        dims.forEach((d, idx) => {
          if (!d || d.ref || typeof d.v !== 'number' || !isFinite(d.v)) return;
          const lblMap = { w: 'Breite', h: 'Höhe', len: 'Länge', d: 'Durchmesser', r: 'Radius', dist: 'Abstand', ang: 'Winkel' };
          const unit = d.t === 'ang' || d.t === 'angLL' ? '°' : d.t === 'n' ? '' : 'mm';
          addFieldCandidate('dim_' + idx, lblMap[d.t] || 'Skizzenmaß', d.v, unit, 'sketchDim', { dimIdx: idx });
        });
      } else if (item.kind === 'revolve' && item.p && item.p.dir !== 'toFace') {
        addFieldCandidate('angle', 'Winkel', item.p.angle, '°');
      }
    }

    return { candidates, tables: usedTables };
  }

  function escapeRe(s) {
    return String(s).replace(/[$^.*+?()[\]{}|\\]/g, '\\$&');
  }
  function renameInExpr(expr, oldName, newName) {
    if (typeof expr !== 'string' || !oldName || oldName === newName) return expr;
    const re = new RegExp('(^|[^A-Za-zÄÖÜäöüß_0-9])' + escapeRe(oldName) + '(?![A-Za-zÄÖÜäöüß_0-9])', 'gi');
    return expr.replace(re, (_, pre) => pre + newName);
  }
  function renameInItem(it, oldName, newName) {
    if (!it || typeof it !== 'object' || !oldName || oldName === newName) return;
    if (it.p) {
      for (const k of Object.keys(it.p)) {
        if (!SKIP_P_KEYS.has(k) && typeof it.p[k] === 'string') it.p[k] = renameInExpr(it.p[k], oldName, newName);
      }
      const fixSk = (sk) => { if (sk && Array.isArray(sk.dims)) for (const d of sk.dims) if (d && typeof d.v === 'string') d.v = renameInExpr(d.v, oldName, newName); };
      fixSk(it.p.sketch);
      if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) fixSk(s);
      fixSk(it.p.path); fixSk(it.p.rail); fixSk(it.p.rail2); fixSk(it.p.prof);
      if (it.p.path3d) {
        for (const pt of it.p.path3d.pts || []) for (let i = 0; i < (pt || []).length; i++) if (typeof pt[i] === 'string') pt[i] = renameInExpr(pt[i], oldName, newName);
        for (const r of it.p.path3d.rules || []) if (r && typeof r.len === 'string') r.len = renameInExpr(r.len, oldName, newName);
      }
    }
    if (it.t) {
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) if (typeof it.t[k] === 'string') it.t[k] = renameInExpr(it.t[k], oldName, newName);
    }
    for (const f of it.finishes || []) {
      if (typeof f.r === 'string') f.r = renameInExpr(f.r, oldName, newName);
      if (typeof f.r2 === 'string') f.r2 = renameInExpr(f.r2, oldName, newName);
      if (typeof f.a === 'string') f.a = renameInExpr(f.a, oldName, newName);
      if (typeof f.d1 === 'string') f.d1 = renameInExpr(f.d1, oldName, newName);
      if (typeof f.d2 === 'string') f.d2 = renameInExpr(f.d2, oldName, newName);
      if (typeof f.d3 === 'string') f.d3 = renameInExpr(f.d3, oldName, newName);
    }
    if (Array.isArray(it.children)) for (const c of it.children) renameInItem(c, oldName, newName);
  }

  function saveItem(itemId, opts = {}) {
    const doc = opts.doc || App.doc;
    const f = Model.find(doc, itemId);
    if (!f) return null;
    const clone = prepareItem(doc, itemId);
    if (!clone) return null;
    const detected = detectParams(clone, doc);
    const chosen = Array.isArray(opts.params) ? opts.params : detected.candidates.filter((c) => c.checked);
    const finalParams = [];
    const usedNames = new Set();
    const renames = [];
    const chosenOrigLower = new Set();

    for (const c of chosen) {
      const name = sanitizeParamName(c.name || c.origName || c.label || c.field || 'Mass', usedNames);
      const exprVal = c.expr !== undefined ? c.expr : c.val;
      if (c.source === 'field' && c.field && clone.p) {
        clone.p[c.field] = name;
      } else if (c.source === 'sketchDim' && c.dimIdx != null && clone.p && clone.p.sketch && clone.p.sketch.dims && clone.p.sketch.dims[c.dimIdx]) {
        clone.p.sketch.dims[c.dimIdx].v = name;
      } else {
        if (c.source === 'param') chosenOrigLower.add(String(c.origName || c.name).toLowerCase());
        if (c.origName && c.origName !== name) {
          renameInItem(clone, c.origName, name);
          renames.push([c.origName, name]);
        }
      }
      finalParams.push({
        name,
        label: c.label || name,
        expr: exprVal,
        unit: c.unit ?? 'mm',
      });
    }
    for (const [oldN, newN] of renames) {
      for (const fp of finalParams) if (typeof fp.expr === 'string') fp.expr = renameInExpr(fp.expr, oldN, newN);
    }
    for (const c of detected.candidates) {
      if (c.source !== 'param' || chosenOrigLower.has(String(c.name).toLowerCase())) continue;
      const nv = isFinite(c.val) ? round(c.val, 4) : 0;
      const repl = nv < 0 ? '(' + nv + ')' : String(nv);
      renameInItem(clone, c.name, repl);
      for (const fp of finalParams) if (typeof fp.expr === 'string') fp.expr = renameInExpr(fp.expr, c.name, repl);
    }
    delete clone.userPart;

    let thumb = opts.thumb;
    if (thumb === undefined && typeof Viewer !== 'undefined' && Viewer.renderPartThumb) {
      const top = Model.topOf(doc, itemId);
      const tid = top ? top.id : itemId;
      thumb = Viewer.renderPartThumb([tid], 160, 120) || null;
    }

    const name = String(opts.name || Model.label(f.item) || 'Mein Teil').trim() || 'Mein Teil';
    clone.name = name;
    const entry = {
      id: uid('ul'),
      name,
      desc: String(opts.desc || '').trim(),
      role: clone.role || 'solid',
      thumb: thumb || null,
      created: Date.now(),
      params: finalParams,
      tables: detected.tables || [],
      item: clone,
    };
    const arr = readStorage().slice();
    arr.unshift(entry);
    writeStorage(arr);
    return deepClone(entry);
  }

  function thumbHTML(entry) {
    if (entry && entry.thumb) return `<img class="ul-thumb" src="${esc(entry.thumb)}" alt="">`;
    const col = entry && entry.role === 'hole' ? 'var(--hole)' : 'var(--accent)';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC.parts}</svg>`;
  }

  function saveDialog(itemId) {
    const id = itemId || (App.sel && App.sel[0]);
    const f = id ? Model.find(App.doc, id) : null;
    if (!f) { UI.toast('Wähle zuerst ein Teil aus.', { icon: 'info' }); return null; }
    if (!canSave(f.item)) { UI.toast('Diesen Schritt kannst du nicht einzeln speichern – wähle den ganzen Körper oder die Gruppe.', { icon: 'info' }); return null; }

    const top = Model.topOf(App.doc, f.item.id);
    const thumb = typeof Viewer !== 'undefined' && Viewer.renderPartThumb ? Viewer.renderPartThumb([top ? top.id : f.item.id], 160, 120) : null;
    const detected = detectParams(f.item, App.doc);
    const defName = Model.label(f.item) || 'Mein Teil';

    const prevBox = h('div', { class: 'ul-save-preview', html: thumbHTML({ thumb, role: f.item.role }) });
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'ul-name' }, 'Name in meiner Bibliothek'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-name', type: 'text', value: defName, autocomplete: 'off', spellcheck: 'false' })));
    const descF = h('div', { class: 'field' },
      h('label', { for: 'ul-desc' }, 'Beschreibung (optional)'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-desc', type: 'text', placeholder: 'z. B. Halterung mit variabler Breite', autocomplete: 'off' })));

    const head = h('div', { class: 'ul-save-head' }, prevBox, h('div', { style: { display: 'grid', gap: '8px', minWidth: 0 } }, nameF, descF));
    const paramSec = h('div', { class: 'ul-param-sec' },
      h('div', { class: 'section-h' }, 'Änderbare Maße beim Einsetzen'),
      h('div', { class: 'hint-box' }, detected.candidates.length
        ? 'Angehakte Maße werden beim Einsetzen in andere Projekte eigene Eingabefelder rechts.'
        : 'Dieses Teil hat keine änderbaren Zahlenmaße – es wird als fertige Form gespeichert.'));

    const rows = [];
    if (detected.candidates.length) {
      const listEl = h('div', { class: 'ul-param-list', id: 'ul-params' });
      detected.candidates.forEach((c, idx) => {
        const chk = h('input', { type: 'checkbox', class: 'ul-p-chk', checked: !!c.checked, dataset: { param: c.name, idx: String(idx) }, 'aria-label': `Maß ${c.name} übernehmen` });
        const nmInp = h('input', { type: 'text', class: 'ul-p-name', value: c.name, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Maßname' });
        const valDisp = typeof c.expr === 'number' ? fmtFixed(c.expr, 4) : String(c.expr);
        const valInp = h('input', { type: 'text', class: 'ul-p-val', value: valDisp, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Vorgabewert' });
        const row = h('div', { class: 'ul-param-row', dataset: { param: c.name } },
          chk,
          h('div', { class: 'inp' }, nmInp),
          h('div', { class: 'inp' }, valInp),
          h('span', { class: 'ul-p-unit' }, c.unit || ''));
        rows.push({ c, chk, nmInp, valInp });
        listEl.append(row);
      });
      paramSec.append(listEl);
    }

    const body = h('div', { id: 'userlib-save-dialog', 'data-help': 'userLibrary' }, head, paramSec);
    let modalRef = null;
    const doSave = () => {
      const nInp = $('#ul-name', body);
      const nm = (nInp && nInp.value || '').trim();
      if (!nm) { UI.toast('Gib dem Teil bitte einen Namen.', { kind: 'bad' }); nInp && nInp.focus(); return false; }
      const chosen = [];
      for (const r of rows) {
        if (!r.chk.checked) continue;
        const rawN = (r.nmInp.value || '').trim();
        const rawV = (r.valInp.value || '').trim();
        let exprVal = r.c.expr;
        const parsed = parseNum(rawV);
        if (rawV !== '') exprVal = !isNaN(parsed) ? parsed : rawV;
        chosen.push({
          ...r.c,
          origName: r.c.source === 'param' ? r.c.name : undefined,
          name: rawN || r.c.name,
          label: rawN || r.c.label || r.c.name,
          expr: exprVal,
        });
      }
      const entry = saveItem(f.item.id, {
        name: nm,
        desc: ($('#ul-desc', body) || {}).value || '',
        params: chosen,
        thumb,
      });
      if (!entry) { UI.toast('Konnte das Teil nicht speichern.', { kind: 'bad' }); return false; }
      UI.toast(`„${entry.name}“ in „Meine Teile“ gespeichert.`, { icon: 'check' });
      return true;
    };

    modalRef = UI.modal({
      title: 'In meine Bibliothek speichern',
      body,
      actions: [
        { label: 'Abbrechen', value: false },
        { label: 'Speichern', id: 'ul-save-ok', primary: true, value: true, run: () => doSave() },
      ],
    });
    const nInp = $('#ul-name', body);
    if (nInp) {
      nInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (doSave() !== false) modalRef.close(true); } });
      setTimeout(() => { nInp.focus(); nInp.select(); }, 30);
    }
    return modalRef;
  }

  function buildInsertItem(entry, opts = {}) {
    const e = typeof entry === 'string' ? get(entry) : entry;
    if (!e || !e.item) return null;
    const item = Model.reId(deepClone(e.item));
    item.name = opts.name || e.name || item.name;
    item.userPart = {
      libId: e.id,
      name: e.name,
      params: (e.params || []).map((p) => ({ name: p.name, label: p.label || p.name, expr: p.expr, unit: p.unit ?? 'mm' })),
      ...(Array.isArray(e.tables) && e.tables.length ? { tables: deepClone(e.tables) } : {}),
    };
    return { item, entry: e };
  }
  function previewItem(entry) {
    const built = buildInsertItem(entry);
    return built ? built.item : null;
  }
  function insert(entryOrId, opts = {}) {
    const built = buildInsertItem(entryOrId, opts);
    if (!built) { UI.toast('Dieses eigene Teil wurde nicht gefunden.', { kind: 'bad' }); return null; }
    return Actions.addUserPart(built.item, built.entry, opts);
  }
  function remove(id) {
    const arr = readStorage();
    const next = arr.filter((x) => x.id !== id);
    if (next.length === arr.length) return false;
    writeStorage(next);
    return true;
  }
  function rename(id, name) {
    const nm = String(name || '').trim();
    if (!nm) return false;
    const arr = readStorage().map((x) => (x.id === id ? { ...x, name: nm } : x));
    return writeStorage(arr);
  }
  function clear() {
    writeStorage([]);
  }

  return {
    STORAGE_KEY,
    list,
    get,
    canSave,
    detectParams,
    saveItem,
    saveDialog,
    insert,
    previewItem,
    remove,
    rename,
    clear,
    thumbHTML,
    on: ev.on,
  };
})();
