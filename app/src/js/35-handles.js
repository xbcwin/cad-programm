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
    App.on('selection', () => { if (!state) rebuild(); });
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
  const isStepMod = (x) => x.kind === 'transform' || x.kind === 'scale' || x.kind === 'deform' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) || x.kind === 'rib' || x.kind === 'vent' || x.kind === 'fins' || x.kind === 'fillPattern' || x.kind === 'web' || x.kind === 'emboss' || x.kind === 'splitFace' || x.kind === 'dome' || x.kind === 'mirrorStep' || x.kind === 'deleteBody' || x.kind === 'boss' || x.kind === 'lipGroove';
  function current() {
    if (App.mode !== 'model' || Sketch.active || App.sel.length !== 1 || Views.exploded) return null;
    const f = Model.find(App.doc, App.sel[0]); if (!f || f.item.locked || isStepMod(f.item)) return null;
    const box = App.localBox(f.item.id); if (!box) return null;
    return { f, it: f.item, box, W: Model.worldMatrix(App.doc, f.item.id) };
  }
  function rebuild() {
    clear();
    const c = current(); if (!c) return;
    const { it, box, W } = c;
    if (!App.ctx && !Model.isActive(App.doc, it.id)) return;   // Schritt hinter dem Marker oder unterdrückt: keine Griffe
    if (App.edges.length) { filletHandle(c); return; }
    const [x0, y0, z0, x1, y1, z1] = box; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const map = SIZE_MAP[it.kind];
    const defs = [];
    if (map) {
      defs.push({ ax: 'x', dir: [1, 0, 0], p: [x1, cy, z0], param: map.x }, { ax: 'x', dir: [-1, 0, 0], p: [x0, cy, z0], param: map.x });
      defs.push({ ax: 'y', dir: [0, 1, 0], p: [cx, y1, z0], param: map.y }, { ax: 'y', dir: [0, -1, 0], p: [cx, y0, z0], param: map.y });
      defs.push({ ax: 'z', dir: [0, 0, 1], p: [cx, cy, z1], param: map.z });
    } else if (it.kind === 'extrude' && it.p && it.p.sketch && !(it.p.extent === 'toNext' || it.p.extent === 'toFace' || it.p.thru)) {
      const pl = it.p.sketch.plane; const n = new THREE.Vector3(...pl.n).normalize();
      const dirSign = it.p.dir === 'reverse' ? -1 : 1;
      const ents = Solver.cached(it.p.sketch, Model.vars(App.doc).v).ents;
      const rg = SK.regions(ents);
      let lab = rg[0] ? rg[0].label : null;
      if (!lab) {
        const ch = SK.chains(ents)[0];
        if (ch && ch.segs.length) {
          const pts = SK.segPoints(ch.segs[0]);
          lab = pts[Math.floor(pts.length / 2)] || ch.segs[0].a;
        } else {
          const b = SK.bounds(ents);
          lab = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
        }
      }
      const x = new THREE.Vector3(...pl.x).normalize(), y = new THREE.Vector3().crossVectors(n, x);
      const o = new THREE.Vector3(...pl.o).addScaledVector(x, lab[0]).addScaledVector(y, lab[1]);
      const dist = Model.num(it.p.dist, Model.vars(App.doc).v, 10);
      const top = o.clone().addScaledVector(n, dirSign * (it.p.dir === 'both' ? dist / 2 : dist));
      defs.push({ ax: 'n', dir: n.clone().multiplyScalar(dirSign).toArray(), p: top.toArray(), param: 'dist', extrude: true });
    } else if (it.kind === 'revolve' && it.p && it.p.sketch) {
      const dir = it.p.dir || 'normal', V = Model.vars(App.doc).v;
      const a1 = Model.num(it.p.angle, V, 360), a2 = dir === 'two' ? Model.num(it.p.angle2, V, a1) : 0;
      const tot = dir === 'two' ? a1 + a2 : a1;
      if (dir !== 'toFace' && tot < 359.99) {
        const fr = Model.revolveFrame(it.p, V);
        if (fr) {
          const wC = new THREE.Vector3(...fr.arcC).applyMatrix4(W);
          const wAx = new THREE.Vector3(...fr.d).transformDirection(W).normalize();
          const wU = new THREE.Vector3(...fr.u0).transformDirection(W).normalize();
          const wW = new THREE.Vector3(...fr.w0).transformDirection(W).normalize();
          const arcR = Math.max(6, fr.rMax * 1.12);
          const [deg0, deg1] = dir === 'reverse' ? [-a1, 0] : dir === 'both' ? [-a1 / 2, a1 / 2] : dir === 'two' ? [-a2, a1] : [0, a1];
          const arcPts = [];
          for (let i = 0; i <= 48; i++) {
            const th = ((deg0 + ((deg1 - deg0) * i) / 48) * Math.PI) / 180;
            arcPts.push(wC.clone().addScaledVector(wU, Math.cos(th) * arcR).addScaledVector(wW, Math.sin(th) * arcR));
          }
          const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineDashedMaterial({ color: new THREE.Color('#f08c00'), dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true, opacity: 0.9 }));
          arcLine.computeLineDistances(); arcLine.renderOrder = 29;
          group.add(arcLine); items.push(arcLine);
          const revDefs = dir === 'reverse'
            ? [{ angDeg: -a1, param: 'angle', sign: -1, factor: 1, val: a1 }]
            : dir === 'both'
              ? [{ angDeg: a1 / 2, param: 'angle', sign: 1, factor: 2, val: a1 }]
              : dir === 'two'
                ? [{ angDeg: a1, param: 'angle', sign: 1, factor: 1, val: a1 }, { angDeg: -a2, param: 'angle2', sign: -1, factor: 1, val: a2 }]
                : [{ angDeg: a1, param: 'angle', sign: 1, factor: 1, val: a1 }];
          for (const d of revDefs) {
            const th = (d.angDeg * Math.PI) / 180;
            const radOut = wU.clone().multiplyScalar(Math.cos(th)).addScaledVector(wW, Math.sin(th)).normalize();
            const tan = wU.clone().multiplyScalar(-Math.sin(th)).addScaledVector(wW, Math.cos(th)).multiplyScalar(d.sign).normalize();
            const hm = handleMesh('lift');
            hm.material.color.set('#f08c00');
            hm.position.copy(wC).addScaledVector(radOut, arcR);
            hm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
            hm.userData = { kind: 'revAngle', param: d.param, sign: d.sign, factor: d.factor, center: wC.clone(), axis: wAx.clone(), u0: wU.clone(), w0: wW.clone(), rad: arcR, wdir: radOut.clone() };
            group.add(hm); items.push(hm);
            addAngleLabel(hm, d.val, d.factor);
          }
        }
      }
    }
    for (const d of defs) {
      const m = handleMesh('size');
      const wp = new THREE.Vector3(...d.p).applyMatrix4(W);
      m.position.copy(wp);
      m.userData = { ...m.userData, ...d, wdir: new THREE.Vector3(...d.dir).transformDirection(W) };
      group.add(m); items.push(m); H.size.push(m);
    }
    // Rohr im Raum: Länge jedes Stücks im Bild – Klick und Zahl tippen macht sie fest (Regel „Länge“)
    if (it.kind === 'sweep' && it.p && it.p.path3d) {
      const V3 = Model.vars(App.doc).v, P3 = Model.path3dPoints(it.p.path3d, V3), RU = it.p.path3d.rules || [];
      for (let i = 0; i + 1 < P3.length; i++) {
        const a = new THREE.Vector3(...P3[i]).applyMatrix4(W), b = new THREE.Vector3(...P3[i + 1]).applyMatrix4(W), d = b.clone().sub(a);
        const o = new THREE.Object3D(); o.position.copy(a).add(b).multiplyScalar(0.5);
        let side = new THREE.Vector3(0, 0, 1).cross(d); if (side.lengthSq() < 1e-9) side.set(1, 0, 0); side.normalize();
        o.userData = { kind: 'seg', seg: i, wdir: side };
        group.add(o); items.push(o);
        addSegLabel(o, d.length(), RU[i] || {}, it.id);
      }
    }
    // Anheben (Z) und Drehen um Z – gesperrt, solange das Teil von einer festen Verbindung gehalten wird oder an einem festgesetzten Teil hängt
    const dragCtx = typeof Joints !== 'undefined' && Joints.dragContext ? Joints.dragContext(App.doc, it.id) : null;
    const isFixedJ = (typeof Joints !== 'undefined' && Joints.isFixedPart(it.id)) || !!(dragCtx && dragCtx.blocked);
    if (!isFixedJ) {
      const top = new THREE.Vector3(cx, cy, z1).applyMatrix4(W);
      const lift = handleMesh('lift'); lift.userData.kind = 'lift'; lift.userData.base = top.clone();
      group.add(lift); items.push(lift); H.lift = lift;
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
    }
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
  // Rundungs-Ziehgriff: Pfeil an der Mitte der gewählten Kante, Ziehen nach innen = größerer Radius
  function filletHandle(c) {
    const E = App.edges[0]; if (!E || E.id !== c.it.id) return;
    const r = App.results.get(E.id); const g = r && r.data && r.data.edges && r.data.edges[E.edgeIdx]; if (!g) return;
    const W = c.W;
    const m = new THREE.Vector3(...g.m);
    let tan = g.t === 'LINE' ? new THREE.Vector3(...g.b).sub(new THREE.Vector3(...g.a)) : g.pts ? new THREE.Vector3(...g.pts[9]).sub(new THREE.Vector3(...g.pts[7])) : null;
    let dir;
    if (g.t === 'CIRCLE' && g.c) dir = new THREE.Vector3(...g.c).sub(m);
    else {
      const b = c.box, ctr = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      dir = ctr.sub(m);
      if (tan && tan.lengthSq() > 1e-9) { tan.normalize(); dir.addScaledVector(tan, -dir.dot(tan)); }
    }
    if (dir.lengthSq() < 1e-9) dir.set(0, 0, -1);
    dir.normalize();
    const wp = m.clone().applyMatrix4(W), wdir = dir.clone().transformDirection(W).normalize();
    const hm = handleMesh('lift');
    hm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), wdir.clone().negate());
    hm.material.color.set('#e0457b');
    hm.userData = { kind: 'fillet', base: wp.clone(), wdir, dir: wdir.toArray() };
    group.add(hm); items.push(hm);
    const el = h('div', { class: 'dimlabel fillet-tip', title: 'Ziehen oder Zahl tippen' }, 'Rundung ziehen');
    bindLabelPass(el);
    el.addEventListener('click', (e) => {
      if (!el.classList.contains('editing') && e.altKey && !App.ctx) {
        e.stopPropagation();
        Interact.selectBehind(e.clientX, e.clientY);
      }
    });
    overlayEl.append(el); labels.push({ el, handle: hm });
    scaleHandles(); placeLabels();
  }
  function bindLabelPass(el) {
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    el.addEventListener('contextmenu', (e) => {
      if (el.classList.contains('editing')) return;
      e.preventDefault(); e.stopPropagation();
      Interact.contextMenu(e.clientX, e.clientY);
    });
  }
  function addLabel(handle, value) {
    const txt = Units.key() === 'mm' ? Units.fmtLen(value) : Units.fmtLenU(value);
    const el = h('div', { class: 'dimlabel', title: 'Klicken und genaues Maß eintippen' }, txt);
    bindLabelPass(el);
    el.addEventListener('click', (e) => {
      if (!el.classList.contains('editing') && e.altKey && !App.ctx) {
        e.stopPropagation();
        Interact.selectBehind(e.clientX, e.clientY);
        return;
      }
      e.stopPropagation(); editLabel(el, handle);
    });
    overlayEl.append(el);
    labels.push({ el, handle });
  }
  function addAngleLabel(handle, value, factor = 1) {
    const txt = factor === 2 ? `${fmtAngleU(value)} (2×${fmtAngleU(value / 2)})` : fmtAngleU(value);
    const el = h('div', { class: 'dimlabel', title: 'Klicken und genauen Winkel eintippen' }, txt);
    bindLabelPass(el);
    el.addEventListener('click', (e) => {
      if (!el.classList.contains('editing') && e.altKey && !App.ctx) {
        e.stopPropagation();
        Interact.selectBehind(e.clientX, e.clientY);
        return;
      }
      e.stopPropagation(); editAngleLabel(el, handle);
    });
    overlayEl.append(el);
    labels.push({ el, handle });
  }
  function editAngleLabel(el, handle) {
    if (el.classList.contains('editing')) return;
    const c = current(); if (!c) return;
    const k = handle.userData.param, raw = c.it.p[k];
    el.classList.add('editing'); el.textContent = '';
    const orig = typeof raw === 'number' ? fmtFixed(raw, Math.max(4, FMT.angle)) : String(raw ?? '');
    const inp = h('input', { type: 'text', value: orig, 'aria-label': 'Drehwinkel' });
    el.append(inp); inp.focus(); inp.select();
    let finished = false;
    const done = (ok) => {
      if (finished) return; finished = true;
      if (ok) {
        const t = inp.value.trim();
        if (t !== orig) {
          const V = Model.vars(App.doc).v, n = parseNum(t);
          const v = isNaN(n) ? Model.num(t, V, NaN) : n;
          if (!isNaN(v) && v > 0 && v <= 360) {
            const maxA = c.it.p.dir === 'two' ? Math.max(0.1, 360 - Model.num(c.it.p[k === 'angle' ? 'angle2' : 'angle'], V, 0)) : 360;
            const val = isNaN(n) ? t : round(clamp(v, 0.1, maxA), 4);
            App.change('Drehwinkel geändert', (doc) => { const f = Model.find(doc, c.it.id); if (f) f.item.p[k] = val; });
          } else UI.toast('Bitte einen Winkel zwischen 0,1° und 360° eingeben.', { kind: 'bad' });
        }
      }
      rebuild();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true), { once: true });
  }
  function addSegLabel(handle, len, rule, id) {
    const i = handle.userData.seg;
    const lenTxt = Units.key() === 'mm' ? Units.fmtLen(len) : Units.fmtLenU(len);
    const el = h('div', { class: 'dimlabel seglabel' + (rule.len != null ? ' fixed' : ''), id: 'seglabel-' + i, title: 'Klicken und Länge dieses Stücks eintippen' }, (rule.ax ? ({ perp: '⊥', par: '∥' }[rule.ax] || rule.ax.toUpperCase()) + ' · ' : '') + lenTxt + (rule.len != null ? ' 🔒' : ''));
    bindLabelPass(el);
    el.addEventListener('click', (e) => {
      if (!el.classList.contains('editing') && e.altKey && !App.ctx) {
        e.stopPropagation();
        Interact.selectBehind(e.clientX, e.clientY);
        return;
      }
      e.stopPropagation(); if (el.classList.contains('editing')) return;
      el.classList.add('editing'); el.textContent = '';
      const initV = rule.len != null ? (typeof rule.len === 'number' ? Units.fmtInput(rule.len) : String(rule.len)) : Units.fmtInput(len);
      const inp = h('input', { type: 'text', value: initV, 'aria-label': `Länge von Stück ${i + 1}` });
      el.append(inp); inp.focus(); inp.select();
      let finished = false;
      const done = (ok) => {
        if (finished) return; finished = true;
        if (ok) {
          const val = inp.value.trim();
          if (val !== initV) {
            const V = Model.vars(App.doc).v, p = Units.parseLen(val, V, { expr: true });
            if (p.ok && p.num >= 0) App.change('Länge im Pfad', (doc) => { const f = Model.find(doc, id); if (!f || !f.item.p.path3d) return false; Model.path3dSetRule(f.item.p.path3d, i, { len: p.num === 0 ? null : p.value }, V); });
            else UI.toast('Bitte eine Zahl eingeben (0 macht die Länge wieder frei).', { kind: 'bad' });
          }
        }
        rebuild();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
      inp.addEventListener('blur', () => done(true), { once: true });
    });
    overlayEl.append(el);
    labels.push({ el, handle });
  }
  function editLabel(el, handle) {
    if (el.classList.contains('editing')) return;
    const c = current(); if (!c) return;
    const k = handle.userData.param;
    const raw = c.it.p[k];
    el.classList.add('editing'); el.textContent = '';
    const orig = typeof raw === 'number' ? Units.fmtInput(raw) : String(raw);
    const inp = h('input', { type: 'text', value: orig, 'aria-label': LABELS[k] || k });
    el.append(inp); inp.focus(); inp.select();
    let finished = false;
    const done = (ok) => {
      if (finished) return; finished = true;
      if (ok) {
        const val = inp.value.trim();
        if (val !== orig) {
          const V = Model.vars(App.doc).v;
          const p = Units.parseLen(val, V, { expr: true });
          if (p.ok && p.num > 0) {
            App.change('Maß geändert', () => { setDim(c, handle, p.value, true); });
          } else UI.toast('Bitte eine Zahl größer als 0 eingeben.', { kind: 'bad' });
        }
      }
      rebuild();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
    inp.addEventListener('blur', () => done(true), { once: true });
  }
  function scaleHandles() {
    const tMul = document.body.classList.contains('tablet') ? 1.35 : 1;
    for (const m of items) {
      if (!m.isMesh) continue;
      const ps = Viewer.pixelSizeAt(m.position);
      const s = (m.userData.kind === 'size' ? 11 * ps : (m.userData.kind === 'lift' || m.userData.kind === 'revAngle') ? 13 * ps : 12 * ps) * tMul;
      m.scale.setScalar(s);
      if (m.userData.kind === 'lift') m.position.copy(m.userData.base).add(new THREE.Vector3(0, 0, 26 * ps * tMul));
      if (m.userData.kind === 'fillet') { m.scale.setScalar(13 * ps * tMul); m.position.copy(m.userData.base).addScaledVector(m.userData.wdir, -16 * ps * tMul); }
    }
    Viewer.requestRender();
  }
  function placeLabels() {
    for (const l of labels) {
      const p = l.handle.position.clone();
      const a = Viewer.toScreen(p), b = Viewer.toScreen(p.clone().add(l.handle.userData.wdir));
      let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy);
      const ps = Viewer.pixelSizeAt(p);
      if (L < 1e-6 || (ps > 0 && L * ps < 0.35)) { dx = 1; dy = 0; } else { dx /= L; dy /= L; }
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
    for (const m of items) {
      if (!m.isMesh) continue;
      if (m.userData.kind === 'size') m.material.color.set(m === obj ? Viewer.theme.accent : 0xffffff);
      else if (m.userData.kind === 'revAngle') m.material.color.set(m === obj ? '#ffb020' : '#f08c00');
    }
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
    if ((ud.kind === 'lift' || ud.kind === 'rot') && typeof Joints !== 'undefined' && (Joints.isFixedPart(c.it.id) || (Joints.dragContext && Joints.dragContext(App.doc, c.it.id).blocked))) return false;
    const before = App.snapshot();
    const V = Model.vars(App.doc).v;
    state = { handle, c, before, kind: ud.kind, sx: ev.clientX, sy: ev.clientY, fine: ev.shiftKey };
    if (ud.kind === 'fillet') {
      state.axisDir = ud.wdir.clone();
      state.p0 = ud.base.clone();
      state.s0 = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY);
      const edges = App.edges.slice();
      const tid = Actions.addFinish('fillet', 0.5, edges); if (!tid) { state = null; return false; }
      const f = Model.find(App.doc, tid); const fin = f && f.item.finishes[f.item.finishes.length - 1];
      if (!fin) { state = null; return false; }
      Object.assign(state, { tid, finId: fin.id, r: 0.5 });
      return true;
    }
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
      state.W0 = Model.worldMatrix(App.doc, c.it.id).clone();
      state.chain0 = typeof Joints !== 'undefined' && Joints.captureChain ? Joints.captureChain(App.doc, c.it.id) : null;
    } else if (ud.kind === 'rot') {
      state.center = ud.center.clone();
      const p = Viewer.rayPlane(ev.clientX, ev.clientY, state.center, new THREE.Vector3(0, 0, 1));
      state.a0 = p ? Math.atan2(p.y - state.center.y, p.x - state.center.x) : 0;
      state.L0 = Model.localMatrix(c.it).clone();
      state.PW = Model.parentWorld(App.doc, c.it.id);
      state.W0 = Model.worldMatrix(App.doc, c.it.id).clone();
      state.chain0 = typeof Joints !== 'undefined' && Joints.captureChain ? Joints.captureChain(App.doc, c.it.id) : null;
    } else if (ud.kind === 'revAngle') {
      Object.assign(state, { center: ud.center.clone(), axis: ud.axis.clone(), u0: ud.u0.clone(), w0: ud.w0.clone(), rad: ud.rad, param: ud.param, sign: ud.sign, factor: ud.factor });
      state.v0 = Model.num(c.it.p[ud.param], V, 90);
      const rayDir = Viewer.setRay(ev.clientX, ev.clientY).ray.direction;
      const p = Math.abs(rayDir.dot(state.axis)) > 0.05 ? Viewer.rayPlane(ev.clientX, ev.clientY, state.center, state.axis) : null;
      if (p) {
        const rel = p.clone().sub(state.center);
        state.a0 = Math.atan2(rel.dot(state.w0), rel.dot(state.u0));
        state.lastA = state.a0; state.cum = 0; state.useScreen = false;
      } else {
        state.useScreen = true;
        const th0 = (state.v0 / ud.factor) * ud.sign * Math.PI / 180;
        const tan = ud.u0.clone().multiplyScalar(-Math.sin(th0)).addScaledVector(ud.w0, Math.cos(th0)).multiplyScalar(ud.sign).normalize();
        const s0 = Viewer.toScreen(handle.position), s1 = Viewer.toScreen(handle.position.clone().add(tan));
        let tx = s1.x - s0.x, ty = s1.y - s0.y; const tl = Math.hypot(tx, ty);
        if (tl > 1e-4) { tx /= tl; ty /= tl; } else { tx = 1; ty = 0; }
        state.screenTan = [tx, ty];
      }
    }
    return true;
  }
  const liveRebuild = throttle(() => App.rebuild(), 70);
  function move(ev) {
    if (!state) return;
    const { c, handle } = state; const ud = handle.userData;
    const grid = App.doc.settings.snap === false ? 0 : (ev.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    const snap = (v) => (grid ? Math.round(v / grid) * grid : round(v, 3));
    if (state.kind === 'fillet') {
      const s = closestOnAxis(state.p0, state.axisDir, ev.clientX, ev.clientY) - state.s0;
      const step = ev.shiftKey ? 0.1 : 0.5;
      const r = Math.max(0.1, round(Math.round((0.5 + s) / step) * step, 3));
      if (r !== state.r) {
        state.r = r;
        const f = Model.find(App.doc, state.tid); const fin = f && f.item.finishes.find((x) => x.id === state.finId);
        if (fin) { fin.r = r; App.emit('doc'); liveRebuild(); }
      }
      handle.userData.base = state.p0.clone().addScaledVector(state.axisDir, r * 0.6); scaleHandles();
      for (const l of labels) if (l.handle === handle) l.el.hidden = true;
      showLive(handle, r, 'R', ' mm');
      return;
    }
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
      const constrained = Joints.constrain(App.doc, c.it.id);
      if (!constrained && state.chain0 && state.chain0.entries.length) {
        const D = Model.worldMatrix(App.doc, c.it.id).multiply(state.W0.clone().invert());
        Joints.applyChainDelta(App.doc, state.chain0, D, { live: true });
      }
      if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(App.doc, { live: true });
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
      const constrained = Joints.constrain(App.doc, c.it.id);
      if (!constrained && state.chain0 && state.chain0.entries.length) {
        const D = Model.worldMatrix(App.doc, c.it.id).multiply(state.W0.clone().invert());
        Joints.applyChainDelta(App.doc, state.chain0, D, { live: true });
      }
      if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(App.doc, { live: true });
      showLive(handle, deg, 'Drehung', '°');
      App.emit('doc'); liveRebuild();
    } else if (state.kind === 'revAngle') {
      let degDelta = 0;
      if (!state.useScreen) {
        const p = Viewer.rayPlane(ev.clientX, ev.clientY, state.center, state.axis);
        if (p) {
          const rel = p.clone().sub(state.center);
          const a = Math.atan2(rel.dot(state.w0), rel.dot(state.u0));
          let dA = a - state.lastA;
          while (dA > Math.PI) dA -= Math.PI * 2;
          while (dA < -Math.PI) dA += Math.PI * 2;
          state.lastA = a; state.cum += dA;
          degDelta = (state.cum * 180 / Math.PI) * state.sign * state.factor;
        }
      } else {
        degDelta = ((ev.clientX - state.sx) * state.screenTan[0] + (ev.clientY - state.sy) * state.screenTan[1]) * 0.8;
      }
      const step = ev.shiftKey ? 1 : 5;
      const other = c.it.p.dir === 'two' ? Model.num(c.it.p[state.param === 'angle' ? 'angle2' : 'angle'], Model.vars(App.doc).v, 0) : 0;
      const maxA = Math.max(1, 360 - other);
      const val = clamp(Math.round((state.v0 + degDelta) / step) * step, 1, maxA);
      c.it.p[state.param] = round(val, 2);
      const th = ((val / state.factor) * state.sign * Math.PI) / 180;
      const radOut = state.u0.clone().multiplyScalar(Math.cos(th)).addScaledVector(state.w0, Math.sin(th)).normalize();
      const tan = state.u0.clone().multiplyScalar(-Math.sin(th)).addScaledVector(state.w0, Math.cos(th)).multiplyScalar(state.sign).normalize();
      handle.position.copy(state.center).addScaledVector(radOut, state.rad);
      handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      handle.userData.wdir = radOut;
      placeLabels();
      showLive(handle, val, state.factor === 2 ? 'Gesamtwinkel' : 'Winkel', '°');
      App.emit('doc'); liveRebuild();
      return;
    }
    // Knotenmatrix direkt nachführen (flüssig)
    const top = App.doc.items.find((x) => x.id === c.it.id);
    if (top) {
      Viewer.updateNode(top.id, { matrix: Model.localMatrix(top) });
      for (const d of Joints.downstream(App.doc, top.id)) {
        const db = App.doc.items.find((x) => x.id === d.b);
        if (db) Viewer.updateNode(db.id, { matrix: Model.localMatrix(db) });
      }
    }
  }
  let liveEl = null;
  function showLive(handle, v, label, unit = '') {
    if (!liveEl) { liveEl = h('div', { class: 'dimlabel live' }); overlayEl.append(liveEl); }
    const valTxt = unit === '°'
      ? fmtAngleU(v)
      : unit === ' mm' || unit === 'mm'
        ? Units.fmtLenU(v)
        : unit === ''
          ? (Units.key() === 'mm' ? Units.fmtLen(v) : Units.fmtLenU(v))
          : fmt(v) + unit;
    liveEl.textContent = (label ? label + ' ' : '') + valTxt;
    const s = Viewer.toScreen(handle.position);
    liveEl.style.left = s.x + 'px'; liveEl.style.top = s.y - 28 + 'px';
  }
  function end() {
    if (!state) return;
    const st = state; state = null;
    if (liveEl) { liveEl.remove(); liveEl = null; }
    if (st.kind === 'fillet') {
      const f = Model.find(App.doc, st.tid); const fin = f && f.item.finishes.find((x) => x.id === st.finId);
      if (fin) { fin.r = 0.5; if (st.r !== 0.5) Actions.setFinish(st.tid, st.finId, { r: st.r }); else App.rebuild(); }
      App.select([st.tid]); rebuild(); return;
    }
    const label = st.kind === 'size' ? 'Größe geändert' : st.kind === 'lift' ? 'Angehoben' : st.kind === 'revAngle' ? 'Drehwinkel geändert' : 'Gedreht';
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
    if (st.kind === 'fillet') return { fields: [{ label: 'Radius', value: st.r, unit: 'mm' }], apply: ([v]) => { st.r = Math.max(0.01, round(v, 4)); fin(); } };
    if (st.kind === 'lift') return { fields: [{ label: 'Höhe', value: c.it.t.z, unit: 'mm' }], apply: ([v]) => { c.it.t = { ...st.t0, z: round(v, 6) }; fin(); } };
    if (st.kind === 'rot') {
      return { fields: [{ label: 'Drehung', value: 0, unit: '°' }], apply: ([deg]) => {
        const R = new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180);
        const T1 = new THREE.Matrix4().makeTranslation(st.center.x, st.center.y, st.center.z), T2 = new THREE.Matrix4().makeTranslation(-st.center.x, -st.center.y, -st.center.z);
        Model.setFromMatrix(c.it, st.PW.clone().invert().multiply(T1.multiply(R).multiply(T2).multiply(st.W0))); fin();
      } };
    }
    if (st.kind === 'revAngle') {
      const V = Model.vars(App.doc).v, cur = Model.num(c.it.p[ud.param], V, st.v0);
      const other = c.it.p.dir === 'two' ? Model.num(c.it.p[ud.param === 'angle' ? 'angle2' : 'angle'], V, 0) : 0;
      const maxA = Math.max(0.1, 360 - other);
      return { fields: [{ label: ud.factor === 2 ? 'Gesamtwinkel' : 'Winkel', value: cur, unit: '°' }], apply: ([v]) => { c.it.p[ud.param] = round(clamp(v, 0.1, maxA), 3); fin(); } };
    }
    return null;
  }
  const debugKinds = () => items.filter((m) => m.isMesh).map((m) => m.userData.kind);
  const debugHandle = (k) => items.find((m) => m.isMesh && m.userData.kind === k);
  return { debugKinds, debugHandle, init, rebuild, hitHandle, hover, start, move, end, inputSpec, get dragging() { return !!state; }, clear };
})();

// ---------- Maus-Bedienung ----------
const Interact = (() => {
  let down = null, moving = null, hoverTimer = 0, lastHover = null, rdown = null, band = null;
  const activeTouches = new Map();
  let touchMulti = false, longPressTimer = 0;
  const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0; } };
  function init() {
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', onDown, true);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    cv.addEventListener('pointerleave', () => { if (!down) { Viewer.clearHover(); Handles.hover(null); } });
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // Rechtsklick ohne Ziehen: Menü passend zu dem, was unter der Maus liegt (Ziehen mit rechts verschiebt weiter die Ansicht)
    cv.addEventListener('pointerdown', (e) => { if (e.button === 2) rdown = { x: e.clientX, y: e.clientY }; }, true);
    window.addEventListener('pointerup', (e) => { if (e.button !== 2 || !rdown) return; const r = rdown; rdown = null; if (Math.hypot(e.clientX - r.x, e.clientY - r.y) <= 4 && e.target === Viewer.canvas && modelActive()) contextMenu(e.clientX, e.clientY); });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointermove', (e) => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  }
  function modelActive() { return App.mode === 'model' && !Sketch.active && !Place.active && !Measure.active && !Measure.pickingField && !Notes.active && !Features.picking && !Sketch.picking && !Datums.picking && !RefFix.picking && !(typeof Joints !== 'undefined' && Joints.picking); }
  function onDown(e) {
    if (e.pointerType === 'touch') {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size >= 2) {
        touchMulti = true; clearLongPress();
        if (band) { band.el.remove(); band = null; }
        if (down && down.handle) Handles.end();
        down = null; Viewer.controls.enabled = true;
        return;
      }
      if (touchMulti) return;
    }
    if (!modelActive()) return;
    const isTouch = e.pointerType === 'touch';
    if (!isTouch && e.button !== 0) return;
    const hnd = Handles.hitHandle(e.clientX, e.clientY);
    if (hnd) {
      Viewer.controls.enabled = false;
      if (Handles.start(hnd, e)) { down = { handle: true, touch: isTouch, id: e.pointerId }; try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {} }
      return;
    }
    // gewähltes Unterobjekt (z. B. ein Loch in einer Gruppe) direkt ziehen
    if (!isTouch && App.sel.length === 1 && !App.doc.items.find((x) => x.id === App.sel[0])) {
      const gh = Viewer.pickGhost(e.clientX, e.clientY);
      if (gh && gh.id === App.sel[0]) {
        const f = Model.find(App.doc, gh.id);
        if (f && !f.item.locked && !(typeof Joints !== 'undefined' && Joints.isFixedPart(gh.id))) {
          Viewer.controls.enabled = false;
          down = { x: e.clientX, y: e.clientY, child: true };
          const W = Model.worldMatrix(App.doc, gh.id);
          const q = new THREE.Quaternion(); W.decompose(new THREE.Vector3(), q, new THREE.Vector3());
          const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          moving = { child: f.item, before: App.snapshot(), start: gh.point.clone(), normal: nrm, t0: Model.tNumeric(f.item), q, PW: Model.parentWorld(App.doc, gh.id), o0: new THREE.Vector3().setFromMatrixPosition(W), topId: (Model.topOf(App.doc, gh.id) || {}).id };
          return;
        }
      }
    }
    const hit = Select.adjust(Viewer.pick(e.clientX, e.clientY, Select.pickOpts()));
    // Umschalt + Ziehen im Leeren: Rahmen aufziehen (nach rechts: ganz drin · nach links: berührt);
    // dreht die linke Maustaste nicht (Maus-Steuerung wie Onshape, SolidWorks …), auch ohne Umschalt
    if (!hit && !isTouch && (e.shiftKey || !Viewer.leftOrbits)) {
      Viewer.controls.enabled = false;
      band = { x: e.clientX, y: e.clientY, el: h('div', { class: 'sel-band' }) }; document.body.append(band.el);
      down = { band: true, x: e.clientX, y: e.clientY }; try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    down = { x: e.clientX, y: e.clientY, hit, t: performance.now(), shift: e.shiftKey || e.metaKey || e.ctrlKey, touch: isTouch, id: e.pointerId, moved: false };
    if (!isTouch && hit && !(App.ctx && hit.id === App.ctx) && !Views.exploded) {   // im Bauteil-Modus nicht das ganze Bauteil verschieben
      const top = App.doc.items.find((x) => x.id === hit.id);
      const dctx = top && typeof Joints !== 'undefined' && Joints.dragContext ? Joints.dragContext(App.doc, top.id) : null;
      if (top && !top.locked && !(dctx && dctx.blocked)) Viewer.controls.enabled = false; // Körper ziehen statt Ansicht drehen
    }
    if (isTouch) {
      clearLongPress();
      const lx = e.clientX, ly = e.clientY, pid = e.pointerId;
      longPressTimer = setTimeout(() => {
        longPressTimer = 0;
        if (!touchMulti && down && down.touch && down.id === pid && !down.moved && modelActive()) {
          down = null;
          contextMenu(lx, ly);
        }
      }, 550);
    }
  }
  function onMove(e) {
    if (e.pointerType === 'touch') {
      if (activeTouches.has(e.pointerId)) activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!modelActive()) return;
      if (touchMulti || activeTouches.size >= 2) { clearLongPress(); return; }
      if (down && down.handle) { if (down.id === e.pointerId) Handles.move(e); return; }
      if (down && down.touch && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down.moved = true; clearLongPress(); }
      return;
    }
    if (!modelActive()) return;
    if (down && down.kbd) return;
    if (down && down.band && band) {
      const x0 = Math.min(band.x, e.clientX), y0 = Math.min(band.y, e.clientY), cross = e.clientX < band.x;
      Object.assign(band.el.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - band.x) + 'px', height: Math.abs(e.clientY - band.y) + 'px' });
      band.el.classList.toggle('cross', cross); return;
    }
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
      if (hnd) { Viewer.canvas.style.cursor = hnd.userData.kind === 'rot' || hnd.userData.kind === 'revAngle' ? 'grab' : 'pointer'; Viewer.clearHover(); return; }
      const hit = Select.adjust(Viewer.pick(e.clientX, e.clientY, Select.pickOpts()));
      if (hit && hit.edgeIdx != null) { Viewer.highlightEdge(hit.id, hit.edgeIdx); Viewer.highlightFace('hover', null, null); }
      else if (hit) { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', hit.id, hit.faceIdx); }
      else Viewer.clearHover();
      const id = hit ? hit.id : null;
      if (lastHover !== id) { if (lastHover) Viewer.updateNode(lastHover, { hover: false }); if (id) Viewer.updateNode(id, { hover: true }); lastHover = id; }
      Viewer.canvas.style.cursor = hit ? 'pointer' : '';
    });
  }
  const isStepMod = (x) => x.kind === 'transform' || x.kind === 'scale' || x.kind === 'deform' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) || x.kind === 'rib' || x.kind === 'vent' || x.kind === 'fins' || x.kind === 'fillPattern' || x.kind === 'web' || x.kind === 'emboss' || x.kind === 'splitFace' || x.kind === 'dome' || x.kind === 'mirrorStep' || x.kind === 'deleteBody' || x.kind === 'boss' || x.kind === 'lipGroove';
  function startMove(e) {
    if (typeof Joints !== 'undefined' && Joints.closeDockPrompt) Joints.closeDockPrompt();
    const hit = down.hit; const top = App.doc.items.find((x) => x.id === hit.id);
    if (!top || isStepMod(top)) { down = null; Viewer.controls.enabled = true; return; }
    const dctx = typeof Joints !== 'undefined' && Joints.dragContext ? Joints.dragContext(App.doc, top.id) : null;
    if (dctx && dctx.blocked) {
      if (dctx.reason === 'grounded') UI.toast(T('asm.groundedCannotMove', { name: dctx.name }), { icon: 'lock' });
      else UI.toast(T('joint.fixedCannotMove', { name: dctx.name }), { icon: 'info' });
      down = null; Viewer.controls.enabled = true; return;
    }
    if (top.locked) {
      UI.toast(T('asm.groundedCannotMove', { name: Model.label(top) }), { icon: 'lock' });
      down = null; Viewer.controls.enabled = true; return;
    }
    if (typeof Joints !== 'undefined' && Joints.isFixedPart(top.id)) {
      UI.toast(T('joint.fixedCannotMove', { name: Model.label(top) }), { icon: 'info' });
      down = null; Viewer.controls.enabled = true; return;
    }
    if (!App.sel.includes(top.id)) App.select([top.id]);
    let ids = App.sel.map((id) => App.doc.items.find((x) => x.id === id)).filter((x) => x && !x.locked && !isStepMod(x) && !(typeof Joints !== 'undefined' && (Joints.isFixedPart(x.id) || (Joints.dragContext && Joints.dragContext(App.doc, x.id).blocked))));
    if (ids.length > 1 && typeof Joints !== 'undefined') {
      const idSet = new Set(ids.map((x) => x.id));
      const skip = new Set();
      for (const x of ids) {
        for (const d of Joints.downstream(App.doc, x.id)) {
          if (idSet.has(d.b)) skip.add(d.b);
        }
      }
      ids = ids.filter((x) => !skip.has(x.id));
    }
    if (!ids.length) { down = null; Viewer.controls.enabled = true; return; }
    const planeZ = hit.point.z;
    let joint = null;
    if (ids.length === 1 && typeof Joints !== 'undefined' && Joints.dragContext) {
      const dctx1 = Joints.dragContext(App.doc, ids[0].id);
      if (dctx1 && dctx1.mode === 'joint') {
        const mj = dctx1.joint, kind = dctx1.kind, reverse = !!dctx1.reverse;
        if (!reverse && Joints.syncHome) Joints.syncHome(ids[0], mj, App.doc);
        const revSnap = reverse ? Joints.captureReverseDrag(App.doc, mj.id) : null;
        if (!reverse || revSnap) {
          const frame = Joints.frameOf(mj), st0 = Joints.stateOf(mj);
          if (Joints.showDragVis) Joints.showDragVis(mj.id);
          if (kind === 'rot') {
            const pGrab = hit.point.clone(), axis = frame.d.clone().normalize();
            const pivot = frame.o.clone().addScaledVector(axis, pGrab.clone().sub(frame.o).dot(axis));
            const r0 = pGrab.clone().sub(pivot), lever = r0.length();
            const ray0 = Viewer.setRay(down.x, down.y).ray;
            const usePlane = lever > 1e-3 && Math.abs(ray0.direction.dot(axis)) > 0.08;
            if (usePlane) {
              const u = r0.clone().divideScalar(lever), v = new THREE.Vector3().crossVectors(axis, u).normalize();
              joint = { id: mj.id, kind: 'rot', reverse, revSnap, frame, st0, axis, planePt: pGrab, pivot, u, v, lastA: 0, cum: 0, usePlane: true, min: mj.min ?? -180, max: mj.max ?? 180 };
            } else {
              let screenTan = [1, 0], degPerPx = 0.5;
              if (lever > 1e-3) {
                const tan3d = new THREE.Vector3().crossVectors(axis, r0).normalize();
                const sc0 = Viewer.toScreen(pGrab), sc1 = Viewer.toScreen(pGrab.clone().add(tan3d));
                const tx = sc1.x - sc0.x, ty = sc1.y - sc0.y, tl = Math.hypot(tx, ty);
                if (tl > 1e-4) {
                  screenTan = [tx / tl, ty / tl];
                  degPerPx = clamp((180 / Math.PI) / Math.max(1e-3, lever * tl), 0.05, 5);
                }
              }
              joint = { id: mj.id, kind: 'rot', reverse, revSnap, frame, st0, axis, sx: down.x, sy: down.y, screenTan, degPerPx, usePlane: false, min: mj.min ?? -180, max: mj.max ?? 180 };
            }
          } else if (kind === 'slide') {
            const pGrab = hit.point.clone(), axis = frame.d.clone().normalize();
            const ray0 = Viewer.setRay(down.x, down.y).ray;
            const s0 = Math.abs(ray0.direction.dot(axis)) < 0.96 ? Joints.projectAxisRay(pGrab, axis, ray0) : 0;
            joint = { id: mj.id, kind: 'slide', reverse, revSnap, frame, st0, origin: pGrab, axis, s0, min: mj.min ?? -20, max: mj.max ?? 20 };
          } else if (kind === 'cyl') {
            const pGrab = hit.point.clone(), axis = frame.d.clone().normalize();
            const ray0 = Viewer.setRay(down.x, down.y).ray;
            const s0 = Math.abs(ray0.direction.dot(axis)) < 0.96 ? Joints.projectAxisRay(pGrab, axis, ray0) : 0;
            const pivot = frame.o.clone().addScaledVector(axis, pGrab.clone().sub(frame.o).dot(axis));
            const r0 = pGrab.clone().sub(pivot), lever = r0.length();
            const canRot = lever > 1.0 && Math.abs(ray0.direction.dot(axis)) > 0.25;
            const u = canRot ? r0.clone().divideScalar(lever) : null;
            const v = canRot ? new THREE.Vector3().crossVectors(axis, u).normalize() : null;
            joint = { id: mj.id, kind: 'cyl', reverse, revSnap, frame, st0, origin: pGrab, axis, s0, pivot, u, v, lastA: 0, cum: 0, canRot };
          } else if (kind === 'planar') {
            const p0 = Viewer.rayPlane(down.x, down.y, frame.o, frame.n) || hit.point.clone();
            joint = { id: mj.id, kind: 'planar', reverse, revSnap, frame, st0, p0 };
          } else if (kind === 'ball') {
            const F = new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.n);
            const Rloc0 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((st0.rx * Math.PI) / 180, (st0.ry * Math.PI) / 180, (st0.ang * Math.PI) / 180, 'XYZ'));
            const R0 = F.clone().multiply(Rloc0).multiply(F.clone().transpose());
            const q0 = new THREE.Quaternion().setFromRotationMatrix(R0);
            joint = { id: mj.id, kind: 'ball', reverse, revSnap, frame, st0, sx: down.x, sy: down.y, F, q0 };
          } else if (kind === 'slot') {
            const s0 = Joints.projectAxisRay(frame.o, frame.d, Viewer.setRay(down.x, down.y).ray);
            joint = { id: mj.id, kind: 'slot', reverse, revSnap, frame, st0, s0 };
          }
        }
      }
    }
    let chains = null, ignoreIds = ids.map((it) => it.id);
    if (!joint && typeof Joints !== 'undefined' && Joints.captureChain) {
      chains = new Map();
      const ign = new Set(ignoreIds);
      for (const it of ids) {
        const ch = Joints.captureChain(App.doc, it.id);
        chains.set(it.id, { W0: Model.worldMatrix(App.doc, it.id).clone(), chain: ch });
        for (const ce of ch.entries) ign.add(ce.bId);
      }
      ignoreIds = [...ign];
    }
    const dockActive = !joint && ids.length === 1 && ids[0].role !== 'hole' && !App.ctx && Snap.beginDockDrag ? Snap.beginDockDrag(ids[0].id) : false;
    moving = { ids, before: App.snapshot(), start: hit.point.clone(), planeZ, t0: new Map(ids.map((it) => [it.id, Model.tNumeric(it)])), box0: Actions.selBox(ids.map((it) => it.id)), joint, chains, ignoreIds, dockActive, dock: null };
    Viewer.canvas.style.cursor = 'grabbing';
    Viewer.clearHover();
  }
  const liveRebuild = throttle(() => App.rebuild(), 90);
  let moveLabel = null;
  function doMove(e) {
    if (moving.child) return doMoveChild(e);
    const grid = App.doc.settings.snap === false ? 0 : (e.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    const r = Viewer.canvas.getBoundingClientRect();
    const uSuf = Units.key() !== 'mm' ? ' ' + Units.label() : '';
    if (moving.joint) {
      const j = moving.joint, sign = j.reverse ? -1 : 1;
      const dragOpts = j.reverse ? { reverse: true, snap: j.revSnap } : undefined;
      let txt = '';
      if (j.kind === 'rot') {
        let degDelta = 0;
        if (j.usePlane) {
          const pCur = Viewer.rayPlane(e.clientX, e.clientY, j.planePt, j.axis);
          if (!pCur) return;
          const rCur = pCur.sub(j.pivot);
          if (rCur.lengthSq() > 1e-8) {
            const a = Math.atan2(rCur.dot(j.v), rCur.dot(j.u));
            let dA = a - j.lastA;
            while (dA > Math.PI) dA -= Math.PI * 2;
            while (dA < -Math.PI) dA += Math.PI * 2;
            j.lastA = a; j.cum += dA;
          }
          degDelta = (j.cum * 180) / Math.PI;
        } else {
          degDelta = ((e.clientX - j.sx) * j.screenTan[0] + (e.clientY - j.sy) * j.screenTan[1]) * j.degPerPx;
        }
        const st = Joints.applyDrag(j.id, { ang: round(j.st0.ang + sign * degDelta, 2) }, dragOpts);
        if (st) {
          const atStop = Math.abs(st.ang - j.min) < 1e-4 || Math.abs(st.ang - j.max) < 1e-4;
          txt = `Winkel ${fmtAngleU(st.ang)}${atStop ? ' (Anschlag)' : ''}`;
        }
      } else if (j.kind === 'slide') {
        const ray = Viewer.setRay(e.clientX, e.clientY).ray;
        if (Math.abs(ray.direction.dot(j.axis)) >= 0.96) return;
        let ds = Joints.projectAxisRay(j.origin, j.axis, ray) - j.s0;
        if (grid) ds = Math.round(ds / grid) * grid;
        const st = Joints.applyDrag(j.id, { ang: j.st0.ang + sign * ds }, dragOpts);
        if (st) {
          const atStop = Math.abs(st.ang - j.min) < 1e-4 || Math.abs(st.ang - j.max) < 1e-4;
          txt = `Weg ${Units.fmtLen(st.ang, 2)}${uSuf}${atStop ? ' (Anschlag)' : ''}`;
        }
      } else if (j.kind === 'planar') {
        const p = Viewer.rayPlane(e.clientX, e.clientY, j.frame.o, j.frame.n);
        if (!p) return;
        const d = p.clone().sub(j.p0);
        let du = d.dot(j.frame.u), dv = d.dot(j.frame.v);
        if (grid) { du = Math.round(du / grid) * grid; dv = Math.round(dv / grid) * grid; }
        if (e.altKey) { if (Math.abs(du) > Math.abs(dv)) dv = 0; else du = 0; }
        const st = Joints.applyDrag(j.id, { u: j.st0.u + sign * du, v: j.st0.v + sign * dv }, dragOpts);
        if (st) txt = `U ${Units.fmtLen(st.u, 2)}  V ${Units.fmtLen(st.v, 2)}${uSuf}`;
      } else if (j.kind === 'ball') {
        const dx = e.clientX - j.sx, dy = e.clientY - j.sy;
        const camM = Viewer.camera.matrixWorld;
        const camRight = new THREE.Vector3().setFromMatrixColumn(camM, 0).normalize();
        const camUp = new THREE.Vector3().setFromMatrixColumn(camM, 1).normalize();
        const qDelta = new THREE.Quaternion().setFromAxisAngle(camUp, (dx * 0.5 * Math.PI) / 180).multiply(new THREE.Quaternion().setFromAxisAngle(camRight, (dy * 0.5 * Math.PI) / 180));
        if (j.reverse) qDelta.invert();
        const qNew = qDelta.multiply(j.q0);
        const Rw = new THREE.Matrix4().makeRotationFromQuaternion(qNew);
        const Rloc = j.F.clone().transpose().multiply(Rw).multiply(j.F);
        const eu = new THREE.Euler().setFromRotationMatrix(Rloc, 'XYZ');
        const toDeg = (rad) => round((rad * 180) / Math.PI, 2);
        const st = Joints.applyDrag(j.id, { rx: toDeg(eu.x), ry: toDeg(eu.y), ang: toDeg(eu.z) }, dragOpts);
        if (st) txt = `X ${fmtAngle(st.rx)}°  Y ${fmtAngle(st.ry)}°  Z ${fmtAngle(st.ang)}°`;
      } else if (j.kind === 'slot') {
        const s = Joints.projectAxisRay(j.frame.o, j.frame.d, Viewer.setRay(e.clientX, e.clientY).ray);
        let ds = s - j.s0;
        if (grid) ds = Math.round(ds / grid) * grid;
        const st = Joints.applyDrag(j.id, { pos: j.st0.pos + sign * ds }, dragOpts);
        if (st) {
          const atStop = Math.abs(st.pos - j.frame.minPos) < 1e-4 || Math.abs(st.pos - j.frame.maxPos) < 1e-4;
          txt = `Weg ${Units.fmtLen(st.pos, 2)}${uSuf}${atStop ? ' (Anschlag)' : ''}`;
        }
      } else {
        const ray = Viewer.setRay(e.clientX, e.clientY).ray;
        const patch = {};
        let ds = 0;
        if (Math.abs(ray.direction.dot(j.axis)) < 0.96) {
          ds = Joints.projectAxisRay(j.origin, j.axis, ray) - j.s0;
          if (grid) ds = Math.round(ds / grid) * grid;
          patch.pos = j.st0.pos + sign * ds;
        }
        if (j.canRot) {
          const planePt = j.origin.clone().addScaledVector(j.axis, ds);
          const piv = j.pivot.clone().addScaledVector(j.axis, ds);
          const pCur = Viewer.rayPlane(e.clientX, e.clientY, planePt, j.axis);
          if (pCur) {
            const rCur = pCur.sub(piv);
            if (rCur.lengthSq() > 1e-8) {
              const a = Math.atan2(rCur.dot(j.v), rCur.dot(j.u));
              let dA = a - j.lastA;
              while (dA > Math.PI) dA -= Math.PI * 2;
              while (dA < -Math.PI) dA += Math.PI * 2;
              j.lastA = a; j.cum += dA;
              patch.ang = round(j.st0.ang + sign * (j.cum * 180) / Math.PI, 2);
            }
          }
        }
        const st = Joints.applyDrag(j.id, patch, dragOpts);
        if (st) txt = `Weg ${Units.fmtLen(st.pos, 2)}${uSuf}` + (j.canRot ? ` · ${fmtAngleU(st.ang)}` : '');
      }
      if (!moveLabel) { moveLabel = h('div', { class: 'dimlabel live' }); $('#overlay').append(moveLabel); }
      moveLabel.textContent = txt;
      moveLabel.style.left = e.clientX - r.left + 'px'; moveLabel.style.top = e.clientY - r.top - 30 + 'px';
      App.emit('doc'); Handles.rebuild(); liveRebuild();
      return;
    }
    const p = Viewer.rayPlane(e.clientX, e.clientY, new THREE.Vector3(0, 0, moving.planeZ), new THREE.Vector3(0, 0, 1));
    if (!p) return;
    let dx = p.x - moving.start.x, dy = p.y - moving.start.y;
    if (grid) { dx = Math.round(dx / grid) * grid; dy = Math.round(dy / grid) * grid; }
    if (e.altKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const ignIds = moving.ignoreIds || moving.ids.map((it) => it.id);
    const magOff = e.ctrlKey || e.metaKey || e.altKey;
    let dock = null;
    if (moving.dockActive) {
      if (!magOff && Snap.updateDockDrag) dock = Snap.updateDockDrag(moving.ids[0], moving.t0.get(moving.ids[0].id), [dx, dy], e.clientX, e.clientY);
      else if (Snap.setDockVisible) Snap.setDockVisible(false);
    }
    moving.dock = dock;
    if (dock) {
      const it = moving.ids[0];
      const Pb = Model.parentWorld(App.doc, it.id);
      const Lb = Pb.clone().invert().multiply(dock.worldMatrix);
      Model.setFromMatrix(it, Lb);
      Viewer.updateNode(it.id, { matrix: Model.localMatrix(it) });
      if (moving.chains && moving.chains.has(it.id)) {
        const ci = moving.chains.get(it.id);
        if (ci.chain.entries.length) {
          const D = Model.worldMatrix(App.doc, it.id).multiply(ci.W0.clone().invert());
          Joints.applyChainDelta(App.doc, ci.chain, D, { live: true });
        }
      }
      if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(App.doc, { live: true });
      if (!moveLabel) { moveLabel = h('div', { class: 'dimlabel live' }); $('#overlay').append(moveLabel); }
      moveLabel.textContent = dock.label;
      moveLabel.style.left = e.clientX - r.left + 'px'; moveLabel.style.top = e.clientY - r.top - 54 + 'px';
      App.emit('doc'); Handles.rebuild(); liveRebuild();
      return;
    }
    const mag = magOff || !moving.box0 || moving.box0.isEmpty() ? (Snap.clear(), null) : Snap.bodies(moving.box0, [dx, dy], ignIds, moving.box0.min.z);
    if (mag) { dx = round(mag.d[0], 4); dy = round(mag.d[1], 4); }
    for (const it of moving.ids) {
      const t0 = moving.t0.get(it.id);
      it.t = { ...t0, x: round(t0.x + dx, 4), y: round(t0.y + dy, 4) };
      const constrained = typeof Joints !== 'undefined' && Joints.constrain ? Joints.constrain(App.doc, it.id) : false;
      Viewer.updateNode(it.id, { matrix: Model.localMatrix(it) });
      if (!constrained && moving.chains && moving.chains.has(it.id)) {
        const ci = moving.chains.get(it.id);
        if (ci.chain.entries.length) {
          const D = Model.worldMatrix(App.doc, it.id).multiply(ci.W0.clone().invert());
          Joints.applyChainDelta(App.doc, ci.chain, D, { live: true });
        }
      }
    }
    if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(App.doc, { live: true });
    if (!moveLabel) { moveLabel = h('div', { class: 'dimlabel live' }); $('#overlay').append(moveLabel); }
    let gapTxt = '';
    if (moving.box0 && !moving.box0.isEmpty()) {
      const lo = [moving.box0.min.x + dx, moving.box0.min.y + dy], hi = [moving.box0.max.x + dx, moving.box0.max.y + dy];
      let gx = Infinity, gy = Infinity;
      for (const o of App.doc.items) {
        if (o.hidden || ignIds.includes(o.id)) continue;
        const b = Actions.worldBox(o.id); if (!b || b.isEmpty()) continue;
        if (b.max.y > lo[1] && b.min.y < hi[1]) { const g = b.min.x >= hi[0] ? b.min.x - hi[0] : lo[0] >= b.max.x ? lo[0] - b.max.x : Infinity; gx = Math.min(gx, g); }
        if (b.max.x > lo[0] && b.min.x < hi[0]) { const g = b.min.y >= hi[1] ? b.min.y - hi[1] : lo[1] >= b.max.y ? lo[1] - b.max.y : Infinity; gy = Math.min(gy, g); }
      }
      const parts = []; if (isFinite(gx)) parts.push('↔ ' + Units.fmtLen(gx, 2)); if (isFinite(gy)) parts.push('↕ ' + Units.fmtLen(gy, 2));
      if (parts.length) gapTxt = ' · Abstand ' + parts.join('  ');
    }
    moveLabel.textContent = `X ${Units.fmtLen(dx, 2)}  Y ${Units.fmtLen(dy, 2)}${uSuf}` + gapTxt;
    moveLabel.style.left = e.clientX - r.left + 'px'; moveLabel.style.top = e.clientY - r.top - (mag ? 54 : 30) + 'px';
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
    let dW2 = dl.applyQuaternion(m.q);
    // Magnet: Ursprung des Teils auf Mitte, Mittellinien, Lochmitten der Fläche darunter
    if (!(e.ctrlKey || e.metaKey) && m.topId) {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const sn = hit && hit.id === m.topId && hit.normal && Math.abs(hit.normal.dot(m.normal)) > 0.999 ? Snap.onFace(hit.id, hit.faceIdx, m.o0.clone().add(dW2), { flatOnly: true }) : (Snap.clear(), null);
      if (sn) dW2 = sn.point.clone().sub(m.o0);
    } else Snap.clear();
    const pq = new THREE.Quaternion(); m.PW.decompose(new THREE.Vector3(), pq, new THREE.Vector3());
    const dP = dW2.applyQuaternion(pq.invert());
    m.child.t = { ...m.t0, x: round(m.t0.x + dP.x, 4), y: round(m.t0.y + dP.y, 4), z: round(m.t0.z + dP.z, 4) };
    Joints.constrain(App.doc, m.child.id);
    App.emit('doc'); Handles.rebuild(); liveRebuildChild();
  }
  const liveRebuildChild = throttle(() => { App.rebuild(); App.refreshSelectionVisuals(); }, 120);
  function onUp(e) {
    if (e.pointerType === 'touch') {
      activeTouches.delete(e.pointerId);
      clearLongPress();
      if (touchMulti) {
        if (activeTouches.size === 0) touchMulti = false;
        down = null; Viewer.controls.enabled = true;
        return;
      }
    }
    if (down && down.kbd) return;   // Wert wird gerade getippt
    if (down && down.band) {
      const b = band; band = null; down = null; Viewer.controls.enabled = true;
      if (b) { b.el.remove(); if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > 4) bandSelect(b.x, b.y, e.clientX, e.clientY); }
      return;
    }
    if (down && down.handle) {
      if (down.touch && down.id !== e.pointerId) return;
      Handles.end(); down = null; Viewer.controls.enabled = true; return;
    }
    if (moving) {
      const m = moving; moving = null;
      const dock = m.dock || null;
      if (moveLabel) { moveLabel.remove(); moveLabel = null; }
      if (typeof Joints !== 'undefined' && Joints.clearDragVis) Joints.clearDragVis();
      if (Snap.endDockDrag) Snap.endDockDrag();
      Snap.clear();
      Viewer.canvas.style.cursor = '';
      if (dock && typeof Joints !== 'undefined' && Joints.onDockDrop) {
        const sp = Viewer.toScreen(dock.target.p);
        const rc = Viewer.canvas.getBoundingClientRect();
        const pt = { x: rc.left + sp.x, y: rc.top + sp.y };
        const isSimple = typeof ViewPrefs !== 'undefined' && ViewPrefs.simple;
        if (isSimple && Joints.canConnect && Joints.canConnect(dock.target.id, dock.source.id).ok) {
          Joints.onDockDrop(dock, pt, { before: m.before });
        } else {
          if (App.snapshot() !== m.before) { App.pushUndo('Eingerastet', m.before); App.touched(); }
          Joints.onDockDrop(dock, pt);
        }
      } else {
        if (App.snapshot() !== m.before) { App.pushUndo(m.joint ? 'Gelenk bewegt' : (m.ids && m.ids.length > 1 ? 'Objekte verschoben' : 'Verschoben'), m.before); App.touched(); }
        if (m.child) App.refreshSelectionVisuals();
      }
      down = null; Viewer.controls.enabled = true; return;
    }
    if (down && !down.handle) {
      const tol = down.touch ? 10 : 4;
      const moved = down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > tol;
      if (!moved && e.target === Viewer.canvas) { if (e.altKey && !down.shift && !App.ctx) selectBehind(e.clientX, e.clientY); else clickSelect(down.hit, down.shift, e.clientX, e.clientY); }
      down = null;
    }
    Viewer.controls.enabled = true;
  }
  function onCancel(e) {
    if (e.pointerType === 'touch') {
      activeTouches.delete(e.pointerId);
      if (activeTouches.size === 0) touchMulti = false;
    }
    clearLongPress();
    if (band) { band.el.remove(); band = null; }
    if (down && down.handle) Handles.end();
    if (moving) {
      moving = null;
      if (moveLabel) { moveLabel.remove(); moveLabel = null; }
      if (typeof Joints !== 'undefined' && Joints.clearDragVis) Joints.clearDragVis();
      if (Snap.endDockDrag) Snap.endDockDrag();
      Snap.clear();
      Viewer.canvas.style.cursor = '';
    }
    down = null;
    Viewer.controls.enabled = true;
  }
  // Rahmen-Auswahl: von links nach rechts nur Teile ganz im Rahmen, von rechts nach links alles, was er berührt
  function bandSelect(x1, y1, x2, y2) {
    const cross = x2 < x1, L = Math.min(x1, x2), R = Math.max(x1, x2), T = Math.min(y1, y2), B = Math.max(y1, y2);
    const ids = [];
    for (const it of App.doc.items) {
      if (it.hidden || App.mergedInto(it.id)) continue;
      const box = Actions.worldBox(it.id); if (!box) continue;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let i = 0; i < 8; i++) { const p = Viewer.toScreen(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)); minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
      const r = Viewer.canvas.getBoundingClientRect(); minx += r.left; maxx += r.left; miny += r.top; maxy += r.top;
      const inside = minx >= L && maxx <= R && miny >= T && maxy <= B;
      const touch = maxx >= L && minx <= R && maxy >= T && miny <= B;
      if (cross ? touch : inside) ids.push(it.id);
    }
    App.select(ids, { additive: false });
    UI.toast(ids.length ? `${ids.length} ${ids.length === 1 ? 'Teil' : 'Teile'} gewählt (${cross ? 'alles, was der Rahmen berührt' : 'nur Teile ganz im Rahmen'}).` : 'Im Rahmen liegt kein Teil.', { icon: 'pointer', ms: 2200 });
    return ids;
  }
  // Auswahl speichern und wieder wählen (BE-07): benannte Sätze von Teilen im Projekt
  async function saveSelection(name) {
    const ids = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    if (!ids.length) { UI.toast('Wähl zuerst die Teile aus.', { icon: 'info' }); return null; }
    const nm = name || (await UI.prompt('Auswahl speichern', 'Name der Auswahl', `Auswahl ${(App.doc.selSets || []).length + 1}`, 'Speichern'));
    if (!nm || !nm.trim()) return null;
    const s = { id: uid('ss'), name: nm.trim(), ids };
    App.change(`Auswahl „${s.name}“ gespeichert`, (doc) => { doc.selSets = (doc.selSets || []).filter((x) => x.name !== s.name); doc.selSets.push(s); });
    UI.toast(`„${s.name}“ gespeichert (${ids.length} ${ids.length === 1 ? 'Teil' : 'Teile'}) – Rechtsklick ins Leere wählt sie wieder.`, { icon: 'check' });
    return s;
  }
  function useSelection(id) {
    const s = (App.doc.selSets || []).find((x) => x.id === id); if (!s) return 0;
    const ids = s.ids.filter((x) => Model.find(App.doc, x));
    App.select(ids);
    if (ids.length < s.ids.length) UI.toast(`${s.ids.length - ids.length} Teile dieser Auswahl gibt es nicht mehr.`, { icon: 'info' });
    return ids.length;
  }
  // „Wähle das dahinter“: Teile, die unter der Maus hinter dem vorderen liegen (höchstens vier)
  function behindItems(cx, cy, frontTop) {
    const seen = new Set([frontTop]), out = [];
    for (const x of Viewer.pickAll(cx, cy)) {
      const t = Model.topOf(App.doc, x.id); if (!t || seen.has(t.id) || App.mergedInto(t.id)) continue;
      seen.add(t.id);
      out.push({ icon: 'pointer', label: T('menu.ctx.behind', { name: Model.label(t) }), id: 'cm-behind-' + out.length, run: () => App.select([t.id]) });
      if (out.length >= 4) break;
    }
    return out.length ? ['-', ...out] : [];
  }
  function selectBehind(cx, cy) {
    // nächstes Teil hinter dem gewählten an dieser Stelle; am Ende wieder das vordere
    const tops = []; for (const x of Viewer.pickAll(cx, cy)) { const t = Model.topOf(App.doc, x.id); if (t && !tops.includes(t.id) && !App.mergedInto(t.id)) tops.push(t.id); }
    if (!tops.length) return null;
    const cur = App.sel.length === 1 ? (Model.topOf(App.doc, App.sel[0]) || {}).id : null;
    const i = tops.indexOf(cur), next = tops[(i + 1) % tops.length];
    App.select([next]);
    if (tops.length > 1) UI.toast(`Gewählt: „${Model.label(Model.find(App.doc, next).item)}“ (${tops.indexOf(next) + 1} von ${tops.length} an dieser Stelle)`, { icon: 'pointer', ms: 2200 });
    return next;
  }
  // Rechtsklick-Menü im Bild
  function contextMenu(cx, cy) {
    const hit = Select.adjust(Viewer.pick(cx, cy, Select.pickOpts()));
    const top = hit ? Model.topOf(App.doc, hit.id) : null;
    const anchor = h('div', { style: { position: 'fixed', left: cx + 'px', top: cy + 'px', width: '1px', height: '1px' } }); document.body.append(anchor);
    setTimeout(() => anchor.remove(), 0);
    let items;
    if (top) {
      if (!App.sel.includes(top.id) && !App.sel.includes(hit.id)) App.select([top.id]);
      const it = top, sk = (it.kind === 'extrude' || it.kind === 'revolve' || it.kind === 'sweep' || it.kind === 'rib' || it.kind === 'web' || it.kind === 'emboss' || it.kind === 'splitFace') && it.p && it.p.sketch;
      const isSubAsm = it.kind === 'ref' && typeof Model !== 'undefined' && Model.isSubAssemblyRef && Model.isSubAssemblyRef(it);
      items = [
        ...(it.kind === 'ref' ? [{ icon: 'edit', label: isSubAsm ? T('asm.openSubAsm') : T('asm.openPart'), id: 'cm-ref-open', help: isSubAsm ? 'subAssembly' : 'assemblyDoc', run: () => Comp.openRef(it.id) }] : []),
        ...(typeof Assembly !== 'undefined' && Assembly.canOpenInTab(it, App.doc) ? [{ icon: 'edit', label: T('asm.openInTab'), kbd: 'E', id: 'cm-open-part-tab', help: 'assemblyPartTab', run: () => Assembly.openPartTab(it.id) }] : []),
        ...(typeof Comp !== 'undefined' && Comp.canReplace && Comp.canReplace(it, App.doc) ? [{ icon: 'replace', label: T('asm.replacePart'), id: 'cm-replace-part', help: 'replacePart', run: () => Comp.replacePartDialog(it.id) }] : []),
        ...(sk ? [{ icon: 'edit', label: T('menu.ctx.editSketch'), kbd: 'E', id: 'cm-edit', run: () => Sketch.editItem(it.id) }] : []),
        { icon: it.locked ? 'unlock' : 'lock', label: it.locked ? T('asm.unground') : T('asm.ground'), id: 'cm-ground', help: 'groundPart', run: () => Actions.toggleGround([it.id]) },
        { icon: 'help', label: T('common.explainStep'), id: 'cm-explain', run: () => Explain.dialog(it.id) },
        { icon: 'viewOrtho', label: T('menu.ctx.lookAtFace'), id: 'cm-normal', hidden: !hit || hit.faceIdx == null || !((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).n, run: () => Viewer.lookAtFace(hit.id, hit.faceIdx) },
        { icon: 'export', label: T('menu.ctx.faceDxf'), id: 'cm-facedxf', help: 'faceExport', hidden: !hit || hit.faceIdx == null || !((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).n, run: () => { const r = App.results.get(hit.id); Print.faceTo2D({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }, 'dxf'); } },
        { icon: 'export', label: T('menu.ctx.faceSvg'), id: 'cm-facesvg', help: 'faceExport', hidden: !hit || hit.faceIdx == null || !((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).n, run: () => { const r = App.results.get(hit.id); Print.faceTo2D({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }, 'svg'); } },
        { icon: 'sketch', label: T('menu.ctx.sketchOnFace'), id: 'cm-sketchface', hidden: !hit || hit.faceIdx == null, run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Sketch.startOnFace({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'thread', label: T('menu.ctx.thread'), id: 'cm-thread', help: 'threadFace', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'CYLINDRE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) { const a = h('div', { style: { position: 'fixed', left: cx + 'px', top: cy + 'px', width: '1px', height: '1px' } }); document.body.append(a); Features.threadPop({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }, a, { mode: 'auto' }); setTimeout(() => a.remove(), 0); } } },
        { icon: 'thicken', label: T('common.thicken'), id: 'cm-thicken', help: 'thickenFace', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top), run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.thicken({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'fillet', label: T('ctx.fullFillet'), id: 'cm-fullfillet', help: 'fullFillet', hidden: !hit || hit.faceIdx == null || top.role === 'hole', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.startFullFillet({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'chamfer', label: T('ctx.cornerChamfer'), id: 'cm-cornerchamfer', help: 'cornerChamfer', hidden: !hit || top.role === 'hole', run: () => Features.startCornerChamfer(hit.id) },
        { icon: 'emboss', label: T('common.emboss'), id: 'cm-emboss', help: 'emboss', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top), run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.startEmboss({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'splitFace', label: T('kind.splitFace'), id: 'cm-split-face', help: 'splitFace', hidden: (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) || !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top), run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.startSplitFace({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'dome', label: T('kind.dome'), id: 'cm-dome', help: 'dome', hidden: (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) || !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top) || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.dome({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'vent', label: T('kind.vent'), id: 'cm-vent', help: 'vent', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top) || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.vent({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'fins', label: T('kind.fins'), id: 'cm-fins', help: 'fins', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top) || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.fins({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'patternFill', label: T('kind.fillPattern'), id: 'cm-fill-pattern', help: 'fillPattern', hidden: (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) || !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top) || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.fillPattern({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'web', label: T('kind.web'), id: 'cm-web', help: 'web', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || !App.doc.items.includes(top) || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Features.startWeb({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx] }); } },
        { icon: 'lock', label: T('ctx.fixedJoint'), id: 'cm-fixed-joint', help: 'fixedJoint', hidden: !hit || hit.faceIdx == null || top.role === 'hole' || App.doc.items.filter((x) => !x.hidden && x.role !== 'hole').length < 2 || ((App.results.get(hit.id) || { data: { faces: [] } }).data.faces[hit.faceIdx] || {}).t !== 'PLANE', run: () => { const r = App.results.get(hit.id); if (r && r.data.faces[hit.faceIdx]) Joints.startFixed({ id: hit.id, idx: hit.faceIdx, info: r.data.faces[hit.faceIdx], point: hit.point.toArray() }); } },
        '-',
        { icon: 'copy', label: T('menu.ctx.copyBody'), kbd: Commands.keyLabel('copy'), id: 'cm-copy', help: 'copyBetweenTabs', run: () => Clipboard.copy() },
        { icon: 'copy', label: T('common.duplicate'), kbd: 'Strg D', id: 'cm-dup', run: () => Actions.duplicate() },
        { icon: 'moveStep', label: T('common.moveStep'), id: 'cm-movestep', help: 'moveStep', run: () => Features.transform([top.id]) },
        { icon: 'scaleBody', label: T('common.scaleStep'), id: 'cm-scale', help: 'scaleBody', hidden: !App.doc.items.includes(top), run: () => Features.scale([top.id]) },
        { icon: 'deleteBody', label: T('common.deleteBodyStep'), id: 'cm-deletebody', help: 'deleteBody', hidden: !App.doc.items.includes(top), run: () => Features.deleteBody([top.id]) },
        { icon: 'copy', label: T('menu.ctx.dupLinked'), kbd: 'Strg Umschalt D', id: 'cm-duplink', hidden: it.kind === 'group', run: () => Actions.duplicateLinked() },
        ...(UserLib.canSave(top) ? [{ icon: 'save', label: 'In meine Bibliothek', id: 'cm-userlib', help: 'userLibrary', run: () => UserLib.saveDialog(top.id) }] : []),
        { icon: it.role === 'hole' ? 'solid' : 'hole', label: it.role === 'hole' ? T('menu.ctx.toSolid') : T('menu.ctx.toHole'), kbd: 'H', id: 'cm-role', run: () => Actions.toggleRole() },
        { icon: 'eyeOff', label: T('common.hide'), id: 'cm-hide', run: () => Actions.hideSelected() },
        { icon: 'focusView', label: T('common.isolate'), kbd: 'I', id: 'cm-iso', run: () => Comp.toggleIso(it.id) },
        { icon: 'pointer', label: T('menu.ctx.selectSimilar'), kbd: 'A', id: 'cm-similar', run: () => Select.similar() },
        { icon: 'fit', label: T('menu.ctx.zoomFit'), kbd: 'F', id: 'cm-fit', run: () => Viewer.fit([it.id]) },
        { icon: 'pointer', label: T('menu.ctx.saveSelection'), id: 'cm-selsave', help: 'selSets', run: () => saveSelection() },
        ...behindItems(cx, cy, top.id),
        '-',
        { icon: 'trash', label: T('common.delete'), kbd: 'Entf', id: 'cm-del', run: () => Actions.remove() },
      ];
    } else {
      let hidden = App.doc.items.filter((x) => x.hidden).length;
      Model.walk(App.doc.items, (x) => { if (!x.hidden && x.bodies) hidden += x.bodies.filter((b) => b && b.hidden).length; });
      items = [
        { icon: 'copy', label: T('menu.ctx.pasteBody'), kbd: Commands.keyLabel('paste'), id: 'cm-paste', help: 'copyBetweenTabs', disabled: !Clipboard.hasData(), run: () => Clipboard.paste() },
        { icon: 'eye', label: hidden ? T('menu.ctx.showAllCount', { n: hidden }) : T('menu.ctx.showAll'), id: 'cm-showall', disabled: !hidden, run: () => Actions.showAll() },
        { icon: 'pointer', label: T('menu.ctx.selectAll'), kbd: 'Strg A', id: 'cm-all', run: () => App.select(App.doc.items.filter((x) => !x.hidden && !App.mergedInto(x.id)).map((x) => x.id)) },
        { icon: 'fit', label: T('menu.ctx.fitAll'), kbd: 'F', id: 'cm-fitall', run: () => Viewer.fit() },
        ...(App.doc.selSets || []).map((s, i) => ({ icon: 'pointer', label: T('menu.ctx.selSet', { name: s.name }), id: 'cm-selset-' + i, help: 'selSets', run: () => useSelection(s.id) })),
        { icon: 'undo', label: T('menu.ctx.viewBack'), kbd: 'Umschalt Z', id: 'cm-viewback', disabled: !Viewer.viewHistory, run: () => Viewer.viewBack() },
        '-',
        { icon: 'sketch', label: T('menu.ctx.newSketch'), kbd: 'S', id: 'cm-sketch', run: () => Sketch.chooseAndStart() },
        { icon: 'folder', label: T('asm.insertFromFile'), id: 'cm-insert-file', help: 'insertFromFile', run: () => Comp.insertFromFile() },
        { icon: 'image', label: T('menu.ctx.saveImage'), id: 'cm-image', run: () => Print.imageDialog() },
        ...(Commands.last ? ['-', { icon: 'undo', label: T('menu.ctx.repeat', { label: Commands.last.label }), kbd: 'Leertaste', id: 'cm-repeat', run: () => Commands.repeat() }] : []),
      ];
    }
    UI.menu(anchor, items);
    return items;
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
    if (hit.bodyOnly || hit.faceIdx < 0) { App.select([id]); return; }
    App.select([id], { face: { id, faceIdx: hit.faceIdx, point: hit.point.toArray(), normal: hit.normal ? hit.normal.toArray() : null } });
  }
  // Zahl tippen während des Ziehens
  let lastPtr = { x: 0, y: 0 };
  function onKey(e) {
    if (!/^[0-9.,-]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    let sp = null;
    if (down && down.handle && Handles.dragging) sp = Handles.inputSpec();
    else if (moving && !moving.child) {
      const m = moving;
      if (m.joint) {
        const j = m.joint, dragOpts = j.reverse ? { reverse: true, snap: j.revSnap } : undefined;
        const cur = Joints.stateOf(Joints.list.find((x) => x.id === j.id));
        if (j.kind === 'rot') {
          sp = { fields: [{ label: 'Winkel', value: cur.ang, unit: '°' }], apply: ([v]) => { Joints.applyDrag(j.id, { ang: v }, dragOpts); finishMove(m); } };
        } else if (j.kind === 'slide') {
          sp = { fields: [{ label: 'Weg', value: cur.ang, unit: 'mm' }], apply: ([v]) => { Joints.applyDrag(j.id, { ang: v }, dragOpts); finishMove(m); } };
        } else if (j.kind === 'cyl') {
          sp = { fields: [{ label: 'Weg', value: cur.pos, unit: 'mm' }, { label: 'Winkel', value: cur.ang, unit: '°' }], apply: ([pos, ang]) => { Joints.applyDrag(j.id, { pos, ang }, dragOpts); finishMove(m); } };
        } else if (j.kind === 'slot') {
          sp = { fields: [{ label: 'Weg', value: cur.pos, unit: 'mm' }], apply: ([pos]) => { Joints.applyDrag(j.id, { pos }, dragOpts); finishMove(m); } };
        } else if (j.kind === 'planar') {
          sp = { fields: [{ label: 'U', value: cur.u, unit: 'mm' }, { label: 'V', value: cur.v, unit: 'mm' }], apply: ([u, v]) => { Joints.applyDrag(j.id, { u, v }, dragOpts); finishMove(m); } };
        } else if (j.kind === 'ball') {
          sp = { fields: [{ label: 'X', value: cur.rx, unit: '°' }, { label: 'Y', value: cur.ry, unit: '°' }, { label: 'Z', value: cur.ang, unit: '°' }], apply: ([rx, ry, ang]) => { Joints.applyDrag(j.id, { rx, ry, ang }, dragOpts); finishMove(m); } };
        }
      } else {
        const it0 = m.ids[0], t0 = m.t0.get(it0.id);
        sp = { fields: [{ label: 'X', value: round(it0.t.x - t0.x, 4), unit: 'mm' }, { label: 'Y', value: round(it0.t.y - t0.y, 4), unit: 'mm' }],
          apply: ([dx, dy]) => {
            for (const it of m.ids) {
              const t = m.t0.get(it.id); it.t = { ...t, x: round(t.x + dx, 4), y: round(t.y + dy, 4) };
              const constrained = typeof Joints !== 'undefined' && Joints.constrain ? Joints.constrain(App.doc, it.id) : false;
              if (!constrained && m.chains && m.chains.has(it.id)) {
                const ci = m.chains.get(it.id);
                if (ci.chain.entries.length) {
                  const D = Model.worldMatrix(App.doc, it.id).multiply(ci.W0.clone().invert());
                  Joints.applyChainDelta(App.doc, ci.chain, D, { live: true });
                }
              }
            }
            if (typeof Joints !== 'undefined' && Joints.syncFixed) Joints.syncFixed(App.doc, { live: true });
            finishMove(m);
          } };
      }
    }
    if (!sp) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (moveLabel) { moveLabel.remove(); moveLabel = null; }
    if (typeof Joints !== 'undefined' && Joints.clearDragVis) Joints.clearDragVis();
    // Ziehen anhalten, Wert per Tastatur übernehmen
    const handleWas = down && down.handle;
    if (!handleWas && Snap.endDockDrag) Snap.endDockDrag();
    down = { kbd: true }; if (!handleWas) moving = null;
    DragInput.open({ fields: sp.fields, apply: (v) => { sp.apply(v); down = null; Viewer.controls.enabled = true; } }, e.key === ',' ? '0,' : e.key, lastPtr);
  }
  function finishMove(m) {
    if (moveLabel) { moveLabel.remove(); moveLabel = null; }
    if (typeof Joints !== 'undefined' && Joints.clearDragVis) Joints.clearDragVis();
    if (Snap.endDockDrag) Snap.endDockDrag();
    Snap.clear();
    Viewer.canvas.style.cursor = '';
    if (App.snapshot() !== m.before) { App.pushUndo(m.joint ? 'Gelenk bewegt' : (m.ids && m.ids.length > 1 ? 'Objekte verschoben' : 'Verschoben'), m.before); App.touched(); }
    else App.emit('doc');
  }
  function onDbl(e) {
    if (!modelActive()) return;
    const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
    if (!hit) return;
    // Doppelklick auf einen Skizzenkörper: Skizze bearbeiten; in einer Baugruppe: Bauteil im Tab öffnen
    const id = ctxChildAt(hit, e.clientX, e.clientY) || hit.id;
    const f = Model.find(App.doc, id);
    if (f && f.item.kind === 'ref') { Comp.openRef(f.item.id); return; }
    if (f && typeof Assembly !== 'undefined' && Assembly.canOpenInTab(f.item, App.doc)) { Assembly.openPartTab(f.item.id); return; }
    if (f && (f.item.kind === 'extrude' || f.item.kind === 'revolve' || f.item.kind === 'sweep' || f.item.kind === 'rib' || f.item.kind === 'emboss' || f.item.kind === 'splitFace') && f.item.p.sketch && !f.item.locked) { Sketch.editItem(id); return; }
    // Doppelklick auf eine ebene Fläche: gleich darauf zeichnen
    const r = App.results.get(hit.id); const info = r && r.data && r.data.faces && hit.faceIdx >= 0 ? r.data.faces[hit.faceIdx] : null;
    if (info && info.t === 'PLANE' && info.n && App.doc.items.some((x) => x.id === hit.id)) { Sketch.startOnFace({ id: hit.id, idx: hit.faceIdx, info, point: hit.point.toArray(), normal: hit.normal ? hit.normal.toArray() : null }); return; }
    Viewer.fit([hit.id]);
  }
  return { init, bandSelect, contextMenu, selectBehind, saveSelection, useSelection };
})();

