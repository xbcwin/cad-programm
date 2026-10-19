// ================= Masse: Volumen, Gewicht und Schwerpunkt =================
// Der CAD-Kern rechnet je Teil der obersten Ebene das exakte Volumen und den Volumenschwerpunkt.
// Jedes Teil kann ein eigenes Material haben (it.mat), sonst gilt das Material des Projekts.
// Kaufteile (Motoren, Akku …) haben statt eines Materials ein festes Gewicht aus dem Datenblatt (it.massG, in g).
const Mass = (() => {
  let cache = { rev: -1, p: null };
  const ev = makeEmitter();
  const matOf = (k) => MATERIALS.find((m) => m.k === k) || null;
  function projectMaterial(doc = App.doc) { return matOf(doc.settings && doc.settings.material) || matOf('CFK') || MATERIALS[0]; }
  function materialFor(it, doc = App.doc) { return (it && matOf(it.mat)) || projectMaterial(doc); }
  function enrich(r, doc) {
    if (!r) return null;
    let mass = 0; const c = [0, 0, 0]; const V = Model.vars(doc).v;
    for (const p of r.parts || []) {
      const it = doc.items.find((x) => x.id === p.id);
      if (fixedOf(it)) { p.fixed = true; p.own = true; p.mat = null; p.missing = it.massG === ''; p.mass = Math.max(0, Model.num(it.massG, V, 0)); }
      else { const m = materialFor(it, doc); p.mat = m.k; p.rho = m.rho; p.own = !!(it && matOf(it.mat)); p.mass = (p.volume / 1000) * m.rho; }
      mass += p.mass;
      if (p.com) for (let i = 0; i < 3; i++) c[i] += p.com[i] * p.mass;
    }
    r.mass = mass; r.com = mass > 0 ? c.map((v) => v / mass) : null;
    return r;
  }
  // Messung eines beliebigen Projektstands (z. B. einer älteren Version)
  function measureDoc(doc) {
    if (!Kernel.ready || !doc.items.length) return Promise.resolve(null);
    return Kernel.call('measure', { scene: Model.kernelScene(doc) }).then((r) => enrich(r, doc)).catch(() => null);
  }
  // Messung des aktuellen Stands – pro Stand nur einmal
  function measure() {
    if (!Kernel.ready || !App.doc.items.length) return Promise.resolve(null);
    if (cache.rev === App.revision && cache.p) return cache.p;
    const rev = App.revision;
    cache = { rev, p: measureDoc(App.doc).then((r) => { if (cache.rev === rev) ev.emit('measured', r); return r; }) };
    return cache.p;
  }
  // festes Gewicht – auch wenn es noch fehlt (leer): dann zählt es mit 0 g und wird angemahnt
  function fixedOf(it) { return !!(it && it.massG != null); }
  function partOf(r, id) { return r && (r.parts || []).find((p) => p.id === id) || null; }
  const gText = (g) => `${fmt(g, g < 10 ? 2 : 1)} g`;

  // ---------- Schwerpunkt im Bild ----------
  let marker = null;
  function markerObj() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const r = 26;
    g.translate(32, 32);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16202b';
    for (const a of [0, Math.PI]) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a - Math.PI / 2, a); g.closePath(); g.fill(); }
    g.lineWidth = 3.5; g.strokeStyle = '#16202b'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.scale.set(0.034, 0.034, 1); sp.renderOrder = 40;
    return sp;
  }
  function showMarker(r) {
    const on = ViewPrefs.get().cog && App.mode === 'model' && r && r.com;
    if (!on) { if (marker) { Viewer.groups.overlay.remove(marker); marker.material.map.dispose(); marker.material.dispose(); marker = null; Viewer.requestRender(); } return; }
    if (!marker) { marker = markerObj(); Viewer.groups.overlay.add(marker); }
    marker.position.set(...r.com); Viewer.requestRender();
  }
  function refreshMarker() { if (!ViewPrefs.get().cog) { showMarker(null); return; } measure().then(showMarker); }
  function init() {
    App.on('results', refreshMarker); App.on('mode', refreshMarker);
    ViewPrefs.on('change', refreshMarker);
  }
  return { init, measure, measureDoc, materialFor, projectMaterial, partOf, gText, fixedOf, on: ev.on, get markerShown() { return !!marker; }, get markerPos() { return marker ? marker.position.toArray() : null; } };
})();
