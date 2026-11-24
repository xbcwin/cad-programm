// ================= App-Zustand, Verlauf (Rückgängig), Neuberechnung =================
const App = (() => {
  const S = {
    doc: Model.newDoc(), sel: [], face: null, edges: [], mode: 'model', tool: null,
    results: new Map(), errors: [], undo: [], redo: [], extra: [], hideIds: new Set(), revision: 0, lastSavedRev: -1, fileSavedRev: -1,
    ctx: null, iso: null,   // gerade bearbeitetes Bauteil / isoliertes Teil (nur Ansicht, nicht gespeichert)
  };
  const ev = makeEmitter();
  let dirty = false, busy = false, busyTimer = null;

  // ---------- Dokument ----------
  function setDoc(doc, opts = {}) {
    // noch ausstehendes Speichern des bisherigen Projekts zuerst erledigen
    if (S.doc) { try { autosave.flush(); } catch (_) {} }
    S.doc = Model.migrate(doc);
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    if (typeof Store !== 'undefined') {
      Store.extractBlobs(S.doc);
      if (S.doc.id) Store.loadVersions(S.doc.id).catch(() => {});
    }
    Model.useVars(Model.vars(S.doc).v);
    S.sel = []; S.face = null; S.edges = []; S.undo = []; S.redo = []; S.extra = []; S.ctx = null; S.iso = null;
    for (const id of [...S.results.keys()]) Viewer.removeNode(id);
    S.results.clear(); S.errors = []; S.revision++;
    Viewer.clearGhosts(); Views.reset(); Versions.compareOff();
    ev.emit('doc'); ev.emit('selection'); ev.emit('history');
    autosave();
    rebuild().then(() => { if (opts.fit !== false) Viewer.fit(null, false); });
  }
  function snapshot() { return JSON.stringify(S.doc); }
  function pushUndo(label, before) {
    const last = S.undo[S.undo.length - 1];
    S.undo.push({ label, before, t: Date.now() });
    if (S.undo.length > 300) S.undo.shift();
    S.redo = [];
    ev.emit('history');
    ev.emit('log', { kind: 'change', text: label, depth: S.undo.length });
  }
  // Änderung mit Rückgängig-Schritt. merge: gleiche Schlüssel kurz hintereinander werden zu einem Schritt.
  function change(label, fn, opts = {}) {
    const before = opts.before || snapshot();
    const topBefore = new Set(S.doc.items.map((x) => x.id));
    const res = fn(S.doc);
    if (res === false) return false;
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    placeNewAtMarker(S.doc, topBefore);
    Model.syncLinks(S.doc);
    const last = S.undo[S.undo.length - 1];
    if (opts.amend) { /* gehört zum letzten Schritt (z. B. nachgeführte Kanten): kein eigener Rückgängig-Schritt */ }
    else if (opts.merge && last && last.merge === opts.merge && Date.now() - last.t < 1500) { last.t = Date.now(); }
    else { pushUndo(label, before); if (opts.merge) S.undo[S.undo.length - 1].merge = opts.merge; }
    touched();
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
  function touched(noRebuild) {
    if (S.peek != null) { S.peek = null; ev.emit('peek'); }
    Model.useVars(Model.vars(S.doc).v);
    S.doc.modified = Date.now(); S.revision++;
    ev.emit('doc');
    autosave();
    if (!noRebuild) rebuild();
  }
  function restore(json) {
    const doc = JSON.parse(json);
    S.doc = doc;
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    Model.useVars(Model.vars(S.doc).v);
    const valid = new Set(); Model.walk(doc.items, (it) => valid.add(it.id));
    S.sel = S.sel.filter((id) => valid.has(id));
    if (S.face && !valid.has(S.face.id)) S.face = null;
    S.edges = S.edges.filter((e) => valid.has(e.id));
    S.revision++;
    ev.emit('doc'); ev.emit('selection'); autosave(); rebuild();
  }
  function undo(silent) {
    const step = S.undo.pop(); if (!step) return;
    S.redo.push({ label: step.label, before: snapshot() });
    restore(step.before); ev.emit('history');
    if (!silent) { UI.toast(`Rückgängig: ${step.label}`, { icon: 'undo', ms: 1600 }); ev.emit('log', { kind: 'undo', text: step.label, depth: S.undo.length }); }
  }
  function redo(silent) {
    const step = S.redo.pop(); if (!step) return;
    S.undo.push({ label: step.label, before: snapshot(), t: 0 });
    restore(step.before); ev.emit('history');
    if (!silent) { UI.toast(`Wiederholt: ${step.label}`, { icon: 'redo', ms: 1600 }); ev.emit('log', { kind: 'redo', text: step.label, depth: S.undo.length }); }
  }
  // mehrere Rückgängig-Schritte ab depth zu einem zusammenfassen (z. B. ein ganzer Auftrag des KI-Kollegen)
  function squash(depth, label) {
    const n = S.undo.length - depth; if (n <= 0) return null;
    const first = S.undo[depth];
    const step = { label: label || first.label, before: first.before, t: Date.now() };
    S.undo.splice(depth, n, step);
    ev.emit('history');
    if (n > 1) ev.emit('log', { kind: 'info', text: `${step.label} – ${n} Schritte zu einem zusammengefasst` });
    return step;
  }
  // mehrere Schritte auf einmal zurück, z. B. aus dem Protokoll
  function undoTo(depth) {
    let n = 0; while (S.undo.length > depth && S.undo.length) { undo(true); n++; }
    if (n) { UI.toast(n === 1 ? '1 Schritt rückgängig gemacht' : n + ' Schritte rückgängig gemacht', { icon: 'undo', ms: 1800 }); ev.emit('log', { kind: 'undo', text: `${n} ${n === 1 ? 'Schritt' : 'Schritte'} zurück`, depth: S.undo.length }); }
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
  function rebuild() {
    dirty = true;
    if (!busy) return runRebuild();
    return new Promise((res) => { const off = ev.on('rebuilt', () => { if (!dirty) { off(); res(); } }); });
  }
  async function runRebuild() {
    if (!Kernel.ready) { await Kernel.whenReady().catch(() => {}); if (!Kernel.ready) return; }
    busy = true;
    clearTimeout(busyTimer); busyTimer = setTimeout(() => ev.emit('busy', true), 300);
    while (dirty) {
      dirty = false;
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
    busy = false; clearTimeout(busyTimer); ev.emit('busy', false);
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
    for (const [id, ms] of Object.entries(res.times || {})) times.set(id, { ms, at: Date.now() });
    for (const n of res.nodes) {
      seen.add(n.id);
      if (n.merged) S.merged.set(n.id, n.merged);
      const it = topItem(n.id); if (!it) continue;
      const info = { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, key: n.key };
      if (n.empty) { Viewer.removeNode(n.id); S.results.delete(n.id); continue; }
      if (n.same && S.results.has(n.id)) { Viewer.updateNode(n.id, info); continue; }
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
    Viewer.setNode(id, payload, { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, key });
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
        if ((top.kind === 'transform' || top.kind === 'rib') && S.merged && S.merged.has(top.id)) selTop.add(S.merged.get(top.id));
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
      const items = childIds.map((id) => { const f = Model.find(S.doc, id); if (!f) return null; const ki = Model.kernelItem(f.item, v); ki.m = Model.matArr(Model.worldMatrix(S.doc, id)); ki.role = 'solid'; ki.hidden = false; return ki; }).filter(Boolean);
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
    const { v } = Model.vars(S.doc);
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
    get hideIds() { return S.hideIds; }, set hideIds(x) { S.hideIds = x || new Set(); applyView(); },
    get ctx() { return S.ctx; }, get iso() { return S.iso; }, setCtx, setIso, applyView,
    get tool() { return S.tool; }, set tool(t) { S.tool = t; ev.emit('tool'); },
    get fileSavedRev() { return S.fileSavedRev; }, set fileSavedRev(v) { S.fileSavedRev = v; },
    setDoc, snapshot, change, touched, pushUndo, restore, undo, redo, undoTo, squash, rebuild, requalify, replaceMesh, select, clearSelection, selectedItems, errorsFor, localBox, refreshSelectionVisuals,
    recentProjects, loadStored, deleteStored, autosave, fitAfterBuild, on: ev.on, emit: ev.emit,
  };
})();

