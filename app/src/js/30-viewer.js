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
  let hoverFace = null, hoverEdge = null, hoverBody = null, selFaces = [], selEdges = [];
  let camAnim = null, camAnimTimer = null, camEmitTimer = null, inLoopCam = false, camMoveSeq = 0;
  const listeners = makeEmitter();
  // Ansichts-Modi (Sitzung 9, PF-06): Schnittebenen, Kappen, Röntgen, Verschiebung für die Explosionsansicht
  const vis = { clip: null, clips: [], capEnabled: true, xray: false };
  const _off = new THREE.Matrix4();

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    theme.ink = g('--ink', '#16202b'); theme.accent = g('--accent', '#0c7a70'); theme.hole = g('--hole', '#d9483f'); theme.warn = g('--warn', '#b77a06');
    theme.dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light' || document.documentElement.getAttribute('data-theme') === 'dark';
    theme.edge = theme.dark ? '#0b0f13' : '#1c2630';
    theme.surface = g('--surface', theme.dark ? '#1a2027' : '#ffffff');
  }

  // ---------- Kamera: Perspektive oder orthografisch ----------
  // Die Steuerung arbeitet immer mit der Perspektiv-Kamera. Im Ortho-Modus folgt eine
  // orthografische Kamera exakt ihrer Richtung, der Ausschnitt ergibt sich aus dem Abstand.
  let orthoCam = null, ortho = false;
  const QUAD_DEFS = [
    { key: 'front', dir: [0, -1, 0], up: [0, 0, 1], ortho: true },
    { key: 'top', dir: [0, -0.0001, 1], up: [0, 0, 1], ortho: true },
    { key: 'right', dir: [1, 0, 0], up: [0, 0, 1], ortho: true },
    { key: 'iso', dir: [0.62, -0.9, 0.7], up: [0, 0, 1], ortho: false },
  ];
  let quadState = null; // { active: 'iso', panes: [...] }
  function orthoHalfH() {
    const ap = quadState ? (quadState.panes.find((p) => p.key === quadState.active) || quadState.panes[0]) : null;
    const c = ap ? ap.cam : camera, t = ap ? ap.controls.target : controls.target;
    return c.position.distanceTo(t) * Math.tan((c.fov * Math.PI) / 360);
  }
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
    const ap = quadState ? (quadState.panes.find((p) => p.key === quadState.active) || quadState.panes[0]) : null;
    const d = ap ? ap.cam.position.distanceTo(ap.controls.target) : camera.position.distanceTo(controls.target);
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
    if (!camera || !controls) return;
    const ap = quadState ? (quadState.panes.find((p) => p.key === quadState.active) || quadState.panes[0]) : null;
    const refCam = ap ? ap.cam : camera;
    const refTarget = ap ? ap.controls.target : controls.target;
    const dist = refCam.position.distanceTo(refTarget);
    // Nah- und Fernebene mitführen: erlaubt tiefes Hineinzoomen ohne Flimmern
    if (!quadState) {
      const nr = clamp(dist * 0.01, 0.002, 2), fr = dist * 60 + 8000;
      if (Math.abs(camera.near - nr) > nr * 0.2 || Math.abs(camera.far - fr) > fr * 0.2) { camera.near = nr; camera.far = fr; camera.updateProjectionMatrix(); }
    }
    if (view.grid === 'auto') { const st = autoStep(); if (st !== gridStep) buildGrid(st); }
    const tg = refTarget;
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
  let lastPrintBed = null;
  function setPrintBed(bed) {
    if (!groups.printBed) return;
    while (groups.printBed.children.length) {
      const ch = groups.printBed.children[0];
      groups.printBed.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }
    lastPrintBed = bed && bed.enabled ? { ...bed } : null;
    if (!bed || !bed.enabled || !(bed.x > 0) || !(bed.y > 0)) { needsRender = true; return; }
    const bx = Number(bed.x), by = Number(bed.y), bz = Number(bed.z) > 0 ? Number(bed.z) : 250;
    const hx = bx / 2, hy = by / 2;
    const bedCol = bed.warn ? theme.warn : theme.accent;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(bx, by),
      new THREE.MeshBasicMaterial({ color: bedCol, transparent: true, opacity: bed.warn ? 0.09 : 0.05, side: THREE.DoubleSide, depthWrite: false }),
    );
    plate.position.z = -0.02;
    plate.renderOrder = -2;
    plate.userData.noPick = true;
    const basePts = [
      -hx, -hy, 0, hx, -hy, 0,
      hx, -hy, 0, hx, hy, 0,
      hx, hy, 0, -hx, hy, 0,
      -hx, hy, 0, -hx, -hy, 0,
    ];
    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(basePts, 3));
    const baseFrame = new THREE.LineSegments(baseGeo, new THREE.LineBasicMaterial({ color: bedCol, transparent: true, opacity: bed.warn ? 0.9 : 0.75, depthWrite: false }));
    baseFrame.renderOrder = -1;
    baseFrame.userData.noPick = true;
    const volPts = [
      -hx, -hy, 0, -hx, -hy, bz,
      hx, -hy, 0, hx, -hy, bz,
      hx, hy, 0, hx, hy, bz,
      -hx, hy, 0, -hx, hy, bz,
      -hx, -hy, bz, hx, -hy, bz,
      hx, -hy, bz, hx, hy, bz,
      hx, hy, bz, -hx, hy, bz,
      -hx, hy, bz, -hx, -hy, bz,
    ];
    const volGeo = new THREE.BufferGeometry();
    volGeo.setAttribute('position', new THREE.Float32BufferAttribute(volPts, 3));
    const volFrame = new THREE.LineSegments(volGeo, new THREE.LineBasicMaterial({ color: bedCol, transparent: true, opacity: bed.warn ? 0.45 : 0.22, depthWrite: false }));
    volFrame.renderOrder = -1;
    volFrame.userData.noPick = true;
    groups.printBed.add(plate, baseFrame, volFrame);
    needsRender = true;
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
    for (const k of ['ground', 'printBed', 'origin', 'datums', 'pointClouds', 'nodes', 'compare', 'ghosts', 'overlay', 'measures', 'handles', 'sketch3d', 'sketch', 'reffix']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }
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
    reflectAlphaTex = makeFloorAlphaTex();
    reflectFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(theme.dark ? '#242c36' : '#e6ecf2'),
        roughness: 0.25,
        metalness: 0.25,
        reflectivity: 0,
        clearcoat: 0,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0,
        transparent: true,
        opacity: 0,
        alphaMap: reflectAlphaTex,
        depthWrite: false,
      }),
    );
    reflectFloor.name = 'studioFloor';
    reflectFloor.renderOrder = -3;
    reflectFloor.visible = false;
    reflectFloor.userData.noPick = true;
    reflectFloor.userData.studioFloor = true;
    groups.ground.add(reflectFloor);
    // Lichter folgen der Kamera leicht
    camera.add(new THREE.PointLight(0xffffff, 0, 0));
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = BASE_DAMP;
    controls.screenSpacePanning = true; controls.zoomToCursor = true;
    controls.rotateSpeed = 0.85; controls.zoomSpeed = 1.1; controls.panSpeed = 0.9;
    controls.minDistance = 0.2; controls.maxDistance = 12000;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = touchesFor('model');
    bindGestures(renderer.domElement, () => controls);
    controls.target.set(0, 0, 10);
    controls.addEventListener('change', () => { needsRender = true; if (!inLoopCam) listeners.emit('camera'); });
    controls.addEventListener('start', () => { camMoveSeq++; orbitActive = true; pushCam(true); cancelCamAnim(); });
    controls.addEventListener('end', () => { orbitActive = false; if (lowRes) scheduleAdaptRestore(); });
    buildGrid(autoStep()); buildOrigin();
    applyLook();
    const ro = new ResizeObserver(resize); ro.observe(el);
    resize();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { readTheme(); buildGrid(gridStep); if (lastPrintBed) setPrintBed(lastPrintBed); fitShadow(); for (const [id, n] of nodes) styleNode(n); needsRender = true; listeners.emit('theme'); };
    mq.addEventListener ? mq.addEventListener('change', onTheme) : mq.addListener(onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    loop();
  }
  function resize() {
    const w = container.clientWidth || 1, hgt = container.clientHeight || 1;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt; camera.updateProjectionMatrix();
    for (const m of fatMaterials) m.resolution.set(w, hgt);
    for (const m of outlineMaterials) m.uniforms.uRes.value.set(w, hgt);
    needsRender = true; listeners.emit('camera');
  }
  const fatMaterials = new Set();
  const outlineMaterials = new Set();
  const isIllust = () => LOOK.display === 'illustration';

  // ---------- Aussehen: Studio-Licht, Werkstoff, Schatten, Boden-Spiegelung, eigene Umgebung ----------
  // look: 'studio' (Werkstoff mit Glanz, Umgebung, Schatten) · 'plain' (einfach, matt) · 'clay' / 'chrome' (Prüfansicht)
  const lights = {};
  const DEFAULT_LIGHTS = [{ azimuth: 35, elevation: 52, color: '#ffffff', intensity: 2.1 }];
  const LIGHT_PRESETS = [
    { azimuth: 35, elevation: 52, color: '#ffffff', intensity: 2.1 },
    { azimuth: -55, elevation: 25, color: '#dfe8ff', intensity: 1.0 },
    { azimuth: 165, elevation: 30, color: '#fff3e0', intensity: 0.8 },
  ];
  let shadowFloor = null, reflectFloor = null, reflectAlphaTex = null;
  let envTex = null, envMood = null, customEnvTex = null, customEnvRT = null, customEnvName = '', pmrem = null;
  let customLights = [];
  const LOOK = {
    look: 'studio', mood: 'studio', shadows: true, display: 'edges',
    floorReflect: false, floorReflectStrength: 0.45,
    manualLights: false, lights: DEFAULT_LIGHTS.map((l) => ({ ...l })),
  };
  // Werkstoff → Oberfläche (aus app/data/materialien.json). nat = der Werkstoff hat eine eigene Farbe (Metall, Kohlefaser, Holz, Glas)
  const LOOKS = Object.fromEntries((typeof MATERIALS !== 'undefined' ? MATERIALS : []).filter((m) => m.look).map((m) => [m.k, m.look]));
  const PLASTIC = { rough: 0.45, clear: 0.15 };
  function lookOf(mat) { return (mat && LOOKS[mat]) || PLASTIC; }
  function makeFloorAlphaTex() {
    const N = 256, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(N / 2, N / 2, N * 0.175, N / 2, N / 2, N * 0.48);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.55, '#d8d8d8');
    rg.addColorStop(0.85, '#505050');
    rg.addColorStop(1, '#000000');
    g.fillStyle = rg;
    g.fillRect(0, 0, N, N);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }
  function updateReflectFloor(c, r, z0) {
    if (!reflectFloor || !reflectFloor.material) return;
    const strength = clamp(Number(LOOK.floorReflectStrength) || 0, 0, 1);
    const on = LOOK.look === 'studio' && !isIllust() && !!LOOK.floorReflect && strength > 0;
    reflectFloor.visible = on;
    const m = reflectFloor.material;
    m.color.set(theme.dark ? '#242c36' : '#e6ecf2');
    m.reflectivity = on ? strength : 0;
    m.clearcoat = on ? strength : 0;
    m.clearcoatRoughness = clamp(0.32 - strength * 0.26, 0.04, 0.35);
    m.roughness = on ? clamp(0.42 - strength * 0.36, 0.04, 0.5) : 0.9;
    m.metalness = on ? clamp(0.12 + strength * 0.48, 0, 0.65) : 0;
    m.envMapIntensity = on ? (0.45 + strength * 1.45) : 0;
    m.opacity = on ? clamp(0.22 + strength * 0.68, 0.15, 0.9) : 0;
    m.userData.reflectStrength = on ? strength : 0;
    m.needsUpdate = true;
    if (c && r > 0) {
      reflectFloor.position.set(c.x, c.y, z0 - 0.03);
      reflectFloor.scale.set(r * 7, r * 7, 1);
    } else {
      reflectFloor.position.set(0, 0, -0.08);
      reflectFloor.scale.set(360, 360, 1);
    }
  }
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
  // Kompakter Radiance-RGBE-Decoder (.hdr) für eigene Umgebungsbilder ohne Zusatzbibliothek
  function parseHDR(buf) {
    const bytes = new Uint8Array(buf);
    let pos = 0;
    const readLine = () => {
      const start = pos;
      while (pos < bytes.length && bytes[pos] !== 10) pos++;
      let end = pos;
      if (end > start && bytes[end - 1] === 13) end--;
      if (pos < bytes.length && bytes[pos] === 10) pos++;
      return String.fromCharCode.apply(null, bytes.subarray(start, end));
    };
    const magic = readLine();
    if (!magic.startsWith('#?RADIANCE') && !magic.startsWith('#?RGBE')) throw new Error('Ungültiges HDR-Format');
    let line = '';
    while (pos < bytes.length) {
      line = readLine();
      if (line === '') break;
    }
    const dimLine = readLine();
    const m = /^([+-]Y)\s+(\d+)\s+([+-]X)\s+(\d+)/.exec(dimLine.trim());
    if (!m) throw new Error('HDR-Größe fehlt');
    const h = parseInt(m[2], 10), w = parseInt(m[4], 10);
    if (!(w > 0 && h > 0 && w <= 8192 && h <= 8192)) throw new Error('Ungültige HDR-Abmessungen');
    const rgbe = new Uint8Array(w * h * 4);
    const scan = new Uint8Array(w * 4);
    for (let y = 0; y < h; y++) {
      if (pos + 4 > bytes.length) break;
      const b0 = bytes[pos], b1 = bytes[pos + 1], b2 = bytes[pos + 2], b3 = bytes[pos + 3];
      if (b0 !== 2 || b1 !== 2 || ((b2 << 8) | b3) !== w) {
        const len = Math.min(w * 4, bytes.length - pos);
        rgbe.set(bytes.subarray(pos, pos + len), y * w * 4);
        pos += len;
        continue;
      }
      pos += 4;
      for (let ch = 0; ch < 4; ch++) {
        let ptr = ch * w;
        const endPtr = ptr + w;
        while (ptr < endPtr && pos < bytes.length) {
          const code = bytes[pos++];
          if (code > 128) {
            const cnt = code - 128;
            const val = bytes[pos++] || 0;
            for (let k = 0; k < cnt && ptr < endPtr; k++) scan[ptr++] = val;
          } else {
            const cnt = code;
            for (let k = 0; k < cnt && ptr < endPtr && pos < bytes.length; k++) scan[ptr++] = bytes[pos++];
          }
        }
      }
      const rowOff = y * w * 4;
      for (let x = 0; x < w; x++) {
        rgbe[rowOff + x * 4] = scan[x];
        rgbe[rowOff + x * 4 + 1] = scan[w + x];
        rgbe[rowOff + x * 4 + 2] = scan[2 * w + x];
        rgbe[rowOff + x * 4 + 3] = scan[3 * w + x];
      }
    }
    const toHalf = (THREE.DataUtils && THREE.DataUtils.toHalfFloat) ? THREE.DataUtils.toHalfFloat : null;
    const floatData = toHalf ? new Uint16Array(w * h * 4) : null;
    const ldrData = new Uint8Array(w * h * 4);
    const oneHalf = toHalf ? toHalf(1) : 15360;
    for (let i = 0; i < w * h; i++) {
      const si = i * 4, e = rgbe[si + 3];
      let r = 0, g = 0, b = 0;
      if (e > 0) {
        const sc = Math.pow(2, e - 128) / 256;
        r = rgbe[si] * sc; g = rgbe[si + 1] * sc; b = rgbe[si + 2] * sc;
      }
      if (floatData) {
        floatData[si] = toHalf(clamp(r, 0, 65504));
        floatData[si + 1] = toHalf(clamp(g, 0, 65504));
        floatData[si + 2] = toHalf(clamp(b, 0, 65504));
        floatData[si + 3] = oneHalf;
      }
      ldrData[si] = Math.round(clamp(r / (1 + r), 0, 1) * 255);
      ldrData[si + 1] = Math.round(clamp(g / (1 + g), 0, 1) * 255);
      ldrData[si + 2] = Math.round(clamp(b / (1 + b), 0, 1) * 255);
      ldrData[si + 3] = 255;
    }
    return { width: w, height: h, data: floatData, ldrData };
  }
  function applyEnvTexture(srcTex, name) {
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(srcTex);
    srcTex.dispose();
    if (customEnvRT) customEnvRT.dispose();
    else if (customEnvTex) customEnvTex.dispose();
    customEnvRT = rt;
    customEnvTex = rt.texture;
    customEnvName = name || 'Umgebungsbild';
    applyLook();
    listeners.emit('viewmode');
  }
  function loadImgFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      img.src = url;
    });
  }
  function makeCompactEnvDataUrl(img) {
    try {
      const maxW = 512, maxH = 256;
      const w = img.naturalWidth || img.width || 256, h = img.naturalHeight || img.height || 128;
      const sc = Math.min(1, maxW / w, maxH / h);
      const cw = Math.max(16, Math.round(w * sc)), ch = Math.max(16, Math.round(h * sc));
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      return cv.toDataURL('image/jpeg', 0.82);
    } catch (_) {
      return null;
    }
  }
  async function setEnvImage(source, name = '') {
    if (!source) {
      if (customEnvRT) { customEnvRT.dispose(); customEnvRT = null; }
      else if (customEnvTex) customEnvTex.dispose();
      customEnvTex = null;
      customEnvName = '';
      applyLook();
      listeners.emit('viewmode');
      return { ok: true, cleared: true };
    }
    try {
      if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const fname = name || source.name || 'Umgebungsbild';
        const buf = await source.arrayBuffer();
        const head = String.fromCharCode.apply(null, new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
        const isHdr = /\.(hdr|pic)$/i.test(fname) || head.startsWith('#?RADIANCE') || head.startsWith('#?RGBE');
        if (isHdr) {
          const hdr = parseHDR(buf);
          let applied = false;
          if (hdr.data) {
            try {
              const dt = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, THREE.HalfFloatType);
              dt.mapping = THREE.EquirectangularReflectionMapping;
              dt.colorSpace = THREE.LinearSRGBColorSpace;
              dt.magFilter = THREE.LinearFilter;
              dt.minFilter = THREE.LinearFilter;
              dt.flipY = true;
              dt.needsUpdate = true;
              applyEnvTexture(dt, fname);
              applied = true;
            } catch (_) { applied = false; }
          }
          if (!applied) {
            const dt = new THREE.DataTexture(hdr.ldrData, hdr.width, hdr.height, THREE.RGBAFormat, THREE.UnsignedByteType);
            dt.mapping = THREE.EquirectangularReflectionMapping;
            dt.colorSpace = THREE.SRGBColorSpace;
            dt.magFilter = THREE.LinearFilter;
            dt.minFilter = THREE.LinearFilter;
            dt.flipY = true;
            dt.needsUpdate = true;
            applyEnvTexture(dt, fname);
          }
          return { ok: true, name: fname, type: 'hdr', width: hdr.width, height: hdr.height, dataUrl: null };
        }
        const url = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
          fr.readAsDataURL(source);
        });
        const img = await loadImgFromUrl(url);
        const tex = new THREE.Texture(img);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        applyEnvTexture(tex, fname);
        return { ok: true, name: fname, type: 'image', width: img.naturalWidth, height: img.naturalHeight, dataUrl: makeCompactEnvDataUrl(img) };
      }
      if (typeof source === 'string') {
        const img = await loadImgFromUrl(source);
        const tex = new THREE.Texture(img);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        applyEnvTexture(tex, name || 'Umgebungsbild');
        return { ok: true, name: name || 'Umgebungsbild', type: 'image', width: img.naturalWidth, height: img.naturalHeight, dataUrl: source };
      }
      if ((typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) || (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement)) {
        const tex = new THREE.Texture(source);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        applyEnvTexture(tex, name || 'Umgebungsbild');
        return { ok: true, name: name || 'Umgebungsbild', type: 'image', width: source.width, height: source.height, dataUrl: null };
      }
      return { ok: false, error: 'Unbekanntes Bildformat' };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }
  function lightDirFromAngles(azDeg, elDeg) {
    const az = ((Number(azDeg) || 0) * Math.PI) / 180;
    const el = (clamp(Number(elDeg) || 0, -85, 89) * Math.PI) / 180;
    return new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)).normalize();
  }
  function normalizeLightCfg(l, idx = 0) {
    const fb = LIGHT_PRESETS[idx % LIGHT_PRESETS.length] || DEFAULT_LIGHTS[0];
    const src = l && typeof l === 'object' ? l : {};
    const az = Number(src.azimuth);
    const el = Number(src.elevation);
    const inten = Number(src.intensity);
    const col = typeof src.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(src.color) ? src.color.toLowerCase() : fb.color;
    return {
      azimuth: Number.isFinite(az) ? clamp(Math.round(az), -180, 180) : fb.azimuth,
      elevation: Number.isFinite(el) ? clamp(Math.round(el), -60, 90) : fb.elevation,
      color: col,
      intensity: Number.isFinite(inten) ? clamp(Math.round(inten * 100) / 100, 0, 5) : fb.intensity,
    };
  }
  function syncLights() {
    if (!scene || !lights.key) return;
    const st = LOOK.look === 'studio';
    if (LOOK.manualLights) {
      for (const obj of [lights.key, lights.key.target, lights.fill, lights.rim]) {
        if (obj && obj.parent === scene) scene.remove(obj);
      }
      const cfgs = (Array.isArray(LOOK.lights) && LOOK.lights.length ? LOOK.lights : DEFAULT_LIGHTS).slice(0, 3).map((l, i) => normalizeLightCfg(l, i));
      LOOK.lights = cfgs;
      while (customLights.length > cfgs.length) {
        const old = customLights.pop();
        if (old.target && old.target.parent === scene) scene.remove(old.target);
        if (old.parent === scene) scene.remove(old);
        if (old.dispose) old.dispose();
      }
      while (customLights.length < cfgs.length) {
        const dl = new THREE.DirectionalLight(0xffffff, 1.5);
        dl.userData.customLight = true;
        if (customLights.length === 0) {
          dl.shadow.mapSize.set(2048, 2048);
          dl.shadow.radius = 4;
          dl.shadow.bias = -0.0006;
          dl.shadow.normalBias = 0.6;
        }
        scene.add(dl);
        scene.add(dl.target);
        customLights.push(dl);
      }
      for (let i = 0; i < cfgs.length; i++) {
        const cfg = cfgs[i], L = customLights[i];
        L.color.set(cfg.color);
        L.intensity = cfg.intensity;
        L.castShadow = i === 0 && st && LOOK.shadows;
        L.userData.lightIndex = i;
        L.userData.cfg = { ...cfg };
      }
      lights.hemi.intensity = st ? 0.22 : 0.4;
      return;
    }
    while (customLights.length) {
      const old = customLights.pop();
      if (old.target && old.target.parent === scene) scene.remove(old.target);
      if (old.parent === scene) scene.remove(old);
      if (old.dispose) old.dispose();
    }
    for (const obj of [lights.key, lights.key.target, lights.fill, lights.rim]) {
      if (obj && obj.parent !== scene) scene.add(obj);
    }
    lights.hemi.intensity = st ? 0.35 : 1.55;
    lights.key.intensity = 2.1;
    lights.fill.intensity = st ? 0.25 : 0.8;
    lights.rim.intensity = st ? 0.35 : 0.45;
    lights.key.castShadow = st && LOOK.shadows;
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
    const ill = isIllust();
    if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('tech-illustration', ill);
    const st = LOOK.look === 'studio' && !ill;
    scene.environment = st ? (customEnvTex || buildEnv(LOOK.mood)) : null;
    renderer.toneMapping = st ? THREE.NeutralToneMapping : THREE.NoToneMapping; renderer.toneMappingExposure = st ? 1.05 : 1;
    syncLights();
    fitShadow();
    restyleAll();
  }
  // Schatten-Kamera und Boden an die Teile anpassen (nach jeder Änderung der Teile)
  function fitShadow() {
    const st = LOOK.look === 'studio' && !isIllust();
    let box = null;
    if (nodes.size > 0) {
      const b = new THREE.Box3();
      for (const n of nodes.values()) if (n.role !== 'hole' && n.obj.visible && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox) b.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
      if (!b.isEmpty()) box = b;
    }
    const c = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
    const r = box ? Math.max(5, box.getSize(new THREE.Vector3()).length() / 2) : 40;
    const z0 = box ? Math.min(0, box.min.z) - 0.05 : -0.05;
    updateReflectFloor(box ? c : null, box ? r : 0, z0);

    const on = st && LOOK.shadows && !!box;
    shadowFloor.visible = on;
    if (on) {
      shadowFloor.position.set(c.x, c.y, z0);
      shadowFloor.scale.set(r * 6, r * 6, 1);
    }
    if (LOOK.manualLights && customLights.length) {
      for (let i = 0; i < customLights.length; i++) {
        const L = customLights[i];
        const cfg = (L.userData && L.userData.cfg) || LOOK.lights[i] || DEFAULT_LIGHTS[0];
        const dir = lightDirFromAngles(cfg.azimuth, cfg.elevation);
        L.target.position.copy(c);
        L.position.copy(c).addScaledVector(dir, r * 4);
        L.target.updateMatrixWorld();
        if (i === 0) {
          const sc = L.shadow.camera;
          sc.left = -r * 2.2; sc.right = r * 2.2; sc.top = r * 2.2; sc.bottom = -r * 2.2;
          sc.near = r * 0.5; sc.far = r * 9; sc.updateProjectionMatrix();
        }
      }
    } else if (on && lights.key) {
      const L = lights.key, dir = new THREE.Vector3(0.55, -0.8, 1.25).normalize();
      L.target.position.copy(c); L.position.copy(c).addScaledVector(dir, r * 4); L.target.updateMatrixWorld();
      const sc = L.shadow.camera; sc.left = -r * 2.2; sc.right = r * 2.2; sc.top = r * 2.2; sc.bottom = -r * 2.2; sc.near = r * 0.5; sc.far = r * 9; sc.updateProjectionMatrix();
    }
    renderer.shadowMap.needsUpdate = true; needsRender = true;
  }
  const fitShadowSoon = debounce(fitShadow, 60);
  function setLook(patch) {
    if (patch && typeof patch === 'object') {
      const next = { ...patch };
      if ('floorReflectStrength' in next) next.floorReflectStrength = clamp(Number(next.floorReflectStrength) || 0, 0, 1);
      if ('lights' in next) {
        next.lights = (Array.isArray(next.lights) && next.lights.length ? next.lights : DEFAULT_LIGHTS).slice(0, 3).map((l, i) => normalizeLightCfg(l, i));
      }
      Object.assign(LOOK, next);
    }
    applyLook();
    listeners.emit('viewmode');
  }
  // ein Bild in hoher Auflösung (Bild speichern)

  function loop() {
    requestAnimationFrame(loop);
    const loopNow = performance.now();
    const loopDt = lastLoopAt > 0 ? loopNow - lastLoopAt : 0;
    lastLoopAt = loopNow;
    if (quadState) {
      inLoopCam = true;
      let qMoved = false;
      const dampDt = loopDt > 24 ? (1 - Math.pow(1 - BASE_DAMP, clamp(loopDt / (1000 / 60), 1, 60))) : BASE_DAMP;
      for (const p of quadState.panes) {
        p.controls.dampingFactor = !p.orbitActive ? dampDt : BASE_DAMP;
        if (p.controls.update()) qMoved = true;
        p.controls.dampingFactor = BASE_DAMP;
      }
      inLoopCam = false;
      if (qMoved) {
        for (const p of quadState.panes) p.cam.updateMatrixWorld();
        listeners.emit('camera');
      }
      if (needsRender || qMoved) {
        needsRender = false;
        updateViewAids();
        listeners.emit('beforeRender');
        const t0 = performance.now();
        renderQuad();
        frameMs = frameMs * 0.7 + (performance.now() - t0) * 0.3;
        listeners.emit('afterRender');
      }
      return;
    }
    let camMoved = false;
    if (camAnim) {
      const t = Math.min(1, (loopNow - camAnim.t0) / camAnim.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.q0, camAnim.q1, e);
      if (camAnim.up0) camera.up.lerpVectors(camAnim.up0, camAnim.up1, e).normalize();
      if (t >= 1) { cancelCamAnim(); stopDamping(); }
      needsRender = true; camMoved = true;
    }
    if (controls) controls.dampingFactor = (!orbitActive && loopDt > 24) ? (1 - Math.pow(1 - BASE_DAMP, clamp(loopDt / (1000 / 60), 1, 60))) : BASE_DAMP;
    inLoopCam = true;
    const moved = controls.update();
    inLoopCam = false;
    if (controls) controls.dampingFactor = BASE_DAMP;
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
  const BASE_DAMP = 0.14;
  let basePR = 1, lowRes = false, frameMs = 0, lastMotion = 0, adaptive = true, slowMs = 24;
  let orbitActive = false, lastLoopAt = 0, adaptTimer = null;
  const _lastCam = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  function setPR(r) { const w = container.clientWidth || 1, hgt = container.clientHeight || 1; renderer.setPixelRatio(r); renderer.setSize(w, hgt, false); }
  function clearAdaptTimer() { if (adaptTimer) { clearTimeout(adaptTimer); adaptTimer = null; } }
  function restoreRes() {
    clearAdaptTimer();
    if (!lowRes) return;
    lowRes = false;
    setPR(basePR);
    needsRender = true;
  }
  function scheduleAdaptRestore() {
    clearAdaptTimer();
    if (!lowRes) return;
    const wait = Math.max(40, 240 - (performance.now() - lastMotion));
    adaptTimer = setTimeout(() => {
      adaptTimer = null;
      if (!lowRes) return;
      const now = performance.now();
      if (!adaptive) { restoreRes(); return; }
      if (camAnim || orbitActive) { scheduleAdaptRestore(); return; }
      // Bei rAF-Stau oder sehr langsamen Frames Dämpfung nach verstrichener Wandzeit ausrollen
      const dt = lastLoopAt > 0 ? now - lastLoopAt : 0;
      if (dt > 120 && controls) {
        const steps = clamp(dt / (1000 / 60), 1, 60);
        controls.dampingFactor = 1 - Math.pow(1 - BASE_DAMP, steps);
        inLoopCam = true;
        const moved = controls.update();
        inLoopCam = false;
        controls.dampingFactor = BASE_DAMP;
        if (moved) { camera.updateMatrixWorld(); listeners.emit('camera'); }
        lastLoopAt = now;
        const d = camera.position.distanceTo(_lastCam.p) / Math.max(1e-6, camera.position.distanceTo(controls.target)) + 2 * (1 - Math.abs(camera.quaternion.dot(_lastCam.q)));
        _lastCam.p.copy(camera.position); _lastCam.q.copy(camera.quaternion);
        if (d > 4e-4) {
          if (steps < 45) { lastMotion = now; scheduleAdaptRestore(); return; }
          stopDamping();
        }
      }
      if (now - lastMotion >= 200) restoreRes();
      else scheduleAdaptRestore();
    }, wait);
  }
  function adaptRes(now) {
    const moving = now - lastMotion < 200;
    if (adaptive && moving && !lowRes && frameMs > slowMs && basePR > 0.8) { lowRes = true; setPR(Math.max(0.6, basePR * 0.55)); scheduleAdaptRestore(); }
    else if (lowRes && (!moving || !adaptive)) restoreRes();
  }
  function setAdaptive(on, ms) { adaptive = !!on; if (ms != null) slowMs = ms; if (!adaptive && lowRes) restoreRes(); }
  function requestRender() { needsRender = true; }
  function renderNow() {
    needsRender = false;
    updateViewAids();
    listeners.emit('beforeRender');
    if (quadState) renderQuad();
    else renderer.render(scene, cam());
    listeners.emit('afterRender');
  }

  // ---------- Körper-Texturen (AN-16) & Aufkleber (AN-15) ----------
  const BODY_TEXTURES = {
    wood: { id: 'wood', file: 'assets/textures/holz.png', rough: 0.72, metal: 0.0, clear: 0.08, bumpScale: 0.18, tile: 50 },
    brushed: { id: 'brushed', file: 'assets/textures/metall-gebuerstet.png', rough: 0.30, metal: 0.88, clear: 0.12, bumpScale: 0.08, tile: 40 },
    carbon: { id: 'carbon', file: 'assets/textures/karbon.png', rough: 0.34, metal: 0.06, clear: 0.85, bumpScale: 0.14, tile: 18 },
  };
  const bodyTexCache = new Map();
  const decalTexCache = new Map();

  function drawFallbackTexture(kind) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d');
    if (kind === 'wood') {
      g.fillStyle = '#b6814e'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < N; y += 2) {
        g.fillStyle = y % 6 === 0 ? 'rgba(110,65,28,0.28)' : 'rgba(220,175,118,0.16)';
        g.fillRect(0, y, N, 2);
      }
    } else if (kind === 'brushed') {
      g.fillStyle = '#c8cdd3'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < N; y++) {
        const v = 185 + ((y * 37) % 45);
        g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
        g.fillRect(0, y, N, 1);
      }
    } else {
      g.fillStyle = '#202329'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) {
        g.fillStyle = ((x + y) / 8) % 2 === 0 ? '#383d46' : '#1b1e23';
        g.fillRect(x, y, 7, 7);
      }
    }
    return c;
  }

  function getBodyTexBase(kind) {
    const def = BODY_TEXTURES[kind];
    if (!def) return null;
    if (bodyTexCache.has(kind)) return bodyTexCache.get(kind);
    const entry = { tex: null, clones: new Set(), loaded: false, def };
    const loader = new THREE.TextureLoader();
    const tex = loader.load(
      def.file,
      (loaded) => {
        entry.loaded = true;
        for (const cl of entry.clones) { cl.image = loaded.image; cl.needsUpdate = true; }
        needsRender = true;
      },
      undefined,
      () => {
        const fb = drawFallbackTexture(kind);
        tex.image = fb; tex.needsUpdate = true; entry.loaded = true;
        for (const cl of entry.clones) { cl.image = fb; cl.needsUpdate = true; }
        needsRender = true;
      },
    );
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (renderer && renderer.capabilities) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    entry.tex = tex;
    bodyTexCache.set(kind, entry);
    return entry;
  }

  function acquireBodyTexture(texSpec) {
    if (!texSpec || !texSpec.kind) return null;
    const entry = getBodyTexBase(texSpec.kind);
    if (!entry) return null;
    const t = entry.tex.clone();
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    if (renderer && renderer.capabilities) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    const scale = Math.max(0.1, Number(texSpec.scale) || 1);
    const rep = 1 / (entry.def.tile * scale);
    t.repeat.set(rep, rep);
    t.center.set(0, 0);
    t.rotation = ((Number(texSpec.rot) || 0) * Math.PI) / 180;
    if (entry.loaded && entry.tex.image) { t.image = entry.tex.image; t.needsUpdate = true; }
    t.userData = { _ownedBodyTex: true, _entry: entry };
    entry.clones.add(t);
    return { map: t, def: entry.def };
  }

  function disposeNodeMaterial(mat) {
    if (!mat) return;
    if (mat.map && mat.map.userData && mat.map.userData._ownedBodyTex) {
      mat.map.userData._entry.clones.delete(mat.map);
      mat.map.dispose();
    }
    mat.dispose();
  }

  function ensureMeshUVs(n) {
    const g = n && n.mesh && n.mesh.geometry;
    if (!g || g.getAttribute('uv')) return;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const cnt = pos.count;
    const P = pos.array;
    const Nrm = g.getAttribute('normal') ? g.getAttribute('normal').array : null;
    const uv = new Float32Array(cnt * 2);
    const seen = new Uint8Array(cnt);
    const tri = n.data && n.data.triangles;
    const faces = (n.data && n.data.faces) || [];
    const groupsList = (n.data && n.data.faceGroups) || [];
    if (tri && groupsList.length) {
      for (const [start, count, fi] of groupsList) {
        const f = fi >= 0 ? faces[fi] : null;
        if (!f) continue;
        if (f.t === 'PLANE' && Array.isArray(f.n) && f.n.length >= 3) {
          const nv = new THREE.Vector3(f.n[0], f.n[1], f.n[2]).normalize();
          let ux = Math.abs(nv.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(nv).normalize();
          if (ux.lengthSq() < 1e-6) ux.set(1, 0, 0);
          if (nv.z < -0.9) ux.set(1, 0, 0);
          const uy = new THREE.Vector3().crossVectors(nv, ux).normalize();
          for (let i = start; i < start + count; i++) {
            const vi = tri[i];
            if (seen[vi]) continue;
            const px = P[vi * 3], py = P[vi * 3 + 1], pz = P[vi * 3 + 2];
            uv[vi * 2] = px * ux.x + py * ux.y + pz * ux.z;
            uv[vi * 2 + 1] = px * uy.x + py * uy.y + pz * uy.z;
            seen[vi] = 1;
          }
        } else if (f.t === 'CYLINDRE' && Array.isArray(f.axis) && f.axis.length >= 6 && f.r > 0) {
          const o = new THREE.Vector3(f.axis[0], f.axis[1], f.axis[2]);
          const d = new THREE.Vector3(f.axis[3], f.axis[4], f.axis[5]).normalize();
          const ref = Math.abs(d.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
          const e1 = new THREE.Vector3().crossVectors(ref, d).normalize();
          const e2 = new THREE.Vector3().crossVectors(d, e1).normalize();
          for (let i = start; i < start + count; i++) {
            const vi = tri[i];
            if (seen[vi]) continue;
            const rx = P[vi * 3] - o.x, ry = P[vi * 3 + 1] - o.y, rz = P[vi * 3 + 2] - o.z;
            const vv = rx * d.x + ry * d.y + rz * d.z;
            const a1 = rx * e1.x + ry * e1.y + rz * e1.z;
            const a2 = rx * e2.x + ry * e2.y + rz * e2.z;
            uv[vi * 2] = Math.atan2(a2, a1) * f.r;
            uv[vi * 2 + 1] = vv;
            seen[vi] = 1;
          }
        }
      }
    }
    for (let vi = 0; vi < cnt; vi++) {
      if (seen[vi]) continue;
      const px = P[vi * 3], py = P[vi * 3 + 1], pz = P[vi * 3 + 2];
      const nx = Nrm ? Math.abs(Nrm[vi * 3]) : 0;
      const ny = Nrm ? Math.abs(Nrm[vi * 3 + 1]) : 0;
      const nz = Nrm ? Math.abs(Nrm[vi * 3 + 2]) : 1;
      if (nz >= nx && nz >= ny) { uv[vi * 2] = px; uv[vi * 2 + 1] = py; }
      else if (nx >= ny) { uv[vi * 2] = py; uv[vi * 2 + 1] = pz; }
      else { uv[vi * 2] = px; uv[vi * 2 + 1] = pz; }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // ---------- Objekte ----------
  function getSmoothNormalAttr(geo) {
    if (geo.userData && geo.userData._smoothNormal) return geo.userData._smoothNormal;
    const pos = geo.getAttribute('position');
    const cnt = pos ? pos.count : 0;
    const out = new Float32Array(cnt * 3);
    if (!pos || !cnt) {
      const attr = new THREE.BufferAttribute(out, 3);
      if (geo.userData) geo.userData._smoothNormal = attr;
      return attr;
    }
    const P = pos.array;
    const idx = geo.index ? geo.index.array : null;
    const sums = new Map();
    const keyOf = (vi) => Math.round(P[vi * 3] * 1e4) + ',' + Math.round(P[vi * 3 + 1] * 1e4) + ',' + Math.round(P[vi * 3 + 2] * 1e4);
    const vKeys = new Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const k = keyOf(i);
      vKeys[i] = k;
      if (!sums.has(k)) sums.set(k, [0, 0, 0]);
    }
    const tLen = idx ? idx.length : cnt;
    for (let t = 0; t + 2 < tLen; t += 3) {
      const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
      const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2];
      const e1x = P[i1 * 3] - ax, e1y = P[i1 * 3 + 1] - ay, e1z = P[i1 * 3 + 2] - az;
      const e2x = P[i2 * 3] - ax, e2y = P[i2 * 3 + 1] - ay, e2z = P[i2 * 3 + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const vi of [i0, i1, i2]) {
        const s = sums.get(vKeys[vi]);
        s[0] += nx; s[1] += ny; s[2] += nz;
      }
    }
    const nAttr = geo.getAttribute('normal');
    for (let i = 0; i < cnt; i++) {
      const s = sums.get(vKeys[i]);
      let nx = s[0], ny = s[1], nz = s[2];
      let len = Math.hypot(nx, ny, nz);
      if (len < 1e-12 && nAttr) {
        nx = nAttr.array[i * 3]; ny = nAttr.array[i * 3 + 1]; nz = nAttr.array[i * 3 + 2];
        len = Math.hypot(nx, ny, nz);
      }
      if (len > 1e-12) { out[i * 3] = nx / len; out[i * 3 + 1] = ny / len; out[i * 3 + 2] = nz / len; }
      else { out[i * 3 + 2] = 1; }
    }
    const attr = new THREE.BufferAttribute(out, 3);
    if (geo.userData) geo.userData._smoothNormal = attr;
    return attr;
  }
  function makeOutlineMaterial(colorHex, clip, flipSide) {
    const hasClip = !!(clip && clip.length);
    const w = (container && container.clientWidth) || 1;
    const hgt = (container && container.clientHeight) || 1;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorHex || '#11161c') },
        uWidth: { value: 1.6 },
        uRes: { value: new THREE.Vector2(w, hgt) },
      },
      vertexShader: [
        'attribute vec3 smoothNormal;',
        'uniform float uWidth;',
        'uniform vec2 uRes;',
        '#include <clipping_planes_pars_vertex>',
        'void main() {',
        '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        '  vec4 clipPos = projectionMatrix * mvPosition;',
        '  vec3 viewN = normalize(normalMatrix * smoothNormal);',
        '  vec4 clipN = projectionMatrix * vec4(viewN, 0.0);',
        '  vec2 ndcDir = clipN.xy;',
        '  float len = length(ndcDir);',
        '  if (len > 1e-5) {',
        '    ndcDir /= len;',
        '    clipPos.xy += ndcDir * (uWidth * 2.0 / max(uRes, vec2(1.0))) * clipPos.w;',
        '  }',
        '  gl_Position = clipPos;',
        '  #include <clipping_planes_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        '#include <clipping_planes_pars_fragment>',
        'void main() {',
        '  #include <clipping_planes_fragment>',
        '  gl_FragColor = vec4(uColor, 1.0);',
        '}',
      ].join('\n'),
      side: flipSide ? THREE.FrontSide : THREE.BackSide,
      depthWrite: true,
      depthTest: true,
      clipping: hasClip,
      clippingPlanes: hasClip ? clip : [],
    });
    outlineMaterials.add(mat);
    return mat;
  }
  function disposeOutline(n) {
    if (!n || !n.outline) return;
    n.obj.remove(n.outline);
    if (n.outline.geometry) n.outline.geometry.dispose();
    if (n.outline.material) {
      outlineMaterials.delete(n.outline.material);
      n.outline.material.dispose();
    }
    n.outline = null;
  }
  function applyOutline(n, colorHex) {
    disposeOutline(n);
    if (!isIllust() || !n || n.role === 'hole' || n.allBodiesHidden || n.ctxDim || !n.mesh || !n.mesh.geometry) return;
    const src = n.mesh.geometry;
    const posAttr = src.getAttribute('position');
    if (!posAttr) return;
    const smoothAttr = getSmoothNormalAttr(src);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', posAttr);
    geo.setAttribute('smoothNormal', smoothAttr);
    if (src.index) geo.setIndex(src.index);
    const clip = vis.clips.length ? vis.clips : null;
    const flip = !!(n.base && n.base.determinant() < 0);
    const mat = makeOutlineMaterial(colorHex || '#11161c', clip, flip);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { noPick: true, outline: true };
    mesh.renderOrder = 0;
    n.outline = mesh;
    n.obj.add(mesh);
  }
  function makeMaterial(role, color, look, texture) {
    const clip = vis.clips.length ? vis.clips : null;
    if (role !== 'hole' && isIllust()) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        polygonOffset: true,
        polygonOffsetFactor: 1.5,
        polygonOffsetUnits: 1.5,
        clippingPlanes: clip,
        side: clip ? THREE.DoubleSide : THREE.FrontSide,
      });
    }
    if (role !== 'hole' && (LOOK.look === 'clay' || LOOK.look === 'chrome')) {
      const m = new THREE.MeshMatcapMaterial({ matcap: matcap(LOOK.look), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
      if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, '#9c8370'); }
      return m;
    }
    const bt = role !== 'hole' && texture && BODY_TEXTURES[texture.kind] ? acquireBodyTexture(texture) : null;
    if (role !== 'hole' && LOOK.look === 'studio') {
      const L = look || PLASTIC; color = L.matCol || color;
      if (bt) {
        const baseCol = (look && look.customColor) ? (color || '#ffffff') : '#ffffff';
        const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(baseCol), map: bt.map, bumpMap: bt.map, bumpScale: bt.def.bumpScale, metalness: bt.def.metal, roughness: bt.def.rough, clearcoat: bt.def.clear, clearcoatRoughness: 0.2, envMapIntensity: bt.def.metal > 0.5 ? 1.15 : 0.65, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
        if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, baseCol); }
        return m;
      }
      const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color || '#2f9e91'), metalness: L.metal || 0, roughness: L.rough != null ? L.rough : 0.45, clearcoat: L.clear || 0, clearcoatRoughness: L.clearRough != null ? L.clearRough : 0.2, envMapIntensity: L.metal ? 1.15 : L.nat ? 0.55 : 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
      if (L.glass) { m.transparent = true; m.opacity = L.glass; m.depthWrite = false; }
      if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, color); }
      return m;
    }
    if (role === 'hole') return new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.hole), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, clippingPlanes: clip });
    if (bt) {
      const baseCol = (look && look.customColor) ? (color || '#ffffff') : '#ffffff';
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseCol), map: bt.map, roughness: bt.def.rough, metalness: bt.def.metal * 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip });
      if (clip) { m.side = THREE.DoubleSide; if (!vis.capEnabled) capShader(m, baseCol); }
      return m;
    }
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
    const sel = n.selected, hov = n.hover, ill = isIllust();
    if (n.texture && BODY_TEXTURES[n.texture.kind] && n.role !== 'hole' && !ill) ensureMeshUVs(n);
    disposeNodeMaterial(n.mesh.material);
    n.mesh.material = makeMaterial(n.role, n.color, n.look, n.texture);
    n.mesh.castShadow = n.mesh.receiveShadow = n.role !== 'hole' && !ill;
    applyFaceColors(n);
    applyThreads(n);
    applyDecals(n);
    if (n.ctxDim) {   // anderes Bauteil, während eines bearbeitet wird
      disposeOutline(n);
      const clip = vis.clips.length ? vis.clips : null;
      n.mesh.material.transparent = true; n.mesh.material.opacity = n.role === 'hole' ? 0.06 : 0.16; n.mesh.material.depthWrite = false;
      if (n.edges) { n.edges.material.dispose(); n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.edge), transparent: true, opacity: 0.18, clippingPlanes: clip }); }
      n.mesh.renderOrder = 4; needsRender = true; return;
    }
    if (n.role !== 'hole' && ill) {
      n.mesh.material.color.set('#ffffff');
    } else if (n.role !== 'hole' && n.mesh.material.isMeshMatcapMaterial) {
      if (sel || hov) n.mesh.material.color.lerp(new THREE.Color(theme.accent), sel ? 0.45 : 0.2);
    } else if (n.role !== 'hole' && !n.mesh.material.isMeshBasicMaterial) {
      const em = new THREE.Color(theme.accent);
      n.mesh.material.emissive = em; n.mesh.material.emissiveIntensity = sel ? 0.16 : hov ? 0.07 : 0;
    } else if (n.role === 'hole') {
      n.mesh.material.opacity = sel ? 0.34 : hov ? 0.28 : n.dim ? 0.1 : 0.2;
    }
    // Durchsichtig je Teil (Eigenschaft des Teils)
    if (n.role !== 'hole' && n.opacity != null && n.opacity < 1) { const mt = n.mesh.material; mt.transparent = true; mt.opacity = Math.max(0.05, n.opacity); mt.depthWrite = false; }
    // Anzeige-Art: nur Flächen, Drahtgitter (nur Kanten), mit verdeckten Kanten oder Technische Illustration
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
      else if (ill) n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(sel ? theme.accent : '#11161c'), transparent: xr, opacity: sel ? 1 : xr ? 0.55 : 1, depthTest: !xr, clippingPlanes: clip });
      else n.edges.material = new THREE.LineBasicMaterial({ color: new THREE.Color(sel ? theme.accent : theme.edge), transparent: true, opacity: sel ? 1 : xr ? 0.42 : 0.5, depthTest: !xr, clippingPlanes: clip });
    }
    n.mesh.renderOrder = n.role === 'hole' ? 3 : xr ? (sel ? 2 : 1) : 0;
    if (n.edges) { n.edges.renderOrder = xr ? 5 : 0; n.edges.visible = disp !== 'shaded' || sel || n.role === 'hole'; if (disp === 'wire' && n.role !== 'hole' && !sel) { n.edges.material.opacity = 0.9; n.edges.material.color = new THREE.Color(theme.edge).lerp(new THREE.Color(n.color || '#2f9e91'), 0.5); } }
    if (disp === 'wire' || disp === 'hidden' || disp === 'illustration') n.mesh.castShadow = false;
    if (ill && n.role !== 'hole' && !n.allBodiesHidden) applyOutline(n, sel ? theme.accent : '#11161c');
    else disposeOutline(n);
    if (n.allBodiesHidden) { n.mesh.visible = false; if (n.edges) n.edges.visible = false; if (n.outline) n.outline.visible = false; if (n.decalGroup) n.decalGroup.visible = false; }
    else { n.mesh.visible = true; if (n.outline) n.outline.visible = true; if (n.decalGroup) n.decalGroup.visible = true; }
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
      if (mb && mb.hidden) hiddenBodies.add(bi);
      const col = (mb && mb.color) || (eb[bi] && eb[bi].color) || null;
      if (col) bodyColors.set(bi, new THREE.Color(col));
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
    if (selFaces.length && n.data.faceBody) {
      const keep = [];
      let changed = false;
      for (const sf of selFaces) {
        if (sf.id === n.id && sf.faceIdx >= 0 && hiddenBodies.has(n.data.faceBody[sf.faceIdx])) {
          groups.overlay.remove(sf.mesh); sf.mesh.geometry.dispose(); sf.mesh.material.dispose();
          changed = true;
        } else keep.push(sf);
      }
      if (changed) { selFaces = keep; needsRender = true; }
    }
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
    if ((!hasFace && !hasBody) || n.role === 'hole' || isIllust() || !m || m.isMeshMatcapMaterial) { if (g.getAttribute('color')) g.deleteAttribute('color'); if (m) m.vertexColors = false; n.faceIdx = null; return; }
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
    if (isIllust() || !n.threads || !n.threads.length || n.role === 'hole') return;
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
      const pitch = (th.pitch > 0 ? th.pitch : null) || (spec ? spec.pitch : 1);
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
  // Aufkleber & Logos auf ebenen Flächen (AN-15)
  function getDecalTexture(src) {
    if (!src) return null;
    if (decalTexCache.has(src)) return decalTexCache.get(src);
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (renderer && renderer.capabilities) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    const entry = { tex, loaded: false };
    decalTexCache.set(src, entry);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const iw = img.naturalWidth || img.width || 512;
      const ih = img.naturalHeight || img.height || 512;
      const maxD = 1024;
      const s = Math.min(1, maxD / Math.max(iw, ih));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(iw * s));
      cv.height = Math.max(1, Math.round(ih * s));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      tex.image = cv;
      tex.needsUpdate = true;
      entry.loaded = true;
      needsRender = true;
    };
    img.src = src;
    return entry;
  }
  function decalFaceFrame(n, dc) {
    if (!dc || !dc.face) return null;
    const fi = n.data && n.data.faces ? faceIndexOf(n, dc.face) : -1;
    if (fi >= 0 && n.hiddenBodies && n.hiddenBodies.size && n.data.faceBody && n.hiddenBodies.has(n.data.faceBody[fi])) return null;
    const f = fi >= 0 ? n.data.faces[fi] : dc.face;
    const fn = (f && Array.isArray(f.n) && f.n.length >= 3) ? f.n : (dc.face.n || [0, 0, 1]);
    const fc = (f && Array.isArray(f.c) && f.c.length >= 3) ? f.c : (dc.face.c || [0, 0, 0]);
    const nv = new THREE.Vector3(fn[0], fn[1], fn[2]).normalize();
    let x = Math.abs(nv.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(nv).normalize();
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    if (nv.z < -0.9) x.set(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(nv, x).normalize();
    return { o: new THREE.Vector3(fc[0], fc[1], fc[2]), x, y, n: nv };
  }
  function disposeDecals(n) {
    if (!n || !n.decalGroup) return;
    n.obj.remove(n.decalGroup);
    n.decalGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    n.decalGroup = null;
  }
  function applyDecals(n) {
    disposeDecals(n);
    if (isIllust() || !n.decals || !n.decals.length || n.role === 'hole') return;
    const dg = new THREE.Group();
    dg.userData.decalGroup = true;
    const clip = vis.clips.length ? vis.clips : null;
    const baseOp = n.ctxDim ? 0.14 : (LOOK.display === 'wire' ? 0.25 : 1);
    for (const dc of n.decals) {
      if (!dc || !dc.src) continue;
      const fr = decalFaceFrame(n, dc);
      if (!fr) continue;
      const entry = getDecalTexture(dc.src);
      if (!entry) continue;
      const w = Math.max(0.2, (Number(dc.w) || 20) * (Number(dc.scale) || 1));
      const hgt = w / Math.max(0.05, Number(dc.aspect) || 1);
      const geo = new THREE.PlaneGeometry(w, hgt);
      if (dc.flipX) {
        const uvAttr = geo.getAttribute('uv');
        for (let i = 0; i < uvAttr.count; i++) uvAttr.setX(i, 1 - uvAttr.getX(i));
        uvAttr.needsUpdate = true;
      }
      const mat = new THREE.MeshStandardMaterial({
        map: entry.tex,
        transparent: true,
        opacity: baseOp * clamp(Number(dc.opacity ?? 1), 0.05, 1),
        alphaTest: 0.01,
        roughness: 0.45,
        metalness: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.FrontSide,
        clippingPlanes: clip,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const rad = ((Number(dc.rot) || 0) * Math.PI) / 180;
      const cs = Math.cos(rad), sn = Math.sin(rad);
      const rx = fr.x.clone().multiplyScalar(cs).addScaledVector(fr.y, sn);
      const ry = fr.y.clone().multiplyScalar(cs).addScaledVector(fr.x, -sn);
      const basis = new THREE.Matrix4().makeBasis(rx, ry, fr.n);
      mesh.quaternion.setFromRotationMatrix(basis);
      mesh.position.copy(fr.o)
        .addScaledVector(fr.x, Number(dc.u) || 0)
        .addScaledVector(fr.y, Number(dc.v) || 0)
        .addScaledVector(fr.n, 0.03);
      mesh.userData = { decalId: dc.id, noPick: true };
      mesh.renderOrder = 3;
      dg.add(mesh);
    }
    if (dg.children.length) { n.decalGroup = dg; n.obj.add(dg); }
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
    if (hoverFace && hoverFace.id === n.id) hoverFace.mesh.matrix.copy(n.obj.matrix);
    for (const f of selFaces) if (f.id === n.id) f.mesh.matrix.copy(n.obj.matrix);
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
    const n = { id, obj, mesh, edges, data, role: info.role, color: info.color, look: info.look || null, opacity: info.opacity ?? null, faceColors: info.faceColors || null, threads: info.threads || null, texture: info.texture ? { ...info.texture } : null, _texJson: JSON.stringify(info.texture || null), decals: info.decals ? info.decals.map((d) => ({ ...d })) : null, _decalsJson: JSON.stringify(info.decals || null), decalGroup: null, outline: null, bodies: info.bodies || null, hiddenBodies: null, bodyColors: null, visFaceGroups: null, visEdgeGroups: null, visLines: null, allBodiesHidden: false, _filtered: false, selected: false, hover: false, key: info.key, base: info.matrix.clone(), off: old && old.off ? old.off : null };
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
    if (info.texture !== undefined) {
      const tj = JSON.stringify(info.texture || null);
      if (tj !== n._texJson) { n.texture = info.texture ? { ...info.texture } : null; n._texJson = tj; restyle = true; }
    }
    if (info.decals !== undefined) {
      const dj = JSON.stringify(info.decals || null);
      if (dj !== n._decalsJson) { n.decals = info.decals ? info.decals.map((d) => ({ ...d })) : null; n._decalsJson = dj; restyle = true; }
    }
    if (info.bodies !== undefined && (info.forceBodies || JSON.stringify(info.bodies) !== JSON.stringify(n.bodies))) { n.bodies = info.bodies; applyBodies(n); restyle = true; fitShadowSoon(); }
    else if (info.forceBodies) { applyBodies(n); restyle = true; }
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
    disposeDecals(n);
    disposeOutline(n);
    groups.nodes.remove(n.obj);
    n.mesh.geometry.dispose(); disposeNodeMaterial(n.mesh.material); n.edges.geometry.dispose(); n.edges.material.dispose();
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
  // ---------- Schräge- und Hinterschnitt-Analyse (PF-09, PF-10) ----------
  // Färbt alle Flächen je nach Entformungsrichtung: grün = genug Schräge, gelb = zu wenig Schräge, rot = Hinterschnitt.
  function draftAnalysis(opts = {}) {
    const rawDir = Array.isArray(opts.dir) ? opts.dir : (opts.dir && typeof opts.dir.x === 'number' ? [opts.dir.x, opts.dir.y, opts.dir.z] : [0, 0, 1]);
    const d = new THREE.Vector3(Number(rawDir[0]) || 0, Number(rawDir[1]) || 0, Number(rawDir[2]) || 0);
    if (d.lengthSq() < 1e-12) d.set(0, 0, 1);
    else d.normalize();
    const minAngle = clamp(Number(opts.minAngle ?? 1), 0, 89);
    const twoSided = opts.twoSided !== false;
    const only = Array.isArray(opts.only) ? opts.only : null;

    const solids = [...nodes.values()].filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.mesh && n.data && n.data.triangles && (!only || only.includes(n.id)));
    if (!solids.length) {
      return {
        pos: [], norms: [], colors: [],
        areas: { ok: 0, warn: 0, undercut: 0, total: 0 },
        counts: { ok: 0, warn: 0, undercut: 0 },
        faces: [], box: null, dir: [d.x, d.y, d.z], minAngle, twoSided,
      };
    }

    const ref = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ref, d).normalize();
    const v = new THREE.Vector3().crossVectors(d, u).normalize();

    const worldBox = new THREE.Box3();
    const tris = [];
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    const aV = new THREE.Vector3(), bV = new THREE.Vector3(), cV = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();

    for (let ni = 0; ni < solids.length; ni++) {
      const n = solids[ni];
      const W = worldTris(n);
      const nt = W.length / 9;
      const triFace = new Int32Array(nt).fill(-1);
      for (const [start, count, fi] of n.visFaceGroups || n.data.faceGroups || []) {
        const t0 = Math.floor(start / 3), t1 = Math.floor((start + count) / 3);
        for (let ti = t0; ti < t1 && ti < nt; ti++) triFace[ti] = fi;
      }
      for (let ti = 0; ti < nt; ti++) {
        const k = ti * 9;
        aV.set(W[k], W[k + 1], W[k + 2]);
        bV.set(W[k + 3], W[k + 4], W[k + 5]);
        cV.set(W[k + 6], W[k + 7], W[k + 8]);
        nrm.crossVectors(ab.subVectors(bV, aV), ac.subVectors(cV, aV));
        const L = nrm.length();
        if (L < 1e-12) continue;
        nrm.divideScalar(L);
        worldBox.expandByPoint(aV).expandByPoint(bV).expandByPoint(cV);
        const au = aV.dot(u), av = aV.dot(v), aw = aV.dot(d);
        const bu = bV.dot(u), bv = bV.dot(v), bw = bV.dot(d);
        const cu = cV.dot(u), cv = cV.dot(v), cw = cV.dot(d);
        const det = (bu - au) * (cv - av) - (bv - av) * (cu - au);
        uMin = Math.min(uMin, au, bu, cu); uMax = Math.max(uMax, au, bu, cu);
        vMin = Math.min(vMin, av, bv, cv); vMax = Math.max(vMax, av, bv, cv);
        tris.push({
          ni, fi: triFace[ti], area: L * 0.5,
          ax: aV.x, ay: aV.y, az: aV.z, bx: bV.x, by: bV.y, bz: bV.z, cx: cV.x, cy: cV.y, cz: cV.z,
          nx: nrm.x, ny: nrm.y, nz: nrm.z,
          au, av, aw, bu, bv, bw, cu, cv, cw, det,
        });
      }
    }

    if (!tris.length || worldBox.isEmpty()) {
      return {
        pos: [], norms: [], colors: [],
        areas: { ok: 0, warn: 0, undercut: 0, total: 0 },
        counts: { ok: 0, warn: 0, undercut: 0 },
        faces: [], box: null, dir: [d.x, d.y, d.z], minAngle, twoSided,
      };
    }

    const spanU = Math.max(1e-3, uMax - uMin), spanV = Math.max(1e-3, vMax - vMin);
    const gridN = clamp(Math.ceil(Math.sqrt(tris.length)), 16, 80);
    const cell = Math.max(spanU, spanV) / gridN;
    const grid = new Map();
    const ci = (val, origin) => clamp(Math.floor((val - origin) / cell), 0, gridN + 1);
    for (let ti = 0; ti < tris.length; ti++) {
      const t = tris[ti];
      if (Math.abs(t.det) <= 1e-10) continue;
      const i0 = ci(Math.min(t.au, t.bu, t.cu), uMin), i1 = ci(Math.max(t.au, t.bu, t.cu), uMin);
      const j0 = ci(Math.min(t.av, t.bv, t.cv), vMin), j1 = ci(Math.max(t.av, t.bv, t.cv), vMin);
      for (let ix = i0; ix <= i1; ix++) {
        for (let iy = j0; iy <= j1; iy++) {
          const key = ix + ',' + iy;
          let arr = grid.get(key);
          if (!arr) grid.set(key, (arr = []));
          arr.push(ti);
        }
      }
    }

    const diag = Math.max(1, worldBox.getSize(new THREE.Vector3()).length());
    const eps = clamp(diag * 1e-5, 1e-4, 5e-3);
    const wTol = Math.max(1e-4, eps * 0.5);
    const dirEps = Math.sin((0.05 * Math.PI) / 180);
    const tolAng = minAngle <= 1e-6 ? 0.05 : 1e-3;
    const off = Math.max(0.015, diag * 0.00025);

    const COL_OK = new THREE.Color('#2fb36d');
    const COL_WARN = new THREE.Color('#f0b429');
    const COL_BAD = new THREE.Color('#e0483b');

    const pos = new Float32Array(tris.length * 9);
    const norms = new Float32Array(tris.length * 9);
    const colors = new Float32Array(tris.length * 9);
    const areas = { ok: 0, warn: 0, undercut: 0, total: 0 };
    const counts = { ok: 0, warn: 0, undercut: 0 };
    const faceMap = new Map();

    for (let ti = 0; ti < tris.length; ti++) {
      const t = tris[ti];
      const px = (t.ax + t.bx + t.cx) / 3 + eps * t.nx;
      const py = (t.ay + t.by + t.cy) / 3 + eps * t.ny;
      const pz = (t.az + t.bz + t.cz) / 3 + eps * t.nz;
      const pu = px * u.x + py * u.y + pz * u.z;
      const pv = px * v.x + py * v.y + pz * v.z;
      const pw = px * d.x + py * d.y + pz * d.z;

      let blockedPos = false, blockedNeg = false;
      const list = grid.get(ci(pu, uMin) + ',' + ci(pv, vMin));
      if (list) {
        for (let li = 0; li < list.length; li++) {
          const qi = list[li];
          if (qi === ti) continue;
          const q = tris[qi];
          const inv = 1 / q.det;
          const bu = ((pu - q.au) * (q.cv - q.av) - (pv - q.av) * (q.cu - q.au)) * inv;
          if (bu < -1e-6 || bu > 1 + 1e-6) continue;
          const bv = ((q.bu - q.au) * (pv - q.av) - (q.bv - q.av) * (pu - q.au)) * inv;
          if (bv < -1e-6 || bu + bv > 1 + 1e-6) continue;
          const hitW = q.aw + bu * (q.bw - q.aw) + bv * (q.cw - q.aw);
          if (hitW > pw + wTol) blockedPos = true;
          else if (hitW < pw - wTol) blockedNeg = true;
          if (blockedPos && (!twoSided || blockedNeg)) break;
        }
      }

      const s = t.nx * d.x + t.ny * d.y + t.nz * d.z;
      const alpha = (Math.asin(clamp(s, -1, 1)) * 180) / Math.PI;
      const canPos = s >= -dirEps && !blockedPos;
      const canNeg = twoSided && s <= dirEps && !blockedNeg;
      let status, effAngle = alpha;
      if (!canPos && !canNeg) {
        status = 'undercut';
      } else {
        if (canPos && !canNeg) effAngle = alpha;
        else if (canNeg && !canPos) effAngle = -alpha;
        else effAngle = Math.abs(alpha);
        status = effAngle >= minAngle - tolAng ? 'ok' : 'warn';
      }

      areas[status] += t.area;
      areas.total += t.area;
      counts[status]++;

      const col = status === 'ok' ? COL_OK : status === 'warn' ? COL_WARN : COL_BAD;
      const o = ti * 9;
      const ox = t.nx * off, oy = t.ny * off, oz = t.nz * off;
      pos[o] = t.ax + ox; pos[o + 1] = t.ay + oy; pos[o + 2] = t.az + oz;
      pos[o + 3] = t.bx + ox; pos[o + 4] = t.by + oy; pos[o + 5] = t.bz + oz;
      pos[o + 6] = t.cx + ox; pos[o + 7] = t.cy + oy; pos[o + 8] = t.cz + oz;
      for (let m = 0; m < 3; m++) {
        const mo = o + m * 3;
        norms[mo] = t.nx; norms[mo + 1] = t.ny; norms[mo + 2] = t.nz;
        colors[mo] = col.r; colors[mo + 1] = col.g; colors[mo + 2] = col.b;
      }

      const n = solids[t.ni];
      const fk = n.id + ':' + t.fi;
      let fe = faceMap.get(fk);
      if (!fe) {
        fe = { ni: t.ni, fi: t.fi, area: 0, areaOk: 0, areaWarn: 0, areaUndercut: 0, angleSum: 0, cx: 0, cy: 0, cz: 0, nx: 0, ny: 0, nz: 0 };
        faceMap.set(fk, fe);
      }
      fe.area += t.area;
      if (status === 'ok') fe.areaOk += t.area;
      else if (status === 'warn') fe.areaWarn += t.area;
      else fe.areaUndercut += t.area;
      fe.angleSum += effAngle * t.area;
      fe.cx += ((t.ax + t.bx + t.cx) / 3) * t.area;
      fe.cy += ((t.ay + t.by + t.cy) / 3) * t.area;
      fe.cz += ((t.az + t.bz + t.cz) / 3) * t.area;
      fe.nx += t.nx * t.area;
      fe.ny += t.ny * t.area;
      fe.nz += t.nz * t.area;
    }

    const faces = [];
    for (const fe of faceMap.values()) {
      const n = solids[fe.ni];
      const f = fe.fi >= 0 && n.data && Array.isArray(n.data.faces) ? n.data.faces[fe.fi] : null;
      const status = (fe.areaUndercut >= fe.area * 0.5 || (fe.areaUndercut > fe.areaOk && fe.areaUndercut > fe.areaWarn))
        ? 'undercut'
        : (fe.areaWarn > fe.areaOk ? 'warn' : 'ok');
      let normal;
      if (f && f.n) {
        normal = new THREE.Vector3(...f.n).transformDirection(n.mesh.matrixWorld).normalize().toArray();
      } else {
        const nl = Math.hypot(fe.nx, fe.ny, fe.nz) || 1;
        normal = [fe.nx / nl, fe.ny / nl, fe.nz / nl];
      }
      const center = (f && f.c)
        ? new THREE.Vector3(...f.c).applyMatrix4(n.mesh.matrixWorld).toArray()
        : (fe.area > 0 ? [fe.cx / fe.area, fe.cy / fe.area, fe.cz / fe.area] : [0, 0, 0]);
      faces.push({
        id: n.id, faceIdx: fe.fi, type: f ? f.t : null, status,
        area: fe.area, areaOk: fe.areaOk, areaWarn: fe.areaWarn, areaUndercut: fe.areaUndercut,
        angle: fe.area > 0 ? round(fe.angleSum / fe.area, 2) : 0,
        center, normal,
      });
    }

    return {
      pos, norms, colors, areas, counts, faces, box: worldBox,
      dir: [d.x, d.y, d.z], minAngle, twoSided,
    };
  }
  // ---------- Kleinster Innenradius (PF-11): findet alle konkaven Innenrundungen und Bohrungen ----------
  function innerRadiusAnalysis(opts = {}) {
    const cutterRadius = Math.max(0.01, Number(opts.cutterRadius ?? 3));
    const includeHoles = opts.includeHoles !== false;
    const only = Array.isArray(opts.only) ? opts.only : null;
    const solids = [...nodes.values()].filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.mesh && n.data && n.data.triangles && (!only || only.includes(n.id)));
    if (!solids.length) {
      return {
        cutterRadius, includeHoles, minRadius: null,
        tooSmallCount: 0, okCount: 0, totalCount: 0, tooSmallArea: 0, okArea: 0,
        faces: [], tooSmallPos: [], tooSmallNorms: [], okPos: [], okNorms: [], box: null,
      };
    }

    const worldBox = new THREE.Box3();
    for (const n of solids) {
      n.obj.updateMatrixWorld(true);
      const b = baseBox(n.id);
      if (b) worldBox.union(b);
    }
    const diag = worldBox.isEmpty() ? 24 : Math.max(1, worldBox.getSize(new THREE.Vector3()).length());
    const off = Math.max(0.015, diag * 0.00025);

    const aV = new THREE.Vector3(), bV = new THREE.Vector3(), cV = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), lN = new THREE.Vector3();
    const wA = new THREE.Vector3(), wB = new THREE.Vector3(), wC = new THREE.Vector3(), wN = new THREE.Vector3();

    const detected = [];
    const tooSmallPos = [], tooSmallNorms = [];
    const okPos = [], okNorms = [];
    let tooSmallArea = 0, okArea = 0;

    const estimateFreeformRadius = (P, T, start, count) => {
      const tris = [];
      const edgeMap = new Map();
      const qk = (x, y, z) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
      const eKey = (k1, k2) => (k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1);
      for (let i = start; i + 2 < start + count; i += 3) {
        const i0 = T[i], i1 = T[i + 1], i2 = T[i + 2];
        aV.fromArray(P, i0 * 3); bV.fromArray(P, i1 * 3); cV.fromArray(P, i2 * 3);
        lN.crossVectors(ab.subVectors(bV, aV), ac.subVectors(cV, aV));
        const L = lN.length();
        if (L < 1e-12) continue;
        lN.divideScalar(L);
        const ti = tris.length;
        const cen = [(aV.x + bV.x + cV.x) / 3, (aV.y + bV.y + cV.y) / 3, (aV.z + bV.z + cV.z) / 3];
        tris.push({ n: [lN.x, lN.y, lN.z], c: cen });
        const keys = [qk(aV.x, aV.y, aV.z), qk(bV.x, bV.y, bV.z), qk(cV.x, cV.y, cV.z)];
        const pts = [[aV.x, aV.y, aV.z], [bV.x, bV.y, bV.z], [cV.x, cV.y, cV.z]];
        for (let e = 0; e < 3; e++) {
          const kA = keys[e], kB = keys[(e + 1) % 3];
          if (kA === kB) continue;
          const ek = eKey(kA, kB);
          let arr = edgeMap.get(ek);
          if (!arr) { arr = { pA: pts[e], pB: pts[(e + 1) % 3], tris: [] }; edgeMap.set(ek, arr); }
          arr.tris.push(ti);
        }
      }
      if (tris.length < 2) return null;
      let lenConcave = 0, lenConvex = 0;
      const radii = [];
      for (const ed of edgeMap.values()) {
        if (ed.tris.length !== 2) continue;
        const tA = tris[ed.tris[0]], tB = tris[ed.tris[1]];
        const cs = clamp(tA.n[0] * tB.n[0] + tA.n[1] * tB.n[1] + tA.n[2] * tB.n[2], -1, 1);
        const theta = Math.acos(cs);
        if (theta < 0.015 || theta > 1.4) continue;
        const el = Math.hypot(ed.pB[0] - ed.pA[0], ed.pB[1] - ed.pA[1], ed.pB[2] - ed.pA[2]);
        if (el < 1e-5) continue;
        const dx = tB.c[0] - tA.c[0], dy = tB.c[1] - tA.c[1], dz = tB.c[2] - tA.c[2];
        const s = tA.n[0] * dx + tA.n[1] * dy + tA.n[2] * dz;
        if (s > 1e-7) {
          lenConcave += el;
          const dc = Math.hypot(dx, dy, dz);
          const rEst = dc / (2 * Math.sin(theta / 2));
          if (isFinite(rEst) && rEst > 1e-3 && rEst < 1e4) radii.push(rEst);
        } else if (s < -1e-7) {
          lenConvex += el;
        }
      }
      const tot = lenConcave + lenConvex;
      if (radii.length < 2 || tot <= 1e-6 || lenConcave / tot <= 0.65) return null;
      radii.sort((x, y) => x - y);
      return radii[Math.floor(radii.length * 0.15)];
    };

    for (const n of solids) {
      const P = n.mesh.geometry.getAttribute('position').array;
      const T = n.mesh.geometry.index ? n.mesh.geometry.index.array : n.data.triangles;
      const groups = n.visFaceGroups || n.data.faceGroups || [];
      const facesMeta = n.data.faces || [];
      const M = n.mesh.matrixWorld;
      const normalMat = new THREE.Matrix3().getNormalMatrix(M);
      const flipN = M.determinant() < 0 ? -1 : 1;

      for (const [start, count, fi] of groups) {
        const f = facesMeta[fi];
        if (!f || f.t === 'PLANE' || count < 3) continue;

        let area = 0, concavWeight = 0;
        let cxSum = 0, cySum = 0, czSum = 0;
        const triIdxList = [];

        let axO = 0, axOy = 0, axOz = 0, axDx = 0, axDy = 0, axDz = 1;
        let uAx = null, vAx = null, thetas = null;
        if (f.axis && f.axis.length >= 6) {
          axO = f.axis[0]; axOy = f.axis[1]; axOz = f.axis[2];
          const dl = Math.hypot(f.axis[3], f.axis[4], f.axis[5]) || 1;
          axDx = f.axis[3] / dl; axDy = f.axis[4] / dl; axDz = f.axis[5] / dl;
          if (f.t === 'CYLINDRE') {
            const dVec = new THREE.Vector3(axDx, axDy, axDz);
            const ref = Math.abs(axDz) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
            uAx = new THREE.Vector3().crossVectors(ref, dVec).normalize();
            vAx = new THREE.Vector3().crossVectors(dVec, uAx).normalize();
            thetas = [];
          }
        }

        let coneMinR = Infinity;
        for (let i = start; i + 2 < start + count; i += 3) {
          const i0 = T[i], i1 = T[i + 1], i2 = T[i + 2];
          aV.fromArray(P, i0 * 3); bV.fromArray(P, i1 * 3); cV.fromArray(P, i2 * 3);
          lN.crossVectors(ab.subVectors(bV, aV), ac.subVectors(cV, aV));
          const L = lN.length();
          if (L < 1e-12) continue;
          lN.divideScalar(L);
          const ta = L * 0.5;
          const cx = (aV.x + bV.x + cV.x) / 3, cy = (aV.y + bV.y + cV.y) / 3, cz = (aV.z + bV.z + cV.z) / 3;
          area += ta;
          cxSum += cx * ta; cySum += cy * ta; czSum += cz * ta;
          triIdxList.push(i0, i1, i2);

          if (f.t === 'CYLINDRE' && f.r > 0 && f.axis) {
            const vx = cx - axO, vy = cy - axOy, vz = cz - axOz;
            const proj = vx * axDx + vy * axDy + vz * axDz;
            const rx = vx - proj * axDx, ry = vy - proj * axDy, rz = vz - proj * axDz;
            const rl = Math.hypot(rx, ry, rz);
            if (rl > 1e-9) concavWeight += (-(lN.x * rx + lN.y * ry + lN.z * rz) / rl) * ta;
            if (thetas) {
              for (const pt of [aV, bV, cV]) {
                const px = pt.x - axO, py = pt.y - axOy, pz = pt.z - axOz;
                thetas.push(Math.atan2(px * vAx.x + py * vAx.y + pz * vAx.z, px * uAx.x + py * uAx.y + pz * uAx.z));
              }
            }
          } else if (f.t === 'SPHERE' && f.r > 0 && f.sc) {
            const rx = cx - f.sc[0], ry = cy - f.sc[1], rz = cz - f.sc[2];
            const rl = Math.hypot(rx, ry, rz);
            if (rl > 1e-9) concavWeight += (-(lN.x * rx + lN.y * ry + lN.z * rz) / rl) * ta;
          } else if (f.t === 'TORUS' && f.r > 0 && f.majorR > 0 && f.axis) {
            const vx = cx - axO, vy = cy - axOy, vz = cz - axOz;
            const proj = vx * axDx + vy * axDy + vz * axDz;
            const px = vx - proj * axDx, py = vy - proj * axDy, pz = vz - proj * axDz;
            const pl = Math.hypot(px, py, pz);
            if (pl > 1e-9) {
              const mx = axO + (px / pl) * f.majorR, my = axOy + (py / pl) * f.majorR, mz = axOz + (pz / pl) * f.majorR;
              const rx = cx - mx, ry = cy - my, rz = cz - mz;
              const rl = Math.hypot(rx, ry, rz);
              if (rl > 1e-9) concavWeight += (-(lN.x * rx + lN.y * ry + lN.z * rz) / rl) * ta;
            }
          } else if (f.t === 'CONE' && f.axis) {
            const vx = cx - axO, vy = cy - axOy, vz = cz - axOz;
            const proj = vx * axDx + vy * axDy + vz * axDz;
            const rx = vx - proj * axDx, ry = vy - proj * axDy, rz = vz - proj * axDz;
            const rl = Math.hypot(rx, ry, rz);
            if (rl > 1e-9) {
              concavWeight += (-(lN.x * rx + lN.y * ry + lN.z * rz) / rl) * ta;
              coneMinR = Math.min(coneMinR, rl);
            }
          }
        }

        if (!(area > 1e-6) || !triIdxList.length) continue;

        let r = null, kind = 'fillet', isFullCircle = false;
        if (f.t === 'CYLINDRE' && f.r > 0 && f.axis) {
          if (concavWeight / area <= 0.25) continue;
          r = f.r;
          if (thetas && thetas.length >= 3) {
            thetas.sort((x, y) => x - y);
            let maxGap = thetas[0] + 2 * Math.PI - thetas[thetas.length - 1];
            for (let k = 0; k + 1 < thetas.length; k++) maxGap = Math.max(maxGap, thetas[k + 1] - thetas[k]);
            const span = 2 * Math.PI - maxGap;
            isFullCircle = span >= (320 * Math.PI) / 180;
          }
          kind = isFullCircle ? 'hole' : 'fillet';
          if (!includeHoles && isFullCircle) continue;
        } else if (f.t === 'SPHERE' && f.r > 0 && f.sc) {
          if (concavWeight / area <= 0.25) continue;
          r = f.r;
          kind = 'corner';
        } else if (f.t === 'TORUS' && f.r > 0 && f.majorR > 0 && f.axis) {
          if (concavWeight / area <= 0.25) continue;
          r = f.r;
          kind = 'fillet';
        } else if (f.t === 'CONE' && f.axis) {
          if (concavWeight / area <= 0.25 || !isFinite(coneMinR)) continue;
          const cosA = f.semiAngle != null ? Math.max(0.1, Math.abs(Math.cos(f.semiAngle))) : 1;
          r = coneMinR / cosA;
          kind = 'cone';
        } else {
          r = estimateFreeformRadius(P, T, start, count);
          if (!(r > 0)) continue;
          kind = 'freeform';
        }

        const status = r < cutterRadius - 1e-4 ? 'tooSmall' : 'ok';
        const dstPos = status === 'tooSmall' ? tooSmallPos : okPos;
        const dstNorm = status === 'tooSmall' ? tooSmallNorms : okNorms;
        if (status === 'tooSmall') tooSmallArea += area;
        else okArea += area;

        for (let k = 0; k + 2 < triIdxList.length; k += 3) {
          wA.fromArray(P, triIdxList[k] * 3).applyMatrix4(M);
          wB.fromArray(P, triIdxList[k + 1] * 3).applyMatrix4(M);
          wC.fromArray(P, triIdxList[k + 2] * 3).applyMatrix4(M);
          wN.crossVectors(ab.subVectors(wB, wA), ac.subVectors(wC, wA));
          const wl = wN.length();
          if (wl < 1e-12) continue;
          wN.divideScalar(wl * flipN);
          const ox = wN.x * off, oy = wN.y * off, oz = wN.z * off;
          dstPos.push(wA.x + ox, wA.y + oy, wA.z + oz, wB.x + ox, wB.y + oy, wB.z + oz, wC.x + ox, wC.y + oy, wC.z + oz);
          dstNorm.push(wN.x, wN.y, wN.z, wN.x, wN.y, wN.z, wN.x, wN.y, wN.z);
        }

        const cLocal = f.c && f.c.length >= 3
          ? new THREE.Vector3(f.c[0], f.c[1], f.c[2])
          : new THREE.Vector3(cxSum / area, cySum / area, czSum / area);
        const center = cLocal.applyMatrix4(M).toArray();
        detected.push({
          id: n.id, faceIdx: fi, type: f.t, kind, r: round(r, 4), isFullCircle, status, area: round(area, 3), center,
        });
      }
    }

    detected.sort((a, b) => a.r - b.r);
    const minRadius = detected.length ? detected[0].r : null;
    const tooSmallCount = detected.filter((x) => x.status === 'tooSmall').length;
    const okCount = detected.length - tooSmallCount;

    return {
      cutterRadius, includeHoles, minRadius,
      tooSmallCount, okCount, totalCount: detected.length,
      tooSmallArea, okArea, faces: detected,
      tooSmallPos, tooSmallNorms, okPos, okNorms,
      box: worldBox.isEmpty() ? null : worldBox,
    };
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
  function setSelectedFaces(list) { // [{id, faceIdx}]
    for (const f of selFaces) { groups.overlay.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
    selFaces = [];
    const seen = new Set();
    for (const f of list || []) {
      if (!f || f.faceIdx == null || f.faceIdx < 0) continue;
      const key = f.id + ':' + f.faceIdx;
      if (seen.has(key)) continue;
      seen.add(key);
      const n = nodes.get(f.id);
      if (!n) continue;
      if (n.hiddenBodies && n.data && n.data.faceBody && n.hiddenBodies.has(n.data.faceBody[f.faceIdx])) continue;
      const geo = faceSubGeometry(n, f.faceIdx);
      if (!geo) continue;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(n.obj.matrix); mesh.renderOrder = 6;
      groups.overlay.add(mesh); selFaces.push({ id: f.id, faceIdx: f.faceIdx, mesh });
    }
    needsRender = true;
  }
  function highlightFace(which, id, faceIdx) {
    if (which !== 'hover') {
      setSelectedFaces(id != null && faceIdx != null && faceIdx >= 0 ? [{ id, faceIdx }] : []);
      return;
    }
    const cur = hoverFace;
    if (cur && cur.id === id && cur.faceIdx === faceIdx) return;
    if (cur) { groups.overlay.remove(cur.mesh); cur.mesh.geometry.dispose(); cur.mesh.material.dispose(); }
    let next = null;
    const n = nodes.get(id);
    if (n && faceIdx != null && faceIdx >= 0) {
      const geo = faceSubGeometry(n, faceIdx);
      if (geo) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent), transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(n.obj.matrix); mesh.renderOrder = 6;
        groups.overlay.add(mesh); next = { id, faceIdx, mesh };
      }
    }
    hoverFace = next;
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
  // Gestrichelte Anzeige der alten Lage eines verlorenen Bezugs (KP-12)
  function clearRefGhost() {
    if (!groups.reffix) return;
    for (const o of [...groups.reffix.children]) {
      groups.reffix.remove(o);
      o.traverse((x) => {
        if (x.isLineSegments2 || fatMaterials.has(x.material)) disposeFat(x);
        else { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }
      });
    }
    needsRender = true;
  }
  function setRefGhost(specs) {
    clearRefGhost();
    if (!groups.reffix || !Array.isArray(specs) || !specs.length) return;
    const col = '#e69500';
    for (const s of specs) {
      if (!s) continue;
      if (s.kind === 'segments' && Array.isArray(s.positions) && s.positions.length >= 6) {
        const line = makeFat(s.positions, col, 3.5, { dashed: true, dashSize: 2.5, gapSize: 1.8, depthTest: false, order: 25 });
        groups.reffix.add(line);
        for (const p of s.dots || []) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(s.dotR || 0.85, 10, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 }));
          dot.position.set(p[0], p[1], p[2]); dot.renderOrder = 26;
          groups.reffix.add(dot);
        }
      } else if (s.kind === 'plane' && Array.isArray(s.o) && Array.isArray(s.n)) {
        const o = new THREE.Vector3(...s.o), n = new THREE.Vector3(...s.n).normalize();
        let x = Array.isArray(s.x) ? new THREE.Vector3(...s.x).normalize() : null;
        if (!x || Math.abs(x.dot(n)) > 0.98) x = (Math.abs(n.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(n)).normalize();
        const y = new THREE.Vector3().crossVectors(n, x).normalize();
        const h = (s.size || 20) / 2;
        const c = [
          o.clone().addScaledVector(x, -h).addScaledVector(y, -h),
          o.clone().addScaledVector(x, h).addScaledVector(y, -h),
          o.clone().addScaledVector(x, h).addScaledVector(y, h),
          o.clone().addScaledVector(x, -h).addScaledVector(y, h),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 24;
        groups.reffix.add(mesh);
        const pos = [];
        for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
        const nEnd = o.clone().addScaledVector(n, Math.max(4, h * 0.45));
        pos.push(o.x, o.y, o.z, nEnd.x, nEnd.y, nEnd.z);
        groups.reffix.add(makeFat(pos, col, 3, { dashed: true, dashSize: 2.2, gapSize: 1.6, depthTest: false, order: 25 }));
      } else if (s.kind === 'marker' && Array.isArray(s.p)) {
        const p = new THREE.Vector3(...s.p), r = clamp(s.r || 5, 2, 16), pos = [];
        const N = 16;
        for (let i = 0; i < N; i++) {
          const a1 = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
          pos.push(p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r, p.z, p.x + Math.cos(a2) * r, p.y + Math.sin(a2) * r, p.z);
        }
        pos.push(p.x - r * 0.7, p.y, p.z, p.x + r * 0.7, p.y, p.z, p.x, p.y - r * 0.7, p.z, p.x, p.y + r * 0.7, p.z, p.x, p.y, p.z - r * 0.7, p.x, p.y, p.z + r * 0.7);
        groups.reffix.add(makeFat(pos, col, 3.2, { dashed: true, dashSize: 1.8, gapSize: 1.4, depthTest: false, order: 25 }));
      }
    }
    needsRender = true;
  }
  function hasRefGhost() { return !!(groups.reffix && groups.reffix.children.length); }

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
    if (!ids && groups.pointClouds) {
      for (const o of groups.pointClouds.children) {
        if (!o.visible || !o.geometry || !o.geometry.boundingBox) continue;
        box.union(o.geometry.boundingBox);
      }
    }
    return box;
  }
  function emptyBox() { return new THREE.Box3(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 20)); }
  function fit(ids, animate = true) {
    if (quadState) { fitQuad(ids); return; }
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
  // ---------- Maus- und Gesten-Steuerung wie in anderen Programmen (BE-12, BE-21) ----------
  // ctx: 'model' (Modell), 'sketch' (Skizze: links zeichnet), 'place' (Setzen/Notizen: links setzt)
  let mouseStyle = 'tracery', mouseCtx = 'model';
  let gesturesOn = true, ctrlKeyDown = false, lastTrackpadAt = 0;
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => { if (e.key === 'Control') ctrlKeyDown = true; }, { passive: true, capture: true });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') ctrlKeyDown = false; }, { passive: true, capture: true });
    window.addEventListener('blur', () => { ctrlKeyDown = false; });
  }
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
  function touchesFor(ctx) {
    if (!gesturesOn) return { ONE: null, TWO: null };
    if (ctx === 'sketch') return { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
    if (ctx === 'place') return { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    return { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  }
  function useButtons(ctx = mouseCtx) {
    mouseCtx = ctx;
    if (controls) { controls.mouseButtons = buttonsFor(mouseStyle, ctx); controls.touches = touchesFor(ctx); }
    if (quadState) for (const p of quadState.panes) { p.controls.mouseButtons = buttonsFor(mouseStyle, ctx); p.controls.touches = touchesFor(ctx); }
  }
  function setMouseStyle(st) { mouseStyle = st || 'tracery'; useButtons(); }
  function setGestures(on) {
    gesturesOn = on !== false;
    useButtons();
    listeners.emit('viewmode');
  }
  function bindGestures(el, getCtrl) {
    if (!el || !el.addEventListener) return () => {};
    let gestureScale = 1;
    const onWheel = (e) => {
      const ctrl = getCtrl();
      if (!ctrl || ctrl.enabled === false) return;
      const isPinch = !!(e.ctrlKey && !ctrlKeyDown);
      const hasHoriz = Math.abs(e.deltaX) >= 0.5;
      const now = performance.now();
      const isTrackpadSwipe = e.deltaMode === 0 && !isPinch && (hasHoriz || e.shiftKey || (now - lastTrackpadAt < 250 && Math.abs(e.deltaY) < 90));
      if (!gesturesOn) {
        if (isPinch || hasHoriz) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (isPinch) return; // OrbitControls _customWheelEvent zoomt bei ctrlKey (Trackpad-Pinch) auf den Mauszeiger
      if (!isTrackpadSwipe) return;
      lastTrackpadAt = now;
      e.preventDefault();
      e.stopImmediatePropagation();
      camMoveSeq++;
      pushCam(true);
      cancelCamAnim();
      const h = Math.max(1, el.clientHeight || (container && container.clientHeight) || 1);
      if (mouseCtx === 'sketch' || e.shiftKey) {
        ctrl._pan(-e.deltaX * ctrl.panSpeed, -e.deltaY * ctrl.panSpeed);
      } else {
        ctrl._rotateLeft((2 * Math.PI * (-e.deltaX) * ctrl.rotateSpeed) / h);
        ctrl._rotateUp((2 * Math.PI * (-e.deltaY) * ctrl.rotateSpeed) / h);
      }
      ctrl.update();
      needsRender = true;
      listeners.emit('camera');
    };
    const onGestureStart = (e) => {
      e.preventDefault();
      gestureScale = e.scale || 1;
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      if (!gesturesOn) return;
      const ctrl = getCtrl();
      if (!ctrl || ctrl.enabled === false) return;
      const sc = e.scale || 1;
      if (sc > 0 && gestureScale > 0) {
        const ratio = sc / gestureScale;
        gestureScale = sc;
        camMoveSeq++;
        pushCam(true);
        cancelCamAnim();
        ctrl._dollyOut(Math.pow(ratio, ctrl.zoomSpeed));
        if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) ctrl._updateZoomParameters(e.clientX, e.clientY);
        ctrl.update();
        needsRender = true;
        listeners.emit('camera');
      }
    };
    const onGestureEnd = (e) => {
      e.preventDefault();
      gestureScale = 1;
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    el.addEventListener('gesturestart', onGestureStart, { passive: false });
    el.addEventListener('gesturechange', onGestureChange, { passive: false });
    el.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel, true);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }
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
    updateViewAids();
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
    camMoveSeq++;
    pushCam(false);
    stopDamping();
    cancelCamAnim();
    if (!animate) {
      camera.position.copy(pos); controls.target.copy(target); if (up) camera.up.copy(up);
      inLoopCam = true; controls.update(); inLoopCam = false;
      camera.updateMatrixWorld();
      updateViewAids();
      needsRender = true; listeners.emit('camera'); return;
    }
    camAnim = { t0: performance.now(), dur: 420, p0: camera.position.clone(), p1: pos.clone(), q0: controls.target.clone(), q1: target.clone(), up0: up ? camera.up.clone() : null, up1: up ? up.clone() : null };
    camAnimTimer = setTimeout(() => { camAnimTimer = null; finishCamAnim(); }, camAnim.dur + 20);
  }
  const VIEWDIRS = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, -0.0001, 1], bottom: [0, -0.0001, -1], iso: [0.62, -0.9, 0.7] };
  function setView(name, animate = true) {
    if (quadState) {
      const ap = quadState.panes.find((p) => p.key === quadState.active) || quadState.panes[0];
      if (ap) {
        ap.dir = (VIEWDIRS[name] || VIEWDIRS.iso).slice();
        let box = sceneBox(); if (box.isEmpty()) box = emptyBox();
        const aspect = ap.rect ? (ap.rect.w / Math.max(1, ap.rect.h)) : ((container.clientWidth || 1) / Math.max(1, container.clientHeight || 1));
        placeQuadPane(ap, box, aspect);
        needsRender = true; listeners.emit('camera');
      }
      return;
    }
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
    renderer.setClearColor(new THREE.Color(bg || (isIllust() ? '#ffffff' : theme.surface)), 1);
    renderer.render(scene, insetCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(0x000000, 0);
    for (const [n, v] of before) n.obj.visible = v;
    for (const k of Object.keys(gv)) groups[k].visible = gv[k];
    return true;
  }

  // ---------- Vierfach-Ansicht (AN-18): Vorn, Oben, Rechts, Schräg einzeln drehbar ----------
  function paneCameraFor(p, w, h) {
    const aspect = w / Math.max(1, h);
    const dist = Math.max(0.2, p.cam.position.distanceTo(p.controls.target));
    p.cam.aspect = aspect;
    p.cam.near = clamp(dist * 0.01, 0.002, 2);
    p.cam.far = dist * 60 + 8000;
    p.cam.updateProjectionMatrix();
    p.cam.updateMatrixWorld();
    if (!p.ortho) return p.cam;
    const hh = dist * Math.tan((p.cam.fov * Math.PI) / 360);
    const hw = hh * aspect;
    p.orthoCam.left = -hw; p.orthoCam.right = hw; p.orthoCam.top = hh; p.orthoCam.bottom = -hh;
    const dir = p.cam.position.clone().sub(p.controls.target).normalize();
    p.orthoCam.position.copy(p.controls.target).addScaledVector(dir, 20000);
    p.orthoCam.quaternion.copy(p.cam.quaternion);
    p.orthoCam.up.copy(p.cam.up);
    p.orthoCam.updateProjectionMatrix();
    p.orthoCam.updateMatrixWorld();
    return p.orthoCam;
  }
  function clearPaneDamping(ctrl) {
    if (!ctrl) return;
    if (ctrl._sphericalDelta) ctrl._sphericalDelta.set(0, 0, 0);
    if (ctrl._panOffset) ctrl._panOffset.set(0, 0, 0);
    if ('_scale' in ctrl) ctrl._scale = 1;
  }
  function placeQuadPane(p, box, aspect) {
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(38, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = (r / Math.sin((p.cam.fov * Math.PI) / 360)) * 1.15 / Math.max(0.55, Math.min(1, aspect));
    const dir = new THREE.Vector3(...p.dir).normalize();
    clearPaneDamping(p.controls);
    p.cam.up.set(...p.up);
    p.cam.position.copy(c).addScaledVector(dir, dist);
    p.controls.target.copy(c);
    inLoopCam = true;
    p.controls.update();
    inLoopCam = false;
    p.cam.updateMatrixWorld();
  }
  function setActiveQuadPane(key) {
    if (!quadState || quadState.active === key) return;
    if (!quadState.panes.some((p) => p.key === key)) return;
    for (const p of quadState.panes) {
      if (p.key !== key) {
        p.orbitActive = false;
        clearPaneDamping(p.controls);
      }
    }
    quadState.active = key;
    needsRender = true;
    listeners.emit('viewmode');
  }
  function setQuadPaneOrtho(key, on) {
    if (!quadState) return false;
    const p = quadState.panes.find((x) => x.key === key);
    if (!p) return false;
    p.ortho = !!on;
    needsRender = true;
    listeners.emit('viewmode');
    return true;
  }
  function resetQuadPane(key) {
    if (!quadState) return false;
    const p = quadState.panes.find((x) => x.key === key);
    if (!p) return false;
    const def = QUAD_DEFS.find((d) => d.key === key);
    if (def) { p.dir = def.dir.slice(); p.up = def.up.slice(); }
    let box = sceneBox(); if (box.isEmpty()) box = emptyBox();
    const aspect = p.rect ? (p.rect.w / Math.max(1, p.rect.h)) : ((container.clientWidth || 1) / Math.max(1, container.clientHeight || 1));
    placeQuadPane(p, box, aspect);
    needsRender = true;
    listeners.emit('camera');
    return true;
  }
  function fitQuad(ids) {
    if (!quadState) return;
    let box = sceneBox(ids); if (box.isEmpty()) box = emptyBox();
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(38, box.getSize(new THREE.Vector3()).length() / 2);
    for (const p of quadState.panes) {
      const aspect = p.rect ? (p.rect.w / Math.max(1, p.rect.h)) : ((container.clientWidth || 1) / Math.max(1, container.clientHeight || 1));
      const dist = (r / Math.sin((p.cam.fov * Math.PI) / 360)) * 1.15 / Math.max(0.55, Math.min(1, aspect));
      const dir = p.cam.position.clone().sub(p.controls.target);
      if (dir.lengthSq() < 1e-8) dir.set(...p.dir);
      dir.normalize();
      clearPaneDamping(p.controls);
      p.cam.position.copy(c).addScaledVector(dir, dist);
      p.controls.target.copy(c);
      inLoopCam = true;
      p.controls.update();
      inLoopCam = false;
      p.cam.updateMatrixWorld();
    }
    needsRender = true;
    listeners.emit('camera');
  }
  function setQuad(on, hostMap = {}) {
    if (!on) {
      if (!quadState) return;
      for (const p of quadState.panes) {
        if (p.disposeGestures) p.disposeGestures();
        p.controls.dispose();
      }
      quadState = null;
      if (controls) controls.enabled = true;
      renderer.setScissorTest(false);
      resize();
      listeners.emit('viewmode');
      return;
    }
    if (quadState) setQuad(false);
    cancelCamAnim();
    stopDamping();
    if (controls) controls.enabled = false;
    let box = sceneBox(); if (box.isEmpty()) box = emptyBox();
    const W = container.clientWidth || 1, H = container.clientHeight || 1;
    const aspect = (W / 2) / Math.max(1, H / 2);
    const panes = [];
    for (const def of QUAD_DEFS) {
      const hitEl = hostMap[def.key] || renderer.domElement;
      const pCam = new THREE.PerspectiveCamera(32, aspect, 0.5, 30000);
      pCam.up.set(...def.up);
      const pOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000);
      const pCtrl = new OrbitControls(pCam, hitEl);
      pCtrl.enableDamping = true; pCtrl.dampingFactor = BASE_DAMP;
      pCtrl.screenSpacePanning = true; pCtrl.zoomToCursor = true;
      pCtrl.rotateSpeed = 0.85; pCtrl.zoomSpeed = 1.1; pCtrl.panSpeed = 0.9;
      pCtrl.minDistance = 0.2; pCtrl.maxDistance = 12000;
      pCtrl.mouseButtons = buttonsFor(mouseStyle, 'model');
      pCtrl.touches = touchesFor('model');
      const disposeGestures = hitEl !== renderer.domElement ? bindGestures(hitEl, () => pCtrl) : null;
      const pane = { key: def.key, dir: def.dir.slice(), up: def.up.slice(), ortho: def.ortho, cam: pCam, orthoCam: pOrtho, controls: pCtrl, disposeGestures, el: hitEl, rect: null, orbitActive: false };
      placeQuadPane(pane, box, aspect);
      pCtrl.addEventListener('change', () => { needsRender = true; if (!inLoopCam) listeners.emit('camera'); });
      pCtrl.addEventListener('start', () => { pane.orbitActive = true; setActiveQuadPane(def.key); });
      pCtrl.addEventListener('end', () => { pane.orbitActive = false; });
      panes.push(pane);
    }
    quadState = { active: 'iso', panes };
    needsRender = true;
    listeners.emit('viewmode');
    listeners.emit('camera');
  }
  function renderQuad() {
    if (!quadState) return;
    const size = renderer.getSize(new THREE.Vector2());
    const cr = renderer.domElement.getBoundingClientRect();
    const hw = Math.max(1, size.x / 2), hh = Math.max(1, size.y / 2);
    const fb = [[0, 0], [hw, 0], [0, hh], [hw, hh]];
    for (let i = 0; i < quadState.panes.length; i++) {
      const p = quadState.panes[i];
      const br = p.el && p.el.getBoundingClientRect ? p.el.getBoundingClientRect() : null;
      const useDom = !!(br && br.width >= 4 && br.height >= 4 && cr.width >= 4 && cr.height >= 4);
      const x = useDom ? Math.max(0, br.left - cr.left) : fb[i][0];
      const y = useDom ? Math.max(0, br.top - cr.top) : fb[i][1];
      const w = useDom ? Math.max(1, br.width) : hw;
      const h = useDom ? Math.max(1, br.height) : hh;
      p.rect = { x, y, w, h };
      const rc = paneCameraFor(p, w, h);
      for (const m of fatMaterials) m.resolution.set(w, h);
      for (const m of outlineMaterials) m.uniforms.uRes.value.set(w, h);
      const vy = Math.max(0, size.y - y - h);
      renderer.setScissorTest(true);
      renderer.setScissor(x, vy, w, h);
      renderer.setViewport(x, vy, w, h);
      renderer.render(scene, rc);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    for (const m of fatMaterials) m.resolution.set(size.x, size.y);
    for (const m of outlineMaterials) m.uniforms.uRes.value.set(size.x, size.y);
  }
  function pickInPane(key, cx, cy) {
    if (!quadState) return null;
    const p = quadState.panes.find((x) => x.key === key);
    if (!p || !p.el || !p.el.getBoundingClientRect) return null;
    const br = p.el.getBoundingClientRect();
    if (br.width < 2 || br.height < 2) return null;
    _ndc.set(((cx - br.left) / br.width) * 2 - 1, -((cy - br.top) / br.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, paneCameraFor(p, br.width, br.height));
    const meshes = [];
    for (const n of nodes.values()) { if (!n.obj.visible || n.allBodiesHidden || n.ctxDim) continue; meshes.push(n.mesh); }
    let hits = raycaster.intersectObjects(meshes, false);
    if (vis.clips.length) hits = hits.filter((x) => vis.clips.every((pl) => pl.distanceToPoint(x.point) >= -1e-6));
    if (!hits.length) return null;
    const hit = hits[0];
    const n = nodes.get(hit.object.userData.nodeId);
    if (!n) return null;
    const tri = hit.faceIndex * 3;
    let faceIdx = -1;
    for (const g of n.visFaceGroups || n.data.faceGroups) if (tri >= g[0] && tri < g[0] + g[1]) { faceIdx = g[2]; break; }
    return { id: n.id, faceIdx, point: hit.point.clone(), distance: hit.distance };
  }

  // ---------- Vergleich: älterer Stand als roter, gestrichelter Umriss oder 3-Farben-Diff (neu/weg/gleich) ----------
  let compareHidNodes = false;
  function clearCompareGroup() {
    for (const o of [...groups.compare.children]) {
      groups.compare.remove(o);
      o.traverse((x) => {
        if (x.isLineSegments2 || (x.material && x.material.isLineMaterial)) disposeFat(x);
        else {
          x.geometry && x.geometry.dispose();
          x.material && x.material.dispose();
        }
      });
    }
    if (compareHidNodes) {
      groups.nodes.visible = true;
      compareHidNodes = false;
    }
  }
  function setCompare(list) {
    clearCompareGroup();
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
  function setCompareDiff(diff) {
    clearCompareGroup();
    if (!diff) { needsRender = true; return false; }
    const root = new THREE.Group();
    root.userData = { compareDiff: true, noPick: true };
    const addRoleMesh = (mesh, role, hexColor, edgeHex, opacity, xrayOpacity, orderBase) => {
      if (!mesh || !mesh.vertices || mesh.vertices.length < 9 || !mesh.triangles || mesh.triangles.length < 3) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
      if (mesh.normals && mesh.normals.length === mesh.vertices.length) {
        geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      } else {
        geo.computeVertexNormals();
      }
      geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const surf = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(hexColor),
          roughness: role === 'same' ? 0.68 : 0.45,
          metalness: 0.04,
          transparent: true,
          opacity,
          depthWrite: role === 'same',
          polygonOffset: role !== 'same',
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          side: THREE.DoubleSide,
        })
      );
      surf.renderOrder = orderBase;
      surf.userData = { compareRole: role, noPick: true };
      root.add(surf);

      if (xrayOpacity > 0) {
        const xray = new THREE.Mesh(
          geo.clone(),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(hexColor),
            transparent: true,
            opacity: xrayOpacity,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        xray.renderOrder = orderBase + 1;
        xray.userData = { compareRole: role, noPick: true };
        root.add(xray);
      }

      if (mesh.lines && mesh.lines.length >= 6) {
        if (role === 'same') {
          const lg = new THREE.BufferGeometry();
          lg.setAttribute('position', new THREE.BufferAttribute(mesh.lines, 3));
          const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(edgeHex), transparent: true, opacity: 0.48 }));
          ln.renderOrder = orderBase + 1;
          ln.userData = { compareRole: role, noPick: true };
          root.add(ln);
        } else {
          const ln = makeFat(mesh.lines, edgeHex, 2.6, { depthTest: false, opacity: 0.9, order: orderBase + 2 });
          ln.userData = { compareRole: role, noPick: true };
          root.add(ln);
        }
      }
    };
    if (diff.showSame !== false) addRoleMesh(diff.sameMesh, 'same', '#8d96a5', '#5c6675', 0.48, 0, 10);
    if (diff.showRemoved !== false) addRoleMesh(diff.removedMesh, 'removed', '#e0483b', '#c92a2a', 0.84, 0.26, 14);
    if (diff.showAdded !== false) addRoleMesh(diff.addedMesh, 'added', '#2fb36d', '#1c8a52', 0.84, 0.26, 18);

    const hasMesh = root.children.length > 0;
    if (hasMesh) {
      groups.compare.add(root);
      groups.nodes.visible = false;
      compareHidNodes = true;
    }
    needsRender = true;
    return hasMesh;
  }

  // Bild der Szene für Vorschaubilder
  // Schattenriss: Fläche (mm²), die die Teile aus Blickrichtung dir verdecken – z. B. die Stirnfläche im Fahrtwind.
  // Gerechnet durch Pixelzählen in einem eigenen Bild (orthografisch), unabhängig von der Kamera.
  function silhouette(ids, dir, res = 1024) {
    const show = ids.map((id) => nodes.get(id)).filter((n) => n && n.mesh && !n.allBodiesHidden);
    if (!show.length) return { area: 0, px: 0, width: 0, height: 0, dir: dir ? [...dir] : [0, 1, 0] };
    const d = new THREE.Vector3(...dir).normalize();
    if (d.lengthSq() < 1e-8) d.set(0, 1, 0);
    groups.nodes.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const n of show) box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.mesh.matrixWorld));
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const R = Math.max(1, sz.length() / 2) * 1.02;
    const refUp = Math.abs(d.z) > 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const u = new THREE.Vector3().crossVectors(d, refUp).normalize();
    const v = new THREE.Vector3().crossVectors(u, d).normalize();
    const hw = (Math.abs(u.x) * sz.x + Math.abs(u.y) * sz.y + Math.abs(u.z) * sz.z) / 2;
    const hh = (Math.abs(v.x) * sz.x + Math.abs(v.y) * sz.y + Math.abs(v.z) * sz.z) / 2;
    const half = Math.max(0.5, hw, hh) * 1.04;

    const oc = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 4 * R + 20);
    oc.up.copy(v);
    oc.position.copy(c).addScaledVector(d, -(2 * R + 10));
    oc.lookAt(c);
    oc.updateProjectionMatrix();
    oc.updateMatrixWorld();

    const sc = new THREE.Scene(), mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (const n of show) {
      const m = new THREE.Mesh(n.mesh.geometry, mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(n.mesh.matrixWorld);
      m.matrixWorld.copy(n.mesh.matrixWorld);
      sc.add(m);
    }
    const rt = new THREE.WebGLRenderTarget(res, res);
    const oldRT = renderer.getRenderTarget(), oldCol = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha(), oldClip = renderer.localClippingEnabled;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.localClippingEnabled = false; renderer.clear(); renderer.render(sc, oc);
    const buf = new Uint8Array(res * res * 4); renderer.readRenderTargetPixels(rt, 0, 0, res, res, buf);
    renderer.setRenderTarget(oldRT); renderer.setClearColor(oldCol, oldA); renderer.localClippingEnabled = oldClip;
    rt.dispose(); mat.dispose();

    let px = 0, minX = res, maxX = -1, minY = res, maxY = -1;
    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        if (buf[(row + x) * 4] > 127) {
          px++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const s = (2 * half) / res;
    needsRender = true;
    return {
      area: px * s * s,
      px,
      c: c.toArray(),
      R,
      width: px ? (maxX - minX + 1) * s : 0,
      height: px ? (maxY - minY + 1) * s : 0,
      dir: d.toArray(),
    };
  }
  // Bild in beliebiger Größe: ohne Raster, Achsen, Ebenen und Griffe; Hintergrund durchsichtig oder hell
  function renderImage(w, hgt, opts = {}) {
    const old = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio();
    const hide = [gridMinor, gridMajor, opts.transparent ? reflectFloor : null, groups.origin, groups.datums, groups.handles, groups.overlay, groups.measures, groups.sketch3d, groups.sketch, groups.reffix].filter(Boolean), was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const c = cam(), oldAspect = camera.aspect;
    renderer.setPixelRatio(1); renderer.setSize(w, hgt, false);
    for (const m of outlineMaterials) m.uniforms.uRes.value.set(w, hgt);
    if (c.isPerspectiveCamera) { c.aspect = w / hgt; c.updateProjectionMatrix(); }
    else { const o = { l: c.left, r: c.right, t: c.top, b: c.bottom }; const hh = (c.top - c.bottom) / 2, ww = (hh * w) / hgt, cx = (c.left + c.right) / 2; c.left = cx - ww; c.right = cx + ww; c.updateProjectionMatrix(); c.userData.restore = o; }
    renderer.setClearColor(new THREE.Color(opts.bg || '#ffffff'), opts.transparent ? 0 : 1);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, c);
    const url = renderer.domElement.toDataURL('image/png');
    hide.forEach((o, i) => { o.visible = was[i]; });
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(oldPR); renderer.setSize(old.x, old.y, false);
    for (const m of outlineMaterials) m.uniforms.uRes.value.set(old.x, old.y);
    if (c.isPerspectiveCamera) { c.aspect = oldAspect; c.updateProjectionMatrix(); }
    else if (c.userData.restore) { Object.assign(c, { left: c.userData.restore.l, right: c.userData.restore.r, top: c.userData.restore.t, bottom: c.userData.restore.b }); c.updateProjectionMatrix(); delete c.userData.restore; }
    renderer.shadowMap.needsUpdate = true; needsRender = true;
    return url;
  }
  function renderPartThumb(ids, w = 160, hgt = 120) {
    const list = Array.isArray(ids) ? ids : [ids];
    groups.nodes.updateMatrixWorld(true);
    const show = list.map((id) => nodes.get(id)).filter((n) => n && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox);
    if (!show.length) return null;
    const box = new THREE.Box3();
    for (const n of show) box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrixWorld));
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    const tc = new THREE.PerspectiveCamera(30, w / hgt, 0.05, 10000);
    const dir = new THREE.Vector3(0.62, -0.9, 0.7).normalize();
    const dist = (R / Math.sin((tc.fov * Math.PI) / 360)) * 1.18 / Math.min(1, w / hgt);
    tc.position.copy(c).addScaledVector(dir, dist);
    tc.up.set(0, 0, 1);
    tc.lookAt(c);
    tc.near = Math.max(0.05, dist - R * 3);
    tc.far = dist + R * 3;
    tc.updateProjectionMatrix();
    const old = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio();
    const oldCol = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha(), oldClip = renderer.localClippingEnabled;
    const nodeVis = new Map(); for (const n of nodes.values()) nodeVis.set(n, n.obj.visible);
    const gridVis = [gridMinor ? gridMinor.visible : false, gridMajor ? gridMajor.visible : false];
    const gv = {}; for (const k of Object.keys(groups)) if (k !== 'nodes') gv[k] = groups[k].visible;
    try {
      for (const n of nodes.values()) n.obj.visible = show.includes(n);
      if (gridMinor) gridMinor.visible = false;
      if (gridMajor) gridMajor.visible = false;
      for (const k of Object.keys(gv)) groups[k].visible = false;
      renderer.localClippingEnabled = false;
      renderer.setPixelRatio(1);
      renderer.setSize(w, hgt, false);
      renderer.setClearColor(new THREE.Color(theme.surface || '#ffffff'), 0);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, tc);
      return renderer.domElement.toDataURL('image/png');
    } catch (_) {
      return null;
    } finally {
      for (const [n, v] of nodeVis) n.obj.visible = v;
      if (gridMinor) gridMinor.visible = gridVis[0];
      if (gridMajor) gridMinor.visible = gridVis[1];
      for (const k of Object.keys(gv)) groups[k].visible = gv[k];
      renderer.localClippingEnabled = oldClip;
      renderer.setClearColor(oldCol, oldA);
      renderer.setPixelRatio(oldPR);
      renderer.setSize(old.x, old.y, false);
      renderer.shadowMap.needsUpdate = true;
      needsRender = true;
    }
  }
  function renderMeshThumb(meshNodes, w = 160, hgt = 120) {
    if (!renderer || !scene) return null;
    const list = (Array.isArray(meshNodes) ? meshNodes : [meshNodes]).filter((m) => m && m.data && m.data.vertices && m.data.triangles && m.data.triangles.length >= 3);
    if (!list.length) return null;
    const tempGrp = new THREE.Group();
    const disposables = [];
    for (const entry of list) {
      const d = entry.data;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(d.vertices, 3));
      if (d.normals && d.normals.length === d.vertices.length) {
        geo.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
      } else {
        geo.computeVertexNormals();
      }
      geo.setIndex(new THREE.BufferAttribute(d.triangles, 1));
      geo.computeBoundingBox();
      let useVertexColors = false;
      const eb = d.bodies;
      if (eb && eb.length > 1 && d.faceBody && d.faceGroups) {
        const bodyCols = new Map();
        for (let bi = 0; bi < eb.length; bi++) {
          if (eb[bi] && eb[bi].color) bodyCols.set(bi, new THREE.Color(eb[bi].color));
        }
        if (bodyCols.size) {
          const base = new THREE.Color(entry.color || '#2f9e91');
          const vCount = d.vertices.length / 3;
          const cols = new Float32Array(vCount * 3);
          for (let i = 0; i < vCount; i++) { cols[i * 3] = base.r; cols[i * 3 + 1] = base.g; cols[i * 3 + 2] = base.b; }
          for (const [start, count, fi] of d.faceGroups) {
            const bi = fi >= 0 ? d.faceBody[fi] : -1;
            const c = bi >= 0 ? bodyCols.get(bi) : null;
            if (!c) continue;
            for (let k = start; k < start + count; k++) {
              const vi = d.triangles[k];
              cols[vi * 3] = c.r; cols[vi * 3 + 1] = c.g; cols[vi * 3 + 2] = c.b;
            }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          useVertexColors = true;
        }
      }
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(useVertexColors ? '#ffffff' : (entry.color || '#2f9e91')),
        vertexColors: useVertexColors,
        roughness: 0.58,
        metalness: 0.03,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const subGrp = new THREE.Group();
      subGrp.add(mesh);
      disposables.push(geo, mat);
      if (d.lines && d.lines.length >= 6) {
        const eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(d.lines, 3));
        const em = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.edge), transparent: true, opacity: 0.5 });
        subGrp.add(new THREE.LineSegments(eg, em));
        disposables.push(eg, em);
      }
      if (entry.matrix && entry.matrix.isMatrix4) {
        subGrp.matrixAutoUpdate = false;
        subGrp.matrix.copy(entry.matrix);
      }
      tempGrp.add(subGrp);
    }
    tempGrp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tempGrp);
    if (box.isEmpty()) {
      for (const d of disposables) d.dispose();
      return null;
    }
    const c = box.getCenter(new THREE.Vector3());
    const R = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    const tc = new THREE.PerspectiveCamera(30, w / hgt, 0.05, 10000);
    const dir = new THREE.Vector3(0.62, -0.9, 0.7).normalize();
    const dist = (R / Math.sin((tc.fov * Math.PI) / 360)) * 1.18 / Math.min(1, w / hgt);
    tc.position.copy(c).addScaledVector(dir, dist);
    tc.up.set(0, 0, 1);
    tc.lookAt(c);
    tc.near = Math.max(0.05, dist - R * 3);
    tc.far = dist + R * 3;
    tc.updateProjectionMatrix();

    const old = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio();
    const oldCol = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha(), oldClip = renderer.localClippingEnabled;
    const gridVis = [gridMinor ? gridMinor.visible : false, gridMajor ? gridMajor.visible : false];
    const gv = {}; for (const k of Object.keys(groups)) { gv[k] = groups[k].visible; groups[k].visible = false; }
    scene.add(tempGrp);
    try {
      if (gridMinor) gridMinor.visible = false;
      if (gridMajor) gridMajor.visible = false;
      renderer.localClippingEnabled = false;
      renderer.setPixelRatio(1);
      renderer.setSize(w, hgt, false);
      renderer.setClearColor(new THREE.Color(theme.surface || '#ffffff'), 0);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, tc);
      return renderer.domElement.toDataURL('image/png');
    } catch (_) {
      return null;
    } finally {
      scene.remove(tempGrp);
      for (const d of disposables) d.dispose();
      if (gridMinor) gridMinor.visible = gridVis[0];
      if (gridMajor) gridMajor.visible = gridVis[1];
      for (const k of Object.keys(gv)) groups[k].visible = gv[k];
      renderer.localClippingEnabled = oldClip;
      renderer.setClearColor(oldCol, oldA);
      renderer.setPixelRatio(oldPR);
      renderer.setSize(old.x, old.y, false);
      renderer.shadowMap.needsUpdate = true;
      needsRender = true;
    }
  }
  function cameraBasis() {
    syncCamAnim();
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements;
    const dir = new THREE.Vector3(m[8], m[9], m[10]).normalize();
    let x = new THREE.Vector3(m[0], m[1], m[2]);
    x.addScaledVector(dir, -x.dot(dir));
    if (x.lengthSq() < 1e-8) {
      const up = Math.abs(dir.z) > 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      x.crossVectors(up, dir);
    }
    x.normalize();
    const y = new THREE.Vector3().crossVectors(dir, x).normalize();
    return { dir: dir.toArray(), x: x.toArray(), y: y.toArray() };
  }
  function renderOrthoView({ dir, x, box, maxPx = 720 } = {}) {
    if (!Array.isArray(dir) || !Array.isArray(box) || box.length < 4) return null;
    groups.nodes.updateMatrixWorld(true);
    const show = [...nodes.values()].filter((n) => n && n.mesh && n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.mesh.geometry && n.mesh.geometry.boundingBox);
    if (!show.length) return null;
    const d = new THREE.Vector3(...dir).normalize();
    if (d.lengthSq() < 1e-8) return null;
    const ex = Array.isArray(x) ? new THREE.Vector3(...x) : new THREE.Vector3(1, 0, 0);
    ex.addScaledVector(d, -ex.dot(d));
    if (ex.lengthSq() < 1e-8) ex.crossVectors(Math.abs(d.z) > 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), d);
    ex.normalize();
    const ey = new THREE.Vector3().crossVectors(d, ex).normalize();
    const [x0, y0, x1, y1] = box;
    const w = x1 - x0, h = y1 - y0;
    if (!(w > 1e-6 && h > 1e-6)) return null;
    const uc = (x0 + x1) / 2, vc = (y0 + y1) / 2, hw = w / 2, hh = h / 2;
    const lim = Math.max(64, Math.min(1200, Math.round(maxPx || 720)));
    const iw = w >= h ? lim : Math.max(32, Math.round((lim * w) / h));
    const ih = h >= w ? lim : Math.max(32, Math.round((lim * h) / w));
    const wb = new THREE.Box3();
    for (const n of show) wb.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrixWorld));
    if (wb.isEmpty()) return null;
    let dMin = Infinity, dMax = -Infinity;
    const cPt = new THREE.Vector3();
    for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
      cPt.set(ix ? wb.max.x : wb.min.x, iy ? wb.max.y : wb.min.y, iz ? wb.max.z : wb.min.z);
      const s = cPt.dot(d);
      if (s < dMin) dMin = s;
      if (s > dMax) dMax = s;
    }
    const pad = Math.max(10, (dMax - dMin) * 0.5);
    const oc = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, (dMax - dMin) + 2 * pad + 20);
    oc.position.copy(ex).multiplyScalar(uc).addScaledVector(ey, vc).addScaledVector(d, dMax + pad);
    const rotM = new THREE.Matrix4().makeBasis(ex, ey, d);
    oc.quaternion.setFromRotationMatrix(rotM);
    oc.up.copy(ey);
    oc.updateProjectionMatrix();
    oc.updateMatrixWorld();

    const old = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio();
    const oldCol = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha(), oldClip = renderer.localClippingEnabled;
    const gridVis = [gridMinor ? gridMinor.visible : false, gridMajor ? gridMajor.visible : false];
    const gv = {}; for (const k of Object.keys(groups)) if (k !== 'nodes') gv[k] = groups[k].visible;
    const nodeState = [];
    for (const n of nodes.values()) {
      nodeState.push([n, n.obj.visible, n.mesh ? n.mesh.visible : false, n.edges ? n.edges.visible : false]);
      const vis = show.includes(n);
      n.obj.visible = vis;
      if (n.mesh) n.mesh.visible = vis;
      if (n.edges) n.edges.visible = false;
    }
    try {
      if (gridMinor) gridMinor.visible = false;
      if (gridMajor) gridMajor.visible = false;
      for (const k of Object.keys(gv)) groups[k].visible = false;
      renderer.localClippingEnabled = false;
      renderer.setPixelRatio(1);
      renderer.setSize(iw, ih, false);
      renderer.setClearColor(0xffffff, 0);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, oc);
      const png = renderer.domElement.toDataURL('image/png');
      let jpg = null;
      try {
        const c2 = document.createElement('canvas'); c2.width = iw; c2.height = ih;
        const ctx = c2.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, iw, ih);
        ctx.drawImage(renderer.domElement, 0, 0, iw, ih);
        jpg = c2.toDataURL('image/jpeg', 0.92);
      } catch (_) {}
      return { png, jpg, w: iw, h: ih };
    } catch (_) {
      return null;
    } finally {
      for (const [n, ov, mv, ev] of nodeState) { n.obj.visible = ov; if (n.mesh) n.mesh.visible = mv; if (n.edges) n.edges.visible = ev; }
      if (gridMinor) gridMinor.visible = gridVis[0];
      if (gridMajor) gridMajor.visible = gridVis[1];
      for (const k of Object.keys(gv)) groups[k].visible = gv[k];
      renderer.localClippingEnabled = oldClip;
      renderer.setClearColor(oldCol, oldA);
      renderer.setPixelRatio(oldPR);
      if (old.x > 0 && old.y > 0) renderer.setSize(old.x, old.y, false);
      renderer.shadowMap.needsUpdate = true;
      needsRender = true;
    }
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
    viewBack, get viewHistory() { return camHist.length; }, useButtons, setMouseStyle, get mouseStyle() { return mouseStyle; }, setGestures, get gestures() { return gesturesOn; }, get leftOrbits() { return !!(controls && controls.mouseButtons.LEFT === THREE.MOUSE.ROTATE); }, setLook, lookOf, get look() { return { ...LOOK, lights: LOOK.lights.map((l) => ({ ...l })), hasCustomEnv: !!customEnvTex, envImageName: customEnvName }; }, TEXTURES: BODY_TEXTURES, setEnvImage, get hasCustomEnv() { return !!customEnvTex; }, get envImageName() { return customEnvName; }, get floor() { return reflectFloor; }, get customLights() { return customLights.slice(); }, get lights() { return LOOK.manualLights ? customLights.slice() : [lights.key, lights.fill, lights.rim]; }, fitShadow, renderImage, renderPartThumb, renderMeshThumb, cameraBasis, renderOrthoView, lookAtFace, faceIndexOf: (id, fc) => { const n = nodes.get(id); return n ? faceIndexOf(n, fc) : -1; }, cylinderFaceInfo, threadFaceIndex: (id, th) => { const n = nodes.get(id); return n ? threadFaceIndex(n, th) : -1; }, get renderer() { return renderer; },
    init, requestRender, renderNow, setClip, setXray, setOffsets, baseBox, renderInset, silhouette, setAdaptive, setCompare, setCompareDiff, setNode, updateNode, removeNode, setGhost, removeGhost, clearGhosts, highlightFace, highlightEdge, highlightBody, setSelectedFaces, setSelectedEdges, clearHover, setRefGhost, clearRefGhost, hasRefGhost,
    edgePositions, pick, pickAll, pickGhost, pickProxy, setProxies, clearProxies, pickPlane, rayPlane, inView, screenFraction, setRay, toScreen, pixelSizeAt, fit, setView, lookAtPlane, saveCamera, restoreCamera, moveCamera, setOrtho, setViewOptions, setPrintBed, boxVisible, sceneBox, snapshot, makeFat, disposeFat, faceOverlay, faceArea, faceEdges, edgeKinds, wallAt, thinWalls, draftAnalysis, innerRadiusAnalysis,
    setQuad, setActiveQuadPane, setQuadPaneOrtho, resetQuadPane, fitQuad, pickInPane,
    get quad() { return !!quadState; }, get activeQuadPane() { return quadState ? quadState.active : null; },
    get quadPanes() { return quadState ? quadState.panes.map((p) => ({ key: p.key, ortho: p.ortho, active: quadState.active === p.key, rect: p.rect ? { ...p.rect } : null, camPos: p.cam.position.toArray(), target: p.controls.target.toArray() })) : []; },
    get camera() { syncCamAnim(); return camera; }, get activeCamera() { syncCamAnim(); return cam(); }, get ortho() { return ortho; }, get gridStep() { syncCamAnim(); return gridStep; }, get camMoveSeq() { return camMoveSeq; }, get controls() { return controls; }, get scene() { return scene; }, get groups() { return groups; }, get nodes() { return nodes; }, get canvas() { return renderer.domElement; }, get theme() { return theme; }, get container() { return container; },
    get clip() { return vis.clip; }, get clips() { return vis.clips.slice(); }, get xray() { return vis.xray; }, get lowRes() { return lowRes; },  get pixelRatio() { return renderer.getPixelRatio(); },
    on: listeners.on,
  };
})();

