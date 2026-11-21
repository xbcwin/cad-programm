// ================= Messen =================
const Measure = (() => {
  let on = false, pts = [], objs = [], els = [];
  function toggle() { on ? stop() : start(); }
  function start() {
    Views.collapse();
    if (Sketch.active) return;
    if (Notes.active) Notes.stop();
    on = true; pts = []; clearVis();
    App.clearSelection(); Handles.clear();
    $('#t-measure') && $('#t-measure').classList.add('active');
    UI.hint('<b>Messen:</b> Klick zwei Punkte oder zwei Flächen an (Abstand, Winkel) – eine Fläche allein zeigt ihre Größe, eine runde Kante den Durchmesser. <b>Esc</b> beendet.');
    Viewer.canvas.style.cursor = 'crosshair';
  }
  function stop() {
    on = false; pts = []; last = null; clearVis();
    $('#t-measure') && $('#t-measure').classList.remove('active');
    UI.hint(null); Viewer.canvas.style.cursor = '';
    Handles.rebuild();
  }
  function clearVis() { for (const o of objs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); } objs = []; for (const e of els) e.remove(); els = []; Viewer.requestRender(); }
  function snapPoint(hit, cx, cy) {
    const n = hit.node; const M = n.obj.matrixWorld;
    if (hit.edgeIdx != null) {
      const g = n.data.edges[hit.edgeIdx];
      if (g) {
        const cand = [g.a, g.b, g.m]; if (g.c) cand.push(g.c);
        let best = null, bd = 12;
        const r = Viewer.canvas.getBoundingClientRect();
        for (const p of cand) { const w = new THREE.Vector3(...p).applyMatrix4(M); const s = Viewer.toScreen(w); const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top)); if (d < bd) { bd = d; best = w; } }
        if (best) return { p: best, edge: g };
        return { p: hit.point.clone(), edge: g };
      }
    }
    return { p: hit.point.clone() };
  }
  // Was liegt unter der Maus? Punkt (an einer Kante gefangen) oder ebene Fläche
  function entityAt(hit, cx, cy) {
    if (hit.edgeIdx != null) { const sp = snapPoint(hit, cx, cy); return { kind: 'pt', p: sp.p, edge: sp.edge }; }
    const f = hit.faceIdx >= 0 ? hit.node.data.faces[hit.faceIdx] : null;
    if (f && f.t === 'PLANE' && f.n) {
      const M = hit.node.obj.matrixWorld;
      return { kind: 'face', id: hit.id, faceIdx: hit.faceIdx, c: new THREE.Vector3(...f.c).applyMatrix4(M), n: new THREE.Vector3(...f.n).transformDirection(M).normalize(), area: Viewer.faceArea(hit.id, hit.faceIdx), hitP: hit.point.clone() };
    }
    return { kind: 'pt', p: hit.point.clone() };
  }
  function dot(p) { const d = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], Viewer.theme.accent, 10, { depthTest: false }); Viewer.groups.overlay.add(d); objs.push(d); }
  function dash(a, b) { const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], Viewer.theme.accent, 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 }); Viewer.groups.overlay.add(l); objs.push(l); }
  function onDown(e) {
    if (!on || e.button !== 0) return false;
    const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
    if (!hit) return true;
    const ent = entityAt(hit, e.clientX, e.clientY);
    if (pts.length === 0 && ent.edge && ent.edge.t === 'CIRCLE' && ent.edge.r && hit.edgeIdx != null) {
      clearVis();
      const W = hit.node.obj.matrixWorld;
      const c = new THREE.Vector3(...ent.edge.c).applyMatrix4(W);
      showLabel(`Ø ${fmt(ent.edge.r * 2, 2)} mm   (R ${fmt(ent.edge.r, 2)})`, c);
      const g = hit.node.data.edgeGroups.find((x) => x[2] === hit.edgeIdx);
      const pos = Viewer.makeFat(hit.node.data.lines.slice(g[0] * 3, (g[0] + g[1]) * 3), Viewer.theme.accent, 4, { depthTest: false });
      pos.matrixAutoUpdate = false; pos.matrix.copy(W); Viewer.groups.overlay.add(pos); objs.push(pos);
      last = { text: els[0].textContent };
      return true;
    }
    if (pts.length >= 2) { pts = []; clearVis(); }
    if (!pts.length) last = null;
    pts.push(ent);
    if (ent.kind === 'face') { const m = Viewer.faceOverlay(ent.id, ent.faceIdx, Viewer.theme.accent, 0.32); if (m) { Viewer.groups.overlay.add(m); objs.push(m); } }
    else dot(ent.p);
    if (pts.length === 1 && ent.kind === 'face') { showLabel(`Fläche ${fmt(ent.area, ent.area < 100 ? 2 : 1)} mm²`, ent.hitP); last = { text: els[els.length - 1].textContent }; }
    if (pts.length === 2) result(pts[0], pts[1]);
    Viewer.requestRender();
    return true;
  }
  let last = null;
  function result(a, b) {
    for (const e of els) e.remove(); els = [];
    let text = '';
    if (a.kind === 'pt' && b.kind === 'pt') {
      const d = a.p.distanceTo(b.p); dash(a.p, b.p);
      text = `${fmt(d, 2)} mm   ΔX ${fmt(Math.abs(b.p.x - a.p.x), 2)}  ΔY ${fmt(Math.abs(b.p.y - a.p.y), 2)}  ΔZ ${fmt(Math.abs(b.p.z - a.p.z), 2)}`;
      showLabel(text, a.p.clone().lerp(b.p, 0.5));
    } else if (a.kind === 'face' && b.kind === 'face') {
      const cs = Math.abs(a.n.dot(b.n));
      if (cs > 0.99995) {   // parallel: Abstand der Ebenen
        const d = Math.abs(b.c.clone().sub(a.c).dot(a.n));
        const from = a.hitP, to = from.clone().addScaledVector(a.n, b.c.clone().sub(from).dot(a.n));
        dash(from, to);
        text = d < 1e-6 ? 'Beide Flächen liegen in einer Ebene' : `Abstand ${fmt(d, 2)} mm   (parallel)`;
        showLabel(text, from.clone().lerp(to, 0.5));
      } else {
        const ang = (Math.acos(clamp(cs, -1, 1)) * 180) / Math.PI;
        text = `Winkel ${fmt(ang, 2)}°   (zwischen den Flächen)`;
        showLabel(text, a.hitP.clone().lerp(b.hitP, 0.5));
      }
    } else {   // Punkt und Fläche: senkrechter Abstand zur Ebene
      const f = a.kind === 'face' ? a : b, q = a.kind === 'face' ? b : a;
      const s = q.p.clone().sub(f.c).dot(f.n); const foot = q.p.clone().addScaledVector(f.n, -s);
      dash(q.p, foot);
      text = `Abstand ${fmt(Math.abs(s), 2)} mm   (Punkt zur Fläche)`;
      showLabel(text, q.p.clone().lerp(foot, 0.5));
    }
    last = { text };
  }
  let lastLabel = null;
  function showLabel(text, p) {
    const el = h('div', { class: 'dimlabel live', style: { fontSize: '13px', padding: '5px 8px' } }, text); $('#overlay').append(el); els.push(el);
    lastLabel = { el, p }; place();
  }
  function place() { for (const e of els) { if (!lastLabel) continue; const s = Viewer.toScreen(lastLabel.p); lastLabel.el.style.left = s.x + 'px'; lastLabel.el.style.top = s.y - 22 + 'px'; } }
  function init() {
    App.on('selection', () => { if (App.sel.length !== 2) clearDist(); });
    let d0 = null;
    Viewer.canvas.addEventListener('pointerdown', (e) => { if (on) d0 = { x: e.clientX, y: e.clientY }; }, true);
    Viewer.canvas.addEventListener('pointerup', (e) => { if (on && d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 5) onDown(e); d0 = null; });
    Viewer.on('camera', place);
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
  return { minDistance, clearDist, init, toggle, start, stop, get active() { return on; }, get result() { return last ? last.text : (els[0] ? els[0].textContent : null); } };
})();

