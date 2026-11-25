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
    return !it || it.kind === 'transform' || it.kind === 'scale' || it.kind === 'deform' || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'deleteBody' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new'));
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
        if (Array.isArray(it.p.targets)) it.p.targets = it.p.targets.map(mapId);
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
    if (typeof Joints !== 'undefined' && Joints.invalidateCamCache) Joints.invalidateCamCache(it.id);
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
        if (Array.isArray(it.p.targets)) it.p.targets = it.p.targets.map(strip);
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

  function hasCycle(asmDocId, partDoc, seen = new Set()) {
    if (!asmDocId || !partDoc) return false;
    if (partDoc.id === asmDocId) return true;
    if (partDoc.id) {
      if (seen.has(partDoc.id)) return false;
      seen.add(partDoc.id);
    }
    let found = false;
    Model.walk(partDoc.items || [], (it) => {
      if (!it) return;
      if (isPartRef(it) && it.partRef.docId === asmDocId) { found = true; return false; }
      if (it.kind === 'ref' && it.p && it.p.docId) {
        if (it.p.docId === asmDocId) { found = true; return false; }
        const sub = Model.resolveDoc(it.p.docId);
        if (sub && hasCycle(asmDocId, sub, seen)) { found = true; return false; }
      }
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
        if (ch && typeof syncPatterns === 'function') syncPatterns(doc);
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
      if (ch && typeof syncPatterns === 'function') syncPatterns(doc);
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

  // ================= Benannte Stellungen (BG-20) =================
  const MOVABLE_KINDS = new Set(['rot', 'slide', 'cyl', 'planar', 'ball', 'slot']);
  const jointKind = (j) => (j && j.kind) || 'rot';
  function isMovableJoint(j, doc = App.doc) {
    return !!(j && MOVABLE_KINDS.has(jointKind(j)) && Model.find(doc, j.a) && Model.find(doc, j.b));
  }
  function movableJoints(doc = App.doc) {
    return ((doc && doc.joints) || []).filter((j) => isMovableJoint(j, doc));
  }
  function poses(doc = App.doc) {
    return (doc && Array.isArray(doc.poses)) ? doc.poses : [];
  }
  function captureJointState(j) {
    const k = jointKind(j);
    const st = { ang: round(Number(j.ang) || 0, 4) };
    if (k === 'cyl' || k === 'slot') st.pos = round(Number(j.pos) || 0, 4);
    else if (k === 'planar') { st.u = round(Number(j.u) || 0, 4); st.v = round(Number(j.v) || 0, 4); }
    else if (k === 'ball') { st.rx = round(Number(j.rx) || 0, 4); st.ry = round(Number(j.ry) || 0, 4); }
    return st;
  }
  function capturePoseStates(doc = App.doc) {
    const out = {};
    for (const j of movableJoints(doc)) out[j.id] = captureJointState(j);
    return out;
  }
  function dofsOfKind(k) {
    if (k === 'cyl' || k === 'slot') return ['ang', 'pos'];
    if (k === 'planar') return ['u', 'v', 'ang'];
    if (k === 'ball') return ['rx', 'ry', 'ang'];
    return ['ang'];
  }
  function isPoseActive(ps, doc = App.doc) {
    if (!ps || !ps.states || typeof ps.states !== 'object') return false;
    let matched = 0;
    for (const j of movableJoints(doc)) {
      const saved = ps.states[j.id];
      if (!saved || typeof saved !== 'object') continue;
      matched++;
      const cur = captureJointState(j);
      for (const d of dofsOfKind(jointKind(j))) {
        const sv = Number(saved[d]);
        const cv = Number(cur[d]);
        if (Number.isFinite(sv) && Math.abs(sv - cv) > 1e-3) return false;
      }
    }
    return matched > 0;
  }
  function activePose(doc = App.doc) {
    return poses(doc).find((ps) => isPoseActive(ps, doc)) || null;
  }
  function poseSummary(ps, doc = App.doc) {
    if (!ps || !ps.states || typeof ps.states !== 'object') return '—';
    const present = movableJoints(doc).filter((j) => ps.states[j.id] && typeof ps.states[j.id] === 'object');
    if (!present.length) return '—';
    const fmtJointVal = (j, s) => {
      const k = jointKind(j);
      if (k === 'slide') return Units.fmtLenU(Number(s.ang) || 0, 1);
      if (k === 'cyl' || k === 'slot') return `${fmtAngleU(Number(s.ang) || 0)} · ${Units.fmtLenU(Number(s.pos) || 0, 1)}`;
      if (k === 'planar') return `${Units.fmtLen(Number(s.u) || 0, 1)}/${Units.fmtLen(Number(s.v) || 0, 1)} ${Units.label()}`;
      if (k === 'ball') return `${fmtAngle(Number(s.rx) || 0)}/${fmtAngle(Number(s.ry) || 0)}/${fmtAngleU(Number(s.ang) || 0)}`;
      return fmtAngleU(Number(s.ang) || 0);
    };
    if (present.length === 1) return fmtJointVal(present[0], ps.states[present[0].id]);
    if (present.length === 2 && present.every((j) => jointKind(j) === 'rot' || jointKind(j) === 'slide')) {
      return `${fmtJointVal(present[0], ps.states[present[0].id])} · ${fmtJointVal(present[1], ps.states[present[1].id])}`;
    }
    return T('asm.poseJointCount', { n: present.length });
  }
  function findPose(idOrName, doc = App.doc) {
    const key = String(idOrName || '').trim();
    if (!key) return null;
    const list = poses(doc);
    return list.find((ps) => ps.id === key) || list.find((ps) => ps.name.toLowerCase() === key.toLowerCase()) || null;
  }
  function savePose(name, opts = {}) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const states = capturePoseStates(App.doc);
    if (!Object.keys(states).length) {
      if (!opts.silent) UI.toast(T('asm.poseNoJointsSave'), { icon: 'info' });
      return null;
    }
    let savedEntry = null;
    App.change(T('asm.poseSavedUndo', { name: clean }), (doc) => {
      doc.poses = Array.isArray(doc.poses) ? doc.poses : [];
      const low = clean.toLowerCase();
      let idx = opts.id ? doc.poses.findIndex((p) => p.id === opts.id) : -1;
      if (idx < 0) idx = doc.poses.findIndex((p) => p && typeof p.name === 'string' && p.name.toLowerCase() === low);
      if (idx >= 0) {
        doc.poses[idx] = { ...doc.poses[idx], name: clean, states };
        savedEntry = doc.poses[idx];
      } else {
        savedEntry = { id: uid('ps'), name: clean, states };
        doc.poses.push(savedEntry);
      }
    });
    if (!opts.silent && savedEntry) {
      UI.toast(T('asm.poseSavedToast', { name: savedEntry.name }), { icon: 'check', ms: 2200 });
    }
    return savedEntry;
  }
  function updatePose(id, opts = {}) {
    const ps = findPose(id);
    if (!ps) return null;
    return savePose(ps.name, { ...opts, id: ps.id });
  }
  function renamePose(id, newName) {
    const clean = String(newName || '').trim();
    if (!clean) return false;
    const low = clean.toLowerCase();
    return App.change(T('asm.poseRenamedUndo', { name: clean }), (doc) => {
      const list = Array.isArray(doc.poses) ? doc.poses : [];
      const ps = list.find((p) => p.id === id);
      if (!ps) return false;
      if (list.some((p) => p.id !== id && p.name && p.name.toLowerCase() === low)) return false;
      ps.name = clean;
      return true;
    }) !== false;
  }
  function removePose(id) {
    const ps = findPose(id);
    if (!ps) return false;
    const ok = App.change(T('asm.poseRemovedUndo', { name: ps.name }), (doc) => {
      doc.poses = (doc.poses || []).filter((p) => p.id !== ps.id);
      return true;
    }) !== false;
    if (ok) UI.toast(T('asm.poseRemovedToast', { name: ps.name }), { icon: 'info', ms: 2000 });
    return ok;
  }
  function applyPose(idOrName, opts = {}) {
    const ps = findPose(idOrName);
    if (!ps) return false;
    if (typeof Motion !== 'undefined' && Motion.stop) Motion.stop();
    if (typeof Joints !== 'undefined' && Joints.stopPlay) Joints.stopPlay();
    const mj = movableJoints(App.doc);
    if (!mj.some((j) => ps.states && ps.states[j.id])) {
      if (!opts.silent) UI.toast(T('asm.poseMissingJoints'), { icon: 'warn' });
      return false;
    }
    let res = null;
    App.change(T('asm.poseAppliedUndo', { name: ps.name }), (doc) => {
      res = Joints.applyStates(doc, ps.states, { live: doc === App.doc });
      if (!res || !res.ok || res.applied === 0) return false;
      return true;
    });
    if (res && res.jammed) {
      if (!opts.silent) UI.toast(T('asm.poseJamErr'), { kind: 'bad' });
      return false;
    }
    if (res && res.applied === 0 && res.locked > 0 && res.unchanged === 0) {
      if (!opts.silent) UI.toast(T('asm.poseLockedErr'), { icon: 'lock' });
      return false;
    }
    if (!opts.silent) UI.toast(T('asm.poseAppliedToast', { name: ps.name }), { icon: 'check', ms: 2000 });
    return true;
  }
  function defaultPoseName(doc = App.doc) {
    const existing = new Set(poses(doc).map((p) => p.name.toLowerCase()));
    const suggestions = String(T('asm.poseDefaults') || 'auf,zu,halb').split(',').map((s) => s.trim()).filter(Boolean);
    for (const s of suggestions) {
      if (!existing.has(s.toLowerCase())) return s;
    }
    return T('asm.poseDefaultN', { n: poses(doc).length + 1 });
  }
  async function promptSavePose() {
    if (!movableJoints().length) {
      UI.toast(T('asm.poseNoJointsSave'), { icon: 'info' });
      return null;
    }
    const n = await UI.prompt(T('asm.posePromptTitle'), T('asm.posePromptLabel'), defaultPoseName(), T('common.save'));
    if (!n || !n.trim()) return null;
    return savePose(n.trim());
  }
  function poseTreeSection() {
    const mjs = movableJoints();
    const psList = poses();
    if (!mjs.length && !psList.length) return null;
    const head = h('div', { class: 'section-h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } }, h('span', null, T('asm.posesHeading')));
    if (mjs.length) {
      const addBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-pose-save', 'data-help': 'namedPoses' });
      addBtn.innerHTML = icon('plus') + esc(T('asm.poseSaveShort'));
      const acts = h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } }, addBtn);
      if (typeof Motion !== 'undefined' && Motion.toggle) {
        const motBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-motion-tree', 'data-help': 'motionStudy' });
        motBtn.innerHTML = icon('play') + esc(T('motion.title'));
        motBtn.onclick = (e) => { e.stopPropagation(); Motion.toggle(); };
        acts.append(motBtn);
      }
      addBtn.onclick = (e) => { e.stopPropagation(); promptSavePose(); };
      head.append(acts);
    }
    const sec = h('div', { class: 'datum-tree pose-tree', id: 'pose-tree', 'data-help': 'namedPoses' }, head);
    if (!psList.length) {
      sec.append(h('div', { class: 'hint-box' }, T('asm.posesEmptyHint')));
      return sec;
    }
    for (const ps of psList) {
      const act = isPoseActive(ps);
      const row = h('div', {
        class: 'tree-row pose-row' + (act ? ' sel' : ''),
        tabindex: '0',
        role: 'button',
        'aria-pressed': act ? 'true' : 'false',
        dataset: { pose: ps.id, poseName: ps.name },
      });
      const ic = h('span', { class: 'swatch pose' }); ic.innerHTML = icon(act ? 'check' : 'hinge');
      const upd = h('button', { type: 'button', class: 'pose-upd', 'aria-label': T('asm.poseUpdateTip'), 'data-tip': T('asm.poseUpdateTip') });
      upd.innerHTML = icon('save');
      upd.onclick = (e) => { e.stopPropagation(); updatePose(ps.id); };
      const del = h('button', { type: 'button', class: 'j-del pose-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); removePose(ps.id); };
      row.append(
        ic,
        h('span', { class: 'nm', title: ps.name }, ps.name),
        h('span', { class: 'sub mono' }, poseSummary(ps)),
        h('span', { class: 'm-acts' }, upd, del)
      );
      row.onclick = () => applyPose(ps.id);
      row.addEventListener('keydown', (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyPose(ps.id); }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'play', label: T('asm.poseApplyMenu'), run: () => applyPose(ps.id) },
          { icon: 'save', label: T('asm.poseUpdateMenu'), run: () => updatePose(ps.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('asm.poseRenameTitle'), T('common.name'), ps.name, T('common.rename')); if (n && n.trim()) renamePose(ps.id, n); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => removePose(ps.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }
  function poseSection(ctx = 'proj') {
    const mjs = movableJoints();
    const psList = poses();
    if (!mjs.length && !psList.length) return null;
    const sec = h('div', { class: 'section pose-sec', id: ctx + '-poses-sec', 'data-help': 'namedPoses' }, h('div', { class: 'section-h' }, T('asm.posesHeading')));
    if (psList.length) {
      const chips = h('div', { class: 'pose-chips' });
      for (const ps of psList) {
        const act = isPoseActive(ps);
        const btn = h('button', {
          type: 'button',
          class: 'btn small pose-chip' + (act ? ' primary' : ''),
          'aria-pressed': act ? 'true' : 'false',
          dataset: { poseApply: ps.id, poseName: ps.name },
        }, h('span', { class: 'pose-chip-nm' }, ps.name), h('span', { class: 'sub mono' }, poseSummary(ps)));
        btn.onclick = () => applyPose(ps.id);
        chips.append(btn);
      }
      sec.append(chips);
    } else {
      sec.append(h('div', { class: 'hint-box' }, T('asm.posesEmptyHint')));
    }
    if (mjs.length) {
      const inp = h('input', {
        type: 'text',
        id: ctx + '-pose-name',
        class: 'pose-name-inp',
        placeholder: T('asm.poseNamePh'),
        'aria-label': T('asm.posePromptLabel'),
        autocomplete: 'off',
        spellcheck: 'false',
      });
      const saveBtn = h('button', { type: 'button', class: 'btn small', id: ctx + '-pose-save' });
      saveBtn.innerHTML = icon('plus') + esc(T('asm.poseSaveShort'));
      const doSave = () => {
        const nm = inp.value.trim();
        if (nm) { savePose(nm); inp.value = ''; }
        else promptSavePose();
      };
      saveBtn.onclick = doSave;
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
      sec.append(h('div', { class: 'pose-save-row' }, inp, saveBtn));
    }
    return sec;
  }

  function motionSection(ctx = 'proj') {
    if (typeof Motion === 'undefined') return null;
    const mjs = movableJoints();
    if (!isAssembly() && !mjs.length) return null;
    const st = Motion.getStudy();
    const sec = h('div', { class: 'section pro motion-sec', id: ctx + '-motion-sec', 'data-help': 'motionStudy' },
      h('div', { class: 'section-h' }, T('motion.title'))
    );
    const btn = h('button', { type: 'button', class: 'btn small' + (Motion.active ? ' primary' : ''), id: 'btn-motion-open' });
    btn.innerHTML = icon(Motion.active ? 'close' : 'play') + esc(Motion.active ? T('motion.closeBtn') : T('motion.openBtn'));
    btn.onclick = () => { Motion.toggle(); if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight({ preserveFocus: true }); };
    const info = h('span', { class: 'sub mono' }, T('motion.summary', { m: st.motors.length, t: st.traces.length }));
    sec.append(h('div', { class: 'btn-row', style: { alignItems: 'center' } }, btn, info));
    return sec;
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
        if (ch && typeof syncPatterns === 'function') syncPatterns(doc);
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

  // ================= Explosions-Schritte (BG-19) =================
  const EXPLODE_DIRS = {
    '+X': [1, 0, 0],
    '-X': [-1, 0, 0],
    '+Y': [0, 1, 0],
    '-Y': [0, -1, 0],
    '+Z': [0, 0, 1],
    '-Z': [0, 0, -1],
  };

  function normalizeExplodeDir(dir) {
    if (typeof dir === 'string') {
      const k = dir.trim().toUpperCase();
      if (EXPLODE_DIRS[k]) return EXPLODE_DIRS[k].slice();
      if (k === 'X') return [1, 0, 0];
      if (k === 'Y') return [0, 1, 0];
      if (k === 'Z') return [0, 0, 1];
    }
    let x = 0, y = 0, z = 0;
    if (Array.isArray(dir)) {
      x = Number(dir[0]) || 0;
      y = Number(dir[1]) || 0;
      z = Number(dir[2]) || 0;
    } else if (dir && typeof dir === 'object') {
      x = Number(dir.x) || 0;
      y = Number(dir.y) || 0;
      z = Number(dir.z) || 0;
    }
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return [0, 0, 1];
    return [x / len, y / len, z / len];
  }

  function dirKeyOf(dir) {
    const v = normalizeExplodeDir(dir);
    for (const [k, d] of Object.entries(EXPLODE_DIRS)) {
      if (v[0] * d[0] + v[1] * d[1] + v[2] * d[2] > 0.999) return k;
    }
    return 'custom';
  }

  function dirLabelOf(dir) {
    const k = dirKeyOf(dir);
    if (k !== 'custom') return k;
    const v = normalizeExplodeDir(dir);
    const f = (n) => (Math.round(n * 100) / 100).toString().replace('.', ',');
    return `(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;
  }

  function explodeSteps(doc = App.doc) {
    return Array.isArray(doc && doc.explodeSteps) ? doc.explodeSteps : [];
  }

  function explodeParts(doc = App.doc) {
    if (!doc) return [];
    const out = [];
    for (const it of Model.activeItems(doc)) {
      if (!it || it.hidden || it.role === 'hole' || isStepMod(it)) continue;
      if (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)) continue;
      out.push({ id: it.id, name: Model.label(it) });
    }
    return out;
  }

  function addExplodeStep(opts = {}) {
    const parts = explodeParts(App.doc);
    const validIds = new Set(parts.map((p) => p.id));
    let partIds = [];
    if (Array.isArray(opts.partIds)) {
      partIds = opts.partIds.filter((id) => typeof id === 'string' && validIds.has(id));
    } else if (typeof opts.partId === 'string' && validIds.has(opts.partId)) {
      partIds = [opts.partId];
    } else if (Array.isArray(App.sel) && App.sel.length) {
      for (const sid of App.sel) {
        const top = Model.topOf(App.doc, sid);
        if (top && validIds.has(top.id) && !partIds.includes(top.id)) partIds.push(top.id);
      }
    }
    if (!partIds.length && parts.length) {
      const used = new Set();
      for (const s of explodeSteps(App.doc)) {
        for (const id of (s.partIds || [])) used.add(id);
      }
      const next = parts.find((p) => !used.has(p.id)) || parts[0];
      if (next) partIds = [next.id];
    }
    if (!partIds.length) {
      UI.toast('Bitte zuerst ein Teil wählen.', { icon: 'info' });
      return null;
    }
    const dir = normalizeExplodeDir(opts.dir || '+Z');
    const rawDist = opts.dist != null ? Number(opts.dist) : 30;
    const dist = Math.max(0, Number.isFinite(rawDist) ? rawDist : 30);
    const id = uid('ex');
    const step = { id, name: typeof opts.name === 'string' ? opts.name : '', partIds: [...new Set(partIds)], dir, dist };
    App.change('Explosions-Schritt hinzugefügt', (doc) => {
      if (!Array.isArray(doc.explodeSteps)) doc.explodeSteps = [];
      doc.explodeSteps.push(deepClone(step));
    });
    return explodeSteps(App.doc).find((s) => s.id === id) || step;
  }

  function updateExplodeStep(stepId, patch = {}) {
    if (!stepId) return false;
    let changed = false;
    App.change('Explosions-Schritt geändert', (doc) => {
      const steps = Array.isArray(doc.explodeSteps) ? doc.explodeSteps : [];
      const s = steps.find((x) => x && x.id === stepId);
      if (!s) return false;
      if (typeof patch.name === 'string') { s.name = patch.name; changed = true; }
      if (Array.isArray(patch.partIds)) {
        const nextIds = [...new Set(patch.partIds.filter((id) => typeof id === 'string' && id))];
        if (nextIds.length) { s.partIds = nextIds; changed = true; }
      } else if (typeof patch.partId === 'string' && patch.partId) {
        s.partIds = [patch.partId];
        changed = true;
      }
      if (patch.dir !== undefined) { s.dir = normalizeExplodeDir(patch.dir); changed = true; }
      if (patch.dist !== undefined) {
        const d = Number(patch.dist);
        if (Number.isFinite(d)) { s.dist = Math.max(0, d); changed = true; }
      }
      return changed;
    });
    return changed;
  }

  function removeExplodeStep(stepId) {
    if (!stepId) return false;
    let removed = false;
    App.change('Explosions-Schritt gelöscht', (doc) => {
      if (!Array.isArray(doc.explodeSteps)) return false;
      const idx = doc.explodeSteps.findIndex((x) => x && x.id === stepId);
      if (idx < 0) return false;
      doc.explodeSteps.splice(idx, 1);
      removed = true;
    });
    return removed;
  }

  function moveExplodeStep(stepId, delta) {
    if (!stepId || !delta) return false;
    let moved = false;
    App.change('Explosions-Reihenfolge geändert', (doc) => {
      if (!Array.isArray(doc.explodeSteps)) return false;
      const idx = doc.explodeSteps.findIndex((x) => x && x.id === stepId);
      const next = idx + (delta < 0 ? -1 : 1);
      if (idx < 0 || next < 0 || next >= doc.explodeSteps.length) return false;
      const [item] = doc.explodeSteps.splice(idx, 1);
      doc.explodeSteps.splice(next, 0, item);
      moved = true;
    });
    return moved;
  }

  function clearExplodeSteps() {
    if (!explodeSteps(App.doc).length) return false;
    App.change('Explosions-Schritte gelöscht', (doc) => {
      doc.explodeSteps = [];
    });
    return true;
  }

  function evalExplodeSteps(progress, doc = App.doc) {
    const f = clamp(Number(progress) || 0, 0, 1);
    const steps = explodeSteps(doc);
    const n = steps.length;
    const offsets = new Map();
    const paths = new Map();
    const stepProgress = [];
    if (!n) return { offsets, paths, stepProgress, activeStep: -1 };
    let activeStep = -1;
    for (let k = 0; k < n; k++) {
      const step = steps[k] || {};
      const u = clamp(f * n - k, 0, 1);
      stepProgress.push(u);
      if (activeStep < 0 && u > 1e-4 && u < 1 - 1e-4) activeStep = k;
      if (u <= 1e-4) continue;
      const dir = normalizeExplodeDir(step.dir);
      const dist = Math.max(0, Number(step.dist) || 0);
      const pids = Array.isArray(step.partIds) ? step.partIds : [];
      for (const pid of pids) {
        if (!pid) continue;
        const prev = offsets.get(pid) || [0, 0, 0];
        const next = [prev[0] + dir[0] * dist * u, prev[1] + dir[1] * dist * u, prev[2] + dir[2] * dist * u];
        offsets.set(pid, next);
        let arr = paths.get(pid);
        if (!arr) { arr = [[0, 0, 0]]; paths.set(pid, arr); }
        const last = arr[arr.length - 1];
        if (Math.hypot(next[0] - last[0], next[1] - last[1], next[2] - last[2]) > 1e-4) {
          arr.push(next);
        }
      }
    }
    if (activeStep < 0 && f >= 1 - 1e-4) activeStep = n - 1;
    return { offsets, paths, stepProgress, activeStep };
  }

  // ================= Bohrung durch Stapel & Baugruppen-Schritte (BG-24, BG-25) =================
  function insertAtMarker(doc, step) {
    const at = doc.rollback != null ? clamp(doc.rollback, 0, doc.items.length) : doc.items.length;
    doc.items.splice(at, 0, step);
    if (doc.rollback != null) doc.rollback = at + 1;
  }

  function assemblyPartTargets(doc = App.doc, beforeItem = null) {
    if (!doc || !Array.isArray(doc.items)) return [];
    const idx = beforeItem ? doc.items.indexOf(beforeItem) : -1;
    const slice = idx >= 0 ? doc.items.slice(0, idx) : doc.items;
    return slice.filter((x) => x && !x.suppressed && x.role !== 'hole' && !isStepMod(x) && !(x.op && x.op.target));
  }

  function stackBoxOf(ids = null, doc = App.doc) {
    const list = Array.isArray(ids) && ids.length
      ? ids
      : assemblyPartTargets(doc).map((x) => x.id);
    const box = new THREE.Box3();
    for (const id of list) {
      const b = typeof Actions !== 'undefined' && Actions.worldBox ? Actions.worldBox(id) : null;
      if (b && !b.isEmpty()) box.union(b);
    }
    return box.isEmpty() ? null : box;
  }

  function normalizeStepDir(dir) {
    if (Array.isArray(dir) && dir.length >= 3) {
      const x = Number(dir[0]) || 0, y = Number(dir[1]) || 0, z = Number(dir[2]) || 0;
      const l = Math.hypot(x, y, z);
      if (l > 1e-6) return [round(x / l, 6), round(y / l, 6), round(z / l, 6)];
    }
    return [0, 0, -1];
  }

  function faceWorldPose(face) {
    if (!face || !face.info || face.info.t !== 'PLANE') return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const pt = Array.isArray(face.point) && face.point.length >= 3
      ? new THREE.Vector3(...face.point)
      : new THREE.Vector3(...(face.info.c || [0, 0, 0])).applyMatrix4(W);
    const nW = Array.isArray(face.normal) && face.normal.length >= 3
      ? new THREE.Vector3(...face.normal).normalize()
      : new THREE.Vector3(...(face.info.n || [0, 0, 1])).transformDirection(W).normalize();
    return {
      x: round(pt.x, 4),
      y: round(pt.y, 4),
      z: round(pt.z, 4),
      dir: normalizeStepDir([-nW.x, -nW.y, -nW.z]),
      nW: [round(nW.x, 6), round(nW.y, 6), round(nW.z, 6)],
    };
  }

  function defaultStackOrigin(dir, ids = null) {
    const d = normalizeStepDir(dir);
    const box = stackBoxOf(ids);
    if (!box) return { x: 0, y: 0, z: 0 };
    const cx = round((box.min.x + box.max.x) / 2, 4);
    const cy = round((box.min.y + box.max.y) / 2, 4);
    const cz = round((box.min.z + box.max.z) / 2, 4);
    const tx = d[0] > 0.5 ? box.min.x : d[0] < -0.5 ? box.max.x : cx;
    const ty = d[1] > 0.5 ? box.min.y : d[1] < -0.5 ? box.max.y : cy;
    const tz = d[2] > 0.5 ? box.min.z : d[2] < -0.5 ? box.max.z : cz;
    return { x: round(tx, 4), y: round(ty, 4), z: round(tz, 4) };
  }

  function stackHole(opts = {}) {
    if (App.ctx) { UI.toast(T('asm.exitPartCtxFirst'), { icon: 'info' }); return null; }
    const avail = assemblyPartTargets(App.doc);
    if (!avail.length) { UI.toast(T('asm.needPart'), { icon: 'info' }); return null; }
    const explicitTargets = Array.isArray(opts.targets) ? opts.targets.filter(Boolean) : [];
    const scope = opts.scope === 'selected' || (explicitTargets.length && opts.scope !== 'auto') ? 'selected' : 'auto';
    const targets = scope === 'selected'
      ? (explicitTargets.length ? explicitTargets : avail.map((x) => x.id))
      : [];
    const fp = opts.face ? faceWorldPose(opts.face) : null;
    const dir = normalizeStepDir(opts.dir || (fp && fp.dir) || [0, 0, -1]);
    const defOrigin = fp || defaultStackOrigin(dir, targets.length ? targets : null);
    const holeType = opts.holeType === 'through' || opts.holeType === 'blind' || opts.holeType === 'fit' ? opts.holeType : 'simple';
    const p = {
      holeType,
      d: opts.d ?? 6,
      size: typeof opts.size === 'string' && opts.size ? opts.size : 'M4',
      head: opts.head === 'countersunk' || opts.head === 'counterbore' ? opts.head : 'none',
      fit: opts.fit === 'fine' || opts.fit === 'coarse' || opts.fit === 'tap' ? opts.fit : 'medium',
      tipAngle: opts.tipAngle ?? 118,
      thru: opts.thru !== undefined ? !!opts.thru : holeType !== 'blind',
      depth: opts.depth ?? 20,
      x: opts.x ?? defOrigin.x,
      y: opts.y ?? defOrigin.y,
      z: opts.z ?? defOrigin.z,
      dir,
      scope,
      targets,
      printFit: typeof opts.printFit === 'string' ? opts.printFit : '',
    };
    let step = null;
    App.change(T('asm.stackHoleUndo'), (doc) => {
      step = Model.newItem('stackHole', p, { name: opts.name || T('kind.stackHole'), color: '#d6574c', role: 'solid' });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      if (!opts.silent) UI.toast(T('asm.stackHoleToast'), { icon: 'check' });
    }
    return step;
  }

  function startStackHole(opts = {}) {
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) {
      UI.toast(T('asm.proOnly'), { icon: 'info' });
      return null;
    }
    if (App.ctx) { UI.toast(T('asm.exitPartCtxFirst'), { icon: 'info' }); return null; }
    const avail = assemblyPartTargets(App.doc);
    if (!avail.length) { UI.toast(T('asm.needPart'), { icon: 'info' }); return null; }

    const face = opts.face || (typeof Actions !== 'undefined' && Actions.selectedFace ? Actions.selectedFace() : null);
    const fp = face && face.info && face.info.t === 'PLANE' ? faceWorldPose(face) : null;
    const selTargets = Array.isArray(opts.targets) && opts.targets.length
      ? opts.targets.slice()
      : App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter((id) => id && avail.some((x) => x.id === id));
    const initScope = opts.scope || (selTargets.length >= 2 ? 'selected' : 'auto');
    const dir = normalizeStepDir(opts.dir || (fp && fp.dir) || [0, 0, -1]);
    const defO = fp || defaultStackOrigin(dir, selTargets.length ? selTargets : null);

    const st = {
      holeType: opts.holeType || 'simple',
      d: opts.d ?? 6,
      size: opts.size || 'M4',
      head: opts.head || 'none',
      fit: opts.fit || 'medium',
      tipAngle: opts.tipAngle ?? 118,
      thru: opts.thru !== undefined ? !!opts.thru : true,
      depth: opts.depth ?? 20,
      x: opts.x ?? defO.x,
      y: opts.y ?? defO.y,
      z: opts.z ?? defO.z,
      dir,
      scope: initScope,
      targets: selTargets.length ? selTargets : avail.map((x) => x.id),
    };

    const wrap = h('div', { id: 'asm-stack-hole-dlg', style: { display: 'grid', gap: '10px' } });
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    let modalRef = null;

    const bindLive = (field, apply) => {
      const inp = field && field.querySelector ? field.querySelector('input') : null;
      if (!inp) return;
      inp.addEventListener('input', () => {
        const v = parseNum(inp.value);
        if (Number.isFinite(v)) apply(v);
      });
    };

    const draw = () => {
      body.innerHTML = '';
      const f1 = h('div', { class: 'fields' });
      f1.append(UI.selectField({
        id: 'asm-sh-type',
        label: T('asm.holeTypeLabel'),
        value: st.holeType,
        options: [
          ['simple', T('asm.holeTypeSimple')],
          ['through', T('asm.holeTypeThrough')],
          ['blind', T('asm.holeTypeBlind')],
          ['fit', T('asm.holeTypeFit')],
        ],
        onChange: (v) => {
          st.holeType = v;
          if (v === 'blind') st.thru = false;
          else st.thru = true;
          draw();
        },
      }));
      if (st.holeType === 'through') {
        const sizes = typeof threadSizesForNorm === 'function' ? threadSizesForNorm('metric') : ['M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'];
        if (!sizes.includes(st.size)) st.size = 'M4';
        f1.append(UI.selectField({
          id: 'asm-sh-size',
          label: T('asm.holeSizeLabel'),
          value: st.size,
          options: sizes,
          onChange: (v) => { st.size = v; },
        }));
      } else {
        const df = UI.numField({
          id: 'asm-sh-d',
          label: st.holeType === 'fit' ? T('asm.holeFitDLabel') : T('asm.holeDLabel'),
          value: st.d,
          min: 0.2,
          unit: 'mm',
          onCommit: (v) => { st.d = v; },
        });
        bindLive(df, (v) => { if (v > 0) st.d = v; });
        f1.append(df);
      }
      body.append(f1);

      if (st.holeType === 'through') {
        const f2 = h('div', { class: 'fields' });
        f2.append(
          UI.selectField({
            id: 'asm-sh-head',
            label: T('asm.holeHeadLabel'),
            value: st.head,
            options: [['none', T('asm.holeHeadNone')], ['countersunk', T('asm.holeHeadCsk')], ['counterbore', T('asm.holeHeadCb')]],
            onChange: (v) => { st.head = v; },
          }),
          UI.selectField({
            id: 'asm-sh-fit',
            label: T('asm.holeFitLabel'),
            value: st.fit,
            options: [['medium', T('asm.holeFitMed')], ['fine', T('asm.holeFitFine')], ['coarse', T('asm.holeFitCoarse')]],
            onChange: (v) => { st.fit = v; },
          })
        );
        body.append(f2);
      } else if (st.holeType === 'blind') {
        const tipOpts = typeof LIBMAP !== 'undefined' && LIBMAP.blindHole && LIBMAP.blindHole.params[2]
          ? LIBMAP.blindHole.params[2].options
          : [['118', '118° (Standardbohrer)'], ['180', '180° (flacher Boden)']];
        body.append(UI.selectField({
          id: 'asm-sh-tip',
          label: T('asm.holeTipLabel'),
          value: String(st.tipAngle ?? 118),
          options: tipOpts,
          onChange: (v) => { st.tipAngle = Number(v); },
        }));
      }

      if (st.holeType !== 'blind') {
        const thruChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'asm-sh-thru', checked: !!st.thru }), T('asm.holeThru'));
        thruChk.querySelector('input').onchange = (e) => { st.thru = e.target.checked; draw(); };
        body.append(thruChk);
      }
      if (!st.thru || st.holeType === 'blind') {
        const dpf = UI.numField({ id: 'asm-sh-depth', label: T('asm.holeDepthLabel'), value: st.depth, min: 0.2, unit: 'mm', onCommit: (v) => { st.depth = v; } });
        bindLive(dpf, (v) => { if (v > 0) st.depth = v; });
        body.append(dpf);
      }

      const fPos = h('div', { class: 'fields three' });
      const xf = UI.numField({ id: 'asm-sh-x', label: 'X', value: st.x, unit: 'mm', onCommit: (v) => { st.x = v; } });
      const yf = UI.numField({ id: 'asm-sh-y', label: 'Y', value: st.y, unit: 'mm', onCommit: (v) => { st.y = v; } });
      const zf = UI.numField({ id: 'asm-sh-z', label: 'Z', value: st.z, unit: 'mm', onCommit: (v) => { st.z = v; } });
      bindLive(xf, (v) => { st.x = v; });
      bindLive(yf, (v) => { st.y = v; });
      bindLive(zf, (v) => { st.z = v; });
      fPos.append(xf, yf, zf);
      body.append(fPos);

      const pickBtn = h('button', { type: 'button', class: 'btn small', id: 'asm-sh-pick' });
      pickBtn.innerHTML = icon('cursor') + esc(T('asm.holePickBtn'));
      pickBtn.onclick = () => {
        if (modalRef) modalRef.close(false);
        if (typeof Features !== 'undefined' && Features.pickStackHolePoint) {
          Features.pickStackHolePoint(null, (picked) => {
            startStackHole({ ...st, face: picked.face, x: picked.x, y: picked.y, z: picked.z, dir: picked.dir });
          });
        }
      };
      body.append(h('div', { class: 'btn-row' }, pickBtn));

      body.append(UI.selectField({
        id: 'asm-sh-scope',
        label: T('asm.scopeLabel'),
        value: st.scope,
        options: [['auto', T('asm.scopeAuto')], ['selected', T('asm.scopeSelected')]],
        onChange: (v) => { st.scope = v; draw(); },
      }));

      if (st.scope === 'selected') {
        const list = h('div', { class: 'mini-list', style: { maxHeight: '140px', overflowY: 'auto' } });
        for (const t of avail) {
          const chk = h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: st.targets.includes(t.id), dataset: { asmShTarget: t.id } }),
            Model.label(t));
          chk.querySelector('input').onchange = (e) => {
            if (e.target.checked) { if (!st.targets.includes(t.id)) st.targets.push(t.id); }
            else st.targets = st.targets.filter((id) => id !== t.id);
          };
          list.append(chk);
        }
        body.append(list);
      }
    };

    draw();
    wrap.append(body, h('div', { class: 'hint-box' }, T('asm.stackHoleHint')));
    modalRef = UI.modal({
      title: T('asm.stackHoleTitle'),
      body: wrap,
      actions: [
        { label: T('common.cancel'), value: false },
        { id: 'asm-sh-ok', label: T('asm.stackHoleCreate'), primary: true, value: true },
      ],
      onClose: (ok) => {
        if (!ok) return;
        const ae = document.activeElement;
        if (ae && wrap.contains(ae) && ae.tagName === 'INPUT') ae.blur();
        stackHole(st);
      },
    });
    return modalRef;
  }

  function defaultAsmCutSketch(opts = {}) {
    const box = stackBoxOf(opts.targets);
    const cx = box ? round((box.min.x + box.max.x) / 2, 4) : 0;
    const cy = box ? round((box.min.y + box.max.y) / 2, 4) : 0;
    const maxZ = box ? round(box.max.z, 4) : 0;
    const plane = opts.plane ? deepClone(opts.plane) : { o: [cx, cy, maxZ], x: [1, 0, 0], n: [0, 0, 1] };
    const ents = [];
    if (opts.shape === 'circle') {
      const r = Math.max(0.2, Number(opts.d ?? 12) / 2);
      ents.push({ id: uid('e'), type: 'circle', c: [0, 0], r });
    } else {
      const hw = Math.max(0.2, Number(opts.w ?? 12) / 2);
      const hh = Math.max(0.2, Number(opts.h ?? 12) / 2);
      ents.push({ id: uid('e'), type: 'rect', a: [-hw, -hh], b: [hw, hh] });
    }
    return { plane, ents, dims: [], cons: [] };
  }

  function asmCut(opts = {}) {
    if (App.ctx) { UI.toast(T('asm.exitPartCtxFirst'), { icon: 'info' }); return null; }
    const avail = assemblyPartTargets(App.doc);
    if (!avail.length) { UI.toast(T('asm.needPart'), { icon: 'info' }); return null; }
    const explicitTargets = Array.isArray(opts.targets) ? opts.targets.filter(Boolean) : [];
    const scope = opts.scope === 'selected' || (explicitTargets.length && opts.scope !== 'auto') ? 'selected' : 'auto';
    const targets = scope === 'selected'
      ? (explicitTargets.length ? explicitTargets : avail.map((x) => x.id))
      : [];
    const sketch = opts.sketch ? deepClone(opts.sketch) : defaultAsmCutSketch({ ...opts, targets });
    const dir = opts.dir === 'normal' || opts.dir === 'both' || opts.dir === 'two' ? opts.dir : 'reverse';
    const p = {
      sketch,
      dir,
      thru: opts.thru !== false,
      dist: opts.dist ?? 20,
      dist2: opts.dist2 ?? (opts.dist ?? 20),
      scope,
      targets,
    };
    let step = null;
    App.change(T('asm.cutUndo'), (doc) => {
      step = Model.newItem('asmCut', p, { name: opts.name || T('kind.asmCut'), color: '#d6574c', role: 'solid' });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      if (!opts.silent) UI.toast(T('asm.cutToast'), { icon: 'check' });
    }
    return step;
  }

  function asmCutFromSketch(sketch, opts = {}) {
    return asmCut({ ...opts, sketch });
  }

  function startAsmCut(opts = {}) {
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) {
      UI.toast(T('asm.proOnly'), { icon: 'info' });
      return null;
    }
    if (App.ctx) { UI.toast(T('asm.exitPartCtxFirst'), { icon: 'info' }); return null; }
    const avail = assemblyPartTargets(App.doc);
    if (!avail.length) { UI.toast(T('asm.needPart'), { icon: 'info' }); return null; }

    const face = opts.face || (typeof Actions !== 'undefined' && Actions.selectedFace ? Actions.selectedFace() : null);
    if (face && face.info && face.info.t === 'PLANE' && typeof Sketch !== 'undefined' && Sketch.startAsmCut) {
      const fr = Actions.faceFrame(face.info);
      const W = Model.worldMatrix(App.doc, face.id);
      const o = new THREE.Vector3(...fr.o).applyMatrix4(W).toArray().map((v) => round(v, 5));
      const x = new THREE.Vector3(...fr.x).transformDirection(W).normalize().toArray().map((v) => round(v, 6));
      const n = new THREE.Vector3(...fr.n).transformDirection(W).normalize().toArray().map((v) => round(v, 6));
      const selTargets = Array.isArray(opts.targets) && opts.targets.length
        ? opts.targets.slice()
        : App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter((id) => id && avail.some((x2) => x2.id === id) && id !== face.id);
      const scope = opts.scope || (Array.isArray(opts.targets) && opts.targets.length ? 'selected' : 'auto');
      Sketch.startAsmCut({
        plane: { o, x, n },
        W: new THREE.Matrix4(),
        targets: scope === 'selected' ? selTargets : (Array.isArray(opts.targets) ? opts.targets : null),
        scope,
        dir: 'reverse',
        thru: true,
      });
      return true;
    }
    if (typeof Features !== 'undefined' && Features.pickAsmCutFace) {
      Features.pickAsmCutFace((picked) => startAsmCut({ ...opts, face: picked }));
      return true;
    }
    return asmCut(opts);
  }

  function assemblySteps(doc = App.doc) {
    if (!doc || !Array.isArray(doc.items)) return [];
    return doc.items.filter((x) => x && (x.kind === 'stackHole' || x.kind === 'asmCut'));
  }

  function stepsSection(ctx = 'proj') {
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) return null;
    const parts = assemblyPartTargets(App.doc);
    const steps = assemblySteps(App.doc);
    if (!isAssembly() && parts.length < 2 && !steps.length) return null;
    const sec = h('div', { class: 'section pro asm-steps-sec', id: ctx + '-asm-steps-sec' },
      h('div', { class: 'section-h' }, T('asm.stepsHeading'))
    );
    const b1 = h('button', { type: 'button', class: 'btn small', id: 'btn-asm-stack-hole', 'data-help': 'stackHole' });
    b1.innerHTML = icon('holeWizard') + esc(T('asm.stackHoleShort'));
    b1.onclick = () => startStackHole();
    const b2 = h('button', { type: 'button', class: 'btn small', id: 'btn-asm-cut', 'data-help': 'asmCut' });
    b2.innerHTML = icon('boolSubtract') + esc(T('asm.cutShort'));
    b2.onclick = () => startAsmCut();
    sec.append(h('div', { class: 'btn-row' }, b1, b2));
    if (steps.length) {
      const list = h('div', { class: 'mini-list', style: { marginTop: '6px' } });
      for (const s of steps) {
        const res = typeof App.resolvedOf === 'function' ? App.resolvedOf(s.id) : null;
        const cnt = res && Array.isArray(res.cutIds) ? res.cutIds.length : 0;
        const row = h('button', { type: 'button', class: 'mini-row', style: { width: '100%', textAlign: 'left', cursor: 'pointer' }, dataset: { asmStep: s.id } },
          h('span', { class: 'grow' }, Model.label(s)),
          h('span', { class: 'mono muted' }, `${cnt} T.`));
        row.onclick = () => App.select([s.id]);
        list.append(row);
      }
      sec.append(list);
    }
    return sec;
  }

  // ================= Schrauben automatisch einsetzen (BG-23) =================
  const NORM_FASTENER_LIBS = new Set(['stdScrew', 'stdNut', 'stdWasher', 'stdPin', 'stdKey', 'stdBearing', 'stdSleeve']);
  function isNormFastener(it) {
    return !!(it && it.kind === 'part' && it.p && NORM_FASTENER_LIBS.has(it.p.lib));
  }
  function canonicalDir(v) {
    const d = v.clone();
    if (d.lengthSq() < 1e-12) return new THREE.Vector3(0, 0, 1);
    d.normalize();
    const ax = Math.abs(d.z) >= Math.abs(d.x) && Math.abs(d.z) >= Math.abs(d.y) ? 2 : Math.abs(d.y) >= Math.abs(d.x) ? 1 : 0;
    if (d.getComponent(ax) < 0) d.negate();
    return d;
  }
  function axisPerpDist(p1, p2, d) {
    const v = p1.clone().sub(p2);
    return v.addScaledVector(d, -v.dot(d)).length();
  }
  function quatFromZ(dir) {
    const d = dir.clone().normalize();
    if (d.z < -0.999999) return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  }
  function extractInternalCyls(data, W) {
    const faces = (data && data.faces) || [];
    const groups = (data && data.faceGroups) || [];
    const P = data && data.vertices;
    const N = data && data.normals;
    const T = data && data.triangles;
    if (!faces.length || !groups.length || !P || !N || !T) return [];

    const byFace = new Map();
    for (const g of groups) {
      let arr = byFace.get(g[2]);
      if (!arr) { arr = []; byFace.set(g[2], arr); }
      arr.push(g);
    }

    const raw = [];
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      if (!f || f.t !== 'CYLINDRE' || !Array.isArray(f.axis) || f.axis.length < 6 || !(f.r > 0.4)) continue;
      const fGroups = byFace.get(fi);
      if (!fGroups || !fGroups.length) continue;

      const oLoc = new THREE.Vector3(f.axis[0], f.axis[1], f.axis[2]);
      const dLoc = new THREE.Vector3(f.axis[3], f.axis[4], f.axis[5]);
      if (dLoc.lengthSq() < 1e-12) continue;
      dLoc.normalize();

      let dotSum = 0;
      const ptsW = [];
      for (const g of fGroups) {
        for (let i = g[0]; i < g[0] + g[1]; i++) {
          const vi = T[i] * 3;
          const vx = P[vi] - oLoc.x, vy = P[vi + 1] - oLoc.y, vz = P[vi + 2] - oLoc.z;
          const t = vx * dLoc.x + vy * dLoc.y + vz * dLoc.z;
          const rx = vx - dLoc.x * t, ry = vy - dLoc.y * t, rz = vz - dLoc.z * t;
          dotSum += N[vi] * rx + N[vi + 1] * ry + N[vi + 2] * rz;
          ptsW.push(new THREE.Vector3(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(W));
        }
      }
      if (dotSum >= 0 || !ptsW.length) continue; // nur Innenzylinder (Bohrungen)

      const oW = oLoc.clone().applyMatrix4(W);
      const dW = canonicalDir(dLoc.clone().transformDirection(W));
      const u = Math.abs(dW.z) < 0.9
        ? new THREE.Vector3(0, 0, 1).cross(dW).normalize()
        : new THREE.Vector3(1, 0, 0).cross(dW).normalize();
      const v = new THREE.Vector3().crossVectors(dW, u).normalize();

      let t0 = Infinity, t1 = -Infinity;
      let sectorMask = 0;
      for (const p of ptsW) {
        const rel = p.clone().sub(oW);
        const t = rel.dot(dW);
        if (t < t0) t0 = t;
        if (t > t1) t1 = t;
        const px = rel.dot(u), py = rel.dot(v);
        if (px * px + py * py > 1e-6) {
          let ang = Math.atan2(py, px);
          if (ang < 0) ang += Math.PI * 2;
          const sec = Math.min(11, Math.floor((ang / (Math.PI * 2)) * 12));
          sectorMask |= (1 << sec);
        }
      }
      if (!isFinite(t0) || !isFinite(t1) || t1 - t0 < 0.15) continue;
      raw.push({ fi, o: oW, d: dW, r: f.r, t0, t1, sectorMask, ptsW });
    }

    // Koaxiale Teilflächen (z. B. zwei 180°-Halbzylinder) zusammenfassen
    const merged = [];
    for (const c of raw) {
      let hit = null;
      for (const m of merged) {
        if (Math.abs(m.r - c.r) > 0.05) continue;
        if (Math.abs(m.d.dot(c.d)) < 0.995) continue;
        if (axisPerpDist(m.o, c.o, m.d) > 0.15) continue;
        const cT0 = c.t0 + c.o.clone().sub(m.o).dot(m.d);
        const cT1 = c.t1 + c.o.clone().sub(m.o).dot(m.d);
        if (cT1 < m.t0 - 0.2 || cT0 > m.t1 + 0.2) continue;
        hit = m;
        m.t0 = Math.min(m.t0, cT0);
        m.t1 = Math.max(m.t1, cT1);
        m.sectorMask |= c.sectorMask;
        break;
      }
      if (!hit) {
        merged.push({ o: c.o.clone(), d: c.d.clone(), r: c.r, t0: c.t0, t1: c.t1, sectorMask: c.sectorMask });
      }
    }

    const countBits = (mask) => {
      let k = 0;
      for (let b = 0; b < 12; b++) if (mask & (1 << b)) k++;
      return k;
    };

    const cyls = merged
      .filter((m) => countBits(m.sectorMask) >= 10 && m.t1 - m.t0 >= 0.3)
      .map((m) => ({
        o: m.o,
        d: m.d,
        r: m.r,
        t0: m.t0,
        t1: m.t1,
        len: m.t1 - m.t0,
        hasCounterbore: false,
        cbDepth: 0,
        cbSide: 0,
        hasCountersink: false,
        csSide: 0,
        isBlind: false,
        openSide: 0,
        absorbed: false,
      }));

    // Zylindersenkungen (Counterbore) erkennen und dem Hauptloch zuschlagen
    cyls.sort((a, b) => a.r - b.r);
    for (let i = 0; i < cyls.length; i++) {
      const small = cyls[i];
      if (small.absorbed) continue;
      const smallMatch = typeof matchScrewForHole === 'function' ? matchScrewForHole(small.r * 2) : null;
      if (!smallMatch) continue;
      const cbNomD = smallMatch.entry && smallMatch.entry.zylinderkopf && smallMatch.entry.zylinderkopf.senkung_d_mm;
      for (let j = i + 1; j < cyls.length; j++) {
        const big = cyls[j];
        if (big.absorbed) continue;
        if (big.r <= small.r * 1.1 || big.r > small.r * 2.35) continue;
        if (Math.abs(small.d.dot(big.d)) < 0.995) continue;
        if (axisPerpDist(small.o, big.o, small.d) > 0.2) continue;
        const bShift = big.o.clone().sub(small.o).dot(small.d);
        const bt0 = big.t0 + bShift, bt1 = big.t1 + bShift;
        const atTop = Math.abs(bt0 - small.t1) < 0.25 && bt1 > small.t1 + 0.2;
        const atBot = Math.abs(bt1 - small.t0) < 0.25 && bt0 < small.t0 - 0.2;
        if (!atTop && !atBot) continue;
        const bigDia = big.r * 2;
        const diaFitsCb = cbNomD ? (bigDia >= cbNomD * 0.75 && bigDia <= cbNomD * 1.35) : (big.len <= small.len * 1.6);
        if (!diaFitsCb) continue;
        big.absorbed = true;
        small.hasCounterbore = true;
        small.cbDepth = round(bt1 - bt0, 3);
        small.cbSide = atTop ? 1 : -1;
        small.t0 = Math.min(small.t0, bt0);
        small.t1 = Math.max(small.t1, bt1);
        small.len = small.t1 - small.t0;
        break;
      }
    }

    const holes = cyls.filter((c) => !c.absorbed);

    // Ebene Flächen & Kegel (Senkung / Bohrspitze) je Loch auswerten
    const faceBounds = (fi) => {
      const fGroups = byFace.get(fi);
      if (!fGroups || !fGroups.length) return null;
      const pts = [];
      for (const g of fGroups) {
        for (let i = g[0]; i < g[0] + g[1]; i++) {
          const vi = T[i] * 3;
          pts.push(new THREE.Vector3(P[vi], P[vi + 1], P[vi + 2]).applyMatrix4(W));
        }
      }
      return pts;
    };

    const cones = [];
    const planes = [];
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      if (!f) continue;
      if (f.t === 'CONE' && Array.isArray(f.axis) && f.axis.length >= 6) {
        const pts = faceBounds(fi);
        if (!pts || !pts.length) continue;
        const co = new THREE.Vector3(f.axis[0], f.axis[1], f.axis[2]).applyMatrix4(W);
        const cd = canonicalDir(new THREE.Vector3(f.axis[3], f.axis[4], f.axis[5]).transformDirection(W));
        cones.push({ o: co, d: cd, pts });
      } else if (f.t === 'PLANE' && Array.isArray(f.c) && Array.isArray(f.n)) {
        const pts = faceBounds(fi);
        if (!pts || !pts.length) continue;
        const pc = new THREE.Vector3(...f.c).applyMatrix4(W);
        const pn = new THREE.Vector3(...f.n).transformDirection(W).normalize();
        planes.push({ c: pc, n: pn, pts });
      }
    }

    for (const h0 of holes) {
      let minClose = false, maxClose = false;
      for (const cn of cones) {
        if (Math.abs(cn.d.dot(h0.d)) < 0.99 || axisPerpDist(cn.o, h0.o, h0.d) > 0.25) continue;
        let ct0 = Infinity, ct1 = -Infinity, maxR = 0;
        for (const p of cn.pts) {
          const rel = p.clone().sub(h0.o);
          const t = rel.dot(h0.d);
          const rr = rel.addScaledVector(h0.d, -t).length();
          if (t < ct0) ct0 = t;
          if (t > ct1) ct1 = t;
          if (rr > maxR) maxR = rr;
        }
        const nearTop = Math.abs(ct0 - h0.t1) < 0.35 || (ct0 <= h0.t1 + 0.25 && ct1 >= h0.t1 - 0.25);
        const nearBot = Math.abs(ct1 - h0.t0) < 0.35 || (ct0 <= h0.t0 + 0.25 && ct1 >= h0.t0 - 0.25);
        if (maxR > h0.r * 1.12) {
          if (nearTop) {
            h0.hasCountersink = true;
            h0.csSide = 1;
            h0.t1 = Math.max(h0.t1, ct1);
          } else if (nearBot) {
            h0.hasCountersink = true;
            h0.csSide = -1;
            h0.t0 = Math.min(h0.t0, ct0);
          }
          h0.len = h0.t1 - h0.t0;
        } else if (maxR <= h0.r + 0.25) {
          if (Math.abs(ct1 - h0.t0) < Math.max(0.3, h0.r * 1.2) || Math.abs(ct0 - h0.t0) < 0.3) minClose = true;
          if (Math.abs(ct0 - h0.t1) < Math.max(0.3, h0.r * 1.2) || Math.abs(ct1 - h0.t1) < 0.3) maxClose = true;
        }
      }
      for (const pl of planes) {
        if (Math.abs(pl.n.dot(h0.d)) < 0.99) continue;
        let maxR = 0, ptMin = Infinity, ptMax = -Infinity;
        for (const p of pl.pts) {
          const rel = p.clone().sub(h0.o);
          const t = rel.dot(h0.d);
          const rr = rel.addScaledVector(h0.d, -t).length();
          if (rr > maxR) maxR = rr;
          if (t < ptMin) ptMin = t;
          if (t > ptMax) ptMax = t;
        }
        if (maxR <= h0.r + 0.25) {
          const tMid = (ptMin + ptMax) / 2;
          if (Math.abs(tMid - h0.t0) < 0.2) minClose = true;
          if (Math.abs(tMid - h0.t1) < 0.2) maxClose = true;
        }
      }
      if (minClose !== maxClose) {
        h0.isBlind = true;
        h0.openSide = minClose ? 1 : -1;
      }
    }

    return holes;
  }

  function findHoles(doc = App.doc) {
    if (!doc || !Array.isArray(doc.items)) return [];
    const V = Model.vars(doc).v;
    const activeTop = Model.activeItems(doc);

    // Vorhandene Schrauben im Modell zum Schutz vor Doppel-Einsetzen sammeln
    const existingScrews = [];
    for (const it of activeTop) {
      if (!it || it.hidden || it.suppressed) continue;
      if (it.kind === 'part' && it.p && it.p.lib === 'stdScrew') {
        const W = Model.worldMatrix(doc, it.id);
        const o = new THREE.Vector3(0, 0, 0).applyMatrix4(W);
        const d = new THREE.Vector3(0, 0, 1).transformDirection(W).normalize();
        const L = Model.num(it.p.length, V, 10);
        existingScrews.push({ id: it.id, o, d, L, size: String(it.p.size || 'M3') });
      }
    }

    // Pro Körper alle passenden normgerechten Bohrungen einsammeln
    const rawHoles = [];
    for (const it of activeTop) {
      if (!it || it.hidden || it.suppressed || it.role === 'hole' || isStepMod(it) || isNormFastener(it)) continue;
      if (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)) continue;
      const res = typeof App !== 'undefined' && App.results ? App.results.get(it.id) : null;
      if (!res || !res.data) continue;
      const W = Model.worldMatrix(doc, it.id);
      const partName = Model.label(it);
      const cyls = extractInternalCyls(res.data, W);
      for (const c of cyls) {
        const match = typeof matchScrewForHole === 'function'
          ? matchScrewForHole(c.r * 2, { preferTap: c.isBlind })
          : null;
        if (!match) continue;
        rawHoles.push({
          partId: it.id,
          partName,
          o: c.o,
          d: c.d,
          r: c.r,
          dia: round(c.r * 2, 2),
          t0: c.t0,
          t1: c.t1,
          match,
          hasCounterbore: c.hasCounterbore,
          cbDepth: c.cbDepth,
          cbSide: c.cbSide,
          hasCountersink: c.hasCountersink,
          csSide: c.csSide,
          isBlind: c.isBlind,
          openSide: c.openSide,
        });
      }
    }

    // Koaxiale Bohrungen über mehrere gestapelte Teile zu einem Schrauben-Platz zusammenführen
    const clusters = [];
    for (const h0 of rawHoles) {
      let target = null;
      const maxGap = Math.max(5, h0.match.nomD * 1.5);
      for (const cl of clusters) {
        if (cl.size !== h0.match.size) continue;
        if (Math.abs(cl.d.dot(h0.d)) < 0.995) continue;
        if (axisPerpDist(cl.o, h0.o, cl.d) > 0.35) continue;
        const shift = h0.o.clone().sub(cl.o).dot(cl.d);
        const ht0 = h0.t0 + shift, ht1 = h0.t1 + shift;
        if (ht1 < cl.t0 - maxGap || ht0 > cl.t1 + maxGap) continue;
        target = cl;
        cl.t0 = Math.min(cl.t0, ht0);
        cl.t1 = Math.max(cl.t1, ht1);
        cl.entries.push({ ...h0, t0: ht0, t1: ht1 });
        break;
      }
      if (!target) {
        clusters.push({
          o: h0.o.clone(),
          d: h0.d.clone(),
          size: h0.match.size,
          nomD: h0.match.nomD,
          t0: h0.t0,
          t1: h0.t1,
          entries: [{ ...h0 }],
        });
      }
    }

    const out = [];
    for (let idx = 0; idx < clusters.length; idx++) {
      const cl = clusters[idx];
      const thickness = round(Math.max(0.5, cl.t1 - cl.t0), 3);
      const partIds = [...new Set(cl.entries.map((e) => e.partId))];
      const partNames = [...new Set(cl.entries.map((e) => e.partName))];
      const dia = cl.entries[0].dia;
      const hasCountersink = cl.entries.some((e) => e.hasCountersink);
      const cbEntry = cl.entries.find((e) => e.hasCounterbore);
      const hasCounterbore = !!cbEntry;
      const cbDepth = cbEntry ? cbEntry.cbDepth : 0;
      const isBlind = cl.entries.length === 1
        ? cl.entries[0].isBlind
        : cl.entries.some((e) => e.isBlind && (Math.abs(e.t0 - cl.t0) < 0.25 || Math.abs(e.t1 - cl.t1) < 0.25));
      const allTap = cl.entries.every((e) => e.match.fitKind === 'tap');
      const fitKind = allTap ? 'tap' : 'through';

      // Kopfseite bestimmen: 1) Senkung, 2) offene Seite bei Sackloch, 3) Durchgang vor Gewinde, 4) +Z/+Y/+X
      let headSide = 0;
      const csEnt = cl.entries.find((e) => e.hasCountersink && e.csSide);
      if (csEnt) headSide = csEnt.csSide;
      if (!headSide && cbEntry && cbEntry.cbSide) headSide = cbEntry.cbSide;
      if (!headSide) {
        const blindEnt = cl.entries.find((e) => e.isBlind && e.openSide);
        if (blindEnt) headSide = blindEnt.openSide;
      }
      if (!headSide && cl.entries.length > 1) {
        const sorted = [...cl.entries].sort((a, b) => a.t0 - b.t0);
        const low = sorted[0], high = sorted[sorted.length - 1];
        if (low.match.fitKind === 'tap' && high.match.fitKind !== 'tap') headSide = 1;
        else if (high.match.fitKind === 'tap' && low.match.fitKind !== 'tap') headSide = -1;
      }
      if (!headSide) headSide = 1; // canonicalDir hat bereits dominante Achse positiv

      const headDirVec = cl.d.clone().multiplyScalar(headSide);
      const entryPt = cl.o.clone().addScaledVector(cl.d, headSide > 0 ? cl.t1 : cl.t0);
      const exitPt = cl.o.clone().addScaledVector(cl.d, headSide > 0 ? cl.t0 : cl.t1);

      const se = typeof screwEntry === 'function' ? screwEntry(cl.size) : null;
      const head = hasCountersink && se && se.senkkopf && se.senkkopf.kopf_h_mm ? 'senk' : 'zyl';
      const length = typeof suggestScrewLength === 'function'
        ? suggestScrewLength(cl.size, thickness, { head, isBlind, cbDepth, fitKind, withNut: false, withWasher: false })
        : 12;

      // Prüfen, ob schon eine Normschraube auf dieser Achse sitzt
      const hasScrew = existingScrews.some((s) => {
        if (Math.abs(s.d.dot(cl.d)) < 0.99) return false;
        if (axisPerpDist(s.o, cl.o, cl.d) > Math.max(0.5, cl.nomD * 0.25)) return false;
        const sHeadT = s.o.clone().sub(cl.o).dot(cl.d);
        const sDir = s.d.dot(cl.d);
        const sTipT = sHeadT - sDir * s.L;
        const sMin = Math.min(sHeadT, sTipT), sMax = Math.max(sHeadT, sTipT);
        return sMax >= cl.t0 - 1.5 && sMin <= cl.t1 + 1.5;
      });

      out.push({
        id: 'hole_' + (idx + 1),
        partIds,
        partName: partNames.join(' + '),
        size: cl.size,
        nomD: cl.nomD,
        dia,
        thickness,
        head,
        length,
        fitKind,
        hasCounterbore,
        cbDepth,
        hasCountersink,
        isBlind,
        withWasher: false,
        withNut: false,
        flip: false,
        hasScrew,
        selected: !hasScrew,
        entryPt: [round(entryPt.x, 4), round(entryPt.y, 4), round(entryPt.z, 4)],
        exitPt: [round(exitPt.x, 4), round(exitPt.y, 4), round(exitPt.z, 4)],
        headDir: [round(headDirVec.x, 6), round(headDirVec.y, 6), round(headDirVec.z, 6)],
      });
    }

    out.sort((a, b) => a.nomD - b.nomD || a.partName.localeCompare(b.partName, 'de')
      || a.entryPt[0] - b.entryPt[0] || a.entryPt[1] - b.entryPt[1] || a.entryPt[2] - b.entryPt[2]);
    return out;
  }

  function insertAutoScrews(specs, opts = {}) {
    const list = Array.isArray(specs) ? specs : findHoles(App.doc).filter((h0) => !h0.hasScrew);
    const active = list.filter((s) => s && Array.isArray(s.entryPt) && Array.isArray(s.headDir));
    if (!active.length) {
      if (!opts.silent) UI.toast(T('asm.autoScrewsNoneSelected'), { icon: 'info' });
      return { screws: [], washers: [], nuts: [], count: 0 };
    }

    const screws = [];
    const washers = [];
    const nuts = [];
    const newItems = [];

    for (const spec of active) {
      const size = String(spec.size || 'M3');
      const se = typeof screwEntry === 'function' ? screwEntry(size) : null;
      const head = spec.head === 'hex' || spec.head === 'senk' ? spec.head : 'zyl';
      const length = Math.max(2, Number(spec.length) || 10);
      const flip = !!spec.flip;

      let dir = new THREE.Vector3(...spec.headDir).normalize();
      let entry = new THREE.Vector3(...spec.entryPt);
      let exit = Array.isArray(spec.exitPt)
        ? new THREE.Vector3(...spec.exitPt)
        : entry.clone().addScaledVector(dir, -(Number(spec.thickness) || length));
      if (flip) {
        dir.negate();
        const tmp = entry; entry = exit; exit = tmp;
      }

      const q = quatFromZ(dir);
      const washerH = (se && se.scheibe && se.scheibe.dicke_mm) || 0;
      const cbDepth = !flip && spec.cbDepth > 0 ? Number(spec.cbDepth) : 0;
      const useHeadWasher = !!spec.withWasher && head !== 'senk' && cbDepth <= 0 && washerH > 0;

      let seatPt = entry.clone();
      if (head !== 'senk' && cbDepth > 0) {
        seatPt = entry.clone().addScaledVector(dir, -cbDepth);
      } else if (useHeadWasher) {
        const wMeta = {
          name: `Scheibe ${size}`,
          partNo: `ISO 7089 ${size}`,
          desc: `Unterlegscheibe ${size} (ISO 7089)`,
        };
        const wItem = Model.newItem('part', { lib: 'stdWasher', size }, { name: wMeta.name, role: 'solid' });
        wItem.props = { partNo: wMeta.partNo, desc: wMeta.desc };
        Model.setFromMatrix(wItem, new THREE.Matrix4().compose(entry, q, new THREE.Vector3(1, 1, 1)));
        newItems.push(wItem);
        washers.push(wItem);
        seatPt = entry.clone().addScaledVector(dir, washerH);
      }

      const meta = typeof screwNormName === 'function'
        ? screwNormName(size, head, length)
        : { name: `Schraube ${size}×${length}`, partNo: `ISO 4762 ${size}×${length}`, desc: '' };
      const scItem = Model.newItem('part', { lib: 'stdScrew', size, head, length }, { name: meta.name, role: 'solid' });
      scItem.props = { partNo: meta.partNo, desc: meta.desc };
      Model.setFromMatrix(scItem, new THREE.Matrix4().compose(seatPt, q, new THREE.Vector3(1, 1, 1)));
      newItems.push(scItem);
      screws.push(scItem);

      if (spec.withNut && !spec.isBlind) {
        const nutDir = dir.clone().negate();
        const qNut = quatFromZ(nutDir);
        let nutSeat = exit.clone();
        if (spec.withWasher && washerH > 0) {
          const wItem = Model.newItem('part', { lib: 'stdWasher', size }, { name: `Scheibe ${size}`, role: 'solid' });
          wItem.props = { partNo: `ISO 7089 ${size}`, desc: `Unterlegscheibe ${size} (ISO 7089)` };
          Model.setFromMatrix(wItem, new THREE.Matrix4().compose(exit, qNut, new THREE.Vector3(1, 1, 1)));
          newItems.push(wItem);
          washers.push(wItem);
          nutSeat = exit.clone().addScaledVector(nutDir, washerH);
        }
        const nItem = Model.newItem('part', { lib: 'stdNut', size }, { name: `Mutter ${size}`, role: 'solid' });
        nItem.props = { partNo: `ISO 4032 ${size}`, desc: `Sechskantmutter ${size} (ISO 4032)` };
        Model.setFromMatrix(nItem, new THREE.Matrix4().compose(nutSeat, qNut, new THREE.Vector3(1, 1, 1)));
        newItems.push(nItem);
        nuts.push(nItem);
      }
    }

    App.change(T('asm.autoScrewsUndo', { n: screws.length }), (doc) => {
      if (opts.asAssembly) doc.docType = 'assembly';
      for (const it of newItems) doc.items.push(it);
    });
    const screwIds = screws.map((s) => s.id);
    if (screwIds.length) App.select(screwIds);
    if (!opts.silent) {
      UI.toast(T('asm.autoScrewsToast', { n: screws.length }), { icon: 'check', ms: 3200 });
    }
    return { screws, washers, nuts, count: screws.length };
  }

  function autoScrewsDialog() {
    const holes = findHoles(App.doc);
    const body = h('div', { id: 'auto-screws-dialog', class: 'as-dlg' });

    let hoverObj = null;
    const clearHover = () => {
      if (!hoverObj) return;
      if (typeof Viewer !== 'undefined' && Viewer.groups && Viewer.groups.overlay) {
        Viewer.groups.overlay.remove(hoverObj);
      }
      hoverObj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      hoverObj = null;
      if (typeof Viewer !== 'undefined' && Viewer.requestRender) Viewer.requestRender();
    };
    const showHover = (hole) => {
      clearHover();
      if (!hole || typeof Viewer === 'undefined' || !Viewer.groups || !Viewer.groups.overlay) return;
      const g = new THREE.Group();
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#0c7a70'), depthTest: false, transparent: true, opacity: 0.95 });
      let dir = new THREE.Vector3(...hole.headDir).normalize();
      let entry = new THREE.Vector3(...hole.entryPt);
      let exit = new THREE.Vector3(...hole.exitPt);
      if (hole.flip) { dir.negate(); const t = entry; entry = exit; exit = t; }
      const u = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const v = new THREE.Vector3().crossVectors(dir, u).normalize();
      const r = Math.max(1.2, hole.dia / 2 + 0.8);
      const ringPts = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ringPts.push(entry.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r));
      }
      const rg = new THREE.BufferGeometry().setFromPoints(ringPts);
      const rl = new THREE.Line(rg, mat); rl.renderOrder = 45;
      const tip = entry.clone().addScaledVector(dir, -hole.length);
      const headTop = entry.clone().addScaledVector(dir, hole.nomD * 1.1);
      const ag = new THREE.BufferGeometry().setFromPoints([tip, headTop]);
      const al = new THREE.Line(ag, mat); al.renderOrder = 45;
      g.add(rl, al);
      Viewer.groups.overlay.add(g);
      hoverObj = g;
      Viewer.requestRender();
    };

    if (!holes.length) {
      body.append(h('div', { class: 'hint-box', id: 'as-empty-hint' }, T('asm.autoScrewsEmpty')));
      return UI.modal({
        title: T('asm.autoScrewsTitle'),
        body,
        actions: [{ label: T('common.close'), primary: true }],
      });
    }

    const headOpts = [
      ['zyl', T('asm.autoScrewsHeadZyl')],
      ['hex', T('asm.autoScrewsHeadHex')],
      ['senk', T('asm.autoScrewsHeadSenk')],
    ];
    const lensFor = (cur) => {
      const base = typeof SCREW_LENGTHS !== 'undefined' ? SCREW_LENGTHS.slice() : [6, 8, 10, 12, 16, 20, 25, 30, 40, 50];
      if (!base.some((x) => Math.abs(x - cur) < 0.05)) base.push(cur);
      base.sort((a, b) => a - b);
      return base;
    };

    const bySize = new Map();
    for (const h0 of holes) bySize.set(h0.size, (bySize.get(h0.size) || 0) + 1);
    const sizeSummary = [...bySize.entries()].map(([s, n]) => `${n}× ${s}`).join(', ');
    const summaryEl = h('div', { class: 'as-summary', id: 'as-summary' }, T('asm.autoScrewsSummary', { n: holes.length, sizes: sizeSummary }));

    const allHeadSel = h('select', { id: 'as-all-head', 'aria-label': T('asm.autoScrewsHeadAll') });
    for (const [val, lbl] of headOpts) allHeadSel.append(h('option', { value: val }, lbl));
    const allWasherChk = h('input', { type: 'checkbox', id: 'as-all-washer' });
    const allNutChk = h('input', { type: 'checkbox', id: 'as-all-nut' });

    const bar = h('div', { class: 'as-bar' },
      h('label', { class: 'as-bar-lbl' }, T('asm.autoScrewsHeadAll'), allHeadSel),
      h('label', { class: 'check' }, allWasherChk, T('asm.autoScrewsWasher')),
      h('label', { class: 'check' }, allNutChk, T('asm.autoScrewsNut'))
    );

    const tbl = h('table', { class: 'vtable as-table', id: 'auto-screws-table' },
      h('tr', null,
        h('th', null, ''),
        h('th', null, T('asm.autoScrewsColPart')),
        h('th', null, T('asm.autoScrewsColHole')),
        h('th', null, T('asm.autoScrewsColSize')),
        h('th', null, T('asm.autoScrewsColHead')),
        h('th', null, T('asm.autoScrewsColLen')),
        h('th', null, T('asm.autoScrewsColDir'))
      )
    );

    const rowRefs = [];
    const syncApplyBtn = () => {
      const btn = document.getElementById('as-apply');
      if (!btn) return;
      const cnt = holes.filter((x) => x.selected).length;
      btn.textContent = T('asm.autoScrewsApply', { n: cnt });
      btn.disabled = cnt === 0;
    };

    const recalcRowLen = (h0, ref) => {
      if (typeof suggestScrewLength === 'function') {
        h0.length = suggestScrewLength(h0.size, h0.thickness, {
          head: h0.head,
          isBlind: h0.isBlind,
          cbDepth: h0.flip ? 0 : h0.cbDepth,
          fitKind: h0.fitKind,
          withNut: h0.withNut,
          withWasher: h0.withWasher,
        });
      }
      ref.lenSel.innerHTML = '';
      for (const L of lensFor(h0.length)) {
        ref.lenSel.append(h('option', { value: String(L), selected: Math.abs(L - h0.length) < 0.05 }, `${String(L).replace('.', ',')} mm`));
      }
      ref.lenSel.value = String(h0.length);
    };

    for (const h0 of holes) {
      const chk = h('input', { type: 'checkbox', class: 'as-chk', checked: h0.selected });
      const sizeSel = h('select', { class: 'as-size' });
      for (const s of (typeof SIZES !== 'undefined' ? SIZES : ['M3', 'M4', 'M5', 'M6', 'M8'])) {
        sizeSel.append(h('option', { value: s, selected: s === h0.size }, s));
      }
      const headSel = h('select', { class: 'as-head' });
      for (const [val, lbl] of headOpts) headSel.append(h('option', { value: val, selected: val === h0.head }, lbl));
      const lenSel = h('select', { class: 'as-len' });
      for (const L of lensFor(h0.length)) {
        lenSel.append(h('option', { value: String(L), selected: Math.abs(L - h0.length) < 0.05 }, `${String(L).replace('.', ',')} mm`));
      }
      const flipBtn = h('button', { type: 'button', class: 'btn small as-flip', title: T('asm.autoScrewsFlipTip'), 'aria-label': T('asm.autoScrewsFlipTip') }, '⇅');

      const badges = [];
      if (h0.hasCountersink) badges.push(h('span', { class: 'as-badge' }, T('asm.autoScrewsCsk')));
      if (h0.hasCounterbore) badges.push(h('span', { class: 'as-badge' }, T('asm.autoScrewsCb')));
      if (h0.isBlind) badges.push(h('span', { class: 'as-badge' }, T('asm.autoScrewsBlind')));
      if (h0.fitKind === 'tap') badges.push(h('span', { class: 'as-badge' }, T('asm.autoScrewsTap')));
      if (h0.hasScrew) badges.push(h('span', { class: 'as-badge warn' }, T('asm.autoScrewsUsed')));

      const holeInfo = h('div', { class: 'as-hole-cell' },
        h('span', { class: 'mono' }, `Ø ${Units.fmtLenU(h0.dia, 1)} · ${Units.fmtLenU(h0.thickness, 1)}`),
        badges.length ? h('div', { class: 'as-badges' }, ...badges) : ''
      );

      const tr = h('tr', { class: 'as-row' + (h0.hasScrew ? ' as-row-used' : ''), dataset: { holeId: h0.id } },
        h('td', null, chk),
        h('td', { class: 'as-part', title: h0.partName }, h0.partName),
        h('td', null, holeInfo),
        h('td', null, sizeSel),
        h('td', null, headSel),
        h('td', null, lenSel),
        h('td', null, flipBtn)
      );

      const ref = { chk, sizeSel, headSel, lenSel, tr };
      rowRefs.push({ h0, ref });

      chk.onchange = () => { h0.selected = chk.checked; syncApplyBtn(); };
      sizeSel.onchange = () => { h0.size = sizeSel.value; recalcRowLen(h0, ref); };
      headSel.onchange = () => { h0.head = headSel.value; recalcRowLen(h0, ref); };
      lenSel.onchange = () => { h0.length = Number(lenSel.value) || h0.length; };
      flipBtn.onclick = () => {
        h0.flip = !h0.flip;
        flipBtn.classList.toggle('primary', h0.flip);
        recalcRowLen(h0, ref);
        showHover(h0);
      };
      tr.addEventListener('pointerenter', () => showHover(h0));
      tbl.append(tr);
    }

    allHeadSel.onchange = () => {
      const val = allHeadSel.value;
      for (const { h0, ref } of rowRefs) {
        h0.head = val;
        ref.headSel.value = val;
        recalcRowLen(h0, ref);
      }
    };
    const syncHardware = () => {
      const w = allWasherChk.checked;
      const n = allNutChk.checked;
      for (const { h0, ref } of rowRefs) {
        h0.withWasher = w;
        h0.withNut = n && !h0.isBlind;
        recalcRowLen(h0, ref);
      }
    };
    allWasherChk.onchange = syncHardware;
    allNutChk.onchange = syncHardware;

    body.append(summaryEl, bar, h('div', { class: 'as-table-wrap' }, tbl));
    body.addEventListener('pointerleave', clearHover);

    const initCnt = holes.filter((x) => x.selected).length;
    const modalRef = UI.modal({
      title: T('asm.autoScrewsTitle'),
      body,
      wide: true,
      actions: [
        { label: T('common.cancel'), value: false, run: () => { clearHover(); } },
        {
          id: 'as-apply',
          label: T('asm.autoScrewsApply', { n: initCnt }),
          primary: true,
          disabled: initCnt === 0,
          run: () => {
            clearHover();
            const chosen = holes.filter((x) => x.selected);
            insertAutoScrews(chosen);
          },
        },
      ],
    });
    if (modalRef && modalRef.overlay) {
      const observer = new MutationObserver(() => {
        if (!document.body.contains(body)) { clearHover(); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return modalRef;
  }

  // ================= Spiegeln und Muster von Teilen in der Baugruppe (BG-26) =================
  function patterns(doc = App.doc) {
    return (doc && Array.isArray(doc.asmPatterns)) ? doc.asmPatterns : [];
  }
  function patternsOf(itemId, doc = App.doc) {
    if (!itemId) return [];
    return patterns(doc).filter((pat) => pat && (pat.sourceId === itemId || (Array.isArray(pat.copyIds) && pat.copyIds.includes(itemId))));
  }
  function patternOf(itemId, doc = App.doc) {
    if (!itemId) return null;
    const list = patterns(doc);
    return list.find((pat) => pat && Array.isArray(pat.copyIds) && pat.copyIds.includes(itemId))
      || list.find((pat) => pat && pat.sourceId === itemId)
      || null;
  }
  function isPatternCopy(itemId, doc = App.doc) {
    if (!itemId) return false;
    return patterns(doc).some((pat) => pat && Array.isArray(pat.copyIds) && pat.copyIds.includes(itemId));
  }
  function mirrorPlaneOf(doc, pat, V) {
    if (pat && pat.plane === 'DATUM' && pat.datumId) {
      const d = (doc && Array.isArray(doc.datums) ? doc.datums : []).find((x) => x && x.id === pat.datumId);
      if (d && d.plane && Array.isArray(d.plane.o) && Array.isArray(d.plane.n)) {
        return { o: d.plane.o.map(Number), n: d.plane.n.map(Number) };
      }
    }
    const pl = ['XY', 'XZ', 'YZ'].includes(pat && pat.plane) ? pat.plane : 'YZ';
    const off = Model.num(pat && pat.off, V, 0);
    const n = pl === 'XY' ? [0, 0, 1] : pl === 'XZ' ? [0, 1, 0] : [1, 0, 0];
    return { o: [n[0] * off, n[1] * off, n[2] * off], n };
  }
  function reflectionMatrix(o, n) {
    const v = new THREE.Vector3(Number(n[0]) || 0, Number(n[1]) || 0, Number(n[2]) || 0);
    if (v.lengthSq() < 1e-12) v.set(1, 0, 0);
    else v.normalize();
    const a = v.x, b = v.y, c = v.z;
    const d = a * (Number(o[0]) || 0) + b * (Number(o[1]) || 0) + c * (Number(o[2]) || 0);
    return new THREE.Matrix4().set(
      1 - 2 * a * a, -2 * a * b, -2 * a * c, 2 * d * a,
      -2 * a * b, 1 - 2 * b * b, -2 * b * c, 2 * d * b,
      -2 * a * c, -2 * b * c, 1 - 2 * c * c, 2 * d * c,
      0, 0, 0, 1
    );
  }
  function computePatternTargets(doc, pat, src) {
    if (!doc || !pat || !src) return [];
    const V = Model.vars(doc).v;
    const Wsrc = Model.worldMatrix(doc, src.id);
    const skipSet = new Set(Array.isArray(pat.skip) ? pat.skip.map((x) => Math.round(Number(x))) : []);
    const targets = [];
    if (pat.kind === 'rect') {
      const nx = clamp(Math.round(Model.num(pat.nx, V, 2)), 1, 50);
      const ny = clamp(Math.round(Model.num(pat.ny, V, 2)), 1, 50);
      const dx = Model.num(pat.dx, V, 30);
      const dy = Model.num(pat.dy, V, 30);
      let slot = 0;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++, slot++) {
          if (slot === 0 || skipSet.has(slot)) continue;
          if (targets.length >= 100) break;
          const W = new THREE.Matrix4().makeTranslation(i * dx, j * dy, 0).multiply(Wsrc);
          targets.push({ slot, copyNum: slot + 1, W, isMirror: false });
        }
        if (targets.length >= 100) break;
      }
    } else if (pat.kind === 'circ') {
      const n = clamp(Math.round(Model.num(pat.n, V, 4)), 1, 60);
      const ang = Model.num(pat.ang, V, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : (n > 1 ? ang / (n - 1) : 0);
      const axVec = pat.axis === 'x' ? new THREE.Vector3(1, 0, 0) : pat.axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      const cx = Model.num(pat.cx, V, 0), cy = Model.num(pat.cy, V, 0), cz = Model.num(pat.cz, V, 0);
      const srcPos = new THREE.Vector3(), srcQuat = new THREE.Quaternion(), srcScale = new THREE.Vector3();
      Wsrc.decompose(srcPos, srcQuat, srcScale);
      const align = pat.align !== false;
      for (let k = 1; k < n; k++) {
        if (skipSet.has(k)) continue;
        if (targets.length >= 100) break;
        const rad = (k * step * Math.PI) / 180;
        const R = new THREE.Matrix4().makeTranslation(cx, cy, cz)
          .multiply(new THREE.Matrix4().makeRotationAxis(axVec, rad))
          .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
        const W = align
          ? R.multiply(Wsrc)
          : new THREE.Matrix4().compose(srcPos.clone().applyMatrix4(R), srcQuat, new THREE.Vector3(1, 1, 1));
        targets.push({ slot: k, copyNum: k + 1, W, isMirror: false });
      }
    } else if (pat.kind === 'mirror') {
      if (!skipSet.has(1)) {
        const pl = mirrorPlaneOf(doc, pat, V);
        const Mrefl = reflectionMatrix(pl.o, pl.n);
        const D = new THREE.Matrix4().makeScale(-1, 1, 1);
        const W = Mrefl.multiply(Wsrc).multiply(D);
        targets.push({ slot: 1, copyNum: 2, W, isMirror: true });
      }
    }
    return targets;
  }
  function syncPatterns(doc) {
    if (!doc || !Array.isArray(doc.asmPatterns) || !doc.asmPatterns.length) return 0;
    if (!Array.isArray(doc.items)) return 0;
    let changed = 0;
    let createdLinked = false;
    const activePats = [];
    for (const pat of doc.asmPatterns) {
      if (!pat || typeof pat !== 'object' || !pat.sourceId) continue;
      const src = doc.items.find((x) => x && x.id === pat.sourceId);
      if (!src) {
        for (const cid of pat.copyIds || []) {
          const orphan = doc.items.find((x) => x && x.id === cid);
          if (orphan) { delete orphan.asmPat; delete orphan.asmPatSlot; }
        }
        changed++;
        continue;
      }
      activePats.push(pat);
      const targets = computePatternTargets(doc, pat, src);
      const existingBySlot = new Map();
      const leftovers = [];
      const seenExisting = new Set();
      for (const cid of pat.copyIds || []) {
        const c = doc.items.find((x) => x && x.id === cid);
        if (!c || c === src || seenExisting.has(c.id)) continue;
        seenExisting.add(c.id);
        if (c.asmPatSlot != null && !existingBySlot.has(c.asmPatSlot)) existingBySlot.set(c.asmPatSlot, c);
        else leftovers.push(c);
      }
      for (const c of doc.items) {
        if (c && c !== src && c.asmPat === pat.id && !seenExisting.has(c.id)) {
          seenExisting.add(c.id);
          if (c.asmPatSlot != null && !existingBySlot.has(c.asmPatSlot)) existingBySlot.set(c.asmPatSlot, c);
          else leftovers.push(c);
        }
      }

      const assigned = [];
      for (const tgt of targets) {
        let copy = existingBySlot.get(tgt.slot);
        if (copy) existingBySlot.delete(tgt.slot);
        else copy = leftovers.shift() || null;
        assigned.push({ tgt, copy });
      }
      const dropIds = new Set([...existingBySlot.values(), ...leftovers].map((c) => c.id));
      if (dropIds.size) {
        doc.items = doc.items.filter((x) => !x || !dropIds.has(x.id));
        changed += dropIds.size;
      }

      const nextCopyIds = [];
      let anchor = src;
      for (const { tgt, copy: existing } of assigned) {
        let copy = existing;
        const desiredName = Comp.patternCopyName(src, tgt.copyNum, tgt.isMirror);
        if (!copy) {
          copy = Comp.cloneLinkedPart(doc, src, { mirror: tgt.isMirror, copyNum: tgt.copyNum, name: desiredName });
          const idx = doc.items.indexOf(anchor);
          if (idx >= 0) doc.items.splice(idx + 1, 0, copy);
          else doc.items.push(copy);
          if (copy.link) createdLinked = true;
          changed++;
        } else {
          Comp.syncLinkedPart(doc, copy, src, tgt.isMirror);
          copy.name = desiredName;
        }
        Model.setFromMatrix(copy, tgt.W);
        copy.asmPat = pat.id;
        copy.asmPatSlot = tgt.slot;
        if (src.suppressed) copy.suppressed = true; else delete copy.suppressed;
        nextCopyIds.push(copy.id);
        anchor = copy;
      }
      pat.copyIds = nextCopyIds;
    }
    doc.asmPatterns = activePats;
    if (createdLinked && typeof Model.syncLinks === 'function') Model.syncLinks(doc);
    return changed;
  }
  function onItemRemoved(doc, item) {
    if (!doc || !item) return;
    if (Array.isArray(doc.displayStates)) {
      for (const ds of doc.displayStates) {
        if (ds && ds.items && Object.prototype.hasOwnProperty.call(ds.items, item.id)) {
          delete ds.items[item.id];
        }
      }
    }
    if (Array.isArray(doc.asmVariants)) {
      for (const av of doc.asmVariants) {
        if (!av) continue;
        if (Array.isArray(av.suppressed)) av.suppressed = av.suppressed.filter((id) => id !== item.id);
        if (av.refs && Object.prototype.hasOwnProperty.call(av.refs, item.id)) delete av.refs[item.id];
        if (av.itemParams && Object.prototype.hasOwnProperty.call(av.itemParams, item.id)) delete av.itemParams[item.id];
      }
    }
    if (!Array.isArray(doc.asmPatterns) || !doc.asmPatterns.length) return;
    const next = [];
    for (const pat of doc.asmPatterns) {
      if (!pat) continue;
      if (pat.sourceId === item.id) {
        for (const cid of pat.copyIds || []) {
          const c = (doc.items || []).find((x) => x && x.id === cid);
          if (c) { delete c.asmPat; delete c.asmPatSlot; }
        }
        continue;
      }
      if (Array.isArray(pat.copyIds) && pat.copyIds.includes(item.id)) {
        pat.copyIds = pat.copyIds.filter((id) => id !== item.id);
        if (item.asmPatSlot != null) {
          pat.skip = Array.isArray(pat.skip) ? pat.skip : [];
          if (!pat.skip.includes(item.asmPatSlot)) pat.skip.push(item.asmPatSlot);
        }
        if (!pat.copyIds.length) continue;
      }
      next.push(pat);
    }
    doc.asmPatterns = next;
  }
  function defaultStepFor(itemId) {
    const box = typeof Actions !== 'undefined' && Actions.worldBox ? Actions.worldBox(itemId) : null;
    if (!box || box.isEmpty()) return [30, 30];
    const sz = box.getSize(new THREE.Vector3());
    return [round(Math.max(10, sz.x + 10), 1), round(Math.max(10, sz.y + 10), 1)];
  }
  function patternKindLabel(kind) {
    if (kind === 'circ') return T('asm.patKindCirc');
    if (kind === 'mirror') return T('asm.patKindMirror');
    return T('asm.patKindRect');
  }
  function createPattern(kind = 'rect', ids = null, opts = {}) {
    if (!App.doc) return null;
    const k = kind === 'circ' || kind === 'mirror' ? kind : 'rect';
    const rawIds = Array.isArray(ids) ? ids : (ids ? [ids] : App.sel);
    const tops = [];
    const seen = new Set();
    for (const id of rawIds) {
      const t = Model.topOf(App.doc, id);
      if (t && !seen.has(t.id) && typeof Comp !== 'undefined' && Comp.canPatternPart && Comp.canPatternPart(t, App.doc)) {
        seen.add(t.id);
        tops.push(t);
      }
    }
    if (!tops.length) {
      if (!opts.silent) UI.toast(T('asm.patSelectPart'), { icon: 'info' });
      return null;
    }
    const created = [];
    const undoKey = k === 'mirror' ? 'asm.patMirrorUndo' : (k === 'circ' ? 'asm.patCircUndo' : 'asm.patRectUndo');
    App.change(T(undoKey), (doc) => {
      doc.asmPatterns = Array.isArray(doc.asmPatterns) ? doc.asmPatterns : [];
      for (const srcItem of tops) {
        const src = doc.items.find((x) => x && x.id === srcItem.id);
        if (!src) continue;
        const [defDx, defDy] = defaultStepFor(src.id);
        const entry = {
          id: uid('ap'),
          kind: k,
          sourceId: src.id,
          copyIds: [],
        };
        if (k === 'rect') {
          entry.nx = opts.nx != null ? opts.nx : 2;
          entry.ny = opts.ny != null ? opts.ny : 2;
          entry.dx = opts.dx != null ? opts.dx : defDx;
          entry.dy = opts.dy != null ? opts.dy : defDy;
        } else if (k === 'circ') {
          entry.n = opts.n != null ? opts.n : 4;
          entry.ang = opts.ang != null ? opts.ang : 360;
          entry.axis = opts.axis === 'x' || opts.axis === 'y' ? opts.axis : 'z';
          entry.cx = opts.cx != null ? opts.cx : 0;
          entry.cy = opts.cy != null ? opts.cy : 0;
          entry.cz = opts.cz != null ? opts.cz : 0;
          entry.align = opts.align !== false;
        } else {
          entry.plane = opts.plane === 'DATUM' || opts.plane === 'XY' || opts.plane === 'XZ' ? opts.plane : 'YZ';
          entry.off = opts.off != null ? opts.off : 0;
          if (entry.plane === 'DATUM' && opts.datumId) entry.datumId = opts.datumId;
        }
        doc.asmPatterns.push(entry);
        created.push(entry);
      }
      if (!created.length) return false;
      syncPatterns(doc);
    });
    if (!created.length) return null;
    const liveList = created.map((c) => patterns(App.doc).find((x) => x.id === c.id)).filter(Boolean);
    const first = liveList[0] || created[0];
    if (!opts.keepSelection) App.select([first.sourceId]);
    if (!opts.silent) {
      const totalCopies = liveList.reduce((s, p) => s + (p.copyIds ? p.copyIds.length : 0), 0);
      const totalParts = liveList.length + totalCopies;
      UI.toast(
        k === 'mirror'
          ? T('asm.patMirrorToast', { n: totalCopies })
          : T('asm.patCreatedToast', { kind: patternKindLabel(k), total: totalParts }),
        { icon: 'check', ms: 3200 }
      );
    }
    return opts.all ? liveList : first;
  }
  const patternRect = (ids, opts = {}) => createPattern('rect', ids, opts);
  const patternCirc = (ids, opts = {}) => createPattern('circ', ids, opts);
  const mirrorPart = (ids, opts = {}) => createPattern('mirror', ids, opts);

  function updatePattern(patId, patch = {}, mergeKey = null) {
    if (!patId || !patch || typeof patch !== 'object') return false;
    const opts = mergeKey ? { merge: `ap:${patId}:${mergeKey}` } : {};
    return App.change(T('asm.patUpdatedUndo'), (doc) => {
      const pat = patterns(doc).find((p) => p && p.id === patId);
      if (!pat) return false;
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        if (pat[k] !== v) { pat[k] = v; changed = true; }
      }
      if (!changed) return false;
      if (Array.isArray(pat.skip) && pat.skip.length) {
        const V = Model.vars(doc).v;
        const maxSlot = pat.kind === 'rect'
          ? clamp(Math.round(Model.num(pat.nx, V, 2)), 1, 50) * clamp(Math.round(Model.num(pat.ny, V, 2)), 1, 50)
          : pat.kind === 'circ'
            ? clamp(Math.round(Model.num(pat.n, V, 4)), 1, 60)
            : 2;
        pat.skip = pat.skip.filter((s) => s >= 1 && s < maxSlot);
        if (!pat.skip.length) delete pat.skip;
      }
      syncPatterns(doc);
      return true;
    }, opts) !== false;
  }
  function restorePatternSkips(patId) {
    return updatePattern(patId, { skip: [] });
  }
  function dissolvePattern(patId) {
    if (!patId || !App.doc) return false;
    let ok = false;
    App.change(T('asm.patDissolveUndo'), (doc) => {
      const list = patterns(doc);
      const idx = list.findIndex((p) => p && p.id === patId);
      if (idx < 0) return false;
      const [pat] = list.splice(idx, 1);
      for (const cid of pat.copyIds || []) {
        const c = (doc.items || []).find((x) => x && x.id === cid);
        if (c) { delete c.asmPat; delete c.asmPatSlot; }
      }
      ok = true;
    });
    if (ok) UI.toast(T('asm.patDissolveToast'), { icon: 'ungroup', ms: 2600 });
    return ok;
  }
  function removePattern(patId) {
    if (!patId || !App.doc) return false;
    let srcId = null;
    const ok = App.change(T('asm.patRemoveUndo'), (doc) => {
      const list = patterns(doc);
      const idx = list.findIndex((p) => p && p.id === patId);
      if (idx < 0) return false;
      const [pat] = list.splice(idx, 1);
      srcId = pat.sourceId;
      const drop = new Set(pat.copyIds || []);
      if (drop.size) doc.items = (doc.items || []).filter((x) => !x || !drop.has(x.id));
      return true;
    }) !== false;
    if (ok) {
      if (srcId && Model.find(App.doc, srcId)) App.select([srcId]);
      UI.toast(T('asm.patRemoveToast'), { icon: 'info', ms: 2400 });
    }
    return ok;
  }

  function patternMenu(anchor, ids = null) {
    const sel = ids || (App.sel.length ? App.sel : null);
    return UI.menu(anchor, [
      { id: 'am-pat-rect', icon: 'patternRect', label: T('asm.patMenuRect'), help: 'asmPattern', run: () => patternDialog('rect', sel) },
      { id: 'am-pat-circ', icon: 'patternCirc', label: T('asm.patMenuCirc'), help: 'asmPattern', run: () => patternDialog('circ', sel) },
      { id: 'am-pat-mirror', icon: 'mirror', label: T('asm.patMenuMirror'), help: 'asmMirror', run: () => patternDialog('mirror', sel) },
    ]);
  }

  function patternDialog(initialKind = 'rect', ids = null) {
    if (!App.doc) return null;
    const eligible = (App.doc.items || []).filter((it) => typeof Comp !== 'undefined' && Comp.canPatternPart && Comp.canPatternPart(it, App.doc));
    if (!eligible.length) {
      UI.toast(T('asm.patNoParts'), { icon: 'info' });
      return null;
    }
    const rawIds = Array.isArray(ids) ? ids : (ids ? [ids] : App.sel);
    let initialSrc = null;
    for (const id of rawIds) {
      const t = Model.topOf(App.doc, id);
      if (t && eligible.includes(t)) { initialSrc = t; break; }
    }
    if (!initialSrc) initialSrc = eligible[0];

    const [defDx, defDy] = defaultStepFor(initialSrc.id);
    const st = {
      kind: initialKind === 'circ' || initialKind === 'mirror' ? initialKind : 'rect',
      sourceId: initialSrc.id,
      nx: 2,
      ny: 2,
      dx: defDx,
      dy: defDy,
      dxTouched: false,
      dyTouched: false,
      n: 4,
      ang: 360,
      axis: 'z',
      cx: 0,
      cy: 0,
      cz: 0,
      align: true,
      plane: 'YZ',
      datumId: '',
      off: 0,
    };

    const body = h('div', { id: 'asm-pattern-dialog', class: 'ap-dlg' });
    const partSel = h('select', { id: 'ap-dlg-part' });
    for (const it of eligible) {
      partSel.append(h('option', { value: it.id, selected: it.id === st.sourceId }, Model.label(it)));
    }
    const partWrap = h('div', { class: 'field' }, h('label', { for: 'ap-dlg-part' }, T('asm.patDlgPart')), h('div', { class: 'inp' }, partSel));

    const modes = h('div', { class: 'seg ap-modes', role: 'group', 'aria-label': T('asm.patDlgModeAria') });
    const modeBtns = {};
    for (const [k, ic, lbl] of [
      ['rect', 'patternRect', T('asm.patKindRect')],
      ['circ', 'patternCirc', T('asm.patKindCirc')],
      ['mirror', 'mirror', T('asm.patKindMirror')],
    ]) {
      const mb = h('button', { type: 'button', id: 'ap-mode-' + k, 'aria-pressed': String(st.kind === k) });
      mb.innerHTML = icon(ic) + esc(lbl);
      mb.onclick = () => { st.kind = k; syncModeUI(); };
      modeBtns[k] = mb;
      modes.append(mb);
    }

    const fieldsWrap = h('div', { id: 'ap-dlg-fields', class: 'ap-fields' });
    const summaryEl = h('div', { id: 'ap-dlg-summary', class: 'hint-box ap-summary' });

    const updateSummary = () => {
      const V = Model.vars(App.doc).v;
      let total = 2;
      if (st.kind === 'rect') {
        const nx = clamp(Math.round(Model.num(st.nx, V, 2)), 1, 50);
        const ny = clamp(Math.round(Model.num(st.ny, V, 2)), 1, 50);
        total = Math.min(101, nx * ny);
      } else if (st.kind === 'circ') {
        total = clamp(Math.round(Model.num(st.n, V, 4)), 1, 60);
      }
      summaryEl.textContent = st.kind === 'mirror'
        ? T('asm.patDlgSummaryMirror')
        : T('asm.patDlgSummary', { total, copies: Math.max(0, total - 1) });
    };

    const renderFields = () => {
      fieldsWrap.replaceChildren();
      if (st.kind === 'rect') {
        const row1 = h('div', { class: 'fields' },
          UI.numField({ id: 'ap-dlg-nx', label: T('asm.patNx'), value: st.nx, unit: '', min: 1, int: true, onCommit: (v) => { st.nx = v; updateSummary(); } }),
          UI.numField({ id: 'ap-dlg-ny', label: T('asm.patNy'), value: st.ny, unit: '', min: 1, int: true, onCommit: (v) => { st.ny = v; updateSummary(); } })
        );
        const row2 = h('div', { class: 'fields' },
          UI.numField({ id: 'ap-dlg-dx', label: T('asm.patDx'), value: st.dx, unit: 'mm', axis: 'x', onCommit: (v) => { st.dx = v; st.dxTouched = true; } }),
          UI.numField({ id: 'ap-dlg-dy', label: T('asm.patDy'), value: st.dy, unit: 'mm', axis: 'y', onCommit: (v) => { st.dy = v; st.dyTouched = true; } })
        );
        fieldsWrap.append(row1, row2);
      } else if (st.kind === 'circ') {
        const row1 = h('div', { class: 'fields' },
          UI.numField({ id: 'ap-dlg-n', label: T('asm.patCount'), value: st.n, unit: '', min: 2, int: true, onCommit: (v) => { st.n = v; updateSummary(); } }),
          UI.numField({ id: 'ap-dlg-ang', label: T('asm.patAngle'), value: st.ang, unit: '°', onCommit: (v) => { st.ang = v; } })
        );
        const axSel = UI.selectField({
          id: 'ap-dlg-axis',
          label: T('asm.patAxis'),
          value: st.axis,
          options: [['z', T('asm.patAxisZ')], ['x', T('asm.patAxisX')], ['y', T('asm.patAxisY')]],
          onChange: (v) => { st.axis = v; },
        });
        const row2 = h('div', { class: 'fields three' },
          UI.numField({ id: 'ap-dlg-cx', label: T('asm.patCenterX'), value: st.cx, unit: 'mm', axis: 'x', onCommit: (v) => { st.cx = v; } }),
          UI.numField({ id: 'ap-dlg-cy', label: T('asm.patCenterY'), value: st.cy, unit: 'mm', axis: 'y', onCommit: (v) => { st.cy = v; } }),
          UI.numField({ id: 'ap-dlg-cz', label: T('asm.patCenterZ'), value: st.cz, unit: 'mm', axis: 'z', onCommit: (v) => { st.cz = v; } })
        );
        const alChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ap-dlg-align', checked: st.align }), T('asm.patAlign'));
        alChk.querySelector('input').onchange = (e) => { st.align = e.target.checked; };
        fieldsWrap.append(row1, axSel, row2, alChk);
      } else {
        const planeOpts = [
          ['YZ', T('asm.patPlaneYZ')],
          ['XZ', T('asm.patPlaneXZ')],
          ['XY', T('asm.patPlaneXY')],
        ];
        for (const d of (App.doc.datums || [])) {
          if (d && d.id && d.plane) planeOpts.push(['datum:' + d.id, `${T('asm.patPlaneDatum')}: ${d.name || d.id}`]);
        }
        const curPlaneVal = st.plane === 'DATUM' && st.datumId ? ('datum:' + st.datumId) : st.plane;
        const plSel = UI.selectField({
          id: 'ap-dlg-plane',
          label: T('asm.patMirrorPlane'),
          value: curPlaneVal,
          options: planeOpts,
          onChange: (v) => {
            if (v.startsWith('datum:')) { st.plane = 'DATUM'; st.datumId = v.slice(6); }
            else { st.plane = v; st.datumId = ''; }
            syncOffVis();
          },
        });
        const offFld = UI.numField({ id: 'ap-dlg-off', label: T('asm.patMirrorOff'), value: st.off, unit: 'mm', onCommit: (v) => { st.off = v; } });
        const syncOffVis = () => { offFld.hidden = st.plane === 'DATUM'; };
        syncOffVis();
        fieldsWrap.append(plSel, offFld);
      }
      updateSummary();
    };

    const syncModeUI = () => {
      for (const [k, btn] of Object.entries(modeBtns)) btn.setAttribute('aria-pressed', String(st.kind === k));
      renderFields();
    };

    partSel.onchange = () => {
      st.sourceId = partSel.value;
      if (!st.dxTouched || !st.dyTouched) {
        const [nxDx, nxDy] = defaultStepFor(st.sourceId);
        if (!st.dxTouched) st.dx = nxDx;
        if (!st.dyTouched) st.dy = nxDy;
        if (st.kind === 'rect') renderFields();
      }
    };

    body.append(partWrap, modes, fieldsWrap, summaryEl);
    syncModeUI();

    return UI.modal({
      title: T('asm.patDlgTitle'),
      body,
      actions: [
        { label: T('common.cancel'), value: false },
        {
          id: 'ap-dlg-apply',
          label: T('asm.patDlgApply'),
          primary: true,
          run: () => {
            if (document.activeElement && body.contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }
            const opts = { ...st };
            delete opts.dxTouched;
            delete opts.dyTouched;
            delete opts.sourceId;
            delete opts.kind;
            createPattern(st.kind, [st.sourceId], opts);
          },
        },
      ],
    });
  }

  function patternSection(item) {
    if (!item || !item.id || !App.doc) return null;
    const list = patternsOf(item.id, App.doc);
    if (!list.length) return null;
    const sec = h('div', { class: 'section asm-pat-sec', id: 'asm-pat-sec', 'data-help': 'asmPattern' },
      h('div', { class: 'section-h' }, T('asm.patSecTitle'))
    );
    const single = list.length === 1;
    list.forEach((pat) => {
      const suf = single ? '' : ('-' + pat.id);
      const src = Model.find(App.doc, pat.sourceId)?.item;
      const total = 1 + (Array.isArray(pat.copyIds) ? pat.copyIds.length : 0);
      const isCopy = pat.sourceId !== item.id;
      const card = h('div', { class: 'ap-card', dataset: { patId: pat.id, patKind: pat.kind } });
      card.append(h('div', { class: 'hint-box' },
        isCopy
          ? T('asm.patCopyHint', { kind: patternKindLabel(pat.kind), src: src ? Model.label(src) : '?', total })
          : T('asm.patSrcHint', { kind: patternKindLabel(pat.kind), total })
      ));

      if (pat.kind === 'rect') {
        card.append(
          h('div', { class: 'fields' },
            UI.numField({ id: 'ap-nx' + suf, label: T('asm.patNx'), value: pat.nx ?? 2, unit: '', min: 1, int: true, onCommit: (v) => updatePattern(pat.id, { nx: v }, 'nx') }),
            UI.numField({ id: 'ap-ny' + suf, label: T('asm.patNy'), value: pat.ny ?? 2, unit: '', min: 1, int: true, onCommit: (v) => updatePattern(pat.id, { ny: v }, 'ny') })
          ),
          h('div', { class: 'fields' },
            UI.numField({ id: 'ap-dx' + suf, label: T('asm.patDx'), value: pat.dx ?? 30, unit: 'mm', axis: 'x', onCommit: (v) => updatePattern(pat.id, { dx: v }, 'dx') }),
            UI.numField({ id: 'ap-dy' + suf, label: T('asm.patDy'), value: pat.dy ?? 30, unit: 'mm', axis: 'y', onCommit: (v) => updatePattern(pat.id, { dy: v }, 'dy') })
          )
        );
      } else if (pat.kind === 'circ') {
        card.append(
          h('div', { class: 'fields' },
            UI.numField({ id: 'ap-n' + suf, label: T('asm.patCount'), value: pat.n ?? 4, unit: '', min: 2, int: true, onCommit: (v) => updatePattern(pat.id, { n: v }, 'n') }),
            UI.numField({ id: 'ap-ang' + suf, label: T('asm.patAngle'), value: pat.ang ?? 360, unit: '°', onCommit: (v) => updatePattern(pat.id, { ang: v }, 'ang') })
          ),
          UI.selectField({
            id: 'ap-axis' + suf,
            label: T('asm.patAxis'),
            value: pat.axis || 'z',
            options: [['z', T('asm.patAxisZ')], ['x', T('asm.patAxisX')], ['y', T('asm.patAxisY')]],
            onChange: (v) => updatePattern(pat.id, { axis: v }),
          }),
          h('div', { class: 'fields three' },
            UI.numField({ id: 'ap-cx' + suf, label: T('asm.patCenterX'), value: pat.cx ?? 0, unit: 'mm', axis: 'x', onCommit: (v) => updatePattern(pat.id, { cx: v }, 'cx') }),
            UI.numField({ id: 'ap-cy' + suf, label: T('asm.patCenterY'), value: pat.cy ?? 0, unit: 'mm', axis: 'y', onCommit: (v) => updatePattern(pat.id, { cy: v }, 'cy') }),
            UI.numField({ id: 'ap-cz' + suf, label: T('asm.patCenterZ'), value: pat.cz ?? 0, unit: 'mm', axis: 'z', onCommit: (v) => updatePattern(pat.id, { cz: v }, 'cz') })
          )
        );
        const alChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'ap-align' + suf, checked: pat.align !== false }), T('asm.patAlign'));
        alChk.querySelector('input').onchange = (e) => updatePattern(pat.id, { align: e.target.checked });
        card.append(alChk);
      } else {
        const planeOpts = [
          ['YZ', T('asm.patPlaneYZ')],
          ['XZ', T('asm.patPlaneXZ')],
          ['XY', T('asm.patPlaneXY')],
        ];
        for (const d of (App.doc.datums || [])) {
          if (d && d.id && d.plane) planeOpts.push(['datum:' + d.id, `${T('asm.patPlaneDatum')}: ${d.name || d.id}`]);
        }
        const curPl = pat.plane === 'DATUM' && pat.datumId ? ('datum:' + pat.datumId) : (pat.plane || 'YZ');
        card.append(UI.selectField({
          id: 'ap-plane' + suf,
          label: T('asm.patMirrorPlane'),
          value: curPl,
          options: planeOpts,
          onChange: (v) => v.startsWith('datum:')
            ? updatePattern(pat.id, { plane: 'DATUM', datumId: v.slice(6) })
            : updatePattern(pat.id, { plane: v, datumId: '' }),
        }));
        if (pat.plane !== 'DATUM') {
          card.append(UI.numField({ id: 'ap-off' + suf, label: T('asm.patMirrorOff'), value: pat.off ?? 0, unit: 'mm', onCommit: (v) => updatePattern(pat.id, { off: v }, 'off') }));
        }
      }

      const acts = h('div', { class: 'btn-row' });
      if (isCopy && src) {
        const sb = h('button', { type: 'button', class: 'btn small', id: 'ap-sel-src' + suf });
        sb.innerHTML = icon('pointer') + esc(T('asm.patSelectSrc'));
        sb.onclick = () => App.select([src.id]);
        acts.append(sb);
      }
      const allBtn = h('button', { type: 'button', class: 'btn small', id: 'ap-sel-all' + suf });
      allBtn.innerHTML = icon('patternRect') + esc(T('asm.patSelectAll'));
      allBtn.onclick = () => App.select([pat.sourceId, ...(pat.copyIds || [])].filter((id) => Model.find(App.doc, id)));
      acts.append(allBtn);
      if (Array.isArray(pat.skip) && pat.skip.length) {
        const rb = h('button', { type: 'button', class: 'btn small', id: 'ap-restore-skips' + suf }, T('asm.patRestoreSkips', { n: pat.skip.length }));
        rb.onclick = () => restorePatternSkips(pat.id);
        acts.append(rb);
      }
      const db = h('button', { type: 'button', class: 'btn small ghost', id: 'ap-dissolve' + suf });
      db.innerHTML = icon('ungroup') + esc(T('asm.patDissolveBtn'));
      db.onclick = () => dissolvePattern(pat.id);
      const del = h('button', { type: 'button', class: 'btn small ghost', id: 'ap-remove' + suf });
      del.innerHTML = icon('trash') + esc(T('asm.patRemoveBtn'));
      del.onclick = () => removePattern(pat.id);
      acts.append(db, del);
      card.append(acts);
      sec.append(card);
    });
    return sec;
  }

  function patternTreeSection() {
    const list = patterns();
    if (!list.length) return null;
    const sec = h('div', { class: 'datum-tree asm-pat-tree', id: 'asm-pat-tree', 'data-help': 'asmPattern' },
      h('div', { class: 'section-h' }, T('asm.patTreeTitle'))
    );
    for (const pat of list) {
      const src = Model.find(App.doc, pat.sourceId)?.item;
      const ids = [pat.sourceId, ...(pat.copyIds || [])].filter((id) => Model.find(App.doc, id));
      const total = ids.length;
      const sel = ids.some((id) => App.sel.includes(id));
      const row = h('div', {
        class: 'tree-row asm-pat-row' + (sel ? ' sel' : ''),
        tabindex: '0',
        role: 'button',
        dataset: { asmPat: pat.id, patKind: pat.kind },
      });
      const ic = h('span', { class: 'swatch' });
      ic.innerHTML = icon(pat.kind === 'mirror' ? 'mirror' : pat.kind === 'circ' ? 'patternCirc' : 'patternRect');
      const del = h('button', { type: 'button', class: 'j-del', 'aria-label': T('asm.patRemoveBtn'), 'data-tip': T('asm.patRemoveBtn') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); removePattern(pat.id); };
      const title = `${patternKindLabel(pat.kind)} · ${src ? Model.label(src) : '?'}`;
      row.append(ic, h('span', { class: 'nm', title }, title), h('span', { class: 'sub mono' }, `${total}×`), h('span', { class: 'm-acts' }, del));
      row.onclick = () => App.select(ids);
      row.addEventListener('keydown', (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); App.select(ids); }
      });
      sec.append(row);
    }
    return sec;
  }

  // ================= Anzeige-Zustände für Baugruppen (BG-27) =================
  const VALID_DISPLAY_MODES = new Set(['edges', 'shaded', 'wire', 'hidden', 'illustration']);
  function isProMode() {
    return typeof ViewPrefs === 'undefined' || !ViewPrefs.simple;
  }
  function displayStates(doc = App.doc) {
    return (doc && Array.isArray(doc.displayStates)) ? doc.displayStates : [];
  }
  function findDisplayState(idOrName, doc = App.doc) {
    const key = String(idOrName || '').trim();
    if (!key) return null;
    const list = displayStates(doc);
    return list.find((ds) => ds.id === key) || list.find((ds) => ds.name && ds.name.toLowerCase() === key.toLowerCase()) || null;
  }
  function captureDisplayState(doc = App.doc, opts = {}) {
    const items = {};
    Model.walk((doc && doc.items) || [], (it) => {
      if (!it || !it.id) return;
      items[it.id] = {
        hidden: !!it.hidden,
        opacity: (typeof it.opacity === 'number' && Number.isFinite(it.opacity) && it.opacity < 1)
          ? round(clamp(it.opacity, 0.05, 1), 3)
          : null,
        color: (typeof it.color === 'string' && it.color) ? it.color : null,
        colorSet: !!it.colorSet,
      };
    });
    let display = null;
    if (opts.includeDisplay !== false) {
      if (opts.display !== undefined) {
        display = typeof opts.display === 'string' && VALID_DISPLAY_MODES.has(opts.display) ? opts.display : null;
      } else if (typeof ViewPrefs !== 'undefined' && ViewPrefs.get) {
        const cur = ViewPrefs.get().display || 'edges';
        display = VALID_DISPLAY_MODES.has(cur) ? cur : 'edges';
      }
    }
    return { items, display };
  }
  function isDisplayStateActive(ds, doc = App.doc) {
    if (!ds || !ds.items || typeof ds.items !== 'object') return false;
    if (ds.display && typeof ViewPrefs !== 'undefined' && ViewPrefs.get) {
      const curDisp = ViewPrefs.get().display || 'edges';
      if (curDisp !== ds.display) return false;
    }
    let matched = 0;
    let mismatch = false;
    Model.walk((doc && doc.items) || [], (it) => {
      if (!it || !it.id) return;
      const saved = ds.items[it.id];
      if (!saved || typeof saved !== 'object') return;
      matched++;
      if (!!it.hidden !== !!saved.hidden) { mismatch = true; return false; }
      const curOp = (typeof it.opacity === 'number' && Number.isFinite(it.opacity) && it.opacity < 1) ? it.opacity : 1;
      const savOp = (typeof saved.opacity === 'number' && Number.isFinite(saved.opacity) && saved.opacity < 1) ? saved.opacity : 1;
      if (Math.abs(curOp - savOp) > 0.01) { mismatch = true; return false; }
      if (!!it.colorSet !== !!saved.colorSet) { mismatch = true; return false; }
      if (saved.colorSet && String(it.color || '').toLowerCase() !== String(saved.color || '').toLowerCase()) {
        mismatch = true;
        return false;
      }
    });
    return matched > 0 && !mismatch;
  }
  function activeDisplayState(doc = App.doc) {
    const list = displayStates(doc);
    if (!list.length) return null;
    if (doc && doc.displayState) {
      const cur = list.find((d) => d.id === doc.displayState);
      if (cur && isDisplayStateActive(cur, doc)) return cur;
    }
    return list.find((ds) => isDisplayStateActive(ds, doc)) || null;
  }
  function displayStateItemsList(doc = App.doc) {
    return ((doc && doc.items) || []).filter((it) => it && it.role !== 'hole' && !isStepMod(it));
  }
  function displayStateSummary(ds, doc = App.doc) {
    if (!ds || !ds.items || typeof ds.items !== 'object') return T('asm.dsAllVisible');
    let hidden = 0, trans = 0, colored = 0;
    for (const it of displayStateItemsList(doc)) {
      const st = ds.items[it.id];
      if (!st) continue;
      if (st.hidden) hidden++;
      if (typeof st.opacity === 'number' && st.opacity < 1) trans++;
      if (st.colorSet) colored++;
    }
    const parts = [];
    if (hidden) parts.push(T('asm.dsSumHidden', { n: hidden }));
    if (trans) parts.push(T('asm.dsSumTrans', { n: trans }));
    if (colored) parts.push(T('asm.dsSumColor', { n: colored }));
    if (ds.display && ds.display !== 'edges') parts.push(T('menu.view.disp.' + ds.display));
    return parts.length ? parts.join(' · ') : T('asm.dsAllVisible');
  }
  function applyDisplayStateToDoc(doc, ds) {
    if (!doc || !ds) return false;
    const map = ds.items && typeof ds.items === 'object' ? ds.items : {};
    Model.walk(doc.items || [], (it) => {
      if (!it || !it.id) return;
      const st = map[it.id];
      if (!st || typeof st !== 'object') return;
      if (st.hidden) it.hidden = true;
      else delete it.hidden;
      if (typeof st.opacity === 'number' && Number.isFinite(st.opacity) && st.opacity < 1) {
        it.opacity = round(clamp(st.opacity, 0.05, 1), 3);
      } else {
        delete it.opacity;
      }
      if (st.colorSet) {
        it.colorSet = true;
        if (st.color) it.color = st.color;
      } else {
        delete it.colorSet;
        if (st.color) it.color = st.color;
      }
    });
    doc.displayState = ds.id;
    return true;
  }
  function syncViewerDisplayNow(doc = App.doc) {
    if (!doc || typeof Viewer === 'undefined' || !Viewer.nodes) return;
    for (const [id] of Viewer.nodes) {
      const it = (doc.items || []).find((x) => x && x.id === id)
        || (typeof App !== 'undefined' && Array.isArray(App.extra) ? App.extra.find((x) => x && x.id === id) : null);
      if (!it) continue;
      const mat = it.mat || (doc.settings && doc.settings.material) || null;
      const L = Viewer.lookOf ? Viewer.lookOf(mat) : {};
      const look = { ...L, mat, matCol: L.nat && !it.colorSet ? L.col : null, customColor: !!it.colorSet };
      const hideSet = (typeof App !== 'undefined' && App.hideIds) ? App.hideIds : new Set();
      const isoId = typeof App !== 'undefined' ? App.iso : null;
      Viewer.updateNode(id, {
        visible: !it.hidden && !hideSet.has(id) && (!isoId || isoId === id),
        opacity: it.opacity ?? null,
        color: it.color || '#2f9e91',
        look,
      });
    }
    if (typeof App !== 'undefined' && App.applyView) App.applyView();
  }
  function saveDisplayState(name, opts = {}) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    if (!App.doc || !Array.isArray(App.doc.items) || !App.doc.items.length) {
      if (!opts.silent) UI.toast(T('asm.dsNoPartsSave'), { icon: 'info' });
      return null;
    }
    const snap = captureDisplayState(App.doc, opts);
    let saved = null;
    App.change(T('asm.dsSavedUndo', { name: clean }), (doc) => {
      doc.displayStates = Array.isArray(doc.displayStates) ? doc.displayStates : [];
      const low = clean.toLowerCase();
      let idx = opts.id ? doc.displayStates.findIndex((d) => d && d.id === opts.id) : -1;
      if (idx < 0) idx = doc.displayStates.findIndex((d) => d && typeof d.name === 'string' && d.name.toLowerCase() === low);
      if (idx >= 0) {
        doc.displayStates[idx] = { ...doc.displayStates[idx], name: clean, items: snap.items, display: snap.display };
        saved = doc.displayStates[idx];
      } else {
        saved = { id: uid('ds'), name: clean, items: snap.items, display: snap.display };
        doc.displayStates.push(saved);
      }
      doc.displayState = saved.id;
    });
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
    if (!opts.silent && saved) UI.toast(T('asm.dsSavedToast', { name: saved.name }), { icon: 'check', ms: 2200 });
    return saved;
  }
  function updateDisplayState(id, opts = {}) {
    const ds = findDisplayState(id);
    if (!ds) return null;
    return saveDisplayState(ds.name, { ...opts, id: ds.id });
  }
  function setDisplayStateItem(dsId, itemId, patch = {}) {
    if (!dsId || !itemId || !App.doc) return false;
    let ok = false;
    let activeChanged = false;
    App.change(T('asm.dsUpdatedUndo'), (doc) => {
      const ds = findDisplayState(dsId, doc);
      const f = Model.find(doc, itemId);
      if (!ds || !f || !f.item) return false;
      ds.items = ds.items && typeof ds.items === 'object' ? ds.items : {};
      const cur = ds.items[itemId] || {
        hidden: !!f.item.hidden,
        opacity: (typeof f.item.opacity === 'number' && f.item.opacity < 1) ? f.item.opacity : null,
        color: f.item.color || null,
        colorSet: !!f.item.colorSet,
      };
      const next = { ...cur };
      if ('hidden' in patch) next.hidden = !!patch.hidden;
      if ('opacity' in patch) {
        const op = Number(patch.opacity);
        next.opacity = (patch.opacity != null && Number.isFinite(op) && op < 1) ? round(clamp(op, 0.05, 1), 3) : null;
      }
      if ('color' in patch) next.color = (typeof patch.color === 'string' && patch.color) ? patch.color : null;
      if ('colorSet' in patch) next.colorSet = !!patch.colorSet;
      ds.items[itemId] = next;
      ok = true;
      if (doc.displayState === ds.id) {
        if (next.hidden) f.item.hidden = true;
        else delete f.item.hidden;
        if (next.opacity != null && next.opacity < 1) f.item.opacity = next.opacity;
        else delete f.item.opacity;
        if (next.colorSet) {
          f.item.colorSet = true;
          if (next.color) f.item.color = next.color;
        } else {
          delete f.item.colorSet;
          if (next.color) f.item.color = next.color;
        }
        activeChanged = true;
      }
      return true;
    });
    if (activeChanged) syncViewerDisplayNow(App.doc);
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
    return ok;
  }
  function setDisplayStateMode(dsId, mode) {
    if (!dsId || !App.doc) return false;
    const nextMode = typeof mode === 'string' && VALID_DISPLAY_MODES.has(mode) ? mode : null;
    let isAct = false;
    const ok = App.change(T('asm.dsUpdatedUndo'), (doc) => {
      const ds = findDisplayState(dsId, doc);
      if (!ds) return false;
      if ((ds.display || null) === nextMode) return false;
      ds.display = nextMode;
      isAct = doc.displayState === ds.id;
      return true;
    }) !== false;
    if (ok && isAct && nextMode && typeof ViewPrefs !== 'undefined' && ViewPrefs.applyDisplayState) {
      ViewPrefs.applyDisplayState({ display: nextMode });
    }
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
    return ok;
  }
  function renameDisplayState(id, newName) {
    const clean = String(newName || '').trim();
    if (!clean) return false;
    const low = clean.toLowerCase();
    const ok = App.change(T('asm.dsRenamedUndo', { name: clean }), (doc) => {
      const list = Array.isArray(doc.displayStates) ? doc.displayStates : [];
      const ds = list.find((x) => x.id === id);
      if (!ds) return false;
      if (list.some((x) => x.id !== id && x.name && x.name.toLowerCase() === low)) return false;
      ds.name = clean;
      return true;
    }) !== false;
    if (ok && typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
    return ok;
  }
  function removeDisplayState(id) {
    const ds = findDisplayState(id);
    if (!ds) return false;
    const ok = App.change(T('asm.dsRemovedUndo', { name: ds.name }), (doc) => {
      doc.displayStates = (doc.displayStates || []).filter((x) => x.id !== ds.id);
      if (doc.displayState === ds.id) delete doc.displayState;
      return true;
    }) !== false;
    if (ok) {
      if (typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
      UI.toast(T('asm.dsRemovedToast', { name: ds.name }), { icon: 'info', ms: 2000 });
    }
    return ok;
  }
  function applyDisplayState(idOrName, opts = {}) {
    const ds = findDisplayState(idOrName);
    if (!ds) return false;
    const ok = App.change(T('asm.dsAppliedUndo', { name: ds.name }), (doc) => {
      const target = findDisplayState(ds.id, doc);
      if (!target) return false;
      return applyDisplayStateToDoc(doc, target);
    }) !== false;
    if (!ok) return false;
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.applyDisplayState) ViewPrefs.applyDisplayState(ds);
    syncViewerDisplayNow(App.doc);
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.refreshLookPanel) ViewPrefs.refreshLookPanel();
    if (!opts.silent) UI.toast(T('asm.dsAppliedToast', { name: ds.name }), { icon: 'check', ms: 2000 });
    return true;
  }
  function defaultDisplayStateName(doc = App.doc) {
    const existing = new Set(displayStates(doc).map((d) => (d.name || '').toLowerCase()));
    const suggestions = String(T('asm.dsDefaults') || 'Standard,ohne Deckel,Innenleben,Durchsichtig').split(',').map((s) => s.trim()).filter(Boolean);
    for (const s of suggestions) {
      if (!existing.has(s.toLowerCase())) return s;
    }
    return T('asm.dsDefaultN', { n: displayStates(doc).length + 1 });
  }
  async function promptSaveDisplayState() {
    if (!isProMode()) return null;
    if (!App.doc || !Array.isArray(App.doc.items) || !App.doc.items.length) {
      UI.toast(T('asm.dsNoPartsSave'), { icon: 'info' });
      return null;
    }
    const n = await UI.prompt(T('asm.dsPromptTitle'), T('asm.dsPromptLabel'), defaultDisplayStateName(), T('common.save'));
    if (!n || !n.trim()) return null;
    return saveDisplayState(n.trim());
  }
  function displayStateDialog(initialId = null) {
    if (!isProMode() || !App.doc) return null;
    const existing = document.getElementById('ds-dialog');
    if (existing) return null;

    let selId = initialId ? (findDisplayState(initialId)?.id || null) : (activeDisplayState()?.id || (displayStates()[0]?.id || null));
    const body = h('div', { id: 'ds-dialog', class: 'ds-dlg' });
    const bar = h('div', { class: 'ds-bar' });
    const content = h('div', { class: 'ds-content' });
    body.append(h('div', { class: 'hint-box' }, T('asm.dsDlgHint')), bar, content);

    let unsub = null;
    const rebuild = () => {
      const list = displayStates();
      if (!selId || !list.some((x) => x.id === selId)) {
        selId = activeDisplayState()?.id || (list[0]?.id || null);
      }
      const ds = selId ? list.find((x) => x.id === selId) : null;

      bar.replaceChildren();
      const sel = h('select', { id: 'ds-dlg-sel', 'aria-label': T('asm.dsHeading') });
      if (!list.length) sel.append(h('option', { value: '' }, T('asm.dsNoneOption')));
      for (const x of list) sel.append(h('option', { value: x.id, selected: x.id === selId }, x.name));
      sel.onchange = () => {
        selId = sel.value || null;
        if (selId) applyDisplayState(selId, { silent: true });
        rebuild();
      };

      const newBtn = h('button', { type: 'button', class: 'btn small', id: 'ds-dlg-new' });
      newBtn.innerHTML = icon('plus') + esc(T('asm.dsNewBtn'));
      newBtn.onclick = async () => {
        const res = await promptSaveDisplayState();
        if (res) { selId = res.id; rebuild(); }
      };

      const updBtn = h('button', { type: 'button', class: 'btn small', id: 'ds-dlg-upd', disabled: !ds });
      updBtn.innerHTML = icon('save') + esc(T('asm.dsUpdateShort'));
      updBtn.onclick = () => { if (ds) updateDisplayState(ds.id); };

      const renBtn = h('button', { type: 'button', class: 'btn small', id: 'ds-dlg-ren', disabled: !ds });
      renBtn.innerHTML = icon('edit') + esc(T('common.rename'));
      renBtn.onclick = async () => {
        if (!ds) return;
        const n = await UI.prompt(T('asm.dsRenameTitle'), T('common.name'), ds.name, T('common.rename'));
        if (n && n.trim()) renameDisplayState(ds.id, n);
      };

      const delBtn = h('button', { type: 'button', class: 'btn small ghost danger', id: 'ds-dlg-del', disabled: !ds });
      delBtn.innerHTML = icon('trash');
      delBtn.onclick = () => {
        if (!ds) return;
        removeDisplayState(ds.id);
      };

      bar.append(sel, newBtn, updBtn, renBtn, delBtn);
      content.replaceChildren();
      if (!ds) {
        content.append(h('div', { class: 'hint-box', id: 'ds-empty-hint' }, T('asm.dsEmptyHint')));
        return;
      }

      const modeSel = UI.selectField({
        id: 'ds-dlg-mode',
        label: T('asm.dsModeLabel'),
        value: ds.display || '',
        options: [
          ['', T('asm.dsModeKeep')],
          ['edges', T('menu.view.disp.edges')],
          ['shaded', T('menu.view.disp.shaded')],
          ['wire', T('menu.view.disp.wire')],
          ['hidden', T('menu.view.disp.hidden')],
          ['illustration', T('menu.view.disp.illustration')],
        ],
        onChange: (val) => setDisplayStateMode(ds.id, val),
      });
      content.append(modeSel);

      const parts = displayStateItemsList(App.doc);
      if (!parts.length) {
        content.append(h('div', { class: 'hint-box' }, T('asm.dsNoPartsSave')));
        return;
      }

      const tbl = h('table', { class: 'vtable ds-table', id: 'ds-items-table' },
        h('tr', null,
          h('th', null, T('asm.dsColPart')),
          h('th', null, T('asm.dsColVisible')),
          h('th', null, T('asm.dsColOpacity')),
          h('th', null, T('asm.dsColColor'))
        )
      );
      for (const it of parts) {
        const st = (ds.items && ds.items[it.id]) || {
          hidden: !!it.hidden,
          opacity: (typeof it.opacity === 'number' && it.opacity < 1) ? it.opacity : null,
          color: it.color || '#2f9e91',
          colorSet: !!it.colorSet,
        };
        const visChk = h('input', { type: 'checkbox', class: 'ds-vis-chk', checked: !st.hidden, dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.dsColVisible')}` });
        visChk.onchange = () => setDisplayStateItem(ds.id, it.id, { hidden: !visChk.checked });

        const opPct = Math.round(((typeof st.opacity === 'number' && st.opacity < 1) ? st.opacity : 1) * 100);
        const opInp = h('input', { type: 'number', class: 'ds-opac-inp mono', min: '5', max: '100', step: '5', value: String(opPct), dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.dsColOpacity')}` });
        opInp.onchange = () => {
          const pct = clamp(Number(opInp.value) || 100, 5, 100);
          opInp.value = String(Math.round(pct));
          setDisplayStateItem(ds.id, it.id, { opacity: pct >= 100 ? null : pct / 100 });
        };

        const colSetChk = h('input', { type: 'checkbox', class: 'ds-colset-chk', checked: !!st.colorSet, dataset: { itemId: it.id }, title: T('asm.dsCustomColorTip') });
        const colVal = (st.color && /^#[0-9a-fA-F]{6}$/.test(st.color)) ? st.color : '#2f9e91';
        const colInp = h('input', { type: 'color', class: 'ds-col-inp', value: colVal, dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.dsColColor')}` });
        colSetChk.onchange = () => setDisplayStateItem(ds.id, it.id, { colorSet: colSetChk.checked, ...(colSetChk.checked ? { color: colInp.value } : {}) });
        colInp.onchange = () => {
          colSetChk.checked = true;
          setDisplayStateItem(ds.id, it.id, { color: colInp.value, colorSet: true });
        };

        tbl.append(h('tr', { dataset: { itemId: it.id } },
          h('td', null, Model.label(it)),
          h('td', null, visChk),
          h('td', null, h('div', { class: 'ds-opac-cell' }, opInp, h('span', { class: 'muted' }, '%'))),
          h('td', null, h('div', { class: 'ds-color-cell' }, colSetChk, colInp))
        ));
      }
      content.append(h('div', { class: 'ds-table-wrap' }, tbl));
    };

    unsub = App.on('doc', rebuild);
    rebuild();
    return UI.modal({
      title: T('asm.dsDlgTitle'),
      body,
      wide: true,
      actions: [{ label: T('common.close'), primary: true }],
      onClose: () => { if (unsub) { unsub(); unsub = null; } },
    });
  }
  function displayStateTreeSection() {
    const list = displayStates();
    if (!isAssembly() && !list.length) return null;
    const head = h('div', { class: 'section-h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } }, h('span', null, T('asm.dsHeading')));
    const addBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-ds-save', 'data-help': 'displayStates' });
    addBtn.innerHTML = icon('plus') + esc(T('asm.dsSaveShort'));
    addBtn.onclick = (e) => { e.stopPropagation(); promptSaveDisplayState(); };
    const editBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-ds-edit', 'data-help': 'displayStates' }, T('asm.dsManageBtn'));
    editBtn.onclick = (e) => { e.stopPropagation(); displayStateDialog(); };
    head.append(h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } }, addBtn, editBtn));

    const sec = h('div', { class: 'datum-tree ds-tree pro', id: 'ds-tree', 'data-help': 'displayStates' }, head);
    if (!list.length) {
      sec.append(h('div', { class: 'hint-box' }, T('asm.dsEmptyHint')));
      return sec;
    }
    const act = activeDisplayState();
    for (const ds of list) {
      const on = !!(act && act.id === ds.id);
      const row = h('div', {
        class: 'tree-row ds-row' + (on ? ' sel' : ''),
        tabindex: '0',
        role: 'button',
        'aria-pressed': on ? 'true' : 'false',
        dataset: { ds: ds.id, dsName: ds.name },
      });
      const ic = h('span', { class: 'swatch ds' }); ic.innerHTML = icon(on ? 'check' : 'eye');
      const upd = h('button', { type: 'button', class: 'ds-upd', 'aria-label': T('asm.dsUpdateTip'), 'data-tip': T('asm.dsUpdateTip') });
      upd.innerHTML = icon('save');
      upd.onclick = (e) => { e.stopPropagation(); updateDisplayState(ds.id); };
      const del = h('button', { type: 'button', class: 'j-del ds-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); removeDisplayState(ds.id); };
      row.append(
        ic,
        h('span', { class: 'nm', title: ds.name }, ds.name),
        h('span', { class: 'sub mono' }, displayStateSummary(ds)),
        h('span', { class: 'm-acts' }, upd, del)
      );
      row.onclick = () => applyDisplayState(ds.id);
      row.addEventListener('keydown', (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyDisplayState(ds.id); }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'eye', label: T('asm.dsApplyMenu'), run: () => applyDisplayState(ds.id) },
          { icon: 'save', label: T('asm.dsUpdateMenu'), run: () => updateDisplayState(ds.id) },
          { icon: 'sliders', label: T('asm.dsEditMenu'), run: () => displayStateDialog(ds.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('asm.dsRenameTitle'), T('common.name'), ds.name, T('common.rename')); if (n && n.trim()) renameDisplayState(ds.id, n); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => removeDisplayState(ds.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }
  function displayStateSection(ctx = 'proj') {
    const list = displayStates();
    if (!isAssembly() && !list.length) return null;
    const sec = h('div', { class: 'section pro ds-sec', id: ctx + '-ds-sec', 'data-help': 'displayStates' },
      h('div', { class: 'section-h' }, T('asm.dsHeading'))
    );
    const act = activeDisplayState();
    if (list.length) {
      const chips = h('div', { class: 'ds-chips' });
      for (const ds of list) {
        const on = !!(act && act.id === ds.id);
        const btn = h('button', {
          type: 'button',
          class: 'btn small ds-chip' + (on ? ' primary' : ''),
          'aria-pressed': on ? 'true' : 'false',
          dataset: { dsApply: ds.id, dsName: ds.name },
        }, h('span', { class: 'ds-chip-nm' }, ds.name), h('span', { class: 'sub mono' }, displayStateSummary(ds)));
        btn.onclick = () => applyDisplayState(ds.id);
        chips.append(btn);
      }
      sec.append(chips);
    } else {
      sec.append(h('div', { class: 'hint-box' }, T('asm.dsEmptyHint')));
    }
    const inp = h('input', {
      type: 'text',
      id: ctx + '-ds-name',
      class: 'ds-name-inp',
      placeholder: T('asm.dsNamePh'),
      'aria-label': T('asm.dsPromptLabel'),
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const saveBtn = h('button', { type: 'button', class: 'btn small', id: ctx + '-ds-save' });
    saveBtn.innerHTML = icon('plus') + esc(T('asm.dsSaveShort'));
    const doSave = () => {
      const nm = inp.value.trim();
      if (nm) { saveDisplayState(nm); inp.value = ''; }
      else promptSaveDisplayState();
    };
    saveBtn.onclick = doSave;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
    const manBtn = h('button', { type: 'button', class: 'btn small ghost', id: ctx + '-ds-manage' }, T('asm.dsManageBtn'));
    manBtn.onclick = () => displayStateDialog();
    sec.append(h('div', { class: 'ds-save-row' }, inp, saveBtn, manBtn));
    return sec;
  }

  // ================= Varianten für Baugruppen (BG-28) =================
  const ASM_SKIP_P_KEYS = new Set([
    'lib', 'fmt', 'file', 'blobId', 'data', 'stepEntity', 'stepMat', 'sketch', 'sketches',
    'path', 'rail', 'rail2', 'path3d', 'sketch3d', 'target', 'targets', 'features', 'wrapId',
    'sketch3dId', 'sourceId', 'face', 'faceRef', 'toFace', 'datumId', 'axisId', 'axisEnt',
    'op', 'assembly', 'docId', 'docName', 'docType', 'variantId',
  ]);
  function asmVariants(doc = App.doc) {
    return (doc && Array.isArray(doc.asmVariants)) ? doc.asmVariants : [];
  }
  function findAsmVariant(idOrName, doc = App.doc) {
    const key = String(idOrName || '').trim();
    if (!key) return null;
    const list = asmVariants(doc);
    return list.find((av) => av.id === key) || list.find((av) => av.name && av.name.toLowerCase() === key.toLowerCase()) || null;
  }
  function captureItemParams(it) {
    if (!it || !it.p || typeof it.p !== 'object' || it.kind === 'ref' || it.kind === 'group') return null;
    const out = {};
    for (const [k, val] of Object.entries(it.p)) {
      if (ASM_SKIP_P_KEYS.has(k)) continue;
      if ((typeof val === 'number' && Number.isFinite(val)) || typeof val === 'string' || typeof val === 'boolean') {
        out[k] = val;
      }
    }
    return Object.keys(out).length ? out : null;
  }
  function asmVariantPartsList(doc = App.doc) {
    return ((doc && doc.items) || []).filter((it) => it && it.role !== 'hole' && !isStepMod(it) && !isPatternCopy(it.id, doc));
  }
  function captureAsmVariant(doc = App.doc) {
    const values = {};
    for (const p of (doc && doc.params) || []) {
      if (p && p.name) values[p.name] = p.expr;
    }
    const suppressed = [];
    const refs = {};
    const itemParams = {};
    for (const it of (doc && doc.items) || []) {
      if (!it || !it.id) continue;
      if (it.suppressed) suppressed.push(it.id);
      if (it.kind === 'ref' && it.p && it.p.docId) {
        refs[it.id] = {
          docId: it.p.docId,
          docName: it.p.docName || Model.label(it),
          ...(it.p.docType === 'assembly' ? { docType: 'assembly' } : {}),
          ...(it.p.variantId ? { variantId: it.p.variantId } : {}),
        };
      } else {
        const ip = captureItemParams(it);
        if (ip) itemParams[it.id] = ip;
      }
    }
    return { values, suppressed, refs, itemParams, displayStateId: null };
  }
  function asmVariantChanged(av, doc = App.doc) {
    if (!av || !doc) return { params: false, suppressed: false, refs: false, itemParams: false, any: false };
    const cur = captureAsmVariant(doc);
    const avVals = av.values || {};
    const params = Object.keys({ ...avVals, ...cur.values }).some((k) => String(avVals[k]) !== String(cur.values[k]));
    const existingIds = new Set((doc.items || []).map((x) => x && x.id).filter(Boolean));
    const sa = new Set((av.suppressed || []).filter((id) => existingIds.has(id)));
    const sb = new Set(cur.suppressed);
    const suppressed = sa.size !== sb.size || [...sa].some((id) => !sb.has(id));
    let refs = false;
    for (const [id, r] of Object.entries(av.refs || {})) {
      if (!existingIds.has(id) || !r) continue;
      const cr = cur.refs[id];
      if (!cr || cr.docId !== r.docId || (cr.variantId || '') !== (r.variantId || '')) { refs = true; break; }
    }
    let itemParams = false;
    for (const [id, ip] of Object.entries(av.itemParams || {})) {
      if (!existingIds.has(id) || !ip) continue;
      const cip = cur.itemParams[id] || {};
      if (Object.keys(ip).some((k) => String(ip[k]) !== String(cip[k]))) { itemParams = true; break; }
    }
    return { params, suppressed, refs, itemParams, any: params || suppressed || refs || itemParams };
  }
  function isAsmVariantActive(av, doc = App.doc) {
    return !!(av && doc && doc.asmVariant === av.id);
  }
  function activeAsmVariant(doc = App.doc) {
    const list = asmVariants(doc);
    if (!list.length || !doc || !doc.asmVariant) return null;
    return list.find((av) => av.id === doc.asmVariant) || null;
  }
  function asmVariantSummary(av, doc = App.doc) {
    if (!av) return '—';
    const parts = [];
    const list = asmVariants(doc);
    const base = list[0];
    if (base && base.id !== av.id) {
      for (const [k, val] of Object.entries(av.values || {})) {
        if (String((base.values || {})[k]) !== String(val)) {
          parts.push(`${k}=${String(val).replace('.', ',')}`);
          if (parts.length >= 2) break;
        }
      }
      let refDiff = 0;
      for (const [id, r] of Object.entries(av.refs || {})) {
        const br = (base.refs || {})[id];
        if (r && (!br || br.docId !== r.docId || (br.variantId || '') !== (r.variantId || ''))) refDiff++;
      }
      if (refDiff) parts.push(T('asm.varRefDiff', { n: refDiff }));
    } else {
      for (const [k, val] of Object.entries(av.values || {})) {
        parts.push(`${k}=${String(val).replace('.', ',')}`);
        if (parts.length >= 2) break;
      }
    }
    const supN = Array.isArray(av.suppressed) ? av.suppressed.filter((id) => (doc && doc.items || []).some((x) => x.id === id)).length : 0;
    if (supN) parts.push(T('asm.varSupCount', { n: supN }));
    return parts.length ? parts.join(' · ') : T('asm.varAllActive');
  }
  function applyAsmVariantToDoc(doc, av) {
    if (!doc || !av) return false;
    const vals = av.values || {};
    for (const p of doc.params || []) {
      if (p && Object.prototype.hasOwnProperty.call(vals, p.name)) p.expr = vals[p.name];
    }
    const supSet = new Set(Array.isArray(av.suppressed) ? av.suppressed : []);
    for (const it of doc.items || []) {
      if (!it) continue;
      if (supSet.has(it.id)) it.suppressed = true;
      else if (it.suppressed) delete it.suppressed;
    }
    const refs = av.refs || {};
    for (const [itemId, spec] of Object.entries(refs)) {
      if (!spec || !spec.docId) continue;
      const it = (doc.items || []).find((x) => x && x.id === itemId);
      if (!it || it.kind !== 'ref') continue;
      it.p = it.p || {};
      const prevDocName = it.p.docName || '';
      it.p.docId = spec.docId;
      it.p.docName = spec.docName || prevDocName;
      if (spec.docType === 'assembly') it.p.docType = 'assembly';
      else delete it.p.docType;
      if (spec.variantId) it.p.variantId = spec.variantId;
      else delete it.p.variantId;
      if ((!it.name || it.name === prevDocName) && spec.docName) it.name = spec.docName;
    }
    const itemParams = av.itemParams || {};
    for (const [itemId, ip] of Object.entries(itemParams)) {
      if (!ip || typeof ip !== 'object') continue;
      const it = (doc.items || []).find((x) => x && x.id === itemId);
      if (!it || it.kind === 'ref' || it.kind === 'group') continue;
      it.p = it.p || {};
      for (const [k, val] of Object.entries(ip)) {
        if (ASM_SKIP_P_KEYS.has(k)) continue;
        if ((typeof val === 'number' && Number.isFinite(val)) || typeof val === 'string' || typeof val === 'boolean') {
          it.p[k] = val;
        }
      }
    }
    if (typeof syncPatterns === 'function') syncPatterns(doc);
    if (av.displayStateId) {
      const ds = findDisplayState(av.displayStateId, doc);
      if (ds) applyDisplayStateToDoc(doc, ds);
    }
    doc.asmVariant = av.id;
    return true;
  }
  function saveAsmVariant(name, opts = {}) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const snap = captureAsmVariant(App.doc);
    const values = opts.values && typeof opts.values === 'object' ? { ...snap.values, ...opts.values } : snap.values;
    const suppressed = Array.isArray(opts.suppressed) ? [...new Set(opts.suppressed)] : snap.suppressed;
    const refs = opts.refs && typeof opts.refs === 'object' ? { ...snap.refs, ...deepClone(opts.refs) } : snap.refs;
    const itemParams = opts.itemParams && typeof opts.itemParams === 'object'
      ? (() => {
        const merged = { ...snap.itemParams };
        for (const [id, ip] of Object.entries(opts.itemParams)) {
          if (ip && typeof ip === 'object') merged[id] = { ...(merged[id] || {}), ...ip };
        }
        return merged;
      })()
      : snap.itemParams;
    const displayStateId = opts.displayStateId !== undefined ? (opts.displayStateId || null) : snap.displayStateId;
    const hasOverrides = !!(opts.values || opts.suppressed || opts.refs || opts.itemParams || opts.displayStateId);

    let saved = null;
    App.change(T('asm.varSavedUndo', { name: clean }), (doc) => {
      doc.asmVariants = Array.isArray(doc.asmVariants) ? doc.asmVariants : [];
      const low = clean.toLowerCase();
      let idx = opts.id ? doc.asmVariants.findIndex((x) => x && x.id === opts.id) : -1;
      if (idx < 0) idx = doc.asmVariants.findIndex((x) => x && typeof x.name === 'string' && x.name.toLowerCase() === low);
      if (idx >= 0) {
        doc.asmVariants[idx] = { ...doc.asmVariants[idx], name: clean, values, suppressed, refs, itemParams, displayStateId };
        saved = doc.asmVariants[idx];
      } else {
        saved = { id: uid('av'), name: clean, values, suppressed, refs, itemParams, displayStateId };
        doc.asmVariants.push(saved);
      }
      if (opts.activate !== false) {
        doc.asmVariant = saved.id;
        if (hasOverrides) applyAsmVariantToDoc(doc, saved);
      }
    });
    if (opts.activate !== false && hasOverrides) {
      if (saved && saved.displayStateId) {
        const ds = findDisplayState(saved.displayStateId, App.doc);
        if (ds && typeof ViewPrefs !== 'undefined' && ViewPrefs.applyDisplayState) ViewPrefs.applyDisplayState(ds);
        syncViewerDisplayNow(App.doc);
      }
    }
    if (!opts.silent && saved) UI.toast(T('asm.varSavedToast', { name: saved.name }), { icon: 'check', ms: 2200 });
    return saved;
  }
  function updateAsmVariant(id, opts = {}) {
    const av = findAsmVariant(id);
    if (!av) return null;
    return saveAsmVariant(av.name, { ...opts, id: av.id, displayStateId: opts.displayStateId !== undefined ? opts.displayStateId : av.displayStateId });
  }
  function duplicateAsmVariant(id) {
    const src = findAsmVariant(id);
    if (!src) return null;
    const used = new Set(asmVariants().map((x) => (x.name || '').toLowerCase()));
    const base = `${src.name} ${T('asm.varCopySuffix')}`;
    let name = base;
    let k = 2;
    while (used.has(name.toLowerCase())) { name = `${base} ${k}`; k++; }
    let copy = null;
    App.change(T('asm.varDupUndo', { name }), (doc) => {
      doc.asmVariants = Array.isArray(doc.asmVariants) ? doc.asmVariants : [];
      copy = { ...deepClone(src), id: uid('av'), name };
      const idx = doc.asmVariants.findIndex((x) => x.id === src.id);
      doc.asmVariants.splice(idx >= 0 ? idx + 1 : doc.asmVariants.length, 0, copy);
    });
    return copy;
  }
  function renameAsmVariant(id, newName) {
    const clean = String(newName || '').trim();
    if (!clean) return false;
    const low = clean.toLowerCase();
    return App.change(T('asm.varRenamedUndo', { name: clean }), (doc) => {
      const list = Array.isArray(doc.asmVariants) ? doc.asmVariants : [];
      const av = list.find((x) => x.id === id);
      if (!av) return false;
      if (list.some((x) => x.id !== id && x.name && x.name.toLowerCase() === low)) return false;
      av.name = clean;
      return true;
    }) !== false;
  }
  function removeAsmVariant(id) {
    const av = findAsmVariant(id);
    if (!av) return false;
    const ok = App.change(T('asm.varRemovedUndo', { name: av.name }), (doc) => {
      doc.asmVariants = (doc.asmVariants || []).filter((x) => x.id !== av.id);
      if (doc.asmVariant === av.id) delete doc.asmVariant;
      return true;
    }) !== false;
    if (ok) UI.toast(T('asm.varRemovedToast', { name: av.name }), { icon: 'info', ms: 2000 });
    return ok;
  }
  function applyAsmVariant(idOrName, opts = {}) {
    const av = findAsmVariant(idOrName);
    if (!av) return false;
    const ok = App.change(T('asm.varAppliedUndo', { name: av.name }), (doc) => {
      const target = findAsmVariant(av.id, doc);
      if (!target) return false;
      return applyAsmVariantToDoc(doc, target);
    }) !== false;
    if (!ok) return false;
    const liveAv = findAsmVariant(av.id, App.doc) || av;
    const missingRef = Object.values(liveAv.refs || {}).some((r) => r && r.docId && !Model.resolveDoc(r.docId));
    if (missingRef && typeof Comp !== 'undefined' && Comp.ensureRefs) {
      Comp.ensureRefs(App.doc).then(() => { if (typeof App !== 'undefined' && App.rebuild) App.rebuild(); });
    }
    if (liveAv.displayStateId) {
      const ds = findDisplayState(liveAv.displayStateId, App.doc);
      if (ds) {
        if (typeof ViewPrefs !== 'undefined' && ViewPrefs.applyDisplayState) ViewPrefs.applyDisplayState(ds);
        syncViewerDisplayNow(App.doc);
      }
    }
    if (!opts.silent) UI.toast(T('asm.varAppliedToast', { name: liveAv.name }), { icon: 'check', ms: 2000 });
    return true;
  }
  function parseVarInputValue(rawVal, extraVars = {}) {
    if (typeof rawVal === 'number' && Number.isFinite(rawVal)) return { ok: true, value: rawVal };
    const raw = String(rawVal == null ? '' : rawVal).trim();
    if (!raw) return { ok: false, error: T('asm.varEmptyValErr') };
    const n = parseNum(raw);
    if (!isNaN(n)) return { ok: true, value: n };
    const baseVars = { ...Model.vars(App.doc).v, ...extraVars };
    const res = Expr.tryEval(raw, baseVars, (App.doc && App.doc.tables) || []);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, value: raw };
  }
  function setAsmVariantParam(varId, paramName, rawVal) {
    const av = findAsmVariant(varId);
    if (!av || !paramName) return { ok: false, error: T('asm.varNotFound') };
    const vals = av.values || {};
    const tmp = { ...App.doc, params: (App.doc.params || []).map((p) => ({ ...p })), tables: App.doc.tables || [] };
    for (const p of tmp.params) if (Object.prototype.hasOwnProperty.call(vals, p.name)) p.expr = vals[p.name];
    for (const [k, val] of Object.entries(vals)) {
      if (!tmp.params.some((p) => p.name === k)) tmp.params.push({ id: uid('m'), name: k, expr: val });
    }
    const evalVars = Model.vars(tmp).v;
    for (const k of Object.keys(evalVars)) if (k.toLowerCase() === paramName.toLowerCase()) delete evalVars[k];
    const parsed = parseVarInputValue(rawVal, evalVars);
    if (!parsed.ok) return parsed;
    const nextVal = parsed.value;
    App.change(T('asm.varUpdatedUndo'), (doc) => {
      const target = findAsmVariant(varId, doc);
      if (!target) return false;
      target.values = target.values || {};
      target.values[paramName] = nextVal;
      if (doc.asmVariant === target.id) {
        const p = (doc.params || []).find((x) => x && x.name === paramName);
        if (p) {
          p.expr = nextVal;
          if (p.measure) delete p.measure;
        } else {
          doc.params = doc.params || [];
          doc.params.push({ id: uid('m'), name: paramName, expr: nextVal });
        }
      }
      return true;
    }, { merge: `avp:${varId}:${paramName}` });
    return { ok: true, value: nextVal };
  }
  function setAsmVariantSuppressed(varId, itemId, sup) {
    const want = !!sup;
    return App.change(T('asm.varUpdatedUndo'), (doc) => {
      const target = findAsmVariant(varId, doc);
      const f = Model.find(doc, itemId);
      if (!target || !f || !f.item) return false;
      const cur = new Set(Array.isArray(target.suppressed) ? target.suppressed : []);
      if (want) cur.add(itemId);
      else cur.delete(itemId);
      target.suppressed = [...cur];
      if (doc.asmVariant === target.id) {
        if (want) f.item.suppressed = true;
        else delete f.item.suppressed;
        if (typeof syncPatterns === 'function') syncPatterns(doc);
      }
      return true;
    }) !== false;
  }
  function setAsmVariantRef(varId, itemId, refPatch = {}) {
    if (!varId || !itemId || !refPatch || !refPatch.docId) return false;
    let needsLoad = false;
    const ok = App.change(T('asm.varUpdatedUndo'), (doc) => {
      const target = findAsmVariant(varId, doc);
      const it = (doc.items || []).find((x) => x && x.id === itemId);
      if (!target || !it || it.kind !== 'ref') return false;
      target.refs = target.refs && typeof target.refs === 'object' ? target.refs : {};
      const prev = target.refs[itemId] || {};
      const next = {
        docId: refPatch.docId,
        docName: refPatch.docName != null ? String(refPatch.docName) : (prev.docName || ''),
        ...(refPatch.docType === 'assembly' ? { docType: 'assembly' } : {}),
        ...(refPatch.variantId ? { variantId: String(refPatch.variantId) } : {}),
      };
      target.refs[itemId] = next;
      if (doc.asmVariant === target.id) {
        it.p = it.p || {};
        const prevDocName = it.p.docName || '';
        it.p.docId = next.docId;
        it.p.docName = next.docName || prevDocName;
        if (next.docType === 'assembly') it.p.docType = 'assembly';
        else delete it.p.docType;
        if (next.variantId) it.p.variantId = next.variantId;
        else delete it.p.variantId;
        if ((!it.name || it.name === prevDocName) && next.docName) it.name = next.docName;
        if (typeof syncPatterns === 'function') syncPatterns(doc);
        if (!Model.resolveDoc(next.docId)) needsLoad = true;
      }
      return true;
    }) !== false;
    if (ok && needsLoad && typeof Comp !== 'undefined' && Comp.ensureRefs) {
      Comp.ensureRefs(App.doc).then(() => { if (typeof App !== 'undefined' && App.rebuild) App.rebuild(); });
    }
    return ok;
  }
  function setAsmVariantItemParam(varId, itemId, key, rawVal) {
    if (!varId || !itemId || !key || ASM_SKIP_P_KEYS.has(key)) return { ok: false, error: T('asm.varNotFound') };
    const av = findAsmVariant(varId);
    if (!av) return { ok: false, error: T('asm.varNotFound') };
    const parsed = parseVarInputValue(rawVal, av.values || {});
    if (!parsed.ok) return parsed;
    const nextVal = parsed.value;
    App.change(T('asm.varUpdatedUndo'), (doc) => {
      const target = findAsmVariant(varId, doc);
      const it = (doc.items || []).find((x) => x && x.id === itemId);
      if (!target || !it || it.kind === 'ref' || it.kind === 'group') return false;
      target.itemParams = target.itemParams && typeof target.itemParams === 'object' ? target.itemParams : {};
      target.itemParams[itemId] = target.itemParams[itemId] || {};
      target.itemParams[itemId][key] = nextVal;
      if (doc.asmVariant === target.id) {
        it.p = it.p || {};
        it.p[key] = nextVal;
      }
      return true;
    }, { merge: `avip:${varId}:${itemId}:${key}` });
    return { ok: true, value: nextVal };
  }
  function setAsmVariantDisplayState(varId, dsId) {
    const nextDs = dsId ? String(dsId) : null;
    let applyLiveDs = null;
    const ok = App.change(T('asm.varUpdatedUndo'), (doc) => {
      const target = findAsmVariant(varId, doc);
      if (!target) return false;
      target.displayStateId = nextDs;
      if (doc.asmVariant === target.id && nextDs) {
        const ds = findDisplayState(nextDs, doc);
        if (ds) { applyDisplayStateToDoc(doc, ds); applyLiveDs = ds; }
      }
      return true;
    }) !== false;
    if (ok && applyLiveDs) {
      if (typeof ViewPrefs !== 'undefined' && ViewPrefs.applyDisplayState) ViewPrefs.applyDisplayState(applyLiveDs);
      syncViewerDisplayNow(App.doc);
    }
    return ok;
  }
  function editableItemParamFields(it) {
    if (!it || it.kind === 'ref' || it.kind === 'group') return [];
    if (typeof KINDS !== 'undefined' && KINDS[it.kind] && Array.isArray(KINDS[it.kind].params) && KINDS[it.kind].params.length) {
      return KINDS[it.kind].params.filter((q) => q && q.k && !ASM_SKIP_P_KEYS.has(q.k)).slice(0, 4);
    }
    if (it.kind === 'part' && it.p && it.p.lib && typeof LIBMAP !== 'undefined' && LIBMAP[it.p.lib] && Array.isArray(LIBMAP[it.p.lib].params)) {
      return LIBMAP[it.p.lib].params.filter((q) => q && q.k && q.type !== 'select' && !ASM_SKIP_P_KEYS.has(q.k)).slice(0, 3);
    }
    if (it.kind === 'extrude' && it.p) return [{ k: 'dist', label: T('asm.varFieldLen'), unit: 'mm' }];
    if (it.kind === 'revolve' && it.p) return [{ k: 'angle', label: T('asm.varFieldAngle'), unit: '°' }];
    return [];
  }
  function defaultAsmVariantName(doc = App.doc) {
    const existing = new Set(asmVariants(doc).map((x) => (x.name || '').toLowerCase()));
    const suggestions = String(T('asm.varDefaults') || 'Standard,lang,kurz,kompakt').split(',').map((s) => s.trim()).filter(Boolean);
    for (const s of suggestions) {
      if (!existing.has(s.toLowerCase())) return s;
    }
    return T('asm.varDefaultN', { n: asmVariants(doc).length + 1 });
  }
  async function promptSaveAsmVariant() {
    if (!isProMode()) return null;
    const n = await UI.prompt(T('asm.varPromptTitle'), T('asm.varPromptLabel'), defaultAsmVariantName(), T('common.save'));
    if (!n || !n.trim()) return null;
    return saveAsmVariant(n.trim());
  }
  function asmVariantDialog(initialId = null) {
    if (!isProMode() || !App.doc) return null;
    const existing = document.getElementById('asm-var-dialog');
    if (existing) return null;

    let selId = initialId ? (findAsmVariant(initialId)?.id || null) : (activeAsmVariant()?.id || (asmVariants()[0]?.id || null));
    const body = h('div', { id: 'asm-var-dialog', class: 'av-dlg' });
    const bar = h('div', { class: 'av-bar' });
    const content = h('div', { class: 'av-content' });
    body.append(h('div', { class: 'hint-box' }, T('asm.varDlgHint')), bar, content);

    let unsub = null;
    const rebuild = () => {
      const list = asmVariants();
      if (!selId || !list.some((x) => x.id === selId)) {
        selId = activeAsmVariant()?.id || (list[0]?.id || null);
      }
      const av = selId ? list.find((x) => x.id === selId) : null;

      bar.replaceChildren();
      const sel = h('select', { id: 'av-dlg-sel', 'aria-label': T('asm.varHeading') });
      if (!list.length) sel.append(h('option', { value: '' }, T('asm.varNoneOption')));
      for (const x of list) sel.append(h('option', { value: x.id, selected: x.id === selId }, x.name));
      sel.onchange = () => {
        selId = sel.value || null;
        if (selId) applyAsmVariant(selId, { silent: true });
        rebuild();
      };

      const newBtn = h('button', { type: 'button', class: 'btn small', id: 'av-dlg-new' });
      newBtn.innerHTML = icon('plus') + esc(T('asm.varNewBtn'));
      newBtn.onclick = async () => {
        const res = await promptSaveAsmVariant();
        if (res) { selId = res.id; rebuild(); }
      };

      const dupBtn = h('button', { type: 'button', class: 'btn small', id: 'av-dlg-dup', disabled: !av });
      dupBtn.innerHTML = icon('copy') + esc(T('asm.varDupBtn'));
      dupBtn.onclick = () => {
        if (!av) return;
        const c = duplicateAsmVariant(av.id);
        if (c) { selId = c.id; applyAsmVariant(c.id, { silent: true }); rebuild(); }
      };

      const renBtn = h('button', { type: 'button', class: 'btn small', id: 'av-dlg-ren', disabled: !av });
      renBtn.innerHTML = icon('edit') + esc(T('common.rename'));
      renBtn.onclick = async () => {
        if (!av) return;
        const n = await UI.prompt(T('asm.varRenameTitle'), T('common.name'), av.name, T('common.rename'));
        if (n && n.trim()) renameAsmVariant(av.id, n);
      };

      const delBtn = h('button', { type: 'button', class: 'btn small ghost danger', id: 'av-dlg-del', disabled: !av });
      delBtn.innerHTML = icon('trash');
      delBtn.onclick = () => { if (av) removeAsmVariant(av.id); };

      bar.append(sel, newBtn, dupBtn, renBtn, delBtn);
      content.replaceChildren();
      if (!av) {
        content.append(h('div', { class: 'hint-box', id: 'av-empty-hint' }, T('asm.varEmptyHint')));
        return;
      }

      const dsList = displayStates();
      const dsSel = UI.selectField({
        id: 'av-dlg-ds',
        label: T('asm.varLinkDsLabel'),
        value: av.displayStateId || '',
        options: [['', T('asm.varLinkDsNone')], ...dsList.map((d) => [d.id, d.name])],
        onChange: (val) => setAsmVariantDisplayState(av.id, val || null),
      });
      content.append(dsSel);

      const paramNames = [...new Set([
        ...(App.doc.params || []).map((p) => p && p.name).filter(Boolean),
        ...Object.keys(av.values || {}),
      ])];
      const parSec = h('div', { class: 'av-subsec', id: 'av-dlg-params' },
        h('div', { class: 'av-subhead' },
          h('b', null, T('asm.varParamsTitle')),
          h('button', { type: 'button', class: 'btn small ghost', id: 'av-dlg-add-param' }, T('asm.varAddParamBtn'))
        )
      );
      parSec.querySelector('#av-dlg-add-param').onclick = async () => {
        let idx = 1;
        while ((App.doc.params || []).some((p) => p.name === 'Maß' + idx)) idx++;
        const nm = await UI.prompt(T('asm.varAddParamTitle'), T('common.name'), 'Maß' + idx, T('common.save'));
        if (!nm || !nm.trim()) return;
        const cleanName = nm.trim().replace(/\s+/g, '_');
        if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(cleanName)) {
          UI.toast(T('left.par.badName'), { kind: 'bad' });
          return;
        }
        if (!(App.doc.params || []).some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
          App.change(T('asm.varAddParamTitle'), (doc) => {
            doc.params = doc.params || [];
            doc.params.push({ id: uid('m'), name: cleanName, expr: 50 });
            for (const v of doc.asmVariants || []) {
              v.values = v.values || {};
              if (!Object.prototype.hasOwnProperty.call(v.values, cleanName)) v.values[cleanName] = 50;
            }
          });
        }
      };

      if (paramNames.length) {
        const pGrid = h('div', { class: 'fields' });
        for (const pn of paramNames) {
          const curVal = Object.prototype.hasOwnProperty.call(av.values || {}, pn) ? av.values[pn] : '';
          const inp = h('input', {
            type: 'text',
            class: 'av-param-inp mono',
            value: curVal == null ? '' : String(curVal),
            dataset: { avParam: pn },
            'aria-label': pn,
            spellcheck: 'false',
          });
          inp.onchange = () => {
            const res = setAsmVariantParam(av.id, pn, inp.value);
            if (!res.ok) {
              inp.classList.add('invalid');
              UI.toast(res.error || T('asm.varEmptyValErr'), { kind: 'bad' });
              return;
            }
            inp.classList.remove('invalid');
            inp.value = String(res.value);
          };
          inp.addEventListener('keydown', (e) => e.stopPropagation());
          pGrid.append(h('div', { class: 'field' }, h('label', null, pn), h('div', { class: 'inp' }, inp)));
        }
        parSec.append(pGrid);
      } else {
        parSec.append(h('div', { class: 'hint-box' }, T('asm.varNoParamsHint')));
      }
      content.append(parSec);

      const parts = asmVariantPartsList(App.doc);
      const partSec = h('div', { class: 'av-subsec', id: 'av-dlg-parts' },
        h('div', { class: 'av-subhead' }, h('b', null, T('asm.varPartsTitle')))
      );
      if (!parts.length) {
        partSec.append(h('div', { class: 'hint-box' }, T('asm.varNoPartsHint')));
      } else {
        const supSet = new Set(Array.isArray(av.suppressed) ? av.suppressed : []);
        const avail = (typeof Comp !== 'undefined' && Comp.availableParts) ? Comp.availableParts() : [];
        const tbl = h('table', { class: 'vtable av-table', id: 'av-parts-table' },
          h('tr', null,
            h('th', null, T('asm.varColActive')),
            h('th', null, T('asm.varColPart')),
            h('th', null, T('asm.varColConfig'))
          )
        );
        for (const it of parts) {
          const isAct = !supSet.has(it.id);
          const actChk = h('input', { type: 'checkbox', class: 'av-act-chk', checked: isAct, dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.varColActive')}` });
          actChk.onchange = () => setAsmVariantSuppressed(av.id, it.id, !actChk.checked);

          const cfgCell = h('div', { class: 'av-dims-cell' });
          if (it.kind === 'ref') {
            const spec = (av.refs && av.refs[it.id]) || { docId: it.p && it.p.docId, docName: (it.p && it.p.docName) || Model.label(it), docType: it.p && it.p.docType, variantId: it.p && it.p.variantId };
            const optsMap = new Map();
            if (spec.docId) optsMap.set(spec.docId, { id: spec.docId, name: spec.docName || spec.docId, docType: spec.docType || 'part' });
            for (const p of avail) {
              if (p && p.id && !optsMap.has(p.id)) optsMap.set(p.id, p);
            }
            const refSel = h('select', { class: 'av-ref-doc', dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.varColConfig')}` });
            for (const opt of optsMap.values()) {
              refSel.append(h('option', { value: opt.id, selected: opt.id === spec.docId }, opt.name));
            }
            refSel.onchange = () => {
              const picked = optsMap.get(refSel.value);
              if (picked) setAsmVariantRef(av.id, it.id, { docId: picked.id, docName: picked.name, docType: picked.docType });
            };
            cfgCell.append(refSel);

            const refDoc = spec.docId ? Model.resolveDoc(spec.docId) : null;
            if (refDoc && Array.isArray(refDoc.variants) && refDoc.variants.length) {
              const varSel = h('select', { class: 'av-ref-var', dataset: { itemId: it.id }, 'aria-label': `${Model.label(it)} ${T('asm.varRefVariant')}` });
              varSel.append(h('option', { value: '' }, T('asm.varRefVarDefault')));
              for (const rv of refDoc.variants) {
                varSel.append(h('option', { value: rv.id, selected: rv.id === spec.variantId }, rv.name));
              }
              varSel.onchange = () => setAsmVariantRef(av.id, it.id, {
                docId: spec.docId,
                docName: spec.docName,
                docType: spec.docType,
                variantId: varSel.value || null,
              });
              cfgCell.append(varSel);
            }
          } else {
            const fields = editableItemParamFields(it);
            for (const f of fields) {
              const savedIp = av.itemParams && av.itemParams[it.id];
              const curV = (savedIp && Object.prototype.hasOwnProperty.call(savedIp, f.k)) ? savedIp[f.k] : (it.p ? it.p[f.k] : '');
              const inp = h('input', {
                type: 'text',
                class: 'av-ip-inp mono',
                value: curV == null ? '' : String(curV),
                dataset: { itemId: it.id, pKey: f.k },
                'aria-label': `${Model.label(it)} ${f.label}`,
                spellcheck: 'false',
              });
              inp.onchange = () => {
                const res = setAsmVariantItemParam(av.id, it.id, f.k, inp.value);
                if (!res.ok) {
                  inp.classList.add('invalid');
                  UI.toast(res.error || T('asm.varEmptyValErr'), { kind: 'bad' });
                  return;
                }
                inp.classList.remove('invalid');
                inp.value = String(res.value);
              };
              inp.addEventListener('keydown', (e) => e.stopPropagation());
              cfgCell.append(h('label', { class: 'av-ip-fld' }, h('span', null, f.label), inp));
            }
          }
          tbl.append(h('tr', { dataset: { itemId: it.id } },
            h('td', null, actChk),
            h('td', null, Model.label(it)),
            h('td', null, cfgCell)
          ));
        }
        partSec.append(h('div', { class: 'av-table-wrap' }, tbl));
      }
      content.append(partSec);
    };

    unsub = App.on('doc', rebuild);
    rebuild();
    return UI.modal({
      title: T('asm.varDlgTitle'),
      body,
      wide: true,
      actions: [{ label: T('common.close'), primary: true }],
      onClose: () => { if (unsub) { unsub(); unsub = null; } },
    });
  }
  function asmVariantTreeSection() {
    const list = asmVariants();
    if (!isAssembly() && !list.length) return null;
    const head = h('div', { class: 'section-h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } }, h('span', null, T('asm.varHeading')));
    const addBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-av-save', 'data-help': 'asmVariants' });
    addBtn.innerHTML = icon('plus') + esc(T('asm.varSaveShort'));
    addBtn.onclick = (e) => { e.stopPropagation(); promptSaveAsmVariant(); };
    const editBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-av-edit', 'data-help': 'asmVariants' }, T('asm.varManageBtn'));
    editBtn.onclick = (e) => { e.stopPropagation(); asmVariantDialog(); };
    head.append(h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } }, addBtn, editBtn));

    const sec = h('div', { class: 'datum-tree av-tree pro', id: 'asm-var-tree', 'data-help': 'asmVariants' }, head);
    if (!list.length) {
      sec.append(h('div', { class: 'hint-box' }, T('asm.varEmptyHint')));
      return sec;
    }
    const act = activeAsmVariant();
    for (const av of list) {
      const on = !!(act && act.id === av.id);
      const row = h('div', {
        class: 'tree-row av-row' + (on ? ' sel' : ''),
        tabindex: '0',
        role: 'button',
        'aria-pressed': on ? 'true' : 'false',
        dataset: { av: av.id, avName: av.name },
      });
      const ic = h('span', { class: 'swatch av' }); ic.innerHTML = icon(on ? 'check' : 'sliders');
      const upd = h('button', { type: 'button', class: 'av-upd', 'aria-label': T('asm.varUpdateTip'), 'data-tip': T('asm.varUpdateTip') });
      upd.innerHTML = icon('save');
      upd.onclick = (e) => { e.stopPropagation(); updateAsmVariant(av.id); };
      const del = h('button', { type: 'button', class: 'j-del av-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); removeAsmVariant(av.id); };
      row.append(
        ic,
        h('span', { class: 'nm', title: av.name }, av.name),
        h('span', { class: 'sub mono' }, asmVariantSummary(av)),
        h('span', { class: 'm-acts' }, upd, del)
      );
      row.onclick = () => applyAsmVariant(av.id);
      row.addEventListener('keydown', (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyAsmVariant(av.id); }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'play', label: T('asm.varApplyMenu'), run: () => applyAsmVariant(av.id) },
          { icon: 'save', label: T('asm.varUpdateMenu'), run: () => updateAsmVariant(av.id) },
          { icon: 'sliders', label: T('asm.varEditMenu'), run: () => asmVariantDialog(av.id) },
          { icon: 'copy', label: T('asm.varDupBtn'), run: () => duplicateAsmVariant(av.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('asm.varRenameTitle'), T('common.name'), av.name, T('common.rename')); if (n && n.trim()) renameAsmVariant(av.id, n); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => removeAsmVariant(av.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }
  function asmVariantSection(ctx = 'proj') {
    const list = asmVariants();
    if (!isAssembly() && !list.length) return null;
    const sec = h('div', { class: 'section pro av-sec', id: ctx + '-av-sec', 'data-help': 'asmVariants' },
      h('div', { class: 'section-h' }, T('asm.varHeading'))
    );
    const act = activeAsmVariant();
    if (list.length) {
      const chips = h('div', { class: 'av-chips' });
      for (const av of list) {
        const on = !!(act && act.id === av.id);
        const btn = h('button', {
          type: 'button',
          class: 'btn small av-chip' + (on ? ' primary' : ''),
          'aria-pressed': on ? 'true' : 'false',
          dataset: { avApply: av.id, avName: av.name },
        }, h('span', { class: 'av-chip-nm' }, av.name), h('span', { class: 'sub mono' }, asmVariantSummary(av)));
        btn.onclick = () => applyAsmVariant(av.id);
        chips.append(btn);
      }
      sec.append(chips);
    } else {
      sec.append(h('div', { class: 'hint-box' }, T('asm.varEmptyHint')));
    }
    const diff = act ? asmVariantChanged(act) : null;
    if (act && diff && diff.any) {
      sec.append(h('div', { class: 'hint-box warn' }, T('asm.varChangedHint', { name: act.name })));
    }
    const inp = h('input', {
      type: 'text',
      id: ctx + '-av-name',
      class: 'av-name-inp',
      placeholder: T('asm.varNamePh'),
      'aria-label': T('asm.varPromptLabel'),
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const saveBtn = h('button', { type: 'button', class: 'btn small', id: ctx + '-av-save' });
    saveBtn.innerHTML = icon('plus') + esc(T('asm.varSaveShort'));
    const doSave = () => {
      const nm = inp.value.trim();
      if (nm) { saveAsmVariant(nm); inp.value = ''; }
      else promptSaveAsmVariant();
    };
    saveBtn.onclick = doSave;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
    const row = h('div', { class: 'av-save-row' }, inp, saveBtn);
    if (act && diff && diff.any) {
      const updBtn = h('button', { type: 'button', class: 'btn small', id: ctx + '-av-update' });
      updBtn.innerHTML = icon('save') + esc(T('asm.varUpdateShort'));
      updBtn.onclick = () => updateAsmVariant(act.id);
      row.append(updBtn);
    }
    const manBtn = h('button', { type: 'button', class: 'btn small ghost', id: ctx + '-av-manage' }, T('asm.varManageBtn'));
    manBtn.onclick = () => asmVariantDialog();
    row.append(manBtn);
    sec.append(row);
    return sec;
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
    patterns,
    patternsOf,
    patternOf,
    isPatternCopy,
    computePatternTargets,
    syncPatterns,
    onItemRemoved,
    createPattern,
    patternRect,
    patternCirc,
    mirrorPart,
    updatePattern,
    restorePatternSkips,
    dissolvePattern,
    removePattern,
    patternMenu,
    patternDialog,
    patternSection,
    patternTreeSection,
    EXPLODE_DIRS,
    normalizeExplodeDir,
    dirKeyOf,
    dirLabelOf,
    explodeSteps,
    explodeParts,
    addExplodeStep,
    updateExplodeStep,
    removeExplodeStep,
    moveExplodeStep,
    clearExplodeSteps,
    evalExplodeSteps,
    movableJoints,
    poses,
    capturePoseStates,
    isPoseActive,
    activePose,
    poseSummary,
    savePose,
    updatePose,
    renamePose,
    removePose,
    applyPose,
    promptSavePose,
    poseTreeSection,
    poseSection,
    motionSection,
    openMotion: (o) => typeof Motion !== 'undefined' && Motion.open(o),
    closeMotion: () => typeof Motion !== 'undefined' && Motion.close(),
    toggleMotion: () => typeof Motion !== 'undefined' && Motion.toggle(),
    setMotionTime: (t, o) => typeof Motion !== 'undefined' ? Motion.setTime(t, o) : 0,
    assemblyPartTargets,
    assemblySteps,
    stackHole,
    startStackHole,
    asmCut,
    asmCutFromSketch,
    startAsmCut,
    stepsSection,
    findHoles,
    insertAutoScrews,
    autoScrewsDialog,
    displayStates,
    findDisplayState,
    captureDisplayState,
    isDisplayStateActive,
    activeDisplayState,
    displayStateSummary,
    saveDisplayState,
    updateDisplayState,
    setDisplayStateItem,
    setDisplayStateMode,
    renameDisplayState,
    removeDisplayState,
    applyDisplayState,
    promptSaveDisplayState,
    displayStateDialog,
    displayStateTreeSection,
    displayStateSection,
    asmVariants,
    findAsmVariant,
    captureAsmVariant,
    asmVariantChanged,
    isAsmVariantActive,
    activeAsmVariant,
    asmVariantSummary,
    saveAsmVariant,
    updateAsmVariant,
    duplicateAsmVariant,
    renameAsmVariant,
    removeAsmVariant,
    applyAsmVariant,
    setAsmVariantParam,
    setAsmVariantSuppressed,
    setAsmVariantRef,
    setAsmVariantItemParam,
    setAsmVariantDisplayState,
    promptSaveAsmVariant,
    asmVariantDialog,
    asmVariantTreeSection,
    asmVariantSection,
  };
})();
