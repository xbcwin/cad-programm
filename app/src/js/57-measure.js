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
    UI.hint('<b>Messen:</b> Klick zwei Punkte an – oder eine runde Kante für den Durchmesser. <b>Esc</b> beendet.');
    Viewer.canvas.style.cursor = 'crosshair';
  }
  function stop() {
    on = false; pts = []; clearVis();
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
  function onDown(e) {
    if (!on || e.button !== 0) return false;
    const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
    if (!hit) return true;
    const sp = snapPoint(hit, e.clientX, e.clientY);
    if (pts.length === 0 && sp.edge && sp.edge.t === 'CIRCLE' && sp.edge.r && hit.edgeIdx != null) {
      clearVis();
      const W = hit.node.obj.matrixWorld;
      const c = new THREE.Vector3(...sp.edge.c).applyMatrix4(W);
      showLabel(`Ø ${fmt(sp.edge.r * 2, 2)} mm   (R ${fmt(sp.edge.r, 2)})`, c);
      const pos = Viewer.makeFat(hit.node.data.lines.slice(hit.node.data.edgeGroups.find((g) => g[2] === hit.edgeIdx)[0] * 3, (hit.node.data.edgeGroups.find((g) => g[2] === hit.edgeIdx)[0] + hit.node.data.edgeGroups.find((g) => g[2] === hit.edgeIdx)[1]) * 3), Viewer.theme.accent, 4, { depthTest: false });
      pos.matrixAutoUpdate = false; pos.matrix.copy(W); Viewer.groups.overlay.add(pos); objs.push(pos);
      return true;
    }
    if (pts.length >= 2) { pts = []; clearVis(); }
    pts.push(sp.p);
    const dot = Viewer.makeFat([sp.p.x, sp.p.y, sp.p.z, sp.p.x, sp.p.y, sp.p.z + 0.001], Viewer.theme.accent, 10, { depthTest: false }); Viewer.groups.overlay.add(dot); objs.push(dot);
    if (pts.length === 2) {
      const [a, b] = pts; const d = a.distanceTo(b);
      const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], Viewer.theme.accent, 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 }); Viewer.groups.overlay.add(l); objs.push(l);
      showLabel(`${fmt(d, 2)} mm   ΔX ${fmt(Math.abs(b.x - a.x), 2)}  ΔY ${fmt(Math.abs(b.y - a.y), 2)}  ΔZ ${fmt(Math.abs(b.z - a.z), 2)}`, a.clone().lerp(b, 0.5));
    }
    Viewer.requestRender();
    return true;
  }
  let lastLabel = null;
  function showLabel(text, p) {
    const el = h('div', { class: 'dimlabel live', style: { fontSize: '13px', padding: '5px 8px' } }, text); $('#overlay').append(el); els.push(el);
    lastLabel = { el, p }; place();
  }
  function place() { for (const e of els) { if (!lastLabel) continue; const s = Viewer.toScreen(lastLabel.p); lastLabel.el.style.left = s.x + 'px'; lastLabel.el.style.top = s.y - 22 + 'px'; } }
  function init() {
    let d0 = null;
    Viewer.canvas.addEventListener('pointerdown', (e) => { if (on) d0 = { x: e.clientX, y: e.clientY }; }, true);
    Viewer.canvas.addEventListener('pointerup', (e) => { if (on && d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 5) onDown(e); d0 = null; });
    Viewer.on('camera', place);
  }
  return { init, toggle, start, stop, get active() { return on; } };
})();

