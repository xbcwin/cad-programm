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
    doc: Model.newDoc(), sel: [], face: null, faces: [], edges: [], mode: 'model', tool: null,
    results: new Map(), resolved: new Map(), baseBoxes: new Map(), ownBoxes: new Map(), deletedBy: new Map(), stepStats: new Map(), evalStats: null, errors: [], undo: [], redo: [], undoBytes: 0, redoBytes: 0, extra: [], hideIds: new Set(), revision: 1, cleanRev: 1, lastSavedRev: -1, fileSavedRev: -1,
    ctx: null, iso: null,   // gerade bearbeitetes Bauteil / isoliertes Teil (nur Ansicht, nicht gespeichert)
  };
  const ev = makeEmitter();
  const times = new Map();
  const SLOW_CALC_MS = 2000;
  let dirty = false, busy = false, busyTimer = null;
  let cancelTimer = null, canCancel = false, runSeq = 0, curRunId = 0, cancelRunId = 0, lastCancelledAt = 0;
  const tabs = [];
  let activeTabId = null;
  let revSeq = 0;
  const nextRev = () => ++revSeq;

  function createTabRecord(doc, opts = {}) {
    const d = Model.migrate(doc || Model.newDoc());
    const rev = nextRev();
    return {
      tabId: opts.tabId || uid('tab'),
      doc: d,
      sel: [],
      face: null,
      faces: [],
      edges: [],
      undo: [],
      redo: [],
      undoBytes: 0,
      redoBytes: 0,
      revision: rev,
      cleanRev: rev,
      lastSavedRev: opts.saved ? rev : -1,
      fileSavedRev: opts.saved ? rev : -1,
      ctx: null,
      iso: null,
      mode: opts.mode || 'model',
      camera: null,
      times: new Map(),
      stepStats: new Map(),
      evalStats: null,
      lastGood: null,
    };
  }
  {
    const initTab = createTabRecord(S.doc);
    tabs.push(initTab);
    activeTabId = initTab.tabId;
    S.revision = initTab.revision;
    S.cleanRev = initTab.cleanRev;
  }
  function currentTab() {
    return tabs.find((t) => t.tabId === activeTabId) || tabs[0] || null;
  }
  function tabInfo(t) {
    const isAct = t.tabId === activeTabId;
    const d = isAct ? S.doc : t.doc;
    const rev = isAct ? S.revision : t.revision;
    const clean = isAct ? S.cleanRev : t.cleanRev;
    const undoArr = isAct ? S.undo : t.undo;
    const redoArr = isAct ? S.redo : t.redo;
    return {
      tabId: t.tabId,
      docId: d && d.id,
      docType: Model.docType(d),
      name: (d && d.name) || 'Neues Projekt',
      dirty: rev !== clean,
      active: isAct,
      itemCount: Model.countItems(d),
      undoCount: undoArr ? undoArr.length : 0,
      redoCount: redoArr ? redoArr.length : 0,
    };
  }
  function findOpenDoc(docId) {
    if (!docId) return null;
    if (S.doc && S.doc.id === docId) return S.doc;
    const t = tabs.find((x) => x.doc && x.doc.id === docId);
    return t ? t.doc : null;
  }
  function syncCurrentMeta() {
    const cur = currentTab();
    if (!cur) return;
    cur.doc = S.doc;
    cur.revision = S.revision;
    cur.cleanRev = S.cleanRev;
    cur.lastSavedRev = S.lastSavedRev;
    cur.fileSavedRev = S.fileSavedRev;
  }
  function stashActiveTab() {
    const cur = currentTab();
    if (!cur) return;
    cur.doc = S.doc;
    cur.sel = S.sel.slice();
    cur.face = S.face;
    cur.faces = S.faces.slice();
    cur.edges = S.edges.slice();
    cur.undo = S.undo;
    cur.redo = S.redo;
    cur.undoBytes = S.undoBytes;
    cur.redoBytes = S.redoBytes;
    cur.revision = S.revision;
    cur.cleanRev = S.cleanRev;
    cur.lastSavedRev = S.lastSavedRev;
    cur.fileSavedRev = S.fileSavedRev;
    cur.ctx = S.ctx;
    cur.iso = S.iso;
    cur.mode = S.mode;
    cur.times = new Map(times);
    cur.stepStats = new Map(S.stepStats);
    cur.evalStats = S.evalStats;
    if (typeof Viewer !== 'undefined' && Viewer.controls && Viewer.camera && Viewer.saveCamera) {
      try { cur.camera = Viewer.saveCamera(); } catch (_) {}
    }
  }
  function leaveTransientModes() {
    if (typeof Sketch !== 'undefined' && Sketch.active) Sketch.cancel(true);
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    if (typeof Select !== 'undefined' && Select.paintActive) Select.stopPaint();
    if (typeof RefFix !== 'undefined' && RefFix.active) RefFix.stop({ keepToast: true });
    if (typeof Panels !== 'undefined' && Panels.closeFlyout) Panels.closeFlyout();
    if (typeof UI !== 'undefined') { UI.closeMenu(); UI.closePop(); if (UI.closeRadial) UI.closeRadial(); }
  }
  function syncOpenTabsToStore() {
    if (typeof Store === 'undefined' || !Store.ready || !Store.setOpenTabs) return;
    const ids = tabs.map((t) => {
      const d = t.tabId === activeTabId ? S.doc : t.doc;
      return d && d.id;
    }).filter(Boolean);
    const act = S.doc && S.doc.id ? S.doc.id : null;
    Store.setOpenTabs(ids, act);
  }
  function activateTab(tab, opts = {}) {
    activeTabId = tab.tabId;
    S.doc = Model.migrate(tab.doc);
    tab.doc = S.doc;
    S.sel = (tab.sel || []).slice();
    S.face = tab.face || null;
    S.faces = (tab.faces || []).slice();
    S.edges = (tab.edges || []).slice();
    S.undo = tab.undo || [];
    S.redo = tab.redo || [];
    S.undoBytes = tab.undoBytes || 0;
    S.redoBytes = tab.redoBytes || 0;
    S.revision = tab.revision || nextRev();
    S.cleanRev = tab.cleanRev || S.revision;
    S.lastSavedRev = tab.lastSavedRev != null ? tab.lastSavedRev : -1;
    S.fileSavedRev = tab.fileSavedRev != null ? tab.fileSavedRev : -1;
    S.ctx = tab.ctx || null;
    S.iso = tab.iso || null;
    S.extra = [];
    S.hideIds = new Set();
    S.peek = null;
    times.clear();
    if (tab.times) for (const [k, v] of tab.times) times.set(k, v);
    S.stepStats = new Map(tab.stepStats || []);
    S.evalStats = tab.evalStats || null;
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    if (typeof Store !== 'undefined') {
      Store.extractBlobs(S.doc);
      if (S.doc.id) Store.loadVersions(S.doc.id).catch(() => {});
    }
    Model.useVars(Model.vars(S.doc).v);
    for (const id of [...S.results.keys()]) Viewer.removeNode(id);
    S.results.clear(); S.resolved.clear(); S.baseBoxes.clear(); S.ownBoxes.clear(); S.deletedBy = new Map(); S.errors = []; S.merged = new Map();
    Viewer.clearGhosts();
    if (Viewer.clearProxies) Viewer.clearProxies();
    Views.reset();
    Versions.compareOff();
    ev.emit('doc');
    ev.emit('docLoaded', { doc: S.doc, opts });
    ev.emit('selection');
    ev.emit('history');
    ev.emit('ctx');
    ev.emit('tabs');
    if (typeof Commands !== 'undefined' && Commands.setMode && (tab.mode || 'model') !== S.mode) {
      Commands.setMode(tab.mode || 'model');
    }
    if (!(opts && opts.noAutosave) && !(opts && opts.isSwitch)) autosave();
    if (!(opts && opts.fromBoot)) syncOpenTabsToStore();
    const startCamSeq = (typeof Viewer !== 'undefined' && Viewer.camMoveSeq != null) ? Viewer.camMoveSeq : null;
    rebuild().then(() => {
      if (activeTabId !== tab.tabId) return;
      const camUntouched = startCamSeq == null || typeof Viewer === 'undefined' || Viewer.camMoveSeq === startCamSeq;
      if (!camUntouched) return;
      if (opts && opts.isSwitch && tab.camera) Viewer.restoreCamera(tab.camera, false);
      else if (opts.fit !== false) Viewer.fit(null, false);
    });
  }

  // ---------- Dokument ----------
  function setDoc(doc, opts = {}) {
    if (opts && opts.newTab) return openTab(doc, opts);
    if (doc && doc.id && !(opts && (opts.fromBoot || opts.fromRecovery || opts.forceReplace))) {
      const other = tabs.find((t) => t.tabId !== activeTabId && t.doc && t.doc.id === doc.id);
      if (other) {
        switchTab(other.tabId, opts);
        return other.tabId;
      }
    }
    // noch ausstehendes Speichern des bisherigen Projekts zuerst erledigen
    if (!(opts && opts.fromBoot)) {
      leaveTransientModes();
      if (S.doc) { try { autosave.flush(); } catch (_) {} }
    }
    const idx = tabs.findIndex((t) => t.tabId === activeTabId);
    const keepMode = !!(S.doc && doc && doc.id && S.doc.id === doc.id);
    const nextRec = createTabRecord(doc, { tabId: activeTabId, saved: !!(opts && opts.saved), mode: keepMode ? S.mode : 'model' });
    if (idx >= 0) tabs[idx] = nextRec;
    else tabs.push(nextRec);
    activateTab(nextRec, { ...opts, isSwitch: false });
    return nextRec.tabId;
  }
  function openTab(doc, opts = {}) {
    const nextDoc = doc || Model.newDoc('Neues Projekt');
    if (nextDoc && nextDoc.id) {
      const existing = tabs.find((t) => {
        const d = t.tabId === activeTabId ? S.doc : t.doc;
        return d && d.id === nextDoc.id;
      });
      if (existing) {
        if (existing.tabId !== activeTabId) switchTab(existing.tabId, opts);
        return existing.tabId;
      }
    }
    leaveTransientModes();
    if (S.doc) { try { autosave.flush(); } catch (_) {} }
    stashActiveTab();
    const tab = createTabRecord(nextDoc, opts);
    tabs.push(tab);
    activateTab(tab, { ...opts, isSwitch: false });
    return tab.tabId;
  }
  function switchTab(tabId, opts = {}) {
    const target = tabs.find((t) => t.tabId === tabId);
    if (!target) return false;
    if (target.tabId === activeTabId) return true;
    const prevTabId = activeTabId, prevDoc = S.doc;
    leaveTransientModes();
    if (S.doc) { try { autosave.flush(); } catch (_) {} }
    stashActiveTab();
    ev.emit('beforeSwitchTab', { fromTabId: prevTabId, toTabId: target.tabId, fromDoc: prevDoc, toDoc: target.doc });
    activateTab(target, { ...opts, isSwitch: true });
    return true;
  }
  function getTabDoc(tabId) {
    if (!tabId || tabId === activeTabId) return S.doc;
    const t = tabs.find((x) => x.tabId === tabId);
    return (t && t.doc) || null;
  }
  function updateTabDoc(tabId, fn) {
    if (typeof fn !== 'function') return false;
    if (!tabId || tabId === activeTabId) {
      if (fn(S.doc) !== true) return false;
      S.revision = nextRev();
      S.doc.modified = Date.now();
      Model.useVars(Model.vars(S.doc).v);
      syncCurrentMeta();
      ev.emit('doc');
      ev.emit('tabs');
      autosave();
      rebuild();
      return true;
    }
    const tab = tabs.find((x) => x.tabId === tabId);
    if (!tab || !tab.doc) return false;
    if (fn(tab.doc) !== true) return false;
    const wasClean = tab.revision === tab.cleanRev;
    tab.revision = nextRev();
    tab.doc.modified = Date.now();
    if (wasClean) tab.cleanRev = tab.revision;
    if (typeof Store !== 'undefined' && Store.saveProject) {
      Store.saveProject(tab.doc, Model.countItems(tab.doc), { keepLast: true });
      tab.lastSavedRev = tab.revision;
    }
    ev.emit('tabs');
    return true;
  }
  async function closeTab(tabId = activeTabId, opts = {}) {
    let idx = tabs.findIndex((t) => t.tabId === tabId);
    if (idx < 0) return false;
    const info = tabInfo(tabs[idx]);
    if (info.dirty && !(opts && opts.force)) {
      const ok = await new Promise((res) => {
        UI.modal({
          title: T('tabs.closeDirtyTitle'),
          body: T('tabs.closeDirtyBody', { name: info.name }),
          actions: [
            { id: 'tab-close-cancel', label: T('common.cancel'), value: false },
            { id: 'tab-close-confirm', label: T('tabs.closeAnyway'), danger: true, value: true },
          ],
          onClose: (v) => res(!!v),
        });
      });
      if (!ok) return false;
      idx = tabs.findIndex((t) => t.tabId === tabId);
      if (idx < 0) return false;
    }
    if (tabs.length === 1) {
      try { autosave.flush(); } catch (_) {}
      setDoc(Model.newDoc('Neues Projekt'), { fit: false, noAutosave: true, forceReplace: true });
      syncOpenTabsToStore();
      return true;
    }
    const tab = tabs[idx];
    if (tab.tabId === activeTabId) {
      leaveTransientModes();
      try { autosave.flush(); } catch (_) {}
      tabs.splice(idx, 1);
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activateTab(next, { isSwitch: true });
      return true;
    }
    if (tab.revision !== tab.lastSavedRev && (Model.countItems(tab.doc) > 0 || (tab.doc.params && tab.doc.params.length) || (typeof Store !== 'undefined' && Store.hasProject(tab.doc.id)))) {
      Store.saveProject(tab.doc, Model.countItems(tab.doc), { keepLast: true });
    }
    tabs.splice(idx, 1);
    ev.emit('tabs');
    syncOpenTabsToStore();
    return true;
  }
  function restoreOpenTabs(docs, wantedActiveDocId) {
    const list = (Array.isArray(docs) ? docs : []).filter((d) => d && typeof d === 'object');
    if (!list.length) return false;
    tabs.length = 0;
    for (const d of list) {
      const rec = createTabRecord(d, { saved: true });
      rec.lastSavedRev = rec.revision;
      tabs.push(rec);
    }
    const target = (wantedActiveDocId && tabs.find((t) => t.doc && t.doc.id === wantedActiveDocId)) || tabs[tabs.length - 1];
    activateTab(target, { fit: true, fromBoot: true, noAutosave: true });
    return true;
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
    if (Model.syncBlocks) Model.syncBlocks(S.doc);
    if (typeof Assembly !== 'undefined' && Assembly.syncPatterns) Assembly.syncPatterns(S.doc);
    if (typeof Comp !== 'undefined' && Comp.syncSkeletons) Comp.syncSkeletons(S.doc);
    if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(S.doc);
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
  function pruneMerged() {
    if ((!S.merged || !S.merged.size) && (!S.deletedBy || !S.deletedBy.size)) return;
    const valid = new Set();
    Model.walk(S.doc.items, (it) => valid.add(it.id));
    if (S.merged) for (const [k, v] of S.merged) {
      if (!valid.has(k) || !valid.has(v)) S.merged.delete(k);
    }
    if (S.deletedBy) for (const [k, v] of S.deletedBy) {
      if (!valid.has(k) || !valid.has(v)) S.deletedBy.delete(k);
    }
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
    S.revision = nextRev();
    pruneMerged();
    syncCurrentMeta();
    ev.emit('doc');
    ev.emit('dirty', { doc: S.doc, revision: S.revision });
    ev.emit('tabs');
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
    S.revision = nextRev();
    pruneMerged();
    syncCurrentMeta();
    ev.emit('doc'); ev.emit('dirty', { doc: S.doc, revision: S.revision }); ev.emit('tabs'); ev.emit('selection'); autosave(); rebuild();
  }
  function markClean() {
    S.cleanRev = S.revision;
    S.fileSavedRev = S.revision;
    syncCurrentMeta();
    ev.emit('clean', { doc: S.doc, revision: S.revision });
    ev.emit('tabs');
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
      if (ok) { syncCurrentMeta(); syncOpenTabsToStore(); ev.emit('saved', { doc: d, revision: rev }); }
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
  const deleteStored = (id) => {
    const keepDocs = tabs.map((t) => (t.tabId === activeTabId ? S.doc : t.doc)).filter((d) => d && d.id !== id);
    return Store.deleteProject(id, keepDocs);
  };

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
  function setCanCancel(on) {
    const next = !!on;
    if (next === canCancel) return;
    canCancel = next;
    ev.emit('calcCancelable', canCancel);
  }
  function restoreLastGood() {
    const tab = currentTab();
    const lg = tab && tab.lastGood;
    if (!lg || !lg.doc) return false;
    while (S.undo.length > lg.undoLen) {
      const st = S.undo.pop();
      S.undoBytes = Math.max(0, S.undoBytes - st.bytes);
      S.redo.push(st);
      S.redoBytes += st.bytes;
    }
    if (S.undo.length < lg.undoLen && S.redo.length >= lg.undoLen - S.undo.length) {
      while (S.undo.length < lg.undoLen && S.redo.length) {
        const st = S.redo.pop();
        S.redoBytes = Math.max(0, S.redoBytes - st.bytes);
        S.undo.push(st);
        S.undoBytes += st.bytes;
      }
    }
    trimHistory();
    S.doc = cloneDoc(lg.doc);
    if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(S.doc.fonts);
    Model.useVars(Model.vars(S.doc).v);
    const valid = new Set(); Model.walk(S.doc.items, (it) => valid.add(it.id));
    S.sel = S.sel.filter((id) => valid.has(id));
    if (S.face && !valid.has(S.face.id)) S.face = null;
    S.edges = S.edges.filter((e) => valid.has(e.id));
    S.revision = nextRev();
    pruneMerged();
    syncCurrentMeta();
    ev.emit('doc');
    ev.emit('history');
    ev.emit('tabs');
    ev.emit('selection');
    ev.emit('results');
    autosave();
    return true;
  }
  // ---------- Ohne Verlauf arbeiten: Körper einfrieren & direkt bearbeiten (KP-54) ----------
  function transformSpatialMeta(list, m, isDecal = false) {
    if (!Array.isArray(list) || !list.length || !m) return list;
    const nMat = new THREE.Matrix3().getNormalMatrix(m);
    const xf = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const out = { ...obj };
      if (Array.isArray(obj.c) && obj.c.length >= 3) {
        out.c = new THREE.Vector3(obj.c[0], obj.c[1], obj.c[2]).applyMatrix4(m).toArray().map((v) => round(v, 6));
      }
      if (Array.isArray(obj.n) && obj.n.length >= 3) {
        out.n = new THREE.Vector3(obj.n[0], obj.n[1], obj.n[2]).applyMatrix3(nMat).normalize().toArray().map((v) => round(v, 6));
      }
      return out;
    };
    return list.map((entry) => {
      if (!entry) return entry;
      const out = Patch.jsonClone(entry);
      if (isDecal) { if (out.face) out.face = xf(out.face); }
      else Object.assign(out, xf(out));
      return out;
    });
  }
  function worldBoxOfTop(doc, it) {
    if (!it) return null;
    let b = S.ownBoxes && S.ownBoxes.get(it.id);
    if (!b) {
      const r = S.results && S.results.get(it.id);
      if (r && r.data && r.data.bbox) b = r.data.bbox;
    }
    if (!b) b = Model.itemLocalBox(it, Model.itemVars(doc, it.id));
    if (!b || b.length < 6) return null;
    const box = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
    box.applyMatrix4(Model.localMatrix(it));
    return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
  }
  function boxesHit(a, b, tol = 1e-3) {
    if (!a || !b) return false;
    return a[0] <= b[3] + tol && a[3] >= b[0] - tol && a[1] <= b[4] + tol && a[4] >= b[1] - tol && a[2] <= b[5] + tol && a[5] >= b[2] - tol;
  }
  function isCleanFrozenBody(it) {
    return !!(it && it.kind === 'import' && it.role !== 'hole' && it.p && it.p.fmt === 'brep' && it.p.frozen === true && !(it.finishes && it.finishes.length) && !it.op && !it.mir);
  }
  function needsDirectBake(doc) {
    if (!doc || !doc.noHistory || !Array.isArray(doc.items) || !doc.items.length) return false;
    if (doc.rollback != null || (Array.isArray(doc.folders) && doc.folders.length)) return true;
    const act = Model.activeItems(doc);
    const solidBoxes = [];
    const holeItems = [];
    for (const it of act) {
      if (it.hidden) continue;
      if (it.role === 'hole') { holeItems.push(it); continue; }
      if (!isCleanFrozenBody(it)) return true;
      const wb = worldBoxOfTop(doc, it);
      if (wb) solidBoxes.push(wb);
    }
    for (const h of holeItems) {
      const hb = worldBoxOfTop(doc, h);
      if (!hb || !solidBoxes.length || solidBoxes.some((sb) => boxesHit(hb, sb))) return true;
    }
    return false;
  }
  async function bakeItemsToFrozen(doc, opts = {}) {
    await Kernel.ensure();
    const act = Model.activeItems(doc);
    const hasRes = S.results && S.results.size > 0;
    const liveSolids = act.filter((it) => !it.hidden && it.role !== 'hole' && !S.merged.has(it.id) && !S.deletedBy.has(it.id) && (!hasRes || S.results.has(it.id)));
    const mergedTargets = new Set();
    for (const [, tgtId] of S.merged) {
      let cur = tgtId;
      const seen = new Set();
      while (S.merged.has(cur) && !seen.has(cur)) { seen.add(cur); cur = S.merged.get(cur); }
      mergedTargets.add(cur);
    }
    const solidBoxes = liveSolids.map((it) => worldBoxOfTop(doc, it));
    const looseHoles = [];
    const activeHoles = [];
    for (const it of act) {
      if (it.hidden || it.role !== 'hole') continue;
      const hb = worldBoxOfTop(doc, it);
      if (hb && solidBoxes.length && solidBoxes.every((sb) => sb && !boxesHit(hb, sb))) looseHoles.push(Patch.jsonClone(it));
      else activeHoles.push({ item: it, wb: hb });
    }
    const scene = Model.kernelScene(doc);
    const frozenSolids = [];
    const idMap = new Map();
    const usedIds = new Set(looseHoles.map((x) => x.id));
    for (let idx = 0; idx < liveSolids.length; idx++) {
      const root = liveSolids[idx];
      const sb = solidBoxes[idx];
      let metaSrc = root;
      if (root.kind === 'group' && Array.isArray(root.children)) {
        const firstSolid = root.children.find((c) => c && c.role !== 'hole' && !c.suppressed);
        if (firstSolid) metaSrc = firstSolid;
      }
      const preferredId = metaSrc && metaSrc.p && metaSrc.p.frozen && !usedIds.has(metaSrc.id)
        ? metaSrc.id
        : (!usedIds.has(root.id) ? root.id : uid('i'));
      usedIds.add(preferredId);
      const holeHits = activeHoles.some((h) => !h.wb || !sb || boxesHit(h.wb, sb));
      const modHits = mergedTargets.has(root.id);
      if (!opts.bakeTransforms && isCleanFrozenBody(root) && !holeHits && !modHits) {
        const kept = Patch.jsonClone(root);
        frozenSolids.push(kept);
        idMap.set(root.id, kept.id);
        continue;
      }
      const res = await Kernel.call('exportBREP', { scene, only: [root.id] });
      const bytes = new Uint8Array(res.data);
      const blobId = typeof Store !== 'undefined' && Store.putBlob ? await Store.putBlob(bytes) : null;
      const baseName = (root.name && root.name.trim()) ? root.name.trim() : ((metaSrc && metaSrc.name && metaSrc.name.trim()) ? metaSrc.name.trim() : Model.label(root));
      const mat = root.mat || (metaSrc && metaSrc.mat) || undefined;
      const colorSet = !!(root.colorSet || (metaSrc && metaSrc.colorSet));
      const color = root.colorSet ? root.color : (metaSrc && metaSrc.colorSet ? metaSrc.color : (root.color || (metaSrc && metaSrc.color)));
      const imp = Model.newItem(
        'import',
        { fmt: 'brep', frozen: true, file: baseName + '.brep', ...(blobId ? { blobId } : {}), size: bytes.byteLength, ...(!blobId && typeof Store !== 'undefined' && Store.bytesToBase64 ? { data: Store.bytesToBase64(bytes) } : {}) },
        { name: baseName, color, mat }
      );
      imp.id = preferredId;
      imp.t = Model.T0();
      if (colorSet) imp.colorSet = true;
      const op = root.opacity != null ? root.opacity : (metaSrc && metaSrc.opacity != null ? metaSrc.opacity : null);
      if (op != null) imp.opacity = op;
      const mg = root.massG != null ? root.massG : (metaSrc && metaSrc.massG != null ? metaSrc.massG : null);
      if (mg != null) imp.massG = mg;
      const tex = root.texture || (metaSrc && metaSrc.texture);
      if (tex) imp.texture = Patch.jsonClone(tex);
      const fcSrc = Array.isArray(root.faceColors) && root.faceColors.length ? root : (metaSrc && Array.isArray(metaSrc.faceColors) && metaSrc.faceColors.length ? metaSrc : null);
      if (fcSrc) imp.faceColors = transformSpatialMeta(fcSrc.faceColors, Model.worldMatrix(doc, fcSrc.id), false);
      const dcSrc = Array.isArray(root.decals) && root.decals.length ? root : (metaSrc && Array.isArray(metaSrc.decals) && metaSrc.decals.length ? metaSrc : null);
      if (dcSrc) imp.decals = transformSpatialMeta(dcSrc.decals, Model.worldMatrix(doc, dcSrc.id), true);
      Model.walk([root], (x) => idMap.set(x.id, imp.id));
      for (const [srcId, tgtId] of S.merged) {
        let cur = tgtId;
        const seen = new Set([srcId]);
        while (S.merged.has(cur) && !seen.has(cur)) { seen.add(cur); cur = S.merged.get(cur); }
        if (cur === root.id) idMap.set(srcId, imp.id);
      }
      frozenSolids.push(imp);
    }
    return { items: [...frozenSolids, ...looseHoles], idMap };
  }
  function remapSelectionIds(sel, doc, idMap) {
    const valid = new Set((doc.items || []).map((x) => x.id));
    const out = [];
    for (const id of sel || []) {
      const mapped = (idMap && idMap.get(id)) || id;
      if (valid.has(mapped) && !out.includes(mapped)) out.push(mapped);
    }
    return out;
  }
  function applyDirectBake(frozenItems, idMap) {
    const beforeObj = cloneDoc(S.doc);
    S.doc.items = frozenItems;
    S.doc.rollback = null;
    S.doc.folders = [];
    S.doc.modified = Date.now();
    const last = S.undo[S.undo.length - 1];
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
    S.sel = remapSelectionIds(S.sel, S.doc, idMap);
    S.face = null; S.faces = []; S.edges = [];
    S.revision = nextRev();
    pruneMerged();
    syncCurrentMeta();
    ev.emit('doc');
    ev.emit('dirty', { doc: S.doc, revision: S.revision });
    ev.emit('tabs');
    ev.emit('selection');
    autosave();
  }
  async function setNoHistory(on) {
    const target = !!on;
    if (target === !!(S.doc && S.doc.noHistory)) return true;
    if (target && Model.isAssembly(S.doc)) return false;
    if (S.ctx) setCtx(null);
    if (S.peek != null) peek(null);
    const hasActive = needsKernelFor(S.doc, [], null);
    if (hasActive && (busy || dirty || S.doc.items.some((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !S.merged.has(x.id) && !S.deletedBy.has(x.id) && !S.results.has(x.id)))) {
      await rebuild();
    }
    const baked = hasActive ? await bakeItemsToFrozen(S.doc, { bakeTransforms: true }) : { items: [], idMap: new Map() };
    if (!target && baked.items.length === 1 && (!baked.items[0].name || !baked.items[0].name.trim())) {
      baked.items[0].name = T('tl.frozenBodyName');
    }
    const prevSel = S.sel.slice();
    change(target ? 'Verlauf abgeschaltet' : 'Verlauf wieder eingeschaltet', (doc) => {
      if (target) doc.noHistory = true;
      else delete doc.noHistory;
      doc.rollback = null;
      doc.folders = [];
      doc.items = baked.items;
    });
    const nextSel = remapSelectionIds(prevSel, S.doc, baked.idMap);
    select(nextSel);
    await rebuild();
    return true;
  }

  function cancelRebuild() {
    if (!busy) return false;
    cancelRunId = curRunId;
    dirty = false;
    clearTimeout(cancelTimer); cancelTimer = null;
    setCanCancel(false);
    if (typeof Kernel !== 'undefined' && Kernel.cancel) Kernel.cancel();
    return true;
  }
  function rebuild() {
    dirty = true;
    if (!busy) return runRebuild();
    return new Promise((res) => { const off = ev.on('rebuilt', () => { if (!dirty) { off(); res(); } }); });
  }
  async function runRebuild() {
    busy = true;
    const myRunId = ++runSeq;
    curRunId = myRunId;
    let calcEmitted = false;
    let wasCancelled = false;
    let lastBakedRev = -1;
    while (dirty) {
      dirty = false;
      const buildTabId = activeTabId;
      const buildDocId = S.doc && S.doc.id;
      if (!needsKernelFor(S.doc, S.extra, S.peek)) {
        apply({ nodes: [], errors: [], resolved: {}, times: {} });
        ev.emit('rebuilt');
        continue;
      }
      const tBuild0 = performance.now();
      if (!calcEmitted) {
        calcEmitted = true;
        ev.emit('calc', true);
        clearTimeout(busyTimer); busyTimer = setTimeout(() => ev.emit('busy', true), 300);
      }
      if (typeof Store !== 'undefined') {
        const ids = Store.collectBlobIds(S.doc);
        if ([...ids].some((id) => !Store.getBlobSync(id))) {
          await Store.hydrateDoc(S.doc);
          if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
          if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
        }
      }
      if (typeof Comp !== 'undefined' && Comp.ensureRefs) {
        await Comp.ensureRefs(S.doc).catch((e) => console.warn(e));
        if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
        if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
      }
      const lw = typeof Assembly !== 'undefined' && Assembly.partitionLightweight
        ? Assembly.partitionLightweight(S.doc, S.extra, S.peek)
        : null;
      if (lw && lw.evalItems.length && S.doc.lightweight && Assembly.markResolved) {
        const editedLw = lw.evalItems.filter((it) => it && S.results.get(it.id)?.lightweight).map((it) => it.id);
        if (editedLw.length) Assembly.markResolved(editedLw, S.doc);
      }
      if (lw && lw.evalItems.length === 0 && (!S.extra || !S.extra.length)) {
        apply({ nodes: lw.lightNodes, errors: [], resolved: {}, times: {} });
        if (Assembly.recordLightOpen) Assembly.recordLightOpen(S.doc.id, performance.now() - tBuild0, lw.lightNodes.length, 0);
        ev.emit('rebuilt');
        continue;
      }
      if (typeof SK !== 'undefined' && SK.ensureDocFonts) {
        await SK.ensureDocFonts(S.doc, S.extra).catch((e) => console.warn(e));
        if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
        if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
      }
      if (!Kernel.ready) {
        try { await Kernel.ensure(); }
        catch (e) {
          console.error(e);
          UI.toast('Der CAD-Kern konnte nicht gestartet werden: ' + (e.message || e), { kind: 'bad', ms: 6000 });
          break;
        }
        if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
        if (!Kernel.ready) break;
        if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
      }
      const scene = Model.kernelScene(S.doc, S.extra, S.peek);
      if (lw && lw.lightIds && lw.lightIds.size) {
        scene.items = scene.items.filter((x) => !lw.lightIds.has(x.id));
      }
      scene.quality = ViewPrefs.get().quality || 'normal';
      const known = {}; if (!S.forceMesh) for (const [id, r] of S.results) if (!r.lightweight && r.key) known[id] = r.key;
      S.forceMesh = false;
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => {
        if (busy && curRunId === myRunId && cancelRunId !== myRunId) setCanCancel(true);
      }, SLOW_CALC_MS);
      let res;
      try { res = await Kernel.call('evaluate', { scene, known }); }
      catch (e) {
        if ((e && (e.cancelled || e.code === 'cancelled')) || cancelRunId === myRunId) {
          wasCancelled = true;
          dirty = false;
          break;
        }
        console.error(e); UI.toast('Beim Berechnen ist ein Fehler passiert: ' + e.message, { kind: 'bad' }); break;
      } finally {
        clearTimeout(cancelTimer); cancelTimer = null;
        setCanCancel(false);
      }
      if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
      if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
      if (lw && lw.lightNodes.length) {
        const byId = new Map();
        for (const n of lw.lightNodes) byId.set(n.id, n);
        for (const n of (res && res.nodes) || []) byId.set(n.id, n);
        const ordered = [];
        for (const it of Model.activeItems(S.doc)) {
          const n = byId.get(it.id);
          if (n) { ordered.push(n); byId.delete(it.id); }
        }
        for (const n of byId.values()) ordered.push(n);
        res = { ...(res || {}), nodes: ordered };
      }
      apply(res);
      if (typeof Assembly !== 'undefined' && Assembly.recordLightOpen) {
        Assembly.recordLightOpen(S.doc.id, performance.now() - tBuild0, lw ? lw.lightNodes.length : 0, lw ? lw.evalItems.length : ((res && res.nodes && res.nodes.length) || 0));
      }
      if (S.doc.noHistory && S.peek == null && !(S.extra && S.extra.length) && !(res && res.errors && res.errors.length) && S.revision !== lastBakedRev && !(typeof Handles !== 'undefined' && Handles.dragging) && needsDirectBake(S.doc)) {
        const bakeRev = S.revision;
        try {
          const baked = await bakeItemsToFrozen(S.doc, { bakeTransforms: false });
          if (cancelRunId === myRunId) { wasCancelled = true; dirty = false; break; }
          if (activeTabId !== buildTabId || !S.doc || S.doc.id !== buildDocId) { dirty = true; continue; }
          if (S.revision === bakeRev && S.doc.noHistory) {
            applyDirectBake(baked.items, baked.idMap);
            lastBakedRev = S.revision;
            dirty = true;
            continue;
          }
        } catch (e) {
          console.error('Direkt-Einfrieren:', e);
        }
      }
      ev.emit('rebuilt');
    }
    busy = false; clearTimeout(busyTimer); clearTimeout(cancelTimer); cancelTimer = null; setCanCancel(false);
    if (wasCancelled) {
      const restored = restoreLastGood();
      lastCancelledAt = Date.now();
      ev.emit('cancelled', { restored });
      ev.emit('log', { kind: 'info', text: T('status.calcCancelledLog') });
      UI.toast(T('status.calcCancelledToast'), { icon: 'info', ms: 3800, noNotice: true });
    }
    if (calcEmitted) { ev.emit('busy', false); ev.emit('calc', false); }
    ev.emit('rebuilt');
  }
  // Aussehen am Werkstoff: eigener Werkstoff des Teils, sonst der ausdrücklich gewählte Projekt-Werkstoff
  function lookFor(it) {
    const mat = it.mat || (S.doc.settings && S.doc.settings.material) || null;
    const L = Viewer.lookOf(mat);
    return { ...L, mat, matCol: L.nat && !it.colorSet ? L.col : null, customColor: !!it.colorSet };
  }
  function topItem(id) { return S.doc.items.find((x) => x.id === id) || S.extra.find((x) => x.id === id); }
  // Rechenzeit je Schritt: zuletzt gemessen, als er wirklich neu gerechnet wurde (BE-26)
  function apply(res) {
    const seen = new Set();
    S.merged = new Map();
    S.deletedBy = new Map();
    S.resolved = new Map(Object.entries(res.resolved || {}));
    S.baseBoxes = new Map();
    S.ownBoxes = new Map();
    if (res && res.stats) {
      S.evalStats = res.stats;
      S.stepStats = new Map();
      const le = res.stats.lastEval || {};
      const rebuiltSet = new Set(le.rebuilt || []);
      const cachedSet = new Set(le.cached || []);
      const meshedSet = new Set(le.meshed || []);
      const fps = le.fingerprints || {};
      const buildsBy = res.stats.buildsByItem || {};
      const hitsBy = res.stats.hitsByItem || {};
      const allIds = new Set([...Object.keys(fps), ...rebuiltSet, ...cachedSet]);
      for (const id of allIds) {
        S.stepStats.set(id, {
          fp: fps[id] || null,
          rebuilt: rebuiltSet.has(id),
          cached: cachedSet.has(id),
          meshed: meshedSet.has(id),
          builds: buildsBy[id] || 0,
          hits: hitsBy[id] || 0,
          evalId: le.evalId || 0,
        });
      }
    } else if (res && Array.isArray(res.nodes) && !res.nodes.length) {
      S.stepStats.clear();
    }
    for (const [id, ms] of Object.entries(res.times || {})) times.set(id, { ms, at: Date.now() });
    for (const n of res.nodes) {
      seen.add(n.id);
      if (n.merged) S.merged.set(n.id, n.merged);
      if (n.deletedBy) S.deletedBy.set(n.id, n.deletedBy);
      if (n.baseBox) S.baseBoxes.set(n.id, n.baseBox);
      if (n.ownBox) S.ownBoxes.set(n.id, n.ownBox);
      const it = topItem(n.id); if (!it) continue;
      const info = { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, texture: it.texture || null, decals: it.decals || null, bodies: it.bodies || null, key: n.key };
      if (n.empty) { Viewer.removeNode(n.id); S.results.delete(n.id); continue; }
      if (n.lightweight) {
        const prevR = S.results.get(n.id);
        if (prevR && prevR.lightweight && prevR.lightFp === n.lightFp) {
          Viewer.updateNode(n.id, info);
          continue;
        }
        Viewer.setNode(n.id, n, info);
        S.results.set(n.id, { key: null, lightweight: true, lightFp: n.lightFp, data: n });
        continue;
      }
      if (n.same && S.results.has(n.id)) {
        if (n.bodies) { S.results.get(n.id).data.bodies = n.bodies; Viewer.updateNode(n.id, { ...info, forceBodies: true }); }
        else Viewer.updateNode(n.id, info);
        continue;
      }
      Viewer.setNode(n.id, n, info);
      S.results.set(n.id, { key: n.key, lightweight: false, data: n });
    }
    for (const id of [...S.results.keys()]) if (!seen.has(id)) { Viewer.removeNode(id); S.results.delete(id); }
    if (typeof Assembly !== 'undefined' && Assembly.captureLightMeshes && S.doc && (S.doc.lightweight || Model.isAssembly(S.doc))) {
      Assembly.captureLightMeshes(S.doc, S.results);
    }
    const oldErr = new Set(S.errors.map((e) => e.itemId + '|' + e.code + '|' + e.message));
    S.errors = (res.errors || []).concat(dimErrors(), refErrors(S.doc));
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
    const cur = currentTab();
    if (cur && cur.tabId === activeTabId && S.peek == null) {
      cur.lastGood = { doc: cloneDoc(S.doc), undoLen: S.undo.length };
    }
    ev.emit('results');
    if (S.fitNext) { S.fitNext = false; Viewer.fit(); }
  }
  function refErrors(doc) {
    const out = [];
    for (const it of Model.activeItems(doc)) {
      if (it.kind !== 'ref' || it.suppressed) continue;
      if (!Model.resolveDoc(it.p && it.p.docId)) {
        out.push({ itemId: it.id, code: 'refMissing', message: T('asm.refMissingErr', { name: (it.p && it.p.docName) || Model.label(it) }) });
      }
    }
    return out;
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
      const res = await Kernel.call('evaluate', { scene: { items }, known: {}, opts: { aux: true } });
      if (req !== ctxPickReq.n) return;
      Viewer.setProxies(res.nodes.filter((n) => !n.empty).map((n) => ({ id: n.id, data: n, matrix: Model.worldMatrix(S.doc, n.id) })));
    } catch (_) { Viewer.clearProxies(); }
  }
  function setCtx(id) {
    const it = id ? S.doc.items.find((x) => x.id === id) : null;
    if (it && it.kind !== 'group') return;
    if (it && typeof Assembly !== 'undefined' && Assembly.isLightweightItem && Assembly.isLightweightItem(it.id)) {
      Assembly.resolveLightweight(it.id, { silent: true });
    }
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
    if (payload) {
      for (const f of payload.faces || []) if (f && f.tid && f.tid.startsWith('$self/')) f.tid = id + '/' + f.tid.slice(6);
      for (const e of payload.edges || []) if (e && e.tid && e.tid.startsWith('$self/')) e.tid = id + '/' + e.tid.slice(6);
    }
    Viewer.setNode(id, payload, { matrix: Model.localMatrix(it), role: it.role, color: it.color, look: lookFor(it), opacity: it.opacity ?? null, faceColors: it.faceColors || null, threads: it.threads || null, texture: it.texture || null, decals: it.decals || null, bodies: it.bodies || null, key });
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
    if (S.sel.length && typeof Comp !== 'undefined' && Comp.selectSkeleton) {
      Comp.selectSkeleton(null, { silent: true });
    }
    if (Array.isArray(opts.faces) && opts.faces.length) {
      S.faces = opts.faces.slice();
      S.face = S.faces[S.faces.length - 1];
    } else if (opts.face) {
      S.face = opts.face;
      S.faces = [opts.face];
    } else {
      S.face = null;
      S.faces = [];
    }
    S.edges = opts.edges || [];
    refreshSelectionVisuals();
    ev.emit('selection');
  }
  function clearSelection() { if (!S.sel.length && !S.face && !S.faces.length && !S.edges.length) return; select([]); }
  const ghostReq = { n: 0 };
  async function refreshSelectionVisuals() {
    const selTop = new Set();
    for (const id of S.sel) {
      const top = Model.topOf(S.doc, id);
      if (top) {
        selTop.add(top.id);
        if ((top.kind === 'transform' || top.kind === 'scale' || top.kind === 'deform' || top.kind === 'thicken' || top.kind === 'directFace' || top.kind === 'rib' || top.kind === 'vent' || top.kind === 'fins' || top.kind === 'fillPattern' || top.kind === 'mountPattern' || top.kind === 'portCutout' || top.kind === 'magnetPocket' || top.kind === 'web' || top.kind === 'wrap' || top.kind === 'emboss' || top.kind === 'splitFace' || top.kind === 'dome' || top.kind === 'deleteFace' || top.kind === 'replaceFace' || top.kind === 'moveEdge' || top.kind === 'editHole' || top.kind === 'editFillet' || top.kind === 'mirrorStep' || top.kind === 'boss' || top.kind === 'undercut' || top.kind === 'circlipGroove' || top.kind === 'keyway' || top.kind === 'splineProfile' || top.kind === 'knurl' || top.kind === 'gripPattern') && S.merged && S.merged.has(top.id)) selTop.add(S.merged.get(top.id));
        if (top.kind === 'lipGroove' && top.p) {
          for (const tid of [top.p.lipTarget, top.p.grooveTarget]) {
            if (!tid) continue;
            selTop.add((S.merged && S.merged.get(tid)) || tid);
          }
        }
        if (top.kind === 'stackHole' || top.kind === 'asmCut') {
          const res = S.resolved && S.resolved.get(top.id);
          const idsToHl = (res && Array.isArray(res.cutIds) && res.cutIds.length) ? res.cutIds : ((top.p && Array.isArray(top.p.targets)) ? top.p.targets : []);
          for (const tid of idsToHl) selTop.add((S.merged && S.merged.get(tid)) || tid);
        }
      }
      selTop.add('__ex:' + id);
    }
    for (const [id] of Viewer.nodes) Viewer.updateNode(id, { selected: selTop.has(id) });
    if (Viewer.setSelectedFaces) Viewer.setSelectedFaces(S.faces);
    else Viewer.highlightFace('sel', S.face ? S.face.id : null, S.face ? S.face.faceIdx : null);
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
        const res = await Kernel.call('evaluate', { scene: { items }, known: {}, opts: { aux: true } });
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
    get doc() { return S.doc; }, get sel() { return S.sel; }, get face() { return S.face; }, get faces() { return S.faces; }, get edges() { return S.edges; }, get results() { return S.results; }, get errors() { return S.errors; },
    get undoStack() { return S.undo; }, get redoStack() { return S.redo; }, get revision() { return S.revision; }, get busy() { return busy; },
    get canCancel() { return canCancel; }, get lastCancelledAt() { return lastCancelledAt; }, cancelRebuild,
    get mode() { return S.mode; }, set mode(m) { S.mode = m; ev.emit('mode'); },
    get extra() { return S.extra; }, set extra(x) { S.extra = x; },
    peek, get peeking() { return S.peek == null ? null : S.peek; },
    timeOf(id) { return times.get(id) || null; },
    get times() { return times; },
    mergedInto(id) {
      const to = S.merged && S.merged.get(id);
      return to && Model.find(S.doc, to) ? to : null;
    },
    deletedBy(id) {
      const by = S.deletedBy && S.deletedBy.get(id);
      return by && Model.find(S.doc, by) ? by : null;
    },
    baseBox(id) { return (S.baseBoxes && S.baseBoxes.get(id)) || null; },
    ownBox(id) { return (S.ownBoxes && S.ownBoxes.get(id)) || null; },
    resolvedOf(id) { return (S.resolved && S.resolved.get(id)) || null; },
    resolvedDist(id) { const r = S.resolved && S.resolved.get(id); return r && isFinite(r.dist) ? r.dist : null; },
    stepFingerprint(id) { const st = S.stepStats.get(id); return (st && st.fp) || null; },
    stepCacheStatus(id) { return S.stepStats.get(id) || null; },
    get evalStats() { return S.evalStats; },
    get hideIds() { return S.hideIds; }, set hideIds(x) { S.hideIds = x || new Set(); applyView(); },
    get ctx() { return S.ctx; }, get iso() { return S.iso; }, setCtx, setIso, applyView,
    get noHistory() { return !!(S.doc && S.doc.noHistory); }, setNoHistory,
    get tool() { return S.tool; }, set tool(t) { S.tool = t; ev.emit('tool'); },
    get fileSavedRev() { return S.fileSavedRev; }, set fileSavedRev(v) { S.fileSavedRev = v; },
    get dirty() { return S.revision !== S.cleanRev; },
    get anyDirty() { return tabs.some((t) => tabInfo(t).dirty); },
    get tabs() { return tabs.map(tabInfo); },
    get activeTabId() { return activeTabId; },
    markClean, findOpenDoc,
    setDoc, openTab, switchTab, closeTab, restoreOpenTabs, getTabDoc, updateTabDoc, saveNow, snapshot, change, touched, pushUndo, restore, undo, redo, undoTo, squash, historyStats, setHistoryLimit, Patch, rebuild, requalify, replaceMesh, select, clearSelection, selectedItems, errorsFor, localBox, refreshSelectionVisuals,
    recentProjects, loadStored, deleteStored, autosave, fitAfterBuild, on: ev.on, emit: ev.emit,
  };
})();

