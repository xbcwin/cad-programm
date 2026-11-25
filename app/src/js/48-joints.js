// ================= Gelenke & Verbindungen: fest (starr), Drehen, Schieben, Zylindrisch, Eben, Kugel, Stift im Langloch, Winkel, Mittig, Parallel, Tangential, Abstand =================
// Ein Gelenk / eine Verbindung ist kein Schritt der Zeitleiste: Es setzt die Lage des beweglichen Teils (doc.joints).
// Mehrere Verbindungen und Gelenke bilden eine Kette: Bewegt sich ein vorderes Teil, wandern alle Teile und Gelenkachsen dahinter mit.
// home = Lage des beweglichen Teils in der Nullstellung; ao/ad (und au bei eben/kugel/langloch) in Weltkoordinaten.
const Joints = (() => {
  const list = (doc = App.doc) => (doc && doc.joints) || [];
  const allOf = (id, doc = App.doc) => list(doc).filter((j) => j.a === id || j.b === id);
  const of = (id, doc = App.doc) => list(doc).find((j) => j.b === id) || list(doc).find((j) => j.a === id) || null;
  const isLooseKind = (k) => k === 'parallel' || k === 'tangent' || k === 'distance';
  const kindOf = (j) => (j && (j.kind === 'fixed' || j.kind === 'slide' || j.kind === 'cyl' || j.kind === 'planar' || j.kind === 'ball' || j.kind === 'slot' || j.kind === 'angle' || j.kind === 'center' || isLooseKind(j.kind)) ? j.kind : 'rot');
  const fixed = (j) => kindOf(j) === 'fixed';
  const slide = (j) => kindOf(j) === 'slide';
  const isCyl = (j) => kindOf(j) === 'cyl';
  const isPlanar = (j) => kindOf(j) === 'planar';
  const isBall = (j) => kindOf(j) === 'ball';
  const isSlot = (j) => kindOf(j) === 'slot';
  const isAngle = (j) => kindOf(j) === 'angle';
  const isCenter = (j) => kindOf(j) === 'center';
  const isParallel = (j) => kindOf(j) === 'parallel';
  const isTangent = (j) => kindOf(j) === 'tangent';
  const isDistance = (j) => kindOf(j) === 'distance';
  const isLoose = (j) => isLooseKind(kindOf(j));
  const isConstraint = (j) => fixed(j) || isAngle(j) || isCenter(j);
  const drivingOf = (id, doc = App.doc) => list(doc).find((j) => j.b === id && !isLoose(j)) || null;
  const looseOf = (id, doc = App.doc) => list(doc).filter((j) => isLoose(j) && j.b === id);
  const isFixedPart = (id, doc = App.doc) => list(doc).some((j) => j.kind === 'fixed' && j.b === id);
  const fixedJointOf = (id, doc = App.doc) => list(doc).find((j) => j.kind === 'fixed' && j.b === id) || null;
  const r6 = (arr) => arr.map((v) => round(v, 6));
  const r9 = (arr) => arr.map((v) => round(v, 9));

  // Teil suchen – auch innerhalb von Gruppen (seit Sitzung 52)
  const top = (id, doc = App.doc) => { if (!doc || !doc.items) return null; const f = Model.find(doc, id); return f ? f.item : null; };
  const isTop = (id, doc = App.doc) => !!(doc && doc.items && doc.items.some((x) => x.id === id));
  // Bewegung M (in Weltkoordinaten) für ein Teil in einer Gruppe: im Koordinatensystem der Gruppe ausdrücken
  const conj = (doc, id, M) => { const P = Model.parentWorld(doc, id); return P.clone().invert().multiply(M).multiply(P); };
  const related = (doc, a, b) => Model.parentsOf(doc, a).some((p) => p.id === b) || Model.parentsOf(doc, b).some((p) => p.id === a);
  const inOp = (doc, id) => Model.parentsOf(doc, id).some((p) => p.p && p.p.op);
  function refuse(doc, A, B) {
    if (related(doc, A.id, B.id)) return 'Ein Teil kann keine Verbindung mit der eigenen Gruppe bekommen – wähl zwei Teile nebeneinander.';
    if (inOp(doc, A.id) || inOp(doc, B.id)) return 'Teile in einem Muster oder einer Rechen-Gruppe (Teilen, Schnittmenge) können keine Verbindung bekommen.';
    return null;
  }

  function fracOf(p, b) {
    if (!p || !b) return null;
    const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
    return [dx > 1e-6 ? round((p[0] - b[0]) / dx, 6) : 0.5, dy > 1e-6 ? round((p[1] - b[1]) / dy, 6) : 0.5, dz > 1e-6 ? round((p[2] - b[2]) / dz, 6) : 0.5];
  }

  // Deterministische Tangente senkrecht zur Normale (Projektion einer festen Achse vermeidet 180°-Sprünge)
  function canonicalX(n) {
    const nv = new THREE.Vector3(...n).normalize();
    let ref = Math.abs(nv.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    let x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    if (x.lengthSq() < 1e-9) {
      ref = new THREE.Vector3(0, 1, 0);
      x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    }
    return x.normalize();
  }
  function orthoBasis(zDir, xHint) {
    const Z = zDir.clone().normalize();
    let X = xHint ? xHint.clone().addScaledVector(Z, -xHint.dot(Z)) : canonicalX(Z.toArray());
    if (X.lengthSq() < 1e-9) X = canonicalX(Z.toArray());
    X.normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  }
  function maxMatDiff(a, b) {
    let m = 0;
    for (let i = 0; i < 16; i++) m = Math.max(m, Math.abs(a.elements[i] - b.elements[i]));
    return m;
  }

  // ---------- 3D-Geometrie-Helfer für Achsen und Ebenen ----------
  function rotBetween(from, to, hintAxis = null) {
    const a = from.clone().normalize(), b = to.clone().normalize();
    const dot = a.dot(b);
    if (dot > 1 - 1e-10) return new THREE.Quaternion();
    if (dot < -1 + 1e-10) {
      let ax = null;
      if (hintAxis) {
        const perp = hintAxis.clone().addScaledVector(a, -hintAxis.dot(a));
        if (perp.lengthSq() > 1e-6) ax = perp.normalize();
      }
      if (!ax) {
        const ref = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        ax = new THREE.Vector3().crossVectors(a, ref).normalize();
      }
      return new THREE.Quaternion().setFromAxisAngle(ax, Math.PI);
    }
    return new THREE.Quaternion().setFromUnitVectors(a, b);
  }
  function planeBasis(nVec, hintU = null) {
    const n = nVec.clone().normalize();
    let u = hintU ? hintU.clone().addScaledVector(n, -hintU.dot(n)) : null;
    if (!u || u.lengthSq() < 1e-10) {
      const ref = Math.abs(n.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      u = new THREE.Vector3().crossVectors(ref, n);
    }
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    return { n, u, v };
  }
  function planeFrame(j) {
    const o = new THREE.Vector3(...(j.ao || [0, 0, 0]));
    const n = new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize();
    const hint = Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null;
    const { u, v } = planeBasis(n, hint);
    return { o, n, u, v };
  }
  function frameOf(j) {
    if (isPlanar(j) || isBall(j)) return planeFrame(j);
    if (isSlot(j)) {
      const o = new THREE.Vector3(...(j.ao || [0, 0, 0]));
      const d = new THREE.Vector3(...(j.ad || [1, 0, 0])).normalize();
      const n = planeBasis(d, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null).u;
      return { o, d, n, minPos: j.minPos ?? -10, maxPos: j.maxPos ?? 10 };
    }
    return { o: new THREE.Vector3(...(j.ao || [0, 0, 0])), d: new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize() };
  }
  function cylPointOnAxis(fi) {
    const l = new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]);
    const d = new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]).normalize();
    if (Array.isArray(fi.c)) {
      const c = new THREE.Vector3(...fi.c);
      l.addScaledVector(d, c.sub(l).dot(d));
    }
    return { l, d };
  }
  function cylAxisOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    if (Array.isArray(ref.o) && Array.isArray(ref.d)) {
      const dv = new THREE.Vector3(...ref.d);
      if (dv.lengthSq() < 1e-12) return null;
      return { id: ref.id, o: new THREE.Vector3(...ref.o), d: dv.normalize(), what: ref.what || 'Zylinderachse' };
    }
    const r = App.results.get(ref.id);
    const faces = (r && r.data && r.data.faces) || [];
    let fi = ref.faceIdx != null && ref.faceIdx >= 0 ? faces[ref.faceIdx] : null;
    if (!fi || fi.t !== 'CYLINDRE' || !fi.axis) fi = faces.find((f) => f && f.t === 'CYLINDRE' && Array.isArray(f.axis));
    if (!fi || !Array.isArray(fi.axis)) return null;
    const { l, d } = cylPointOnAxis(fi);
    const M = Model.worldMatrix(doc, ref.id);
    return { id: ref.id, o: l.applyMatrix4(M), d: d.transformDirection(M).normalize(), what: 'Zylinderfläche' };
  }
  function planarFaceOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    if (Array.isArray(ref.p) && Array.isArray(ref.n)) {
      const nv = new THREE.Vector3(...ref.n);
      if (nv.lengthSq() < 1e-12) return null;
      return { id: ref.id, p: new THREE.Vector3(...ref.p), n: nv.normalize(), what: ref.what || 'ebene Fläche' };
    }
    const r = App.results.get(ref.id);
    const faces = (r && r.data && r.data.faces) || [];
    let fi = ref.faceIdx != null && ref.faceIdx >= 0 ? faces[ref.faceIdx] : null;
    if (!fi || fi.t !== 'PLANE' || !fi.n) fi = faces.find((f) => f && f.t === 'PLANE' && Array.isArray(f.n) && Array.isArray(f.c));
    if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.n) || !Array.isArray(fi.c)) return null;
    const M = Model.worldMatrix(doc, ref.id);
    return {
      id: ref.id,
      p: new THREE.Vector3(...fi.c).applyMatrix4(M),
      n: new THREE.Vector3(...fi.n).transformDirection(M).normalize(),
      what: 'ebene Fläche',
    };
  }
  function cylHitOf(hit) {
    const n = hit && hit.node;
    if (!n) return null;
    const M = n.obj.matrixWorld;
    if (hit.faceIdx != null && hit.faceIdx >= 0) {
      const fi = n.data && n.data.faces && n.data.faces[hit.faceIdx];
      if (fi && fi.t === 'CYLINDRE' && Array.isArray(fi.axis)) {
        const { l, d } = cylPointOnAxis(fi);
        return { id: hit.id, faceIdx: hit.faceIdx, o: l.applyMatrix4(M), d: d.transformDirection(M).normalize(), what: 'Zylinderfläche' };
      }
    }
    if (hit.edgeIdx != null) {
      const g = n.data && n.data.edges && n.data.edges[hit.edgeIdx];
      const pos = Viewer.edgePositions(n, hit.edgeIdx);
      if (g && g.t === 'CIRCLE' && pos && pos.length >= 9) {
        const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M);
        const k = pos.length / 3;
        const a = P(0), b = P(Math.floor(k / 3)), c = P(Math.floor((2 * k) / 3));
        const ab = b.clone().sub(a), ac = c.clone().sub(a), nn = new THREE.Vector3().crossVectors(ab, ac), l2 = nn.lengthSq();
        if (l2 > 1e-12) {
          const cc = new THREE.Vector3().crossVectors(nn, ab).multiplyScalar(ac.lengthSq()).add(new THREE.Vector3().crossVectors(ac, nn).multiplyScalar(ab.lengthSq())).divideScalar(2 * l2).add(a);
          return { id: hit.id, edgeIdx: hit.edgeIdx, o: cc, d: nn.normalize(), what: 'runder Rand' };
        }
      }
    }
    return null;
  }
  function planarHitOf(hit) {
    const n = hit && hit.node;
    if (!n || hit.faceIdx == null || hit.faceIdx < 0) return null;
    const fi = n.data && n.data.faces && n.data.faces[hit.faceIdx];
    if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.n) || !Array.isArray(fi.c)) return null;
    const M = n.obj.matrixWorld;
    return {
      id: hit.id,
      faceIdx: hit.faceIdx,
      p: new THREE.Vector3(...fi.c).applyMatrix4(M),
      n: new THREE.Vector3(...fi.n).transformDirection(M).normalize(),
      what: 'ebene Fläche',
    };
  }
  function ballPointOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    const M = Model.worldMatrix(doc, ref.id);
    if (Array.isArray(ref.p)) {
      const pv = new THREE.Vector3(...ref.p);
      return { id: ref.id, p: ref.local ? pv.applyMatrix4(M) : pv, what: ref.what || 'Punkt' };
    }
    if (Array.isArray(ref.c)) {
      const cv = new THREE.Vector3(...ref.c);
      return { id: ref.id, p: ref.world ? cv : cv.applyMatrix4(M), what: ref.what || 'Punkt' };
    }
    const r = App.results.get(ref.id);
    const data = r && r.data;
    const faces = (data && data.faces) || [];
    const edges = (data && data.edges) || [];
    if (ref.faceIdx != null && ref.faceIdx >= 0 && faces[ref.faceIdx]) {
      const fi = faces[ref.faceIdx];
      if (fi.t === 'SPHERE' && Array.isArray(fi.sc)) return { id: ref.id, p: new THREE.Vector3(...fi.sc).applyMatrix4(M), what: 'Kugelmitte' };
      if (fi.t === 'CYLINDRE' && Array.isArray(fi.axis)) return { id: ref.id, p: cylPointOnAxis(fi).l.applyMatrix4(M), what: 'Achsenpunkt' };
      if (Array.isArray(fi.c)) return { id: ref.id, p: new THREE.Vector3(...fi.c).applyMatrix4(M), what: 'Flächenmitte' };
    }
    if (ref.edgeIdx != null && edges[ref.edgeIdx]) {
      const g = edges[ref.edgeIdx];
      if (g.t === 'CIRCLE' && Array.isArray(g.c)) return { id: ref.id, p: new THREE.Vector3(...g.c).applyMatrix4(M), what: 'Kreismitte' };
      if (Array.isArray(g.m)) return { id: ref.id, p: new THREE.Vector3(...g.m).applyMatrix4(M), what: 'Kantenmitte' };
    }
    const sph = faces.find((f) => f && f.t === 'SPHERE' && Array.isArray(f.sc));
    if (sph) return { id: ref.id, p: new THREE.Vector3(...sph.sc).applyMatrix4(M), what: 'Kugelmitte' };
    if (data && Array.isArray(data.bbox)) {
      const b = data.bbox;
      return { id: ref.id, p: new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2).applyMatrix4(M), what: 'Mitte' };
    }
    return null;
  }
  function ballHitOf(hit, cx, cy) {
    const n = hit && hit.node;
    if (!n) return null;
    const M = n.obj.matrixWorld;
    const faces = (n.data && n.data.faces) || [];
    const edges = (n.data && n.data.edges) || [];
    if (hit.faceIdx != null && hit.faceIdx >= 0) {
      const fi = faces[hit.faceIdx];
      if (fi && fi.t === 'SPHERE' && Array.isArray(fi.sc)) {
        return { id: hit.id, faceIdx: hit.faceIdx, p: new THREE.Vector3(...fi.sc).applyMatrix4(M), what: 'Kugelmitte' };
      }
    }
    if (hit.edgeIdx != null && edges[hit.edgeIdx] && cx != null && cy != null) {
      const g = edges[hit.edgeIdx];
      const r = Viewer.canvas.getBoundingClientRect();
      const cand = [['a', g.a, 'Punkt'], ['b', g.b, 'Punkt'], ['m', g.m, 'Kantenmitte'], ['c', g.c, 'Kreismitte']].filter((x) => Array.isArray(x[1]));
      let best = null, bd = 10;
      for (const [, pt, lbl] of cand) {
        const w = new THREE.Vector3(...pt).applyMatrix4(M);
        const s = Viewer.toScreen(w);
        const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top));
        if (d < bd) { bd = d; best = { p: w, what: lbl }; }
      }
      if (best) return { id: hit.id, edgeIdx: hit.edgeIdx, p: best.p, what: best.what };
    }
    if (hit.faceIdx != null && hit.faceIdx >= 0) {
      const fi = faces[hit.faceIdx];
      if (fi && fi.t === 'CYLINDRE' && Array.isArray(fi.axis)) {
        return { id: hit.id, faceIdx: hit.faceIdx, p: cylPointOnAxis(fi).l.applyMatrix4(M), what: 'Achsenpunkt' };
      }
    }
    return { id: hit.id, faceIdx: hit.faceIdx, p: hit.point.clone(), what: 'Punkt' };
  }
  function detectSlotPairs(data) {
    const faces = (data && data.faces) || [];
    const cyls = [];
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f || f.t !== 'CYLINDRE' || !Array.isArray(f.axis) || !(f.r > 0)) continue;
      const { l, d } = cylPointOnAxis(f);
      cyls.push({ idx: i, r: f.r, l, d });
    }
    const pairs = [];
    for (let a = 0; a < cyls.length; a++) {
      for (let b = a + 1; b < cyls.length; b++) {
        const ca = cyls[a], cb = cyls[b];
        if (Math.abs(ca.r - cb.r) > 0.05) continue;
        if (Math.abs(ca.d.dot(cb.d)) < 0.999) continue;
        const v = cb.l.clone().sub(ca.l);
        if (Math.abs(v.dot(ca.d)) > 1.0) continue;
        const vPerp = v.clone().addScaledVector(ca.d, -v.dot(ca.d));
        const len = vPerp.length();
        if (len <= 0.1) continue;
        const u = vPerp.clone().divideScalar(len);
        const mid = ca.l.clone().add(cb.l).multiplyScalar(0.5);
        const walls = [];
        for (let k = 0; k < faces.length; k++) {
          const fk = faces[k];
          if (!fk || fk.t !== 'PLANE' || !Array.isArray(fk.n) || !Array.isArray(fk.c)) continue;
          const nf = new THREE.Vector3(...fk.n).normalize();
          if (Math.abs(nf.dot(ca.d)) > 0.05 || Math.abs(nf.dot(u)) > 0.05) continue;
          const fc = new THREE.Vector3(...fk.c).sub(mid);
          if (Math.abs(Math.abs(fc.dot(nf)) - ca.r) < 0.15 && Math.abs(fc.dot(u)) < len / 2 + 0.25) walls.push(k);
        }
        pairs.push({ i: ca.idx, j: cb.idx, p1: ca.l, p2: cb.l, mid, u, n: ca.d.clone(), len, r: ca.r, walls });
      }
    }
    pairs.sort((x, y) => (y.walls.length >= 2) - (x.walls.length >= 2) || y.walls.length - x.walls.length || x.len - y.len);
    return pairs;
  }
  function slotCenterlineOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    const M = Model.worldMatrix(doc, ref.id);
    if (Array.isArray(ref.p0) && Array.isArray(ref.p1)) {
      const p0 = new THREE.Vector3(...ref.p0), p1 = new THREE.Vector3(...ref.p1);
      if (ref.local) { p0.applyMatrix4(M); p1.applyMatrix4(M); }
      const dv = p1.clone().sub(p0), len = dv.length();
      if (len < 1e-6) return null;
      const d = dv.divideScalar(len);
      const o = p0.clone().add(p1).multiplyScalar(0.5);
      let n = Array.isArray(ref.n) ? new THREE.Vector3(...ref.n) : canonicalX(d.toArray());
      if (ref.local && Array.isArray(ref.n)) n.transformDirection(M);
      n = planeBasis(d, n).u;
      return { id: ref.id, p0, p1, o, d, n, len, r: Number(ref.r) || 0, what: ref.what || 'Langloch' };
    }
    if (Array.isArray(ref.o) && Array.isArray(ref.d) && Number.isFinite(+ref.len) && +ref.len > 1e-6) {
      const len = +ref.len;
      const o = new THREE.Vector3(...ref.o), d = new THREE.Vector3(...ref.d);
      if (ref.local) { o.applyMatrix4(M); d.transformDirection(M); }
      if (d.lengthSq() < 1e-12) return null;
      d.normalize();
      let n = Array.isArray(ref.n) ? new THREE.Vector3(...ref.n) : canonicalX(d.toArray());
      if (ref.local && Array.isArray(ref.n)) n.transformDirection(M);
      n = planeBasis(d, n).u;
      return { id: ref.id, p0: o.clone().addScaledVector(d, -len / 2), p1: o.clone().addScaledVector(d, len / 2), o, d, n, len, r: Number(ref.r) || 0, what: ref.what || 'Langloch' };
    }
    const r = App.results.get(ref.id);
    const data = r && r.data;
    if (!data) return null;
    const pairs = detectSlotPairs(data);
    let chosen = null;
    if (ref.faceIdx != null && ref.faceIdx >= 0) {
      chosen = pairs.find((p) => p.i === ref.faceIdx || p.j === ref.faceIdx || p.walls.includes(ref.faceIdx)) || null;
      if (!chosen) return null;
    } else if (ref.edgeIdx != null) {
      const g = data.edges && data.edges[ref.edgeIdx];
      if (!g) return null;
      if (g.t === 'CIRCLE' && Array.isArray(g.c)) {
        const gc = new THREE.Vector3(...g.c);
        chosen = pairs.find((p) => {
          if (Math.abs(p.r - (g.r || p.r)) > 0.15) return false;
          const d1 = gc.clone().sub(p.p1), d2 = gc.clone().sub(p.p2);
          const p1Perp = d1.addScaledVector(p.n, -d1.dot(p.n)).length();
          const p2Perp = d2.addScaledVector(p.n, -d2.dot(p.n)).length();
          return Math.min(p1Perp, p2Perp) < 0.25;
        }) || null;
      } else if (g.t === 'LINE' && Array.isArray(g.a) && Array.isArray(g.b)) {
        const ea = new THREE.Vector3(...g.a), eb = new THREE.Vector3(...g.b);
        const ed = eb.clone().sub(ea), elen = ed.length();
        if (elen > 0.1) {
          const eu = ed.clone().divideScalar(elen);
          const em = ea.clone().add(eb).multiplyScalar(0.5);
          chosen = pairs.find((p) => {
            if (Math.abs(p.u.dot(eu)) < 0.999 || Math.abs(p.len - elen) > 0.25) return false;
            const dm = em.clone().sub(p.mid);
            const side = new THREE.Vector3().crossVectors(p.n, p.u).normalize();
            return Math.abs(Math.abs(dm.dot(side)) - p.r) < 0.25 && Math.abs(dm.dot(p.u)) < 0.25;
          }) || null;
          if (!chosen) {
            const p0 = ea.applyMatrix4(M), p1 = eb.applyMatrix4(M);
            const d = p1.clone().sub(p0).normalize();
            return { id: ref.id, p0, p1, o: p0.clone().add(p1).multiplyScalar(0.5), d, n: canonicalX(d.toArray()), len: p0.distanceTo(p1), r: 0, what: 'Gerade Kante' };
          }
        }
      }
      if (!chosen) return null;
    } else {
      chosen = pairs[0] || null;
    }
    if (!chosen) return null;
    const p0 = chosen.p1.clone().applyMatrix4(M), p1 = chosen.p2.clone().applyMatrix4(M);
    const o = chosen.mid.clone().applyMatrix4(M);
    const d = chosen.u.clone().transformDirection(M).normalize();
    const n = planeBasis(d, chosen.n.clone().transformDirection(M)).u;
    return { id: ref.id, p0, p1, o, d, n, len: p0.distanceTo(p1), r: chosen.r, what: 'Langloch' };
  }
  function slotHitOf(hit) {
    if (!hit || !hit.node || (hit.faceIdx == null && hit.edgeIdx == null)) return null;
    return slotCenterlineOf({ id: hit.id, faceIdx: hit.faceIdx, edgeIdx: hit.edgeIdx });
  }
  function slotPinOf(ref, doc = App.doc) {
    const ax = cylAxisOf(ref, doc);
    if (ax) return { id: ax.id, p: ax.o, axis: ax.d, what: ax.what };
    const pt = ballPointOf(ref, doc);
    if (pt) return { id: pt.id, p: pt.p, axis: null, what: pt.what };
    return null;
  }
  function slotPinHitOf(hit, cx, cy) {
    const ax = cylHitOf(hit);
    if (ax) return { id: ax.id, faceIdx: ax.faceIdx, edgeIdx: ax.edgeIdx, p: ax.o, axis: ax.d, what: ax.what };
    const pt = ballHitOf(hit, cx, cy);
    if (pt) return { id: pt.id, faceIdx: pt.faceIdx, edgeIdx: pt.edgeIdx, p: pt.p, axis: null, what: pt.what };
    return null;
  }

  // ---------- Kinematik: Zustand, Matrix, Kette ----------
  const unit = (j) => (slide(j) ? 'mm' : '°');
  function stateOf(j) {
    return {
      ang: Number(j && j.ang) || 0,
      pos: Number(j && j.pos) || 0,
      u: Number(j && j.u) || 0,
      v: Number(j && j.v) || 0,
      rx: Number(j && j.rx) || 0,
      ry: Number(j && j.ry) || 0,
    };
  }
  function rotAbout(o, d, deg) {
    const R = new THREE.Matrix4().makeRotationAxis(d, (deg * Math.PI) / 180);
    return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  function stateMatrix(j, st) {
    const k = kindOf(j);
    if (k === 'fixed') return new THREE.Matrix4();
    const s = { ...stateOf(j), ...(typeof st === 'number' ? { ang: st } : st || {}) };
    if (k === 'slide') {
      const d = new THREE.Vector3(...j.ad).normalize();
      return new THREE.Matrix4().makeTranslation(d.x * s.ang, d.y * s.ang, d.z * s.ang);
    }
    if (k === 'cyl') {
      const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
      return new THREE.Matrix4().makeTranslation(d.x * s.pos, d.y * s.pos, d.z * s.pos).multiply(rotAbout(o, d, s.ang));
    }
    if (k === 'planar') {
      const { o, n, u, v } = planeFrame(j);
      return new THREE.Matrix4().makeTranslation(
        u.x * s.u + v.x * s.v,
        u.y * s.u + v.y * s.v,
        u.z * s.u + v.z * s.v
      ).multiply(rotAbout(o, n, s.ang));
    }
    if (k === 'ball') {
      const { o, n, u, v } = planeFrame(j);
      const F = new THREE.Matrix4().makeBasis(u, v, n);
      const Rloc = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler((s.rx * Math.PI) / 180, (s.ry * Math.PI) / 180, (s.ang * Math.PI) / 180, 'XYZ')
      );
      const R = F.clone().multiply(Rloc).multiply(F.clone().transpose());
      return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
    }
    if (k === 'slot') {
      const { o, d, n } = frameOf(j);
      return new THREE.Matrix4().makeTranslation(d.x * s.pos, d.y * s.pos, d.z * s.pos).multiply(rotAbout(o, n, s.ang));
    }
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    return rotAbout(o, d, s.ang);
  }
  function deltaMatrix(j, fromSt, toSt) {
    return stateMatrix(j, toSt).multiply(stateMatrix(j, fromSt).invert());
  }
  function stepMatrix(j, ang) {
    if (fixed(j)) return new THREE.Matrix4();
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    if (slide(j)) return new THREE.Matrix4().makeTranslation(d.x * ang, d.y * ang, d.z * ang);
    return rotAbout(o, d, ang);
  }
  function pose(j, angOrSt, home, doc = App.doc) {
    const st = typeof angOrSt === 'number' ? { ...stateOf(j), ang: angOrSt } : { ...stateOf(j), ...(angOrSt || {}) };
    return conj(doc, j.b, stateMatrix(j, st)).multiply(new THREE.Matrix4().fromArray(home || j.home));
  }
  // Alle Gelenke, die weiter hinten in der Kette an rootId hängen (in Reihenfolge von vorne nach hinten)
  function downstream(doc, rootId, opts = {}) {
    const js = list(doc), out = [], seen = new Set([rootId]);
    const stopAtLocked = !!(opts && opts.stopAtLocked);
    const skipJointIds = opts && opts.skipJointIds;
    const q = [rootId];
    while (q.length) {
      const a = q.shift();
      for (const j of js) {
        if (skipJointIds && skipJointIds.has(j.id)) continue;
        if (j.a === a && !seen.has(j.b)) {
          if (stopAtLocked) {
            const kb = top(j.b, doc);
            if (kb && kb.locked) continue;
          }
          seen.add(j.b);
          out.push(j);
          q.push(j.b);
        }
      }
    }
    return out;
  }
  // Prüfen, ob zwei Teile schon über Gelenke verbunden sind (ein weiteres Gelenk dazwischen ergäbe einen Kreis)
  function connected(doc, idA, idB) {
    const js = list(doc).filter((j) => !isLoose(j)), seen = new Set([idA]), q = [idA];
    while (q.length) {
      const x = q.shift();
      if (x === idB) return true;
      for (const j of js) {
        if (j.a === x && !seen.has(j.b)) { seen.add(j.b); q.push(j.b); }
        if (j.b === x && !seen.has(j.a)) { seen.add(j.a); q.push(j.a); }
      }
    }
    return false;
  }
  function wouldCycleDirected(doc, aId, bId) {
    if (aId === bId) return true;
    const js = list(doc), seen = new Set([bId]), q = [bId];
    while (q.length) {
      const x = q.shift();
      if (x === aId) return true;
      for (const j of js) {
        if (j.a === x && !seen.has(j.b)) { seen.add(j.b); q.push(j.b); }
      }
    }
    return false;
  }
  function syncHome(b, j, doc = App.doc) {
    const cur = Model.localMatrix(b), exp = pose(j, stateOf(j), null, doc);
    if (cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)) {
      const inv = conj(doc, j.b, stateMatrix(j, stateOf(j))).invert();
      j.home = r9(inv.multiply(cur).toArray());
    }
  }
  // Hintere Glieder der Kette samt ihren Gelenkachsen um die Bewegung D mitnehmen
  function moveChain(doc, rootId, D, opts = {}) {
    const ks = downstream(doc, rootId, { stopAtLocked: true, skipJointIds: opts && opts.skipJointIds }), moved = new Set([rootId, ...ks.map((k) => k.b)]);
    const V = Model.vars(doc).v;
    for (const k of ks) {
      const kb = top(k.b, doc);
      // Steckt das Teil in einer Gruppe, die selbst mitwandert, fährt es schon mit – nur die Achse nachführen
      const carried = Model.parentsOf(doc, k.b).some((p) => moved.has(p.id));
      if (kb && !carried && !isConstraint(k) && !isLoose(k)) syncHome(kb, k, doc);
      k.ao = r6(new THREE.Vector3(...k.ao).applyMatrix4(D).toArray());
      k.ad = r9(new THREE.Vector3(...k.ad).transformDirection(D).normalize().toArray());
      if (Array.isArray(k.au)) k.au = r9(new THREE.Vector3(...k.au).transformDirection(D).normalize().toArray());
      if (carried) continue;
      if (isConstraint(k)) {
        if (isAngle(k) || isCenter(k)) {
          const kbCur = kb && !carried ? conj(doc, k.b, D).multiply(Model.localMatrix(kb)) : null;
          if (kb && kbCur) Model.setFromMatrix(kb, kbCur);
        }
        const sol = solveConstraintPose(doc, k);
        if (sol && kb) {
          const Lb = Model.parentWorld(doc, k.b).invert().multiply(sol.WbNew);
          Model.setFromMatrix(kb, Lb);
          k.home = r9(Model.localMatrix(kb).toArray());
          k.ao = r6(sol.ao.toArray());
          k.ad = r9(sol.ad.toArray());
          if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
        }
        continue;
      }
      if (isLoose(k)) {
        if (kb && !kb.locked) {
          solvePartConstraints(doc, k.b, V);
          if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
        }
        continue;
      }
      k.home = r9(conj(doc, k.b, D).multiply(new THREE.Matrix4().fromArray(k.home)).toArray());
      if (kb) {
        Model.setFromMatrix(kb, pose(k, stateOf(k), null, doc));
        if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
      }
    }
  }

  function subtreeHasLocked(doc, rootId) {
    const r = top(rootId, doc);
    if (r && r.locked) return true;
    return downstream(doc, rootId).some((k) => {
      if (isLoose(k)) return false;
      const kb = top(k.b, doc);
      return !!(kb && kb.locked);
    });
  }

  function dragContext(doc, itemId) {
    doc = doc || App.doc;
    const it = top(itemId, doc);
    if (!it) return { blocked: true, reason: 'missing', name: '' };
    if (it.locked) return { blocked: true, reason: 'grounded', name: Model.label(it) };
    if (isFixedPart(itemId, doc)) return { blocked: true, reason: 'fixed', name: Model.label(it) };
    const core = cyclicCore(doc, itemId, false);
    if (core && core.partIds.has(itemId)) {
      const inc = core.joints.filter((k) => (k.a === itemId || k.b === itemId) && !isConstraint(k) && !isLoose(k));
      if (inc.length) {
        const mj0 = drivingOf(itemId, doc);
        const bestJ = inc.find((k) => {
          const other = top(k.a === itemId ? k.b : k.a, doc);
          return !!(other && other.locked);
        }) || (mj0 && inc.includes(mj0) ? mj0 : inc[0]);
        return { blocked: false, mode: 'joint', joint: bestJ, kind: kindOf(bestJ), reverse: bestJ.a === itemId, itemId, closedLoop: true };
      }
    }
    const mj = drivingOf(itemId, doc);
    const groundedChildren = list(doc).filter((k) => k.a === itemId && !isLoose(k) && subtreeHasLocked(doc, k.b));
    if (groundedChildren.length > 1) return { blocked: true, reason: 'groundedChain', name: Model.label(it) };
    if (groundedChildren.length === 1) {
      const jd = groundedChildren[0];
      if (isConstraint(jd) || mj) return { blocked: true, reason: 'groundedChain', name: Model.label(it) };
      return { blocked: false, mode: 'joint', joint: jd, kind: kindOf(jd), reverse: true, itemId };
    }
    if (mj) {
      const k = kindOf(mj);
      if (isConstraint(mj)) return { blocked: false, mode: 'constrainedFree', joint: mj, kind: k, reverse: false, itemId };
      return { blocked: false, mode: 'joint', joint: mj, kind: k, reverse: false, itemId };
    }
    return { blocked: false, mode: 'free', joint: null, kind: null, reverse: false, itemId };
  }

  function captureChain(doc, rootId, opts = {}) {
    const js = list(doc), entries = [], seen = new Set([rootId]), moved = new Set([rootId]), q = [rootId];
    const ex = opts && opts.excludeBranch ? opts.excludeBranch : null;
    while (q.length) {
      const a = q.shift();
      for (const k of js) {
        if (k.a !== a || seen.has(k.b) || (ex && k.b === ex)) continue;
        const kb = top(k.b, doc);
        if (kb && kb.locked) continue;
        seen.add(k.b);
        moved.add(k.b);
        q.push(k.b);
        const carried = Model.parentsOf(doc, k.b).some((p) => moved.has(p.id));
        if (kb && !carried && !isConstraint(k) && !isLoose(k)) syncHome(kb, k, doc);
        entries.push({
          id: k.id,
          bId: k.b,
          ao: Array.isArray(k.ao) ? [...k.ao] : null,
          ad: Array.isArray(k.ad) ? [...k.ad] : null,
          au: Array.isArray(k.au) ? [...k.au] : null,
          home: Array.isArray(k.home) ? [...k.home] : null,
          isCon: isConstraint(k),
          isLoose: isLoose(k),
          isAngOrCtr: isAngle(k) || isCenter(k),
          bW0: kb ? Model.worldMatrix(doc, kb.id).clone() : null,
          carried,
        });
      }
    }
    return { rootId, entries };
  }

  function applyChainDelta(doc, snap, D, opts = {}) {
    if (!snap || !snap.entries || !snap.entries.length) return;
    const V = Model.vars(doc).v;
    for (const e of snap.entries) {
      const k = list(doc).find((x) => x.id === e.id);
      if (!k) continue;
      const kb = top(e.bId, doc);
      if (Array.isArray(e.ao)) k.ao = r6(new THREE.Vector3(...e.ao).applyMatrix4(D).toArray());
      if (Array.isArray(e.ad)) k.ad = r9(new THREE.Vector3(...e.ad).transformDirection(D).normalize().toArray());
      if (Array.isArray(e.au)) k.au = r9(new THREE.Vector3(...e.au).transformDirection(D).normalize().toArray());
      if (e.carried || !kb || kb.locked) continue;
      if (e.isLoose) {
        solvePartConstraints(doc, e.bId, V);
        if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
        continue;
      }
      if (e.isCon) {
        if (e.isAngOrCtr && e.bW0) {
          const WbNew0 = D.clone().multiply(e.bW0);
          Model.setFromMatrix(kb, Model.parentWorld(doc, kb.id).invert().multiply(WbNew0));
        }
        const sol = solveConstraintPose(doc, k);
        if (sol) {
          Model.setFromMatrix(kb, Model.parentWorld(doc, kb.id).invert().multiply(sol.WbNew));
          k.home = r9(Model.localMatrix(kb).toArray());
          k.ao = r6(sol.ao.toArray());
          k.ad = r9(sol.ad.toArray());
          if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
        }
        continue;
      }
      if (!e.home) continue;
      k.home = r9(conj(doc, k.b, D).multiply(new THREE.Matrix4().fromArray(e.home)).toArray());
      Model.setFromMatrix(kb, pose(k, stateOf(k), null, doc));
      if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
    }
  }

  function captureReverseDrag(doc, jid) {
    const j = list(doc).find((x) => x.id === jid);
    if (!j) return null;
    const A = top(j.a, doc), B = top(j.b, doc);
    if (!A || !B) return null;
    syncHome(B, j, doc);
    return {
      jid: j.id,
      aId: A.id,
      bId: B.id,
      kind: kindOf(j),
      j0: {
        kind: j.kind,
        ao: [...j.ao],
        ad: [...j.ad],
        au: Array.isArray(j.au) ? [...j.au] : null,
        min: j.min, max: j.max,
        minPos: j.minPos, maxPos: j.maxPos,
        minU: j.minU, maxU: j.maxU,
        minV: j.minV, maxV: j.maxV,
        minRx: j.minRx, maxRx: j.maxRx,
        minRy: j.minRy, maxRy: j.maxRy,
      },
      st0: stateOf(j),
      home0: [...j.home],
      aW0: Model.worldMatrix(doc, A.id).clone(),
      sideChain: captureChain(doc, A.id, { excludeBranch: B.id }),
    };
  }

  // ---------- Geschlossene Mechanismen (BG-16) ----------
  const JAM_MSG = 'Dieser Mechanismus klemmt hier';
  const LOOP_POS_TOL = 0.005;
  const LOOP_ANG_TOL = 0.002;
  const LOOP_ROT_SCALE = 50;
  let lastJam = null, lastJamToastAt = 0;

  function notifyJam(info, throttle = false) {
    lastJam = { ...(info || {}), msg: JAM_MSG, time: Date.now() };
    const now = Date.now();
    if (!throttle || now - lastJamToastAt > 1200) {
      UI.toast(JAM_MSG, { kind: 'bad' });
      lastJamToastAt = now;
    }
  }

  function jointDof(kind) {
    if (kind === 'fixed' || kind === 'angle' || kind === 'center') return 0;
    if (kind === 'cyl' || kind === 'slot') return 2;
    if (kind === 'planar' || kind === 'ball') return 3;
    return 1;
  }

  function directlyConnected(doc, idA, idB) {
    return list(doc).some((j) => !isLoose(j) && ((j.a === idA && j.b === idB) || (j.a === idB && j.b === idA)));
  }

  function minDofPath(doc, idA, idB) {
    const js = list(doc).filter((j) => !isLoose(j));
    const adj = new Map();
    for (const j of js) {
      if (!adj.has(j.a)) adj.set(j.a, []);
      if (!adj.has(j.b)) adj.set(j.b, []);
      const w = jointDof(kindOf(j));
      adj.get(j.a).push({ to: j.b, w });
      adj.get(j.b).push({ to: j.a, w });
    }
    const dist = new Map([[idA, { dof: 0, edges: 0 }]]);
    const done = new Set();
    const pq = [{ id: idA, dof: 0, edges: 0 }];
    while (pq.length) {
      pq.sort((x, y) => x.dof - y.dof || x.edges - y.edges);
      const cur = pq.shift();
      if (done.has(cur.id)) continue;
      done.add(cur.id);
      if (cur.id === idB) return { found: true, edges: cur.edges, dofSum: cur.dof };
      for (const e of adj.get(cur.id) || []) {
        if (done.has(e.to)) continue;
        const nd = cur.dof + e.w, ne = cur.edges + 1;
        const prev = dist.get(e.to);
        if (!prev || nd < prev.dof || (nd === prev.dof && ne < prev.edges)) {
          dist.set(e.to, { dof: nd, edges: ne });
          pq.push({ id: e.to, dof: nd, edges: ne });
        }
      }
    }
    return { found: false, edges: 0, dofSum: 0 };
  }

  function canAddKinematicJoint(doc, A, B, kind) {
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile für die Verbindung.' };
    const why = refuse(doc, A, B); if (why) return { ok: false, msg: why };
    if (A.locked && B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }), locked: true };
    if (!connected(doc, A.id, B.id)) {
      if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }), locked: true };
      if (list(doc).some((j) => j.b === B.id && !isLoose(j))) {
        return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };
      }
      return { ok: true, closing: false };
    }
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) {
      return { ok: false, msg: 'Das ergäbe einen Kreis – geschlossene Mechanismen gibt es im Profi-Modus.' };
    }
    if (directlyConnected(doc, A.id, B.id)) {
      return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon direkt verbunden – das ergäbe einen Kreis.` };
    }
    const path = minDofPath(doc, A.id, B.id);
    if (!path.found || path.edges < 2 || path.dofSum + jointDof(kind) < 4) {
      return { ok: false, msg: 'Das ergäbe einen starren Kreis ohne Bewegung – für einen geschlossenen Mechanismus (z. B. Viergelenk oder Kurbeltrieb) braucht der Kreis mindestens 4 Freiheitsgrade.' };
    }
    return { ok: true, closing: true };
  }

  function kinComponent(doc, seedId, isJointId = false) {
    const js = list(doc).filter((j) => !isLoose(j));
    let startPart = seedId;
    if (isJointId) {
      const sj = js.find((x) => x.id === seedId);
      if (!sj) return { partIds: new Set(), joints: [] };
      startPart = sj.a;
    }
    const partIds = new Set([startPart]);
    const q = [startPart];
    while (q.length) {
      const x = q.shift();
      for (const j of js) {
        if (j.a === x && !partIds.has(j.b)) { partIds.add(j.b); q.push(j.b); }
        if (j.b === x && !partIds.has(j.a)) { partIds.add(j.a); q.push(j.a); }
      }
    }
    const joints = js.filter((j) => partIds.has(j.a) && partIds.has(j.b));
    return { partIds, joints };
  }

  function cyclicCore(doc, seedId, isJointId = false) {
    const comp = kinComponent(doc, seedId, isJointId);
    if (comp.joints.length < 3 || comp.joints.length < comp.partIds.size) return null;
    const activeParts = new Set(comp.partIds);
    let activeJoints = comp.joints.slice();
    const peeledParts = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      const deg = new Map();
      for (const p of activeParts) deg.set(p, 0);
      for (const j of activeJoints) {
        deg.set(j.a, (deg.get(j.a) || 0) + 1);
        deg.set(j.b, (deg.get(j.b) || 0) + 1);
      }
      for (const p of [...activeParts]) {
        const it = top(p, doc);
        if ((deg.get(p) || 0) <= 1 && !(it && it.locked)) {
          activeParts.delete(p);
          peeledParts.add(p);
          activeJoints = activeJoints.filter((j) => j.a !== p && j.b !== p);
          changed = true;
        }
      }
    }
    if (activeJoints.length < 3 || activeJoints.length < activeParts.size) return null;
    if (isJointId && !activeJoints.some((j) => j.id === seedId)) return null;
    return { partIds: activeParts, joints: activeJoints, peeledParts };
  }

  function isInClosedLoop(doc, jid) {
    return !!cyclicCore(doc || App.doc, jid, true);
  }
  function isPartInClosedLoop(doc, itemId) {
    const c = cyclicCore(doc || App.doc, itemId, false);
    return !!(c && c.partIds.has(itemId));
  }

  function mat4ToPose(M) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    M.decompose(p, q, s);
    return { p, q: q.normalize() };
  }
  function poseToMat4(ps) {
    return new THREE.Matrix4().compose(ps.p, ps.q, new THREE.Vector3(1, 1, 1));
  }
  function vecTransformPose(v, ps) {
    return v.clone().applyQuaternion(ps.q).add(ps.p);
  }
  function dirTransformPose(v, ps) {
    return v.clone().applyQuaternion(ps.q).normalize();
  }

  function captureLocalFrames(doc, j, explicit = null) {
    if (!j || isLoose(j)) return null;
    const Wa = Model.worldMatrix(doc, j.a), Wb = Model.worldMatrix(doc, j.b);
    const invWa = Wa.clone().invert(), invWb = Wb.clone().invert();
    let oAw, dAw, uAw, oBw, dBw, uBw;
    if (explicit) {
      oAw = explicit.oA.clone();
      dAw = explicit.dA.clone().normalize();
      uAw = planeBasis(dAw, explicit.uA || null).u;
      oBw = explicit.oB.clone();
      dBw = explicit.dB.clone().normalize();
      uBw = planeBasis(dBw, explicit.uB || null).u;
    } else {
      oAw = new THREE.Vector3(...(j.ao || [0, 0, 0]));
      dAw = new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize();
      uAw = planeBasis(dAw, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null).u;
      const Trel = stateMatrix(j, stateOf(j));
      oBw = oAw.clone().applyMatrix4(Trel);
      dBw = dAw.clone().transformDirection(Trel).normalize();
      uBw = uAw.clone().transformDirection(Trel).normalize();
    }
    j.locA = {
      o: r6(oAw.clone().applyMatrix4(invWa).toArray()),
      d: r9(dAw.clone().transformDirection(invWa).normalize().toArray()),
      u: r9(uAw.clone().transformDirection(invWa).normalize().toArray()),
    };
    j.locB = {
      o: r6(oBw.clone().applyMatrix4(invWb).toArray()),
      d: r9(dBw.clone().transformDirection(invWb).normalize().toArray()),
      u: r9(uBw.clone().transformDirection(invWb).normalize().toArray()),
    };
    return j;
  }

  function ensureLocalFrames(doc, joints) {
    for (const j of joints) {
      if (!j.locA || !j.locB) captureLocalFrames(doc, j);
    }
  }

  function worldJointFrames(j, poseA, poseB) {
    const la = j.locA, lb = j.locB;
    const PA = vecTransformPose(new THREE.Vector3(...la.o), poseA);
    const DA = dirTransformPose(new THREE.Vector3(...la.d), poseA);
    const UA = planeBasis(DA, dirTransformPose(new THREE.Vector3(...la.u), poseA)).u;
    const VA = new THREE.Vector3().crossVectors(DA, UA).normalize();
    const PB = vecTransformPose(new THREE.Vector3(...lb.o), poseB);
    const DB = dirTransformPose(new THREE.Vector3(...lb.d), poseB);
    const UB = planeBasis(DB, dirTransformPose(new THREE.Vector3(...lb.u), poseB)).u;
    const VB = new THREE.Vector3().crossVectors(DB, UB).normalize();
    return { PA, DA, UA, VA, PB, DB, UB, VB };
  }

  function unwrapDegNear(deg, refDeg) {
    if (!Number.isFinite(refDeg)) return deg;
    let d = deg;
    while (d - refDeg > 180) d -= 360;
    while (d - refDeg < -180) d += 360;
    return d;
  }

  function extractJointState(j, poseA, poseB, prevSt = null) {
    const k = kindOf(j);
    const prev = prevSt || stateOf(j);
    const fr = worldJointFrames(j, poseA, poseB);
    const dp = fr.PB.clone().sub(fr.PA);
    const out = { ...prev };
    if (k === 'rot') {
      const ang = (Math.atan2(fr.UB.dot(fr.VA), fr.UB.dot(fr.UA)) * 180) / Math.PI;
      out.ang = round(unwrapDegNear(ang, prev.ang), 4);
    } else if (k === 'slide') {
      out.ang = round(dp.dot(fr.DA), 4);
    } else if (k === 'cyl') {
      out.pos = round(dp.dot(fr.DA), 4);
      const ang = (Math.atan2(fr.UB.dot(fr.VA), fr.UB.dot(fr.UA)) * 180) / Math.PI;
      out.ang = round(unwrapDegNear(ang, prev.ang), 4);
    } else if (k === 'planar') {
      out.u = round(dp.dot(fr.UA), 4);
      out.v = round(dp.dot(fr.VA), 4);
      const ang = (Math.atan2(fr.UB.dot(fr.VA), fr.UB.dot(fr.UA)) * 180) / Math.PI;
      out.ang = round(unwrapDegNear(ang, prev.ang), 4);
    } else if (k === 'ball') {
      const FA = new THREE.Matrix4().makeBasis(fr.UA, fr.VA, fr.DA);
      const FB = new THREE.Matrix4().makeBasis(fr.UB, fr.VB, fr.DB);
      const Rloc = FA.clone().transpose().multiply(FB);
      const e = new THREE.Euler().setFromRotationMatrix(Rloc, 'XYZ');
      const toD = (rad, ref) => round(unwrapDegNear((rad * 180) / Math.PI, ref), 4);
      out.rx = toD(e.x, prev.rx);
      out.ry = toD(e.y, prev.ry);
      out.ang = toD(e.z, prev.ang);
    } else if (k === 'slot') {
      out.pos = round(dp.dot(fr.DA), 4);
      const vaRot = new THREE.Vector3().crossVectors(fr.UA, fr.DA).normalize();
      const ang = (Math.atan2(fr.DB.dot(vaRot), fr.DB.dot(fr.DA)) * 180) / Math.PI;
      out.ang = round(unwrapDegNear(ang, prev.ang), 4);
    }
    return out;
  }

  function jointGapError(doc, j, posesOpt = null) {
    if (!j || isLoose(j)) return { posErr: 0, angErr: 0, ok: true };
    const pA = posesOpt ? posesOpt.get(j.a) : mat4ToPose(Model.worldMatrix(doc, j.a));
    const pB = posesOpt ? posesOpt.get(j.b) : mat4ToPose(Model.worldMatrix(doc, j.b));
    if (!pA || !pB) return { posErr: 0, angErr: 0, ok: true };
    if (!j.locA || !j.locB) captureLocalFrames(doc, j);
    const fr = worldJointFrames(j, pA, pB);
    const dp = fr.PB.clone().sub(fr.PA);
    const k = kindOf(j);
    let posErr = 0, angErr = 0;
    if (k === 'rot') {
      posErr = dp.length();
      angErr = Math.acos(clamp(fr.DB.dot(fr.DA), -1, 1));
    } else if (k === 'slide') {
      posErr = Math.hypot(dp.dot(fr.UA), dp.dot(fr.VA));
      const a1 = Math.acos(clamp(fr.DB.dot(fr.DA), -1, 1));
      const a2 = Math.abs(Math.atan2(fr.UB.dot(fr.VA), fr.UB.dot(fr.UA)));
      angErr = Math.max(a1, a2);
    } else if (k === 'cyl') {
      posErr = Math.hypot(dp.dot(fr.UA), dp.dot(fr.VA));
      angErr = Math.acos(clamp(fr.DB.dot(fr.DA), -1, 1));
    } else if (k === 'planar') {
      posErr = Math.abs(dp.dot(fr.DA));
      angErr = Math.acos(clamp(fr.DB.dot(fr.DA), -1, 1));
    } else if (k === 'ball') {
      posErr = dp.length();
    } else if (k === 'slot') {
      posErr = Math.hypot(dp.dot(fr.UA), dp.dot(fr.VA));
      angErr = Math.acos(clamp(fr.UB.dot(fr.UA), -1, 1));
    } else if (k === 'fixed') {
      posErr = dp.length();
      const a1 = Math.acos(clamp(fr.DB.dot(fr.DA), -1, 1));
      const a2 = Math.abs(Math.atan2(fr.UB.dot(fr.VA), fr.UB.dot(fr.UA)));
      angErr = Math.max(a1, a2);
    }
    return {
      posErr: round(posErr, 6),
      angErr: round(angErr, 6),
      ok: posErr <= LOOP_POS_TOL && angErr <= LOOP_ANG_TOL,
    };
  }

  function solveSPD(A, b, n) {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i * n + j];
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) {
          if (!(s > 1e-18)) return null;
          L[i * n + j] = Math.sqrt(s);
        } else {
          L[i * n + j] = s / L[j * n + j];
        }
      }
    }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
      y[i] = s / L[i * n + i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
      x[i] = s / L[i * n + i];
    }
    return x;
  }

  function buildResidualAndJacobian(core, poses, bodyIdx, driveMap) {
    const nFree = bodyIdx.size;
    const N = 6 * nFree;
    const rows = [];
    const L = LOOP_ROT_SCALE;

    const pushRow = (val, colA, gTA, gWA, colB, gTB, gWB) => {
      const row = new Float64Array(N + 1);
      row[N] = val;
      if (colA >= 0) {
        if (gTA) { row[colA] += gTA.x; row[colA + 1] += gTA.y; row[colA + 2] += gTA.z; }
        if (gWA) { row[colA + 3] += gWA.x; row[colA + 4] += gWA.y; row[colA + 5] += gWA.z; }
      }
      if (colB >= 0) {
        if (gTB) { row[colB] += gTB.x; row[colB + 1] += gTB.y; row[colB + 2] += gTB.z; }
        if (gWB) { row[colB + 3] += gWB.x; row[colB + 4] += gWB.y; row[colB + 5] += gWB.z; }
      }
      rows.push(row);
    };

    for (const j of core.joints) {
      const pA = poses.get(j.a), pB = poses.get(j.b);
      const colA = bodyIdx.has(j.a) ? bodyIdx.get(j.a) * 6 : -1;
      const colB = bodyIdx.has(j.b) ? bodyIdx.get(j.b) * 6 : -1;
      const fr = worldJointFrames(j, pA, pB);
      const rA = fr.PA.clone().sub(pA.p);
      const rB = fr.PB.clone().sub(pB.p);
      const dp = fr.PB.clone().sub(fr.PA);
      const pbMinPa = fr.PB.clone().sub(pA.p);

      const addPointCoincide = () => {
        const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3(0, 1, 0), e3 = new THREE.Vector3(0, 0, 1);
        pushRow(dp.x, colA, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -rA.z, rA.y), colB, e1, new THREE.Vector3(0, rB.z, -rB.y));
        pushRow(dp.y, colA, new THREE.Vector3(0, -1, 0), new THREE.Vector3(rA.z, 0, -rA.x), colB, e2, new THREE.Vector3(-rB.z, 0, rB.x));
        pushRow(dp.z, colA, new THREE.Vector3(0, 0, -1), new THREE.Vector3(-rA.y, rA.x, 0), colB, e3, new THREE.Vector3(rB.y, -rB.x, 0));
      };
      const addProjA = (axisA, target = 0) => {
        const val = dp.dot(axisA) - target;
        const gTA = axisA.clone().negate();
        const gWA = new THREE.Vector3().crossVectors(axisA, pbMinPa);
        const gTB = axisA;
        const gWB = new THREE.Vector3().crossVectors(rB, axisA);
        pushRow(val, colA, gTA, gWA, colB, gTB, gWB);
      };
      const addDot = (vecA, vecB) => {
        const val = L * vecB.dot(vecA);
        const gWA = new THREE.Vector3().crossVectors(vecA, vecB).multiplyScalar(L);
        const gWB = new THREE.Vector3().crossVectors(vecB, vecA).multiplyScalar(L);
        pushRow(val, colA, null, gWA, colB, null, gWB);
      };
      const addAngleAround = (refA0, refA90, vecB, deg) => {
        const rad = (deg * Math.PI) / 180;
        const cs = Math.cos(rad), sn = Math.sin(rad);
        const tgt0 = refA0.clone().multiplyScalar(cs).addScaledVector(refA90, sn);
        const tgt90 = refA0.clone().multiplyScalar(-sn).addScaledVector(refA90, cs);
        const c = vecB.dot(tgt0), s = vecB.dot(tgt90);
        const val = L * Math.atan2(s, c);
        const n2 = c * c + s * s;
        if (n2 > 1e-8) {
          const w = tgt90.clone().multiplyScalar(c).addScaledVector(tgt0, -s);
          const gWB = new THREE.Vector3().crossVectors(vecB, w).multiplyScalar(L / n2);
          const gWA = gWB.clone().negate();
          pushRow(val, colA, null, gWA, colB, null, gWB);
        } else {
          pushRow(val, colA, null, null, colB, null, null);
        }
      };

      const k = kindOf(j);
      const drv = driveMap ? driveMap.get(j.id) : null;
      if (k === 'rot') {
        addPointCoincide();
        addDot(fr.UA, fr.DB);
        addDot(fr.VA, fr.DB);
        if (drv && 'ang' in drv) addAngleAround(fr.UA, fr.VA, fr.UB, drv.ang);
      } else if (k === 'slide') {
        addProjA(fr.UA, 0);
        addProjA(fr.VA, 0);
        addDot(fr.UA, fr.DB);
        addDot(fr.VA, fr.DB);
        addAngleAround(fr.UA, fr.VA, fr.UB, 0);
        if (drv && 'ang' in drv) addProjA(fr.DA, drv.ang);
      } else if (k === 'cyl') {
        addProjA(fr.UA, 0);
        addProjA(fr.VA, 0);
        addDot(fr.UA, fr.DB);
        addDot(fr.VA, fr.DB);
        if (drv && 'pos' in drv) addProjA(fr.DA, drv.pos);
        if (drv && 'ang' in drv) addAngleAround(fr.UA, fr.VA, fr.UB, drv.ang);
      } else if (k === 'planar') {
        addProjA(fr.DA, 0);
        addDot(fr.UA, fr.DB);
        addDot(fr.VA, fr.DB);
        if (drv && 'u' in drv) addProjA(fr.UA, drv.u);
        if (drv && 'v' in drv) addProjA(fr.VA, drv.v);
        if (drv && 'ang' in drv) addAngleAround(fr.UA, fr.VA, fr.UB, drv.ang);
      } else if (k === 'ball') {
        addPointCoincide();
        if (drv && 'rx' in drv && 'ry' in drv && 'ang' in drv) {
          const Rloc = new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler((drv.rx * Math.PI) / 180, (drv.ry * Math.PI) / 180, (drv.ang * Math.PI) / 180, 'XYZ')
          );
          const FA = new THREE.Matrix4().makeBasis(fr.UA, fr.VA, fr.DA);
          const Ftgt = FA.multiply(Rloc);
          const Ut = new THREE.Vector3().setFromMatrixColumn(Ftgt, 0).normalize();
          const Vt = new THREE.Vector3().setFromMatrixColumn(Ftgt, 1).normalize();
          addDot(Ut, fr.DB);
          addDot(Vt, fr.DB);
          addAngleAround(Ut, Vt, fr.UB, 0);
        } else {
          if (drv && 'ry' in drv) {
            const val = L * (fr.UA.dot(fr.DB) - Math.sin((drv.ry * Math.PI) / 180));
            const gWA = new THREE.Vector3().crossVectors(fr.UA, fr.DB).multiplyScalar(L);
            const gWB = new THREE.Vector3().crossVectors(fr.DB, fr.UA).multiplyScalar(L);
            pushRow(val, colA, null, gWA, colB, null, gWB);
          }
          if (drv && 'rx' in drv) addAngleAround(fr.DA, fr.VA.clone().negate(), fr.DB, drv.rx);
          if (drv && 'ang' in drv) addAngleAround(fr.UA, fr.VA, fr.UB, drv.ang);
        }
      } else if (k === 'slot') {
        addProjA(fr.UA, 0);
        addProjA(fr.VA, 0);
        addDot(fr.DA, fr.UB);
        addDot(fr.VA, fr.UB);
        if (drv && 'pos' in drv) addProjA(fr.DA, drv.pos);
        if (drv && 'ang' in drv) {
          const vaRot = new THREE.Vector3().crossVectors(fr.UA, fr.DA).normalize();
          addAngleAround(fr.DA, vaRot, fr.DB, drv.ang);
        }
      } else if (k === 'fixed') {
        addPointCoincide();
        addDot(fr.UA, fr.DB);
        addDot(fr.VA, fr.DB);
        addAngleAround(fr.UA, fr.VA, fr.UB, 0);
      }
    }

    const m = rows.length;
    const J = new Float64Array(m * N);
    const r = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const rw = rows[i];
      J.set(rw.subarray(0, N), i * N);
      r[i] = rw[N];
    }
    return { m, N, J, r };
  }

  function applyStepToPoses(poses, bodyIdx, dx, scale = 1) {
    const out = new Map();
    for (const [id, ps] of poses) out.set(id, { p: ps.p.clone(), q: ps.q.clone() });
    let s = scale;
    let maxT = 0, maxW = 0;
    for (const bi of bodyIdx.values()) {
      const o = bi * 6;
      maxT = Math.max(maxT, Math.hypot(dx[o] * s, dx[o + 1] * s, dx[o + 2] * s));
      maxW = Math.max(maxW, Math.hypot(dx[o + 3] * s, dx[o + 4] * s, dx[o + 5] * s));
    }
    if (maxW > 0.35) s *= 0.35 / maxW;
    if (maxT > 20) s *= 20 / maxT;
    for (const [id, bi] of bodyIdx) {
      const o = bi * 6;
      const ps = out.get(id);
      ps.p.x += dx[o] * s;
      ps.p.y += dx[o + 1] * s;
      ps.p.z += dx[o + 2] * s;
      const wx = dx[o + 3] * s, wy = dx[o + 4] * s, wz = dx[o + 5] * s;
      const ang = Math.hypot(wx, wy, wz);
      if (ang > 1e-12) {
        const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(wx / ang, wy / ang, wz / ang), ang);
        ps.q.premultiply(dq).normalize();
      }
    }
    return out;
  }

  function verifyCorePoses(doc, core, poses, driveMap, refStates = null) {
    for (const j of core.joints) {
      const pA = poses.get(j.a), pB = poses.get(j.b);
      if (!pA || !pB) return false;
      const fr = worldJointFrames(j, pA, pB);
      const gap = jointGapError(doc, j, poses);
      if (!gap.ok) return false;
      const k = kindOf(j);
      if ((k === 'rot' || k === 'slide' || k === 'cyl' || k === 'planar' || k === 'fixed') && fr.DB.dot(fr.DA) < 0.999) return false;
      if (k === 'slot' && fr.UB.dot(fr.UA) < 0.999) return false;
      const st = extractJointState(j, pA, pB, refStates ? refStates.get(j.id) : null);
      const drv = driveMap ? driveMap.get(j.id) : null;
      if (drv) {
        for (const [d, tgt] of Object.entries(drv)) {
          const isLin = isLenDof(j, d);
          const diff = isLin ? Math.abs(st[d] - tgt) : Math.abs(unwrapDegNear(st[d], tgt) - tgt) * (Math.PI / 180);
          if (diff > (isLin ? LOOP_POS_TOL : LOOP_ANG_TOL)) return false;
        }
      }
      if (j.stopsLocked) {
        for (const d of ['ang', 'pos', 'u', 'v', 'rx', 'ry']) {
          if (!hasDof(j, d)) continue;
          const [loK, hiK, dLo, dHi] = rangeKeysFor(j, d);
          const lo = Number.isFinite(j[loK]) ? j[loK] : dLo;
          const hi = Number.isFinite(j[hiK]) ? j[hiK] : dHi;
          const eps = isLenDof(j, d) ? 0.005 : 0.05;
          if (st[d] < lo - eps || st[d] > hi + eps) return false;
        }
      }
    }
    return true;
  }

  function solveLM(doc, core, initPoses, bodyIdx, driveMap, refStates = null) {
    let poses = new Map();
    for (const [id, ps] of initPoses) poses.set(id, { p: ps.p.clone(), q: ps.q.clone() });
    const nFree = bodyIdx.size;
    if (nFree === 0) return verifyCorePoses(doc, core, poses, driveMap, refStates) ? { ok: true, poses } : { ok: false };
    const N = 6 * nFree;
    let lambda = 1e-5;
    let cur = buildResidualAndJacobian(core, poses, bodyIdx, driveMap);
    let cost = 0;
    let maxAbs = 0;
    for (let i = 0; i < cur.m; i++) {
      cost += cur.r[i] * cur.r[i];
      maxAbs = Math.max(maxAbs, Math.abs(cur.r[i]));
    }
    const A = new Float64Array(N * N);
    const g = new Float64Array(N);
    for (let iter = 0; iter < 50; iter++) {
      if (maxAbs < 1e-7) break;
      A.fill(0);
      g.fill(0);
      const { m, J, r } = cur;
      for (let row = 0; row < m; row++) {
        const ro = row * N;
        const rv = r[row];
        for (let i = 0; i < N; i++) {
          const jri = J[ro + i];
          if (jri === 0) continue;
          g[i] -= jri * rv;
          for (let k = i; k < N; k++) A[i * N + k] += jri * J[ro + k];
        }
      }
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < i; k++) A[i * N + k] = A[k * N + i];
        A[i * N + i] += lambda * Math.max(1, A[i * N + i]);
      }
      const dx = solveSPD(A, g, N);
      if (!dx) {
        lambda *= 10;
        if (lambda > 1e7) break;
        continue;
      }
      let dxNorm = 0;
      for (let i = 0; i < N; i++) dxNorm += dx[i] * dx[i];
      if (dxNorm < 1e-20 && maxAbs < 1e-4) break;
      const candPoses = applyStepToPoses(poses, bodyIdx, dx, 1);
      const cand = buildResidualAndJacobian(core, candPoses, bodyIdx, driveMap);
      let candCost = 0, candMax = 0;
      for (let i = 0; i < cand.m; i++) {
        candCost += cand.r[i] * cand.r[i];
        candMax = Math.max(candMax, Math.abs(cand.r[i]));
      }
      if (candCost < cost) {
        poses = candPoses;
        cur = cand;
        cost = candCost;
        maxAbs = candMax;
        lambda = Math.max(1e-10, lambda / 5);
        if (maxAbs < 1e-7) break;
      } else {
        lambda *= 10;
        if (lambda > 1e7) break;
      }
    }
    if (!verifyCorePoses(doc, core, poses, driveMap, refStates)) return { ok: false };
    return { ok: true, poses };
  }

  function makeDriveMapForT(driveJoint, driveDofs, fromSt, toSt, t, extraTargets = null) {
    const dm = new Map();
    if (driveJoint && driveDofs && driveDofs.length) {
      const obj = {};
      for (const d of driveDofs) {
        const a = Number(fromSt[d]) || 0, b = Number(toSt[d]) || 0;
        obj[d] = a + (b - a) * t;
      }
      dm.set(driveJoint.id, obj);
    }
    if (extraTargets && extraTargets.length) {
      for (const et of extraTargets) {
        const obj = dm.get(et.jid) || {};
        for (const d of et.dofs) {
          const a = Number(et.fromSt[d]) || 0, b = Number(et.toSt[d]) || 0;
          obj[d] = a + (b - a) * t;
        }
        dm.set(et.jid, obj);
      }
    }
    return dm;
  }

  function predictPoses(poses, prevPoses, ratio = 1) {
    if (!prevPoses) return poses;
    const out = new Map();
    for (const [id, ps] of poses) {
      const pp = prevPoses.get(id);
      if (!pp) { out.set(id, { p: ps.p.clone(), q: ps.q.clone() }); continue; }
      const dp = ps.p.clone().sub(pp.p).multiplyScalar(ratio);
      const dq = ps.q.clone().multiply(pp.q.clone().invert()).normalize();
      const axis = new THREE.Vector3(dq.x, dq.y, dq.z);
      const len = axis.length();
      let dqScaled = new THREE.Quaternion();
      if (len > 1e-10) {
        const halfAng = Math.atan2(len, dq.w);
        const ang = 2 * halfAng * ratio;
        if (Math.abs(ang) > 1e-10 && Math.abs(ang) < 0.7) {
          dqScaled.setFromAxisAngle(axis.divideScalar(len), ang);
        }
      }
      out.set(id, {
        p: ps.p.clone().add(dp),
        q: dqScaled.multiply(ps.q).normalize(),
      });
    }
    return out;
  }

  function solveClosedPoses(doc, core, driveJoint, driveDofs, fromSt, toSt, opts = {}) {
    ensureLocalFrames(doc, core.joints);
    const fixedIds = new Set();
    for (const id of core.partIds) {
      const it = top(id, doc);
      if (it && it.locked) fixedIds.add(id);
    }
    if (!fixedIds.size) {
      const anchor = (driveJoint && core.partIds.has(driveJoint.a) && driveJoint.a) || [...core.partIds][0];
      if (anchor) fixedIds.add(anchor);
    }
    const bodyIdx = new Map();
    let idx = 0;
    for (const id of core.partIds) {
      if (!fixedIds.has(id)) bodyIdx.set(id, idx++);
    }

    const startPoses = new Map();
    for (const id of core.partIds) {
      if (opts.startPoses && opts.startPoses.has(id)) {
        const sp = opts.startPoses.get(id);
        startPoses.set(id, { p: sp.p.clone(), q: sp.q.clone() });
      } else {
        startPoses.set(id, mat4ToPose(Model.worldMatrix(doc, id)));
      }
    }

    const extraTargets = opts.extraTargets || null;
    let steps = 1;
    if (driveJoint && driveDofs && driveDofs.length && fromSt && toSt) {
      for (const d of driveDofs) {
        const delta = Math.abs((Number(toSt[d]) || 0) - (Number(fromSt[d]) || 0));
        const stepSize = isLenDof(driveJoint, d) ? 4 : 8;
        steps = Math.max(steps, Math.ceil(delta / stepSize));
      }
    }
    if (extraTargets) {
      for (const et of extraTargets) {
        const ej = core.joints.find((x) => x.id === et.jid);
        if (!ej) continue;
        for (const d of et.dofs) {
          const delta = Math.abs((Number(et.toSt[d]) || 0) - (Number(et.fromSt[d]) || 0));
          const stepSize = isLenDof(ej, d) ? 4 : 8;
          steps = Math.max(steps, Math.ceil(delta / stepSize));
        }
      }
    }
    steps = clamp(steps, 1, 180);

    let curPoses = startPoses;
    let prevPoses = null;
    let prevStepDt = 1 / steps;
    let lastValidT = 0;
    const refStates = new Map();
    for (const j of core.joints) refStates.set(j.id, stateOf(j));

    const updateRefs = (poses) => {
      for (const j of core.joints) {
        const pA = poses.get(j.a), pB = poses.get(j.b);
        if (pA && pB) refStates.set(j.id, extractJointState(j, pA, pB, refStates.get(j.id)));
      }
    };

    const seedMovedBody = (poses, t0, t1) => {
      if (!driveJoint || !driveDofs || !driveDofs.length || !fromSt || !toSt) return poses;
      const dPatch = {};
      for (const d of driveDofs) {
        const a = Number(fromSt[d]) || 0, b = Number(toSt[d]) || 0;
        dPatch[d] = (b - a) * (t1 - t0);
      }
      const aFixed = fixedIds.has(driveJoint.a), bFree = bodyIdx.has(driveJoint.b);
      if (aFixed && bFree) {
        const fr = worldJointFrames(driveJoint, poses.get(driveJoint.a), poses.get(driveJoint.b));
        const jTmp = {
          kind: driveJoint.kind,
          ao: fr.PA.toArray(),
          ad: fr.DA.toArray(),
          au: fr.UA.toArray(),
        };
        const dSt = { ang: 0, pos: 0, u: 0, v: 0, rx: 0, ry: 0, ...dPatch };
        const D = stateMatrix(jTmp, dSt);
        const out = new Map();
        for (const [id, ps] of poses) {
          if (id === driveJoint.b) out.set(id, mat4ToPose(D.clone().multiply(poseToMat4(ps))));
          else out.set(id, { p: ps.p.clone(), q: ps.q.clone() });
        }
        return out;
      }
      return poses;
    };

    const solveInterval = (t0, t1, depth) => {
      const dm = makeDriveMapForT(driveJoint, driveDofs, fromSt, toSt, t1, extraTargets);
      const ratio = prevPoses ? (t1 - t0) / Math.max(1e-6, prevStepDt) : 1;
      const guess = prevPoses ? predictPoses(curPoses, prevPoses, ratio) : seedMovedBody(curPoses, t0, t1);
      let res = solveLM(doc, core, guess, bodyIdx, dm, refStates);
      if (!res.ok && prevPoses) {
        res = solveLM(doc, core, curPoses, bodyIdx, dm, refStates);
      }
      if (res.ok) {
        prevPoses = curPoses;
        prevStepDt = t1 - t0;
        curPoses = res.poses;
        lastValidT = t1;
        updateRefs(curPoses);
        return true;
      }
      if (depth >= 5) return false;
      const tm = 0.5 * (t0 + t1);
      if (!solveInterval(t0, tm, depth + 1)) return false;
      return solveInterval(tm, t1, depth + 1);
    };

    for (let s = 1; s <= steps; s++) {
      const t0 = (s - 1) / steps;
      const t1 = s / steps;
      if (!solveInterval(t0, t1, 0)) {
        if (opts.clampToReachable && lastValidT > 0) {
          return { ok: true, jammed: true, poses: curPoses, reachedT: lastValidT };
        }
        return { ok: false, jammed: true, poses: curPoses, reachedT: lastValidT };
      }
    }
    return { ok: true, jammed: false, poses: curPoses, reachedT: 1 };
  }

  function applyClosedPoses(doc, core, poses, driveJoint = null, targetDriveSt = null, opts = {}) {
    const oldWorld = new Map();
    for (const id of core.partIds) oldWorld.set(id, Model.worldMatrix(doc, id).clone());
    for (const id of core.partIds) {
      const it = top(id, doc);
      if (!it || it.locked) continue;
      const ps = poses.get(id);
      if (!ps) continue;
      const Wnew = poseToMat4(ps);
      const Lnew = Model.parentWorld(doc, id).invert().multiply(Wnew);
      Model.setFromMatrix(it, Lnew);
      if (opts.live && isTop(id, doc)) Viewer.updateNode(id, { matrix: Model.localMatrix(it) });
    }
    for (const j of core.joints) {
      const pA = poses.get(j.a), pB = poses.get(j.b);
      if (!pA || !pB) continue;
      const fr = worldJointFrames(j, pA, pB);
      j.ao = r6(fr.PA.toArray());
      j.ad = r9(fr.DA.toArray());
      if (isPlanar(j) || isBall(j) || isSlot(j) || Array.isArray(j.au)) j.au = r9(fr.UA.toArray());
      const stNew = extractJointState(j, pA, pB, stateOf(j));
      if (driveJoint && j.id === driveJoint.id && targetDriveSt) {
        for (const d of Object.keys(targetDriveSt)) {
          if (hasDof(j, d)) stNew[d] = round(targetDriveSt[d], 4);
        }
      }
      writeState(j, stNew);
      if (!j.stopsLocked) {
        for (const d of ['ang', 'pos', 'u', 'v', 'rx', 'ry']) {
          if (hasDof(j, d)) ensureRangeFor(j, d, stNew[d]);
        }
      }
      const b = top(j.b, doc);
      if (b) {
        const inv = conj(doc, j.b, stateMatrix(j, stateOf(j))).invert();
        j.home = r9(inv.multiply(Model.localMatrix(b)).toArray());
      }
    }
    const coreJSet = new Set(core.joints.map((x) => x.id));
    for (const id of core.partIds) {
      const Wold = oldWorld.get(id);
      const Wnew = Model.worldMatrix(doc, id);
      if (!Wold || !Wnew || maxMatDiff(Wold, Wnew) <= 1e-6) continue;
      if (list(doc).some((k) => k.a === id && !coreJSet.has(k.id))) {
        moveChain(doc, id, Wnew.clone().multiply(Wold.clone().invert()), { ...opts, skipJointIds: coreJSet });
      }
    }
  }

  function widenClosedLoopDefaults(core) {
    if (!core) return;
    for (const j of core.joints) {
      if (kindOf(j) === 'rot' && !j.stopsLocked && j.min === -90 && j.max === 90) {
        j.min = -360;
        j.max = 360;
      }
    }
  }

  function jointError(jid, doc = App.doc) {
    const j = list(doc).find((x) => x.id === jid);
    return j ? jointGapError(doc, j) : null;
  }

  function loopErrors(doc = App.doc) {
    const out = [];
    for (const j of list(doc)) {
      if (isInClosedLoop(doc, j.id)) out.push({ id: j.id, ...jointGapError(doc, j) });
    }
    return out;
  }

  // ---------- Feste Verbindung (BG-05) ----------
  function solveFixedPose(doc, j) {
    const A = top(j.a, doc), B = top(j.b, doc);
    if (!A || !B || !j.refA || !j.refB) return null;
    const Wa = Model.worldMatrix(doc, A.id);
    const cAw = new THREE.Vector3(...j.refA.c).applyMatrix4(Wa);
    if (j.mode === 'face') {
      const nAl = new THREE.Vector3(...j.refA.n).normalize();
      const xAl = j.refA.x ? new THREE.Vector3(...j.refA.x) : canonicalX(nAl.toArray());
      const nAw = nAl.clone().transformDirection(Wa).normalize();
      let xAw = xAl.clone().transformDirection(Wa);
      xAw.addScaledVector(nAw, -xAw.dot(nAw));
      if (xAw.lengthSq() < 1e-9) xAw = canonicalX(nAw.toArray());
      xAw.normalize();
      const zTarget = j.flip ? nAw.clone() : nAw.clone().negate();
      const rotRad = ((Number(j.rot) || 0) * Math.PI) / 180;
      if (Math.abs(rotRad) > 1e-12) xAw.applyAxisAngle(nAw, rotRad);
      const Mt = orthoBasis(zTarget, xAw);
      const nBl = new THREE.Vector3(...j.refB.n).normalize();
      const xBl = j.refB.x ? new THREE.Vector3(...j.refB.x) : canonicalX(nBl.toArray());
      const Mb = orthoBasis(nBl, xBl);
      const R = Mt.clone().multiply(Mb.clone().transpose());
      const Pt = cAw.clone().addScaledVector(nAw, Number(j.offset) || 0);
      const cBl = new THREE.Vector3(...j.refB.c);
      const t = Pt.clone().sub(cBl.clone().applyMatrix4(R));
      const WbNew = R.clone().setPosition(t);
      return { WbNew, ao: Pt, ad: nAw };
    }
    const qa = new THREE.Quaternion();
    Wa.decompose(new THREE.Vector3(), qa, new THREE.Vector3());
    const qRel = Array.isArray(j.relQ) && j.relQ.length === 4 ? new THREE.Quaternion(...j.relQ) : new THREE.Quaternion();
    const qTarget = qa.clone().multiply(qRel);
    if (j.flip) qTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    const rotRad = ((Number(j.rot) || 0) * Math.PI) / 180;
    if (Math.abs(rotRad) > 1e-12) qTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotRad));
    const R = new THREE.Matrix4().makeRotationFromQuaternion(qTarget);
    const cBl = new THREE.Vector3(...j.refB.c);
    const t = cAw.clone().sub(cBl.clone().applyMatrix4(R));
    const WbNew = R.clone().setPosition(t);
    return { WbNew, ao: cAw, ad: new THREE.Vector3(0, 0, 1) };
  }

  // ---------- Winkel-Verbindung & Mittig-Verbindung (BG-07) ----------
  function evalAngleDeg(val, doc = App.doc) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return 0;
      const num = parseNum(s);
      if (!isNaN(num)) return num;
      const V = Model.vars(doc).v;
      const res = Expr.tryEval(s, V);
      if (res && res.ok && Number.isFinite(res.value)) return res.value;
    }
    return 0;
  }

  function rotBetweenWithAxis(from, to, fallbackAxis) {
    const a = from.clone().normalize(), b = to.clone().normalize();
    const dot = a.dot(b);
    if (dot > 1 - 1e-10) return new THREE.Quaternion();
    if (dot < -1 + 1e-9) {
      if (fallbackAxis && fallbackAxis.lengthSq() > 1e-10) {
        const ax = fallbackAxis.clone().addScaledVector(a, -fallbackAxis.dot(a));
        if (ax.lengthSq() > 1e-10) return new THREE.Quaternion().setFromAxisAngle(ax.normalize(), Math.PI);
      }
      const ref = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const ax = new THREE.Vector3().crossVectors(a, ref).normalize();
      return new THREE.Quaternion().setFromAxisAngle(ax, Math.PI);
    }
    return new THREE.Quaternion().setFromUnitVectors(a, b);
  }

  function defaultHingeAxis(uA) {
    const ref = Math.abs(uA.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const k = ref.clone().addScaledVector(uA, -ref.dot(uA));
    if (k.lengthSq() < 1e-9) return canonicalX(uA.toArray());
    return k.normalize();
  }

  function solveAnglePose(doc, j) {
    const A = top(j.a, doc), B = top(j.b, doc);
    if (!A || !B || !j.refA || !j.refB) return null;
    const Wa = Model.worldMatrix(doc, A.id);
    const Wb = Model.worldMatrix(doc, B.id);
    const dAl = new THREE.Vector3(...(j.refA.kind === 'edge' ? j.refA.d : j.refA.n)).normalize();
    const dBl = new THREE.Vector3(...(j.refB.kind === 'edge' ? j.refB.d : j.refB.n)).normalize();
    const uA = dAl.clone().transformDirection(Wa).normalize();
    const uB = dBl.clone().transformDirection(Wb).normalize();
    let kW = j.axisA ? new THREE.Vector3(...j.axisA).transformDirection(Wa) : defaultHingeAxis(uA);
    kW.addScaledVector(uA, -kW.dot(uA));
    if (kW.lengthSq() < 1e-9) kW = defaultHingeAxis(uA);
    kW.normalize();
    const deg = evalAngleDeg(j.angle, doc);
    const isMixed = j.refA.kind !== j.refB.kind;
    const rotDeg = isMixed ? (j.flip ? -(90 - deg) : (90 - deg)) : (j.flip ? -deg : deg);
    const baseA = uA.clone().multiplyScalar(j.alignSign < 0 ? -1 : 1);
    const t = baseA.clone().applyAxisAngle(kW, (rotDeg * Math.PI) / 180).normalize();
    const pB = new THREE.Vector3(...j.refB.c).applyMatrix4(Wb);
    const Q = rotBetweenWithAxis(uB, t, kW);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
    const WbNew = new THREE.Matrix4()
      .makeTranslation(pB.x, pB.y, pB.z)
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-pB.x, -pB.y, -pB.z))
      .multiply(Wb);
    return { WbNew, ao: pB, ad: kW };
  }

  function measureAngle(jid, doc = App.doc) {
    const j = typeof jid === 'object' ? jid : list(doc).find((x) => x.id === jid);
    if (!j || !isAngle(j) || !j.refA || !j.refB) return 0;
    const Wa = Model.worldMatrix(doc, j.a), Wb = Model.worldMatrix(doc, j.b);
    const dAl = new THREE.Vector3(...(j.refA.kind === 'edge' ? j.refA.d : j.refA.n)).normalize();
    const dBl = new THREE.Vector3(...(j.refB.kind === 'edge' ? j.refB.d : j.refB.n)).normalize();
    const uA = dAl.transformDirection(Wa).normalize();
    const uB = dBl.transformDirection(Wb).normalize();
    const cs = clamp(Math.abs(uA.dot(uB)), 0, 1);
    const rad = j.refA.kind !== j.refB.kind ? Math.asin(cs) : Math.acos(cs);
    return round((rad * 180) / Math.PI, 4);
  }

  function partExtentAlong(doc, itemId, worldDir) {
    const d = worldDir.clone().normalize();
    const W = Model.worldMatrix(doc, itemId);
    const res = App.results.get(itemId);
    const pos = res && res.data && res.data.pos;
    if (pos && pos.length >= 3) {
      const e = W.elements;
      const nx = d.x * e[0] + d.y * e[1] + d.z * e[2];
      const ny = d.x * e[4] + d.y * e[5] + d.z * e[6];
      const nz = d.x * e[8] + d.y * e[9] + d.z * e[10];
      const nt = d.x * e[12] + d.y * e[13] + d.z * e[14];
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const s = nx * pos[i] + ny * pos[i + 1] + nz * pos[i + 2] + nt;
        if (s < min) min = s;
        if (s > max) max = s;
      }
      if (isFinite(min) && isFinite(max)) return { min, max, mid: (min + max) / 2, width: max - min };
    }
    const b = (res && res.data && res.data.bbox) || App.localBox(itemId);
    if (!b) return null;
    let min = Infinity, max = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]).applyMatrix4(W);
      const s = v.dot(d);
      if (s < min) min = s;
      if (s > max) max = s;
    }
    return { min, max, mid: (min + max) / 2, width: max - min };
  }

  function solveCenterPose(doc, j) {
    const A = top(j.a, doc), B = top(j.b, doc);
    if (!A || !B || !j.refA1 || !j.refA2) return null;
    const Wa = Model.worldMatrix(doc, A.id);
    const Wb = Model.worldMatrix(doc, B.id);
    const c1w = new THREE.Vector3(...j.refA1.c).applyMatrix4(Wa);
    const n1w = new THREE.Vector3(...j.refA1.n).transformDirection(Wa).normalize();
    const c2w = new THREE.Vector3(...j.refA2.c).applyMatrix4(Wa);
    const sMidA = (c1w.dot(n1w) + c2w.dot(n1w)) / 2;
    const pMidA = c1w.clone().add(c2w).multiplyScalar(0.5);

    if (j.bMode === 'faces' && j.refB1 && j.refB2) {
      const nB1w = new THREE.Vector3(...j.refB1.n).transformDirection(Wb).normalize();
      const targetN = nB1w.dot(n1w) < 0 ? n1w.clone().negate() : n1w.clone();
      let cB1w = new THREE.Vector3(...j.refB1.c).applyMatrix4(Wb);
      let cB2w = new THREE.Vector3(...j.refB2.c).applyMatrix4(Wb);
      const pMidB = cB1w.clone().add(cB2w).multiplyScalar(0.5);
      let WbWork = Wb.clone();
      if (nB1w.dot(targetN) < 1 - 1e-9) {
        const Q = rotBetween(nB1w, targetN);
        const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
        const Mrot = new THREE.Matrix4()
          .makeTranslation(pMidB.x, pMidB.y, pMidB.z)
          .multiply(R)
          .multiply(new THREE.Matrix4().makeTranslation(-pMidB.x, -pMidB.y, -pMidB.z));
        WbWork = Mrot.multiply(WbWork);
        cB1w = new THREE.Vector3(...j.refB1.c).applyMatrix4(WbWork);
        cB2w = new THREE.Vector3(...j.refB2.c).applyMatrix4(WbWork);
      }
      const sMidB = (cB1w.dot(n1w) + cB2w.dot(n1w)) / 2;
      const delta = sMidA - sMidB;
      const WbNew = new THREE.Matrix4().makeTranslation(n1w.x * delta, n1w.y * delta, n1w.z * delta).multiply(WbWork);
      return { WbNew, ao: pMidA, ad: n1w };
    }

    const ext = partExtentAlong(doc, B.id, n1w);
    if (!ext) return null;
    const delta = sMidA - ext.mid;
    const WbNew = new THREE.Matrix4().makeTranslation(n1w.x * delta, n1w.y * delta, n1w.z * delta).multiply(Wb);
    return { WbNew, ao: pMidA, ad: n1w };
  }

  function centerMetrics(jid, doc = App.doc) {
    const j = typeof jid === 'object' ? jid : list(doc).find((x) => x.id === jid);
    if (!j || !isCenter(j) || !j.refA1 || !j.refA2) return null;
    const Wa = Model.worldMatrix(doc, j.a), Wb = Model.worldMatrix(doc, j.b);
    const c1w = new THREE.Vector3(...j.refA1.c).applyMatrix4(Wa);
    const n1w = new THREE.Vector3(...j.refA1.n).transformDirection(Wa).normalize();
    const c2w = new THREE.Vector3(...j.refA2.c).applyMatrix4(Wa);
    const s1 = c1w.dot(n1w), s2 = c2w.dot(n1w);
    const loA = Math.min(s1, s2), hiA = Math.max(s1, s2);
    let loB, hiB;
    if (j.bMode === 'faces' && j.refB1 && j.refB2) {
      const sb1 = new THREE.Vector3(...j.refB1.c).applyMatrix4(Wb).dot(n1w);
      const sb2 = new THREE.Vector3(...j.refB2.c).applyMatrix4(Wb).dot(n1w);
      loB = Math.min(sb1, sb2); hiB = Math.max(sb1, sb2);
    } else {
      const ext = partExtentAlong(doc, j.b, n1w);
      if (!ext) return null;
      loB = ext.min; hiB = ext.max;
    }
    return {
      widthA: round(hiA - loA, 4),
      widthB: round(hiB - loB, 4),
      gapLeft: round(loB - loA, 4),
      gapRight: round(hiA - hiB, 4),
    };
  }

  function solveConstraintPose(doc, j) {
    if (fixed(j)) return solveFixedPose(doc, j);
    if (isAngle(j)) return solveAnglePose(doc, j);
    if (isCenter(j)) return solveCenterPose(doc, j);
    return null;
  }

  function fixedOrder(doc) {
    const fjs = list(doc).filter(isConstraint);
    if (!fjs.length) return [];
    const targets = new Set(fjs.map((j) => j.b));
    const byA = new Map();
    for (const j of fjs) {
      if (!byA.has(j.a)) byA.set(j.a, []);
      byA.get(j.a).push(j);
    }
    const out = [], seen = new Set(), q = [];
    for (const j of fjs) if (!targets.has(j.a)) q.push(j);
    while (q.length) {
      const j = q.shift();
      if (seen.has(j.id)) continue;
      seen.add(j.id); out.push(j);
      for (const nx of byA.get(j.b) || []) q.push(nx);
    }
    for (const j of fjs) if (!seen.has(j.id)) out.push(j);
    return out;
  }

  function syncFixed(doc = App.doc, opts = {}) {
    return syncAll(doc, opts);
  }

  function resolvePlaneRef(spec, doc = App.doc) {
    if (!spec) return null;
    if (typeof spec === 'string') spec = { id: spec };
    if (!spec.id) return null;
    const res = App.results.get(spec.id);
    const data = res && res.data;
    const faces = data && data.faces;
    const bbox = data && data.bbox;
    const idx = spec.faceIdx != null ? spec.faceIdx : (spec.idx != null ? spec.idx : null);
    let fi = null;
    if (idx != null && faces && faces.length) {
      fi = faces[idx] || null;
      if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.c) || !Array.isArray(fi.n)) return null;
    } else if (spec.info && spec.info.t === 'PLANE') {
      fi = spec.info;
    }
    const cRaw = (fi && fi.c) || spec.c || spec.p;
    const nRaw = (fi && fi.n) || spec.n;
    if (!Array.isArray(cRaw) || !Array.isArray(nRaw)) return null;
    const cv = new THREE.Vector3(...cRaw), nv = new THREE.Vector3(...nRaw);
    if (nv.lengthSq() < 1e-12) return null;
    if (spec.world) {
      const invW = Model.worldMatrix(doc, spec.id).invert();
      cv.applyMatrix4(invW);
      nv.transformDirection(invW);
    }
    nv.normalize();
    const cArr = r6(cv.toArray());
    return {
      kind: 'face',
      c: cArr,
      n: r9(nv.toArray()),
      tid: (fi && fi.tid) || spec.tid || null,
      idx,
      frac: fracOf(cArr, bbox),
    };
  }

  function resolveCylRef(spec, doc = App.doc) {
    if (!spec) return null;
    if (typeof spec === 'string') spec = { id: spec };
    if (!spec.id) return null;
    const res = App.results.get(spec.id);
    const data = res && res.data;
    const faces = data && data.faces;
    const bbox = data && data.bbox;
    const idx = spec.faceIdx != null ? spec.faceIdx : (spec.idx != null ? spec.idx : null);
    let fi = null;
    if (idx != null && faces && faces.length) {
      fi = faces[idx] || null;
      if (!fi || fi.t !== 'CYLINDRE' || !Array.isArray(fi.axis) || !(fi.r > 0)) return null;
    } else if (spec.info && spec.info.t === 'CYLINDRE' && Array.isArray(spec.info.axis) && spec.info.r > 0) {
      fi = spec.info;
    } else if (!Array.isArray(spec.o) && !Array.isArray(spec.d) && faces && faces.length) {
      fi = faces.find((f) => f && f.t === 'CYLINDRE' && Array.isArray(f.axis) && f.r > 0) || null;
    }
    let ov, dv, rad, cArr;
    if (fi) {
      const { l, d } = cylPointOnAxis(fi);
      ov = l; dv = d; rad = Number(fi.r);
      cArr = Array.isArray(fi.c) ? r6(fi.c) : r6(l.toArray());
    } else if (Array.isArray(spec.o) && Array.isArray(spec.d) && Number(spec.r) > 0) {
      ov = new THREE.Vector3(...spec.o);
      dv = new THREE.Vector3(...spec.d);
      rad = Number(spec.r);
      if (dv.lengthSq() < 1e-12) return null;
      if (spec.world) {
        const invW = Model.worldMatrix(doc, spec.id).invert();
        ov.applyMatrix4(invW);
        dv.transformDirection(invW);
      }
      dv.normalize();
      cArr = r6(ov.toArray());
    } else return null;
    const oArr = r6(ov.toArray());
    return {
      kind: 'cyl',
      o: oArr,
      d: r9(dv.toArray()),
      r: round(rad, 6),
      c: cArr,
      tid: (fi && fi.tid) || spec.tid || null,
      idx,
      frac: fracOf(cArr, bbox),
    };
  }

  function matchCylRef(itemId, ref) {
    if (!ref || ref.kind !== 'cyl') return null;
    const res = App.results.get(itemId);
    const data = res && res.data;
    const faces = data && data.faces;
    if (!faces || !faces.length) return null;
    const bbox = data.bbox;
    if (ref.tid) {
      const byTid = faces.findIndex((f) => f && f.t === 'CYLINDRE' && f.tid === ref.tid && Array.isArray(f.axis) && f.r > 0);
      if (byTid >= 0) {
        const f = faces[byTid];
        const { l, d } = cylPointOnAxis(f);
        const cArr = Array.isArray(f.c) ? r6(f.c) : r6(l.toArray());
        return { idx: byTid, o: r6(l.toArray()), d: r9(d.toArray()), r: round(f.r, 6), c: cArr, tid: f.tid, frac: fracOf(cArr, bbox) };
      }
    }
    const rd = new THREE.Vector3(...ref.d).normalize();
    const rc = ref.c || ref.o;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f || f.t !== 'CYLINDRE' || !Array.isArray(f.axis) || !(f.r > 0)) continue;
      const { l, d } = cylPointOnAxis(f);
      if (Math.abs(d.dot(rd)) < 0.995) continue;
      const fc = Array.isArray(f.c) ? f.c : l.toArray();
      let score = Math.hypot(fc[0] - rc[0], fc[1] - rc[1], fc[2] - rc[2]) + Math.abs(f.r - ref.r) * 10;
      if (ref.frac && bbox) {
        const ff = fracOf(fc, bbox);
        const fDist = Math.hypot(ff[0] - ref.frac[0], ff[1] - ref.frac[1], ff[2] - ref.frac[2]);
        score = fDist * 100 + score * 1e-3;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return null;
    const f = faces[best];
    const { l, d } = cylPointOnAxis(f);
    const cArr = Array.isArray(f.c) ? r6(f.c) : r6(l.toArray());
    return { idx: best, o: r6(l.toArray()), d: r9(d.toArray()), r: round(f.r, 6), c: cArr, tid: f.tid || ref.tid || null, frac: fracOf(cArr, bbox) };
  }

  function evalDist(j, V) {
    return Model.num(j && j.dist, V || Model.vars(App.doc).v, 0);
  }

  function parseDistVal(raw, V) {
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return { ok: false, msg: 'Bitte einen gültigen Abstand eingeben.' };
      return { ok: true, value: round(raw, 6) };
    }
    const s = String(raw ?? '').trim();
    if (!s) return { ok: false, msg: 'Bitte einen gültigen Abstand eingeben.' };
    const p = Units.parseLen(s, V || Model.vars(App.doc).v, { expr: true });
    if (!p.ok) return { ok: false, msg: p.error || 'Der Abstand konnte nicht berechnet werden.' };
    return { ok: true, value: typeof p.value === 'number' ? round(p.value, 6) : p.value };
  }

  function rotMatrixAround(pt, q) {
    const R = new THREE.Matrix4().makeRotationFromQuaternion(q);
    return new THREE.Matrix4().makeTranslation(pt.x, pt.y, pt.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-pt.x, -pt.y, -pt.z));
  }

  function projectLooseMatrix(doc, j, Wb, V, hintAxis = null) {
    const Wa = Model.worldMatrix(doc, j.a);
    const k = kindOf(j);
    if (k === 'parallel' || k === 'distance') {
      const pA = new THREE.Vector3(...j.refA.c).applyMatrix4(Wa);
      const nA = new THREE.Vector3(...j.refA.n).transformDirection(Wa).normalize();
      const pB = new THREE.Vector3(...j.refB.c).applyMatrix4(Wb);
      const nB = new THREE.Vector3(...j.refB.n).transformDirection(Wb).normalize();
      const nTarget = j.flip ? nA.clone() : nA.clone().negate();
      const angErr = nB.distanceTo(nTarget);
      let WbNew = angErr > 1e-12 ? rotMatrixAround(pB, rotBetween(nB, nTarget, hintAxis)).multiply(Wb) : Wb.clone();
      if (k === 'parallel') return { Wb: WbNew, err: angErr * 10, ao: pA, ad: nA };
      const d = evalDist(j, V);
      const s = pB.clone().sub(pA).dot(nA);
      const delta = d - s;
      if (Math.abs(delta) > 1e-12) WbNew = new THREE.Matrix4().makeTranslation(nA.x * delta, nA.y * delta, nA.z * delta).multiply(WbNew);
      const bo = pB.clone().addScaledVector(nA, delta);
      const ao = bo.clone().addScaledVector(nA, -d);
      return { Wb: WbNew, err: angErr * 10 + Math.abs(delta), ao, ad: nA, bo };
    }
    if (k === 'tangent') {
      if (j.refA.kind === 'face' && j.refB.kind === 'cyl') {
        const pA = new THREE.Vector3(...j.refA.c).applyMatrix4(Wa);
        const nA = new THREE.Vector3(...j.refA.n).transformDirection(Wa).normalize();
        const oB = new THREE.Vector3(...j.refB.o).applyMatrix4(Wb);
        const dB = new THREE.Vector3(...j.refB.d).transformDirection(Wb).normalize();
        const R = Number(j.refB.r) || 0;
        const dotDN = dB.dot(nA);
        let dTarget = dB.clone().addScaledVector(nA, -dotDN);
        if (dTarget.lengthSq() < 1e-10) dTarget = canonicalX(nA.toArray());
        else dTarget.normalize();
        let WbNew = Math.abs(dotDN) > 1e-12 ? rotMatrixAround(oB, rotBetween(dB, dTarget, hintAxis)).multiply(Wb) : Wb.clone();
        const sTarget = j.flip ? -R : R;
        const s = oB.clone().sub(pA).dot(nA);
        const delta = sTarget - s;
        if (Math.abs(delta) > 1e-12) WbNew = new THREE.Matrix4().makeTranslation(nA.x * delta, nA.y * delta, nA.z * delta).multiply(WbNew);
        const ao = oB.clone().addScaledVector(nA, delta - sTarget);
        return { Wb: WbNew, err: Math.abs(dotDN) * 10 + Math.abs(delta), ao, ad: nA };
      }
      if (j.refA.kind === 'cyl' && j.refB.kind === 'face') {
        const oA = new THREE.Vector3(...j.refA.o).applyMatrix4(Wa);
        const dA = new THREE.Vector3(...j.refA.d).transformDirection(Wa).normalize();
        const R = Number(j.refA.r) || 0;
        const pB = new THREE.Vector3(...j.refB.c).applyMatrix4(Wb);
        const nB = new THREE.Vector3(...j.refB.n).transformDirection(Wb).normalize();
        const dotND = nB.dot(dA);
        let nTarget = nB.clone().addScaledVector(dA, -dotND);
        if (nTarget.lengthSq() < 1e-10) {
          const radVec = oA.clone().sub(pB);
          radVec.addScaledVector(dA, -radVec.dot(dA));
          nTarget = radVec.lengthSq() > 1e-10 ? radVec.normalize() : canonicalX(dA.toArray());
        } else nTarget.normalize();
        let WbNew = Math.abs(dotND) > 1e-12 ? rotMatrixAround(pB, rotBetween(nB, nTarget, hintAxis)).multiply(Wb) : Wb.clone();
        const sTarget = j.flip ? -R : R;
        const s = oA.clone().sub(pB).dot(nTarget);
        const delta = s - sTarget;
        if (Math.abs(delta) > 1e-12) WbNew = new THREE.Matrix4().makeTranslation(nTarget.x * delta, nTarget.y * delta, nTarget.z * delta).multiply(WbNew);
        const ao = pB.clone().addScaledVector(nTarget, delta);
        return { Wb: WbNew, err: Math.abs(dotND) * 10 + Math.abs(delta), ao, ad: nTarget };
      }
    }
    return { Wb: Wb.clone(), err: 0 };
  }

  function looseError(doc, j, V) {
    return projectLooseMatrix(doc, j, Model.worldMatrix(doc, j.b), V).err;
  }

  function projectKinematicMatrix(doc, kinJ, Wb) {
    if (isConstraint(kinJ)) {
      const sol = solveConstraintPose(doc, kinJ);
      return { Wb: sol ? sol.WbNew : Wb.clone(), next: null, err: sol ? maxMatDiff(sol.WbNew, Wb) : 0 };
    }
    const Pb = Model.parentWorld(doc, kinJ.b);
    const W_home = Pb.clone().multiply(new THREE.Matrix4().fromArray(kinJ.home));
    const D_want = Wb.clone().multiply(W_home.clone().invert());
    const o = new THREE.Vector3(...kinJ.ao);
    const dp = o.clone().applyMatrix4(D_want).sub(o);
    const k = kindOf(kinJ);
    const raw = stateOf(kinJ);
    if (k === 'cyl') {
      const d = new THREE.Vector3(...kinJ.ad).normalize();
      raw.pos = round(dp.dot(d), 5);
      raw.ang = round(twistDegAround(D_want, d), 5);
    } else if (k === 'planar') {
      const pf = planeFrame(kinJ);
      raw.u = round(dp.dot(pf.u), 5);
      raw.v = round(dp.dot(pf.v), 5);
      raw.ang = round(twistDegAround(D_want, pf.n), 5);
    } else if (k === 'ball') {
      const pf = planeFrame(kinJ);
      const F = new THREE.Matrix4().makeBasis(pf.u, pf.v, pf.n);
      const R_world = new THREE.Matrix4().extractRotation(D_want);
      const R_loc = F.clone().transpose().multiply(R_world).multiply(F);
      const e = new THREE.Euler().setFromRotationMatrix(R_loc, 'XYZ');
      const toDeg = (rad) => {
        let dg = round((rad * 180) / Math.PI, 5);
        if (dg > 180) dg -= 360;
        if (dg < -180) dg += 360;
        return dg;
      };
      raw.rx = toDeg(e.x);
      raw.ry = toDeg(e.y);
      raw.ang = toDeg(e.z);
    } else if (k === 'slot') {
      const fr = frameOf(kinJ);
      raw.pos = round(clamp(dp.dot(fr.d), fr.minPos, fr.maxPos), 5);
      raw.ang = round(twistDegAround(D_want, fr.n), 5);
    } else if (k === 'slide') {
      const d = new THREE.Vector3(...kinJ.ad).normalize();
      raw.ang = round(dp.dot(d), 5);
    } else {
      const d = new THREE.Vector3(...kinJ.ad).normalize();
      raw.ang = round(twistDegAround(D_want, d), 5);
    }
    const next = kinJ.stopsLocked ? clampState(kinJ, raw) : raw;
    const WbProj = Pb.clone().multiply(pose(kinJ, next, null, doc));
    return { Wb: WbProj, next, err: maxMatDiff(WbProj, Wb) };
  }

  function solvePartConstraints(doc, bId, V, opts = {}) {
    const B = top(bId, doc);
    const looseJs = looseOf(bId, doc);
    const kinJ = drivingOf(bId, doc);
    if (!B || B.locked || !looseJs.length || fixed(kinJ)) return { changed: false, err: 0 };
    const WbStart = Model.worldMatrix(doc, bId);
    let Wb = WbStart.clone();
    const hintAxis = kinJ && Array.isArray(kinJ.ad) ? new THREE.Vector3(...kinJ.ad).normalize() : null;
    let lastKinState = null;
    let iterErr = 0;
    for (let it = 0; it < 120; it++) {
      iterErr = 0;
      for (const j of looseJs) {
        const pr = projectLooseMatrix(doc, j, Wb, V, hintAxis);
        Wb = pr.Wb;
        if (pr.err > iterErr) iterErr = pr.err;
      }
      if (kinJ) {
        const pk = projectKinematicMatrix(doc, kinJ, Wb);
        Wb = pk.Wb;
        lastKinState = pk.next;
        if (pk.err > iterErr) iterErr = pk.err;
      }
      if (iterErr < 1e-6) break;
    }
    let finalErr = 0;
    for (const j of looseJs) finalErr = Math.max(finalErr, projectLooseMatrix(doc, j, Wb, V, hintAxis).err);
    if (kinJ) finalErr = Math.max(finalErr, projectKinematicMatrix(doc, kinJ, Wb).err);
    const changed = maxMatDiff(Wb, WbStart) > 1e-5;
    if (opts.dryRun) return { changed, err: finalErr };
    if (kinJ && lastKinState) {
      writeState(kinJ, lastKinState);
      if (!kinJ.stopsLocked) {
        if (lastKinState.ang < (kinJ.min ?? -180)) kinJ.min = round(Math.floor(lastKinState.ang), 2);
        if (lastKinState.ang > (kinJ.max ?? 180)) kinJ.max = round(Math.ceil(lastKinState.ang), 2);
        if (isCyl(kinJ)) {
          if (lastKinState.pos < (kinJ.minPos ?? -20)) kinJ.minPos = round(Math.floor(lastKinState.pos), 2);
          if (lastKinState.pos > (kinJ.maxPos ?? 20)) kinJ.maxPos = round(Math.ceil(lastKinState.pos), 2);
        } else if (isPlanar(kinJ)) {
          if (lastKinState.u < (kinJ.minU ?? -20)) kinJ.minU = round(Math.floor(lastKinState.u), 2);
          if (lastKinState.u > (kinJ.maxU ?? 20)) kinJ.maxU = round(Math.ceil(lastKinState.u), 2);
          if (lastKinState.v < (kinJ.minV ?? -20)) kinJ.minV = round(Math.floor(lastKinState.v), 2);
          if (lastKinState.v > (kinJ.maxV ?? 20)) kinJ.maxV = round(Math.ceil(lastKinState.v), 2);
        }
      }
    }
    const LbNew = Model.parentWorld(doc, bId).invert().multiply(Wb);
    if (maxMatDiff(LbNew, Model.localMatrix(B)) > 1e-6) Model.setFromMatrix(B, LbNew);
    for (const j of looseJs) {
      const pr = projectLooseMatrix(doc, j, Wb, V, hintAxis);
      if (pr.ao) j.ao = r6(pr.ao.toArray());
      if (pr.ad) j.ad = r9(pr.ad.toArray());
      if (pr.bo) j.bo = r6(pr.bo.toArray()); else delete j.bo;
    }
    return { changed, err: finalErr };
  }

  function constraintOrder(doc) {
    const js = list(doc);
    const activeBs = new Set(js.filter((j) => isConstraint(j) || isLoose(j)).map((j) => j.b));
    if (!activeBs.size) return [];
    const nodes = new Set();
    const adj = new Map(), indeg = new Map();
    for (const j of js) {
      nodes.add(j.a); nodes.add(j.b);
      if (!adj.has(j.a)) adj.set(j.a, []);
      adj.get(j.a).push(j.b);
      indeg.set(j.b, (indeg.get(j.b) || 0) + 1);
      if (!indeg.has(j.a)) indeg.set(j.a, 0);
    }
    const q = [], order = [], seen = new Set();
    for (const id of nodes) if ((indeg.get(id) || 0) === 0) q.push(id);
    while (q.length) {
      const u = q.shift();
      if (seen.has(u)) continue;
      seen.add(u);
      if (activeBs.has(u)) order.push(u);
      for (const v of adj.get(u) || []) {
        const d = (indeg.get(v) || 1) - 1;
        indeg.set(v, d);
        if (d <= 0 && !seen.has(v)) q.push(v);
      }
    }
    for (const id of activeBs) if (!seen.has(id)) order.push(id);
    return order;
  }

  function syncAll(doc = App.doc, opts = {}) {
    const order = constraintOrder(doc);
    if (!order.length) return false;
    const V = Model.vars(doc).v;
    let changed = false;
    for (const bId of order) {
      const B = top(bId, doc);
      if (!B || B.locked) continue;
      const cj = list(doc).find((j) => isConstraint(j) && j.b === bId) || null;
      const hasLoose = looseOf(bId, doc).length > 0;
      if (cj && (fixed(cj) || !hasLoose)) {
        const WbOld = Model.worldMatrix(doc, bId);
        const sol = solveConstraintPose(doc, cj);
        if (!sol) continue;
        const Pb = Model.parentWorld(doc, bId);
        const LbNew = Pb.clone().invert().multiply(sol.WbNew);
        const LbOld = Model.localMatrix(B);
        if (maxMatDiff(LbNew, LbOld) > 1e-5) {
          Model.setFromMatrix(B, LbNew);
          cj.home = r9(Model.localMatrix(B).toArray());
          cj.ao = r6(sol.ao.toArray());
          cj.ad = r9(sol.ad.toArray());
          changed = true;
          if (opts.live && isTop(B.id, doc)) Viewer.updateNode(B.id, { matrix: Model.localMatrix(B) });
          const hasNonConstraintChild = list(doc).some((k) => k.a === B.id && !isConstraint(k) && !isLoose(k));
          if (hasNonConstraintChild) {
            const D = sol.WbNew.clone().multiply(WbOld.clone().invert());
            moveChain(doc, B.id, D, opts);
          }
        }
      } else if (hasLoose) {
        const WbOld = Model.worldMatrix(doc, bId);
        const res = solvePartConstraints(doc, bId, V);
        if (res.changed) {
          changed = true;
          if (opts.live && isTop(B.id, doc)) Viewer.updateNode(B.id, { matrix: Model.localMatrix(B) });
          const hasKinChild = list(doc).some((k) => k.a === B.id && !isConstraint(k) && !isLoose(k));
          if (hasKinChild) {
            const WbNew = Model.worldMatrix(doc, bId);
            const D = WbNew.clone().multiply(WbOld.clone().invert());
            moveChain(doc, B.id, D, opts);
          }
        }
      }
    }
    return changed;
  }

  function resolveRef(spec, doc = App.doc) {
    if (!spec || !spec.id) return null;
    const res = App.results.get(spec.id);
    const data = res && res.data;
    const bbox = data && data.bbox;
    const isFace = spec.kind === 'face' || (spec.kind !== 'point' && (spec.faceIdx != null || spec.idx != null || (spec.info && spec.info.n)));
    if (isFace) {
      const idx = spec.faceIdx != null ? spec.faceIdx : (spec.idx != null ? spec.idx : null);
      const fi = (idx != null && data && data.faces && data.faces[idx]) || spec.info || null;
      const cRaw = (fi && fi.c) || spec.c;
      const nRaw = (fi && fi.n) || spec.n;
      if (!cRaw || !nRaw) return null;
      const cv = new THREE.Vector3(...cRaw);
      const nv = new THREE.Vector3(...nRaw);
      const xv = spec.x ? new THREE.Vector3(...spec.x) : null;
      if (spec.world) {
        const invW = Model.worldMatrix(doc, spec.id).invert();
        cv.applyMatrix4(invW);
        nv.transformDirection(invW);
        if (xv) xv.transformDirection(invW);
      }
      nv.normalize();
      let xOrtho = xv ? xv.clone().addScaledVector(nv, -xv.dot(nv)) : canonicalX(nv.toArray());
      if (xOrtho.lengthSq() < 1e-9) xOrtho = canonicalX(nv.toArray());
      xOrtho.normalize();
      const cArr = r6(cv.toArray());
      return {
        kind: 'face',
        c: cArr,
        n: r9(nv.toArray()),
        x: r9(xOrtho.toArray()),
        tid: (fi && fi.tid) || spec.tid || null,
        idx,
        frac: fracOf(cArr, bbox),
        ...(spec.dock ? { dock: true } : {}),
      };
    }
    const pt = spec.c || spec.p || spec.point;
    if (!pt) return null;
    const cv = new THREE.Vector3(...pt);
    if (spec.world) cv.applyMatrix4(Model.worldMatrix(doc, spec.id).invert());
    const cArr = r6(cv.toArray());
    return { kind: 'point', c: cArr, n: null, x: null, tid: null, idx: null, frac: fracOf(cArr, bbox) };
  }

  function matchFaceRef(itemId, ref) {
    if (!ref || ref.kind !== 'face') return null;
    const res = App.results.get(itemId);
    const data = res && res.data;
    const faces = data && data.faces;
    if (!faces || !faces.length) return null;
    const bbox = data.bbox;
    if (ref.tid) {
      const byTid = faces.findIndex((f) => f && f.t === 'PLANE' && f.tid === ref.tid && f.c && f.n);
      if (byTid >= 0) {
        const f = faces[byTid];
        return { idx: byTid, c: r6(f.c), n: r9(f.n), tid: f.tid, frac: fracOf(f.c, bbox) };
      }
    }
    const rn = new THREE.Vector3(...ref.n).normalize();
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f || f.t !== 'PLANE' || !f.c || !f.n) continue;
      const fn = new THREE.Vector3(...f.n).normalize();
      if (fn.dot(rn) < 0.995) continue;
      let score = Math.hypot(f.c[0] - ref.c[0], f.c[1] - ref.c[1], f.c[2] - ref.c[2]);
      if (ref.frac && bbox) {
        const ff = fracOf(f.c, bbox);
        const fDist = Math.hypot(ff[0] - ref.frac[0], ff[1] - ref.frac[1], ff[2] - ref.frac[2]);
        score = fDist * 100 + score * 1e-3;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return null;
    const f = faces[best];
    return { idx: best, c: r6(f.c), n: r9(f.n), tid: f.tid || ref.tid || null, frac: fracOf(f.c, bbox) };
  }

  function resolveOrientRef(spec, doc = App.doc) {
    if (!spec || !spec.id) return null;
    const res = App.results.get(spec.id);
    const data = res && res.data;
    const bbox = data && data.bbox;
    const isEdge = spec.kind === 'edge' || (spec.kind !== 'face' && spec.edgeIdx != null);
    if (isEdge) {
      const idx = spec.edgeIdx != null ? spec.edgeIdx : (spec.idx != null ? spec.idx : null);
      const g = (idx != null && data && data.edges && data.edges[idx]) || spec.info || null;
      if (g && g.t && g.t !== 'LINE') return null;
      let cv, dv;
      if (g && Array.isArray(g.a) && Array.isArray(g.b)) {
        const va = new THREE.Vector3(...g.a), vb = new THREE.Vector3(...g.b);
        cv = va.clone().add(vb).multiplyScalar(0.5);
        dv = vb.clone().sub(va);
      } else if (spec.c && spec.d) {
        cv = new THREE.Vector3(...spec.c);
        dv = new THREE.Vector3(...spec.d);
      } else return null;
      if (dv.lengthSq() < 1e-12) return null;
      if (spec.world) {
        const invW = Model.worldMatrix(doc, spec.id).invert();
        cv.applyMatrix4(invW);
        dv.transformDirection(invW);
      }
      dv.normalize();
      const cArr = r6(cv.toArray());
      return {
        kind: 'edge',
        c: cArr,
        d: r9(dv.toArray()),
        tid: (g && g.tid) || spec.tid || null,
        idx,
        frac: fracOf(cArr, bbox),
      };
    }
    const idx = spec.faceIdx != null ? spec.faceIdx : (spec.idx != null ? spec.idx : null);
    const fi = (idx != null && data && data.faces && data.faces[idx]) || spec.info || null;
    if (fi && fi.t && fi.t !== 'PLANE') return null;
    return resolveRef({ ...spec, kind: 'face' }, doc);
  }

  function matchEdgeRef(itemId, ref) {
    if (!ref || ref.kind !== 'edge') return null;
    const res = App.results.get(itemId);
    const data = res && res.data;
    const edges = data && data.edges;
    if (!edges || !edges.length) return null;
    const bbox = data.bbox;
    const rd = new THREE.Vector3(...ref.d).normalize();
    const buildOut = (idx, e) => {
      const va = new THREE.Vector3(...e.a), vb = new THREE.Vector3(...e.b);
      const mid = va.clone().add(vb).multiplyScalar(0.5);
      const dir = vb.clone().sub(va).normalize();
      if (dir.dot(rd) < 0) dir.negate();
      const mArr = r6(mid.toArray());
      return { idx, c: mArr, d: r9(dir.toArray()), tid: e.tid || ref.tid || null, frac: fracOf(mArr, bbox) };
    };
    if (ref.tid) {
      const byTid = edges.findIndex((e) => e && e.t === 'LINE' && e.tid === ref.tid && e.a && e.b);
      if (byTid >= 0) return buildOut(byTid, edges[byTid]);
    }
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (!e || e.t !== 'LINE' || !e.a || !e.b) continue;
      const dir = new THREE.Vector3(...e.b).sub(new THREE.Vector3(...e.a));
      if (dir.lengthSq() < 1e-12) continue;
      dir.normalize();
      if (Math.abs(dir.dot(rd)) < 0.995) continue;
      const mc = [(e.a[0] + e.b[0]) * 0.5, (e.a[1] + e.b[1]) * 0.5, (e.a[2] + e.b[2]) * 0.5];
      let score = Math.hypot(mc[0] - ref.c[0], mc[1] - ref.c[1], mc[2] - ref.c[2]);
      if (ref.frac && bbox) {
        const ff = fracOf(mc, bbox);
        const fDist = Math.hypot(ff[0] - ref.frac[0], ff[1] - ref.frac[1], ff[2] - ref.frac[2]);
        score = fDist * 100 + score * 1e-3;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return null;
    return buildOut(best, edges[best]);
  }

  let relinking = false;
  function relinkFixed() {
    if (relinking || !App.doc) return;
    const fjs = list().filter((j) => isConstraint(j) || isLoose(j));
    if (!fjs.length) return;
    const V = Model.vars(App.doc).v;
    const refUpdates = [];
    let needSync = false;
    const queueFace = (jid, side, itemId, ref) => {
      const m = matchFaceRef(itemId, ref);
      if (!m) return;
      const dc = Math.hypot(m.c[0] - ref.c[0], m.c[1] - ref.c[1], m.c[2] - ref.c[2]);
      const dn = Math.hypot(m.n[0] - ref.n[0], m.n[1] - ref.n[1], m.n[2] - ref.n[2]);
      if (dc > 1e-4 || dn > 1e-4 || (m.tid && m.tid !== ref.tid)) refUpdates.push({ jid, side, kind: 'face', m });
    };
    const queueEdge = (jid, side, itemId, ref) => {
      const m = matchEdgeRef(itemId, ref);
      if (!m) return;
      const dc = Math.hypot(m.c[0] - ref.c[0], m.c[1] - ref.c[1], m.c[2] - ref.c[2]);
      const dd = Math.hypot(m.d[0] - ref.d[0], m.d[1] - ref.d[1], m.d[2] - ref.d[2]);
      if (dc > 1e-4 || dd > 1e-4 || (m.tid && m.tid !== ref.tid)) refUpdates.push({ jid, side, kind: 'edge', m });
    };
    for (const j of fjs) {
      if (fixed(j) && j.mode === 'face') {
        if (j.refA && !j.refA.dock) queueFace(j.id, 'refA', j.a, j.refA);
        if (j.refB && !j.refB.dock) queueFace(j.id, 'refB', j.b, j.refB);
      } else if (isAngle(j)) {
        if (j.refA && j.refA.kind === 'face') queueFace(j.id, 'refA', j.a, j.refA);
        else if (j.refA && j.refA.kind === 'edge') queueEdge(j.id, 'refA', j.a, j.refA);
        if (j.refB && j.refB.kind === 'face') queueFace(j.id, 'refB', j.b, j.refB);
        else if (j.refB && j.refB.kind === 'edge') queueEdge(j.id, 'refB', j.b, j.refB);
      } else if (isCenter(j)) {
        if (j.refA1) queueFace(j.id, 'refA1', j.a, j.refA1);
        if (j.refA2) queueFace(j.id, 'refA2', j.a, j.refA2);
        if (j.bMode === 'faces') {
          if (j.refB1) queueFace(j.id, 'refB1', j.b, j.refB1);
          if (j.refB2) queueFace(j.id, 'refB2', j.b, j.refB2);
        }
      } else if (isLoose(j)) {
        for (const [side, itemId] of [['refA', j.a], ['refB', j.b]]) {
          const ref = j[side];
          if (!ref) continue;
          if (ref.kind === 'face') {
            queueFace(j.id, side, itemId, ref);
          } else if (ref.kind === 'cyl') {
            const m = matchCylRef(itemId, ref);
            if (m) {
              const do_ = Math.hypot(m.o[0] - ref.o[0], m.o[1] - ref.o[1], m.o[2] - ref.o[2]);
              const dd = Math.hypot(m.d[0] - ref.d[0], m.d[1] - ref.d[1], m.d[2] - ref.d[2]);
              const dr = Math.abs(m.r - ref.r);
              if (do_ > 1e-4 || dd > 1e-4 || dr > 1e-4 || (m.tid && m.tid !== ref.tid)) refUpdates.push({ jid: j.id, side, kind: 'cyl', m });
            }
          }
        }
      }
      const B = top(j.b);
      if (B && !B.locked) {
        if (isConstraint(j)) {
          const sol = solveConstraintPose(App.doc, j);
          if (sol) {
            const LbNew = Model.parentWorld(App.doc, B.id).invert().multiply(sol.WbNew);
            if (maxMatDiff(LbNew, Model.localMatrix(B)) > 1e-4) needSync = true;
          }
        } else if (solvePartConstraints(App.doc, j.b, V, { dryRun: true }).changed) {
          needSync = true;
        }
      }
    }
    if (!refUpdates.length && !needSync) return;
    relinking = true;
    try {
      App.change('Verbindung nachgeführt', (doc) => {
        for (const u of refUpdates) {
          const j = list(doc).find((x) => x.id === u.jid);
          if (!j || !j[u.side]) continue;
          const prev = j[u.side];
          if (u.kind === 'cyl') {
            j[u.side] = { ...prev, o: u.m.o, d: u.m.d, r: u.m.r, c: u.m.c, tid: u.m.tid, idx: u.m.idx, frac: u.m.frac };
          } else if (u.kind === 'edge') {
            j[u.side] = { ...prev, c: u.m.c, d: u.m.d, tid: u.m.tid, idx: u.m.idx, frac: u.m.frac };
          } else {
            const nVec = new THREE.Vector3(...u.m.n).normalize();
            let xVec = prev.x ? new THREE.Vector3(...prev.x) : canonicalX(u.m.n);
            xVec.addScaledVector(nVec, -xVec.dot(nVec));
            if (xVec.lengthSq() < 1e-9) xVec = canonicalX(u.m.n);
            xVec.normalize();
            j[u.side] = { ...prev, c: u.m.c, n: u.m.n, x: r9(xVec.toArray()), tid: u.m.tid, idx: u.m.idx, frac: u.m.frac };
          }
        }
        const synced = syncAll(doc);
        if (!refUpdates.length && !synced) return false;
      }, { amend: true });
    } finally { relinking = false; }
  }

  function preparePartReplace(doc, itemId) {
    if (!doc || !itemId || !Array.isArray(doc.joints)) return 0;
    let touched = 0;
    const clearRef = (ref) => {
      if (!ref || typeof ref !== 'object') return;
      ref.tid = null;
      delete ref.dock;
    };
    for (const j of doc.joints) {
      if (!j) continue;
      if (j.a === itemId) {
        clearRef(j.refA); clearRef(j.refA1); clearRef(j.refA2);
        touched++;
      }
      if (j.b === itemId) {
        clearRef(j.refB); clearRef(j.refB1); clearRef(j.refB2);
        touched++;
      }
    }
    return touched;
  }

  function finalizePartReplace(itemId) {
    if (!App.doc || !itemId) return { total: 0, kept: 0, dropped: 0, droppedIds: [] };
    const touching = list().filter((j) => j.a === itemId || j.b === itemId);
    const total = touching.length;
    if (!total) return { total: 0, kept: 0, dropped: 0, droppedIds: [] };
    const res = App.results.get(itemId);
    const data = res && res.data;
    if (!data) return { total, kept: total, dropped: 0, droppedIds: [] };
    const bbox = data.bbox;
    const dropIds = new Set();
    const refUpdates = [];
    const centerDowngrades = new Set();

    const makeFaceRefObj = (prev, m) => {
      const nVec = new THREE.Vector3(...m.n).normalize();
      let xVec = prev && prev.x ? new THREE.Vector3(...prev.x) : canonicalX(m.n);
      xVec.addScaledVector(nVec, -xVec.dot(nVec));
      if (xVec.lengthSq() < 1e-9) xVec = canonicalX(m.n);
      xVec.normalize();
      return { ...(prev || {}), kind: 'face', c: m.c, n: m.n, x: r9(xVec.toArray()), tid: m.tid, idx: m.idx, frac: m.frac };
    };
    const sameFace = (prev, m) => prev && prev.c && prev.n
      && Math.hypot(m.c[0] - prev.c[0], m.c[1] - prev.c[1], m.c[2] - prev.c[2]) <= 1e-4
      && Math.hypot(m.n[0] - prev.n[0], m.n[1] - prev.n[1], m.n[2] - prev.n[2]) <= 1e-4
      && (m.tid || null) === (prev.tid || null);
    const sameEdge = (prev, m) => prev && prev.c && prev.d
      && Math.hypot(m.c[0] - prev.c[0], m.c[1] - prev.c[1], m.c[2] - prev.c[2]) <= 1e-4
      && Math.hypot(m.d[0] - prev.d[0], m.d[1] - prev.d[1], m.d[2] - prev.d[2]) <= 1e-4
      && (m.tid || null) === (prev.tid || null);
    const sameCyl = (prev, m) => prev && prev.o && prev.d
      && Math.hypot(m.o[0] - prev.o[0], m.o[1] - prev.o[1], m.o[2] - prev.o[2]) <= 1e-4
      && Math.hypot(m.d[0] - prev.d[0], m.d[1] - prev.d[1], m.d[2] - prev.d[2]) <= 1e-4
      && Math.abs((m.r || 0) - (prev.r || 0)) <= 1e-4
      && (m.tid || null) === (prev.tid || null);

    const checkSideRef = (j, side) => {
      const ref = j[side];
      if (!ref) return false;
      if (fixed(j)) {
        if (j.mode === 'face') {
          const m = matchFaceRef(itemId, ref);
          if (!m) return false;
          if (!sameFace(ref, m)) refUpdates.push({ jid: j.id, side, val: makeFaceRefObj(ref, m) });
          return true;
        }
        if (j.mode === 'point') {
          if (ref.frac && bbox) {
            const nc = r6([
              bbox[0] + ref.frac[0] * (bbox[3] - bbox[0]),
              bbox[1] + ref.frac[1] * (bbox[4] - bbox[1]),
              bbox[2] + ref.frac[2] * (bbox[5] - bbox[2]),
            ]);
            if (!ref.c || Math.hypot(nc[0] - ref.c[0], nc[1] - ref.c[1], nc[2] - ref.c[2]) > 1e-4) {
              refUpdates.push({ jid: j.id, side, val: { ...ref, c: nc, tid: null } });
            }
          }
          return true;
        }
        return true;
      }
      if (isAngle(j)) {
        if (ref.kind === 'face') {
          const m = matchFaceRef(itemId, ref);
          if (!m) return false;
          if (!sameFace(ref, m)) refUpdates.push({ jid: j.id, side, val: makeFaceRefObj(ref, m) });
          return true;
        }
        if (ref.kind === 'edge') {
          const m = matchEdgeRef(itemId, ref);
          if (!m) return false;
          if (!sameEdge(ref, m)) refUpdates.push({ jid: j.id, side, val: { ...ref, c: m.c, d: m.d, tid: m.tid, idx: m.idx, frac: m.frac } });
          return true;
        }
        return true;
      }
      if (isLoose(j)) {
        if (ref.kind === 'face') {
          const m = matchFaceRef(itemId, ref);
          if (!m) return false;
          if (!sameFace(ref, m)) refUpdates.push({ jid: j.id, side, val: makeFaceRefObj(ref, m) });
          return true;
        }
        if (ref.kind === 'cyl') {
          const m = matchCylRef(itemId, ref);
          if (!m) return false;
          if (!sameCyl(ref, m)) refUpdates.push({ jid: j.id, side, val: { ...ref, o: m.o, d: m.d, r: m.r, c: m.c, tid: m.tid, idx: m.idx, frac: m.frac } });
          return true;
        }
        return true;
      }
      return true;
    };

    for (const j of touching) {
      if (isCenter(j)) {
        if (j.a === itemId) {
          const m1 = j.refA1 ? matchFaceRef(itemId, j.refA1) : null;
          const m2 = j.refA2 ? matchFaceRef(itemId, j.refA2) : null;
          if (!m1 || !m2) { dropIds.add(j.id); continue; }
          if (!sameFace(j.refA1, m1)) refUpdates.push({ jid: j.id, side: 'refA1', val: makeFaceRefObj(j.refA1, m1) });
          if (!sameFace(j.refA2, m2)) refUpdates.push({ jid: j.id, side: 'refA2', val: makeFaceRefObj(j.refA2, m2) });
        }
        if (j.b === itemId && j.bMode === 'faces') {
          const m1 = j.refB1 ? matchFaceRef(itemId, j.refB1) : null;
          const m2 = j.refB2 ? matchFaceRef(itemId, j.refB2) : null;
          if (!m1 || !m2) {
            centerDowngrades.add(j.id);
          } else {
            if (!sameFace(j.refB1, m1)) refUpdates.push({ jid: j.id, side: 'refB1', val: makeFaceRefObj(j.refB1, m1) });
            if (!sameFace(j.refB2, m2)) refUpdates.push({ jid: j.id, side: 'refB2', val: makeFaceRefObj(j.refB2, m2) });
          }
        }
        continue;
      }
      if (j.a === itemId && j.refA && !checkSideRef(j, 'refA')) { dropIds.add(j.id); continue; }
      if (j.b === itemId && j.refB && !checkSideRef(j, 'refB')) { dropIds.add(j.id); continue; }
    }

    relinking = true;
    try {
      App.change('Verbindungen angepasst', (doc) => {
        let ch = false;
        for (const u of refUpdates) {
          if (dropIds.has(u.jid)) continue;
          const j = list(doc).find((x) => x.id === u.jid);
          if (!j) continue;
          j[u.side] = u.val;
          ch = true;
        }
        for (const jid of centerDowngrades) {
          if (dropIds.has(jid)) continue;
          const j = list(doc).find((x) => x.id === jid);
          if (!j) continue;
          j.bMode = 'whole';
          delete j.refB1;
          delete j.refB2;
          ch = true;
        }
        if (dropIds.size && Array.isArray(doc.joints)) {
          const beforeLen = doc.joints.length;
          doc.joints = doc.joints.filter((x) => x && !dropIds.has(x.id));
          if (doc.joints.length !== beforeLen) ch = true;
        }
        const synced = syncAll(doc);
        if (!ch && !synced) return false;
      }, { amend: true });
    } finally {
      relinking = false;
    }

    const droppedIds = [...dropIds];
    return { total, kept: total - droppedIds.length, dropped: droppedIds.length, droppedIds };
  }

  function addFixed(aSpec, bSpec, opts = {}) {
    if (!aSpec || !bSpec) return { ok: false, msg: 'Bitte zwei verschiedene Teile wählen.' };
    const A = top(aSpec.id), B = top(bSpec.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile für die Verbindung.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon miteinander verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung gehalten.` };
    const refA = resolveRef(aSpec, App.doc), refB = resolveRef(bSpec, App.doc);
    if (!refA || !refB) return { ok: false, msg: 'Die gewählte Fläche oder der Punkt konnte nicht bestimmt werden.' };
    const mode = refA.kind === 'face' && refB.kind === 'face' ? 'face' : 'point';
    let relQ = null;
    if (mode === 'point') {
      const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
      Model.worldMatrix(App.doc, A.id).decompose(new THREE.Vector3(), qa, new THREE.Vector3());
      Model.worldMatrix(App.doc, B.id).decompose(new THREE.Vector3(), qb, new THREE.Vector3());
      relQ = r9(qa.clone().invert().multiply(qb).toArray());
    }
    let jid = null;
    const changeOpts = opts.before ? { before: opts.before } : undefined;
    App.change(opts.label || 'Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const idx = doc.joints.length + 1;
      doc.joints.push({
        id: jid,
        kind: 'fixed',
        name: opts.name || `Verbindung ${idx}`,
        a: A.id,
        b: B.id,
        mode,
        refA,
        refB,
        flip: !!opts.flip,
        rot: Number.isFinite(+opts.rot) ? round(+opts.rot, 4) : 0,
        offset: mode === 'face' && Number.isFinite(+opts.offset) ? round(+opts.offset, 4) : 0,
        ...(relQ ? { relQ } : {}),
        ao: [0, 0, 0],
        ad: [0, 0, 1],
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: 0,
        max: 0,
      });
      syncFixed(doc);
    }, changeOpts);
    if (jid) drawSelectedJoint();
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung ließ sich nicht anlegen.' };
  }

  function updateFixed(jid, patch, opts = {}) {
    const label = opts.label || ('flip' in patch ? 'Verbindung umgedreht' : 'name' in patch ? 'Verbindung umbenannt' : 'Verbindung geändert');
    const changeOpts = opts.merge ? { merge: opts.merge } : {};
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid);
      if (!j || !fixed(j)) return false;
      if ('name' in patch) j.name = String(patch.name || '').trim() || j.name;
      if ('flip' in patch) j.flip = !!patch.flip;
      if ('rot' in patch) j.rot = round(Number(patch.rot) || 0, 4);
      if ('offset' in patch) j.offset = round(Number(patch.offset) || 0, 4);
      if ('mode' in patch) j.mode = patch.mode;
      if ('refA' in patch) j.refA = patch.refA;
      if ('refB' in patch) j.refB = patch.refB;
      if ('relQ' in patch) { if (patch.relQ) j.relQ = patch.relQ; else delete j.relQ; }
      if ('a' in patch) j.a = patch.a;
      if ('b' in patch) j.b = patch.b;
      syncFixed(doc);
    }, changeOpts);
    drawSelectedJoint();
    return ok;
  }

  function flipFixed(jid) {
    const j = list().find((x) => x.id === jid);
    if (!j || !fixed(j)) return false;
    return updateFixed(jid, { flip: !j.flip }, { label: 'Verbindung umgedreht' });
  }

  function parseAngleInput(val, doc = App.doc) {
    if (typeof val === 'number') return Number.isFinite(val) ? round(val, 4) : 0;
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return 0;
      const num = parseNum(s);
      if (!isNaN(num)) return round(num, 4);
      if (Model.isExpr(s)) {
        const r = Expr.tryEval(s, Model.vars(doc).v);
        if (r && r.ok && Number.isFinite(r.value)) return s;
      }
    }
    return 0;
  }

  function addAngle(aSpec, bSpec, opts = {}) {
    if (!aSpec || !bSpec) return { ok: false, msg: 'Bitte zwei Flächen oder Kanten wählen.' };
    const A = top(aSpec.id), B = top(bSpec.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile für die Winkel-Verbindung.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon miteinander verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung gehalten.` };
    const refA = resolveOrientRef(aSpec, App.doc), refB = resolveOrientRef(bSpec, App.doc);
    if (!refA || !refB) return { ok: false, msg: 'Für „Winkel“ werden ebene Flächen oder gerade Kanten benötigt.' };

    const Wa = Model.worldMatrix(App.doc, A.id), Wb = Model.worldMatrix(App.doc, B.id);
    const uA = new THREE.Vector3(...(refA.kind === 'edge' ? refA.d : refA.n)).transformDirection(Wa).normalize();
    const uB = new THREE.Vector3(...(refB.kind === 'edge' ? refB.d : refB.n)).transformDirection(Wb).normalize();
    const alignSign = refA.kind === refB.kind && uA.dot(uB) < -1e-4 ? -1 : 1;
    let k0;
    if (Array.isArray(opts.axis) && opts.axis.length === 3) {
      k0 = new THREE.Vector3(...opts.axis);
      k0.addScaledVector(uA, -k0.dot(uA));
      if (k0.lengthSq() < 1e-9) k0 = defaultHingeAxis(uA);
      else k0.normalize();
    } else {
      const vA = uA.clone().multiplyScalar(alignSign);
      const cr = new THREE.Vector3().crossVectors(vA, uB);
      k0 = cr.lengthSq() > 1e-8 ? cr.normalize() : defaultHingeAxis(uA);
    }
    const axisA = r9(k0.clone().transformDirection(Wa.clone().invert()).normalize().toArray());
    const angleVal = opts.angle == null ? 30 : parseAngleInput(opts.angle, App.doc);

    let jid = null;
    App.change('Winkel-Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const idx = doc.joints.length + 1;
      doc.joints.push({
        id: jid,
        kind: 'angle',
        name: opts.name || `Winkel ${idx}`,
        a: A.id,
        b: B.id,
        refA,
        refB,
        axisA,
        alignSign,
        angle: angleVal,
        flip: !!opts.flip,
        ao: [0, 0, 0],
        ad: [0, 0, 1],
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: 0,
        max: 0,
      });
      syncFixed(doc);
    });
    if (jid) drawSelectedJoint();
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Winkel-Verbindung ließ sich nicht anlegen.' };
  }

  function updateAngle(jid, patch, opts = {}) {
    const label = opts.label || ('flip' in patch ? 'Winkel umgekehrt' : 'name' in patch ? 'Verbindung umbenannt' : 'Winkel geändert');
    const changeOpts = opts.merge ? { merge: opts.merge } : {};
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid);
      if (!j || !isAngle(j)) return false;
      if ('name' in patch) j.name = String(patch.name || '').trim() || j.name;
      if ('angle' in patch) j.angle = parseAngleInput(patch.angle, doc);
      if ('flip' in patch) j.flip = !!patch.flip;
      if ('refA' in patch) j.refA = patch.refA;
      if ('refB' in patch) j.refB = patch.refB;
      if ('axisA' in patch) j.axisA = patch.axisA;
      if ('alignSign' in patch) j.alignSign = patch.alignSign;
      if ('a' in patch) j.a = patch.a;
      if ('b' in patch) j.b = patch.b;
      syncFixed(doc);
    }, changeOpts);
    drawSelectedJoint();
    return ok;
  }

  function flipAngle(jid) {
    const j = list().find((x) => x.id === jid);
    if (!j || !isAngle(j)) return false;
    return updateAngle(jid, { flip: !j.flip }, { label: 'Winkel umgekehrt' });
  }

  function validateParallelFacePair(spec1, spec2, label = 'Teil') {
    const r1 = resolveRef({ ...spec1, kind: 'face' }, App.doc);
    const r2 = resolveRef({ ...spec2, kind: 'face' }, App.doc);
    if (!r1 || !r2) return { ok: false, msg: 'Bitte zwei ebene Flächen wählen.' };
    const W = Model.worldMatrix(App.doc, spec1.id);
    const n1 = new THREE.Vector3(...r1.n).transformDirection(W).normalize();
    const n2 = new THREE.Vector3(...r2.n).transformDirection(W).normalize();
    if (Math.abs(n1.dot(n2)) < 0.995) return { ok: false, msg: `Die beiden Flächen an ${label} müssen parallel sein.` };
    const c1 = new THREE.Vector3(...r1.c).applyMatrix4(W);
    const c2 = new THREE.Vector3(...r2.c).applyMatrix4(W);
    if (Math.abs(c2.sub(c1).dot(n1)) < 1e-4) return { ok: false, msg: `Die beiden Flächen an ${label} dürfen nicht in derselben Ebene liegen.` };
    return { ok: true, ref1: r1, ref2: r2 };
  }

  function addCenter(aFace1, aFace2, bSpec, bFace2OrOpts, maybeOpts) {
    if (!aFace1 || !aFace2 || !bSpec) return { ok: false, msg: 'Für „Mittig“ werden zwei parallele Flächen und ein zweites Teil benötigt.' };
    let bMode = 'body', bSpec1 = null, bSpec2 = null, bId = null, opts = {};
    if (Array.isArray(bSpec)) {
      bMode = 'faces';
      [bSpec1, bSpec2] = bSpec;
      opts = (bFace2OrOpts && typeof bFace2OrOpts === 'object') ? bFace2OrOpts : {};
    } else if (bFace2OrOpts && typeof bFace2OrOpts === 'object' && (bFace2OrOpts.id != null || bFace2OrOpts.faceIdx != null)) {
      bMode = 'faces';
      bSpec1 = bSpec;
      bSpec2 = bFace2OrOpts;
      opts = maybeOpts || {};
    } else {
      opts = (bFace2OrOpts && typeof bFace2OrOpts === 'object') ? bFace2OrOpts : {};
      bId = typeof bSpec === 'string' ? bSpec : bSpec.id;
    }
    const A = top(aFace1.id), A2 = top(aFace2.id);
    if (!A || !A2 || A.id !== A2.id) return { ok: false, msg: 'Die beiden ersten Flächen müssen zum selben festen Teil gehören.' };
    const pairA = validateParallelFacePair(aFace1, aFace2, `„${Model.label(A)}“`);
    if (!pairA.ok) return pairA;

    let refB1 = null, refB2 = null;
    if (bMode === 'faces') {
      if (!bSpec1 || !bSpec2 || !bSpec1.id || bSpec1.id !== bSpec2.id) return { ok: false, msg: 'Wähle zwei parallele Flächen am zweiten (beweglichen) Teil.' };
      bId = bSpec1.id;
      const Bchk = top(bId);
      if (!Bchk) return { ok: false, msg: 'Das zweite Teil wurde nicht gefunden.' };
      const pairB = validateParallelFacePair(bSpec1, bSpec2, `„${Model.label(Bchk)}“`);
      if (!pairB.ok) return pairB;
      refB1 = pairB.ref1; refB2 = pairB.ref2;
    }
    const B = top(bId);
    if (!B || A.id === B.id) return { ok: false, msg: 'Wähle als zu zentrierendes Teil einen anderen Körper.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon miteinander verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung gehalten.` };

    let jid = null;
    App.change('Verbindung „Mittig“ angelegt', (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const idx = doc.joints.length + 1;
      doc.joints.push({
        id: jid,
        kind: 'center',
        name: opts.name || `Mittig ${idx}`,
        a: A.id,
        b: B.id,
        bMode,
        refA1: pairA.ref1,
        refA2: pairA.ref2,
        ...(bMode === 'faces' ? { refB1, refB2 } : {}),
        ao: [0, 0, 0],
        ad: [0, 0, 1],
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: 0,
        max: 0,
      });
      syncFixed(doc);
    });
    if (jid) drawSelectedJoint();
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung „Mittig“ ließ sich nicht anlegen.' };
  }

  function updateCenter(jid, patch, opts = {}) {
    const label = opts.label || ('name' in patch ? 'Verbindung umbenannt' : 'Verbindung geändert');
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid);
      if (!j || !isCenter(j)) return false;
      if ('name' in patch) j.name = String(patch.name || '').trim() || j.name;
      if ('bMode' in patch) j.bMode = patch.bMode;
      if ('refA1' in patch) j.refA1 = patch.refA1;
      if ('refA2' in patch) j.refA2 = patch.refA2;
      if ('refB1' in patch) { if (patch.refB1) j.refB1 = patch.refB1; else delete j.refB1; }
      if ('refB2' in patch) { if (patch.refB2) j.refB2 = patch.refB2; else delete j.refB2; }
      if ('a' in patch) j.a = patch.a;
      if ('b' in patch) j.b = patch.b;
      syncFixed(doc);
    });
    drawSelectedJoint();
    return ok;
  }


  // ---------- Verbindungen & Gelenke anlegen ----------
  // Gelenk ohne Klicken anlegen (für den KI-Kollegen): Achse o/d in Weltkoordinaten; liefert die Kennung oder eine Meldung
  function add(aId, bId, o, d, opts = {}) {
    if (opts && opts.kind === 'fixed') return addFixed(opts.aSpec || { id: aId, kind: 'point', c: o, world: true }, opts.bSpec || { id: bId, kind: 'point', c: o, world: true }, opts);
    if (opts && opts.kind === 'ball') return addBall(opts.aSpec || { id: aId, p: o }, opts.bSpec || { id: bId, p: o }, opts);
    if (opts && opts.kind === 'slot') {
      const slotRef = opts.slotRef || { id: aId, o, d, len: opts.len || Math.abs((opts.maxPos ?? 10) - (opts.minPos ?? -10)) || 20, n: opts.n };
      const pinRef = opts.pinRef || { id: bId, p: o };
      return addSlot(slotRef, pinRef, opts);
    }
    const A = top(aId), B = top(bId);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Eine Verbindung braucht zwei verschiedene Teile.' };
    const k = opts.kind === 'slide' || opts.kind === 'cyl' || opts.kind === 'planar' ? opts.kind : 'rot';
    const chk = canAddKinematicJoint(App.doc, A, B, k);
    if (!chk.ok) return { ok: false, msg: chk.msg };
    const dv = new THREE.Vector3(...d); if (dv.lengthSq() < 1e-12) return { ok: false, msg: 'Die Achse braucht eine Richtung.' };
    dv.normalize();
    const lo = Number.isFinite(+opts.min) ? +opts.min : k === 'slide' ? -20 : k === 'rot' ? (chk.closing ? -360 : -90) : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : k === 'slide' ? 20 : k === 'rot' ? (chk.closing ? 360 : 90) : 180;
    let jid = null, jamMsg = null;
    App.change('Gelenk angelegt', (doc) => {
      const a = top(A.id, doc), b = top(B.id, doc);
      if (!a || !b) return false;
      const chk2 = canAddKinematicJoint(doc, a, b, k);
      if (!chk2.ok) return false;
      const snapItems = chk2.closing ? deepClone(doc.items) : null;
      const snapJoints = chk2.closing ? deepClone(doc.joints || []) : null;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id,
        ao: r6(o.map((v) => +v)),
        ad: r9(dv.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: round(Math.min(lo, hi), 2),
        max: round(Math.max(lo, hi), 2),
      };
      if (k !== 'rot') entry.kind = k;
      if (k === 'cyl') {
        const plo = Number.isFinite(+opts.minPos) ? +opts.minPos : -20;
        const phi = Number.isFinite(+opts.maxPos) ? +opts.maxPos : 20;
        Object.assign(entry, { pos: 0, minPos: round(Math.min(plo, phi), 2), maxPos: round(Math.max(plo, phi), 2), flip: !!opts.flip });
      } else if (k === 'planar') {
        const basis = planeBasis(dv);
        Object.assign(entry, {
          au: r9(basis.u.toArray()),
          u: 0, minU: -20, maxU: 20,
          v: 0, minV: -20, maxV: 20,
          flip: !!opts.flip,
        });
      }
      captureLocalFrames(doc, entry);
      doc.joints.push(entry);
      if (chk2.closing) {
        const core = cyclicCore(doc, jid, true);
        if (core) {
          widenClosedLoopDefaults(core);
          ensureLocalFrames(doc, core.joints);
          const gap = jointGapError(doc, entry);
          if (!gap.ok) {
            const sol = solveClosedPoses(doc, core, null, null, null, null);
            if (!sol.ok) {
              doc.items = snapItems;
              doc.joints = snapJoints;
              jamMsg = JAM_MSG;
              jid = null;
              return false;
            }
            applyClosedPoses(doc, core, sol.poses);
          }
        }
      }
    });
    if (jamMsg) return { ok: false, msg: jamMsg };
    if (jid) {
      const patch = {};
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (opts.u != null && Number.isFinite(+opts.u)) patch.u = +opts.u;
      if (opts.v != null && Number.isFinite(+opts.v)) patch.v = +opts.v;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung ließ sich nicht anlegen.' };
  }

  function addCylindrical(aRef, bRef, opts = {}) {
    const axA = cylAxisOf(aRef), axB = cylAxisOf(bRef);
    if (!axA || !axB) return { ok: false, msg: 'Für „Zylindrisch“ werden zwei runde Flächen oder Kreiskanten benötigt.' };
    const A = top(axA.id), B = top(axB.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const chk = canAddKinematicJoint(App.doc, A, B, 'cyl');
    if (!chk.ok) return { ok: false, msg: chk.msg };

    const baseD = axA.d.dot(axB.d) >= 0 ? axA.d.clone() : axA.d.clone().negate();
    const dTarget = opts.flip ? baseD.clone().negate() : baseD;
    const Q = rotBetween(axB.d, dTarget);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
    const M_align = new THREE.Matrix4()
      .makeTranslation(axA.o.x, axA.o.y, axA.o.z)
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-axB.o.x, -axB.o.y, -axB.o.z));

    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    const plo = Number.isFinite(+opts.minPos) ? +opts.minPos : -20;
    const phi = Number.isFinite(+opts.maxPos) ? +opts.maxPos : 20;
    let jid = null, conflictMsg = null;
    App.change('Zylindrische Verbindung angelegt', (doc) => {
      const a = top(A.id, doc), b = top(B.id, doc);
      if (!a || !b) return false;
      const chk2 = canAddKinematicJoint(doc, a, b, 'cyl');
      if (!chk2.ok) return false;
      const snapItems = (chk2.closing || looseOf(B.id, doc).length) ? deepClone(doc.items) : null;
      const snapJoints = snapItems ? deepClone(doc.joints || []) : null;
      if (!chk2.closing) {
        const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
        Model.setFromMatrix(b, newLocal);
        moveChain(doc, B.id, M_align);
      }
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id, kind: 'cyl',
        ao: r6(axA.o.toArray()),
        ad: r9(axA.d.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        pos: 0, minPos: round(Math.min(plo, phi), 2), maxPos: round(Math.max(plo, phi), 2),
        flip: !!opts.flip,
      };
      if (chk2.closing) {
        const dB = axB.d.dot(axA.d) >= 0 ? axB.d.clone() : axB.d.clone().negate();
        const dBUse = opts.flip ? dB.clone().negate() : dB;
        const uA = planeBasis(axA.d).u;
        const uB = uA.clone().applyQuaternion(rotBetween(axA.d, dBUse));
        captureLocalFrames(doc, entry, { oA: axA.o, dA: axA.d, uA, oB: axB.o, dB: dBUse, uB });
      } else {
        captureLocalFrames(doc, entry);
      }
      doc.joints.push(entry);
      if (chk2.closing) {
        const core = cyclicCore(doc, jid, true);
        if (core) {
          widenClosedLoopDefaults(core);
          ensureLocalFrames(doc, core.joints);
          const sol = solveClosedPoses(doc, core, null, null, null, null);
          if (!sol.ok) {
            doc.items = snapItems;
            doc.joints = snapJoints;
            conflictMsg = JAM_MSG;
            jid = null;
            return false;
          }
          applyClosedPoses(doc, core, sol.poses);
        }
      }
      if (looseOf(B.id, doc).length) {
        const sol = solvePartConstraints(doc, B.id, Model.vars(doc).v);
        if (sol.err > 0.05) {
          doc.items = snapItems;
          doc.joints = snapJoints;
          conflictMsg = `Die zylindrische Verbindung widerspricht einer bestehenden Verbindung an „${Model.label(B)}“.`;
          jid = null;
          return false;
        }
      }
    });
    if (conflictMsg) return { ok: false, msg: conflictMsg };
    if (jid) {
      const patch = {};
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die zylindrische Verbindung ließ sich nicht anlegen.' };
  }

  function addPlanar(aRef, bRef, opts = {}) {
    const plA = planarFaceOf(aRef), plB = planarFaceOf(bRef);
    if (!plA || !plB) return { ok: false, msg: 'Für „Eben“ werden zwei ebene Flächen benötigt.' };
    const A = top(plA.id), B = top(plB.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const chk = canAddKinematicJoint(App.doc, A, B, 'planar');
    if (!chk.ok) return { ok: false, msg: chk.msg };

    // Standard: Flächen zeigen aufeinander zu (Normalen entgegengesetzt), damit die Teile bündig aufeinander liegen
    const nTarget = opts.flip ? plA.n.clone() : plA.n.clone().negate();
    const pBOnA = plB.p.clone().addScaledVector(plA.n, -plB.p.clone().sub(plA.p).dot(plA.n));
    const Q = rotBetween(plB.n, nTarget);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
    const M_align = new THREE.Matrix4()
      .makeTranslation(pBOnA.x, pBOnA.y, pBOnA.z)
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-plB.p.x, -plB.p.y, -plB.p.z));
    const basis = planeBasis(plA.n);

    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    const ulo = Number.isFinite(+opts.minU) ? +opts.minU : -20;
    const uhi = Number.isFinite(+opts.maxU) ? +opts.maxU : 20;
    const vlo = Number.isFinite(+opts.minV) ? +opts.minV : -20;
    const vhi = Number.isFinite(+opts.maxV) ? +opts.maxV : 20;
    let jid = null, conflictMsg = null;
    App.change('Ebene Verbindung angelegt', (doc) => {
      const a = top(A.id, doc), b = top(B.id, doc);
      if (!a || !b) return false;
      const chk2 = canAddKinematicJoint(doc, a, b, 'planar');
      if (!chk2.ok) return false;
      const snapItems = (chk2.closing || looseOf(B.id, doc).length) ? deepClone(doc.items) : null;
      const snapJoints = snapItems ? deepClone(doc.joints || []) : null;
      if (!chk2.closing) {
        const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
        Model.setFromMatrix(b, newLocal);
        moveChain(doc, B.id, M_align);
      }
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id, kind: 'planar',
        ao: r6(pBOnA.toArray()),
        ad: r9(plA.n.toArray()),
        au: r9(basis.u.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        u: 0, minU: round(Math.min(ulo, uhi), 2), maxU: round(Math.max(ulo, uhi), 2),
        v: 0, minV: round(Math.min(vlo, vhi), 2), maxV: round(Math.max(vlo, vhi), 2),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        flip: !!opts.flip,
      };
      if (chk2.closing) {
        const nBAlign = opts.flip ? plB.n.clone() : plB.n.clone().negate();
        const uB = basis.u.clone().applyQuaternion(rotBetween(plA.n, nBAlign));
        captureLocalFrames(doc, entry, { oA: pBOnA, dA: plA.n, uA: basis.u, oB: plB.p, dB: nBAlign, uB });
      } else {
        captureLocalFrames(doc, entry);
      }
      doc.joints.push(entry);
      if (chk2.closing) {
        const core = cyclicCore(doc, jid, true);
        if (core) {
          widenClosedLoopDefaults(core);
          ensureLocalFrames(doc, core.joints);
          const sol = solveClosedPoses(doc, core, null, null, null, null);
          if (!sol.ok) {
            doc.items = snapItems;
            doc.joints = snapJoints;
            conflictMsg = JAM_MSG;
            jid = null;
            return false;
          }
          applyClosedPoses(doc, core, sol.poses);
        }
      }
      if (looseOf(B.id, doc).length) {
        const sol = solvePartConstraints(doc, B.id, Model.vars(doc).v);
        if (sol.err > 0.05) {
          doc.items = snapItems;
          doc.joints = snapJoints;
          conflictMsg = `Die ebene Verbindung widerspricht einer bestehenden Verbindung an „${Model.label(B)}“.`;
          jid = null;
          return false;
        }
      }
    });
    if (conflictMsg) return { ok: false, msg: conflictMsg };
    if (jid) {
      const patch = {};
      if (opts.u != null && Number.isFinite(+opts.u)) patch.u = +opts.u;
      if (opts.v != null && Number.isFinite(+opts.v)) patch.v = +opts.v;
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die ebene Verbindung ließ sich nicht anlegen.' };
  }

  // ---------- Lockere Verbindungen: Parallel, Tangential, Abstand (BG-07) ----------
  function validateLoosePair(doc, aId, bId) {
    const A = top(aId, doc), B = top(bId, doc);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const why = refuse(doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (isFixedPart(B.id, doc)) return { ok: false, msg: `„${Model.label(B)}“ ist fest verbunden und kann keine weitere Verbindung aufnehmen.` };
    if (wouldCycleDirected(doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon in Gegenrichtung verbunden – das ergäbe einen Kreis.` };
    return { ok: true, A, B };
  }

  function addLooseEntry(label, A, B, entry) {
    let jid = null, conflictMsg = null;
    App.change(label, (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
      if (wouldCycleDirected(doc, A.id, B.id) || isFixedPart(B.id, doc)) return false;
      const snapItems = deepClone(doc.items), snapJoints = deepClone(doc.joints || []);
      doc.joints = doc.joints || [];
      jid = uid('j');
      const idx = doc.joints.length + 1;
      const full = {
        id: jid,
        name: entry.name || `Verbindung ${idx}`,
        a: A.id,
        b: B.id,
        ao: [0, 0, 0],
        ad: [0, 0, 1],
        ...entry,
      };
      doc.joints.push(full);
      const sol = solvePartConstraints(doc, B.id, Model.vars(doc).v);
      if (sol.err > 0.05) {
        doc.items = snapItems;
        doc.joints = snapJoints;
        conflictMsg = `Diese Verbindung widerspricht einer bestehenden Verbindung an „${Model.label(B)}“.`;
        jid = null;
        return false;
      }
      syncAll(doc);
    });
    if (conflictMsg) return { ok: false, msg: conflictMsg };
    if (jid) drawSelectedJoint();
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung ließ sich nicht anlegen.' };
  }

  function addParallel(aRef, bRef, opts = {}) {
    const refA = resolvePlaneRef(aRef), refB = resolvePlaneRef(bRef);
    if (!refA || !refB) return { ok: false, msg: 'Für „Parallel“ werden zwei ebene Flächen benötigt.' };
    const chk = validateLoosePair(App.doc, aRef.id, bRef.id);
    if (!chk.ok) return chk;
    const Wa = Model.worldMatrix(App.doc, chk.A.id), Wb = Model.worldMatrix(App.doc, chk.B.id);
    const nAw = new THREE.Vector3(...refA.n).transformDirection(Wa).normalize();
    const nBw = new THREE.Vector3(...refB.n).transformDirection(Wb).normalize();
    const flip = opts.flip != null ? !!opts.flip : (nAw.dot(nBw) >= 0);
    return addLooseEntry('Parallele Verbindung angelegt', chk.A, chk.B, {
      kind: 'parallel',
      name: opts.name,
      refA,
      refB,
      flip,
    });
  }

  function addTangent(aRef, bRef, opts = {}) {
    if (!aRef || !bRef) return { ok: false, msg: 'Für „Tangential“ werden eine ebene Fläche und eine runde Zylinderfläche benötigt.' };
    let refA = resolvePlaneRef(aRef), refB = resolveCylRef(bRef);
    if (!refA || !refB) {
      refA = resolveCylRef(aRef);
      refB = resolvePlaneRef(bRef);
    }
    if (!refA || !refB) return { ok: false, msg: 'Für „Tangential“ werden eine ebene Fläche und eine runde Zylinderfläche benötigt.' };
    const chk = validateLoosePair(App.doc, aRef.id, bRef.id);
    if (!chk.ok) return chk;
    return addLooseEntry('Tangentiale Verbindung angelegt', chk.A, chk.B, {
      kind: 'tangent',
      name: opts.name,
      refA,
      refB,
      flip: !!opts.flip,
    });
  }

  function addDistance(aRef, bRef, distOrOpts = 5, opts = {}) {
    let distRaw = distOrOpts;
    if (distOrOpts && typeof distOrOpts === 'object') {
      opts = distOrOpts;
      distRaw = opts.dist;
    }
    if (distRaw === undefined || distRaw === null || distRaw === '') distRaw = 5;
    const parsed = parseDistVal(distRaw, Model.vars(App.doc).v);
    if (!parsed.ok) return { ok: false, msg: parsed.msg };
    const refA = resolvePlaneRef(aRef), refB = resolvePlaneRef(bRef);
    if (!refA || !refB) return { ok: false, msg: 'Für „Abstand“ werden zwei ebene Flächen benötigt.' };
    const chk = validateLoosePair(App.doc, aRef.id, bRef.id);
    if (!chk.ok) return chk;
    const Wa = Model.worldMatrix(App.doc, chk.A.id), Wb = Model.worldMatrix(App.doc, chk.B.id);
    const nAw = new THREE.Vector3(...refA.n).transformDirection(Wa).normalize();
    const nBw = new THREE.Vector3(...refB.n).transformDirection(Wb).normalize();
    const flip = opts.flip != null ? !!opts.flip : (nAw.dot(nBw) > 0.5);
    return addLooseEntry('Abstands-Verbindung angelegt', chk.A, chk.B, {
      kind: 'distance',
      name: opts.name,
      refA,
      refB,
      dist: parsed.value,
      flip,
    });
  }

  function updateLoose(jid, patch, opts = {}) {
    const cur = list().find((x) => x.id === jid);
    if (!cur || !isLoose(cur)) return false;
    let parsedDist = null;
    if ('dist' in patch) {
      parsedDist = parseDistVal(patch.dist, Model.vars(App.doc).v);
      if (!parsedDist.ok) { UI.toast(parsedDist.msg, { kind: 'bad' }); return false; }
    }
    const label = opts.label || ('flip' in patch ? 'Verbindung umgekehrt' : 'dist' in patch ? 'Abstand geändert' : 'name' in patch ? 'Verbindung umbenannt' : 'Verbindung geändert');
    const changeOpts = opts.merge ? { merge: opts.merge } : {};
    let conflictMsg = null;
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid);
      if (!j || !isLoose(j)) return false;
      const snapItems = ('flip' in patch || parsedDist) ? deepClone(doc.items) : null;
      const snapJoints = snapItems ? deepClone(doc.joints) : null;
      if ('name' in patch) j.name = String(patch.name || '').trim() || j.name;
      if ('flip' in patch) j.flip = !!patch.flip;
      if (parsedDist) j.dist = parsedDist.value;
      const sol = solvePartConstraints(doc, j.b, Model.vars(doc).v);
      if (sol.err > 0.05) {
        if (snapItems) { doc.items = snapItems; doc.joints = snapJoints; }
        const b = top(j.b, doc);
        conflictMsg = `Diese Änderung widerspricht einer bestehenden Verbindung an „${b ? Model.label(b) : 'Teil'}“.`;
        return false;
      }
      syncAll(doc);
    }, changeOpts);
    if (conflictMsg) { UI.toast(conflictMsg, { kind: 'bad' }); return false; }
    drawSelectedJoint();
    return ok;
  }

  function setDistance(jid, dist) {
    return updateLoose(jid, { dist }, { label: 'Abstand geändert', merge: 'jdist:' + jid });
  }

  function flipLoose(jid) {
    const j = list().find((x) => x.id === jid);
    if (!j || !isLoose(j)) return false;
    return updateLoose(jid, { flip: !j.flip }, { label: 'Verbindung umgekehrt' });
  }

  function addBall(aRef, bRef, opts = {}) {
    const ptA = ballPointOf(aRef), ptB = ballPointOf(bRef);
    if (!ptA || !ptB) return { ok: false, msg: 'Für „Kugel“ werden zwei Punkte oder Kugel-/Zylinderflächen an verschiedenen Teilen benötigt.' };
    const A = top(ptA.id), B = top(ptB.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const chk = canAddKinematicJoint(App.doc, A, B, 'ball');
    if (!chk.ok) return { ok: false, msg: chk.msg };

    const dp = ptA.p.clone().sub(ptB.p);
    const M_align = new THREE.Matrix4().makeTranslation(dp.x, dp.y, dp.z);
    const rxLo = Number.isFinite(+opts.minRx) ? +opts.minRx : -180;
    const rxHi = Number.isFinite(+opts.maxRx) ? +opts.maxRx : 180;
    const ryLo = Number.isFinite(+opts.minRy) ? +opts.minRy : -180;
    const ryHi = Number.isFinite(+opts.maxRy) ? +opts.maxRy : 180;
    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    let jid = null, jamMsg = null;
    App.change('Kugel-Verbindung angelegt', (doc) => {
      const a = top(A.id, doc), b = top(B.id, doc);
      if (!a || !b) return false;
      const chk2 = canAddKinematicJoint(doc, a, b, 'ball');
      if (!chk2.ok) return false;
      const snapItems = chk2.closing ? deepClone(doc.items) : null;
      const snapJoints = chk2.closing ? deepClone(doc.joints || []) : null;
      if (!chk2.closing) {
        const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
        Model.setFromMatrix(b, newLocal);
        moveChain(doc, B.id, M_align);
      }
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id, kind: 'ball',
        ao: r6(ptA.p.toArray()),
        ad: [0, 0, 1],
        au: [1, 0, 0],
        home: r9(Model.localMatrix(b).toArray()),
        rx: 0, minRx: round(Math.min(rxLo, rxHi), 2), maxRx: round(Math.max(rxLo, rxHi), 2),
        ry: 0, minRy: round(Math.min(ryLo, ryHi), 2), maxRy: round(Math.max(ryLo, ryHi), 2),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        ...(opts.stopsLocked ? { stopsLocked: true } : {}),
      };
      if (chk2.closing) {
        captureLocalFrames(doc, entry, {
          oA: ptA.p, dA: new THREE.Vector3(0, 0, 1), uA: new THREE.Vector3(1, 0, 0),
          oB: ptB.p, dB: new THREE.Vector3(0, 0, 1), uB: new THREE.Vector3(1, 0, 0),
        });
      } else {
        captureLocalFrames(doc, entry);
      }
      doc.joints.push(entry);
      if (chk2.closing) {
        const core = cyclicCore(doc, jid, true);
        if (core) {
          widenClosedLoopDefaults(core);
          ensureLocalFrames(doc, core.joints);
          const sol = solveClosedPoses(doc, core, null, null, null, null);
          if (!sol.ok) {
            doc.items = snapItems;
            doc.joints = snapJoints;
            jamMsg = JAM_MSG;
            jid = null;
            return false;
          }
          applyClosedPoses(doc, core, sol.poses);
        }
      }
    });
    if (jamMsg) return { ok: false, msg: jamMsg };
    if (jid) {
      const patch = {};
      if (opts.rx != null && Number.isFinite(+opts.rx)) patch.rx = +opts.rx;
      if (opts.ry != null && Number.isFinite(+opts.ry)) patch.ry = +opts.ry;
      const rz = opts.ang != null ? opts.ang : opts.rz;
      if (rz != null && Number.isFinite(+rz)) patch.ang = +rz;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Kugel-Verbindung ließ sich nicht anlegen.' };
  }

  function addSlot(slotRef, pinRef, opts = {}) {
    const sl = slotCenterlineOf(slotRef), pin = slotPinOf(pinRef);
    if (!sl) return { ok: false, msg: 'Für „Stift im Langloch“ wird am ersten Teil ein Langloch (Fläche/Rand) oder eine gerade Kante benötigt.' };
    if (!pin) return { ok: false, msg: 'Für „Stift im Langloch“ wird am zweiten Teil ein Stift (Zylinder, Kreisrand oder Punkt) benötigt.' };
    const A = top(sl.id), B = top(pin.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const chk = canAddKinematicJoint(App.doc, A, B, 'slot');
    if (!chk.ok) return { ok: false, msg: chk.msg };

    let M_align;
    if (pin.axis && opts.alignAxis !== false) {
      const baseN = sl.n.dot(pin.axis) >= 0 ? sl.n.clone() : sl.n.clone().negate();
      const dTarget = opts.flip ? baseN.clone().negate() : baseN;
      const Q = rotBetween(pin.axis, dTarget);
      const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
      M_align = new THREE.Matrix4()
        .makeTranslation(sl.o.x, sl.o.y, sl.o.z)
        .multiply(R)
        .multiply(new THREE.Matrix4().makeTranslation(-pin.p.x, -pin.p.y, -pin.p.z));
    } else {
      const dp = sl.o.clone().sub(pin.p);
      M_align = new THREE.Matrix4().makeTranslation(dp.x, dp.y, dp.z);
    }

    const half = sl.len / 2;
    const minPos = Number.isFinite(+opts.minPos) ? +opts.minPos : round(-half, 4);
    const maxPos = Number.isFinite(+opts.maxPos) ? +opts.maxPos : round(half, 4);
    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    let jid = null, jamMsg = null;
    App.change('Stift-im-Langloch-Verbindung angelegt', (doc) => {
      const a = top(A.id, doc), b = top(B.id, doc);
      if (!a || !b) return false;
      const chk2 = canAddKinematicJoint(doc, a, b, 'slot');
      if (!chk2.ok) return false;
      const snapItems = chk2.closing ? deepClone(doc.items) : null;
      const snapJoints = chk2.closing ? deepClone(doc.joints || []) : null;
      if (!chk2.closing) {
        const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
        Model.setFromMatrix(b, newLocal);
        moveChain(doc, B.id, M_align);
      }
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id, kind: 'slot',
        ao: r6(sl.o.toArray()),
        ad: r9(sl.d.toArray()),
        au: r9(sl.n.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        pos: 0, minPos: round(Math.min(minPos, maxPos), 4), maxPos: round(Math.max(minPos, maxPos), 4),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        flip: !!opts.flip,
        stopsLocked: true,
      };
      if (chk2.closing) {
        let uB = sl.n.clone();
        if (pin.axis && opts.alignAxis !== false) {
          const baseN = sl.n.dot(pin.axis) >= 0 ? pin.axis.clone() : pin.axis.clone().negate();
          uB = opts.flip ? baseN.clone().negate() : baseN;
        }
        const dB = sl.d.clone().applyQuaternion(rotBetween(sl.n, uB));
        captureLocalFrames(doc, entry, { oA: sl.o, dA: sl.d, uA: sl.n, oB: pin.p, dB, uB });
      } else {
        captureLocalFrames(doc, entry);
      }
      doc.joints.push(entry);
      if (chk2.closing) {
        const core = cyclicCore(doc, jid, true);
        if (core) {
          widenClosedLoopDefaults(core);
          ensureLocalFrames(doc, core.joints);
          const sol = solveClosedPoses(doc, core, null, null, null, null);
          if (!sol.ok) {
            doc.items = snapItems;
            doc.joints = snapJoints;
            jamMsg = JAM_MSG;
            jid = null;
            return false;
          }
          applyClosedPoses(doc, core, sol.poses);
        }
      }
    });
    if (jamMsg) return { ok: false, msg: jamMsg };
    if (jid) {
      const patch = {};
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Stift-im-Langloch-Verbindung ließ sich nicht anlegen.' };
  }

  function canConnect(aId, bId, doc = App.doc, kind = null) {
    const A = top(aId, doc), B = top(bId, doc);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Bitte zwei verschiedene Teile wählen.' };
    const why = refuse(doc, A, B); if (why) return { ok: false, msg: why };
    if (kind && kind !== 'fixed') return canAddKinematicJoint(doc, A, B, kind);
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon miteinander verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list(doc).some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt.` };
    return { ok: true, A, B };
  }

  function dockOptions(dock) {
    if (!dock || !dock.target || !dock.source) return [];
    const t = dock.target, s = dock.source;
    const opts = [
      { kind: 'fixed', label: 'Fest', icon: 'lock', desc: 'Starr an diesem Punkt', primary: true },
    ];
    if (t.kind === 'hole' && s.kind === 'hole') {
      opts.push(
        { kind: 'cyl', label: 'Zylindrisch', icon: 'hinge', desc: 'Drehen und schieben' },
        { kind: 'rot', label: 'Drehen', icon: 'rotate', desc: 'Dreht um die Achse' }
      );
    } else if (t.kind === 'face' && s.kind === 'face') {
      opts.push({ kind: 'planar', label: 'Eben', icon: 'plane', desc: 'Gleitet auf der Fläche' });
    } else {
      opts.push({ kind: 'ball', label: 'Kugel', icon: 'sphere', desc: 'Dreht frei um den Punkt' });
    }
    opts.push({ kind: 'none', label: 'Nur einrasten', icon: 'close', desc: 'Ohne Verbindung' });
    return opts;
  }

  function applyDockJoint(dock, kind, opts = {}) {
    if (!dock || !dock.target || !dock.source) return { ok: false, msg: 'Kein Andock-Punkt gewählt.' };
    if (kind === 'none') return { ok: true, id: null, kind: 'none' };
    const { target, source } = dock;
    const chk = canConnect(target.id, source.id, App.doc, kind);
    if (!chk.ok) return { ok: false, msg: chk.msg };
    const Wb = Model.worldMatrix(App.doc, source.id);
    const sP = new THREE.Vector3(...source.localP).applyMatrix4(Wb);
    const sN = new THREE.Vector3(...source.localN).transformDirection(Wb).normalize();
    if (kind === 'fixed') {
      const aSpec = {
        id: target.id,
        kind: 'face',
        c: target.localP,
        n: target.localN,
        x: dock.xAl,
        ...(target.kind === 'face' && target.faceIdx != null ? { faceIdx: target.faceIdx } : { dock: true }),
      };
      const bSpec = {
        id: source.id,
        kind: 'face',
        c: source.localP,
        n: source.localN,
        x: dock.xBl,
        ...(source.kind === 'face' && !source.primary && source.faceIdx != null ? { faceIdx: source.faceIdx } : { dock: true }),
      };
      return addFixed(aSpec, bSpec, opts);
    }
    if (kind === 'cyl') {
      return addCylindrical(
        { id: target.id, o: target.p.toArray(), d: target.n.toArray(), what: target.name },
        { id: source.id, o: sP.toArray(), d: sN.toArray(), what: source.name },
        opts
      );
    }
    if (kind === 'rot') {
      return add(target.id, source.id, target.p.toArray(), target.n.toArray(), { kind: 'rot', min: -180, max: 180, ...opts });
    }
    if (kind === 'planar') {
      return addPlanar(
        { id: target.id, p: target.p.toArray(), n: target.n.toArray(), what: target.name },
        { id: source.id, p: sP.toArray(), n: sN.toArray(), what: source.name },
        opts
      );
    }
    if (kind === 'ball') {
      return addBall(
        { id: target.id, p: target.p.toArray(), what: target.name },
        { id: source.id, p: sP.toArray(), what: source.name },
        opts
      );
    }
    return { ok: false, msg: 'Unbekannte Verbindungsart.' };
  }

  let dockPop = null;
  function closeDockPrompt() {
    if (!dockPop) return;
    document.removeEventListener('pointerdown', dockPop.outside, true);
    window.removeEventListener('keydown', dockPop.key, true);
    dockPop.el.remove();
    dockPop = null;
  }
  function onDockDrop(dock, screenPt, opts = {}) {
    closeDockPrompt();
    if (!dock || !dock.target || !dock.source) return { snapped: false, connected: false };
    const chk = canConnect(dock.target.id, dock.source.id);
    if (!chk.ok) {
      UI.toast(`Eingerastet (${dock.target.name}) – Verbindung nicht möglich: ${chk.msg}`, { icon: 'info', ms: 3400 });
      return { snapped: true, connected: false };
    }
    const { A, B } = chk;
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) {
      const res = applyDockJoint(dock, 'fixed', { before: opts.before, label: 'Eingerastet & verbunden' });
      if (res && res.ok) {
        UI.toast(`Eingerastet & fest verbunden: „${Model.label(B)}“ an „${Model.label(A)}“ (${dock.target.name}).`, { icon: 'check', ms: 3400 });
        return { snapped: true, connected: true, kind: 'fixed', id: res.id };
      }
      if (res && res.msg) UI.toast(res.msg, { icon: 'info' });
      return { snapped: true, connected: false };
    }

    const choices = dockOptions(dock);
    const el = h('div', { class: 'dock-pop', id: 'dock-joint-pop', role: 'dialog', 'aria-label': 'Verbindung wählen', 'data-help': 'dockSnap' });
    el.append(
      h('div', { class: 'dock-pop-head' }, 'Verbindung anlegen?'),
      h('div', { class: 'dock-pop-sub' }, `${dock.target.name}: ${Model.label(B)} → ${Model.label(A)}`)
    );
    const listEl = h('div', { class: 'dock-pop-list' });
    const pick = (opt) => {
      closeDockPrompt();
      if (opt.kind === 'none') {
        UI.toast(`Nur eingerastet (${dock.target.name}, ohne Verbindung).`, { icon: 'check', ms: 2400 });
        return;
      }
      const res = applyDockJoint(dock, opt.kind);
      if (res && res.ok) {
        UI.toast(`${opt.label} verbunden: „${Model.label(B)}“ an „${Model.label(A)}“.`, { icon: 'check', ms: 3200 });
      } else if (res && res.msg) {
        UI.toast(res.msg, { kind: 'bad' });
      }
    };
    for (const opt of choices) {
      const btn = h('button', {
        type: 'button',
        id: 'dock-opt-' + opt.kind,
        class: 'dock-opt' + (opt.primary ? ' primary' : ''),
        dataset: { kind: opt.kind },
      });
      btn.innerHTML = icon(opt.icon);
      btn.append(h('span', null, h('b', null, opt.label), h('small', null, opt.desc)));
      btn.onclick = () => pick(opt);
      listEl.append(btn);
    }
    el.append(listEl);
    document.body.append(el);
    const r = el.getBoundingClientRect();
    const sx = screenPt && Number.isFinite(screenPt.x) ? screenPt.x : innerWidth / 2;
    const sy = screenPt && Number.isFinite(screenPt.y) ? screenPt.y : innerHeight / 2;
    el.style.left = clamp(sx + 16, 8, innerWidth - r.width - 8) + 'px';
    el.style.top = clamp(sy - 16, 8, innerHeight - r.height - 8) + 'px';

    const outside = (ev) => { if (dockPop && !dockPop.el.contains(ev.target)) closeDockPrompt(); };
    const key = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeDockPrompt(); }
      else if (ev.key === 'Enter') {
        ev.preventDefault(); ev.stopPropagation();
        const def = choices.find((x) => x.kind === 'fixed') || choices[0];
        if (def) pick(def);
      }
    };
    dockPop = { el, outside, key };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    window.addEventListener('keydown', key, true);
    return { snapped: true, connected: false, prompt: true };
  }

  // ---------- Interaktives Wählen im Bild ----------
  let pickState = null, pickBar = null, pickObjs = [];
  let selJoint = null, visObjs = [];
  let dragVisJid = null, dragVisObjs = [];

  function clearPickVis() {
    for (const o of pickObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    pickObjs = [];
    Viewer.highlightFace('hover', null, null);
    Viewer.requestRender();
  }
  function clearSelVis() {
    for (const o of visObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    visObjs = [];
    Viewer.requestRender();
  }
  function clearDragVis() {
    for (const o of dragVisObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    dragVisObjs = [];
    dragVisJid = null;
    Viewer.requestRender();
  }
  function drawJointVis(j, targetArr) {
    if (!j || !Array.isArray(j.ao)) return;
    const p = new THREE.Vector3(...j.ao);
    if (isSlot(j)) {
      const fr = frameOf(j);
      const a = p.clone().addScaledVector(fr.d, fr.minPos), b = p.clone().addScaledVector(fr.d, fr.maxPos);
      const cur = p.clone().addScaledVector(fr.d, Number(j.pos) || 0);
      const line = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], '#f08c00', 3, { depthTest: false });
      const d1 = Viewer.makeFat([a.x, a.y, a.z, a.x, a.y, a.z + 0.001], '#f08c00', 8, { depthTest: false });
      const d2 = Viewer.makeFat([b.x, b.y, b.z, b.x, b.y, b.z + 0.001], '#f08c00', 8, { depthTest: false });
      const dc = Viewer.makeFat([cur.x, cur.y, cur.z, cur.x, cur.y, cur.z + 0.001], '#0c7a70', 11, { depthTest: false });
      Viewer.groups.overlay.add(line, d1, d2, dc); targetArr.push(line, d1, d2, dc);
      return;
    }
    const pt = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], '#f08c00', 11, { depthTest: false });
    Viewer.groups.overlay.add(pt); targetArr.push(pt);
    if (isBall(j)) {
      const pf = planeFrame(j);
      for (const [ax, col] of [[pf.u, '#e03131'], [pf.v, '#2f9e44'], [pf.n, '#1971c2']]) {
        const q = p.clone().addScaledVector(ax, 7);
        const ln = Viewer.makeFat([p.x, p.y, p.z, q.x, q.y, q.z], col, 2.5, { depthTest: false });
        Viewer.groups.overlay.add(ln); targetArr.push(ln);
      }
      return;
    }
    if (isDistance(j) && Array.isArray(j.bo)) {
      const q = new THREE.Vector3(...j.bo);
      const ptB = Viewer.makeFat([q.x, q.y, q.z, q.x, q.y, q.z + 0.001], '#f08c00', 11, { depthTest: false });
      const dl = Viewer.makeFat([p.x, p.y, p.z, q.x, q.y, q.z], '#f08c00', 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 });
      Viewer.groups.overlay.add(ptB, dl); targetArr.push(ptB, dl);
    } else if (Array.isArray(j.ad)) {
      const d = new THREE.Vector3(...j.ad).normalize();
      const b = p.clone().addScaledVector(d, 10);
      const ln = Viewer.makeFat([p.x, p.y, p.z, b.x, b.y, b.z], '#f08c00', 3, { depthTest: false });
      Viewer.groups.overlay.add(ln); targetArr.push(ln);
    }
  }
  function drawCouplingVis(c, targetArr) {
    if (!c) return;
    const j1 = list().find((x) => x.id === c.j1);
    const j2 = list().find((x) => x.id === c.j2);
    if (j1) drawJointVis(j1, targetArr);
    if (j2 && j2.id !== (j1 && j1.id)) {
      drawJointVis(j2, targetArr);
      if (j1 && Array.isArray(j1.ao) && Array.isArray(j2.ao)) {
        const p1 = new THREE.Vector3(...j1.ao), p2 = new THREE.Vector3(...j2.ao);
        if (p1.distanceTo(p2) > 1e-4) {
          const dl = Viewer.makeFat([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], '#0c7a70', 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 });
          Viewer.groups.overlay.add(dl); targetArr.push(dl);
        }
      }
    }
    if (c.kind === 'cam' && j1 && j2) {
      const prof = camProfile(App.doc, c);
      if (prof && prof.valid) {
        const { o, x, y } = prof.basis;
        const curAng = Number(stateOf(j1)[c.dof1 || 'ang']) || 0;
        const curRad = (curAng * Math.PI) / 180;
        const loopPts = [];
        for (let i = 0; i <= 360; i += 5) {
          const k = i % 360;
          const r = prof.samples[k];
          const a = curRad - (k * Math.PI) / 180;
          const pt = o.clone().addScaledVector(x, r * Math.cos(a)).addScaledVector(y, r * Math.sin(a));
          loopPts.push(pt.x, pt.y, pt.z);
        }
        const contour = Viewer.makeFat(loopPts, '#0c7a70', 2.5, { depthTest: false });
        const rCur = camRadiusAt(prof.samples, curAng);
        const cp = o.clone().addScaledVector(x, rCur);
        const cDot = Viewer.makeFat([cp.x, cp.y, cp.z, cp.x, cp.y, cp.z + 0.001], '#e03131', 11, { depthTest: false });
        Viewer.groups.overlay.add(contour, cDot);
        targetArr.push(contour, cDot);
      }
    }
  }
  function drawSelectedJoint() {
    clearSelVis();
    if (!selJoint || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    const j = list().find((x) => x.id === selJoint);
    if (j) {
      if (!Array.isArray(j.ao)) return;
      drawJointVis(j, visObjs);
      Viewer.requestRender();
      return;
    }
    const c = couplingList().find((x) => x.id === selJoint);
    if (c) {
      drawCouplingVis(c, visObjs);
      Viewer.requestRender();
    }
  }
  function showDragVis(jid) {
    clearDragVis();
    if (!jid || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    dragVisJid = jid;
    if (jid === selJoint) return;
    const j = list().find((x) => x.id === jid);
    if (!j || !Array.isArray(j.ao)) return;
    drawJointVis(j, dragVisObjs);
    Viewer.requestRender();
  }
  function addPickDot(p, color = '#0c7a70') {
    const d = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], color, 10, { depthTest: false });
    Viewer.groups.overlay.add(d); pickObjs.push(d);
    return d;
  }
  function syncPickVis() {
    clearPickVis();
    if (!pickState) return;
    if (pickState.pick1) {
      if (pickState.pick1.worldP) addPickDot(new THREE.Vector3(...pickState.pick1.worldP), '#f08c00');
      if (pickState.pick1.kind === 'face' && pickState.pick1.faceIdx != null) {
        Viewer.highlightFace('sel', pickState.pick1.id, pickState.pick1.faceIdx);
      }
    }
    if (pickState.hover) {
      if (pickState.hover.kind === 'face' && pickState.hover.faceIdx != null) {
        Viewer.highlightFace('hover', pickState.hover.id, pickState.hover.faceIdx);
      } else if (pickState.hover.worldP) {
        addPickDot(new THREE.Vector3(...pickState.hover.worldP), Viewer.theme.accent);
      }
    }
    Viewer.requestRender();
  }
  function updatePickBar() {
    if (!pickBar || !pickState) return;
    const msg = pickBar.querySelector('#jp-msg');
    const name1 = pickState.pick1 ? Model.label(top(pickState.pick1.id) || { name: 'Teil 1' }) : '';
    if (msg) msg.textContent = pickState.pick1 ? T('joint.pickStep2', { name: name1 }) : T('joint.pickStep1');
    for (const m of ['auto', 'face', 'point']) {
      const b = pickBar.querySelector('#jp-mode-' + m);
      if (b) b.setAttribute('aria-pressed', String(pickState.mode === m));
    }
    UI.hint(pickState.pick1 ? `<b>${esc(T('joint.pickStep2', { name: name1 }))}</b> <b>Esc</b> bricht ab.` : `<b>${esc(T('joint.pickStep1'))}</b> <b>Esc</b> bricht ab.`);
  }
  function showPickBar() {
    hidePickBar();
    pickBar = h('div', { class: 'sketchbar measurebar', id: 'joint-pick-bar' });
    const msg = h('span', { class: 'm-cur', id: 'jp-msg' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Auswahlart' });
    for (const [m, lbl] of [['auto', 'Auto'], ['face', 'Fläche'], ['point', 'Punkt']]) {
      const b = h('button', { type: 'button', id: 'jp-mode-' + m, 'aria-pressed': String(pickState.mode === m) }, lbl);
      b.onclick = () => { if (!pickState) return; pickState.mode = m; updatePickBar(); };
      seg.append(b);
    }
    const cancelBtn = h('button', { type: 'button', class: 'tool', id: 'jp-cancel', 'data-kbd': 'Esc' });
    cancelBtn.innerHTML = icon('close') + `<span>${esc(T('common.cancel'))}</span>`;
    cancelBtn.onclick = () => stopPick();
    pickBar.append(msg, seg, cancelBtn);
    $('#overlay').append(pickBar);
    updatePickBar();
  }
  function hidePickBar() { if (pickBar) { pickBar.remove(); pickBar = null; } }

  function pickEntityAt(cx, cy, mode = 'auto') {
    const hit = Viewer.pick(cx, cy, { edgePx: mode === 'face' ? 0 : 9, noEdges: mode === 'face', solidsOnly: true });
    if (!hit || !hit.node) return null;
    const M = hit.node.obj.matrixWorld;
    const invW = M.clone().invert();
    const r = Viewer.canvas.getBoundingClientRect();
    const snapEdgePt = (maxPx) => {
      if (hit.edgeIdx == null) return null;
      const g = hit.node.data.edges && hit.node.data.edges[hit.edgeIdx];
      if (!g) return null;
      const cand = mode === 'point' ? [g.a, g.b, g.m, g.c].filter(Boolean) : [g.a, g.b, g.c].filter(Boolean);
      let best = null, bd = maxPx;
      for (const pt of cand) {
        const w = new THREE.Vector3(...pt).applyMatrix4(M);
        const s = Viewer.toScreen(w);
        const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top));
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    };
    if (mode === 'point') {
      const sp = snapEdgePt(12) || hit.point.clone();
      const lp = sp.clone().applyMatrix4(invW);
      return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(sp.toArray()) };
    }
    if (mode === 'auto') {
      const sp = snapEdgePt(8);
      if (sp) {
        const lp = sp.clone().applyMatrix4(invW);
        return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(sp.toArray()) };
      }
    }
    const f = hit.faceIdx >= 0 ? hit.node.data.faces[hit.faceIdx] : null;
    if (f && f.t === 'PLANE' && f.n && f.c) {
      return {
        kind: 'face',
        id: hit.id,
        faceIdx: hit.faceIdx,
        info: f,
        c: r6(f.c),
        n: r9(f.n),
        worldP: r6(new THREE.Vector3(...f.c).applyMatrix4(M).toArray()),
      };
    }
    if (mode === 'auto') {
      const lp = hit.point.clone().applyMatrix4(invW);
      return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(hit.point.toArray()) };
    }
    return null;
  }

  function stopPick() {
    if (!pickState) return;
    const ps = pickState;
    pickState = null;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', ps.down, true);
    if (ps.move) cv.removeEventListener('pointermove', ps.move, !!ps.moveCapture);
    window.removeEventListener('keydown', ps.key, true);
    hidePickBar();
    clearPickVis();
    Viewer.highlightFace('hover', null, null);
    Viewer.highlightFace('sel', null, null);
    Viewer.highlightEdge(null, null);
    cv.style.cursor = '';
    UI.hint(null);
    if (ps.isFixed || ps.restoreVisuals) {
      App.refreshSelectionVisuals();
      Handles.rebuild();
    }
  }

  // Gelenk anlegen: zwei Teile gewählt, das zuletzt gewählte bewegt sich; dann die Achse im Bild wählen
  function start(kind = 'rot') {
    stopPick();
    const sel = App.sel.map((id) => top(id)).filter(Boolean);
    if (sel.length !== 2) { UI.toast('Wähle genau zwei Teile (mit Umschalt klicken – Teile in einer Gruppe links im Verlauf).', { icon: 'info' }); return false; }
    const [A, B] = sel;
    const isSlide = kind === 'slide';
    const k = isSlide ? 'slide' : 'rot';
    const chk = canAddKinematicJoint(App.doc, A, B, k);
    if (!chk.ok) { UI.toast(chk.msg, { icon: chk.locked ? 'lock' : 'info' }); return false; }
    Features.pickAxisThen((ax) => {
      let jid = null, jamMsg = null, wasClosing = false;
      App.change('Gelenk angelegt', (doc) => {
        const a = top(A.id, doc), b = top(B.id, doc);
        if (!a || !b) return false;
        const chk2 = canAddKinematicJoint(doc, a, b, k);
        if (!chk2.ok) return false;
        wasClosing = !!chk2.closing;
        const snapItems = chk2.closing ? deepClone(doc.items) : null;
        const snapJoints = chk2.closing ? deepClone(doc.joints || []) : null;
        doc.joints = doc.joints || [];
        jid = uid('j');
        const entry = {
          id: jid, a: A.id, b: B.id,
          ao: r6(ax.o.toArray()), ad: r9(ax.d.toArray()),
          home: r9(Model.localMatrix(b).toArray()),
          ang: 0, min: isSlide ? -20 : (chk2.closing ? -360 : -90), max: isSlide ? 20 : (chk2.closing ? 360 : 90),
        };
        if (isSlide) entry.kind = 'slide';
        captureLocalFrames(doc, entry);
        doc.joints.push(entry);
        if (chk2.closing) {
          const core = cyclicCore(doc, jid, true);
          if (core) {
            widenClosedLoopDefaults(core);
            ensureLocalFrames(doc, core.joints);
            const gap = jointGapError(doc, entry);
            if (!gap.ok) {
              const sol = solveClosedPoses(doc, core, null, null, null, null);
              if (!sol.ok) {
                doc.items = snapItems;
                doc.joints = snapJoints;
                jamMsg = JAM_MSG;
                jid = null;
                return false;
              }
              applyClosedPoses(doc, core, sol.poses);
            }
          }
        }
      });
      if (jamMsg) { UI.toast(jamMsg, { kind: 'bad' }); return; }
      if (!jid) return;
      App.select([B.locked ? A.id : B.id]);
      if (wasClosing) {
        UI.toast(`Geschlossener Mechanismus verbunden: „${Model.label(B)}“ ↔ „${Model.label(A)}“ an ${ax.what}.`, { icon: 'check', ms: 3600 });
      } else {
        UI.toast(`${isSlide ? 'Schiebegelenk' : 'Gelenk'} angelegt: „${Model.label(B)}“ ${isSlide ? 'gleitet entlang' : 'dreht sich um'} ${ax.what}, „${Model.label(A)}“ bleibt stehen.`, { icon: 'check', ms: 3600 });
      }
    }, '<b>Gelenkachse wählen:</b> Klick auf eine gerade Kante, einen runden Rand oder eine runde Fläche (Stift, Loch). <b>Esc</b> bricht ab.');
    return true;
  }

  function startCylindrical(firstRef = null) {
    stopPick();
    let step1 = firstRef ? cylAxisOf(firstRef) : null;
    const setHint = () => {
      UI.hint(step1
        ? `<b>Zylindrisch (2/2):</b> Klick auf die runde Fläche oder den Kreisrand am <b>beweglichen Teil</b> (Welle/Bolzen). <b>Esc</b> bricht ab.`
        : `<b>Zylindrisch (1/2):</b> Klick auf die runde Fläche oder den Kreisrand am <b>festen Teil</b> (z. B. Bohrung). <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9 });
      const ax = cylHitOf(hit);
      if (!ax) { UI.toast('Klick auf eine runde Zylinderfläche oder einen Kreisrand.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(ax.id)) return;
        step1 = ax;
        Viewer.highlightFace('hover', hit.faceIdx >= 0 ? hit.id : null, hit.faceIdx >= 0 ? hit.faceIdx : null);
        setHint();
        return;
      }
      if (ax.id === step1.id) { UI.toast('Wähle jetzt eine runde Fläche am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addCylindrical(step1, ax);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([ax.id]);
      const A = top(step1.id), B = top(ax.id);
      UI.toast(`Zylindrische Verbindung angelegt: „${Model.label(B)}“ dreht und gleitet in „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9 });
      const ok = !!cylHitOf(hit) && (!step1 || hit.id !== step1.id);
      if (ok && hit.edgeIdx != null) { Viewer.highlightEdge(hit.id, hit.edgeIdx); Viewer.highlightFace('hover', null, null); }
      else if (ok && hit.faceIdx >= 0) { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', hit.id, hit.faceIdx); }
      else { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', null, null); }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    setHint();
    return true;
  }

  function startPlanar(firstRef = null) {
    stopPick();
    let step1 = firstRef ? planarFaceOf(firstRef) : null;
    const setHint = () => {
      UI.hint(step1
        ? `<b>Eben (2/2):</b> Klick auf die ebene Fläche am <b>beweglichen Teil</b>. <b>Esc</b> bricht ab.`
        : `<b>Eben (1/2):</b> Klick auf die ebene Fläche am <b>festen Teil</b>. <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const pl = planarHitOf(hit);
      if (!pl) { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(pl.id)) return;
        step1 = pl;
        Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        setHint();
        return;
      }
      if (pl.id === step1.id) { UI.toast('Wähle jetzt eine ebene Fläche am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addPlanar(step1, pl);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([pl.id]);
      const A = top(step1.id), B = top(pl.id);
      UI.toast(`Ebene Verbindung angelegt: „${Model.label(B)}“ gleitet und dreht auf „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const ok = !!planarHitOf(hit) && (!step1 || hit.id !== step1.id);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    setHint();
    return true;
  }

  function startParallel(firstRef = null) {
    stopPick();
    let step1 = firstRef ? resolvePlaneRef(firstRef) : null;
    if (step1) step1 = { id: firstRef.id, faceIdx: step1.idx };
    const setHint = () => {
      UI.hint(step1
        ? `<b>Parallel (2/2):</b> Klick auf die ebene Fläche am <b>zweiten Teil</b> (richtet sich parallel aus). <b>Esc</b> bricht ab.`
        : `<b>Parallel (1/2):</b> Klick auf die ebene Fläche am <b>ersten Teil</b> (bleibt stehen). <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const pl = planarHitOf(hit);
      if (!pl) { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(pl.id)) return;
        step1 = { id: pl.id, faceIdx: pl.faceIdx };
        Viewer.highlightFace('sel', pl.id, pl.faceIdx);
        setHint();
        return;
      }
      if (pl.id === step1.id) { UI.toast('Wähle jetzt eine ebene Fläche an einem anderen Teil.', { icon: 'info' }); return; }
      const r = addParallel(step1, { id: pl.id, faceIdx: pl.faceIdx });
      if (!r.ok) { UI.toast(r.msg, { kind: 'bad', ms: 4000 }); return; }
      stopPick();
      select(r.id);
      const A = top(step1.id), B = top(pl.id);
      UI.toast(`Parallel ausgerichtet: „${Model.label(B)}“ ↔ „${Model.label(A)}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const ok = !!planarHitOf(hit) && (!step1 || hit.id !== step1.id);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    if (step1 && step1.faceIdx != null) Viewer.highlightFace('sel', step1.id, step1.faceIdx);
    setHint();
    return true;
  }

  function tangentHitOf(hit, wantKind = null) {
    if (!hit || !hit.node || hit.faceIdx == null || hit.faceIdx < 0) return null;
    const fi = hit.node.data && hit.node.data.faces && hit.node.data.faces[hit.faceIdx];
    if (!fi) return null;
    if (fi.t === 'PLANE' && (!wantKind || wantKind === 'face') && Array.isArray(fi.n) && Array.isArray(fi.c)) {
      return { kind: 'face', id: hit.id, faceIdx: hit.faceIdx };
    }
    if (fi.t === 'CYLINDRE' && (!wantKind || wantKind === 'cyl') && Array.isArray(fi.axis) && fi.r > 0) {
      return { kind: 'cyl', id: hit.id, faceIdx: hit.faceIdx };
    }
    return null;
  }

  function startTangent(firstRef = null) {
    stopPick();
    let step1 = null;
    if (firstRef && firstRef.id) {
      if (resolvePlaneRef(firstRef)) step1 = { kind: 'face', id: firstRef.id, faceIdx: firstRef.faceIdx ?? firstRef.idx };
      else if (resolveCylRef(firstRef)) step1 = { kind: 'cyl', id: firstRef.id, faceIdx: firstRef.faceIdx ?? firstRef.idx };
    }
    const wantNext = () => (!step1 ? null : step1.kind === 'face' ? 'cyl' : 'face');
    const setHint = () => {
      if (!step1) UI.hint('<b>Tangential (1/2):</b> Klick auf eine ebene Fläche oder eine runde Zylinderfläche am <b>ersten Teil</b>. <b>Esc</b> bricht ab.');
      else if (step1.kind === 'face') UI.hint('<b>Tangential (2/2):</b> Klick auf die <b>runde Zylinderfläche</b> am zweiten Teil. <b>Esc</b> bricht ab.');
      else UI.hint('<b>Tangential (2/2):</b> Klick auf die <b>ebene Fläche</b> am zweiten Teil. <b>Esc</b> bricht ab.');
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const th = tangentHitOf(hit, wantNext());
      if (!th) {
        const w = wantNext();
        UI.toast(w === 'cyl' ? 'Klick auf eine runde Zylinderfläche.' : w === 'face' ? 'Klick auf eine ebene Fläche.' : 'Klick auf eine ebene Fläche oder eine runde Zylinderfläche.', { icon: 'info' });
        return;
      }
      if (!step1) {
        if (!top(th.id)) return;
        step1 = th;
        Viewer.highlightFace('sel', th.id, th.faceIdx);
        setHint();
        return;
      }
      if (th.id === step1.id) { UI.toast('Wähle eine Fläche an einem anderen Teil.', { icon: 'info' }); return; }
      const r = addTangent({ id: step1.id, faceIdx: step1.faceIdx }, { id: th.id, faceIdx: th.faceIdx });
      if (!r.ok) { UI.toast(r.msg, { kind: 'bad', ms: 4000 }); return; }
      stopPick();
      select(r.id);
      const A = top(step1.id), B = top(th.id);
      UI.toast(`Tangential angelegt: „${Model.label(B)}“ ↔ „${Model.label(A)}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const th = tangentHitOf(hit, wantNext());
      const ok = !!th && (!step1 || th.id !== step1.id);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    if (step1 && step1.faceIdx != null) Viewer.highlightFace('sel', step1.id, step1.faceIdx);
    setHint();
    return true;
  }

  function startDistance(firstRef = null, defaultDist = 5) {
    stopPick();
    let step1 = firstRef ? resolvePlaneRef(firstRef) : null;
    if (step1) step1 = { id: firstRef.id, faceIdx: step1.idx };
    hidePickBar();
    pickBar = h('div', { class: 'sketchbar measurebar', id: 'joint-pick-bar' });
    const msg = h('span', { class: 'm-cur', id: 'jp-msg' });
    const distLbl = h('label', { for: 'jp-dist', style: { fontSize: '12px', color: 'var(--muted)' } }, T('joint.distLabel') + ':');
    const distInp = h('input', { id: 'jp-dist', type: 'text', value: String(defaultDist), style: { width: '82px' }, autocomplete: 'off', spellcheck: 'false' });
    distInp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return;
      e.stopPropagation();
      if (e.key === 'Enter') distInp.blur();
    });
    const unitSpan = h('span', { style: { fontSize: '12px', color: 'var(--muted)' } }, Units.label());
    const cancelBtn = h('button', { type: 'button', class: 'tool', id: 'jp-cancel', 'data-kbd': 'Esc' });
    cancelBtn.innerHTML = icon('close') + `<span>${esc(T('common.cancel'))}</span>`;
    cancelBtn.onclick = () => stopPick();
    pickBar.append(msg, distLbl, distInp, unitSpan, cancelBtn);
    $('#overlay').append(pickBar);

    const updateDistHint = () => {
      const name1 = step1 ? Model.label(top(step1.id) || { name: 'Teil 1' }) : '';
      const txt = step1 ? T('joint.pickDistStep2', { name: name1 }) : T('joint.pickDistStep1');
      msg.textContent = txt;
      UI.hint(`<b>${esc(txt)}</b> <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const pl = planarHitOf(hit);
      if (!pl) { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(pl.id)) return;
        step1 = { id: pl.id, faceIdx: pl.faceIdx };
        Viewer.highlightFace('sel', pl.id, pl.faceIdx);
        updateDistHint();
        return;
      }
      if (pl.id === step1.id) { UI.toast('Wähle jetzt eine ebene Fläche an einem anderen Teil.', { icon: 'info' }); return; }
      const raw = distInp.value.trim();
      const r = addDistance(step1, { id: pl.id, faceIdx: pl.faceIdx }, { dist: raw === '' ? defaultDist : raw });
      if (!r.ok) { UI.toast(r.msg, { kind: 'bad', ms: 4000 }); return; }
      stopPick();
      select(r.id);
      const A = top(step1.id), B = top(pl.id);
      UI.toast(`Abstand angelegt: „${Model.label(B)}“ ↔ „${Model.label(A)}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const ok = !!planarHitOf(hit) && (!step1 || hit.id !== step1.id);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    if (step1 && step1.faceIdx != null) Viewer.highlightFace('sel', step1.id, step1.faceIdx);
    updateDistHint();
    return true;
  }

  function startBall(firstRef = null) {
    stopPick();
    let step1 = firstRef ? ballPointOf(firstRef) : null;
    const setHint = () => {
      UI.hint(step1
        ? `<b>Kugel (2/2):</b> Klick auf den Punkt oder die Kugel am <b>beweglichen Teil</b>. <b>Esc</b> bricht ab.`
        : `<b>Kugel (1/2):</b> Klick auf einen Punkt, eine Ecke oder eine Kugel am <b>festen Teil</b>. <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9, solidsOnly: true });
      const pt = ballHitOf(hit, e.clientX, e.clientY);
      if (!pt) { UI.toast('Klick auf einen Punkt, eine Kante oder eine Fläche eines Körpers.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(pt.id)) return;
        step1 = pt;
        clearPickVis();
        addPickDot(pt.p, '#f08c00');
        setHint();
        return;
      }
      if (pt.id === step1.id) { UI.toast('Wähle jetzt einen Punkt am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addBall(step1, pt);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([pt.id]);
      const A = top(step1.id), B = top(pt.id);
      UI.toast(`Kugel-Verbindung angelegt: „${Model.label(B)}“ dreht sich frei um den Punkt an „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9, solidsOnly: true });
      const pt = ballHitOf(hit, e.clientX, e.clientY);
      const ok = !!pt && (!step1 || pt.id !== step1.id);
      clearPickVis();
      if (step1) addPickDot(step1.p, '#f08c00');
      if (ok) addPickDot(pt.p, Viewer.theme.accent);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    if (step1) addPickDot(step1.p, '#f08c00');
    setHint();
    return true;
  }

  function startSlot(firstRef = null) {
    stopPick();
    let step1 = firstRef ? slotCenterlineOf(firstRef) : null;
    const drawSlotPreview = (sl, col = '#f08c00') => {
      if (!sl) return;
      const ln = Viewer.makeFat([sl.p0.x, sl.p0.y, sl.p0.z, sl.p1.x, sl.p1.y, sl.p1.z], col, 3, { depthTest: false });
      Viewer.groups.overlay.add(ln); pickObjs.push(ln);
      addPickDot(sl.p0, col);
      addPickDot(sl.p1, col);
    };
    const setHint = () => {
      UI.hint(step1
        ? `<b>Stift im Langloch (2/2):</b> Klick auf den <b>Stift</b> (Zylinder, Kreis oder Punkt) am <b>beweglichen Teil</b>. <b>Esc</b> bricht ab.`
        : `<b>Stift im Langloch (1/2):</b> Klick auf das <b>Langloch</b> (Innenfläche oder Rand) am <b>festen Teil</b>. <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!step1) {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9, solidsOnly: true });
        const sl = slotHitOf(hit);
        if (!sl) { UI.toast('Klick auf ein Langloch (Innenfläche oder Rand) bzw. eine gerade Führungskante.', { icon: 'info' }); return; }
        if (!top(sl.id)) return;
        step1 = sl;
        clearPickVis();
        drawSlotPreview(sl, '#f08c00');
        setHint();
        return;
      }
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9, solidsOnly: true });
      const pin = slotPinHitOf(hit, e.clientX, e.clientY);
      if (!pin) { UI.toast('Klick auf einen Stift (Zylinderfläche, Kreisrand oder Punkt) am zweiten Teil.', { icon: 'info' }); return; }
      if (pin.id === step1.id) { UI.toast('Wähle jetzt den Stift am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addSlot(step1, pin);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([pin.id]);
      const A = top(step1.id), B = top(pin.id);
      UI.toast(`Stift im Langloch angelegt: „${Model.label(B)}“ gleitet zwischen den Endanschlägen von „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      clearPickVis();
      if (step1) drawSlotPreview(step1, '#f08c00');
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9, solidsOnly: true });
      if (!step1) {
        const sl = slotHitOf(hit);
        if (sl) {
          drawSlotPreview(sl, Viewer.theme.accent);
          if (hit.faceIdx >= 0) Viewer.highlightFace('hover', hit.id, hit.faceIdx);
          else if (hit.edgeIdx != null) Viewer.highlightEdge(hit.id, hit.edgeIdx);
        } else {
          Viewer.highlightFace('hover', null, null);
          Viewer.highlightEdge(null, null);
        }
      } else {
        const pin = slotPinHitOf(hit, e.clientX, e.clientY);
        if (pin && pin.id !== step1.id) addPickDot(pin.p, Viewer.theme.accent);
      }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    if (step1) drawSlotPreview(step1, '#f08c00');
    setHint();
    return true;
  }
  function startFixed(firstFace = null, replaceJid = null) {
    stopPlay();
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    stopPick();
    const solids = Model.activeItems(App.doc).filter((x) => !x.hidden && x.role !== 'hole');
    if (solids.length < 2) {
      UI.toast('Für „Verbinden: fest“ brauchst du mindestens zwei sichtbare Körper.', { icon: 'info' });
      return false;
    }
    let pick1 = null;
    if (firstFace && firstFace.id && firstFace.info && firstFace.info.t === 'PLANE') {
      const n = Viewer.nodes.get(firstFace.id);
      const M = n ? n.obj.matrixWorld : Model.worldMatrix(App.doc, firstFace.id);
      pick1 = {
        kind: 'face',
        id: firstFace.id,
        faceIdx: firstFace.idx != null ? firstFace.idx : firstFace.faceIdx,
        info: firstFace.info,
        c: r6(firstFace.info.c),
        n: r9(firstFace.info.n),
        worldP: r6(new THREE.Vector3(...firstFace.info.c).applyMatrix4(M).toArray()),
      };
    }
    App.clearSelection();
    Handles.clear();
    const down = (e) => {
      if (e.button !== 0 || !pickState) return;
      e.preventDefault(); e.stopPropagation();
      const ent = pickEntityAt(e.clientX, e.clientY, pickState.mode);
      if (!ent) {
        UI.toast(pickState.mode === 'face' ? 'Klick auf eine ebene Fläche eines Körpers.' : 'Klick auf eine Fläche oder einen Punkt an einem Körper.', { icon: 'info' });
        return;
      }
      const part = top(ent.id);
      if (!part) return;
      if (!pickState.pick1) {
        pickState.pick1 = ent;
        pickState.hover = null;
        syncPickVis();
        updatePickBar();
        return;
      }
      const p1 = pickState.pick1;
      if (p1.id === ent.id) {
        UI.toast('Wähle eine Fläche oder einen Punkt auf einem anderen Teil.', { icon: 'info' });
        return;
      }
      const repId = pickState.replaceJid;
      if (repId) {
        const refA = resolveRef(p1, App.doc), refB = resolveRef(ent, App.doc);
        if (!refA || !refB) return;
        const mode = refA.kind === 'face' && refB.kind === 'face' ? 'face' : 'point';
        let relQ = null;
        if (mode === 'point') {
          const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
          Model.worldMatrix(App.doc, p1.id).decompose(new THREE.Vector3(), qa, new THREE.Vector3());
          Model.worldMatrix(App.doc, ent.id).decompose(new THREE.Vector3(), qb, new THREE.Vector3());
          relQ = r9(qa.clone().invert().multiply(qb).toArray());
        }
        stopPick();
        updateFixed(repId, { a: p1.id, b: ent.id, mode, refA, refB, relQ }, { label: 'Verbindungs-Bezüge geändert' });
        select(repId);
        UI.toast('Verbindung aktualisiert.', { icon: 'check' });
        return;
      }
      const res = addFixed(p1, ent);
      if (!res.ok) {
        UI.toast(res.msg || 'Verbindung konnte nicht angelegt werden.', { kind: 'bad' });
        return;
      }
      stopPick();
      select(res.id);
      UI.toast(`Verbunden: „${Model.label(top(ent.id))}“ liegt fest an „${Model.label(top(p1.id))}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      if (!pickState) return;
      const ent = pickEntityAt(e.clientX, e.clientY, pickState.mode);
      pickState.hover = ent;
      syncPickVis();
    };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); }
    };
    pickState = { mode: 'auto', pick1, hover: null, replaceJid, down, move, key, moveCapture: true, isFixed: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    showPickBar();
    syncPickVis();
    return true;
  }

  function pickOrientAt(cx, cy, mode = 'auto') {
    const hit = Viewer.pick(cx, cy, { edgePx: mode === 'face' ? 0 : 10, noEdges: mode === 'face', solidsOnly: true });
    if (!hit || !hit.node) return null;
    const M = hit.node.obj.matrixWorld;
    if (mode !== 'face' && hit.edgeIdx != null) {
      const g = hit.node.data.edges && hit.node.data.edges[hit.edgeIdx];
      if (g && g.t === 'LINE' && Array.isArray(g.a) && Array.isArray(g.b)) {
        const mid = new THREE.Vector3((g.a[0] + g.b[0]) * 0.5, (g.a[1] + g.b[1]) * 0.5, (g.a[2] + g.b[2]) * 0.5).applyMatrix4(M);
        return { kind: 'edge', id: hit.id, edgeIdx: hit.edgeIdx, info: g, worldP: r6(mid.toArray()) };
      }
    }
    if (mode !== 'edge' && hit.faceIdx >= 0) {
      const f = hit.node.data.faces && hit.node.data.faces[hit.faceIdx];
      if (f && f.t === 'PLANE' && Array.isArray(f.n) && Array.isArray(f.c)) {
        return { kind: 'face', id: hit.id, faceIdx: hit.faceIdx, info: f, worldP: r6(new THREE.Vector3(...f.c).applyMatrix4(M).toArray()) };
      }
    }
    return null;
  }

  function startAngle(firstRef = null, replaceJid = null) {
    stopPlay();
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    stopPick();
    const solids = Model.activeItems(App.doc).filter((x) => !x.hidden && x.role !== 'hole');
    if (solids.length < 2) {
      UI.toast('Für „Verbindung: Winkel“ brauchst du mindestens zwei sichtbare Körper.', { icon: 'info' });
      return false;
    }
    const existing = replaceJid ? list().find((x) => x.id === replaceJid) : null;
    let pick1 = firstRef ? resolveOrientRef(firstRef) : null;
    if (pick1) pick1 = { ...firstRef, ...pick1 };
    let curAngle = existing ? existing.angle : '30';
    App.clearSelection();
    Handles.clear();

    const syncAnglePickVis = () => {
      clearPickVis();
      Viewer.highlightEdge(null, null);
      if (!pickState) return;
      if (pickState.pick1) {
        if (pickState.pick1.kind === 'face' && pickState.pick1.faceIdx != null) Viewer.highlightFace('sel', pickState.pick1.id, pickState.pick1.faceIdx);
        else if (pickState.pick1.worldP) addPickDot(new THREE.Vector3(...pickState.pick1.worldP), '#f08c00');
      }
      if (pickState.hover) {
        if (pickState.hover.kind === 'edge' && pickState.hover.edgeIdx != null) Viewer.highlightEdge(pickState.hover.id, pickState.hover.edgeIdx);
        else if (pickState.hover.kind === 'face' && pickState.hover.faceIdx != null) Viewer.highlightFace('hover', pickState.hover.id, pickState.hover.faceIdx);
      }
      Viewer.requestRender();
    };
    const updateAngleBar = () => {
      if (!pickBar || !pickState) return;
      const msg = pickBar.querySelector('#jp-msg');
      const name1 = pickState.pick1 ? Model.label(top(pickState.pick1.id) || { name: 'Teil 1' }) : '';
      const txt = pickState.pick1 ? T('joint.angleStep2', { name: name1 }) : T('joint.angleStep1');
      if (msg) msg.textContent = txt;
      for (const m of ['auto', 'face', 'edge']) {
        const b = pickBar.querySelector('#jp-mode-' + m);
        if (b) b.setAttribute('aria-pressed', String(pickState.mode === m));
      }
      UI.hint(`<b>${esc(txt)}</b> <b>Esc</b> bricht ab.`);
    };
    const showAngleBar = () => {
      hidePickBar();
      pickBar = h('div', { class: 'sketchbar measurebar', id: 'joint-pick-bar' });
      const msg = h('span', { class: 'm-cur', id: 'jp-msg' });
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Auswahlart' });
      for (const [m, lbl] of [['auto', 'Auto'], ['face', 'Fläche'], ['edge', 'Kante']]) {
        const b = h('button', { type: 'button', id: 'jp-mode-' + m, 'aria-pressed': String(pickState.mode === m) }, lbl);
        b.onclick = () => { if (!pickState) return; pickState.mode = m; updateAngleBar(); };
        seg.append(b);
      }
      const angWrap = h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' } }, T('joint.angleLabel') + ':');
      const angInp = h('input', {
        id: 'jp-angle', type: 'text', value: String(curAngle),
        style: { width: '68px', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' },
        'aria-label': T('joint.angleLabel'),
      });
      angInp.addEventListener('input', () => { curAngle = angInp.value; });
      angInp.addEventListener('keydown', (e) => { e.stopPropagation(); });
      angWrap.append(angInp, h('span', null, '°'));
      const cancelBtn = h('button', { type: 'button', class: 'tool', id: 'jp-cancel', 'data-kbd': 'Esc' });
      cancelBtn.innerHTML = icon('close') + `<span>${esc(T('common.cancel'))}</span>`;
      cancelBtn.onclick = () => stopPick();
      pickBar.append(msg, seg, angWrap, cancelBtn);
      $('#overlay').append(pickBar);
      updateAngleBar();
    };

    const down = (e) => {
      if (e.button !== 0 || !pickState) return;
      e.preventDefault(); e.stopPropagation();
      const ent = pickOrientAt(e.clientX, e.clientY, pickState.mode);
      if (!ent) {
        UI.toast('Klick auf eine ebene Fläche oder eine gerade Kante.', { icon: 'info' });
        return;
      }
      if (!top(ent.id)) return;
      if (!pickState.pick1) {
        pickState.pick1 = ent;
        pickState.hover = null;
        syncAnglePickVis();
        updateAngleBar();
        return;
      }
      const p1 = pickState.pick1;
      if (p1.id === ent.id) {
        UI.toast('Wähle eine Fläche oder Kante an einem anderen Teil.', { icon: 'info' });
        return;
      }
      const repId = pickState.replaceJid;
      if (repId) {
        const refA = resolveOrientRef(p1, App.doc), refB = resolveOrientRef(ent, App.doc);
        if (!refA || !refB) return;
        const Wa = Model.worldMatrix(App.doc, p1.id), Wb = Model.worldMatrix(App.doc, ent.id);
        const uA = new THREE.Vector3(...(refA.kind === 'edge' ? refA.d : refA.n)).transformDirection(Wa).normalize();
        const uB = new THREE.Vector3(...(refB.kind === 'edge' ? refB.d : refB.n)).transformDirection(Wb).normalize();
        const alignSign = refA.kind === refB.kind && uA.dot(uB) < -1e-4 ? -1 : 1;
        const vA = uA.clone().multiplyScalar(alignSign);
        const cr = new THREE.Vector3().crossVectors(vA, uB);
        const k0 = cr.lengthSq() > 1e-8 ? cr.normalize() : defaultHingeAxis(uA);
        const axisA = r9(k0.clone().transformDirection(Wa.clone().invert()).normalize().toArray());
        stopPick();
        updateAngle(repId, { a: p1.id, b: ent.id, refA, refB, axisA, alignSign, angle: curAngle }, { label: 'Winkel-Bezüge geändert' });
        select(repId);
        UI.toast('Winkel-Verbindung aktualisiert.', { icon: 'check' });
        return;
      }
      const res = addAngle(p1, ent, { angle: curAngle });
      if (!res.ok) {
        UI.toast(res.msg || 'Winkel-Verbindung konnte nicht angelegt werden.', { kind: 'bad' });
        return;
      }
      stopPick();
      select(res.id);
      UI.toast(`Winkel angelegt: ${fmtAngleU(evalAngleDeg(curAngle))} zwischen „${Model.label(top(p1.id))}“ und „${Model.label(top(ent.id))}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      if (!pickState) return;
      pickState.hover = pickOrientAt(e.clientX, e.clientY, pickState.mode);
      syncAnglePickVis();
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { mode: 'auto', pick1, hover: null, replaceJid, down, move, key, moveCapture: true, restoreVisuals: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    showAngleBar();
    syncAnglePickVis();
    return true;
  }

  function startCenter(replaceJid = null) {
    stopPlay();
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    stopPick();
    const solids = Model.activeItems(App.doc).filter((x) => !x.hidden && x.role !== 'hole');
    if (solids.length < 2) {
      UI.toast('Für „Verbindung: Mittig“ brauchst du mindestens zwei sichtbare Körper.', { icon: 'info' });
      return false;
    }
    App.clearSelection();
    Handles.clear();

    const syncCenterVis = () => {
      clearPickVis();
      if (!pickState) return;
      for (const p of pickState.picks) {
        if (p.worldP) addPickDot(new THREE.Vector3(...p.worldP), '#f08c00');
      }
      if (pickState.picks.length) {
        const lastP = pickState.picks[pickState.picks.length - 1];
        if (lastP.faceIdx != null) Viewer.highlightFace('sel', lastP.id, lastP.faceIdx);
      }
      if (pickState.hover && pickState.hover.faceIdx != null) {
        Viewer.highlightFace('hover', pickState.hover.id, pickState.hover.faceIdx);
      }
      Viewer.requestRender();
    };
    const updateCenterBar = () => {
      if (!pickBar || !pickState) return;
      const n = pickState.picks.length;
      const txt = n === 0 ? T('joint.centerStep1')
        : n === 1 ? T('joint.centerStep2')
          : pickState.bMode === 'body' ? T('joint.centerStep3Body')
            : n === 2 ? T('joint.centerStep3Face') : T('joint.centerStep4Face');
      const msg = pickBar.querySelector('#jp-msg');
      if (msg) msg.textContent = txt;
      for (const m of ['body', 'faces']) {
        const b = pickBar.querySelector('#jp-cmode-' + m);
        if (b) b.setAttribute('aria-pressed', String(pickState.bMode === m));
      }
      UI.hint(`<b>${esc(txt)}</b> <b>Esc</b> bricht ab.`);
    };
    const showCenterBar = () => {
      hidePickBar();
      pickBar = h('div', { class: 'sketchbar measurebar', id: 'joint-pick-bar' });
      const msg = h('span', { class: 'm-cur', id: 'jp-msg' });
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ausrichtung' });
      for (const [m, lbl] of [['body', 'Ganzes Teil'], ['faces', '2 Flächen']]) {
        const b = h('button', { type: 'button', id: 'jp-cmode-' + m, 'aria-pressed': String(pickState.bMode === m) }, lbl);
        b.onclick = () => {
          if (!pickState) return;
          pickState.bMode = m;
          if (m === 'body' && pickState.picks.length > 2) pickState.picks = pickState.picks.slice(0, 2);
          updateCenterBar();
        };
        seg.append(b);
      }
      const cancelBtn = h('button', { type: 'button', class: 'tool', id: 'jp-cancel', 'data-kbd': 'Esc' });
      cancelBtn.innerHTML = icon('close') + `<span>${esc(T('common.cancel'))}</span>`;
      cancelBtn.onclick = () => stopPick();
      pickBar.append(msg, seg, cancelBtn);
      $('#overlay').append(pickBar);
      updateCenterBar();
    };

    const down = (e) => {
      if (e.button !== 0 || !pickState) return;
      e.preventDefault(); e.stopPropagation();
      const picks = pickState.picks;
      if (picks.length === 2 && pickState.bMode === 'body') {
        const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
        if (!hit || !top(hit.id)) { UI.toast('Klick auf das Teil, das mittig sitzen soll.', { icon: 'info' }); return; }
        if (hit.id === picks[0].id) { UI.toast('Wähle einen anderen Körper als das feste Teil.', { icon: 'info' }); return; }
        if (pickState.replaceJid) {
          const pairA = validateParallelFacePair(picks[0], picks[1], `„${Model.label(top(picks[0].id))}“`);
          if (!pairA.ok) { UI.toast(pairA.msg, { icon: 'info' }); return; }
          const repId = pickState.replaceJid;
          stopPick();
          updateCenter(repId, { a: picks[0].id, b: hit.id, bMode: 'body', refA1: pairA.ref1, refA2: pairA.ref2, refB1: null, refB2: null }, { label: 'Bezüge geändert' });
          select(repId);
          UI.toast('Verbindung „Mittig“ aktualisiert.', { icon: 'check' });
          return;
        }
        const res = addCenter(picks[0], picks[1], { id: hit.id });
        if (!res.ok) { UI.toast(res.msg, { kind: 'bad' }); return; }
        stopPick();
        select(res.id);
        UI.toast(`„${Model.label(top(hit.id))}“ sitzt jetzt mittig.`, { icon: 'check', ms: 3400 });
        return;
      }

      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const pl = planarHitOf(hit);
      if (!pl || !top(pl.id)) { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
      const ent = { id: pl.id, faceIdx: pl.faceIdx, info: hit.node.data.faces[hit.faceIdx], worldP: r6(pl.p.toArray()) };
      if (picks.length === 0) {
        picks.push(ent);
      } else if (picks.length === 1) {
        if (ent.id !== picks[0].id) { UI.toast('Wähle die parallele Gegenfläche am selben ersten Teil.', { icon: 'info' }); return; }
        const chk = validateParallelFacePair(picks[0], ent, `„${Model.label(top(ent.id))}“`);
        if (!chk.ok) { UI.toast(chk.msg, { icon: 'info' }); return; }
        picks.push(ent);
      } else if (picks.length === 2) {
        if (ent.id === picks[0].id) { UI.toast('Wähle jetzt eine Fläche am anderen (beweglichen) Teil.', { icon: 'info' }); return; }
        picks.push(ent);
      } else if (picks.length === 3) {
        if (ent.id !== picks[2].id) { UI.toast('Wähle die parallele Gegenfläche am selben zweiten Teil.', { icon: 'info' }); return; }
        const chk = validateParallelFacePair(picks[2], ent, `„${Model.label(top(ent.id))}“`);
        if (!chk.ok) { UI.toast(chk.msg, { icon: 'info' }); return; }
        if (pickState.replaceJid) {
          const pairA = validateParallelFacePair(picks[0], picks[1], `„${Model.label(top(picks[0].id))}“`);
          if (!pairA.ok) { UI.toast(pairA.msg, { icon: 'info' }); return; }
          const repId = pickState.replaceJid;
          stopPick();
          updateCenter(repId, { a: picks[0].id, b: ent.id, bMode: 'faces', refA1: pairA.ref1, refA2: pairA.ref2, refB1: chk.ref1, refB2: chk.ref2 }, { label: 'Bezüge geändert' });
          select(repId);
          UI.toast('Verbindung „Mittig“ aktualisiert.', { icon: 'check' });
          return;
        }
        const res = addCenter(picks[0], picks[1], [picks[2], ent]);
        if (!res.ok) { UI.toast(res.msg, { kind: 'bad' }); return; }
        stopPick();
        select(res.id);
        UI.toast(`„${Model.label(top(ent.id))}“ sitzt jetzt mittig.`, { icon: 'check', ms: 3400 });
        return;
      }
      pickState.hover = null;
      syncCenterVis();
      updateCenterBar();
    };
    const move = (e) => {
      if (!pickState) return;
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      if (pickState.picks.length === 2 && pickState.bMode === 'body') {
        pickState.hover = hit && hit.faceIdx >= 0 && hit.id !== pickState.picks[0].id ? { id: hit.id, faceIdx: hit.faceIdx } : null;
      } else {
        const pl = planarHitOf(hit);
        pickState.hover = pl ? { id: pl.id, faceIdx: pl.faceIdx } : null;
      }
      syncCenterVis();
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { bMode: 'body', picks: [], hover: null, replaceJid, down, move, key, moveCapture: true, restoreVisuals: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    showCenterBar();
    syncCenterVis();
    return true;
  }

  // ---------- Freiheitsgrade setzen, Umkehren, Lage einhalten ----------
  // ---------- Kopplungen: Zahnrad, Zahnstange, Schraube, Riemen, Linear, Kurvenscheibe (BG-14, BG-15) ----------
  const couplingList = (doc = App.doc) => (doc && Array.isArray(doc.couplings) ? doc.couplings : []);
  const couplingsOf = (jid, doc = App.doc) => couplingList(doc).filter((c) => c.j1 === jid || c.j2 === jid);
  const isCouplingKind = (k) => k === 'gear' || k === 'rack' || k === 'screw' || k === 'belt' || k === 'linear' || k === 'cam';
  const CAM_COS = new Float64Array(360);
  const CAM_SIN = new Float64Array(360);
  for (let i = 0; i < 360; i++) {
    const rad = (i * Math.PI) / 180;
    CAM_COS[i] = Math.cos(rad);
    CAM_SIN[i] = Math.sin(rad);
  }
  const rotDofOf = (j) => {
    const k = kindOf(j);
    return (k === 'rot' || k === 'cyl' || k === 'planar' || k === 'slot' || k === 'ball') ? 'ang' : null;
  };
  const linDofOf = (j, pref = 'u') => {
    const k = kindOf(j);
    if (k === 'slide') return 'ang';
    if (k === 'cyl' || k === 'slot') return 'pos';
    if (k === 'planar') return pref === 'v' ? 'v' : 'u';
    return null;
  };
  const hasDof = (j, dof) => {
    const k = kindOf(j);
    if (k === 'rot' || k === 'slide') return dof === 'ang';
    if (k === 'cyl' || k === 'slot') return dof === 'ang' || dof === 'pos';
    if (k === 'planar') return dof === 'ang' || dof === 'u' || dof === 'v';
    if (k === 'ball') return dof === 'ang' || dof === 'rx' || dof === 'ry';
    return false;
  };
  const isLenDof = (j, dof) => (slide(j) && dof === 'ang') || dof === 'pos' || dof === 'u' || dof === 'v';
  const dofLabel = (j, dof) => (dof === 'pos' ? 'Weg' : dof === 'u' ? 'Quer (U)' : dof === 'v' ? 'Längs (V)' : dof === 'rx' ? 'Drehen X' : dof === 'ry' ? 'Drehen Y' : (slide(j) ? 'Weg' : 'Winkel'));
  function rangeKeysFor(j, dof) {
    if (dof === 'pos') return ['minPos', 'maxPos', -20, 20];
    if (dof === 'u') return ['minU', 'maxU', -20, 20];
    if (dof === 'v') return ['minV', 'maxV', -20, 20];
    if (dof === 'rx') return ['minRx', 'maxRx', -180, 180];
    if (dof === 'ry') return ['minRy', 'maxRy', -180, 180];
    return slide(j) ? ['min', 'max', -20, 20] : ['min', 'max', -180, 180];
  }
  function clampDofVal(j, dof, val) {
    const [loK, hiK, dLo, dHi] = rangeKeysFor(j, dof);
    const lo = Number.isFinite(j[loK]) ? j[loK] : dLo;
    const hi = Number.isFinite(j[hiK]) ? j[hiK] : dHi;
    return j.stopsLocked ? clamp(val, lo, hi) : val;
  }
  function ensureRangeFor(j, dof, val) {
    if (!j || j.stopsLocked || !Number.isFinite(val)) return;
    const [loK, hiK, dLo, dHi] = rangeKeysFor(j, dof);
    if (!Number.isFinite(j[loK])) j[loK] = dLo;
    if (!Number.isFinite(j[hiK])) j[hiK] = dHi;
    if (val < j[loK]) j[loK] = round(Math.floor(val), 2);
    if (val > j[hiK]) j[hiK] = round(Math.ceil(val), 2);
  }
  function parseRatio(val) {
    if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? val : NaN;
    const s = String(val ?? '').trim();
    if (!s) return NaN;
    const m = s.match(/^([^:/]+)\s*[:/]\s*([^:/]+)$/);
    if (m) {
      const a = parseNum(m[1]), b = parseNum(m[2]);
      return Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0 ? a / b : NaN;
    }
    return parseNum(s);
  }
  function rackPitchDia(c) {
    if (c && c.mode === 'module') {
      const m = Number(c.module), z = Number(c.z1);
      if (m > 0 && z > 0) return round(m * z, 6);
    }
    const d = Number(c && c.d);
    return d > 0 ? d : 20;
  }
  function couplingHelpKey(k) {
    if (k === 'gear') return 'coupleGear';
    if (k === 'rack') return 'coupleRack';
    if (k === 'belt') return 'coupleBelt';
    if (k === 'linear') return 'coupleLinear';
    if (k === 'cam') return 'coupleCam';
    return 'coupleScrew';
  }
  function couplingGain(c) {
    if (!c) return 1;
    const dir = c.reverse ? -1 : 1;
    if (c.kind === 'gear') {
      if (c.mode === 'ratio') {
        const r = Number(c.ratio);
        return dir * (r > 0 ? r : 1);
      }
      const a = Number(c.z1), b = Number(c.z2);
      return dir * (a > 0 && b > 0 ? a / b : 1);
    }
    if (c.kind === 'rack') {
      return dir * ((Math.PI * rackPitchDia(c)) / 360);
    }
    if (c.kind === 'screw') {
      const p = Number(c.pitch);
      return dir * ((p > 0 ? p : 1) / 360);
    }
    if (c.kind === 'belt') {
      const a = c.mode === 'diameter' ? Number(c.d1) : Number(c.z1);
      const b = c.mode === 'diameter' ? Number(c.d2) : Number(c.z2);
      return dir * (a > 0 && b > 0 ? a / b : 1);
    }
    if (c.kind === 'linear') {
      const r = Number(c.ratio);
      return dir * (r > 0 ? r : 1);
    }
    return 1;
  }

  // ---------- Kurvenscheibe / Nocken (BG-15) ----------
  const camCache = new Map();
  function invalidateCamCache(itemId = null) {
    if (itemId == null) { camCache.clear(); return; }
    for (const k of camCache.keys()) {
      if (k.startsWith(itemId + '|') || k.includes('|' + itemId + '|')) camCache.delete(k);
    }
  }
  function followerDirOf(j, dof) {
    if (isPlanar(j)) {
      const pf = planeFrame(j);
      return (dof === 'v' ? pf.v : pf.u).clone().normalize();
    }
    return new THREE.Vector3(...(j && j.ad ? j.ad : [1, 0, 0])).normalize();
  }
  function camBasis(doc, c, j1, j2) {
    if (!j1 || !j2 || !Array.isArray(j1.ao) || !Array.isArray(j1.ad)) return { valid: false, cosA: 0 };
    const o = new THREE.Vector3(...j1.ao);
    const z = new THREE.Vector3(...j1.ad).normalize();
    const dFol = followerDirOf(j2, c.dof2);
    const sign = c.reverse ? -1 : 1;
    const uOut = dFol.clone().multiplyScalar(sign);
    const xRaw = uOut.clone().addScaledVector(z, -uOut.dot(z));
    const cosA = xRaw.length();
    if (cosA < 1e-4) return { valid: false, o, z, dFol, sign, cosA: 0 };
    const x = xRaw.divideScalar(cosA);
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return { valid: true, o, z, x, y, dFol, sign, cosA };
  }
  function camZeroWorldMatrix(doc, j1) {
    const Wcur = Model.worldMatrix(doc, j1.b);
    const curAng = Number(stateOf(j1).ang) || 0;
    if (Math.abs(curAng) < 1e-9) return Wcur.clone();
    const o = new THREE.Vector3(...(j1.ao || [0, 0, 0]));
    const d = new THREE.Vector3(...(j1.ad || [0, 0, 1])).normalize();
    return rotAbout(o, d, -curAng).multiply(Wcur);
  }
  function convexHull2D(pts) {
    if (!pts || pts.length <= 2) return pts ? pts.slice() : [];
    const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const p of sorted) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    const hi = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
      hi.push(p);
    }
    lo.pop();
    hi.pop();
    return lo.concat(hi);
  }
  function itemBoxWorld(doc, itemId) {
    if (typeof Actions !== 'undefined' && Actions.worldBox) {
      const wb = Actions.worldBox(itemId);
      if (wb && !wb.isEmpty()) return wb;
    }
    const it = top(itemId, doc);
    if (!it) return null;
    const lb = Model.itemLocalBox(it, Model.vars(doc).v);
    if (!lb) return null;
    return new THREE.Box3(new THREE.Vector3(lb[0], lb[1], lb[2]), new THREE.Vector3(lb[3], lb[4], lb[5])).applyMatrix4(Model.worldMatrix(doc, itemId));
  }
  function boxZRange(box, o, z) {
    if (!box || box.isEmpty()) return null;
    const xs = [box.min.x, box.max.x], ys = [box.min.y, box.max.y], zs = [box.min.z, box.max.z];
    let lo = Infinity, hi = -Infinity;
    for (const bx of xs) for (const by of ys) for (const bz of zs) {
      const zv = (bx - o.x) * z.x + (by - o.y) * z.y + (bz - o.z) * z.z;
      if (zv < lo) lo = zv;
      if (zv > hi) hi = zv;
    }
    return [lo - 0.5, hi + 0.5];
  }
  function extractCam2D(doc, camId, W0, basis, folId) {
    const { o, x, y, z } = basis;
    const we = W0.elements;
    const toUVZ = (lx, ly, lz) => {
      const wx = we[0] * lx + we[4] * ly + we[8] * lz + we[12] - o.x;
      const wy = we[1] * lx + we[5] * ly + we[9] * lz + we[13] - o.y;
      const wz = we[2] * lx + we[6] * ly + we[10] * lz + we[14] - o.z;
      return [
        wx * x.x + wy * x.y + wz * x.z,
        wx * y.x + wy * y.y + wz * y.z,
        wx * z.x + wy * z.y + wz * z.z,
      ];
    };
    const folBox = folId ? itemBoxWorld(doc, folId) : null;
    const zRange = boxZRange(folBox, o, z);
    const res = App.results.get(camId);
    const vNode = (!res || !res.data) && typeof Viewer !== 'undefined' ? Viewer.nodes.get(camId) : null;
    const data = (res && res.data) || (vNode && vNode.data) || null;
    if (data && data.vertices && data.triangles && data.triangles.length >= 3) {
      const V = data.vertices, T = data.triangles;
      const nV = Math.floor(V.length / 3);
      const U = new Float64Array(nV), W = new Float64Array(nV), Z = new Float64Array(nV);
      for (let i = 0; i < nV; i++) {
        const p = toUVZ(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
        U[i] = p[0]; W[i] = p[1]; Z[i] = p[2];
      }
      const collect = (useZ) => {
        const pts = [], segs = [];
        const zLo = useZ && zRange ? zRange[0] : -Infinity;
        const zHi = useZ && zRange ? zRange[1] : Infinity;
        const groups = Array.isArray(data.faceGroups) && data.faceGroups.length ? data.faceGroups : [[0, T.length, -1]];
        const faces = data.faces || [];
        for (const [start, count, fi] of groups) {
          const f = fi >= 0 ? faces[fi] : null;
          let cyl = null;
          if (f && f.t === 'CYLINDRE' && Array.isArray(f.axis) && f.r > 0) {
            const cDir = new THREE.Vector3(f.axis[3], f.axis[4], f.axis[5]).transformDirection(W0).normalize();
            if (Math.abs(cDir.dot(z)) > 0.995) {
              const { l, d } = cylPointOnAxis(f);
              const c2 = toUVZ(l.x, l.y, l.z);
              const refLocal = Math.abs(d.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
              const perpLocal = new THREE.Vector3().crossVectors(d, refLocal).normalize();
              const sc = perpLocal.clone().applyMatrix4(W0).sub(new THREE.Vector3().applyMatrix4(W0)).length();
              cyl = { cx: c2[0], cy: c2[1], r: f.r * (sc > 1e-6 ? sc : 1) };
            }
          }
          const end = Math.min(T.length, start + count);
          for (let i = start; i + 2 < end; i += 3) {
            const a = T[i], b = T[i + 1], c = T[i + 2];
            if (useZ && (Math.max(Z[a], Z[b], Z[c]) < zLo || Math.min(Z[a], Z[b], Z[c]) > zHi)) continue;
            if (cyl) {
              for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                const aP = Math.atan2(W[p] - cyl.cy, U[p] - cyl.cx);
                const aQ = Math.atan2(W[q] - cyl.cy, U[q] - cyl.cx);
                const da = Math.atan2(Math.sin(aQ - aP), Math.cos(aQ - aP));
                if (Math.abs(da) > 0.015) {
                  const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 180)));
                  let px = cyl.cx + cyl.r * Math.cos(aP), py = cyl.cy + cyl.r * Math.sin(aP);
                  pts.push([px, py]);
                  for (let s = 1; s <= steps; s++) {
                    const ang = aP + (da * s) / steps;
                    const nx = cyl.cx + cyl.r * Math.cos(ang), ny = cyl.cy + cyl.r * Math.sin(ang);
                    segs.push([px, py, nx, ny]);
                    pts.push([nx, ny]);
                    px = nx; py = ny;
                  }
                } else if (Math.hypot(U[q] - U[p], W[q] - W[p]) > 1e-6) {
                  segs.push([U[p], W[p], U[q], W[q]]);
                  pts.push([U[p], W[p]], [U[q], W[q]]);
                }
              }
            } else {
              for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                if (Math.hypot(U[q] - U[p], W[q] - W[p]) > 1e-6) {
                  segs.push([U[p], W[p], U[q], W[q]]);
                  pts.push([U[p], W[p]]);
                }
              }
            }
          }
        }
        return { pts, segs };
      };
      let out = zRange ? collect(true) : collect(false);
      if (zRange && out.segs.length < 3) out = collect(false);
      if (out.segs.length >= 3) return { pts: out.pts, segs: out.segs, dataKey: (res && res.key) || 'mesh' };
    }

    // Analytischer Fallback, falls das Kern-Netz noch nicht berechnet wurde
    const it = top(camId, doc);
    const vars = Model.vars(doc).v;
    const pts = [], segs = [];
    const pushSeg = (M, ax, ay, az, bx, by, bz) => {
      const p1 = new THREE.Vector3(ax, ay, az).applyMatrix4(M);
      const p2 = new THREE.Vector3(bx, by, bz).applyMatrix4(M);
      const a = toUVZ(p1.x, p1.y, p1.z), b = toUVZ(p2.x, p2.y, p2.z);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) {
        segs.push([a[0], a[1], b[0], b[1]]);
        pts.push([a[0], a[1]], [b[0], b[1]]);
      }
    };
    const collectFallback = (item, M) => {
      if (!item || item.role === 'hole' || item.suppressed) return;
      if (item.kind === 'group' && Array.isArray(item.children)) {
        for (const ch of item.children) collectFallback(ch, M.clone().multiply(Model.localMatrix(ch)));
        return;
      }
      if (item.kind === 'cylinder' || item.kind === 'tube') {
        const r = Math.max(0.1, Model.num(item.p && item.p.d, vars, 20) / 2);
        const N = 360;
        for (let i = 0; i < N; i++) {
          const a0 = (i * 2 * Math.PI) / N, a1 = ((i + 1) * 2 * Math.PI) / N;
          pushSeg(M, r * Math.cos(a0), r * Math.sin(a0), 0, r * Math.cos(a1), r * Math.sin(a1), 0);
        }
        return;
      }
      if (item.kind === 'box') {
        const hw = Math.max(0.1, Model.num(item.p && item.p.w, vars, 20) / 2);
        const hd = Math.max(0.1, Model.num(item.p && item.p.d, vars, 20) / 2);
        pushSeg(M, -hw, -hd, 0, hw, -hd, 0);
        pushSeg(M, hw, -hd, 0, hw, hd, 0);
        pushSeg(M, hw, hd, 0, -hw, hd, 0);
        pushSeg(M, -hw, hd, 0, -hw, -hd, 0);
        return;
      }
      if (item.kind === 'extrude' && item.p && item.p.sketch && typeof SK !== 'undefined' && SK.segsOf) {
        const sk = item.p.sketch;
        const pl = sk.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
        const po = new THREE.Vector3(...(pl.o || [0, 0, 0]));
        const px = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize();
        const pn = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize();
        const py = new THREE.Vector3().crossVectors(pn, px).normalize();
        const to3 = (pt) => po.clone().addScaledVector(px, pt[0]).addScaledVector(py, pt[1]);
        for (const sg of SK.segsOf(sk.ents || [])) {
          if (!sg || sg.con || !sg.a || !sg.b) continue;
          const pa = to3(sg.a), pb = to3(sg.b);
          pushSeg(M, pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        }
        if (segs.length >= 3) return;
      }
      const lb = Model.itemLocalBox(item, vars);
      if (lb) {
        const [x0, y0, z0, x1, y1, z1] = lb;
        for (const zv of [z0, z1]) {
          pushSeg(M, x0, y0, zv, x1, y0, zv);
          pushSeg(M, x1, y0, zv, x1, y1, zv);
          pushSeg(M, x1, y1, zv, x0, y1, zv);
          pushSeg(M, x0, y1, zv, x0, y0, zv);
        }
      }
    };
    collectFallback(it, new THREE.Matrix4());
    return { pts, segs, dataKey: 'fb:' + (it ? it.kind : '') + ':' + JSON.stringify((it && it.p) || {}) };
  }
  function sampleCamCurve(pts, segs, contact, rollerR) {
    const flatSamples = new Float64Array(360);
    const hull = convexHull2D(pts);
    if (hull.length) {
      for (let k = 0; k < 360; k++) {
        const c = CAM_COS[k], s = CAM_SIN[k];
        let mx = -Infinity;
        for (let i = 0; i < hull.length; i++) {
          const u = hull[i][0] * c - hull[i][1] * s;
          if (u > mx) mx = u;
        }
        flatSamples[k] = mx > -Infinity ? mx : 0;
      }
    }
    if (contact === 'flat') return flatSamples;

    const maxPos = new Float64Array(360).fill(-Infinity);
    const maxLine = new Float64Array(360).fill(-Infinity);
    const testDeg = (kk, x1, y1, x2, y2) => {
      const c = CAM_COS[kk], s = CAM_SIN[kk];
      const v1 = x1 * s + y1 * c, v2 = x2 * s + y2 * c;
      if ((v1 <= 1e-9 && v2 >= -1e-9) || (v1 >= -1e-9 && v2 <= 1e-9)) {
        const denom = v2 - v1;
        if (Math.abs(denom) < 1e-12) {
          for (const u of [x1 * c - y1 * s, x2 * c - y2 * s]) {
            if (u > maxLine[kk]) maxLine[kk] = u;
            if (u >= -1e-6 && u > maxPos[kk]) maxPos[kk] = u;
          }
        } else {
          const t = clamp(-v1 / denom, 0, 1);
          const u = (x1 * c - y1 * s) * (1 - t) + (x2 * c - y2 * s) * t;
          if (u > maxLine[kk]) maxLine[kk] = u;
          if (u >= -1e-6 && u > maxPos[kk]) maxPos[kk] = u;
        }
      }
    };
    for (let i = 0; i < segs.length; i++) {
      const [x1, y1, x2, y2] = segs[i];
      const a1 = Math.atan2(y1, x1), a2 = Math.atan2(y2, x2);
      const da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
      if (Math.abs(da) > Math.PI - 0.05) {
        for (let k = 0; k < 360; k++) testDeg(k, x1, y1, x2, y2);
      } else {
        const loRad = Math.min(a1, a1 + da), hiRad = Math.max(a1, a1 + da);
        const dLo = Math.floor((-hiRad * 180) / Math.PI) - 1;
        const dHi = Math.ceil((-loRad * 180) / Math.PI) + 1;
        for (let d = dLo; d <= dHi; d++) {
          const k = ((d % 360) + 360) % 360;
          testDeg(k, x1, y1, x2, y2);
          testDeg((k + 180) % 360, x1, y1, x2, y2);
        }
      }
    }
    const baseSamples = new Float64Array(360);
    for (let k = 0; k < 360; k++) {
      baseSamples[k] = maxPos[k] > -Infinity ? maxPos[k] : (maxLine[k] > -Infinity ? maxLine[k] : flatSamples[k]);
    }
    if (!(rollerR > 1e-6)) return baseSamples;

    // Rollenstößel (Rollenradius > 0): Hüllkurve aus Konturpunkten und -segmenten mit Abstand R_r
    const cPts = new Array(360);
    for (let i = 0; i < 360; i++) cPts[i] = [baseSamples[i] * CAM_COS[i], -baseSamples[i] * CAM_SIN[i]];
    const r2 = rollerR * rollerR;
    const rSamples = new Float64Array(360);
    for (let k = 0; k < 360; k++) {
      const c = CAM_COS[k], s = CAM_SIN[k];
      let xcMax = -Infinity;
      for (let i = 0; i < 360; i++) {
        const [px, py] = cPts[i];
        const rx = px * c - py * s, ry = px * s + py * c;
        if (Math.abs(ry) <= rollerR) {
          const xc = rx + Math.sqrt(Math.max(0, r2 - ry * ry));
          if (xc > xcMax) xcMax = xc;
        }
        const [qx, qy] = cPts[(i + 1) % 360];
        const qrx = qx * c - qy * s, qry = qx * s + qy * c;
        const tx = qrx - rx, ty = qry - ry, tl = Math.hypot(tx, ty);
        if (tl > 1e-6) {
          const nx = -ty / tl, ny = tx / tl;
          const ay = ry + ny * rollerR, by = qry + ny * rollerR;
          if ((ay <= 1e-9 && by >= -1e-9) || (ay >= -1e-9 && by <= 1e-9)) {
            const denom = by - ay;
            const t = Math.abs(denom) < 1e-12 ? 0.5 : clamp(-ay / denom, 0, 1);
            const xc = (rx + nx * rollerR) * (1 - t) + (qrx + nx * rollerR) * t;
            if (xc > xcMax) xcMax = xc;
          }
        }
      }
      rSamples[k] = xcMax > -Infinity ? xcMax - rollerR : baseSamples[k];
    }
    return rSamples;
  }
  function camRadiusAt(samples, angDeg) {
    const a = ((Number(angDeg) || 0) % 360 + 360) % 360;
    const i0 = Math.floor(a) % 360;
    const i1 = (i0 + 1) % 360;
    const f = a - Math.floor(a);
    return samples[i0] * (1 - f) + samples[i1] * f;
  }
  function camProfile(doc, c) {
    const j1 = list(doc).find((x) => x.id === c.j1);
    const j2 = list(doc).find((x) => x.id === c.j2);
    const basis = camBasis(doc, c, j1, j2);
    if (!basis.valid) return { valid: false };
    const W0 = camZeroWorldMatrix(doc, j1);
    const res = App.results.get(j1.b);
    const dataKey = (res && res.key) || 'fb';
    const contact = c.contact === 'flat' ? 'flat' : 'point';
    const rollerR = contact === 'point' ? Math.max(0, Number(c.rollerR) || 0) : 0;
    const key = [
      j1.b, j2.b, dataKey,
      j1.ao.map((v) => round(v, 4)).join(','),
      j1.ad.map((v) => round(v, 5)).join(','),
      basis.dFol.toArray().map((v) => round(v, 5)).join(','),
      c.reverse ? '1' : '0', contact, round(rollerR, 4),
      W0.elements.map((v) => round(v, 4)).join(','),
    ].join('|');
    let entry = camCache.get(key);
    if (!entry) {
      const geo2d = extractCam2D(doc, j1.b, W0, basis, j2.b);
      const samples = sampleCamCurve(geo2d.pts, geo2d.segs, contact, rollerR);
      let minR = Infinity, maxR = -Infinity;
      for (let i = 0; i < 360; i++) {
        if (samples[i] < minR) minR = samples[i];
        if (samples[i] > maxR) maxR = samples[i];
      }
      if (!Number.isFinite(minR) || !Number.isFinite(maxR)) { minR = 0; maxR = 0; }
      const stroke = Math.max(0, (maxR - minR) / basis.cosA);
      if (camCache.size >= 64) camCache.clear();
      entry = { valid: true, samples, minR, maxR, stroke, basis, contact, rollerR };
      camCache.set(key, entry);
    }
    const ref1 = Number(c.ref1) || 0;
    const refR = camRadiusAt(entry.samples, ref1);
    return { ...entry, ref1, refR };
  }
  function camLiftAt(doc, c, angDeg) {
    const prof = camProfile(doc, c);
    if (!prof || !prof.valid) return null;
    const r = camRadiusAt(prof.samples, angDeg);
    const lift = (r - prof.minR) / prof.basis.cosA;
    const delta = prof.basis.sign * (r - prof.refR) / prof.basis.cosA;
    const targetPos = (Number(c.ref2) || 0) + delta;
    const angNorm = ((Number(angDeg) || 0) % 360 + 360) % 360;
    return { r, lift, delta, targetPos, stroke: prof.stroke, minR: prof.minR, maxR: prof.maxR, angNorm };
  }
  function camCurveData(cidOrObj, doc = App.doc) {
    const c = typeof cidOrObj === 'string' ? couplingList(doc).find((x) => x.id === cidOrObj) : cidOrObj;
    if (!c || c.kind !== 'cam') return { ok: false, samples: [], stroke: 0 };
    const prof = camProfile(doc, c);
    if (!prof || !prof.valid) return { ok: false, samples: [], stroke: 0 };
    const j1 = list(doc).find((x) => x.id === c.j1);
    const curAng = j1 ? (Number(stateOf(j1)[c.dof1 || 'ang']) || 0) : 0;
    const cur = camLiftAt(doc, c, curAng);
    const samples = [];
    for (let a = 0; a <= 360; a++) {
      const r = prof.samples[a % 360];
      samples.push({ ang: a, r: round(r, 4), lift: round((r - prof.minR) / prof.basis.cosA, 4) });
    }
    return {
      ok: true,
      stroke: round(prof.stroke, 4),
      minR: round(prof.minR, 4),
      maxR: round(prof.maxR, 4),
      curAng,
      curAngNorm: cur ? cur.angNorm : 0,
      curLift: cur ? round(cur.lift, 4) : 0,
      contact: prof.contact,
      rollerR: prof.rollerR,
      samples,
    };
  }
  function couplingsConnected(doc, j1, dof1, j2, dof2) {
    const k1 = j1 + ':' + dof1, k2 = j2 + ':' + dof2;
    if (k1 === k2) return true;
    const seen = new Set([k1]), q = [k1];
    const cs = couplingList(doc);
    while (q.length) {
      const cur = q.shift();
      if (cur === k2) return true;
      for (const c of cs) {
        const a = c.j1 + ':' + c.dof1, b = c.j2 + ':' + c.dof2;
        if (a === cur && !seen.has(b)) { seen.add(b); q.push(b); }
        if (b === cur && !seen.has(a)) { seen.add(a); q.push(a); }
      }
    }
    return false;
  }
  function computeCoupledTargets(doc, startEntries) {
    const cs = couplingList(doc);
    const out = new Map();
    if (!cs.length || !startEntries || !startEntries.length) return out;
    const key = (jid, dof) => jid + ':' + dof;
    const visited = new Set();
    const q = [];
    for (const e of startEntries) {
      if (!e || !e.jid || !e.dof) continue;
      visited.add(key(e.jid, e.dof));
      q.push({ jid: e.jid, dof: e.dof, val: Number(e.val) || 0 });
    }
    while (q.length) {
      const cur = q.shift();
      for (const c of cs) {
        let nj = null, nd = null, nv = 0;
        if (c.kind === 'cam') {
          if (c.j1 === cur.jid && c.dof1 === cur.dof) {
            const lv = camLiftAt(doc, c, cur.val);
            if (!lv) continue;
            nj = c.j2; nd = c.dof2; nv = lv.targetPos;
          }
        } else {
          const g = couplingGain(c);
          if (!Number.isFinite(g) || Math.abs(g) < 1e-12) continue;
          if (c.j1 === cur.jid && c.dof1 === cur.dof) {
            nj = c.j2; nd = c.dof2;
            nv = (Number(c.ref2) || 0) + (cur.val - (Number(c.ref1) || 0)) * g;
          } else if (c.j2 === cur.jid && c.dof2 === cur.dof) {
            nj = c.j1; nd = c.dof1;
            nv = (Number(c.ref1) || 0) + (cur.val - (Number(c.ref2) || 0)) / g;
          }
        }
        if (!nj) continue;
        const nk = key(nj, nd);
        if (visited.has(nk)) continue;
        visited.add(nk);
        const val = round(nv, 5);
        if (!out.has(nj)) out.set(nj, new Map());
        out.get(nj).set(nd, val);
        q.push({ jid: nj, dof: nd, val });
      }
    }
    return out;
  }
  function pickPrimaryDofs(doc, j, patch, prev) {
    const keys = Object.keys(patch || {}).filter((d) => hasDof(j, d));
    const selfCs = couplingList(doc).filter((c) => c.j1 === j.id && c.j2 === j.id);
    if (!selfCs.length) return keys;
    if (keys.includes('ang') && !keys.includes('pos')) return ['ang'];
    if (keys.includes('pos') && !keys.includes('ang')) return ['pos'];
    if (keys.includes('ang') && keys.includes('pos')) {
      return Math.abs((Number(patch.ang) || 0) - prev.ang) > 1e-4 ? ['ang'] : ['pos'];
    }
    return keys;
  }
  function applyTargetsMap(doc, targets, skipJid = null, opts = {}) {
    if (!targets || !targets.size) return;
    const V = Model.vars(doc).v;
    for (const [kjId, dofMap] of targets) {
      if (skipJid && kjId === skipJid) continue;
      const kj = list(doc).find((x) => x.id === kjId);
      if (!kj || isConstraint(kj) || isLoose(kj)) continue;
      const kb = top(kj.b, doc);
      if (!kb || kb.locked) continue;
      syncHome(kb, kj, doc);
      const prevK = stateOf(kj);
      const nextK = { ...prevK };
      for (const [dof, rawVal] of dofMap) {
        if (!hasDof(kj, dof)) continue;
        if (kj.stopsLocked) {
          nextK[dof] = round(clampDofVal(kj, dof, rawVal), 4);
        } else {
          ensureRangeFor(kj, dof, rawVal);
          nextK[dof] = round(rawVal, 4);
        }
      }
      writeState(kj, nextK);
      Model.setFromMatrix(kb, pose(kj, nextK, null, doc));
      if (looseOf(kj.b, doc).length) {
        solvePartConstraints(doc, kj.b, V);
        Object.assign(nextK, stateOf(kj));
      }
      if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
      if (stateChanged(prevK, nextK, kindOf(kj))) moveChain(doc, kj.b, deltaMatrix(kj, prevK, nextK), opts);
    }
  }
  function propagateCouplings(doc, sourceJid, changedDofs, opts = {}) {
    const cs = couplingList(doc);
    if (!cs.length || !changedDofs || !changedDofs.length) return;
    const src = list(doc).find((x) => x.id === sourceJid);
    if (!src) return;
    const st = stateOf(src);
    const seeds = changedDofs.filter((d) => hasDof(src, d)).map((d) => ({ jid: sourceJid, dof: d, val: st[d] }));
    if (!seeds.length) return;
    const targets = computeCoupledTargets(doc, seeds);
    if (opts.includeSelf && targets.has(sourceJid)) {
      const sb = top(src.b, doc);
      if (sb && !sb.locked && !isConstraint(src) && !isLoose(src)) {
        syncHome(sb, src, doc);
        const prevS = stateOf(src);
        const nextS = { ...prevS };
        for (const [dof, rawVal] of targets.get(sourceJid)) {
          if (!hasDof(src, dof)) continue;
          if (src.stopsLocked) nextS[dof] = round(clampDofVal(src, dof, rawVal), 4);
          else { ensureRangeFor(src, dof, rawVal); nextS[dof] = round(rawVal, 4); }
        }
        writeState(src, nextS);
        Model.setFromMatrix(sb, pose(src, nextS, null, doc));
        if (looseOf(src.b, doc).length) {
          solvePartConstraints(doc, src.b, Model.vars(doc).v);
          Object.assign(nextS, stateOf(src));
        }
        if (opts.live && isTop(sb.id, doc)) Viewer.updateNode(sb.id, { matrix: Model.localMatrix(sb) });
        if (stateChanged(prevS, nextS, kindOf(src))) moveChain(doc, src.b, deltaMatrix(src, prevS, nextS), opts);
      }
    }
    applyTargetsMap(doc, targets, sourceJid, opts);
  }
  function pruneInvalidCouplings(doc) {
    if (!doc || !Array.isArray(doc.couplings) || !doc.couplings.length) return false;
    const jMap = new Map(list(doc).map((x) => [x.id, x]));
    const before = doc.couplings.length;
    doc.couplings = doc.couplings.filter((c) => {
      if (!c || !isCouplingKind(c.kind)) return false;
      const j1 = jMap.get(c.j1), j2 = jMap.get(c.j2);
      if (!j1 || !j2 || isConstraint(j1) || isLoose(j1) || isConstraint(j2) || isLoose(j2)) return false;
      return hasDof(j1, c.dof1) && hasDof(j2, c.dof2);
    });
    return doc.couplings.length !== before;
  }

  function autoGearSpec(j, doc = App.doc) {
    const baseV = Model.vars(doc).v;
    const inspect = (it, V) => {
      if (!it) return null;
      if (it.kind === 'part' && it.p && (it.p.lib === 'gear' || it.p.lib === 'internalGear' || it.p.lib === 'wormWheel')) {
        const teeth = Model.num(it.p.teeth, V, 0);
        const rawMod = Model.num(it.p.module, V, 1.5);
        const mod = rawMod > 0 ? rawMod : 1.5;
        if (teeth > 0) return { mode: 'teeth', teeth, module: mod, d: round(teeth * mod, 6) };
      }
      if ((it.kind === 'cylinder' || it.kind === 'tube') && it.p) {
        const d = Model.num(it.p.d, V, 0);
        if (d > 0) return { mode: 'diameter', d };
      }
      if (it.kind === 'group' && Array.isArray(it.children)) {
        const subV = it.partRef ? Model.scopeVars(V, it.partRef) : V;
        for (const ch of it.children) {
          const r = inspect(ch, subV);
          if (r) return r;
        }
      }
      if (it.kind === 'ref' && it.p && it.p.docId && Model.resolveDoc) {
        const rd = Model.resolveDoc(it.p.docId);
        if (rd && Array.isArray(rd.items)) {
          const rV = Model.vars(rd).v;
          for (const ch of rd.items) {
            const r = inspect(ch, rV);
            if (r) return r;
          }
        }
      }
      return null;
    };
    const b = j && top(j.b, doc);
    return inspect(b, baseV);
  }
  function autoBeltSpec(j, doc = App.doc) {
    const s = autoGearSpec(j, doc);
    if (!s) return null;
    if (s.mode === 'teeth' && s.teeth > 0) return { mode: 'teeth', val: s.teeth };
    if (s.mode === 'diameter' && s.d > 0) return { mode: 'diameter', val: s.d };
    return null;
  }
  function couplingSummary(c) {
    if (!c) return '';
    const rev = c.reverse ? ' · ↺' : '';
    if (c.kind === 'gear') {
      return c.mode === 'ratio'
        ? `${T('joint.gearKind')} · ${fmt(c.ratio)}×${rev}`
        : `${T('joint.gearKind')} · ${fmt(c.z1)}:${fmt(c.z2)}${rev}`;
    }
    if (c.kind === 'rack') {
      const d = rackPitchDia(c);
      return c.mode === 'module'
        ? `${T('joint.rackKind')} · m${fmt(c.module)} · ${fmt(c.z1)}Z (Ø ${fmt(d)})${rev}`
        : `${T('joint.rackKind')} · Ø ${fmt(d)} mm${rev}`;
    }
    if (c.kind === 'screw') return `${T('joint.screwKind')} · ${fmt(c.pitch)} mm/U${rev}`;
    if (c.kind === 'belt') {
      return c.mode === 'diameter'
        ? `${T('joint.beltKind')} · Ø ${fmt(c.d1)}:${fmt(c.d2)}${rev}`
        : `${T('joint.beltKind')} · ${fmt(c.z1)}:${fmt(c.z2)}${rev}`;
    }
    if (c.kind === 'cam') {
      const prof = camProfile(App.doc, c);
      const st = prof && prof.valid ? Units.fmtLenU(prof.stroke, 1) : '—';
      return `${T('joint.camKind')} · ${T('joint.camStrokeLabel')} ${st}${rev}`;
    }
    return `${T('joint.linearKind')} · ${fmt(c.ratio)}×${rev}`;
  }
  function couplingLabel(c) {
    if (c && c.name) return c.name;
    const j1 = list().find((x) => x.id === c.j1);
    const j2 = list().find((x) => x.id === c.j2);
    const l1 = j1 ? jointLabel(j1) : 'Gelenk 1';
    const l2 = j2 ? jointLabel(j2) : 'Gelenk 2';
    return j1 && j2 && j1.id === j2.id ? `${l1} (Schraube)` : `${l1} → ${l2}`;
  }

  function addCoupling(kind, j1Id, j2IdOrOpts, maybeOpts) {
    if (!isCouplingKind(kind)) return { ok: false, msg: 'Unbekannte Kopplungsart.' };
    let j2Id = j2IdOrOpts, opts = maybeOpts || {};
    if (j2IdOrOpts && typeof j2IdOrOpts === 'object') {
      opts = j2IdOrOpts;
      j2Id = opts.j2 || j1Id;
    }
    const j1Orig = list().find((x) => x.id === j1Id);
    let j2Orig = list().find((x) => x.id === (j2Id || j1Id));
    if (kind === 'screw' && !j2Id && j1Orig && isCyl(j1Orig)) j2Orig = j1Orig;
    if (!j1Orig || !j2Orig) return { ok: false, msg: 'Bitte gültige Gelenke für die Kopplung wählen.' };
    if (isConstraint(j1Orig) || isLoose(j1Orig) || isConstraint(j2Orig) || isLoose(j2Orig)) {
      return { ok: false, msg: 'Kopplungen funktionieren mit beweglichen Gelenken (Drehen, Schieben, Zylindrisch, Eben, Langloch).' };
    }

    let j1 = j1Orig, j2 = j2Orig, dof1 = null, dof2 = null;
    const payload = { kind, reverse: !!(opts.reverse ?? opts.flip) };

    if (kind === 'gear') {
      if (j1Orig.id === j2Orig.id) return { ok: false, msg: 'Für eine Zahnrad-Kopplung zwei verschiedene Drehgelenke wählen.' };
      dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : rotDofOf(j1Orig);
      dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : rotDofOf(j2Orig);
      if (!dof1 || !dof2) return { ok: false, msg: 'Für eine Zahnrad-Kopplung brauchen beide Gelenke eine Drehbewegung.' };
      const hasTeeth = opts.z1 != null || opts.z2 != null || opts.teeth1 != null || opts.teeth2 != null;
      const hasRatio = opts.ratio != null && opts.ratio !== '';
      const mode = opts.mode === 'ratio' || (hasRatio && !hasTeeth && opts.mode !== 'teeth') ? 'ratio' : 'teeth';
      payload.mode = mode;
      if (mode === 'ratio') {
        const ratio = parseRatio(opts.ratio ?? 0.5);
        if (!Number.isFinite(ratio) || ratio <= 0) {
          return { ok: false, msg: 'Bitte ein Übersetzungsverhältnis größer als 0 eingeben (z. B. 1:2 oder 0,5).' };
        }
        payload.ratio = round(ratio, 6);
      } else {
        const s1 = autoGearSpec(j1Orig), s2 = autoGearSpec(j2Orig);
        const z1 = parseNum(opts.z1 ?? opts.teeth1 ?? (s1 && s1.teeth) ?? 20);
        const z2 = parseNum(opts.z2 ?? opts.teeth2 ?? (s2 && s2.teeth) ?? 40);
        if (!Number.isFinite(z1) || z1 <= 0 || !Number.isFinite(z2) || z2 <= 0) {
          return { ok: false, msg: 'Bitte eine Zähnezahl größer als 0 für beide Zahnräder eingeben.' };
        }
        payload.z1 = round(z1, 4);
        payload.z2 = round(z2, 4);
      }
    } else if (kind === 'rack') {
      if (j1Orig.id === j2Orig.id) return { ok: false, msg: 'Für eine Zahnstangen-Kopplung zwei verschiedene Gelenke (Drehen + Schieben) wählen.' };
      if (rotDofOf(j1Orig) && linDofOf(j2Orig)) {
        dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : rotDofOf(j1Orig);
        dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : linDofOf(j2Orig);
      } else if (rotDofOf(j2Orig) && linDofOf(j1Orig)) {
        j1 = j2Orig; j2 = j1Orig;
        dof1 = rotDofOf(j1);
        dof2 = linDofOf(j2);
      } else {
        return { ok: false, msg: 'Für eine Zahnstangen-Kopplung braucht ein Gelenk Drehung (Ritzel) und das andere Schieben (Zahnstange).' };
      }
      const s1 = autoGearSpec(j1);
      const hasDia = opts.d != null || opts.diameter != null || opts.pitchDiameter != null;
      const hasMod = opts.module != null || opts.m != null || opts.z1 != null || opts.teeth != null || opts.z != null;
      const mode = opts.mode === 'module'
        || (hasMod && !hasDia && opts.mode !== 'diameter')
        || (!hasDia && !hasMod && opts.mode !== 'diameter' && s1 && s1.teeth > 0 && s1.module > 0)
        ? 'module'
        : 'diameter';
      payload.mode = mode;
      if (mode === 'module') {
        const mod = parseNum(opts.module ?? opts.m ?? (s1 && s1.module) ?? 1.5);
        const z1 = parseNum(opts.z1 ?? opts.teeth ?? opts.z ?? (s1 && s1.teeth) ?? 20);
        if (!Number.isFinite(mod) || mod <= 0 || !Number.isFinite(z1) || z1 <= 0) {
          return { ok: false, msg: 'Bitte Modul und Zähnezahl größer als 0 für das Ritzel eingeben.' };
        }
        payload.module = round(mod, 6);
        payload.z1 = round(z1, 4);
        payload.d = round(mod * z1, 6);
      } else {
        const d = parseNum(opts.d ?? opts.diameter ?? opts.pitchDiameter ?? (s1 && s1.d) ?? 20);
        if (!Number.isFinite(d) || d <= 0) {
          return { ok: false, msg: 'Bitte einen Teilkreis-Durchmesser größer als 0 mm eingeben.' };
        }
        payload.d = round(d, 6);
      }
    } else if (kind === 'screw') {
      const pitch = parseNum(opts.pitch ?? 2);
      if (!Number.isFinite(pitch) || pitch <= 0) return { ok: false, msg: 'Bitte eine Steigung größer als 0 mm eingeben.' };
      if (j1Orig.id === j2Orig.id) {
        if (!rotDofOf(j1Orig) || !linDofOf(j1Orig)) return { ok: false, msg: 'Ein einzelnes Gelenk braucht Drehen und Schieben zugleich (z. B. Zylindrisch) – sonst zwei Gelenke wählen.' };
        dof1 = rotDofOf(j1Orig);
        dof2 = linDofOf(j1Orig, opts.dof2);
      } else {
        if (rotDofOf(j1Orig) && linDofOf(j2Orig)) {
          dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : rotDofOf(j1Orig);
          dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : linDofOf(j2Orig);
        } else if (rotDofOf(j2Orig) && linDofOf(j1Orig)) {
          j1 = j2Orig; j2 = j1Orig;
          dof1 = rotDofOf(j1);
          dof2 = linDofOf(j2);
        } else {
          return { ok: false, msg: 'Für eine Schrauben-Kopplung braucht ein Gelenk Drehung und das andere Schieben (oder ein zylindrisches Gelenk).' };
        }
      }
      payload.pitch = round(pitch, 6);
    } else if (kind === 'belt') {
      if (j1Orig.id === j2Orig.id) return { ok: false, msg: 'Für eine Riemen-Kopplung zwei verschiedene Drehgelenke wählen.' };
      dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : rotDofOf(j1Orig);
      dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : rotDofOf(j2Orig);
      if (!dof1 || !dof2) return { ok: false, msg: 'Für eine Riemen-Kopplung brauchen beide Gelenke eine Drehbewegung.' };
      const hasDia = opts.d1 != null || opts.d2 != null;
      const hasTeeth = opts.z1 != null || opts.z2 != null || opts.teeth1 != null || opts.teeth2 != null;
      const mode = opts.mode === 'diameter' || (hasDia && !hasTeeth && opts.mode !== 'teeth') ? 'diameter' : 'teeth';
      payload.mode = mode;
      if (mode === 'diameter') {
        const d1 = parseNum(opts.d1 ?? 20), d2 = parseNum(opts.d2 ?? 40);
        if (!Number.isFinite(d1) || d1 <= 0 || !Number.isFinite(d2) || d2 <= 0) {
          return { ok: false, msg: 'Bitte Durchmesser größer als 0 mm für beide Räder eingeben.' };
        }
        payload.d1 = round(d1, 6);
        payload.d2 = round(d2, 6);
      } else {
        const z1 = parseNum(opts.z1 ?? opts.teeth1 ?? 20), z2 = parseNum(opts.z2 ?? opts.teeth2 ?? 40);
        if (!Number.isFinite(z1) || z1 <= 0 || !Number.isFinite(z2) || z2 <= 0) {
          return { ok: false, msg: 'Bitte eine Zähnezahl größer als 0 für beide Räder eingeben.' };
        }
        payload.z1 = round(z1, 4);
        payload.z2 = round(z2, 4);
      }
    } else if (kind === 'linear') {
      if (j1Orig.id === j2Orig.id) return { ok: false, msg: 'Für eine lineare Kopplung zwei verschiedene Schiebegelenke wählen.' };
      dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : linDofOf(j1Orig);
      dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : linDofOf(j2Orig);
      if (!dof1 || !dof2) return { ok: false, msg: 'Für eine lineare Kopplung brauchen beide Gelenke eine Schiebebewegung.' };
      const ratio = parseNum(opts.ratio ?? 1);
      if (!Number.isFinite(ratio) || ratio <= 0) return { ok: false, msg: 'Bitte ein Übersetzungsverhältnis größer als 0 eingeben.' };
      payload.ratio = round(ratio, 6);
    } else if (kind === 'cam') {
      if (j1Orig.id === j2Orig.id) return { ok: false, msg: 'Für eine Kurvenscheibe zwei verschiedene Gelenke wählen (Scheibe + Stößel).' };
      if (rotDofOf(j1Orig) && linDofOf(j2Orig)) {
        dof1 = opts.dof1 && hasDof(j1Orig, opts.dof1) ? opts.dof1 : rotDofOf(j1Orig);
        dof2 = opts.dof2 && hasDof(j2Orig, opts.dof2) ? opts.dof2 : linDofOf(j2Orig);
      } else if (rotDofOf(j2Orig) && linDofOf(j1Orig)) {
        j1 = j2Orig; j2 = j1Orig;
        dof1 = rotDofOf(j1);
        dof2 = linDofOf(j2);
      } else {
        return { ok: false, msg: 'Eine Kurvenscheibe verbindet ein Drehgelenk (Scheibe) mit einem Schiebegelenk (Stößel).' };
      }
      const bTest = camBasis(App.doc, { dof2, reverse: false }, j1, j2);
      if (!bTest.valid || bTest.cosA < 0.1) {
        return { ok: false, msg: 'Die Schieberichtung des Stößels muss quer zur Drehachse der Scheibe liegen.' };
      }
      if (opts.reverse === undefined && opts.flip === undefined) {
        const fBox = itemBoxWorld(App.doc, j2.b);
        const fCtr = fBox ? fBox.getCenter(new THREE.Vector3()) : new THREE.Vector3(...(j2.ao || [0, 0, 0]));
        const dotSide = fCtr.sub(bTest.o).dot(bTest.dFol);
        payload.reverse = dotSide < -1e-4;
      }
      payload.contact = opts.contact === 'flat' ? 'flat' : 'point';
      const rr = parseNum(opts.rollerR ?? 0);
      payload.rollerR = Number.isFinite(rr) && rr > 0 ? round(rr, 4) : 0;
    }

    if (couplingsConnected(App.doc, j1.id, dof1, j2.id, dof2)) {
      return { ok: false, msg: 'Diese beiden Bewegungen sind bereits über Kopplungen miteinander verbunden.' };
    }

    let cid = null;
    const undoLbl = kind === 'gear' ? 'Zahnrad-Kopplung angelegt'
      : kind === 'rack' ? 'Zahnstangen-Kopplung angelegt'
        : kind === 'screw' ? 'Schrauben-Kopplung angelegt'
          : kind === 'belt' ? 'Riemen-Kopplung angelegt'
            : kind === 'cam' ? 'Kurvenscheibe angelegt' : 'Lineare Kopplung angelegt';
    App.change(undoLbl, (doc) => {
      const dj1 = list(doc).find((x) => x.id === j1.id);
      const dj2 = list(doc).find((x) => x.id === j2.id);
      if (!dj1 || !dj2) return false;
      doc.couplings = doc.couplings || [];
      cid = uid('c');
      const idx = doc.couplings.length + 1;
      const baseName = kind === 'gear' ? `Zahnrad ${idx}`
        : kind === 'rack' ? `Zahnstange ${idx}`
          : kind === 'screw' ? `Schraube ${idx}`
            : kind === 'belt' ? `Riemen ${idx}`
              : kind === 'cam' ? `Kurvenscheibe ${idx}` : `Linear ${idx}`;
      const ref1 = round(stateOf(dj1)[dof1] || 0, 5);
      const ref2 = round(stateOf(dj2)[dof2] || 0, 5);
      if ((kind === 'screw' || kind === 'belt' || kind === 'gear' || kind === 'rack' || kind === 'cam') && !dj1.stopsLocked && dof1 === 'ang' && !slide(dj1)) {
        dj1.min = Math.min(dj1.min ?? -180, -360);
        dj1.max = Math.max(dj1.max ?? 180, 360);
      }
      if ((kind === 'belt' || kind === 'gear') && !dj2.stopsLocked && dof2 === 'ang' && !slide(dj2)) {
        dj2.min = Math.min(dj2.min ?? -180, -360);
        dj2.max = Math.max(dj2.max ?? 180, 360);
      }
      const entry = {
        id: cid,
        name: opts.name || baseName,
        j1: dj1.id,
        j2: dj2.id,
        dof1,
        dof2,
        ref1,
        ref2,
        ...payload,
      };
      doc.couplings.push(entry);
      if (kind === 'cam') {
        const prof = camProfile(doc, entry);
        if (prof && prof.valid) {
          if (opts.snapContact) {
            const fb = itemBoxWorld(doc, dj2.b);
            if (fb) {
              const rCur = camRadiusAt(prof.samples, ref1);
              let folMinX = Infinity;
              for (const bx of [fb.min.x, fb.max.x]) for (const by of [fb.min.y, fb.max.y]) for (const bz of [fb.min.z, fb.max.z]) {
                const vx = (bx - prof.basis.o.x) * prof.basis.x.x + (by - prof.basis.o.y) * prof.basis.x.y + (bz - prof.basis.o.z) * prof.basis.x.z;
                if (vx < folMinX) folMinX = vx;
              }
              if (Number.isFinite(folMinX)) {
                entry.ref2 = round(entry.ref2 + prof.basis.sign * (rCur - folMinX) / prof.basis.cosA, 5);
                propagateCouplings(doc, dj1.id, [dof1], { includeSelf: true });
              }
            }
          }
          if (!dj2.stopsLocked) {
            ensureRangeFor(dj2, dof2, entry.ref2 - prof.stroke);
            ensureRangeFor(dj2, dof2, entry.ref2 + prof.stroke);
          }
        }
      }
    });
    if (cid) drawSelectedJoint();
    return cid ? { ok: true, id: cid } : { ok: false, msg: 'Die Kopplung ließ sich nicht anlegen.' };
  }
  function addGear(j1Id, j2Id, opts = {}) { return addCoupling('gear', j1Id, j2Id, opts); }
  function addRack(j1Id, j2Id, opts = {}) { return addCoupling('rack', j1Id, j2Id, opts); }
  function addScrew(j1Id, j2IdOrOpts, maybeOpts) { return addCoupling('screw', j1Id, j2IdOrOpts, maybeOpts); }
  function addBelt(j1Id, j2Id, opts = {}) { return addCoupling('belt', j1Id, j2Id, opts); }
  function addLinear(j1Id, j2Id, opts = {}) { return addCoupling('linear', j1Id, j2Id, opts); }
  function addCam(j1Id, j2Id, opts = {}) { return addCoupling('cam', j1Id, j2Id, opts); }

  function snapCamContact(cid) {
    const cur = couplingList().find((x) => x.id === cid && x.kind === 'cam');
    if (!cur) return false;
    const prof = camProfile(App.doc, cur);
    if (!prof || !prof.valid) return false;
    const j1 = list().find((x) => x.id === cur.j1);
    const j2 = list().find((x) => x.id === cur.j2);
    if (!j1 || !j2) return false;
    const fb = itemBoxWorld(App.doc, j2.b);
    if (!fb) return false;
    const ang = Number(stateOf(j1)[cur.dof1 || 'ang']) || 0;
    const rCur = camRadiusAt(prof.samples, ang);
    let folMinX = Infinity;
    for (const bx of [fb.min.x, fb.max.x]) for (const by of [fb.min.y, fb.max.y]) for (const bz of [fb.min.z, fb.max.z]) {
      const vx = (bx - prof.basis.o.x) * prof.basis.x.x + (by - prof.basis.o.y) * prof.basis.x.y + (bz - prof.basis.o.z) * prof.basis.x.z;
      if (vx < folMinX) folMinX = vx;
    }
    if (!Number.isFinite(folMinX)) return false;
    const dDof = prof.basis.sign * (rCur - folMinX) / prof.basis.cosA;
    const ok = App.change('Stößel an Kontur angelegt', (doc) => {
      const c = couplingList(doc).find((x) => x.id === cid);
      if (!c) return false;
      c.ref2 = round((Number(c.ref2) || 0) + dDof, 5);
      propagateCouplings(doc, c.j1, [c.dof1], { includeSelf: true });
    });
    drawSelectedJoint();
    return ok;
  }

  function updateCoupling(cid, patch, opts = {}) {
    const cur = couplingList().find((x) => x.id === cid);
    if (!cur) return false;
    const checkPos = (v, msg) => {
      const n = parseNum(v);
      if (!Number.isFinite(n) || n <= 0) { UI.toast(msg, { kind: 'bad' }); return null; }
      return n;
    };
    const nextPatch = {};
    if ('name' in patch) nextPatch.name = String(patch.name || '').trim() || cur.name;
    if ('reverse' in patch) nextPatch.reverse = !!patch.reverse;
    if ('pitch' in patch) {
      const p = checkPos(patch.pitch, 'Bitte eine Steigung größer als 0 mm eingeben.');
      if (p == null) return false;
      nextPatch.pitch = round(p, 6);
    }
    if ('mode' in patch) {
      if (cur.kind === 'gear') nextPatch.mode = patch.mode === 'ratio' ? 'ratio' : 'teeth';
      else if (cur.kind === 'rack') nextPatch.mode = patch.mode === 'module' ? 'module' : 'diameter';
      else nextPatch.mode = patch.mode === 'diameter' ? 'diameter' : 'teeth';
    }
    if ('z1' in patch) {
      const z = checkPos(patch.z1, 'Bitte eine Zähnezahl größer als 0 eingeben.');
      if (z == null) return false;
      nextPatch.z1 = round(z, 4);
    }
    if ('z2' in patch) {
      const z = checkPos(patch.z2, 'Bitte eine Zähnezahl größer als 0 eingeben.');
      if (z == null) return false;
      nextPatch.z2 = round(z, 4);
    }
    if ('d1' in patch) {
      const d = checkPos(patch.d1, 'Bitte einen Durchmesser größer als 0 mm eingeben.');
      if (d == null) return false;
      nextPatch.d1 = round(d, 6);
    }
    if ('d2' in patch) {
      const d = checkPos(patch.d2, 'Bitte einen Durchmesser größer als 0 mm eingeben.');
      if (d == null) return false;
      nextPatch.d2 = round(d, 6);
    }
    if ('d' in patch) {
      const d = checkPos(patch.d, 'Bitte einen Teilkreis-Durchmesser größer als 0 mm eingeben.');
      if (d == null) return false;
      nextPatch.d = round(d, 6);
    }
    if ('module' in patch) {
      const m = checkPos(patch.module, 'Bitte einen Modul größer als 0 mm eingeben.');
      if (m == null) return false;
      nextPatch.module = round(m, 6);
    }
    if ('ratio' in patch) {
      const r = parseRatio(patch.ratio);
      if (!Number.isFinite(r) || r <= 0) {
        UI.toast('Bitte ein Übersetzungsverhältnis größer als 0 eingeben.', { kind: 'bad' });
        return false;
      }
      nextPatch.ratio = round(r, 6);
    }
    if ('contact' in patch) nextPatch.contact = patch.contact === 'flat' ? 'flat' : 'point';
    if ('rollerR' in patch) {
      const rr = parseNum(patch.rollerR);
      if (!Number.isFinite(rr) || rr < 0) { UI.toast('Bitte einen Rollenradius ≥ 0 mm eingeben.', { kind: 'bad' }); return false; }
      nextPatch.rollerR = round(rr, 4);
    }
    const label = opts.label || ('reverse' in nextPatch ? 'Kopplungs-Richtung geändert' : 'name' in nextPatch ? 'Kopplung umbenannt' : 'Kopplung geändert');
    const changeOpts = opts.merge ? { merge: opts.merge } : {};
    const ok = App.change(label, (doc) => {
      const c = couplingList(doc).find((x) => x.id === cid);
      if (!c) return false;
      Object.assign(c, nextPatch);
      if (c.kind === 'gear') {
        if (c.mode === 'ratio') {
          if (!(c.ratio > 0)) c.ratio = c.z1 > 0 && c.z2 > 0 ? round(c.z1 / c.z2, 6) : 0.5;
        } else {
          if (!(c.z1 > 0)) c.z1 = 20;
          if (!(c.z2 > 0)) c.z2 = c.ratio > 0 ? round(c.z1 / c.ratio, 4) : 40;
        }
      } else if (c.kind === 'rack') {
        if (c.mode === 'module') {
          if (!(c.module > 0)) c.module = 1.5;
          if (!(c.z1 > 0)) c.z1 = c.d > 0 ? round(c.d / c.module, 4) : 20;
          c.d = round(c.module * c.z1, 6);
        } else {
          if (!(c.d > 0)) c.d = c.module > 0 && c.z1 > 0 ? round(c.module * c.z1, 6) : 20;
        }
      } else if (c.kind === 'belt' && c.mode === 'diameter') {
        if (!(c.d1 > 0)) c.d1 = c.z1 > 0 ? c.z1 : 20;
        if (!(c.d2 > 0)) c.d2 = c.z2 > 0 ? c.z2 : 40;
      } else if (c.kind === 'belt') {
        if (!(c.z1 > 0)) c.z1 = c.d1 > 0 ? c.d1 : 20;
        if (!(c.z2 > 0)) c.z2 = c.d2 > 0 ? c.d2 : 40;
      } else if (c.kind === 'cam') {
        invalidateCamCache();
      }
      propagateCouplings(doc, c.j1, [c.dof1], { includeSelf: true });
    }, changeOpts);
    drawSelectedJoint();
    return ok;
  }

  function removeCoupling(cid) {
    const wasSel = selJoint === cid;
    const ok = App.change('Kopplung gelöst', (doc) => {
      const before = couplingList(doc).length;
      doc.couplings = couplingList(doc).filter((x) => x.id !== cid);
      if (doc.couplings.length === before) return false;
    });
    if (wasSel) { selJoint = null; clearSelVis(); }
    Panels.renderRight();
    Panels.renderLeft();
    if (ok) UI.toast('Kopplung gelöst – beide Gelenke bewegen sich wieder unabhängig.', { icon: 'check' });
    return ok;
  }

  function startCoupling(defaultKind = 'gear', opts = {}) {
    stopPick();
    stopPlay();
    const kinJoints = list().filter((j) => !isConstraint(j) && !isLoose(j) && top(j.a) && top(j.b));
    let kind = isCouplingKind(defaultKind) ? defaultKind : 'gear';
    const selItemId = App.sel.length === 1 ? App.sel[0] : null;
    const selItemJoint = selItemId ? drivingOf(selItemId) : null;
    const preJ1 = opts.j1 || (selJoint && list().some((x) => x.id === selJoint) ? selJoint : null) || (selItemJoint && !isConstraint(selItemJoint) ? selItemJoint.id : null);

    const wrap = h('div', { id: 'coupling-dialog', 'data-help': couplingHelpKey(kind), style: { display: 'grid', gap: '10px' } });
    if (!kinJoints.length) {
      wrap.append(h('div', { class: 'hint-box' }, 'Lege zuerst mindestens ein bewegliches Gelenk an (z. B. Drehen, Schieben oder Zylindrisch), bevor du Bewegungen koppelst.'));
      UI.modal({
        title: T('joint.coupleDlgTitle'),
        body: wrap,
        actions: [{ label: T('common.cancel'), id: 'cp-cancel' }],
      });
      return false;
    }

    const kindSelWrap = UI.selectField({
      id: 'cp-kind',
      label: 'Kopplungsart',
      value: kind,
      options: [
        ['gear', 'Zahnrad – Zahnrad (Drehen → Drehen)'],
        ['rack', 'Zahnrad – Zahnstange (Drehen → Schieben)'],
        ['screw', 'Schraube (Drehen → Vorschub je Umdrehung)'],
        ['belt', 'Riemen (gleiche Umfangsgeschwindigkeit)'],
        ['linear', 'Linear (Schieben → Schieben im Verhältnis)'],
        ['cam', 'Kurvenscheibe / Nocken (Scheibe → Stößel)'],
      ],
      onChange: (v) => { kind = v; wrap.dataset.help = couplingHelpKey(kind); refreshForm(); },
    });
    const j1SelWrap = UI.selectField({ id: 'cp-j1', label: 'Antrieb (Gelenk 1)', value: preJ1 || '', options: [], onChange: () => { populateJ2(); autoDefaults(); updatePreview(); } });
    const j2SelWrap = UI.selectField({ id: 'cp-j2', label: 'Mitlauf (Gelenk 2)', value: opts.j2 || '', options: [], onChange: () => { autoDefaults(); updatePreview(); } });
    const j1Sel = j1SelWrap.querySelector('select');
    const j2Sel = j2SelWrap.querySelector('select');

    const paramsBox = h('div', { style: { display: 'grid', gap: '8px' } });

    const gearInitMode = opts.mode === 'ratio' || (opts.ratio != null && opts.z1 == null && opts.teeth1 == null) ? 'ratio' : 'teeth';
    const gearSubBox = h('div', { style: { display: 'grid', gap: '8px' } });
    const gearModeWrap = UI.selectField({
      id: 'cp-gear-mode',
      label: T('joint.gearModeLabel'),
      value: gearInitMode,
      options: [
        ['teeth', T('joint.gearModeTeeth')],
        ['ratio', T('joint.gearModeRatio')],
      ],
      onChange: () => { syncGearFields(); updatePreview(); },
    });
    const gearModeSel = gearModeWrap.querySelector('select');
    const z1Inp = h('input', { id: 'cp-z1', type: 'text', inputmode: 'decimal', value: String(opts.z1 ?? opts.teeth1 ?? 20) });
    const z2Inp = h('input', { id: 'cp-z2', type: 'text', inputmode: 'decimal', value: String(opts.z2 ?? opts.teeth2 ?? 40) });
    const gearTeethFields = h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cp-z1' }, 'Zahnrad 1 (Zähne)'), h('div', { class: 'inp' }, z1Inp, h('span', { class: 'unit' }, 'Z'))),
      h('div', { class: 'field' }, h('label', { for: 'cp-z2' }, 'Zahnrad 2 (Zähne)'), h('div', { class: 'inp' }, z2Inp, h('span', { class: 'unit' }, 'Z')))
    );
    const gearRatioInp = h('input', { id: 'cp-gear-ratio', type: 'text', value: String(opts.ratio ?? '1:2') });
    const gearRatioWrap = h('div', { class: 'field' }, h('label', { for: 'cp-gear-ratio' }, 'Übersetzung (z. B. 1:2 oder 0,5)'), h('div', { class: 'inp' }, gearRatioInp, h('span', { class: 'unit' }, '×')));

    const rackInitMode = opts.mode === 'module' ? 'module' : 'diameter';
    const rackSubBox = h('div', { style: { display: 'grid', gap: '8px' } });
    const rackModeWrap = UI.selectField({
      id: 'cp-rack-mode',
      label: T('joint.rackModeLabel'),
      value: rackInitMode,
      options: [
        ['diameter', T('joint.rackModeDia')],
        ['module', T('joint.rackModeMod')],
      ],
      onChange: () => { syncRackFields(); updatePreview(); },
    });
    const rackModeSel = rackModeWrap.querySelector('select');
    const rackDInp = h('input', { id: 'cp-rack-d', type: 'text', inputmode: 'decimal', value: String(opts.d ?? 20) });
    const rackDiaWrap = h('div', { class: 'field' }, h('label', { for: 'cp-rack-d' }, `Teilkreis-Ø (${Units.label()})`), h('div', { class: 'inp' }, rackDInp, h('span', { class: 'unit' }, 'mm')));
    const rackModInp = h('input', { id: 'cp-rack-mod', type: 'text', inputmode: 'decimal', value: String(opts.module ?? 1.5) });
    const rackZInp = h('input', { id: 'cp-rack-z', type: 'text', inputmode: 'decimal', value: String(opts.z1 ?? opts.teeth ?? 20) });
    const rackModFields = h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'cp-rack-mod' }, 'Modul (mm)'), h('div', { class: 'inp' }, rackModInp, h('span', { class: 'unit' }, 'mm'))),
      h('div', { class: 'field' }, h('label', { for: 'cp-rack-z' }, 'Ritzel (Zähne)'), h('div', { class: 'inp' }, rackZInp, h('span', { class: 'unit' }, 'Z')))
    );

    const pitchInp = h('input', { id: 'cp-pitch', type: 'text', inputmode: 'decimal', value: String(opts.pitch ?? 2) });
    const pitchWrap = h('div', { class: 'field' }, h('label', { for: 'cp-pitch' }, T('joint.pitchLabel') + ` (${Units.label()}/U)`), h('div', { class: 'inp' }, pitchInp, h('span', { class: 'unit' }, 'mm/U')));

    const beltModeWrap = UI.selectField({
      id: 'cp-belt-mode',
      label: T('joint.beltModeLabel'),
      value: opts.mode || 'teeth',
      options: [
        ['teeth', T('joint.beltModeTeeth')],
        ['diameter', T('joint.beltModeDia')],
      ],
      onChange: () => { syncBeltUnit(); updatePreview(); },
    });
    const beltModeSel = beltModeWrap.querySelector('select');
    const v1Inp = h('input', { id: 'cp-v1', type: 'text', inputmode: 'decimal', value: String(opts.z1 ?? opts.d1 ?? 20) });
    const v2Inp = h('input', { id: 'cp-v2', type: 'text', inputmode: 'decimal', value: String(opts.z2 ?? opts.d2 ?? 40) });
    const v1Lbl = h('label', { for: 'cp-v1' }, 'Rad 1 (Zähne)');
    const v2Lbl = h('label', { for: 'cp-v2' }, 'Rad 2 (Zähne)');
    const v1Unit = h('span', { class: 'unit' }, 'Z');
    const v2Unit = h('span', { class: 'unit' }, 'Z');
    const beltFields = h('div', { class: 'fields' },
      h('div', { class: 'field' }, v1Lbl, h('div', { class: 'inp' }, v1Inp, v1Unit)),
      h('div', { class: 'field' }, v2Lbl, h('div', { class: 'inp' }, v2Inp, v2Unit))
    );

    const ratioInp = h('input', { id: 'cp-ratio', type: 'text', inputmode: 'decimal', value: String(opts.ratio ?? 1) });
    const ratioWrap = h('div', { class: 'field' }, h('label', { for: 'cp-ratio' }, T('joint.linearRatioLabel') + ' (Weg 2 / Weg 1)'), h('div', { class: 'inp' }, ratioInp, h('span', { class: 'unit' }, '×')));

    const camContactWrap = UI.selectField({
      id: 'cp-cam-contact',
      label: T('joint.camContactLabel'),
      value: opts.contact === 'flat' ? 'flat' : 'point',
      options: [
        ['point', T('joint.camContactPoint')],
        ['flat', T('joint.camContactFlat')],
      ],
      onChange: () => { syncCamFields(); updatePreview(); },
    });
    const camContactSel = camContactWrap.querySelector('select');
    const camRollerInp = h('input', { id: 'cp-cam-roller', type: 'text', inputmode: 'decimal', value: String(opts.rollerR ?? 0) });
    const camRollerWrap = h('div', { class: 'field' }, h('label', { for: 'cp-cam-roller' }, `${T('joint.camRollerLabel')} (${Units.label()})`), h('div', { class: 'inp' }, camRollerInp, h('span', { class: 'unit' }, 'mm')));
    const camChartBox = h('div', { id: 'cp-cam-chart' });

    const revChk = h('input', { id: 'cp-reverse', type: 'checkbox', checked: !!opts.reverse });
    const revTxt = h('span', null, '');
    const revWrap = h('label', { class: 'check' }, revChk, revTxt);
    const previewEl = h('div', { class: 'hint-box', id: 'cp-preview' });
    let revTouched = opts.reverse !== undefined;

    for (const inp of [z1Inp, z2Inp, gearRatioInp, rackDInp, rackModInp, rackZInp, pitchInp, v1Inp, v2Inp, ratioInp, camRollerInp]) {
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      inp.addEventListener('input', () => updatePreview());
    }
    revChk.addEventListener('change', () => { revTouched = true; updatePreview(); });

    const syncGearFields = () => {
      gearSubBox.innerHTML = '';
      gearSubBox.append(gearModeSel.value === 'ratio' ? gearRatioWrap : gearTeethFields);
    };
    const syncRackFields = () => {
      rackSubBox.innerHTML = '';
      rackSubBox.append(rackModeSel.value === 'module' ? rackModFields : rackDiaWrap);
    };
    const syncBeltUnit = () => {
      const dia = beltModeSel.value === 'diameter';
      v1Lbl.textContent = dia ? 'Rad 1 Ø (mm)' : 'Rad 1 (Zähne)';
      v2Lbl.textContent = dia ? 'Rad 2 Ø (mm)' : 'Rad 2 (Zähne)';
      v1Unit.textContent = dia ? 'mm' : 'Z';
      v2Unit.textContent = dia ? 'mm' : 'Z';
    };
    const syncCamFields = () => {
      camRollerWrap.style.display = camContactSel.value === 'flat' ? 'none' : '';
    };

    const setSelectOpts = (sel, items, preferred) => {
      const prev = preferred || sel.value;
      sel.innerHTML = '';
      for (const [val, lbl] of items) {
        const o = h('option', { value: val }, lbl);
        if (val === prev) o.selected = true;
        sel.append(o);
      }
      if (!sel.value && items.length) sel.value = items[0][0];
    };

    const populateJ1 = () => {
      const cand1 = kind === 'linear'
        ? kinJoints.filter((j) => !!linDofOf(j))
        : kinJoints.filter((j) => !!rotDofOf(j));
      setSelectOpts(j1Sel, cand1.map((j) => [j.id, `${jointLabel(j)} (${isCyl(j) ? 'Zylindrisch' : slide(j) ? 'Schieben' : isPlanar(j) ? 'Eben' : isSlot(j) ? 'Langloch' : 'Drehen'})`]), preJ1);
      populateJ2();
    };

    const populateJ2 = () => {
      const j1 = kinJoints.find((j) => j.id === j1Sel.value);
      const cand2 = [];
      if (kind === 'screw') {
        if (j1 && linDofOf(j1)) cand2.push([j1.id, `Selbes Gelenk (${jointLabel(j1)} · Drehen ↔ Schieben)`]);
        for (const j of kinJoints) {
          if (j1 && j.id === j1.id) continue;
          if (linDofOf(j)) cand2.push([j.id, `${jointLabel(j)} (${slide(j) ? 'Schieben' : isCyl(j) ? 'Zylindrisch' : isSlot(j) ? 'Langloch' : 'Eben'})`]);
        }
      } else if (kind === 'rack') {
        for (const j of kinJoints) {
          if (j1 && j.id === j1.id) continue;
          if (linDofOf(j)) cand2.push([j.id, `${jointLabel(j)} (${slide(j) ? 'Schieben' : isCyl(j) ? 'Zylindrisch' : isSlot(j) ? 'Langloch' : 'Eben'})`]);
        }
      } else if (kind === 'belt' || kind === 'gear') {
        for (const j of kinJoints) {
          if (j1 && j.id === j1.id) continue;
          if (rotDofOf(j)) cand2.push([j.id, `${jointLabel(j)} (Drehen)`]);
        }
      } else {
        for (const j of kinJoints) {
          if (j1 && j.id === j1.id) continue;
          if (linDofOf(j)) cand2.push([j.id, `${jointLabel(j)} (${slide(j) ? 'Schieben' : isCyl(j) ? 'Zylindrisch' : isSlot(j) ? 'Langloch' : 'Eben'})`]);
        }
      }
      const pref2 = opts.j2 || (kind === 'rack' && preJ1 && preJ1 !== j1Sel.value ? preJ1 : '');
      setSelectOpts(j2Sel, cand2, pref2);
    };

    const autoDefaults = () => {
      if (kind === 'cam') {
        if (!revTouched) {
          const j1 = kinJoints.find((j) => j.id === j1Sel.value);
          const j2 = kinJoints.find((j) => j.id === j2Sel.value);
          if (j1 && j2) {
            const dof2 = linDofOf(j2);
            const b = camBasis(App.doc, { dof2, reverse: false }, j1, j2);
            if (b.valid) {
              const fBox = itemBoxWorld(App.doc, j2.b);
              const fCtr = fBox ? fBox.getCenter(new THREE.Vector3()) : new THREE.Vector3(...(j2.ao || [0, 0, 0]));
              revChk.checked = fCtr.sub(b.o).dot(b.dFol) < -1e-4;
            }
          }
        }
        return;
      }
      const j1 = kinJoints.find((j) => j.id === j1Sel.value);
      const j2 = kinJoints.find((j) => j.id === j2Sel.value);
      if (kind === 'gear') {
        if (opts.z1 != null || opts.z2 != null || opts.ratio != null || opts.mode) return;
        const s1 = autoGearSpec(j1), s2 = autoGearSpec(j2);
        if (s1 && s2 && s1.teeth > 0 && s2.teeth > 0) {
          gearModeSel.value = 'teeth';
          z1Inp.value = String(s1.teeth);
          z2Inp.value = String(s2.teeth);
          syncGearFields();
        }
        return;
      }
      if (kind === 'rack') {
        if (opts.d != null || opts.module != null || opts.z1 != null || opts.teeth != null || opts.mode) return;
        const s1 = autoGearSpec(j1);
        if (s1 && s1.teeth > 0 && s1.module > 0) {
          rackModeSel.value = 'module';
          rackModInp.value = String(s1.module);
          rackZInp.value = String(s1.teeth);
          rackDInp.value = String(s1.d);
          syncRackFields();
        } else if (s1 && s1.d > 0) {
          rackModeSel.value = 'diameter';
          rackDInp.value = String(s1.d);
          syncRackFields();
        }
        return;
      }
      if (kind !== 'belt' || opts.z1 != null || opts.d1 != null) return;
      const s1 = autoBeltSpec(j1), s2 = autoBeltSpec(j2);
      if (s1 && s2 && s1.mode === s2.mode) {
        beltModeSel.value = s1.mode;
        v1Inp.value = String(s1.val);
        v2Inp.value = String(s2.val);
        syncBeltUnit();
      }
    };

    const updatePreview = () => {
      const j1 = kinJoints.find((j) => j.id === j1Sel.value);
      const j2 = kinJoints.find((j) => j.id === j2Sel.value);
      const btn = document.getElementById('cp-submit');
      if (kind !== 'cam') camChartBox.innerHTML = '';
      if (!j1 || !j2) {
        previewEl.textContent = kind === 'gear'
          ? 'Für eine Zahnrad-Kopplung werden zwei verschiedene Drehgelenke benötigt.'
          : kind === 'rack'
            ? 'Für eine Zahnstangen-Kopplung werden ein Drehgelenk (Ritzel) und ein Schiebegelenk (Zahnstange) benötigt.'
            : kind === 'screw'
              ? 'Es fehlt noch ein passendes Gelenk mit Dreh- oder Schiebebewegung.'
              : kind === 'belt'
                ? 'Für eine Riemen-Kopplung werden zwei verschiedene Drehgelenke benötigt.'
                : kind === 'cam'
                  ? 'Für eine Kurvenscheibe werden ein Drehgelenk (Scheibe) und ein Schiebegelenk (Stößel) benötigt.'
                  : 'Für eine lineare Kopplung werden zwei verschiedene Schiebegelenke benötigt.';
        if (kind === 'cam') camChartBox.innerHTML = '';
        if (btn) btn.disabled = true;
        return;
      }
      if (btn) btn.disabled = false;
      const rev = revChk.checked;
      if (kind === 'gear') {
        if (gearModeSel.value === 'ratio') {
          const r = parseRatio(gearRatioInp.value);
          previewEl.textContent = Number.isFinite(r) && r > 0
            ? `Zahnrad 2 dreht mit ${fmt(round(r * 100, 1))} % (${fmt(r)}×) von Zahnrad 1${rev ? ' (gegenläufig)' : ''}.`
            : 'Bitte ein gültiges Verhältnis > 0 eingeben (z. B. 1:2 oder 0,5).';
        } else {
          const a = parseNum(z1Inp.value), b = parseNum(z2Inp.value);
          previewEl.textContent = Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0
            ? `Zahnrad 2 dreht mit ${fmt(round((a / b) * 100, 1))} % (${fmt(a)} / ${fmt(b)}) von Zahnrad 1${rev ? ' (gegenläufig)' : ''}.`
            : 'Bitte Zähnezahlen > 0 für beide Zahnräder eingeben.';
        }
      } else if (kind === 'rack') {
        const d = rackModeSel.value === 'module' ? parseNum(rackModInp.value) * parseNum(rackZInp.value) : parseNum(rackDInp.value);
        if (Number.isFinite(d) && d > 0) {
          const s90 = (Math.PI * d * 90) / 360;
          previewEl.textContent = `Drehen um 90° (Ø ${fmt(d)} mm) → Zahnstange bewegt sich um ${rev ? '−' : '+'}${fmt(s90)} mm (π·d·Winkel/360).`;
        } else {
          previewEl.textContent = rackModeSel.value === 'module'
            ? 'Bitte Modul und Zähnezahl > 0 eingeben.'
            : 'Bitte einen Teilkreis-Durchmesser > 0 mm eingeben.';
        }
      } else if (kind === 'screw') {
        const p = parseNum(pitchInp.value);
        previewEl.textContent = Number.isFinite(p) && p > 0
          ? `1 Umdrehung (360°) → ${rev ? '−' : '+'}${fmt(p)} mm Vorschub (${rev ? 'Linksgewinde' : 'Rechtsgewinde'}).`
          : 'Bitte eine gültige Steigung > 0 eingeben.';
      } else if (kind === 'belt') {
        const a = parseNum(v1Inp.value), b = parseNum(v2Inp.value);
        if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) {
          const pct = round((a / b) * 100, 1);
          previewEl.textContent = `Rad 2 dreht mit ${fmt(pct)} % (${fmt(a)} / ${fmt(b)}) von Rad 1${rev ? ' in Gegenrichtung (gekreuzt)' : ' in gleicher Richtung'}.`;
        } else {
          previewEl.textContent = 'Bitte Werte > 0 für beide Räder eingeben.';
        }
      } else if (kind === 'cam') {
        const dof1 = rotDofOf(j1), dof2 = linDofOf(j2);
        const rr = Math.max(0, parseNum(camRollerInp.value) || 0);
        const mockC = { kind: 'cam', j1: j1.id, j2: j2.id, dof1, dof2, ref1: stateOf(j1)[dof1] || 0, ref2: stateOf(j2)[dof2] || 0, reverse: rev, contact: camContactSel.value, rollerR: rr };
        const prof = camProfile(App.doc, mockC);
        camChartBox.innerHTML = '';
        if (!prof || !prof.valid || prof.basis.cosA < 0.1) {
          previewEl.textContent = 'Die Schieberichtung des Stößels muss quer zur Drehachse der Scheibe liegen.';
          if (btn) btn.disabled = true;
          return;
        }
        const chart = buildCamChart(mockC, { interactive: false, strokeId: 'cp-cam-stroke' });
        if (chart) camChartBox.append(chart);
        previewEl.textContent = `Gesamthub über 360°: ${Units.fmtLenU(prof.stroke, 2)} (${camContactSel.value === 'flat' ? 'Flachstößel' : rr > 0 ? `Rolle R = ${Units.fmtLenU(rr, 1)}` : 'Kontur'}).`;
      } else {
        const r = parseNum(ratioInp.value);
        previewEl.textContent = Number.isFinite(r) && r > 0
          ? `Schieben um 10 mm → Teil 2 schiebt um ${rev ? '−' : '+'}${fmt(10 * r)} mm (${rev ? 'gegenläufig' : 'gleichlaufend'}).`
          : 'Bitte ein Verhältnis > 0 eingeben.';
      }
    };

    const refreshForm = () => {
      paramsBox.innerHTML = '';
      if (kind === 'gear') {
        revTxt.textContent = T('joint.gearRevLabel');
        syncGearFields();
        paramsBox.append(gearModeWrap, gearSubBox);
      } else if (kind === 'rack') {
        revTxt.textContent = T('joint.rackRevLabel');
        syncRackFields();
        paramsBox.append(rackModeWrap, rackSubBox);
      } else if (kind === 'screw') {
        revTxt.textContent = T('joint.screwRevLabel');
        paramsBox.append(pitchWrap);
      } else if (kind === 'belt') {
        revTxt.textContent = T('joint.beltRevLabel');
        syncBeltUnit();
        paramsBox.append(beltModeWrap, beltFields);
      } else if (kind === 'cam') {
        revTxt.textContent = T('joint.camRevLabel');
        syncCamFields();
        paramsBox.append(camContactWrap, camRollerWrap, camChartBox);
      } else {
        revTxt.textContent = T('joint.linearRevLabel');
        paramsBox.append(ratioWrap);
      }
      populateJ1();
      autoDefaults();
      updatePreview();
    };

    wrap.append(kindSelWrap, j1SelWrap, j2SelWrap, paramsBox, revWrap, previewEl);
    refreshForm();

    UI.modal({
      title: T('joint.coupleDlgTitle'),
      body: wrap,
      actions: [
        { label: T('common.cancel'), id: 'cp-cancel' },
        {
          label: T('joint.coupleAddBtn'),
          id: 'cp-submit',
          primary: true,
          run: () => {
            const j1 = j1Sel.value, j2 = j2Sel.value;
            const copts = { reverse: revChk.checked };
            if (kind === 'gear') {
              copts.mode = gearModeSel.value;
              if (copts.mode === 'ratio') copts.ratio = gearRatioInp.value;
              else { copts.z1 = z1Inp.value; copts.z2 = z2Inp.value; }
            } else if (kind === 'rack') {
              copts.mode = rackModeSel.value;
              if (copts.mode === 'module') { copts.module = rackModInp.value; copts.z1 = rackZInp.value; }
              else copts.d = rackDInp.value;
            } else if (kind === 'screw') copts.pitch = pitchInp.value;
            else if (kind === 'belt') {
              copts.mode = beltModeSel.value;
              if (copts.mode === 'diameter') { copts.d1 = v1Inp.value; copts.d2 = v2Inp.value; }
              else { copts.z1 = v1Inp.value; copts.z2 = v2Inp.value; }
            } else if (kind === 'cam') {
              copts.contact = camContactSel.value;
              copts.rollerR = camRollerInp.value;
            } else {
              copts.ratio = ratioInp.value;
            }
            const res = addCoupling(kind, j1, j2, copts);
            if (!res.ok) { UI.toast(res.msg, { kind: 'bad' }); return false; }
            select(res.id);
            UI.toast(`Kopplung angelegt: ${couplingSummary(couplingList().find((x) => x.id === res.id))}.`, { icon: 'check', ms: 3400 });
          },
        },
      ],
    });
    updatePreview();
    return true;
  }
  function startGear(opts = {}) { return startCoupling('gear', opts); }
  function startRack(opts = {}) { return startCoupling('rack', opts); }
  function startScrew(opts = {}) { return startCoupling('screw', opts); }
  function startBelt(opts = {}) { return startCoupling('belt', opts); }
  function startLinear(opts = {}) { return startCoupling('linear', opts); }
  function startCam(opts = {}) { return startCoupling('cam', opts); }

  function clampState(j, st) {
    const k = kindOf(j);
    const next = { ...stateOf(j), ...st };
    next.ang = round(clamp(Number(next.ang) || 0, j.min ?? -180, j.max ?? 180), 4);
    if (k === 'cyl') {
      next.pos = round(clamp(Number(next.pos) || 0, j.minPos ?? -20, j.maxPos ?? 20), 4);
    } else if (k === 'planar') {
      next.u = round(clamp(Number(next.u) || 0, j.minU ?? -20, j.maxU ?? 20), 4);
      next.v = round(clamp(Number(next.v) || 0, j.minV ?? -20, j.maxV ?? 20), 4);
    } else if (k === 'ball') {
      next.rx = round(clamp(Number(next.rx) || 0, j.minRx ?? -180, j.maxRx ?? 180), 4);
      next.ry = round(clamp(Number(next.ry) || 0, j.minRy ?? -180, j.maxRy ?? 180), 4);
    } else if (k === 'slot') {
      next.pos = round(clamp(Number(next.pos) || 0, j.minPos ?? -10, j.maxPos ?? 10), 4);
    }
    return next;
  }
  function writeState(j, st) {
    const k = kindOf(j);
    j.ang = st.ang;
    if (k === 'cyl' || k === 'slot') j.pos = st.pos;
    else if (k === 'planar') { j.u = st.u; j.v = st.v; }
    else if (k === 'ball') { j.rx = st.rx; j.ry = st.ry; }
  }
  function stateChanged(a, b, k) {
    if (Math.abs(a.ang - b.ang) > 1e-9) return true;
    if ((k === 'cyl' || k === 'slot') && Math.abs(a.pos - b.pos) > 1e-9) return true;
    if (k === 'planar' && (Math.abs(a.u - b.u) > 1e-9 || Math.abs(a.v - b.v) > 1e-9)) return true;
    if (k === 'ball' && (Math.abs(a.rx - b.rx) > 1e-9 || Math.abs(a.ry - b.ry) > 1e-9)) return true;
    return false;
  }

  function setState(jid, patch) {
    const curJ = list().find((x) => x.id === jid);
    const curA = curJ && top(curJ.a);
    const curB = curJ && top(curJ.b);
    const inLoop = curJ && isInClosedLoop(App.doc, curJ.id);
    if (!inLoop && curB && curB.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(curB) }), { icon: 'lock' }); return false; }
    if (inLoop && curA && curA.locked && curB && curB.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(curB) }), { icon: 'lock' }); return false; }
    const normPatch = patch && 'rz' in patch && !('ang' in patch) ? { ...patch, ang: patch.rz } : patch;
    const label = normPatch && Object.keys(normPatch).length === 1 && 'ang' in normPatch ? 'Gelenk bewegt' : 'Verbindung bewegt';
    let jammed = false;
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const a = top(j.a, doc), b = top(j.b, doc);
      const core = cyclicCore(doc, j.id, true);
      if (!core) {
        if (!b || b.locked) return false;
        syncHome(b, j, doc);
      } else {
        if (!a || !b || (a.locked && b.locked)) return false;
      }
      const prev = stateOf(j);
      const seedDofs = pickPrimaryDofs(doc, j, normPatch, prev);
      const effPatch = {};
      for (const d of (seedDofs.length ? seedDofs : Object.keys(normPatch || {}))) {
        if (d in (normPatch || {})) effPatch[d] = normPatch[d];
      }
      if (core) {
        const snapItems = deepClone(doc.items);
        const snapJoints = deepClone(doc.joints || []);
        const tmpJ = { ...j };
        if (couplingsOf(j.id, doc).length && !tmpJ.stopsLocked) {
          for (const d of seedDofs) {
            const val = Number(effPatch[d]);
            if (Number.isFinite(val)) ensureRangeFor(tmpJ, d, val);
          }
        }
        const next = clampState(tmpJ, effPatch);
        const driveDofs = seedDofs.length ? seedDofs : Object.keys(effPatch).filter((d) => hasDof(j, d));
        const targets = seedDofs.length ? computeCoupledTargets(doc, seedDofs.map((d) => ({ jid: j.id, dof: d, val: next[d] }))) : null;
        const extraTargets = [];
        const coreJSet = new Set(core.joints.map((x) => x.id));
        if (targets && targets.has(j.id)) {
          for (const [d, rawVal] of targets.get(j.id)) {
            if (!hasDof(j, d)) continue;
            next[d] = j.stopsLocked ? round(clampDofVal(j, d, rawVal), 4) : round(rawVal, 4);
            if (!driveDofs.includes(d)) driveDofs.push(d);
          }
        }
        if (targets) {
          for (const [kjId, dofMap] of targets) {
            if (kjId === j.id || !coreJSet.has(kjId)) continue;
            const kj = list(doc).find((x) => x.id === kjId);
            if (!kj) continue;
            const kjFrom = stateOf(kj), kjTo = { ...kjFrom }, kjDofs = [];
            for (const [d, rawVal] of dofMap) {
              if (!hasDof(kj, d)) continue;
              kjTo[d] = kj.stopsLocked ? round(clampDofVal(kj, d, rawVal), 4) : round(rawVal, 4);
              kjDofs.push(d);
            }
            if (kjDofs.length) extraTargets.push({ jid: kjId, dofs: kjDofs, fromSt: kjFrom, toSt: kjTo });
          }
        }
        const sol = solveClosedPoses(doc, core, j, driveDofs, prev, next, { clampToReachable: false, extraTargets });
        if (!sol.ok) {
          doc.items = snapItems;
          doc.joints = snapJoints;
          jammed = true;
          return false;
        }
        applyClosedPoses(doc, core, sol.poses, j, next);
        if (targets && targets.size) {
          for (const [kjId, dofMap] of targets) {
            if (kjId === j.id || coreJSet.has(kjId)) continue;
            const sub = new Map([[kjId, dofMap]]);
            applyTargetsMap(doc, sub, j.id);
          }
        }
        return true;
      }
      if (couplingsOf(j.id, doc).length && !j.stopsLocked) {
        for (const d of seedDofs) {
          const val = Number(effPatch[d]);
          if (Number.isFinite(val)) ensureRangeFor(j, d, val);
        }
      }
      let next = clampState(j, effPatch);
      const targets = seedDofs.length ? computeCoupledTargets(doc, seedDofs.map((d) => ({ jid: j.id, dof: d, val: next[d] }))) : null;
      if (targets && targets.has(j.id)) {
        for (const [d, rawVal] of targets.get(j.id)) {
          if (!hasDof(j, d)) continue;
          if (j.stopsLocked) next[d] = round(clampDofVal(j, d, rawVal), 4);
          else { ensureRangeFor(j, d, rawVal); next[d] = round(rawVal, 4); }
        }
      }
      writeState(j, next);
      Model.setFromMatrix(b, pose(j, next, null, doc));
      if (looseOf(j.b, doc).length) {
        solvePartConstraints(doc, j.b, Model.vars(doc).v);
        next = stateOf(j);
      }
      const isLive = doc === App.doc;
      if (isLive && isTop(b.id, doc)) Viewer.updateNode(b.id, { matrix: Model.localMatrix(b) });
      if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next), { live: isLive });
      if (targets && targets.size) applyTargetsMap(doc, targets, j.id, { live: isLive });
    }, { merge: 'joint:' + jid });
    if (jammed) {
      notifyJam({ jid, target: normPatch }, false);
      const ae = document.activeElement;
      if (ae && ae.tagName === 'INPUT' && ae.type === 'range') {
        const curNow = list().find((x) => x.id === jid);
        if (curNow) {
          const stNow = stateOf(curNow);
          const dk = Object.keys(normPatch || {})[0] || 'ang';
          if (dk in stNow) ae.value = stNow[dk];
        }
      } else {
        Panels.renderRight();
      }
      return false;
    }
    if (ok) lastJam = null;
    drawSelectedJoint();
    return !!ok;
  }
  // Winkel/Weg setzen (Abwärtskompatibilität)
  function setAngle(jid, ang) { return setState(jid, { ang }); }

  // Art wechseln (Drehen / Schieben / Zylindrisch / Eben / Kugel / Langloch): das Teil geht zurück in die Ausgangslage
  function setKind(jid, kind) {
    const k = kind === 'slide' || kind === 'cyl' || kind === 'planar' || kind === 'ball' || kind === 'slot' ? kind : 'rot';
    App.change('Verbindungs-Art', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const b = top(j.b, doc); if (!b || b.locked) return false;
      syncHome(b, j, doc);
      const prev = stateOf(j);
      const zero = { ang: 0, pos: 0, u: 0, v: 0, rx: 0, ry: 0 };
      if (stateChanged(prev, zero, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, zero));
      if (k === 'rot') delete j.kind; else j.kind = k;
      j.ang = 0;
      if (k === 'slide') {
        j.min = -20; j.max = 20;
      } else if (k === 'cyl') {
        j.min = -180; j.max = 180;
        j.pos = 0;
        if (!Number.isFinite(j.minPos)) j.minPos = -20;
        if (!Number.isFinite(j.maxPos)) j.maxPos = 20;
      } else if (k === 'planar') {
        j.min = -180; j.max = 180;
        const n = new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize();
        const basis = planeBasis(n, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null);
        j.au = r9(basis.u.toArray());
        j.u = 0; j.v = 0;
        if (!Number.isFinite(j.minU)) j.minU = -20;
        if (!Number.isFinite(j.maxU)) j.maxU = 20;
        if (!Number.isFinite(j.minV)) j.minV = -20;
        if (!Number.isFinite(j.maxV)) j.maxV = 20;
      } else if (k === 'ball') {
        j.min = -180; j.max = 180;
        j.rx = 0; j.ry = 0;
        if (!Number.isFinite(j.minRx)) j.minRx = -180;
        if (!Number.isFinite(j.maxRx)) j.maxRx = 180;
        if (!Number.isFinite(j.minRy)) j.minRy = -180;
        if (!Number.isFinite(j.maxRy)) j.maxRy = 180;
        if (!Array.isArray(j.au)) j.au = [1, 0, 0];
      } else if (k === 'slot') {
        j.min = -180; j.max = 180;
        const d = new THREE.Vector3(...(j.ad || [1, 0, 0])).normalize();
        const basis = planeBasis(d, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null);
        j.au = r9(basis.u.toArray());
        j.pos = 0;
        if (!Number.isFinite(j.minPos)) j.minPos = -10;
        if (!Number.isFinite(j.maxPos)) j.maxPos = 10;
        j.stopsLocked = true;
      } else {
        j.min = -90; j.max = 90;
      }
      Model.setFromMatrix(b, pose(j, zero, null, doc));
      delete j.locA; delete j.locB;
      captureLocalFrames(doc, j);
      pruneInvalidCouplings(doc);
    });
    drawSelectedJoint();
  }

  function setRange(jid, k, v) {
    const pair = {
      min: ['min', 'max', 36000], max: ['min', 'max', 36000],
      minRx: ['minRx', 'maxRx', 360], maxRx: ['minRx', 'maxRx', 360],
      minRy: ['minRy', 'maxRy', 360], maxRy: ['minRy', 'maxRy', 360],
      minPos: ['minPos', 'maxPos', 10000], maxPos: ['minPos', 'maxPos', 10000],
      minU: ['minU', 'maxU', 10000], maxU: ['minU', 'maxU', 10000],
      minV: ['minV', 'maxV', 10000], maxV: ['minV', 'maxV', 10000],
    }[k];
    if (!pair) return;
    App.change('Verbindungs-Bereich', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const lim = pair[2];
      j[k] = round(clamp(Number(v) || 0, -lim, lim), 4);
      if (j[pair[0]] > j[pair[1]]) [j[pair[0]], j[pair[1]]] = [j[pair[1]], j[pair[0]]];
      if (isSlot(j) && (k === 'minPos' || k === 'maxPos')) {
        const prev = stateOf(j);
        const clampedPos = round(clamp(prev.pos, j.minPos, j.maxPos), 4);
        if (Math.abs(clampedPos - prev.pos) > 1e-9) {
          const b = top(j.b, doc);
          j.pos = clampedPos;
          const next = stateOf(j);
          if (b) Model.setFromMatrix(b, pose(j, next, null, doc));
          moveChain(doc, j.b, deltaMatrix(j, prev, next));
        }
      }
    });
    drawSelectedJoint();
  }

  function flip(jid) {
    const cur = list().find((x) => x.id === jid);
    if (!cur) return false;
    if (fixed(cur)) return flipFixed(jid);
    if (isAngle(cur)) return flipAngle(jid);
    if (isLoose(cur)) return flipLoose(jid);
    App.change('Verbindung umkehren', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = top(j.b, doc); if (!b || b.locked) return false;
      const k = kindOf(j);
      if (k !== 'cyl' && k !== 'planar' && k !== 'slot') return false;
      syncHome(b, j, doc);
      const st = stateOf(j);
      let pivot, ax;
      if (k === 'cyl') {
        const d = new THREE.Vector3(...j.ad).normalize();
        const o = new THREE.Vector3(...j.ao);
        pivot = o.clone().addScaledVector(d, st.pos);
        const ref = Math.abs(d.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        ax = new THREE.Vector3().crossVectors(d, ref).normalize();
      } else if (k === 'slot') {
        const fr = frameOf(j);
        pivot = fr.o.clone().addScaledVector(fr.d, st.pos);
        ax = fr.d.clone();
      } else {
        const pf = planeFrame(j);
        pivot = pf.o.clone().addScaledVector(pf.u, st.u).addScaledVector(pf.v, st.v);
        ax = pf.u.clone();
      }
      const F = rotAbout(pivot, ax, 180);
      j.flip = !j.flip;
      j.home = r9(conj(doc, j.b, F).multiply(new THREE.Matrix4().fromArray(j.home)).toArray());
      Model.setFromMatrix(b, pose(j, st, null, doc));
      moveChain(doc, j.b, F);
      delete j.locA; delete j.locB;
      captureLocalFrames(doc, j);
    });
  }

  // Twist-Winkel um eine normierte Weltachse aus einer Transformationsmatrix extrahieren
  function twistDegAround(D, axis) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    D.decompose(pos, q, sc);
    const dot = q.x * axis.x + q.y * axis.y + q.z * axis.z;
    let w = q.w, p = dot;
    if (w < 0) { w = -w; p = -p; }
    let deg = (2 * Math.atan2(p, w) * 180) / Math.PI;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    return deg;
  }

  // Verschieben/Drehen eines verbundenen Teils auf die erlaubten Freiheitsgrade von 'rot'/'slide'/'cyl'/'planar'/'ball'/'slot'/'angle'/'center' sowie lockere Verbindungen projizieren
  function constrain(doc, itemId) {
    const core = cyclicCore(doc, itemId, false);
    if (core && core.partIds.has(itemId)) {
      const it = top(itemId, doc);
      if (!it || it.locked) return false;
      const inc = core.joints.filter((k) => (k.a === itemId || k.b === itemId) && !isConstraint(k) && !isLoose(k));
      if (!inc.length) return false;
      const mj0 = drivingOf(itemId, doc);
      const j = inc.find((k) => { const o = top(k.a === itemId ? k.b : k.a, doc); return !!(o && o.locked); }) || (mj0 && inc.includes(mj0) ? mj0 : inc[0]);
      ensureLocalFrames(doc, core.joints);
      const prev = stateOf(j);
      const W_cur = Model.worldMatrix(doc, itemId);
      const poseCur = mat4ToPose(W_cur);
      const pA = j.a === itemId ? poseCur : mat4ToPose(Model.worldMatrix(doc, j.a));
      const pB = j.b === itemId ? poseCur : mat4ToPose(Model.worldMatrix(doc, j.b));
      const rawSt = extractJointState(j, pA, pB, prev);
      const targetSt = clampState({ ...j }, rawSt);
      const startPoses = new Map();
      for (const id of core.partIds) startPoses.set(id, mat4ToPose(Model.worldMatrix(doc, id)));
      if (j.b === itemId && Array.isArray(j.home)) {
        startPoses.set(itemId, mat4ToPose(Model.parentWorld(doc, itemId).multiply(pose(j, prev, null, doc))));
      } else if (j.a === itemId && Array.isArray(j.ao) && Array.isArray(j.ad)) {
        const DAw = new THREE.Vector3(...j.ad).normalize();
        const UAw = planeBasis(DAw, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null).u;
        const VAw = new THREE.Vector3().crossVectors(DAw, UAw).normalize();
        const Fw = new THREE.Matrix4().makeBasis(UAw, VAw, DAw);
        const DAl = new THREE.Vector3(...j.locA.d).normalize();
        const UAl = planeBasis(DAl, new THREE.Vector3(...j.locA.u)).u;
        const VAl = new THREE.Vector3().crossVectors(DAl, UAl).normalize();
        const Fl = new THREE.Matrix4().makeBasis(UAl, VAl, DAl);
        const q = new THREE.Quaternion().setFromRotationMatrix(Fw.multiply(Fl.transpose()));
        const p = new THREE.Vector3(...j.ao).sub(new THREE.Vector3(...j.locA.o).applyQuaternion(q));
        startPoses.set(itemId, { p, q: q.normalize() });
      }
      const k = kindOf(j);
      const driveDofs = k === 'cyl' ? ['ang', 'pos'] : k === 'slot' ? ['pos', 'ang'] : k === 'planar' ? ['u', 'v', 'ang'] : k === 'ball' ? ['rx', 'ry', 'ang'] : ['ang'];
      const sol = solveClosedPoses(doc, core, j, driveDofs, prev, targetSt, { clampToReachable: true, startPoses });
      if (sol.ok && sol.poses) {
        applyClosedPoses(doc, core, sol.poses, j, sol.jammed ? null : targetSt);
        if (sol.jammed) notifyJam({ jid: j.id }, true);
      } else {
        applyClosedPoses(doc, core, startPoses);
        notifyJam({ jid: j.id }, true);
      }
      return true;
    }
    const j = drivingOf(itemId, doc);
    const hasLoose = looseOf(itemId, doc).length > 0;
    if (!j || fixed(j)) {
      if (!hasLoose || (j && fixed(j))) return false;
      const b = top(itemId, doc); if (!b || b.locked) return false;
      const WbOld = Model.worldMatrix(doc, itemId);
      const sol = solvePartConstraints(doc, itemId, Model.vars(doc).v);
      if (sol.changed && list(doc).some((k) => k.a === itemId && !isConstraint(k) && !isLoose(k))) {
        const WbNew = Model.worldMatrix(doc, itemId);
        moveChain(doc, itemId, WbNew.clone().multiply(WbOld.clone().invert()));
      }
      return sol.changed;
    }
    const b = top(j.b, doc);
    if (!b || b.locked) return false;
    if (j.kind === 'angle' || j.kind === 'center') {
      const WbOld = Model.worldMatrix(doc, j.b);
      const sol = solveConstraintPose(doc, j);
      if (!sol) return false;
      const LbNew = Model.parentWorld(doc, j.b).invert().multiply(sol.WbNew);
      const LbOld = Model.localMatrix(b);
      if (maxMatDiff(LbNew, LbOld) > 1e-5) {
        Model.setFromMatrix(b, LbNew);
        j.home = r9(Model.localMatrix(b).toArray());
        j.ao = r6(sol.ao.toArray());
        j.ad = r9(sol.ad.toArray());
        moveChain(doc, j.b, sol.WbNew.clone().multiply(WbOld.clone().invert()));
        return true;
      }
      return false;
    }
    const prev = stateOf(j);
    const W_cur = Model.worldMatrix(doc, j.b);
    const W_home = Model.parentWorld(doc, j.b).multiply(new THREE.Matrix4().fromArray(j.home));
    const D_want = W_cur.clone().multiply(W_home.clone().invert());
    const o = new THREE.Vector3(...j.ao);
    const oCur = o.clone().applyMatrix4(D_want);
    const dp = oCur.sub(o);
    const k = kindOf(j);

    if (k === 'rot') {
      const d = new THREE.Vector3(...j.ad).normalize();
      const angNew = round(twistDegAround(D_want, d), 4);
      if (couplingsOf(j.id, doc).length && !j.stopsLocked) ensureRangeFor(j, 'ang', angNew);
      j.ang = clamp(angNew, j.min ?? -180, j.max ?? 180);
    } else if (k === 'slide') {
      const d = new THREE.Vector3(...j.ad).normalize();
      const posNew = round(dp.dot(d), 4);
      if (couplingsOf(j.id, doc).length && !j.stopsLocked) ensureRangeFor(j, 'ang', posNew);
      j.ang = clamp(posNew, j.min ?? -20, j.max ?? 20);
    } else if (k === 'cyl') {
      const d = new THREE.Vector3(...j.ad).normalize();
      let posNew = round(dp.dot(d), 4);
      let angNew = round(twistDegAround(D_want, d), 4);
      if (j.stopsLocked) {
        posNew = clamp(posNew, j.minPos ?? -20, j.maxPos ?? 20);
        angNew = clamp(angNew, j.min ?? -180, j.max ?? 180);
      } else {
        if (posNew < (j.minPos ?? -20)) j.minPos = round(Math.floor(posNew), 2);
        if (posNew > (j.maxPos ?? 20)) j.maxPos = round(Math.ceil(posNew), 2);
        if (angNew < (j.min ?? -180)) j.min = round(Math.floor(angNew), 2);
        if (angNew > (j.max ?? 180)) j.max = round(Math.ceil(angNew), 2);
      }
      j.pos = posNew;
      j.ang = angNew;
    } else if (j.kind === 'planar') {
      const pf = planeFrame(j);
      let uNew = round(dp.dot(pf.u), 4);
      let vNew = round(dp.dot(pf.v), 4);
      let angNew = round(twistDegAround(D_want, pf.n), 4);
      if (j.stopsLocked) {
        uNew = clamp(uNew, j.minU ?? -20, j.maxU ?? 20);
        vNew = clamp(vNew, j.minV ?? -20, j.maxV ?? 20);
        angNew = clamp(angNew, j.min ?? -180, j.max ?? 180);
      } else {
        if (uNew < (j.minU ?? -20)) j.minU = round(Math.floor(uNew), 2);
        if (uNew > (j.maxU ?? 20)) j.maxU = round(Math.ceil(uNew), 2);
        if (vNew < (j.minV ?? -20)) j.minV = round(Math.floor(vNew), 2);
        if (vNew > (j.maxV ?? 20)) j.maxV = round(Math.ceil(vNew), 2);
        if (angNew < (j.min ?? -180)) j.min = round(Math.floor(angNew), 2);
        if (angNew > (j.max ?? 180)) j.max = round(Math.ceil(angNew), 2);
      }
      j.u = uNew;
      j.v = vNew;
      j.ang = angNew;
    } else if (j.kind === 'ball') {
      const pf = planeFrame(j);
      const F = new THREE.Matrix4().makeBasis(pf.u, pf.v, pf.n);
      const R_world = new THREE.Matrix4().extractRotation(D_want);
      const R_loc = F.clone().transpose().multiply(R_world).multiply(F);
      const e = new THREE.Euler().setFromRotationMatrix(R_loc, 'XYZ');
      const toDeg = (rad) => {
        let dg = round((rad * 180) / Math.PI, 4);
        if (dg > 180) dg -= 360;
        if (dg < -180) dg += 360;
        return dg;
      };
      let rxNew = toDeg(e.x), ryNew = toDeg(e.y), angNew = toDeg(e.z);
      if (j.stopsLocked) {
        rxNew = clamp(rxNew, j.minRx ?? -180, j.maxRx ?? 180);
        ryNew = clamp(ryNew, j.minRy ?? -180, j.maxRy ?? 180);
        angNew = clamp(angNew, j.min ?? -180, j.max ?? 180);
      }
      j.rx = rxNew;
      j.ry = ryNew;
      j.ang = angNew;
    } else if (j.kind === 'slot') {
      const fr = frameOf(j);
      const posNew = clamp(round(dp.dot(fr.d), 4), fr.minPos, fr.maxPos);
      const angNew = clamp(round(twistDegAround(D_want, fr.n), 4), j.min ?? -180, j.max ?? 180);
      j.pos = posNew;
      j.ang = angNew;
    }
    const selfCs = couplingList(doc).filter((c) => c.j1 === j.id && c.j2 === j.id);
    if (selfCs.length) {
      const ch = Object.keys(prev).filter((d) => hasDof(j, d) && Math.abs((j[d] ?? 0) - prev[d]) > 1e-4);
      const seed = ch.includes('ang') ? ['ang'] : ch.includes('pos') ? ['pos'] : ch;
      if (seed.length) {
        const sMap = computeCoupledTargets(doc, seed.map((d) => ({ jid: j.id, dof: d, val: j[d] })));
        if (sMap.has(j.id)) {
          for (const [d, rawVal] of sMap.get(j.id)) {
            if (!hasDof(j, d)) continue;
            if (j.stopsLocked) j[d] = round(clampDofVal(j, d, rawVal), 4);
            else { ensureRangeFor(j, d, rawVal); j[d] = round(rawVal, 4); }
          }
        }
      }
    }
    let next = stateOf(j);
    Model.setFromMatrix(b, pose(j, next, null, doc));
    if (hasLoose) {
      solvePartConstraints(doc, j.b, Model.vars(doc).v);
      next = stateOf(j);
    }
    if (stateChanged(prev, next, kindOf(j))) {
      moveChain(doc, j.b, deltaMatrix(j, prev, next));
      const changedDofs = Object.keys(prev).filter((d) => hasDof(j, d) && Math.abs(next[d] - prev[d]) > 1e-6);
      if (changedDofs.length) propagateCouplings(doc, j.id, changedDofs);
    }
    return true;
  }

  function computeDragState(j, patch) {
    const k = kindOf(j);
    const hasCoup = couplingsOf(j.id, App.doc).length > 0;
    if (k === 'cyl' && patch.pos != null) {
      let p = round(Number(patch.pos) || 0, 4);
      if (j.stopsLocked) p = clamp(p, j.minPos ?? -20, j.maxPos ?? 20);
      else {
        if (p < (j.minPos ?? -20)) j.minPos = round(Math.floor(p), 2);
        if (p > (j.maxPos ?? 20)) j.maxPos = round(Math.ceil(p), 2);
      }
      j.pos = p;
    }
    if (k === 'slot' && patch.pos != null) {
      j.pos = round(clamp(Number(patch.pos) || 0, j.minPos ?? -10, j.maxPos ?? 10), 4);
    }
    if (k === 'planar') {
      if (patch.u != null) {
        let u = round(Number(patch.u) || 0, 4);
        if (j.stopsLocked) u = clamp(u, j.minU ?? -20, j.maxU ?? 20);
        else {
          if (u < (j.minU ?? -20)) j.minU = round(Math.floor(u), 2);
          if (u > (j.maxU ?? 20)) j.maxU = round(Math.ceil(u), 2);
        }
        j.u = u;
      }
      if (patch.v != null) {
        let v = round(Number(patch.v) || 0, 4);
        if (j.stopsLocked) v = clamp(v, j.minV ?? -20, j.maxV ?? 20);
        else {
          if (v < (j.minV ?? -20)) j.minV = round(Math.floor(v), 2);
          if (v > (j.maxV ?? 20)) j.maxV = round(Math.ceil(v), 2);
        }
        j.v = v;
      }
    }
    if (k === 'ball') {
      const wrapDeg = (val) => {
        let dg = round(Number(val) || 0, 4);
        while (dg > 180) dg -= 360;
        while (dg < -180) dg += 360;
        return dg;
      };
      if (patch.rx != null) j.rx = clamp(wrapDeg(patch.rx), j.minRx ?? -180, j.maxRx ?? 180);
      if (patch.ry != null) j.ry = clamp(wrapDeg(patch.ry), j.minRy ?? -180, j.maxRy ?? 180);
    }
    if (patch.ang != null) {
      const angV = round(Number(patch.ang) || 0, 4);
      if (hasCoup && !j.stopsLocked) ensureRangeFor(j, 'ang', angV);
      const lo = j.min ?? (k === 'slide' ? -20 : -180);
      const hi = j.max ?? (k === 'slide' ? 20 : 180);
      j.ang = round(clamp(angV, lo, hi), 4);
    }
    return stateOf(j);
  }

  function applyReverseDrag(j, patch, revSnap) {
    const doc = App.doc, A = top(revSnap.aId, doc), B = top(revSnap.bId, doc);
    if (!A || !B || A.locked) return null;
    const next = computeDragState(j, patch || {});
    const D_fwd = stateMatrix(revSnap.j0, next).multiply(stateMatrix(revSnap.j0, revSnap.st0).invert());
    const D_A = D_fwd.clone().invert();
    const WaNew = D_A.clone().multiply(revSnap.aW0);
    Model.setFromMatrix(A, Model.parentWorld(doc, A.id).invert().multiply(WaNew));
    j.ao = r6(new THREE.Vector3(...revSnap.j0.ao).applyMatrix4(D_A).toArray());
    j.ad = r9(new THREE.Vector3(...revSnap.j0.ad).transformDirection(D_A).normalize().toArray());
    if (Array.isArray(revSnap.j0.au)) j.au = r9(new THREE.Vector3(...revSnap.j0.au).transformDirection(D_A).normalize().toArray());
    j.home = r9(conj(doc, j.b, D_A).multiply(new THREE.Matrix4().fromArray(revSnap.home0)).toArray());
    writeState(j, next);
    if (isTop(A.id, doc)) Viewer.updateNode(A.id, { matrix: Model.localMatrix(A) });
    applyChainDelta(doc, revSnap.sideChain, D_A, { live: true });
    drawSelectedJoint();
    if (dragVisJid === j.id) showDragVis(j.id);
    return next;
  }

  // Live-Ziehen in der 3D-Ansicht (ohne eigenes App.change – Interact.onUp speichert den Rückgängig-Schritt)
  function applyDrag(jid, patch, opts = {}) {
    const j = list(App.doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return null;
    const core = cyclicCore(App.doc, j.id, true);
    if (core) {
      const a = top(j.a, App.doc), b = top(j.b, App.doc);
      if (!a || !b || (a.locked && b.locked)) return null;
      const prev = stateOf(j);
      const seedDofs = pickPrimaryDofs(App.doc, j, patch || {}, prev);
      const effPatch = {};
      for (const d of (seedDofs.length ? seedDofs : Object.keys(patch || {}))) {
        if (d in (patch || {})) effPatch[d] = patch[d];
      }
      const tmpJ = { ...j };
      const next = computeDragState(tmpJ, effPatch);
      const driveDofs = seedDofs.length ? seedDofs : Object.keys(effPatch).filter((d) => hasDof(j, d));
      const targets = seedDofs.length ? computeCoupledTargets(App.doc, seedDofs.map((d) => ({ jid: j.id, dof: d, val: next[d] }))) : null;
      const extraTargets = [];
      const coreJSet = new Set(core.joints.map((x) => x.id));
      if (targets && targets.has(j.id)) {
        for (const [d, rawVal] of targets.get(j.id)) {
          if (!hasDof(j, d)) continue;
          next[d] = j.stopsLocked ? round(clampDofVal(j, d, rawVal), 4) : round(rawVal, 4);
          if (!driveDofs.includes(d)) driveDofs.push(d);
        }
      }
      if (targets) {
        for (const [kjId, dofMap] of targets) {
          if (kjId === j.id || !coreJSet.has(kjId)) continue;
          const kj = list(App.doc).find((x) => x.id === kjId);
          if (!kj) continue;
          const kjFrom = stateOf(kj), kjTo = { ...kjFrom }, kjDofs = [];
          for (const [d, rawVal] of dofMap) {
            if (!hasDof(kj, d)) continue;
            kjTo[d] = kj.stopsLocked ? round(clampDofVal(kj, d, rawVal), 4) : round(rawVal, 4);
            kjDofs.push(d);
          }
          if (kjDofs.length) extraTargets.push({ jid: kjId, dofs: kjDofs, fromSt: kjFrom, toSt: kjTo });
        }
      }
      const sol = solveClosedPoses(App.doc, core, j, driveDofs, prev, next, { clampToReachable: true, extraTargets });
      if (sol.ok && sol.poses) {
        applyClosedPoses(App.doc, core, sol.poses, j, sol.jammed ? null : next, { live: true });
        if (targets && targets.size) {
          for (const [kjId, dofMap] of targets) {
            if (kjId === j.id || coreJSet.has(kjId)) continue;
            applyTargetsMap(App.doc, new Map([[kjId, dofMap]]), j.id, { live: true });
          }
        }
      }
      if (!sol.ok || sol.jammed) notifyJam({ jid, target: patch }, true);
      else lastJam = null;
      drawSelectedJoint();
      if (dragVisJid === j.id) showDragVis(j.id);
      return stateOf(j);
    }
    if (opts && opts.reverse && opts.snap) return applyReverseDrag(j, patch, opts.snap);
    const b = top(j.b, App.doc); if (!b || b.locked) return null;
    const prev = stateOf(j);
    const k = kindOf(j);
    const seedDofs = pickPrimaryDofs(App.doc, j, patch || {}, prev);
    const effPatch = {};
    for (const d of (seedDofs.length ? seedDofs : Object.keys(patch || {}))) {
      if (d in (patch || {})) effPatch[d] = patch[d];
    }
    let next = computeDragState(j, effPatch);
    const targets = seedDofs.length ? computeCoupledTargets(App.doc, seedDofs.map((d) => ({ jid: j.id, dof: d, val: next[d] }))) : null;
    if (targets && targets.has(j.id)) {
      for (const [d, rawVal] of targets.get(j.id)) {
        if (!hasDof(j, d)) continue;
        if (j.stopsLocked) next[d] = round(clampDofVal(j, d, rawVal), 4);
        else { ensureRangeFor(j, d, rawVal); next[d] = round(rawVal, 4); }
      }
      writeState(j, next);
    }
    Model.setFromMatrix(b, pose(j, next, null, App.doc));
    if (looseOf(j.b, App.doc).length) {
      solvePartConstraints(App.doc, j.b, Model.vars(App.doc).v);
      next = stateOf(j);
    }
    if (stateChanged(prev, next, k)) moveChain(App.doc, j.b, deltaMatrix(j, prev, next), { live: true });
    if (isTop(b.id, App.doc)) Viewer.updateNode(b.id, { matrix: Model.localMatrix(b) });
    for (const d of downstream(App.doc, j.b, { stopAtLocked: true })) {
      const db = top(d.b, App.doc);
      if (db && isTop(db.id, App.doc)) Viewer.updateNode(db.id, { matrix: Model.localMatrix(db) });
    }
    if (targets && targets.size) applyTargetsMap(App.doc, targets, j.id, { live: true });
    drawSelectedJoint();
    if (dragVisJid === j.id) showDragVis(j.id);
    return next;
  }

  function projectAxisRay(o, d, ray) {
    const dir = d.clone().normalize();
    const w0 = o.clone().sub(ray.origin);
    const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction);
    const dd = dir.dot(w0), e = ray.direction.dot(w0);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return 0;
    return (b * e - c * dd) / den;
  }

  function remove(jid) {
    if (couplingList().some((c) => c.id === jid)) return removeCoupling(jid);
    const cur = list().find((x) => x.id === jid);
    const wasConn = isConstraint(cur) || isLoose(cur);
    const wasSel = selJoint === jid;
    App.change(wasConn ? 'Verbindung gelöst' : 'Gelenk gelöst', (doc) => {
      doc.joints = list(doc).filter((x) => x.id !== jid);
      if (Array.isArray(doc.couplings)) doc.couplings = doc.couplings.filter((c) => c.j1 !== jid && c.j2 !== jid);
    });
    if (wasSel) { selJoint = null; clearSelVis(); }
    Panels.renderRight();
    Panels.renderLeft();
    UI.toast(wasConn ? 'Verbindung gelöst – das Teil lässt sich wieder frei bewegen.' : 'Verbindung gelöst – das Teil bleibt, wo es gerade ist.', { icon: 'check' });
  }

  // ---------- Bewegung prüfen (Durchdringung) ----------
  function sweepMeta(j) {
    const k = kindOf(j);
    if (k === 'slide') return { key: 'ang', lo: j.min, hi: j.max, len: true };
    if (k === 'cyl') {
      const plo = j.minPos ?? -20, phi = j.maxPos ?? 20;
      if (Math.abs(phi - plo) > 1e-6) return { key: 'pos', lo: plo, hi: phi, len: true };
      return { key: 'ang', lo: j.min ?? -180, hi: j.max ?? 180, len: false };
    }
    if (k === 'planar') {
      const ulo = j.minU ?? -20, uhi = j.maxU ?? 20;
      if (Math.abs(uhi - ulo) > 1e-6) return { key: 'u', lo: ulo, hi: uhi, len: true };
      const vlo = j.minV ?? -20, vhi = j.maxV ?? 20;
      if (Math.abs(vhi - vlo) > 1e-6) return { key: 'v', lo: vlo, hi: vhi, len: true };
      return { key: 'ang', lo: j.min ?? -180, hi: j.max ?? 180, len: false };
    }
    if (k === 'ball') return { key: 'rx', lo: j.minRx ?? -180, hi: j.maxRx ?? 180, len: false };
    if (k === 'slot') return { key: 'pos', lo: j.minPos ?? -10, hi: j.maxPos ?? 10, len: true };
    return { key: 'ang', lo: j.min, hi: j.max, len: false };
  }
  async function check(jid, step) {
    const j = list().find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return null;
    const sw = sweepMeta(j);
    step = step || (sw.len ? Math.max(0.5, round((sw.hi - sw.lo) / 40, 1)) : 5);
    const A = top(j.a), B = top(j.b); if (!A || !B) return null;
    const V = Model.vars(App.doc).v, out = [];
    // alles in Weltlage rechnen – so geht es auch mit Teilen in Gruppen
    const W = (it) => Model.worldMatrix(App.doc, it.id);
    const kw = (it, M) => { const c = deepClone(it); Model.setFromMatrix(c, M); return Model.kernelItem(c, V); };
    const core = cyclicCore(App.doc, j.id, true);
    if (core) {
      const fixedIds = new Set([...core.partIds].filter((id) => { const it = top(id); return it && it.locked; }));
      if (!fixedIds.size) fixedIds.add(j.a);
      const movSet = new Set([...core.partIds].filter((id) => !fixedIds.has(id)));
      const statK = [...fixedIds].map((id) => top(id)).filter((x) => x && x.role !== 'hole').map((it) => kw(it, W(it)));
      const curSt = stateOf(j);
      let rollPoses = new Map([...core.partIds].map((id) => [id, mat4ToPose(W(top(id)))]));
      let rollSt = { ...curSt };
      for (let a = sw.lo; a <= sw.hi + 1e-9; a += step) {
        const tgtSt = { ...rollSt, [sw.key]: a };
        const sol = solveClosedPoses(App.doc, core, j, [sw.key], rollSt, tgtSt, { clampToReachable: false, startPoses: rollPoses });
        if (!sol.ok) continue;
        rollPoses = sol.poses;
        rollSt = tgtSt;
        const movK = [...movSet].map((id) => top(id)).filter((x) => x && x.role !== 'hole').map((it) => kw(it, poseToMat4(rollPoses.get(it.id))));
        let cl = null; try { cl = await Kernel.call('clashes', { scene: { items: [...statK, ...movK] } }); } catch (_) {}
        const v = cl ? cl.pairs.filter((p) => movSet.has(p.a) !== movSet.has(p.b)).reduce((s, p) => s + p.v, 0) : 0;
        out.push({ a: round(a, 4), v });
      }
      return out;
    }
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter((x) => x && !Model.parentsOf(App.doc, x.id).some((p) => p.id === j.b));
    const movSet = new Set([B.id, ...down.map((x) => x.id)]);
    const compIds = new Set([j.a, j.b]);
    let chg = true;
    while (chg) {
      chg = false;
      for (const k of list()) {
        if (compIds.has(k.a) && !compIds.has(k.b)) { compIds.add(k.b); chg = true; }
        if (compIds.has(k.b) && !compIds.has(k.a)) { compIds.add(k.a); chg = true; }
      }
    }
    const statK = [...compIds].filter((id) => !movSet.has(id)).map((id) => top(id)).filter((x) => x && x.role !== 'hole').map((it) => kw(it, W(it)));
    const Bw = W(B), downCur = down.map((it) => ({ it, m: W(it) }));
    const curSt = stateOf(j);
    for (let a = sw.lo; a <= sw.hi + 1e-9; a += step) {
      const D = deltaMatrix(j, curSt, { ...curSt, [sw.key]: a });
      const movK = [kw(B, D.clone().multiply(Bw))];
      for (const d of downCur) movK.push(kw(d.it, D.clone().multiply(d.m)));
      let cl = null; try { cl = await Kernel.call('clashes', { scene: { items: [...statK, ...movK] } }); } catch (_) {}
      const v = cl ? cl.pairs.filter((p) => movSet.has(p.a) !== movSet.has(p.b)).reduce((s, p) => s + p.v, 0) : 0;
      out.push({ a: round(a, 4), v });
    }
    return out;
  }
  function describe(j, res) {
    const sw = sweepMeta(j);
    const cur = stateOf(j)[sw.key];
    const hit = res.filter((r) => r.v > 0.05);
    const u = sw.len ? Units.label() : '°';
    const fv = (x) => (sw.len ? Units.fmtLen(x, 1) : fmtAngle(x));
    if (!hit.length) return { ok: true, text: `Frei im ganzen Bereich von ${fv(sw.lo)} ${u} bis ${fv(sw.hi)} ${u} – nichts stößt an.` };
    const free = res.filter((r) => r.v <= 0.05).map((r) => r.a);
    const lo = res.filter((r) => r.a <= cur && r.v > 0.05).map((r) => r.a), hi = res.filter((r) => r.a >= cur && r.v > 0.05).map((r) => r.a);
    const from = lo.length ? Math.max(...lo) : null, to = hi.length ? Math.min(...hi) : null;
    const parts = [];
    if (to != null) parts.push(`stößt in Plus-Richtung bei ${fv(to)} ${u} an`);
    if (from != null) parts.push(`in Minus-Richtung bei ${fv(from)} ${u}`);
    const atNow = res.find((r) => Math.abs(r.a - cur) < 1e-6);
    return { ok: false, text: (atNow && atNow.v > 0.05 ? 'Schon in dieser Stellung stecken die Teile ineinander. ' : '') + `Das Teil ${parts.join(', ')}.` + (free.length ? ` Frei: ${fv(Math.min(...free))} … ${fv(Math.max(...free))} ${u} (nicht unbedingt am Stück).` : '') };
  }
  // Freier Bereich um die jetzige Stellung aus dem Ergebnis von „Bewegung prüfen“ – wird zum Anschlag (Von/Bis)
  function freeRange(j, res) {
    const s = (res || []).slice().sort((a, b) => a.a - b.a); if (!s.length) return null;
    const cur = stateOf(j)[sweepMeta(j).key];
    let i0 = 0, best = Infinity; s.forEach((r, i) => { const d = Math.abs(r.a - cur); if (d < best) { best = d; i0 = i; } });
    if (s[i0].v > 0.05) return null;
    let lo = i0, hi = i0; while (lo > 0 && s[lo - 1].v <= 0.05) lo--; while (hi < s.length - 1 && s[hi + 1].v <= 0.05) hi++;
    return [s[lo].a, s[hi].a];
  }
  function setStops(jid, lo, hi) {
    const ok = App.change('Gelenk-Anschlag', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const a = round(Math.min(lo, hi), 2), b = round(Math.max(lo, hi), 2);
      const sw = sweepMeta(j);
      if (sw.key === 'pos') { j.minPos = a; j.maxPos = b; j.stopsLocked = true; }
      else if (sw.key === 'u') { j.minU = a; j.maxU = b; j.stopsLocked = true; }
      else if (sw.key === 'v') { j.minV = a; j.maxV = b; j.stopsLocked = true; }
      else if (sw.key === 'rx') { j.minRx = a; j.maxRx = b; j.stopsLocked = true; }
      else { j.min = a; j.max = b; }
    });
    if (ok === false) return;
    Panels.renderRight();
    UI.toast('Anschlag gesetzt – weiter lässt sich die Verbindung nicht bewegen.', { icon: 'check' });
  }

  // ---------- Bewegung abspielen: nur im Bild (das Projekt ändert sich nicht) ----------
  let anim = null;
  function stopPlay() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    clearTimeout(anim.timer);
    for (const id of anim.ids) { const it = top(id); if (it) Viewer.updateNode(id, { matrix: Model.localMatrix(it) }); }
    const b = anim.btn, jid = anim.jid; anim = null; Viewer.requestRender();
    const el = (b && b.isConnected) ? b : document.querySelector(`.joint-item[data-jid="${jid}"] [id^="jt-play"], #cp-play`);
    if (el) el.innerHTML = icon('play') + 'Bewegung abspielen';
    if (selJoint) {
      const sc = couplingList().find((c) => c.id === selJoint && c.kind === 'cam');
      if (sc) updateCamChartCursor(sc.id);
    }
  }
  function buildPlayLegs(j) {
    const k = kindOf(j), s0 = stateOf(j);
    const selfCoupled = couplingList().some((c) => c.j1 === j.id && c.j2 === j.id);
    if (k === 'cyl' && !selfCoupled) {
      const p0 = s0.pos, a0 = s0.ang;
      const pHi = j.maxPos ?? 20, pLo = j.minPos ?? -20;
      const aHi = j.max ?? 180, aLo = j.min ?? -180;
      const pts = [
        { ang: a0, pos: p0 },
        { ang: aHi, pos: pHi },
        { ang: aLo, pos: pLo },
        { ang: a0, pos: p0 },
      ];
      const legs = []; let T = 0;
      for (let i = 1; i < pts.length; i++) {
        const dp = Math.abs(pts[i].pos - pts[i - 1].pos) / Math.max(8, (pHi - pLo) / 0.9);
        const da = Math.abs(pts[i].ang - pts[i - 1].ang) / 240;
        const d = Math.max(400, Math.max(dp, da) * 1000);
        legs.push({ s0: pts[i - 1], s1: pts[i], t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    if (k === 'planar') {
      const uHi = j.maxU ?? 20, uLo = j.minU ?? -20;
      const vHi = j.maxV ?? 20, vLo = j.minV ?? -20;
      const aHi = j.max ?? 180, aLo = j.min ?? -180;
      const pts = [
        { u: s0.u, v: s0.v, ang: s0.ang },
        { u: uHi, v: vHi, ang: aHi },
        { u: uLo, v: vHi, ang: 0 },
        { u: uLo, v: vLo, ang: aLo },
        { u: s0.u, v: s0.v, ang: s0.ang },
      ];
      const legs = []; let T = 0;
      for (let i = 1; i < pts.length; i++) {
        const du = Math.abs(pts[i].u - pts[i - 1].u) / Math.max(10, (uHi - uLo) / 0.7);
        const dv = Math.abs(pts[i].v - pts[i - 1].v) / Math.max(10, (vHi - vLo) / 0.7);
        const da = Math.abs(pts[i].ang - pts[i - 1].ang) / 240;
        const d = Math.max(350, Math.max(du, dv, da) * 1000);
        legs.push({ s0: pts[i - 1], s1: pts[i], t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    if (k === 'ball') {
      const rx0 = s0.rx, ry0 = s0.ry, a0 = s0.ang;
      const cl = (v, lo, hi) => clamp(v, lo, hi);
      const pts = [
        { rx: rx0, ry: ry0, ang: a0 },
        { rx: cl(35, j.minRx ?? -180, j.maxRx ?? 180), ry: cl(20, j.minRy ?? -180, j.maxRy ?? 180), ang: cl(45, j.min ?? -180, j.max ?? 180) },
        { rx: cl(-35, j.minRx ?? -180, j.maxRx ?? 180), ry: cl(20, j.minRy ?? -180, j.maxRy ?? 180), ang: cl(-45, j.min ?? -180, j.max ?? 180) },
        { rx: cl(0, j.minRx ?? -180, j.maxRx ?? 180), ry: cl(-25, j.minRy ?? -180, j.maxRy ?? 180), ang: cl(0, j.min ?? -180, j.max ?? 180) },
        { rx: rx0, ry: ry0, ang: a0 },
      ];
      const legs = []; let T = 0;
      for (let i = 1; i < pts.length; i++) {
        const dMax = Math.max(Math.abs(pts[i].rx - pts[i - 1].rx), Math.abs(pts[i].ry - pts[i - 1].ry), Math.abs(pts[i].ang - pts[i - 1].ang));
        const d = Math.max(380, (dMax / 120) * 1000);
        legs.push({ s0: pts[i - 1], s1: pts[i], t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    if (k === 'slot') {
      const p0 = s0.pos, pHi = j.maxPos ?? 10, pLo = j.minPos ?? -10;
      const seq = Math.abs(p0 - pHi) < 1e-4 ? [p0, pLo, pHi, p0] : [p0, pHi, pLo, p0];
      const speed = Math.max(8, (pHi - pLo) / 1.1);
      const legs = []; let T = 0;
      for (let i = 1; i < seq.length; i++) {
        const dist = Math.abs(seq[i] - seq[i - 1]);
        if (dist < 1e-6) continue;
        const d = Math.max(350, (dist / speed) * 1000);
        legs.push({ s0: { pos: seq[i - 1] }, s1: { pos: seq[i] }, t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    const seq = [j.ang, j.max, j.min, j.ang], speed = slide(j) ? Math.max(5, (j.max - j.min) / 1.4) : 120;
    const legs = []; let T = 0;
    for (let i = 1; i < seq.length; i++) {
      const d = Math.abs(seq[i] - seq[i - 1]) / speed * 1000;
      legs.push({ s0: { ang: seq[i - 1] }, s1: { ang: seq[i] }, t0: T, t1: T + d });
      T += d;
    }
    return { legs, T };
  }
  function play(jid, btn) {
    if (typeof Motion !== 'undefined' && Motion.stop) Motion.stop();
    if (anim) { const same = anim.jid === jid; stopPlay(); if (same) return; }
    let j = list().find((x) => x.id === jid);
    const cpPlay = !j ? (couplingList().find((c) => c.id === jid) || null) : null;
    if (!j && cpPlay) {
      const j1 = list().find((x) => x.id === cpPlay.j1);
      const j2 = list().find((x) => x.id === cpPlay.j2);
      const b1 = j1 && top(j1.b);
      j = cpPlay.kind === 'cam' ? j1 : ((j1 && b1 && !b1.locked) ? j1 : j2);
    }
    if (!j || isConstraint(j) || isLoose(j)) return;
    const A = top(j.a), B = top(j.b); if (!A || !B) return;
    const core = cyclicCore(App.doc, j.id, true);
    if (core) {
      if (A.locked && B.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(B) }), { icon: 'lock' }); return; }
      const coreJSet = new Set(core.joints.map((x) => x.id));
      const freeCoreIds = [...core.partIds].filter((id) => { const it = top(id); return it && !it.locked; });
      const peeledMap = new Map();
      const peeledIds = [];
      for (const cid of freeCoreIds) {
        const ds = downstream(App.doc, cid, { stopAtLocked: true, skipJointIds: coreJSet }).map((k) => top(k.b)).filter(Boolean);
        peeledMap.set(cid, ds.map((it) => ({ it, m: Model.localMatrix(it) })));
        for (const it of ds) peeledIds.push(it.id);
      }
      if ([...freeCoreIds, ...peeledIds].some((id) => !isTop(id))) {
        UI.toast('Abspielen geht nur, wenn die bewegten Teile ganz oben im Verlauf liegen – in einer Gruppe zeigt das Bild sie als einen Körper. Mit dem Regler kannst du trotzdem jede Stellung ansehen.', { icon: 'info', ms: 5000 });
        return;
      }
      const st0 = stateOf(j);
      const { legs, T: dur } = buildPlayLegs(j);
      if (dur < 1 || !legs.length) return;
      const animDofs = Object.keys(legs[0].s0);
      const allIds = new Set([...freeCoreIds, ...peeledIds]);
      const baseW = new Map([...core.partIds].map((id) => [id, Model.worldMatrix(App.doc, id).clone()]));
      let animPoses = new Map([...core.partIds].map((id) => [id, mat4ToPose(baseW.get(id))]));
      let animSt = { ...st0 };
      const t0 = performance.now();
      const applyPose = (st) => {
        const sol = solveClosedPoses(App.doc, core, j, animDofs, animSt, st, { clampToReachable: false, startPoses: animPoses });
        if (!sol.ok || !sol.poses) return;
        animPoses = sol.poses;
        animSt = { ...st };
        for (const cid of freeCoreIds) {
          const ps = sol.poses.get(cid);
          if (!ps) continue;
          const Wnew = poseToMat4(ps);
          const Lnew = Model.parentWorld(App.doc, cid).invert().multiply(Wnew);
          Viewer.updateNode(cid, { matrix: Lnew });
          const ds = peeledMap.get(cid) || [];
          if (ds.length) {
            const D = Wnew.clone().multiply(baseW.get(cid).clone().invert());
            for (const d of ds) Viewer.updateNode(d.it.id, { matrix: D.clone().multiply(d.m) });
          }
        }
      };
      anim = { jid, ids: [...allIds], btn, raf: 0, timer: 0, st: st0, get a() { return this.st.ang; }, applyPose };
      if (btn) btn.innerHTML = icon('close') + 'Stopp';
      const step = () => {
        if (!anim) return;
        cancelAnimationFrame(anim.raf);
        clearTimeout(anim.timer);
        const t = performance.now() - t0;
        if (t >= dur) { stopPlay(); return; }
        const L = legs.find((l) => t < l.t1) || legs[legs.length - 1];
        const u = (t - L.t0) / Math.max(1, L.t1 - L.t0);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const st = { ...st0 };
        for (const key of Object.keys(L.s0)) st[key] = L.s0[key] + (L.s1[key] - L.s0[key]) * e;
        anim.st = st;
        applyPose(st);
        anim.raf = requestAnimationFrame(step);
        anim.timer = setTimeout(step, 50);
      };
      step();
      return;
    }
    if (B.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(B) }), { icon: 'lock' }); return; }
    if (!isTop(B.id) || downstream(App.doc, j.b, { stopAtLocked: true }).some((k) => !isTop(k.b))) { UI.toast('Abspielen geht nur, wenn die bewegten Teile ganz oben im Verlauf liegen – in einer Gruppe zeigt das Bild sie als einen Körper. Mit dem Regler kannst du trotzdem jede Stellung ansehen.', { icon: 'info', ms: 5000 }); return; }
    const cur = Model.localMatrix(B), st0 = stateOf(j), exp = pose(j, st0);
    const home = cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)
      ? conj(App.doc, j.b, stateMatrix(j, st0)).invert().multiply(cur).toArray()
      : j.home;
    const down = downstream(App.doc, j.b, { stopAtLocked: true }).map((k) => top(k.b)).filter(Boolean).map((it) => ({ it, m: Model.localMatrix(it) }));
    const { legs, T: dur } = (cpPlay && cpPlay.kind === 'cam')
      ? { legs: [{ s0: { ang: st0.ang }, s1: { ang: st0.ang + 360 }, t0: 0, t1: 3000 }], T: 3000 }
      : buildPlayLegs(j);
    if (dur < 1 || !legs.length) return;
    const animDofs = Object.keys(legs[0].s0);
    const hasSelfCoup = couplingList().some((c) => c.j1 === j.id && c.j2 === j.id);
    const cTargets0 = computeCoupledTargets(App.doc, animDofs.map((d) => ({ jid: j.id, dof: d, val: st0[d] })));
    const allIds = new Set([B.id, ...down.map((d) => d.it.id)]);
    const coupledAnim = [];
    for (const kjId of cTargets0.keys()) {
      if (kjId === j.id) continue;
      const kj = list().find((x) => x.id === kjId);
      const kb = kj && top(kj.b);
      if (!kj || !kb || kb.locked || !isTop(kb.id) || kb.id === B.id) continue;
      const kCur = Model.localMatrix(kb), kSt0 = stateOf(kj), kExp = pose(kj, kSt0);
      const kHome = kCur.elements.some((v, i) => Math.abs(v - kExp.elements[i]) > 1e-4)
        ? conj(App.doc, kj.b, stateMatrix(kj, kSt0)).invert().multiply(kCur).toArray()
        : kj.home;
      const kDown = downstream(App.doc, kj.b, { stopAtLocked: true }).map((k) => top(k.b)).filter((it) => it && isTop(it.id) && it.id !== B.id).map((it) => ({ it, m: Model.localMatrix(it) }));
      allIds.add(kb.id);
      for (const kd of kDown) allIds.add(kd.it.id);
      coupledAnim.push({ j: kj, b: kb, home: kHome, st0: kSt0, down: kDown });
    }
    const t0 = performance.now();
    const applyPose = (st) => {
      const tMap = (coupledAnim.length || hasSelfCoup)
        ? computeCoupledTargets(App.doc, animDofs.map((d) => ({ jid: j.id, dof: d, val: st[d] })))
        : null;
      const stEff = { ...st };
      if (tMap && tMap.has(j.id)) {
        for (const [d, val] of tMap.get(j.id)) {
          if (hasDof(j, d)) stEff[d] = clampDofVal(j, d, val);
        }
      }
      Viewer.updateNode(B.id, { matrix: pose(j, stEff, home) });
      const D = deltaMatrix(j, st0, stEff);
      for (const d of down) Viewer.updateNode(d.it.id, { matrix: D.clone().multiply(d.m) });
      for (const ca of coupledAnim) {
        const kSt = { ...ca.st0 };
        const dMap = tMap && tMap.get(ca.j.id);
        if (dMap) {
          for (const [d, val] of dMap) {
            if (hasDof(ca.j, d)) kSt[d] = clampDofVal(ca.j, d, val);
          }
        }
        Viewer.updateNode(ca.b.id, { matrix: pose(ca.j, kSt, ca.home) });
        const kD = deltaMatrix(ca.j, ca.st0, kSt);
        for (const kd of ca.down) Viewer.updateNode(kd.it.id, { matrix: kD.clone().multiply(kd.m) });
      }
      if (cpPlay && cpPlay.kind === 'cam') updateCamChartCursor(cpPlay.id, stEff.ang);
    };
    anim = { jid, ids: [...allIds], btn, raf: 0, timer: 0, st: st0, get a() { return this.st.ang; }, applyPose };
    if (btn) btn.innerHTML = icon('close') + 'Stopp';
    const step = () => {
      if (!anim) return;
      cancelAnimationFrame(anim.raf);
      clearTimeout(anim.timer);
      const t = performance.now() - t0;
      if (t >= dur) { stopPlay(); return; }
      const L = legs.find((l) => t < l.t1) || legs[legs.length - 1];
      const u = (t - L.t0) / Math.max(1, L.t1 - L.t0);
      const e = (cpPlay && cpPlay.kind === 'cam') ? u : (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const st = { ...st0 };
      for (const key of Object.keys(L.s0)) st[key] = L.s0[key] + (L.s1[key] - L.s0[key]) * e;
      anim.st = st;
      applyPose(st);
      anim.raf = requestAnimationFrame(step);
      anim.timer = setTimeout(step, 50);
    };
    step();
  }

  // ---------- Abschnitt „Gelenk / Verbindung“ im rechten Panel ----------
  function makeDofControl(j, sfx, { label, aria, val, min, max, step, unitStr, isLen, sliderId, valId, minId, maxId, key, minKey, maxKey }) {
    const frag = document.createDocumentFragment();
    const range = h('input', {
      type: 'range', id: sliderId + sfx, min, max, step, value: val,
      'aria-label': aria || label, style: { width: '100%' },
    });
    range.oninput = () => setState(j.id, { [key]: +range.value });
    frag.append(range);
    const f = h('div', { class: 'fields three' });
    const nfOpts = (id, lbl, v, onCommit) => (isLen
      ? UI.numField({ id, label: lbl, value: v, unit: 'mm', len: true, expr: false, onCommit })
      : UI.numField({ id, label: lbl, value: v, unit: unitStr, expr: false, onCommit }));
    f.append(
      nfOpts(valId + sfx, label, val, (v) => setState(j.id, { [key]: v })),
      nfOpts(minId + sfx, 'Von', min, (v) => setRange(j.id, minKey, v)),
      nfOpts(maxId + sfx, 'Bis', max, (v) => setRange(j.id, maxKey, v))
    );
    frag.append(f);
    return frag;
  }

  // ---------- Verlauf links & Eigenschaften rechts ----------
  function jointLabel(j) {
    if (j.name) return j.name;
    const A = top(j.a), B = top(j.b);
    return (A ? Model.label(A) : 'Teil A') + ' ↔ ' + (B ? Model.label(B) : 'Teil B');
  }
  function select(jid) {
    selJoint = jid || null;
    if (selJoint) {
      App.clearSelection();
      if (typeof Datums !== 'undefined') {
        if (Datums.selected) Datums.select(null);
        if (Datums.selectedAxis) Datums.selectAxis(null);
        if (Datums.selectedPoint) Datums.selectPoint(null);
        if (Datums.selectedCsys) Datums.selectCsys(null);
      }
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    drawSelectedJoint();
    Panels.renderLeft();
    Panels.renderRight();
  }

  function renderJointControls(j, sfx = '', opts = {}) {
    const A = top(j.a), B = top(j.b);
    const box = h('div', { class: 'joint-item', dataset: { jid: j.id } });
    if (isLoose(j)) {
      const k = kindOf(j);
      const hintHtml = k === 'parallel'
        ? `<b>${esc(Model.label(B))}</b> bleibt parallel zu <b>${esc(Model.label(A))}</b> (frei verschiebbar).`
        : k === 'tangent'
          ? `<b>${esc(Model.label(B))}</b> berührt <b>${esc(Model.label(A))}</b> tangential.`
          : `<b>${esc(Model.label(B))}</b> hält festen Abstand zu <b>${esc(Model.label(A))}</b>.`;
      box.append(h('div', { class: 'hint-box', html: hintHtml }));
      if (k === 'distance') {
        const fl = h('div', { class: 'fields' });
        fl.append(UI.numField({
          id: 'jt-dist' + sfx,
          label: T('joint.distLabel'),
          value: j.dist ?? 0,
          unit: 'mm',
          len: true,
          expr: true,
          onCommit: (v) => updateLoose(j.id, { dist: v }, { label: 'Abstand geändert', merge: 'jdist:' + j.id }),
        }));
        box.append(fl);
      }
      const r1 = h('div', { class: 'btn-row' });
      const fb = h('button', { type: 'button', class: 'btn' + (j.flip ? ' primary' : ''), id: 'jt-flip' + sfx, 'aria-pressed': String(!!j.flip) });
      fb.innerHTML = icon('mirror') + esc(k === 'parallel' ? T('joint.flipDir') : T('joint.flipSide'));
      fb.onclick = () => flipLoose(j.id);
      r1.append(fb);
      if (!opts.full) {
        const eb = h('button', { type: 'button', class: 'btn', id: 'jt-open' + sfx });
        eb.innerHTML = icon('edit') + 'Bearbeiten';
        eb.onclick = () => select(j.id);
        r1.append(eb);
      }
      const del = h('button', { type: 'button', class: 'btn danger', id: 'jt-del' + sfx });
      del.innerHTML = icon('ungroup') + esc(T('joint.removeBtn'));
      del.onclick = () => remove(j.id);
      box.append(r1, h('div', { class: 'btn-row' }, del));
      return box;
    }
    if (fixed(j)) {
      const modeLbl = j.mode === 'face' ? 'Fläche an Fläche' : 'Punkt an Punkt';
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ist fest mit <b>${esc(Model.label(A))}</b> verbunden (${modeLbl}).` }));
      const fl = h('div', { class: 'fields' });
      fl.append(UI.numField({ id: 'jt-rot' + sfx, label: 'Drehung', value: j.rot || 0, unit: '°', expr: false, onCommit: (v) => updateFixed(j.id, { rot: v }, { merge: 'jfix:rot:' + j.id }) }));
      if (j.mode === 'face') {
        fl.append(UI.numField({ id: 'jt-offset' + sfx, label: 'Abstand', value: j.offset || 0, len: true, expr: false, onCommit: (v) => updateFixed(j.id, { offset: v }, { merge: 'jfix:off:' + j.id }) }));
      }
      box.append(fl);
      const r1 = h('div', { class: 'btn-row' });
      const fb = h('button', { type: 'button', class: 'btn' + (j.flip ? ' primary' : ''), id: 'jt-flip' + sfx, 'aria-pressed': String(!!j.flip) });
      fb.innerHTML = icon('mirror') + esc(T('joint.fixedFlip'));
      fb.onclick = () => flipFixed(j.id);
      r1.append(fb);
      if (opts.full) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'jt-repick' + sfx });
        rb.innerHTML = icon('cursor') + esc(T('joint.repickBtn'));
        rb.onclick = () => startFixed(null, j.id);
        r1.append(rb);
      } else {
        const eb = h('button', { type: 'button', class: 'btn', id: 'jt-open' + sfx });
        eb.innerHTML = icon('edit') + 'Bearbeiten';
        eb.onclick = () => select(j.id);
        r1.append(eb);
      }
      const del = h('button', { type: 'button', class: 'btn danger', id: 'jt-del' + sfx });
      del.innerHTML = icon('ungroup') + esc(T('joint.removeBtn'));
      del.onclick = () => remove(j.id);
      box.append(r1, h('div', { class: 'btn-row' }, del));
      return box;
    }
    if (isAngle(j)) {
      const refKindLbl = (r) => (r && r.kind === 'edge' ? 'Kante' : 'Fläche');
      const curMeas = measureAngle(j.id);
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> (${refKindLbl(j.refB)}) im Winkel zu <b>${esc(Model.label(A))}</b> (${refKindLbl(j.refA)}) · gemessen: <b class="mono">${esc(fmtAngleU(curMeas))}</b>.` }));
      const fl = h('div', { class: 'fields' });
      fl.append(UI.numField({ id: 'jt-angle' + sfx, label: T('joint.angleLabel'), value: j.angle ?? 0, unit: '°', expr: true, onCommit: (v) => updateAngle(j.id, { angle: v }, { merge: 'jang:' + j.id }) }));
      box.append(fl);
      const r1 = h('div', { class: 'btn-row' });
      const fb = h('button', { type: 'button', class: 'btn' + (j.flip ? ' primary' : ''), id: 'jt-flip' + sfx, 'aria-pressed': String(!!j.flip) });
      fb.innerHTML = icon('mirror') + esc(T('joint.angleFlip'));
      fb.onclick = () => flipAngle(j.id);
      r1.append(fb);
      if (opts.full) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'jt-repick' + sfx });
        rb.innerHTML = icon('cursor') + esc(T('joint.repickAngleBtn'));
        rb.onclick = () => startAngle(null, j.id);
        r1.append(rb);
      } else {
        const eb = h('button', { type: 'button', class: 'btn', id: 'jt-open' + sfx });
        eb.innerHTML = icon('edit') + 'Bearbeiten';
        eb.onclick = () => select(j.id);
        r1.append(eb);
      }
      const del = h('button', { type: 'button', class: 'btn danger', id: 'jt-del' + sfx });
      del.innerHTML = icon('ungroup') + esc(T('joint.removeBtn'));
      del.onclick = () => remove(j.id);
      box.append(r1, h('div', { class: 'btn-row' }, del));
      return box;
    }
    if (isCenter(j)) {
      const m = centerMetrics(j.id);
      const infoTxt = m
        ? ` Nutbreite <b class="mono">${esc(Units.fmtLenU(m.widthA, 2))}</b> · Abstand links <b class="mono">${esc(Units.fmtLenU(m.gapLeft, 2))}</b>, rechts <b class="mono">${esc(Units.fmtLenU(m.gapRight, 2))}</b>.`
        : '';
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> sitzt mittig zwischen zwei Flächen von <b>${esc(Model.label(A))}</b>.${infoTxt}` }));
      const r1 = h('div', { class: 'btn-row' });
      if (opts.full) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'jt-repick' + sfx });
        rb.innerHTML = icon('cursor') + esc(T('joint.repickCenterBtn'));
        rb.onclick = () => startCenter(j.id);
        r1.append(rb);
      } else {
        const eb = h('button', { type: 'button', class: 'btn', id: 'jt-open' + sfx });
        eb.innerHTML = icon('edit') + 'Bearbeiten';
        eb.onclick = () => select(j.id);
        r1.append(eb);
      }
      const del = h('button', { type: 'button', class: 'btn danger', id: 'jt-del' + sfx });
      del.innerHTML = icon('ungroup') + esc(T('joint.removeBtn'));
      del.onclick = () => remove(j.id);
      r1.append(del);
      box.append(r1);
      return box;
    }
    const k = kindOf(j);
    const loopCore = cyclicCore(App.doc, j.id, true);
    const down = loopCore ? [] : downstream(App.doc, j.b).map((d) => top(d.b)).filter(Boolean);
      const moveTxt = down.length ? ` (${down.map((x) => '„' + esc(Model.label(x)) + '“').join(', ')} ${down.length === 1 ? 'bewegt sich' : 'bewegen sich'} mit)` : '';
      const verb = k === 'slide' ? 'gleitet entlang' : k === 'cyl' ? 'dreht und gleitet in' : k === 'planar' ? 'gleitet und dreht auf' : k === 'ball' ? 'dreht sich frei um den Punkt an' : k === 'slot' ? 'gleitet im Langloch von' : 'dreht sich gegenüber';
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ${verb} <b>${esc(Model.label(A))}</b>${moveTxt}.` }));
      if (loopCore) {
        box.append(h('div', { class: 'hint-box loop-hint', text: `Geschlossener Mechanismus (${loopCore.partIds.size} Teile) – alle Gelenke werden gemeinsam gelöst.` }));
      }
      box.append(UI.selectField({
        id: 'jt-kind' + sfx,
        label: 'Art',
        value: k,
        options: [
          ['rot', 'Drehen um die Achse'],
          ['slide', 'Schieben entlang der Achse'],
          ['cyl', 'Zylindrisch (Drehen + Schieben)'],
          ['planar', 'Eben (Fläche auf Fläche)'],
          ['ball', 'Kugel (Drehen frei)'],
          ['slot', 'Stift im Langloch'],
        ],
        onChange: (v) => setKind(j.id, v),
      }));

      if (k === 'cyl') {
        box.append(makeDofControl(j, sfx, {
          label: 'Winkel', aria: 'Gelenkwinkel', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Weg', aria: 'Verschiebung entlang der Achse', val: j.pos ?? 0, min: j.minPos ?? -20, max: j.maxPos ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-pos-range', valId: 'jt-pos', minId: 'jt-min-pos', maxId: 'jt-max-pos',
          key: 'pos', minKey: 'minPos', maxKey: 'maxPos',
        }));
      } else if (k === 'planar') {
        box.append(makeDofControl(j, sfx, {
          label: 'Quer (U)', aria: 'Verschiebung U', val: j.u ?? 0, min: j.minU ?? -20, max: j.maxU ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-u-range', valId: 'jt-u', minId: 'jt-min-u', maxId: 'jt-max-u',
          key: 'u', minKey: 'minU', maxKey: 'maxU',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Längs (V)', aria: 'Verschiebung V', val: j.v ?? 0, min: j.minV ?? -20, max: j.maxV ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-v-range', valId: 'jt-v', minId: 'jt-min-v', maxId: 'jt-max-v',
          key: 'v', minKey: 'minV', maxKey: 'maxV',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen', aria: 'Drehwinkel in der Ebene', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      } else if (k === 'ball') {
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen X', aria: 'Drehwinkel um X', val: j.rx ?? 0, min: j.minRx ?? -180, max: j.maxRx ?? 180, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-rx-range', valId: 'jt-rx', minId: 'jt-min-rx', maxId: 'jt-max-rx',
          key: 'rx', minKey: 'minRx', maxKey: 'maxRx',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen Y', aria: 'Drehwinkel um Y', val: j.ry ?? 0, min: j.minRy ?? -180, max: j.maxRy ?? 180, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-ry-range', valId: 'jt-ry', minId: 'jt-min-ry', maxId: 'jt-max-ry',
          key: 'ry', minKey: 'minRy', maxKey: 'maxRy',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen Z', aria: 'Drehwinkel um Z', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      } else if (k === 'slot') {
        box.append(makeDofControl(j, sfx, {
          label: 'Weg', aria: 'Verschiebung im Langloch', val: j.pos ?? 0, min: j.minPos ?? -10, max: j.maxPos ?? 10, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-pos-range', valId: 'jt-pos', minId: 'jt-min-pos', maxId: 'jt-max-pos',
          key: 'pos', minKey: 'minPos', maxKey: 'maxPos',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen', aria: 'Drehwinkel um den Stift', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      } else {
        box.append(makeDofControl(j, sfx, {
          label: slide(j) ? 'Weg' : 'Winkel', aria: slide(j) ? 'Weg' : 'Gelenkwinkel',
          val: j.ang, min: j.min, max: j.max, step: slide(j) ? 0.5 : 1,
          unitStr: unit(j), isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      }

      const sw = sweepMeta(j);
      const res = h('div', { class: 'hint-box', id: 'jt-result' + sfx, hidden: true });
      const cb = h('button', { type: 'button', class: 'btn', id: 'jt-check' + sfx }); cb.innerHTML = icon('hinge') + 'Bewegung prüfen';
      cb.onclick = async () => {
        cb.disabled = true; res.hidden = false; res.className = 'hint-box'; res.textContent = sw.len ? 'Prüfe Schritt für Schritt …' : 'Prüfe in 5°-Schritten …';
        const r = await check(j.id); cb.disabled = false;
        if (!r) { res.textContent = 'Das ging nicht.'; return; }
        const d = describe(j, r); res.className = d.ok ? 'ok-box' : 'err-box'; res.textContent = d.text; res.dataset.hits = String(r.filter((x) => x.v > 0.05).length);
        const fr = d.ok ? null : freeRange(j, r);
        const old = box.querySelector('.jt-stop'); if (old) old.remove();
        if (fr && fr[1] - fr[0] > 1e-9 && (fr[0] > sw.lo + 1e-9 || fr[1] < sw.hi - 1e-9)) {
          const fVal = (x) => (sw.len ? Units.fmtLen(x, 1) : fmtAngle(x));
          const uLbl = sw.len ? Units.label() : '°';
          const sb = h('button', { type: 'button', class: 'btn small jt-stop', id: 'jt-stop' + sfx }); sb.innerHTML = icon('check') + `Als Anschlag übernehmen: ${fVal(fr[0])} … ${fVal(fr[1])} ${uLbl}`;
          sb.onclick = () => setStops(j.id, fr[0], fr[1]);
          res.after(sb);
        }
      };
      const pb = h('button', { type: 'button', class: 'btn', id: 'jt-play' + sfx }); pb.innerHTML = icon(anim && anim.jid === j.id ? 'close' : 'play') + (anim && anim.jid === j.id ? 'Stopp' : 'Bewegung abspielen');
      pb.onclick = () => play(j.id, pb);
      const del = h('button', { type: 'button', class: 'btn', id: 'jt-del' + sfx }); del.innerHTML = icon('ungroup') + ((k === 'cyl' || k === 'planar' || k === 'ball' || k === 'slot') ? 'Verbindung lösen' : 'Gelenk lösen');
      del.onclick = () => remove(j.id);
      const row1 = h('div', { class: 'btn-row' }, pb);
      if (k === 'cyl' || k === 'planar' || k === 'slot') {
        const fb = h('button', { type: 'button', class: 'btn', id: 'jt-flip' + sfx });
        fb.innerHTML = icon('mirror') + (k === 'cyl' ? 'Richtung umkehren' : 'Seite umkehren');
        fb.onclick = () => flip(j.id);
        row1.append(fb);
      }
      box.append(row1, h('div', { class: 'btn-row' }, cb, del), res);
    return box;
  }

  function treeSection() {
    const js = list().filter((j) => top(j.a) && top(j.b));
    const jIds = new Set(js.map((j) => j.id));
    const cs = couplingList().filter((c) => jIds.has(c.j1) && jIds.has(c.j2));
    if (!js.length && !cs.length) return null;
    const V = js.some(isDistance) ? Model.vars(App.doc).v : null;
    const head = h('div', { class: 'section-h', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } }, h('span', null, T('joint.treeHeading')));
    const kinCount = js.filter((j) => !isConstraint(j) && !isLoose(j)).length;
    if (kinCount > 0) {
      const addCBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-add-coupling', 'data-help': 'coupleGear' }, T('joint.addCouplingBtn'));
      addCBtn.onclick = (e) => {
        e.stopPropagation();
        UI.menu(addCBtn, [
          { icon: 'gear', label: T('ctx.coupleGear'), help: 'coupleGear', run: () => startGear() },
          { icon: 'moveStep', label: T('ctx.coupleRack'), help: 'coupleRack', run: () => startRack() },
          { icon: 'helix', label: T('ctx.coupleScrew'), help: 'coupleScrew', run: () => startScrew() },
          { icon: 'link', label: T('ctx.coupleBelt'), help: 'coupleBelt', run: () => startBelt() },
          { icon: 'moveStep', label: T('ctx.coupleLinear'), help: 'coupleLinear', run: () => startLinear() },
          { icon: 'cam', label: T('ctx.coupleCam'), help: 'coupleCam', run: () => startCam() },
        ]);
      };
      head.append(addCBtn);
    }
    const sec = h('div', { class: 'datum-tree joint-tree', id: 'joint-tree', 'data-help': 'fixedJoint' }, head);
    for (const j of js) {
      const row = h('div', { class: 'tree-row joint-row' + (j.id === selJoint ? ' sel' : ''), 'data-joint': j.id });
      const icName = fixed(j) ? 'lock' : isAngle(j) ? 'rotate' : isCenter(j) ? 'cSymmetric' : isParallel(j) ? 'cParallel' : isTangent(j) ? 'cTangent' : isDistance(j) ? 'clearance' : 'hinge';
      const ic = h('span', { class: 'swatch joint' }); ic.innerHTML = icon(icName);
      const subTxt = fixed(j) ? (j.flip ? `${T('joint.fixedKind')} · ↺` : T('joint.fixedKind'))
        : isAngle(j) ? `${fmtAngleU(evalAngleDeg(j.angle))}${j.flip ? ' · ↺' : ''}`
        : isCenter(j) ? T('joint.centerKind')
        : isParallel(j) ? (j.flip ? `${T('joint.parallelKind')} · ↺` : T('joint.parallelKind'))
        : isTangent(j) ? (j.flip ? `${T('joint.tangentKind')} · ↺` : T('joint.tangentKind'))
        : isDistance(j) ? `${T('joint.distanceKind')} · ${Units.fmtLenU(evalDist(j, V), 2)}`
        : isCyl(j) ? 'Zylindrisch' : isPlanar(j) ? 'Eben' : isBall(j) ? 'Kugel' : isSlot(j) ? 'Langloch' : (slide(j) ? 'Schieben' : 'Drehen');
      const del = h('button', { type: 'button', class: 'j-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); remove(j.id); };
      row.append(ic, h('span', { class: 'nm', title: jointLabel(j) }, jointLabel(j)), h('span', { class: 'sub mono' }, subTxt), h('span', { class: 'm-acts' }, del));
      row.onclick = () => select(j.id === selJoint ? null : j.id);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: 'Bearbeiten', run: () => select(j.id) },
          ...(fixed(j) ? [{ icon: 'mirror', label: T('joint.fixedFlip'), run: () => flipFixed(j.id) }] : []),
          ...(isAngle(j) ? [{ icon: 'mirror', label: T('joint.angleFlip'), run: () => flipAngle(j.id) }] : []),
          ...(isLoose(j) ? [{ icon: 'mirror', label: isParallel(j) ? T('joint.flipDir') : T('joint.flipSide'), run: () => flipLoose(j.id) }] : []),
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('common.rename'), T('common.name'), jointLabel(j), T('common.rename')); if (n && n.trim()) App.change('Verbindung umbenannt', (doc) => { const x = list(doc).find((y) => y.id === j.id); if (x) x.name = n.trim(); }); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => remove(j.id) },
        ]);
      });
      sec.append(row);
    }
    for (const c of cs) {
      const row = h('div', { class: 'tree-row coupling-row pro' + (c.id === selJoint ? ' sel' : ''), 'data-coupling': c.id });
      const icName = c.kind === 'gear' ? 'gear' : c.kind === 'screw' ? 'helix' : c.kind === 'belt' ? 'link' : c.kind === 'cam' ? 'cam' : 'moveStep';
      const ic = h('span', { class: 'swatch joint' }); ic.innerHTML = icon(icName);
      const del = h('button', { type: 'button', class: 'j-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); removeCoupling(c.id); };
      row.append(ic, h('span', { class: 'nm', title: couplingLabel(c) }, couplingLabel(c)), h('span', { class: 'sub mono' }, couplingSummary(c)), h('span', { class: 'm-acts' }, del));
      row.onclick = () => select(c.id === selJoint ? null : c.id);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: 'Bearbeiten', run: () => select(c.id) },
          { icon: 'mirror', label: 'Richtung umkehren', run: () => updateCoupling(c.id, { reverse: !c.reverse }) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('common.rename'), T('common.name'), couplingLabel(c), T('common.rename')); if (n && n.trim()) updateCoupling(c.id, { name: n.trim() }); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => removeCoupling(c.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }

  function buildCamChart(cOrPreview, opts = {}) {
    const data = camCurveData(cOrPreview);
    if (!data || !data.ok || !data.samples.length) return null;
    const svgNS = 'http://www.w3.org/2000/svg';
    const mkSvg = (tag, attrs = {}, txt = null) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      if (txt != null) el.textContent = txt;
      return el;
    };
    const W = 260, H = 116;
    const x0 = 34, x1 = 248, y0 = 12, y1 = 92;
    const pw = x1 - x0, ph = y1 - y0;
    const maxY = Math.max(0.01, data.stroke);
    const sx = (ang) => x0 + (clamp(ang, 0, 360) / 360) * pw;
    const sy = (lift) => y1 - (clamp(lift, 0, maxY) / maxY) * ph;

    const wrap = h('div', { class: 'cam-chart-wrap', id: opts.id || 'cam-chart' });
    const strokeSpan = h('span', { class: 'mono', id: opts.strokeId || (opts.interactive === false ? '' : 'cam-stroke') }, `${T('joint.camStrokeLabel')}: ${Units.fmtLenU(data.stroke, 2)}`);
    wrap.append(h('div', { class: 'cam-chart-head' }, h('span', null, T('joint.camChartTitle')), strokeSpan));

    const svg = mkSvg('svg', {
      class: 'cam-chart-svg',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': T('joint.camChartTitle'),
      'data-stroke': round(data.stroke, 4),
      'data-samples': data.samples.length - 1,
    });
    for (const a of [90, 180, 270, 360]) {
      const x = round(sx(a), 2);
      svg.append(mkSvg('line', { class: 'cam-grid', x1: x, y1: y0, x2: x, y2: y1 }));
    }
    for (const f of [0.5, 1]) {
      const y = round(y1 - f * ph, 2);
      svg.append(mkSvg('line', { class: 'cam-grid', x1: x0, y1: y, x2: x1, y2: y }));
    }
    svg.append(
      mkSvg('line', { class: 'cam-axis', x1: x0, y1: y0, x2: x0, y2: y1 }),
      mkSvg('line', { class: 'cam-axis', x1: x0, y1: y1, x2: x1, y2: y1 })
    );
    for (const a of [0, 90, 180, 270, 360]) {
      svg.append(mkSvg('text', { class: 'cam-axis-lbl', x: round(sx(a), 2), y: H - 6, 'text-anchor': a === 0 ? 'start' : a === 360 ? 'end' : 'middle' }, `${a}°`));
    }
    svg.append(
      mkSvg('text', { class: 'cam-axis-lbl', x: x0 - 4, y: y1 + 3, 'text-anchor': 'end' }, '0'),
      mkSvg('text', { class: 'cam-axis-lbl', x: x0 - 4, y: y0 + 6, 'text-anchor': 'end' }, Units.fmtLen(data.stroke, 1))
    );

    const pts = [];
    for (let a = 0; a <= 360; a += 3) {
      const s = data.samples[a];
      pts.push(`${round(sx(a), 2)},${round(sy(s.lift), 2)}`);
    }
    const lineD = 'M' + pts.join(' L');
    const areaD = lineD + ` L${x1},${y1} L${x0},${y1} Z`;
    svg.append(mkSvg('path', { class: 'cam-area', d: areaD }));
    svg.append(mkSvg('path', { class: 'cam-curve', d: lineD }));

    const cx = round(sx(data.curAngNorm), 2), cy = round(sy(data.curLift), 2);
    const cursor = mkSvg('line', { class: 'cam-cursor', x1: cx, y1: y0, x2: cx, y2: y1 });
    const dot = mkSvg('circle', { class: 'cam-dot', cx, cy, r: 3.6 });
    svg.append(cursor, dot);
    wrap.append(svg);

    if (opts.interactive !== false) {
      const foot = h('div', { class: 'cam-chart-foot' },
        h('span', { class: 'mono', id: 'cam-cur' }, `φ = ${fmtAngleU(data.curAngNorm)} → ${T('joint.camStrokeLabel')} ${Units.fmtLenU(data.curLift, 2)}`),
        h('span', null, 'Klicken/Ziehen: Winkel')
      );
      wrap.append(foot);

      const scrub = (ev) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const svgX = ((ev.clientX - rect.left) / rect.width) * W;
        const ang = round(clamp(((svgX - x0) / pw) * 360, 0, 360), 1);
        if (cOrPreview && cOrPreview.j1) setState(cOrPreview.j1, { [cOrPreview.dof1 || 'ang']: ang });
      };
      let down = false;
      svg.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        down = true;
        try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
        scrub(ev);
      });
      svg.addEventListener('pointermove', (ev) => { if (down) scrub(ev); });
      svg.addEventListener('pointerup', (ev) => { down = false; try { svg.releasePointerCapture(ev.pointerId); } catch (_) {} });
      svg.addEventListener('pointercancel', () => { down = false; });
    }
    return wrap;
  }

  function updateCamChartCursor(cid, angDeg = null) {
    const wrap = document.getElementById('cam-chart');
    if (!wrap) return;
    const c = couplingList().find((x) => x.id === cid && x.kind === 'cam');
    if (!c) return;
    const j1 = list().find((x) => x.id === c.j1);
    const ang = angDeg != null ? angDeg : (j1 ? (Number(stateOf(j1)[c.dof1 || 'ang']) || 0) : 0);
    const lv = camLiftAt(App.doc, c, ang);
    if (!lv) return;
    const x0 = 34, x1 = 248, y0 = 12, y1 = 92;
    const maxY = Math.max(0.01, lv.stroke);
    const cx = round(x0 + (clamp(lv.angNorm, 0, 360) / 360) * (x1 - x0), 2);
    const cy = round(y1 - (clamp(lv.lift, 0, maxY) / maxY) * (y1 - y0), 2);
    const cur = wrap.querySelector('.cam-cursor');
    const dot = wrap.querySelector('.cam-dot');
    const txt = wrap.querySelector('#cam-cur');
    if (cur) { cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); }
    if (dot) { dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); }
    if (txt) txt.textContent = `φ = ${fmtAngleU(lv.angNorm)} → ${T('joint.camStrokeLabel')} ${Units.fmtLenU(lv.lift, 2)}`;
  }

  function renderCouplingPanel(body, c) {
    const j1 = list().find((x) => x.id === c.j1);
    const j2 = list().find((x) => x.id === c.j2);
    if (!j1 || !j2) return false;
    const helpKey = couplingHelpKey(c.kind);
    const w = h('div', { class: 'props', id: 'coupling-edit-panel', 'data-help': helpKey });
    const nm = h('input', { id: 'cp-edit-name', value: couplingLabel(c), 'aria-label': T('common.name') });
    nm.addEventListener('change', () => {
      const v = nm.value.trim();
      if (v) updateCoupling(c.id, { name: v });
    });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));

    const links = h('div', { class: 'mini-list' });
    const mkJRow = (lbl, j, dof) => {
      const stVal = stateOf(j)[dof] ?? 0;
      const u = isLenDof(j, dof) ? Units.fmtLenU(stVal, 2) : fmtAngleU(stVal);
      const r = h('div', { class: 'mini-row dep-row', style: { cursor: 'pointer' } }, h('span', { class: 'grow' }, `${lbl}: ${jointLabel(j)} (${dofLabel(j, dof)})`), h('b', { class: 'mono' }, u));
      r.onclick = () => select(j.id);
      return r;
    };
    links.append(mkJRow(c.kind === 'cam' ? 'Scheibe' : 'Antrieb', j1, c.dof1), mkJRow(c.kind === 'cam' ? 'Stößel' : 'Mitlauf', j2, c.dof2));
    w.append(links);

    if (c.kind === 'cam') {
      const prof = camProfile(App.doc, c);
      const stStr = prof && prof.valid ? Units.fmtLenU(prof.stroke, 2) : '—';
      w.append(h('div', { class: 'hint-box', id: 'cp-edit-readout', html: `<b>${esc(jointLabel(j2))}</b> folgt der Außenkontur von <b>${esc(jointLabel(j1))}</b> · Gesamthub: <b class="mono">${esc(stStr)}</b>.` }));
      const chart = buildCamChart(c, { id: 'cam-chart', interactive: true });
      if (chart) w.append(chart);
      const curAng = Number(stateOf(j1)[c.dof1 || 'ang']) || 0;
      const angSlider = h('input', { type: 'range', id: 'cam-ang-range', min: j1.min ?? -360, max: j1.max ?? 360, step: 1, value: curAng, 'aria-label': T('joint.camAngleLabel'), style: { width: '100%' } });
      angSlider.oninput = () => setState(j1.id, { [c.dof1 || 'ang']: +angSlider.value });
      w.append(angSlider);
      const camFields = h('div', { class: 'fields' });
      camFields.append(UI.numField({
        id: 'cam-ang', label: T('joint.camAngleLabel'), value: curAng, unit: '°', expr: false,
        onCommit: (v) => setState(j1.id, { [c.dof1 || 'ang']: v }),
      }));
      if (c.contact !== 'flat') {
        camFields.append(UI.numField({
          id: 'cp-edit-roller', label: T('joint.camRollerLabel'), value: c.rollerR ?? 0, unit: 'mm', len: true, expr: false, min: 0,
          onCommit: (v) => updateCoupling(c.id, { rollerR: v }, { merge: 'cp:' + c.id }),
        }));
      }
      w.append(
        UI.selectField({
          id: 'cp-edit-contact', label: T('joint.camContactLabel'), value: c.contact === 'flat' ? 'flat' : 'point',
          options: [['point', T('joint.camContactPoint')], ['flat', T('joint.camContactFlat')]],
          onChange: (v) => updateCoupling(c.id, { contact: v }),
        }),
        camFields
      );
      const revChk = h('input', { type: 'checkbox', id: 'cp-edit-reverse', checked: !!c.reverse });
      revChk.onchange = () => updateCoupling(c.id, { reverse: revChk.checked });
      w.append(h('label', { class: 'check' }, revChk, T('joint.camRevLabel')));
      const snapBtn = h('button', { type: 'button', class: 'btn', id: 'cp-cam-snap' }, icon('snap') + esc(T('joint.camSnapBtn')));
      snapBtn.onclick = () => snapCamContact(c.id);
      const pb = h('button', { type: 'button', class: 'btn', id: 'cp-play' });
      const isPlaying = anim && (anim.jid === c.id || anim.jid === j1.id);
      pb.innerHTML = icon(isPlaying ? 'close' : 'play') + (isPlaying ? 'Stopp' : 'Bewegung abspielen');
      pb.onclick = () => play(c.id, pb);
      const del = h('button', { type: 'button', class: 'btn danger', id: 'cp-del' });
      del.innerHTML = icon('ungroup') + esc(T('joint.coupleRemoveBtn'));
      del.onclick = () => removeCoupling(c.id);
      w.append(h('div', { class: 'btn-row' }, snapBtn), h('div', { class: 'btn-row' }, pb, del));
      body.append(w);
      return true;
    }

    const hintTxt = c.kind === 'gear'
      ? `<b>${esc(jointLabel(j2))}</b> dreht mit <b class="mono">${esc(fmt(Math.abs(couplingGain(c)) * 100))} %</b> der Drehzahl von <b>${esc(jointLabel(j1))}</b>${c.reverse ? ' (gegenläufig)' : ''}.`
      : c.kind === 'rack'
        ? `Drehen um 90° an <b>${esc(jointLabel(j1))}</b> (Ø ${esc(fmt(rackPitchDia(c)))} mm) schiebt <b>${esc(jointLabel(j2))}</b> um <b class="mono">${c.reverse ? '−' : '+'}${esc(Units.fmtLenU(Math.abs(couplingGain(c)) * 90, 2))}</b>.`
        : c.kind === 'screw'
          ? `Drehen um 360° an <b>${esc(jointLabel(j1))}</b> verschiebt um <b class="mono">${c.reverse ? '−' : '+'}${esc(Units.fmtLenU(c.pitch, 2))}</b>.`
          : c.kind === 'belt'
            ? `<b>${esc(jointLabel(j2))}</b> dreht mit <b class="mono">${esc(fmt(Math.abs(couplingGain(c)) * 100))} %</b> der Drehzahl von <b>${esc(jointLabel(j1))}</b>${c.reverse ? ' (gegenläufig)' : ''}.`
            : `<b>${esc(jointLabel(j2))}</b> bewegt sich mit Faktor <b class="mono">${c.reverse ? '−' : '+'}${esc(fmt(c.ratio))}×</b> zu <b>${esc(jointLabel(j1))}</b>.`;
    w.append(h('div', { class: 'hint-box', id: 'cp-edit-readout', html: hintTxt }));

    const fl = h('div', { class: 'fields' });
    if (c.kind === 'gear') {
      w.append(UI.selectField({
        id: 'cp-edit-mode', label: T('joint.gearModeLabel'), value: c.mode === 'ratio' ? 'ratio' : 'teeth',
        options: [['teeth', T('joint.gearModeTeeth')], ['ratio', T('joint.gearModeRatio')]],
        onChange: (v) => updateCoupling(c.id, { mode: v }),
      }));
      if (c.mode === 'ratio') {
        fl.append(UI.numField({
          id: 'cp-edit-ratio', label: 'Übersetzung', value: c.ratio ?? 0.5, unit: '×', len: false, expr: false, min: 0.001,
          onCommit: (v) => updateCoupling(c.id, { ratio: v }, { merge: 'cp:' + c.id }),
        }));
      } else {
        fl.append(
          UI.numField({
            id: 'cp-edit-z1', label: 'Zahnrad 1 (Zähne)', value: c.z1 ?? 20, unit: 'Z', len: false, expr: false, min: 0.001,
            onCommit: (v) => updateCoupling(c.id, { z1: v }, { merge: 'cp:' + c.id }),
          }),
          UI.numField({
            id: 'cp-edit-z2', label: 'Zahnrad 2 (Zähne)', value: c.z2 ?? 40, unit: 'Z', len: false, expr: false, min: 0.001,
            onCommit: (v) => updateCoupling(c.id, { z2: v }, { merge: 'cp:' + c.id }),
          })
        );
      }
    } else if (c.kind === 'rack') {
      w.append(UI.selectField({
        id: 'cp-edit-mode', label: T('joint.rackModeLabel'), value: c.mode === 'module' ? 'module' : 'diameter',
        options: [['diameter', T('joint.rackModeDia')], ['module', T('joint.rackModeMod')]],
        onChange: (v) => updateCoupling(c.id, { mode: v }),
      }));
      if (c.mode === 'module') {
        fl.append(
          UI.numField({
            id: 'cp-edit-mod', label: 'Modul', value: c.module ?? 1.5, unit: 'mm', len: false, expr: false, min: 0.001,
            onCommit: (v) => updateCoupling(c.id, { module: v }, { merge: 'cp:' + c.id }),
          }),
          UI.numField({
            id: 'cp-edit-z1', label: 'Ritzel (Zähne)', value: c.z1 ?? 20, unit: 'Z', len: false, expr: false, min: 0.001,
            onCommit: (v) => updateCoupling(c.id, { z1: v }, { merge: 'cp:' + c.id }),
          })
        );
      } else {
        fl.append(UI.numField({
          id: 'cp-edit-d', label: 'Teilkreis-Ø', value: c.d ?? 20, unit: 'mm', len: true, expr: false, min: 0.001,
          onCommit: (v) => updateCoupling(c.id, { d: v }, { merge: 'cp:' + c.id }),
        }));
      }
    } else if (c.kind === 'screw') {
      fl.append(UI.numField({
        id: 'cp-edit-pitch', label: T('joint.pitchLabel') + ' (mm/U)', value: c.pitch ?? 2, unit: 'mm/U', len: false, expr: false, min: 0.001,
        onCommit: (v) => updateCoupling(c.id, { pitch: v }, { merge: 'cp:' + c.id }),
      }));
    } else if (c.kind === 'belt') {
      w.append(UI.selectField({
        id: 'cp-edit-mode', label: T('joint.beltModeLabel'), value: c.mode === 'diameter' ? 'diameter' : 'teeth',
        options: [['teeth', T('joint.beltModeTeeth')], ['diameter', T('joint.beltModeDia')]],
        onChange: (v) => updateCoupling(c.id, { mode: v }),
      }));
      const isDia = c.mode === 'diameter';
      fl.append(
        UI.numField({
          id: 'cp-edit-v1', label: isDia ? 'Rad 1 Ø' : 'Rad 1 (Zähne)', value: isDia ? (c.d1 ?? 20) : (c.z1 ?? 20), unit: isDia ? 'mm' : 'Z', len: false, expr: false, min: 0.001,
          onCommit: (v) => updateCoupling(c.id, isDia ? { d1: v } : { z1: v }, { merge: 'cp:' + c.id }),
        }),
        UI.numField({
          id: 'cp-edit-v2', label: isDia ? 'Rad 2 Ø' : 'Rad 2 (Zähne)', value: isDia ? (c.d2 ?? 40) : (c.z2 ?? 40), unit: isDia ? 'mm' : 'Z', len: false, expr: false, min: 0.001,
          onCommit: (v) => updateCoupling(c.id, isDia ? { d2: v } : { z2: v }, { merge: 'cp:' + c.id }),
        })
      );
    } else {
      fl.append(UI.numField({
        id: 'cp-edit-ratio', label: T('joint.linearRatioLabel'), value: c.ratio ?? 1, unit: '×', len: false, expr: false, min: 0.001,
        onCommit: (v) => updateCoupling(c.id, { ratio: v }, { merge: 'cp:' + c.id }),
      }));
    }
    w.append(fl);

    const revLbl = c.kind === 'gear' ? T('joint.gearRevLabel')
      : c.kind === 'rack' ? T('joint.rackRevLabel')
        : c.kind === 'screw' ? T('joint.screwRevLabel')
          : c.kind === 'belt' ? T('joint.beltRevLabel') : T('joint.linearRevLabel');
    const revChk = h('input', { type: 'checkbox', id: 'cp-edit-reverse', checked: !!c.reverse });
    revChk.onchange = () => updateCoupling(c.id, { reverse: revChk.checked });
    w.append(h('label', { class: 'check' }, revChk, revLbl));

    const pb = h('button', { type: 'button', class: 'btn', id: 'cp-play' });
    const isPlaying = !!(anim && (anim.jid === c.id || anim.jid === j1.id));
    pb.innerHTML = icon(isPlaying ? 'close' : 'play') + (isPlaying ? 'Stopp' : 'Bewegung abspielen');
    pb.onclick = () => play(c.id, pb);
    const del = h('button', { type: 'button', class: 'btn danger', id: 'cp-del' });
    del.innerHTML = icon('ungroup') + esc(T('joint.coupleRemoveBtn'));
    del.onclick = () => removeCoupling(c.id);
    w.append(h('div', { class: 'btn-row' }, pb, del));
    body.append(w);
    return true;
  }

  function renderPanel(body) {
    const j = list().find((x) => x.id === selJoint);
    if (!j) {
      const c = couplingList().find((x) => x.id === selJoint);
      return c ? renderCouplingPanel(body, c) : false;
    }
    const A = top(j.a), B = top(j.b);
    if (!A || !B) return false;
    const helpKey = fixed(j) ? 'fixedJoint' : isAngle(j) ? 'mateAngle' : isCenter(j) ? 'mateCenter' : isParallel(j) ? 'mateParallel' : isTangent(j) ? 'mateTangent' : isDistance(j) ? 'mateDistance' : isCyl(j) ? 'mateCyl' : isPlanar(j) ? 'matePlanar' : isBall(j) ? 'mateBall' : isSlot(j) ? 'mateSlot' : null;
    const w = h('div', { class: 'props', id: 'joint-edit-panel', 'data-help': helpKey });
    const nm = h('input', { id: 'jt-name', value: jointLabel(j), 'aria-label': T('common.name') });
    nm.addEventListener('change', () => {
      const v = nm.value.trim();
      if (v) App.change('Verbindung umbenannt', (doc) => { const x = list(doc).find((y) => y.id === j.id); if (x) x.name = v; });
    });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    const parts = h('div', { class: 'mini-list' });
    const mkPartRow = (lbl, item) => {
      const r = h('div', { class: 'mini-row dep-row', style: { cursor: 'pointer' } }, h('span', { class: 'grow' }, lbl), h('b', null, Model.label(item)));
      r.onclick = () => App.select([item.id]);
      return r;
    };
    parts.append(mkPartRow('Teil 1 (fest)', A), mkPartRow('Teil 2 (angelegt)', B));
    w.append(parts, renderJointControls(j, '', { full: true }));
    if (!isConstraint(j) && !isLoose(j) && typeof Assembly !== 'undefined' && Assembly.poseSection) {
      const ps = Assembly.poseSection('joint');
      if (ps) w.append(ps);
    }
    if (!isConstraint(j) && !isLoose(j) && typeof Motion !== 'undefined' && Motion.open) {
      const mb = h('button', { type: 'button', class: 'btn small pro', id: 'jt-motion-btn', 'data-help': 'motionStudy' });
      mb.innerHTML = icon('play') + esc(T('motion.jointOpenBtn'));
      mb.onclick = () => Motion.open({ jointId: j.id });
      w.append(h('div', { class: 'btn-row pro' }, mb));
    }
    body.append(w);
    return true;
  }

  // Abschnitt „Gelenk“ / „Verbindungen“ in den Eigenschaften – zeigt alle Verbindungen des gewählten Teils
  function panel(it) {
    const js = allOf(it.id).filter((j) => top(j.a) && top(j.b));
    if (!js.length) return null;
    const anyConn = js.some((j) => isConstraint(j) || isLoose(j) || isCyl(j) || isPlanar(j) || isBall(j) || isSlot(j));
    const title = js.length > 1 ? (anyConn ? `Verbindungen (${js.length})` : `Gelenke (${js.length})`) : (anyConn ? 'Verbindung' : 'Gelenk');
    const sec = h('div', { class: 'section', id: 'joint-sec' }, h('div', { class: 'section-h' }, title));
    js.forEach((j, idx) => {
      if (idx > 0) sec.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '6px 0', width: '100%' } }));
      sec.append(renderJointControls(j, idx ? '-' + idx : ''));
    });
    const jIds = new Set(js.map((j) => j.id));
    const cs = couplingList().filter((c) => jIds.has(c.j1) || jIds.has(c.j2));
    if (cs.length) {
      const cList = h('div', { class: 'mini-list coupling-mini pro', style: { marginTop: '6px' } });
      for (const c of cs) {
        const eb = h('button', { type: 'button', class: 'btn small' }, 'Bearbeiten');
        eb.onclick = () => select(c.id);
        cList.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, `${couplingLabel(c)} (${couplingSummary(c)})`), eb));
      }
      sec.append(cList);
    }
    const kinJ = js.find((j) => !isConstraint(j) && !isLoose(j));
    if (kinJ) {
      const addBtn = h('button', { type: 'button', class: 'btn small pro', id: 'jt-add-coupling', 'data-help': 'coupleGear' }, T('joint.addCouplingBtn'));
      addBtn.onclick = () => startCoupling(isCyl(kinJ) ? 'screw' : slide(kinJ) ? 'rack' : 'gear', { j1: kinJ.id });
      sec.append(h('div', { class: 'btn-row pro', style: { marginTop: '6px' } }, addBtn));
    }
    return sec;
  }

  // Mehrere Gelenk-Stellungen auf einmal setzen (für benannte Stellungen, BG-20)
  function applyStates(doc, stateMap, opts = {}) {
    doc = doc || App.doc;
    if (!stateMap || typeof stateMap !== 'object') {
      return { ok: false, jammed: false, applied: 0, unchanged: 0, locked: 0 };
    }
    const movable = list(doc).filter((j) => !isConstraint(j) && !isLoose(j) && top(j.a, doc) && top(j.b, doc));
    const byB = new Map(movable.map((j) => [j.b, j]));
    const depthOf = (j) => {
      let d = 0, cur = j;
      const seen = new Set([j.id]);
      while (cur && byB.has(cur.a)) {
        const prev = byB.get(cur.a);
        if (!prev || seen.has(prev.id)) break;
        seen.add(prev.id);
        cur = prev;
        d++;
      }
      return d;
    };
    const ordered = movable
      .map((j, idx) => ({ j, idx, d: depthOf(j) }))
      .sort((a, b) => (a.d - b.d) || (a.idx - b.idx))
      .map((x) => x.j);

    const extractPatch = (j, raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const k = kindOf(j);
      const patch = {};
      if (Number.isFinite(Number(raw.ang))) patch.ang = Number(raw.ang);
      if ((k === 'cyl' || k === 'slot') && Number.isFinite(Number(raw.pos))) patch.pos = Number(raw.pos);
      if (k === 'planar') {
        if (Number.isFinite(Number(raw.u))) patch.u = Number(raw.u);
        if (Number.isFinite(Number(raw.v))) patch.v = Number(raw.v);
      }
      if (k === 'ball') {
        if (Number.isFinite(Number(raw.rx))) patch.rx = Number(raw.rx);
        if (Number.isFinite(Number(raw.ry))) patch.ry = Number(raw.ry);
      }
      return Object.keys(patch).length ? patch : null;
    };

    const isLive = opts.live !== undefined ? !!opts.live : doc === App.doc;
    let applied = 0, unchanged = 0, locked = 0, jammed = false;
    const handledJoints = new Set();

    for (const j of ordered) {
      if (handledJoints.has(j.id)) continue;
      const patch = extractPatch(j, stateMap[j.id]);
      if (!patch) continue;

      const core = cyclicCore(doc, j.id, true);
      if (core) {
        for (const cj of core.joints) handledJoints.add(cj.id);
        let driveJ = null, drivePatch = null;
        const candidates = [j, ...core.joints.filter((cj) => cj.id !== j.id)];
        for (const cj of candidates) {
          const cp = extractPatch(cj, stateMap[cj.id]);
          if (!cp) continue;
          const cNext = clampState(cj, cp);
          if (stateChanged(stateOf(cj), cNext, kindOf(cj))) {
            driveJ = cj;
            drivePatch = cp;
            break;
          }
        }
        if (!driveJ) { unchanged++; continue; }
        const a = top(driveJ.a, doc), b = top(driveJ.b, doc);
        if (!a || !b || (a.locked && b.locked)) { locked++; continue; }

        const snapItems = deepClone(doc.items);
        const snapJoints = deepClone(doc.joints || []);
        const prev = stateOf(driveJ);
        const seedDofs = pickPrimaryDofs(doc, driveJ, drivePatch, prev);
        const driveDofs = seedDofs.length ? [...seedDofs] : Object.keys(drivePatch).filter((d) => hasDof(driveJ, d));
        const tmpJ = { ...driveJ };
        if ((opts.expandRange || couplingsOf(driveJ.id, doc).length) && !tmpJ.stopsLocked) {
          for (const d of driveDofs) {
            const val = Number(drivePatch[d]);
            if (Number.isFinite(val)) ensureRangeFor(tmpJ, d, val);
          }
        }
        const next = clampState(tmpJ, drivePatch);
        const targets = driveDofs.length ? computeCoupledTargets(doc, driveDofs.map((d) => ({ jid: driveJ.id, dof: d, val: next[d] }))) : null;
        const extraTargets = [];
        const coreJSet = new Set(core.joints.map((x) => x.id));
        if (targets && targets.has(driveJ.id)) {
          for (const [d, rawVal] of targets.get(driveJ.id)) {
            if (!hasDof(driveJ, d)) continue;
            next[d] = driveJ.stopsLocked ? round(clampDofVal(driveJ, d, rawVal), 4) : round(rawVal, 4);
            if (!driveDofs.includes(d)) driveDofs.push(d);
          }
        }
        if (targets) {
          for (const [kjId, dofMap] of targets) {
            if (kjId === driveJ.id || !coreJSet.has(kjId)) continue;
            const kj = list(doc).find((x) => x.id === kjId);
            if (!kj) continue;
            const kjFrom = stateOf(kj), kjTo = { ...kjFrom }, kjDofs = [];
            for (const [d, rawVal] of dofMap) {
              if (!hasDof(kj, d)) continue;
              kjTo[d] = kj.stopsLocked ? round(clampDofVal(kj, d, rawVal), 4) : round(rawVal, 4);
              kjDofs.push(d);
            }
            if (kjDofs.length) extraTargets.push({ jid: kjId, dofs: kjDofs, fromSt: kjFrom, toSt: kjTo });
          }
        }
        const sol = solveClosedPoses(doc, core, driveJ, driveDofs, prev, next, { clampToReachable: false, extraTargets });
        if (!sol.ok) {
          doc.items = snapItems;
          doc.joints = snapJoints;
          jammed = true;
          break;
        }
        applyClosedPoses(doc, core, sol.poses, driveJ, next, { live: isLive });
        if (targets && targets.size) {
          for (const [kjId, dofMap] of targets) {
            if (kjId === driveJ.id || coreJSet.has(kjId)) continue;
            const sub = new Map([[kjId, dofMap]]);
            applyTargetsMap(doc, sub, driveJ.id, { live: isLive });
          }
        }
        applied++;
        continue;
      }

      const b = top(j.b, doc);
      if (!b) continue;
      if (b.locked) { locked++; continue; }
      syncHome(b, j, doc);
      const prev = stateOf(j);
      const seedDofs = pickPrimaryDofs(doc, j, patch, prev);
      const effDofs = seedDofs.length ? seedDofs : Object.keys(patch).filter((d) => hasDof(j, d));
      if ((opts.expandRange || couplingsOf(j.id, doc).length) && !j.stopsLocked) {
        for (const d of effDofs) {
          const val = Number(patch[d]);
          if (Number.isFinite(val)) ensureRangeFor(j, d, val);
        }
      }
      let next = clampState(j, patch);
      if (!stateChanged(prev, next, kindOf(j))) { unchanged++; continue; }
      const targets = effDofs.length ? computeCoupledTargets(doc, effDofs.map((d) => ({ jid: j.id, dof: d, val: next[d] }))) : null;
      if (targets && targets.has(j.id)) {
        for (const [d, rawVal] of targets.get(j.id)) {
          if (!hasDof(j, d)) continue;
          if (j.stopsLocked) next[d] = round(clampDofVal(j, d, rawVal), 4);
          else { ensureRangeFor(j, d, rawVal); next[d] = round(rawVal, 4); }
        }
      }
      writeState(j, next);
      Model.setFromMatrix(b, pose(j, next, null, doc));
      if (looseOf(j.b, doc).length) {
        solvePartConstraints(doc, j.b, Model.vars(doc).v);
        next = stateOf(j);
      }
      if (isLive && isTop(b.id, doc)) Viewer.updateNode(b.id, { matrix: Model.localMatrix(b) });
      if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next), { live: isLive });
      if (targets && targets.size) applyTargetsMap(doc, targets, j.id, { live: isLive });
      applied++;
    }

    if (!jammed && applied > 0) syncAll(doc, { live: isLive });
    if (isLive) drawSelectedJoint();
    return { ok: !jammed, jammed, applied, unchanged, locked };
  }

  // Gelöschte Teile: Gelenke / Verbindungen, die an ihnen hängen, fallen weg
  function init() {
    App.on('doc', () => {
      stopPlay();
      const js = list();
      if (js.length) {
        const ids = new Set(); Model.walk(App.doc.items, (x) => { ids.add(x.id); });
        if (js.some((j) => !ids.has(j.a) || !ids.has(j.b))) App.doc.joints = js.filter((j) => ids.has(j.a) && ids.has(j.b));
      }
      pruneInvalidCouplings(App.doc);
      if (selJoint && !list().some((j) => j.id === selJoint) && !couplingList().some((c) => c.id === selJoint)) selJoint = null;
      drawSelectedJoint();
    });
    App.on('selection', () => {
      if (App.sel.length && selJoint) {
        selJoint = null;
        clearSelVis();
      }
    });
    App.on('results', () => {
      invalidateCamCache();
      if (anim && anim.applyPose) anim.applyPose(anim.st);
      relinkFixed();
      drawSelectedJoint();
      if (selJoint && document.getElementById('cam-chart')) {
        const sc = couplingList().find((c) => c.id === selJoint && c.kind === 'cam');
        if (sc) Panels.renderRight({ preserveFocus: true });
      }
    });
    App.on('docLoaded', () => { stopPick(); clearDragVis(); closeDockPrompt(); });
    App.on('mode', () => { stopPick(); clearDragVis(); closeDockPrompt(); });
  }

  return {
    init,
    start,
    startFixed,
    startCylindrical,
    startPlanar,
    startParallel,
    startTangent,
    startDistance,
    startBall,
    startSlot,
    startAngle,
    startCenter,
    startCoupling,
    startGear,
    startRack,
    startScrew,
    startBelt,
    startLinear,
    startCam,
    stopPick,
    add,
    addFixed,
    updateFixed,
    flipFixed,
    syncFixed,
    syncAll,
    preparePartReplace,
    finalizePartReplace,
    addAngle,
    updateAngle,
    flipAngle,
    measureAngle,
    evalAngleDeg,
    addCenter,
    updateCenter,
    centerMetrics,
    addCylindrical,
    addPlanar,
    addBall,
    addSlot,
    addParallel,
    addTangent,
    addDistance,
    addCoupling,
    addGear,
    addRack,
    addScrew,
    addBelt,
    addLinear,
    addCam,
    camCurveData,
    snapCamContact,
    invalidateCamCache,
    updateCoupling,
    removeCoupling,
    couplingsOf,
    couplingGain,
    updateLoose,
    setDistance,
    flipLoose,
    looseOf,
    resolvePlaneRef,
    resolveCylRef,
    canConnect,
    dockOptions,
    applyDockJoint,
    onDockDrop,
    closeDockPrompt,
    setAngle,
    setState,
    applyStates,
    setKind,
    setRange,
    flip,
    constrain,
    applyDrag,
    dragContext,
    captureChain,
    applyChainDelta,
    captureReverseDrag,
    showDragVis,
    clearDragVis,
    syncHome,
    projectAxisRay,
    frameOf,
    stateOf,
    drivingOf,
    cylAxisOf,
    planarFaceOf,
    ballPointOf,
    slotCenterlineOf,
    slotPinOf,
    setStops,
    freeRange,
    play,
    stopPlay,
    remove,
    check,
    describe,
    panel,
    treeSection,
    renderPanel,
    select,
    of,
    allOf,
    downstream,
    pose,
    isFixedPart,
    fixedJointOf,
    isClosedLoop: (jid, doc = App.doc) => isInClosedLoop(doc, jid),
    jointError,
    loopErrors,
    get lastJam() { return lastJam; },
    get picking() { return !!pickState; },
    get dockPromptOpen() { return !!dockPop; },
    get selected() { return selJoint; },
    get isCouplingSelected() { return !!selJoint && couplingList().some((c) => c.id === selJoint); },
    get list() { return list(); },
    get couplings() { return couplingList(); },
    get playing() { return anim ? { jid: anim.jid, a: anim.a, st: anim.st } : null; },
  };
})();
