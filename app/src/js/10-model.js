// ================= Datenmodell =================
const COLORS = [
  { c: '#2f9e91', get n() { return T('color.petrol'); } }, { c: '#3f7fd6', get n() { return T('color.blue'); } }, { c: '#e8833a', get n() { return T('color.orange'); } }, { c: '#e2b53a', get n() { return T('color.yellow'); } },
  { c: '#d6574c', get n() { return T('color.red'); } }, { c: '#8a6ad1', get n() { return T('color.violet'); } }, { c: '#5b9f55', get n() { return T('color.green'); } }, { c: '#8b96a1', get n() { return T('color.gray'); } },
  { c: '#eceff2', get n() { return T('color.white'); } }, { c: '#3b4149', get n() { return T('color.black'); } },
];
let colorTurn = 0;
function nextColor() { const c = COLORS[colorTurn % 6].c; colorTurn++; return c; }

const P = (k, labelKey, def, opt = {}) => ({ k, get label() { return T(labelKey); }, def, unit: 'mm', min: 0.1, ...opt });
const KINDS = {
  box: { get label() { return T('kind.box'); }, icon: 'cube', params: [P('w', 'param.w', 20, { axis: 'x' }), P('d', 'param.d', 20, { axis: 'y' }), P('h', 'param.h', 20, { axis: 'z' })] },
  cylinder: { get label() { return T('kind.cylinder'); }, params: [P('d', 'param.dia', 20, { sym: 'Ø' }), P('h', 'param.h', 20)] },
  tube: { get label() { return T('kind.tube'); }, params: [P('d', 'param.od', 20, { sym: 'Ø' }), P('wall', 'param.wall', 2), P('h', 'param.h', 20)] },
  sphere: { get label() { return T('kind.sphere'); }, params: [P('d', 'param.dia', 20, { sym: 'Ø' })] },
  hemisphere: { get label() { return T('kind.hemisphere'); }, params: [P('d', 'param.dia', 20, { sym: 'Ø' })] },
  cone: { get label() { return T('kind.cone'); }, params: [P('d1', 'param.d1', 20), P('d2', 'param.d2', 0, { min: 0 }), P('h', 'param.h', 20)] },
  pyramid: { get label() { return T('kind.pyramid'); }, params: [P('w', 'param.w', 20, { axis: 'x' }), P('d', 'param.d', 20, { axis: 'y' }), P('h', 'param.h', 20, { axis: 'z' })] },
  torus: { get label() { return T('kind.torus'); }, params: [P('d', 'param.od', 30), P('t', 'param.t', 6)] },
  prism: { get label() { return T('kind.prism'); }, params: [P('n', 'param.n', 6, { unit: '', min: 3, max: 64, step: 1, int: true }), P('d', 'param.dia', 20), P('h', 'param.h', 20)] },
  wedge: { get label() { return T('kind.wedge'); }, params: [P('w', 'param.w', 20, { axis: 'x' }), P('d', 'param.d', 20, { axis: 'y' }), P('h', 'param.h', 20, { axis: 'z' })] },
  extrude: { get label() { return T('kind.extrude'); }, params: [] },
  revolve: { get label() { return T('kind.revolve'); }, params: [] },
  loft: { get label() { return T('kind.loft'); }, params: [] },
  sweep: { get label() { return T('kind.sweep'); }, params: [] },
  helix: { get label() { return T('kind.helix'); }, params: [] },
  import: { get label() { return T('kind.import'); }, params: [] },
  group: { get label() { return T('kind.group'); }, params: [] },
  part: { get label() { return T('kind.part'); }, params: [] },
  transform: { get label() { return T('kind.transform'); }, params: [] },
  scale: { get label() { return T('kind.scale'); }, params: [] },
  deform: { get label() { return T('kind.deform'); }, params: [] },
  thicken: { get label() { return T('kind.thicken'); }, params: [] },
  rib: { get label() { return T('kind.rib'); }, params: [] },
  vent: { get label() { return T('kind.vent'); }, params: [] },
  fins: { get label() { return T('kind.fins'); }, params: [] },
  fillPattern: { get label() { return T('kind.fillPattern'); }, params: [] },
  web: { get label() { return T('kind.web'); }, params: [] },
  wrap: { get label() { return T('kind.wrap'); }, params: [] },
  emboss: { get label() { return T('kind.emboss'); }, params: [] },
  splitFace: { get label() { return T('kind.splitFace'); }, params: [] },
  dome: { get label() { return T('kind.dome'); }, params: [] },
  mirrorStep: { get label() { return T('kind.mirrorStep'); }, params: [] },
  deleteBody: { get label() { return T('kind.deleteBody'); }, params: [] },
  boss: { get label() { return T('kind.boss'); }, params: [] },
  lipGroove: { get label() { return T('kind.lipGroove'); }, params: [] },
  undercut: { get label() { return T('kind.undercut'); }, params: [] },
  circlipGroove: { get label() { return T('kind.circlipGroove'); }, params: [] },
  keyway: { get label() { return T('kind.keyway'); }, params: [] },
  splineProfile: { get label() { return T('kind.splineProfile'); }, params: [] },
  knurl: { get label() { return T('kind.knurl'); }, params: [] },
  gripPattern: { get label() { return T('kind.gripPattern'); }, params: [] },
  sketch3d: { get label() { return T('kind.sketch3d'); }, params: [] },
  ref: { get label() { return T('kind.ref'); }, params: [] },
  stackHole: { get label() { return T('kind.stackHole'); }, params: [] },
  asmCut: { get label() { return T('kind.asmCut'); }, params: [] },
};
const PRIMITIVE_ORDER = ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'wedge', 'tube', 'torus', 'prism', 'hemisphere'];

// Metrische ISO-Regelgewinde für kosmetische Gewinde (KP-20)
const THREAD_SPECS = [
  { size: 'M2',   d: 2.0,  pitch: 0.4,  core: 1.6  },
  { size: 'M2.5', d: 2.5,  pitch: 0.45, core: 2.05 },
  { size: 'M3',   d: 3.0,  pitch: 0.5,  core: 2.5  },
  { size: 'M4',   d: 4.0,  pitch: 0.7,  core: 3.3  },
  { size: 'M5',   d: 5.0,  pitch: 0.8,  core: 4.2  },
  { size: 'M6',   d: 6.0,  pitch: 1.0,  core: 5.0  },
  { size: 'M8',   d: 8.0,  pitch: 1.25, core: 6.8  },
  { size: 'M10',  d: 10.0, pitch: 1.5,  core: 8.5  },
  { size: 'M12',  d: 12.0, pitch: 1.75, core: 10.2 },
  { size: 'M16',  d: 16.0, pitch: 2.0,  core: 14.0 },
  { size: 'M20',  d: 20.0, pitch: 2.5,  core: 17.5 },
  { size: 'M24',  d: 24.0, pitch: 3.0,  core: 21.0 },
];
const THREAD_MAP = Object.fromEntries(THREAD_SPECS.map((t) => [t.size, t]));

const Model = (() => {
  const T0 = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const defBed = () => ({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0, printFit: '' });
  let docResolver = null;
  function setDocResolver(fn) { docResolver = typeof fn === 'function' ? fn : null; }
  function resolveDoc(docId) { return (docId && docResolver) ? (docResolver(docId) || null) : null; }
  function docType(doc) { return (doc && doc.docType === 'assembly') ? 'assembly' : 'part'; }
  function isAssembly(doc) { return docType(doc) === 'assembly'; }
  function isSubAssemblyRef(it) {
    if (!it || it.kind !== 'ref') return false;
    const rd = resolveDoc(it.p && it.p.docId);
    if (rd) return isAssembly(rd);
    return !!(it.p && it.p.docType === 'assembly');
  }
  function newDoc(name = 'Neues Projekt', opts = {}) {
    return {
      format: 'masswerk', version: 1, docType: (opts && opts.docType === 'assembly') ? 'assembly' : 'part',
      id: uid('p'), name, created: Date.now(), modified: Date.now(),
      params: [], tables: [], items: [], notes: [], blocks: [],
      settings: { printer: 'std', custom: { x: 220, y: 220, z: 250 }, printBed: defBed(), grid: 1, snap: true, unit: 'mm' },
      drawing: null,
    };
  }
  function newAssemblyDoc(name = 'Neue Baugruppe') { return newDoc(name, { docType: 'assembly' }); }
  function newItem(kind, p = {}, extra = {}) {
    const def = KINDS[kind] || { params: [] };
    const params = {};
    for (const q of def.params) params[q.k] = q.def;
    Object.assign(params, p);
    const ld = kind === 'part' && typeof LIBMAP !== 'undefined' ? LIBMAP[params.lib] : null;
    if (ld && ld.mat && !extra.mat) extra = { ...extra, mat: ld.mat };
    return { id: uid('i'), kind, name: extra.name || def.label || 'Objekt', role: extra.role || 'solid', p: params, t: T0(), color: extra.color || nextColor(), hidden: false, locked: false, finishes: [], ...(kind === 'group' ? { children: [] } : {}), ...(extra.mat ? { mat: extra.mat } : {}), ...extra.more };
  }
  function walk(items, fn, parent = null, depth = 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (fn(it, parent, depth, items, i) === false) return false;
      if (it.children && walk(it.children, fn, it, depth + 1) === false) return false;
    }
    return true;
  }
  function find(doc, id) {
    let res = null;
    walk(doc.items, (it, parent, depth, list, index) => { if (it.id === id) { res = { item: it, parent, list, index, depth }; return false; } });
    return res;
  }
  function topOf(doc, id) { // oberstes Objekt, das dieses enthält
    for (const it of doc.items) { if (it.id === id) return it; let found = false; if (it.children) walk(it.children, (c) => { if (c.id === id) { found = true; return false; } }); if (found) return it; }
    return null;
  }
  function parentsOf(doc, id) {
    const chain = [];
    function rec(items, path) { for (const it of items) { if (it.id === id) { chain.push(...path); return true; } if (it.children && rec(it.children, [...path, it])) return true; } return false; }
    rec(doc.items, []);
    return chain;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const D2R = Math.PI / 180;
  let curV = {};
  let curDoc = null;
  let visitedDocs = null;
  function useVars(v) { curV = v || {}; }
  const tv = (x) => (typeof x === 'number' ? x : x == null || x === '' ? 0 : num(x, curV, 0));
  function tnum(it, k) { return tv((it.t || {})[k]); }
  function tNumeric(it) { const t = it.t || {}; return { x: tv(t.x), y: tv(t.y), z: tv(t.z), rx: tv(t.rx), ry: tv(t.ry), rz: tv(t.rz) }; }
  function localMatrix(it, target = new THREE.Matrix4()) {
    const t = it.t || T0();
    _e.set(tv(t.rx) * D2R, tv(t.ry) * D2R, tv(t.rz) * D2R, 'XYZ');
    _q.setFromEuler(_e);
    _v.set(tv(t.x), tv(t.y), tv(t.z));
    return target.compose(_v, _q, _s);
  }
  function worldMatrix(doc, id) {
    const chain = parentsOf(doc, id);
    const f = find(doc, id);
    const m = new THREE.Matrix4();
    const prev = curV;
    try {
      for (const p of chain) {
        m.multiply(localMatrix(p, new THREE.Matrix4()));
        curV = scopeItemVars(curV, p);
      }
      if (f) m.multiply(localMatrix(f.item, new THREE.Matrix4()));
      return m;
    } finally { curV = prev; }
  }
  // Wachsender Abstand/Winkel je Kopie (KP-46): distUnit 'pct' (%) oder 'mm' (mm bzw. °)
  function progressiveOffset(step0, k, distStep = 0, distUnit = 'pct') {
    if (k <= 0) return 0;
    const ds = Number(distStep) || 0;
    if (Math.abs(ds) < 1e-9) return k * step0;
    let sum = 0;
    if (distUnit === 'mm') {
      if (Math.abs(step0) < 1e-9) {
        for (let m = 0; m < k; m++) sum += m * ds;
      } else {
        const sgn = step0 < 0 ? -1 : 1, base = Math.abs(step0);
        for (let m = 0; m < k; m++) sum += sgn * Math.max(0.01, base + m * ds);
      }
    } else {
      const r = Math.max(0.05, 1 + ds / 100);
      for (let m = 0; m < k; m++) sum += step0 * Math.pow(r, m);
    }
    return sum;
  }
  function patternScaleFactor(stepIdx, scaleStep = 0, scaleUnit = 'pct', baseRef = 10) {
    const ss = Number(scaleStep) || 0;
    if (!stepIdx || Math.abs(ss) < 1e-9) return 1;
    if (scaleUnit === 'mm') {
      const ref = Math.max(1e-3, Number(baseRef) || 10);
      return Math.max(0.05, (ref + stepIdx * ss) / ref);
    }
    const r = Math.max(0.05, 1 + ss / 100);
    return Math.max(0.05, Math.pow(r, stepIdx));
  }
  // Alle Kopie-Instanzen einer Muster-Gruppe (inkl. skipped-Flag) – genau wie der Kern sie baut
  function patternInstances(g, V) {
    const I = new THREE.Matrix4();
    if (!g || !g.p || g.p.op !== 'pattern') return [{ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' }];
    const p = g.p.pt === 'path' ? pathPatternParams(g, V) : g.p.pt === 'points' ? pointsPatternParams(g, V) : g.p.pt === 'table' ? tablePatternParams(g, V) : resolveP(g.p, V), N = (k, d) => num(p[k], V, d);
    const skipSet = new Set(Array.isArray(g.p.skip) ? g.p.skip.map((x) => Math.round(Number(x))) : []);
    const distStep = N('distStep', 0), distUnit = p.distUnit === 'mm' ? 'mm' : 'pct';
    const rot = (c, ax, deg) => { const a = new THREE.Vector3(...ax).normalize(); return new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]).multiply(new THREE.Matrix4().makeRotationAxis(a, (deg * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2])); };
    const refl = (nn, o) => { const v = new THREE.Vector3(...nn).normalize(), a = v.x, b = v.y, c = v.z, d = a * o[0] + b * o[1] + c * o[2]; return new THREE.Matrix4().set(1 - 2 * a * a, -2 * a * b, -2 * a * c, 2 * d * a, -2 * a * b, 1 - 2 * b * b, -2 * b * c, 2 * d * b, -2 * a * c, -2 * b * c, 1 - 2 * c * c, 2 * d * c, 0, 0, 0, 1); };
    const out = [];
    if (p.pt === 'rect') {
      const nx = clamp(Math.round(N('nx', 1)), 1, 60), ny = clamp(Math.round(N('ny', 1)), 1, 60), dx = N('dx', 10), dy = N('dy', 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        const ox = progressiveOffset(dx, i, distStep, distUnit), oy = progressiveOffset(dy, j, distStep, distUnit);
        out.push({ idx, stepIdx: i + j, matrix: idx === 0 ? I : new THREE.Matrix4().makeTranslation(ox, oy, 0), skipped: skipSet.has(idx), label: nx > 1 && ny > 1 ? `${i + 1}·${j + 1}` : String(idx + 1) });
      }
    } else if (p.pt === 'circ') {
      const n = clamp(Math.round(N('n', 4)), 1, 120), ang = N('ang', 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [N('cx', 0), N('cy', 0), N('cz', 0)];
      for (let k = 0; k < n; k++) {
        const angK = progressiveOffset(step, k, distStep, distUnit);
        out.push({ idx: k, stepIdx: k, matrix: k === 0 ? I : rot(c, ax, angK), skipped: skipSet.has(k), label: String(k + 1) });
      }
    } else if (p.pt === 'path') {
      const places = (p.places || []).slice(0, 200);
      if (!places.length) out.push({ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' });
      else places.forEach((q, k) => {
        if (k === 0) { out.push({ idx: 0, stepIdx: 0, matrix: I, skipped: skipSet.has(0), label: '1' }); return; }
        const d = (q.d || [0, 0, 0]).map(Number), m = new THREE.Matrix4().makeTranslation(d[0], d[1], d[2]);
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) m.multiply(rot(p.p0, p.n, Number(q.a)));
        out.push({ idx: k, stepIdx: k, matrix: m, skipped: skipSet.has(k), label: String(k + 1) });
      });
    } else if (p.pt === 'points' || p.pt === 'table') {
      const places = (p.places || []).slice(0, 200);
      if (!places.length) out.push({ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' });
      else places.forEach((q, k) => {
        const d = (q.d || [0, 0, 0]).map(Number), m = new THREE.Matrix4().makeTranslation(d[0], d[1], d[2]);
        if (Math.abs(Number(q.a) || 0) > 1e-9) m.multiply(rot(p.p0 || [0, 0, 0], p.n || [0, 0, 1], Number(q.a)));
        out.push({ idx: k, stepIdx: k, matrix: m, skipped: skipSet.has(k), label: String(k + 1) });
      });
    } else if (p.pt === 'mirror' && p.plane === 'FACE' && Array.isArray(p.mn) && Array.isArray(p.mo)) {
      out.push({ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' }, { idx: 1, stepIdx: 1, matrix: refl(p.mn.map(Number), p.mo.map(Number)), skipped: false, label: '2' });
    } else if (p.pt === 'mirror') {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ', n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl], off = N('off', 0);
      out.push({ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' }, { idx: 1, stepIdx: 1, matrix: refl(n, [n[0] * off, n[1] * off, n[2] * off]), skipped: false, label: '2' });
    }
    return out.length ? out : [{ idx: 0, stepIdx: 0, matrix: I, skipped: false, label: '1' }];
  }
  // Lage jeder aktiven Kopie einer Muster-Gruppe im Gruppen-Koordinatensystem – genau wie der Kern sie baut; die erste ist das Original
  function patternMatrices(g, V) {
    const mats = patternInstances(g, V).filter((x) => !x.skipped).map((x) => x.matrix);
    return mats.length ? mats : [new THREE.Matrix4()];
  }
  // Weltlage eines Teils – einmal je Kopie, wenn es in Muster-Gruppen steckt (z. B. ein Motor, viermal im Kreis kopiert)
  function instanceMatrices(doc, id, V = vars(doc).v) {
    const f = find(doc, id); if (!f) return [];
    const chain = parentsOf(doc, id), prev = curV; curV = V;
    try {
      let mats = [new THREE.Matrix4()];
      for (const g of chain) {
        const L = localMatrix(g, new THREE.Matrix4());
        curV = scopeItemVars(curV, g);
        const P = patternMatrices(g, curV), next = [];
        for (const m of mats) for (const q of P) next.push(m.clone().multiply(L).multiply(q));
        mats = next.slice(0, 2000);
      }
      const Li = localMatrix(f.item, new THREE.Matrix4());
      return mats.map((m) => m.multiply(Li));
    } finally { curV = prev; }
  }
  function parentWorld(doc, id) {
    const chain = parentsOf(doc, id);
    const m = new THREE.Matrix4();
    const prev = curV;
    try {
      for (const p of chain) {
        m.multiply(localMatrix(p, new THREE.Matrix4()));
        curV = scopeItemVars(curV, p);
      }
      return m;
    } finally { curV = prev; }
  }
  function setFromMatrix(it, m) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const r = (a) => { let d = round(a / D2R, 6); if (Math.abs(d) < 1e-6) d = 0; if (Math.abs(Math.abs(d) - 180) < 1e-6) d = 180; return d; };
    it.t = { x: round(pos.x, 6), y: round(pos.y, 6), z: round(pos.z, 6), rx: r(e.x), ry: r(e.y), rz: r(e.z) };
  }

  // ---------- Parameter & Tabellen ----------
  function vars(doc) {
    const v = {}, errors = {};
    const tables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    Object.defineProperty(v, '__tables', { value: tables, enumerable: false, configurable: true });
    for (const p of doc.params || []) {
      if (p && p.measure && typeof p.expr === 'number' && isFinite(p.expr)) v[p.name] = p.expr;
    }
    for (const p of doc.params || []) {
      try { v[p.name] = Expr.eval(String(p.expr), v, tables); }
      catch (e) { errors[p.id] = e.message; v[p.name] = 0; }
    }
    return { v, errors };
  }
  function scopeVars(baseV, userPart) {
    const v = { ...(baseV || {}) };
    const baseTables = (baseV && Array.isArray(baseV.__tables)) ? baseV.__tables : [];
    const ownTables = (userPart && Array.isArray(userPart.tables)) ? userPart.tables : [];
    const mergedTables = ownTables.length ? [...baseTables, ...ownTables] : baseTables;
    Object.defineProperty(v, '__tables', { value: mergedTables, enumerable: false, configurable: true });
    for (const p of (userPart && Array.isArray(userPart.params)) ? userPart.params : []) {
      if (!p || !p.name) continue;
      let val = 0;
      try { val = Expr.eval(String(p.expr), v, mergedTables); } catch (_) { val = 0; }
      const low = String(p.name).toLowerCase();
      for (const k of Object.keys(v)) if (k.toLowerCase() === low && k !== p.name) delete v[k];
      v[p.name] = val;
    }
    return v;
  }
  function scopeItemVars(v, it) {
    if (it && it.partRef) v = scopeVars(v, it.partRef);
    if (it && it.userPart) v = scopeVars(v, it.userPart);
    return v;
  }
  function itemVars(doc, id) {
    let v = vars(doc).v;
    for (const p of parentsOf(doc, id)) v = scopeItemVars(v, p);
    const f = find(doc, id);
    if (f && f.item) v = scopeItemVars(v, f.item);
    return v;
  }
  function evalInfo(val, V) {
    if (typeof val === 'number') return isFinite(val) ? { ok: true, value: val } : { ok: false, error: 'Ergebnis ist keine gültige Zahl.' };
    if (val == null || String(val).trim() === '') return { ok: false, error: 'Formel ist leer.' };
    return Expr.tryEval(String(val), V || {});
  }
  function num(val, V, fallback = 0) {
    if (typeof val === 'number') return isFinite(val) ? val : fallback;
    if (val == null || val === '') return fallback;
    try { return Expr.eval(String(val), V || {}); } catch (_) { return fallback; }
  }
  function isExpr(val) { return typeof val === 'string' && isNaN(parseNum(val)); }
  function resolveP(p, V) {
    const out = {};
    for (const k in p || {}) {
      const v = p[k];
      if (typeof v === 'number') out[k] = v;
      else if (typeof v === 'string' && (isExpr(v) || !isNaN(parseNum(v)))) {
        const n = num(v, V, NaN); out[k] = isNaN(n) ? v : n;
      } else out[k] = v;
    }
    return out;
  }

  function remapChildIds(items, prefix) {
    const cloned = deepClone(Array.isArray(items) ? items : []);
    const idMap = new Map();
    walk(cloned, (it) => { if (it && it.id) idMap.set(it.id, prefix + it.id); });
    const mapId = (id) => (id && idMap.has(id) ? idMap.get(id) : id);
    walk(cloned, (it) => {
      if (!it) return;
      if (it.id) it.id = mapId(it.id);
      if (Array.isArray(it.finishes)) {
        it.finishes = it.finishes.map((f) => (f && f.id ? { ...f, id: prefix + f.id } : f));
      }
      if (it.link) it.link = mapId(it.link);
      if (it.op && it.op.target) it.op.target = mapId(it.op.target);
      if (it.p) {
        if (it.p.target) it.p.target = mapId(it.p.target);
        if (it.p.wrapId) it.p.wrapId = mapId(it.p.wrapId);
        if (Array.isArray(it.p.features)) it.p.features = it.p.features.map(mapId);
        if (it.p.sketch && it.p.sketch.planeRef && it.p.sketch.planeRef.id) {
          it.p.sketch.planeRef.id = mapId(it.p.sketch.planeRef.id);
        }
        if (it.p.toFace && it.p.toFace.id) it.p.toFace.id = mapId(it.p.toFace.id);
        if (it.p.path3d && Array.isArray(it.p.path3d.bind)) {
          for (const b of it.p.path3d.bind) {
            if (b && b.id) b.id = mapId(b.id);
          }
        }
      }
    });
    return cloned;
  }

  // Verknüpfte Kopien: Teile mit link = Kennung des Originals übernehmen dessen Form (Art, Maße, Kanten, Rolle);
  // Lage, Name, Farbe, Sichtbarkeit bleiben eigen.
  function syncLinks(doc) {
    let n = 0;
    walk(doc.items, (it) => {
      if (!it.link || it.linkFrozen) return;
      const f = find(doc, it.link);
      if (!f || f.item === it || f.item.link || f.item.kind === 'ref' || f.item.partRef) { it.linkLost = true; return; }
      delete it.linkLost;
      const s = f.item;
      const sm = Array.isArray(s.mir) ? s.mir : [1, 1, 1];
      const expMirArr = it.linkMirror ? [-sm[0], sm[1], sm[2]] : sm;
      const expMir = expMirArr.every((v) => v === 1) ? null : expMirArr;
      if (s.kind === 'group') {
        const prefix = it.id + '__';
        const wantChildren = remapChildIds(s.children || [], prefix);
        const wantRb = s.rollback != null ? s.rollback : null;
        const want = JSON.stringify([s.kind, s.p, s.finishes || [], s.role, expMir, wantChildren, wantRb, s.userPart || null]);
        const curRb = it.rollback != null ? it.rollback : null;
        if (JSON.stringify([it.kind, it.p, it.finishes || [], it.role, it.mir || null, it.children || [], curRb, it.userPart || null]) === want) return;
        it.kind = 'group';
        it.p = deepClone(s.p || {});
        it.finishes = deepClone(s.finishes || []);
        it.role = s.role;
        it.children = wantChildren;
        if (wantRb != null) it.rollback = wantRb; else delete it.rollback;
        if (s.comp) it.comp = true; else delete it.comp;
        if (s.userPart) it.userPart = deepClone(s.userPart); else delete it.userPart;
        if (expMir) it.mir = expMir; else delete it.mir;
        n++;
        return;
      }
      const want = JSON.stringify([s.kind, s.p, s.finishes || [], s.role, expMir, s.userPart || null]);
      if (JSON.stringify([it.kind, it.p, it.finishes || [], it.role, it.mir || null, it.userPart || null]) === want) return;
      it.kind = s.kind; it.p = deepClone(s.p); it.finishes = deepClone(s.finishes || []); it.role = s.role;
      delete it.children; delete it.rollback;
      if (s.userPart) it.userPart = deepClone(s.userPart); else delete it.userPart;
      if (expMir) it.mir = expMir; else delete it.mir;
      n++;
    });
    return n;
  }
  // ---------- Skizzen-Blöcke (SK-31) ----------
  function materializeBlockInst(inst, block, solvedEnts) {
    if (!inst || !block) return [];
    const ang = ((Number(inst.rot) || 0) * Math.PI) / 180;
    const x = Number(inst.x) || 0, y = Number(inst.y) || 0;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const xf = (p) => [Math.round((x + p[0] * cs - p[1] * sn) * 1e6) / 1e6, Math.round((y + p[0] * sn + p[1] * cs) * 1e6) / 1e6];
    const rot90 = Math.abs(sn) < 1e-6 || Math.abs(cs) < 1e-6;
    const srcList = solvedEnts || block.ents || [];
    const out = [];
    for (const se of srcList) {
      const m = SKO.mapEnt(se, xf, (q) => (q.rot || 0) + ang, se.type === 'rect' && !rot90);
      m.ents.forEach((me, i) => {
        me.id = m.ents.length === 1 ? `${inst.id}:${se.id}` : `${inst.id}:${se.id}_${i}`;
        me.blk = inst.id;
        me.blkId = block.id;
        me.blkSrc = se.id;
        out.push(me);
      });
    }
    return out;
  }
  function syncSketchBlocks(sketch, blocks, V) {
    if (!sketch || !Array.isArray(sketch.ents)) return false;
    const insts = Array.isArray(sketch.blockInsts) ? sketch.blockInsts : [];
    const bmap = new Map((blocks || []).map((b) => [b.id, b]));
    const solvedCache = new Map();
    const getSolved = (blk) => {
      if (solvedCache.has(blk.id)) return solvedCache.get(blk.id);
      let ents = blk.ents || [];
      if (typeof Solver !== 'undefined' && Solver.cached && ((blk.dims && blk.dims.length) || (blk.cons && blk.cons.length))) {
        ents = Solver.cached({ ents: blk.ents || [], dims: blk.dims || [], cons: blk.cons || [] }, V || {}).ents;
      }
      solvedCache.set(blk.id, ents);
      return ents;
    };
    const loose = sketch.ents.filter((e) => e && !e.blk);
    const blkEnts = [];
    for (const inst of insts) {
      const blk = bmap.get(inst.blockId);
      if (!blk) continue;
      blkEnts.push(...materializeBlockInst(inst, blk, getSolved(blk)));
    }
    const next = [...loose, ...blkEnts];
    if (JSON.stringify(sketch.ents) === JSON.stringify(next)) return false;
    sketch.ents = next;
    return true;
  }
  function syncBlocks(doc) {
    if (!doc) return 0;
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    const V = typeof vars === 'function' ? vars(doc).v : {};
    let n = 0;
    walk(doc.items, (it) => {
      if (it.p && it.p.sketch && ((it.p.sketch.blockInsts && it.p.sketch.blockInsts.length) || (it.p.sketch.ents && it.p.sketch.ents.some((e) => e && e.blk)))) {
        if (syncSketchBlocks(it.p.sketch, blocks, V)) n++;
      }
    });
    return n;
  }
  // „Was hängt davon ab?“: Bezüge zwischen Teilen – Formschritt-Modus, verknüpfte Kopien, übernommene Kanten,
  // an Körpern hängende Rohr-Punkte, Bezugsebenen an Flächen. Ergebnis: Liste {from, to, what}
  function dependencies(doc) {
    const out = [], top = (id) => { const t = topOf(doc, id); return t ? t.id : id; };
    const measParams = new Map();
    for (const q of doc.params || []) {
      if (q && q.measure && q.measure.id && q.name) measParams.set(String(q.name).toLowerCase(), q);
    }
    walk(doc.items, (it) => {
      const me = top(it.id);
      if (it.op && it.op.target) out.push({ from: me, to: top(it.op.target), what: { join: 'vereinigt mit', cut: 'abgezogen von', common: 'Schnittmenge mit' }[it.op.type] || 'verrechnet mit' });
      if (it.p && it.p.extent === 'toFace' && it.p.toFace && it.p.toFace.id) out.push({ from: me, to: top(it.p.toFace.id), what: 'hochgezogen bis Fläche von' });
      if (it.kind === 'transform' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: it.p.copy ? 'versetzte Kopie von' : 'versetzt' });
      if (it.kind === 'scale' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'skaliert' });
      if (it.kind === 'deform' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'verformt' });
      if (it.kind === 'deleteBody' && it.p) {
        const tgs = Array.isArray(it.p.targets) ? it.p.targets : (it.p.target ? [it.p.target] : []);
        for (const tid of tgs) if (tid) out.push({ from: me, to: top(tid), what: 'löscht Körper' });
      }
      if (measParams.size && typeof Expr !== 'undefined' && Expr.names) {
        const scanObj = (obj) => {
          for (const k in obj || {}) {
            const val = obj[k];
            if (typeof val === 'string') {
              for (const nm of Expr.names(val)) {
                const mp = measParams.get(String(nm).toLowerCase());
                if (mp && mp.measure && mp.measure.id) out.push({ from: me, to: top(mp.measure.id), what: 'übernimmt Messwert von' });
              }
            }
          }
        };
        scanObj(it.p); scanObj(it.t);
        for (const f of it.finishes || []) scanObj(f);
        if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) if (typeof d.v === 'string') scanObj({ v: d.v });
      }
      if (it.kind === 'thicken' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: it.p.mode === 'new' ? 'Platte von Fläche aus' : 'dickt Fläche auf von' });
      if (it.kind === 'rib' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Rippe an' });
      if (it.kind === 'vent' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Lüftungsgitter in' });
      if (it.kind === 'fins' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Kühlrippen auf' });
      if (it.kind === 'fillPattern' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Füllmuster in' });
      if (it.kind === 'group' && it.p && it.p.op === 'pattern' && it.p.pt === 'points' && it.p.sourceId) out.push({ from: me, to: top(it.p.sourceId), what: 'Muster an Punkten von' });
      if (it.kind === 'web' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Steg-Netz an' });
      if (it.kind === 'wrap' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'wickelt um' });
      if (it.kind === 'sweep' && it.p && it.p.wrapId) out.push({ from: me, to: top(it.p.wrapId), what: 'folgt gewickelter Linie von' });
      if (it.kind === 'sweep' && it.p && it.p.sketch3dId) out.push({ from: me, to: top(it.p.sketch3dId), what: 'folgt 3D-Skizze' });
      if (it.kind === 'sketch3d' && it.p && it.p.sketch3d) {
        for (const e of it.p.sketch3d.ents || []) {
          for (const bk of ['bindA', 'bindM', 'bindB']) {
            if (e[bk] && e[bk].id) out.push({ from: me, to: top(e[bk].id), what: '3D-Skizze fängt an' });
          }
        }
      }
      if (it.kind === 'emboss' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'prägt auf' });
      if (it.kind === 'splitFace' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'teilt Fläche von' });
      if (it.kind === 'dome' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Kuppel auf' });
      if (it.kind === 'boss' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Schraubdom auf' });
      if (it.kind === 'undercut' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Freistich an' });
      if (it.kind === 'circlipGroove' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Einstich an' });
      if (it.kind === 'keyway' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Passfeder-Nut in' });
      if (it.kind === 'splineProfile' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Keilwellen-Profil an' });
      if (it.kind === 'knurl' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Rändel an' });
      if (it.kind === 'gripPattern' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Griffmuster auf' });
      if (it.kind === 'lipGroove' && it.p) {
        if (it.p.lipTarget) out.push({ from: me, to: top(it.p.lipTarget), what: 'Lippe an' });
        if (it.p.grooveTarget) out.push({ from: me, to: top(it.p.grooveTarget), what: 'Nut in' });
      }
      if ((it.kind === 'stackHole' || it.kind === 'asmCut') && it.p && it.p.scope === 'selected' && Array.isArray(it.p.targets)) {
        const what = it.kind === 'stackHole' ? 'bohrt durch' : 'schneidet durch';
        for (const tid of it.p.targets) if (tid) out.push({ from: me, to: top(tid), what });
      }
      if (it.kind === 'mirrorStep' && it.p) {
        for (const fid of Array.isArray(it.p.features) ? it.p.features : []) if (fid) out.push({ from: me, to: top(fid), what: 'spiegelt Schritt' });
        if (it.p.plane === 'FACE' && it.p.faceRef && it.p.faceRef.id) out.push({ from: me, to: top(it.p.faceRef.id), what: 'spiegelt an Fläche von' });
      }
      if (it.kind === 'group' && it.p && it.p.op === 'split' && it.p.plane === 'FACE' && it.p.faceRef) {
        if (it.p.faceRef.id) out.push({ from: me, to: top(it.p.faceRef.id), what: 'teilt an Fläche von' });
        if (it.p.faceRef.datumId) out.push({ from: me, to: it.p.faceRef.datumId, what: 'teilt an Bezugsebene', datum: true });
      }
      if (it.link) out.push({ from: me, to: top(it.link), what: 'verknüpfte Kopie von' });
      const sk = it.p && it.p.sketch;
      for (const e of (sk && sk.ents) || []) {
        if (!e.link || !e.link.id) continue;
        if (e.link.kind === 'silhouette') {
          out.push({ from: me, to: top(e.link.id), what: 'Skizze übernimmt Umriss von' });
        } else if (e.link.kind === 'faceIntersect') {
          const tA = top(e.link.id), tB = e.link.id2 ? top(e.link.id2) : null;
          out.push({ from: me, to: tA, what: 'Skizze übernimmt Schnittkurve von' });
          if (tB && tB !== tA) out.push({ from: me, to: tB, what: 'Skizze übernimmt Schnittkurve von' });
        } else {
          out.push({ from: me, to: top(e.link.id), what: 'Skizze übernimmt Kante von' });
        }
      }
      const b = it.p && it.p.path3d && it.p.path3d.bind;
      for (const x of b || []) if (x && x.id) out.push({ from: me, to: top(x.id), what: 'Rohr hängt an' });
      if (it.kind === 'revolve' && it.p && it.p.dir === 'toFace' && it.p.toFace && it.p.toFace.targetId) {
        out.push({ from: me, to: top(it.p.toFace.targetId), what: 'dreht bis Fläche von' });
      }
      if (it.kind === 'loft' && it.p) {
        if (it.p.startFace && it.p.startFace.id) out.push({ from: me, to: top(it.p.startFace.id), what: 'weicher Anschluss (Start) an' });
        if (it.p.endFace && it.p.endFace.id) out.push({ from: me, to: top(it.p.endFace.id), what: 'weicher Anschluss (Ende) an' });
        const sks = Array.isArray(it.p.sketches) ? it.p.sketches : [];
        if ((it.p.startCond === 'tangent' || it.p.startCond === 'curvature') && !it.p.startFace && sks[0] && sks[0].planeRef && sks[0].planeRef.id) {
          out.push({ from: me, to: top(sks[0].planeRef.id), what: 'weicher Anschluss (Start) an' });
        }
        if ((it.p.endCond === 'tangent' || it.p.endCond === 'curvature') && !it.p.endFace && sks[sks.length - 1] && sks[sks.length - 1].planeRef && sks[sks.length - 1].planeRef.id) {
          out.push({ from: me, to: top(sks[sks.length - 1].planeRef.id), what: 'weicher Anschluss (Ende) an' });
        }
      }
    });
    for (const pat of doc.asmPatterns || []) {
      if (!pat || !pat.sourceId || !Array.isArray(pat.copyIds)) continue;
      const what = pat.kind === 'mirror' ? 'gespiegelt von' : 'Baugruppen-Muster von';
      for (const cid of pat.copyIds) {
        if (!cid) continue;
        const cf = find(doc, cid);
        if (cf && cf.item && cf.item.link === pat.sourceId) continue;
        out.push({ from: top(cid), to: top(pat.sourceId), what });
      }
    }
    for (const d of doc.datums || []) {
      const b = d.base || {};
      if ((b.type === 'face' || b.type === 'tangent') && b.id) out.push({ from: 'datum:' + d.id, to: top(b.id), what: 'Bezugsebene an', datum: d.name });
      else if (b.type === 'edgeAngle') {
        if (b.edgeId) out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
        if (b.faceId) out.push({ from: 'datum:' + d.id, to: top(b.faceId), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'normalToCurve' && b.edgeId) {
        out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'edgePoint') {
        if (b.edgeId) out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
        if (b.pBind && b.pBind.id) out.push({ from: 'datum:' + d.id, to: top(b.pBind.id), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'twoEdges') {
        if (b.e1 && b.e1.id) out.push({ from: 'datum:' + d.id, to: top(b.e1.id), what: 'Bezugsebene an', datum: d.name });
        if (b.e2 && b.e2.id) out.push({ from: 'datum:' + d.id, to: top(b.e2.id), what: 'Bezugsebene an', datum: d.name });
      }
    }
    for (const ax of doc.axes || []) {
      const b = ax.base || {};
      if ((b.type === 'roundFace' || b.type === 'roundEdge' || b.type === 'faceNormal') && b.id) out.push({ from: 'axis:' + ax.id, to: top(b.id), what: 'Bezugsachse an', axis: ax.name });
      else if (b.type === 'twoPoints') {
        if (b.bindA && b.bindA.id) out.push({ from: 'axis:' + ax.id, to: top(b.bindA.id), what: 'Bezugsachse an', axis: ax.name });
        if (b.bindB && b.bindB.id) out.push({ from: 'axis:' + ax.id, to: top(b.bindB.id), what: 'Bezugsachse an', axis: ax.name });
      }
    }
    for (const pt of doc.points || []) {
      const b = pt.base || {};
      if ((b.type === 'edgeMid' || b.type === 'curvePercent') && b.edgeId) out.push({ from: 'point:' + pt.id, to: top(b.edgeId), what: 'Bezugspunkt an', point: pt.name });
      else if ((b.type === 'faceCenter' || b.type === 'centerOfMass') && b.id) out.push({ from: 'point:' + pt.id, to: top(b.id), what: 'Bezugspunkt an', point: pt.name });
      else if (b.type === 'edgePlaneIntersect') {
        if (b.edgeId) out.push({ from: 'point:' + pt.id, to: top(b.edgeId), what: 'Bezugspunkt an', point: pt.name });
        if (b.planeRef && b.planeRef.kind === 'face' && b.planeRef.id) out.push({ from: 'point:' + pt.id, to: top(b.planeRef.id), what: 'Bezugspunkt an', point: pt.name });
      }
    }
    for (const cs of doc.csys || []) {
      const b = cs.base || {};
      if (b.originBind && b.originBind.id) out.push({ from: 'csys:' + cs.id, to: top(b.originBind.id), what: 'Koordinatensystem an', csys: cs.name });
      if (b.xEdge && b.xEdge.id) out.push({ from: 'csys:' + cs.id, to: top(b.xEdge.id), what: 'Koordinatensystem an', csys: cs.name });
      if (b.yEdge && b.yEdge.id) out.push({ from: 'csys:' + cs.id, to: top(b.yEdge.id), what: 'Koordinatensystem an', csys: cs.name });
    }
    const seen = new Set();
    return out.filter((x) => { if (x.from === x.to) return false; const k = x.from + '|' + x.to + '|' + x.what; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Größe des ganzen Modells für „Durch alles“ (setzt App nach dem Rechnen, auf 10 mm gerundet)
  let sceneSpan = 100;
  function setSceneSpan(v) { const n = Math.max(20, Math.ceil(v / 10) * 10); if (n === sceneSpan) return false; sceneSpan = n; return true; }
  // Formschritt-Modus: neuer Körper (kein op) oder mit einem früheren Körper verrechnet
  const OPS = { join: 'Vereinigen mit', cut: 'Abziehen von', common: 'Schnittmenge mit' };
  // ---------- Für den CAD-Kern ----------
  function matArr(m) { return Array.from(m.elements); }
  function displayColor(it) {
    if (!it) return '#2f9e91';
    if (it.colorSet && it.color) return it.color;
    if (it.mat && typeof Viewer !== 'undefined' && Viewer.lookOf) {
      const L = Viewer.lookOf(it.mat);
      if (L && L.nat && L.col) return L.col;
    }
    return it.color || '#2f9e91';
  }
  function withPartVariant(refDoc, variantId) {
    if (!refDoc || !variantId || !Array.isArray(refDoc.variants)) return refDoc;
    const vr = refDoc.variants.find((x) => x && (x.id === variantId || x.name === variantId));
    if (!vr) return refDoc;
    const vals = (vr.values && typeof vr.values === 'object') ? vr.values : {};
    const params = (refDoc.params || []).map((p) => (p && Object.prototype.hasOwnProperty.call(vals, p.name) ? { ...p, expr: vals[p.name] } : p));
    for (const [k, val] of Object.entries(vals)) {
      if (!params.some((p) => p && p.name === k)) params.push({ id: uid('m'), name: k, expr: val });
    }
    const sup = new Set(Array.isArray(vr.suppressed) ? vr.suppressed : []);
    const mapItems = (list) => (list || []).map((c) => {
      if (!c) return c;
      const next = { ...c };
      if (sup.has(c.id)) next.suppressed = true;
      else if (next.suppressed) delete next.suppressed;
      if (Array.isArray(c.children)) next.children = mapItems(c.children);
      return next;
    });
    const nextDoc = { ...refDoc, params, items: mapItems(refDoc.items) };
    if (vr.material) nextDoc.settings = { ...(refDoc.settings || {}), material: vr.material };
    return nextDoc;
  }
  function kernelItem(it, V) {
    const prev = curV; curV = V;
    try {
      const m = matArr(localMatrix(it));
      const ownV = scopeItemVars(V, it);
      curV = ownV;
      const o = { id: it.id, kind: it.kind, role: it.role, hidden: !!it.hidden, name: label(it), color: displayColor(it), m };
      if (it.opacity != null && it.opacity < 1) o.opacity = Math.max(0.05, it.opacity);
      if (it.comp) o.comp = true;
      if (it.kind === 'ref') {
        const refId = it.p && it.p.docId;
        const rawRefDoc = refId && (!visitedDocs || !visitedDocs.has(refId)) ? resolveDoc(refId) : null;
        const refDoc = withPartVariant(rawRefDoc, it.p && it.p.variantId);
        if (!refDoc) {
          const outMissing = { id: it.id, kind: 'group', role: it.role || 'solid', hidden: !!it.hidden, name: label(it), color: displayColor(it), m, comp: true, p: { assembly: true, subdoc: true, refMissing: true, refDocId: refId || null }, children: [] };
          if (it.opacity != null && it.opacity < 1) outMissing.opacity = Math.max(0.05, it.opacity);
          return outMissing;
        }
        if (refDoc.fonts && refDoc.fonts.length && typeof SK !== 'undefined' && SK.ensureFonts) SK.ensureFonts(refDoc.fonts);
        const refV = vars(refDoc).v;
        const refAct = activeItems(refDoc);
        const prevDoc = curDoc;
        const prevVisited = visitedDocs;
        visitedDocs = new Set(prevVisited || []);
        visitedDocs.add(refDoc.id);
        curDoc = refDoc;
        curV = refV;
        let children = [];
        try {
          children = refAct.map((c) => kernelItem(c, refV));
        } finally {
          curDoc = prevDoc;
          visitedDocs = prevVisited;
        }
        const refColor = it.colorSet && it.color ? it.color : (refAct.length === 1 ? displayColor(refAct[0]) : displayColor(it));
        const outRef = { id: it.id, kind: 'group', role: it.role || 'solid', hidden: !!it.hidden, name: label(it), color: refColor, m, comp: true, p: { assembly: true, subdoc: true, refDocId: refDoc.id, ...(it.p && it.p.variantId ? { refVariantId: it.p.variantId } : {}) }, children };
        if (it.opacity != null && it.opacity < 1) outRef.opacity = Math.max(0.05, it.opacity);
        if (it.mir) outRef.mir = it.mir;
        return outRef;
      }
      if (it.kind === 'group') {
        let kids = it.children || [];
        if (it.rollback != null) kids = kids.slice(0, clamp(it.rollback, 0, kids.length));
        o.children = kids.filter((c) => !c.suppressed).map((c) => kernelItem(c, ownV));
        if (it.p && it.p.op) o.p = it.p.op === 'pattern'
          ? (it.p.pt === 'path' ? pathPatternParams(it, ownV) : it.p.pt === 'points' ? pointsPatternParams(it, ownV) : it.p.pt === 'table' ? tablePatternParams(it, ownV) : resolveP(it.p, ownV))
          : it.p.op === 'split' ? splitParams(it, ownV) : resolveP(it.p, ownV);
        if (it.p && it.p.assembly) o.p = { ...(o.p || {}), assembly: true };
      }
      else if (it.kind === 'extrude' || it.kind === 'revolve') o.p = sketchParams(it, ownV);
      else if (it.kind === 'loft') o.p = loftParams(it, ownV);
      else if (it.kind === 'sweep') o.p = sweepParams(it, ownV);
      else if (it.kind === 'helix') o.p = helixParams(it, ownV);
      else if (it.kind === 'rib') o.p = ribParams(it, ownV);
      else if (it.kind === 'vent') o.p = ventParams(it, ownV);
      else if (it.kind === 'fins') o.p = finsParams(it, ownV);
      else if (it.kind === 'fillPattern') o.p = fillPatternParams(it, ownV);
      else if (it.kind === 'web') o.p = webParams(it, ownV);
      else if (it.kind === 'wrap') o.p = wrapParams(it, ownV);
      else if (it.kind === 'emboss') o.p = embossParams(it, ownV);
      else if (it.kind === 'splitFace') o.p = splitFaceParams(it, ownV);
      else if (it.kind === 'dome') o.p = domeParams(it, ownV);
      else if (it.kind === 'sketch3d') o.p = { sketch3d: sketch3dResolve(it.p && it.p.sketch3d, ownV) };
      else if (it.kind === 'import') {
        o.p = { fmt: it.p.fmt, scale: num(it.p.scale, ownV, 1) };
        if (it.p.blobId) o.p.blobId = it.p.blobId;
        else if (it.p.data) o.p.data = it.p.data;
        if (it.p.stepEntity != null) o.p.stepEntity = it.p.stepEntity;
        if (Array.isArray(it.p.stepMat) && it.p.stepMat.length === 16) o.p.stepMat = it.p.stepMat;
      } else if (it.kind === 'transform') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          dx: num(p.dx, ownV, 0), dy: num(p.dy, ownV, 0), dz: num(p.dz, ownV, 0),
          rx: num(p.rx, ownV, 0), ry: num(p.ry, ownV, 0), rz: num(p.rz, ownV, 0),
          pivot: p.pivot === 'origin' || p.pivot === 'point' ? p.pivot : 'center',
          px: num(p.px, ownV, 0), py: num(p.py, ownV, 0), pz: num(p.pz, ownV, 0),
          copy: !!p.copy,
        };
      } else if (it.kind === 'scale') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          uniform: p.uniform !== false,
          s: num(p.s, ownV, 1),
          sx: num(p.sx, ownV, 1), sy: num(p.sy, ownV, 1), sz: num(p.sz, ownV, 1),
          pivot: p.pivot === 'origin' ? 'origin' : 'centroid',
        };
      } else if (it.kind === 'deform') {
        const p = it.p || {};
        const mode = p.mode === 'twist' || p.mode === 'taper' ? p.mode : 'bend';
        const axis = p.axis === 'x' || p.axis === 'y' ? p.axis : 'z';
        const bendAxis = (p.bendAxis === 'x' || p.bendAxis === 'y' || p.bendAxis === 'z') && p.bendAxis !== axis ? p.bendAxis : (axis === 'y' ? 'x' : 'y');
        o.p = {
          target: p.target || null,
          mode,
          axis,
          bendAxis,
          angle: num(p.angle, ownV, 90),
          factor: num(p.factor, ownV, 0.5),
          anchor: p.anchor === 'start' || p.anchor === 'end' || p.anchor === 'center' ? p.anchor : null,
          flip: !!p.flip,
        };
      } else if (it.kind === 'thicken') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          t: num(p.t, ownV, 2),
          dir: p.dir === 'in' || p.dir === 'mid' ? p.dir : 'out',
          mode: p.mode === 'new' || p.mode === 'cut' ? p.mode : 'join',
        };
      } else if (it.kind === 'mirrorStep') {
        o.p = mirrorStepParams(it, ownV);
      } else if (it.kind === 'deleteBody') {
        const p = it.p || {};
        const targets = Array.isArray(p.targets) ? p.targets.filter(Boolean) : (p.target ? [p.target] : []);
        o.p = { targets };
      } else if (it.kind === 'boss') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          outerD: num(p.outerD, ownV, 8),
          holeD: num(p.holeD, ownV, 3),
          height: num(p.height, ownV, 10),
          holeDepth: num(p.holeDepth, ownV, 0),
          ribs: Math.max(0, Math.min(6, Math.round(num(p.ribs, ownV, 4)))),
          ribT: num(p.ribT, ownV, 1.5),
          ribL: num(p.ribL, ownV, 4),
          ribH: num(p.ribH, ownV, 0),
          ribAngle: num(p.ribAngle, ownV, 0),
          u: num(p.u, ownV, 0),
          v: num(p.v, ownV, 0),
        };
      } else if (it.kind === 'lipGroove') {
        const p = it.p || {};
        o.p = {
          lipTarget: p.lipTarget || null,
          grooveTarget: p.grooveTarget || null,
          face: p.face || null,
          edge: p.edge || null,
          side: p.side === 'outer' ? 'outer' : 'inner',
          height: num(p.height, ownV, 2),
          width: num(p.width, ownV, 1.2),
          clearance: Math.max(0, num(p.clearance, ownV, 0.2)),
        };
      } else if (it.kind === 'undercut') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          form: p.form === 'B' ? 'B' : 'A',
          pitch: num(p.pitch, ownV, 1.5),
          width: num(p.width, ownV, 5.2),
          grooveD: num(p.grooveD, ownV, 7.3),
          end: p.end === 'bottom' ? 'bottom' : 'top',
          offset: Math.max(0, num(p.offset, ownV, 0)),
          rampAngle: Math.max(10, Math.min(89, num(p.rampAngle, ownV, 30))),
        };
      } else if (it.kind === 'circlipGroove') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          norm: p.norm === 'din472' ? 'din472' : 'din471',
          width: num(p.width, ownV, 1.3),
          grooveD: num(p.grooveD, ownV, 19),
          from: p.from === 'bottom' || p.from === 'center' ? p.from : 'top',
          offset: num(p.offset, ownV, 3),
        };
      } else if (it.kind === 'keyway') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          size: p.size || '6x6',
          width: num(p.width, ownV, 6),
          depth: num(p.depth, ownV, 3.5),
          length: num(p.length, ownV, 20),
          ends: p.ends === 'straight' ? 'straight' : 'round',
          from: p.from === 'top' || p.from === 'bottom' ? p.from : 'center',
          offset: num(p.offset, ownV, 0),
          angle: num(p.angle, ownV, 0),
        };
      } else if (it.kind === 'splineProfile') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          profile: p.profile || '6x16x20',
          teeth: Math.max(4, Math.min(24, Math.round(num(p.teeth, ownV, 6)))),
          rootD: num(p.rootD, ownV, 16),
          b: num(p.b, ownV, 4),
          length: Math.max(0, num(p.length, ownV, 0)),
          from: p.from === 'bottom' ? 'bottom' : 'top',
          offset: Math.max(0, num(p.offset, ownV, 0)),
          angle: num(p.angle, ownV, 0),
        };
      } else if (it.kind === 'knurl') {
        const p = it.p || {};
        o.p = {
          target: p.target || null,
          face: p.face || null,
          style: p.style === 'straight' || p.style === 'angled' ? p.style : 'crossed',
          pitch: num(p.pitch, ownV, 1.0),
          depth: num(p.depth, ownV, 0.38),
          angle: num(p.angle, ownV, 30),
          length: Math.max(0, num(p.length, ownV, 0)),
          from: p.from === 'top' || p.from === 'bottom' ? p.from : 'center',
          offset: num(p.offset, ownV, 0),
          margin: Math.max(0, num(p.margin, ownV, 0)),
        };
      } else if (it.kind === 'gripPattern') {
        const p = it.p || {};
        const kind = p.kind === 'bumps' ? 'bumps' : 'grooves';
        o.p = {
          target: p.target || null,
          face: p.face || null,
          kind,
          mode: p.mode === 'join' || p.mode === 'cut' ? p.mode : (kind === 'bumps' ? 'join' : 'cut'),
          profile: p.profile === 'round' || p.profile === 'rect' ? p.profile : 'v',
          dir: p.dir === 'axial' ? 'axial' : 'ring',
          layout: p.layout === 'grid' ? 'grid' : 'staggered',
          shape: p.shape === 'cone' || p.shape === 'cyl' ? p.shape : 'dome',
          pitch: num(p.pitch, ownV, kind === 'bumps' ? 3.5 : 2.5),
          width: num(p.width, ownV, 1.2),
          size: num(p.size, ownV, 2.0),
          depth: num(p.depth, ownV, 0.8),
          margin: Math.max(0, num(p.margin, ownV, 2)),
          angle: num(p.angle, ownV, 0),
          length: Math.max(0, num(p.length, ownV, 0)),
          from: p.from === 'top' || p.from === 'bottom' ? p.from : 'center',
          offset: num(p.offset, ownV, 0),
        };
      } else if (it.kind === 'stackHole') {
        const p = it.p || {};
        const ht = p.holeType === 'through' || p.holeType === 'blind' || p.holeType === 'fit' ? p.holeType : 'simple';
        const rawDir = Array.isArray(p.dir) && p.dir.length >= 3 ? p.dir.map(Number) : [0, 0, -1];
        const dLen = Math.hypot(rawDir[0] || 0, rawDir[1] || 0, rawDir[2] || 0);
        const dir = dLen > 1e-6 ? [rawDir[0] / dLen, rawDir[1] / dLen, rawDir[2] / dLen] : [0, 0, -1];
        const size = typeof p.size === 'string' && p.size ? p.size : 'M4';
        const head = p.head === 'countersunk' || p.head === 'counterbore' ? p.head : 'none';
        const fit = p.fit === 'fine' || p.fit === 'coarse' || p.fit === 'tap' ? p.fit : 'medium';
        o.p = {
          holeType: ht,
          d: Math.max(0.2, num(p.d, ownV, 6)),
          size,
          head,
          fit,
          tipAngle: num(p.tipAngle, ownV, 118),
          thru: p.thru !== false,
          depth: Math.max(0.2, num(p.depth, ownV, 20)),
          x: num(p.x, ownV, 0),
          y: num(p.y, ownV, 0),
          z: num(p.z, ownV, 0),
          dir,
          scope: p.scope === 'selected' ? 'selected' : 'auto',
          targets: Array.isArray(p.targets) ? p.targets.filter(Boolean) : [],
          printFit: typeof p.printFit === 'string' ? p.printFit : '',
        };
        if (ht === 'through' && typeof threadEntry === 'function') {
          const te = threadEntry(size);
          if (te) o.p.spec = { fine: te.durchgang_fein_mm, hole: te.durchgang_mittel_mm, coarse: te.durchgang_grob_mm, tap: te.kernloch_mm, csk: te.senkung_senk_d_mm || 0, cskAngle: te.senkung_winkel_grad || 90, cbD: te.senkung_zyl_d_mm || 0, cbH: te.senkung_zyl_t_mm || 0 };
        }
      } else if (it.kind === 'asmCut') {
        const p = it.p || {};
        const sp = solveSketchRegions(p.sketch, p.sel, ownV);
        const dist = Math.max(0.1, num(p.dist, ownV, 20));
        o.p = {
          plane: sp.plane,
          regions: sp.regions,
          dir: p.dir === 'normal' || p.dir === 'both' || p.dir === 'two' ? p.dir : 'reverse',
          thru: p.thru !== false,
          dist,
          dist2: Math.max(0.1, num(p.dist2, ownV, dist)),
          scope: p.scope === 'selected' ? 'selected' : 'auto',
          targets: Array.isArray(p.targets) ? p.targets.filter(Boolean) : [],
        };
      }
      else {
        o.p = resolveP(it.p, ownV);
        if (it.p && typeof it.p.printFit === 'string') o.p.printFit = it.p.printFit;
        if (it.kind === 'cylinder' && o.p.printFit) o.p.printFitSign = it.role === 'hole' ? 1 : -1;
        if (it.kind === 'part') {
          if (it.p && typeof it.p.size === 'string') o.p.size = it.p.size;
          if (o.p.lib === 'screwHole' && typeof threadEntry === 'function') {
            const te = threadEntry(o.p.size);
            if (te) o.p.spec = { fine: te.durchgang_fein_mm, hole: te.durchgang_mittel_mm, coarse: te.durchgang_grob_mm, tap: te.kernloch_mm, csk: te.senkung_senk_d_mm || 0, cskAngle: te.senkung_winkel_grad || 90, cbD: te.senkung_zyl_d_mm || 0, cbH: te.senkung_zyl_t_mm || 0 };
          } else if (o.p.lib === 'stdPin' && typeof pinEntry === 'function') {
            const pe = pinEntry(o.p.size ?? o.p.d);
            if (pe) o.p.spec = { d: pe.d_mm, c: pe.c_mm };
          } else if ((o.p.lib === 'stdKey' || o.p.lib === 'stdKeyway') && typeof keyEntry === 'function') {
            const ke = keyEntry(o.p.size);
            if (ke) o.p.spec = { b: ke.b_mm, h: ke.h_mm, t1: ke.t1_mm, t2: ke.t2_mm };
          } else if (o.p.lib === 'splineShaft' && typeof splineEntry === 'function') {
            const se = o.p.profile !== 'custom' ? splineEntry(o.p.profile) : null;
            if (se) o.p.spec = { n: se.n, d: se.d, D: se.D, b: se.b };
          } else if (o.p.lib === 'stdBearing' && typeof bearingEntry === 'function') {
            const be = bearingEntry(o.p.size);
            if (be) o.p.spec = { d: be.d_mm, D: be.D_mm, B: be.B_mm, r: be.r_min_mm, balls: be.kugeln_richtwert || 8 };
          } else if (o.p.lib === 'stdSleeve' && typeof sleeveEntry === 'function') {
            const se = sleeveEntry(o.p.size);
            if (se) o.p.spec = { d: se.d_mm, D: se.D_mm, wall: se.wand_mm, fD: se.flansch_d_mm || (se.D_mm + 4 * se.wand_mm) };
          }
        }
      }
      if (it.mir) o.mir = it.mir;
      if (it.op && OPS[it.op.type] && it.op.target) o.op = { type: it.op.type, target: it.op.target };
      if (it.finishes && it.finishes.length) o.finishes = it.finishes.filter((f) => !f.off).map((f) => { const x = { id: f.id, type: f.type, r: num(f.r, ownV, f.type === 'faceFillet' ? 5 : f.type === 'partingDraft' ? 3 : 1), edges: f.edges, faces: f.faces }; if (f.type === 'fillet' && f.shape === 'g2') x.shape = 'g2'; if (f.type === 'fillet' && f.corner === 'smooth') x.corner = 'smooth'; if (f.vr) { x.vr = true; x.r2 = num(f.r2, ownV, x.r); } if (f.cm) { x.cm = f.cm; if (f.cm === 'two') x.r2 = num(f.r2, ownV, x.r); else x.a = num(f.a, ownV, 45); } if (f.side) x.side = 1; if (f.type === 'shell') { if (f.dir === 'out' || f.dir === 'mid') x.dir = f.dir; if (Array.isArray(f.faceWalls) && f.faceWalls.length) x.faceWalls = f.faceWalls.map((w) => ({ id: w.id, face: w.face, r: num(w.r, ownV, x.r) })); } if (f.type === 'cornerChamfer') { x.v = Array.isArray(f.v) ? f.v.map(Number) : null; x.d1 = num(f.d1, ownV, 2); x.d2 = num(f.d2, ownV, 2); x.d3 = num(f.d3, ownV, 2); } if (f.type === 'partingDraft') { x.sym = f.sym !== false; x.r2 = x.sym ? x.r : num(f.r2, ownV, x.r); x.mode = f.mode || 'mid'; x.axis = f.axis === 'x' || f.axis === 'y' ? f.axis : 'z'; if (f.pos != null) x.pos = num(f.pos, ownV, 0); if (f.flip) x.flip = true; if (x.mode === 'datum') { const dm = curDoc && (curDoc.datums || []).find((d) => d.id === f.datumId); if (dm && dm.plane) { const inv = worldMatrix(curDoc, it.id).invert(); const oL = new THREE.Vector3(...dm.plane.o).applyMatrix4(inv).toArray().map((v) => round(v, 6)); const nL = new THREE.Vector3(...dm.plane.n).transformDirection(inv).normalize().toArray().map((v) => round(v, 6)); x.plane = { o: oL, n: nL }; } else x.missingDatum = true; } } return x; });
      if (it.bodies && it.bodies.length) o.bodies = it.bodies.map((b) => ({ idx: b.idx, c: b.c, name: b.name, color: b.color, hidden: !!b.hidden }));
      return o;
    } finally { curV = prev; }
  }
  function solveSketchRegions(sketch, sel, V) {
    let skForSolve = sketch;
    if (skForSolve && Array.isArray(skForSolve.blockInsts) && skForSolve.blockInsts.length && curDoc && Array.isArray(curDoc.blocks)) {
      skForSolve = { ...skForSolve, ents: (skForSolve.ents || []).slice() };
      syncSketchBlocks(skForSolve, curDoc.blocks, V);
    }
    const ents = skForSolve ? Solver.cached(skForSolve, V).ents : [];
    const plane = sketch ? sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(sel) && sel.length) {
      const f = regs.filter((r) => sel.includes(r.key));
      if (f.length) chosen = f;
    }
    return { ents, plane, regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })) };
  }
  function sketchParams(it, V) {
    const p = it.p || {};
    let ents = [];
    let plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    let out;
    if (it.kind === 'extrude' && p.thin) {
      let skForSolve = p.sketch;
      if (skForSolve && Array.isArray(skForSolve.blockInsts) && skForSolve.blockInsts.length && curDoc && Array.isArray(curDoc.blocks)) {
        skForSolve = { ...skForSolve, ents: (skForSolve.ents || []).slice() };
        syncSketchBlocks(skForSolve, curDoc.blocks, V);
      }
      ents = skForSolve ? Solver.cached(skForSolve, V).ents : [];
      const wall = num(p.wall, V, 2);
      const side = p.wallSide === 'in' || p.wallSide === 'out' ? p.wallSide : 'center';
      const tr = SKO.thinRegions(ents, wall, side, p.sel);
      out = { plane, regions: tr.regions, thin: true };
      if (tr.error) out.thinError = tr.error;
    } else {
      const sp = solveSketchRegions(p.sketch, p.sel, V);
      ents = sp.ents;
      plane = sp.plane;
      out = { plane, regions: sp.regions };
    }
    if (p.sketch && p.sketch.planeRef && p.sketch.planeRef.kind === 'face' && !p.sketch.planeRef.frozen) {
      out.planeRef = {
        kind: 'face',
        id: p.sketch.planeRef.id,
        tid: p.sketch.planeRef.tid || null,
        c: p.sketch.planeRef.c || null,
        n: p.sketch.planeRef.n || null,
      };
    }
    if (it.kind === 'extrude') {
      out.dist = num(p.dist, V, 10); out.dir = p.dir || 'normal'; out.extra = num(p.extra, V, 0);
      if (out.dir === 'two') out.dist2 = num(p.dist2, V, out.dist);
      if (p.extent === 'toFace' && p.toFace && p.toFace.frozen) {
        if (typeof p.toFace.frozenDist === 'number' && isFinite(p.toFace.frozenDist)) out.dist = p.toFace.frozenDist;
      } else if (p.extent === 'toNext' || p.extent === 'toFace') {
        out.extent = p.extent;
        if (p.extent === 'toFace' && p.toFace) {
          if (p.toFace.datumId) {
            const dm = typeof Datums !== 'undefined' ? Datums.find(p.toFace.datumId, curDoc || App.doc) : null;
            out.toFace = dm && dm.plane ? { datumId: p.toFace.datumId, plane: { o: dm.plane.o, n: dm.plane.n } } : { datumId: p.toFace.datumId, missing: true };
          } else {
            out.toFace = { id: p.toFace.id, idx: p.toFace.idx, t: p.toFace.t, c: p.toFace.c, n: p.toFace.n, rel: p.toFace.rel, wc: p.toFace.wc, wn: p.toFace.wn };
          }
        }
      } else if (p.thru) {
        // „Durch alles“: so lang, dass es sicher durch alle Körper reicht (aus der Größe des Modells)
        out.dist = sceneSpan; if (out.dir === 'two' || out.dir === 'both') { out.dir = 'two'; out.dist2 = sceneSpan; }
      }
    }
    else {
      out.dir = p.dir || 'normal';
      out.angle = num(p.angle, V, 360);
      if (out.dir === 'two') out.angle2 = num(p.angle2, V, out.angle);
      if (out.dir === 'toFace') {
        if (p.toFace && Array.isArray(p.toFace.o) && Array.isArray(p.toFace.fn)) {
          out.toFace = { o: p.toFace.o.map(Number), fn: p.toFace.fn.map(Number) };
        }
        out.toFaceFlip = !!p.toFaceFlip;
      }
      if (p.axis3d && Array.isArray(p.axis3d.o) && Array.isArray(p.axis3d.d)) out.axis3d = { o: p.axis3d.o.map(Number), d: p.axis3d.d.map(Number) };
      else {
        const axEnt = p.axisEnt ? ents.find((x) => x.id === p.axisEnt && x.type === 'line') : null;
        const revEnt = !p.axis ? ents.find((x) => x.type === 'line' && x.revAxis) : null;
        const axLine = axEnt || revEnt;
        out.axis = axLine ? { a: axLine.a.slice(), b: axLine.b.slice() } : (p.axis || { a: [0, 0], b: [0, 1] });
      }
    }
    return out;
  }
  function ribParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
    return {
      target: p.target || null,
      plane,
      chains,
      thickness: num(p.thickness, V, 2),
      side: p.side === 'side1' || p.side === 'side2' ? p.side : 'center',
      dir: p.dir === 'parallel' ? 'parallel' : 'normal',
      flip: !!p.flip,
      depth: Math.max(0, num(p.depth, V, 0)),
      draft: num(p.draft, V, 0),
    };
  }
  function ventParams(it, V) {
    const p = it.p || {};
    return {
      target: p.target || null,
      face: p.face || null,
      count: Math.max(1, Math.min(60, Math.round(num(p.count, V, 6)))),
      slotW: Math.max(0.2, num(p.slotW, V, 3)),
      frame: Math.max(0, num(p.frame, V, 4)),
      angle: num(p.angle, V, 0),
      depth: Math.max(0, num(p.depth, V, 0)),
      roundEnds: p.roundEnds !== false,
    };
  }
  function finsParams(it, V) {
    const p = it.p || {};
    return {
      target: p.target || null,
      face: p.face || null,
      count: Math.max(1, Math.min(80, Math.round(num(p.count, V, 6)))),
      finW: Math.max(0.2, num(p.finW, V, 1.5)),
      height: Math.max(0.1, num(p.height, V, 10)),
      margin: Math.max(0, num(p.margin, V, 2)),
      angle: num(p.angle, V, 0),
      draft: Math.max(0, num(p.draft, V, 0)),
    };
  }
  function fillPatternParams(it, V) {
    const p = it.p || {};
    return {
      target: p.target || null,
      face: p.face || null,
      kind: p.kind === 'staggered' || p.kind === 'hex' ? p.kind : 'grid',
      size: Math.max(0.2, num(p.size, V, 5)),
      pitch: Math.max(0.3, num(p.pitch, V, 8)),
      margin: Math.max(0, num(p.margin, V, 4)),
      angle: num(p.angle, V, 0),
      depth: Math.max(0, num(p.depth, V, 0)),
    };
  }
  function webParams(it, V) {
    const p = it.p || {};
    let skForSolve = p.sketch;
    if (skForSolve && Array.isArray(skForSolve.blockInsts) && skForSolve.blockInsts.length && curDoc && Array.isArray(curDoc.blocks)) {
      skForSolve = { ...skForSolve, ents: (skForSolve.ents || []).slice() };
      syncSketchBlocks(skForSolve, curDoc.blocks, V);
    }
    const ents = skForSolve ? Solver.cached(skForSolve, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const paths = SK.webPaths ? SK.webPaths(ents) : SK.chains(ents).map((ch) => ({ segs: ch.segs, closed: false, extA: true, extB: true }));
    return {
      target: p.target || null,
      plane,
      paths,
      thickness: Math.max(0.05, num(p.thickness, V, 2)),
      depth: Math.max(0, num(p.depth, V, 0)),
      draft: num(p.draft, V, 0),
      flip: !!p.flip,
      extend: p.extend !== false,
    };
  }
  function wrapParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const regs = SK.regions(ents);
    const regions = regs.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) }));
    const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
    return {
      target: p.target || null,
      face: p.face || null,
      regions,
      chains,
      mode: p.mode === 'deboss' || p.mode === 'line' ? p.mode : 'emboss',
      depth: num(p.depth, V, 2),
      angle: num(p.angle, V, 0),
      shiftY: num(p.shiftY, V, 0),
      rot: num(p.rot, V, 0),
      flip: !!p.flip,
    };
  }
  function wrapAngleInfo(itOrP, V = {}, doc = null) {
    const p = (itOrP && itOrP.p) ? itOrP.p : (itOrP || {});
    const sk = p.sketch;
    if (!sk) return null;
    const ents = typeof Solver !== 'undefined' ? Solver.cached(sk, V).ents : (sk.ents || []);
    const rotRad = (num(p.rot, V, 0) * Math.PI) / 180;
    const flip = !!p.flip;
    let minX = Infinity, maxX = -Infinity;
    const addPt = (q) => {
      if (!q) return;
      let x = flip ? -q[0] : q[0], y = q[1];
      if (Math.abs(rotRad) > 1e-9) x = x * Math.cos(rotRad) - y * Math.sin(rotRad);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    };
    const regs = typeof SK !== 'undefined' ? SK.regions(ents) : [];
    for (const r of regs) {
      if (r.outer && r.outer.poly) for (const q of r.outer.poly) addPt(q);
    }
    if (!isFinite(minX)) {
      const chains = typeof SK !== 'undefined' ? SK.chains(ents) : [];
      for (const ch of chains) for (const s of ch.segs || []) for (const q of SK.segPoints(s)) addPt(q);
    }
    if (!isFinite(minX)) {
      const b = typeof SK !== 'undefined' ? SK.bounds(ents) : null;
      if (b) { addPt([b[0], b[1]]); addPt([b[2], b[3]]); addPt([b[0], b[3]]); addPt([b[2], b[1]]); }
    }
    if (!isFinite(minX)) return null;
    const width = Math.max(0, maxX - minX);
    let R = null;
    const rr = itOrP && itOrP.id && typeof App !== 'undefined' && App.resolvedOf ? App.resolvedOf(itOrP.id) : null;
    if (rr && rr.radius > 1e-6) R = rr.radius;
    const d = doc || (typeof App !== 'undefined' ? App.doc : null);
    if (R == null && p.target && typeof App !== 'undefined' && App.results) {
      let tid = p.target;
      while (tid && App.mergedInto && App.mergedInto(tid)) tid = App.mergedInto(tid);
      const res = App.results.get(tid) || App.results.get(p.target);
      const cyls = (res && res.data && res.data.faces || []).filter((f) => f.t === 'CYLINDRE' && typeof f.r === 'number');
      if (cyls.length === 1) R = cyls[0].r;
      else if (cyls.length > 1 && p.face && typeof p.face.r === 'number') {
        let best = cyls[0], bd = Infinity;
        for (const fc of cyls) {
          const dd = Math.abs(fc.r - p.face.r) * 10 + (p.face.c && fc.c ? Math.hypot(fc.c[0] - p.face.c[0], fc.c[1] - p.face.c[1], fc.c[2] - p.face.c[2]) : 0);
          if (dd < bd) { bd = dd; best = fc; }
        }
        R = best.r;
      } else if (cyls.length) {
        R = cyls[0].r;
      }
      if (R == null && d) {
        const tf = find(d, p.target);
        if (tf && (tf.item.kind === 'cylinder' || tf.item.kind === 'tube') && tf.item.p) R = num(tf.item.p.d, V, 20) / 2;
      }
    }
    if (R == null && p.face && typeof p.face.r === 'number') R = p.face.r;
    if (!(R > 1e-6)) return null;
    const deg = (width / R) * (180 / Math.PI);
    const pct = (width / (2 * Math.PI * R)) * 100;
    return { width, radius: R, deg, pct };
  }
  function embossParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    return {
      target: p.target || null,
      face: p.face || null,
      plane,
      regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })),
      height: num(p.height, V, 1),
      mode: p.mode === 'deboss' ? 'deboss' : 'emboss',
      flip: !!p.flip,
    };
  }
  function splitFaceParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
    return {
      target: p.target || null,
      face: p.face || null,
      plane,
      regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })),
      chains,
      side: p.side === 'back' || p.side === 'both' ? p.side : 'front',
    };
  }
  function domeParams(it, V) {
    const p = it.p || {};
    return {
      target: p.target || null,
      face: p.face || null,
      height: num(p.height, V, 5),
      shape: p.shape === 'spherical' ? 'spherical' : 'elliptical',
      flip: !!p.flip,
    };
  }
  function mirrorStepParams(it, V) {
    const p = it.p || {};
    const features = Array.isArray(p.features) ? p.features.slice() : [];
    const doc = curDoc || (typeof App !== 'undefined' ? App.doc : null);
    let moW, mnW;
    if (p.plane === 'DATUM') {
      const dm = typeof Datums !== 'undefined' && doc ? Datums.find(p.datumId, doc) : null;
      if (!dm || !dm.plane) return { features, missingPlane: 'Die gewählte Bezugsebene fehlt' };
      moW = dm.plane.o.map(Number);
      mnW = dm.plane.n.map(Number);
    } else if (p.plane === 'FACE') {
      if (!Array.isArray(p.mo) || !Array.isArray(p.mn)) return { features, missingPlane: 'Keine Spiegelfläche gewählt' };
      moW = p.mo.map(Number);
      mnW = p.mn.map(Number);
    } else {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ';
      const off = num(p.off, V, 0);
      mnW = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl];
      moW = [mnW[0] * off, mnW[1] * off, mnW[2] * off];
    }
    const len = Math.hypot(mnW[0], mnW[1], mnW[2]);
    if (!(len > 1e-6) || !moW.every(isFinite) || !mnW.every(isFinite)) return { features, missingPlane: 'Ungültige Spiegelebene' };
    let mo = moW, mn = [mnW[0] / len, mnW[1] / len, mnW[2] / len];
    const ps = doc ? parentsOf(doc, it.id) : [];
    if (ps.length) {
      const inv = parentWorld(doc, it.id).invert();
      mo = new THREE.Vector3(...mo).applyMatrix4(inv).toArray();
      mn = new THREE.Vector3(...mn).transformDirection(inv).normalize().toArray();
    }
    return { features, mo: mo.map((x) => round(x, 6)), mn: mn.map((x) => round(x, 9)), plane: p.plane || 'YZ' };
  }
  // Muster entlang Kurve: Lage und Drehung jeder Kopie aus der Kurve der Gruppe (p.sketch) berechnen.
  // Die Kopie k wird um (Punkt k − Punkt 0) verschoben; mit „ausrichten“ dreht sie sich mit der Kurve.
  function pathCurve(ents) {
    let poly = null, closed = false;
    const ch = SK.chains(ents)[0];
    if (ch) { poly = []; for (const s of ch.segs) for (const q of SK.segPoints(s)) if (!poly.length || SK.d2(poly[poly.length - 1], q) > 1e-9) poly.push(q); }
    else { const regs = SK.regions(ents).sort((a, b) => b.area - a.area); if (regs.length) { poly = regs[0].outer.poly.slice(); closed = true; } }
    if (!poly || poly.length < 2) return null;
    const ref = ents.find((e) => e.type === 'point');
    if (ref && closed) { let bi = 0, bd = Infinity; poly.forEach((q, i) => { const d = SK.d2(q, ref.a); if (d < bd) { bd = d; bi = i; } }); poly = poly.slice(bi).concat(poly.slice(0, bi)); }
    else if (ref && SK.d2(ref.a, poly[poly.length - 1]) < SK.d2(ref.a, poly[0])) poly.reverse();
    if (closed) poly.push(poly[0]);
    const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + SK.d2(poly[i - 1], poly[i]));
    return { poly, cum, len: cum[cum.length - 1], closed };
  }
  function pathAt(C, s) {
    const { poly, cum } = C; let i = 1;
    while (i < poly.length - 1 && cum[i] < s) i++;
    const a = poly[i - 1], b = poly[i], L = cum[i] - cum[i - 1] || 1, t = clamp((s - cum[i - 1]) / L, 0, 1);
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  // Lage (2D in der Kurvenebene) und Richtung jeder Kopie; die erste ist das Original am Kurvenanfang
  function pathPlaces(ents, n, d, distStep = 0, distUnit = 'pct') {
    const C = pathCurve(ents); if (!C || C.len < 1e-6) return [];
    const N = clamp(Math.round(n), 1, 200);
    const ds = Number(distStep) || 0;
    const out = [];
    if (Math.abs(ds) < 1e-9) {
      const step = d > 0 ? d : C.closed ? C.len / N : N > 1 ? C.len / (N - 1) : 0;
      for (let k = 0; k < N; k++) {
        const s = k * step;
        if (k && (C.closed ? s > C.len - 1e-6 : s > C.len + 1e-6)) break;
        out.push(pathAt(C, Math.min(s, C.len)));
      }
      return out;
    }
    if (d > 0) {
      for (let k = 0; k < N; k++) {
        const s = progressiveOffset(d, k, ds, distUnit);
        if (k && (C.closed ? s > C.len - 1e-6 : s > C.len + 1e-6)) break;
        out.push(pathAt(C, Math.min(s, C.len)));
      }
      return out;
    }
    const M = C.closed ? N : N - 1;
    if (M <= 0) { out.push(pathAt(C, 0)); return out; }
    let gaps;
    if (distUnit === 'mm') {
      const b0 = (C.len - (ds * M * (M - 1)) / 2) / M;
      if (b0 >= 0.01) {
        gaps = Array.from({ length: M }, (_, m) => b0 + m * ds);
      } else {
        const w = Array.from({ length: M }, (_, m) => Math.max(0.01, 1 + m * Math.max(0, ds)));
        const sum = w.reduce((a, b) => a + b, 0) || 1;
        gaps = w.map((v) => (v / sum) * C.len);
      }
    } else {
      const r = Math.max(0.05, 1 + ds / 100);
      const w = Array.from({ length: M }, (_, m) => Math.pow(r, m));
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      gaps = w.map((v) => (v / sum) * C.len);
    }
    let s = 0;
    for (let k = 0; k < N; k++) {
      if (k > 0 && C.closed && s > C.len - 1e-6) break;
      out.push(pathAt(C, Math.min(s, C.len)));
      if (k < gaps.length) s += gaps[k];
    }
    return out;
  }
  function pathPatternParams(it, V) {
    const p = it.p || {}, out = { op: 'pattern', pt: 'path', places: [], n: [0, 0, 1], p0: [0, 0, 0], align: p.align !== false && p.align !== 'nein' };
    if (Array.isArray(p.skip) && p.skip.length) out.skip = p.skip.slice();
    const scaleStep = num(p.scaleStep, V, 0), scaleUnit = p.scaleUnit === 'mm' ? 'mm' : 'pct';
    const distStep = num(p.distStep, V, 0), distUnit = p.distUnit === 'mm' ? 'mm' : 'pct';
    if (Math.abs(scaleStep) > 1e-9) { out.scaleStep = scaleStep; out.scaleUnit = scaleUnit; }
    if (Math.abs(distStep) > 1e-9) { out.distStep = distStep; out.distUnit = distUnit; }
    if (!p.sketch) return out;
    const L = pathPlaces(Solver.cached(p.sketch, V).ents, num(p.n, V, 5), num(p.d, V, 0), distStep, distUnit); if (!L.length) return out;
    const pl = p.sketch.plane, x = pl.x, n = pl.n, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    const W = (u, v) => [x[0] * u + y[0] * v, x[1] * u + y[1] * v, x[2] * u + y[2] * v];
    const P0 = L[0];
    for (const q of L) {
      let da = ((q.ang - P0.ang) * 180) / Math.PI; while (da > 180) da -= 360; while (da <= -180) da += 360;
      out.places.push({ d: W(q.p[0] - P0.p[0], q.p[1] - P0.p[1]).map((v) => Math.round(v * 1e6) / 1e6), a: Math.round(da * 1e6) / 1e6 });
    }
    const o = pl.o, w0 = W(P0.p[0], P0.p[1]);
    out.p0 = [o[0] + w0[0], o[1] + w0[1], o[2] + w0[2]]; out.n = n.slice();
    return out;
  }
  function splitParams(it, V) {
    const p = it.p || {};
    const keep = p.keep === 'positive' || p.keep === 'negative' ? p.keep : 'both';
    const gap = Math.max(0, num(p.gap, V, 0));
    if (p.plane === 'SKETCH') {
      const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
      const sketchPlane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
      const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
      const regions = SK.regions(ents).map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) }));
      return { op: 'split', plane: 'SKETCH', sketchPlane, chains, regions, keep, gap };
    }
    if (p.plane === 'FACE') {
      const out = { op: 'split', plane: 'FACE', keep, gap };
      const doc = curDoc || (typeof App !== 'undefined' ? App.doc : null);
      const ref = p.faceRef;
      const toLocalPlane = (oW, nW) => {
        const inv = doc ? worldMatrix(doc, it.id).invert() : new THREE.Matrix4();
        const oL = new THREE.Vector3(...oW).applyMatrix4(inv).toArray().map((v) => round(v, 6));
        const nL = new THREE.Vector3(...nW).transformDirection(inv).normalize().toArray().map((v) => round(v, 9));
        return { o: oL, n: nL };
      };
      if (ref && ref.datumId) {
        const dm = typeof Datums !== 'undefined' && doc ? Datums.find(ref.datumId, doc) : null;
        if (!dm || !dm.plane) {
          out.missingFace = 'Die gewählte Bezugsebene fehlt.';
        } else {
          out.facePlane = toLocalPlane(dm.plane.o, dm.plane.n);
          out.faceRef = { datumId: ref.datumId, label: dm.name || ref.label || 'Bezugsebene' };
        }
      } else if (ref && ref.id) {
        out.faceRef = { ...ref };
        if (ref.t === 'PLANE' && Array.isArray(ref.wc) && Array.isArray(ref.wn)) {
          out.facePlane = toLocalPlane(ref.wc, ref.wn);
        }
      } else {
        out.missingFace = 'Keine Schnittfläche gewählt.';
      }
      return out;
    }
    return resolveP(p, V);
  }
  function splitPatternCsvLine(line, sep) {
    if (sep === 'ws') return line.trim().split(/\s+/);
    const out = []; let cur = '', qq = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (qq) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') qq = false;
        else cur += ch;
      } else if (ch === '"') qq = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parsePatternCSV(text, V = {}) {
    const lines = String(text ?? '').replace(/^\ufeff/, '').split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
    if (!lines.length) return { ok: false, rows: [], skipped: 0, header: false, error: 'Die Tabelle enthält keine Zeilen.' };
    const evalCell = (raw, sep) => {
      const s = String(raw ?? '').trim();
      if (!s) return NaN;
      const norm = sep === ',' ? s : s.replace(/(\d),(\d)/g, '$1.$2');
      const p = parseNum(s);
      if (sep !== ',' && !isNaN(p)) return p;
      const nDirect = Number(norm);
      if (isFinite(nDirect)) return nDirect;
      return num(s, V, NaN);
    };
    let sep = 'ws';
    if (lines.some((l) => l.includes(';'))) sep = ';';
    else if (lines.some((l) => l.includes('\t'))) sep = '\t';
    else if (lines.some((l) => l.includes(','))) {
      const testLine = lines[lines.length - 1];
      const byComma = splitPatternCsvLine(testLine, ',');
      if (byComma.length >= 2 && byComma.slice(0, 2).every((c) => isFinite(evalCell(c, ',')))) sep = ',';
      else if (/\s+/.test(testLine)) sep = 'ws';
      else sep = ',';
    }
    const firstCells = splitPatternCsvLine(lines[0], sep);
    const hasHeader = firstCells.length < 2 || !isFinite(evalCell(firstCells[0], sep)) || !isFinite(evalCell(firstCells[1], sep));
    let colX = 0, colY = 1, colZ = -1, colRot = -1;
    if (hasHeader) {
      const lower = firstCells.map((c) => c.trim().toLowerCase());
      const findCol = (names) => lower.findIndex((c) => names.includes(c));
      const ix = findCol(['x', 'dx', 'pos_x', 'posx']);
      const iy = findCol(['y', 'dy', 'pos_y', 'posy']);
      const iz = findCol(['z', 'dz', 'pos_z', 'posz']);
      const ir = findCol(['rot', 'rz', 'angle', 'winkel', 'deg', 'grad', 'a']);
      if (ix >= 0 && iy >= 0 && ix !== iy) {
        colX = ix; colY = iy; colZ = iz; colRot = ir;
      } else if (firstCells.length >= 3 && /^(id|nr|no|index|name|punkt|point|#)$/i.test(firstCells[0].trim())) {
        colX = 1; colY = 2;
        if (firstCells.length >= 4) colZ = 3;
        if (firstCells.length >= 5) colRot = 4;
      } else {
        if (firstCells.length >= 3) colZ = 2;
        if (firstCells.length >= 4) colRot = 3;
      }
    } else {
      if (firstCells.length >= 3) colZ = 2;
      if (firstCells.length >= 4) colRot = 3;
    }
    const startIdx = hasHeader ? 1 : 0;
    const rows = []; let skipped = 0;
    for (let i = startIdx; i < lines.length; i++) {
      const cells = splitPatternCsvLine(lines[i], sep);
      if (cells.length <= Math.max(colX, colY)) { skipped++; continue; }
      const x = evalCell(cells[colX], sep), y = evalCell(cells[colY], sep);
      if (!isFinite(x) || !isFinite(y)) { skipped++; continue; }
      let z = 0, hasZ = false;
      if (colZ >= 0 && colZ < cells.length && String(cells[colZ]).trim() !== '') {
        const zv = evalCell(cells[colZ], sep);
        if (isFinite(zv)) { z = zv; hasZ = true; }
      }
      let rot = 0;
      if (colRot >= 0 && colRot < cells.length && String(cells[colRot]).trim() !== '') {
        const rv = evalCell(cells[colRot], sep);
        if (isFinite(rv)) rot = rv;
      }
      rows.push({ x, y, z, rot, hasZ });
      if (rows.length >= 200) break;
    }
    if (!rows.length) return { ok: false, rows: [], skipped, header: hasHeader, error: 'Mindestens eine gültige Zeile mit X und Y erforderlich.' };
    return { ok: true, rows, skipped, header: hasHeader, error: null };
  }
  function patternBaseCenter(it, V) {
    const ownV = scopeItemVars(V, it);
    const box = new THREE.Box3();
    for (const c of (it && it.children) || []) {
      if (!c || c.suppressed) continue;
      const lb = itemLocalBox(c, ownV);
      if (!lb) continue;
      box.union(new THREE.Box3(new THREE.Vector3(lb[0], lb[1], lb[2]), new THREE.Vector3(lb[3], lb[4], lb[5])).applyMatrix4(localMatrix(c, new THREE.Matrix4())));
    }
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      return [c.x, c.y, c.z];
    }
    if (it && it.p && Array.isArray(it.p.ref) && it.p.ref.length >= 3) return it.p.ref.slice(0, 3).map((v) => Number(v) || 0);
    return [0, 0, 0];
  }
  function pointsPatternParams(it, V) {
    const p = it.p || {}, out = { op: 'pattern', pt: 'points', places: [], n: [0, 0, 1], p0: [0, 0, 0] };
    if (Array.isArray(p.skip) && p.skip.length) out.skip = p.skip.slice();
    const doc = curDoc || (typeof App !== 'undefined' ? App.doc : null);
    let sk = p.sketch || null;
    let toLocal = new THREE.Matrix4();
    if (p.sourceId && doc) {
      const src = find(doc, p.sourceId);
      if (src && src.item && src.item.p && src.item.p.sketch) {
        sk = src.item.p.sketch;
        const fIt = find(doc, it.id);
        const wIt = fIt ? worldMatrix(doc, it.id) : new THREE.Matrix4();
        const wSrc = worldMatrix(doc, src.item.id);
        toLocal = wIt.clone().invert().multiply(wSrc);
      } else sk = null;
    }
    if (!sk || !sk.plane) return out;
    let skForSolve = sk;
    if (Array.isArray(skForSolve.blockInsts) && skForSolve.blockInsts.length && doc && Array.isArray(doc.blocks)) {
      skForSolve = { ...skForSolve, ents: (skForSolve.ents || []).slice() };
      syncSketchBlocks(skForSolve, doc.blocks, V);
    }
    const ents = typeof Solver !== 'undefined' ? Solver.cached(skForSolve, V).ents : (skForSolve.ents || []);
    const pl = sk.plane;
    const xV = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize();
    const nV = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize();
    const yV = new THREE.Vector3().crossVectors(nV, xV);
    const oV = new THREE.Vector3(...(pl.o || [0, 0, 0]));
    const plO = oV.clone().applyMatrix4(toLocal).toArray();
    const plN = nV.clone().transformDirection(toLocal).normalize().toArray();
    const ref = patternBaseCenter(it, V);
    const dRef = (ref[0] - plO[0]) * plN[0] + (ref[1] - plO[1]) * plN[1] + (ref[2] - plO[2]) * plN[2];
    const refOnPlane = [ref[0] - dRef * plN[0], ref[1] - dRef * plN[1], ref[2] - dRef * plN[2]];
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const pts3 = [];
    for (const e of ents) {
      if (!e || e.type !== 'point' || !Array.isArray(e.a) || e.a.length < 2) continue;
      const wp = oV.clone().addScaledVector(xV, Number(e.a[0]) || 0).addScaledVector(yV, Number(e.a[1]) || 0).applyMatrix4(toLocal);
      pts3.push([wp.x, wp.y, wp.z]);
      if (pts3.length >= 200) break;
    }
    if (!pts3.length) return out;
    for (const q of pts3) {
      out.places.push({ d: [r6(q[0] - refOnPlane[0]), r6(q[1] - refOnPlane[1]), r6(q[2] - refOnPlane[2])], a: 0 });
    }
    if (p.keepOrigin && !pts3.some((q) => Math.hypot(q[0] - refOnPlane[0], q[1] - refOnPlane[1], q[2] - refOnPlane[2]) < 1e-4)) {
      out.places.unshift({ d: [0, 0, 0], a: 0 });
    }
    out.n = plN;
    out.p0 = ref;
    return out;
  }
  function tablePatternParams(it, V) {
    const p = it.p || {}, out = { op: 'pattern', pt: 'table', places: [], n: [0, 0, 1], p0: [0, 0, 0] };
    if (Array.isArray(p.skip) && p.skip.length) out.skip = p.skip.slice();
    const parsed = parsePatternCSV(p.csv, V);
    if (!parsed.ok || !parsed.rows.length) return out;
    const ref = patternBaseCenter(it, V);
    const relMode = p.mode === 'rel';
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    for (const r of parsed.rows) {
      const dx = relMode ? r.x : r.x - ref[0];
      const dy = relMode ? r.y : r.y - ref[1];
      const dz = r.hasZ ? (relMode ? r.z : r.z - ref[2]) : 0;
      out.places.push({ d: [r6(dx), r6(dy), r6(dz)], a: r6(r.rot || 0) });
    }
    out.p0 = ref;
    return out;
  }
  // Übergang (Loft): je Profil die größte geschlossene Fläche, dazu optional eine Spitze hinter dem letzten Profil
  function loftParams(it, V) {
    const p = it.p || {};
    const profiles = [];
    for (const sk of p.sketches || []) {
      const regs = SK.regions(Solver.cached(sk, V).ents).sort((a, b) => b.area - a.area);
      if (!regs.length) continue;
      const L = regs[0].outer; let cx = 0, cy = 0; for (const q of L.poly) { cx += q[0]; cy += q[1]; } cx /= L.poly.length || 1; cy /= L.poly.length || 1;
      const prof = { plane: sk.plane, outer: L.k, c: [cx, cy], poly: L.poly };
      if (sk.planeRef && sk.planeRef.kind === 'face' && sk.planeRef.id && !sk.planeRef.frozen) {
        prof.planeRef = {
          kind: 'face',
          id: sk.planeRef.id,
          tid: sk.planeRef.tid || null,
          c: sk.planeRef.c || null,
          n: sk.planeRef.n || null,
        };
      }
      profiles.push(prof);
    }
    const out = { profiles, ruled: !!p.ruled };
    if (p.closed) {
      out.closed = true;
      return out;
    }
    // Führungskurve: Zwischenschnitte, die in Richtung der Kurve so gestreckt werden, dass sie die Kurve berühren
    const rails = p.path ? [] : [p.rail, p.rail2].filter(Boolean).map((r) => ({ plane: r.plane, ch: SK.chains(Solver.cached(r, V).ents)[0] })).filter((r) => r.ch);
    if (rails.length && profiles.length >= 2) { const sec = railSections(profiles, rails); if (sec) { out.sections3 = sec; return out; } }
    // Mittellinie: längster offener Zug der Pfad-Skizze, so gedreht, dass er beim ersten Umriss beginnt
    const ch = p.path ? SK.chains(Solver.cached(p.path, V).ents)[0] : null;
    if (ch && profiles.length >= 2) {
      const W3 = (pl, q) => { const n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]]; return [0, 1, 2].map((k) => pl.o[k] + x[k] * q[0] + y[k] * q[1]); };
      const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const c0 = W3(profiles[0].plane, profiles[0].c), c1 = W3(profiles[profiles.length - 1].plane, profiles[profiles.length - 1].c);
      const s0 = W3(p.path.plane, ch.segs[0].a), s1 = W3(p.path.plane, ch.segs[ch.segs.length - 1].b);
      let segs = ch.segs;
      if (d3(s0, c0) + d3(s1, c1) > d3(s0, c1) + d3(s1, c0)) segs = segs.slice().reverse().map((g) => (g.t === 'bez' ? { ...g, a: g.b, b: g.a, c1: g.c2, c2: g.c1 } : { ...g, a: g.b, b: g.a }));
      out.path = { plane: p.path.plane, segs };
      return out;   // mit Mittellinie: keine Spitze, kein „gerade“
    }
    const normCond = (c) => (c === 'tangent' || c === 'curvature' ? c : 'none');
    const startCond = normCond(p.startCond);
    let endCond = normCond(p.endCond);
    const tip = num(p.tip, V, 0);
    if (tip > 0 && endCond !== 'none') endCond = 'none';
    if ((startCond !== 'none' || endCond !== 'none') && profiles.length >= 2) {
      out.ruled = false;
      out.startCond = startCond;
      out.endCond = endCond;
      out.startWeight = clamp(num(p.startWeight, V, 1), 0.1, 3);
      out.endWeight = clamp(num(p.endWeight, V, 1), 0.1, 3);
      if (p.startFace && p.startFace.id) out.startFace = p.startFace;
      if (p.endFace && p.endFace.id) out.endFace = p.endFace;
      return out;
    }
    if (tip > 0 && profiles.length) {
      const last = profiles[profiles.length - 1], pl = last.plane;
      const n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
      const prev = profiles.length > 1 ? profiles[profiles.length - 2].plane.o : null;
      let s = 1; if (prev) { const d = [0, 1, 2].map((k) => pl.o[k] - prev[k]); if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0) s = -1; }
      out.tipPoint = [0, 1, 2].map((k) => pl.o[k] + x[k] * last.c[0] + y[k] * last.c[1] + n[k] * tip * s);
    }
    return out;
  }
  // ---------- Übergang mit Führungskurve ----------
  const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: (a) => Math.hypot(a[0], a[1], a[2]) };
  const planeY = (pl) => v3.cross(pl.n, pl.x);
  const W3p = (pl, q) => { const y = planeY(pl); return [0, 1, 2].map((k) => pl.o[k] + pl.x[k] * q[0] + y[k] * q[1]); };
  // Achse (erster → letzter Umriss) und Richtung u der Führungskurve (in ihrer Ebene, quer zur Achse, zur Kurve hin)
  function railFrame(profiles, plane, railPts) {
    const C = profiles.map((q) => W3p(q.plane, q.c)), c0 = C[0], A = v3.sub(C[C.length - 1], c0), La = v3.len(A);
    if (La < 1e-6) return null;
    const a = v3.mul(A, 1 / La);
    let u = v3.cross(plane.n, a); const ul = v3.len(u); if (ul < 0.2) return null; u = v3.mul(u, 1 / ul);
    if (railPts && railPts.length) { const m = railPts[Math.floor(railPts.length / 2)]; if (v3.dot(v3.sub(m, c0), u) < 0) u = v3.mul(u, -1); }
    return { C, c0, a, La, u };
  }
  // Umriss gleichmäßig in n Punkte teilen – Start an der Seite zur Kurve hin, gleiche Umlaufrichtung um die Achse
  function resampleLoop(pts, c, u, a, n) {
    let P = pts.slice(); if (P.length > 2 && v3.len(v3.sub(P[0], P[P.length - 1])) < 1e-9) P.pop();
    let area = 0; for (let i = 0; i < P.length; i++) area += v3.dot(v3.cross(v3.sub(P[i], c), v3.sub(P[(i + 1) % P.length], c)), a);
    if (area < 0) P.reverse();
    let i0 = 0, best = -Infinity; P.forEach((q, i) => { const d = v3.dot(v3.sub(q, c), u); if (d > best + 1e-9) { best = d; i0 = i; } });
    P = P.slice(i0).concat(P.slice(0, i0));
    const cum = [0]; for (let i = 1; i <= P.length; i++) cum.push(cum[i - 1] + v3.len(v3.sub(P[i % P.length], P[i - 1])));
    const T = cum[cum.length - 1] || 1, out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const L = (k / n) * T; while (j < cum.length - 1 && cum[j] < L) j++;
      const t = (L - cum[j - 1]) / Math.max(1e-12, cum[j] - cum[j - 1]), A0 = P[j - 1], B0 = P[j % P.length];
      out.push([0, 1, 2].map((q) => A0[q] + (B0[q] - A0[q]) * t));
    }
    return out;
  }
  function railPoints(plane, ch) {
    const pts = []; for (const g of ch.segs) { const sp = SK.segPoints(g); for (let i = pts.length ? 1 : 0; i < sp.length; i++) pts.push(W3p(plane, sp[i])); }
    return pts;
  }
  // rails: [{ plane, ch }] – jede Führungskurve streckt die Zwischenschnitte in ihrer Richtung u (in ihrer Ebene, quer zur Achse).
  // Zwei Kurven in Ebenen quer zueinander (z. B. von der Seite und von oben) wirken unabhängig: Strecken in u₁ ändert nichts in u₂.
  function railSections(profiles, rails, n = 48, K = 6) {
    const R = [];
    for (const r of rails || []) {
      if (!r || !r.ch) continue;
      const rp = railPoints(r.plane, r.ch), F = railFrame(profiles, r.plane, rp); if (!F) continue;
      if (R.some((x) => Math.abs(v3.dot(x.F.u, F.u)) > 0.9)) continue;   // dieselbe Richtung zweimal: nur die erste zählt
      R.push({ rp, F });
    }
    if (!R.length) return null;
    const { C, c0, a, La } = R[0].F;
    const loops = profiles.map((q, i) => resampleLoop(q.poly.map((r) => W3p(q.plane, r)), C[i], R[0].F.u, a, n));
    const sOf = (pt) => v3.dot(v3.sub(pt, c0), a) / La;
    for (const r of R) {
      const u = r.F.u;
      // Kurve als Breite über der Achse: e(s) = Abstand von der Achse in Richtung u
      const rs = r.rp.map((q) => [sOf(q), v3.dot(v3.sub(q, c0), u)]).sort((x, y) => x[0] - y[0]);
      const eAt = (s) => { if (s < rs[0][0] - 1e-6 || s > rs[rs.length - 1][0] + 1e-6) return null; let i = 1; while (i < rs.length - 1 && rs[i][0] < s) i++; const A0 = rs[i - 1], B0 = rs[i], t = (s - A0[0]) / Math.max(1e-12, B0[0] - A0[0]); return A0[1] + (B0[1] - A0[1]) * Math.max(0, Math.min(1, t)); };
      const ext = (L, c) => Math.max(...L.map((q) => v3.dot(v3.sub(q, c), u)));
      r.ratio = (L, c, s) => { const e = eAt(s); if (e == null) return 1; const x = ext(L, c); return x > 1e-6 ? (e - v3.dot(v3.sub(c, c0), u)) / x : 1; };
      r.g = loops.map((L, i) => r.ratio(L, C[i], sOf(C[i])));
    }
    const out = [];
    for (let i = 0; i < loops.length - 1; i++) {
      for (let k = 0; k < K; k++) {
        const t = k / K;
        if (k === 0) { out.push(loops[i]); continue; }
        const c = v3.add(C[i], v3.mul(v3.sub(C[i + 1], C[i]), t));
        let L = loops[i].map((q, m) => v3.add(q, v3.mul(v3.sub(loops[i + 1][m], q), t)));
        for (const r of R) {
          const u = r.F.u, f = Math.max(0.05, Math.min(20, r.ratio(L, c, sOf(c)) / (r.g[i] + (r.g[i + 1] - r.g[i]) * t)));
          L = L.map((q) => { const d = v3.dot(v3.sub(q, c), u); return v3.add(q, v3.mul(u, d * (f - 1))); });
        }
        out.push(L);
      }
    }
    out.push(loops[loops.length - 1]);
    return out;
  }
  // Vorgezeichnete Führungskurve: durch die äußerste Stelle jedes Umrisses in Richtung u (dann bleibt der Übergang zunächst gleich)
  function railStart(it, V, plane) {
    const lp = loftParams({ p: { ...it.p, rail: null, rail2: null, path: null, tip: 0 } }, V);
    const F = railFrame(lp.profiles, plane, null); if (!F) return null;
    return lp.profiles.map((q, i) => { const P3 = q.poly.map((r) => W3p(q.plane, r)), c = F.C[i]; const e = Math.max(...P3.map((x) => v3.dot(v3.sub(x, c), F.u))); return v3.add(c, v3.mul(F.u, e)); });
  }
  // Wie schräg trifft die Mittellinie die Umrisse? Winkel (Grad) zwischen Linie und Umriss-Normale je Umriss
  function loftPathAngles(it, V) {
    const lp = loftParams(it, V); if (!lp.path) return [];
    const pl = lp.path.plane, n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    const W = (q, o) => [0, 1, 2].map((k) => (o ? o[k] : 0) + x[k] * q[0] + y[k] * q[1]);
    const pts = []; for (const g of lp.path.segs) { const sp = SK.segPoints(g); for (let i = pts.length ? 1 : 0; i < sp.length; i++) pts.push(W(sp[i], pl.o)); }
    if (pts.length < 2) return [];
    return lp.profiles.map((q) => {
      const qn = q.plane.n, qx = q.plane.x, qy = [qn[1] * qx[2] - qn[2] * qx[1], qn[2] * qx[0] - qn[0] * qx[2], qn[0] * qx[1] - qn[1] * qx[0]];
      const c = [0, 1, 2].map((k) => q.plane.o[k] + qx[k] * q.c[0] + qy[k] * q.c[1]);
      let bi = 0, bd = Infinity; pts.forEach((P, i) => { const d = Math.hypot(P[0] - c[0], P[1] - c[1], P[2] - c[2]); if (d < bd) { bd = d; bi = i; } });
      const A = pts[Math.max(0, bi - 1)], B = pts[Math.min(pts.length - 1, bi + 1)], t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...t) || 1;
      const cs = Math.abs((t[0] * qn[0] + t[1] * qn[1] + t[2] * qn[2]) / L);
      return Math.round((Math.acos(Math.min(1, cs)) * 180) / Math.PI);
    });
  }
  // Glatte Kurve durch Punkte im Raum: je Abschnitt ein kubisches Bézier-Stück (wie die Skizzen-Spline, nur in 3D)
  function bez3(pts) {
    const n = pts.length; if (n < 3) return [];
    const P = (i) => (i < 0 ? pts[0].map((v, k) => 2 * v - pts[1][k]) : i > n - 1 ? pts[n - 1].map((v, k) => 2 * v - pts[n - 2][k]) : pts[i]);
    const dist = (a, b) => Math.max(1e-9, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t1 = dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3), dt = t2 - t1;
      const m1 = [0, 1, 2].map((k) => ((p1[k] - p0[k]) / t1 - (p2[k] - p0[k]) / t2 + (p2[k] - p1[k]) / dt) * dt);
      const m2 = [0, 1, 2].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
      out.push({ a: p1, c1: [0, 1, 2].map((k) => p1[k] + m1[k] / 3), c2: [0, 1, 2].map((k) => p2[k] - m2[k] / 3), b: p2 });
    }
    return out;
  }
  // Pfad im Raum als 3D-Skizze: rules[i] gilt für das Stück von Punkt i zu Punkt i+1 –
  // ax 'x' | 'y' | 'z' = genau entlang dieser Achse, len = Länge (Zahl oder Formel). Die Punkte dahinter wandern mit
  // (jedes Stück behält seine Richtung aus den eingetragenen Punkten).
  const AXI = { x: 0, y: 1, z: 2 };
  function path3dPoints(path3d, V) {
    const raw = (path3d && path3d.pts ? path3d.pts : []).map((q) => [0, 1, 2].map((k) => num(q[k], V, 0)));
    const R = (path3d && path3d.rules) || [];
    if (raw.length < 2 || !R.some(Boolean)) return raw;
    const out = [raw[0].slice()];
    for (let i = 0; i + 1 < raw.length; i++) {
      const d0 = [0, 1, 2].map((k) => raw[i + 1][k] - raw[i][k]);
      let d = d0.slice();
      const r = R[i];
      if (r) {
        const ai = AXI[r.ax], l0 = Math.hypot(d0[0], d0[1], d0[2]);
        if (ai != null) { const v = d[ai]; d = [0, 0, 0]; d[ai] = Math.abs(v) > 1e-9 ? v : l0; }   // steht das Stück quer zur Achse: so lang wie vorher in Achsrichtung
        else if ((r.ax === 'perp' || r.ax === 'par') && i > 0) {
          // rechtwinklig oder parallel zum vorigen Stück (so, wie es mit seinen Regeln liegt)
          const u = [0, 1, 2].map((k) => out[i][k] - out[i - 1][k]), lu = Math.hypot(u[0], u[1], u[2]);
          if (lu > 1e-9) {
            const un = u.map((v) => v / lu), dot = d[0] * un[0] + d[1] * un[1] + d[2] * un[2];
            d = r.ax === 'par' ? un.map((v) => v * (Math.abs(dot) > 1e-9 ? dot : l0)) : d.map((v, k) => v - un[k] * dot);
            if (r.ax === 'perp' && Math.hypot(d[0], d[1], d[2]) < 1e-9) { const c = Math.abs(un[2]) < 0.9 ? [un[1], -un[0], 0] : [0, un[2], -un[1]], lc = Math.hypot(...c); d = c.map((v) => (v / lc) * l0); }
          }
        }
        const L = r.len != null && r.len !== '' ? num(r.len, V, NaN) : NaN;
        if (isFinite(L) && L > 0) {
          const l = Math.hypot(d[0], d[1], d[2]);
          if (l > 1e-9) d = d.map((v) => (v / l) * L); else if (ai != null) d[ai] = L; else { const l0 = Math.hypot(...d0); if (l0 > 1e-9) d = d0.map((v) => (v / l0) * L); }
        }
        if (Math.hypot(d[0], d[1], d[2]) < 1e-6) d = d0;   // Regel geht hier nicht (Stück hätte keine Länge)
      }
      out.push([0, 1, 2].map((k) => out[i][k] + d[k]));
    }
    return out;
  }
  // Zahlen-Punkte auf ihre Lage mit Regeln setzen (Formeln bleiben) – danach bleibt beim Ändern jeder andere Punkt, wo er ist
  function path3dBake(pp, V) { const r = path3dPoints(pp, V); pp.pts = pp.pts.map((q, i) => q.map((v, k) => (typeof v === 'number' ? Math.round(r[i][k] * 1e4) / 1e4 : v))); }
  // Regel für Stück i ändern (patch: { ax, len }; null oder 0 = weg)
  function path3dSetRule(pp, i, patch, V) {
    path3dBake(pp, V);
    const R = (pp.rules || []).slice(); while (R.length < pp.pts.length - 1) R.push(null);
    const r = { ...(R[i] || {}), ...patch }; for (const k of Object.keys(r)) if (r[k] == null || r[k] === '' || r[k] === 0) delete r[k];
    R[i] = Object.keys(r).length ? r : null;
    if (R.some(Boolean)) pp.rules = R; else delete pp.rules;
  }
  // ---------- 3D-Skizze (SK-51): Linien und Bögen frei im Raum ----------
  function sketch3dArcInfo(a, m, b) {
    if (!a || !m || !b) return null;
    const u = [m[0] - a[0], m[1] - a[1], m[2] - a[2]];
    const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    const ul = Math.hypot(u[0], u[1], u[2]);
    const vl = Math.hypot(v[0], v[1], v[2]);
    if (nl < 1e-8 || ul < 1e-8 || vl < 1e-8) return null;
    const ex = [u[0] / ul, u[1] / ul, u[2] / ul];
    const ez = [n[0] / nl, n[1] / nl, n[2] / nl];
    const ey = [ez[1] * ex[2] - ez[2] * ex[1], ez[2] * ex[0] - ez[0] * ex[2], ez[0] * ex[1] - ez[1] * ex[0]];
    const mx = ul;
    const bx = v[0] * ex[0] + v[1] * ex[1] + v[2] * ex[2];
    const by = v[0] * ey[0] + v[1] * ey[1] + v[2] * ey[2];
    if (Math.abs(by) < 1e-8) return null;
    const cx = mx / 2;
    const cy = (bx * bx + by * by - mx * bx) / (2 * by);
    const r = Math.hypot(cx, cy);
    if (!isFinite(r) || r < 1e-6) return null;
    const normAng = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const a0 = Math.atan2(-cy, -cx);
    const am = Math.atan2(-cy, mx - cx);
    const a1 = Math.atan2(by - cy, bx - cx);
    const d1 = normAng(am - a0), d2 = normAng(a1 - a0);
    const sweep = d1 <= d2 ? d2 : d2 - 2 * Math.PI;
    const c = [0, 1, 2].map((k) => a[k] + ex[k] * cx + ey[k] * cy);
    const ptAt = (ang) => {
      const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
      return [0, 1, 2].map((k) => a[k] + ex[k] * px + ey[k] * py);
    };
    const tanAt = (ang) => {
      const sgn = sweep >= 0 ? 1 : -1;
      const tx = -Math.sin(ang) * sgn, ty = Math.cos(ang) * sgn;
      return [0, 1, 2].map((k) => ex[k] * tx + ey[k] * ty);
    };
    const t0 = tanAt(a0), t1 = tanAt(a0 + sweep);
    const mid3d = ptAt(a0 + sweep / 2);
    const length = Math.abs(sweep) * r;
    const sample = (steps = 32) => {
      const out = [];
      for (let i = 0; i <= steps; i++) out.push(ptAt(a0 + sweep * (i / steps)));
      return out;
    };
    return { c, r, n: ez, ex, ey, a0, sweep, length, t0, t1, mid3d, ptAt, sample };
  }
  function sketch3dEntLen(e) {
    if (!e || !e.a || !e.b) return 0;
    if (e.type === 'arc' && e.m) {
      const ai = sketch3dArcInfo(e.a, e.m, e.b);
      if (ai) return ai.length;
    }
    return Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]);
  }
  function sketch3dResolve(sk3, V = {}) {
    const rawEnts = (sk3 && Array.isArray(sk3.ents)) ? sk3.ents : [];
    const rawDims = (sk3 && Array.isArray(sk3.dims)) ? sk3.dims : [];
    const pt3 = (q) => Array.isArray(q) ? [0, 1, 2].map((k) => num(q[k], V, 0)) : null;
    const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const ents = rawEnts.map((e) => ({
      ...e,
      a: pt3(e.a) || [0, 0, 0],
      b: pt3(e.b) || [0, 0, 0],
      ...(e.m ? { m: pt3(e.m) } : {}),
    }));
    const dims = rawDims.map((d) => ({ ...d }));
    const byId = new Map(ents.map((e, idx) => [e.id, idx]));
    for (const dm of dims) {
      if (!dm || dm.k !== 'len') continue;
      const idx = byId.get(dm.e);
      if (idx == null) continue;
      const e = ents[idx];
      const targetL = num(dm.v, V, NaN);
      if (!isFinite(targetL) || targetL <= 1e-6) continue;
      const curL = sketch3dEntLen(e);
      if (curL <= 1e-6) continue;
      const a0 = e.a.slice();
      const bOld = e.b.slice();
      const s = targetL / curL;
      if (e.type === 'arc' && e.m) {
        e.m = [0, 1, 2].map((k) => a0[k] + (e.m[k] - a0[k]) * s);
      }
      e.b = [0, 1, 2].map((k) => a0[k] + (bOld[k] - a0[k]) * s);
      const db = [0, 1, 2].map((k) => e.b[k] - bOld[k]);
      if (Math.hypot(db[0], db[1], db[2]) > 1e-9) {
        const visited = new Set([idx]);
        const queue = [bOld];
        while (queue.length) {
          const q = queue.shift();
          for (let j = 0; j < ents.length; j++) {
            if (visited.has(j)) continue;
            const ej = ents[j];
            const hitA = d3(ej.a, q) < 1e-3;
            const hitB = d3(ej.b, q) < 1e-3;
            if (!hitA && !hitB) continue;
            visited.add(j);
            const oa = ej.a.slice(), ob = ej.b.slice();
            if (d3(oa, a0) >= 1e-3) { ej.a = [0, 1, 2].map((k) => oa[k] + db[k]); queue.push(oa); }
            if (ej.m && d3(ej.m, a0) >= 1e-3) ej.m = [0, 1, 2].map((k) => ej.m[k] + db[k]);
            if (d3(ob, a0) >= 1e-3) { ej.b = [0, 1, 2].map((k) => ob[k] + db[k]); queue.push(ob); }
          }
        }
      }
    }
    let totalLength = 0;
    for (const e of ents) {
      e.length = sketch3dEntLen(e);
      if (!e.con) totalLength += e.length;
    }
    return { ents, dims, totalLength };
  }
  function sketch3dChains(sk3, V = {}) {
    const res = sketch3dResolve(sk3, V);
    const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const pool = res.ents.filter((e) => !e.con && sketch3dEntLen(e) > 1e-6).map((e) => (
      e.type === 'arc' && e.m
        ? { t: 'arc', a: e.a.slice(), m: e.m.slice(), b: e.b.slice(), len: e.length }
        : { t: 'line', a: e.a.slice(), b: e.b.slice(), len: e.length }
    ));
    if (!pool.length) return [];
    const revSeg = (s) => (s.t === 'arc' ? { t: 'arc', a: s.b.slice(), m: s.m.slice(), b: s.a.slice(), len: s.len } : { t: 'line', a: s.b.slice(), b: s.a.slice(), len: s.len });
    const chains = [];
    const used = new Array(pool.length).fill(false);
    const tol = 1e-3;
    for (let startIdx = 0; startIdx < pool.length; startIdx++) {
      if (used[startIdx]) continue;
      used[startIdx] = true;
      const segs = [pool[startIdx]];
      let progressed = true;
      while (progressed) {
        progressed = false;
        const tail = segs[segs.length - 1].b;
        for (let j = 0; j < pool.length; j++) {
          if (used[j]) continue;
          if (d3(pool[j].a, tail) < tol) { used[j] = true; segs.push(pool[j]); progressed = true; break; }
          if (d3(pool[j].b, tail) < tol) { used[j] = true; segs.push(revSeg(pool[j])); progressed = true; break; }
        }
        if (progressed) continue;
        const head = segs[0].a;
        for (let j = 0; j < pool.length; j++) {
          if (used[j]) continue;
          if (d3(pool[j].b, head) < tol) { used[j] = true; segs.unshift(pool[j]); progressed = true; break; }
          if (d3(pool[j].a, head) < tol) { used[j] = true; segs.unshift(revSeg(pool[j])); progressed = true; break; }
        }
      }
      const p0 = segs[0].a;
      const pEnd = segs[segs.length - 1].b;
      const closed = segs.length > 1 && d3(p0, pEnd) < tol;
      let t0;
      const s0 = segs[0];
      if (s0.t === 'arc' && s0.m) {
        const ai = sketch3dArcInfo(s0.a, s0.m, s0.b);
        t0 = ai ? ai.t0 : null;
      }
      if (!t0) {
        const dx = s0.b[0] - s0.a[0], dy = s0.b[1] - s0.a[1], dz = s0.b[2] - s0.a[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        t0 = [dx / l, dy / l, dz / l];
      }
      const length = segs.reduce((sum, s) => sum + (s.len || 0), 0);
      chains.push({ segs, closed, length, p0, t0 });
    }
    chains.sort((x, y) => y.length - x.length);
    return chains;
  }
  // Entlang Pfad (Sweep): längster offener Zug der Skizze, Querschnitt Kreis oder Rechteck, optional hohl, optional Verdrehung
  function sweepParams(it, V) {
    const p = it.p || {};
    const twist = num(p.twist, V, 0);
    if (p.wrapId) {
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      return { wrapId: p.wrapId, prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 2), w: num(p.w, V, 3), h: num(p.h, V, 2), wall: num(p.wall, V, 0), twist };
    }
    if (p.sketch3dId) {
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      const base = { prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0), twist };
      const doc = curDoc || (typeof App !== 'undefined' ? App.doc : null);
      const act = doc ? activeItems(doc) : [];
      const skItem = act.find((x) => x.id === p.sketch3dId);
      if (!skItem || skItem.kind !== 'sketch3d') {
        return { ...base, sketch3dId: p.sketch3dId, sketch3dMissing: 'Entlang Pfad: Die 3D-Skizze fehlt, ist unterdrückt oder liegt hinter dem Marker.' };
      }
      const chains = sketch3dChains(skItem.p && skItem.p.sketch3d, V);
      if (!chains.length || !chains[0].segs.length) {
        return { ...base, sketch3dId: p.sketch3dId, sketch3dMissing: 'Entlang Pfad: Die 3D-Skizze enthält noch keinen Pfad (Linie oder Bogen).' };
      }
      const ch = chains[0];
      const rel = localMatrix(it, new THREE.Matrix4()).invert().multiply(localMatrix(skItem, new THREE.Matrix4()));
      const tp = (q) => new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(rel).toArray();
      const td = (q) => new THREE.Vector3(q[0], q[1], q[2]).transformDirection(rel).toArray();
      const segs3d = ch.segs.map((s) => s.t === 'arc'
        ? { t: 'arc', a: tp(s.a), m: tp(s.m), b: tp(s.b) }
        : { t: 'line', a: tp(s.a), b: tp(s.b) });
      return { ...base, sketch3dId: p.sketch3dId, segs3d, p0: tp(ch.p0), t0: td(ch.t0) };
    }
    if (p.path3d && Array.isArray(p.path3d.pts)) {
      // Pfad im Raum statt Skizze
      const pts = path3dPoints(p.path3d, V);
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      const smooth = p.path3d.smooth !== false;
      return { path3d: { pts, smooth, segs: smooth ? bez3(pts) : [] }, prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0), twist };
    }
    const ch = SK.chains(p.sketch ? Solver.cached(p.sketch, V).ents : [])[0];
    let prof = null;
    if (p.shape === 'sketch' && p.prof) {
      const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
      if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
    }
    const out = { prof, plane: p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, segs: ch ? ch.segs : [], shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0), twist };
    if (ch) {
      const s = ch.segs[0];
      let t;
      if (s.t === 'line') t = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      else if (s.t === 'bez') t = [s.c1[0] - s.a[0], s.c1[1] - s.a[1]];
      else { const ai = SK.arcInfo(s.a, s.m, s.b); const r = [s.a[0] - ai.c[0], s.a[1] - ai.c[1]]; t = ai.sweep > 0 ? [-r[1], r[0]] : [r[1], -r[0]]; }
      const L = Math.hypot(t[0], t[1]) || 1; out.t0 = [t[0] / L, t[1] / L];
    }
    return out;
  }
  // Feder / Spirale: gemeinsame Kennwerte für Kern, Panel, Hüllbox und Schritt-Erklärung
  function helixMetrics(p = {}, V = {}) {
    const form = p.form === 'cone' || p.form === 'spiral' ? p.form : 'cyl';
    const by = p.by === 'heightTurns' || p.by === 'heightPitch' ? p.by : 'pitchTurns';
    const dir = p.dir === 'left' ? 'left' : 'right';
    const startAngle = num(p.startAngle, V, 0);
    const d = Math.max(0.2, num(p.d, V, 20));
    const r1 = form === 'cyl' ? d / 2 : Math.max(0.1, num(p.r1, V, form === 'spiral' ? 5 : 10));
    const r2 = form === 'cyl' ? d / 2 : Math.max(0.1, num(p.r2, V, form === 'spiral' ? 25 : 5));
    let turns, pitch, height;
    if (form === 'spiral') {
      turns = Math.max(0.1, num(p.turns, V, 3));
      pitch = 0;
      height = 0;
    } else if (by === 'heightTurns') {
      turns = Math.max(0.1, num(p.turns, V, 5));
      height = Math.max(0.1, num(p.height, V, 25));
      pitch = height / turns;
    } else if (by === 'heightPitch') {
      height = Math.max(0.1, num(p.height, V, 25));
      pitch = Math.max(0.05, num(p.pitch, V, 5));
      turns = height / pitch;
    } else {
      turns = Math.max(0.1, num(p.turns, V, 5));
      pitch = Math.max(0.05, num(p.pitch, V, 5));
      height = turns * pitch;
    }
    const shape = p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && p.prof ? 'sketch' : 'circle';
    const wireD = Math.max(0.1, num(p.wireD, V, 2));
    const profW = Math.max(0.1, num(p.profW, V, 2));
    const profH = Math.max(0.1, num(p.profH, V, 2));
    const wall = Math.max(0, num(p.wall, V, 0));
    let radHalf = wireD / 2, axHalf = wireD / 2;
    if (shape === 'rect') { radHalf = profW / 2; axHalf = profH / 2; }
    else if (shape === 'sketch' && p.prof) {
      const ents = Solver.cached(p.prof, V).ents;
      const b = typeof SK !== 'undefined' ? SK.bounds(ents) : null;
      if (b) { radHalf = Math.max(0.1, (b[2] - b[0]) / 2); axHalf = Math.max(0.1, (b[3] - b[1]) / 2); }
    }
    const totalHeight = (form === 'spiral' ? 0 : height) + 2 * axHalf;
    const radialPitch = turns > 0 ? Math.abs(r2 - r1) / turns : 0;
    return { form, by, dir, startAngle, d, r1, r2, turns, pitch, height, shape, wireD, profW, profH, wall, radHalf, axHalf, totalHeight, radialPitch };
  }
  function helixParams(it, V) {
    const p = it.p || {}, m = helixMetrics(p, V);
    let prof = null;
    if (p.shape === 'sketch' && p.prof) {
      const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
      if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
    }
    return { form: m.form, by: m.by, dir: m.dir, startAngle: m.startAngle, d: m.d, r1: m.r1, r2: m.r2, turns: m.turns, pitch: m.pitch, height: m.height, shape: m.shape === 'sketch' && !prof ? 'circle' : m.shape, wireD: m.wireD, profW: m.profW, profH: m.profH, wall: m.wall, prof };
  }
  // Zeitleiste: nur Schritte vor dem Marker zählen, unterdrückte Schritte werden übersprungen
  function activeItems(doc) {
    const end = doc.rollback == null ? doc.items.length : clamp(doc.rollback, 0, doc.items.length);
    return doc.items.slice(0, end).filter((it) => !it.suppressed);
  }
  function isActive(doc, id) { const top = topOf(doc, id); if (!top) return false; return activeItems(doc).includes(top); }
  function kernelScene(doc, extra = [], peek = null) {
    // Lagen mit Formeln (z. B. x = Achsabstand/2) mit den Maßen DIESES Projektstands auflösen – wichtig für Versionen und Varianten
    if (doc && doc.fonts && doc.fonts.length && typeof SK !== 'undefined' && SK.ensureFonts) SK.ensureFonts(doc.fonts);
    const { v } = vars(doc); const prev = curV, prevDoc = curDoc, prevVisited = visitedDocs;
    curV = v; curDoc = doc;
    visitedDocs = new Set(doc && doc.id ? [doc.id] : []);
    // peek = Vorschau der Zeitleiste: nur die ersten k Schritte rechnen, ohne den Marker zu verschieben
    let act = activeItems(doc); if (peek != null) { const keep = new Set(doc.items.slice(0, Math.max(0, peek))); act = act.filter((it) => keep.has(it)); }
    try {
      const out = { items: [...act, ...extra].map((it) => kernelItem(it, v)) };
      if (doc && Array.isArray(doc.folders) && doc.folders.length) out.folders = doc.folders.map((f) => ({ id: f.id, name: f.name, ids: (f.ids || []).slice() }));
      return out;
    } finally { curV = prev; curDoc = prevDoc; visitedDocs = prevVisited; }
  }

  // ---------- Größen ----------
  function primitiveBox(kind, p) {
    const n = (k, d) => (typeof p[k] === 'number' ? p[k] : d);
    switch (kind) {
      case 'box': case 'pyramid': case 'wedge': { const w = n('w', 20), d = n('d', 20), h = n('h', 20); return [-w / 2, -d / 2, 0, w / 2, d / 2, h]; }
      case 'cylinder': case 'tube': case 'prism': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
      case 'cone': { const r = Math.max(n('d1', 20), n('d2', 0)) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
      case 'sphere': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, 2 * r]; }
      case 'hemisphere': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, r]; }
      case 'torus': { const r = n('d', 30) / 2; return [-r, -r, 0, r, r, n('t', 6)]; }
      case 'part': {
        const L = String(p.lib || '');
        if (L === 'buyMotor' || L === 'buyCap') { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
        if (L === 'buyProp') { const r = (n('zoll', 5) * 25.4) / 2; return [-r, -r, 0, r, r, n('zoll', 5) * 1.2 + 0.5]; }
        if (L === 'motorFairing') { const r = n('d', 28) / 2 + Math.max(0, n('gap', 0.5)) + n('wall', 1.2); return [-r, -r, -n('at', 5) - n('tail', 30), r, r, n('h', 18)]; }
        if (L === 'stdScrew' || L === 'stdNut' || L === 'stdWasher') {
          const se = typeof screwEntry === 'function' ? screwEntry(p.size) : null;
          if (L === 'stdNut') {
            const sw = (se && se.mutter && se.mutter.schluesselweite_mm) || 5.5, h = (se && se.mutter && se.mutter.hoehe_mm) || 2.4;
            const r = sw / Math.sqrt(3); return [-r, -sw / 2, 0, r, sw / 2, h];
          }
          if (L === 'stdWasher') {
            const w2 = (se && se.scheibe && se.scheibe.aussen_d_mm) || 7.0, wh = (se && se.scheibe && se.scheibe.dicke_mm) || 0.5;
            const r = w2 / 2; return [-r, -r, 0, r, r, wh];
          }
          const len0 = n('length', 10);
          if (p.head === 'hex') {
            const sw = (se && se.sechskantkopf && se.sechskantkopf.schluesselweite_mm) || 5.5, hk = (se && se.sechskantkopf && se.sechskantkopf.kopf_h_mm) || 2.0;
            const rx = sw / Math.sqrt(3), ry = sw / 2; return [-rx, -ry, -len0, rx, ry, hk];
          }
          if (p.head === 'senk') {
            const dk = (se && se.senkkopf && se.senkkopf.kopf_d_mm) || 6.72, ck = (se && se.senkkopf && se.senkkopf.kopf_h_mm) || 1.86;
            const r = dk / 2, len = Math.max(len0, ck + 0.5); return [-r, -r, -len, r, r, 0];
          }
          const hd = (se && se.zylinderkopf && se.zylinderkopf.kopf_d_mm) || 5.5, hk = (se && se.zylinderkopf && se.zylinderkopf.kopf_h_mm) || 3.0;
          const r = hd / 2; return [-r, -r, -len0, r, r, hk];
        }
        if (L === 'stdPin') { const pe = typeof pinEntry === 'function' ? pinEntry(p.size ?? p.d) : null; const r = (pe ? pe.d_mm : 6) / 2, len = n('length', 20); return [-r, -r, 0, r, r, len]; }
        if (L === 'stdKey') { const ke = typeof keyEntry === 'function' ? keyEntry(p.size) : null; const b = ke ? ke.b_mm : 6, h = ke ? ke.h_mm : 6, len = n('length', 20); return [-len / 2, -b / 2, 0, len / 2, b / 2, h]; }
        if (L === 'stdKeyway') { const ke = typeof keyEntry === 'function' ? keyEntry(p.size) : null; const b = ke ? ke.b_mm : 6, dep = ke ? (p.kind === 'hub' ? ke.t2_mm : ke.t1_mm) : 3.5, len = n('length', 20), up = Math.max(0.2, n('extra', 0.5)); return [-len / 2, -b / 2, -dep, len / 2, b / 2, up]; }
        if (L === 'splineShaft') { const se = typeof splineEntry === 'function' && p.profile !== 'custom' ? splineEntry(p.profile) : null; const r = n('D', se ? se.D : 20) / 2, len = n('length', 40); return [-r, -r, 0, r, r, len]; }
        if (L === 'stdBearing') { const be = typeof bearingEntry === 'function' ? bearingEntry(p.size) : null; const r = (be ? be.D_mm : 22) / 2, B = be ? be.B_mm : 7; return [-r, -r, 0, r, r, B]; }
        if (L === 'stdSleeve') { const se = typeof sleeveEntry === 'function' ? sleeveEntry(p.size) : null; const D = se ? (p.flange === 'flange' ? (se.flansch_d_mm || se.D_mm + 4 * se.wand_mm) : se.D_mm) : 10, r = D / 2, len = n('length', 10); return [-r, -r, 0, r, r, len]; }
        if (L === 'buyAntenna') { const r = Math.max(4, p.form === 'stab' ? n('d', 3) : n('kd', 14)) / 2; return [-r, -r, 0, r, r, n('L', 45)]; }
        if (L === 'buyStack') { const s = n('a', 30.5) + 5.5; return [-s / 2, -s / 2, 0, s / 2, s / 2, n('h', 12)]; }
        if (L.startsWith('buy')) { const w = n('w', 20), d = n('d', 20), h = n('h', 10); return [-w / 2, -d / 2, 0, w / 2, d / 2, h]; }
        return null;
      }
    }
    return null;
  }
  function itemLocalBox(it, V = {}) {
    if (!it) return null;
    V = scopeItemVars(V, it);
    const pb = primitiveBox(it.kind, resolveP(it.p, V));
    if (pb) return pb;
    if ((it.kind === 'extrude' || it.kind === 'rib' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'revolve') && it.p && it.p.sketch) {
      const ents = typeof Solver !== 'undefined' ? Solver.cached(it.p.sketch, V).ents : it.p.sketch.ents || [];
      const b = typeof SK !== 'undefined' ? SK.bounds(ents) : null;
      if (b) {
        const pl = it.p.sketch.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
        const x = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize(), n = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize(), y = new THREE.Vector3().crossVectors(n, x), o = new THREE.Vector3(...(pl.o || [0, 0, 0]));
        const dist = num(it.p.dist, V, 10), dir = it.p.dir || 'normal';
        const w0 = it.kind === 'extrude' ? (dir === 'both' ? -dist / 2 : dir === 'two' ? -num(it.p.dist2, V, dist) : dir === 'reverse' ? -dist : 0) : -1;
        const w1 = it.kind === 'extrude' ? (dir === 'both' ? dist / 2 : dir === 'reverse' ? 0 : dist) : 1;
        const box = new THREE.Box3();
        for (const u of [b[0], b[2]]) for (const v of [b[1], b[3]]) for (const w of [w0, w1]) {
          box.expandByPoint(o.clone().addScaledVector(x, u).addScaledVector(y, v).addScaledVector(n, w));
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      }
    }
    if (it.kind === 'sketch3d' && it.p && it.p.sketch3d) {
      const res = sketch3dResolve(it.p.sketch3d, V);
      if (res.ents.length) {
        const box = new THREE.Box3();
        for (const e of res.ents) {
          if (e.a) box.expandByPoint(new THREE.Vector3(...e.a));
          if (e.b) box.expandByPoint(new THREE.Vector3(...e.b));
          if (e.type === 'arc' && e.m) {
            const ai = sketch3dArcInfo(e.a, e.m, e.b);
            if (ai) for (const q of ai.sample(16)) box.expandByPoint(new THREE.Vector3(...q));
            else box.expandByPoint(new THREE.Vector3(...e.m));
          }
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      }
      return null;
    }
    if (it.kind === 'helix') {
      const m = helixMetrics(it.p || {}, V);
      const rmax = Math.max(m.r1, m.r2) + m.radHalf;
      return [-rmax, -rmax, 0, rmax, rmax, m.totalHeight];
    }
    if (it.kind === 'part') {
      const p = resolveP(it.p || {}, V);
      const r = Math.max(1, Number(p.d) || 6) / 2, dep = Math.max(2, Number(p.depth || p.length || p.h) || 10);
      return [-r, -r, -dep / 2, r, r, dep / 2];
    }
    if (it.kind === 'ref') {
      const refId = it.p && it.p.docId;
      const rawRefDoc = refId && (!visitedDocs || !visitedDocs.has(refId)) ? resolveDoc(refId) : null;
      const refDoc = withPartVariant(rawRefDoc, it.p && it.p.variantId);
      if (!refDoc) return null;
      const refV = vars(refDoc).v;
      const prevVisited = visitedDocs;
      visitedDocs = new Set(prevVisited || []);
      visitedDocs.add(refDoc.id);
      const prev = curV; curV = refV;
      try {
        const box = new THREE.Box3();
        for (const c of activeItems(refDoc)) {
          if (c.hidden || c.role === 'hole') continue;
          const cb = itemLocalBox(c, refV); if (!cb) continue;
          const b = new THREE.Box3(new THREE.Vector3(cb[0], cb[1], cb[2]), new THREE.Vector3(cb[3], cb[4], cb[5])).applyMatrix4(localMatrix(c, new THREE.Matrix4()));
          box.union(b);
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      } finally { curV = prev; visitedDocs = prevVisited; }
      return null;
    }
    if (it.kind === 'group' && it.children && it.children.length) {
      const prev = curV; curV = V;
      try {
        const box = new THREE.Box3();
        for (const c of it.children) {
          if (c.hidden) continue;
          const cb = itemLocalBox(c, V); if (!cb) continue;
          const b = new THREE.Box3(new THREE.Vector3(cb[0], cb[1], cb[2]), new THREE.Vector3(cb[3], cb[4], cb[5])).applyMatrix4(localMatrix(c, new THREE.Matrix4()));
          box.union(b);
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      } finally { curV = prev; }
    }
    return null;
  }
  function label(it) { return it.name || (KINDS[it.kind] && KINDS[it.kind].label) || 'Objekt'; }
  function sizeText(it, V) {
    V = scopeItemVars(V || {}, it);
    const p = resolveP(it.p || {}, V || {});
    const f = (x) => Units.fmtLen(x, 1);
    const u = Units.key() !== 'mm' ? ' ' + Units.label() : '';
    switch (it.kind) {
      case 'box': case 'pyramid': case 'wedge': return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}${u}`;
      case 'cylinder': case 'tube': case 'prism': return `Ø ${f(p.d)} × ${f(p.h)}${u}`;
      case 'cone': return `Ø ${f(p.d1)} × ${f(p.h)}${u}`;
      case 'sphere': case 'hemisphere': return `Ø ${f(p.d)}${u}`;
      case 'torus': return `Ø ${f(p.d)}${u}`;
      case 'loft': {
        const n = (it.p && Array.isArray(it.p.sketches)) ? it.p.sketches.length : 0;
        const base = it.p && it.p.closed ? `Ring (${n} Umrisse)` : `${n} Umrisse`;
        const sc = it.p && !it.p.closed && !it.p.path && !it.p.rail && !it.p.rail2 ? it.p.startCond : null;
        const ec = it.p && !it.p.closed && !it.p.path && !it.p.rail && !it.p.rail2 ? it.p.endCond : null;
        const contTxt = (sc === 'curvature' || ec === 'curvature') ? ' · G2' : (sc === 'tangent' || ec === 'tangent') ? ' · G1' : '';
        const opTxt = it.op && it.op.type === 'cut' ? ' · Schnitt' : it.op && it.op.type === 'join' ? ' · Vereinigen' : it.op && it.op.type === 'common' ? ' · Schnittmenge' : '';
        return base + contTxt + opTxt;
      }
      case 'sweep': {
        const shp = p.shape === 'rect' ? `${f(p.w ?? 6)} × ${f(p.h ?? 4)}${u}` : p.shape === 'sketch' ? 'eigene Form' : `Ø ${f(p.d ?? 6)}${u}`;
        const tw = Math.abs(p.twist || 0) > 1e-6 ? ` · ↻ ${fmtAngleU(p.twist)}` : '';
        const opTxt = it.op && it.op.type === 'cut' ? ' · Schnitt' : it.op && it.op.type === 'join' ? ' · Vereinigen' : it.op && it.op.type === 'common' ? ' · Schnittmenge' : (it.role === 'hole' ? ' · Schnitt' : '');
        return shp + tw + opTxt;
      }
      case 'helix': {
        const m = helixMetrics(it.p || {}, V);
        if (m.form === 'spiral') return `Spirale R ${f(m.r1)}→${f(m.r2)}${u} · ${fmt(m.turns, 1)} Wdg`;
        if (m.form === 'cone') return `R ${f(m.r1)}→${f(m.r2)}${u} · ${fmt(m.turns, 1)} Wdg · H ${f(m.height)}${u}`;
        return `Ø ${f(m.d)}${u} · ${fmt(m.turns, 1)} Wdg · P ${f(m.pitch)}${u}`;
      }
      case 'extrude': {
        if (p.extent === 'toNext' || p.extent === 'toFace') {
          const rd = typeof App !== 'undefined' && App.resolvedDist ? App.resolvedDist(it.id) : null;
          const base = p.extent === 'toNext' ? 'bis nächste Fläche' : 'bis Fläche';
          const lenTxt = rd != null ? ` (${f(rd)}${u})` : '';
          return p.thin ? `${base}${lenTxt} · Wand ${f(p.wall || 2)}${u}` : `${base}${lenTxt}`;
        }
        return p.thin ? `${f(p.dist)}${u} hoch · Wand ${f(p.wall || 2)}${u}` : `${f(p.dist)}${u} hoch`;
      }
      case 'revolve': {
        const dir = (it.p && it.p.dir) || 'normal';
        if (dir === 'toFace') return it.p && it.p.toFace && it.p.toFace.name ? `bis „${it.p.toFace.name}“` : 'bis Fläche';
        if (dir === 'both') return `${fmtAngleU(p.angle)} (2×${fmtAngleU((p.angle || 0) / 2)})`;
        if (dir === 'two') return `${fmtAngleU(p.angle)} / ${fmtAngleU(p.angle2 ?? p.angle)}`;
        if (dir === 'reverse') return `−${fmtAngleU(p.angle)}`;
        return fmtAngleU(p.angle);
      }
      case 'transform': {
        const parts = [];
        for (const k of ['dx', 'dy', 'dz']) if (Math.abs(p[k] || 0) > 1e-6) parts.push(`${k[1].toUpperCase()} ${p[k] > 0 ? '+' : ''}${Units.fmtLen(p[k])}`);
        for (const k of ['rx', 'ry', 'rz']) if (Math.abs(p[k] || 0) > 1e-6) parts.push(`↻${k[1].toUpperCase()} ${fmtAngleU(p[k])}`);
        const s = parts.length ? parts.join(' ') : `0 ${Units.label()}`;
        return p.copy ? 'Kopie · ' + s : s;
      }
      case 'rib': {
        const t = f(p.thickness ?? 2);
        const dr = Math.abs(p.draft || 0) > 1e-6 ? ' · ' + fmtAngleU(p.draft) : '';
        return `${t}${u} dick${dr}`;
      }
      case 'vent': return `${Math.max(1, Math.round(p.count ?? 6))}× · ${f(p.slotW ?? 3)}${u}`;
      case 'fins': return `${Math.max(1, Math.round(p.count ?? 6))}× · ${f(p.height ?? 10)}${u} hoch`;
      case 'fillPattern': {
        const kn = p.kind === 'hex' ? 'Waben' : p.kind === 'staggered' ? 'Versetzt' : 'Raster';
        const sym = p.kind === 'hex' ? 'SW' : 'Ø';
        return `${kn} · ${sym} ${f(p.size ?? 5)}${u} · ${f(p.pitch ?? 8)}${u}`;
      }
      case 'web': {
        const t = f(p.thickness ?? 2);
        const dep = (p.depth || 0) > 1e-4 ? ` · ${f(p.depth)}${u}` : '';
        return `${t}${u} dick${dep}`;
      }
      case 'wrap': {
        const info = wrapAngleInfo(it, V);
        const angTxt = info ? ` · ${fmtAngleU(info.deg)}` : '';
        if (p.mode === 'line') return `Linie${angTxt}`;
        const d = f(p.depth ?? 2);
        return `${p.mode === 'deboss' ? '−' : '+'}${d}${u}${angTxt}`;
      }
      case 'sketch3d': {
        const res = sketch3dResolve(it.p && it.p.sketch3d, V);
        const ents = (res.ents || []).filter((e) => !e.con);
        if (!ents.length) return 'leer';
        const nl = ents.filter((e) => e.type === 'line').length;
        const na = ents.filter((e) => e.type === 'arc').length;
        const parts = [];
        if (nl) parts.push(nl === 1 ? '1 Linie' : `${nl} Linien`);
        if (na) parts.push(na === 1 ? '1 Bogen' : `${na} Bögen`);
        return `${parts.join(', ')} · ${f(res.totalLength)}${u}`;
      }
      case 'emboss': return `${f(p.height ?? 1)}${u} · ${(it.p && it.p.mode) === 'deboss' ? 'vertieft' : 'erhaben'}`;
      case 'splitFace': return p.side === 'both' ? 'beide Seiten' : p.side === 'back' ? 'Rückseite' : 'Vorderseite';
      case 'dome': return `${it.p && it.p.flip ? '−' : '+'}${f(p.height ?? 5)}${u}${it.p && it.p.shape === 'spherical' ? ' · Kugelkappe' : ''}`;
      case 'boss': {
        const ribs = Math.max(0, Math.min(6, Math.round(p.ribs ?? 4)));
        return `Ø ${f(p.outerD ?? 8)}/${f(p.holeD ?? 3)}${u} · H ${f(p.height ?? 10)}${u}${ribs > 0 ? ` · ${ribs} Rippen` : ''}`;
      }
      case 'lipGroove': return `H ${f(p.height ?? 2)}${u} · Spiel ${f(p.clearance ?? 0.2)}${u}`;
      case 'undercut': return `DIN 76-${(it.p && it.p.form) === 'B' ? 'B' : 'A'} · Ø ${f(p.grooveD ?? 7.3)}${u} × ${f(p.width ?? 5.2)}${u}`;
      case 'circlipGroove': return `${(it.p && it.p.norm) === 'din472' ? 'DIN 472' : 'DIN 471'} · Ø ${f(p.grooveD ?? 19)}${u} × ${f(p.width ?? 1.3)}${u}`;
      case 'keyway': return `DIN 6885 · ${f(p.width ?? 6)} × ${f(p.length ?? 20)}${u}`;
      case 'splineProfile': return `DIN ISO 14 · ${Math.round(p.teeth ?? 6)}×${f(p.rootD ?? 16)}${u}`;
      case 'knurl': return `${(it.p && it.p.style) === 'straight' ? 'Gerade' : (it.p && it.p.style) === 'angled' ? 'Schräg' : 'Gekreuzt'} · t ${f(p.pitch ?? 1)}${u}`;
      case 'gripPattern': return (it.p && it.p.kind) === 'bumps' ? `Noppen · Ø ${f(p.size ?? 2)}${u}` : `Rillen · ${f(p.pitch ?? 2.5)}${u}`;
      case 'stackHole': {
        const ip = it.p || {};
        const ht = ip.holeType || 'simple';
        const headLbl = ht === 'through' ? (ip.head === 'countersunk' ? ' Senk.' : ip.head === 'counterbore' ? ' Zyl.' : '') : '';
        const szTxt = ht === 'through' ? `${ip.size || 'M4'}${headLbl}` : ht === 'fit' ? `Ø ${f(p.d ?? 6)}${u} H7` : `Ø ${f(p.d ?? 6)}${u}`;
        const depTxt = ip.thru !== false && ht !== 'blind' ? ' · durch' : ` × ${f(p.depth ?? 20)}${u}`;
        const tgtTxt = ip.scope === 'selected' && Array.isArray(ip.targets) && ip.targets.length ? ` · ${ip.targets.length} T.` : '';
        return szTxt + depTxt + tgtTxt;
      }
      case 'asmCut': {
        const ip = it.p || {};
        const depTxt = ip.thru !== false ? 'durch' : `${f(p.dist ?? 20)}${u}`;
        const tgtTxt = ip.scope === 'selected' && Array.isArray(ip.targets) && ip.targets.length ? ` · ${ip.targets.length} T.` : '';
        return depTxt + tgtTxt;
      }
      case 'scale': return it.p && it.p.uniform === false ? `×${fmt(p.sx ?? 1, 2)} / ${fmt(p.sy ?? 1, 2)} / ${fmt(p.sz ?? 1, 2)}` : `×${fmt(p.s ?? 1, 2)}`;
      case 'deform': {
        const dm = (it.p && it.p.mode) || 'bend';
        if (dm === 'taper') return `${T('panel.deform.taper')} ×${fmt(p.factor ?? 0.5, 2)}`;
        if (dm === 'twist') return `${T('panel.deform.twist')} ${fmtAngleU(p.angle ?? 90)}`;
        return `${T('panel.deform.bend')} ${fmtAngleU(p.angle ?? 90)}`;
      }
      case 'thicken': return `${f(p.t ?? 2)}${u} · ${{ out: 'außen', in: 'innen', mid: 'mittig' }[(it.p && it.p.dir) || 'out'] || 'außen'}`;
      case 'mirrorStep': {
        const mp = it.p || {};
        if (mp.plane === 'DATUM') {
          const dm = typeof Datums !== 'undefined' && typeof App !== 'undefined' && App.doc ? Datums.find(mp.datumId, App.doc) : null;
          return dm ? `an „${dm.name}“` : 'Bezugsebene fehlt';
        }
        if (mp.plane === 'FACE') return 'an Fläche';
        const pl = ['XY', 'XZ', 'YZ'].includes(mp.plane) ? mp.plane : 'YZ';
        const off = num(mp.off, V, 0);
        return Math.abs(off) > 1e-6 ? `${pl} (${off > 0 ? '+' : ''}${f(off)}${u})` : `${pl}-Ebene`;
      }
      case 'deleteBody': {
        const mp = it.p || {};
        const tgs = Array.isArray(mp.targets) ? mp.targets.filter(Boolean) : (mp.target ? [mp.target] : []);
        if (!tgs.length) return 'kein Körper';
        const d = typeof App !== 'undefined' ? App.doc : null;
        if (tgs.length === 1) {
          const tf = d ? find(d, tgs[0]) : null;
          return tf ? label(tf.item) : 'fehlt';
        }
        return `${tgs.length} Körper`;
      }
      case 'group': {
        const ft = typeof Features !== 'undefined' && Features.sizeText(it, V);
        if (ft) return ft;
        if (it.partRef) {
          const r = typeof App !== 'undefined' && App.results && App.results.get(it.id);
          const b = r && r.data && r.data.bbox;
          if (b) return `${f(b[3] - b[0])} × ${f(b[4] - b[1])} × ${f(b[5] - b[2])}${u}`;
          return T('asm.partBadge');
        }
        if (it.userPart && Array.isArray(it.userPart.params) && it.userPart.params.length) {
          return it.userPart.params.slice(0, 2).map((q) => `${q.label || q.name} ${f(num(q.expr, V, 0))}${u}`).join(' · ');
        }
        return `${(it.children || []).length} Teile`;
      }
      case 'ref': {
        const rd = resolveDoc(it.p && it.p.docId);
        if (!rd) return T('asm.refMissingShort');
        if (isAssembly(rd)) {
          const n = (rd.items || []).filter((x) => !x.suppressed).length;
          return T('asm.subAsmSub', { n, unit: n === 1 ? T('asm.partOne') : T('asm.partMany') });
        }
        return rd.name && rd.name !== label(it) ? '→ ' + rd.name : T('asm.refShort');
      }
      case 'part': {
        const L = String(p.lib || '');
        if (L === 'buyMotor' || L === 'buyCap') return `Ø ${f(p.d)} × ${f(p.h)}${u}`;
        if (L === 'buyProp') return `${fmtFixed(p.zoll, 1)}"`;
        if (L === 'buyAntenna') return `${f(p.L)}${u} lang`;
        if (L === 'buyStack') return `${f(p.a)} × ${f(p.a)}${u}`;
        if (L.startsWith('buy')) return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}${u}`;
        return p.size || '';
      }
    }
    return '';
  }
  function countItems(doc) { let n = 0; walk(doc.items, () => { n++; }); return n; }
  const TEXTURE_KINDS = ['wood', 'brushed', 'carbon'];
  function normalizeTexture(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      return TEXTURE_KINDS.includes(raw) ? { kind: raw, scale: 1, rot: 0 } : null;
    }
    if (typeof raw !== 'object' || !TEXTURE_KINDS.includes(raw.kind)) return null;
    const sc = Number(raw.scale);
    const rt = Number(raw.rot);
    return {
      kind: raw.kind,
      scale: Number.isFinite(sc) && sc > 0 ? clamp(round(sc, 4), 0.1, 20) : 1,
      rot: Number.isFinite(rt) ? round(rt, 2) : 0,
    };
  }
  function normalizeDecal(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.src !== 'string' || !raw.face || typeof raw.face !== 'object') return null;
    const safeSrc = typeof Store !== 'undefined' && Store.sanitizeImageDataUrl ? Store.sanitizeImageDataUrl(raw.src, { allowSvg: true }) : raw.src;
    if (!safeSrc || !safeSrc.startsWith('data:image/')) return null;
    const asp = Number(raw.aspect), w = Number(raw.w), sc = Number(raw.scale), u = Number(raw.u), v = Number(raw.v), rot = Number(raw.rot), op = Number(raw.opacity);
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid('dc'),
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Aufkleber',
      src: safeSrc,
      aspect: Number.isFinite(asp) && asp > 0.05 && asp < 20 ? round(asp, 4) : 1,
      face: {
        n: Array.isArray(raw.face.n) && raw.face.n.length >= 3 ? raw.face.n.slice(0, 3).map((x) => round(Number(x) || 0, 6)) : null,
        c: Array.isArray(raw.face.c) && raw.face.c.length >= 3 ? raw.face.c.slice(0, 3).map((x) => round(Number(x) || 0, 6)) : [0, 0, 0],
        t: typeof raw.face.t === 'string' ? raw.face.t : 'PLANE',
      },
      u: Number.isFinite(u) ? round(u, 4) : 0,
      v: Number.isFinite(v) ? round(v, 4) : 0,
      w: Number.isFinite(w) && w > 0.1 ? round(w, 4) : 20,
      scale: Number.isFinite(sc) && sc > 0.05 ? clamp(round(sc, 4), 0.05, 50) : 1,
      rot: Number.isFinite(rot) ? round(rot, 2) : 0,
      opacity: Number.isFinite(op) ? clamp(round(op, 3), 0.05, 1) : 1,
      flipX: !!raw.flipX,
    };
  }
  function reId(it) {
    it.id = uid('i');
    if (it.finishes) it.finishes = it.finishes.map((f) => ({ ...f, id: uid('f') }));
    if (Array.isArray(it.decals)) it.decals = it.decals.map((d) => ({ ...d, id: uid('dc') }));
    if (it.children) it.children.forEach(reId);
    return it;
  }
  function migrate(doc) {
    if (!doc || doc.format !== 'masswerk') throw new Error('Das ist keine Tracery-Projektdatei.');
    if (doc.docType !== 'assembly') doc.docType = 'part';
    doc.params = doc.params || []; doc.items = doc.items || [];
    if (!Array.isArray(doc.tables)) doc.tables = [];
    for (const t of doc.tables) { if (!t || typeof t !== 'object') continue; if (!Array.isArray(t.rows)) t.rows = []; }
    doc.settings = Object.assign({ printer: 'std', custom: { x: 220, y: 220, z: 250 }, grid: 1, snap: true, unit: 'mm' }, doc.settings || {});
    const rawBed = doc.settings.printBed && typeof doc.settings.printBed === 'object' ? doc.settings.printBed : {};
    doc.settings.printBed = {
      enabled: !!rawBed.enabled,
      printer: typeof rawBed.printer === 'string' && rawBed.printer ? rawBed.printer : 'custom',
      x: Number(rawBed.x) > 0 ? Number(rawBed.x) : 220,
      y: Number(rawBed.y) > 0 ? Number(rawBed.y) : 220,
      z: Number(rawBed.z) > 0 ? Number(rawBed.z) : 250,
      nozzle: Number(rawBed.nozzle) > 0 ? Number(rawBed.nozzle) : 0.4,
      holeComp: Number.isFinite(Number(rawBed.holeComp)) ? clamp(Math.round(Number(rawBed.holeComp) * 100) / 100, 0, 1) : 0,
      printFit: ['loose', 'slide', 'snug', 'press'].includes(rawBed.printFit) ? rawBed.printFit : '',
    };
    if (!Units.DEFS[doc.settings.unit]) doc.settings.unit = 'mm';
    if (doc.noHistory) { doc.noHistory = true; doc.rollback = null; } else delete doc.noHistory;
    if (doc.rollback != null && !(doc.rollback >= 0 && doc.rollback < doc.items.length)) doc.rollback = null;
    if (!Array.isArray(doc.notes)) doc.notes = [];
    if (doc.variants != null && !Array.isArray(doc.variants)) doc.variants = [];
    if (Array.isArray(doc.variants)) for (const v of doc.variants) {
      if (!v.values || typeof v.values !== 'object') v.values = {};
      if (v.suppressed != null && !Array.isArray(v.suppressed)) v.suppressed = [];
      if (v.material != null && (typeof v.material !== 'string' || !v.material.trim())) delete v.material;
    }
    if (doc.fonts != null && !Array.isArray(doc.fonts)) doc.fonts = [];
    if (doc.pointClouds != null && !Array.isArray(doc.pointClouds)) doc.pointClouds = [];
    if (doc.folders != null && !Array.isArray(doc.folders)) doc.folders = [];
    if (doc.poses != null && !Array.isArray(doc.poses)) doc.poses = [];
    if (Array.isArray(doc.poses)) {
      doc.poses = doc.poses
        .filter((ps) => ps && typeof ps === 'object' && typeof ps.name === 'string' && ps.name.trim())
        .map((ps) => ({
          id: typeof ps.id === 'string' && ps.id ? ps.id : uid('ps'),
          name: ps.name.trim(),
          states: ps.states && typeof ps.states === 'object' && !Array.isArray(ps.states) ? ps.states : {},
        }));
    }
    const VALID_DISPLAY_MODES = new Set(['edges', 'shaded', 'wire', 'hidden', 'illustration']);
    if (doc.displayStates != null && !Array.isArray(doc.displayStates)) doc.displayStates = [];
    if (Array.isArray(doc.displayStates)) {
      doc.displayStates = doc.displayStates
        .filter((ds) => ds && typeof ds === 'object' && typeof ds.name === 'string' && ds.name.trim())
        .map((ds) => {
          const items = {};
          if (ds.items && typeof ds.items === 'object' && !Array.isArray(ds.items)) {
            for (const [k, raw] of Object.entries(ds.items)) {
              if (!k || !raw || typeof raw !== 'object') continue;
              const op = Number(raw.opacity);
              items[k] = {
                hidden: !!raw.hidden,
                opacity: raw.opacity != null && Number.isFinite(op) && op < 1 ? round(clamp(op, 0.05, 1), 3) : null,
                color: typeof raw.color === 'string' && raw.color ? raw.color : null,
                colorSet: !!raw.colorSet,
              };
            }
          }
          return {
            id: typeof ds.id === 'string' && ds.id ? ds.id : uid('ds'),
            name: ds.name.trim(),
            items,
            display: typeof ds.display === 'string' && VALID_DISPLAY_MODES.has(ds.display) ? ds.display : null,
          };
        });
    }
    if (doc.displayState != null) {
      if (!(Array.isArray(doc.displayStates) && doc.displayStates.some((d) => d.id === doc.displayState))) {
        delete doc.displayState;
      }
    }
    if (doc.asmVariants != null && !Array.isArray(doc.asmVariants)) doc.asmVariants = [];
    if (Array.isArray(doc.asmVariants)) {
      doc.asmVariants = doc.asmVariants
        .filter((av) => av && typeof av === 'object' && typeof av.name === 'string' && av.name.trim())
        .map((av) => {
          const values = av.values && typeof av.values === 'object' && !Array.isArray(av.values) ? { ...av.values } : {};
          const suppressed = Array.isArray(av.suppressed) ? [...new Set(av.suppressed.filter((id) => typeof id === 'string' && id))] : [];
          const refs = {};
          if (av.refs && typeof av.refs === 'object' && !Array.isArray(av.refs)) {
            for (const [k, r] of Object.entries(av.refs)) {
              if (!k || !r || typeof r !== 'object' || typeof r.docId !== 'string' || !r.docId) continue;
              refs[k] = {
                docId: r.docId,
                docName: typeof r.docName === 'string' ? r.docName : '',
                ...(r.docType === 'assembly' ? { docType: 'assembly' } : {}),
                ...(typeof r.variantId === 'string' && r.variantId ? { variantId: r.variantId } : {}),
              };
            }
          }
          const itemParams = {};
          if (av.itemParams && typeof av.itemParams === 'object' && !Array.isArray(av.itemParams)) {
            for (const [k, ip] of Object.entries(av.itemParams)) {
              if (!k || !ip || typeof ip !== 'object' || Array.isArray(ip)) continue;
              const cleanIp = {};
              for (const [pk, pv] of Object.entries(ip)) {
                if (typeof pv === 'number' || typeof pv === 'string' || typeof pv === 'boolean') cleanIp[pk] = pv;
              }
              if (Object.keys(cleanIp).length) itemParams[k] = cleanIp;
            }
          }
          return {
            id: typeof av.id === 'string' && av.id ? av.id : uid('av'),
            name: av.name.trim(),
            values,
            suppressed,
            refs,
            itemParams,
            displayStateId: typeof av.displayStateId === 'string' && av.displayStateId ? av.displayStateId : null,
          };
        });
    }
    if (doc.asmVariant != null) {
      if (!(Array.isArray(doc.asmVariants) && doc.asmVariants.some((av) => av.id === doc.asmVariant))) {
        delete doc.asmVariant;
      }
    }
    if (doc.tolChains != null && !Array.isArray(doc.tolChains)) doc.tolChains = [];
    if (Array.isArray(doc.tolChains)) {
      const VALID_TC_KEYS = new Set(['X', 'Y', 'Z', 'face']);
      doc.tolChains = doc.tolChains
        .filter((tc) => tc && typeof tc === 'object' && Array.isArray(tc.items))
        .map((tc) => {
          const dirKey = VALID_TC_KEYS.has(tc.dirKey) ? tc.dirKey : 'X';
          const rawDir = Array.isArray(tc.dir) && tc.dir.length >= 3 ? tc.dir.map((v) => Number(v) || 0) : [1, 0, 0];
          const dl = Math.hypot(rawDir[0], rawDir[1], rawDir[2]);
          const dir = dl > 1e-9 ? [rawDir[0] / dl, rawDir[1] / dl, rawDir[2] / dl] : [1, 0, 0];
          const defTol = Number(tc.defaultTol);
          const items = tc.items
            .filter((it) => it && typeof it === 'object')
            .map((it, idx) => {
              const nom = Number(it.nominal);
              const tpRaw = it.tolPlus != null ? Number(it.tolPlus) : Number(it.tol);
              const tmRaw = it.tolMinus != null ? Number(it.tolMinus) : Number(it.tol);
              const tolPlus = Number.isFinite(tpRaw) && tpRaw >= 0 ? tpRaw : 0.1;
              const tolMinus = Number.isFinite(tmRaw) && tmRaw >= 0 ? tmRaw : 0.1;
              return {
                id: typeof it.id === 'string' && it.id ? it.id : uid('tc'),
                label: typeof it.label === 'string' && it.label.trim() ? it.label.trim() : `Maß ${idx + 1}`,
                sign: it.sign === -1 ? -1 : 1,
                nominal: Number.isFinite(nom) ? nom : 0,
                tolPlus,
                tolMinus,
                itemId: typeof it.itemId === 'string' && it.itemId ? it.itemId : null,
                autoExtent: it.autoExtent !== false && typeof it.itemId === 'string' && !!it.itemId,
              };
            });
          return {
            id: typeof tc.id === 'string' && tc.id ? tc.id : uid('tch'),
            name: typeof tc.name === 'string' && tc.name.trim() ? tc.name.trim() : 'Toleranzkette',
            dirKey,
            dir,
            defaultTol: Number.isFinite(defTol) && defTol >= 0 ? defTol : 0.1,
            items,
          };
        });
    }
    if (doc.motion != null) {
      if (typeof doc.motion !== 'object' || Array.isArray(doc.motion)) {
        delete doc.motion;
      } else {
        const m = doc.motion;
        const dur = Number(m.duration);
        const fps = Number(m.fps);
        const motors = Array.isArray(m.motors) ? m.motors
          .filter((mt) => mt && typeof mt === 'object' && typeof mt.jointId === 'string' && mt.jointId)
          .map((mt) => ({
            id: typeof mt.id === 'string' && mt.id ? mt.id : uid('mot'),
            jointId: mt.jointId,
            dof: typeof mt.dof === 'string' && mt.dof ? mt.dof : 'ang',
            mode: mt.mode === 'profile' ? 'profile' : 'speed',
            speed: Number.isFinite(Number(mt.speed)) ? Number(mt.speed) : 60,
            startVal: Number.isFinite(Number(mt.startVal)) ? Number(mt.startVal) : 0,
            tStart: Number.isFinite(Number(mt.tStart)) ? Math.max(0, Number(mt.tStart)) : 0,
            tEnd: mt.tEnd != null && Number.isFinite(Number(mt.tEnd)) ? Math.max(0, Number(mt.tEnd)) : null,
            interp: mt.interp === 'smooth' ? 'smooth' : 'linear',
            keys: Array.isArray(mt.keys)
              ? mt.keys
                .filter((k) => k && typeof k === 'object' && Number.isFinite(Number(k.t)) && Number.isFinite(Number(k.v)))
                .map((k) => ({ t: Math.max(0, Number(k.t)), v: Number(k.v) }))
                .sort((a, b) => a.t - b.t)
              : [],
            enabled: mt.enabled !== false,
          })) : [];
        const traces = Array.isArray(m.traces) ? m.traces
          .filter((tr) => tr && typeof tr === 'object' && typeof tr.itemId === 'string' && tr.itemId)
          .map((tr) => ({
            id: typeof tr.id === 'string' && tr.id ? tr.id : uid('tr'),
            itemId: tr.itemId,
            name: typeof tr.name === 'string' && tr.name.trim() ? tr.name.trim() : 'Punkt',
            localPt: Array.isArray(tr.localPt) && tr.localPt.length >= 3
              ? [Number(tr.localPt[0]) || 0, Number(tr.localPt[1]) || 0, Number(tr.localPt[2]) || 0]
              : [0, 0, 0],
            color: typeof tr.color === 'string' && tr.color ? tr.color : '#e03131',
            visible: tr.visible !== false,
          })) : [];
        doc.motion = {
          duration: Number.isFinite(dur) && dur > 0 ? clamp(dur, 0.1, 3600) : 4,
          fps: Number.isFinite(fps) ? clamp(Math.round(fps), 10, 120) : 30,
          loop: !!m.loop,
          motors,
          traces,
        };
      }
    }
    if (doc.blocks != null && !Array.isArray(doc.blocks)) doc.blocks = [];
    if (Array.isArray(doc.blocks)) {
      doc.blocks = doc.blocks.filter((b) => b && b.id && Array.isArray(b.ents));
      for (const b of doc.blocks) {
        if (!b.name) b.name = 'Block';
        if (!Array.isArray(b.dims)) b.dims = [];
        if (!Array.isArray(b.cons)) b.cons = [];
      }
    }
    if (doc.asmPatterns != null && !Array.isArray(doc.asmPatterns)) doc.asmPatterns = [];
    if (Array.isArray(doc.asmPatterns)) {
      doc.asmPatterns = doc.asmPatterns
        .filter((pat) => pat && typeof pat === 'object' && typeof pat.sourceId === 'string' && pat.sourceId)
        .map((pat) => {
          const kind = pat.kind === 'circ' || pat.kind === 'mirror' ? pat.kind : 'rect';
          const out = {
            ...pat,
            id: typeof pat.id === 'string' && pat.id ? pat.id : uid('ap'),
            kind,
            sourceId: pat.sourceId,
            copyIds: Array.isArray(pat.copyIds) ? pat.copyIds.filter((id) => typeof id === 'string' && id) : [],
            skip: Array.isArray(pat.skip) ? [...new Set(pat.skip.map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 1))] : [],
          };
          if (!out.skip.length) delete out.skip;
          return out;
        });
    }
    walk(doc.items, (it) => {
      it.t = Object.assign(T0(), it.t || {}); it.p = it.p || {}; it.finishes = it.finishes || [];
      if (it.bodies != null && !Array.isArray(it.bodies)) delete it.bodies;
      if ('texture' in it) { const nt = normalizeTexture(it.texture); if (nt) it.texture = nt; else delete it.texture; }
      if ('decals' in it) { const dl = Array.isArray(it.decals) ? it.decals.map(normalizeDecal).filter(Boolean) : []; if (dl.length) it.decals = dl; else delete it.decals; }
      if (it.p && it.p.sketch && it.p.sketch.bg && typeof it.p.sketch.bg === 'object' && it.p.sketch.bg.src && typeof Store !== 'undefined' && Store.sanitizeImageDataUrl) {
        const cleanBg = Store.sanitizeImageDataUrl(it.p.sketch.bg.src, { allowSvg: true });
        if (cleanBg) it.p.sketch.bg.src = cleanBg;
        else delete it.p.sketch.bg;
      }
      if (!it.role) it.role = 'solid'; if (!it.color) it.color = nextColor();
    });
    if (doc.lightweight) doc.lightweight = true;
    else delete doc.lightweight;
    if (doc.lightCache && typeof doc.lightCache === 'object' && !Array.isArray(doc.lightCache)) {
      const cleanCache = {};
      for (const [k, v] of Object.entries(doc.lightCache)) {
        if (typeof k === 'string' && k && typeof v === 'string' && v) cleanCache[k] = v;
      }
      if (Object.keys(cleanCache).length) doc.lightCache = cleanCache;
      else delete doc.lightCache;
    } else {
      delete doc.lightCache;
    }
    cleanFolders(doc);
    return doc;
  }
  // ---------- Ordner & Reihenfolge im Verlauf (KP-10) ----------
  function folderOf(doc, id) {
    for (const f of (doc && doc.folders) || []) if ((f.ids || []).includes(id)) return f;
    return null;
  }
  function cleanFolders(doc) {
    if (!doc || !Array.isArray(doc.folders)) return;
    const topPos = new Map((doc.items || []).map((x, i) => [x.id, i]));
    const used = new Set();
    for (const f of doc.folders) {
      f.ids = (f.ids || []).filter((id) => topPos.has(id) && !used.has(id) && (used.add(id), true));
      f.ids.sort((a, b) => topPos.get(a) - topPos.get(b));
    }
    doc.folders = doc.folders.filter((f) => f.ids.length > 0);
  }
  function itemWorldBox(doc, it, opts) {
    if (opts && opts.boxOf) { const b = opts.boxOf(it.id); if (b && !b.isEmpty()) return b; }
    let b = null;
    if (typeof App !== 'undefined' && App.results) { const r = App.results.get(it.id); if (r && r.data && r.data.bbox) b = r.data.bbox; }
    if (!b) b = primitiveBox(it.kind, resolveP(it.p || {}, vars(doc).v));
    if (!b) return null;
    return new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])).applyMatrix4(worldMatrix(doc, it.id));
  }
  function boxesTouch(doc, solid, hole, opts, unknownMeansTouch = false) {
    const bs = itemWorldBox(doc, solid, opts), bh = itemWorldBox(doc, hole, opts);
    if (bs && bh) return bs.intersectsBox(bh);
    return unknownMeansTouch;
  }
  function topOrderEdges(doc, opts) {
    const topIds = new Set((doc.items || []).map((x) => x.id));
    const edges = [];
    for (const d of dependencies(doc)) {
      if (topIds.has(d.from) && topIds.has(d.to) && d.from !== d.to) edges.push({ child: d.from, parent: d.to, what: d.what });
    }
    const items = doc.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].role === 'hole') continue;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].role !== 'hole') continue;
        if (boxesTouch(doc, items[i], items[j], opts, true)) edges.push({ child: items[j].id, parent: items[i].id, what: 'Loch in' });
      }
    }
    return edges;
  }
  function orderFailReason(doc, edge, srcSet) {
    const nm = (id) => { const f = find(doc, id); return f ? label(f.item) : 'Schritt'; };
    if (srcSet && srcSet.has(edge.child)) return `„${nm(edge.child)}“ kann nicht vor „${nm(edge.parent)}“ verschoben werden.`;
    return `„${nm(edge.parent)}“ muss vor „${nm(edge.child)}“ bleiben.`;
  }
  function validateTopOrder(doc, orderedIds, opts = {}) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    for (const e of topOrderEdges(doc, opts)) {
      if (!pos.has(e.parent) || !pos.has(e.child)) continue;
      if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, null) };
    }
    return { ok: true };
  }
  function validateMove(doc, srcIds, dstId, mode, opts = {}) {
    const ids = (Array.isArray(srcIds) ? srcIds : [srcIds]).filter(Boolean);
    if (!ids.length) return { ok: false, reason: '' };
    const topIds = new Set((doc.items || []).map((x) => x.id));
    if (mode === 'into-folder') {
      const fld = (doc.folders || []).find((f) => f.id === dstId);
      if (!fld) return { ok: false, reason: '' };
      if (!ids.every((id) => topIds.has(id))) return { ok: false, reason: 'Nur Schritte auf oberster Ebene passen in einen Ordner.' };
      const inFld = new Set(fld.ids || []);
      if (ids.every((id) => inFld.has(id))) return { ok: true };
      const rest = (fld.ids || []).filter((id) => !ids.includes(id));
      if (!rest.length) return { ok: true };
      return validateMove(doc, ids, rest[rest.length - 1], 'after', opts);
    }
    if (ids.includes(dstId)) return { ok: false, reason: '' };
    const srcs = ids.map((id) => find(doc, id)).filter(Boolean);
    const dst = find(doc, dstId);
    if (!srcs.length || !dst) return { ok: false, reason: '' };
    for (const s of srcs) {
      let self = false;
      if (s.item.children) walk(s.item.children, (c) => { if (c.id === dstId) { self = true; return false; } });
      if (self) return { ok: false, reason: 'Ein Schritt lässt sich nicht in sich selbst legen.' };
    }
    const srcSet = new Set(ids);
    const sameParent = srcs.every((s) => s.parent === srcs[0].parent);
    if (mode === 'into') {
      if (dst.item.kind !== 'group' || srcs.length !== 1) return { ok: false, reason: '' };
      const s = srcs[0];
      if ((s.item.op && s.item.op.target) || s.item.kind === 'transform' || s.item.kind === 'rib' || s.item.kind === 'vent' || s.item.kind === 'fins' || s.item.kind === 'fillPattern' || s.item.kind === 'web' || s.item.kind === 'wrap' || s.item.kind === 'emboss' || s.item.kind === 'splitFace' || s.item.kind === 'dome' || s.item.kind === 'deleteBody' || s.item.kind === 'boss' || s.item.kind === 'lipGroove' || s.item.kind === 'undercut' || s.item.kind === 'circlipGroove' || s.item.kind === 'keyway' || s.item.kind === 'splineProfile' || s.item.kind === 'knurl' || s.item.kind === 'gripPattern' || s.item.kind === 'stackHole' || s.item.kind === 'asmCut' || (!s.parent && s.item.kind === 'mirrorStep')) {
        return { ok: false, reason: 'Dieser Schritt muss auf oberster Ebene bleiben.' };
      }
      if (!s.parent && !dst.parent) {
        const gIdx = doc.items.indexOf(dst.item);
        for (const e of topOrderEdges(doc, opts)) {
          if (e.child === s.item.id) {
            const pIdx = doc.items.findIndex((x) => x.id === e.parent);
            if (pIdx > gIdx) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
          }
          if (e.parent === s.item.id) {
            const cIdx = doc.items.findIndex((x) => x.id === e.child);
            if (cIdx < gIdx) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
          }
        }
      }
      return { ok: true };
    }
    // Beide auf oberster Ebene
    if (sameParent && !srcs[0].parent && !dst.parent) {
      const order = (doc.items || []).map((x) => x.id).filter((id) => !srcSet.has(id));
      const di = order.indexOf(dstId);
      if (di < 0) return { ok: false, reason: '' };
      const moving = (doc.items || []).map((x) => x.id).filter((id) => srcSet.has(id));
      order.splice(mode === 'before' ? di : di + 1, 0, ...moving);
      const pos = new Map(order.map((id, i) => [id, i]));
      for (const e of topOrderEdges(doc, opts)) {
        if (!srcSet.has(e.child) && !srcSet.has(e.parent)) continue;
        if (!pos.has(e.parent) || !pos.has(e.child)) continue;
        if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
      }
      return { ok: true };
    }
    // Gleiche Eltern-Gruppe
    if (sameParent && srcs[0].parent && srcs[0].parent === dst.parent) {
      const kids = srcs[0].parent.children || [];
      const edges = [];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].role === 'hole') continue;
        for (let j = i + 1; j < kids.length; j++) {
          if (kids[j].role === 'hole' && boxesTouch(doc, kids[i], kids[j], opts, true)) edges.push({ child: kids[j].id, parent: kids[i].id });
        }
      }
      for (const k of kids) {
        if (k.kind === 'mirrorStep' && k.p && Array.isArray(k.p.features)) {
          for (const fid of k.p.features) edges.push({ child: k.id, parent: fid });
        }
      }
      const order = kids.map((x) => x.id).filter((id) => !srcSet.has(id));
      const di = order.indexOf(dstId);
      if (di < 0) return { ok: false, reason: '' };
      const moving = kids.map((x) => x.id).filter((id) => srcSet.has(id));
      order.splice(mode === 'before' ? di : di + 1, 0, ...moving);
      const pos = new Map(order.map((id, i) => [id, i]));
      for (const e of edges) {
        if (!srcSet.has(e.child) && !srcSet.has(e.parent)) continue;
        if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
      }
      return { ok: true };
    }
    // Aus einer Gruppe auf die oberste Ebene ziehen
    if (sameParent && srcs[0].parent && !dst.parent) {
      const g = topOf(doc, srcs[0].id);
      if (g) {
        const gIdx = doc.items.indexOf(g);
        const dIdx = doc.items.indexOf(dst.item);
        const targetPos = mode === 'before' ? dIdx : dIdx + 1;
        if (targetPos <= gIdx) {
          for (const s of srcs) {
            if (s.item.role !== 'hole') continue;
            const kids = s.parent.children || [];
            const si = kids.indexOf(s.item);
            if (kids.slice(0, si).some((k) => k.role !== 'hole' && boxesTouch(doc, k, s.item, opts, true))) {
              return { ok: false, parentId: g.id, childId: s.item.id, reason: `„${label(s.item)}“ kann nicht vor „${label(g)}“ verschoben werden.` };
            }
          }
        }
      }
    }
    return { ok: true };
  }
  function matchBodies(saved, evalBodies) {
    const n = (evalBodies && evalBodies.length) || 0;
    const out = new Array(n).fill(null);
    if (!n || !Array.isArray(saved) || !saved.length) return out;
    const usedS = new Set(), usedE = new Set();
    const pairs = [];
    for (let si = 0; si < saved.length; si++) {
      const s = saved[si];
      if (!s || !Array.isArray(s.c) || s.c.length < 3) continue;
      for (let ei = 0; ei < n; ei++) {
        const ec = evalBodies[ei].c;
        const d = Math.hypot(s.c[0] - ec[0], s.c[1] - ec[1], s.c[2] - ec[2]);
        if (d < 0.5) pairs.push({ d, si, ei });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const p of pairs) {
      if (usedS.has(p.si) || usedE.has(p.ei)) continue;
      usedS.add(p.si); usedE.add(p.ei); out[p.ei] = saved[p.si];
    }
    for (let si = 0; si < saved.length; si++) {
      if (usedS.has(si)) continue;
      const s = saved[si];
      if (s && typeof s.idx === 'number' && s.idx >= 0 && s.idx < n && !usedE.has(s.idx)) {
        usedS.add(si); usedE.add(s.idx); out[s.idx] = s;
      }
    }
    const rem = [];
    for (let si = 0; si < saved.length; si++) {
      if (usedS.has(si)) continue;
      const s = saved[si];
      if (!s || !Array.isArray(s.c) || s.c.length < 3) continue;
      for (let ei = 0; ei < n; ei++) {
        if (usedE.has(ei)) continue;
        const ec = evalBodies[ei].c;
        rem.push({ d: Math.hypot(s.c[0] - ec[0], s.c[1] - ec[1], s.c[2] - ec[2]), si, ei });
      }
    }
    rem.sort((a, b) => a.d - b.d);
    for (const p of rem) {
      if (usedS.has(p.si) || usedE.has(p.ei)) continue;
      usedS.add(p.si); usedE.add(p.ei); out[p.ei] = saved[p.si];
    }
    return out;
  }
  // Drehkörper-Bezugssystem (Achse, äußerster Radius und Bogen-Mitte in lokalen Koordinaten)
  function revolveFrame(p, V) {
    const sk = p && p.sketch;
    if (!sk) return null;
    const pl = sk.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const norm3 = (a) => { const l = v3.len(a) || 1; return v3.mul(a, 1 / l); };
    const o = pl.o || [0, 0, 0], x = norm3(pl.x || [1, 0, 0]), n = norm3(pl.n || [0, 0, 1]), y = v3.cross(n, x);
    const P = (uv) => [o[0] + x[0] * uv[0] + y[0] * uv[1], o[1] + x[1] * uv[0] + y[1] * uv[1], o[2] + x[2] * uv[0] + y[2] * uv[1]];
    const ents = Solver.cached(sk, V || {}).ents;
    let c, d;
    if (p.axis3d && Array.isArray(p.axis3d.o) && Array.isArray(p.axis3d.d)) {
      c = p.axis3d.o.map(Number); d = norm3(p.axis3d.d.map(Number));
    } else {
      const axEnt = p.axisEnt ? ents.find((x) => x.id === p.axisEnt && x.type === 'line') : null;
      const revEnt = !p.axis ? ents.find((x) => x.type === 'line' && x.revAxis) : null;
      const axLine = axEnt || revEnt;
      const ax = axLine ? { a: axLine.a, b: axLine.b } : (p.axis || { a: [0, 0], b: [0, 1] });
      c = P(ax.a); d = norm3(v3.sub(P(ax.b), c));
    }
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    const pts = [];
    for (const r of chosen) for (const q of (r.outer && r.outer.poly) || []) pts.push(P(q));
    if (!pts.length) { const b = SK.bounds(ents); if (b) for (const q of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) pts.push(P(q)); }
    let rMax = 0, bestU = null, labelPt = null, hSum = 0, hCnt = 0;
    for (const q of pts) {
      const v = v3.sub(q, c), h = v3.dot(v, d), u = v3.sub(v, v3.mul(d, h)), rl = v3.len(u);
      if (rl > 1e-5) { hSum += h; hCnt++; }
      if (rl > rMax) { rMax = rl; bestU = u; labelPt = q; }
    }
    if (rMax < 1e-5 || !bestU) {
      const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u0 = norm3(v3.cross(ref, d));
      return { c, d, u0, w0: v3.cross(d, u0), arcC: c.slice(), rMax: 10, labelPt: v3.add(c, v3.mul(u0, 10)), pts: [] };
    }
    const u0 = norm3(bestU), w0 = v3.cross(d, u0), hAvg = hCnt ? hSum / hCnt : 0;
    return { c, d, u0, w0, arcC: v3.add(c, v3.mul(d, hAvg)), rMax, labelPt, pts };
  }
  function revolveHitAngle(frame, fo, fn, flip) {
    if (!frame || !fo || !fn) return null;
    const norm3 = (a) => { const l = v3.len(a) || 1; return v3.mul(a, 1 / l); };
    const fnn = norm3(fn), dn = flip ? v3.mul(frame.d, -1) : frame.d;
    const pts = frame.pts && frame.pts.length ? frame.pts : [frame.labelPt];
    const sVals = pts.map((P) => v3.dot(v3.sub(P, fo), fnn));
    const sMin = Math.min(...sVals), sMax = Math.max(...sVals);
    if (sMax > 1e-3 && sMin < -1e-3) return null;
    if (Math.max(Math.abs(sMax), Math.abs(sMin)) < 1e-4) return null;
    const nKeep = sMax + sMin >= 0 ? fnn : v3.mul(fnn, -1);
    const normPos = (a) => { const T = Math.PI * 2; let x = ((a % T) + T) % T; if (x < 1e-3) x = T; return x; };
    let maxFirst = 0, any = false;
    for (const P of pts) {
      const v = v3.sub(P, frame.c), h = v3.dot(v, dn), u = v3.sub(v, v3.mul(dn, h));
      if (v3.len(u) < 1e-5) continue;
      const w = v3.cross(dn, u);
      const A = v3.dot(u, nKeep), B = v3.dot(w, nKeep), C = v3.dot(v3.sub(v3.add(frame.c, v3.mul(dn, h)), fo), nKeep), Mab = Math.hypot(A, B);
      if (Mab < 1e-7 || Math.abs(C) > Mab + 1e-4) return null;
      if (Math.abs(A + C) < 1e-4 && B < -1e-6) return null;
      const phi = Math.atan2(B, A), alpha = Math.acos(clamp(-C / Mab, -1, 1));
      const tFirst = Math.min(normPos(phi + alpha), normPos(phi - alpha));
      if (tFirst > maxFirst) maxFirst = tFirst;
      any = true;
    }
    return any ? (maxFirst * 180) / Math.PI : null;
  }
  function revolveAutoFlip(frame, fo, fn, pickPtLocal) {
    if (!frame) return false;
    if (pickPtLocal) {
      const vp = v3.sub(pickPtLocal, frame.c), hp = v3.dot(vp, frame.d), up = v3.sub(vp, v3.mul(frame.d, hp));
      if (v3.len(up) > 1e-4) {
        const phi = Math.atan2(v3.dot(up, frame.w0), v3.dot(up, frame.u0));
        if (Math.abs(phi) > 1e-4) {
          const wantFlip = phi < 0;
          if (revolveHitAngle(frame, fo, fn, wantFlip) != null) return wantFlip;
        }
      }
    }
    const aPos = revolveHitAngle(frame, fo, fn, false), aNeg = revolveHitAngle(frame, fo, fn, true);
    if (aPos != null && aNeg != null) return aNeg < aPos;
    return aPos == null && aNeg != null;
  }
  return { TEXTURE_KINDS, normalizeTexture, normalizeDecal, matchBodies, displayColor, folderOf, cleanFolders, validateMove, validateTopOrder, revolveFrame, revolveHitAngle, revolveAutoFlip, dependencies, remapChildIds, syncLinks, materializeBlockInst, syncSketchBlocks, syncBlocks, setSceneSpan, get sceneSpan() { return sceneSpan; }, OPS, path3dPoints, path3dBake, path3dSetRule, sketch3dArcInfo, sketch3dEntLen, sketch3dResolve, sketch3dChains, railStart, railSections, bez3, progressiveOffset, patternScaleFactor, patternInstances, patternMatrices, instanceMatrices, itemLocalBox, helixMetrics, loftParams, loftPathAngles, pathPatternParams, pathPlaces, parsePatternCSV, pointsPatternParams, tablePatternParams, fillPatternParams, splitParams, wrapAngleInfo, useVars, tnum, tNumeric, newDoc, newAssemblyDoc, docType, isAssembly, isSubAssemblyRef, setDocResolver, resolveDoc, newItem, walk, find, topOf, parentsOf, localMatrix, worldMatrix, parentWorld, setFromMatrix, vars, scopeVars, itemVars, evalInfo, num, isExpr, resolveP, kernelScene, kernelItem, activeItems, isActive, primitiveBox, label, sizeText, countItems, reId, migrate, matArr, T0 };
})();

