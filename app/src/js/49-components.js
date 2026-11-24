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
        if (r.docType === 'assembly') continue;
        if (!(r.n > 0)) continue;
        byId.set(r.id, { id: r.id, name: r.name || 'Bauteil', n: r.n, modified: r.modified || 0, open: false });
      }
    }
    if (typeof App !== 'undefined' && Array.isArray(App.tabs)) {
      for (const t of App.tabs) {
        if (!t || !t.docId || t.docId === excludeDocId) continue;
        const d = App.findOpenDoc ? App.findOpenDoc(t.docId) : null;
        if (!d || Model.isAssembly(d)) continue;
        const n = Model.countItems(d);
        if (n <= 0 && !(typeof Store !== 'undefined' && Store.hasProject && Store.hasProject(d.id))) continue;
        byId.set(d.id, { id: d.id, name: d.name || 'Bauteil', n, modified: d.modified || Date.now(), open: true });
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
    if (Model.isAssembly(refDoc)) {
      UI.toast(T('asm.noNestedAsmYet'), { icon: 'info', ms: 4500 });
      return null;
    }
    if (typeof Store !== 'undefined' && Store.saveProject && Store.hasProject && !Store.hasProject(refDoc.id)) {
      await Store.saveProject(refDoc, Model.countItems(refDoc), { keepLast: true });
    }
    const firstSolid = (refDoc.items || []).find((x) => x && x.role !== 'hole' && !x.hidden);
    const col = opts.color || (firstSolid && firstSolid.color) || undefined;
    const spot = opts.pos || freeSpotFor(refDoc);
    const it = Model.newItem('ref', { docId: refDoc.id, docName: refDoc.name || 'Bauteil' }, {
      name: opts.name || refDoc.name || 'Bauteil',
      color: col,
    });
    if (opts.t) Object.assign(it.t, opts.t);
    else { it.t.x = spot[0]; it.t.y = spot[1]; it.t.z = opts.z || 0; }
    if (!App.doc.items.length) App.fitAfterBuild();
    App.change(T('asm.insertedUndo', { name: Model.label(it) }), (doc) => { doc.items.push(it); });
    App.select([it.id]);
    UI.toast(T('asm.insertedToast', { name: Model.label(it) }), { icon: 'check', ms: 3200 });
    return it;
  }
  function insertPartDialog() {
    const parts = availableParts();
    const wrap = h('div', { id: 'asm-insert-dialog', class: 'asm-insert-dlg' });
    let modalRef = null;
    if (!parts.length) {
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
      const list = h('div', { class: 'recent asm-part-list' });
      for (const p of parts) {
        const row = h('div', { class: 'recent-row asm-part-row', role: 'button', tabindex: '0', dataset: { docId: p.id } });
        const ic = h('span', { class: 'asm-part-ic', 'aria-hidden': 'true' }); ic.innerHTML = icon('box3');
        const meta = T(p.n === 1 ? 'start.recentMetaOne' : 'start.recentMetaMany', { n: p.n, date: p.modified ? new Date(p.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '' });
        const info = h('div', { class: 'grow' }, h('b', null, p.name), h('span', null, meta));
        row.append(ic, info);
        if (p.open) row.append(h('span', { class: 'doc-type-badge open' }, T('asm.openInTab')));
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
  function render() {
    if (banner) { banner.remove(); banner = null; }
    if (App.mode !== 'model') return;
    const ctx = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
    const iso = App.iso ? App.doc.items.find((x) => x.id === App.iso) : null;
    if (!ctx && !iso) return;
    banner = h('div', { class: 'ctx-banner' + (ctx ? '' : ' iso'), role: 'status' });
    const ic = h('span'); ic.innerHTML = icon(ctx ? 'edit' : 'focusView');
    banner.append(ic, h('span', null, ctx ? `Bauteil bearbeiten: ${Model.label(ctx)}` : `Isoliert: ${Model.label(iso)}`));
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
  return { init, newComponent, edit, toggleIso, render, resolveDoc, ensureRefs, availableParts, insertPart, insertPartDialog, openPart, openRef, docHasRef };
})();

