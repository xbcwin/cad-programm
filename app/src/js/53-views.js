// ================= Ansichten: Schnitt, Röntgen, Explosion, Fokus-Vorschau =================
// Alles hier ändert nur, wie das Modell gezeigt wird – nie das Modell selbst. Nichts davon landet
// in der Zeitleiste oder in der Projektdatei.
const Views = (() => {
  const st = { cut: null, xray: false, ex: 0, exGoal: 0, exAnim: null, focus: null, ov: null };
  let wrap = null;   // Leisten links oben
  function bars() {
    if (!wrap || !wrap.isConnected) { wrap = h('div', { class: 'viewbars' }); $('#overlay').append(wrap); }
    return wrap;
  }
  const AX = { XY: 2, XZ: 1, YZ: 0 };
  const AXNAME = { XY: 'Z', XZ: 'Y', YZ: 'X' };
  // Standard: der Teil zur Kamera hin (oben / vorne / rechts) wird weggeschnitten
  const KEEP = { XY: -1, XZ: 1, YZ: -1 };
  function modelBox() {
    let b = new THREE.Box3();
    for (const id of Viewer.nodes.keys()) { const x = Viewer.baseBox(id); if (x) b.union(x); }
    if (b.isEmpty()) b = new THREE.Box3(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 20));
    return b;
  }

  // ---------- Schnitt ----------
  function cutPlane() {
    const c = st.cut;
    if (c.plane === 'FACE') { const n = c.fn.clone().multiplyScalar(c.flip ? 1 : -1); const q = c.fp.clone().addScaledVector(c.fn, c.off); return { n, k: -n.dot(q), q }; }
    const n = new THREE.Vector3(); n.setComponent(AX[c.plane], KEEP[c.plane] * (c.flip ? -1 : 1));
    return { n, k: -n.getComponent(AX[c.plane]) * c.off };
  }
  function applyCut() {
    const c = st.cut;
    if (!c) { Viewer.setClip(null); return; }
    const { n, k } = cutPlane();
    if (!c.obj) { c.obj = new THREE.Plane(n, k); Viewer.setClip(c.obj); } else { c.obj.normal.copy(n); c.obj.constant = k; Viewer.requestRender(); }
    drawCutHelper();
  }
  function drawCutHelper() {
    const c = st.cut; const g = Viewer.groups.overlay;
    if (c.helper) { g.remove(c.helper); c.helper.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); c.helper = null; }
    const b = modelBox(); const pad = Math.max(4, b.getSize(new THREE.Vector3()).length() * 0.08);
    if (c.plane === 'FACE') {
      const { q } = cutPlane(); const n = c.fn; const R = b.getSize(new THREE.Vector3()).length() / 2 + pad;
      const u = new THREE.Vector3(Math.abs(n.z) > 0.9 ? 1 : 0, 0, Math.abs(n.z) > 0.9 ? 0 : 1).cross(n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, bb]) => q.clone().addScaledVector(u, a * R).addScaledVector(v, bb * R));
      const col = new THREE.Color(Viewer.theme.accent);
      const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
      const grp = new THREE.Group(); grp.add(fill, line); fill.renderOrder = 20; line.renderOrder = 21;
      g.add(grp); c.helper = grp; Viewer.requestRender(); return;
    }
    const ax = AX[c.plane]; const u = [0, 1, 2].filter((i) => i !== ax);
    const lo = b.min.clone().subScalar(pad), hi = b.max.clone().addScalar(pad);
    const P = (a, bb) => { const v = new THREE.Vector3(); v.setComponent(ax, c.off); v.setComponent(u[0], a); v.setComponent(u[1], bb); return v; };
    const corners = [P(lo.getComponent(u[0]), lo.getComponent(u[1])), P(hi.getComponent(u[0]), lo.getComponent(u[1])), P(hi.getComponent(u[0]), hi.getComponent(u[1])), P(lo.getComponent(u[0]), hi.getComponent(u[1]))];
    const col = new THREE.Color(Viewer.theme.accent);
    const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
    const grp = new THREE.Group(); grp.add(fill, line); grp.renderOrder = 20; fill.renderOrder = 20; line.renderOrder = 21;
    g.add(grp); c.helper = grp; Viewer.requestRender();
  }
  function section(on = !st.cut, opts = {}) {
    if (!on) {
      if (!st.cut) return;
      if (st.cut.helper) { Viewer.groups.overlay.remove(st.cut.helper); st.cut.helper.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
      if (st.cut.bar) st.cut.bar.remove();
      st.cut = null; applyCut(); sync(); return;
    }
    if (opts.face) {
      const f = opts.face, W = Model.worldMatrix(App.doc, f.id);
      const fn = new THREE.Vector3(...f.info.n).transformDirection(W).normalize(), fp = new THREE.Vector3(...f.info.c).applyMatrix4(W);
      if (st.cut && st.cut.bar) st.cut.bar.remove();
      if (st.cut && st.cut.helper) { Viewer.groups.overlay.remove(st.cut.helper); st.cut.helper.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
      st.cut = { plane: 'FACE', fn, fp, off: opts.off != null ? opts.off : -1, flip: false, obj: st.cut && st.cut.obj };
      applyCut(); cutBar(); sync(); return;
    }
    const plane = opts.plane && opts.plane !== 'FACE' ? opts.plane : st.cut && st.cut.plane !== 'FACE' ? st.cut.plane : 'XZ';
    const b = modelBox(); const ax = AX[plane];
    const off = opts.off != null ? opts.off : round((b.min.getComponent(ax) + b.max.getComponent(ax)) / 2, 2);
    if (st.cut && st.cut.bar) st.cut.bar.remove();
    if (st.cut && st.cut.helper) { Viewer.groups.overlay.remove(st.cut.helper); st.cut.helper.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
    st.cut = { plane, off, flip: !!opts.flip, obj: st.cut && st.cut.obj };
    applyCut(); cutBar(); sync();
  }
  function cutBar() {
    const c = st.cut; if (c.bar) c.bar.remove();
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Schnitt' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Schnitt'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Schnitt beenden', 'data-tip': 'Schnitt beenden (C)' }); close.innerHTML = icon('close'); close.onclick = () => section(false);
    head.append(close);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Schnittebene' });
    for (const [k, l, tip] of [['XZ', 'Von vorne', 'Senkrecht, von vorne nach hinten (XZ)'], ['YZ', 'Von der Seite', 'Senkrecht, von links nach rechts (YZ)'], ['XY', 'Waagerecht', 'Waagerecht (XY)']]) {
      const x = h('button', { type: 'button', 'aria-pressed': c.plane === k ? 'true' : 'false', 'data-plane': k, 'data-tip': tip }, l);
      x.onclick = () => section(true, { plane: k, flip: false });
      seg.append(x);
    }
    const b = modelBox(); const ax = AX[c.plane];
    const span = Math.ceil(b.getSize(new THREE.Vector3()).length());
    const lo = c.plane === 'FACE' ? -span : Math.floor(b.min.getComponent(ax) - 1), hi = c.plane === 'FACE' ? span : Math.ceil(b.max.getComponent(ax) + 1);
    const range = h('input', { type: 'range', id: 'cut-range', min: lo, max: hi, step: 0.1, value: c.off, 'aria-label': 'Lage der Schnittebene' });
    const num = h('input', { type: 'text', id: 'cut-off', class: 'vb-num', inputmode: 'decimal', value: fmt(c.off, 2), 'aria-label': 'Lage in mm' });
    const set = (v) => { if (!isFinite(v)) return; c.off = v; applyCut(); range.value = v; if (document.activeElement !== num) num.value = fmt(v, 2); };
    range.oninput = () => set(+range.value);
    num.onkeydown = (e) => { if (e.key === 'Enter') { const v = parseNum(num.value); if (v != null) set(v); num.blur(); } e.stopPropagation(); };
    num.onchange = () => { const v = parseNum(num.value); if (v != null) set(v); };
    const flip = h('button', { type: 'button', class: 'btn small', id: 'cut-flip', 'data-tip': 'Die andere Hälfte zeigen' }); flip.innerHTML = icon('mirror') + 'Umdrehen';
    flip.onclick = () => { c.flip = !c.flip; applyCut(); };
    if (c.plane === 'FACE') seg.append(h('button', { type: 'button', 'aria-pressed': 'true', 'data-plane': 'FACE', 'data-tip': 'Parallel zur gewählten Fläche' }, 'An Fläche'));
    const row = h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, c.plane === 'FACE' ? '↕' : AXNAME[c.plane]), range, num, h('span', { class: 'vb-u' }, 'mm'));
    bar.append(head, seg, row, h('div', { class: 'vb-row' }, flip, h('span', { class: 'vb-hint' }, 'Schraffiert = Schnittfläche')));
    bars().prepend(bar); c.bar = bar;
  }
  function parseNum(s) { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; }

  // ---------- Röntgen ----------
  function xray(on = !st.xray) {
    st.xray = !!on; Viewer.setXray(st.xray); sync();
    if (st.xray) UI.toast('Röntgen an: Körper werden durchsichtig. Ein zweiter Klick wählt das Teil dahinter.', { icon: 'info', ms: 3200 });
  }

  // ---------- Explosion ----------
  // Teile rücken waagerecht von der Mitte weg. Übereinanderliegende Schichten (gleiche Unterkante)
  // werden nach oben auseinandergezogen, jede um die Höhe der Schichten darunter – wie in einer Bauanleitung.
  function offsets(f) {
    const ids = [...Viewer.nodes.keys()].filter((id) => { const it = App.doc.items.find((x) => x.id === id); return it && !it.hidden && it.role !== 'hole'; });
    const boxes = ids.map((id) => [id, Viewer.baseBox(id)]).filter((x) => x[1]);
    const all = new THREE.Box3(); for (const [, b] of boxes) all.union(b);
    const C = all.getCenter(new THREE.Vector3()); const S = Math.max(10, all.getSize(new THREE.Vector3()).length());
    // Schichten nach Unterkante
    const sorted = boxes.slice().sort((a, b) => a[1].min.z - b[1].min.z);
    const layerOf = new Map(); const layers = [];
    for (const [id, b] of sorted) {
      let L = layers[layers.length - 1];
      if (!L || b.min.z - L.z > 0.5) { L = { z: b.min.z, h: 0 }; layers.push(L); }
      L.h = Math.max(L.h, b.max.z - b.min.z); layerOf.set(id, layers.length - 1);
    }
    const lift = [0]; for (let i = 1; i < layers.length; i++) lift[i] = lift[i - 1] + layers[i - 1].h + S * 0.08;
    const map = new Map();
    for (const [id, b] of boxes) {
      const c = b.getCenter(new THREE.Vector3());
      map.set(id, new THREE.Vector3((c.x - C.x) * f * 1.2, (c.y - C.y) * f * 1.2, lift[layerOf.get(id)] * f));
    }
    // Löcher der obersten Ebene wandern mit dem Teil, das sie schneiden
    for (const id of Viewer.nodes.keys()) {
      if (map.has(id)) continue;
      const hb = Viewer.baseBox(id); if (!hb) continue;
      const host = boxes.find(([, b]) => b.intersectsBox(hb)); if (host) map.set(id, map.get(host[0]).clone());
    }
    return map;
  }
  function explodeCount() { return [...Viewer.nodes.keys()].filter((id) => { const it = App.doc.items.find((x) => x.id === id); return it && !it.hidden && it.role !== 'hole'; }).length; }
  function explode(on = st.exGoal === 0, amount = 0.6) {
    if (on && explodeCount() < 2) {
      UI.toast('Zum Auseinanderziehen braucht es mindestens zwei Teile auf der obersten Ebene. Tipp: Eine Gruppe vorher mit „Gruppe lösen“ aufteilen.', { icon: 'info', ms: 4200 });
      return;
    }
    animateTo(on ? amount : 0);
    if (on) { exBar(); App.select(App.sel); }   // Griffe ausblenden
  }
  function animateTo(goal, ms = 450) {
    st.exGoal = goal; const from = st.ex, t0 = performance.now();
    cancelAnimationFrame(st.exAnim);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms); const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setEx(from + (goal - from) * e);
      if (t < 1) st.exAnim = requestAnimationFrame(step);
      else { st.exAnim = null; if (goal === 0) { Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } Handles.rebuild(); Panels.renderCtx(); } sync(); }
    };
    step();
  }
  function setEx(f) {
    st.ex = f; Viewer.setOffsets(f > 1e-4 ? offsets(f) : null);
    if (st.exBar) { const r = st.exBar.querySelector('#ex-range'); if (r && document.activeElement !== r) r.value = Math.round(f * 100); }
  }
  function exBar() {
    if (st.exBar) return;
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Explosion' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Explosion'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Wieder zusammensetzen', 'data-tip': 'Wieder zusammensetzen' }); close.innerHTML = icon('close'); close.onclick = () => explode(false);
    head.append(close);
    const range = h('input', { type: 'range', id: 'ex-range', min: 0, max: 100, step: 1, value: Math.round(st.exGoal * 100), 'aria-label': 'Wie weit auseinander' });
    range.oninput = () => { cancelAnimationFrame(st.exAnim); st.exAnim = null; st.exGoal = +range.value / 100; setEx(st.exGoal); sync(); };
    const back = h('button', { type: 'button', class: 'btn small', id: 'ex-back' }); back.innerHTML = icon('group') + 'Zusammensetzen';
    back.onclick = () => explode(false);
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Weit'), range), h('div', { class: 'vb-row' }, back, h('span', { class: 'vb-hint' }, 'Teile anklicken und rechts ändern geht weiter')));
    const fv = bars().querySelector('.focusview'); fv ? bars().insertBefore(bar, fv) : bars().append(bar); st.exBar = bar;
  }
  // Zum Zeichnen, Bohren, Messen oder Ziehen muss alles wieder an seinem Platz sein
  function collapse() { if (st.exGoal > 0 || st.ex > 0) animateTo(0, 250); }

  // ---------- Fokus-Vorschau ----------
  function focus(on = !st.focus) {
    if (!on) { if (st.focus) { st.focus.el.remove(); st.focus.off(); st.focus = null; Viewer.requestRender(); } sync(); return; }
    if (st.focus) return;
    const el = h('div', { class: 'focusview', role: 'region', 'aria-label': 'Fokus-Vorschau' });
    const head = h('div', { class: 'fv-head' }, h('span', { class: 'fv-title' }, 'Fokus'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Fokus-Vorschau schließen' }); close.innerHTML = icon('close'); close.onclick = () => focus(false);
    head.append(close);
    const body = h('div', { class: 'fv-body', 'data-tip': 'Ziehen dreht nur diese Vorschau · Doppelklick: wie die große Ansicht' });
    const empty = h('div', { class: 'fv-empty' }, 'Wähle ein Teil – es erscheint hier groß.');
    body.append(empty); el.append(head, body);
    bars().append(el);
    const f = { el, body, empty, title: head.firstChild, rot: [0, 0], ids: [] };
    let drag = null;
    body.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, r: f.rot.slice() }; body.setPointerCapture(e.pointerId); e.stopPropagation(); });
    body.addEventListener('pointermove', (e) => { if (!drag) return; f.rot = [drag.r[0] - (e.clientX - drag.x) * 0.6, clamp(drag.r[1] + (e.clientY - drag.y) * 0.5, -80, 80)]; Viewer.requestRender(); });
    body.addEventListener('pointerup', () => { drag = null; });
    body.addEventListener('dblclick', () => { f.rot = [0, 0]; Viewer.requestRender(); });
    body.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const offR = Viewer.on('afterRender', () => drawFocus());
    const offS = App.on('selection', () => { refreshFocus(); Viewer.requestRender(); });
    const offD = App.on('results', () => { refreshFocus(); Viewer.requestRender(); });
    f.off = () => { offR && offR(); offS && offS(); offD && offD(); };
    st.focus = f; refreshFocus(); Viewer.requestRender(); sync();
  }
  function refreshFocus() {
    const f = st.focus; if (!f) return;
    const ids = []; for (const id of App.sel) { const t = Model.topOf(App.doc, id); if (t && Viewer.nodes.has(t.id) && !ids.includes(t.id)) ids.push(t.id); }
    f.ids = ids;
    const name = ids.length === 1 ? Model.label(App.doc.items.find((x) => x.id === ids[0])) : ids.length ? ids.length + ' Teile' : '';
    f.title.textContent = name ? 'Fokus · ' + name : 'Fokus';
    f.empty.hidden = !!ids.length;
  }
  function drawFocus() {
    const f = st.focus; if (!f || !f.ids.length) return;
    const cr = Viewer.canvas.getBoundingClientRect(), br = f.body.getBoundingClientRect();
    f.drawn = Viewer.renderInset({ x: br.left - cr.left, y: br.top - cr.top, w: br.width, h: br.height }, f.ids, f.rot);
  }

  // ---------- Überhänge (3D-Druck) ----------
  // Flächen, die steiler als der Grenzwinkel nach unten zeigen und nicht auf dem Druckbett liegen, werden rot.
  // Druckbett = Unterseite aller sichtbaren Körper. Nur Anzeige, ändert nichts am Modell.
  function overhangData(angle, only) {
    const lim = -Math.cos((angle * Math.PI) / 180);
    const all = [...Viewer.nodes.values()].filter((n) => n.obj.visible && n.role !== 'hole' && n.mesh && n.data && n.data.triangles);
    const solids = only ? all.filter((n) => only.includes(n.id)) : all;
    for (const n of solids) n.obj.updateMatrixWorld(true);
    let bed = Infinity;
    for (const n of all) { n.obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(n.mesh); if (!b.isEmpty()) bed = Math.min(bed, b.min.z); }
    const out = []; let area = 0, cx = 0, cy = 0, cz = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
    for (const n of solids) {
      const P = n.mesh.geometry.getAttribute('position').array, T = n.data.triangles, M = n.mesh.matrixWorld;
      for (let i = 0; i + 2 < T.length; i += 3) {
        a.fromArray(P, T[i] * 3).applyMatrix4(M); b.fromArray(P, T[i + 1] * 3).applyMatrix4(M); c.fromArray(P, T[i + 2] * 3).applyMatrix4(M);
        nn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)); const L = nn.length(); if (L < 1e-12) continue;
        if (nn.z / L > lim) continue;
        if (Math.max(a.z, b.z, c.z) < bed + 0.05) continue;   // liegt auf dem Druckbett
        area += L / 2; cx += ((a.x + b.x + c.x) / 3) * (L / 2); cy += ((a.y + b.y + c.y) / 3) * (L / 2); cz += ((a.z + b.z + c.z) / 3) * (L / 2);
        const o = nn.multiplyScalar(-0.02 / L);   // ein Hauch nach unten, damit es nicht flimmert
        out.push(a.x + o.x, a.y + o.y, a.z + o.z, b.x + o.x, b.y + o.y, b.z + o.z, c.x + o.x, c.y + o.y, c.z + o.z);
      }
    }
    return { pos: out, area, bed: isFinite(bed) ? bed : 0, c: area > 0 ? [cx / area, cy / area, cz / area] : null };
  }
  function drawOverhang() {
    const o = st.ov; if (!o) return;
    if (o.mesh) { Viewer.groups.overlay.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.mesh = null; }
    const d = overhangData(o.angle);
    o.area = d.area;
    if (d.pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0xe0483b, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      o.mesh = new THREE.Mesh(g, m); o.mesh.renderOrder = 18; Viewer.groups.overlay.add(o.mesh);
    }
    const t = o.bar && o.bar.querySelector('#ov-area');
    if (t) t.textContent = d.area > 0.05 ? `${fmt(d.area, d.area < 100 ? 1 : 0)} mm² brauchen Stützen` : 'Keine Überhänge – druckt ohne Stützen';
    Viewer.requestRender();
  }
  function overhang(on = !st.ov) {
    if (!on) { if (st.ov) { if (st.ov.mesh) { Viewer.groups.overlay.remove(st.ov.mesh); st.ov.mesh.geometry.dispose(); st.ov.mesh.material.dispose(); } if (st.ov.bar) st.ov.bar.remove(); st.ov = null; Viewer.requestRender(); } sync(); return; }
    if (st.ov) return;
    const o = { angle: 45, mesh: null, area: 0 };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Überhänge' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Überhänge'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Überhänge ausblenden', 'data-tip': 'Ausblenden' }); close.innerHTML = icon('close'); close.onclick = () => overhang(false);
    head.append(close);
    const sel = h('select', { id: 'ov-angle', class: 'vb-sel', 'aria-label': 'Grenzwinkel' });
    for (const a of [35, 40, 45, 50, 55, 60]) sel.append(h('option', { value: a, ...(a === 45 ? { selected: true } : {}) }, a + '°'));
    sel.onchange = () => { o.angle = +sel.value; drawOverhang(); };
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Ab'), sel, h('span', { class: 'vb-hint' }, 'Neigung gegen die Senkrechte')), h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'ov-area' }, '')), h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'Rot = hängt beim Drucken in der Luft. Druckbett ist die Unterseite.')));
    bars().append(bar); o.bar = bar;
    st.ov = o; drawOverhang(); sync();
  }

  // ---------- Fahrtwind (Stirnfläche) ----------
  // Blick aus der Richtung, aus der der Wind kommt: Die Drohne fliegt nach vorne (−Y) und ist um „Neigung“ mit der Nase nach unten gekippt.
  // Die Fläche, die sie dem Wind zeigt, misst der Viewer per Schattenriss. Propeller zählen auf Wunsch mit.
  const isProp = (id) => {
    const it = App.doc.items.find((x) => x.id === id); if (!it) return false;
    if (it.kind === 'part' && it.p && it.p.lib === 'buyProp') return true;
    if (it.kind === 'group') { let any = false, all = true; Model.walk(it.children || [], (k) => { if (k.kind === 'group') return; any = true; if (!(k.kind === 'part' && k.p && k.p.lib === 'buyProp')) { all = false; return false; } }); if (any && all) return true; }
    return /^Propeller/.test(it.name || '') && it.kind === 'group';
  };
  const windDir = (angle) => { const a = (angle * Math.PI) / 180; return [0, Math.cos(a), -Math.sin(a)]; };
  const windIds = (withProps) => [...Viewer.nodes.entries()].filter(([id, n]) => n.obj.visible && n.role !== 'hole' && n.mesh && (withProps || !isProp(id))).map(([id]) => id);
  function windArea(angle = 0, withProps = false) { return Viewer.silhouette(windIds(withProps), windDir(angle)).area; }
  function drawWind(moveCam) {
    const o = st.wind; if (!o) return;
    const r = Viewer.silhouette(windIds(o.props), windDir(o.angle)); o.area = r.area;
    const t = o.bar.querySelector('#wind-area');
    if (t) t.innerHTML = r.area > 0 ? `Stirnfläche <b>${fmt(r.area / 100, r.area < 100 ? 2 : 1)} cm²</b>` + (o.props ? ' mit Propellern' : ' ohne Propeller') : 'Nichts zu sehen.';
    if (moveCam && r.c) Viewer.lookAtPlane(r.c, windDir(o.angle).map((v) => -v), [1, 0, 0], r.R * 1.15);
    Viewer.requestRender();
  }
  function wind(on = !st.wind) {
    if (!on) { if (st.wind) { const o = st.wind; o.bar.remove(); st.wind = null; Viewer.setOrtho(o.ortho); Viewer.restoreCamera(o.cam); } sync(); return; }
    if (st.wind) return;
    const o = { angle: 0, props: false, area: 0, cam: Viewer.saveCamera(), ortho: Viewer.ortho };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Fahrtwind' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Fahrtwind'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Fahrtwind schließen', 'data-tip': 'Schließen' }); close.innerHTML = icon('close'); close.onclick = () => wind(false);
    head.append(close);
    const rng = h('input', { type: 'range', id: 'wind-angle', min: 0, max: 60, step: 5, value: 0, 'aria-label': 'Neigung nach vorne' });
    const val = h('span', { class: 'vb-l', id: 'wind-angle-v' }, '0°');
    rng.oninput = () => { o.angle = +rng.value; val.textContent = rng.value + '°'; drawWind(true); };
    const cb = h('input', { type: 'checkbox', id: 'wind-props' }); cb.onchange = () => { o.props = cb.checked; drawWind(false); };
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Neigung'), rng, val),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint' }, cb, ' Propeller mitzählen')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-area' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'So sieht der Wind deine Drohne, wenn sie mit dieser Neigung nach vorne fliegt. Kleinere Fläche = weniger Luftwiderstand.')));
    bars().append(bar); o.bar = bar;
    st.wind = o; Viewer.setOrtho(true); drawWind(true); sync();
  }

  // ---------- Menü und Zustand ----------
  function menu(anchor) {
    UI.menu(anchor, [
      { label: (st.cut ? '✓ ' : '') + 'Schnitt', icon: 'section', kbd: 'C', help: 'section', run: () => section() },
      { label: (st.xray ? '✓ ' : '') + 'Röntgen', icon: 'xray', kbd: 'X', help: 'xray', run: () => xray() },
      { label: (st.exGoal > 0 ? '✓ ' : '') + 'Explosion', icon: 'explode', kbd: 'U', help: 'explode', run: () => explode() },
      { label: (st.focus ? '✓ ' : '') + 'Fokus-Vorschau', icon: 'focusView', help: 'focusView', run: () => focus() },
      { label: (st.ov ? '✓ ' : '') + 'Überhänge (3D-Druck)', icon: 'overhang', help: 'overhang', run: () => overhang() },
      { label: (st.wind ? '✓ ' : '') + 'Fahrtwind (Stirnfläche)', icon: 'wind', help: 'wind', run: () => wind() },
    ]);
  }
  function sync() {
    const b = $('#t-views'); if (b) b.classList.toggle('active', !!(st.cut || st.xray || st.exGoal > 0 || st.focus || st.ov || st.wind));
    const x = document.querySelector('.view-btns [data-view="xray"]'); if (x) x.classList.toggle('on', st.xray);
    const c = document.querySelector('.view-btns [data-view="cut"]'); if (c) c.classList.toggle('on', !!st.cut);
  }
  function onKey(e) {
    if (App.mode !== 'model' || Sketch.active || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (k === 'c') { section(); return true; }
    if (k === 'x') { xray(); return true; }
    if (k === 'u') { explode(); return true; }
    return false;
  }
  function init() {
    App.on('mode', () => { if (App.mode !== 'model') reset(); });
    App.on('results', () => {
      if (st.ex > 1e-4) setEx(st.ex);
      if (st.ov) drawOverhang();
      if (st.wind) drawWind(false);
      if (st.cut) { drawCutHelper(); const r = st.cut.bar && st.cut.bar.querySelector('#cut-range'); if (r) { const b = modelBox(); const ax = AX[st.cut.plane]; r.min = Math.floor(b.min.getComponent(ax) - 1); r.max = Math.ceil(b.max.getComponent(ax) + 1); } }
    });
  }
  function reset() { section(false); if (st.xray) xray(false); if (st.exGoal > 0 || st.ex > 0) { cancelAnimationFrame(st.exAnim); st.exAnim = null; st.ex = st.exGoal = 0; Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } } focus(false); overhang(false); wind(false); }
  return {
    init, section, xray, explode, collapse, focus, overhang, menu, onKey, reset, sync, bars,
    get overhangArea() { return st.ov ? st.ov.area : null; },
    wind, windArea, get windInfo() { return st.wind ? { angle: st.wind.angle, props: st.wind.props, area: st.wind.area } : null; },
    overhangOf: (id, angle = 45) => { const d = overhangData(angle, [id]); return { area: d.area, c: d.c }; },
    get cut() { return st.cut ? { plane: st.cut.plane, off: st.cut.off, flip: st.cut.flip } : null; },
    get isXray() { return st.xray; }, get exploded() { return st.ex > 1e-4 || st.exGoal > 0; }, get explodeAmount() { return st.ex; },
    get focusIds() { return st.focus ? st.focus.ids.slice() : null; }, get focusDrawn() { return !!(st.focus && st.focus.drawn); },
  };
})();
