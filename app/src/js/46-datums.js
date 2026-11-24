// ================= Bezugsebenen & Bezugsachsen: eigene Ebenen und Achsen im Projekt =================
// Bezugsebenen liegen in doc.datums und erscheinen im Verlauf unter „Bezugsebenen“.
// Arten (base.type):
//   origin        – Grundebene XY/XZ/YZ mit Abstand und Neigung um ihre x-Achse
//   face          – ebene Körperfläche mit Abstand; wandert mit, wenn sich der Körper ändert
//   edgeAngle     – durch eine gerade Kante im Winkel zu einer ebenen Fläche; wandert mit
//   tangent       – tangential an einer runden Fläche (Zylinder/Kegel); wandert mit
//   normalToCurve – senkrecht zu einer Kante/Kurve an Anfang, Mitte, Ende oder Prozent; wandert mit
//   edgePoint     – durch eine gerade Kante und einen Punkt; wandert mit
//   twoEdges      – durch zwei koplanare gerade Kanten; wandert mit
//   fixed         – feste Lage (mittig zwischen zwei Flächen, durch drei Punkte)
//
// Bezugsachsen liegen in doc.axes und erscheinen im Verlauf unter „Bezugsachsen“.
// Arten (base.type):
//   twoPoints  – durch zwei Punkte (optional an Körpern hängend)
//   roundFace  – durch die Mitte einer runden Fläche (Zylinder, Kegel, Ring)
//   roundEdge  – durch die Mitte einer kreisförmigen Kante
//   faceNormal – senkrecht auf einer ebenen Fläche an einem Punkt
//   fixed      – feste Lage
//
// Bezugspunkte liegen in doc.points und erscheinen im Verlauf unter „Bezugspunkte“.
// Arten (base.type):
//   edgeMid            – Mitte einer Kante
//   faceCenter         – Mitte einer Fläche
//   edgePlaneIntersect – Schnittpunkt einer Kante mit einer Ebene/Fläche
//   curvePercent       – auf einer Kurve/Kante bei x %
//   fixed              – feste Weltkoordinaten
//
// Eigene Koordinatensysteme liegen in doc.csys und erscheinen im Verlauf unter „Koordinatensysteme“.
// Arten (base.type):
//   pointEdges – Ursprung an einem Punkt, X/Y-Achsen an Kanten/Achsen ausgerichtet
//   fixed      – feste Lage und Achsen
const Datums = (() => {
  const ORIGIN = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  const NAMES = { XY: 'Arbeitsfläche', XZ: 'Vorne', YZ: 'Seite' };
  let sel = null;       // gewählte Bezugsebene (Kennung)
  let selAxis = null;   // gewählte Bezugsachse (Kennung)
  let selPoint = null;  // gewählter Bezugspunkt (Kennung)
  let selCsys = null;   // gewähltes Koordinatensystem (Kennung)
  let pickState = null; // aktiver interaktiver 3D-Picker
  let relinkRounds = 0; // Schutz gegen Nachführ-Schleifen
  const lost = new Set();       // Ebenen, deren Bezug fehlt
  const lostAxes = new Set();   // Achsen, deren Bezug fehlt
  const lostPoints = new Set(); // Punkte, deren Bezug fehlt
  const lostCsys = new Set();   // Koordinatensysteme, deren Bezug fehlt

  const r6 = (v) => v.map((x) => round(x, 6));
  const V3 = (a) => new THREE.Vector3(...a);
  const vecDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const list = (doc = App.doc) => doc.datums || [];
  const find = (id, doc = App.doc) => list(doc).find((d) => d.id === id) || null;
  const axes = (doc = App.doc) => doc.axes || [];
  const findAxis = (id, doc = App.doc) => axes(doc).find((a) => a.id === id) || null;
  const points = (doc = App.doc) => doc.points || [];
  const findPoint = (id, doc = App.doc) => points(doc).find((p) => p.id === id) || null;
  const csysList = (doc = App.doc) => doc.csys || [];
  const findCsys = (id, doc = App.doc) => csysList(doc).find((c) => c.id === id) || null;

  function resolveFace(face) {
    if (!face || !face.id) return null;
    const idx = face.idx != null ? face.idx : face.faceIdx;
    let info = face.info;
    if (!info && idx != null && idx >= 0) {
      const r = App.results.get(face.id);
      info = r && r.data && r.data.faces ? r.data.faces[idx] : null;
    }
    return info ? { id: face.id, idx, info } : null;
  }
  function resolveEdge(edge) {
    if (!edge || !edge.id) return null;
    const idx = edge.edgeIdx != null ? edge.edgeIdx : edge.idx;
    let info = edge.info;
    if (!info && idx != null && idx >= 0) {
      const r = App.results.get(edge.id);
      info = r && r.data && r.data.edges ? r.data.edges[idx] : null;
    }
    return info ? { id: edge.id, idx, info } : null;
  }
  function distPointToLine(p, o, d) {
    const v = p.clone().sub(o);
    return v.addScaledVector(d, -v.dot(d)).length();
  }
  function snapBodyPoint(hit, cx, cy) {
    const n = hit && hit.node;
    if (!n) return null;
    const r = Viewer.canvas.getBoundingClientRect();
    let best = null;
    for (const g of (n.data && n.data.edges) || []) {
      for (const q of [g.a, g.b, g.m]) {
        if (!q) continue;
        const w = V3(q).applyMatrix4(n.obj.matrixWorld), sc = Viewer.toScreen(w), d = Math.hypot(sc.x + r.left - cx, sc.y + r.top - cy);
        if (d < 12 && (!best || d < best.d)) best = { w, d };
      }
    }
    return best ? best.w : hit.faceIdx >= 0 ? hit.point.clone() : null;
  }
  function planeFrame(o, n, xHint) {
    const nv = (n instanceof THREE.Vector3 ? n.clone() : V3(n)).normalize();
    let xv = xHint ? (xHint instanceof THREE.Vector3 ? xHint.clone() : V3(xHint)) : null;
    if (xv) xv.addScaledVector(nv, -xv.dot(nv));
    if (!xv || xv.lengthSq() < 1e-8) {
      const ref = Math.abs(nv.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      xv = new THREE.Vector3().crossVectors(ref, nv);
    }
    xv.normalize();
    const ov = o instanceof THREE.Vector3 ? o : V3(o);
    return { o: r6(ov.toArray()), x: r6(xv.toArray()), n: r6(nv.toArray()) };
  }
  function localBbox(r) {
    if (!r || !r.data) return null;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const v = r.data.vertices;
    if (v && v.length >= 3) {
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      return [x0, y0, z0, x1, y1, z1];
    }
    for (const g of r.data.edges || []) {
      for (const q of [g.a, g.b, g.m]) {
        if (!q) continue;
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
        if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2];
      }
    }
    return isFinite(x0) ? [x0, y0, z0, x1, y1, z1] : null;
  }
  function relInBox(p, bb) {
    return [0, 1, 2].map((k) => {
      const span = bb[k + 3] - bb[k];
      return span > 1e-6 ? (p[k] - bb[k]) / span : 0.5;
    });
  }
  function makeEdgeRef(eRef) {
    const g = eRef.info, r = App.results.get(eRef.id), bb = localBbox(r);
    const gm = g.m || [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2, (g.a[2] + g.b[2]) / 2];
    const ref = {
      id: eRef.id, et: g.t, ea: r6(g.a), eb: r6(g.b), em: r6(gm), el: round(g.l || 0, 6),
      eIdx: eRef.idx, rel: bb ? r6(relInBox(gm, bb)) : null,
    };
    if (g.t === 'LINE' && g.a && g.b) {
      const d = V3(g.b).sub(V3(g.a));
      if (d.lengthSq() > 1e-12) ref.ed = r6(d.normalize().toArray());
    } else if (g.t === 'CIRCLE' && Array.isArray(g.n) && Array.isArray(g.c)) {
      ref.ec = r6(g.c);
      ref.en = r6(V3(g.n).normalize().toArray());
      ref.er = round(g.r || 0, 6);
    }
    return ref;
  }
  function matchEdge(r, ref) {
    if (!r || !r.data || !ref) return null;
    const bb = localBbox(r), cands = [];
    const eds = r.data.edges || [];
    for (let idx = 0; idx < eds.length; idx++) {
      const g = eds[idx];
      if (!g || g.t !== ref.et || !g.a || !g.b) continue;
      let dL = null;
      if (g.t === 'LINE') {
        dL = V3(g.b).sub(V3(g.a));
        if (dL.lengthSq() < 1e-12) continue;
        dL.normalize();
        if (ref.ed && Math.abs(dL.dot(V3(ref.ed))) < 0.99) continue;
      } else if (g.t === 'CIRCLE' && ref.en && Array.isArray(g.n)) {
        const gn = V3(g.n);
        if (gn.lengthSq() < 1e-12) continue;
        gn.normalize();
        if (Math.abs(gn.dot(V3(ref.en))) < 0.99) continue;
      }
      const gmArr = g.m || [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2, (g.a[2] + g.b[2]) / 2];
      const gm = V3(gmArr);
      const dd = ref.em ? gm.distanceTo(V3(ref.em)) : 0;
      const lenDiff = Math.abs((g.l || 0) - (ref.el || 0));
      let relDist = 0;
      if (bb && ref.rel) {
        const gr = relInBox(gmArr, bb);
        relDist = Math.hypot(gr[0] - ref.rel[0], gr[1] - ref.rel[1], gr[2] - ref.rel[2]);
      }
      cands.push({ g, idx, dL, dd, lenDiff, relDist });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => {
      const aEx = a.dd < 1e-3 && a.lenDiff < 1e-3 ? 0 : 1;
      const bEx = b.dd < 1e-3 && b.lenDiff < 1e-3 ? 0 : 1;
      if (aEx !== bEx) return aEx - bEx;
      if (bb && ref.rel && Math.abs(a.relDist - b.relDist) > 0.02) return a.relDist - b.relDist;
      if (Math.abs(a.dd - b.dd) > 1e-3) return a.dd - b.dd;
      const ai = a.idx === ref.eIdx ? 0 : 1, bi = b.idx === ref.eIdx ? 0 : 1;
      return ai - bi;
    });
    const best = cands[0];
    let reversed = false;
    if (best.dL && ref.ed) reversed = best.dL.dot(V3(ref.ed)) < 0;
    else if (ref.ea && ref.eb) {
      const ga = V3(best.g.a), gb = V3(best.g.b), ra = V3(ref.ea), rb = V3(ref.eb);
      reversed = ga.distanceTo(ra) + gb.distanceTo(rb) > ga.distanceTo(rb) + gb.distanceTo(ra) + 1e-4;
    }
    return { g: best.g, idx: best.idx, reversed };
  }
  function matchRoundFace(r, b) {
    if (!r || !r.data) return null;
    const bd = V3(b.ad).normalize(), bo = V3(b.ao);
    let best = null;
    for (const f of r.data.faces || []) {
      if ((f.t !== 'CYLINDRE' && f.t !== 'CONE') || !Array.isArray(f.axis) || f.axis.length < 6) continue;
      const fd = V3(f.axis.slice(3, 6));
      if (fd.lengthSq() < 1e-12) continue;
      fd.normalize();
      if (Math.abs(fd.dot(bd)) < 0.99) continue;
      const axO = V3(f.axis.slice(0, 3));
      const sameType = f.t === b.ft ? 0 : 1;
      const axD = distPointToLine(axO, bo, bd);
      const dd = f.c && b.fc ? V3(f.c).distanceTo(V3(b.fc)) : axO.distanceTo(bo);
      if (!best || sameType < best.sameType || (sameType === best.sameType && (axD < best.axD - 1e-3 || (Math.abs(axD - best.axD) <= 1e-3 && dd < best.dd)))) {
        best = { f, fd, axO, sameType, axD, dd };
      }
    }
    return best;
  }
  function evalEdgeAt(g, tRaw, reversed) {
    const t = clamp(reversed ? 1 - tRaw : tRaw, 0, 1);
    if (g.t === 'LINE') {
      const a = V3(g.a), b = V3(g.b), d = b.clone().sub(a);
      if (d.lengthSq() < 1e-12) return null;
      const p = a.clone().lerp(b, t), tan = d.normalize();
      if (reversed) tan.negate();
      return { p, tan };
    }
    if (g.t === 'CIRCLE' && Array.isArray(g.c) && Array.isArray(g.n)) {
      const c = V3(g.c), n = V3(g.n).normalize(), a = V3(g.a), b = V3(g.b), m = V3(g.m || g.a);
      const va = a.clone().sub(c); va.addScaledVector(n, -va.dot(n));
      const R = va.length() > 1e-6 ? va.length() : (g.r || 1);
      let u0 = va.length() > 1e-6 ? va.clone().normalize() : new THREE.Vector3(1, 0, 0).cross(n);
      if (u0.lengthSq() < 1e-8) u0 = new THREE.Vector3(0, 1, 0).cross(n);
      u0.normalize();
      const v0 = new THREE.Vector3().crossVectors(n, u0).normalize();
      const full = a.distanceTo(b) < 1e-4 * Math.max(1, R) && (g.l || 0) > Math.PI * R;
      let sweep = Math.PI * 2;
      if (!full) {
        const ang = (q) => { const d = q.clone().sub(c); let phi = Math.atan2(d.dot(v0), d.dot(u0)); if (phi < 0) phi += Math.PI * 2; return phi; };
        const am = ang(m), ab = ang(b);
        sweep = ab < 1e-6 ? Math.PI * 2 : (am > 0 && am < ab ? ab : ab - Math.PI * 2);
      }
      const th = t * sweep;
      const rad = u0.clone().multiplyScalar(Math.cos(th)).addScaledVector(v0, Math.sin(th));
      const p = c.clone().addScaledVector(rad, R);
      const tan = u0.clone().multiplyScalar(-Math.sin(th)).addScaledVector(v0, Math.cos(th)).multiplyScalar(sweep >= 0 ? 1 : -1).normalize();
      if (reversed) tan.negate();
      return { p, tan, xHint: rad };
    }
    const pts = (Array.isArray(g.pts) && g.pts.length >= 2 ? g.pts : [g.a, g.m, g.b].filter(Boolean)).map(V3);
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    if (L < 1e-8) return null;
    const s = t * L;
    let seg = 0;
    while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const frac = segLen > 1e-9 ? (s - cum[seg]) / segLen : 0;
    const p = pts[seg].clone().lerp(pts[seg + 1], frac);
    const tans = pts.map((_, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const d = b.clone().sub(a);
      return d.lengthSq() > 1e-12 ? d.normalize() : pts[seg + 1].clone().sub(pts[seg]).normalize();
    });
    const tan = tans[seg].clone().lerp(tans[seg + 1], frac);
    if (tan.lengthSq() < 1e-12) tan.copy(pts[seg + 1]).sub(pts[seg]);
    tan.normalize();
    if (reversed) tan.negate();
    return { p, tan };
  }
  function makeFaceRef(fRef) {
    const f = fRef.info, r = App.results.get(fRef.id), bb = localBbox(r);
    const c = f.c || [0, 0, 0];
    const ref = {
      id: fRef.id, ft: f.t, c: r6(c), fIdx: fRef.idx,
      rel: bb ? r6(relInBox(c, bb)) : null,
    };
    if (f.n) ref.n = r6(V3(f.n).normalize().toArray());
    if (Array.isArray(f.axis) && f.axis.length >= 6) ref.axis = r6(f.axis);
    if (f.r != null) ref.r = round(f.r, 6);
    return ref;
  }
  function matchFace(r, ref) {
    if (!r || !r.data || !ref) return null;
    const bb = localBbox(r), cands = [];
    const fs = r.data.faces || [];
    for (let idx = 0; idx < fs.length; idx++) {
      const f = fs[idx];
      if (!f || f.t !== ref.ft) continue;
      if (f.t === 'PLANE' && ref.n && f.n) {
        const fn = V3(f.n);
        if (fn.lengthSq() < 1e-12 || fn.normalize().dot(V3(ref.n)) < 0.999) continue;
      } else if (Array.isArray(ref.axis) && ref.axis.length >= 6 && Array.isArray(f.axis) && f.axis.length >= 6) {
        const fd = V3(f.axis.slice(3, 6)), rd = V3(ref.axis.slice(3, 6));
        if (fd.lengthSq() < 1e-12 || rd.lengthSq() < 1e-12 || Math.abs(fd.normalize().dot(rd.normalize())) < 0.99) continue;
      }
      const fc = f.c ? V3(f.c) : new THREE.Vector3();
      const dd = ref.c ? fc.distanceTo(V3(ref.c)) : 0;
      let relDist = 0;
      if (bb && ref.rel && f.c) {
        const fr = relInBox(f.c, bb);
        relDist = Math.hypot(fr[0] - ref.rel[0], fr[1] - ref.rel[1], fr[2] - ref.rel[2]);
      }
      cands.push({ f, idx, dd, relDist });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => {
      const aEx = a.dd < 1e-3 ? 0 : 1, bEx = b.dd < 1e-3 ? 0 : 1;
      if (aEx !== bEx) return aEx - bEx;
      if (bb && ref.rel && Math.abs(a.relDist - b.relDist) > 0.02) return a.relDist - b.relDist;
      if (Math.abs(a.dd - b.dd) > 1e-3) return a.dd - b.dd;
      return (a.idx === ref.fIdx ? 0 : 1) - (b.idx === ref.fIdx ? 0 : 1);
    });
    return cands[0];
  }
  function pickPoint(cx, cy, maxPx = 12) {
    const r = Viewer.canvas.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    let best = null;
    for (const pt of points()) {
      if (pt.hidden || !Array.isArray(pt.point)) continue;
      const sc = Viewer.toScreen(V3(pt.point));
      if (sc.behind) continue;
      const d = Math.hypot(sc.x - px, sc.y - py);
      if (d <= maxPx && (!best || d < best.px)) best = { pt, px: d };
    }
    return best;
  }
  function snapBodyPointInfo(hit, cx, cy) {
    const ptHit = pickPoint(cx, cy, 12);
    if (ptHit) return { w: V3(ptHit.pt.point), bind: { pointId: ptHit.pt.id } };
    const n = hit && hit.node;
    if (!n) return null;
    const r = Viewer.canvas.getBoundingClientRect();
    let best = null;
    const eds = (n.data && n.data.edges) || [];
    for (let idx = 0; idx < eds.length; idx++) {
      const g = eds[idx];
      for (const [end, q] of [['a', g.a], ['b', g.b], ['m', g.m]]) {
        if (!q) continue;
        const w = V3(q).applyMatrix4(n.obj.matrixWorld), sc = Viewer.toScreen(w), d = Math.hypot(sc.x + r.left - cx, sc.y + r.top - cy);
        if (d < 12 && (!best || d < best.d)) best = { w, d, idx, g, end, q };
      }
    }
    if (best) {
      return {
        w: best.w,
        bind: { id: hit.id, lp: r6(best.q), edgeRef: makeEdgeRef({ id: hit.id, idx: best.idx, info: best.g }), end: best.end },
      };
    }
    if (hit.faceIdx >= 0) {
      const WI = Model.worldMatrix(App.doc, hit.id).invert();
      return { w: hit.point.clone(), bind: { id: hit.id, lp: r6(hit.point.clone().applyMatrix4(WI).toArray()) } };
    }
    return null;
  }
  function autoBindWorldPoint(pW) {
    for (const pt of points()) {
      if (lostPoints.has(pt.id) || !Array.isArray(pt.point)) continue;
      if (V3(pt.point).distanceTo(pW) < 1e-3) return { pointId: pt.id };
    }
    for (const [id, r] of App.results.entries()) {
      if (!r || !r.data || !Model.find(App.doc, id)) continue;
      const W = Model.worldMatrix(App.doc, id), eds = r.data.edges || [];
      for (let idx = 0; idx < eds.length; idx++) {
        const g = eds[idx];
        for (const [end, q] of [['a', g.a], ['b', g.b], ['m', g.m]]) {
          if (!q) continue;
          const w = V3(q).applyMatrix4(W);
          if (w.distanceTo(pW) < 1e-3) {
            return { id, lp: r6(q), edgeRef: makeEdgeRef({ id, idx, info: g }), end };
          }
        }
      }
    }
    return null;
  }
  function resolveBoundPoint(pWorld, bind, ptMap = null) {
    if (bind && bind.pointId) {
      let arr = null;
      if (ptMap && ptMap.has(bind.pointId)) arr = ptMap.get(bind.pointId);
      else {
        const pt = findPoint(bind.pointId);
        if (pt && !lostPoints.has(pt.id)) arr = pt.point;
      }
      return Array.isArray(arr) ? V3(arr) : null;
    }
    if (bind && bind.csysId) {
      const cs = findCsys(bind.csysId);
      return cs && !lostCsys.has(cs.id) && cs.csys && Array.isArray(cs.csys.o) ? V3(cs.csys.o) : null;
    }
    if (bind && bind.id) {
      if (!Model.find(App.doc, bind.id)) return null;
      const W = Model.worldMatrix(App.doc, bind.id), r = App.results.get(bind.id);
      if (bind.edgeRef && r) {
        const m = matchEdge(r, bind.edgeRef);
        if (m) {
          let key = bind.end || 'a';
          if (m.reversed) key = key === 'a' ? 'b' : key === 'b' ? 'a' : 'm';
          const q = m.g[key] || m.g.m || m.g.a;
          if (q) return V3(q).applyMatrix4(W);
        }
        return null;
      }
      if (Array.isArray(bind.lp)) return V3(bind.lp).applyMatrix4(W);
      return null;
    }
    return Array.isArray(pWorld) ? V3(pWorld) : null;
  }

  // ---------- Bezugsebenen ----------
  function solve(d) {
    const b = d.base || { type: 'fixed' }, V = Model.vars(App.doc).v, off = Model.num(b.dist, V, 0);
    if (b.type === 'origin') {
      const P = ORIGIN[b.plane] || ORIGIN.XY, n0 = V3(P.n), x0 = V3(P.x), y0 = new THREE.Vector3().crossVectors(n0, x0);
      const a = (Model.num(b.tilt, V, 0) * Math.PI) / 180;
      const n = n0.clone().multiplyScalar(Math.cos(a)).addScaledVector(y0, -Math.sin(a));
      return { o: r6(V3(P.o).addScaledVector(n0, off).toArray()), x: r6(x0.toArray()), n: r6(n.toArray()) };
    }
    if (b.type === 'face') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        let best = null;
        for (const f of r.data.faces || []) {
          if (f.t !== 'PLANE' || !f.n) continue;
          const dot = V3(f.n).dot(V3(b.n)); if (dot < 0.999) continue;
          const dd = V3(f.c).distanceTo(V3(b.c)); if (!best || dd < best.dd) best = { f, dd };
        }
        if (best) {
          lost.delete(d.id);
          const fr = Actions.faceFrame(best.f), n = V3(fr.n).transformDirection(W).normalize();
          return { o: r6(V3(best.f.c).applyMatrix4(W).addScaledVector(n, off).toArray()), x: r6(V3(fr.x).transformDirection(W).normalize().toArray()), n: r6(n.toArray()) };
        }
      }
      if (r || !Model.find(App.doc, b.id)) lost.add(d.id);
      return d.plane;
    }
    if (b.type === 'edgeAngle') {
      const rE = App.results.get(b.edgeId), WE = Model.find(App.doc, b.edgeId) ? Model.worldMatrix(App.doc, b.edgeId) : null;
      const rF = App.results.get(b.faceId), WF = Model.find(App.doc, b.faceId) ? Model.worldMatrix(App.doc, b.faceId) : null;
      if (rE && WE && rF && WF) {
        let bestF = null;
        for (const f of rF.data.faces || []) {
          if (f.t !== 'PLANE' || !f.n) continue;
          if (V3(f.n).dot(V3(b.fn)) < 0.999) continue;
          const dd = V3(f.c).distanceTo(V3(b.fc));
          if (!bestF || dd < bestF.dd) bestF = { f, dd };
        }
        if (bestF) {
          const sameBodyOnFace = b.edgeId === b.faceId && Math.abs(V3(b.em).sub(V3(b.fc)).dot(V3(b.fn))) < 1e-3;
          const cands = [];
          for (const g of rE.data.edges || []) {
            if (g.t !== 'LINE' || !g.a || !g.b) continue;
            const dL = V3(g.b).sub(V3(g.a));
            if (dL.lengthSq() < 1e-12) continue;
            dL.normalize();
            if (Math.abs(dL.dot(V3(b.ed))) < 0.999) continue;
            const gm = V3(g.m || [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2, (g.a[2] + g.b[2]) / 2]);
            const onFace = Math.abs(gm.clone().sub(V3(bestF.f.c)).dot(V3(bestF.f.n))) < 1e-3;
            cands.push({ g, dL, onFace, dd: gm.distanceTo(V3(b.em)) });
          }
          const pool = sameBodyOnFace && cands.some((c) => c.onFace) ? cands.filter((c) => c.onFace) : cands;
          let bestE = null;
          for (const c of pool) if (!bestE || c.dd < bestE.dd) bestE = c;
          if (bestE) {
            const dL = bestE.dL.clone();
            if (dL.dot(V3(b.ed)) < 0) dL.negate();
            const pA = V3(bestE.g.a).applyMatrix4(WE), pB = V3(bestE.g.b).applyMatrix4(WE);
            const o = pA.clone().add(pB).multiplyScalar(0.5);
            const e = dL.transformDirection(WE).normalize();
            const n0 = V3(bestF.f.n).transformDirection(WF).normalize();
            const nRef = n0.clone().addScaledVector(e, -n0.dot(e));
            if (nRef.lengthSq() >= 1e-8) {
              nRef.normalize();
              const y0 = new THREE.Vector3().crossVectors(nRef, e).normalize();
              const a = (Model.num(b.angle, V, 0) * Math.PI) / 180;
              const n = nRef.clone().multiplyScalar(Math.cos(a)).addScaledVector(y0, -Math.sin(a)).normalize();
              lost.delete(d.id);
              return { o: r6(o.toArray()), x: r6(e.toArray()), n: r6(n.toArray()) };
            }
          }
        }
      }
      if (rE || !Model.find(App.doc, b.edgeId) || rF || !Model.find(App.doc, b.faceId)) lost.add(d.id);
    }
    if (b.type === 'tangent') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        const best = matchRoundFace(r, b);
        if (best) {
          const dL = best.fd.clone();
          if (dL.dot(V3(b.ad)) < 0) dL.negate();
          const L = best.axO;
          let u0 = V3(b.u0); u0.addScaledVector(dL, -u0.dot(dL));
          if (u0.lengthSq() < 1e-8) {
            const ref = Math.abs(dL.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            u0 = ref.addScaledVector(dL, -ref.dot(dL));
          }
          u0.normalize();
          const v0 = new THREE.Vector3().crossVectors(dL, u0).normalize();
          const rad = (Model.num(b.angle, V, 0) * Math.PI) / 180;
          const u = u0.clone().multiplyScalar(Math.cos(rad)).addScaledVector(v0, Math.sin(rad)).normalize();
          const cL = best.f.c ? V3(best.f.c) : L;
          const zMid = cL.clone().sub(L).dot(dL);
          let semi = 0, rAtZ = best.f.r || 0;
          if (best.f.t === 'CONE') {
            if (best.f.semiAngle != null && best.f.coneR != null) {
              semi = best.f.semiAngle;
              rAtZ = best.f.coneR + zMid * Math.tan(semi);
            } else {
              rAtZ = cL.clone().sub(L).addScaledVector(dL, -zMid).length();
            }
          }
          if (rAtZ > 1e-6) {
            const pL = L.clone().addScaledVector(dL, zMid).addScaledVector(u, rAtZ);
            const nL = u.clone().multiplyScalar(Math.cos(semi)).addScaledVector(dL, -Math.sin(semi)).normalize();
            if (b.flip) nL.negate();
            const xL = new THREE.Vector3().crossVectors(dL, u).normalize();
            const oW = pL.applyMatrix4(W);
            const nW = nL.transformDirection(W).normalize();
            const xW = xL.transformDirection(W).normalize();
            lost.delete(d.id);
            return planeFrame(oW, nW, xW);
          }
        }
      }
      if (r || !Model.find(App.doc, b.id)) lost.add(d.id);
      return d.plane;
    }
    if (b.type === 'normalToCurve') {
      const r = App.results.get(b.edgeId), W = Model.find(App.doc, b.edgeId) ? Model.worldMatrix(App.doc, b.edgeId) : null;
      if (r && W) {
        const m = matchEdge(r, b.edge);
        if (m) {
          let t = 0.5;
          if (b.posMode === 'start') t = 0;
          else if (b.posMode === 'end') t = 1;
          else if (b.posMode === 'percent') t = clamp(Model.num(b.percent, V, 50), 0, 100) / 100;
          const ev = evalEdgeAt(m.g, t, m.reversed);
          if (ev) {
            const oW = ev.p.clone().applyMatrix4(W);
            const nW = ev.tan.clone().transformDirection(W).normalize();
            if (b.flip) nW.negate();
            const xHint = ev.xHint ? ev.xHint.clone().transformDirection(W).normalize() : null;
            lost.delete(d.id);
            return planeFrame(oW, nW, xHint);
          }
        }
      }
      if (r || !Model.find(App.doc, b.edgeId)) lost.add(d.id);
      return d.plane;
    }
    if (b.type === 'edgePoint') {
      const rE = App.results.get(b.edgeId), WE = Model.find(App.doc, b.edgeId) ? Model.worldMatrix(App.doc, b.edgeId) : null;
      const P = resolveBoundPoint(b.p, b.pBind);
      if (rE && WE && P) {
        const m = matchEdge(rE, b.edge);
        if (m && m.g.t === 'LINE') {
          const pA = V3(m.g.a).applyMatrix4(WE), pB = V3(m.g.b).applyMatrix4(WE);
          const M = pA.clone().add(pB).multiplyScalar(0.5);
          const e = pB.clone().sub(pA);
          if (e.lengthSq() >= 1e-12) {
            e.normalize();
            if (m.reversed) e.negate();
            const w = P.clone().sub(pA), v = w.addScaledVector(e, -w.dot(e));
            if (v.length() > 1e-4) {
              const n = new THREE.Vector3().crossVectors(e, v).normalize();
              if (b.flip) n.negate();
              const o = M.clone().add(P).multiplyScalar(0.5);
              lost.delete(d.id);
              return planeFrame(o, n, e);
            }
          }
        }
      }
      if (rE || !Model.find(App.doc, b.edgeId) || !P || (b.pBind && !Model.find(App.doc, b.pBind.id))) lost.add(d.id);
      return d.plane;
    }
    if (b.type === 'twoEdges') {
      const r1 = b.e1 && App.results.get(b.e1.id), W1 = b.e1 && Model.find(App.doc, b.e1.id) ? Model.worldMatrix(App.doc, b.e1.id) : null;
      const r2 = b.e2 && App.results.get(b.e2.id), W2 = b.e2 && Model.find(App.doc, b.e2.id) ? Model.worldMatrix(App.doc, b.e2.id) : null;
      if (r1 && W1 && r2 && W2) {
        const m1 = matchEdge(r1, b.e1), m2 = matchEdge(r2, b.e2);
        if (m1 && m2 && m1.g.t === 'LINE' && m2.g.t === 'LINE') {
          const A1 = V3(m1.g.a).applyMatrix4(W1), B1 = V3(m1.g.b).applyMatrix4(W1), M1 = A1.clone().add(B1).multiplyScalar(0.5);
          const A2 = V3(m2.g.a).applyMatrix4(W2), B2 = V3(m2.g.b).applyMatrix4(W2), M2 = A2.clone().add(B2).multiplyScalar(0.5);
          const e1 = B1.clone().sub(A1), e2 = B2.clone().sub(A2);
          if (e1.lengthSq() >= 1e-12 && e2.lengthSq() >= 1e-12) {
            e1.normalize(); e2.normalize();
            if (m1.reversed) e1.negate();
            if (m2.reversed) e2.negate();
            const c = new THREE.Vector3().crossVectors(e1, e2);
            let n = null, o = null;
            if (c.length() < 1e-4) {
              const w = M2.clone().sub(M1), v = w.addScaledVector(e1, -w.dot(e1));
              if (v.length() > 1e-4) {
                n = new THREE.Vector3().crossVectors(e1, v).normalize();
                o = M1.clone().add(M2).multiplyScalar(0.5);
              }
            } else {
              n = c.clone().normalize();
              const skew = Math.abs(M2.clone().sub(M1).dot(n));
              if (skew <= 1e-2) {
                const dM = M2.clone().sub(M1);
                dM.addScaledVector(n, -dM.dot(n));
                o = M1.clone().addScaledVector(dM, 0.5);
              } else {
                n = null;
              }
            }
            if (n && o) {
              if (b.flip) n.negate();
              lost.delete(d.id);
              return planeFrame(o, n, e1);
            }
          }
        }
      }
      if ((b.e1 && (r1 || !Model.find(App.doc, b.e1.id))) || (b.e2 && (r2 || !Model.find(App.doc, b.e2.id)))) lost.add(d.id);
      return d.plane;
    }
    return d.plane;
  }

  function add(base, name, plane) {
    const d = { id: uid('dp'), name: name || `Ebene ${list().length + 1}`, base, plane: plane || null };
    d.plane = solve({ ...d, plane: plane || ORIGIN.XY });
    App.change(`Bezugsebene „${d.name}“`, (doc) => { (doc.datums = doc.datums || []).push(d); });
    select(d.id);
    return d;
  }
  function addOrigin(plane = 'XY', dist = 10, tilt = 0) { return add({ type: 'origin', plane, dist, tilt }, `${NAMES[plane] || plane} ${typeof dist === 'number' ? Units.fmtLenU(dist, 2) : dist}${tilt ? ' · ' + tilt + '°' : ''}`); }
  function addFromFace(face, dist = 10) {
    const f = resolveFace(face);
    if (!f || f.info.t !== 'PLANE') { UI.toast('Wähl zuerst eine ebene Fläche eines Körpers.', { icon: 'info' }); return null; }
    const top = Model.find(App.doc, f.id);
    return add({ type: 'face', id: f.id, n: f.info.n, c: f.info.c, dist }, `Fläche von „${Model.label(top.item)}“ + ${Units.fmtLenU(dist, 2)}`);
  }
  function addEdgeAngle(edge, face, angle = 30, name) {
    const eRef = resolveEdge(edge);
    if (!eRef || eRef.info.t !== 'LINE') { UI.toast('Wähl zuerst eine gerade Kante.', { icon: 'info' }); return null; }
    const edLocal = V3(eRef.info.b).sub(V3(eRef.info.a));
    if (edLocal.lengthSq() < 1e-12) return null;
    edLocal.normalize();
    if (!face) {
      const rE = App.results.get(eRef.id), em = V3(eRef.info.m);
      const fi = rE && rE.data && rE.data.faces ? rE.data.faces.findIndex((x) => x.t === 'PLANE' && x.n && x.c && Math.abs(V3(x.n).dot(edLocal)) < 1e-3 && Math.abs(em.clone().sub(V3(x.c)).dot(V3(x.n))) < 1e-3) : -1;
      if (fi >= 0) face = { id: eRef.id, idx: fi, info: rE.data.faces[fi] };
    }
    const fRef = resolveFace(face);
    if (!fRef || fRef.info.t !== 'PLANE' || !fRef.info.n) { UI.toast('Wähl eine ebene Fläche als Winkel-Bezug.', { icon: 'info' }); return null; }
    const WE = Model.worldMatrix(App.doc, eRef.id), WF = Model.worldMatrix(App.doc, fRef.id);
    const eW = edLocal.clone().transformDirection(WE).normalize();
    const nW = V3(fRef.info.n).transformDirection(WF).normalize();
    if (Math.abs(nW.dot(eW)) >= 0.999) {
      UI.toast('Die gewählte Fläche steht senkrecht auf der Kante – wähle eine Fläche, an der die Kante anliegt oder die parallel zu ihr ist.', { icon: 'info' });
      return null;
    }
    const top = Model.find(App.doc, eRef.id);
    const base = {
      type: 'edgeAngle',
      edgeId: eRef.id, ea: r6(eRef.info.a), eb: r6(eRef.info.b), em: r6(eRef.info.m), ed: r6(edLocal.toArray()),
      faceId: fRef.id, fn: r6(fRef.info.n), fc: r6(fRef.info.c), angle,
    };
    const angTxt = typeof angle === 'number' ? fmt(angle, 1) + '°' : angle;
    return add(base, name || `Ebene ${angTxt} an „${top ? Model.label(top.item) : 'Kante'}“`);
  }
  function addFixed(plane, name) { return add({ type: 'fixed' }, name, plane); }
  function addTangent(face, pointOrAngle = 0, name) {
    const f = resolveFace(face);
    if (!f || (f.info.t !== 'CYLINDRE' && f.info.t !== 'CONE') || !Array.isArray(f.info.axis) || f.info.axis.length < 6) {
      UI.toast('Wähl zuerst eine runde Fläche (Zylinder oder Kegel).', { icon: 'info' });
      return null;
    }
    const W = Model.worldMatrix(App.doc, f.id), WI = W.clone().invert();
    const ao = f.info.axis.slice(0, 3), ad = V3(f.info.axis.slice(3, 6));
    if (ad.lengthSq() < 1e-12) return null;
    ad.normalize();
    const fc = f.info.c ? f.info.c.slice() : ao.slice();
    let u0 = null, angle = 0;
    if (pointOrAngle && (pointOrAngle instanceof THREE.Vector3 || (Array.isArray(pointOrAngle) && pointOrAngle.length >= 3))) {
      const pW = pointOrAngle instanceof THREE.Vector3 ? pointOrAngle.clone() : V3(pointOrAngle);
      const pL = pW.applyMatrix4(WI).sub(V3(ao));
      pL.addScaledVector(ad, -pL.dot(ad));
      if (pL.lengthSq() > 1e-8) u0 = pL.normalize();
    } else {
      angle = pointOrAngle ?? 0;
    }
    if (!u0) {
      const ref = Math.abs(ad.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      u0 = ref.addScaledVector(ad, -ref.dot(ad)).normalize();
    }
    const top = Model.find(App.doc, f.id);
    return add({
      type: 'tangent', id: f.id, ft: f.info.t, ao: r6(ao), ad: r6(ad.toArray()), fc: r6(fc),
      u0: r6(u0.toArray()), angle,
    }, name || `Tangential an „${top ? Model.label(top.item) : 'Rundung'}“`);
  }
  function addNormalToCurve(edge, pos = 'mid', name) {
    const eRef = resolveEdge(edge);
    if (!eRef) { UI.toast('Wähl zuerst eine Kante oder Kurve.', { icon: 'info' }); return null; }
    let posMode = 'mid', percent = 50, flip = false;
    if (pos && typeof pos === 'object') {
      posMode = pos.posMode || 'mid';
      percent = pos.percent ?? (posMode === 'start' ? 0 : posMode === 'end' ? 100 : 50);
      flip = !!pos.flip;
    } else if (pos === 'start' || pos === 'mid' || pos === 'end') {
      posMode = pos;
      percent = pos === 'start' ? 0 : pos === 'end' ? 100 : 50;
    } else if (typeof pos === 'number' || typeof pos === 'string') {
      posMode = 'percent';
      percent = pos;
    }
    const top = Model.find(App.doc, eRef.id);
    const posTxt = posMode === 'start' ? 'Anfang' : posMode === 'end' ? 'Ende' : posMode === 'mid' ? 'Mitte' : (typeof percent === 'number' ? fmt(percent, 0) + ' %' : String(percent));
    const base = { type: 'normalToCurve', edgeId: eRef.id, edge: makeEdgeRef(eRef), posMode, percent };
    if (flip) base.flip = true;
    return add(base, name || `Senkrecht zu „${top ? Model.label(top.item) : 'Kante'}“ (${posTxt})`);
  }
  function addEdgePoint(edge, point, name, opts = {}) {
    const eRef = resolveEdge(edge);
    if (!eRef || eRef.info.t !== 'LINE') { UI.toast('Wähl zuerst eine gerade Kante.', { icon: 'info' }); return null; }
    const WE = Model.worldMatrix(App.doc, eRef.id);
    const pA = V3(eRef.info.a).applyMatrix4(WE), pB = V3(eRef.info.b).applyMatrix4(WE);
    const eDir = pB.clone().sub(pA);
    if (eDir.lengthSq() < 1e-12) return null;
    eDir.normalize();
    let pW = null, pBind = opts.bind || null;
    if (point && point.p) {
      pW = point.p instanceof THREE.Vector3 ? point.p.clone() : V3(point.p);
      if (!pBind && point.bind) pBind = point.bind;
    } else if (point) {
      pW = point instanceof THREE.Vector3 ? point.clone() : V3(point);
    }
    if (!pW) return null;
    if (distPointToLine(pW, pA, eDir) < 1e-4) {
      UI.toast('Der Punkt liegt auf der Kante – wähl einen Punkt daneben.', { icon: 'info' });
      return null;
    }
    if (!pBind) pBind = autoBindWorldPoint(pW);
    const top = Model.find(App.doc, eRef.id);
    const base = { type: 'edgePoint', edgeId: eRef.id, edge: makeEdgeRef(eRef), p: r6(pW.toArray()) };
    if (pBind) base.pBind = pBind;
    return add(base, name || `Durch Kante & Punkt (${top ? Model.label(top.item) : 'Körper'})`);
  }
  function addTwoEdges(edge1, edge2, name) {
    const er1 = resolveEdge(edge1), er2 = resolveEdge(edge2);
    if (!er1 || er1.info.t !== 'LINE' || !er2 || er2.info.t !== 'LINE') {
      UI.toast('Wähl zwei gerade Kanten.', { icon: 'info' });
      return null;
    }
    if (er1.id === er2.id && er1.idx === er2.idx) {
      UI.toast('Wähl zwei verschiedene Kanten.', { icon: 'info' });
      return null;
    }
    const W1 = Model.worldMatrix(App.doc, er1.id), W2 = Model.worldMatrix(App.doc, er2.id);
    const A1 = V3(er1.info.a).applyMatrix4(W1), B1 = V3(er1.info.b).applyMatrix4(W1), M1 = A1.clone().add(B1).multiplyScalar(0.5);
    const A2 = V3(er2.info.a).applyMatrix4(W2), B2 = V3(er2.info.b).applyMatrix4(W2), M2 = A2.clone().add(B2).multiplyScalar(0.5);
    const e1 = B1.clone().sub(A1), e2 = B2.clone().sub(A2);
    if (e1.lengthSq() < 1e-12 || e2.lengthSq() < 1e-12) return null;
    e1.normalize(); e2.normalize();
    const c = new THREE.Vector3().crossVectors(e1, e2);
    if (c.length() < 1e-4) {
      const w = M2.clone().sub(M1), v = w.addScaledVector(e1, -w.dot(e1));
      if (v.length() < 1e-4) {
        UI.toast('Die beiden Kanten liegen auf derselben Geraden – sie spannen keine Ebene auf.', { icon: 'info' });
        return null;
      }
    } else {
      const n = c.clone().normalize();
      if (Math.abs(M2.clone().sub(M1).dot(n)) > 1e-2) {
        UI.toast('Die beiden Kanten sind windschief – sie liegen nicht in einer Ebene.', { icon: 'info' });
        return null;
      }
    }
    const top = Model.find(App.doc, er1.id);
    return add({ type: 'twoEdges', e1: makeEdgeRef(er1), e2: makeEdgeRef(er2) }, name || `Durch 2 Kanten (${top ? Model.label(top.item) : 'Körper'})`);
  }
  function set(id, patch, label = 'Bezugsebene geändert') {
    App.change(label, (doc) => {
      const d = find(id, doc); if (!d) return false;
      for (const [k, v] of Object.entries(patch)) { if (k === 'name') d.name = v; else if (k === 'hidden') { if (v) d.hidden = true; else delete d.hidden; } else d.base[k] = v; }
      d.plane = solve(d);
    }, { merge: 'datum:' + id + ':' + Object.keys(patch).join() });
  }
  function remove(id) { App.change('Bezugsebene gelöscht', (doc) => { doc.datums = list(doc).filter((d) => d.id !== id); }); if (sel === id) select(null); }
  function select(id) {
    sel = id || null;
    if (sel) {
      selAxis = null; selPoint = null; selCsys = null;
      App.clearSelection();
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    draw(); Panels.renderRight(); Panels.renderLeft();
  }
  function sketchOn(id) {
    const d = find(id); if (!d) return false;
    select(null); Sketch.startOnPlaneObj(deepClone(d.plane));
    UI.toast(`Skizze auf „${d.name}“.`, { icon: 'check', ms: 1800 });
    return true;
  }

  // ---------- Bezugsachsen ----------
  function twoPointPositions(b) {
    if (!b || b.type !== 'twoPoints') return null;
    const pt = (p, bind) => {
      if (bind && bind.id) {
        if (!Model.find(App.doc, bind.id)) return null;
        return V3(bind.lp).applyMatrix4(Model.worldMatrix(App.doc, bind.id));
      }
      return Array.isArray(p) ? V3(p) : null;
    };
    const pA = pt(b.a, b.bindA), pB = pt(b.b, b.bindB);
    return pA && pB ? [pA, pB] : null;
  }

  function solveAxis(ax) {
    const b = ax.base || { type: 'fixed' };
    if (b.type === 'twoPoints') {
      const pts = twoPointPositions(b);
      if (pts) {
        const dir = pts[1].clone().sub(pts[0]);
        if (dir.length() > 1e-6) {
          lostAxes.delete(ax.id);
          return { o: r6(pts[0].clone().add(pts[1]).multiplyScalar(0.5).toArray()), d: r6(dir.normalize().toArray()) };
        }
      }
      lostAxes.add(ax.id);
      return ax.axis;
    }
    if (b.type === 'roundFace') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        const bd = V3(b.d).normalize(), bo = V3(b.o);
        let best = null;
        for (const f of r.data.faces || []) {
          if (!Array.isArray(f.axis) || f.axis.length < 6) continue;
          const fd = V3(f.axis.slice(3, 6));
          if (fd.lengthSq() < 1e-12) continue;
          fd.normalize();
          if (Math.abs(fd.dot(bd)) < 0.99) continue;
          const axO = V3(f.axis.slice(0, 3));
          const dd = f.c && b.c ? V3(f.c).distanceTo(V3(b.c)) : axO.distanceTo(bo);
          const axD = distPointToLine(axO, bo, bd);
          if (!best || dd < best.dd - 1e-3 || (Math.abs(dd - best.dd) <= 1e-3 && axD < best.axD)) best = { f, fd, axO, dd, axD };
        }
        if (best) {
          lostAxes.delete(ax.id);
          const fd = best.fd.clone();
          if (fd.dot(bd) < 0) fd.negate();
          const cL = best.f.c ? V3(best.f.c) : best.axO;
          const oL = best.axO.clone().addScaledVector(fd, cL.clone().sub(best.axO).dot(fd));
          return { o: r6(oL.applyMatrix4(W).toArray()), d: r6(fd.transformDirection(W).normalize().toArray()) };
        }
      }
      if (r || !Model.find(App.doc, b.id)) lostAxes.add(ax.id);
      return ax.axis;
    }
    if (b.type === 'roundEdge') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        const bd = V3(b.d).normalize(), bc = V3(b.c);
        let best = null;
        for (const g of r.data.edges || []) {
          if (g.t !== 'CIRCLE' || !Array.isArray(g.n) || !Array.isArray(g.c)) continue;
          const gn = V3(g.n);
          if (gn.lengthSq() < 1e-12) continue;
          gn.normalize();
          if (Math.abs(gn.dot(bd)) < 0.99) continue;
          const dd = V3(g.c).distanceTo(bc), rd = Math.abs((g.r || 0) - (b.r || 0));
          if (!best || dd < best.dd - 1e-3 || (Math.abs(dd - best.dd) <= 1e-3 && rd < best.rd)) best = { g, gn, dd, rd };
        }
        if (best) {
          lostAxes.delete(ax.id);
          const gd = best.gn.clone();
          if (gd.dot(bd) < 0) gd.negate();
          return { o: r6(V3(best.g.c).applyMatrix4(W).toArray()), d: r6(gd.transformDirection(W).normalize().toArray()) };
        }
      }
      if (r || !Model.find(App.doc, b.id)) lostAxes.add(ax.id);
      return ax.axis;
    }
    if (b.type === 'faceNormal') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        let bestF = null;
        for (const f of r.data.faces || []) {
          if (f.t !== 'PLANE' || !f.n) continue;
          if (V3(f.n).dot(V3(b.fn)) < 0.999) continue;
          const dd = V3(f.c).distanceTo(V3(b.fc));
          if (!bestF || dd < bestF.dd) bestF = { f, dd };
        }
        if (bestF) {
          lostAxes.delete(ax.id);
          const nL = V3(bestF.f.n).normalize(), cL = V3(bestF.f.c), lp = V3(b.lp);
          const pL = lp.clone().addScaledVector(nL, cL.clone().sub(lp).dot(nL));
          return { o: r6(pL.applyMatrix4(W).toArray()), d: r6(nL.transformDirection(W).normalize().toArray()) };
        }
      }
      if (r || !Model.find(App.doc, b.id)) lostAxes.add(ax.id);
      return ax.axis;
    }
    return ax.axis;
  }

  function addAxis(base, name, axis) {
    const ax = { id: uid('da'), name: name || `Achse ${axes().length + 1}`, base, axis: axis || null };
    ax.axis = solveAxis({ ...ax, axis: axis || { o: [0, 0, 0], d: [0, 0, 1] } });
    App.change(`Bezugsachse „${ax.name}“`, (doc) => { (doc.axes = doc.axes || []).push(ax); });
    selectAxis(ax.id);
    return ax;
  }
  function addAxisTwoPoints(p1, p2, name, opts = {}) {
    const a = p1 instanceof THREE.Vector3 ? p1.clone() : V3(p1), b = p2 instanceof THREE.Vector3 ? p2.clone() : V3(p2);
    if (a.distanceTo(b) < 1e-4) { UI.toast('Die beiden Punkte liegen zu nah beieinander.', { icon: 'info' }); return null; }
    const base = { type: 'twoPoints', a: r6(a.toArray()), b: r6(b.toArray()) };
    if (opts.bindA) base.bindA = opts.bindA;
    if (opts.bindB) base.bindB = opts.bindB;
    return addAxis(base, name || `Achse durch 2 Punkte (${axes().length + 1})`);
  }
  function addAxisFromFace(face, name) {
    const f = resolveFace(face);
    if (!f || !Array.isArray(f.info.axis) || f.info.axis.length < 6) {
      UI.toast('Wähl eine runde Fläche (Zylinder, Kegel oder Ring).', { icon: 'info' });
      return null;
    }
    const top = Model.find(App.doc, f.id);
    const o = f.info.axis.slice(0, 3), d = f.info.axis.slice(3, 6);
    const dn = V3(d); if (dn.lengthSq() < 1e-12) return null; dn.normalize();
    return addAxis({ type: 'roundFace', id: f.id, o: r6(o), d: r6(dn.toArray()), c: r6(f.info.c || o) }, name || `Mitte von „${top ? Model.label(top.item) : 'Rundung'}“`);
  }
  function addAxisFromCircleEdge(edge, name) {
    const eRef = resolveEdge(edge);
    if (!eRef || eRef.info.t !== 'CIRCLE' || !Array.isArray(eRef.info.n) || !Array.isArray(eRef.info.c)) {
      UI.toast('Wähl eine kreisförmige Kante.', { icon: 'info' });
      return null;
    }
    const top = Model.find(App.doc, eRef.id);
    const dn = V3(eRef.info.n).normalize();
    return addAxis({ type: 'roundEdge', id: eRef.id, c: r6(eRef.info.c), d: r6(dn.toArray()), r: round(eRef.info.r || 0, 6) }, name || `Mitte Kreis „${top ? Model.label(top.item) : 'Kante'}“`);
  }
  function addAxisNormalAtPoint(face, pointWorld, name) {
    const f = resolveFace(face);
    if (!f || f.info.t !== 'PLANE' || !f.info.n) {
      UI.toast('Wähl eine ebene Fläche eines Körpers.', { icon: 'info' });
      return null;
    }
    const top = Model.find(App.doc, f.id), W = Model.worldMatrix(App.doc, f.id), WI = W.clone().invert();
    const pW = pointWorld ? (pointWorld instanceof THREE.Vector3 ? pointWorld.clone() : V3(pointWorld)) : V3(f.info.c).applyMatrix4(W);
    const lp = pW.applyMatrix4(WI), nL = V3(f.info.n).normalize(), cL = V3(f.info.c);
    lp.addScaledVector(nL, cL.clone().sub(lp).dot(nL));
    return addAxis({ type: 'faceNormal', id: f.id, fn: r6(nL.toArray()), fc: r6(cL.toArray()), lp: r6(lp.toArray()) }, name || `Senkrecht auf „${top ? Model.label(top.item) : 'Fläche'}“`);
  }
  function addAxisFixed(axis, name) { return addAxis({ type: 'fixed' }, name, axis); }

  function setAxis(id, patch, label = 'Bezugsachse geändert') {
    App.change(label, (doc) => {
      const ax = findAxis(id, doc); if (!ax) return false;
      for (const [k, v] of Object.entries(patch)) { if (k === 'name') ax.name = v; else if (k === 'hidden') { if (v) ax.hidden = true; else delete ax.hidden; } else ax.base[k] = v; }
      ax.axis = solveAxis(ax);
    }, { merge: 'axis:' + id + ':' + Object.keys(patch).join() });
  }
  function removeAxis(id) {
    App.change('Bezugsachse gelöscht', (doc) => { doc.axes = axes(doc).filter((a) => a.id !== id); });
    if (selAxis === id) selectAxis(null);
  }
  function selectAxis(id) {
    selAxis = id || null;
    if (selAxis) {
      sel = null; selPoint = null; selCsys = null;
      App.clearSelection();
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    draw(); Panels.renderRight(); Panels.renderLeft();
  }
  function applyAxisToRevolve(itemId, axisId) {
    const ax = axisId ? findAxis(axisId) : null;
    if (axisId && (!ax || !ax.axis)) return false;
    const inv = Model.worldMatrix(App.doc, itemId).invert();
    App.change(ax ? `Drehachse „${ax.name}“` : 'Skizzen-Drehachse', (doc) => {
      const f = Model.find(doc, itemId); if (!f || f.item.kind !== 'revolve') return false;
      if (ax) {
        const o = V3(ax.axis.o).applyMatrix4(inv), d = V3(ax.axis.d).transformDirection(inv).normalize();
        f.item.p.axisId = ax.id;
        f.item.p.axis3d = { o: r6(o.toArray()), d: r6(d.toArray()) };
      } else {
        delete f.item.p.axisId;
        delete f.item.p.axis3d;
        if (!f.item.p.axis) f.item.p.axis = { a: [0, 0], b: [0, 1] };
      }
    });
    return true;
  }

  // ---------- Bezugspunkte ----------
  function resolvePlaneSpec(planeRef, plMap = null) {
    if (!planeRef) return null;
    if (planeRef.kind === 'origin') {
      const P = ORIGIN[planeRef.plane] || ORIGIN.XY;
      return { o: V3(P.o), n: V3(P.n).normalize() };
    }
    if (planeRef.kind === 'datum') {
      const d = find(planeRef.datumId);
      if (!d || lost.has(d.id)) return null;
      const pl = (plMap && plMap.get(d.id)) || d.plane;
      return pl && pl.o && pl.n ? { o: V3(pl.o), n: V3(pl.n).normalize() } : null;
    }
    if (planeRef.kind === 'face') {
      const r = App.results.get(planeRef.id), W = Model.find(App.doc, planeRef.id) ? Model.worldMatrix(App.doc, planeRef.id) : null;
      if (!r || !W) return null;
      const m = matchFace(r, planeRef);
      if (!m || m.f.t !== 'PLANE' || !m.f.n) return null;
      return { o: V3(m.f.c).applyMatrix4(W), n: V3(m.f.n).transformDirection(W).normalize() };
    }
    if (planeRef.kind === 'fixed' && planeRef.o && planeRef.n) {
      const n = V3(planeRef.n);
      if (n.lengthSq() < 1e-12) return null;
      return { o: V3(planeRef.o), n: n.normalize() };
    }
    return null;
  }

  function intersectEdgeWithPlane(g, W, pO, pN, reversed, hintP = null) {
    if (!g || !W || !pO || !pN) return null;
    if (g.t === 'LINE' && g.a && g.b) {
      const A = V3(g.a).applyMatrix4(W), B = V3(g.b).applyMatrix4(W);
      const D = B.clone().sub(A);
      const denom = D.dot(pN);
      if (Math.abs(denom) < 1e-8) return null;
      const t = pO.clone().sub(A).dot(pN) / denom;
      return A.clone().addScaledVector(D, t);
    }
    const N = 128;
    const evalW = (u) => {
      const ev = evalEdgeAt(g, u, reversed);
      return ev ? ev.p.clone().applyMatrix4(W) : null;
    };
    const sdAt = (p) => p.clone().sub(pO).dot(pN);
    const cands = [];
    let u0 = 0, p0 = evalW(0);
    if (!p0) return null;
    let s0 = sdAt(p0);
    if (Math.abs(s0) < 1e-6) cands.push(p0);
    for (let i = 1; i <= N; i++) {
      const u1 = i / N, p1 = evalW(u1);
      if (!p1) continue;
      const s1 = sdAt(p1);
      if (Math.abs(s1) < 1e-6) {
        cands.push(p1);
      } else if ((s0 < 0 && s1 > 0) || (s0 > 0 && s1 < 0)) {
        let lo = u0, hi = u1, slo = s0;
        let pBest = p0.clone().lerp(p1, 0.5);
        for (let k = 0; k < 30; k++) {
          const um = 0.5 * (lo + hi), pm = evalW(um);
          if (!pm) break;
          const sm = sdAt(pm);
          pBest = pm;
          if (Math.abs(sm) < 1e-8) break;
          if ((slo < 0 && sm < 0) || (slo > 0 && sm > 0)) { lo = um; slo = sm; }
          else { hi = um; }
        }
        cands.push(pBest);
      }
      u0 = u1; p0 = p1; s0 = s1;
    }
    if (!cands.length) return null;
    if (cands.length === 1 || !hintP) return cands[0];
    let best = cands[0], bd = best.distanceTo(hintP);
    for (let i = 1; i < cands.length; i++) {
      const d = cands[i].distanceTo(hintP);
      if (d < bd) { best = cands[i]; bd = d; }
    }
    return best;
  }

  function solvePoint(pt, plMap = null) {
    const b = pt.base || { type: 'fixed' }, V = Model.vars(App.doc).v;
    if (b.type === 'fixed') {
      lostPoints.delete(pt.id);
      return r6([Model.num(b.x, V, 0), Model.num(b.y, V, 0), Model.num(b.z, V, 0)]);
    }
    if (b.type === 'edgeMid' || b.type === 'curvePercent') {
      const r = App.results.get(b.edgeId), W = Model.find(App.doc, b.edgeId) ? Model.worldMatrix(App.doc, b.edgeId) : null;
      if (r && W) {
        const m = matchEdge(r, b.edge);
        if (m) {
          let t = b.type === 'edgeMid' ? 0.5 : clamp(Model.num(b.percent, V, 50), 0, 100) / 100;
          if (b.type === 'curvePercent' && b.flip) t = 1 - t;
          const ev = evalEdgeAt(m.g, t, m.reversed);
          if (ev) {
            lostPoints.delete(pt.id);
            return r6(ev.p.clone().applyMatrix4(W).toArray());
          }
        }
      }
      if (r || !Model.find(App.doc, b.edgeId)) lostPoints.add(pt.id);
      return pt.point;
    }
    if (b.type === 'faceCenter') {
      const r = App.results.get(b.id), W = Model.find(App.doc, b.id) ? Model.worldMatrix(App.doc, b.id) : null;
      if (r && W) {
        const m = matchFace(r, b);
        if (m && Array.isArray(m.f.c)) {
          lostPoints.delete(pt.id);
          return r6(V3(m.f.c).applyMatrix4(W).toArray());
        }
      }
      if (r || !Model.find(App.doc, b.id)) lostPoints.add(pt.id);
      return pt.point;
    }
    if (b.type === 'edgePlaneIntersect') {
      const rE = App.results.get(b.edgeId), WE = Model.find(App.doc, b.edgeId) ? Model.worldMatrix(App.doc, b.edgeId) : null;
      const pl = resolvePlaneSpec(b.planeRef, plMap);
      if (rE && WE && pl) {
        const m = matchEdge(rE, b.edge);
        if (m) {
          const hint = Array.isArray(pt.point) ? V3(pt.point) : null;
          const pW = intersectEdgeWithPlane(m.g, WE, pl.o, pl.n, m.reversed, hint);
          if (pW) {
            lostPoints.delete(pt.id);
            return r6(pW.toArray());
          }
        }
      }
      if (rE || !Model.find(App.doc, b.edgeId) || !pl) lostPoints.add(pt.id);
      return pt.point;
    }
    return pt.point;
  }

  function addPoint(base, name, point) {
    const pt = { id: uid('dpt'), name: name || `Punkt ${points().length + 1}`, base, point: point || null };
    pt.point = solvePoint({ ...pt, point: point || [0, 0, 0] });
    App.change(`Bezugspunkt „${pt.name}“`, (doc) => { (doc.points = doc.points || []).push(pt); });
    selectPoint(pt.id);
    return pt;
  }
  function addPointEdgeMid(edge, name) {
    const eRef = resolveEdge(edge);
    if (!eRef) { UI.toast('Wähl zuerst eine Kante.', { icon: 'info' }); return null; }
    const top = Model.find(App.doc, eRef.id);
    return addPoint({ type: 'edgeMid', edgeId: eRef.id, edge: makeEdgeRef(eRef) }, name || `Kantenmitte (${top ? Model.label(top.item) : 'Kante'})`);
  }
  function addPointFaceCenter(face, name) {
    const fRef = resolveFace(face);
    if (!fRef) { UI.toast('Wähl zuerst eine Fläche.', { icon: 'info' }); return null; }
    const top = Model.find(App.doc, fRef.id);
    return addPoint({ type: 'faceCenter', ...makeFaceRef(fRef) }, name || `Flächenmitte (${top ? Model.label(top.item) : 'Fläche'})`);
  }
  function addPointOnCurve(edge, percent = 50, name) {
    const eRef = resolveEdge(edge);
    if (!eRef) { UI.toast('Wähl zuerst eine Kante oder Kurve.', { icon: 'info' }); return null; }
    let pct = 50, flip = false;
    if (percent && typeof percent === 'object') { pct = percent.percent ?? 50; flip = !!percent.flip; }
    else if (percent != null) pct = percent;
    const top = Model.find(App.doc, eRef.id);
    const pTxt = typeof pct === 'number' ? fmt(pct, 0) + ' %' : String(pct);
    const base = { type: 'curvePercent', edgeId: eRef.id, edge: makeEdgeRef(eRef), percent: pct };
    if (flip) base.flip = true;
    return addPoint(base, name || `Punkt ${pTxt} (${top ? Model.label(top.item) : 'Kurve'})`);
  }
  function addPointEdgePlane(edge, planeSpec, name) {
    const eRef = resolveEdge(edge);
    if (!eRef) { UI.toast('Wähl zuerst eine Kante.', { icon: 'info' }); return null; }
    let planeRef = null;
    if (typeof planeSpec === 'string') {
      if (ORIGIN[planeSpec]) planeRef = { kind: 'origin', plane: planeSpec };
      else if (find(planeSpec)) planeRef = { kind: 'datum', datumId: planeSpec };
    } else if (planeSpec && typeof planeSpec === 'object') {
      if (planeSpec.kind) planeRef = planeSpec;
      else if (planeSpec.datumId) planeRef = { kind: 'datum', datumId: planeSpec.datumId };
      else if (planeSpec.id) {
        const fRef = resolveFace(planeSpec);
        if (!fRef || fRef.info.t !== 'PLANE') { UI.toast('Wähl eine ebene Fläche oder Bezugsebene.', { icon: 'info' }); return null; }
        planeRef = { kind: 'face', ...makeFaceRef(fRef) };
      } else if (planeSpec.o && planeSpec.n) {
        planeRef = { kind: 'fixed', o: r6(V3(planeSpec.o).toArray()), n: r6(V3(planeSpec.n).normalize().toArray()) };
      }
    }
    const pl = resolvePlaneSpec(planeRef);
    if (!pl) { UI.toast('Wähl eine gültige Ebene oder ebene Fläche.', { icon: 'info' }); return null; }
    const WE = Model.worldMatrix(App.doc, eRef.id);
    const pW = intersectEdgeWithPlane(eRef.info, WE, pl.o, pl.n, false, null);
    if (!pW) { UI.toast('Die Kante läuft parallel zur Ebene oder schneidet sie nicht.', { icon: 'info' }); return null; }
    const top = Model.find(App.doc, eRef.id);
    return addPoint({ type: 'edgePlaneIntersect', edgeId: eRef.id, edge: makeEdgeRef(eRef), planeRef }, name || `Schnittpunkt (${top ? Model.label(top.item) : 'Kante'})`, r6(pW.toArray()));
  }
  function addPointFixed(p, name) {
    const a = Array.isArray(p) ? p : p instanceof THREE.Vector3 ? p.toArray() : [0, 0, 0];
    return addPoint({ type: 'fixed', x: a[0] ?? 0, y: a[1] ?? 0, z: a[2] ?? 0 }, name || `Punkt ${points().length + 1}`, r6(a));
  }
  function setPoint(id, patch, label = 'Bezugspunkt geändert') {
    App.change(label, (doc) => {
      const pt = findPoint(id, doc); if (!pt) return false;
      for (const [k, v] of Object.entries(patch)) { if (k === 'name') pt.name = v; else if (k === 'hidden') { if (v) pt.hidden = true; else delete pt.hidden; } else pt.base[k] = v; }
      pt.point = solvePoint(pt);
    }, { merge: 'point:' + id + ':' + Object.keys(patch).join() });
  }
  function removePoint(id) {
    App.change('Bezugspunkt gelöscht', (doc) => { doc.points = points(doc).filter((p) => p.id !== id); });
    if (selPoint === id) selectPoint(null);
  }
  function selectPoint(id) {
    selPoint = id || null;
    if (selPoint) {
      sel = null; selAxis = null; selCsys = null;
      App.clearSelection();
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    draw(); Panels.renderRight(); Panels.renderLeft();
  }

  // ---------- Eigene Koordinatensysteme ----------
  function orthonormalFrame(o, xVec, yVec, opts = {}) {
    const ov = o instanceof THREE.Vector3 ? o.clone() : V3(o);
    const x = (xVec instanceof THREE.Vector3 ? xVec.clone() : V3(xVec || [1, 0, 0]));
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    if (opts.flipX) x.negate();
    let y = yVec ? (yVec instanceof THREE.Vector3 ? yVec.clone() : V3(yVec)) : null;
    if (y && opts.flipY) y.negate();
    if (y) y.addScaledVector(x, -y.dot(x));
    if (!y || y.lengthSq() < 1e-8) {
      const ref = Math.abs(x.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      y = new THREE.Vector3().crossVectors(ref, x);
      if (opts.flipY) y.negate();
    }
    y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    if (opts.flipZ) { z.negate(); y.negate(); }
    return { o: r6(ov.toArray()), x: r6(x.toArray()), y: r6(y.toArray()), z: r6(z.toArray()) };
  }
  function edgeWorldDirFromMatch(m, W) {
    if (!m || !m.g) return null;
    if (m.g.t === 'LINE') {
      const A = V3(m.g.a).applyMatrix4(W), B = V3(m.g.b).applyMatrix4(W);
      const d = B.sub(A);
      if (d.lengthSq() < 1e-12) return null;
      d.normalize();
      if (m.reversed) d.negate();
      return d;
    }
    const ev = evalEdgeAt(m.g, 0, m.reversed);
    return ev ? ev.tan.clone().transformDirection(W).normalize() : null;
  }
  function solveCsys(cs, axMap = null, ptMap = null) {
    const b = cs.base || { type: 'fixed' }, V = Model.vars(App.doc).v;
    if (b.type === 'fixed') {
      lostCsys.delete(cs.id);
      const o = b.ox != null || b.oy != null || b.oz != null
        ? [Model.num(b.ox, V, 0), Model.num(b.oy, V, 0), Model.num(b.oz, V, 0)]
        : (b.origin || [0, 0, 0]);
      return orthonormalFrame(o, b.xDir || [1, 0, 0], b.yDir || [0, 1, 0], b);
    }
    const O = resolveBoundPoint(b.origin, b.originBind, ptMap);
    if (!O) { lostCsys.add(cs.id); return cs.csys; }
    let xW = null, yW = null;
    if (b.xEdge) {
      const rX = App.results.get(b.xEdge.id), WX = Model.find(App.doc, b.xEdge.id) ? Model.worldMatrix(App.doc, b.xEdge.id) : null;
      const mX = rX && WX ? matchEdge(rX, b.xEdge) : null;
      xW = mX ? edgeWorldDirFromMatch(mX, WX) : null;
      if (!xW) { lostCsys.add(cs.id); return cs.csys; }
    } else if (b.xAxisId) {
      const ax = (axMap && axMap.get(b.xAxisId)) || (findAxis(b.xAxisId) && findAxis(b.xAxisId).axis);
      if (!ax || !Array.isArray(ax.d) || lostAxes.has(b.xAxisId)) { lostCsys.add(cs.id); return cs.csys; }
      xW = V3(ax.d).normalize();
    } else {
      xW = V3(b.xDir || [1, 0, 0]).normalize();
    }
    if (b.yEdge) {
      const rY = App.results.get(b.yEdge.id), WY = Model.find(App.doc, b.yEdge.id) ? Model.worldMatrix(App.doc, b.yEdge.id) : null;
      const mY = rY && WY ? matchEdge(rY, b.yEdge) : null;
      yW = mY ? edgeWorldDirFromMatch(mY, WY) : null;
      if (!yW || Math.abs(xW.dot(yW)) > 0.9999) { lostCsys.add(cs.id); return cs.csys; }
    } else if (b.yAxisId) {
      const ay = (axMap && axMap.get(b.yAxisId)) || (findAxis(b.yAxisId) && findAxis(b.yAxisId).axis);
      if (!ay || !Array.isArray(ay.d) || lostAxes.has(b.yAxisId)) { lostCsys.add(cs.id); return cs.csys; }
      yW = V3(ay.d).normalize();
      if (Math.abs(xW.dot(yW)) > 0.9999) { lostCsys.add(cs.id); return cs.csys; }
    } else if (b.yDir) {
      yW = V3(b.yDir).normalize();
    }
    lostCsys.delete(cs.id);
    return orthonormalFrame(O, xW, yW, b);
  }

  function addCsys(base, name, csys) {
    const cs = { id: uid('dcs'), name: name || `Koordinatensystem ${csysList().length + 1}`, base, csys: csys || null };
    cs.csys = solveCsys({ ...cs, csys: csys || orthonormalFrame([0, 0, 0], [1, 0, 0], [0, 1, 0]) });
    App.change(`Koordinatensystem „${cs.name}“`, (doc) => { (doc.csys = doc.csys || []).push(cs); });
    selectCsys(cs.id);
    return cs;
  }
  function addCsysFromPointEdges(originSpec, xEdge = null, yEdge = null, name = null, opts = {}) {
    let originW = null, originBind = opts.bind || null;
    if (typeof originSpec === 'string') {
      const pt = findPoint(originSpec);
      if (!pt || !Array.isArray(pt.point)) { UI.toast('Bezugspunkt nicht gefunden.', { icon: 'info' }); return null; }
      originW = V3(pt.point); originBind = { pointId: pt.id };
    } else if (originSpec && originSpec.pointId) {
      const pt = findPoint(originSpec.pointId);
      if (!pt || !Array.isArray(pt.point)) { UI.toast('Bezugspunkt nicht gefunden.', { icon: 'info' }); return null; }
      originW = V3(pt.point); originBind = { pointId: pt.id };
    } else if (originSpec && originSpec.p) {
      originW = originSpec.p instanceof THREE.Vector3 ? originSpec.p.clone() : V3(originSpec.p);
      if (!originBind && originSpec.bind) originBind = originSpec.bind;
    } else if (originSpec) {
      originW = originSpec instanceof THREE.Vector3 ? originSpec.clone() : V3(originSpec);
    }
    if (!originW) return null;
    if (!originBind) originBind = autoBindWorldPoint(originW);
    const xr = xEdge ? resolveEdge(xEdge) : null;
    if (xEdge && !xr) { UI.toast('Die gewählte X-Kante gibt es nicht.', { icon: 'info' }); return null; }
    const yr = yEdge ? resolveEdge(yEdge) : null;
    if (yEdge && !yr) { UI.toast('Die gewählte Y-Kante gibt es nicht.', { icon: 'info' }); return null; }
    const dirFromRef = (er) => {
      const W = Model.worldMatrix(App.doc, er.id);
      if (er.info.t === 'LINE') {
        const A = V3(er.info.a).applyMatrix4(W), B = V3(er.info.b).applyMatrix4(W);
        const d = B.clone().sub(A);
        return d.lengthSq() > 1e-12 ? { dir: d.normalize(), A, B } : null;
      }
      const ev = evalEdgeAt(er.info, 0, false);
      return ev ? { dir: ev.tan.clone().transformDirection(W).normalize(), A: null, B: null } : null;
    };
    let xDirW = opts.xDir ? V3(opts.xDir).normalize() : new THREE.Vector3(1, 0, 0), flipX = !!opts.flipX;
    if (xr) {
      const xd = dirFromRef(xr);
      if (!xd) return null;
      xDirW = xd.dir;
      if (opts.flipX === undefined && xd.A && xd.B && originW.distanceTo(xd.B) + 1e-3 < originW.distanceTo(xd.A)) flipX = true;
    }
    let yDirW = opts.yDir ? V3(opts.yDir).normalize() : null, flipY = !!opts.flipY;
    if (yr) {
      const yd = dirFromRef(yr);
      if (!yd) return null;
      yDirW = yd.dir;
      if (Math.abs(xDirW.dot(yDirW)) > 0.9999) {
        UI.toast('X- und Y-Kante laufen parallel – wähle zwei Kanten mit Winkel dazwischen.', { icon: 'info' });
        return null;
      }
      if (opts.flipY === undefined && yd.A && yd.B && originW.distanceTo(yd.B) + 1e-3 < originW.distanceTo(yd.A)) flipY = true;
    }
    const base = {
      type: 'pointEdges',
      origin: r6(originW.toArray()),
      ...(originBind ? { originBind } : {}),
      ...(xr ? { xEdge: makeEdgeRef(xr) } : { xDir: r6(xDirW.toArray()) }),
      ...(yr ? { yEdge: makeEdgeRef(yr) } : (yDirW ? { yDir: r6(yDirW.toArray()) } : {})),
      ...(flipX ? { flipX: true } : {}),
      ...(flipY ? { flipY: true } : {}),
      ...(opts.flipZ ? { flipZ: true } : {}),
    };
    return addCsys(base, name || `Koordinatensystem ${csysList().length + 1}`);
  }
  function addCsysFixed(o = [0, 0, 0], x = [1, 0, 0], y = [0, 1, 0], name = null) {
    const ov = Array.isArray(o) ? o : o instanceof THREE.Vector3 ? o.toArray() : [0, 0, 0];
    return addCsys({ type: 'fixed', ox: ov[0] ?? 0, oy: ov[1] ?? 0, oz: ov[2] ?? 0, xDir: r6(V3(x).normalize().toArray()), yDir: r6(V3(y).normalize().toArray()) }, name);
  }
  function csysExportMatrix(id) {
    const cs = findCsys(id);
    if (!cs || !cs.csys) return null;
    const O = cs.csys.o, X = cs.csys.x, Y = cs.csys.y, Z = cs.csys.z;
    if (!O || !X || !Y || !Z) return null;
    const tx = -(X[0] * O[0] + X[1] * O[1] + X[2] * O[2]);
    const ty = -(Y[0] * O[0] + Y[1] * O[1] + Y[2] * O[2]);
    const tz = -(Z[0] * O[0] + Z[1] * O[1] + Z[2] * O[2]);
    return [X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, tx, ty, tz, 1];
  }
  function setCsys(id, patch, label = 'Koordinatensystem geändert') {
    App.change(label, (doc) => {
      const cs = findCsys(id, doc); if (!cs) return false;
      for (const [k, v] of Object.entries(patch)) { if (k === 'name') cs.name = v; else if (k === 'hidden') { if (v) cs.hidden = true; else delete cs.hidden; } else cs.base[k] = v; }
      cs.csys = solveCsys(cs);
    }, { merge: 'csys:' + id + ':' + Object.keys(patch).join() });
  }
  function removeCsys(id) {
    App.change('Koordinatensystem gelöscht', (doc) => { doc.csys = csysList(doc).filter((c) => c.id !== id); });
    if (selCsys === id) selectCsys(null);
  }
  function selectCsys(id) {
    selCsys = id || null;
    if (selCsys) {
      sel = null; selAxis = null; selPoint = null;
      App.clearSelection();
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    draw(); Panels.renderRight(); Panels.renderLeft();
  }

  // ---------- Nachführen nach jedem Rechnen ----------
  function relink() {
    const upd = [], axUpd = [], ptUpd = [], csUpd = [];
    const plMap = new Map(), axMap = new Map(), ptMap = new Map();
    for (const d of list()) {
      const p = solve(d);
      plMap.set(d.id, p || d.plane);
      if (p && JSON.stringify(p) !== JSON.stringify(d.plane)) upd.push([d.id, p]);
    }
    for (const ax of axes()) {
      const a = solveAxis(ax);
      axMap.set(ax.id, a || ax.axis);
      if (a && (!ax.axis || vecDiff(a.o, ax.axis.o) > 1e-5 || vecDiff(a.d, ax.axis.d) > 1e-5)) axUpd.push([ax.id, a]);
    }
    for (const pt of points()) {
      const p = solvePoint(pt, plMap);
      ptMap.set(pt.id, p || pt.point);
      if (p && (!pt.point || vecDiff(p, pt.point) > 1e-5)) ptUpd.push([pt.id, p]);
    }
    for (const cs of csysList()) {
      const c = solveCsys(cs, axMap, ptMap);
      if (c && (!cs.csys || vecDiff(c.o, cs.csys.o) > 1e-5 || vecDiff(c.x, cs.csys.x) > 1e-5 || vecDiff(c.y, cs.csys.y) > 1e-5 || vecDiff(c.z, cs.csys.z) > 1e-5)) csUpd.push([cs.id, c]);
    }
    const itemUpd = [];
    Model.walk(App.doc.items, (it) => {
      const p = it.p || {};
      if (!p.axisId) return;
      const ax = axMap.get(p.axisId);
      if (!ax || !Array.isArray(ax.o) || !Array.isArray(ax.d)) return;
      const inv = Model.worldMatrix(App.doc, it.id).invert();
      const lo = r6(V3(ax.o).applyMatrix4(inv).toArray()), ld = r6(V3(ax.d).transformDirection(inv).normalize().toArray());
      if (it.kind === 'group' && p.op === 'pattern' && p.pt === 'circ') {
        if (p.axis !== 'pick' || vecDiff(p.ao, lo) > 1e-5 || vecDiff(p.ad, ld) > 1e-5) itemUpd.push({ id: it.id, kind: 'circ', o: lo, d: ld });
      } else if (it.kind === 'revolve') {
        const cur = p.axis3d;
        if (!cur || vecDiff(cur.o, lo) > 1e-5 || vecDiff(cur.d, ld) > 1e-5) itemUpd.push({ id: it.id, kind: 'revolve', o: lo, d: ld });
      }
    });
    if (!upd.length && !axUpd.length && !ptUpd.length && !csUpd.length && !itemUpd.length) { relinkRounds = 0; draw(); return; }
    if (++relinkRounds > 3) { relinkRounds = 0; draw(); return; }
    App.change('Bezüge nachgeführt', (doc) => {
      for (const [id, p] of upd) { const d = find(id, doc); if (d) d.plane = p; }
      for (const [id, a] of axUpd) { const ax = findAxis(id, doc); if (ax) ax.axis = a; }
      for (const [id, p] of ptUpd) { const pt = findPoint(id, doc); if (pt) pt.point = p; }
      for (const [id, c] of csUpd) { const cs = findCsys(id, doc); if (cs) cs.csys = c; }
      for (const u of itemUpd) {
        const f = Model.find(doc, u.id); if (!f) continue;
        if (u.kind === 'circ') { f.item.p.axis = 'pick'; f.item.p.ao = u.o; f.item.p.ad = u.d; }
        else { f.item.p.axis3d = { o: u.o, d: u.d }; }
      }
    }, { amend: true });
    draw();
  }

  // ---------- Zeichnen im Bild & Picking ----------
  function draw() {
    const g = Viewer.groups.datums; if (!g) return;
    for (const c of [...g.children]) { g.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    let box = Viewer.sceneBox ? Viewer.sceneBox() : null;
    const size = box && !box.isEmpty() ? Math.max(30, box.getSize(new THREE.Vector3()).length() * 0.45) : 60;
    for (const d of list()) {
      if (d.hidden || !d.plane) continue;
      const on = d.id === sel, col = new THREE.Color(lost.has(d.id) ? '#e03131' : on ? '#f08c00' : '#d9a441');
      const n = V3(d.plane.n).normalize(), x = V3(d.plane.x).normalize(), y = new THREE.Vector3().crossVectors(n, x), o = V3(d.plane.o);
      const m = new THREE.Matrix4().makeBasis(x, y, n).setPosition(o);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: on ? 0.16 : 0.08, side: THREE.DoubleSide, depthWrite: false }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: on ? 1 : 0.7 }));
      const grp = new THREE.Group(); grp.add(quad, edge); grp.matrixAutoUpdate = false; grp.matrix.copy(m); grp.userData.datum = d.id;
      g.add(grp);
    }
    for (const ax of axes()) {
      if (ax.hidden || !ax.axis || !Array.isArray(ax.axis.o) || !Array.isArray(ax.axis.d)) continue;
      const on = ax.id === selAxis, col = new THREE.Color(lostAxes.has(ax.id) ? '#e03131' : on ? '#f08c00' : '#0ca678');
      const o = V3(ax.axis.o), d = V3(ax.axis.d).normalize();
      let half = Math.max(30, size * 0.85);
      const grp = new THREE.Group(); grp.userData.datumAxis = ax.id;
      if (ax.base && ax.base.type === 'twoPoints') {
        const pts = twoPointPositions(ax.base);
        if (pts) {
          half = Math.max(half, pts[0].distanceTo(pts[1]) * 0.75);
          for (const pt of pts) {
            const pm = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.9, size * 0.025), 10, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.85 }));
            pm.position.copy(pt); pm.renderOrder = 25; grp.add(pm);
          }
        }
      }
      const p0 = o.clone().addScaledVector(d, -half), p1 = o.clone().addScaledVector(d, half);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), new THREE.LineDashedMaterial({ color: col, dashSize: 4, gapSize: 2.2, depthTest: false, transparent: true, opacity: on ? 1 : 0.85 }));
      line.computeLineDistances(); line.renderOrder = 24;
      const mid = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.8, size * 0.02), 10, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.75 }));
      mid.position.copy(o); mid.renderOrder = 25;
      grp.add(line, mid); g.add(grp);
    }
    for (const pt of points()) {
      if (pt.hidden || !Array.isArray(pt.point)) continue;
      const on = pt.id === selPoint, col = new THREE.Color(lostPoints.has(pt.id) ? '#e03131' : on ? '#f08c00' : '#7950f2');
      const o = V3(pt.point), arm = Math.max(2.5, size * 0.06), rad = Math.max(0.9, size * 0.022);
      const grp = new THREE.Group(); grp.userData.datumPoint = pt.id;
      const sph = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.9 }));
      sph.position.copy(o); sph.renderOrder = 26;
      const segPts = [
        new THREE.Vector3(o.x - arm, o.y, o.z), new THREE.Vector3(o.x + arm, o.y, o.z),
        new THREE.Vector3(o.x, o.y - arm, o.z), new THREE.Vector3(o.x, o.y + arm, o.z),
        new THREE.Vector3(o.x, o.y, o.z - arm), new THREE.Vector3(o.x, o.y, o.z + arm),
      ];
      const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segPts), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.85 }));
      cross.renderOrder = 26;
      grp.add(sph, cross); g.add(grp);
    }
    for (const cs of csysList()) {
      if (cs.hidden || !cs.csys || !Array.isArray(cs.csys.o)) continue;
      const on = cs.id === selCsys, isLost = lostCsys.has(cs.id);
      const o = V3(cs.csys.o), len = Math.max(16, size * 0.35), headR = Math.max(0.9, len * 0.08), headH = Math.max(2.5, len * 0.22);
      const grp = new THREE.Group(); grp.userData.datumCsys = cs.id;
      const oCol = new THREE.Color(isLost ? '#e03131' : on ? '#f08c00' : '#1971c2');
      const oSph = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.0, size * 0.024), 12, 8), new THREE.MeshBasicMaterial({ color: oCol, depthTest: false, transparent: true, opacity: on ? 1 : 0.9 }));
      oSph.position.copy(o); oSph.renderOrder = 26; grp.add(oSph);
      const axesSpec = [['x', '#e03131'], ['y', '#2f9e44'], ['z', '#1971c2']];
      for (const [k, hex] of axesSpec) {
        const dv = V3(cs.csys[k]).normalize();
        const col = new THREE.Color(isLost ? '#e03131' : on ? '#f08c00' : hex);
        const end = o.clone().addScaledVector(dv, len);
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([o, end]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.9 }));
        ln.renderOrder = 26;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(headR, headH, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: on ? 1 : 0.9 }));
        cone.position.copy(end);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv);
        cone.renderOrder = 26;
        grp.add(ln, cone);
      }
      g.add(grp);
    }
    Viewer.requestRender();
  }

  function pickAxis(cx, cy, maxPx = 10) {
    const r = Viewer.canvas.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    const box = Viewer.sceneBox ? Viewer.sceneBox() : null;
    const size = box && !box.isEmpty() ? Math.max(30, box.getSize(new THREE.Vector3()).length() * 0.45) : 60;
    const half = Math.max(30, size * 0.85);
    let best = null;
    for (const ax of axes()) {
      if (ax.hidden || !ax.axis || !Array.isArray(ax.axis.o) || !Array.isArray(ax.axis.d)) continue;
      const o = V3(ax.axis.o), d = V3(ax.axis.d).normalize();
      const a = Viewer.toScreen(o.clone().addScaledVector(d, -half));
      const b = Viewer.toScreen(o.clone().addScaledVector(d, half));
      if (a.behind && b.behind) continue;
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 ? clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1) : 0;
      const dist = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
      if (dist <= maxPx && (!best || dist < best.px)) best = { ax, px: dist };
    }
    return best;
  }

  // ---------- Interaktive 3D-Picker ----------
  function stopPick() {
    if (!pickState) return;
    Viewer.canvas.removeEventListener('pointerdown', pickState.down, true);
    window.removeEventListener('keydown', pickState.key, true);
    for (const m of pickState.marks || []) { Viewer.groups.overlay.remove(m); m.geometry.dispose(); m.material.dispose(); }
    Viewer.canvas.style.cursor = '';
    Viewer.highlightEdge(null, null);
    Viewer.highlightFace('sel', null, null);
    UI.hint(null);
    pickState = null;
    Viewer.requestRender();
  }
  function addPickMark(p, marks) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(Viewer.pixelSizeAt(p) * 5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0ca678'), depthTest: false }));
    m.position.copy(p); m.renderOrder = 41; Viewer.groups.overlay.add(m); marks.push(m); Viewer.requestRender();
  }

  function startEdgeAnglePick(angle = 30, preEdge = null) {
    stopPick();
    let edgeRef = preEdge ? resolveEdge(preEdge) : null;
    if (edgeRef && edgeRef.info.t !== 'LINE') { UI.toast('Wähl eine gerade Kante.', { icon: 'info' }); return; }
    if (edgeRef) Viewer.highlightEdge(edgeRef.id, edgeRef.idx);
    const hint = () => UI.hint(edgeRef
      ? `<b>Ebene im Winkel (${fmt(Number(angle) || 30, 1)}°):</b> Klick eine ebene Fläche als Bezug für den Winkel. <b>Esc</b> bricht ab.`
      : `<b>Ebene im Winkel (${fmt(Number(angle) || 30, 1)}°):</b> Klick zuerst eine gerade Kante. <b>Esc</b> bricht ab.`);
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!edgeRef) {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
        const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
        if (!er || er.info.t !== 'LINE') { UI.toast('Klick eine gerade Kante eines Körpers an.', { icon: 'info' }); return; }
        edgeRef = er;
        Viewer.highlightEdge(er.id, er.idx);
        hint();
        return;
      }
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const fr = hit && hit.faceIdx >= 0 ? resolveFace({ id: hit.id, idx: hit.faceIdx }) : null;
      if (!fr || fr.info.t !== 'PLANE') { UI.toast('Klick eine ebene Fläche als Winkel-Bezug an.', { icon: 'info' }); return; }
      const er = edgeRef;
      stopPick();
      addEdgeAngle(er, fr, angle);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startTangentPick(preFace = null) {
    stopPick();
    const pre = preFace ? resolveFace(preFace) : null;
    if (pre && pre.info.t !== 'CYLINDRE' && pre.info.t !== 'CONE') { UI.toast('Wähl eine runde Fläche (Zylinder oder Kegel).', { icon: 'info' }); return; }
    if (pre) Viewer.highlightFace('sel', pre.id, pre.idx);
    const hint = () => UI.hint('<b>Tangentiale Ebene:</b> Klick die Stelle auf der runden Fläche (Zylinder oder Kegel). <b>Esc</b> bricht ab.');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const fr = hit && hit.faceIdx >= 0 ? resolveFace({ id: hit.id, idx: hit.faceIdx }) : null;
      if (!fr || (fr.info.t !== 'CYLINDRE' && fr.info.t !== 'CONE')) { UI.toast('Klick auf die runde Fläche eines Zylinders oder Kegels.', { icon: 'info' }); return; }
      const p = hit.point.clone();
      stopPick();
      addTangent(fr, p);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startNormalCurvePick(posMode = 'mid', percent = 50, preEdge = null) {
    stopPick();
    const pre = preEdge ? resolveEdge(preEdge) : null;
    if (pre) { addNormalToCurve(pre, { posMode, percent }); return; }
    const hint = () => UI.hint('<b>Ebene senkrecht zu Kante/Kurve:</b> Klick eine Kante oder Kurve eines Körpers. <b>Esc</b> bricht ab.');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
      if (!er) { UI.toast('Klick eine Kante oder Kurve eines Körpers an.', { icon: 'info' }); return; }
      stopPick();
      addNormalToCurve(er, { posMode, percent });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startEdgePointPick(preEdge = null) {
    stopPick();
    let edgeRef = preEdge ? resolveEdge(preEdge) : null;
    if (edgeRef && edgeRef.info.t !== 'LINE') { UI.toast('Wähl eine gerade Kante.', { icon: 'info' }); return; }
    if (edgeRef) Viewer.highlightEdge(edgeRef.id, edgeRef.idx);
    const hint = () => UI.hint(edgeRef
      ? '<b>Ebene durch Kante &amp; Punkt:</b> Klick einen Punkt (Ecken und Kantenmitten rasten ein). <b>Esc</b> bricht ab.'
      : '<b>Ebene durch Kante &amp; Punkt:</b> Klick zuerst eine gerade Kante. <b>Esc</b> bricht ab.');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!edgeRef) {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
        const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
        if (!er || er.info.t !== 'LINE') { UI.toast('Klick eine gerade Kante eines Körpers an.', { icon: 'info' }); return; }
        edgeRef = er;
        Viewer.highlightEdge(er.id, er.idx);
        hint();
        return;
      }
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true });
      const info = hit ? snapBodyPointInfo(hit, e.clientX, e.clientY) : null;
      const p = info ? info.w : Viewer.pickPlane(e.clientX, e.clientY, 0);
      if (!p) return;
      const er = edgeRef;
      const bind = info ? info.bind : null;
      stopPick();
      addEdgePoint(er, p, null, { bind });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startTwoEdgesPick(preEdge = null) {
    stopPick();
    let edge1 = preEdge ? resolveEdge(preEdge) : null;
    if (edge1 && edge1.info.t !== 'LINE') { UI.toast('Wähl eine gerade Kante.', { icon: 'info' }); return; }
    if (edge1) Viewer.highlightEdge(edge1.id, edge1.idx);
    const hint = () => UI.hint(edge1
      ? '<b>Ebene durch zwei Kanten:</b> Klick die zweite gerade Kante (parallel oder schneidend). <b>Esc</b> bricht ab.'
      : '<b>Ebene durch zwei Kanten:</b> Klick die erste gerade Kante. <b>Esc</b> bricht ab.');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
      if (!er || er.info.t !== 'LINE') { UI.toast('Klick eine gerade Kante eines Körpers an.', { icon: 'info' }); return; }
      if (!edge1) {
        edge1 = er;
        Viewer.highlightEdge(er.id, er.idx);
        hint();
        return;
      }
      const e1 = edge1;
      stopPick();
      addTwoEdges(e1, er);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startAxisPick(mode) {
    stopPick();
    const got = [], marks = [];
    const hint = () => UI.hint({
      twoPoints: `<b>Achse durch zwei Punkte:</b> Klick Punkt ${got.length + 1} von 2 (Ecken und Kantenmitten rasten ein). <b>Esc</b> bricht ab.`,
      roundFace: '<b>Achse durch Rundung:</b> Klick eine runde Fläche (Zylinder, Kegel, Ring) oder einen runden Rand. <b>Esc</b> bricht ab.',
      faceNormal: '<b>Achse senkrecht auf Fläche:</b> Klick die Stelle auf einer ebenen Fläche (Ecken und Kantenmitten rasten ein). <b>Esc</b> bricht ab.',
    }[mode] || '<b>Achse wählen:</b> <b>Esc</b> bricht ab.');

    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (mode === 'twoPoints') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true });
        let p = hit ? snapBodyPoint(hit, e.clientX, e.clientY) : null, bind = null;
        if (p && hit) {
          const WI = Model.worldMatrix(App.doc, hit.id).invert();
          bind = { id: hit.id, lp: r6(p.clone().applyMatrix4(WI).toArray()) };
        } else {
          p = Viewer.pickPlane(e.clientX, e.clientY, 0);
        }
        if (!p) return;
        got.push({ p, bind });
        addPickMark(p, marks);
        if (got.length < 2) { hint(); return; }
        const [A, B] = got;
        stopPick();
        addAxisTwoPoints(A.p, B.p, null, { bindA: A.bind, bindB: B.bind });
        return;
      }
      if (mode === 'roundFace') {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9 });
        if (!hit) { UI.toast('Klick eine runde Fläche oder eine kreisförmige Kante an.', { icon: 'info' }); return; }
        if (hit.faceIdx >= 0) {
          const fr = resolveFace({ id: hit.id, idx: hit.faceIdx });
          if (fr && Array.isArray(fr.info.axis) && fr.info.axis.length >= 6) { stopPick(); addAxisFromFace(fr); return; }
        }
        if (hit.edgeIdx != null) {
          const er = resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx });
          if (er && er.info.t === 'CIRCLE') { stopPick(); addAxisFromCircleEdge(er); return; }
        }
        UI.toast('Keine runde Fläche oder kreisförmige Kante getroffen.', { icon: 'info' });
        return;
      }
      if (mode === 'faceNormal') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true });
        const fr = hit && hit.faceIdx >= 0 ? resolveFace({ id: hit.id, idx: hit.faceIdx }) : null;
        if (!fr || fr.info.t !== 'PLANE') { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
        const p = snapBodyPoint(hit, e.clientX, e.clientY) || hit.point.clone();
        stopPick();
        addAxisNormalAtPoint(fr, p);
      }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startPointPick(mode, opts = {}) {
    stopPick();
    let edgeRef = opts.preEdge ? resolveEdge(opts.preEdge) : null;
    if (edgeRef) Viewer.highlightEdge(edgeRef.id, edgeRef.idx);
    const hint = () => UI.hint({
      edgeMid: '<b>Bezugspunkt Kantenmitte:</b> Klick eine Kante eines Körpers. <b>Esc</b> bricht ab.',
      faceCenter: '<b>Bezugspunkt Flächenmitte:</b> Klick eine Fläche eines Körpers. <b>Esc</b> bricht ab.',
      curvePercent: `<b>Bezugspunkt auf Kurve (${fmt(Number(opts.percent) || 50, 0)} %):</b> Klick eine Kante oder Kurve eines Körpers. <b>Esc</b> bricht ab.`,
      edgePlaneIntersect: edgeRef
        ? '<b>Schnittpunkt Kante / Ebene:</b> Klick eine ebene Fläche als Schnitt-Ebene. <b>Esc</b> bricht ab.'
        : '<b>Schnittpunkt Kante / Ebene:</b> Klick zuerst eine Kante oder Kurve. <b>Esc</b> bricht ab.',
    }[mode] || '<b>Bezugspunkt wählen:</b> <b>Esc</b> bricht ab.');

    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (mode === 'edgeMid' || mode === 'curvePercent') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
        const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
        if (!er) { UI.toast('Klick eine Kante oder Kurve eines Körpers an.', { icon: 'info' }); return; }
        stopPick();
        if (mode === 'edgeMid') addPointEdgeMid(er);
        else addPointOnCurve(er, opts.percent ?? 50);
        return;
      }
      if (mode === 'faceCenter') {
        const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
        const fr = hit && hit.faceIdx >= 0 ? resolveFace({ id: hit.id, idx: hit.faceIdx }) : null;
        if (!fr) { UI.toast('Klick eine Fläche eines Körpers an.', { icon: 'info' }); return; }
        stopPick();
        addPointFaceCenter(fr);
        return;
      }
      if (mode === 'edgePlaneIntersect') {
        if (!edgeRef) {
          const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
          const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
          if (!er) { UI.toast('Klick zuerst eine Kante oder Kurve eines Körpers an.', { icon: 'info' }); return; }
          edgeRef = er;
          Viewer.highlightEdge(er.id, er.idx);
          hint();
          return;
        }
        const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
        const fr = hit && hit.faceIdx >= 0 ? resolveFace({ id: hit.id, idx: hit.faceIdx }) : null;
        if (!fr || fr.info.t !== 'PLANE') { UI.toast('Klick eine ebene Fläche als Schnitt-Ebene an.', { icon: 'info' }); return; }
        const er = edgeRef;
        stopPick();
        addPointEdgePlane(er, fr);
      }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); } };
    pickState = { down, key, marks: [] };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  function startCsysPick() {
    stopPick();
    let origin = null, xEdge = null;
    const marks = [];
    const hint = () => UI.hint(!origin
      ? '<b>Koordinatensystem (1/3):</b> Klick den Ursprungspunkt (Bezugspunkt, Ecke oder Kantenmitte). <b>Esc</b> bricht ab.'
      : !xEdge
        ? '<b>Koordinatensystem (2/3):</b> Klick eine Kante für die <b>X-Achse</b> (oder <b>Enter</b> für Standard-Achsen). <b>Esc</b> bricht ab.'
        : '<b>Koordinatensystem (3/3):</b> Klick eine Kante für die <b>Y-Achse</b> (oder <b>Enter</b> für Standard-Y). <b>Esc</b> bricht ab.');

    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!origin) {
        const ptHit = pickPoint(e.clientX, e.clientY, 12);
        if (ptHit) {
          origin = { p: V3(ptHit.pt.point), bind: { pointId: ptHit.pt.id } };
        } else {
          const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true });
          const info = hit ? snapBodyPointInfo(hit, e.clientX, e.clientY) : null;
          if (info) origin = { p: info.w, bind: info.bind };
          else {
            const p = Viewer.pickPlane(e.clientX, e.clientY, 0);
            if (!p) return;
            origin = { p, bind: null };
          }
        }
        addPickMark(origin.p, marks);
        hint();
        return;
      }
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      const er = hit && hit.edgeIdx != null ? resolveEdge({ id: hit.id, edgeIdx: hit.edgeIdx }) : null;
      if (!er) { UI.toast('Klick eine Kante für die Achse an (oder drück Enter).', { icon: 'info' }); return; }
      if (!xEdge) {
        xEdge = er;
        Viewer.highlightEdge(er.id, er.idx);
        hint();
        return;
      }
      const o0 = origin, x0 = xEdge;
      stopPick();
      addCsysFromPointEdges(o0, x0, er);
    };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); }
      else if (e.key === 'Enter' && origin) {
        e.preventDefault(); e.stopPropagation();
        const o0 = origin, x0 = xEdge;
        stopPick();
        addCsysFromPointEdges(o0, x0, null);
      }
    };
    pickState = { down, key, marks };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    hint();
  }

  // ---------- Verlauf und Eigenschaften ----------
  function treeSection() {
    const ds = list(); if (!ds.length) return null;
    const sec = h('div', { class: 'datum-tree', id: 'datum-tree' }, h('div', { class: 'section-h' }, 'Bezugsebenen'));
    for (const d of ds) {
      const row = h('div', { class: 'tree-row datum-row' + (d.id === sel ? ' sel' : '') + (d.hidden ? ' dim' : ''), 'data-datum': d.id });
      const ic = h('span', { class: 'swatch datum' }); ic.innerHTML = icon('originPlanes');
      const b = d.base || {};
      const sub = lost.has(d.id) ? (b.type === 'face' ? 'Fläche fehlt' : 'Bezug fehlt') : {
        origin: 'Grundebene', face: 'an Fläche', edgeAngle: 'an Kante',
        tangent: 'tangential', normalToCurve: 'senkr. Kante', edgePoint: 'Kante + Punkt', twoEdges: '2 Kanten',
        fixed: 'fest',
      }[b.type] || '';
      row.append(ic, h('span', { class: 'nm' }, d.name), h('span', { class: 'sub mono' }, sub));
      row.onclick = () => select(d.id === sel ? null : d.id);
      row.ondblclick = () => sketchOn(d.id);
      sec.append(row);
    }
    return sec;
  }

  function axisTreeSection() {
    const as = axes(); if (!as.length) return null;
    const sec = h('div', { class: 'datum-tree axis-tree', id: 'axis-tree' }, h('div', { class: 'section-h' }, 'Bezugsachsen'));
    for (const ax of as) {
      const row = h('div', { class: 'tree-row axis-row' + (ax.id === selAxis ? ' sel' : '') + (ax.hidden ? ' dim' : ''), 'data-axis': ax.id });
      const ic = h('span', { class: 'swatch axis' }); ic.innerHTML = icon('axes');
      const b = ax.base || {};
      const sub = lostAxes.has(ax.id) ? 'Bezug fehlt' : { twoPoints: '2 Punkte', roundFace: 'Mitte Rundung', roundEdge: 'Mitte Kreis', faceNormal: 'senkr. Fläche', fixed: 'fest' }[b.type] || '';
      row.append(ic, h('span', { class: 'nm' }, ax.name), h('span', { class: 'sub mono' }, sub));
      row.onclick = () => selectAxis(ax.id === selAxis ? null : ax.id);
      sec.append(row);
    }
    return sec;
  }

  function pointTreeSection() {
    const ps = points(); if (!ps.length) return null;
    const sec = h('div', { class: 'datum-tree point-tree', id: 'point-tree' }, h('div', { class: 'section-h' }, 'Bezugspunkte'));
    for (const pt of ps) {
      const row = h('div', { class: 'tree-row point-row' + (pt.id === selPoint ? ' sel' : '') + (pt.hidden ? ' dim' : ''), 'data-point': pt.id });
      const ic = h('span', { class: 'swatch point' }); ic.innerHTML = icon('point');
      const b = pt.base || {};
      const sub = lostPoints.has(pt.id) ? 'Bezug fehlt' : { edgeMid: 'Kantenmitte', faceCenter: 'Flächenmitte', edgePlaneIntersect: 'Schnittpunkt', curvePercent: 'auf Kurve', fixed: 'fest' }[b.type] || '';
      row.append(ic, h('span', { class: 'nm' }, pt.name), h('span', { class: 'sub mono' }, sub));
      row.onclick = () => selectPoint(pt.id === selPoint ? null : pt.id);
      sec.append(row);
    }
    return sec;
  }

  function csysTreeSection() {
    const csAll = csysList(); if (!csAll.length) return null;
    const sec = h('div', { class: 'datum-tree csys-tree', id: 'csys-tree' }, h('div', { class: 'section-h' }, 'Koordinatensysteme'));
    for (const cs of csAll) {
      const row = h('div', { class: 'tree-row csys-row' + (cs.id === selCsys ? ' sel' : '') + (cs.hidden ? ' dim' : ''), 'data-csys': cs.id });
      const ic = h('span', { class: 'swatch csys' }); ic.innerHTML = icon('axes');
      const b = cs.base || {};
      const sub = lostCsys.has(cs.id) ? 'Bezug fehlt' : { pointEdges: 'Punkt + Achsen', fixed: 'fest' }[b.type] || '';
      row.append(ic, h('span', { class: 'nm' }, cs.name), h('span', { class: 'sub mono' }, sub));
      row.onclick = () => selectCsys(cs.id === selCsys ? null : cs.id);
      sec.append(row);
    }
    return sec;
  }

  function renderPanel(body) {
    const d = find(sel); if (!d) return false;
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'datum-name', value: d.name, 'aria-label': 'Name' });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) set(d.id, { name: v }, 'Bezugsebene umbenannt'); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    const b = d.base || { type: 'fixed' };
    const fl = h('div', { class: 'fields' });
    if (b.type === 'origin') {
      fl.append(UI.selectField({ id: 'datum-base', label: 'Grundebene', value: b.plane, options: [['XY', 'Arbeitsfläche (XY)'], ['XZ', 'Vorne (XZ)'], ['YZ', 'Seite (YZ)']], onChange: (v) => set(d.id, { plane: v }) }));
      fl.append(UI.numField({ id: 'datum-dist', label: 'Abstand', value: b.dist, onCommit: (v) => set(d.id, { dist: v }) }));
      fl.append(UI.numField({ id: 'datum-tilt', label: 'Neigung', value: b.tilt || 0, unit: '°', onCommit: (v) => set(d.id, { tilt: v }) }));
    } else if (b.type === 'face') {
      fl.append(UI.numField({ id: 'datum-dist', label: 'Abstand zur Fläche', value: b.dist, onCommit: (v) => set(d.id, { dist: v }) }));
    } else if (b.type === 'edgeAngle') {
      fl.append(UI.numField({ id: 'datum-angle', label: 'Winkel zur Fläche', value: b.angle ?? 30, unit: '°', onCommit: (v) => set(d.id, { angle: v }) }));
    } else if (b.type === 'tangent') {
      fl.append(UI.numField({ id: 'datum-angle', label: 'Winkel um Achse', value: b.angle ?? 0, unit: '°', onCommit: (v) => set(d.id, { angle: v }) }));
    } else if (b.type === 'normalToCurve') {
      fl.append(UI.selectField({
        id: 'datum-pos-mode', label: 'Position auf Kante', value: b.posMode || 'mid',
        options: [['start', 'Anfang (0 %)'], ['mid', 'Mitte (50 %)'], ['end', 'Ende (100 %)'], ['percent', 'Prozent']],
        onChange: (v) => set(d.id, { posMode: v, ...(v === 'start' ? { percent: 0 } : v === 'mid' ? { percent: 50 } : v === 'end' ? { percent: 100 } : {}) }),
      }));
      const pctVal = b.posMode === 'start' ? 0 : b.posMode === 'end' ? 100 : b.posMode === 'mid' ? 50 : (b.percent ?? 50);
      fl.append(UI.numField({ id: 'datum-percent', label: 'Lage entlang Kante', value: pctVal, unit: '%', onCommit: (v) => set(d.id, { posMode: 'percent', percent: v }) }));
    }
    w.append(fl);
    if (b.type === 'edgeAngle') {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'datum-flip-angle' }, 'Richtung umkehren');
      fb.onclick = () => { const v = Model.num(b.angle, Model.vars(App.doc).v, 30); set(d.id, { angle: -v }, 'Winkel umgekehrt'); };
      w.append(h('div', { class: 'btn-row' }, fb));
    }
    if (b.type === 'tangent' || b.type === 'normalToCurve' || b.type === 'edgePoint' || b.type === 'twoEdges') {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'datum-flip-normal' }, 'Richtung umkehren');
      fb.onclick = () => set(d.id, { flip: !b.flip }, 'Richtung umgekehrt');
      w.append(h('div', { class: 'btn-row' }, fb));
    }
    if (b.type === 'face') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Die Fläche, an der die Ebene hing, gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene hängt an der Fläche: Ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'edgeAngle') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Kante oder Bezugsfläche gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene geht durch die Kante im Winkel zur Fläche – ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'tangent') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Die runde Fläche gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene liegt tangential an der runden Fläche – ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'normalToCurve') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Die Kante oder Kurve gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene steht senkrecht auf der Kante – ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'edgePoint') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Kante oder Bezugspunkt gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene geht durch die Kante und den Punkt – ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'twoEdges') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Eine Kante fehlt oder die Kanten liegen nicht mehr in einer Ebene.' : 'Die Ebene läuft durch beide Kanten – ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'fixed') w.append(h('div', { class: 'hint-box' }, 'Feste Ebene – sie bleibt, wo sie angelegt wurde.'));
    const row = h('div', { class: 'btn-row' });
    const bs = h('button', { type: 'button', class: 'btn primary', id: 'datum-sketch' }); bs.innerHTML = icon('sketch') + 'Skizze hierauf'; bs.onclick = () => sketchOn(d.id);
    const bh = h('button', { type: 'button', class: 'btn', id: 'datum-hide' }); bh.innerHTML = icon(d.hidden ? 'eye' : 'eyeOff') + (d.hidden ? 'Einblenden' : 'Ausblenden'); bh.onclick = () => set(d.id, { hidden: !d.hidden }, d.hidden ? 'Bezugsebene eingeblendet' : 'Bezugsebene ausgeblendet');
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'datum-del' }); bd.innerHTML = icon('trash') + 'Löschen'; bd.onclick = () => remove(d.id);
    row.append(bs, bh, bd); w.append(row);
    body.append(w);
    return true;
  }

  function renderAxisPanel(body) {
    const ax = findAxis(selAxis); if (!ax) return false;
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'axis-name', value: ax.name, 'aria-label': 'Name' });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) setAxis(ax.id, { name: v }, 'Bezugsachse umbenannt'); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    if (ax.axis && Array.isArray(ax.axis.o) && Array.isArray(ax.axis.d)) {
      const oTxt = ax.axis.o.map((v) => Units.fmtLen(v, 1)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '');
      const dTxt = ax.axis.d.map((v) => fmt(v, 2)).join(' · ');
      w.append(h('div', { class: 'mini-list' },
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Punkt'), h('b', { class: 'mono' }, oTxt)),
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Richtung'), h('b', { class: 'mono' }, dTxt))));
    }
    const b = ax.base || { type: 'fixed' };
    if (lostAxes.has(ax.id)) {
      w.append(h('div', { class: 'err-box' }, 'Der Körper oder die Fläche, an der die Achse hing, fehlt – die Achse bleibt an ihrer letzten Stelle.'));
    } else {
      const txt = {
        twoPoints: 'Läuft durch zwei gewählte Punkte – für Kreismuster und Drehen nutzbar.',
        roundFace: 'Läuft durch die Mitte der runden Fläche – wandert mit, wenn sich das Teil ändert.',
        roundEdge: 'Läuft durch die Mitte des Kreises – wandert mit, wenn sich das Teil ändert.',
        faceNormal: 'Steht senkrecht auf der Fläche am gewählten Punkt – wandert mit, wenn sich die Fläche verschiebt.',
        fixed: 'Feste Bezugsachse – für Kreismuster und Drehen nutzbar.',
      }[b.type] || 'Bezugsachse – für Kreismuster und Drehen nutzbar.';
      w.append(h('div', { class: 'hint-box' }, txt));
    }
    const row = h('div', { class: 'btn-row' });
    const bh = h('button', { type: 'button', class: 'btn', id: 'axis-hide' }); bh.innerHTML = icon(ax.hidden ? 'eye' : 'eyeOff') + (ax.hidden ? 'Einblenden' : 'Ausblenden'); bh.onclick = () => setAxis(ax.id, { hidden: !ax.hidden }, ax.hidden ? 'Bezugsachse eingeblendet' : 'Bezugsachse ausgeblendet');
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'axis-del' }); bd.innerHTML = icon('trash') + 'Löschen'; bd.onclick = () => removeAxis(ax.id);
    row.append(bh, bd); w.append(row);
    body.append(w);
    return true;
  }

  function renderPointPanel(body) {
    const pt = findPoint(selPoint); if (!pt) return false;
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'point-name', value: pt.name, 'aria-label': 'Name' });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) setPoint(pt.id, { name: v }, 'Bezugspunkt umbenannt'); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    if (Array.isArray(pt.point)) {
      const pTxt = pt.point.map((v) => Units.fmtLen(v, 2)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '');
      w.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Lage'), h('b', { class: 'mono', id: 'point-coords' }, pTxt))));
    }
    const b = pt.base || { type: 'fixed' };
    const fl = h('div', { class: 'fields' });
    if (b.type === 'curvePercent') {
      fl.append(UI.numField({ id: 'point-percent', label: 'Lage entlang Kurve', value: b.percent ?? 50, unit: '%', onCommit: (v) => setPoint(pt.id, { percent: v }) }));
    } else if (b.type === 'fixed') {
      fl.append(
        UI.numField({ id: 'point-x', label: 'X', value: b.x ?? 0, len: true, onCommit: (v) => setPoint(pt.id, { x: v }) }),
        UI.numField({ id: 'point-y', label: 'Y', value: b.y ?? 0, len: true, onCommit: (v) => setPoint(pt.id, { y: v }) }),
        UI.numField({ id: 'point-z', label: 'Z', value: b.z ?? 0, len: true, onCommit: (v) => setPoint(pt.id, { z: v }) }),
      );
    }
    if (fl.children.length) w.append(fl);
    if (b.type === 'curvePercent') {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'point-flip' }, 'Richtung umkehren');
      fb.onclick = () => setPoint(pt.id, { flip: !b.flip }, 'Richtung umgekehrt');
      w.append(h('div', { class: 'btn-row' }, fb));
    }
    if (lostPoints.has(pt.id)) {
      w.append(h('div', { class: 'err-box' }, 'Der Bezug dieses Punktes fehlt – der Punkt bleibt an seiner letzten Stelle.'));
    } else {
      const txt = {
        edgeMid: 'Liegt genau in der Mitte der gewählten Kante – wandert mit, wenn sich der Körper ändert.',
        faceCenter: 'Liegt in der Mitte der gewählten Fläche – wandert mit dem Teil mit.',
        edgePlaneIntersect: 'Schnittpunkt von Kante und Ebene – wandert mit, wenn sich eines davon verschiebt.',
        curvePercent: 'Liegt bei dem eingestellten Prozentwert auf der Kurve – wandert mit der Kante mit.',
        fixed: 'Fester Bezugspunkt im Raum.',
      }[b.type] || 'Bezugspunkt im Projekt.';
      w.append(h('div', { class: 'hint-box' }, txt));
    }
    const row = h('div', { class: 'btn-row' });
    const bcs = h('button', { type: 'button', class: 'btn', id: 'point-to-csys' }); bcs.innerHTML = icon('axes') + 'Koordinatensystem hier';
    bcs.onclick = () => addCsysFromPointEdges(pt.id, null, null);
    const bh = h('button', { type: 'button', class: 'btn', id: 'point-hide' }); bh.innerHTML = icon(pt.hidden ? 'eye' : 'eyeOff') + (pt.hidden ? 'Einblenden' : 'Ausblenden');
    bh.onclick = () => setPoint(pt.id, { hidden: !pt.hidden }, pt.hidden ? 'Bezugspunkt eingeblendet' : 'Bezugspunkt ausgeblendet');
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'point-del' }); bd.innerHTML = icon('trash') + 'Löschen';
    bd.onclick = () => removePoint(pt.id);
    row.append(bcs, bh, bd); w.append(row);
    body.append(w);
    return true;
  }

  function renderCsysPanel(body) {
    const cs = findCsys(selCsys); if (!cs) return false;
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'csys-name', value: cs.name, 'aria-label': 'Name' });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) setCsys(cs.id, { name: v }, 'Koordinatensystem umbenannt'); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    if (cs.csys && Array.isArray(cs.csys.o)) {
      const oTxt = cs.csys.o.map((v) => Units.fmtLen(v, 2)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '');
      const fDir = (a) => a.map((v) => fmt(v, 2)).join(' · ');
      w.append(h('div', { class: 'mini-list' },
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Ursprung'), h('b', { class: 'mono', id: 'csys-origin' }, oTxt)),
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'X-Achse'), h('b', { class: 'mono' }, fDir(cs.csys.x))),
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Y-Achse'), h('b', { class: 'mono' }, fDir(cs.csys.y))),
        h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Z-Achse'), h('b', { class: 'mono' }, fDir(cs.csys.z)))));
    }
    const b = cs.base || { type: 'fixed' };
    if (b.type === 'fixed') {
      const fl = h('div', { class: 'fields' },
        UI.numField({ id: 'csys-ox', label: 'Ursprung X', value: b.ox ?? 0, len: true, onCommit: (v) => setCsys(cs.id, { ox: v }) }),
        UI.numField({ id: 'csys-oy', label: 'Ursprung Y', value: b.oy ?? 0, len: true, onCommit: (v) => setCsys(cs.id, { oy: v }) }),
        UI.numField({ id: 'csys-oz', label: 'Ursprung Z', value: b.oz ?? 0, len: true, onCommit: (v) => setCsys(cs.id, { oz: v }) }));
      w.append(fl);
    }
    const flipRow = h('div', { class: 'btn-row' });
    const fx = h('button', { type: 'button', class: 'btn small', id: 'csys-flip-x' }, 'X umkehren');
    fx.onclick = () => setCsys(cs.id, { flipX: !b.flipX }, 'X-Achse umgekehrt');
    const fy = h('button', { type: 'button', class: 'btn small', id: 'csys-flip-y' }, 'Y umkehren');
    fy.onclick = () => setCsys(cs.id, { flipY: !b.flipY }, 'Y-Achse umgekehrt');
    const fz = h('button', { type: 'button', class: 'btn small', id: 'csys-flip-z' }, 'Z umkehren');
    fz.onclick = () => setCsys(cs.id, { flipZ: !b.flipZ }, 'Z-Achse umgekehrt');
    flipRow.append(fx, fy, fz); w.append(flipRow);
    if (lostCsys.has(cs.id)) {
      w.append(h('div', { class: 'err-box' }, 'Ein Bezug dieses Koordinatensystems fehlt oder die Achsen stehen parallel – es bleibt an seiner letzten Stelle.'));
    } else {
      w.append(h('div', { class: 'hint-box' }, 'Rechtshändiges Koordinatensystem. Im Export-Fenster (STEP, STL, 3MF, OBJ, GLB) kannst du es als Nullpunkt wählen.'));
    }
    const row = h('div', { class: 'btn-row' });
    const bex = h('button', { type: 'button', class: 'btn primary', id: 'csys-export' }); bex.innerHTML = icon('export') + 'Als Export-Nullpunkt …';
    bex.onclick = () => Print.exportDialog({ csysId: cs.id });
    const bsk = h('button', { type: 'button', class: 'btn', id: 'csys-sketch' }); bsk.innerHTML = icon('sketch') + 'Skizze auf XY';
    bsk.onclick = () => { if (!cs.csys) return; const pl = { o: cs.csys.o, x: cs.csys.x, n: cs.csys.z }; selectCsys(null); Sketch.startOnPlaneObj(deepClone(pl)); UI.toast(`Skizze auf „${cs.name}“.`, { icon: 'check', ms: 1800 }); };
    const bh = h('button', { type: 'button', class: 'btn', id: 'csys-hide' }); bh.innerHTML = icon(cs.hidden ? 'eye' : 'eyeOff') + (cs.hidden ? 'Einblenden' : 'Ausblenden');
    bh.onclick = () => setCsys(cs.id, { hidden: !cs.hidden }, cs.hidden ? 'Koordinatensystem eingeblendet' : 'Koordinatensystem ausgeblendet');
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'csys-del' }); bd.innerHTML = icon('trash') + 'Löschen';
    bd.onclick = () => removeCsys(cs.id);
    row.append(bex, bsk, bh, bd); w.append(row);
    body.append(w);
    return true;
  }

  // ---------- Dialoge ----------
  function dialog(anchor) {
    const face = Actions.selectedFace();
    const edge = App.edges && App.edges.length === 1 ? resolveEdge(App.edges[0]) : null;
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '280px' } });
    box.append(h('b', null, 'Neue Bezugsebene'), h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Eine eigene Ebene zum Skizzieren – zum Beispiel 25 mm über dem Boden oder schräg an einer Kante. Sie bleibt im Projekt und lässt sich später ändern.'));
    let off = 10, tilt = 0;
    box.append(UI.numField({ id: 'dp-off', label: 'Abstand', value: off, unit: 'mm', expr: false, onCommit: (v) => { off = v; } }));
    box.append(UI.numField({ id: 'dp-tilt', label: 'Neigung / Winkel', value: 0, unit: '°', expr: false, onCommit: (v) => { tilt = v; } }));
    const row = h('div', { class: 'btn-row' });
    const mk = (id, label, fn) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); fn(); }; return b; };
    row.append(mk('dp-xy', 'Von der Arbeitsfläche', () => addOrigin('XY', off, tilt)), mk('dp-xz', 'Von vorne', () => addOrigin('XZ', off, tilt)), mk('dp-yz', 'Von der Seite', () => addOrigin('YZ', off, tilt)));
    box.append(row);
    const row2 = h('div', { class: 'btn-row' });
    const bf = mk('dp-face', 'Von der gewählten Fläche', () => addFromFace(face, off)); if (!face || face.info.t !== 'PLANE') { bf.disabled = true; bf.dataset.tip = 'Klick zuerst eine ebene Fläche an'; }
    const bea = mk('dp-edge-angle', 'An Kante mit Winkel', () => startEdgeAnglePick(tilt || 30, edge && edge.info.t === 'LINE' ? edge : null));
    bea.dataset.help = 'datumEdgeAngle';
    row2.append(bf, bea, mk('dp-mid', 'Mittig zwischen zwei Flächen', () => Sketch.startPlanePick('mid', (pl) => addFixed(pl, 'Mittelebene'))), mk('dp-3p', 'Durch drei Punkte', () => Sketch.startPlanePick('3p', (pl) => addFixed(pl, 'Ebene durch drei Punkte'))));
    box.append(row2);
    const row2b = h('div', { class: 'btn-row' });
    const btan = mk('dp-tangent', 'Tangential an Rundung', () => startTangentPick());
    btan.dataset.help = 'datumTangent';
    const bnc = mk('dp-normal-curve', 'Senkrecht zu Kante', () => { if (edge) addNormalToCurve(edge, 'mid'); else startNormalCurvePick('mid', 50); });
    bnc.dataset.help = 'datumNormalCurve';
    const bep = mk('dp-edge-point', 'Durch Kante & Punkt', () => startEdgePointPick(edge && edge.info.t === 'LINE' ? edge : null));
    bep.dataset.help = 'datumEdgePoint';
    const b2e = mk('dp-two-edges', 'Durch zwei Kanten', () => { if (App.edges && App.edges.length === 2) addTwoEdges(App.edges[0], App.edges[1]); else startTwoEdgesPick(edge && edge.info.t === 'LINE' ? edge : null); });
    b2e.dataset.help = 'datumTwoEdges';
    row2b.append(btan, bnc, bep, b2e);
    box.append(row2b);
    box.append(h('div', { class: 'section-h', style: { marginTop: '4px' } }, 'Bezugsachsen'));
    const row3 = h('div', { class: 'btn-row' });
    const b2p = mk('da-2p', 'Durch 2 Punkte', () => startAxisPick('twoPoints'));
    const brf = mk('da-round', 'Mitte einer Rundung', () => { if (face && Array.isArray(face.info.axis) && face.info.axis.length >= 6) addAxisFromFace(face); else startAxisPick('roundFace'); });
    const bfn = mk('da-normal', 'Senkrecht auf Fläche', () => startAxisPick('faceNormal'));
    for (const x of [b2p, brf, bfn]) x.dataset.help = 'datumAxis';
    row3.append(b2p, brf, bfn);
    box.append(row3);
    box.append(h('div', { class: 'section-h', style: { marginTop: '4px' } }, 'Bezugspunkte & Koordinatensystem'));
    const row4 = h('div', { class: 'btn-row' });
    const bpm = mk('dp-pt-mid', 'Kantenmitte', () => { if (edge) addPointEdgeMid(edge); else startPointPick('edgeMid'); });
    const bpfc = mk('dp-pt-face', 'Flächenmitte', () => { if (face) addPointFaceCenter(face); else startPointPick('faceCenter'); });
    const bpep = mk('dp-pt-int', 'Schnitt Kante/Ebene', () => startPointPick('edgePlaneIntersect', { preEdge: edge }));
    const bpp = mk('dp-pt-pct', 'Auf Kurve (%)', () => { if (edge) addPointOnCurve(edge, 50); else startPointPick('curvePercent', { percent: 50 }); });
    for (const x of [bpm, bpfc, bpep, bpp]) x.dataset.help = 'datumPoint';
    const bcs = mk('dp-csys', 'Koordinatensystem …', () => startCsysPick());
    bcs.dataset.help = 'datumCsys';
    row4.append(bpm, bpfc, bpep, bpp, bcs);
    box.append(row4);
    UI.pop(anchor || $('#t-sketch'), box);
  }

  function axisDialog(anchor) {
    const face = Actions.selectedFace();
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '260px' }, 'data-help': 'datumAxis' });
    box.append(h('b', null, 'Neue Bezugsachse'), h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Eine Hilfsachse im Raum – zum Beispiel für Kreismuster oder zum Drehen einer Skizze.'));
    const mk = (id, label, fn) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); fn(); }; return b; };
    const row = h('div', { class: 'btn-row' });
    row.append(
      mk('da-2p', 'Durch 2 Punkte', () => startAxisPick('twoPoints')),
      mk('da-round', 'Mitte einer Rundung', () => { if (face && Array.isArray(face.info.axis) && face.info.axis.length >= 6) addAxisFromFace(face); else startAxisPick('roundFace'); }),
      mk('da-normal', 'Senkrecht auf Fläche', () => startAxisPick('faceNormal')),
    );
    box.append(row);
    UI.pop(anchor || $('#t-sketch'), box);
  }

  function pointDialog(anchor) {
    const face = Actions.selectedFace();
    const edge = App.edges && App.edges.length === 1 ? resolveEdge(App.edges[0]) : null;
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '280px' }, 'data-help': 'datumPoint' });
    box.append(h('b', null, 'Neuer Bezugspunkt'), h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Ein Punkt im Raum an Kante, Fläche oder Schnittpunkt – wandert mit dem Körper mit.'));
    let pct = 50;
    box.append(UI.numField({ id: 'dpt-pct', label: 'Position auf Kurve', value: pct, unit: '%', expr: false, onCommit: (v) => { pct = v; } }));
    const mk = (id, label, fn) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); fn(); }; return b; };
    const row = h('div', { class: 'btn-row' });
    row.append(
      mk('dpt-edge-mid', 'Kantenmitte', () => { if (edge) addPointEdgeMid(edge); else startPointPick('edgeMid'); }),
      mk('dpt-face-center', 'Flächenmitte', () => { if (face) addPointFaceCenter(face); else startPointPick('faceCenter'); }),
      mk('dpt-edge-plane', 'Schnittpunkt Kante/Ebene', () => startPointPick('edgePlaneIntersect', { preEdge: edge })),
      mk('dpt-curve-pct', 'Auf Kurve bei x %', () => { if (edge) addPointOnCurve(edge, pct); else startPointPick('curvePercent', { percent: pct }); }),
    );
    box.append(row);
    UI.pop(anchor || $('#t-sketch'), box);
  }

  function csysDialog(anchor) {
    const pts = points().filter((pt) => Array.isArray(pt.point) && !lostPoints.has(pt.id));
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '280px' }, 'data-help': 'datumCsys' });
    box.append(h('b', null, 'Eigenes Koordinatensystem'), h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Setzt einen eigenen Nullpunkt samt X/Y-Richtung an Kanten – im Export (STEP, STL, 3MF) als Nullpunkt wählbar.'));
    const mk = (id, label, fn) => { const b = h('button', { type: 'button', class: 'btn primary', id }, label); b.onclick = () => { UI.closePop(); fn(); }; return b; };
    box.append(mk('dcs-pick', 'Ursprung & Kanten im Bild wählen', () => startCsysPick()));
    if (pts.length) {
      let ptId = pts[0].id;
      box.append(UI.selectField({ id: 'dcs-origin-pt', label: 'Oder am Bezugspunkt anlegen', value: ptId, options: pts.map((p) => [p.id, p.name]), onChange: (v) => { ptId = v; } }));
      const bq = h('button', { type: 'button', class: 'btn', id: 'dcs-quick' }, 'An gewähltem Punkt anlegen');
      bq.onclick = () => { UI.closePop(); addCsysFromPointEdges(ptId, null, null); };
      box.append(bq);
    }
    UI.pop(anchor || $('#t-sketch'), box);
  }

  function init() {
    App.on('results', relink);
    App.on('doc', () => {
      if (sel && !find(sel)) sel = null;
      if (selAxis && !findAxis(selAxis)) selAxis = null;
      if (selPoint && !findPoint(selPoint)) selPoint = null;
      if (selCsys && !findCsys(selCsys)) selCsys = null;
      draw();
    });
    App.on('selection', () => {
      if ((sel || selAxis || selPoint || selCsys) && App.sel.length) {
        sel = null; selAxis = null; selPoint = null; selCsys = null; draw();
      }
    });
  }

  return {
    init, list, find, add, addOrigin, addFromFace, addEdgeAngle, addTangent, addNormalToCurve, addEdgePoint, addTwoEdges, addFixed, set, remove, select, sketchOn,
    axes, findAxis, addAxis, addAxisTwoPoints, addAxisFromFace, addAxisFromCircleEdge, addAxisNormalAtPoint, addAxisFixed,
    setAxis, removeAxis, selectAxis, solveAxis, axisTreeSection, renderAxisPanel, axisDialog, pickAxis, applyAxisToRevolve,
    points, findPoint, addPoint, addPointEdgeMid, addPointFaceCenter, addPointOnCurve, addPointEdgePlane, addPointFixed,
    setPoint, removePoint, selectPoint, solvePoint, pointTreeSection, renderPointPanel, pointDialog, pickPoint, startPointPick,
    csysList, findCsys, addCsys, addCsysFromPointEdges, addCsysFixed, setCsys, removeCsys, selectCsys, solveCsys, csysExportMatrix,
    csysTreeSection, renderCsysPanel, csysDialog, startCsysPick,
    startEdgeAnglePick, startTangentPick, startNormalCurvePick, startEdgePointPick, startTwoEdgesPick, startAxisPick, stopPick,
    draw, dialog, treeSection, renderPanel, solve, relink,
    get selected() { return sel; }, get lost() { return [...lost]; },
    get selectedAxis() { return selAxis; }, get lostAxes() { return [...lostAxes]; },
    get selectedPoint() { return selPoint; }, get lostPoints() { return [...lostPoints]; },
    get selectedCsys() { return selCsys; }, get lostCsys() { return [...lostCsys]; },
    get picking() { return !!pickState; },
  };
})();
