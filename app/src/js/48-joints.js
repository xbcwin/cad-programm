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
    const q = [rootId];
    while (q.length) {
      const a = q.shift();
      for (const j of js) {
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
    const ks = downstream(doc, rootId, { stopAtLocked: true }), moved = new Set([rootId, ...ks.map((k) => k.b)]);
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
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon über Verbindungen gekoppelt – eine weitere ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id && !isLoose(j))) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einem Gelenk oder einer Verbindung bewegt.` };
    const dv = new THREE.Vector3(...d); if (dv.lengthSq() < 1e-12) return { ok: false, msg: 'Die Achse braucht eine Richtung.' };
    dv.normalize();
    const k = opts.kind === 'slide' || opts.kind === 'cyl' || opts.kind === 'planar' ? opts.kind : 'rot';
    const lo = Number.isFinite(+opts.min) ? +opts.min : k === 'slide' ? -20 : k === 'rot' ? -90 : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : k === 'slide' ? 20 : k === 'rot' ? 90 : 180;
    let jid = null;
    App.change('Gelenk angelegt', (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
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
      doc.joints.push(entry);
    });
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
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id && !isLoose(j))) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

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
      const b = top(B.id, doc); if (!b || b.locked) return false;
      if (connected(doc, A.id, B.id) || wouldCycleDirected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id && !isLoose(j))) return false;
      const snapItems = looseOf(B.id, doc).length ? deepClone(doc.items) : null;
      const snapJoints = snapItems ? deepClone(doc.joints) : null;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'cyl',
        ao: r6(axA.o.toArray()),
        ad: r9(axA.d.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        pos: 0, minPos: round(Math.min(plo, phi), 2), maxPos: round(Math.max(plo, phi), 2),
        flip: !!opts.flip,
      });
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
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id && !isLoose(j))) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

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
      const b = top(B.id, doc); if (!b || b.locked) return false;
      if (connected(doc, A.id, B.id) || wouldCycleDirected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id && !isLoose(j))) return false;
      const snapItems = looseOf(B.id, doc).length ? deepClone(doc.items) : null;
      const snapJoints = snapItems ? deepClone(doc.joints) : null;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'planar',
        ao: r6(pBOnA.toArray()),
        ad: r9(plA.n.toArray()),
        au: r9(basis.u.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        u: 0, minU: round(Math.min(ulo, uhi), 2), maxU: round(Math.max(ulo, uhi), 2),
        v: 0, minV: round(Math.min(vlo, vhi), 2), maxV: round(Math.max(vlo, vhi), 2),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        flip: !!opts.flip,
      });
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
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id && !isLoose(j))) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

    const dp = ptA.p.clone().sub(ptB.p);
    const M_align = new THREE.Matrix4().makeTranslation(dp.x, dp.y, dp.z);
    const rxLo = Number.isFinite(+opts.minRx) ? +opts.minRx : -180;
    const rxHi = Number.isFinite(+opts.maxRx) ? +opts.maxRx : 180;
    const ryLo = Number.isFinite(+opts.minRy) ? +opts.minRy : -180;
    const ryHi = Number.isFinite(+opts.maxRy) ? +opts.maxRy : 180;
    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    let jid = null;
    App.change('Kugel-Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
      if (connected(doc, A.id, B.id) || wouldCycleDirected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id && !isLoose(j))) return false;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'ball',
        ao: r6(ptA.p.toArray()),
        ad: [0, 0, 1],
        au: [1, 0, 0],
        home: r9(Model.localMatrix(b).toArray()),
        rx: 0, minRx: round(Math.min(rxLo, rxHi), 2), maxRx: round(Math.max(rxLo, rxHi), 2),
        ry: 0, minRy: round(Math.min(ryLo, ryHi), 2), maxRy: round(Math.max(ryLo, ryHi), 2),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        ...(opts.stopsLocked ? { stopsLocked: true } : {}),
      });
    });
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
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: T('asm.groundedJointErr', { name: Model.label(B) }) };
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id && !isLoose(j))) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

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
    let jid = null;
    App.change('Stift-im-Langloch-Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b || b.locked) return false;
      if (connected(doc, A.id, B.id) || wouldCycleDirected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id && !isLoose(j))) return false;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'slot',
        ao: r6(sl.o.toArray()),
        ad: r9(sl.d.toArray()),
        au: r9(sl.n.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        pos: 0, minPos: round(Math.min(minPos, maxPos), 4), maxPos: round(Math.max(minPos, maxPos), 4),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        flip: !!opts.flip,
        stopsLocked: true,
      });
    });
    if (jid) {
      const patch = {};
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Stift-im-Langloch-Verbindung ließ sich nicht anlegen.' };
  }

  function canConnect(aId, bId, doc = App.doc) {
    const A = top(aId, doc), B = top(bId, doc);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Bitte zwei verschiedene Teile wählen.' };
    const why = refuse(doc, A, B); if (why) return { ok: false, msg: why };
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
    const chk = canConnect(target.id, source.id);
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
      Viewer.groups.overlay.add(ptB, dl); visObjs.push(ptB, dl);
    } else if (Array.isArray(j.ad)) {
      const d = new THREE.Vector3(...j.ad).normalize();
      const b = p.clone().addScaledVector(d, 10);
      const ln = Viewer.makeFat([p.x, p.y, p.z, b.x, b.y, b.z], '#f08c00', 3, { depthTest: false });
      Viewer.groups.overlay.add(ln); targetArr.push(ln);
    }
  }
  function drawSelectedJoint() {
    clearSelVis();
    if (!selJoint || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    const j = list().find((x) => x.id === selJoint);
    if (!j || !Array.isArray(j.ao)) return;
    drawJointVis(j, visObjs);
    Viewer.requestRender();
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
    const why = refuse(App.doc, A, B); if (why) { UI.toast(why, { icon: 'info' }); return false; }
    if (B.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(B) }), { icon: 'lock' }); return false; }
    if (connected(App.doc, A.id, B.id) || wouldCycleDirected(App.doc, A.id, B.id)) { UI.toast('Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.', { icon: 'info' }); return false; }
    if (list().some((j) => j.b === B.id && !isLoose(j))) { UI.toast(`„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur von einem Gelenk bewegt werden.`, { icon: 'info' }); return false; }
    const isSlide = kind === 'slide';
    Features.pickAxisThen((ax) => {
      let jid = null;
      App.change('Gelenk angelegt', (doc) => {
        const b = top(B.id, doc); if (!b || b.locked) return false;
        if (connected(doc, A.id, B.id) || wouldCycleDirected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id && !isLoose(j))) return false;
        doc.joints = doc.joints || [];
        jid = uid('j');
        const entry = {
          id: jid, a: A.id, b: B.id,
          ao: r6(ax.o.toArray()), ad: r9(ax.d.toArray()),
          home: r9(Model.localMatrix(b).toArray()),
          ang: 0, min: isSlide ? -20 : -90, max: isSlide ? 20 : 90,
        };
        if (isSlide) entry.kind = 'slide';
        doc.joints.push(entry);
      });
      App.select([B.id]);
      UI.toast(`${isSlide ? 'Schiebegelenk' : 'Gelenk'} angelegt: „${Model.label(B)}“ ${isSlide ? 'gleitet entlang' : 'dreht sich um'} ${ax.what}, „${Model.label(A)}“ bleibt stehen.`, { icon: 'check', ms: 3600 });
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
    const curB = curJ && top(curJ.b);
    if (curB && curB.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(curB) }), { icon: 'lock' }); return false; }
    const normPatch = patch && 'rz' in patch && !('ang' in patch) ? { ...patch, ang: patch.rz } : patch;
    const label = normPatch && Object.keys(normPatch).length === 1 && 'ang' in normPatch ? 'Gelenk bewegt' : 'Verbindung bewegt';
    App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const b = top(j.b, doc); if (!b || b.locked) return false;
      syncHome(b, j, doc);
      const prev = stateOf(j);
      let next = clampState(j, normPatch);
      writeState(j, next);
      Model.setFromMatrix(b, pose(j, next, null, doc));
      if (looseOf(j.b, doc).length) {
        solvePartConstraints(doc, j.b, Model.vars(doc).v);
        next = stateOf(j);
      }
      if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next));
    }, { merge: 'joint:' + jid });
    drawSelectedJoint();
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
    });
    drawSelectedJoint();
  }

  function setRange(jid, k, v) {
    const pair = {
      min: ['min', 'max', 360], max: ['min', 'max', 360],
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
      j.ang = clamp(round(twistDegAround(D_want, d), 4), j.min ?? -180, j.max ?? 180);
    } else if (k === 'slide') {
      const d = new THREE.Vector3(...j.ad).normalize();
      j.ang = clamp(round(dp.dot(d), 4), j.min ?? -20, j.max ?? 20);
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
    let next = stateOf(j);
    Model.setFromMatrix(b, pose(j, next, null, doc));
    if (hasLoose) {
      solvePartConstraints(doc, j.b, Model.vars(doc).v);
      next = stateOf(j);
    }
    if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next));
    return true;
  }

  function computeDragState(j, patch) {
    const k = kindOf(j);
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
      const lo = j.min ?? (k === 'slide' ? -20 : -180);
      const hi = j.max ?? (k === 'slide' ? 20 : 180);
      j.ang = round(clamp(Number(patch.ang) || 0, lo, hi), 4);
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
    if (opts && opts.reverse && opts.snap) return applyReverseDrag(j, patch, opts.snap);
    const b = top(j.b, App.doc); if (!b || b.locked) return null;
    const prev = stateOf(j);
    const k = kindOf(j);
    let next = computeDragState(j, patch || {});
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
    const cur = list().find((x) => x.id === jid);
    const wasConn = isConstraint(cur) || isLoose(cur);
    App.change(wasConn ? 'Verbindung gelöst' : 'Gelenk gelöst', (doc) => { doc.joints = list(doc).filter((x) => x.id !== jid); });
    if (selJoint === jid) { selJoint = null; clearSelVis(); Panels.renderRight(); Panels.renderLeft(); }
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
    App.change('Gelenk-Anschlag', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return false;
      const a = round(Math.min(lo, hi), 2), b = round(Math.max(lo, hi), 2);
      const sw = sweepMeta(j);
      if (sw.key === 'pos') { j.minPos = a; j.maxPos = b; j.stopsLocked = true; }
      else if (sw.key === 'u') { j.minU = a; j.maxU = b; j.stopsLocked = true; }
      else if (sw.key === 'v') { j.minV = a; j.maxV = b; j.stopsLocked = true; }
      else if (sw.key === 'rx') { j.minRx = a; j.maxRx = b; j.stopsLocked = true; }
      else { j.min = a; j.max = b; }
    });
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
    const el = (b && b.isConnected) ? b : document.querySelector(`.joint-item[data-jid="${jid}"] [id^="jt-play"]`);
    if (el) el.innerHTML = icon('play') + 'Bewegung abspielen';
  }
  function buildPlayLegs(j) {
    const k = kindOf(j), s0 = stateOf(j);
    if (k === 'cyl') {
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
    if (anim) { const same = anim.jid === jid; stopPlay(); if (same) return; }
    const j = list().find((x) => x.id === jid); if (!j || isConstraint(j) || isLoose(j)) return;
    const B = top(j.b); if (!B) return;
    if (B.locked) { UI.toast(T('asm.groundedJointErr', { name: Model.label(B) }), { icon: 'lock' }); return; }
    if (!isTop(B.id) || downstream(App.doc, j.b, { stopAtLocked: true }).some((k) => !isTop(k.b))) { UI.toast('Abspielen geht nur, wenn die bewegten Teile ganz oben im Verlauf liegen – in einer Gruppe zeigt das Bild sie als einen Körper. Mit dem Regler kannst du trotzdem jede Stellung ansehen.', { icon: 'info', ms: 5000 }); return; }
    const cur = Model.localMatrix(B), st0 = stateOf(j), exp = pose(j, st0);
    const home = cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)
      ? conj(App.doc, j.b, stateMatrix(j, st0)).invert().multiply(cur).toArray()
      : j.home;
    const down = downstream(App.doc, j.b, { stopAtLocked: true }).map((k) => top(k.b)).filter(Boolean).map((it) => ({ it, m: Model.localMatrix(it) }));
    const { legs, T: dur } = buildPlayLegs(j);
    if (dur < 1) return;
    const t0 = performance.now();
    const applyPose = (st) => {
      Viewer.updateNode(B.id, { matrix: pose(j, st, home) });
      const D = deltaMatrix(j, st0, st);
      for (const d of down) Viewer.updateNode(d.it.id, { matrix: D.clone().multiply(d.m) });
    };
    anim = { jid, ids: [B.id, ...down.map((d) => d.it.id)], btn, raf: 0, timer: 0, st: st0, get a() { return this.st.ang; }, applyPose };
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
    const down = downstream(App.doc, j.b).map((d) => top(d.b)).filter(Boolean);
      const moveTxt = down.length ? ` (${down.map((x) => '„' + esc(Model.label(x)) + '“').join(', ')} ${down.length === 1 ? 'bewegt sich' : 'bewegen sich'} mit)` : '';
      const verb = k === 'slide' ? 'gleitet entlang' : k === 'cyl' ? 'dreht und gleitet in' : k === 'planar' ? 'gleitet und dreht auf' : k === 'ball' ? 'dreht sich frei um den Punkt an' : k === 'slot' ? 'gleitet im Langloch von' : 'dreht sich gegenüber';
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ${verb} <b>${esc(Model.label(A))}</b>${moveTxt}.` }));
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
    if (!js.length) return null;
    const V = js.some(isDistance) ? Model.vars(App.doc).v : null;
    const sec = h('div', { class: 'datum-tree joint-tree', id: 'joint-tree', 'data-help': 'fixedJoint' }, h('div', { class: 'section-h' }, T('joint.treeHeading')));
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
    return sec;
  }

  function renderPanel(body) {
    const j = list().find((x) => x.id === selJoint);
    if (!j) return false;
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
    return sec;
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
      if (selJoint && !list().some((j) => j.id === selJoint)) selJoint = null;
      drawSelectedJoint();
    });
    App.on('selection', () => {
      if (App.sel.length && selJoint) {
        selJoint = null;
        clearSelVis();
      }
    });
    App.on('results', () => {
      if (anim && anim.applyPose) anim.applyPose(anim.st);
      relinkFixed();
      drawSelectedJoint();
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
    get picking() { return !!pickState; },
    get dockPromptOpen() { return !!dockPop; },
    get selected() { return selJoint; },
    get list() { return list(); },
    get playing() { return anim ? { jid: anim.jid, a: anim.a, st: anim.st } : null; },
  };
})();
