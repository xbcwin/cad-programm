// ================= Bezugsebenen & Bezugsachsen: eigene Ebenen und Achsen im Projekt =================
// Bezugsebenen liegen in doc.datums und erscheinen im Verlauf unter „Bezugsebenen“.
// Arten (base.type):
//   origin    – Grundebene XY/XZ/YZ mit Abstand und Neigung um ihre x-Achse
//   face      – ebene Körperfläche mit Abstand; wandert mit, wenn sich der Körper ändert
//   edgeAngle – durch eine gerade Kante im Winkel zu einer ebenen Fläche; wandert mit
//   fixed     – feste Lage (mittig zwischen zwei Flächen, durch drei Punkte)
//
// Bezugsachsen liegen in doc.axes und erscheinen im Verlauf unter „Bezugsachsen“.
// Arten (base.type):
//   twoPoints  – durch zwei Punkte (optional an Körpern hängend)
//   roundFace  – durch die Mitte einer runden Fläche (Zylinder, Kegel, Ring)
//   roundEdge  – durch die Mitte einer kreisförmigen Kante
//   faceNormal – senkrecht auf einer ebenen Fläche an einem Punkt
//   fixed      – feste Lage
const Datums = (() => {
  const ORIGIN = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  const NAMES = { XY: 'Arbeitsfläche', XZ: 'Vorne', YZ: 'Seite' };
  let sel = null;       // gewählte Bezugsebene (Kennung)
  let selAxis = null;   // gewählte Bezugsachse (Kennung)
  let pickState = null; // aktiver interaktiver 3D-Picker
  let relinkRounds = 0; // Schutz gegen Nachführ-Schleifen
  const lost = new Set();     // Ebenen, deren Bezug fehlt
  const lostAxes = new Set(); // Achsen, deren Bezug fehlt

  const r6 = (v) => v.map((x) => round(x, 6));
  const V3 = (a) => new THREE.Vector3(...a);
  const vecDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const list = (doc = App.doc) => doc.datums || [];
  const find = (id, doc = App.doc) => list(doc).find((d) => d.id === id) || null;
  const axes = (doc = App.doc) => doc.axes || [];
  const findAxis = (id, doc = App.doc) => axes(doc).find((a) => a.id === id) || null;

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
      selAxis = null;
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
      sel = null;
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

  // ---------- Nachführen nach jedem Rechnen ----------
  function relink() {
    const upd = [], axUpd = [], axMap = new Map();
    for (const d of list()) { const p = solve(d); if (p && JSON.stringify(p) !== JSON.stringify(d.plane)) upd.push([d.id, p]); }
    for (const ax of axes()) {
      const a = solveAxis(ax);
      axMap.set(ax.id, a || ax.axis);
      if (a && (!ax.axis || vecDiff(a.o, ax.axis.o) > 1e-5 || vecDiff(a.d, ax.axis.d) > 1e-5)) axUpd.push([ax.id, a]);
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
    if (!upd.length && !axUpd.length && !itemUpd.length) { relinkRounds = 0; draw(); return; }
    if (++relinkRounds > 3) { relinkRounds = 0; draw(); return; }
    App.change('Bezüge nachgeführt', (doc) => {
      for (const [id, p] of upd) { const d = find(id, doc); if (d) d.plane = p; }
      for (const [id, a] of axUpd) { const ax = findAxis(id, doc); if (ax) ax.axis = a; }
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

  // ---------- Verlauf und Eigenschaften ----------
  function treeSection() {
    const ds = list(); if (!ds.length) return null;
    const sec = h('div', { class: 'datum-tree', id: 'datum-tree' }, h('div', { class: 'section-h' }, 'Bezugsebenen'));
    for (const d of ds) {
      const row = h('div', { class: 'tree-row datum-row' + (d.id === sel ? ' sel' : '') + (d.hidden ? ' dim' : ''), 'data-datum': d.id });
      const ic = h('span', { class: 'swatch datum' }); ic.innerHTML = icon('originPlanes');
      const b = d.base || {};
      const sub = lost.has(d.id) ? (b.type === 'face' ? 'Fläche fehlt' : 'Bezug fehlt') : { origin: 'Grundebene', face: 'an Fläche', edgeAngle: 'an Kante', fixed: 'fest' }[b.type] || '';
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
    }
    w.append(fl);
    if (b.type === 'edgeAngle') {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'datum-flip-angle' }, 'Richtung umkehren');
      fb.onclick = () => { const v = Model.num(b.angle, Model.vars(App.doc).v, 30); set(d.id, { angle: -v }, 'Winkel umgekehrt'); };
      w.append(h('div', { class: 'btn-row' }, fb));
    }
    if (b.type === 'face') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Die Fläche, an der die Ebene hing, gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene hängt an der Fläche: Ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'edgeAngle') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Kante oder Bezugsfläche gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene geht durch die Kante im Winkel zur Fläche – ändert sich der Körper, wandert sie mit.'));
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
    box.append(h('div', { class: 'section-h', style: { marginTop: '4px' } }, 'Bezugsachsen'));
    const row3 = h('div', { class: 'btn-row' });
    const b2p = mk('da-2p', 'Durch 2 Punkte', () => startAxisPick('twoPoints'));
    const brf = mk('da-round', 'Mitte einer Rundung', () => { if (face && Array.isArray(face.info.axis) && face.info.axis.length >= 6) addAxisFromFace(face); else startAxisPick('roundFace'); });
    const bfn = mk('da-normal', 'Senkrecht auf Fläche', () => startAxisPick('faceNormal'));
    for (const x of [b2p, brf, bfn]) x.dataset.help = 'datumAxis';
    row3.append(b2p, brf, bfn);
    box.append(row3);
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

  function init() {
    App.on('results', relink);
    App.on('doc', () => { if (sel && !find(sel)) sel = null; if (selAxis && !findAxis(selAxis)) selAxis = null; draw(); });
    App.on('selection', () => { if ((sel || selAxis) && App.sel.length) { sel = null; selAxis = null; draw(); } });
  }

  return {
    init, list, find, add, addOrigin, addFromFace, addEdgeAngle, addFixed, set, remove, select, sketchOn,
    axes, findAxis, addAxis, addAxisTwoPoints, addAxisFromFace, addAxisFromCircleEdge, addAxisNormalAtPoint, addAxisFixed,
    setAxis, removeAxis, selectAxis, solveAxis, axisTreeSection, renderAxisPanel, axisDialog, pickAxis, applyAxisToRevolve,
    startEdgeAnglePick, startAxisPick, stopPick,
    draw, dialog, treeSection, renderPanel, solve,
    get selected() { return sel; }, get lost() { return [...lost]; },
    get selectedAxis() { return selAxis; }, get lostAxes() { return [...lostAxes]; },
    get picking() { return !!pickState; },
  };
})();
