// Tracery CAD-Kern: läuft im Web Worker (oder in Node für Tests).
// createKernel(R, oc) bekommt die replicad-Bibliothek und die OpenCascade-Instanz.

export function createKernel(R, oc) {
  const cache = new Map(); // key -> { shape, gen, bbox }
  const meshCache = new Map(); // resultKey -> mesh payload (plain arrays, reusable)
  const importBlobs = new Map(); // blobId -> Uint8Array (binäre Import-Dateien)
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
  function hashBytes(u8) {
    let h1 = 0xdeadbeef ^ u8.byteLength, h2 = 0x41c6ce57 ^ u8.byteLength;
    for (let i = 0; i < u8.byteLength; i++) {
      const ch = u8[i];
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + '_' + u8.byteLength;
  }
  function ingestBlobs(scene) {
    if (!scene || !Array.isArray(scene.items)) return;
    const walk = (items) => {
      for (const it of items) {
        if (!it) continue;
        if (it.kind === 'import' && it.p && it.p.blobId && it.p.bytes) {
          const u8 = it.p.bytes instanceof Uint8Array ? it.p.bytes : new Uint8Array(it.p.bytes);
          importBlobs.set(it.p.blobId, u8);
        }
        if (it.children) walk(it.children);
      }
    };
    walk(scene.items);
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
  function cachePut(key, shape, errs) { cache.set(key, { shape, gen, errs: errs && errs.length ? errs : null }); return shape; }

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
  function matTrans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function matRotXYZ(rx, ry, rz) {
    const D = Math.PI / 180;
    const a = num(rx, 0) * D, b = num(ry, 0) * D, c = num(rz, 0) * D;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    const Rx = [1, 0, 0, 0, 0, ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1];
    const Ry = [cb, 0, -sb, 0, 0, 1, 0, 0, sb, 0, cb, 0, 0, 0, 0, 1];
    const Rz = [cc, sc, 0, 0, -sc, cc, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return matMul(Rx, matMul(Ry, Rz));
  }
  function buildTransformMatrix(p, wb) {
    const dx = num(p.dx, 0), dy = num(p.dy, 0), dz = num(p.dz, 0);
    const rx = num(p.rx, 0), ry = num(p.ry, 0), rz = num(p.rz, 0);
    let M = matTrans(dx, dy, dz);
    if (Math.abs(rx) > 1e-9 || Math.abs(ry) > 1e-9 || Math.abs(rz) > 1e-9) {
      let px = 0, py = 0, pz = 0;
      if (p.pivot === 'point') { px = num(p.px, 0); py = num(p.py, 0); pz = num(p.pz, 0); }
      else if (p.pivot !== 'origin' && wb) { px = (wb[0] + wb[3]) / 2; py = (wb[1] + wb[4]) / 2; pz = (wb[2] + wb[5]) / 2; }
      const R = matRotXYZ(rx, ry, rz);
      const Rp = (px || py || pz) ? matMul(matTrans(px, py, pz), matMul(R, matTrans(-px, -py, -pz))) : R;
      M = matMul(M, Rp);
    }
    return M;
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
    if (loop.ellipse) return Math.PI * loop.ellipse.rx * loop.ellipse.ry;
    const pts = [];
    const bz = (s) => { const o = []; for (let i = 0; i <= 8; i++) { const t = i / 8, u = 1 - t; o.push([0, 1].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k])); } return o; };
    for (const s of loop.segs) { const sp = s.t === 'arc' ? arcSample(s.a, s.m, s.b) : s.t === 'bez' ? bz(s) : [s.a, s.b]; for (let i = 0; i < sp.length - 1; i++) pts.push(sp[i]); }
    let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
    return A / 2;
  }
  function loopWire(loop, M, ccw = true) {
    if (loop.circle) return R.assembleWire([R.makeCircle(loop.circle.r, M.P(loop.circle.c), ccw ? M.n : M.n.map((v) => -v))]);
    if (loop.ellipse) {
      const E = loop.ellipse; let a = E.rx, b = E.ry, rot = E.rot || 0;
      if (b > a) { const t = a; a = b; b = t; rot += Math.PI / 2; }
      const d2 = [Math.cos(rot), Math.sin(rot)], xd = [0, 1, 2].map((i) => M.x[i] * d2[0] + M.y[i] * d2[1]);
      if (Math.abs(a - b) < 1e-6) return R.assembleWire([R.makeCircle(a, M.P(E.c), ccw ? M.n : M.n.map((v) => -v))]);
      return R.assembleWire([R.makeEllipse(a, b, M.P(E.c), ccw ? M.n : M.n.map((v) => -v), xd)]);
    }
    let segs = loop.segs;
    if ((loopArea(loop) > 0) !== ccw) segs = segs.slice().reverse().map((s) => (s.t === 'bez' ? { ...s, a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { ...s, a: s.b, b: s.a }));
    const edges = [];
    for (const s of segs) {
      if (s.t === 'arc') edges.push(R.makeThreePointArc(M.P(s.a), M.P(s.m), M.P(s.b)));
      else if (s.t === 'bez') edges.push(R.makeBezierCurve([M.P(s.a), M.P(s.c1), M.P(s.c2), M.P(s.b)]));
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
    if (p.thinError) throw new Error(p.thinError);
    const M = planeMap(p.plane);
    const dist = pos(p.dist, 10);
    const extra = num(p.extra, 0); // kleine Verlängerung nach außen (saubere Löcher)
    const dir = p.dir || 'normal';
    const solids = [];
    for (const rg of p.regions || []) {
      let face = regionFace(rg, M);
      let v;
      if (dir === 'both') { face = face.translate(mul(M.n, -dist / 2)); v = mul(M.n, dist); }
      else if (dir === 'two') { const d2 = pos(p.dist2, dist); face = face.translate(mul(M.n, -d2)); v = mul(M.n, dist + d2); }
      else if (dir === 'reverse') { if (extra) face = face.translate(mul(M.n, extra)); v = mul(M.n, -(dist + extra)); }
      else { if (extra) face = face.translate(mul(M.n, -extra)); v = mul(M.n, dist + extra); }
      solids.push(R.basicFaceExtrusion(face, new R.Vector(v)));
    }
    if (!solids.length) throw new Error(p.thin ? 'Die Skizze hat keine Linie und keinen Umriss für eine dünne Wand.' : 'Die Skizze hat keine geschlossene Fläche.');
    return fuseAll(solids);
  }
  function loopPts3D(loop, M) {
    if (loop.circle) {
      const { c, r } = loop.circle, pts = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(M.P([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]));
      }
      return pts;
    }
    if (loop.ellipse) {
      const E = loop.ellipse, pts = [], cr = Math.cos(E.rot || 0), sr = Math.sin(E.rot || 0);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const lx = Math.cos(a) * E.rx, ly = Math.sin(a) * E.ry;
        pts.push(M.P([E.c[0] + lx * cr - ly * sr, E.c[1] + lx * sr + ly * cr]));
      }
      return pts;
    }
    const pts = [];
    const bz = (s) => { const o = []; for (let i = 0; i <= 8; i++) { const t = i / 8, u = 1 - t; o.push([0, 1].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k])); } return o; };
    for (const s of loop.segs || []) {
      const sp = s.t === 'arc' ? arcSample(s.a, s.m, s.b, 12) : s.t === 'bez' ? bz(s) : [s.a, [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], s.b];
      for (const q of sp) pts.push(M.P(q));
    }
    return pts;
  }
  function buildRevolveToFace(regs, M, c, de, fo, fn) {
    const fnn = norm(fn), dn = norm(de);
    const solids = [];
    const normPos = (a) => { const T = Math.PI * 2; let x = ((a % T) + T) % T; if (x < 1e-3) x = T; return x; };
    for (const rg of regs) {
      const pts = loopPts3D(rg.outer, M);
      if (pts.length < 3) throw new Error('Die Skizze hat keine gültige Fläche zum Drehen.');
      const sVals = pts.map((P) => dot(sub(P, fo), fnn));
      const sMin = Math.min(...sVals), sMax = Math.max(...sVals);
      if (sMax > 1e-3 && sMin < -1e-3) throw new Error('Die gewählte Fläche schneidet bereits die Skizze.');
      if (Math.max(Math.abs(sMax), Math.abs(sMin)) < 1e-4) throw new Error('Skizze und Zielfläche liegen in derselben Ebene.');
      const nKeep = sMax + sMin >= 0 ? fnn : mul(fnn, -1);
      let minFirst = Infinity, maxFirst = 0, minSecond = Infinity;
      let probe = null;
      for (const P of pts) {
        const v = sub(P, c), h = dot(v, dn), u = sub(v, mul(dn, h)), rLen = len(u);
        if (rLen < 1e-5) continue;
        const w = cross(dn, u);
        const A = dot(u, nKeep), B = dot(w, nKeep), C = dot(sub(add(c, mul(dn, h)), fo), nKeep), Mab = Math.hypot(A, B);
        if (Mab < 1e-7 || Math.abs(C) > Mab + 1e-4) throw new Error('Die gewählte Fläche wird beim Drehen nicht vollständig erreicht.');
        const s0 = A + C;
        if (Math.abs(s0) < 1e-4 && B < -1e-6) throw new Error('Die Skizze liegt an der Zielfläche – dreh die Richtung um.');
        const phi = Math.atan2(B, A), alpha = Math.acos(Math.max(-1, Math.min(1, -C / Mab)));
        const t1 = normPos(phi + alpha), t2 = normPos(phi - alpha);
        const tFirst = Math.min(t1, t2), tSecond = Math.max(t1, t2);
        if (tFirst < minFirst) minFirst = tFirst;
        if (tFirst > maxFirst) maxFirst = tFirst;
        if (tSecond < minSecond) minSecond = tSecond;
        if (!probe) probe = { h, u, w };
      }
      if (!probe) throw new Error('Das Profil liegt komplett auf der Drehachse.');
      const degMin = (minFirst * 180) / Math.PI, degMax = (maxFirst * 180) / Math.PI, degSec = (minSecond * 180) / Math.PI;
      const f0 = regionFace(rg, M);
      if (degMax - degMin < 0.05) {
        const s = R.revolution(f0, c, dn, Math.max(0.1, Math.min(360, degMax)));
        safeDelete(f0);
        solids.push(s);
      } else {
        const gap = degSec > degMax + 0.2 ? Math.min(5, (degSec - degMax) * 0.4) : 2;
        const degOver = Math.min(359, degMax + Math.max(0.2, gap));
        const rev = R.revolution(f0, c, dn, degOver);
        safeDelete(f0);
        const bb = bboxOf(rev), ctr = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
        const L = Math.max(50, Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 4);
        const foProj = sub(ctr, mul(nKeep, dot(sub(ctr, fo), nKeep)));
        const ref = Math.abs(nKeep[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const fx = norm(cross(ref, nKeep)), fy = cross(nKeep, fx);
        const mat = [fx[0], fx[1], fx[2], 0, fy[0], fy[1], fy[2], 0, nKeep[0], nKeep[1], nKeep[2], 0, foProj[0], foProj[1], foProj[2], 1];
        const b0 = R.makeBox([-L, -L, 0], [L, L, L]);
        const halfBox = applyMatrix(b0, mat);
        safeDelete(b0);
        let trimmed = rev.intersect(halfBox);
        safeDelete(rev); safeDelete(halfBox);
        const parts = trimmed.solids;
        if (parts && parts.length > 1) {
          const tp = minFirst * 0.5;
          const pProbe = add(add(c, mul(dn, probe.h)), add(mul(probe.u, Math.cos(tp)), mul(probe.w, Math.sin(tp))));
          let best = parts[0], bestD = Infinity;
          for (const sol of parts) {
            const sb = bboxOf(sol);
            const dx = Math.max(sb[0] - pProbe[0], 0, pProbe[0] - sb[3]);
            const dy = Math.max(sb[1] - pProbe[1], 0, pProbe[1] - sb[4]);
            const dz = Math.max(sb[2] - pProbe[2], 0, pProbe[2] - sb[5]);
            const dd = Math.hypot(dx, dy, dz);
            if (dd < bestD) { bestD = dd; best = sol; }
          }
          for (const sol of parts) if (sol !== best) safeDelete(sol);
          const kept = best.clone();
          safeDelete(trimmed);
          trimmed = kept;
        }
        solids.push(trimmed);
      }
    }
    return fuseAll(solids);
  }
  function buildRevolve(p) {
    const M = planeMap(p.plane);
    const ax = p.axis || { a: [0, 0], b: [0, 1] };
    const c = p.axis3d && Array.isArray(p.axis3d.o) ? p.axis3d.o.map(Number) : M.P(ax.a);
    const d = p.axis3d && Array.isArray(p.axis3d.d) ? norm(p.axis3d.d.map(Number)) : norm(sub(M.P(ax.b), c));
    const regs = p.regions || [];
    if (!regs.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    const dir = p.dir || 'normal';
    if (dir === 'toFace') {
      if (!p.toFace || !Array.isArray(p.toFace.o) || !Array.isArray(p.toFace.fn)) {
        throw new Error('Bitte wähle eine Fläche oder Ebene für „Bis zu gewählter Fläche“.');
      }
      const de = p.toFaceFlip ? mul(d, -1) : d;
      return buildRevolveToFace(regs, M, c, de, p.toFace.o.map(Number), norm(p.toFace.fn.map(Number)));
    }
    const solids = [];
    for (const rg of regs) {
      const f0 = regionFace(rg, M);
      if (dir === 'reverse') {
        const angle = Math.max(0.1, Math.min(360, num(p.angle, 360)));
        solids.push(R.revolution(f0, c, mul(d, -1), angle));
        safeDelete(f0);
      } else if (dir === 'both') {
        const angle = Math.max(0.1, Math.min(360, num(p.angle, 360)));
        if (angle >= 360 - 1e-6) {
          solids.push(R.revolution(f0, c, d, 360));
          safeDelete(f0);
        } else {
          const f1 = f0.rotate(-angle / 2, c, d);
          safeDelete(f0);
          solids.push(R.revolution(f1, c, d, angle));
          safeDelete(f1);
        }
      } else if (dir === 'two') {
        const a1 = Math.max(0, Math.min(360, num(p.angle, 90)));
        const a2 = Math.max(0, Math.min(360, num(p.angle2, a1)));
        const tot = Math.min(360, a1 + a2);
        if (tot < 0.1) { safeDelete(f0); throw new Error('Der Drehwinkel muss größer als 0° sein.'); }
        if (tot >= 360 - 1e-6) {
          solids.push(R.revolution(f0, c, d, 360));
          safeDelete(f0);
        } else if (a2 > 1e-6) {
          const f1 = f0.rotate(-a2, c, d);
          safeDelete(f0);
          solids.push(R.revolution(f1, c, d, tot));
          safeDelete(f1);
        } else {
          solids.push(R.revolution(f0, c, d, a1));
          safeDelete(f0);
        }
      } else {
        const angle = Math.max(0.1, Math.min(360, num(p.angle, 360)));
        solids.push(R.revolution(f0, c, d, angle));
        safeDelete(f0);
      }
    }
    return fuseAll(solids);
  }

  // Offener Zug aus Skizzen-Stücken als Kanten im Raum (Pfad für Sweep und Mittellinie)
  function segEdges(segs, M) {
    const edges = [];
    for (const s of segs) {
      if (s.t === 'arc') edges.push(R.makeThreePointArc(M.P(s.a), M.P(s.m), M.P(s.b)));
      else if (s.t === 'bez') edges.push(R.makeBezierCurve([M.P(s.a), M.P(s.c1), M.P(s.c2), M.P(s.b)]));
      else if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-6) edges.push(R.makeLine(M.P(s.a), M.P(s.b)));
    }
    return edges;
  }
  // Geschlossene glatte Kurve genau durch Punkte im Raum (Catmull-Rom nach Bogenlänge → kubische Bézier-Stücke)
  function bezLoopWire(pts) {
    const m = pts.length, Q = (i) => pts[((i % m) + m) % m], E = [];
    const dist = (a, b) => Math.max(1e-9, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    for (let i = 0; i < m; i++) {
      const p0 = Q(i - 1), p1 = Q(i), p2 = Q(i + 1), p3 = Q(i + 2), t1 = dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3), dt = t2 - t1;
      const m1 = [0, 1, 2].map((k) => ((p1[k] - p0[k]) / t1 - (p2[k] - p0[k]) / t2 + (p2[k] - p1[k]) / dt) * dt);
      const m2 = [0, 1, 2].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
      E.push(R.makeBezierCurve([p1, p1.map((v, k) => v + m1[k] / 3), p2.map((v, k) => v - m2[k] / 3), p2]));
    }
    return R.assembleWire(E);
  }
  // Übergang zwischen mehreren Umrissen (Loft), auf Wunsch mit Spitze – oder entlang einer Mittellinie
  function buildLoft(p) {
    if (Array.isArray(p.sections3) && p.sections3.length >= 2) {
      // mit Führungskurve: Zwischenschnitte kommen fertig aus dem Modell
      try { return R.loft(p.sections3.map(bezLoopWire), { ruled: false }); }
      catch (_) { throw new Error('Der Übergang mit Führungskurve klappt so nicht. Die Kurve sollte neben den Umrissen entlanglaufen, vom ersten bis zum letzten, ohne die Achse zu kreuzen.'); }
    }
    const pr = p.profiles || [];
    const path = p.path && p.path.segs && p.path.segs.length ? p.path : null;
    if (pr.length < (p.tipPoint && !path ? 1 : 2)) throw new Error('Für einen Übergang braucht es mindestens zwei geschlossene Umrisse (oder einen Umriss mit Spitze).');
    const wires = pr.map((q) => loopWire(q.outer, planeMap(q.plane), true));
    if (!path) return R.loft(wires, { ruled: !!p.ruled, endPoint: p.tipPoint || undefined });
    // Mittellinie: Die Umrisse bleiben, wo sie sind; die Fläche dazwischen folgt der Linie (Pipe-Shell mit mehreren Schnitten)
    const spine = R.assembleWire(segEdges(path.segs, planeMap(path.plane)));
    const b = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
    let shape = null;
    try {
      b.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
      b.SetMode(false);   // korrigiertes Frenet-Dreibein: Umrisse kippen nicht um die Linie
      for (const w of wires) b.Add(w.wrapped, false, false);
      b.Build();
      if (!b.IsDone()) throw new Error('x');
      b.MakeSolid();
      shape = R.cast(b.Shape());
    } catch (_) {
      shape = null;
    } finally { b.delete(); }
    if (!shape) throw new Error('Der Übergang entlang der Mittellinie klappt so nicht. Die Mittellinie sollte vom ersten Umriss durch alle anderen bis zum letzten laufen und nicht zu eng gebogen sein.');
    return shape;
  }

  // Querschnitt entlang eines offenen Pfads (Sweep): Rohr, Kabelkanal, Leiste
  function buildSweep(p) {
    let spine, P0, T, N;
    const P3 = p.path3d && Array.isArray(p.path3d.pts) ? p.path3d.pts.filter((q) => Array.isArray(q) && q.length === 3 && q.every((v) => isFinite(v))) : null;
    if (P3) {
      // Pfad im Raum: glatte Kurve durch die Punkte (B-Spline) oder gerade Stücke mit runden Übergängen
      const pts = P3.filter((q, i) => !i || Math.hypot(q[0] - P3[i - 1][0], q[1] - P3[i - 1][1], q[2] - P3[i - 1][2]) > 1e-6);
      if (pts.length < 2) throw new Error('Der Pfad im Raum braucht mindestens zwei verschiedene Punkte.');
      const bz = Array.isArray(p.path3d.segs) ? p.path3d.segs : null;
      if (p.path3d.smooth !== false && pts.length >= 3 && bz && bz.length) {
        spine = R.assembleWire(bz.map((g) => R.makeBezierCurve([g.a, g.c1, g.c2, g.b])));
        T = norm(sub(bz[0].c1, bz[0].a));
      } else {
        const ed = []; for (let i = 1; i < pts.length; i++) ed.push(R.makeLine(pts[i - 1], pts[i]));
        spine = R.assembleWire(ed); T = norm(sub(pts[1], pts[0]));
      }
      P0 = pts[0];
      const up = Math.abs(T[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0], d = T[0] * up[0] + T[1] * up[1] + T[2] * up[2];
      N = norm([up[0] - T[0] * d, up[1] - T[1] * d, up[2] - T[2] * d]);
    } else {
      const segs = p.segs || [];
      if (!segs.length || !p.t0) throw new Error('Die Skizze hat keinen offenen Pfad. Zeichne eine Linie, einen Bogen oder eine Spline, die nicht geschlossen ist.');
      const M = planeMap(p.plane);
      spine = R.assembleWire(segEdges(segs, M));
      P0 = M.P(segs[0].a); const O = M.P([0, 0]);
      T = norm(sub(M.P(p.t0), O)); N = M.n;
    }
    const V = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const prof = (inset) => {
      if (p.shape === 'sketch' && p.prof) {
        if (inset > 0) return null;
        const Y = [T[1] * V[2] - T[2] * V[1], T[2] * V[0] - T[0] * V[2], T[0] * V[1] - T[1] * V[0]];
        const o = [0, 1, 2].map((k) => P0[k] - V[k] * p.prof.c[0] - Y[k] * p.prof.c[1]);
        return loopWire(p.prof.outer, planeMap({ o, x: V, n: T }), true);
      }
      if (p.shape === 'rect') {
        const w = pos(p.w, 6) / 2 - inset, h = pos(p.h, 4) / 2 - inset;
        if (w <= 0 || h <= 0) return null;
        const q = (a, b) => [0, 1, 2].map((k) => P0[k] + V[k] * a + N[k] * b);
        const c = [q(-w, -h), q(w, -h), q(w, h), q(-w, h)];
        return R.assembleWire([R.makeLine(c[0], c[1]), R.makeLine(c[1], c[2]), R.makeLine(c[2], c[3]), R.makeLine(c[3], c[0])]);
      }
      const r = pos(p.d, 6) / 2 - inset; if (r <= 0) return null;
      return R.assembleWire([R.makeCircle(r, P0, T)]);
    };
    const sweep = (w) => R.genericSweep(w, spine, { transitionMode: 'round', forceProfileSpineOthogonality: true });
    let shape = sweep(prof(0));
    const wall = num(p.wall, 0);
    if (wall > 0 && p.shape !== 'sketch') { const inner = prof(wall); if (!inner) throw new Error('Die Wand ist dicker als das halbe Rohr.'); const cutter = sweep(inner); const res = shape.cut(cutter); safeDelete(shape); safeDelete(cutter); shape = res; }
    return shape;
  }

  // Importierte STEP- oder STL-Datei (binär per blobId/bytes oder Base64)
  function buildImport(p) {
    let bytes = p.bytes ? (p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes)) : (p.blobId ? importBlobs.get(p.blobId) : null);
    if (!bytes && p.data) {
      const bin = atob(p.data); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    if (!bytes || !bytes.byteLength) throw new Error('Die importierte Datei ist leer.');
    const fn = 'imp_' + Math.random().toString(36).slice(2);
    oc.FS.writeFile('/' + fn, bytes);
    let shape = null;
    try {
      if (p.fmt === 'stl') {
        const reader = new oc.StlAPI_Reader(); const sh = new oc.TopoDS_Shell();
        if (!reader.Read(sh, fn)) throw new Error('Die STL-Datei ließ sich nicht lesen.');
        const up = new oc.ShapeUpgrade_UnifySameDomain(sh, true, true, false); up.Build();
        const ms = new oc.BRepBuilderAPI_MakeSolid();
        try { ms.Add(oc.TopoDS.Shell(up.Shape())); shape = R.cast(ms.Solid()); } catch (_) { shape = R.cast(up.Shape()); }
        reader.delete(); up.delete(); ms.delete();
      } else {
        const reader = new oc.STEPControl_Reader();
        if (!reader.ReadFile(fn)) { reader.delete(); throw new Error('Die STEP-Datei ließ sich nicht lesen.'); }
        reader.TransferRoots(); shape = R.cast(reader.OneShape()); reader.delete();
      }
    } finally { try { oc.FS.unlink('/' + fn); } catch (_) {} }
    const s = num(p.scale, 1);
    if (shape && Math.abs(s - 1) > 1e-9) shape = shape.scale(s, [0, 0, 0]);
    return shape;
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
  // Zentrierbohrungen nach DIN 332 Form A (60°-Kegel + Führungsbohrung mit 118°-Bohrspitze)
  const CENTER_DRILL = {
    A1: { d1: 1.0, d2: 2.12, t1: 1.3 },
    'A1.6': { d1: 1.6, d2: 3.35, t1: 2.0 },
    A2: { d1: 2.0, d2: 4.25, t1: 2.5 },
    'A2.5': { d1: 2.5, d2: 5.30, t1: 3.1 },
    'A3.15': { d1: 3.15, d2: 6.70, t1: 3.9 },
    A4: { d1: 4.0, d2: 8.50, t1: 5.0 },
    A5: { d1: 5.0, d2: 10.60, t1: 6.3 },
    'A6.3': { d1: 6.3, d2: 13.20, t1: 8.0 },
  };
  // Normteile: Kopf Zylinderschraube ISO 4762 (Ø, Höhe, Innensechskant), Senkschraube ISO 10642 (Kopfhöhe, Innensechskant),
  // Scheibe ISO 7089 (innen, außen, Dicke). Kopf und Scheibe aus app/data/schrauben.json bzw. Normtabellen (Nennmaße).
  const NORM = {
    'M1.6': { hd: 3.0, hk: 1.6, hs: 1.5, w1: 1.7, w2: 4.0, wh: 0.3 },
    M2: { hd: 3.8, hk: 2.0, hs: 1.5, w1: 2.2, w2: 5.0, wh: 0.3 },
    'M2.5': { hd: 4.5, hk: 2.5, hs: 2.0, w1: 2.7, w2: 6.0, wh: 0.5 },
    M3: { hd: 5.5, hk: 3.0, hs: 2.5, ck: 1.86, cs: 2.0, w1: 3.2, w2: 7.0, wh: 0.5 },
    M4: { hd: 7.0, hk: 4.0, hs: 3.0, ck: 2.48, cs: 2.5, w1: 4.3, w2: 9.0, wh: 0.8 },
    M5: { hd: 8.5, hk: 5.0, hs: 4.0, ck: 3.1, cs: 3.0, w1: 5.3, w2: 10.0, wh: 1.0 },
    M6: { hd: 10.0, hk: 6.0, hs: 5.0, ck: 3.72, cs: 4.0, w1: 6.4, w2: 12.0, wh: 1.6 },
    M8: { hd: 13.0, hk: 8.0, hs: 6.0, ck: 4.96, cs: 5.0, w1: 8.4, w2: 16.0, wh: 1.6 },
  };
  const nomD = (size) => parseFloat(String(size).slice(1)) || 3;
  // Schraube: Kopf oben auf z = 0 aufgesetzt (Zylinderkopf) bzw. bündig mit z = 0 (Senkkopf), Schaft nach unten (Gewinde nur angedeutet)
  function buildStdScrew(p) {
    const size = NORM[p.size] ? p.size : 'M3', n = NORM[size], s = SCREW[size], d = nomD(size), L = pos(p.length, 10);
    if (p.head === 'senk' && n.ck) {
      const rT = s.csk / 2, k = n.ck;
      let body = revolveProfile([[0, 0], [rT, 0], [d / 2, -k], [d / 2, -L], [0, -L]]);
      const sock = hexPrism(n.cs, -k * 0.75, 0.01); const r = body.cut(sock); safeDelete(body); safeDelete(sock); body = r;
      return body;
    }
    let head = R.makeCylinder(n.hd / 2, n.hk, [0, 0, 0], [0, 0, 1]);
    const sock = hexPrism(n.hs, n.hk * 0.45, n.hk + 0.01); const h2 = head.cut(sock); safeDelete(head); safeDelete(sock); head = h2;
    const shaft = R.makeCylinder(d / 2, L, [0, 0, -L], [0, 0, 1]);
    const out = head.fuse(shaft); safeDelete(head); safeDelete(shaft);
    return out;
  }
  function buildStdNut(p) {
    const size = NORM[p.size] ? p.size : 'M3', s = SCREW[size];
    const nut = hexPrism(s.nutSW, 0, s.nutH), hole = R.makeCylinder(nomD(size) / 2, s.nutH + 1, [0, 0, -0.5], [0, 0, 1]);
    const out = nut.cut(hole); safeDelete(nut); safeDelete(hole); return out;
  }
  function buildStdWasher(p) {
    const n = NORM[p.size] || NORM.M3;
    const a = R.makeCylinder(n.w2 / 2, n.wh, [0, 0, 0], [0, 0, 1]), b = R.makeCylinder(n.w1 / 2, n.wh + 1, [0, 0, -0.5], [0, 0, 1]);
    const out = a.cut(b); safeDelete(a); safeDelete(b); return out;
  }
  // Lochdurchmesser je nach Passung: eng, mittel (Standard), weit oder Kernloch zum Gewindeschneiden
  const holeD = (s, fit) => (fit === 'fine' ? s.fine : fit === 'coarse' ? s.coarse : fit === 'tap' ? s.tap : s.hole);
  const LIFT = 0.2; // Löcher ragen ein wenig über die Fläche hinaus, damit sie sauber schneiden
  function hexPrism(sw, z0, z1) {
    const r = sw / Math.sqrt(3);
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, z0]); }
    return R.basicFaceExtrusion(polygonFace(pts), new R.Vector([0, 0, z1 - z0]));
  }
  // Metrisches ISO-Regelgewinde (vereinfacht): Kern + Gewindegang als Sweep entlang einer Schraubenlinie
  const PITCH = { M2: 0.4, 'M2.5': 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25, M10: 1.5, M12: 1.75, M16: 2.0 };
  function threadShape(size, L, grow) {
    const D = (parseFloat(String(size).slice(1)) || 6) + grow, P = PITCH[size] || 1;
    const rMaj = D / 2, depth = 0.5413 * P, rMin = rMaj - depth;
    const core = R.makeCylinder(rMin + 0.01, L, [0, 0, 0], [0, 0, 1]);
    // Trapez im Schnitt (60°-Flanken, Spitze P/8 breit)
    const crest = P / 8, root = crest + 2 * depth * Math.tan(Math.PI / 6);
    const x0 = rMin - 0.05, z0 = -P;
    const pts = [[x0, 0, z0 - root / 2], [rMaj, 0, z0 - crest / 2], [rMaj, 0, z0 + crest / 2], [x0, 0, z0 + root / 2]];
    const prof = R.assembleWire([R.makeLine(pts[0], pts[1]), R.makeLine(pts[1], pts[2]), R.makeLine(pts[2], pts[3]), R.makeLine(pts[3], pts[0])]);
    const helix = R.makeHelix(P, L + 2 * P, x0, [0, 0, z0], [0, 0, 1]);
    let gang = R.genericSweep(prof, helix, { frenet: true });
    const box = R.makeCylinder(rMaj + 0.5, L, [0, 0, 0], [0, 0, 1]);
    const cut = gang.intersect(box); safeDelete(gang); safeDelete(box);
    const out = core.fuse(cut); safeDelete(core); safeDelete(cut);
    return out;
  }
  function buildPart(p) {
    const lib = p.lib;
    if (lib === 'threadRod') { const L = pos(p.length, 12); return threadShape(p.size || 'M6', L, 0); }
    if (lib === 'threadHole') {
      const L = pos(p.length, 10);
      // Innengewinde zum Drucken: etwas Luft (Spiel), durchgehend nach unten
      const s = threadShape(p.size || 'M6', L + LIFT, num(p.clear, 0.3)).translate([0, 0, -L]);
      return s;
    }
    if (lib === 'stdScrew') return buildStdScrew(p);
    if (lib === 'stdNut') return buildStdNut(p);
    if (lib === 'stdWasher') return buildStdWasher(p);
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
    if (lib === 'blindHole') {
      const d = pos(p.d, 5), L = pos(p.depth, 10), ang = num(p.tipAngle, 118);
      const r = d / 2;
      if (ang > 1 && ang < 179.5) {
        const tipH = r / Math.tan((ang * Math.PI) / 360);
        return revolveProfile([[0, -(L + tipH)], [r, -L], [r, LIFT], [0, LIFT]]);
      }
      return R.makeCylinder(r, L + LIFT, [0, 0, -L], [0, 0, 1]);
    }
    if (lib === 'fitHole') {
      // Passbohrung H7: genau das Nennmaß ohne zusätzliches Spiel
      const d = pos(p.d, 6), L = pos(p.depth, 10);
      return R.makeCylinder(d / 2, L + LIFT, [0, 0, -L], [0, 0, 1]);
    }
    if (lib === 'centerHole') {
      const c = CENTER_DRILL[p.size] || CENTER_DRILL['A2.5'];
      const r1 = c.d1 / 2, r2 = c.d2 / 2;
      const hCone = (r2 - r1) / Math.tan(Math.PI / 6); // 60°-Senkwinkel (30° halb)
      const tipH = r1 / Math.tan((118 * Math.PI) / 360); // 118°-Bohrspitze
      const z1 = -hCone, z2 = -(hCone + c.t1), z3 = z2 - tipH;
      return revolveProfile([[0, z3], [r1, z2], [r1, z1], [r2, 0], [r2, LIFT], [0, LIFT]]);
    }
    if (lib === 'holePattern') {
      // Lochbild: vier Schraubenlöcher als Quadrat (Stack) oder auf einem Lochkreis (Motor), dazu ein Mittelloch
      const PAT = { stack305: ['sq', 30.5], stack255: ['sq', 25.5], stack20: ['sq', 20], stack16: ['sq', 16], motor19: ['c', 19], motor16: ['c', 16], motor12: ['c', 12], motor9: ['c', 9] };
      const def = PAT[p.pat] || [p.pat === 'circle' ? 'c' : 'sq', pos(p.a, 20)];
      const L = pos(p.depth, 10), hd = holeD(s, p.fit || 'medium');
      const r = def[0] === 'sq' ? def[1] / Math.SQRT2 : def[1] / 2;   // Abstand der Löcher von der Mitte
      const rot = ((num(p.rot, 0) + 45) * Math.PI) / 180;
      const parts = [];
      for (let k = 0; k < 4; k++) { const a = rot + (k * Math.PI) / 2; parts.push(R.makeCylinder((hd + tol) / 2, L + LIFT, [r * Math.cos(a), r * Math.sin(a), -L], [0, 0, 1])); }
      const cd = num(p.center, def[0] === 'c' ? 7 : 0);
      if (cd > 0) parts.push(R.makeCylinder(cd / 2, L + LIFT, [0, 0, -L], [0, 0, 1]));
      return fuseAll(parts, true);
    }
    if (lib === 'zipTie') {
      // zwei Schlitze für einen Kabelbinder: das Kabel liegt dazwischen, der Binder läuft unten durch
      const w = pos(p.w, 3) + 0.4, t = pos(p.t, 1.6), gap = pos(p.gap, 6), L = pos(p.depth, 10);
      const slot = (x) => R.makeBox([x - t / 2, -w / 2, -L], [x + t / 2, w / 2, LIFT]);
      return fuseAll([slot(-(gap + t) / 2), slot((gap + t) / 2)], true);
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
    if (lib === 'goproMount') {
      // GoPro-Halterung: Finger mit M5-Loch auf einer Grundplatte (X = Schraubenachse), Mutter-Nabe am äußeren Finger
      const n = String(p.n) === '2' ? 2 : 3, t = pos(p.t, 3), g = pos(p.gap, 3.2), dh = pos(p.hole, 5.2), fw = pos(p.fw, 15), hz = Math.max(pos(p.hz, 9), dh / 2 + 1);
      const bw = pos(p.bw, 24), bd = pos(p.bd, 20), bh = pos(p.bh, 2);
      const W = n * t + (n - 1) * g, parts = [R.makeBox([-bw / 2, -bd / 2, -bh], [bw / 2, bd / 2, 0])];
      for (let i = 0; i < n; i++) {
        const x0 = -W / 2 + i * (t + g);
        parts.push(R.makeBox([x0, -fw / 2, -0.01], [x0 + t, fw / 2, hz]), R.makeCylinder(fw / 2, t, [x0, 0, hz], [1, 0, 0]));
      }
      const nut = String(p.nut) !== 'nein', nb = 4;
      if (nut) parts.push(R.makeCylinder(6.6, nb, [W / 2 - 0.01, 0, hz], [1, 0, 0]));
      let shape = fuseAll(parts, true);
      shape = shape.cut(R.makeCylinder(dh / 2, W + 2 * nb + 20, [-W / 2 - nb - 10, 0, hz], [1, 0, 0]));
      if (nut) shape = shape.cut(hexPrism(8.1, 0, 3.5 + LIFT).rotate(90, [0, 0, 0], [0, 1, 0]).translate([W / 2 + nb - 3.5, 0, hz]));
      return shape;
    }
    if (lib === 'xt60Holder') {
      // Halteplatte für einen Akkustecker: Ausschnitt mit zwei abgeschrägten Ecken (wie beim XT60), zwei Schraubenlöcher
      const w = pos(p.w, 15.5), h = pos(p.h, 8.1), f = num(p.fit, 0.3), t = pos(p.t, 3), ea = pos(p.ea, 26), dh = pos(p.hole, 3.2), wall = pos(p.wall, 2.5), ch = Math.max(0, num(p.ch, 1.5));
      const cw = w + 2 * f, cht = h + 2 * f, PW = Math.max(ea + dh + 2 * wall, cw + 2 * wall), PD = Math.max(cht + 2 * wall, dh + 2 * wall);
      let shape = R.makeBox([-PW / 2, -PD / 2, 0], [PW / 2, PD / 2, t]);
      const c = Math.min(ch, cw / 3, cht / 2), x = cw / 2, y = cht / 2;
      const outline = c > 1e-3 ? [[-x, -y], [x, -y], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c]] : [[-x, -y], [x, -y], [x, y], [-x, y]];
      shape = shape.cut(R.basicFaceExtrusion(polygonFace(outline.map(([u, v]) => [u, v, -1])), new R.Vector([0, 0, t + 2])));
      for (const sx of [-1, 1]) shape = shape.cut(R.makeCylinder(dh / 2, t + 2, [(sx * ea) / 2, 0, -1], [0, 0, 1]));
      return shape;
    }
    if (lib === 'antennaMount') {
      // Antennenhalter: Grundplatte mit einem oder zwei Röhrchen, V-förmig gespreizt und nach hinten geneigt
      const n = String(p.n) === '1' ? 1 : 2, di = pos(p.di, 3.5), wall = pos(p.wall, 1.2), L = pos(p.len, 20), sp = (num(p.spread, 90) * Math.PI) / 180, lean = (num(p.lean, 30) * Math.PI) / 180;
      const s2 = n === 1 ? 0 : pos(p.s, 10) / 2, bw = pos(p.bw, 22), bd = pos(p.bd, 12), bh = pos(p.bh, 2), ro = di / 2 + wall;
      const parts = [R.makeBox([-bw / 2, -bd / 2, -bh], [bw / 2, bd / 2, 0])], holes = [];
      for (let k = 0; k < n; k++) {
        const sx = n === 1 ? 0 : k ? 1 : -1, ph = n === 1 ? 0 : sp / 2;
        const d = [sx * Math.sin(ph), Math.cos(ph) * Math.sin(lean), Math.cos(ph) * Math.cos(lean)];   // vorne ist −Y, also nach hinten = +Y
        const base = [sx * s2, 0, 0], start = [base[0] - d[0] * ro, base[1] - d[1] * ro, base[2] - d[2] * ro];
        parts.push(R.makeCylinder(ro, L + ro, start, d));
        holes.push(R.makeCylinder(di / 2, L + 1, [base[0] + d[0] * 1.2, base[1] + d[1] * 1.2, base[2] + d[2] * 1.2], d));
      }
      let shape = fuseAll(parts, true);
      for (const hh of holes) shape = shape.cut(hh);
      const big = 4 * (L + bw + bd);
      return shape.cut(R.makeBox([-big, -big, -big], [big, big, -bh]));
    }
    if (lib === 'gear') {
      return buildGear(p);
    }
    if (lib === 'aeroBody') return buildAeroBody(p);
    if (lib === 'armFairing') return buildArmFairing(p);
    if (lib === 'motorFairing') return buildMotorFairing(p);
    if (typeof lib === 'string' && lib.startsWith('buy')) return buildBuy(lib, p);
    throw new Error('Unbekanntes Bauteil: ' + lib);
  }
  // ---------- Stromlinien-Armverkleidung ----------
  // Symmetrisches NACA-Profil (4-stellige Reihe, geschlossene Hinterkante): Profiltiefe in Flugrichtung (Y, Nase nach −Y),
  // Dicke in Z; so dick, dass der Arm (Breite aw quer zur Länge, Dicke at) mit Wand hineinpasst. Längs X auf Länge len
  // gezogen, innen ein Schlitz für den Arm. Die dickste Stelle (30 % der Tiefe) liegt auf der Armmitte (y = 0).
  function nacaHalf(x) { return 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x); }
  function fairingSize(p) {
    const aw = pos(p.aw, 14), at = pos(p.at, 5), wall = pos(p.wall, 1), L = pos(p.len, 60);
    const cMin = (aw + 2 * wall) / 0.6 * 1.05;
    const c = Math.max(cMin, num(p.chord, 0) > 0 ? num(p.chord, 0) : 2.4 * aw);
    const h = at / 2 + wall, x1 = (0.3 * c - aw / 2 - wall) / c, x2 = (0.3 * c + aw / 2 + wall) / c;
    const T = Math.max(h / (c * nacaHalf(0.3)), h / (c * nacaHalf(Math.max(0.005, x1))), h / (c * nacaHalf(Math.min(0.995, x2))));
    return { aw, at, wall, L, c, T };
  }
  function buildArmFairing(p) {
    const { aw, at, L, c, T } = fairingSize(p);
    const P = (x, z) => [-L / 2, -0.3 * c + x * c, z];   // Profil in der Ebene x = −L/2
    const n = 36, up = [], lo = [];
    for (let i = 0; i <= n; i++) { const x = (1 - Math.cos((Math.PI * i) / n)) / 2; up.push(P(x, T * c * nacaHalf(x))); }
    for (let i = n; i >= 0; i--) { const x = (1 - Math.cos((Math.PI * i) / n)) / 2; lo.push(P(x, -T * c * nacaHalf(x))); }
    // glatte Kurve genau durch die Punkte: je Abschnitt ein kubisches Bézier-Stück (Catmull-Rom nach Bogenlänge)
    const bz = (pts) => {
      const m = pts.length, E = [], Q = (i) => (i < 0 ? pts[0].map((v, k) => 2 * v - pts[1][k]) : i > m - 1 ? pts[m - 1].map((v, k) => 2 * v - pts[m - 2][k]) : pts[i]);
      const dist = (a, b2) => Math.max(1e-9, Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]));
      for (let i = 0; i < m - 1; i++) {
        const p0 = Q(i - 1), p1 = Q(i), p2 = Q(i + 1), p3 = Q(i + 2), t1 = dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3), dt = t2 - t1;
        const m1 = [0, 1, 2].map((k) => ((p1[k] - p0[k]) / t1 - (p2[k] - p0[k]) / t2 + (p2[k] - p1[k]) / dt) * dt);
        const m2 = [0, 1, 2].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
        E.push(R.makeBezierCurve([p1, p1.map((v, k) => v + m1[k] / 3), p2.map((v, k) => v - m2[k] / 3), p2]));
      }
      return E;
    };
    const face = R.makeFace(R.assembleWire([...bz(up), ...bz(lo)]));
    const body = R.basicFaceExtrusion(face, new R.Vector([L, 0, 0]));
    const slot = R.makeBox([-L / 2 - 1, -aw / 2 - 0.15, -at / 2 - 0.15], [L / 2 + 1, aw / 2 + 0.15, at / 2 + 0.15]);   // 0,15 mm Spiel je Seite
    const out = body.cut(slot); safeDelete(body); safeDelete(slot);
    return out;
  }
  // ---------- Motorverkleidung ----------
  // Becher um den Motor (Achse +Z, Motorfuß auf z = 0 = Oberseite des Arms): oben offen für den Propeller, außen ein Zylinder
  // bis unter den Arm, darunter ein Heck, das parabelförmig spitz zuläuft. Innen hohl (Wand), seitlich ein Schlitz für den
  // Arm (zeigt nach +X) – er geht bis zum oberen Rand, damit die Hülle von unten über Arm und Motor geschoben wird.
  function motorFairingSize(p) {
    const d = pos(p.d, 28), gap = Math.max(0, num(p.gap, 0.5)), wall = pos(p.wall, 1.2), h = pos(p.h, 18);
    const aw = pos(p.aw, 12), at = pos(p.at, 5), tail = Math.max(2 * wall + 1, pos(p.tail, 30));
    return { d, gap, wall, h, aw, at, tail, ri: d / 2 + gap, ro: d / 2 + gap + wall };
  }
  function buildMotorFairing(p) {
    const { wall, h, aw, at, tail, ri, ro } = motorFairingSize(p);
    const P = (r, z) => [r, 0, z], n = 20;
    const solid = (r, zt, zb, L) => {
      const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push(P(r * (1 - t * t), zb - t * L)); }
      const e = [R.makeLine(P(0, zt), P(r, zt)), R.makeLine(P(r, zt), P(r, zb)), R.makeBSplineApproximation(pts, { tolerance: 1e-3, degMax: 3, degMin: 2 }), R.makeLine(P(0, zb - L), P(0, zt))];
      return R.revolution(R.makeFace(R.assembleWire(e)), [0, 0, 0], [0, 0, 1], 360);
    };
    const so = solid(ro, h, -at, tail), si = solid(ri, h + 1, -at, tail - 2 * wall);
    const slot = R.makeBox([0, -aw / 2 - 0.15, -at - 0.15], [ro + 1, aw / 2 + 0.15, h + 1]);
    let out = so.cut(si); safeDelete(so); safeDelete(si);
    const r = out.cut(slot); safeDelete(out); safeDelete(slot);
    return r;
  }
  // ---------- Stromlinien-Rumpf ----------
  // Drehkörper längs der Y-Achse (Nase nach −Y), Achse auf z = 0, Mittelteil mittig um y = 0:
  // Nase als halbe Ellipse von der Öffnung (dn) bis zum Durchmesser d, zylindrisches Mittelteil, langes Heck,
  // das parabelförmig bis zur Heck-Öffnung dt ausläuft. Glatte Flächen (B-Splines), hohl mit Wandstärke wall.
  function aeroSolid(Rr, rn, rt, ln, lc, lt, ext = 0) {
    const n = 24, P = (r, z) => [r, 0, z], L = ln + lc + lt;
    const nose = [], tail = [];
    for (let i = 0; i <= n; i++) { const t = i / n; nose.push(P(rn + (Rr - rn) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))), t * ln)); }
    for (let i = 0; i <= n; i++) { const t = i / n; tail.push(P(Rr - (Rr - rt) * t * t, ln + lc + t * lt)); }
    const sp = (pts) => R.makeBSplineApproximation(pts, { tolerance: 1e-3, degMax: 3, degMin: 2 });
    const e = [];
    if (ext) e.push(R.makeLine(P(0, -ext), P(rn, -ext)), R.makeLine(P(rn, -ext), P(rn, 0)));
    else e.push(R.makeLine(P(0, 0), P(rn, 0)));
    e.push(sp(nose));
    if (lc > 0.01) e.push(R.makeLine(P(Rr, ln), P(Rr, ln + lc)));
    e.push(sp(tail));
    if (ext) e.push(R.makeLine(P(rt, L), P(rt, L + ext)), R.makeLine(P(rt, L + ext), P(0, L + ext)), R.makeLine(P(0, L + ext), P(0, -ext)));
    else e.push(R.makeLine(P(rt, L), P(0, L)), R.makeLine(P(0, L), P(0, 0)));
    const face = R.makeFace(R.assembleWire(e));
    return R.revolution(face, [0, 0, 0], [0, 0, 1], 360);
  }
  function buildAeroBody(p) {
    const d = pos(p.d, 60), Rr = d / 2, wall = Math.min(pos(p.wall, 1.6), Rr / 3);
    const ln = pos(p.ln, 50), lc = Math.max(0, num(p.lc, 100)), lt = pos(p.lt, 90);
    const rn = Math.min(Math.max(pos(p.dn, 30) / 2, wall + 0.5), Rr - 0.5), rt = Math.min(Math.max(pos(p.dt, 18) / 2, wall + 0.5), Rr - 0.5);
    const so = aeroSolid(Rr, rn, rt, ln, lc, lt);
    const si = aeroSolid(Rr - wall, rn - wall, rt - wall, ln, lc, lt, 1);
    const b = so.cut(si); safeDelete(so); safeDelete(si);
    // längs legen: Höhe des Drehkörpers → +Y, Spitze vorne
    return b.rotate(-90, [0, 0, 0], [1, 0, 0]).translate([0, -(lc / 2 + ln), 0]);
  }
  // ---------- Kaufteile mit ihrer echten Form ----------
  // Alle stehen mitten auf z = 0 und bleiben in ihren Datenblatt-Maßen (Breite w, Tiefe d, Höhe h bzw. Durchmesser d).
  // Vorne ist −Y (Objektive zeigen dorthin). Das Gewicht kommt weiter aus dem Datenblatt, nicht aus dem Volumen.
  function cutAll(base, tools) {
    tools = tools.filter(Boolean); if (!tools.length) return base;
    const t = fuseAll(tools, true); let r = base;
    try { r = base.cut(t); safeDelete(base); } catch (_) { r = base; }
    safeDelete(t); return r;
  }
  function roundBox(w, d, h, r, x0 = 0, y0 = 0, z0 = 0, rTop = 0) {
    let b = R.makeBox([x0 - w / 2, y0 - d / 2, z0], [x0 + w / 2, y0 + d / 2, z0 + h]);
    const tol = 1e-4;
    if (r > 0.05) { try { const n = b.fillet((e) => { const a = e.startPoint, c = e.endPoint; return e.geomType === 'LINE' && Math.abs(a.x - c.x) < tol && Math.abs(a.y - c.y) < tol ? Math.min(r, w / 2 - 0.05, d / 2 - 0.05) : 0; }); safeDelete(b); b = n; } catch (_) {} }
    if (rTop > 0.05) { try { const n = b.fillet((e) => { const a = e.startPoint, c = e.endPoint, m = e.pointAt(0.5); return Math.abs(a.z - (z0 + h)) < tol && Math.abs(c.z - (z0 + h)) < tol && Math.abs(m.z - (z0 + h)) < tol ? rTop : 0; }); safeDelete(b); b = n; } catch (_) {} }
    return b;
  }
  const cyl = (r, h, x, y, z, dir = [0, 0, 1]) => R.makeCylinder(r, h, [x, y, z], dir);
  function buildBuy(lib, p) {
    if (lib === 'buyMotor') {
      // Außenläufer: Fuß mit Gewindelöchern, sichtbarer Stator-Spalt, Glocke mit Lüftungslöchern, Welle
      const D = pos(p.d, 28.5), H = pos(p.h, 19.7), lk = num(p.lk, 16), s = SCREW[p.size] || SCREW.M3;
      const hb = Math.max(1.5, H * 0.16), gap = Math.min(1.5, H * 0.08);
      const shaftD = D >= 25 ? 5 : D >= 19 ? 3 : 1.5, shaftL = D >= 25 ? 9 : 5;
      const parts = [
        cyl(D / 2 - 0.6, hb, 0, 0, 0),
        cyl(D / 2 - 1.8, gap + 0.2, 0, 0, hb - 0.1),
        cyl(D / 2, H - hb - gap - 0.8, 0, 0, hb + gap),
        cyl(D / 2 - 1.1, 0.9, 0, 0, H - 0.9),
        cyl(shaftD / 2, shaftL + 0.5, 0, 0, H - 0.5),
      ];
      let m = fuseAll(parts, true);
      const tools = [];
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6, rr = D * 0.29; tools.push(cyl(D * 0.075, 2.5, rr * Math.cos(a), rr * Math.sin(a), H - 1.6)); }
      if (lk > 0 && lk / 2 + s.tap / 2 < D / 2 - 0.8) for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; tools.push(cyl(s.tap / 2, Math.min(hb - 0.4, 4) + 0.2, (lk / 2) * Math.cos(a), (lk / 2) * Math.sin(a), -0.2)); }
      return cutAll(m, tools);
    }
    if (lib === 'buyBattery') {
      // LiPo-Pack: abgerundete Kanten, Schrumpfschlauch-Kante oben
      const w = pos(p.w, 35), d = pos(p.d, 75), h = pos(p.h, 30);
      return roundBox(w, d, h, Math.min(3, w / 6, h / 4), 0, 0, 0, Math.min(1.5, h / 8));
    }
    if (lib === 'buyCamera') {
      // FPV-Kamera: Gehäuse, Objektiv nach vorne (−Y), seitliche Gewinde M2
      const w = pos(p.w, 19), d = pos(p.d, 20), h = pos(p.h, 19);
      const lensL = Math.min(8, Math.max(2.5, d * 0.28)), lensD = Math.min(num(p.lens, Math.min(w, h) * 0.68), Math.min(w, h) - 0.6);
      const bodyD = d - lensL;
      let c = roundBox(w, bodyD, h, Math.min(1.5, w / 8), 0, d / 2 - bodyD / 2, 0);
      const lens = cyl(lensD / 2, lensL + 0.5, 0, -d / 2 + lensL + 0.5, h / 2, [0, -1, 0]);
      c = fuseAll([c, lens], true);
      const tools = [cyl(lensD / 2 - 0.8, 0.8, 0, -d / 2 - 0.1, h / 2, [0, 1, 0])];
      if (w >= 12) { const yc = d / 2 - bodyD / 2; tools.push(cyl(0.8, 3.2, -w / 2 - 0.2, yc, h / 2, [1, 0, 0]), cyl(0.8, 3.2, w / 2 + 0.2, yc, h / 2, [-1, 0, 0])); }
      return cutAll(c, tools);
    }
    if (lib === 'buyStack') {
      // Flugsteuerung über ESC: zwei Platinen, Gummi-Dämpfer, Bauteile, Befestigungslöcher
      const a = pos(p.a, 30.5), S = a + 5.5, H = Math.max(6, pos(p.h, 12)), t = 1.6, s = SCREW[p.size] || SCREW.M3;
      const top = H - 1;   // Oberkante der oberen Platine – Bauteile darauf reichen genau bis H
      const parts = [R.makeBox([-S / 2, -S / 2, 0], [S / 2, S / 2, t]), R.makeBox([-S / 2, -S / 2, top - t], [S / 2, S / 2, top])];
      for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) parts.push(cyl(Math.min(2.6, S * 0.07), top - 2 * t + 0.2, (x * a) / 2, (y * a) / 2, t - 0.1));
      const mos = Math.min(6, S * 0.17);
      for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) parts.push(R.makeBox([x * a * 0.28 - mos / 2, y * a * 0.28 - mos / 2, t - 0.05], [x * a * 0.28 + mos / 2, y * a * 0.28 + mos / 2, t + 1]));
      const mcu = Math.min(7, S * 0.22);
      parts.push(R.makeBox([-mcu / 2, -mcu / 2, top - 0.05], [mcu / 2, mcu / 2, H]));
      parts.push(R.makeBox([S * 0.18, -S * 0.12, top - 0.05], [S * 0.18 + 3, -S * 0.12 + 3, H - 0.1]));
      let st = fuseAll(parts, true);
      const holes = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, y]) => cyl(s.hole / 2, H + 2, (x * a) / 2, (y * a) / 2, -0.5));
      return cutAll(st, holes);
    }
    if (lib === 'buyVtx') {
      // Digitaler Videosender: Gehäuse mit Kühlrippen oben, Befestigungslöcher im Lochbild
      const w = pos(p.w, 30), d = pos(p.d, 30), h = pos(p.h, 12), a = num(p.a, 0);
      let v = roundBox(w, d, h, Math.min(2.5, w / 8));
      const tools = [];
      if (h >= 7) { const depth = Math.min(2, h * 0.18), n = Math.max(3, Math.floor((w - 6) / 2.6)); const span = (n - 1) * 2.6; for (let k = 0; k < n; k++) tools.push(R.makeBox([-span / 2 + k * 2.6 - 0.6, -d / 2 + 3, h - depth], [-span / 2 + k * 2.6 + 0.6, d / 2 - 3, h + 0.5])); }
      if (a > 0 && a < Math.min(w, d)) for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) tools.push(cyl(1.1, h + 1, (x * a) / 2, (y * a) / 2, -0.5));
      return cutAll(v, tools);
    }
    if (lib === 'buyPcb') {
      // kleine Platine (analoger Sender, Empfänger): Leiterplatte mit Abschirmblech und Bauteilen
      const w = pos(p.w, 25), d = pos(p.d, 37), h = pos(p.h, 5), t = Math.min(1.2, h * 0.3);
      const parts = [R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, t])];
      const cw = w * 0.72, cd = d * 0.55;
      parts.push(R.makeBox([-cw / 2, -d / 2 + 2, t - 0.05], [cw / 2, -d / 2 + 2 + cd, h]));
      parts.push(R.makeBox([-w * 0.3, d / 2 - d * 0.22, t - 0.05], [w * 0.05, d / 2 - 1.5, t + Math.min(1.6, h - t)]));
      return fuseAll(parts, true);
    }
    if (lib === 'buyGps') {
      // GPS: Platine mit Keramik-Patchantenne oben
      const w = pos(p.w, 15), d = pos(p.d, 15), h = pos(p.h, 5.2), t = Math.min(1, h * 0.2);
      const pw = Math.min(w, d) * 0.82, ph = Math.max(0.6, h - t - 0.3);
      const parts = [R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, t]), roundBox(pw, pw, ph, 0.6, 0, 0, t - 0.05, Math.min(0.4, ph / 3)), cyl(Math.max(0.5, pw * 0.06), 0.3 + 0.05, pw * 0.12, 0, t + ph - 0.05)];
      return fuseAll(parts, true);
    }
    if (lib === 'buyActioncam') {
      // Action-Kamera: abgerundetes Gehäuse, Objektiv vorne (−Y)
      const w = pos(p.w, 70), d = pos(p.d, 33), h = pos(p.h, 50);
      const lensL = Math.min(4, d * 0.15), bodyD = d - lensL;
      const pill = h / w > 1.6;
      let c = roundBox(w, bodyD, h, pill ? Math.min(w, bodyD) / 2 - 0.3 : Math.min(5, w / 8, bodyD / 4), 0, d / 2 - bodyD / 2, 0);
      const lr = Math.min(w, h) * (pill ? 0.3 : 0.17), lx = pill ? 0 : w * 0.22, lz = pill ? h * 0.72 : h * 0.62;
      c = fuseAll([c, cyl(lr, lensL + 0.5, lx, -d / 2 + lensL + 0.5, lz, [0, -1, 0])], true);
      return cutAll(c, [cyl(lr * 0.72, 0.8, lx, -d / 2 - 0.1, lz, [0, 1, 0])]);
    }
    if (lib === 'buyPlug') {
      // Akkustecker (XT60/XT30): Gehäuse mit zwei abgeschrägten Ecken und zwei Kontakten vorne
      const w = pos(p.w, 15.5), d = pos(p.d, 21.5), h = pos(p.h, 8.1);
      let b = R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, h]);
      try { const c = Math.min(w, h) * 0.25; const n = b.chamfer((e) => { const a = e.startPoint, q = e.endPoint; return e.geomType === 'LINE' && Math.abs(a.y - q.y) > 1 && a.x > 0 && q.x > 0 && Math.abs(a.x - q.x) < 1e-4 && Math.abs(a.z - q.z) < 1e-4 ? c : 0; }); safeDelete(b); b = n; } catch (_) {}
      const pr = Math.min(h * 0.22, w * 0.14);
      return cutAll(b, [cyl(pr, 7, -w * 0.22, -d / 2 - 0.1, h / 2, [0, 1, 0]), cyl(pr, 7, w * 0.22, -d / 2 - 0.1, h / 2, [0, 1, 0])]);
    }
    if (lib === 'buyAntenna') {
      // Antenne nach oben (+Z): Stecker (SMA mit Sechskant, sonst nur Kabelende), Röhrchen, oben Pilzkopf oder nur ein runder Abschluss
      const L = pos(p.L, 45), d = pos(p.d, 3), kd = pos(p.kd, 14), kl = pos(p.kl, 12), pilz = p.form !== 'stab', sma = p.conn !== 'ufl';
      const parts = []; let z = 0;
      if (sma) { parts.push(hexPrism(8, 0, 3), cyl(3.2, 8.5, 0, 0, 0)); z = 8.5; }
      const tube = Math.max(1, L - z - (pilz ? kl : d / 2));
      parts.push(cyl(d / 2, tube + (pilz ? 0.5 : 0), 0, 0, z)); z += tube;
      if (pilz) {
        let head = cyl(kd / 2, kl, 0, 0, z);
        try { const r = Math.min(kd / 2, kl / 2) * 0.9; const h2 = head.fillet(r); head = h2; } catch (_) {}
        parts.push(head);
      } else parts.push(R.makeSphere(d / 2).translate([0, 0, z]));
      return fuseAll(parts, true);
    }
    if (lib === 'buyCap') {
      // Elko: Becher mit Sicke und Sollbruchkreuz oben
      const D = pos(p.d, 12.5), H = pos(p.h, 20);
      let c = cyl(D / 2, H, 0, 0, 0);
      const ring = cutAll(cyl(D / 2 + 0.5, 0.7, 0, 0, H - 2.2), [cyl(D / 2 - 0.35, 1, 0, 0, H - 2.4)]);
      return cutAll(c, [ring, R.makeBox([-D * 0.3, -0.2, H - 0.3], [D * 0.3, 0.2, H + 0.5]), R.makeBox([-0.2, -D * 0.3, H - 0.3], [0.2, D * 0.3, H + 0.5])]);
    }
    if (lib === 'buyProp') {
      // Propeller: Nabe mit Wellenloch, Blätter mit Anstellwinkel, dünner Ring für den Propellerkreis
      const zoll = pos(p.zoll, 5), D = zoll * 25.4, Rr = D / 2, n = Math.max(2, Math.min(6, Math.round(num(p.blades, 3))));
      const hubD = Math.max(7, zoll * 2.4), hubH = zoll * 1.2 + 0.5, t = Math.max(0.8, zoll * 0.22), pitch = num(p.pitch, 13);
      const c = D * 0.115, r0 = hubD / 2 - 1.5;
      const pts = [[r0, -c * 0.32], [Rr * 0.38, -c * 0.5], [Rr * 0.82, -c * 0.38], [Rr - c * 0.12, -c * 0.16], [Rr, 0], [Rr - c * 0.12, c * 0.16], [Rr * 0.82, c * 0.34], [Rr * 0.38, c * 0.46], [r0, c * 0.3]];
      const parts = [cyl(hubD / 2, hubH, 0, 0, 0)];
      for (let k = 0; k < n; k++) {
        let b = R.basicFaceExtrusion(polygonFace(pts.map(([x, y]) => [x, y, -t / 2])), new R.Vector([0, 0, t]));
        b = b.rotate(pitch, [0, 0, 0], [1, 0, 0]).translate([0, 0, hubH / 2]);
        if (k) b = b.rotate((360 / n) * k, [0, 0, 0], [0, 0, 1]);
        parts.push(b);
      }
      let pr = fuseAll(parts, true);
      pr = cutAll(pr, [cyl(Math.min(2.6, hubD * 0.2), hubH + 2, 0, 0, -1)]);
      const ring = cutAll(cyl(Rr, 0.6, 0, 0, hubH / 2 - 0.3), [cyl(Rr - 0.7, 1, 0, 0, hubH / 2 - 0.5)]);
      return R.makeCompound([pr, ring]);
    }
    throw new Error('Unbekanntes Kaufteil: ' + lib);
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
  // fin.vr + fin.r2: Rundung, die entlang der Kante von r nach r2 wächst; Fase mit fin.cm 'two' (zwei Abstände r, r2)
  // oder 'angle' (Abstand r und Winkel fin.a) – gemessen auf einer der beiden Nachbarflächen (fin.side 0/1)
  function tryFinish(shape, type, r, matcher, fin = {}) {
    if (type === 'fillet' && fin.vr) {
      const r2 = num(fin.r2, r) * (r / Math.max(1e-9, num(fin.r, r)));   // beim Suchen des größten Werts beide Enden gleich verkleinern
      if (r2 > 0 && Math.abs(r2 - r) > 1e-9) return shape.fillet((e) => (matcher(e) ? [r, r2] : 0));
    }
    if (type === 'chamfer' && (fin.cm === 'two' || fin.cm === 'angle')) return chamferAsym(shape, r, matcher, fin);
    const f = (e) => (matcher(e) ? r : 0);
    return type === 'chamfer' ? shape.chamfer(f) : shape.fillet(f);
  }
  function chamferAsym(shape, d1, matcher, fin) {
    const builder = new oc.BRepFilletAPI_MakeChamfer(shape.wrapped);
    const faces = shape.faces, fe = faces.map((f) => f.edges);
    const key = (f) => { const c = vec(f.center); return [Math.round(c[2] * 1e3), Math.round(c[1] * 1e3), Math.round(c[0] * 1e3)]; };
    const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
    const d2 = fin.cm === 'two' ? num(fin.r2, d1) * (d1 / Math.max(1e-9, num(fin.r, d1))) : 0, ang = (num(fin.a, 45) * Math.PI) / 180;
    let n = 0;
    try {
      for (const e of shape.edges) {
        if (!matcher(e)) continue;
        const adj = faces.filter((f, i) => fe[i].some((x) => x.isSame(e))).sort(cmp);
        if (!adj.length) continue;
        const f = adj[Math.min(fin.side ? 1 : 0, adj.length - 1)];
        if (fin.cm === 'angle') builder.AddDA(d1, ang, e.wrapped, f.wrapped); else builder.Add(d1, d2 > 0 ? d2 : d1, e.wrapped, f.wrapped);
        n++;
      }
      if (!n) throw new Error('Keine Kante für die Fase.');
      return R.cast(builder.Shape());
    } finally { builder.delete(); }
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
      if (fin.type === 'draft') { shape = applyDraft(shape, fin, errors, itemId); continue; }
      const r = num(fin.r, 1);
      if (!(r > 0)) continue;
      let matcher;
      try { matcher = makeEdgeMatcher(fin.edges, shape); } catch (e) { continue; }
      let count = 0;
      try { for (const e of shape.edges) if (matcher(e)) count++; } catch (_) {}
      if (!count) { errors.push({ itemId, finishId: fin.id, code: 'edges', message: 'Die gewählten Kanten gibt es nicht mehr.' }); continue; }
      try {
        shape = tryFinish(shape, fin.type, r, matcher, fin);
      } catch (err) {
        // größten möglichen Wert suchen
        let lo = 0, hi = r;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          try { const t = tryFinish(shape, fin.type, mid, matcher, fin); t.delete(); lo = mid; } catch (_) { hi = mid; }
        }
        const max = Math.floor(lo * 10) / 10;
        errors.push({ itemId, finishId: fin.id, code: 'toobig', max, message: max > 0 ? `${fin.type === 'chamfer' ? 'Die Fase' : 'Die Rundung'} ist zu groß. Möglich sind höchstens ${String(max).replace('.', ',')} mm.` : `${fin.type === 'chamfer' ? 'Diese Fase' : 'Diese Rundung'} lässt sich an diesen Kanten nicht bauen.` });
      }
    }
    return shape;
  }

  // Entformungsschräge: alle senkrechten Seitenflächen um den Winkel neigen, unten (kleinstes Z) bleibt die Kontur
  function applyDraft(shape, fin, errors, itemId) {
    const ang = num(fin.r, 3);
    if (!(Math.abs(ang) > 1e-6) || Math.abs(ang) >= 45) { errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge muss zwischen 0 und 45° liegen.' }); return shape; }
    const b = bboxOf(shape), z0 = b[2];
    const dir = R.asDir([0, 0, 1]), pln = new oc.gp_Pln(R.asPnt([0, 0, z0]), dir);
    const builder = new oc.BRepOffsetAPI_DraftAngle(shape.wrapped);
    let n = 0;
    try {
      for (const f of shape.faces) {
        let nz = 1; try { const v = f.normalAt(); nz = v.z; } catch (_) {}
        if (Math.abs(nz) < 0.02) { builder.Add(f.wrapped, dir, (ang * Math.PI) / 180, pln, true); n++; }
      }
      if (!n) { errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Dieser Körper hat keine senkrechten Seitenflächen für eine Schräge.' }); return shape; }
      builder.Build();
      if (!builder.IsDone || (typeof builder.IsDone === 'function' && !builder.IsDone())) throw new Error('draft');
      const out = R.cast(builder.Shape());
      return out;
    } catch (e) {
      errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge lässt sich an diesem Körper nicht bauen – versuch einen kleineren Winkel oder zuerst ohne Rundungen.' });
      return shape;
    } finally { try { builder.delete(); pln.delete(); dir.delete(); } catch (_) {} }
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
      // Drehachse: senkrecht (Standard), quer, längs – oder eine im Bild gewählte Achse (Kante, Welle, Loch)
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [num(p.cx, 0), num(p.cy, 0), num(p.cz, 0)];
      for (let k = 1; k < n; k++) copies.push(base.clone().rotate(k * step, c, ax));
    } else if (p.pt === 'path' && Array.isArray(p.places)) {
      // Muster entlang Kurve: Lage und Drehung je Kopie kommen fertig aus dem Modell
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      for (const q of p.places.slice(1, 200)) {
        let c = base.clone();
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) c = c.rotate(Number(q.a), p0, ax);
        const d = (q.d || [0, 0, 0]).map(Number);
        if (Math.hypot(d[0], d[1], d[2]) > 1e-9) c = c.translate(d);
        copies.push(c);
      }
    } else if (p.pt === 'mirror' && p.plane === 'FACE' && Array.isArray(p.mn) && Array.isArray(p.mo)) {
      const mn = p.mn.map(Number); let mo = p.mo.map(Number);
      if (p.bind) {
        // an die Fläche gebunden: die äußerste ebene Fläche mit dieser Richtung – wächst das Original, wandert die Ebene mit
        let best = -Infinity;
        try {
          for (const f of base.faces) {
            if (f.geomType !== 'PLANE') continue;
            const v = f.normalAt(); if (v.x * mn[0] + v.y * mn[1] + v.z * mn[2] < 0.9999) continue;
            const c = f.center, d = c.x * mn[0] + c.y * mn[1] + c.z * mn[2];
            if (d > best) { best = d; mo = [c.x, c.y, c.z]; }
          }
        } catch (_) {}
      }
      copies.push(base.clone().mirror(mn, mo));
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
    let p = it.p;
    if (it.kind === 'import' && p && (p.blobId || p.bytes)) {
      p = { fmt: p.fmt, scale: p.scale, blobId: p.blobId || hashBytes(p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes)) };
    }
    return keyOf({ k: it.kind, p, f: it.finishes || null, mir: it.mir || null, c: it.children ? it.children.filter((c) => !c.hidden).map((c) => [defKey(c), c.role, c.m]) : null });
  }
  function evalItem(it, errors) {
    if (it.kind === 'transform') return { shape: null, key: defKey(it) };
    const key = defKey(it);
    const hit = cacheGet(key);
    if (hit) {
      // Meldungen beim Bauen (z. B. „Rundung zu groß“) gelten weiter, auch wenn die Form aus dem Speicher kommt
      const e = cache.get(key).errs;
      if (e) for (const x of e) errors.push({ ...x, itemId: x.itemId === '$self' ? it.id : x.itemId });
      return { shape: hit, key };
    }
    const e0 = errors.length;
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
      else if (it.kind === 'loft') shape = buildLoft(it.p);
      else if (it.kind === 'sweep') shape = buildSweep(it.p);
      else if (it.kind === 'import') shape = buildImport(it.p);
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
    if (shape) cachePut(key, shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })));
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
      } else if (type === 'CONE') {
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const pt = (u, v) => { const p = face.pointOnSurface(u, v); return [p.x, p.y, p.z]; };
        const tri = (v, swap) => {
          const A = swap ? pt(v, 0.15) : pt(0.15, v);
          const B = swap ? pt(v, 0.45) : pt(0.45, v);
          const C = swap ? pt(v, 0.75) : pt(0.75, v);
          const a = sub(B, A), b = sub(C, A), n = crs(a, b), n2 = dot(n, n);
          return { A, a, b, n, n2, v, swap };
        };
        let best = tri(0.25, false);
        const alt = tri(0.75, false);
        if (alt.n2 > best.n2) best = alt;
        if (best.n2 < 1e-10) {
          const s1 = tri(0.25, true), s2 = tri(0.75, true);
          best = s2.n2 > s1.n2 ? s2 : s1;
        }
        if (best.n2 >= 1e-10) {
          const { A, a, b, n, n2, v, swap } = best;
          const a2 = dot(a, a), b2 = dot(b, b), bn = crs(b, n), na = crs(n, a);
          const x = [0, 1, 2].map((k) => (a2 * bn[k] + b2 * na[k]) / (2 * n2));
          const O1 = [A[0] + x[0], A[1] + x[1], A[2] + x[2]];
          const R1 = Math.hypot(x[0], x[1], x[2]);
          const nl = Math.sqrt(n2);
          const D = [n[0] / nl, n[1] / nl, n[2] / nl];
          const v2 = v === 0.25 ? 0.75 : 0.25;
          const Q = swap ? pt(v2, 0.45) : pt(0.45, v2);
          const vq = sub(Q, O1), z2 = dot(vq, D);
          const R2 = Math.hypot(vq[0] - z2 * D[0], vq[1] - z2 * D[1], vq[2] - z2 * D[2]);
          info.axis = [O1[0], O1[1], O1[2], D[0], D[1], D[2]];
          if (Math.abs(z2) > 1e-7) {
            const slope = (R2 - R1) / z2;
            info.coneR = R1;
            info.semiAngle = Math.atan(slope);
          }
        }
      } else if (type === 'TORUS') {
        const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
        const to = ad.Torus(); const ax = to.Axis(); const l = ax.Location(), d = ax.Direction();
        info.axis = [l.X(), l.Y(), l.Z(), d.X(), d.Y(), d.Z()];
        ad.delete();
      } else if (type === 'SPHERE') {
        const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
        const sp = ad.Sphere(); const l = sp.Location();
        info.sc = [l.X(), l.Y(), l.Z()]; info.r = sp.Radius();
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
  // Formschritte mit Modus: Ein Teil mit op = {type: 'join' | 'cut' | 'common', target} wird mit einem früheren
  // Körper verrechnet und verschwindet als eigenes Teil. Ketten (B in A, C in B) landen alle im ersten Körper.
  // Ergebnis: bodies (id → {shape, key, wb} im Koordinatensystem des Zielkörpers), consumed (id → Ziel-id)
  function resolveOps(evald, errors, hiddenIds) {
    const byId = new Map(evald.map((e, i) => [e.it.id, { e, i }]));
    const consumed = new Map(), live = new Map(), bodies = new Map();
    for (const e of evald) if (e.shape) live.set(e.it.id, { shape: e.shape, key: e.key, wb: e.wb, m: e.it.m, it: e.it });
    const NAMES = { join: 'Vereinigen', cut: 'Abziehen', common: 'Schnittmenge' };
    for (let i = 0; i < evald.length; i++) {
      const e = evald[i], it = e.it;
      if (it.kind === 'transform') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape) {
          if (!p.copy && tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Verschieben/Drehen: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        const M = buildTransformMatrix(p, src.wb);
        if (p.copy) {
          const rel = matMul(matInvRigid(it.m), matMul(M, src.m));
          const kBase = keyOf([src.key, 'xformCopy', rel.map((v) => Math.round(v * 1e6) / 1e6)]);
          let shape = cacheGet(kBase), key = kBase;
          if (!shape) {
            try { shape = applyMatrix(src.shape, rel); cachePut(kBase, shape); }
            catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
          }
          if (it.finishes && it.finishes.length) {
            const kFin = keyOf([key, 'fin', it.finishes]);
            const hitF = cacheGet(kFin);
            if (hitF) { shape = hitF; key = kFin; }
            else {
              const e0 = errors.length;
              const sf = applyFinishes(shape, it.finishes, errors, it.id);
              if (sf && sf !== shape) { cachePut(kFin, sf, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId }))); shape = sf; key = kFin; }
            }
          }
          const wb = bboxTransform(bboxCached(key, shape), it.m);
          const entry = { shape, key, wb, m: it.m, it };
          live.set(it.id, entry);
          bodies.set(it.id, entry);
        } else {
          consumed.set(it.id, tid);
          const rel = matMul(matInvRigid(src.m), matMul(M, src.m));
          if (!isIdentity(rel)) {
            const k = keyOf([src.key, 'xform', rel.map((v) => Math.round(v * 1e6) / 1e6)]);
            let next = cacheGet(k);
            if (!next) {
              try { next = applyMatrix(src.shape, rel); cachePut(k, next); }
              catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
            }
            src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
            bodies.set(tid, src);
          }
        }
        continue;
      }
      const op = it.op, o = live.get(it.id);
      if (!op || !NAMES[op.type] || !o || !o.shape || it.role === 'hole') continue;
      let tid = op.target;
      while (tid && consumed.has(tid)) tid = consumed.get(tid);
      const t = byId.get(tid), base = tid ? live.get(tid) : null;
      if (!t || t.i >= i || !base || !base.shape || base.it.role === 'hole') { errors.push({ itemId: it.id, code: 'op', message: `${NAMES[op.type]}: Der Zielkörper fehlt oder kommt erst später im Verlauf – das Teil bleibt ein eigener Körper.` }); continue; }
      consumed.set(it.id, tid);
      const inv = matInvRigid(base.m), rel = matMul(inv, o.m);
      const k = keyOf([base.key, op.type, o.key, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
      let next = cacheGet(k);
      if (next) {
        base.shape = next; base.key = k; base.wb = bboxTransform(bboxCached(k, next), base.m);
        bodies.set(tid, base); continue;
      }
      try {
        const tool = applyMatrix(o.shape, rel);
        next = op.type === 'join' ? base.shape.fuse(tool) : op.type === 'cut' ? base.shape.cut(tool) : base.shape.intersect(tool);
        safeDelete(tool);
        cachePut(k, next);
        base.shape = next; base.key = k; base.wb = bboxTransform(bboxCached(k, next), base.m);
        bodies.set(tid, base);
      } catch (err) {
        errors.push({ itemId: it.id, code: 'op', message: `${NAMES[op.type]} mit „${base.it.name || 'Körper'}“ hat nicht geklappt – berühren sich die Teile?` });
      }
    }
    return { bodies, consumed };
  }
  function evaluate(scene, known = {}) {
    gen++;
    ingestBlobs(scene);
    if (scene.quality) setQuality(scene.quality);
    const errors = [];
    const hiddenIds = new Set((scene.items || []).filter((it) => it.hidden).map((it) => it.id));
    const tops = (scene.items || []).filter((it) => !it.hidden);
    // Rechenzeit je Schritt (BE-26): nur, was wirklich neu gerechnet wurde, zählt
    const times = {}, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const addT = (id, t0) => { const d = now() - t0; if (d > 0.5) times[id] = (times[id] || 0) + d; };
    const evald = tops.map((it) => {
      const t0 = now();
      const r = evalItem(it, errors);
      let wb = null;
      if (r.shape) {
        const lb = bboxCached(r.key, r.shape);
        wb = bboxTransform(lb, it.m);
      }
      addT(it.id, t0);
      return { it, ...r, wb };
    });
    const tOps = now();
    const { bodies, consumed } = resolveOps(evald, errors, hiddenIds);
    if (bodies.size) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
    for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; } }
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const nodes = [];
    for (const e of evald) {
      const it = e.it;
      if (consumed.has(it.id)) { nodes.push({ id: it.id, key: null, empty: true, merged: consumed.get(it.id) }); continue; }
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
            const tc = now();
            try {
              const tool = fuseAll(cutters.map((h, i) => applyMatrix(h.shape, rel[i])), true);
              result = e.shape.cut(tool);
              safeDelete(tool);
              cachePut(resultKey, result);
              addT(it.id, tc);
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
        const tm = now();
        try { payload = meshPayload(result); meshCache.set(mk, payload); addT(it.id, tm); }
        catch (err) { errors.push({ itemId: it.id, code: 'mesh', message: 'Die Form konnte nicht angezeigt werden.' }); nodes.push({ id: it.id, key: null, empty: true }); continue; }
      }
      nodes.push({ id: it.id, key: resultKey, ...clonePayload(payload) });
    }
    gc();
    return { nodes, errors, times };
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
  // Raster einer gewölbten Fläche für den Magneten: Punkte und Normalen über (u, v),
  // dazu bei beschnittenen Flächen, welche Rasterpunkte wirklich auf der Fläche liegen.
  function faceGrid(face) {
    const b = face.UVBounds, du = b.uMax - b.uMin, dv = b.vMax - b.vMin;
    const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
    const uc = !!ad.IsUClosed(), vc = !!ad.IsVClosed(); ad.delete();
    const props = new oc.BRepGProp_Face(face.wrapped, false);
    const gp = new oc.gp_Pnt(), gn = new oc.gp_Vec();
    const at = (s, t) => { props.Normal(b.uMin + s * du, b.vMin + t * dv, gp, gn); return [gp.X(), gp.Y(), gp.Z(), gn.X(), gn.Y(), gn.Z()]; };
    const len = (fn) => { let L = 0, q = null; for (let i = 0; i <= 16; i++) { const p = fn(i / 16); if (q) L += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); q = p; } return L; };
    const Lu = Math.max(...[0.1, 0.5, 0.9].map((t) => len((s) => at(s, t))));
    const Lv = Math.max(...[0.1, 0.5, 0.9].map((s) => len((t) => at(s, t))));
    const nu = Math.min(96, Math.max(8, Math.ceil(Lu / 1.2))) + 1, nv = Math.min(96, Math.max(8, Math.ceil(Lv / 1.2))) + 1;
    const P = new Array(nu * nv * 3), N = new Array(nu * nv * 3);
    try {
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const r = at(i / (nu - 1), j / (nv - 1)), k = (j * nu + i) * 3, l = Math.hypot(r[3], r[4], r[5]);
        for (let c = 0; c < 3; c++) { P[k + c] = r[c]; N[k + c] = l > 1e-12 ? r[3 + c] / l : 0; }
      }
    } finally { props.delete(); gp.delete(); gn.delete(); }
    // Pole (z. B. Kugelspitze): Normale vom Nachbarn übernehmen
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = (j * nu + i) * 3; if (N[k] || N[k + 1] || N[k + 2]) continue;
      const jj = j === 0 ? 1 : j === nv - 1 ? nv - 2 : j, ii = i === 0 ? 1 : i === nu - 1 ? nu - 2 : i, q = (jj * nu + ii) * 3;
      for (let c = 0; c < 3; c++) N[k + c] = N[q + c];
    }
    let ins = null;
    if (!oc.BRep_Tool.NaturalRestriction(face.wrapped)) {
      const segs = [], TA = oc.TopAbs_ShapeEnum;
      const ex = new oc.TopExp_Explorer(face.wrapped, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
      try {
        while (ex.More()) {
          const c2 = new oc.BRepAdaptor_Curve2d(oc.TopoDS.Edge(ex.Current()), face.wrapped);
          const t0 = c2.FirstParameter(), t1 = c2.LastParameter(); let q = null;
          for (let i = 0; i <= 24; i++) { const p = c2.Value(t0 + ((t1 - t0) * i) / 24); const s = [(p.X() - b.uMin) / du, (p.Y() - b.vMin) / dv]; p.delete(); if (q) segs.push(q, s); q = s; }
          c2.delete(); ex.Next();
        }
      } finally { ex.delete(); }
      ins = new Array(nu * nv);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const s = Math.min(Math.max(i / (nu - 1), 1e-6), 1 - 1e-6) + 1.1e-7, t = Math.min(Math.max(j / (nv - 1), 1e-6), 1 - 1e-6) + 1.3e-7;
        let c = 0;
        for (let k = 0; k < segs.length; k += 2) {
          const a = segs[k], e = segs[k + 1];
          if ((a[1] > t) !== (e[1] > t) && a[0] + ((t - a[1]) * (e[0] - a[0])) / (e[1] - a[1]) > s) c++;
        }
        ins[j * nu + i] = c & 1;
      }
    }
    return { nu, nv, uc, vc, P, N, ins };
  }
  // Schnitt einer Form mit einer Ebene (Form-Koordinaten): Kanten als Punktfolgen
  function sectionOf(key, o, n) {
    const e = cache.get(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher. Bitte noch einmal anklicken.');
    e.gen = gen;
    const P = new oc.gp_Pnt(o[0], o[1], o[2]), D = new oc.gp_Dir(n[0], n[1], n[2]), pln = new oc.gp_Pln(P, D);
    const sec = new oc.BRepAlgoAPI_Section(e.shape.wrapped, pln, true);
    try {
      const sh = R.cast(sec.Shape()), out = [];
      for (const ed of sh.edges) {
        const t = ed.geomType, N = t === 'LINE' ? 1 : 32, pts = [];
        for (let i = 0; i <= N; i++) pts.push(vec(ed.pointAt(i / N)));
        out.push({ t, pts });
      }
      return out;
    } finally { sec.delete(); pln.delete(); P.delete(); D.delete(); }
  }
  function faceGridOf(key, faceIdx) {
    const e = cache.get(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher. Bitte noch einmal anklicken.');
    e.gen = gen;
    const fl = topoList(e.shape, 'face'); const f = fl[faceIdx];
    if (!f) throw new Error('Diese Fläche gibt es nicht mehr.');
    try { return faceGrid(f.shape); } finally { for (const x of fl) x.shape.delete(); }
  }
  // Ergebnisformen in Weltkoordinaten (für Export und Zeichnung)
  function worldSolids(scene) {
    const errors = [];
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const res = evaluateShapes(scene, errors);
    return res;
  }
  function evaluateShapes(scene, errors) {
    const hiddenIds = new Set((scene.items || []).filter((it) => it.hidden).map((it) => it.id));
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const evald = tops.map((it) => {
      const r = evalItem(it, errors);
      let wb = null;
      if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
      return { it, ...r, wb };
    });
    const { bodies, consumed } = resolveOps(evald, errors || [], hiddenIds);
    for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; } }
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const out = [];
    for (const e of evald) {
      if (!e.shape || e.it.role === 'hole' || consumed.has(e.it.id)) continue;
      let world = applyMatrix(e.shape, e.it.m);
      const cutters = holes.filter((h) => bboxHit(h.wb, e.wb));
      if (cutters.length) {
        try { const tool = fuseAll(cutters.map((h) => applyMatrix(h.shape, h.it.m)), true); const cut = world.cut(tool); safeDelete(tool); safeDelete(world); world = cut; } catch (_) {}
      }
      out.push({ id: e.it.id, name: e.it.name, color: e.it.color, shape: world });
    }
    return out;
  }

  // q: Feinheit beim Export – 1 = normal, kleiner = feiner (0.4 = fein, 0.15 = sehr fein), größer = gröber
  function exportMeshes(scene, fine = true, q = 1, originMat = null) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const objs = [];
    const f = Math.max(0.05, Math.min(4, +q || 1));
    const useTr = Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat);
    for (const s of solids) {
      const b = bboxOf(s.shape);
      const tol = (fine ? Math.min(0.05, Math.max(0.005, meshTol(b) * 0.35)) : meshTol(b)) * f;
      const m = s.shape.mesh({ tolerance: tol, angularTolerance: (fine ? 0.1 : 0.2) * Math.min(2, Math.max(0.25, f)) });
      const verts = new Float32Array(m.vertices), norms = new Float32Array(m.normals);
      if (useTr) {
        const m0 = originMat;
        for (let i = 0; i < verts.length; i += 3) {
          const x = verts[i], y = verts[i + 1], z = verts[i + 2];
          verts[i] = m0[0] * x + m0[4] * y + m0[8] * z + m0[12];
          verts[i + 1] = m0[1] * x + m0[5] * y + m0[9] * z + m0[13];
          verts[i + 2] = m0[2] * x + m0[6] * y + m0[10] * z + m0[14];
        }
        for (let i = 0; i < norms.length; i += 3) {
          const x = norms[i], y = norms[i + 1], z = norms[i + 2];
          let nx = m0[0] * x + m0[4] * y + m0[8] * z;
          let ny = m0[1] * x + m0[5] * y + m0[9] * z;
          let nz = m0[2] * x + m0[6] * y + m0[10] * z;
          const l = Math.hypot(nx, ny, nz);
          if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
          norms[i] = nx; norms[i + 1] = ny; norms[i + 2] = nz;
        }
      }
      objs.push({ id: s.id, name: s.name, color: s.color, vertices: verts, normals: norms, triangles: new Uint32Array(m.triangles) });
      s.shape.delete();
    }
    return { objects: objs, errors };
  }
  function exportSTEP(scene, only, originMat = null) {
    ingestBlobs(scene);
    const errors = [];
    let solids = evaluateShapes(scene, errors);
    if (only && only.length) { const keep = new Set(only); for (const s of solids) if (!keep.has(s.id)) s.shape.delete(); solids = solids.filter((s) => keep.has(s.id)); }
    if (!solids.length) throw new Error('Es gibt nichts zu exportieren.');
    if (Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat)) {
      for (const s of solids) {
        const tr = applyMatrix(s.shape, originMat);
        s.shape.delete();
        s.shape = tr;
      }
    }
    const comp = solids.length === 1 ? solids[0].shape : R.makeCompound(solids.map((s) => s.shape));
    return comp.blobSTEP();
  }
  // Volumen, Oberfläche und Schwerpunkt – je Teil der obersten Ebene und gesamt
  function measure(scene) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    let volume = 0, area = 0;
    let b = null; const parts = [];
    for (const s of solids) {
      let v = 0, a = 0, com = null;
      let inertia = null;
      try {
        const pr = R.measureShapeVolumeProperties(s.shape); v = pr.volume; com = pr.centerOfMass;
        // Trägheitsmatrix um den Schwerpunkt (bei Dichte 1, also mm⁵)
        // (gp_Mat ist hier nicht gebunden – deshalb je Achse durch den Schwerpunkt einzeln)
        try {
          const g = pr.wrapped.CentreOfMass(), I = [];
          for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const dir = new oc.gp_Dir(d[0], d[1], d[2]), ax = new oc.gp_Ax1(g, dir); I.push(pr.wrapped.MomentOfInertia(ax)); ax.delete(); dir.delete(); }
          g.delete && g.delete(); inertia = I;
        } catch (e) { inertia = null; }
        pr.delete && pr.delete();
      } catch (_) {}
      try { a = R.measureArea(s.shape); } catch (_) {}
      volume += v; area += a;
      const bb = bboxOf(s.shape);
      b = b ? [Math.min(b[0], bb[0]), Math.min(b[1], bb[1]), Math.min(b[2], bb[2]), Math.max(b[3], bb[3]), Math.max(b[4], bb[4]), Math.max(b[5], bb[5])] : bb;
      parts.push({ id: s.id, volume: v, area: a, com, bbox: bb, inertia });
      s.shape.delete();
    }
    return { volume, area, bbox: b, count: solids.length, parts, errors };
  }

  // kleinster Abstand zwischen zwei Teilen (mit den Punkten, an denen er auftritt)
  function minDistance(scene, ids) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors).filter((s) => ids.includes(s.id));
    const A = solids.find((s) => s.id === ids[0]), B = solids.find((s) => s.id === ids[1]);
    let out = null;
    if (A && B) {
      const t = new oc.BRepExtrema_DistShapeShape();
      try {
        t.LoadS1(A.shape.wrapped); t.LoadS2(B.shape.wrapped); t.Perform();
        if (t.IsDone() && t.NbSolution() > 0) {
          const p1 = t.PointOnShape1(1), p2 = t.PointOnShape2(1);
          out = { d: t.Value(), a: [p1.X(), p1.Y(), p1.Z()], b: [p2.X(), p2.Y(), p2.Z()] };
          p1.delete(); p2.delete();
        }
      } finally { t.delete(); }
    }
    for (const s of solids) s.shape.delete();
    return out;
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
    ingestBlobs(scene);
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

  // Kollisionen: welche Teile stecken ineinander, und welche Teile treffen die Prüfkörper (z. B. Propellerscheiben)?
  // probes: [{ c:[x,y,z], r, h, skip:[ids] }] – senkrechte Zylinder; skipPairs: Teile, die nicht paarweise geprüft werden
  function clashes(scene, probes = [], skipPairs = []) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const boxes = solids.map((s) => bboxOf(s.shape));
    const hit = (a, b) => a[0] < b[3] - 0.01 && b[0] < a[3] - 0.01 && a[1] < b[4] - 0.01 && b[1] < a[4] - 0.01 && a[2] < b[5] - 0.01 && b[2] < a[5] - 0.01;
    const overlap = (A, B) => { let x = null; try { x = A.intersect(B); const v = R.measureVolume(x); return v; } catch (_) { return 0; } finally { safeDelete(x); } };
    const pairs = [];
    for (let i = 0; i < solids.length; i++) {
      if (skipPairs.includes(solids[i].id)) continue;
      for (let j = i + 1; j < solids.length; j++) {
        if (skipPairs.includes(solids[j].id) || !hit(boxes[i], boxes[j])) continue;
        const v = overlap(solids[i].shape, solids[j].shape);
        if (v > 0.05) pairs.push({ a: solids[i].id, b: solids[j].id, v });
      }
    }
    const hits = probes.map((pr) => {
      const out = []; let cyl = null;
      try {
        // Prüfkörper senkrecht oder – bei geneigten Motoren – entlang der Motorachse (dir)
        const dir = pr.dir || [0, 0, 1];
        cyl = R.makeCylinder(pr.r, pr.h, pr.c, dir);
        if (pr.ri > 0 && pr.ri < pr.r) { const inner = R.makeCylinder(pr.ri, pr.h + 2, pr.c.map((v, k) => v - dir[k]), dir); const ring = cyl.cut(inner); safeDelete(cyl); safeDelete(inner); cyl = ring; }   // Ring: innen Platz für Welle und Mutter
        const e = pr.dir ? pr.r + pr.h : 0;
        const cb = pr.dir ? [pr.c[0] - e, pr.c[1] - e, pr.c[2] - e, pr.c[0] + e, pr.c[1] + e, pr.c[2] + e] : [pr.c[0] - pr.r, pr.c[1] - pr.r, pr.c[2], pr.c[0] + pr.r, pr.c[1] + pr.r, pr.c[2] + pr.h];
        solids.forEach((s, i) => { if ((pr.skip || []).includes(s.id) || !hit(cb, boxes[i])) return; const v = overlap(cyl, s.shape); if (v > 0.05) out.push({ id: s.id, v }); });
      } catch (e) { errors.push({ itemId: null, code: 'build', message: String(e && e.message || e) }); }
      finally { safeDelete(cyl); }
      return out;
    });
    for (const s of solids) safeDelete(s.shape);
    return { pairs, hits, errors };
  }

  // Wand um Schraubenlöcher in beliebigen Teilen: um jede runde Bohrung (volle Zylinderfläche, nach innen gewölbt)
  // einen Ring mit der Mindestwand legen – ragt davon etwas aus dem Teil heraus, ist die Wand dort dünner.
  function holeWalls(scene, ids = [], opts = {}) {
    ingestBlobs(scene);
    const errors = [], small = opts.small || 1.5, big = opts.big || 2, rmax = opts.rmax || 4.6;
    // Enden etwas kürzen: Tritt das Loch schräg oder durch eine gewölbte Fläche aus, ragt der Ring dort sonst ein Stück heraus
    const endCut = (r, w) => Math.min(1.5, Math.max(0.3, 0.3 * (r + w)));
    const solids = evaluateShapes(scene, errors).filter((s) => ids.includes(s.id));
    const out = [];
    const outside = (shape, o, d, r, w, t0, t1) => {
      let ring = null, inner = null, outer = null, rest = null;
      const e = endCut(r, w); if (t1 - t0 - 2 * e < 0.4) return 0;
      try {
        const base = [o[0] + d[0] * (t0 + e), o[1] + d[1] * (t0 + e), o[2] + d[2] * (t0 + e)], L = t1 - t0 - 2 * e;
        outer = R.makeCylinder(r + w, L, base, d); inner = R.makeCylinder(r + 0.05, L + 0.2, base.map((v, k) => v - d[k] * 0.1), d);
        ring = outer.cut(inner); rest = ring.cut(shape);
        const v = R.measureVolume(rest), vr = R.measureVolume(ring);
        return v > 0.05 && v > vr * 0.002 ? v : 0;
      } catch (_) { return 0; } finally { safeDelete(outer); safeDelete(inner); safeDelete(ring); safeDelete(rest); }
    };
    for (const s of solids) {
      const holes = [];
      for (const f of s.shape.faces) {
        if (f.geomType !== 'CYLINDRE') continue;
        try { const uv = f.UVBounds; if (Math.abs(uv.uMax - uv.uMin) < Math.PI * 1.9) continue; } catch (_) { continue; }
        try {
          const ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
          const cy = ad.Cylinder(); const ax = cy.Axis(); const l = ax.Location(), dd = ax.Direction();
          const o = [l.X(), l.Y(), l.Z()], d = norm([dd.X(), dd.Y(), dd.Z()]), r = cy.Radius();
          ad.delete();
          if (r < 0.5 || r > rmax) continue;
          let t0 = Infinity, t1 = -Infinity, pe = null;
          for (const ed of f.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) { const p = vec(ed.pointAt(t)); const q = dot(sub(p, o), d); t0 = Math.min(t0, q); t1 = Math.max(t1, q); if (!pe) pe = p; }
          if (!(t1 - t0 > 1) || !pe) continue;
          // nach innen gewölbt (Bohrung) und nicht nach außen (Zapfen)?
          const foot = add(o, mul(d, dot(sub(pe, o), d))), rad = sub(pe, foot);
          const n = f.normalAt(pe); if (dot([n.x, n.y, n.z], rad) > 0) continue;
          if (holes.some((h) => Math.abs(h.r - r) < 1e-3 && Math.hypot(...sub(h.o, o)) < 1e-3)) continue;
          holes.push({ o, d, r, t0, t1 });
        } catch (_) {}
      }
      for (const hl of holes.slice(0, 40)) {
        const need = 2 * hl.r < 2.8 ? small : big;
        if (!outside(s.shape, hl.o, hl.d, hl.r, need, hl.t0, hl.t1)) continue;
        // ungefähre dünnste Wand: halbieren zwischen 0 und Mindestwand
        let lo = 0, hi = need;
        for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; if (outside(s.shape, hl.o, hl.d, hl.r, m, hl.t0, hl.t1)) hi = m; else lo = m; }
        const tm = (hl.t0 + hl.t1) / 2;
        out.push({ id: s.id, d: 2 * hl.r, wall: lo, need, c: add(hl.o, mul(hl.d, tm)), dir: hl.d });
      }
    }
    return { holes: out, errors };
  }
  return { evaluate, remesh, exportMeshes, exportSTEP, measure, minDistance, project, clashes, holeWalls, faceLoopsOf, faceGridOf, sectionOf, _cache: cache };
}
