// ================= 3D-Ansicht =================
const Viewer = (() => {
  let renderer, scene, camera, controls, container;
  let needsRender = true;
  const nodes = new Map(); // id -> { obj, mesh, edges, data, role, color }
  const ghosts = new Map();
  let gridMinor = null, gridMajor = null, axes = null;
  const groups = {};
  const raycaster = new THREE.Raycaster();
  const theme = {};
  let hoverFace = null, hoverEdge = null, selFace = null, selEdges = [];
  let camAnim = null;
  const listeners = makeEmitter();

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    theme.ink = g('--ink', '#16202b'); theme.accent = g('--accent', '#0c7a70'); theme.hole = g('--hole', '#d9483f');
    theme.dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light' || document.documentElement.getAttribute('data-theme') === 'dark';
    theme.edge = theme.dark ? '#0b0f13' : '#1c2630';
  }

  // ---------- Kamera: Perspektive oder orthografisch ----------
  // Die Steuerung arbeitet immer mit der Perspektiv-Kamera. Im Ortho-Modus folgt eine
  // orthografische Kamera exakt ihrer Richtung, der Ausschnitt ergibt sich aus dem Abstand.
  let orthoCam = null, ortho = false;
  function orthoHalfH() { return camera.position.distanceTo(controls.target) * Math.tan((camera.fov * Math.PI) / 360); }
  function syncOrtho() {
    const hh = orthoHalfH(), hw = hh * camera.aspect;
    orthoCam.left = -hw; orthoCam.right = hw; orthoCam.top = hh; orthoCam.bottom = -hh;
    const dir = camera.position.clone().sub(controls.target).normalize();
    orthoCam.position.copy(controls.target).addScaledVector(dir, 20000);
    orthoCam.quaternion.copy(camera.quaternion); orthoCam.up.copy(camera.up);
    orthoCam.updateProjectionMatrix(); orthoCam.updateMatrixWorld();
  }
  function cam() { if (ortho) { syncOrtho(); return orthoCam; } return camera; }
  function setOrtho(on) { ortho = !!on; needsRender = true; listeners.emit('camera'); }
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();
  function boxVisible(box) { const c = cam(); c.updateMatrixWorld(); _pm.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); return _fr.intersectsBox(box); }
  function inView(box, margin = 0.08) {
    if (!box || box.isEmpty()) return true;
    const c = cam();
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(c);
      if (p.z > 1 || Math.abs(p.x) > 1 - margin || Math.abs(p.y) > 1 - margin) return false;
    }
    return true;
  }
  // Anteil der Bildhöhe, den eine Box auf dem Bildschirm einnimmt
  function screenFraction(box) {
    if (!box || box.isEmpty()) return 0;
    const c = cam();
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(c);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return Math.max((y1 - y0) / 2, (x1 - x0) / 2);
  }

  // ---------- Raster auf der XY-Ebene ----------
  // Feste Weite (z. B. 1 mm) oder automatisch: passt sich beim Zoomen in Zehnerschritten an.
  const view = { grid: 'auto', gridOn: true, planes: true, axes: true };
  let gridStep = 10;
  function autoStep() {
    const d = camera.position.distanceTo(controls.target);
    return Math.pow(10, Math.round(Math.log10(Math.max(0.05, d / 45))));
  }
  // Linien werden in kurze Stücke geteilt: Grafiktreiber verwerfen sonst manchmal ganze Linien,
  // die hinter der Kamera vorbeilaufen (dann fehlen genau die nahen Rasterlinien).
  let gridCenter = [0, 0], gridHalf = 600;
  function pushSplit(arr, a, b, piece) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const k = Math.max(1, Math.ceil(L / piece));
    for (let i = 0; i < k; i++) {
      const t0 = i / k, t1 = (i + 1) / k;
      arr.push(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1);
    }
  }
  function buildGrid(step) {
    gridStep = step;
    for (const g of [gridMinor, gridMajor]) if (g) { groups.ground.remove(g); g.geometry.dispose(); g.material.dispose(); }
    const n = Math.min(250, Math.max(50, Math.ceil(600 / step)));   // Linien je Richtung und Seite
    const S = n * step, M = step * 10, piece = M;
    // Raster folgt dem Blickpunkt (auf ganze Hauptlinien gerundet), damit es nie „zu Ende“ ist
    const t = controls ? controls.target : { x: 0, y: 0 };
    const cx = Math.round(t.x / M) * M, cy = Math.round(t.y / M) * M;
    gridCenter = [cx, cy]; gridHalf = S;
    const minor = [], major = [];
    for (let i = -n; i <= n; i++) {
      const vx = cx + i * step, vy = cy + i * step;
      const ix = Math.round(vx / step), iy = Math.round(vy / step);
      if (ix !== 0) pushSplit(ix % 10 === 0 ? major : minor, [vx, cy - S, 0], [vx, cy + S, 0], piece);   // die Achsen zeichnen die Nulllinien
      if (iy !== 0) pushSplit(iy % 10 === 0 ? major : minor, [cx - S, vy, 0], [cx + S, vy, 0], piece);
    }
    const lg = (arr) => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g2; };
    const col = theme.dark ? 0xa9b8c6 : 0x4d5d6d;
    gridMinor = new THREE.LineSegments(lg(minor), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false }));
    gridMajor = new THREE.LineSegments(lg(major), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.26, depthWrite: false }));
    gridMinor.renderOrder = gridMajor.renderOrder = -2;
    gridMinor.visible = gridMajor.visible = view.gridOn;
    groups.ground.add(gridMinor, gridMajor);
    buildAxes(Math.max(S + Math.hypot(cx, cy), 50), M);
    needsRender = true;
    listeners.emit('grid', step);
  }
  function buildAxes(S, piece) {
    if (axes) { groups.ground.remove(axes); axes.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const mk = (color, a, b, op) => { const arr = []; pushSplit(arr, a, b, piece); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); };
    axes = new THREE.Group();
    axes.add(mk(0xd24a3c, [0, 0, 0], [S, 0, 0], 0.85), mk(0xd24a3c, [-S, 0, 0], [0, 0, 0], 0.35),
      mk(0x3a9a3f, [0, 0, 0], [0, S, 0], 0.85), mk(0x3a9a3f, [0, -S, 0], [0, 0, 0], 0.35),
      mk(0x3067d0, [0, 0, 0], [0, 0, S], 0.85), mk(0x3067d0, [0, 0, -S], [0, 0, 0], 0.35));
    axes.renderOrder = -1; axes.visible = view.axes;
    groups.ground.add(axes);
  }
  // ---------- Ursprungsebenen XY, XZ, YZ ----------
  // Größe folgt dem Zoom, damit sie immer gut sichtbar, aber nie im Weg sind.
  const planeObjs = {};
  function buildOrigin() {
    const defs = { XY: [0x3067d0, [0, 0, 0]], XZ: [0x3a9a3f, [Math.PI / 2, 0, 0]], YZ: [0xd24a3c, [0, Math.PI / 2, 0]] };
    for (const [k, [color, rot]] of Object.entries(defs)) {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, -.5, 0, .5, .5, 0, .5, .5, 0, -.5, .5, 0, -.5, .5, 0, -.5, -.5, 0], 3));
      const edge = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
      g.add(fill, edge); g.rotation.set(...rot); g.renderOrder = -1; fill.renderOrder = edge.renderOrder = -1;
      g.userData.originPlane = k; g.visible = view.planes;
      groups.origin.add(g); planeObjs[k] = g;
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: theme.dark ? 0xe8eef4 : 0x1c2630 }));
    dot.userData.originDot = true; groups.origin.add(dot);
  }
  function updateViewAids() {
    const dist = camera.position.distanceTo(controls.target);
    // Nah- und Fernebene mitführen: erlaubt tiefes Hineinzoomen ohne Flimmern
    const nr = clamp(dist * 0.01, 0.002, 2), fr = dist * 60 + 8000;
    if (Math.abs(camera.near - nr) > nr * 0.2 || Math.abs(camera.far - fr) > fr * 0.2) { camera.near = nr; camera.far = fr; camera.updateProjectionMatrix(); }
    if (view.grid === 'auto') { const st = autoStep(); if (st !== gridStep) buildGrid(st); }
    const tg = controls.target;
    if (Math.abs(tg.x - gridCenter[0]) > gridHalf * 0.3 || Math.abs(tg.y - gridCenter[1]) > gridHalf * 0.3) buildGrid(gridStep);
    // Raster blendet weich aus, wenn die Linien zu dicht werden
    const px = (gridStep / (2 * orthoHalfH())) * (container.clientHeight || 1);
    if (gridMinor) gridMinor.material.opacity = clamp((px - 4) / 24, 0, 1) * (theme.dark ? 0.16 : 0.24);
    if (gridMajor) gridMajor.material.opacity = theme.dark ? 0.3 : 0.42;
    const size = clamp(dist * 0.09, 0.3, 3000);
    for (const g of Object.values(planeObjs)) {
      const k = g.userData.originPlane;
      g.scale.set(size, size, size);
      // Ebene sitzt im positiven Quadranten, wie in Fusion
      g.position.set(k === 'YZ' ? 0 : size / 2, k === 'XZ' ? 0 : size / 2, k === 'XY' ? 0 : size / 2);
    }
    for (const o of groups.origin.children) if (o.userData.originDot) o.scale.setScalar(Math.max(0.02, dist * 0.004));
  }
  function setViewOptions(opts) {
    Object.assign(view, opts);
    if (view.grid !== 'auto') { const st = +view.grid; if (st !== gridStep) buildGrid(st); }
    else buildGrid(autoStep());
    if (gridMinor) gridMinor.visible = gridMajor.visible = view.gridOn;
    if (axes) axes.visible = view.axes;
    for (const g of Object.values(planeObjs)) g.visible = view.planes;
    needsRender = true;
  }

  function init(el) {
    container = el; readTheme();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.append(renderer.domElement);
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.setAttribute('aria-label', '3D-Ansicht');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.5, 30000);
    camera.up.set(0, 0, 1);
    camera.position.set(170, -250, 190);
    for (const k of ['ground', 'origin', 'nodes', 'ghosts', 'overlay', 'handles', 'sketch']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }
    orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6252, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(0.55, -0.8, 1.25); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8); fill.position.set(-1, 0.7, 0.35); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45); rim.position.set(0.2, 1, -0.6); scene.add(rim);
    // Lichter folgen der Kamera leicht
    camera.add(new THREE.PointLight(0xffffff, 0, 0));
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.14;
    controls.screenSpacePanning = true; controls.zoomToCursor = true;
    controls.rotateSpeed = 0.85; controls.zoomSpeed = 1.1; controls.panSpeed = 0.9;
    controls.minDistance = 0.2; controls.maxDistance = 12000;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.target.set(0, 0, 10);
    controls.addEventListener('change', () => { needsRender = true; listeners.emit('camera'); });
    buildGrid(autoStep()); buildOrigin();
    const ro = new ResizeObserver(resize); ro.observe(el);
    resize();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { readTheme(); buildGrid(gridStep); for (const [id, n] of nodes) styleNode(n); needsRender = true; listeners.emit('theme'); };
    mq.addEventListener ? mq.addEventListener('change', onTheme) : mq.addListener(onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    loop();
  }
  function resize() {
    const w = container.clientWidth || 1, hgt = container.clientHeight || 1;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt; camera.updateProjectionMatrix();
    for (const m of fatMaterials) m.resolution.set(w, hgt);
    needsRender = true; listeners.emit('camera');
  }
  const fatMaterials = new Set();
  function loop() {
    requestAnimationFrame(loop);
    if (camAnim) {
      const t = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.q0, camAnim.q1, e);
      if (camAnim.up0) camera.up.lerpVectors(camAnim.up0, camAnim.up1, e).normalize();
      if (t >= 1) { camAnim = null; }
      needsRender = true; listeners.emit('camera');
    }
    const moved = controls.update();
    if (moved) listeners.emit('camera');
    if (needsRender || moved) {
      needsRender = false;
      updateViewAids();
      listeners.emit('beforeRender');
      renderer.render(scene, cam());
      listeners.emit('afterRender');
    }
  }
  function requestRender() { needsRender = true; }

  // ---------- Objekte ----------
  function makeMaterial(role, color) {
    if (role === 'hole') return new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.hole), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#2f9e91'), roughness: 0.58, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  }
  function styleNode(n) {
    const sel = n.selected, hov = n.hover;
    if (n.mesh.material) n.mesh.material.dispose();
    n.mesh.material = makeMaterial(n.role, n.color);
    if (n.ctxDim) {   // anderes Bauteil, während eines bearbeitet wird
      n.mesh.material.transparent = true; n.mesh.material.opacity = n.role === 'hole' ? 0.06 : 0.16; n.mesh.material.depthWrite = false;
      if (n.edges) { n.edges.material.dispose(); n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.edge), transparent: true, opacity: 0.18 }); }
      n.mesh.renderOrder = 4; needsRender = true; return;
    }
    if (n.role !== 'hole') {
      const em = new THREE.Color(theme.accent);
      n.mesh.material.emissive = em; n.mesh.material.emissiveIntensity = sel ? 0.16 : hov ? 0.07 : 0;
    } else {
      n.mesh.material.opacity = sel ? 0.34 : hov ? 0.28 : n.dim ? 0.1 : 0.2;
    }
    if (n.edges) {
      n.edges.material.dispose();
      if (n.role === 'hole') { n.edges.material = new THREE.LineDashedMaterial({ color: new THREE.Color(theme.hole), dashSize: 1.6, gapSize: 1.2, transparent: true, opacity: sel ? 1 : 0.75, depthTest: true }); n.edges.computeLineDistances(); }
      else n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(sel ? theme.accent : theme.edge), transparent: true, opacity: sel ? 1 : 0.5 });
    }
    n.mesh.renderOrder = n.role === 'hole' ? 3 : 0;
    needsRender = true;
  }
  function setNode(id, data, info) {
    removeNode(id, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(data.triangles, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, makeMaterial(info.role, info.color));
    mesh.userData.nodeId = id;
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(data.lines, 3));
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial());
    edges.userData.nodeId = id;
    const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false;
    obj.matrix.copy(info.matrix); obj.matrixWorldNeedsUpdate = true;
    obj.userData.nodeId = id;
    groups.nodes.add(obj);
    const n = { id, obj, mesh, edges, data, role: info.role, color: info.color, selected: false, hover: false, key: info.key };
    nodes.set(id, n); styleNode(n);
    needsRender = true;
    return n;
  }
  function updateNode(id, info) {
    const n = nodes.get(id); if (!n) return;
    let restyle = false;
    if (info.matrix) { n.obj.matrix.copy(info.matrix); n.obj.matrixWorldNeedsUpdate = true; }
    if (info.role && info.role !== n.role) { n.role = info.role; restyle = true; }
    if (info.color && info.color !== n.color) { n.color = info.color; restyle = true; }
    if (info.selected !== undefined && info.selected !== n.selected) { n.selected = info.selected; restyle = true; }
    if (info.hover !== undefined && info.hover !== n.hover) { n.hover = info.hover; restyle = true; }
    if (info.dim !== undefined && info.dim !== n.dim) { n.dim = info.dim; restyle = true; }
    if (info.ctxDim !== undefined && info.ctxDim !== !!n.ctxDim) { n.ctxDim = info.ctxDim; restyle = true; }
    if (info.visible !== undefined) n.obj.visible = info.visible;
    if (restyle) styleNode(n);
    needsRender = true;
  }
  function removeNode(id, keepMap) {
    const n = nodes.get(id); if (!n) return;
    groups.nodes.remove(n.obj);
    n.mesh.geometry.dispose(); n.mesh.material.dispose(); n.edges.geometry.dispose(); n.edges.material.dispose();
    if (!keepMap) nodes.delete(id);
    if (hoverFace && hoverFace.id === id) clearHover();
    needsRender = true;
  }
  function setGhost(id, data, matrix) {
    removeGhost(id);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(data.triangles, 1));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, depthTest: false }));
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(data.lines, 3));
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: new THREE.Color(theme.accent), depthTest: false, transparent: true, opacity: 0.95 }));
    const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false; obj.matrix.copy(matrix); obj.renderOrder = 9; mesh.renderOrder = 9; edges.renderOrder = 10;
    groups.ghosts.add(obj); ghosts.set(id, { obj, mesh, edges, data });
    needsRender = true;
  }
  function removeGhost(id) {
    const g = ghosts.get(id); if (!g) return;
    groups.ghosts.remove(g.obj); g.mesh.geometry.dispose(); g.mesh.material.dispose(); g.edges.geometry.dispose(); g.edges.material.dispose();
    ghosts.delete(id); needsRender = true;
  }
  function clearGhosts() { for (const id of [...ghosts.keys()]) removeGhost(id); }
  // Unsichtbare Klick-Flächen für die Teile eines Bauteils, das gerade bearbeitet wird
  const proxies = new Map();
  function clearProxies() { for (const m of proxies.values()) m.geometry.dispose(); proxies.clear(); }
  function setProxies(list) {
    clearProxies();
    for (const { id, data, matrix } of list) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(data.triangles, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); mesh.matrixWorld.copy(matrix);
      mesh.userData.proxyId = id; proxies.set(id, mesh);
    }
  }
  function pickProxy(cx, cy) {
    if (!proxies.size) return null;
    setRay(cx, cy);
    const hits = raycaster.intersectObjects([...proxies.values()], false);
    return hits.length ? { id: hits[0].object.userData.proxyId, point: hits[0].point.clone() } : null;
  }

  // ---------- Hervorhebung ----------
  function faceSubGeometry(n, faceIdx) {
    const g = n.data.faceGroups.find((x) => x[2] === faceIdx); if (!g) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', n.mesh.geometry.getAttribute('position'));
    geo.setAttribute('normal', n.mesh.geometry.getAttribute('normal'));
    geo.setIndex(new THREE.BufferAttribute(n.data.triangles.slice(g[0], g[0] + g[1]), 1));
    return geo;
  }
  function edgePositions(n, edgeIdx) {
    const g = n.data.edgeGroups.find((x) => x[2] === edgeIdx); if (!g) return null;
    return n.data.lines.slice(g[0] * 3, (g[0] + g[1]) * 3);
  }
  function makeFat(positions, color, width, opts = {}) {
    const geo = new LineSegmentsGeometry(); geo.setPositions(positions);
    const mat = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity: opts.opacity || 1, depthTest: opts.depthTest !== false, dashed: !!opts.dashed, dashSize: opts.dashSize || 2, gapSize: opts.gapSize || 1.5 });
    mat.resolution.set(container.clientWidth, container.clientHeight); fatMaterials.add(mat);
    const line = new LineSegments2(geo, mat); if (opts.dashed) line.computeLineDistances();
    line.renderOrder = opts.order || 20;
    return line;
  }
  function disposeFat(obj) { if (!obj) return; obj.geometry.dispose(); fatMaterials.delete(obj.material); obj.material.dispose(); }
  function highlightFace(which, id, faceIdx) {
    const cur = which === 'hover' ? hoverFace : selFace;
    if (cur && cur.id === id && cur.faceIdx === faceIdx) return;
    if (cur) { groups.overlay.remove(cur.mesh); cur.mesh.geometry.dispose(); cur.mesh.material.dispose(); }
    let next = null;
    const n = nodes.get(id);
    if (n && faceIdx != null && faceIdx >= 0) {
      const geo = faceSubGeometry(n, faceIdx);
      if (geo) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: which === 'hover' ? 0.18 : 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(n.obj.matrix); mesh.renderOrder = 6;
        groups.overlay.add(mesh); next = { id, faceIdx, mesh };
      }
    }
    if (which === 'hover') hoverFace = next; else selFace = next;
    needsRender = true;
  }
  function highlightEdge(id, edgeIdx) {
    if (hoverEdge && hoverEdge.id === id && hoverEdge.edgeIdx === edgeIdx) return;
    if (hoverEdge) { groups.overlay.remove(hoverEdge.line); disposeFat(hoverEdge.line); hoverEdge = null; }
    const n = nodes.get(id);
    if (n && edgeIdx != null && edgeIdx >= 0) {
      const pos = edgePositions(n, edgeIdx);
      if (pos) { const line = makeFat(pos, theme.accent, 4, { depthTest: false, order: 22 }); line.matrixAutoUpdate = false; line.matrix.copy(n.obj.matrix); groups.overlay.add(line); hoverEdge = { id, edgeIdx, line }; }
    }
    needsRender = true;
  }
  function setSelectedEdges(list) { // [{id, edgeIdx}]
    for (const s of selEdges) { groups.overlay.remove(s.line); disposeFat(s.line); }
    selEdges = [];
    for (const e of list || []) {
      const n = nodes.get(e.id); if (!n) continue;
      const pos = edgePositions(n, e.edgeIdx); if (!pos) continue;
      const line = makeFat(pos, theme.accent, 5, { depthTest: false, order: 21 }); line.matrixAutoUpdate = false; line.matrix.copy(n.obj.matrix);
      groups.overlay.add(line); selEdges.push({ ...e, line });
    }
    needsRender = true;
  }
  function clearHover() { highlightFace('hover', null, null); highlightEdge(null, null); }

  // ---------- Auswahl mit der Maus ----------
  const _ndc = new THREE.Vector2();
  function rect() { return renderer.domElement.getBoundingClientRect(); }
  function setRay(cx, cy) {
    const r = rect();
    _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, cam());
    return raycaster;
  }
  function pick(cx, cy, opts = {}) {
    setRay(cx, cy);
    const meshes = [];
    for (const n of nodes.values()) { if (!n.obj.visible || n.ctxDim) continue; if (opts.solidsOnly && n.role === 'hole') continue; if (opts.exclude && opts.exclude.has(n.id)) continue; meshes.push(n.mesh); }
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      // am Umriss: Kante in der Nähe suchen, auch wenn der Strahl knapp vorbeigeht
      if (opts.noEdges) return null;
      let best = null;
      for (const n of nodes.values()) {
        if (!n.obj.visible || n.ctxDim || (opts.solidsOnly && n.role === 'hole') || (opts.exclude && opts.exclude.has(n.id))) continue;
        const e = edgeNear(n, cx, cy, Infinity, opts.edgePx || 6);
        if (e && (!best || e.px < best.e.px)) best = { n, e };
      }
      if (!best) return null;
      const n = best.n; const g = n.data.edges[best.e.edgeIdx];
      const point = g ? new THREE.Vector3(...g.m).applyMatrix4(n.obj.matrixWorld) : new THREE.Vector3();
      return { id: n.id, point, faceIdx: -1, normal: null, distance: camera.position.distanceTo(point), node: n, edgeIdx: best.e.edgeIdx, edgeDist: best.e.px };
    }
    // Löcher nur dann bevorzugen, wenn kein fester Körper davor liegt
    const hit = hits[0];
    const n = nodes.get(hit.object.userData.nodeId);
    const tri = hit.faceIndex * 3;
    let faceIdx = -1;
    for (const g of n.data.faceGroups) if (tri >= g[0] && tri < g[0] + g[1]) { faceIdx = g[2]; break; }
    const normal = hit.face ? hit.face.normal.clone().transformDirection(n.obj.matrixWorld) : null;
    const res = { id: n.id, point: hit.point.clone(), faceIdx, normal, distance: hit.distance, node: n };
    if (!opts.noEdges) {
      const e = edgeNear(n, cx, cy, hit.distance, opts.edgePx || 5);
      if (e) { res.edgeIdx = e.edgeIdx; res.edgeDist = e.px; }
    }
    return res;
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _onRay = new THREE.Vector3(), _onSeg = new THREE.Vector3();
  function edgeNear(n, cx, cy, hitDist, maxPx = 7) {
    const r = rect(); const lines = n.data.lines; const M = n.obj.matrixWorld;
    const px = cx - r.left, py = cy - r.top;
    let best = null, bd = maxPx;
    const C = cam(); const toS = (v) => { const p = v.clone().project(C); return [(p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height, p.z]; };
    const camPos = camera.position;
    const tol = ortho ? Math.max(0.3, (8 * orthoHalfH()) / (container.clientHeight || 1)) : Math.max(0.3, (isFinite(hitDist) ? hitDist : 0) * 0.004);
    for (const g of n.data.edgeGroups) {
      for (let i = g[0]; i < g[0] + g[1]; i += 2) {
        _a.set(lines[i * 3], lines[i * 3 + 1], lines[i * 3 + 2]).applyMatrix4(M);
        _b.set(lines[i * 3 + 3], lines[i * 3 + 4], lines[i * 3 + 5]).applyMatrix4(M);
        const A = toS(_a), B = toS(_b);
        const dx = B[0] - A[0], dy = B[1] - A[1]; const l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - A[0]) * dx + (py - A[1]) * dy) / l2 : 0; t = clamp(t, 0, 1);
        const d = Math.hypot(px - (A[0] + t * dx), py - (A[1] + t * dy));
        if (d < bd) {
          // Tiefe exakt über den Mausstrahl bestimmen (verdeckte Kanten ausschließen)
          raycaster.ray.distanceSqToSegment(_a, _b, _onRay, _onSeg);
          const depth = _onRay.distanceTo(raycaster.ray.origin);
          if (depth <= hitDist + tol) { bd = d; best = { edgeIdx: g[2], px: d }; }
        }
      }
    }
    return best;
  }
  function pickGhost(cx, cy) {
    setRay(cx, cy);
    const meshes = [...ghosts.entries()].map(([id, g]) => { g.mesh.userData.ghostId = id; g.mesh.updateMatrixWorld(); return g.mesh; });
    if (!meshes.length) return null;
    for (const g of ghosts.values()) g.obj.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? { id: hits[0].object.userData.ghostId, point: hits[0].point.clone() } : null;
  }
  function pickPlane(cx, cy, planeZ = 0) {
    setRay(cx, cy);
    const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(pl, p) ? p : null;
  }
  function rayPlane(cx, cy, point, normal) {
    setRay(cx, cy);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(pl, p) ? p : null;
  }
  function toScreen(v) {
    const r = rect(); const p = v.clone().project(cam());
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, behind: p.z > 1 };
  }
  function pixelSizeAt(point) {
    const hgt = container.clientHeight || 1;
    if (ortho) return (2 * orthoHalfH()) / hgt;
    const d = camera.position.distanceTo(point);
    return (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / hgt;
  }

  // ---------- Kamera ----------
  function sceneBox(ids) {
    const box = new THREE.Box3();
    for (const n of nodes.values()) {
      if (ids && !ids.includes(n.id)) continue;
      if (!n.obj.visible) continue;
      const b = n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix);
      box.union(b);
    }
    return box;
  }
  function emptyBox() { return new THREE.Box3(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 20)); }
  function fit(ids, animate = true) {
    let box = sceneBox(ids);
    if (box.isEmpty()) box = emptyBox();
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(38, box.getSize(new THREE.Vector3()).length() / 2);
    const fov = (camera.fov * Math.PI) / 180;
    const aspectFactor = Math.min(1, camera.aspect);
    const dist = (r / Math.sin(fov / 2)) / Math.max(0.55, aspectFactor) * 1.02;
    const dir = camera.position.clone().sub(controls.target).normalize();
    moveCamera(c.clone().add(dir.multiplyScalar(dist)), c, null, animate);
  }
  function moveCamera(pos, target, up, animate = true) {
    if (!animate) { camera.position.copy(pos); controls.target.copy(target); if (up) camera.up.copy(up); controls.update(); needsRender = true; listeners.emit('camera'); return; }
    camAnim = { t0: performance.now(), dur: 420, p0: camera.position.clone(), p1: pos.clone(), q0: controls.target.clone(), q1: target.clone(), up0: up ? camera.up.clone() : null, up1: up ? up.clone() : null };
  }
  const VIEWDIRS = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, -0.0001, 1], bottom: [0, -0.0001, -1], iso: [0.62, -0.9, 0.7] };
  function setView(name, animate = true) {
    const d = VIEWDIRS[name] || VIEWDIRS.iso;
    let box = sceneBox(); if (box.isEmpty()) box = emptyBox();
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(38, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.05 / Math.max(0.55, Math.min(1, camera.aspect));
    const dir = new THREE.Vector3(...d).normalize();
    moveCamera(c.clone().add(dir.multiplyScalar(dist)), c, new THREE.Vector3(0, 0, 1), animate);
  }
  function lookAtPlane(origin, normal, xDir, size = 80, animate = true) {
    const n = new THREE.Vector3(...normal).normalize();
    const x = new THREE.Vector3(...xDir).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    const o = new THREE.Vector3(...origin);
    const dist = (size / Math.tan((camera.fov * Math.PI) / 360)) * 0.7;
    moveCamera(o.clone().add(n.clone().multiplyScalar(dist)), o, y, animate);
  }
  function saveCamera() { return { p: camera.position.clone(), t: controls.target.clone(), up: camera.up.clone() }; }
  function restoreCamera(s, animate = true) { if (s) moveCamera(s.p, s.t, s.up, animate); }

  // Bild der Szene für Vorschaubilder
  function snapshot(w = 480, hgt = 300) {
    const old = renderer.getSize(new THREE.Vector2());
    renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
    renderer.render(scene, cam());
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setSize(old.x, old.y, false); camera.aspect = old.x / old.y; camera.updateProjectionMatrix(); needsRender = true;
    return url;
  }

  return {
    init, requestRender, setNode, updateNode, removeNode, setGhost, removeGhost, clearGhosts, highlightFace, highlightEdge, setSelectedEdges, clearHover,
    pick, pickGhost, pickProxy, setProxies, clearProxies, pickPlane, rayPlane, inView, screenFraction, setRay, toScreen, pixelSizeAt, fit, setView, lookAtPlane, saveCamera, restoreCamera, moveCamera, setOrtho, setViewOptions, boxVisible, sceneBox, snapshot, makeFat, disposeFat,
    get camera() { return camera; }, get activeCamera() { return cam(); }, get ortho() { return ortho; }, get gridStep() { return gridStep; }, get controls() { return controls; }, get scene() { return scene; }, get groups() { return groups; }, get nodes() { return nodes; }, get canvas() { return renderer.domElement; }, get theme() { return theme; }, get container() { return container; },
    on: listeners.on,
  };
})();

