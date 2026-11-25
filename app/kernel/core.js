// Tracery CAD-Kern: läuft im Web Worker (oder in Node für Tests).
// createKernel(R, oc) bekommt die replicad-Bibliothek und die OpenCascade-Instanz.

export function createKernel(R, oc) {
  const cache = new Map(); // key -> { shape, gen, bbox }
  const meshCache = new Map(); // resultKey -> mesh payload (plain arrays, reusable)
  const bboxMemo = new Map();
  const importBlobs = new Map(); // blobId -> Uint8Array (binäre Import-Dateien)
  let gen = 0;
  const stats = {
    evals: 0,
    totalRebuilds: 0,
    totalHits: 0,
    buildsByItem: new Map(),
    hitsByItem: new Map(),
    lastEval: { evalId: 0, rebuilt: [], cached: [], meshed: [], fingerprints: {} },
  };
  function getStats() {
    return {
      evals: stats.evals,
      totalRebuilds: stats.totalRebuilds,
      totalHits: stats.totalHits,
      buildsByItem: Object.fromEntries(stats.buildsByItem),
      hitsByItem: Object.fromEntries(stats.hitsByItem),
      lastEval: {
        evalId: stats.lastEval.evalId,
        rebuilt: stats.lastEval.rebuilt.slice(),
        cached: stats.lastEval.cached.slice(),
        meshed: stats.lastEval.meshed.slice(),
        fingerprints: { ...stats.lastEval.fingerprints },
      },
      cacheSize: cache.size,
      meshCacheSize: meshCache.size,
    };
  }
  function resetStats() {
    stats.evals = 0;
    stats.totalRebuilds = 0;
    stats.totalHits = 0;
    stats.buildsByItem.clear();
    stats.hitsByItem.clear();
    stats.lastEval = { evalId: 0, rebuilt: [], cached: [], meshed: [], fingerprints: {} };
    return getStats();
  }
  function clearCache() {
    for (const [, e] of cache) {
      try { if (Array.isArray(e.shape)) e.shape.forEach(safeDelete); else e.shape.delete(); } catch (_) {}
      freeTopoMap(e.topo);
    }
    cache.clear();
    meshCache.clear();
    bboxMemo.clear();
    return getStats();
  }

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
      if (gen - e.gen > 24) {
        try { if (Array.isArray(e.shape)) e.shape.forEach(safeDelete); else e.shape.delete(); } catch (_) {}
        freeTopoMap(e.topo);
        cache.delete(k);
      }
    }
    if (cache.size > 300) {
      const old = [...cache.entries()].filter(([, e]) => e.gen < gen).sort((a, b) => a[1].gen - b[1].gen);
      let drop = cache.size - 240;
      for (const [k, e] of old) {
        if (drop-- <= 0) break;
        try { if (Array.isArray(e.shape)) e.shape.forEach(safeDelete); else e.shape.delete(); } catch (_) {}
        freeTopoMap(e.topo);
        cache.delete(k);
      }
    }
    if (meshCache.size > 500) {
      const drop = meshCache.size - 380; let i = 0;
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
  function progressiveOffset(step0, k, distStep = 0, distUnit = 'pct') {
    if (k <= 0) return 0;
    const ds = num(distStep, 0);
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
    const ss = num(scaleStep, 0);
    if (!stepIdx || Math.abs(ss) < 1e-9) return 1;
    if (scaleUnit === 'mm') {
      const ref = Math.max(1e-3, num(baseRef, 10));
      return Math.max(0.05, (ref + stepIdx * ss) / ref);
    }
    const r = Math.max(0.05, 1 + ss / 100);
    return Math.max(0.05, Math.pow(r, stepIdx));
  }
  function patternStepMatrices(p) {
    const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const skipSet = new Set(Array.isArray(p.skip) ? p.skip.map((x) => Math.round(Number(x))) : []);
    const distStep = num(p.distStep, 0), distUnit = p.distUnit === 'mm' ? 'mm' : 'pct';
    const out = [];
    if (p.pt === 'rect') {
      const nx = Math.max(1, Math.min(60, Math.round(num(p.nx, 1)))), ny = Math.max(1, Math.min(60, Math.round(num(p.ny, 1))));
      const dx = num(p.dx, 10), dy = num(p.dy, 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        if (!skipSet.has(idx)) {
          const ox = progressiveOffset(dx, i, distStep, distUnit), oy = progressiveOffset(dy, j, distStep, distUnit);
          out.push(idx === 0 ? ID : matTrans(ox, oy, 0));
        }
      }
    } else if (p.pt === 'circ') {
      const n = Math.max(1, Math.min(120, Math.round(num(p.n, 4)))), ang = num(p.ang, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [num(p.cx, 0), num(p.cy, 0), num(p.cz, 0)];
      for (let k = 0; k < n; k++) if (!skipSet.has(k)) {
        const angK = progressiveOffset(step, k, distStep, distUnit);
        out.push(k === 0 ? ID : matRotAxis(c, ax, angK));
      }
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
    } else if ((p.pt === 'points' || p.pt === 'table') && Array.isArray(p.places)) {
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      const lim = Math.min(p.places.length, 200);
      for (let k = 0; k < lim; k++) {
        if (skipSet.has(k)) continue;
        const q = p.places[k], d = (q.d || [0, 0, 0]).map(Number);
        let m = matTrans(d[0], d[1], d[2]);
        if (Math.abs(Number(q.a) || 0) > 1e-9) m = matMul(m, matRotAxis(p0, ax, Number(q.a)));
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
  const deformBasisInvMemo = new Map();
  function bsplineBasisInv(n) {
    if (deformBasisInvMemo.has(n)) return deformBasisInvMemo.get(n);
    const deg = Math.min(3, n - 1);
    const ts = Array.from({ length: n }, (_, i) => i / (n - 1));
    const knots = [0], mults = [deg + 1];
    if (deg === 3 && n > 4) {
      for (let i = 2; i <= n - 3; i++) { knots.push(ts[i]); mults.push(1); }
    } else if (deg === 2 && n > 3) {
      for (let i = 1; i <= n - 2; i++) { knots.push((ts[i] + ts[i + 1]) / 2); mults.push(1); }
    }
    knots.push(1); mults.push(deg + 1);
    const U = [];
    for (let i = 0; i < knots.length; i++) for (let k = 0; k < mults[i]; k++) U.push(knots[i]);
    const evalBasis = (t) => {
      const B = new Array(n).fill(0);
      if (t <= 0) { B[0] = 1; return B; }
      if (t >= 1) { B[n - 1] = 1; return B; }
      let span = deg;
      while (span < n - 1 && t >= U[span + 1]) span++;
      const N = new Array(deg + 1).fill(0);
      N[0] = 1;
      for (let d = 1; d <= deg; d++) {
        for (let r = d; r >= 0; r--) {
          const j = span - d + r;
          let v = 0;
          if (r > 0 && U[j + d] > U[j]) v += ((t - U[j]) / (U[j + d] - U[j])) * N[r - 1];
          if (r < d && U[j + d + 1] > U[j + 1]) v += ((U[j + d + 1] - t) / (U[j + d + 1] - U[j + 1])) * N[r];
          N[r] = v;
        }
      }
      for (let r = 0; r <= deg; r++) B[span - deg + r] = N[r];
      return B;
    };
    const A = ts.map((t) => evalBasis(t));
    const I = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (piv !== col) { [A[col], A[piv]] = [A[piv], A[col]]; [I[col], I[piv]] = [I[piv], I[col]]; }
      const diag = A[col][col];
      for (let j = 0; j < n; j++) { A[col][j] /= diag; I[col][j] /= diag; }
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col];
        if (Math.abs(f) < 1e-15) continue;
        for (let j = 0; j < n; j++) { A[r][j] -= f * A[col][j]; I[r][j] -= f * I[col][j]; }
      }
    }
    const entry = { deg, knots, mults, inv: I };
    deformBasisInvMemo.set(n, entry);
    return entry;
  }
  function makeBSplineCurveFromPoints(pts) {
    const n = pts.length, b = bsplineBasisInv(n);
    const poles = new oc.NCollection_Array1_gp_Pnt(1, n);
    for (let i = 0; i < n; i++) {
      const row = b.inv[i];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < n; k++) { const w = row[k], q = pts[k]; x += w * q[0]; y += w * q[1]; z += w * q[2]; }
      const gp = new oc.gp_Pnt(x, y, z);
      poles.SetValue(i + 1, gp);
      gp.delete();
    }
    const uk = makeArr1D(b.knots), um = makeArr1I(b.mults);
    const crv = new oc.Geom_BSplineCurve(poles, uk, um, b.deg, false);
    poles.delete(); uk.delete(); um.delete();
    return crv;
  }
  function fitCoplanarPlane(Q, nu, nv) {
    const p0 = Q[0][0];
    const d1 = [Q[nu - 1][nv - 1][0] - p0[0], Q[nu - 1][nv - 1][1] - p0[1], Q[nu - 1][nv - 1][2] - p0[2]];
    let d2 = [Q[nu - 1][0][0] - Q[0][nv - 1][0], Q[nu - 1][0][1] - Q[0][nv - 1][1], Q[nu - 1][0][2] - Q[0][nv - 1][2]];
    let nx = d1[1] * d2[2] - d1[2] * d2[1], ny = d1[2] * d2[0] - d1[0] * d2[2], nz = d1[0] * d2[1] - d1[1] * d2[0];
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) {
      const pm = Q[Math.floor(nu / 2)][Math.floor(nv / 2)];
      d2 = [pm[0] - p0[0], pm[1] - p0[1], pm[2] - p0[2]];
      nx = d1[1] * d2[2] - d1[2] * d2[1]; ny = d1[2] * d2[0] - d1[0] * d2[2]; nz = d1[0] * d2[1] - d1[1] * d2[0];
      nl = Math.hypot(nx, ny, nz);
    }
    if (nl < 1e-8) return null;
    nx /= nl; ny /= nl; nz /= nl;
    const c = Q[Math.floor(nu / 2)][Math.floor(nv / 2)];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const q = Q[i][j];
      const err = Math.abs((q[0] - c[0]) * nx + (q[1] - c[1]) * ny + (q[2] - c[2]) * nz);
      if (err > 1e-4) return null;
    }
    return { o: c, n: [nx, ny, nz] };
  }
  function deformFace(face, mapPt, gridN = 17) {
    const fw = oc.TopoDS.Face(face.wrapped);
    const fOri = fw.Orientation();
    const loc = new oc.TopLoc_Location();
    const surf = oc.BRep_Tool.Surface(fw, loc);
    const trsf = !loc.IsIdentity() ? loc.Transformation() : null;
    const uv = oc.BRepTools.UVBounds(fw);
    const wires = collectWires(fw);
    const uSpan = uv.UMax - uv.UMin, vSpan = uv.VMax - uv.VMin;
    const isFullPerU = surf.IsUPeriodic() && Math.abs(uSpan - surf.UPeriod()) < 1e-4;
    const isFullPerV = surf.IsVPeriodic() && Math.abs(vSpan - surf.VPeriod()) < 1e-4;
    const nu = isFullPerU ? Math.max(gridN, 25) : gridN;
    const nv = isFullPerV ? Math.max(gridN, 25) : gridN;
    const du = uSpan / (nu - 1), dv = vSpan / (nv - 1);
    const Q = Array.from({ length: nu }, (_, iu) => {
      const u = iu === nu - 1 ? uv.UMax : uv.UMin + iu * du;
      return Array.from({ length: nv }, (_, iv) => {
        const v = iv === nv - 1 ? uv.VMax : uv.VMin + iv * dv;
        const pt = surf.Value(u, v);
        let x = pt.X(), y = pt.Y(), z = pt.Z();
        if (trsf) { const p2 = pt.Transformed(trsf); x = p2.X(); y = p2.Y(); z = p2.Z(); p2.delete(); }
        pt.delete();
        return mapPt([x, y, z]);
      });
    });

    const pln = face.geomType === 'PLANE' ? fitCoplanarPlane(Q, nu, nv) : null;
    if (pln) {
      let gpPln = null, mf = null;
      try {
        const origN = face.normalAt(), origC = face.center;
        const pA = mapPt([origC.x, origC.y, origC.z]);
        const pB = mapPt([origC.x + origN.x * 0.01, origC.y + origN.y * 0.01, origC.z + origN.z * 0.01]);
        const dotN = (pB[0] - pA[0]) * pln.n[0] + (pB[1] - pA[1]) * pln.n[1] + (pB[2] - pA[2]) * pln.n[2];
        const nn = dotN < 0 ? [-pln.n[0], -pln.n[1], -pln.n[2]] : pln.n;
        const gpO = new oc.gp_Pnt(pln.o[0], pln.o[1], pln.o[2]);
        const gpD = new oc.gp_Dir(nn[0], nn[1], nn[2]);
        gpPln = new oc.gp_Pln(gpO, gpD); gpO.delete(); gpD.delete();
        const proj = (q) => {
          const d = (q[0] - pln.o[0]) * nn[0] + (q[1] - pln.o[1]) * nn[1] + (q[2] - pln.o[2]) * nn[2];
          return [q[0] - d * nn[0], q[1] - d * nn[1], q[2] - d * nn[2]];
        };
        const buildPlaneWire = (w) => {
          const neList = [];
          for (const ew of collectEdges(w)) {
            if (oc.BRep_Tool.Degenerated(ew)) continue;
            const ad = new oc.BRepAdaptor_Curve(ew);
            const f0 = ad.FirstParameter(), f1 = ad.LastParameter();
            const isLine = ad.GetType() === oc.GeomAbs_CurveType.GeomAbs_Line;
            const M = isLine ? gridN : Math.max(gridN, 25);
            const pts = [];
            for (let k = 0; k < M; k++) {
              const t = k === M - 1 ? f1 : f0 + (f1 - f0) * (k / (M - 1));
              const pt = ad.Value(t);
              pts.push(proj(mapPt([pt.X(), pt.Y(), pt.Z()])));
              pt.delete();
            }
            ad.delete();
            const a = pts[0], b = pts[M - 1];
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const abL = Math.hypot(ab[0], ab[1], ab[2]);
            let straight = abL > 1e-7;
            if (straight) {
              for (let k = 1; k < M - 1; k++) {
                const ap = [pts[k][0] - a[0], pts[k][1] - a[1], pts[k][2] - a[2]];
                const cx = ap[1] * ab[2] - ap[2] * ab[1], cy = ap[2] * ab[0] - ap[0] * ab[2], cz = ap[0] * ab[1] - ap[1] * ab[0];
                if (Math.hypot(cx, cy, cz) / abL > 1e-4) { straight = false; break; }
              }
            }
            let ne;
            if (straight) {
              const p0 = new oc.gp_Pnt(a[0], a[1], a[2]), p1 = new oc.gp_Pnt(b[0], b[1], b[2]);
              const me = new oc.BRepBuilderAPI_MakeEdge(p0, p1);
              ne = me.Edge(); me.delete(); p0.delete(); p1.delete();
            } else {
              const crv = makeBSplineCurveFromPoints(pts);
              const me = new oc.BRepBuilderAPI_MakeEdge(crv);
              ne = me.Edge(); me.delete(); crv.delete();
            }
            if (ew.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) ne = oc.TopoDS.Edge(ne.Reversed());
            neList.push(ne);
          }
          return makeWireFromEdges(neList);
        };
        mf = new oc.BRepBuilderAPI_MakeFace(gpPln, buildPlaneWire(wires[0]), true);
        for (let i = 1; i < wires.length; i++) mf.Add(buildPlaneWire(wires[i]));
        if (mf.IsDone()) {
          let nf = mf.Face();
          mf.delete(); mf = null; gpPln.delete(); gpPln = null;
          if (trsf) trsf.delete();
          loc.delete();
          const sff = new oc.ShapeFix_Face(nf); sff.FixOrientation(); sff.Perform(); nf = sff.Face(); sff.delete();
          return nf;
        }
      } catch (_) {
      } finally {
        if (mf) try { mf.delete(); } catch (_) {}
        if (gpPln) try { gpPln.delete(); } catch (_) {}
      }
    }

    const bu = bsplineBasisInv(nu), bv = bsplineBasisInv(nv);
    const tmp = Array.from({ length: nu }, (_, iu) => {
      const row = bu.inv[iu];
      return Array.from({ length: nv }, (_, iv) => {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < nu; k++) { const w = row[k], q = Q[k][iv]; x += w * q[0]; y += w * q[1]; z += w * q[2]; }
        return [x, y, z];
      });
    });
    const poles = new oc.NCollection_Array2_gp_Pnt(1, nu, 1, nv);
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
      const row = bv.inv[iv];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < nv; k++) { const w = row[k], q = tmp[iu][k]; x += w * q[0]; y += w * q[1]; z += w * q[2]; }
      const gp = new oc.gp_Pnt(x, y, z);
      poles.SetValue(iu + 1, iv + 1, gp);
      gp.delete();
    }
    const uKnots = bu.knots.map((t, i) => i === 0 ? uv.UMin : i === bu.knots.length - 1 ? uv.UMax : uv.UMin + t * uSpan);
    const vKnots = bv.knots.map((t, i) => i === 0 ? uv.VMin : i === bv.knots.length - 1 ? uv.VMax : uv.VMin + t * vSpan);
    const uk = makeArr1D(uKnots), vk = makeArr1D(vKnots), um = makeArr1I(bu.mults), vm = makeArr1I(bv.mults);
    const bsp = new oc.Geom_BSplineSurface(poles, uk, vk, um, vm, bu.deg, bv.deg, false, false);
    poles.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete();
    if (trsf) trsf.delete();
    loc.delete();
    const isFullNatural = wires.length === 1 && (
      face.geomType === 'SPHERE' || face.geomType === 'TORUS' ||
      ((face.geomType === 'CYLINDRE' || face.geomType === 'CONE') && isFullPerU && collectEdges(wires[0]).length <= 4)
    );
    let nf;
    if (isFullNatural) {
      const mf = new oc.BRepBuilderAPI_MakeFace(bsp, 1e-6);
      nf = mf.Face(); mf.delete();
      if (fOri === oc.TopAbs_Orientation.TopAbs_REVERSED) nf = oc.TopoDS.Face(nf.Reversed());
    } else {
      const buildW = (w) => {
        const neList = [];
        for (const ew of collectEdges(w)) {
          const ad = new oc.BRepAdaptor_Curve2d(ew, fw);
          const pc = ad.Curve();
          const me = new oc.BRepBuilderAPI_MakeEdge(pc, bsp, ad.FirstParameter(), ad.LastParameter());
          let ne = me.Edge();
          if (ew.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) ne = oc.TopoDS.Edge(ne.Reversed());
          neList.push(ne); me.delete(); ad.delete();
        }
        return makeWireFromEdges(neList);
      };
      const mf = new oc.BRepBuilderAPI_MakeFace(bsp, buildW(wires[0]), true);
      for (let i = 1; i < wires.length; i++) mf.Add(buildW(wires[i]));
      nf = mf.Face(); mf.delete();
      if (fOri === oc.TopAbs_Orientation.TopAbs_REVERSED) nf = oc.TopoDS.Face(nf.Reversed());
    }
    bsp.delete();
    oc.BRepLib.BuildCurves3d(nf);
    const sff = new oc.ShapeFix_Face(nf); sff.Perform(); nf = sff.Face(); sff.delete();
    return nf;
  }
  function deformSolid(shape, mapPt, gridN = 17) {
    const outSolids = [];
    for (const solIn of shape.solids) {
      const faces = solIn.faces;
      if (faces.length === 1 && (faces[0].geomType === 'SPHERE' || faces[0].geomType === 'TORUS')) {
        const nf = deformFace(faces[0], mapPt, gridN);
        const sf = oc.BRep_Tool.Surface(nf);
        const sh = R.cast(new oc.BRepBuilderAPI_MakeShell(sf, false).Shell());
        let res = R.makeSolid([sh]);
        if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
        outSolids.push(res);
        continue;
      }
      const newFaces = faces.map((f) => deformFace(f, mapPt, gridN));
      let sewed = null;
      for (const tol of [1e-2, 5e-2]) {
        const sew = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
        for (const nf of newFaces) sew.Add(nf);
        sew.Perform();
        const cand = sew.SewedShape();
        sew.delete();
        if (cand && cand.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) { sewed = cand; break; }
        const sExp = new oc.TopExp_Explorer(cand, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        if (sExp.More()) { sewed = oc.TopoDS.Shell(sExp.Current()); sExp.delete(); safeDelete(cand); break; }
        sExp.delete();
        safeDelete(cand);
      }
      for (const nf of newFaces) safeDelete(nf);
      if (!sewed) throw new Error('Verformen: Flächen konnten nicht zu einem geschlossenen Körper vernäht werden.');
      const sh = oc.TopoDS.Shell(sewed);
      const ms = new oc.BRepBuilderAPI_MakeSolid(sh);
      let sol = ms.Solid(); ms.delete(); safeDelete(sewed);
      const sfs = new oc.ShapeFix_Solid(sol); sfs.Perform(); sol = oc.TopoDS.Solid(sfs.Solid()); sfs.delete();
      let res = R.cast(sol);
      if (R.measureVolume(res) < 0) res = R.cast(sol.Reversed());
      outSolids.push(res);
    }
    return outSolids.length === 1 ? outSolids[0] : R.makeCompound(outSolids);
  }
  function applyDeform(shape, p, wb) {
    const mode = p.mode === 'twist' || p.mode === 'taper' ? p.mode : 'bend';
    const axis = p.axis === 'x' || p.axis === 'y' ? p.axis : 'z';
    const IDX = { x: 0, y: 1, z: 2 };
    const uIdx = IDX[axis];
    const b = wb || bboxOf(shape);
    const u0 = b[uIdx], u1 = b[uIdx + 3], L = u1 - u0;
    if (!(L > 1e-5)) throw new Error('Verformen: Der Körper hat entlang dieser Achse keine Ausdehnung.');

    let mapPt, gridN = 17;
    if (mode === 'bend') {
      const bendAxis = (p.bendAxis === 'x' || p.bendAxis === 'y' || p.bendAxis === 'z') && p.bendAxis !== axis
        ? p.bendAxis
        : (axis === 'y' ? 'x' : 'y');
      const aIdx = IDX[bendAxis];
      const bAx = ['x', 'y', 'z'].find((k) => k !== axis && k !== bendAxis);
      const bIdx = IDX[bAx];
      const angleDeg = num(p.angle, 90) * (p.flip ? -1 : 1);
      if (!isFinite(angleDeg) || Math.abs(angleDeg) > 360) {
        throw new Error('Verformen (Biegen): Der Biegewinkel darf höchstens ±360° betragen.');
      }
      if (Math.abs(angleDeg) < 1e-6) return shape.clone();
      const theta = (angleDeg * Math.PI) / 180;
      const R_bend = L / theta;
      const anchor = p.anchor === 'start' || p.anchor === 'end' ? p.anchor : 'center';
      const uRef = anchor === 'start' ? u0 : anchor === 'end' ? u1 : (u0 + u1) / 2;
      const vCenter = (b[bIdx] + b[bIdx + 3]) / 2;
      const vHalf = (b[bIdx + 3] - b[bIdx]) / 2;
      if (Math.abs(R_bend) <= vHalf * 1.01 + 1e-4) {
        throw new Error('Verformen (Biegen): Der Biegewinkel ist für die Dicke dieses Körpers zu groß (er würde sich selbst durchdringen).');
      }
      mapPt = (pt) => {
        const s = pt[uIdx] - uRef;
        const v = pt[bIdx] - vCenter;
        const phi = s / R_bend;
        const out = [0, 0, 0];
        out[uIdx] = uRef + (R_bend - v) * Math.sin(phi);
        out[bIdx] = vCenter + R_bend - (R_bend - v) * Math.cos(phi);
        out[aIdx] = pt[aIdx];
        return out;
      };
      gridN = Math.max(15, Math.min(45, Math.ceil(Math.abs(angleDeg) / 10) + 8));
    } else if (mode === 'twist') {
      const angleDeg = num(p.angle, 90) * (p.flip ? -1 : 1);
      if (!isFinite(angleDeg) || Math.abs(angleDeg) > 1080) {
        throw new Error('Verformen (Verdrehen): Der Verdrehwinkel darf höchstens ±1080° (3 Umdrehungen) betragen.');
      }
      if (Math.abs(angleDeg) < 1e-6) return shape.clone();
      const [i1, i2] = uIdx === 2 ? [0, 1] : uIdx === 0 ? [1, 2] : [2, 0];
      const c1 = (b[i1] + b[i1 + 3]) / 2;
      const c2 = (b[i2] + b[i2 + 3]) / 2;
      const anchor = p.anchor === 'center' || p.anchor === 'end' ? p.anchor : 'start';
      const uRef = anchor === 'center' ? (u0 + u1) / 2 : anchor === 'end' ? u1 : u0;
      const theta = (angleDeg * Math.PI) / 180;
      mapPt = (pt) => {
        const phi = theta * ((pt[uIdx] - uRef) / L);
        const dx = pt[i1] - c1, dy = pt[i2] - c2;
        const cs = Math.cos(phi), sn = Math.sin(phi);
        const out = [0, 0, 0];
        out[i1] = c1 + dx * cs - dy * sn;
        out[i2] = c2 + dx * sn + dy * cs;
        out[uIdx] = pt[uIdx];
        return out;
      };
      gridN = Math.max(15, Math.min(49, Math.ceil(Math.abs(angleDeg) / 10) + 8));
    } else {
      const factor = num(p.factor, 0.5);
      if (!isFinite(factor) || factor <= 0.01 || factor > 100) {
        throw new Error('Verformen (Verjüngen): Der Faktor muss zwischen 0,02 und 100 liegen.');
      }
      if (Math.abs(factor - 1) < 1e-6) return shape.clone();
      const [i1, i2] = uIdx === 2 ? [0, 1] : uIdx === 0 ? [1, 2] : [2, 0];
      const c1 = (b[i1] + b[i1 + 3]) / 2;
      const c2 = (b[i2] + b[i2 + 3]) / 2;
      mapPt = (pt) => {
        const t = p.flip ? (u1 - pt[uIdx]) / L : (pt[uIdx] - u0) / L;
        const s = 1 + (factor - 1) * t;
        const out = [0, 0, 0];
        out[i1] = c1 + (pt[i1] - c1) * s;
        out[i2] = c2 + (pt[i2] - c2) * s;
        out[uIdx] = pt[uIdx];
        return out;
      };
      gridN = 11;
    }
    return deformSolid(shape, mapPt, gridN);
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
  function hasLoftContinuity(p) {
    if (!p || p.closed || p.path || p.sections3) return false;
    return p.startCond === 'tangent' || p.startCond === 'curvature' || p.endCond === 'tangent' || p.endCond === 'curvature';
  }
  function isDynamicExtent(p) { return !!(p && (p.extent === 'toNext' || p.extent === 'toFace')); }
  function isDynamicSplit(it) { return !!(it && it.kind === 'group' && it.p && it.p.op === 'split' && it.p.plane === 'FACE' && it.p.faceRef && it.p.faceRef.id); }
  function hasDynamicExtent(it) {
    if (!it || it.hidden) return false;
    if (it.kind === 'extrude') return isDynamicExtent(it.p);
    if (it.kind === 'loft') return hasLoftContinuity(it.p);
    if (it.kind === 'group') return isDynamicSplit(it) || (it.children || []).some((c) => !c.hidden && hasDynamicExtent(c));
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
  // Geschlossener Übergang (Ring): verbindet den letzten Umriss nahtlos zurück zum ersten
  function buildClosedLoft(pr, ruled) {
    if (!Array.isArray(pr) || pr.length < 3) {
      throw new Error('Für einen geschlossenen Übergang (Ring) braucht es mindestens drei geschlossene Umrisse.');
    }
    const m = pr.length;
    const maps = pr.map((q) => planeMap(q.plane));
    const centers = pr.map((q, i) => maps[i].P(q.c || [0, 0]));
    for (let i = 0; i < m; i++) {
      if (len(sub(centers[(i + 1) % m], centers[i])) <= 1e-4) {
        throw new Error('Für einen geschlossenen Übergang (Ring) müssen die Umrisse an verschiedenen Stellen liegen.');
      }
    }
    const wires = [];
    let prevStart = null;
    for (let i = 0; i < m; i++) {
      const vp = norm(sub(centers[i], centers[(i - 1 + m) % m]));
      const vn = norm(sub(centers[(i + 1) % m], centers[i]));
      const sum = add(vp, vn);
      const tang = len(sum) > 1e-6 ? norm(sum) : vn;
      const ccw = dot(maps[i].n, tang) >= 0;
      const loop = pr[i].outer;
      if (!loop.circle && !loop.ellipse && Array.isArray(loop.segs) && loop.segs.length > 1) {
        let segs = loop.segs;
        if ((loopArea(loop) > 0) !== ccw) {
          segs = segs.slice().reverse().map((s) => (s.t === 'bez' ? { ...s, a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { ...s, a: s.b, b: s.a }));
        }
        if (prevStart) {
          let bestI = 0, bestD = Infinity;
          for (let k = 0; k < segs.length; k++) {
            const d = len(sub(maps[i].P(segs[k].a), prevStart));
            if (d < bestD) { bestD = d; bestI = k; }
          }
          if (bestI > 0) segs = segs.slice(bestI).concat(segs.slice(0, bestI));
        }
        prevStart = maps[i].P(segs[0].a);
        wires.push(loopWire({ ...loop, segs }, maps[i], ccw));
      } else {
        wires.push(loopWire(loop, maps[i], ccw));
      }
    }

    const sewClosedShellToSolid = (sh) => {
      const sew = new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false);
      let sw = null, ms = null, sfs = null, sol = null;
      try {
        for (const f of sh.faces) sew.Add(f.wrapped);
        sew.Perform();
        sw = sew.SewedShape();
        let shell = null;
        if (sw.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) shell = oc.TopoDS.Shell(sw);
        else {
          const exp = new oc.TopExp_Explorer(sw, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          if (exp.More()) shell = oc.TopoDS.Shell(exp.Current());
          exp.delete();
        }
        if (!shell) return null;
        ms = new oc.BRepBuilderAPI_MakeSolid(shell);
        sol = ms.Solid();
        sfs = new oc.ShapeFix_Solid(sol);
        sfs.Perform();
        const fixed = oc.TopoDS.Solid(sfs.Solid());
        let res = R.cast(fixed);
        if (R.measureVolume(res) < 0) {
          const rev = R.cast(res.wrapped.Reversed());
          safeDelete(res);
          res = rev;
        }
        return res;
      } finally {
        sew.delete();
        if (ms) ms.delete();
        if (sfs) sfs.delete();
        safeDelete(sol);
        safeDelete(sw);
      }
    };

    const isValidClosedSolid = (res) => {
      if (!res || !R.isShape3D(res) || !(R.measureVolume(res) > 1e-3)) return false;
      let ana = null, exp = null;
      try {
        ana = new oc.BRepCheck_Analyzer(res.wrapped, true);
        if (!ana.IsValid()) return false;
        exp = new oc.TopExp_Explorer(res.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        let nShells = 0;
        while (exp.More()) {
          nShells++;
          if (!oc.BRep_Tool.IsClosed(exp.Current())) return false;
          exp.Next();
        }
        return nShells > 0;
      } finally {
        if (ana) ana.delete();
        if (exp) exp.delete();
      }
    };

    const tryPipe = () => {
      const spine = bezLoopWire(centers);
      const b = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
      try {
        b.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
        b.SetMode(false);
        for (const w of wires) b.Add(w.wrapped, false, false);
        b.Build();
        if (!b.IsDone()) return null;
        b.MakeSolid();
        let res = R.cast(b.Shape());
        if (!res || !R.isShape3D(res)) { safeDelete(res); return null; }
        if (R.measureVolume(res) < 0) {
          const rev = R.cast(res.wrapped.Reversed());
          safeDelete(res);
          res = rev;
        }
        if (!isValidClosedSolid(res)) { safeDelete(res); return null; }
        return res;
      } catch (_) {
        return null;
      } finally {
        b.delete();
        safeDelete(spine);
      }
    };

    const tryThru = (isRuled) => {
      const b = new oc.BRepOffsetAPI_ThruSections(false, isRuled, 1e-6);
      let sh = null;
      try {
        for (const w of wires) b.AddWire(w.wrapped);
        b.AddWire(wires[0].wrapped);
        b.Build();
        if (!b.IsDone()) return null;
        sh = R.cast(b.Shape());
        const res = sewClosedShellToSolid(sh);
        if (!isValidClosedSolid(res)) { safeDelete(res); return null; }
        return res;
      } catch (_) {
        return null;
      } finally {
        safeDelete(sh);
        b.delete();
      }
    };

    try {
      const shape = ruled ? (tryThru(true) || tryPipe()) : (tryPipe() || tryThru(false));
      if (!shape) {
        throw new Error('Der geschlossene Übergang (Ring) klappt mit diesen Umrissen nicht. Ordne mindestens drei Umrisse reihum im Kreis an, ohne dass sie sich überschneiden.');
      }
      return shape;
    } finally {
      for (const w of wires) safeDelete(w);
    }
  }
  // Übergang mit weichem Anschluss an Nachbarflächen (KP-31): Start/Ende tangential (G1) oder krümmungsglatt (G2) mit Stärke-Regler
  function buildLoftWithContinuity(it, W, ctx) {
    const p = it.p || {};
    const profiles = Array.isArray(p.profiles) ? p.profiles : [];
    const m = profiles.length;
    if (m < 2) throw new Error('Für einen Übergang mit weichem Anschluss braucht es mindestens zwei Umrisse.');
    const startCond = (p.startCond === 'tangent' || p.startCond === 'curvature') ? p.startCond : 'none';
    const endCond = (p.endCond === 'tangent' || p.endCond === 'curvature') ? p.endCond : 'none';
    const startW = Math.max(0.1, Math.min(3, num(p.startWeight, 1)));
    const endW = Math.max(0.1, Math.min(3, num(p.endWeight, 1)));

    const maps = profiles.map((q) => planeMap(q.plane));
    const centers = profiles.map((q, k) => maps[k].P(q.c || [0, 0]));
    const dirOf = (k) => {
      const d = k < m - 1 ? sub(centers[k + 1], centers[k]) : sub(centers[m - 1], centers[m - 2]);
      return len(d) > 1e-6 ? norm(d) : maps[k].n.slice();
    };
    const dir0 = dirOf(0);
    let uRef = sub(maps[0].x, mul(dir0, dot(maps[0].x, dir0)));
    if (len(uRef) < 1e-4) {
      const fb = Math.abs(dir0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      uRef = cross(fb, dir0);
    }
    uRef = norm(uRef);

    const flatKnotsOf = (knots, mults) => {
      const flat = [];
      for (let i = 0; i < knots.length; i++) for (let r = 0; r < mults[i]; r++) flat.push(knots[i]);
      return flat;
    };
    const evalRationalBasis = (u, deg, flatK, weights) => {
      const n = weights.length;
      const N = new Array(n).fill(0);
      if (u <= flatK[0] + 1e-12) { N[0] = 1; return N; }
      if (u >= flatK[flatK.length - 1] - 1e-12) { N[n - 1] = 1; return N; }
      let span = deg;
      while (span < n - 1 && u >= flatK[span + 1]) span++;
      const left = new Array(deg + 1).fill(0), right = new Array(deg + 1).fill(0);
      const b = new Array(deg + 1).fill(0);
      b[0] = 1;
      for (let j = 1; j <= deg; j++) {
        left[j] = u - flatK[span + 1 - j];
        right[j] = flatK[span + j] - u;
        let saved = 0;
        for (let r = 0; r < j; r++) {
          const den = right[r + 1] + left[j - r];
          const temp = Math.abs(den) > 1e-14 ? b[r] / den : 0;
          b[r] = saved + right[r + 1] * temp;
          saved = left[j - r] * temp;
        }
        b[j] = saved;
      }
      let wSum = 0;
      for (let j = 0; j <= deg; j++) {
        const idx = span - deg + j;
        const val = b[j] * weights[idx];
        N[idx] = val;
        wSum += val;
      }
      if (wSum > 1e-14) for (let j = 0; j <= deg; j++) N[span - deg + j] /= wSum;
      return N;
    };
    const solveLinear = (A, bVec) => {
      const n = A.length;
      const M = A.map((row, i) => [...row, ...bVec[i]]);
      for (let col = 0; col < n; col++) {
        let piv = col, best = Math.abs(M[col][col]);
        for (let r = col + 1; r < n; r++) {
          const v = Math.abs(M[r][col]);
          if (v > best) { best = v; piv = r; }
        }
        if (best < 1e-12) return null;
        if (piv !== col) { const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; }
        const inv = 1 / M[col][col];
        for (let c = col; c < n + 3; c++) M[col][c] *= inv;
        for (let r = 0; r < n; r++) {
          if (r === col || Math.abs(M[r][col]) < 1e-15) continue;
          const f = M[r][col];
          for (let c = col; c < n + 3; c++) M[r][c] -= f * M[col][c];
        }
      }
      return M.map((row) => [row[n], row[n + 1], row[n + 2]]);
    };

    const projectAxisInPlane = (M, dirK, hint) => {
      const ccw = dot(M.n, dirK) >= 0;
      let uP = sub(hint, mul(M.n, dot(hint, M.n)));
      if (len(uP) < 1e-4) uP = M.x.slice();
      uP = norm(uP);
      const vP = norm(ccw ? cross(M.n, uP) : cross(uP, M.n));
      return { ccw, uP, vP };
    };

    const W2 = Math.SQRT1_2;
    const CIRCLE_U_KNOTS = [0, 0.25, 0.5, 0.75, 1];
    const CIRCLE_U_MULTS = [3, 2, 2, 2, 3];
    const CIRCLE_WEIGHTS = [1, W2, 1, W2, 1, W2, 1, W2, 1];
    const unitCircleLocal2D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];

    const buildCirclePoles = (loop, M, dirK, hint) => {
      const { uP, vP } = projectAxisInPlane(M, dirK, hint);
      const C = M.P(loop.circle.c), r = loop.circle.r;
      return unitCircleLocal2D.map(([a, b]) => add(C, add(mul(uP, a * r), mul(vP, b * r))));
    };

    const allCircles = profiles.every((q) => q.outer && q.outer.circle);
    let uDeg = 2;
    let uKnots = CIRCLE_U_KNOTS.slice();
    let uMults = CIRCLE_U_MULTS.slice();
    let profPoles = [];
    let profWeights = [];
    let profCurves = [];
    const ocCleanup = [];

    const readCurveData = (bsp) => {
      const np = bsp.NbPoles(), nk = bsp.NbKnots();
      const poles = [], weights = [], knots = [], mults = [];
      for (let i = 1; i <= np; i++) {
        const pt = bsp.Pole(i);
        poles.push([pt.X(), pt.Y(), pt.Z()]);
        weights.push(bsp.IsRational() ? bsp.Weight(i) : 1);
        pt.delete();
      }
      for (let i = 1; i <= nk; i++) {
        knots.push(bsp.Knot(i));
        mults.push(bsp.Multiplicity(i));
      }
      return { deg: bsp.Degree(), poles, weights, knots, mults };
    };
    const makeBSplineFromData = (poles, weights, knots, mults, deg) => {
      const gpP = new oc.NCollection_Array1_gp_Pnt(1, poles.length);
      const wArr = new oc.NCollection_Array1_double(1, weights.length);
      for (let i = 0; i < poles.length; i++) {
        const pt = new oc.gp_Pnt(poles[i][0], poles[i][1], poles[i][2]);
        gpP.SetValue(i + 1, pt);
        wArr.SetValue(i + 1, weights[i]);
        pt.delete();
      }
      const kArr = makeArr1D(knots), mArr = makeArr1I(mults);
      const rational = weights.some((w) => Math.abs(w - 1) > 1e-9);
      const bsp = rational
        ? new oc.Geom_BSplineCurve(gpP, wArr, kArr, mArr, deg, false)
        : new oc.Geom_BSplineCurve(gpP, kArr, mArr, deg, false);
      gpP.delete(); wArr.delete(); kArr.delete(); mArr.delete();
      return bsp;
    };
    const normalizeCurveRange = (bsp) => {
      const k1 = bsp.Knot(1), kN = bsp.Knot(bsp.NbKnots());
      const span = kN - k1;
      if (Math.abs(k1) > 1e-9 || Math.abs(span - 1) > 1e-9) {
        const nk = bsp.NbKnots();
        const vals = [];
        for (let i = 1; i <= nk; i++) vals.push(i === 1 ? 0 : i === nk ? 1 : (bsp.Knot(i) - k1) / (span || 1));
        for (let i = 1; i <= nk; i++) bsp.SetKnot(i, vals[i - 1]);
      }
    };
    const segToCubicBSpline = (s, M) => {
      if (s.t === 'bez') {
        return makeBSplineFromData([M.P(s.a), M.P(s.c1), M.P(s.c2), M.P(s.b)], [1, 1, 1, 1], [0, 1], [4, 4], 3);
      }
      if (s.t === 'arc') {
        let eObj = null, loc = null, trm = null, bsp = null;
        try {
          eObj = R.makeThreePointArc(M.P(s.a), M.P(s.m), M.P(s.b));
          loc = new oc.TopLoc_Location();
          const cr = oc.BRep_Tool.Curve(eObj.wrapped, loc);
          trm = new oc.Geom_TrimmedCurve(cr.returnValue, cr.First, cr.Last, true, true);
          bsp = oc.GeomConvert.CurveToBSplineCurve(trm, oc.Convert_ParameterisationType.Convert_TgtThetaOver2);
          if (!loc.IsIdentity()) {
            const trsf = loc.Transformation();
            bsp.Transform(trsf);
            trsf.delete();
          }
          if (bsp.Degree() < 3) bsp.IncreaseDegree(3);
          normalizeCurveRange(bsp);
          return bsp;
        } catch (_) {
          if (bsp) try { bsp.delete(); } catch (_2) {}
        } finally {
          if (trm) trm.delete();
          if (loc) loc.delete();
          safeDelete(eObj);
        }
      }
      const p0 = M.P(s.a), p3 = M.P(s.b);
      const p1 = add(mul(p0, 2 / 3), mul(p3, 1 / 3));
      const p2 = add(mul(p0, 1 / 3), mul(p3, 2 / 3));
      return makeBSplineFromData([p0, p1, p2, p3], [1, 1, 1, 1], [0, 1], [4, 4], 3);
    };

    try {
      if (allCircles) {
        uDeg = 2;
        uKnots = CIRCLE_U_KNOTS.slice();
        uMults = CIRCLE_U_MULTS.slice();
        for (let k = 0; k < m; k++) {
          const poles = buildCirclePoles(profiles[k].outer, maps[k], dirOf(k), uRef);
          const weights = CIRCLE_WEIGHTS.slice();
          profPoles.push(poles);
          profWeights.push(weights);
          const bsp = makeBSplineFromData(poles, weights, uKnots, uMults, 2);
          ocCleanup.push(bsp);
          profCurves.push(bsp);
        }
      } else {
        const rawCurves = [];
        let prevStart = null;
        for (let k = 0; k < m; k++) {
          const loop = profiles[k].outer, M = maps[k], dirK = dirOf(k);
          let bsp = null;
          if (loop.circle) {
            const poles = buildCirclePoles(loop, M, dirK, uRef);
            bsp = makeBSplineFromData(poles, CIRCLE_WEIGHTS, CIRCLE_U_KNOTS, CIRCLE_U_MULTS, 2);
            bsp.IncreaseDegree(3);
            prevStart = poles[0].slice();
          } else if (loop.ellipse) {
            const E = loop.ellipse;
            const { ccw, uP, vP } = projectAxisInPlane(M, dirK, uRef);
            const cr = Math.cos(E.rot || 0), sr = Math.sin(E.rot || 0);
            const ex = add(mul(M.x, cr), mul(M.y, sr));
            const ey = add(mul(M.x, -sr), mul(M.y, cr));
            const ax = dot(uP, ex) / Math.max(1e-6, E.rx), ay = dot(uP, ey) / Math.max(1e-6, E.rx);
            const th0 = Math.atan2(dot(uP, ey) * E.rx, dot(uP, ex) * E.ry);
            const sgn = ccw ? 1 : -1;
            const C = M.P(E.c);
            const poles = unitCircleLocal2D.map(([cx, cy]) => {
              const ang = th0 + sgn * Math.atan2(cy, cx);
              const rad = Math.hypot(cx, cy); // 1 on cardinal poles, sqrt(2) on corner poles
              const lx = E.rx * rad * Math.cos(ang), ly = E.ry * rad * Math.sin(ang);
              return add(C, add(mul(ex, lx), mul(ey, ly)));
            });
            bsp = makeBSplineFromData(poles, CIRCLE_WEIGHTS, CIRCLE_U_KNOTS, CIRCLE_U_MULTS, 2);
            bsp.IncreaseDegree(3);
            prevStart = poles[0].slice();
          } else {
            const ccw = dot(M.n, dirK) >= 0;
            let segs = (loop.segs || []).filter((s) => s && (s.t !== 'line' || Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-6));
            if ((loopArea(loop) > 0) !== ccw) {
              segs = segs.slice().reverse().map((s) => (s.t === 'bez' ? { ...s, a: s.b, b: s.a, c1: s.c2, c2: s.c1 } : { ...s, a: s.b, b: s.a }));
            }
            let bestI = 0;
            if (prevStart) {
              let bestD = Infinity;
              for (let i = 0; i < segs.length; i++) {
                const d = len(sub(M.P(segs[i].a), prevStart));
                if (d < bestD) { bestD = d; bestI = i; }
              }
            } else {
              let bestDot = -Infinity;
              for (let i = 0; i < segs.length; i++) {
                const d = dot(sub(M.P(segs[i].a), centers[k]), uRef);
                if (d > bestDot + 1e-9) { bestDot = d; bestI = i; }
              }
            }
            if (bestI > 0) segs = segs.slice(bestI).concat(segs.slice(0, bestI));
            prevStart = M.P(segs[0].a);

            const segData = [];
            let totalL = 0;
            for (const s of segs) {
              const sb = segToCubicBSpline(s, M);
              const sd = readCurveData(sb);
              sb.delete();
              let cl = 0;
              for (let i = 1; i < sd.poles.length; i++) cl += len(sub(sd.poles[i], sd.poles[i - 1]));
              const sl = Math.max(1e-3, cl);
              totalL += sl;
              segData.push({ ...sd, sl });
            }
            const cPoles = [], cWeights = [], cKnots = [0], cMults = [4];
            let acc = 0;
            for (let si = 0; si < segData.length; si++) {
              const sd = segData[si];
              const u0 = acc / totalL;
              acc += sd.sl;
              const u1 = si === segData.length - 1 ? 1 : acc / totalL;
              if (si === 0) {
                for (let i = 0; i < sd.poles.length; i++) { cPoles.push(sd.poles[i]); cWeights.push(sd.weights[i]); }
              } else {
                const lastP = cPoles[cPoles.length - 1];
                cPoles[cPoles.length - 1] = mul(add(lastP, sd.poles[0]), 0.5);
                for (let i = 1; i < sd.poles.length; i++) { cPoles.push(sd.poles[i]); cWeights.push(sd.weights[i]); }
              }
              for (let ki = 1; ki < sd.knots.length - 1; ki++) {
                cKnots.push(u0 + sd.knots[ki] * (u1 - u0));
                cMults.push(sd.mults[ki]);
              }
              cKnots.push(u1);
              cMults.push(si === segData.length - 1 ? 4 : 3);
            }
            // End-Pol exakt auf Start-Pol legen, damit die Naht wasserdicht bleibt
            cPoles[cPoles.length - 1] = cPoles[0].slice();
            cWeights[cWeights.length - 1] = cWeights[0];
            bsp = makeBSplineFromData(cPoles, cWeights, cKnots, cMults, 3);
          }
          ocCleanup.push(bsp);
          rawCurves.push(bsp);
        }

        // Knotenvektoren aller Profile auf eine gemeinsame Knotenfolge vereinheitlichen
        const rawKnots = [];
        for (const bsp of rawCurves) {
          const nk = bsp.NbKnots();
          for (let i = 2; i < nk; i++) rawKnots.push({ u: bsp.Knot(i), mult: bsp.Multiplicity(i) });
        }
        rawKnots.sort((a, b) => a.u - b.u);
        const clusters = [];
        for (const rk of rawKnots) {
          const last = clusters[clusters.length - 1];
          if (last && rk.u - last.u < 5e-4) {
            last.mult = Math.max(last.mult, rk.mult);
          } else {
            clusters.push({ u: rk.u, mult: rk.mult });
          }
        }
        // Nahe Knoten innerhalb 5e-4 auf den Cluster-Wert ziehen, falls strikt monoton
        for (const bsp of rawCurves) {
          const nk = bsp.NbKnots();
          for (let i = 2; i < nk; i++) {
            const ku = bsp.Knot(i);
            const cl = clusters.find((c) => Math.abs(c.u - ku) < 5e-4);
            if (cl && Math.abs(cl.u - ku) > 1e-12) {
              const prevU = bsp.Knot(i - 1), nextU = bsp.Knot(i + 1);
              if (cl.u > prevU + 1e-6 && cl.u < nextU - 1e-6) bsp.SetKnot(i, cl.u);
            }
          }
        }
        // Exakte Vereinigung nach etwaigem Snapping einsammeln und fehlende Knoten einfügen
        const unionMap = new Map();
        for (const bsp of rawCurves) {
          const nk = bsp.NbKnots();
          for (let i = 2; i < nk; i++) {
            const uVal = Math.round(bsp.Knot(i) * 1e9) / 1e9;
            const mult = bsp.Multiplicity(i);
            const prev = unionMap.get(uVal) || 0;
            if (mult > prev) unionMap.set(uVal, mult);
          }
        }
        const unionEntries = [...unionMap.entries()].sort((a, b) => a[0] - b[0]);
        for (const bsp of rawCurves) {
          for (const [uVal, targetMult] of unionEntries) {
            bsp.InsertKnot(uVal, targetMult, 1e-7, false);
          }
        }
        uDeg = 3;
        const d0 = readCurveData(rawCurves[0]);
        uKnots = d0.knots;
        uMults = d0.mults;
        for (const bsp of rawCurves) {
          const cd = readCurveData(bsp);
          profPoles.push(cd.poles);
          profWeights.push(cd.weights);
          profCurves.push(bsp);
        }
      }

      const nu = profPoles[0].length;
      const flatU = flatKnotsOf(uKnots, uMults);
      const greville = [];
      for (let i = 0; i < nu; i++) {
        let s = 0;
        for (let r = 1; r <= uDeg; r++) s += flatU[i + r];
        greville.push(i === 0 ? 0 : i === nu - 1 ? 1 : s / uDeg);
      }

      // ---------- Nachbarflächen finden und Tangenten/Krümmungen pro Pol berechnen ----------
      const WInv = matInvRigid(W);
      const pool = (ctx && ctx.pool) || [];
      const resolved = {};
      const chordSpan = [];
      for (let s = 0; s < m - 1; s++) {
        let sum = 0;
        for (let i = 0; i < nu; i++) sum += len(sub(profPoles[s + 1][i], profPoles[s][i]));
        chordSpan.push(Math.max(0.01, sum / nu));
      }

      const resolvePoolEntry = (refId) => {
        if (!refId) return null;
        let tid = refId;
        while (tid && ctx && ctx.consumed && ctx.consumed.has(tid)) tid = ctx.consumed.get(tid);
        return pool.find((e) => e.id === tid || (e.ids && (e.ids.has(refId) || e.ids.has(tid)))) || null;
      };

      const profileSamplePtsWorld = (k) => {
        const pts = [], curve = profCurves[k], pOut = new oc.gp_Pnt();
        const cnt = 12;
        for (let i = 0; i < cnt; i++) {
          curve.D0(i / cnt, pOut);
          pts.push(transformPoint(W, [pOut.X(), pOut.Y(), pOut.Z()]));
        }
        pOut.delete();
        return pts;
      };

      const boxContainsPt = (bb, pt, pad = 0.5) => (
        pt[0] >= bb[0] - pad && pt[0] <= bb[3] + pad
        && pt[1] >= bb[1] - pad && pt[1] <= bb[4] + pad
        && pt[2] >= bb[2] - pad && pt[2] <= bb[5] + pad
      );

      const collectTouchingFaces = (entry, samplePtsW, profNW, explicitRef = null) => {
        const fl = topoList(entry.worldShape, 'face');
        const outFaces = [];
        const vtxs = samplePtsW.map((pt) => {
          const gp = new oc.gp_Pnt(pt[0], pt[1], pt[2]);
          const mv = new oc.BRepBuilderAPI_MakeVertex(gp);
          const v = mv.Vertex();
          mv.delete(); gp.delete();
          return R.cast(v);
        });
        const faceBbs = fl.map((f) => bboxOf(f.shape));
        const faceInfos = fl.map((f) => faceInfo(f.shape));
        const isCoplanar = (fi) => fi.t === 'PLANE' && fi.n && Math.abs(dot(norm(fi.n), profNW)) > 0.99;

        const touchCount = (idx) => {
          const sh = fl[idx].shape, bb = faceBbs[idx];
          let cnt = 0;
          for (let i = 0; i < samplePtsW.length; i++) {
            if (!boxContainsPt(bb, samplePtsW[i], 0.35)) continue;
            if (minDistShapes(vtxs[i], sh) < 0.25) cnt++;
          }
          return cnt;
        };

        let explicitUsed = false;
        if (explicitRef) {
          const matched = matchFaceOnShape(entry.worldShape, explicitRef, true);
          if (matched && matched.faceIdx != null && fl[matched.faceIdx]) {
            const idx = matched.faceIdx;
            if (!isCoplanar(faceInfos[idx]) && touchCount(idx) >= 2) {
              outFaces.push({ idx, face: fl[idx].shape, info: faceInfos[idx], bb: faceBbs[idx] });
              explicitUsed = true;
            }
          }
        }
        if (!explicitUsed) {
          for (let idx = 0; idx < fl.length; idx++) {
            if (isCoplanar(faceInfos[idx])) continue;
            if (touchCount(idx) >= 1) {
              outFaces.push({ idx, face: fl[idx].shape, info: faceInfos[idx], bb: faceBbs[idx] });
            }
          }
        }
        for (const v of vtxs) safeDelete(v);
        const keptSet = new Set(outFaces.map((x) => x.face));
        for (const f of fl) if (!keptSet.has(f.shape)) f.shape.delete();
        return outFaces;
      };

      const evalSurfaceAtPoint = (faceEntry, ptW) => {
        const fw = faceEntry.face.wrapped;
        const loc = new oc.TopLoc_Location();
        const surf = oc.BRep_Tool.Surface(fw, loc);
        let gp = new oc.gp_Pnt(ptW[0], ptW[1], ptW[2]);
        if (!loc.IsIdentity()) {
          const invT = loc.Transformation().Inverted();
          const gp2 = gp.Transformed(invT);
          gp.delete(); invT.delete();
          gp = gp2;
        }
        const proj = new oc.GeomAPI_ProjectPointOnSurf(gp, surf);
        gp.delete(); loc.delete();
        try {
          if (!proj.IsDone() || proj.NbPoints() === 0 || proj.LowerDistance() > 0.25) return null;
          const uv = proj.LowerDistanceParameters();
          const ad = new oc.BRepAdaptor_Surface(fw, false);
          const P = new oc.gp_Pnt(), d1u = new oc.gp_Vec(), d1v = new oc.gp_Vec(), d2u = new oc.gp_Vec(), d2v = new oc.gp_Vec(), d2uv = new oc.gp_Vec();
          try {
            ad.D2(uv.U, uv.V, P, d1u, d1v, d2u, d2v, d2uv);
            const nRaw = d1u.Crossed(d1v);
            const nl = nRaw.Magnitude();
            if (!(nl > 1e-12)) { nRaw.delete(); return null; }
            const sign = fw.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
            const N = [sign * nRaw.X() / nl, sign * nRaw.Y() / nl, sign * nRaw.Z() / nl];
            nRaw.delete();
            return {
              N,
              d1u: [d1u.X(), d1u.Y(), d1u.Z()],
              d1v: [d1v.X(), d1v.Y(), d1v.Z()],
              d2u: [d2u.X(), d2u.Y(), d2u.Z()],
              d2v: [d2v.X(), d2v.Y(), d2v.Z()],
              d2uv: [d2uv.X(), d2uv.Y(), d2uv.Z()],
            };
          } finally {
            ad.delete(); P.delete(); d1u.delete(); d1v.delete(); d2u.delete(); d2v.delete(); d2uv.delete();
          }
        } finally {
          proj.delete();
        }
      };

      const computeBoundaryPoles = (end) => {
        const isStart = end === 'start';
        const cond = isStart ? startCond : endCond;
        const k = isStart ? 0 : m - 1;
        const M = maps[k];
        const inwardL = isStart ? dirOf(0) : mul(dirOf(m - 1), -1);
        const planeInwardL = dot(M.n, inwardL) >= 0 ? M.n.slice() : mul(M.n, -1);
        const fallback = {
          T: Array.from({ length: nu }, () => planeInwardL.slice()),
          K: Array.from({ length: nu }, () => [0, 0, 0]),
        };
        if (cond === 'none') return fallback;

        const inwardW = transformDir(W, inwardL);
        const planeInwardW = transformDir(W, planeInwardL);
        const profNW = transformDir(W, M.n);
        const samplePtsW = profileSamplePtsWorld(k);

        const explicitRef = isStart ? p.startFace : p.endFace;
        const planeRef = profiles[k] && profiles[k].planeRef;

        let chosenEntry = null, touchFaces = [];
        const tryEntry = (entry, expRef = null) => {
          if (!entry || entry.id === it.id || !entry.worldShape) return null;
          const tf = collectTouchingFaces(entry, samplePtsW, profNW, expRef);
          return tf.length ? { entry, tf } : null;
        };

        if (explicitRef && explicitRef.id) {
          const hit = tryEntry(resolvePoolEntry(explicitRef.id), explicitRef);
          if (hit) { chosenEntry = hit.entry; touchFaces = hit.tf; }
        }
        if (!chosenEntry && planeRef && planeRef.kind === 'face' && planeRef.id) {
          const hit = tryEntry(resolvePoolEntry(planeRef.id), null);
          if (hit) { chosenEntry = hit.entry; touchFaces = hit.tf; }
        }
        if (!chosenEntry) {
          let pMin = [Infinity, Infinity, Infinity], pMax = [-Infinity, -Infinity, -Infinity];
          for (const q of samplePtsW) for (let c = 0; c < 3; c++) { pMin[c] = Math.min(pMin[c], q[c]); pMax[c] = Math.max(pMax[c], q[c]); }
          const pBb = [pMin[0] - 0.5, pMin[1] - 0.5, pMin[2] - 0.5, pMax[0] + 0.5, pMax[1] + 0.5, pMax[2] + 0.5];
          let bestScore = 0;
          for (const entry of pool) {
            if (!entry || entry.id === it.id || !entry.worldShape) continue;
            if (entry.wb && !bboxHit(entry.wb, pBb, 0.5)) continue;
            const tf = collectTouchingFaces(entry, samplePtsW, profNW, null);
            if (!tf.length) { for (const f of tf) f.face.delete(); continue; }
            let score = 0;
            for (const pt of samplePtsW) {
              const gp = new oc.gp_Pnt(pt[0], pt[1], pt[2]);
              const mv = new oc.BRepBuilderAPI_MakeVertex(gp);
              const v = R.cast(mv.Vertex());
              mv.delete(); gp.delete();
              const hits = tf.some((f) => boxContainsPt(f.bb, pt, 0.35) && minDistShapes(v, f.face) < 0.25);
              safeDelete(v);
              if (hits) score++;
            }
            if (score > bestScore && score >= Math.ceil(samplePtsW.length * 0.4)) {
              for (const f of touchFaces) f.face.delete();
              bestScore = score;
              chosenEntry = entry;
              touchFaces = tf;
            } else {
              for (const f of tf) f.face.delete();
            }
          }
        }

        resolved[end] = chosenEntry && touchFaces.length
          ? { source: 'face', bodyId: chosenEntry.id, faceType: touchFaces[0].info.t }
          : { source: 'normal' };

        if (!touchFaces.length) return fallback;

        const T_target = [], K_target = [];
        const bsp = profCurves[k];
        const gpP = new oc.gp_Pnt(), gpV = new oc.gp_Vec();
        const Lspan = isStart ? chordSpan[0] : chordSpan[chordSpan.length - 1];
        const maxKappa = 2 / Math.max(0.5, Lspan);

        try {
          for (let i = 0; i < nu - 1; i++) {
            const u = greville[i];
            bsp.D1(u, gpP, gpV);
            const pLoc = [gpP.X(), gpP.Y(), gpP.Z()];
            const eLoc = [gpV.X(), gpV.Y(), gpV.Z()];
            const pW = transformPoint(W, pLoc);
            const eW = len(eLoc) > 1e-9 ? transformDir(W, eLoc) : null;

            const gv = new oc.gp_Pnt(pW[0], pW[1], pW[2]);
            const mv = new oc.BRepBuilderAPI_MakeVertex(gv);
            const vtx = R.cast(mv.Vertex());
            mv.delete(); gv.delete();
            const hits = [];
            for (const f of touchFaces) {
              if (!boxContainsPt(f.bb, pW, 0.35)) continue;
              if (minDistShapes(vtx, f.face) < 0.25) {
                const ev = evalSurfaceAtPoint(f, pW);
                if (ev) hits.push(ev);
              }
            }
            safeDelete(vtx);

            let Tw = planeInwardW.slice();
            let Kw = [0, 0, 0];
            if (hits.length >= 2) {
              // Eckkante zweier Nachbarflächen: Schnittlinie der beiden Tangentialebenen
              let pairDir = null;
              for (let a = 0; a < hits.length && !pairDir; a++) {
                for (let b = a + 1; b < hits.length; b++) {
                  if (Math.abs(dot(hits[a].N, hits[b].N)) < 0.999) {
                    const cr = cross(hits[a].N, hits[b].N);
                    if (len(cr) > 1e-6) { pairDir = norm(cr); break; }
                  }
                }
              }
              if (pairDir) {
                if (dot(pairDir, inwardW) < 0) pairDir = mul(pairDir, -1);
                if (dot(pairDir, planeInwardW) > 0.05) Tw = pairDir;
              } else if (eW) {
                const ev = hits[0];
                let t = cross(eW, ev.N);
                if (len(t) > 1e-6) {
                  t = norm(t);
                  if (dot(t, inwardW) < 0) t = mul(t, -1);
                  if (dot(t, planeInwardW) > 0.05) Tw = t;
                }
              }
            } else if (hits.length === 1 && eW) {
              const ev = hits[0];
              let t = cross(eW, ev.N);
              if (len(t) > 1e-6) {
                t = norm(t);
                if (dot(t, inwardW) < 0) t = mul(t, -1);
                if (dot(t, planeInwardW) > 0.05) {
                  Tw = t;
                  if (cond === 'curvature') {
                    const E = dot(ev.d1u, ev.d1u), F = dot(ev.d1u, ev.d1v), G = dot(ev.d1v, ev.d1v);
                    const det = E * G - F * F;
                    if (det > 1e-12) {
                      const b1 = dot(Tw, ev.d1u), b2 = dot(Tw, ev.d1v);
                      const du = (G * b1 - F * b2) / det, dv = (E * b2 - F * b1) / det;
                      const L2 = dot(ev.d2u, ev.N), M2 = dot(ev.d2uv, ev.N), N2 = dot(ev.d2v, ev.N);
                      const kappaRaw = L2 * du * du + 2 * M2 * du * dv + N2 * dv * dv;
                      const kappa = Math.max(-maxKappa, Math.min(maxKappa, kappaRaw));
                      Kw = mul(ev.N, kappa);
                    }
                  }
                }
              }
            }
            T_target.push(transformDir(WInv, Tw));
            const kLoc = [
              WInv[0] * Kw[0] + WInv[4] * Kw[1] + WInv[8] * Kw[2],
              WInv[1] * Kw[0] + WInv[5] * Kw[1] + WInv[9] * Kw[2],
              WInv[2] * Kw[0] + WInv[6] * Kw[1] + WInv[10] * Kw[2],
            ];
            K_target.push(kLoc);
          }
        } finally {
          gpP.delete(); gpV.delete();
          for (const f of touchFaces) f.face.delete();
        }

        // Letzten Pol exakt gleich dem ersten setzen (geschlossene Naht)
        T_target.push(T_target[0].slice());
        K_target.push(K_target[0].slice());

        const weightsK = profWeights[k];
        const allTSame = T_target.every((t) => len(sub(t, T_target[0])) < 1e-4);
        let T_pole;
        if (allTSame) {
          T_pole = T_target.map(() => T_target[0].slice());
        } else {
          const nFree = nu - 1;
          const A = Array.from({ length: nFree }, (_, r) => {
            const bas = evalRationalBasis(greville[r], uDeg, flatU, weightsK);
            const row = bas.slice(0, nFree);
            row[0] += bas[nu - 1];
            return row;
          });
          const solT = solveLinear(A, T_target.slice(0, nFree));
          T_pole = solT ? [...solT, solT[0].slice()] : T_target;
        }

        const allKZero = cond !== 'curvature' || K_target.every((kv) => len(kv) < 1e-6);
        let K_pole;
        if (allKZero) {
          K_pole = K_target.map(() => [0, 0, 0]);
        } else {
          const allKSame = K_target.every((kv) => len(sub(kv, K_target[0])) < 1e-6);
          if (allKSame) {
            K_pole = K_target.map(() => K_target[0].slice());
          } else {
            const nFree = nu - 1;
            const A = Array.from({ length: nFree }, (_, r) => {
              const bas = evalRationalBasis(greville[r], uDeg, flatU, weightsK);
              const row = bas.slice(0, nFree);
              row[0] += bas[nu - 1];
              return row;
            });
            const solK = solveLinear(A, K_target.slice(0, nFree));
            K_pole = solK ? [...solK, solK[0].slice()] : K_target;
          }
        }

        return { T: T_pole, K: K_pole };
      };

      const startB = computeBoundaryPoles('start');
      const endB = computeBoundaryPoles('end');

      // ---------- B-Spline-Fläche in v-Richtung aufbauen ----------
      const vDeg = (startCond === 'curvature' || endCond === 'curvature') ? 5 : 3;
      const totalVLen = chordSpan.reduce((a, b) => a + b, 0) || 1;
      const tau = [0];
      let accV = 0;
      for (let s = 0; s < m - 1; s++) {
        accV += chordSpan[s];
        tau.push(s === m - 2 ? 1 : accV / totalVLen);
      }
      const vKnots = tau.slice();
      const vMults = tau.map((_, idx) => (idx === 0 || idx === m - 1 ? vDeg + 1 : vDeg));
      const nv = (m - 1) * vDeg + 1;

      // Gewichts-Matrix: an Start und Ende konstante Gewichte in Randnähe, damit dW/dv = 0 und d²W/dv² = 0
      const wGrid = Array.from({ length: nv }, () => new Array(nu).fill(1));
      for (let s = 0; s < m - 1; s++) {
        const w0 = profWeights[s], w1 = profWeights[s + 1];
        const base = s * vDeg;
        for (let i = 0; i < nu; i++) {
          if (vDeg === 3) {
            wGrid[base][i] = w0[i];
            wGrid[base + 1][i] = s === 0 ? w0[i] : (2 * w0[i] + w1[i]) / 3;
            wGrid[base + 2][i] = s === m - 2 ? w1[i] : (w0[i] + 2 * w1[i]) / 3;
            wGrid[base + 3][i] = w1[i];
          } else {
            wGrid[base][i] = w0[i];
            wGrid[base + 1][i] = s === 0 ? w0[i] : (4 * w0[i] + w1[i]) / 5;
            wGrid[base + 2][i] = s === 0 ? w0[i] : (3 * w0[i] + 2 * w1[i]) / 5;
            wGrid[base + 3][i] = s === m - 2 ? w1[i] : (2 * w0[i] + 3 * w1[i]) / 5;
            wGrid[base + 4][i] = s === m - 2 ? w1[i] : (w0[i] + 4 * w1[i]) / 5;
            wGrid[base + 5][i] = w1[i];
          }
        }
      }

      const poleGrid = Array.from({ length: nv }, () => new Array(nu));
      if (m === 2) {
        const L = chordSpan[0];
        const Q0 = profPoles[0], Q1 = profPoles[1];
        for (let i = 0; i < nu; i++) {
          const q0 = Q0[i], q1 = Q1[i];
          const t0 = startB.T[i], k0 = startB.K[i];
          const t1 = endB.T[i], k1 = endB.K[i];
          if (vDeg === 3) {
            const d0 = Math.min(0.75, 0.28 * startW) * L;
            const d1 = Math.min(0.75, 0.28 * endW) * L;
            const p0 = q0.slice(), p3 = q1.slice();
            let p1, p2;
            if (startCond !== 'none' && endCond !== 'none') {
              p1 = add(p0, mul(t0, d0));
              p2 = add(p3, mul(t1, d1));
            } else if (startCond !== 'none') {
              p1 = add(p0, mul(t0, d0));
              p2 = mul(add(p1, p3), 0.5);
            } else {
              p2 = add(p3, mul(t1, d1));
              p1 = mul(add(p0, p2), 0.5);
            }
            poleGrid[0][i] = p0; poleGrid[1][i] = p1; poleGrid[2][i] = p2; poleGrid[3][i] = p3;
          } else {
            const bothG2 = startCond === 'curvature' && endCond === 'curvature';
            const dMax = bothG2 ? 0.39 : 0.42;
            const d0 = Math.min(dMax, 0.14 * startW) * L;
            const d1 = Math.min(dMax, 0.14 * endW) * L;
            const d0G1 = Math.min(0.42, 0.17 * startW) * L;
            const d1G1 = Math.min(0.42, 0.17 * endW) * L;
            const p0 = q0.slice(), p5 = q1.slice();
            let p1 = null, p2 = null, p3 = null, p4 = null;
            if (startCond === 'curvature') {
              p1 = add(p0, mul(t0, d0));
              p2 = add(add(p0, mul(t0, 2 * d0)), mul(k0, (25 * d0 * d0) / 20));
            } else if (startCond === 'tangent') {
              p1 = add(p0, mul(t0, d0G1));
            }
            if (endCond === 'curvature') {
              p4 = add(p5, mul(t1, d1));
              p3 = add(add(p5, mul(t1, 2 * d1)), mul(k1, (25 * d1 * d1) / 20));
            } else if (endCond === 'tangent') {
              p4 = add(p5, mul(t1, d1G1));
            }
            if (startCond === 'tangent' && endCond === 'curvature') {
              p2 = mul(add(mul(p1, 2), p3), 1 / 3);
            } else if (endCond === 'tangent' && startCond === 'curvature') {
              p3 = mul(add(p2, mul(p4, 2)), 1 / 3);
            } else if (startCond === 'tangent' && endCond === 'none') {
              p2 = mul(add(mul(p1, 2), p5), 1 / 3);
              p3 = mul(add(mul(p2, 2), p5), 1 / 3);
              p4 = mul(add(p2, mul(p5, 2)), 1 / 3);
            } else if (endCond === 'tangent' && startCond === 'none') {
              p1 = mul(add(mul(p0, 2), p4), 1 / 3);
              p2 = mul(add(p0, mul(p4, 2)), 1 / 3);
              p3 = mul(add(p2, mul(p4, 2)), 1 / 3);
            } else if (startCond === 'curvature' && endCond === 'none') {
              p3 = mul(add(mul(p2, 2), p5), 1 / 3);
              p4 = mul(add(p2, mul(p5, 2)), 1 / 3);
            } else if (endCond === 'curvature' && startCond === 'none') {
              p1 = mul(add(mul(p0, 2), p3), 1 / 3);
              p2 = mul(add(p0, mul(p3, 2)), 1 / 3);
            } else if (startCond === 'tangent' && endCond === 'tangent') {
              p2 = mul(add(mul(p1, 2), p4), 1 / 3);
              p3 = mul(add(p1, mul(p4, 2)), 1 / 3);
            }
            poleGrid[0][i] = p0; poleGrid[1][i] = p1; poleGrid[2][i] = p2;
            poleGrid[3][i] = p3; poleGrid[4][i] = p4; poleGrid[5][i] = p5;
          }
        }
      } else {
        // m >= 3: stückweise C1 (oder C2 bei Grad 5) über die Umrisse
        const dt0 = tau[1] - tau[0], dtLast = tau[m - 1] - tau[m - 2];
        for (let i = 0; i < nu; i++) {
          const Q = profPoles.map((row) => row[i]);
          const D = new Array(m);
          for (let k = 1; k < m - 1; k++) {
            D[k] = mul(sub(Q[k + 1], Q[k - 1]), 1 / Math.max(1e-6, tau[k + 1] - tau[k - 1]));
          }
          if (startCond === 'none') {
            D[0] = sub(mul(sub(Q[1], Q[0]), 2 / Math.max(1e-6, dt0)), D[1]);
          } else {
            const fac = vDeg === 5
              ? (startCond === 'curvature' ? Math.min(0.39, 0.14 * startW) : Math.min(0.42, 0.17 * startW))
              : Math.min(0.75, 0.28 * startW);
            D[0] = mul(startB.T[i], (vDeg * fac * chordSpan[0]) / Math.max(1e-6, dt0));
          }
          if (endCond === 'none') {
            D[m - 1] = sub(mul(sub(Q[m - 1], Q[m - 2]), 2 / Math.max(1e-6, dtLast)), D[m - 2]);
          } else {
            const fac = vDeg === 5
              ? (endCond === 'curvature' ? Math.min(0.39, 0.14 * endW) : Math.min(0.42, 0.17 * endW))
              : Math.min(0.75, 0.28 * endW);
            D[m - 1] = mul(endB.T[i], -(vDeg * fac * chordSpan[m - 2]) / Math.max(1e-6, dtLast));
          }
          const A = Array.from({ length: m }, () => [0, 0, 0]);
          if (vDeg === 5) {
            if (startCond === 'curvature') {
              const s0 = len(D[0]);
              A[0] = mul(startB.K[i], s0 * s0);
            }
            if (endCond === 'curvature') {
              const s1 = len(D[m - 1]);
              A[m - 1] = mul(endB.K[i], s1 * s1);
            }
          }
          for (let s = 0; s < m - 1; s++) {
            const dt = tau[s + 1] - tau[s];
            const base = s * vDeg;
            const qA = Q[s], qB = Q[s + 1];
            const dA = mul(D[s], dt), dB = mul(D[s + 1], dt);
            if (vDeg === 3) {
              poleGrid[base][i] = qA.slice();
              poleGrid[base + 1][i] = add(qA, mul(dA, 1 / 3));
              poleGrid[base + 2][i] = sub(qB, mul(dB, 1 / 3));
              poleGrid[base + 3][i] = qB.slice();
            } else {
              const aA = mul(A[s], dt * dt), aB = mul(A[s + 1], dt * dt);
              poleGrid[base][i] = qA.slice();
              poleGrid[base + 1][i] = add(qA, mul(dA, 1 / 5));
              poleGrid[base + 2][i] = add(add(qA, mul(dA, 2 / 5)), mul(aA, 1 / 20));
              poleGrid[base + 3][i] = add(sub(qB, mul(dB, 2 / 5)), mul(aB, 1 / 20));
              poleGrid[base + 4][i] = sub(qB, mul(dB, 1 / 5));
              poleGrid[base + 5][i] = qB.slice();
            }
          }
        }
      }

      // Naht-Spalte exakt identisch halten (i = nu - 1 gleich i = 0)
      for (let j = 0; j < nv; j++) {
        poleGrid[j][nu - 1] = poleGrid[j][0].slice();
        wGrid[j][nu - 1] = wGrid[j][0];
      }

      const polesArr = new oc.NCollection_Array2_gp_Pnt(1, nu, 1, nv);
      const weightsArr = new oc.NCollection_Array2_double(1, nu, 1, nv);
      let isRational = false;
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const pt = poleGrid[j][i], w = wGrid[j][i];
          if (Math.abs(w - 1) > 1e-9) isRational = true;
          const gp = new oc.gp_Pnt(pt[0], pt[1], pt[2]);
          polesArr.SetValue(i + 1, j + 1, gp);
          weightsArr.SetValue(i + 1, j + 1, w);
          gp.delete();
        }
      }
      const uk = makeArr1D(uKnots), um = makeArr1I(uMults);
      const vk = makeArr1D(vKnots), vm = makeArr1I(vMults);
      const surf = isRational
        ? new oc.Geom_BSplineSurface(polesArr, weightsArr, uk, vk, um, vm, uDeg, vDeg, false, false)
        : new oc.Geom_BSplineSurface(polesArr, uk, vk, um, vm, uDeg, vDeg, false, false);
      polesArr.delete(); weightsArr.delete(); uk.delete(); vk.delete(); um.delete(); vm.delete();

      let sideFace = null, cap0 = null, cap1 = null, sew = null, sewed = null, ms = null, sfs = null, sol = null;
      try {
        const mfSide = new oc.BRepBuilderAPI_MakeFace(surf, 1e-6);
        sideFace = mfSide.Face(); mfSide.delete();
        const makeCap = (vVal, mapPl) => {
          const iso = surf.VIso(vVal);
          const me = new oc.BRepBuilderAPI_MakeEdge(iso);
          const edge = me.Edge(); me.delete(); iso.delete();
          const mw = new oc.BRepBuilderAPI_MakeWire(edge);
          const wire = mw.Wire(); mw.delete(); safeDelete(edge);
          const mf = new oc.BRepBuilderAPI_MakeFace(wire, true);
          let f = mf.IsDone() ? mf.Face() : null;
          mf.delete();
          if (!f) {
            const p0 = new oc.gp_Pnt(mapPl.o[0], mapPl.o[1], mapPl.o[2]);
            const d0 = new oc.gp_Dir(mapPl.n[0], mapPl.n[1], mapPl.n[2]);
            const pln = new oc.gp_Pln(p0, d0);
            const mf2 = new oc.BRepBuilderAPI_MakeFace(pln, wire, true);
            f = mf2.Face(); mf2.delete(); pln.delete(); p0.delete(); d0.delete();
          }
          safeDelete(wire);
          return f;
        };
        cap0 = makeCap(0, maps[0]);
        cap1 = makeCap(1, maps[m - 1]);
        sew = new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false);
        sew.Add(sideFace); sew.Add(cap0); sew.Add(cap1);
        sew.Perform();
        sewed = sew.SewedShape();
        let shell = null;
        if (sewed.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_SHELL) shell = oc.TopoDS.Shell(sewed);
        else {
          const exp = new oc.TopExp_Explorer(sewed, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          if (exp.More()) shell = oc.TopoDS.Shell(exp.Current());
          exp.delete();
        }
        if (!shell) throw new Error('Schale konnte nicht geschlossen werden.');
        ms = new oc.BRepBuilderAPI_MakeSolid(shell);
        sol = ms.Solid();
        sfs = new oc.ShapeFix_Solid(sol); sfs.Perform();
        const fixed = oc.TopoDS.Solid(sfs.Solid());
        let res = R.cast(fixed);
        if (R.measureVolume(res) < 0) {
          const rev = R.cast(res.wrapped.Reversed());
          safeDelete(res);
          res = rev;
        }
        const ana = new oc.BRepCheck_Analyzer(res.wrapped, true);
        const valid = ana.IsValid();
        ana.delete();
        if (!valid || !(R.measureVolume(res) > 1e-3)) {
          safeDelete(res);
          throw new Error('Ungültige Form beim weichen Übergang.');
        }
        return { shape: res, resolved };
      } finally {
        surf.delete();
        safeDelete(sideFace); safeDelete(cap0); safeDelete(cap1);
        if (sew) sew.delete();
        safeDelete(sewed);
        if (ms) ms.delete();
        if (sfs) sfs.delete();
        safeDelete(sol);
      }
    } finally {
      for (const c of ocCleanup) try { c.delete(); } catch (_) {}
    }
  }
  // Übergang zwischen mehreren Umrissen (Loft), auf Wunsch mit Spitze – oder entlang einer Mittellinie
  function buildLoft(p) {
    if (p.closed) return buildClosedLoft(p.profiles || [], !!p.ruled);
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

  // Hilfspfad (Auxiliary Spine) für Verdrehung (KP-28) entlang eines Sweep-Pfads
  function buildTwistAuxSpine(spine, N0, twistDeg) {
    const edges = spine.edges || [];
    const isStraight = edges.length === 1 && edges[0].geomType === 'LINE';
    if (isStraight) {
      const sp0V = spine.startPoint, sp1V = spine.endPoint;
      const sp0 = vec(sp0V), sp1 = vec(sp1V);
      safeDelete(sp0V); safeDelete(sp1V);
      const dVec = sub(sp1, sp0), L = len(dVec);
      if (L <= 1e-6) throw new Error('Der Pfad ist zu kurz für eine Verdrehung.');
      const dir = mul(dVec, 1 / L);
      const pitch = (360 / Math.abs(twistDeg)) * L;
      const aux = R.makeHelix(pitch, L, 1.0, sp0, dir, twistDeg < 0);
      return { wire: aux, straight: true, samples: null };
    }
    const curve = spine.curve;
    const K = Math.max(48, Math.min(360, Math.ceil(Math.abs(twistDeg) / 4) * 2 + 24));
    const pts = [], tans = [], cum = [0];
    try {
      for (let i = 0; i <= K; i++) {
        const u = i / K;
        const pObj = curve.pointAt(u), tObj = curve.tangentAt(u);
        const pt = vec(pObj), tn = norm(vec(tObj));
        safeDelete(pObj); safeDelete(tObj);
        pts.push(pt); tans.push(tn);
        if (i > 0) cum.push(cum[i - 1] + len(sub(pt, pts[i - 1])));
      }
    } finally {
      safeDelete(curve);
    }
    const totalL = cum[K];
    const projOrtho = (v, t) => {
      const d = dot(v, t);
      const o = [v[0] - t[0] * d, v[1] - t[1] * d, v[2] - t[2] * d];
      const l = len(o);
      return l > 1e-6 ? mul(o, 1 / l) : null;
    };
    const t0 = tans[0];
    let u0 = N0 ? projOrtho(N0, t0) : null;
    if (!u0) u0 = projOrtho(Math.abs(t0[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0], t0) || [1, 0, 0];
    const U = [u0], W = [norm(cross(t0, u0))];
    let kappaMax = 0;
    for (let i = 1; i <= K; i++) {
      const tPrev = tans[i - 1], tCur = tans[i];
      const segLen = Math.max(1e-6, cum[i] - cum[i - 1]);
      const kVec = cross(tPrev, tCur), sinA = len(kVec);
      kappaMax = Math.max(kappaMax, sinA / segLen);
      let uCur = U[i - 1];
      if (sinA > 1e-9) {
        const ax = mul(kVec, 1 / sinA);
        const cosA = Math.max(-1, Math.min(1, dot(tPrev, tCur)));
        const kxu = cross(ax, uCur), kdu = dot(ax, uCur);
        uCur = add(add(mul(uCur, cosA), mul(kxu, sinA)), mul(ax, kdu * (1 - cosA)));
      }
      uCur = projOrtho(uCur, tCur) || U[i - 1];
      U.push(uCur);
      W.push(norm(cross(tCur, uCur)));
    }
    const rAux = Math.max(0.1, Math.min(1.0, 0.25 / Math.max(0.25, kappaMax)));
    const twRad = (twistDeg * Math.PI) / 180;
    const auxPts = [];
    for (let i = 0; i <= K; i++) {
      const f = totalL > 1e-9 ? cum[i] / totalL : i / K;
      const ang = twRad * f;
      const dirI = add(mul(U[i], Math.cos(ang)), mul(W[i], Math.sin(ang)));
      auxPts.push(add(pts[i], mul(dirI, rAux)));
    }
    const auxEdge = R.makeBSplineApproximation(auxPts, { tolerance: 1e-4, degMin: 3, degMax: 6 });
    let aux;
    try { aux = R.assembleWire([auxEdge]); }
    finally { safeDelete(auxEdge); }
    return { wire: aux, straight: false, samples: { pts, tans, U, W, cum, totalL } };
  }
  function pipeShellWithAux(w, spine, auxWire, curviLinearEquivalence) {
    const b = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
    try {
      b.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner);
      b.SetMode(auxWire.wrapped, !!curviLinearEquivalence, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
      b.Add(w.wrapped, false, true);
      b.Build();
      if (!b.IsDone()) throw new Error('PipeShell failed');
      b.MakeSolid();
      const sh = R.cast(b.Shape());
      if (!R.isShape3D(sh)) { safeDelete(sh); throw new Error('PipeShell not 3D'); }
      return sh;
    } finally {
      b.delete();
    }
  }
  function sweepProfileAlongSpine(spine, profAt, P0, T, N, V, p) {
    const twist = num(p.twist, 0);
    if (Math.abs(twist) > 3600) throw new Error('Die Verdrehung darf höchstens ±3600° (10 Umdrehungen) betragen.');
    const wall = num(p.wall, 0);
    if (Math.abs(twist) < 1e-6) {
      const sweep = (w) => {
        try { return R.genericSweep(w, spine, { transitionMode: 'round', forceProfileSpineOthogonality: true }); }
        catch (_) { return R.genericSweep(w, spine, { transitionMode: 'right', forceProfileSpineOthogonality: true }); }
      };
      const wOuter = profAt(0, P0, T, V, N);
      let shape;
      try { shape = sweep(wOuter); }
      finally { safeDelete(wOuter); }
      if (wall > 0 && p.shape !== 'sketch') {
        const inner = profAt(wall, P0, T, V, N);
        if (!inner) { safeDelete(shape); throw new Error('Die Wand ist dicker als das halbe Rohr.'); }
        let cutter = null;
        try {
          cutter = sweep(inner);
          const res = shape.cut(cutter);
          safeDelete(shape); shape = res;
        } finally {
          safeDelete(inner); safeDelete(cutter);
        }
      }
      return shape;
    }
    const aux = buildTwistAuxSpine(spine, N, twist);
    const doTwisted = (inset) => {
      const w0 = profAt(inset, P0, T, V, N);
      if (!w0) return null;
      try {
        try { return pipeShellWithAux(w0, spine, aux.wire, !aux.straight); }
        catch (_) {
          try { return pipeShellWithAux(w0, spine, aux.wire, aux.straight); }
          catch (_2) {}
        }
      } finally {
        safeDelete(w0);
      }
      if (aux.samples) {
        const { pts, tans, U, W, cum, totalL } = aux.samples;
        const M = Math.max(12, Math.min(96, Math.ceil(Math.abs(twist) / 10) + 8));
        const twRad = (twist * Math.PI) / 180;
        const secWires = [];
        try {
          let j = 0;
          for (let m = 0; m <= M; m++) {
            const f = m / M;
            const sTarget = f * totalL;
            while (j < cum.length - 2 && cum[j + 1] < sTarget) j++;
            const ds = cum[j + 1] - cum[j];
            const alpha = ds > 1e-9 ? Math.max(0, Math.min(1, (sTarget - cum[j]) / ds)) : 0;
            const Pm = [0, 1, 2].map((k) => pts[j][k] + (pts[j + 1][k] - pts[j][k]) * alpha);
            const Tm = norm([0, 1, 2].map((k) => tans[j][k] + (tans[j + 1][k] - tans[j][k]) * alpha));
            const Um = norm([0, 1, 2].map((k) => U[j][k] + (U[j + 1][k] - U[j][k]) * alpha));
            const Wm = norm([0, 1, 2].map((k) => W[j][k] + (W[j + 1][k] - W[j][k]) * alpha));
            const ang = twRad * f;
            const Nm = norm(add(mul(Um, Math.cos(ang)), mul(Wm, Math.sin(ang))));
            const Vm = norm(cross(Tm, Nm));
            const wm = profAt(inset, Pm, Tm, Vm, Nm);
            if (!wm) throw new Error('Querschnitt zu klein');
            secWires.push(wm);
          }
          return R.loft(secWires, { ruled: false });
        } catch (_3) {
          // Fallback unten wirft verständliche Fehlermeldung
        } finally {
          for (const w of secWires) safeDelete(w);
        }
      }
      throw new Error('Die Verdrehung klappt für diesen Pfad und Querschnitt nicht – wähle einen kleineren Winkel oder ein schmaleres Profil.');
    };
    try {
      let shape = doTwisted(0);
      if (wall > 0 && p.shape !== 'sketch') {
        const cutter = doTwisted(wall);
        if (!cutter) { safeDelete(shape); throw new Error('Die Wand ist dicker als das halbe Rohr.'); }
        try {
          const res = shape.cut(cutter);
          safeDelete(shape); shape = res;
        } finally {
          safeDelete(cutter);
        }
      }
      return shape;
    } finally {
      safeDelete(aux.wire);
    }
  }

  // Querschnitt entlang eines offenen Pfads (Sweep): Rohr, Kabelkanal, Leiste
  function buildSweep(p) {
    if (p.sketch3dMissing) throw new Error(p.sketch3dMissing);
    let spine, P0, T, N;
    const P3 = p.path3d && Array.isArray(p.path3d.pts) ? p.path3d.pts.filter((q) => Array.isArray(q) && q.length === 3 && q.every((v) => isFinite(v))) : null;
    if (P3) {
      // Pfad im Raum: glatte Kurve durch die Punkte (B-Spline) oder gerade Stücke mit runden Übergängen
      const pts = P3.filter((q, i) => !i || Math.hypot(q[0] - P3[i - 1][0], q[1] - P3[i - 1][1], q[2] - P3[i - 1][2]) > 1e-6);
      if (pts.length < 2) throw new Error('Der Pfad im Raum braucht mindestens zwei verschiedene Punkte.');
      const bz = Array.isArray(p.path3d.segs) ? p.path3d.segs : null;
      if (p.path3d.smooth !== false && pts.length >= 3 && bz && bz.length) {
        const ce = bz.map((g) => R.makeBezierCurve([g.a, g.c1, g.c2, g.b]));
        try { spine = R.assembleWire(ce); } finally { ce.forEach(safeDelete); }
        T = norm(sub(bz[0].c1, bz[0].a));
      } else {
        const ed = []; for (let i = 1; i < pts.length; i++) ed.push(R.makeLine(pts[i - 1], pts[i]));
        try { spine = R.assembleWire(ed); } finally { ed.forEach(safeDelete); }
        T = norm(sub(pts[1], pts[0]));
      }
      P0 = pts[0];
      const up = Math.abs(T[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0], d = T[0] * up[0] + T[1] * up[1] + T[2] * up[2];
      N = norm([up[0] - T[0] * d, up[1] - T[1] * d, up[2] - T[2] * d]);
    } else if (Array.isArray(p.segs3d) && p.segs3d.length) {
      const ed = [];
      for (const s of p.segs3d) {
        if (!s || !s.a || !s.b) continue;
        if (s.t === 'arc' && s.m) {
          const cr = cross(sub(s.m, s.a), sub(s.b, s.a));
          if (len(cr) > 1e-6) ed.push(R.makeThreePointArc(s.a, s.m, s.b));
          else if (len(sub(s.b, s.a)) > 1e-6) ed.push(R.makeLine(s.a, s.b));
        } else if (len(sub(s.b, s.a)) > 1e-6) {
          ed.push(R.makeLine(s.a, s.b));
        }
      }
      if (!ed.length) throw new Error('Die 3D-Skizze enthält keinen gültigen Pfad.');
      try { spine = R.assembleWire(ed); } finally { ed.forEach(safeDelete); }
      P0 = p.p0 || p.segs3d[0].a;
      T = norm(p.t0 || sub(p.segs3d[0].b, p.segs3d[0].a));
      const up = Math.abs(T[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0], d = dot(T, up);
      N = norm([up[0] - T[0] * d, up[1] - T[1] * d, up[2] - T[2] * d]);
    } else {
      const segs = p.segs || [];
      if (!segs.length || !p.t0) throw new Error('Die Skizze hat keinen offenen Pfad. Zeichne eine Linie, einen Bogen oder eine Spline, die nicht geschlossen ist.');
      const M = planeMap(p.plane);
      const ed = segEdges(segs, M);
      try { spine = R.assembleWire(ed); } finally { ed.forEach(safeDelete); }
      P0 = M.P(segs[0].a); const O = M.P([0, 0]);
      T = norm(sub(M.P(p.t0), O)); N = M.n;
    }
    const V = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const profAt = (inset, P, tVec, vVec, nVec) => {
      if (p.shape === 'sketch' && p.prof) {
        if (inset > 0) return null;
        const Y = [tVec[1] * vVec[2] - tVec[2] * vVec[1], tVec[2] * vVec[0] - tVec[0] * vVec[2], tVec[0] * vVec[1] - tVec[1] * vVec[0]];
        const o = [0, 1, 2].map((k) => P[k] - vVec[k] * p.prof.c[0] - Y[k] * p.prof.c[1]);
        return loopWire(p.prof.outer, planeMap({ o, x: vVec, n: tVec }), true);
      }
      if (p.shape === 'rect') {
        const w = pos(p.w, 6) / 2 - inset, h = pos(p.h, 4) / 2 - inset;
        if (w <= 0 || h <= 0) return null;
        const q = (a, b) => [0, 1, 2].map((k) => P[k] + vVec[k] * a + nVec[k] * b);
        const c = [q(-w, -h), q(w, -h), q(w, h), q(-w, h)];
        const ls = [R.makeLine(c[0], c[1]), R.makeLine(c[1], c[2]), R.makeLine(c[2], c[3]), R.makeLine(c[3], c[0])];
        try { return R.assembleWire(ls); } finally { ls.forEach(safeDelete); }
      }
      const r = pos(p.d, 6) / 2 - inset; if (r <= 0) return null;
      const ce = R.makeCircle(r, P, tVec);
      try { return R.assembleWire([ce]); } finally { safeDelete(ce); }
    };
    try {
      return sweepProfileAlongSpine(spine, profAt, P0, T, N, V, p);
    } finally {
      safeDelete(spine);
    }
  }

  // Feder / Spirale: zylindrische Schraubenlinie, Kegel-Feder oder flache Spirale mit Profil (Draht-Ø, Rechteck oder Skizze)
  function buildHelix(p) {
    const form = p.form === 'cone' || p.form === 'spiral' ? p.form : 'cyl';
    const by = p.by === 'heightTurns' || p.by === 'heightPitch' ? p.by : 'pitchTurns';
    const left = p.dir === 'left';
    const s = left ? -1 : 1;
    const startAngle = num(p.startAngle, 0);
    let r1, r2;
    if (form === 'cyl') {
      r1 = r2 = pos(p.d, 20) / 2;
    } else {
      r1 = pos(p.r1, form === 'spiral' ? 5 : 10);
      r2 = pos(p.r2, form === 'spiral' ? 25 : 5);
    }
    let turns, pitch, height;
    if (form === 'spiral') {
      turns = pos(p.turns, 3);
      pitch = 0;
      height = 0;
    } else if (by === 'heightTurns') {
      turns = pos(p.turns, 5);
      height = pos(p.height, 25);
      pitch = height / turns;
    } else if (by === 'heightPitch') {
      height = pos(p.height, 25);
      pitch = pos(p.pitch, 5);
      turns = height / pitch;
    } else {
      turns = pos(p.turns, 5);
      pitch = pos(p.pitch, 5);
      height = turns * pitch;
    }
    const shapeMode = p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && p.prof ? 'sketch' : 'circle';
    let radHalf = 1, axHalf = 1;
    if (shapeMode === 'circle') {
      radHalf = axHalf = pos(p.wireD, 2) / 2;
    } else if (shapeMode === 'rect') {
      radHalf = pos(p.profW, 2) / 2;
      axHalf = pos(p.profH, 2) / 2;
    } else if (p.prof && p.prof.outer) {
      const lp = p.prof.outer, c = p.prof.c || [0, 0];
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      const addPt = (q) => {
        if (!q) return;
        const du = q[0] - c[0], dv = q[1] - c[1];
        if (du < minU) minU = du; if (du > maxU) maxU = du;
        if (dv < minV) minV = dv; if (dv > maxV) maxV = dv;
      };
      if (lp.circle) { addPt([lp.circle.c[0] - lp.circle.r, lp.circle.c[1] - lp.circle.r]); addPt([lp.circle.c[0] + lp.circle.r, lp.circle.c[1] + lp.circle.r]); }
      else if (lp.ellipse) { const mr = Math.max(lp.ellipse.rx, lp.ellipse.ry); addPt([lp.ellipse.c[0] - mr, lp.ellipse.c[1] - mr]); addPt([lp.ellipse.c[0] + mr, lp.ellipse.c[1] + mr]); }
      else if (Array.isArray(lp.segs)) for (const g of lp.segs) { addPt(g.a); addPt(g.m); addPt(g.b); }
      if (isFinite(minU)) {
        radHalf = Math.max(0.1, (maxU - minU) / 2);
        axHalf = Math.max(0.1, (maxV - minV) / 2);
      }
    }
    if (turns < 0.1 || turns > 80) throw new Error('Die Anzahl der Windungen muss zwischen 0,1 und 80 liegen.');
    if (form !== 'spiral' && pitch < 0.05) throw new Error('Die Steigung ist zu klein (mindestens 0,05 mm).');
    if (form === 'spiral' && Math.abs(r2 - r1) < 0.1) throw new Error('Bei einer flachen Spirale müssen Anfangs- und Endradius verschieden sein.');
    if (Math.min(r1, r2) <= radHalf + 0.05) throw new Error('Der Radius ist zu klein für diesen Querschnitt – die Windungen würden sich in der Mitte überlappen.');
    if (form !== 'spiral' && turns > 1 && Math.abs(r2 - r1) < 1e-4 && pitch <= axHalf * 2 * 0.98) {
      throw new Error('Die Steigung muss größer als die Drahtdicke sein, sonst durchdringen sich die Windungen.');
    }
    if (form === 'spiral' && turns > 1 && Math.abs(r2 - r1) / turns <= radHalf * 2 * 0.98) {
      throw new Error('Der Abstand zwischen den Windungen der Spirale ist kleiner als die Profilbreite.');
    }

    const z0 = axHalf;
    const P0 = [r1, 0, z0];
    const T0 = norm([r2 - r1, s * 2 * Math.PI * turns * r1, height]);
    const refUp = Math.abs(T0[2]) < 0.99 ? [0, 0, 1] : [0, 1, 0];
    const dUp = dot(refUp, T0);
    const Vax = norm([refUp[0] - T0[0] * dUp, refUp[1] - T0[1] * dUp, refUp[2] - T0[2] * dUp]);
    let Vrad = norm(cross(T0, Vax));
    if (Vrad[0] < 0) Vrad = mul(Vrad, -1);

    let spine = null;
    if (form === 'cyl' || (form === 'cone' && Math.abs(r2 - r1) < 1e-4)) {
      spine = R.makeHelix(pitch, height, r1, [0, 0, z0], [0, 0, 1], left);
    } else {
      const angTotal = s * 2 * Math.PI * turns;
      const dr = r2 - r1;
      const ptAt = (u) => {
        const r = r1 + dr * u, th = angTotal * u;
        return [r * Math.cos(th), r * Math.sin(th), z0 + height * u];
      };
      const derivAt = (u) => {
        const r = r1 + dr * u, th = angTotal * u, c = Math.cos(th), sn = Math.sin(th);
        return [dr * c - r * angTotal * sn, dr * sn + r * angTotal * c, height];
      };
      const nSeg = Math.max(24, Math.min(1800, Math.round(turns * 32)));
      const pts = [];
      for (let i = 0; i <= nSeg; i++) pts.push(ptAt(i / nSeg));
      try {
        const edge = R.makeBSplineApproximation(pts, { tolerance: 1e-4, degMin: 3, degMax: 6 });
        spine = R.assembleWire([edge]);
        safeDelete(edge);
      } catch (_) {
        const segs = Math.max(8, Math.min(640, Math.round(turns * 8)));
        const edges = [];
        for (let i = 0; i < segs; i++) {
          const u0 = i / segs, u1 = (i + 1) / segs, du = (u1 - u0) / 3;
          const a = ptAt(u0), b = ptAt(u1), da = derivAt(u0), db = derivAt(u1);
          edges.push(R.makeBezierCurve([a, add(a, mul(da, du)), sub(b, mul(db, du)), b]));
        }
        spine = R.assembleWire(edges);
        for (const e of edges) safeDelete(e);
      }
    }

    const makeProf = (inset) => {
      if (shapeMode === 'sketch' && p.prof) {
        if (inset > 0) return null;
        const Y = cross(T0, Vrad);
        const o = [0, 1, 2].map((k) => P0[k] - Vrad[k] * p.prof.c[0] - Y[k] * p.prof.c[1]);
        return loopWire(p.prof.outer, planeMap({ o, x: Vrad, n: T0 }), true);
      }
      if (shapeMode === 'rect') {
        const w = radHalf - inset, hh = axHalf - inset;
        if (w <= 0 || hh <= 0) return null;
        const q = (a, b) => [0, 1, 2].map((k) => P0[k] + Vrad[k] * a + Vax[k] * b);
        const c = [q(-w, -hh), q(w, -hh), q(w, hh), q(-w, hh)];
        const ls = [R.makeLine(c[0], c[1]), R.makeLine(c[1], c[2]), R.makeLine(c[2], c[3]), R.makeLine(c[3], c[0])];
        const wWire = R.assembleWire(ls);
        for (const l of ls) safeDelete(l);
        return wWire;
      }
      const r = radHalf - inset;
      if (r <= 0) return null;
      const cEdge = R.makeCircle(r, P0, T0);
      const wWire = R.assembleWire([cEdge]);
      safeDelete(cEdge);
      return wWire;
    };

    const doSweep = (w) => {
      try {
        return R.genericSweep(w, spine, { frenet: true, forceProfileSpineOthogonality: true });
      } catch (_) {
        return R.genericSweep(w, spine, { frenet: false, transitionMode: 'round', forceProfileSpineOthogonality: true });
      }
    };

    let shape = null;
    try {
      const outerWire = makeProf(0);
      try {
        shape = doSweep(outerWire);
      } finally {
        safeDelete(outerWire);
      }
      const wall = num(p.wall, 0);
      if (wall > 0 && shapeMode !== 'sketch') {
        const innerWire = makeProf(wall);
        if (!innerWire) throw new Error('Die Wandstärke ist größer als der halbe Draht-Querschnitt.');
        let cutter = null;
        try {
          cutter = doSweep(innerWire);
          const res = shape.cut(cutter);
          safeDelete(shape);
          shape = res;
        } finally {
          safeDelete(innerWire);
          safeDelete(cutter);
        }
      }
      if (Math.abs(startAngle) > 1e-6) {
        const rot = shape.rotate(startAngle, [0, 0, 0], [0, 0, 1]);
        safeDelete(shape);
        shape = rot;
      }
      return shape;
    } finally {
      safeDelete(spine);
    }
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
  function buildSplineShaft(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const n = Math.max(4, Math.min(24, Math.round(num(p.teeth, num(sp.n, 6)))));
    const d = pos(p.d, pos(sp.d, 16));
    const D = pos(p.D, pos(sp.D, 20));
    const b = pos(p.b, pos(sp.b, 4));
    const L = pos(p.length, 40);
    const bore = Math.max(0, num(p.bore, 0));
    const rIn = d / 2, rOut = D / 2;
    if (!(rOut > rIn + 0.1)) throw new Error('Keilwelle: Der Außendurchmesser D muss größer als der Innendurchmesser d sein.');
    if (!(b > 0.2) || b / 2 >= rIn * 0.96) throw new Error('Keilwelle: Die Keilbreite b passt nicht zum Innendurchmesser.');
    const aIn = Math.asin((b / 2) / rIn);
    if (n * aIn >= Math.PI - 0.02) throw new Error('Keilwelle: Zu viele oder zu breite Keile für diesen Durchmesser.');
    const aOut = Math.asin((b / 2) / rOut);
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
    const edges = [];
    let wire = null, face = null, shape = null;
    try {
      for (let k = 0; k < n; k++) {
        const th = (2 * Math.PI * k) / n;
        const thNext = (2 * Math.PI * (k + 1)) / n;
        edges.push(R.makeLine(P(rIn, th - aIn), P(rOut, th - aOut)));
        edges.push(R.makeThreePointArc(P(rOut, th - aOut), P(rOut, th), P(rOut, th + aOut)));
        edges.push(R.makeLine(P(rOut, th + aOut), P(rIn, th + aIn)));
        edges.push(R.makeThreePointArc(P(rIn, th + aIn), P(rIn, th + Math.PI / n), P(rIn, thNext - aIn)));
      }
      wire = R.assembleWire(edges);
      face = R.makeFace(wire);
      shape = R.basicFaceExtrusion(face, new R.Vector([0, 0, L]));
      if (bore > 0.1 && bore < d - 0.4) {
        const cyl = R.makeCylinder(bore / 2, L + 2, [0, 0, -1], [0, 0, 1]);
        try {
          const cut = shape.cut(cyl);
          safeDelete(shape);
          shape = cut;
        } finally { safeDelete(cyl); }
      }
      const out = shape;
      shape = null;
      return out;
    } finally {
      for (const e of edges) safeDelete(e);
      safeDelete(wire); safeDelete(face); safeDelete(shape);
    }
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
  function buildSteppedShaft(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, pos(p.d, 10));
    const L = pos(sp.L, pos(p.length, 100));
    const endChamfer = Math.max(0, num(sp.endChamfer, num(p.endChamfer, 0.5)));
    const stepChamfer = Math.max(0, num(sp.stepChamfer, num(p.stepChamfer, 0.3)));
    let sections = Array.isArray(sp.sections) && sp.sections.length
      ? sp.sections.map((s) => ({ d: pos(s.d, d), z0: num(s.z0, 0), z1: num(s.z1, L), len: pos(s.len, L) }))
      : null;
    if (!sections) {
      const s1D = Math.max(0, num(p.step1D, 0)), s1L = Math.max(0, num(p.step1Len, 0));
      const s2D = Math.max(0, num(p.step2D, 0)), s2L = Math.max(0, num(p.step2Len, 0));
      const has1 = s1D >= 0.5 && s1L >= 0.5 && Math.abs(s1D - d) > 0.05;
      const has2 = s2D >= 0.5 && s2L >= 0.5 && Math.abs(s2D - d) > 0.05;
      let l1 = has1 ? s1L : 0, l2 = has2 ? s2L : 0;
      const maxSum = Math.max(0, L - Math.max(1, Math.min(2, L * 0.1)));
      if (l1 + l2 > maxSum && l1 + l2 > 0) { const f = maxSum / (l1 + l2); l1 *= f; l2 *= f; }
      sections = [];
      let z = 0;
      if (has1 && l1 >= 0.3) { sections.push({ d: s1D, z0: 0, z1: l1, len: l1 }); z = l1; }
      const zMidEnd = has2 && l2 >= 0.3 ? L - l2 : L;
      sections.push({ d, z0: z, z1: zMidEnd, len: zMidEnd - z });
      if (has2 && l2 >= 0.3) sections.push({ d: s2D, z0: zMidEnd, z1: L, len: L - zMidEnd });
    }
    const pts = [[0, 0]];
    const r0 = sections[0].d / 2;
    const ce0 = Math.min(endChamfer, r0 * 0.4, sections[0].len * 0.35);
    let zCur = 0;
    if (ce0 > 1e-4) {
      pts.push([r0 - ce0, 0], [r0, ce0]);
      zCur = ce0;
    } else {
      pts.push([r0, 0]);
    }
    for (let i = 0; i < sections.length - 1; i++) {
      const sA = sections[i], sB = sections[i + 1];
      const rA = sA.d / 2, rB = sB.d / 2, zT = sA.z1;
      const dr = Math.abs(rB - rA);
      const roomA = Math.max(0, zT - zCur - 0.05);
      const roomB = Math.max(0, sB.len * 0.35);
      const cs = Math.min(stepChamfer, dr * 0.45, roomA, roomB);
      if (rB > rA) {
        pts.push([rA, zT]);
        if (cs > 1e-4) {
          pts.push([rB - cs, zT], [rB, zT + cs]);
          zCur = zT + cs;
        } else {
          pts.push([rB, zT]);
          zCur = zT;
        }
      } else {
        if (cs > 1e-4) {
          pts.push([rA, zT - cs], [rA - cs, zT], [rB, zT]);
        } else {
          pts.push([rA, zT], [rB, zT]);
        }
        zCur = zT;
      }
    }
    const last = sections[sections.length - 1];
    const rLast = last.d / 2;
    const ce1 = Math.min(endChamfer, rLast * 0.4, Math.max(0, L - zCur - 0.05) * 0.4);
    if (ce1 > 1e-4) {
      pts.push([rLast, L - ce1], [rLast - ce1, L], [0, L]);
    } else {
      pts.push([rLast, L], [0, L]);
    }
    const clean = [];
    for (const q of pts) {
      if (!clean.length || Math.hypot(q[0] - clean[clean.length - 1][0], q[1] - clean[clean.length - 1][1]) > 1e-5) {
        clean.push(q);
      }
    }
    return revolveProfile(clean);
  }
  function buildShaftCollar(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, pos(p.d, 10));
    const D = pos(sp.D, pos(p.D, Math.max(d + 6, d * 1.8)));
    const b = pos(sp.b, pos(p.width, Math.max(5, d * 0.8)));
    const boreEff = pos(sp.boreEff, d + Math.max(0, num(p.clear, 0.05)) + printFitDelta(p.printFit));
    const style = (sp.style || p.style) === 'clamp' ? 'clamp' : 'setscrew';
    const screwD = pos(sp.screwD, d <= 5 ? 3 : d <= 8 ? 4 : d <= 11 ? 5 : 6);
    const ri = Math.max(0.5, boreEff / 2);
    const ro = Math.max(ri + 1.0, D / 2);
    const wall = ro - ri;
    const c = Math.min(0.4, wall * 0.15, b * 0.12);
    let shape = revolveProfile([[ri + c, 0], [ro - c, 0], [ro, c], [ro, b - c], [ro - c, b], [ri + c, b], [ri, b - c], [ri, c]]);
    if (style === 'clamp') {
      const slotW = Math.min(Math.max(0.8, d * 0.1), 2.5);
      const slot = R.makeBox([ri - 0.5, -slotW / 2, -1], [ro + 1, slotW / 2, b + 1]);
      let next = null;
      try {
        next = shape.cut(slot);
        safeDelete(shape);
        shape = next;
        next = null;
      } finally { safeDelete(slot); safeDelete(next); }
      const xM = (ri + ro) / 2;
      const rScrew = Math.min(screwD * 0.45, wall * 0.34, b * 0.30);
      if (rScrew > 0.3) {
        const yHalf = Math.sqrt(Math.max(1, ro * ro - xM * xM)) + 1.5;
        const hole = R.makeCylinder(rScrew, 2 * yHalf, [xM, -yHalf, b / 2], [0, 1, 0]);
        try {
          next = shape.cut(hole);
          safeDelete(shape);
          shape = next;
          next = null;
        } finally { safeDelete(hole); safeDelete(next); }
      }
    } else {
      const rTap = Math.min(screwD * 0.42, b * 0.32);
      if (rTap > 0.3) {
        const hole = R.makeCylinder(rTap, ro - ri + 2, [ri - 0.5, 0, b / 2], [1, 0, 0]);
        let next = null;
        try {
          next = shape.cut(hole);
          safeDelete(shape);
          shape = next;
          next = null;
        } finally { safeDelete(hole); safeDelete(next); }
      }
    }
    return shape;
  }
  function buildShaftCoupling(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d1 = pos(sp.d1, pos(p.d1, 10));
    const d2 = pos(sp.d2, pos(p.d2, d1));
    const clr = Math.max(0, num(p.clear, 0.05)) + printFitDelta(p.printFit);
    const d1Eff = pos(sp.d1Eff, d1 + clr);
    const d2Eff = pos(sp.d2Eff, d2 + clr);
    const maxBore = Math.max(d1Eff, d2Eff);
    const D = Math.max(maxBore + 4, pos(sp.D, pos(p.D, 30)));
    const L = Math.max(10, pos(sp.L, pos(p.length, 45)));
    const style = (sp.style || p.style);
    const st = style === 'clamp' || style === 'flange' ? style : 'rigid';
    const screwD = pos(sp.screwD, maxBore <= 6 ? 3 : maxBore <= 10 ? 4 : maxBore <= 16 ? 5 : 6);
    const r1 = Math.max(0.5, d1Eff / 2), r2 = Math.max(0.5, d2Eff / 2);
    const rMaxBore = Math.max(r1, r2);
    const ro = Math.max(rMaxBore + 2, D / 2);
    const wall = ro - rMaxBore;
    const c = Math.min(0.6, wall * 0.15, L * 0.04);
    const zMid = L / 2;
    const pts = [];
    let rHub = ro, rFl = ro, zF0 = 0, zF1 = L;
    if (st === 'flange') {
      rHub = Math.max(rMaxBore + 2.5, ro * 0.78);
      rFl = Math.max(rHub + 5, ro * 1.45);
      const tFl = Math.min(Math.max(4, L * 0.28), L * 0.45);
      zF0 = (L - tFl) / 2;
      zF1 = (L + tFl) / 2;
      const cf = Math.min(0.5, tFl * 0.12, (rFl - rHub) * 0.15);
      const ch = Math.min(c, (rHub - rMaxBore) * 0.15);
      pts.push(
        [rHub - ch, 0], [rHub, ch], [rHub, zF0],
        [rFl - cf, zF0], [rFl, zF0 + cf], [rFl, zF1 - cf], [rFl - cf, zF1],
        [rHub, zF1], [rHub, L - ch], [rHub - ch, L],
      );
    } else {
      pts.push([ro - c, 0], [ro, c], [ro, L - c], [ro - c, L]);
    }
    if (Math.abs(r1 - r2) < 1e-4) {
      pts.push([r1 + c, L], [r1, L - c], [r1, c], [r1 + c, 0]);
    } else {
      pts.push([r2 + c, L], [r2, L - c], [r2, zMid], [r1, zMid], [r1, c], [r1 + c, 0]);
    }
    const clean = [];
    for (const q of pts) {
      if (!clean.length || Math.hypot(q[0] - clean[clean.length - 1][0], q[1] - clean[clean.length - 1][1]) > 1e-5) {
        clean.push(q);
      }
    }
    let shape = revolveProfile(clean);
    const cutWith = (tool) => {
      let next = null;
      try {
        next = shape.cut(tool);
        safeDelete(shape);
        shape = next;
        next = null;
      } finally { safeDelete(tool); safeDelete(next); }
    };
    if (st === 'rigid') {
      const rTap = Math.min(screwD * 0.42, L * 0.12);
      if (rTap > 0.3) {
        cutWith(R.makeCylinder(rTap, ro - r1 + 2, [r1 - 0.5, 0, L * 0.25], [1, 0, 0]));
        cutWith(R.makeCylinder(rTap, ro - r1 + 2, [0, r1 - 0.5, L * 0.25], [0, 1, 0]));
        cutWith(R.makeCylinder(rTap, ro - r2 + 2, [r2 - 0.5, 0, L * 0.75], [1, 0, 0]));
        cutWith(R.makeCylinder(rTap, ro - r2 + 2, [0, r2 - 0.5, L * 0.75], [0, 1, 0]));
      }
    } else if (st === 'clamp') {
      const slotW = Math.min(Math.max(1.0, Math.max(d1Eff, d2Eff) * 0.1), 2.5);
      cutWith(R.makeBox([Math.min(r1, r2) - 0.5, -slotW / 2, -1], [ro + 1, slotW / 2, L + 1]));
      const xM = (rMaxBore + ro) / 2;
      const rScrew = Math.min(screwD * 0.45, wall * 0.34, L * 0.10);
      if (rScrew > 0.3) {
        const yHalf = Math.sqrt(Math.max(1, ro * ro - xM * xM)) + 1.5;
        cutWith(R.makeCylinder(rScrew, 2 * yHalf, [xM, -yHalf, L * 0.25], [0, 1, 0]));
        cutWith(R.makeCylinder(rScrew, 2 * yHalf, [xM, -yHalf, L * 0.75], [0, 1, 0]));
      }
    } else if (st === 'flange') {
      const rBC = (rHub + rFl) / 2;
      const rBolt = Math.min(screwD * 0.55, (rFl - rHub) * 0.28);
      if (rBolt > 0.3) {
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          cutWith(R.makeCylinder(rBolt, zF1 - zF0 + 2, [rBC * Math.cos(a), rBC * Math.sin(a), zF0 - 1], [0, 0, 1]));
        }
      }
    }
    return shape;
  }
  function buildBatteryHolder(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const count = Math.max(1, Math.min(8, Math.round(num(sp.count, num(p.count, 2)))));
    const wall = Math.max(0.8, pos(sp.wall, pos(p.wall, 2)));
    const floor = Math.max(0.8, pos(sp.floor, pos(p.floor, 2)));
    const divider = Math.max(0, num(sp.divider, num(p.divider, 1.2)));
    const slotW = Math.max(4, pos(sp.slotW, 15.3));
    const innerW = Math.max(slotW, pos(sp.innerW, count * slotW + Math.max(0, count - 1) * divider));
    const innerL = Math.max(15, pos(sp.innerL, 53.5));
    const innerH = Math.max(4, pos(sp.innerH, 14.9));
    const divH = num(sp.divH, count > 1 && divider >= 0.4 ? Math.min(innerH - 1.0, slotW * 0.6) : 0);
    const outerW = Math.max(innerW + 2 * wall, pos(sp.outerW, innerW + 2 * wall));
    const outerL = Math.max(innerL + 2 * wall, pos(sp.outerL, innerL + 2 * wall));
    const outerH = Math.max(floor + innerH, pos(sp.outerH, floor + innerH));
    const wireHoles = sp.wireHoles !== undefined ? !!sp.wireHoles : (p.wireHoles !== 'nein' && p.wireHoles !== false);
    const wireHoleD = Math.max(0.8, num(sp.wireHoleD, 2.5));
    const mountHoles = sp.mountHoles !== undefined ? !!sp.mountHoles : (p.mountHoles === 'ja' || p.mountHoles === true);

    const outer = R.makeBox([-outerW / 2, -outerL / 2, 0], [outerW / 2, outerL / 2, outerH]);
    const cavity = R.makeBox([-innerW / 2, -innerL / 2, floor], [innerW / 2, innerL / 2, outerH + 1]);
    let shape = null;
    try {
      shape = outer.cut(cavity);
    } finally {
      safeDelete(outer);
      safeDelete(cavity);
    }

    const cutWith = (tool) => {
      let next = null;
      try {
        next = shape.cut(tool);
        safeDelete(shape);
        shape = next;
        next = null;
      } finally { safeDelete(tool); safeDelete(next); }
    };
    const fuseWith = (part) => {
      let next = null;
      try {
        next = shape.fuse(part);
        safeDelete(shape);
        shape = next;
        next = null;
      } finally { safeDelete(part); safeDelete(next); }
    };

    if (count > 1 && divider >= 0.4 && divH >= 1) {
      const eps = Math.min(0.25, wall * 0.4, floor * 0.4);
      for (let i = 1; i < count; i++) {
        const xDiv = -innerW / 2 + i * slotW + (i - 0.5) * divider;
        fuseWith(R.makeBox([xDiv - divider / 2, -innerL / 2 - eps, floor - eps], [xDiv + divider / 2, innerL / 2 + eps, floor + divH]));
      }
    }

    if (wireHoles && wireHoleD >= 0.5) {
      const rWire = Math.min(wireHoleD / 2, Math.max(0.5, innerH * 0.35));
      const zWire = floor + innerH * 0.5;
      for (let i = 0; i < count; i++) {
        const cx = -innerW / 2 + i * (slotW + divider) + slotW / 2;
        cutWith(R.makeCylinder(rWire, outerL + 1, [cx, -outerL / 2 - 0.5, zWire], [0, 1, 0]));
      }
    }

    if (mountHoles) {
      const rMnt = 1.7;
      if (count === 1) {
        const yOff = Math.min(innerL * 0.28, Math.max(4, innerL / 2 - 6));
        cutWith(R.makeCylinder(rMnt, floor + 1, [0, -yOff, -0.5], [0, 0, 1]));
        cutWith(R.makeCylinder(rMnt, floor + 1, [0, yOff, -0.5], [0, 0, 1]));
      } else {
        const x1 = -innerW / 2 + slotW / 2;
        const x2 = innerW / 2 - slotW / 2;
        cutWith(R.makeCylinder(rMnt, floor + 1, [x1, 0, -0.5], [0, 0, 1]));
        cutWith(R.makeCylinder(rMnt, floor + 1, [x2, 0, -0.5], [0, 0, 1]));
      }
    }

    return shape;
  }
  function buildStdORing(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d1 = pos(sp.d1, pos(p.d1, 20));
    const d2 = pos(sp.d2, pos(p.d2, 2));
    if (d1 < 0.2 || d2 < 0.1) throw new Error('O-Ring: Durchmesser und Schnurstärke müssen positiv sein.');
    const rr = d2 / 2, rm = (d1 + d2) / 2;
    let circ = null, wire = null, face = null;
    try {
      circ = R.makeCircle(rr, [rm, 0, rr], [0, 1, 0]);
      wire = R.assembleWire([circ]);
      face = R.makeFace(wire);
      return R.revolution(face, [0, 0, 0], [0, 0, 1], 360);
    } finally {
      safeDelete(circ); safeDelete(wire); safeDelete(face);
    }
  }
  function buildStdORingGroove(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const mode = sp.mode || p.mode || 'axial';
    const b = pos(sp.b, 2.8);
    const t = pos(sp.t, 1.55);
    const extra = Math.max(0.2, num(sp.extra, num(p.extra, 0.5)));
    const ri = Math.max(0.2, pos(sp.ri, 9.6));
    const ro = Math.max(ri + 0.4, pos(sp.ro, 12.4));
    if (mode === 'axial') {
      return revolveProfile([[ri, -t], [ro, -t], [ro, extra], [ri, extra]]);
    }
    return revolveProfile([[ri, 0], [ro, 0], [ro, b], [ri, b]]);
  }
  function buildStdShaftSeal(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, 20), D = pos(sp.D, 35), b = pos(sp.b, pos(p.b, 7));
    const form = (sp.form || p.form) === 'A' ? 'A' : 'AS';
    const ri = d / 2, ro = Math.max(ri + 1.5, D / 2), rw = ro - ri;
    const c = Math.min(0.4, rw * 0.08, b * 0.08);
    const rCavIn = ri + rw * 0.25;
    const rRim = ri + rw * 0.46;
    const rCavOut = Math.min(ro - c - 0.3, ri + rw * 0.58);
    const pts = [
      [ro - c, 0],
      [ro, c],
      [ro, b - c],
      [ro - c, b],
      [rRim, b],
    ];
    if (form === 'AS') {
      pts.push([ri, b * 0.88]);
    }
    pts.push(
      [rCavIn, b * 0.64],
      [ri, b * 0.32],
      [rCavIn, b * 0.12],
      [rCavIn, b * 0.46],
      [rCavOut, b * 0.46],
      [rCavOut, 0],
    );
    return revolveProfile(pts);
  }
  function sweepRoundWire(spine, p0, t0, rWire) {
    let cEdge = null, prof = null;
    try {
      cEdge = R.makeCircle(rWire, p0, t0);
      prof = R.assembleWire([cEdge]);
      try {
        return R.genericSweep(prof, spine, { frenet: true, forceProfileSpineOthogonality: true });
      } catch (_) {
        return R.genericSweep(prof, spine, { frenet: false, transitionMode: 'round', forceProfileSpineOthogonality: true });
      }
    } finally {
      safeDelete(cEdge); safeDelete(prof);
    }
  }
  function buildStdCompSpring(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, 2);
    const Dm = Math.max(d * 1.6, pos(sp.Dm, 16));
    const n = Math.max(0.5, Math.min(60, pos(sp.n, 8)));
    const ends = (sp.ends || p.ends) === 'open' ? 'open' : 'ground';
    const endAdd = ends === 'open' ? d : 1.5 * d;
    const L0 = Math.max(endAdd + n * d * 1.04, pos(sp.L0, n * 5 + endAdd));
    const Rm = Dm / 2, rw = d / 2;
    let spine = null, swept = null, boxCyl = null;
    try {
      if (ends === 'open') {
        const H = L0 - d, pEff = H / n, z0 = rw;
        const t0 = norm([0, 2 * Math.PI * Rm, pEff]);
        spine = R.makeHelix(pEff, H, Rm, [0, 0, z0], [0, 0, 1], false);
        return sweepRoundWire(spine, [Rm, 0, z0], t0, rw);
      }
      const nSwept = n + 0.5;
      const H = L0 - 0.5 * d;
      const pEff = H / nSwept;
      const z0 = 0.25 * d;
      const t0 = norm([0, 2 * Math.PI * Rm, pEff]);
      spine = R.makeHelix(pEff, H, Rm, [0, 0, z0], [0, 0, 1], false);
      swept = sweepRoundWire(spine, [Rm, 0, z0], t0, rw);
      boxCyl = R.makeCylinder(Rm + rw + 2, L0, [0, 0, 0], [0, 0, 1]);
      const out = swept.intersect(boxCyl);
      if (!out || out.isNull) throw new Error('Druckfeder konnte nicht geschliffen werden.');
      return out;
    } finally {
      safeDelete(spine); safeDelete(swept); safeDelete(boxCyl);
    }
  }
  function buildStdExtSpring(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const d = pos(sp.d, 1.5);
    const Dm = Math.max(d * 2.2, pos(sp.Dm, 15));
    const n = Math.max(2, Math.min(60, pos(sp.n, 24)));
    const hookAngle = Number(sp.hookAngle ?? p.hookAngle) === 90 ? 90 : 0;
    const Rm = Dm / 2, rw = d / 2;
    const coilPitch = pos(sp.coilPitch, d * 1.08);
    const rEye = pos(sp.rEye, Math.max(d * 1.15, Dm * 0.45));
    const turnsEff = hookAngle === 90 ? n + 0.25 : n;
    const H = Math.max(turnsEff * d * 1.04, n * coilPitch);
    const pEff = H / turnsEff;
    const zBotEye = rEye + rw;
    const zCoilStart = 2 * rEye + d;
    const zCoilEnd = zCoilStart + H;
    const zTopEye = zCoilEnd + rw + rEye;
    const k = 0.45, dz = k * (pEff / (2 * Math.PI));
    const th = (hookAngle * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
    const rotZ = ([x, y, z]) => [x * cs - y * sn, x * sn + y * cs, z];
    const ptBot = (a) => [rEye * Math.cos(a), 0, zBotEye + rEye * Math.sin(a)];
    const ptTop = (a) => rotZ([rEye * Math.cos(a), 0, zTopEye + rEye * Math.sin(a)]);

    let coilSpine = null, spine = null;
    const edges = [];
    try {
      // Untere 1/1 deutsche Öse (zwei Kreisbögen) + G1-stetiger Übergang zum Wicklungsanfang
      const b0 = ptBot(-0.12 * Math.PI), b1 = ptBot(-Math.PI), b2 = ptBot(-1.5 * Math.PI);
      edges.push(R.makeThreePointArc(b0, ptBot(-0.56 * Math.PI), b1));
      edges.push(R.makeThreePointArc(b1, ptBot(-1.25 * Math.PI), b2));
      edges.push(R.makeBezierCurve([b2, [Rm * k, 0, zBotEye + rEye], [Rm, -Rm * k, zCoilStart - dz], [Rm, 0, zCoilStart]]));

      // Zylindrische Federwicklung
      coilSpine = R.makeHelix(pEff, H, Rm, [0, 0, zCoilStart], [0, 0, 1], false);
      for (const ce of coilSpine.edges) edges.push(ce);

      // G1-stetiger Übergang vom Wicklungsende + obere 1/1 deutsche Öse (0° oder 90° gedreht)
      const tA = rotZ([Rm, 0, zCoilEnd]);
      const tP1 = rotZ([Rm, Rm * k, zCoilEnd + dz]);
      const tP2 = rotZ([Rm * k, 0, zCoilEnd + rw]);
      const tB = ptTop(1.5 * Math.PI);
      edges.push(R.makeBezierCurve([tA, tP1, tP2, tB]));
      const t1 = ptTop(0.5 * Math.PI), t2 = ptTop(0.12 * Math.PI);
      edges.push(R.makeThreePointArc(tB, ptTop(Math.PI), t1));
      edges.push(R.makeThreePointArc(t1, ptTop(0.31 * Math.PI), t2));

      spine = R.assembleWire(edges);
      const tStart = norm([-Math.sin(-0.12 * Math.PI), 0, Math.cos(-0.12 * Math.PI)]);
      return sweepRoundWire(spine, b0, tStart, rw);
    } finally {
      for (const e of edges) safeDelete(e);
      safeDelete(coilSpine);
      safeDelete(spine);
    }
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
    if (lib === 'splineShaft') return buildSplineShaft(p);
    if (lib === 'stdBearing') return buildStdBearing(p);
    if (lib === 'stdSleeve') return buildStdSleeve(p);
    if (lib === 'stdORing') return buildStdORing(p);
    if (lib === 'stdORingGroove') return buildStdORingGroove(p);
    if (lib === 'stdShaftSeal') return buildStdShaftSeal(p);
    if (lib === 'stdCompSpring') return buildStdCompSpring(p);
    if (lib === 'stdExtSpring') return buildStdExtSpring(p);
    if (lib === 'steppedShaft') return buildSteppedShaft(p);
    if (lib === 'shaftCollar') return buildShaftCollar(p);
    if (lib === 'shaftCoupling') return buildShaftCoupling(p);
    if (lib === 'batteryHolder') return buildBatteryHolder(p);
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
    if (lib === 'internalGear') return buildInternalGear(p);
    if (lib === 'gearRack') return buildGearRack(p);
    if (lib === 'worm') return buildWorm(p);
    if (lib === 'wormWheel') return buildWormWheel(p);
    if (lib === 'helicalGear') {
      return buildHelicalGear(p);
    }
    if (lib === 'bevelGear') {
      return buildBevelGear(p);
    }
    if (lib === 'timingPulley') return buildTimingPulley(p);
    if (lib === 'sprocket') return buildSprocket(p);
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
  function involuteGearWire(z, m, zOff = 0, rotRad = 0, N = 6) {
    const alpha = (20 * Math.PI) / 180;
    const rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = Math.max(0.5, rp - 1.25 * m);
    const inv = (a) => Math.tan(a) - a;
    const tooth = (2 * Math.PI) / z;
    const half = Math.PI / (2 * z) + inv(alpha);
    const rStart = Math.max(rb, rf);
    const P = (r, a) => [r * Math.cos(a + rotRad), r * Math.sin(a + rotRad), zOff];
    const flankAng = (r) => half - inv(Math.acos(Math.min(1, rb / r)));
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
    try {
      return R.assembleWire(edges);
    } finally {
      for (const e of edges) safeDelete(e);
    }
  }
  function isClosedValidSolid(shape) {
    if (!shape || shape.isNull) return false;
    let chk = null;
    try {
      chk = new oc.BRepCheck_Analyzer(shape.wrapped, true);
      if (!chk.IsValid()) return false;
      return R.measureVolume(shape) > 1e-6;
    } catch (_) {
      return false;
    } finally {
      if (chk) chk.delete();
    }
  }
  function buildInternalGear(p) {
    const z = Math.max(12, Math.min(200, Math.round(num(p.teeth, 40))));
    const m = pos(p.module, 1.5), h = pos(p.h, 6), wall = Math.max(0.5, pos(p.wall, 5));
    const alpha = (20 * Math.PI) / 180;
    const rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = Math.max(0.5, rp - m), rf = rp + 1.25 * m, rOut = rf + wall;
    const inv = (a) => Math.tan(a) - a;
    const tooth = (2 * Math.PI) / z;
    const half = Math.PI / (2 * z) + inv(alpha);
    const rStart = Math.max(rb, ra);
    const flankAng = (r) => Math.max(1e-4, half - inv(Math.acos(Math.min(1, rb / r))));
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
    const N = 6;
    const edges = [];
    for (let i = 0; i < z; i++) {
      const c = i * tooth;
      const right = [], left = [];
      for (let k = 0; k <= N; k++) { const r = rStart + ((rf - rStart) * k) / N; right.push(P(r, c - flankAng(r))); }
      for (let k = N; k >= 0; k--) { const r = rStart + ((rf - rStart) * k) / N; left.push(P(r, c + flankAng(r))); }
      if (ra < rStart - 1e-6) edges.push(R.makeLine(P(ra, c - flankAng(rStart)), right[0]));
      edges.push(R.makeBSplineApproximation(right, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const rA = c - flankAng(rf), rB = c + flankAng(rf);
      if (rB - rA > 1e-4) edges.push(R.makeThreePointArc(right[N], P(rf, c), left[0]));
      edges.push(R.makeBSplineApproximation(left, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const tipA = c + flankAng(rStart);
      const endL = ra < rStart - 1e-6 ? P(ra, tipA) : left[N];
      if (ra < rStart - 1e-6) edges.push(R.makeLine(left[N], endL));
      const nextA = c + tooth - flankAng(rStart);
      const rTip = ra < rStart - 1e-6 ? ra : rStart;
      const nextStart = P(rTip, nextA);
      if (nextA - tipA > 1e-4) edges.push(R.makeThreePointArc(endL, P(rTip, (tipA + nextA) / 2), nextStart));
    }
    let outerEdge = null, outerWire = null, innerWire = null, holeWire = null, face = null, g = null;
    try {
      outerEdge = R.makeCircle(rOut, [0, 0, 0], [0, 0, 1]);
      outerWire = R.assembleWire([outerEdge]);
      innerWire = R.assembleWire(edges);
      holeWire = R.cast(innerWire.wrapped.Reversed());
      face = R.makeFace(outerWire, [holeWire]);
      g = R.basicFaceExtrusion(face, new R.Vector([0, 0, h]));
      if (isClosedValidSolid(g)) {
        const out = g;
        g = null;
        return out;
      }
      safeDelete(g); g = null;
    } catch (_) {
      safeDelete(g); g = null;
    } finally {
      for (const e of edges) safeDelete(e);
      safeDelete(outerEdge); safeDelete(outerWire); safeDelete(holeWire); safeDelete(face);
    }
    let outerCyl = null, plugFace = null, plug = null, cutRes = null;
    try {
      outerCyl = R.makeCylinder(rOut, h, [0, 0, 0], [0, 0, 1]);
      if (innerWire) {
        plugFace = R.makeFace(innerWire).translate([0, 0, -1]);
      } else {
        const pts = [];
        for (let i = 0; i < z; i++) {
          const c = i * tooth;
          for (let k = 0; k <= 5; k++) { const r = rStart + ((rf - rStart) * k) / 5; pts.push([r * Math.cos(c - flankAng(r)), r * Math.sin(c - flankAng(r)), -1]); }
          for (let k = 5; k >= 0; k--) { const r = rStart + ((rf - rStart) * k) / 5; pts.push([r * Math.cos(c + flankAng(r)), r * Math.sin(c + flankAng(r)), -1]); }
        }
        plugFace = polygonFace(pts);
      }
      plug = R.basicFaceExtrusion(plugFace, new R.Vector([0, 0, h + 2]));
      cutRes = outerCyl.cut(plug);
      if (!isClosedValidSolid(cutRes)) throw new Error('Innenzahnrad konnte nicht als geschlossener Körper erzeugt werden.');
      const out = cutRes;
      cutRes = null;
      return out;
    } finally {
      safeDelete(innerWire); safeDelete(outerCyl); safeDelete(plugFace); safeDelete(plug); safeDelete(cutRes);
    }
  }
  function buildGearRack(p) {
    const z = Math.max(2, Math.min(200, Math.round(num(p.teeth, 10))));
    const m = pos(p.module, 1.5), h = pos(p.h, 6), baseH = Math.max(0.5, pos(p.baseH, 6));
    const alpha = (20 * Math.PI) / 180, tanA = Math.tan(alpha);
    const pitch = Math.PI * m, L = pitch * z;
    const yRoot = baseH, yTip = baseH + 2.25 * m;
    const wTip = pitch / 4 - m * tanA, wRoot = pitch / 4 + 1.25 * m * tanA;
    const pts = [[-L / 2, 0, 0], [L / 2, 0, 0], [L / 2, yRoot, 0]];
    for (let i = z - 1; i >= 0; i--) {
      const xc = -L / 2 + (i + 0.5) * pitch;
      pts.push([xc + wRoot, yRoot, 0], [xc + wTip, yTip, 0], [xc - wTip, yTip, 0], [xc - wRoot, yRoot, 0]);
    }
    pts.push([-L / 2, yRoot, 0]);
    const face = polygonFace(pts);
    try {
      return R.basicFaceExtrusion(face, new R.Vector([0, 0, h]));
    } finally {
      safeDelete(face);
    }
  }
  function buildWorm(p) {
    const m = pos(p.module, 1.5);
    const starts = Math.max(1, Math.min(4, Math.round(num(p.starts, 1))));
    const L = pos(p.length, 30), bore = Math.max(0, num(p.bore, 6));
    const left = p.dir === 'left';
    const d1 = Math.max(pos(p.d, 16), 2.5 * m + 2.4);
    const r1 = d1 / 2, ra1 = r1 + m, rf1 = Math.max(0.6, r1 - 1.25 * m);
    const px = Math.PI * m, pz = starts * px;
    const alpha = (20 * Math.PI) / 180, tanA = Math.tan(alpha);
    const wTip = px / 4 - m * tanA, wRoot = px / 4 + 1.25 * m * tanA;
    const overlap = Math.min(0.15 * m, rf1 * 0.25, ((px / 2 - wRoot) * 0.4) / tanA);
    const x0 = rf1 - overlap, wIn = wRoot + overlap * tanA;
    let lastErr = null;
    for (const phase of [0, 0.17, 0.37]) {
      let prof = null, helix = null, gang0 = null, core = null, full = null, box = null, out = null;
      const rotGangs = [];
      try {
        const z0 = -(1 + phase) * pz;
        const pts = [[x0, 0, z0 - wIn], [ra1, 0, z0 - wTip], [ra1, 0, z0 + wTip], [x0, 0, z0 + wIn]];
        const lines = [R.makeLine(pts[0], pts[1]), R.makeLine(pts[1], pts[2]), R.makeLine(pts[2], pts[3]), R.makeLine(pts[3], pts[0])];
        prof = R.assembleWire(lines);
        for (const ln of lines) safeDelete(ln);
        helix = R.makeHelix(pz, L + (2 + phase) * pz, x0, [0, 0, z0], [0, 0, 1], left);
        gang0 = R.genericSweep(prof, helix, { frenet: true });
        core = R.makeCylinder(rf1 + 0.02, L + 3 * pz, [0, 0, -1.5 * pz], [0, 0, 1]);
        const parts = [core, gang0];
        for (let k = 1; k < starts; k++) {
          const gk = gang0.clone().rotate((360 / starts) * k, [0, 0, 0], [0, 0, 1]);
          rotGangs.push(gk);
          parts.push(gk);
        }
        full = fuseAll(parts, false);
        box = R.makeCylinder(ra1 + 1, L, [0, 0, 0], [0, 0, 1]);
        out = full.intersect(box);
        safeDelete(full); full = null; safeDelete(box); box = null;
        if (!isClosedValidSolid(out)) throw new Error('Schnecke ergab keinen geschlossenen Körper');
        if (bore > 0.1 && bore < rf1 * 2 - 0.5) {
          const cyl = R.makeCylinder(bore / 2, L + 2, [0, 0, -1], [0, 0, 1]);
          try {
            const cut = out.cut(cyl);
            safeDelete(out);
            out = cut;
          } finally { safeDelete(cyl); }
        }
        if (!isClosedValidSolid(out)) throw new Error('Schnecke ergab nach Bohrung keinen geschlossenen Körper');
        const res = out;
        out = null;
        return res;
      } catch (err) {
        lastErr = err;
      } finally {
        safeDelete(prof); safeDelete(helix); safeDelete(gang0); safeDelete(core);
        for (const gk of rotGangs) safeDelete(gk);
        safeDelete(full); safeDelete(box); safeDelete(out);
      }
    }
    throw lastErr || new Error('Schnecke konnte nicht gebaut werden.');
  }
  function buildWormWheel(p) {
    const z = Math.max(10, Math.min(120, Math.round(num(p.teeth, 24))));
    const m = pos(p.module, 1.5), h = pos(p.h, 10);
    const d1 = Math.max(pos(p.wormD, 16), 2.5 * m + 2.4);
    const starts = Math.max(1, Math.min(4, Math.round(num(p.wormStarts, 1))));
    const bore = Math.max(0, num(p.bore, 6));
    const sign = p.dir === 'left' ? -1 : 1;
    const rp = (m * z) / 2, rf = Math.max(0.5, rp - 1.25 * m);
    const tanGamma = (m * starts) / d1;
    const twistRad = sign * (h * tanGamma) / rp;
    const twistDeg = (twistRad * 180) / Math.PI;
    let g = null;
    if (Math.abs(twistDeg) >= 0.05) {
      const steps = Math.max(2, Math.min(8, Math.ceil(Math.abs(twistDeg) / 5)));
      const wires = [];
      try {
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          wires.push(involuteGearWire(z, m, u * h, (u - 0.5) * twistRad, 6));
        }
        for (const ruled of [false, true]) {
          try {
            const cand = R.loft(wires, { ruled });
            if (isClosedValidSolid(cand)) { g = cand; break; }
            safeDelete(cand);
          } catch (_) {}
        }
      } finally {
        for (const w of wires) safeDelete(w);
      }
    }
    if (!g) {
      let w0 = null, f0 = null;
      try {
        w0 = involuteGearWire(z, m, 0, 0, 6);
        f0 = R.makeFace(w0);
        g = R.basicFaceExtrusion(f0, new R.Vector([0, 0, h]));
      } finally {
        safeDelete(w0); safeDelete(f0);
      }
    }
    if (bore > 0.1 && bore < rf * 2 - 0.5) {
      const cyl = R.makeCylinder(bore / 2, h + 2, [0, 0, -1], [0, 0, 1]);
      try {
        const cut = g.cut(cyl);
        safeDelete(g);
        g = cut;
      } finally { safeDelete(cyl); }
    }
    return g;
  }
  function buildInvoluteGearWire(z, m, alphaDeg = 20, backlash = 0, zPlane = 0) {
    const alpha = (alphaDeg * Math.PI) / 180;
    const rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = Math.max(0.5, rp - 1.25 * m);
    const inv = (a) => Math.tan(a) - a;
    const tooth = (2 * Math.PI) / z;
    const half = Math.PI / (2 * z) - backlash / rp + inv(alpha);
    const rStart = Math.max(rb, rf);
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), zPlane];
    const flankAng = (r) => Math.max(0, half - inv(Math.acos(Math.min(1, rb / r))));
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
      else if (Math.hypot(right[N][0] - left[0][0], right[N][1] - left[0][1]) > 1e-5) edges.push(R.makeLine(right[N], left[0]));
      edges.push(R.makeBSplineApproximation(left, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const rootA = c + flankAng(rStart);
      const endL = rf < rStart - 1e-6 ? P(rf, rootA) : left[N];
      if (rf < rStart - 1e-6) edges.push(R.makeLine(left[N], endL));
      const nextA = c + tooth - flankAng(rStart);
      const nextStart = P(rf < rStart - 1e-6 ? rf : rStart, nextA);
      if (nextA - rootA > 1e-4) edges.push(R.makeThreePointArc(endL, P(rf < rStart - 1e-6 ? rf : rStart, (rootA + nextA) / 2), nextStart));
      else if (Math.hypot(endL[0] - nextStart[0], endL[1] - nextStart[1]) > 1e-5) edges.push(R.makeLine(endL, nextStart));
    }
    try {
      return R.assembleWire(edges);
    } catch (_) {
      for (const e of edges) safeDelete(e);
      const pts = [];
      for (let i = 0; i < z; i++) {
        const c = i * tooth;
        for (let k = 0; k <= 5; k++) { const r = rStart + ((ra - rStart) * k) / 5; pts.push(P(r, c - flankAng(r))); }
        for (let k = 5; k >= 0; k--) { const r = rStart + ((ra - rStart) * k) / 5; pts.push(P(r, c + flankAng(r))); }
      }
      const lineEdges = pts.map((pt, i) => R.makeLine(pt, pts[(i + 1) % pts.length]));
      return R.assembleWire(lineEdges);
    }
  }
  function buildHelicalGear(p) {
    const z = Math.max(6, Math.min(120, Math.round(num(p.teeth, 20))));
    const m = Math.max(0.2, num(p.module, 1.5));
    const h = Math.max(0.5, num(p.h, 8));
    const betaDeg = Math.max(0, Math.min(45, num(p.helixAngle, 20)));
    const betaRad = (betaDeg * Math.PI) / 180;
    const hand = p.hand === 'left' || p.hand === 'double' ? p.hand : 'right';
    const bore = Math.max(0, num(p.bore, 5));
    const rp = (m * z) / 2;
    const rf = Math.max(0.5, rp - 1.25 * m);
    const baseWire = buildInvoluteGearWire(z, m, 20, 0.03 * m, 0);
    let g = null;
    if (betaDeg < 0.05) {
      let face = null;
      try {
        face = R.makeFace(baseWire);
        g = R.basicFaceExtrusion(face, new R.Vector([0, 0, h]));
      } finally {
        safeDelete(face);
        safeDelete(baseWire);
      }
    } else {
      const ow = baseWire.wrapped;
      const maxStepDeg = Math.min(4.5, 45 / z);
      const buildLoftedHelix = (slices, isRuled) => {
        const cleanup = [];
        let ts = null;
        try {
          ts = new oc.BRepOffsetAPI_ThruSections(true, isRuled, 1e-4);
          if (typeof ts.CheckCompatibility === 'function') ts.CheckCompatibility(false);
          for (const [dz, ang] of slices) {
            const c = Math.cos(ang), s = Math.sin(ang);
            const trsf = new oc.gp_Trsf();
            trsf.SetValues(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, dz);
            const tr = new oc.BRepBuilderAPI_Transform(ow, trsf, true, false);
            const w = oc.TopoDS.Wire(tr.ModifiedShape(ow));
            ts.AddWire(w);
            cleanup.push(trsf, tr, w);
          }
          ts.Build();
          if (!ts.IsDone()) throw new Error('ThruSections failed');
          let sol = R.cast(ts.Shape());
          if (!sol || !R.isShape3D(sol)) { safeDelete(sol); throw new Error('Not 3D'); }
          if (R.measureVolume(sol) < 0) {
            const rev = R.cast(sol.wrapped.Reversed());
            safeDelete(sol);
            sol = rev;
          }
          return sol;
        } finally {
          for (const obj of cleanup) { try { obj.delete(); } catch (_) {} }
          if (ts) { try { ts.delete(); } catch (_) {} }
        }
      };
      try {
        if (hand === 'double') {
          const halfTwistRad = (0.5 * h * Math.tan(betaRad)) / rp;
          const halfDeg = (Math.abs(halfTwistRad) * 180) / Math.PI;
          const mHalf = Math.max(3, Math.min(12, Math.ceil(halfDeg / maxStepDeg) + 1));
          const slices = [];
          for (let i = 0; i <= mHalf; i++) {
            const t = i / mHalf;
            slices.push([(h * 0.5) * t, halfTwistRad * t]);
          }
          for (let i = 1; i <= mHalf; i++) {
            const t = i / mHalf;
            slices.push([h * 0.5 + (h * 0.5) * t, halfTwistRad * (1 - t)]);
          }
          g = buildLoftedHelix(slices, true);
        } else {
          const sgn = hand === 'left' ? -1 : 1;
          const totalTwistRad = (sgn * h * Math.tan(betaRad)) / rp;
          const totalDeg = (Math.abs(totalTwistRad) * 180) / Math.PI;
          const mSlices = Math.max(4, Math.min(24, Math.ceil(totalDeg / maxStepDeg) + 1));
          const slices = [];
          for (let i = 0; i <= mSlices; i++) {
            const t = i / mSlices;
            slices.push([h * t, totalTwistRad * t]);
          }
          try { g = buildLoftedHelix(slices, false); }
          catch (_) { g = buildLoftedHelix(slices, true); }
        }
      } finally {
        safeDelete(baseWire);
      }
    }
    if (bore > 0.1 && bore < rf * 2 - 0.5) {
      const cyl = R.makeCylinder(bore / 2, h + 2, [0, 0, -1]);
      const cutRes = g.cut(cyl);
      safeDelete(cyl); safeDelete(g);
      g = cutRes;
    }
    return g;
  }
  function buildBevelGear(p) {
    const z = Math.max(6, Math.min(120, Math.round(num(p.teeth, 20))));
    const z2 = Math.max(6, Math.min(120, Math.round(num(p.mateTeeth, z))));
    const m = Math.max(0.2, num(p.module, 1.5));
    const sigmaDeg = Math.max(20, Math.min(160, num(p.shaftAngle, 90)));
    const sigmaRad = (sigmaDeg * Math.PI) / 180;
    const autoDeltaDeg = (Math.atan2(Math.sin(sigmaRad), z2 / z + Math.cos(sigmaRad)) * 180) / Math.PI;
    const rawCone = p.coneAngle != null && p.coneAngle !== '' && isFinite(Number(p.coneAngle)) ? Number(p.coneAngle) : autoDeltaDeg;
    const deltaDeg = Math.max(10, Math.min(80, rawCone));
    const deltaRad = (deltaDeg * Math.PI) / 180;
    const rp = (m * z) / 2;
    const Re = rp / Math.sin(deltaRad);
    const minB = Math.max(0.5, 0.08 * Re);
    const maxB = 0.42 * Re;
    const defB = Math.min(Re / 3, 10 * m);
    const rawB = p.faceWidth != null && p.faceWidth !== '' && isFinite(Number(p.faceWidth)) ? Number(p.faceWidth) : defB;
    const b = Math.max(minB, Math.min(maxB, rawB));
    const scaleIn = (Re - b) / Re;
    const deltaF = Math.min(deltaRad - (3 * Math.PI) / 180, Math.atan((1.25 * m) / Re));
    const rRootOut = Math.max(0.5, rp - 1.25 * m * Math.cos(deltaRad));
    const zetaRootOut = Re * Math.cos(deltaRad) + 1.25 * m * Math.sin(deltaRad);
    const defHub = Math.max(2, Math.round(1.5 * m * 10) / 10);
    const rawHub = p.hubH != null && p.hubH !== '' && isFinite(Number(p.hubH)) ? Number(p.hubH) : defHub;
    const hubH = Math.max(0.5, rawHub);
    const zApex = zetaRootOut + hubH;
    const bore = Math.max(0, num(p.bore, 5));

    const zetaLo = zetaRootOut + 0.25 * m;
    const zLo = zApex - zetaLo;
    const zetaTipIn = scaleIn * (Re * Math.cos(deltaRad) - m * Math.sin(deltaRad));
    const zetaHi = Math.max(0.05, Math.min(0.85 * Math.max(0.1, zetaTipIn), zetaTipIn - 0.25 * m));

    // Virtuelles Stirnrad auf dem Ergänzungskegel (Tredgold-Näherung)
    const rv = rp / Math.cos(deltaRad);
    const zv = z / Math.cos(deltaRad);
    const alpha = (20 * Math.PI) / 180;
    const rbv = rv * Math.cos(alpha);
    const rav = rv + m;
    const rfv = Math.max(0.5, rv - 1.25 * m);
    const rStartV = Math.max(rbv, rfv);
    const inv = (a) => Math.tan(a) - a;
    const tooth = (2 * Math.PI) / z;
    const halfV = Math.PI / (2 * zv) - (0.04 * m) / rv + inv(alpha);
    const flankAngV = (r) => Math.max(0, halfV - inv(Math.acos(Math.min(1, rbv / r))));
    const P3 = (r, phi) => {
      const gamma = Math.max((2 * Math.PI) / 180, Math.min((84 * Math.PI) / 180, deltaRad + Math.atan((r - rv) / Re)));
      const rPlane = zetaLo * Math.tan(gamma);
      return [rPlane * Math.cos(phi), rPlane * Math.sin(phi), zLo];
    };
    const dPhi = (r) => flankAngV(r) / Math.cos(deltaRad);
    const N = 7;
    const edges = [];
    for (let i = 0; i < z; i++) {
      const c = i * tooth;
      const right = [], left = [];
      for (let k = 0; k <= N; k++) { const r = rStartV + ((rav - rStartV) * k) / N; right.push(P3(r, c - dPhi(r))); }
      for (let k = N; k >= 0; k--) { const r = rStartV + ((rav - rStartV) * k) / N; left.push(P3(r, c + dPhi(r))); }
      if (rfv < rStartV - 1e-6) edges.push(R.makeLine(P3(rfv, c - dPhi(rStartV)), right[0]));
      edges.push(R.makeBSplineApproximation(right, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const tipA = c - dPhi(rav), tipB = c + dPhi(rav);
      if (tipB - tipA > 1e-4) edges.push(R.makeThreePointArc(right[N], P3(rav, c), left[0]));
      else if (Math.hypot(right[N][0] - left[0][0], right[N][1] - left[0][1]) > 1e-5) edges.push(R.makeLine(right[N], left[0]));
      edges.push(R.makeBSplineApproximation(left, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
      const rootA = c + dPhi(rStartV);
      const endL = rfv < rStartV - 1e-6 ? P3(rfv, rootA) : left[N];
      if (rfv < rStartV - 1e-6) edges.push(R.makeLine(left[N], endL));
      const nextA = c + tooth - dPhi(rStartV);
      const nextStart = P3(rfv < rStartV - 1e-6 ? rfv : rStartV, nextA);
      if (nextA - rootA > 1e-4) edges.push(R.makeThreePointArc(endL, P3(rfv < rStartV - 1e-6 ? rfv : rStartV, (rootA + nextA) / 2), nextStart));
      else if (Math.hypot(endL[0] - nextStart[0], endL[1] - nextStart[1]) > 1e-5) edges.push(R.makeLine(endL, nextStart));
    }

    let outerWire = null;
    try {
      outerWire = R.assembleWire(edges);
    } catch (_) {
      for (const e of edges) safeDelete(e);
      const pts = [];
      for (let i = 0; i < z; i++) {
        const c = i * tooth;
        for (let k = 0; k <= 5; k++) { const r = rStartV + ((rav - rStartV) * k) / 5; pts.push(P3(r, c - dPhi(r))); }
        for (let k = 5; k >= 0; k--) { const r = rStartV + ((rav - rStartV) * k) / 5; pts.push(P3(r, c + dPhi(r))); }
      }
      outerWire = R.assembleWire(pts.map((pt, i) => R.makeLine(pt, pts[(i + 1) % pts.length])));
    }

    let coneSol = null;
    const cleanup = [];
    let ts = null;
    try {
      const ow = outerWire.wrapped;
      const gpApex = new oc.gp_Pnt(0, 0, zApex);
      const trsf = new oc.gp_Trsf();
      trsf.SetScale(gpApex, zetaHi / zetaLo);
      const tr = new oc.BRepBuilderAPI_Transform(ow, trsf, true, false);
      const innerWire = oc.TopoDS.Wire(tr.ModifiedShape(ow));
      cleanup.push(gpApex, trsf, tr, innerWire);
      ts = new oc.BRepOffsetAPI_ThruSections(true, true, 1e-4);
      if (typeof ts.CheckCompatibility === 'function') ts.CheckCompatibility(false);
      ts.AddWire(ow);
      ts.AddWire(innerWire);
      ts.Build();
      if (!ts.IsDone()) throw new Error('Kegelrad-Loft fehlgeschlagen');
      coneSol = R.cast(ts.Shape());
      if (R.measureVolume(coneSol) < 0) {
        const rev = R.cast(coneSol.wrapped.Reversed());
        safeDelete(coneSol);
        coneSol = rev;
      }
    } finally {
      for (const obj of cleanup) { try { obj.delete(); } catch (_) {} }
      if (ts) { try { ts.delete(); } catch (_) {} }
      safeDelete(outerWire);
    }

    // Exaktes Trimmen am äußeren und inneren Ergänzungskegel
    const rTipPad = rp + 2.0 * m * Math.cos(deltaRad);
    const zetaTipPad = Re * Math.cos(deltaRad) - 2.0 * m * Math.sin(deltaRad);
    const trimCone = revolveProfile([
      [0, zApex - zetaRootOut],
      [rRootOut, zApex - zetaRootOut],
      [rTipPad, zApex - zetaTipPad],
      [scaleIn * rTipPad, zApex - scaleIn * zetaTipPad],
      [scaleIn * rRootOut, zApex - scaleIn * zetaRootOut],
      [0, zApex - scaleIn * zetaRootOut],
    ]);
    let trimmed = coneSol.intersect(trimCone);
    safeDelete(coneSol); safeDelete(trimCone);

    // Rückenkörper (Nabe/Flansch bis unter den Zahnfuß)
    const ov = Math.min(0.3, 0.25 * b * Math.cos(deltaRad));
    const rOv = Math.max(0.2, rRootOut - ov * Math.tan(deltaF) - 0.08);
    const hub = revolveProfile([
      [0, 0],
      [rRootOut, 0],
      [rRootOut, hubH],
      [rOv, hubH + ov],
      [0, hubH + ov],
    ]);
    let g = trimmed.fuse(hub);
    safeDelete(trimmed); safeDelete(hub);

    if (bore > 0.1 && bore < 2 * scaleIn * rRootOut - 0.4) {
      const totalH = zApex - Math.min(zetaTipIn, scaleIn * zetaRootOut);
      const cyl = R.makeCylinder(bore / 2, totalH + 4, [0, 0, -2]);
      const cutRes = g.cut(cyl);
      safeDelete(cyl); safeDelete(g);
      g = cutRes;
    }
    return g;
  }
  function buildTimingPulley(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const z = Math.max(10, Math.min(120, Math.round(num(sp.z ?? p.teeth, 20))));
    const pitch = pos(sp.pitch, 2.0);
    const pld = Math.max(0.05, num(sp.pld, 0.254));
    const ht = pos(sp.ht, 0.75);
    const family = sp.family || (String(p.profile || '').toUpperCase().startsWith('HTD') ? 'HTD' : 'GT2');
    const dp = pos(sp.dp, (z * pitch) / Math.PI);
    const da = Math.max(2, pos(sp.da, dp - 2 * pld));
    const df = Math.max(1.2, pos(sp.df, da - 2 * ht));
    const ra = da / 2;
    const rf = df / 2;
    const htEff = Math.max(0.15, ra - rf);
    const grooveFrac = Math.max(0.42, Math.min(0.66, num(sp.grooveFrac, family === 'HTD' ? 0.60 : 0.56)));
    const flanges = sp.flanges || p.flanges || 'both';
    const hasBot = flanges === 'both' || flanges === 'bottom';
    const hasTop = flanges === 'both';
    const flangeT = hasBot || hasTop ? pos(sp.flangeT, Math.max(1.0, 0.55 * pitch)) : 0;
    const flangeR = hasBot || hasTop ? Math.max(ra + 0.8, pos(sp.flangeD, da + 3.2) / 2) : ra;
    const trackW = pos(sp.trackW, pos(p.beltW, 6) + (hasBot || hasTop ? 0.8 : 0));
    const hubH = Math.max(0, num(sp.hubH ?? p.hubH, 5));
    const hubR = hubH > 0 ? Math.max(1.2, pos(sp.hubD, da * 0.85) / 2) : 0;
    const bore = Math.max(0, num(sp.bore ?? p.bore, 5));

    const zBotFlange0 = hubH;
    const zTrack0 = hubH + (hasBot ? flangeT : 0);
    const zTrack1 = zTrack0 + trackW;
    const totalH = zTrack1 + (hasTop ? flangeT : 0);
    const zExt0 = zTrack0 - (hasBot ? 0.05 : 0);
    const zExt1 = zTrack1 + (hasTop ? 0.05 : 0);

    const theta = (2 * Math.PI) / z;
    const halfG = (grooveFrac * theta) / 2;
    const exp = family === 'HTD' ? 0.5 : 0.65;
    const U = [-1, -0.85, -0.65, -0.35, 0, 0.35, 0.65, 0.85, 1];
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), zExt0];

    const edges = [];
    let wire = null, face = null, toothed = null;
    try {
      for (let i = 0; i < z; i++) {
        const c = i * theta;
        const cNext = i === z - 1 ? 0 : (i + 1) * theta;
        const gPts = U.map((u) => {
          const r = ra - htEff * Math.pow(Math.max(0, 1 - u * u), exp);
          return P(r, c + halfG * u);
        });
        edges.push(R.makeBSplineApproximation(gPts, { tolerance: 1e-4, degMax: 3, degMin: 2 }));
        const a0 = c + halfG;
        const a1 = cNext - halfG;
        const aM = c + theta / 2;
        edges.push(R.makeThreePointArc(P(ra, a0), P(ra, aM), P(ra, a1)));
      }
      wire = R.assembleWire(edges);
      face = R.makeFace(wire);
      toothed = R.basicFaceExtrusion(face, new R.Vector([0, 0, zExt1 - zExt0]));
    } catch (_) {
      safeDelete(toothed); toothed = null;
      const pts = [];
      for (let i = 0; i < z; i++) {
        const c = i * theta;
        for (const u of U) {
          const r = ra - htEff * Math.pow(Math.max(0, 1 - u * u), exp);
          pts.push(P(r, c + halfG * u));
        }
      }
      let pFace = null;
      try {
        pFace = polygonFace(pts);
        toothed = R.basicFaceExtrusion(pFace, new R.Vector([0, 0, zExt1 - zExt0]));
      } finally {
        safeDelete(pFace);
      }
    } finally {
      for (const e of edges) safeDelete(e);
      safeDelete(wire);
      safeDelete(face);
    }

    const parts = [toothed];
    let shape = null;
    try {
      if (hasBot) parts.push(R.makeCylinder(flangeR, flangeT, [0, 0, zBotFlange0], [0, 0, 1]));
      if (hasTop) parts.push(R.makeCylinder(flangeR, flangeT, [0, 0, zTrack1], [0, 0, 1]));
      const hubREff = hubH > 0.05 && hubR > 0.5 ? (hasBot ? Math.min(hubR, flangeR) : Math.min(hubR, rf - 0.1)) : 0;
      if (hubREff > 0.5) parts.push(R.makeCylinder(hubREff, hubH + 0.05, [0, 0, 0], [0, 0, 1]));
      shape = parts.length > 1 ? fuseAll(parts, true) : toothed;
      parts.length = 0;
      const minOuter = hubREff > 0.5 ? Math.min(df, 2 * hubREff) : df;
      if (bore > 0.1 && bore < minOuter - 0.35) {
        const cyl = R.makeCylinder(bore / 2, totalH + 2, [0, 0, -1], [0, 0, 1]);
        try {
          const cut = shape.cut(cyl);
          safeDelete(shape);
          shape = cut;
        } finally {
          safeDelete(cyl);
        }
      }
      if (!isClosedValidSolid(shape)) throw new Error('Zahnriemenscheibe ergab keinen geschlossenen Körper.');
      const out = shape;
      shape = null;
      return out;
    } finally {
      for (const s of parts) safeDelete(s);
      safeDelete(shape);
    }
  }
  function buildSprocket(p) {
    const sp = p.spec && typeof p.spec === 'object' ? p.spec : {};
    const z = Math.max(8, Math.min(120, Math.round(num(sp.z ?? p.teeth, 15))));
    const pitch = pos(sp.pitch, 12.7);
    const d1 = Math.min(pitch * 0.72, Math.max(pitch * 0.3, pos(sp.d1 ?? p.rollerD, 8.51)));
    const ri = pos(sp.ri, 0.505 * d1);
    const dp = pos(sp.dp, pitch / Math.sin(Math.PI / z));
    const rp = dp / 2;
    const rf = Math.max(1, rp - ri);
    const df = 2 * rf;
    const da = Math.max(dp + 0.25 * pitch, pos(sp.da, dp + pitch * (1.125 - 0.8 / z) - d1));
    const ra = da / 2;
    const thick = pos(sp.thickness ?? p.thickness, 7.2);
    const bore = Math.max(0, num(sp.bore ?? p.bore, 10));
    const hubH = Math.max(0, num(sp.hubH ?? p.hubH, 0));
    const hubR = hubH > 0 ? Math.min(rf - 0.3, Math.max(1.5, pos(sp.hubD, df * 0.62) / 2)) : 0;
    const totalH = thick + hubH;

    const theta = (2 * Math.PI) / z;
    const halfT = theta / 2;
    let alphaS = ((70 - 45 / z) * Math.PI) / 180;
    const seatAng = (a) => Math.atan2(ri * Math.sin(a), rp - ri * Math.cos(a));
    while (alphaS > 0.15 && seatAng(alphaS) > halfT * 0.78) alphaS *= 0.9;
    const A0 = [rp - ri * Math.cos(alphaS), ri * Math.sin(alphaS)];
    const angA = Math.atan2(A0[1], A0[0]);
    const deltaTip = Math.min(0.07 * theta, Math.max(0.015 * theta, (halfT - angA) * 0.22));
    const betaTip = halfT - deltaTip;
    const T0 = [ra * Math.cos(betaTip), ra * Math.sin(betaTip)];

    const tA = [Math.sin(alphaS), Math.cos(alphaS)];
    const nTip = [Math.cos(betaTip), Math.sin(betaTip)];
    const tauTip = [-Math.sin(betaTip), Math.cos(betaTip)];
    const tTRaw = [0.45 * nTip[0] + 0.89 * tauTip[0], 0.45 * nTip[1] + 0.89 * tauTip[1]];
    const tTLen = Math.hypot(tTRaw[0], tTRaw[1]) || 1;
    const tT = [tTRaw[0] / tTLen, tTRaw[1] / tTLen];

    const dx = T0[0] - A0[0];
    const dy = T0[1] - A0[1];
    const L = Math.hypot(dx, dy) || 1;
    const s1 = Math.max(0.1 * L, Math.min(0.38 * L, dx > 0 && tA[0] > 0.1 ? (0.46 * dx) / tA[0] : 0.35 * L, dy > 0 && tA[1] > 0.1 ? (0.44 * dy) / tA[1] : 0.35 * L));
    const s2 = Math.max(0.1 * L, Math.min(0.38 * L, dx > 0 && tT[0] > 0.1 ? (0.46 * dx) / tT[0] : 0.35 * L, dy > 0 && tT[1] > 0.1 ? (0.44 * dy) / tT[1] : 0.35 * L));
    const P1_0 = [A0[0] + s1 * tA[0], A0[1] + s1 * tA[1]];
    const P2_0 = [T0[0] - s2 * tT[0], T0[1] - s2 * tT[1]];

    const mir = (pt) => [pt[0], -pt[1]];
    const rot2 = (pt, ang) => {
      const cs = Math.cos(ang), sn = Math.sin(ang);
      return [pt[0] * cs - pt[1] * sn, pt[0] * sn + pt[1] * cs, 0];
    };

    const edges = [];
    let wire = null, face = null, plate = null;
    try {
      for (let i = 0; i < z; i++) {
        const c = i * theta;
        const cNext = i === z - 1 ? 0 : (i + 1) * theta;
        edges.push(R.makeThreePointArc(rot2(mir(A0), c), rot2([rf, 0], c), rot2(A0, c)));
        edges.push(R.makeBezierCurve([rot2(A0, c), rot2(P1_0, c), rot2(P2_0, c), rot2(T0, c)]));
        edges.push(R.makeThreePointArc(rot2(T0, c), rot2([ra, 0], c + halfT), rot2(mir(T0), cNext)));
        edges.push(R.makeBezierCurve([rot2(mir(T0), cNext), rot2(mir(P2_0), cNext), rot2(mir(P1_0), cNext), rot2(mir(A0), cNext)]));
      }
      wire = R.assembleWire(edges);
      face = R.makeFace(wire);
      plate = R.basicFaceExtrusion(face, new R.Vector([0, 0, thick]));
    } catch (_) {
      safeDelete(plate); plate = null;
      const pts = [];
      for (let i = 0; i < z; i++) {
        const c = i * theta;
        pts.push(rot2(mir(A0), c), rot2([rf, 0], c), rot2(A0, c), rot2(P1_0, c), rot2(T0, c), rot2([ra, 0], c + halfT));
      }
      let pFace = null;
      try {
        pFace = polygonFace(pts);
        plate = R.basicFaceExtrusion(pFace, new R.Vector([0, 0, thick]));
      } finally {
        safeDelete(pFace);
      }
    } finally {
      for (const e of edges) safeDelete(e);
      safeDelete(wire);
      safeDelete(face);
    }

    let shape = plate;
    try {
      if (hubH > 0.05 && hubR > 0.5) {
        const hub = R.makeCylinder(hubR, hubH + 0.05, [0, 0, thick - 0.05], [0, 0, 1]);
        shape = fuseAll([shape, hub], true);
      }
      const minOuter = hubH > 0.05 && hubR > 0.5 ? Math.min(df, 2 * hubR) : df;
      if (bore > 0.1 && bore < minOuter - 0.5) {
        const cyl = R.makeCylinder(bore / 2, totalH + 2, [0, 0, -1], [0, 0, 1]);
        try {
          const cut = shape.cut(cyl);
          safeDelete(shape);
          shape = cut;
        } finally {
          safeDelete(cyl);
        }
      }
      if (!isClosedValidSolid(shape)) throw new Error('Kettenrad ergab keinen geschlossenen Körper.');
      const out = shape;
      shape = null;
      return out;
    } finally {
      safeDelete(shape);
    }
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
  const G2_A = 0.35, G2_B = 0.70;
  function makeBez5Edge(pts) {
    const arr = new oc.NCollection_Array1_gp_Pnt(1, pts.length);
    let curve = null, me = null;
    try {
      for (let i = 0; i < pts.length; i++) {
        const p = new oc.gp_Pnt(pts[i][0], pts[i][1], pts[i][2]);
        arr.SetValue(i + 1, p);
        p.delete();
      }
      curve = new oc.Geom_BezierCurve(arr);
      me = new oc.BRepBuilderAPI_MakeEdge(curve);
      return me.Edge();
    } finally {
      safeDelete(me); safeDelete(curve); safeDelete(arr);
    }
  }
  function makeG2WireConvex(O, t1, t2, n1, n2, s, pad) {
    const P0 = add(O, mul(t1, s)), P1 = add(O, mul(t1, (1 - G2_A) * s)), P2 = add(O, mul(t1, (1 - G2_B) * s));
    const P3 = add(O, mul(t2, (1 - G2_B) * s)), P4 = add(O, mul(t2, (1 - G2_A) * s)), P5 = add(O, mul(t2, s));
    const denom = Math.max(0.1, 1 + dot(n1, n2));
    const E1 = add(P0, mul(n1, pad)), E2 = add(P5, mul(n2, pad));
    const E0 = add(O, mul(add(n1, n2), pad / denom));
    let wb = null, l1 = null, l2 = null, l3 = null, l4 = null, bz = null;
    try {
      wb = new oc.BRepBuilderAPI_MakeWire();
      l1 = R.makeLine(P0, E1); wb.Add(l1.wrapped);
      l2 = R.makeLine(E1, E0); wb.Add(l2.wrapped);
      l3 = R.makeLine(E0, E2); wb.Add(l3.wrapped);
      l4 = R.makeLine(E2, P5); wb.Add(l4.wrapped);
      bz = makeBez5Edge([P5, P4, P3, P2, P1, P0]); wb.Add(bz);
      wb.Build();
      return wb.Wire();
    } finally {
      safeDelete(wb); safeDelete(l1); safeDelete(l2); safeDelete(l3); safeDelete(l4); safeDelete(bz);
    }
  }
  function makeG2WireConcave(O, t1, t2, s) {
    const P0 = add(O, mul(t1, s)), P1 = add(O, mul(t1, (1 - G2_A) * s)), P2 = add(O, mul(t1, (1 - G2_B) * s));
    const P3 = add(O, mul(t2, (1 - G2_B) * s)), P4 = add(O, mul(t2, (1 - G2_A) * s)), P5 = add(O, mul(t2, s));
    let wb = null, l1 = null, bz = null, l2 = null;
    try {
      wb = new oc.BRepBuilderAPI_MakeWire();
      l1 = R.makeLine(O, P0); wb.Add(l1.wrapped);
      bz = makeBez5Edge([P0, P1, P2, P3, P4, P5]); wb.Add(bz);
      l2 = R.makeLine(P5, O); wb.Add(l2.wrapped);
      wb.Build();
      return wb.Wire();
    } finally {
      safeDelete(wb); safeDelete(l1); safeDelete(bz); safeDelete(l2);
    }
  }
  function runG2FilletWithTopo(shape, topo, r, matchedEdges, fin, itemId, skipTopo = false) {
    const r2 = fin.vr ? num(fin.r2, r) * (r / Math.max(1e-9, num(fin.r, r))) : r;
    const isVar = !!(fin.vr && r2 > 0 && Math.abs(r2 - r) > 1e-9);
    const origFaces = [];
    const origFaceEdges = [];
    try { for (const f of shape.faces) origFaces.push(f); } catch (_) {}
    for (const f of origFaces) {
      const es = [];
      try { for (const e of f.edges) es.push(e); } catch (_) {}
      origFaceEdges.push(es);
    }
    const b = bboxOf(shape);
    const volBefore = R.measureVolume(shape);
    const jobs = [];
    const faceSpanEntries = [];
    const freeOrig = () => {
      for (const es of origFaceEdges) for (const e of es) safeDelete(e);
      for (const f of origFaces) safeDelete(f);
    };
    const faceDirFromEdge = (fIdx, f, origin, dirCand) => {
      let maxPos = 0, maxNeg = 0;
      for (const fe of origFaceEdges[fIdx]) {
        for (const pt of [vec(fe.startPoint), vec(fe.endPoint), vec(fe.pointAt(0.5))]) {
          const pr = dot(sub(pt, origin), dirCand);
          if (pr > maxPos) maxPos = pr;
          if (-pr > maxNeg) maxNeg = -pr;
        }
      }
      if (maxPos >= maxNeg) return { dir: dirCand, reach: maxPos };
      return { dir: mul(dirCand, -1), reach: maxNeg };
    };
    try {
      for (const e of matchedEdges) {
        const adjIdx = [];
        for (let i = 0; i < origFaces.length; i++) {
          if (origFaceEdges[i].some((fe) => fe.isSame(e))) adjIdx.push(i);
        }
        if (adjIdx.length < 2) continue;
        const f1Idx = adjIdx[0], f2Idx = adjIdx[1];
        const f1 = origFaces[f1Idx], f2 = origFaces[f2Idx];
        if (e.geomType === 'LINE' && f1.geomType === 'PLANE' && f2.geomType === 'PLANE') {
          const A = vec(e.startPoint), B = vec(e.endPoint), dAB = sub(B, A), L = len(dAB);
          if (!(L > 1e-6)) continue;
          const u = mul(dAB, 1 / L);
          const n1 = norm(vec(f1.normalAt())), n2 = norm(vec(f2.normalAt()));
          const t1Info = faceDirFromEdge(f1Idx, f1, A, norm(cross(u, n1)));
          const t2Info = faceDirFromEdge(f2Idx, f2, A, norm(cross(u, n2)));
          const t1 = t1Info.dir, t2 = t2Info.dir;
          const c12 = dot(n1, t2), c21 = dot(n2, t1);
          const isConvex = c12 < -1e-4 && c21 < -1e-4;
          const isConcave = c12 > 1e-4 && c21 > 1e-4;
          if (!isConvex && !isConcave) continue;
          const gamma = Math.acos(Math.max(-0.9999, Math.min(0.9999, dot(t1, t2))));
          const tanHalf = Math.tan(gamma / 2);
          if (!(tanHalf > 1e-4)) continue;
          const s1 = r / tanHalf, s2 = isVar ? r2 / tanHalf : s1, sMax = Math.max(s1, s2);
          if (!(sMax < t1Info.reach - 1e-3 && sMax < t2Info.reach - 1e-3)) {
            throw new Error('Rundung zu groß.');
          }
          faceSpanEntries.push({ fIdx: f1Idx, t: t1, s: sMax, reach: t1Info.reach });
          faceSpanEntries.push({ fIdx: f2Idx, t: t2, s: sMax, reach: t2Info.reach });
          let shUMin = Infinity, shUMax = -Infinity;
          for (const ix of [b[0], b[3]]) for (const iy of [b[1], b[4]]) for (const iz of [b[2], b[5]]) {
            const pr = dot(sub([ix, iy, iz], A), u);
            if (pr < shUMin) shUMin = pr;
            if (pr > shUMax) shUMax = pr;
          }
          const padLo = 0 <= shUMin + 1e-3 ? Math.max(0.25, sMax * 0.15) : 0;
          const padHi = L >= shUMax - 1e-3 ? Math.max(0.25, sMax * 0.15) : 0;
          jobs.push({ kind: 'line', A, B, L, u, t1, t2, n1, n2, s1, s2, sMax, isConvex, isVar, padLo, padHi });
        } else if (e.geomType === 'CIRCLE' && ((f1.geomType === 'PLANE' && (f2.geomType === 'CYLINDRE' || f2.geomType === 'CONE')) || (f2.geomType === 'PLANE' && (f1.geomType === 'CYLINDRE' || f1.geomType === 'CONE')))) {
          const pIdx = f1.geomType === 'PLANE' ? f1Idx : f2Idx;
          const cIdx = f1.geomType === 'PLANE' ? f2Idx : f1Idx;
          const fp = origFaces[pIdx], fc = origFaces[cIdx];
          let adapt = null, circ = null, cLoc = null, cAx = null, p0Obj = null;
          try {
            adapt = new oc.BRepAdaptor_Curve(e.wrapped);
            const first = adapt.FirstParameter(), last = adapt.LastParameter();
            const angSpan = Math.abs(last - first);
            if (!(angSpan > 1e-4)) continue;
            circ = adapt.Circle();
            cLoc = circ.Location();
            cAx = circ.Axis().Direction();
            const cCen = [cLoc.X(), cLoc.Y(), cLoc.Z()];
            const axDir = norm([cAx.X(), cAx.Y(), cAx.Z()]);
            const circR = circ.Radius();
            p0Obj = adapt.Value(first);
            const pStart = [p0Obj.X(), p0Obj.Y(), p0Obj.Z()];
            const radVec = sub(pStart, add(cCen, mul(axDir, dot(sub(pStart, cCen), axDir))));
            const radDir = norm(radVec);
            const uCirc = norm(cross(axDir, radDir));
            const nPlane = norm(vec(fp.normalAt()));
            const tPlaneInfo = faceDirFromEdge(pIdx, fp, pStart, radDir);
            const tPlane = tPlaneInfo.dir;
            let nCyl = radDir;
            try {
              const q = vec(fc.pointOnSurface(0.5, 0.5));
              const nq = norm(vec(fc.normalAt()));
              const qRad = norm(sub(q, add(cCen, mul(axDir, dot(sub(q, cCen), axDir)))));
              nCyl = norm(add(mul(radDir, dot(nq, qRad)), mul(axDir, dot(nq, axDir))));
            } catch (_) {}
            const tCylCand = norm(cross(uCirc, nCyl));
            const tCylInfo = faceDirFromEdge(cIdx, fc, pStart, tCylCand);
            const tCyl = tCylInfo.dir;
            const c12 = dot(nPlane, tCyl), c21 = dot(nCyl, tPlane);
            const isConvex = c12 < -1e-4 && c21 < -1e-4;
            const isConcave = c12 > 1e-4 && c21 > 1e-4;
            if (!isConvex && !isConcave) continue;
            const gamma = Math.acos(Math.max(-0.9999, Math.min(0.9999, dot(tPlane, tCyl))));
            const tanHalf = Math.tan(gamma / 2);
            if (!(tanHalf > 1e-4)) continue;
            const s1 = r / tanHalf;
            const planeLimit = dot(tPlane, radDir) < -0.5 ? circR : tPlaneInfo.reach;
            if (!(s1 < planeLimit - 1e-3 && s1 < tCylInfo.reach - 1e-3)) {
              throw new Error('Rundung zu groß.');
            }
            jobs.push({ kind: 'circle', cCen, axDir, angSpan: Math.abs(angSpan - 2 * Math.PI) < 1e-4 ? 2 * Math.PI : angSpan, pStart, t1: tPlane, t2: tCyl, n1: nPlane, n2: nCyl, s1, isConvex });
          } finally {
            safeDelete(p0Obj); safeDelete(cAx); safeDelete(cLoc); safeDelete(circ); safeDelete(adapt);
          }
        } else {
          throw Object.assign(new Error('Krümmungsglatte Rundung (G2) wird bisher für gerade Kanten zwischen ebenen Flächen sowie Kreiskanten an Zylindern und Kegeln unterstützt.'), { code: 'g2_unsupported' });
        }
      }
      for (let i = 0; i < faceSpanEntries.length; i++) {
        for (let j = i + 1; j < faceSpanEntries.length; j++) {
          const ei = faceSpanEntries[i], ej = faceSpanEntries[j];
          if (ei.fIdx === ej.fIdx && dot(ei.t, ej.t) < -0.99) {
            if (!(ei.s + ej.s < ei.reach - 1e-3)) throw new Error('Rundung zu groß.');
          }
        }
      }
      if (!jobs.length) throw new Error('Keine Kante gewählt.');

      let curShape = shape;
      let curTopo = topo;
      let ownsCur = false;
      for (const j of jobs) {
        let tool = null, boolOp = null, w = null, w2 = null, fb = null, fw = null, gv = null, pr = null, loft = null, axP = null, axD = null, ax1 = null, rev = null, chk = null, next = null;
        try {
          if (j.kind === 'line') {
            if (j.isConvex) {
              const pad = Math.max(0.5, j.sMax * 0.5);
              if (j.isVar) {
                w = makeG2WireConvex(j.A, j.t1, j.t2, j.n1, j.n2, j.s1, pad);
                w2 = makeG2WireConvex(j.B, j.t1, j.t2, j.n1, j.n2, j.s2, pad);
                loft = new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6);
                loft.AddWire(w); loft.AddWire(w2); loft.Build();
                tool = loft.Shape();
              } else {
                const O0 = add(j.A, mul(j.u, -j.padLo));
                const hU = j.L + j.padLo + j.padHi;
                w = makeG2WireConvex(O0, j.t1, j.t2, j.n1, j.n2, j.s1, pad);
                fb = new oc.BRepBuilderAPI_MakeFace(w, false);
                fw = fb.Face();
                gv = new oc.gp_Vec(j.u[0] * hU, j.u[1] * hU, j.u[2] * hU);
                pr = new oc.BRepPrimAPI_MakePrism(fw, gv, false, true);
                pr.Build();
                tool = pr.Shape();
              }
            } else {
              if (j.isVar) {
                w = makeG2WireConcave(j.A, j.t1, j.t2, j.s1);
                w2 = makeG2WireConcave(j.B, j.t1, j.t2, j.s2);
                loft = new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6);
                loft.AddWire(w); loft.AddWire(w2); loft.Build();
                tool = loft.Shape();
              } else {
                w = makeG2WireConcave(j.A, j.t1, j.t2, j.s1);
                fb = new oc.BRepBuilderAPI_MakeFace(w, false);
                fw = fb.Face();
                gv = new oc.gp_Vec(j.u[0] * j.L, j.u[1] * j.L, j.u[2] * j.L);
                pr = new oc.BRepPrimAPI_MakePrism(fw, gv, false, true);
                pr.Build();
                tool = pr.Shape();
              }
            }
          } else {
            const pad = Math.max(0.5, j.s1 * 0.5);
            w = j.isConvex ? makeG2WireConvex(j.pStart, j.t1, j.t2, j.n1, j.n2, j.s1, pad) : makeG2WireConcave(j.pStart, j.t1, j.t2, j.s1);
            fb = new oc.BRepBuilderAPI_MakeFace(w, false);
            fw = fb.Face();
            axP = new oc.gp_Pnt(j.cCen[0], j.cCen[1], j.cCen[2]);
            axD = new oc.gp_Dir(j.axDir[0], j.axDir[1], j.axDir[2]);
            ax1 = new oc.gp_Ax1(axP, axD);
            rev = new oc.BRepPrimAPI_MakeRevol(fw, ax1, j.angSpan, true);
            rev.Build();
            tool = rev.Shape();
          }
          boolOp = j.isConvex ? new oc.BRepAlgoAPI_Cut(curShape.wrapped, tool) : new oc.BRepAlgoAPI_Fuse(curShape.wrapped, tool);
          boolOp.Build();
          next = R.cast(boolOp.Shape());
          if (!next || !R.isShape3D(next)) { safeDelete(next); throw new Error('Rundung fehlgeschlagen.'); }
          chk = new oc.BRepCheck_Analyzer(next.wrapped);
          if (!chk.IsValid()) { safeDelete(next); throw new Error('Rundung fehlgeschlagen.'); }
          const nextTopo = skipTopo ? null : propagateHistory(boolOp, [{ topo: curTopo, selfId: itemId }], next, 'FiG2:' + (fin.id || 'f'));
          if (ownsCur) {
            safeDelete(curShape);
            freeTopoMap(curTopo);
          }
          curShape = next;
          curTopo = nextTopo;
          ownsCur = true;
          next = null;
        } catch (err) {
          if (ownsCur) {
            safeDelete(curShape);
            freeTopoMap(curTopo);
          }
          throw err;
        } finally {
          safeDelete(chk); safeDelete(boolOp); safeDelete(rev); safeDelete(ax1); safeDelete(axD); safeDelete(axP);
          safeDelete(loft); safeDelete(pr); safeDelete(gv); safeDelete(fw); safeDelete(fb); safeDelete(w2); safeDelete(w); safeDelete(tool);
        }
      }
      const volAfter = R.measureVolume(curShape);
      if (!(Math.abs(volAfter - volBefore) > 1e-4)) {
        if (ownsCur) { safeDelete(curShape); freeTopoMap(curTopo); }
        throw new Error('Rundung fehlgeschlagen.');
      }
      return { shape: curShape, topo: curTopo };
    } finally {
      freeOrig();
    }
  }
  function solve3(M, rhs) {
    const col = (j) => [M[0][j], M[1][j], M[2][j]];
    const det3 = (c0, c1, c2) => dot(c0, cross(c1, c2));
    const D = det3(col(0), col(1), col(2));
    if (Math.abs(D) < 1e-10) return null;
    return [
      det3(rhs, col(1), col(2)) / D,
      det3(col(0), rhs, col(2)) / D,
      det3(col(0), col(1), rhs) / D,
    ];
  }
  function makeArc3Edge(O, t1, t2, s, r) {
    const A = add(O, mul(t1, s)), B = add(O, mul(t2, s));
    const bis = norm(add(t1, t2));
    const cosH = Math.max(-0.9999, Math.min(0.9999, dot(t1, bis)));
    const sinH = Math.sqrt(Math.max(1e-12, 1 - cosH * cosH));
    const C = add(O, mul(bis, r / sinH));
    const M = sub(C, mul(bis, r));
    let pA = null, pM = null, pB = null, ga = null, me = null;
    try {
      pA = new oc.gp_Pnt(A[0], A[1], A[2]);
      pM = new oc.gp_Pnt(M[0], M[1], M[2]);
      pB = new oc.gp_Pnt(B[0], B[1], B[2]);
      ga = new oc.GC_MakeArcOfCircle(pA, pM, pB);
      me = new oc.BRepBuilderAPI_MakeEdge(ga.Value());
      return me.Edge();
    } finally {
      safeDelete(me); safeDelete(ga); safeDelete(pA); safeDelete(pM); safeDelete(pB);
    }
  }
  function makeG2CrossEdge(O, t1, t2, s) {
    return makeBez5Edge([
      add(O, mul(t1, s)),
      add(O, mul(t1, (1 - G2_A) * s)),
      add(O, mul(t1, (1 - G2_B) * s)),
      add(O, mul(t2, (1 - G2_B) * s)),
      add(O, mul(t2, (1 - G2_A) * s)),
      add(O, mul(t2, s)),
    ]);
  }
  function tryCornerFilletWithTopo(shape, topo, r, matchedEdges, fin, itemId, skipTopo = false, profile = 'round', cornerMode = 'sphere') {
    if (!matchedEdges || matchedEdges.length < 3) return null;
    const origFaces = [];
    const origFaceEdges = [];
    const tmp = [];
    const track = (x) => { if (x) tmp.push(x); return x; };
    const freeOrig = () => {
      for (const x of tmp) safeDelete(x);
      for (const es of origFaceEdges) for (const e of es) safeDelete(e);
      for (const f of origFaces) safeDelete(f);
    };
    const dist3 = (a, b) => len(sub(a, b));
    const rawLineEdge = (a, b) => {
      let pa = null, pb = null, me = null;
      try {
        pa = new oc.gp_Pnt(a[0], a[1], a[2]);
        pb = new oc.gp_Pnt(b[0], b[1], b[2]);
        me = new oc.BRepBuilderAPI_MakeEdge(pa, pb);
        return track(me.Edge());
      } finally { safeDelete(me); safeDelete(pa); safeDelete(pb); }
    };
    const rawPlanarFace = (edges) => {
      let wb = null, w = null, mf = null;
      try {
        wb = new oc.BRepBuilderAPI_MakeWire();
        for (const e of edges) wb.Add(e);
        wb.Build();
        w = wb.Wire();
        mf = new oc.BRepBuilderAPI_MakeFace(w, true);
        return track(mf.Face());
      } finally { safeDelete(mf); safeDelete(w); safeDelete(wb); }
    };
    const rawPrismFace = (edge, v) => {
      let gv = null, pr = null;
      try {
        gv = new oc.gp_Vec(v[0], v[1], v[2]);
        pr = new oc.BRepPrimAPI_MakePrism(edge, gv, false, true);
        pr.Build();
        return track(oc.TopoDS.Face(pr.Shape()));
      } finally { safeDelete(pr); safeDelete(gv); }
    };
    const rawPlaneFace = (o, n) => {
      let po = null, dn = null, pln = null, mf = null;
      try {
        po = new oc.gp_Pnt(o[0], o[1], o[2]);
        dn = new oc.gp_Dir(n[0], n[1], n[2]);
        pln = new oc.gp_Pln(po, dn);
        mf = new oc.BRepBuilderAPI_MakeFace(pln, -500, 500, -500, 500);
        return track(mf.Face());
      } finally { safeDelete(mf); safeDelete(pln); safeDelete(dn); safeDelete(po); }
    };
    const rawEdgeEnds = (rawE) => {
      let ad = null, p0 = null, p1 = null;
      try {
        ad = new oc.BRepAdaptor_Curve(rawE);
        p0 = ad.Value(ad.FirstParameter());
        p1 = ad.Value(ad.LastParameter());
        return [[p0.X(), p0.Y(), p0.Z()], [p1.X(), p1.Y(), p1.Z()]];
      } finally { safeDelete(p1); safeDelete(p0); safeDelete(ad); }
    };
    const findFaceEdgeBetween = (rawFace, pFrom, pTo) => {
      const ee = new oc.TopExp_Explorer(rawFace, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let found = null;
      try {
        while (ee.More()) {
          const e = oc.TopoDS.Edge(ee.Current());
          const [a, b] = rawEdgeEnds(e);
          if (dist3(a, pFrom) < 1e-2 && dist3(b, pTo) < 1e-2) { found = track(e); break; }
          if (dist3(a, pTo) < 1e-2 && dist3(b, pFrom) < 1e-2) {
            const rev = oc.TopoDS.Edge(e.Reversed());
            safeDelete(e);
            found = track(rev);
            break;
          }
          safeDelete(e);
          ee.Next();
        }
      } finally { ee.delete(); }
      return found;
    };
    const cutFaceWithMasks = (origRawFace, masks) => {
      let cur = origRawFace, owns = false;
      for (const m of masks) {
        const c = new oc.BRepAlgoAPI_Cut(cur, m);
        try {
          c.Build();
          const res = c.Shape();
          if (owns) safeDelete(cur);
          cur = res;
          owns = true;
        } finally { c.delete(); }
      }
      const out = [];
      const fe = new oc.TopExp_Explorer(cur, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {
        while (fe.More()) { out.push(track(oc.TopoDS.Face(fe.Current()))); fe.Next(); }
      } finally { fe.delete(); }
      if (owns) safeDelete(cur);
      return out;
    };
    try {
      try { for (const f of shape.faces) origFaces.push(f); } catch (_) {}
      for (const f of origFaces) {
        const es = [];
        try { for (const e of f.edges) es.push(e); } catch (_) {}
        origFaceEdges.push(es);
      }
      const origNormals = origFaces.map((f) => {
        try { return f.geomType === 'PLANE' ? norm(vec(f.normalAt())) : null; } catch (_) { return null; }
      });
      const origFacePt = origFaces.map((f, i) => {
        try {
          if (origFaceEdges[i] && origFaceEdges[i].length) return vec(origFaceEdges[i][0].startPoint);
          return vec(f.center);
        } catch (_) { return [0, 0, 0]; }
      });
      const faceDirFromEdge = (fIdx, origin, dirCand) => {
        let maxPos = 0, maxNeg = 0;
        for (const fe of origFaceEdges[fIdx]) {
          for (const pt of [vec(fe.startPoint), vec(fe.endPoint), vec(fe.pointAt(0.5))]) {
            const pr = dot(sub(pt, origin), dirCand);
            if (pr > maxPos) maxPos = pr;
            if (-pr > maxNeg) maxNeg = -pr;
          }
        }
        return maxPos >= maxNeg ? { dir: dirCand, reach: maxPos } : { dir: mul(dirCand, -1), reach: maxNeg };
      };

      const edgeInfos = [];
      const faceSpanEntries = [];
      for (const e of matchedEdges) {
        if (e.geomType !== 'LINE') return null;
        const adj = [];
        for (let i = 0; i < origFaces.length; i++) {
          if (origFaceEdges[i].some((fe) => fe.isSame(e))) adj.push(i);
        }
        if (adj.length !== 2) return null;
        const f1 = adj[0], f2 = adj[1];
        if (origFaces[f1].geomType !== 'PLANE' || origFaces[f2].geomType !== 'PLANE') return null;
        const n1 = origNormals[f1], n2 = origNormals[f2];
        if (!n1 || !n2) return null;
        const A = vec(e.startPoint), B = vec(e.endPoint), dAB = sub(B, A), L = len(dAB);
        if (!(L > 1e-6)) return null;
        const u = mul(dAB, 1 / L);
        const t1Info = faceDirFromEdge(f1, A, norm(cross(u, n1)));
        const t2Info = faceDirFromEdge(f2, A, norm(cross(u, n2)));
        const t1 = t1Info.dir, t2 = t2Info.dir;
        if (!(dot(n1, t2) < -1e-4 && dot(n2, t1) < -1e-4)) return null; // nur konvexe Kanten
        const gamma = Math.acos(Math.max(-0.9999, Math.min(0.9999, dot(t1, t2))));
        const tanHalf = Math.tan(gamma / 2);
        if (!(tanHalf > 1e-4)) return null;
        const s = r / tanHalf;
        if (!(s < t1Info.reach - 1e-3 && s < t2Info.reach - 1e-3)) {
          throw new Error('Rundung zu groß.');
        }
        faceSpanEntries.push({ fIdx: f1, t: t1, s, reach: t1Info.reach });
        faceSpanEntries.push({ fIdx: f2, t: t2, s, reach: t2Info.reach });
        edgeInfos.push({ A, B, L, u, f1, f2, n1, n2, t1, t2, s, startTrim: 0, endTrim: 0 });
      }

      for (let i = 0; i < faceSpanEntries.length; i++) {
        for (let j = i + 1; j < faceSpanEntries.length; j++) {
          const ei = faceSpanEntries[i], ej = faceSpanEntries[j];
          if (ei.fIdx === ej.fIdx && dot(ei.t, ej.t) < -0.99) {
            if (!(ei.s + ej.s < ei.reach - 1e-3)) throw new Error('Rundung zu groß.');
          }
        }
      }

      const verts = [];
      const addVert = (pt, ei, atStart) => {
        let v = verts.find((x) => dist3(x.pt, pt) < 1e-3);
        if (!v) { v = { pt, inc: [] }; verts.push(v); }
        v.inc.push({ ei, atStart });
      };
      edgeInfos.forEach((info, ei) => { addVert(info.A, ei, true); addVert(info.B, ei, false); });

      if (verts.some((v) => v.inc.length === 2 || v.inc.length > 3)) return null;
      const val3 = verts.filter((v) => v.inc.length === 3);
      if (!val3.length) return null;

      const corners = [];
      for (const v of val3) {
        const fSet = new Set();
        for (const x of v.inc) { fSet.add(edgeInfos[x.ei].f1); fSet.add(edgeInfos[x.ei].f2); }
        if (fSet.size !== 3) return null;
        const inc = v.inc.slice();
        const uOf = (x) => (x.atStart ? edgeInfos[x.ei].u : mul(edgeInfos[x.ei].u, -1));
        if (dot(uOf(inc[0]), cross(uOf(inc[1]), uOf(inc[2]))) < 0) {
          [inc[1], inc[2]] = [inc[2], inc[1]];
        }
        const fArr = [...fSet];
        const oppFace = inc.map((x) => {
          const info = edgeInfos[x.ei];
          return fArr.find((fi) => fi !== info.f1 && fi !== info.f2);
        });
        const ns = oppFace.map((fi) => origNormals[fi]);
        const us = inc.map(uOf);
        const dC = solve3([mul(ns[0], -1), mul(ns[1], -1), mul(ns[2], -1)], [r, r, r]);
        if (!dC) return null;
        const C = add(v.pt, dC);
        const Q = [0, 1, 2].map((k) => add(C, mul(ns[k], r)));
        const d0 = [0, 1, 2].map((k) => dot(dC, us[k]));
        if (d0.some((dk) => !(dk > 1e-4))) return null;
        corners.push({ V: v.pt, inc, oppFace, ns, us, C, Q, d0, d: d0.slice(), delta: [0, 0, 0], isSmooth: false });
      }

      for (const co of corners) {
        if (cornerMode === 'smooth') {
          const want = co.d0.map((d0k, k) => {
            const info = edgeInfos[co.inc[k].ei];
            const otherCorner = corners.some((c2) => c2 !== co && c2.inc.some((x) => x.ei === co.inc[k].ei));
            const maxD = otherCorner ? info.L * 0.44 : info.L * 0.85;
            return Math.min(d0k * 1.8, maxD);
          });
          if (want.every((dk, k) => dk > co.d0[k] + 0.08 * edgeInfos[co.inc[k].ei].s)) {
            co.d = want;
            co.delta = want.map((dk, k) => dk - co.d0[k]);
            co.isSmooth = true;
          }
        }
        co.inc.forEach((x, k) => {
          const info = edgeInfos[x.ei];
          if (x.atStart) info.startTrim = co.d[k];
          else info.endTrim = co.d[k];
        });
      }

      // Prüfen, ob alle freien Kantenenden senkrecht auf eine ebene Fläche treffen
      const freeEndFace = (info, endPt, dirOut) => {
        for (let fi = 0; fi < origFaces.length; fi++) {
          if (fi === info.f1 || fi === info.f2 || !origNormals[fi]) continue;
          if (Math.abs(dot(origNormals[fi], dirOut)) > 0.999) {
            if (Math.abs(dot(sub(endPt, origFacePt[fi]), origNormals[fi])) < 1e-3) return fi;
          }
        }
        return -1;
      };
      for (const info of edgeInfos) {
        if (!(info.L - info.startTrim - info.endTrim > 1e-3)) throw new Error('Rundung zu groß.');
        if (info.startTrim === 0) {
          info.freeFaceA = freeEndFace(info, info.A, mul(info.u, -1));
          if (info.freeFaceA < 0) return null;
        }
        if (info.endTrim === 0) {
          info.freeFaceB = freeEndFace(info, info.B, info.u);
          if (info.freeFaceB < 0) return null;
        }
      }

      const curveOf = (O, t1, t2, s) => track(profile === 'g2' ? makeG2CrossEdge(O, t1, t2, s) : makeArc3Edge(O, t1, t2, s, r));
      const faceMasks = origFaces.map(() => []);
      const newFaces = [];

      for (const info of edgeInfos) {
        const pad = Math.max(0.5, info.s * 0.5);
        const lenRem = info.L - info.startTrim - info.endTrim;
        const O0 = add(info.A, mul(info.u, info.startTrim));
        const cStart = curveOf(O0, info.t1, info.t2, info.s);
        const fStrip = rawPrismFace(cStart, mul(info.u, lenRem));
        newFaces.push(fStrip);
        info.stripFace = fStrip;
        const extA = info.startTrim > 0 ? 0 : pad;
        const extB = info.endTrim > 0 ? 0 : pad;
        const pA = add(info.A, mul(info.u, -extA));
        const pB = add(info.B, mul(info.u, extB));
        for (const [fi, ti] of [[info.f1, info.t1], [info.f2, info.t2]]) {
          const q0 = add(pA, mul(ti, -pad));
          const q1 = add(pB, mul(ti, -pad));
          const q2 = add(pB, mul(ti, info.s));
          const q3 = add(pA, mul(ti, info.s));
          faceMasks[fi].push(rawPlanarFace([rawLineEdge(q0, q1), rawLineEdge(q1, q2), rawLineEdge(q2, q3), rawLineEdge(q3, q0)]));
        }
        const addEndCapMask = (fi, endPt) => {
          const cEnd = curveOf(endPt, info.t1, info.t2, info.s);
          const P0 = add(endPt, mul(info.t1, info.s));
          const P5 = add(endPt, mul(info.t2, info.s));
          const denom = Math.max(0.1, 1 + dot(info.n1, info.n2));
          const E1 = add(P0, mul(info.n1, pad));
          const E2 = add(P5, mul(info.n2, pad));
          const E0 = add(endPt, mul(add(info.n1, info.n2), pad / denom));
          faceMasks[fi].push(rawPlanarFace([cEnd, rawLineEdge(P5, E2), rawLineEdge(E2, E0), rawLineEdge(E0, E1), rawLineEdge(E1, P0)]));
        };
        if (info.startTrim === 0) addEndCapMask(info.freeFaceA, info.A);
        if (info.endTrim === 0) addEndCapMask(info.freeFaceB, info.B);
      }

      for (const co of corners) {
        const Ccurves = [], suppFaces = [];
        for (let k = 0; k < 3; k++) {
          const info = edgeInfos[co.inc[k].ei];
          const fromM = (k + 2) % 3, toM = (k + 1) % 3;
          const pFrom = add(co.Q[fromM], mul(co.us[k], co.delta[k]));
          const pTo = add(co.Q[toM], mul(co.us[k], co.delta[k]));
          const ck = findFaceEdgeBetween(info.stripFace, pFrom, pTo);
          if (!ck) return null;
          Ccurves.push(ck);
          suppFaces.push(info.stripFace);
        }
        const fill = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-4, 1e-4, 1e-2, 0.1, 8, 9);
        try {
          if (!co.isSmooth) {
            fill.Add(Ccurves[0], suppFaces[0], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(Ccurves[2], suppFaces[2], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(Ccurves[1], suppFaces[1], oc.GeomAbs_Shape.GeomAbs_G1, true);
          } else {
            const bridge = (A, tA, dA, B, tB, dB) => track(makeBez5Edge([
              A, add(A, mul(tA, 0.35 * dA)), add(A, mul(tA, 0.70 * dA)),
              add(B, mul(tB, 0.70 * dB)), add(B, mul(tB, 0.35 * dB)), B,
            ]));
            const makeBridgeForFace = (m, eStart, eEnd) => {
              const A = add(co.Q[m], mul(co.us[eStart], co.delta[eStart]));
              const B = add(co.Q[m], mul(co.us[eEnd], co.delta[eEnd]));
              const bCrv = bridge(A, mul(co.us[eStart], -1), co.delta[eStart], B, mul(co.us[eEnd], -1), co.delta[eEnd]);
              const backLen = 0.25 * Math.min(co.d0[eStart], co.d0[eEnd]);
              const Qback = add(co.Q[m], mul(add(co.us[eStart], co.us[eEnd]), -backLen));
              const Aback = add(A, mul(co.us[eEnd], -0.25 * co.d0[eEnd]));
              const Bback = add(B, mul(co.us[eStart], -0.25 * co.d0[eStart]));
              const bRev = bridge(B, mul(co.us[eEnd], -1), co.delta[eEnd], A, mul(co.us[eStart], -1), co.delta[eStart]);
              faceMasks[co.oppFace[m]].push(rawPlanarFace([bRev, rawLineEdge(A, Aback), rawLineEdge(Aback, Qback), rawLineEdge(Qback, Bback), rawLineEdge(Bback, B)]));
              return bCrv;
            };
            const b1 = makeBridgeForFace(1, 0, 2);
            const b0 = makeBridgeForFace(0, 2, 1);
            const b2 = makeBridgeForFace(2, 1, 0);
            const fp = [0, 1, 2].map((m) => rawPlaneFace(co.V, co.ns[m]));
            fill.Add(Ccurves[0], suppFaces[0], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(b1, fp[1], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(Ccurves[2], suppFaces[2], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(b0, fp[0], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(Ccurves[1], suppFaces[1], oc.GeomAbs_Shape.GeomAbs_G1, true);
            fill.Add(b2, fp[2], oc.GeomAbs_Shape.GeomAbs_G1, true);
          }
          fill.Build();
          if (!fill.IsDone()) throw new Error('Rundung fehlgeschlagen.');
          newFaces.push(track(oc.TopoDS.Face(fill.Shape())));
        } finally { fill.delete(); }
      }

      const finalFaces = [...newFaces];
      for (let fi = 0; fi < origFaces.length; fi++) {
        if (faceMasks[fi].length) {
          const trimmed = cutFaceWithMasks(origFaces[fi].wrapped, faceMasks[fi]);
          if (!trimmed.length) throw new Error('Rundung zu groß.');
          finalFaces.push(...trimmed);
        } else {
          finalFaces.push(origFaces[fi].wrapped);
        }
      }

      const volBefore = R.measureVolume(shape);
      let sew = null, sewed = null, ms = null, sol = null, sfs = null, fixed = null, res = null, chk = null;
      try {
        sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
        for (const f of finalFaces) sew.Add(f);
        sew.Perform();
        if (sew.NbFreeEdges() > 0) throw new Error('Rundung fehlgeschlagen.');
        sewed = sew.SewedShape();
        ms = new oc.BRepBuilderAPI_MakeSolid(oc.TopoDS.Shell(sewed));
        sol = ms.Solid();
        sfs = new oc.ShapeFix_Solid(sol);
        sfs.Perform();
        fixed = oc.TopoDS.Solid(sfs.Solid());
        res = R.cast(fixed);
        fixed = null;
        if (!res || !R.isShape3D(res)) { safeDelete(res); throw new Error('Rundung fehlgeschlagen.'); }
        if (R.measureVolume(res) < 0) {
          const rev = R.cast(res.wrapped.Reversed());
          safeDelete(res);
          res = rev;
        }
        chk = new oc.BRepCheck_Analyzer(res.wrapped, true);
        if (!chk.IsValid()) { safeDelete(res); throw new Error('Rundung fehlgeschlagen.'); }
        const volAfter = R.measureVolume(res);
        if (!(volBefore - volAfter > 1e-4)) { safeDelete(res); throw new Error('Rundung fehlgeschlagen.'); }

        let outTopo = null;
        if (!skipTopo) {
          outTopo = createTopoMap();
          const origMeta = origFaces.map((f, i) => ({
            tid: topo ? tmGet(topo.faces, f.wrapped) : null,
            n: origNormals[i],
            o: origFacePt[i],
          }));
          const resFaces = exploreUnique(res, oc.TopAbs_ShapeEnum.TopAbs_FACE);
          for (const rf of resFaces) {
            const rObj = new R.Face(oc.TopoDS.Face(rf.s));
            try {
              if (rObj.geomType === 'PLANE') {
                const rn = norm(vec(rObj.normalAt())), rc = vec(rObj.center);
                const match = origMeta.find((m) => m.tid && m.n && dot(m.n, rn) > 0.999 && Math.abs(dot(sub(rc, m.o), m.n)) < 1e-3);
                if (match) tmAdd(outTopo.faces, rf.s, match.tid);
                else rf.s.delete();
              } else {
                rf.s.delete();
              }
            } finally { rObj.delete(); }
          }
          ensureTopoComplete(res, outTopo, 'FiC:' + (fin.id || 'f'));
        }
        return { shape: res, topo: outTopo };
      } finally {
        safeDelete(chk); safeDelete(fixed); safeDelete(sfs); safeDelete(sol); safeDelete(ms); safeDelete(sewed); safeDelete(sew);
      }
    } finally {
      freeOrig();
    }
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
    const wantG2 = !!(fin && fin.shape === 'g2');
    const cornerMode = fin && fin.corner === 'smooth' ? 'smooth' : 'sphere';
    const r2 = fin && fin.vr ? num(fin.r2, r) * (r / Math.max(1e-9, num(fin.r, r))) : r;
    const isVar = !!(fin && fin.vr && r2 > 0 && Math.abs(r2 - r) > 1e-9);
    if (!isVar && matchedEdges.length >= 3 && (wantG2 || cornerMode === 'smooth')) {
      const cornerRes = tryCornerFilletWithTopo(shape, topo, r, matchedEdges, fin, itemId, skipTopo, wantG2 ? 'g2' : 'round', cornerMode);
      if (cornerRes) return cornerRes;
    }
    if (wantG2) {
      return runG2FilletWithTopo(shape, topo, r, matchedEdges, fin, itemId, skipTopo);
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
  function shellFaceNormal(f) {
    try {
      const nv = f.normalAt();
      const nl = Math.hypot(nv.x, nv.y, nv.z);
      return nl > 1e-12 ? [nv.x / nl, nv.y / nl, nv.z / nl] : null;
    } catch (_) { return null; }
  }
  function shellFacePoint(f) {
    try {
      const p = f.geomType === 'PLANE' ? f.center : f.pointOnSurface(0.5, 0.5);
      return [p.x, p.y, p.z];
    } catch (_) {
      try { const c = f.center; return [c.x, c.y, c.z]; } catch (__) { return null; }
    }
  }
  function resolveShellWallFace(spec, nonOpen, tol, topo, itemId, isLeaf) {
    if (!spec || (!spec.c && !spec.tid)) return null;
    const direct = resolveFaceRef({ ...spec, tol }, nonOpen, topo, itemId, isLeaf);
    if (direct.length === 1) return direct[0];
    if (direct.length > 1 && Array.isArray(spec.c)) {
      let best = direct[0], bd = Infinity;
      for (const f of direct) {
        try {
          const c = vec(f.center);
          const d = Math.hypot(c[0] - spec.c[0], c[1] - spec.c[1], c[2] - spec.c[2]);
          if (d < bd) { bd = d; best = f; }
        } catch (_) {}
      }
      return best;
    }
    if (!Array.isArray(spec.c)) return null;
    const hasN = Array.isArray(spec.n) && spec.n.length >= 3;
    const sn = hasN ? norm(spec.n) : null;
    const pickBest = (signCheck) => {
      let best = null, bestScore = Infinity;
      for (const f of nonOpen) {
        if (spec.t && f.geomType !== spec.t && f.geomType === 'PLANE') continue;
        let fc;
        try { fc = vec(f.center); } catch (_) { continue; }
        const diff = sub(spec.c, fc);
        if (sn && f.geomType === 'PLANE') {
          const fn = shellFaceNormal(f);
          if (!fn) continue;
          const dp = dot(fn, sn);
          if (signCheck > 0 ? dp < 0.95 : dp > -0.95) continue;
          const nDir = signCheck > 0 ? fn : mul(fn, -1);
          const nDist = dot(diff, nDir);
          if (nDist < -tol) continue;
          const lat = Math.hypot(...sub(diff, mul(nDir, nDist)));
          const typePen = spec.t && f.geomType !== spec.t ? 100 : 0;
          const score = typePen + lat * 4 + Math.abs(nDist);
          if (score < bestScore) { bestScore = score; best = f; }
        } else {
          if (spec.t && f.geomType !== spec.t) continue;
          const d = len(diff);
          if (d < bestScore) { bestScore = d; best = f; }
        }
      }
      return best;
    };
    return pickBest(1) || (sn ? pickBest(-1) : null);
  }
  function makeShellBase(baseShape, openFaces, signedOff, preferIntersect) {
    const modes = preferIntersect
      ? [oc.GeomAbs_JoinType.GeomAbs_Intersection, oc.GeomAbs_JoinType.GeomAbs_Arc]
      : [oc.GeomAbs_JoinType.GeomAbs_Arc, oc.GeomAbs_JoinType.GeomAbs_Intersection];
    let lastErr = null;
    for (const jt of modes) {
      const rem = new oc.NCollection_List_TopoDS_Shape();
      for (const f of openFaces) rem.Append(f.wrapped);
      const builder = new oc.BRepOffsetAPI_MakeThickSolid();
      try {
        builder.MakeThickSolidByJoin(baseShape.wrapped, rem, signedOff, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, jt, false);
        const res = R.cast(builder.Shape());
        if (res && R.isShape3D(res)) {
          rem.delete();
          return { shape: res, builder };
        }
        safeDelete(res);
      } catch (e) {
        lastErr = e;
      }
      builder.delete();
      rem.delete();
    }
    throw lastErr || new Error('shell');
  }
  function thickenShellFaceOut(face, delta, overlap = 1e-2) {
    const fw = face.wrapped;
    if (face.geomType === 'PLANE') {
      const n = shellFaceNormal(face);
      if (!n) throw new Error('shell normal');
      const fStart = overlap > 0 ? face.clone().translate([-n[0] * overlap, -n[1] * overlap, -n[2] * overlap]) : face;
      const vecArg = new oc.gp_Vec(n[0] * (delta + overlap), n[1] * (delta + overlap), n[2] * (delta + overlap));
      const pr = new oc.BRepPrimAPI_MakePrism(fStart.wrapped, vecArg, false, true);
      let res = R.cast(pr.Shape());
      pr.delete(); vecArg.delete();
      if (fStart !== face) safeDelete(fStart);
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    }
    const pt = shellFacePoint(face);
    const n = shellFaceNormal(face);
    if (!pt || !n) throw new Error('shell curved normal');
    const ob0 = new oc.BRepOffsetAPI_MakeOffsetShape();
    ob0.PerformBySimple(fw, Math.min(delta, 0.5));
    const offSh0 = R.cast(ob0.Shape()); ob0.delete();
    const offFace0 = offSh0.faces && offSh0.faces[0] ? offSh0.faces[0] : offSh0;
    const pOff = shellFacePoint(offFace0);
    safeDelete(offSh0);
    const moved = pOff ? dot(sub(pOff, pt), n) : 1;
    const sgn = moved >= 0 ? 1 : -1;
    let startSh = fw, ownStart = false;
    if (overlap > 0) {
      const ob1 = new oc.BRepOffsetAPI_MakeOffsetShape();
      ob1.PerformBySimple(fw, -sgn * overlap);
      startSh = ob1.Shape(); ob1.delete(); ownStart = true;
    }
    const ts = new oc.BRepOffsetAPI_MakeThickSolid();
    let raw = null;
    try {
      ts.MakeThickSolidBySimple(startSh, sgn * (delta + overlap));
      raw = ts.Shape();
    } finally {
      ts.delete();
      if (ownStart) safeDelete(startSh);
    }
    const sfs = new oc.ShapeFix_Solid(oc.TopoDS.Solid(raw));
    sfs.Perform();
    const sol = oc.TopoDS.Solid(sfs.Solid());
    sfs.delete();
    let res = R.cast(sol);
    if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
    return res;
  }
  function findShellTargetFace(curFaces, origInfo, tMin, side) {
    const wantSign = side === 'in' ? -1 : 1;
    const expPt = add(origInfo.pt, mul(origInfo.n, wantSign * tMin));
    let best = null, bestScore = Infinity;
    for (const f of curFaces) {
      if (f.geomType !== origInfo.t) continue;
      const fn = shellFaceNormal(f);
      if (!fn) continue;
      const dp = dot(fn, origInfo.n) * wantSign;
      if (origInfo.t === 'PLANE') {
        if (dp < 0.98) continue;
        let fc;
        try { fc = vec(f.center); } catch (_) { continue; }
        const proj = dot(sub(fc, origInfo.pt), origInfo.n);
        const errN = Math.abs(proj - wantSign * tMin);
        if (errN > Math.max(0.2, tMin * 0.25)) continue;
        const score = errN * 10 + len(sub(fc, expPt));
        if (score < bestScore) { bestScore = score; best = f; }
      } else {
        if (dp < 0.85) continue;
        const fp = shellFacePoint(f);
        if (!fp) continue;
        const d = len(sub(fp, expPt));
        if (d < bestScore) { bestScore = d; best = f; }
      }
    }
    return best;
  }
  function buildOneSideShell(baseShape, openFaces, defaultT, overrideMap, side, inTopo, itemId, finId) {
    const baseFaces = [];
    try { for (const f of baseShape.faces) baseFaces.push(f); } catch (_) {}
    try {
      const nonOpen = baseFaces.filter((f) => !openFaces.some((o) => o.isSame(f)));
      const plan = [];
      for (const f of nonOpen) {
        let r = defaultT;
        for (const [of, val] of overrideMap.entries()) {
          if (of.isSame(f)) { r = val; break; }
        }
        const n = shellFaceNormal(f);
        const pt = shellFacePoint(f);
        if (!n || !pt) continue;
        plan.push({ r, info: { t: f.geomType, n, pt } });
      }
      const tMin = plan.length ? Math.min(...plan.map((p) => p.r)) : defaultT;
      const baseRes = makeShellBase(baseShape, openFaces, side === 'in' ? -tMin : tMin, side === 'out');
      let cur = baseRes.shape;
      let curTopo = null;
      try {
        curTopo = propagateHistory(baseRes.builder, [{ topo: inTopo, selfId: itemId }], cur, 'Sh:' + (finId || 's'));
      } finally {
        baseRes.builder.delete();
      }
      const extras = plan.filter((p) => p.r - tMin > 1e-4);
      for (const ex of extras) {
        const curFaces = [];
        try { for (const f of cur.faces) curFaces.push(f); } catch (_) {}
        let slab = null;
        try {
          const tf = findShellTargetFace(curFaces, ex.info, tMin, side);
          if (!tf) throw new Error('shell target face');
          slab = thickenShellFaceOut(tf, ex.r - tMin, Math.min(1e-2, tMin * 0.25));
        } finally {
          for (const f of curFaces) safeDelete(f);
        }
        try {
          const fused = boolWithTopo('fuse', cur, curTopo, null, slab, null, null, 'ShW:' + (finId || 's'));
          safeDelete(cur);
          freeTopoMap(curTopo);
          cur = fused.shape;
          curTopo = fused.topo;
        } finally {
          safeDelete(slab);
        }
      }
      return { shape: cur, topo: curTopo };
    } finally {
      for (const f of baseFaces) safeDelete(f);
    }
  }
  function applyShell(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const t0 = num(fin.r, 2);
    const dir = fin.dir === 'out' || fin.dir === 'mid' ? fin.dir : 'in';
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
    const nonOpen = faceArr.filter((f) => !picked.some((o) => o.isSame(f)));
    const overrideMap = new Map();
    const wallSpecs = Array.isArray(fin.faceWalls) ? fin.faceWalls : [];
    for (const fw of wallSpecs) {
      if (!fw) continue;
      const wr = num(fw.r, t0);
      if (!(wr > 0)) {
        for (const f of faceArr) safeDelete(f);
        errors.push({ itemId, finishId: fin.id, code: 'shell', message: 'Die Wandstärke muss größer als 0 mm sein.' });
        return { shape, topo };
      }
      const target = resolveShellWallFace(fw.face, nonOpen, tol, topo, itemId, isLeaf);
      if (target) overrideMap.set(target, wr);
    }
    const allT = [t0, ...overrideMap.values()];
    const tMin = Math.min(...allT), tMax = Math.max(...allT);
    const minDim = Math.min(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const maxDim = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    if (!(t0 > 0) || !(tMin > 0)) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: 'Die Wandstärke muss größer als 0 mm sein.' });
      return { shape, topo };
    }
    if (dir === 'in' && (2 * tMin >= minDim - 1e-6 || tMax >= maxDim - 1e-6)) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: `Die Wandstärke ist zu dick für dieses Teil – möglich sind weniger als ${String(Math.floor(minDim * 5) / 10).replace('.', ',')} mm.` });
      return { shape, topo };
    }
    if (dir === 'mid' && (tMin >= minDim - 1e-6 || tMax * 0.5 >= maxDim - 1e-6)) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: `Die Wandstärke ist zu dick für dieses Teil – möglich sind weniger als ${String(Math.floor(minDim * 10) / 10).replace('.', ',')} mm.` });
      return { shape, topo };
    }
    try {
      let resObj = null;
      if (dir === 'mid') {
        const halfMap = new Map();
        for (const [f, val] of overrideMap.entries()) halfMap.set(f, val * 0.5);
        const hIn = buildOneSideShell(shape, picked, t0 * 0.5, halfMap, 'in', topo, itemId, fin.id);
        let hOut = null;
        try {
          hOut = buildOneSideShell(shape, picked, t0 * 0.5, halfMap, 'out', topo, itemId, fin.id);
          resObj = boolWithTopo('fuse', hIn.shape, hIn.topo, null, hOut.shape, hOut.topo, null, 'ShM:' + (fin.id || 's'));
        } finally {
          safeDelete(hIn.shape); freeTopoMap(hIn.topo);
          if (hOut) { safeDelete(hOut.shape); freeTopoMap(hOut.topo); }
        }
      } else {
        resObj = buildOneSideShell(shape, picked, t0, overrideMap, dir, topo, itemId, fin.id);
      }
      const res = resObj && resObj.shape;
      if (!res || !R.isShape3D(res)) {
        safeDelete(res);
        if (resObj) freeTopoMap(resObj.topo);
        throw new Error('shell');
      }
      const rb = bboxOf(res);
      if (dir === 'in') {
        if (rb[3] - rb[0] > b[3] - b[0] + 1e-3 || rb[4] - rb[1] > b[4] - b[1] + 1e-3 || rb[5] - rb[2] > b[5] - b[2] + 1e-3 || R.measureVolume(res) >= R.measureVolume(shape) - 1e-3) {
          safeDelete(res); freeTopoMap(resObj.topo); throw new Error('größer');
        }
      } else {
        const maxExp = (dir === 'out' ? 2 * tMax : tMax) + 1;
        const grew = (rb[3] - rb[0] > b[3] - b[0] + 1e-3) || (rb[4] - rb[1] > b[4] - b[1] + 1e-3) || (rb[5] - rb[2] > b[5] - b[2] + 1e-3);
        const shrunk = (rb[3] - rb[0] < b[3] - b[0] - 1e-3) || (rb[4] - rb[1] < b[4] - b[1] - 1e-3) || (rb[5] - rb[2] < b[5] - b[2] - 1e-3);
        const exploded = (rb[3] - rb[0] > b[3] - b[0] + maxExp) || (rb[4] - rb[1] > b[4] - b[1] + maxExp) || (rb[5] - rb[2] > b[5] - b[2] + maxExp);
        if (!grew || shrunk || exploded) {
          safeDelete(res); freeTopoMap(resObj.topo); throw new Error('shell bounds');
        }
      }
      return resObj;
    } catch (_) {
      errors.push({ itemId, finishId: fin.id, code: 'shell', message: 'Die Wandstärke ließ sich mit diesen Werten nicht bauen – prüfe Richtung und Wandstärken.' });
      return { shape, topo };
    } finally {
      for (const f of faceArr) safeDelete(f);
    }
  }
  function applyFullFillet(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const sigs = (fin.faces || []).filter((f) => f && (f.c || f.tid));
    if (sigs.length < 3) {
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing: [0, 1, 2], message: 'Für die Vollrundung werden drei Flächen gebraucht.' });
      return { shape, topo };
    }
    const b = bboxOf(shape);
    const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const faceArr = [];
    try { for (const f of shape.faces) faceArr.push(f); } catch (_) {}
    const resolved = [];
    const missing = [];
    for (let i = 0; i < 3; i++) {
      const hits = resolveFaceRef({ ...sigs[i], tol }, faceArr, topo, itemId, isLeaf);
      if (!hits.length) missing.push(i);
      resolved.push(hits[0] || null);
    }
    if (missing.length) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing, message: 'Eine der drei Flächen der Vollrundung gibt es nicht mehr.' });
      return { shape, topo };
    }
    const [f1, fc, f2] = resolved;
    if (f1.isSame(fc) || f2.isSame(fc) || f1.isSame(f2)) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'fullfillet', message: 'Bitte drei verschiedene Flächen für die Vollrundung wählen.' });
      return { shape, topo };
    }
    const f1Edges = [], fcEdges = [], f2Edges = [];
    try { for (const e of f1.edges) f1Edges.push(e); } catch (_) {}
    try { for (const e of fc.edges) fcEdges.push(e); } catch (_) {}
    try { for (const e of f2.edges) f2Edges.push(e); } catch (_) {}
    const e1s = fcEdges.filter((e) => f1Edges.some((x) => x.isSame(e)));
    const e2s = fcEdges.filter((e) => f2Edges.some((x) => x.isSame(e)));
    const freeLists = () => {
      for (const e of f1Edges) safeDelete(e);
      for (const e of fcEdges) safeDelete(e);
      for (const e of f2Edges) safeDelete(e);
      for (const f of faceArr) safeDelete(f);
    };
    if (!e1s.length || !e2s.length) {
      freeLists();
      errors.push({ itemId, finishId: fin.id, code: 'fullfillet', message: 'Die mittlere Fläche der Vollrundung muss an beide Seitenflächen grenzen.' });
      return { shape, topo };
    }

    let radEst = 0;
    try {
      const m1 = vec(e1s[0].pointAt(0.5)), m2 = vec(e2s[0].pointAt(0.5));
      radEst = len(sub(m2, m1)) * 0.5;
    } catch (_) {}

    // Primärweg: exakter analytischer Schnitt bei drei ebenen Flächen mit parallelen geraden Grenzkanten
    if (f1.geomType === 'PLANE' && fc.geomType === 'PLANE' && f2.geomType === 'PLANE' &&
        e1s.length === 1 && e2s.length === 1 && e1s[0].geomType === 'LINE' && e2s[0].geomType === 'LINE') {
      try {
        const a1 = vec(e1s[0].startPoint), b1 = vec(e1s[0].endPoint);
        const a2 = vec(e2s[0].startPoint), b2 = vec(e2s[0].endPoint);
        const u = norm(sub(b1, a1)), u2 = norm(sub(b2, a2));
        const n1 = norm(vec(f1.normalAt())), nc = norm(vec(fc.normalAt())), n2 = norm(vec(f2.normalAt()));
        const pc = vec(fc.center);
        if (Math.abs(dot(u, u2)) > 0.9999 &&
            Math.abs(dot(n1, u)) < 1e-4 && Math.abs(dot(nc, u)) < 1e-4 && Math.abs(dot(n2, u)) < 1e-4 &&
            dot(sub(pc, a1), n1) < -1e-4 && dot(sub(pc, a2), n2) < -1e-4) {
          const ex = nc;
          const ey = norm(cross(u, ex));
          const to2 = (p) => { const d = sub(p, a1); return [dot(d, ex), dot(d, ey)]; };
          const n2d = (nv) => [dot(nv, ex), dot(nv, ey)];
          const P1 = to2(a1), Pc = to2(pc), P2 = to2(a2);
          const N1 = n2d(n1), Nc = n2d(nc), N2 = n2d(n2);
          const M = [
            [N1[0], N1[1], 1, N1[0] * P1[0] + N1[1] * P1[1]],
            [Nc[0], Nc[1], 1, Nc[0] * Pc[0] + Nc[1] * Pc[1]],
            [N2[0], N2[1], 1, N2[0] * P2[0] + N2[1] * P2[1]],
          ];
          let okMat = true;
          for (let i = 0; i < 3; i++) {
            let piv = i;
            for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
            if (Math.abs(M[piv][i]) < 1e-9) { okMat = false; break; }
            [M[i], M[piv]] = [M[piv], M[i]];
            for (let r = 0; r < 3; r++) if (r !== i) {
              const k = M[r][i] / M[i][i];
              for (let c = i; c < 4; c++) M[r][c] -= k * M[i][c];
            }
          }
          if (okMat) {
            const Cx = M[0][3] / M[0][0], Cy = M[1][3] / M[1][1], rad = M[2][3] / M[2][2];
            if (rad > 1e-4) {
              radEst = rad;
              const T1 = [Cx + rad * N1[0], Cy + rad * N1[1]];
              const Tc = [Cx + rad * Nc[0], Cy + rad * Nc[1]];
              const T2 = [Cx + rad * N2[0], Cy + rad * N2[1]];
              const us = [a1, b1, a2, b2].map((p) => dot(sub(p, a1), u));
              const uMin = Math.min(...us), uMax = Math.max(...us);
              let shUMin = Infinity, shUMax = -Infinity;
              for (const ix of [b[0], b[3]]) for (const iy of [b[1], b[4]]) for (const iz of [b[2], b[5]]) {
                const pr = dot(sub([ix, iy, iz], a1), u);
                if (pr < shUMin) shUMin = pr;
                if (pr > shUMax) shUMax = pr;
              }
              const padLo = uMin <= shUMin + 1e-3 ? Math.max(0.5, rad * 0.2) : 0;
              const padHi = uMax >= shUMax - 1e-3 ? Math.max(0.5, rad * 0.2) : 0;
              const d1v = [P1[0] - T1[0], P1[1] - T1[1]]; const d1l = Math.hypot(d1v[0], d1v[1]) || 1;
              const d2v = [P2[0] - T2[0], P2[1] - T2[1]]; const d2l = Math.hypot(d2v[0], d2v[1]) || 1;
              const padOut = Math.max(1, rad * 0.5);
              const E1 = [P1[0] + (d1v[0] / d1l) * padOut, P1[1] + (d1v[1] / d1l) * padOut];
              const E2 = [P2[0] + (d2v[0] / d2l) * padOut, P2[1] + (d2v[1] / d2l) * padOut];
              const to3 = (xy, zU) => add(add(a1, mul(u, zU)), add(mul(ex, xy[0]), mul(ey, xy[1])));
              const z0 = uMin - padLo, hU = (uMax - uMin) + padLo + padHi;
              const pT1 = to3(T1, z0), pE1 = to3(E1, z0), pE2 = to3(E2, z0), pT2 = to3(T2, z0), pTc = to3(Tc, z0);

              let wb = null, fb = null, pr = null, gv = null, cut = null, usd = null;
              let l1 = null, l2 = null, l3 = null, a3 = null, faceW = null, prismSh = null, cutRes = null, res = null, chk = null, cutTopo = null;
              try {
                wb = new oc.BRepBuilderAPI_MakeWire();
                l1 = R.makeLine(pT1, pE1); wb.Add(l1.wrapped);
                l2 = R.makeLine(pE1, pE2); wb.Add(l2.wrapped);
                l3 = R.makeLine(pE2, pT2); wb.Add(l3.wrapped);
                a3 = R.makeThreePointArc(pT2, pTc, pT1); wb.Add(a3.wrapped);
                wb.Build();
                fb = new oc.BRepBuilderAPI_MakeFace(wb.Wire(), false);
                faceW = fb.Face();
                gv = new oc.gp_Vec(u[0] * hU, u[1] * hU, u[2] * hU);
                pr = new oc.BRepPrimAPI_MakePrism(faceW, gv, false, true);
                pr.Build();
                prismSh = pr.Shape();
                cut = new oc.BRepAlgoAPI_Cut(shape.wrapped, prismSh);
                cut.Build();
                cutRes = R.cast(cut.Shape());
                if (cutRes && R.isShape3D(cutRes)) {
                  const volBefore = R.measureVolume(shape);
                  const volCut = R.measureVolume(cutRes);
                  if (volBefore - volCut > 1e-4) {
                    cutTopo = propagateHistory(cut, [{ topo, selfId: itemId }], cutRes, 'Ff:' + (fin.id || 'f'));
                    usd = new oc.ShapeUpgrade_UnifySameDomain(cutRes.wrapped, true, true, false);
                    usd.Build();
                    res = R.cast(usd.Shape());
                    chk = new oc.BRepCheck_Analyzer(res.wrapped);
                    if (res && R.isShape3D(res) && chk.IsValid() && Math.abs(R.measureVolume(res) - volCut) < 1e-2) {
                      const outTopo = createTopoMap();
                      const cutFaces = [];
                      try { for (const f of cutRes.faces) cutFaces.push(f); } catch (_) {}
                      const cutMeta = cutFaces.map((cf) => {
                        let cn = null; try { cn = vec(cf.normalAt()); } catch (_) {}
                        return { gt: cf.geomType, c: vec(cf.center), n: cn, tid: tmGet(cutTopo.faces, cf.wrapped) };
                      });
                      const resFaces = exploreUnique(res, oc.TopAbs_ShapeEnum.TopAbs_FACE);
                      for (const rf of resFaces) {
                        const rObj = new R.Face(oc.TopoDS.Face(rf.s));
                        try {
                          const rGt = rObj.geomType, rc = vec(rObj.center);
                          let rn = null; try { rn = vec(rObj.normalAt()); } catch (_) {}
                          const match = cutMeta.find((m) => m.tid && m.gt === rGt && len(sub(m.c, rc)) < 1e-3 && (!m.n || !rn || dot(m.n, rn) > 0.999));
                          if (match) tmAdd(outTopo.faces, rf.s, match.tid);
                          else rf.s.delete();
                        } finally { rObj.delete(); }
                      }
                      for (const cf of cutFaces) safeDelete(cf);
                      ensureTopoComplete(res, outTopo, 'Ff:' + (fin.id || 'f'));
                      freeTopoMap(cutTopo);
                      freeLists();
                      return { shape: res, topo: outTopo };
                    }
                    safeDelete(res); res = null;
                  }
                }
                safeDelete(cutRes); cutRes = null;
              } catch (_) {
                safeDelete(res);
                safeDelete(cutRes);
              } finally {
                if (cutTopo) freeTopoMap(cutTopo);
                safeDelete(chk); safeDelete(usd); safeDelete(cut); safeDelete(prismSh); safeDelete(pr);
                safeDelete(gv); safeDelete(faceW); safeDelete(fb); safeDelete(wb);
                safeDelete(l1); safeDelete(l2); safeDelete(l3); safeDelete(a3);
              }
            }
          }
        }
      } catch (_) {}
    }

    // Fallback-Weg für gekrümmte Flächen/Kanten über MakeFillet
    if (radEst > 1e-4) {
      const edgeList = [...e1s, ...e2s];
      const runFilletR = (rad, skipTopo) => {
        const bld = new oc.BRepFilletAPI_MakeFillet(shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
        try {
          for (const e of edgeList) bld.Add(rad, e.wrapped);
          bld.Build();
          const sh = R.cast(bld.Shape());
          if (!sh || !R.isShape3D(sh)) { safeDelete(sh); throw new Error('fullfillet'); }
          const chk = new oc.BRepCheck_Analyzer(sh.wrapped);
          const valid = chk.IsValid(); chk.delete();
          if (!valid) { safeDelete(sh); throw new Error('fullfillet'); }
          const outTopo = skipTopo ? null : propagateHistory(bld, [{ topo, selfId: itemId }], sh, 'Ff:' + (fin.id || 'f'));
          return { shape: sh, topo: outTopo };
        } finally { bld.delete(); }
      };
      let best = null;
      try { best = runFilletR(radEst * (1 - 1e-4), false); } catch (_) {}
      if (!best) {
        let lo = 0, hi = radEst * 1.2, rBest = 0;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          try { const t = runFilletR(mid, true); safeDelete(t.shape); lo = mid; rBest = mid; } catch (_) { hi = mid; }
        }
        if (rBest > 1e-3) {
          try { best = runFilletR(rBest * (1 - 1e-4), false); } catch (_) {}
        }
      }
      if (best) {
        freeLists();
        return best;
      }
    }

    freeLists();
    errors.push({ itemId, finishId: fin.id, code: 'fullfillet', message: 'Die Vollrundung lässt sich an diesen drei Flächen nicht bauen.' });
    return { shape, topo };
  }

  function applyFaceFillet(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const r = num(fin.r, 5);
    if (!(r > 0)) {
      errors.push({ itemId, finishId: fin.id, code: 'fillet', message: 'Der Radius der Flächen-Rundung muss größer als 0 sein.' });
      return { shape, topo };
    }
    const sigs = (fin.faces || []).filter((f) => f && (f.c || f.tid));
    if (sigs.length < 2) {
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing: [0, 1], message: 'Für die Flächen-Rundung werden zwei Flächen gebraucht.' });
      return { shape, topo };
    }
    const b = bboxOf(shape);
    const maxDim = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const tol = 0.05 + 1e-3 * maxDim;
    const faceArr = [];
    try { for (const f of shape.faces) faceArr.push(f); } catch (_) {}
    const resolved = [];
    const missing = [];
    for (let i = 0; i < 2; i++) {
      const hits = resolveFaceRef({ ...sigs[i], tol }, faceArr, topo, itemId, isLeaf);
      if (!hits.length) missing.push(i);
      resolved.push(hits[0] || null);
    }
    if (missing.length) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'face', missing, message: 'Eine der beiden Flächen der Flächen-Rundung gibt es nicht mehr.' });
      return { shape, topo };
    }
    const [f1, f2] = resolved;
    if (f1.isSame(f2)) {
      for (const f of faceArr) safeDelete(f);
      errors.push({ itemId, finishId: fin.id, code: 'fillet', message: 'Bitte zwei verschiedene Flächen für die Flächen-Rundung wählen.' });
      return { shape, topo };
    }
    const f1Edges = [], f2Edges = [];
    try { for (const e of f1.edges) f1Edges.push(e); } catch (_) {}
    try { for (const e of f2.edges) f2Edges.push(e); } catch (_) {}
    const commonEdges = f1Edges.filter((e) => f2Edges.some((x) => x.isSame(e)));
    const freeLists = () => {
      for (const e of f1Edges) safeDelete(e);
      for (const e of f2Edges) safeDelete(e);
      for (const f of faceArr) safeDelete(f);
    };

    const tryAdjFillet = (rad, skipTopo) => {
      if (!commonEdges.length) return null;
      const bld = new oc.BRepFilletAPI_MakeFillet(shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
      let sh = null, chk = null;
      try {
        for (const e of commonEdges) bld.Add(rad, e.wrapped);
        bld.Build();
        sh = R.cast(bld.Shape());
        if (!sh || !R.isShape3D(sh)) { safeDelete(sh); return null; }
        chk = new oc.BRepCheck_Analyzer(sh.wrapped);
        if (!chk.IsValid()) { safeDelete(sh); return null; }
        const outTopo = skipTopo ? null : propagateHistory(bld, [{ topo, selfId: itemId }], sh, 'Ffl:' + (fin.id || 'f'));
        return { shape: sh, topo: outTopo };
      } catch (_) {
        safeDelete(sh);
        return null;
      } finally {
        safeDelete(chk);
        bld.delete();
      }
    };

    if (commonEdges.length) {
      const adjRes = tryAdjFillet(r, false);
      if (adjRes) {
        freeLists();
        return adjRes;
      }
    }

    let parallelErr = false;
    let planarReady = false;
    let tryPlanar = null;

    if (f1.geomType === 'PLANE' && f2.geomType === 'PLANE') {
      try {
        const n1 = norm(vec(f1.normalAt())), n2 = norm(vec(f2.normalAt()));
        const c1 = vec(f1.center), c2 = vec(f2.center);
        const dp = dot(n1, n2);
        if (Math.abs(dp) >= 0.9999) {
          parallelErr = true;
        } else {
          const u = norm(cross(n1, n2));
          const ex = n1;
          const ey = cross(u, ex);
          const to2 = (p) => { const d = sub(p, c1); return [dot(d, ex), dot(d, ey)]; };
          const N1 = [1, 0];
          const N2 = [dot(n2, ex), dot(n2, ey)];
          const Q2 = to2(c2);
          const d2 = N2[0] * Q2[0] + N2[1] * Q2[1];
          if (Math.abs(N2[1]) > 1e-6) {
            const I = [0, d2 / N2[1]];
            const uSpanOf = (edges) => {
              let mn = Infinity, mx = -Infinity;
              const pts2 = [];
              for (const e of edges) {
                for (const pt of [vec(e.startPoint), vec(e.endPoint), vec(e.pointAt(0.5))]) {
                  const pr = dot(sub(pt, c1), u);
                  if (pr < mn) mn = pr;
                  if (pr > mx) mx = pr;
                  pts2.push(to2(pt));
                }
              }
              return { mn, mx, pts2 };
            };
            const s1 = uSpanOf(f1Edges), s2 = uSpanOf(f2Edges);
            const uMin = Math.max(s1.mn, s2.mn), uMax = Math.min(s1.mx, s2.mx);
            const s21 = dot(sub(c2, c1), n1), s12 = dot(sub(c1, c2), n2);
            const isConvex = s21 < -1e-4 && s12 < -1e-4;
            const isConcave = s21 > 1e-4 && s12 > 1e-4;
            if (uMax - uMin > 1e-4 && (isConvex || isConcave)) {
              const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
              const dir1 = norm2([to2(c1)[0] - I[0], to2(c1)[1] - I[1]]);
              const dir2 = norm2([Q2[0] - I[0], Q2[1] - I[1]]);
              const reachMax1 = Math.max(...s1.pts2.map((q) => (q[0] - I[0]) * dir1[0] + (q[1] - I[1]) * dir1[1]));
              const reachMax2 = Math.max(...s2.pts2.map((q) => (q[0] - I[0]) * dir2[0] + (q[1] - I[1]) * dir2[1]));
              let shUMin = Infinity, shUMax = -Infinity;
              for (const ix of [b[0], b[3]]) for (const iy of [b[1], b[4]]) for (const iz of [b[2], b[5]]) {
                const pr = dot(sub([ix, iy, iz], c1), u);
                if (pr < shUMin) shUMin = pr;
                if (pr > shUMax) shUMax = pr;
              }
              const shapePts = [];
              try {
                for (const se of shape.edges) {
                  shapePts.push(vec(se.startPoint), vec(se.endPoint));
                  safeDelete(se);
                }
              } catch (_) {}
              const volBefore = R.measureVolume(shape);
              const bboxDiag = Math.max(1, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
              const to3 = (xy, zU) => add(add(c1, mul(u, zU)), add(mul(ex, xy[0]), mul(ey, xy[1])));
              const finalizeBoolResult = (opRes, opBuilder, skipTopo) => {
                let resRaw = R.cast(opRes), usd = null, res = null, chk = null, opTopo = null;
                try {
                  if (!resRaw || !R.isShape3D(resRaw)) return null;
                  const volAfterRaw = R.measureVolume(resRaw);
                  if (Math.abs(volBefore - volAfterRaw) <= 1e-4) return null;
                  if (skipTopo) {
                    chk = new oc.BRepCheck_Analyzer(resRaw.wrapped);
                    if (!chk.IsValid()) return null;
                    return { shape: resRaw, topo: null, ownsRaw: true };
                  }
                  opTopo = propagateHistory(opBuilder, [{ topo, selfId: itemId }], resRaw, 'Ffl:' + (fin.id || 'f'));
                  usd = new oc.ShapeUpgrade_UnifySameDomain(resRaw.wrapped, true, true, false);
                  usd.Build();
                  res = R.cast(usd.Shape());
                  chk = new oc.BRepCheck_Analyzer(res.wrapped);
                  if (!res || !R.isShape3D(res) || !chk.IsValid() || Math.abs(R.measureVolume(res) - volAfterRaw) > 1e-2) {
                    safeDelete(res); res = null;
                    return null;
                  }
                  const outTopo = createTopoMap();
                  const rawFaces = [];
                  try { for (const f of resRaw.faces) rawFaces.push(f); } catch (_) {}
                  const rawMeta = rawFaces.map((rf) => {
                    let rn = null; try { rn = vec(rf.normalAt()); } catch (_) {}
                    return { gt: rf.geomType, c: vec(rf.center), n: rn, tid: tmGet(opTopo.faces, rf.wrapped) };
                  });
                  const resFaces = exploreUnique(res, oc.TopAbs_ShapeEnum.TopAbs_FACE);
                  for (const rf of resFaces) {
                    const rObj = new R.Face(oc.TopoDS.Face(rf.s));
                    try {
                      const rGt = rObj.geomType, rc = vec(rObj.center);
                      let rn = null; try { rn = vec(rObj.normalAt()); } catch (_) {}
                      const match = rawMeta.find((m) => m.tid && m.gt === rGt && len(sub(m.c, rc)) < 1e-3 && (!m.n || !rn || dot(m.n, rn) > 0.999));
                      if (match) tmAdd(outTopo.faces, rf.s, match.tid);
                      else rf.s.delete();
                    } finally { rObj.delete(); }
                  }
                  for (const rf of rawFaces) safeDelete(rf);
                  ensureTopoComplete(res, outTopo, 'Ffl:' + (fin.id || 'f'));
                  return { shape: res, topo: outTopo };
                } finally {
                  if (opTopo) freeTopoMap(opTopo);
                  safeDelete(chk); safeDelete(usd);
                  if (resRaw && (!skipTopo || !res)) safeDelete(resRaw);
                }
              };

              planarReady = true;
              tryPlanar = (rad, skipTopo) => {
                const padLo = uMin <= shUMin + 1e-3 ? Math.max(0.5, rad * 0.2) : 0;
                const padHi = uMax >= shUMax - 1e-3 ? Math.max(0.5, rad * 0.2) : 0;
                if (isConvex) {
                  const Cx = -rad, Cy = (d2 - rad - N2[0] * Cx) / N2[1];
                  const C = [Cx, Cy];
                  const T1 = [C[0] + rad * N1[0], C[1] + rad * N1[1]];
                  const T2 = [C[0] + rad * N2[0], C[1] + rad * N2[1]];
                  const rT1 = (T1[0] - I[0]) * dir1[0] + (T1[1] - I[1]) * dir1[1];
                  const rT2 = (T2[0] - I[0]) * dir2[0] + (T2[1] - I[1]) * dir2[1];
                  if (rT1 <= 1e-4 || rT2 <= 1e-4 || rT1 > reachMax1 + 1e-3 || rT2 > reachMax2 + 1e-3) return null;
                  const bis = norm2([N1[0] + N2[0], N1[1] + N2[1]]);
                  const Tm = [C[0] + rad * bis[0], C[1] + rad * bis[1]];
                  const pad = Math.max(2, rad * 0.5, bboxDiag * 0.1);
                  const E1 = [T1[0] + pad * N1[0], T1[1] + pad * N1[1]];
                  const E2 = [T2[0] + pad * N2[0], T2[1] + pad * N2[1]];
                  const E0 = [pad, (d2 + pad - N2[0] * pad) / N2[1]];
                  const z0 = uMin - padLo, hU = (uMax - uMin) + padLo + padHi;
                  let wb = null, fb = null, pr = null, gv = null, cut = null;
                  let l1 = null, l2 = null, l3 = null, l4 = null, a3 = null, faceW = null, prismSh = null;
                  try {
                    wb = new oc.BRepBuilderAPI_MakeWire();
                    l1 = R.makeLine(to3(T1, z0), to3(E1, z0)); wb.Add(l1.wrapped);
                    l2 = R.makeLine(to3(E1, z0), to3(E0, z0)); wb.Add(l2.wrapped);
                    l3 = R.makeLine(to3(E0, z0), to3(E2, z0)); wb.Add(l3.wrapped);
                    l4 = R.makeLine(to3(E2, z0), to3(T2, z0)); wb.Add(l4.wrapped);
                    a3 = R.makeThreePointArc(to3(T2, z0), to3(Tm, z0), to3(T1, z0)); wb.Add(a3.wrapped);
                    wb.Build();
                    fb = new oc.BRepBuilderAPI_MakeFace(wb.Wire(), false);
                    faceW = fb.Face();
                    gv = new oc.gp_Vec(u[0] * hU, u[1] * hU, u[2] * hU);
                    pr = new oc.BRepPrimAPI_MakePrism(faceW, gv, false, true);
                    pr.Build();
                    prismSh = pr.Shape();
                    cut = new oc.BRepAlgoAPI_Cut(shape.wrapped, prismSh);
                    cut.Build();
                    const out = finalizeBoolResult(cut.Shape(), cut, skipTopo);
                    if (out && skipTopo && out.ownsRaw) return { shape: out.shape, topo: null };
                    return out;
                  } catch (_) {
                    return null;
                  } finally {
                    safeDelete(cut); safeDelete(prismSh); safeDelete(pr); safeDelete(gv);
                    safeDelete(faceW); safeDelete(fb); safeDelete(wb);
                    safeDelete(l1); safeDelete(l2); safeDelete(l3); safeDelete(l4); safeDelete(a3);
                  }
                } else {
                  const Cx = rad, Cy = (d2 + rad - N2[0] * Cx) / N2[1];
                  const C = [Cx, Cy];
                  const T1 = [C[0] - rad * N1[0], C[1] - rad * N1[1]];
                  const T2 = [C[0] - rad * N2[0], C[1] - rad * N2[1]];
                  const rT1 = (T1[0] - I[0]) * dir1[0] + (T1[1] - I[1]) * dir1[1];
                  const rT2 = (T2[0] - I[0]) * dir2[0] + (T2[1] - I[1]) * dir2[1];
                  if (rT1 <= 1e-4 || rT2 <= 1e-4 || rT1 > reachMax1 + 1e-3 || rT2 > reachMax2 + 1e-3) return null;
                  const bis = norm2([N1[0] + N2[0], N1[1] + N2[1]]);
                  const Tm = [C[0] - rad * bis[0], C[1] - rad * bis[1]];
                  let baseShape = shape, ownsBase = false;
                  const needTrim = shapePts.some((pt) => {
                    const pu = dot(sub(pt, c1), u);
                    if (pu < uMin - 1e-3 || pu > uMax + 1e-3) return false;
                    if (dot(sub(pt, c1), n1) <= 1e-4 || dot(sub(pt, c2), n2) <= 1e-4) return false;
                    const q2 = to2(pt);
                    return Math.hypot(q2[0] - C[0], q2[1] - C[1]) < rad - 1e-3;
                  });
                  if (needTrim) {
                    const zC0 = uMin - padLo, hUC = (uMax - uMin) + padLo + padHi;
                    let wbC = null, fbC = null, prC = null, gvC = null, cutC = null;
                    let c1L = null, c2L = null, cArc = null, fwC = null, psC = null;
                    try {
                      wbC = new oc.BRepBuilderAPI_MakeWire();
                      c1L = R.makeLine(to3(C, zC0), to3(T1, zC0)); wbC.Add(c1L.wrapped);
                      cArc = R.makeThreePointArc(to3(T1, zC0), to3(Tm, zC0), to3(T2, zC0)); wbC.Add(cArc.wrapped);
                      c2L = R.makeLine(to3(T2, zC0), to3(C, zC0)); wbC.Add(c2L.wrapped);
                      wbC.Build();
                      fbC = new oc.BRepBuilderAPI_MakeFace(wbC.Wire(), false);
                      fwC = fbC.Face();
                      gvC = new oc.gp_Vec(u[0] * hUC, u[1] * hUC, u[2] * hUC);
                      prC = new oc.BRepPrimAPI_MakePrism(fwC, gvC, false, true);
                      prC.Build();
                      psC = prC.Shape();
                      cutC = new oc.BRepAlgoAPI_Cut(shape.wrapped, psC);
                      cutC.Build();
                      const trimmed = R.cast(cutC.Shape());
                      if (trimmed && R.isShape3D(trimmed)) { baseShape = trimmed; ownsBase = true; }
                      else safeDelete(trimmed);
                    } catch (_) {
                    } finally {
                      safeDelete(cutC); safeDelete(psC); safeDelete(prC); safeDelete(gvC);
                      safeDelete(fwC); safeDelete(fbC); safeDelete(wbC);
                      safeDelete(c1L); safeDelete(c2L); safeDelete(cArc);
                    }
                  }
                  const hU = uMax - uMin;
                  let wb = null, fb = null, pr = null, gv = null, fuse = null;
                  let l1 = null, l2 = null, a3 = null, faceW = null, prismSh = null;
                  try {
                    wb = new oc.BRepBuilderAPI_MakeWire();
                    l1 = R.makeLine(to3(I, uMin), to3(T1, uMin)); wb.Add(l1.wrapped);
                    a3 = R.makeThreePointArc(to3(T1, uMin), to3(Tm, uMin), to3(T2, uMin)); wb.Add(a3.wrapped);
                    l2 = R.makeLine(to3(T2, uMin), to3(I, uMin)); wb.Add(l2.wrapped);
                    wb.Build();
                    fb = new oc.BRepBuilderAPI_MakeFace(wb.Wire(), false);
                    faceW = fb.Face();
                    gv = new oc.gp_Vec(u[0] * hU, u[1] * hU, u[2] * hU);
                    pr = new oc.BRepPrimAPI_MakePrism(faceW, gv, false, true);
                    pr.Build();
                    prismSh = pr.Shape();
                    fuse = new oc.BRepAlgoAPI_Fuse(baseShape.wrapped, prismSh);
                    fuse.Build();
                    const out = finalizeBoolResult(fuse.Shape(), fuse, skipTopo);
                    if (out && skipTopo && out.ownsRaw) return { shape: out.shape, topo: null };
                    return out;
                  } catch (_) {
                    return null;
                  } finally {
                    if (ownsBase) safeDelete(baseShape);
                    safeDelete(fuse); safeDelete(prismSh); safeDelete(pr); safeDelete(gv);
                    safeDelete(faceW); safeDelete(fb); safeDelete(wb);
                    safeDelete(l1); safeDelete(l2); safeDelete(a3);
                  }
                }
              };
            }
          }
        }
      } catch (_) {}
    }

    if (parallelErr) {
      freeLists();
      errors.push({ itemId, finishId: fin.id, code: 'fillet', message: 'Die beiden gewählten Flächen sind parallel – wähle zwei Flächen im Winkel zueinander (oder nutze „Vollrundung“).' });
      return { shape, topo };
    }

    if (planarReady && tryPlanar) {
      const plRes = tryPlanar(r, false);
      if (plRes) {
        freeLists();
        return plRes;
      }
    }

    // Größten möglichen Radius per Bisektion suchen
    const tester = commonEdges.length ? (rad) => tryAdjFillet(rad, true) : (planarReady && tryPlanar ? (rad) => tryPlanar(rad, true) : null);
    let max = 0;
    if (tester) {
      let lo = 0, hi = r;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const t = tester(mid);
        if (t && t.shape) { safeDelete(t.shape); lo = mid; }
        else hi = mid;
      }
      max = Math.floor(lo * 10) / 10;
    }

    freeLists();
    errors.push(max > 0
      ? { itemId, finishId: fin.id, code: 'toobig', max, message: `Die Flächen-Rundung ist zu groß. Möglich sind höchstens ${String(max).replace('.', ',')} mm.` }
      : { itemId, finishId: fin.id, code: 'fillet', message: commonEdges.length || planarReady ? 'Die Flächen-Rundung lässt sich zwischen diesen beiden Flächen nicht bauen.' : 'Für nicht benachbarte Flächen werden zwei ebene Flächen im Winkel zueinander gebraucht.' });
    return { shape, topo };
  }

  function applyCornerChamfer(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const d1 = num(fin.d1, 2), d2 = num(fin.d2, 2), d3 = num(fin.d3, 2);
    if (!(d1 > 0 && d2 > 0 && d3 > 0)) {
      errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Alle drei Abstände der Ecken-Fase müssen größer als 0 sein.' });
      return { shape, topo };
    }
    const shapeEdges = [];
    try { for (const e of shape.edges) shapeEdges.push(e); } catch (_) {}
    const freeEdges = () => { for (const e of shapeEdges) safeDelete(e); };
    const b = bboxOf(shape);
    const maxDim = Math.max(1, b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const edgeEnds = (e) => [vec(e.startPoint), vec(e.endPoint)];

    let V = null;
    let orderedEdges = null;

    // Pfad A: stabile Topologie über fin.edges[0..2]
    if (Array.isArray(fin.edges) && fin.edges.length === 3) {
      const cands = fin.edges.map((s) => resolveEdgeRef(s, shapeEdges, topo, itemId, isLeaf));
      if (cands.every((arr) => arr.length > 0)) {
        outer: for (const e0 of cands[0]) {
          for (const pt of edgeEnds(e0)) {
            const e1 = cands[1].find((x) => !x.isSame(e0) && edgeEnds(x).some((q) => dist3(q, pt) < 1e-2));
            const e2 = cands[2].find((x) => !x.isSame(e0) && (!e1 || !x.isSame(e1)) && edgeEnds(x).some((q) => dist3(q, pt) < 1e-2));
            if (e1 && e2) { V = pt; orderedEdges = [e0, e1, e2]; break outer; }
          }
        }
      }
    }

    // Pfad B: Fallback über gespeicherte Ecke fin.v
    if (!V && Array.isArray(fin.v) && fin.v.length === 3) {
      const vTol = Math.max(0.2, 0.01 * maxDim);
      let bestDist = Infinity, bestPt = null;
      for (const e of shapeEdges) {
        try {
          for (const pt of edgeEnds(e)) {
            const dd = dist3(pt, fin.v);
            if (dd < vTol && dd < bestDist) { bestDist = dd; bestPt = pt; }
          }
        } catch (_) {}
      }
      if (bestPt) {
        const inc = shapeEdges.filter((e) => {
          try { return edgeEnds(e).some((q) => dist3(q, bestPt) < 1e-2); } catch (_) { return false; }
        });
        if (inc.length < 3) {
          freeEdges();
          errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'edge', message: 'Die gewählte Ecke der Ecken-Fase gibt es nicht mehr.' });
          return { shape, topo };
        }
        const dirOf = (e) => {
          const [ea, eb] = edgeEnds(e);
          const other = dist3(ea, bestPt) < dist3(eb, bestPt) ? eb : ea;
          return norm(sub(other, bestPt));
        };
        if (inc.length === 3) {
          V = bestPt;
          if (Array.isArray(fin.edges) && fin.edges.length === 3 && fin.edges.every((s) => s && Array.isArray(s.dir))) {
            const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
            const dirs = inc.map(dirOf);
            let bestP = perms[0], bestScore = -Infinity;
            for (const pm of perms) {
              const sc = dot(dirs[pm[0]], fin.edges[0].dir) + dot(dirs[pm[1]], fin.edges[1].dir) + dot(dirs[pm[2]], fin.edges[2].dir);
              if (sc > bestScore) { bestScore = sc; bestP = pm; }
            }
            orderedEdges = bestP.map((i) => inc[i]);
          } else {
            const domKey = (d) => {
              const ax = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
              const m = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
              return [m, d[0], d[1], d[2]];
            };
            orderedEdges = inc.slice().sort((a, c) => cmpSortKey(domKey(dirOf(a)), domKey(dirOf(c))));
          }
        } else if (Array.isArray(fin.edges) && fin.edges.length === 3 && fin.edges.every((s) => s && Array.isArray(s.dir))) {
          const picked = [];
          for (const s of fin.edges) {
            let bestE = null, bestDot = -Infinity;
            for (const e of inc) {
              if (picked.includes(e)) continue;
              const dp = dot(dirOf(e), s.dir);
              if (dp > bestDot) { bestDot = dp; bestE = e; }
            }
            if (bestE && bestDot > 0.7) picked.push(bestE);
          }
          if (picked.length === 3) { V = bestPt; orderedEdges = picked; }
        }
        if (!V) {
          freeEdges();
          errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die Ecken-Fase funktioniert nur an einer Ecke mit drei Kanten.' });
          return { shape, topo };
        }
      }
    }

    if (!V || !orderedEdges || orderedEdges.length !== 3) {
      freeEdges();
      errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'edge', message: 'Die gewählte Ecke der Ecken-Fase gibt es nicht mehr.' });
      return { shape, topo };
    }

    const ds = [d1, d2, d3];
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const ek = orderedEdges[k], dk = ds[k];
      let L = 0; try { L = ek.length; } catch (_) {}
      if (!(L > 1e-4) || dk >= L - 1e-4) {
        const max = Math.floor(Math.max(0, L - 0.05) * 10) / 10;
        freeEdges();
        errors.push({ itemId, finishId: fin.id, code: 'toobig', max, message: `Ein Abstand der Ecken-Fase ist zu groß für die Kante (Kantenlänge: ${String(Math.round(L * 10) / 10).replace('.', ',')} mm).` });
        return { shape, topo };
      }
      const [ea, eb] = edgeEnds(ek);
      const fromStart = dist3(ea, V) < dist3(eb, V);
      if (ek.geomType === 'LINE') {
        const other = fromStart ? eb : ea;
        pts.push(add(V, mul(norm(sub(other, V)), dk)));
      } else {
        const t = fromStart ? dk / L : 1 - dk / L;
        pts.push(vec(ek.pointAt(Math.max(0, Math.min(1, t)))));
      }
    }
    freeEdges();

    let [Q1, Q2, Q3] = pts;
    let N = cross(sub(Q2, Q1), sub(Q3, Q1));
    const nLen = len(N);
    if (!(nLen > 1e-6)) {
      errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die drei Kanten dieser Ecke liegen in einer Ebene.' });
      return { shape, topo };
    }
    if (dot(sub(V, Q1), N) < 0) {
      [Q2, Q3] = [Q3, Q2];
      N = mul(N, -1);
    }
    if (dot(sub(V, Q1), norm(N)) <= 1e-5) {
      errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die Ecken-Fase lässt sich an dieser Ecke nicht schneiden.' });
      return { shape, topo };
    }

    const M = [(Q1[0] + Q2[0] + Q3[0]) / 3, (Q1[1] + Q2[1] + Q3[1]) / 3, (Q1[2] + Q2[2] + Q3[2]) / 3];
    const dil = (p) => add(M, mul(sub(p, M), 2));
    const V2 = dil(V), A = dil(Q1), B = dil(Q2), C = dil(Q3);
    const triFace = (p, q, r) => {
      const wb = new oc.BRepBuilderAPI_MakeWire();
      const e1 = R.makeLine(p, q), e2 = R.makeLine(q, r), e3 = R.makeLine(r, p);
      wb.Add(e1.wrapped); wb.Add(e2.wrapped); wb.Add(e3.wrapped);
      wb.Build();
      const w = wb.Wire();
      const fb = new oc.BRepBuilderAPI_MakeFace(w, true);
      const fc = fb.Face();
      wb.delete(); w.delete(); fb.delete();
      e1.delete(); e2.delete(); e3.delete();
      return fc;
    };

    let sew = null, sh = null, ms = null, solid = null, sfs = null, cut = null, res = null, chk = null;
    const tf = [];
    try {
      sew = new oc.BRepBuilderAPI_Sewing(1e-6);
      tf.push(triFace(A, B, C), triFace(A, C, V2), triFace(C, B, V2), triFace(B, A, V2));
      for (const f of tf) sew.Add(f);
      sew.Perform();
      sh = oc.TopoDS.Shell(sew.SewedShape());
      ms = new oc.BRepBuilderAPI_MakeSolid(sh);
      solid = ms.Solid();
      sfs = new oc.ShapeFix_Solid(solid);
      sfs.Perform();
      const fixedSolid = sfs.Solid();
      cut = new oc.BRepAlgoAPI_Cut(shape.wrapped, fixedSolid);
      cut.Build();
      safeDelete(fixedSolid);
      res = R.cast(cut.Shape());
      chk = new oc.BRepCheck_Analyzer(res.wrapped);
      const valid = !!(res && R.isShape3D(res) && chk.IsValid());
      if (!valid) {
        safeDelete(res);
        errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die Ecken-Fase ließ sich an dieser Ecke nicht bauen.' });
        return { shape, topo };
      }
      const volBefore = R.measureVolume(shape), volAfter = R.measureVolume(res);
      if (!(volBefore - volAfter > 1e-4)) {
        safeDelete(res);
        errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die Ecken-Fase funktioniert nur an einer äußeren Ecke.' });
        return { shape, topo };
      }
      const outTopo = propagateHistory(cut, [{ topo, selfId: itemId }], res, 'Cc:' + (fin.id || 'c'));
      return { shape: res, topo: outTopo };
    } catch (_) {
      safeDelete(res);
      errors.push({ itemId, finishId: fin.id, code: 'chamfer', message: 'Die Ecken-Fase ließ sich an dieser Ecke nicht bauen.' });
      return { shape, topo };
    } finally {
      for (const f of tf) safeDelete(f);
      safeDelete(chk); safeDelete(cut); safeDelete(sfs); safeDelete(solid); safeDelete(ms); safeDelete(sh); safeDelete(sew);
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
      if (fin.type === 'fullFillet') {
        const res = applyFullFillet(curShape, fin, errors, itemId, curTopo, isLeaf);
        if (res.shape !== curShape) {
          if (curShape !== shape) safeDelete(curShape);
          if (ownsTopo) freeTopoMap(curTopo);
          curShape = res.shape; curTopo = res.topo; ownsTopo = true;
        }
        continue;
      }
      if (fin.type === 'cornerChamfer') {
        const res = applyCornerChamfer(curShape, fin, errors, itemId, curTopo, isLeaf);
        if (res.shape !== curShape) {
          if (curShape !== shape) safeDelete(curShape);
          if (ownsTopo) freeTopoMap(curTopo);
          curShape = res.shape; curTopo = res.topo; ownsTopo = true;
        }
        continue;
      }
      if (fin.type === 'faceFillet') {
        const res = applyFaceFillet(curShape, fin, errors, itemId, curTopo, isLeaf);
        if (res.shape !== curShape) {
          if (curShape !== shape) safeDelete(curShape);
          if (ownsTopo) freeTopoMap(curTopo);
          curShape = res.shape; curTopo = res.topo; ownsTopo = true;
        }
        continue;
      }
      if (fin.type === 'partingDraft') {
        const res = applyPartingDraft(curShape, fin, errors, itemId, curTopo, isLeaf);
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
        if (err && err.code === 'g2_unsupported') {
          errors.push({ itemId, finishId: fin.id, code: 'fillet', message: err.message });
          for (const e of shapeEdges) safeDelete(e);
          continue;
        }
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

  // Entformungsschräge ab einer Trennlinie nach oben und unten (KP-42)
  function applyPartingDraft(shape, fin, errors, itemId, topo = null, isLeaf = false) {
    const sign = fin.flip ? -1 : 1;
    const angUp = num(fin.r, 3) * sign;
    const angDown = (fin.sym === false ? num(fin.r2, num(fin.r, 3)) : num(fin.r, 3)) * sign;
    if ((!(Math.abs(angUp) > 1e-6) && !(Math.abs(angDown) > 1e-6)) || Math.abs(angUp) >= 45 || Math.abs(angDown) >= 45) {
      errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge muss zwischen 0 und 45° liegen.' });
      return { shape, topo };
    }
    const b = bboxOf(shape);
    const axIdx = fin.axis === 'x' ? 0 : fin.axis === 'y' ? 1 : 2;
    let D = axIdx === 0 ? [1, 0, 0] : axIdx === 1 ? [0, 1, 0] : [0, 0, 1];
    let orig = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];

    if (fin.mode === 'datum') {
      if (fin.missingDatum || !fin.plane || !Array.isArray(fin.plane.o) || !Array.isArray(fin.plane.n)) {
        errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Bezugsebene für die Trennlinie gibt es nicht mehr.' });
        return { shape, topo };
      }
      const nLen = len(fin.plane.n);
      if (!(nLen > 1e-6)) {
        errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Bezugsebene für die Trennlinie ist ungültig.' });
        return { shape, topo };
      }
      orig = fin.plane.o.map(Number);
      D = norm(fin.plane.n.map(Number));
    } else if (fin.mode === 'edge') {
      const sig = Array.isArray(fin.edges) ? fin.edges[0] : null;
      const shapeEdges = [];
      try { for (const e of shape.edges) shapeEdges.push(e); } catch (_) {}
      const hits = sig ? resolveEdgeRef(sig, shapeEdges, topo, itemId, isLeaf) : [];
      if (!hits.length) {
        for (const e of shapeEdges) safeDelete(e);
        errors.push({ itemId, finishId: fin.id, code: 'edges', refType: 'edge', missing: [0], message: 'Die gewählte Trennlinien-Kante gibt es nicht mehr.' });
        return { shape, topo };
      }
      try { orig = vec(hits[0].pointAt(0.5)); } catch (_) {}
      for (const e of shapeEdges) safeDelete(e);
    } else if (fin.mode === 'offset') {
      orig[axIdx] = num(fin.pos, orig[axIdx]);
    }

    let minP = Infinity, maxP = -Infinity;
    for (const ix of [b[0], b[3]]) for (const iy of [b[1], b[4]]) for (const iz of [b[2], b[5]]) {
      const pr = dot([ix, iy, iz], D);
      if (pr < minP) minP = pr;
      if (pr > maxP) maxP = pr;
    }
    const origP = dot(orig, D);
    if (!(origP > minP + 1e-3 && origP < maxP - 1e-3)) {
      errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Trennlinie schneidet den Körper nicht.' });
      return { shape, topo };
    }

    const span = 20 + Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const draftSideFaces = (inShape, inTopo, signDir, angDeg, plnObj, dirObj, tag) => {
      if (!(Math.abs(angDeg) > 1e-6)) return { shape: inShape, topo: inTopo, n: 0, own: false };
      const bld = new oc.BRepOffsetAPI_DraftAngle(inShape.wrapped);
      let n = 0;
      const faces = [];
      try {
        for (const f of inShape.faces) faces.push(f);
        for (const f of faces) {
          let nv;
          try { nv = vec(f.normalAt()); } catch (_) { continue; }
          const nl = len(nv);
          if (!(nl > 1e-9)) continue;
          nv = mul(nv, 1 / nl);
          if (Math.abs(dot(nv, D)) < 0.02) {
            const s = dot(sub(vec(f.center), orig), D);
            if (signDir > 0 ? s > 1e-4 : s < -1e-4) {
              bld.Add(f.wrapped, dirObj, (angDeg * Math.PI) / 180, plnObj, true);
              n++;
            }
          }
        }
        if (!n) return { shape: inShape, topo: inTopo, n: 0, own: false };
        bld.Build();
        if (!bld.IsDone || (typeof bld.IsDone === 'function' && !bld.IsDone())) throw new Error('draft');
        const out = R.cast(bld.Shape());
        if (!out || !R.isShape3D(out)) { safeDelete(out); throw new Error('draft'); }
        const outTopo = propagateHistory(bld, [{ topo: inTopo, selfId: itemId }], out, tag);
        return { shape: out, topo: outTopo, n, own: true };
      } finally {
        for (const f of faces) safeDelete(f);
        safeDelete(bld);
      }
    };

    // Primärweg: Seitenflächen an der Schnittkurve mit Splitter teilen, dann oben und unten separat neigen
    const p0 = R.asPnt(orig), dUp = R.asDir(D), dDn = R.asDir(mul(D, -1));
    const plnUp = new oc.gp_Pln(p0, dUp), plnDn = new oc.gp_Pln(p0, dDn);
    const freePlns = () => { try { plnUp.delete(); plnDn.delete(); dUp.delete(); dDn.delete(); p0.delete(); } catch (_) {} };
    let plnFace = null, sec = null, secSh = null, args = null, tools = null, spl = null;
    let splitSh = null, splitTopo = null, curSh = null, curTopo = null, ownCur = false, chk = null;
    try {
      plnFace = new oc.BRepBuilderAPI_MakeFace(plnUp, -span, span, -span, span).Face();
      sec = new oc.BRepAlgoAPI_Section(shape.wrapped, plnFace, false);
      sec.Build();
      secSh = sec.Shape();
      args = new oc.NCollection_List_TopoDS_Shape(); args.Append(shape.wrapped);
      tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(secSh);
      spl = new oc.BRepAlgoAPI_Splitter();
      spl.SetArguments(args); spl.SetTools(tools); spl.Build();
      splitSh = R.cast(spl.Shape());
      if (splitSh && R.isShape3D(splitSh)) {
        splitTopo = propagateHistory(spl, [{ topo, selfId: itemId }], splitSh, 'Psp:' + (fin.id || 'd'));
        let totalDrafted = 0;
        const r1 = draftSideFaces(splitSh, splitTopo, 1, angUp, plnUp, dUp, 'Pdu:' + (fin.id || 'd'));
        curSh = r1.shape; curTopo = r1.topo; ownCur = r1.own; totalDrafted += r1.n;
        const r2 = draftSideFaces(curSh, curTopo, -1, angDown, plnDn, dDn, 'Pdd:' + (fin.id || 'd'));
        if (r2.own) {
          if (ownCur) { safeDelete(curSh); freeTopoMap(curTopo); }
          curSh = r2.shape; curTopo = r2.topo; ownCur = true;
        }
        totalDrafted += r2.n;
        if (totalDrafted > 0 && curSh && R.isShape3D(curSh)) {
          chk = new oc.BRepCheck_Analyzer(curSh.wrapped);
          if (chk.IsValid()) {
            if (!ownCur) {
              const resSh = curSh; curSh = null;
              const resTopo = splitTopo; splitTopo = null;
              splitSh = null;
              freePlns();
              return { shape: resSh, topo: resTopo };
            }
            const resSh = curSh; curSh = null;
            const resTopo = curTopo; curTopo = null;
            freePlns();
            return { shape: resSh, topo: resTopo };
          }
        }
      }
    } catch (_) {
    } finally {
      if (ownCur) { safeDelete(curSh); freeTopoMap(curTopo); }
      safeDelete(splitSh);
      if (splitTopo) freeTopoMap(splitTopo);
      safeDelete(chk); safeDelete(spl); safeDelete(tools); safeDelete(args);
      safeDelete(secSh); safeDelete(sec); safeDelete(plnFace);
    }

    // Fallback-Weg: Halbraum-Schnitt je Seite + DraftAngle + Fuse + UnifySameDomain
    let topBox = null, botBox = null, topHalf = null, botHalf = null;
    let topDraft = null, botDraft = null, fused = null, usd = null, res = null, chk2 = null;
    try {
      const ref = Math.abs(D[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const ux = norm(cross(ref, D)), vy = norm(cross(D, ux));
      const frameM = [ux[0], ux[1], ux[2], 0, vy[0], vy[1], vy[2], 0, D[0], D[1], D[2], 0, orig[0], orig[1], orig[2], 1];
      const rawTop = R.makeBox([-span, -span, 0], [span, span, span]);
      const rawBot = R.makeBox([-span, -span, -span], [span, span, 0]);
      topBox = applyMatrix(rawTop, frameM); safeDelete(rawTop);
      botBox = applyMatrix(rawBot, frameM); safeDelete(rawBot);
      topHalf = shape.intersect(topBox);
      botHalf = shape.intersect(botBox);
      const rT = draftSideFaces(topHalf, null, 1, angUp, plnUp, dUp, 'Pft');
      topDraft = rT.shape;
      const rB = draftSideFaces(botHalf, null, -1, angDown, plnDn, dDn, 'Pfb');
      botDraft = rB.shape;
      if ((rT.n + rB.n) > 0) {
        fused = topDraft.fuse(botDraft);
        usd = new oc.ShapeUpgrade_UnifySameDomain(fused.wrapped, true, true, false);
        usd.Build();
        res = R.cast(usd.Shape());
        chk2 = new oc.BRepCheck_Analyzer(res.wrapped);
        if (res && R.isShape3D(res) && chk2.IsValid()) {
          const outTopo = ensureTopoComplete(res, createTopoMap(), 'Pdr:' + (fin.id || 'd'));
          const outRes = res; res = null;
          return { shape: outRes, topo: outTopo };
        }
      }
    } catch (_) {
    } finally {
      safeDelete(chk2); safeDelete(res); safeDelete(usd); safeDelete(fused);
      if (topDraft && topDraft !== topHalf) safeDelete(topDraft);
      if (botDraft && botDraft !== botHalf) safeDelete(botDraft);
      safeDelete(topHalf); safeDelete(botHalf); safeDelete(topBox); safeDelete(botBox);
      freePlns();
    }

    errors.push({ itemId, finishId: fin.id, code: 'draft', message: 'Die Schräge an der Trennlinie lässt sich an diesem Körper nicht bauen – versuch einen kleineren Winkel oder zuerst ohne Rundungen.' });
    return { shape, topo };
  }

  // ---------- Muster, Spiegeln mit Kopie, Teilen ----------
  function patternShape(base, p) {
    const skipSet = new Set(Array.isArray(p.skip) ? p.skip.map((x) => Math.round(Number(x))) : []);
    const scaleStep = num(p.scaleStep, 0), scaleUnit = p.scaleUnit === 'mm' ? 'mm' : 'pct';
    const distStep = num(p.distStep, 0), distUnit = p.distUnit === 'mm' ? 'mm' : 'pct';
    const hasScale = Math.abs(scaleStep) > 1e-9;
    let baseCenter = [0, 0, 0], baseRef = 10;
    if (hasScale) {
      const bb = bboxOf(base);
      baseCenter = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
      baseRef = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], 1e-3);
    }
    const scaledCopy = (stepIdx, isOrig) => {
      const s = hasScale ? patternScaleFactor(stepIdx, scaleStep, scaleUnit, baseRef) : 1;
      if (isOrig && Math.abs(s - 1) < 1e-9) return base;
      let c = base.clone();
      if (Math.abs(s - 1) > 1e-9) {
        const sc = c.scale(s, baseCenter);
        if (sc !== c) safeDelete(c);
        c = sc;
      }
      return c;
    };
    const copies = [];
    if (p.pt === 'rect') {
      const nx = Math.max(1, Math.min(60, Math.round(num(p.nx, 1)))), ny = Math.max(1, Math.min(60, Math.round(num(p.ny, 1))));
      const dx = num(p.dx, 10), dy = num(p.dy, 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        if (skipSet.has(idx)) continue;
        const ox = progressiveOffset(dx, i, distStep, distUnit), oy = progressiveOffset(dy, j, distStep, distUnit);
        let c = scaledCopy(i + j, idx === 0);
        if (Math.hypot(ox, oy) > 1e-9) {
          const mv = c.translate([ox, oy, 0]);
          if (mv !== c && c !== base) safeDelete(c);
          c = mv;
        }
        copies.push(c);
      }
    } else if (p.pt === 'circ') {
      const n = Math.max(1, Math.min(120, Math.round(num(p.n, 4)))), ang = num(p.ang, 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      // Drehachse: senkrecht (Standard), quer, längs – oder eine im Bild gewählte Achse (Kante, Welle, Loch)
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const cc = picked ? p.ao.map(Number) : [num(p.cx, 0), num(p.cy, 0), num(p.cz, 0)];
      for (let k = 0; k < n; k++) {
        if (skipSet.has(k)) continue;
        const angK = progressiveOffset(step, k, distStep, distUnit);
        let c = scaledCopy(k, k === 0);
        if (k > 0 && Math.abs(angK) > 1e-9) {
          const rt = c.rotate(angK, cc, ax);
          if (rt !== c && c !== base) safeDelete(c);
          c = rt;
        }
        copies.push(c);
      }
    } else if (p.pt === 'path' && Array.isArray(p.places)) {
      // Muster entlang Kurve: Lage und Drehung je Kopie kommen fertig aus dem Modell
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      const lim = Math.min(p.places.length, 200);
      for (let k = 0; k < lim; k++) {
        if (skipSet.has(k)) continue;
        let c = scaledCopy(k, k === 0);
        if (k > 0) {
          const q = p.places[k];
          if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) {
            const rt = c.rotate(Number(q.a), p0, ax);
            if (rt !== c && c !== base) safeDelete(c);
            c = rt;
          }
          const d = (q.d || [0, 0, 0]).map(Number);
          if (Math.hypot(d[0], d[1], d[2]) > 1e-9) {
            const mv = c.translate(d);
            if (mv !== c && c !== base) safeDelete(c);
            c = mv;
          }
        }
        copies.push(c);
      }
    } else if ((p.pt === 'points' || p.pt === 'table') && Array.isArray(p.places)) {
      const ax = (p.n || [0, 0, 1]).map(Number), p0 = (p.p0 || [0, 0, 0]).map(Number);
      const lim = Math.min(p.places.length, 200);
      for (let k = 0; k < lim; k++) {
        if (skipSet.has(k)) continue;
        const q = p.places[k];
        let c = base.clone();
        if (Math.abs(Number(q.a) || 0) > 1e-9) c = c.rotate(Number(q.a), p0, ax);
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
  function makeLargePlaneFace(o, n, b) {
    const nn = norm(n);
    const ref = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(ref, nn)), v = cross(nn, u);
    const bc = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const ctr = sub(bc, mul(nn, dot(sub(bc, o), nn)));
    const diag = Math.max(10, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
    const R0 = diag * 2;
    const pts = [
      add(ctr, add(mul(u, -R0), mul(v, -R0))),
      add(ctr, add(mul(u, R0), mul(v, -R0))),
      add(ctr, add(mul(u, R0), mul(v, R0))),
      add(ctr, add(mul(u, -R0), mul(v, R0))),
    ];
    const gpO = new oc.gp_Pnt(o[0], o[1], o[2]), gpD = new oc.gp_Dir(nn[0], nn[1], nn[2]);
    const gpPln = new oc.gp_Pln(gpO, gpD);
    const eList = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i], q = pts[(i + 1) % 4];
      const p0 = new oc.gp_Pnt(a[0], a[1], a[2]), p1 = new oc.gp_Pnt(q[0], q[1], q[2]);
      const me = new oc.BRepBuilderAPI_MakeEdge(p0, p1);
      eList.push(me.Edge());
      me.delete(); p0.delete(); p1.delete();
    }
    const w = makeWireFromEdges(eList);
    const mf = new oc.BRepBuilderAPI_MakeFace(gpPln, w, true);
    const face = mf.Face();
    mf.delete(); gpPln.delete(); gpO.delete(); gpD.delete();
    return face;
  }
  function runSplitter(shape, toolWraps, classifyFn, sepDir, keep, gap, errMsg) {
    const args = new oc.NCollection_List_TopoDS_Shape();
    const tools = new oc.NCollection_List_TopoDS_Shape();
    const spl = new oc.BRepAlgoAPI_Splitter();
    let res = null;
    const entries = [];
    try {
      args.Append(shape.wrapped);
      for (const tw of toolWraps) tools.Append(tw);
      spl.SetArguments(args);
      spl.SetTools(tools);
      spl.Build();
      if (spl.HasErrors()) { const e = new Error(errMsg); e.code = 'split'; throw e; }
      res = R.cast(spl.Shape());
      const sols = res ? res.solids : [];
      if (!sols || sols.length < 2) {
        if (sols) for (const s of sols) safeDelete(s);
        const e = new Error(errMsg); e.code = 'split'; throw e;
      }
      for (let i = 0; i < sols.length; i++) {
        const sol = sols[i];
        let vol = 0;
        try { vol = Math.abs(R.measureVolume(sol)); } catch (_) {}
        entries.push({ sol, c: shapeCenterOfMass(sol), vol, idx: i });
      }
      let posList = [], negList = [];
      for (let i = 0; i < entries.length; i++) {
        const isPos = classifyFn ? classifyFn(entries[i].sol, entries[i].c, i, entries) : null;
        if (isPos === true) posList.push(entries[i]);
        else if (isPos === false) negList.push(entries[i]);
      }
      if (!posList.length || !negList.length) {
        const dAxis = sepDir && len(sepDir) > 1e-6 ? norm(sepDir) : [0, 0, 1];
        const sorted = entries.slice().sort((a, b) => {
          const da = dot(a.c, dAxis) - dot(b.c, dAxis);
          if (Math.abs(da) > 1e-4) return b.c ? -da : 0;
          return a.vol - b.vol;
        });
        posList = [sorted[0]];
        negList = sorted.slice(1);
      }
      const meanPt = (arr) => {
        const s = [0, 0, 0];
        for (const x of arr) { s[0] += x.c[0]; s[1] += x.c[1]; s[2] += x.c[2]; }
        return [s[0] / arr.length, s[1] / arr.length, s[2] / arr.length];
      };
      const diffDir = sub(meanPt(posList), meanPt(negList));
      let dir = sepDir && len(sepDir) > 1e-6 ? norm(sepDir) : (len(diffDir) > 1e-6 ? norm(diffDir) : [0, 0, 1]);
      if (len(diffDir) > 1e-6 && dot(diffDir, dir) < 0) dir = mul(dir, -1);
      const choose = keep === 'positive' ? posList : keep === 'negative' ? negList : null;
      const keptOut = [];
      const pushList = (list, sign) => {
        const sh = gap > 0 ? mul(dir, sign * gap / 2) : null;
        for (const e of list) {
          keptOut.push(sh ? e.sol.translate(sh) : e.sol.clone());
        }
      };
      if (choose) {
        pushList(choose, keep === 'positive' ? 1 : -1);
      } else {
        pushList(posList, 1);
        pushList(negList, -1);
      }
      if (!keptOut.length) { const e = new Error(errMsg); e.code = 'split'; throw e; }
      safeDelete(shape);
      return keptOut.length === 1 ? keptOut[0] : R.makeCompound(keptOut);
    } finally {
      for (const e of entries) safeDelete(e.sol);
      safeDelete(res);
      try { spl.delete(); } catch (_) {}
      try { args.delete(); } catch (_) {}
      try { tools.delete(); } catch (_) {}
    }
  }
  function extendOpenChain2D(segs, uMin, uMax, vMin, vMax, ext) {
    if (!Array.isArray(segs) || !segs.length) return segs;
    const first = segs[0], last = segs[segs.length - 1];
    const A = first.a, B = last.b;
    if (!A || !B || Math.hypot(A[0] - B[0], A[1] - B[1]) < 1e-4) return segs;
    const norm2 = (x, y) => { const l = Math.hypot(x, y); return l > 1e-9 ? [x / l, y / l] : null; };
    const endTangent = (s, atStart) => {
      if (!s) return null;
      if (s.t === 'arc' && s.a && s.m && s.b) {
        const ax = s.a[0], ay = s.a[1], mx = s.m[0], my = s.m[1], bx = s.b[0], by = s.b[1];
        const A1 = 2 * (mx - ax), B1 = 2 * (my - ay), C1 = mx * mx - ax * ax + my * my - ay * ay;
        const A2 = 2 * (bx - mx), B2 = 2 * (by - my), C2 = bx * bx - mx * mx + by * by - my * my;
        const det = A1 * B2 - A2 * B1;
        if (Math.abs(det) > 1e-8) {
          const cx = (C1 * B2 - C2 * B1) / det, cy = (A1 * C2 - A2 * C1) / det;
          const pt = atStart ? s.a : s.b;
          const t = norm2(-(pt[1] - cy), pt[0] - cx);
          if (t) {
            const toM = [mx - pt[0], my - pt[1]];
            return t[0] * toM[0] + t[1] * toM[1] > 0 ? [-t[0], -t[1]] : t;
          }
        }
        const pt = atStart ? s.a : s.b;
        return norm2(pt[0] - mx, pt[1] - my);
      }
      if (s.t === 'bez' && s.a && s.c1 && s.c2 && s.b) {
        return atStart ? norm2(s.a[0] - s.c1[0], s.a[1] - s.c1[1]) : norm2(s.b[0] - s.c2[0], s.b[1] - s.c2[1]);
      }
      if (s.a && s.b) return atStart ? norm2(s.a[0] - s.b[0], s.a[1] - s.b[1]) : norm2(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      return null;
    };
    const inBox = (pt) => pt[0] >= uMin - 2 && pt[0] <= uMax + 2 && pt[1] >= vMin - 2 && pt[1] <= vMax + 2;
    const out = segs.slice();
    const tA = endTangent(first, true), tB = endTangent(last, false);
    if (tA && inBox(A)) out.unshift({ t: 'line', a: [A[0] + tA[0] * ext, A[1] + tA[1] * ext], b: A.slice() });
    if (tB && inBox(B)) out.push({ t: 'line', a: B.slice(), b: [B[0] + tB[0] * ext, B[1] + tB[1] * ext] });
    return out;
  }
  function splitBodyWithSketch(shape, p) {
    const chains = Array.isArray(p.chains) ? p.chains : [];
    const regions = Array.isArray(p.regions) ? p.regions : [];
    if (!chains.length && !regions.length) {
      const e = new Error('Die Schnitt-Skizze enthält keine Kurve – zeichne eine Linie, einen Bogen oder Spline.');
      e.code = 'split';
      throw e;
    }
    const M = planeMap(p.sketchPlane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] });
    const b = bboxOf(shape);
    const diag = Math.max(1, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, wMin = Infinity, wMax = -Infinity;
    for (const q of cornersOf(b)) {
      const d = sub(q, M.o);
      const u = dot(d, M.x), v = dot(d, M.y), w = dot(d, M.n);
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      if (w < wMin) wMin = w; if (w > wMax) wMax = w;
    }
    const pad = Math.max(2, diag * 0.25);
    const t0 = Math.min(0, wMin) - pad, t1 = Math.max(0, wMax) + pad;
    const span = t1 - t0;
    const wires = [], sheets = [], cleanup = [];
    const vecArg = new oc.gp_Vec(M.n[0] * span, M.n[1] * span, M.n[2] * span);
    cleanup.push(vecArg);
    let sepDir = M.y, refPt = M.o;
    let firstChainA = null, firstChainB = null;
    try {
      for (const ch of chains) {
        if (!ch || !Array.isArray(ch.segs) || !ch.segs.length) continue;
        if (!firstChainA) { firstChainA = ch.segs[0].a; firstChainB = ch.segs[ch.segs.length - 1].b; }
        const extSegs = extendOpenChain2D(ch.segs, uMin, uMax, vMin, vMax, diag);
        const eds = segEdges(extSegs, M);
        try {
          if (eds.length) wires.push(R.assembleWire(eds));
        } finally {
          for (const e of eds) safeDelete(e);
        }
      }
      for (const rg of regions) {
        if (rg.outer) wires.push(loopWire(rg.outer, M, true));
        for (const hLoop of rg.holes || []) wires.push(loopWire(hLoop, M, true));
      }
      if (!wires.length) {
        const e = new Error('Die Schnitt-Skizze ließ sich nicht in eine Kurve umwandeln.');
        e.code = 'split';
        throw e;
      }
      for (const w of wires) {
        let wCur = w, shifted = null;
        if (Math.abs(t0) > 1e-7) { shifted = w.translate(mul(M.n, t0)); wCur = shifted; }
        const pr = new oc.BRepPrimAPI_MakePrism(wCur.wrapped, vecArg, false, true);
        try {
          pr.Build();
          const sh = pr.Shape();
          sheets.push(sh);
          cleanup.push(sh);
        } finally {
          try { pr.delete(); } catch (_) {}
          safeDelete(shifted);
        }
      }
      if (firstChainA && firstChainB) {
        const pA = M.P(firstChainA), pB = M.P(firstChainB);
        const chord = sub(pB, pA);
        if (len(chord) > 1e-5) {
          sepDir = norm(cross(M.n, chord));
          refPt = mul(add(pA, pB), 0.5);
        }
      }
      const keep = p.keep || 'both', gap = Math.max(0, num(p.gap, 0));
      return runSplitter(
        shape,
        sheets,
        (_, c) => dot(sub(c, refPt), sepDir) >= 0,
        sepDir,
        keep,
        gap,
        'Die Schnitt-Skizze trifft den Körper nicht vollständig.'
      );
    } finally {
      for (const w of wires) safeDelete(w);
      for (const c of cleanup) try { if (c && c.delete) c.delete(); } catch (_) {}
    }
  }
  function splitBodyWithFace(shape, p, W, ctx) {
    if (p.missingFace) { const e = new Error(p.missingFace); e.code = 'split'; throw e; }
    const b = bboxOf(shape);
    const keep = p.keep || 'both', gap = Math.max(0, num(p.gap, 0));
    const splitByPlane = (o, n) => {
      const nn = norm(n);
      const face = makeLargePlaneFace(o, nn, b);
      try {
        return runSplitter(shape, [face], (_, c) => dot(sub(c, o), nn) >= 0, nn, keep, gap, 'Die Schnittfläche trifft den Körper nicht.');
      } finally {
        try { face.delete(); } catch (_) {}
      }
    };
    const ref = p.faceRef;
    if (ref && ref.id) {
      let tid = ref.id;
      while (tid && ctx && ctx.consumed && ctx.consumed.has(tid)) tid = ctx.consumed.get(tid);
      const pool = (ctx && ctx.pool) || [];
      const hit = pool.find((x) => x.id === tid || (x.ids && (x.ids.has(ref.id) || x.ids.has(tid))));
      if (hit && hit.localShape) {
        const toolInv = matInvRigid(hit.m);
        const spec = Array.isArray(ref.wc) && Array.isArray(ref.wn)
          ? { t: ref.t, c: transformPoint(toolInv, ref.wc), n: transformDir(toolInv, ref.wn) }
          : ref;
        const matched = matchFace(hit.localShape, spec);
        if (matched) {
          const relM = matMul(matInvRigid(W || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), hit.m);
          const fLocal = applyMatrix(matched, relM);
          safeDelete(matched);
          try {
            if (fLocal.geomType === 'PLANE') {
              return splitByPlane(vec(fLocal.center), vec(fLocal.normalAt()));
            }
            const fc = vec(fLocal.center), fn = norm(vec(fLocal.normalAt()));
            try {
              return runSplitter(shape, [fLocal.wrapped], (_, c) => dot(sub(c, fc), fn) >= 0, fn, keep, gap, 'Die gewählte Fläche trifft den Körper nicht vollständig.');
            } catch (err) {
              // Bei zu kurzer gekrümmter Fläche versuchen, über die zugrundeliegende Fläche zu teilen
              let extFace = null;
              try {
                const fw = oc.TopoDS.Face(fLocal.wrapped);
                const surf = oc.BRep_Tool.Surface(fw);
                const mf = new oc.BRepBuilderAPI_MakeFace(surf, 1e-6);
                if (mf.IsDone()) extFace = mf.Face();
                mf.delete();
              } catch (_) {}
              if (extFace) {
                try {
                  return runSplitter(shape, [extFace], (_, c) => dot(sub(c, fc), fn) >= 0, fn, keep, gap, 'Die gewählte Fläche trifft den Körper nicht vollständig.');
                } finally {
                  try { extFace.delete(); } catch (_) {}
                }
              }
              throw err;
            }
          } finally {
            safeDelete(fLocal);
          }
        }
      }
      if (p.facePlane && Array.isArray(p.facePlane.o) && Array.isArray(p.facePlane.n)) {
        return splitByPlane(p.facePlane.o, p.facePlane.n);
      }
      const e = new Error('Die gewählte Schnittfläche ist ausgeblendet oder fehlt.');
      e.code = 'split';
      throw e;
    }
    if (p.facePlane && Array.isArray(p.facePlane.o) && Array.isArray(p.facePlane.n)) {
      return splitByPlane(p.facePlane.o, p.facePlane.n);
    }
    const e = new Error('Keine Schnittfläche gewählt.');
    e.code = 'split';
    throw e;
  }
  function splitBody(shape, p, W = null, ctx = null) {
    if (p.plane === 'SKETCH') return splitBodyWithSketch(shape, p);
    if (p.plane === 'FACE') return splitBodyWithFace(shape, p, W, ctx);
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
    return keyOf({ k: it.kind, p, f: it.finishes || null, mir: it.mir || null, c: it.children ? it.children.filter((c) => !c.hidden).map((c) => (it.p && it.p.subdoc ? [c.id, defKey(c), c.role, c.m, c.op || null] : [c.id, defKey(c), c.role, c.m])) : null });
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
  function dynamicDepKey(it, ctx) {
    if (!ctx) return '';
    if (isDynamicSplit(it)) {
      const ref = it.p.faceRef;
      let tid = ref.id;
      while (tid && ctx.consumed && ctx.consumed.has(tid)) tid = ctx.consumed.get(tid);
      const pool = ctx.pool || [];
      const hit = pool.find((x) => x.id === tid || (x.ids && (x.ids.has(ref.id) || x.ids.has(tid))));
      return hit
        ? keyOf(['splitFaceTool', hit.id, hit.key, hit.m.map((v) => Math.round(v * 1e6) / 1e6)])
        : keyOf(['splitFaceToolMissing', tid]);
    }
    if (it.kind === 'loft' && hasLoftContinuity(it.p)) {
      return ctx.poolKey || '';
    }
    if (it.kind === 'extrude' && it.p && it.p.extent === 'toFace') {
      const tf = it.p.toFace;
      if (tf && tf.datumId) return 'datum';
      if (tf && tf.id) {
        let tid = tf.id;
        while (tid && ctx.consumed && ctx.consumed.has(tid)) tid = ctx.consumed.get(tid);
        const pool = ctx.pool || [];
        const hit = pool.find((x) => x.id === tid || (x.ids && (x.ids.has(tf.id) || x.ids.has(tid))));
        return hit
          ? keyOf(['toFace', hit.id, hit.key, hit.m.map((v) => Math.round(v * 1e6) / 1e6)])
          : keyOf(['toFaceMissing', tid]);
      }
    }
    return ctx.poolKey || '';
  }
  function evalItem(it, errors, parentWorldM = null, ctx = null, track = null) {
    if (it.kind === 'transform' || it.kind === 'scale' || it.kind === 'deform' || it.kind === 'thicken' || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'mountPattern' || it.kind === 'web' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'wrap' || it.kind === 'deleteBody' || it.kind === 'sketch3d' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut' || (it.kind === 'sweep' && it.p && it.p.wrapId)) return { shape: null, key: defKey(it), topo: null };
    const dyn = hasDynamicExtent(it);
    const W = dyn ? (parentWorldM ? matMul(parentWorldM, it.m) : it.m) : null;
    const key = dyn
      ? keyOf([defKey(it), W.map((v) => Math.round(v * 1e6) / 1e6), dynamicDepKey(it, ctx)])
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
    if (track) track.rebuilt.add(it.id);
    const e0 = errors.length;
    let shape = null, topo = null, ownsTopo = false, resolvedInfo = null, baseBox = null;
    try {
      if (it.kind === 'group' && it.p && it.p.subdoc) {
        const kids = (it.children || []).filter((c) => !c.hidden);
        if (!kids.length) {
          shape = null;
        } else {
          const subErrors = [];
          const { evald: subEvald, consumed: subConsumed, resolved: subResolved } = evalSceneCore({ items: kids }, subErrors, null, null, true);
          for (const se of subErrors) errors.push({ ...se, itemId: it.id });
          if (subResolved && ctx && ctx.resolved) {
            const subRes = {};
            for (const k of Object.keys(subResolved)) subRes[k] = subResolved[k];
            if (Object.keys(subRes).length) resolvedInfo = subRes;
          }
          const subHoles = subEvald.filter((e) => !subConsumed.has(e.it.id) && e.it.role === 'hole' && e.shape);
          const solidsOut = [];
          for (const e of subEvald) {
            if (subConsumed.has(e.it.id) || e.it.role === 'hole' || !e.shape) continue;
            let curShape = e.shape, curTopo = e.topo || null, ownsCur = false;
            const cutters = subHoles.filter((h) => h.it.id !== e.it.id && bboxHit(h.wb, e.wb));
            if (cutters.length) {
              const inv = matInvRigid(e.it.m);
              const rel = cutters.map((h) => matMul(inv, h.it.m));
              const moved = [];
              try {
                for (let ci = 0; ci < cutters.length; ci++) {
                  const h = cutters[ci];
                  const tr = applyMatrixWithTopo(h.shape, rel[ci], h.topo || null, h.it.id);
                  moved.push({ shape: tr.shape, topo: tr.topo, selfId: h.it.id });
                }
                const tool = fuseAllWithTopo(moved, true, 'SHC');
                const br = boolWithTopo('cut', curShape, curTopo, e.it.id, tool.shape, tool.topo, null, 'SHCut');
                safeDelete(tool.shape); freeTopoMap(tool.topo);
                curShape = br.shape; curTopo = br.topo; ownsCur = true;
              } catch (_) {
                for (const mv of moved) { safeDelete(mv.shape); freeTopoMap(mv.topo); }
                errors.push({ itemId: it.id, code: 'cut', message: 'Ein Loch konnte nicht abgezogen werden.' });
              }
            }
            const tr = applyMatrixWithTopo(curShape, e.it.m, curTopo, e.it.id);
            if (ownsCur) { safeDelete(curShape); freeTopoMap(curTopo); }
            solidsOut.push({ shape: tr.shape, topo: tr.topo, selfId: e.it.id });
          }
          if (solidsOut.length === 1) {
            shape = solidsOut[0].shape; topo = solidsOut[0].topo; ownsTopo = true;
          } else if (solidsOut.length > 1) {
            shape = R.makeCompound(solidsOut.map((x) => x.shape));
            for (const x of solidsOut) freeTopoMap(x.topo);
            topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
          }
        }
      } else if (it.kind === 'group') {
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
          const r = evalItem(cEval, errors, W, ctx, null);
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
        if (shape && op === 'split') { const curW = W || (parentWorldM ? matMul(parentWorldM, it.m) : it.m); shape = splitBody(shape, it.p, curW, ctx); if (ownsTopo) freeTopoMap(topo); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true; }
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
        if (hasLoftContinuity(it.p)) {
          const res = buildLoftWithContinuity(it, W || it.m, ctx);
          shape = res.shape; topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
          resolvedInfo = res.resolved || null;
          if (ctx && ctx.resolved && resolvedInfo) ctx.resolved[it.id] = resolvedInfo;
        } else {
          shape = buildLoft(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
        }
      } else if (it.kind === 'sweep') {
        shape = buildSweep(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
      } else if (it.kind === 'helix') {
        shape = buildHelix(it.p); topo = ensureTopoComplete(shape, createTopoMap(), '$self'); ownsTopo = true;
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
        try { info.r = to.MinorRadius(); } catch (_) {}
        try { info.majorR = to.MajorRadius(); } catch (_) {}
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

  // ---------- Lüftungsgitter, Kühlrippen (KP-26) und Steg-Netz (KP-27) ----------
  function planarFaceFrame(face) {
    const nv = face.normalAt();
    const N = norm([nv.x, nv.y, nv.z]);
    const O = vec(face.center);
    const X = Math.abs(N[2]) > 0.9 ? [1, 0, 0] : norm(cross([0, 0, 1], N));
    const Y = cross(N, X);
    return {
      o: O, x: X, y: Y, n: N,
      to2D: (p) => { const d = sub(p, O); return [dot(d, X), dot(d, Y)]; },
      P: (uv) => [O[0] + X[0] * uv[0] + Y[0] * uv[1], O[1] + X[1] * uv[0] + Y[1] * uv[1], O[2] + X[2] * uv[0] + Y[2] * uv[1]],
    };
  }
  function polySignedArea2D(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  function sampleFaceLoops2D(face, F) {
    const rawLoops = faceLoops(face);
    const d2d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cleanPoly = (pts) => {
      const out = [];
      for (const p of pts) if (!out.length || d2d(out[out.length - 1], p) > 1e-5) out.push(p);
      while (out.length > 1 && d2d(out[0], out[out.length - 1]) < 1e-5) out.pop();
      return out;
    };
    const polys = [];
    for (const segs of rawLoops) {
      if (!segs || !segs.length) continue;
      if (segs.length === 1 && segs[0].t === 'CIRCLE' && segs[0].c && segs[0].r > 1e-6 && len(sub(segs[0].a, segs[0].b)) < 1e-4) {
        const c2 = F.to2D(segs[0].c), r = segs[0].r, pts = [];
        for (let i = 0; i < 48; i++) { const t = (i * Math.PI * 2) / 48; pts.push([c2[0] + Math.cos(t) * r, c2[1] + Math.sin(t) * r]); }
        polys.push(pts);
        continue;
      }
      const chains = segs.map((s) => {
        if (s.t === 'LINE') return [F.to2D(s.a), F.to2D(s.b)];
        if (s.t === 'CIRCLE') return arcSample(F.to2D(s.a), F.to2D(s.m), F.to2D(s.b), 24);
        return s.pts ? s.pts.map(F.to2D) : [F.to2D(s.a), F.to2D(s.b)];
      }).filter((c) => c.length >= 2);
      if (!chains.length) continue;
      const used = new Array(chains.length).fill(false);
      const pts = chains[0].slice();
      used[0] = true;
      for (let step = 1; step < chains.length; step++) {
        const tail = pts[pts.length - 1];
        let best = -1, rev = false, bd = Infinity;
        for (let i = 0; i < chains.length; i++) {
          if (used[i]) continue;
          const da = d2d(tail, chains[i][0]), db = d2d(tail, chains[i][chains[i].length - 1]);
          if (da < bd) { bd = da; best = i; rev = false; }
          if (db < bd) { bd = db; best = i; rev = true; }
        }
        if (best < 0) break;
        used[best] = true;
        const addC = rev ? chains[best].slice().reverse() : chains[best];
        for (let k = bd < 1e-2 ? 1 : 0; k < addC.length; k++) pts.push(addC[k]);
      }
      const cp = cleanPoly(pts);
      if (cp.length >= 3) polys.push(cp);
    }
    if (!polys.length) return { outer: [], holes: [] };
    const outer = polySignedArea2D(polys[0]) < 0 ? polys[0].slice().reverse() : polys[0];
    const holes = polys.slice(1).map((h) => (polySignedArea2D(h) > 0 ? h.slice().reverse() : h));
    return { outer, holes };
  }
  function rotatePoly2D(poly, cosA, sinA) {
    return poly.map(([x, y]) => [x * cosA + y * sinA, -x * sinA + y * cosA]);
  }
  function scanlineIntervals2D(poly, v) {
    const xs = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) {
        const t = (v - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 1e-6) out.push([xs[i], xs[i + 1]]);
    }
    return out;
  }
  function subtractInterval2D(ivs, cutLo, cutHi) {
    if (!(cutHi > cutLo + 1e-9)) return ivs;
    const out = [];
    for (const [lo, hi] of ivs) {
      if (cutHi <= lo || cutLo >= hi) { out.push([lo, hi]); continue; }
      if (cutLo > lo + 1e-7) out.push([lo, cutLo]);
      if (cutHi < hi - 1e-7) out.push([cutHi, hi]);
    }
    return out;
  }
  function intersectIntervals2D(a, b) {
    const out = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
      if (hi - lo > 1e-6) out.push([lo, hi]);
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return out;
  }
  function capsuleSlice2D(A, B, v, d) {
    const minY = Math.min(A[1], B[1]) - d, maxY = Math.max(A[1], B[1]) + d;
    if (v < minY - 1e-9 || v > maxY + 1e-9) return null;
    let lo = Infinity, hi = -Infinity;
    for (const Q of [A, B]) {
      const dy = v - Q[1];
      if (Math.abs(dy) <= d + 1e-9) {
        const dx = Math.sqrt(Math.max(0, d * d - dy * dy));
        lo = Math.min(lo, Q[0] - dx);
        hi = Math.max(hi, Q[0] + dx);
      }
    }
    const vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy);
    if (L > 1e-9) {
      const nx = (-vy / L) * d, ny = (vx / L) * d;
      const quad = [[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny], [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]];
      for (let i = 0; i < 4; i++) {
        const p = quad[i], q = quad[(i + 1) % 4];
        if ((p[1] <= v && q[1] >= v) || (q[1] <= v && p[1] >= v)) {
          if (Math.abs(q[1] - p[1]) < 1e-12) {
            if (Math.abs(p[1] - v) < 1e-9) { lo = Math.min(lo, p[0], q[0]); hi = Math.max(hi, p[0], q[0]); }
          } else {
            const x = p[0] + ((v - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
            lo = Math.min(lo, x); hi = Math.max(hi, x);
          }
        }
      }
    }
    return hi > lo ? [lo, hi] : null;
  }
  function safeIntervals2D(outerPoly, holePolys, v, d) {
    let ivs = scanlineIntervals2D(outerPoly, v);
    if (!ivs.length) return [];
    for (const hp of holePolys) {
      for (const [h0, h1] of scanlineIntervals2D(hp, v)) ivs = subtractInterval2D(ivs, h0, h1);
      if (!ivs.length) return [];
    }
    if (d > 1e-6) {
      for (const poly of [outerPoly, ...holePolys]) {
        for (let i = 0; i < poly.length; i++) {
          const sl = capsuleSlice2D(poly[i], poly[(i + 1) % poly.length], v, d);
          if (sl) ivs = subtractInterval2D(ivs, sl[0], sl[1]);
          if (!ivs.length) return [];
        }
      }
    }
    return ivs.filter(([a, b]) => b - a > 1e-4);
  }
  function bandIntervals2D(outerPoly, holePolys, v, halfW, margin, roundEnds) {
    if (roundEnds) {
      return safeIntervals2D(outerPoly, holePolys, v, margin + halfW).map(([c0, c1]) => [c0 - halfW, c1 + halfW]);
    }
    const a = safeIntervals2D(outerPoly, holePolys, v - halfW, margin);
    const b = safeIntervals2D(outerPoly, holePolys, v, margin);
    const c = safeIntervals2D(outerPoly, holePolys, v + halfW, margin);
    return intersectIntervals2D(intersectIntervals2D(a, b), c);
  }
  function slotLoop2D(uA, uB, v, w, roundEnds) {
    const r = w / 2, lenU = uB - uA;
    if (roundEnds) {
      if (lenU <= w + 0.05) {
        return { circle: { c: [(uA + uB) / 2, v], r: Math.max(0.1, Math.min(r, lenU / 2)) } };
      }
      const cA = uA + r, cB = uB - r;
      return {
        segs: [
          { t: 'line', a: [cA, v - r], b: [cB, v - r] },
          { t: 'arc', a: [cB, v - r], m: [uB, v], b: [cB, v + r] },
          { t: 'line', a: [cB, v + r], b: [cA, v + r] },
          { t: 'arc', a: [cA, v + r], m: [uA, v], b: [cA, v - r] },
        ],
      };
    }
    return {
      segs: [
        { t: 'line', a: [uA, v - r], b: [uB, v - r] },
        { t: 'line', a: [uB, v - r], b: [uB, v + r] },
        { t: 'line', a: [uB, v + r], b: [uA, v + r] },
        { t: 'line', a: [uA, v + r], b: [uA, v - r] },
      ],
    };
  }
  function offsetClosed2D(segs, d) {
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
    while (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-7) pts.pop();
    if (pts.length < 3) return [];
    const m = pts.length, norms = [];
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      norms.push([-dy / L, dx / L]);
    }
    const V = [];
    for (let i = 0; i < m; i++) {
      const nA = norms[(i - 1 + m) % m], nB = norms[i];
      const bx = nA[0] + nB[0], by = nA[1] + nB[1], den = 1 + nA[0] * nB[0] + nA[1] * nB[1];
      let off;
      if (den > 0.1) off = [(bx / den) * d, (by / den) * d];
      else { const bl = Math.hypot(bx, by); off = bl > 1e-9 ? [(bx / bl) * 3 * d, (by / bl) * 3 * d] : [nA[0] * d, nA[1] * d]; }
      V.push([pts[i][0] + off[0], pts[i][1] + off[1]]);
    }
    const out = [];
    for (let i = 0; i < m; i++) out.push({ t: 'line', a: V[i], b: V[(i + 1) % m] });
    return out;
  }
  function resolvePlanarFeatureFace(baseShape, faceSpec, topo, itemId) {
    const fArr = []; try { for (const fx of baseShape.faces) fArr.push(fx); } catch (_) {}
    const b = bboxOf(baseShape), tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    const f = (faceSpec && resolveFaceRef({ ...faceSpec, tol }, fArr, topo, itemId, true)[0]) || matchFace(baseShape, faceSpec);
    return { f, fArr };
  }
  function computeRowPositions(outerRot, holesRot, halfW, margin, count, roundEnds, minLen) {
    let vMin = Infinity, vMax = -Infinity;
    for (const q of outerRot) { if (q[1] < vMin) vMin = q[1]; if (q[1] > vMax) vMax = q[1]; }
    const pad = margin + halfW + (margin < 1e-4 && !roundEnds ? 1e-4 : 0);
    const vLo = vMin + pad, vHi = vMax - pad;
    if (vHi < vLo - 1e-4) return null;
    const hasRow = (v) => bandIntervals2D(outerRot, holesRot, v, halfW, margin, roundEnds).some(([a, b]) => b - a >= minLen);
    const N = 64;
    let firstOk = null, lastOk = null;
    for (let i = 0; i <= N; i++) {
      const v = vLo + ((vHi - vLo) * i) / N;
      if (hasRow(v)) { if (firstOk == null) firstOk = i; lastOk = i; }
    }
    if (firstOk == null) return { ok: false, reason: 'none' };
    let vEffMin = vLo + ((vHi - vLo) * firstOk) / N;
    if (firstOk > 0) {
      let a = vLo + ((vHi - vLo) * (firstOk - 1)) / N, b = vEffMin;
      for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (hasRow(m)) b = m; else a = m; }
      vEffMin = b;
    }
    let vEffMax = vLo + ((vHi - vLo) * lastOk) / N;
    if (lastOk < N) {
      let a = vEffMax, b = vLo + ((vHi - vLo) * (lastOk + 1)) / N;
      for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (hasRow(m)) a = m; else b = m; }
      vEffMax = a;
    }
    const vs = [];
    if (count === 1) {
      vs.push((vEffMin + vEffMax) / 2);
    } else {
      const span = vEffMax - vEffMin;
      const step = span / (count - 1);
      if (step < halfW * 2 + 0.05) return { ok: false, reason: 'crowded', step };
      for (let i = 0; i < count; i++) vs.push(vEffMin + step * i);
    }
    const rows = [];
    for (const v of vs) {
      for (const [uA, uB] of bandIntervals2D(outerRot, holesRot, v, halfW, margin, roundEnds)) {
        if (uB - uA >= minLen) rows.push({ uA, uB, v });
      }
    }
    if (!rows.length) return { ok: false, reason: 'none' };
    return { ok: true, rows };
  }
  function probeWallDepth(baseShape, Muv, rows, sMax) {
    const outDir = mul(Muv.n, -1);
    for (const row of rows.slice(0, 3)) {
      const uMid = (row.uA + row.uB) / 2;
      let pf = null, probe = null, inter = null;
      try {
        pf = regionFace({ outer: slotLoop2D(uMid - 0.2, uMid + 0.2, row.v, 0.4, false), holes: [] }, Muv);
        const pfShifted = pf.translate(mul(Muv.n, 0.05));
        safeDelete(pf); pf = pfShifted;
        probe = R.basicFaceExtrusion(pf, new R.Vector(mul(outDir, sMax + 1.05)));
        inter = baseShape.intersect(probe);
        const segs = [];
        for (const s of extractSolids(inter)) {
          let vol = 0; try { vol = R.measureVolume(s); } catch (_) {}
          if (vol > 1e-5) {
            const sb = bboxOf(s);
            let t0 = Infinity, t1 = -Infinity;
            for (let i = 0; i < 8; i++) {
              const q = [i & 1 ? sb[3] : sb[0], i & 2 ? sb[4] : sb[1], i & 4 ? sb[5] : sb[2]];
              const d = dot(sub(q, Muv.o), outDir);
              if (d < t0) t0 = d; if (d > t1) t1 = d;
            }
            segs.push([t0, t1]);
          }
          safeDelete(s);
        }
        segs.sort((a, b) => a[0] - b[0]);
        if (segs.length) {
          const hit0 = segs.find((x) => x[0] <= 0.25 && x[1] > 0.05) || segs[0];
          const nxt = segs.find((x) => x[0] > hit0[1] + 0.05);
          if (nxt) return hit0[1] + Math.min(0.5, (nxt[0] - hit0[1]) * 0.45);
          return hit0[1] + 1.0;
        }
      } catch (_) {}
      finally { safeDelete(pf); safeDelete(probe); safeDelete(inter); }
    }
    return sMax + 1.0;
  }
  function buildVentOn(baseShape, p, topo = null, tid = null) {
    const count = Math.max(1, Math.min(60, Math.round(num(p.count, 6))));
    const slotW = num(p.slotW, 3);
    if (!(slotW >= 0.2)) throw new Error('Lüftungsgitter: Die Schlitzbreite muss mindestens 0,2 mm sein.');
    const frame = Math.max(0, num(p.frame, 4));
    const angle = num(p.angle, 0);
    const depth = Math.max(0, num(p.depth, 0));
    const roundEnds = p.roundEnds !== false;

    const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, topo, tid);
    try {
      if (!f || f.geomType !== 'PLANE') throw new Error('Lüftungsgitter: Wähle eine ebene Körperfläche.');
      const F = planarFaceFrame(f);
      const { outer, holes } = sampleFaceLoops2D(f, F);
      if (outer.length < 3) throw new Error('Lüftungsgitter: Die gewählte Fläche hat keinen gültigen Umriss.');
      const rad = (angle * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const U = add(mul(F.x, cosA), mul(F.y, sinA)), V = add(mul(F.x, -sinA), mul(F.y, cosA));
      const Muv = {
        o: F.o, x: U, y: V, n: F.n,
        P: (uv) => [F.o[0] + U[0] * uv[0] + V[0] * uv[1], F.o[1] + U[1] * uv[0] + V[1] * uv[1], F.o[2] + U[2] * uv[0] + V[2] * uv[1]],
      };
      const outerRot = rotatePoly2D(outer, cosA, sinA);
      const holesRot = holes.map((h) => rotatePoly2D(h, cosA, sinA));
      const minLen = roundEnds ? Math.max(0.2, slotW * 0.4) : Math.max(0.5, slotW * 0.5);
      const plan = computeRowPositions(outerRot, holesRot, slotW / 2, frame, count, roundEnds, minLen);
      if (!plan) throw new Error('Lüftungsgitter: Der Rahmen oder die Schlitzbreite ist für diese Fläche zu groß.');
      if (!plan.ok) {
        if (plan.reason === 'crowded') throw new Error('Lüftungsgitter: Zu viele oder zu breite Schlitze für diese Fläche – zwischen den Schlitzen muss ein Steg bleiben.');
        throw new Error('Lüftungsgitter: Auf dieser Fläche ist innerhalb des Rahmens kein Platz für Schlitze.');
      }

      const bb = bboxOf(baseShape);
      let sMax = 0;
      for (const q of cornersOf(bb)) sMax = Math.max(sMax, dot(sub(q, F.o), mul(F.n, -1)));
      const Hcut = depth > 1e-4 ? depth : probeWallDepth(baseShape, Muv, plan.rows, Math.max(1, sMax));

      const slotSolids = [];
      try {
        for (const r of plan.rows) {
          let fc = regionFace({ outer: slotLoop2D(r.uA, r.uB, r.v, slotW, roundEnds), holes: [] }, Muv);
          const fcTop = fc.translate(mul(F.n, 0.05));
          safeDelete(fc);
          const sol = R.basicFaceExtrusion(fcTop, new R.Vector(mul(F.n, -(Hcut + 0.05))));
          safeDelete(fcTop);
          slotSolids.push(sol);
        }
        const tool = slotSolids.length === 1 ? slotSolids[0] : R.makeCompound(slotSolids);
        return { tool };
      } catch (err) {
        for (const s of slotSolids) safeDelete(s);
        throw err;
      }
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
  }
  function buildFinsOn(baseShape, p, topo = null, tid = null) {
    const count = Math.max(1, Math.min(80, Math.round(num(p.count, 6))));
    const finW = num(p.finW, 1.5);
    if (!(finW >= 0.2)) throw new Error('Kühlrippen: Die Rippendicke muss mindestens 0,2 mm sein.');
    const height = num(p.height, 10);
    if (!(height >= 0.1)) throw new Error('Kühlrippen: Die Höhe muss mindestens 0,1 mm sein.');
    const margin = Math.max(0, num(p.margin, 2));
    const angle = num(p.angle, 0);
    const draft = Math.max(0, num(p.draft, 0));
    if (draft >= 45) throw new Error('Kühlrippen: Die Schräge muss kleiner als 45° sein.');
    const tanD = Math.tan((draft * Math.PI) / 180);
    const topW = finW - 2 * height * tanD;
    if (draft > 1e-5 && !(topW >= 0.1)) {
      throw new Error('Kühlrippen: Die Schräge ist für diese Rippendicke und Höhe zu groß.');
    }

    const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, topo, tid);
    try {
      if (!f || f.geomType !== 'PLANE') throw new Error('Kühlrippen: Wähle eine ebene Körperfläche.');
      const F = planarFaceFrame(f);
      const { outer, holes } = sampleFaceLoops2D(f, F);
      if (outer.length < 3) throw new Error('Kühlrippen: Die gewählte Fläche hat keinen gültigen Umriss.');
      const rad = (angle * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const U = add(mul(F.x, cosA), mul(F.y, sinA)), V = add(mul(F.x, -sinA), mul(F.y, cosA));
      const Muv = {
        o: F.o, x: U, y: V, n: F.n,
        P: (uv) => [F.o[0] + U[0] * uv[0] + V[0] * uv[1], F.o[1] + U[1] * uv[0] + V[1] * uv[1], F.o[2] + U[2] * uv[0] + V[2] * uv[1]],
      };
      const outerRot = rotatePoly2D(outer, cosA, sinA);
      const holesRot = holes.map((h) => rotatePoly2D(h, cosA, sinA));
      const plan = computeRowPositions(outerRot, holesRot, finW / 2, margin, count, false, 0.5);
      if (!plan) throw new Error('Kühlrippen: Der Randabstand oder die Rippendicke ist für diese Fläche zu groß.');
      if (!plan.ok) {
        if (plan.reason === 'crowded') throw new Error('Kühlrippen: Zu viele oder zu dicke Rippen für diese Fläche – es bleibt kein Zwischenraum.');
        throw new Error('Kühlrippen: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Rippen.');
      }

      const finSolids = [];
      try {
        for (const r of plan.rows) {
          if (draft <= 1e-5) {
            let fc = regionFace({ outer: slotLoop2D(r.uA, r.uB, r.v, finW, false), holes: [] }, Muv);
            const fcBot = fc.translate(mul(F.n, -0.05));
            safeDelete(fc);
            const sol = R.basicFaceExtrusion(fcBot, new R.Vector(mul(F.n, height + 0.05)));
            safeDelete(fcBot);
            finSolids.push(sol);
          } else {
            const deltaU = r.uB - r.uA > 2 * height * tanD + 0.2 ? height * tanD : 0;
            const w0Base = finW + 2 * 0.05 * tanD;
            const w0 = loopWire(slotLoop2D(r.uA, r.uB, r.v, w0Base, false), Muv, true).translate(mul(F.n, -0.05));
            const w1 = loopWire(slotLoop2D(r.uA + deltaU, r.uB - deltaU, r.v, topW, false), Muv, true).translate(mul(F.n, height));
            try { finSolids.push(R.loft([w0, w1], { ruled: true })); }
            finally { safeDelete(w0); safeDelete(w1); }
          }
        }
        const tool = finSolids.length === 1 ? finSolids[0] : R.makeCompound(finSolids);
        return { tool };
      } catch (err) {
        for (const s of finSolids) safeDelete(s);
        throw err;
      }
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
  }
  function buildFillPatternOn(baseShape, p, topo = null, tid = null) {
    const kind = p.kind === 'staggered' || p.kind === 'hex' ? p.kind : 'grid';
    const size = num(p.size, 5);
    if (!(size >= 0.2)) throw new Error('Füllmuster: Die Lochgröße muss mindestens 0,2 mm sein.');
    const pitch = num(p.pitch, 8);
    if (!(pitch > size + 0.05)) throw new Error('Füllmuster: Der Abstand muss größer als die Lochgröße sein, sonst überlappen sich die Löcher.');
    const margin = Math.max(0, num(p.margin, 4));
    const effMargin = Math.max(margin, 0.05);
    const angle = num(p.angle, 0);
    const depth = Math.max(0, num(p.depth, 0));
    const maxHoles = 300;

    const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, topo, tid);
    try {
      if (!f || f.geomType !== 'PLANE') throw new Error('Füllmuster: Wähle eine ebene Körperfläche.');
      const F = planarFaceFrame(f);
      const { outer, holes } = sampleFaceLoops2D(f, F);
      if (outer.length < 3) throw new Error('Füllmuster: Die gewählte Fläche hat keinen gültigen Umriss.');
      const rad = (angle * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const U = add(mul(F.x, cosA), mul(F.y, sinA)), V = add(mul(F.x, -sinA), mul(F.y, cosA));
      const Muv = {
        o: F.o, x: U, y: V, n: F.n,
        P: (uv) => [F.o[0] + U[0] * uv[0] + V[0] * uv[1], F.o[1] + U[1] * uv[0] + V[1] * uv[1], F.o[2] + U[2] * uv[0] + V[2] * uv[1]],
      };
      const outerRot = rotatePoly2D(outer, cosA, sinA);
      const holesRot = holes.map((h) => rotatePoly2D(h, cosA, sinA));
      const rings = [outerRot, ...holesRot];

      const pointInPoly2D = (pt, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      };
      const pointInRegion = (pt) => pointInPoly2D(pt, outerRot) && !holesRot.some((h) => pointInPoly2D(pt, h));
      const distPtSeg2D = (pt, a, b) => {
        const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
        if (l2 <= 1e-12) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
        const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / l2));
        return Math.hypot(pt[0] - (a[0] + t * vx), pt[1] - (a[1] + t * vy));
      };
      const distToRings = (pt) => {
        let dm = Infinity;
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) dm = Math.min(dm, distPtSeg2D(pt, ring[i], ring[(i + 1) % ring.length]));
        }
        return dm;
      };
      const segsIntersect2D = (a, b, c, d) => {
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - 1e-9 || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - 1e-9) return false;
        if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - 1e-9 || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - 1e-9) return false;
        const ccw = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        const d1 = ccw(c, d, a), d2 = ccw(c, d, b), d3 = ccw(a, b, c), d4 = ccw(a, b, d);
        if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
        const onSeg = (p, q, r) => Math.abs(ccw(p, q, r)) <= 1e-9 && r[0] >= Math.min(p[0], q[0]) - 1e-9 && r[0] <= Math.max(p[0], q[0]) + 1e-9 && r[1] >= Math.min(p[1], q[1]) - 1e-9 && r[1] <= Math.max(p[1], q[1]) + 1e-9;
        return onSeg(c, d, a) || onSeg(c, d, b) || onSeg(a, b, c) || onSeg(a, b, d);
      };
      const segSegDist2D = (a, b, c, d) => (segsIntersect2D(a, b, c, d) ? 0 : Math.min(distPtSeg2D(a, c, d), distPtSeg2D(b, c, d), distPtSeg2D(c, a, b), distPtSeg2D(d, a, b)));

      const isHex = kind === 'hex', isStag = kind === 'staggered' || isHex;
      const rIn = size / 2, rOut = isHex ? size / Math.sqrt(3) : size / 2;
      const dx = pitch, dy = isStag ? (pitch * Math.sqrt(3)) / 2 : pitch;

      const hexVerts = (c) => {
        const vs = [];
        for (let k = 0; k < 6; k++) {
          const t = Math.PI / 2 + (k * Math.PI) / 3;
          vs.push([c[0] + Math.cos(t) * rOut, c[1] + Math.sin(t) * rOut]);
        }
        return vs;
      };
      const fitsCircle = (c) => pointInRegion(c) && distToRings(c) >= rOut + effMargin - 1e-6;
      const fitsHex = (c) => {
        if (!pointInRegion(c)) return false;
        const dC = distToRings(c);
        if (dC < rIn + effMargin - 1e-6) return false;
        const verts = hexVerts(c);
        if (holesRot.some((h) => h.length && pointInPoly2D(h[0], verts))) return false;
        if (dC >= rOut + effMargin - 1e-6) return true;
        for (const v of verts) if (!pointInRegion(v)) return false;
        const pad = effMargin + 1e-4;
        const hx0 = c[0] - rIn - pad, hx1 = c[0] + rIn + pad, hy0 = c[1] - rOut - pad, hy1 = c[1] + rOut + pad;
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            if (Math.max(a[0], b[0]) < hx0 || Math.min(a[0], b[0]) > hx1 || Math.max(a[1], b[1]) < hy0 || Math.min(a[1], b[1]) > hy1) continue;
            for (let k = 0; k < 6; k++) {
              if (segSegDist2D(verts[k], verts[(k + 1) % 6], a, b) < effMargin - 1e-6) return false;
            }
          }
        }
        return true;
      };

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of outerRot) {
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
      const W = x1 - x0, H = y1 - y0, midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
      const availW = W - 2 * effMargin - 2 * rIn;
      const availH = H - 2 * effMargin - 2 * rOut;
      if (availW < -1e-6 || availH < -1e-6) {
        throw new Error('Füllmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Löcher.');
      }
      const ny = Math.floor(availH / dy + 1e-6) + 1;
      const nxMax = Math.floor(availW / dx + 1e-6) + 1;
      const centers = [];
      let truncated = false;
      if (!isStag) {
        for (let j = 0; j < ny && !truncated; j++) {
          const y = midY + (j - (ny - 1) / 2) * dy;
          for (let i = 0; i < nxMax; i++) {
            const x = midX + (i - (nxMax - 1) / 2) * dx;
            if (fitsCircle([x, y])) {
              centers.push([x, y]);
              if (centers.length >= maxHoles) { truncated = true; break; }
            }
          }
        }
      } else {
        const baseShift = nxMax % 2 === 0 ? 0.5 : 0;
        for (let j = 0; j < ny && !truncated; j++) {
          const y = midY + (j - (ny - 1) / 2) * dy;
          const shift = j % 2 === 0 ? baseShift : (baseShift ? 0 : 0.5);
          const kMin = Math.floor((x0 + effMargin + rIn - midX) / dx - shift) - 1;
          const kMax = Math.ceil((x1 - effMargin - rIn - midX) / dx - shift) + 1;
          for (let k = kMin; k <= kMax; k++) {
            const x = midX + (k + shift) * dx;
            if (x < x0 + effMargin + rIn - 1e-5 || x > x1 - effMargin - rIn + 1e-5) continue;
            const pt = [x, y];
            if (isHex ? fitsHex(pt) : fitsCircle(pt)) {
              centers.push(pt);
              if (centers.length >= maxHoles) { truncated = true; break; }
            }
          }
        }
      }
      if (!centers.length) {
        throw new Error('Füllmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Löcher.');
      }

      const bb = bboxOf(baseShape);
      let sMax = 0;
      for (const q of cornersOf(bb)) sMax = Math.max(sMax, dot(sub(q, F.o), mul(F.n, -1)));
      const Hcut = depth > 1e-4 ? depth : probeWallDepth(baseShape, Muv, centers.slice(0, 3).map((c) => ({ uA: c[0] - 0.2, uB: c[0] + 0.2, v: c[1] })), Math.max(1, sMax));

      const holeSolids = [];
      try {
        for (const c of centers) {
          let fc;
          if (!isHex) {
            fc = regionFace({ outer: { circle: { c, r: rOut } }, holes: [] }, Muv);
          } else {
            const vs = hexVerts(c);
            const segs = [];
            for (let k = 0; k < 6; k++) segs.push({ t: 'line', a: vs[k], b: vs[(k + 1) % 6] });
            fc = regionFace({ outer: { segs }, holes: [] }, Muv);
          }
          const fcTop = fc.translate(mul(F.n, 0.05));
          safeDelete(fc);
          const sol = R.basicFaceExtrusion(fcTop, new R.Vector(mul(F.n, -(Hcut + 0.05))));
          safeDelete(fcTop);
          holeSolids.push(sol);
        }
        const tool = holeSolids.length === 1 ? holeSolids[0] : R.makeCompound(holeSolids);
        return { tool, count: centers.length, kind };
      } catch (err) {
        for (const s of holeSolids) safeDelete(s);
        throw err;
      }
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
  }
  function buildMountPatternOn(baseShape, p, topo = null, tid = null) {
    const holes = Array.isArray(p.holes) ? p.holes : [];
    const holeD = num(p.holeD, 3.4);
    if (!holes.length) throw new Error('Lochbild: Mindestens ein Befestigungsloch erforderlich.');
    if (!(holeD >= 0.2 && isFinite(holeD))) throw new Error('Lochbild: Der Lochdurchmesser muss mindestens 0,2 mm sein.');
    const includeCenter = p.includeCenter !== false;
    const centerKind = p.centerKind === 'rect' ? 'rect' : p.centerKind === 'none' ? 'none' : 'circle';
    const centerD = num(p.centerD, 0);
    const cutW = num(p.cutW, 0);
    const cutH = num(p.cutH, 0);
    const u = num(p.u, 0);
    const v = num(p.v, 0);
    const angle = num(p.angle, 0);
    const depth = Math.max(0, num(p.depth, 0));

    const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, topo, tid);
    try {
      if (!f || f.geomType !== 'PLANE') throw new Error('Lochbild: Wähle eine ebene Körperfläche.');
      const F = planarFaceFrame(f);
      const centerO = add(F.o, add(mul(F.x, u), mul(F.y, v)));
      const rad = (angle * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const U = add(mul(F.x, cosA), mul(F.y, sinA)), V = add(mul(F.x, -sinA), mul(F.y, cosA));
      const Muv = {
        o: centerO, x: U, y: V, n: F.n,
        P: (uv) => [centerO[0] + U[0] * uv[0] + V[0] * uv[1], centerO[1] + U[1] * uv[0] + V[1] * uv[1], centerO[2] + U[2] * uv[0] + V[2] * uv[1]],
      };
      const bb = bboxOf(baseShape);
      let sMax = 0;
      for (const q of cornersOf(bb)) sMax = Math.max(sMax, dot(sub(q, centerO), mul(F.n, -1)));
      let Hcut;
      if (depth > 1e-4) {
        Hcut = depth;
      } else {
        const probePts = holes.slice(0, 2).concat([[0, 0]]);
        const probed = probeWallDepth(baseShape, Muv, probePts.map((pt) => ({ uA: pt[0] - 0.2, uB: pt[0] + 0.2, v: pt[1] })), Math.max(1, sMax));
        Hcut = Math.max(0.2, probed) + 0.15;
      }

      const holeR = holeD / 2;
      const holeSolids = [];
      let overlapsCenter = false;
      try {
        for (const q of holes) {
          if (!Array.isArray(q) || q.length < 2) continue;
          const hx = Number(q[0]) || 0, hy = Number(q[1]) || 0;
          holeSolids.push(R.makeCylinder(holeR, Hcut + 0.05, add(Muv.P([hx, hy]), mul(F.n, 0.05)), mul(F.n, -1)));
          if (includeCenter) {
            if (centerKind === 'circle' && centerD > 0.2) {
              if (Math.hypot(hx, hy) < holeR + centerD / 2 + 0.05) overlapsCenter = true;
            } else if (centerKind === 'rect' && cutW > 0.2 && cutH > 0.2) {
              if (Math.abs(hx) < cutW / 2 + holeR + 0.05 && Math.abs(hy) < cutH / 2 + holeR + 0.05) overlapsCenter = true;
            }
          }
        }
        let hasCenter = false;
        if (includeCenter && centerKind === 'circle' && centerD > 0.2) {
          holeSolids.push(R.makeCylinder(centerD / 2, Hcut + 0.05, add(centerO, mul(F.n, 0.05)), mul(F.n, -1)));
          hasCenter = true;
        } else if (includeCenter && centerKind === 'rect' && cutW > 0.2 && cutH > 0.2) {
          const hw = cutW / 2, hh = cutH / 2;
          const segs = [
            { t: 'line', a: [-hw, -hh], b: [hw, -hh] },
            { t: 'line', a: [hw, -hh], b: [hw, hh] },
            { t: 'line', a: [hw, hh], b: [-hw, hh] },
            { t: 'line', a: [-hw, hh], b: [-hw, -hh] },
          ];
          const fc = regionFace({ outer: { segs }, holes: [] }, Muv);
          const fcTop = fc.translate(mul(F.n, 0.05));
          safeDelete(fc);
          const sol = R.basicFaceExtrusion(fcTop, new R.Vector(mul(F.n, -(Hcut + 0.05))));
          safeDelete(fcTop);
          holeSolids.push(sol);
          hasCenter = true;
        }
        if (!holeSolids.length) throw new Error('Lochbild: Keine gültigen Löcher zum Schneiden.');
        const tool = overlapsCenter
          ? fuseAll(holeSolids, true)
          : (holeSolids.length === 1 ? holeSolids[0] : R.makeCompound(holeSolids));
        return { tool, holeCount: holes.length, hasCenter, preset: p.preset || '' };
      } catch (err) {
        if (!overlapsCenter) for (const s of holeSolids) safeDelete(s);
        throw err;
      }
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
  }
  function extendWebEndpoints2D(segs, extA, extB) {
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
    if (tStart && extA > 1e-6) {
      const aExt = [s0.a[0] + tStart[0] * extA, s0.a[1] + tStart[1] * extA];
      if (s0.t === 'line') s0.a = aExt; else out.unshift({ t: 'line', a: aExt, b: s0.a.slice() });
    }
    if (tEnd && extB > 1e-6) {
      const bExt = [s1.b[0] + tEnd[0] * extB, s1.b[1] + tEnd[1] * extB];
      if (s1.t === 'line') s1.b = bExt; else out.push({ t: 'line', a: s1.b.slice(), b: bExt });
    }
    return out;
  }
  function buildWebOn(baseShape, rel, p) {
    const paths = p.paths || [];
    if (!paths.length) throw new Error('Steg-Netz: Die Skizze enthält keine Linien oder Kurven.');
    const thickness = num(p.thickness, 2);
    if (!(thickness > 1e-4)) throw new Error('Steg-Netz: Die Dicke muss größer als 0 mm sein.');
    const draft = num(p.draft, 0);
    if (Math.abs(draft) >= 45) throw new Error('Steg-Netz: Die Schräge muss kleiner als 45° sein.');
    const depth = Math.max(0, num(p.depth, 0));
    const flip = !!p.flip;
    const extend = p.extend !== false;

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

    const tryWebDirection = (sign) => {
      const sC = dot(sub(cBase, M.o), M.n);
      const d0 = sC > 1e-4 ? M.n : mul(M.n, -1);
      const dirVec = mul(d0, sign);
      const [sMin, sMax] = projectSpan(dirVec);
      if (sMax <= 1e-4) return null;
      const H = depth > 1e-4 ? depth : Math.max(1, sMax + 5);
      const startOff = sMin < -0.1 ? -0.05 : 0;
      const Hext = H - startOff;
      const dL = thickness / 2, dR = -thickness / 2;
      const rawPieces = [], origWires = [];
      let rawWeb = null, diff = null, kept = [], outside = [];
      try {
        for (const pt of paths) {
          if (!pt || !pt.segs || !pt.segs.length) continue;
          if (pt.closed && pt.segs.length === 1 && pt.segs[0].t === 'circle') {
            const c = pt.segs[0].c, r = pt.segs[0].r;
            origWires.push(R.assembleWire([R.makeCircle(r, M.P(c), M.n)]));
            const rOut = r + thickness / 2, rIn = r - thickness / 2;
            const reg = { outer: { circle: { c, r: rOut } }, holes: rIn > 0.1 ? [{ circle: { c, r: rIn } }] : [] };
            if (Math.abs(draft) < 1e-6) {
              let fc = regionFace(reg, M);
              if (startOff) { const f2 = fc.translate(mul(dirVec, startOff)); safeDelete(fc); fc = f2; }
              rawPieces.push(R.basicFaceExtrusion(fc, new R.Vector(mul(dirVec, Hext))));
              safeDelete(fc);
            } else {
              const delta = Hext * Math.tan((draft * Math.PI) / 180);
              if (thickness + 2 * delta <= 0.05) throw new Error('Steg-Netz: Die Schräge ist für diese Dicke und Höhe zu groß.');
              let fc0 = regionFace(reg, M);
              const w0o = loopWire(reg.outer, M, true).translate(mul(dirVec, startOff));
              const w1o = loopWire({ circle: { c, r: rOut + delta } }, M, true).translate(mul(dirVec, H));
              let solOut;
              try { solOut = R.loft([w0o, w1o], { ruled: true }); } finally { safeDelete(w0o); safeDelete(w1o); safeDelete(fc0); }
              if (rIn - delta > 0.1) {
                const w0i = loopWire({ circle: { c, r: rIn } }, M, true).translate(mul(dirVec, startOff));
                const w1i = loopWire({ circle: { c, r: rIn - delta } }, M, true).translate(mul(dirVec, H));
                let solIn;
                try { solIn = R.loft([w0i, w1i], { ruled: true }); rawPieces.push(solOut.cut(solIn)); } finally { safeDelete(w0i); safeDelete(w1i); safeDelete(solIn); safeDelete(solOut); }
              } else rawPieces.push(solOut);
            }
            continue;
          }
          if (pt.closed) {
            origWires.push(R.assembleWire(segEdges(pt.segs, M)));
            const lA = offsetClosed2D(pt.segs, dL), lB = offsetClosed2D(pt.segs, dR);
            if (lA.length < 3) continue;
            const arA = Math.abs(loopArea({ segs: lA })), arB = lB.length >= 3 ? Math.abs(loopArea({ segs: lB })) : 0;
            const outerSegs = arA >= arB ? lA : lB, innerSegs = arA >= arB ? lB : lA;
            const hasHole = innerSegs.length >= 3 && Math.min(arA, arB) > 1e-2;
            const reg = { outer: { segs: outerSegs }, holes: hasHole ? [{ segs: innerSegs }] : [] };
            let fc = regionFace(reg, M);
            if (startOff) { const f2 = fc.translate(mul(dirVec, startOff)); safeDelete(fc); fc = f2; }
            rawPieces.push(R.basicFaceExtrusion(fc, new R.Vector(mul(dirVec, Hext))));
            safeDelete(fc);
            continue;
          }
          origWires.push(R.assembleWire(segEdges(pt.segs, M)));
          const eA = pt.extA ? (extend ? extLen : 0) : thickness * 0.55;
          const eB = pt.extB ? (extend ? extLen : 0) : thickness * 0.55;
          const extSegs = extendWebEndpoints2D(pt.segs, eA, eB);
          if (Math.abs(draft) < 1e-6) {
            let fc = regionFace({ outer: { segs: stripLoop2D(extSegs, dL, dR) }, holes: [] }, M);
            if (startOff) { const f2 = fc.translate(mul(dirVec, startOff)); safeDelete(fc); fc = f2; }
            rawPieces.push(R.basicFaceExtrusion(fc, new R.Vector(mul(dirVec, Hext))));
            safeDelete(fc);
          } else {
            const delta = Hext * Math.tan((draft * Math.PI) / 180);
            if (thickness + 2 * delta <= 0.05) throw new Error('Steg-Netz: Die Schräge ist für diese Dicke und Höhe zu groß.');
            const w0 = loopWire({ segs: stripLoop2D(extSegs, dL, dR) }, M, true).translate(mul(dirVec, startOff));
            const w1 = loopWire({ segs: stripLoop2D(extSegs, dL + delta, dR - delta) }, M, true).translate(mul(dirVec, H));
            try { rawPieces.push(R.loft([w0, w1], { ruled: true })); }
            finally { safeDelete(w0); safeDelete(w1); }
          }
        }
        if (!rawPieces.length) return null;
        rawWeb = rawPieces.length === 1 ? rawPieces[0] : fuseAll(rawPieces, true);
        rawPieces.length = 0;

        diff = rawWeb.cut(baseShape);
        for (const s of extractSolids(diff)) {
          let vol = 0; try { vol = R.measureVolume(s); } catch (_) { vol = 0; }
          if (!(vol > 1e-4)) { safeDelete(s); continue; }
          const sb = bboxOf(s);
          const escaped = sb[0] < bb[0] - 0.5 || sb[3] > bb[3] + 0.5 || sb[1] < bb[1] - 0.5 || sb[4] > bb[4] + 0.5 || sb[2] < bb[2] - 0.5 || sb[5] > bb[5] + 0.5;
          if (!escaped && origWires.some((w) => minDistShapes(s, w) < 0.25)) kept.push(s);
          else outside.push(s);
        }
        if (!kept.length) return null;

        let outUnion = outside.length ? fuseAll(outside, true) : null;
        outside = [];
        let trimmed = null, fused = null;
        try {
          trimmed = outUnion ? rawWeb.cut(outUnion) : rawWeb.clone();
          fused = baseShape.fuse(trimmed);
          if (extractSolids(fused).length <= baseSolidCount) return fused;
          safeDelete(fused); fused = null;
        } catch (_) { safeDelete(fused); fused = null; }
        finally { safeDelete(outUnion); safeDelete(trimmed); }

        const webPart = kept.length === 1 ? kept[0] : fuseAll(kept, true);
        kept = [];
        try {
          fused = baseShape.fuse(webPart);
          if (extractSolids(fused).length <= baseSolidCount) return fused;
          safeDelete(fused);
        } catch (_) {}
        finally { safeDelete(webPart); }
        return null;
      } finally {
        for (const p0 of rawPieces) safeDelete(p0);
        for (const w of origWires) safeDelete(w);
        for (const s of kept) safeDelete(s);
        for (const s of outside) safeDelete(s);
        safeDelete(diff); safeDelete(rawWeb);
      }
    };

    const firstSign = flip ? -1 : 1;
    let res = tryWebDirection(firstSign);
    if (!res && !flip) res = tryWebDirection(-firstSign);
    if (!res) throw new Error('Steg-Netz: Die Rippen treffen keine angrenzenden Wände des Zielkörpers. Prüfe die Skizzenebene, die Linienlage oder kehre die Richtung um.');
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
      const profAt = (inset, P, tVec, vVec, nVec) => {
        if (p.shape === 'sketch' && p.prof) {
          if (inset > 0) return null;
          const Y = cross(tVec, vVec);
          const o = [0, 1, 2].map((k) => P[k] - vVec[k] * p.prof.c[0] - Y[k] * p.prof.c[1]);
          return loopWire(p.prof.outer, planeMap({ o, x: vVec, n: tVec }), true);
        }
        if (p.shape === 'rect') {
          const w = pos(p.w, 3) / 2 - inset, h = pos(p.h, 2) / 2 - inset;
          if (w <= 0 || h <= 0) return null;
          const q = (a, b) => [0, 1, 2].map((k) => P[k] + vVec[k] * a + nVec[k] * b);
          const c = [q(-w, -h), q(w, -h), q(w, h), q(-w, h)];
          const ls = [R.makeLine(c[0], c[1]), R.makeLine(c[1], c[2]), R.makeLine(c[2], c[3]), R.makeLine(c[3], c[0])];
          try { return R.assembleWire(ls); } finally { ls.forEach(safeDelete); }
        }
        const r = pos(p.d, 2) / 2 - inset;
        if (r <= 0) return null;
        const ce = R.makeCircle(r, P, tVec);
        try { return R.assembleWire([ce]); } finally { safeDelete(ce); }
      };
      try {
        solids.push(sweepProfileAlongSpine(spine, profAt, P0, T, N, V, p));
      } catch (err) {
        solids.forEach(safeDelete);
        throw err;
      }
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
  function buildSplitFaceOn(baseShape, rel, p) {
    const regions = Array.isArray(p.regions) ? p.regions : [];
    const chains = Array.isArray(p.chains) ? p.chains : [];
    if (!regions.length && !chains.length) {
      throw new Error('Fläche teilen: Die Skizze enthält keine Kurve und keinen Umriss.');
    }
    const side = p.side === 'back' || p.side === 'both' ? p.side : 'front';

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
    if (!f) throw new Error('Fläche teilen: Die gewählte Fläche gibt es nicht mehr.');

    const pl = p.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const M = planeMap({
      o: transformPoint(rel, pl.o || [0, 0, 0]),
      x: norm(transformDir(rel, pl.x || [1, 0, 0])),
      n: norm(transformDir(rel, pl.n || [0, 0, 1])),
    });

    const wires = [];
    const secShapes = [];
    const cleanup = [];
    try {
      for (const rg of regions) {
        if (rg.outer) wires.push(loopWire(rg.outer, M, true));
        for (const h of rg.holes || []) wires.push(loopWire(h, M, true));
      }
      for (const ch of chains) {
        if (!ch || !Array.isArray(ch.segs) || !ch.segs.length) continue;
        const eds = segEdges(ch.segs, M);
        try {
          if (eds.length) wires.push(R.assembleWire(eds));
        } finally {
          for (const e of eds) safeDelete(e);
        }
      }
      if (!wires.length) throw new Error('Fläche teilen: Aus der Skizze ließ sich keine Kurve erzeugen.');

      let refCenter;
      if (regions.length) {
        refCenter = sampleRegionsLocal(regions, M).center;
      } else {
        let sx = 0, sy = 0, cnt = 0;
        const addUV = (uv) => { if (uv) { sx += uv[0]; sy += uv[1]; cnt++; } };
        for (const ch of chains) for (const s of ch.segs || []) { addUV(s.a); addUV(s.m); addUV(s.b); }
        refCenter = cnt ? M.P([sx / cnt, sy / cnt]) : M.o.slice();
      }

      const fInfo = faceInfo(f);
      const fBbox = bboxOf(f);
      const diagF = Math.hypot(fBbox[3] - fBbox[0], fBbox[4] - fBbox[1], fBbox[5] - fBbox[2]);

      let projDir, t0, t1;
      const setSpan = (centerPt, rVal) => {
        const dC = dot(sub(centerPt, M.o), M.n);
        const toward = Math.abs(dC) > 1e-3 ? (dC > 0 ? 1 : -1) : 1;
        projDir = mul(M.n, toward);
        const D = dot(sub(centerPt, M.o), projDir);
        if (side === 'both') {
          t0 = Math.min(0, D - rVal) - 2;
          t1 = Math.max(0, D + rVal) + 2;
        } else if (side === 'back') {
          t0 = D;
          t1 = D + rVal + 2;
        } else {
          t0 = Math.min(0, D - rVal) - 2;
          t1 = D;
        }
      };

      if ((f.geomType === 'CYLINDRE' || f.geomType === 'CONE') && Array.isArray(fInfo.axis)) {
        const axO = fInfo.axis.slice(0, 3), axD = norm(fInfo.axis.slice(3, 6));
        const closestOnAxis = add(axO, mul(axD, dot(sub(refCenter, axO), axD)));
        setSpan(closestOnAxis, fInfo.r || diagF / 2);
      } else if (f.geomType === 'SPHERE' && Array.isArray(fInfo.sc)) {
        setSpan(fInfo.sc, fInfo.r || diagF / 2);
      } else {
        const fc = fInfo.c || [(fBbox[0] + fBbox[3]) / 2, (fBbox[1] + fBbox[4]) / 2, (fBbox[2] + fBbox[5]) / 2];
        const dF = dot(sub(fc, refCenter), M.n);
        const baseSign = Math.abs(dF) > 1e-4 ? (dF > 0 ? 1 : -1) : (fInfo.n && dot(M.n, fInfo.n) >= 0 ? -1 : 1);
        projDir = mul(M.n, side === 'back' ? -baseSign : baseSign);
        let uMin = Infinity, uMax = -Infinity;
        for (const q of cornersOf(fBbox)) {
          const u = dot(sub(q, M.o), projDir);
          if (u < uMin) uMin = u;
          if (u > uMax) uMax = u;
        }
        t0 = Math.min(0, uMin) - 2;
        t1 = Math.max(0, uMax) + 2;
      }

      const span = t1 - t0;
      if (!(span > 1e-4)) throw new Error('Fläche teilen: Ungültiger Projektionsbereich.');
      const vecArg = new oc.gp_Vec(projDir[0] * span, projDir[1] * span, projDir[2] * span);
      cleanup.push(vecArg);

      for (const w of wires) {
        let wCur = w, shifted = null;
        if (Math.abs(t0) > 1e-7) {
          shifted = w.translate(mul(projDir, t0));
          wCur = shifted;
        }
        const pr = new oc.BRepPrimAPI_MakePrism(wCur.wrapped, vecArg, false, true);
        let sheet = null, sec = null, exp = null;
        try {
          pr.Build();
          sheet = pr.Shape();
          sec = new oc.BRepAlgoAPI_Section(f.wrapped, sheet, false);
          sec.ComputePCurveOn1(true);
          sec.Approximation(true);
          sec.Build();
          if (!sec.HasErrors()) {
            const ss = sec.Shape();
            exp = new oc.TopExp_Explorer(ss, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
            if (exp.More()) {
              secShapes.push(ss);
              cleanup.push(ss);
            } else {
              safeDelete(ss);
            }
          }
        } finally {
          if (exp) try { exp.delete(); } catch (_) {}
          if (sec) try { sec.delete(); } catch (_) {}
          safeDelete(sheet);
          try { pr.delete(); } catch (_) {}
          safeDelete(shifted);
        }
      }

      if (!secShapes.length) {
        throw new Error('Fläche teilen: Die projizierte Kurve trifft die gewählte Fläche nicht – prüf Lage, Größe oder Seite.');
      }

      const args = new oc.NCollection_List_TopoDS_Shape();
      const tools = new oc.NCollection_List_TopoDS_Shape();
      const spl = new oc.BRepAlgoAPI_Splitter();
      try {
        args.Append(baseShape.wrapped);
        for (const ss of secShapes) tools.Append(ss);
        spl.SetArguments(args);
        spl.SetTools(tools);
        spl.Build();
        if (spl.HasErrors()) throw new Error('Fläche teilen: Die Fläche ließ sich an dieser Kurve nicht teilen.');
        const out = R.cast(spl.Shape());
        if (!out || !R.isShape3D(out)) { safeDelete(out); throw new Error('Fläche teilen: Das Ergebnis ist kein gültiger Körper.'); }
        return out;
      } finally {
        try { spl.delete(); } catch (_) {}
        try { args.delete(); } catch (_) {}
        try { tools.delete(); } catch (_) {}
      }
    } finally {
      for (const w of wires) safeDelete(w);
      for (const c of cleanup) try { if (c && c.delete) c.delete(); } catch (_) {}
    }
  }
  function buildDomeOn(baseShape, p, topo = null, tid = null) {
    const height = num(p.height, 5);
    if (!(height >= 0.1 && isFinite(height))) throw new Error('Kuppel: Die Höhe muss mindestens 0,1 mm sein.');
    const flip = !!p.flip;
    const isSpherical = p.shape === 'spherical';

    const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, topo, tid);
    const cleanup = [];
    let ts = null, sol = null;
    try {
      if (!f || f.geomType !== 'PLANE') throw new Error('Kuppel: Wähle eine ebene Körperfläche.');
      const nv = f.normalAt();
      const nl = Math.hypot(nv.x, nv.y, nv.z) || 1;
      const nDir = [nv.x / nl, nv.y / nl, nv.z / nl];
      const dir = flip ? mul(nDir, -1) : nDir;

      const F = planarFaceFrame(f);
      const { outer } = sampleFaceLoops2D(f, F);
      let c3 = vec(f.center);
      if (outer.length >= 3) {
        let a2 = 0, cx = 0, cy = 0;
        for (let i = 0; i < outer.length; i++) {
          const p0 = outer[i], p1 = outer[(i + 1) % outer.length];
          const cr = p0[0] * p1[1] - p1[0] * p0[1];
          a2 += cr;
          cx += (p0[0] + p1[0]) * cr;
          cy += (p0[1] + p1[1]) * cr;
        }
        if (Math.abs(a2) > 1e-6) c3 = F.P([cx / (3 * a2), cy / (3 * a2)]);
      }

      const ow = oc.BRepTools.OuterWire(f.wrapped);
      cleanup.push(ow);
      ts = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-4);
      const steps = [0, 0.22, 0.45, 0.68, 0.86];
      const gpC = new oc.gp_Pnt(c3[0], c3[1], c3[2]);
      cleanup.push(gpC);
      for (const frac of steps) {
        if (frac === 0) {
          ts.AddWire(ow);
          continue;
        }
        const th = (frac * Math.PI) / 2;
        const sc = isSpherical ? (1 - frac) : Math.cos(th);
        const dz = isSpherical ? (height * (1 - sc * sc)) : (height * Math.sin(th));
        const t1 = new oc.gp_Trsf();
        t1.SetScale(gpC, sc);
        const gpV = new oc.gp_Vec(dir[0] * dz, dir[1] * dz, dir[2] * dz);
        const t2 = new oc.gp_Trsf();
        t2.SetTranslation(gpV);
        t2.Multiply(t1);
        const tr = new oc.BRepBuilderAPI_Transform(ow, t2, true, false);
        const w = oc.TopoDS.Wire(tr.ModifiedShape(ow));
        ts.AddWire(w);
        cleanup.push(t1, gpV, t2, tr, w);
      }
      const gpA = new oc.gp_Pnt(c3[0] + dir[0] * height, c3[1] + dir[1] * height, c3[2] + dir[2] * height);
      const mv = new oc.BRepBuilderAPI_MakeVertex(gpA);
      const apex = mv.Vertex();
      ts.AddVertex(apex);
      cleanup.push(gpA, mv, apex);
      ts.Build();
      sol = R.cast(ts.Shape());
      if (R.measureVolume(sol) < 0) {
        const rev = R.cast(sol.wrapped.Reversed());
        safeDelete(sol);
        sol = rev;
      }
      if (flip) {
        const ext = R.basicFaceExtrusion(f, new R.Vector(mul(nDir, 0.05)));
        const fused = sol.fuse(ext);
        safeDelete(ext);
        safeDelete(sol);
        sol = fused;
      }
      const out = sol;
      sol = null;
      return { tool: out, op: flip ? 'cut' : 'fuse' };
    } finally {
      safeDelete(sol);
      if (ts && ts.delete) try { ts.delete(); } catch (_) {}
      for (const c of cleanup) try { if (c && c.delete) c.delete(); } catch (_) {}
      for (const fx of fArr) safeDelete(fx);
    }
  }

  function basisFromNormal(fn) {
    const n = norm(fn);
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const bx = norm(cross(ref, n));
    const by = norm(cross(n, bx));
    return { bx, by, fn: n };
  }

  function buildBossOn(baseShape, baseTopo, baseId, stepId, p) {
    const outerD = num(p.outerD, 8);
    const holeD = num(p.holeD, 3);
    const height = num(p.height, 10);
    const holeDepth = num(p.holeDepth, 0);
    const ribs = Math.max(0, Math.min(6, Math.round(num(p.ribs, 4))));
    const ribT = num(p.ribT, 1.5);
    const ribL = num(p.ribL, 4);
    const ribH = num(p.ribH, 0);
    const ribAngle = num(p.ribAngle, 0);
    const u = num(p.u, 0);
    const v = num(p.v, 0);

    if (!(outerD > 0.2 && isFinite(outerD))) throw new Error('Schraubdom: Der Außendurchmesser muss größer als 0,2 mm sein.');
    if (!(height > 0.1 && isFinite(height))) throw new Error('Schraubdom: Die Höhe muss größer als 0,1 mm sein.');
    if (!(holeD >= 0 && isFinite(holeD))) throw new Error('Schraubdom: Der Lochdurchmesser darf nicht negativ sein.');
    if (holeD > 0 && holeD >= outerD - 0.1) throw new Error('Schraubdom: Der Lochdurchmesser muss kleiner als der Außendurchmesser sein.');

    const fArr = [];
    try { for (const fx of baseShape.faces) fArr.push(fx); } catch (_) {}
    let fc = null, fn = null;
    try {
      const b = bboxOf(baseShape);
      const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      const f = resolveFaceRef({ ...p.face, tol }, fArr, baseTopo, baseId, true)[0] || matchFace(baseShape, p.face);
      if (!f || f.geomType !== 'PLANE') {
        const err = new Error('Schraubdom: Die gewählte ebene Fläche gibt es nicht mehr.');
        err.code = 'edges';
        throw err;
      }
      fc = vec(f.center);
      fn = norm(vec(f.normalAt()));
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }

    const { bx, by } = basisFromNormal(fn);
    const baseO = add(fc, add(mul(bx, u), mul(by, v)));
    const emb = 0.05;
    const outerR = outerD / 2;

    let bossSolid = null, bossTopo = null, fused = null, holeCyl = null;
    try {
      bossSolid = R.makeCylinder(outerR, height + emb, add(baseO, mul(fn, -emb)), fn);
      if (ribs > 0) {
        const rT = Math.min(outerD * 0.85, Math.max(0.2, ribT));
        const rL = Math.max(0.2, ribL);
        const rH = ribH > 0 ? Math.min(height, Math.max(0.2, ribH)) : Math.max(0.4, height * 0.75);
        const rIn = Math.min(outerR * 0.6, Math.max(0.1, outerR - 0.15));
        const rOut = outerR + rL;
        for (let k = 0; k < ribs; k++) {
          const ang = (ribAngle * Math.PI) / 180 + (2 * Math.PI * k) / ribs;
          const rad = add(mul(bx, Math.cos(ang)), mul(by, Math.sin(ang)));
          const tan = add(mul(bx, -Math.sin(ang)), mul(by, Math.cos(ang)));
          const ptAt = (rVal, zVal) => add(add(baseO, mul(rad, rVal)), add(mul(fn, zVal), mul(tan, -rT / 2)));
          const pts3 = [ptAt(rIn, 0), ptAt(rOut, 0), ptAt(outerR, rH), ptAt(rIn, rH)];
          let rFace = null, rSolid = null;
          try {
            rFace = polygonFace(pts3);
            rSolid = R.basicFaceExtrusion(rFace, new R.Vector(mul(tan, rT)));
            if (R.measureVolume(rSolid) < 0) rSolid = R.cast(rSolid.wrapped.Reversed());
            const nxt = bossSolid.fuse(rSolid);
            safeDelete(bossSolid);
            bossSolid = nxt;
          } finally {
            safeDelete(rFace);
            safeDelete(rSolid);
          }
        }
      }
      bossTopo = ensureTopoComplete(bossSolid, createTopoMap(), stepId);
      fused = boolWithTopo('fuse', baseShape, baseTopo, baseId, bossSolid, bossTopo, stepId, 'Boss:' + stepId);
      if (!(holeD > 0)) {
        const out = { shape: fused.shape, topo: fused.topo };
        fused = null;
        return out;
      }
      const hDepth = holeDepth > 0 ? Math.min(height + emb, holeDepth) : height;
      const zBot = height - hDepth;
      holeCyl = R.makeCylinder(holeD / 2, hDepth + 0.5, add(baseO, mul(fn, zBot)), fn);
      const cutRes = boolWithTopo('cut', fused.shape, fused.topo, baseId, holeCyl, null, stepId, 'BossH:' + stepId);
      return { shape: cutRes.shape, topo: cutRes.topo };
    } finally {
      safeDelete(bossSolid);
      freeTopoMap(bossTopo);
      if (fused) { safeDelete(fused.shape); freeTopoMap(fused.topo); }
      safeDelete(holeCyl);
    }
  }

  function buildLipGrooveOn(srcA, srcB, relAB, stepId, p) {
    const side = p.side === 'outer' ? 'outer' : 'inner';
    const height = num(p.height, 2);
    const width = num(p.width, 1.2);
    const clearance = Math.max(0, num(p.clearance, 0.2));
    if (!(height > 0.05 && isFinite(height))) throw new Error('Lippe und Nut: Die Höhe muss größer als 0,05 mm sein.');
    if (!(width > 0.05 && isFinite(width))) throw new Error('Lippe und Nut: Die Breite muss größer als 0,05 mm sein.');
    if (!(clearance >= 0 && isFinite(clearance))) throw new Error('Lippe und Nut: Das Spiel darf nicht negativ sein.');

    const makePlanarFaceFromWire = (gpPln, wire) => {
      const mf = new oc.BRepBuilderAPI_MakeFace(gpPln, wire, true);
      let nf = mf.Face(); mf.delete();
      const sff = new oc.ShapeFix_Face(nf);
      sff.FixOrientation();
      sff.Perform();
      nf = sff.Face();
      sff.delete();
      return nf;
    };

    const wireAreaOnPlane = (gpPln, wire) => {
      let fw = null, rs = null;
      try {
        fw = makePlanarFaceFromWire(gpPln, wire);
        rs = R.cast(fw);
        return Math.abs(R.measureArea(rs));
      } catch (_) {
        return 0;
      } finally {
        if (rs) safeDelete(rs);
        else if (fw && fw.delete) try { fw.delete(); } catch (_) {}
      }
    };

    const extractWireFromOffset = (raw, gpPln) => {
      if (!raw || raw.IsNull()) return null;
      if (raw.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_WIRE) return oc.TopoDS.Wire(raw);
      const wires = [];
      const ex = new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {
        while (ex.More()) { wires.push(oc.TopoDS.Wire(ex.Current())); ex.Next(); }
      } finally { ex.delete(); }
      if (!wires.length) return null;
      if (wires.length === 1) return wires[0];
      let best = wires[0], bestA = wireAreaOnPlane(gpPln, best);
      for (let i = 1; i < wires.length; i++) {
        const a = wireAreaOnPlane(gpPln, wires[i]);
        if (a > bestA) { best = wires[i]; bestA = a; }
      }
      return best;
    };

    const offsetClosedWire = (wire, gpPln, dist, wantLarger, throwOnFail = true) => {
      if (Math.abs(dist) < 1e-6) return wire;
      const edges = collectEdges(wire);
      if (edges.length === 1) {
        let ad = null;
        try {
          ad = new oc.BRepAdaptor_Curve(edges[0]);
          if (ad.GetType() === oc.GeomAbs_CurveType.GeomAbs_Circle) {
            const per = Math.abs(ad.LastParameter() - ad.FirstParameter());
            if (Math.abs(per - 2 * Math.PI) < 0.05) {
              const gc = ad.Circle();
              const r0 = gc.Radius();
              const rNew = wantLarger ? r0 + dist : r0 - dist;
              if (rNew <= 0.05) {
                if (throwOnFail) throw new Error('Lippe und Nut: Versatz ist zu groß für diesen Kreis.');
                return null;
              }
              const loc = gc.Location(), ax = gc.Axis().Direction();
              const p0 = new oc.gp_Pnt(loc.X(), loc.Y(), loc.Z());
              const d0 = new oc.gp_Dir(ax.X(), ax.Y(), ax.Z());
              const ax2 = new oc.gp_Ax2(p0, d0);
              const nCirc = new oc.gp_Circ(ax2, rNew);
              const me = new oc.BRepBuilderAPI_MakeEdge(nCirc);
              const ne = me.Edge();
              const wb = new oc.BRepBuilderAPI_MakeWire(ne);
              const outW = wb.Wire();
              wb.delete(); me.delete(); nCirc.delete(); ax2.delete(); d0.delete(); p0.delete();
              return outW;
            }
          }
        } catch (err) {
          if (err && /Versatz ist zu groß/.test(err.message)) throw err;
        } finally {
          if (ad && ad.delete) try { ad.delete(); } catch (_) {}
        }
      }

      const area0 = wireAreaOnPlane(gpPln, wire);
      const tryOffOn = (srcW, srcPln, d, joinType) => {
        let off = null;
        try {
          off = new oc.BRepOffsetAPI_MakeOffset(srcW, joinType, false);
          off.Perform(d, 0);
          if (off.IsDone && !off.IsDone()) return null;
          const raw = off.Shape();
          return extractWireFromOffset(raw, srcPln);
        } catch (_) {
          return null;
        } finally {
          if (off && off.delete) try { off.delete(); } catch (_) {}
        }
      };

      const checkDir = (w, pln, refArea) => {
        if (!w) return false;
        const a = wireAreaOnPlane(pln, w);
        if (!(a > 1e-4)) return false;
        return wantLarger ? a > refArea + 1e-4 : a < refArea - 1e-4;
      };

      const joins = [oc.GeomAbs_JoinType.GeomAbs_Intersection, oc.GeomAbs_JoinType.GeomAbs_Arc];
      for (const jt of joins) {
        for (const sg of [1, -1]) {
          const cand = tryOffOn(wire, gpPln, sg * dist, jt);
          if (checkDir(cand, gpPln, area0)) return cand;
        }
      }

      // Fallback über XY-Ebene falls die 3D-Ebene schräg/verschoben ist
      let trToXY = null, trBack = null, xyPln = null;
      try {
        const loc = gpPln.Location(), axDir = gpPln.Axis().Direction(), xDir = gpPln.XAxis().Direction();
        const srcAx3 = new oc.gp_Ax3(loc, axDir, xDir);
        const dstAx3 = new oc.gp_Ax3();
        trToXY = new oc.gp_Trsf(); trToXY.SetDisplacement(srcAx3, dstAx3);
        trBack = new oc.gp_Trsf(); trBack.SetDisplacement(dstAx3, srcAx3);
        const bTo = new oc.BRepBuilderAPI_Transform(wire, trToXY, true, false);
        const xyW = oc.TopoDS.Wire(bTo.ModifiedShape(wire)); bTo.delete();
        const p0 = new oc.gp_Pnt(0, 0, 0), dz = new oc.gp_Dir(0, 0, 1);
        xyPln = new oc.gp_Pln(p0, dz); p0.delete(); dz.delete();
        srcAx3.delete(); dstAx3.delete();
        const areaXY = wireAreaOnPlane(xyPln, xyW);
        for (const jt of joins) {
          for (const sg of [1, -1]) {
            const candXY = tryOffOn(xyW, xyPln, sg * dist, jt);
            if (checkDir(candXY, xyPln, areaXY)) {
              const bBk = new oc.BRepBuilderAPI_Transform(candXY, trBack, true, false);
              const outW = oc.TopoDS.Wire(bBk.ModifiedShape(candXY)); bBk.delete();
              return outW;
            }
          }
        }
      } catch (_) {}
      finally {
        if (trToXY && trToXY.delete) try { trToXY.delete(); } catch (_) {}
        if (trBack && trBack.delete) try { trBack.delete(); } catch (_) {}
        if (xyPln && xyPln.delete) try { xyPln.delete(); } catch (_) {}
      }

      if (throwOnFail) throw new Error('Lippe und Nut: Der Rand ist für diese Breite zu schmal oder zu komplex.');
      return null;
    };

    const makeSolidPrismFromWire = (wire, gpPln, fn, z0, z1) => {
      const fw = makePlanarFaceFromWire(gpPln, wire);
      let f = R.cast(fw);
      if (Math.abs(z0) > 1e-9) {
        const ft = f.translate(mul(fn, z0));
        safeDelete(f);
        f = ft;
      }
      const vecArg = new oc.gp_Vec(fn[0] * (z1 - z0), fn[1] * (z1 - z0), fn[2] * (z1 - z0));
      const pr = new oc.BRepPrimAPI_MakePrism(f.wrapped, vecArg, false, true);
      let res = R.cast(pr.Shape());
      pr.delete(); vecArg.delete(); safeDelete(f);
      if (R.measureVolume(res) < 0) res = R.cast(res.wrapped.Reversed());
      return res;
    };

    const makeRingPrism = (outerW, innerW, gpPln, fn, z0, z1) => {
      const pOut = makeSolidPrismFromWire(outerW, gpPln, fn, z0, z1);
      const pIn = makeSolidPrismFromWire(innerW, gpPln, fn, z0 - 0.5, z1 + 0.5);
      try {
        return pOut.cut(pIn);
      } finally {
        safeDelete(pOut);
        safeDelete(pIn);
      }
    };

    const fArrA = [], fArrB = [];
    try { for (const fx of srcA.shape.faces) fArrA.push(fx); } catch (_) {}
    try { for (const fx of srcB.shape.faces) fArrB.push(fx); } catch (_) {}

    let gpPln = null, lipSolid = null, grooveCutA = null, grooveCutB = null, resA = null, resB = null, invBShape = null;
    try {
      const bA = bboxOf(srcA.shape);
      const tolA = 0.05 + 1e-3 * Math.max(bA[3] - bA[0], bA[4] - bA[1], bA[5] - bA[2]);
      let faceA = p.face ? (resolveFaceRef({ ...p.face, tol: tolA }, fArrA, srcA.topo, srcA.it.id, true)[0] || matchFace(srcA.shape, p.face)) : null;

      if (!faceA && p.edge && Array.isArray(p.edge.a) && Array.isArray(p.edge.b)) {
        const mPt = Array.isArray(p.edge.m) ? p.edge.m : mul(add(p.edge.a, p.edge.b), 0.5);
        const bbBInA = bboxTransform(bboxOf(srcB.shape), matInvRigid(relAB));
        const cBInA = [(bbBInA[0] + bbBInA[3]) / 2, (bbBInA[1] + bbBInA[4]) / 2, (bbBInA[2] + bbBInA[5]) / 2];
        let bestScore = -Infinity;
        for (const fx of fArrA) {
          if (fx.geomType !== 'PLANE') continue;
          const fc = vec(fx.center), fn = norm(vec(fx.normalAt()));
          const onPln = (pt) => Math.abs(dot(sub(pt, fc), fn)) < 0.05;
          if (onPln(p.edge.a) && onPln(p.edge.b) && onPln(mPt)) {
            const sc = dot(norm(sub(cBInA, fc)), fn);
            if (sc > bestScore) { bestScore = sc; faceA = fx; }
          }
        }
      }

      if (!faceA || faceA.geomType !== 'PLANE') {
        const err = new Error('Lippe und Nut: Die ebene Trennfläche wurde nicht gefunden.');
        err.code = 'edges';
        throw err;
      }

      const fc = vec(faceA.center);
      const fn = norm(vec(faceA.normalAt()));
      const gpP = new oc.gp_Pnt(fc[0], fc[1], fc[2]);
      const gpD = new oc.gp_Dir(fn[0], fn[1], fn[2]);
      gpPln = new oc.gp_Pln(gpP, gpD);
      gpP.delete(); gpD.delete();

      const wiresA = collectWires(oc.TopoDS.Face(faceA.wrapped));
      const wOut = wiresA[0];
      if (!wOut) throw new Error('Lippe und Nut: Der Umriss der Trennfläche fehlt.');
      let wIn = null;
      if (wiresA.length > 1) {
        let bestInA = -1;
        for (let wi = 1; wi < wiresA.length; wi++) {
          const a = wireAreaOnPlane(gpPln, wiresA[wi]);
          if (a > bestInA) { bestInA = a; wIn = wiresA[wi]; }
        }
      }

      // Wenn die Lippen-Hälfte massiv ist, prüfen ob die Nut-Hälfte an der Trennebene ein inneres Loch hat
      if (!wIn) {
        const invRel = matInvRigid(relAB);
        invBShape = isIdentity(invRel) ? srcB.shape.clone() : applyMatrix(srcB.shape, invRel);
        const fbArr = [];
        try { for (const fx of invBShape.faces) fbArr.push(fx); } catch (_) {}
        try {
          for (const fx of fbArr) {
            if (fx.geomType !== 'PLANE') continue;
            const nB = norm(vec(fx.normalAt())), cB = vec(fx.center);
            if (dot(nB, fn) < -0.99 && Math.abs(dot(sub(cB, fc), fn)) < 0.1) {
              const wiresB = collectWires(oc.TopoDS.Face(fx.wrapped));
              if (wiresB.length > 1) {
                let bestInB = -1;
                for (let wi = 1; wi < wiresB.length; wi++) {
                  const a = wireAreaOnPlane(gpPln, wiresB[wi]);
                  if (a > bestInB) { bestInB = a; wIn = wiresB[wi]; }
                }
                break;
              }
            }
          }
        } finally {
          for (const fx of fbArr) safeDelete(fx);
        }
      }

      const areaOut = wireAreaOnPlane(gpPln, wOut);
      const areaIn = wIn ? wireAreaOnPlane(gpPln, wIn) : 0;

      if (side === 'inner') {
        if (wIn) {
          const wLipOut = offsetClosedWire(wIn, gpPln, width, true);
          if (wireAreaOnPlane(gpPln, wLipOut) >= areaOut - 1e-2) {
            throw new Error('Lippe und Nut: Die Lippe ist breiter als die Gehäusewand.');
          }
          lipSolid = makeRingPrism(wLipOut, wIn, gpPln, fn, -0.05, height);
          const wGrvOut = offsetClosedWire(wIn, gpPln, width + clearance, true);
          if (wireAreaOnPlane(gpPln, wGrvOut) >= areaOut - 1e-2) {
            throw new Error('Lippe und Nut: Lippenbreite plus Spiel passt nicht in die Gehäusewand.');
          }
          grooveCutA = makeSolidPrismFromWire(wGrvOut, gpPln, fn, -0.1, height + clearance);
        } else {
          const wGrvOut = offsetClosedWire(wOut, gpPln, width, false);
          const wLipOut = offsetClosedWire(wOut, gpPln, width + clearance, false);
          const wLipIn = offsetClosedWire(wOut, gpPln, 2 * width + clearance, false, false);
          lipSolid = wLipIn ? makeRingPrism(wLipOut, wLipIn, gpPln, fn, -0.05, height) : makeSolidPrismFromWire(wLipOut, gpPln, fn, -0.05, height);
          grooveCutA = makeSolidPrismFromWire(wGrvOut, gpPln, fn, -0.1, height + clearance);
        }
      } else {
        const wLipIn = offsetClosedWire(wOut, gpPln, width, false);
        if (wIn && wireAreaOnPlane(gpPln, wLipIn) <= areaIn + 1e-2) {
          throw new Error('Lippe und Nut: Die Lippe ist breiter als die Gehäusewand.');
        }
        lipSolid = makeRingPrism(wOut, wLipIn, gpPln, fn, -0.05, height);
        const wGrvIn = offsetClosedWire(wOut, gpPln, width + clearance, false);
        if (wIn && wireAreaOnPlane(gpPln, wGrvIn) <= areaIn + 1e-2) {
          throw new Error('Lippe und Nut: Lippenbreite plus Spiel passt nicht in die Gehäusewand.');
        }
        const wGrvOut = offsetClosedWire(wOut, gpPln, Math.max(2.0, width + clearance + 1.0), true);
        grooveCutA = makeRingPrism(wGrvOut, wGrvIn, gpPln, fn, -0.1, height + clearance);
      }

      resA = boolWithTopo('fuse', srcA.shape, srcA.topo, srcA.it.id, lipSolid, null, stepId, 'Lip:' + stepId);
      grooveCutB = isIdentity(relAB) ? grooveCutA.clone() : applyMatrix(grooveCutA, relAB);
      resB = boolWithTopo('cut', srcB.shape, srcB.topo, srcB.it.id, grooveCutB, null, stepId, 'Grv:' + stepId);

      const out = { shapeA: resA.shape, topoA: resA.topo, shapeB: resB.shape, topoB: resB.topo };
      resA = null; resB = null;
      return out;
    } finally {
      for (const fx of fArrA) safeDelete(fx);
      for (const fx of fArrB) safeDelete(fx);
      if (gpPln && gpPln.delete) try { gpPln.delete(); } catch (_) {}
      safeDelete(invBShape);
      safeDelete(lipSolid);
      safeDelete(grooveCutA);
      safeDelete(grooveCutB);
      if (resA) { safeDelete(resA.shape); freeTopoMap(resA.topo); }
      if (resB) { safeDelete(resB.shape); freeTopoMap(resB.topo); }
    }
  }

  // ---------- Wellen- & Bohrungs-Schritte (KP-48, KP-49): Freistich, Einstich, Passfeder-Nut, Keilwelle ----------
  function rigidMat(O, X, Y, Z) {
    return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, O[0], O[1], O[2], 1];
  }
  function resolveCylFaceForShaft(shape, topo, baseId, spec, errLabel) {
    const fArr = [];
    try { for (const fx of shape.faces) fArr.push(fx); } catch (_) {}
    let picked = null;
    try {
      if (spec && spec.tid && topo) {
        const b = bboxOf(shape);
        const tol = 0.05 + 1e-3 * Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
        const hits = resolveFaceRef({ ...spec, tol }, fArr, topo, baseId, true);
        if (hits[0] && hits[0].geomType === 'CYLINDRE') picked = hits[0];
      }
      if (!picked) {
        const cyls = [];
        for (const f of fArr) {
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
        if (cyls.length === 1) picked = cyls[0].face;
        else if (cyls.length > 1) {
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
            if (sR != null) score += Math.abs(item.r - sR) * 100;
            if (sO && sD) score += distLine(item.o, sO, sD) * 20;
            if (sC) score += len(sub(item.c, sC));
            if (score < bs) { bs = score; best = item.face; }
          }
          picked = best;
        }
      }
      if (!picked || picked.geomType !== 'CYLINDRE') {
        const err = new Error(errLabel + ': Die gewählte Zylinderfläche gibt es nicht mehr.');
        err.code = 'edges';
        throw err;
      }
      return cylFrameOf(picked, spec);
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
  }
  function buildUndercutOn(baseShape, baseTopo, baseId, stepId, p) {
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Freistich');
    const width = num(p.width, 3.5);
    const grooveD = num(p.grooveD, 0);
    const end = p.end === 'bottom' ? 'bottom' : 'top';
    const offset = Math.max(0, num(p.offset, 0));
    const rampAngle = Math.max(10, Math.min(89, num(p.rampAngle, 30)));
    if (!(width > 0.1 && isFinite(width))) throw new Error('Freistich: Die Breite muss größer als 0,1 mm sein.');
    if (!(grooveD > 0.2 && isFinite(grooveD))) throw new Error('Freistich: Der Nutdurchmesser muss größer als 0,2 mm sein.');
    if (!F.isInner && grooveD >= 2 * F.R - 0.05) throw new Error('Freistich: Der Nutdurchmesser muss kleiner als der Wellendurchmesser sein.');
    if (F.isInner && grooveD <= 2 * F.R + 0.05) throw new Error('Freistich: Bei einer Bohrung muss der Nutdurchmesser größer als der Bohrungsdurchmesser sein.');

    const zStart = end === 'bottom' ? F.vMin + offset : F.vMax - offset;
    const dir = end === 'bottom' ? 1 : -1;
    const zEnd = zStart + dir * width;
    const depth = Math.abs(F.R - grooveD / 2);
    const ramp = Math.min(depth / Math.tan((rampAngle * Math.PI) / 180), width * 0.45);
    const zFlatEnd = zEnd - dir * ramp;
    const rGroove = grooveD / 2;
    let pts2;
    if (!F.isInner) {
      const rOut = F.R + Math.min(1.0, Math.max(0.25, depth * 0.8));
      pts2 = dir > 0
        ? [[rGroove, zStart], [rOut, zStart], [rOut, zEnd], [F.R, zEnd], [rGroove, zFlatEnd]]
        : [[rGroove, zStart], [rGroove, zFlatEnd], [F.R, zEnd], [rOut, zEnd], [rOut, zStart]];
    } else {
      const rIn = Math.max(0.1, F.R - Math.min(1.0, Math.max(0.25, depth * 0.8)));
      pts2 = dir > 0
        ? [[rIn, zStart], [rGroove, zStart], [rGroove, zFlatEnd], [F.R, zEnd], [rIn, zEnd]]
        : [[rIn, zStart], [rIn, zEnd], [F.R, zEnd], [rGroove, zFlatEnd], [rGroove, zStart]];
    }
    let raw = null, tool = null;
    try {
      raw = revolveProfile(pts2);
      if (R.measureVolume(raw) < 0) raw = R.cast(raw.wrapped.Reversed());
      tool = applyMatrix(raw, rigidMat(F.O, F.R0, F.T0, F.A));
      const res = boolWithTopo('cut', baseShape, baseTopo, baseId, tool, null, stepId, 'Und:' + stepId);
      return { shape: res.shape, topo: res.topo };
    } finally {
      safeDelete(raw); safeDelete(tool);
    }
  }
  function buildCirclipGrooveOn(baseShape, baseTopo, baseId, stepId, p) {
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Einstich');
    const width = num(p.width, 1.3);
    const grooveD = num(p.grooveD, 0);
    const from = p.from === 'bottom' || p.from === 'center' ? p.from : 'top';
    const offset = num(p.offset, 3);
    if (!(width > 0.1 && isFinite(width))) throw new Error('Einstich: Die Nutbreite muss größer als 0,1 mm sein.');
    if (!(grooveD > 0.2 && isFinite(grooveD))) throw new Error('Einstich: Der Nutdurchmesser muss größer als 0,2 mm sein.');
    if (!F.isInner && grooveD >= 2 * F.R - 0.05) throw new Error('Einstich: Der Nutdurchmesser muss kleiner als der Wellendurchmesser sein.');
    if (F.isInner && grooveD <= 2 * F.R + 0.05) throw new Error('Einstich: Bei einer Bohrung muss der Nutdurchmesser größer als der Bohrungsdurchmesser sein.');

    let z0, z1;
    if (from === 'bottom') { z0 = F.vMin + offset; z1 = z0 + width; }
    else if (from === 'center') { z0 = F.vMid + offset - width / 2; z1 = z0 + width; }
    else { z1 = F.vMax - offset; z0 = z1 - width; }

    const rGroove = grooveD / 2;
    let pts2;
    if (!F.isInner) {
      const rOut = F.R + Math.max(1.0, (F.R - rGroove) * 2);
      pts2 = [[rGroove, z0], [rOut, z0], [rOut, z1], [rGroove, z1]];
    } else {
      const rIn = Math.max(0.1, F.R - Math.max(1.0, (rGroove - F.R) * 2));
      pts2 = [[rIn, z0], [rGroove, z0], [rGroove, z1], [rIn, z1]];
    }
    let raw = null, tool = null;
    try {
      raw = revolveProfile(pts2);
      if (R.measureVolume(raw) < 0) raw = R.cast(raw.wrapped.Reversed());
      tool = applyMatrix(raw, rigidMat(F.O, F.R0, F.T0, F.A));
      const res = boolWithTopo('cut', baseShape, baseTopo, baseId, tool, null, stepId, 'Cir:' + stepId);
      return { shape: res.shape, topo: res.topo };
    } finally {
      safeDelete(raw); safeDelete(tool);
    }
  }
  function buildKeywayOn(baseShape, baseTopo, baseId, stepId, p) {
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Passfeder-Nut');
    const width = num(p.width, 6);
    const depth = num(p.depth, 3.5);
    const length = num(p.length, 20);
    const ends = p.ends === 'straight' ? 'straight' : 'round';
    const from = p.from === 'top' || p.from === 'bottom' ? p.from : 'center';
    const offset = num(p.offset, 0);
    const angRad = (num(p.angle, 0) * Math.PI) / 180;
    if (!(width > 0.2 && isFinite(width))) throw new Error('Passfeder-Nut: Die Breite muss größer als 0,2 mm sein.');
    if (!(depth > 0.1 && isFinite(depth))) throw new Error('Passfeder-Nut: Die Tiefe muss größer als 0,1 mm sein.');
    if (!(length > 0.5 && isFinite(length))) throw new Error('Passfeder-Nut: Die Länge muss größer als 0,5 mm sein.');
    if (!F.isInner && width >= 2 * F.R - 0.1) throw new Error('Passfeder-Nut: Die Nutbreite ist größer als der Wellendurchmesser.');
    if (!F.isInner && depth >= 2 * F.R - 0.2) throw new Error('Passfeder-Nut: Die Nuttiefe ist zu groß für diesen Wellendurchmesser.');

    const rad = norm(add(mul(F.R0, Math.cos(angRad)), mul(F.T0, Math.sin(angRad))));
    const tan = norm(cross(F.A, rad));
    let z0, z1;
    if (from === 'top') {
      z1 = F.vMax - offset + (ends === 'straight' && offset <= 0 ? 0.5 : 0);
      z0 = (F.vMax - offset) - length;
    } else if (from === 'bottom') {
      z0 = F.vMin + offset - (ends === 'straight' && offset <= 0 ? 0.5 : 0);
      z1 = (F.vMin + offset) + length;
    } else {
      const zm = F.vMid + offset;
      z0 = zm - length / 2;
      z1 = zm + length / 2;
    }
    const zMid = (z0 + z1) / 2;
    const L = Math.max(0.5, z1 - z0);
    const rBot = F.isInner ? Math.max(0.1, F.R - Math.max(2.0, depth)) : (F.R - depth);
    const rTop = F.isInner ? (F.R + depth) : (F.R + Math.max(2.0, depth));

    let raw = null, tool = null;
    try {
      raw = ends === 'round' && !F.isInner
        ? stadiumExtrude(L, width, rBot, rTop - rBot)
        : R.makeBox([-L / 2, -width / 2, rBot], [L / 2, width / 2, rTop]);
      tool = applyMatrix(raw, rigidMat(add(F.O, mul(F.A, zMid)), F.A, mul(tan, -1), rad));
      const res = boolWithTopo('cut', baseShape, baseTopo, baseId, tool, null, stepId, 'Key:' + stepId);
      return { shape: res.shape, topo: res.topo };
    } finally {
      safeDelete(raw); safeDelete(tool);
    }
  }
  function buildSplineProfileOn(baseShape, baseTopo, baseId, stepId, p) {
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Keilwellen-Profil');
    const n = Math.max(4, Math.min(24, Math.round(num(p.teeth, 6))));
    const rootD = num(p.rootD, 0);
    const b = num(p.b, 4);
    const length = Math.max(0, num(p.length, 0));
    const from = p.from === 'bottom' ? 'bottom' : 'top';
    const offset = Math.max(0, num(p.offset, 0));
    const angRad = (num(p.angle, 0) * Math.PI) / 180;
    if (!(b > 0.2 && isFinite(b))) throw new Error('Keilwellen-Profil: Die Keilbreite muss größer als 0,2 mm sein.');
    if (!(rootD > 0.2 && isFinite(rootD))) throw new Error('Keilwellen-Profil: Der Grunddurchmesser muss größer als 0,2 mm sein.');
    if (!F.isInner && rootD >= 2 * F.R - 0.1) throw new Error('Keilwellen-Profil: Der Innendurchmesser d muss kleiner als der Wellendurchmesser D sein.');
    if (F.isInner && rootD <= 2 * F.R + 0.1) throw new Error('Keilwellen-Profil: Bei einer Bohrung muss der Außendurchmesser D größer als der Bohrungsdurchmesser sein.');

    const rMin = F.isInner ? F.R : rootD / 2;
    if (b / 2 >= rMin * 0.96) throw new Error('Keilwellen-Profil: Die Keilbreite b ist zu groß für den Innendurchmesser.');
    const aMin = Math.asin((b / 2) / rMin);
    if (n * aMin >= Math.PI - 0.02) throw new Error('Keilwellen-Profil: Zu viele oder zu breite Keile für diesen Durchmesser.');

    let z0, z1;
    if (length <= 0) {
      z0 = F.vMin - 0.2;
      z1 = F.vMax + 0.2;
    } else if (from === 'bottom') {
      z0 = F.vMin + offset - (offset <= 0 ? 0.2 : 0);
      z1 = F.vMin + offset + length;
    } else {
      z1 = F.vMax - offset + (offset <= 0 ? 0.2 : 0);
      z0 = F.vMax - offset - length;
    }
    const dz = Math.max(0.2, z1 - z0);
    const P = (r, a) => [r * Math.cos(a), r * Math.sin(a), z0];
    const slots = [], edgesToDel = [];
    let rawComp = null, tool = null;
    try {
      if (!F.isInner) {
        const rRoot = rootD / 2, rCut = F.R + 1.5;
        const aRoot = Math.asin((b / 2) / rRoot);
        const aCut = Math.asin(Math.min(0.99, (b / 2) / rCut));
        for (let k = 0; k < n; k++) {
          const th = angRad + (2 * Math.PI * k) / n;
          const thNext = angRad + (2 * Math.PI * (k + 1)) / n;
          const thMid = th + Math.PI / n;
          const eds = [
            R.makeThreePointArc(P(rRoot, th + aRoot), P(rRoot, thMid), P(rRoot, thNext - aRoot)),
            R.makeLine(P(rRoot, thNext - aRoot), P(rCut, thNext - aCut)),
            R.makeThreePointArc(P(rCut, thNext - aCut), P(rCut, thMid), P(rCut, th + aCut)),
            R.makeLine(P(rCut, th + aCut), P(rRoot, th + aRoot)),
          ];
          edgesToDel.push(...eds);
          const w = R.assembleWire(eds), f = R.makeFace(w);
          const sol = R.basicFaceExtrusion(f, new R.Vector([0, 0, dz]));
          safeDelete(w); safeDelete(f);
          slots.push(sol);
        }
      } else {
        const rOut = rootD / 2;
        const aOut = Math.asin((b / 2) / rOut);
        const xIn = Math.max(0.05, Math.sqrt(Math.max(0, F.R * F.R - (b / 2) * (b / 2))) - 1.0);
        const xOut = Math.sqrt(Math.max(0, rOut * rOut - (b / 2) * (b / 2)));
        const rot2 = (x, y, th) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th), z0];
        for (let k = 0; k < n; k++) {
          const th = angRad + (2 * Math.PI * k) / n;
          const p1 = rot2(xIn, -b / 2, th), p2 = rot2(xOut, -b / 2, th);
          const p3 = rot2(xOut, b / 2, th), p4 = rot2(xIn, b / 2, th);
          const pMid = P(rOut, th);
          const eds = [
            R.makeLine(p1, p2),
            R.makeThreePointArc(p2, pMid, p3),
            R.makeLine(p3, p4),
            R.makeLine(p4, p1),
          ];
          edgesToDel.push(...eds);
          const w = R.assembleWire(eds), f = R.makeFace(w);
          const sol = R.basicFaceExtrusion(f, new R.Vector([0, 0, dz]));
          safeDelete(w); safeDelete(f);
          slots.push(sol);
        }
      }
      rawComp = R.makeCompound(slots);
      tool = applyMatrix(rawComp, rigidMat(F.O, F.R0, F.T0, F.A));
      const res = boolWithTopo('cut', baseShape, baseTopo, baseId, tool, null, stepId, 'Spl:' + stepId);
      return { shape: res.shape, topo: res.topo };
    } finally {
      for (const e of edgesToDel) safeDelete(e);
      for (const s of slots) safeDelete(s);
      safeDelete(rawComp); safeDelete(tool);
    }
  }

  // ---------- Rändel & Griffmuster (KP-50) ----------
  function buildKnurlSolid(R0, depth, z0, z1, N, M, style, totalTwist = 0, rInner = 0) {
    const rRoot = R0 - depth;
    const builder = new oc.TopoDS_Builder();
    const shell = new oc.TopoDS_Shell();
    builder.MakeShell(shell);

    const nI = 2 * N;
    const nJ = style === 'straight' ? 2 : style === 'angled' ? Math.max(2, M + 1) : (2 * M + 1);
    const verts = [];
    for (let j = 0; j < nJ; j++) {
      const tJ = j / (nJ - 1);
      const z = z0 + (z1 - z0) * tJ;
      const vRow = [];
      for (let i = 0; i < nI; i++) {
        let ang, isPeak;
        if (style === 'straight') {
          ang = (2 * Math.PI * i) / nI;
          isPeak = (i % 2) === 1;
        } else if (style === 'angled') {
          ang = (2 * Math.PI * i) / nI + tJ * totalTwist;
          isPeak = (i % 2) === 1;
        } else {
          ang = (2 * Math.PI * i) / nI;
          isPeak = ((i + j) % 2) === 1;
        }
        const r = isPeak ? R0 : rRoot;
        const gp = new oc.gp_Pnt(r * Math.cos(ang), r * Math.sin(ang), z);
        const mv = new oc.BRepBuilderAPI_MakeVertex(gp);
        vRow.push(mv.Vertex());
        mv.delete(); gp.delete();
      }
      verts.push(vRow);
    }

    const edgeCache = new Map();
    const getEdge = (prefix, j1, i1, j2, i2, arr, mod) => {
      i1 = ((i1 % mod) + mod) % mod;
      i2 = ((i2 % mod) + mod) % mod;
      const k1 = prefix + j1 + ',' + i1, k2 = prefix + j2 + ',' + i2;
      const fwd = k1 < k2;
      const key = fwd ? k1 + '|' + k2 : k2 + '|' + k1;
      let e = edgeCache.get(key);
      if (!e) {
        const me = new oc.BRepBuilderAPI_MakeEdge(fwd ? arr[j1][i1] : arr[j2][i2], fwd ? arr[j2][i2] : arr[j1][i1]);
        e = me.Edge();
        me.delete();
        edgeCache.set(key, e);
      }
      return fwd ? e : oc.TopoDS.Edge(e.Reversed());
    };
    const ge = (j1, i1, j2, i2) => getEdge('o', j1, i1, j2, i2, verts, nI);

    const addTri = (j1, i1, j2, i2, j3, i3) => {
      const mw = new oc.BRepBuilderAPI_MakeWire();
      mw.Add(ge(j1, i1, j2, i2));
      mw.Add(ge(j2, i2, j3, i3));
      mw.Add(ge(j3, i3, j1, i1));
      const w = mw.Wire(); mw.delete();
      const mf = new oc.BRepBuilderAPI_MakeFace(w, true);
      const f = mf.Face(); mf.delete(); w.delete();
      builder.Add(shell, f); f.delete();
    };
    const addQuad = (j1, i1, j2, i2, j3, i3, j4, i4) => {
      const mw = new oc.BRepBuilderAPI_MakeWire();
      mw.Add(ge(j1, i1, j2, i2));
      mw.Add(ge(j2, i2, j3, i3));
      mw.Add(ge(j3, i3, j4, i4));
      mw.Add(ge(j4, i4, j1, i1));
      const w = mw.Wire(); mw.delete();
      const mf = new oc.BRepBuilderAPI_MakeFace(w, true);
      const f = mf.Face(); mf.delete(); w.delete();
      builder.Add(shell, f); f.delete();
    };

    for (let j = 0; j < nJ - 1; j++) {
      for (let i = 0; i < nI; i++) {
        const iN = (i + 1) % nI;
        if (style === 'straight') {
          addQuad(j, i, j, iN, j + 1, iN, j + 1, i);
        } else if (style === 'crossed') {
          if (((i + j) % 2) === 0) {
            addTri(j, i, j, iN, j + 1, iN);
            addTri(j, i, j + 1, iN, j + 1, i);
          } else {
            addTri(j, i, j, iN, j + 1, i);
            addTri(j, iN, j + 1, iN, j + 1, i);
          }
        } else {
          if ((i % 2) === 0) {
            addTri(j, i, j, iN, j + 1, iN);
            addTri(j, i, j + 1, iN, j + 1, i);
          } else {
            addTri(j, i, j, iN, j + 1, i);
            addTri(j, iN, j + 1, iN, j + 1, i);
          }
        }
      }
    }

    const inK = rInner > 0.1 ? 24 : 0;
    const inV = [[], []];
    if (inK) {
      for (let j = 0; j < 2; j++) {
        const z = j === 0 ? z0 : z1;
        for (let k = 0; k < inK; k++) {
          const a = (2 * Math.PI * k) / inK;
          const gp = new oc.gp_Pnt(rInner * Math.cos(a), rInner * Math.sin(a), z);
          const mv = new oc.BRepBuilderAPI_MakeVertex(gp);
          inV[j].push(mv.Vertex());
          mv.delete(); gp.delete();
        }
      }
      const gi = (j1, i1, j2, i2) => getEdge('i', j1, i1, j2, i2, inV, inK);
      for (let k = 0; k < inK; k++) {
        const kN = (k + 1) % inK;
        const mw = new oc.BRepBuilderAPI_MakeWire();
        mw.Add(gi(0, k, 1, k));
        mw.Add(gi(1, k, 1, kN));
        mw.Add(gi(1, kN, 0, kN));
        mw.Add(gi(0, kN, 0, k));
        const w = mw.Wire(); mw.delete();
        const mf = new oc.BRepBuilderAPI_MakeFace(w, true);
        const f = mf.Face(); mf.delete(); w.delete();
        builder.Add(shell, f); f.delete();
      }
      const mwO = new oc.BRepBuilderAPI_MakeWire();
      for (let i = nI - 1; i >= 0; i--) mwO.Add(ge(0, (i + 1) % nI, 0, i));
      const wO = mwO.Wire(); mwO.delete();
      const mwI = new oc.BRepBuilderAPI_MakeWire();
      for (let k = 0; k < inK; k++) mwI.Add(gi(0, k, 0, (k + 1) % inK));
      const wI = mwI.Wire(); mwI.delete();
      const p0 = new oc.gp_Pnt(0, 0, z0), d0 = new oc.gp_Dir(0, 0, -1), pln0 = new oc.gp_Pln(p0, d0);
      const mf0 = new oc.BRepBuilderAPI_MakeFace(pln0, wO, true);
      mf0.Add(wI);
      const f0 = mf0.Face(); mf0.delete(); pln0.delete(); p0.delete(); d0.delete(); wO.delete(); wI.delete();
      builder.Add(shell, f0); f0.delete();

      const mwO2 = new oc.BRepBuilderAPI_MakeWire();
      for (let i = 0; i < nI; i++) mwO2.Add(ge(nJ - 1, i, nJ - 1, (i + 1) % nI));
      const wO2 = mwO2.Wire(); mwO2.delete();
      const mwI2 = new oc.BRepBuilderAPI_MakeWire();
      for (let k = inK - 1; k >= 0; k--) mwI2.Add(gi(1, (k + 1) % inK, 1, k));
      const wI2 = mwI2.Wire(); mwI2.delete();
      const p1 = new oc.gp_Pnt(0, 0, z1), d1 = new oc.gp_Dir(0, 0, 1), pln1 = new oc.gp_Pln(p1, d1);
      const mf1 = new oc.BRepBuilderAPI_MakeFace(pln1, wO2, true);
      mf1.Add(wI2);
      const f1 = mf1.Face(); mf1.delete(); pln1.delete(); p1.delete(); d1.delete(); wO2.delete(); wI2.delete();
      builder.Add(shell, f1); f1.delete();
    } else {
      const mw0 = new oc.BRepBuilderAPI_MakeWire();
      for (let i = nI - 1; i >= 0; i--) mw0.Add(ge(0, (i + 1) % nI, 0, i));
      const w0 = mw0.Wire(); mw0.delete();
      const mf0 = new oc.BRepBuilderAPI_MakeFace(w0, true);
      const f0 = mf0.Face(); mf0.delete(); w0.delete();
      builder.Add(shell, f0); f0.delete();

      const mw1 = new oc.BRepBuilderAPI_MakeWire();
      for (let i = 0; i < nI; i++) mw1.Add(ge(nJ - 1, i, nJ - 1, (i + 1) % nI));
      const w1 = mw1.Wire(); mw1.delete();
      const mf1 = new oc.BRepBuilderAPI_MakeFace(w1, true);
      const f1 = mf1.Face(); mf1.delete(); w1.delete();
      builder.Add(shell, f1); f1.delete();
    }

    const ms = new oc.BRepBuilderAPI_MakeSolid(shell);
    let sol = ms.Solid(); ms.delete();
    let shape = R.cast(sol);
    if (R.measureVolume(shape) < 0) shape = R.cast(sol.Reversed());

    for (const e of edgeCache.values()) e.delete();
    for (const row of verts) for (const v of row) v.delete();
    for (const row of inV) for (const v of row) v.delete();
    shell.delete(); builder.delete();
    return shape;
  }

  function resolveCylAxialRange(F, p, errLabel) {
    const margin = Math.max(0, num(p.margin, 0));
    const length = Math.max(0, num(p.length, 0));
    const from = p.from === 'top' || p.from === 'bottom' ? p.from : 'center';
    const offset = num(p.offset, 0);
    let z0, z1;
    if (length <= 0) {
      z0 = F.vMin + margin;
      z1 = F.vMax - margin;
    } else if (from === 'top') {
      z1 = F.vMax - margin - offset;
      z0 = z1 - length;
    } else if (from === 'bottom') {
      z0 = F.vMin + margin + offset;
      z1 = z0 + length;
    } else {
      const zm = F.vMid + offset;
      z0 = zm - length / 2;
      z1 = zm + length / 2;
    }
    z0 = Math.max(F.vMin, z0);
    z1 = Math.min(F.vMax, z1);
    if (!(z1 - z0 >= 0.5)) throw new Error(`${errLabel}: Die verfügbare Länge auf dem Zylinder ist zu klein.`);
    return [z0, z1];
  }

  function findCoaxialBoreRadius(shape, F) {
    let rBore = 0;
    const fArr = [];
    try { for (const fx of shape.faces) fArr.push(fx); } catch (_) {}
    try {
      for (const f of fArr) {
        if (f.geomType !== 'CYLINDRE') continue;
        if (f.wrapped.Orientation() !== oc.TopAbs_Orientation.TopAbs_REVERSED) continue;
        try {
          const ad = new oc.BRepAdaptor_Surface(f.wrapped, false);
          const cy = ad.Cylinder(), ax = cy.Axis(), l = ax.Location(), d = ax.Direction();
          const o = [l.X(), l.Y(), l.Z()], dir = norm([d.X(), d.Y(), d.Z()]), r = cy.Radius();
          ad.delete();
          if (Math.abs(dot(dir, F.A)) > 0.999) {
            const v = sub(o, F.O);
            const perp = len(sub(v, mul(F.A, dot(v, F.A))));
            if (perp < 0.05 && r < F.R) rBore = Math.max(rBore, r);
          }
        } catch (_) {}
      }
    } finally {
      for (const fx of fArr) safeDelete(fx);
    }
    return rBore;
  }

  function buildKnurlOn(baseShape, baseTopo, baseId, stepId, p) {
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Rändel');
    if (F.isInner) throw new Error('Rändel: Wähle die Außenfläche (Mantel) eines Zylinders.');
    const style = p.style === 'straight' || p.style === 'angled' ? p.style : 'crossed';
    const pitch = num(p.pitch, 1.0);
    if (!(pitch >= 0.3 && isFinite(pitch))) throw new Error('Rändel: Die Teilung muss mindestens 0,3 mm sein.');
    const angle = Math.max(10, Math.min(60, num(p.angle, 30)));
    const depth = num(p.depth, 0) > 0 ? num(p.depth, 0) : Math.round(pitch * 0.38 * 1000) / 1000;
    if (!(depth >= 0.05 && isFinite(depth))) throw new Error('Rändel: Die Rändeltiefe muss mindestens 0,05 mm sein.');
    if (depth >= F.R - 0.5) throw new Error('Rändel: Die Rändeltiefe ist zu groß für diesen Durchmesser.');

    const [z0, z1] = resolveCylAxialRange(F, p, 'Rändel');
    const H = z1 - z0;
    const angRad = (angle * Math.PI) / 180;
    let N, M, totalTwist = 0;
    if (style === 'straight') {
      N = Math.max(6, Math.min(120, 2 * Math.round((Math.PI * F.R) / pitch)));
      M = 1;
    } else if (style === 'crossed') {
      const pc = pitch / Math.cos(angRad);
      N = Math.max(6, Math.min(96, 2 * Math.round((Math.PI * F.R) / pc)));
      const ds = (2 * Math.PI * F.R) / N;
      const dz = ds / Math.tan(angRad);
      M = Math.max(1, Math.round(H / dz));
    } else {
      const pc = pitch / Math.cos(angRad);
      N = Math.max(6, Math.min(96, 2 * Math.round((Math.PI * F.R) / pc)));
      totalTwist = (H * Math.tan(angRad)) / F.R;
      M = Math.max(4, Math.min(24, Math.ceil(H / Math.max(1.0, pitch * 2))));
    }
    if (N * M > 1500) {
      throw new Error('Rändel: Die Teilung ist für diese Fläche zu fein – wähle eine größere Teilung oder kürzere Rändellänge.');
    }

    const Mloc = rigidMat(F.O, F.R0, F.T0, F.A);
    let isSimpleFullCyl = false;
    try {
      const sols = baseShape.solids, fcs = baseShape.faces;
      isSimpleFullCyl = sols.length === 1 && fcs.length === 3
        && Math.abs(z0 - F.vMin) < 1e-4 && Math.abs(z1 - F.vMax) < 1e-4;
      for (const s of sols) safeDelete(s);
      for (const f of fcs) safeDelete(f);
    } catch (_) {}

    if (isSimpleFullCyl) {
      let raw = null, out = null;
      try {
        raw = buildKnurlSolid(F.R, depth, z0, z1, N, M, style, totalTwist, 0);
        out = applyMatrix(raw, Mloc);
        const topo = ensureTopoComplete(out, createTopoMap(), stepId);
        return { shape: out, topo, meta: { style, teeth: N, rows: M, pitch, depth } };
      } catch (err) {
        safeDelete(out);
        throw err;
      } finally {
        safeDelete(raw);
      }
    }

    const rRoot = F.R - depth;
    const rBore = findCoaxialBoreRadius(baseShape, F);
    if (rBore >= rRoot - 0.08) {
      throw new Error('Rändel: Die Wandstärke ist zu dünn für diese Rändeltiefe.');
    }
    const rStrip = rBore > 0 ? Math.max(rBore + 0.08, rRoot - 0.15) : Math.max(0.25, rRoot - 0.15);
    const rInner = rBore > 0 ? Math.max(rBore + 0.04, rStrip - 0.08) : 0;

    let ringOut = null, ringIn = null, ringLoc = null, ringWorld = null;
    let stripped = null, strippedTopo = null, rawKn = null, knTool = null;
    try {
      ringOut = R.makeCylinder(F.R + 0.6, H, [0, 0, z0], [0, 0, 1]);
      ringIn = R.makeCylinder(rStrip, H + 0.4, [0, 0, z0 - 0.2], [0, 0, 1]);
      ringLoc = ringOut.cut(ringIn);
      ringWorld = applyMatrix(ringLoc, Mloc);
      const cutRes = boolWithTopo('cut', baseShape, baseTopo, baseId, ringWorld, null, stepId, 'KnCut:' + stepId);
      stripped = cutRes.shape; strippedTopo = cutRes.topo;
      rawKn = buildKnurlSolid(F.R, depth, z0, z1, N, M, style, totalTwist, rInner);
      knTool = applyMatrix(rawKn, Mloc);
      const fuseRes = boolWithTopo('fuse', stripped, strippedTopo, baseId, knTool, null, stepId, 'Kn:' + stepId);
      return { shape: fuseRes.shape, topo: fuseRes.topo, meta: { style, teeth: N, rows: M, pitch, depth } };
    } finally {
      safeDelete(ringOut); safeDelete(ringIn); safeDelete(ringLoc); safeDelete(ringWorld);
      safeDelete(stripped); freeTopoMap(strippedTopo);
      safeDelete(rawKn); safeDelete(knTool);
    }
  }

  function buildBumpMaster(shapeKind, r, depth, isCut, sag = 0) {
    const d = Math.max(0.1, depth);
    if (!isCut) {
      const zBot = -sag - 0.25;
      const zBase = sag > 1e-5 ? 0.05 : 0;
      const zTop = Math.max(zBase + 0.08, d);
      const hCap = zTop - zBase;
      if (shapeKind === 'cyl') {
        let sol = R.makeCylinder(r, zTop - zBot, [0, 0, zBot], [0, 0, 1]);
        if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
        return sol;
      }
      if (shapeKind === 'cone') {
        const pts2 = sag > 1e-5
          ? [[0, zBot], [r, zBot], [r, zBase], [0, zTop]]
          : [[0, zBot], [r, zBot], [0, zTop]];
        let sol = revolveProfile(pts2);
        if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
        return sol;
      }
      // 'dome'
      const Rsp = (r * r + hCap * hCap) / (2 * hCap);
      const zc = zBase + hCap - Rsp;
      const midAng = Math.asin(Math.min(1, r / Rsp)) / 2;
      const midPt = [Rsp * Math.sin(midAng), 0, zc + Rsp * Math.cos(midAng)];
      const eds = [
        R.makeLine([0, 0, zBot], [r, 0, zBot]),
        R.makeLine([r, 0, zBot], [r, 0, zBase]),
        R.makeThreePointArc([r, 0, zBase], midPt, [0, 0, zTop]),
        R.makeLine([0, 0, zTop], [0, 0, zBot]),
      ];
      const w = R.assembleWire(eds); eds.forEach(safeDelete);
      const f = R.makeFace(w); safeDelete(w);
      let sol = R.revolution(f, [0, 0, 0], [0, 0, 1], 360);
      safeDelete(f);
      if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
      return sol;
    }

    // isCut: recessed dimple along -Z starting above surface (+0.25)
    const zTop = 0.25;
    if (shapeKind === 'cyl') {
      let sol = R.makeCylinder(r, d + zTop, [0, 0, -d], [0, 0, 1]);
      if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
      return sol;
    }
    if (shapeKind === 'cone') {
      const rTop = r * ((d + zTop) / d);
      let sol = revolveProfile([[0, -d], [rTop, zTop], [0, zTop]]);
      if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
      return sol;
    }
    if (d <= r + 1e-4) {
      const Rsp = (r * r + d * d) / (2 * d);
      const sph = R.makeSphere(Rsp);
      const out = sph.translate([0, 0, Rsp - d]);
      safeDelete(sph);
      return out;
    }
    const zShoulder = -(d - r);
    const midAng = Math.PI / 4;
    const midPt = [r * Math.sin(midAng), 0, zShoulder - r * Math.cos(midAng)];
    const eds = [
      R.makeLine([0, 0, zTop], [r, 0, zTop]),
      R.makeLine([r, 0, zTop], [r, 0, zShoulder]),
      R.makeThreePointArc([r, 0, zShoulder], midPt, [0, 0, -d]),
      R.makeLine([0, 0, -d], [0, 0, zTop]),
    ];
    const w = R.assembleWire(eds); eds.forEach(safeDelete);
    const f = R.makeFace(w); safeDelete(w);
    let sol = R.revolution(f, [0, 0, 0], [0, 0, 1], 360);
    safeDelete(f);
    if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
    return sol;
  }

  function buildGripPatternOn(baseShape, baseTopo, baseId, stepId, p) {
    const kind = p.kind === 'bumps' ? 'bumps' : 'grooves';
    const mode = p.mode === 'join' || p.mode === 'cut' ? p.mode : (kind === 'bumps' ? 'join' : 'cut');
    const isCut = mode === 'cut';
    const margin = Math.max(0, num(p.margin, 2));
    const effMargin = Math.max(margin, 0.05);
    const depth = num(p.depth, 0.8);
    if (!(depth >= 0.1 && isFinite(depth))) throw new Error('Griffmuster: Die Tiefe bzw. Höhe muss mindestens 0,1 mm sein.');
    const isCyl = p.face && p.face.t === 'CYLINDRE';

    if (!isCyl) {
      const { f, fArr } = resolvePlanarFeatureFace(baseShape, p.face, baseTopo, baseId);
      try {
        if (!f || f.geomType !== 'PLANE') throw new Error('Griffmuster: Wähle eine ebene oder zylindrische Körperfläche.');
        const F = planarFaceFrame(f);
        const { outer, holes } = sampleFaceLoops2D(f, F);
        if (outer.length < 3) throw new Error('Griffmuster: Die gewählte Fläche hat keinen gültigen Umriss.');
        const angle = num(p.angle, 0);
        const rad = (angle * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
        const U = add(mul(F.x, cosA), mul(F.y, sinA)), V = add(mul(F.x, -sinA), mul(F.y, cosA));
        const Muv = {
          o: F.o, x: U, y: V, n: F.n,
          P: (uv) => [F.o[0] + U[0] * uv[0] + V[0] * uv[1], F.o[1] + U[1] * uv[0] + V[1] * uv[1], F.o[2] + U[2] * uv[0] + V[2] * uv[1]],
        };
        const outerRot = rotatePoly2D(outer, cosA, sinA);
        const holesRot = holes.map((h) => rotatePoly2D(h, cosA, sinA));

        if (kind === 'grooves') {
          const profile = p.profile === 'round' || p.profile === 'rect' ? p.profile : 'v';
          const width = num(p.width, 1.2);
          const pitch = num(p.pitch, 2.5);
          if (!(width >= 0.2 && isFinite(width))) throw new Error('Griffmuster: Die Rillenbreite muss mindestens 0,2 mm sein.');
          if (!(pitch > width + 0.05)) throw new Error('Griffmuster: Die Teilung muss größer als die Rillenbreite sein.');
          let vMin = Infinity, vMax = -Infinity;
          for (const q of outerRot) { if (q[1] < vMin) vMin = q[1]; if (q[1] > vMax) vMax = q[1]; }
          const availV = (vMax - vMin) - 2 * effMargin - width;
          if (availV < -1e-4) throw new Error('Griffmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Rillen.');
          const nRows = Math.max(1, Math.min(80, Math.floor(availV / pitch + 1e-6) + 1));
          const vMid = (vMin + vMax) / 2;
          const segs = [];
          for (let j = 0; j < nRows; j++) {
            const v = vMid + (j - (nRows - 1) / 2) * pitch;
            for (const [uA, uB] of bandIntervals2D(outerRot, holesRot, v, width / 2, effMargin, false)) {
              if (uB - uA >= 0.3) segs.push({ uA, uB, v });
            }
          }
          if (!segs.length) throw new Error('Griffmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Rillen.');

          const toolSolids = [];
          const pt3 = (u, v, n) => add(Muv.P([u, v]), mul(F.n, n));
          try {
            const halfW = width / 2;
            for (const r of segs) {
              const pTL = pt3(r.uA, r.v - halfW, isCut ? 0.1 : 0);
              const pTR = pt3(r.uA, r.v + halfW, isCut ? 0.1 : 0);
              const pBL = pt3(r.uA, r.v - halfW, isCut ? 0 : -0.1);
              const pBR = pt3(r.uA, r.v + halfW, isCut ? 0 : -0.1);
              const eds = [];
              if (isCut) {
                eds.push(R.makeLine(pTL, pTR), R.makeLine(pTR, pBR));
                if (profile === 'v') {
                  const pTip = pt3(r.uA, r.v, -depth);
                  eds.push(R.makeLine(pBR, pTip), R.makeLine(pTip, pBL));
                } else if (profile === 'round') {
                  const pBot = pt3(r.uA, r.v, -depth);
                  eds.push(R.makeThreePointArc(pBR, pBot, pBL));
                } else {
                  const pL = pt3(r.uA, r.v - halfW, -depth), pR = pt3(r.uA, r.v + halfW, -depth);
                  eds.push(R.makeLine(pBR, pR), R.makeLine(pR, pL), R.makeLine(pL, pBL));
                }
                eds.push(R.makeLine(pBL, pTL));
              } else {
                eds.push(R.makeLine(pBL, pBR), R.makeLine(pBR, pTR));
                if (profile === 'v') {
                  const pTip = pt3(r.uA, r.v, depth);
                  eds.push(R.makeLine(pTR, pTip), R.makeLine(pTip, pTL));
                } else if (profile === 'round') {
                  const pTop = pt3(r.uA, r.v, depth);
                  eds.push(R.makeThreePointArc(pTR, pTop, pTL));
                } else {
                  const pL = pt3(r.uA, r.v - halfW, depth), pR = pt3(r.uA, r.v + halfW, depth);
                  eds.push(R.makeLine(pTR, pR), R.makeLine(pR, pL), R.makeLine(pL, pTL));
                }
                eds.push(R.makeLine(pTL, pBL));
              }
              const wr = R.assembleWire(eds); eds.forEach(safeDelete);
              const fc = R.makeFace(wr); safeDelete(wr);
              let sol = R.basicFaceExtrusion(fc, new R.Vector(mul(U, r.uB - r.uA)));
              safeDelete(fc);
              if (R.measureVolume(sol) < 0) sol = R.cast(sol.wrapped.Reversed());
              toolSolids.push(sol);
            }
            const comp = toolSolids.length === 1 ? toolSolids[0] : R.makeCompound(toolSolids);
            const res = boolWithTopo(isCut ? 'cut' : 'fuse', baseShape, baseTopo, baseId, comp, null, stepId, 'Gp:' + stepId);
            if (comp !== toolSolids[0]) safeDelete(comp);
            return { shape: res.shape, topo: res.topo, meta: { kind, count: segs.length, surface: 'plane' } };
          } finally {
            for (const s of toolSolids) safeDelete(s);
          }
        }

        // Planar bumps
        const layout = p.layout === 'grid' ? 'grid' : 'staggered';
        const shapeKind = p.shape === 'cone' || p.shape === 'cyl' ? p.shape : 'dome';
        const size = num(p.size, 2.0);
        const pitch = num(p.pitch, 3.5);
        if (!(size >= 0.4 && isFinite(size))) throw new Error('Griffmuster: Der Noppen-Durchmesser muss mindestens 0,4 mm sein.');
        if (!(pitch > size + 0.05)) throw new Error('Griffmuster: Der Abstand muss größer als der Noppen-Durchmesser sein.');
        const r = size / 2;
        const pointInPoly2D = (pt, poly) => {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
          }
          return inside;
        };
        const distPtSeg2D = (pt, a, b) => {
          const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
          if (l2 <= 1e-12) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
          const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / l2));
          return Math.hypot(pt[0] - (a[0] + t * vx), pt[1] - (a[1] + t * vy));
        };
        const rings = [outerRot, ...holesRot];
        const fits = (pt) => {
          if (!pointInPoly2D(pt, outerRot) || holesRot.some((h) => pointInPoly2D(pt, h))) return false;
          let dm = Infinity;
          for (const ring of rings) for (let i = 0; i < ring.length; i++) dm = Math.min(dm, distPtSeg2D(pt, ring[i], ring[(i + 1) % ring.length]));
          return dm >= r + effMargin - 1e-6;
        };
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of outerRot) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
        const availW = (x1 - x0) - 2 * effMargin - size, availH = (y1 - y0) - 2 * effMargin - size;
        if (availW < -1e-4 || availH < -1e-4) throw new Error('Griffmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Noppen.');
        const dx = pitch, dy = layout === 'staggered' ? (pitch * Math.sqrt(3)) / 2 : pitch;
        const ny = Math.floor(availH / dy + 1e-6) + 1, nxMax = Math.floor(availW / dx + 1e-6) + 1;
        const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
        const centers = [];
        for (let j = 0; j < ny && centers.length < 140; j++) {
          const y = midY + (j - (ny - 1) / 2) * dy;
          const xShift = layout === 'staggered' && (j % 2 === 1) ? dx / 2 : 0;
          for (let i = -1; i <= nxMax && centers.length < 140; i++) {
            const x = midX + (i - (nxMax - 1) / 2) * dx + xShift;
            if (fits([x, y])) centers.push([x, y]);
          }
        }
        if (!centers.length) throw new Error('Griffmuster: Auf dieser Fläche ist innerhalb des Randabstands kein Platz für Noppen.');

        let masterRaw = null, masterOriented = null;
        const bumps = [];
        try {
          masterRaw = buildBumpMaster(shapeKind, r, depth, isCut, 0);
          masterOriented = applyMatrix(masterRaw, rigidMat([0, 0, 0], U, V, F.n));
          for (const c of centers) {
            const wp = Muv.P(c);
            bumps.push(masterOriented.clone().translate(wp));
          }
          const comp = bumps.length === 1 ? bumps[0] : R.makeCompound(bumps);
          const res = boolWithTopo(isCut ? 'cut' : 'fuse', baseShape, baseTopo, baseId, comp, null, stepId, 'Gp:' + stepId);
          if (comp !== bumps[0]) safeDelete(comp);
          return { shape: res.shape, topo: res.topo, meta: { kind, count: centers.length, surface: 'plane' } };
        } finally {
          safeDelete(masterRaw); safeDelete(masterOriented);
          for (const b of bumps) safeDelete(b);
        }
      } finally {
        for (const fx of fArr) safeDelete(fx);
      }
    }

    // Cylindrical face
    const F = resolveCylFaceForShaft(baseShape, baseTopo, baseId, p.face, 'Griffmuster');
    if (F.isInner) throw new Error('Griffmuster: Wähle die Außenfläche (Mantel) eines Zylinders.');
    const [z0, z1] = resolveCylAxialRange(F, p, 'Griffmuster');
    const Mloc = rigidMat(F.O, F.R0, F.T0, F.A);

    if (kind === 'grooves') {
      const dir = p.dir === 'axial' ? 'axial' : 'ring';
      const profile = p.profile === 'round' || p.profile === 'rect' ? p.profile : 'v';
      const width = num(p.width, 1.2);
      const pitch = num(p.pitch, 2.5);
      if (!(width >= 0.2 && isFinite(width))) throw new Error('Griffmuster: Die Rillenbreite muss mindestens 0,2 mm sein.');
      if (!(pitch > width + 0.05)) throw new Error('Griffmuster: Die Teilung muss größer als die Rillenbreite sein.');
      if (isCut && depth >= F.R - 0.4) throw new Error('Griffmuster: Die Rillentiefe ist zu groß für diesen Zylinderdurchmesser.');

      if (dir === 'ring') {
        const avail = (z1 - z0) - width;
        if (avail < -1e-4) throw new Error('Griffmuster: Die Länge reicht nicht für eine Ringrille.');
        const count = Math.max(1, Math.min(80, Math.floor(avail / pitch + 1e-6) + 1));
        const zMid = (z0 + z1) / 2;
        const solids = [];
        try {
          const halfW = width / 2;
          for (let j = 0; j < count; j++) {
            const zc = zMid + (j - (count - 1) / 2) * pitch;
            const rOut = isCut ? F.R + 0.5 : F.R + depth;
            const rIn = isCut ? F.R - depth : F.R - 0.15;
            const eds = [];
            if (isCut) {
              eds.push(R.makeLine([rOut, 0, zc - halfW], [rOut, 0, zc + halfW]));
              eds.push(R.makeLine([rOut, 0, zc + halfW], [F.R, 0, zc + halfW]));
              if (profile === 'v') {
                eds.push(R.makeLine([F.R, 0, zc + halfW], [rIn, 0, zc]), R.makeLine([rIn, 0, zc], [F.R, 0, zc - halfW]));
              } else if (profile === 'round') {
                eds.push(R.makeThreePointArc([F.R, 0, zc + halfW], [rIn, 0, zc], [F.R, 0, zc - halfW]));
              } else {
                eds.push(R.makeLine([F.R, 0, zc + halfW], [rIn, 0, zc + halfW]), R.makeLine([rIn, 0, zc + halfW], [rIn, 0, zc - halfW]), R.makeLine([rIn, 0, zc - halfW], [F.R, 0, zc - halfW]));
              }
              eds.push(R.makeLine([F.R, 0, zc - halfW], [rOut, 0, zc - halfW]));
            } else {
              eds.push(R.makeLine([rIn, 0, zc - halfW], [rIn, 0, zc + halfW]));
              eds.push(R.makeLine([rIn, 0, zc + halfW], [F.R, 0, zc + halfW]));
              if (profile === 'v') {
                eds.push(R.makeLine([F.R, 0, zc + halfW], [rOut, 0, zc]), R.makeLine([rOut, 0, zc], [F.R, 0, zc - halfW]));
              } else if (profile === 'round') {
                eds.push(R.makeThreePointArc([F.R, 0, zc + halfW], [rOut, 0, zc], [F.R, 0, zc - halfW]));
              } else {
                eds.push(R.makeLine([F.R, 0, zc + halfW], [rOut, 0, zc + halfW]), R.makeLine([rOut, 0, zc + halfW], [rOut, 0, zc - halfW]), R.makeLine([rOut, 0, zc - halfW], [F.R, 0, zc - halfW]));
              }
              eds.push(R.makeLine([F.R, 0, zc - halfW], [rIn, 0, zc - halfW]));
            }
            const wr = R.assembleWire(eds); eds.forEach(safeDelete);
            const fc = R.makeFace(wr); safeDelete(wr);
            let sr = R.revolution(fc, [0, 0, 0], [0, 0, 1], 360);
            safeDelete(fc);
            if (R.measureVolume(sr) < 0) sr = R.cast(sr.wrapped.Reversed());
            solids.push(sr);
          }
          const comp = solids.length === 1 ? solids[0] : R.makeCompound(solids);
          const tool = applyMatrix(comp, Mloc);
          if (comp !== solids[0]) safeDelete(comp);
          try {
            const res = boolWithTopo(isCut ? 'cut' : 'fuse', baseShape, baseTopo, baseId, tool, null, stepId, 'Gp:' + stepId);
            return { shape: res.shape, topo: res.topo, meta: { kind, count, surface: 'cyl' } };
          } finally { safeDelete(tool); }
        } finally {
          for (const s of solids) safeDelete(s);
        }
      }

      // Axial grooves on cylinder
      const nCols = Math.max(4, Math.min(72, Math.round((2 * Math.PI * F.R) / pitch)));
      const halfW = width / 2;
      if (halfW >= F.R * 0.6) throw new Error('Griffmuster: Die Rillenbreite ist zu groß für diesen Zylinderdurchmesser.');
      const sag = F.R - Math.sqrt(Math.max(0.01, F.R * F.R - halfW * halfW));
      const xRef = isCut ? F.R + 0.5 : F.R - sag - 0.15;
      const xApex = isCut ? F.R - depth : F.R + depth;
      const xBase = isCut ? F.R : F.R - sag;
      const eds = [
        R.makeLine([xRef, -halfW, z0], [xRef, halfW, z0]),
        R.makeLine([xRef, halfW, z0], [xBase, halfW, z0]),
      ];
      if (profile === 'v') {
        eds.push(R.makeLine([xBase, halfW, z0], [xApex, 0, z0]), R.makeLine([xApex, 0, z0], [xBase, -halfW, z0]));
      } else if (profile === 'round') {
        eds.push(R.makeThreePointArc([xBase, halfW, z0], [xApex, 0, z0], [xBase, -halfW, z0]));
      } else {
        eds.push(R.makeLine([xBase, halfW, z0], [xApex, halfW, z0]), R.makeLine([xApex, halfW, z0], [xApex, -halfW, z0]), R.makeLine([xApex, -halfW, z0], [xBase, -halfW, z0]));
      }
      eds.push(R.makeLine([xBase, -halfW, z0], [xRef, -halfW, z0]));
      let master = null, tool = null;
      const solids = [];
      try {
        const wr = R.assembleWire(eds); eds.forEach(safeDelete);
        const fc = R.makeFace(wr); safeDelete(wr);
        master = R.basicFaceExtrusion(fc, new R.Vector([0, 0, z1 - z0]));
        safeDelete(fc);
        if (R.measureVolume(master) < 0) master = R.cast(master.wrapped.Reversed());
        for (let k = 0; k < nCols; k++) {
          const ang = (360 * k) / nCols;
          solids.push(ang === 0 ? master.clone() : master.clone().rotate(ang, [0, 0, 0], [0, 0, 1]));
        }
        const comp = R.makeCompound(solids);
        tool = applyMatrix(comp, Mloc);
        safeDelete(comp);
        const res = boolWithTopo(isCut ? 'cut' : 'fuse', baseShape, baseTopo, baseId, tool, null, stepId, 'Gp:' + stepId);
        return { shape: res.shape, topo: res.topo, meta: { kind, count: nCols, surface: 'cyl' } };
      } finally {
        eds.forEach(safeDelete);
        safeDelete(master); safeDelete(tool);
        for (const s of solids) safeDelete(s);
      }
    }

    // Cylindrical bumps
    const layout = p.layout === 'grid' ? 'grid' : 'staggered';
    const shapeKind = p.shape === 'cone' || p.shape === 'cyl' ? p.shape : 'dome';
    const size = num(p.size, 2.0);
    const pitch = num(p.pitch, 4.0);
    if (!(size >= 0.4 && isFinite(size))) throw new Error('Griffmuster: Der Noppen-Durchmesser muss mindestens 0,4 mm sein.');
    if (!(pitch > size + 0.05)) throw new Error('Griffmuster: Der Abstand muss größer als der Noppen-Durchmesser sein.');
    const r = size / 2;
    if (r >= F.R * 0.45) throw new Error('Griffmuster: Der Noppen-Durchmesser ist zu groß für diesen Zylinder.');

    const nCols = Math.max(4, Math.min(36, Math.round((2 * Math.PI * F.R) / pitch)));
    const dy = layout === 'staggered' ? (pitch * Math.sqrt(3)) / 2 : pitch;
    const availZ = (z1 - z0) - size;
    if (availZ < -1e-4) throw new Error('Griffmuster: Die Länge reicht nicht für Noppen auf diesem Zylinder.');
    const nRows = Math.max(1, Math.floor(availZ / dy + 1e-6) + 1);
    if (nCols * nRows > 120) {
      throw new Error('Griffmuster: Zu viele Noppen für diese Fläche – vergrößere den Mittenabstand oder verkürze die Länge.');
    }

    const sag = F.R - Math.sqrt(Math.max(0.01, F.R * F.R - r * r));
    let master = null, tool = null;
    const bumps = [];
    try {
      master = buildBumpMaster(shapeKind, r, depth, isCut, sag);
      const zMid = (z0 + z1) / 2;
      for (let row = 0; row < nRows; row++) {
        const zR = zMid + (row - (nRows - 1) / 2) * dy;
        const off = layout === 'staggered' && (row & 1) ? (Math.PI / nCols) : 0;
        for (let col = 0; col < nCols; col++) {
          const ang = (2 * Math.PI * col) / nCols + off;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const trsf = new oc.gp_Trsf();
          trsf.SetValues(-sa, 0, ca, F.R * ca, ca, 0, sa, F.R * sa, 0, 1, 0, zR);
          const tr = new oc.BRepBuilderAPI_Transform(master.wrapped, trsf, true, false);
          bumps.push(R.cast(tr.ModifiedShape(master.wrapped)));
          tr.delete(); trsf.delete();
        }
      }
      const comp = bumps.length === 1 ? bumps[0] : R.makeCompound(bumps);
      tool = applyMatrix(comp, Mloc);
      if (comp !== bumps[0]) safeDelete(comp);
      const res = boolWithTopo(isCut ? 'cut' : 'fuse', baseShape, baseTopo, baseId, tool, null, stepId, 'Gp:' + stepId);
      return { shape: res.shape, topo: res.topo, meta: { kind, count: bumps.length, surface: 'cyl' } };
    } finally {
      safeDelete(master); safeDelete(tool);
      for (const b of bumps) safeDelete(b);
    }
  }

  function projBoxRange(wb, o, d) {
    if (!wb || wb.length < 6) return [Infinity, -Infinity];
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 8; k++) {
      const px = (k & 1 ? wb[3] : wb[0]) - o[0];
      const py = (k & 2 ? wb[4] : wb[1]) - o[1];
      const pz = (k & 4 ? wb[5] : wb[2]) - o[2];
      const t = px * d[0] + py * d[1] + pz * d[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return [lo, hi];
  }
  function rayHitsBoxPad(o, d, pad, wb) {
    if (!wb || wb.length < 6) return false;
    let tMin = -Infinity, tMax = Infinity;
    for (let k = 0; k < 3; k++) {
      const b0 = wb[k] - pad, b1 = wb[k + 3] + pad;
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < b0 || o[k] > b1) return false;
      } else {
        let t0 = (b0 - o[k]) / d[k], t1 = (b1 - o[k]) / d[k];
        if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
        if (t0 > tMin) tMin = t0;
        if (t1 < tMax) tMax = t1;
        if (tMin > tMax) return false;
      }
    }
    return true;
  }
  function bboxOverlapStrict(a, b, eps = 1e-4) {
    if (!a || !b) return false;
    return a[0] < b[3] - eps && a[3] > b[0] + eps && a[1] < b[4] - eps && a[4] > b[1] + eps && a[2] < b[5] - eps && a[5] > b[2] + eps;
  }
  function drillFrameMatrix(o, d) {
    const z = norm([-d[0], -d[1], -d[2]]);
    const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const x = norm(cross(ref, z));
    const y = norm(cross(z, x));
    return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
  }
  function stackHoleMaxRadius(p) {
    const pf = Math.max(0, printFitDelta(p.printFit));
    if (p.holeType === 'through') {
      const s = p.spec && typeof p.spec === 'object' ? { ...(SCREW[p.size] || SCREW.M3), ...p.spec } : (SCREW[p.size] || SCREW.M3);
      const hd = holeD(s, p.fit);
      const dMax = Math.max(hd, p.head === 'countersunk' ? (s.csk || 0) : 0, p.head === 'counterbore' ? (s.cbD || 0) : 0);
      return (dMax + pf) / 2;
    }
    return (pos(p.d, 6) + pf) / 2;
  }
  function buildStackHoleWorldTool(p, minT, maxT) {
    const o = [num(p.x, 0), num(p.y, 0), num(p.z, 0)];
    const rawD = Array.isArray(p.dir) && p.dir.length >= 3 ? p.dir.map(Number) : [0, 0, -1];
    const dLen = Math.hypot(rawD[0] || 0, rawD[1] || 0, rawD[2] || 0);
    const d = dLen > 1e-6 ? [rawD[0] / dLen, rawD[1] / dLen, rawD[2] / dLen] : [0, 0, -1];
    const pf = printFitDelta(p.printFit);
    const LIFT = 0.2;
    const ht = p.holeType || 'simple';
    const isThroughAll = p.thru !== false && ht !== 'blind';
    const hasHead = ht === 'through' && (p.head === 'countersunk' || p.head === 'counterbore');
    const topExt = isThroughAll ? (hasHead ? LIFT : Math.max(LIFT, Number.isFinite(minT) ? -minT + 2 : LIFT)) : LIFT;
    const botDepth = isThroughAll ? Math.max(pos(p.depth, 10), Number.isFinite(maxT) ? maxT + 2 : 20) : pos(p.depth, 10);
    let local = null;
    if (ht === 'through') {
      const s = p.spec && typeof p.spec === 'object' ? { ...(SCREW[p.size] || SCREW.M3), ...p.spec } : (SCREW[p.size] || SCREW.M3);
      const hd = holeD(s, p.fit);
      const r = Math.max(0.1, (hd + pf) / 2);
      local = R.makeCylinder(r, botDepth + topExt, [0, 0, -botDepth], [0, 0, 1]);
      if (p.head === 'countersunk' && s.csk > hd) {
        const rTop = (s.csk + pf) / 2;
        const halfAng = (num(s.cskAngle, 90) * Math.PI) / 360;
        const h = (rTop - r) / Math.tan(halfAng);
        const cone = revolveProfile([[0, -h], [r, -h], [rTop, 0], [rTop, topExt], [0, topExt]]);
        const fused = local.fuse(cone);
        safeDelete(cone);
        safeDelete(local);
        local = fused;
      } else if (p.head === 'counterbore' && s.cbD > hd && s.cbH > 0) {
        const cb = R.makeCylinder((s.cbD + pf) / 2, s.cbH + topExt, [0, 0, -s.cbH], [0, 0, 1]);
        const fused = local.fuse(cb);
        safeDelete(cb);
        safeDelete(local);
        local = fused;
      }
    } else if (ht === 'blind') {
      const r = Math.max(0.1, (pos(p.d, 5) + pf) / 2);
      const ang = num(p.tipAngle, 118);
      if (ang > 1 && ang < 179.5) {
        const tipH = r / Math.tan((ang * Math.PI) / 360);
        local = revolveProfile([[0, -(botDepth + tipH)], [r, -botDepth], [r, topExt], [0, topExt]]);
      } else {
        local = R.makeCylinder(r, botDepth + topExt, [0, 0, -botDepth], [0, 0, 1]);
      }
    } else {
      const r = Math.max(0.1, (pos(p.d, 6) + pf) / 2);
      local = R.makeCylinder(r, botDepth + topExt, [0, 0, -botDepth], [0, 0, 1]);
    }
    const M = drillFrameMatrix(o, d);
    const world = applyMatrix(local, M);
    safeDelete(local);
    return world;
  }
  function buildAsmCutWorldTool(it, p, minT, maxT) {
    if (!Array.isArray(p.regions) || !p.regions.length) {
      throw new Error('Baugruppen-Schnitt: Die Skizze hat keine geschlossene Fläche.');
    }
    let extP;
    if (p.thru !== false) {
      const dir = p.dir || 'reverse';
      if (dir === 'normal') {
        extP = { ...p, dir: 'normal', dist: Math.max(pos(p.dist, 10), Number.isFinite(maxT) ? maxT + 2 : 50), extra: 0.2 };
      } else if (dir === 'reverse') {
        extP = { ...p, dir: 'reverse', dist: Math.max(pos(p.dist, 10), Number.isFinite(minT) ? -minT + 2 : 50), extra: 0.2 };
      } else {
        extP = { ...p, dir: 'two', dist: Math.max(1, Number.isFinite(maxT) ? maxT + 2 : 50), dist2: Math.max(1, Number.isFinite(minT) ? -minT + 2 : 50), extra: 0 };
      }
    } else {
      extP = { ...p, extra: 0.2 };
    }
    const local = buildExtrude(extP);
    if (isIdentity(it.m)) return local;
    const world = applyMatrix(local, it.m);
    safeDelete(local);
    return world;
  }

  // ---------- Szene ----------
  // scene = { items: [ { id, kind, role, p, m (Weltmatrix), hidden, children, finishes } ] }
  // known = { id: resultKey } (was die Anzeige schon hat)
  // Formschritte mit Modus: Ein Teil mit op = {type: 'join' | 'cut' | 'common', target} wird mit einem früheren
  // Körper verrechnet und verschwindet als eigenes Teil. Ketten (B in A, C in B) landen alle im ersten Körper.
  // Ergebnis: bodies (id → {shape, key, wb} im Koordinatensystem des Zielkörpers), consumed (id → Ziel-id)
  function resolveOps(evald, errors, hiddenIds, resolved = null, track = null) {
    const byId = new Map(evald.map((e, i) => [e.it.id, { e, i }]));
    const consumed = new Map(), live = new Map(), bodies = new Map(), featureOps = new Map(), wrapWires = new Map();
    const anyMirror = evald.some((e) => e.it.kind === 'mirrorStep');
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const ID_MAT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const e of evald) if (e.shape) live.set(e.it.id, { shape: e.shape, topo: e.topo || null, key: e.key, wb: e.wb, m: e.it.m, it: e.it });
    const NAMES = { join: 'Vereinigen', cut: 'Abziehen', common: 'Schnittmenge' };
    for (let i = 0; i < evald.length; i++) {
      const e = evald[i], it = e.it;
      if (it.kind === 'sketch3d') {
        if (track && track.stepKeys) track.stepKeys.set(it.id, e.key);
        continue;
      }
      if (it.kind === 'deleteBody') {
        const p = it.p || {};
        const targets = Array.isArray(p.targets) ? p.targets.filter(Boolean) : (p.target ? [p.target] : []);
        if (!targets.length) {
          errors.push({ itemId: it.id, code: 'op', message: 'Körper löschen: Kein Zielkörper gewählt.' });
          continue;
        }
        const delKeys = [];
        for (const rawTid of targets) {
          let tid = rawTid;
          while (tid && consumed.has(tid)) tid = consumed.get(tid);
          const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
          if (!t || t.i >= i || !src || !src.shape) {
            if (tid && hiddenIds && hiddenIds.has(tid)) { delKeys.push(tid); continue; }
            errors.push({ itemId: it.id, code: 'op', message: 'Körper löschen: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
            continue;
          }
          live.delete(tid);
          const kDel = keyOf([src.key, 'deletedBy', it.id]);
          bodies.set(tid, { shape: null, topo: null, key: kDel, wb: null, deletedBy: it.id });
          delKeys.push(kDel);
        }
        if (track && track.stepKeys) track.stepKeys.set(it.id, keyOf(['deleteBody', delKeys]));
        continue;
      }
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
            if (track) track.rebuilt.add(it.id);
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
              if (track) track.rebuilt.add(it.id);
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
          if (track && track.stepKeys) track.stepKeys.set(it.id, key);
        } else {
          consumed.set(it.id, tid);
          const rel = matMul(matInvRigid(src.m), matMul(M, src.m));
          if (!isIdentity(rel)) {
            const k = keyOf([src.key, 'xform', rel.map((v) => Math.round(v * 1e6) / 1e6)]);
            const ce = cacheEntry(k);
            let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
            if (!next) {
              if (track) track.rebuilt.add(it.id);
              try {
                const tr = applyMatrixWithTopo(src.shape, rel, src.topo, src.it.id);
                next = tr.shape; nextTopo = tr.topo;
                cachePut(k, next, null, null, null, nextTopo);
              } catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
            }
            src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
            bodies.set(tid, src);
            if (track && track.stepKeys) track.stepKeys.set(it.id, k);
          } else if (track && track.stepKeys) {
            track.stepKeys.set(it.id, keyOf([src.key, 'xform', 'id']));
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
            if (track) track.rebuilt.add(it.id);
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
          if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        } else if (track && track.stepKeys) {
          track.stepKeys.set(it.id, keyOf([src.key, 'scale', 1]));
        }
        continue;
      }
      if (it.kind === 'deform') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape) {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Verformen: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        const mode = p.mode === 'twist' || p.mode === 'taper' ? p.mode : 'bend';
        const axis = p.axis === 'x' || p.axis === 'y' ? p.axis : 'z';
        const bendAxis = (p.bendAxis === 'x' || p.bendAxis === 'y' || p.bendAxis === 'z') && p.bendAxis !== axis ? p.bendAxis : (axis === 'y' ? 'x' : 'y');
        const angle = num(p.angle, 90);
        const factor = num(p.factor, 0.5);
        const anchor = p.anchor === 'start' || p.anchor === 'end' || p.anchor === 'center' ? p.anchor : '';
        const flip = !!p.flip;
        consumed.set(it.id, tid);
        const isNoop = (mode === 'taper' && Math.abs(factor - 1) < 1e-6) || (mode !== 'taper' && Math.abs(angle) < 1e-6);
        if (!isNoop) {
          const r6 = (v) => Math.round(v * 1e6) / 1e6;
          const k = keyOf([src.key, 'deform', mode, axis, bendAxis, r6(angle), r6(factor), anchor, flip ? 1 : 0, src.m.map(r6)]);
          const ce = cacheEntry(k);
          let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
          if (!next) {
            if (track) track.rebuilt.add(it.id);
            try {
              const idM = isIdentity(src.m);
              const wShape = idM ? src.shape : applyMatrix(src.shape, src.m);
              const wDeformed = applyDeform(wShape, { mode, axis, bendAxis, angle, factor, anchor, flip }, bboxOf(wShape));
              if (!idM) safeDelete(wShape);
              if (idM) {
                next = wDeformed;
              } else {
                next = applyMatrix(wDeformed, matInvRigid(src.m));
                safeDelete(wDeformed);
              }
              nextTopo = ensureTopoComplete(next, createTopoMap(), src.it.id);
              cachePut(k, next, null, null, null, nextTopo);
            } catch (err) {
              errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
              continue;
            }
          }
          src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
          bodies.set(tid, src);
          if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        } else if (track && track.stepKeys) {
          track.stepKeys.set(it.id, keyOf([src.key, 'deform', 'id']));
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
            if (track) track.rebuilt.add(it.id);
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
              if (track) track.rebuilt.add(it.id);
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
          if (track && track.stepKeys) track.stepKeys.set(it.id, key);
        } else {
          consumed.set(it.id, tid);
          const prevShape = src.shape, prevKey = src.key;
          const k = keyOf([src.key, 'thicken', mode, p.face, Math.round(dist * 1e6) / 1e6, dir]);
          const kPlate = keyOf([prevKey, 'thickenPlate', p.face, r6(dist), dir, mode]);
          const ce = cacheEntry(k);
          let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
          let plate = anyMirror ? cacheGet(kPlate) : null;
          if (!next) {
            if (track) track.rebuilt.add(it.id);
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
          if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
          if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'vent' || it.kind === 'fins') {
        const isVent = it.kind === 'vent';
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: `${isVent ? 'Lüftungsgitter' : 'Kühlrippen'}: Der Zielkörper fehlt oder kommt erst später im Verlauf.` });
          continue;
        }
        if (!p.face || !Array.isArray(p.face.c)) {
          consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'edges', message: `${isVent ? 'Lüftungsgitter' : 'Kühlrippen'}: Es ist keine Fläche gewählt.` });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, it.kind, p]);
        const kTool = keyOf([src.key, it.kind + 'Tool', p]);
        const ce = cacheEntry(k);
        let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
        let tool = anyMirror ? cacheGet(kTool) : null;
        if (!next || (anyMirror && !tool)) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = isVent ? buildVentOn(src.shape, p, src.topo, src.it.id) : buildFinsOn(src.shape, p, src.topo, src.it.id);
            tool = built.tool;
            if (!next) {
              const toolTopo = ensureTopoComplete(tool, createTopoMap(), it.id);
              const br = boolWithTopo(isVent ? 'cut' : 'fuse', src.shape, src.topo, src.it.id, tool, toolTopo, it.id, (isVent ? 'Vt:' : 'Fn:') + it.id);
              next = br.shape; nextTopo = br.topo;
              freeTopoMap(toolTopo);
              cachePut(k, next, null, null, null, nextTopo);
            }
            if (anyMirror) cachePut(kTool, tool);
            else safeDelete(tool);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (anyMirror && tool) featureOps.set(it.id, { targetId: tid, opType: isVent ? 'cut' : 'join', tools: [{ shape: tool, m: src.m, key: kTool }] });
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'fillPattern') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Füllmuster: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        if (!p.face || !Array.isArray(p.face.c)) {
          consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'edges', message: 'Füllmuster: Es ist keine Fläche gewählt.' });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, 'fillPattern', p]);
        const kTool = keyOf([src.key, 'fillPatternTool', p]);
        const ce = cacheEntry(k);
        let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
        let resMeta = ce ? ce.resolved : null;
        let tool = anyMirror ? cacheGet(kTool) : null;
        if (!next || (anyMirror && !tool)) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = buildFillPatternOn(src.shape, p, src.topo, src.it.id);
            tool = built.tool;
            resMeta = { count: built.count, kind: built.kind };
            if (!next) {
              const toolTopo = ensureTopoComplete(tool, createTopoMap(), it.id);
              const br = boolWithTopo('cut', src.shape, src.topo, src.it.id, tool, toolTopo, it.id, 'Fp:' + it.id);
              next = br.shape; nextTopo = br.topo;
              freeTopoMap(toolTopo);
              cachePut(k, next, null, resMeta, null, nextTopo);
            }
            if (anyMirror) cachePut(kTool, tool);
            else safeDelete(tool);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (resolved && resMeta) resolved[it.id] = resMeta;
        if (anyMirror && tool) featureOps.set(it.id, { targetId: tid, opType: 'cut', tools: [{ shape: tool, m: src.m, key: kTool }] });
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'mountPattern') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Lochbild: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        if (!p.face || !Array.isArray(p.face.c)) {
          consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'edges', message: 'Lochbild: Es ist keine Fläche gewählt.' });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, 'mountPattern', p]);
        const kTool = keyOf([src.key, 'mountPatternTool', p]);
        const ce = cacheEntry(k);
        let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
        let resMeta = ce ? ce.resolved : null;
        let tool = anyMirror ? cacheGet(kTool) : null;
        if (!next || (anyMirror && !tool)) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = buildMountPatternOn(src.shape, p, src.topo, src.it.id);
            tool = built.tool;
            resMeta = { holeCount: built.holeCount, hasCenter: built.hasCenter, preset: built.preset };
            if (!next) {
              const toolTopo = ensureTopoComplete(tool, createTopoMap(), it.id);
              const br = boolWithTopo('cut', src.shape, src.topo, src.it.id, tool, toolTopo, it.id, 'Mp:' + it.id);
              next = br.shape; nextTopo = br.topo;
              freeTopoMap(toolTopo);
              cachePut(k, next, null, resMeta, null, nextTopo);
            }
            if (anyMirror) cachePut(kTool, tool);
            else safeDelete(tool);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (resolved && resMeta) resolved[it.id] = resMeta;
        if (anyMirror && tool) featureOps.set(it.id, { targetId: tid, opType: 'cut', tools: [{ shape: tool, m: src.m, key: kTool }] });
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'web') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Steg-Netz: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const prevShape = src.shape, prevKey = src.key;
        const rel = matMul(matInvRigid(src.m), it.m);
        const k = keyOf([src.key, 'web', p, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
        const ceW = cacheEntry(k);
        let next = ceW ? ceW.shape : null, nextTopo = ceW ? ceW.topo : null;
        if (!next) {
          if (track) track.rebuilt.add(it.id);
          try { next = buildWebOn(src.shape, rel, p); nextTopo = ensureTopoComplete(next, createTopoMap(), tid); cachePut(k, next, null, null, null, nextTopo); }
          catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
        }
        if (anyMirror) {
          const kDelta = keyOf([k, 'webDelta', prevKey]);
          let delta = cacheGet(kDelta);
          if (!delta) {
            try { delta = next.cut(prevShape); cachePut(kDelta, delta); } catch (_) { delta = null; }
          }
          if (delta) featureOps.set(it.id, { targetId: tid, opType: 'join', tools: [{ shape: delta, m: src.m, key: kDelta }] });
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
          if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
          if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'splitFace') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Fläche teilen: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const rel = matMul(matInvRigid(src.m), it.m);
        const k = keyOf([src.key, 'splitFace', p, rel.map((v) => Math.round(v * 1e6) / 1e6)]);
        const ceS = cacheEntry(k);
        let next = ceS ? ceS.shape : null, nextTopo = ceS ? ceS.topo : null;
        if (!next) {
          if (track) track.rebuilt.add(it.id);
          try { next = buildSplitFaceOn(src.shape, rel, p); nextTopo = ensureTopoComplete(next, createTopoMap(), tid); cachePut(k, next, null, null, null, nextTopo); }
          catch (err) { errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) }); continue; }
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'dome') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Kuppel: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        if (!p.face || !Array.isArray(p.face.c)) {
          consumed.set(it.id, tid);
          errors.push({ itemId: it.id, code: 'edges', message: 'Kuppel: Es ist keine Fläche gewählt.' });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, 'dome', p]);
        const kTool = keyOf([src.key, 'domeTool', p]);
        const ceD = cacheEntry(k);
        let next = ceD ? ceD.shape : null, nextTopo = ceD ? ceD.topo : null;
        let tool = anyMirror ? cacheGet(kTool) : null;
        const opType = p.flip ? 'cut' : 'join';
        if (!next || (anyMirror && !tool)) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = buildDomeOn(src.shape, p, src.topo, src.it.id);
            tool = built.tool;
            if (!next) {
              const toolTopo = ensureTopoComplete(tool, createTopoMap(), it.id);
              const br = boolWithTopo(built.op, src.shape, src.topo, src.it.id, tool, toolTopo, it.id, 'Dm:' + it.id);
              next = br.shape; nextTopo = br.topo;
              freeTopoMap(toolTopo);
              cachePut(k, next, null, null, null, nextTopo);
            }
            if (anyMirror) cachePut(kTool, tool);
            else safeDelete(tool);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (anyMirror && tool) featureOps.set(it.id, { targetId: tid, opType, tools: [{ shape: tool, m: src.m, key: kTool }] });
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'boss') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          errors.push({ itemId: it.id, code: 'op', message: 'Schraubdom: Der Zielkörper fehlt oder kommt erst später im Verlauf.' });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, 'boss', p]);
        const ceB = cacheEntry(k);
        let next = ceB ? ceB.shape : null, nextTopo = ceB ? ceB.topo : null;
        if (!next) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = buildBossOn(src.shape, src.topo, src.it.id, it.id, p);
            next = built.shape; nextTopo = built.topo;
            cachePut(k, next, null, null, null, nextTopo);
          } catch (err) {
            errors.push({ itemId: it.id, code: err && err.code === 'edges' ? 'edges' : 'build', message: friendlyError(err) });
            continue;
          }
        }
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (it.kind === 'lipGroove') {
        const p = it.p || {};
        let tidA = p.lipTarget, tidB = p.grooveTarget;
        while (tidA && consumed.has(tidA)) tidA = consumed.get(tidA);
        while (tidB && consumed.has(tidB)) tidB = consumed.get(tidB);
        const tA = tidA ? byId.get(tidA) : null, srcA = tidA ? live.get(tidA) : null;
        const tB = tidB ? byId.get(tidB) : null, srcB = tidB ? live.get(tidB) : null;
        if (!tA || tA.i >= i || !srcA || !srcA.shape || srcA.it.role === 'hole' || !tB || tB.i >= i || !srcB || !srcB.shape || srcB.it.role === 'hole' || tidA === tidB) {
          errors.push({ itemId: it.id, code: 'op', message: 'Lippe und Nut: Beide Gehäusehälften müssen vor diesem Schritt vorhanden und verschieden sein.' });
          continue;
        }
        consumed.set(it.id, tidA);
        const relAB = matMul(matInvRigid(srcB.m), srcA.m);
        const relKey = relAB.map(r6);
        const kA = keyOf([srcA.key, srcB.key, 'lipA', p, relKey]);
        const kB = keyOf([srcA.key, srcB.key, 'grooveB', p, relKey]);
        const ceA = cacheEntry(kA), ceB = cacheEntry(kB);
        let nextA = ceA ? ceA.shape : null, topoA = ceA ? ceA.topo : null;
        let nextB = ceB ? ceB.shape : null, topoB = ceB ? ceB.topo : null;
        if (!nextA || !nextB) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = buildLipGrooveOn(srcA, srcB, relAB, it.id, p);
            nextA = built.shapeA; topoA = built.topoA;
            nextB = built.shapeB; topoB = built.topoB;
            cachePut(kA, nextA, null, null, null, topoA);
            cachePut(kB, nextB, null, null, null, topoB);
          } catch (err) {
            errors.push({ itemId: it.id, code: err && err.code === 'edges' ? 'edges' : 'build', message: friendlyError(err) });
            continue;
          }
        }
        srcA.shape = nextA; srcA.topo = topoA; srcA.key = kA; srcA.wb = bboxTransform(bboxCached(kA, nextA), srcA.m);
        srcB.shape = nextB; srcB.topo = topoB; srcB.key = kB; srcB.wb = bboxTransform(bboxCached(kB, nextB), srcB.m);
        bodies.set(tidA, srcA);
        bodies.set(tidB, srcB);
        if (track && track.stepKeys) track.stepKeys.set(it.id, keyOf(['lipGroove', kA, kB]));
        continue;
      }
      if (it.kind === 'stackHole' || it.kind === 'asmCut') {
        const p = it.p || {};
        const isHole = it.kind === 'stackHole';
        const candidates = [];
        const seenTids = new Set();
        let anyHidden = false;
        if (p.scope === 'selected') {
          for (const rawTid of Array.isArray(p.targets) ? p.targets : []) {
            let tid = rawTid;
            while (tid && consumed.has(tid)) tid = consumed.get(tid);
            if (!tid || seenTids.has(tid)) continue;
            seenTids.add(tid);
            const t = byId.get(tid), src = live.get(tid);
            if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
              if (hiddenIds && hiddenIds.has(tid)) anyHidden = true;
              continue;
            }
            candidates.push({ tid, src });
          }
          if (!candidates.length) {
            if (!anyHidden) errors.push({ itemId: it.id, code: 'op', message: isHole ? 'Bohrung durch Stapel: Wähle mindestens ein Zielteil vor diesem Schritt.' : 'Baugruppen-Schnitt: Wähle mindestens ein Zielteil vor diesem Schritt.' });
            continue;
          }
        } else {
          for (let k = 0; k < i; k++) {
            const eid = evald[k].it.id;
            if (consumed.has(eid)) continue;
            const src = live.get(eid);
            if (!src || !src.shape || src.it.role === 'hole') continue;
            candidates.push({ tid: eid, src });
          }
          if (!candidates.length) {
            errors.push({ itemId: it.id, code: 'op', message: isHole ? 'Bohrung durch Stapel: Keine Teile vor diesem Schritt vorhanden.' : 'Baugruppen-Schnitt: Keine Teile vor diesem Schritt vorhanden.' });
            continue;
          }
        }
        let minT = Infinity, maxT = -Infinity;
        if (isHole) {
          const o = [num(p.x, 0), num(p.y, 0), num(p.z, 0)];
          const rawD = Array.isArray(p.dir) && p.dir.length >= 3 ? p.dir.map(Number) : [0, 0, -1];
          const dLen = Math.hypot(rawD[0] || 0, rawD[1] || 0, rawD[2] || 0);
          const d = dLen > 1e-6 ? [rawD[0] / dLen, rawD[1] / dLen, rawD[2] / dLen] : [0, 0, -1];
          const rMax = stackHoleMaxRadius(p);
          const hitCands = p.scope === 'selected' ? candidates : candidates.filter((c) => rayHitsBoxPad(o, d, rMax + 1, c.src.wb));
          const spanList = hitCands.length ? hitCands : candidates;
          for (const c of spanList) {
            const [lo, hi] = projBoxRange(c.src.wb, o, d);
            if (lo < minT) minT = lo;
            if (hi > maxT) maxT = hi;
          }
        } else {
          const pl = p.plane || { o: [0, 0, 0], n: [0, 0, 1] };
          const oW = transformPoint(it.m, pl.o || [0, 0, 0]);
          const nW = norm(transformDir(it.m, pl.n || [0, 0, 1]));
          for (const c of candidates) {
            const [lo, hi] = projBoxRange(c.src.wb, oW, nW);
            if (lo < minT) minT = lo;
            if (hi > maxT) maxT = hi;
          }
        }
        const spanKey = p.thru !== false ? [Number.isFinite(minT) ? r6(minT) : 0, Number.isFinite(maxT) ? r6(maxT) : 0] : null;
        const toolKey = keyOf([it.kind, 'tool', p, it.m.map(r6), spanKey]);
        let toolCe = cacheEntry(toolKey);
        let toolWorld = toolCe ? toolCe.shape : null;
        if (!toolWorld) {
          if (track) track.rebuilt.add(it.id);
          try {
            toolWorld = isHole ? buildStackHoleWorldTool(p, minT, maxT) : buildAsmCutWorldTool(it, p, minT, maxT);
            cachePut(toolKey, toolWorld);
          } catch (err) {
            errors.push({ itemId: it.id, code: 'build', message: friendlyError(err) });
            continue;
          }
        }
        const toolWB = bboxCached(toolKey, toolWorld);
        const cutIds = [], cutKeys = [];
        let cutFailed = null;
        for (const c of candidates) {
          if (!bboxOverlapStrict(toolWB, c.src.wb, 1e-4)) continue;
          const kCut = keyOf([c.src.key, it.kind, toolKey, c.src.m.map(r6)]);
          const ce = cacheEntry(kCut);
          let next = ce ? ce.shape : null, nextTopo = ce ? ce.topo : null;
          let hitMeta = ce ? ce.resolved : null;
          if (!next) {
            if (track) track.rebuilt.add(it.id);
            try {
              const idS = isIdentity(c.src.m);
              const locTool = idS ? toolWorld : applyMatrix(toolWorld, matInvRigid(c.src.m));
              let volBefore = null;
              try { volBefore = R.measureVolume(c.src.shape); } catch (_) {}
              const br = boolWithTopo('cut', c.src.shape, c.src.topo, c.src.it.id, locTool, null, it.id, (isHole ? 'SH:' : 'AC:') + it.id);
              if (!idS) safeDelete(locTool);
              let volAfter = null;
              try { volAfter = R.measureVolume(br.shape); } catch (_) {}
              const didCut = volBefore == null || volAfter == null || Math.abs(volBefore - volAfter) > 1e-4;
              next = br.shape; nextTopo = br.topo;
              hitMeta = { hit: didCut };
              cachePut(kCut, next, null, hitMeta, null, nextTopo);
            } catch (err) {
              cutFailed = err;
              continue;
            }
          }
          if (hitMeta && hitMeta.hit === false) continue;
          c.src.shape = next; c.src.topo = nextTopo; c.src.key = kCut; c.src.wb = bboxTransform(bboxCached(kCut, next), c.src.m);
          bodies.set(c.tid, c.src);
          cutIds.push(c.tid);
          cutKeys.push(kCut);
        }
        if (cutIds.length) consumed.set(it.id, cutIds[0]);
        else if (p.scope === 'selected' && candidates.length) consumed.set(it.id, candidates[0].tid);
        if (resolved) resolved[it.id] = { cutIds, count: cutIds.length, toolBox: toolWB };
        if (!cutIds.length) {
          errors.push({ itemId: it.id, code: cutFailed ? 'build' : 'op', message: cutFailed ? friendlyError(cutFailed) : (isHole ? 'Bohrung durch Stapel trifft kein Zielteil – prüfe Lage, Richtung oder Tiefe.' : 'Baugruppen-Schnitt trifft kein Zielteil – prüfe Skizze, Richtung oder Tiefe.') });
        }
        if (track && track.stepKeys) track.stepKeys.set(it.id, keyOf([it.kind, toolKey, cutKeys]));
        continue;
      }
      if (it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern') {
        const p = it.p || {};
        let tid = p.target;
        while (tid && consumed.has(tid)) tid = consumed.get(tid);
        const t = tid ? byId.get(tid) : null, src = tid ? live.get(tid) : null;
        if (!t || t.i >= i || !src || !src.shape || src.it.role === 'hole') {
          if (tid && hiddenIds && hiddenIds.has(tid)) { consumed.set(it.id, tid); continue; }
          const nm = it.kind === 'undercut' ? 'Freistich' : it.kind === 'circlipGroove' ? 'Einstich' : it.kind === 'keyway' ? 'Passfeder-Nut' : it.kind === 'splineProfile' ? 'Keilwellen-Profil' : it.kind === 'knurl' ? 'Rändel' : 'Griffmuster';
          errors.push({ itemId: it.id, code: 'op', message: `${nm}: Der Zielkörper fehlt oder kommt erst später im Verlauf.` });
          continue;
        }
        consumed.set(it.id, tid);
        const k = keyOf([src.key, it.kind, p]);
        const ceS = cacheEntry(k);
        let next = ceS ? ceS.shape : null, nextTopo = ceS ? ceS.topo : null;
        let resMeta = ceS ? ceS.resolved : null;
        if (!next) {
          if (track) track.rebuilt.add(it.id);
          try {
            const built = it.kind === 'undercut'
              ? buildUndercutOn(src.shape, src.topo, src.it.id, it.id, p)
              : it.kind === 'circlipGroove'
                ? buildCirclipGrooveOn(src.shape, src.topo, src.it.id, it.id, p)
                : it.kind === 'keyway'
                  ? buildKeywayOn(src.shape, src.topo, src.it.id, it.id, p)
                  : it.kind === 'splineProfile'
                    ? buildSplineProfileOn(src.shape, src.topo, src.it.id, it.id, p)
                    : it.kind === 'knurl'
                      ? buildKnurlOn(src.shape, src.topo, src.it.id, it.id, p)
                      : buildGripPatternOn(src.shape, src.topo, src.it.id, it.id, p);
            next = built.shape; nextTopo = built.topo;
            resMeta = built.meta || null;
            cachePut(k, next, null, resMeta, null, nextTopo);
          } catch (err) {
            errors.push({ itemId: it.id, code: err && err.code === 'edges' ? 'edges' : 'build', message: friendlyError(err) });
            continue;
          }
        }
        if (resolved && resMeta) resolved[it.id] = resMeta;
        src.shape = next; src.topo = nextTopo; src.key = k; src.wb = bboxTransform(bboxCached(k, next), src.m);
        bodies.set(tid, src);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
          if (track) track.rebuilt.add(it.id);
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
            if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, key);
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
        const mirKeys = [];
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
                  if (track) track.rebuilt.add(it.id);
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
                mirKeys.push(kOp);
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
                  if (track) track.rebuilt.add(it.id);
                  const idS = isIdentity(s.m);
                  const locMir = idS ? mw.shape : applyMatrix(mw.shape, matInvRigid(s.m));
                  const br = boolWithTopo('cut', s.shape, s.topo, s.it.id, locMir, null, it.id, 'MH:' + it.id);
                  next = br.shape; nextTopo = br.topo;
                  if (!idS) safeDelete(locMir);
                  cachePut(kCut, next, null, null, null, nextTopo);
                }
                s.shape = next; s.topo = nextTopo; s.key = kCut; s.wb = bboxTransform(bboxCached(kCut, next), s.m);
                bodies.set(eid, s);
                mirKeys.push(kCut);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, keyOf(['mirrorStep', p, mirKeys]));
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
          if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
        bodies.set(tid, base);
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
        continue;
      }
      if (track) track.rebuilt.add(it.id);
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
        if (track && track.stepKeys) track.stepKeys.set(it.id, k);
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
  function evalSceneCore(scene, errors, times = null, track = null, keepStepCache = false) {
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
          const r = evalItem(it, errors, null, { resolved }, track);
          let wb = null;
          if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
          addT(it.id, t0);
          return { it, ...r, wb };
        });
        const tOps = now();
        const { bodies, consumed } = resolveOps(evald, errors, hiddenIds, resolved, track);
        if (bodies.size && times) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
        for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.topo = b.topo || null; e.key = b.key; e.wb = b.wb; if (b.deletedBy) e.deletedBy = b.deletedBy; } }
        return { evald, consumed, resolved, opsModified: new Set(bodies.keys()) };
      } finally {
        if (!keepStepCache) clearStepReaderCache();
      }
    }

    // Zwei-Pass-Auswertung: Pass 1 liefert alle festen Körper samt versetzten/verrechneten Zielen,
    // Pass 2 zieht dynamische Schritte („bis zur nächsten / gewählten Fläche“) exakt bis zu ihnen.
    const pass1Evald = tops.map((it) => {
      if (!hasDynamicExtent(it)) {
        const t0 = now();
        const r = evalItem(it, errors, null, null, track);
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        addT(it.id, t0);
        return { it, ...r, wb, dyn: false };
      }
      if (it.kind === 'group' && !isDynamicSplit(it)) {
        const baseIt = stripDynamic(it);
        const r = baseIt.children.length ? evalItem(baseIt, []) : { shape: null, key: defKey(baseIt) };
        let wb = null;
        if (r.shape) wb = bboxTransform(bboxCached(r.key, r.shape), it.m);
        return { it, ...r, wb, dyn: true, dynGroup: true };
      }
      return { it, shape: null, key: defKey(it), wb: null, dyn: true };
    });

    const pass1Snap = pass1Evald.map((e) => ({ ...e }));
    const { bodies: p1Bodies, consumed: p1Consumed } = resolveOps(pass1Snap, [], hiddenIds, null, track ? { rebuilt: track.rebuilt, stepKeys: null } : null);
    for (const e of pass1Snap) { const b = p1Bodies.get(e.it.id); if (b) { e.shape = b.shape; e.key = b.key; e.wb = b.wb; if (b.deletedBy) e.deletedBy = b.deletedBy; } }

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
        const r = evalItem(it, errors, null, ctx, track);
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
      const { bodies, consumed } = resolveOps(evald, errors, hiddenIds, ctx.resolved, track);
      if (bodies.size && times) { const d = now() - tOps; if (d > 0.5) for (const id of bodies.keys()) times[id] = (times[id] || 0) + d / bodies.size; }
      for (const e of evald) { const b = bodies.get(e.it.id); if (b) { e.shape = b.shape; e.topo = b.topo || null; e.key = b.key; e.wb = b.wb; if (b.deletedBy) e.deletedBy = b.deletedBy; } }
      return { evald, consumed, resolved: ctx.resolved, opsModified: new Set(bodies.keys()) };
    } finally {
      for (const x of pool) safeDelete(x.worldShape);
      if (!keepStepCache) clearStepReaderCache();
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
  function evaluate(scene, known = {}, opts = {}) {
    gen++;
    ingestBlobs(scene);
    if (scene.quality) setQuality(scene.quality);
    const errors = [];
    // Rechenzeit je Schritt (BE-26): nur, was wirklich neu gerechnet wurde, zählt
    const times = {}, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const addT = (id, t0) => { const d = now() - t0; if (d > 0.5) times[id] = (times[id] || 0) + d; };
    const track = { rebuilt: new Set(), stepKeys: new Map() };
    const { evald, consumed, resolved } = evalSceneCore(scene, errors, times, track);
    const holes = evald.filter((e) => e.it.role === 'hole' && e.shape);
    const nodes = [];
    const fingerprints = {};
    const meshed = [];
    for (const e of evald) {
      const it = e.it;
      if (consumed.has(it.id)) {
        fingerprints[it.id] = track.stepKeys.get(it.id) || e.key || defKey(it);
        nodes.push({ id: it.id, key: null, empty: true, merged: consumed.get(it.id), ...(e.baseBox ? { baseBox: e.baseBox } : {}), ...(e.wb ? { ownBox: e.wb } : {}) });
        continue;
      }
      if (!e.shape) {
        fingerprints[it.id] = track.stepKeys.get(it.id) || e.key || defKey(it);
        nodes.push({ id: it.id, key: null, empty: true, ...(e.deletedBy ? { deletedBy: e.deletedBy } : {}) });
        continue;
      }
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
            track.rebuilt.add(it.id);
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
      fingerprints[it.id] = resultKey;
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
        try { payload = meshPayload(result, null, resultTopo, it.id); meshCache.set(mk, payload); addT(it.id, tm); meshed.push(it.id); }
        catch (err) { errors.push({ itemId: it.id, code: 'mesh', message: 'Die Form konnte nicht angezeigt werden.' }); nodes.push({ id: it.id, key: null, empty: true }); continue; }
      }
      const out = clonePayload(payload);
      if (out.bodies && out.bodies.length >= 2) out.bodies = applyGroupBodyHints(it, out.bodies);
      nodes.push({ id: it.id, key: resultKey, ...(e.baseBox ? { baseBox: e.baseBox } : {}), ...out });
    }
    if (!(opts && opts.aux)) {
      stats.evals++;
      const rebuilt = [], cached = [];
      for (const e of evald) {
        const id = e.it.id;
        if (track.rebuilt.has(id)) {
          rebuilt.push(id);
          stats.buildsByItem.set(id, (stats.buildsByItem.get(id) || 0) + 1);
          stats.totalRebuilds++;
        } else {
          cached.push(id);
          stats.hitsByItem.set(id, (stats.hitsByItem.get(id) || 0) + 1);
          stats.totalHits++;
        }
      }
      stats.lastEval = { evalId: stats.evals, rebuilt, cached, meshed, fingerprints };
    }
    gc();
    return opts && opts.aux ? { nodes, errors, times, resolved } : { nodes, errors, times, resolved, stats: getStats() };
  }
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
  // Äußerer Umriss (Silhouette) einer Form auf einer Ebene (Form-Koordinaten)
  function silhouetteOf(key, o, x, n) {
    const e = cache.get(key); if (!e) throw new Error('Die Form ist nicht mehr im Speicher. Bitte noch einmal anklicken.');
    e.gen = gen;
    const nDir = norm(n);
    let x0 = sub(x, mul(nDir, dot(x, nDir)));
    if (len(x0) < 1e-6) x0 = cross(Math.abs(nDir[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1], nDir);
    const xDir = norm(x0), yDir = cross(nDir, xDir);
    const cam = new R.ProjectionCamera(o, nDir, xDir);
    const hlr = new oc.HLRBRep_Algo();
    const projector = new oc.HLRAlgo_Projector(cam.wrapped);
    let hlrShapes = null;
    const rawEdges = [];
    try {
      hlr.Add(e.shape.wrapped, 0);
      hlr.Projector(projector);
      hlr.Update();
      hlr.Hide();
      hlrShapes = new oc.HLRBRep_HLRToShape(hlr);
      for (const comp of [hlrShapes.VCompound(), hlrShapes.OutLineVCompound()]) {
        if (!comp || comp.IsNull()) continue;
        const s = R.cast(comp);
        for (const ed of s.edges) {
          try { oc.BRepLib.BuildCurves3d(ed.wrapped); } catch (_) {}
          rawEdges.push(edge2d(ed));
        }
      }
    } finally {
      safeDelete(hlrShapes);
      safeDelete(projector);
      safeDelete(hlr);
      try { cam.delete(); } catch (_) {}
    }

    const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const edgeLen2D = (ed) => {
      if (ed.t === 'LINE') return d2(ed.a, ed.b);
      const pts = ed.pts || [];
      let s = 0;
      for (let i = 1; i < pts.length; i++) s += d2(pts[i - 1], pts[i]);
      return s;
    };
    const sameEdge2D = (A, B) => {
      if (A.t !== B.t) return false;
      if (A.t === 'LINE') {
        return (d2(A.a, B.a) < 1e-3 && d2(A.b, B.b) < 1e-3) || (d2(A.a, B.b) < 1e-3 && d2(A.b, B.a) < 1e-3);
      }
      if (A.t === 'CIRCLE' && A.full && B.full && A.c && B.c) {
        return d2(A.c, B.c) < 1e-3 && Math.abs((A.r || 0) - (B.r || 0)) < 1e-3;
      }
      const ap = A.pts || [], bp = B.pts || [];
      if (ap.length < 2 || bp.length < 2) return false;
      const am = ap[Math.floor(ap.length / 2)], bm = bp[Math.floor(bp.length / 2)];
      if (d2(am, bm) > 2e-2) return false;
      return (d2(ap[0], bp[0]) < 1e-3 && d2(ap[ap.length - 1], bp[bp.length - 1]) < 1e-3)
        || (d2(ap[0], bp[bp.length - 1]) < 1e-3 && d2(ap[ap.length - 1], bp[0]) < 1e-3);
    };

    const flattenCollinearEdge = (ed) => {
      if (!ed || ed.t === 'LINE' || !Array.isArray(ed.pts) || ed.pts.length < 2) return ed;
      const pts = ed.pts, p0 = pts[0];
      let farIdx = 0, maxD = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = d2(p0, pts[i]);
        if (d > maxD) { maxD = d; farIdx = i; }
      }
      if (maxD < 1e-4) return ed;
      const ux = (pts[farIdx][0] - p0[0]) / maxD, uy = (pts[farIdx][1] - p0[1]) / maxD;
      let tMin = 0, tMax = 0;
      for (const q of pts) {
        const dx = q[0] - p0[0], dy = q[1] - p0[1];
        const perp = Math.abs(dx * -uy + dy * ux);
        if (perp > 1e-3) return ed;
        const t = dx * ux + dy * uy;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
      if (tMax - tMin < 1e-4) return ed;
      return {
        t: 'LINE',
        a: [p0[0] + ux * tMin, p0[1] + uy * tMin],
        b: [p0[0] + ux * tMax, p0[1] + uy * tMax],
      };
    };

    const dedup = [];
    for (const rawEd of rawEdges) {
      const ed = flattenCollinearEdge(rawEd);
      if (!ed) continue;
      if (ed.t === 'LINE' && (!ed.a || !ed.b || d2(ed.a, ed.b) < 1e-4)) continue;
      if (ed.t !== 'LINE' && (!(ed.pts && ed.pts.length >= 2) || edgeLen2D(ed) < 1e-4)) continue;
      if (dedup.some((k) => sameEdge2D(k, ed))) continue;
      dedup.push(ed);
    }
    if (!dedup.length) return [];

    // 2. Geraden an echten Kreuzungen teilen, damit sichtbare/innere Stücke getrennt bewertet werden
    const lines = dedup.filter((ed) => ed.t === 'LINE');
    const others = dedup.filter((ed) => ed.t !== 'LINE');
    const splitLines = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1];
      const ts = [0, 1];
      for (let j = 0; j < lines.length; j++) {
        if (i === j) continue;
        const M = lines[j];
        const ex = M.b[0] - M.a[0], ey = M.b[1] - M.a[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = M.a[0] - L.a[0], wy = M.a[1] - L.a[1];
        const t = (wx * ey - wy * ex) / den;
        const u = (wx * dy - wy * dx) / den;
        if (t > 1e-4 && t < 1 - 1e-4 && u > -1e-4 && u < 1 + 1e-4) ts.push(t);
      }
      ts.sort((a, b) => a - b);
      let prev = ts[0];
      for (let k = 1; k < ts.length; k++) {
        if (ts[k] - prev < 1e-4) continue;
        const pa = [L.a[0] + dx * prev, L.a[1] + dy * prev];
        const pb = [L.a[0] + dx * ts[k], L.a[1] + dy * ts[k]];
        if (d2(pa, pb) >= 1e-4) splitLines.push({ t: 'LINE', a: pa, b: pb });
        prev = ts[k];
      }
    }
    const candidates = [...splitLines, ...others];

    // 3. Schatten-Test gegen das projizierte Dreiecksnetz: Innenkanten verwerfen
    const bb = bboxOf(e.shape);
    const diag = bb ? Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) : 50;
    const meshT = Math.max(0.005, Math.min(0.05, diag * 0.0005));
    const tris2 = [];
    try {
      const m = e.shape.mesh({ tolerance: meshT, angularTolerance: 0.15 });
      const V = m.vertices || [], I = m.triangles || [];
      const proj = (idx) => {
        const vx = V[idx * 3] - o[0], vy = V[idx * 3 + 1] - o[1], vz = V[idx * 3 + 2] - o[2];
        return [vx * xDir[0] + vy * xDir[1] + vz * xDir[2], vx * yDir[0] + vy * yDir[1] + vz * yDir[2]];
      };
      for (let i = 0; i + 2 < I.length; i += 3) {
        const p0 = proj(I[i]), p1 = proj(I[i + 1]), p2 = proj(I[i + 2]);
        const area2 = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        if (Math.abs(area2) < 1e-8) continue;
        tris2.push({
          ax: p0[0], ay: p0[1], bx: p1[0], by: p1[1], cx: p2[0], cy: p2[1],
          area2: Math.abs(area2),
          minX: Math.min(p0[0], p1[0], p2[0]), maxX: Math.max(p0[0], p1[0], p2[0]),
          minY: Math.min(p0[1], p1[1], p2[1]), maxY: Math.max(p0[1], p1[1], p2[1]),
        });
      }
    } catch (_) {}

    const inAnyTri = (px, py) => {
      for (const tr of tris2) {
        if (px < tr.minX - 1e-5 || px > tr.maxX + 1e-5 || py < tr.minY - 1e-5 || py > tr.maxY + 1e-5) continue;
        const c1 = (tr.bx - tr.ax) * (py - tr.ay) - (tr.by - tr.ay) * (px - tr.ax);
        const c2 = (tr.cx - tr.bx) * (py - tr.by) - (tr.cy - tr.by) * (px - tr.bx);
        const c3 = (tr.ax - tr.cx) * (py - tr.cy) - (tr.ay - tr.cy) * (px - tr.cx);
        const tol = tr.area2 * 1e-5;
        if ((c1 >= -tol && c2 >= -tol && c3 >= -tol) || (c1 <= tol && c2 <= tol && c3 <= tol)) return true;
      }
      return false;
    };

    const edgeSamples = (ed) => {
      const res = [];
      if (ed.t === 'LINE') {
        const dx = ed.b[0] - ed.a[0], dy = ed.b[1] - ed.a[1], L = Math.hypot(dx, dy);
        if (L < 1e-6) return res;
        const nv = [-dy / L, dx / L];
        for (const t of [0.25, 0.5, 0.75]) res.push({ p: [ed.a[0] + dx * t, ed.a[1] + dy * t], nv });
        return res;
      }
      const pts = ed.pts || [];
      if (pts.length < 2) return res;
      for (const t of [0.25, 0.5, 0.75]) {
        const idx = Math.max(0, Math.min(pts.length - 2, Math.floor(t * (pts.length - 1))));
        const a = pts[idx], b = pts[idx + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        res.push({ p: [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5], nv: [-dy / L, dx / L] });
      }
      return res;
    };

    let kept = candidates;
    if (tris2.length) {
      const eps = Math.max(meshT * 3.5, Math.min(0.12, diag * 0.002));
      const filtered = [];
      for (const ed of candidates) {
        const smp = edgeSamples(ed);
        if (!smp.length) continue;
        const interior = smp.every(({ p, nv }) => (
          inAnyTri(p[0] + nv[0] * eps, p[1] + nv[1] * eps)
          && inAnyTri(p[0] - nv[0] * eps, p[1] - nv[1] * eps)
        ));
        if (!interior) filtered.push(ed);
      }
      if (filtered.length) kept = filtered;
    }

    // 4. Kollineare sich berührende oder überlappende Linien verschmelzen
    const keptLines = kept.filter((ed) => ed.t === 'LINE').map((ed) => ({ a: ed.a.slice(), b: ed.b.slice() }));
    const keptOther = kept.filter((ed) => ed.t !== 'LINE');
    const hasThirdAt = (pt, iA, iB) => {
      for (let k = 0; k < keptLines.length; k++) {
        if (k === iA || k === iB) continue;
        if (d2(keptLines[k].a, pt) < 2e-3 || d2(keptLines[k].b, pt) < 2e-3) return true;
      }
      for (const ed of keptOther) {
        const pts = ed.pts || [];
        if (pts.length >= 2 && (d2(pts[0], pt) < 2e-3 || d2(pts[pts.length - 1], pt) < 2e-3)) return true;
      }
      return false;
    };
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < keptLines.length && !merged; i++) {
        const A = keptLines[i];
        const La = d2(A.a, A.b); if (La < 1e-6) continue;
        const ux = (A.b[0] - A.a[0]) / La, uy = (A.b[1] - A.a[1]) / La;
        for (let j = i + 1; j < keptLines.length && !merged; j++) {
          const B = keptLines[j];
          const Lb = d2(B.a, B.b); if (Lb < 1e-6) continue;
          const vx = (B.b[0] - B.a[0]) / Lb, vy = (B.b[1] - B.a[1]) / Lb;
          if (Math.abs(ux * vx + uy * vy) < 0.9999) continue;
          const perp = Math.abs((B.a[0] - A.a[0]) * -uy + (B.a[1] - A.a[1]) * ux);
          if (perp > 1e-3) continue;
          const tB0 = (B.a[0] - A.a[0]) * ux + (B.a[1] - A.a[1]) * uy;
          const tB1 = (B.b[0] - A.a[0]) * ux + (B.b[1] - A.a[1]) * uy;
          const loA = 0, hiA = La;
          const loB = Math.min(tB0, tB1), hiB = Math.max(tB0, tB1);
          const overlap = Math.min(hiA, hiB) - Math.max(loA, loB);
          if (overlap < -1e-3) continue;
          if (overlap <= 1e-3) {
            const jt = Math.abs(hiA - loB) <= 1e-3 ? hiA : loA;
            const jpt = [A.a[0] + ux * jt, A.a[1] + uy * jt];
            if (hasThirdAt(jpt, i, j)) continue;
          }
          const lo = Math.min(loA, loB), hi = Math.max(hiA, hiB);
          keptLines[i] = {
            a: [A.a[0] + ux * lo, A.a[1] + uy * lo],
            b: [A.a[0] + ux * hi, A.a[1] + uy * hi],
          };
          keptLines.splice(j, 1);
          merged = true;
        }
      }
    }

    const out = [];
    for (const L of keptLines) {
      if (d2(L.a, L.b) < 1e-4) continue;
      out.push({ t: 'LINE', a: [r6(L.a[0]), r6(L.a[1])], b: [r6(L.b[0]), r6(L.b[1])] });
    }
    for (const ed of keptOther) {
      const cp = { ...ed };
      if (Array.isArray(cp.c)) cp.c = [r6(cp.c[0]), r6(cp.c[1])];
      if (Array.isArray(cp.pts)) cp.pts = cp.pts.map((q) => [r6(q[0]), r6(q[1])]);
      out.push(cp);
    }
    return out;
  }
  // Schnittkurve zweier Flächen (Welt-Koordinaten): Kanten als 3D-Punktfolgen
  function faceIntersectOf(args) {
    const { a, b, scene } = args || {};
    if (!a || !b) return [];
    const pickFaceFromShape = (shape, faceIdx, sig) => {
      const fl = topoList(shape, 'face');
      let chosen = null;
      try {
        if (faceIdx != null && faceIdx >= 0 && faceIdx < fl.length && !sig) {
          chosen = fl[faceIdx].shape.clone();
        } else {
          if (faceIdx != null && faceIdx >= 0 && faceIdx < fl.length) {
            const cand = fl[faceIdx].shape;
            if (!sig || !sig.t || cand.geomType === sig.t) {
              const cc = cand.center ? vec(cand.center) : null;
              if (!sig || !sig.c || !cc || len(sub(cc, sig.c)) < 0.5) chosen = cand.clone();
            }
          }
          if (!chosen && sig && Array.isArray(sig.c)) {
            let best = null, bs = Infinity;
            for (const f of fl) {
              if (sig.t && f.shape.geomType !== sig.t) continue;
              const cc = f.shape.center ? vec(f.shape.center) : null;
              if (!cc) continue;
              const s = len(sub(cc, sig.c));
              if (sig.t === 'PLANE' && Array.isArray(sig.n)) {
                try {
                  const fn = vec(f.shape.normalAt());
                  if (dot(fn, sig.n) < 0.98) continue;
                } catch (_) {}
              }
              if (s < bs) { bs = s; best = f.shape; }
            }
            if (best) chosen = best.clone();
          }
          if (!chosen && faceIdx != null && faceIdx >= 0 && faceIdx < fl.length) {
            chosen = fl[faceIdx].shape.clone();
          }
        }
      } finally {
        for (const x of fl) x.shape.delete();
      }
      return chosen;
    };

    const eA = a.key ? cache.get(a.key) : null;
    const eB = b.key ? cache.get(b.key) : null;
    if (eA) eA.gen = gen;
    if (eB) eB.gen = gen;
    let fa = null, fb = null;
    const fallbackSolids = [];
    try {
      if (eA && eB) {
        const fA0 = pickFaceFromShape(eA.shape, a.faceIdx, a.faceSig);
        const fB0 = pickFaceFromShape(eB.shape, b.faceIdx, b.faceSig);
        if (fA0) { fa = applyMatrix(fA0, a.m); fA0.delete(); }
        if (fB0) { fb = applyMatrix(fB0, b.m); fB0.delete(); }
      } else if (scene) {
        ingestBlobs(scene);
        const solids = evaluateShapes(scene, []);
        fallbackSolids.push(...solids);
        const sA = solids.find((s) => s.id === a.id);
        const sB = solids.find((s) => s.id === b.id);
        if (sA) fa = pickFaceFromShape(sA.shape, a.faceIdx, null);
        if (sB) fb = pickFaceFromShape(sB.shape, b.faceIdx, null);
      }
      if (!fa || !fb) return [];
      let sec = null, sh = null;
      const out = [];
      try {
        try {
          sec = new oc.BRepAlgoAPI_Section(fa.wrapped, fb.wrapped, false);
          if (sec.Approximation) sec.Approximation(true);
          sec.Build();
          if (sec.IsDone && !sec.IsDone()) return [];
          sh = R.cast(sec.Shape());
        } catch (_) {
          if (sec) try { sec.delete(); } catch (_2) {}
          sec = new oc.BRepAlgoAPI_Section(fa.wrapped, fb.wrapped, true);
          if (sec.IsDone && !sec.IsDone()) return [];
          sh = R.cast(sec.Shape());
        }
        if (sh && (!sh.wrapped || !sh.wrapped.IsNull())) {
          for (const ed of sh.edges) {
            try { oc.BRepLib.BuildCurves3d(ed.wrapped); } catch (_) {}
            const L = ed.length || 0;
            if (L < 1e-4) continue;
            const t = ed.geomType;
            const N = t === 'LINE' ? 1 : Math.max(16, Math.min(64, Math.ceil(L / 0.8)));
            const pts = [];
            for (let i = 0; i <= N; i++) pts.push(vec(ed.pointAt(i / N)));
            const p0 = pts[0], pm = pts[Math.floor(pts.length / 2)], p1 = pts[pts.length - 1];
            const dup = out.some((k) => {
              const kp = k.pts, km = kp[Math.floor(kp.length / 2)];
              if (len(sub(km, pm)) > 1e-2) return false;
              return (len(sub(kp[0], p0)) < 1e-3 && len(sub(kp[kp.length - 1], p1)) < 1e-3)
                || (len(sub(kp[0], p1)) < 1e-3 && len(sub(kp[kp.length - 1], p0)) < 1e-3);
            });
            if (!dup) out.push({ t, pts, l: L });
          }
        }
      } finally {
        safeDelete(sh);
        if (sec) try { sec.delete(); } catch (_) {}
      }
      return out;
    } finally {
      safeDelete(fa);
      safeDelete(fb);
      for (const s of fallbackSolids) safeDelete(s.shape);
    }
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
  function collectExportSolids(scene, only, originMat = null) {
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
    return solids;
  }
  function collectExportShape(scene, only, originMat = null) {
    const solids = collectExportSolids(scene, only, originMat);
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
  function collectSingleBodyShape(scene, only, originMat = null) {
    const solids = collectExportSolids(scene, only, originMat);
    let merged = solids[0].shape;
    if (solids.length > 1) {
      for (let i = 1; i < solids.length; i++) {
        const next = solids[i].shape;
        let builder = null;
        let fusedShape = null;
        try {
          builder = new oc.BRepAlgoAPI_Fuse(merged.wrapped, next.wrapped);
          builder.Build();
          builder.SimplifyResult(true, true, 1e-3);
          const raw = R.cast(builder.Shape());
          if (raw && R.isShape3D(raw)) fusedShape = raw;
          else safeDelete(raw);
        } catch (_) {
          fusedShape = null;
        } finally {
          if (builder && builder.delete) try { builder.delete(); } catch (_) {}
        }
        if (fusedShape) {
          if (merged !== solids[0].shape) safeDelete(merged);
          merged = fusedShape;
        } else {
          const prevMerged = merged;
          const comp = R.makeCompound([merged, next]);
          if (prevMerged !== solids[0].shape) safeDelete(prevMerged);
          merged = comp;
        }
      }
      for (const s of solids) {
        if (s.shape && s.shape !== merged) safeDelete(s.shape);
      }
    }
    const parts = sortedSolids(merged);
    const solidCount = Math.max(1, parts.length);
    for (const p of parts) safeDelete(p.shape);
    const bbox = bboxOf(merged);
    let volume = 0;
    try {
      const pr = R.measureShapeVolumeProperties(merged);
      volume = pr.volume || 0;
      pr.delete && pr.delete();
    } catch (_) {}
    return { shape: merged, sourceCount: solids.length, solidCount, volume, bbox };
  }
  function exportSingleBody(scene, opts = {}) {
    const fmt = String(opts.fmt || 'step').toLowerCase();
    const name = String(opts.name || 'Baugruppe');
    const color = String(opts.color || '#2f9e91');
    const res = collectSingleBodyShape(scene, opts.only || null, opts.originMat || null);
    try {
      if (fmt === 'brep') {
        const str = oc.BRepToolsWrapper.Write(res.shape.wrapped);
        if (!str || !str.length) throw new Error('BREP-Export fehlgeschlagen.');
        return {
          blob: new Blob([str], { type: 'text/plain' }),
          sourceCount: res.sourceCount,
          solidCount: res.solidCount,
          objectCount: 1,
          volume: res.volume,
          bbox: res.bbox,
        };
      }
      if (fmt === 'mesh') {
        const fine = opts.fine !== false;
        const f = Math.max(0.05, Math.min(4, +opts.q || 1));
        const hc = Number(opts.holeComp) > 0 ? Math.min(2, Number(opts.holeComp)) : 0;
        let workShape = res.shape;
        let compensatedHoles = 0;
        if (hc > 0) {
          const comp = applyHoleCompensation(res.shape, hc);
          workShape = comp.shape;
          compensatedHoles = comp.count || 0;
        }
        try {
          const b = bboxOf(workShape);
          const tol = (fine ? Math.min(0.05, Math.max(0.005, meshTol(b) * 0.35)) : meshTol(b)) * f;
          const m = workShape.mesh({ tolerance: tol, angularTolerance: (fine ? 0.1 : 0.2) * Math.min(2, Math.max(0.25, f)) });
          return {
            objects: [{
              id: 'single-body',
              name,
              color,
              vertices: new Float32Array(m.vertices),
              normals: new Float32Array(m.normals),
              triangles: new Uint32Array(m.triangles),
            }],
            errors: [],
            compensatedHoles,
            sourceCount: res.sourceCount,
            solidCount: res.solidCount,
            objectCount: 1,
            volume: res.volume,
            bbox: res.bbox,
          };
        } finally {
          if (workShape !== res.shape) safeDelete(workShape);
        }
      }
      const wrapStr = (s) => new oc.TCollection_ExtendedString(String(s || ''), true);
      const toRelease = [];
      const track = (x) => { if (x) toRelease.push(x); return x; };
      const fn = 'export_single_' + Math.random().toString(36).slice(2) + '.step';
      try {
        const docStr = track(wrapStr('XmlOcaf'));
        const doc = track(new oc.TDocStd_Document(docStr));
        oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
        const mainLabel = track(doc.Main());
        const st = track(oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel));
        const ct = track(oc.XCAFDoc_DocumentTool.ColorTool(mainLabel));
        const surfType = oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf;
        const lbl = track(st.NewShape());
        st.SetShape(lbl, res.shape.wrapped);
        const nStr = track(wrapStr(name));
        oc.TDataStd_Name.Set(lbl, nStr);
        const rgba = track(hexToLinearRGBA(color, 1));
        ct.SetColor(lbl, rgba, surfType);
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
        return {
          blob: new Blob([file], { type: 'application/STEP' }),
          sourceCount: res.sourceCount,
          solidCount: res.solidCount,
          objectCount: 1,
          volume: res.volume,
          bbox: res.bbox,
        };
      } finally {
        try { oc.FS.unlink('/' + fn); } catch (_) {}
        for (let i = toRelease.length - 1; i >= 0; i--) safeDelete(toRelease[i]);
      }
    } finally {
      safeDelete(res.shape);
    }
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
              caps.push({ ...poly, partIdx, partId: s.id });
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
  function clashes(scene, probes = [], skipPairs = [], opts = {}) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const boxes = solids.map((s) => bboxOf(s.shape));
    const minVol = opts && opts.minVol != null ? Number(opts.minVol) : 0.05;
    const withMesh = !!(opts && opts.withMesh);
    const hit = (a, b) => a[0] < b[3] - 0.01 && b[0] < a[3] - 0.01 && a[1] < b[4] - 0.01 && b[1] < a[4] - 0.01 && a[2] < b[5] - 0.01 && b[2] < a[5] - 0.01;
    const overlap = (A, B) => { let x = null; try { x = A.intersect(B); const v = R.measureVolume(x); return v; } catch (_) { return 0; } finally { safeDelete(x); } };
    const pairs = [];
    for (let i = 0; i < solids.length; i++) {
      if (skipPairs.includes(solids[i].id)) continue;
      for (let j = i + 1; j < solids.length; j++) {
        if (skipPairs.includes(solids[j].id) || !hit(boxes[i], boxes[j])) continue;
        if (!withMesh) {
          const v = overlap(solids[i].shape, solids[j].shape);
          if (v > minVol) pairs.push({ a: solids[i].id, b: solids[j].id, v });
          continue;
        }
        let x = null;
        try {
          x = solids[i].shape.intersect(solids[j].shape);
          const v = R.measureVolume(x);
          if (v > minVol) {
            const bbox = bboxOf(x);
            const center = shapeCenterOfMass(x, bbox);
            let mesh = null;
            try {
              const tol = Math.max(0.02, Math.min(meshTol(bbox), 0.35));
              const ang = Math.min(Q.ang, 0.25);
              const m = x.mesh({ tolerance: tol, angularTolerance: ang });
              const e = x.meshEdges({ tolerance: tol, angularTolerance: ang });
              if (m && m.vertices && m.vertices.length && m.triangles && m.triangles.length) {
                mesh = {
                  vertices: new Float32Array(m.vertices),
                  normals: new Float32Array(m.normals),
                  triangles: new Uint32Array(m.triangles),
                  lines: new Float32Array(e && e.lines ? e.lines : []),
                };
              }
            } catch (_) {}
            pairs.push({ a: solids[i].id, b: solids[j].id, v, bbox, center, mesh });
          }
        } catch (_) {}
        finally { safeDelete(x); }
      }
    }
    if (withMesh) pairs.sort((p, q) => q.v - p.v);
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
    return { pairs, hits, errors, checkedCount: solids.length };
  }

  // Abstands-Prüfung (BG-18): alle Teilepaare mit weniger als minGap mm Abstand (optional inkl. Berührung)
  function clearances(scene, minGap = 1, skipPairs = [], opts = {}) {
    ingestBlobs(scene);
    const errors = [];
    const solids = evaluateShapes(scene, errors);
    const boxes = solids.map((s) => bboxOf(s.shape));
    const limit = Math.max(0, Number(minGap) || 0);
    const includeTouch = !!(opts && opts.includeTouch);
    const boxDist = (a, b) => Math.hypot(
      Math.max(0, a[0] - b[3], b[0] - a[3]),
      Math.max(0, a[1] - b[4], b[1] - a[4]),
      Math.max(0, a[2] - b[5], b[2] - a[5])
    );
    const hit = (a, b) => a[0] < b[3] - 0.01 && b[0] < a[3] - 0.01 && a[1] < b[4] - 0.01 && b[1] < a[4] - 0.01 && a[2] < b[5] - 0.01 && b[2] < a[5] - 0.01;
    const overlapVol = (A, B) => { let x = null; try { x = A.intersect(B); return R.measureVolume(x); } catch (_) { return 0; } finally { safeDelete(x); } };
    const pairs = [];
    for (let i = 0; i < solids.length; i++) {
      if (skipPairs.includes(solids[i].id)) continue;
      for (let j = i + 1; j < solids.length; j++) {
        if (skipPairs.includes(solids[j].id) || boxDist(boxes[i], boxes[j]) >= limit - 1e-6) continue;
        let t = null, p1 = null, p2 = null;
        try {
          t = new oc.BRepExtrema_DistShapeShape();
          t.LoadS1(solids[i].shape.wrapped);
          t.LoadS2(solids[j].shape.wrapped);
          t.Perform();
          if (t.IsDone() && t.NbSolution() > 0) {
            const d = t.Value();
            if (d < limit - 1e-5) {
              p1 = t.PointOnShape1(1);
              p2 = t.PointOnShape2(1);
              const pa = [p1.X(), p1.Y(), p1.Z()];
              const pb = [p2.X(), p2.Y(), p2.Z()];
              const center = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
              if (d <= 1e-4) {
                const v = hit(boxes[i], boxes[j]) ? overlapVol(solids[i].shape, solids[j].shape) : 0;
                if (v > 0.05) {
                  pairs.push({ a: solids[i].id, b: solids[j].id, d: 0, v, kind: 'overlap', pa, pb, center });
                } else if (includeTouch) {
                  pairs.push({ a: solids[i].id, b: solids[j].id, d: 0, kind: 'touch', pa, pb, center });
                }
              } else {
                pairs.push({ a: solids[i].id, b: solids[j].id, d, kind: 'gap', pa, pb, center });
              }
            }
          }
        } catch (e) {
          errors.push({ itemId: solids[i].id, code: 'clearance', message: String((e && e.message) || e) });
        } finally {
          if (p1) try { p1.delete(); } catch (_) {}
          if (p2) try { p2.delete(); } catch (_) {}
          if (t) try { t.delete(); } catch (_) {}
        }
      }
    }
    pairs.sort((p, q) => p.d - q.d);
    for (const s of solids) safeDelete(s.shape);
    return { pairs, errors, checkedCount: solids.length, minGap: limit };
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
  // ---------- Symmetrie prüfen (PF-16): Vergleich des Körpers mit seinem Spiegelbild an einer Ebene ----------
  function mirrorShapeByPlane(shape, o, n) {
    const nn = norm(n);
    const p0 = new oc.gp_Pnt(o[0], o[1], o[2]);
    const d0 = new oc.gp_Dir(nn[0], nn[1], nn[2]);
    const ax2 = new oc.gp_Ax2(p0, d0);
    const trsf = new oc.gp_Trsf();
    trsf.SetMirror(ax2);
    const tr = new oc.BRepBuilderAPI_Transform(shape.wrapped, trsf, true, false);
    try {
      return R.cast(tr.ModifiedShape(shape.wrapped));
    } finally {
      tr.delete(); trsf.delete(); ax2.delete(); d0.delete(); p0.delete();
    }
  }
  function reflectPointByPlane(p, o, n) {
    const d = (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] + (p[2] - o[2]) * n[2];
    return [p[0] - 2 * d * n[0], p[1] - 2 * d * n[1], p[2] - 2 * d * n[2]];
  }
  function reflectBboxByPlane(bb, o, n) {
    if (!bb || bb.length < 6) return null;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const rp = reflectPointByPlane([i & 1 ? bb[3] : bb[0], i & 2 ? bb[4] : bb[1], i & 4 ? bb[5] : bb[2]], o, n);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], rp[k]); mx[k] = Math.max(mx[k], rp[k]); }
    }
    return [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]];
  }
  function reflectMeshByPlane(mesh, o, n) {
    if (!mesh || !mesh.vertices || !mesh.triangles) return null;
    const srcV = mesh.vertices, srcN = mesh.normals, srcT = mesh.triangles, srcL = mesh.lines;
    const vertices = new Float32Array(srcV.length);
    for (let i = 0; i < srcV.length; i += 3) {
      const dx = srcV[i] - o[0], dy = srcV[i + 1] - o[1], dz = srcV[i + 2] - o[2];
      const d = 2 * (dx * n[0] + dy * n[1] + dz * n[2]);
      vertices[i] = srcV[i] - d * n[0];
      vertices[i + 1] = srcV[i + 1] - d * n[1];
      vertices[i + 2] = srcV[i + 2] - d * n[2];
    }
    const normals = new Float32Array(srcN && srcN.length === srcV.length ? srcN.length : 0);
    if (normals.length) {
      for (let i = 0; i < srcN.length; i += 3) {
        const d = 2 * (srcN[i] * n[0] + srcN[i + 1] * n[1] + srcN[i + 2] * n[2]);
        normals[i] = srcN[i] - d * n[0];
        normals[i + 1] = srcN[i + 1] - d * n[1];
        normals[i + 2] = srcN[i + 2] - d * n[2];
      }
    }
    const triangles = new Uint32Array(srcT.length);
    for (let i = 0; i + 2 < srcT.length; i += 3) {
      triangles[i] = srcT[i];
      triangles[i + 1] = srcT[i + 2];
      triangles[i + 2] = srcT[i + 1];
    }
    const lines = new Float32Array(srcL ? srcL.length : 0);
    if (lines.length) {
      for (let i = 0; i < srcL.length; i += 3) {
        const dx = srcL[i] - o[0], dy = srcL[i + 1] - o[1], dz = srcL[i + 2] - o[2];
        const d = 2 * (dx * n[0] + dy * n[1] + dz * n[2]);
        lines[i] = srcL[i] - d * n[0];
        lines[i + 1] = srcL[i + 1] - d * n[1];
        lines[i + 2] = srcL[i + 2] - d * n[2];
      }
    }
    return { vertices, normals, triangles, lines };
  }
  function checkSymmetry(scene, opts = {}) {
    ingestBlobs(scene);
    const errors = [];
    const only = Array.isArray(opts.only) ? opts.only : null;
    const rawSolids = evaluateShapes(scene, errors);
    const solids = [];
    for (const s of rawSolids) {
      if (only && !only.includes(s.id)) safeDelete(s.shape);
      else solids.push(s);
    }
    const rawO = Array.isArray(opts.origin) && opts.origin.length >= 3 ? opts.origin : [0, 0, 0];
    const rawN = Array.isArray(opts.normal) && opts.normal.length >= 3 ? opts.normal : [1, 0, 0];
    const O = [num(rawO[0], 0), num(rawO[1], 0), num(rawO[2], 0)];
    const nLen = Math.hypot(num(rawN[0], 0), num(rawN[1], 0), num(rawN[2], 0));
    const N = nLen > 1e-9 ? [num(rawN[0], 0) / nLen, num(rawN[1], 0) / nLen, num(rawN[2], 0) / nLen] : [1, 0, 0];

    if (!solids.length) {
      return {
        checkedCount: 0, symmetric: true, totalVolume: 0, diffVolume: 0, symPercent: 100,
        bbox: null, origin: O, normal: N, onlyOrigMesh: null, onlyMirrMesh: null, deviations: [], errors,
      };
    }

    let totalVolume = 0;
    const sceneBbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const s of solids) {
      try { totalVolume += Math.max(0, R.measureVolume(s.shape)); } catch (_) {}
      try {
        const bb = bboxOf(s.shape);
        for (let k = 0; k < 3; k++) {
          sceneBbox[k] = Math.min(sceneBbox[k], bb[k]);
          sceneBbox[k + 3] = Math.max(sceneBbox[k + 3], bb[k + 3]);
        }
      } catch (_) {}
    }

    let combined = null, ownsCombined = false, mirrored = null, diffOrig = null;
    let diffVol = 0, onlyOrigMesh = null, onlyMirrMesh = null;
    const deviations = [];
    try {
      const shapes = solids.map((s) => s.shape);
      if (shapes.length === 1) {
        combined = shapes[0];
      } else {
        try {
          combined = fuseAll(shapes, false);
          ownsCombined = true;
        } catch (_) {
          combined = R.makeCompound(shapes);
          ownsCombined = true;
        }
      }
      mirrored = mirrorShapeByPlane(combined, O, N);
      try {
        diffOrig = combined.cut(mirrored);
        diffVol = Math.max(0, R.measureVolume(diffOrig));
      } catch (_) {
        diffVol = 0;
      }

      const tolVol = opts.tolVol != null ? Number(opts.tolVol) : 0.05;
      const tolRel = opts.tolRel != null ? Number(opts.tolRel) : 1e-4;
      const epsVol = Math.max(tolVol, totalVolume * tolRel);
      const symmetric = diffVol <= epsVol;
      const symPercent = totalVolume > 1e-9
        ? Math.max(0, Math.min(100, (1 - diffVol / totalVolume) * 100))
        : 100;

      if (!symmetric && diffOrig) {
        try {
          const dbbox = bboxOf(diffOrig);
          if (isFinite(dbbox[0]) && dbbox[3] >= dbbox[0] - 1e-6) {
            const tol = Math.max(0.02, Math.min(meshTol(dbbox), 0.35));
            const ang = Math.min(Q.ang, 0.25);
            const m = diffOrig.mesh({ tolerance: tol, angularTolerance: ang });
            const e = diffOrig.meshEdges({ tolerance: tol, angularTolerance: ang });
            if (m && m.vertices && m.vertices.length && m.triangles && m.triangles.length) {
              onlyOrigMesh = {
                vertices: new Float32Array(m.vertices),
                normals: new Float32Array(m.normals),
                triangles: new Uint32Array(m.triangles),
                lines: new Float32Array(e && e.lines ? e.lines : []),
              };
              onlyMirrMesh = reflectMeshByPlane(onlyOrigMesh, O, N);
            }
          }
        } catch (_) {}

        const parts = sortedSolids(diffOrig);
        try {
          for (const part of parts) {
            let v = 0;
            try { v = Math.max(0, R.measureVolume(part.shape)); } catch (_) { v = 0; }
            if (v <= tolVol * 0.25) continue;
            const bb = part.bbox;
            const center = shapeCenterOfMass(part.shape, bb);
            deviations.push({
              volume: v,
              center,
              mirrorCenter: reflectPointByPlane(center, O, N),
              bbox: bb,
              mirrorBbox: reflectBboxByPlane(bb, O, N),
            });
          }
          deviations.sort((a, b) => b.volume - a.volume);
          if (deviations.length > 30) deviations.length = 30;
        } finally {
          for (const part of parts) safeDelete(part.shape);
        }
      }

      return {
        checkedCount: solids.length,
        symmetric,
        totalVolume,
        diffVolume: symmetric ? 0 : diffVol,
        symPercent: symmetric ? 100 : symPercent,
        bbox: isFinite(sceneBbox[0]) ? sceneBbox : null,
        origin: O,
        normal: N,
        onlyOrigMesh: symmetric ? null : onlyOrigMesh,
        onlyMirrMesh: symmetric ? null : onlyMirrMesh,
        deviations: symmetric ? [] : deviations,
        errors,
      };
    } finally {
      safeDelete(diffOrig);
      safeDelete(mirrored);
      if (ownsCombined) safeDelete(combined);
      for (const s of solids) safeDelete(s.shape);
    }
  }
  // ---------- Vergleich zweier Körper oder Stände (PF-12): neu (grün), weg (rot), gleich (grau) ----------
  function compareSolids(args = {}) {
    const { sceneA, sceneB, onlyA = null, onlyB = null, align = 'world' } = args || {};
    if (sceneA) ingestBlobs(sceneA);
    if (sceneB && sceneB !== sceneA) ingestBlobs(sceneB);
    const errors = [];
    const evalSide = (scene, only) => {
      if (!scene) return [];
      const raw = evaluateShapes(scene, errors);
      if (!Array.isArray(only) || !only.length) return raw;
      const keep = new Set(only);
      const out = [];
      for (const s of raw) {
        if (keep.has(s.id)) out.push(s);
        else safeDelete(s.shape);
      }
      return out;
    };
    const solidsA = evalSide(sceneA, onlyA);
    const solidsB = evalSide(sceneB, onlyB);

    const safeVolume = (sh) => {
      if (!sh) return 0;
      try {
        const v = R.measureVolume(sh);
        return Number.isFinite(v) && v > 0 ? v : 0;
      } catch (_) {
        return 0;
      }
    };
    const safeBbox = (sh) => {
      if (!sh) return null;
      try {
        const b = bboxOf(sh);
        return b && Number.isFinite(b[0]) && b[3] >= b[0] - 1e-6 ? b : null;
      } catch (_) {
        return null;
      }
    };
    const boxesOverlap = (a, b) => !!(
      a && b
      && a[0] < b[3] + 1e-4 && b[0] < a[3] + 1e-4
      && a[1] < b[4] + 1e-4 && b[1] < a[4] + 1e-4
      && a[2] < b[5] + 1e-4 && b[2] < a[5] + 1e-4
    );
    const combineSide = (solids) => {
      if (!solids.length) return { shape: null, owns: false };
      if (solids.length === 1) return { shape: solids[0].shape, owns: false };
      const shapes = solids.map((s) => s.shape);
      try {
        return { shape: fuseAll(shapes, false), owns: true };
      } catch (_) {
        return { shape: R.makeCompound(shapes), owns: true };
      }
    };
    const meshShape = (sh) => {
      if (!sh) return null;
      try {
        const bb = safeBbox(sh);
        if (!bb) return null;
        const tol = Math.max(0.02, Math.min(meshTol(bb), 0.35));
        const ang = Math.min(Q.ang, 0.25);
        const m = sh.mesh({ tolerance: tol, angularTolerance: ang });
        const e = sh.meshEdges({ tolerance: tol, angularTolerance: ang });
        if (m && m.vertices && m.vertices.length && m.triangles && m.triangles.length) {
          return {
            vertices: new Float32Array(m.vertices),
            normals: new Float32Array(m.normals),
            triangles: new Uint32Array(m.triangles),
            lines: new Float32Array(e && e.lines ? e.lines : []),
            bbox: bb,
          };
        }
      } catch (_) {}
      return null;
    };
    const safeBool = (fn) => {
      try { return fn(); } catch (_) { return null; }
    };

    let shapeA = null, ownsA = false;
    let shapeB = null, ownsB = false;
    let addedShape = null, ownsAdded = false;
    let removedShape = null, ownsRemoved = false;
    let sameShape = null, ownsSame = false;

    try {
      ({ shape: shapeA, owns: ownsA } = combineSide(solidsA));
      ({ shape: shapeB, owns: ownsB } = combineSide(solidsB));
      const bboxA = safeBbox(shapeA);
      let bboxB = safeBbox(shapeB);
      const volA = safeVolume(shapeA);
      const volB = safeVolume(shapeB);

      let shift = [0, 0, 0];
      let aligned = false;
      if (shapeA && shapeB && bboxA && bboxB && (align === 'center' || (align === 'auto' && !boxesOverlap(bboxA, bboxB)))) {
        const s = [
          (bboxA[0] + bboxA[3]) / 2 - (bboxB[0] + bboxB[3]) / 2,
          (bboxA[1] + bboxA[4]) / 2 - (bboxB[1] + bboxB[4]) / 2,
          (bboxA[2] + bboxA[5]) / 2 - (bboxB[2] + bboxB[5]) / 2,
        ];
        if (Math.hypot(s[0], s[1], s[2]) > 1e-6) {
          const shifted = applyMatrix(shapeB, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s[0], s[1], s[2], 1]);
          if (ownsB) safeDelete(shapeB);
          shapeB = shifted;
          ownsB = true;
          bboxB = safeBbox(shapeB);
          shift = s;
          aligned = true;
        }
      }

      const overlaps = !!(shapeA && shapeB && bboxA && bboxB && boxesOverlap(bboxA, bboxB));
      if (!shapeA && !shapeB) {
        // beide leer
      } else if (!shapeA) {
        addedShape = shapeB;
      } else if (!shapeB) {
        removedShape = shapeA;
      } else if (!overlaps) {
        addedShape = shapeB;
        removedShape = shapeA;
      } else {
        addedShape = safeBool(() => shapeB.cut(shapeA));
        ownsAdded = !!addedShape;
        removedShape = safeBool(() => shapeA.cut(shapeB));
        ownsRemoved = !!removedShape;
        sameShape = safeBool(() => shapeA.intersect(shapeB));
        ownsSame = !!sameShape;
      }

      const EPS_VOL = 1e-3;
      const rawAdded = safeVolume(addedShape);
      const rawRemoved = safeVolume(removedShape);
      const rawSame = safeVolume(sameShape);
      const addedVolume = rawAdded > EPS_VOL ? rawAdded : 0;
      const removedVolume = rawRemoved > EPS_VOL ? rawRemoved : 0;
      const sameVolume = rawSame > EPS_VOL ? rawSame : 0;

      const addedMesh = addedVolume > 0 ? meshShape(addedShape) : null;
      const removedMesh = removedVolume > 0 ? meshShape(removedShape) : null;
      const sameMesh = sameVolume > 0 ? meshShape(sameShape) : null;

      const identical = addedVolume <= EPS_VOL && removedVolume <= EPS_VOL;
      const unionVol = sameVolume + addedVolume + removedVolume;
      const similarity = unionVol > 1e-6 ? Math.max(0, Math.min(100, (sameVolume / unionVol) * 100)) : 100;

      return {
        volA,
        volB,
        addedVolume,
        removedVolume,
        sameVolume,
        identical,
        similarity,
        aligned,
        shift,
        bboxA,
        bboxB,
        addedMesh,
        removedMesh,
        sameMesh,
        countA: solidsA.length,
        countB: solidsB.length,
        errors,
      };
    } finally {
      if (ownsSame) safeDelete(sameShape);
      if (ownsRemoved) safeDelete(removedShape);
      if (ownsAdded) safeDelete(addedShape);
      if (ownsB) safeDelete(shapeB);
      if (ownsA) safeDelete(shapeA);
      for (const s of solidsB) safeDelete(s.shape);
      for (const s of solidsA) safeDelete(s.shape);
    }
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

  // ---------- Vereinfachte Hülle einer Baugruppe (BG-30) ----------
  function countFacesOf(shape) {
    if (!shape || !shape.wrapped) return 0;
    const TA = oc.TopAbs_ShapeEnum;
    const faces = uniqueShapes(shape.wrapped, TA.TopAbs_FACE);
    const n = faces.length;
    for (const f of faces) safeDelete(f);
    return n;
  }

  function bboxVolumeOf(bb) {
    if (!bb || bb.length < 6) return 0;
    return Math.max(0, bb[3] - bb[0]) * Math.max(0, bb[4] - bb[1]) * Math.max(0, bb[5] - bb[2]);
  }

  function bboxesClose(a, b, tol = 0.05) {
    if (!a || !b || a.length < 6 || b.length < 6) return false;
    for (let i = 0; i < 6; i++) {
      if (Math.abs(a[i] - b[i]) > tol) return false;
    }
    return true;
  }

  function keepOuterShellOnly(shape) {
    if (!shape || !shape.wrapped) return shape;
    const TA = oc.TopAbs_ShapeEnum;
    const solids = extractSolids(shape);
    if (!solids.length) return shape.clone();
    const outSolids = [];
    for (const sol of solids) {
      const shells = uniqueShapes(sol.wrapped, TA.TopAbs_SHELL);
      if (shells.length <= 1) {
        for (const sh of shells) safeDelete(sh);
        outSolids.push(sol);
        continue;
      }
      let bestShell = null;
      let bestVol = -1;
      for (const sh of shells) {
        let wrap = null;
        try {
          wrap = R.cast(sh);
          const v = bboxVolumeOf(bboxOf(wrap));
          if (v > bestVol) { bestVol = v; bestShell = sh; }
        } catch (_) {}
      }
      let built = null;
      if (bestShell) {
        let ms = null;
        try {
          ms = new oc.BRepBuilderAPI_MakeSolid(oc.TopoDS.Shell(bestShell));
          let cand = R.cast(ms.Solid());
          if (cand && R.isShape3D(cand)) {
            if (R.measureVolume(cand) < 0) {
              const rev = R.cast(cand.wrapped.Reversed());
              safeDelete(cand);
              cand = rev;
            }
            built = cand;
          } else {
            safeDelete(cand);
          }
        } catch (_) {
          safeDelete(built);
          built = null;
        } finally {
          if (ms && ms.delete) try { ms.delete(); } catch (_) {}
        }
      }
      for (const sh of shells) safeDelete(sh);
      if (built) {
        safeDelete(sol);
        outSolids.push(built);
      } else {
        outSolids.push(sol);
      }
    }
    if (outSolids.length === 1) return outSolids[0];
    const comp = R.makeCompound(outSolids);
    for (const s of outSolids) safeDelete(s);
    return comp;
  }

  function fillSolidHoles(solid) {
    if (!solid || !solid.wrapped) return null;
    const TA = oc.TopAbs_ShapeEnum;
    const ORI = oc.TopAbs_Orientation;
    const origCount = countFacesOf(solid);
    const origBb = bboxOf(solid);
    const fl = topoList(solid, 'face');
    if (fl.length <= 6) {
      for (const f of fl) f.shape.delete();
      return null;
    }

    const hostMap = new Map(); // fi -> { outerWire, reversed }
    const outerEdges = new Set(); // edge hash strings (bucketed by IsSame below)
    const innerEdgeEntries = []; // { hc, edge, hostFi }
    const edgeAdj = new Map(); // hc -> [{ edge, faces: Set<fi> }]

    const addEdgeAdj = (hc, ed, fi) => {
      let arr = edgeAdj.get(hc);
      if (!arr) { arr = []; edgeAdj.set(hc, arr); }
      let entry = arr.find((x) => x.edge.IsSame(ed));
      if (!entry) { entry = { edge: ed, faces: new Set() }; arr.push(entry); }
      else safeDelete(ed);
      entry.faces.add(fi);
    };

    const collectWireEdgeHashes = (wireRaw) => {
      const list = [];
      const ex = new oc.TopExp_Explorer(wireRaw, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
      try {
        while (ex.More()) {
          const ed = oc.TopoDS.Edge(ex.Current());
          const hc = oc.ReplicadShapeHasher.HashCode(ed, HMAX);
          list.push({ hc, ed });
          ex.Next();
        }
      } finally { ex.delete(); }
      return list;
    };

    const outerEdgeEntries = [];
    try {
      for (let fi = 0; fi < fl.length; fi++) {
        const fw = fl[fi].shape.wrapped;
        const exAll = new oc.TopExp_Explorer(fw, TA.TopAbs_EDGE, TA.TopAbs_SHAPE);
        try {
          while (exAll.More()) {
            const ed = oc.TopoDS.Edge(exAll.Current());
            const hc = oc.ReplicadShapeHasher.HashCode(ed, HMAX);
            addEdgeAdj(hc, ed, fi);
            exAll.Next();
          }
        } finally { exAll.delete(); }

        if (fl[fi].shape.geomType !== 'PLANE') continue;
        const wires = uniqueShapes(fw, TA.TopAbs_WIRE);
        if (wires.length <= 1) {
          for (const w of wires) safeDelete(w);
          continue;
        }
        let ow = null;
        try { ow = oc.BRepTools.OuterWire(fw); } catch (_) { ow = null; }
        if (!ow || ow.IsNull()) {
          safeDelete(ow);
          for (const w of wires) safeDelete(w);
          continue;
        }
        hostMap.set(fi, { outerWire: ow, reversed: fw.Orientation() === ORI.TopAbs_REVERSED });
        for (const x of collectWireEdgeHashes(ow)) {
          outerEdges.add(x.hc);
          outerEdgeEntries.push(x);
        }
        for (const w of wires) {
          if (!w.IsSame(ow)) {
            for (const x of collectWireEdgeHashes(w)) {
              innerEdgeEntries.push({ ...x, hostFi: fi });
            }
          }
          safeDelete(w);
        }
      }

      if (!hostMap.size || !innerEdgeEntries.length) return null;

      const isOuterEdge = (hc, ed) => {
        if (!outerEdges.has(hc)) return false;
        return outerEdgeEntries.some((x) => x.hc === hc && x.ed.IsSame(ed));
      };

      const dropFaces = new Set();
      const queue = [];
      for (const ie of innerEdgeEntries) {
        const arr = edgeAdj.get(ie.hc);
        if (!arr) continue;
        const entry = arr.find((x) => x.edge.IsSame(ie.ed));
        if (!entry) continue;
        for (const nfi of entry.faces) {
          if (nfi === ie.hostFi || hostMap.has(nfi) || dropFaces.has(nfi)) continue;
          dropFaces.add(nfi);
          queue.push(nfi);
        }
      }

      const faceEdges = new Map();
      for (const arr of edgeAdj.values()) {
        for (const entry of arr) {
          for (const fi of entry.faces) {
            let list = faceEdges.get(fi);
            if (!list) { list = []; faceEdges.set(fi, list); }
            list.push(entry);
          }
        }
      }

      while (queue.length) {
        const curFi = queue.shift();
        for (const entry of (faceEdges.get(curFi) || [])) {
          const hc = oc.ReplicadShapeHasher.HashCode(entry.edge, HMAX);
          if (isOuterEdge(hc, entry.edge)) continue;
          for (const nfi of entry.faces) {
            if (nfi === curFi || hostMap.has(nfi) || dropFaces.has(nfi)) continue;
            dropFaces.add(nfi);
            queue.push(nfi);
          }
        }
      }

      if (!dropFaces.size) return null;

      let sew = null, sewed = null, ms = null, rawSolid = null, unified = null, usd = null;
      const tempFaces = [];
      try {
        sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
        for (let fi = 0; fi < fl.length; fi++) {
          if (dropFaces.has(fi)) continue;
          const hm = hostMap.get(fi);
          if (hm) {
            const mf = new oc.BRepBuilderAPI_MakeFace(oc.TopoDS.Wire(hm.outerWire), true);
            try {
              if (!mf.IsDone()) return null;
              let nf = mf.Face();
              if (hm.reversed) {
                const rf = oc.TopoDS.Face(nf.Reversed());
                safeDelete(nf);
                nf = rf;
              }
              tempFaces.push(nf);
              sew.Add(nf);
            } finally { mf.delete(); }
          } else {
            sew.Add(fl[fi].shape.wrapped);
          }
        }
        sew.Perform();
        sewed = sew.SewedShape();
        const shells = uniqueShapes(sewed, TA.TopAbs_SHELL);
        if (!shells.length) return null;
        let bestShell = shells[0];
        let bestVol = -1;
        for (const sh of shells) {
          try {
            const v = bboxVolumeOf(bboxOf(R.cast(sh)));
            if (v > bestVol) { bestVol = v; bestShell = sh; }
          } catch (_) {}
        }
        ms = new oc.BRepBuilderAPI_MakeSolid(oc.TopoDS.Shell(bestShell));
        for (const sh of shells) safeDelete(sh);
        rawSolid = R.cast(ms.Solid());
        if (!rawSolid || !R.isShape3D(rawSolid)) { safeDelete(rawSolid); return null; }
        if (R.measureVolume(rawSolid) < 0) {
          const rev = R.cast(rawSolid.wrapped.Reversed());
          safeDelete(rawSolid);
          rawSolid = rev;
        }
        usd = new oc.ShapeUpgrade_UnifySameDomain(rawSolid.wrapped, true, true, false);
        usd.Build();
        unified = R.cast(usd.Shape());
        if (!unified || !R.isShape3D(unified)) {
          safeDelete(unified);
          unified = rawSolid;
          rawSolid = null;
        }
        const candVol = Math.abs(R.measureVolume(unified));
        const candBb = bboxOf(unified);
        const candFaces = countFacesOf(unified);
        if (!(candVol > 1e-6) || !bboxesClose(origBb, candBb, 0.05) || candFaces >= origCount) {
          safeDelete(unified);
          return null;
        }
        return unified;
      } catch (_) {
        safeDelete(unified);
        return null;
      } finally {
        for (const tf of tempFaces) safeDelete(tf);
        if (usd && usd.delete) try { usd.delete(); } catch (_) {}
        if (ms && ms.delete) try { ms.delete(); } catch (_) {}
        safeDelete(rawSolid);
        safeDelete(sewed);
        if (sew && sew.delete) try { sew.delete(); } catch (_) {}
      }
    } finally {
      for (const hm of hostMap.values()) safeDelete(hm.outerWire);
      for (const x of outerEdgeEntries) safeDelete(x.ed);
      for (const x of innerEdgeEntries) safeDelete(x.ed);
      for (const arr of edgeAdj.values()) for (const e of arr) safeDelete(e.edge);
      for (const f of fl) f.shape.delete();
    }
  }

  function simplifyOuterSolid(shape, opts = {}) {
    let cur = keepOuterShellOnly(shape);
    let filledHoles = 0;
    const solids = extractSolids(cur);
    if (solids.length) {
      const nextSolids = [];
      for (const sol of solids) {
        let work = sol;
        if (opts.fillHoles !== false) {
          const filled = fillSolidHoles(work);
          if (filled) {
            filledHoles++;
            safeDelete(work);
            work = filled;
          }
        }
        if (opts.simplifyDetails !== false) {
          try {
            const fc = countFacesOf(work);
            const bb = bboxOf(work);
            const dx = Math.max(0, bb[3] - bb[0]);
            const dy = Math.max(0, bb[4] - bb[1]);
            const dz = Math.max(0, bb[5] - bb[2]);
            const bVol = dx * dy * dz;
            const vol = Math.abs(R.measureVolume(work));
            if (fc > 6 && bVol > 1e-6 && vol / bVol > 0.85) {
              const bx = R.makeBox([bb[0], bb[1], bb[2]], [bb[3], bb[4], bb[5]]);
              safeDelete(work);
              work = bx;
            } else if (fc > 12 && bVol > 1e-6 && dx > 1e-3 && Math.abs(dx - dy) <= 0.03 * Math.max(dx, dy) && vol / bVol >= 0.45 && vol / bVol <= 0.83) {
              const cyl = R.makeCylinder(dx / 2, dz, [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, bb[2]], [0, 0, 1]);
              if (bboxesClose(bb, bboxOf(cyl), 0.05)) {
                safeDelete(work);
                work = cyl;
              } else {
                safeDelete(cyl);
              }
            }
          } catch (_) {}
        }
        nextSolids.push(work);
      }
      safeDelete(cur);
      if (nextSolids.length === 1) cur = nextSolids[0];
      else {
        cur = R.makeCompound(nextSolids);
        for (const s of nextSolids) safeDelete(s);
      }
    }
    return { shape: cur, filledHoles };
  }

  function buildEnvelope(scene, opts = {}) {
    ingestBlobs(scene);
    const errors = [];
    const only = Array.isArray(opts.only) && opts.only.length ? new Set(opts.only) : null;
    let solids = evaluateShapes(scene, errors);
    if (only) {
      const kept = [];
      for (const s of solids) {
        if (only.has(s.id)) kept.push(s);
        else safeDelete(s.shape);
      }
      solids = kept;
    }
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
          if (kept.length > 1) for (const k of kept) safeDelete(k);
        } else {
          for (const p of parts) safeDelete(p.shape);
        }
      }
      filtered.push(s);
    }
    solids = filtered;
    if (!solids.length) throw new Error('Keine Körper für die vereinfachte Hülle gefunden.');

    const mode = opts.mode === 'box' || opts.mode === 'boxes' ? opts.mode : 'outer';
    const fillHoles = opts.fillHoles !== false;
    const removeInternal = opts.removeInternal !== false;
    const simplifyDetails = opts.simplifyDetails !== false;
    const minPartSize = Math.max(0, Number(opts.minPartSize) || 0);

    let origFaces = 0;
    let origBbox = null;
    const allSubs = [];
    const tempShapes = [];
    let finalShape = null;

    try {
      const origParts = solids.length;
      for (const s of solids) {
        origFaces += countFacesOf(s.shape);
        const sb = bboxOf(s.shape);
        origBbox = origBbox
          ? [Math.min(origBbox[0], sb[0]), Math.min(origBbox[1], sb[1]), Math.min(origBbox[2], sb[2]), Math.max(origBbox[3], sb[3]), Math.max(origBbox[4], sb[4]), Math.max(origBbox[5], sb[5])]
          : sb;
        const subs = extractSolids(s.shape);
        for (const sub of subs) {
          tempShapes.push(sub);
          allSubs.push({ shape: sub, bbox: bboxOf(sub) });
        }
      }

      let removedInternal = 0;
      let filledHoles = 0;

      if (mode === 'box') {
        finalShape = R.makeBox([origBbox[0], origBbox[1], origBbox[2]], [origBbox[3], origBbox[4], origBbox[5]]);
      } else {
        const isAnchor = (bb) => {
          for (let i = 0; i < 6; i++) {
            if (Math.abs(bb[i] - origBbox[i]) <= 1e-3) return true;
          }
          return false;
        };
        const strictInside = (inner, outer, margin = 0.02) => (
          inner[0] >= outer[0] + margin && inner[3] <= outer[3] - margin
          && inner[1] >= outer[1] + margin && inner[4] <= outer[4] - margin
          && inner[2] >= outer[2] + margin && inner[5] <= outer[5] - margin
        );

        const keptSubs = [];
        for (let i = 0; i < allSubs.length; i++) {
          const cur = allSubs[i];
          const anchor = isAnchor(cur.bbox);
          const maxDim = Math.max(cur.bbox[3] - cur.bbox[0], cur.bbox[4] - cur.bbox[1], cur.bbox[5] - cur.bbox[2]);
          if (!anchor && minPartSize > 0 && maxDim < minPartSize) {
            removedInternal++;
            continue;
          }
          let enclosed = false;
          if (!anchor && removeInternal) {
            for (let j = 0; j < allSubs.length; j++) {
              if (i === j) continue;
              const other = allSubs[j];
              if (!strictInside(cur.bbox, other.bbox, 0.02)) continue;
              let shellOther = null;
              let rem = null;
              try {
                shellOther = keepOuterShellOnly(other.shape);
                const vi = Math.abs(R.measureVolume(cur.shape));
                rem = cur.shape.cut(shellOther);
                const vr = Math.abs(R.measureVolume(rem));
                if (vi > 1e-6 && vr < 0.01 * vi) enclosed = true;
              } catch (_) {
                enclosed = true;
              } finally {
                safeDelete(rem);
                safeDelete(shellOther);
              }
              if (enclosed) break;
            }
          }
          if (enclosed) {
            removedInternal++;
            continue;
          }
          keptSubs.push(cur);
        }
        if (!keptSubs.length && allSubs.length) keptSubs.push(...allSubs);

        const workSolids = [];
        for (const ks of keptSubs) {
          if (mode === 'boxes') {
            const b = ks.bbox;
            const bx = R.makeBox([b[0], b[1], b[2]], [b[3], b[4], b[5]]);
            tempShapes.push(bx);
            workSolids.push({ shape: bx, bbox: b });
          } else {
            const simp = simplifyOuterSolid(ks.shape, { fillHoles, simplifyDetails });
            filledHoles += simp.filledHoles;
            tempShapes.push(simp.shape);
            workSolids.push({ shape: simp.shape, bbox: bboxOf(simp.shape) });
          }
        }

        // Berührende/überlappende Körper zu geschlossenen Außenhüllen verschmelzen
        const n = workSolids.length;
        const parent = Array.from({ length: n }, (_, k) => k);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (bboxHit(workSolids[i].bbox, workSolids[j].bbox, 0.05)) union(i, j);
          }
        }
        const groups = new Map();
        for (let i = 0; i < n; i++) {
          const r = find(i);
          let arr = groups.get(r);
          if (!arr) { arr = []; groups.set(r, arr); }
          arr.push(workSolids[i].shape);
        }

        const mergedList = [];
        for (const grp of groups.values()) {
          if (grp.length === 1) {
            const outer = keepOuterShellOnly(grp[0]);
            mergedList.push(outer);
          } else {
            let fused = null;
            let usd = null;
            let unified = null;
            try {
              fused = fuseAll(grp, false);
              usd = new oc.ShapeUpgrade_UnifySameDomain(fused.wrapped, true, true, false);
              usd.Build();
              unified = R.cast(usd.Shape());
              const base = unified && R.isShape3D(unified) ? unified : fused;
              mergedList.push(keepOuterShellOnly(base));
            } catch (_) {
              for (const g of grp) mergedList.push(keepOuterShellOnly(g));
            } finally {
              if (usd && usd.delete) try { usd.delete(); } catch (_) {}
              if (unified && unified !== fused) safeDelete(unified);
              if (fused && !grp.includes(fused)) safeDelete(fused);
            }
          }
        }

        if (mergedList.length === 1) {
          finalShape = mergedList[0];
        } else {
          finalShape = R.makeCompound(mergedList);
          for (const m of mergedList) safeDelete(m);
        }

        const curFaces = countFacesOf(finalShape);
        if (curFaces >= origFaces && origParts > 1) {
          safeDelete(finalShape);
          finalShape = R.makeBox([origBbox[0], origBbox[1], origBbox[2]], [origBbox[3], origBbox[4], origBbox[5]]);
        }
      }

      const envFaces = countFacesOf(finalShape);
      const envBbox = bboxOf(finalShape);
      const envSolids = extractSolids(finalShape);
      const envSolidCount = envSolids.length || 1;
      for (const s of envSolids) safeDelete(s);
      const brepStr = oc.BRepToolsWrapper.Write(finalShape.wrapped);
      if (!brepStr || !brepStr.length) throw new Error('Vereinfachte Hülle konnte nicht geschrieben werden.');
      const brepBytes = new TextEncoder().encode(brepStr);

      return {
        brepBytes,
        origFaces,
        envFaces,
        origParts,
        envSolids: envSolidCount,
        origBbox,
        envBbox,
        removedInternal,
        filledHoles,
        mode,
        errors,
      };
    } finally {
      safeDelete(finalShape);
      for (const ts of tempShapes) safeDelete(ts);
      for (const s of solids) safeDelete(s.shape);
    }
  }

  return { evaluate, remesh, exportMeshes, exportSTEP, exportIGES, exportBREP, exportSingleBody, measure, minDistance, project, clashes, clearances, holeWalls, faceLoopsOf, faceGridOf, sectionOf, silhouetteOf, faceIntersectOf, checkGeometry, checkSymmetry, compareSolids, checkImport, healImport, buildEnvelope, getStats, resetStats, clearCache, _cache: cache };
}
