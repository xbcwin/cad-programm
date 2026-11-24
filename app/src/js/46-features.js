// ================= Features: Muster, Spiegeln mit Kopie, Teilen, Schnittmenge, Wandstärke =================
// Muster, Spiegelung, Teilen und Schnittmenge sind Gruppen mit einer Rechenvorschrift (p.op).
// Die Gruppe sitzt im Ursprung ihrer Ebene (oberste Ebene oder die umgebende Gruppe), ihre Teile behalten
// ihre Lage. Der CAD-Kern rechnet die Vorschrift nach jeder Änderung neu – ändert man das Original,
// ziehen alle Kopien mit. So lässt sich auch ein Loch in einer Platte im Kreis vervielfachen.
const Features = (() => {
  const NAMES = { rect: 'Rechteckmuster', circ: 'Kreismuster', path: 'Muster entlang Kurve', mirror: 'Spiegelung', split: 'Geteilt', intersect: 'Schnittmenge' };
  // gewählte Objekte, die alle auf derselben Ebene liegen (sonst leer)
  function siblings(ids) {
    const fs = (ids || App.sel).map((id) => Model.find(App.doc, id)).filter(Boolean);
    if (!fs.length || fs.some((f) => f.list !== fs[0].list)) return [];
    return fs.map((f) => f.item);
  }
  function need(ids) {
    const items = siblings(ids);
    if (!items.length) UI.toast((ids || App.sel).length ? 'Die gewählten Objekte müssen auf derselben Ebene liegen.' : 'Wähle zuerst einen Körper oder ein Loch.', { icon: 'info' });
    return items;
  }
  // Objekte in eine Feature-Gruppe im Ursprung ihrer Ebene packen
  function wrap(items, name, p) {
    let G;
    App.change(name + ' angelegt', (doc) => {
      const list = Model.find(doc, items[0].id).list; const its = items.map((x) => list.find((y) => y.id === x.id)).filter(Boolean);
      const first = its.find((x) => x.role !== 'hole') || its[0];
      G = Model.newItem('group', {}, { name, color: first.color, role: its.every((x) => x.role === 'hole') ? 'hole' : 'solid' });
      G.p = { ...p };
      const at = Math.min(...its.map((x) => list.indexOf(x)));
      for (const it of its) { list.splice(list.indexOf(it), 1); G.children.push(it); }
      list.splice(at, 0, G);
    });
    App.select([G.id]);
    return G;
  }
  function pattern(type, ids) {
    const items = need(ids); if (!items.length) return null;
    const b = Actions.selBox(items.map((x) => x.id));
    const size = b.isEmpty() ? new THREE.Vector3(10, 10, 10) : b.getSize(new THREE.Vector3());
    let G;
    if (type === 'rect') G = wrap(items, NAMES.rect, { op: 'pattern', pt: 'rect', nx: 3, ny: 1, dx: round(size.x + 5, 1), dy: round(size.y + 5, 1) });
    else if (type === 'circ') G = wrap(items, NAMES.circ, { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx: 0, cy: 0 });
    else G = wrap(items, NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'YZ', off: 0 });
    UI.toast(type === 'mirror' ? 'Gespiegelte Kopie angelegt. Rechts wählst du die Spiegelebene.' : 'Muster angelegt. Rechts stellst du Anzahl und Abstand ein – auch mit Formeln.', { icon: 'check' });
    return G;
  }
  // Muster entlang Kurve: erst die Kurve zeichnen (Skizze auf Höhe der Oberkante), dann legt pathFromSketch die Gruppe an
  function patternPath(ids) {
    const items = need(ids); if (!items.length) return null;
    const W = Model.parentWorld(App.doc, items[0].id), inv = W.clone().invert();
    const b = Actions.selBox(items.map((x) => x.id));
    const c = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3()).applyMatrix4(inv);
    const top = b.isEmpty() ? 0 : new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.getCenter(new THREE.Vector3()).y, b.max.z).applyMatrix4(inv).z;
    Sketch.startPath({ plane: { o: [0, 0, round(top, 4)], x: [1, 0, 0], n: [0, 0, 1] }, W, ents: [{ id: uid('e'), type: 'point', a: [round(c.x, 4), round(c.y, 4)] }], ids: items.map((x) => x.id), viewSize: b.isEmpty() ? 100 : Math.max(100, 5 * Math.max(b.max.x - b.min.x, b.max.y - b.min.y)) });
    return true;
  }
  function pathFromSketch(ids, sketch) {
    const items = siblings(ids);
    if (!items.length) { UI.toast('Die gewählten Objekte gibt es nicht mehr.', { kind: 'bad' }); return null; }
    const G = wrap(items, NAMES.path, { op: 'pattern', pt: 'path', n: 5, d: 0, align: true, sketch });
    UI.toast('Muster entlang der Kurve angelegt. Rechts stellst du Anzahl, Abstand und Mitdrehen ein.', { icon: 'check' });
    return G;
  }
  // ---------- Drehachse im Bild wählen (Kreismuster) ----------
  // Gerade Kante → Achse entlang der Kante; runde Kante → Achse durch ihre Mitte, senkrecht dazu; Zylinderfläche → ihre Achse
  let picking = null;
  function axisOfHit(hit) {
    const n = hit && hit.node; if (!n) return null;
    const M = n.obj.matrixWorld;
    if (hit.edgeIdx != null) {
      const g = n.data.edges[hit.edgeIdx], pos = Viewer.edgePositions(n, hit.edgeIdx);
      if (g && pos && pos.length >= 6) {
        const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M), k = pos.length / 3;
        if (g.t === 'LINE') { const a = P(0), b = P(k - 1); if (a.distanceTo(b) > 1e-6) return { o: a, d: b.sub(a).normalize(), what: 'Kante' }; }
        if (g.t === 'CIRCLE' && k >= 3) {
          const a = P(0), b = P(Math.floor(k / 3)), c = P(Math.floor((2 * k) / 3));
          const ab = b.clone().sub(a), ac = c.clone().sub(a), nn = new THREE.Vector3().crossVectors(ab, ac), l2 = nn.lengthSq();
          if (l2 > 1e-12) {
            const cc = new THREE.Vector3().crossVectors(nn, ab).multiplyScalar(ac.lengthSq()).add(new THREE.Vector3().crossVectors(ac, nn).multiplyScalar(ab.lengthSq())).divideScalar(2 * l2).add(a);
            return { o: cc, d: nn.normalize(), what: 'Mitte des Kreises' };
          }
        }
      }
    }
    if (hit.faceIdx >= 0) {
      const fi = n.data.faces[hit.faceIdx];
      if (fi && fi.t === 'CYLINDRE' && fi.axis) return { o: new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]).applyMatrix4(M), d: new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]).transformDirection(M).normalize(), what: 'Achse der runden Fläche' };
    }
    return null;
  }
  function stopPick() {
    if (!picking) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', picking.down, true);
    if (picking.move) cv.removeEventListener('pointermove', picking.move);
    window.removeEventListener('keydown', picking.key, true);
    Viewer.highlightFace('hover', null, null);
    cv.style.cursor = ''; UI.hint(null); picking = null;
  }
  // ---------- Rohr im Raum: Punkte auf Körper oder in den Raum klicken ----------
  // Auf einer Fläche liegt das Rohr auf (Mittelpunkt einen halben Durchmesser über der Fläche); daneben gilt die Höhe des letzten Punkts.
  let route = null;
  function routeDraw() {
    if (!route) return;
    if (route.obj) { Viewer.groups.overlay.remove(route.obj); route.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); route.obj = null; }
    const g = new THREE.Group(), col = new THREE.Color(Viewer.theme.accent), pts = route.pts;
    for (const q of pts) { const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.6, route.d * 0.35), 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 })); m.position.set(q[0], q[1], q[2]); m.renderOrder = 30; g.add(m); }
    if (pts.length >= 2) {
      const L = [];
      if (pts.length >= 3) for (const b of Model.bez3(pts)) for (let i = L.length ? 1 : 0; i <= 16; i++) { const t = i / 16, u = 1 - t; L.push(new THREE.Vector3(...[0, 1, 2].map((k) => u * u * u * b.a[k] + 3 * u * u * t * b.c1[k] + 3 * u * t * t * b.c2[k] + t * t * t * b.b[k]))); }
      else L.push(new THREE.Vector3(...pts[0]), new THREE.Vector3(...pts[1]));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(L), new THREE.LineBasicMaterial({ color: col, depthTest: false })); ln.renderOrder = 29; g.add(ln);
    }
    Viewer.groups.overlay.add(g); route.obj = g;
    const n = route.bar && route.bar.querySelector('#route-n'); if (n) n.textContent = String(pts.length);
    Viewer.requestRender();
  }
  function routePoint(cx, cy) {
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true });
    let P = null, bind = null;
    if (hit && hit.normal) {
      P = hit.point.clone().addScaledVector(hit.normal.clone().normalize(), route.d / 2);
      // Punkt hängt an diesem Körper: wandert er, wandert der Punkt mit (Lage im Körper merken)
      bind = { id: hit.id, lp: P.clone().applyMatrix4(Model.worldMatrix(App.doc, hit.id).invert()).toArray().map((v) => round(v, 4)) };
    } else { const z = route.pts.length ? route.pts[route.pts.length - 1][2] : 0; P = Viewer.pickPlane(cx, cy, z); }
    if (!P) return;
    const q = P.toArray().map((v) => round(v, 3)), last = route.pts[route.pts.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]) < 0.5) return;   // Doppelklick: kein doppelter Punkt
    route.pts.push(q); route.binds.push(bind); routeDraw();
  }
  function stopRoute() {
    if (!route) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', route.down, true); cv.removeEventListener('pointerup', route.up, true); cv.removeEventListener('dblclick', route.dbl, true); window.removeEventListener('keydown', route.key, true);
    if (route.obj) { Viewer.groups.overlay.remove(route.obj); route.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    if (route.bar) route.bar.remove();
    cv.style.cursor = ''; UI.hint(null); route = null; Viewer.requestRender();
  }
  function routeFinish() {
    if (!route) return null;
    if (route.pts.length < 2) { UI.toast('Klick mindestens zwei Punkte – auf einen Körper oder daneben in den Raum.', { icon: 'info' }); return null; }
    const pts = route.pts.map((q) => q.slice()), d = route.d, binds = route.binds.slice();
    stopRoute();
    let nid = null;
    App.change('Rohr im Raum', (doc) => { const it = Model.newItem('sweep', { path3d: { pts, smooth: true, ...(binds.some(Boolean) ? { bind: binds } : {}) }, shape: 'circle', d, w: d, h: round(d * 0.7, 2), wall: 0 }, { name: 'Rohr im Raum' }); doc.items.push(it); nid = it.id; });
    App.select([nid]);
    UI.toast('Rohr angelegt. Rechts änderst du Punkte, Durchmesser und Querschnitt.', { icon: 'check' });
    return nid;
  }
  // Punkte, die an einem Körper hängen, wandern mit, wenn der Körper verschoben oder gedreht wird (ohne eigenen Rückgängig-Schritt)
  let relinkRounds = 0;
  function relinkRoutes() {
    if (!App.doc || route) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      const pp = it.kind === 'sweep' && it.p && it.p.path3d; if (!pp || !Array.isArray(pp.bind) || !pp.bind.some(Boolean)) return;
      const WI = Model.worldMatrix(App.doc, it.id).invert();
      pp.bind.forEach((b, i) => {
        if (!b || !pp.pts[i]) return;
        if (!Model.find(App.doc, b.id)) { jobs.push({ id: it.id, i, drop: true }); return; }
        const w = new THREE.Vector3(...b.lp).applyMatrix4(Model.worldMatrix(App.doc, b.id)).applyMatrix4(WI);
        if (pp.pts[i].some((v, k) => !(typeof v === 'number' && Math.abs(v - w.getComponent(k)) < 1e-3))) jobs.push({ id: it.id, i, p: w.toArray().map((v) => round(v, 4)) });
      });
    });
    if (!jobs.length) { relinkRounds = 0; return; }
    if (++relinkRounds > 3) { relinkRounds = 0; return; }   // Schutz gegen Hin und Her
    App.change('Rohr folgt dem Körper', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item.p.path3d) continue;
        const pp = f.item.p.path3d;
        if (j.drop) { pp.bind[j.i] = null; if (!pp.bind.some(Boolean)) delete pp.bind; } else pp.pts[j.i] = j.p;
      }
    }, { amend: true });
  }
  App.on('results', relinkRoutes);
  function route3d(opts = {}) {
    stopPick(); stopRoute();
    route = { pts: (opts.pts || []).map((q) => q.slice()), d: opts.d || 6, obj: null, at: null, append: opts.append || null };
    route.binds = route.pts.map((_, i) => (opts.binds && opts.binds[i]) || null);
    const cv = Viewer.canvas;
    route.down = (e) => { if (e.button === 0) route.at = [e.clientX, e.clientY]; };
    route.up = (e) => { if (e.button !== 0 || !route.at) return; const moved = Math.hypot(e.clientX - route.at[0], e.clientY - route.at[1]); route.at = null; if (moved < 5) routePoint(e.clientX, e.clientY); };
    route.dbl = (e) => { e.preventDefault(); e.stopPropagation(); finishRoute(); };
    route.key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopRoute(); Panels.renderRight(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finishRoute(); }
      else if (e.key === 'Backspace' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); e.stopPropagation(); route.pts.pop(); route.binds.pop(); routeDraw(); }
    };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Rohr im Raum' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, opts.append ? 'Punkte anhängen' : 'Rohr im Raum'));
    const x = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Abbrechen', 'data-tip': 'Abbrechen' }); x.innerHTML = icon('close'); x.onclick = () => { stopRoute(); Panels.renderRight(); };
    head.append(x);
    const din = h('input', { type: 'number', id: 'route-d', class: 'vb-sel', value: route.d, min: 0.5, step: 0.5, 'aria-label': 'Durchmesser', style: { width: '64px' } });
    din.onchange = () => { const v = parseFloat(String(din.value).replace(',', '.')); if (v > 0) { route.d = v; routeDraw(); } };
    const ok = h('button', { type: 'button', class: 'btn small primary', id: 'route-done' }); ok.innerHTML = icon('check') + 'Fertig'; ok.onclick = () => finishRoute();
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Punkte'), h('b', { class: 'mono', id: 'route-n' }, String(route.pts.length)), h('span', { class: 'vb-l' }, 'Ø'), din, h('span', { class: 'vb-hint' }, 'mm')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'Klick Punkte auf einen Körper (das Rohr liegt dann auf) oder daneben in den Raum. Ziehen dreht die Ansicht. Rückschritt nimmt den letzten Punkt weg.')),
      h('div', { class: 'vb-row' }, ok));
    if (opts.append) din.disabled = true;
    Views.bars().append(bar); route.bar = bar;
    cv.addEventListener('pointerdown', route.down, true); cv.addEventListener('pointerup', route.up, true); cv.addEventListener('dblclick', route.dbl, true); window.addEventListener('keydown', route.key, true);
    cv.style.cursor = 'crosshair';
    UI.hint('<b>Rohr im Raum:</b> Punkte klicken – <b>Enter</b> oder Doppelklick ist fertig, <b>Esc</b> bricht ab.');
    routeDraw();
    return true;
  }
  // Fertig: neues Rohr oder – beim Anhängen – die Punkte ans vorhandene Rohr
  function finishRoute() {
    if (!route) return null;
    if (!route.append) return routeFinish();
    const id = route.append, inv = route.inv || new THREE.Matrix4(), pts = route.pts.map((q) => new THREE.Vector3(...q).applyMatrix4(inv).toArray().map((v) => round(v, 3))), binds = route.binds.slice();
    stopRoute();
    App.change('Punkte angehängt', (doc) => { const f = Model.find(doc, id); if (!f || !f.item.p.path3d) return false; f.item.p.path3d.pts = pts; if (binds.some(Boolean)) f.item.p.path3d.bind = binds; else delete f.item.p.path3d.bind; });
    App.select([id]); return id;
  }
  // Punkte eines Rohrs im Raum weiter anklicken (in Weltlage; das Rohr selbst liegt ganz oben im Verlauf)
  function routeAppend(id) {
    const f = Model.find(App.doc, id); if (!f || !f.item.p.path3d) return false;
    const W = Model.worldMatrix(App.doc, id);
    const pts = Model.path3dPoints(f.item.p.path3d, Model.vars(App.doc).v).map((q) => new THREE.Vector3(...q).applyMatrix4(W).toArray());
    route3d({ pts, d: Model.num(f.item.p.d, Model.vars(App.doc).v, 6), append: id, binds: f.item.p.path3d.bind });
    route.inv = W.clone().invert();
    return true;
  }
  function pickDatumPlaneAt(cx, cy) {
    const g = Viewer.groups && Viewer.groups.datums;
    if (!g || !g.children.length || typeof Datums === 'undefined') return null;
    const rc = Viewer.setRay(cx, cy);
    const hits = rc.intersectObjects(g.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.datum && o !== g) o = o.parent;
      if (o && o.userData.datum) {
        const d = Datums.find(o.userData.datum);
        if (d && d.plane) return { datum: d, point: h.point ? h.point.clone() : null };
      }
    }
    return null;
  }
  function setRevolveToFace(itemId, target) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'revolve' || !target) return false;
    const r6 = (a) => a.map((v) => round(v, 6));
    let oW, nW, pickW = null, meta = null;
    if (target.datumId) {
      const d = typeof Datums !== 'undefined' ? Datums.find(target.datumId) : null;
      if (!d || !d.plane) return false;
      oW = new THREE.Vector3(...d.plane.o);
      nW = new THREE.Vector3(...d.plane.n).normalize();
      pickW = oW.clone();
      meta = { kind: 'datum', datumId: d.id, name: d.name };
    } else if (target.id) {
      const info = target.info || (target.idx != null && App.results.get(target.id)?.data?.faces?.[target.idx]);
      if (!info || info.t !== 'PLANE' || !info.n) return false;
      const W = Model.worldMatrix(App.doc, target.id);
      oW = new THREE.Vector3(...info.c).applyMatrix4(W);
      nW = new THREE.Vector3(...info.n).transformDirection(W).normalize();
      pickW = Array.isArray(target.point) ? new THREE.Vector3(...target.point) : oW.clone();
      const tgt = Model.find(App.doc, target.id);
      meta = { kind: 'face', targetId: target.id, c: r6(info.c), n: r6(info.n), name: tgt ? Model.label(tgt.item) : 'Fläche' };
    } else return false;
    const inv = Model.worldMatrix(App.doc, itemId).invert();
    const oL = oW.clone().applyMatrix4(inv).toArray();
    const nL = nW.clone().transformDirection(inv).normalize().toArray();
    const pickL = pickW.clone().applyMatrix4(inv).toArray();
    const frame = Model.revolveFrame(f.item.p, Model.vars(App.doc).v);
    const flip = Model.revolveAutoFlip(frame, oL, nL, pickL);
    App.change('Bis zu gewählter Fläche', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn || fn.item.kind !== 'revolve') return false;
      fn.item.p.dir = 'toFace';
      fn.item.p.toFace = { ...meta, o: r6(oL), fn: r6(nL) };
      fn.item.p.toFaceFlip = !!flip;
    });
    return true;
  }
  function pickRevolveFace(itemId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== itemId && hit.faceIdx >= 0) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE' && fi.n) {
          stopPick();
          setRevolveToFace(itemId, { id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null });
          UI.toast('Zielfläche gesetzt.', { icon: 'check' });
          return;
        }
      }
      const dp = pickDatumPlaneAt(e.clientX, e.clientY);
      if (dp) {
        stopPick();
        setRevolveToFace(itemId, { datumId: dp.datum.id });
        UI.toast(`Bezugsebene „${dp.datum.name}“ als Ziel gesetzt.`, { icon: 'check' });
        return;
      }
      UI.toast('Bitte wähle eine ebene Fläche eines anderen Körpers oder eine Bezugsebene.', { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Zielfläche wählen:</b> Klick auf eine ebene Fläche eines Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  let revRelinkRounds = 0;
  function relinkRevolveFaces() {
    if (!App.doc) return;
    const vDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const r6 = (a) => a.map((v) => round(v, 6));
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'revolve' || !it.p || it.p.dir !== 'toFace' || !it.p.toFace) return;
      const tf = it.p.toFace;
      const inv = Model.worldMatrix(App.doc, it.id).invert();
      if (tf.kind === 'datum') {
        const d = typeof Datums !== 'undefined' ? Datums.find(tf.datumId) : null;
        if (!d || !d.plane) { if (!tf.lost) jobs.push({ id: it.id, lost: true }); return; }
        const oL = r6(new THREE.Vector3(...d.plane.o).applyMatrix4(inv).toArray());
        const nL = r6(new THREE.Vector3(...d.plane.n).transformDirection(inv).normalize().toArray());
        if (vDiff(oL, tf.o) > 1e-5 || vDiff(nL, tf.fn) > 1e-5 || tf.lost || tf.name !== d.name) {
          jobs.push({ id: it.id, o: oL, fn: nL, name: d.name, lost: false });
        }
      } else if (tf.kind === 'face' && tf.targetId) {
        const rId = App.results.has(tf.targetId) ? tf.targetId : (App.mergedInto(tf.targetId) || tf.targetId);
        const r = App.results.get(rId), tgt = Model.find(App.doc, tf.targetId);
        if (r && r.data && tgt) {
          const nRef = new THREE.Vector3(...(tf.n || [0, 0, 1])), cRef = new THREE.Vector3(...(tf.c || [0, 0, 0]));
          let best = null;
          for (const fc of r.data.faces || []) {
            if (fc.t !== 'PLANE' || !fc.n) continue;
            if (new THREE.Vector3(...fc.n).dot(nRef) < 0.999) continue;
            const dd = new THREE.Vector3(...fc.c).distanceTo(cRef);
            if (!best || dd < best.dd) best = { fc, dd };
          }
          if (best) {
            const W = Model.worldMatrix(App.doc, rId);
            const oW = new THREE.Vector3(...best.fc.c).applyMatrix4(W);
            const nW = new THREE.Vector3(...best.fc.n).transformDirection(W).normalize();
            const oL = r6(oW.applyMatrix4(inv).toArray());
            const nL = r6(nW.transformDirection(inv).normalize().toArray());
            const nm = Model.label(tgt.item);
            if (vDiff(oL, tf.o) > 1e-5 || vDiff(nL, tf.fn) > 1e-5 || tf.lost || tf.name !== nm) {
              jobs.push({ id: it.id, o: oL, fn: nL, c: r6(best.fc.c), n: r6(best.fc.n), name: nm, lost: false });
            }
          } else if (!tf.lost) jobs.push({ id: it.id, lost: true });
        } else if (!tgt && !tf.lost) jobs.push({ id: it.id, lost: true });
      }
    });
    if (!jobs.length) { revRelinkRounds = 0; return; }
    if (++revRelinkRounds > 3) { revRelinkRounds = 0; return; }
    App.change('Zielfläche nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item.p || !f.item.p.toFace) continue;
        const tf = f.item.p.toFace;
        if (j.lost) tf.lost = true;
        else {
          delete tf.lost;
          tf.o = j.o; tf.fn = j.fn;
          if (j.c) tf.c = j.c; if (j.n) tf.n = j.n;
          if (j.name) tf.name = j.name;
        }
      }
    }, { amend: true });
  }
  App.on('results', relinkRevolveFaces);
  // Achse im Bild wählen; cb bekommt { o, d, what, axisId? } in Weltkoordinaten
  function pickAxisThen(cb, hint) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const da = typeof Datums !== 'undefined' ? Datums.pickAxis(e.clientX, e.clientY) : null;
      const A = da ? { o: new THREE.Vector3(...da.ax.axis.o), d: new THREE.Vector3(...da.ax.axis.d), what: 'Bezugsachse „' + da.ax.name + '“', axisId: da.ax.id } : axisOfHit(Viewer.pick(e.clientX, e.clientY, { edgePx: 9 }));
      if (!A) { UI.toast('Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche oder eine Bezugsachse.', { icon: 'info' }); return; }
      stopPick();
      cb(A);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint(hint || '<b>Achse wählen:</b> Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche oder eine Bezugsachse. <b>Esc</b> bricht ab.');
  }
  function pickExtrudeFace(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'extrude') return false;
    const top = Model.topOf(App.doc, itemId);
    const exclude = top && top.id === itemId ? new Set([itemId, '__preview']) : new Set(['__preview']);
    pickFaceThen((ref) => {
      setExtrudeToFace(itemId, ref);
      UI.toast('Zielfläche gewählt: ' + (ref.label || 'Fläche') + '.', { icon: 'check' });
    }, { exclude });
    return true;
  }
  function makeFaceRef(hit) {
    if (!hit || !hit.node || hit.faceIdx == null || hit.faceIdx < 0) return null;
    const n = hit.node, data = n.data || {}, fi = (data.faces || [])[hit.faceIdx];
    if (!fi) return null;
    const bb = data.bbox;
    const rel = bb && fi.c ? [0, 1, 2].map((k) => { const sp = bb[k + 3] - bb[k]; return sp > 1e-6 ? round((fi.c[k] - bb[k]) / sp, 6) : 0.5; }) : null;
    const W = n.obj.matrixWorld;
    const wc = fi.c ? new THREE.Vector3(...fi.c).applyMatrix4(W).toArray().map((v) => round(v, 6)) : null;
    const wn = fi.n ? new THREE.Vector3(...fi.n).transformDirection(W).normalize().toArray().map((v) => round(v, 6)) : null;
    const f = Model.find(App.doc, hit.id);
    return {
      id: hit.id,
      idx: hit.faceIdx,
      t: fi.t,
      c: fi.c ? fi.c.map((v) => round(v, 6)) : null,
      n: fi.n ? fi.n.map((v) => round(v, 6)) : null,
      rel,
      wc,
      wn,
      label: f ? Model.label(f.item) : 'Körper',
    };
  }
  function pickTargetFaceAt(cx, cy, exclude) {
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true, exclude });
    if (hit && hit.faceIdx >= 0) {
      const ref = makeFaceRef(hit);
      if (ref) return ref;
    }
    if (Viewer.groups && Viewer.groups.datums && Viewer.groups.datums.children.length && typeof Datums !== 'undefined') {
      const rc = Viewer.setRay(cx, cy);
      const dh = rc.intersectObjects(Viewer.groups.datums.children, true);
      for (const x of dh) {
        let o = x.object;
        while (o && !o.userData.datum) o = o.parent;
        if (o && o.userData.datum) {
          const d = Datums.find(o.userData.datum);
          if (d && d.plane) return { datumId: d.id, label: 'Bezugsebene „' + d.name + '“' };
        }
      }
    }
    return null;
  }
  function pickFaceThen(cb, opts = {}) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const ref = pickTargetFaceAt(e.clientX, e.clientY, opts.exclude);
      if (!ref) { UI.toast('Klick auf eine Körperfläche oder Bezugsebene.', { icon: 'info' }); return; }
      stopPick();
      cb(ref);
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: opts.exclude });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(opts.hint || '<b>Zielfläche wählen:</b> Klick auf eine Fläche eines Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  function autoFlipDirForFace(plane, W, curDir, ref) {
    if (!plane || !ref || (curDir !== 'normal' && curDir !== 'reverse')) return curDir;
    const oW = new THREE.Vector3(...plane.o).applyMatrix4(W);
    const nW = new THREE.Vector3(...plane.n).transformDirection(W).normalize();
    let pW = null;
    if (ref.datumId && typeof Datums !== 'undefined') {
      const d = Datums.find(ref.datumId);
      if (d && d.plane) pW = new THREE.Vector3(...d.plane.o);
    } else if (Array.isArray(ref.wc)) {
      pW = new THREE.Vector3(...ref.wc);
    } else if (Array.isArray(ref.c) && ref.id && Model.find(App.doc, ref.id)) {
      pW = new THREE.Vector3(...ref.c).applyMatrix4(Model.worldMatrix(App.doc, ref.id));
    }
    if (!pW) return curDir;
    const d = pW.sub(oW).dot(nW);
    if (d > 1e-3) return 'normal';
    if (d < -1e-3) return 'reverse';
    return curDir;
  }
  function setExtrudeToFace(itemId, ref) {
    if (!ref) return false;
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'extrude') return false;
    App.change('Bis Fläche gewählt', (doc) => {
      const T = Model.find(doc, itemId).item;
      T.p.extent = 'toFace';
      T.p.toFace = ref;
      delete T.p.thru;
      if (T.p.dir === 'both') T.p.dir = 'normal';
      if (T.p.sketch && T.p.sketch.plane) {
        T.p.dir = autoFlipDirForFace(T.p.sketch.plane, Model.worldMatrix(doc, itemId), T.p.dir || 'normal', ref);
      }
    });
    App.select([itemId]);
    return true;
  }
  function setPatternAxis(gid, axisId) {
    const ax = typeof Datums !== 'undefined' ? Datums.findAxis(axisId) : null;
    if (!ax || !ax.axis) return false;
    const inv = Model.worldMatrix(App.doc, gid).invert();
    const o = new THREE.Vector3(...ax.axis.o).applyMatrix4(inv), d = new THREE.Vector3(...ax.axis.d).transformDirection(inv).normalize();
    App.change(`Drehachse „${ax.name}“`, (doc) => {
      const f = Model.find(doc, gid); if (!f) return false;
      f.item.p.axis = 'pick';
      f.item.p.axisId = ax.id;
      f.item.p.ao = o.toArray().map((v) => round(v, 6));
      f.item.p.ad = d.toArray().map((v) => round(v, 9));
    });
    App.select([gid]);
    UI.toast(`Drehachse gesetzt: Bezugsachse „${ax.name}“.`, { icon: 'check' });
    return true;
  }
  function pickAxis(gid) {
    pickAxisThen((A) => {
      const inv = Model.worldMatrix(App.doc, gid).invert();
      const o = A.o.clone().applyMatrix4(inv), d = A.d.clone().transformDirection(inv).normalize();
      App.change('Drehachse gewählt', (doc) => {
        const f = Model.find(doc, gid); if (!f) return false;
        f.item.p.axis = 'pick';
        if (A.axisId) f.item.p.axisId = A.axisId; else delete f.item.p.axisId;
        f.item.p.ao = o.toArray().map((v) => round(v, 6));
        f.item.p.ad = d.toArray().map((v) => round(v, 9));
      });
      App.select([gid]);
      UI.toast('Drehachse gesetzt: ' + A.what + '.', { icon: 'check' });
    }, '<b>Drehachse wählen:</b> Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche (Welle, Loch) oder eine Bezugsachse. <b>Esc</b> bricht ab.');
  }
  // Gespiegelte Kopie an einer gewählten ebenen Fläche (z. B. zweiter Arm an der Mittelfläche)
  function mirrorAtFace(face) {
    const top = Model.topOf(App.doc, face.id); if (!top) return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const o = new THREE.Vector3(...face.info.c).applyMatrix4(W), n = new THREE.Vector3(...face.info.n).transformDirection(W).normalize();
    // Ist es die äußerste Fläche in ihrer Richtung (achsparallel), bleibt die Spiegelebene an ihr hängen, wenn das Original wächst
    const box = Actions.selBox([top.id]), ax = [0, 1, 2].find((i) => Math.abs(n.getComponent(i)) > 0.9999);
    let bind = false;
    if (ax != null && !box.isEmpty()) { const ext = n.getComponent(ax) > 0 ? box.max.getComponent(ax) : box.min.getComponent(ax); bind = Math.abs(ext - o.getComponent(ax)) < 1e-3 * Math.max(1, box.getSize(new THREE.Vector3()).length()); }
    const G = wrap([top], NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'FACE', mo: o.toArray().map((v) => round(v, 6)), mn: n.toArray().map((v) => round(v, 9)), ...(bind ? { bind: true } : {}) });
    UI.toast('Gespiegelt an der Fläche – Original und Spiegelbild sind jetzt ein Körper.' + (bind ? ' Wird das Original größer, wandert die Ebene mit.' : ''), { icon: 'check' });
    return G;
  }
  function split(ids) {
    const items = need(ids); if (!items.length) return null;
    const b = Actions.selBox(items.map((x) => x.id));
    const z = b.isEmpty() ? 0 : round((b.min.z + b.max.z) / 2, 2);
    const G = wrap(items, NAMES.split, { op: 'split', plane: 'XY', off: z, keep: 'both', gap: 0 });
    UI.toast('Geteilt. Rechts wählst du die Schnittebene, ihre Lage und welche Hälfte bleibt.', { icon: 'check' });
    return G;
  }
  // Boolesch: vereinigen, abziehen (der erste bleibt, die anderen schneiden), Schnittmenge
  function boolean(mode, ids) {
    ids = (ids || App.sel).slice();
    if (ids.length < 2) { UI.toast('Wähle mindestens zwei Körper (mit Umschalt klicken).', { icon: 'info' }); return; }
    const items = need(ids); if (items.length < 2) return;
    if (mode === 'union') { App.change('Rollen gesetzt', (doc) => { for (const it of items) Model.find(doc, it.id).item.role = 'solid'; }); Actions.group(ids); return; }
    if (mode === 'subtract') { App.change('Rollen gesetzt', (doc) => { items.forEach((it, i) => { Model.find(doc, it.id).item.role = i === 0 ? 'solid' : 'hole'; }); }); Actions.group(ids); return; }
    if (mode === 'intersect') {
      App.change('Rollen gesetzt', (doc) => { for (const it of items) Model.find(doc, it.id).item.role = 'solid'; });
      wrap(siblings(ids), NAMES.intersect, { op: 'intersect' });
      UI.toast('Schnittmenge: Übrig bleibt nur, was in allen Körpern zugleich liegt.', { icon: 'check' });
    }
  }
  // Wandstärke: Körper aushöhlen, die gewählte Fläche wird zur Öffnung
  function shell(face) {
    const it = face && App.doc.items.find((x) => x.id === face.id);
    if (!it || it.role === 'hole') { UI.toast('Klick auf eine Fläche eines Körpers.', { icon: 'info' }); return; }
    const sig = { c: face.info.c.map((v) => round(v, 4)), n: face.info.n ? face.info.n.map((v) => round(v, 5)) : null };
    const ex = (it.finishes || []).find((f) => f.type === 'shell');
    App.change(ex ? 'Öffnung geändert' : 'Ausgehöhlt', (doc) => {
      const T = Model.find(doc, it.id).item; T.finishes = T.finishes || [];
      const s = T.finishes.find((f) => f.type === 'shell');
      if (!s) { T.finishes.push({ id: uid('f'), type: 'shell', r: 2, faces: [sig] }); return; }
      const i = s.faces.findIndex((f) => Math.hypot(f.c[0] - sig.c[0], f.c[1] - sig.c[1], f.c[2] - sig.c[2]) < 1e-3);
      if (i >= 0) { if (s.faces.length > 1) s.faces.splice(i, 1); } else s.faces.push(sig);
    });
    App.select([it.id]);
    UI.toast(ex ? 'Öffnung umgeschaltet. Jede Fläche, die du so anklickst, wird offen oder wieder zu.' : 'Ausgehöhlt mit 2 mm Wand. Rechts änderst du die Wandstärke.', { icon: 'check' });
  }
  // ---------- Rechte Leiste ----------
  function renderOp(it, sec, setP) {
    const p = it.p || {};
    const f = h('div', { class: 'fields' });
    const num = (k, label, unit = 'mm', o = {}) => UI.numField({ id: 'op-' + k, label, value: p[k], unit, int: o.int, min: o.min, onCommit: (v) => setP(k, v) });
    const sel = (k, label, opts) => UI.selectField({ id: 'op-' + k, label, value: p[k], options: opts, onChange: (v) => setP(k, v) });
    let hint = '';
    if (p.op === 'pattern' && p.pt === 'rect') { f.append(num('nx', 'Anzahl X', '', { int: true, min: 1 }), num('ny', 'Anzahl Y', '', { int: true, min: 1 }), num('dx', 'Abstand X'), num('dy', 'Abstand Y')); hint = 'Die Anzahl zählt das Original mit. Abstände gehen von Mitte zu Mitte.'; }
    else if (p.op === 'pattern' && p.pt === 'circ') {
      const axObj = p.axisId && typeof Datums !== 'undefined' ? Datums.findAxis(p.axisId) : null;
      const ax = p.axis === 'x' || p.axis === 'y' || (p.axis === 'pick' && Array.isArray(p.ad)) ? p.axis : 'z';
      const axisVal = axObj ? 'da:' + axObj.id : ax;
      const axisOpts = [['z', 'Senkrecht (Z)'], ['x', 'Quer (X)'], ['y', 'Längs (Y)'], ['pick', 'Im Bild gewählt'], ...(typeof Datums !== 'undefined' ? Datums.axes().filter((a) => a.axis).map((a) => ['da:' + a.id, 'Bezugsachse „' + a.name + '“']) : [])];
      f.append(num('n', 'Anzahl', '', { int: true, min: 1 }), num('ang', 'Winkel', '°'));
      f.append(UI.selectField({
        id: 'op-axis', label: 'Drehachse', value: axisVal, options: axisOpts,
        onChange: (v) => {
          if (v.startsWith('da:')) setPatternAxis(it.id, v.slice(3));
          else if (v === 'pick') pickAxis(it.id);
          else App.change('Drehachse geändert', (doc) => { const fn = Model.find(doc, it.id); if (!fn) return false; fn.item.p.axis = v; delete fn.item.p.axisId; });
        },
      }));
      let info = null;
      if (ax === 'pick' || p.axisId) {
        const d = (p.ad || [0, 0, 1]).map((v) => fmt(v, 2)).join(' · '), o = (p.ao || [0, 0, 0]).map((v) => fmt(v, 1)).join(' · ');
        const lbl = p.axisId ? (axObj ? `Bezugsachse „${axObj.name}“` : 'Bezugsachse fehlt') : 'Richtung ' + d;
        info = h('div', { class: 'mini-row', id: 'op-axisinfo' }, h('span', { class: 'grow' }, lbl), h('b', { class: 'mono' }, 'durch ' + o));
      } else {
        if (ax !== 'x') f.append(num('cx', 'Mitte X'));
        if (ax !== 'y') f.append(num('cy', 'Mitte Y'));
        if (ax !== 'z') f.append(num('cz', 'Mitte Z'));
      }
      const pb = h('button', { type: 'button', class: 'btn', id: 'op-axispick' }); pb.innerHTML = icon('cursor') + (ax === 'pick' ? 'Andere Achse wählen' : 'Achse im Bild wählen');
      pb.onclick = () => pickAxis(it.id);
      hint = { z: 'Gedreht wird um die senkrechte Achse durch die Mitte.', x: 'Gedreht wird um eine Achse quer (in X-Richtung) durch die Mitte – z. B. Löcher rund um ein liegendes Rohr.', y: 'Gedreht wird um eine Achse längs (in Y-Richtung) durch die Mitte – z. B. Rippen rund um ein liegendes Gehäuse.', pick: 'Gedreht wird um die gewählte Achse – eine gerade Kante, eine Welle oder ein Loch, auch schräg.' }[ax] + ' 360° verteilt die Kopien rundherum.';
      sec.append(f); if (info) sec.append(info);
      sec.append(h('div', { class: 'btn-row' }, pb), h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'path') {
      f.append(num('n', 'Anzahl', '', { int: true, min: 1 }), num('d', 'Abstand', 'mm', { min: 0 }));
      f.append(UI.selectField({ id: 'op-align', label: 'Ausrichtung', value: p.align === false ? 'nein' : 'ja', options: [['ja', 'Mit der Kurve'], ['nein', 'Wie das Original']], onChange: (v) => setP('align', v === 'ja') }));
      hint = 'Die Anzahl zählt das Original mit. <b>Abstand 0</b> verteilt die Kopien gleichmäßig über die ganze Kurve, ein Wert setzt sie in diesem Abstand – bis die Kurve zu Ende ist. Ausrichtung „Mit der Kurve“ dreht jede Kopie so, wie die Kurve abbiegt – wie Zähne an einem Bogen.';
      const eb = h('button', { type: 'button', class: 'btn', id: 'op-editpath' }); eb.innerHTML = icon('sketch') + 'Kurve bearbeiten';
      eb.onclick = () => Sketch.editItem(it.id);
      sec.append(f, h('div', { class: 'btn-row' }, eb));
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'mirror' && p.plane === 'FACE') { hint = 'Gespiegelt an einer gewählten Fläche. Original und Spiegelbild sind ein Körper. ' + (p.bind ? 'Die Ebene hängt an der äußeren Fläche: Wird das Original größer, wandert sie mit.' : 'Die Ebene bleibt, wo die Fläche beim Spiegeln war.') + ' Für eine andere Ebene: Rückgängig und neu spiegeln.'; }
    else if (p.op === 'pattern' && p.pt === 'mirror') { f.append(sel('plane', 'Spiegeln', [['YZ', 'Links ↔ rechts'], ['XZ', 'Vorne ↔ hinten'], ['XY', 'Oben ↔ unten']]), num('off', 'Lage der Ebene')); hint = 'Original und Spiegelbild werden ein Körper. Die Ebene geht durch den Nullpunkt, „Lage“ verschiebt sie.'; }
    else if (p.op === 'split') {
      const pl = p.plane || 'XY';
      const sides = { XY: ['Oben', 'Unten'], XZ: ['Hinten', 'Vorne'], YZ: ['Rechts', 'Links'] }[pl];
      f.append(sel('plane', 'Schnitt', [['XY', 'Waagerecht (XY)'], ['XZ', 'Von vorne (XZ)'], ['YZ', 'Von der Seite (YZ)']]), num('off', 'Lage der Ebene'), sel('keep', 'Behalten', [['both', 'Beide Hälften'], ['positive', sides[0]], ['negative', sides[1]]]), num('gap', 'Spalt'));
      hint = 'Mit „Spalt“ rücken die Hälften auseinander – praktisch zum Drucken in zwei Teilen.';
    } else if (p.op === 'intersect') hint = 'Übrig bleibt nur, was in allen Körpern dieser Gruppe zugleich liegt.';
    sec.append(f);
    if (hint) sec.append(h('div', { class: 'hint-box', html: hint }));
    const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + (p.op === 'pattern' ? 'Auflösen (nur Original behalten)' : 'Auflösen');
    ub.onclick = () => Actions.ungroup(it.id);
    sec.append(h('div', { class: 'btn-row' }, ub));
  }
  // Text für Verlauf und Statuszeile
  function sizeText(it, V) {
    const p = Model.resolveP(it.p || {}, V || {});
    if (p.op === 'pattern' && p.pt === 'rect') return `${Math.max(1, Math.round(p.nx || 1))} × ${Math.max(1, Math.round(p.ny || 1))}`;
    if (p.op === 'pattern' && p.pt === 'circ') return `${Math.max(1, Math.round(p.n || 1))}× ${fmt(p.ang ?? 360, 0)}°`;
    if (p.op === 'pattern' && p.pt === 'path') { let k = 0; try { k = Model.pathPatternParams(it, V || Model.vars(App.doc).v).places.length; } catch (_) { k = 0; } return k ? `${k}× entlang Kurve` : 'Kurve fehlt'; }
    if (p.op === 'pattern' && p.pt === 'mirror') return 'gespiegelt';
    if (p.op === 'split') return { both: 'beide Hälften', positive: 'eine Hälfte', negative: 'eine Hälfte' }[p.keep] || '';
    if (p.op === 'intersect') return 'Schnittmenge';
    return null;
  }
  // ---------- Kosmetisches Gewinde (KP-20) ----------
  function guessThreadSize(r, kind = 'ext') {
    const d = 2 * (Number(r) || 3);
    let best = THREAD_SPECS[0], bd = Infinity;
    for (const s of THREAD_SPECS) {
      const diff = kind === 'int' ? Math.min(Math.abs(s.core - d), Math.abs(s.d - d) + 0.05) : Math.abs(s.d - d);
      if (diff < bd) { bd = diff; best = s; }
    }
    return best.size;
  }
  function threadOnFace(itemId, faceIdx) {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item.threads || !f.item.threads.length) return null;
    return f.item.threads.find((th) => Viewer.threadFaceIndex(itemId, th) === faceIdx) || null;
  }
  function markThread(face, opts = {}) {
    if (!face || !face.id) return null;
    const found = Model.find(App.doc, face.id);
    if (!found || found.item.role === 'hole') { UI.toast('Klick auf die runde Fläche eines Körpers.', { icon: 'info' }); return null; }
    const g = Viewer.cylinderFaceInfo(face.id, face.idx);
    if (!g) { UI.toast('Bitte wähle eine runde Zylinderfläche.', { icon: 'info' }); return null; }
    const kind = opts.kind === 'int' || opts.kind === 'ext' ? opts.kind : g.kind;
    const size = opts.size && THREAD_MAP[opts.size] ? opts.size : guessThreadSize(g.r, kind);
    const lenRaw = opts.length != null ? Number(opts.length) : round(g.faceLen, 2);
    const length = round(clamp(lenRaw > 0 ? lenRaw : g.faceLen, 0.5, g.faceLen), 3);
    const from = opts.from === 'bottom' ? 'bottom' : 'top';
    const entry = {
      id: opts.id || uid('th'),
      size,
      length,
      kind,
      from,
      c: g.c.map((v) => round(v, 4)),
      axis: [...g.o.map((v) => round(v, 4)), ...g.d.map((v) => round(v, 6))],
      r: round(g.r, 4),
      t0: round(g.t0, 4),
      t1: round(g.t1, 4),
    };
    App.change(`Gewinde markiert (${size} × ${fmt(length, 1)})`, (doc) => {
      const T = Model.find(doc, face.id).item;
      const list = (T.threads || []).filter((x) => x.id !== entry.id && Viewer.threadFaceIndex(face.id, x) !== face.idx);
      list.push(entry);
      T.threads = list;
    });
    UI.toast(`Gewinde ${size} × ${fmt(length, 1)} mm markiert (nur Anzeige – rechnet sofort).`, { icon: 'check' });
    return entry.id;
  }
  function updateThread(itemId, threadId, patch) {
    App.change('Gewinde geändert', (doc) => {
      const f = Model.find(doc, itemId); if (!f || !f.item.threads) return false;
      const th = f.item.threads.find((x) => x.id === threadId); if (!th) return false;
      if (patch.size && THREAD_MAP[patch.size]) th.size = patch.size;
      if (patch.kind === 'int' || patch.kind === 'ext') th.kind = patch.kind;
      if (patch.from === 'top' || patch.from === 'bottom') th.from = patch.from;
      if (patch.length != null) {
        const g = Viewer.threadFaceIndex(itemId, th) >= 0 ? Viewer.cylinderFaceInfo(itemId, Viewer.threadFaceIndex(itemId, th)) : null;
        const maxL = g ? g.faceLen : Math.max(0.5, Math.abs((th.t1 ?? 10) - (th.t0 ?? 0)));
        const n = Number(patch.length);
        if (n > 0) th.length = round(clamp(n, 0.5, maxL), 3);
      }
    });
  }
  function removeThread(itemId, threadId) {
    App.change('Gewinde-Markierung entfernt', (doc) => {
      const f = Model.find(doc, itemId); if (!f || !f.item.threads) return false;
      const list = f.item.threads.filter((x) => x.id !== threadId);
      if (list.length) f.item.threads = list; else delete f.item.threads;
    });
  }
  function poseFromOriginDir(o, zDir) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), zDir.clone().normalize());
    return new THREE.Matrix4().compose(o, q, new THREE.Vector3(1, 1, 1));
  }
  function makeThreadReal(itemId, threadId) {
    const f = Model.find(App.doc, itemId);
    const it = f && f.item;
    const th = it && (it.threads || []).find((x) => x.id === threadId);
    if (!it || !th) return null;
    const fi = Viewer.threadFaceIndex(itemId, th);
    const g = (fi >= 0 && Viewer.cylinderFaceInfo(itemId, fi)) || (Array.isArray(th.axis) && th.axis.length >= 6 ? {
      o: th.axis.slice(0, 3), d: th.axis.slice(3, 6), r: th.r || 3, c: th.c || [0, 0, 0],
      t0: th.t0 ?? 0, t1: th.t1 ?? 10, faceLen: Math.max(0.1, (th.t1 ?? 10) - (th.t0 ?? 0)), kind: th.kind || 'ext',
    } : null);
    if (!g) { UI.toast('Die Zylinderfläche für das Gewinde wurde nicht gefunden.', { kind: 'bad' }); return null; }
    const L = round(clamp(Number(th.length) || g.faceLen, 0.5, g.faceLen), 3);
    const fromBottom = th.from === 'bottom';
    const s0 = fromBottom ? g.t0 : g.t1 - L;
    const s1 = fromBottom ? g.t0 + L : g.t1;
    const dL = new THREE.Vector3(...g.d).normalize();
    const W = Model.worldMatrix(App.doc, itemId);
    const pStartW = new THREE.Vector3(...g.o).addScaledVector(dL, s0).applyMatrix4(W);
    const pEndW = new THREE.Vector3(...g.o).addScaledVector(dL, s1).applyMatrix4(W);
    const dW = pEndW.clone().sub(pStartW).normalize();
    const topCur = Model.topOf(App.doc, itemId);
    let selId = topCur ? topCur.id : itemId;
    App.change(`Gewinde echt gemacht (${th.size} × ${fmt(L, 1)})`, (doc) => {
      const T = Model.find(doc, itemId).item;
      const top = Model.topOf(doc, itemId);
      const rest = (T.threads || []).filter((x) => x.id !== threadId);
      if (rest.length) T.threads = rest; else delete T.threads;
      if (th.kind === 'int') {
        const entryPt = fromBottom ? pStartW : pEndW;
        const outDir = fromBottom ? dW.clone().negate() : dW;
        const hole = Model.newItem('part', { lib: 'threadHole', size: th.size, length: L, clear: 0.3 }, { name: `Innengewinde ${th.size} × ${fmt(L, 1)}`, color: top.color, role: 'solid' });
        Model.setFromMatrix(hole, poseFromOriginDir(entryPt, outDir));
        hole.op = { type: 'cut', target: top.id };
        const ti = doc.items.indexOf(top);
        doc.items.splice(ti >= 0 ? ti + 1 : doc.items.length, 0, hole);
        selId = top.id;
        return;
      }
      const isPlainCyl = T === top && T.kind === 'cylinder' && !(T.finishes && T.finishes.length) && !T.op;
      if (isPlainCyl && L >= g.faceLen - 0.05) {
        T.kind = 'part';
        T.p = { lib: 'threadRod', size: th.size, length: L };
        Model.setFromMatrix(T, poseFromOriginDir(pStartW, dW));
        selId = T.id;
        return;
      }
      if (isPlainCyl) {
        const rem = round(Math.max(0.5, g.faceLen - L), 3);
        T.p.h = rem;
        if (fromBottom) Model.setFromMatrix(T, new THREE.Matrix4().makeTranslation(dW.x * L, dW.y * L, dW.z * L).multiply(Model.localMatrix(T)));
        const rodOrigin = fromBottom ? pStartW : pStartW.clone().addScaledVector(dW, -0.05);
        const rod = Model.newItem('part', { lib: 'threadRod', size: th.size, length: round(L + 0.05, 3) }, { name: `Gewinde ${th.size} × ${fmt(L, 1)}`, color: T.color, role: 'solid' });
        Model.setFromMatrix(rod, poseFromOriginDir(rodOrigin, dW));
        rod.op = { type: 'join', target: T.id };
        const ti = doc.items.indexOf(T);
        doc.items.splice(ti >= 0 ? ti + 1 : doc.items.length, 0, rod);
        selId = T.id;
        return;
      }
      // Beliebiger Körper: erst Überstand glatt abtragen, dann echtes Außengewinde vereinigen
      const cutD = round(Math.max(2 * g.r, (THREAD_MAP[th.size] ? THREAD_MAP[th.size].d : 6)) + 0.2, 3);
      const cutOrigin = fromBottom ? pStartW.clone().addScaledVector(dW, -0.05) : pStartW;
      const cut = Model.newItem('cylinder', { d: cutD, h: round(L + 0.05, 3) }, { name: `Gewinde-Freischnitt ${th.size}`, color: top.color, role: 'solid' });
      Model.setFromMatrix(cut, poseFromOriginDir(cutOrigin, dW));
      cut.op = { type: 'cut', target: top.id };
      const rodOrigin = fromBottom ? pStartW : pStartW.clone().addScaledVector(dW, -0.05);
      const rod = Model.newItem('part', { lib: 'threadRod', size: th.size, length: round(L + 0.05, 3) }, { name: `Gewinde ${th.size} × ${fmt(L, 1)}`, color: top.color, role: 'solid' });
      Model.setFromMatrix(rod, poseFromOriginDir(rodOrigin, dW));
      rod.op = { type: 'join', target: top.id };
      const ti = doc.items.indexOf(top);
      doc.items.splice(ti >= 0 ? ti + 1 : doc.items.length, 0, cut, rod);
      selId = top.id;
    });
    App.select([selId]);
    UI.toast(`Echtes Gewinde ${th.size} × ${fmt(L, 1)} mm erzeugt. Mit Rückgängig kommst du wieder zur Markierung.`, { icon: 'check' });
    return selId;
  }
  function threadPop(face, anchor) {
    if (!face || !face.id) return;
    const g = Viewer.cylinderFaceInfo(face.id, face.idx);
    if (!g) { UI.toast('Bitte wähle eine runde Zylinderfläche.', { icon: 'info' }); return; }
    const existing = threadOnFace(face.id, face.idx);
    let size = existing ? existing.size : guessThreadSize(g.r, g.kind);
    let len = existing ? existing.length : round(g.faceLen, 2);
    let from = existing ? (existing.from || 'top') : 'top';
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '230px' }, 'data-help': 'cosmeticThread' });
    box.append(h('div', { class: 'section-h' }, (g.kind === 'int' ? 'Innengewinde' : 'Außengewinde') + ` · Ø ${Units.fmtLenU(2 * g.r, 2)}`));
    const fields = h('div', { class: 'fields' });
    fields.append(UI.selectField({ id: 'ct-size', label: 'M-Größe', value: size, options: THREAD_SPECS.map((s) => [s.size, `${s.size} (Steigung ${fmt(s.pitch, 2)})`]), onChange: (v) => { size = v; } }));
    fields.append(UI.numField({ id: 'ct-len', label: 'Länge', value: len, min: 0.5, unit: 'mm', expr: false, onCommit: (v) => { len = v; } }));
    box.append(fields);
    box.append(UI.selectField({ id: 'ct-from', label: 'Beginnt am', value: from, options: [['top', 'Ende 1 (oben)'], ['bottom', 'Ende 2 (unten)']], onChange: (v) => { from = v; } }));
    const row = h('div', { class: 'btn-row' });
    const applyB = h('button', { type: 'button', class: 'btn primary', id: 'ct-apply' }, existing ? 'Ändern' : 'Gewinde markieren');
    applyB.onclick = () => {
      const lenInp = $('#ct-len');
      const v = lenInp ? parseNum(lenInp.value) : NaN;
      if (isFinite(v) && v > 0) len = v;
      const selSize = $('#ct-size'); if (selSize) size = selSize.value;
      const selFrom = $('#ct-from'); if (selFrom) from = selFrom.value;
      markThread(face, { id: existing ? existing.id : undefined, size, length: len, from, kind: g.kind });
      UI.closePop();
    };
    row.append(applyB);
    if (existing) {
      const realB = h('button', { type: 'button', class: 'btn', id: 'ct-real' }, 'Echt machen');
      realB.onclick = () => { UI.closePop(); makeThreadReal(face.id, existing.id); };
      const delB = h('button', { type: 'button', class: 'btn ghost danger', id: 'ct-del' }, 'Entfernen');
      delB.onclick = () => { UI.closePop(); removeThread(face.id, existing.id); };
      row.append(realB, delB);
    }
    box.append(row);
    box.append(h('div', { class: 'hint-box' }, 'Nur Markierung – rechnet sofort und steht in Stückliste und Zeichnung.'));
    UI.pop(anchor || $('#center'), box);
  }
  // ---------- Verschieben / Drehen / Kopieren als Schritt (KP-08) ----------
  const isModifierStep = (x) => (x.kind === 'transform' && !(x.p && x.p.copy)) || x.kind === 'scale' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) || x.kind === 'rib' || x.kind === 'mirrorStep';
  function insertAtMarker(doc, step) {
    const at = doc.rollback != null ? clamp(doc.rollback, 0, doc.items.length) : doc.items.length;
    doc.items.splice(at, 0, step);
    if (doc.rollback != null) doc.rollback = at + 1;
  }
  function resolveTopTarget(targetOrIds) {
    const raw = Array.isArray(targetOrIds) ? targetOrIds[0] : (targetOrIds || App.sel[0]);
    const top = raw ? Model.topOf(App.doc, raw) : null;
    const tid = top ? (App.mergedInto(top.id) || top.id) : null;
    return tid ? App.doc.items.find((x) => x.id === tid) || null : null;
  }
  function activeTargetsBefore(it) {
    const idx = App.doc.items.indexOf(it);
    const prev = idx >= 0 ? App.doc.items.slice(0, idx) : [];
    return prev.filter((x) => !x.suppressed && !(x.op && x.op.target) && !isModifierStep(x));
  }
  function transform(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Verschieben/Drehen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = resolveTopTarget(targetOrIds);
    if (!tgt) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    const p = {
      target: tgt.id,
      dx: opts.dx ?? 0, dy: opts.dy ?? 0, dz: opts.dz ?? 0,
      rx: opts.rx ?? 0, ry: opts.ry ?? 0, rz: opts.rz ?? 0,
      pivot: opts.pivot || 'center',
      px: opts.px ?? 0, py: opts.py ?? 0, pz: opts.pz ?? 0,
      copy: !!opts.copy,
    };
    let step;
    App.change('Verschieben/Drehen angelegt', (doc) => {
      step = Model.newItem('transform', p, { name: opts.name || 'Verschieben/Drehen', color: tgt.color, role: tgt.role, mat: tgt.mat });
      doc.items.push(step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Schritt „Verschieben/Drehen“ angelegt. Rechts stellst du Verschiebung, Drehung und „Als Kopie“ ein.', { icon: 'check' });
    }
    return step || null;
  }
  function renderTransform(it, sec, setP) {
    const p = it.p || {};
    const targets = activeTargetsBefore(it);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    if (opts.length) {
      sec.append(UI.selectField({ id: 'xf-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { const T = Model.find(doc, it.id).item; T.p.target = v; }) }));
    }
    const copyL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'xf-copy', checked: !!p.copy }), 'Als Kopie (Original bleibt an seinem Platz)');
    copyL.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Als Kopie' : 'Original versetzen', (doc) => { Model.find(doc, it.id).item.p.copy = e.target.checked; });
    sec.append(copyL);
    const ft = h('div', { class: 'fields three' });
    for (const k of ['dx', 'dy', 'dz']) ft.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '', onCommit: (v) => setP(k, v) }));
    const fr = h('div', { class: 'fields three' });
    for (const k of ['rx', 'ry', 'rz']) fr.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '°', onCommit: (v) => setP(k, v) }));
    sec.append(h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', null, 'Verschiebung (mm)'), ft), h('div', { class: 'field' }, h('label', null, 'Drehung (°)'), fr));
    const pv = p.pivot || 'center';
    sec.append(UI.selectField({ id: 'xf-pivot', label: 'Drehpunkt', value: pv, options: [['center', 'Mitte des Körpers'], ['origin', 'Ursprung (0 · 0 · 0)'], ['point', 'Eigener Punkt']], onChange: (v) => App.change('Drehpunkt geändert', (doc) => { Model.find(doc, it.id).item.p.pivot = v; }) }));
    if (pv === 'point') {
      const fp = h('div', { class: 'fields three' });
      for (const k of ['px', 'py', 'pz']) fp.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '', onCommit: (v) => setP(k, v) }));
      sec.append(h('div', { class: 'field' }, h('label', null, 'Punkt (mm)'), fp));
    }
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'xf-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      sec.append(h('div', { class: 'btn-row' }, gb));
    }
    sec.append(h('div', { class: 'hint-box', html: p.copy ? 'Erzeugt eine versetzte oder gedrehte <b>Kopie</b>. Ändert sich der Zielkörper, wandert die Kopie mit.' : 'Versetzt den Zielkörper als Schritt im Verlauf. Unterdrückst du diesen Schritt oder rollst den Marker davor, springt der Körper zurück.' }));
  }
  // ---------- Körper skalieren (KP-07) ----------
  function scale(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Skalieren gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = resolveTopTarget(targetOrIds);
    if (!tgt) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    const uniform = opts.uniform !== undefined ? !!opts.uniform : (opts.sx == null && opts.sy == null && opts.sz == null);
    const s0 = opts.s ?? 1;
    const p = {
      target: tgt.id,
      uniform,
      s: s0,
      sx: opts.sx ?? s0, sy: opts.sy ?? s0, sz: opts.sz ?? s0,
      pivot: opts.pivot === 'origin' ? 'origin' : 'centroid',
    };
    let step;
    App.change('Skalieren angelegt', (doc) => {
      step = Model.newItem('scale', p, { name: opts.name || 'Skalieren', color: tgt.color, role: tgt.role, mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Schritt „Skalieren“ angelegt. Rechts stellst du Faktor, Achsen und Bezugspunkt ein.', { icon: 'check' });
    }
    return step || null;
  }
  function renderScale(it, sec, setP) {
    const p = it.p || {};
    const targets = activeTargetsBefore(it);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    if (opts.length) {
      sec.append(UI.selectField({ id: 'sc-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }) }));
    }
    const uni = p.uniform !== false;
    const uniL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'sc-uniform', checked: uni }), 'Gleichmäßig (alle Achsen gleich)');
    uniL.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Gleichmäßig skalieren' : 'Je Achse skalieren', (doc) => {
      const T = Model.find(doc, it.id).item;
      const u = e.target.checked;
      T.p.uniform = u;
      if (!u && (T.p.sx == null || (T.p.sx === 1 && T.p.sy === 1 && T.p.sz === 1 && T.p.s !== 1))) {
        const s0 = T.p.s ?? 1;
        T.p.sx = s0; T.p.sy = s0; T.p.sz = s0;
      }
    });
    sec.append(uniL);
    if (uni) {
      sec.append(h('div', { class: 'fields', style: { marginTop: '8px' } }, UI.numField({ id: 'sc-s', label: 'Faktor', value: p.s ?? 1, unit: '×', min: 0.01, step: 0.1, onCommit: (v) => setP('s', v) })));
    } else {
      const fa = h('div', { class: 'fields three' });
      for (const k of ['sx', 'sy', 'sz']) fa.append(UI.numField({ id: 'sc-' + k, value: p[k] ?? 1, axis: k[1], unit: '×', min: 0.01, step: 0.1, onCommit: (v) => setP(k, v) }));
      sec.append(h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', null, 'Faktor je Achse'), fa));
    }
    sec.append(UI.selectField({ id: 'sc-pivot', label: 'Bezugspunkt', value: p.pivot === 'origin' ? 'origin' : 'centroid', options: [['centroid', 'Schwerpunkt'], ['origin', 'Ursprung (0 · 0 · 0)']], onChange: (v) => App.change('Bezugspunkt geändert', (doc) => { Model.find(doc, it.id).item.p.pivot = v; }) }));
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'sc-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      sec.append(h('div', { class: 'btn-row' }, gb));
    }
    sec.append(h('div', { class: 'hint-box', html: 'Skaliert den Zielkörper um seinen <b>Schwerpunkt</b> oder den <b>Ursprung</b> – gleichmäßig oder je Achse getrennt. Im Verlauf jederzeit änderbar, unterdrückbar und rückrollbar.' }));
  }
  // ---------- Fläche aufdicken (KP-07) ----------
  function faceSigOf(face) {
    if (!face || !face.info || !Array.isArray(face.info.c)) return null;
    return {
      c: face.info.c.map((v) => round(v, 6)),
      n: Array.isArray(face.info.n) ? face.info.n.map((v) => round(v, 6)) : null,
      t: face.info.t || null,
    };
  }
  function thicken(face, opts = {}) {
    if (App.ctx) { UI.toast('Aufdicken als Schritt gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig) { UI.toast('Klick zuerst eine Fläche eines Körpers an.', { icon: 'info' }); return null; }
    const p = {
      target: tgt.id,
      face: sig,
      t: opts.t ?? 2,
      dir: opts.dir === 'in' || opts.dir === 'mid' ? opts.dir : 'out',
      mode: opts.mode === 'new' || opts.mode === 'cut' ? opts.mode : 'join',
    };
    let step;
    App.change('Aufdicken angelegt', (doc) => {
      step = Model.newItem('thicken', p, { name: opts.name || 'Aufdicken', color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Fläche aufgedickt. Rechts stellst du Dicke, Richtung und Modus ein.', { icon: 'check' });
    }
    return step || null;
  }
  function pickThickenFace(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          const sig = faceSigOf({ info: fi });
          App.change('Fläche für Aufdicken gewählt', (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = sig;
          });
          UI.toast('Fläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche eines Körpers.', { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche wählen:</b> Klick auf eine Fläche des Körpers. <b>Esc</b> bricht ab.');
  }
  function renderThicken(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.numField({ id: 'th-t', label: 'Dicke', value: p.t ?? 2, min: 0.1, unit: 'mm', onCommit: (v) => setP('t', v) }));
    fl.append(UI.selectField({ id: 'th-dir', label: 'Richtung', value: p.dir === 'in' || p.dir === 'mid' ? p.dir : 'out', options: [['out', 'Nach außen'], ['in', 'Nach innen'], ['mid', 'Mittig']], onChange: (v) => App.change('Aufdick-Richtung geändert', (doc) => { Model.find(doc, it.id).item.p.dir = v; }) }));
    fl.append(UI.selectField({ id: 'th-mode', label: 'Ergebnis', value: p.mode === 'new' || p.mode === 'cut' ? p.mode : 'join', options: [['join', 'Mit Körper vereinigen'], ['new', 'Eigene Platte (neuer Körper)'], ['cut', 'Vom Körper abziehen']], onChange: (v) => App.change('Aufdick-Modus geändert', (doc) => { Model.find(doc, it.id).item.p.mode = v; }) }));
    sec.append(fl);
    const row = h('div', { class: 'btn-row' });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'th-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickThickenFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'th-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    const inJoinHint = p.dir === 'in' && (p.mode || 'join') === 'join' ? ' Hinweis: „Nach innen“ mit „Vereinigen“ liegt im Körper – wähle „Eigene Platte“ oder „Vom Körper abziehen“, um es sichtbar zu machen.' : '';
    sec.append(h('div', { class: 'hint-box', html: 'Macht aus der gewählten Fläche (eben oder gebogen) eine Platte mit fester Dicke – nach außen, innen oder mittig.' + inJoinHint }));
  }
  // ---------- Rippe (KP-06) ----------
  function ribTargets(idx = Infinity) {
    return App.doc.items.slice(0, idx).filter((x) => x.role !== 'hole' && !x.suppressed && !isModifierStep(x) && !(x.op && x.op.target));
  }
  function startRib(face) {
    if (App.ctx) { UI.toast('Rippen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für eine Rippe braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = face && face.info && face.info.t === 'PLANE' ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') {
      Sketch.startOnFace(f, { ribMode: true });
      UI.toast('Zeichne eine offene Linie oder Kurve für die Rippe und klick „Fertig“.', { icon: 'info', ms: 4200 });
    } else {
      Sketch.chooseAndStart({ ribMode: true });
      UI.toast('Wähl eine Ebene und zeichne eine offene Linie für die Rippe.', { icon: 'info', ms: 4200 });
    }
    return true;
  }
  function renderRib(it, sec, setP) {
    const p = it.p || {};
    const idx = App.doc.items.indexOf(it);
    const targets = ribTargets(idx >= 0 ? idx : App.doc.items.length);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    const fl = h('div', { class: 'fields' });
    if (opts.length) {
      fl.append(UI.selectField({ id: 'rib-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }) }));
    }
    fl.append(UI.numField({ id: 'rib-thickness', label: 'Dicke', value: p.thickness ?? 2, min: 0.1, onCommit: (v) => setP('thickness', v) }));
    fl.append(UI.selectField({ id: 'rib-side', label: 'Lage zur Linie', value: p.side || 'center', options: [['center', 'Mittig'], ['side1', 'Einseitig (Seite 1)'], ['side2', 'Einseitig (Seite 2)']], onChange: (v) => setP('side', v) }));
    fl.append(UI.selectField({ id: 'rib-dir', label: 'Richtung', value: p.dir || 'normal', options: [['normal', 'Senkrecht zur Skizze (Steg)'], ['parallel', 'In der Skizzenebene (Stütze)']], onChange: (v) => setP('dir', v) }));
    fl.append(UI.numField({ id: 'rib-draft', label: 'Schräge (optional)', value: p.draft ?? 0, unit: '°', min: 0, onCommit: (v) => setP('draft', v) }));
    fl.append(UI.numField({ id: 'rib-depth', label: 'Tiefe (0 = bis zur Wand)', value: p.depth ?? 0, min: 0, onCommit: (v) => setP('depth', v) }));
    sec.append(fl);
    const flipL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'rib-flip', checked: !!p.flip }), 'Richtung umkehren');
    flipL.querySelector('input').onchange = (e) => App.change('Rippenrichtung umgekehrt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flipL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'rib-edit-sketch' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
    eb.onclick = () => Sketch.editItem(it.id);
    row.append(eb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'rib-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Die offene Linie wird mit Dicke bis an die angrenzenden Wände verlängert und direkt mit dem Zielkörper vereinigt. Mit <b>Schräge</b> wird die Rippe zum Boden breiter.' }));
  }
  // ---------- Schritt spiegeln (KP-14) ----------
  function canMirrorStep(it, parent) {
    if (!it) return false;
    if (it.op && it.op.target) return true;
    if (it.kind === 'rib') return true;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return true;
    if (it.kind === 'mirrorStep') return true;
    if (it.role === 'hole') return true;
    if (parent && !isOp(parent) && it.kind !== 'group') return true;
    return false;
  }
  function mirrorCandidatesBefore(stepItem) {
    const f = Model.find(App.doc, stepItem.id);
    if (!f) return [];
    const idx = f.list.indexOf(f.item);
    if (idx < 0) return [];
    return f.list.slice(0, idx).filter((x) => !x.suppressed && canMirrorStep(x, f.parent));
  }
  function resolveMirrorFace(face) {
    if (!face || !face.id) return null;
    const idx = face.idx != null ? face.idx : face.faceIdx;
    const info = face.info || (idx != null && idx >= 0 ? App.results.get(face.id)?.data?.faces?.[idx] : null);
    if (!info || info.t !== 'PLANE' || !Array.isArray(info.n) || !Array.isArray(info.c)) return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const mo = new THREE.Vector3(...info.c).applyMatrix4(W).toArray().map((v) => round(v, 6));
    const mn = new THREE.Vector3(...info.n).transformDirection(W).normalize().toArray().map((v) => round(v, 9));
    const tgt = Model.find(App.doc, face.id);
    return {
      mo,
      mn,
      faceRef: {
        id: face.id,
        idx,
        c: info.c.map((v) => round(v, 6)),
        n: info.n.map((v) => round(v, 6)),
        name: tgt ? Model.label(tgt.item) : 'Fläche',
      },
    };
  }
  function mirrorStep(idsOrTarget, opts = {}) {
    const rawIds = Array.isArray(idsOrTarget) ? idsOrTarget : (idsOrTarget ? [idsOrTarget] : App.sel);
    const found = rawIds.map((id) => Model.find(App.doc, id)).filter(Boolean);
    let picked = found.length && found.every((f) => f.list === found[0].list)
      ? found.filter((f) => canMirrorStep(f.item, f.parent))
      : [];
    // Komfort-Fallback: Ist ein Zielkörper gewählt, seinen letzten aktiven Formschritt nehmen
    if (!picked.length && found.length === 1 && !found[0].parent && found[0].item.role !== 'hole') {
      const bid = found[0].item.id;
      const cand = App.doc.items.filter((x) => !x.suppressed && (
        (x.op && x.op.target === bid) ||
        ((x.kind === 'rib' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new'))) && x.p && x.p.target === bid)
      ));
      if (cand.length) picked = [{ item: cand[cand.length - 1], parent: null, list: App.doc.items }];
    }
    if (!picked.length) {
      UI.toast('Wähle zuerst einen Formschritt im Verlauf (z. B. eine Tasche, Erhöhung, Rippe oder ein Loch).', { icon: 'info' });
      return null;
    }
    const parent = picked[0].parent;
    const p = {
      features: picked.map((f) => f.item.id),
      plane: opts.plane || (opts.datumId ? 'DATUM' : opts.face ? 'FACE' : 'YZ'),
      off: opts.off ?? 0,
    };
    if (p.plane === 'DATUM') {
      p.datumId = opts.datumId || null;
    } else if (p.plane === 'FACE') {
      const rf = resolveMirrorFace(opts.face);
      if (!rf) { UI.toast('Bitte wähle eine ebene Körperfläche als Spiegelebene.', { icon: 'info' }); return null; }
      p.mo = rf.mo; p.mn = rf.mn; p.faceRef = rf.faceRef;
    }
    let step;
    App.change('Schritt spiegeln angelegt', (doc) => {
      const list = parent ? Model.find(doc, parent.id).item.children : doc.items;
      const lastIdx = Math.max(...p.features.map((fid) => list.findIndex((x) => x.id === fid)));
      step = Model.newItem('mirrorStep', p, {
        name: opts.name || 'Schritt spiegeln',
        color: picked[0].item.color,
        role: picked[0].item.role,
      });
      if (parent) {
        const par = Model.find(doc, parent.id).item;
        const at = clamp(lastIdx + 1, 0, list.length);
        list.splice(at, 0, step);
        if (par.rollback != null && at <= par.rollback) par.rollback++;
      } else {
        insertAtMarker(doc, step);
      }
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Formschritt gespiegelt. Rechts wählst du Spiegelebene, Fläche oder weitere Schritte.', { icon: 'check' });
    }
    return step || null;
  }
  function setMirrorStepPlane(stepId, spec) {
    const f = Model.find(App.doc, stepId);
    if (!f || f.item.kind !== 'mirrorStep' || !spec) return false;
    if (spec.datumId) {
      const dm = typeof Datums !== 'undefined' ? Datums.find(spec.datumId) : null;
      if (!dm || !dm.plane) return false;
      App.change(`Spiegelebene „${dm.name}“`, (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = 'DATUM';
        T.p.datumId = dm.id;
        delete T.p.faceRef; delete T.p.mo; delete T.p.mn;
      });
      return true;
    }
    if (spec.id) {
      const rf = resolveMirrorFace(spec);
      if (!rf) return false;
      App.change('Spiegelfläche gewählt', (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = 'FACE';
        T.p.mo = rf.mo; T.p.mn = rf.mn; T.p.faceRef = rf.faceRef;
        delete T.p.datumId;
      });
      return true;
    }
    if (['XY', 'XZ', 'YZ'].includes(spec.plane)) {
      App.change('Spiegelebene geändert', (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = spec.plane;
        if (spec.off !== undefined) T.p.off = spec.off;
        delete T.p.datumId; delete T.p.faceRef; delete T.p.mo; delete T.p.mn;
      });
      return true;
    }
    return false;
  }
  function pickMirrorStepPlane(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE' && fi.n) {
          stopPick();
          setMirrorStepPlane(stepId, { id: hit.id, idx: hit.faceIdx, info: fi });
          UI.toast('Ebene Körperfläche als Spiegelebene gesetzt.', { icon: 'check' });
          return;
        }
      }
      const dp = pickDatumPlaneAt(e.clientX, e.clientY);
      if (dp) {
        stopPick();
        setMirrorStepPlane(stepId, { datumId: dp.datum.id });
        UI.toast(`Bezugsebene „${dp.datum.name}“ als Spiegelebene gesetzt.`, { icon: 'check' });
        return;
      }
      UI.toast('Bitte wähle eine ebene Körperfläche oder eine Bezugsebene.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Spiegelebene wählen:</b> Klick auf eine ebene Körperfläche oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  let mirrorRelinkRounds = 0;
  function relinkMirrorStepFaces() {
    if (!App.doc) return;
    const vDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const r6 = (a) => a.map((v) => round(v, 6));
    const r9 = (a) => a.map((v) => round(v, 9));
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'mirrorStep' || !it.p || it.p.plane !== 'FACE' || !it.p.faceRef) return;
      const fr = it.p.faceRef;
      const rId = App.results.has(fr.id) ? fr.id : (App.mergedInto(fr.id) || fr.id);
      const r = App.results.get(rId), tgt = Model.find(App.doc, fr.id);
      if (r && r.data && tgt) {
        const nRef = new THREE.Vector3(...(fr.n || [0, 0, 1])), cRef = new THREE.Vector3(...(fr.c || [0, 0, 0]));
        let best = null;
        for (const fc of r.data.faces || []) {
          if (fc.t !== 'PLANE' || !fc.n) continue;
          if (new THREE.Vector3(...fc.n).dot(nRef) < 0.999) continue;
          const dd = new THREE.Vector3(...fc.c).distanceTo(cRef);
          if (!best || dd < best.dd) best = { fc, dd };
        }
        if (best) {
          const W = Model.worldMatrix(App.doc, rId);
          const moW = r6(new THREE.Vector3(...best.fc.c).applyMatrix4(W).toArray());
          const mnW = r9(new THREE.Vector3(...best.fc.n).transformDirection(W).normalize().toArray());
          const nm = Model.label(tgt.item);
          if (vDiff(moW, it.p.mo) > 1e-5 || vDiff(mnW, it.p.mn) > 1e-5 || fr.lost || fr.name !== nm) {
            jobs.push({ id: it.id, mo: moW, mn: mnW, c: r6(best.fc.c), n: r6(best.fc.n), name: nm, lost: false });
          }
        } else if (!fr.lost) jobs.push({ id: it.id, lost: true });
      } else if (!tgt && !fr.lost) jobs.push({ id: it.id, lost: true });
    });
    if (!jobs.length) { mirrorRelinkRounds = 0; return; }
    if (++mirrorRelinkRounds > 3) { mirrorRelinkRounds = 0; return; }
    App.change('Spiegelfläche nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item.p || !f.item.p.faceRef) continue;
        const p = f.item.p;
        if (j.lost) p.faceRef.lost = true;
        else {
          delete p.faceRef.lost;
          p.mo = j.mo; p.mn = j.mn;
          p.faceRef.c = j.c; p.faceRef.n = j.n;
          if (j.name) p.faceRef.name = j.name;
        }
      }
    }, { amend: true });
  }
  App.on('results', relinkMirrorStepFaces);
  function renderMirrorStep(it, sec, setP) {
    const p = it.p || {};
    const pl = p.plane || 'YZ';
    const datums = typeof Datums !== 'undefined' ? Datums.list().filter((d) => d.plane) : [];
    const curVal = pl === 'DATUM' ? ('d:' + (p.datumId || '')) : pl === 'FACE' ? 'FACE' : (['XY', 'XZ', 'YZ'].includes(pl) ? pl : 'YZ');
    const opts = [
      ['YZ', 'Links ↔ rechts (YZ)'],
      ['XZ', 'Vorne ↔ hinten (XZ)'],
      ['XY', 'Oben ↔ unten (XY)'],
      ...datums.map((d) => ['d:' + d.id, `Bezugsebene „${d.name}“`]),
    ];
    if (pl === 'DATUM' && p.datumId && !datums.some((d) => d.id === p.datumId)) {
      opts.push(['d:' + p.datumId, 'Bezugsebene (fehlt)']);
    }
    if (pl === 'FACE') {
      const fnm = p.faceRef && p.faceRef.name ? `Fläche an „${p.faceRef.name}“` : 'Gewählte Fläche';
      opts.push(['FACE', fnm]);
    }
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'ms-plane',
      label: 'Spiegelebene',
      value: curVal,
      options: opts,
      onChange: (v) => {
        if (v.startsWith('d:')) setMirrorStepPlane(it.id, { datumId: v.slice(2) });
        else if (v !== 'FACE') setMirrorStepPlane(it.id, { plane: v });
      },
    }));
    if (pl !== 'DATUM' && pl !== 'FACE') {
      fl.append(UI.numField({ id: 'ms-off', label: 'Lage der Ebene', value: p.off ?? 0, unit: 'mm', onCommit: (v) => setP('off', v) }));
    }
    sec.append(fl);
    if (pl === 'FACE') {
      const oTxt = Array.isArray(p.mo) ? p.mo.map((v) => fmt(v, 1)).join(' · ') : '–';
      const nTxt = Array.isArray(p.mn) ? p.mn.map((v) => fmt(v, 2)).join(' · ') : '–';
      const lbl = p.faceRef && p.faceRef.lost ? 'Spiegelfläche fehlt' : (p.faceRef && p.faceRef.name ? `Fläche an „${p.faceRef.name}“` : 'Gewählte Fläche');
      sec.append(h('div', { class: 'mini-row', id: 'ms-planeinfo' }, h('span', { class: 'grow' }, lbl), h('b', { class: 'mono' }, `${oTxt} (n ${nTxt})`)));
    }
    const pb = h('button', { type: 'button', class: 'btn small', id: 'ms-pick' });
    pb.innerHTML = icon('cursor') + 'Ebene oder Fläche im Bild wählen';
    pb.onclick = () => pickMirrorStepPlane(it.id);
    sec.append(h('div', { class: 'btn-row' }, pb));

    const cands = mirrorCandidatesBefore(it);
    const chosen = new Set(Array.isArray(p.features) ? p.features : []);
    const fsec = h('div', { class: 'field', id: 'ms-features', style: { marginTop: '8px' } }, h('label', null, 'Gespiegelte Schritte'));
    if (cands.length) {
      for (const c of cands) {
        const chk = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(c.id), dataset: { fid: c.id } }), Model.label(c));
        chk.querySelector('input').onchange = (e) => {
          const next = new Set(chosen);
          if (e.target.checked) next.add(c.id);
          else {
            if (next.size <= 1) {
              e.target.checked = true;
              UI.toast('Mindestens ein Schritt muss gewählt bleiben.', { icon: 'info' });
              return;
            }
            next.delete(c.id);
          }
          App.change('Gespiegelte Schritte geändert', (doc) => {
            const T = Model.find(doc, it.id)?.item; if (!T) return false;
            T.p.features = cands.filter((x) => next.has(x.id)).map((x) => x.id);
          });
        };
        fsec.append(chk);
      }
    } else {
      fsec.append(h('div', { class: 'hint-box warn' }, 'Vor diesem Schritt liegt kein spiegelbarer Formschritt.'));
    }
    sec.append(fsec);

    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const firstFid = (p.features || []).find((fid) => Model.find(App.doc, fid));
    if (firstFid) {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'ms-goto-feat' });
      fb.innerHTML = icon('pointer') + 'Original-Schritt wählen';
      fb.onclick = () => App.select([firstFid]);
      row.append(fb);
    }
    const merged = App.mergedInto(it.id);
    if (merged && Model.find(App.doc, merged)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'ms-goto-body' });
      gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([merged]);
      row.append(gb);
    }
    if (row.children.length) sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Spiegelt nur die gewählten Formschritte (z. B. eine Tasche, Erhöhung oder Rippe) direkt im selben Körper. Änderst du das Original, wandert das Spiegelbild automatisch mit.' }));
  }
  const isOp = (it) => !!(it && it.kind === 'group' && it.p && it.p.op);
  return { startRib, renderRib, ribTargets, mirrorStep, setMirrorStepPlane, pickMirrorStepPlane, renderMirrorStep, canMirrorStep, pickDatumPlaneAt, setRevolveToFace, pickRevolveFace, transform, renderTransform, scale, renderScale, thicken, renderThicken, pickThickenFace, guessThreadSize, threadOnFace, markThread, updateThread, removeThread, makeThreadReal, threadPop, route3d, routeAppend, stopRoute, finishRoute, get routing() { return route ? { pts: route.pts.map((q) => q.slice()), d: route.d } : null; }, setPatternAxis, pickAxis, pickAxisThen, makeFaceRef, pickTargetFaceAt, pickFaceThen, pickExtrudeFace, setExtrudeToFace, autoFlipDirForFace, get picking() { return !!picking || !!route; }, mirrorAtFace, patternPath, pathFromSketch, pattern, split, boolean, shell, renderOp, sizeText, isOp, NAMES };
})();
