// ================= Platzieren aus der Leiste (Ziehen & Ablegen) =================
const Place = (() => {
  let st = null; // { spec, preview, onFace, pos }
  let magnetOff = false;
  function specBox(spec) {
    if (spec.kind) return Model.primitiveBox(spec.kind, spec.p ? { ...Model.newItem(spec.kind).p, ...spec.p } : Model.newItem(spec.kind).p) || [-10, -10, 0, 10, 10, 20];
    const d = spec.part; const p = spec.params || libDefaults(d);
    if (d.lib === 'holePattern') return [-17, -17, -(p.depth || 10), 17, 17, 0.2];
    if (d.lib === 'zipTie') return [-5, -2, -(p.depth || 10), 5, 2, 0.2];
    if (d.lib === 'screwHole') return [-3.5, -3.5, -(p.length || 10), 3.5, 3.5, 0.2];
    if (d.lib === 'nutTrap') return [-3.5, -3.5, -12, 3.5, 3.5, 0.2];
    if (d.lib === 'insert') return [-2, -2, -7.7, 2, 2, 0.2];
    if (d.lib === 'threadHole') return [-3.5, -3.5, -(p.length || 10), 3.5, 3.5, 0.2];
    if (d.lib === 'threadRod') return [-3, -3, 0, 3, 3, p.length || 12];
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
        magnetOff = ev.ctrlKey || ev.metaKey;
        if (st) track(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt);
        if (st) { finish(ev.clientX, ev.clientY); return; }
        // einfacher Klick: in die Mitte setzen
        Panels.closeFlyout();
        if (spec.buy) Actions.addBuyPart(spec);
        else if (spec.kind) Actions.addPrimitive(spec.kind);
        else Actions.addPart(spec.part, spec.params || libDefaults(spec.part), { name: spec.name });
        setTimeout(() => { const id = App.sel[0]; const b = id && Actions.worldBox(id); if (b && !Viewer.inView(b)) Viewer.fit(App.doc.items.map((x) => x.id)); }, 400);
      };
      const cancelIt = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt); cancel(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelIt);
    });
  }
  // Vorschau in echter Form: das Teil wird einmal im Kern gerechnet (als Zusatz-Element „__dragprev“) und dann nur noch verschoben.
  // Löcher bleiben beim Kasten – sie würden sonst schon beim Ziehen in Körper schneiden.
  const DP = '__dragprev';
  function previewItem(spec) {
    if (spec.buy) return Model.newItem(spec.kind, { ...Model.newItem(spec.kind).p, ...spec.p }, { name: spec.name, color: spec.color });
    if (spec.kind) return Model.newItem(spec.kind, spec.p || {});
    if (spec.part && spec.part.role !== 'hole') return Model.newItem('part', { lib: spec.part.lib, ...(spec.params || libDefaults(spec.part)) }, { role: spec.part.role });
    return null;
  }
  function showReal() {
    if (!st || !st.real) return;
    const has = Viewer.nodes.has(DP);
    for (const c of st.preview.children) c.visible = !has;   // Kasten nur, bis die echte Form da ist
    if (has) Viewer.updateNode(DP, { matrix: st.preview.matrix, visible: st.preview.visible, hover: true });
  }
  function begin(spec) {
    Views.collapse();
    st = { spec, preview: makePreview(spec), onFace: null, pos: null };
    const tmp = previewItem(spec);
    if (tmp) { tmp.id = DP; App.extra = [...App.extra.filter((x) => x.id !== DP), tmp]; App.rebuild(); st.real = true; st.offRes = App.on('results', showReal); }
    Panels.closeFlyout();
    Panels.renderCtx();
    UI.hint('Loslassen, um es abzulegen. Auf einem Körper wird es <b>Teil dieses Körpers</b>.');
    document.body.style.cursor = 'copy';
  }
  function inCanvas(x, y) { const r = Viewer.canvas.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function track(x, y) {
    if (!inCanvas(x, y)) { st.preview.visible = false; showReal(); Viewer.requestRender(); return; }
    st.preview.visible = true;
    const hit = Viewer.pick(x, y, { noEdges: true, solidsOnly: true, exclude: new Set([DP]) });
    if (hit && hit.normal) {
      const top = App.doc.items.find((it) => it.id === hit.id);
      if (top) {
        const sn = magnetOff ? (Snap.clear(), null) : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
        st.onFace = Actions.onFaceTransform(hit.id, (sn ? sn.point : hit.point).toArray(), ((sn && sn.normal) || hit.normal).toArray(), { exact: !!sn });
        const L = Model.localMatrix({ t: st.onFace.t });
        st.preview.matrix.copy(Model.worldMatrix(App.doc, hit.id).multiply(L));
        st.pos = null; Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        showReal(); Viewer.requestRender(); return;
      }
    }
    Viewer.highlightFace('hover', null, null); Snap.clear();
    st.onFace = null;
    const p = Viewer.pickPlane(x, y, 0);
    if (p) {
      const g = App.doc.settings.snap === false ? 0.1 : App.doc.settings.grid || 1;
      st.pos = [round(Math.round(p.x / g) * g, 4), round(Math.round(p.y / g) * g, 4)];
      const hz = st.spec.part && st.spec.part.role === 'hole' ? 10 : 0;
      st.preview.matrix.makeTranslation(st.pos[0], st.pos[1], hz);
    }
    showReal(); Viewer.requestRender();
  }
  function finish(x, y) {
    const s = st; cleanup();
    if (!inCanvas(x, y) || (!s.onFace && !s.pos)) return;
    if (s.spec.buy) { Actions.addBuyPart(s.spec, s.onFace ? { onFace: s.onFace } : { pos: s.pos }); return; }
    if (s.spec.kind) Actions.addPrimitive(s.spec.kind, s.onFace ? { onFace: s.onFace } : { pos: s.pos });
    else Actions.addPart(s.spec.part, s.spec.params || libDefaults(s.spec.part), { ...(s.onFace ? { onFace: s.onFace } : { pos: s.pos }), name: s.spec.name });
    if (s.onFace) UI.toast('Abgelegt – es ist jetzt Teil des Körpers darunter.', { icon: 'check' });
  }
  function cancel() { cleanup(); stopHoles(); }
  function cleanup() {
    if (!st) return;
    if (st.offRes) st.offRes();
    if (st.real) { App.extra = App.extra.filter((x) => x.id !== DP); Viewer.removeNode(DP); App.rebuild(); }
    Viewer.groups.overlay.remove(st.preview); st.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    st = null; Snap.clear(); document.body.style.cursor = ''; UI.hint(null); Viewer.highlightFace('hover', null, null); Viewer.requestRender();
  }
  // ---------- Bohrungs-Assistent: Art, Größe, Tiefe wählen, dann Löcher per Klick setzen ----------
  const HOLE_TYPES = [['through', 'Durchgangsloch für Schraube'], ['tap', 'Gewinde schneiden (Kernloch)'], ['insert', 'Gewindeeinsatz'], ['nut', 'Mutternfalle']];
  let lastHole = { type: 'through', size: 'M3', head: 'countersunk', fit: 'medium', depth: 10, thru: true };
  let hw = null;   // laufender Setz-Modus
  function holeHere(face, anchor, at) {
    if (face) Snap.prime(face.id, face.idx);   // Flächendaten schon holen, damit das erste Loch einrastet
    const o = { ...lastHole };
    const box = h('div', { class: 'holewiz', style: { display: 'grid', gap: '10px', minWidth: '260px' } });
    box.append(h('b', null, at ? `Bohrungen an ${at.pts.length} ${at.pts.length === 1 ? 'Punkt' : 'Punkten'}` : 'Bohrungs-Assistent'));
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    const draw = () => {
      body.innerHTML = '';
      body.append(UI.selectField({ id: 'hw-type', label: 'Art', value: o.type, options: HOLE_TYPES, onChange: (v) => { o.type = v; draw(); } }));
      const sizes = o.type === 'insert' ? SIZES.filter((x) => x !== 'M1.6') : SIZES;
      if (!sizes.includes(o.size)) o.size = 'M3';
      body.append(UI.selectField({ id: 'hw-size', label: o.type === 'nut' ? 'Mutter' : o.type === 'insert' ? 'Gewinde' : 'Schraube', value: o.size, options: sizes, onChange: (v) => { o.size = v; } }));
      if (o.type === 'through') {
        const f = h('div', { class: 'fields' });
        f.append(UI.selectField({ id: 'hw-head', label: 'Kopf', value: o.head, options: LIBMAP.screwHole.params[1].options, onChange: (v) => { o.head = v; } }));
        f.append(UI.selectField({ id: 'hw-fit', label: 'Loch', value: o.fit, options: [['medium', 'Mittel'], ['fine', 'Eng'], ['coarse', 'Weit']], onChange: (v) => { o.fit = v; } }));
        body.append(f);
      }
      const thru = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hw-thru', checked: !!o.thru }), o.type === 'insert' ? 'So tief wie der Körper' : 'Ganz durch den Körper');
      thru.querySelector('input').onchange = (e) => { o.thru = e.target.checked; draw(); };
      body.append(thru);
      if (!o.thru) body.append(UI.numField({ id: 'hw-depth', label: 'Tiefe', value: o.depth, onCommit: (v) => { o.depth = v; } }));
    };
    draw(); box.append(body);
    const go = h('button', { type: 'button', class: 'btn primary', id: 'hw-go' }); go.innerHTML = icon('check') + 'Löcher setzen';
    go.onclick = () => {
      UI.closePop(); lastHole = { ...o };
      startHoles(o);
      // aus Skizzenpunkten: alle Löcher genau an den Punkten setzen, dann fertig
      if (at) { for (const p of at.pts) placeAt(at.id, p, at.normal, true); stopHoles(); return; }
      // aus einer gewählten Fläche: das erste Loch gleich dort setzen
      if (face && face.point && face.normal) { const pt = new THREE.Vector3(...face.point), nn = new THREE.Vector3(...face.normal), sn = Snap.onFace(face.id, face.idx, pt, { normal: nn }); Snap.clear(); placeAt(face.id, sn ? sn.point : pt, (sn && sn.normal) || nn, !!sn); }
    };
    box.append(go);
    UI.pop(anchor || $('#t-parts'), box);
  }
  // Dicke des Körpers entlang der Bohrrichtung
  function thicknessAlong(id, n) {
    const b = Actions.worldBox(id); if (!b || b.isEmpty()) return 20;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 8; i++) { const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z); const d = p.dot(n); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    return round(hi - lo + 0.5, 1);
  }
  function specFor(o, thick) {
    const depth = o.thru ? thick : o.depth;
    if (o.type === 'insert') return [LIBMAP.insert, { size: o.size, depth: o.thru ? thick : depth }];
    if (o.type === 'nut') return [LIBMAP.nutTrap, { size: o.size, depth: null, length: depth }];
    if (o.type === 'tap') return [LIBMAP.screwHole, { size: o.size, head: 'none', fit: 'tap', length: depth }];
    return [LIBMAP.screwHole, { size: o.size, head: o.head, fit: o.fit, length: depth }];
  }
  function placeAt(id, point, normal, exact) {
    if (!hw) return;
    const [def, params] = specFor(hw.o, thicknessAlong(id, normal));
    const onFace = Actions.onFaceTransform(id, point.toArray(), normal.toArray(), { exact });
    Actions.addPart(def, params, { onFace });
    App.clearSelection(); Handles.clear();
    hw.count++; holeBar();
  }
  function holeBar() {
    if (hw.bar) hw.bar.remove();
    const bar = h('div', { class: 'sketchbar holebar', role: 'toolbar', 'aria-label': 'Bohrungen' });
    const name = { through: 'Durchgang', tap: 'Kernloch', insert: 'Einsatz', nut: 'Mutternfalle' }[hw.o.type];
    bar.append(h('span', { class: 'title' }, 'Bohrungen'), h('span', { class: 'lbl', style: { padding: '0 8px', fontSize: '13px' } }, `${hw.o.size} · ${name} · ${hw.count} gesetzt`));
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-kbd': 'Esc' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = () => stopHoles();
    bar.append(ok); $('#overlay').append(bar); hw.bar = bar;
  }
  function ringObj(o) {
    const r = (parseFloat(String(o.size).slice(1)) || 3) * (o.type === 'through' && o.head !== 'none' ? 1.1 : 0.6);
    const pts = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0)); }
    pts.push(new THREE.Vector3(-r * 1.4, 0, 0), new THREE.Vector3(r * 1.4, 0, 0));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(Viewer.theme.hole), depthTest: false, transparent: true }));
    l.renderOrder = 30; l.matrixAutoUpdate = false; l.visible = false;
    Viewer.groups.overlay.add(l); return l;
  }
  function startHoles(o) {
    Views.collapse();
    stopHoles(true);
    hw = { o, count: 0, ring: ringObj(o), down: null };
    App.clearSelection(); Handles.clear(); Panels.renderCtx();
    Viewer.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    Viewer.canvas.style.cursor = 'crosshair';
    UI.hint('<b>Löcher setzen:</b> Jeder Klick auf eine Fläche setzt ein Loch. Ansicht drehen: <b>rechte Maustaste</b>. <b>Esc</b> beendet.');
    const cv = Viewer.canvas;
    hw.onDown = (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); hw.down = { x: e.clientX, y: e.clientY }; };
    hw.onUp = (e) => {
      if (!hw || !hw.down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - hw.down.x, e.clientY - hw.down.y) > 5; hw.down = null;
      if (moved) return;
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      if (!hit || !hit.normal) { UI.toast('Klick auf eine Fläche eines Körpers.', { icon: 'info', ms: 1600 }); return; }
      const sn = e.ctrlKey || e.metaKey ? null : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
      placeAt(hit.id, sn ? sn.point : hit.point, (sn && sn.normal) || hit.normal, !!sn);
    };
    hw.onMove = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      if (!hit || !hit.normal) { hw.ring.visible = false; Snap.clear(); Viewer.requestRender(); return; }
      const sn = e.ctrlKey || e.metaKey ? (Snap.clear(), null) : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
      const nn = (sn && sn.normal) || hit.normal, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn);
      hw.ring.matrix.compose((sn ? sn.point : hit.point).clone().addScaledVector(nn, 0.05), q, new THREE.Vector3(1, 1, 1));
      hw.ring.matrixWorldNeedsUpdate = true; hw.ring.visible = true; Viewer.requestRender();
    };
    cv.addEventListener('pointerdown', hw.onDown, true);
    window.addEventListener('pointerup', hw.onUp);
    cv.addEventListener('pointermove', hw.onMove);
    holeBar();
  }
  function stopHoles(silent) {
    if (!hw) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', hw.onDown, true); window.removeEventListener('pointerup', hw.onUp); cv.removeEventListener('pointermove', hw.onMove);
    Viewer.groups.overlay.remove(hw.ring); hw.ring.geometry.dispose(); hw.ring.material.dispose(); Snap.clear();
    if (hw.bar) hw.bar.remove();
    const n = hw.count; hw = null;
    Viewer.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    Viewer.canvas.style.cursor = ''; UI.hint(null); Viewer.requestRender(); Handles.rebuild(); Panels.renderCtx();
    if (!silent && n) UI.toast(`${n} ${n === 1 ? 'Loch' : 'Löcher'} gesetzt. Ziehen verschiebt ein Loch auf der Fläche.`, { icon: 'check' });
  }
  // Bohrungen an Punkten einer Skizze auf einer Körperfläche (Punkte in Weltlage, n = Flächennormale nach außen)
  function holesAtPoints(id, pts, n) { holeHere(null, $('#t-parts'), { id, pts, normal: n }); }
  return { bindTile, holeHere, holesAtPoints, holeWizard: (anchor) => holeHere(Actions.selectedFace(), anchor), stopHoles, cancel, get active() { return !!st || !!hw; }, get holes() { return !!hw; } };
})();

