// ================= Bezugsebenen: eigene Ebenen zum Skizzieren =================
// Eine Bezugsebene liegt im Projekt (doc.datums) und erscheint im Verlauf unter „Bezugsebenen“.
// Arten (base.type):
//   origin – Grundebene XY/XZ/YZ mit Abstand und Neigung um ihre x-Achse
//   face   – ebene Körperfläche mit Abstand; wandert mit, wenn sich der Körper ändert
//   fixed  – feste Lage (mittig zwischen zwei Flächen, durch drei Punkte)
const Datums = (() => {
  const ORIGIN = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  const NAMES = { XY: 'Arbeitsfläche', XZ: 'Vorne', YZ: 'Seite' };
  let sel = null;   // gewählte Bezugsebene (Kennung)
  const lost = new Set();   // Flächen-Ebenen, deren Fläche nicht mehr gefunden wird
  const r6 = (v) => v.map((x) => round(x, 6));
  const V3 = (a) => new THREE.Vector3(...a);
  const list = (doc = App.doc) => doc.datums || [];
  const find = (id, doc = App.doc) => list(doc).find((d) => d.id === id) || null;

  // Lage einer Ebene aus ihrer Grundlage ausrechnen
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
        // gleiche Richtung, nächstgelegene Mitte (die Nummer der Fläche kann sich ändern)
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
    }
    return d.plane;
  }
  // nach jedem Rechnen: Flächen-Ebenen nachführen (ohne eigenen Rückgängig-Schritt)
  function relink() {
    const upd = [];
    for (const d of list()) { const p = solve(d); if (p && JSON.stringify(p) !== JSON.stringify(d.plane)) upd.push([d.id, p]); }
    if (upd.length) App.change('Bezugsebenen nachgeführt', (doc) => { for (const [id, p] of upd) { const d = find(id, doc); if (d) d.plane = p; } }, { amend: true });
    draw();
  }
  function add(base, name, plane) {
    const d = { id: uid('dp'), name: name || `Ebene ${list().length + 1}`, base, plane: plane || null };
    d.plane = solve({ ...d, plane: plane || ORIGIN.XY });
    App.change(`Bezugsebene „${d.name}“`, (doc) => { (doc.datums = doc.datums || []).push(d); });
    select(d.id);
    return d;
  }
  function addOrigin(plane = 'XY', dist = 10, tilt = 0) { return add({ type: 'origin', plane, dist, tilt }, `${NAMES[plane] || plane} ${typeof dist === 'number' ? fmt(dist, 2) + ' mm' : dist}${tilt ? ' · ' + tilt + '°' : ''}`); }
  function addFromFace(face, dist = 10) {
    if (!face || !face.info || face.info.t !== 'PLANE') { UI.toast('Wähl zuerst eine ebene Fläche eines Körpers.', { icon: 'info' }); return null; }
    const top = Model.find(App.doc, face.id);
    return add({ type: 'face', id: face.id, n: face.info.n, c: face.info.c, dist }, `Fläche von „${Model.label(top.item)}“ + ${fmt(dist, 2)} mm`);
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
  function select(id) { sel = id; if (id) App.clearSelection(); draw(); Panels.renderRight(); Panels.renderLeft(); }
  function sketchOn(id) {
    const d = find(id); if (!d) return false;
    select(null); Sketch.startOnPlaneObj(deepClone(d.plane));
    UI.toast(`Skizze auf „${d.name}“.`, { icon: 'check', ms: 1800 });
    return true;
  }

  // ---------- Zeichnen im Bild ----------
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
    Viewer.requestRender();
  }

  // ---------- Verlauf und Eigenschaften ----------
  function treeSection() {
    const ds = list(); if (!ds.length) return null;
    const sec = h('div', { class: 'datum-tree', id: 'datum-tree' }, h('div', { class: 'section-h' }, 'Bezugsebenen'));
    for (const d of ds) {
      const row = h('div', { class: 'tree-row datum-row' + (d.id === sel ? ' sel' : '') + (d.hidden ? ' dim' : ''), 'data-datum': d.id });
      const ic = h('span', { class: 'swatch datum' }); ic.innerHTML = icon('originPlanes');
      row.append(ic, h('span', { class: 'nm' }, d.name), h('span', { class: 'sub mono' }, lost.has(d.id) ? 'Fläche fehlt' : { origin: 'Grundebene', face: 'an Fläche', fixed: 'fest' }[(d.base || {}).type] || ''));
      row.onclick = () => select(d.id === sel ? null : d.id);
      row.ondblclick = () => sketchOn(d.id);
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
    }
    w.append(fl);
    if (b.type === 'face') w.append(h('div', { class: lost.has(d.id) ? 'err-box' : 'hint-box' }, lost.has(d.id) ? 'Die Fläche, an der die Ebene hing, gibt es nicht mehr – die Ebene bleibt an ihrer letzten Stelle.' : 'Die Ebene hängt an der Fläche: Ändert sich der Körper, wandert sie mit.'));
    if (b.type === 'fixed') w.append(h('div', { class: 'hint-box' }, 'Feste Ebene – sie bleibt, wo sie angelegt wurde.'));
    const row = h('div', { class: 'btn-row' });
    const bs = h('button', { type: 'button', class: 'btn primary', id: 'datum-sketch' }); bs.innerHTML = icon('sketch') + 'Skizze hierauf'; bs.onclick = () => sketchOn(d.id);
    const bh = h('button', { type: 'button', class: 'btn', id: 'datum-hide' }); bh.innerHTML = icon(d.hidden ? 'eye' : 'eyeOff') + (d.hidden ? 'Einblenden' : 'Ausblenden'); bh.onclick = () => set(d.id, { hidden: !d.hidden }, d.hidden ? 'Bezugsebene eingeblendet' : 'Bezugsebene ausgeblendet');
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'datum-del' }); bd.innerHTML = icon('trash') + 'Löschen'; bd.onclick = () => remove(d.id);
    row.append(bs, bh, bd); w.append(row);
    body.append(w);
    return true;
  }
  // Dialog „Bezugsebene“: von einer Grundebene, von der gewählten Fläche, mittig, durch drei Punkte
  function dialog(anchor) {
    const face = Actions.selectedFace();
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '280px' } });
    box.append(h('b', null, 'Neue Bezugsebene'), h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Eine eigene Ebene zum Skizzieren – zum Beispiel 25 mm über dem Boden oder schräg. Sie bleibt im Projekt und lässt sich später ändern.'));
    let off = 10, tilt = 0;
    box.append(UI.numField({ id: 'dp-off', label: 'Abstand', value: off, unit: 'mm', expr: false, onCommit: (v) => { off = v; } }));
    box.append(UI.numField({ id: 'dp-tilt', label: 'Neigung (nur Grundebenen)', value: 0, unit: '°', expr: false, onCommit: (v) => { tilt = v; } }));
    const row = h('div', { class: 'btn-row' });
    const mk = (id, label, fn) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); fn(); }; return b; };
    row.append(mk('dp-xy', 'Von der Arbeitsfläche', () => addOrigin('XY', off, tilt)), mk('dp-xz', 'Von vorne', () => addOrigin('XZ', off, tilt)), mk('dp-yz', 'Von der Seite', () => addOrigin('YZ', off, tilt)));
    box.append(row);
    const row2 = h('div', { class: 'btn-row' });
    const bf = mk('dp-face', 'Von der gewählten Fläche', () => addFromFace(face, off)); if (!face || face.info.t !== 'PLANE') { bf.disabled = true; bf.dataset.tip = 'Klick zuerst eine ebene Fläche an'; }
    row2.append(bf, mk('dp-mid', 'Mittig zwischen zwei Flächen', () => Sketch.startPlanePick('mid', (pl) => addFixed(pl, 'Mittelebene'))), mk('dp-3p', 'Durch drei Punkte', () => Sketch.startPlanePick('3p', (pl) => addFixed(pl, 'Ebene durch drei Punkte'))));
    box.append(row2);
    UI.pop(anchor || $('#t-sketch'), box);
  }
  function init() {
    App.on('results', relink);
    App.on('doc', () => { if (sel && !find(sel)) sel = null; draw(); });
    App.on('selection', () => { if (sel && App.sel.length) { sel = null; draw(); } });
  }
  return { init, list, find, add, addOrigin, addFromFace, addFixed, set, remove, select, sketchOn, draw, dialog, treeSection, renderPanel, solve, get selected() { return sel; }, get lost() { return [...lost]; } };
})();
