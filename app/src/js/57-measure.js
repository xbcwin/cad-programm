// ================= Messen =================
const Measure = (() => {
  let on = false, pts = [], objs = [], els = [];
  let sel = null, current = null, bar = null, pinObjs = [], pinEls = [];
  const live = new Map();
  const V3 = (a) => new THREE.Vector3(...a);
  const r6 = (v) => v.map((x) => round(x, 6));
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const list = (doc = App.doc) => doc.measures || [];
  const find = (id, doc = App.doc) => list(doc).find((m) => m.id === id) || null;
  function fracOf(p, b) {
    if (!p || !b) return null;
    const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
    return [dx > 1e-6 ? round((p[0] - b[0]) / dx, 6) : 0.5, dy > 1e-6 ? round((p[1] - b[1]) / dy, 6) : 0.5, dz > 1e-6 ? round((p[2] - b[2]) / dz, 6) : 0.5];
  }
  function toggle() { on ? stop() : start(); }
  function start() {
    Views.collapse();
    if (Sketch.active) return;
    if (Notes.active) Notes.stop();
    on = true; pts = []; current = null; last = null; clearVis();
    App.clearSelection(); Handles.clear();
    $('#t-measure') && $('#t-measure').classList.add('active');
    UI.hint('<b>Messen:</b> Klick zwei Punkte oder zwei Flächen an (Abstand, Winkel) – eine Fläche allein zeigt ihre Größe, eine runde Kante den Durchmesser. <b>Esc</b> beendet.');
    Viewer.canvas.style.cursor = 'crosshair';
    showBar();
  }
  function stop() {
    on = false; pts = []; current = null; last = null; clearVis(); hideBar();
    $('#t-measure') && $('#t-measure').classList.remove('active');
    UI.hint(null); Viewer.canvas.style.cursor = '';
    Handles.rebuild();
  }
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar measurebar', id: 'measure-bar' });
    const cur = h('span', { class: 'm-cur mono', id: 'measure-cur' });
    const keepBtn = h('button', { type: 'button', class: 'tool primary', id: 'measure-keep', 'data-help': 'measureKeep', disabled: true });
    keepBtn.innerHTML = icon('plus') + '<span>Messung behalten</span>';
    keepBtn.onclick = () => keep();
    const doneBtn = h('button', { type: 'button', class: 'tool', id: 'measure-done', 'data-tip': 'Messen beenden', 'data-kbd': 'Esc' });
    doneBtn.innerHTML = icon('check') + '<span>Fertig</span>';
    doneBtn.onclick = () => stop();
    bar.append(cur, keepBtn, doneBtn);
    $('#overlay').append(bar);
    updateBar();
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function updateBar() {
    if (!bar) return;
    const cur = $('#measure-cur'), kb = $('#measure-keep');
    if (cur) cur.textContent = current ? current.eval.text : 'Klick Flächen, Kanten oder Punkte …';
    if (kb) kb.disabled = !current;
  }
  function clearVis() { for (const o of objs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); } objs = []; for (const e of els) e.remove(); els = []; lastLabel = null; Viewer.requestRender(); }
  function snapPoint(hit, cx, cy) {
    const n = hit.node; const M = n.obj.matrixWorld;
    if (hit.edgeIdx != null) {
      const g = n.data.edges[hit.edgeIdx];
      if (g) {
        const cand = [['a', g.a], ['b', g.b], ['m', g.m]]; if (g.c) cand.push(['c', g.c]);
        let best = null, bestW = null, bd = 12;
        const r = Viewer.canvas.getBoundingClientRect();
        for (const [k, p] of cand) { const w = new THREE.Vector3(...p).applyMatrix4(M); const s = Viewer.toScreen(w); const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top)); if (d < bd) { bd = d; best = w; bestW = k; } }
        if (best) return { p: best, edge: g, which: bestW };
        return { p: hit.point.clone(), edge: g, which: null };
      }
    }
    return { p: hit.point.clone(), which: null };
  }
  // Was liegt unter der Maus? Punkt (an einer Kante gefangen) oder ebene Fläche
  function entityAt(hit, cx, cy) {
    const M = hit.node.obj.matrixWorld, invW = M.clone().invert(), bbox = hit.node.data.bbox;
    if (hit.edgeIdx != null) {
      const sp = snapPoint(hit, cx, cy), g = sp.edge;
      const lp = sp.p.clone().applyMatrix4(invW).toArray();
      const ref = { kind: 'pt', id: hit.id, lp: r6(lp), frac: fracOf(lp, bbox), edge: g ? { t: g.t, a: r6(g.a), b: r6(g.b), m: r6(g.m), c: g.c ? r6(g.c) : null, n: g.n ? r6(g.n) : null, which: sp.which || null, mFrac: fracOf(g.m, bbox) } : null };
      return { kind: 'pt', id: hit.id, edgeIdx: hit.edgeIdx, p: sp.p, edge: g, W: M, ref };
    }
    const f = hit.faceIdx >= 0 ? hit.node.data.faces[hit.faceIdx] : null;
    if (f && (f.t === 'CYLINDRE' || f.t === 'SPHERE') && f.r) {
      const lp = hit.point.clone().applyMatrix4(invW).toArray();
      const ln = hit.normal ? hit.normal.clone().transformDirection(invW).normalize().toArray() : null;
      const ref = { kind: 'round', id: hit.id, t: f.t, c: r6(f.c), axis: f.axis ? r6(f.axis) : null, sc: f.sc ? r6(f.sc) : null, r: round(f.r, 6), lp: r6(lp), ln: ln ? r6(ln) : null, frac: fracOf(f.c, bbox) };
      return { kind: 'round', id: hit.id, faceIdx: hit.faceIdx, f, area: Viewer.faceArea(hit.id, hit.faceIdx), hitP: hit.point.clone(), normal: hit.normal ? hit.normal.clone() : null, p: hit.point.clone(), ref };
    }
    if (f && f.t === 'PLANE' && f.n) {
      const lp = hit.point.clone().applyMatrix4(invW).toArray();
      const ref = { kind: 'face', id: hit.id, n: r6(f.n), c: r6(f.c), lp: r6(lp), frac: fracOf(f.c, bbox) };
      return { kind: 'face', id: hit.id, faceIdx: hit.faceIdx, c: new THREE.Vector3(...f.c).applyMatrix4(M), n: new THREE.Vector3(...f.n).transformDirection(M).normalize(), area: Viewer.faceArea(hit.id, hit.faceIdx), hitP: hit.point.clone(), ref };
    }
    const lp = hit.point.clone().applyMatrix4(invW).toArray();
    const ref = { kind: 'pt', id: hit.id, lp: r6(lp), frac: fracOf(lp, bbox), face: f && f.t === 'PLANE' && f.n ? { n: r6(f.n), c: r6(f.c), frac: fracOf(f.c, bbox) } : null };
    return { kind: 'pt', id: hit.id, p: hit.point.clone(), ref };
  }
  function dot(p) { const d = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], Viewer.theme.accent, 10, { depthTest: false }); Viewer.groups.overlay.add(d); objs.push(d); }
  function dash(a, b) { const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], Viewer.theme.accent, 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 }); Viewer.groups.overlay.add(l); objs.push(l); }
  function onDown(e) {
    if (!on || e.button !== 0) return false;
    const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
    if (!hit) return true;
    let ent = entityAt(hit, e.clientX, e.clientY);
    if (pts.length === 0 && ent.edge && ent.edge.t === 'CIRCLE' && ent.edge.r && hit.edgeIdx != null) {
      clearVis();
      const W = hit.node.obj.matrixWorld;
      const c = new THREE.Vector3(...ent.edge.c).applyMatrix4(W);
      const circleEnt = { kind: 'circle', id: hit.id, edgeIdx: hit.edgeIdx, edge: ent.edge, c, W };
      const ev = evalEntities('circle', [circleEnt]);
      showLabel(ev.text, ev.p);
      const g = hit.node.data.edgeGroups.find((x) => x[2] === hit.edgeIdx);
      if (g) {
        const pos = Viewer.makeFat(hit.node.data.lines.slice(g[0] * 3, (g[0] + g[1]) * 3), Viewer.theme.accent, 4, { depthTest: false });
        pos.matrixAutoUpdate = false; pos.matrix.copy(W); Viewer.groups.overlay.add(pos); objs.push(pos);
      }
      last = { text: ev.text };
      const bbox = hit.node.data.bbox;
      current = { kind: 'circle', refs: [{ kind: 'circle', id: hit.id, c: r6(ent.edge.c), n: ent.edge.n ? r6(ent.edge.n) : null, r: round(ent.edge.r, 6), frac: fracOf(ent.edge.c, bbox) }], eval: ev };
      updateBar();
      return true;
    }
    // runde Fläche allein: Durchmesser und Radius (Zylinder oder Kugel)
    if (pts.length === 0 && ent.kind === 'round') {
      clearVis();
      const m = Viewer.faceOverlay(ent.id, ent.faceIdx, Viewer.theme.accent, 0.32); if (m) { Viewer.groups.overlay.add(m); objs.push(m); }
      const ev = evalEntities('round', [ent]);
      showLabel(ev.text, ev.p);
      last = { text: ev.text };
      current = { kind: 'round', refs: [ent.ref], eval: ev };
      updateBar();
      Viewer.requestRender();
      return true;
    }
    if (ent.kind === 'round') ent = { ...ent, kind: 'pt', ref: { kind: 'pt', id: ent.id, lp: ent.ref.lp, frac: ent.ref.frac } };
    if (pts.length >= 2) { pts = []; clearVis(); }
    if (!pts.length) { last = null; current = null; }
    pts.push(ent);
    if (ent.kind === 'face') { const m = Viewer.faceOverlay(ent.id, ent.faceIdx, Viewer.theme.accent, 0.32); if (m) { Viewer.groups.overlay.add(m); objs.push(m); } }
    else dot(ent.p);
    if (pts.length === 1 && ent.kind === 'face') {
      const ev = evalEntities('face', [ent]);
      for (const [a, b] of ev.lines) dash(a, b);
      showLabel(ev.text, ev.p); last = { text: ev.text };
      current = { kind: 'face', refs: [ent.ref], eval: ev };
      updateBar();
    } else if (pts.length === 1) {
      updateBar();
    }
    if (pts.length === 2) result(pts[0], pts[1]);
    Viewer.requestRender();
    return true;
  }
  let last = null;
  function evalEntities(kind, ents) {
    if (kind === 'circle') {
      const ent = ents[0];
      const d = ent.edge.r * 2;
      const short = `Ø ${Units.fmtLenU(d, 2)}`;
      const text = `Ø ${Units.fmtLenU(d, 2)}   (R ${Units.fmtLen(ent.edge.r, 2)})`;
      return { lost: false, kind, typeLabel: 'Kreiskante', value: round(d, 6), unit: 'mm', short, text, p: ent.c.clone(), lines: [], dots: [], faces: [], circle: { id: ent.id, edgeIdx: ent.edgeIdx, W: ent.W } };
    }
    if (kind === 'round') {
      const ent = ents[0];
      const wr = ent.normal ? Viewer.wallAt(ent.id, ent.hitP, ent.normal) : null;
      const d = ent.f.r * 2;
      const short = `Ø ${Units.fmtLenU(d, 2)}`;
      const text = `${ent.f.t === 'SPHERE' ? 'Kugel' : 'Zylinder'} Ø ${Units.fmtLenU(d, 2)}   (R ${Units.fmtLen(ent.f.r, 2)})   Fläche ${Units.fmtAreaU(ent.area, 1)}${wr ? `   Wand ${Units.fmtLenU(wr, 2)}` : ''}`;
      return { lost: false, kind, typeLabel: ent.f.t === 'SPHERE' ? 'Kugel' : 'Zylinder', value: round(d, 6), unit: 'mm', short, text, p: ent.hitP.clone(), lines: [], dots: [ent.hitP.clone()], faces: [{ id: ent.id, faceIdx: ent.faceIdx }], circle: null };
    }
    if (kind === 'face') {
      const ent = ents[0];
      const wt = Viewer.wallAt(ent.id, ent.hitP, ent.n);
      const short = Units.fmtAreaU(ent.area, ent.area < 100 ? 2 : 1);
      const text = `Fläche ${short}${wt ? `   Wand ${Units.fmtLenU(wt, 2)}` : ''}`;
      const lines = wt ? [[ent.hitP.clone(), ent.hitP.clone().addScaledVector(ent.n, -wt)]] : [];
      return { lost: false, kind, typeLabel: 'Fläche', value: round(ent.area, 6), unit: 'mm²', short, text, p: ent.hitP.clone(), lines, dots: [], faces: [{ id: ent.id, faceIdx: ent.faceIdx }], circle: null };
    }
    const [a, b] = ents;
    if (a.kind !== 'face' && b.kind !== 'face') {
      const pa = a.p || a.hitP, pb = b.p || b.hitP;
      const d = pa.distanceTo(pb);
      const short = Units.fmtLenU(d, 2);
      const text = `${short}   ΔX ${Units.fmtLen(Math.abs(pb.x - pa.x), 2)}  ΔY ${Units.fmtLen(Math.abs(pb.y - pa.y), 2)}  ΔZ ${Units.fmtLen(Math.abs(pb.z - pa.z), 2)}`;
      return { lost: false, kind: 'pair', typeLabel: 'Abstand (Punkt–Punkt)', value: round(d, 6), unit: 'mm', short, text, p: pa.clone().lerp(pb, 0.5), lines: [[pa.clone(), pb.clone()]], dots: [pa.clone(), pb.clone()], faces: [], circle: null };
    }
    if (a.kind === 'face' && b.kind === 'face') {
      const cs = Math.abs(a.n.dot(b.n));
      if (cs > 0.99995) {
        const d = Math.abs(b.c.clone().sub(a.c).dot(a.n));
        const from = a.hitP.clone(), to = from.clone().addScaledVector(a.n, b.c.clone().sub(from).dot(a.n));
        const short = d < 1e-6 ? `0 ${Units.label()}` : Units.fmtLenU(d, 2);
        const text = d < 1e-6 ? 'Beide Flächen liegen in einer Ebene' : `Abstand ${Units.fmtLenU(d, 2)}   (parallel)`;
        return { lost: false, kind: 'pair', typeLabel: 'Abstand (Flächen)', value: round(d, 6), unit: 'mm', short, text, p: from.clone().lerp(to, 0.5), lines: d < 1e-6 ? [] : [[from, to]], dots: [from, to], faces: [{ id: a.id, faceIdx: a.faceIdx }, { id: b.id, faceIdx: b.faceIdx }], circle: null };
      }
      const ang = (Math.acos(clamp(cs, -1, 1)) * 180) / Math.PI;
      const short = `${fmt(ang, 2)}°`;
      const text = `Winkel ${short}   (zwischen den Flächen)`;
      return { lost: false, kind: 'pair', typeLabel: 'Winkel (Flächen)', value: round(ang, 6), unit: '°', short, text, p: a.hitP.clone().lerp(b.hitP, 0.5), lines: [[a.hitP.clone(), b.hitP.clone()]], dots: [a.hitP.clone(), b.hitP.clone()], faces: [{ id: a.id, faceIdx: a.faceIdx }, { id: b.id, faceIdx: b.faceIdx }], circle: null };
    }
    const f = a.kind === 'face' ? a : b, q = a.kind === 'face' ? b : a, qp = q.p || q.hitP;
    const s = qp.clone().sub(f.c).dot(f.n); const foot = qp.clone().addScaledVector(f.n, -s);
    const d = Math.abs(s);
    const short = Units.fmtLenU(d, 2);
    const text = `Abstand ${short}   (Punkt zur Fläche)`;
    return { lost: false, kind: 'pair', typeLabel: 'Abstand (Punkt–Fläche)', value: round(d, 6), unit: 'mm', short, text, p: qp.clone().lerp(foot, 0.5), lines: [[qp.clone(), foot]], dots: [qp.clone(), foot], faces: [{ id: f.id, faceIdx: f.faceIdx }], circle: null };
  }
  function result(a, b) {
    for (const e of els) e.remove(); els = [];
    const ev = evalEntities('pair', [a, b]);
    for (const [p1, p2] of ev.lines) dash(p1, p2);
    showLabel(ev.text, ev.p);
    last = { text: ev.text };
    current = { kind: 'pair', refs: [a.ref, b.ref], eval: ev };
    updateBar();
  }
  function pickBest(cands, refC, refFrac, bbox) {
    if (!cands.length) return null;
    if (refC) {
      let exact = null, bd = 0.05;
      for (const x of cands) { const d = dist3(x.c, refC); if (d < bd) { bd = d; exact = x; } }
      if (exact) return exact;
    }
    if (refFrac && bbox) {
      let best = null, bf = Infinity, bd = Infinity;
      for (const x of cands) {
        const f = fracOf(x.c, bbox);
        const df = f ? dist3(f, refFrac) : Infinity;
        const dc = refC ? dist3(x.c, refC) : 0;
        if (df < bf - 1e-6 || (Math.abs(df - bf) <= 1e-6 && dc < bd)) { bf = df; bd = dc; best = x; }
      }
      if (best) return best;
    }
    if (refC) {
      let best = null, bd = Infinity;
      for (const x of cands) { const d = dist3(x.c, refC); if (d < bd) { bd = d; best = x; } }
      return best;
    }
    return cands[0];
  }
  function resolveRef(ref) {
    if (!ref || !ref.id) return null;
    const r = App.results.get(ref.id), found = Model.find(App.doc, ref.id);
    if (!r || !r.data || !found) return null;
    const W = Model.worldMatrix(App.doc, ref.id), bbox = r.data.bbox;
    if (ref.kind === 'face') {
      const cands = [];
      (r.data.faces || []).forEach((f, idx) => {
        if (f.t !== 'PLANE' || !f.n) return;
        if (V3(f.n).dot(V3(ref.n)) >= 0.999) cands.push({ f, idx, c: f.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      const f = best.f, fn = V3(f.n).normalize(), fc = V3(f.c);
      let lp = ref.lp ? V3(ref.lp) : fc.clone();
      lp = lp.clone().addScaledVector(fn, fc.clone().sub(lp).dot(fn));
      if (bbox && (lp.x < bbox[0] - 1 || lp.x > bbox[3] + 1 || lp.y < bbox[1] - 1 || lp.y > bbox[4] + 1 || lp.z < bbox[2] - 1 || lp.z > bbox[5] + 1)) lp = fc.clone();
      return { kind: 'face', id: ref.id, faceIdx: best.idx, c: fc.clone().applyMatrix4(W), n: fn.clone().transformDirection(W).normalize(), area: Viewer.faceArea(ref.id, best.idx), hitP: lp.applyMatrix4(W), f };
    }
    if (ref.kind === 'round') {
      const cands = [];
      (r.data.faces || []).forEach((f, idx) => {
        if (f.t !== ref.t || !f.r) return;
        if (ref.t === 'CYLINDRE' && ref.axis && f.axis) {
          const d = Math.abs(V3(f.axis.slice(3)).normalize().dot(V3(ref.axis.slice(3)).normalize()));
          if (d < 0.995) return;
        }
        cands.push({ f, idx, c: f.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      const f = best.f;
      let ln = null;
      if (f.t === 'CYLINDRE' && f.axis) {
        const ax = V3(f.axis.slice(3)).normalize(), o = V3(f.axis.slice(0, 3)), dc = V3(f.c).sub(o);
        const rad = dc.sub(ax.clone().multiplyScalar(dc.dot(ax)));
        if (rad.lengthSq() > 1e-8) ln = rad.normalize();
      } else if (f.t === 'SPHERE') {
        const rad = V3(f.c).sub(V3(f.sc || [0, 0, 0]));
        if (rad.lengthSq() > 1e-8) ln = rad.normalize();
      }
      if (!ln && ref.ln) ln = V3(ref.ln).normalize();
      else if (ln && ref.ln && ln.dot(V3(ref.ln)) < 0) ln.negate();
      return { kind: 'round', id: ref.id, faceIdx: best.idx, f, area: Viewer.faceArea(ref.id, best.idx), hitP: V3(f.c).applyMatrix4(W), normal: ln ? ln.transformDirection(W).normalize() : null };
    }
    if (ref.kind === 'circle') {
      const cands = [];
      (r.data.edges || []).forEach((e, idx) => {
        if (e.t !== 'CIRCLE' || !e.r || !e.c) return;
        if (ref.n && e.n && Math.abs(V3(e.n).normalize().dot(V3(ref.n).normalize())) < 0.995) return;
        cands.push({ e, idx, c: e.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      return { kind: 'circle', id: ref.id, edgeIdx: best.idx, edge: best.e, c: V3(best.e.c).applyMatrix4(W), W };
    }
    if (ref.kind === 'pt') {
      if (ref.edge) {
        const re = ref.edge;
        const refDir = re.t === 'LINE' ? V3(re.b).sub(V3(re.a)).normalize() : null;
        const cands = [];
        (r.data.edges || []).forEach((e, idx) => {
          if (e.t !== re.t) return;
          if (e.t === 'LINE' && refDir) {
            const d = V3(e.b).sub(V3(e.a)); if (d.lengthSq() < 1e-10) return;
            if (Math.abs(d.normalize().dot(refDir)) < 0.995) return;
          } else if (e.t === 'CIRCLE' && re.n && e.n) {
            if (Math.abs(V3(e.n).normalize().dot(V3(re.n).normalize())) < 0.995) return;
          }
          cands.push({ e, idx, c: e.m });
        });
        const best = pickBest(cands, re.m, re.mFrac, bbox);
        if (!best) return null;
        const e = best.e;
        let lp = null;
        if (re.which === 'm') lp = V3(e.m);
        else if (re.which === 'c' && e.c) lp = V3(e.c);
        else if (re.which === 'a' || re.which === 'b') {
          const orig = V3(re[re.which]);
          if (e.t === 'LINE') {
            const d = V3(e.b).sub(V3(e.a));
            const s = d.dot(V3(re.b).sub(V3(re.a))) >= 0;
            lp = V3(re.which === 'a' ? (s ? e.a : e.b) : (s ? e.b : e.a));
          } else {
            lp = V3(e.a).distanceToSquared(orig) <= V3(e.b).distanceToSquared(orig) ? V3(e.a) : V3(e.b);
          }
        } else if (e.t === 'LINE') {
          const a = V3(e.a), b = V3(e.b), ab = b.clone().sub(a), l2 = ab.lengthSq();
          const t = l2 > 1e-10 ? clamp(V3(ref.lp).sub(a).dot(ab) / l2, 0, 1) : 0;
          lp = a.addScaledVector(ab, t);
        } else {
          lp = V3(e.m);
        }
        return { kind: 'pt', id: ref.id, p: lp.applyMatrix4(W) };
      }
      let lp = V3(ref.lp);
      if (ref.face) {
        const cands = [];
        (r.data.faces || []).forEach((f, idx) => {
          if (f.t !== 'PLANE' || !f.n) return;
          if (V3(f.n).dot(V3(ref.face.n)) >= 0.999) cands.push({ f, idx, c: f.c });
        });
        const best = pickBest(cands, ref.face.c, ref.face.frac, bbox);
        if (!best) return null;
        const fn = V3(best.f.n).normalize(), fc = V3(best.f.c);
        lp = lp.clone().addScaledVector(fn, fc.clone().sub(lp).dot(fn));
        if (bbox && (lp.x < bbox[0] - 1 || lp.x > bbox[3] + 1 || lp.y < bbox[1] - 1 || lp.y > bbox[4] + 1 || lp.z < bbox[2] - 1 || lp.z > bbox[5] + 1)) lp = fc.clone();
      }
      return { kind: 'pt', id: ref.id, p: lp.applyMatrix4(W) };
    }
    return null;
  }
  function solveMeasure(m) {
    const refs = m.refs || [];
    if (!refs.length) return { lost: true, short: 'verloren', text: 'verloren', value: null, unit: m.unit || '', typeLabel: 'Messung', p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
    const resolved = [];
    for (const ref of refs) {
      const x = resolveRef(ref);
      if (!x) return { lost: true, short: 'verloren', text: 'verloren', value: null, unit: m.unit || '', typeLabel: 'Messung', p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
      resolved.push(x);
    }
    return evalEntities(m.kind, resolved);
  }
  function evalOf(m) {
    if (live.has(m.id)) return live.get(m.id);
    if (m.lost) return { lost: true, short: 'verloren', text: 'verloren', value: null, unit: m.unit || '', typeLabel: 'Messung', p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
    return { lost: false, short: m.short || '', text: m.text || '', value: m.value, unit: m.unit || '', typeLabel: 'Messung', p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
  }
  function defaultName(cur) {
    const n = list().length + 1;
    const t = cur.eval.typeLabel || 'Messung';
    if (t.startsWith('Abstand')) return `Abstand ${n}`;
    if (t.startsWith('Winkel')) return `Winkel ${n}`;
    if (t === 'Fläche') return `Fläche ${n}`;
    if (t === 'Kreiskante') return `Durchmesser ${n}`;
    return `${t} ${n}`;
  }
  function keep() {
    if (!current) return null;
    const m = {
      id: uid('ms'), name: defaultName(current), kind: current.kind, refs: deepClone(current.refs),
      value: current.eval.value, unit: current.eval.unit, short: current.eval.short, text: current.eval.text,
      lost: false, lastP: current.eval.p ? r6(current.eval.p.toArray()) : null,
    };
    live.set(m.id, current.eval);
    App.change(`Messung „${m.name}“ behalten`, (doc) => { (doc.measures = doc.measures || []).push(m); });
    pts = []; current = null; last = null; clearVis(); updateBar(); drawSaved();
    UI.toast(`Messung „${m.name}“ behalten.`, { icon: 'check', ms: 2000 });
    return m;
  }
  function relink() {
    const ms = list(), seen = new Set();
    for (const m of ms) {
      seen.add(m.id);
      const ev = solveMeasure(m);
      live.set(m.id, ev);
      m.lost = !!ev.lost;
      if (!ev.lost) {
        m.value = ev.value; m.unit = ev.unit; m.short = ev.short; m.text = ev.text;
        if (ev.p) m.lastP = r6(ev.p.toArray());
      }
    }
    for (const k of [...live.keys()]) if (!seen.has(k)) live.delete(k);
    drawSaved();
    Panels.renderLeft();
    if (sel) Panels.renderRight();
  }
  function setHidden(id, hidden) {
    App.change(hidden ? 'Messung ausgeblendet' : 'Messung eingeblendet', (doc) => {
      const m = find(id, doc); if (!m) return false;
      if (hidden) m.hidden = true; else delete m.hidden;
    });
  }
  function rename(id, name) {
    const v = String(name || '').trim(); if (!v) return;
    App.change('Messung umbenannt', (doc) => { const m = find(id, doc); if (!m) return false; m.name = v; });
  }
  function remove(id) {
    App.change('Messung gelöscht', (doc) => { doc.measures = list(doc).filter((x) => x.id !== id); });
    if (sel === id) select(null);
  }
  function select(id) {
    sel = id || null;
    if (sel) {
      App.clearSelection();
      if (typeof Datums !== 'undefined' && Datums.selected) Datums.select(null);
      if (typeof Datums !== 'undefined' && Datums.selectedAxis) Datums.selectAxis(null);
      if (typeof Datums !== 'undefined' && Datums.selectedPoint) Datums.selectPoint(null);
      if (typeof Datums !== 'undefined' && Datums.selectedCsys) Datums.selectCsys(null);
    }
    drawSaved(); Panels.renderLeft(); Panels.renderRight();
    updateStatus();
  }
  function clearPins() {
    const g = Viewer.groups.measures;
    if (g) for (const o of pinObjs) { g.remove(o); Viewer.disposeFat(o); }
    pinObjs = [];
    for (const x of pinEls) x.el.remove();
    pinEls = [];
  }
  function drawSaved() {
    clearPins();
    const g = Viewer.groups.measures;
    if (!g || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) { Viewer.requestRender(); return; }
    for (const m of list()) {
      if (m.hidden) continue;
      const ev = evalOf(m);
      const col = ev.lost ? '#e03131' : m.id === sel ? '#f08c00' : '#0ca678';
      if (!ev.lost) {
        for (const [a, b] of ev.lines || []) {
          const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], col, m.id === sel ? 3.5 : 2.5, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2, order: 35 });
          g.add(l); pinObjs.push(l);
        }
        for (const q of ev.dots || []) {
          const d = Viewer.makeFat([q.x, q.y, q.z, q.x, q.y, q.z + 0.001], col, m.id === sel ? 9 : 7, { depthTest: false, order: 36 });
          g.add(d); pinObjs.push(d);
        }
        if (ev.circle) {
          const n = Viewer.nodes.get(ev.circle.id);
          const eg = n && n.data && n.data.edgeGroups && n.data.edgeGroups.find((x) => x[2] === ev.circle.edgeIdx);
          if (eg) {
            const pos = Viewer.makeFat(n.data.lines.slice(eg[0] * 3, (eg[0] + eg[1]) * 3), col, m.id === sel ? 4 : 3, { depthTest: false, order: 35 });
            pos.matrixAutoUpdate = false; pos.matrix.copy(ev.circle.W); g.add(pos); pinObjs.push(pos);
          }
        }
        if (m.id === sel) {
          for (const fc of ev.faces || []) {
            const fo = Viewer.faceOverlay(fc.id, fc.faceIdx, col, 0.22);
            if (fo) { g.add(fo); pinObjs.push(fo); }
          }
        }
      }
      if (ev.p) {
        const el = h('div', {
          class: 'dimlabel mpin' + (m.id === sel ? ' sel' : '') + (ev.lost ? ' lost' : ''),
          dataset: { measure: m.id },
          'data-tip': ev.lost ? 'Bezug fehlt – klicken für Details' : `${ev.text} · Klick wählt, Doppelklick kopiert`,
        }, ev.lost ? 'verloren' : ev.short);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        el.addEventListener('click', (e) => { e.stopPropagation(); select(m.id === sel ? null : m.id); });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (!ev.lost) copyValue(ev.text); });
        $('#overlay').append(el);
        pinEls.push({ el, p: ev.p, id: m.id });
      }
    }
    place();
    Viewer.requestRender();
  }
  function treeSection() {
    const ms = list(); if (!ms.length) return null;
    const sec = h('div', { class: 'datum-tree measure-tree', id: 'measure-tree', 'data-help': 'measureKeep' }, h('div', { class: 'section-h' }, 'Messungen'));
    for (const m of ms) {
      const ev = evalOf(m);
      const row = h('div', { class: 'tree-row measure-row' + (m.id === sel ? ' sel' : '') + (m.hidden ? ' dim' : '') + (ev.lost ? ' lost' : ''), 'data-measure': m.id });
      const ic = h('span', { class: 'swatch measure' }); ic.innerHTML = icon('measure');
      const val = h('span', { class: 'sub mono' + (ev.lost ? ' lost' : '') }, ev.lost ? 'verloren' : ev.short);
      const acts = h('span', { class: 'm-acts' });
      const eye = h('button', { type: 'button', class: 'm-eye', 'aria-label': m.hidden ? 'Einblenden' : 'Ausblenden', 'data-tip': m.hidden ? 'Einblenden' : 'Ausblenden' });
      eye.innerHTML = icon(m.hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); setHidden(m.id, !m.hidden); };
      const del = h('button', { type: 'button', class: 'm-del', 'aria-label': 'Löschen', 'data-tip': 'Löschen' });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); remove(m.id); };
      acts.append(eye, del);
      row.append(ic, h('span', { class: 'nm' }, m.name), val, acts);
      row.onclick = () => select(m.id === sel ? null : m.id);
      sec.append(row);
    }
    return sec;
  }
  function renderPanel(body) {
    const m = find(sel); if (!m) return false;
    const ev = evalOf(m);
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'measure-name', value: m.name, 'aria-label': 'Name' });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) rename(m.id, v); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    w.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Art'), h('b', null, ev.typeLabel || 'Messung')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Wert'), h('b', { class: 'mono' + (ev.lost ? ' bad' : ''), id: 'measure-val' }, ev.lost ? 'verloren' : ev.text))));
    if (ev.lost) w.append(h('div', { class: 'err-box' }, 'Ein Bezug dieser Messung fehlt oder wurde gelöscht – die Messung kann nicht mehr berechnet werden.'));
    else w.append(h('div', { class: 'hint-box' }, 'Die Messung aktualisiert sich von selbst, sobald sich das Modell ändert.'));
    const row = h('div', { class: 'btn-row' });
    const bc = h('button', { type: 'button', class: 'btn primary', id: 'measure-copy', disabled: ev.lost }); bc.innerHTML = icon('copy') + 'Wert kopieren'; bc.onclick = () => copyValue(ev.text);
    const bh = h('button', { type: 'button', class: 'btn', id: 'measure-hide' }); bh.innerHTML = icon(m.hidden ? 'eye' : 'eyeOff') + (m.hidden ? 'Einblenden' : 'Ausblenden'); bh.onclick = () => setHidden(m.id, !m.hidden);
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'measure-del' }); bd.innerHTML = icon('trash') + 'Löschen'; bd.onclick = () => remove(m.id);
    row.append(bc, bh, bd); w.append(row);
    body.append(w);
    return true;
  }
  let lastLabel = null;
  function showLabel(text, p) {
    const el = h('div', { class: 'dimlabel mlabel', style: { fontSize: '13px', padding: '5px 8px' }, 'data-tip': 'Klicken kopiert den Wert' }, text); $('#overlay').append(el); els.push(el);
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); copyValue(text); });
    lastLabel = { el, p }; place();
  }
  function place() {
    for (const e of els) { if (!lastLabel) continue; const s = Viewer.toScreen(lastLabel.p); lastLabel.el.style.left = s.x + 'px'; lastLabel.el.style.top = s.y - 22 + 'px'; }
    for (const x of pinEls) {
      if (!x.p) continue;
      const s = Viewer.toScreen(x.p);
      x.el.style.display = s.behind ? 'none' : '';
      x.el.style.left = s.x + 'px'; x.el.style.top = s.y - 16 + 'px';
    }
  }
  // erste Zahl eines Messwerts in die Zwischenablage (BE-35)
  let copied = null;
  function firstNumber(text) { const m = String(text).match(/-?\d+(?:[.,]\d+)?/); return m ? m[0] : null; }
  async function copyText(t, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (_) {
      try { const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) { ok = false; }
    }
    copied = t;
    UI.toast(ok ? `${what || 'Wert'} „${t}“ kopiert – mit Strg V in ein Feld einfügen.` : `Kopieren ging nicht – der Wert ist ${t}.`, { icon: ok ? 'copy' : 'info' });
    return ok;
  }
  function copyValue(text) { const n = firstNumber(text); if (n) return copyText(n, 'Wert'); return false; }
  let calcBusy = false, uiBusy = false, selCopyVal = null, selCopyWhat = null;
  const statusState = { selText: '', unit: 'mm', calcState: 'loading', calcText: 'Lädt …' };
  function sketchEntLen(e) {
    if (!e) return 0;
    if (e.type === 'line') return Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (e.type === 'circle') return 2 * Math.PI * (e.r || 0);
    if (e.type === 'arc') {
      const info = typeof SK !== 'undefined' && SK.arcInfo ? SK.arcInfo(e.a, e.m, e.b) : null;
      return info ? Math.abs(info.sweep) * info.r : Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    }
    if (e.type === 'rect') return 2 * (Math.abs(e.b[0] - e.a[0]) + Math.abs(e.b[1] - e.a[1]));
    if (typeof SK !== 'undefined' && SK.segsOf) {
      let len = 0;
      for (const s of SK.segsOf([e])) {
        if (s.t === 'line') len += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        else if (s.t === 'arc') {
          const info = SK.arcInfo(s.a, s.m, s.b);
          len += info ? Math.abs(info.sweep) * info.r : Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        } else if (s.t === 'bez' && SK.bezPoints) {
          const pts = SK.bezPoints(s);
          for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
      }
      return len;
    }
    return 0;
  }
  function computeSelectionStatus() {
    if (typeof Sketch !== 'undefined' && Sketch.active && Sketch.state) {
      const S = Sketch.state;
      const els = [...new Set(S.sels || [])].map((id) => S.ents.find((e) => e.id === id)).filter(Boolean);
      if (!els.length) return null;
      if (els.length === 1) {
        const e = els[0];
        if (e.type === 'circle' && e.r > 0) {
          return { text: `Kreis · Ø ${Units.fmtLenU(e.r * 2, 2)}`, tip: 'Durchmesser · Klick kopiert den Wert', copyVal: Units.fmtLen(e.r * 2, 2), copyWhat: 'Durchmesser' };
        }
        if (e.type === 'rect') {
          const a = Math.abs(e.b[0] - e.a[0]) * Math.abs(e.b[1] - e.a[1]);
          const d = a < 100 ? 2 : 1;
          return { text: `Rechteck · ${Units.fmtAreaU(a, d)}`, tip: 'Flächeninhalt · Klick kopiert den Wert', copyVal: Units.fmtArea(a, d), copyWhat: 'Fläche' };
        }
        if (e.type === 'point') {
          return { text: `Punkt · X ${Units.fmtLen(e.a[0], 1)} Y ${Units.fmtLen(e.a[1], 1)} ${Units.label()}`, tip: 'Skizzenpunkt' };
        }
        const len = sketchEntLen(e);
        if (len > 0) return { text: `1 Element · ${Units.fmtLenU(len, 2)}`, tip: 'Länge · Klick kopiert den Wert', copyVal: Units.fmtLen(len, 2), copyWhat: 'Länge' };
        return { text: '1 Element', tip: 'Auswahl in der Skizze' };
      }
      const total = els.reduce((s, e) => s + sketchEntLen(e), 0);
      if (total > 0) return { text: `${els.length} Elemente · ${Units.fmtLenU(total, 2)}`, tip: 'Gesamtlänge · Klick kopiert den Wert', copyVal: Units.fmtLen(total, 2), copyWhat: 'Gesamtlänge' };
      return { text: `${els.length} Elemente`, tip: 'Auswahl in der Skizze' };
    }
    if (App.edges.length) {
      const eds = App.edges.map((x) => { const r = App.results.get(x.id); return r && r.data && r.data.edges ? r.data.edges[x.edgeIdx] : null; }).filter(Boolean);
      const total = eds.reduce((s, e) => s + (e.l || 0), 0);
      const one = App.edges.length === 1 && eds.length === 1 ? eds[0] : null;
      const full = one && one.t === 'CIRCLE' && one.r && Math.hypot(one.a[0] - one.b[0], one.a[1] - one.b[1], one.a[2] - one.b[2]) < 1e-6;
      if (full) {
        const d = one.r * 2;
        return { text: `Kreiskante · Ø ${Units.fmtLenU(d, 2)}`, tip: `Radius ${Units.fmtLenU(one.r, 2)} · Umfang ${Units.fmtLenU(total, 2)} · Klick kopiert den Wert`, copyVal: Units.fmtLen(d, 2), copyWhat: 'Durchmesser' };
      }
      if (App.edges.length === 1) {
        if (total > 0) return { text: `1 Kante · ${Units.fmtLenU(total, 2)}`, tip: 'Kantenlänge · Klick kopiert den Wert', copyVal: Units.fmtLen(total, 2), copyWhat: 'Länge' };
        return { text: '1 Kante', tip: 'Gewählte Kante' };
      }
      if (total > 0) return { text: `${App.edges.length} Kanten · ${Units.fmtLenU(total, 2)}`, tip: 'Gesamtlänge der gewählten Kanten · Klick kopiert den Wert', copyVal: Units.fmtLen(total, 2), copyWhat: 'Gesamtlänge' };
      return { text: `${App.edges.length} Kanten`, tip: 'Gewählte Kanten' };
    }
    if (App.face) {
      const face = typeof Actions !== 'undefined' && Actions.selectedFace ? Actions.selectedFace() : null;
      if (face) {
        const area = Viewer.faceArea(face.id, face.idx);
        const fi = face.info;
        const isRound = fi && (fi.t === 'CYLINDRE' || fi.t === 'SPHERE') && fi.r;
        const dec = area < 100 ? 2 : 1;
        const areaStr = area > 0 ? Units.fmtAreaU(area, dec) : '';
        if (isRound && area > 0) {
          return { text: `Fläche · ${areaStr} · Ø ${Units.fmtLenU(fi.r * 2, 2)}`, tip: `Flächeninhalt und Durchmesser (R ${Units.fmtLenU(fi.r, 2)}) · Klick kopiert die Fläche`, copyVal: Units.fmtArea(area, dec), copyWhat: 'Fläche' };
        }
        if (isRound) {
          return { text: `Runde Fläche · Ø ${Units.fmtLenU(fi.r * 2, 2)}`, tip: `Durchmesser (R ${Units.fmtLenU(fi.r, 2)}) · Klick kopiert den Wert`, copyVal: Units.fmtLen(fi.r * 2, 2), copyWhat: 'Durchmesser' };
        }
        if (area > 0) {
          return { text: `Fläche · ${areaStr}`, tip: 'Flächeninhalt · Klick kopiert den Wert', copyVal: Units.fmtArea(area, dec), copyWhat: 'Fläche' };
        }
        return { text: 'Fläche', tip: 'Gewählte Fläche' };
      }
    }
    if (App.sel.length) {
      const items = App.selectedItems();
      if (items.length === 1) {
        const it = items[0].item;
        const r = App.results.get(it.id);
        const b = (r && r.data && r.data.bbox) || App.localBox(it.id);
        const kindLbl = it.role === 'hole' ? '1 Loch' : '1 Körper';
        if (b) {
          const dx = Math.abs(b[3] - b[0]), dy = Math.abs(b[4] - b[1]), dz = Math.abs(b[5] - b[2]);
          const sz = `${Units.fmtLen(dx, 1)} × ${Units.fmtLen(dy, 1)} × ${Units.fmtLen(dz, 1)} ${Units.label()}`;
          return { text: `${kindLbl} · ${sz}`, tip: `${Model.label(it)} (${sz})` };
        }
        return { text: kindLbl, tip: Model.label(it) };
      }
      if (items.length > 1) {
        const allHoles = items.every((x) => x.item.role === 'hole');
        const allSolids = items.every((x) => x.item.role !== 'hole');
        const lbl = allHoles ? `${items.length} Löcher` : allSolids ? `${items.length} Körper` : `${items.length} Objekte`;
        return { text: lbl, tip: items.map((x) => Model.label(x.item)).join(', ') };
      }
    }
    const m = sel ? find(sel) : null;
    if (m) {
      const ev = evalOf(m);
      return { text: `Messung · ${ev.lost ? 'verloren' : ev.short}`, tip: `${m.name}: ${ev.text}`, copyVal: ev.lost ? null : firstNumber(ev.text), copyWhat: 'Messwert' };
    }
    return null;
  }
  function updateCalc() {
    let state = 'ready', cls = 'st-chip st-calc ok', text = 'Bereit', tip = 'CAD-Kern ist bereit';
    if (typeof Kernel === 'undefined' || !Kernel.ready) {
      state = 'loading'; cls = 'st-chip st-calc busy'; text = 'Lädt …'; tip = 'CAD-Kern wird geladen …';
    } else if (calcBusy || uiBusy || App.busy) {
      state = 'busy'; cls = 'st-chip st-calc busy'; text = 'Rechnet …'; tip = 'Modell wird neu berechnet …';
    } else if (App.errors && App.errors.length) {
      state = 'error'; cls = 'st-chip st-calc warn';
      text = App.errors.length === 1 ? '1 Fehler' : `${App.errors.length} Fehler`;
      tip = App.errors[0].message || 'Ein Schritt hat ein Problem';
    }
    statusState.calcState = state; statusState.calcText = text;
    const el = $('#status-calc');
    if (el) {
      el.className = cls; el.dataset.state = state; el.dataset.tip = tip;
      const t = el.querySelector('.t'); if (t) t.textContent = text;
    }
  }
  function updateStatus() {
    const selEl = $('#status-sel');
    const info = computeSelectionStatus();
    if (info) {
      selCopyVal = info.copyVal || null; selCopyWhat = info.copyWhat || null;
      statusState.selText = info.text;
      if (selEl) { selEl.hidden = false; selEl.textContent = info.text; selEl.dataset.tip = info.tip; }
    } else {
      selCopyVal = null; selCopyWhat = null; statusState.selText = '';
      if (selEl) { selEl.hidden = true; selEl.textContent = ''; }
    }
    const u = Units.def();
    statusState.unit = u.k;
    const unitEl = $('#status-unit');
    if (unitEl) { unitEl.textContent = u.label; unitEl.dataset.tip = `Einheit: ${u.name} – Klick öffnet die Einstellungen`; }
    updateCalc();
  }
  function setCalcBusy(on) { uiBusy = !!on; updateCalc(); }
  function init() {
    App.on('selection', () => {
      if (App.sel.length !== 2) clearDist();
      if (sel && App.sel.length) { sel = null; drawSaved(); }
      updateStatus();
    });
    App.on('results', () => { relink(); updateStatus(); });
    App.on('remeshed', relink);
    App.on('rebuilt', updateCalc);
    let lastUnit = Units.key();
    App.on('doc', () => {
      if (sel && !find(sel)) sel = null;
      const ids = new Set(list().map((m) => m.id));
      for (const k of [...live.keys()]) if (!ids.has(k)) live.delete(k);
      if (Units.key() !== lastUnit) { lastUnit = Units.key(); if (list().length) relink(); }
      drawSaved();
      updateStatus();
    });
    App.on('mode', () => { if (App.mode !== 'model' && on) stop(); drawSaved(); updateStatus(); });
    App.on('sketch', updateStatus);
    App.on('sketchSel', updateStatus);
    App.on('calc', (b) => { calcBusy = !!b; updateCalc(); });
    App.on('busy', (b) => { uiBusy = !!b; updateCalc(); });
    if (typeof Kernel !== 'undefined' && Kernel.whenReady) Kernel.whenReady().then(updateStatus).catch(() => {});
    const selBtn = $('#status-sel');
    if (selBtn) selBtn.addEventListener('click', () => { if (selCopyVal) copyText(selCopyVal, selCopyWhat || 'Wert'); });
    const unitBtn = $('#status-unit');
    if (unitBtn) unitBtn.addEventListener('click', () => ViewPrefs.dialog('general', { focus: 'set-proj-unit' }));
    updateStatus();
    let d0 = null;
    Viewer.canvas.addEventListener('pointerdown', (e) => { if (on) d0 = { x: e.clientX, y: e.clientY }; }, true);
    Viewer.canvas.addEventListener('pointerup', (e) => { if (on && d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 5) onDown(e); d0 = null; });
    Viewer.on('camera', place);
    // Lage unter der Maus in der Statusleiste (BE-17): im Modell X/Y/Z auf dem Körper oder dem Boden, in der Skizze X/Y der Skizze
    let timer = null, lastT = 0, lastPos = null;
    const flushCoords = () => {
      timer = null;
      if (!lastPos) return;
      const p = lastPos; lastPos = null;
      lastT = performance.now();
      showCoords(p[0], p[1]);
    };
    Viewer.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) { lastPos = null; return; }
      lastPos = [e.clientX, e.clientY];
      if (timer) return;
      timer = setTimeout(flushCoords, Math.max(0, 50 - (performance.now() - lastT)));
    });
    Viewer.canvas.addEventListener('pointerleave', () => {
      lastPos = null;
      if (timer) { clearTimeout(timer); timer = null; }
      const el = $('#coords'); if (el) el.textContent = '';
    });
  }
  let coordsNow = null;
  function showCoords(cx, cy) {
    const el = $('#coords'); if (!el) return;
    const f = (v) => Units.fmtLen(Math.abs(v) < 5e-5 ? 0 : v, 1);
    const u = Units.label();
    if (Sketch.active && Sketch.state && Sketch.state.F) {
      const S = Sketch.state, F = S.F;
      let uv = S.cursor && S.cursor.p;
      if (!uv) { const w = Viewer.rayPlane(cx, cy, F.o, F.n); if (!w) return; const d = w.clone().sub(F.o); uv = [d.dot(F.x), d.dot(F.y)]; }
      coordsNow = { sketch: true, x: uv[0], y: uv[1] };
      el.textContent = `Skizze  X ${f(uv[0])}  Y ${f(uv[1])} ${u}`; return;
    }
    const hit = Viewer.pick(cx, cy, { noEdges: true });
    const p = hit ? hit.point : Viewer.pickPlane(cx, cy, 0);
    if (!p) { el.textContent = ''; coordsNow = null; return; }
    coordsNow = { x: p.x, y: p.y, z: p.z, on: hit ? hit.id : null };
    el.textContent = `X ${f(p.x)}  Y ${f(p.y)}  Z ${f(p.z)} ${u}${hit ? '' : ' · Boden'}`;
  }
  // kleinster Abstand zweier Teile (exakt aus dem CAD-Kern); zeigt die Verbindung als Linie im Bild
  let distLine = null;
  function clearDist() { if (distLine) { Viewer.groups.overlay.remove(distLine); distLine.geometry.dispose(); distLine.material.dispose(); distLine = null; Viewer.requestRender(); } }
  async function minDistance(ids, show = true) {
    if (!ids || ids.length !== 2) return null;
    let r = null;
    try { r = await Kernel.call('distance', { scene: Model.kernelScene(App.doc), ids }); } catch (e) { console.warn(e); return null; }
    clearDist();
    if (r && show && r.d > 1e-6) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)]);
      distLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: new THREE.Color('#e0457b'), dashSize: 1.5, gapSize: 1, depthTest: false, transparent: true }));
      distLine.computeLineDistances(); distLine.renderOrder = 40; Viewer.groups.overlay.add(distLine); Viewer.requestRender();
    }
    return r;
  }
  return {
    showCoords, get coords() { return coordsNow; }, updateStatus, setCalcBusy, get statusInfo() { return { ...statusState }; }, copyText, copyValue, get copied() { return copied; }, minDistance, clearDist, init, toggle, start, stop,
    get active() { return on; }, get result() { return last ? last.text : (els[0] ? els[0].textContent : null); },
    list, find, keep, relink, setHidden, rename, remove, select, drawSaved, treeSection, renderPanel, get selected() { return sel; },
  };
})();

