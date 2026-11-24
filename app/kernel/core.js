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
  function cachePut(key, shape, errs, resolved, baseBox = null) { cache.set(key, { shape, gen, errs: errs && errs.length ? errs : null, resolved: resolved || null, baseBox: baseBox || null }); return shape; }

  function gc() {
    // Formen entfernen, die mehrere Durchläufe nicht gebraucht wurden
    for (const [k, e] of cache) {
      if (gen - e.gen > 6) { try { if (Array.isArray(e.shape)) e.shape.forEach(safeDelete); else e.shape.delete(); } catch (_) {} cache.delete(k); }
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
    const s = p.spec && typeof p.spec === 'object' ? { ...(SCREW[p.size] || SCREW.M3), ...p.spec } : (SCREW[p.size] || SCREW.M3);
    const tol = num(p.tol, 0);
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
    const matchFace = (f, s) => { const c = vec(f.center); return Math.hypot(c[0] - s.c[0], c[1] - s.c[1], c[2] - s.c[2]) < tol; };
    const pick = (f) => sigs.some((s) => matchFace(f, s));
    let count = 0;
    const faceArr = [];
    try { for (const f of shape.faces) { faceArr.push(f); if (pick(f)) count++; } } catch (_) {}
    const missing = [];
    sigs.forEach((s, i) => { if (!faceArr.some((f) => matchFace(f, s))) missing.push(i); });
    if (!count) { errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing: sigs.map((_, i) => i), message: 'Die offene Fläche für die Wandstärke gibt es nicht mehr.' }); return shape; }
    if (missing.length) {
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', partial: true, missing, message: `${missing.length} von ${sigs.length} offenen Flächen für die Wandstärke gibt es nicht mehr.` });
    }
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
      const shapeEdges = [];
      let count = 0;
      try { for (const e of shape.edges) { shapeEdges.push(e); if (matcher(e)) count++; } } catch (_) {}
      const missing = [];
      if (Array.isArray(fin.edges)) {
        const mids = shapeEdges.map((e) => { try { return vec(e.pointAt(0.5)); } catch (_) { return null; } });
        fin.edges.forEach((s, i) => {
          if (!s || !s.m) { missing.push(i); return; }
          const tol = 0.02 + 0.002 * num(s.l, 1);
          const ok = mids.some((m) => m && Math.hypot(m[0] - s.m[0], m[1] - s.m[1], m[2] - s.m[2]) < tol);
          if (!ok) missing.push(i);
        });
      }
      const kindTxt = fin.type === 'chamfer' ? 'Fase' : 'Rundung';
      if (!count) {
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
    }
    return keyOf({ k: it.kind, p, f: it.finishes || null, mir: it.mir || null, c: it.children ? it.children.filter((c) => !c.hidden).map((c) => [defKey(c), c.role, c.m]) : null });
  }
  function evalItem(it, errors, parentWorldM = null, ctx = null) {
    if (it.kind === 'transform' || it.kind === 'scale' || it.kind === 'thicken' || it.kind === 'rib' || it.kind === 'mirrorStep' || it.kind === 'wrap' || (it.kind === 'sweep' && it.p && it.p.wrapId)) return { shape: null, key: defKey(it) };
    const dyn = hasDynamicExtent(it);
    const W = dyn ? (parentWorldM ? matMul(parentWorldM, it.m) : it.m) : null;
    const key = dyn
      ? keyOf([defKey(it), W.map((v) => Math.round(v * 1e6) / 1e6), ctx ? ctx.poolKey : ''])
      : defKey(it);
    const hit = cacheGet(key);
    if (hit) {
      // Meldungen beim Bauen (z. B. „Rundung zu groß“) gelten weiter, auch wenn die Form aus dem Speicher kommt
      const ce = cache.get(key);
      if (ce.errs) for (const x of ce.errs) errors.push({ ...x, itemId: x.itemId === '$self' ? it.id : x.itemId });
      if (ce.resolved && ctx && ctx.resolved) {
        if (it.kind === 'group') Object.assign(ctx.resolved, ce.resolved);
        else ctx.resolved[it.id] = ce.resolved;
      }
      return { shape: hit, key, baseBox: ce.baseBox || null };
    }
    const e0 = errors.length;
    let shape, resolvedInfo = null, baseBox = null;
    try {
      if (it.kind === 'group') {
        const kids = (it.children || []).filter((c) => !c.hidden);
        const solids = [], holes = [];
        const kidById = new Map();
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
                (src.role === 'hole' ? holes : solids).push(ms);
                mirTools.push({ shape: ms });
              }
            }
            if (mirTools.length) kidById.set(c.id, { role: firstRole || c.role, tools: mirTools });
            continue;
          }
          const r = evalItem(c, errors, W, ctx);
          if (!r.shape) continue;
          const s = applyMatrix(r.shape, c.m);
          (c.role === 'hole' ? holes : solids).push(s);
          kidById.set(c.id, { role: c.role, tools: [{ shape: s }] });
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
            shape = solids[0];
            for (let i = 1; i < solids.length; i++) { const nx = shape.intersect(solids[i]); safeDelete(shape); safeDelete(solids[i]); shape = nx; }
          } else shape = fuseAll(solids, true);
          if (holes.length) { const tool = fuseAll(holes, true); const cut = shape.cut(tool); safeDelete(tool); safeDelete(shape); shape = cut; }
        } else if (holes.length) shape = fuseAll(holes, true);
        else shape = null;
        if (shape && op === 'pattern') { baseBox = bboxOf(shape); shape = patternShape(shape, it.p); }
        if (shape && op === 'split') shape = splitBody(shape, it.p);
      } else if (it.kind === 'extrude' && isDynamicExtent(it.p)) {
        const res = buildExtrudeToTarget(it, W || it.m, ctx);
        shape = res.shape;
        resolvedInfo = res.resolved;
        if (ctx && ctx.resolved && resolvedInfo) ctx.resolved[it.id] = resolvedInfo;
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
      errors.push({ itemId: it.id, code: err && (err.code === 'split' || err.code === 'ref') ? err.code : 'build', message: friendlyError(err) });
      shape = null;
    }
    if (shape) cachePut(key, shape, errors.slice(e0).map((x) => ({ ...x, itemId: x.itemId === it.id ? '$self' : x.itemId })), resolvedInfo, baseBox);
    return { shape, key, baseBox };
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
          let next = cacheGet(k);
          if (!next) {
            try {
              const idM = isIdentity(src.m);
              const wShape = idM ? src.shape : applyMatrix(src.shape, src.m);
              const center = pv === 'origin' ? [0, 0, 0] : shapeCenterOfMass(wShape, src.wb);
              const wScaled = applyScale(wShape, center, sx, sy, sz);
              if (!idM) safeDelete(wShape);
              if (idM) {
                next = wScaled;
              } else {
                next = applyMatrix(wScaled, matInvRigid(src.m));
                safeDelete(wScaled);
              }
              cachePut(k, next);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              continue;
            }
          }
          src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
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
          let shape = cacheGet(kBase), key = kBase;
          if (!shape) {
            const f = matchFace(src.shape, p.face);
            if (!f) { errors.push({ itemId: it.id, code: 'edges', message: 'Aufdicken: Die gewählte Fläche gibt es nicht mehr.' }); continue; }
            try {
              const plate = thickenFaceShape(f, dist, dir, 'new');
              if (isIdentity(rel)) shape = plate;
              else { shape = applyMatrix(plate, rel); safeDelete(plate); }
              cachePut(kBase, shape);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              continue;
            }
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
          const prevShape = src.shape, prevKey = src.key;
          const k = keyOf([src.key, 'thicken', mode, p.face, Math.round(dist * 1e6) / 1e6, dir]);
          const kPlate = keyOf([prevKey, 'thickenPlate', p.face, r6(dist), dir, mode]);
          let next = cacheGet(k);
          let plate = anyMirror ? cacheGet(kPlate) : null;
          if (!next) {
            const f = matchFace(src.shape, p.face);
            if (!f) { errors.push({ itemId: it.id, code: 'edges', message: 'Aufdicken: Die gewählte Fläche gibt es nicht mehr.' }); continue; }
            try {
              plate = thickenFaceShape(f, dist, dir, mode);
              next = mode === 'cut' ? src.shape.cut(plate) : src.shape.fuse(plate);
              if (anyMirror) cachePut(kPlate, plate);
              else safeDelete(plate);
              cachePut(k, next);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              continue;
            }
          } else if (anyMirror && !plate) {
            const f = matchFace(prevShape, p.face);
            if (f) {
              try { plate = thickenFaceShape(f, dist, dir, mode); cachePut(kPlate, plate); } catch (_) { plate = null; }
            }
          }
          if (anyMirror && plate) featureOps.set(it.id, { targetId: tid, opType: mode, tools: [{ shape: plate, m: src.m, key: kPlate }] });
          src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
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
        let next = cacheGet(k);
        if (!next) {
          try { next = buildRibOn(src.shape, rel, p); cachePut(k, next); }
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
        src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
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
        let next = cacheGet(k);
        let tool = mode !== 'line' && anyMirror ? cacheGet(kTool) : null;
        let wires = mode === 'line' ? cacheGet(kWires) : null;
        let wrapRad = next && cache.get(k)?.resolved ? cache.get(k).resolved.radius : null;
        if (!next || (mode === 'line' && !wires) || (mode !== 'line' && anyMirror && !tool)) {
          try {
            const built = buildWrapOn(src.shape, p);
            wrapRad = built.radius || null;
            if (!next) { next = built.shape; cachePut(k, next, null, wrapRad ? { radius: wrapRad } : null); }
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
        src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
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
        let shape = cacheGet(kBase), key = kBase;
        if (!shape) {
          try {
            const sw = buildSweepAlongWires(ww.wires, it.p);
            if (isIdentity(rel)) shape = sw;
            else { shape = applyMatrix(sw, rel); safeDelete(sw); }
            cachePut(kBase, shape);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
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
                let next = cacheGet(kOp);
                if (!next) {
                  const idB = isIdentity(base.m);
                  const locMir = idB ? mw.shape : applyMatrix(mw.shape, matInvRigid(base.m));
                  next = fo.opType === 'join' ? base.shape.fuse(locMir) : fo.opType === 'cut' ? base.shape.cut(locMir) : base.shape.intersect(locMir);
                  if (!idB) safeDelete(locMir);
                  cachePut(kOp, next);
                }
                base.shape = next; base.key = kOp; base.wb = bboxTransform(bboxCached(kOp, next), base.m);
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
                let next = cacheGet(kCut);
                if (!next) {
                  const idS = isIdentity(s.m);
                  const locMir = idS ? mw.shape : applyMatrix(mw.shape, matInvRigid(s.m));
                  next = s.shape.cut(locMir);
                  if (!idS) safeDelete(locMir);
                  cachePut(kCut, next);
                }
                s.shape = next; s.key = kCut; s.wb = bboxTransform(bboxCached(kCut, next), s.m);
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
        let next = cacheGet(k);
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
            cachePut(k, next);
          } catch (err) {
            if (cur && cur !== src.shape) safeDelete(cur);
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        src.shape = next; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
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
      let next = cacheGet(k);
      if (next) {
        featureOps.set(it.id, { targetId: tid, opType: op.type, tools: [{ shape: o.shape, m: o.m, key: o.key }] });
        base.shape = next; base.key = k; base.wb = bboxTransform(bboxCached(k, next), base.m);
        bodies.set(tid, base); continue;
      }
      try {
        const tool = applyMatrix(o.shape, rel);
        next = op.type === 'join' ? base.shape.fuse(tool) : op.type === 'cut' ? base.shape.cut(tool) : base.shape.intersect(tool);
        safeDelete(tool);
        cachePut(k, next);
        featureOps.set(it.id, { targetId: tid, opType: op.type, tools: [{ shape: o.shape, m: o.m, key: o.key }] });
        base.shape = next; base.key = k; base.wb = bboxTransform(bboxCached(k, next), base.m);
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
      const evald = tops.map((it) => {
        const t0 = now();
        const r = evalItem(it, errors);
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        addT(it.id, t0);
        return { it, ...r, wb };
      });
      const tOps = now();
      const resolved = {};
      const { bodies, consumed } = resolveOps(evald, errors, hiddenIds, resolved);
      if (bodies.size && times) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
      for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; } }
      return { evald, consumed, resolved };
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
      for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; } }
      return { evald, consumed, resolved: ctx.resolved };
    } finally {
      for (const x of pool) safeDelete(x.worldShape);
    }
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
      if (known[it.id] === resultKey) { nodes.push({ id: it.id, key: resultKey, same: true, ...(e.baseBox ? { baseBox: e.baseBox } : {}) }); continue; }
      const mk = resultKey + '|' + Q.level;
      let payload = meshCache.get(mk);
      if (!payload) {
        const tm = now();
        try { payload = meshPayload(result); meshCache.set(mk, payload); addT(it.id, tm); }
        catch (err) { errors.push({ itemId: it.id, code: 'mesh', message: 'Die Form konnte nicht angezeigt werden.' }); nodes.push({ id: it.id, key: null, empty: true }); continue; }
      }
      nodes.push({ id: it.id, key: resultKey, ...(e.baseBox ? { baseBox: e.baseBox } : {}), ...clonePayload(payload) });
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

  // q: Feinheit beim Export – 1 = normal, kleiner = feiner (0.4 = fein, 0.15 = sehr fein), größer = gröber
  function exportMeshes(scene, fine = true, q = 1, originMat = null) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const objs = [];
    const f = Math.max(0.05, Math.min(4, +q || 1));
    const useTr = Array.isArray(originMat) && originMat.length === 16 && !isIdentity(originMat);
    const meshOne = (shape, metaObj) => {
      const b = bboxOf(shape);
      const tol = (fine ? Math.min(0.05, Math.max(0.005, meshTol(b) * 0.35)) : meshTol(b)) * f;
      const m = shape.mesh({ tolerance: tol, angularTolerance: (fine ? 0.1 : 0.2) * Math.min(2, Math.max(0.25, f)) });
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
    return { objects: objs, errors };
  }
  function exportSTEP(scene, only, originMat = null) {
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
