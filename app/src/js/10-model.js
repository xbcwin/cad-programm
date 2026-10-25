// ================= Datenmodell =================
const COLORS = [
  { c: '#2f9e91', n: 'Petrol' }, { c: '#3f7fd6', n: 'Blau' }, { c: '#e8833a', n: 'Orange' }, { c: '#e2b53a', n: 'Gelb' },
  { c: '#d6574c', n: 'Rot' }, { c: '#8a6ad1', n: 'Violett' }, { c: '#5b9f55', n: 'Grün' }, { c: '#8b96a1', n: 'Grau' },
  { c: '#eceff2', n: 'Weiß' }, { c: '#3b4149', n: 'Schwarz' },
];
let colorTurn = 0;
function nextColor() { const c = COLORS[colorTurn % 6].c; colorTurn++; return c; }

const P = (k, label, def, opt = {}) => ({ k, label, def, unit: 'mm', min: 0.1, ...opt });
const KINDS = {
  box: { label: 'Quader', icon: 'cube', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  cylinder: { label: 'Zylinder', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' }), P('h', 'Höhe', 20)] },
  tube: { label: 'Rohr', params: [P('d', 'Außen-Ø', 20, { sym: 'Ø' }), P('wall', 'Wandstärke', 2), P('h', 'Höhe', 20)] },
  sphere: { label: 'Kugel', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' })] },
  hemisphere: { label: 'Halbkugel', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' })] },
  cone: { label: 'Kegel', params: [P('d1', 'Ø unten', 20), P('d2', 'Ø oben', 0, { min: 0 }), P('h', 'Höhe', 20)] },
  pyramid: { label: 'Pyramide', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  torus: { label: 'Ring', params: [P('d', 'Außen-Ø', 30), P('t', 'Ringdicke', 6)] },
  prism: { label: 'Vieleck', params: [P('n', 'Ecken', 6, { unit: '', min: 3, max: 64, step: 1, int: true }), P('d', 'Durchmesser', 20), P('h', 'Höhe', 20)] },
  wedge: { label: 'Keil', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  extrude: { label: 'Skizzenkörper', params: [] },
  revolve: { label: 'Drehkörper', params: [] },
  loft: { label: 'Übergang', params: [] },
  sweep: { label: 'Entlang Pfad', params: [] },
  import: { label: 'Importiert', params: [] },
  group: { label: 'Gruppe', params: [] },
  part: { label: 'Bauteil', params: [] },
};
const PRIMITIVE_ORDER = ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'wedge', 'tube', 'torus', 'prism', 'hemisphere'];

const Model = (() => {
  const T0 = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  function newDoc(name = 'Neues Projekt') {
    return {
      format: 'masswerk', version: 1, id: uid('p'), name, created: Date.now(), modified: Date.now(),
      params: [], items: [], notes: [],
      settings: { printer: 'std', custom: { x: 220, y: 220, z: 250 }, grid: 1, snap: true },
      drawing: null,
    };
  }
  function newItem(kind, p = {}, extra = {}) {
    const def = KINDS[kind] || { params: [] };
    const params = {};
    for (const q of def.params) params[q.k] = q.def;
    Object.assign(params, p);
    return { id: uid('i'), kind, name: extra.name || def.label || 'Objekt', role: extra.role || 'solid', p: params, t: T0(), color: extra.color || nextColor(), hidden: false, locked: false, finishes: [], ...(kind === 'group' ? { children: [] } : {}), ...extra.more };
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
    for (const p of chain) m.multiply(localMatrix(p, new THREE.Matrix4()));
    if (f) m.multiply(localMatrix(f.item, new THREE.Matrix4()));
    return m;
  }
  function parentWorld(doc, id) {
    const chain = parentsOf(doc, id);
    const m = new THREE.Matrix4();
    for (const p of chain) m.multiply(localMatrix(p, new THREE.Matrix4()));
    return m;
  }
  function setFromMatrix(it, m) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const r = (a) => { let d = round(a / D2R, 6); if (Math.abs(d) < 1e-6) d = 0; if (Math.abs(Math.abs(d) - 180) < 1e-6) d = 180; return d; };
    it.t = { x: round(pos.x, 6), y: round(pos.y, 6), z: round(pos.z, 6), rx: r(e.x), ry: r(e.y), rz: r(e.z) };
  }

  // ---------- Parameter ----------
  function vars(doc) {
    const v = {}, errors = {};
    for (const p of doc.params || []) {
      try { v[p.name] = Expr.eval(String(p.expr), v); }
      catch (e) { errors[p.id] = e.message; v[p.name] = 0; }
    }
    return { v, errors };
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

  // ---------- Für den CAD-Kern ----------
  function matArr(m) { return Array.from(m.elements); }
  function kernelItem(it, V) {
    const o = { id: it.id, kind: it.kind, role: it.role, hidden: !!it.hidden, m: matArr(localMatrix(it)) };
    if (it.kind === 'group') { let kids = it.children || []; if (it.rollback != null) kids = kids.slice(0, clamp(it.rollback, 0, kids.length)); o.children = kids.filter((c) => !c.suppressed).map((c) => kernelItem(c, V)); if (it.p && it.p.op) o.p = resolveP(it.p, V); }
    else if (it.kind === 'extrude' || it.kind === 'revolve') o.p = sketchParams(it, V);
    else if (it.kind === 'loft') o.p = loftParams(it, V);
    else if (it.kind === 'sweep') o.p = sweepParams(it, V);
    else if (it.kind === 'import') o.p = { fmt: it.p.fmt, data: it.p.data, scale: num(it.p.scale, V, 1) };
    else o.p = resolveP(it.p, V);
    if (it.mir) o.mir = it.mir;
    if (it.finishes && it.finishes.length) o.finishes = it.finishes.filter((f) => !f.off).map((f) => ({ id: f.id, type: f.type, r: num(f.r, V, 1), edges: f.edges, faces: f.faces }));
    return o;
  }
  function sketchParams(it, V) {
    const p = it.p || {};
    const regs = SK.regions(p.sketch ? Solver.cached(p.sketch, V).ents : []);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    const out = { plane: p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })) };
    if (it.kind === 'extrude') { out.dist = num(p.dist, V, 10); out.dir = p.dir || 'normal'; out.extra = num(p.extra, V, 0); }
    else { out.angle = num(p.angle, V, 360); out.axis = p.axis || { a: [0, 0], b: [0, 1] }; }
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
      profiles.push({ plane: sk.plane, outer: L.k, c: [cx, cy] });
    }
    const out = { profiles, ruled: !!p.ruled };
    const tip = num(p.tip, V, 0);
    if (tip > 0 && profiles.length) {
      const last = profiles[profiles.length - 1], pl = last.plane;
      const n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
      const prev = profiles.length > 1 ? profiles[profiles.length - 2].plane.o : null;
      let s = 1; if (prev) { const d = [0, 1, 2].map((k) => pl.o[k] - prev[k]); if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0) s = -1; }
      out.tipPoint = [0, 1, 2].map((k) => pl.o[k] + x[k] * last.c[0] + y[k] * last.c[1] + n[k] * tip * s);
    }
    return out;
  }
  // Entlang Pfad (Sweep): längster offener Zug der Skizze, Querschnitt Kreis oder Rechteck, optional hohl
  function sweepParams(it, V) {
    const p = it.p || {};
    const ch = SK.chains(p.sketch ? Solver.cached(p.sketch, V).ents : [])[0];
    const out = { plane: p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, segs: ch ? ch.segs : [], shape: p.shape === 'rect' ? 'rect' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0) };
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
  // Zeitleiste: nur Schritte vor dem Marker zählen, unterdrückte Schritte werden übersprungen
  function activeItems(doc) {
    const end = doc.rollback == null ? doc.items.length : clamp(doc.rollback, 0, doc.items.length);
    return doc.items.slice(0, end).filter((it) => !it.suppressed);
  }
  function isActive(doc, id) { const top = topOf(doc, id); if (!top) return false; return activeItems(doc).includes(top); }
  function kernelScene(doc, extra = []) {
    // Lagen mit Formeln (z. B. x = Achsabstand/2) mit den Maßen DIESES Projektstands auflösen – wichtig für Versionen und Varianten
    const { v } = vars(doc); const prev = curV; curV = v;
    try { return { items: [...activeItems(doc), ...extra].map((it) => kernelItem(it, v)) }; } finally { curV = prev; }
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
        if (L === 'buyStack') { const s = n('a', 30.5) + 5.5; return [-s / 2, -s / 2, 0, s / 2, s / 2, n('h', 12)]; }
        if (L.startsWith('buy')) { const w = n('w', 20), d = n('d', 20), h = n('h', 10); return [-w / 2, -d / 2, 0, w / 2, d / 2, h]; }
        return null;
      }
    }
    return null;
  }
  function label(it) { return it.name || (KINDS[it.kind] && KINDS[it.kind].label) || 'Objekt'; }
  function sizeText(it, V) {
    const p = resolveP(it.p || {}, V || {});
    const f = (x) => fmt(x, 1);
    switch (it.kind) {
      case 'box': case 'pyramid': case 'wedge': return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}`;
      case 'cylinder': case 'tube': case 'prism': return `Ø ${f(p.d)} × ${f(p.h)}`;
      case 'cone': return `Ø ${f(p.d1)} × ${f(p.h)}`;
      case 'sphere': case 'hemisphere': return `Ø ${f(p.d)}`;
      case 'torus': return `Ø ${f(p.d)}`;
      case 'extrude': return `${f(p.dist)} hoch`;
      case 'revolve': return `${f(p.angle)}°`;
      case 'group': return (typeof Features !== 'undefined' && Features.sizeText(it, V)) || `${(it.children || []).length} Teile`;
      case 'part': {
        const L = String(p.lib || '');
        if (L === 'buyMotor' || L === 'buyCap') return `Ø ${f(p.d)} × ${f(p.h)}`;
        if (L === 'buyProp') return `${f(p.zoll)}"`;
        if (L === 'buyStack') return `${f(p.a)} × ${f(p.a)}`;
        if (L.startsWith('buy')) return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}`;
        return p.size || '';
      }
    }
    return '';
  }
  function countItems(doc) { let n = 0; walk(doc.items, () => { n++; }); return n; }
  function reId(it) {
    it.id = uid('i');
    if (it.finishes) it.finishes = it.finishes.map((f) => ({ ...f, id: uid('f') }));
    if (it.children) it.children.forEach(reId);
    return it;
  }
  function migrate(doc) {
    if (!doc || doc.format !== 'masswerk') throw new Error('Das ist keine Tracery-Projektdatei.');
    doc.params = doc.params || []; doc.items = doc.items || [];
    doc.settings = Object.assign({ printer: 'std', custom: { x: 220, y: 220, z: 250 }, grid: 1, snap: true }, doc.settings || {});
    if (doc.rollback != null && !(doc.rollback >= 0 && doc.rollback < doc.items.length)) doc.rollback = null;
    if (!Array.isArray(doc.notes)) doc.notes = [];
    if (doc.variants != null && !Array.isArray(doc.variants)) doc.variants = [];
    walk(doc.items, (it) => { it.t = Object.assign(T0(), it.t || {}); it.p = it.p || {}; it.finishes = it.finishes || []; if (!it.role) it.role = 'solid'; if (!it.color) it.color = nextColor(); });
    return doc;
  }
  return { useVars, tnum, tNumeric, newDoc, newItem, walk, find, topOf, parentsOf, localMatrix, worldMatrix, parentWorld, setFromMatrix, vars, num, isExpr, resolveP, kernelScene, kernelItem, activeItems, isActive, primitiveBox, label, sizeText, countItems, reId, migrate, matArr, T0 };
})();

