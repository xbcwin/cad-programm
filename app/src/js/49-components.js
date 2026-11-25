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
  function edit(id) {
    const it = App.doc.items.find((x) => x.id === id);
    if (it && it.kind === 'group') {
      if (typeof Assembly !== 'undefined' && Assembly.isLightweightItem && Assembly.isLightweightItem(id)) {
        Assembly.resolveLightweight(id, { silent: true });
      }
      Views.collapse(); App.setIso(null); App.setCtx(id); App.select([]);
    }
  }
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
    App.on('doc', () => {
      if (selectedSkeletonId && !findSkeleton(selectedSkeletonId, App.doc)) {
        selectedSkeletonId = null;
      }
      if (App.doc && Array.isArray(App.doc.skeletons) && App.doc.skeletons.length) {
        syncSkeletons(App.doc);
      }
    });
  }
  function canPatternPart(it, doc = App.doc) {
    if (!it || !doc || !Array.isArray(doc.items) || !doc.items.includes(it)) return false;
    if (typeof App !== 'undefined' && App.ctx) return false;
    if (it.role === 'hole') return false;
    if (it.kind === 'transform' && !(it.p && it.p.copy)) return false;
    if (it.kind === 'scale' || it.kind === 'deform' || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'deleteBody' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'sketch3d') return false;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return false;
    if (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)) return false;
    return true;
  }
  function patternCopyName(src, copyNum, isMirror = false) {
    const base = Model.label(src);
    if (isMirror) return `${base} (${T('asm.patMirroredSuffix')})`;
    if (!/\s+\d+$/.test(base)) return `${base} ${copyNum}`;
    return `${base} (Kopie ${copyNum})`;
  }
  function cloneLinkedPart(doc, src, opts = {}) {
    if (!src) return null;
    const copyNum = Math.max(2, Number(opts.copyNum) || 2);
    const isMirror = !!opts.mirror;
    const name = opts.name || patternCopyName(src, copyNum, isMirror);
    let copy;
    if (src.kind === 'ref') {
      copy = Model.newItem('ref', deepClone(src.p || {}), { name, color: src.color });
      copy.t = { ...Model.T0(), ...(src.t ? deepClone(src.t) : {}) };
    } else if (src.partRef && src.partRef.docId) {
      copy = deepClone(src);
      copy.id = uid('i');
      delete copy.ai; delete copy.op; delete copy.locked; delete copy.asmPat; delete copy.asmPatSlot;
      copy.name = name;
      copy.comp = true;
      copy.children = Model.remapChildIds(src.children || [], copy.id + '__');
    } else {
      copy = Model.reId(deepClone(src));
      delete copy.ai; delete copy.op; delete copy.locked; delete copy.asmPat; delete copy.asmPatSlot;
      if (copy.kind === 'group') copy.children = Model.remapChildIds(src.children || [], copy.id + '__');
      copy.name = name;
      copy.link = src.id;
      delete copy.linkLost; delete copy.linkFrozen;
      if (isMirror) copy.linkMirror = true; else delete copy.linkMirror;
    }
    if (src.color) copy.color = src.color;
    if (src.colorSet) copy.colorSet = true; else delete copy.colorSet;
    if (src.mat != null) copy.mat = src.mat; else delete copy.mat;
    if (src.massG != null) copy.massG = src.massG; else delete copy.massG;
    if (src.props) copy.props = deepClone(src.props); else delete copy.props;
    if (src.opacity != null) copy.opacity = src.opacity; else delete copy.opacity;
    if (src.texture) copy.texture = deepClone(src.texture); else delete copy.texture;
    const sm = Array.isArray(src.mir) ? src.mir : [1, 1, 1];
    const cm = isMirror ? [-sm[0], sm[1], sm[2]] : sm.slice();
    if (cm.every((v) => v === 1)) delete copy.mir; else copy.mir = cm;
    return copy;
  }
  function syncLinkedPart(doc, copy, src, isMirror = false) {
    if (!copy || !src) return false;
    if (src.kind === 'ref') {
      copy.kind = 'ref';
      copy.p = deepClone(src.p || {});
      delete copy.children; delete copy.partRef; delete copy.link; delete copy.linkMirror;
    } else if (src.partRef && src.partRef.docId) {
      copy.kind = 'group';
      copy.comp = true;
      copy.partRef = deepClone(src.partRef);
      copy.children = Model.remapChildIds(src.children || [], copy.id + '__');
      if (src.rollback != null) copy.rollback = src.rollback; else delete copy.rollback;
      delete copy.link; delete copy.linkMirror;
    } else {
      copy.link = src.id;
      if (isMirror) copy.linkMirror = true; else delete copy.linkMirror;
    }
    if (src.color) copy.color = src.color;
    if (src.colorSet) copy.colorSet = true; else delete copy.colorSet;
    if (src.mat != null) copy.mat = src.mat; else delete copy.mat;
    if (src.massG != null) copy.massG = src.massG; else delete copy.massG;
    if (src.props) copy.props = deepClone(src.props); else delete copy.props;
    if (src.opacity != null) copy.opacity = src.opacity; else delete copy.opacity;
    if (src.texture) copy.texture = deepClone(src.texture); else delete copy.texture;
    const sm = Array.isArray(src.mir) ? src.mir : [1, 1, 1];
    const cm = isMirror ? [-sm[0], sm[1], sm[2]] : sm.slice();
    if (cm.every((v) => v === 1)) delete copy.mir; else copy.mir = cm;
    return true;
  }

  // ================= Skelett-Skizze (BG-32) =================
  let selectedSkeletonId = null;
  const VALID_SKEL_PARAM_RE = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/;
  const SKEL_NON_EXPR_P = new Set([
    'op', 'pt', 'plane', 'keep', 'axis', 'scaleUnit', 'distUnit', 'mode', 'sourceId', 'csv', 'align',
    'target', 'targets', 'pivot', 'uniform', 'bendAxis', 'anchor', 'flip', 'face', 'faceRef', 'toFace',
    'dir', 'extent', 'wallSide', 'side', 'roundEnds', 'kind', 'extend', 'shape', 'form', 'norm', 'end',
    'from', 'ends', 'size', 'profile', 'autoNorm', 'style', 'autoDepth', 'layout', 'sketch3dId', 'wrapId',
    'prof', 'profName', 'by', 'lib', 'fmt', 'file', 'blobId', 'data', 'stepEntity', 'stepMat', 'sketch',
    'sketches', 'path', 'rail', 'rail2', 'path3d', 'sketch3d', 'features', 'datumId', 'axisId', 'axisEnt',
    'docId', 'docName', 'docType', 'variantId', 'skelOverrides', 'assembly', 'sel', 'printFit',
  ]);
  const SKEL_DIM_PREFIX = {
    len: 'Laenge',
    w: 'Breite',
    h: 'Hoehe',
    d: 'Durchmesser',
    r: 'Radius',
    dist: 'Abstand',
    distPL: 'Abstand',
    distCC: 'Abstand',
    ord: 'Abstand',
    ang: 'Winkel',
    angLL: 'Winkel',
    ang3: 'Winkel',
    arcLen: 'Bogenlaenge',
    x: 'PosX',
    y: 'PosY',
  };

  function isProMode() {
    return !(typeof ViewPrefs !== 'undefined' && ViewPrefs.simple);
  }
  function skeletons(doc = App.doc) {
    return (doc && Array.isArray(doc.skeletons)) ? doc.skeletons : [];
  }
  function findSkeleton(idOrName, doc = App.doc) {
    const key = String(idOrName || '').trim();
    if (!key) return null;
    const list = skeletons(doc);
    return list.find((sk) => sk && sk.id === key)
      || list.find((sk) => sk && sk.name && sk.name.toLowerCase() === key.toLowerCase())
      || null;
  }
  function defaultSkeletonName(doc = App.doc) {
    const list = skeletons(doc);
    const base = T('skel.defaultName');
    if (!list.some((s) => s && s.name && s.name.toLowerCase() === base.toLowerCase())) return base;
    let n = 2;
    while (list.some((s) => s && s.name && s.name.toLowerCase() === `${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
  }
  function isValidSkelParamName(name) {
    return typeof name === 'string' && VALID_SKEL_PARAM_RE.test(name) && !/^pi$/i.test(name);
  }
  function nextSkeletonDimName(dimKind, currentDims = [], doc = App.doc, excludeSkId = null) {
    const base = SKEL_DIM_PREFIX[dimKind] || 'Sk_Mass';
    const used = new Set();
    for (const p of (doc && Array.isArray(doc.params)) ? doc.params : []) {
      if (!p || !p.name) continue;
      if (excludeSkId && p.skeleton && p.skeleton.id === excludeSkId) continue;
      used.add(p.name.toLowerCase());
    }
    for (const sk of skeletons(doc)) {
      if (!sk || (excludeSkId && sk.id === excludeSkId)) continue;
      for (const d of sk.dims || []) if (d && d.name) used.add(d.name.toLowerCase());
    }
    for (const d of currentDims || []) if (d && d.name) used.add(d.name.toLowerCase());
    if (!used.has(base.toLowerCase())) return base;
    let n = 2;
    while (used.has(`${base}_${n}`.toLowerCase())) n++;
    return `${base}_${n}`;
  }
  function baseVarsWithoutSkeletons(doc, excludeSkId = null) {
    const v = {};
    const tables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    Object.defineProperty(v, '__tables', { value: tables, enumerable: false, configurable: true });
    for (const p of (doc && Array.isArray(doc.params)) ? doc.params : []) {
      if (!p || !p.name || p.skeleton) continue;
      if (p.measure && typeof p.expr === 'number' && isFinite(p.expr)) v[p.name] = p.expr;
    }
    for (const p of (doc && Array.isArray(doc.params)) ? doc.params : []) {
      if (!p || !p.name) continue;
      if (p.skeleton) {
        if (!excludeSkId || p.skeleton.id !== excludeSkId) {
          const val = typeof p.expr === 'number' ? p.expr : Model.num(p.expr, v, 0);
          if (isFinite(val)) v[p.name] = val;
        }
        continue;
      }
      try { v[p.name] = Expr.eval(String(p.expr), v, tables); }
      catch (_) { v[p.name] = 0; }
    }
    return v;
  }
  function skEntPoints(e) {
    const out = [];
    const P = (p, xy) => { if (xy) out.push([{ e: e.id, p }, xy]); };
    if (!e) return out;
    if (e.type === 'line' || e.type === 'slot') { P('a', e.a); P('b', e.b); if (e.a && e.b) P('mid', [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); }
    else if (e.type === 'arc') { P('a', e.a); P('b', e.b); P('m', e.m); const ai = SK.arcInfo(e.a, e.m, e.b); if (ai) P('c', ai.c); }
    else if (e.type === 'circle' || e.type === 'ellipse' || e.type === 'ellarc') P('c', e.c);
    else if (e.type === 'conic') { P('a', e.a); P('b', e.b); P('m', e.m); }
    else if (e.type === 'bridge') { P('a', SK.endA(e)); P('b', SK.endB(e)); }
    else if (e.type === 'text' || e.type === 'point') P('a', e.a);
    else if (e.type === 'poly') { P('c', e.c); SK.polyCorners(e).forEach((q, i) => P('v' + i, q)); }
    else if (e.type === 'rect') { SK.rectCorners(e).forEach((q, i) => P('k' + i, q)); if (e.a && e.b) P('c', [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); }
    return out;
  }
  function measureDimOnEnts(ents, dm) {
    if (!dm || !Array.isArray(ents)) return NaN;
    const findE = (id) => ents.find((x) => x && x.id === id) || null;
    if (dm.e) {
      const en = findE(dm.e);
      return en ? SK.measure(en, dm.k) : NaN;
    }
    const refs = dm.refs || [];
    const refXY = (ref) => {
      if (!ref) return null;
      if (ref.at) return ref.at;
      if (ref.e === 'origin') return [0, 0];
      const e = findE(ref.e); if (!e) return null;
      if (ref.p === 'mid' && e.a && e.b) return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      const m = skEntPoints(e).find(([r]) => r.p === ref.p);
      return m ? m[1] : null;
    };
    const refLine = (ref) => {
      const e = ref && findE(ref.e); if (!e) return null;
      if (e.type === 'rect') { const c = SK.rectCorners(e); const i = ref.edge || 0; return [c[i], c[(i + 1) % 4]]; }
      return e.a && e.b ? [e.a, e.b] : null;
    };
    const refCircle = (ref) => {
      const e = ref && findE(ref.e); if (!e) return null;
      if (e.type === 'circle') return { c: e.c, r: e.r };
      if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); return ai ? { c: ai.c, r: ai.r } : null; }
      return null;
    };
    const [r0, r1] = refs;
    if (dm.k === 'dist') { const a = refXY(r0), b = refXY(r1); return a && b ? SK.d2(a, b) : NaN; }
    if (dm.k === 'distCC') {
      const A = refCircle(r0), B = refCircle(r1);
      if (!A || !B) return NaN;
      const d = SK.d2(A.c, B.c);
      return dm.cm === 'min' ? d - A.r - B.r : dm.cm === 'max' ? d + A.r + B.r : d;
    }
    if (dm.k === 'distPL') {
      const p = refXY(r0), L = refLine(r1);
      if (!p || !L) return NaN;
      const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1];
      return Math.abs((p[0] - L[0][0]) * dy - (p[1] - L[0][1]) * dx) / (Math.hypot(dx, dy) || 1);
    }
    if (dm.k === 'angLL') {
      const A = refLine(r0), B = refLine(r1);
      if (!A || !B) return NaN;
      const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], vx = B[1][0] - B[0][0], vy = B[1][1] - B[0][1];
      return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI;
    }
    if (dm.k === 'ang3') {
      const a = refXY(refs[0]), v0 = refXY(refs[1]), b = refXY(refs[2]);
      if (!a || !v0 || !b) return NaN;
      const ux = a[0] - v0[0], uy = a[1] - v0[1], wx = b[0] - v0[0], wy = b[1] - v0[1];
      if (Math.hypot(ux, uy) < 1e-12 || Math.hypot(wx, wy) < 1e-12) return NaN;
      return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
    }
    if (dm.k === 'ord') {
      const p = refXY(r0); if (!p) return NaN;
      const sg = dm.sg === -1 ? -1 : 1;
      const Ln = refLine(r1);
      if (Ln) {
        const dx = Ln[1][0] - Ln[0][0], dy = Ln[1][1] - Ln[0][1];
        return sg * (-(p[0] - Ln[0][0]) * dy + (p[1] - Ln[0][1]) * dx) / (Math.hypot(dx, dy) || 1);
      }
      const o = refXY(r1); if (!o) return NaN;
      const ax = dm.axis === 'y' ? 1 : 0;
      return sg * (p[ax] - o[ax]);
    }
    return NaN;
  }
  function replaceParamNameInDoc(doc, oldName, replName) {
    if (!doc || !oldName || !replName || oldName === replName) return false;
    const re = new RegExp('(^|[^A-Za-zÄÖÜäöüß_0-9])' + oldName.replace(/[$^.*+?()[\]{}|\\]/g, '\\$&') + '(?![A-Za-zÄÖÜäöüß_0-9])', 'gi');
    let hit = false;
    const fix = (s) => {
      if (typeof s !== 'string') return s;
      const r = s.replace(re, (_, pre) => { hit = true; return pre + replName; });
      return /^-?\d+(\.\d+)?$/.test(r.trim()) ? +r : r;
    };
    for (const q of doc.params || []) if (q && !q.skeleton) q.expr = fix(q.expr);
    for (const tb of doc.tables || []) for (const r of tb.rows || []) if (r) r.val = fix(r.val);
    for (const v of doc.variants || []) if (v && v.values) for (const k of Object.keys(v.values)) v.values[k] = fix(v.values[k]);
    for (const av of doc.asmVariants || []) {
      if (av && av.values) for (const k of Object.keys(av.values)) av.values[k] = fix(av.values[k]);
      if (av && av.itemParams) for (const ip of Object.values(av.itemParams)) if (ip && typeof ip === 'object') for (const k of Object.keys(ip)) ip[k] = fix(ip[k]);
    }
    for (const sk of skeletons(doc)) {
      for (const d of sk.dims || []) if (d && typeof d.v === 'string') d.v = fix(d.v);
    }
    Model.walk(doc.items || [], (it) => {
      if (!it) return;
      for (const k in it.p || {}) {
        if (SKEL_NON_EXPR_P.has(k)) continue;
        it.p[k] = fix(it.p[k]);
      }
      if (it.p && it.p.skelOverrides && typeof it.p.skelOverrides === 'object') {
        for (const k of Object.keys(it.p.skelOverrides)) it.p.skelOverrides[k] = fix(it.p.skelOverrides[k]);
      }
      for (const k in it.t || {}) it.t[k] = fix(it.t[k]);
      for (const f of it.finishes || []) {
        f.r = fix(f.r);
        if (f.r2 != null) f.r2 = fix(f.r2);
        if (f.a != null) f.a = fix(f.a);
        if (f.d1 != null) f.d1 = fix(f.d1);
        if (f.d2 != null) f.d2 = fix(f.d2);
        if (f.d3 != null) f.d3 = fix(f.d3);
        for (const fw of f.faceWalls || []) fw.r = fix(fw.r);
      }
      if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) d.v = fix(d.v);
      if (it.p && Array.isArray(it.p.sketches)) for (const sk of it.p.sketches) for (const d of (sk && sk.dims) || []) d.v = fix(d.v);
      if (it.p && it.p.sketch3d) {
        for (const e of it.p.sketch3d.ents || []) for (const pk of ['a', 'm', 'b']) if (Array.isArray(e[pk])) for (let j = 0; j < 3; j++) e[pk][j] = fix(e[pk][j]);
        for (const d of it.p.sketch3d.dims || []) d.v = fix(d.v);
      }
      if (it.userPart && Array.isArray(it.userPart.params)) for (const qp of it.userPart.params) qp.expr = fix(qp.expr);
      if (it.partRef && Array.isArray(it.partRef.params)) for (const qp of it.partRef.params) qp.expr = fix(qp.expr);
    });
    for (const j of doc.joints || []) if (j && j.kind === 'distance' && j.dist != null) j.dist = fix(j.dist);
    return hit;
  }
  function collectItemExprNames(it, doc, seenDocs = new Set()) {
    const names = new Set();
    const addExpr = (val) => {
      if (typeof val !== 'string' || !val.trim()) return;
      for (const nm of Expr.names(val)) names.add(nm.toLowerCase());
    };
    const scanItem = (node) => {
      if (!node) return;
      for (const k in node.t || {}) addExpr(node.t[k]);
      for (const k in node.p || {}) {
        if (SKEL_NON_EXPR_P.has(k)) continue;
        addExpr(node.p[k]);
      }
      if (node.p && node.p.skelOverrides && typeof node.p.skelOverrides === 'object') {
        for (const v of Object.values(node.p.skelOverrides)) addExpr(v);
      }
      for (const f of node.finishes || []) {
        addExpr(f.r); addExpr(f.r2); addExpr(f.a); addExpr(f.d1); addExpr(f.d2); addExpr(f.d3);
        for (const fw of f.faceWalls || []) addExpr(fw.r);
      }
      if (node.p && node.p.sketch) for (const d of node.p.sketch.dims || []) addExpr(d.v);
      if (node.p && Array.isArray(node.p.sketches)) for (const sk of node.p.sketches) for (const d of (sk && sk.dims) || []) addExpr(d.v);
      if (node.p && node.p.sketch3d) {
        for (const e of node.p.sketch3d.ents || []) for (const pk of ['a', 'm', 'b']) if (Array.isArray(e[pk])) for (let j = 0; j < 3; j++) addExpr(e[pk][j]);
        for (const d of node.p.sketch3d.dims || []) addExpr(d.v);
      }
      if (node.userPart && Array.isArray(node.userPart.params)) for (const qp of node.userPart.params) addExpr(qp.expr);
      if (node.partRef && Array.isArray(node.partRef.params)) for (const qp of node.partRef.params) addExpr(qp.expr);
      if (node.kind === 'ref' && node.p && node.p.docId && !seenDocs.has(node.p.docId)) {
        const rd = resolveDoc(node.p.docId);
        if (rd) {
          seenDocs.add(rd.id);
          const ownParamLower = new Set((rd.params || []).filter((q) => q && q.name).map((q) => q.name.toLowerCase()));
          const ovKeys = new Set(Object.keys((node.p && node.p.skelOverrides) || {}).map((k) => k.toLowerCase()));
          for (const qp of rd.params || []) {
            if (!qp || !qp.name) continue;
            if (!ovKeys.has(qp.name.toLowerCase())) addExpr(qp.expr);
          }
          const subNames = new Set();
          for (const c of rd.items || []) {
            for (const sn of collectItemExprNames(c, rd, seenDocs)) subNames.add(sn);
          }
          for (const sn of subNames) {
            if (!ownParamLower.has(sn) || ovKeys.has(sn)) names.add(sn);
          }
        }
      }
      if (Array.isArray(node.children)) for (const c of node.children) scanItem(c);
    };
    scanItem(it);
    return names;
  }
  function skeletonDrivenParts(skId = null, paramName = null, doc = App.doc) {
    if (!doc) return [];
    const directMap = new Map();
    if (paramName) {
      directMap.set(String(paramName).toLowerCase(), paramName);
    } else {
      for (const sk of skeletons(doc)) {
        if (skId && sk.id !== skId) continue;
        for (const d of sk.dims || []) {
          if (d && isValidSkelParamName(d.name)) directMap.set(d.name.toLowerCase(), d.name);
        }
      }
      for (const p of doc.params || []) {
        if (!p || !p.skeleton || !p.name) continue;
        if (skId && p.skeleton.id !== skId) continue;
        directMap.set(p.name.toLowerCase(), p.name);
      }
    }
    if (!directMap.size) return [];
    const expanded = new Set(directMap.keys());
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of doc.params || []) {
        if (!p || !p.name || p.skeleton) continue;
        const low = p.name.toLowerCase();
        if (expanded.has(low)) continue;
        if (typeof p.expr === 'string' && Expr.names(p.expr).some((nm) => expanded.has(nm.toLowerCase()))) {
          expanded.add(low);
          changed = true;
        }
      }
    }
    const out = [];
    for (const it of doc.items || []) {
      if (!it || it.suppressed) continue;
      const used = collectItemExprNames(it, doc);
      const hits = [];
      for (const u of used) {
        if (expanded.has(u)) hits.push(directMap.get(u) || u);
      }
      if (hits.length) {
        out.push({ itemId: it.id, name: Model.label(it), params: [...new Set(hits)] });
      }
    }
    return out;
  }
  function syncSkeletons(doc = App.doc) {
    if (!doc) return { synced: 0, changed: false };
    doc.params = Array.isArray(doc.params) ? doc.params : [];
    const list = skeletons(doc);
    if (!list.length) {
      let changed = false;
      for (const p of doc.params) {
        if (p && p.skeleton) { delete p.skeleton; changed = true; }
      }
      return { synced: 0, changed };
    }
    const baseV = {};
    const tables = Array.isArray(doc.tables) ? doc.tables : [];
    Object.defineProperty(baseV, '__tables', { value: tables, enumerable: false, configurable: true });
    for (const p of doc.params) {
      if (!p || !p.name || p.skeleton) continue;
      if (p.measure && typeof p.expr === 'number' && isFinite(p.expr)) baseV[p.name] = p.expr;
    }
    for (const p of doc.params) {
      if (!p || !p.name || p.skeleton) continue;
      try { baseV[p.name] = Expr.eval(String(p.expr), baseV, tables); }
      catch (_) { baseV[p.name] = 0; }
    }
    const desired = [];
    const suppressedIds = new Set();
    for (const sk of list) {
      if (!sk || !sk.id) continue;
      if (sk.suppressed) {
        suppressedIds.add(sk.id);
        for (const p of doc.params) {
          if (p && p.skeleton && p.skeleton.id === sk.id && p.name) {
            const val = typeof p.expr === 'number' ? p.expr : Model.num(p.expr, baseV, 0);
            if (isFinite(val)) baseV[p.name] = val;
          }
        }
        continue;
      }
      let solvedEnts = Array.isArray(sk.ents) ? sk.ents : [];
      if (typeof Solver !== 'undefined' && Solver.cached) {
        const res = Solver.cached({ ents: sk.ents || [], dims: sk.dims || [], cons: sk.cons || [] }, baseV);
        if (res && Array.isArray(res.ents)) solvedEnts = res.ents;
      }
      for (const d of sk.dims || []) {
        if (!d) continue;
        if (!d.id) d.id = uid('m');
        if (!isValidSkelParamName(d.name)) continue;
        let val = d.ref ? measureDimOnEnts(solvedEnts, d) : Model.num(d.v, baseV, NaN);
        if (!isFinite(val)) val = measureDimOnEnts(solvedEnts, d);
        if (!isFinite(val)) continue;
        val = round(val, 6);
        desired.push({
          skId: sk.id,
          skName: sk.name || T('skel.defaultName'),
          dimId: d.id,
          name: d.name,
          k: d.k,
          ref: !!d.ref,
          val,
        });
        baseV[d.name] = val;
      }
    }
    let changed = false;
    const matchedParamIds = new Set();
    for (const ds of desired) {
      let existing = doc.params.find((p) => p && p.skeleton && p.skeleton.id === ds.skId && p.skeleton.dimId === ds.dimId);
      if (!existing) {
        const sameName = doc.params.find((p) => p && p.name && p.name.toLowerCase() === ds.name.toLowerCase());
        if (sameName && !sameName.skeleton) continue;
        if (sameName && sameName.skeleton) existing = sameName;
      }
      const nextMeta = { id: ds.skId, dimId: ds.dimId, skName: ds.skName, k: ds.k, ref: ds.ref };
      if (existing) {
        if (existing.name !== ds.name) {
          const clash = doc.params.some((p) => p && p !== existing && p.name && p.name.toLowerCase() === ds.name.toLowerCase());
          if (!clash) {
            const oldName = existing.name;
            existing.name = ds.name;
            replaceParamNameInDoc(doc, oldName, ds.name);
            changed = true;
          }
        }
        if (existing.expr !== ds.val) { existing.expr = ds.val; changed = true; }
        if (JSON.stringify(existing.skeleton) !== JSON.stringify(nextMeta)) { existing.skeleton = nextMeta; changed = true; }
        matchedParamIds.add(existing.id);
      } else {
        const np = { id: uid('m'), name: ds.name, expr: ds.val, skeleton: nextMeta };
        doc.params.push(np);
        matchedParamIds.add(np.id);
        changed = true;
      }
    }
    const usedNames = new Set();
    Model.walk(doc.items || [], (it) => {
      for (const nm of collectItemExprNames(it, doc)) usedNames.add(nm);
    });
    for (const p of doc.params) {
      if (!p || p.skeleton) continue;
      if (typeof p.expr === 'string') for (const nm of Expr.names(p.expr)) usedNames.add(nm.toLowerCase());
    }
    const nextParams = [];
    for (const p of doc.params) {
      if (!p || !p.skeleton || matchedParamIds.has(p.id) || suppressedIds.has(p.skeleton.id)) {
        nextParams.push(p);
        continue;
      }
      changed = true;
      if (p.name && usedNames.has(p.name.toLowerCase())) {
        delete p.skeleton;
        nextParams.push(p);
      }
    }
    if (nextParams.length !== doc.params.length) doc.params = nextParams;
    return { synced: desired.length, changed };
  }
  function startSkeleton(opts = {}) {
    if (!isProMode()) {
      UI.toast(T('skel.proOnly'), { icon: 'info' });
      return false;
    }
    if (opts.choose && typeof Sketch !== 'undefined' && Sketch.chooseAndStartSkeleton) {
      return Sketch.chooseAndStartSkeleton(opts.anchor || $('#t-asm-skeleton'));
    }
    if (typeof Sketch === 'undefined' || !Sketch.startSkeleton) return false;
    return Sketch.startSkeleton(opts);
  }
  function editSkeleton(id) {
    if (!isProMode()) {
      UI.toast(T('skel.proOnly'), { icon: 'info' });
      return false;
    }
    if (typeof Sketch === 'undefined' || !Sketch.editSkeleton) return false;
    return Sketch.editSkeleton(id);
  }
  function createSkeleton(opts = {}) {
    if (!App.doc) return null;
    if (!isProMode() && !opts.force) {
      UI.toast(T('skel.proOnly'), { icon: 'info' });
      return null;
    }
    const name = String(opts.name || defaultSkeletonName(App.doc)).trim() || defaultSkeletonName(App.doc);
    const plane = opts.plane ? deepClone(opts.plane) : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const ents = deepClone(opts.ents || []);
    const dims = deepClone(opts.dims || []);
    const cons = deepClone(opts.cons || []);
    for (const d of dims) {
      if (!d) continue;
      if (!d.id) d.id = uid('m');
      if (!d.ref && !d.name) d.name = nextSkeletonDimName(d.k, dims, App.doc);
    }
    if (typeof Solver !== 'undefined' && Solver.solve && ents.length) {
      Solver.solve({ ents, dims, cons }, baseVarsWithoutSkeletons(App.doc), { inPlace: true, analyze: false });
    }
    const sk = {
      id: opts.id || uid('sk'),
      name,
      plane,
      ents,
      dims,
      cons,
      ...(opts.hidden ? { hidden: true } : {}),
    };
    App.change(T('skel.createUndo', { name }), (doc) => {
      doc.skeletons = Array.isArray(doc.skeletons) ? doc.skeletons : [];
      doc.skeletons.push(sk);
    });
    if (opts.select !== false) selectSkeleton(sk.id);
    else if (typeof Sketch !== 'undefined' && Sketch.render3dScene) Sketch.render3dScene();
    return findSkeleton(sk.id);
  }
  function saveSkeletonSketch(editId, skData, opts = {}) {
    if (!App.doc || !skData) return null;
    let savedId = editId || null;
    const label = editId ? T('skel.editUndo') : T('skel.createUndo', { name: opts.name || defaultSkeletonName(App.doc) });
    const ok = App.change(label, (doc) => {
      if (Array.isArray(opts.blocks)) doc.blocks = deepClone(opts.blocks);
      doc.skeletons = Array.isArray(doc.skeletons) ? doc.skeletons : [];
      const curDims = deepClone(skData.dims || []);
      for (const d of curDims) {
        if (!d) continue;
        if (!d.id) d.id = uid('m');
      }
      if (editId) {
        const sk = doc.skeletons.find((x) => x && x.id === editId);
        if (!sk) return false;
        sk.plane = deepClone(skData.plane);
        sk.ents = deepClone(skData.ents || []);
        sk.dims = curDims;
        sk.cons = deepClone(skData.cons || []);
        if (skData.blockInsts && skData.blockInsts.length) sk.blockInsts = deepClone(skData.blockInsts); else delete sk.blockInsts;
        if (skData.locked) sk.locked = true; else delete sk.locked;
        if (skData.bg) sk.bg = deepClone(skData.bg); else delete sk.bg;
        if (skData.guides && skData.guides.length) sk.guides = deepClone(skData.guides); else delete sk.guides;
        if (skData.gridMode === 'polar') { sk.gridMode = 'polar'; sk.polar = deepClone(skData.polar); } else { delete sk.gridMode; delete sk.polar; }
        savedId = sk.id;
      } else {
        const sk = {
          id: uid('sk'),
          name: String(opts.name || defaultSkeletonName(doc)).trim() || defaultSkeletonName(doc),
          plane: deepClone(skData.plane),
          ents: deepClone(skData.ents || []),
          dims: curDims,
          cons: deepClone(skData.cons || []),
          ...(skData.blockInsts && skData.blockInsts.length ? { blockInsts: deepClone(skData.blockInsts) } : {}),
          ...(skData.locked ? { locked: true } : {}),
          ...(skData.bg ? { bg: deepClone(skData.bg) } : {}),
          ...(skData.guides && skData.guides.length ? { guides: deepClone(skData.guides) } : {}),
          ...(skData.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(skData.polar) } : {}),
        };
        doc.skeletons.push(sk);
        savedId = sk.id;
      }
    });
    if (ok === false) return null;
    const saved = findSkeleton(savedId);
    const driven = saved ? skeletonDrivenParts(saved.id) : [];
    if (driven.length) {
      UI.toast(T(driven.length === 1 ? 'skel.savedDrivenOneToast' : 'skel.savedDrivenManyToast', { name: saved.name, n: driven.length }), { icon: 'check', ms: 3400 });
    } else if (saved) {
      UI.toast(T('skel.savedToast', { name: saved.name }), { icon: 'check', ms: 2600 });
    }
    return saved;
  }
  function setSkeletonDim(skId, dimIdOrName, val, opts = {}) {
    if (!App.doc) return false;
    const skNow = findSkeleton(skId);
    if (!skNow) return false;
    const key = String(dimIdOrName || '').trim();
    const dimNow = (skNow.dims || []).find((d) => d && (d.id === key || (d.name && d.name.toLowerCase() === key.toLowerCase())));
    if (!dimNow) return false;
    const baseV = baseVarsWithoutSkeletons(App.doc, skNow.id);
    const n = Model.num(val, baseV, NaN);
    const signed = dimNow.k === 'ang' || dimNow.k === 'x' || dimNow.k === 'y' || dimNow.k === 'ord' || /^hAng\d+$/.test(dimNow.k || '');
    const zeroOk = dimNow.k === 'dist' || dimNow.k === 'distPL' || dimNow.k === 'distCC' || dimNow.k === 'angLL' || dimNow.k === 'ang3';
    if (!isFinite(n) || (!signed && (zeroOk ? n < 0 : n <= 0)) || ((dimNow.k === 'angLL' || dimNow.k === 'ang3') && n > 180)) {
      UI.toast(T('sk.toast.badVal', { v: val }), { kind: 'bad' });
      return false;
    }
    const cleanVal = (typeof val === 'string' && !Expr.names(val).length) ? round(n, 4) : val;
    let conflict = false;
    const ok = App.change(T('skel.dimChangeUndo', { name: dimNow.name || skNow.name }), (doc) => {
      const sk = findSkeleton(skNow.id, doc);
      const dm = sk && (sk.dims || []).find((d) => d && d.id === dimNow.id);
      if (!sk || !dm) return false;
      dm.v = cleanVal;
      delete dm.ref;
      if (opts.name != null && isValidSkelParamName(opts.name)) dm.name = opts.name;
      if (typeof Solver !== 'undefined' && Solver.solve) {
        const res = Solver.solve({ ents: sk.ents || [], dims: sk.dims || [], cons: sk.cons || [] }, baseVarsWithoutSkeletons(doc, sk.id), { inPlace: true, analyze: false });
        if (res && !res.ok) { conflict = true; return false; }
      }
    }, opts.merge ? { merge: opts.merge } : {});
    if (conflict || ok === false) {
      if (conflict) UI.toast(T('skel.dimConflictToast'), { kind: 'bad' });
      return false;
    }
    if (typeof Sketch !== 'undefined' && Sketch.render3dScene) Sketch.render3dScene();
    const driven = skeletonDrivenParts(skNow.id, dimNow.name);
    if (!opts.silent && driven.length) {
      UI.toast(T(driven.length === 1 ? 'skel.recalcOneToast' : 'skel.recalcManyToast', { n: driven.length }), { icon: 'check', ms: 2400 });
    }
    return true;
  }
  function renameSkeletonDim(skId, dimIdOrName, newName) {
    const clean = String(newName || '').trim().replace(/\s+/g, '_');
    if (!isValidSkelParamName(clean)) {
      UI.toast(T('left.par.badName'), { kind: 'bad' });
      return false;
    }
    const skNow = findSkeleton(skId);
    if (!skNow) return false;
    const key = String(dimIdOrName || '').trim();
    const dmNow = (skNow.dims || []).find((d) => d && (d.id === key || (d.name && d.name.toLowerCase() === key.toLowerCase())));
    if (!dmNow) return false;
    if (dmNow.name === clean) return true;
    const clash = (App.doc.params || []).some((p) => p && p.name && p.name.toLowerCase() === clean.toLowerCase() && !(p.skeleton && p.skeleton.id === skNow.id && p.skeleton.dimId === dmNow.id))
      || skeletons(App.doc).some((s) => (s.dims || []).some((d) => d && d !== dmNow && d.name && d.name.toLowerCase() === clean.toLowerCase()));
    if (clash) {
      UI.toast(T('left.par.paramExists'), { kind: 'bad' });
      return false;
    }
    App.change(T('skel.dimRenameUndo'), (doc) => {
      const sk = findSkeleton(skNow.id, doc);
      const dm = sk && (sk.dims || []).find((d) => d && d.id === dmNow.id);
      if (!dm) return false;
      dm.name = clean;
    });
    return true;
  }
  function renameSkeleton(skId, newName) {
    const clean = String(newName || '').trim();
    const skNow = findSkeleton(skId);
    if (!skNow || !clean || clean === skNow.name) return false;
    App.change(T('skel.renameUndo'), (doc) => {
      const sk = findSkeleton(skNow.id, doc);
      if (!sk) return false;
      sk.name = clean;
    });
    return true;
  }
  function toggleSkeletonHidden(skId) {
    const skNow = findSkeleton(skId);
    if (!skNow) return false;
    App.change(skNow.hidden ? T('skel.showUndo') : T('skel.hideUndo'), (doc) => {
      const sk = findSkeleton(skNow.id, doc);
      if (!sk) return false;
      sk.hidden = !sk.hidden;
    });
    if (typeof Sketch !== 'undefined' && Sketch.render3dScene) Sketch.render3dScene();
    return true;
  }
  function removeSkeleton(skId) {
    const skNow = findSkeleton(skId);
    if (!skNow) return false;
    if (selectedSkeletonId === skNow.id) selectedSkeletonId = null;
    App.change(T('skel.deleteUndo', { name: skNow.name }), (doc) => {
      doc.skeletons = skeletons(doc).filter((s) => s && s.id !== skNow.id);
    });
    if (typeof Sketch !== 'undefined' && Sketch.render3dScene) Sketch.render3dScene();
    return true;
  }
  function editableBindTargets(doc = App.doc) {
    if (!doc) return [];
    const targets = [];
    const addTargetsFor = (it, prefix = '', labelPrefix = '') => {
      if (!it || it.suppressed) return;
      const nm = labelPrefix ? `${labelPrefix} · ${Model.label(it)}` : Model.label(it);
      if (it.kind === 'ref') {
        const rd = it.p && it.p.docId ? resolveDoc(it.p.docId) : null;
        for (const qp of (rd && Array.isArray(rd.params)) ? rd.params : []) {
          if (!qp || !qp.name) continue;
          targets.push({ propKey: `${prefix}refparam:${qp.name}`, label: `${nm} → ${qp.name}` });
        }
        targets.push({ propKey: `${prefix}t.x`, label: `${nm} → X` });
        targets.push({ propKey: `${prefix}t.y`, label: `${nm} → Y` });
        targets.push({ propKey: `${prefix}t.z`, label: `${nm} → Z` });
        return;
      }
      if (it.kind === 'group') {
        if (it.partRef && Array.isArray(it.partRef.params)) {
          for (const qp of it.partRef.params) {
            if (!qp || !qp.name) continue;
            targets.push({ propKey: `${prefix}refparam:${qp.name}`, label: `${nm} → ${qp.name}` });
          }
        }
        for (const c of it.children || []) {
          addTargetsFor(c, `${prefix}child:${c.id}:`, nm);
        }
        targets.push({ propKey: `${prefix}t.x`, label: `${nm} → X` });
        targets.push({ propKey: `${prefix}t.y`, label: `${nm} → Y` });
        targets.push({ propKey: `${prefix}t.z`, label: `${nm} → Z` });
        return;
      }
      const def = typeof KINDS !== 'undefined' ? KINDS[it.kind] : null;
      if (def && Array.isArray(def.params) && def.params.length) {
        for (const q of def.params) {
          targets.push({ propKey: `${prefix}p.${q.k}`, label: `${nm} → ${q.label}` });
        }
      }
      if (it.kind === 'extrude') {
        targets.push({ propKey: `${prefix}p.dist`, label: `${nm} → ${T('panel.ext.depth')}` });
      } else if (it.kind === 'revolve') {
        targets.push({ propKey: `${prefix}p.angle`, label: `${nm} → ${T('common.angle')}` });
      }
      if (it.p && it.p.sketch && Array.isArray(it.p.sketch.dims)) {
        for (const d of it.p.sketch.dims) {
          if (!d || d.ref) continue;
          const dk = (typeof SK !== 'undefined' && SK.DIMNAME && SK.DIMNAME[d.k]) || d.k;
          targets.push({ propKey: `${prefix}skdim:${d.id}`, label: `${nm} → ${dk}` });
        }
      }
      targets.push({ propKey: `${prefix}t.x`, label: `${nm} → X` });
      targets.push({ propKey: `${prefix}t.y`, label: `${nm} → Y` });
      targets.push({ propKey: `${prefix}t.z`, label: `${nm} → Z` });
    };
    for (const it of doc.items || []) {
      const list = [];
      const prevLen = targets.length;
      addTargetsFor(it);
      for (let i = prevLen; i < targets.length; i++) list.push({ itemId: it.id, itemName: Model.label(it), ...targets[i] });
      targets.splice(prevLen, targets.length - prevLen, ...list);
    }
    return targets;
  }
  function applyPropBinding(it, propKey, paramName) {
    if (!it || !propKey) return false;
    if (propKey.startsWith('child:')) {
      const rest = propKey.slice(6);
      const sep = rest.indexOf(':');
      if (sep < 0) return false;
      const cid = rest.slice(0, sep);
      const subKey = rest.slice(sep + 1);
      const child = (it.children || []).find((c) => c && c.id === cid);
      return child ? applyPropBinding(child, subKey, paramName) : false;
    }
    if (propKey.startsWith('refparam:')) {
      const pName = propKey.slice(9);
      if (!pName) return false;
      it.p = it.p || {};
      it.p.skelOverrides = { ...(it.p.skelOverrides || {}), [pName]: paramName };
      return true;
    }
    if (propKey.startsWith('skdim:')) {
      const did = propKey.slice(6);
      const dm = it.p && it.p.sketch && Array.isArray(it.p.sketch.dims)
        ? it.p.sketch.dims.find((d) => d && d.id === did)
        : null;
      if (!dm) return false;
      dm.v = paramName;
      delete dm.ref;
      return true;
    }
    if (propKey.startsWith('t.')) {
      const k = propKey.slice(2);
      if (!k) return false;
      it.t = it.t || Model.T0();
      it.t[k] = paramName;
      return true;
    }
    const pk = propKey.startsWith('p.') ? propKey.slice(2) : propKey;
    if (!pk) return false;
    it.p = it.p || {};
    it.p[pk] = paramName;
    return true;
  }
  function bindPartToSkeleton(itemId, propKey, paramName, opts = {}) {
    if (!App.doc || !itemId || !propKey || !paramName) return false;
    const fNow = Model.find(App.doc, itemId);
    if (!fNow) return false;
    const ok = App.change(T('skel.bindUndo', { part: Model.label(fNow.item), param: paramName }), (doc) => {
      const f = Model.find(doc, itemId);
      if (!f) return false;
      return applyPropBinding(f.item, propKey, paramName);
    });
    if (ok === false) return false;
    if (!opts.silent) {
      UI.toast(T('skel.bindToast', { part: Model.label(fNow.item), param: paramName }), { icon: 'check', ms: 2600 });
    }
    return true;
  }
  function selectSkeleton(id, opts = {}) {
    const next = id ? (findSkeleton(id) ? id : null) : null;
    if (selectedSkeletonId === next && opts.silent) return;
    selectedSkeletonId = next;
    if (opts.silent) return;
    if (next) {
      if (typeof App !== 'undefined' && App.sel && App.sel.length) App.select([]);
      if (typeof Datums !== 'undefined') {
        if (Datums.select) Datums.select(null);
        if (Datums.selectAxis) Datums.selectAxis(null);
        if (Datums.selectPoint) Datums.selectPoint(null);
        if (Datums.selectCsys) Datums.selectCsys(null);
      }
      if (typeof PointClouds !== 'undefined' && PointClouds.select) PointClouds.select(null);
      if (typeof Measure !== 'undefined' && Measure.select) Measure.select(null);
      if (typeof Joints !== 'undefined' && Joints.select) Joints.select(null);
    }
    if (typeof Sketch !== 'undefined' && Sketch.render3dScene) Sketch.render3dScene();
    if (typeof Panels !== 'undefined') {
      if (Panels.renderLeft) Panels.renderLeft();
      if (Panels.renderRight) Panels.renderRight();
    }
  }
  function skeletonTreeSection() {
    if (!isProMode() || !App.doc) return null;
    const list = skeletons();
    if (!Model.isAssembly(App.doc) && !list.length) return null;
    const head = h('div', { class: 'section-h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } }, h('span', null, T('skel.treeTitle')));
    const addBtn = h('button', { type: 'button', class: 'btn small', id: 'skel-tree-add', 'data-help': 'skeletonSketch' });
    addBtn.innerHTML = icon('plus') + esc(T('skel.addShort'));
    addBtn.onclick = (e) => { e.stopPropagation(); startSkeleton({ choose: true, anchor: e.currentTarget }); };
    head.append(addBtn);
    const sec = h('div', { class: 'datum-tree skel-tree pro', id: 'skel-tree', 'data-help': 'skeletonSketch' }, head);
    if (!list.length) {
      sec.append(h('div', { class: 'hint-box' }, T('skel.emptyHint')));
      return sec;
    }
    for (const sk of list) {
      const isSel = selectedSkeletonId === sk.id;
      const namedDims = (sk.dims || []).filter((d) => d && isValidSkelParamName(d.name));
      const driven = skeletonDrivenParts(sk.id);
      const row = h('div', {
        class: 'tree-row skel-row' + (isSel ? ' sel' : '') + (sk.hidden ? ' muted' : ''),
        tabindex: '0',
        role: 'button',
        'aria-pressed': isSel ? 'true' : 'false',
        dataset: { skeletonId: sk.id, skeletonName: sk.name },
      });
      const ic = h('span', { class: 'swatch skel' }); ic.innerHTML = icon('sketch');
      const eye = h('button', { type: 'button', class: 'skel-eye', 'aria-label': T(sk.hidden ? 'common.show' : 'common.hide'), 'data-tip': T(sk.hidden ? 'common.show' : 'common.hide') });
      eye.innerHTML = icon(sk.hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); toggleSkeletonHidden(sk.id); };
      const ed = h('button', { type: 'button', class: 'skel-edit', 'aria-label': T('skel.editBtn'), 'data-tip': T('skel.editBtn') });
      ed.innerHTML = icon('edit');
      ed.onclick = (e) => { e.stopPropagation(); editSkeleton(sk.id); };
      row.append(
        ic,
        h('span', { class: 'nm', title: sk.name }, sk.name),
        h('span', { class: 'sub mono' }, `${namedDims.length} · ${driven.length}`),
        h('span', { class: 'm-acts' }, eye, ed)
      );
      row.onclick = () => selectSkeleton(sk.id);
      row.ondblclick = (e) => { e.stopPropagation(); editSkeleton(sk.id); };
      row.addEventListener('keydown', (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectSkeleton(sk.id); }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: T('skel.editBtn'), run: () => editSkeleton(sk.id) },
          { icon: sk.hidden ? 'eye' : 'eyeOff', label: T(sk.hidden ? 'common.show' : 'common.hide'), run: () => toggleSkeletonHidden(sk.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('skel.renameTitle'), T('common.name'), sk.name, T('common.rename')); if (n && n.trim()) renameSkeleton(sk.id, n); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => removeSkeleton(sk.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }
  function skeletonSection(ctx = 'proj') {
    if (!isProMode() || !App.doc) return null;
    const list = skeletons();
    if (!Model.isAssembly(App.doc) && !list.length) return null;
    const sec = h('div', { class: 'section pro skel-sec', id: ctx + '-skel-sec', 'data-help': 'skeletonSketch' },
      h('div', { class: 'section-h' }, T('skel.treeTitle'))
    );
    if (!list.length) {
      sec.append(h('div', { class: 'hint-box' }, T('skel.emptyHint')));
    } else {
      const baseV = baseVarsWithoutSkeletons(App.doc);
      for (const sk of list) {
        const card = h('div', { class: 'skel-proj-card', dataset: { skeletonId: sk.id } });
        const openBtn = h('button', { type: 'button', class: 'btn small ghost' }, T('skel.openBtn'));
        openBtn.onclick = () => selectSkeleton(sk.id);
        const editBtn = h('button', { type: 'button', class: 'btn small' }, T('skel.editShort'));
        editBtn.onclick = () => editSkeleton(sk.id);
        const driven = skeletonDrivenParts(sk.id);
        card.append(h('div', { class: 'skel-proj-head' },
          h('b', null, sk.name),
          h('span', { class: 'sub mono' }, T('skel.drivenShort', { n: driven.length })),
          openBtn,
          editBtn
        ));
        const namedDims = (sk.dims || []).filter((d) => d && isValidSkelParamName(d.name) && !d.ref);
        if (namedDims.length) {
          const flds = h('div', { class: 'fields' });
          for (const d of namedDims) {
            const val = Model.num(d.v, baseV, 0);
            flds.append(UI.numField({
              id: `skel-proj-dim-${d.id}`,
              label: d.name,
              value: d.v != null ? d.v : val,
              unit: d.k === 'ang' || d.k === 'angLL' || d.k === 'ang3' ? '°' : 'mm',
              onCommit: (v) => setSkeletonDim(sk.id, d.id, v, { merge: `skel:${sk.id}:${d.id}` }),
            }));
          }
          card.append(flds);
        }
        sec.append(card);
      }
    }
    const addBtn = h('button', { type: 'button', class: 'btn small', id: ctx + '-add-skeleton' });
    addBtn.innerHTML = icon('sketch') + esc(T('skel.addBtn'));
    addBtn.onclick = (e) => startSkeleton({ choose: true, anchor: e.currentTarget });
    sec.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, addBtn));
    return sec;
  }
  function renderSkeletonPanel(body) {
    const sk = findSkeleton(selectedSkeletonId);
    if (!sk) return;
    const w = h('div', { class: 'props' });
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'skel-name' }, T('common.name')),
      h('div', { class: 'inp' }, h('input', { id: 'skel-name', value: sk.name, style: { fontFamily: 'var(--font)' } }))
    );
    nameF.querySelector('input').addEventListener('change', (e) => {
      const nv = e.target.value.trim();
      if (!nv) { e.target.value = sk.name; return; }
      renameSkeleton(sk.id, nv);
    });
    w.append(nameF);

    const edBtn = h('button', { type: 'button', class: 'btn primary', id: 'skel-edit-btn' });
    edBtn.innerHTML = icon('edit') + esc(T('skel.editBtn'));
    edBtn.onclick = () => editSkeleton(sk.id);
    const hdBtn = h('button', { type: 'button', class: 'btn', id: 'skel-hide-btn' });
    hdBtn.innerHTML = icon(sk.hidden ? 'eye' : 'eyeOff') + esc(T(sk.hidden ? 'common.show' : 'common.hide'));
    hdBtn.onclick = () => toggleSkeletonHidden(sk.id);
    const dlBtn = h('button', { type: 'button', class: 'btn danger', id: 'skel-del-btn' });
    dlBtn.innerHTML = icon('trash') + esc(T('common.delete'));
    dlBtn.onclick = () => removeSkeleton(sk.id);
    w.append(h('div', { class: 'btn-row' }, edBtn, hdBtn, dlBtn));

    const namedDims = (sk.dims || []).filter((d) => d && isValidSkelParamName(d.name));
    const dimSec = h('div', { class: 'section', id: 'skel-dims-list' },
      h('div', { class: 'section-h' }, T('skel.dimsTitle', { n: namedDims.length }))
    );
    if (!namedDims.length) {
      dimSec.append(h('div', { class: 'hint-box' }, T('skel.noDimsHint')));
    } else {
      const baseV = baseVarsWithoutSkeletons(App.doc, sk.id);
      const bindTargets = editableBindTargets(App.doc);
      let solvedEnts = sk.ents || [];
      if (typeof Solver !== 'undefined' && Solver.cached) {
        const res = Solver.cached({ ents: sk.ents || [], dims: sk.dims || [], cons: sk.cons || [] }, baseV);
        if (res && Array.isArray(res.ents)) solvedEnts = res.ents;
      }
      for (const d of namedDims) {
        const card = h('div', { class: 'skel-dim-card', dataset: { skelDimId: d.id, skelParamName: d.name } });
        const nmIn = h('input', {
          type: 'text',
          class: 'skel-dim-name',
          value: d.name,
          'aria-label': T('skel.dimNameLabel'),
          dataset: { skelParamName: d.name },
          spellcheck: 'false',
        });
        nmIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nmIn.blur(); if (e.key === 'Escape') { nmIn.value = d.name; nmIn.blur(); } });
        nmIn.addEventListener('change', () => {
          if (!renameSkeletonDim(sk.id, d.id, nmIn.value)) nmIn.value = d.name;
        });
        const unit = (d.k === 'ang' || d.k === 'angLL' || d.k === 'ang3') ? '°' : 'mm';
        const val = d.ref ? round(measureDimOnEnts(solvedEnts, d), 4) : (d.v != null ? d.v : round(measureDimOnEnts(solvedEnts, d), 4));
        const head = h('div', { class: 'skel-dim-head' },
          nmIn,
          d.ref ? h('span', { class: 'part-ref-badge frozen' }, T('skel.refTag')) : null
        );
        card.append(head);
        if (!d.ref) {
          card.append(UI.numField({
            id: `skel-dim-${d.id}`,
            label: T('common.value'),
            value: val,
            unit,
            onCommit: (v) => setSkeletonDim(sk.id, d.id, v, { merge: `skel:${sk.id}:${d.id}` }),
          }));
        } else {
          card.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('common.value')), h('b', { class: 'mono' }, `${fmt(val, 2)} ${unit}`)));
        }
        const drivenByDim = skeletonDrivenParts(sk.id, d.name);
        if (drivenByDim.length) {
          const chips = h('div', { class: 'skel-driven-chips' });
          for (const dp of drivenByDim) {
            const b = h('button', { type: 'button', class: 'btn small ghost', dataset: { skelDrivenItem: dp.itemId } }, dp.name);
            b.onclick = () => App.select([dp.itemId]);
            chips.append(b);
          }
          card.append(chips);
        }
        if (bindTargets.length) {
          const sel = h('select', { class: 'skel-bind-sel', 'aria-label': T('skel.bindTargetAria') });
          for (const bt of bindTargets) {
            sel.append(h('option', { value: `${bt.itemId}::${bt.propKey}` }, bt.label));
          }
          const bindBtn = h('button', { type: 'button', class: 'btn small', dataset: { skelBindDim: d.name } }, T('skel.bindBtn'));
          bindBtn.onclick = () => {
            const v = sel.value || '';
            const idx = v.indexOf('::');
            if (idx < 0) return;
            bindPartToSkeleton(v.slice(0, idx), v.slice(idx + 2), d.name);
          };
          card.append(h('div', { class: 'skel-bind-row' }, sel, bindBtn));
        }
        dimSec.append(card);
      }
    }
    w.append(dimSec);

    const allDriven = skeletonDrivenParts(sk.id);
    const drvSec = h('div', { class: 'section', id: 'skel-driven-list' },
      h('div', { class: 'section-h' }, T('skel.drivenTitle', { n: allDriven.length }))
    );
    if (!allDriven.length) {
      drvSec.append(h('div', { class: 'hint-box' }, T('skel.noDrivenHint')));
    } else {
      for (const dp of allDriven) {
        const row = h('div', { class: 'mini-row', dataset: { skelDrivenRow: dp.itemId } });
        const linkBtn = h('button', { type: 'button', class: 'part-ref-target lk' }, dp.name);
        linkBtn.onclick = () => App.select([dp.itemId]);
        row.append(linkBtn, h('span', { class: 'sub mono' }, dp.params.join(', ')));
        drvSec.append(row);
      }
    }
    w.append(drvSec);
    body.append(w);
  }

  return {
    init, newComponent, edit, toggleIso, render, resolveDoc, ensureRefs, availableParts,
    insertPart, insertSubAssembly: insertPart, insertPartDialog, openPart, openRef, docHasRef,
    canReplace, insertFromBlob, insertFromFile, replacePart, replacePartWithFile, replacePartDialog,
    canPatternPart, patternCopyName, cloneLinkedPart, syncLinkedPart,
    patternPart: (kind, ids, opts) => typeof Assembly !== 'undefined' && Assembly.createPattern ? Assembly.createPattern(kind, ids, opts) : null,
    mirrorPart: (ids, opts) => typeof Assembly !== 'undefined' && Assembly.mirrorPart ? Assembly.mirrorPart(ids, opts) : null,
    patternDialog: (kind, ids) => typeof Assembly !== 'undefined' && Assembly.patternDialog ? Assembly.patternDialog(kind, ids) : null,
    partRefs, allPartRefs, freezeRef, unfreezeRef, toggleFreezeRef, breakRef, freezeAllRefs, unfreezeAllRefs, breakAllRefs,
    refsSection, refsDialog,
    get selectedSkeleton() { return selectedSkeletonId; },
    skeletons, findSkeleton, defaultSkeletonName, nextSkeletonDimName, isValidSkelParamName,
    syncSkeletons, startSkeleton, editSkeleton, createSkeleton, saveSkeletonSketch,
    setSkeletonDim, renameSkeletonDim, renameSkeleton, toggleSkeletonHidden, removeSkeleton,
    editableBindTargets, bindPartToSkeleton, skeletonDrivenParts, selectSkeleton,
    skeletonTreeSection, skeletonSection, renderSkeletonPanel,
  };
})();

