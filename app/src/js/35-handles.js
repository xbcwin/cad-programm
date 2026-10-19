// ================= Anfasser & Maus-Bedienung im Modell =================
const Handles = (() => {
  let group, items = [], labels = [], ring = null, state = null;
  const H = { size: [], lift: null, rot: null };
  let overlayEl;
  const tmpV = new THREE.Vector3();
  function init() {
    group = Viewer.groups.handles;
    overlayEl = $('#overlay');
    Viewer.on('camera', () => { scaleHandles(); placeLabels(); });
    App.on('selection', rebuild);
    App.on('results', () => { if (!state) rebuild(); });
    App.on('doc', () => { if (!state) rebuild(); });
    App.on('ghosts', () => { if (!state) rebuild(); });
  }
  function clear() {
    for (const o of items) { group.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }
    items = []; H.size = []; H.lift = null; H.rot = null;
    const old = labels; labels = [];
    for (const l of old) { try { l.el.remove(); } catch (_) {} }
    Viewer.requestRender();
  }
  function handleMesh(kind) {
    const acc = new THREE.Color(Viewer.theme.accent);
    let geo, mat;
    if (kind === 'size') { geo = new THREE.BoxGeometry(1, 1, 1); mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }); }
    else if (kind === 'lift') { geo = new THREE.ConeGeometry(0.55, 1.4, 20); geo.rotateX(Math.PI / 2); mat = new THREE.MeshBasicMaterial({ color: acc, depthTest: false, transparent: true }); }
    else { geo = new THREE.SphereGeometry(0.6, 16, 12); mat = new THREE.MeshBasicMaterial({ color: acc, depthTest: false, transparent: true }); }
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 30;
    if (kind === 'size') {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: acc, depthTest: false, transparent: true }));
      e.renderOrder = 31; m.add(e);
    }
    m.userData.kind = kind;
    return m;
  }
  const SIZE_MAP = {
    box: { x: 'w', y: 'd', z: 'h' }, pyramid: { x: 'w', y: 'd', z: 'h' }, wedge: { x: 'w', y: 'd', z: 'h' },
    cylinder: { x: 'd', y: 'd', z: 'h' }, tube: { x: 'd', y: 'd', z: 'h' }, prism: { x: 'd', y: 'd', z: 'h' }, cone: { x: 'd1', y: 'd1', z: 'h' },
    sphere: { x: 'd', y: 'd', z: 'd' }, hemisphere: { x: 'd', y: 'd', z: 'd' }, torus: { x: 'd', y: 'd', z: 't' },
  };
  const LABELS = { w: 'Breite', d: 'Durchmesser', h: 'Höhe', d1: 'Durchmesser', t: 'Ringdicke', dist: 'Höhe' };
  function current() {
    if (App.mode !== 'model' || Sketch.active || App.sel.length !== 1 || Views.exploded) return null;
    const f = Model.find(App.doc, App.sel[0]); if (!f || f.item.locked) return null;
    const box = App.localBox(f.item.id); if (!box) return null;
    return { f, it: f.item, box, W: Model.worldMatrix(App.doc, f.item.id) };
  }
  function rebuild() {
    clear();
    const c = current(); if (!c) return;
    const { it, box, W } = c;
    const [x0, y0, z0, x1, y1, z1] = box; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const map = SIZE_MAP[it.kind];
    const defs = [];
    if (map) {
      defs.push({ ax: 'x', dir: [1, 0, 0], p: [x1, cy, z0], param: map.x }, { ax: 'x', dir: [-1, 0, 0], p: [x0, cy, z0], param: map.x });
      defs.push({ ax: 'y', dir: [0, 1, 0], p: [cx, y1, z0], param: map.y }, { ax: 'y', dir: [0, -1, 0], p: [cx, y0, z0], param: map.y });
      defs.push({ ax: 'z', dir: [0, 0, 1], p: [cx, cy, z1], param: map.z });
    } else if (it.kind === 'extrude' && it.p && it.p.sketch) {
      const pl = it.p.sketch.plane; const n = new THREE.Vector3(...pl.n).normalize();
      const dirSign = it.p.dir === 'reverse' ? -1 : 1;
      const rg = SK.regions(Solver.cached(it.p.sketch, Model.vars(App.doc).v).ents); const lab = rg[0] ? rg[0].label : [0, 0];
      const x = new THREE.Vector3(...pl.x).normalize(), y = new THREE.Vector3().crossVectors(n, x);
      const o = new THREE.Vector3(...pl.o).addScaledVector(x, lab[0]).addScaledVector(y, lab[1]);
      const dist = Model.num(it.p.dist, Model.vars(App.doc).v, 10);
      const top = o.clone().addScaledVector(n, dirSign * (it.p.dir === 'both' ? dist / 2 : dist));
      defs.push({ ax: 'n', dir: n.clone().multiplyScalar(dirSign).toArray(), p: top.toArray(), param: 'dist', extrude: true });
    }
    for (const d of defs) {
      const m = handleMesh('size');
      const wp = new THREE.Vector3(...d.p).applyMatrix4(W);
      m.position.copy(wp);
      m.userData = { ...m.userData, ...d, wdir: new THREE.Vector3(...d.dir).transformDirection(W) };
      group.add(m); items.push(m); H.size.push(m);
    }
    // Anheben (Z) über der Mitte
    const top = new THREE.Vector3(cx, cy, z1).applyMatrix4(W);
    const lift = handleMesh('lift'); lift.userData.kind = 'lift'; lift.userData.base = top.clone();
    group.add(lift); items.push(lift); H.lift = lift;
    // Drehen um Z
    const center = new THREE.Vector3(cx, cy, z0).applyMatrix4(W);
    const rad = Math.max(8, Math.hypot(x1 - x0, y1 - y0) / 2 + 6);
    const pts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(center.x + Math.cos(a) * rad, center.y + Math.sin(a) * rad, center.z)); }
    const rg = new THREE.BufferGeometry().setFromPoints(pts);
    ring = new THREE.Line(rg, new THREE.LineDashedMaterial({ color: new THREE.Color(Viewer.theme.accent), dashSize: 2, gapSize: 2, depthTest: false, transparent: true, opacity: 0.8 }));
    ring.computeLineDistances(); ring.renderOrder = 29;
    group.add(ring); items.push(ring);
    const rot = handleMesh('rot');
    const ang = -Math.PI / 4;
    rot.position.set(center.x + Math.cos(ang) * rad, center.y + Math.sin(ang) * rad, center.z);
    rot.userData = { kind: 'rot', center: center.clone(), rad };
    group.add(rot); items.push(rot); H.rot = rot;
    // Beschriftungen
    const V = Model.vars(App.doc).v;
    const P = Model.resolveP(it.p, V);
    const shown = new Set();
    for (const m of H.size) {
      const key = m.userData.param + ':' + m.userData.ax;
      if (shown.has(m.userData.param) && m.userData.ax !== 'z') continue;
      if (m.userData.dir[0] < 0 || m.userData.dir[1] < 0) continue;
      shown.add(m.userData.param);
      addLabel(m, P[m.userData.param]);
    }
    scaleHandles(); placeLabels();
  }
  function addLabel(handle, value) {
    const el = h('div', { class: 'dimlabel', title: 'Klicken und genaues Maß eintippen' }, fmt(value, 2));
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); editLabel(el, handle); });
    overlayEl.append(el);
    labels.push({ el, handle });
  }
  function editLabel(el, handle) {
    if (el.classList.contains('editing')) return;
    const c = current(); if (!c) return;
    const k = handle.userData.param;
    const raw = c.it.p[k];
    el.classList.add('editing'); el.textContent = '';
    const inp = h('input', { type: 'text', value: typeof raw === 'number' ? fmt(raw, 3) : String(raw), 'aria-label': LABELS[k] || k });
    el.append(inp); inp.focus(); inp.select();
    let finished = false;
    const done = (ok) => {
      if (finished) return; finished = true;
      if (ok) {
        const val = inp.value.trim();
        const n = parseNum(val);
        const V = Model.vars(App.doc).v;
        const test = isNaN(n) ? Model.num(val, V, NaN) : n;
        if (!isNaN(test) && test > 0) {
          App.change('Maß geändert', () => { setDim(c, handle, isNaN(n) ? val : n, true); });
        } else UI.toast('Bitte eine Zahl größer als 0 eingeben.', { kind: 'bad' });
      }
      rebuild();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true), { once: true });
  }
  function scaleHandles() {
    for (const m of items) {
      if (!m.isMesh) continue;
      const ps = Viewer.pixelSizeAt(m.position);
      const s = m.userData.kind === 'size' ? 11 * ps : m.userData.kind === 'lift' ? 13 * ps : 12 * ps;
      m.scale.setScalar(s);
      if (m.userData.kind === 'lift') m.position.copy(m.userData.base).add(new THREE.Vector3(0, 0, 26 * ps));
    }
    Viewer.requestRender();
  }
  function placeLabels() {
    for (const l of labels) {
      const p = l.handle.position.clone();
      const a = Viewer.toScreen(p), b = Viewer.toScreen(p.clone().add(l.handle.userData.wdir));
      let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy);
      if (L < 1e-6) { dx = 1; dy = 0; } else { dx /= L; dy /= L; }
      const w = l.el.offsetWidth || 40, hh = l.el.offsetHeight || 20;
      // Abstand so wählen, dass die Beschriftung den Anfasser nie verdeckt
      const dist = 16 + Math.abs(dx) * w / 2 + Math.abs(dy) * hh / 2;
      l.el.style.left = a.x + dx * dist + 'px'; l.el.style.top = a.y + dy * dist + 'px';
      l.el.hidden = a.behind;
    }
  }
  function hitHandle(cx, cy) {
    const rc = Viewer.setRay(cx, cy);
    const hits = rc.intersectObjects(items.filter((m) => m.isMesh), false);
    return hits.length ? hits[0].object : null;
  }
  function hover(obj) {
    for (const m of items) if (m.isMesh && m.userData.kind === 'size') m.material.color.set(m === obj ? Viewer.theme.accent : 0xffffff);
    Viewer.requestRender();
  }
  // Maß setzen und Position so anpassen, dass die Gegenseite stehen bleibt
  function setDim(c, handle, value, exact) {
    const { it } = c; const ud = handle.userData;
    const V = Model.vars(App.doc).v;
    const oldV = Model.num(it.p[ud.param], V, 0);
    it.p[ud.param] = value;
    const newV = Model.num(value, V, oldV);
    const delta = newV - oldV;
    if (it.kind === 'cone' && ud.param === 'd1' && oldV > 0) { const d2 = Model.num(it.p.d2, V, 0); if (typeof it.p.d2 === 'number' && d2 > 0) it.p.d2 = round(d2 * (newV / oldV), 3); }
    if (ud.ax === 'x' || ud.ax === 'y') {
      const shift = new THREE.Vector3(...ud.dir).multiplyScalar(delta / 2);
      moveLocal(c, shift);
    }
  }
  function moveLocal(c, localShift) {
    const { it } = c;
    const L = Model.localMatrix(it);
    const q = new THREE.Quaternion(); L.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const s = localShift.clone().applyQuaternion(q);
    const tn = Model.tNumeric(it);
    it.t.x = round(tn.x + s.x, 4); it.t.y = round(tn.y + s.y, 4); it.t.z = round(tn.z + s.z, 4);
  }
  // ---------- Ziehen ----------
  function closestOnAxis(p0, dir, cx, cy) {
    const ray = Viewer.setRay(cx, cy).ray;
    const w0 = p0.clone().sub(ray.origin);
    const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction), d = dir.dot(w0), e = ray.direction.dot(w0);
    const den = a * c - b * b; if (Math.abs(den) < 1e-9) return 0;
    return (b * e - c * d) / den;
  }
  function start(handle, ev) {
    const c = current(); if (!c) return false;
    const ud = handle.userData;
    const before = App.snapshot();
    const V = Model.vars(App.doc).v;
    state = { handle, c, before, kind: ud.kind, sx: ev.clientX, sy: ev.clientY, fine: ev.shiftKey };
    if (ud.kind === 'size') {
      state.axisDir = ud.wdir.clone().normalize();
      state.p0 = handle.position.clone();
      state.s0 = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY);
      state.v0 = Model.num(c.it.p[ud.param], V, 0);
      state.t0 = Model.tNumeric(c.it);
      state.expr = Model.isExpr(c.it.p[ud.param]);
    } else if (ud.kind === 'lift') {
      state.p0 = handle.position.clone(); state.axisDir = new THREE.Vector3(0, 0, 1);
      state.s0 = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY);
      state.t0 = Model.tNumeric(c.it);
    } else if (ud.kind === 'rot') {
      state.center = ud.center.clone();
      const p = Viewer.rayPlane(ev.clientX, ev.clientY, state.center, new THREE.Vector3(0, 0, 1));
      state.a0 = p ? Math.atan2(p.y - state.center.y, p.x - state.center.x) : 0;
      state.L0 = Model.localMatrix(c.it).clone();
      state.PW = Model.parentWorld(App.doc, c.it.id);
      state.W0 = Model.worldMatrix(App.doc, c.it.id);
    }
    return true;
  }
  const liveRebuild = throttle(() => App.rebuild(), 70);
  function move(ev) {
    if (!state) return;
    const { c, handle } = state; const ud = handle.userData;
    const grid = App.doc.settings.snap === false ? 0 : (ev.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    const snap = (v) => (grid ? Math.round(v / grid) * grid : round(v, 3));
    if (state.kind === 'size') {
      const s = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY);
      let val = ud.param === 'dist' ? snap(state.v0 + (s - state.s0)) : snap(state.v0 + (s - state.s0));
      val = Math.max(grid || 0.1, val);
      c.it.t = { ...state.t0 };
      c.it.p[ud.param] = state.v0;
      setDim(c, handle, round(val, 4));
      showLive(handle, val);
      App.emit('doc'); liveRebuild();
    } else if (state.kind === 'lift') {
      const s = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY);
      const dz = snap(s - state.s0);
      c.it.t = { ...state.t0, z: round(state.t0.z + dz, 4) };
      showLive(handle, c.it.t.z, 'Höhe über Fläche');
      App.emit('doc'); liveRebuild();
    } else if (state.kind === 'rot') {
      const p = Viewer.rayPlane(ev.clientX, ev.clientY, state.center, new THREE.Vector3(0, 0, 1)); if (!p) return;
      let da = Math.atan2(p.y - state.center.y, p.x - state.center.x) - state.a0;
      let deg = (da * 180) / Math.PI;
      const step = ev.shiftKey ? 1 : 15;
      deg = Math.round(deg / step) * step;
      const R = new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180);
      const T1 = new THREE.Matrix4().makeTranslation(state.center.x, state.center.y, state.center.z);
      const T2 = new THREE.Matrix4().makeTranslation(-state.center.x, -state.center.y, -state.center.z);
      const Wn = T1.multiply(R).multiply(T2).multiply(state.W0);
      const Ln = state.PW.clone().invert().multiply(Wn);
      Model.setFromMatrix(c.it, Ln);
      showLive(handle, deg, 'Drehung', '°');
      App.emit('doc'); liveRebuild();
    }
    // Knotenmatrix direkt nachführen (flüssig)
    const top = App.doc.items.find((x) => x.id === c.it.id);
    if (top) Viewer.updateNode(top.id, { matrix: Model.localMatrix(top) });
  }
  let liveEl = null;
  function showLive(handle, v, label, unit = '') {
    if (!liveEl) { liveEl = h('div', { class: 'dimlabel live' }); overlayEl.append(liveEl); }
    liveEl.textContent = (label ? label + ' ' : '') + fmt(v, 2) + (unit || '');
    const s = Viewer.toScreen(handle.position);
    liveEl.style.left = s.x + 'px'; liveEl.style.top = s.y - 28 + 'px';
  }
  function end() {
    if (!state) return;
    const st = state; state = null;
    if (liveEl) { liveEl.remove(); liveEl = null; }
    const label = st.kind === 'size' ? 'Größe geändert' : st.kind === 'lift' ? 'Angehoben' : 'Gedreht';
    if (App.snapshot() !== st.before) { App.pushUndo(label, st.before); App.touched(); }
    rebuild();
  }
  // Für die Zahleneingabe beim Ziehen: aktuelles Maß und wie ein getippter Wert angewendet wird
  function inputSpec() {
    if (!state) return null;
    const st = state, { c, handle } = st, ud = handle.userData;
    const fin = () => { if (liveEl) { liveEl.remove(); liveEl = null; } end(); };
    if (st.kind === 'size') {
      const V = Model.vars(App.doc).v; const cur = Model.num(c.it.p[ud.param], V, st.v0);
      return { fields: [{ label: LABELS[ud.param] || ud.param, value: cur, unit: 'mm' }], apply: ([v]) => { c.it.t = { ...st.t0 }; c.it.p[ud.param] = st.v0; setDim(c, handle, round(Math.max(0.001, v), 6)); fin(); } };
    }
    if (st.kind === 'lift') return { fields: [{ label: 'Höhe', value: c.it.t.z, unit: 'mm' }], apply: ([v]) => { c.it.t = { ...st.t0, z: round(v, 6) }; fin(); } };
    if (st.kind === 'rot') {
      return { fields: [{ label: 'Drehung', value: 0, unit: '°' }], apply: ([deg]) => {
        const R = new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180);
        const T1 = new THREE.Matrix4().makeTranslation(st.center.x, st.center.y, st.center.z), T2 = new THREE.Matrix4().makeTranslation(-st.center.x, -st.center.y, -st.center.z);
        Model.setFromMatrix(c.it, st.PW.clone().invert().multiply(T1.multiply(R).multiply(T2).multiply(st.W0))); fin();
      } };
    }
    return null;
  }
  return { init, rebuild, hitHandle, hover, start, move, end, inputSpec, get dragging() { return !!state; }, clear };
})();

// ---------- Maus-Bedienung ----------
const Interact = (() => {
  let down = null, moving = null, hoverTimer = 0, lastHover = null;
  function init() {
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', onDown, true);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', () => { if (!down) { Viewer.clearHover(); Handles.hover(null); } });
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointermove', (e) => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  }
  function modelActive() { return App.mode === 'model' && !Sketch.active && !Place.active && !Measure.active && !Notes.active; }
  function onDown(e) {
    if (!modelActive()) return;
    if (e.button !== 0) return;
    const hnd = Handles.hitHandle(e.clientX, e.clientY);
    if (hnd) {
      Viewer.controls.enabled = false;
      if (Handles.start(hnd, e)) { down = { handle: true }; Viewer.canvas.setPointerCapture(e.pointerId); }
      return;
    }
    // gewähltes Unterobjekt (z. B. ein Loch in einer Gruppe) direkt ziehen
    if (App.sel.length === 1 && !App.doc.items.find((x) => x.id === App.sel[0])) {
      const gh = Viewer.pickGhost(e.clientX, e.clientY);
      if (gh && gh.id === App.sel[0]) {
        const f = Model.find(App.doc, gh.id);
        if (f && !f.item.locked) {
          Viewer.controls.enabled = false;
          down = { x: e.clientX, y: e.clientY, child: true };
          const W = Model.worldMatrix(App.doc, gh.id);
          const q = new THREE.Quaternion(); W.decompose(new THREE.Vector3(), q, new THREE.Vector3());
          const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          moving = { child: f.item, before: App.snapshot(), start: gh.point.clone(), normal: nrm, t0: Model.tNumeric(f.item), q, PW: Model.parentWorld(App.doc, gh.id) };
          return;
        }
      }
    }
    const hit = Viewer.pick(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, hit, t: performance.now(), shift: e.shiftKey || e.metaKey || e.ctrlKey };
    if (hit && !(App.ctx && hit.id === App.ctx) && !Views.exploded) {   // im Bauteil-Modus nicht das ganze Bauteil verschieben
      const top = App.doc.items.find((x) => x.id === hit.id);
      if (top && !top.locked) Viewer.controls.enabled = false; // Körper ziehen statt Ansicht drehen
    }
  }
  function onMove(e) {
    if (!modelActive()) return;
    if (down && down.kbd) return;
    if (down && down.handle) { Handles.move(e); return; }
    if (down && down.child && moving) { doMove(e); return; }
    if (down && down.hit && !moving && !(App.ctx && down.hit.id === App.ctx) && !Views.exploded) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) startMove(e);
    }
    if (moving) { doMove(e); return; }
    if (down) return;
    // Hover
    cancelAnimationFrame(hoverTimer);
    hoverTimer = requestAnimationFrame(() => {
      const hnd = Handles.hitHandle(e.clientX, e.clientY);
      Handles.hover(hnd);
      if (hnd) { Viewer.canvas.style.cursor = hnd.userData.kind === 'rot' ? 'grab' : 'pointer'; Viewer.clearHover(); return; }
      const hit = Viewer.pick(e.clientX, e.clientY);
      if (hit && hit.edgeIdx != null) { Viewer.highlightEdge(hit.id, hit.edgeIdx); Viewer.highlightFace('hover', null, null); }
      else if (hit) { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', hit.id, hit.faceIdx); }
      else Viewer.clearHover();
      const id = hit ? hit.id : null;
      if (lastHover !== id) { if (lastHover) Viewer.updateNode(lastHover, { hover: false }); if (id) Viewer.updateNode(id, { hover: true }); lastHover = id; }
      Viewer.canvas.style.cursor = hit ? 'pointer' : '';
    });
  }
  function startMove(e) {
    const hit = down.hit; const top = App.doc.items.find((x) => x.id === hit.id);
    if (!top || top.locked) { down = null; Viewer.controls.enabled = true; return; }
    if (!App.sel.includes(top.id)) App.select([top.id]);
    const ids = App.sel.map((id) => App.doc.items.find((x) => x.id === id)).filter((x) => x && !x.locked);
    const planeZ = hit.point.z;
    moving = { ids, before: App.snapshot(), start: hit.point.clone(), planeZ, t0: new Map(ids.map((it) => [it.id, Model.tNumeric(it)])) };
    Viewer.canvas.style.cursor = 'grabbing';
    Viewer.clearHover();
  }
  const liveRebuild = throttle(() => App.rebuild(), 90);
  let moveLabel = null;
  function doMove(e) {
    if (moving.child) return doMoveChild(e);
    const p = Viewer.rayPlane(e.clientX, e.clientY, new THREE.Vector3(0, 0, moving.planeZ), new THREE.Vector3(0, 0, 1));
    if (!p) return;
    const grid = App.doc.settings.snap === false ? 0 : (e.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    let dx = p.x - moving.start.x, dy = p.y - moving.start.y;
    if (grid) { dx = Math.round(dx / grid) * grid; dy = Math.round(dy / grid) * grid; }
    if (e.altKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    for (const it of moving.ids) {
      const t0 = moving.t0.get(it.id);
      it.t = { ...t0, x: round(t0.x + dx, 4), y: round(t0.y + dy, 4) };
      Viewer.updateNode(it.id, { matrix: Model.localMatrix(it) });
    }
    if (!moveLabel) { moveLabel = h('div', { class: 'dimlabel live' }); $('#overlay').append(moveLabel); }
    const r = Viewer.canvas.getBoundingClientRect();
    moveLabel.textContent = `X ${fmt(dx, 2)}  Y ${fmt(dy, 2)}`;
    moveLabel.style.left = e.clientX - r.left + 'px'; moveLabel.style.top = e.clientY - r.top - 30 + 'px';
    App.emit('doc'); Handles.rebuild(); liveRebuild();
  }
  function doMoveChild(e) {
    const m = moving;
    const p = Viewer.rayPlane(e.clientX, e.clientY, m.start, m.normal); if (!p) return;
    const dW = p.clone().sub(m.start);
    // in die eigene Ebene des Objekts umrechnen, dort einrasten
    const qi = m.q.clone().invert();
    const dl = dW.clone().applyQuaternion(qi);
    const grid = App.doc.settings.snap === false ? 0 : (e.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    if (grid) { dl.x = Math.round(dl.x / grid) * grid; dl.y = Math.round(dl.y / grid) * grid; }
    dl.z = 0;
    const dW2 = dl.applyQuaternion(m.q);
    const pq = new THREE.Quaternion(); m.PW.decompose(new THREE.Vector3(), pq, new THREE.Vector3());
    const dP = dW2.applyQuaternion(pq.invert());
    m.child.t = { ...m.t0, x: round(m.t0.x + dP.x, 4), y: round(m.t0.y + dP.y, 4), z: round(m.t0.z + dP.z, 4) };
    App.emit('doc'); Handles.rebuild(); liveRebuildChild();
  }
  const liveRebuildChild = throttle(() => { App.rebuild(); App.refreshSelectionVisuals(); }, 120);
  function onUp(e) {
    if (down && down.kbd) return;   // Wert wird gerade getippt
    if (down && down.handle) { Handles.end(); down = null; Viewer.controls.enabled = true; return; }
    if (moving) {
      const m = moving; moving = null;
      if (moveLabel) { moveLabel.remove(); moveLabel = null; }
      Viewer.canvas.style.cursor = '';
      if (App.snapshot() !== m.before) { App.pushUndo(m.ids && m.ids.length > 1 ? 'Objekte verschoben' : 'Verschoben', m.before); App.touched(); }
      if (m.child) App.refreshSelectionVisuals();
      down = null; Viewer.controls.enabled = true; return;
    }
    if (down && !down.handle) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      if (!moved && e.target === Viewer.canvas) clickSelect(down.hit, down.shift, e.clientX, e.clientY);
      down = null;
    }
    Viewer.controls.enabled = true;
  }
  // im Bauteil-Modus: welches Unterteil liegt unter der Maus?
  function ctxChildAt(hit, cx, cy) {
    if (!hit || !App.ctx || hit.id !== App.ctx) return null;
    const px = Viewer.pickProxy(cx, cy); return px ? px.id : null;
  }
  function clickSelect(hit, additive, cx, cy) {
    if (!hit) { App.clearSelection(); return; }
    const child = ctxChildAt(hit, cx, cy);
    if (child) { App.select([child], { additive }); return; }
    const id = hit.id;
    if (hit.edgeIdx != null) {
      if (additive && App.sel.length === 1 && App.sel[0] === id) {
        const list = App.edges.filter((x) => !(x.id === id && x.edgeIdx === hit.edgeIdx));
        if (list.length === App.edges.length) list.push({ id, edgeIdx: hit.edgeIdx });
        App.select([id], { edges: list });
      } else App.select([id], { edges: [{ id, edgeIdx: hit.edgeIdx }] });
      return;
    }
    if (additive) { App.select([id], { additive: true }); return; }
    App.select([id], { face: { id, faceIdx: hit.faceIdx, point: hit.point.toArray(), normal: hit.normal ? hit.normal.toArray() : null } });
  }
  // Zahl tippen während des Ziehens
  let lastPtr = { x: 0, y: 0 };
  function onKey(e) {
    if (!/^[0-9.,-]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    let sp = null;
    if (down && down.handle && Handles.dragging) sp = Handles.inputSpec();
    else if (moving && !moving.child) {
      const m = moving, it0 = m.ids[0], t0 = m.t0.get(it0.id);
      sp = { fields: [{ label: 'X', value: round(it0.t.x - t0.x, 4), unit: 'mm' }, { label: 'Y', value: round(it0.t.y - t0.y, 4), unit: 'mm' }],
        apply: ([dx, dy]) => {
          for (const it of m.ids) { const t = m.t0.get(it.id); it.t = { ...t, x: round(t.x + dx, 4), y: round(t.y + dy, 4) }; }
          finishMove(m);
        } };
    }
    if (!sp) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // Ziehen anhalten, Wert per Tastatur übernehmen
    const handleWas = down && down.handle;
    down = { kbd: true }; if (!handleWas) moving = null;
    DragInput.open({ fields: sp.fields, apply: (v) => { sp.apply(v); down = null; Viewer.controls.enabled = true; } }, e.key === ',' ? '0,' : e.key, lastPtr);
  }
  function finishMove(m) {
    if (moveLabel) { moveLabel.remove(); moveLabel = null; }
    Viewer.canvas.style.cursor = '';
    if (App.snapshot() !== m.before) { App.pushUndo(m.ids && m.ids.length > 1 ? 'Objekte verschoben' : 'Verschoben', m.before); App.touched(); }
    else App.emit('doc');
  }
  function onDbl(e) {
    if (!modelActive()) return;
    const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
    if (!hit) return;
    // Doppelklick auf einen Skizzenkörper: Skizze bearbeiten
    const id = ctxChildAt(hit, e.clientX, e.clientY) || hit.id;
    const f = Model.find(App.doc, id);
    if (f && (f.item.kind === 'extrude' || f.item.kind === 'revolve') && f.item.p.sketch && !f.item.locked) { Sketch.editItem(id); return; }
    Viewer.fit([hit.id]);
  }
  return { init };
})();

