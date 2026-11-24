// ================= App-Zustand, Verlauf (Rückgängig), Neuberechnung =================
const App = (() => {
  const DEFAULT_HIST_LIMIT = 32 * 1024 * 1024;
  let maxHistoryBytes = DEFAULT_HIST_LIMIT;

  const Patch = (() => {
    const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    function normPrim(v) {
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return null;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return null;
        if (Object.is(v, -0)) return 0;
      }
      return v;
    }
    function jsonClone(v) {
      if (Array.isArray(v)) return v.map(jsonClone);
      if (isPlainObj(v)) {
        const out = {};
        for (const k of Object.keys(v)) {
          const val = v[k];
          if (val === undefined || typeof val === 'function' || typeof val === 'symbol') continue;
          out[k] = jsonClone(val);
        }
        return out;
      }
      return normPrim(v);
    }
    function sameVal(a, b) {
      if (a === b) return true;
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!sameVal(a[i], b[i])) return false;
        return true;
      }
      if (isPlainObj(a) && isPlainObj(b)) {
        const ka = Object.keys(a).filter((k) => a[k] !== undefined && typeof a[k] !== 'function' && typeof a[k] !== 'symbol');
        const kb = Object.keys(b).filter((k) => b[k] !== undefined && typeof b[k] !== 'function' && typeof b[k] !== 'symbol');
        if (ka.length !== kb.length) return false;
        for (let i = 0; i < ka.length; i++) {
          if (ka[i] !== kb[i] || !sameVal(a[ka[i]], b[kb[i]])) return false;
        }
        return true;
      }
      if (isPlainObj(a) || isPlainObj(b)) return false;
      return normPrim(a) === normPrim(b);
    }
    function isIdArray(arr) {
      if (!Array.isArray(arr)) return false;
      if (!arr.length) return true;
      const seen = new Set();
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i];
        if (!isPlainObj(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) return false;
        seen.add(x.id);
      }
      return true;
    }
    function diff(a, b, path = [], ops = []) {
      if (a === b) return ops;
      if (Array.isArray(a) && Array.isArray(b)) {
        if (!a.length && !b.length) return ops;
        if (isIdArray(a) && isIdArray(b)) {
          const mapA = new Map();
          const mapB = new Map();
          for (let i = 0; i < a.length; i++) mapA.set(a[i].id, i);
          for (let j = 0; j < b.length; j++) mapB.set(b[j].id, j);
          const cur = a.slice();
          // 1. Gelöschte Einträge von hinten nach vorn als zusammenhängende Blöcke entfernen
          for (let i = a.length - 1; i >= 0; i--) {
            if (!mapB.has(a[i].id)) {
              let start = i;
              while (start > 0 && !mapB.has(a[start - 1].id)) start--;
              const deleted = cur.slice(start, i + 1).map(jsonClone);
              ops.push({ op: 'sp', p: path, i: start, d: deleted, a: [] });
              cur.splice(start, i - start + 1);
              i = start;
            }
          }
          // 2. Verschobene Einträge in Zielreihenfolge bringen
          const targetIds = b.filter((x) => mapA.has(x.id)).map((x) => x.id);
          for (let k = 0; k < cur.length; k++) {
            if (cur[k].id !== targetIds[k]) {
              const from = cur.findIndex((x) => x.id === targetIds[k]);
              ops.push({ op: 'mv', p: path, f: from, t: k });
              const [moved] = cur.splice(from, 1);
              cur.splice(k, 0, moved);
            }
          }
          // 3. Neue Einträge von vorn nach hinten als zusammenhängende Blöcke einfügen
          for (let j = 0; j < b.length; j++) {
            if (!mapA.has(b[j].id)) {
              let end = j;
              while (end + 1 < b.length && !mapA.has(b[end + 1].id)) end++;
              const slice = b.slice(j, end + 1);
              ops.push({ op: 'sp', p: path, i: j, d: [], a: slice.map(jsonClone) });
              cur.splice(j, 0, ...slice);
              j = end;
            }
          }
          // 4. Bestehende Einträge tief vergleichen
          for (let j = 0; j < b.length; j++) {
            if (mapA.has(b[j].id)) diff(cur[j], b[j], path.concat(j), ops);
          }
          return ops;
        }
        if (a.length === b.length) {
          for (let i = 0; i < a.length; i++) diff(a[i], b[i], path.concat(i), ops);
          return ops;
        }
        let pre = 0;
        const minLen = Math.min(a.length, b.length);
        while (pre < minLen && sameVal(a[pre], b[pre])) pre++;
        let suf = 0;
        while (suf < minLen - pre && sameVal(a[a.length - 1 - suf], b[b.length - 1 - suf])) suf++;
        if (pre + suf < a.length || pre + suf < b.length) {
          ops.push({
            op: 'sp',
            p: path,
            i: pre,
            d: a.slice(pre, a.length - suf).map(jsonClone),
            a: b.slice(pre, b.length - suf).map(jsonClone),
          });
        }
        return ops;
      }
      if (isPlainObj(a) && isPlainObj(b)) {
        const aKeys = Object.keys(a).filter((k) => a[k] !== undefined && typeof a[k] !== 'function' && typeof a[k] !== 'symbol');
        for (let idx = 0; idx < aKeys.length; idx++) {
          const k = aKeys[idx];
          const bv = b[k];
          if (!(k in b) || bv === undefined || typeof bv === 'function' || typeof bv === 'symbol') {
            const entry = { op: 'del', p: path.concat(k), o: jsonClone(a[k]) };
            if (idx < aKeys.length - 1) entry.bk = aKeys[idx + 1];
            ops.push(entry);
          } else {
            diff(a[k], bv, path.concat(k), ops);
          }
        }
        const bKeys = Object.keys(b).filter((k) => b[k] !== undefined && typeof b[k] !== 'function' && typeof b[k] !== 'symbol');
        for (let idx = bKeys.length - 1; idx >= 0; idx--) {
          const k = bKeys[idx];
          const av = a[k];
          if (!(k in a) || av === undefined || typeof av === 'function' || typeof av === 'symbol') {
            const entry = { op: 'add', p: path.concat(k), n: jsonClone(b[k]) };
            if (idx < bKeys.length - 1) entry.bk = bKeys[idx + 1];
            ops.push(entry);
          }
        }
        return ops;
      }
      const na = normPrim(a);
      const nb = normPrim(b);
      if (na === nb) return ops;
      ops.push({ op: 'set', p: path, o: jsonClone(a), n: jsonClone(b) });
      return ops;
    }
    function getParent(root, path) {
      let cur = root;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      return cur;
    }
    function setKeyBefore(obj, key, val, beforeKey) {
      if (!beforeKey || !(beforeKey in obj) || key in obj) {
        obj[key] = val;
        return;
      }
      const entries = Object.entries(obj);
      for (const [k] of entries) delete obj[k];
      for (const [k, v] of entries) {
        if (k === beforeKey) obj[key] = val;
        obj[k] = v;
      }
    }
    function applyForward(root, ops) {
      for (let k = 0; k < ops.length; k++) {
        const op = ops[k];
        if (op.op === 'set') {
          if (!op.p.length) root = jsonClone(op.n);
          else getParent(root, op.p)[op.p[op.p.length - 1]] = jsonClone(op.n);
        } else if (op.op === 'add') {
          setKeyBefore(getParent(root, op.p), op.p[op.p.length - 1], jsonClone(op.n), op.bk);
        } else if (op.op === 'del') {
          delete getParent(root, op.p)[op.p[op.p.length - 1]];
        } else if (op.op === 'sp') {
          const arr = op.p.length ? getParent(root, op.p)[op.p[op.p.length - 1]] : root;
          arr.splice(op.i, op.d.length, ...op.a.map(jsonClone));
        } else if (op.op === 'mv') {
          const arr = op.p.length ? getParent(root, op.p)[op.p[op.p.length - 1]] : root;
          const [x] = arr.splice(op.f, 1);
          arr.splice(op.t, 0, x);
        }
      }
      return root;
    }
    function applyBackward(root, ops) {
      for (let k = ops.length - 1; k >= 0; k--) {
        const op = ops[k];
        if (op.op === 'set') {
          if (!op.p.length) root = jsonClone(op.o);
          else getParent(root, op.p)[op.p[op.p.length - 1]] = jsonClone(op.o);
        } else if (op.op === 'add') {
          delete getParent(root, op.p)[op.p[op.p.length - 1]];
        } else if (op.op === 'del') {
          setKeyBefore(getParent(root, op.p), op.p[op.p.length - 1], jsonClone(op.o), op.bk);
        } else if (op.op === 'sp') {
          const arr = op.p.length ? getParent(root, op.p)[op.p[op.p.length - 1]] : root;
          arr.splice(op.i, op.a.length, ...op.d.map(jsonClone));
        } else if (op.op === 'mv') {
          const arr = op.p.length ? getParent(root, op.p)[op.p[op.p.length - 1]] : root;
          const [x] = arr.splice(op.t, 1);
          arr.splice(op.f, 0, x);
        }
      }
      return root;
    }
    function estimateBytes(ops, label) {
      return JSON.stringify(ops).length * 2 + (label ? String(label).length * 2 : 0) + 128;
    }
    return { normPrim, jsonClone, sameVal, diff, applyForward, applyBackward, estimateBytes };
  })();

  const S = {
    doc: Model.newDoc(), sel: [], face: null, edges: [], mode: 'model', tool: null,
    results: new Map(), resolved: new Map(), baseBoxes: new Map(), ownBoxes: new Map(), errors: [], undo: [], redo: [], undoBytes: 0, redoBytes: 0, extra: [], hideIds: new Set(), revision: 0, cleanRev: 0, lastSavedRev: -1, fileSavedRev: -1,
    ctx: null, iso: null,   // gerade bearbeitetes Bauteil / isoliertes Teil (nur Ansicht, nicht gespeichert)
  };
  const ev = makeEmitter();
  let dirty = false, busy = false, busyTimer = null;

  // ---------- Dokument ----------
  function setDoc(doc, opts = {}) {
    // noch ausstehendes Speichern des bisherigen Projekts zuerst erledigen
    if (S.doc && !(opts && opts.fromBoot)) { try { autosave.flush(); } catch (_) {} }
    S.doc = Model.migrate(doc);
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    if (typeof Store !== 'undefined') {
      Store.extractBlobs(S.doc);
      if (S.doc.id) Store.loadVersions(S.doc.id).catch(() => {});
    }
    Model.useVars(Model.vars(S.doc).v);
    S.sel = []; S.face = null; S.edges = []; S.undo = []; S.redo = []; S.undoBytes = 0; S.redoBytes = 0; S.extra = []; S.ctx = null; S.iso = null;
    for (const id of [...S.results.keys()]) Viewer.removeNode(id);
    S.results.clear(); S.resolved.clear(); S.baseBoxes.clear(); S.ownBoxes.clear(); S.errors = []; S.revision++;
    S.cleanRev = S.revision;
    if (opts && opts.saved) S.fileSavedRev = S.revision;
    Viewer.clearGhosts(); Views.reset(); Versions.compareOff();
    ev.emit('doc'); ev.emit('docLoaded', { doc: S.doc, opts }); ev.emit('selection'); ev.emit('history');
    if (!(opts && opts.noAutosave)) autosave();
    rebuild().then(() => { if (opts.fit !== false) Viewer.fit(null, false); });
  }
  function snapshot() { return JSON.stringify(S.doc); }
  function cloneDoc(doc = S.doc) { return Patch.jsonClone(doc); }
  function makeStep(label, ops, extra) {
    const step = { label, ops, bytes: Patch.estimateBytes(ops, label), t: Date.now() };
    if (extra && extra.merge) step.merge = extra.merge;
    return step;
  }
  function trimHistory() {
    while (S.undo.length > 1 && S.undoBytes + S.redoBytes > maxHistoryBytes) {
      const drop = S.undo.shift();
      S.undoBytes = Math.max(0, S.undoBytes - drop.bytes);
    }
    while (S.redo.length > 0 && S.undoBytes + S.redoBytes > maxHistoryBytes) {
      const drop = S.redo.shift();
      S.redoBytes = Math.max(0, S.redoBytes - drop.bytes);
    }
  }
  function syncTopModified(oldMod, newMod) {
    const top = S.undo[S.undo.length - 1];
    if (!top || oldMod === newMod) return;
    const idx = top.ops.findIndex((op) => (op.op === 'set' || op.op === 'add') && op.p.length === 1 && op.p[0] === 'modified');
    S.undoBytes -= top.bytes;
    if (idx >= 0) {
      top.ops[idx].n = newMod;
    } else {
      top.ops.push({ op: 'set', p: ['modified'], o: Patch.normPrim(oldMod), n: newMod });
    }
    top.bytes = Patch.estimateBytes(top.ops, top.label);
    S.undoBytes += top.bytes;
    trimHistory();
  }
  function pushUndo(label, before) {
    const beforeObj = typeof before === 'string' ? JSON.parse(before) : Patch.jsonClone(before);
    const step = makeStep(label, Patch.diff(beforeObj, S.doc));
    S.undo.push(step);
    S.undoBytes += step.bytes;
    S.redo = [];
    S.redoBytes = 0;
    trimHistory();
    ev.emit('history');
    ev.emit('log', { kind: 'change', text: label, depth: S.undo.length });
  }
  // Änderung mit Rückgängig-Schritt. merge: gleiche Schlüssel kurz hintereinander werden zu einem Schritt.
  function change(label, fn, opts = {}) {
    const beforeObj = opts.before ? (typeof opts.before === 'string' ? JSON.parse(opts.before) : Patch.jsonClone(opts.before)) : cloneDoc(S.doc);
    const topBefore = new Set(S.doc.items.map((x) => x.id));
    const res = fn(S.doc);
    if (res === false) return false;
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    placeNewAtMarker(S.doc, topBefore);
    Model.syncLinks(S.doc);
    Model.cleanFolders(S.doc);
    S.doc.modified = Date.now();
    const last = S.undo[S.undo.length - 1];
    if (opts.amend) {
      // gehört zum letzten Schritt (z. B. nachgeführte Kanten): kein eigener Rückgängig-Schritt
      if (S.redo.length) {
        const topRedo = S.redo[S.redo.length - 1];
        const nextDoc = Patch.applyForward(cloneDoc(beforeObj), topRedo.ops);
        S.redoBytes -= topRedo.bytes;
        topRedo.ops = Patch.diff(S.doc, nextDoc);
        topRedo.bytes = Patch.estimateBytes(topRedo.ops, topRedo.label);
        S.redoBytes += topRedo.bytes;
      }
      if (last) {
        const baseDoc = Patch.applyBackward(cloneDoc(beforeObj), last.ops);
        S.undoBytes -= last.bytes;
        last.ops = Patch.diff(baseDoc, S.doc);
        last.bytes = Patch.estimateBytes(last.ops, last.label);
        S.undoBytes += last.bytes;
      }
      trimHistory();
    } else if (opts.merge && last && last.merge === opts.merge && Date.now() - last.t < 1500) {
      const baseDoc = Patch.applyBackward(beforeObj, last.ops);
      S.undoBytes -= last.bytes;
      last.ops = Patch.diff(baseDoc, S.doc);
      last.bytes = Patch.estimateBytes(last.ops, last.label);
      last.t = Date.now();
      S.undoBytes += last.bytes;
      S.redo = [];
      S.redoBytes = 0;
      trimHistory();
    } else {
      const step = makeStep(label, Patch.diff(beforeObj, S.doc), opts);
      S.undo.push(step);
      S.undoBytes += step.bytes;
      S.redo = [];
      S.redoBytes = 0;
      trimHistory();
      ev.emit('history');
      ev.emit('log', { kind: 'change', text: label, depth: S.undo.length });
    }
    touched(false, true);
    return res;
  }
  // Ist die Zeitleiste zurückgerollt, landen neue Schritte am Marker statt am Ende
  function placeNewAtMarker(doc, topBefore) {
    // Bauteil wird bearbeitet: neue Teile wandern hinein (an dessen Marker)
    const comp = S.ctx ? doc.items.find((x) => x.id === S.ctx) : null;
    if (comp) {
      const fresh = doc.items.filter((x) => !topBefore.has(x.id) && x !== comp);
      if (!fresh.length) return;
      const inv = Model.worldMatrix(doc, comp.id).invert();
      for (const it of fresh) {
        const W = Model.worldMatrix(doc, it.id);
        doc.items.splice(doc.items.indexOf(it), 1);
        Model.setFromMatrix(it, inv.clone().multiply(W));
        const k = comp.children || (comp.children = []);
        const at = comp.rollback == null ? k.length : clamp(comp.rollback, 0, k.length);
        k.splice(at, 0, it); if (comp.rollback != null) comp.rollback++;
        if (comp.rollback != null && comp.rollback >= k.length) comp.rollback = null;
      }
      return;
    }
    if (doc.rollback == null) return;
    const fresh = doc.items.filter((x) => !topBefore.has(x.id));
    for (const it of fresh) {
      const i = doc.items.indexOf(it); if (i < doc.rollback) continue;
      doc.items.splice(i, 1); doc.items.splice(doc.rollback, 0, it); doc.rollback++;
    }
    if (doc.rollback >= doc.items.length) doc.rollback = null;
  }
  function touched(noRebuild, keepModified) {
    if (S.peek != null) { S.peek = null; ev.emit('peek'); }
    Model.useVars(Model.vars(S.doc).v);
    if (!keepModified) {
      const oldMod = S.doc.modified;
      const newMod = Date.now();
      S.doc.modified = newMod;
      if (S.undo.length && !S.redo.length && oldMod !== newMod) syncTopModified(oldMod, newMod);
    }
    S.revision++;
    ev.emit('doc');
    ev.emit('dirty', { doc: S.doc, revision: S.revision });
    autosave();
    if (!noRebuild) rebuild();
  }
  function restore(jsonOrDoc) {
    const doc = typeof jsonOrDoc === 'string' ? JSON.parse(jsonOrDoc) : jsonOrDoc;
    S.doc = doc;
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    Model.useVars(Model.vars(S.doc).v);
    const valid = new Set(); Model.walk(doc.items, (it) => valid.add(it.id));
    S.sel = S.sel.filter((id) => valid.has(id));
    if (S.face && !valid.has(S.face.id)) S.face = null;
    S.edges = S.edges.filter((e) => valid.has(e.id));
    S.revision++;
    ev.emit('doc'); ev.emit('dirty', { doc: S.doc, revision: S.revision }); ev.emit('selection'); autosave(); rebuild();
  }
  function markClean() {
    S.cleanRev = S.revision;
    S.fileSavedRev = S.revision;
    ev.emit('clean', { doc: S.doc, revision: S.revision });
  }
  function undo(silent) {
    const step = S.undo.pop(); if (!step) return;
    S.undoBytes = Math.max(0, S.undoBytes - step.bytes);
    const prevDoc = Patch.applyBackward(cloneDoc(S.doc), step.ops);
    S.redo.push(step);
    S.redoBytes += step.bytes;
    trimHistory();
    restore(prevDoc); ev.emit('history');
    if (!silent) { UI.toast(`Rückgängig: ${step.label}`, { icon: 'undo', ms: 1600 }); ev.emit('log', { kind: 'undo', text: step.label, depth: S.undo.length }); }
  }
  function redo(silent) {
    const step = S.redo.pop(); if (!step) return;
    S.redoBytes = Math.max(0, S.redoBytes - step.bytes);
    const nextDoc = Patch.applyForward(cloneDoc(S.doc), step.ops);
    step.t = 0;
    S.undo.push(step);
    S.undoBytes += step.bytes;
    trimHistory();
    restore(nextDoc); ev.emit('history');
    if (!silent) { UI.toast(`Wiederholt: ${step.label}`, { icon: 'redo', ms: 1600 }); ev.emit('log', { kind: 'redo', text: step.label, depth: S.undo.length }); }
  }
  // mehrere Rückgängig-Schritte ab depth zu einem zusammenfassen (z. B. ein ganzer Auftrag des KI-Kollegen)
  function squash(depth, label) {
    depth = clamp(depth, 0, S.undo.length);
    const n = S.undo.length - depth; if (n <= 0) return null;
    const first = S.undo[depth];
    let baseDoc = cloneDoc(S.doc);
    let droppedBytes = 0;
    for (let i = S.undo.length - 1; i >= depth; i--) {
      baseDoc = Patch.applyBackward(baseDoc, S.undo[i].ops);
      droppedBytes += S.undo[i].bytes;
    }
    const step = makeStep(label || first.label, Patch.diff(baseDoc, S.doc));
    S.undo.splice(depth, n, step);
    S.undoBytes = Math.max(0, S.undoBytes - droppedBytes) + step.bytes;
    trimHistory();
    ev.emit('history');
    if (n > 1) ev.emit('log', { kind: 'info', text: `${step.label} – ${n} Schritte zu einem zusammengefasst` });
    return step;
  }
  // mehrere Schritte auf einmal zurück, z. B. aus dem Protokoll
  function undoTo(depth) {
    depth = Math.max(0, depth | 0);
    let n = 0;
    let doc = cloneDoc(S.doc);
    while (S.undo.length > depth && S.undo.length) {
      const step = S.undo.pop();
      S.undoBytes = Math.max(0, S.undoBytes - step.bytes);
      doc = Patch.applyBackward(doc, step.ops);
      S.redo.push(step);
      S.redoBytes += step.bytes;
      n++;
    }
    if (!n) return;
    trimHistory();
    restore(doc); ev.emit('history');
    UI.toast(n === 1 ? '1 Schritt rückgängig gemacht' : n + ' Schritte rückgängig gemacht', { icon: 'undo', ms: 1800 });
    ev.emit('log', { kind: 'undo', text: `${n} ${n === 1 ? 'Schritt' : 'Schritte'} zurück`, depth: S.undo.length });
  }
  function historyStats() {
    return {
      undoCount: S.undo.length,
      redoCount: S.redo.length,
      undoBytes: S.undoBytes,
      redoBytes: S.redoBytes,
      totalBytes: S.undoBytes + S.redoBytes,
      limitBytes: maxHistoryBytes,
    };
  }
  function setHistoryLimit(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return maxHistoryBytes;
    maxHistoryBytes = Math.max(1024, Math.round(bytes));
    trimHistory();
    ev.emit('history');
    return maxHistoryBytes;
  }

  // ---------- Speichern im Browser ----------
  function saveNow() {
    const d = S.doc;
    if (!d) return Promise.resolve(false);
    const count = Model.countItems(d);
    if (!count && !d.params.length && !Store.hasProject(d.id)) return Promise.resolve(false);
    const rev = S.revision;
    return Store.saveProject(d, count).then((ok) => {
      if (ok && S.doc && S.doc.id === d.id && S.lastSavedRev < rev) S.lastSavedRev = rev;
      return ok;
    });
  }
  const autosave = (() => {
    let t = null;
    const f = () => { clearTimeout(t); t = setTimeout(() => { t = null; saveNow(); }, 700); };
    f.flush = () => { clearTimeout(t); t = null; return saveNow(); };
    f.cancel = () => { clearTimeout(t); t = null; };
    return f;
  })();
  const recentProjects = () => Store.recentProjects();
  const loadStored = (id) => Store.loadProject(id);
  const deleteStored = (id) => Store.deleteProject(id, S.doc && S.doc.id !== id ? S.doc : null);

  // ---------- Neuberechnung ----------
  // Zeitleiste: Stand nach Schritt k nur anzeigen (null = wieder alles); ändert das Projekt nicht
  function peek(k) {
    k = k == null ? null : Math.max(0, Math.round(k));
    const n = S.doc.items.length, mk = S.doc.rollback == null ? n : S.doc.rollback;
    if (k != null && k >= mk) k = null;
    if (k === (S.peek == null ? null : S.peek)) return;
    S.peek = k; ev.emit('peek'); rebuild();
  }
  function needsKernelFor(doc, extra, peek) {
    if (Array.isArray(extra) && extra.length) return true;
    let act = Model.activeItems(doc);
    if (peek != null) { const keep = new Set(doc.items.slice(0, Math.max(0, peek))); act = act.filter((it) => keep.has(it)); }
    return act.length > 0;
  }
  function rebuild() {
    dirty = true;
    if (!busy) return runRebuild();
    return new Promise((res) => { const off = ev.on('rebuilt', () => { if (!dirty) { off(); res(); } }); });
  }
  async function runRebuild() {
    busy = true;
    let calcEmitted = false;
    while (dirty) {
      dirty = false;
      if (!needsKernelFor(S.doc, S.extra, S.peek)) {
        apply({ nodes: [], errors: [], resolved: {}, times: {} });
        ev.emit('rebuilt');
        continue;
      }
      if (!calcEmitted) {
        calcEmitted = true;
        ev.emit('calc', true);
        clearTimeout(busyTimer); busyTimer = setTimeout(() => ev.emit('busy', true), 300);
      }
      if (typeof SK !== 'undefined' && SK.ensureDocFonts) {
        await SK.ensureDocFonts(S.doc, S.extra).catch((e) => console.warn(e));
      }
      if (!Kernel.ready) {
        try { await Kernel.ensure(); }
        catch (e) {
          console.error(e);
          UI.toast('Der CAD-Kern konnte nicht gestartet werden: ' + (e.message || e), { kind: 'bad', ms: 6000 });
          break;
        }
        if (!Kernel.ready) break;
      }
      if (typeof Store !== 'undefined') {
        const ids = Store.collectBlobIds(S.doc);
        if ([...ids].some((id) => !Store.getBlobSync(id))) await Store.hydrateDoc(S.doc);
      }
      const scene = Model.kernelScene(S.doc, S.extra, S.peek);
      scene.quality = ViewPrefs.get().quality || 'normal';
      const known = {}; if (!S.forceMesh) for (const [id, r] of S.results) known[id] = r.key;
      S.forceMesh = false;
      let res;
      try { res = await Kernel.call('evaluate', { scene, known }); }
      catch (e) { console.error(e); UI.toast('Beim Berechnen ist ein Fehler passiert: ' + e.message, { kind: 'bad' }); break; }
      apply(res);
      ev.emit('rebuilt');
    }
    busy = false; clearTimeout(busyTimer);
    if (calcEmitted) { ev.emit('busy', false); ev.emit('calc', false); }
    ev.emit('rebuilt');
  }
  // Aussehen am Werkstoff: eigener Werkstoff des Teils, sonst der ausdrücklich gewählte Projekt-Werkstoff
  function lookFor(it) {
    const mat = it.mat || (S.doc.settings && S.doc.settings.material) || null;
    const L = Viewer.lookOf(mat);
    return { ...L, mat, matCol: L.nat && !it.colorSet ? L.col : null };
  }
  function topItem(id) { return S.doc.items.find((x) => x.id === id) || S.extra.find((x) => x.id === id); }
  // Rechenzeit je Schritt: zuletzt gemessen, als er wirklich neu gerechnet wurde (BE-26)
  const times = new Map();
  function apply(res) {
    const seen = new Set();
    S.merged = new Map();
    S.resolved = new Map(Object.entries(res.resolved || {}));
    S.baseBoxes = new Map();
    S.ownBoxes = new Map();
    for (const [id, ms] of Object.entries(res.times || {})) times.set(id, { ms, at: Date.now() });
    for (const n of res.nodes) {
      seen.add(n.id);
      if (n.merged) S.merged.set(n.id, n.merged);
      if (n.baseBox) S.baseBoxes.set(n.id, n.baseBox);
      if (n.ownBox) S.ownBoxes.set(n.id, n.ownBox);
      const it = topItem(n.id); if (!it) continue;
      const info = { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, bodies: it.bodies || null, key: n.key };
      if (n.empty) { Viewer.removeNode(n.id); S.results.delete(n.id); continue; }
      if (n.same && S.results.has(n.id)) {
        if (n.bodies) { S.results.get(n.id).data.bodies = n.bodies; Viewer.updateNode(n.id, { ...info, forceBodies: true }); }
        else Viewer.updateNode(n.id, info);
        continue;
      }
      Viewer.setNode(n.id, n, info);
      S.results.set(n.id, { key: n.key, data: n });
    }
    for (const id of [...S.results.keys()]) if (!seen.has(id)) { Viewer.removeNode(id); S.results.delete(id); }
    const oldErr = new Set(S.errors.map((e) => e.itemId + '|' + e.code + '|' + e.message));
    S.errors = (res.errors || []).concat(dimErrors());
    for (const e of S.errors) if (!oldErr.has(e.itemId + '|' + e.code + '|' + e.message)) ev.emit('log', { kind: 'error', text: e.message, itemId: e.itemId, code: e.code });
    applyView();
    refreshSelectionVisuals();
    // „Durch alles“ braucht die Größe des Modells: ändert sie sich, noch einmal rechnen
    let thru = false; Model.walk(S.doc.items, (x) => { if (x.p && x.p.thru) thru = true; });
    if (thru) {
      let span = 0;
      for (const [id, r] of S.results) { const it = topItem(id); if (!it || it.role === 'hole' || (it.p && it.p.thru) || !r.data || !r.data.bbox) continue; const b = r.data.bbox, m = Model.localMatrix(it).elements; const c = Math.hypot(m[12], m[13], m[14]); span = Math.max(span, c + Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2])); }
      if (Model.setSceneSpan(span * 2 + 10)) dirty = true;
    }
    ev.emit('results');
    if (S.fitNext) { S.fitNext = false; Viewer.fit(); }
  }
  // Skizzen-Maße, die sich nicht ausrechnen lassen, wie Rechenfehler melden
  function dimErrors() {
    const out = []; const { v } = Model.vars(S.doc);
    Model.walk(Model.activeItems(S.doc), (it) => {
      const sk = it.p && it.p.sketch;
      if (it.suppressed || !sk || (!(sk.dims || []).length && !(sk.cons || []).length)) return;
      const r = Solver.cached(sk, v);
      if (r.badDims && r.badDims.length) out.push({ itemId: it.id, code: 'dim', message: `${ERRORS.sketchDimBad.titel}: „${Model.label(it)}“` });
      else if (!r.ok) out.push({ itemId: it.id, code: 'over', message: `${ERRORS.sketchOverConstrained.titel}: „${Model.label(it)}“` });
    });
    return out;
  }
  // Sichtbarkeit und Kontext-Darstellung aller Teile
  function applyView() {
    if (S.ctx && !S.doc.items.some((x) => x.id === S.ctx)) S.ctx = null;
    if (S.iso && !S.doc.items.some((x) => x.id === S.iso)) S.iso = null;
    for (const [id] of Viewer.nodes) {
      const it = topItem(id); if (!it) continue;
      Viewer.updateNode(id, { visible: !it.hidden && !S.hideIds.has(id) && (!S.iso || S.iso === id), ctxDim: !!S.ctx && S.ctx !== id });
    }
    refreshCtxPick();
  }
  // Klick-Flächen für die Teile des bearbeiteten Bauteils (damit man sie im Bild anklicken kann)
  const ctxPickReq = { n: 0, key: null };
  async function refreshCtxPick() {
    const id = S.ctx; const r = id ? S.results.get(id) : null;
    const it = id ? S.doc.items.find((x) => x.id === id) : null;
    if (!it || !r || !Kernel.ready) { ctxPickReq.key = null; Viewer.clearProxies(); return; }
    const kids = (it.rollback != null ? it.children.slice(0, it.rollback) : it.children).filter((c) => !c.suppressed && !c.hidden);
    const key = id + '|' + r.key + '|' + S.revision + '|' + kids.map((c) => c.id).join(',');
    if (ctxPickReq.key === key) return;
    ctxPickReq.key = key; const req = ++ctxPickReq.n;
    const { v } = Model.vars(S.doc);
    const items = kids.map((c) => { const ki = Model.kernelItem(c, v); ki.m = Model.matArr(Model.worldMatrix(S.doc, c.id)); ki.role = 'solid'; ki.hidden = false; return ki; });
    try {
      const res = await Kernel.call('evaluate', { scene: { items }, known: {} });
      if (req !== ctxPickReq.n) return;
      Viewer.setProxies(res.nodes.filter((n) => !n.empty).map((n) => ({ id: n.id, data: n, matrix: Model.worldMatrix(S.doc, n.id) })));
    } catch (_) { Viewer.clearProxies(); }
  }
  function setCtx(id) {
    const it = id ? S.doc.items.find((x) => x.id === id) : null;
    if (it && it.kind !== 'group') return;
    S.ctx = it ? it.id : null; applyView(); ev.emit('ctx'); ev.emit('doc');
    ev.emit('log', { kind: 'info', text: it ? `Bauteil bearbeiten: ${Model.label(it)}` : 'Bauteil-Bearbeitung beendet' });
  }
  function setIso(id) { S.iso = id || null; applyView(); ev.emit('ctx'); }
  // Darstellungsqualität geändert: alle Teile neu vernetzen lassen
  function requalify() { S.forceMesh = true; rebuild(); }
  // feineres Netz für ein Teil einsetzen (gleiche Form, gleicher Schlüssel)
  function replaceMesh(id, key, payload) {
    const it = topItem(id); const r = S.results.get(id);
    if (!it || !r || r.key !== key) return false;
    Viewer.setNode(id, payload, { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, bodies: it.bodies || null, key });
    r.data = payload; applyView(); refreshSelectionVisuals(); ev.emit('remeshed', id);
    return true;
  }
  // nach dem nächsten Berechnen die Ansicht einpassen (erstes Teil in einem leeren Projekt)
  function fitAfterBuild() { S.fitNext = true; }
  function errorsFor(id) { return S.errors.filter((e) => e.itemId === id); }

  // ---------- Auswahl ----------
  function select(ids, opts = {}) {
    // Teile, die die Explosion einzeln zeigt (Kennung „__ex:…“), stehen für das echte Teil in der Gruppe
    ids = (ids || []).filter(Boolean).map((id) => (typeof id === 'string' && id.startsWith('__ex:') ? id.slice(5) : id));
    if (opts.additive) {
      const set = new Set(S.sel);
      for (const id of ids) { if (set.has(id)) set.delete(id); else set.add(id); }
      S.sel = [...set];
    } else S.sel = ids;
    S.face = opts.face || null;
    S.edges = opts.edges || [];
    refreshSelectionVisuals();
    ev.emit('selection');
  }
  function clearSelection() { if (!S.sel.length && !S.face && !S.edges.length) return; select([]); }
  const ghostReq = { n: 0 };
  async function refreshSelectionVisuals() {
    const selTop = new Set();
    for (const id of S.sel) {
      const top = Model.topOf(S.doc, id);
      if (top) {
        selTop.add(top.id);
        if ((top.kind === 'transform' || top.kind === 'scale' || top.kind === 'thicken' || top.kind === 'rib' || top.kind === 'wrap' || top.kind === 'emboss' || top.kind === 'mirrorStep') && S.merged && S.merged.has(top.id)) selTop.add(S.merged.get(top.id));
      }
      selTop.add('__ex:' + id);
    }
    for (const [id] of Viewer.nodes) Viewer.updateNode(id, { selected: selTop.has(id) });
    Viewer.highlightFace('sel', S.face ? S.face.id : null, S.face ? S.face.faceIdx : null);
    Viewer.setSelectedEdges(S.edges);
    // Unterobjekte in Gruppen als Umriss zeigen
    const childIds = S.sel.filter((id) => !S.doc.items.find((x) => x.id === id));
    const req = ++ghostReq.n;
    Viewer.clearGhosts();
    if (childIds.length && Kernel.ready) {
      const { v } = Model.vars(S.doc);
      const items = childIds.map((id) => {
        const f = Model.find(S.doc, id); if (!f) return null;
        let pv = v;
        for (const anc of Model.parentsOf(S.doc, id)) if (anc.userPart) pv = Model.scopeVars(pv, anc.userPart);
        const ki = Model.kernelItem(f.item, pv);
        ki.m = Model.matArr(Model.worldMatrix(S.doc, id)); ki.role = 'solid'; ki.hidden = false;
        return ki;
      }).filter(Boolean);
      try {
        const res = await Kernel.call('evaluate', { scene: { items }, known: {} });
        if (req !== ghostReq.n) return;
        for (const n of res.nodes) if (!n.empty) { S.ghostData = S.ghostData || new Map(); S.ghostData.set(n.id, n); Viewer.setGhost(n.id, n, Model.worldMatrix(S.doc, n.id)); }
        ev.emit('ghosts');
      } catch (_) {}
    }
  }
  function selectedItems() { return S.sel.map((id) => Model.find(S.doc, id)).filter(Boolean); }
  function localBox(id) {
    const f = Model.find(S.doc, id); if (!f) return null;
    const v = Model.itemVars(S.doc, id);
    const pb = Model.primitiveBox(f.item.kind, Model.resolveP(f.item.p, v));
    if (pb) return pb;
    const r = S.results.get(id); if (r && r.data.bbox) return r.data.bbox;
    const g = S.ghostData && S.ghostData.get(id); if (g) return g.bbox;
    return null;
  }

  return {
    get doc() { return S.doc; }, get sel() { return S.sel; }, get face() { return S.face; }, get edges() { return S.edges; }, get results() { return S.results; }, get errors() { return S.errors; },
    get undoStack() { return S.undo; }, get redoStack() { return S.redo; }, get revision() { return S.revision; }, get busy() { return busy; },
    get mode() { return S.mode; }, set mode(m) { S.mode = m; ev.emit('mode'); },
    get extra() { return S.extra; }, set extra(x) { S.extra = x; },
    peek, get peeking() { return S.peek == null ? null : S.peek; },
    timeOf(id) { return times.get(id) || null; },
    get times() { return times; },
    mergedInto(id) { return (S.merged && S.merged.get(id)) || null; },
    baseBox(id) { return (S.baseBoxes && S.baseBoxes.get(id)) || null; },
    ownBox(id) { return (S.ownBoxes && S.ownBoxes.get(id)) || null; },
    resolvedOf(id) { return (S.resolved && S.resolved.get(id)) || null; },
    resolvedDist(id) { const r = S.resolved && S.resolved.get(id); return r && isFinite(r.dist) ? r.dist : null; },
    get hideIds() { return S.hideIds; }, set hideIds(x) { S.hideIds = x || new Set(); applyView(); },
    get ctx() { return S.ctx; }, get iso() { return S.iso; }, setCtx, setIso, applyView,
    get tool() { return S.tool; }, set tool(t) { S.tool = t; ev.emit('tool'); },
    get fileSavedRev() { return S.fileSavedRev; }, set fileSavedRev(v) { S.fileSavedRev = v; },
    get dirty() { return S.revision !== S.cleanRev; },
    markClean,
    setDoc, snapshot, change, touched, pushUndo, restore, undo, redo, undoTo, squash, historyStats, setHistoryLimit, Patch, rebuild, requalify, replaceMesh, select, clearSelection, selectedItems, errorsFor, localBox, refreshSelectionVisuals,
    recentProjects, loadStored, deleteStored, autosave, fitAfterBuild, on: ev.on, emit: ev.emit,
  };
})();

