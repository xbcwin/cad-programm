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
  };
})();
