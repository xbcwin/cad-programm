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
  function cacheEntry(key) {
    const e = cache.get(key);
    if (e) { e.gen = gen; return e; }
    return null;
  }
  function cachePut(key, shape, errs, resolved, baseBox = null, topo = null) {
    const old = cache.get(key);
    if (old && old.topo && old.topo !== topo) freeTopoMap(old.topo);
    cache.set(key, { shape, gen, errs: errs && errs.length ? errs : null, resolved: resolved || null, baseBox: baseBox || null, topo: topo || null });
    return shape;
  }

  function gc() {
    // Formen entfernen, die mehrere Durchläufe nicht gebraucht wurden
    for (const [k, e] of cache) {
      if (gen - e.gen > 6) {
        try { if (Array.isArray(e.shape)) e.shape.forEach(safeDelete); else e.shape.delete(); } catch (_) {}
        freeTopoMap(e.topo);
        cache.delete(k);
      }
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
  function applyMatrixWithTopo(shape, m, topo, selfId = null) {
    if (isIdentity(m)) {
      const res = shape.clone();
      const outTopo = topo ? cloneTopoForShape(res, topo, selfId) : null;
      return { shape: res, topo: outTopo };
    }
    const trsf = new oc.gp_Trsf();
    trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]);
    const tr = new oc.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
    const res = R.cast(tr.ModifiedShape(shape.wrapped));
    const outTopo = topo ? transformTopo(topo, tr, res, selfId) : null;
    tr.delete(); trsf.delete();
    return { shape: res, topo: outTopo };
  }
  function mirrorAxisWithTopo(shape, topo, planeName, selfId = null) {
    const dir = planeName === 'YZ' ? [1, 0, 0] : planeName === 'XZ' ? [0, 1, 0] : [0, 0, 1];
    const p0 = new oc.gp_Pnt(0, 0, 0);
    const d0 = new oc.gp_Dir(dir[0], dir[1], dir[2]);
    const ax2 = new oc.gp_Ax2(p0, d0);
    const trsf = new oc.gp_Trsf();
    trsf.SetMirror(ax2);
    const tr = new oc.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
    const res = R.cast(tr.ModifiedShape(shape.wrapped));
    const outTopo = topo ? transformTopo(topo, tr, res, selfId) : null;
    tr.delete(); trsf.delete(); ax2.delete(); d0.delete(); p0.delete();
    return { shape: res, topo: outTopo };
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
  function transformDir(m, v) {
    return norm([m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]);
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
  function matRotAxis(c, ax, deg) {
    const a = norm(ax), x = a[0], y = a[1], z = a[2], rad = (deg * Math.PI) / 180;
    const cs = Math.cos(rad), sn = Math.sin(rad), t = 1 - cs;
    const R = [
      cs + x * x * t, x * y * t + z * sn, x * z * t - y * sn, 0,
      x * y * t - z * sn, cs + y * y * t, y * z * t + x * sn, 0,
      x * z * t + y * sn, y * z * t - x * sn, cs + z * z * t, 0,
      0, 0, 0, 1,
    ];
    return matMul(matTrans(c[0], c[1], c[2]), matMul(R, matTrans(-c[0], -c[1], -c[2])));
  }
  function patternStepMatrices(p) {
    const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const skipSet = new Set(Array.isArray(p.skip) ? p.skip.map((x) => Math.round(Number(x))) : []);
    const out = [];
    if (p.pt === 'rect') {
      const nx = Math.max(1, Math.min(60, Math.round(num(p.nx, 1)))), ny = Math.max(1, Math.min(60, Math.round(num(p.ny, 1))));
      const dx = num(p.dx, 10), dy = num(p.dy, 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        if (!skipSet.has(idx)) out.push(idx === 0 ? ID : matTrans(i * dx, j * dy, 0));
      }
    } else if (p.pt === 'circ') {
      const n = Math.max(1, Math.min(120, Math.round(num(p.n, 4)))), ang = num(p.ang, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [num(p.cx, 0), num(p.cy, 0), num(p.cz, 0)];
      for (let k = 0; k < n; k++) if (!skipSet.has(k)) out.push(k === 0 ? ID : matRotAxis(c, ax, k * step));
    } else if (p.pt === 'path' && Array.isArray(p.places)) {
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      const lim = Math.min(p.places.length, 200);
      for (let k = 0; k < lim; k++) {
        if (skipSet.has(k)) continue;
        if (k === 0) { out.push(ID); continue; }
        const q = p.places[k], d = (q.d || [0, 0, 0]).map(Number);
        let m = matTrans(d[0], d[1], d[2]);
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) m = matMul(m, matRotAxis(p0, ax, Number(q.a)));
        out.push(m);
      }
    }
    return out.length ? out : [ID];
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
  function shapeCenterOfMass(shape, fallbackBbox) {
    try {
      const props = R.measureShapeVolumeProperties(shape);
      try {
        if (Math.abs(props.volume) > 1e-9) return props.centerOfMass;
      } finally { props.delete(); }
    } catch (_) {}
    const b = fallbackBbox || bboxOf(shape);
    return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  }
  function scalePt(p, c, s) {
    return [c[0] + (p[0] - c[0]) * s[0], c[1] + (p[1] - c[1]) * s[1], c[2] + (p[2] - c[2]) * s[2]];
  }
  function makeArr1D(vals) {
    const a = new oc.NCollection_Array1_double(1, vals.length);
    for (let i = 0; i < vals.length; i++) a.SetValue(i + 1, vals[i]);
    return a;
  }
  function makeArr1I(vals) {
    const a = new oc.NCollection_Array1_int(1, vals.length);
    for (let i = 0; i < vals.length; i++) a.SetValue(i + 1, vals[i]);
    return a;
  }
  function buildRuledBSpline(surf, u1, u2, v1, v2, xPt) {
    const fullU = surf.IsUPeriodic() && Math.abs((u2 - u1) - surf.UPeriod()) < 1e-4;
    const iso1 = surf.VIso(v1), iso2 = surf.VIso(v2);
    const c1 = fullU ? iso1 : new oc.Geom_TrimmedCurve(iso1, u1, u2, true, true);
    const c2 = fullU ? iso2 : new oc.Geom_TrimmedCurve(iso2, u1, u2, true, true);
    const b1 = oc.GeomConvert.CurveToBSplineCurve(c1, oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
    const b2 = oc.GeomConvert.CurveToBSplineCurve(c2, oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
    if (!fullU) { c1.delete(); c2.delete(); }
    const nu = b1.NbPoles(), nk = b1.NbKnots(), uDeg = b1.Degree(), uPer = b1.IsPeriodic();
    const poles = new oc.NCollection_Array2_gp_Pnt(1, nu, 1, 2);
    const weights = new oc.NCollection_Array2_double(1, nu, 1, 2);
    for (let i = 1; i <= nu; i++) {
      const p1 = b1.Pole(i), p2 = b2.Pole(i);
      const q1 = xPt(p1), q2 = xPt(p2);
      const gp1 = new oc.gp_Pnt(q1[0], q1[1], q1[2]), gp2 = new oc.gp_Pnt(q2[0], q2[1], q2[2]);
      poles.SetValue(i, 1, gp1); poles.SetValue(i, 2, gp2);
      weights.SetValue(i, 1, b1.Weight(i)); weights.SetValue(i, 2, b2.Weight(i));
      gp1.delete(); gp2.delete(); p1.delete(); p2.delete();
    }
    const uK = [], uM = [];
    for (let i = 1; i <= nk; i++) { uK.push(b1.Knot(i)); uM.push(b1.Multiplicity(i)); }
    const uk = makeArr1D(uK), um = makeArr1I(uM), vk = makeArr1D([v1, v2]), vm = makeArr1I([2, 2]);
    const bsp = b1.IsRational()
      ? new oc.Geom_BSplineSurface(poles, weights, uk, vk, um, vm, uDeg, 1, uPer, false)
      : new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, uDeg, 1, uPer, false);
    poles.delete(); weights.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete(); b1.delete(); b2.delete();
    return bsp;
  }
  function scaleCurve3d(ew, c, s) {
    const loc = new oc.TopLoc_Location();
    const crvRes = oc.BRep_Tool.Curve(ew, loc);
    const trsf = !loc.IsIdentity() ? loc.Transformation() : null;
    const trimmed = new oc.Geom_TrimmedCurve(crvRes.returnValue, crvRes.First, crvRes.Last, true, true);
    const bsp = oc.GeomConvert.CurveToBSplineCurve(trimmed, oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
    trimmed.delete();
    const np = bsp.NbPoles();
    for (let i = 1; i <= np; i++) {
      const pt = bsp.Pole(i);
      let x = pt.X(), y = pt.Y(), z = pt.Z();
      if (trsf) { const p2 = pt.Transformed(trsf); x = p2.X(); y = p2.Y(); z = p2.Z(); p2.delete(); }
      const q = scalePt([x, y, z], c, s);
      const gp = new oc.gp_Pnt(q[0], q[1], q[2]);
      bsp.SetPole(i, gp);
      gp.delete(); pt.delete();
    }
    if (trsf) trsf.delete();
    loc.delete();
    return bsp;
  }
  function collectWires(fw) {
    const outerW = oc.BRepTools.OuterWire(fw);
    const wires = [];
    const wExp = new oc.TopExp_Explorer(fw, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (wExp.More()) {
      const w = oc.TopoDS.Wire(wExp.Current());
      if (w.IsSame(outerW)) wires.unshift(w); else wires.push(w);
      wExp.Next();
    }
    wExp.delete();
    return wires;
  }
  function collectEdges(wire) {
    const edges = [];
    const eExp = new oc.TopExp_Explorer(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (eExp.More()) { edges.push(oc.TopoDS.Edge(eExp.Current())); eExp.Next(); }
    eExp.delete();
    return edges;
  }
  function makeWireFromEdges(edgeList) {
    const wb = new oc.BRepBuilderAPI_MakeWire();
    const list = new oc.NCollection_List_TopoDS_Shape();
    for (const e of edgeList) list.Append(e);
    wb.Add(list);
    const out = wb.Wire();
    list.delete(); wb.delete();
    return out;
  }
  function scaleFace(face, c, s) {
    const fw = oc.TopoDS.Face(face.wrapped);
    const fOri = fw.Orientation();
    const wires = collectWires(fw);
    if (face.geomType === 'PLANE') {
      const orig = face.center, n0 = face.normalAt();
      const ref = Math.abs(n0.z) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = [ref[1] * n0.z - ref[2] * n0.y, ref[2] * n0.x - ref[0] * n0.z, ref[0] * n0.y - ref[1] * n0.x];
      const ul = Math.hypot(...u) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
      const v = [n0.y * u[2] - n0.z * u[1], n0.z * u[0] - n0.x * u[2], n0.x * u[1] - n0.y * u[0]];
      const tu = [u[0] * s[0], u[1] * s[1], u[2] * s[2]], tv = [v[0] * s[0], v[1] * s[1], v[2] * s[2]];
      let tn = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
      const tl = Math.hypot(...tn) || 1; tn = [tn[0] / tl, tn[1] / tl, tn[2] / tl];
      const to = scalePt([orig.x, orig.y, orig.z], c, s);
      const p = new oc.gp_Pnt(to[0], to[1], to[2]), d = new oc.gp_Dir(tn[0], tn[1], tn[2]);
      const gpPln = new oc.gp_Pln(p, d); p.delete(); d.delete();
      const buildW = (w) => {
        const neList = [];
        for (const ew of collectEdges(w)) {
          if (oc.BRep_Tool.Degenerated(ew)) continue;
          const bsp = scaleCurve3d(ew, c, s);
          const me = new oc.BRepBuilderAPI_MakeEdge(bsp);
          let ne = me.Edge();
          if (ew.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) ne = oc.TopoDS.Edge(ne.Reversed());
          neList.push(ne); me.delete(); bsp.delete();
        }
        return makeWireFromEdges(neList);
      };
      const mf = new oc.BRepBuilderAPI_MakeFace(gpPln, buildW(wires[0]), true);
      for (let i = 1; i < wires.length; i++) mf.Add(buildW(wires[i]));
      let nf = mf.Face(); mf.delete(); gpPln.delete();
      const sff = new oc.ShapeFix_Face(nf); sff.FixOrientation(); sff.Perform(); nf = sff.Face(); sff.delete();
      return nf;
    }
    const loc = new oc.TopLoc_Location();
    const surf = oc.BRep_Tool.Surface(fw, loc);
    const trsf = !loc.IsIdentity() ? loc.Transformation() : null;
    const uv = oc.BRepTools.UVBounds(fw);
    const xPt = (pt) => {
      let x = pt.X(), y = pt.Y(), z = pt.Z();
      if (trsf) { const p2 = pt.Transformed(trsf); x = p2.X(); y = p2.Y(); z = p2.Z(); p2.delete(); }
      return scalePt([x, y, z], c, s);
    };
    const isRuled = face.geomType === 'CYLINDRE' || face.geomType === 'CONE' || face.geomType === 'EXTRUSION';
    const isFullNatural = wires.length === 1 && (
      face.geomType === 'SPHERE' || face.geomType === 'TORUS' ||
      (isRuled && surf.IsUPeriodic() && Math.abs((uv.UMax - uv.UMin) - surf.UPeriod()) < 1e-4 && collectEdges(wires[0]).length <= 4)
    );
    let bspSurf;
    if (isRuled) {
      const dv = isFullNatural ? 0 : Math.max(1e-3, (uv.VMax - uv.VMin) * 0.05);
      bspSurf = buildRuledBSpline(surf, uv.UMin, uv.UMax, uv.VMin - dv, uv.VMax + dv, xPt);
    } else {
      try {
        bspSurf = oc.GeomConvert.SurfaceToBSplineSurface(surf);
        const nu = bspSurf.NbUPoles(), nv = bspSurf.NbVPoles();
        for (let u = 1; u <= nu; u++) for (let v = 1; v <= nv; v++) {
          const pt = bspSurf.Pole(u, v), q = xPt(pt), np = new oc.gp_Pnt(q[0], q[1], q[2]);
          bspSurf.SetPole(u, v, np); np.delete(); pt.delete();
        }
      } catch (_) {
        const N = 9, du = (uv.UMax - uv.UMin) / (N - 1), dv = (uv.VMax - uv.VMin) / (N - 1);
        const grid = new oc.NCollection_Array2_gp_Pnt(1, N, 1, N);
        for (let iu = 0; iu < N; iu++) for (let iv = 0; iv < N; iv++) {
          const pt = surf.Value(uv.UMin + iu * du, uv.VMin + iv * dv), q = xPt(pt), np = new oc.gp_Pnt(q[0], q[1], q[2]);
          grid.SetValue(iu + 1, iv + 1, np); np.delete(); pt.delete();
        }
        const fit = new oc.GeomAPI_PointsToBSplineSurface();
        fit.Interpolate(grid);
        bspSurf = fit.Surface();
        grid.delete(); fit.delete();
      }
    }
    if (trsf) trsf.delete();
    loc.delete();
    if (isFullNatural) {
      const mf = new oc.BRepBuilderAPI_MakeFace(bspSurf, 1e-6);
      let nf = mf.Face(); mf.delete();
      if (fOri === oc.TopAbs_Orientation.TopAbs_REVERSED) nf = oc.TopoDS.Face(nf.Reversed());
      return nf;
    }
    const buildW = (w) => {
      const neList = [];
      for (const ew of collectEdges(w)) {
        const ad = new oc.BRepAdaptor_Curve2d(ew, fw);
        const pc = ad.Curve();
        const first = ad.FirstParameter(), last = ad.LastParameter();
        const me = new oc.BRepBuilderAPI_MakeEdge(pc, bspSurf, first, last);
        let ne = me.Edge();
        if (ew.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) ne = oc.TopoDS.Edge(ne.Reversed());
        neList.push(ne); me.delete(); ad.delete();
      }
      return makeWireFromEdges(neList);
    };
    const mf = new oc.BRepBuilderAPI_MakeFace(bspSurf, buildW(wires[0]), true);
    for (let i = 1; i < wires.length; i++) mf.Add(buildW(wires[i]));
    let nf = mf.Face(); mf.delete();
    if (fOri === oc.TopAbs_Orientation.TopAbs_REVERSED) nf = oc.TopoDS.Face(nf.Reversed());
    oc.BRepLib.BuildCurves3d(nf);
    const sff = new oc.ShapeFix_Face(nf); sff.Perform(); nf = sff.Face(); sff.delete();
    return nf;
  }
  function scaleNonUniform(shape, center, s) {
    const solids = shape.solids;
    const outSolids = [];
    for (const solIn of solids) {
      const faces = solIn.faces;
      if (faces.length === 1 && (faces[0].geomType === 'SPHERE' || faces[0].geomType === 'TORUS')) {
        const nf = scaleFace(faces[0], center, s);
        const sf = oc.BRep_Tool.Surface(nf);
        const sh = R.cast(new oc.BRepBuilderAPI_MakeShell(sf, false).Shell());
        let res = R.makeSolid([sh]);
        if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
        outSolids.push(res);
        continue;
      }
      const sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
      for (const f of faces) sew.Add(scaleFace(f, center, s));
      sew.Perform();
      const sewed = sew.SewedShape(); sew.delete();
      const sh = oc.TopoDS.Shell(sewed);
      const ms = new oc.BRepBuilderAPI_MakeSolid(sh);
      let sol = ms.Solid(); ms.delete();
      const sfs = new oc.ShapeFix_Solid(sol); sfs.Perform(); sol = oc.TopoDS.Solid(sfs.Solid()); sfs.delete();
      let res = R.cast(sol);
      if (R.measureVolume(res) < 0) res = R.cast(sol.Reversed());
      outSolids.push(res);
    }
    return outSolids.length === 1 ? outSolids[0] : R.makeCompound(outSolids);
  }
  function applyScale(shape, center, sx, sy, sz) {
    if (Math.abs(sx - sy) < 1e-9 && Math.abs(sx - sz) < 1e-9) {
      return shape.clone().scale(sx, center);
    }
    return scaleNonUniform(shape, center, [sx, sy, sz]);
  }
  function matchFace(shape, spec) {
    if (!spec || !Array.isArray(spec.c)) return null;
    const b = bboxOf(shape), tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const hasN = Array.isArray(spec.n) && spec.n.length >= 3;
    const dist = (f) => { const c = vec(f.center); return Math.hypot(c[0] - spec.c[0], c[1] - spec.c[1], c[2] - spec.c[2]); };
    const dotN = (f) => { if (!hasN) return 1; try { const v = f.normalAt(); return v.x * spec.n[0] + v.y * spec.n[1] + v.z * spec.n[2]; } catch (_) { return 0; } };
    const faces = shape.faces;
    let best = null, bd = Infinity;
    for (const f of faces) {
      const d = dist(f);
      if (d < tol && (!hasN || dotN(f) > 0.85) && d < bd) { bd = d; best = f; }
    }
    if (best) return best;
    if (hasN) {
      const aligned = faces.filter((f) => dotN(f) > 0.99);
      const pool = spec.t ? aligned.filter((f) => f.geomType === spec.t) : [];
      const list = pool.length ? pool : aligned;
      for (const f of list) { const d = dist(f); if (d < bd) { bd = d; best = f; } }
    }
    return best;
  }
  function thickenFaceShape(face, dist, dir, mode) {
    const d = Math.abs(dist);
    if (face.geomType === 'PLANE') {
      const nv = face.normalAt();
      const nl = Math.hypot(nv.x, nv.y, nv.z) || 1;
      const nx = nv.x / nl, ny = nv.y / nl, nz = nv.z / nl;
      let fStart = face, vecArg;
      if (dir === 'out') {
        vecArg = new oc.gp_Vec(nx * d, ny * d, nz * d);
      } else if (dir === 'in') {
        if (mode === 'cut') {
          fStart = face.clone().translate([nx * 1e-3, ny * 1e-3, nz * 1e-3]);
          vecArg = new oc.gp_Vec(-nx * (d + 1e-3), -ny * (d + 1e-3), -nz * (d + 1e-3));
        } else {
          vecArg = new oc.gp_Vec(-nx * d, -ny * d, -nz * d);
        }
      } else {
        fStart = face.clone().translate([-nx * d / 2, -ny * d / 2, -nz * d / 2]);
        vecArg = new oc.gp_Vec(nx * d, ny * d, nz * d);
      }
      const pr = new oc.BRepPrimAPI_MakePrism(fStart.wrapped, vecArg, false, true);
      let res = R.cast(pr.Shape());
      pr.delete(); vecArg.delete();
      if (fStart !== face) fStart.delete();
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    }
    const fw = face.wrapped;
    const sign = fw.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
    const makeThick = (sh, off) => {
      const ts = new oc.BRepOffsetAPI_MakeThickSolid();
      ts.MakeThickSolidBySimple(sh, off);
      const raw = ts.Shape();
      ts.delete();
      const sfs = new oc.ShapeFix_Solid(oc.TopoDS.Solid(raw));
      sfs.Perform();
      let res = R.cast(oc.TopoDS.Solid(sfs.Solid()));
      sfs.delete();
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    };
    const makeOffset = (sh, off) => {
      const ob = new oc.BRepOffsetAPI_MakeOffsetShape();
      ob.PerformBySimple(sh, off);
      const out = ob.Shape();
      ob.delete();
      return out;
    };
    if (dir === 'out') {
      if (mode === 'join') {
        const offSh = makeOffset(fw, -sign * 1e-3);
        const res = makeThick(offSh, sign * (d + 1e-3));
        safeDelete(offSh);
        return res;
      }
      return makeThick(fw, sign * d);
    }
    if (dir === 'in') {
      if (mode === 'cut') {
        const offSh = makeOffset(fw, sign * 1e-3);
        const res = makeThick(offSh, -sign * (d + 1e-3));
        safeDelete(offSh);
        return res;
      }
      return makeThick(fw, -sign * d);
    }
    const offSh = makeOffset(fw, -sign * d / 2);
    const res = makeThick(offSh, sign * d);
    safeDelete(offSh);
    return res;
  }
  function embossFaceShell(face, height, mode) {
    const d = Math.abs(height);
    const eps = Math.min(0.1, Math.max(0.02, d * 0.25));
    if (face.geomType === 'PLANE') {
      const nv = face.normalAt();
      const nl = Math.hypot(nv.x, nv.y, nv.z) || 1;
      const nx = nv.x / nl, ny = nv.y / nl, nz = nv.z / nl;
      const fStart = face.clone().translate(mode === 'deboss' ? [nx * eps, ny * eps, nz * eps] : [-nx * eps, -ny * eps, -nz * eps]);
      const vecArg = new oc.gp_Vec(...(mode === 'deboss'
        ? [-nx * (d + eps), -ny * (d + eps), -nz * (d + eps)]
        : [nx * (d + eps), ny * (d + eps), nz * (d + eps)]));
      const pr = new oc.BRepPrimAPI_MakePrism(fStart.wrapped, vecArg, false, true);
      let res = R.cast(pr.Shape());
      pr.delete(); vecArg.delete(); fStart.delete();
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    }
    const sphereShell = () => {
      const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
      const sp = ad.Sphere();
      const l = sp.Location();
      const sc = [l.X(), l.Y(), l.Z()];
      const rad = sp.Radius();
      ad.delete();
      const pt = face.pointOnSurface(0.5, 0.5);
      const nv = face.normalAt();
      const outRad = (pt.x - sc[0]) * nv.x + (pt.y - sc[1]) * nv.y + (pt.z - sc[2]) * nv.z >= 0 ? 1 : -1;
      const d1 = mode === 'deboss' ? -d : -eps;
      const d2 = mode === 'deboss' ? eps : d;
      const rA = rad + outRad * d1, rB = rad + outRad * d2;
      const rIn = Math.min(rA, rB), rOut = Math.max(rA, rB);
      const sOut = R.makeSphere(rOut).translate(sc);
      if (rIn <= 0.05) return sOut;
      const sIn = R.makeSphere(rIn).translate(sc);
      const res = sOut.cut(sIn);
      safeDelete(sOut); safeDelete(sIn);
      return res;
    };
    const fw = face.wrapped;
    if (face.geomType === 'SPHERE' && (oc.BRep_Tool.NaturalRestriction(fw) || face.edges.length <= 2)) {
      return sphereShell();
    }
    const off1 = mode === 'deboss' ? eps : -eps;
    const off2 = mode === 'deboss' ? -(d + eps) : (d + eps);
    let offSh = null, ts = null, sfs = null;
    try {
      const ob = new oc.BRepOffsetAPI_MakeOffsetShape();
      ob.PerformBySimple(fw, off1);
      offSh = ob.Shape();
      ob.delete();
      ts = new oc.BRepOffsetAPI_MakeThickSolid();
      ts.MakeThickSolidBySimple(offSh, off2);
      const raw = ts.Shape();
      ts.delete(); ts = null;
      sfs = new oc.ShapeFix_Solid(oc.TopoDS.Solid(raw));
      sfs.Perform();
      let res = R.cast(oc.TopoDS.Solid(sfs.Solid()));
      sfs.delete(); sfs = null;
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    } catch (err) {
      if (face.geomType === 'SPHERE') return sphereShell();
      throw err;
    } finally {
      safeDelete(offSh);
      if (ts && ts.delete) try { ts.delete(); } catch (_) {}
      if (sfs && sfs.delete) try { sfs.delete(); } catch (_) {}
    }
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
  function boolWithTopo(op, aShape, aTopo, aSelf, bShape, bTopo, bSelf, opTag) {
    let builder = null;
    try {
      const aW = aShape.wrapped, bW = bShape.wrapped;
      if (op === 'cut') builder = new oc.BRepAlgoAPI_Cut(aW, bW);
      else if (op === 'common') builder = new oc.BRepAlgoAPI_Common(aW, bW);
      else builder = new oc.BRepAlgoAPI_Fuse(aW, bW);
      builder.SetToFillHistory(true);
      builder.Build();
      builder.SimplifyResult(true, true, 1e-3);
      const res = R.cast(builder.Shape());
      if (!res || !R.isShape3D(res)) { safeDelete(res); throw new Error('Boolesche Verrechnung fehlgeschlagen.'); }
      const outTopo = propagateHistory(builder, [{ topo: aTopo, selfId: aSelf }, { topo: bTopo, selfId: bSelf }], res, opTag);
      return { shape: res, topo: outTopo };
    } finally {
      if (builder && builder.delete) try { builder.delete(); } catch (_) {}
    }
  }
  function fuseAllWithTopo(entries, ownInputs = false, opTag = 'U') {
    if (!entries.length) return null;
    if (entries.length === 1) {
      const e = entries[0];
      const topo = e.topo ? cloneTopoForShape(e.shape, e.topo, e.selfId || null) : ensureTopoComplete(e.shape, createTopoMap(), e.selfId || '$self');
      return { shape: e.shape, topo };
    }
    let cur = { shape: entries[0].shape, topo: entries[0].topo, selfId: entries[0].selfId || null };
    for (let i = 1; i < entries.length; i++) {
      const nxt = boolWithTopo('fuse', cur.shape, cur.topo, cur.selfId, entries[i].shape, entries[i].topo, entries[i].selfId || null, opTag + i);
      if (i > 1 || ownInputs) { safeDelete(cur.shape); freeTopoMap(cur.topo); }
      if (ownInputs) { safeDelete(entries[i].shape); freeTopoMap(entries[i].topo); }
      cur = { shape: nxt.shape, topo: nxt.topo, selfId: null };
    }
    return { shape: cur.shape, topo: cur.topo };
  }
  function safeDelete(s) { try { if (s && s.delete) s.delete(); } catch (_) {} }
  function polygonFace(pts3) { return R.makePolygon(pts3); }

  // ---------- Grundkörper ----------
  function revolveProfile(pts2) { // Profil in XZ-Ebene (x=Radius, z=Höhe) um Z drehen
    const face = polygonFace(pts2.map(([x, z]) => [x, 0, z]));
    return R.revolution(face, [0, 0, 0], [0, 0, 1], 360);
  }
  function makePrismWithTopo(pts3, vec3, prefix = '$self') {
    const wb = new oc.BRepBuilderAPI_MakeWire();
    const edgeSids = [];
    for (let i = 0; i < pts3.length; i++) {
      const p1 = pts3[i], p2 = pts3[(i + 1) % pts3.length];
      const e = R.makeLine(p1, p2);
      wb.Add(e.wrapped);
      edgeSids.push({ edge: wb.Edge(), sid: String(i) });
      e.delete();
    }
    wb.Build();
    const wire = wb.Wire(); wb.delete();
    const fb = new oc.BRepBuilderAPI_MakeFace(wire, false);
    const faceRaw = fb.Face(); fb.delete();
    const gv = new oc.gp_Vec(vec3[0], vec3[1], vec3[2]);
    const pr = new oc.BRepPrimAPI_MakePrism(faceRaw, gv, false, true);
    pr.Build();
    const res = R.cast(pr.Shape());
    const tm = createTopoMap();
    try {
      const outFaces = exploreUnique(res, oc.TopAbs_ShapeEnum.TopAbs_FACE);
      const outEdges = exploreUnique(res, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
      const matchOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
      try {
        const ff = pr.FirstShape();
        const mf = !ff.IsNull() ? matchOut(outFaces, ff) : null;
        if (mf) tmAdd(tm.faces, mf, `${prefix}/F:start`);
        safeDelete(ff);
      } catch (_) {}
      try {
        const lf = pr.LastShape();
        const mf = !lf.IsNull() ? matchOut(outFaces, lf) : null;
        if (mf) tmAdd(tm.faces, mf, `${prefix}/F:end`);
        safeDelete(lf);
      } catch (_) {}
      for (const { edge, sid } of edgeSids) {
        const gen = readShapeList(pr.Generated(edge));
        let k = 0;
        for (const g of gen) {
          if (g.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
            const mf = matchOut(outFaces, g);
            if (mf) tmAdd(tm.faces, mf, gen.length === 1 ? `${prefix}/F:side:${sid}` : `${prefix}/F:side:${sid}#${k++}`);
          }
          safeDelete(g);
        }
        try {
          const fe = pr.FirstShape(edge);
          const me = !fe.IsNull() ? matchOut(outEdges, fe) : null;
          if (me) tmAdd(tm.edges, me, `${prefix}/E:side:${sid}:start`);
          safeDelete(fe);
        } catch (_) {}
        try {
          const le = pr.LastShape(edge);
          const me = !le.IsNull() ? matchOut(outEdges, le) : null;
          if (me) tmAdd(tm.edges, me, `${prefix}/E:side:${sid}:end`);
          safeDelete(le);
        } catch (_) {}
      }
      for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
      for (const e of outEdges) if (!tmGet(tm.edges, e.s)) e.s.delete();
      ensureTopoComplete(res, tm, prefix);
    } finally {
      pr.delete(); gv.delete(); safeDelete(faceRaw); safeDelete(wire);
    }
    return { shape: res, topo: tm };
  }
  function buildPrimitiveWithTopo(kind, p) {
    if (kind === 'box') {
      const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
      const p1 = new oc.gp_Pnt(-w / 2, -d / 2, 0), p2 = new oc.gp_Pnt(w / 2, d / 2, h);
      const mk = new oc.BRepPrimAPI_MakeBox(p1, p2);
      const shape = R.cast(mk.Solid());
      const tm = createTopoMap();
      const outFaces = exploreUnique(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
      const tagBoxFace = (raw, tag) => {
        const hc = topoHc(raw);
        const found = outFaces.find((x) => x.hc === hc && x.s.IsSame(raw));
        if (found) tmAdd(tm.faces, found.s, tag);
        safeDelete(raw);
      };
      tagBoxFace(mk.TopFace(), '$self/F:top');
      tagBoxFace(mk.BottomFace(), '$self/F:bottom');
      tagBoxFace(mk.FrontFace(), '$self/F:px');
      tagBoxFace(mk.BackFace(), '$self/F:nx');
      tagBoxFace(mk.LeftFace(), '$self/F:ny');
      tagBoxFace(mk.RightFace(), '$self/F:py');
      for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
      mk.delete(); p1.delete(); p2.delete();
      ensureTopoComplete(shape, tm, '$self');
      return { shape, topo: tm };
    }
    if (kind === 'cylinder') {
      const r = pos(p.d, 20) / 2, h = pos(p.h, 20);
      const ax2 = R.makeAx2([0, 0, 0], [0, 0, 1]);
      const mk = new oc.BRepPrimAPI_MakeCylinder(ax2, r, h);
      const shape = R.cast(mk.Shape());
      const tm = createTopoMap();
      const cylFace = mk.Face();
      const outFaces = exploreUnique(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
      for (const f of outFaces) {
        if (f.s.IsSame(cylFace)) tmAdd(tm.faces, f.s, '$self/F:side');
        else {
          const rf = new R.Face(oc.TopoDS.Face(f.s));
          let nz = 0; try { nz = rf.normalAt().z; } catch (_) {}
          tmAdd(tm.faces, f.s, nz > 0 ? '$self/F:top' : '$self/F:bottom');
        }
      }
      safeDelete(cylFace); mk.delete(); ax2.delete();
      ensureTopoComplete(shape, tm, '$self');
      return { shape, topo: tm };
    }
    if (kind === 'tube') {
      const D = pos(p.d, 20), h = pos(p.h, 20), wall = pos(p.wall, 2);
      const outer = buildPrimitiveWithTopo('cylinder', { d: D, h });
      const di = D - 2 * wall;
      if (di <= 0.05) return outer;
      const ax2 = R.makeAx2([0, 0, -1], [0, 0, 1]);
      const mkIn = new oc.BRepPrimAPI_MakeCylinder(ax2, di / 2, h + 2);
      const innerShape = R.cast(mkIn.Shape());
      const innerFace = mkIn.Face();
      const inTm = createTopoMap();
      const inFaces = exploreUnique(innerShape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
      for (const f of inFaces) {
        if (f.s.IsSame(innerFace)) tmAdd(inTm.faces, f.s, '$self/F:inner');
        else f.s.delete();
      }
      safeDelete(innerFace); mkIn.delete(); ax2.delete();
      ensureTopoComplete(innerShape, inTm, '$self:in');
      const res = boolWithTopo('cut', outer.shape, outer.topo, null, innerShape, inTm, null, 'Tube');
      safeDelete(outer.shape); freeTopoMap(outer.topo);
      safeDelete(innerShape); freeTopoMap(inTm);
      return res;
    }
    if (kind === 'prism') {
      const n = Math.max(3, Math.min(64, Math.round(num(p.n, 6)))), r = pos(p.d, 20) / 2, h = pos(p.h, 20);
      const pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
      return makePrismWithTopo(pts, [0, 0, h], '$self');
    }
    if (kind === 'wedge') {
      const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
      const tri = [[-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [-w / 2, -d / 2, h]];
      return makePrismWithTopo(tri, [0, d, 0], '$self');
    }
    const shape = buildPrimitive(kind, p);
    const topo = ensureTopoComplete(shape, createTopoMap(), '$self');
    return { shape, topo };
  }
  const PRINT_FIT_MM = { loose: 0.4, slide: 0.2, snug: 0.1, press: 0 };
  const hasPrintFit = (k) => !!(k && Object.prototype.hasOwnProperty.call(PRINT_FIT_MM, k));
  const printFitDelta = (k) => (hasPrintFit(k) ? PRINT_FIT_MM[k] : 0);
  function buildPrimitive(kind, p) {
    switch (kind) {
      case 'box': {
        const w = pos(p.w, 20), d = pos(p.d, 20), h = pos(p.h, 20);
        return R.makeBox([-w / 2, -d / 2, 0], [w / 2, d / 2, h]);
      }
      case 'cylinder': {
        const pf = printFitDelta(p.printFit);
        const dEff = Math.max(0.2, pos(p.d, 20) + (p.printFitSign === 1 ? pf : -pf));
        return R.makeCylinder(dEff / 2, pos(p.h, 20), [0, 0, 0], [0, 0, 1]);
      }
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
  function loopWireTracked(loop, M, ccw = true) {
    const wb = new oc.BRepBuilderAPI_MakeWire();
    const edgeSids = [];
    const addEdge = (edgeObj, sid) => {
      wb.Add(edgeObj.wrapped);
      edgeSids.push({ edge: wb.Edge(), sid });
      edgeObj.delete();
    };
    try {
      if (loop.circle) {
        addEdge(R.makeCircle(loop.circle.r, M.P(loop.circle.c), ccw ? M.n : M.n.map((v) => -v)), loop.circle.sid || 'c');
      } else if (loop.ellipse) {
        const E = loop.ellipse; let a = E.rx, b = E.ry, rot = E.rot || 0;
        if (b > a) { const t = a; a = b; b = t; rot += Math.PI / 2; }
        const d2 = [Math.cos(rot), Math.sin(rot)], xd = [0, 1, 2].map((i) => M.x[i] * d2[0] + M.y[i] * d2[1]);
        const eObj = Math.abs(a - b) < 1e-6
          ? R.makeCircle(a, M.P(E.c), ccw ? M.n : M.n.map((v) => -v))
          : R.makeEllipse(a, b, M.P(E.c), ccw ? M.n : M.n.map((v) => -v), xd);
        addEdge(eObj, E.sid || 'el');
      } else {
        let segs = loop.segs;
        if ((loopArea(loop) > 0) !== ccw) {
          segs = segs.slice().reverse().map((s) => (s.t === 'bez' ? { ...s, a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { ...s, a: s.b, b: s.a }));
        }
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const sid = s.sid || ('s' + i);
          if (s.t === 'arc') addEdge(R.makeThreePointArc(M.P(s.a), M.P(s.m), M.P(s.b)), sid);
          else if (s.t === 'bez') addEdge(R.makeBezierCurve([M.P(s.a), M.P(s.c1), M.P(s.c2), M.P(s.b)]), sid);
          else if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= 1e-6) addEdge(R.makeLine(M.P(s.a), M.P(s.b)), sid);
        }
      }
      wb.Build();
      const wire = wb.Wire();
      return { wire, edgeSids };
    } finally { wb.delete(); }
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
  function buildRevolveWithTopo(p) {
    const M = planeMap(p.plane);
    const ax = p.axis || { a: [0, 0], b: [0, 1] };
    const c = p.axis3d && Array.isArray(p.axis3d.o) ? p.axis3d.o.map(Number) : M.P(ax.a);
    const d = p.axis3d && Array.isArray(p.axis3d.d) ? norm(p.axis3d.d.map(Number)) : norm(sub(M.P(ax.b), c));
    const regs = p.regions || [];
    if (!regs.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    const dir = p.dir || 'normal';
    if (dir === 'toFace') {
      const sh = buildRevolve(p);
      return { shape: sh, topo: ensureTopoComplete(sh, createTopoMap(), '$self') };
    }
    const entries = [];
    for (let rgIdx = 0; rgIdx < regs.length; rgIdx++) {
      const rg = regs[rgIdx];
      const outer = loopWireTracked(rg.outer, M, true);
      const holes = (rg.holes || []).map((h) => loopWireTracked(h, M, false));
      const allEdgeSids = [...outer.edgeSids, ...holes.flatMap((h) => h.edgeSids)];
      const fb = new oc.BRepBuilderAPI_MakeFace(outer.wire, false);
      for (const h of holes) fb.Add(h.wire);
      if (!fb.IsDone()) {
        fb.delete(); safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
        throw new Error('Aus dieser Skizze lässt sich keine Fläche bilden.');
      }
      let faceRaw = fb.Face(); fb.delete();
      safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
      let revDir = d, revAngle = 360, preRot = 0;
      if (dir === 'reverse') { revDir = mul(d, -1); revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      else if (dir === 'both') { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); if (revAngle < 360 - 1e-6) preRot = -revAngle / 2; }
      else if (dir === 'two') {
        const a1 = Math.max(0, Math.min(360, num(p.angle, 90))), a2 = Math.max(0, Math.min(360, num(p.angle2, a1)));
        const tot = Math.min(360, a1 + a2);
        if (tot < 0.1) { safeDelete(faceRaw); allEdgeSids.forEach((x) => safeDelete(x.edge)); throw new Error('Der Drehwinkel muss größer als 0° sein.'); }
        revAngle = tot;
        if (tot < 360 - 1e-6 && a2 > 1e-6) preRot = -a2;
      } else { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      let curEdges = allEdgeSids;
      if (Math.abs(preRot) > 1e-9) {
        const ax1p = R.makeAx1(c, revDir);
        const trsf = new oc.gp_Trsf();
        trsf.SetRotation(ax1p, (preRot * Math.PI) / 180);
        const tr = new oc.BRepBuilderAPI_Transform(faceRaw, trsf, true, false);
        const nf = oc.TopoDS.Face(tr.ModifiedShape(faceRaw));
        curEdges = allEdgeSids.map(({ edge, sid }) => {
          const ne = oc.TopoDS.Edge(tr.ModifiedShape(edge));
          safeDelete(edge);
          return { edge: ne, sid };
        });
        safeDelete(faceRaw); faceRaw = nf;
        tr.delete(); trsf.delete(); ax1p.delete();
      }
      const ax1 = R.makeAx1(c, revDir);
      const rev = new oc.BRepPrimAPI_MakeRevol(faceRaw, ax1, (revAngle * Math.PI) / 180, false);
      rev.Build();
      const solid = R.cast(rev.Shape());
      const tm = createTopoMap();
      try {
        const rPref = regs.length > 1 ? `$self/F:r${rgIdx}:` : '$self/F:';
        const ePref = regs.length > 1 ? `$self/E:r${rgIdx}:` : '$self/E:';
        const outFaces = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE);
        const outEdges = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
        const matchOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
        if (revAngle < 360 - 1e-6) {
          try { const ff = rev.FirstShape(); const mf = !ff.IsNull() ? matchOut(outFaces, ff) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}start`); safeDelete(ff); } catch (_) {}
          try { const lf = rev.LastShape(); const mf = !lf.IsNull() ? matchOut(outFaces, lf) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}end`); safeDelete(lf); } catch (_) {}
        }
        const usedSide = new Map();
        for (const { edge, sid } of curEdges) {
          const gen = readShapeList(rev.Generated(edge));
          const cnt = usedSide.get(sid) || 0;
          usedSide.set(sid, cnt + 1);
          const baseSid = cnt === 0 ? sid : `${sid}#${cnt}`;
          let k = 0;
          for (const g of gen) {
            if (g.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const mf = matchOut(outFaces, g);
              if (mf && !tmGet(tm.faces, mf)) tmAdd(tm.faces, mf, gen.length === 1 ? `${rPref}sk:${baseSid}` : `${rPref}sk:${baseSid}:${k++}`);
            }
            safeDelete(g);
          }
          if (revAngle < 360 - 1e-6) {
            try { const fe = rev.FirstShape(edge); const me = !fe.IsNull() ? matchOut(outEdges, fe) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:start`); safeDelete(fe); } catch (_) {}
            try { const le = rev.LastShape(edge); const me = !le.IsNull() ? matchOut(outEdges, le) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:end`); safeDelete(le); } catch (_) {}
          }
          safeDelete(edge);
        }
        for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
        for (const e of outEdges) if (!tmGet(tm.edges, e.s)) e.s.delete();
        ensureTopoComplete(solid, tm, '$self');
      } finally {
        rev.delete(); ax1.delete(); safeDelete(faceRaw);
      }
      entries.push({ shape: solid, topo: tm, selfId: null });
    }
    return fuseAllWithTopo(entries, true, 'Rv');
  }
  function buildExtrudeWithTopo(p) {
    if (p.thinError) throw new Error(p.thinError);
    const M = planeMap(p.plane);
    const dist = pos(p.dist, 10);
    const extra = num(p.extra, 0);
    const dir = p.dir || 'normal';
    const regs = p.regions || [];
    if (!regs.length) throw new Error(p.thin ? 'Die Skizze hat keine Linie und keinen Umriss für eine dünne Wand.' : 'Die Skizze hat keine geschlossene Fläche.');
    const entries = [];
    for (let rgIdx = 0; rgIdx < regs.length; rgIdx++) {
      const rg = regs[rgIdx];
      const outer = loopWireTracked(rg.outer, M, true);
      const holes = (rg.holes || []).map((h) => loopWireTracked(h, M, false));
      const allEdgeSids = [...outer.edgeSids, ...holes.flatMap((h) => h.edgeSids)];
      const fb = new oc.BRepBuilderAPI_MakeFace(outer.wire, false);
      for (const h of holes) fb.Add(h.wire);
      if (!fb.IsDone()) {
        fb.delete(); safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
        throw new Error('Aus dieser Skizze lässt sich keine Fläche bilden.');
      }
      let faceRaw = fb.Face(); fb.delete();
      safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
      let shift = [0, 0, 0], v;
      if (dir === 'both') { shift = mul(M.n, -dist / 2); v = mul(M.n, dist); }
      else if (dir === 'two') { const d2 = pos(p.dist2, dist); shift = mul(M.n, -d2); v = mul(M.n, dist + d2); }
      else if (dir === 'reverse') { if (extra) shift = mul(M.n, extra); v = mul(M.n, -(dist + extra)); }
      else { if (extra) shift = mul(M.n, -extra); v = mul(M.n, dist + extra); }
      let shiftedEdges = allEdgeSids;
      if (Math.hypot(shift[0], shift[1], shift[2]) > 1e-12) {
        const trsf = new oc.gp_Trsf();
        const sv = new oc.gp_Vec(shift[0], shift[1], shift[2]);
        trsf.SetTranslation(sv);
        const tr = new oc.BRepBuilderAPI_Transform(faceRaw, trsf, true, false);
        const newFace = oc.TopoDS.Face(tr.ModifiedShape(faceRaw));
        shiftedEdges = allEdgeSids.map(({ edge, sid }) => {
          const ne = oc.TopoDS.Edge(tr.ModifiedShape(edge));
          safeDelete(edge);
          return { edge: ne, sid };
        });
        safeDelete(faceRaw); faceRaw = newFace;
        tr.delete(); trsf.delete(); sv.delete();
      }
      const gv = new oc.gp_Vec(v[0], v[1], v[2]);
      const pr = new oc.BRepPrimAPI_MakePrism(faceRaw, gv, false, true);
      pr.Build();
      const solid = R.cast(pr.Shape());
      const tm = createTopoMap();
      try {
        const rPref = regs.length > 1 ? `$self/F:r${rgIdx}:` : '$self/F:';
        const ePref = regs.length > 1 ? `$self/E:r${rgIdx}:` : '$self/E:';
        const outFaces = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE);
        const outEdges = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
        const matchOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
        try {
          const ff = pr.FirstShape();
          const mf = !ff.IsNull() ? matchOut(outFaces, ff) : null;
          if (mf) tmAdd(tm.faces, mf, `${rPref}start`);
          safeDelete(ff);
        } catch (_) {}
        try {
          const lf = pr.LastShape();
          const mf = !lf.IsNull() ? matchOut(outFaces, lf) : null;
          if (mf) tmAdd(tm.faces, mf, `${rPref}end`);
          safeDelete(lf);
        } catch (_) {}
        const usedSide = new Map();
        for (const { edge, sid } of shiftedEdges) {
          const gen = readShapeList(pr.Generated(edge));
          const cnt = usedSide.get(sid) || 0;
          usedSide.set(sid, cnt + 1);
          const baseSid = cnt === 0 ? sid : `${sid}#${cnt}`;
          let k = 0;
          for (const g of gen) {
            if (g.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const mf = matchOut(outFaces, g);
              if (mf && !tmGet(tm.faces, mf)) tmAdd(tm.faces, mf, gen.length === 1 ? `${rPref}sk:${baseSid}` : `${rPref}sk:${baseSid}:${k++}`);
            }
            safeDelete(g);
          }
          try {
            const fe = pr.FirstShape(edge);
            const me = !fe.IsNull() ? matchOut(outEdges, fe) : null;
            if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:start`);
            safeDelete(fe);
          } catch (_) {}
          try {
            const le = pr.LastShape(edge);
            const me = !le.IsNull() ? matchOut(outEdges, le) : null;
            if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:end`);
            safeDelete(le);
          } catch (_) {}
          safeDelete(edge);
        }
        for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
        for (const e of outEdges) if (!tmGet(tm.edges, e.s)) e.s.delete();
        ensureTopoComplete(solid, tm, '$self');
      } finally {
        pr.delete(); gv.delete(); safeDelete(faceRaw);
      }
      entries.push({ shape: solid, topo: tm, selfId: null });
    }
    return fuseAllWithTopo(entries, true, 'Ex');
  }
  function isDynamicExtent(p) { return !!(p && (p.extent === 'toNext' || p.extent === 'toFace')); }
  function hasDynamicExtent(it) {
    if (!it || it.hidden) return false;
    if (it.kind === 'extrude') return isDynamicExtent(it.p);
    if (it.kind === 'group') return (it.children || []).some((c) => !c.hidden && hasDynamicExtent(c));
    return false;
  }
  function relInBox(p, bb) {
    return [0, 1, 2].map((k) => { const sp = bb[k + 3] - bb[k]; return sp > 1e-6 ? (p[k] - bb[k]) / sp : 0.5; });
  }
  function cornersOf(b) {
    return [
      [b[0], b[1], b[2]], [b[3], b[1], b[2]], [b[0], b[4], b[2]], [b[3], b[4], b[2]],
      [b[0], b[1], b[5]], [b[3], b[1], b[5]], [b[0], b[4], b[5]], [b[3], b[4], b[5]],
    ];
  }
  function alignedFrameInv(oW, dirW) {
    const z = norm(dirW);
    const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const x = norm(cross(ref, z));
    const y = cross(z, x);
    return matInvRigid([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, oW[0], oW[1], oW[2], 1]);
  }
  function alignedTBounds(shape, FInv) {
    const tr = applyMatrix(shape, FInv);
    const b = bboxOf(tr);
    safeDelete(tr);
    return [b[2], b[5]];
  }
  function extractSolids(shape) {
    if (!shape || !shape.wrapped) return [];
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(shape.wrapped, TA.TopAbs_SOLID, TA.TopAbs_SHAPE);
    const out = [];
    try {
      while (ex.More()) {
        try { out.push(R.cast(ex.Current())); } catch (_) {}
        ex.Next();
      }
    } finally { ex.delete(); }
    return out;
  }
  function sliceWithPlane(shape, pPt, pDir, span) {
    const n = norm(pDir);
    const b = bboxOf(shape);
    const sc = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const proj = sub(sc, mul(n, dot(sub(sc, pPt), n)));
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(ref, n)), v = cross(n, u);
    const diag = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const S = Math.max(500, span * 4, diag * 4);
    const pts = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([a, c]) => [
      proj[0] + u[0] * a + v[0] * c,
      proj[1] + u[1] * a + v[1] * c,
      proj[2] + u[2] * a + v[2] * c,
    ]);
    const face = polygonFace(pts);
    const halfBox = R.basicFaceExtrusion(face, new R.Vector(mul(n, S)));
    try { return shape.cut(halfBox); } finally { safeDelete(halfBox); }
  }
  function matchFaceOnShape(shape, ref, useWorld = false) {
    const fl = topoList(shape, 'face');
    const bb = bboxOf(shape);
    const refC = useWorld && ref.wc ? ref.wc : ref.c;
    const refN = useWorld && ref.wn ? ref.wn : ref.n;
    const cands = [];
    try {
      for (let idx = 0; idx < fl.length; idx++) {
        const info = faceInfo(fl[idx].shape);
        if (ref.t && info.t !== ref.t) continue;
        if (info.t === 'PLANE' && refN && info.n && dot(info.n, refN) < 0.99) continue;
        const dd = refC && info.c ? len(sub(info.c, refC)) : 0;
        let relDist = 0;
        if (!useWorld && ref.rel && info.c) {
          const gr = relInBox(info.c, bb);
          relDist = Math.hypot(gr[0] - ref.rel[0], gr[1] - ref.rel[1], gr[2] - ref.rel[2]);
        }
        cands.push({ idx, info, dd, relDist });
      }
      if (cands.length) {
        cands.sort((a, b) => {
          const aEx = a.dd < 1e-3 ? 0 : 1, bEx = b.dd < 1e-3 ? 0 : 1;
          if (aEx !== bEx) return aEx - bEx;
          if (!useWorld && ref.rel && Math.abs(a.relDist - b.relDist) > 0.02) return a.relDist - b.relDist;
          if (Math.abs(a.dd - b.dd) > 1e-3) return a.dd - b.dd;
          return (a.idx === ref.idx ? 0 : 1) - (b.idx === ref.idx ? 0 : 1);
        });
        return { faceIdx: cands[0].idx, info: cands[0].info };
      }
      if (ref.idx != null && fl[ref.idx]) {
        const info = faceInfo(fl[ref.idx].shape);
        if (!ref.t || info.t === ref.t) return { faceIdx: ref.idx, info };
      }
      return null;
    } finally {
      for (const x of fl) x.shape.delete();
    }
  }
  function sampleRegionsLocal(regions, M) {
    const pts = [];
    let sx = 0, sy = 0, cnt = 0;
    const addUV = (uv) => { pts.push(M.P(uv)); sx += uv[0]; sy += uv[1]; cnt++; };
    for (const rg of regions || []) {
      const lp = rg.outer; if (!lp) continue;
      if (lp.circle) {
        const { c, r } = lp.circle;
        addUV(c);
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; addUV([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
      } else if (lp.ellipse) {
        const { c, rx, ry, rot = 0 } = lp.ellipse;
        const co = Math.cos(rot), si = Math.sin(rot);
        addUV(c);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4, lx = rx * Math.cos(a), ly = ry * Math.sin(a);
          addUV([c[0] + lx * co - ly * si, c[1] + lx * si + ly * co]);
        }
      } else if (Array.isArray(lp.segs)) {
        for (const s of lp.segs) { if (s.a) addUV(s.a); if (s.m) addUV(s.m); if (s.b) addUV(s.b); }
      }
    }
    const center = cnt ? M.P([sx / cnt, sy / cnt]) : M.o.slice();
    if (!pts.length) pts.push(M.o.slice());
    return { center, pts };
  }
  // Hochziehen bis zur nächsten Fläche („toNext“) oder bis zu einer gewählten Fläche („toFace“)
  function buildExtrudeToTarget(it, W, ctx) {
    const p = it.p || {};
    if (p.thinError) throw new Error(p.thinError);
    if (!(p.regions && p.regions.length)) throw new Error(p.thin ? 'Die Skizze hat keine Linie und keinen Umriss für eine dünne Wand.' : 'Die Skizze hat keine geschlossene Fläche.');
    const M = planeMap(p.plane);
    const dir = p.dir || 'normal';
    const sgn = dir === 'reverse' ? -1 : 1;
    const dirL = mul(M.n, sgn);
    const extra = num(p.extra, 0);
    const backShift = dir === 'two' ? pos(p.dist2, 10) : extra;
    const oW = transformPoint(W, M.o);
    const dirW = mul(transformDir(W, M.n), sgn);
    const WInv = matInvRigid(W);
    const samples = sampleRegionsLocal(p.regions, M);
    const centerW = transformPoint(W, samples.center);
    const samplePtsW = samples.pts.map((q) => transformPoint(W, q));

    const buildPrism = (dist, back = backShift) => {
      const d = Math.max(0.01, dist);
      const solids = [];
      for (const rg of p.regions) {
        let face = regionFace(rg, M);
        if (back > 0) face = face.translate(mul(dirL, -back));
        else if (back < 0) face = face.translate(mul(dirL, -back));
        solids.push(R.basicFaceExtrusion(face, new R.Vector(mul(dirL, d + back))));
      }
      return fuseAll(solids, true);
    };
    const extrudeToPlane = (pF, nF, label) => {
      const cosA = dot(dirW, nF);
      if (Math.abs(cosA) < 1e-4) throw new Error(`${label}: Die Zielfläche liegt parallel zur Ziehrichtung.`);
      const ts = samplePtsW.map((q) => dot(sub(pF, q), nF) / cosA);
      const tCenter = dot(sub(pF, centerW), nF) / cosA;
      const tMax = Math.max(tCenter, ...ts);
      if (tMax <= 1e-4) throw new Error(`${label}: Die Zielfläche liegt hinter der Skizze – dreh die Richtung um oder wähl eine andere Fläche.`);
      if (Math.abs(Math.abs(cosA) - 1) < 1e-5) {
        const d = Math.max(0.01, tCenter);
        return { shape: buildPrism(d), dist: d };
      }
      const raw = buildPrism(tMax + 10);
      const pFL = transformPoint(WInv, pF), nFL = transformDir(WInv, nF);
      const nOut = dot(nFL, dirL) > 0 ? nFL : mul(nFL, -1);
      try {
        const sliced = sliceWithPlane(raw, pFL, nOut, tMax + 20);
        return { shape: sliced, dist: Math.max(0.01, tCenter) };
      } finally { safeDelete(raw); }
    };

    const pool = (ctx && ctx.pool) || [];
    const refErr = (m) => { const e = new Error(m); e.code = 'ref'; return e; };
    if (p.extent === 'toFace') {
      const ref = p.toFace;
      if (!ref) throw refErr('Bis zu gewählter Fläche: Keine Zielfläche gewählt – klick eine Fläche im Bild an.');
      if (ref.datumId) {
        if (ref.missing || !ref.plane || !ref.plane.o || !ref.plane.n) throw refErr('Bis zu gewählter Fläche: Die gewählte Bezugsebene fehlt.');
        const r = extrudeToPlane(ref.plane.o, norm(ref.plane.n), 'Bis zu gewählter Fläche');
        return { shape: r.shape, resolved: { dist: Math.round(r.dist * 1e6) / 1e6, targetId: ref.datumId } };
      }
      let tid = ref.id;
      const wasConsumed = !!(ctx && ctx.consumed && ctx.consumed.has(tid));
      while (tid && ctx && ctx.consumed && ctx.consumed.has(tid)) tid = ctx.consumed.get(tid);
      const T = pool.find((e) => e.ids.has(tid));
      if (!T) throw refErr('Bis zu gewählter Fläche: Der Zielkörper fehlt oder ist ausgeblendet.');
      if (T.id === it.id) throw new Error('Bis zu gewählter Fläche: Das Teil kann nicht bis zu sich selbst hochgezogen werden.');
      const useWorld = wasConsumed && T.id !== ref.id;
      const matched = matchFaceOnShape(useWorld ? T.worldShape : T.localShape, ref, useWorld);
      if (!matched) throw refErr('Bis zu gewählter Fläche: Die gewählte Fläche wurde nicht mehr gefunden.');
      const fi = matched.info;
      if (fi.t === 'PLANE' && fi.n && fi.c) {
        const pF = useWorld ? fi.c : transformPoint(T.m, fi.c);
        const nF = useWorld ? norm(fi.n) : transformDir(T.m, fi.n);
        const r = extrudeToPlane(pF, nF, 'Bis zu gewählter Fläche');
        return { shape: r.shape, resolved: { dist: Math.round(r.dist * 1e6) / 1e6, targetId: T.id } };
      }
      // gekrümmte Zielfläche (Zylinder, Kegel, Kugel, Ring)
      const L = Math.max(10, ...cornersOf(T.wb).map((c) => dot(sub(c, oW), dirW))) + 20;
      const probeLocal = buildPrism(L, -1e-3);
      const probeW = applyMatrix(probeLocal, W);
      safeDelete(probeLocal);
      let inter = null;
      try { inter = probeW.intersect(T.worldShape); } catch (_) { inter = null; } finally { safeDelete(probeW); }
      const sols = extractSolids(inter);
      safeDelete(inter);
      const FInv = alignedFrameInv(oW, dirW);
      let bestT = Infinity, bestMode = 'outside';
      for (const s of sols) {
        const [t0, t1] = alignedTBounds(s, FInv);
        safeDelete(s);
        if (t1 - t0 < 1e-4) continue;
        const mode = t0 <= 2e-3 ? 'inside' : 'outside';
        const d = mode === 'inside' ? t1 : t0;
        if (d > 1e-4 && d < bestT) { bestT = d; bestMode = mode; }
      }
      if (!isFinite(bestT)) throw new Error('Bis zu gewählter Fläche: Die Skizze trifft den Zielkörper in dieser Richtung nicht.');
      const tLocal = applyMatrix(T.worldShape, WInv);
      const fullLocal = buildPrism(L, backShift);
      const FLocInv = alignedFrameInv(M.o, dirL);
      try {
        const boolRes = bestMode === 'outside' ? fullLocal.cut(tLocal) : fullLocal.intersect(tLocal);
        const bSols = extractSolids(boolRes);
        safeDelete(boolRes);
        let picked = null, pickedT1 = 0;
        for (const s of bSols) {
          const [t0, t1] = alignedTBounds(s, FLocInv);
          if (t0 <= 0.1 && t1 > 1e-4 && (!picked || t1 < pickedT1)) { if (picked) safeDelete(picked); picked = s; pickedT1 = t1; }
          else safeDelete(s);
        }
        if (picked && pickedT1 < L - 1) return { shape: picked, resolved: { dist: Math.round(pickedT1 * 1e6) / 1e6, targetId: T.id } };
        if (picked) safeDelete(picked);
        return { shape: buildPrism(bestT), resolved: { dist: Math.round(bestT * 1e6) / 1e6, targetId: T.id } };
      } finally { safeDelete(tLocal); safeDelete(fullLocal); }
    }

    // „Bis zur nächsten Fläche“
    const cands = [];
    let maxProj = 0;
    for (const C of pool) {
      if (C.id === it.id) continue;
      let mp = -Infinity;
      for (const q of cornersOf(C.wb)) mp = Math.max(mp, dot(sub(q, oW), dirW));
      if (mp > 1e-3) { cands.push(C); maxProj = Math.max(maxProj, mp); }
    }
    if (!cands.length) throw new Error('Bis zur nächsten Fläche: In dieser Richtung liegt kein Körper – prüf die Richtung oder wähl eine feste Höhe.');
    const L = maxProj + 20;
    const probeLocal = buildPrism(L, -1e-3);
    const probeW = applyMatrix(probeLocal, W);
    safeDelete(probeLocal);
    const probeWB = bboxOf(probeW);
    const FInv = alignedFrameInv(oW, dirW);
    let best = null;
    try {
      for (const C of cands) {
        if (!bboxHit(probeWB, C.wb)) continue;
        let inter = null;
        try { inter = probeW.intersect(C.worldShape); } catch (_) { continue; }
        const sols = extractSolids(inter);
        safeDelete(inter);
        for (const s of sols) {
          const [t0, t1] = alignedTBounds(s, FInv);
          if (t1 - t0 < 1e-4) { safeDelete(s); continue; }
          const mode = t0 <= 2e-3 ? 'inside' : 'outside';
          const d = mode === 'inside' ? t1 : t0;
          if (d > 1e-4 && (!best || d < best.t)) {
            if (best) safeDelete(best.solid);
            best = { C, solid: s, mode, t: d, tMax: t1 };
          } else safeDelete(s);
        }
      }
    } finally { safeDelete(probeW); }
    if (!best) throw new Error('Bis zur nächsten Fläche: In dieser Richtung liegt keine Fläche vor der Skizze – prüf die Richtung oder wähl eine feste Höhe.');

    let shape = null, resolvedDist = best.t;
    try {
      const fl = topoList(best.solid, 'face');
      const hitFaces = [];
      try {
        for (const f of fl) {
          const info = faceInfo(f.shape);
          if (info.t === 'CYLINDRE' && Array.isArray(info.axis) && Math.abs(dot(norm(info.axis.slice(3, 6)), dirW)) > 1 - 1e-4) continue;
          if (best.mode === 'outside') {
            if (info.t === 'PLANE' && info.n && dot(info.n, dirW) < -1e-4) hitFaces.push(info);
            else if (info.t !== 'PLANE') hitFaces.push(info);
          } else {
            if (info.t === 'PLANE' && info.n && dot(info.n, dirW) > 1e-4) hitFaces.push(info);
            else if (info.t !== 'PLANE') hitFaces.push(info);
          }
        }
      } finally { for (const f of fl) f.shape.delete(); }

      const planeHits = hitFaces.filter((f) => f.t === 'PLANE' && f.n && f.c);
      const perpHits = planeHits.filter((f) => Math.abs(dot(f.n, dirW)) > 1 - 1e-4 && Math.abs(dot(sub(f.c, oW), dirW) - best.t) < 2e-3);
      if (perpHits.length === 1) {
        const d = Math.max(0.01, dot(sub(perpHits[0].c, oW), dirW));
        shape = buildPrism(d);
        resolvedDist = d;
      } else if (best.mode === 'outside' && planeHits.length === 1 && hitFaces.length === 1) {
        const r = extrudeToPlane(planeHits[0].c, planeHits[0].n, 'Bis zur nächsten Fläche');
        shape = r.shape; resolvedDist = r.dist;
      } else if (best.mode === 'inside' && planeHits.length === 1 && hitFaces.length === 1) {
        const r = extrudeToPlane(planeHits[0].c, planeHits[0].n, 'Bis zur nächsten Fläche');
        shape = r.shape; resolvedDist = r.dist;
      } else if (best.mode === 'outside') {
        const tLocal = applyMatrix(best.C.worldShape, WInv);
        const fullLocal = buildPrism(L, backShift);
        const FLocInv = alignedFrameInv(M.o, dirL);
        try {
          const cut = fullLocal.cut(tLocal);
          const cutSols = extractSolids(cut);
          safeDelete(cut);
          let picked = null, pickedT1 = 0;
          for (const s of cutSols) {
            const [t0, t1] = alignedTBounds(s, FLocInv);
            if (t0 <= 0.1 && t1 > 1e-4 && (!picked || t1 < pickedT1)) { if (picked) safeDelete(picked); picked = s; pickedT1 = t1; }
            else safeDelete(s);
          }
          if (picked && pickedT1 < L - 1) { shape = picked; resolvedDist = pickedT1; }
          else { if (picked) safeDelete(picked); shape = buildPrism(best.t); resolvedDist = best.t; }
        } finally { safeDelete(tLocal); safeDelete(fullLocal); }
      } else {
        const inLoc = applyMatrix(best.solid, WInv);
        if (backShift > 0) {
          const tail = buildPrism(0.02, backShift);
          try { shape = fuseAll([tail, inLoc], true); } catch (_) { safeDelete(tail); shape = inLoc; }
        } else shape = inLoc;
        resolvedDist = best.t;
      }
      return { shape, resolved: { dist: Math.round(resolvedDist * 1e6) / 1e6, targetId: best.C.id } };
    } finally { safeDelete(best.solid); }
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
  function buildRevolveWithTopo(p) {
    const M = planeMap(p.plane);
    const ax = p.axis || { a: [0, 0], b: [0, 1] };
    const c = p.axis3d && Array.isArray(p.axis3d.o) ? p.axis3d.o.map(Number) : M.P(ax.a);
    const d = p.axis3d && Array.isArray(p.axis3d.d) ? norm(p.axis3d.d.map(Number)) : norm(sub(M.P(ax.b), c));
    const regs = p.regions || [];
    if (!regs.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    const dir = p.dir || 'normal';
    if (dir === 'toFace') {
      const sh = buildRevolve(p);
      return { shape: sh, topo: ensureTopoComplete(sh, createTopoMap(), '$self') };
    }
    const entries = [];
    for (let rgIdx = 0; rgIdx < regs.length; rgIdx++) {
      const rg = regs[rgIdx];
      const outer = loopWireTracked(rg.outer, M, true);
      const holes = (rg.holes || []).map((h) => loopWireTracked(h, M, false));
      const allEdgeSids = [...outer.edgeSids, ...holes.flatMap((h) => h.edgeSids)];
      const fb = new oc.BRepBuilderAPI_MakeFace(outer.wire, false);
      for (const h of holes) fb.Add(h.wire);
      if (!fb.IsDone()) {
        fb.delete(); safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
        throw new Error('Aus dieser Skizze lässt sich keine Fläche bilden.');
      }
      let faceRaw = fb.Face(); fb.delete();
      safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
      let revDir = d, revAngle = 360, preRot = 0;
      if (dir === 'reverse') { revDir = mul(d, -1); revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      else if (dir === 'both') { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); if (revAngle < 360 - 1e-6) preRot = -revAngle / 2; }
      else if (dir === 'two') {
        const a1 = Math.max(0, Math.min(360, num(p.angle, 90))), a2 = Math.max(0, Math.min(360, num(p.angle2, a1)));
        const tot = Math.min(360, a1 + a2);
        if (tot < 0.1) { safeDelete(faceRaw); allEdgeSids.forEach((x) => safeDelete(x.edge)); throw new Error('Der Drehwinkel muss größer als 0° sein.'); }
        revAngle = tot;
        if (tot < 360 - 1e-6 && a2 > 1e-6) preRot = -a2;
      } else { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      let curEdges = allEdgeSids;
      if (Math.abs(preRot) > 1e-9) {
        const ax1p = R.makeAx1(c, revDir);
        const trsf = new oc.gp_Trsf();
        trsf.SetRotation(ax1p, (preRot * Math.PI) / 180);
        const tr = new oc.BRepBuilderAPI_Transform(faceRaw, trsf, true, false);
        const nf = oc.TopoDS.Face(tr.ModifiedShape(faceRaw));
        curEdges = allEdgeSids.map(({ edge, sid }) => {
          const ne = oc.TopoDS.Edge(tr.ModifiedShape(edge));
          safeDelete(edge);
          return { edge: ne, sid };
        });
        safeDelete(faceRaw); faceRaw = nf;
        tr.delete(); trsf.delete(); ax1p.delete();
      }
      const ax1 = R.makeAx1(c, revDir);
      const rev = new oc.BRepPrimAPI_MakeRevol(faceRaw, ax1, (revAngle * Math.PI) / 180, false);
      rev.Build();
      const solid = R.cast(rev.Shape());
      const tm = createTopoMap();
      try {
        const rPref = regs.length > 1 ? `$self/F:r${rgIdx}:` : '$self/F:';
        const ePref = regs.length > 1 ? `$self/E:r${rgIdx}:` : '$self/E:';
        const outFaces = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE);
        const outEdges = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
        const matchOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
        if (revAngle < 360 - 1e-6) {
          try { const ff = rev.FirstShape(); const mf = !ff.IsNull() ? matchOut(outFaces, ff) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}start`); safeDelete(ff); } catch (_) {}
          try { const lf = rev.LastShape(); const mf = !lf.IsNull() ? matchOut(outFaces, lf) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}end`); safeDelete(lf); } catch (_) {}
        }
        const usedSide = new Map();
        for (const { edge, sid } of curEdges) {
          const gen = readShapeList(rev.Generated(edge));
          const cnt = usedSide.get(sid) || 0;
          usedSide.set(sid, cnt + 1);
          const baseSid = cnt === 0 ? sid : `${sid}#${cnt}`;
          let k = 0;
          for (const g of gen) {
            if (g.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const mf = matchOut(outFaces, g);
              if (mf && !tmGet(tm.faces, mf)) tmAdd(tm.faces, mf, gen.length === 1 ? `${rPref}sk:${baseSid}` : `${rPref}sk:${baseSid}:${k++}`);
            }
            safeDelete(g);
          }
          if (revAngle < 360 - 1e-6) {
            try { const fe = rev.FirstShape(edge); const me = !fe.IsNull() ? matchOut(outEdges, fe) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:start`); safeDelete(fe); } catch (_) {}
            try { const le = rev.LastShape(edge); const me = !le.IsNull() ? matchOut(outEdges, le) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:end`); safeDelete(le); } catch (_) {}
          }
          safeDelete(edge);
        }
        for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
        for (const e of outEdges) if (!tmGet(tm.edges, e.s)) e.s.delete();
        ensureTopoComplete(solid, tm, '$self');
      } finally {
        rev.delete(); ax1.delete(); safeDelete(faceRaw);
      }
      entries.push({ shape: solid, topo: tm, selfId: null });
    }
    return fuseAllWithTopo(entries, true, 'Rv');
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
  function buildRevolveWithTopo(p) {
    const M = planeMap(p.plane);
    const ax = p.axis || { a: [0, 0], b: [0, 1] };
    const c = p.axis3d && Array.isArray(p.axis3d.o) ? p.axis3d.o.map(Number) : M.P(ax.a);
    const d = p.axis3d && Array.isArray(p.axis3d.d) ? norm(p.axis3d.d.map(Number)) : norm(sub(M.P(ax.b), c));
    const regs = p.regions || [];
    if (!regs.length) throw new Error('Die Skizze hat keine geschlossene Fläche.');
    const dir = p.dir || 'normal';
    if (dir === 'toFace') {
      const sh = buildRevolve(p);
      return { shape: sh, topo: ensureTopoComplete(sh, createTopoMap(), '$self') };
    }
    const entries = [];
    for (let rgIdx = 0; rgIdx < regs.length; rgIdx++) {
      const rg = regs[rgIdx];
      const outer = loopWireTracked(rg.outer, M, true);
      const holes = (rg.holes || []).map((h) => loopWireTracked(h, M, false));
      const allEdgeSids = [...outer.edgeSids, ...holes.flatMap((h) => h.edgeSids)];
      const fb = new oc.BRepBuilderAPI_MakeFace(outer.wire, false);
      for (const h of holes) fb.Add(h.wire);
      if (!fb.IsDone()) {
        fb.delete(); safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
        throw new Error('Aus dieser Skizze lässt sich keine Fläche bilden.');
      }
      let faceRaw = fb.Face(); fb.delete();
      safeDelete(outer.wire); holes.forEach((h) => safeDelete(h.wire));
      let revDir = d, revAngle = 360, preRot = 0;
      if (dir === 'reverse') { revDir = mul(d, -1); revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      else if (dir === 'both') { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); if (revAngle < 360 - 1e-6) preRot = -revAngle / 2; }
      else if (dir === 'two') {
        const a1 = Math.max(0, Math.min(360, num(p.angle, 90))), a2 = Math.max(0, Math.min(360, num(p.angle2, a1)));
        const tot = Math.min(360, a1 + a2);
        if (tot < 0.1) { safeDelete(faceRaw); allEdgeSids.forEach((x) => safeDelete(x.edge)); throw new Error('Der Drehwinkel muss größer als 0° sein.'); }
        revAngle = tot;
        if (tot < 360 - 1e-6 && a2 > 1e-6) preRot = -a2;
      } else { revAngle = Math.max(0.1, Math.min(360, num(p.angle, 360))); }
      let curEdges = allEdgeSids;
      if (Math.abs(preRot) > 1e-9) {
        const ax1p = R.makeAx1(c, revDir);
        const trsf = new oc.gp_Trsf();
        trsf.SetRotation(ax1p, (preRot * Math.PI) / 180);
        const tr = new oc.BRepBuilderAPI_Transform(faceRaw, trsf, true, false);
        const nf = oc.TopoDS.Face(tr.ModifiedShape(faceRaw));
        curEdges = allEdgeSids.map(({ edge, sid }) => {
          const ne = oc.TopoDS.Edge(tr.ModifiedShape(edge));
          safeDelete(edge);
          return { edge: ne, sid };
        });
        safeDelete(faceRaw); faceRaw = nf;
        tr.delete(); trsf.delete(); ax1p.delete();
      }
      const ax1 = R.makeAx1(c, revDir);
      const rev = new oc.BRepPrimAPI_MakeRevol(faceRaw, ax1, (revAngle * Math.PI) / 180, false);
      rev.Build();
      const solid = R.cast(rev.Shape());
      const tm = createTopoMap();
      try {
        const rPref = regs.length > 1 ? `$self/F:r${rgIdx}:` : '$self/F:';
        const ePref = regs.length > 1 ? `$self/E:r${rgIdx}:` : '$self/E:';
        const outFaces = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE);
        const outEdges = exploreUnique(solid, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
        const matchOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
        if (revAngle < 360 - 1e-6) {
          try { const ff = rev.FirstShape(); const mf = !ff.IsNull() ? matchOut(outFaces, ff) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}start`); safeDelete(ff); } catch (_) {}
          try { const lf = rev.LastShape(); const mf = !lf.IsNull() ? matchOut(outFaces, lf) : null; if (mf) tmAdd(tm.faces, mf, `${rPref}end`); safeDelete(lf); } catch (_) {}
        }
        const usedSide = new Map();
        for (const { edge, sid } of curEdges) {
          const gen = readShapeList(rev.Generated(edge));
          const cnt = usedSide.get(sid) || 0;
          usedSide.set(sid, cnt + 1);
          const baseSid = cnt === 0 ? sid : `${sid}#${cnt}`;
          let k = 0;
          for (const g of gen) {
            if (g.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
              const mf = matchOut(outFaces, g);
              if (mf && !tmGet(tm.faces, mf)) tmAdd(tm.faces, mf, gen.length === 1 ? `${rPref}sk:${baseSid}` : `${rPref}sk:${baseSid}:${k++}`);
            }
            safeDelete(g);
          }
          if (revAngle < 360 - 1e-6) {
            try { const fe = rev.FirstShape(edge); const me = !fe.IsNull() ? matchOut(outEdges, fe) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:start`); safeDelete(fe); } catch (_) {}
            try { const le = rev.LastShape(edge); const me = !le.IsNull() ? matchOut(outEdges, le) : null; if (me && !tmGet(tm.edges, me)) tmAdd(tm.edges, me, `${ePref}sk:${baseSid}:end`); safeDelete(le); } catch (_) {}
          }
          safeDelete(edge);
        }
        for (const f of outFaces) if (!tmGet(tm.faces, f.s)) f.s.delete();
        for (const e of outEdges) if (!tmGet(tm.edges, e.s)) e.s.delete();
        ensureTopoComplete(solid, tm, '$self');
      } finally {
        rev.delete(); ax1.delete(); safeDelete(faceRaw);
      }
      entries.push({ shape: solid, topo: tm, selfId: null });
    }
    return fuseAllWithTopo(entries, true, 'Rv');
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

  let stepReaderCache = null;
  function clearStepReaderCache() {
    if (stepReaderCache && stepReaderCache.reader) {
      try { stepReaderCache.reader.delete(); } catch (_) {}
    }
    stepReaderCache = null;
  }

  // Importierte STEP-, IGES-, BREP- oder STL-Datei (binär per blobId/bytes oder Base64)
  function buildImport(p) {
    let bytes = p.bytes ? (p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes)) : (p.blobId ? importBlobs.get(p.blobId) : null);
    if (!bytes && p.data) {
      const bin = atob(p.data); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    if (!bytes || !bytes.byteLength) throw new Error('Die importierte Datei ist leer.');
    if (p.blobId && bytes) importBlobs.set(p.blobId, bytes);
    let shape = null;
    if (p.fmt === 'brep') {
      const txt = new TextDecoder('utf-8').decode(bytes);
      const raw = oc.BRepToolsWrapper.Read(txt);
      if (!raw || raw.IsNull()) { safeDelete(raw); throw new Error('Die BREP-Datei ließ sich nicht lesen.'); }
      shape = R.cast(raw);
    } else if (p.fmt === 'iges') {
      const txt = new TextDecoder('utf-8').decode(bytes);
      shape = parseIGESToShape(txt);
    } else if (p.fmt === 'stl') {
      const fn = 'imp_' + Math.random().toString(36).slice(2);
      oc.FS.writeFile('/' + fn, bytes);
      try {
        const reader = new oc.StlAPI_Reader(); const sh = new oc.TopoDS_Shell();
        if (!reader.Read(sh, fn)) throw new Error('Die STL-Datei ließ sich nicht lesen.');
        const up = new oc.ShapeUpgrade_UnifySameDomain(sh, true, true, false); up.Build();
        const ms = new oc.BRepBuilderAPI_MakeSolid();
        try { ms.Add(oc.TopoDS.Shell(up.Shape())); shape = R.cast(ms.Solid()); } catch (_) { shape = R.cast(up.Shape()); }
        reader.delete(); up.delete(); ms.delete();
      } finally { try { oc.FS.unlink('/' + fn); } catch (_) {} }
    } else if (p.stepEntity != null) {
      const bKey = p.blobId || hashBytes(bytes);
      let entry = stepReaderCache && stepReaderCache.key === bKey ? stepReaderCache : null;
      let tempReader = false;
      if (!entry) {
        clearStepReaderCache();
        const fn = 'imp_' + Math.random().toString(36).slice(2) + '.step';
        oc.FS.writeFile('/' + fn, bytes);
        const reader = new oc.STEPControl_Reader();
        try {
          const st = reader.ReadFile(fn);
          const doneVal = oc.IFSelect_ReturnStatus && oc.IFSelect_ReturnStatus.IFSelect_RetDone ? oc.IFSelect_ReturnStatus.IFSelect_RetDone.value : null;
          if (!st || (doneVal != null && st.value != null && st.value !== doneVal)) {
            reader.delete();
            throw new Error('Die STEP-Datei ließ sich nicht lesen.');
          }
        } finally { try { oc.FS.unlink('/' + fn); } catch (_) {} }
        const idMap = new Map();
        const mdl = reader.StepModel();
        if (mdl) {
          const nEnt = mdl.NbEntities();
          for (let i = 1; i <= nEnt; i++) {
            const ent = mdl.Value(i);
            const sid = mdl.IdentLabel(ent);
            if (sid > 0) idMap.set(sid, i);
            safeDelete(ent);
          }
          safeDelete(mdl);
        }
        entry = { key: bKey, reader, idMap };
        if (bytes.byteLength <= 8e6) stepReaderCache = entry;
        else tempReader = true;
      }
      try {
        entry.reader.ClearShapes();
        const idx = entry.idMap.get(p.stepEntity);
        if (idx != null && entry.reader.TransferOne(idx) && entry.reader.NbShapes() > 0) {
          shape = R.cast(entry.reader.OneShape());
        } else {
          entry.reader.ClearShapes();
          entry.reader.TransferRoots();
          shape = R.cast(entry.reader.OneShape());
        }
      } finally {
        if (tempReader) safeDelete(entry.reader);
      }
    } else {
      const fn = 'imp_' + Math.random().toString(36).slice(2);
      oc.FS.writeFile('/' + fn, bytes);
      try {
        const reader = new oc.STEPControl_Reader();
        const st = reader.ReadFile(fn);
        const doneVal = oc.IFSelect_ReturnStatus && oc.IFSelect_ReturnStatus.IFSelect_RetDone ? oc.IFSelect_ReturnStatus.IFSelect_RetDone.value : null;
        if (!st || (doneVal != null && st.value != null && st.value !== doneVal)) { reader.delete(); throw new Error('Die STEP-Datei ließ sich nicht lesen.'); }
        reader.TransferRoots(); shape = R.cast(reader.OneShape()); reader.delete();
      } finally { try { oc.FS.unlink('/' + fn); } catch (_) {} }
    }
    if (shape && Array.isArray(p.stepMat) && p.stepMat.length === 16 && !isIdentity(p.stepMat)) {
      const tr = applyMatrix(shape, p.stepMat);
      safeDelete(shape);
      shape = tr;
    }
    const s = num(p.scale, 1);
    if (shape && Math.abs(s - 1) > 1e-9) {
      const sc = shape.scale(s, [0, 0, 0]);
      safeDelete(shape);
      shape = sc;
    }
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
    M10: { fine: 10.5, hole: 11.0, coarse: 12.0, tap: 8.5, csk: 22.4, cbD: 18.0, cbH: 10.6, nutSW: 16.0, nutH: 8.4, ins: null, insL: null },
    M12: { fine: 13.0, hole: 13.5, coarse: 14.5, tap: 10.2, csk: 26.88, cbD: 20.0, cbH: 12.6, nutSW: 18.0, nutH: 10.8, ins: null, insL: null },
    M16: { fine: 17.0, hole: 17.5, coarse: 18.5, tap: 14.0, csk: 33.6, cbD: 26.0, cbH: 16.6, nutSW: 24.0, nutH: 14.8, ins: null, insL: null },
    M20: { fine: 21.0, hole: 22.0, coarse: 24.0, tap: 17.5, csk: 40.32, cbD: 33.0, cbH: 20.6, nutSW: 30.0, nutH: 18.0, ins: null, insL: null },
    M24: { fine: 25.0, hole: 26.0, coarse: 28.0, tap: 21.0, csk: 39.0, cskAngle: 60, cbD: 40.0, cbH: 24.8, nutSW: 36.0, nutH: 21.5, ins: null, insL: null },
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
  // Normteile: Kopf Zylinderschraube ISO 4762 (Ø, Höhe, Innensechskant), Senkschraube ISO 10642 / DIN 7991 (Kopfhöhe, Innensechskant),
  // Sechskantschraube ISO 4017 (Schlüsselweite, Kopfhöhe), Scheibe ISO 7089 (innen, außen, Dicke). Kopf und Scheibe aus app/data/schrauben.json.
  const NORM = {
    'M1.6': { hd: 3.0, hk: 1.6, hs: 1.5, hexSW: 3.2, hexK: 1.1, w1: 1.7, w2: 4.0, wh: 0.3 },
    M2: { hd: 3.8, hk: 2.0, hs: 1.5, hexSW: 4.0, hexK: 1.4, w1: 2.2, w2: 5.0, wh: 0.3 },
    'M2.5': { hd: 4.5, hk: 2.5, hs: 2.0, hexSW: 5.0, hexK: 1.7, w1: 2.7, w2: 6.0, wh: 0.5 },
    M3: { hd: 5.5, hk: 3.0, hs: 2.5, ck: 1.86, cs: 2.0, hexSW: 5.5, hexK: 2.0, w1: 3.2, w2: 7.0, wh: 0.5 },
    M4: { hd: 7.0, hk: 4.0, hs: 3.0, ck: 2.48, cs: 2.5, hexSW: 7.0, hexK: 2.8, w1: 4.3, w2: 9.0, wh: 0.8 },
    M5: { hd: 8.5, hk: 5.0, hs: 4.0, ck: 3.1, cs: 3.0, hexSW: 8.0, hexK: 3.5, w1: 5.3, w2: 10.0, wh: 1.0 },
    M6: { hd: 10.0, hk: 6.0, hs: 5.0, ck: 3.72, cs: 4.0, hexSW: 10.0, hexK: 4.0, w1: 6.4, w2: 12.0, wh: 1.6 },
    M8: { hd: 13.0, hk: 8.0, hs: 6.0, ck: 4.96, cs: 5.0, hexSW: 13.0, hexK: 5.3, w1: 8.4, w2: 16.0, wh: 1.6 },
    M10: { hd: 16.0, hk: 10.0, hs: 8.0, ck: 6.2, cs: 6.0, hexSW: 16.0, hexK: 6.4, w1: 10.5, w2: 20.0, wh: 2.0 },
    M12: { hd: 18.0, hk: 12.0, hs: 10.0, ck: 7.44, cs: 8.0, hexSW: 18.0, hexK: 7.5, w1: 13.0, w2: 24.0, wh: 2.5 },
    M16: { hd: 24.0, hk: 16.0, hs: 14.0, ck: 8.8, cs: 10.0, hexSW: 24.0, hexK: 10.0, w1: 17.0, w2: 30.0, wh: 3.0 },
    M20: { hd: 30.0, hk: 20.0, hs: 17.0, ck: 10.16, cs: 12.0, hexSW: 30.0, hexK: 12.5, w1: 21.0, w2: 37.0, wh: 3.0 },
    M24: { hd: 36.0, hk: 24.0, hs: 19.0, ck: 14.0, cs: 14.0, hexSW: 36.0, hexK: 15.0, w1: 25.0, w2: 44.0, wh: 4.0 },
  };
  const nomD = (size) => parseFloat(String(size).slice(1)) || 3;
  // Schraube: Kopf oben auf z = 0 aufgesetzt (Zylinder-/Sechskantkopf) bzw. bündig mit z = 0 (Senkkopf), Schaft nach unten (Gewinde nur angedeutet)
  function buildStdScrew(p) {
    const size = NORM[p.size] ? p.size : 'M3', n = NORM[size], s = SCREW[size], d = nomD(size), L = pos(p.length, 10);
    if (p.head === 'hex') {
      const head = hexPrism(n.hexSW, 0, n.hexK);
      const shaft = R.makeCylinder(d / 2, L, [0, 0, -L], [0, 0, 1]);
      const out = head.fuse(shaft); safeDelete(head); safeDelete(shaft);
      return out;
    }
    if (p.head === 'senk' && n.ck) {
      const rT = s.csk / 2, k = n.ck, len = Math.max(L, k + 0.5);
      let body = revolveProfile([[0, 0], [rT, 0], [d / 2, -k], [d / 2, -len], [0, -len]]);
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
  function stadiumExtrude(L, b, z0, dz) {
    const r = b / 2, a = Math.max(0, L / 2 - r);
    const M = planeMap({ o: [0, 0, z0], x: [1, 0, 0], n: [0, 0, 1] });
    const loop = a < 1e-5 ? { circle: { c: [0, 0], r } } : { segs: [
      { t: 'line', a: [-a, -r], b: [a, -r] }, { t: 'arc', a: [a, -r], m: [a + r, 0], b: [a, r] },
      { t: 'line', a: [a, r], b: [-a, r] }, { t: 'arc', a: [-a, r], m: [-a - r, 0], b: [-a, -r] },
    ] };
    const face = R.makeFace(loopWire(loop, M));
    return R.basicFaceExtrusion(face, new R.Vector([0, 0, dz]));
  }
  function buildStdPin(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = Math.max(0.4, pos(sp.d, pos(p.d, 6)) - printFitDelta(p.printFit)), L = pos(p.length, 20), r = d / 2;
    const cRaw = num(sp.c, d * 0.18);
    const c = Math.min(Math.max(0.05, cRaw), L * 0.3, r * 0.8);
    const dr = Math.min(r * 0.45, c * Math.tan((15 * Math.PI) / 180));
    if (dr > 1e-4 && c > 1e-4 && L > 2.2 * c) {
      return revolveProfile([[0, 0], [r - dr, 0], [r, c], [r, L - c], [r - dr, L], [0, L]]);
    }
    return R.makeCylinder(r, L, [0, 0, 0], [0, 0, 1]);
  }
  function buildStdKey(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const b = pos(sp.b, 6), h = pos(sp.h, 6), L = pos(p.length, 20);
    return stadiumExtrude(L, b, 0, h);
  }
  function buildStdKeyway(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const b = pos(sp.b, 6), L = pos(p.length, 20);
    const dep = pos(p.kind === 'hub' ? sp.t2 : sp.t1, p.kind === 'hub' ? 2.8 : 3.5);
    const up = Math.max(LIFT, num(p.extra, 0.5));
    if (p.kind === 'hub') return R.makeBox([-L / 2, -b / 2, -dep], [L / 2, b / 2, up]);
    return stadiumExtrude(L, b, up, -(dep + up));
  }
  function buildStdBearing(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, 8), D = pos(sp.D, 22), B = pos(sp.B, 7);
    const ri = d / 2, ro = Math.max(ri + 1, D / 2), rw = ro - ri;
    const c = Math.min(Math.max(0.1, num(sp.r, 0.3)), rw * 0.12, B * 0.15);
    const rIn = ri + rw * 0.30, rOut = ro - rw * 0.30;
    if (p.seal !== 'open') {
      const rec = Math.min(B * 0.14, 0.8);
      return revolveProfile([
        [ri + c, 0], [rIn, 0], [rIn, rec], [rOut, rec], [rOut, 0], [ro - c, 0],
        [ro, c], [ro, B - c], [ro - c, B],
        [rOut, B], [rOut, B - rec], [rIn, B - rec], [rIn, B], [ri + c, B],
        [ri, B - c], [ri, c],
      ]);
    }
    const inner = revolveProfile([[ri + c, 0], [rIn, 0], [rIn, B], [ri + c, B], [ri, B - c], [ri, c]]);
    const outer = revolveProfile([[rOut, 0], [ro - c, 0], [ro, c], [ro, B - c], [ro - c, B], [rOut, B]]);
    const nB = Math.max(5, Math.min(18, Math.round(num(sp.balls, 7))));
    const rm = (ri + ro) / 2, rb = Math.min((rOut - rIn) * 0.56, B * 0.34, rw * 0.28);
    const balls = [];
    for (let i = 0; i < nB; i++) {
      const a = (i / nB) * Math.PI * 2;
      balls.push(R.makeSphere(rb).translate([rm * Math.cos(a), rm * Math.sin(a), B / 2]));
    }
    return R.makeCompound([inner, outer, ...balls]);
  }
  function buildStdSleeve(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, 8), D = pos(sp.D, 10), L = pos(p.length, 10);
    const ri = d / 2, ro = Math.max(ri + 0.3, D / 2), wall = ro - ri;
    const c = Math.min(0.25, wall * 0.25, L * 0.1);
    if (p.flange === 'flange') {
      const rf = Math.max(ro + 0.5, pos(sp.fD, D + 4 * wall) / 2);
      const sf = Math.min(pos(sp.wall, wall), L * 0.45);
      const cf = Math.min(c, sf * 0.25);
      return revolveProfile([[ri + cf, 0], [rf - cf, 0], [rf, cf], [rf, sf - cf], [rf - cf, sf], [ro, sf], [ro, L - c], [ro - c, L], [ri + c, L], [ri, L - c], [ri, cf]]);
    }
    return revolveProfile([[ri + c, 0], [ro - c, 0], [ro, c], [ro, L - c], [ro - c, L], [ri + c, L], [ri, L - c], [ri, c]]);
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
  const PITCH = { M2: 0.4, 'M2.5': 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25, M10: 1.5, M12: 1.75, M16: 2.0, M20: 2.5, M24: 3.0 };
  function threadShape(size, L, grow, pitch) {
    const D = Math.max(0.8, (parseFloat(String(size).slice(1)) || 6) + grow);
    const defP = PITCH[size] || 1, rawP = num(pitch, 0);
    const P = rawP > 0 ? Math.min(Math.max(rawP, 0.25), D * 0.45) : defP;
    const rMaj = D / 2, depth = 0.5413 * P, rMin = Math.max(0.25, rMaj - depth);
    // Trapez im Schnitt (60°-Flanken, Spitze P/8 breit)
    const crest = P / 8, root = crest + 2 * depth * Math.tan(Math.PI / 6);
    const x0 = rMin - 0.05;
    let lastErr = null;
    for (const phase of [0, 0.17, 0.37]) {
      let core = null, gang = null, full = null, box = null, out = null;
      try {
        const z0 = -(1 + phase) * P;
        const pts = [[x0, 0, z0 - root / 2], [rMaj, 0, z0 - crest / 2], [rMaj, 0, z0 + crest / 2], [x0, 0, z0 + root / 2]];
        const prof = R.assembleWire([R.makeLine(pts[0], pts[1]), R.makeLine(pts[1], pts[2]), R.makeLine(pts[2], pts[3]), R.makeLine(pts[3], pts[0])]);
        const helix = R.makeHelix(P, L + (2 + phase) * P, x0, [0, 0, z0], [0, 0, 1]);
        gang = R.genericSweep(prof, helix, { frenet: true });
        core = R.makeCylinder(rMin + 0.01, L + 3 * P, [0, 0, -1.5 * P], [0, 0, 1]);
        full = core.fuse(gang); safeDelete(core); core = null; safeDelete(gang); gang = null;
        box = R.makeCylinder(rMaj + 0.5, L, [0, 0, 0], [0, 0, 1]);
        out = full.intersect(box); safeDelete(full); full = null; safeDelete(box); box = null;
        if (!out || out.isNull) throw new Error('Leere Gewindeform');
        bboxOf(out);
        return out;
      } catch (err) {
        lastErr = err;
        safeDelete(core); safeDelete(gang); safeDelete(full); safeDelete(box); safeDelete(out);
      }
    }
    throw lastErr || new Error('Gewinde konnte nicht gebaut werden.');
  }
  function buildPart(p) {
    const lib = p.lib;
    const pf = printFitDelta(p.printFit);
    if (lib === 'threadRod') { const L = pos(p.length, 12); return threadShape(p.size || 'M6', L, -pf, p.pitch); }
    if (lib === 'threadHole') {
      const L = pos(p.length, 10);
      // Innengewinde zum Drucken: etwas Luft (Spiel), durchgehend nach unten
      const cl = hasPrintFit(p.printFit) ? pf : num(p.clear, 0.3);
      const s = threadShape(p.size || 'M6', L + LIFT, cl, p.pitch).translate([0, 0, -L]);
      return s;
    }
    if (lib === 'stdScrew') return buildStdScrew(p);
    if (lib === 'stdNut') return buildStdNut(p);
    if (lib === 'stdWasher') return buildStdWasher(p);
    if (lib === 'stdPin') return buildStdPin(p);
    if (lib === 'stdKey') return buildStdKey(p);
    if (lib === 'stdKeyway') return buildStdKeyway(p);
    if (lib === 'stdBearing') return buildStdBearing(p);
    if (lib === 'stdSleeve') return buildStdSleeve(p);
    const s = p.spec && typeof p.spec === 'object' ? { ...(SCREW[p.size] || SCREW.M3), ...p.spec } : (SCREW[p.size] || SCREW.M3);
    const tol = num(p.tol, 0) + pf;
    if (lib === 'screwHole') {
      const L = pos(p.length, 10);
      const hd = holeD(s, p.fit);
      let shape = R.makeCylinder((hd + tol) / 2, L + LIFT, [0, 0, -L], [0, 0, 1]);
      if (p.head === 'countersunk' && s.csk > hd) {
        const rTop = (s.csk + tol) / 2, rBot = (hd + tol) / 2;
        const halfAng = (num(s.cskAngle, 90) * Math.PI) / 360;
        const h = (rTop - rBot) / Math.tan(halfAng); // 90° (metrisch) oder 82° (Zoll UNC/UNF)
        const cone = revolveProfile([[0, -h], [rBot, -h], [rTop, 0], [rTop, LIFT], [0, LIFT]]);
        shape = shape.fuse(cone);
      } else if (p.head === 'counterbore' && s.cbD > hd && s.cbH > 0) {
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
      const d = pos(p.d, 5) + pf, L = pos(p.depth, 10), ang = num(p.tipAngle, 118);
      const r = d / 2;
      if (ang > 1 && ang < 179.5) {
        const tipH = r / Math.tan((ang * Math.PI) / 360);
        return revolveProfile([[0, -(L + tipH)], [r, -L], [r, LIFT], [0, LIFT]]);
      }
      return R.makeCylinder(r, L + LIFT, [0, 0, -L], [0, 0, 1]);
    }
    if (lib === 'fitHole') {
      // Passbohrung H7: genau das Nennmaß (zzgl. gewählter 3D-Druck-Passung)
      const d = pos(p.d, 6) + pf, L = pos(p.depth, 10);
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
  function resolveEdgeRef(s, shapeEdges, topo, itemId, isLeaf) {
    if (!s) return [];
    if (s.tid && topo) {
      const want = resolveTid(s.tid, itemId);
      const wantBase = baseTid(want);
      const wantLocal = localTid(want);
      const exact = [], splitOrMerged = [], byLocal = [];
      for (const e of shapeEdges) {
        const rawTid = tmGet(topo.edges, e.wrapped);
        if (!rawTid) continue;
        const eTid = resolveTid(rawTid, itemId);
        if (eTid === want) { exact.push(e); continue; }
        const eBase = baseTid(eTid);
        if (eBase === want || eBase === wantBase || (want.includes('|') && eTid === wantBase)) {
          splitOrMerged.push(e); continue;
        }
        if (isLeaf && localTid(eTid) === wantLocal) byLocal.push(e);
      }
      if (exact.length) return exact;
      if (splitOrMerged.length) return splitOrMerged;
      if (byLocal.length) return byLocal;
    }
    if (Array.isArray(s.m)) {
      const tol = 0.02 + 0.002 * num(s.l, 1);
      const out = [];
      for (const e of shapeEdges) {
        try {
          const m = vec(e.pointAt(0.5));
          if (Math.hypot(m[0] - s.m[0], m[1] - s.m[1], m[2] - s.m[2]) < tol) out.push(e);
        } catch (_) {}
      }
      return out;
    }
    return [];
  }
  function resolveFaceRef(s, shapeFaces, topo, itemId, isLeaf) {
    if (!s) return [];
    if (s.tid && topo) {
      const want = resolveTid(s.tid, itemId);
      const wantBase = baseTid(want);
      const wantLocal = localTid(want);
      const exact = [], splitOrMerged = [], byLocal = [];
      for (const f of shapeFaces) {
        const rawTid = tmGet(topo.faces, f.wrapped);
        if (!rawTid) continue;
        const fTid = resolveTid(rawTid, itemId);
        if (fTid === want) { exact.push(f); continue; }
        const fBase = baseTid(fTid);
        if (fBase === want || fBase === wantBase || (want.includes('|') && fTid === wantBase)) {
          splitOrMerged.push(f); continue;
        }
        if (isLeaf && localTid(fTid) === wantLocal) byLocal.push(f);
      }
      if (exact.length) return exact;
      if (splitOrMerged.length) return splitOrMerged;
      if (byLocal.length) return byLocal;
    }
    if (Array.isArray(s.c)) {
      const tol = Math.max(0.05, num(s.tol, 0.08));
      const out = [];
      for (const f of shapeFaces) {
        try {
          const c = vec(f.center);
          if (Math.hypot(c[0] - s.c[0], c[1] - s.c[1], c[2] - s.c[2]) < tol) out.push(f);
        } catch (_) {}
      }
      if (out.length) return out;
    }
    return [];
  }
  function runFilletChamferWithTopo(shape, topo, type, r, matchedEdges, fin, itemId, skipTopo = false) {
    if (!matchedEdges.length) throw new Error('Keine Kante gewählt.');
    if (type === 'chamfer') {
      const builder = new oc.BRepFilletAPI_MakeChamfer(shape.wrapped);
      try {
        if (fin.cm === 'two' || fin.cm === 'angle') {
          const faces = shape.faces, fe = faces.map((f) => f.edges);
          const key = (f) => { const c = vec(f.center); return [Math.round(c[2] * 1e3), Math.round(c[1] * 1e3), Math.round(c[0] * 1e3)]; };
          const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
          const d2 = fin.cm === 'two' ? num(fin.r2, r) * (r / Math.max(1e-9, num(fin.r, r))) : 0;
          const ang = (num(fin.a, 45) * Math.PI) / 180;
          let n = 0;
          for (const e of matchedEdges) {
            const adj = faces.filter((f, i) => fe[i].some((x) => x.isSame(e))).sort(cmp);
            if (!adj.length) continue;
            const f = adj[Math.min(fin.side ? 1 : 0, adj.length - 1)];
            if (fin.cm === 'angle') builder.AddDA(r, ang, e.wrapped, f.wrapped);
            else builder.Add(r, d2 > 0 ? d2 : r, e.wrapped, f.wrapped);
            n++;
          }
          for (const f of faces) safeDelete(f);
          for (const el of fe) for (const e of el) safeDelete(e);
          if (!n) throw new Error('Keine Kante für die Fase.');
        } else {
          for (const e of matchedEdges) builder.Add(r, e.wrapped);
        }
        builder.Build();
        const res = R.cast(builder.Shape());
        if (!res || !R.isShape3D(res)) { safeDelete(res); throw new Error('Fase fehlgeschlagen.'); }
        const outTopo = skipTopo ? null : propagateHistory(builder, [{ topo, selfId: itemId }], res, 'Ch:' + (fin.id || 'f'));
        return { shape: res, topo: outTopo };
      } finally { builder.delete(); }
    }
    const builder = new oc.BRepFilletAPI_MakeFillet(shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    try {
      const r2 = fin.vr ? num(fin.r2, r) * (r / Math.max(1e-9, num(fin.r, r))) : r;
      const isVar = !!(fin.vr && r2 > 0 && Math.abs(r2 - r) > 1e-9);
      for (const e of matchedEdges) {
        if (isVar) builder.Add(r, r2, e.wrapped);
        else builder.Add(r, e.wrapped);
      }
      builder.Build();
      const res = R.cast(builder.Shape());
      if (!res || !R.isShape3D(res)) { safeDelete(res); throw new Error('Rundung fehlgeschlagen.'); }
      const outTopo = skipTopo ? null : propagateHistory(builder, [{ topo, selfId: itemId }], res, 'Fi:' + (fin.id || 'f'));
      return { shape: res, topo: outTopo };
    } finally { builder.delete(); }
  }
  function applyShell(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const t = num(fin.r, 2);
    const b = bboxOf(shape); const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const sigs = (fin.faces || []).filter((f) => f && (f.c || f.tid));
    const faceArr = [];
    try { for (const f of shape.faces) faceArr.push(f); } catch (_) {}
    const picked = [];
    const missing = [];
    sigs.forEach((s, i) => {
      const matched = resolveFaceRef({ ...s, tol }, faceArr, topo, itemId, isLeaf);
      if (!matched.length) missing.push(i);
      else for (const mf of matched) if (!picked.some((x) => x.isSame(mf))) picked.push(mf);
    });
    if (!picked.length) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing: sigs.map((_, i) => i), message: 'Die offene Fläche für die Wandstärke gibt es nicht mehr.' });
      return { shape, topo };
    }
    if (missing.length) {
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', partial: true, missing, message: `${missing.length} von ${sigs.length} offenen Flächen für die Wandstärke gibt es nicht mehr.` });
    }
    const minDim = Math.min(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    if (!(t > 0) || 2 * t >= minDim - 1e-6) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: `Die Wandstärke ist zu dick für dieses Teil – möglich sind weniger als ${String(Math.floor(minDim * 5) / 10).replace('.', ',')} mm.` });
      return { shape, topo };
    }
    try {
      const facesToRemove = new oc.NCollection_List_TopoDS_Shape();
      for (const f of picked) facesToRemove.Append(f.wrapped);
      const builder = new oc.BRepOffsetAPI_MakeThickSolid();
      let res = null;
      try {
        builder.MakeThickSolidByJoin(shape.wrapped, facesToRemove, -t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
        res = R.cast(builder.Shape());
        if (!R.isShape3D(res)) { safeDelete(res); throw new Error('shell'); }
        const rb = bboxOf(res);   // Unsinnige Ergebnisse (größer als vorher) als Fehler melden
        if (rb[3] - rb[0] > b[3] - b[0] + 1e-3 || rb[4] - rb[1] > b[4] - b[1] + 1e-3 || rb[5] - rb[2] > b[5] - b[2] + 1e-3) { safeDelete(res); throw new Error('größer'); }
        const outTopo = propagateHistory(builder, [{ topo, selfId: itemId }], res, 'Sh:' + (fin.id || 's'));
        return { shape: res, topo: outTopo };
      } finally {
        builder.delete();
        facesToRemove.delete();
      }
    } catch (_) {
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: 'Die Wandstärke ist zu dick für dieses Teil – nimm einen kleineren Wert.' });
      return { shape, topo };
    } finally {
      for (const f of faceArr) safeDelete(f);
    }
  }
  function applyFinishes(shape, finishes, errors, itemId, topo = null, isLeaf = false) {
    let curShape = shape;
    let curTopo = topo;
    let ownsTopo = false;
    for (const fin of finishes || []) {
      if (fin.type === 'shell') {
        const res = applyShell(curShape, fin, errors, itemId, curTopo, isLeaf);
        if (res.shape !== curShape) {
          if (curShape !== shape) safeDelete(curShape);
          if (ownsTopo) freeTopoMap(curTopo);
          curShape = res.shape; curTopo = res.topo; ownsTopo = true;
        }
        continue;
      }
      if (fin.type === 'draft') {
        const res = applyDraft(curShape, fin, errors, itemId, curTopo);
        if (res.shape !== curShape) {
          if (curShape !== shape) safeDelete(curShape);
          if (ownsTopo) freeTopoMap(curTopo);
          curShape = res.shape; curTopo = res.topo; ownsTopo = true;
        }
        continue;
      }
      const r = num(fin.r, 1);
      if (!(r > 0)) continue;
      const shapeEdges = [];
      try { for (const e of curShape.edges) shapeEdges.push(e); } catch (_) {}
      const matchedEdges = [];
      const addMatched = (e) => { if (!matchedEdges.some((x) => x.isSame(e))) matchedEdges.push(e); };
      const missing = [];
      if (Array.isArray(fin.edges)) {
        fin.edges.forEach((s, i) => {
          const hits = resolveEdgeRef(s, shapeEdges, curTopo, itemId, isLeaf);
          if (!hits.length) missing.push(i);
          else for (const he of hits) addMatched(he);
        });
      } else {
        let matcher;
        try { matcher = makeEdgeMatcher(fin.edges, curShape); } catch (e) { for (const e of shapeEdges) safeDelete(e); continue; }
        for (const e of shapeEdges) { try { if (matcher(e)) addMatched(e); } catch (_) {} }
      }
      const kindTxt = fin.type === 'chamfer' ? 'Fase' : 'Rundung';
      if (!matchedEdges.length) {
        for (const e of shapeEdges) safeDelete(e);
        const msg = Array.isArray(fin.edges) && fin.edges.length === 1
          ? `Die gewählte Kante der ${kindTxt} gibt es nicht mehr.`
          : `Die gewählten Kanten der ${kindTxt} gibt es nicht mehr.`;
        errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'edge', missing: Array.isArray(fin.edges) ? fin.edges.map((_, i) => i) : null, message: msg });
        continue;
      }
      if (missing.length) {
        errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'edge', partial: true, missing, message: `${missing.length} von ${fin.edges.length} gewählten Kanten der ${kindTxt} gibt es nicht mehr.` });
      }
      try {
        const res = runFilletChamferWithTopo(curShape, curTopo, fin.type, r, matchedEdges, fin, itemId, false);
        if (curShape !== shape) safeDelete(curShape);
        if (ownsTopo) freeTopoMap(curTopo);
        curShape = res.shape; curTopo = res.topo; ownsTopo = true;
      } catch (err) {
        // größten möglichen Wert suchen
        let lo = 0, hi = r;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          try { const t = runFilletChamferWithTopo(curShape, curTopo, fin.type, mid, matchedEdges, fin, itemId, true); safeDelete(t.shape); lo = mid; } catch (_) { hi = mid; }
        }
        const max = Math.floor(lo * 10) / 10;
        errors.push({ itemId, finishId: fin.id, code: 'toobig', max, message: max > 0 ? `${fin.type === 'chamfer' ? 'Die Fase' : 'Die Rundung'} ist zu groß. Möglich sind höchstens ${String(max).replace('.', ',')} mm.` : `${fin.type === 'chamfer' ? 'Diese Fase' : 'Diese Rundung'} lässt sich an diesen Kanten nicht bauen.` });
      }
      for (const e of shapeEdges) safeDelete(e);
    }
    return { shape: curShape, topo: curTopo, ownsTopo };
  }

  // Entformungsschräge: alle senkrechten Seitenflächen um den Winkel neigen, unten (kleinstes Z) bleibt die Kontur
  function applyDraft(shape, fin, errors, itemId, topo = null) {
    const ang = num(fin.r, 3);
    if (!(Math.abs(ang) > 1e-6) || Math.abs(ang) >= 45) { errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge muss zwischen 0 und 45° liegen.' }); return { shape, topo }; }
    const b = bboxOf(shape), z0 = b[2];
    const dir = R.asDir([0, 0, 1]), pln = new oc.gp_Pln(R.asPnt([0, 0, z0]), dir);
    const builder = new oc.BRepOffsetAPI_DraftAngle(shape.wrapped);
    let n = 0;
    try {
      for (const f of shape.faces) {
        let nz = 1; try { const v = f.normalAt(); nz = v.z; } catch (_) {}
        if (Math.abs(nz) < 0.02) { builder.Add(f.wrapped, dir, (ang * Math.PI) / 180, pln, true); n++; }
      }
      if (!n) { errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Dieser Körper hat keine senkrechten Seitenflächen für eine Schräge.' }); return { shape, topo }; }
      builder.Build();
      if (!builder.IsDone || (typeof builder.IsDone === 'function' && !builder.IsDone())) throw new Error('draft');
      const out = R.cast(builder.Shape());
      const outTopo = propagateHistory(builder, [{ topo, selfId: itemId }], out, 'Dr:' + (fin.id || 'd'));
      return { shape: out, topo: outTopo };
    } catch (e) {
      errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge lässt sich an diesem Körper nicht bauen – versuch einen kleineren Winkel oder zuerst ohne Rundungen.' });
      return { shape, topo };
    } finally { try { builder.delete(); pln.delete(); dir.delete(); } catch (_) {} }
  }

  // ---------- Muster, Spiegeln mit Kopie, Teilen ----------
  function patternShape(base, p) {
    const skipSet = new Set(Array.isArray(p.skip) ? p.skip.map((x) => Math.round(Number(x))) : []);
    const copies = [];
    if (p.pt === 'rect') {
      const nx = Math.max(1, Math.min(60, Math.round(num(p.nx, 1)))), ny = Math.max(1, Math.min(60, Math.round(num(p.ny, 1))));
      const dx = num(p.dx, 10), dy = num(p.dy, 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        if (skipSet.has(idx)) continue;
        copies.push(idx === 0 ? base : base.clone().translate([i * dx, j * dy, 0]));
      }
    } else if (p.pt === 'circ') {
      const n = Math.max(1, Math.min(120, Math.round(num(p.n, 4)))), ang = num(p.ang, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      // Drehachse: senkrecht (Standard), quer, längs – oder eine im Bild gewählte Achse (Kante, Welle, Loch)
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [num(p.cx, 0), num(p.cy, 0), num(p.cz, 0)];
      for (let k = 0; k < n; k++) {
        if (skipSet.has(k)) continue;
        copies.push(k === 0 ? base : base.clone().rotate(k * step, c, ax));
      }
    } else if (p.pt === 'path' && Array.isArray(p.places)) {
      // Muster entlang Kurve: Lage und Drehung je Kopie kommen fertig aus dem Modell
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      const lim = Math.min(p.places.length, 200);
      for (let k = 0; k < lim; k++) {
        if (skipSet.has(k)) continue;
        if (k === 0) { copies.push(base); continue; }
        const q = p.places[k];
        let c = base.clone();
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) c = c.rotate(Number(q.a), p0, ax);
        const d = (q.d || [0, 0, 0]).map(Number);
        if (Math.hypot(d[0], d[1], d[2]) > 1e-9) c = c.translate(d);
        copies.push(c);
      }
    } else if (p.pt === 'mirror' && p.plane === 'FACE' && Array.isArray(p.mn) && Array.isArray(p.mo)) {
      copies.push(base);
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
      copies.push(base);
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ';
      const n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl], off = num(p.off, 0);
      copies.push(base.clone().mirror(pl, [n[0] * off, n[1] * off, n[2] * off]));
    }
    if (!copies.length) return base;
    if (!copies.includes(base)) safeDelete(base);
    if (copies.length === 1) return copies[0];
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
      if (it.p.stepEntity != null) p.stepEntity = it.p.stepEntity;
      if (Array.isArray(it.p.stepMat) && it.p.stepMat.length === 16) p.stepMat = it.p.stepMat.map((v) => Math.round(v * 1e6) / 1e6);
    }
    return keyOf({ k: it.kind, p, f: it.finishes || null, mir: it.mir || null, c: it.children ? it.children.filter((c) => !c.hidden).map((c) => [c.id, defKey(c), c.role, c.m]) : null });
  }
  function updatePlaneFromFace(oldPlane, fcL, fnL) {
    const n0 = norm(oldPlane.n || [0, 0, 1]);
    const n1 = norm(fnL);
    const x0 = norm(oldPlane.x || [1, 0, 0]);
    const o0 = oldPlane.o || [0, 0, 0];
    const dp = dot(n0, n1);
    let oNew, xNew;
    if (dp > 0.9999) {
      const d = dot(sub(fcL, o0), n1);
      oNew = add(o0, mul(n1, d));
      xNew = x0;
    } else if (dp < -0.9999) {
      oNew = fcL.slice();
      xNew = x0;
    } else {
      const ax = norm(cross(n0, n1));
      const cosA = Math.max(-1, Math.min(1, dp));
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const rot = add(add(mul(x0, cosA), mul(cross(ax, x0), sinA)), mul(ax, dot(ax, x0) * (1 - cosA)));
      const xProj = sub(rot, mul(n1, dot(rot, n1)));
      xNew = len(xProj) > 1e-6 ? norm(xProj) : norm(cross(Math.abs(n1[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n1));
      oNew = fcL.slice();
    }
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    return { o: oNew.map(r6), x: xNew.map(r6), n: n1.map(r6) };
  }
  function resolveChildPlaneRef(pr, kidMap) {
    if (!pr || pr.kind !== 'face') return null;
    const candidates = [];
    if (pr.id && kidMap.has(pr.id)) candidates.push(kidMap.get(pr.id));
    if (pr.tid) {
      const sl = pr.tid.indexOf('/');
      const owner = sl > 0 ? pr.tid.slice(0, sl) : null;
      if (owner && owner !== '$self' && kidMap.has(owner) && !candidates.includes(kidMap.get(owner))) {
        candidates.push(kidMap.get(owner));
      }
    }
    for (const v of kidMap.values()) if (!candidates.includes(v)) candidates.push(v);
    for (const cand of candidates) {
      const faces = [];
      try { for (const f of cand.shape.faces) faces.push(f); } catch (_) {}
      try {
        if (pr.tid) {
          const want = resolveTid(pr.tid, cand.id);
          const wantBase = baseTid(want);
          let matched = faces.find((f) => {
            const rt = tmGet(cand.topo?.faces, f.wrapped);
            return rt && resolveTid(rt, cand.id) === want;
          });
          if (!matched) {
            matched = faces.find((f) => {
              const rt = tmGet(cand.topo?.faces, f.wrapped);
              if (!rt) return false;
              const ft = resolveTid(rt, cand.id);
              return baseTid(ft) === want || baseTid(ft) === wantBase;
            });
          }
          if (matched && matched.geomType === 'PLANE') {
            return { c: vec(matched.center), n: vec(matched.normalAt()) };
          }
        }
      } finally {
        for (const f of faces) safeDelete(f);
      }
    }
    // Lage als Ersatz
    if (Array.isArray(pr.c) && Array.isArray(pr.n)) {
      for (const cand of candidates) {
        if (pr.id && cand.id !== pr.id && kidMap.has(pr.id)) continue;
        const m = matchFace(cand.shape, { c: pr.c, n: pr.n, t: 'PLANE' });
        if (m && m.geomType === 'PLANE') {
          const res = { c: vec(m.center), n: vec(m.normalAt()) };
          safeDelete(m);
          return res;
        }
        safeDelete(m);
      }
    }
    return null;
  }
  function evalItem(it, errors, parentWorldM = null, ctx = null) {
    if (it.kind === 'transform' || it.kind === 'scale' || it.kind === 'thicken' || it.kind === 'rib' || it.kind === 'emboss' || it.kind === 'mirrorStep' || it.kind === 'wrap' || (it.kind === 'sweep' && it.p && it.p.wrapId)) return { shape: null, key: defKey(it), topo: null };
    const dyn = hasDynamicExtent(it);
    const W = dyn ? (parentWorldM ? matMul(parentWorldM, it.m) : it.m) : null;
    const key = dyn
      ? keyOf([defKey(it), W.map((v) => Math.round(v * 1e6) / 1e6), ctx ? ctx.poolKey : ''])
      : defKey(it);
    const ce = cacheEntry(key);
    if (ce && ce.shape) {
      // Meldungen beim Bauen (z. B. „Rundung zu groß“) gelten weiter, auch wenn die Form aus dem Speicher kommt
      if (ce.errs) for (const x of ce.errs) errors.push({ ...x, itemId: x.itemId === '$self' ? it.id : x.itemId });
      if (ce.resolved && ctx && ctx.resolved) {
        if (it.kind === 'group') Object.assign(ctx.resolved, ce.resolved);
        else ctx.resolved[it.id] = ce.resolved;
      }
      return { shape: ce.shape, key, baseBox: ce.baseBox || null, topo: ce.topo || null };
    }
    const e0 = errors.length;
    let shape = null, topo = null, ownsTopo = false, resolvedInfo = null, baseBox = null;
    try {
      if (it.kind === 'group') {
        const kids = (it.children || []).filter((c) => !c.hidden);
        const solids = [], holes = [];
        const kidById = new Map();
        const kidGeoMap = new Map();
        const beforeRes = ctx && ctx.resolved ? new Set(Object.keys(ctx.resolved)) : null;
        for (const c of kids) {
          if (c.kind === 'mirrorStep') {
            const mp = c.p || {};
            if (mp.missingPlane) { errors.push({ itemId: c.id, code: 'op', message: 'Schritt spiegeln: ' + mp.missingPlane + '.' }); continue; }
            const mo = Array.isArray(mp.mo) && mp.mo.length >= 3 ? mp.mo.map(Number) : null;
            const mnRaw = Array.isArray(mp.mn) && mp.mn.length >= 3 ? mp.mn.map(Number) : null;
            const mnLen = mnRaw ? Math.hypot(mnRaw[0], mnRaw[1], mnRaw[2]) : 0;
            const fids = Array.isArray(mp.features) ? mp.features : [];
            if (!mo || !(mnLen > 1e-6) || !fids.length) {
              errors.push({ itemId: c.id, code: 'op', message: 'Schritt spiegeln: Ebene oder gespiegelter Schritt fehlen.' });
              continue;
            }
            const mn = [mnRaw[0] / mnLen, mnRaw[1] / mnLen, mnRaw[2] / mnLen];
            const mirTools = [];
            let firstRole = null;
            for (const fid of fids) {
              const src = kidById.get(fid);
              if (!src || !src.tools.length) {
                errors.push({ itemId: c.id, code: 'op', message: 'Schritt spiegeln: Der gewählte Schritt fehlt oder kommt erst später.' });
                continue;
              }
              if (!firstRole) firstRole = src.role;
              for (const st of src.tools) {
                const ms = st.shape.clone().mirror(mn, mo);
                const mTopo = ensureTopoComplete(ms, createTopoMap(), c.id);
                (src.role === 'hole' ? holes : solids).push({ shape: ms, topo: mTopo, selfId: c.id });
                mirTools.push({ shape: ms, topo: mTopo });
              }
            }
            if (mirTools.length) kidById.set(c.id, { role: firstRole || c.role, tools: mirTools });
            continue;
          }
          let cEval = c;
          if (c.p && c.p.planeRef && c.p.planeRef.kind === 'face' && c.p.plane && kidGeoMap.size) {
            const hitFace = resolveChildPlaneRef(c.p.planeRef, kidGeoMap);
            if (hitFace) {
              const cInv = matInvRigid(c.m);
              const fcL = transformPoint(cInv, hitFace.c);
              const fnL = transformDir(cInv, hitFace.n);
              const newPlane = updatePlaneFromFace(c.p.plane, fcL, fnL);
              cEval = { ...c, p: { ...c.p, plane: newPlane } };
              if (ctx && ctx.resolved) ctx.resolved[c.id] = { planeRefOk: true, plane: newPlane, faceC: fcL, faceN: fnL };
            } else if (ctx && ctx.resolved) {
              ctx.resolved[c.id] = { planeRefOk: false };
            }
          }
          const r = evalItem(cEval, errors, W, ctx);
          if (!r.shape) continue;
          const tr = applyMatrixWithTopo(r.shape, c.m, r.topo, c.id);
          const entry = { shape: tr.shape, topo: tr.topo, selfId: c.id };
          (c.role === 'hole' ? holes : solids).push(entry);
          kidById.set(c.id, { role: c.role, tools: [{ shape: tr.shape, topo: tr.topo }] });
          kidGeoMap.set(c.id, { id: c.id, shape: tr.shape, topo: tr.topo });
        }
        if (beforeRes && ctx && ctx.resolved) {
          const subRes = {};
          for (const k of Object.keys(ctx.resolved)) if (!beforeRes.has(k)) subRes[k] = ctx.resolved[k];
          if (Object.keys(subRes).length) resolvedInfo = subRes;
        }
        const op = it.p && it.p.op;
        if (solids.length) {
          if (op === 'intersect' && solids.length > 1) {
            // Schnittmenge: nur, was in allen Körpern liegt
            let cur = { shape: solids[0].shape, topo: solids[0].topo, selfId: solids[0].selfId };
            for (let i = 1; i < solids.length; i++) {
              const nx = boolWithTopo('common', cur.shape, cur.topo, cur.selfId, solids[i].shape, solids[i].topo, solids[i].selfId, 'In' + i);
              safeDelete(cur.shape); freeTopoMap(cur.topo);
              safeDelete(solids[i].shape); freeTopoMap(solids[i].topo);
              cur = { shape: nx.shape, topo: nx.topo, selfId: null };
            }
            shape = cur.shape; topo = cur.topo; ownsTopo = true;
          } else if (it.p && it.p.assembly) {
            if (solids.length === 1) {
              shape = solids[0].shape; topo = solids[0].topo; ownsTopo = true;
            } else {
              shape = R.makeCompound(solids.map((x) => x.shape));
              for (const x of solids) freeTopoMap(x.topo);
              topo = ensureTopoComplete(shape, createTopoMap(), it.id); ownsTopo = true;
            }
          } else {
            const fused = fuseAllWithTopo(solids, true, 'Gr');
            shape = fused.shape; topo = fused.topo; ownsTopo = true;
          }
          if (holes.length) {
            const tool = fuseAllWithTopo(holes, true, 'GH');
            const cut = boolWithTopo('cut', shape, topo, null, tool.shape, tool.topo, null, 'GC');
            safeDelete(tool.shape); freeTopoMap(tool.topo);
            safeDelete(shape); if (ownsTopo) freeTopoMap(topo);
            shape = cut.shape; topo = cut.topo; ownsTopo = true;
          }
        } else if (holes.length) {
          const fusedH = fuseAllWithTopo(holes, true, 'GH');
          shape = fusedH.shape; topo = fusedH.topo; ownsTopo = true;
        } else {
          shape = null;
        }
        if (shape && op === 'pattern') { baseBox = bboxOf(shape); shape = patternShape(shape, it.p); if (ownsTopo) freeTopoMap(topo); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true; }
        if (shape && op === 'split') { shape = splitBody(shape, it.p); if (ownsTopo) freeTopoMap(topo); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true; }
      } else if (it.kind === 'extrude' && isDynamicExtent(it.p)) {
        const res = buildExtrudeToTarget(it, W || it.m, ctx);
        shape = res.shape;
        topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
        resolvedInfo = res.resolved;
        if (ctx && ctx.resolved && resolvedInfo) ctx.resolved[it.id] = resolvedInfo;
      } else if (it.kind === 'extrude') {
        const res = buildExtrudeWithTopo(it.p);
        shape = res.shape; topo = res.topo; ownsTopo = true;
      } else if (it.kind === 'revolve') {
        const res = buildRevolveWithTopo(it.p);
        shape = res.shape; topo = res.topo; ownsTopo = true;
      } else if (it.kind === 'loft') {
        shape = buildLoft(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
      } else if (it.kind === 'sweep') {
        shape = buildSweep(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
      } else if (it.kind === 'import') {
        shape = buildImport(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
      } else if (it.kind === 'part') {
        shape = buildPart(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
      } else {
        const res = buildPrimitiveWithTopo(it.kind, it.p || {});
        shape = res.shape; topo = res.topo; ownsTopo = true;
      }
      if (shape && it.finishes && it.finishes.length) {
        const fr = applyFinishes(shape, it.finishes, errors, it.id, topo, it.kind !== 'group');
        if (fr.shape !== shape) {
          safeDelete(shape);
          if (ownsTopo) freeTopoMap(topo);
          shape = fr.shape; topo = fr.topo; ownsTopo = true;
        }
      }
      if (shape && it.mir) {
        for (const [axIdx, pl] of [[0, 'YZ'], [1, 'XZ'], [2, 'XY']]) {
          if (it.mir[axIdx] < 0) {
            const mr = mirrorAxisWithTopo(shape, topo, pl, it.kind === 'group' ? null : it.id);
            safeDelete(shape);
            if (ownsTopo) freeTopoMap(topo);
            shape = mr.shape; topo = mr.topo; ownsTopo = true;
          }
        }
      }
    } catch (err) {
      if (ownsTopo) freeTopoMap(topo);
      topo = null;
      errors.push({ itemId: it.id, code: err && (err.code === 'split' || err.code === 'ref') ? err.code : 'build', message: friendlyError(err) });
      shape = null;
    }
    if (shape) {
      if (!topo) topo = ensureTopoComplete(shape, createTopoMap(), '$self');
      cachePut(key, shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })), resolvedInfo, baseBox, topo);
    }
    return { shape, key, baseBox, topo };
  }
  function friendlyError(err) {
    const msg = String((err && err.message) || err || '');
    if (/wire|Wire/.test(msg)) return 'Der Umriss der Skizze ist nicht geschlossen oder überschneidet sich.';
    if (/face|Face/.test(msg)) return 'Aus dieser Skizze lässt sich keine Fläche bilden.';
    if (/WebAssembly\.Exception|object/.test(msg)) return 'Diese Form lässt sich so nicht berechnen. Versuch andere Maße.';
    return msg.slice(0, 160);
  }

  // ---------- Topologie-Verlauf (stabile Bezüge, PL-05) ----------
  const HMAX = 2147483647;
  const topoHc = (raw) => oc.ReplicadShapeHasher.HashCode(raw, HMAX);
  function createTopoMap() { return { faces: new Map(), edges: new Map() }; }
  function freeTopoMap(tm) {
    if (!tm) return;
    for (const b of tm.faces.values()) for (const x of b) safeDelete(x.s);
    for (const b of tm.edges.values()) for (const x of b) safeDelete(x.s);
    tm.faces.clear();
    tm.edges.clear();
  }
  function tmAdd(bucketMap, raw, id, overwrite = false) {
    if (!raw || !id) return;
    const hc = topoHc(raw);
    let b = bucketMap.get(hc);
    if (!b) { b = []; bucketMap.set(hc, b); }
    const ex = b.find((x) => x.s.IsSame(raw));
    if (ex) { if (overwrite) ex.id = id; return; }
    b.push({ s: raw, id });
  }
  function tmGet(bucketMap, raw) {
    if (!bucketMap || !raw) return null;
    const b = bucketMap.get(topoHc(raw));
    if (!b) return null;
    const hit = b.find((x) => x.s.IsSame(raw));
    return hit ? hit.id : null;
  }
  function resolveTid(id, selfId) {
    if (!id) return null;
    if (selfId && id.startsWith('$self/')) return `${selfId}/${id.slice(6)}`;
    return id;
  }
  const baseTid = (t) => String(t || '').split('|')[0];
  const localTid = (t) => { const s = String(t || ''), i = s.indexOf('/'); return i >= 0 ? s.slice(i + 1) : s; };
  function readShapeList(lst) {
    const out = [];
    if (!lst || lst.IsEmpty()) return out;
    const copy = new oc.NCollection_List_TopoDS_Shape();
    try {
      copy.Assign(lst);
      while (!copy.IsEmpty()) { out.push(copy.First()); copy.RemoveFirst(); }
    } finally { copy.delete(); }
    return out;
  }
  function exploreUnique(shape, shapeEnum) {
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(shape.wrapped, shapeEnum, TA.TopAbs_SHAPE);
    const buckets = new Map(), out = [];
    try {
      while (ex.More()) {
        const s = ex.Current();
        const hc = topoHc(s);
        let b = buckets.get(hc);
        if (!b) { b = []; buckets.set(hc, b); }
        if (!b.some((x) => x.IsSame(s))) { b.push(s); out.push({ hc, s }); }
        else safeDelete(s);
        ex.Next();
      }
    } finally { ex.delete(); }
    return out;
  }
  function cloneTopoForShape(shape, srcTopo, selfId = null) {
    const out = createTopoMap();
    if (!shape || !shape.wrapped) return out;
    const fl = exploreUnique(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
    for (const f of fl) {
      const id = srcTopo ? resolveTid(tmGet(srcTopo.faces, f.s), selfId) : null;
      if (id) tmAdd(out.faces, f.s, id);
      else f.s.delete();
    }
    const el = exploreUnique(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    for (const e of el) {
      const id = srcTopo ? resolveTid(tmGet(srcTopo.edges, e.s), selfId) : null;
      if (id) tmAdd(out.edges, e.s, id);
      else e.s.delete();
    }
    return out;
  }
  function faceSortKey(raw) {
    const rf = new R.Face(oc.TopoDS.Face(raw));
    let k = [0, 0, 0];
    try { const c = rf.center; k = [Math.round(c.z * 1e3), Math.round(c.y * 1e3), Math.round(c.x * 1e3)]; } catch (_) {}
    rf.delete();
    return k;
  }
  function edgeSortKey(raw) {
    const re = new R.Edge(oc.TopoDS.Edge(raw));
    let k = [0, 0, 0];
    try { const c = re.pointAt(0.5); k = [Math.round(c.z * 1e3), Math.round(c.y * 1e3), Math.round(c.x * 1e3)]; } catch (_) {}
    re.delete();
    return k;
  }
  function cmpSortKey(a, b) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }
  function deriveEdgeIdsFromFaces(shape, tm, prefix = '$self') {
    const TA = oc.TopAbs_ShapeEnum;
    const adj = new Map(); // hc -> [{ s, fIds: Set }]
    const fl = exploreUnique(shape, TA.TopAbs_FACE);
    for (const f of fl) {
      const fid = tmGet(tm.faces, f.s);
      const ex = new oc.TopExp_Explorer(f.s, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
      try {
        while (ex.More()) {
          const ew = ex.Current();
          const hc = topoHc(ew);
          let b = adj.get(hc);
          if (!b) { b = []; adj.set(hc, b); }
          let entry = b.find((x) => x.s.IsSame(ew));
          if (!entry) { entry = { s: ew, fIds: new Set() }; b.push(entry); }
          else safeDelete(ew);
          if (fid) entry.fIds.add(fid);
          ex.Next();
        }
      } finally { ex.delete(); }
      f.s.delete();
    }
    const el = exploreUnique(shape, TA.TopAbs_EDGE);
    const groups = new Map();
    for (const e of el) {
      if (tmGet(tm.edges, e.s)) { e.s.delete(); continue; }
      const b = adj.get(e.hc);
      const entry = b ? b.find((x) => x.s.IsSame(e.s)) : null;
      const fIds = entry ? [...entry.fIds].sort() : [];
      let baseKey;
      if (fIds.length) {
        const owners = fIds.map((id) => { const idx = id.indexOf('/F:'); return idx >= 0 ? id.slice(0, idx) : null; });
        const sameOwner = owners[0] && owners.every((o) => o === owners[0]);
        if (sameOwner) {
          const parts = fIds.map((id) => id.slice(owners[0].length + 3));
          baseKey = `${owners[0]}/E:${parts.join('&')}`;
        } else {
          baseKey = `${prefix}/E(${fIds.join('&')})`;
        }
      } else {
        baseKey = `${prefix}/E:anon`;
      }
      if (!groups.has(baseKey)) groups.set(baseKey, []);
      groups.get(baseKey).push({ s: e.s, key: edgeSortKey(e.s) });
    }
    for (const b of adj.values()) for (const x of b) safeDelete(x.s);
    for (const [baseKey, list] of groups) {
      if (list.length > 1) list.sort((a, b) => cmpSortKey(a.key, b.key));
      for (let i = 0; i < list.length; i++) {
        tmAdd(tm.edges, list[i].s, list.length === 1 ? baseKey : `${baseKey}#${i}`);
      }
    }
  }
  function ensureTopoComplete(shape, tm, prefix = '$self') {
    if (!tm) tm = createTopoMap();
    if (!shape || !shape.wrapped) return tm;
    const fl = exploreUnique(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
    const byType = new Map();
    for (const f of fl) {
      if (tmGet(tm.faces, f.s)) { f.s.delete(); continue; }
      const rf = new R.Face(oc.TopoDS.Face(f.s));
      let gt = 'FACE';
      try { gt = rf.geomType || 'FACE'; } catch (_) {}
      rf.delete();
      if (!byType.has(gt)) byType.set(gt, []);
      byType.get(gt).push({ s: f.s, key: faceSortKey(f.s) });
    }
    for (const [gt, list] of byType) {
      list.sort((a, b) => cmpSortKey(a.key, b.key));
      for (let i = 0; i < list.length; i++) tmAdd(tm.faces, list[i].s, `${prefix}/F:${gt}#${i}`);
    }
    deriveEdgeIdsFromFaces(shape, tm, prefix);
    return tm;
  }
  function transformTopo(inTopo, trBuilder, outShape, selfId = null) {
    const outTopo = createTopoMap();
    if (!outShape || !outShape.wrapped) return outTopo;
    const outFaces = exploreUnique(outShape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
    const outEdges = exploreUnique(outShape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    const findOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
    if (inTopo) {
      for (const bucket of inTopo.faces.values()) {
        for (const { s, id } of bucket) {
          let m = null;
          try { m = trBuilder.ModifiedShape(s); } catch (_) {}
          if (m && !m.IsNull()) {
            const mf = findOut(outFaces, m);
            const rid = resolveTid(id, selfId);
            if (mf && rid) tmAdd(outTopo.faces, mf, rid);
          }
          safeDelete(m);
        }
      }
      for (const bucket of inTopo.edges.values()) {
        for (const { s, id } of bucket) {
          let m = null;
          try { m = trBuilder.ModifiedShape(s); } catch (_) {}
          if (m && !m.IsNull()) {
            const me = findOut(outEdges, m);
            const rid = resolveTid(id, selfId);
            if (me && rid) tmAdd(outTopo.edges, me, rid);
          }
          safeDelete(m);
        }
      }
    }
    for (const f of outFaces) if (!tmGet(outTopo.faces, f.s)) f.s.delete();
    for (const e of outEdges) if (!tmGet(outTopo.edges, e.s)) e.s.delete();
    ensureTopoComplete(outShape, outTopo, selfId || '$self');
    return outTopo;
  }
  function propagateHistory(builder, inputs, outShape, opTag) {
    const outTopo = createTopoMap();
    if (!outShape || !outShape.wrapped) return outTopo;
    const TA = oc.TopAbs_ShapeEnum;
    const outFaces = exploreUnique(outShape, TA.TopAbs_FACE);
    const outEdges = exploreUnique(outShape, TA.TopAbs_EDGE);
    const findOut = (list, raw) => { const h = topoHc(raw); const b = list.find((x) => x.hc === h && x.s.IsSame(raw)); return b ? b.s : null; };
    for (const inp of inputs || []) {
      const inTopo = inp && inp.topo;
      if (!inTopo) continue;
      const selfId = inp.selfId || null;
      for (const bucket of inTopo.faces.values()) {
        for (const { s: inF, id: rawId } of bucket) {
          const id = resolveTid(rawId, selfId);
          if (!id) continue;
          const mods = readShapeList(builder.Modified(inF));
          const matched = [];
          for (const m of mods) {
            const mf = findOut(outFaces, m);
            if (mf && !matched.includes(mf)) matched.push(mf);
            safeDelete(m);
          }
          if (matched.length === 1) {
            tmAdd(outTopo.faces, matched[0], id);
          } else if (matched.length > 1) {
            matched.sort((a, b) => cmpSortKey(faceSortKey(a), faceSortKey(b)));
            matched.forEach((mf, k) => tmAdd(outTopo.faces, mf, `${id}|${opTag}#${k}`));
          } else {
            let del = false;
            try { del = !!builder.IsDeleted(inF); } catch (_) {}
            if (!del) {
              const mf = findOut(outFaces, inF);
              if (mf) tmAdd(outTopo.faces, mf, id);
            }
          }
        }
      }
      for (const bucket of inTopo.edges.values()) {
        for (const { s: inE, id: rawEId } of bucket) {
          const eId = resolveTid(rawEId, selfId);
          if (!eId) continue;
          const gens = readShapeList(builder.Generated(inE));
          const genFaces = [];
          const genEdges = [];
          for (const g of gens) {
            const gt = g.ShapeType();
            if (gt === TA.TopAbs_FACE) {
              const mf = findOut(outFaces, g);
              if (mf && !tmGet(outTopo.faces, mf) && !genFaces.includes(mf)) genFaces.push(mf);
            } else if (gt === TA.TopAbs_EDGE) {
              const me = findOut(outEdges, g);
              if (me && !tmGet(outTopo.edges, me) && !genEdges.includes(me)) genEdges.push(me);
            }
            safeDelete(g);
          }
          if (genFaces.length === 1) tmAdd(outTopo.faces, genFaces[0], `F:${opTag}(${eId})`);
          else if (genFaces.length > 1) {
            genFaces.sort((a, b) => cmpSortKey(faceSortKey(a), faceSortKey(b)));
            genFaces.forEach((mf, k) => tmAdd(outTopo.faces, mf, `F:${opTag}(${eId})#${k}`));
          }
          if (genEdges.length === 1) tmAdd(outTopo.edges, genEdges[0], `E:${opTag}(${eId})`);
          else if (genEdges.length > 1) {
            genEdges.sort((a, b) => cmpSortKey(edgeSortKey(a), edgeSortKey(b)));
            genEdges.forEach((me, k) => tmAdd(outTopo.edges, me, `E:${opTag}(${eId})#${k}`));
          }
        }
      }
      for (const bucket of inTopo.edges.values()) {
        for (const { s: inE, id: rawEId } of bucket) {
          const eId = resolveTid(rawEId, selfId);
          if (!eId) continue;
          const mods = readShapeList(builder.Modified(inE));
          const matched = [];
          for (const m of mods) {
            const me = findOut(outEdges, m);
            if (me && !matched.includes(me)) matched.push(me);
            safeDelete(m);
          }
          if (matched.length === 1) {
            tmAdd(outTopo.edges, matched[0], eId);
          } else if (matched.length > 1) {
            matched.sort((a, b) => cmpSortKey(edgeSortKey(a), edgeSortKey(b)));
            matched.forEach((me, k) => tmAdd(outTopo.edges, me, `${eId}|${opTag}#${k}`));
          } else {
            let del = false;
            try { del = !!builder.IsDeleted(inE); } catch (_) {}
            if (!del) {
              const me = findOut(outEdges, inE);
              if (me) tmAdd(outTopo.edges, me, eId);
            }
          }
        }
      }
    }
    for (const f of outFaces) if (!tmGet(outTopo.faces, f.s)) f.s.delete();
    for (const e of outEdges) if (!tmGet(outTopo.edges, e.s)) e.s.delete();
    ensureTopoComplete(outShape, outTopo, opTag);
    return outTopo;
  }

  // ---------- schnelle Topologie-Listen (Streuwert statt Paarvergleich) ----------
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
  function sortedSolids(shape, invMat = null) {
    if (!shape || !shape.wrapped) return [];
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(shape.wrapped, TA.TopAbs_SOLID, TA.TopAbs_SHAPE);
    const buckets = new Map();
    const list = [];
    try {
      while (ex.More()) {
        const cur = ex.Current();
        const hc = oc.ReplicadShapeHasher.HashCode(cur, HMAX);
        let b = buckets.get(hc);
        if (!b) { b = []; buckets.set(hc, b); }
        if (!b.some((x) => x.IsSame(cur))) {
          b.push(cur);
          try {
            const rs = R.cast(cur);
            const bb = bboxOf(rs);
            const wc = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
            const c = invMat ? transformPoint(invMat, wc) : wc;
            list.push({ shape: rs, bbox: bb, c });
          } catch (_) {}
        }
        ex.Next();
      }
    } finally { ex.delete(); }
    if (list.length > 1) {
      list.sort((a, b) => {
        if (Math.abs(a.c[0] - b.c[0]) > 1e-2) return a.c[0] - b.c[0];
        if (Math.abs(a.c[1] - b.c[1]) > 1e-2) return a.c[1] - b.c[1];
        if (Math.abs(a.c[2] - b.c[2]) > 1e-2) return a.c[2] - b.c[2];
        return (a.bbox[3] - a.bbox[0]) - (b.bbox[3] - b.bbox[0]);
      });
    }
    return list;
  }
  function matchBodiesLocal(saved, evalBodies) {
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
  function meshPayload(shape, tolOverride, topo = null, selfId = null) {
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
    const fi = fl.map((f) => {
      const info = faceInfo(f.shape);
      if (topo) {
        const tid = resolveTid(tmGet(topo.faces, f.shape.wrapped), selfId);
        if (tid) info.tid = tid;
      }
      return info;
    });
    const ei = el.map((f) => {
      const g = edgeGeom(f.shape);
      if (topo) {
        const tid = resolveTid(tmGet(topo.edges, f.shape.wrapped), selfId);
        if (tid) g.tid = tid;
      }
      return g;
    });
    const sl = sortedSolids(shape);
    let bodies = null, faceBody = null, edgeBody = null;
    if (sl.length > 1) {
      bodies = sl.map((s) => ({ bbox: s.bbox, c: s.c }));
      faceBody = new Array(fl.length).fill(-1);
      edgeBody = new Array(el.length).fill(-1);
      const TA = oc.TopAbs_ShapeEnum;
      for (let bi = 0; bi < sl.length; bi++) {
        const sw = sl[bi].shape.wrapped;
        const fx = new oc.TopExp_Explorer(sw, TA.TopAbs_FACE, TA.TopAbs_SHAPE);
        try {
          while (fx.More()) {
            const hc = oc.ReplicadShapeHasher.HashCode(fx.Current(), HMAX);
            const idx = fIndex.get(hc);
            if (idx !== undefined) faceBody[idx] = bi;
            fx.Next();
          }
        } finally { fx.delete(); }
        const ex = new oc.TopExp_Explorer(sw, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
        try {
          while (ex.More()) {
            const hc = oc.ReplicadShapeHasher.HashCode(ex.Current(), HMAX);
            const idx = eIndex.get(hc);
            if (idx !== undefined) edgeBody[idx] = bi;
            ex.Next();
          }
        } finally { ex.delete(); }
      }
    }
    for (const s of sl) safeDelete(s.shape);
    for (const f of fl) f.shape.delete(); for (const x of el) x.shape.delete();
    return {
      bbox: b, tol,
      vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles),
      lines: new Float32Array(lines), faceGroups, edgeGroups, faces: fi, edges: ei,
      bodies, faceBody, edgeBody,
    };
  }

  // ---------- Rippe (KP-06) ----------
  function transformDir(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  }
  function extractSolids(shape) {
    if (!shape) return [];
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(shape.wrapped, TA.TopAbs_SOLID, TA.TopAbs_SHAPE);
    const buckets = new Map(), out = [];
    try {
      while (ex.More()) {
        const it = ex.Current();
        const hc = oc.ReplicadShapeHasher.HashCode(it, HMAX);
        let b = buckets.get(hc); if (!b) { b = []; buckets.set(hc, b); }
        if (!b.some((x) => x.IsSame(it))) { b.push(it); out.push(R.cast(oc.TopoDS.Solid(it)).clone()); }
        ex.Next();
      }
    } finally { ex.delete(); }
    return out;
  }
  function minDistShapes(s1, s2) {
    const t = new oc.BRepExtrema_DistShapeShape();
    try {
      t.LoadS1(s1.wrapped); t.LoadS2(s2.wrapped); t.Perform();
      return t.IsDone() && t.NbSolution() > 0 ? t.Value() : Infinity;
    } catch (_) { return Infinity; }
    finally { try { t.delete(); } catch (_) {} }
  }
  function arcInfo2D(a, m, b) {
    const ax = a[0], ay = a[1], bx = m[0], by = m[1], cx = b[0], cy = b[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return null;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy), T = Math.PI * 2, nm = (x) => ((x % T) + T) % T;
    const a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
    const ccw = nm(am - a0) < nm(a1 - a0);
    return { c: [ux, uy], r, sweep: ccw ? nm(a1 - a0) : -nm(a0 - a1) };
  }
  function extendChain2D(segs, extLen) {
    const cloneS = (s) => (s.t === 'bez' ? { t: 'bez', a: s.a.slice(), c1: s.c1.slice(), c2: s.c2.slice(), b: s.b.slice() } : s.t === 'arc' ? { t: 'arc', a: s.a.slice(), m: s.m.slice(), b: s.b.slice() } : { t: 'line', a: s.a.slice(), b: s.b.slice() });
    const n2 = (dx, dy) => { const L = Math.hypot(dx, dy); return L > 1e-9 ? [dx / L, dy / L] : null; };
    const out = segs.map(cloneS);
    if (!out.length) return out;
    const s0 = out[0], s1 = out[out.length - 1];
    let tStart = null, tEnd = null;
    if (s0.t === 'line') tStart = n2(s0.a[0] - s0.b[0], s0.a[1] - s0.b[1]);
    else if (s0.t === 'bez') tStart = n2(s0.a[0] - s0.c1[0], s0.a[1] - s0.c1[1]) || n2(s0.a[0] - s0.b[0], s0.a[1] - s0.b[1]);
    else if (s0.t === 'arc') {
      const ai = arcInfo2D(s0.a, s0.m, s0.b);
      if (ai) { const rx = s0.a[0] - ai.c[0], ry = s0.a[1] - ai.c[1]; tStart = ai.sweep > 0 ? n2(ry, -rx) : n2(-ry, rx); }
      else tStart = n2(s0.a[0] - s0.b[0], s0.a[1] - s0.b[1]);
    }
    if (s1.t === 'line') tEnd = n2(s1.b[0] - s1.a[0], s1.b[1] - s1.a[1]);
    else if (s1.t === 'bez') tEnd = n2(s1.b[0] - s1.c2[0], s1.b[1] - s1.c2[1]) || n2(s1.b[0] - s1.a[0], s1.b[1] - s1.a[1]);
    else if (s1.t === 'arc') {
      const ai = arcInfo2D(s1.a, s1.m, s1.b);
      if (ai) { const rx = s1.b[0] - ai.c[0], ry = s1.b[1] - ai.c[1]; tEnd = ai.sweep > 0 ? n2(-ry, rx) : n2(ry, -rx); }
      else tEnd = n2(s1.b[0] - s1.a[0], s1.b[1] - s1.a[1]);
    }
    if (tStart) {
      const aExt = [s0.a[0] + tStart[0] * extLen, s0.a[1] + tStart[1] * extLen];
      if (s0.t === 'line') s0.a = aExt; else out.unshift({ t: 'line', a: aExt, b: s0.a.slice() });
    }
    if (tEnd) {
      const bExt = [s1.b[0] + tEnd[0] * extLen, s1.b[1] + tEnd[1] * extLen];
      if (s1.t === 'line') s1.b = bExt; else out.push({ t: 'line', a: s1.b.slice(), b: bExt });
    }
    return out;
  }
  function offsetOpen2D(segs, d) {
    const pts = [];
    const pushP = (q) => { if (!pts.length || Math.hypot(pts[pts.length - 1][0] - q[0], pts[pts.length - 1][1] - q[1]) > 1e-7) pts.push([q[0], q[1]]); };
    for (const s of segs) {
      if (s.t === 'line') { pushP(s.a); pushP(s.b); }
      else if (s.t === 'arc') { for (const q of arcSample(s.a, s.m, s.b, 24)) pushP(q); }
      else if (s.t === 'bez') {
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, u = 1 - t;
          pushP([0, 1].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k]));
        }
      }
    }
    if (pts.length < 2) throw new Error('Die Rippen-Linie ist zu kurz.');
    const m = pts.length, ec = m - 1, norms = [];
    for (let i = 0; i < ec; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      norms.push([-dy / L, dx / L]);
    }
    const V = [];
    for (let i = 0; i < m; i++) {
      let off;
      if (i === 0) off = [norms[0][0] * d, norms[0][1] * d];
      else if (i === m - 1) off = [norms[ec - 1][0] * d, norms[ec - 1][1] * d];
      else {
        const nA = norms[i - 1], nB = norms[i];
        const bx = nA[0] + nB[0], by = nA[1] + nB[1], den = 1 + nA[0] * nB[0] + nA[1] * nB[1];
        if (den > 0.1) off = [(bx / den) * d, (by / den) * d];
        else { const bl = Math.hypot(bx, by); off = bl > 1e-9 ? [(bx / bl) * 3 * d, (by / bl) * 3 * d] : [nA[0] * d, nA[1] * d]; }
      }
      V.push([pts[i][0] + off[0], pts[i][1] + off[1]]);
    }
    const out = [];
    for (let i = 0; i < ec; i++) if (Math.hypot(V[i + 1][0] - V[i][0], V[i + 1][1] - V[i][1]) > 1e-7) out.push({ t: 'line', a: V[i], b: V[i + 1] });
    for (let i = 1; i < out.length; i++) out[i].a = out[i - 1].b.slice();
    return out;
  }
  function stripLoop2D(extSegs, dLeft, dRight) {
    const A = offsetOpen2D(extSegs, dLeft);
    const B = offsetOpen2D(extSegs, dRight);
    const rev = (s) => ({ t: 'line', a: s.b.slice(), b: s.a.slice() });
    return [
      ...A,
      { t: 'line', a: A[A.length - 1].b.slice(), b: B[B.length - 1].b.slice() },
      ...B.slice().reverse().map(rev),
      { t: 'line', a: B[0].a.slice(), b: A[0].a.slice() },
    ];
  }
  function buildRibOn(baseShape, rel, p) {
    const chains = p.chains || [];
    if (!chains.length) throw new Error('Die Rippe braucht mindestens eine offene Linie, einen Bogen oder eine Kurve in der Skizze.');
    const thickness = num(p.thickness, 2);
    if (!(thickness > 1e-4)) throw new Error('Die Dicke der Rippe muss größer als 0 mm sein.');
    const draft = num(p.draft, 0);
    if (Math.abs(draft) >= 45) throw new Error('Die Schräge der Rippe muss kleiner als 45° sein.');
    const depth = Math.max(0, num(p.depth, 0));
    const side = p.side === 'side1' || p.side === 'side2' ? p.side : 'center';
    const mode = p.dir === 'parallel' ? 'parallel' : 'normal';
    const flip = !!p.flip;

    const pl = p.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const M = planeMap({
      o: transformPoint(rel, pl.o || [0, 0, 0]),
      x: norm(transformDir(rel, pl.x || [1, 0, 0])),
      n: norm(transformDir(rel, pl.n || [0, 0, 1])),
    });
    const bb = bboxOf(baseShape);
    const diag = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    const extLen = Math.max(50, diag * 2);
    const cBase = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
    const baseSolidCount = Math.max(1, extractSolids(baseShape).length);

    const projectSpan = (dir3) => {
      let sMin = Infinity, sMax = -Infinity;
      for (let i = 0; i < 8; i++) {
        const pt = [i & 1 ? bb[3] : bb[0], i & 2 ? bb[4] : bb[1], i & 4 ? bb[5] : bb[2]];
        const s = dot(sub(pt, M.o), dir3);
        if (s < sMin) sMin = s;
        if (s > sMax) sMax = s;
      }
      return [sMin, sMax];
    };

    const tryRibDirection = (sign) => {
      let curShape = baseShape.clone(), added = 0;
      const cleanupCur = () => { if (curShape !== baseShape) safeDelete(curShape); };
      try {
        for (const ch of chains) {
          if (!ch || !ch.segs || !ch.segs.length) continue;
          let rawRib = null, origWire = null, diff = null, kept = [], outside = [];
          try {
            if (mode === 'normal') {
              const sC = dot(sub(cBase, M.o), M.n);
              const d0 = sC > 1e-4 ? M.n : mul(M.n, -1);
              const dirVec = mul(d0, sign);
              const [, sMax] = projectSpan(dirVec);
              if (sMax <= 1e-4) { continue; }
              const H = depth > 1e-4 ? depth : Math.max(1, sMax + 5);
              const dL = side === 'side1' ? thickness : side === 'side2' ? 0 : thickness / 2;
              const dR = side === 'side1' ? 0 : side === 'side2' ? -thickness : -thickness / 2;
              const extSegs = extendChain2D(ch.segs, extLen);
              if (Math.abs(draft) < 1e-6) {
                const face = regionFace({ outer: { segs: stripLoop2D(extSegs, dL, dR) }, holes: [] }, M);
                rawRib = R.basicFaceExtrusion(face, new R.Vector(mul(dirVec, H)));
                safeDelete(face);
              } else {
                const delta = H * Math.tan((draft * Math.PI) / 180);
                if (thickness + 2 * delta <= 0.05) throw new Error('Die Schräge ist für diese Dicke und Höhe zu groß.');
                const w0 = loopWire({ segs: stripLoop2D(extSegs, dL, dR) }, M, true);
                const w1 = loopWire({ segs: stripLoop2D(extSegs, dL + delta, dR - delta) }, M, true).translate(mul(dirVec, H));
                try { rawRib = R.loft([w0, w1], { ruled: true }); }
                finally { safeDelete(w0); safeDelete(w1); }
              }
            } else {
              const pA = ch.segs[0].a, pB = ch.segs[ch.segs.length - 1].b;
              const cdx = pB[0] - pA[0], cdy = pB[1] - pA[1], cLen = Math.hypot(cdx, cdy);
              if (cLen < 1e-7) continue;
              const n1 = [-cdy / cLen, cdx / cLen], n2 = [cdy / cLen, -cdx / cLen];
              const cBase2 = [dot(sub(cBase, M.o), M.x), dot(sub(cBase, M.o), M.y)];
              const mid2 = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2];
              const f0 = (cBase2[0] - mid2[0]) * n1[0] + (cBase2[1] - mid2[1]) * n1[1] >= 0 ? n1 : n2;
              const fill2D = [f0[0] * sign, f0[1] * sign];
              const fillDir3 = norm(add(mul(M.x, fill2D[0]), mul(M.y, fill2D[1])));
              const [, sMax] = projectSpan(fillDir3);
              if (sMax <= 1e-4) { continue; }
              const fillLen = depth > 1e-4 ? depth : Math.max(50, diag * 1.5);
              const extSegs = extendChain2D(ch.segs, extLen);
              const aExt = extSegs[0].a, bExt = extSegs[extSegs.length - 1].b;
              const bFar = [bExt[0] + fill2D[0] * fillLen, bExt[1] + fill2D[1] * fillLen];
              const aFar = [aExt[0] + fill2D[0] * fillLen, aExt[1] + fill2D[1] * fillLen];
              const polyLoop = [...extSegs, { t: 'line', a: bExt.slice(), b: bFar }, { t: 'line', a: bFar.slice(), b: aFar }, { t: 'line', a: aFar.slice(), b: aExt.slice() }];
              const z0 = side === 'side1' ? 0 : side === 'side2' ? -thickness : -thickness / 2;
              let face = regionFace({ outer: { segs: polyLoop }, holes: [] }, M);
              if (Math.abs(z0) > 1e-9) { const ft = face.translate(mul(M.n, z0)); safeDelete(face); face = ft; }
              rawRib = R.basicFaceExtrusion(face, new R.Vector(mul(M.n, thickness)));
              safeDelete(face);
              if (Math.abs(draft) >= 1e-6) {
                const dDir = R.asDir(fillDir3), pln = new oc.gp_Pln(R.asPnt(M.P(mid2)), dDir);
                const builder = new oc.BRepOffsetAPI_DraftAngle(rawRib.wrapped);
                let fn = 0;
                try {
                  for (const fc of rawRib.faces) {
                    let v = null; try { v = fc.normalAt(); } catch (_) {}
                    if (v && Math.abs(v.x * M.n[0] + v.y * M.n[1] + v.z * M.n[2]) > 0.98) {
                      builder.Add(fc.wrapped, dDir, (draft * Math.PI) / 180, pln, true);
                      fn++;
                    }
                  }
                  if (fn) {
                    builder.Build();
                    if (builder.IsDone && builder.IsDone()) {
                      const drafted = R.cast(builder.Shape());
                      safeDelete(rawRib); rawRib = drafted;
                    }
                  }
                } finally { try { builder.delete(); pln.delete(); dDir.delete(); } catch (_) {} }
              }
            }

            origWire = R.assembleWire(segEdges(ch.segs, M));
            diff = rawRib.cut(curShape);
            const solids = extractSolids(diff);
            for (const s of solids) {
              let vol = 0; try { vol = R.measureVolume(s); } catch (_) { vol = 0; }
              if (!(vol > 1e-4)) { safeDelete(s); continue; }
              const sb = bboxOf(s);
              const escaped = sb[0] < bb[0] - 0.5 || sb[3] > bb[3] + 0.5 || sb[1] < bb[1] - 0.5 || sb[4] > bb[4] + 0.5 || sb[2] < bb[2] - 0.5 || sb[5] > bb[5] + 0.5;
              if (!escaped && minDistShapes(s, origWire) < 0.25) kept.push(s);
              else outside.push(s);
            }
            if (kept.length) {
              let fused = null;
              let ribPart = kept.length === 1 ? kept[0] : fuseAll(kept, true);
              kept = [];
              try {
                fused = curShape.fuse(ribPart);
                if (extractSolids(fused).length <= baseSolidCount) {
                  safeDelete(curShape); curShape = fused; fused = null; added++;
                } else {
                  safeDelete(fused); fused = null;
                }
              } catch (_) { safeDelete(fused); fused = null; }
              finally { safeDelete(ribPart); }
              if (!fused && added === 0) {
                // Fallback: unverzerrtes Rohstück abzüglich der Außenbereiche mit dem Zielkörper vereinigen
                let outUnion = outside.length ? fuseAll(outside, true) : null;
                outside = [];
                let trimmed = null;
                try {
                  trimmed = outUnion ? rawRib.cut(outUnion) : rawRib.clone();
                  const f2 = curShape.fuse(trimmed);
                  if (extractSolids(f2).length <= baseSolidCount) {
                    safeDelete(curShape); curShape = f2; added++;
                  } else safeDelete(f2);
                } catch (_) {}
                finally { safeDelete(outUnion); safeDelete(trimmed); }
              }
            }
          } finally {
            safeDelete(origWire); safeDelete(diff); safeDelete(rawRib);
            for (const s of kept) safeDelete(s);
            for (const s of outside) safeDelete(s);
          }
        }
        if (added > 0) { const out = curShape; curShape = null; return out; }
        return null;
      } finally { cleanupCur(); }
    };

    const firstSign = flip ? -1 : 1;
    let res = tryRibDirection(firstSign);
    if (!res && !flip) res = tryRibDirection(-firstSign);
    if (!res) throw new Error('Die Rippe trifft keine angrenzenden Wände des Zielkörpers. Prüfe die Skizzenebene, die Linienlage oder kehre die Richtung um.');
    return res;
  }

  // ---------- Wickeln um Zylinder (KP-34) ----------
  function matchCylFace(shape, spec) {
    const cyls = [];
    for (const f of shape.faces) {
      if (f.geomType !== 'CYLINDRE') continue;
      try {
        const ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
        const cy = ad.Cylinder(), ax = cy.Axis(), l = ax.Location(), d = ax.Direction();
        const o = [l.X(), l.Y(), l.Z()], dir = norm([d.X(), d.Y(), d.Z()]), r = cy.Radius();
        ad.delete();
        const c = vec(f.center);
        const ori = f.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
        cyls.push({ face: f, o, d: dir, r, c, ori });
      } catch (_) {}
    }
    if (!cyls.length) return null;
    if (cyls.length === 1) return cyls[0].face;
    const sAxis = spec && Array.isArray(spec.axis) && spec.axis.length >= 6 ? spec.axis : null;
    const sO = sAxis ? sAxis.slice(0, 3) : null;
    const sD = sAxis ? norm(sAxis.slice(3, 6)) : null;
    const sR = spec && typeof spec.r === 'number' ? spec.r : null;
    const sC = spec && Array.isArray(spec.c) && spec.c.length >= 3 ? spec.c : null;
    const sOri = spec && typeof spec.ori === 'number' ? spec.ori : null;
    const distLine = (p, o, d) => { const v = sub(p, o); return len(sub(v, mul(d, dot(v, d)))); };
    let best = null, bs = Infinity;
    for (const item of cyls) {
      let score = 0;
      if (sOri != null && item.ori !== sOri) score += 1000;
      if (sD) score += (1 - Math.abs(dot(item.d, sD))) * 500;
      if (sO && sD) score += distLine(item.o, sO, sD) * 20;
      if (sR != null) score += Math.abs(item.r - sR) * 5;
      if (sC) score += len(sub(item.c, sC));
      if (score < bs) { bs = score; best = item.face; }
    }
    return best;
  }
  function cylFrameOf(face, spec) {
    const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
    const cy = ad.Cylinder(), ax = cy.Axis(), l = ax.Location(), d = ax.Direction();
    const O = [l.X(), l.Y(), l.Z()];
    let A = norm([d.X(), d.Y(), d.Z()]);
    const r = cy.Radius();
    ad.delete();
    if (Math.abs(A[2]) > 0.001 ? A[2] < 0 : Math.abs(A[1]) > 0.001 ? A[1] < 0 : A[0] < 0) A = mul(A, -1);
    const isInner = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    let vMin = Infinity, vMax = -Infinity;
    for (const ed of face.edges) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const pt = vec(ed.pointAt(t));
        const q = dot(sub(pt, O), A);
        if (q < vMin) vMin = q;
        if (q > vMax) vMax = q;
      }
    }
    if (!isFinite(vMin)) { vMin = 0; vMax = 20; }
    const vMid = (vMin + vMax) / 2;
    let ref = spec && Array.isArray(spec.refDir) && spec.refDir.length >= 3
      ? spec.refDir.map(Number)
      : (Math.abs(A[2]) > 0.9 ? [0, -1, 0] : [0, 0, 1]);
    let proj = sub(ref, mul(A, dot(ref, A)));
    if (len(proj) < 1e-4) {
      ref = Math.abs(A[1]) < 0.9 ? [0, -1, 0] : [1, 0, 0];
      proj = sub(ref, mul(A, dot(ref, A)));
    }
    const R0 = norm(proj);
    const T0 = norm(cross(A, R0));
    return { O, A, R: r, R0, T0, vMin, vMax, vMid, isInner };
  }
  function arcToBeziers2D(a, m, b) {
    const ai = arcInfo2D(a, m, b);
    if (!ai) return [{ a, c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], b }];
    const n = Math.max(1, Math.ceil(Math.abs(ai.sweep) / (Math.PI / 4)));
    const step = ai.sweep / n;
    const a0 = Math.atan2(a[1] - ai.c[1], a[0] - ai.c[0]);
    const k = (4 / 3) * Math.tan(step / 4);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t1 = a0 + i * step, t2 = a0 + (i + 1) * step;
      const c1a = Math.cos(t1), s1a = Math.sin(t1), c2a = Math.cos(t2), s2a = Math.sin(t2);
      const p1 = i === 0 ? a.slice() : [ai.c[0] + ai.r * c1a, ai.c[1] + ai.r * s1a];
      const p2 = i === n - 1 ? b.slice() : [ai.c[0] + ai.r * c2a, ai.c[1] + ai.r * s2a];
      const cp1 = [p1[0] - k * ai.r * s1a, p1[1] + k * ai.r * c1a];
      const cp2 = [p2[0] + k * ai.r * s2a, p2[1] - k * ai.r * c2a];
      out.push({ a: p1, c1: cp1, c2: cp2, b: p2 });
    }
    return out;
  }
  function ellipseToBeziers2D(E) {
    const rx = E.rx, ry = E.ry, rot = E.rot || 0, c = E.c;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const mapPt = (x, y) => [c[0] + x * cr - y * sr, c[1] + x * sr + y * cr];
    const n = 8, step = (Math.PI * 2) / n, k = (4 / 3) * Math.tan(step / 4);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t1 = i * step, t2 = (i + 1) * step;
      const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
      const p1 = mapPt(rx * c1, ry * s1);
      const p2 = mapPt(rx * c2, ry * s2);
      const cp1 = mapPt(rx * (c1 - k * s1), ry * (s1 + k * c1));
      const cp2 = mapPt(rx * (c2 + k * s2), ry * (s2 - k * c2));
      out.push({ a: p1, c1: cp1, c2: cp2, b: p2 });
    }
    return out;
  }
  function wrap2dTransform(pt, rotRad, flip) {
    let x = flip ? -pt[0] : pt[0], y = pt[1];
    if (Math.abs(rotRad) > 1e-9) {
      const co = Math.cos(rotRad), si = Math.sin(rotRad);
      const nx = x * co - y * si, ny = x * si + y * co;
      x = nx; y = ny;
    }
    return [x, y];
  }
  function wrapSegsOfLoop(loop, rotRad, flip) {
    const xf = (q) => wrap2dTransform(q, rotRad, flip);
    if (loop.ellipse) {
      return ellipseToBeziers2D(loop.ellipse).map((s) => ({ t: 'bez', a: xf(s.a), c1: xf(s.c1), c2: xf(s.c2), b: xf(s.b) }));
    }
    if (loop.circle) {
      const { c, r } = loop.circle;
      return ellipseToBeziers2D({ c, rx: r, ry: r, rot: 0 }).map((s) => ({ t: 'bez', a: xf(s.a), c1: xf(s.c1), c2: xf(s.c2), b: xf(s.b) }));
    }
    return (loop.segs || []).map((s) => {
      if (s.t === 'bez') return { t: 'bez', a: xf(s.a), c1: xf(s.c1), c2: xf(s.c2), b: xf(s.b) };
      if (s.t === 'arc') return { t: 'arc', a: xf(s.a), m: xf(s.m), b: xf(s.b) };
      return { t: 'line', a: xf(s.a), b: xf(s.b) };
    });
  }
  function wrapLoopUBounds(loop, rotRad, flip, R, theta0) {
    let uMin = Infinity, uMax = -Infinity;
    const addX = (x) => { const u = theta0 + x / R; if (u < uMin) uMin = u; if (u > uMax) uMax = u; };
    if (loop.circle) {
      const c = wrap2dTransform(loop.circle.c, rotRad, flip);
      addX(c[0] - loop.circle.r);
      addX(c[0] + loop.circle.r);
      return [uMin, uMax];
    }
    for (const s of wrapSegsOfLoop(loop, rotRad, flip)) {
      if (s.t === 'arc') { for (const q of arcSample(s.a, s.m, s.b, 16)) addX(q[0]); }
      else if (s.t === 'bez') {
        for (let i = 0; i <= 12; i++) {
          const t = i / 12, u = 1 - t;
          addX(u * u * u * s.a[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.b[0]);
        }
      } else { addX(s.a[0]); addX(s.b[0]); }
    }
    return [uMin, uMax];
  }
  function buildWrappedWire2d(loopOrSegs, isClosed, surf, R, theta0, uShift, vMid, shiftY, rotRad, flip, ccw) {
    const toUV = (pt) => [theta0 + pt[0] / R + uShift, vMid + shiftY + pt[1]];
    const makeBez2dEdge = (a, c1, c2, b) => {
      const p1 = toUV(a), p2 = toUV(c1), p3 = toUV(c2), p4 = toUV(b);
      const arr = new oc.NCollection_Array1_gp_Pnt2d(1, 4);
      const g1 = new oc.gp_Pnt2d(p1[0], p1[1]), g2 = new oc.gp_Pnt2d(p2[0], p2[1]), g3 = new oc.gp_Pnt2d(p3[0], p3[1]), g4 = new oc.gp_Pnt2d(p4[0], p4[1]);
      arr.SetValue(1, g1); arr.SetValue(2, g2); arr.SetValue(3, g3); arr.SetValue(4, g4);
      const bz = new oc.Geom2d_BezierCurve(arr);
      const me = new oc.BRepBuilderAPI_MakeEdge(bz, surf);
      const ed = me.Edge();
      me.delete(); bz.delete(); arr.delete(); g1.delete(); g2.delete(); g3.delete(); g4.delete();
      return ed;
    };
    if (!Array.isArray(loopOrSegs) && loopOrSegs.circle) {
      const c2 = wrap2dTransform(loopOrSegs.circle.c, rotRad, flip);
      const uv = toUV(c2);
      const ru = loopOrSegs.circle.r / R, rv = loopOrSegs.circle.r;
      const pnt = new oc.gp_Pnt2d(uv[0], uv[1]);
      let d1, d2, maj, min;
      if (rv >= ru) {
        d1 = new oc.gp_Dir2d(0, 1); d2 = new oc.gp_Dir2d(-1, 0); maj = rv; min = ru;
      } else {
        d1 = new oc.gp_Dir2d(1, 0); d2 = new oc.gp_Dir2d(0, 1); maj = ru; min = rv;
      }
      const ax22 = new oc.gp_Ax22d(pnt, d1, d2);
      const gpEl = new oc.gp_Elips2d(ax22, maj, min);
      const el = new oc.Geom2d_Ellipse(gpEl);
      const me = new oc.BRepBuilderAPI_MakeEdge(el, surf);
      let ed = me.Edge();
      if (!ccw) ed = oc.TopoDS.Edge(ed.Reversed());
      const wb = new oc.BRepBuilderAPI_MakeWire(ed);
      const wire = wb.Wire();
      wb.delete(); me.delete(); el.delete(); gpEl.delete(); ax22.delete(); d1.delete(); d2.delete(); pnt.delete();
      oc.BRepLib.BuildCurves3d(wire);
      return wire;
    }
    let segs = Array.isArray(loopOrSegs) ? loopOrSegs.map((s) => {
      const xf = (q) => wrap2dTransform(q, rotRad, flip);
      if (s.t === 'bez') return { t: 'bez', a: xf(s.a), c1: xf(s.c1), c2: xf(s.c2), b: xf(s.b) };
      if (s.t === 'arc') return { t: 'arc', a: xf(s.a), m: xf(s.m), b: xf(s.b) };
      return { t: 'line', a: xf(s.a), b: xf(s.b) };
    }) : wrapSegsOfLoop(loopOrSegs, rotRad, flip);
    if (isClosed) {
      const area = loopArea({ segs });
      if ((area > 0) !== ccw) {
        segs = segs.slice().reverse().map((s) => (s.t === 'bez' ? { ...s, a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { ...s, a: s.b, b: s.a }));
      }
    }
    const edges = [];
    for (const s of segs) {
      if (s.t === 'line') {
        const p1 = toUV(s.a), p2 = toUV(s.b);
        if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-7) continue;
        const g1 = new oc.gp_Pnt2d(p1[0], p1[1]), g2 = new oc.gp_Pnt2d(p2[0], p2[1]);
        const ms = new oc.GC_MakeSegment2d(g1, g2);
        const me = new oc.BRepBuilderAPI_MakeEdge(ms.Value(), surf);
        edges.push(me.Edge());
        me.delete(); ms.delete(); g1.delete(); g2.delete();
      } else if (s.t === 'arc') {
        for (const bz of arcToBeziers2D(s.a, s.m, s.b)) edges.push(makeBez2dEdge(bz.a, bz.c1, bz.c2, bz.b));
      } else if (s.t === 'bez') {
        edges.push(makeBez2dEdge(s.a, s.c1, s.c2, s.b));
      }
    }
    if (!edges.length) return null;
    const wire = makeWireFromEdges(edges);
    oc.BRepLib.BuildCurves3d(wire);
    return wire;
  }
  function makeCylAx3(O, A, R0, T0, rotU) {
    const co = Math.cos(rotU), si = Math.sin(rotU);
    const xDir = norm(add(mul(R0, co), mul(T0, si)));
    const pO = R.asPnt(O), dA = R.asDir(A), dX = R.asDir(xDir);
    const ax3 = new oc.gp_Ax3(pO, dA, dX);
    pO.delete(); dA.delete(); dX.delete();
    return ax3;
  }
  function fixWrapSolid(raw) {
    const sfs = new oc.ShapeFix_Solid(oc.TopoDS.Solid(raw));
    sfs.Perform();
    let res = R.cast(oc.TopoDS.Solid(sfs.Solid()));
    sfs.delete();
    if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
    return res;
  }
  function buildWrapOn(srcShape, p) {
    const cylFace = matchCylFace(srcShape, p.face);
    if (!cylFace) { const e = new Error('Wickeln: Die gewählte Zylinderfläche gibt es nicht mehr.'); e.code = 'ref'; throw e; }
    const F = cylFrameOf(cylFace, p.face);
    const mode = p.mode === 'deboss' || p.mode === 'line' ? p.mode : 'emboss';
    const depth = num(p.depth, 2);
    const theta0 = (num(p.angle, 0) * Math.PI) / 180;
    const shiftY = num(p.shiftY, 0);
    const rotRad = (num(p.rot, 0) * Math.PI) / 180;
    const flip = !!p.flip;
    const regions = Array.isArray(p.regions) ? p.regions : [];
    const chains = Array.isArray(p.chains) ? p.chains : [];

    if (mode !== 'line') {
      if (!regions.length) throw new Error('Wickeln als Prägung braucht mindestens eine geschlossene Skizzenfläche.');
      if (!(depth > 1e-4 && isFinite(depth))) throw new Error('Wickeln: Die Tiefe muss größer als 0 sein.');
      const outward = mode === 'emboss' ? !F.isInner : F.isInner;
      if (!outward && depth >= F.R - 0.05) throw new Error('Wickeln: Die Tiefe darf höchstens etwas kleiner als der Zylinderradius sein.');
      const eps = Math.min(0.05, F.R * 0.05, depth * 0.25);
      const solids = [];
      try {
        for (const rg of regions) {
          const [uMin, uMax] = wrapLoopUBounds(rg.outer, rotRad, flip, F.R, theta0);
          if (uMax - uMin >= 2 * Math.PI - 1e-3) {
            throw new Error('Wickeln: Der Umriss ist breiter als der Zylinderumfang (360°) und würde sich überschneiden.');
          }
          const uShift = Math.PI - (uMin + uMax) / 2;
          const ax3 = makeCylAx3(F.O, F.A, F.R0, F.T0, -uShift);
          const surf = new oc.Geom_CylindricalSurface(ax3, F.R);
          let wf = null;
          try {
            const outerW = buildWrappedWire2d(rg.outer, true, surf, F.R, theta0, uShift, F.vMid, shiftY, rotRad, flip, true);
            if (!outerW) continue;
            const mf = new oc.BRepBuilderAPI_MakeFace(surf, outerW, true);
            outerW.delete();
            for (const hLoop of rg.holes || []) {
              const hw = buildWrappedWire2d(hLoop, true, surf, F.R, theta0, uShift, F.vMid, shiftY, rotRad, flip, false);
              if (hw) { mf.Add(hw); hw.delete(); }
            }
            wf = mf.Face(); mf.delete();
            oc.BRepLib.BuildCurves3d(wf);
            const sff = new oc.ShapeFix_Face(wf); sff.FixOrientation(); sff.Perform();
            const fixedF = sff.Face(); sff.delete(); wf.delete(); wf = fixedF;
            const ob = new oc.BRepOffsetAPI_MakeOffsetShape();
            ob.PerformBySimple(wf, outward ? -eps : eps);
            const offSh = ob.Shape(); ob.delete();
            const ts = new oc.BRepOffsetAPI_MakeThickSolid();
            ts.MakeThickSolidBySimple(offSh, outward ? (depth + eps) : -(depth + eps));
            const rawSol = ts.Shape(); ts.delete(); safeDelete(offSh);
            solids.push(fixWrapSolid(rawSol));
            safeDelete(rawSol);
          } finally {
            safeDelete(wf); surf.delete(); ax3.delete();
          }
        }
        if (!solids.length) throw new Error('Wickeln: Aus der Skizze ließ sich keine Fläche erzeugen.');
        const toolShape = solids.length === 1 ? solids[0] : fuseAll(solids, true);
        const next = mode === 'deboss' ? srcShape.cut(toolShape) : srcShape.fuse(toolShape);
        return { shape: next, toolShape, wires: null, radius: F.R };
      } catch (err) {
        for (const s of solids) safeDelete(s);
        throw err;
      }
    }

    // Modus „Linie“: geschlossene Umrisse und offene Pfade auf den Zylinder legen und die Fläche daran teilen
    const rawWires = [];
    const wireShapes = [];
    const buildRegionWire = (loop, ccw) => {
      const [uMin, uMax] = wrapLoopUBounds(loop, rotRad, flip, F.R, theta0);
      const uShift = uMax - uMin < 2 * Math.PI - 1e-3 ? Math.PI - (uMin + uMax) / 2 : 0;
      const ax3 = makeCylAx3(F.O, F.A, F.R0, F.T0, -uShift);
      const surf = new oc.Geom_CylindricalSurface(ax3, F.R);
      try {
        const w = buildWrappedWire2d(loop, true, surf, F.R, theta0, uShift, F.vMid, shiftY, rotRad, flip, ccw);
        if (w) { rawWires.push(w); wireShapes.push(R.cast(w)); }
      } finally { surf.delete(); ax3.delete(); }
    };
    for (const rg of regions) {
      buildRegionWire(rg.outer, true);
      for (const hLoop of rg.holes || []) buildRegionWire(hLoop, false);
    }
    if (chains.length) {
      const ax3 = makeCylAx3(F.O, F.A, F.R0, F.T0, 0);
      const surf = new oc.Geom_CylindricalSurface(ax3, F.R);
      try {
        for (const ch of chains) {
          if (!ch || !Array.isArray(ch.segs) || !ch.segs.length) continue;
          const w = buildWrappedWire2d(ch.segs, false, surf, F.R, theta0, 0, F.vMid, shiftY, rotRad, flip, true);
          if (w) { rawWires.push(w); wireShapes.push(R.cast(w)); }
        }
      } finally { surf.delete(); ax3.delete(); }
    }
    if (!rawWires.length) throw new Error('Wickeln: Die Skizze enthält keine Linie und keinen Umriss.');
    const args = new oc.NCollection_List_TopoDS_Shape();
    args.Append(srcShape.wrapped);
    const tools = new oc.NCollection_List_TopoDS_Shape();
    for (const w of rawWires) tools.Append(w);
    const spl = new oc.BRepAlgoAPI_Splitter();
    spl.SetArguments(args);
    spl.SetTools(tools);
    spl.Build();
    let resShape = null;
    try {
      if (spl.HasErrors()) throw new Error('Wickeln: Die Linie ließ sich nicht auf die Zylinderfläche legen.');
      resShape = R.cast(spl.Shape());
    } finally {
      spl.delete(); args.delete(); tools.delete();
    }
    return { shape: resShape, toolShape: null, wires: wireShapes, radius: F.R };
  }
  function buildSweepAlongWires(wires, p) {
    if (!wires || !wires.length) throw new Error('Entlang Pfad: Die gewickelte Linie ist leer.');
    const solids = [];
    for (const spine of wires) {
      const ed = spine.edges && spine.edges[0];
      if (!ed) continue;
      const P0 = vec(ed.startPoint);
      const T = norm(vec(ed.tangentAt(0)));
      const up = Math.abs(T[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
      const d = dot(T, up);
      const N = norm([up[0] - T[0] * d, up[1] - T[1] * d, up[2] - T[2] * d]);
      const V = cross(T, N);
      const prof = (inset) => {
        if (p.shape === 'sketch' && p.prof) {
          if (inset > 0) return null;
          const Y = cross(T, V);
          const o = [0, 1, 2].map((k) => P0[k] - V[k] * p.prof.c[0] - Y[k] * p.prof.c[1]);
          return loopWire(p.prof.outer, planeMap({ o, x: V, n: T }), true);
        }
        if (p.shape === 'rect') {
          const w = pos(p.w, 3) / 2 - inset, h = pos(p.h, 2) / 2 - inset;
          if (w <= 0 || h <= 0) return null;
          const q = (a, b) => [0, 1, 2].map((k) => P0[k] + V[k] * a + N[k] * b);
          const c = [q(-w, -h), q(w, -h), q(w, h), q(-w, h)];
          return R.assembleWire([R.makeLine(c[0], c[1]), R.makeLine(c[1], c[2]), R.makeLine(c[2], c[3]), R.makeLine(c[3], c[0])]);
        }
        const r = pos(p.d, 2) / 2 - inset;
        if (r <= 0) return null;
        return R.assembleWire([R.makeCircle(r, P0, T)]);
      };
      const doSweep = (w) => R.genericSweep(w, spine, { transitionMode: 'round', forceProfileSpineOthogonality: true });
      let sh = doSweep(prof(0));
      const wall = num(p.wall, 0);
      if (wall > 0 && p.shape !== 'sketch') {
        const inner = prof(wall);
        if (!inner) { safeDelete(sh); throw new Error('Die Wand ist dicker als das halbe Rohr.'); }
        const cutter = doSweep(inner);
        const res = sh.cut(cutter);
        safeDelete(sh); safeDelete(cutter);
        sh = res;
      }
      solids.push(sh);
    }
    if (!solids.length) throw new Error('Entlang Pfad: Die gewickelte Linie ließ sich nicht ziehen.');
    return solids.length === 1 ? solids[0] : fuseAll(solids, true);
  }
  function buildEmbossOn(baseShape, rel, p) {
    const regions = p.regions || [];
    if (!regions.length) throw new Error('Prägen: Die Skizze hat keine geschlossene Fläche (z. B. Text oder Logo).');
    const height = num(p.height, 1);
    if (!(height > 1e-4 && isFinite(height))) throw new Error('Prägen: Die Höhe muss größer als 0 mm sein.');
    const mode = p.mode === 'deboss' ? 'deboss' : 'emboss';
    const flip = !!p.flip;

    let f = matchFace(baseShape, p.face);
    if (!f && p.face && p.face.t && Array.isArray(p.face.c)) {
      const sameT = baseShape.faces.filter((fc) => fc.geomType === p.face.t);
      let bd = Infinity;
      for (const fc of sameT) {
        const c = vec(fc.center);
        const d = Math.hypot(c[0] - p.face.c[0], c[1] - p.face.c[1], c[2] - p.face.c[2]);
        if (d < bd) { bd = d; f = fc; }
      }
    }
    if (!f) throw new Error('Prägen: Die gewählte Fläche gibt es nicht mehr.');

    const pl = p.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const M = planeMap({
      o: transformPoint(rel, pl.o || [0, 0, 0]),
      x: norm(transformDir(rel, pl.x || [1, 0, 0])),
      n: norm(transformDir(rel, pl.n || [0, 0, 1])),
    });
    const samples = sampleRegionsLocal(regions, M);
    const fInfo = faceInfo(f);
    const fBbox = bboxOf(f);

    let projDir, t0, t1;
    const centeredSpan = (centerPt, R) => {
      const dC = dot(sub(centerPt, M.o), M.n);
      if (Math.abs(dC) > 1e-3) {
        const toward = dC > 0 ? 1 : -1;
        projDir = mul(M.n, toward);
        const D = dot(sub(centerPt, M.o), projDir);
        if (!flip) {
          t0 = Math.min(0, D - R) - height - 2;
          t1 = D;
        } else {
          t0 = D;
          t1 = D + R + height + 2;
        }
      } else {
        projDir = mul(M.n, flip ? -1 : 1);
        t0 = 0;
        t1 = R + height + 2;
      }
    };

    const diagF = Math.hypot(fBbox[3] - fBbox[0], fBbox[4] - fBbox[1], fBbox[5] - fBbox[2]);
    if ((f.geomType === 'CYLINDRE' || f.geomType === 'CONE') && Array.isArray(fInfo.axis)) {
      const axO = fInfo.axis.slice(0, 3), axD = norm(fInfo.axis.slice(3, 6));
      const closestOnAxis = add(axO, mul(axD, dot(sub(samples.center, axO), axD)));
      const R_val = fInfo.r || diagF / 2;
      centeredSpan(closestOnAxis, R_val);
    } else if (f.geomType === 'SPHERE' && Array.isArray(fInfo.sc)) {
      const R_val = fInfo.r || diagF / 2;
      centeredSpan(fInfo.sc, R_val);
    } else {
      const fc = fInfo.c || [(fBbox[0] + fBbox[3]) / 2, (fBbox[1] + fBbox[4]) / 2, (fBbox[2] + fBbox[5]) / 2];
      const dF = dot(sub(fc, samples.center), M.n);
      const baseSign = Math.abs(dF) > 1e-4 ? (dF > 0 ? 1 : -1) : (fInfo.n && dot(M.n, fInfo.n) >= 0 ? -1 : 1);
      projDir = mul(M.n, flip ? -baseSign : baseSign);
      let uMin = Infinity, uMax = -Infinity;
      for (const q of cornersOf(fBbox)) {
        const u = dot(sub(q, M.o), projDir);
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
      }
      t0 = Math.min(0, uMin) - height - 2;
      t1 = Math.max(0, uMax) + height + 2;
    }

    const shell = embossFaceShell(f, height, mode);
    const stamps = [];
    let cur = null;
    try {
      for (const rg of regions) {
        let rf = null, prism = null, stamp = null;
        try {
          rf = regionFace(rg, M);
          if (Math.abs(t0) > 1e-7) {
            const rft = rf.translate(mul(projDir, t0));
            safeDelete(rf);
            rf = rft;
          }
          prism = R.basicFaceExtrusion(rf, new R.Vector(mul(projDir, t1 - t0)));
          safeDelete(rf); rf = null;
          stamp = prism.intersect(shell);
          safeDelete(prism); prism = null;
          let vol = 0;
          try { vol = R.measureVolume(stamp); } catch (_) { vol = 0; }
          if (vol > 1e-5) stamps.push(stamp);
          else safeDelete(stamp);
        } catch (_) {
          safeDelete(rf); safeDelete(prism); safeDelete(stamp);
        }
      }
      if (!stamps.length) throw new Error('Prägen: Die Skizze trifft die gewählte Fläche nicht – prüf Lage, Größe oder „Andere Seite“.');
      cur = baseShape.clone();
      for (const st of stamps) {
        const next = mode === 'deboss' ? cur.cut(st) : cur.fuse(st);
        safeDelete(cur);
        cur = next;
      }
      const out = cur; cur = null;
      return out;
    } finally {
      safeDelete(shell);
      safeDelete(cur);
      for (const st of stamps) safeDelete(st);
    }
  }

  // ---------- Szene ----------
  // scene = { items: [ { id, kind, role, p, m (Weltmatrix), hidden, children, finishes } ] }
  // known = { id: resultKey } (was die Anzeige schon hat)
  // Formschritte mit Modus: Ein Teil mit op = {type: 'join' | 'cut' | 'common', target} wird mit einem früheren
  // Körper verrechnet und verschwindet als eigenes Teil. Ketten (B in A, C in B) landen alle im ersten Körper.
  // Ergebnis: bodies (id → {shape, key, wb} im Koordinatensystem des Zielkörpers), consumed (id → Ziel-id)
  function resolveOps(evald, errors, hiddenIds, resolved = null) {
    const byId = new Map(evald.map((e, i) => [e.it.id, { e, i }]));
    const consumed = new Map(), live = new Map(), bodies = new Map(), featureOps = new Map(), wrapWires = new Map();
    const anyMirror = evald.some((e) => e.it.kind === 'mirrorStep');
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const ID_MAT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const e of evald) if (e.shape) live.set(e.it.id, { shape: e.shape, topo: e.topo || null, key: e.key, wb: e.wb, m: e.it.m, it: e.it });
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
          const ceB = cacheEntry(kBase);
          let shape = ceB ? ceB.shape : null, shapeTopo = ceB ? ceB.topo : null, key = kBase;
          if (!shape) {
            try {
              const tr = applyMatrixWithTopo(src.shape, rel, src.topo, src.it.id);
              shape = tr.shape; shapeTopo = tr.topo;
              cachePut(kBase, shape, null, null, null, shapeTopo);
            } catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
          }
          if (it.finishes && it.finishes.length) {
            const kFin = keyOf([key, 'fin', it.finishes]);
            const ceF = cacheEntry(kFin);
            if (ceF && ceF.shape) { shape = ceF.shape; shapeTopo = ceF.topo; key = kFin; }
            else {
              const e0 = errors.length;
              const sf = applyFinishes(shape, it.finishes, errors, it.id, shapeTopo, true);
              if (sf.shape && sf.shape !== shape) {
                cachePut(kFin, sf.shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })), null, null, sf.topo);
                shape = sf.shape; shapeTopo = sf.topo; key = kFin;
              }
            }
          }
          const wb = bboxTransform(bboxCached(key, shape), it.m);
          const entry = { shape, topo: shapeTopo, key, wb, m: it.m, it };
          live.set(it.id, entry);
          bodies.set(it.id, entry);
        } else {
          consumed.set(it.id, tid);
          const rel = matMul(matInvRigid(src.m), matMul(M, src.m));
          if (!isIdentity(rel)) {
            const k = keyOf([src.key, 'xform', rel.map((v) => Math.round(v * 1e6) / 1e6)]);
            const ce = cacheEntry(k);
            let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
            if (!next) {
              try {
                const tr = applyMatrixWithTopo(src.shape, rel, src.topo, src.it.id);
                next = tr.shape; nextTopo = tr.topo;
                cachePut(k, next, null, null, null, nextTopo);
              } catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
            }
            src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
            bodies.set(tid, src);
          }
        }
        continue;
      }
      if (it.kind === 'scale') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape) {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Skalieren: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        const uniform = p.uniform !== false;
        const s0 = num(p.s, 1);
        const sx = uniform ? s0 : num(p.sx, 1);
        const sy = uniform ? s0 : num(p.sy, 1);
        const sz = uniform ? s0 : num(p.sz, 1);
        if (!(sx > 0 && sy > 0 && sz > 0 && isFinite(sx) && isFinite(sy) && isFinite(sz))) {
          errors.push({ itemId: it.id, code: 'op', message: 'Skalieren: Alle Faktoren müssen größer als 0 sein.' });
          continue;
        }
        consumed.set(it.id, tid);
        if (Math.abs(sx - 1) > 1e-9 || Math.abs(sy - 1) > 1e-9 || Math.abs(sz - 1) > 1e-9) {
          const pv = p.pivot === 'origin' ? 'origin' : 'centroid';
          const k = keyOf([src.key, 'scale', Math.round(sx * 1e6) / 1e6, Math.round(sy * 1e6) / 1e6, Math.round(sz * 1e6) / 1e6, pv, src.m.map((v) => Math.round(v * 1e6) / 1e6)]);
          const ce = cacheEntry(k);
          let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
          if (!next) {
            try {
              const idM = isIdentity(src.m);
              const wRes = idM ? { shape: src.shape, topo: src.topo } : applyMatrixWithTopo(src.shape, src.m, src.topo, src.it.id);
              const center = pv === 'origin' ? [0, 0, 0] : shapeCenterOfMass(wRes.shape, src.wb);
              let wScaled, wScaledTopo;
              if (Math.abs(sx - sy) < 1e-9 && Math.abs(sx - sz) < 1e-9) {
                const trsf = new oc.gp_Trsf();
                const cp = new oc.gp_Pnt(center[0], center[1], center[2]);
                trsf.SetScale(cp, sx);
                const tr = new oc.BRepBuilderAPI_Transform(wRes.shape.wrapped, trsf, true, false);
                wScaled = R.cast(tr.ModifiedShape(wRes.shape.wrapped));
                wScaledTopo = wRes.topo ? transformTopo(wRes.topo, tr, wScaled, src.it.id) : ensureTopoComplete(wScaled, createTopoMap(), src.it.id);
                tr.delete(); trsf.delete(); cp.delete();
              } else {
                wScaled = applyScale(wRes.shape, center, sx, sy, sz);
                wScaledTopo = ensureTopoComplete(wScaled, createTopoMap(), src.it.id);
              }
              if (!idM) { safeDelete(wRes.shape); freeTopoMap(wRes.topo); }
              if (idM) {
                next = wScaled; nextTopo = wScaledTopo;
              } else {
                const back = applyMatrixWithTopo(wScaled, matInvRigid(src.m), wScaledTopo, src.it.id);
                next = back.shape; nextTopo = back.topo;
                safeDelete(wScaled); freeTopoMap(wScaledTopo);
              }
              cachePut(k, next, null, null, null, nextTopo);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              continue;
            }
          }
          src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
          bodies.set(tid, src);
        }
        continue;
      }
      if (it.kind === 'thicken') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        const mode = p.mode === 'new' || p.mode === 'cut' ? p.mode : 'join';
        const dir = p.dir === 'in' || p.dir === 'mid' ? p.dir : 'out';
        const dist = num(p.t, 2);
        if (!t || t.i >= i || !src || !src.shape) {
          if (mode !== 'new' && tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Aufdicken: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        if (!(dist > 1e-6 && isFinite(dist))) {
          if (mode !== 'new') consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'op', message: 'Aufdicken: Die Dicke muss größer als 0 sein.' });
          continue;
        }
        if (!p.face || !Array.isArray(p.face.c)) {
          if (mode !== 'new') consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'edges', message: 'Aufdicken: Es ist keine Fläche gewählt.' });
          continue;
        }
        if (mode === 'new') {
          const rel = matMul(matInvRigid(it.m), src.m);
          const kBase = keyOf([src.key, 'thickenNew', p.face, Math.round(dist * 1e6) / 1e6, dir, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
          const ceB = cacheEntry(kBase);
          let shape = ceB ? ceB.shape : null, shapeTopo = ceB ? ceB.topo : null, key = kBase;
          if (!shape) {
            const fArr = []; try { for (const fx of src.shape.faces) fArr.push(fx); } catch (_) {}
            const b = bboxOf(src.shape); const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
            const f = resolveFaceRef({ ...p.face, tol }, fArr, src.topo, src.it.id, true)[0] || matchFace(src.shape, p.face);
            if (!f) { for (const fx of fArr) safeDelete(fx); errors.push({ itemId: it.id, code: 'edges', message: 'Aufdicken: Die gewählte Fläche gibt es nicht mehr.' }); continue; }
            try {
              const plate = thickenFaceShape(f, dist, dir, 'new');
              if (isIdentity(rel)) shape = plate;
              else { shape = applyMatrix(plate, rel); safeDelete(plate); }
              shapeTopo = ensureTopoComplete(shape, createTopoMap(), it.id);
              cachePut(kBase, shape, null, null, null, shapeTopo);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              for (const fx of fArr) safeDelete(fx);
              continue;
            }
            for (const fx of fArr) safeDelete(fx);
          }
          if (it.finishes && it.finishes.length) {
            const kFin = keyOf([key, 'fin', it.finishes]);
            const ceF = cacheEntry(kFin);
            if (ceF && ceF.shape) { shape = ceF.shape; shapeTopo = ceF.topo; key = kFin; }
            else {
              const e0 = errors.length;
              const sf = applyFinishes(shape, it.finishes, errors, it.id, shapeTopo, true);
              if (sf.shape && sf.shape !== shape) {
                cachePut(kFin, sf.shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })), null, null, sf.topo);
                shape = sf.shape; shapeTopo = sf.topo; key = kFin;
              }
            }
          }
          const wb = bboxTransform(bboxCached(key, shape), it.m);
          const entry = { shape, topo: shapeTopo, key, wb, m: it.m, it };
          live.set(it.id, entry);
          bodies.set(it.id, entry);
        } else {
          consumed.set(it.id, tid);
          const prevShape = src.shape, prevKey = src.key;
          const k = keyOf([src.key, 'thicken', mode, p.face, Math.round(dist * 1e6) / 1e6, dir]);
          const kPlate = keyOf([prevKey, 'thickenPlate', p.face, r6(dist), dir, mode]);
          const ce = cacheEntry(k);
          let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
          let plate = anyMirror ? cacheGet(kPlate) : null;
          if (!next) {
            const fArr = []; try { for (const fx of src.shape.faces) fArr.push(fx); } catch (_) {}
            const b = bboxOf(src.shape); const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
            const f = resolveFaceRef({ ...p.face, tol }, fArr, src.topo, src.it.id, true)[0] || matchFace(src.shape, p.face);
            if (!f) { for (const fx of fArr) safeDelete(fx); errors.push({ itemId: it.id, code: 'edges', message: 'Aufdicken: Die gewählte Fläche gibt es nicht mehr.' }); continue; }
            try {
              plate = thickenFaceShape(f, dist, dir, mode);
              const plateTopo = ensureTopoComplete(plate, createTopoMap(), it.id);
              const br = boolWithTopo(mode === 'cut' ? 'cut' : 'fuse', src.shape, src.topo, src.it.id, plate, plateTopo, it.id, 'Th:' + it.id);
              next = br.shape; nextTopo = br.topo;
              freeTopoMap(plateTopo);
              if (anyMirror) cachePut(kPlate, plate);
              else safeDelete(plate);
              cachePut(k, next, null, null, null, nextTopo);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              for (const fx of fArr) safeDelete(fx);
              continue;
            }
            for (const fx of fArr) safeDelete(fx);
          } else if (anyMirror && !plate) {
            const f = matchFace(prevShape, p.face);
            if (f) {
              try { plate = thickenFaceShape(f, dist, dir, mode); cachePut(kPlate, plate); } catch (_) { plate = null; }
            }
          }
          if (anyMirror && plate) featureOps.set(it.id, { targetId: tid, opType: mode, tools: [{ shape: plate, m: src.m, key: kPlate }] });
          src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
          bodies.set(tid, src);
        }
        continue;
      }
      if (it.kind === 'rib') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Rippe: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const prevShape = src.shape, prevKey = src.key;
        const rel = matMul(matInvRigid(src.m), it.m);
        const k = keyOf([src.key, 'rib', p, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
        const ceR = cacheEntry(k);
        let next = ceR ? ceR.shape : null, nextTopo = ceR ? ceR.topo : null;
        if (!next) {
          try { next = buildRibOn(src.shape, rel, p); nextTopo = ensureTopoComplete(next, createTopoMap(), tid); cachePut(k, next, null, null, null, nextTopo); }
          catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
        }
        if (anyMirror) {
          const kDelta = keyOf([k, 'ribDelta', prevKey]);
          let delta = cacheGet(kDelta);
          if (!delta) {
            try { delta = next.cut(prevShape); cachePut(kDelta, delta); } catch (_) { delta = null; }
          }
          if (delta) featureOps.set(it.id, { targetId: tid, opType: 'join', tools: [{ shape: delta, m: src.m, key: kDelta }] });
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        continue;
      }
      if (it.kind === 'wrap') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Wickeln: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const mode = p.mode === 'deboss' || p.mode === 'line' ? p.mode : 'emboss';
        const k = keyOf([src.key, 'wrap', p]);
        const kTool = keyOf([src.key, 'wrapTool', p]);
        const kWires = keyOf([src.key, 'wrapWires', p]);
        const ceW = cacheEntry(k);
        let next = ceW ? ceW.shape : null, nextTopo = ceW ? ceW.topo : null;
        let tool = mode !== 'line' && anyMirror ? cacheGet(kTool) : null;
        let wires = mode === 'line' ? cacheGet(kWires) : null;
        let wrapRad = ceW && ceW.resolved ? ceW.resolved.radius : null;
        if (!next || (mode === 'line' && !wires) || (mode !== 'line' && anyMirror && !tool)) {
          try {
            const built = buildWrapOn(src.shape, p);
            wrapRad = built.radius || null;
            if (!next) { next = built.shape; nextTopo = ensureTopoComplete(next, createTopoMap(), tid); cachePut(k, next, null, wrapRad ? { radius: wrapRad } : null, null, nextTopo); }
            else safeDelete(built.shape);
            if (mode === 'line') {
              if (!wires && built.wires) { wires = built.wires; cachePut(kWires, wires); }
            } else if (anyMirror) {
              if (!tool && built.toolShape) { tool = built.toolShape; cachePut(kTool, tool); }
              else safeDelete(built.toolShape);
            } else {
              safeDelete(built.toolShape);
            }
          } catch (err) {
            errors.push({ itemId: it.id, code: err && err.code === 'ref' ? 'ref' : 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (resolved && wrapRad) resolved[it.id] = { radius: wrapRad };
        if (mode === 'line' && wires) wrapWires.set(it.id, { wires, m: src.m, key: kWires });
        if (mode !== 'line' && anyMirror && tool) {
          featureOps.set(it.id, { targetId: tid, opType: mode === 'deboss' ? 'cut' : 'join', tools: [{ shape: tool, m: src.m, key: kTool }] });
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        continue;
      }
      if (it.kind === 'emboss') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Prägen: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const prevShape = src.shape, prevKey = src.key;
        const rel = matMul(matInvRigid(src.m), it.m);
        const k = keyOf([src.key, 'emboss', p, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
        const ceE = cacheEntry(k);
        let next = ceE ? ceE.shape : null, nextTopo = ceE ? ceE.topo : null;
        if (!next) {
          try { next = buildEmbossOn(src.shape, rel, p); nextTopo = ensureTopoComplete(next, createTopoMap(), tid); cachePut(k, next, null, null, null, nextTopo); }
          catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
        }
        if (anyMirror) {
          const isDeb = p.mode === 'deboss';
          const kDelta = keyOf([k, 'embossDelta', prevKey, isDeb]);
          let delta = cacheGet(kDelta);
          if (!delta) {
            try { delta = isDeb ? prevShape.cut(next) : next.cut(prevShape); cachePut(kDelta, delta); } catch (_) { delta = null; }
          }
          if (delta) featureOps.set(it.id, { targetId: tid, opType: isDeb ? 'cut' : 'join', tools: [{ shape: delta, m: src.m, key: kDelta }] });
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        continue;
      }
      if (it.kind === 'sweep' && it.p && it.p.wrapId) {
        const ww = wrapWires.get(it.p.wrapId);
        if (!ww || !ww.wires || !ww.wires.length) {
          errors.push({ itemId: it.id, code: 'op', message: 'Entlang Pfad: Die gewickelte Linie fehlt oder ist nicht im Modus „Linie“.' });
          continue;
        }
        const rel = matMul(matInvRigid(it.m), ww.m);
        const kBase = keyOf([ww.key, 'wrapSweep', it.p, rel.map(r6)]);
        const ceB = cacheEntry(kBase);
        let shape = ceB ? ceB.shape : null, shapeTopo = ceB ? ceB.topo : null, key = kBase;
        if (!shape) {
          try {
            const sw = buildSweepAlongWires(ww.wires, it.p);
            if (isIdentity(rel)) shape = sw;
            else { shape = applyMatrix(sw, rel); safeDelete(sw); }
            shapeTopo = ensureTopoComplete(shape, createTopoMap(), it.id);
            cachePut(kBase, shape, null, null, null, shapeTopo);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (it.finishes && it.finishes.length) {
          const kFin = keyOf([key, 'fin', it.finishes]);
          const ceF = cacheEntry(kFin);
          if (ceF && ceF.shape) { shape = ceF.shape; shapeTopo = ceF.topo; key = kFin; }
          else {
            const e0 = errors.length;
            const sf = applyFinishes(shape, it.finishes, errors, it.id, shapeTopo, true);
            if (sf.shape && sf.shape !== shape) {
              cachePut(kFin, sf.shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })), null, null, sf.topo);
              shape = sf.shape; shapeTopo = sf.topo; key = kFin;
            }
          }
        }
        const wb = bboxTransform(bboxCached(key, shape), it.m);
        const entry = { shape, topo: shapeTopo, key, wb, m: it.m, it };
        live.set(it.id, entry);
        bodies.set(it.id, entry);
      }
      if (it.kind === 'mirrorStep') {
        const p = it.p || {};
        if (p.missingPlane) { errors.push({ itemId: it.id, code: 'op', message: 'Schritt spiegeln: ' + p.missingPlane + '.' }); continue; }
        const fids = Array.isArray(p.features) ? p.features : [];
        const mo = Array.isArray(p.mo) && p.mo.length >= 3 ? p.mo.map(Number) : null;
        const mnRaw = Array.isArray(p.mn) && p.mn.length >= 3 ? p.mn.map(Number) : null;
        const mnLen = mnRaw ? Math.hypot(mnRaw[0], mnRaw[1], mnRaw[2]) : 0;
        if (!fids.length || !mo || !(mnLen > 1e-6) || !mo.every(isFinite) || !mnRaw.every(isFinite)) {
          errors.push({ itemId: it.id, code: 'op', message: 'Schritt spiegeln: Wähle mindestens einen Schritt und eine gültige Spiegelebene.' });
          continue;
        }
        const mn = [mnRaw[0] / mnLen, mnRaw[1] / mnLen, mnRaw[2] / mnLen];
        const mirrorWorld = (toolShape, toolM, toolKey) => {
          const kMir = keyOf([toolKey, 'mirWorld', toolM.map(r6), mo.map(r6), mn.map(r6)]);
          let wMir = cacheGet(kMir);
          if (!wMir) {
            const wTool = applyMatrix(toolShape, toolM);
            wMir = wTool.mirror(mn, mo);
            cachePut(kMir, wMir);
          }
          return { shape: wMir, key: kMir };
        };
        let firstTid = null, firstOp = null;
        const produced = [];
        for (const fid of fids) {
          const srcRec = byId.get(fid);
          if (!srcRec || srcRec.i >= i) {
            if (hiddenIds && hiddenIds.has(fid)) continue;
            errors.push({ itemId: it.id, code: 'op', message: 'Schritt spiegeln: Der gewählte Formschritt fehlt oder kommt erst später im Verlauf.' });
            continue;
          }
          const fo = featureOps.get(fid);
          if (fo) {
            let tid = fo.targetId;
            while (tid && consumed.has(tid)) tid = consumed.get(tid);
            const base = tid ? live.get(tid) : null;
            if (!base || !base.shape || base.it.role === 'hole') {
              if (tid && hiddenIds && hiddenIds.has(tid)) { if (!firstTid) firstTid = tid; continue; }
              errors.push({ itemId: it.id, code: 'op', message: 'Schritt spiegeln: Der Zielkörper fehlt oder ist ausgeblendet.' });
              continue;
            }
            if (!firstTid) { firstTid = tid; firstOp = fo.opType; }
            for (const te of fo.tools) {
              try {
                const mw = mirrorWorld(te.shape, te.m, te.key);
                const kOp = keyOf([base.key, 'mirFeat', fo.opType, mw.key, base.m.map(r6)]);
                const ce = cacheEntry(kOp);
                let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
                if (!next) {
                  const idB = isIdentity(base.m);
                  const locMir = idB ? mw.shape : applyMatrix(mw.shape, matInvRigid(base.m));
                  const opKind = fo.opType === 'join' ? 'fuse' : fo.opType === 'cut' ? 'cut' : 'common';
                  const br = boolWithTopo(opKind, base.shape, base.topo, base.it.id, locMir, null, it.id, 'MS:' + it.id);
                  next = br.shape; nextTopo = br.topo;
                  if (!idB) safeDelete(locMir);
                  cachePut(kOp, next, null, null, null, nextTopo);
                }
                base.shape = next; base.topo = nextTopo; base.key = kOp; base.wb = bboxTransform(bboxCached(kOp, next), base.m);
                bodies.set(tid, base);
                produced.push({ shape: mw.shape, m: ID_MAT, key: mw.key });
              } catch (err) {
                errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              }
            }
            continue;
          }
          const srcLive = live.get(fid);
          if (srcLive && srcLive.shape && srcLive.it.role === 'hole') {
            try {
              const mw = mirrorWorld(srcLive.shape, srcLive.m, srcLive.key);
              const mwBox = bboxCached(mw.key, mw.shape);
              for (let k = 0; k < i; k++) {
                const eid = evald[k].it.id;
                if (consumed.has(eid)) continue;
                const s = live.get(eid);
                if (!s || !s.shape || s.it.role === 'hole' || !bboxHit(mwBox, s.wb)) continue;
                const kCut = keyOf([s.key, 'mirHoleCut', mw.key, s.m.map(r6)]);
                const ce = cacheEntry(kCut);
                let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
                if (!next) {
                  const idS = isIdentity(s.m);
                  const locMir = idS ? mw.shape : applyMatrix(mw.shape, matInvRigid(s.m));
                  const br = boolWithTopo('cut', s.shape, s.topo, s.it.id, locMir, null, it.id, 'MH:' + it.id);
                  next = br.shape; nextTopo = br.topo;
                  if (!idS) safeDelete(locMir);
                  cachePut(kCut, next, null, null, null, nextTopo);
                }
                s.shape = next; s.topo = nextTopo; s.key = kCut; s.wb = bboxTransform(bboxCached(kCut, next), s.m);
                bodies.set(eid, s);
                if (!firstTid) { firstTid = eid; firstOp = 'cut'; }
              }
              if (!firstTid) {
                for (let k = 0; k < i; k++) {
                  const eid = evald[k].it.id;
                  if (consumed.has(eid)) continue;
                  const s = live.get(eid);
                  if (s && s.shape && s.it.role !== 'hole' && bboxHit(srcLive.wb, s.wb)) { firstTid = eid; firstOp = 'cut'; break; }
                }
              }
              produced.push({ shape: mw.shape, m: ID_MAT, key: mw.key });
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            }
            continue;
          }
          errors.push({ itemId: it.id, code: 'op', message: 'Schritt spiegeln: Wähle einen Formschritt (z. B. eine Tasche, Erhöhung, Rippe oder Aufdicken) – für ganze Körper nutze „Gespiegelte Kopie“.' });
        }
        if (firstTid) consumed.set(it.id, firstTid);
        if (produced.length && firstTid) featureOps.set(it.id, { targetId: firstTid, opType: firstOp || 'cut', tools: produced });
        continue;
      }
      if (it.kind === 'group' && it.p && it.p.op === 'pattern' && (it.children || []).some((c) => c.kind === 'rib')) {
        const rib = it.children.find((c) => c.kind === 'rib');
        const rp = (rib && rib.p) || {};
        let tid = (it.op && it.op.target) || rp.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Rippen-Muster: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const mats = patternStepMatrices(it.p);
        const k = keyOf([src.key, 'ribPat', it.p, rp, it.m.map((v) => Math.round(v * 1e6) / 1e6), rib.m.map((v) => Math.round(v * 1e6) / 1e6)]);
        const ce = cacheEntry(k);
        let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
        if (!next) {
          let cur = src.shape;
          try {
            for (const M of mats) {
              const rel = matMul(matInvRigid(src.m), matMul(it.m, matMul(M, rib.m)));
              const nxt = buildRibOn(cur, rel, rp);
              if (cur !== src.shape) safeDelete(cur);
              cur = nxt;
            }
            next = cur === src.shape ? src.shape.clone() : cur;
            nextTopo = ensureTopoComplete(next, createTopoMap(), tid);
            cachePut(k, next, null, null, null, nextTopo);
          } catch (err) {
            if (cur && cur !== src.shape) safeDelete(cur);
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
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
      const ce = cacheEntry(k);
      if (ce && ce.shape) {
        featureOps.set(it.id, { targetId: tid, opType: op.type, tools: [{ shape: o.shape, m: o.m, key: o.key }] });
        base.shape = ce.shape; base.topo = ce.topo || null; base.key = k; base.wb = bboxTransform(bboxCached(k, ce.shape), base.m);
        bodies.set(tid, base); continue;
      }
      try {
        const tr = applyMatrixWithTopo(o.shape, rel, o.topo, o.it.id);
        const opKind = op.type === 'join' ? 'fuse' : op.type === 'cut' ? 'cut' : 'common';
        const br = boolWithTopo(opKind, base.shape, base.topo, base.it.id, tr.shape, tr.topo, o.it.id, 'Op:' + it.id);
        safeDelete(tr.shape); freeTopoMap(tr.topo);
        const next = br.shape, nextTopo = br.topo;
        cachePut(k, next, null, null, null, nextTopo);
        featureOps.set(it.id, { targetId: tid, opType: op.type, tools: [{ shape: o.shape, m: o.m, key: o.key }] });
        base.shape = next; base.topo = nextTopo; base.key = k; base.wb = bboxTransform(bboxCached(k, next), base.m);
        bodies.set(tid, base);
      } catch (err) {
        errors.push({ itemId: it.id, code: 'op', message: `${NAMES[op.type]} mit „${base.it.name || 'Körper'}“ hat nicht geklappt – berühren sich die Teile?` });
      }
    }
    return { bodies, consumed };
  }
  function collectIds(it, skipDynamic = false) {
    const ids = new Set();
    const walk = (x) => {
      if (!x || x.hidden || (skipDynamic && hasDynamicExtent(x) && x.kind !== 'group')) return;
      ids.add(x.id);
      if (x.children) for (const c of x.children) walk(c);
    };
    walk(it);
    return ids;
  }
  function stripDynamic(it) {
    if (!it || it.kind !== 'group') return it;
    return { ...it, children: (it.children || []).filter((c) => !c.hidden && !hasDynamicExtent(c)).map(stripDynamic) };
  }
  function evalSceneCore(scene, errors, times = null) {
    const hiddenIds = new Set((scene.items || []).filter((it) => it.hidden).map((it) => it.id));
    const tops = (scene.items || []).filter((it) => !it.hidden);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const addT = (id, t0) => { if (!times) return; const d = now() - t0; if (d > 0.5) times[id] = (times[id] || 0) + d; };
    const anyDyn = tops.some(hasDynamicExtent);
    if (!anyDyn) {
      try {
        const resolved = {};
        const evald = tops.map((it) => {
          const t0 = now();
          const r = evalItem(it, errors, null, { resolved });
          let wb = null;
          if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
          addT(it.id, t0);
          return { it, ...r, wb };
        });
        const tOps = now();
        const { bodies, consumed } = resolveOps(evald, errors, hiddenIds, resolved);
        if (bodies.size && times) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
        for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.topo = b.topo || null; e.key = b.key; e.wb = b.wb; } }
        return { evald, consumed, resolved, opsModified: new Set(bodies.keys()) };
      } finally {
        clearStepReaderCache();
      }
    }

    // Zwei-Pass-Auswertung: Pass 1 liefert alle festen Körper samt versetzten/verrechneten Zielen,
    // Pass 2 zieht dynamische Schritte („bis zur nächsten / gewählten Fläche“) exakt bis zu ihnen.
    const pass1Evald = tops.map((it) => {
      if (!hasDynamicExtent(it)) {
        const t0 = now();
        const r = evalItem(it, errors);
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        addT(it.id, t0);
        return { it, ...r, wb, dyn: false };
      }
      if (it.kind === 'group') {
        const baseIt = stripDynamic(it);
        const r = baseIt.children.length ? evalItem(baseIt, []) : { shape: null, key: defKey(baseIt) };
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        return { it, ...r, wb, dyn: true, dynGroup: true };
      }
      return { it, shape: null, key: defKey(it), wb: null, dyn: true };
    });

    const pass1Snap = pass1Evald.map((e) => ({ ...e }));
    const { bodies: p1Bodies, consumed: p1Consumed } = resolveOps(pass1Snap, [], hiddenIds);
    for (const e of pass1Snap) { const b = p1Bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; } }

    const pool = [];
    const poolKeyOf = () => keyOf(pool.map((x) => [x.id, x.key, x.m.map((v) => Math.round(v * 1e6) / 1e6)]));
    for (const e of pass1Snap) {
      if (p1Consumed.has(e.it.id) || !e.shape || e.it.role === 'hole' || e.it.id === '__preview') continue;
      if (e.dyn && !e.dynGroup) continue;
      pool.push({
        id: e.it.id,
        ids: collectIds(e.it, true),
        localShape: e.shape,
        m: e.it.m,
        worldShape: applyMatrix(e.shape, e.it.m),
        wb: e.wb,
        key: e.key,
      });
    }
    const ctx = { pool, poolKey: poolKeyOf(), consumed: p1Consumed, resolved: {} };
    const evald = pass1Evald.map((e) => ({ it: e.it, shape: e.shape, key: e.key, wb: e.wb, baseBox: e.baseBox }));
    try {
      for (let i = 0; i < tops.length; i++) {
        if (!pass1Evald[i].dyn) continue;
        const it = tops[i], t0 = now();
        const r = evalItem(it, errors, null, ctx);
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        addT(it.id, t0);
        evald[i] = { it, ...r, wb };
        if (r.shape && it.role !== 'hole' && it.id !== '__preview') {
          const idxOld = pool.findIndex((x) => x.id === it.id);
          if (idxOld >= 0) { safeDelete(pool[idxOld].worldShape); pool.splice(idxOld, 1); }
          pool.push({
            id: it.id,
            ids: collectIds(it, false),
            localShape: r.shape,
            m: it.m,
            worldShape: applyMatrix(r.shape, it.m),
            wb,
            key: r.key,
          });
          ctx.poolKey = poolKeyOf();
        }
      }
      const tOps = now();
      const { bodies, consumed } = resolveOps(evald, errors, hiddenIds, ctx.resolved);
      if (bodies.size && times) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
      for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.topo = b.topo || null; e.key = b.key; e.wb = b.wb; } }
      return { evald, consumed, resolved: ctx.resolved, opsModified: new Set(bodies.keys()) };
    } finally {
      for (const x of pool) safeDelete(x.worldShape);
      clearStepReaderCache();
    }
  }
  function collectGroupBodyHints(it, parentM = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], out = []) {
    for (const c of it.children || []) {
      if (!c || c.hidden || c.role === 'hole' || c.kind === 'mirrorStep') continue;
      const cm = matMul(parentM, c.m);
      if (c.kind === 'group' && !(c.p && c.p.op)) {
        collectGroupBodyHints(c, cm, out);
        continue;
      }
      const sh = cacheGet(defKey(c));
      if (!sh) continue;
      const col = c.color || it.color || '#2f9e91';
      const nm = c.name || 'Teil';
      const parts = sortedSolids(sh);
      if (parts.length > 1) {
        const meta = matchBodiesLocal(c.bodies, parts);
        for (let bi = 0; bi < parts.length; bi++) {
          const mb = meta[bi];
          const wb = bboxTransform(parts[bi].bbox, cm);
          out.push({ c: [(wb[0] + wb[3]) / 2, (wb[1] + wb[4]) / 2, (wb[2] + wb[5]) / 2], name: (mb && mb.name) || nm, color: (mb && mb.color) || col });
          safeDelete(parts[bi].shape);
        }
      } else {
        for (const p of parts) safeDelete(p.shape);
        const wb = bboxTransform(bboxCached(defKey(c), sh), cm);
        out.push({ c: [(wb[0] + wb[3]) / 2, (wb[1] + wb[4]) / 2, (wb[2] + wb[5]) / 2], name: nm, color: col });
      }
    }
    return out;
  }
  function applyGroupBodyHints(it, bodies) {
    if (!it || it.kind !== 'group' || (it.p && it.p.op) || (it.finishes && it.finishes.length) || !Array.isArray(bodies) || bodies.length < 2) return bodies;
    const hints = collectGroupBodyHints(it);
    if (hints.length < 2) return bodies;
    const hasDiffColors = new Set(hints.map((h) => String(h.color || '').toLowerCase())).size > 1;
    const isAsm = !!(it.p && it.p.assembly);
    if (!isAsm && !hasDiffColors) return bodies;
    const matched = matchBodiesLocal(hints, bodies);
    return bodies.map((b, bi) => (matched[bi] ? { ...b, name: matched[bi].name, color: matched[bi].color } : b));
  }
  function evaluate(scene, known = {}) {
    gen++;
    ingestBlobs(scene);
    if (scene.quality) setQuality(scene.quality);
    const errors = [];
    // Rechenzeit je Schritt (BE-26): nur, was wirklich neu gerechnet wurde, zählt
    const times = {}, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const addT = (id, t0) => { const d = now() - t0; if (d > 0.5) times[id] = (times[id] || 0) + d; };
    const { evald, consumed, resolved } = evalSceneCore(scene, errors, times);
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const nodes = [];
    for (const e of evald) {
      const it = e.it;
      if (consumed.has(it.id)) { nodes.push({ id: it.id, key: null, empty: true, merged: consumed.get(it.id), ...(e.baseBox ? { baseBox: e.baseBox } : {}), ...(e.wb ? { ownBox: e.wb } : {}) }); continue; }
      if (!e.shape) { nodes.push({ id: it.id, key: null, empty: true }); continue; }
      let resultKey = e.key, result = e.shape, resultTopo = e.topo || null;
      if (it.role !== 'hole') {
        const cutters = holes.filter((h) => h.it.id !== it.id && bboxHit(h.wb, e.wb));
        if (cutters.length) {
          const inv = matInvRigid(it.m);
          const rel = cutters.map((h) => matMul(inv, h.it.m));
          resultKey = keyOf([e.key, cutters.map((h, i) => [h.key, rel[i].map((v) => Math.round(v * 1e6) / 1e6)])]);
          const cec = cacheEntry(resultKey);
          if (cec && cec.shape) { result = cec.shape; resultTopo = cec.topo || null; }
          else {
            const tc = now();
            try {
              const moved = cutters.map((h, i) => {
                const tr = applyMatrixWithTopo(h.shape, rel[i], h.topo || null, h.it.id);
                return { shape: tr.shape, topo: tr.topo, selfId: h.it.id };
              });
              const tool = fuseAllWithTopo(moved, true, 'HC');
              const br = boolWithTopo('cut', e.shape, e.topo || null, it.id, tool.shape, tool.topo, null, 'HCut');
              safeDelete(tool.shape); freeTopoMap(tool.topo);
              result = br.shape; resultTopo = br.topo;
              cachePut(resultKey, result, null, null, null, resultTopo);
              addT(it.id, tc);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'cut', message: 'Ein Loch konnte nicht abgezogen werden.' });
              result = e.shape; resultTopo = e.topo || null; resultKey = e.key;
            }
          }
        }
      }
      const mk = it.id + '|' + resultKey + '|' + Q.level;
      if (known[it.id] === resultKey) {
        const cachedPayload = meshCache.get(mk);
        const sameNode = { id: it.id, key: resultKey, same: true, ...(e.baseBox ? { baseBox: e.baseBox } : {}) };
        if (it.kind === 'group' && cachedPayload && cachedPayload.bodies && cachedPayload.bodies.length >= 2) {
          const hinted = applyGroupBodyHints(it, cachedPayload.bodies);
          if (hinted !== cachedPayload.bodies) sameNode.bodies = hinted;
        }
        nodes.push(sameNode);
        continue;
      }
      let payload = meshCache.get(mk);
      if (!payload) {
        const tm = now();
        try { payload = meshPayload(result, null, resultTopo, it.id); meshCache.set(mk, payload); addT(it.id, tm); }
        catch (err) { errors.push({ itemId: it.id, code: 'mesh', message: 'Die Form konnte nicht angezeigt werden.' }); nodes.push({ id: it.id, key: null, empty: true }); continue; }
      }
      const out = clonePayload(payload);
      if (out.bodies && out.bodies.length >= 2) out.bodies = applyGroupBodyHints(it, out.bodies);
      nodes.push({ id: it.id, key: resultKey, ...(e.baseBox ? { baseBox: e.baseBox } : {}), ...out });
    }
    gc();
    return { nodes, errors, times, resolved };
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
      bodies: p.bodies || null, faceBody: p.faceBody || null, edgeBody: p.edgeBody || null,
    };
  }

  // Feinere Anzeige für ein schon berechnetes Teil (beim Hineinzoomen)
  function remesh(key, tol) {
    const e = cacheEntry(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher.');
    const t = Math.max(0.0002, tol);
    const mk = key + '|t' + t.toPrecision(2);
    let payload = meshCache.get(mk);
    if (!payload) { payload = meshPayload(e.shape, t, e.topo || null, null); meshCache.set(mk, payload); }
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
    const { evald, consumed } = evalSceneCore(scene, errors || []);
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const out = [];
    for (const e of evald) {
      if (!e.shape || e.it.role === 'hole' || consumed.has(e.it.id)) continue;
      let world = applyMatrix(e.shape, e.it.m);
      const cutters = holes.filter((h) => bboxHit(h.wb, e.wb));
      if (cutters.length) {
        try { const tool = fuseAll(cutters.map((h) => applyMatrix(h.shape, h.it.m)), true); const cut = world.cut(tool); safeDelete(tool); safeDelete(world); world = cut; } catch (_) {}
      }
      out.push({ id: e.it.id, name: e.it.name, color: e.it.color, m: e.it.m, bodies: e.it.bodies || null, shape: world });
    }
    return out;
  }

  // Loch-Ausgleich (DR-02): vergrößert runde innere Bohrungen beim Netz-Export (STL/3MF), das Modell bleibt gleich
  function applyHoleCompensation(shape, holeComp) {
    const hc = Number(holeComp);
    if (!(hc > 1e-4) || !shape) return { shape, count: 0 };
    const dr = Math.min(2, hc) / 2;
    const planes = [];
    const rawCyls = [];
    for (const f of shape.faces) {
      if (f.geomType === 'PLANE') {
        try {
          const n = f.normalAt(), c = f.center, bb = bboxOf(f);
          planes.push({ n: [n.x, n.y, n.z], c: [c.x, c.y, c.z], bb });
        } catch (_) {}
        continue;
      }
      if (f.geomType !== 'CYLINDRE') continue;
      let ad = null;
      try {
        ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
        const cy = ad.Cylinder(), ax = cy.Axis(), l = ax.Location(), dd = ax.Direction();
        const oRaw = [l.X(), l.Y(), l.Z()];
        let d = norm([dd.X(), dd.Y(), dd.Z()]);
        const r = cy.Radius();
        ad.delete(); ad = null;
        if (!(r >= 0.25 && r <= 150)) continue;
        // kanonische Richtung, damit geteilte koaxiale Teilflächen zusammengefasst werden können
        if (Math.abs(d[2]) > 1e-4 ? d[2] < 0 : Math.abs(d[1]) > 1e-4 ? d[1] < 0 : d[0] < 0) d = mul(d, -1);
        const o0 = sub(oRaw, mul(d, dot(oRaw, d)));
        let t0 = Infinity, t1 = -Infinity, peEdge = null;
        for (const ed of f.edges) {
          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const p = vec(ed.pointAt(t));
            const q = dot(p, d);
            if (q < t0) t0 = q;
            if (q > t1) t1 = q;
            if (!peEdge) peEdge = p;
          }
        }
        if (!(t1 - t0 > 0.05)) continue;
        let pe = null;
        try { const mp = f.pointOnSurface(0.5, 0.5); pe = [mp.x, mp.y, mp.z]; } catch (_) { pe = peEdge; }
        if (!pe) continue;
        const foot = add(o0, mul(d, dot(pe, d))), rad = sub(pe, foot);
        const n = f.normalAt(pe);
        if (dot([n.x, n.y, n.z], rad) >= -1e-6) continue; // nur nach innen gewölbte Bohrungen, keine Zapfen
        let uSpan = 0;
        try { const uv = f.UVBounds; uSpan = Math.min(2 * Math.PI, Math.abs(uv.uMax - uv.uMin)); } catch (_) { continue; }
        if (!(uSpan > 0.05)) continue;
        rawCyls.push({ o0, d, r, t0, t1, uSpan });
      } catch (_) {
        if (ad) try { ad.delete(); } catch (_) {}
      }
    }
    if (!rawCyls.length) return { shape, count: 0 };
    // koaxiale Teilflächen (z. B. gespiegelte 2×180°-Hälften) zu ganzen Löchern zusammenführen
    const groups = [];
    for (const c of rawCyls) {
      let grp = null;
      for (const g of groups) {
        if (Math.abs(g.r - c.r) < 1e-3 && Math.abs(dot(g.d, c.d)) > 0.9999 && len(sub(g.o0, c.o0)) < 1e-2) {
          if (Math.min(g.t1, c.t1) >= Math.max(g.t0, c.t0) - 0.05) { grp = g; break; }
        }
      }
      if (grp) {
        grp.t0 = Math.min(grp.t0, c.t0);
        grp.t1 = Math.max(grp.t1, c.t1);
        grp.uSpan = Math.min(2 * Math.PI, grp.uSpan + c.uSpan);
      } else {
        groups.push({ o0: c.o0, d: c.d, r: c.r, t0: c.t0, t1: c.t1, uSpan: c.uSpan });
      }
    }
    const holes = groups.filter((g) => g.uSpan >= Math.PI * 1.9 && g.t1 - g.t0 >= 0.05);
    if (!holes.length) return { shape, count: 0 };
    const endClosed = (o0, d, r, tEnd, dirEnd) => {
      const pEnd = add(o0, mul(d, tEnd));
      const margin = r + 0.2;
      for (const pf of planes) {
        if (dot(pf.n, dirEnd) > -0.95) continue;
        if (Math.abs(dot(sub(pEnd, pf.c), pf.n)) > 0.02) continue;
        if (pEnd[0] >= pf.bb.minX - margin && pEnd[0] <= pf.bb.maxX + margin
          && pEnd[1] >= pf.bb.minY - margin && pEnd[1] <= pf.bb.maxY + margin
          && pEnd[2] >= pf.bb.minZ - margin && pEnd[2] <= pf.bb.maxZ + margin) return true;
      }
      return false;
    };
    let cur = shape, count = 0;
    for (const g of holes) {
      const ext0 = endClosed(g.o0, g.d, g.r, g.t0, mul(g.d, -1)) ? 0 : 0.05;
      const ext1 = endClosed(g.o0, g.d, g.r, g.t1, g.d) ? 0 : 0.05;
      const tStart = g.t0 - ext0;
      const span = (g.t1 + ext1) - tStart;
      if (!(span > 0.05)) continue;
      const base = add(g.o0, mul(g.d, tStart));
      let cyl = null, cut = null;
      try {
        cyl = R.makeCylinder(g.r + dr, span, base, g.d);
        cut = cur.cut(cyl);
        if (cut && cut.faces && cut.faces.length > 0 && R.measureVolume(cut) > 1e-4) {
          if (cur !== shape) safeDelete(cur);
          cur = cut;
          cut = null;
          count++;
        }
      } catch (_) {} finally {
        safeDelete(cyl);
        safeDelete(cut);
      }
    }
    return { shape: cur, count };
  }

  // q: Feinheit beim Export – 1 = normal, kleiner = feiner (0.4 = fein, 0.15 = sehr fein), größer = gröber
  function exportMeshes(scene, fine = true, q = 1, originMat = null, holeComp = 0) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const objs = [];
    const f = Math.max(0.05, Math.min(4, +q || 1));
    const hc = Number(holeComp) > 0 ? Math.min(2, Number(holeComp)) : 0;
    let compensatedHoles = 0;
    const useTr = Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat);
    const meshOne = (shape, metaObj) => {
      let workShape = shape;
      if (hc > 0) {
        const comp = applyHoleCompensation(shape, hc);
        workShape = comp.shape;
        compensatedHoles += comp.count;
      }
      try {
        const b = bboxOf(workShape);
        const tol = (fine ? Math.min(0.05, Math.max(0.005, meshTol(b) * 0.35)) : meshTol(b)) * f;
        const m = workShape.mesh({ tolerance: tol, angularTolerance: (fine ? 0.1 : 0.2) * Math.min(2, Math.max(0.25, f)) });
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
        objs.push({ ...metaObj, vertices: verts, normals: norms, triangles: new Uint32Array(m.triangles) });
      } finally {
        if (workShape !== shape) safeDelete(workShape);
      }
    };
    for (const s of solids) {
      const parts = sortedSolids(s.shape, matInvRigid(s.m));
      if (parts.length <= 1) {
        for (const p of parts) safeDelete(p.shape);
        meshOne(s.shape, { id: s.id, name: s.name, color: s.color });
      } else {
        const meta = matchBodiesLocal(s.bodies, parts);
        for (let bi = 0; bi < parts.length; bi++) {
          const mb = meta[bi];
          if (mb && mb.hidden) continue;
          const bName = (mb && mb.name) ? mb.name : ((s.name || 'Körper') + ' – Körper ' + (bi + 1));
          const bColor = (mb && mb.color) ? mb.color : s.color;
          meshOne(parts[bi].shape, { id: s.id, bodyIdx: bi, name: bName, color: bColor, bodyColor: (mb && mb.color) || null });
        }
        for (const p of parts) safeDelete(p.shape);
      }
      s.shape.delete();
    }
    return { objects: objs, errors, compensatedHoles };
  }
  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function hexToLinearRGBA(hex, alpha = 1) {
    let s = String(hex || '#2f9e91').trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.length === 3) s = s.replace(/([0-9a-f])/gi, '$1$1');
    let r = 0x2f, g = 0x9e, b = 0x91;
    if (/^[0-9a-f]{6}$/i.test(s)) {
      r = parseInt(s.slice(0, 2), 16);
      g = parseInt(s.slice(2, 4), 16);
      b = parseInt(s.slice(4, 6), 16);
    }
    const a = Math.max(0.05, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    return new oc.Quantity_ColorRGBA(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255), a);
  }
  function makeArr1P2(pts) {
    const a = new oc.NCollection_Array1_gp_Pnt2d(1, pts.length);
    for (let i = 0; i < pts.length; i++) { const p = new oc.gp_Pnt2d(pts[i][0], pts[i][1]); a.SetValue(i + 1, p); p.delete(); }
    return a;
  }
  function makeArr1P3(pts) {
    const a = new oc.NCollection_Array1_gp_Pnt(1, pts.length);
    for (let i = 0; i < pts.length; i++) { const p = new oc.gp_Pnt(pts[i][0], pts[i][1], pts[i][2]); a.SetValue(i + 1, p); p.delete(); }
    return a;
  }
  function expandKnots(knots, mults) {
    const out = [];
    for (let i = 0; i < knots.length; i++) for (let k = 0; k < mults[i]; k++) out.push(knots[i]);
    return out;
  }
  function compressKnots(seq) {
    const knots = [], mults = [];
    for (const v of seq) {
      if (knots.length && Math.abs(v - knots[knots.length - 1]) < 1e-9) mults[mults.length - 1]++;
      else { knots.push(v); mults.push(1); }
    }
    return { knots, mults };
  }
  function clampBSplineCurve(bc) {
    if (bc.IsPeriodic()) bc.SetNotPeriodic();
    if (bc.Multiplicity(1) < bc.Degree() + 1 || bc.Multiplicity(bc.NbKnots()) < bc.Degree() + 1) {
      bc.Segment(bc.FirstParameter(), bc.LastParameter());
    }
  }
  function clampBSplineSurface(bs) {
    if (bs.IsUPeriodic()) bs.SetUNotPeriodic();
    if (bs.IsVPeriodic()) bs.SetVNotPeriodic();
    const u1 = bs.UKnot(bs.FirstUKnotIndex()), u2 = bs.UKnot(bs.LastUKnotIndex());
    const v1 = bs.VKnot(bs.FirstVKnotIndex()), v2 = bs.VKnot(bs.LastVKnotIndex());
    const needU = bs.UMultiplicity(1) < bs.UDegree() + 1 || bs.UMultiplicity(bs.NbUKnots()) < bs.UDegree() + 1;
    const needV = bs.VMultiplicity(1) < bs.VDegree() + 1 || bs.VMultiplicity(bs.NbVKnots()) < bs.VDegree() + 1;
    if (needU || needV) bs.Segment(u1, u2, v1, v2);
  }
  function faceToBSplineSurface(face, fw) {
    const loc = new oc.TopLoc_Location();
    const surf = oc.BRep_Tool.Surface(fw, loc);
    const trsf = !loc.IsIdentity() ? loc.Transformation() : null;
    const uv = oc.BRepTools.UVBounds(fw);
    const xPt = (pt) => {
      let x = pt.X(), y = pt.Y(), z = pt.Z();
      if (trsf) { const p2 = pt.Transformed(trsf); x = p2.X(); y = p2.Y(); z = p2.Z(); p2.delete(); }
      return [x, y, z];
    };
    let bsp;
    if (face.geomType === 'PLANE') {
      const du = Math.max(1e-3, (uv.UMax - uv.UMin) * 0.02), dv = Math.max(1e-3, (uv.VMax - uv.VMin) * 0.02);
      const u0 = uv.UMin - du, u1 = uv.UMax + du, v0 = uv.VMin - dv, v1 = uv.VMax + dv;
      const poles = new oc.NCollection_Array2_gp_Pnt(1, 2, 1, 2);
      const setP = (iu, iv, u, v) => {
        const p = surf.Value(u, v), q = xPt(p); p.delete();
        const gp = new oc.gp_Pnt(q[0], q[1], q[2]); poles.SetValue(iu, iv, gp); gp.delete();
      };
      setP(1, 1, u0, v0); setP(2, 1, u1, v0); setP(1, 2, u0, v1); setP(2, 2, u1, v1);
      const uk = makeArr1D([u0, u1]), vk = makeArr1D([v0, v1]), um = makeArr1I([2, 2]), vm = makeArr1I([2, 2]);
      bsp = new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, 1, 1, false, false);
      poles.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete();
    } else if (face.geomType === 'CYLINDRE' || face.geomType === 'CONE' || face.geomType === 'EXTRUSION') {
      const fullU = surf.IsUPeriodic() && Math.abs((uv.UMax - uv.UMin) - surf.UPeriod()) < 1e-4;
      const dv = Math.max(1e-3, (uv.VMax - uv.VMin) * 0.02);
      const v0 = uv.VMin - dv, v1 = uv.VMax + dv;
      const iso1 = surf.VIso(v0), iso2 = surf.VIso(v1);
      const c1 = fullU ? iso1 : new oc.Geom_TrimmedCurve(iso1, uv.UMin, uv.UMax, true, true);
      const c2 = fullU ? iso2 : new oc.Geom_TrimmedCurve(iso2, uv.UMin, uv.UMax, true, true);
      const pt = oc.Convert_ParameterisationType.Convert_QuasiAngular;
      const b1 = oc.GeomConvert.CurveToBSplineCurve(c1, pt);
      const b2 = oc.GeomConvert.CurveToBSplineCurve(c2, pt);
      if (!fullU) { c1.delete(); c2.delete(); }
      clampBSplineCurve(b1); clampBSplineCurve(b2);
      const nu = b1.NbPoles(), nk = b1.NbKnots(), uDeg = b1.Degree();
      const poles = new oc.NCollection_Array2_gp_Pnt(1, nu, 1, 2);
      const weights = new oc.NCollection_Array2_double(1, nu, 1, 2);
      for (let i = 1; i <= nu; i++) {
        const p1 = b1.Pole(i), p2 = b2.Pole(i), q1 = xPt(p1), q2 = xPt(p2);
        const gp1 = new oc.gp_Pnt(q1[0], q1[1], q1[2]), gp2 = new oc.gp_Pnt(q2[0], q2[1], q2[2]);
        poles.SetValue(i, 1, gp1); poles.SetValue(i, 2, gp2);
        weights.SetValue(i, 1, b1.Weight(i)); weights.SetValue(i, 2, b2.Weight(i));
        gp1.delete(); gp2.delete(); p1.delete(); p2.delete();
      }
      const uK = [], uM = [];
      for (let i = 1; i <= nk; i++) { uK.push(b1.Knot(i)); uM.push(b1.Multiplicity(i)); }
      const uk = makeArr1D(uK), um = makeArr1I(uM), vk = makeArr1D([v0, v1]), vm = makeArr1I([2, 2]);
      bsp = b1.IsRational()
        ? new oc.Geom_BSplineSurface(poles, weights, uk, vk, um, vm, uDeg, 1, false, false)
        : new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, uDeg, 1, false, false);
      poles.delete(); weights.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete(); b1.delete(); b2.delete();
    } else {
      try {
        bsp = oc.GeomConvert.SurfaceToBSplineSurface(surf);
        clampBSplineSurface(bsp);
        if (trsf) {
          const nu = bsp.NbUPoles(), nv = bsp.NbVPoles();
          for (let u = 1; u <= nu; u++) for (let v = 1; v <= nv; v++) {
            const pt = bsp.Pole(u, v), q = xPt(pt), np = new oc.gp_Pnt(q[0], q[1], q[2]);
            bsp.SetPole(u, v, np); np.delete(); pt.delete();
          }
        }
      } catch (_) {
        const N = 9, du = (uv.UMax - uv.UMin) / (N - 1), dv = (uv.VMax - uv.VMin) / (N - 1);
        const grid = new oc.NCollection_Array2_gp_Pnt(1, N, 1, N);
        for (let iu = 0; iu < N; iu++) for (let iv = 0; iv < N; iv++) {
          const pt = surf.Value(uv.UMin + iu * du, uv.VMin + iv * dv), q = xPt(pt), np = new oc.gp_Pnt(q[0], q[1], q[2]);
          grid.SetValue(iu + 1, iv + 1, np); np.delete(); pt.delete();
        }
        const fit = new oc.GeomAPI_PointsToBSplineSurface();
        fit.Interpolate(grid);
        bsp = fit.Surface();
        grid.delete(); fit.delete();
        const uK0 = bsp.UKnot(1), uK1 = bsp.UKnot(bsp.NbUKnots()), vK0 = bsp.VKnot(1), vK1 = bsp.VKnot(bsp.NbVKnots());
        if (Math.abs(uK1 - uK0) > 1e-12) {
          for (let i = 1; i <= bsp.NbUKnots(); i++) bsp.SetUKnot(i, uv.UMin + ((bsp.UKnot(i) - uK0) / (uK1 - uK0)) * (uv.UMax - uv.UMin));
        }
        if (Math.abs(vK1 - vK0) > 1e-12) {
          for (let i = 1; i <= bsp.NbVKnots(); i++) bsp.SetVKnot(i, uv.VMin + ((bsp.VKnot(i) - vK0) / (vK1 - vK0)) * (uv.VMax - uv.VMin));
        }
      }
    }
    if (trsf) trsf.delete();
    loc.delete();
    return bsp;
  }
  function orderWireEdges2D(edges) {
    if (edges.length <= 1) return edges;
    const used = new Array(edges.length).fill(false);
    const ordered = [edges[0]];
    used[0] = true;
    let cur = edges[0].end2;
    while (ordered.length < edges.length) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < edges.length; i++) {
        if (used[i]) continue;
        const d = Math.hypot(edges[i].start2[0] - cur[0], edges[i].start2[1] - cur[1]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) break;
      used[best] = true;
      ordered.push(edges[best]);
      cur = edges[best].end2;
    }
    return ordered;
  }
  function shapeToIGES(shape, name = 'Tracery') {
    const padL = (s, w) => String(s).padStart(w, ' ');
    const padR = (s, w) => String(s).padEnd(w, ' ').slice(0, w);
    const igsNum = (v) => (Math.abs(v) < 1e-12 ? '0' : Number(Number(v).toPrecision(12)).toString());
    const igsH = (s) => { const str = String(s || 'Tracery').replace(/[^\x20-\x7e]/g, '_'); return `${str.length}H${str}`; };
    const now = new Date();
    const ts = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}.${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
    const startLines = [padR('Tracery IGES 5.3 Export', 72) + 'S' + padL(1, 7)];
    const gFields = [
      '1H,', '1H;', igsH('Tracery'), igsH((name || 'Tracery') + '.igs'), igsH('Tracery'), igsH('Tracery'),
      '32', '38', '6', '308', '15', igsH('Tracery'), '1.0', '2', '2HMM', '1', '0.01',
      igsH(ts), '1E-08', '1000.', igsH('Tracery'), igsH('Tracery'), '11', '0', igsH(ts),
    ];
    const globalLines = [];
    let gCur = '';
    for (let i = 0; i < gFields.length; i++) {
      const tok = gFields[i] + (i === gFields.length - 1 ? ';' : ',');
      if (gCur.length + tok.length > 72 && gCur.length > 0) {
        globalLines.push(padR(gCur, 72) + 'G' + padL(globalLines.length + 1, 7));
        gCur = tok;
      } else {
        gCur += tok;
      }
    }
    if (gCur) globalLines.push(padR(gCur, 72) + 'G' + padL(globalLines.length + 1, 7));

    const dirLines = [], paramLines = [];
    const addEntity = (type, params, { sub = 1, use = 0, form = 0, xform = 0 } = {}) => {
      const deNum = dirLines.length + 1;
      const pStart = paramLines.length + 1;
      const tokens = [String(type), ...params.map((x) => (typeof x === 'string' ? x : igsNum(x)))];
      let cur = '';
      let pCount = 0;
      for (let i = 0; i < tokens.length; i++) {
        const sep = i === tokens.length - 1 ? ';' : ',';
        const tok = tokens[i] + sep;
        if (cur.length + tok.length > 64 && cur.length > 0) {
          pCount++;
          paramLines.push(padR(cur, 64) + padL(deNum, 8) + 'P' + padL(paramLines.length + 1, 7));
          cur = tok;
        } else {
          cur += tok;
        }
      }
      if (cur) {
        pCount++;
        paramLines.push(padR(cur, 64) + padL(deNum, 8) + 'P' + padL(paramLines.length + 1, 7));
      }
      const status = `00${String(sub).padStart(2, '0')}${String(use).padStart(2, '0')}00`;
      const d1 = padL(type, 8) + padL(pStart, 8) + padL(0, 8) + padL(1, 8) + padL(0, 8) + padL(0, 8) + padL(xform, 8) + padL(0, 8) + status + 'D' + padL(deNum, 7);
      const d2 = padL(type, 8) + padL(0, 8) + padL(0, 8) + padL(pCount, 8) + padL(form, 8) + '        ' + '        ' + '        ' + padL(0, 8) + 'D' + padL(deNum + 1, 7);
      dirLines.push(d1, d2);
      return deNum;
    };

    const emitCurve126 = (bc, is2d) => {
      const np = bc.NbPoles(), deg = bc.Degree();
      const ck = [], cm = [];
      for (let i = 1; i <= bc.NbKnots(); i++) { ck.push(bc.Knot(i)); cm.push(bc.Multiplicity(i)); }
      const cSeq = expandKnots(ck, cm);
      const cw = [], cp = [];
      for (let i = 1; i <= np; i++) {
        cw.push(bc.Weight(i));
        const pt = bc.Pole(i);
        cp.push(is2d ? [pt.X(), pt.Y(), 0] : [pt.X(), pt.Y(), pt.Z()]);
        pt.delete();
      }
      const isRat = cw.some((w) => Math.abs(w - 1) > 1e-12);
      const f = bc.FirstParameter(), l = bc.LastParameter();
      const params = [
        np - 1, deg, is2d ? 1 : 0, 0, isRat ? 0 : 1, 0,
        ...cSeq,
        ...cw,
        ...cp.flatMap((q) => q),
        f, l,
        0, 0, is2d ? 1 : 0,
      ];
      return addEntity(126, params, { sub: 1, use: is2d ? 5 : 0 });
    };

    const convMode = oc.Convert_ParameterisationType.Convert_QuasiAngular;
    for (const face of shape.faces) {
      const fwOrig = oc.TopoDS.Face(face.wrapped);
      const fw = oc.TopoDS.Face(fwOrig.Oriented(oc.TopAbs_Orientation.TopAbs_FORWARD));
      const bsp = faceToBSplineSurface(face, fw);
      const nu = bsp.NbUPoles(), nv = bsp.NbVPoles(), uDeg = bsp.UDegree(), vDeg = bsp.VDegree();
      const uK = [], uM = [], vK = [], vM = [];
      for (let i = 1; i <= bsp.NbUKnots(); i++) { uK.push(bsp.UKnot(i)); uM.push(bsp.UMultiplicity(i)); }
      for (let i = 1; i <= bsp.NbVKnots(); i++) { vK.push(bsp.VKnot(i)); vM.push(bsp.VMultiplicity(i)); }
      const uSeq = expandKnots(uK, uM), vSeq = expandKnots(vK, vM);
      const W = [], P = [];
      for (let j = 1; j <= nv; j++) for (let i = 1; i <= nu; i++) {
        W.push(bsp.Weight(i, j));
        const pt = bsp.Pole(i, j); P.push(pt.X(), pt.Y(), pt.Z()); pt.delete();
      }
      const isRat = W.some((w) => Math.abs(w - 1) > 1e-12);
      const deSurf = addEntity(128, [
        nu - 1, nv - 1, uDeg, vDeg, 0, 0, isRat ? 0 : 1, 0, 0,
        ...uSeq, ...vSeq, ...W, ...P,
        uSeq[0], uSeq[uSeq.length - 1], vSeq[0], vSeq[vSeq.length - 1],
      ], { sub: 1, use: 0 });
      bsp.delete();

      const wires = collectWires(fw);
      const uv = oc.BRepTools.UVBounds(fw);
      const isNaturalClosed = wires.length === 1 && (face.geomType === 'SPHERE' || face.geomType === 'TORUS') &&
        Math.abs((uv.UMax - uv.UMin) - (uSeq[uSeq.length - 1] - uSeq[0])) < 1e-4 &&
        Math.abs((uv.VMax - uv.VMin) - (vSeq[vSeq.length - 1] - vSeq[0])) < 1e-4;
      if (isNaturalClosed) {
        addEntity(144, [deSurf, 0, 0, 0], { sub: 0, use: 0 });
        continue;
      }

      const wire142s = [];
      for (const w of wires) {
        const rawEdges = collectEdges(w);
        const edgeRecords = [];
        for (const ew of rawEdges) {
          const isRev = ew.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
          const ad = new oc.BRepAdaptor_Curve2d(ew, fw);
          const trim2 = new oc.Geom2d_TrimmedCurve(ad.Curve(), ad.FirstParameter(), ad.LastParameter(), true, true);
          const bc2 = oc.Geom2dConvert.CurveToBSplineCurve(trim2, convMode);
          trim2.delete(); ad.delete();
          clampBSplineCurve(bc2);
          if (isRev) bc2.Reverse();
          const pS = bc2.Value(bc2.FirstParameter()), pE = bc2.Value(bc2.LastParameter());
          const start2 = [pS.X(), pS.Y()], end2 = [pE.X(), pE.Y()];
          pS.delete(); pE.delete();

          let bc3 = null;
          if (!oc.BRep_Tool.Degenerated(ew)) {
            const locE = new oc.TopLoc_Location();
            const crvRes = oc.BRep_Tool.Curve(ew, locE);
            if (crvRes && crvRes.returnValue) {
              const trim3 = new oc.Geom_TrimmedCurve(crvRes.returnValue, crvRes.First, crvRes.Last, true, true);
              bc3 = oc.GeomConvert.CurveToBSplineCurve(trim3, convMode);
              trim3.delete();
              clampBSplineCurve(bc3);
              if (!locE.IsIdentity()) {
                const tr = locE.Transformation();
                for (let i = 1; i <= bc3.NbPoles(); i++) {
                  const pt = bc3.Pole(i), p2 = pt.Transformed(tr);
                  bc3.SetPole(i, p2); p2.delete(); pt.delete();
                }
                tr.delete();
              }
              if (isRev) bc3.Reverse();
            }
            locE.delete();
          }
          edgeRecords.push({ bc2, bc3, start2, end2 });
        }
        const ordered = orderWireEdges2D(edgeRecords);
        const des2d = [], des3d = [];
        for (const rec of ordered) {
          des2d.push(emitCurve126(rec.bc2, true));
          rec.bc2.delete();
          if (rec.bc3) {
            des3d.push(emitCurve126(rec.bc3, false));
            rec.bc3.delete();
          }
        }
        const de2dComp = des2d.length === 1 ? des2d[0] : addEntity(102, [des2d.length, ...des2d], { sub: 1, use: 5 });
        const de3dComp = des3d.length === 0 ? 0 : des3d.length === 1 ? des3d[0] : addEntity(102, [des3d.length, ...des3d], { sub: 1, use: 0 });
        wire142s.push(addEntity(142, [2, deSurf, de2dComp, de3dComp, de3dComp ? 3 : 1], { sub: 1, use: 0 }));
      }
      if (!wire142s.length) continue;
      const outer142 = wire142s[0], inner142s = wire142s.slice(1);
      addEntity(144, [deSurf, 1, inner142s.length, outer142, ...inner142s], { sub: 0, use: 0 });
    }
    const termLine = `S${padL(startLines.length, 7)}G${padL(globalLines.length, 7)}D${padL(dirLines.length, 7)}P${padL(paramLines.length, 7)}` + ' '.repeat(40) + 'T' + padL(1, 7);
    return [...startLines, ...globalLines, ...dirLines, ...paramLines, termLine].join('\n') + '\n';
  }
  function parseIGESToShape(txt) {
    const rawLines = String(txt || '').split(/\r\n|\n|\r/);
    const gLines = [], dLines = [], pLines = [];
    for (const ln of rawLines) {
      if (ln.length < 73) continue;
      const sec = ln[72];
      if (sec === 'G') gLines.push(ln.slice(0, 72));
      else if (sec === 'D') dLines.push(ln);
      else if (sec === 'P') pLines.push(ln);
    }
    if (!dLines.length || !pLines.length) throw new Error('Die IGES-Datei ließ sich nicht lesen.');

    const parseGlobal = (str) => {
      const s = str.replace(/^\s+/, '');
      let paramDelim = ',', recordDelim = ';', idx = 0;
      const readDelimSpec = () => {
        while (idx < s.length && /\s/.test(s[idx])) idx++;
        if (s[idx] === ',' || s[idx] === ';') { const ch = s[idx]; idx++; return ch; }
        const m = /^(\d+)H/.exec(s.slice(idx));
        if (m) {
          const len = parseInt(m[1], 10);
          idx += m[0].length;
          const val = s.slice(idx, idx + len);
          idx += len;
          while (idx < s.length && (s[idx] === ',' || /\s/.test(s[idx]))) idx++;
          return val[0];
        }
        return null;
      };
      const d1 = readDelimSpec();
      if (d1) paramDelim = d1;
      const d2 = readDelimSpec();
      if (d2) recordDelim = d2;
      const fields = [paramDelim, recordDelim];
      while (idx < s.length) {
        while (idx < s.length && /\s/.test(s[idx])) idx++;
        if (idx >= s.length || s[idx] === recordDelim) break;
        if (s[idx] === paramDelim) { fields.push(''); idx++; continue; }
        const hm = /^(\d+)H/.exec(s.slice(idx));
        if (hm) {
          const n = parseInt(hm[1], 10);
          idx += hm[0].length;
          fields.push(s.slice(idx, idx + n));
          idx += n;
          while (idx < s.length && /\s/.test(s[idx])) idx++;
          if (s[idx] === paramDelim) idx++;
        } else {
          let j = idx;
          while (j < s.length && s[j] !== paramDelim && s[j] !== recordDelim) j++;
          fields.push(s.slice(idx, j).trim());
          idx = s[j] === paramDelim ? j + 1 : j;
        }
      }
      return { paramDelim, recordDelim, fields };
    };
    const G = parseGlobal(gLines.join(''));
    const PD = G.paramDelim, RD = G.recordDelim;
    const UNITS = { 1: 25.4, 2: 1, 4: 304.8, 5: 1609344, 6: 1000, 7: 1e6, 8: 0.0254, 9: 0.001, 10: 10, 11: 2.54e-5 };
    const uFlag = parseInt(G.fields[13], 10);
    let unitScale = UNITS[uFlag];
    if (!unitScale) {
      const uName = String(G.fields[14] || '').trim().toUpperCase();
      unitScale = uName.startsWith('IN') ? 25.4 : uName === 'CM' ? 10 : uName === 'M' ? 1000 : uName === 'FT' ? 304.8 : uName === 'UM' ? 0.001 : 1;
    }

    const deMap = new Map();
    for (let i = 0; i + 1 < dLines.length; i += 2) {
      const l1 = dLines[i], l2 = dLines[i + 1];
      const de = parseInt(l1.slice(73, 80), 10) || (i + 1);
      const type = parseInt(l1.slice(0, 8), 10);
      const paramPtr = parseInt(l1.slice(8, 16), 10) || 0;
      const xformPtr = parseInt(l1.slice(48, 56), 10) || 0;
      const statusStr = l1.slice(64, 72).replace(/\s/g, '0').padStart(8, '0');
      const sub = parseInt(statusStr.slice(2, 4), 10) || 0;
      const paramCount = parseInt(l2.slice(24, 32), 10) || 0;
      const form = parseInt(l2.slice(32, 40), 10) || 0;
      deMap.set(de, { de, type, paramPtr, xformPtr, sub, paramCount, form, raw: [], params: null });
    }
    for (const ln of pLines) {
      const dePtr = parseInt(ln.slice(64, 72), 10);
      const ent = deMap.get(dePtr);
      if (ent) ent.raw.push(ln.slice(0, 64));
    }
    const tokenizeParams = (rawText) => {
      const toks = [];
      let i = 0;
      while (i < rawText.length) {
        while (i < rawText.length && /\s/.test(rawText[i])) i++;
        if (i >= rawText.length || rawText[i] === RD) break;
        if (rawText[i] === PD) { toks.push(''); i++; continue; }
        const hm = /^(\d+)H/.exec(rawText.slice(i));
        if (hm) {
          const n = parseInt(hm[1], 10);
          i += hm[0].length;
          toks.push(rawText.slice(i, i + n));
          i += n;
          while (i < rawText.length && /\s/.test(rawText[i])) i++;
          if (rawText[i] === PD) i++;
        } else {
          let j = i;
          while (j < rawText.length && rawText[j] !== PD && rawText[j] !== RD) j++;
          toks.push(rawText.slice(i, j).trim());
          i = rawText[j] === PD ? j + 1 : j;
        }
      }
      return toks;
    };
    for (const ent of deMap.values()) ent.params = tokenizeParams(ent.raw.join(''));
    const pNum = (ent, idx, def = 0) => {
      const s = ent.params[idx];
      if (!s) return def;
      const v = parseFloat(s.replace(/[dD]/g, 'e'));
      return Number.isFinite(v) ? v : def;
    };
    const pInt = (ent, idx, def = 0) => Math.round(pNum(ent, idx, def));

    const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const xformCache = new Map();
    const getXform = (dePtr, seen = new Set()) => {
      if (!dePtr || seen.has(dePtr)) return ID;
      if (xformCache.has(dePtr)) return xformCache.get(dePtr);
      const ent = deMap.get(dePtr);
      if (!ent || ent.type !== 124) return ID;
      seen.add(dePtr);
      const r11 = pNum(ent, 1, 1), r12 = pNum(ent, 2, 0), r13 = pNum(ent, 3, 0), t1 = pNum(ent, 4, 0);
      const r21 = pNum(ent, 5, 0), r22 = pNum(ent, 6, 1), r23 = pNum(ent, 7, 0), t2 = pNum(ent, 8, 0);
      const r31 = pNum(ent, 9, 0), r32 = pNum(ent, 10, 0), r33 = pNum(ent, 11, 1), t3 = pNum(ent, 12, 0);
      const local = [r11, r21, r31, 0, r12, r22, r32, 0, r13, r23, r33, 0, t1, t2, t3, 1];
      const res = ent.xformPtr ? matMul(getXform(ent.xformPtr, seen), local) : local;
      xformCache.set(dePtr, res);
      return res;
    };
    const xformPnt = (dePtr, pt) => (dePtr ? transformPoint(getXform(dePtr), pt) : pt);

    const buildSurface = (dePtr) => {
      const ent = deMap.get(dePtr);
      if (!ent) return null;
      if (ent.type === 128) {
        const K1 = pInt(ent, 1), K2 = pInt(ent, 2), M1 = pInt(ent, 3), M2 = pInt(ent, 4);
        const nu = K1 + 1, nv = K2 + 1, A = nu + M1 + 1, B = nv + M2 + 1, C = nu * nv;
        let idx = 10;
        const uSeq = [], vSeq = [], W = [], P = [];
        for (let i = 0; i < A; i++) uSeq.push(pNum(ent, idx++));
        for (let i = 0; i < B; i++) vSeq.push(pNum(ent, idx++));
        for (let i = 0; i < C; i++) W.push(pNum(ent, idx++, 1));
        for (let i = 0; i < C; i++) {
          const pt = [pNum(ent, idx++), pNum(ent, idx++), pNum(ent, idx++)];
          P.push(xformPnt(ent.xformPtr, pt));
        }
        const uC = compressKnots(uSeq), vC = compressKnots(vSeq);
        const poles = new oc.NCollection_Array2_gp_Pnt(1, nu, 1, nv);
        const weights = new oc.NCollection_Array2_double(1, nu, 1, nv);
        let k = 0;
        for (let j = 1; j <= nv; j++) for (let i = 1; i <= nu; i++, k++) {
          const gp = new oc.gp_Pnt(P[k][0], P[k][1], P[k][2]);
          poles.SetValue(i, j, gp); gp.delete();
          weights.SetValue(i, j, W[k]);
        }
        const uk = makeArr1D(uC.knots), vk = makeArr1D(vC.knots), um = makeArr1I(uC.mults), vm = makeArr1I(vC.mults);
        const isRat = W.some((w) => Math.abs(w - 1) > 1e-12);
        const surf = isRat
          ? new oc.Geom_BSplineSurface(poles, weights, uk, vk, um, vm, M1, M2, false, false)
          : new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, M1, M2, false, false);
        poles.delete(); weights.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete();
        return surf;
      }
      if (ent.type === 190 || ent.type === 108) {
        // Ebene als große BSplineSurface (für getrimmte Flächen 144/143)
        let o, uDir, vDir;
        if (ent.type === 108) {
          const A = pNum(ent, 1), B = pNum(ent, 2), C = pNum(ent, 3), D = pNum(ent, 4);
          const n = norm([A, B, C]);
          o = mul(n, D / (Math.hypot(A, B, C) || 1));
          const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          uDir = norm(cross(ref, n));
          vDir = cross(n, uDir);
        } else {
          const pEnt = deMap.get(pInt(ent, 1)), nEnt = deMap.get(pInt(ent, 2));
          o = pEnt ? [pNum(pEnt, 1), pNum(pEnt, 2), pNum(pEnt, 3)] : [0, 0, 0];
          const n = norm(nEnt ? [pNum(nEnt, 1), pNum(nEnt, 2), pNum(nEnt, 3)] : [0, 0, 1]);
          const rEnt = ent.form === 1 ? deMap.get(pInt(ent, 3)) : null;
          uDir = rEnt ? norm([pNum(rEnt, 1), pNum(rEnt, 2), pNum(rEnt, 3)]) : norm(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n));
          vDir = cross(n, uDir);
        }
        if (ent.xformPtr) {
          const m = getXform(ent.xformPtr);
          o = transformPoint(m, o); uDir = transformDir(m, uDir); vDir = transformDir(m, vDir);
        }
        const S = 1e4;
        const poles = new oc.NCollection_Array2_gp_Pnt(1, 2, 1, 2);
        const setP = (iu, iv, u, v) => {
          const q = [o[0] + uDir[0] * u + vDir[0] * v, o[1] + uDir[1] * u + vDir[1] * v, o[2] + uDir[2] * u + vDir[2] * v];
          const gp = new oc.gp_Pnt(q[0], q[1], q[2]); poles.SetValue(iu, iv, gp); gp.delete();
        };
        setP(1, 1, -S, -S); setP(2, 1, S, -S); setP(1, 2, -S, S); setP(2, 2, S, S);
        const uk = makeArr1D([-S, S]), vk = makeArr1D([-S, S]), um = makeArr1I([2, 2]), vm = makeArr1I([2, 2]);
        const surf = new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, 1, 1, false, false);
        poles.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete();
        return surf;
      }
      if (ent.type === 192 || ent.type === 194 || ent.type === 196) {
        const pEnt = deMap.get(pInt(ent, 1)), aEnt = deMap.get(pInt(ent, 2));
        const o0 = pEnt ? [pNum(pEnt, 1), pNum(pEnt, 2), pNum(pEnt, 3)] : [0, 0, 0];
        const ax0 = norm(aEnt ? [pNum(aEnt, 1), pNum(aEnt, 2), pNum(aEnt, 3)] : [0, 0, 1]);
        const r = Math.max(1e-6, pNum(ent, 3, 1));
        const rEnt = ent.form === 1 ? deMap.get(pInt(ent, ent.type === 194 ? 5 : 4)) : null;
        const x0 = rEnt ? norm([pNum(rEnt, 1), pNum(rEnt, 2), pNum(rEnt, 3)]) : norm(cross(Math.abs(ax0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], ax0));
        const m = ent.xformPtr ? getXform(ent.xformPtr) : null;
        const o = m ? transformPoint(m, o0) : o0, ax = m ? transformDir(m, ax0) : ax0, xd = m ? transformDir(m, x0) : x0;
        const p = new oc.gp_Pnt(o[0], o[1], o[2]), d = new oc.gp_Dir(ax[0], ax[1], ax[2]), xdG = new oc.gp_Dir(xd[0], xd[1], xd[2]);
        const ax3 = new oc.gp_Ax3(p, d, xdG);
        let surf = null;
        if (ent.type === 192) surf = new oc.Geom_CylindricalSurface(ax3, r);
        else if (ent.type === 194) surf = new oc.Geom_ConicalSurface(ax3, (pNum(ent, 4, 45) * Math.PI) / 180, r);
        else surf = new oc.Geom_SphericalSurface(ax3, r);
        ax3.delete(); p.delete(); d.delete(); xdG.delete();
        return surf;
      }
      return null;
    };

    const collectCurveDEs = (dePtr, seen = new Set()) => {
      if (!dePtr || seen.has(dePtr)) return [];
      const ent = deMap.get(dePtr);
      if (!ent) return [];
      if (ent.type === 102) {
        seen.add(dePtr);
        const n = pInt(ent, 1, 0);
        const out = [];
        for (let i = 0; i < n; i++) out.push(...collectCurveDEs(pInt(ent, 2 + i), seen));
        return out;
      }
      return [ent];
    };

    const build2DEdges = (dePtr, surf) => {
      const ents = collectCurveDEs(dePtr);
      const edges = [];
      for (const ent of ents) {
        if (ent.type === 126) {
          const K = pInt(ent, 1), M = pInt(ent, 2), np = K + 1, nKnots = np + M + 1;
          let idx = 7;
          const seq = [], W = [], P = [];
          for (let i = 0; i < nKnots; i++) seq.push(pNum(ent, idx++));
          for (let i = 0; i < np; i++) W.push(pNum(ent, idx++, 1));
          for (let i = 0; i < np; i++) {
            const pt = xformPnt(ent.xformPtr, [pNum(ent, idx++), pNum(ent, idx++), pNum(ent, idx++)]);
            P.push([pt[0], pt[1]]);
          }
          const v0 = pNum(ent, idx++, seq[0]), v1 = pNum(ent, idx++, seq[seq.length - 1]);
          const cC = compressKnots(seq);
          const cp = makeArr1P2(P), ck = makeArr1D(cC.knots), cm = makeArr1I(cC.mults);
          const isRat = W.some((w) => Math.abs(w - 1) > 1e-12);
          let bc;
          if (isRat) { const cw = makeArr1D(W); bc = new oc.Geom2d_BSplineCurve(cp, cw, ck, cm, M, false); cw.delete(); }
          else bc = new oc.Geom2d_BSplineCurve(cp, ck, cm, M, false);
          cp.delete(); ck.delete(); cm.delete();
          const me = new oc.BRepBuilderAPI_MakeEdge(bc, surf, v0, v1);
          if (me.IsDone()) edges.push(me.Edge());
          me.delete(); bc.delete();
        } else if (ent.type === 110) {
          const a = xformPnt(ent.xformPtr, [pNum(ent, 1), pNum(ent, 2), pNum(ent, 3)]);
          const b = xformPnt(ent.xformPtr, [pNum(ent, 4), pNum(ent, 5), pNum(ent, 6)]);
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
          const cp = makeArr1P2([[a[0], a[1]], [b[0], b[1]]]), ck = makeArr1D([0, 1]), cm = makeArr1I([2, 2]);
          const bc = new oc.Geom2d_BSplineCurve(cp, ck, cm, 1, false);
          cp.delete(); ck.delete(); cm.delete();
          const me = new oc.BRepBuilderAPI_MakeEdge(bc, surf, 0, 1);
          if (me.IsDone()) edges.push(me.Edge());
          me.delete(); bc.delete();
        } else if (ent.type === 100) {
          const c = xformPnt(ent.xformPtr, [pNum(ent, 2), pNum(ent, 3), pNum(ent, 1)]);
          const s = xformPnt(ent.xformPtr, [pNum(ent, 4), pNum(ent, 5), pNum(ent, 1)]);
          const e = xformPnt(ent.xformPtr, [pNum(ent, 6), pNum(ent, 7), pNum(ent, 1)]);
          const r = Math.hypot(s[0] - c[0], s[1] - c[1]);
          if (r < 1e-12) continue;
          const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
          let a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
          if (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
          const cp = new oc.gp_Pnt2d(c[0], c[1]), d = new oc.gp_Dir2d(1, 0), ax = new oc.gp_Ax2d(cp, d);
          const circ = new oc.Geom2d_Circle(ax, r, true);
          const trim = new oc.Geom2d_TrimmedCurve(circ, a0, a1, true, true);
          const me = new oc.BRepBuilderAPI_MakeEdge(trim, surf, a0, a1);
          if (me.IsDone()) edges.push(me.Edge());
          me.delete(); trim.delete(); circ.delete(); ax.delete(); d.delete(); cp.delete();
        } else if (ent.type === 106) {
          const ip = pInt(ent, 1, 1), n = pInt(ent, 2, 0);
          const pts = [];
          let idx = 3;
          if (ip === 1) {
            const z = pNum(ent, idx++, 0);
            for (let i = 0; i < n; i++) pts.push(xformPnt(ent.xformPtr, [pNum(ent, idx++), pNum(ent, idx++), z]));
          } else if (ip === 2) {
            for (let i = 0; i < n; i++) pts.push(xformPnt(ent.xformPtr, [pNum(ent, idx++), pNum(ent, idx++), pNum(ent, idx++)]));
          }
          if (ent.form === 63 && pts.length > 1) pts.push(pts[0]);
          for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1];
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
            const cp = makeArr1P2([[a[0], a[1]], [b[0], b[1]]]), ck = makeArr1D([0, 1]), cm = makeArr1I([2, 2]);
            const bc = new oc.Geom2d_BSplineCurve(cp, ck, cm, 1, false);
            cp.delete(); ck.delete(); cm.delete();
            const me = new oc.BRepBuilderAPI_MakeEdge(bc, surf, 0, 1);
            if (me.IsDone()) edges.push(me.Edge());
            me.delete(); bc.delete();
          }
        }
      }
      return edges;
    };

    const build3DEdges = (dePtr) => {
      const ents = collectCurveDEs(dePtr);
      const edges = [];
      for (const ent of ents) {
        if (ent.type === 126) {
          const K = pInt(ent, 1), M = pInt(ent, 2), np = K + 1, nKnots = np + M + 1;
          let idx = 7;
          const seq = [], W = [], P = [];
          for (let i = 0; i < nKnots; i++) seq.push(pNum(ent, idx++));
          for (let i = 0; i < np; i++) W.push(pNum(ent, idx++, 1));
          for (let i = 0; i < np; i++) P.push(xformPnt(ent.xformPtr, [pNum(ent, idx++), pNum(ent, idx++), pNum(ent, idx++)]));
          const v0 = pNum(ent, idx++, seq[0]), v1 = pNum(ent, idx++, seq[seq.length - 1]);
          const cC = compressKnots(seq);
          const cp = makeArr1P3(P), ck = makeArr1D(cC.knots), cm = makeArr1I(cC.mults);
          const isRat = W.some((w) => Math.abs(w - 1) > 1e-12);
          let bc;
          if (isRat) { const cw = makeArr1D(W); bc = new oc.Geom_BSplineCurve(cp, cw, ck, cm, M, false); cw.delete(); }
          else bc = new oc.Geom_BSplineCurve(cp, ck, cm, M, false);
          cp.delete(); ck.delete(); cm.delete();
          const trim = new oc.Geom_TrimmedCurve(bc, v0, v1, true, true);
          const me = new oc.BRepBuilderAPI_MakeEdge(trim);
          if (me.IsDone()) edges.push(me.Edge());
          me.delete(); trim.delete(); bc.delete();
        } else if (ent.type === 110) {
          const a = xformPnt(ent.xformPtr, [pNum(ent, 1), pNum(ent, 2), pNum(ent, 3)]);
          const b = xformPnt(ent.xformPtr, [pNum(ent, 4), pNum(ent, 5), pNum(ent, 6)]);
          if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-9) continue;
          edges.push(R.makeLine(a, b).wrapped);
        } else if (ent.type === 100) {
          const z = pNum(ent, 1), cx = pNum(ent, 2), cy = pNum(ent, 3);
          const sx = pNum(ent, 4), sy = pNum(ent, 5), ex = pNum(ent, 6), ey = pNum(ent, 7);
          const r = Math.hypot(sx - cx, sy - cy);
          if (r < 1e-9) continue;
          const a0 = Math.atan2(sy - cy, sx - cx);
          let a1 = Math.atan2(ey - cy, ex - cx);
          if (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
          const c = xformPnt(ent.xformPtr, [cx, cy, z]);
          const n = ent.xformPtr ? transformDir(getXform(ent.xformPtr), [0, 0, 1]) : [0, 0, 1];
          if (Math.abs(a1 - a0 - Math.PI * 2) < 1e-6) {
            edges.push(R.makeCircle(r, c, n).wrapped);
          } else {
            const am = (a0 + a1) / 2;
            const p0 = xformPnt(ent.xformPtr, [sx, sy, z]);
            const pm = xformPnt(ent.xformPtr, [cx + r * Math.cos(am), cy + r * Math.sin(am), z]);
            const p1 = xformPnt(ent.xformPtr, [ex, ey, z]);
            edges.push(R.makeThreePointArc(p0, pm, p1).wrapped);
          }
        }
      }
      return edges;
    };

    const makeFaceWithWires = (surf, wireSpecs) => {
      const wires = [];
      for (const sp of wireSpecs) {
        let edgeList = sp.d2 ? build2DEdges(sp.d2, surf) : [];
        if (!edgeList.length && sp.d3) edgeList = build3DEdges(sp.d3);
        if (edgeList.length) wires.push(makeWireFromEdges(edgeList));
      }
      if (!wires.length) return null;
      const mf = new oc.BRepBuilderAPI_MakeFace(surf, wires[0], true);
      for (let i = 1; i < wires.length; i++) mf.Add(wires[i]);
      if (!mf.IsDone()) { mf.delete(); return null; }
      let nf = mf.Face(); mf.delete();
      oc.BRepLib.BuildCurves3d(nf);
      const sff = new oc.ShapeFix_Face(nf); sff.Perform(); nf = sff.Face(); sff.delete();
      return nf;
    };

    const faces = [];
    const usedSurfaces = new Set();
    for (const ent of deMap.values()) {
      if (ent.type === 144) {
        const deSurf = pInt(ent, 1), n1 = pInt(ent, 2), n2 = pInt(ent, 3), pto = pInt(ent, 4);
        usedSurfaces.add(deSurf);
        const surf = buildSurface(deSurf);
        if (!surf) continue;
        if (n1 === 0 && n2 === 0) {
          const mf = new oc.BRepBuilderAPI_MakeFace(surf, 1e-6);
          if (mf.IsDone()) faces.push(mf.Face());
          mf.delete();
          continue;
        }
        const specs = [];
        const add142 = (de142) => {
          const e142 = deMap.get(de142);
          if (!e142 || e142.type !== 142) return;
          specs.push({ d2: pInt(e142, 3), d3: pInt(e142, 4) });
        };
        if (pto) add142(pto);
        for (let i = 0; i < n2; i++) add142(pInt(ent, 5 + i));
        let nf = makeFaceWithWires(surf, specs);
        if (!nf && specs.length) {
          const mf = new oc.BRepBuilderAPI_MakeFace(surf, 1e-6);
          if (mf.IsDone()) nf = mf.Face();
          mf.delete();
        }
        if (nf) faces.push(nf);
      } else if (ent.type === 143) {
        const deSurf = pInt(ent, 2), n = pInt(ent, 3);
        usedSurfaces.add(deSurf);
        const surf = buildSurface(deSurf);
        if (!surf) continue;
        const specs = [];
        for (let i = 0; i < n; i++) {
          const bEnt = deMap.get(pInt(ent, 4 + i));
          if (!bEnt || bEnt.type !== 141) continue;
          const nb = pInt(bEnt, 4);
          const d2List = [], d3List = [];
          let idx = 5;
          for (let k = 0; k < nb; k++) {
            const crv = pInt(bEnt, idx++); idx++; // sense
            const nPsc = pInt(bEnt, idx++);
            for (let m = 0; m < nPsc; m++) d2List.push(pInt(bEnt, idx++));
            if (!nPsc && crv) d3List.push(crv);
          }
          if (d2List.length) {
            const e2 = [];
            for (const c of d2List) e2.push(...build2DEdges(c, surf));
            if (e2.length) specs.push({ preEdges: e2 });
          } else if (d3List.length) {
            const e3 = [];
            for (const c of d3List) e3.push(...build3DEdges(c));
            if (e3.length) specs.push({ preEdges: e3 });
          }
        }
        if (specs.length) {
          const wires = specs.map((sp) => makeWireFromEdges(sp.preEdges));
          const mf = new oc.BRepBuilderAPI_MakeFace(surf, wires[0], true);
          for (let i = 1; i < wires.length; i++) mf.Add(wires[i]);
          if (mf.IsDone()) {
            let nf = mf.Face();
            oc.BRepLib.BuildCurves3d(nf);
            const sff = new oc.ShapeFix_Face(nf); sff.Perform(); nf = sff.Face(); sff.delete();
            faces.push(nf);
          }
          mf.delete();
        }
      }
    }
    // Eigenständige ungetrimmte Flächen (128 / 108 mit sub === 0), falls nicht über 144/143 eingebunden
    for (const ent of deMap.values()) {
      if ((ent.type === 128 || ent.type === 108) && ent.sub === 0 && !usedSurfaces.has(ent.de)) {
        if (ent.type === 108) {
          const ptr = pInt(ent, 5);
          const A = pNum(ent, 1), B = pNum(ent, 2), C = pNum(ent, 3), D = pNum(ent, 4);
          const n = norm([A, B, C]), o = mul(n, D / (Math.hypot(A, B, C) || 1));
          const m = ent.xformPtr ? getXform(ent.xformPtr) : null;
          const ow = m ? transformPoint(m, o) : o, nw = m ? transformDir(m, n) : n;
          const gpP = new oc.gp_Pnt(ow[0], ow[1], ow[2]), gpD = new oc.gp_Dir(nw[0], nw[1], nw[2]);
          const pln = new oc.gp_Pln(gpP, gpD); gpP.delete(); gpD.delete();
          if (ptr) {
            const e3 = build3DEdges(ptr);
            if (e3.length) {
              const mf = new oc.BRepBuilderAPI_MakeFace(pln, makeWireFromEdges(e3), true);
              if (mf.IsDone()) {
                let nf = mf.Face();
                const sff = new oc.ShapeFix_Face(nf); sff.Perform(); nf = sff.Face(); sff.delete();
                faces.push(nf);
              }
              mf.delete();
            }
          }
          pln.delete();
        } else {
          const surf = buildSurface(ent.de);
          if (surf) {
            const mf = new oc.BRepBuilderAPI_MakeFace(surf, 1e-6);
            if (mf.IsDone()) faces.push(mf.Face());
            mf.delete();
          }
        }
      }
    }

    if (!faces.length) throw new Error('Die IGES-Datei enthält keine lesbare 3D-Geometrie.');
    const sew = new oc.BRepBuilderAPI_Sewing(1e-2, true, true, true, false);
    for (const f of faces) sew.Add(f);
    sew.Perform();
    const sewed = sew.SewedShape(); sew.delete();

    const outShapes = [];
    const shExp = new oc.TopExp_Explorer(sewed, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (shExp.More()) {
      const shell = oc.TopoDS.Shell(shExp.Current());
      let done = false;
      try {
        const ms = new oc.BRepBuilderAPI_MakeSolid(shell);
        if (ms.IsDone()) {
          let sol = ms.Solid(); ms.delete();
          const sfs = new oc.ShapeFix_Solid(sol); sfs.Perform(); sol = oc.TopoDS.Solid(sfs.Solid()); sfs.delete();
          let res = R.cast(sol);
          const v = R.measureVolume(res);
          if (Math.abs(v) > 1e-6) { if (v < 0) res = R.cast(sol.Reversed()); outShapes.push(res); done = true; }
        } else ms.delete();
      } catch (_) {}
      if (!done) outShapes.push(R.cast(shell));
      shExp.Next();
    }
    shExp.delete();

    if (!outShapes.length) {
      const fExp = new oc.TopExp_Explorer(sewed, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      while (fExp.More()) {
        const f = oc.TopoDS.Face(fExp.Current());
        let done = false;
        try {
          const sf = oc.BRep_Tool.Surface(f);
          const sh = new oc.BRepBuilderAPI_MakeShell(sf, false).Shell();
          const ms = new oc.BRepBuilderAPI_MakeSolid(sh);
          if (ms.IsDone()) {
            let sol = ms.Solid(); ms.delete();
            let res = R.cast(sol);
            const v = R.measureVolume(res);
            if (Math.abs(v) > 1e-6) { if (v < 0) res = R.cast(sol.Reversed()); outShapes.push(res); done = true; }
          } else ms.delete();
        } catch (_) {}
        if (!done) outShapes.push(R.cast(f));
        fExp.Next();
      }
      fExp.delete();
    }
    if (!outShapes.length) throw new Error('Die IGES-Datei enthält keine lesbare 3D-Geometrie.');
    let shape = outShapes.length === 1 ? outShapes[0] : R.makeCompound(outShapes);
    if (Math.abs(unitScale - 1) > 1e-9) shape = shape.scale(unitScale, [0, 0, 0]);
    return shape;
  }
  function exportSTEP(scene, only, originMat = null) {
    ingestBlobs(scene);
    const errors = [];
    const { evald, consumed, opsModified } = evalSceneCore(scene, errors);
    const keep = only && only.length ? new Set(only) : null;
    const useOrigin = Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat);
    const applyOrigin = (shape) => {
      if (!useOrigin || !shape) return shape;
      const tr = applyMatrix(shape, originMat);
      safeDelete(shape);
      return tr;
    };
    const topHoles = evald
      .filter((e) => e.it.role === 'hole' && e.shape)
      .map((h) => ({ shape: applyMatrix(h.shape, h.it.m), wb: h.wb }));
    const ownedShapes = [];
    for (const h of topHoles) ownedShapes.push(h.shape);

    const cutHoles = (worldShape, holeList) => {
      if (!worldShape || !holeList || !holeList.length) return worldShape;
      const wb = bboxOf(worldShape);
      const cutters = holeList.filter((h) => h.shape && h.wb && bboxHit(h.wb, wb));
      if (!cutters.length) return worldShape;
      try {
        const tool = fuseAll(cutters.map((h) => h.shape.clone()), true);
        const cut = worldShape.cut(tool);
        safeDelete(tool);
        safeDelete(worldShape);
        return cut;
      } catch (_) {
        return worldShape;
      }
    };
    const canDecomposeGroup = (it, isTop) => {
      if (!it || it.kind !== 'group') return false;
      if (isTop && opsModified && opsModified.has(it.id)) return false;
      if (it.p && it.p.op) return false;
      if (it.finishes && it.finishes.length) return false;
      if (it.mir && it.mir.some((s) => s < 0)) return false;
      if (it.bodies && it.bodies.some((b) => b && b.hidden)) return false;
      const kids = (it.children || []).filter((c) => !c.hidden);
      const solidKids = kids.filter((c) => c.role !== 'hole' && c.kind !== 'mirrorStep');
      if (!solidKids.length) return false;
      return solidKids.length >= 2 || solidKids.some((c) => c.kind === 'group') || !!(it.p && it.p.assembly) || !!it.comp;
    };
    const buildGroupExport = (it, parentM, inheritedHoles) => {
      const worldM = parentM ? matMul(parentM, it.m) : it.m;
      const kids = (it.children || []).filter((c) => !c.hidden);
      const solidKids = kids.filter((c) => c.role !== 'hole' && c.kind !== 'mirrorStep');
      const holeKids = kids.filter((c) => c.role === 'hole');
      const localHoles = [];
      for (const h of holeKids) {
        const r = evalItem(h, errors);
        if (!r.shape) continue;
        const hm = matMul(worldM, h.m);
        const hs = applyMatrix(r.shape, hm);
        ownedShapes.push(hs);
        localHoles.push({ shape: hs, wb: bboxOf(hs) });
      }
      const allHoles = localHoles.length ? inheritedHoles.concat(localHoles) : inheritedHoles;
      const children = [];
      for (const c of solidKids) {
        if (canDecomposeGroup(c, false)) {
          const sub = buildGroupExport(c, worldM, allHoles);
          if (sub && sub.children.length) children.push(sub);
          continue;
        }
        const r = evalItem(c, errors);
        if (!r.shape) continue;
        const cm = matMul(worldM, c.m);
        let sh = applyMatrix(r.shape, cm);
        sh = cutHoles(sh, allHoles);
        sh = applyOrigin(sh);
        ownedShapes.push(sh);
        children.push({
          type: 'part',
          name: c.name || 'Teil',
          color: c.color || it.color || '#2f9e91',
          alpha: c.opacity != null ? c.opacity : 1,
          shape: sh,
        });
      }
      return { type: 'assembly', itemId: it.id, name: it.name || 'Gruppe', children };
    };

    const roots = [];
    const byItemId = new Map();
    for (const e of evald) {
      const it = e.it;
      if (it.role === 'hole' || consumed.has(it.id) || !e.shape) continue;
      if (keep && !keep.has(it.id)) continue;
      let node = null;
      if (canDecomposeGroup(it, true)) {
        const grp = buildGroupExport(it, null, topHoles);
        if (grp.children.length) node = grp;
      }
      if (!node) {
        let world = applyMatrix(e.shape, it.m);
        world = cutHoles(world, topHoles);
        const hasBodyMeta = Array.isArray(it.bodies) && it.bodies.some((b) => b && (b.hidden || b.name || b.color));
        if (hasBodyMeta) {
          const parts = sortedSolids(world, matInvRigid(it.m));
          if (parts.length > 1) {
            const meta = matchBodiesLocal(it.bodies, parts);
            const subParts = [];
            for (let bi = 0; bi < parts.length; bi++) {
              const mb = meta[bi];
              if (mb && mb.hidden) { safeDelete(parts[bi].shape); continue; }
              let ps = applyOrigin(parts[bi].shape);
              ownedShapes.push(ps);
              subParts.push({
                type: 'part',
                name: (mb && mb.name) ? mb.name : ((it.name || 'Körper') + ' – Körper ' + (bi + 1)),
                color: (mb && mb.color) ? mb.color : (it.color || '#2f9e91'),
                alpha: it.opacity != null ? it.opacity : 1,
                shape: ps,
              });
            }
            safeDelete(world);
            if (!subParts.length) continue;
            if (it.bodies.some((b) => b && (b.name || b.color))) {
              node = { type: 'assembly', itemId: it.id, name: it.name || 'Teil', children: subParts };
            } else {
              const combined = subParts.length === 1 ? subParts[0].shape : R.makeCompound(subParts.map((sp) => sp.shape));
              if (subParts.length > 1) ownedShapes.push(combined);
              node = { type: 'part', itemId: it.id, name: it.name || 'Teil', color: it.color || '#2f9e91', alpha: it.opacity != null ? it.opacity : 1, shape: combined };
            }
          } else {
            for (const p of parts) safeDelete(p.shape);
          }
        }
        if (!node) {
          world = applyOrigin(world);
          ownedShapes.push(world);
          node = { type: 'part', itemId: it.id, name: it.name || 'Teil', color: it.color || '#2f9e91', alpha: it.opacity != null ? it.opacity : 1, shape: world };
        }
      }
      roots.push(node);
      if (node.itemId) byItemId.set(node.itemId, node);
    }
    if (!roots.length) {
      for (const s of ownedShapes) safeDelete(s);
      throw new Error('Es gibt nichts zu exportieren.');
    }

    // Ordner auf oberster Ebene als Baugruppen zusammenfassen
    let finalRoots = roots;
    if (Array.isArray(scene.folders) && scene.folders.length) {
      const folderOfNode = new Map();
      for (const fld of scene.folders) {
        const mems = (fld.ids || []).map((id) => byItemId.get(id)).filter(Boolean);
        if (!mems.length) continue;
        for (const m of mems) folderOfNode.set(m, fld);
      }
      const emittedFolders = new Set();
      finalRoots = [];
      for (const node of roots) {
        const fld = folderOfNode.get(node);
        if (!fld) { finalRoots.push(node); continue; }
        if (emittedFolders.has(fld.id)) continue;
        emittedFolders.add(fld.id);
        const children = (fld.ids || []).map((id) => byItemId.get(id)).filter(Boolean);
        finalRoots.push({ type: 'assembly', name: fld.name || 'Ordner', children });
      }
    }

    const wrapStr = (s) => new oc.TCollection_ExtendedString(String(s || ''), true);
    const toRelease = [];
    const track = (x) => { if (x) toRelease.push(x); return x; };
    const fn = 'export_' + Math.random().toString(36).slice(2) + '.step';
    try {
      const docStr = track(wrapStr('XmlOcaf'));
      const doc = track(new oc.TDocStd_Document(docStr));
      oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
      const mainLabel = track(doc.Main());
      const st = track(oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel));
      const ct = track(oc.XCAFDoc_DocumentTool.ColorTool(mainLabel));
      const idLoc = track(new oc.TopLoc_Location());
      const surfType = oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf;

      const addNode = (node, parentLabel) => {
        if (node.type === 'assembly') {
          const asmL = track(st.NewShape());
          const nStr = track(wrapStr(node.name || 'Gruppe'));
          oc.TDataStd_Name.Set(asmL, nStr);
          for (const ch of node.children || []) addNode(ch, asmL);
          if (parentLabel) {
            const compL = track(st.AddComponent(parentLabel, asmL, idLoc));
            const cnStr = track(wrapStr(node.name || 'Gruppe'));
            oc.TDataStd_Name.Set(compL, cnStr);
          }
          return asmL;
        }
        const lbl = track(st.NewShape());
        st.SetShape(lbl, node.shape.wrapped);
        const nStr = track(wrapStr(node.name || 'Teil'));
        oc.TDataStd_Name.Set(lbl, nStr);
        const rgba = track(hexToLinearRGBA(node.color, node.alpha));
        ct.SetColor(lbl, rgba, surfType);
        if (parentLabel) {
          const compL = track(st.AddComponent(parentLabel, lbl, idLoc));
          const cnStr = track(wrapStr(node.name || 'Teil'));
          oc.TDataStd_Name.Set(compL, cnStr);
        }
        return lbl;
      };

      for (const r of finalRoots) addNode(r, null);
      st.UpdateAssemblies();

      const dummy = track(new oc.STEPCAFControl_Writer());
      oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
      oc.Interface_Static.SetCVal('write.step.unit', 'MM');
      const session = track(new oc.XSControl_WorkSession());
      const writer = track(new oc.STEPCAFControl_Writer(session, false));
      writer.SetColorMode(true);
      writer.SetLayerMode(true);
      writer.SetNameMode(true);
      oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
      oc.Interface_Static.SetIVal('write.precision.mode', 0);
      oc.Interface_Static.SetIVal('write.step.assembly', 2);
      oc.Interface_Static.SetIVal('write.step.schema', 5);
      const progress = track(new oc.Message_ProgressRange());
      const ok = writer.Perform(doc, fn, progress);
      if (!ok) throw new Error('Die STEP-Datei konnte nicht geschrieben werden.');
      const file = oc.FS.readFile('/' + fn);
      return new Blob([file], { type: 'application/STEP' });
    } finally {
      try { oc.FS.unlink('/' + fn); } catch (_) {}
      for (let i = toRelease.length - 1; i >= 0; i--) safeDelete(toRelease[i]);
      for (const s of ownedShapes) safeDelete(s);
    }
  }
  function collectExportShape(scene, only, originMat = null) {
    ingestBlobs(scene);
    const errors = [];
    let solids = evaluateShapes(scene, errors);
    if (only && only.length) { const keep = new Set(only); for (const s of solids) if (!keep.has(s.id)) s.shape.delete(); solids = solids.filter((s) => keep.has(s.id)); }
    const filtered = [];
    for (const s of solids) {
      if (s.bodies && s.bodies.some((b) => b && b.hidden)) {
        const parts = sortedSolids(s.shape, matInvRigid(s.m));
        if (parts.length > 1) {
          const meta = matchBodiesLocal(s.bodies, parts);
          const kept = [];
          for (let bi = 0; bi < parts.length; bi++) {
            if (meta[bi] && meta[bi].hidden) safeDelete(parts[bi].shape);
            else kept.push(parts[bi].shape);
          }
          safeDelete(s.shape);
          if (!kept.length) continue;
          s.shape = kept.length === 1 ? kept[0] : R.makeCompound(kept);
        } else {
          for (const p of parts) safeDelete(p.shape);
        }
      }
      filtered.push(s);
    }
    solids = filtered;
    if (!solids.length) throw new Error('Es gibt nichts zu exportieren.');
    if (Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat)) {
      for (const s of solids) {
        const tr = applyMatrix(s.shape, originMat);
        s.shape.delete();
        s.shape = tr;
      }
    }
    const comp = solids.length === 1 ? solids[0].shape : R.makeCompound(solids.map((s) => s.shape));
    return { comp, solids };
  }
  function freeExportShape({ comp, solids }) {
    if (solids.length > 1) safeDelete(comp);
    for (const s of solids) safeDelete(s.shape);
  }
  function exportIGES(scene, only, originMat = null) {
    const ex = collectExportShape(scene, only, originMat);
    try { return new Blob([shapeToIGES(ex.comp)], { type: 'model/iges' }); } finally { freeExportShape(ex); }
  }
  function exportBREP(scene, only, originMat = null) {
    const ex = collectExportShape(scene, only, originMat);
    try {
      const str = oc.BRepToolsWrapper.Write(ex.comp.wrapped);
      if (!str || !str.length) throw new Error('BREP-Export fehlgeschlagen.');
      return new Blob([str], { type: 'text/plain' });
    } finally { freeExportShape(ex); }
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
  function projectEdgesSplit(shape, cam) {
    const getE = (comp) => {
      if (!comp || comp.IsNull()) return [];
      const s = R.cast(comp);
      const edges = s.edges;
      const res = [];
      for (const e of edges) {
        oc.BRepLib.BuildCurves3d(e.wrapped);
        res.push(edge2d(e));
      }
      return res;
    };
    const hlr = new oc.HLRBRep_Algo();
    const projector = new oc.HLRAlgo_Projector(cam.wrapped);
    let hlrShapes = null;
    try {
      hlr.Add(shape.wrapped, 0);
      hlr.Projector(projector);
      hlr.Update();
      hlr.Hide();
      hlrShapes = new oc.HLRBRep_HLRToShape(hlr);
      return {
        visible: [...getE(hlrShapes.VCompound()), ...getE(hlrShapes.OutLineVCompound())],
        tangentVisible: getE(hlrShapes.Rg1LineVCompound()),
        hidden: [...getE(hlrShapes.HCompound()), ...getE(hlrShapes.OutLineHCompound())],
        tangentHidden: getE(hlrShapes.Rg1LineHCompound()),
      };
    } finally {
      safeDelete(hlrShapes);
      safeDelete(projector);
      safeDelete(hlr);
    }
  }
  function polyArea2D(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a * 0.5;
  }
  function pointInPoly2D(pt, poly) {
    let inside = false;
    const x = pt[0], y = pt[1];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function interiorPoint2D(outer, holes = []) {
    const loops = [outer, ...holes];
    const ys = [];
    for (const lp of loops) for (const p of lp) ys.push(p[1]);
    ys.sort((a, b) => a - b);
    let yTest = (ys[0] + ys[ys.length - 1]) / 2;
    let bestGap = -1;
    for (let i = 1; i < ys.length; i++) {
      const gap = ys[i] - ys[i - 1];
      if (gap > bestGap) { bestGap = gap; yTest = (ys[i - 1] + ys[i]) * 0.5; }
    }
    const xs = [];
    for (const lp of loops) {
      for (let i = 0, n = lp.length; i < n; i++) {
        const a = lp[i], b = lp[(i + 1) % n];
        if ((a[1] <= yTest && b[1] > yTest) || (b[1] <= yTest && a[1] > yTest)) {
          xs.push(a[0] + ((yTest - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2) return [(xs[0] + xs[1]) * 0.5, yTest];
    return outer[0];
  }
  function wireToPoly2D(wire, sx, sy) {
    const segs = [];
    const proj = (p) => [dot(p, sx), dot(p, sy)];
    for (const e of wire.edges) {
      const t = e.geomType;
      if (t === 'LINE') {
        segs.push([proj(vec(e.startPoint)), proj(vec(e.endPoint))]);
      } else {
        const L = e.length;
        const N = Math.max(8, Math.min(96, Math.ceil(L / 0.8)));
        const pts = [];
        for (let i = 0; i <= N; i++) pts.push(proj(vec(e.pointAt(i / N))));
        segs.push(pts);
      }
    }
    if (!segs.length) return [];
    const tol = 0.05;
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const used = new Array(segs.length).fill(false);
    const polys = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const chain = segs[i].slice();
      for (;;) {
        const head = chain[0], tail = chain[chain.length - 1];
        if (chain.length >= 3 && d2(head, tail) <= tol * tol) break;
        let best = -1, rev = false, bestD = tol * tol;
        for (let j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          const s = segs[j], s0 = s[0], s1 = s[s.length - 1];
          const d0 = d2(tail, s0), d1 = d2(tail, s1);
          if (d0 <= bestD) { bestD = d0; best = j; rev = false; }
          if (d1 <= bestD) { bestD = d1; best = j; rev = true; }
        }
        if (best < 0) break;
        used[best] = true;
        const addPts = rev ? segs[best].slice().reverse() : segs[best];
        for (let k = 1; k < addPts.length; k++) chain.push(addPts[k]);
      }
      if (chain.length > 2 && d2(chain[0], chain[chain.length - 1]) <= tol * tol) chain.pop();
      if (chain.length >= 3 && Math.abs(polyArea2D(chain)) > 1e-4) polys.push(chain);
    }
    return polys;
  }
  function faceCutPolys2D(face, sx, sy) {
    const ow = face.clone().outerWire();
    const iws = face.clone().innerWires();
    let outerList = [];
    const holes = [];
    try {
      outerList = wireToPoly2D(ow, sx, sy);
      for (const iw of iws) {
        for (const hp of wireToPoly2D(iw, sx, sy)) holes.push(hp);
      }
    } finally {
      safeDelete(ow);
      for (const iw of iws) safeDelete(iw);
    }
    if (!outerList.length) return null;
    const outer = outerList[0];
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const p of outer) {
      if (p[0] < u0) u0 = p[0]; if (p[0] > u1) u1 = p[0];
      if (p[1] < v0) v0 = p[1]; if (p[1] > v1) v1 = p[1];
    }
    return { outer, holes, bbox: [u0, v0, u1, v1] };
  }
  function projectSectionOnSolids(solids, sec, sceneDiag) {
    const dir = norm(sec.dir), x = norm(sec.x), y = norm(cross(dir, x)), o = sec.o || [0, 0, 0];
    const M = Math.max(100, (sceneDiag || 100) * 4 + 100);
    const mat = [
      x[0], x[1], x[2], 0,
      y[0], y[1], y[2], 0,
      dir[0], dir[1], dir[2], 0,
      o[0], o[1], o[2], 1,
    ];
    let keepLocal = null, keepBox = null, remLocal = null, remBox = null, cutShape = null, cam = null;
    const cutParts = [];
    const caps = [];
    try {
      keepLocal = R.makeBox([-M, -M, -M], [M, M, 0]);
      keepBox = applyMatrix(keepLocal, mat);
      for (let partIdx = 0; partIdx < solids.length; partIdx++) {
        const s = solids[partIdx];
        const bb = bboxOf(s.shape);
        let wMin = Infinity, wMax = -Infinity;
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
          const p = [ix ? bb[3] : bb[0], iy ? bb[4] : bb[1], iz ? bb[5] : bb[2]];
          const w = dot(sub(p, o), dir);
          if (w < wMin) wMin = w;
          if (w > wMax) wMax = w;
        }
        if (wMin > 1e-4) continue; // komplett auf der weggeschnittenen Seite
        let cs = null;
        try { cs = s.shape.intersect(keepBox); } catch (_) { cs = null; }
        if (!cs) continue;
        let cbb;
        try { cbb = bboxOf(cs); } catch (_) { cbb = null; }
        if (!cbb || (cbb[3] - cbb[0] < 1e-5 && cbb[4] - cbb[1] < 1e-5 && cbb[5] - cbb[2] < 1e-5)) {
          safeDelete(cs); continue;
        }
        cutParts.push(cs);
        if (wMin < -1e-4 && wMax > 1e-4) {
          // Prüfe, ob der Ausgangskörper bereits eine streifende Außenfläche genau auf der Schnittebene hat
          let hasGrazing = false;
          for (const f of s.shape.faces) {
            if (f.geomType !== 'PLANE') continue;
            try {
              const c = f.center, n = f.normalAt();
              if (Math.abs(dot(sub([c.x, c.y, c.z], o), dir)) < 0.02 && dot([n.x, n.y, n.z], dir) > 0.999) {
                hasGrazing = true; break;
              }
            } catch (_) {}
          }
          let remPolys = null;
          if (hasGrazing) {
            if (!remBox) {
              remLocal = R.makeBox([-M, -M, 0], [M, M, M]);
              remBox = applyMatrix(remLocal, mat);
            }
            let rs = null;
            try { rs = s.shape.intersect(remBox); } catch (_) { rs = null; }
            if (rs) {
              remPolys = [];
              for (const rf of rs.faces) {
                if (rf.geomType !== 'PLANE') continue;
                try {
                  const rc = rf.center, rn = rf.normalAt();
                  if (Math.abs(dot(sub([rc.x, rc.y, rc.z], o), dir)) < 0.02 && dot([rn.x, rn.y, rn.z], dir) < -0.999) {
                    const rp = faceCutPolys2D(rf, x, y);
                    if (rp) remPolys.push(rp);
                  }
                } catch (_) {}
              }
              safeDelete(rs);
            }
          }
          for (const f of cs.faces) {
            if (f.geomType !== 'PLANE') continue;
            try {
              const c = f.center, n = f.normalAt();
              if (Math.abs(dot(sub([c.x, c.y, c.z], o), dir)) >= 0.02 || dot([n.x, n.y, n.z], dir) <= 0.999) continue;
              const poly = faceCutPolys2D(f, x, y);
              if (!poly) continue;
              if (remPolys) {
                const pt = interiorPoint2D(poly.outer, poly.holes);
                const inRem = remPolys.some((rp) => pointInPoly2D(pt, rp.outer) && !rp.holes.some((h) => pointInPoly2D(pt, h)));
                if (!inRem) continue;
              }
              caps.push({ ...poly, partIdx });
            } catch (_) {}
          }
        }
      }
      if (!cutParts.length) return { visible: [], hidden: [], caps: [], dir, x, y, o };
      cutShape = cutParts[0];
      for (let i = 1; i < cutParts.length; i++) {
        try {
          const fused = cutShape.fuse(cutParts[i]);
          if (cutShape !== cutParts[0]) safeDelete(cutShape);
          cutShape = fused;
        } catch (_) {
          const comp = R.makeCompound([cutShape, cutParts[i]]);
          if (cutShape !== cutParts[0]) safeDelete(cutShape);
          cutShape = comp;
        }
      }
      cam = new R.ProjectionCamera([0, 0, 0], dir, x);
      const { visible, hidden } = R.makeProjectedEdges(cutShape, cam);
      return { visible: visible.map(edge2d), hidden: hidden.map(edge2d), caps, dir, x, y, o };
    } finally {
      if (cam) try { cam.delete(); } catch (_) {}
      if (cutShape && !cutParts.includes(cutShape)) safeDelete(cutShape);
      for (const p of cutParts) safeDelete(p);
      safeDelete(keepBox);
      safeDelete(keepLocal);
      safeDelete(remBox);
      safeDelete(remLocal);
    }
  }
  function project(scene, views = [], sections = []) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    if (!solids.length) return { views: {}, axes: [], sections: {}, errors };
    let sb = bboxOf(solids[0].shape);
    for (let i = 1; i < solids.length; i++) {
      const b = bboxOf(solids[i].shape);
      sb = [Math.min(sb[0], b[0]), Math.min(sb[1], b[1]), Math.min(sb[2], b[2]), Math.max(sb[3], b[3]), Math.max(sb[4], b[4]), Math.max(sb[5], b[5])];
    }
    const sceneDiag = Math.hypot(sb[3] - sb[0], sb[4] - sb[1], sb[5] - sb[2]) || 100;
    const secOut = {};
    if (Array.isArray(sections) && sections.length) {
      for (const sec of sections) {
        if (!sec || !sec.dir || !sec.x) continue;
        secOut[sec.key || sec.id] = projectSectionOnSolids(solids, sec, sceneDiag);
      }
    }
    const out = {};
    const axes = [];
    let bbox = sb;
    if (Array.isArray(views) && views.length) {
      let shape = solids[0].shape;
      for (let i = 1; i < solids.length; i++) {
        try {
          const f = shape.fuse(solids[i].shape);
          if (shape !== solids[0].shape) safeDelete(shape);
          shape = f;
        } catch (_) {
          const c = R.makeCompound([shape, solids[i].shape]);
          if (shape !== solids[0].shape) safeDelete(shape);
          shape = c;
        }
      }
      for (const entry of views) {
        let key, dir, x;
        if (typeof entry === 'string') {
          const v = VIEWS[entry]; if (!v) continue;
          key = entry; dir = v.dir; x = v.x;
        } else if (entry && entry.key && Array.isArray(entry.dir)) {
          key = String(entry.key);
          const dl = Math.hypot(entry.dir[0], entry.dir[1], entry.dir[2]);
          if (dl < 1e-8) continue;
          dir = norm(entry.dir);
          let x0 = Array.isArray(entry.x) ? sub(entry.x, mul(dir, dot(entry.x, dir))) : [0, 0, 0];
          if (Math.hypot(x0[0], x0[1], x0[2]) < 1e-6) x0 = cross(Math.abs(dir[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1], dir);
          x = norm(x0);
        } else continue;
        const cam = new R.ProjectionCamera([0, 0, 0], dir, x);
        const res = projectEdgesSplit(shape, cam);
        out[key] = { ...res, dir, x, y: cross(dir, x) };
        cam.delete();
      }
      // Achsen von Zylinderflächen für Mittellinien (robust auch bei geteilten Vollzylindern)
      const cylGroups = [];
      const mergeAngleIvs = (ivs) => {
        const sorted = ivs.slice().sort((a, b) => a[0] - b[0]);
        const out = [];
        for (const [s, e] of sorted) {
          const last = out[out.length - 1];
          if (last && s <= last[1] + 0.05) last[1] = Math.max(last[1], e);
          else out.push([s, e]);
        }
        return out.reduce((sum, [s, e]) => sum + (e - s), 0);
      };
      for (const f of shape.faces) {
        if (f.geomType !== 'CYLINDRE') continue;
        try {
          const ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
          const cy = ad.Cylinder(); const ax = cy.Axis(); const l = ax.Location(), d = ax.Direction();
          let dir = norm([d.X(), d.Y(), d.Z()]);
          const r = cy.Radius();
          const loc = [l.X(), l.Y(), l.Z()];
          ad.delete();
          if (Math.abs(dir[2]) > 1e-5 ? dir[2] < 0 : Math.abs(dir[1]) > 1e-5 ? dir[1] < 0 : dir[0] < 0) {
            dir = mul(dir, -1);
          }
          const o = sub(loc, mul(dir, dot(loc, dir)));
          let tmin = Infinity, tmax = -Infinity, peFallback = null;
          for (const e of f.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const p = vec(e.pointAt(t));
            const s = dot(sub(p, o), dir);
            tmin = Math.min(tmin, s); tmax = Math.max(tmax, s);
            if (!peFallback) peFallback = p;
          }
          if (!isFinite(tmin) || tmax - tmin < 1e-4) continue;
          let uSpan = Math.PI * 2;
          try { const uv = f.UVBounds; uSpan = Math.abs(uv.uMax - uv.uMin); } catch (_) {}
          let pMid = peFallback;
          try { const mp = f.pointOnSurface(0.5, 0.5); pMid = [mp.x, mp.y, mp.z]; } catch (_) {}
          let kind = 'cyl';
          if (pMid) {
            const foot = add(o, mul(dir, dot(sub(pMid, o), dir)));
            const rad = sub(pMid, foot);
            try {
              const n = f.normalAt(pMid);
              if (dot([n.x, n.y, n.z], rad) < 0) kind = 'hole';
            } catch (_) {}
          }
          const angleIvs = [];
          if (uSpan < Math.PI * 1.9 && pMid) {
            const ref = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
            const uAx = norm(cross(dir, ref)), vAx = cross(dir, uAx);
            const foot = add(o, mul(dir, dot(sub(pMid, o), dir)));
            const rad = sub(pMid, foot);
            const phi = Math.atan2(dot(rad, vAx), dot(rad, uAx));
            const half = Math.min(Math.PI, uSpan * 0.5);
            const TWO_PI = Math.PI * 2;
            let a0 = phi - half, a1 = phi + half;
            while (a0 < 0) { a0 += TWO_PI; a1 += TWO_PI; }
            while (a0 >= TWO_PI) { a0 -= TWO_PI; a1 -= TWO_PI; }
            if (a1 <= TWO_PI) angleIvs.push([a0, a1]);
            else { angleIvs.push([a0, TWO_PI], [0, a1 - TWO_PI]); }
          }
          let grp = cylGroups.find((g) => Math.abs(g.r - r) <= 0.02 && Math.abs(dot(g.d, dir)) > 0.9995 && Math.hypot(...sub(g.o, o)) <= 0.02);
          if (!grp) {
            grp = { o, d: dir, r, t0: tmin, t1: tmax, kind, full: false, ivs: [] };
            cylGroups.push(grp);
          } else {
            grp.t0 = Math.min(grp.t0, tmin);
            grp.t1 = Math.max(grp.t1, tmax);
            if (kind === 'cyl') grp.kind = 'cyl';
          }
          if (uSpan >= Math.PI * 1.9) grp.full = true;
          else grp.ivs.push(...angleIvs);
        } catch (_) {}
      }
      const fullAxes = [];
      for (const g of cylGroups) {
        if (!g.full && mergeAngleIvs(g.ivs) < Math.PI * 1.85) continue;
        const hit = fullAxes.find((a) => Math.abs(dot(a.d, g.d)) > 0.9995 && Math.hypot(...sub(a.o, g.o)) <= 0.02 && g.t0 <= a.t1 + 0.5 && g.t1 >= a.t0 - 0.5);
        if (hit) {
          hit.r = Math.max(hit.r, g.r);
          hit.t0 = Math.min(hit.t0, g.t0);
          hit.t1 = Math.max(hit.t1, g.t1);
          if (g.kind === 'cyl') hit.kind = 'cyl';
        } else {
          fullAxes.push({ o: g.o, d: g.d, r: g.r, t0: g.t0, t1: g.t1, kind: g.kind });
        }
      }
      fullAxes.sort((a, b) => (a.o[0] - b.o[0]) || (a.o[1] - b.o[1]) || (a.o[2] - b.o[2]) || (a.d[0] - b.d[0]) || (a.d[1] - b.d[1]) || (a.d[2] - b.d[2]) || (a.r - b.r));
      for (const a of fullAxes) axes.push(a);
      bbox = bboxOf(shape);
      if (shape && !solids.some((s) => s.shape === shape)) safeDelete(shape);
    }
    for (const s of solids) safeDelete(s.shape);
    return { views: out, axes, bbox, sections: secOut, errors };
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
  // Geometrie-Prüfung (PF-08): kaputte Flächen, winzige Kanten (< minEdge) und sich selbst schneidende Flächen
  function shrinkTriPts(a, b, c, f = 0.015) {
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3, s = 1 - f;
    return [
      [cx + (a[0] - cx) * s, cy + (a[1] - cy) * s, cz + (a[2] - cz) * s],
      [cx + (b[0] - cx) * s, cy + (b[1] - cy) * s, cz + (b[2] - cz) * s],
      [cx + (c[0] - cx) * s, cy + (c[1] - cy) * s, cz + (c[2] - cz) * s],
    ];
  }
  function segTriStrictHit(p0, p1, a, b, c) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    const sx = p0[0] - a[0], sy = p0[1] - a[1], sz = p0[2] - a[2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u <= 0.015 || u >= 0.985) return null;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v <= 0.015 || u + v >= 0.985) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t <= 0.015 || t >= 0.985) return null;
    return [p0[0] + t * dx, p0[1] + t * dy, p0[2] + t * dz];
  }
  function triTriStrictHit(A, B) {
    const a = shrinkTriPts(A[0], A[1], A[2]);
    const b = shrinkTriPts(B[0], B[1], B[2]);
    return segTriStrictHit(a[0], a[1], b[0], b[1], b[2])
      || segTriStrictHit(a[1], a[2], b[0], b[1], b[2])
      || segTriStrictHit(a[2], a[0], b[0], b[1], b[2])
      || segTriStrictHit(b[0], b[1], a[0], a[1], a[2])
      || segTriStrictHit(b[1], b[2], a[0], a[1], a[2])
      || segTriStrictHit(b[2], b[0], a[0], a[1], a[2]);
  }
  function findSelfIntersections(shape, fl, cachedPayload) {
    let V, T, fg;
    let ownsMesh = null;
    if (cachedPayload && cachedPayload.vertices && cachedPayload.triangles && cachedPayload.faceGroups) {
      V = cachedPayload.vertices; T = cachedPayload.triangles; fg = cachedPayload.faceGroups;
    } else {
      const bb = bboxOf(shape);
      const tol = Math.max(0.02, meshTol(bb));
      ownsMesh = shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
      V = ownsMesh.vertices; T = ownsMesh.triangles;
      const fIndex = new Map(fl.map((f, i) => [f.hc, i]));
      fg = ownsMesh.faceGroups.map((g) => [g.start, g.count, fIndex.has(g.faceId) ? fIndex.get(g.faceId) : -1]);
    }
    try {
      const nt = Math.floor(T.length / 3);
      if (nt < 2) return [];
      const triFace = new Int32Array(nt).fill(-1);
      for (const [start, count, fi] of fg) {
        const end = Math.min(T.length, start + count);
        for (let k = start; k + 2 < end; k += 3) triFace[Math.floor(k / 3)] = fi;
      }
      const tris = new Array(nt);
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < nt; i++) {
        const i0 = T[i * 3] * 3, i1 = T[i * 3 + 1] * 3, i2 = T[i * 3 + 2] * 3;
        const p0 = [V[i0], V[i0 + 1], V[i0 + 2]];
        const p1 = [V[i1], V[i1 + 1], V[i1 + 2]];
        const p2 = [V[i2], V[i2 + 1], V[i2 + 2]];
        const mn = [Math.min(p0[0], p1[0], p2[0]), Math.min(p0[1], p1[1], p2[1]), Math.min(p0[2], p1[2], p2[2])];
        const mx = [Math.max(p0[0], p1[0], p2[0]), Math.max(p0[1], p1[1], p2[1]), Math.max(p0[2], p1[2], p2[2])];
        if (mn[0] < minX) minX = mn[0]; if (mn[1] < minY) minY = mn[1]; if (mn[2] < minZ) minZ = mn[2];
        if (mx[0] > maxX) maxX = mx[0]; if (mx[1] > maxY) maxY = mx[1]; if (mx[2] > maxZ) maxZ = mx[2];
        tris[i] = { p: [p0, p1, p2], f: triFace[i], mn, mx };
      }
      const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
      const cell = Math.max(diag / 32, 0.5);
      const grid = new Map();
      const ci = (v, o) => Math.floor((v - o) / cell);
      for (let i = 0; i < nt; i++) {
        const t = tris[i];
        const x0 = ci(t.mn[0], minX), x1 = Math.min(x0 + 7, ci(t.mx[0], minX));
        const y0 = ci(t.mn[1], minY), y1 = Math.min(y0 + 7, ci(t.mx[1], minY));
        const z0 = ci(t.mn[2], minZ), z1 = Math.min(z0 + 7, ci(t.mx[2], minZ));
        for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
          const kk = ix + ',' + iy + ',' + iz;
          let list = grid.get(kk);
          if (!list) { list = []; grid.set(kk, list); }
          list.push(i);
        }
      }
      const checkedPairs = new Set();
      const hitsByFacePair = new Map();
      let checks = 0;
      const MAX_CHECKS = 200000;
      for (const bucket of grid.values()) {
        if (bucket.length < 2) continue;
        for (let a = 0; a < bucket.length; a++) {
          const i = bucket[a], A = tris[i];
          for (let b = a + 1; b < bucket.length; b++) {
            if (checks >= MAX_CHECKS || hitsByFacePair.size >= 30) break;
            const j = bucket[b];
            const lo = i < j ? i : j, hi = i < j ? j : i;
            const pk = lo * nt + hi;
            if (checkedPairs.has(pk)) continue;
            checkedPairs.add(pk);
            const B = tris[j];
            if (A.mx[0] < B.mn[0] || B.mx[0] < A.mn[0] || A.mx[1] < B.mn[1] || B.mx[1] < A.mn[1] || A.mx[2] < B.mn[2] || B.mx[2] < A.mn[2]) continue;
            let shared = false;
            for (let u = 0; u < 3 && !shared; u++) {
              const pa = A.p[u];
              for (let v = 0; v < 3; v++) {
                const pb = B.p[v];
                if (Math.abs(pa[0] - pb[0]) < 1e-5 && Math.abs(pa[1] - pb[1]) < 1e-5 && Math.abs(pa[2] - pb[2]) < 1e-5) { shared = true; break; }
              }
            }
            if (shared) continue;
            checks++;
            const pt = triTriStrictHit(A.p, B.p);
            if (!pt) continue;
            const f1 = A.f >= 0 ? A.f : 0, f2 = B.f >= 0 ? B.f : f1;
            const fk = Math.min(f1, f2) + '|' + Math.max(f1, f2);
            let entry = hitsByFacePair.get(fk);
            if (!entry) { entry = { faceIdx: Math.min(f1, f2), faceIdx2: Math.max(f1, f2), sum: [0, 0, 0], n: 0 }; hitsByFacePair.set(fk, entry); }
            entry.sum[0] += pt[0]; entry.sum[1] += pt[1]; entry.sum[2] += pt[2]; entry.n++;
          }
          if (checks >= MAX_CHECKS || hitsByFacePair.size >= 30) break;
        }
        if (checks >= MAX_CHECKS || hitsByFacePair.size >= 30) break;
      }
      return [...hitsByFacePair.values()].map((e) => ({
        faceIdx: e.faceIdx,
        faceIdx2: e.faceIdx2,
        at: [e.sum[0] / e.n, e.sum[1] / e.n, e.sum[2] / e.n],
      }));
    } finally {
      if (ownsMesh && ownsMesh.delete) safeDelete(ownsMesh);
    }
  }
  function checkGeometry(scene, opts = {}) {
    ingestBlobs(scene);
    const errors = [];
    const minEdge = typeof opts.minEdge === 'number' && opts.minEdge > 0 ? opts.minEdge : 0.01;
    const keys = (opts && opts.keys) || {};
    const items = (scene && Array.isArray(scene.items)) ? scene.items : [];
    const byId = new Map(items.map((it) => [it.id, it]));
    const targets = [];
    const seenIds = new Set();
    let needEval = Object.keys(keys).length === 0;
    for (const [id, k] of Object.entries(keys)) {
      const it = byId.get(id);
      if (!it || it.hidden || it.suppressed || it.role === 'hole') continue;
      const ce = cache.get(k);
      if (ce && ce.shape) {
        ce.gen = gen;
        targets.push({ id, key: k, m: it.m, shape: ce.shape, ownsShape: false });
        seenIds.add(id);
      } else {
        needEval = true;
      }
    }
    if (needEval) {
      const { evald, consumed } = evalSceneCore(scene, errors);
      const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
      for (const e of evald) {
        const it = e.it;
        if (!e.shape || it.hidden || it.suppressed || it.role === 'hole' || consumed.has(it.id) || seenIds.has(it.id)) continue;
        let result = e.shape, resultKey = e.key, ownsShape = false;
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
            } catch (_) {
              result = e.shape; resultKey = e.key;
            }
          }
        }
        targets.push({ id: it.id, key: resultKey, m: it.m, shape: result, ownsShape });
        seenIds.add(it.id);
      }
    }
    const issues = [];
    let truncated = false;
    const worldCenterOf = (shape, m) => {
      try {
        const bb = bboxOf(shape);
        return transformPoint(m, [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2]);
      } catch (_) {
        return transformPoint(m, [0, 0, 0]);
      }
    };
    for (const t of targets) {
      const { id, key, m, shape, ownsShape } = t;
      const fl = topoList(shape, 'face'), el = topoList(shape, 'edge'), seams = seamHashes(fl);
      const shapeCenter = worldCenterOf(shape, m);
      let bodyBadFaces = 0;
      const an = new oc.BRepCheck_Analyzer(shape.wrapped, true);
      try {
        for (let fi = 0; fi < fl.length; fi++) {
          const f = fl[fi].shape;
          let valid = true;
          try { valid = !!an.IsValid(f.wrapped); } catch (_) { valid = false; }
          let area = NaN;
          try { area = R.measureArea(f); } catch (_) {}
          let surfOk = true;
          try { oc.BRep_Tool.Surface(f.wrapped); } catch (_) { surfOk = false; }
          if (!valid || !surfOk || !Number.isFinite(area) || area < 1e-6) {
            bodyBadFaces++;
            let fb = null, lc = null;
            try { fb = bboxOf(f); } catch (_) {}
            try { const fc = f.center; lc = [fc.x, fc.y, fc.z]; } catch (_) { lc = fb ? [(fb[0] + fb[3]) / 2, (fb[1] + fb[4]) / 2, (fb[2] + fb[5]) / 2] : [0, 0, 0]; }
            const at = transformPoint(m, lc);
            const worldBB = fb ? bboxTransform(fb, m) : null;
            issues.push({
              kind: 'badFace', s: 'bad', itemId: id, faceIdx: fi,
              reason: !valid || !surfOk ? 'invalid' : 'degenerate',
              area: Number.isFinite(area) ? area : 0, at, bbox: worldBB,
            });
          }
        }
        let wholeValid = true;
        try { wholeValid = !!an.IsValid(); } catch (_) { wholeValid = false; }
        if (!wholeValid && bodyBadFaces === 0) {
          let sb = null;
          try { sb = bboxTransform(bboxOf(shape), m); } catch (_) {}
          issues.push({ kind: 'badFace', s: 'bad', itemId: id, faceIdx: -1, reason: 'shell', area: 0, at: shapeCenter, bbox: sb });
        }
      } finally {
        an.delete();
      }
      let tinyCount = 0;
      for (let ei = 0; ei < el.length; ei++) {
        const edge = el[ei].shape, ew = edge.wrapped;
        if (oc.BRep_Tool.Degenerated(ew) || seams.has(el[ei].hc)) continue;
        let eLen = NaN;
        try { eLen = edge.length; } catch (_) {}
        if (!Number.isFinite(eLen)) {
          issues.push({ kind: 'badFace', s: 'bad', itemId: id, faceIdx: -1, edgeIdx: ei, reason: 'invalidEdge', area: 0, at: shapeCenter });
          continue;
        }
        if (eLen < minEdge) {
          if (tinyCount >= 50) { truncated = true; continue; }
          tinyCount++;
          let a, b, mid;
          try { a = vec(edge.startPoint); } catch (_) { a = [0, 0, 0]; }
          try { b = vec(edge.endPoint); } catch (_) { b = a.slice(); }
          try { mid = vec(edge.pointAt(0.5)); } catch (_) { mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
          issues.push({
            kind: 'tinyEdge', s: 'warn', itemId: id, edgeIdx: ei, length: eLen,
            a: transformPoint(m, a), b: transformPoint(m, b), at: transformPoint(m, mid),
          });
        }
      }
      try {
        const cached = key ? meshCache.get(key + '|' + Q.level) : null;
        const selfHits = findSelfIntersections(shape, fl, cached);
        for (const h of selfHits) {
          issues.push({
            kind: 'selfIntersect', s: 'bad', itemId: id,
            faceIdx: h.faceIdx, faceIdx2: h.faceIdx2, at: transformPoint(m, h.at),
          });
        }
      } catch (_) {}
      for (const f of fl) f.shape.delete();
      for (const x of el) x.shape.delete();
      if (ownsShape) safeDelete(shape);
    }
    const order = { badFace: 0, selfIntersect: 1, tinyEdge: 2 };
    issues.sort((a, b) => (order[a.kind] - order[b.kind]) || ((a.length || 0) - (b.length || 0)));
    return { issues, checkedCount: targets.length, minEdge, truncated, errors };
  }
  // ---------- Import prüfen & heilen (IO-10: BRepCheck, ShapeFix, Nähen mit Toleranz) ----------
  function uniqueShapes(raw, shapeEnum) {
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(raw, shapeEnum, TA.TopAbs_SHAPE);
    const buckets = new Map(), out = [];
    try {
      while (ex.More()) {
        const it = ex.Current();
        const hc = oc.ReplicadShapeHasher.HashCode(it, HMAX);
        let b = buckets.get(hc);
        if (!b) { b = []; buckets.set(hc, b); }
        if (!b.some((x) => x.IsSame(it))) { b.push(it); out.push(it); }
        ex.Next();
      }
    } finally { ex.delete(); }
    return out;
  }

  function signedVolumeOf(raw) {
    let props = null;
    try {
      props = new oc.GProp_GProps();
      oc.BRepGProp.VolumeProperties(raw, props, false, false, false);
      const m = props.Mass();
      return Number.isFinite(m) ? m : 0;
    } catch (_) { return 0; } finally { if (props) try { props.delete(); } catch (_) {} }
  }

  // Prüft innerhalb jeder Hülle über gemeinsame Kanten, ob Flächen umgekehrt orientiert sind,
  // sowie bei Volumenkörpern auf negatives Vorzeichenvolumen.
  function countInvertedFaces(raw) {
    const TA = oc.TopAbs_ShapeEnum;
    const ORI = oc.TopAbs_Orientation;
    let flippedInShell = 0;
    const shells = uniqueShapes(raw, TA.TopAbs_SHELL);
    const groups = shells.length ? shells : [raw];
    for (const grp of groups) {
      const faces = uniqueShapes(grp, TA.TopAbs_FACE);
      if (faces.length < 2) continue;
      const edgeMap = new Map();
      for (let fi = 0; fi < faces.length; fi++) {
        const exE = new oc.TopExp_Explorer(faces[fi], TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
        try {
          while (exE.More()) {
            const ed = oc.TopoDS.Edge(exE.Current());
            let degen = false;
            try { degen = oc.BRep_Tool.Degenerated(ed); } catch (_) {}
            if (!degen) {
              const ori = ed.Orientation();
              if (ori !== ORI.TopAbs_INTERNAL && ori !== ORI.TopAbs_EXTERNAL) {
                const hc = oc.ReplicadShapeHasher.HashCode(ed, HMAX);
                let arr = edgeMap.get(hc);
                if (!arr) { arr = []; edgeMap.set(hc, arr); }
                let entry = arr.find((x) => x.edge.IsSame(ed));
                if (!entry) { entry = { edge: ed, uses: [] }; arr.push(entry); }
                entry.uses.push({ fi, fwd: ori === ORI.TopAbs_FORWARD });
              }
            }
            exE.Next();
          }
        } finally { exE.delete(); }
      }
      const adj = Array.from({ length: faces.length }, () => []);
      for (const arr of edgeMap.values()) {
        for (const e of arr) {
          if (e.uses.length !== 2) continue;
          const a = e.uses[0], b = e.uses[1];
          if (a.fi === b.fi) continue;
          const consistent = a.fwd !== b.fwd;
          adj[a.fi].push([b.fi, consistent]);
          adj[b.fi].push([a.fi, consistent]);
        }
      }
      const color = new Int8Array(faces.length).fill(-1);
      for (let i = 0; i < faces.length; i++) {
        if (color[i] !== -1) continue;
        color[i] = 0;
        const q = [i];
        let c0 = 1, c1 = 0, conflict = 0;
        for (let qi = 0; qi < q.length; qi++) {
          const u = q[qi];
          for (const [v, cons] of adj[u]) {
            const want = color[u] ^ (cons ? 0 : 1);
            if (color[v] === -1) {
              color[v] = want;
              if (want === 0) c0++; else c1++;
              q.push(v);
            } else if (color[v] !== want) {
              conflict++;
            }
          }
        }
        flippedInShell += conflict > 0 ? Math.max(1, Math.min(c0, c1)) : Math.min(c0, c1);
      }
    }
    let negativeSolidFaces = 0;
    const solids = uniqueShapes(raw, TA.TopAbs_SOLID);
    for (const so of solids) {
      if (signedVolumeOf(so) < -1e-6) {
        negativeSolidFaces += Math.max(1, uniqueShapes(so, TA.TopAbs_FACE).length);
      }
    }
    return Math.max(flippedInShell, negativeSolidFaces);
  }

  function inspectImportShape(raw, gapTol = 0.5) {
    const TA = oc.TopAbs_ShapeEnum;
    const faces = uniqueShapes(raw, TA.TopAbs_FACE);
    const edges = uniqueShapes(raw, TA.TopAbs_EDGE);
    const shells = uniqueShapes(raw, TA.TopAbs_SHELL);
    const solids = uniqueShapes(raw, TA.TopAbs_SOLID);
    let brepValid = true, invalidCount = 0;
    let ana = null;
    try {
      ana = new oc.BRepCheck_Analyzer(raw, true);
      brepValid = Boolean(ana.IsValid());
      for (const list of [faces, edges, shells, solids]) {
        for (const sub of list) {
          try { if (!ana.IsValid(sub)) invalidCount++; } catch (_) {}
        }
      }
      const wires = uniqueShapes(raw, TA.TopAbs_WIRE);
      for (const w of wires) {
        try { if (!ana.IsValid(w)) invalidCount++; } catch (_) {}
      }
      if (!brepValid && invalidCount === 0) invalidCount = 1;
    } catch (_) {
      brepValid = false;
      invalidCount = Math.max(1, invalidCount);
    } finally { if (ana) try { ana.delete(); } catch (_) {} }

    let openEdges = 0, gaps = 0, multipleEdges = 0, degenerated = 0;
    let sewTight = null, sewGap = null;
    try {
      sewTight = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
      sewTight.Load(raw);
      sewTight.Perform();
      openEdges = sewTight.NbFreeEdges();
      multipleEdges = sewTight.NbMultipleEdges();
      degenerated = sewTight.NbDegeneratedShapes();
      if (openEdges > 0) {
        const gTol = Math.max(num(gapTol, 0.5), 0.05);
        sewGap = new oc.BRepBuilderAPI_Sewing(gTol, true, true, true, false);
        sewGap.Load(raw);
        sewGap.Perform();
        const freeWide = sewGap.NbFreeEdges();
        const closedBySew = Math.max(0, openEdges - freeWide);
        if (closedBySew > 0) gaps = Math.max(1, Math.round(closedBySew / 2));
      }
    } catch (_) {} finally {
      if (sewTight) try { sewTight.delete(); } catch (_) {}
      if (sewGap) try { sewGap.delete(); } catch (_) {}
    }

    let invertedFaces = 0;
    try { invertedFaces = countInvertedFaces(raw); } catch (_) {}
    const openShell = (shells.length > 0 && solids.length === 0) || (faces.length > 0 && openEdges > 0);
    const hasIssues = !brepValid || invalidCount > 0 || openEdges > 0 || gaps > 0
      || invertedFaces > 0 || multipleEdges > 0 || degenerated > 0 || openShell;

    return {
      ok: true,
      brepValid,
      hasIssues,
      faces: faces.length,
      edges: edges.length,
      shells: shells.length,
      solids: solids.length,
      openEdges,
      gaps,
      invertedFaces,
      invalidCount,
      multipleEdges,
      degenerated,
      openShell,
    };
  }

  function checkImport(p, opts = {}) {
    ingestBlobs(opts.scene || { items: [] });
    let shape = null;
    try {
      shape = buildImport(p);
      if (!shape || !shape.wrapped) return { ok: false, error: 'Keine Geometrie im Import gefunden.' };
      return inspectImportShape(shape.wrapped, num(opts.gapTol, 0.5));
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    } finally {
      safeDelete(shape);
    }
  }

  function edgeEndpoints(edge) {
    const TA = oc.TopAbs_ShapeEnum;
    const ex = new oc.TopExp_Explorer(edge, TA.TopAbs_VERTEX, TA.TopAbs_SHAPE);
    const pts = [];
    try {
      while (ex.More()) {
        const v = oc.TopoDS.Vertex(ex.Current());
        const p = oc.BRep_Tool.Pnt(v);
        pts.push([p.X(), p.Y(), p.Z()]);
        p.delete();
        ex.Next();
      }
    } finally { ex.delete(); }
    if (!pts.length) return null;
    if (pts.length === 1) return { start: pts[0], end: pts[0], closed: true };
    const a = pts[0], b = pts[pts.length - 1];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    return { start: a, end: b, closed: d < 1e-6 };
  }

  function groupFreeEdgeLoops(edges, tol) {
    const eps = Math.max(tol * 2, 0.05);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const items = edges.map((e, idx) => ({ idx, edge: e, ep: edgeEndpoints(e), used: false })).filter((x) => x.ep);
    const loops = [];
    for (const it of items) {
      if (it.used) continue;
      if (it.ep.closed) { it.used = true; loops.push([it.edge]); continue; }
      it.used = true;
      const chain = [it.edge];
      const loopStart = it.ep.start;
      let curEnd = it.ep.end;
      let closed = false;
      for (let step = 0; step < items.length; step++) {
        if (chain.length >= 2 && dist(curEnd, loopStart) <= eps) { closed = true; break; }
        let best = null, bestD = eps, flip = false;
        for (const cand of items) {
          if (cand.used || cand.ep.closed) continue;
          const d1 = dist(curEnd, cand.ep.start);
          if (d1 < bestD) { bestD = d1; best = cand; flip = false; }
          const d2 = dist(curEnd, cand.ep.end);
          if (d2 < bestD) { bestD = d2; best = cand; flip = true; }
        }
        if (!best) break;
        best.used = true;
        chain.push(best.edge);
        curEnd = flip ? best.ep.start : best.ep.end;
      }
      if (closed || (chain.length >= 2 && dist(curEnd, loopStart) <= eps)) loops.push(chain);
    }
    return loops;
  }

  function healImport(p, opts = {}) {
    const tol = Math.max(1e-5, Math.min(10, num(opts.tol, 0.1)));
    const capOpen = opts.capOpen !== false;
    let shape = null;
    const toDelete = [];
    try {
      shape = buildImport(p);
      if (!shape || !shape.wrapped) return { ok: false, error: 'Keine Geometrie im Import gefunden.' };
      const raw = shape.wrapped;
      const before = inspectImportShape(raw, Math.max(tol, 0.5));
      const TA = oc.TopAbs_ShapeEnum;

      // Phase A: Einzelflächen mit ShapeFix_Face korrigieren
      const rawFaces = uniqueShapes(raw, TA.TopAbs_FACE);
      const fixedFaces = [];
      for (const f of rawFaces) {
        let sff = null;
        try {
          sff = new oc.ShapeFix_Face(oc.TopoDS.Face(f));
          sff.SetPrecision(tol);
          sff.SetMaxTolerance(Math.max(tol * 2, 0.5));
          sff.FixOrientation();
          sff.Perform();
          const nf = sff.Face();
          fixedFaces.push(nf);
        } catch (_) {
          fixedFaces.push(f);
        } finally { if (sff) try { sff.delete(); } catch (_) {} }
      }

      // Phase B: Alle Flächen mit gewählter Toleranz nähen
      const sew = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
      toDelete.push(sew);
      sew.SetMaxTolerance(Math.max(tol * 2, 0.5));
      for (const f of fixedFaces) sew.Add(f);
      sew.Perform();
      let current = sew.SewedShape();
      let curFree = sew.NbFreeEdges();
      let cappedFaces = 0;

      // Phase C: Geschlossene Randkanten-Schleifen mit Flächen schließen
      if (capOpen && curFree > 0) {
        const freeEdges = [];
        for (let i = 1; i <= curFree; i++) freeEdges.push(sew.FreeEdge(i));
        const loops = groupFreeEdgeLoops(freeEdges, tol);
        const capFaces = [];
        for (const chain of loops) {
          let mw = null, mf = null, fill = null;
          try {
            mw = new oc.BRepBuilderAPI_MakeWire();
            for (const ed of chain) mw.Add(ed);
            if (!mw.IsDone()) continue;
            const wire = mw.Wire();
            let candidate = null;
            mf = new oc.BRepBuilderAPI_MakeFace(wire, true);
            if (mf.IsDone()) {
              candidate = mf.Face();
            } else if (chain.length >= 2 && chain.length <= 12) {
              try {
                fill = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 0.0001, 0.0001, 0.01, 0.1, 8, 9);
                for (const ed of chain) fill.Add(ed, oc.GeomAbs_Shape.GeomAbs_C0, true);
                fill.Build();
                if (fill.IsDone()) candidate = oc.TopoDS.Face(fill.Shape());
              } catch (_) {}
            }
            if (candidate) {
              let validCap = true, area = 0;
              let anaCap = null;
              try {
                anaCap = new oc.BRepCheck_Analyzer(candidate, true);
                validCap = Boolean(anaCap.IsValid());
                area = R.measureArea(R.cast(candidate));
              } catch (_) { validCap = false; } finally { if (anaCap) try { anaCap.delete(); } catch (_) {} }
              if (validCap && area > 1e-6) {
                let sff2 = null;
                try {
                  sff2 = new oc.ShapeFix_Face(candidate);
                  sff2.SetPrecision(tol);
                  sff2.FixOrientation();
                  sff2.Perform();
                  candidate = sff2.Face();
                } catch (_) {} finally { if (sff2) try { sff2.delete(); } catch (_) {} }
                capFaces.push(candidate);
              }
            }
          } catch (_) {} finally {
            if (mw) try { mw.delete(); } catch (_) {}
            if (mf) try { mf.delete(); } catch (_) {}
            if (fill) try { fill.delete(); } catch (_) {}
          }
        }
        if (capFaces.length > 0) {
          const sew2 = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
          toDelete.push(sew2);
          sew2.SetMaxTolerance(Math.max(tol * 2, 0.5));
          sew2.Add(current);
          for (const cf of capFaces) sew2.Add(cf);
          sew2.Perform();
          if (sew2.NbFreeEdges() < curFree) {
            current = sew2.SewedShape();
            curFree = sew2.NbFreeEdges();
            cappedFaces = capFaces.length;
          }
        }
      }

      // Phase D: Geschlossene Hüllen zu Volumenkörpern machen und Orientierung richten
      const shells = uniqueShapes(current, TA.TopAbs_SHELL);
      const healedParts = [];
      for (const sh of shells) {
        let sewSh = null, ms = null, sfs = null;
        try {
          sewSh = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
          sewSh.Load(sh);
          sewSh.Perform();
          if (sewSh.NbFreeEdges() === 0) {
            ms = new oc.BRepBuilderAPI_MakeSolid();
            ms.Add(oc.TopoDS.Shell(sh));
            if (ms.IsDone()) {
              let sol = ms.Solid();
              try {
                sfs = new oc.ShapeFix_Solid(sol);
                sfs.SetPrecision(tol);
                sfs.SetMaxTolerance(Math.max(tol * 2, 0.5));
                sfs.Perform();
                sol = oc.TopoDS.Solid(sfs.Solid());
              } catch (_) {}
              if (signedVolumeOf(sol) < -1e-6) {
                try { oc.BRepLib.OrientClosedSolid(sol); } catch (_) {}
                if (signedVolumeOf(sol) < -1e-6) sol = oc.TopoDS.Solid(sol.Reversed());
              }
              healedParts.push(sol);
              continue;
            }
          }
          healedParts.push(sh);
        } catch (_) {
          healedParts.push(sh);
        } finally {
          if (sewSh) try { sewSh.delete(); } catch (_) {}
          if (ms) try { ms.delete(); } catch (_) {}
          if (sfs) try { sfs.delete(); } catch (_) {}
        }
      }

      let healedRaw = current;
      let compWrap = null;
      if (healedParts.length === 1) healedRaw = healedParts[0];
      else if (healedParts.length > 1) {
        compWrap = R.makeCompound(healedParts.map((x) => R.cast(x)));
        healedRaw = compWrap.wrapped;
      }

      const after = inspectImportShape(healedRaw, Math.max(tol, 0.5));
      const brepStr = oc.BRepToolsWrapper.Write(healedRaw);
      const brepBytes = new TextEncoder().encode(brepStr);
      if (compWrap) safeDelete(compWrap);

      const improved = (after.openEdges < before.openEdges) || (after.gaps < before.gaps)
        || (after.invertedFaces < before.invertedFaces) || (after.invalidCount < before.invalidCount)
        || (after.solids > before.solids) || (!before.brepValid && after.brepValid);

      return { ok: true, before, after, tol, cappedFaces, improved, brepBytes };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    } finally {
      for (const x of toDelete) try { x.delete(); } catch (_) {}
      safeDelete(shape);
    }
  }

  return { evaluate, remesh, exportMeshes, exportSTEP, exportIGES, exportBREP, measure, minDistance, project, clashes, holeWalls, faceLoopsOf, faceGridOf, sectionOf, checkGeometry, checkImport, healImport, _cache: cache };
}
