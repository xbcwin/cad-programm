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
  let hoverFace = null, hoverEdge = null, hoverBody = null, selFace = null, selEdges = [];
  let camAnim = null, camAnimTimer = null, camEmitTimer = null, inLoopCam = false;
  const listeners = makeEmitter();
  // Ansichts-Modi (Sitzung 9, PF-06): Schnittebenen, Kappen, Röntgen, Verschiebung für die Explosionsansicht
  const vis = { clip: null, clips: [], capEnabled: true, xray: false };
  const _off = new THREE.Matrix4();

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    theme.ink = g('--ink', '#16202b'); theme.accent = g('--accent', '#0c7a70'); theme.hole = g('--hole', '#d9483f');
    theme.dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light' || document.documentElement.getAttribute('data-theme') === 'dark';
    theme.edge = theme.dark ? '#0b0f13' : '#1c2630';
    theme.surface = g('--surface', theme.dark ? '#1a2027' : '#ffffff');
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
  function cam() { if (ortho) { syncOrtho(); return orthoCam; } camera.updateMatrixWorld(); return camera; }
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
    renderer.localClippingEnabled = true;
    basePR = renderer.getPixelRatio();
    el.append(renderer.domElement);
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.setAttribute('aria-label', '3D-Ansicht');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.5, 30000);
    camera.up.set(0, 0, 1);
    camera.position.set(170, -250, 190);
    for (const k of ['ground', 'origin', 'datums', 'nodes', 'compare', 'ghosts', 'overlay', 'measures', 'handles', 'sketch']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }
    orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000);
    lights.hemi = new THREE.HemisphereLight(0xffffff, 0x6f6252, 1.55); scene.add(lights.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(0.55, -0.8, 1.25); scene.add(key); scene.add(key.target); lights.key = key;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8); fill.position.set(-1, 0.7, 0.35); scene.add(fill); lights.fill = fill;
    const rim = new THREE.DirectionalLight(0xffffff, 0.45); rim.position.set(0.2, 1, -0.6); scene.add(rim); lights.rim = rim;
    // weiche Schatten: nur das Hauptlicht wirft sie, nur der Boden fängt sie auf
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.6;
    shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false }));
    shadowFloor.receiveShadow = true; shadowFloor.renderOrder = -1; shadowFloor.visible = false; shadowFloor.userData.noPick = true;
    groups.ground.add(shadowFloor);
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
    controls.addEventListener('change', () => { needsRender = true; if (!inLoopCam) listeners.emit('camera'); });
    controls.addEventListener('start', () => { pushCam(true); cancelCamAnim(); });
    buildGrid(autoStep()); buildOrigin();
    applyLook();
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

  // ---------- Aussehen: Studio-Licht, Werkstoff, Schatten, Prüfansicht ----------
  // look: 'studio' (Werkstoff mit Glanz, Umgebung, Schatten) · 'plain' (einfach, matt) · 'clay' / 'chrome' (Prüfansicht)
  const lights = {};
  let shadowFloor = null, envTex = null, envMood = null, pmrem = null;
  const LOOK = { look: 'studio', mood: 'studio', shadows: true, display: 'edges' };
  // Werkstoff → Oberfläche. nat = der Werkstoff hat eine eigene Farbe (Metall, Kohlefaser, Holz, Glas)
  const LOOKS = {
    'CFK': { col: '#25272a', metal: 0, rough: 0.36, clear: 0.9, clearRough: 0.18, nat: true },
    'GFK': { col: '#7a9a8b', metal: 0, rough: 0.42, clear: 0.6, clearRough: 0.25, nat: true },
    'Alu 6061': { col: '#c9ced3', metal: 1, rough: 0.3, nat: true },
    'Alu 7075': { col: '#b9c0c7', metal: 1, rough: 0.34, nat: true },
    'Titan Gr. 5': { col: '#9a9590', metal: 1, rough: 0.4, nat: true },
    'Baustahl': { col: '#71777d', metal: 1, rough: 0.48, nat: true },
    'V2A Edelstahl': { col: '#cdd2d7', metal: 1, rough: 0.2, nat: true },
    'Messing': { col: '#d8b552', metal: 1, rough: 0.28, nat: true },
    'PLA': { rough: 0.42, clear: 0.15 }, 'PETG': { rough: 0.26, clear: 0.45 }, 'ABS': { rough: 0.55 }, 'ASA': { rough: 0.68 },
    'TPU 95A': { rough: 0.75 }, 'PA12': { rough: 0.88 }, 'POM': { rough: 0.38, clear: 0.2 },
    'PC': { col: '#e6f6fb', rough: 0.05, clear: 1, clearRough: 0.05, glass: 0.45, nat: true },
    'Buche': { col: '#c99a6a', rough: 0.72, nat: true, wood: true }, 'Pappel-Sperrholz': { col: '#dcc196', rough: 0.76, nat: true, wood: true },
  };
  const PLASTIC = { rough: 0.45, clear: 0.15 };
  function lookOf(mat) { return (mat && LOOKS[mat]) || PLASTIC; }
  // Licht-Stimmungen als kleiner Raum mit Leuchtflächen – daraus wird die Spiegel-Umgebung
  const MOODS = {
    studio: { wall: 0xb4b8bc, floor: 0x8e9195, panels: [[[0, 0, 9], [8, 8, 0.2], 0xffffff, 9], [[-9, -2, 4], [0.2, 6, 3], 0xffffff, 5], [[9, 3, 3], [0.2, 4, 4], 0xdfe8ff, 3.5], [[0, 9, 5], [10, 0.2, 1.2], 0xffffff, 2.5]] },
    hell: { wall: 0xdadcde, floor: 0xbfc2c5, panels: [[[0, 0, 9], [12, 12, 0.2], 0xffffff, 6], [[-9, 0, 4], [0.2, 10, 6], 0xffffff, 3], [[9, 0, 4], [0.2, 10, 6], 0xffffff, 3]] },
    werkstatt: { wall: 0x8c7b6a, floor: 0x5a5149, panels: [[[-9, -4, 5], [0.2, 7, 5], 0xffe4c2, 8], [[0, 0, 9], [3, 12, 0.2], 0xfff1dd, 4], [[8, 6, 2], [0.2, 3, 2], 0xa9c4ff, 2]] },
  };
  function buildEnv(mood) {
    if (envTex && envMood === mood) return envTex;
    const M = MOODS[mood] || MOODS.studio, sc = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: M.wall, side: THREE.BackSide }));
    room.position.z = 3; sc.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: M.floor })); floor.position.z = -6.9; sc.add(floor);
    for (const [p, s, c, i] of M.panels) { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i) })); m.position.set(...p); sc.add(m); }
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(sc, 0.03);
    if (envTex) envTex.dispose();
    envTex = rt.texture; envMood = mood;
    sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return envTex;
  }
  // Prüfansicht: Ton (zeigt jede Delle) oder Chrom (Streifen zeigen, wie glatt Flächen ineinander laufen)
  const matcaps = {};
  function matcap(kind) {
    if (matcaps[kind]) return matcaps[kind];
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    if (kind === 'chrome') {
      const lg = g.createLinearGradient(0, 0, 0, N);
      [[0, '#f4f6f8'], [0.18, '#8b939c'], [0.3, '#fbfcfd'], [0.46, '#2c3036'], [0.5, '#9aa3ad'], [0.62, '#161a1e'], [0.78, '#cfd5db'], [1, '#30353b']].forEach(([o, col]) => lg.addColorStop(o, col));
      g.fillStyle = lg; g.fillRect(0, 0, N, N);
    } else {
      const rg = g.createRadialGradient(N * 0.36, N * 0.3, N * 0.02, N * 0.5, N * 0.5, N * 0.56);
      [[0, '#fff6ec'], [0.25, '#e0c8b2'], [0.65, '#9c8370'], [0.92, '#4a3d33'], [1, '#2c241e']].forEach(([o, col]) => rg.addColorStop(o, col));
      g.fillStyle = rg; g.fillRect(0, 0, N, N);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; matcaps[kind] = t; return t;
  }
  function applyLook() {
    const st = LOOK.look === 'studio';
    scene.environment = st ? buildEnv(LOOK.mood) : null;
    renderer.toneMapping = st ? THREE.NeutralToneMapping : THREE.NoToneMapping; renderer.toneMappingExposure = st ? 1.05 : 1;
    lights.hemi.intensity = st ? 0.35 : 1.55; lights.key.intensity = st ? 2.1 : 2.1; lights.fill.intensity = st ? 0.25 : 0.8; lights.rim.intensity = st ? 0.35 : 0.45;
    lights.key.castShadow = st && LOOK.shadows;
    fitShadow();
    restyleAll();
  }
  // Schatten-Kamera und Boden an die Teile anpassen (nach jeder Änderung der Teile)
  function fitShadow() {
    const on = LOOK.look === 'studio' && LOOK.shadows && nodes.size > 0;
    shadowFloor.visible = on;
    if (!on) { renderer.shadowMap.needsUpdate = true; needsRender = true; return; }
    const box = new THREE.Box3();
    for (const n of nodes.values()) if (n.role !== 'hole' && n.obj.visible) box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
    if (box.isEmpty()) { shadowFloor.visible = false; return; }
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const z0 = Math.min(0, box.min.z) - 0.05;
    shadowFloor.position.set(c.x, c.y, z0); shadowFloor.scale.set(r * 6, r * 6, 1);
    const L = lights.key, dir = new THREE.Vector3(0.55, -0.8, 1.25).normalize();
    L.target.position.copy(c); L.position.copy(c).addScaledVector(dir, r * 4); L.target.updateMatrixWorld();
    const sc = L.shadow.camera; sc.left = -r * 2.2; sc.right = r * 2.2; sc.top = r * 2.2; sc.bottom = -r * 2.2; sc.near = r * 0.5; sc.far = r * 9; sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true; needsRender = true;
  }
  const fitShadowSoon = debounce(fitShadow, 60);
  function setLook(patch) { Object.assign(LOOK, patch); applyLook(); listeners.emit('viewmode'); }
  // ein Bild in hoher Auflösung (Bild speichern)

  function loop() {
    requestAnimationFrame(loop);
    let camMoved = false;
    if (camAnim) {
      const t = Math.min(1, (performance.now() - camAnim.t0) / camAnim.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.q0, camAnim.q1, e);
      if (camAnim.up0) camera.up.lerpVectors(camAnim.up0, camAnim.up1, e).normalize();
      if (t >= 1) cancelCamAnim();
      needsRender = true; camMoved = true;
    }
    inLoopCam = true;
    const moved = controls.update();
    inLoopCam = false;
    if (camMoved || moved) { camera.updateMatrixWorld(); listeners.emit('camera'); }
    const now = performance.now();
    if (camAnim) lastMotion = now;
    else if (moved) {   // nur echte Bewegung zählt, nicht das lange Ausrollen der Dämpfung
      const d = camera.position.distanceTo(_lastCam.p) / Math.max(1e-6, camera.position.distanceTo(controls.target)) + 2 * (1 - Math.abs(camera.quaternion.dot(_lastCam.q)));
      if (d > 4e-4) lastMotion = now;
    }
    _lastCam.p.copy(camera.position); _lastCam.q.copy(camera.quaternion);
    if (needsRender || moved) {
      needsRender = false;
      updateViewAids();
      listeners.emit('beforeRender');
      const t0 = performance.now();
      renderer.render(scene, cam());
      frameMs = frameMs * 0.7 + (performance.now() - t0) * 0.3;
      listeners.emit('afterRender');
      adaptRes(now);
    } else if (lowRes && now - lastMotion > 220) adaptRes(now);
  }
  // Beim Drehen und Zoomen kurz mit weniger Pixeln zeichnen, wenn ein Bild zu lange braucht;
  // in Ruhe sofort wieder in voller Schärfe.
  let basePR = 1, lowRes = false, frameMs = 0, lastMotion = 0, adaptive = true, slowMs = 24;
  const _lastCam = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  function setPR(r) { const w = container.clientWidth || 1, hgt = container.clientHeight || 1; renderer.setPixelRatio(r); renderer.setSize(w, hgt, false); }
  function adaptRes(now) {
    const moving = now - lastMotion < 200;
    if (adaptive && moving && !lowRes && frameMs > slowMs && basePR > 0.8) { lowRes = true; setPR(Math.max(0.6, basePR * 0.55)); }
    else if (lowRes && (!moving || !adaptive)) { lowRes = false; setPR(basePR); needsRender = true; }
  }
  function setAdaptive(on, ms) { adaptive = !!on; if (ms != null) slowMs = ms; if (!adaptive && lowRes) { lowRes = false; setPR(basePR); needsRender = true; } }
  function requestRender() { needsRender = true; }

  // ---------- Objekte ----------
  function makeMaterial(role, color, look) {
    const clip = vis.clips.length ? vis.clips : null;
    if (role !== 'hole' && (LOOK.look === 'clay' || LOOK.look === 'chrome')) {
      const m = new THREE.MeshMatcapMaterial({ matcap: matcap(LOOK.look), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
      if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, '#9c8370'); }
      return m;
    }
    if (role !== 'hole' && LOOK.look === 'studio') {
      const L = look || PLASTIC; color = L.matCol || color;
      const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color || '#2f9e91'), metalness: L.metal || 0, roughness: L.rough != null ? L.rough : 0.45, clearcoat: L.clear || 0, clearcoatRoughness: L.clearRough != null ? L.clearRough : 0.2, envMapIntensity: L.metal ? 1.15 : L.nat ? 0.55 : 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
      if (L.glass) { m.transparent = true; m.opacity = L.glass; m.depthWrite = false; }
      if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, color); }
      return m;
    }
    if (role === 'hole') return new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.hole), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, clippingPlanes: clip });
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#2f9e91'), roughness: 0.58, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
    if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, color); }
    return m;
  }
  // Schnittfläche: Durch den Schnitt sieht man die Innenseite der Hülle. Die wird als
  // schraffierte Fläche in einem dunkleren Ton gemalt – das sieht aus wie ein voller Querschnitt.
  function capShader(m, color) {
    m.side = THREE.DoubleSide;
    const c = new THREE.Color(color || '#2f9e91').lerp(new THREE.Color('#ffffff'), 0.3).multiplyScalar(0.8);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCap = { value: c };
      sh.fragmentShader = 'uniform vec3 uCap;\n' + sh.fragmentShader.replace(/}\s*$/, '  if (!gl_FrontFacing) { float hh = mod(gl_FragCoord.x + gl_FragCoord.y, 8.0) < 2.0 ? 0.62 : 1.0; gl_FragColor = vec4(uCap * hh, 1.0); }\n}');
    };
    m.customProgramCacheKey = () => 'cap';
  }
  function styleNode(n) {
    const sel = n.selected, hov = n.hover;
    if (n.mesh.material) n.mesh.material.dispose();
    n.mesh.material = makeMaterial(n.role, n.color, n.look);
    n.mesh.castShadow = n.mesh.receiveShadow = n.role !== 'hole';
    applyFaceColors(n);
    applyThreads(n);
    if (n.ctxDim) {   // anderes Bauteil, während eines bearbeitet wird
      const clip = vis.clips.length ? vis.clips : null;
      n.mesh.material.transparent = true; n.mesh.material.opacity = n.role === 'hole' ? 0.06 : 0.16; n.mesh.material.depthWrite = false;
      if (n.edges) { n.edges.material.dispose(); n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.edge), transparent: true, opacity: 0.18, clippingPlanes: clip }); }
      n.mesh.renderOrder = 4; needsRender = true; return;
    }
    if (n.role !== 'hole' && n.mesh.material.isMeshMatcapMaterial) {
      if (sel || hov) n.mesh.material.color.lerp(new THREE.Color(theme.accent), sel ? 0.45 : 0.2);
    } else if (n.role !== 'hole') {
      const em = new THREE.Color(theme.accent);
      n.mesh.material.emissive = em; n.mesh.material.emissiveIntensity = sel ? 0.16 : hov ? 0.07 : 0;
    } else {
      n.mesh.material.opacity = sel ? 0.34 : hov ? 0.28 : n.dim ? 0.1 : 0.2;
    }
    // Durchsichtig je Teil (Eigenschaft des Teils)
    if (n.role !== 'hole' && n.opacity != null && n.opacity < 1) { const mt = n.mesh.material; mt.transparent = true; mt.opacity = Math.max(0.05, n.opacity); mt.depthWrite = false; }
    // Anzeige-Art: nur Flächen, Drahtgitter (nur Kanten) oder mit verdeckten Kanten
    const disp = LOOK.display;
    if (n.role !== 'hole') {
      const mt = n.mesh.material;
      if (disp === 'wire') { mt.transparent = true; mt.opacity = sel ? 0.12 : 0.02; mt.depthWrite = false; mt.colorWrite = !!sel; }
      else if (disp === 'hidden') { mt.transparent = true; mt.opacity = Math.min(mt.opacity, 0.35); mt.depthWrite = false; }
    }
    // Röntgen: Körper wie Milchglas, Kanten auch von hinten sichtbar; das gewählte Teil bleibt kräftig
    const xr = (vis.xray || disp === 'hidden') && n.role !== 'hole';
    if (xr) { const mt = n.mesh.material; mt.transparent = true; mt.opacity = sel ? 0.55 : hov ? 0.3 : 0.18; mt.depthWrite = false; mt.side = THREE.DoubleSide; }
    const clip = vis.clips.length ? vis.clips : null;
    if (n.edges) {
      n.edges.material.dispose();
      if (n.role === 'hole') { n.edges.material = new THREE.LineDashedMaterial({ color: new THREE.Color(theme.hole), dashSize: 1.6, gapSize: 1.2, transparent: true, opacity: sel ? 1 : 0.75, depthTest: !vis.xray, clippingPlanes: clip }); n.edges.computeLineDistances(); }
      else n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(sel ? theme.accent : theme.edge), transparent: true, opacity: sel ? 1 : xr ? 0.42 : 0.5, depthTest: !xr, clippingPlanes: clip });
    }
    n.mesh.renderOrder = n.role === 'hole' ? 3 : xr ? (sel ? 2 : 1) : 0;
    if (n.edges) { n.edges.renderOrder = xr ? 5 : 0; n.edges.visible = disp !== 'shaded' || sel || n.role === 'hole'; if (disp === 'wire' && n.role !== 'hole' && !sel) { n.edges.material.opacity = 0.9; n.edges.material.color = new THREE.Color(theme.edge).lerp(new THREE.Color(n.color || '#2f9e91'), 0.5); } }
    if (disp === 'wire' || disp === 'hidden') n.mesh.castShadow = false;
    if (n.allBodiesHidden) { n.mesh.visible = false; if (n.edges) n.edges.visible = false; }
    else n.mesh.visible = true;
    needsRender = true;
  }
  function applyBodies(n) {
    const eb = n.data && n.data.bodies;
    if (!eb || eb.length < 2) {
      n.hiddenBodies = null; n.bodyColors = null;
      if (n._filtered) {
        n.mesh.geometry.setIndex(new THREE.BufferAttribute(n.data.triangles, 1));
        n.edges.geometry.setAttribute('position', new THREE.BufferAttribute(n.data.lines, 3));
        n.mesh.geometry.computeBoundingBox(); n.mesh.geometry.computeBoundingSphere();
        n.edges.geometry.computeBoundingSphere();
        n._filtered = false;
      }
      n.visFaceGroups = null; n.visEdgeGroups = null; n.visLines = null; n.allBodiesHidden = false;
      return;
    }
    const meta = Model.matchBodies(n.bodies, eb);
    const hiddenBodies = new Set(), bodyColors = new Map();
    for (let bi = 0; bi < eb.length; bi++) {
      const mb = meta[bi];
      if (!mb) continue;
      if (mb.hidden) hiddenBodies.add(bi);
      if (mb.color) bodyColors.set(bi, new THREE.Color(mb.color));
    }
    n.hiddenBodies = hiddenBodies;
    n.bodyColors = bodyColors;
    if (!hiddenBodies.size) {
      if (n._filtered) {
        n.mesh.geometry.setIndex(new THREE.BufferAttribute(n.data.triangles, 1));
        n.edges.geometry.setAttribute('position', new THREE.BufferAttribute(n.data.lines, 3));
        n.mesh.geometry.computeBoundingBox(); n.mesh.geometry.computeBoundingSphere();
        n.edges.geometry.computeBoundingSphere();
        n._filtered = false;
      }
      n.visFaceGroups = null; n.visEdgeGroups = null; n.visLines = null; n.allBodiesHidden = false;
      return;
    }
    const tris = [], visFaceGroups = [];
    for (const [start, count, fi] of n.data.faceGroups || []) {
      if (fi >= 0 && n.data.faceBody && hiddenBodies.has(n.data.faceBody[fi])) continue;
      const newStart = tris.length;
      for (let k = start; k < start + count; k++) tris.push(n.data.triangles[k]);
      visFaceGroups.push([newStart, count, fi]);
    }
    n.visFaceGroups = visFaceGroups;
    n.allBodiesHidden = tris.length === 0;
    n.mesh.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
    const lines = [], visEdgeGroups = [];
    for (const [start, count, ei] of n.data.edgeGroups || []) {
      if (ei >= 0 && n.data.edgeBody && hiddenBodies.has(n.data.edgeBody[ei])) continue;
      const newStart = lines.length / 3;
      for (let k = start; k < start + count; k++) lines.push(n.data.lines[k * 3], n.data.lines[k * 3 + 1], n.data.lines[k * 3 + 2]);
      visEdgeGroups.push([newStart, count, ei]);
    }
    const visLines = new Float32Array(lines);
    n.visEdgeGroups = visEdgeGroups;
    n.visLines = visLines;
    n.edges.geometry.setAttribute('position', new THREE.BufferAttribute(visLines, 3));
    n.edges.geometry.computeBoundingSphere();
    const box = n.mesh.geometry.boundingBox || (n.mesh.geometry.boundingBox = new THREE.Box3());
    box.makeEmpty();
    for (let bi = 0; bi < eb.length; bi++) {
      if (hiddenBodies.has(bi) || !eb[bi].bbox) continue;
      const b = eb[bi].bbox;
      box.expandByPoint(new THREE.Vector3(b[0], b[1], b[2]));
      box.expandByPoint(new THREE.Vector3(b[3], b[4], b[5]));
    }
    if (!n.mesh.geometry.boundingSphere) n.mesh.geometry.boundingSphere = new THREE.Sphere();
    if (box.isEmpty()) n.mesh.geometry.boundingSphere.set(new THREE.Vector3(), 0);
    else box.getBoundingSphere(n.mesh.geometry.boundingSphere);
    n._filtered = true;
    if (selFace && selFace.id === n.id && selFace.faceIdx >= 0 && n.data.faceBody && hiddenBodies.has(n.data.faceBody[selFace.faceIdx])) highlightFace('sel', null, null);
    if (hoverBody && hoverBody.id === n.id && hiddenBodies.has(hoverBody.bodyIdx)) highlightBody(null, null);
  }
  // Farbe je Fläche: Ecken der Fläche bekommen ihre Farbe, der Rest die Farbe des Teils (Vertex-Farben)
  function faceIndexOf(n, fc) {
    let best = -1, bd = Infinity;
    (n.data.faces || []).forEach((f, i) => {
      if (!f.c) return;
      if (fc.n && f.n && (f.n[0] * fc.n[0] + f.n[1] * fc.n[1] + f.n[2] * fc.n[2]) < 0.999) return;
      if (!!fc.n !== !!f.n) return;
      const d = Math.hypot(f.c[0] - fc.c[0], f.c[1] - fc.c[1], f.c[2] - fc.c[2]); if (d < bd) { bd = d; best = i; }
    });
    // ebene Flächen: gleiche Richtung, nächstgelegene Mitte (die Fläche darf wandern); runde Flächen: nur in der Nähe
    const R = n.mesh.geometry.boundingSphere ? n.mesh.geometry.boundingSphere.radius : 10;
    return fc.n || bd <= Math.max(0.5, R * 0.05) ? best : -1;
  }
  function applyFaceColors(n) {
    const g = n.mesh.geometry, m = n.mesh.material;
    const hasFace = !!(n.faceColors && n.faceColors.length && n.data.faceGroups);
    const hasBody = !!(n.bodyColors && n.bodyColors.size && n.data.faceBody && n.data.faceGroups);
    if ((!hasFace && !hasBody) || n.role === 'hole' || !m || m.isMeshMatcapMaterial) { if (g.getAttribute('color')) g.deleteAttribute('color'); if (m) m.vertexColors = false; n.faceIdx = null; return; }
    const base = m.color.clone(), cnt = g.getAttribute('position').count, arr = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { arr[i * 3] = base.r; arr[i * 3 + 1] = base.g; arr[i * 3 + 2] = base.b; }
    const tri = n.data.triangles, map = new Map(); n.faceIdx = [];
    if (hasFace) for (const fc of n.faceColors) { const fi = faceIndexOf(n, fc); n.faceIdx.push(fi); if (fi >= 0) map.set(fi, new THREE.Color(fc.col)); }
    for (const [start, count, fi] of n.data.faceGroups) {
      let c = map.get(fi);
      if (!c && hasBody && fi >= 0) { const bi = n.data.faceBody[fi]; if (bi >= 0) c = n.bodyColors.get(bi); }
      if (!c) continue;
      for (let k = start; k < start + count; k++) { const v = tri[k]; arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    m.vertexColors = true; m.color.set('#ffffff'); m.needsUpdate = true;
  }
  // Kosmetisches Gewinde (KP-20): gestreiftes Zylinder-Overlay direkt auf der runden Fläche, ohne Kern-Neubau
  const threadTextures = {};
  function getThreadTexture(kind) {
    const k = kind === 'int' ? 'int' : 'ext';
    if (threadTextures[k]) return threadTextures[k];
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const cLight = k === 'int' ? '#57b5cc' : '#e6a83a';
    const cDark = k === 'int' ? '#1c4754' : '#734a10';
    ctx.fillStyle = cLight; ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = cDark; ctx.lineWidth = 22;
    for (let y = -64; y <= 128; y += 64) {
      ctx.beginPath(); ctx.moveTo(-8, y + 6); ctx.lineTo(72, y - 6); ctx.stroke();
    }
    ctx.strokeStyle = k === 'int' ? 'rgba(255,255,255,0.22)' : 'rgba(255,244,214,0.26)';
    ctx.lineWidth = 6;
    for (let y = -64; y <= 128; y += 64) {
      ctx.beginPath(); ctx.moveTo(-8, y + 32); ctx.lineTo(72, y + 20); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    threadTextures[k] = tex;
    return tex;
  }
  function cylinderGeomOf(data, faceIdx) {
    const f = data && data.faces && data.faces[faceIdx];
    if (!f || f.t !== 'CYLINDRE' || !Array.isArray(f.axis) || f.axis.length < 6 || !(f.r > 0)) return null;
    const o = [f.axis[0], f.axis[1], f.axis[2]];
    let d = [f.axis[3], f.axis[4], f.axis[5]];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    d = [d[0] / dl, d[1] / dl, d[2] / dl];
    const ax = Math.abs(d[2]) >= Math.abs(d[0]) && Math.abs(d[2]) >= Math.abs(d[1]) ? 2 : Math.abs(d[1]) >= Math.abs(d[0]) ? 1 : 0;
    if (d[ax] < 0) d = [-d[0], -d[1], -d[2]];
    const g = (data.faceGroups || []).find((x) => x[2] === faceIdx);
    let t0 = Infinity, t1 = -Infinity, dotSum = 0;
    if (g && data.vertices && data.normals && data.triangles) {
      const P = data.vertices, N = data.normals, T = data.triangles;
      for (let i = g[0]; i < g[0] + g[1]; i++) {
        const vi = T[i] * 3;
        const vx = P[vi] - o[0], vy = P[vi + 1] - o[1], vz = P[vi + 2] - o[2];
        const t = vx * d[0] + vy * d[1] + vz * d[2];
        if (t < t0) t0 = t; if (t > t1) t1 = t;
        const rx = vx - d[0] * t, ry = vy - d[1] * t, rz = vz - d[2] * t;
        dotSum += N[vi] * rx + N[vi + 1] * ry + N[vi + 2] * rz;
      }
    }
    if (!isFinite(t0) || !isFinite(t1)) { t0 = 0; t1 = 10; }
    return { o, d, r: f.r, c: f.c || o.slice(), t0, t1, faceLen: Math.max(0.1, t1 - t0), kind: dotSum >= 0 ? 'ext' : 'int' };
  }
  function cylinderFaceInfo(id, faceIdx) {
    const n = nodes.get(id);
    return n ? cylinderGeomOf(n.data, faceIdx) : null;
  }
  function threadFaceIndex(n, th) {
    if (!n || !n.data || !n.data.faces || !th) return -1;
    if (!Array.isArray(th.axis) || th.axis.length < 6) return faceIndexOf(n, th);
    const to = th.axis.slice(0, 3), td = th.axis.slice(3, 6);
    const tdl = Math.hypot(td[0], td[1], td[2]) || 1;
    const tdn = [td[0] / tdl, td[1] / tdl, td[2] / tdl];
    const rTol = Math.max(0.5, (th.r || 1) * 0.25);
    const aTol = Math.max(0.5, (th.r || 1) * 0.2);
    let best = -1, bd = Infinity;
    n.data.faces.forEach((f, i) => {
      if (!f || f.t !== 'CYLINDRE' || !Array.isArray(f.axis) || f.axis.length < 6) return;
      if (Math.abs((f.r || 0) - (th.r || 0)) > rTol) return;
      const fd = [f.axis[3], f.axis[4], f.axis[5]];
      const fdl = Math.hypot(fd[0], fd[1], fd[2]) || 1;
      const fdn = [fd[0] / fdl, fd[1] / fdl, fd[2] / fdl];
      if (Math.abs(fdn[0] * tdn[0] + fdn[1] * tdn[1] + fdn[2] * tdn[2]) < 0.99) return;
      const dx = f.axis[0] - to[0], dy = f.axis[1] - to[1], dz = f.axis[2] - to[2];
      const proj = dx * tdn[0] + dy * tdn[1] + dz * tdn[2];
      const perp = Math.hypot(dx - proj * tdn[0], dy - proj * tdn[1], dz - proj * tdn[2]);
      if (perp > aTol) return;
      const dc = f.c && th.c ? Math.hypot(f.c[0] - th.c[0], f.c[1] - th.c[1], f.c[2] - th.c[2]) : perp;
      if (dc < bd) { bd = dc; best = i; }
    });
    return best >= 0 ? best : faceIndexOf(n, th);
  }
  function disposeThreads(n) {
    if (!n || !n.threadGroup) return;
    n.obj.remove(n.threadGroup);
    n.threadGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    n.threadGroup = null;
  }
  function applyThreads(n) {
    disposeThreads(n);
    if (!n.threads || !n.threads.length || n.role === 'hole') return;
    const tg = new THREE.Group();
    tg.userData.threadGroup = true;
    const clip = vis.clips.length ? vis.clips : null;
    const op = n.ctxDim ? 0.14 : (LOOK.display === 'wire' ? 0.25 : 0.82);
    for (const th of n.threads) {
      const fi = threadFaceIndex(n, th);
      if (fi >= 0 && n.hiddenBodies && n.hiddenBodies.size && n.data.faceBody && n.hiddenBodies.has(n.data.faceBody[fi])) continue;
      const g = fi >= 0 ? cylinderGeomOf(n.data, fi) : (Array.isArray(th.axis) && th.axis.length >= 6 ? {
        o: th.axis.slice(0, 3), d: th.axis.slice(3, 6), r: th.r || 3, c: th.c || [0, 0, 0],
        t0: th.t0 ?? 0, t1: th.t1 ?? 10, faceLen: Math.max(0.1, (th.t1 ?? 10) - (th.t0 ?? 0)), kind: th.kind || 'ext',
      } : null);
      if (!g) continue;
      const kind = th.kind || g.kind || 'ext';
      const L = clamp(Number(th.length) || g.faceLen, 0.2, g.faceLen);
      const s0 = th.from === 'bottom' ? g.t0 : g.t1 - L;
      const s1 = th.from === 'bottom' ? g.t0 + L : g.t1;
      const rVis = kind === 'int' ? Math.max(0.05, g.r - Math.max(0.02, g.r * 0.004)) : g.r + Math.max(0.02, g.r * 0.004);
      const spec = typeof THREAD_MAP !== 'undefined' ? THREAD_MAP[th.size] : null;
      const pitch = spec ? spec.pitch : 1;
      const tex = getThreadTexture(kind).clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, Math.max(1, Math.min(80, L / pitch)));
      const geo = new THREE.CylinderGeometry(rVis, rVis, Math.max(0.1, s1 - s0), 40, 1, true);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, opacity: op, roughness: 0.45, metalness: 0.25,
        side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, clippingPlanes: clip,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.cosmeticThread = th.id;
      mesh.renderOrder = 2;
      const dVec = new THREE.Vector3(...g.d).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dVec);
      mesh.position.set(...g.o).addScaledVector(dVec, (s0 + s1) / 2);
      // Feine Ringlinien an Anfang und Ende der Gewinde-Markierung
      const rRing = rVis * (kind === 'int' ? 0.998 : 1.002);
      const rPts = [];
      for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; rPts.push(Math.cos(a) * rRing, 0, Math.sin(a) * rRing); }
      const halfL = Math.max(0.1, s1 - s0) / 2;
      for (const yOff of [-halfL, halfL]) {
        const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rPts, 3));
        const rm = new THREE.LineBasicMaterial({ color: new THREE.Color(kind === 'int' ? '#1c4754' : '#6e4710'), transparent: true, opacity: n.ctxDim ? 0.18 : 0.75, clippingPlanes: clip });
        const loop = new THREE.LineLoop(rg, rm); loop.position.y = yOff; loop.renderOrder = 3;
        mesh.add(loop);
      }
      tg.add(mesh);
    }
    if (tg.children.length) { n.threadGroup = tg; n.obj.add(tg); }
  }
  function restyleAll() { for (const n of nodes.values()) styleNode(n); }
  function setClip(planes, opts = {}) {
    const arr = !planes ? [] : Array.isArray(planes) ? planes.filter(Boolean) : [planes];
    const cap = opts.cap !== undefined ? !!opts.cap : true;
    const sameList = arr.length === vis.clips.length && arr.every((p, i) => p === vis.clips[i]) && cap === vis.capEnabled;
    vis.clips = arr;
    vis.clip = (opts.primary && arr.includes(opts.primary)) ? opts.primary : (arr[0] || null);
    vis.capEnabled = cap;
    if (!sameList) restyleAll();
    else needsRender = true;
    listeners.emit('viewmode');
  }
  function setXray(on) { vis.xray = !!on; restyleAll(); listeners.emit('viewmode'); }
  // Anzeige-Verschiebung je Teil (Explosionsansicht) – das Modell selbst bleibt unverändert
  function placeNode(n) {
    if (n.off && n.off.lengthSq() > 1e-12) { _off.makeTranslation(n.off.x, n.off.y, n.off.z); n.obj.matrix.multiplyMatrices(_off, n.base); }
    else n.obj.matrix.copy(n.base);
    n.obj.matrixWorldNeedsUpdate = true;
    // Hervorhebungen dieses Teils wandern mit
    for (const f of [hoverFace, selFace]) if (f && f.id === n.id) f.mesh.matrix.copy(n.obj.matrix);
    if (hoverBody && hoverBody.id === n.id) hoverBody.mesh.matrix.copy(n.obj.matrix);
    if (hoverEdge && hoverEdge.id === n.id) hoverEdge.line.matrix.copy(n.obj.matrix);
    for (const e of selEdges) if (e.id === n.id) e.line.matrix.copy(n.obj.matrix);
  }
  function setOffsets(map) {
    for (const [id, n] of nodes) { const v = map && map.get(id); n.off = v ? v.clone() : null; placeNode(n); }
    needsRender = true; listeners.emit('camera');
  }
  function baseBox(id) { const n = nodes.get(id); return n ? n.mesh.geometry.boundingBox.clone().applyMatrix4(n.base) : null; }
  function setNode(id, data, info) {
    removeNode(id, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(data.triangles, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, makeMaterial(info.role, info.color, info.look));
    mesh.userData.nodeId = id;
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(data.lines, 3));
    const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial());
    edges.userData.nodeId = id;
    const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false;
    obj.userData.nodeId = id;
    groups.nodes.add(obj);
    const old = nodes.get(id);
    const n = { id, obj, mesh, edges, data, role: info.role, color: info.color, look: info.look || null, opacity: info.opacity ?? null, faceColors: info.faceColors || null, threads: info.threads || null, bodies: info.bodies || null, hiddenBodies: null, bodyColors: null, visFaceGroups: null, visEdgeGroups: null, visLines: null, allBodiesHidden: false, _filtered: false, selected: false, hover: false, key: info.key, base: info.matrix.clone(), off: old && old.off ? old.off : null };
    placeNode(n);
    nodes.set(id, n); applyBodies(n); styleNode(n);
    fitShadowSoon();
    needsRender = true;
    return n;
  }
  function updateNode(id, info) {
    const n = nodes.get(id); if (!n) return;
    let restyle = false;
    if (info.matrix) { n.base.copy(info.matrix); placeNode(n); }
    if (info.role && info.role !== n.role) { n.role = info.role; restyle = true; }
    if (info.color && info.color !== n.color) { n.color = info.color; restyle = true; }
    if (info.look !== undefined && JSON.stringify(info.look) !== JSON.stringify(n.look)) { n.look = info.look; restyle = true; }
    if (info.opacity !== undefined && info.opacity !== n.opacity) { n.opacity = info.opacity; restyle = true; }
    if (info.faceColors !== undefined && JSON.stringify(info.faceColors) !== JSON.stringify(n.faceColors)) { n.faceColors = info.faceColors; restyle = true; }
    if (info.threads !== undefined && JSON.stringify(info.threads) !== JSON.stringify(n.threads)) { n.threads = info.threads; restyle = true; }
    if (info.bodies !== undefined && JSON.stringify(info.bodies) !== JSON.stringify(n.bodies)) { n.bodies = info.bodies; applyBodies(n); restyle = true; fitShadowSoon(); }
    if (info.matrix) fitShadowSoon();
    if (info.selected !== undefined && info.selected !== n.selected) { n.selected = info.selected; restyle = true; }
    if (info.hover !== undefined && info.hover !== n.hover) { n.hover = info.hover; restyle = true; }
    if (info.dim !== undefined && info.dim !== n.dim) { n.dim = info.dim; restyle = true; }
    if (info.ctxDim !== undefined && info.ctxDim !== !!n.ctxDim) { n.ctxDim = info.ctxDim; restyle = true; }
    if (info.visible !== undefined && info.visible !== n.obj.visible) { n.obj.visible = info.visible; fitShadowSoon(); }
    if (restyle) styleNode(n);
    needsRender = true;
  }
  function removeNode(id, keepMap) {
    const n = nodes.get(id); if (!n) return;
    disposeThreads(n);
    groups.nodes.remove(n.obj);
    n.mesh.geometry.dispose(); n.mesh.material.dispose(); n.edges.geometry.dispose(); n.edges.material.dispose();
    if (!keepMap) { nodes.delete(id); fitShadowSoon(); }
    if (hoverFace && hoverFace.id === id) clearHover();
    if (hoverBody && hoverBody.id === id) highlightBody(null, null);
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
  // eine Fläche als eingefärbte Überlagerung (z. B. beim Messen)
  function faceOverlay(id, faceIdx, color, opacity = 0.35) {
    const n = nodes.get(id); if (!n) return null;
    const geo = faceSubGeometry(n, faceIdx); if (!geo) return null;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color || theme.accent), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(n.obj.matrix); mesh.renderOrder = 7;
    return mesh;
  }
  // Flächeninhalt einer Fläche aus dem Netz (bei ebenen Flächen mit geraden Kanten exakt)
  function faceArea(id, faceIdx) {
    const n = nodes.get(id); if (!n) return 0;
    const g = n.data.faceGroups.find((x) => x[2] === faceIdx); if (!g) return 0;
    const P = n.data.vertices, T = n.data.triangles; let a = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let i = g[0]; i < g[0] + g[1]; i += 3) {
      A.fromArray(P, T[i] * 3); B.fromArray(P, T[i + 1] * 3); C.fromArray(P, T[i + 2] * 3);
      a += B.sub(A).cross(C.sub(A)).length() / 2;
    }
    return a;
  }
  // ---------- Wandstärke (PF-02, PF-07) ----------
  // Dreiecke eines Teils in Weltlage, dazu ein einfaches Raster, damit kurze Strahlen nur wenige Dreiecke prüfen
  function worldTris(n) {
    n.obj.updateMatrixWorld(true);
    const P = n.mesh.geometry.getAttribute('position').array, T = n.mesh.geometry.index ? n.mesh.geometry.index.array : n.data.triangles, M = n.mesh.matrixWorld, nt = Math.floor(T.length / 3);
    const W = new Float32Array(nt * 9), v = new THREE.Vector3();
    for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) { v.fromArray(P, T[i * 3 + k] * 3).applyMatrix4(M); W[i * 9 + k * 3] = v.x; W[i * 9 + k * 3 + 1] = v.y; W[i * 9 + k * 3 + 2] = v.z; }
    return W;
  }
  function triGrid(W, cell) {
    const nt = W.length / 9; let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    for (let i = 0; i < W.length; i += 3) { x0 = Math.min(x0, W[i]); y0 = Math.min(y0, W[i + 1]); z0 = Math.min(z0, W[i + 2]); }
    const map = new Map(), key = (i, j, k) => i + ',' + j + ',' + k, ci = (v, o) => Math.floor((v - o) / cell);
    for (let t = 0; t < nt; t++) {
      const o = t * 9, xs = [W[o], W[o + 3], W[o + 6]], ys = [W[o + 1], W[o + 4], W[o + 7]], zs = [W[o + 2], W[o + 5], W[o + 8]];
      for (let i = ci(Math.min(...xs), x0); i <= ci(Math.max(...xs), x0); i++) for (let j = ci(Math.min(...ys), y0); j <= ci(Math.max(...ys), y0); j++) for (let k = ci(Math.min(...zs), z0); k <= ci(Math.max(...zs), z0); k++) {
        const kk = key(i, j, k); let l = map.get(kk); if (!l) map.set(kk, (l = [])); l.push(t);
      }
    }
    return { map, x0, y0, z0, cell, key, ci, stamp: new Int32Array(nt).fill(-1) };
  }
  // Strahl (ohne Rückseiten-Ausschluss) gegen Dreieck t: Abstand oder Infinity (Möller–Trumbore)
  function rayTri(W, t, o, d) {
    const k = t * 9, ax = W[k], ay = W[k + 1], az = W[k + 2];
    const e1x = W[k + 3] - ax, e1y = W[k + 4] - ay, e1z = W[k + 5] - az, e2x = W[k + 6] - ax, e2y = W[k + 7] - ay, e2z = W[k + 8] - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
    const u = (sx * px + sy * py + sz * pz) * inv; if (u < -1e-7 || u > 1 + 1e-7) return Infinity;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const vv = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (vv < -1e-7 || u + vv > 1 + 1e-7) return Infinity;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; return tt > 1e-5 ? tt : Infinity;
  }
  // Dicke an einem Punkt der Oberfläche: Strahl nach innen bis zur nächsten Fläche desselben Teils
  function wallAt(id, point, normal) {
    const n = nodes.get(id); if (!n || !n.data || !n.data.triangles) return null;
    const W = worldTris(n), nn = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    const o = [point.x - nn.x * 1e-4, point.y - nn.y * 1e-4, point.z - nn.z * 1e-4], d = [-nn.x, -nn.y, -nn.z];
    let best = Infinity; for (let t = 0; t < W.length / 9; t++) { const r = rayTri(W, t, o, d); if (r < best) best = r; }
    return isFinite(best) ? best + 1e-4 : null;
  }
  // Alle Stellen dünner als „limit“: Dreiecke (Weltlage) zum Einfärben und ihre Fläche
  function thinWalls(limit, only) {
    const out = []; let area = 0, minT = Infinity;
    const c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), e = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (const n of nodes.values()) {
      if (!n.obj.visible || n.allBodiesHidden || n.role === 'hole' || !n.mesh || !n.data || !n.data.triangles || (only && !only.includes(n.id))) continue;
      const W = worldTris(n), nt = W.length / 9;
      const box = new THREE.Box3(); for (let i = 0; i < W.length; i += 3) box.expandByPoint(c.set(W[i], W[i + 1], W[i + 2]));
      const G = triGrid(W, Math.max(limit, box.getSize(c).length() / 48));
      for (let t = 0; t < nt; t++) {
        const k = t * 9; a.set(W[k + 3] - W[k], W[k + 4] - W[k + 1], W[k + 5] - W[k + 2]); b.set(W[k + 6] - W[k], W[k + 7] - W[k + 1], W[k + 8] - W[k + 2]);
        nrm.crossVectors(a, b); const L = nrm.length(); if (L < 1e-12) continue; nrm.divideScalar(L);
        c.set((W[k] + W[k + 3] + W[k + 6]) / 3, (W[k + 1] + W[k + 4] + W[k + 7]) / 3, (W[k + 2] + W[k + 5] + W[k + 8]) / 3);
        const o = [c.x - nrm.x * 1e-4, c.y - nrm.y * 1e-4, c.z - nrm.z * 1e-4], d = [-nrm.x, -nrm.y, -nrm.z];
        e.set(o[0] + d[0] * limit, o[1] + d[1] * limit, o[2] + d[2] * limit);
        let best = Infinity;
        for (let i = G.ci(Math.min(o[0], e.x), G.x0); i <= G.ci(Math.max(o[0], e.x), G.x0); i++) for (let j = G.ci(Math.min(o[1], e.y), G.y0); j <= G.ci(Math.max(o[1], e.y), G.y0); j++) for (let kk = G.ci(Math.min(o[2], e.z), G.z0); kk <= G.ci(Math.max(o[2], e.z), G.z0); kk++) {
          const l = G.map.get(G.key(i, j, kk)); if (!l) continue;
          for (const q of l) { if (q === t || G.stamp[q] === t) continue; G.stamp[q] = t; const r = rayTri(W, q, o, d); if (r < best) best = r; }
        }
        if (best < limit) {
          area += L / 2; minT = Math.min(minT, best);
          const off = 0.02; for (let m = 0; m < 3; m++) out.push(W[k + m * 3] + nrm.x * off, W[k + m * 3 + 1] + nrm.y * off, W[k + m * 3 + 2] + nrm.z * off);
        }
      }
    }
    return { pos: out, area, minT: isFinite(minT) ? minT : null };
  }
  // Art jeder Kante: außen (konvex), innen (konkav) oder glatt (tangential) – über die beiden Nachbarflächen am Kantenmittelpunkt (KP-16)
  function edgeKinds(id) {
    const n = nodes.get(id); if (!n || !n.data || !n.data.triangles || !n.data.edges) return [];
    const P = n.data.vertices, T = n.data.triangles, G = n.data.faceGroups;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), q = new THREE.Vector3(), cp = new THREE.Vector3(), tri = new THREE.Triangle();
    const out = [];
    for (const e of n.data.edges) {
      if (!e || !e.m) { out.push(null); continue; }
      q.fromArray(e.m);
      // je Fläche das nächste Dreieck zum Kantenmittelpunkt
      const best = [];
      for (const [start, count, fi] of G) {
        let bd = Infinity, bn = null, bc = null;
        for (let i = start; i < start + count; i += 3) {
          A.fromArray(P, T[i] * 3); B.fromArray(P, T[i + 1] * 3); C.fromArray(P, T[i + 2] * 3); tri.set(A, B, C);
          tri.closestPointToPoint(q, cp); const d = cp.distanceToSquared(q);
          if (d < bd) { bd = d; bn = tri.getNormal(new THREE.Vector3()); bc = new THREE.Vector3().addVectors(A, B).add(C).divideScalar(3); }
        }
        best.push({ fi, d: bd, n: bn, c: bc });
      }
      best.sort((a, b) => a.d - b.d);
      const [f1, f2] = best;
      if (!f1 || !f2 || f2.d > 1e-4 + (n.data.tol || 0.05) ** 2 * 4) { out.push(null); continue; }
      if (f1.n.dot(f2.n) > 0.996) { out.push('smooth'); continue; }
      // Punkt auf Fläche 1 vom Rand weg: liegt er vor (konkav) oder hinter (konvex) der Ebene von Fläche 2?
      const s = f2.n.dot(f1.c.clone().sub(q)) + f1.n.dot(f2.c.clone().sub(q));
      out.push(s < 0 ? 'convex' : 'concave');
    }
    return out;
  }
  // Kanten am Rand einer Fläche: Anfang, Mitte und Ende liegen auf den Dreiecken der Fläche (KP-15)
  function faceEdges(id, faceIdx) {
    const n = nodes.get(id); if (!n) return [];
    const P = n.data.vertices, T = n.data.triangles;
    const groupOf = (g) => {
      const tris = [], box = new THREE.Box3();
      for (let i = g[0]; i < g[0] + g[1]; i += 3) { const t = new THREE.Triangle(new THREE.Vector3().fromArray(P, T[i] * 3), new THREE.Vector3().fromArray(P, T[i + 1] * 3), new THREE.Vector3().fromArray(P, T[i + 2] * 3)); tris.push(t); box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c); }
      return { tris, box };
    };
    const G = n.data.faceGroups.find((x) => x[2] === faceIdx); if (!G) return [];
    const me = groupOf(G);
    const tol = Math.max(0.02, me.box.getSize(new THREE.Vector3()).length() * 0.004);
    const q = new THREE.Vector3(), cp = new THREE.Vector3();
    const near = (F, p) => { q.fromArray(p); if (!F.box.containsPoint(q)) { const b = F.box.clone().expandByScalar(tol); if (!b.containsPoint(q)) return false; } for (const t of F.tris) { t.closestPointToPoint(q, cp); if (cp.distanceToSquared(q) < tol * tol) return true; } return false; };
    let others = null;
    const out = [];
    (n.data.edges || []).forEach((e, i) => {
      if (!(e && e.a && e.b && e.m && near(me, e.m) && near(me, e.a) && near(me, e.b))) return;
      // Naht einer runden Fläche (gehört nur zu ihr selbst) nicht mitnehmen
      if (!others) others = n.data.faceGroups.filter((x) => x[2] !== faceIdx).map(groupOf);
      if (others.some((F) => near(F, e.m))) out.push(i);
    });
    return out;
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
  function highlightBody(id, bodyIdx) {
    if (hoverBody && hoverBody.id === id && hoverBody.bodyIdx === bodyIdx) return;
    if (hoverBody) { groups.overlay.remove(hoverBody.mesh); hoverBody.mesh.geometry.dispose(); hoverBody.mesh.material.dispose(); hoverBody = null; }
    const n = nodes.get(id);
    if (n && bodyIdx != null && bodyIdx >= 0 && n.data && n.data.faceBody && n.data.faceGroups && !(n.hiddenBodies && n.hiddenBodies.has(bodyIdx))) {
      const tris = [];
      for (const [start, count, fi] of n.data.faceGroups) {
        if (fi >= 0 && n.data.faceBody[fi] === bodyIdx) {
          for (let k = start; k < start + count; k++) tris.push(n.data.triangles[k]);
        }
      }
      if (tris.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', n.mesh.geometry.getAttribute('position'));
        geo.setAttribute('normal', n.mesh.geometry.getAttribute('normal'));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(n.obj.matrix); mesh.renderOrder = 6;
        groups.overlay.add(mesh); hoverBody = { id, bodyIdx, mesh };
      }
    }
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
  function clearHover() { highlightFace('hover', null, null); highlightEdge(null, null); highlightBody(null, null); }

  // ---------- Auswahl mit der Maus ----------
  const _ndc = new THREE.Vector2();
  function rect() { return renderer.domElement.getBoundingClientRect(); }
  function setRay(cx, cy) {
    syncCamAnim();
    const r = rect();
    _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, cam());
    return raycaster;
  }
  // alle Teile entlang des Strahls, vorne zuerst (für „Wähle das dahinter“)
  function pickAll(cx, cy) {
    setRay(cx, cy);
    const meshes = []; for (const n of nodes.values()) { if (!n.obj.visible || n.allBodiesHidden || n.ctxDim) continue; meshes.push(n.mesh); }
    let hits = raycaster.intersectObjects(meshes, false);
    if (vis.clips.length) hits = hits.filter((x) => vis.clips.every((pl) => pl.distanceToPoint(x.point) >= -1e-6));
    const out = [], seen = new Set();
    for (const x of hits) {
      const n = nodes.get(x.object.userData.nodeId); if (!n) continue;
      const tri = x.faceIndex * 3; let faceIdx = -1;
      for (const g of n.visFaceGroups || n.data.faceGroups) if (tri >= g[0] && tri < g[0] + g[1]) { faceIdx = g[2]; break; }
      const key = n.id + ':' + faceIdx; if (seen.has(key)) continue; seen.add(key);
      out.push({ id: n.id, faceIdx, point: x.point.clone(), normal: x.face ? x.face.normal.clone().transformDirection(n.obj.matrixWorld) : null, distance: x.distance });
    }
    return out;
  }
  function pick(cx, cy, opts = {}) {
    setRay(cx, cy);
    const meshes = [];
    for (const n of nodes.values()) { if (!n.obj.visible || n.allBodiesHidden || n.ctxDim) continue; if (opts.solidsOnly && n.role === 'hole') continue; if (opts.exclude && opts.exclude.has(n.id)) continue; meshes.push(n.mesh); }
    let hits = raycaster.intersectObjects(meshes, false);
    if (vis.clips.length) hits = hits.filter((x) => vis.clips.every((pl) => pl.distanceToPoint(x.point) >= -1e-6));
    if (vis.xray && hits.length) {
      // Röntgen: liegt das gewählte Teil vorne, gilt der Klick dem nächsten Teil dahinter
      const first = nodes.get(hits[0].object.userData.nodeId);
      if (first && first.selected && !opts.noCycle) { const nx = hits.find((x) => x.object.userData.nodeId !== first.id); if (nx) hits = [nx, ...hits.filter((x) => x !== nx)]; }
    }
    if (!hits.length) {
      // am Umriss: Kante in der Nähe suchen, auch wenn der Strahl knapp vorbeigeht
      if (opts.noEdges) return null;
      let best = null;
      for (const n of nodes.values()) {
        if (!n.obj.visible || n.allBodiesHidden || n.ctxDim || (opts.solidsOnly && n.role === 'hole') || (opts.exclude && opts.exclude.has(n.id))) continue;
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
    for (const g of n.visFaceGroups || n.data.faceGroups) if (tri >= g[0] && tri < g[0] + g[1]) { faceIdx = g[2]; break; }
    const normal = hit.face ? hit.face.normal.clone().transformDirection(n.obj.matrixWorld) : null;
    const res = { id: n.id, point: hit.point.clone(), faceIdx, normal, distance: hit.distance, node: n };
    if (!opts.noEdges) {
      const e = edgeNear(n, cx, cy, vis.xray ? Infinity : hit.distance, opts.edgePx || 5);
      if (e) { res.edgeIdx = e.edgeIdx; res.edgeDist = e.px; }
    }
    return res;
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _onRay = new THREE.Vector3(), _onSeg = new THREE.Vector3();
  function edgeNear(n, cx, cy, hitDist, maxPx = 7) {
    const r = rect(); const lines = n.visLines || n.data.lines; const M = n.obj.matrixWorld;
    const px = cx - r.left, py = cy - r.top;
    let best = null, bd = maxPx;
    const C = cam(); const toS = (v) => { const p = v.clone().project(C); return [(p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height, p.z]; };
    const camPos = camera.position;
    const tol = ortho ? Math.max(0.3, (8 * orthoHalfH()) / (container.clientHeight || 1)) : Math.max(0.3, (isFinite(hitDist) ? hitDist : 0) * 0.004);
    for (const g of n.visEdgeGroups || n.data.edgeGroups) {
      for (let i = g[0]; i < g[0] + g[1]; i += 2) {
        _a.set(lines[i * 3], lines[i * 3 + 1], lines[i * 3 + 2]).applyMatrix4(M);
        _b.set(lines[i * 3 + 3], lines[i * 3 + 4], lines[i * 3 + 5]).applyMatrix4(M);
        if (vis.clips.length && vis.clips.some((pl) => pl.distanceToPoint(_a) < 0 && pl.distanceToPoint(_b) < 0)) continue;
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
    syncCamAnim();
    const r = rect(); const p = v.clone().project(cam());
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, behind: p.z > 1 };
  }
  function pixelSizeAt(point) {
    syncCamAnim();
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
      if (!n.obj.visible || n.allBodiesHidden) continue;
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
  // ---------- Vorige Ansicht: Verlauf der Kamera ----------
  const camHist = []; let camHistT = 0, camHistUser = false, camBackBusy = false;
  const sameCam = (a, b) => !!a && !!b && a.p.distanceTo(b.p) < 1e-3 * (1 + a.p.length()) && a.t.distanceTo(b.t) < 1e-3 * (1 + a.t.length()) && a.up.distanceTo(b.up) < 1e-4;
  function camNow() { return camAnim ? { p: camAnim.p1.clone(), t: camAnim.q1.clone(), up: (camAnim.up1 || camera.up).clone() } : saveCamera(); }
  function pushCam(user = false) {
    if (camBackBusy) return;
    const now = performance.now();
    // Mausrad und schnelle Folgen zählen als ein Schritt
    if (user && camHistUser && now - camHistT < 700) { camHistT = now; return; }
    camHistT = now; camHistUser = user;
    const s = camNow(); if (sameCam(camHist[camHist.length - 1], s)) return;
    camHist.push(s); if (camHist.length > 40) camHist.shift();
  }
  function viewBack(animate = true) {
    const cur = camNow(); let s = camHist.pop();
    while (s && sameCam(s, cur)) s = camHist.pop();
    if (!s) return false;
    camBackBusy = true; moveCamera(s.p, s.t, s.up, animate); camBackBusy = false; camHistUser = false;
    return true;
  }
  // ---------- Maus-Steuerung wie in anderen Programmen (BE-12) ----------
  // ctx: 'model' (Modell), 'sketch' (Skizze: links zeichnet), 'place' (Setzen/Notizen: links setzt)
  let mouseStyle = 'tracery', mouseCtx = 'model';
  const M = () => THREE.MOUSE;
  function buttonsFor(style, ctx) {
    const R = M().ROTATE, P = M().PAN, D = M().DOLLY;
    switch (style) {
      case 'onshape': return { LEFT: null, MIDDLE: P, RIGHT: R };   // rechts drehen, Mitte verschieben
      case 'solidworks': return { LEFT: null, MIDDLE: R, RIGHT: ctx === 'model' ? P : P };   // Mitte drehen, rechts verschieben
      case 'fusion': return { LEFT: null, MIDDLE: P, RIGHT: null };   // Mitte verschieben, Umschalt + Mitte drehen
      case 'blender': return { LEFT: null, MIDDLE: R, RIGHT: null };   // Mitte drehen, Umschalt + Mitte verschieben
      default: return ctx === 'model' ? { LEFT: R, MIDDLE: D, RIGHT: P } : ctx === 'sketch' ? { LEFT: null, MIDDLE: D, RIGHT: P } : { LEFT: null, MIDDLE: D, RIGHT: R };
    }
  }
  function useButtons(ctx = mouseCtx) { mouseCtx = ctx; if (controls) controls.mouseButtons = buttonsFor(mouseStyle, ctx); }
  function setMouseStyle(st) { mouseStyle = st || 'tracery'; useButtons(); }
  function stopDamping() {
    if (!controls) return;
    if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
    if (controls._panOffset) controls._panOffset.set(0, 0, 0);
    if ('_scale' in controls) controls._scale = 1;
  }
  function scheduleCamEmit() {
    if (camEmitTimer) return;
    camEmitTimer = setTimeout(() => { camEmitTimer = null; listeners.emit('camera'); }, 0);
  }
  function cancelCamAnim() {
    camAnim = null;
    if (camAnimTimer) { clearTimeout(camAnimTimer); camAnimTimer = null; }
  }
  function finishCamAnim(deferEmit = false) {
    if (!camAnim) return;
    const a = camAnim;
    cancelCamAnim();
    camera.position.copy(a.p1);
    controls.target.copy(a.q1);
    if (a.up1) camera.up.copy(a.up1);
    stopDamping();
    inLoopCam = true;
    controls.update();
    inLoopCam = false;
    camera.updateMatrixWorld();
    needsRender = true;
    if (deferEmit) scheduleCamEmit();
    else {
      if (camEmitTimer) { clearTimeout(camEmitTimer); camEmitTimer = null; }
      listeners.emit('camera');
    }
  }
  function syncCamAnim() {
    if (camAnim && performance.now() - camAnim.t0 >= camAnim.dur) finishCamAnim(true);
  }
  function moveCamera(pos, target, up, animate = true) {
    pushCam(false);
    stopDamping();
    cancelCamAnim();
    if (!animate) {
      camera.position.copy(pos); controls.target.copy(target); if (up) camera.up.copy(up);
      inLoopCam = true; controls.update(); inLoopCam = false;
      camera.updateMatrixWorld();
      needsRender = true; listeners.emit('camera'); return;
    }
    camAnim = { t0: performance.now(), dur: 420, p0: camera.position.clone(), p1: pos.clone(), q0: controls.target.clone(), q1: target.clone(), up0: up ? camera.up.clone() : null, up1: up ? up.clone() : null };
    camAnimTimer = setTimeout(() => { camAnimTimer = null; finishCamAnim(); }, camAnim.dur + 20);
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
  // Blick senkrecht auf eine ebene Fläche eines Teils (Weltlage aus dem Teil)
  function lookAtFace(id, idx, animate = true) {
    const n = nodes.get(id); const f = n && n.data.faces && n.data.faces[idx];
    if (!f || !f.n || !f.c) return false;
    const m = n.obj.matrix, c = new THREE.Vector3(...f.c).applyMatrix4(m), nn = new THREE.Vector3(...f.n).transformDirection(m);
    const x = Math.abs(nn.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(nn).normalize();
    const size = Math.max(20, n.mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length() * 0.6);
    lookAtPlane(c.toArray(), nn.toArray(), x.toArray(), size, animate);
    return true;
  }
  function saveCamera() { syncCamAnim(); return { p: camera.position.clone(), t: controls.target.clone(), up: camera.up.clone() }; }
  function restoreCamera(s, animate = true) { if (s) moveCamera(s.p, s.t, s.up, animate); }

  // ---------- Zweites Bild in einer Ecke (Fokus-Vorschau) ----------
  // r: Rechteck in CSS-Pixeln relativ zur Zeichenfläche; ids: Teile, die zu sehen sind; rot: [Gier, Neigung] in Grad
  const insetCam = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);
  function renderInset(r, ids, rot = [0, 0], bg) {
    const size = renderer.getSize(new THREE.Vector2());
    const show = ids.map((id) => nodes.get(id)).filter(Boolean);
    if (!show.length || r.w < 10 || r.h < 10) return false;
    const box = new THREE.Box3(); for (const n of show) box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
    const c = box.getCenter(new THREE.Vector3()); const R = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    // Blickrichtung wie die Hauptkamera, dazu eigene Drehung
    const dir = camera.position.clone().sub(controls.target).normalize();
    const up = camera.up.clone();
    if (rot[0]) dir.applyAxisAngle(up, (rot[0] * Math.PI) / 180);
    if (rot[1]) { const side = new THREE.Vector3().crossVectors(up, dir).normalize(); const d2 = dir.clone().applyAxisAngle(side, (rot[1] * Math.PI) / 180); if (Math.abs(d2.dot(up)) < 0.995) dir.copy(d2); }
    insetCam.aspect = r.w / r.h;
    const dist = (R / Math.sin((insetCam.fov * Math.PI) / 360)) * 1.08 / Math.min(1, insetCam.aspect);
    insetCam.position.copy(c).addScaledVector(dir, dist); insetCam.up.copy(up); insetCam.lookAt(c);
    insetCam.near = Math.max(0.05, dist - R * 2); insetCam.far = dist + R * 2; insetCam.updateProjectionMatrix();
    const before = new Map(); for (const n of nodes.values()) { before.set(n, n.obj.visible); n.obj.visible = show.includes(n); }
    const gv = {}; for (const k of Object.keys(groups)) if (k !== 'nodes') { gv[k] = groups[k].visible; groups[k].visible = false; }
    const y = size.y - r.y - r.h;
    renderer.setScissorTest(true); renderer.setScissor(r.x, y, r.w, r.h); renderer.setViewport(r.x, y, r.w, r.h);
    renderer.setClearColor(new THREE.Color(bg || theme.surface), 1);
    renderer.render(scene, insetCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(0x000000, 0);
    for (const [n, v] of before) n.obj.visible = v;
    for (const k of Object.keys(gv)) groups[k].visible = gv[k];
    return true;
  }

  // ---------- Vergleich: älterer Stand als roter, gestrichelter Umriss ----------
  function setCompare(list) {
    for (const o of [...groups.compare.children]) { groups.compare.remove(o); o.traverse((x) => { x.geometry && x.geometry.dispose(); x.material && x.material.dispose(); }); }
    for (const it of list || []) {
      const d = it.data;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(d.vertices, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3)); geo.setIndex(new THREE.BufferAttribute(d.triangles, 1));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.hole), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(d.lines, 3));
      const edges = new THREE.LineSegments(eg, new THREE.LineDashedMaterial({ color: new THREE.Color(theme.hole), dashSize: 1.6, gapSize: 1.1, transparent: true, opacity: 0.95, depthTest: false }));
      edges.computeLineDistances();
      const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false; obj.matrix.copy(it.matrix);
      mesh.renderOrder = 8; edges.renderOrder = 9;
      groups.compare.add(obj);
    }
    needsRender = true;
  }

  // Bild der Szene für Vorschaubilder
  // Schattenriss: Fläche (mm²), die die Teile aus Blickrichtung dir verdecken – z. B. die Stirnfläche im Fahrtwind.
  // Gerechnet durch Pixelzählen in einem eigenen Bild (orthografisch), unabhängig von der Kamera.
  function silhouette(ids, dir, res = 1024) {
    const show = ids.map((id) => nodes.get(id)).filter((n) => n && n.mesh && !n.allBodiesHidden);
    if (!show.length) return { area: 0, px: 0 };
    const d = new THREE.Vector3(...dir).normalize();
    groups.nodes.updateMatrixWorld(true);
    const box = new THREE.Box3(); for (const n of show) box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.mesh.matrixWorld));
    const c = box.getCenter(new THREE.Vector3()), R = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2) * 1.02;
    const oc = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, 4 * R + 20);
    oc.up.copy(Math.abs(d.z) > 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
    oc.position.copy(c).addScaledVector(d, -(2 * R + 10)); oc.lookAt(c); oc.updateProjectionMatrix(); oc.updateMatrixWorld();
    const sc = new THREE.Scene(), mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (const n of show) { const m = new THREE.Mesh(n.mesh.geometry, mat); m.matrixAutoUpdate = false; m.matrix.copy(n.mesh.matrixWorld); m.matrixWorld.copy(n.mesh.matrixWorld); sc.add(m); }
    const rt = new THREE.WebGLRenderTarget(res, res);
    const oldRT = renderer.getRenderTarget(), oldCol = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha(), oldClip = renderer.localClippingEnabled;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.localClippingEnabled = false; renderer.clear(); renderer.render(sc, oc);
    const buf = new Uint8Array(res * res * 4); renderer.readRenderTargetPixels(rt, 0, 0, res, res, buf);
    renderer.setRenderTarget(oldRT); renderer.setClearColor(oldCol, oldA); renderer.localClippingEnabled = oldClip;
    rt.dispose(); mat.dispose();
    let px = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] > 127) px++;
    const s = (2 * R) / res;
    needsRender = true;
    return { area: px * s * s, px, c: c.toArray(), R };
  }
  // Bild in beliebiger Größe: ohne Raster, Achsen, Ebenen und Griffe; Hintergrund durchsichtig oder hell
  function renderImage(w, hgt, opts = {}) {
    const old = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio();
    const hide = [gridMinor, gridMajor, groups.origin, groups.datums, groups.handles, groups.overlay, groups.measures, groups.sketch].filter(Boolean), was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const c = cam(), oldAspect = camera.aspect;
    renderer.setPixelRatio(1); renderer.setSize(w, hgt, false);
    if (c.isPerspectiveCamera) { c.aspect = w / hgt; c.updateProjectionMatrix(); }
    else { const o = { l: c.left, r: c.right, t: c.top, b: c.bottom }; const hh = (c.top - c.bottom) / 2, ww = (hh * w) / hgt, cx = (c.left + c.right) / 2; c.left = cx - ww; c.right = cx + ww; c.updateProjectionMatrix(); c.userData.restore = o; }
    renderer.setClearColor(new THREE.Color(opts.bg || '#ffffff'), opts.transparent ? 0 : 1);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, c);
    const url = renderer.domElement.toDataURL('image/png');
    hide.forEach((o, i) => { o.visible = was[i]; });
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(oldPR); renderer.setSize(old.x, old.y, false);
    if (c.isPerspectiveCamera) { c.aspect = oldAspect; c.updateProjectionMatrix(); }
    else if (c.userData.restore) { Object.assign(c, { left: c.userData.restore.l, right: c.userData.restore.r, top: c.userData.restore.t, bottom: c.userData.restore.b }); c.updateProjectionMatrix(); delete c.userData.restore; }
    renderer.shadowMap.needsUpdate = true; needsRender = true;
    return url;
  }
  function snapshot(w = 480, hgt = 300) {
    const old = renderer.getSize(new THREE.Vector2());
    renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
    renderer.render(scene, cam());
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setSize(old.x, old.y, false); camera.aspect = old.x / old.y; camera.updateProjectionMatrix(); needsRender = true;
    return url;
  }

  return {
    viewBack, get viewHistory() { return camHist.length; }, useButtons, setMouseStyle, get mouseStyle() { return mouseStyle; }, get leftOrbits() { return !!(controls && controls.mouseButtons.LEFT === THREE.MOUSE.ROTATE); }, setLook, lookOf, get look() { return { ...LOOK }; }, fitShadow, renderImage, lookAtFace, faceIndexOf: (id, fc) => { const n = nodes.get(id); return n ? faceIndexOf(n, fc) : -1; }, cylinderFaceInfo, threadFaceIndex: (id, th) => { const n = nodes.get(id); return n ? threadFaceIndex(n, th) : -1; }, get renderer() { return renderer; },
    init, requestRender, setClip, setXray, setOffsets, baseBox, renderInset, silhouette, setAdaptive, setCompare, setNode, updateNode, removeNode, setGhost, removeGhost, clearGhosts, highlightFace, highlightEdge, highlightBody, setSelectedEdges, clearHover,
    edgePositions, pick, pickAll, pickGhost, pickProxy, setProxies, clearProxies, pickPlane, rayPlane, inView, screenFraction, setRay, toScreen, pixelSizeAt, fit, setView, lookAtPlane, saveCamera, restoreCamera, moveCamera, setOrtho, setViewOptions, boxVisible, sceneBox, snapshot, makeFat, disposeFat, faceOverlay, faceArea, faceEdges, edgeKinds, wallAt, thinWalls,
    get camera() { syncCamAnim(); return camera; }, get activeCamera() { syncCamAnim(); return cam(); }, get ortho() { return ortho; }, get gridStep() { return gridStep; }, get controls() { return controls; }, get scene() { return scene; }, get groups() { return groups; }, get nodes() { return nodes; }, get canvas() { return renderer.domElement; }, get theme() { return theme; }, get container() { return container; },
    get clip() { return vis.clip; }, get clips() { return vis.clips.slice(); }, get xray() { return vis.xray; }, get lowRes() { return lowRes; },  get pixelRatio() { return renderer.getPixelRatio(); },
    on: listeners.on,
  };
})();

