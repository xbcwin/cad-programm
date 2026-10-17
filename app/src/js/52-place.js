// ================= Platzieren aus der Leiste (Ziehen & Ablegen) =================
const Place = (() => {
  let st = null; // { spec, preview, onFace, pos }
  function specBox(spec) {
    if (spec.kind) return Model.primitiveBox(spec.kind, Model.newItem(spec.kind).p) || [-10, -10, 0, 10, 10, 20];
    const d = spec.part; const p = libDefaults(d);
    if (d.lib === 'screwHole') return [-3.5, -3.5, -(p.length || 10), 3.5, 3.5, 0.2];
    if (d.lib === 'nutTrap') return [-3.5, -3.5, -12, 3.5, 3.5, 0.2];
    if (d.lib === 'insert') return [-2, -2, -7.7, 2, 2, 0.2];
    if (d.lib === 'slotHole') return [-10, -2.3, -10, 10, 2.3, 0.2];
    if (d.lib === 'snapHook') return [0, -4, 0, 2.8, 4, 12];
    if (d.lib === 'hinge') return [-20, -17.5, 0, 20, 17.5, 5.3];
    if (d.lib === 'gear') return [-16.5, -16.5, 0, 16.5, 16.5, 6];
    return [-10, -10, 0, 10, 10, 10];
  }
  function makePreview(spec) {
    const b = specBox(spec);
    const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    const hole = spec.part ? spec.part.role === 'hole' : false;
    const col = new THREE.Color(hole ? Viewer.theme.hole : Viewer.theme.accent);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
    const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false; obj.renderOrder = 8;
    Viewer.groups.overlay.add(obj);
    return obj;
  }
  function bindTile(el, spec) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const down = { x: e.clientX, y: e.clientY };
      // Bewegungen am Fenster verfolgen: das Menü schließt sich beim Ziehen
      const move = (ev) => {
        if (!st && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) begin(spec);
        if (st) track(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt);
        if (st) { finish(ev.clientX, ev.clientY); return; }
        // einfacher Klick: in die Mitte setzen
        Panels.closeFlyout();
        if (spec.kind) Actions.addPrimitive(spec.kind);
        else Actions.addPart(spec.part, libDefaults(spec.part));
        setTimeout(() => { const id = App.sel[0]; const b = id && Actions.worldBox(id); if (b && !Viewer.inView(b)) Viewer.fit(App.doc.items.map((x) => x.id)); }, 400);
      };
      const cancelIt = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt); cancel(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelIt);
    });
  }
  function begin(spec) {
    st = { spec, preview: makePreview(spec), onFace: null, pos: null };
    Panels.closeFlyout();
    Panels.renderCtx();
    UI.hint('Loslassen, um es abzulegen. Auf einem Körper wird es <b>Teil dieses Körpers</b>.');
    document.body.style.cursor = 'copy';
  }
  function inCanvas(x, y) { const r = Viewer.canvas.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function track(x, y) {
    if (!inCanvas(x, y)) { st.preview.visible = false; Viewer.requestRender(); return; }
    st.preview.visible = true;
    const hit = Viewer.pick(x, y, { noEdges: true, solidsOnly: true });
    if (hit && hit.normal) {
      const top = App.doc.items.find((it) => it.id === hit.id);
      if (top) {
        st.onFace = Actions.onFaceTransform(hit.id, hit.point.toArray(), hit.normal.toArray());
        const L = Model.localMatrix({ t: st.onFace.t });
        st.preview.matrix.copy(Model.worldMatrix(App.doc, hit.id).multiply(L));
        st.pos = null; Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        Viewer.requestRender(); return;
      }
    }
    Viewer.highlightFace('hover', null, null);
    st.onFace = null;
    const p = Viewer.pickPlane(x, y, 0);
    if (p) {
      const g = App.doc.settings.snap === false ? 0.1 : App.doc.settings.grid || 1;
      st.pos = [round(Math.round(p.x / g) * g, 4), round(Math.round(p.y / g) * g, 4)];
      const hz = st.spec.part && st.spec.part.role === 'hole' ? 10 : 0;
      st.preview.matrix.makeTranslation(st.pos[0], st.pos[1], hz);
    }
    Viewer.requestRender();
  }
  function finish(x, y) {
    const s = st; cleanup();
    if (!inCanvas(x, y) || (!s.onFace && !s.pos)) return;
    if (s.spec.kind) Actions.addPrimitive(s.spec.kind, s.onFace ? { onFace: s.onFace } : { pos: s.pos });
    else Actions.addPart(s.spec.part, libDefaults(s.spec.part), s.onFace ? { onFace: s.onFace } : { pos: s.pos });
    if (s.onFace) UI.toast('Abgelegt – es ist jetzt Teil des Körpers darunter.', { icon: 'check' });
  }
  function cancel() { cleanup(); }
  function cleanup() {
    if (!st) return;
    Viewer.groups.overlay.remove(st.preview); st.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    st = null; document.body.style.cursor = ''; UI.hint(null); Viewer.highlightFace('hover', null, null); Viewer.requestRender();
  }
  // „Loch hier“ auf einer gewählten Fläche
  function holeHere(face, anchor) {
    const def = LIBMAP.screwHole;
    const p = libDefaults(def);
    const box = h('div', { style: { display: 'grid', gap: '10px' } });
    box.append(h('b', null, 'Schraubenloch setzen'));
    const f = h('div', { class: 'fields' });
    let size = p.size, head = p.head, length = p.length;
    f.append(UI.selectField({ id: 'hh-size', label: 'Schraube', value: size, options: SIZES, onChange: (v) => { size = v; } }));
    f.append(UI.selectField({ id: 'hh-head', label: 'Kopf', value: head, options: def.params[1].options, onChange: (v) => { head = v; } }));
    box.append(f);
    box.append(UI.numField({ id: 'hh-len', label: 'Tiefe', value: length, expr: true, onCommit: (v) => { length = v; } }));
    const go = h('button', { type: 'button', class: 'btn primary' }); go.innerHTML = icon('check') + 'Loch setzen';
    box.append(go);
    const pt = face.point || face.info.c; const n = face.normal;
    go.onclick = () => {
      UI.closePop();
      const W = Model.worldMatrix(App.doc, face.id);
      const wp = face.point ? face.point : new THREE.Vector3(...face.info.c).applyMatrix4(W).toArray();
      const wn = face.normal ? face.normal : new THREE.Vector3(...face.info.n).transformDirection(W).toArray();
      const onFace = Actions.onFaceTransform(face.id, wp, wn);
      Actions.addPart(def, { size, head, length }, { onFace });
      UI.toast('Loch gesetzt. Ziehen verschiebt es auf der Fläche.', { icon: 'check' });
    };
    UI.pop(anchor, box);
  }
  return { bindTile, holeHere, cancel, get active() { return !!st; } };
})();

