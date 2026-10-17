// ================= Nachschärfen: feineres Netz für Teile, die von nah angesehen werden =================
const Refine = (() => {
  const cur = new Map();   // id -> { key, tol }
  let busy = false, again = false;
  function wanted(n) {
    const box = n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix);
    if (!Viewer.boxVisible(box)) return null;
    const size = box.getSize(new THREE.Vector3()); const diag = size.length();
    const near = box.clampPoint(Viewer.controls.target, new THREE.Vector3());
    const px = Viewer.pixelSizeAt(near);
    return Math.max(px * 0.6, diag * 2e-5, 0.0005);
  }
  async function run() {
    if (busy) { again = true; return; }
    if (!ViewPrefs.get().adaptive || !Kernel.ready || App.busy || App.mode !== 'model') return;
    busy = true;
    try {
      for (const [id, n] of Viewer.nodes) {
        const r = App.results.get(id); if (!r || !r.key || !n.obj.visible) continue;
        let c = cur.get(id);
        if (!c || c.key !== r.key) { const b0 = (r.data && r.data.tol) || 0.05; c = { key: r.key, tol: b0, base: b0 }; cur.set(id, c); }
        const base = c.base;
        const w = wanted(n); if (w == null) continue;
        let target = null;
        if (w < c.tol * 0.5) target = w;                                   // näher dran: feiner
        else if (c.tol < base && w > c.tol * 4) target = Math.min(base, w); // weit weg: Speicher sparen
        if (target == null) continue;
        try {
          const payload = await Kernel.call('remesh', { key: r.key, tol: target });
          if (App.replaceMesh(id, r.key, payload)) cur.set(id, { key: r.key, tol: payload.tol || target, base });
        } catch (_) { cur.set(id, { key: r.key, tol: 0, base }); }   // Form nicht mehr im Speicher: bis zur nächsten Änderung nicht erneut versuchen
      }
    } finally { busy = false; }
    if (again) { again = false; schedule(); }
  }
  const schedule = debounce(run, 450);
  function init() { Viewer.on('camera', schedule); App.on('results', () => { for (const [id, c] of cur) { const r = App.results.get(id); if (!r || r.key !== c.key || (r.data && r.data.tol > c.tol && c.tol === c.base)) cur.delete(id); } schedule(); }); ViewPrefs.on('change', () => { cur.clear(); schedule(); }); }
  return { init };
})();

