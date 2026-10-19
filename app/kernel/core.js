// Tracery CAD-Kern: läuft im Web Worker (oder in Node für Tests).
// createKernel(R, oc) bekommt die replicad-Bibliothek und die OpenCascade-Instanz.

export function createKernel(R, oc) {
  const cache = new Map(); // key -> { shape, gen, bbox }
  const meshCache = new Map(); // resultKey -> mesh payload (plain arrays, reusable)
  let gen = 0;

  // ---------- kleine Helfer ----------
  const EPS = 1e-9;
  function hashStr(str) {
    let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }
  const keyOf = (o) => hashStr(JSON.stringify(o));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vec = (p) => [p.x, p.y, p.z];
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const pos = (v, d) => Math.max(0.01, num(v, d));

  function cacheGet(key) {
    const e = cache.get(key);
    if (e) { e.gen = gen; return e.shape; }
    return null;
  }
  function cachePut(key, shape) { cache.set(key, { shape, gen }); return shape; }

  function gc() {
    // Formen entfernen, die mehrere Durchläufe nicht gebraucht wurden
    for (const [k, e] of cache) {
      if (gen - e.gen > 6) { try { e.shape.delete(); } catch (_) {} cache.delete(k); }
    }
    if (meshCache.size > 400) {
      const drop = meshCache.size - 300; let i = 0;
      for (const k of meshCache.keys()) { if (i++ >= drop) break; meshCache.delete(k); }
    }
  }

  // Matrix im three.js-Format (Spaltenweise, 16 Werte) auf eine Form anwenden
  function isIdentity(m) {
    if (!m) return true;
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (let i = 0; i < 16; i++) if (Math.abs(m[i] - id[i]) > 1e-12) return false;
    return true;
  }
  function applyMatrix(shape, m) {
    if (isIdentity(m)) return shape.clone();
    const trsf = new oc.gp_Trsf();
    trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]);
    const tr = new oc.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
    const res = R.cast(tr.ModifiedShape(shape.wrapped));
    tr.delete(); trsf.delete();
    return res;
  }
  function matMul(a, b) { // a*b, column-major
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
      r[c * 4 + rr] = s;
    }
    return r;
  }
  function matInvRigid(m) { // Inverse einer Starrkörper-Matrix (Rotation + Verschiebung)
    const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    const t = [m[12], m[13], m[14]];
    r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]);
    r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]);
    r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]);
    return r;
  }
  function transformPoint(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  function bboxOf(shape) {
    const bb = shape.boundingBox; const b = bb.bounds; bb.delete();
    return [b[0][0], b[0][1], b[0][2], b[1][0], b[1][1], b[1][2]];
  }
  function bboxTransform(b, m) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const p = transformPoint(m, [i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]]);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    }
    return [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]];
  }
  const bboxHit = (a, b, m = 0.01) => !(a[3] < b[0] - m || b[3] < a[0] - m || a[4] < b[1] - m || b[4] < a[1] - m || a[5] < b[2] - m || b[5] < a[2] - m);

  function fuseAll(shapes, ownInputs = false) {
    if (!shapes.length) return null;
    if (shapes.length === 1) return shapes[0];
    let res = shapes[0];
    for (let i = 1; i < shapes.length; i++) {
      const next = res.fuse(shapes[i]);
      if (res !== shapes[0] || ownInputs) safeDelete(res);
      res = next;
    }
    if (ownInputs) for (let i = 1; i < shapes.length; i++) safeDelete(shapes[i]);
    return res;
  }
  function safeDelete(s) { try { if (s && s.delete) s.delete(); } catch (_) {} }
  function polygonFace(pts3) { return R.makePolygon(pts3); }

  // ---------- Grundkörper ----------
  function revolveProfile(pts2) { // Profil in XZ-Ebene (x=Radius, z=Höhe) um Z drehen
    const face = polygonFace(pts2.map(([x, z]) => [x, 0, z]));
    return R.revolution(face, [0, 0, 0], [0, 0, 1], 360);
  }
  function buildPrimitive(kind, p) {
    switch (kind) {
      case 'box': {
        const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
        return R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, h]);
      }
      case 'cylinder': return R.makeCylinder(pos(p.d, 20) / 2, pos(p.h, 20), [0, 0, 0], [0, 0, 1]);
      case 'tube': {
        const D = pos(p.d, 20), h = pos(p.h, 20), wall = pos(p.wall, 2);
        const outer = R.makeCylinder(D / 2, h);
        const di = D - 2 * wall;
        if (di <= 0.05) return outer;
        return outer.cut(R.makeCylinder(di / 2, h + 2, [0, 0, -1]));
      }
      case 'sphere': { const r = pos(p.d, 20) / 2; return R.makeSphere(r).translate([0, 0, r]); }
      case 'hemisphere': {
        const r = pos(p.d, 20) / 2;
        return R.makeSphere(r).cut(R.makeBox([-r - 1, -r - 1, -r - 1], [r + 1, r + 1, 0]));
      }
      case 'cone': {
        const r1 = Math.max(0, num(p.d1, 20) / 2), r2 = Math.max(0, num(p.d2, 0) / 2), h = pos(p.h, 20);
        const a = Math.max(r1, 0.01);
        const pts = r2 > 0.005 ? [[0, 0], [a, 0], [r2, h], [0, h]] : [[0, 0], [a, 0], [0, h]];
        return revolveProfile(pts);
      }
      case 'pyramid': {
        const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
        const base = [[-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [w / 2, d / 2, 0], [-w / 2, d / 2, 0]];
        const wire = polygonFace(base).outerWire();
        return R.loft([wire], { endPoint: [0, 0, h] });
      }
      case 'torus': {
        const D = pos(p.d, 30), t = Math.min(pos(p.t, 6), D / 2 - 0.01);
        const rr = t / 2, R0 = D / 2 - rr;
        const circ = R.makeCircle(rr, [R0, 0, rr], [0, 1, 0]);
        const face = R.makeFace(R.assembleWire([circ]));
        return R.revolution(face, [0, 0, 0], [0, 0, 1], 360);
      }
      case 'prism': {
        const n = Math.max(3, Math.min(64, Math.round(num(p.n, 6)))), r = pos(p.d, 20) / 2, h = pos(p.h, 20);
        const pts = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
        return R.basicFaceExtrusion(polygonFace(pts), new R.Vector([0, 0, h]));
      }
      case 'wedge': {
        const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
        const tri = [[-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [-w / 2, -d / 2, h]];
        return R.basicFaceExtrusion(polygonFace(tri), new R.Vector([0, d, 0]));
      }
      default: throw new Error('Unbekannter Grundkörper: ' + kind);
    }
  }

  // ---------- Skizzen ----------
  function planeMap(pl) {
    const o = pl.o || [0, 0, 0], x = norm(pl.x || [1, 0, 0]), n = norm(pl.n || [0, 0, 1]);
    const y = cross(n, x);
    const P = (uv) => [o[0] + x[0] * uv[0] + y[0] * uv[1], o[1] + x[1] * uv[0] + y[1] * uv[1], o[2] + x[2] * uv[0] + y[2] * uv[1]];
    return { o, x, y, n, P };
  }
  // Umlaufsinn einer Kontur in der Ebene: > 0 gegen den Uhrzeigersinn
  function arcSample(a, m, b, n = 12) {
    const ax = a[0], ay = a[1], bx = m[0], by = m[1], cx = b[0], cy = b[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return [a, b];
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy), T = Math.PI * 2, nm = (x) => ((x % T) + T) % T;
    const a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
    const ccw = nm(am - a0) < nm(a1 - a0);
    const sweep = ccw ? nm(a1 - a0) : -nm(a0 - a1);
    const pts = []; for (let i = 0; i <= n; i++) { const t = a0 + (sweep * i) / n; pts.push([ux + Math.cos(t) * r, uy + Math.sin(t) * r]); }
    return pts;
  }
  function loopArea(loop) {
    if (loop.circle) return Math.PI * loop.circle.r * loop.circle.r;
    const pts = [];
    for (const s of loop.segs) { const sp = s.t === 'arc' ? arcSample(s.a, s.m, s.b) : [s.a, s.b]; for (let i = 0; i < sp.length - 1; i++) pts.push(sp[i]); }
    let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
    return A / 2;
  }
  function loopWire(loop, M, ccw = true) {
    if (loop.circle) return R.assembleWire([R.makeCircle(loop.circle.r, M.P(loop.circle.c), ccw ? M.n : M.n.map((v) => -v))]);
    let segs = loop.segs;
    if ((loopArea(loop) > 0) !== ccw) segs = segs.slice().reverse().map((s) => ({ ...s, a: s.b, b: s.a }));
    const edges = [];
    for (const s of segs) {
      if (s.t === 'arc') edges.push(R.makeThreePointArc(M.P(s.a), M.P(s.m), M.P(s.b)));
      else {
        if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < 1e-6) continue;
        edges.push(R.makeLine(M.P(s.a), M.P(s.b)));
      }
    }
    return R.assembleWire(edges);
  }
  function regionFace(region, M) {
    // Außenkontur gegen, Löcher im Uhrzeigersinn – sonst würde ein Loch als Material zählen
    const outer = loopWire(region.outer, M, true);
    const holes = (region.holes || []).map((h) => loopWire(h, M, false));
    return R.makeFace(outer, holes);
  }
  function buildExtrude(p) {
    const M = planeMap(p.plane);
    const dist = pos(p.dist, 10);
    const extra = num(p.extra, 0); // kleine Verlängerung nach außen (saubere Löcher)
    const dir = p.dir || 'normal';
    const solids = [];
    for (const rg of p.regions || []) {
      let face = regionFace(rg, M);
      let v;
      if (dir === 'both') { face = face.translate(mul(M.n, -dist / 2)); v = mul(M.n, dist); }
      else if (dir === 'reverse') { if (extra) face = face.translate(mul(M.n, extra)); v = mul(M.n, -(dist + extra)); }
      else { if (extra) face = face.translate(mul(M.n, -extra)); v = mul(M.n, dist + extra); }
      solids.push(R.basicFaceExtrusion(face, new R.Vector(v)));
    }
    if (!solids.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    return fuseAll(solids);
  }
  function buildRevolve(p) {
    const M = planeMap(p.plane);
    const ax = p.axis || { a: [0, 0], b: [0, 1] };
    const c = M.P(ax.a), d = norm(sub(M.P(ax.b), c));
    const angle = Math.max(1, Math.min(360, num(p.angle, 360)));
    const solids = (p.regions || []).map((rg) => R.revolution(regionFace(rg, M), c, d, angle));
    if (!solids.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    return fuseAll(solids);
  }

  // ---------- Bauteil-Bibliothek ----------
  // Maße aus app/data/schrauben.json (Entwurf Gemini, geprüft): Loch eng/mittel/weit nach ISO 273,
  // Kernloch, Senkkopf ISO 10642 (klein: DIN 965), Senkbohrung DIN 974-1, Mutter ISO 4032. Einsätze: Richtwerte.
  const SCREW = {
    'M1.6': { fine: 1.7, hole: 1.8, coarse: 2.0, tap: 1.25, csk: 3.0, cbD: 3.5, cbH: 1.8, nutSW: 3.2, nutH: 1.3, ins: null, insL: null },   // keine üblichen Einsätze
    M2: { fine: 2.2, hole: 2.4, coarse: 2.6, tap: 1.6, csk: 3.8, cbD: 4.4, cbH: 2.4, nutSW: 4.0, nutH: 1.6, ins: 3.2, insL: 4.0 },
    'M2.5': { fine: 2.7, hole: 2.9, coarse: 3.1, tap: 2.05, csk: 4.7, cbD: 5.5, cbH: 2.9, nutSW: 5.0, nutH: 2.0, ins: 3.6, insL: 5.0 },
    M3: { fine: 3.2, hole: 3.4, coarse: 3.6, tap: 2.5, csk: 6.72, cbD: 6.5, cbH: 3.4, nutSW: 5.5, nutH: 2.4, ins: 4.0, insL: 6.7 },
    M4: { fine: 4.3, hole: 4.5, coarse: 4.8, tap: 3.3, csk: 8.96, cbD: 8.0, cbH: 4.4, nutSW: 7.0, nutH: 3.2, ins: 5.6, insL: 9.1 },
    M5: { fine: 5.3, hole: 5.5, coarse: 5.8, tap: 4.2, csk: 11.2, cbD: 10.0, cbH: 5.4, nutSW: 8.0, nutH: 4.7, ins: 6.4, insL: 10.5 },
    M6: { fine: 6.4, hole: 6.6, coarse: 7.0, tap: 5.0, csk: 13.44, cbD: 11.0, cbH: 6.4, nutSW: 10.0, nutH: 5.2, ins: 8.0, insL: 12.7 },
    M8: { fine: 8.4, hole: 9.0, coarse: 10.0, tap: 6.8, csk: 17.92, cbD: 15.0, cbH: 8.6, nutSW: 13.0, nutH: 6.8, ins: 9.7, insL: 12.7 },
  };
  // Lochdurchmesser je nach Passung: eng, mittel (Standard), weit oder Kernloch zum Gewindeschneiden
  const holeD = (s, fit) => (fit === 'fine' ? s.fine : fit === 'coarse' ? s.coarse : fit === 'tap' ? s.tap : s.hole);
  const LIFT = 0.2; // Löcher ragen ein wenig über die Fläche hinaus, damit sie sauber schneiden
  function hexPrism(sw, z0, z1) {
    const r = sw / Math.sqrt(3);
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, z0]); }
    return R.basicFaceExtrusion(polygonFace(pts), new R.Vector([0, 0, z1 - z0]));
  }
  function buildPart(p) {
    const lib = p.lib;
    const s = SCREW[p.size] || SCREW.M3;
    const tol = num(p.tol, 0);
    if (lib === 'screwHole') {
      const L = pos(p.length, 10);
      const hd = holeD(s, p.fit);
      let shape = R.makeCylinder((hd + tol) / 2, L + LIFT, [0, 0, -L], [0, 0, 1]);
      if (p.head === 'countersunk') {
        const rTop = (s.csk + tol) / 2, rBot = (hd + tol) / 2, h = rTop - rBot; // 90°-Senkung
        const cone = revolveProfile([[0, -h], [rBot, -h], [rTop, 0], [rTop, LIFT], [0, LIFT]]);
        shape = shape.fuse(cone);
      } else if (p.head === 'counterbore') {
        shape = shape.fuse(R.makeCylinder((s.cbD + tol) / 2, s.cbH + LIFT, [0, 0, -s.cbH], [0, 0, 1]));
      }
      return shape;
    }
    if (lib === 'nutTrap') {
      const depth = pos(p.depth, s.nutH + 0.3);
      let shape = hexPrism(s.nutSW + 0.3 + tol, -depth, LIFT);
      if (p.withHole !== false) {
        const L = pos(p.length, depth + 10);
        shape = shape.fuse(R.makeCylinder((s.hole + tol) / 2, L + LIFT, [0, 0, -L], [0, 0, 1]));
      }
      return shape;
    }
    if (lib === 'insert') {
      const si = s.ins ? s : SCREW.M2;
      const L = pos(p.depth, si.insL + 1);
      return R.makeCylinder((si.ins + tol) / 2, L + LIFT, [0, 0, -L], [0, 0, 1]);
    }
    if (lib === 'slotHole') {
      const L = pos(p.len, 20), W = pos(p.w, 4), D = pos(p.depth, 10);
      const r = W / 2, a = Math.max(0, L / 2 - r);
      const M = planeMap({ o: [0, 0, LIFT], x: [1, 0, 0], n: [0, 0, 1] });
      const loop = a < 1e-6 ? { circle: { c: [0, 0], r } } : { segs: [
        { t: 'line', a: [-a, -r], b: [a, -r] }, { t: 'arc', a: [a, -r], m: [a + r, 0], b: [a, r] },
        { t: 'line', a: [a, r], b: [-a, r] }, { t: 'arc', a: [-a, r], m: [-a - r, 0], b: [-a, -r] }] };
      const face = R.makeFace(loopWire(loop, M));
      return R.basicFaceExtrusion(face, new R.Vector([0, 0, -(D + LIFT)]));
    }
    if (lib === 'snapHook') {
      const L = pos(p.length, 12), w = pos(p.w, 8), t = pos(p.t, 1.6), hh = pos(p.hook, 1.2);
      const a = Math.min(L * 0.5, hh * 2.2);
      const prof = [[0, 0], [t, 0], [t, L - a], [t + hh, L - a], [t, L], [0, L]];
      const face = polygonFace(prof.map(([x, z]) => [x, -w / 2, z]));
      return R.basicFaceExtrusion(face, new R.Vector([0, w, 0]));
    }
    if (lib === 'hinge') {
      const L = pos(p.len, 40), W = pos(p.w, 15), T = pos(p.t, 2.4), g = pos(p.gap, 0.4);
      const D = Math.max(T * 2.2, 5), zc = D / 2, pin = D * 0.45;
      const seg = (L - 2 * g) / 3;
      const xs = [[-L / 2, -L / 2 + seg], [-L / 2 + seg + g, L / 2 - seg - g], [L / 2 - seg, L / 2]];
      const knuckle = (x0, x1) => R.makeCylinder(D / 2, x1 - x0, [x0, 0, zc], [1, 0, 0]);
      // Seite A: äußere Gelenke + Stift
      let A = R.makeBox([-L / 2, -W - D / 2, 0], [L / 2, 0, T]);
      A = A.cut(R.makeBox([xs[1][0] - g, -D / 2 - g, -1], [xs[1][1] + g, 1, T + 1]));
      A = A.fuse(knuckle(xs[0][0], xs[0][1])).fuse(knuckle(xs[2][0], xs[2][1]));
      A = A.fuse(R.makeCylinder(pin / 2, L - 0.02, [-L / 2 + 0.01, 0, zc], [1, 0, 0]));
      // Seite B: mittleres Gelenk mit Spiel um den Stift
      let B = R.makeBox([-L / 2, 0, 0], [L / 2, W + D / 2, T]);
      B = B.cut(R.makeBox([-L / 2 - 1, -1, -1], [xs[0][1] + g, D / 2 + g, T + 1]));
      B = B.cut(R.makeBox([xs[2][0] - g, -1, -1], [L / 2 + 1, D / 2 + g, T + 1]));
      B = B.fuse(knuckle(xs[1][0], xs[1][1]));
      B = B.cut(R.makeCylinder(pin / 2 + g, L + 2, [-L / 2 - 1, 0, zc], [1, 0, 0]));
      return R.makeCompound([A, B]);
    }
    if (lib === 'gear') {
      return buildGear(p);
    }
    throw new Error('Unbekanntes Bauteil: ' + lib);
  }
  function buildGear(p) {
    const z = Math.max(6, Math.min(120, Math.round(num(p.teeth, 20))));
    const m = pos(p.module, 1.5), h = pos(p.h, 6), bore = Math.max(0, num(p.bore, 5));
    const alpha = (20 * Math.PI) / 180;
    const rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = Math.max(0.5, rp - 1.25 * m);
    const inv = (a) => Math.tan(a) - a;
    const tooth = (2 * Math.PI) / z;
    const half = Math.PI / (2 * z) + inv(alpha); // halbe Zahndicke am Grundkreis (Winkel)
    const rStart = Math.max(rb, rf);
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
    const flankAng = (r) => half - inv(Math.acos(Math.min(1, rb / r)));
    const N = 7;
    const edges = [];
    for (let i = 0; i < z; i++) {
      const c = i * tooth;
      const right = [], left = [];
      for (let k = 0; k <= N; k++) { const r = rStart + ((ra - rStart) * k) / N; right.push(P(r, c - flankAng(r))); }
      for (let k = N; k >= 0; k--) { const r = rStart + ((ra - rStart) * k) / N; left.push(P(r, c + flankAng(r))); }
      if (rf < rStart - 1e-6) edges.push(R.makeLine(P(rf, c - flankAng(rStart)), right[0]));
      edges.push(R.makeBSplineApproximation(right, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const tipA = c - flankAng(ra), tipB = c + flankAng(ra);
      if (tipB - tipA > 1e-4) edges.push(R.makeThreePointArc(right[N], P(ra, c), left[0]));
      edges.push(R.makeBSplineApproximation(left, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const rootA = c + flankAng(rStart);
      const endL = rf < rStart - 1e-6 ? P(rf, rootA) : left[N];
      if (rf < rStart - 1e-6) edges.push(R.makeLine(left[N], endL));
      const nextA = c + tooth - flankAng(rStart);
      const nextStart = P(rf < rStart - 1e-6 ? rf : rStart, nextA);
      if (nextA - rootA > 1e-4) edges.push(R.makeThreePointArc(endL, P(rf < rStart - 1e-6 ? rf : rStart, (rootA + nextA) / 2), nextStart));
    }
    let g;
    try {
      const face = R.makeFace(R.assembleWire(edges));
      g = R.basicFaceExtrusion(face, new R.Vector([0, 0, h]));
    } catch (err) {
      // Rückfall: Vieleck-Profil
      const pts = [];
      for (let i = 0; i < z; i++) { const c = i * tooth; for (let k = 0; k <= 5; k++) { const r = rStart + ((ra - rStart) * k) / 5; pts.push(P(r, c - flankAng(r))); } for (let k = 5; k >= 0; k--) { const r = rStart + ((ra - rStart) * k) / 5; pts.push(P(r, c + flankAng(r))); } }
      g = R.basicFaceExtrusion(polygonFace(pts), new R.Vector([0, 0, h]));
    }
    if (bore > 0.1 && bore < rf * 2 - 0.5) g = g.cut(R.makeCylinder(bore / 2, h + 2, [0, 0, -1]));
    return g;
  }
  // ---------- Kanten-Veredelung ----------
  function edgeSig(e) {
    const m = vec(e.pointAt(0.5));
    return { t: e.geomType, m, l: e.length };
  }
  function makeEdgeMatcher(sel, shape) {
    if (sel === 'all' || sel == null) return () => true;
    if (typeof sel === 'string') {
      const b = bboxOf(shape);
      const tol = 0.01 + 1e-4 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      return (e) => {
        const a = vec(e.startPoint), c = vec(e.endPoint), m = vec(e.pointAt(0.5));
        if (sel === 'top') return Math.abs(a[2] - b[5]) < tol && Math.abs(c[2] - b[5]) < tol && Math.abs(m[2] - b[5]) < tol;
        if (sel === 'bottom') return Math.abs(a[2] - b[2]) < tol && Math.abs(c[2] - b[2]) < tol && Math.abs(m[2] - b[2]) < tol;
        if (sel === 'vertical') return e.geomType === 'LINE' && Math.hypot(a[0] - c[0], a[1] - c[1]) < tol && Math.abs(a[2] - c[2]) > tol;
        if (sel === 'horizontal') return Math.abs(a[2] - c[2]) < tol && Math.abs(m[2] - a[2]) < tol;
        return false;
      };
    }
    const sigs = Array.isArray(sel) ? sel : [];
    return (e) => {
      const m = vec(e.pointAt(0.5));
      for (const s of sigs) {
        if (!s || !s.m) continue;
        const tol = 0.02 + 0.002 * num(s.l, 1);
        if (Math.hypot(m[0] - s.m[0], m[1] - s.m[1], m[2] - s.m[2]) < tol) return true;
      }
      return false;
    };
  }
  function tryFinish(shape, type, r, matcher) {
    const f = (e) => (matcher(e) ? r : 0);
    return type === 'chamfer' ? shape.chamfer(f) : shape.fillet(f);
  }
  function applyShell(shape, fin, errors, itemId) {
    const t = num(fin.r, 2);
    const b = bboxOf(shape); const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const sigs = (fin.faces || []).filter((f) => f && f.c);
    const pick = (f) => { const c = vec(f.center); return sigs.some((s) => Math.hypot(c[0] - s.c[0], c[1] - s.c[1], c[2] - s.c[2]) < tol); };
    let count = 0; try { for (const f of shape.faces) if (pick(f)) count++; } catch (_) {}
    if (!count) { errors.push({ itemId, finishId: fin.id, code: 'edges', message: 'Die offene Fläche für die Wandstärke gibt es nicht mehr.' }); return shape; }
    const minDim = Math.min(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    if (!(t > 0) || 2 * t >= minDim - 1e-6) { errors.push({ itemId, finishId: fin.id, code: 'shell', message: `Die Wandstärke ist zu dick für dieses Teil – möglich sind weniger als ${String(Math.floor(minDim * 5) / 10).replace('.', ',')} mm.` }); return shape; }
    try {
      const res = shape.shell(t, (ff) => ff.when(({ element }) => pick(element)), 1e-3);
      const rb = bboxOf(res);   // Unsinnige Ergebnisse (größer als vorher) als Fehler melden
      if (rb[3] - rb[0] > b[3] - b[0] + 1e-3 || rb[4] - rb[1] > b[4] - b[1] + 1e-3 || rb[5] - rb[2] > b[5] - b[2] + 1e-3) { safeDelete(res); throw new Error('größer'); }
      return res;
    }
    catch (_) { errors.push({ itemId, finishId: fin.id, code: 'shell', message: 'Die Wandstärke ist zu dick für dieses Teil – nimm einen kleineren Wert.' }); return shape; }
  }
  function applyFinishes(shape, finishes, errors, itemId) {
    for (const fin of finishes || []) {
      if (fin.type === 'shell') { shape = applyShell(shape, fin, errors, itemId); continue; }
      const r = num(fin.r, 1);
      if (!(r > 0)) continue;
      let matcher;
      try { matcher = makeEdgeMatcher(fin.edges, shape); } catch (e) { continue; }
      let count = 0;
      try { for (const e of shape.edges) if (matcher(e)) count++; } catch (_) {}
      if (!count) { errors.push({ itemId, finishId: fin.id, code: 'edges', message: 'Die gewählten Kanten gibt es nicht mehr.' }); continue; }
      try {
        shape = tryFinish(shape, fin.type, r, matcher);
      } catch (err) {
        // größten möglichen Wert suchen
        let lo = 0, hi = r;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          try { const t = tryFinish(shape, fin.type, mid, matcher); t.delete(); lo = mid; } catch (_) { hi = mid; }
        }
        const max = Math.floor(lo * 10) / 10;
        errors.push({ itemId, finishId: fin.id, code: 'toobig', max, message: max > 0 ? `${fin.type === 'chamfer' ? 'Die Fase' : 'Die Rundung'} ist zu groß. Möglich sind höchstens ${String(max).replace('.', ',')} mm.` : `${fin.type === 'chamfer' ? 'Diese Fase' : 'Diese Rundung'} lässt sich an diesen Kanten nicht bauen.` });
      }
    }
    return shape;
  }

  // ---------- Muster, Spiegeln mit Kopie, Teilen ----------
  function patternShape(base, p) {
    const copies = [base];
    if (p.pt === 'rect') {
      const nx = Math.max(1, Math.min(60, Math.round(num(p.nx, 1)))), ny = Math.max(1, Math.min(60, Math.round(num(p.ny, 1))));
      const dx = num(p.dx, 10), dy = num(p.dy, 10);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (i || j) copies.push(base.clone().translate([i * dx, j * dy, 0]));
    } else if (p.pt === 'circ') {
      const n = Math.max(1, Math.min(120, Math.round(num(p.n, 4)))), ang = num(p.ang, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      for (let k = 1; k < n; k++) copies.push(base.clone().rotate(k * step, [num(p.cx, 0), num(p.cy, 0), 0], [0, 0, 1]));
    } else if (p.pt === 'mirror') {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ';
      const n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl], off = num(p.off, 0);
      copies.push(base.clone().mirror(pl, [n[0] * off, n[1] * off, n[2] * off]));
    }
    if (copies.length === 1) return base;
    return fuseAll(copies, true);
  }
  function splitBody(shape, p) {
    // Halbraum als großer Quader: „positiv“ = größere Koordinate als die Ebene
    const ax = { XY: 2, XZ: 1, YZ: 0 }[p.plane] ?? 2;
    const off = num(p.off, 0), gap = Math.max(0, num(p.gap, 0)), keep = p.keep || 'both';
    const b = bboxOf(shape); const m = 1 + Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const lo = [b[0] - m, b[1] - m, b[2] - m], hi = [b[3] + m, b[4] + m, b[5] + m];
    const half = (side) => {
      if (side > 0 ? hi[ax] <= off : lo[ax] >= off) return null;
      const a = lo.slice(), c = hi.slice(); if (side > 0) a[ax] = off; else c[ax] = off;
      if (c[ax] - a[ax] < 1e-6) return null;
      const box = R.makeBox(a, c);
      try { const r = shape.intersect(box); return r; } catch (_) { return null; } finally { safeDelete(box); }
    };
    const pos = keep !== 'negative' ? half(1) : null;
    const neg = keep !== 'positive' ? half(-1) : null;
    const empty = (s) => { if (!s) return true; try { const bb = bboxOf(s); return !(bb[3] - bb[0] > 1e-6); } catch (_) { return true; } };
    const A = empty(pos) ? null : pos, B = empty(neg) ? null : neg;
    if (!A && !B) { const e = new Error('Die Schnittebene trifft den Körper nicht.'); e.code = 'split'; throw e; }
    const d = [0, 0, 0]; d[ax] = gap / 2;
    const a2 = A && gap ? A.translate(d) : A, b2 = B && gap ? B.translate(d.map((v) => -v)) : B;
    safeDelete(shape);
    if (a2 && b2) return R.makeCompound([a2, b2]);
    return a2 || b2;
  }

  // ---------- Objekte auswerten ----------
  function defKey(it) {
    // alles, was die eigene Form bestimmt (nicht die eigene Lage)
    return keyOf({ k: it.kind, p: it.p, f: it.finishes || null, mir: it.mir || null, c: it.children ? it.children.filter((c) => !c.hidden).map((c) => [defKey(c), c.role, c.m]) : null });
  }
  function evalItem(it, errors) {
    const key = defKey(it);
    const hit = cacheGet(key);
    if (hit) return { shape: hit, key };
    let shape;
    try {
      if (it.kind === 'group') {
        const kids = (it.children || []).filter((c) => !c.hidden);
        const solids = [], holes = [];
        for (const c of kids) {
          const r = evalItem(c, errors);
          if (!r.shape) continue;
          const s = applyMatrix(r.shape, c.m);
          (c.role === 'hole' ? holes : solids).push(s);
        }
        const op = it.p && it.p.op;
        if (solids.length) {
          if (op === 'intersect' && solids.length > 1) {
            // Schnittmenge: nur, was in allen Körpern liegt
            shape = solids[0];
            for (let i = 1; i < solids.length; i++) { const nx = shape.intersect(solids[i]); safeDelete(shape); safeDelete(solids[i]); shape = nx; }
          } else shape = fuseAll(solids, true);
          if (holes.length) { const tool = fuseAll(holes, true); const cut = shape.cut(tool); safeDelete(tool); safeDelete(shape); shape = cut; }
        } else if (holes.length) shape = fuseAll(holes, true);
        else shape = null;
        if (shape && op === 'pattern') shape = patternShape(shape, it.p);
        if (shape && op === 'split') shape = splitBody(shape, it.p);
      } else if (it.kind === 'extrude') shape = buildExtrude(it.p);
      else if (it.kind === 'revolve') shape = buildRevolve(it.p);
      else if (it.kind === 'part') shape = buildPart(it.p);
      else shape = buildPrimitive(it.kind, it.p || {});
      if (shape && it.finishes && it.finishes.length) shape = applyFinishes(shape, it.finishes, errors, it.id);
      if (shape && it.mir) {
        if (it.mir[0] < 0) shape = shape.mirror('YZ', [0, 0, 0]);
        if (it.mir[1] < 0) shape = shape.mirror('XZ', [0, 0, 0]);
        if (it.mir[2] < 0) shape = shape.mirror('XY', [0, 0, 0]);
      }
    } catch (err) {
      errors.push({ itemId: it.id, code: err && err.code === 'split' ? 'split' : 'build', message: friendlyError(err) });
      shape = null;
    }
    if (shape) cachePut(key, shape);
    return { shape, key };
  }
  function friendlyError(err) {
    const msg = String((err && err.message) || err || '');
    if (/wire|Wire/.test(msg)) return 'Der Umriss der Skizze ist nicht geschlossen oder überschneidet sich.';
    if (/face|Face/.test(msg)) return 'Aus dieser Skizze lässt sich keine Fläche bilden.';
    if (/WebAssembly\.Exception|object/.test(msg)) return 'Diese Form lässt sich so nicht berechnen. Versuch andere Maße.';
    return msg.slice(0, 160);
  }

  // ---------- schnelle Topologie-Listen (Streuwert statt Paarvergleich) ----------
  const HMAX = 2147483647;
  function topoList(shape, kind) {
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(shape.wrapped, kind === 'face' ? TA.TopAbs_FACE : TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
    const buckets = new Map(); const out = [];
    try {
      while (ex.More()) {
        const it = ex.Current();
        const hc = oc.ReplicadShapeHasher.HashCode(it, HMAX);
        let b = buckets.get(hc); if (!b) { b = []; buckets.set(hc, b); }
        if (!b.some((x) => x.IsSame(it))) { b.push(it); out.push({ hc, s: it }); }
        ex.Next();
      }
    } finally { ex.delete(); }
    return out.map(({ hc, s }) => ({ hc, shape: kind === 'face' ? new R.Face(oc.TopoDS.Face(s)) : new R.Edge(oc.TopoDS.Edge(s)) }));
  }
  function seamHashes(faceList) {
    const TA = oc.TopAbs_ShapeEnum; const out = new Set();
    for (const f of faceList) {
      const t = f.shape.geomType; if (t === 'PLANE') continue;
      const ex = new oc.TopExp_Explorer(f.shape.wrapped, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
      const seen = new Map();
      try {
        while (ex.More()) {
          const it = ex.Current(); const hc = oc.ReplicadShapeHasher.HashCode(it, HMAX);
          const b = seen.get(hc);
          if (b && b.some((x) => x.IsSame(it))) out.add(hc); else { if (b) b.push(it); else seen.set(hc, [it]); }
          ex.Next();
        }
      } finally { ex.delete(); }
    }
    return out;
  }
  // ---------- Netz & Infos für die Anzeige ----------
  // Darstellungsqualität: Faktor auf die Sehnen-Toleranz und Winkel-Toleranz der Anzeige
  const QUALITY = { coarse: { f: 2.2, ang: 0.35 }, normal: { f: 1, ang: 0.2 }, fine: { f: 0.35, ang: 0.1 }, ultra: { f: 0.12, ang: 0.05 } };
  let Q = { level: 'normal', ...QUALITY.normal };
  function setQuality(level) { if (QUALITY[level] && level !== Q.level) Q = { level, ...QUALITY[level] }; }
  function meshTol(b) {
    const diag = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    return Math.min(0.2, Math.max(0.01, diag * 0.0006)) * Q.f;
  }
  function faceInfo(face) {
    const type = face.geomType;
    const info = { t: type };
    try {
      const c = face.center; info.c = [c.x, c.y, c.z];
      if (type === 'PLANE') {
        const n = face.normalAt(); info.n = [n.x, n.y, n.z];
      } else if (type === 'CYLINDRE') {
        const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
        const cy = ad.Cylinder(); const ax = cy.Axis(); const l = ax.Location(), d = ax.Direction();
        info.axis = [l.X(), l.Y(), l.Z(), d.X(), d.Y(), d.Z()]; info.r = cy.Radius();
        ad.delete();
      }
    } catch (_) {}
    return info;
  }
  function edgeGeom(e) {
    const t = e.geomType;
    const a = vec(e.startPoint), b = vec(e.endPoint), m = vec(e.pointAt(0.5));
    const g = { t, a, b, m, l: e.length };
    if (t === 'CIRCLE') {
      try { const ad = new oc.BRepAdaptor_Curve(e.wrapped); const c = ad.Circle(); const l = c.Location(); const ax = c.Axis().Direction(); g.c = [l.X(), l.Y(), l.Z()]; g.r = c.Radius(); g.n = [ax.X(), ax.Y(), ax.Z()]; ad.delete(); } catch (_) {}
    } else if (t !== 'LINE') {
      const pts = []; const N = 16;
      for (let i = 0; i <= N; i++) pts.push(vec(e.pointAt(i / N)));
      g.pts = pts;
    }
    return g;
  }
  function faceLoops(face) {
    const loops = [];
    const wires = [face.clone().outerWire(), ...face.clone().innerWires()];
    for (const w of wires) {
      const segs = [];
      for (const e of w.edges) segs.push(edgeGeom(e));
      loops.push(segs);
    }
    return loops;
  }
  function meshPayload(shape, tolOverride) {
    const b = bboxOf(shape);
    const base = meshTol(b);
    const tol = tolOverride || base;
    const ang = tol < base * 0.99 ? Math.min(Q.ang, 0.08) : Q.ang;   // nur beim Nachschärfen auch feinere Winkel
    const m = shape.mesh({ tolerance: tol, angularTolerance: ang });
    const e = shape.meshEdges({ tolerance: tol, angularTolerance: ang });
    const fl = topoList(shape, 'face'), el = topoList(shape, 'edge');
    const fIndex = new Map(fl.map((f, i) => [f.hc, i]));
    const eIndex = new Map(el.map((f, i) => [f.hc, i]));
    const faceGroups = m.faceGroups.map((g) => [g.start, g.count, fIndex.has(g.faceId) ? fIndex.get(g.faceId) : -1]);
    // Nahtkanten (z. B. an Zylindern) sind keine echten Kanten: nicht zeichnen, nicht anklickbar
    const seams = seamHashes(fl);
    const lines = []; const edgeGroups = [];
    for (const g of e.edgeGroups) {
      if (seams.has(g.edgeId)) continue;
      const start = lines.length / 3;
      for (let i = g.start; i < g.start + g.count; i++) lines.push(e.lines[i * 3], e.lines[i * 3 + 1], e.lines[i * 3 + 2]);
      edgeGroups.push([start, g.count, eIndex.has(g.edgeId) ? eIndex.get(g.edgeId) : -1]);
    }
    const fi = fl.map((f) => faceInfo(f.shape));
    const ei = el.map((f) => edgeGeom(f.shape));
    for (const f of fl) f.shape.delete(); for (const x of el) x.shape.delete();
    return {
      bbox: b, tol,
      vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles),
      lines: new Float32Array(lines), faceGroups, edgeGroups, faces: fi, edges: ei,
    };
  }

  // ---------- Szene ----------
  // scene = { items: [ { id, kind, role, p, m (Weltmatrix), hidden, children, finishes } ] }
  // known = { id: resultKey } (was die Anzeige schon hat)
  function evaluate(scene, known = {}) {
    gen++;
    if (scene.quality) setQuality(scene.quality);
    const errors = [];
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const evald = tops.map((it) => {
      const r = evalItem(it, errors);
      let wb = null;
      if (r.shape) {
        const lb = bboxCached(r.key, r.shape);
        wb = bboxTransform(lb, it.m);
      }
      return { it, ...r, wb };
    });
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const nodes = [];
    for (const e of evald) {
      const it = e.it;
      if (!e.shape) { nodes.push({ id: it.id, key: null, empty: true }); continue; }
      let resultKey = e.key, result = e.shape;
      if (it.role !== 'hole') {
        const cutters = holes.filter((h) => h.it.id !== it.id && bboxHit(h.wb, e.wb));
        if (cutters.length) {
          const inv = matInvRigid(it.m);
          const rel = cutters.map((h) => matMul(inv, h.it.m));
          resultKey = keyOf([e.key, cutters.map((h, i) => [h.key, rel[i].map((v) => Math.round(v * 1e6) / 1e6)])]);
          const hitc = cacheGet(resultKey);
          if (hitc) result = hitc;
          else {
            try {
              const tool = fuseAll(cutters.map((h, i) => applyMatrix(h.shape, rel[i])), true);
              result = e.shape.cut(tool);
              safeDelete(tool);
              cachePut(resultKey, result);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'cut', message: 'Ein Loch konnte nicht abgezogen werden.' });
              result = e.shape; resultKey = e.key;
            }
          }
        }
      }
      if (known[it.id] === resultKey) { nodes.push({ id: it.id, key: resultKey, same: true }); continue; }
      const mk = resultKey + '|' + Q.level;
      let payload = meshCache.get(mk);
      if (!payload) {
        try { payload = meshPayload(result); meshCache.set(mk, payload); }
        catch (err) { errors.push({ itemId: it.id, code: 'mesh', message: 'Die Form konnte nicht angezeigt werden.' }); nodes.push({ id: it.id, key: null, empty: true }); continue; }
      }
      nodes.push({ id: it.id, key: resultKey, ...clonePayload(payload) });
    }
    gc();
    return { nodes, errors };
  }
  const bboxMemo = new Map();
  function bboxCached(key, shape) {
    let b = bboxMemo.get(key);
    if (!b) { b = bboxOf(shape); bboxMemo.set(key, b); if (bboxMemo.size > 2000) bboxMemo.clear(); }
    return b;
  }
  function clonePayload(p) {
    // Typed Arrays werden übertragen: Kopien schicken, damit der Cache gültig bleibt
    return {
      bbox: p.bbox, tol: p.tol, vertices: p.vertices.slice(), normals: p.normals.slice(), triangles: p.triangles.slice(), lines: p.lines.slice(),
      faceGroups: p.faceGroups, edgeGroups: p.edgeGroups, faces: p.faces, edges: p.edges,
    };
  }

  // Feinere Anzeige für ein schon berechnetes Teil (beim Hineinzoomen)
  function remesh(key, tol) {
    const e = cache.get(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher.');
    e.gen = gen;
    const t = Math.max(0.0002, tol);
    const mk = key + '|t' + t.toPrecision(2);
    let payload = meshCache.get(mk);
    if (!payload) { payload = meshPayload(e.shape, t); meshCache.set(mk, payload); }
    return clonePayload(payload);
  }
  // Umriss einer ebenen Fläche (für „Skizze hierauf“ und „Hochziehen“)
  function faceLoopsOf(key, faceIdx) {
    const e = cache.get(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher. Bitte noch einmal anklicken.');
    e.gen = gen;
    const fl = topoList(e.shape, 'face'); const f = fl[faceIdx];
    if (!f) throw new Error('Diese Fläche gibt es nicht mehr.');
    const loops = faceLoops(f.shape);
    for (const x of fl) x.shape.delete();
    return loops;
  }
  // Ergebnisformen in Weltkoordinaten (für Export und Zeichnung)
  function worldSolids(scene) {
    const errors = [];
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const res = evaluateShapes(scene, errors);
    return res;
  }
  function evaluateShapes(scene, errors) {
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const evald = tops.map((it) => {
      const r = evalItem(it, errors);
      let wb = null;
      if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
      return { it, ...r, wb };
    });
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const out = [];
    for (const e of evald) {
      if (!e.shape || e.it.role === 'hole') continue;
      let world = applyMatrix(e.shape, e.it.m);
      const cutters = holes.filter((h) => bboxHit(h.wb, e.wb));
      if (cutters.length) {
        try { const tool = fuseAll(cutters.map((h) => applyMatrix(h.shape, h.it.m)), true); const cut = world.cut(tool); safeDelete(tool); safeDelete(world); world = cut; } catch (_) {}
      }
      out.push({ id: e.it.id, name: e.it.name, color: e.it.color, shape: world });
    }
    return out;
  }

  function exportMeshes(scene, fine = true) {
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const objs = [];
    for (const s of solids) {
      const b = bboxOf(s.shape);
      const tol = fine ? Math.min(0.05, Math.max(0.005, meshTol(b) * 0.35)) : meshTol(b);
      const m = s.shape.mesh({ tolerance: tol, angularTolerance: fine ? 0.1 : 0.2 });
      objs.push({ id: s.id, name: s.name, color: s.color, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles) });
      s.shape.delete();
    }
    return { objects: objs, errors };
  }
  function exportSTEP(scene) {
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    if (!solids.length) throw new Error('Es gibt nichts zu exportieren.');
    const comp = solids.length === 1 ? solids[0].shape : R.makeCompound(solids.map((s) => s.shape));
    return comp.blobSTEP();
  }
  // Volumen, Oberfläche und Schwerpunkt – je Teil der obersten Ebene und gesamt
  function measure(scene) {
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    let volume = 0, area = 0;
    let b = null; const parts = [];
    for (const s of solids) {
      let v = 0, a = 0, com = null;
      try { const pr = R.measureShapeVolumeProperties(s.shape); v = pr.volume; com = pr.centerOfMass; pr.delete && pr.delete(); } catch (_) {}
      try { a = R.measureArea(s.shape); } catch (_) {}
      volume += v; area += a;
      const bb = bboxOf(s.shape);
      b = b ? [Math.min(b[0], bb[0]), Math.min(b[1], bb[1]), Math.min(b[2], bb[2]), Math.max(b[3], bb[3]), Math.max(b[4], bb[4]), Math.max(b[5], bb[5])] : bb;
      parts.push({ id: s.id, volume: v, area: a, com, bbox: bb });
      s.shape.delete();
    }
    return { volume, area, bbox: b, count: solids.length, parts, errors };
  }

  // ---------- Technische Zeichnung ----------
  const VIEWS = {
    front: { dir: [0, -1, 0], x: [1, 0, 0] },
    top: { dir: [0, 0, 1], x: [1, 0, 0] },
    left: { dir: [-1, 0, 0], x: [0, -1, 0] },
    right: { dir: [1, 0, 0], x: [0, 1, 0] },
    back: { dir: [0, 1, 0], x: [-1, 0, 0] },
    bottom: { dir: [0, 0, -1], x: [1, 0, 0] },
    iso: { dir: norm([1, -1, 1]), x: norm([1, 1, 0]) },
  };
  function edge2d(e) {
    const t = e.geomType;
    const P = (p) => [p.x, p.y];
    const out = { t };
    if (t === 'LINE') { out.a = P(e.startPoint); out.b = P(e.endPoint); return out; }
    if (t === 'CIRCLE') {
      try {
        const ad = new oc.BRepAdaptor_Curve(e.wrapped); const c = ad.Circle(); const l = c.Location();
        out.c = [l.X(), l.Y()]; out.r = c.Radius();
        const f = ad.FirstParameter(), la = ad.LastParameter();
        out.full = Math.abs(la - f - Math.PI * 2) < 1e-6;
        ad.delete();
      } catch (_) {}
    }
    const L = e.length;
    // Kreise werden in der Zeichnung aus Mittelpunkt und Radius neu erzeugt; andere Kurven fein abtasten
    const N = t === 'CIRCLE' && out.c ? Math.max(8, Math.min(96, Math.ceil(L / 1.5))) : Math.max(8, Math.min(360, Math.ceil(L / 0.6)));
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(P(e.pointAt(i / N)));
    out.pts = pts;
    return out;
  }
  function project(scene, views) {
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    if (!solids.length) return { views: {}, axes: [], errors };
    let shape = solids[0].shape;
    for (let i = 1; i < solids.length; i++) { try { shape = shape.fuse(solids[i].shape); } catch (_) { shape = R.makeCompound([shape, solids[i].shape]); } }
    const out = {};
    for (const name of views) {
      const v = VIEWS[name]; if (!v) continue;
      const cam = new R.ProjectionCamera([0, 0, 0], v.dir, v.x);
      const { visible, hidden } = R.makeProjectedEdges(shape, cam);
      out[name] = { visible: visible.map(edge2d), hidden: hidden.map(edge2d), dir: v.dir, x: v.x, y: cross(v.dir, v.x) };
      cam.delete();
    }
    // Achsen von Zylinderflächen für Mittellinien
    const axes = [];
    for (const f of shape.faces) {
      if (f.geomType !== 'CYLINDRE') continue;
      // nur volle Zylinder (Bohrungen, Zapfen) bekommen Mittellinien, keine Rundungen
      try { const uv = f.UVBounds; if (Math.abs(uv.uMax - uv.uMin) < Math.PI * 1.9) continue; } catch (_) {}
      try {
        const ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
        const cy = ad.Cylinder(); const ax = cy.Axis(); const l = ax.Location(), d = ax.Direction();
        const o = [l.X(), l.Y(), l.Z()], dir = [d.X(), d.Y(), d.Z()], r = cy.Radius();
        ad.delete();
        let tmin = Infinity, tmax = -Infinity;
        for (const e of f.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) { const p = vec(e.pointAt(t)); const s = dot(sub(p, o), dir); tmin = Math.min(tmin, s); tmax = Math.max(tmax, s); }
        axes.push({ o, d: dir, r, t0: tmin, t1: tmax });
      } catch (_) {}
    }
    const bbox = bboxOf(shape);
    return { views: out, axes, bbox, errors };
  }

  return { evaluate, remesh, exportMeshes, exportSTEP, measure, project, faceLoopsOf, _cache: cache };
}
