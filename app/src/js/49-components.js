// ================= Bauteile im Kontext & Baugruppen-Verweise (BG-01) =================
const Comp = (() => {
  let banner = null;
  function resolveDoc(docId) {
    if (!docId) return null;
    if (typeof App !== 'undefined' && App.findOpenDoc) {
      const open = App.findOpenDoc(docId);
      if (open) return open;
    }
    if (typeof Store !== 'undefined' && Store.getCachedProject) {
      return Store.getCachedProject(docId);
    }
    return null;
  }
  function docHasRef(doc, targetDocId, seen = new Set()) {
    if (!doc || !targetDocId || !Array.isArray(doc.items)) return false;
    if (doc.id) {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
    }
    let hit = false;
    Model.walk(doc.items, (it) => {
      if (!it || it.kind !== 'ref' || !it.p || !it.p.docId) return;
      if (it.p.docId === targetDocId) { hit = true; return false; }
      const sub = resolveDoc(it.p.docId);
      if (sub && docHasRef(sub, targetDocId, seen)) { hit = true; return false; }
    });
    return hit;
  }
  async function ensureRefs(doc, seen = new Set()) {
    if (!doc || !Array.isArray(doc.items)) return;
    if (doc.id) seen.add(doc.id);
    const refIds = [];
    Model.walk(doc.items, (it) => {
      if (it && it.kind === 'ref' && it.p && it.p.docId && !seen.has(it.p.docId)) refIds.push(it.p.docId);
    });
    for (const refId of refIds) {
      if (seen.has(refId)) continue;
      seen.add(refId);
      if (!resolveDoc(refId) && typeof Store !== 'undefined' && Store.loadProject) {
        await Store.loadProject(refId).catch(() => null);
      }
      const rd = resolveDoc(refId);
      if (!rd) continue;
      if (typeof Store !== 'undefined' && Store.hydrateDoc) {
        await Store.hydrateDoc(rd, new Set(seen)).catch(() => {});
      }
      if (typeof SK !== 'undefined' && SK.ensureDocFonts) {
        await SK.ensureDocFonts(rd).catch(() => {});
      }
      await ensureRefs(rd, seen);
    }
  }
  function availableParts(excludeDocId = (typeof App !== 'undefined' && App.doc && App.doc.id) || null) {
    const byId = new Map();
    if (typeof Store !== 'undefined' && Store.recentProjects) {
      for (const r of Store.recentProjects()) {
        if (!r || !r.id || r.id === excludeDocId) continue;
        if (!(r.n > 0)) continue;
        const cached = resolveDoc(r.id);
        if (cached && excludeDocId && docHasRef(cached, excludeDocId)) continue;
        const docType = r.docType === 'assembly' ? 'assembly' : 'part';
        byId.set(r.id, { id: r.id, name: r.name || (docType === 'assembly' ? T('doc.assembly') : T('asm.partDefault')), n: r.n, modified: r.modified || 0, open: false, docType });
      }
    }
    if (typeof App !== 'undefined' && Array.isArray(App.tabs)) {
      for (const t of App.tabs) {
        if (!t || !t.docId || t.docId === excludeDocId) continue;
        const d = App.findOpenDoc ? App.findOpenDoc(t.docId) : null;
        if (!d) continue;
        const n = Model.countItems(d);
        if (n <= 0 && !(typeof Store !== 'undefined' && Store.hasProject && Store.hasProject(d.id))) continue;
        if (excludeDocId && docHasRef(d, excludeDocId)) continue;
        const docType = Model.docType(d);
        byId.set(d.id, { id: d.id, name: d.name || (docType === 'assembly' ? T('doc.assembly') : T('asm.partDefault')), n, modified: d.modified || Date.now(), open: true, docType });
      }
    }
    return [...byId.values()].sort((a, b) => (b.modified || 0) - (a.modified || 0));
  }
  function freeSpotFor(refDoc) {
    const V = refDoc ? Model.vars(refDoc).v : {};
    const box = new THREE.Box3();
    for (const c of (refDoc ? Model.activeItems(refDoc) : [])) {
      if (c.hidden || c.role === 'hole') continue;
      const cb = Model.itemLocalBox(c, V);
      if (!cb) continue;
      box.union(new THREE.Box3(new THREE.Vector3(cb[0], cb[1], cb[2]), new THREE.Vector3(cb[3], cb[4], cb[5])).applyMatrix4(Model.localMatrix(c, new THREE.Matrix4())));
    }
    const halfW = box.isEmpty() ? 15 : Math.max(5, (box.max.x - box.min.x) / 2);
    const halfD = box.isEmpty() ? 15 : Math.max(5, (box.max.y - box.min.y) / 2);
    const boxes = [];
    if (typeof Viewer !== 'undefined' && Viewer.nodes) {
      for (const n of Viewer.nodes.values()) {
        if (n.role !== 'hole' && n.obj && n.obj.visible && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox) {
          boxes.push(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
        }
      }
    }
    const t = (typeof Viewer !== 'undefined' && Viewer.controls && Viewer.controls.target) ? Viewer.controls.target : { x: 0, y: 0 };
    let x = Math.round(t.x / 5) * 5;
    const y = Math.round(t.y / 5) * 5;
    if (!boxes.length) return [x, y];
    const hits = (px) => boxes.some((b) => px - halfW < b.max.x + 1 && px + halfW > b.min.x - 1 && y - halfD < b.max.y + 1 && y + halfD > b.min.y - 1);
    if (!hits(x)) return [x, y];
    let right = -Infinity;
    for (const b of boxes) if (y - halfD < b.max.y + 1 && y + halfD > b.min.y - 1) right = Math.max(right, b.max.x);
    if (!isFinite(right)) return [x, y];
    return [Math.ceil((right + 8 + halfW) / 5) * 5, y];
  }
  async function persistRefTree(doc, seen = new Set()) {
    if (!doc || !doc.id || seen.has(doc.id)) return;
    seen.add(doc.id);
    if (typeof Store !== 'undefined' && Store.saveProject && Store.hasProject && !Store.hasProject(doc.id)) {
      await Store.saveProject(doc, Model.countItems(doc), { keepLast: true });
    }
    for (const it of doc.items || []) {
      if (it && it.kind === 'ref' && it.p && it.p.docId) {
        const sub = resolveDoc(it.p.docId);
        if (sub) await persistRefTree(sub, seen);
      }
    }
  }
  async function insertPart(docId, opts = {}) {
    if (!docId || !App.doc) return null;
    if (docId === App.doc.id) {
      UI.toast(T('asm.selfRefErr'), { kind: 'bad' });
      return null;
    }
    let refDoc = resolveDoc(docId);
    if (!refDoc && typeof Store !== 'undefined' && Store.loadProject) {
      refDoc = await Store.loadProject(docId);
    }
    if (!refDoc) {
      UI.toast(T('asm.partNotFound'), { kind: 'bad' });
      return null;
    }
    await ensureRefs(refDoc);
    if (refDoc.id === App.doc.id || docHasRef(refDoc, App.doc.id)) {
      UI.toast(T('asm.cycleErr'), { kind: 'bad' });
      return null;
    }
    await persistRefTree(refDoc);
    const isSub = Model.isAssembly(refDoc);
    const firstSolid = (refDoc.items || []).find((x) => x && x.role !== 'hole' && !x.hidden);
    const col = opts.color || (firstSolid && firstSolid.color) || undefined;
    const spot = opts.pos || freeSpotFor(refDoc);
    const refP = { docId: refDoc.id, docName: refDoc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')), ...(isSub ? { docType: 'assembly' } : {}) };
    const it = Model.newItem('ref', refP, {
      name: opts.name || refDoc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')),
      color: col,
    });
    if (opts.t) Object.assign(it.t, opts.t);
    else { it.t.x = spot[0]; it.t.y = spot[1]; it.t.z = opts.z || 0; }
    if (!App.doc.items.length) App.fitAfterBuild();
    App.change(T(isSub ? 'asm.insertedSubUndo' : 'asm.insertedUndo', { name: Model.label(it) }), (doc) => { doc.items.push(it); });
    App.select([it.id]);
    UI.toast(T(isSub ? 'asm.insertedSubToast' : 'asm.insertedToast', { name: Model.label(it) }), { icon: 'check', ms: 3200 });
    return it;
  }
  function canReplace(it, doc = App.doc) {
    if (!it || !doc || !Array.isArray(doc.items) || !doc.items.includes(it)) return false;
    if (typeof App !== 'undefined' && App.ctx) return false;
    if (it.role === 'hole') return false;
    if (it.kind === 'transform' && !(it.p && it.p.copy)) return false;
    if (it.kind === 'scale' || it.kind === 'deform' || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'deleteBody' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut') return false;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return false;
    if (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)) return false;
    return true;
  }
  function ensureModelModeForFile() {
    if (typeof Sketch !== 'undefined' && Sketch.active) Sketch.cancel(true);
    if (typeof App !== 'undefined' && App.mode !== 'model' && typeof Commands !== 'undefined' && Commands.setMode) {
      Commands.setMode('model');
    }
    if (typeof Start !== 'undefined' && Start.open && Start.hide) Start.hide();
  }
  async function buildStepItemFromBytes(bytes, fileName, fmt) {
    const blobId = await Store.putBlob(bytes);
    const base = String(fileName || 'Import').replace(/\.(step|stp|igs|iges|brep|stl)$/i, '') || 'Import';
    if (fmt === 'step' && typeof Start !== 'undefined' && Start.parseSTEP) {
      let parsed = null;
      try { parsed = Start.parseSTEP(bytes); } catch (e) { console.warn(e); }
      if (parsed && parsed.partCount > 0) {
        let partIdx = 0;
        const importIds = [];
        const buildItems = (nodes) => nodes.map((node) => {
          if (node.type === 'assembly') {
            const kids = buildItems(node.children);
            const firstSolid = kids.find((c) => c.role !== 'hole') || kids[0];
            const g = Model.newItem('group', { assembly: true }, { name: node.name || base, color: (firstSolid && firstSolid.color) || undefined });
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
          importIds.push(imp.id);
          return imp;
        });
        const items = buildItems(parsed.roots);
        if (parsed.partCount === 1 && parsed.groupCount === 0 && items.length === 1) {
          return { item: items[0], importIds, subCount: 1 };
        }
        if (items.length === 1) {
          if (items[0].kind === 'group') items[0].comp = true;
          return { item: items[0], importIds, subCount: parsed.partCount };
        }
        const firstSolid = items.find((c) => c.role !== 'hole') || items[0];
        const grp = Model.newItem('group', { assembly: true }, { name: base, color: (firstSolid && firstSolid.color) || undefined });
        grp.comp = true;
        grp.children = items;
        return { item: grp, importIds, subCount: parsed.partCount };
      }
    }
    const imp = Model.newItem('import', { fmt, blobId, size: bytes.byteLength, file: fileName, scale: 1 }, { name: base });
    return { item: imp, importIds: [imp.id], subCount: 1 };
  }
  async function buildRefItemFromProjectFile(file) {
    let doc = null;
    try {
      const txt = await file.text();
      const parsed = Store.safeParseJSON(txt, { limit: Store.LIMITS.project, name: file.name });
      if (!parsed.ok) throw new Error(parsed.error);
      doc = parsed.data;
    } catch (e) {
      console.warn(e);
      UI.toast(T('asm.fileReadErr'), { kind: 'bad' });
      return null;
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || (!Array.isArray(doc.items) && doc.format !== 'masswerk')) {
      UI.toast(T('asm.fileBadFormat'), { kind: 'bad' });
      return null;
    }
    Model.migrate(doc);
    delete doc.versions;
    if (Model.countItems(doc) <= 0) {
      UI.toast(T('asm.fileEmptyErr'), { kind: 'bad' });
      return null;
    }
    const base = String(file.name || '').replace(/(\.tracery)?\.json$/i, '').trim();
    if (!doc.name || doc.name === 'Neues Projekt') doc.name = base || T('asm.partDefault');
    const openDocIds = new Set((App.tabs || []).map((t) => t.docId).filter(Boolean));
    if (!doc.id || (App.doc && doc.id === App.doc.id) || openDocIds.has(doc.id) || (typeof Store !== 'undefined' && Store.hasProject && Store.hasProject(doc.id))) {
      doc.id = uid('p');
    }
    if (typeof Store !== 'undefined' && Store.extractBlobs) Store.extractBlobs(doc);
    if (typeof Store !== 'undefined' && Store.saveProject) {
      await Store.saveProject(doc, Model.countItems(doc), { keepLast: true });
    }
    await ensureRefs(doc);
    await persistRefTree(doc);
    const isSub = Model.isAssembly(doc);
    const firstSolid = (doc.items || []).find((x) => x && x.role !== 'hole' && !x.hidden);
    const refP = { docId: doc.id, docName: doc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')), ...(isSub ? { docType: 'assembly' } : {}) };
    const it = Model.newItem('ref', refP, {
      name: doc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')),
      color: (firstSolid && firstSolid.color) || undefined,
    });
    return { item: it, refDoc: doc, isSub, importIds: [], subCount: Model.countItems(doc) };
  }
  async function buildItemFromBlob(file) {
    if (!file || !file.name) return null;
    const sz = Store.checkFileSize(file, /\.json$/i.test(file.name) ? 'project' : 'cad');
    if (!sz.ok) {
      UI.toast(sz.message, { kind: 'bad', ms: 7000 });
      return null;
    }
    if (/\.json$/i.test(file.name)) return buildRefItemFromProjectFile(file);
    if (/\.(step|stp|igs|iges|brep|stl)$/i.test(file.name)) {
      const fmt = /\.stl$/i.test(file.name) ? 'stl'
        : /\.(igs|iges)$/i.test(file.name) ? 'iges'
        : /\.brep$/i.test(file.name) ? 'brep'
        : 'step';
      const bytes = new Uint8Array(await file.arrayBuffer());
      return buildStepItemFromBytes(bytes, file.name, fmt);
    }
    UI.toast(T('asm.fileBadFormat'), { kind: 'bad' });
    return null;
  }
  async function insertFromBlob(file, opts = {}) {
    if (!file || !App.doc) return null;
    ensureModelModeForFile();
    const built = await buildItemFromBlob(file);
    if (!built || !built.item) return null;
    const it = built.item;
    if (opts.name) it.name = opts.name;
    if (opts.t) Object.assign(it.t, opts.t);
    else if (Array.isArray(opts.pos)) {
      it.t.x = opts.pos[0] || 0;
      it.t.y = opts.pos[1] || 0;
      it.t.z = opts.pos[2] != null ? opts.pos[2] : (opts.z || 0);
    } else {
      const spot = freeSpotFor(built.refDoc || null);
      it.t.x = spot[0];
      it.t.y = spot[1];
      it.t.z = opts.z || 0;
    }
    const emptyBefore = !App.doc.items.length;
    if (emptyBefore) App.fitAfterBuild();
    App.change(T('asm.insertFileUndo', { name: Model.label(it) }), (doc) => {
      doc.items.push(it);
    });
    App.select([it.id]);
    if (built.subCount > 1 && it.kind === 'group') {
      UI.toast(T('asm.insertFileMultiToast', { name: Model.label(it), n: built.subCount }), { icon: 'check', ms: 3800 });
    } else {
      UI.toast(T('asm.insertFileToast', { name: Model.label(it) }), { icon: 'check', ms: 3400 });
    }
    if (it.kind === 'import' && typeof Start !== 'undefined' && Start.checkImport) {
      Start.checkImport(it.id).catch(() => {});
    }
    return it;
  }
  function insertFromFile(opts = {}) {
    const inp = h('input', { type: 'file', accept: '.step,.stp,.json,application/json,.igs,.iges,.brep,.stl', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) insertFromBlob(f, opts); };
    document.body.append(inp);
    inp.click();
    setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
  }
  async function applyReplacement(itemId, newItem, opts = {}) {
    const f = Model.find(App.doc, itemId);
    if (!f || !canReplace(f.item, App.doc)) {
      UI.toast(T('asm.cannotReplace'), { kind: 'bad' });
      return null;
    }
    const oldItem = f.item;
    newItem.id = oldItem.id;
    newItem.t = deepClone(oldItem.t || Model.T0());
    if (oldItem.locked) newItem.locked = true;
    if (oldItem.hidden) newItem.hidden = true;
    if (oldItem.suppressed) newItem.suppressed = true;
    if (oldItem.opacity != null) newItem.opacity = oldItem.opacity;
    if (oldItem.note) newItem.note = oldItem.note;
    if (opts.keepName && oldItem.name) newItem.name = oldItem.name;
    if (!newItem.color && oldItem.color) newItem.color = oldItem.color;
    const undoLabel = T('asm.replaceUndo', { name: Model.label(newItem) });
    const ok = App.change(undoLabel, (doc) => {
      const idx = (doc.items || []).findIndex((x) => x.id === itemId);
      if (idx < 0) return false;
      doc.items[idx] = newItem;
      if (typeof Joints !== 'undefined' && Joints.preparePartReplace) {
        Joints.preparePartReplace(doc, itemId);
      }
    });
    if (ok === false) return null;
    App.select([itemId]);
    await App.rebuild();
    let jRes = { total: 0, kept: 0, dropped: 0, droppedIds: [] };
    if (typeof Joints !== 'undefined' && Joints.finalizePartReplace) {
      jRes = Joints.finalizePartReplace(itemId);
      await App.rebuild();
    }
    const nm = Model.label(newItem);
    let msg;
    if (jRes.kept > 0 && jRes.dropped > 0) msg = T('asm.replaceToastMixed', { name: nm, kept: jRes.kept, dropped: jRes.dropped });
    else if (jRes.kept === 1) msg = T('asm.replaceToastKeptOne', { name: nm });
    else if (jRes.kept > 1) msg = T('asm.replaceToastKeptMany', { name: nm, kept: jRes.kept });
    else if (jRes.dropped === 1) msg = T('asm.replaceToastDroppedOne', { name: nm });
    else if (jRes.dropped > 1) msg = T('asm.replaceToastDroppedMany', { name: nm, dropped: jRes.dropped });
    else msg = T('asm.replaceToast', { name: nm });
    UI.toast(msg, { icon: jRes.dropped > 0 ? 'warn' : 'check', ms: 3800 });
    if (newItem.kind === 'import' && typeof Start !== 'undefined' && Start.checkImport) {
      Start.checkImport(itemId).catch(() => {});
    }
    return { item: Model.find(App.doc, itemId)?.item || newItem, joints: jRes };
  }
  async function replacePart(itemId, target, opts = {}) {
    if (!itemId || !target || !App.doc) return null;
    const f = Model.find(App.doc, itemId);
    if (!f || !canReplace(f.item, App.doc)) {
      UI.toast(T('asm.cannotReplace'), { kind: 'bad' });
      return null;
    }
    if (typeof target === 'string') {
      const docId = target;
      if (docId === App.doc.id) {
        UI.toast(T('asm.selfRefErr'), { kind: 'bad' });
        return null;
      }
      let refDoc = resolveDoc(docId);
      if (!refDoc && typeof Store !== 'undefined' && Store.loadProject) {
        refDoc = await Store.loadProject(docId);
      }
      if (!refDoc) {
        UI.toast(T('asm.partNotFound'), { kind: 'bad' });
        return null;
      }
      await ensureRefs(refDoc);
      if (refDoc.id === App.doc.id || docHasRef(refDoc, App.doc.id)) {
        UI.toast(T('asm.cycleErr'), { kind: 'bad' });
        return null;
      }
      await persistRefTree(refDoc);
      const isSub = Model.isAssembly(refDoc);
      const firstSolid = (refDoc.items || []).find((x) => x && x.role !== 'hole' && !x.hidden);
      const refP = { docId: refDoc.id, docName: refDoc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')), ...(isSub ? { docType: 'assembly' } : {}) };
      const it = Model.newItem('ref', refP, {
        name: opts.name || refDoc.name || (isSub ? T('doc.assembly') : T('asm.partDefault')),
        color: opts.color || (firstSolid && firstSolid.color) || undefined,
      });
      return applyReplacement(itemId, it, opts);
    }
    const built = await buildItemFromBlob(target);
    if (!built || !built.item) return null;
    return applyReplacement(itemId, built.item, opts);
  }
  function replacePartWithFile(itemId, opts = {}) {
    const inp = h('input', { type: 'file', accept: '.step,.stp,.json,application/json,.igs,.iges,.brep,.stl', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) replacePart(itemId, f, opts); };
    document.body.append(inp);
    inp.click();
    setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
  }
  function replacePartDialog(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f || !canReplace(f.item, App.doc)) {
      UI.toast(T('asm.cannotReplace'), { kind: 'bad' });
      return null;
    }
    const oldItem = f.item;
    const currentDocId = oldItem.kind === 'ref' && oldItem.p ? oldItem.p.docId : null;
    const parts = availableParts();
    const wrap = h('div', { id: 'asm-replace-dialog', class: 'asm-insert-dlg' });
    let modalRef = null;
    wrap.append(h('p', { class: 'asm-insert-intro' }, T('asm.replaceIntro', { name: Model.label(oldItem) })));

    const fileInput = h('input', { type: 'file', id: 'asm-replace-file-input', accept: '.step,.stp,.json,application/json,.igs,.iges,.brep,.stl', hidden: true });
    const fileBtn = h('button', { type: 'button', class: 'btn', id: 'asm-replace-file-btn' });
    fileBtn.innerHTML = icon('folder') + esc(T('asm.replaceFromFileBtn'));
    fileBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (modalRef) modalRef.close();
      replacePart(itemId, file);
    };
    wrap.append(h('div', { class: 'asm-file-bar' }, fileBtn, fileInput, h('div', { class: 'hint-box' }, T('asm.replaceFileHint'))));

    if (!parts.length) {
      wrap.append(h('div', { class: 'hint-box' }, T('asm.replaceNoOtherParts')));
    } else {
      const list = h('div', { class: 'recent asm-part-list' });
      for (const p of parts) {
        const isSub = p.docType === 'assembly';
        const isCurrent = p.id === currentDocId;
        const row = h('div', { class: 'recent-row asm-part-row' + (isCurrent ? ' disabled' : ''), role: 'button', tabindex: isCurrent ? '-1' : '0', dataset: { docId: p.id, docType: p.docType || 'part' } });
        const ic = h('span', { class: 'asm-part-ic', 'aria-hidden': 'true' }); ic.innerHTML = icon(isSub ? 'parts' : 'box3');
        const meta = T(p.n === 1 ? 'start.recentMetaOne' : 'start.recentMetaMany', { n: p.n, date: p.modified ? new Date(p.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '' });
        const info = h('div', { class: 'grow' }, h('b', null, p.name), h('span', null, meta));
        row.append(ic, info);
        if (isSub) row.append(h('span', { class: 'doc-type-badge asm' }, T('doc.assembly')));
        if (p.open) row.append(h('span', { class: 'doc-type-badge open' }, T('asm.openTabBadge')));
        if (isCurrent) row.append(h('span', { class: 'doc-type-badge' }, T('asm.replaceCurrentBadge')));
        const repBtn = h('button', { type: 'button', class: 'btn primary small asm-replace-go', disabled: isCurrent }, T('asm.replaceGo'));
        const pick = () => { if (isCurrent) return; if (modalRef) modalRef.close(); replacePart(itemId, p.id); };
        repBtn.onclick = (e) => { e.stopPropagation(); pick(); };
        if (!isCurrent) {
          row.onclick = pick;
          row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
        }
        row.append(repBtn);
        list.append(row);
      }
      wrap.append(list);
    }
    modalRef = UI.modal({
      title: T('asm.replaceTitle'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.cancel') }],
    });
    return modalRef;
  }
  function insertPartDialog() {
    const parts = availableParts();
    const wrap = h('div', { id: 'asm-insert-dialog', class: 'asm-insert-dlg' });
    let modalRef = null;
    const fileInput = h('input', { type: 'file', id: 'asm-insert-file-input', accept: '.step,.stp,.json,application/json,.igs,.iges,.brep,.stl', hidden: true });
    const fileBtn = h('button', { type: 'button', class: 'btn', id: 'asm-insert-file-btn' });
    fileBtn.innerHTML = icon('folder') + esc(T('asm.insertFromFile'));
    fileBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (modalRef) modalRef.close();
      insertFromBlob(file);
    };
    const fileBar = h('div', { class: 'asm-file-bar' }, fileBtn, fileInput, h('div', { class: 'hint-box' }, T('asm.replaceFileHint')));
    if (!parts.length) {
      wrap.append(fileBar);
      wrap.append(h('div', { class: 'hint-box' }, T('asm.noPartsHint')));
      const newBtn = h('button', { type: 'button', class: 'btn primary', id: 'asm-new-part-btn' });
      newBtn.innerHTML = icon('newfile') + esc(T('asm.createPartBtn'));
      newBtn.onclick = () => {
        if (modalRef) modalRef.close();
        if (typeof Start !== 'undefined' && Start.openNewTab) Start.openNewTab(Model.newDoc('Neues Bauteil'));
      };
      wrap.append(h('div', { class: 'btn-row' }, newBtn));
    } else {
      wrap.append(h('p', { class: 'asm-insert-intro' }, T('asm.insertIntro')));
      wrap.append(fileBar);
      const list = h('div', { class: 'recent asm-part-list' });
      for (const p of parts) {
        const isSub = p.docType === 'assembly';
        const row = h('div', { class: 'recent-row asm-part-row', role: 'button', tabindex: '0', dataset: { docId: p.id, docType: p.docType || 'part' } });
        const ic = h('span', { class: 'asm-part-ic', 'aria-hidden': 'true' }); ic.innerHTML = icon(isSub ? 'parts' : 'box3');
        const meta = T(p.n === 1 ? 'start.recentMetaOne' : 'start.recentMetaMany', { n: p.n, date: p.modified ? new Date(p.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '' });
        const info = h('div', { class: 'grow' }, h('b', null, p.name), h('span', null, meta));
        row.append(ic, info);
        if (isSub) row.append(h('span', { class: 'doc-type-badge asm' }, T('doc.assembly')));
        if (p.open) row.append(h('span', { class: 'doc-type-badge open' }, T('asm.openTabBadge')));
        const addBtn = h('button', { type: 'button', class: 'btn primary small asm-insert-go' }, T('asm.insertGo'));
        const pick = () => { if (modalRef) modalRef.close(); insertPart(p.id); };
        addBtn.onclick = (e) => { e.stopPropagation(); pick(); };
        row.onclick = pick;
        row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
        row.append(addBtn);
        list.append(row);
      }
      wrap.append(list);
    }
    modalRef = UI.modal({
      title: T('asm.insertTitle'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.close') }],
    });
    return modalRef;
  }
  async function openPart(docId) {
    if (!docId) return false;
    if (typeof App !== 'undefined' && Array.isArray(App.tabs)) {
      const open = App.tabs.find((t) => t.docId === docId);
      if (open) { App.switchTab(open.tabId); return true; }
    }
    if (typeof Start !== 'undefined' && Start.openStoredInTab) {
      return Start.openStoredInTab(docId);
    }
    return false;
  }
  function openRef(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'ref' || !f.item.p || !f.item.p.docId) return Promise.resolve(false);
    return openPart(f.item.p.docId);
  }
  // ================= Bezüge zwischen Teilen verwalten (BG-22) =================
  function partRefs(itemId, doc = App.doc) {
    if (typeof RefFix === 'undefined' || !RefFix.partRefs) return [];
    return RefFix.partRefs(itemId, doc);
  }
  function allPartRefs(doc = App.doc) {
    if (typeof RefFix === 'undefined' || !RefFix.allPartRefs) return [];
    return RefFix.allPartRefs(doc);
  }
  function freezeRef(refOrId, frozen = true) {
    if (typeof RefFix === 'undefined' || !RefFix.setPartRefFrozen) return false;
    const on = !!frozen;
    const ref = RefFix.findPartRef ? RefFix.findPartRef(refOrId) : null;
    const ok = RefFix.setPartRefFrozen(refOrId, on);
    if (ok) {
      const target = (ref && ref.targetName) || '';
      UI.toast(T(on ? 'partRefs.freezeToast' : 'partRefs.unfreezeToast', { target }), { icon: on ? 'freeze' : 'check', ms: 2600 });
    }
    return ok;
  }
  function unfreezeRef(refOrId) {
    return freezeRef(refOrId, false);
  }
  function toggleFreezeRef(refOrId) {
    const ref = typeof RefFix !== 'undefined' && RefFix.findPartRef ? RefFix.findPartRef(refOrId) : null;
    if (!ref) return false;
    return freezeRef(ref, !ref.frozen);
  }
  function breakRef(refOrId) {
    if (typeof RefFix === 'undefined' || !RefFix.breakPartRef) return false;
    const ref = RefFix.findPartRef ? RefFix.findPartRef(refOrId) : null;
    const ok = RefFix.breakPartRef(refOrId);
    if (ok) {
      const target = (ref && ref.targetName) || '';
      UI.toast(T('partRefs.breakToast', { target }), { icon: 'ungroup', ms: 2600 });
    }
    return ok;
  }
  function freezeAllRefs(itemId = null, frozen = true) {
    if (typeof RefFix === 'undefined' || !RefFix.freezeAllPartRefs) return 0;
    const on = !!frozen;
    const n = RefFix.freezeAllPartRefs(itemId, on);
    if (n > 0) {
      UI.toast(T(on ? 'partRefs.freezeAllToast' : 'partRefs.unfreezeAllToast', { n }), { icon: on ? 'freeze' : 'check', ms: 2600 });
    }
    return n;
  }
  function unfreezeAllRefs(itemId = null) {
    return freezeAllRefs(itemId, false);
  }
  function breakAllRefs(itemId = null) {
    if (typeof RefFix === 'undefined' || !RefFix.breakAllPartRefs) return 0;
    const n = RefFix.breakAllPartRefs(itemId);
    if (n > 0) {
      UI.toast(T('partRefs.breakAllToast', { n }), { icon: 'ungroup', ms: 2600 });
    }
    return n;
  }
  function renderRefRow(r, opts = {}) {
    const onChanged = opts.onChanged || null;
    const row = h('div', {
      class: 'part-ref-row' + (r.frozen ? ' frozen' : r.lost ? ' lost' : ''),
      dataset: {
        refId: r.id,
        refKind: r.kind,
        refFrozen: r.frozen ? '1' : '0',
        refTarget: r.targetTopId || '',
      },
    });
    const statusCls = r.frozen ? 'frozen' : r.lost ? 'lost' : 'active';
    const statusLabel = T(r.frozen ? 'partRefs.statusFrozen' : r.lost ? 'partRefs.statusLost' : 'partRefs.statusActive');
    const canPickTarget = !!(r.targetTopId && Model.find(App.doc, r.targetTopId));
    const targetEl = canPickTarget
      ? h('button', { type: 'button', class: 'part-ref-target lk', 'data-tip': T('partRefs.selectTargetTip') }, r.targetName)
      : h('span', { class: 'part-ref-target missing' }, r.targetName);
    if (canPickTarget) {
      targetEl.onclick = (e) => {
        e.stopPropagation();
        App.select([r.targetTopId]);
      };
    }
    const topLine = h('div', { class: 'part-ref-top' },
      h('span', { class: 'part-ref-what' }, r.what + ' '),
      targetEl,
      h('span', { class: 'part-ref-badge ' + statusCls }, statusLabel)
    );
    const subParts = [];
    if (opts.showSource && r.sourceName) subParts.push(r.sourceName);
    if (r.detail) subParts.push(r.detail);
    const info = h('div', { class: 'part-ref-info' }, topLine);
    if (subParts.length) info.append(h('div', { class: 'part-ref-sub' }, subParts.join(' · ')));

    const fBtn = h('button', {
      type: 'button',
      class: 'btn small' + (r.frozen ? ' primary' : ''),
      dataset: { refFreeze: r.id },
      'data-tip': T(r.frozen ? 'partRefs.unfreezeTip' : 'partRefs.freezeTip'),
    });
    fBtn.innerHTML = icon(r.frozen ? 'unlock' : 'freeze') + esc(T(r.frozen ? 'partRefs.unfreezeBtn' : 'partRefs.freezeBtn'));
    fBtn.onclick = (e) => {
      e.stopPropagation();
      freezeRef(r.id, !r.frozen);
      if (onChanged) onChanged();
    };

    const bBtn = h('button', {
      type: 'button',
      class: 'btn small ghost',
      dataset: { refBreak: r.id },
      'data-tip': T('partRefs.breakTip'),
    });
    bBtn.innerHTML = icon('ungroup') + esc(T('partRefs.breakBtn'));
    bBtn.onclick = (e) => {
      e.stopPropagation();
      breakRef(r.id);
      if (onChanged) onChanged();
    };

    row.append(info, h('div', { class: 'part-ref-acts' }, fBtn, bBtn));
    return row;
  }
  function refsSection(item) {
    if (!item || !item.id || !App.doc) return null;
    const refs = partRefs(item.id);
    if (!refs.length) return null;
    const frozenCount = refs.filter((r) => r.frozen).length;
    const activeCount = refs.length - frozenCount;
    const sum = h('summary', { class: 'section-h' },
      T('partRefs.panelTitle', { n: refs.length }),
      frozenCount ? h('span', { class: 'part-ref-sum-frozen' }, ' · ' + T('partRefs.frozenCount', { n: frozenCount })) : null
    );
    const sec = h('details', { class: 'section pro part-refs-sec', id: 'part-refs-sec', 'data-help': 'partRefs', open: true }, sum);
    const list = h('div', { class: 'part-ref-list' });
    for (const r of refs) list.append(renderRefRow(r, { showSource: false }));
    sec.append(list);

    const bulk = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    if (refs.length >= 2) {
      if (activeCount > 0) {
        const fa = h('button', { type: 'button', class: 'btn small', id: 'part-refs-freeze-all' });
        fa.innerHTML = icon('freeze') + esc(T('partRefs.freezeAllBtn'));
        fa.onclick = () => freezeAllRefs(item.id, true);
        bulk.append(fa);
      }
      if (frozenCount > 0) {
        const ua = h('button', { type: 'button', class: 'btn small', id: 'part-refs-unfreeze-all' });
        ua.innerHTML = icon('unlock') + esc(T('partRefs.unfreezeAllBtn'));
        ua.onclick = () => unfreezeAllRefs(item.id);
        bulk.append(ua);
      }
      const ba = h('button', { type: 'button', class: 'btn small ghost', id: 'part-refs-break-all' });
      ba.innerHTML = icon('ungroup') + esc(T('partRefs.breakAllBtn'));
      ba.onclick = () => breakAllRefs(item.id);
      bulk.append(ba);
    }
    const dlgBtn = h('button', { type: 'button', class: 'btn small ghost', id: 'part-refs-open-dlg' });
    dlgBtn.innerHTML = icon('link') + esc(T('partRefs.openAllBtn'));
    dlgBtn.onclick = () => refsDialog(item.id);
    bulk.append(dlgBtn);
    sec.append(bulk);
    return sec;
  }
  function refsDialog(itemId = null) {
    let scopeId = itemId || null;
    const wrap = h('div', { id: 'part-refs-dialog', class: 'part-refs-dlg' });
    const renderBody = () => {
      wrap.replaceChildren();
      const scopedItem = scopeId ? Model.find(App.doc, scopeId)?.item : null;
      if (!scopedItem) scopeId = null;
      const refs = scopeId ? partRefs(scopeId) : allPartRefs();
      const allCount = scopeId ? allPartRefs().length : refs.length;
      const introTxt = scopedItem
        ? T('partRefs.dlgIntroPart', { name: Model.label(scopedItem) })
        : T('partRefs.dlgIntroAll');
      const topBar = h('div', { class: 'part-refs-dlg-head' }, h('p', { class: 'asm-insert-intro' }, introTxt));
      if (scopeId && allCount > refs.length) {
        const allBtn = h('button', { type: 'button', class: 'btn small ghost', id: 'dlg-refs-show-all' }, T('partRefs.showAllPartsBtn', { n: allCount }));
        allBtn.onclick = () => { scopeId = null; renderBody(); };
        topBar.append(allBtn);
      }
      wrap.append(topBar);
      if (!refs.length) {
        wrap.append(h('div', { class: 'hint-box' }, T('partRefs.empty')));
        return;
      }
      const frozenCount = refs.filter((r) => r.frozen).length;
      const activeCount = refs.length - frozenCount;
      const list = h('div', { class: 'part-ref-list' });
      for (const r of refs) list.append(renderRefRow(r, { showSource: true, onChanged: renderBody }));
      wrap.append(list);

      const bulk = h('div', { class: 'btn-row' });
      if (activeCount > 0) {
        const fa = h('button', { type: 'button', class: 'btn small', id: 'dlg-refs-freeze-all' });
        fa.innerHTML = icon('freeze') + esc(T('partRefs.freezeAllBtn'));
        fa.onclick = () => { freezeAllRefs(scopeId, true); renderBody(); };
        bulk.append(fa);
      }
      if (frozenCount > 0) {
        const ua = h('button', { type: 'button', class: 'btn small', id: 'dlg-refs-unfreeze-all' });
        ua.innerHTML = icon('unlock') + esc(T('partRefs.unfreezeAllBtn'));
        ua.onclick = () => { unfreezeAllRefs(scopeId); renderBody(); };
        bulk.append(ua);
      }
      const ba = h('button', { type: 'button', class: 'btn small ghost', id: 'dlg-refs-break-all' });
      ba.innerHTML = icon('ungroup') + esc(T('partRefs.breakAllBtn'));
      ba.onclick = () => { breakAllRefs(scopeId); renderBody(); };
      bulk.append(ba);
      wrap.append(bulk);
    };
    renderBody();
    return UI.modal({
      title: T('partRefs.dlgTitle'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.close'), primary: true }],
    });
  }

  function render() {
    if (banner) { banner.remove(); banner = null; }
    if (App.mode !== 'model') return;
    const ctx = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
    const iso = App.iso ? App.doc.items.find((x) => x.id === App.iso) : null;
    if (!ctx && !iso) return;
    banner = h('div', { class: 'ctx-banner' + (ctx ? '' : ' iso'), role: 'status' });
    const ic = h('span'); ic.innerHTML = icon(ctx ? 'edit' : 'focusView');
    banner.append(ic, h('span', null, ctx ? `Bauteil bearbeiten: ${Model.label(ctx)}` : `Isoliert: ${Model.label(iso)}`));
    if (ctx) {
      const refs = partRefs(ctx.id);
      if (refs.length) {
        const rb = h('button', { type: 'button', id: 'ctx-part-refs-btn', class: 'pro', 'data-help': 'partRefs' }, T('partRefs.ctxBtn', { n: refs.length }));
        rb.onclick = () => refsDialog(ctx.id);
        banner.append(rb);
      }
    }
    const b = h('button', { type: 'button' }, ctx ? 'Fertig' : 'Alle zeigen');
    b.onclick = () => (ctx ? App.setCtx(null) : App.setIso(null));
    banner.append(b);
    $('#overlay').append(banner);
  }
  function newComponent() {
    const n = App.doc.items.filter((x) => x.comp).length + 1;
    const it = Model.newItem('group', {}, { name: `Bauteil ${n}` }); it.comp = true; it.children = [];
    App.change(`Neues Bauteil: ${it.name}`, (doc) => { doc.items.push(it); });
    App.setCtx(it.id);
    UI.toast('Neues Bauteil angelegt. Alles, was du jetzt hinzufügst, landet darin.', { icon: 'parts', ms: 3200 });
  }
  function edit(id) { const it = App.doc.items.find((x) => x.id === id); if (it && it.kind === 'group') { Views.collapse(); App.setIso(null); App.setCtx(id); App.select([]); } }
  function toggleIso(id) { App.setIso(App.iso === id ? null : id); if (App.iso) Viewer.fit([id]); }
  function init() {
    if (typeof Model !== 'undefined' && Model.setDocResolver) Model.setDocResolver(resolveDoc);
    if (typeof Store !== 'undefined' && Store.on) {
      const onExternalChange = ({ id }) => {
        if (typeof App !== 'undefined' && App.doc && docHasRef(App.doc, id)) {
          App.rebuild();
          if (typeof Panels !== 'undefined') {
            Panels.renderLeft();
            Panels.renderRight({ preserveFocus: true });
          }
        }
      };
      Store.on('saved', onExternalChange);
      Store.on('deleted', onExternalChange);
    }
    App.on('ctx', render); App.on('mode', render); App.on('doc', debounce(render, 30));
  }
  return {
    init, newComponent, edit, toggleIso, render, resolveDoc, ensureRefs, availableParts,
    insertPart, insertSubAssembly: insertPart, insertPartDialog, openPart, openRef, docHasRef,
    canReplace, insertFromBlob, insertFromFile, replacePart, replacePartWithFile, replacePartDialog,
    partRefs, allPartRefs, freezeRef, unfreezeRef, toggleFreezeRef, breakRef, freezeAllRefs, unfreezeAllRefs, breakAllRefs,
    refsSection, refsDialog,
  };
})();

