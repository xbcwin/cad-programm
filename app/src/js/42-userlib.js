// ================= Eigene Teile-Bibliothek & STEP-Katalog (BI-08, BI-29) =================
const UserLib = (() => {
  const STORAGE_KEY = 'tracery-bibliothek';
  const LS_MIRROR_MAX = 1500000;
  const DEFAULT_CATEGORIES = ['Motoren', 'Lager & Wellen', 'Elektronik', 'Stecker & Buchsen', 'Befestigung', 'Sensoren', 'Gehäuse', 'Sonstiges'];
  const GENERIC_STEP_META = new Set(['open cascade', 'opencascade', 'open cascade step translator', 'tracery', 'none', 'unknown', 'author', 'organization', 'company', 'unspecified', 'default', 'user', 'cad', 'step', 'file description', 'n/a', 'na', '-', '.']);
  const ev = makeEmitter();
  let cache = null;
  let ready = false;
  let initPromise = null;
  let modSeq = 0;
  let lastSavePromise = Promise.resolve();

  const RESERVED_IDS = new Set(['wenn', 'if', 'runden', 'round', 'aufrunden', 'ceil', 'abrunden', 'floor', 'tabelle', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'pow', 'log', 'exp', 'mm', 'cm', 'm', 'in', 'zoll']);
  const SKIP_P_KEYS = new Set(['lib', 'op', 'pt', 'plane', 'extent', 'dir', 'wallSide', 'shape', 'profName', 'target', 'pivot', 'mode', 'side', 'face', 'toFace', 'axisId', 'axis3d', 'axis', 'wrapId', 'blobId', 'fmt', 'data', 'stepEntity', 'stepMat', 'sketch', 'sketches', 'path', 'rail', 'rail2', 'prof', 'path3d', 'features', 'datumId', 'faceRef', 'bind', 'places', 'skip', 'assembly', 'uniform', 'flip', 'ruled', 'head', 'fit', 'size', 'tipAngle', 'kind', 'seal', 'flange', 'pat', 'nut', 'form', 'conn', 'tol', 'align', 'sel']);

  function tr(key, vars, fallback) {
    if (typeof T === 'function') {
      const s = T(key, vars);
      if (s && s !== key) return s;
    }
    return fallback;
  }
  function collectEntryBlobIds(it, out = new Set()) {
    if (!it || typeof it !== 'object') return out;
    if (it.kind === 'import' && it.p && typeof it.p.blobId === 'string' && it.p.blobId) out.add(it.p.blobId);
    if (Array.isArray(it.children)) for (const c of it.children) collectEntryBlobIds(c, out);
    return out;
  }
  async function hydrateEntryBlobs(entries) {
    if (typeof Store === 'undefined' || !Store.getBlob) return;
    const ids = new Set();
    for (const e of entries || []) {
      if (!e) continue;
      if (typeof e.stepBlobId === 'string' && e.stepBlobId) ids.add(e.stepBlobId);
      if (e.item) collectEntryBlobIds(e.item, ids);
    }
    const missing = [...ids].filter((id) => !Store.getBlobSync || !Store.getBlobSync(id));
    if (missing.length) await Promise.all(missing.map((id) => Store.getBlob(id).catch(() => null)));
  }
  function syncLocalMirror(arr) {
    try {
      const json = JSON.stringify(arr);
      if (json.length <= LS_MIRROR_MAX) {
        storageSet(STORAGE_KEY, json);
      } else {
        storageDel(STORAGE_KEY);
      }
    } catch (_) {
      storageDel(STORAGE_KEY);
    }
  }
  function readStorage() {
    if (cache) return cache;
    if (typeof Store !== 'undefined' && Store.getUserLibSync) {
      const idbArr = Store.getUserLibSync();
      if (Array.isArray(idbArr)) {
        cache = idbArr.filter((x) => x && typeof x === 'object' && x.id && x.item);
        return cache;
      }
    }
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
    modSeq++;
    cache = arr;
    syncLocalMirror(arr);
    if (typeof Store !== 'undefined' && Store.saveUserLib) {
      lastSavePromise = Store.saveUserLib(arr);
    }
    ev.emit('change', arr.slice());
    return true;
  }
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (typeof Store === 'undefined' || !Store.init) { ready = true; return readStorage(); }
      await Store.init();
      const seqBefore = modSeq;
      const idbList = Store.loadUserLib ? await Store.loadUserLib() : null;
      if (modSeq !== seqBefore) {
        if (cache && Store.saveUserLib) {
          lastSavePromise = Store.saveUserLib(cache);
          await lastSavePromise;
        }
      } else if (Array.isArray(idbList)) {
        cache = idbList.filter((x) => x && typeof x === 'object' && x.id && x.item);
        syncLocalMirror(cache);
        ev.emit('change', cache.slice());
      } else {
        const legacy = readStorage().slice();
        if (legacy.length && Store.extractBlobs) {
          for (const e of legacy) if (e && e.item) Store.extractBlobs({ items: [e.item] });
        }
        cache = legacy;
        if (Store.saveUserLib) {
          lastSavePromise = Store.saveUserLib(cache);
          await lastSavePromise;
        }
      }
      await hydrateEntryBlobs(cache || []);
      ready = true;
      return cache ? cache.slice() : [];
    })();
    return initPromise;
  }
  async function whenReady() {
    await (initPromise || init());
    await lastSavePromise;
    if (typeof Store !== 'undefined' && Store.whenIdle) await Store.whenIdle();
  }
  function list(opts = null) {
    let arr = readStorage();
    if (opts && typeof opts === 'object') {
      const cat = typeof opts.category === 'string' ? opts.category.trim() : '';
      const mfr = typeof opts.manufacturer === 'string' ? opts.manufacturer.trim().toLowerCase() : '';
      const q = typeof opts.query === 'string' ? opts.query.trim().toLowerCase() : '';
      if (cat) arr = arr.filter((x) => String(x.category || '').trim() === cat);
      if (mfr) arr = arr.filter((x) => String(x.manufacturer || '').trim().toLowerCase() === mfr);
      if (q) {
        arr = arr.filter((x) => [x.name, x.category, x.manufacturer, x.desc, x.stepFile].some((v) => String(v || '').toLowerCase().includes(q)));
      }
    }
    return arr.map((x) => deepClone(x));
  }
  function categories() {
    const set = new Set();
    for (const e of readStorage()) {
      const c = String((e && e.category) || '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }
  function suggestedCategories() {
    const out = DEFAULT_CATEGORIES.slice();
    const seen = new Set(out.map((c) => c.toLowerCase()));
    for (const c of categories()) {
      if (!seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        out.push(c);
      }
    }
    return out;
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
    if (it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'mountPattern' || it.kind === 'portCutout' || it.kind === 'magnetPocket' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern') return false;
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
      if (it.kind === 'import') {
        if (typeof Store !== 'undefined' && Store.usingIDB) {
          if (!it.p.blobId && typeof it.p.data === 'string' && it.p.data.length && Store.registerBlob && Store.base64ToBytes) {
            try {
              const u8 = Store.base64ToBytes(it.p.data);
              it.p.blobId = Store.registerBlob(u8);
              it.p.size = u8.byteLength;
              delete it.p.data;
            } catch (_) {}
          }
        } else if (it.p.blobId && typeof Store !== 'undefined' && Store.getBlobSync) {
          const u8 = Store.getBlobSync(it.p.blobId);
          if (u8) {
            it.p.data = Store.bytesToBase64(u8);
            delete it.p.blobId;
          }
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
    const category = String(opts.category || '').trim();
    const manufacturer = String(opts.manufacturer || '').trim();
    clone.name = name;
    const entry = {
      id: uid('ul'),
      name,
      desc: String(opts.desc || '').trim(),
      category,
      manufacturer,
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

  function appendCategoryChips(container, inputEl, cats) {
    if (!cats || !cats.length) return;
    const row = h('div', { class: 'ul-cat-chips' });
    const syncActive = () => {
      const cur = (inputEl.value || '').trim().toLowerCase();
      for (const b of row.querySelectorAll('.ul-cat-chip')) {
        b.classList.toggle('active', b.dataset.cat.toLowerCase() === cur);
      }
    };
    for (const c of cats) {
      const chip = h('button', { type: 'button', class: 'ul-cat-chip', dataset: { cat: c } }, c);
      chip.onclick = () => { inputEl.value = c; syncActive(); inputEl.dispatchEvent(new Event('input')); };
      row.append(chip);
    }
    inputEl.addEventListener('input', syncActive);
    syncActive();
    container.append(row);
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
    const defMfr = (f.item.props && f.item.props.supplier) ? String(f.item.props.supplier) : '';
    const defDesc = (f.item.props && f.item.props.desc) ? String(f.item.props.desc) : '';
    const cats = suggestedCategories();

    const prevBox = h('div', { class: 'ul-save-preview', html: thumbHTML({ thumb, role: f.item.role }) });
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'ul-name' }, 'Name in meiner Bibliothek'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-name', type: 'text', value: defName, autocomplete: 'off', spellcheck: 'false' })));
    const catListId = 'ul-save-cat-list';
    const catInp = h('input', { id: 'ul-cat', type: 'text', list: catListId, placeholder: tr('userlib.catPlaceholder', null, 'z. B. Motoren'), autocomplete: 'off' });
    const catList = h('datalist', { id: catListId }, ...cats.map((c) => h('option', { value: c })));
    const catF = h('div', { class: 'field' },
      h('label', { for: 'ul-cat' }, tr('userlib.catLabel', null, 'Kategorie (optional)')),
      h('div', { class: 'inp' }, catInp), catList);
    const mfrF = h('div', { class: 'field' },
      h('label', { for: 'ul-mfr' }, tr('userlib.mfrLabel', null, 'Hersteller (optional)')),
      h('div', { class: 'inp' }, h('input', { id: 'ul-mfr', type: 'text', value: defMfr, placeholder: tr('userlib.mfrPlaceholder', null, 'z. B. Bosch, T-Motor …'), autocomplete: 'off' })));
    const descF = h('div', { class: 'field' },
      h('label', { for: 'ul-desc' }, 'Beschreibung (optional)'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-desc', type: 'text', value: defDesc, placeholder: 'z. B. Halterung mit variabler Breite', autocomplete: 'off' })));

    const metaGrid = h('div', { class: 'ul-meta-grid' }, catF, mfrF);
    const head = h('div', { class: 'ul-save-head' }, prevBox, h('div', { style: { display: 'grid', gap: '8px', minWidth: 0 } }, nameF, metaGrid, descF));
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
        category: ($('#ul-cat', body) || {}).value || '',
        manufacturer: ($('#ul-mfr', body) || {}).value || '',
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
    if (e.manufacturer || e.desc) {
      item.props = { ...(item.props || {}) };
      if (e.manufacturer && !item.props.supplier) item.props.supplier = e.manufacturer;
      if (e.desc && !item.props.desc) item.props.desc = e.desc;
    }
    item.userPart = {
      libId: e.id,
      name: e.name,
      ...(e.category ? { category: e.category } : {}),
      ...(e.manufacturer ? { manufacturer: e.manufacturer } : {}),
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
    const bids = [...collectEntryBlobIds(built.item)];
    const missing = typeof Store !== 'undefined' && Store.getBlobSync
      ? bids.filter((bid) => !Store.getBlobSync(bid))
      : [];
    if (missing.length && Store.getBlob) {
      return Promise.all(missing.map((bid) => Store.getBlob(bid))).then(() => Actions.addUserPart(built.item, built.entry, opts));
    }
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
    const arr = readStorage().map((x) => (x.id === id ? { ...x, name: nm, item: { ...x.item, name: nm } } : x));
    return writeStorage(arr);
  }
  function update(id, patch = {}) {
    const arr = readStorage();
    let updated = null;
    const next = arr.map((x) => {
      if (x.id !== id) return x;
      const nx = { ...x };
      if (typeof patch.name === 'string' && patch.name.trim()) {
        nx.name = patch.name.trim();
        nx.item = { ...nx.item, name: nx.name };
      }
      if (patch.category !== undefined) nx.category = String(patch.category || '').trim();
      if (patch.manufacturer !== undefined) {
        nx.manufacturer = String(patch.manufacturer || '').trim();
        nx.item = { ...nx.item, props: { ...(nx.item.props || {}), supplier: nx.manufacturer } };
      }
      if (patch.desc !== undefined) {
        nx.desc = String(patch.desc || '').trim();
        nx.item = { ...nx.item, props: { ...(nx.item.props || {}), desc: nx.desc } };
      }
      updated = nx;
      return nx;
    });
    if (!updated) return null;
    writeStorage(next);
    return deepClone(updated);
  }
  function clear() {
    writeStorage([]);
  }

  // ---------- STEP-Teile aus Hersteller-Katalogen (BI-29) ----------
  function isStepFile(file) {
    return !!(file && /\.(step|stp)$/i.test(file.name || ''));
  }
  function parseStepHeader(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const slice = u8.subarray(0, Math.min(u8.length, 16384));
    const head = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    const isStep = /ISO-10303-21/i.test(head) || (/\bHEADER\s*;/i.test(head) && /\bDATA\s*;/i.test(head));
    if (!isStep) return { ok: false, manufacturer: '', description: '' };

    const decodeStepStr = (s) => {
      if (!s) return '';
      return s
        .replace(/''/g, "'")
        .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
          let r = '';
          for (let i = 0; i + 3 < hex.length; i += 4) r += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
          return r;
        })
        .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\\\/g, '\\')
        .trim();
    };
    const extractEntityArgs = (entName) => {
      const m = new RegExp('\\b' + entName + '\\s*\\(', 'i').exec(head);
      if (!m) return null;
      let i = m.index + m[0].length;
      const n = head.length;
      const parseList = (stopAtParen) => {
        const out = [];
        while (i < n) {
          while (i < n && head[i] <= ' ') i++;
          if (i >= n) break;
          const ch = head[i];
          if (ch === ')') { if (stopAtParen) i++; break; }
          if (ch === ',') { i++; continue; }
          if (ch === "'") {
            i++;
            let s = '';
            while (i < n) {
              if (head[i] === "'" && head[i + 1] === "'") { s += "''"; i += 2; continue; }
              if (head[i] === "'") { i++; break; }
              s += head[i++];
            }
            out.push(decodeStepStr(s));
          } else if (ch === '(') {
            i++;
            out.push(parseList(true));
          } else {
            const st = i;
            while (i < n && head[i] !== ',' && head[i] !== ')' && head[i] !== ';') i++;
            out.push(head.slice(st, i).trim());
          }
        }
        return out;
      };
      return parseList(true);
    };
    const pickText = (arg) => {
      const parts = Array.isArray(arg) ? arg : [arg];
      const clean = parts.map((v) => String(v || '').trim()).filter((v) => v && !GENERIC_STEP_META.has(v.toLowerCase()));
      return clean.join(', ');
    };
    const fnArgs = extractEntityArgs('FILE_NAME');
    const fdArgs = extractEntityArgs('FILE_DESCRIPTION');
    const manufacturer = fnArgs && fnArgs.length > 3 ? pickText(fnArgs[3]) : '';
    const description = fdArgs && fdArgs.length > 0 ? pickText(fdArgs[0]) : '';
    return { ok: true, manufacturer, description };
  }
  function buildStepItem(bytes, fileName, blobId, displayName = '') {
    const base = String(fileName || 'STEP').replace(/\.(step|stp)$/i, '').trim() || 'STEP-Teil';
    let parsed = null;
    try {
      if (typeof Start !== 'undefined' && Start.parseSTEP) parsed = Start.parseSTEP(bytes);
    } catch (_) {}
    if (parsed && parsed.partCount > 0 && Array.isArray(parsed.roots) && parsed.roots.length) {
      let partIdx = 0;
      const buildNodes = (nodes) => nodes.map((node) => {
        if (node.type === 'assembly') {
          const kids = buildNodes(node.children);
          const firstSolid = kids.find((c) => c.role !== 'hole') || kids[0];
          const g = Model.newItem('group', { assembly: true }, { name: node.name || base, color: (firstSolid && firstSolid.color) || undefined });
          g.t = Model.T0();
          g.children = kids;
          return g;
        }
        partIdx++;
        const p = { fmt: 'step', blobId, size: bytes.byteLength, file: fileName, scale: 1 };
        if (parsed.partCount > 1 && node.entityId) p.stepEntity = node.entityId;
        if (node.matrix) p.stepMat = node.matrix;
        const name = node.name || (parsed.partCount === 1 ? base : `${base} ${partIdx}`);
        const extra = { name };
        if (node.color) { extra.color = node.color; extra.more = { colorSet: true }; }
        const imp = Model.newItem('import', p, extra);
        imp.t = Model.T0();
        return imp;
      });
      const items = buildNodes(parsed.roots);
      const suggestedName = (parsed.roots.length === 1 && parsed.roots[0].name) ? parsed.roots[0].name : base;
      let item;
      if (items.length === 1) {
        item = items[0];
      } else {
        const firstSolid = items.find((c) => c.role !== 'hole') || items[0];
        item = Model.newItem('group', { assembly: true }, { name: displayName || suggestedName || base, color: (firstSolid && firstSolid.color) || undefined });
        item.children = items;
      }
      item.t = Model.T0();
      if (displayName) item.name = displayName;
      return { item, partCount: parsed.partCount, groupCount: parsed.groupCount, suggestedName };
    }
    const item = Model.newItem('import', { fmt: 'step', blobId, size: bytes.byteLength, file: fileName, scale: 1 }, { name: displayName || base });
    item.t = Model.T0();
    return { item, partCount: 1, groupCount: 0, suggestedName: displayName || base };
  }
  async function renderStepThumb(item, w = 160, hgt = 120) {
    if (!item || typeof Kernel === 'undefined' || !Kernel.call) return { thumb: null, dims: null, error: null };
    await hydrateEntryBlobs([{ item }]);
    const tmpDoc = { ...Model.newDoc(), items: [deepClone(item)] };
    const scene = Model.kernelScene(tmpDoc);
    let res;
    try {
      res = await Kernel.call('evaluate', { scene, known: {}, opts: { aux: true } });
    } catch (e) {
      return { thumb: null, dims: null, error: (e && e.message) || String(e || '') };
    }
    const meshNodes = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const addBox = (b) => {
      if (!Array.isArray(b) || b.length < 6) return;
      if (b[0] < minX) minX = b[0]; if (b[1] < minY) minY = b[1]; if (b[2] < minZ) minZ = b[2];
      if (b[3] > maxX) maxX = b[3]; if (b[4] > maxY) maxY = b[4]; if (b[5] > maxZ) maxZ = b[5];
    };
    for (const nd of (res && res.nodes) || []) {
      if (!nd || nd.empty || !nd.vertices || !nd.triangles || nd.triangles.length < 3) continue;
      const found = Model.find(tmpDoc, nd.id);
      const col = (found && found.item && found.item.color) || item.color || '#2f9e91';
      meshNodes.push({ data: nd, color: col });
      const bx = nd.ownBox || nd.baseBox;
      if (bx) addBox(bx);
      else {
        const v = nd.vertices;
        for (let k = 0; k + 2 < v.length; k += 3) {
          if (v[k] < minX) minX = v[k]; if (v[k + 1] < minY) minY = v[k + 1]; if (v[k + 2] < minZ) minZ = v[k + 2];
          if (v[k] > maxX) maxX = v[k]; if (v[k + 1] > maxY) maxY = v[k + 1]; if (v[k + 2] > maxZ) maxZ = v[k + 2];
        }
      }
    }
    const dims = Number.isFinite(minX) ? [round(maxX - minX, 2), round(maxY - minY, 2), round(maxZ - minZ, 2)] : null;
    const thumb = meshNodes.length && typeof Viewer !== 'undefined' && Viewer.renderMeshThumb
      ? Viewer.renderMeshThumb(meshNodes, w, hgt)
      : null;
    const err = res && Array.isArray(res.errors) && res.errors[0] ? res.errors[0].message : null;
    return { thumb, dims, error: err };
  }
  async function importStepFile(file, opts = {}) {
    if (!isStepFile(file)) {
      throw new Error(tr('userlib.errNotStep', null, 'Bitte wähle eine STEP-Datei (.step oder .stp).'));
    }
    if (typeof Store !== 'undefined' && Store.checkFileSize) {
      const sz = Store.checkFileSize(file, 'cad');
      if (!sz.ok) throw new Error(sz.message);
    }
    const bytes = opts.bytes || new Uint8Array(await file.arrayBuffer());
    const hdr = opts.header || parseStepHeader(bytes);
    if (!hdr.ok) {
      throw new Error(tr('userlib.errBadStep', { name: file.name }, `Die Datei „${file.name}“ ist keine gültige STEP-Datei.`));
    }
    const blobId = opts.blobId || (typeof Store !== 'undefined' && Store.putBlob ? await Store.putBlob(bytes) : null);
    const built = opts.built || buildStepItem(bytes, file.name, blobId, opts.name);
    const name = String(opts.name || built.suggestedName || file.name.replace(/\.(step|stp)$/i, '') || 'STEP-Teil').trim() || 'STEP-Teil';
    const category = String(opts.category || '').trim();
    const manufacturer = String(opts.manufacturer !== undefined ? opts.manufacturer : (hdr.manufacturer || '')).trim();
    const desc = String(opts.desc !== undefined ? opts.desc : (hdr.description || '')).trim();

    built.item.name = name;
    if (manufacturer || desc) {
      built.item.props = { ...(built.item.props || {}) };
      if (manufacturer) built.item.props.supplier = manufacturer;
      if (desc) built.item.props.desc = desc;
    }

    let thumb = opts.thumb;
    let dims = opts.dims || null;
    if (thumb === undefined) {
      const trRes = await renderStepThumb(built.item).catch(() => ({ thumb: null, dims: null }));
      thumb = trRes.thumb;
      if (!dims) dims = trRes.dims;
    }
    const entry = {
      id: uid('ul'),
      name,
      desc,
      category,
      manufacturer,
      source: 'step',
      stepFile: file.name,
      stepSize: bytes.byteLength,
      stepBlobId: blobId || null,
      dims,
      role: built.item.role || 'solid',
      thumb: thumb || null,
      created: Date.now(),
      params: [],
      tables: [],
      item: built.item,
    };
    const arr = readStorage().slice();
    arr.unshift(entry);
    writeStorage(arr);
    await lastSavePromise;
    if (typeof Store !== 'undefined' && Store.whenIdle) await Store.whenIdle();
    return deepClone(entry);
  }
  async function importStepDialog(filesOrFile, opts = {}) {
    const rawList = Array.isArray(filesOrFile) ? filesOrFile : (filesOrFile && typeof filesOrFile.length === 'number' && !(filesOrFile instanceof File) ? [...filesOrFile] : [filesOrFile]);
    const files = rawList.filter((f) => isStepFile(f));
    const skipped = rawList.filter((f) => f && f.name && !isStepFile(f));
    if (!files.length) {
      UI.toast(tr('userlib.errNotStep', null, 'Bitte wähle eine STEP-Datei (.step oder .stp).'), { kind: 'bad' });
      return null;
    }
    if (skipped.length) {
      UI.toast(tr('userlib.skippedNonStep', { count: skipped.length }, `${skipped.length} Datei(en) ohne .step/.stp übersprungen.`), { icon: 'info' });
    }
    const first = files[0];
    if (typeof Store !== 'undefined' && Store.checkFileSize) {
      const sz = Store.checkFileSize(first, 'cad');
      if (!sz.ok) { UI.toast(sz.message, { kind: 'bad', ms: 6000 }); return null; }
    }
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    const firstHdr = parseStepHeader(firstBytes);
    if (!firstHdr.ok) {
      UI.toast(tr('userlib.errBadStep', { name: first.name }, `Die Datei „${first.name}“ ist keine gültige STEP-Datei.`), { kind: 'bad', ms: 6000 });
      return null;
    }
    const firstBlobId = (typeof Store !== 'undefined' && Store.putBlob) ? await Store.putBlob(firstBytes) : null;
    const firstBuilt = buildStepItem(firstBytes, first.name, firstBlobId);

    const multi = files.length > 1;
    const defName = first.name.replace(/\.(step|stp)$/i, '').trim() || firstBuilt.suggestedName || 'STEP-Teil';
    const defCat = String(opts.category || '').trim();
    const defMfr = String(opts.manufacturer || firstHdr.manufacturer || '').trim();
    const defDesc = String(opts.desc || firstHdr.description || '').trim();
    const cats = suggestedCategories();

    const prevBox = h('div', { class: 'ul-save-preview' }, h('span', { class: 'ul-thumb-loading' }, tr('userlib.thumbLoading', null, 'Vorschau wird erstellt …')));
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'ul-step-name' }, multi ? tr('userlib.nameMultiLabel', { n: files.length }, `Name (für ${files.length} Dateien wird der Dateiname genutzt)`) : tr('userlib.nameLabel', null, 'Name in meiner Bibliothek')),
      h('div', { class: 'inp' }, h('input', { id: 'ul-step-name', type: 'text', value: multi ? '' : defName, placeholder: multi ? tr('userlib.nameMultiPlaceholder', null, 'Dateiname je STEP-Datei') : '', disabled: multi, autocomplete: 'off', spellcheck: 'false' })));
    const catListId = 'ul-step-cat-list';
    const catInp = h('input', { id: 'ul-step-cat', type: 'text', value: defCat, list: catListId, placeholder: tr('userlib.catPlaceholder', null, 'z. B. Motoren'), autocomplete: 'off' });
    const catList = h('datalist', { id: catListId }, ...cats.map((c) => h('option', { value: c })));
    const catF = h('div', { class: 'field' },
      h('label', { for: 'ul-step-cat' }, tr('userlib.catLabel', null, 'Kategorie')),
      h('div', { class: 'inp' }, catInp), catList);
    appendCategoryChips(catF, catInp, cats);
    const mfrF = h('div', { class: 'field' },
      h('label', { for: 'ul-step-mfr' }, tr('userlib.mfrLabel', null, 'Hersteller')),
      h('div', { class: 'inp' }, h('input', { id: 'ul-step-mfr', type: 'text', value: defMfr, placeholder: tr('userlib.mfrPlaceholder', null, 'z. B. Bosch, T-Motor …'), autocomplete: 'off' })));
    const descF = h('div', { class: 'field' },
      h('label', { for: 'ul-step-desc' }, 'Beschreibung (optional)'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-step-desc', type: 'text', value: defDesc, placeholder: tr('userlib.descPlaceholder', null, 'z. B. Katalog-Nr. oder Baugröße'), autocomplete: 'off' })));

    const sizeTxt = typeof Store !== 'undefined' && Store.formatBytes ? Store.formatBytes(firstBytes.byteLength) : `${Math.round(firstBytes.byteLength / 1024)} KB`;
    const partsTxt = firstBuilt.partCount > 1 ? ` · ${firstBuilt.partCount} Teile` : '';
    const baseMeta = multi
      ? tr('userlib.multiMeta', { n: files.length, first: first.name }, `${files.length} STEP-Dateien ausgewählt (z. B. ${first.name})`)
      : `${first.name} (${sizeTxt}${partsTxt})`;
    const metaEl = h('div', { class: 'ul-step-info', id: 'ul-step-meta' }, baseMeta);

    const head = h('div', { class: 'ul-save-head' }, prevBox, h('div', { style: { display: 'grid', gap: '8px', minWidth: 0 } }, nameF, mfrF));
    const body = h('div', { id: 'userlib-step-dialog', 'data-help': 'stepCatalog' }, head, catF, descF, metaEl);

    let thumbResult = { thumb: null, dims: null, error: null };
    let modalClosed = false;
    const thumbPromise = renderStepThumb(firstBuilt.item).then((res) => {
      thumbResult = res || { thumb: null, dims: null, error: null };
      if (!modalClosed && body.isConnected) {
        if (thumbResult.thumb) prevBox.innerHTML = thumbHTML({ thumb: thumbResult.thumb, role: firstBuilt.item.role });
        else prevBox.innerHTML = thumbHTML({ thumb: null, role: firstBuilt.item.role });
        if (thumbResult.dims && !multi) {
          const [dx, dy, dz] = thumbResult.dims;
          metaEl.textContent = `${baseMeta} · ${fmt(dx, 1)} × ${fmt(dy, 1)} × ${fmt(dz, 1)} mm`;
        }
      }
      return thumbResult;
    }).catch(() => ({ thumb: null, dims: null, error: null }));

    let modalRef = null;
    let saving = false;
    const doSave = async () => {
      if (saving) return false;
      const nInp = $('#ul-step-name', body);
      const nm = multi ? '' : ((nInp && nInp.value) || '').trim();
      if (!multi && !nm) {
        UI.toast('Gib dem Teil bitte einen Namen.', { kind: 'bad' });
        nInp && nInp.focus();
        return false;
      }
      const cat = (($('#ul-step-cat', body) || {}).value || '').trim();
      const mfr = (($('#ul-step-mfr', body) || {}).value || '').trim();
      const desc = (($('#ul-step-desc', body) || {}).value || '').trim();
      saving = true;
      const okBtn = $('#ul-step-ok');
      if (okBtn) { okBtn.disabled = true; okBtn.textContent = tr('userlib.saving', null, 'Wird gespeichert …'); }
      try {
        await thumbPromise;
        const saved = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (i === 0) {
            saved.push(await importStepFile(f, {
              name: nm || defName,
              category: cat,
              manufacturer: mfr,
              desc,
              bytes: firstBytes,
              header: firstHdr,
              blobId: firstBlobId,
              built: firstBuilt,
              thumb: thumbResult.thumb,
              dims: thumbResult.dims,
            }));
          } else {
            saved.push(await importStepFile(f, { category: cat, manufacturer: mfr, desc }));
          }
        }
        UI.toast(
          saved.length === 1
            ? tr('userlib.savedOne', { name: saved[0].name }, `„${saved[0].name}“ in der Bibliothek gespeichert.`)
            : tr('userlib.savedMany', { n: saved.length }, `${saved.length} STEP-Teile in der Bibliothek gespeichert.`),
          { icon: 'check' }
        );
        modalClosed = true;
        if (modalRef) modalRef.close(true);
        return saved;
      } catch (e) {
        UI.toast((e && e.message) || 'Konnte STEP-Datei nicht speichern.', { kind: 'bad', ms: 6000 });
        if (okBtn) { okBtn.disabled = false; okBtn.textContent = tr('userlib.saveBtn', null, 'In Bibliothek speichern'); }
        saving = false;
        return false;
      }
    };

    modalRef = UI.modal({
      title: multi ? tr('userlib.stepTitleMulti', { n: files.length }, `${files.length} STEP-Teile einsortieren`) : tr('userlib.stepTitle', null, 'STEP-Teil in Bibliothek einsortieren'),
      body,
      actions: [
        { label: 'Abbrechen', value: false, run: () => { modalClosed = true; } },
        { label: tr('userlib.saveBtn', null, 'In Bibliothek speichern'), id: 'ul-step-ok', primary: true, value: true, run: () => { doSave(); return false; } },
      ],
    });
    const focusEl = multi ? catInp : $('#ul-step-name', body);
    if (focusEl) {
      focusEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
      setTimeout(() => { focusEl.focus(); if (focusEl.select) focusEl.select(); }, 30);
    }
    return modalRef;
  }
  function editDialog(id) {
    const entry = get(id);
    if (!entry) return null;
    const cats = suggestedCategories();
    const prevBox = h('div', { class: 'ul-save-preview', html: thumbHTML(entry) });
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'ul-edit-name' }, 'Name'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-edit-name', type: 'text', value: entry.name || '', autocomplete: 'off', spellcheck: 'false' })));
    const catListId = 'ul-edit-cat-list';
    const catInp = h('input', { id: 'ul-edit-cat', type: 'text', value: entry.category || '', list: catListId, placeholder: tr('userlib.catPlaceholder', null, 'z. B. Motoren'), autocomplete: 'off' });
    const catList = h('datalist', { id: catListId }, ...cats.map((c) => h('option', { value: c })));
    const catF = h('div', { class: 'field' },
      h('label', { for: 'ul-edit-cat' }, tr('userlib.catLabel', null, 'Kategorie')),
      h('div', { class: 'inp' }, catInp), catList);
    appendCategoryChips(catF, catInp, cats);
    const mfrF = h('div', { class: 'field' },
      h('label', { for: 'ul-edit-mfr' }, tr('userlib.mfrLabel', null, 'Hersteller')),
      h('div', { class: 'inp' }, h('input', { id: 'ul-edit-mfr', type: 'text', value: entry.manufacturer || '', placeholder: tr('userlib.mfrPlaceholder', null, 'z. B. Bosch, T-Motor …'), autocomplete: 'off' })));
    const descF = h('div', { class: 'field' },
      h('label', { for: 'ul-edit-desc' }, 'Beschreibung (optional)'),
      h('div', { class: 'inp' }, h('input', { id: 'ul-edit-desc', type: 'text', value: entry.desc || '', autocomplete: 'off' })));

    const head = h('div', { class: 'ul-save-head' }, prevBox, h('div', { style: { display: 'grid', gap: '8px', minWidth: 0 } }, nameF, mfrF));
    const body = h('div', { id: 'userlib-edit-dialog', 'data-help': entry.source === 'step' ? 'stepCatalog' : 'userLibrary' }, head, catF, descF);
    let modalRef = null;
    const doSave = () => {
      const nInp = $('#ul-edit-name', body);
      const nm = (nInp && nInp.value || '').trim();
      if (!nm) { UI.toast('Gib dem Teil bitte einen Namen.', { kind: 'bad' }); nInp && nInp.focus(); return false; }
      update(entry.id, {
        name: nm,
        category: ($('#ul-edit-cat', body) || {}).value || '',
        manufacturer: ($('#ul-edit-mfr', body) || {}).value || '',
        desc: ($('#ul-edit-desc', body) || {}).value || '',
      });
      UI.toast(tr('userlib.updated', { name: nm }, `„${nm}“ aktualisiert.`), { icon: 'check' });
      return true;
    };
    modalRef = UI.modal({
      title: tr('userlib.editTitle', null, 'Bibliotheksteil bearbeiten'),
      body,
      actions: [
        { label: 'Abbrechen', value: false },
        { label: 'Speichern', id: 'ul-edit-ok', primary: true, value: true, run: () => doSave() },
      ],
    });
    const nInp = $('#ul-edit-name', body);
    if (nInp) {
      nInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (doSave() !== false) modalRef.close(true); } });
      setTimeout(() => { nInp.focus(); nInp.select(); }, 30);
    }
    return modalRef;
  }
  function pickStepFile(opts = {}) {
    const inp = h('input', { type: 'file', accept: '.step,.stp', multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const files = inp.files ? [...inp.files] : [];
      inp.remove();
      if (files.length) importStepDialog(files, opts);
    });
    document.body.append(inp);
    inp.click();
  }

  return {
    STORAGE_KEY,
    DEFAULT_CATEGORIES,
    get ready() { return ready; },
    init,
    whenReady,
    list,
    categories,
    suggestedCategories,
    get,
    canSave,
    detectParams,
    saveItem,
    saveDialog,
    insert,
    previewItem,
    remove,
    rename,
    update,
    editDialog,
    clear,
    isStepFile,
    parseStepHeader,
    renderStepThumb,
    importStepFile,
    importStepDialog,
    pickStepFile,
    thumbHTML,
    on: ev.on,
  };
})();
