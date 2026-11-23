// ================= Ansichten: Schnitt, Röntgen, Explosion, Fokus-Vorschau =================
// Alles hier ändert nur, wie das Modell gezeigt wird – nie das Modell selbst. Nichts davon landet
// in der Zeitleiste oder in der Projektdatei.
const Views = (() => {
  const st = { cut: null, xray: false, ex: 0, exGoal: 0, exAnim: null, focus: null, ov: null, exGroups: false };
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
  // Ein Teil der Szene (auch die einzeln gezeigten Teile aus Gruppen)
  const sceneItem = (id) => App.doc.items.find((x) => x.id === id) || App.extra.find((x) => x.id === id);
  const shown = (id) => { const it = sceneItem(id); return it && !it.hidden && it.role !== 'hole' && !App.hideIds.has(id); };
  // Gruppen zerlegen: jedes Teil einer Gruppe (eine Ebene tief) wird einzeln gezeigt – samt den Löchern der Gruppe,
  // damit die Bohrungen nicht fehlen. Muster- und Rechen-Gruppen bleiben ganz.
  function splitGroups() {
    const extra = [], hide = new Set();
    for (const g of Model.activeItems(App.doc)) {
      if (g.kind !== 'group' || g.hidden || (g.p && g.p.op)) continue;
      const kids = (g.children || []).filter((c) => !c.suppressed && !c.hidden);
      const solids = kids.filter((c) => c.role !== 'hole'), holes = kids.filter((c) => c.role === 'hole');
      if (solids.length < 2) continue;
      hide.add(g.id);
      for (const c of solids) extra.push({ id: '__ex:' + c.id, kind: 'group', name: c.name, role: 'solid', color: c.color || g.color, mat: c.mat || g.mat, t: deepClone(g.t || Model.T0()), p: {}, finishes: [], children: [deepClone(c), ...holes.map(deepClone)] });
    }
    return { extra, hide };
  }
  function setGroups(on) {
    st.exGroups = !!on;
    const { extra, hide } = on ? splitGroups() : { extra: [], hide: new Set() };
    App.extra = extra; App.hideIds = hide;
    App.rebuild();
    const cb = st.exBar && st.exBar.querySelector('#ex-groups'); if (cb) cb.checked = st.exGroups;
  }
  const groupsSplittable = () => splitGroups().extra.length > 0;
  function offsets(f) {
    const ids = [...Viewer.nodes.keys()].filter(shown);
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
  function explodeCount() { return [...Viewer.nodes.keys()].filter(shown).length; }
  function explode(on = st.exGoal === 0, amount = 0.6) {
    if (on && explodeCount() < 2) {
      // Nur ein Teil ganz oben, aber eine Gruppe mit mehreren Teilen: dann die Gruppen gleich mit zerlegen
      if (!groupsSplittable()) { UI.toast('Zum Auseinanderziehen braucht es mindestens zwei Teile.', { icon: 'info', ms: 4200 }); return; }
      setGroups(true);
      const off = App.on('results', () => { off(); animateTo(amount); });
      exBar(); App.select(App.sel); return;
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
      else { st.exAnim = null; if (goal === 0) { Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } if (st.exGroups) setGroups(false); Handles.rebuild(); Panels.renderCtx(); } sync(); }
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
    const gcb = h('input', { type: 'checkbox', id: 'ex-groups' }); gcb.checked = st.exGroups;
    gcb.onchange = () => setGroups(gcb.checked);
    const grow = h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint' }, gcb, ' Gruppen auch zerlegen'));
    if (!st.exGroups && !groupsSplittable()) grow.hidden = true;
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Weit'), range), grow, h('div', { class: 'vb-row' }, back, h('span', { class: 'vb-hint' }, 'Teile anklicken und rechts ändern geht weiter')));
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

  // ---------- Wandstärke (3D-Druck, PF-07): Stellen dünner als die Grenze werden rot ----------
  function drawThin() {
    const o = st.thin; if (!o) return;
    if (o.mesh) { Viewer.groups.overlay.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); o.mesh = null; }
    const d = Viewer.thinWalls(o.limit);
    o.area = d.area; o.minT = d.minT;
    if (d.pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      const m = new THREE.MeshBasicMaterial({ color: 0xe0483b, transparent: true, opacity: 0.78, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      o.mesh = new THREE.Mesh(g, m); o.mesh.renderOrder = 18; Viewer.groups.overlay.add(o.mesh);
    }
    const t = o.bar && o.bar.querySelector('#thin-area');
    if (t) t.textContent = d.area > 0.05 ? `${fmt(d.area, d.area < 100 ? 1 : 0)} mm² dünner als ${fmt(o.limit, 1)} mm – dünnste Stelle ${fmt(d.minT, 2)} mm` : `Überall mindestens ${fmt(o.limit, 1)} mm`;
    Viewer.requestRender();
  }
  function thin(on = !st.thin) {
    if (!on) { if (st.thin) { if (st.thin.mesh) { Viewer.groups.overlay.remove(st.thin.mesh); st.thin.mesh.geometry.dispose(); st.thin.mesh.material.dispose(); } if (st.thin.bar) st.thin.bar.remove(); st.thin = null; Viewer.requestRender(); } sync(); return; }
    if (st.thin) return;
    const o = { limit: 1.2, mesh: null, area: 0 };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Wandstärke' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Wandstärke'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Wandstärke ausblenden', 'data-tip': 'Ausblenden' }); close.innerHTML = icon('close'); close.onclick = () => thin(false);
    head.append(close);
    const sel = h('select', { id: 'thin-limit', class: 'vb-sel', 'aria-label': 'Mindest-Wandstärke' });
    for (const a of [0.4, 0.8, 1.2, 1.6, 2, 3, 5]) sel.append(h('option', { value: a, ...(a === 1.2 ? { selected: true } : {}) }, fmt(a, 1) + ' mm'));
    sel.onchange = () => { o.limit = +sel.value; drawThin(); };
    bar.append(head, h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Rot unter'), sel, h('span', { class: 'vb-hint' }, '0,4 mm Düse: mindestens 0,8–1,2 mm')), h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'thin-area' }, '')));
    bars().append(bar); o.bar = bar;
    st.thin = o; drawThin(); sync();
  }

  // ---------- Vorführ-Modus (AN-19): nur das Modell, Vollbild, auf Wunsch langsam drehend ----------
  function present(on = !st.present) {
    if (!on) {
      if (!st.present) return;
      cancelAnimationFrame(st.present.raf); if (st.present.bar) st.present.bar.remove();
      Viewer.canvas.removeEventListener('pointerdown', st.present.pd); removeEventListener('pointerup', st.present.pu);
      document.body.classList.remove('presenting');
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
      st.present = null; sync(); setTimeout(() => Viewer.requestRender(), 50); return;
    }
    if (st.present) return;
    App.clearSelection(); Handles.clear();
    const o = { spin: true, raf: 0, last: performance.now() };
    document.body.classList.add('presenting');
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (_) {}
    const bar = h('div', { class: 'present-bar', id: 'present-bar' });
    const sp = h('button', { type: 'button', class: 'btn small', id: 'present-spin' }, 'Drehen anhalten');
    sp.onclick = () => { o.spin = !o.spin; sp.textContent = o.spin ? 'Drehen anhalten' : 'Langsam drehen'; o.last = performance.now(); };
    const ex = h('button', { type: 'button', class: 'btn small', id: 'present-exit' }, 'Beenden (Esc)'); ex.onclick = () => present(false);
    bar.append(sp, ex); document.body.append(bar); o.bar = bar;
    // langsam um die senkrechte Achse durch den Blickpunkt: eine Runde in 40 s
    const tick = (t) => {
      if (!st.present) return;
      const dt = Math.min(0.1, (t - o.last) / 1000); o.last = t;
      if (o.spin && !o.down) {
        const c = Viewer.camera, tg = Viewer.controls.target, a = (dt * 2 * Math.PI) / 40;
        const dx = c.position.x - tg.x, dy = c.position.y - tg.y, cs = Math.cos(a), sn = Math.sin(a);
        c.position.x = tg.x + dx * cs - dy * sn; c.position.y = tg.y + dx * sn + dy * cs; c.lookAt(tg); Viewer.controls.update(); Viewer.requestRender();
      }
      o.raf = requestAnimationFrame(tick);
    };
    o.pd = () => { o.down = true; }; o.pu = () => { o.down = false; o.last = performance.now(); };
    Viewer.canvas.addEventListener('pointerdown', o.pd); addEventListener('pointerup', o.pu);
    st.present = o; o.raf = requestAnimationFrame(tick);
    setTimeout(() => { Viewer.fit(null, true); }, 120);
    UI.toast('Vorführ-Modus – Esc beendet ihn.', { icon: 'eye', ms: 2500 });
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
  // Luftwiderstand: F = ½ · ρ · v² · cw · A (Luft auf Meereshöhe, 15 °C)
  const RHO = 1.225;
  const CWS = [[1.1, 'Offener Rahmen · cw 1,1'], [0.8, 'Mit Haube · cw 0,8'], [0.5, 'Stromlinien-Rumpf · cw 0,5'], [0.35, 'Rumpf + Armverkleidung · cw 0,35']];
  function cwGuess(doc = App.doc) {
    let fair = false; Model.walk(doc.items, (it) => { if (it.kind === 'part' && it.p && (it.p.lib === 'armFairing' || it.p.lib === 'motorFairing')) fair = true; });
    const V = Model.vars(doc).v, body = typeof V.Rumpfdurchmesser === 'number' || doc.items.some((it) => /^Rumpf/.test(it.name || ''));
    return body && fair ? 0.35 : body ? 0.5 : 1.1;
  }
  const dragN = (areaMM2, cw, kmh) => 0.5 * RHO * (kmh / 3.6) ** 2 * cw * areaMM2 * 1e-6;
  // Höchstgeschwindigkeit: voller Schub, so weit geneigt, dass er die Drohne gerade noch trägt (T·cos θ = Gewicht);
  // der waagerechte Anteil T·sin θ = √(T² − G²) hält dem Luftwiderstand bei der Stirnfläche unter dieser Neigung die Waage.
  // Mit nach vorne geneigten Motoren (motorTilt) liegt der Rumpf um diesen Winkel flacher als der Schub.
  function topSpeed(thrustG, massG, cw, areaAt, motorTilt = 0) {
    if (!(thrustG > massG) || !(cw > 0)) return null;
    const th = Math.acos(massG / thrustG), deg = (th * 180) / Math.PI, body = Math.max(0, deg - motorTilt), A = areaAt(body);
    if (!(A > 0)) return null;
    const F = Math.sqrt(thrustG * thrustG - massG * massG) * 9.80665e-3;
    return { kmh: Math.sqrt((2 * F) / (RHO * cw * A * 1e-6)) * 3.6, deg, body, F, A };
  }
  async function windTop(o) {
    const el = o.bar.querySelector('#wind-top'); if (!el) return;
    const g = DroneCheck.geometry(App.doc), t = DroneCheck.thrustOf(App.doc);
    if (!g || !g.n || !t) { el.innerHTML = 'Höchstgeschwindigkeit: im <b>Drohnen-Check</b> den Schub pro Motor eintragen.'; return; }
    const m = await Mass.measure(); if (st.wind !== o) return;
    if (!m || !m.mass) { el.textContent = 'Höchstgeschwindigkeit: Gewicht unbekannt.'; return; }
    const r = topSpeed(g.n * t, m.mass, o.cw, (deg) => Viewer.silhouette(windIds(o.props), windDir(deg)).area, g.tilt || 0);
    o.top = r;
    if (!r) { el.textContent = 'Zu wenig Schub zum Schweben – keine Höchstgeschwindigkeit.'; return; }
    el.innerHTML = `Höchstens etwa <b>${fmt(r.kmh, 0)} km/h</b> bei ${fmt(r.deg, 0)}° Neigung` + (g.tilt ? ` (Rumpf ${fmt(r.body, 0)}°, Motoren ${fmt(g.tilt, 0)}° geneigt)` : '') + ` – geschätzt aus Schub (${g.n} × ${fmt(t, 0)} g), Gewicht (${Mass.gText(m.mass)}) und Stirnfläche. Propeller verlieren bei hohem Tempo Schub, echt also eher weniger.`;
  }
  function drawWind(moveCam) {
    const o = st.wind; if (!o) return;
    const r = Viewer.silhouette(windIds(o.props), windDir(o.angle)); o.area = r.area;
    const t = o.bar.querySelector('#wind-area');
    if (t) t.innerHTML = r.area > 0 ? `Stirnfläche <b>${fmt(r.area / 100, r.area < 100 ? 2 : 1)} cm²</b>` + (o.props ? ' mit Propellern' : ' ohne Propeller') : 'Nichts zu sehen.';
    const dEl = o.bar.querySelector('#wind-drag');
    if (dEl) {
      const D = dragN(r.area, o.cw, o.v); o.drag = D;
      dEl.innerHTML = r.area > 0 && o.v > 0 ? `Bei ${fmt(o.v, 0)} km/h: Luftwiderstand etwa <b>${fmt(D, D < 10 ? 1 : 0)} N</b> – so viel wie ${fmt((D / 9.80665) * 1000, 0)} g Schub; dafür braucht es etwa ${fmt((D * o.v) / 3.6, 0)} W.` : '';
    }
    if (moveCam && r.c) Viewer.lookAtPlane(r.c, windDir(o.angle).map((v) => -v), [1, 0, 0], r.R * 1.15);
    Viewer.requestRender();
  }
  function wind(on = !st.wind) {
    if (!on) { if (st.wind) { const o = st.wind; o.bar.remove(); st.wind = null; Viewer.setOrtho(o.ortho); Viewer.restoreCamera(o.cam); } sync(); return; }
    if (st.wind) return;
    const o = { angle: 0, props: false, area: 0, cw: cwGuess(), v: 100, cam: Viewer.saveCamera(), ortho: Viewer.ortho };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Fahrtwind' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Fahrtwind'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Fahrtwind schließen', 'data-tip': 'Schließen' }); close.innerHTML = icon('close'); close.onclick = () => wind(false);
    head.append(close);
    const rng = h('input', { type: 'range', id: 'wind-angle', min: 0, max: 60, step: 5, value: 0, 'aria-label': 'Neigung nach vorne' });
    const val = h('span', { class: 'vb-l', id: 'wind-angle-v' }, '0°');
    rng.oninput = () => { o.angle = +rng.value; val.textContent = rng.value + '°'; drawWind(true); };
    const cb = h('input', { type: 'checkbox', id: 'wind-props' }); cb.onchange = () => { o.props = cb.checked; drawWind(false); windTop(o); };
    const cwSel = h('select', { id: 'wind-cw', class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': 'Form der Drohne (cw-Wert)' });
    for (const [v, l] of CWS) { const op = h('option', { value: v }, l); if (v === o.cw) op.selected = true; cwSel.append(op); }
    cwSel.onchange = () => { o.cw = +cwSel.value; drawWind(false); windTop(o); };
    const vIn = h('input', { type: 'number', id: 'wind-v', class: 'vb-num', min: 0, max: 500, step: 10, value: o.v, 'aria-label': 'Tempo in km/h' });
    vIn.onchange = () => { const v = parseFloat(vIn.value); if (v >= 0) { o.v = v; drawWind(false); } };
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Neigung'), rng, val),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint' }, cb, ' Propeller mitzählen')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-area' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Form'), cwSel),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Tempo'), vIn, h('span', { class: 'vb-u' }, 'km/h')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-drag' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'wind-top' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'So sieht der Wind deine Drohne, wenn sie mit dieser Neigung nach vorne fliegt. Kleinere Fläche = weniger Luftwiderstand.')));
    bars().append(bar); o.bar = bar;
    st.wind = o; Viewer.setOrtho(true); drawWind(true); sync(); windTop(o);
  }

  // ---------- Menü und Zustand ----------
  function menu(anchor) {
    UI.menu(anchor, [
      { label: (st.cut ? '✓ ' : '') + 'Schnitt', icon: 'section', kbd: 'C', help: 'section', run: () => section() },
      { label: (st.xray ? '✓ ' : '') + 'Röntgen', icon: 'xray', kbd: 'X', help: 'xray', run: () => xray() },
      { label: (st.exGoal > 0 ? '✓ ' : '') + 'Explosion', icon: 'explode', kbd: 'U', help: 'explode', run: () => explode() },
      { label: (st.focus ? '✓ ' : '') + 'Fokus-Vorschau', icon: 'focusView', help: 'focusView', run: () => focus() },
      { label: (st.ov ? '✓ ' : '') + 'Überhänge (3D-Druck)', icon: 'overhang', help: 'overhang', run: () => overhang() },
      { label: (st.thin ? '✓ ' : '') + 'Wandstärke (3D-Druck)', icon: 'ruler', help: 'thinWalls', id: 'view-thin', run: () => thin() },
      { label: (st.wind ? '✓ ' : '') + 'Fahrtwind (Stirnfläche)', icon: 'wind', help: 'wind', run: () => wind() },
      { label: 'Vorführen (Vollbild)', icon: 'play', kbd: 'P', help: 'present', id: 'view-present', run: () => present(true) },
      { label: 'Drehteller-Video …', icon: 'play', help: 'turntable', id: 'view-turntable', run: () => Print.turntableDialog() },
      '-', ...lookItems(),
    ]);
  }
  // ---------- Aussehen: Studio-Look, einfach, Prüfansicht; Licht-Stimmung; Schatten ----------
  const LOOKNAMES = { studio: 'Studio-Look (Werkstoff, Licht, Schatten)', plain: 'Einfach (matt, schnell)', clay: 'Prüfen: Ton', chrome: 'Prüfen: Chrom-Streifen' };
  const MOODNAMES = { studio: 'Studio', hell: 'Hell', werkstatt: 'Werkstatt' };
  function setLook(k) {
    ViewPrefs.set({ look: k });
    const tip = { studio: 'Studio-Look: Teile zeigen ihren Werkstoff – Metall glänzt, Kohlefaser ist dunkel.', plain: 'Einfache Darstellung: matt und am schnellsten.', clay: 'Prüfansicht Ton: Jede Delle und jeder Knick fällt auf.', chrome: 'Prüfansicht Chrom: Laufen die Streifen ohne Knick über eine Kante, gehen die Flächen glatt ineinander über.' }[k];
    UI.toast(tip, { icon: 'info', ms: 3200 });
  }
  const DISPNAMES = { edges: 'Flächen mit Kanten', shaded: 'Nur Flächen', wire: 'Drahtgitter (nur Kanten)', hidden: 'Verdeckte Kanten zeigen' };
  // gespeicherte Ansichten (im Projekt): Blickwinkel, Ausschnitt und Projektion
  async function saveView() {
    const name = await UI.prompt('Ansicht speichern', 'Name der Ansicht', `Ansicht ${(App.doc.views || []).length + 1}`, 'Speichern');
    if (!name || !name.trim()) return null;
    const c = Viewer.saveCamera(), v = { id: uid('v'), name: name.trim(), p: c.p.toArray(), t: c.t.toArray(), up: c.up.toArray(), ortho: !!ViewPrefs.get().ortho };
    App.change(`Ansicht „${v.name}“ gespeichert`, (doc) => { (doc.views = doc.views || []).push(v); });
    return v;
  }
  function goView(id) {
    const v = (App.doc.views || []).find((x) => x.id === id); if (!v) return false;
    if (!!ViewPrefs.get().ortho !== !!v.ortho) ViewPrefs.set({ ortho: !!v.ortho });
    Viewer.restoreCamera({ p: new THREE.Vector3(...v.p), t: new THREE.Vector3(...v.t), up: new THREE.Vector3(...v.up) });
    return true;
  }
  function removeView(id) { App.change('Ansicht gelöscht', (doc) => { doc.views = (doc.views || []).filter((x) => x.id !== id); }); }
  function lookItems() {
    const pv = ViewPrefs.get(), out = [];
    for (const k of Object.keys(DISPNAMES)) out.push({ label: (pv.display === k || (!pv.display && k === 'edges') ? '✓ ' : '') + DISPNAMES[k], icon: k === 'wire' ? 'cube' : 'eye', help: 'display', id: 'disp-' + k, run: () => ViewPrefs.set({ display: k }) });
    out.push('-');
    for (const k of Object.keys(LOOKNAMES)) out.push({ label: (pv.look === k ? '✓ ' : '') + LOOKNAMES[k], icon: k === 'studio' ? 'spark' : 'eye', help: 'look', id: 'look-' + k, run: () => setLook(k) });
    if (pv.look === 'studio') {
      for (const k of Object.keys(MOODNAMES)) out.push({ label: (pv.mood === k ? '✓ ' : '') + 'Licht: ' + MOODNAMES[k], icon: 'sun', help: 'look', id: 'mood-' + k, run: () => ViewPrefs.set({ mood: k }) });
      out.push({ label: (pv.shadows !== false ? '✓ ' : '') + 'Schatten', icon: 'shadow', help: 'look', id: 'look-shadows', run: () => ViewPrefs.set({ shadows: pv.shadows === false }) });
    }
    out.push('-', { label: 'Vorige Ansicht', icon: 'undo', kbd: 'Umschalt Z', help: 'viewBack', id: 'view-back', disabled: !Viewer.viewHistory, run: () => Viewer.viewBack() });
    out.push({ label: 'Ansicht speichern …', icon: 'plus', help: 'savedViews', id: 'view-save', run: () => saveView() });
    for (const v of App.doc.views || []) out.push({ label: 'Ansicht: ' + v.name, icon: 'viewPersp', help: 'savedViews', id: 'view-go-' + v.id, run: () => goView(v.id) });
    return out;
  }
  function sync() {
    const b = $('#t-views'); if (b) b.classList.toggle('active', !!(st.cut || st.xray || st.exGoal > 0 || st.focus || st.ov || st.thin || st.wind));
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
    // Während die Gruppen zerlegt gezeigt werden: nach jeder Änderung die Einzelteile neu aufbauen
    App.on('doc', () => { if (!st.exGroups) return; const { extra, hide } = splitGroups(); App.extra = extra; App.hideIds = hide; });
    App.on('results', () => {
      if (st.ex > 1e-4) setEx(st.ex);
      if (st.ov) drawOverhang();
      if (st.thin) drawThin();
      if (st.wind) drawWind(false);
      if (st.ex > 1e-4) setEx(st.ex);
      if (st.cut) { drawCutHelper(); const r = st.cut.bar && st.cut.bar.querySelector('#cut-range'); if (r) { const b = modelBox(); const ax = AX[st.cut.plane]; r.min = Math.floor(b.min.getComponent(ax) - 1); r.max = Math.ceil(b.max.getComponent(ax) + 1); } }
    });
  }
  function reset() { section(false); if (st.xray) xray(false); if (st.exGoal > 0 || st.ex > 0) { cancelAnimationFrame(st.exAnim); st.exAnim = null; st.ex = st.exGoal = 0; Viewer.setOffsets(null); if (st.exBar) { st.exBar.remove(); st.exBar = null; } } focus(false); overhang(false); thin(false); wind(false); present(false); if (st.exGroups) setGroups(false); }
  return { saveView, goView, removeView,     init, section, xray, explode, collapse, focus, overhang, menu, onKey, reset, sync, bars,
    present, get presenting() { return !!st.present; }, thin, get thinInfo() { return st.thin ? { area: st.thin.area, minT: st.thin.minT } : null; },
    get overhangArea() { return st.ov ? st.ov.area : null; },
    wind, windArea, get windInfo() { return st.wind ? { angle: st.wind.angle, props: st.wind.props, area: st.wind.area, cw: st.wind.cw, v: st.wind.v, drag: st.wind.drag, top: st.wind.top || null } : null; }, cwGuess, topSpeed, dragN,
    overhangOf: (id, angle = 45) => { const d = overhangData(angle, [id]); return { area: d.area, c: d.c }; },
    get cut() { return st.cut ? { plane: st.cut.plane, off: st.cut.off, flip: st.cut.flip } : null; },
    get isXray() { return st.xray; }, get exploded() { return st.ex > 1e-4 || st.exGoal > 0; }, get explodeAmount() { return st.ex; }, get explodeGroups() { return st.exGroups; }, setGroups,
    get focusIds() { return st.focus ? st.focus.ids.slice() : null; }, get focusDrawn() { return !!(st.focus && st.focus.drawn); },
  };
})();
