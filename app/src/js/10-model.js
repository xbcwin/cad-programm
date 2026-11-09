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
  // Lage jeder Kopie einer Muster-Gruppe im Gruppen-Koordinatensystem – genau wie der Kern sie baut; die erste ist das Original
  function patternMatrices(g, V) {
    const I = new THREE.Matrix4(), out = [I];
    if (!g.p || g.p.op !== 'pattern') return out;
    const p = g.p.pt === 'path' ? pathPatternParams(g, V) : resolveP(g.p, V), N = (k, d) => num(p[k], V, d);
    const rot = (c, ax, deg) => { const a = new THREE.Vector3(...ax).normalize(); return new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]).multiply(new THREE.Matrix4().makeRotationAxis(a, (deg * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2])); };
    const refl = (nn, o) => { const v = new THREE.Vector3(...nn).normalize(), a = v.x, b = v.y, c = v.z, d = a * o[0] + b * o[1] + c * o[2]; return new THREE.Matrix4().set(1 - 2 * a * a, -2 * a * b, -2 * a * c, 2 * d * a, -2 * a * b, 1 - 2 * b * b, -2 * b * c, 2 * d * b, -2 * a * c, -2 * b * c, 1 - 2 * c * c, 2 * d * c, 0, 0, 0, 1); };
    if (p.pt === 'rect') {
      const nx = clamp(Math.round(N('nx', 1)), 1, 60), ny = clamp(Math.round(N('ny', 1)), 1, 60), dx = N('dx', 10), dy = N('dy', 10);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (i || j) out.push(new THREE.Matrix4().makeTranslation(i * dx, j * dy, 0));
    } else if (p.pt === 'circ') {
      const n = clamp(Math.round(N('n', 4)), 1, 120), ang = N('ang', 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [N('cx', 0), N('cy', 0), N('cz', 0)];
      for (let k = 1; k < n; k++) out.push(rot(c, ax, k * step));
    } else if (p.pt === 'path') {
      for (const q of (p.places || []).slice(1, 200)) {
        const d = (q.d || [0, 0, 0]).map(Number), m = new THREE.Matrix4().makeTranslation(d[0], d[1], d[2]);
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) m.multiply(rot(p.p0, p.n, Number(q.a)));
        out.push(m);
      }
    } else if (p.pt === 'mirror' && p.plane === 'FACE' && Array.isArray(p.mn) && Array.isArray(p.mo)) out.push(refl(p.mn.map(Number), p.mo.map(Number)));
    else if (p.pt === 'mirror') {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ', n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl], off = N('off', 0);
      out.push(refl(n, [n[0] * off, n[1] * off, n[2] * off]));
    }
    return out;
  }
  // Weltlage eines Teils – einmal je Kopie, wenn es in Muster-Gruppen steckt (z. B. ein Motor, viermal im Kreis kopiert)
  function instanceMatrices(doc, id, V = vars(doc).v) {
    const f = find(doc, id); if (!f) return [];
    const chain = parentsOf(doc, id), prev = curV; curV = V;
    try {
      let mats = [new THREE.Matrix4()];
      for (const g of chain) {
        const L = localMatrix(g, new THREE.Matrix4()), P = patternMatrices(g, V), next = [];
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
    if (it.kind === 'group') { let kids = it.children || []; if (it.rollback != null) kids = kids.slice(0, clamp(it.rollback, 0, kids.length)); o.children = kids.filter((c) => !c.suppressed).map((c) => kernelItem(c, V)); if (it.p && it.p.op) o.p = it.p.op === 'pattern' && it.p.pt === 'path' ? pathPatternParams(it, V) : resolveP(it.p, V); }
    else if (it.kind === 'extrude' || it.kind === 'revolve') o.p = sketchParams(it, V);
    else if (it.kind === 'loft') o.p = loftParams(it, V);
    else if (it.kind === 'sweep') o.p = sweepParams(it, V);
    else if (it.kind === 'import') o.p = { fmt: it.p.fmt, data: it.p.data, scale: num(it.p.scale, V, 1) };
    else o.p = resolveP(it.p, V);
    if (it.mir) o.mir = it.mir;
    if (it.finishes && it.finishes.length) o.finishes = it.finishes.filter((f) => !f.off).map((f) => { const x = { id: f.id, type: f.type, r: num(f.r, V, 1), edges: f.edges, faces: f.faces }; if (f.vr) { x.vr = true; x.r2 = num(f.r2, V, x.r); } if (f.cm) { x.cm = f.cm; if (f.cm === 'two') x.r2 = num(f.r2, V, x.r); else x.a = num(f.a, V, 45); } if (f.side) x.side = 1; return x; });
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
  function pathPlaces(ents, n, d) {
    const C = pathCurve(ents); if (!C || C.len < 1e-6) return [];
    const N = clamp(Math.round(n), 1, 200);
    const step = d > 0 ? d : C.closed ? C.len / N : N > 1 ? C.len / (N - 1) : 0;
    const out = [];
    for (let k = 0; k < N; k++) {
      const s = k * step;
      if (k && (C.closed ? s > C.len - 1e-6 : s > C.len + 1e-6)) break;
      out.push(pathAt(C, Math.min(s, C.len)));
    }
    return out;
  }
  function pathPatternParams(it, V) {
    const p = it.p || {}, out = { op: 'pattern', pt: 'path', places: [], n: [0, 0, 1], p0: [0, 0, 0], align: p.align !== false && p.align !== 'nein' };
    if (!p.sketch) return out;
    const L = pathPlaces(Solver.cached(p.sketch, V).ents, num(p.n, V, 5), num(p.d, V, 0)); if (!L.length) return out;
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
  // Übergang (Loft): je Profil die größte geschlossene Fläche, dazu optional eine Spitze hinter dem letzten Profil
  function loftParams(it, V) {
    const p = it.p || {};
    const profiles = [];
    for (const sk of p.sketches || []) {
      const regs = SK.regions(Solver.cached(sk, V).ents).sort((a, b) => b.area - a.area);
      if (!regs.length) continue;
      const L = regs[0].outer; let cx = 0, cy = 0; for (const q of L.poly) { cx += q[0]; cy += q[1]; } cx /= L.poly.length || 1; cy /= L.poly.length || 1;
      profiles.push({ plane: sk.plane, outer: L.k, c: [cx, cy], poly: L.poly });
    }
    const out = { profiles, ruled: !!p.ruled };
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
  // Entlang Pfad (Sweep): längster offener Zug der Skizze, Querschnitt Kreis oder Rechteck, optional hohl
  function sweepParams(it, V) {
    const p = it.p || {};
    if (p.path3d && Array.isArray(p.path3d.pts)) {
      // Pfad im Raum statt Skizze
      const pts = path3dPoints(p.path3d, V);
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      const smooth = p.path3d.smooth !== false;
      return { path3d: { pts, smooth, segs: smooth ? bez3(pts) : [] }, prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0) };
    }
    const ch = SK.chains(p.sketch ? Solver.cached(p.sketch, V).ents : [])[0];
    let prof = null;
    if (p.shape === 'sketch' && p.prof) {
      const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
      if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
    }
    const out = { prof, plane: p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, segs: ch ? ch.segs : [], shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0) };
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
  return { path3dPoints, path3dBake, path3dSetRule, railStart, railSections, bez3, patternMatrices, instanceMatrices, loftParams, loftPathAngles, pathPatternParams, pathPlaces, useVars, tnum, tNumeric, newDoc, newItem, walk, find, topOf, parentsOf, localMatrix, worldMatrix, parentWorld, setFromMatrix, vars, num, isExpr, resolveP, kernelScene, kernelItem, activeItems, isActive, primitiveBox, label, sizeText, countItems, reId, migrate, matArr, T0 };
})();

