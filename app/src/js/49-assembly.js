// ================= Baugruppen & Bauteile: Bauteil im Tab öffnen (BG-01) =================
const Assembly = (() => {
  const returnTargets = new Map(); // partDocId -> { asmTabId, asmDocId, itemId }
  let banner = null;

  function isAssembly(doc = App.doc) {
    return !!(doc && (doc.docType === 'assembly' || doc.type === 'assembly' || doc.isAssembly === true));
  }
  function isPartRef(it) {
    return !!(it && it.partRef && typeof it.partRef.docId === 'string' && it.partRef.docId);
  }
  function isStepMod(it) {
    return !it || it.kind === 'transform' || it.kind === 'scale' || it.kind === 'rib' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'mirrorStep' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new'));
  }
  function canOpenInTab(it, doc = App.doc) {
    if (!it || it.kind === 'ref') return false;
    if (isPartRef(it)) return true;
    return isAssembly(doc) && !App.ctx && Array.isArray(doc.items) && doc.items.includes(it) && it.role !== 'hole' && !isStepMod(it);
  }
  function newAssembly(name) {
    return Model.newDoc(name || T('asm.defaultName'), { docType: 'assembly' });
  }

  function remapIds(items, prefix) {
    const cloned = deepClone(Array.isArray(items) ? items : []);
    const idMap = new Map();
    Model.walk(cloned, (it) => {
      if (it && it.id) idMap.set(it.id, prefix + it.id);
    });
    for (const it of cloned) {
      if (it && it.op) {
        if (it.op.type === 'cut') { it.role = 'hole'; delete it.op; }
        else if (it.op.type === 'join') delete it.op;
      }
    }
    const mapId = (id) => (id && idMap.has(id) ? idMap.get(id) : id);
    Model.walk(cloned, (it) => {
      if (!it) return;
      if (it.id) it.id = mapId(it.id);
      if (Array.isArray(it.finishes)) {
        it.finishes = it.finishes.map((f) => (f && f.id ? { ...f, id: prefix + f.id } : f));
      }
      if (it.link) it.link = mapId(it.link);
      if (it.op && it.op.target) it.op.target = mapId(it.op.target);
      if (it.p) {
        if (it.p.target) it.p.target = mapId(it.p.target);
        if (it.p.wrapId) it.p.wrapId = mapId(it.p.wrapId);
        if (Array.isArray(it.p.features)) it.p.features = it.p.features.map(mapId);
        if (it.p.sketch && it.p.sketch.planeRef && it.p.sketch.planeRef.id) {
          it.p.sketch.planeRef.id = mapId(it.p.sketch.planeRef.id);
        }
        if (it.p.toFace && it.p.toFace.id) it.p.toFace.id = mapId(it.p.toFace.id);
        if (it.p.path3d && Array.isArray(it.p.path3d.bind)) {
          for (const b of it.p.path3d.bind) {
            if (b && b.id) b.id = mapId(b.id);
          }
        }
      }
    });
    return cloned;
  }

  function canonPartState(children, rollback, ref) {
    return JSON.stringify([
      children || [],
      rollback != null ? rollback : null,
      (ref && ref.name) || '',
      (ref && ref.params) || [],
      (ref && ref.tables) || [],
      (ref && ref.material) || null,
    ]);
  }

  function applyPartDocToItem(it, partDoc, asmDoc) {
    if (!it || !partDoc) return false;
    const prefix = it.id + '__';
    const children = remapIds(partDoc.items || [], prefix);
    const rollback = partDoc.rollback != null ? partDoc.rollback : null;
    const nextRef = {
      docId: partDoc.id,
      name: partDoc.name || 'Bauteil',
      rev: partDoc.modified || 0,
      params: deepClone(partDoc.params || []),
      tables: deepClone(partDoc.tables || []),
      material: (partDoc.settings && partDoc.settings.material) || null,
    };
    const sameContent = canonPartState(children, rollback, nextRef) === canonPartState(it.children, it.rollback, it.partRef);
    if (sameContent && it.partRef && it.partRef.rev === nextRef.rev) return false;

    const prevRefName = it.partRef && it.partRef.name;
    it.children = children;
    if (rollback != null) it.rollback = rollback;
    else delete it.rollback;
    if (!it.name || it.name === prevRefName) it.name = nextRef.name;
    if (!it.colorSet) {
      const firstSolid = children.find((c) => c && c.role !== 'hole' && c.color);
      if (firstSolid) it.color = firstSolid.color;
    }
    it.partRef = nextRef;
    if (asmDoc && Array.isArray(partDoc.fonts) && partDoc.fonts.length) {
      asmDoc.fonts = Array.isArray(asmDoc.fonts) ? asmDoc.fonts : [];
      for (const f of partDoc.fonts) {
        if (f && f.id && !asmDoc.fonts.some((x) => x.id === f.id)) asmDoc.fonts.push(deepClone(f));
      }
    }
    return true;
  }

  function stripPrefix(items, prefix) {
    const cloned = deepClone(Array.isArray(items) ? items : []);
    const strip = (id) => (typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : id);
    Model.walk(cloned, (it) => {
      if (!it) return;
      if (it.id) it.id = strip(it.id);
      if (Array.isArray(it.finishes)) {
        it.finishes = it.finishes.map((f) => (f && f.id ? { ...f, id: strip(f.id) } : f));
      }
      if (it.link) it.link = strip(it.link);
      if (it.op && it.op.target) it.op.target = strip(it.op.target);
      if (it.p) {
        if (it.p.target) it.p.target = strip(it.p.target);
        if (it.p.wrapId) it.p.wrapId = strip(it.p.wrapId);
        if (Array.isArray(it.p.features)) it.p.features = it.p.features.map(strip);
        if (it.p.sketch && it.p.sketch.planeRef && it.p.sketch.planeRef.id) {
          it.p.sketch.planeRef.id = strip(it.p.sketch.planeRef.id);
        }
        if (it.p.toFace && it.p.toFace.id) it.p.toFace.id = strip(it.p.toFace.id);
        if (it.p.path3d && Array.isArray(it.p.path3d.bind)) {
          for (const b of it.p.path3d.bind) {
            if (b && b.id) b.id = strip(b.id);
          }
        }
      }
    });
    return cloned;
  }

  function reconstructPartDoc(it) {
    const ref = it.partRef || {};
    const doc = Model.newDoc(ref.name || Model.label(it), { docType: 'part' });
    if (ref.docId) doc.id = ref.docId;
    doc.params = deepClone(ref.params || []);
    doc.tables = deepClone(ref.tables || []);
    if (ref.material) doc.settings.material = ref.material;
    if (it.rollback != null) doc.rollback = it.rollback;
    doc.items = stripPrefix(it.children || [], it.id + '__');
    return Model.migrate(doc);
  }

  function hasCycle(asmDocId, partDoc) {
    if (!asmDocId || !partDoc) return false;
    if (partDoc.id === asmDocId) return true;
    let found = false;
    Model.walk(partDoc.items || [], (it) => {
      if (isPartRef(it) && it.partRef.docId === asmDocId) { found = true; return false; }
    });
    return found;
  }

  function freeSpotFor(boxArr) {
    let x = 0, y = 0;
    const hw = boxArr ? Math.max(5, (boxArr[3] - boxArr[0]) / 2) : 15;
    const boxes = [];
    for (const n of Viewer.nodes.values()) {
      if (n.role !== 'hole' && n.obj.visible && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox) {
        boxes.push(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
      }
    }
    if (!boxes.length) return [x, y];
    const hits = (px) => boxes.some((b) => px - hw < b.max.x + 1 && px + hw > b.min.x - 1);
    if (!hits(x)) return [x, y];
    let right = -Infinity;
    for (const b of boxes) right = Math.max(right, b.max.x);
    return [Math.ceil((right + 10 + hw) / 5) * 5, 0];
  }

  async function resolvePartDoc(partDocOrId) {
    if (!partDocOrId) return null;
    if (typeof partDocOrId === 'object') return partDocOrId;
    const open = (App.tabs || []).find((t) => t.docId === partDocOrId);
    if (open) {
      const d = App.getTabDoc(open.tabId);
      if (d) return deepClone(d);
    }
    return await App.loadStored(partDocOrId);
  }

  async function insertPart(partDocOrId, opts = {}) {
    const partDoc = await resolvePartDoc(partDocOrId);
    if (!partDoc) return null;
    if (hasCycle(App.doc && App.doc.id, partDoc)) {
      UI.toast(T('asm.cycleErr'), { kind: 'bad' });
      return null;
    }
    if (typeof Store !== 'undefined' && Store.saveProject) {
      await Store.saveProject(partDoc, Model.countItems(partDoc), { keepLast: true });
    }
    const inst = Model.newItem('group', {}, { name: opts.name || partDoc.name || T('asm.partDefault') });
    inst.comp = true;
    inst.partRef = { docId: partDoc.id, name: partDoc.name || 'Bauteil', rev: 0, params: [], tables: [] };
    applyPartDocToItem(inst, partDoc, App.doc);
    if (Array.isArray(opts.pos)) {
      inst.t.x = opts.pos[0] || 0;
      inst.t.y = opts.pos[1] || 0;
      if (opts.pos[2] != null) inst.t.z = opts.pos[2];
    } else {
      const lb = Model.itemLocalBox(inst, Model.scopeVars(Model.vars(App.doc).v, inst.partRef));
      const [x, y] = freeSpotFor(lb);
      inst.t.x = x; inst.t.y = y;
    }
    const emptyBefore = !App.doc.items.length;
    App.change(T('asm.insertedUndo', { name: inst.name }), (doc) => {
      if (opts.asAssembly) doc.docType = 'assembly';
      doc.items.push(inst);
    });
    if (emptyBefore) App.fitAfterBuild();
    App.select([inst.id]);
    return inst;
  }

  function insertPartDialog() {
    const openParts = (App.tabs || [])
      .filter((t) => t.docId && t.docId !== App.doc.id && t.docType !== 'assembly' && t.itemCount > 0)
      .map((t) => ({ id: t.docId, name: t.name, n: t.itemCount, open: true }));
    const seen = new Set(openParts.map((x) => x.id));
    const stored = App.recentProjects().filter((r) => r.id !== App.doc.id && r.n > 0 && !seen.has(r.id));
    const list = [...openParts, ...stored];

    const body = h('div', { id: 'asm-insert-dialog', style: { display: 'grid', gap: '10px' } });
    body.append(h('div', { class: 'hint-box' }, T('asm.insertHint')));
    let modalRef = null;
    if (!list.length) {
      body.append(h('div', { class: 'empty-tree' }, T('asm.insertEmpty')));
    } else {
      const box = h('div', { class: 'mini-list' });
      for (const entry of list) {
        const row = h('button', {
          type: 'button',
          class: 'btn',
          style: { justifyContent: 'space-between', width: '100%' },
          dataset: { partDocId: entry.id },
        });
        const left = h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } });
        left.innerHTML = icon('parts') + esc(entry.name);
        const right = h('span', { class: 'sub mono' }, entry.open ? T('asm.openBadge') : `${entry.n}`);
        row.append(left, right);
        row.onclick = async () => {
          if (modalRef) modalRef.close();
          await insertPart(entry.id, { asAssembly: true });
        };
        box.append(row);
      }
      body.append(box);
    }
    modalRef = UI.modal({
      title: T('asm.insertTitle'),
      body,
      actions: [{ label: T('common.cancel'), value: false }],
    });
    return modalRef;
  }

  async function openPartTab(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f) return null;
    const asmTabId = App.activeTabId;
    const asmDocId = App.doc.id;
    let it = f.item;

    if (!isPartRef(it)) {
      const partDoc = Model.newDoc(Model.label(it), { docType: 'part' });
      if (App.doc.settings && App.doc.settings.material) partDoc.settings.material = App.doc.settings.material;
      if (Array.isArray(App.doc.fonts) && App.doc.fonts.length) partDoc.fonts = deepClone(App.doc.fonts);
      if (it.kind === 'group') {
        partDoc.items = deepClone(it.children || []);
        if (it.rollback != null) partDoc.rollback = it.rollback;
      } else {
        const single = deepClone(it);
        single.t = Model.T0();
        delete single.op;
        partDoc.items = [single];
      }
      if (typeof Store !== 'undefined' && Store.saveProject) {
        await Store.saveProject(partDoc, Model.countItems(partDoc), { keepLast: true });
      }
      const nextGroup = Model.newItem('group', {}, { name: Model.label(it), color: it.color, role: 'solid' });
      nextGroup.id = it.id;
      nextGroup.t = { ...Model.T0(), ...(it.t || {}) };
      if (it.colorSet) nextGroup.colorSet = true;
      nextGroup.comp = true;
      nextGroup.partRef = { docId: partDoc.id, name: partDoc.name, rev: 0, params: [], tables: [] };
      applyPartDocToItem(nextGroup, partDoc, App.doc);
      App.change(T('asm.convertedUndo', { name: nextGroup.name }), (doc) => {
        const cur = Model.find(doc, it.id);
        if (!cur) return false;
        cur.list[cur.index] = nextGroup;
      });
      it = nextGroup;
    }

    const partDocId = it.partRef.docId;
    returnTargets.set(partDocId, { asmTabId, asmDocId, itemId: it.id });
    try { await App.autosave.flush(); } catch (_) {}

    const existing = (App.tabs || []).find((t) => t.docId === partDocId);
    if (existing) {
      App.switchTab(existing.tabId);
      return existing.tabId;
    }
    let partDoc = await App.loadStored(partDocId);
    if (!partDoc) {
      partDoc = reconstructPartDoc(it);
      if (typeof Store !== 'undefined' && Store.saveProject) {
        await Store.saveProject(partDoc, Model.countItems(partDoc), { keepLast: true });
      }
    }
    const tid = App.openTab(partDoc, { saved: true });
    UI.toast(T('asm.openedToast', { name: partDoc.name }), { icon: 'parts', ms: 3500 });
    return tid;
  }

  function assembliesReferencing(partDocId) {
    if (!partDocId) return [];
    const out = [];
    for (const t of App.tabs || []) {
      if (!t.docId || t.docId === partDocId) continue;
      const d = App.getTabDoc(t.tabId);
      if (!d) continue;
      let hit = false;
      Model.walk(d.items || [], (it) => {
        if (isPartRef(it) && it.partRef.docId === partDocId) { hit = true; return false; }
      });
      if (hit) out.push({ tabId: t.tabId, docId: t.docId, name: t.name });
    }
    return out;
  }

  function syncPartDoc(partDoc) {
    if (!partDoc || !partDoc.id) return { updatedTabs: 0, updatedItems: 0 };
    let updatedTabs = 0, updatedItems = 0;
    for (const t of App.tabs || []) {
      if (!t.docId || t.docId === partDoc.id) continue;
      let hit = 0;
      const changed = App.updateTabDoc(t.tabId, (doc) => {
        let ch = false;
        Model.walk(doc.items || [], (it) => {
          if (isPartRef(it) && it.partRef.docId === partDoc.id) {
            if (applyPartDocToItem(it, partDoc, doc)) { ch = true; hit++; }
          }
        });
        return ch;
      });
      if (changed) { updatedTabs++; updatedItems += hit; }
    }
    return { updatedTabs, updatedItems };
  }

  async function syncCurrentAssembly(opts = {}) {
    if (!App.doc) return 0;
    const targetDocId = App.doc.id;
    const targetTabId = App.activeTabId;
    const needed = new Set();
    Model.walk(App.doc.items || [], (it) => {
      if (isPartRef(it)) needed.add(it.partRef.docId);
    });
    if (!needed.size) return 0;
    const docs = new Map();
    for (const pid of needed) {
      const p = await resolvePartDoc(pid);
      if (p) docs.set(pid, p);
    }
    if (!App.doc || App.doc.id !== targetDocId || App.activeTabId !== targetTabId) return 0;
    let updated = 0;
    App.updateTabDoc(targetTabId, (doc) => {
      let ch = false;
      Model.walk(doc.items || [], (it) => {
        if (isPartRef(it)) {
          const pd = docs.get(it.partRef.docId);
          if (pd && applyPartDocToItem(it, pd, doc)) { ch = true; updated++; }
        }
      });
      return ch;
    });
    if (opts.announce && updated > 0) {
      UI.toast(T('asm.syncedToast', { n: updated }), { icon: 'check', ms: 2600 });
    }
    return updated;
  }

  async function savePart(opts = {}) {
    if (!App.doc) return { updatedTabs: 0, updatedItems: 0 };
    await App.saveNow();
    if (!opts.keepDirty) App.markClean();
    const res = syncPartDoc(App.doc);
    renderBanner();
    if (!opts.silent) {
      UI.toast(res.updatedTabs > 0 ? T('asm.savedAndSynced', { name: App.doc.name }) : T('asm.savedPart', { name: App.doc.name }), { icon: 'check', ms: 3000 });
    }
    return res;
  }

  async function returnToAssembly() {
    if (!App.doc) return false;
    const prefs = returnTargets.get(App.doc.id);
    const openTabs = App.tabs || [];
    const refs = assembliesReferencing(App.doc.id);
    let targetTabId = null;
    if (prefs) {
      const found = openTabs.find((t) => t.tabId === prefs.asmTabId || t.docId === prefs.asmDocId);
      if (found && refs.some((r) => r.tabId === found.tabId)) targetTabId = found.tabId;
    }
    if (!targetTabId && refs.length) targetTabId = refs[0].tabId;
    if (!targetTabId) {
      UI.toast(T('asm.noAsmOpen'), { icon: 'info' });
      return false;
    }
    await savePart({ silent: true });
    App.switchTab(targetTabId);
    return true;
  }

  function unlinkPart(itemId) {
    App.change(T('asm.unlinkUndo'), (doc) => {
      const f = Model.find(doc, itemId);
      if (!f || !isPartRef(f.item)) return false;
      delete f.item.partRef;
    });
  }

  function renderBanner() {
    if (banner) { banner.remove(); banner = null; }
    if (App.mode !== 'model' || App.ctx || App.iso || !App.doc || !App.doc.id) return;
    const refs = assembliesReferencing(App.doc.id);
    if (!refs.length) return;
    const pref = returnTargets.get(App.doc.id);
    const primary = (pref && refs.find((r) => r.tabId === pref.asmTabId || r.docId === pref.asmDocId)) || refs[0];

    banner = h('div', {
      id: 'asm-part-banner',
      class: 'ctx-banner asm-banner',
      role: 'status',
      'data-help': 'assemblyPartTab',
    });
    const ic = h('span'); ic.innerHTML = icon('parts');
    const lbl = h('span', null, T('asm.bannerTitle', { name: primary.name }) + (App.dirty ? T('asm.bannerDirty') : ''));
    const saveBtn = h('button', {
      type: 'button',
      id: 'asm-save-btn',
      class: App.dirty ? 'btn-save-hl' : '',
    }, T('asm.bannerSave'));
    saveBtn.onclick = () => savePart();
    const backBtn = h('button', { type: 'button', id: 'asm-back-btn' }, T('asm.bannerBack'));
    backBtn.onclick = () => returnToAssembly();
    banner.append(ic, lbl, saveBtn, backBtn);
    const ov = $('#overlay');
    if (ov) ov.append(banner);
  }

  function init() {
    App.on('clean', () => {
      if (App.doc) syncPartDoc(App.doc);
      renderBanner();
    });
    App.on('saved', ({ doc }) => {
      if (doc) syncPartDoc(doc);
    });
    App.on('beforeSwitchTab', ({ fromDoc, toTabId }) => {
      if (!fromDoc || !toTabId || fromDoc.id == null) return;
      App.updateTabDoc(toTabId, (doc) => {
        let ch = false;
        Model.walk(doc.items || [], (it) => {
          if (isPartRef(it) && it.partRef.docId === fromDoc.id) {
            if (applyPartDocToItem(it, fromDoc, doc)) ch = true;
          }
        });
        return ch;
      });
    });
    App.on('docLoaded', ({ doc }) => {
      renderBanner();
      if (doc) {
        let hasRef = false;
        Model.walk(doc.items || [], (it) => {
          if (isPartRef(it)) { hasRef = true; return false; }
        });
        if (hasRef) syncCurrentAssembly();
      }
    });
    App.on('doc', debounce(renderBanner, 30));
    App.on('tabs', renderBanner);
    App.on('mode', renderBanner);
    App.on('ctx', renderBanner);
    App.on('dirty', renderBanner);
  }

  return {
    init,
    isAssembly,
    isPartRef,
    canOpenInTab,
    newAssembly,
    insertPart,
    insertPartDialog,
    openPartTab,
    syncPartDoc,
    syncCurrentAssembly,
    savePart,
    returnToAssembly,
    unlinkPart,
    assembliesReferencing,
    renderBanner,
  };
})();
