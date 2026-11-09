// ================= Skizzen-Modus (Zeichnen auf einer Ebene) =================
const Sketch = (() => {
  let S = null;
  const TOOLS = [
    { id: 'select', icon: 'cursor', label: 'Auswahl', key: 'V', tip: 'Auswählen und Punkte verschieben' },
    { id: 'line', icon: 'line', label: 'Linie', key: 'L', tip: 'Linienzug zeichnen – am Startpunkt schließen' },
    { id: 'rect', icon: 'rect', label: 'Rechteck', key: 'R', tip: 'Rechteck von Ecke zu Ecke' },
    { id: 'circle', icon: 'circle', label: 'Kreis', key: 'C', tip: 'Kreis vom Mittelpunkt aus' },
    { id: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'E', tip: 'Ellipse: Mitte, erste Achse, dann zweite Achse' },
    { id: 'arc', icon: 'arc', label: 'Bogen', key: 'A', tip: 'Bogen: Start, Ende, dann Wölbung' },
    { id: 'slot', icon: 'slot', label: 'Langloch', key: 'G', tip: 'Langloch: zwei Mittelpunkte, dann Breite' },
    { id: 'poly', icon: 'polygon', label: 'Vieleck', key: 'P', tip: 'Regelmäßiges Vieleck vom Mittelpunkt aus' },
    { id: 'point', icon: 'point', label: 'Punkt', key: 'O', tip: 'Einzelner Punkt – z. B. als Mitte für Bohrungen oder als Bezug für Maße' },
    { id: 'tpl', icon: 'chip', label: 'Schablone', key: 'J', tip: 'Fertige Umrisse: Pin-Raster, Lüftungsgitter, Chips (QFP, QFN, BGA, SOIC, DIP), USB-C-Ausschnitte, Befestigungslöcher' },
    { id: 'text', icon: 'text', label: 'Text', key: 'B', tip: 'Schrift als Umriss – zum Prägen oder Ausschneiden' },
    { id: 'spline', icon: 'spline', label: 'Spline', key: 'S', tip: 'Spline: weiche Kurve durch Punkte – Enter beendet' },
    { id: 'corner', icon: 'fillet', label: 'Ecke runden', key: 'K', tip: 'Ecke zwischen zwei Linien runden oder fasen – auch an Rechteck und Vieleck', sep: true },
    { id: 'trim', icon: 'trim', label: 'Trimmen', key: 'T', tip: 'Überstehende Stücke wegschneiden' },
    { id: 'extend', icon: 'extend', label: 'Verlängern', key: 'U', tip: 'Linie bis zur nächsten Kante verlängern' },
    { id: 'splitl', icon: 'splitLine', label: 'Teilen', key: 'Y', tip: 'Linie oder Bogen an einem Punkt in zwei Stücke teilen' },
    { id: 'offset', icon: 'offset2d', label: 'Versatz', key: 'F', tip: 'Parallele Kopie im Abstand – bleibt per Regel verbunden' },
    { id: 'wall', icon: 'wall2d', label: 'Wand', key: 'N', tip: 'Aus einer offenen Linie eine Wand mit Dicke machen – z. B. Rippen und Stege' },
    { id: 'project', icon: 'projectEdge', label: 'Kante', key: 'Z', tip: 'Kante eines Körpers in die Skizze holen – als feste Linie, Bogen, Kreis oder Spline' },
    { id: 'mirror', icon: 'mirror', label: 'Spiegeln', key: 'M', tip: 'An einer Linie spiegeln – legt Symmetrie-Regeln an' },
    { id: 'patrect', icon: 'patternRect', label: 'Rechteckmuster', key: 'Q', tip: 'Elemente in Reihen und Spalten vervielfachen' },
    { id: 'patcirc', icon: 'patternCirc', label: 'Kreismuster', key: 'W', tip: 'Elemente im Kreis vervielfachen' },
    { id: 'dim', icon: 'dim', label: 'Maß', key: 'D', tip: 'Maß festlegen – auch als Formel wie breite/2', sep: true },
    { id: 'bg', icon: 'image', label: 'Bild-Vorlage', key: 'I', tip: 'Foto oder Zeichnung hinterlegen und auf echte Größe bringen – zum Nachzeichnen' },
  ];
  const HELPKEY = { wall: 'wall2d', project: 'project2d', splitl: 'split2d', extend: 'extend2d', tpl: 'sketchTemplate', corner: 'corner2d', text: 'sketchText', bg: 'sketchImage', poly: 'polygon', dim: 'dimension', offset: 'offset2d', mirror: 'mirror2d', patrect: 'patternRect2d', patcirc: 'patternCirc2d' };
  const HINTS = {
    select: 'Element anklicken zum Bearbeiten. Endpunkte lassen sich ziehen. <b>Entf</b> löscht.',
    line: 'Klick setzt Punkte. Zahl tippen für genaue Länge. Am Startpunkt schließen oder <b>Enter</b> zum Beenden.',
    rect: 'Erste Ecke klicken, dann die zweite. Oder Zahlen tippen: Breite <b>Tab</b> Höhe.',
    circle: 'Mittelpunkt klicken, dann Größe. Oder Durchmesser eintippen.',
    bg: 'Lade ein Foto oder eine Zeichnung als Vorlage. Mit <b>Maßstab festlegen</b> klickst du zwei Punkte an, deren Abstand du kennst – dann stimmt die Größe. Ziehen verschiebt das Bild.',
    bgcal: 'Klick den ersten Punkt auf dem Bild an, dann den zweiten. Danach tippst du den echten Abstand ein.',
    splitl: 'Klick auf eine Linie oder einen Bogen – dort wird das Element in zwei Stücke geteilt, die verbunden bleiben. Fängt an Mitte und Schnittpunkten.',
    extend: 'Klick nahe an das Ende einer Linie – sie wächst bis zur nächsten Linie, zum nächsten Bogen oder Kreis und bleibt dort per Regel hängen.',
    project: 'Klick auf eine Kante eines Körpers – sie kommt als feste Linie, Bogen, Kreis oder Spline in die Skizze und bleibt mit dem Körper verbunden.',
    wall: 'Dicke rechts einstellen, dann eine offene Linie, einen Bogen oder eine Spline anklicken – daraus wird eine geschlossene Wand zum Hochziehen. Die Linie bleibt als Hilfslinie in der Mitte.',
    point: 'Klick setzt einen Punkt. Punkte bilden keine Fläche, sind aber Bezug für Maße und Regeln. Auf einer Körperfläche werden reine Punkte beim „Fertig“ zu Bohrungen.',
    tpl: 'Schablone und Maße rechts wählen, dann ins Bild klicken – der Klick ist die Mitte. Fängt an Nullpunkt und Mittelpunkten.',
    text: 'Text, Höhe und Schrift rechts einstellen, dann ins Bild klicken. Der Klick legt den Anfang der Grundlinie fest (bei „Mitte“ die Mitte).',
    ellipse: 'Mittelpunkt klicken, dann das Ende der ersten Achse (legt Länge und Drehung fest), dann die Breite. Oder Breite <b>Tab</b> Höhe eintippen.',
    arc: 'Startpunkt, Endpunkt, dann die Wölbung klicken.',
    slot: 'Ersten und zweiten Mittelpunkt klicken, dann die Breite.',
    poly: 'Mittelpunkt klicken, dann Größe. Anzahl der Ecken rechts einstellen.',
    spline: 'Klick setzt die Punkte, durch die die Kurve läuft. Am ersten Punkt schließen, auf den letzten Punkt doppelklicken oder <b>Enter</b> zum Beenden.',
    corner: 'Fahr an eine <b>Ecke</b>, an der sich zwei Linien treffen – Rechteck und Vieleck gehen auch. <b>Klick</b> rundet sie mit dem Radius rechts. Fase statt Rundung stellst du rechts um.',
    trim: 'Fahr über ein Stück zwischen zwei Schnittpunkten – es leuchtet rot. <b>Klick</b> schneidet es weg, mit gedrückter Maustaste kannst du <b>wischen</b>.',
    offset: 'Klick eine Linie, einen Kreis oder eine Form an. Dann die Maus auf die Seite bewegen, auf die der Versatz soll, und klicken – oder den Abstand tippen und <b>Enter</b>.',
    mirror: 'Erst die <b>Spiegellinie</b> anklicken (eine Linie, auch eine Hilfslinie), dann die Elemente, die gespiegelt werden sollen. <b>Enter</b> spiegelt alles.',
    patrect: 'Klick die Elemente an, die vervielfacht werden sollen. Anzahl und Abstand stellst du rechts ein, dann <b>Enter</b>.',
    patcirc: 'Klick die Elemente an, die im Kreis vervielfacht werden sollen. Anzahl, Winkel und Mittelpunkt stellst du rechts ein, dann <b>Enter</b>.',
    dim: 'Klick auf eine Linie, eine Rechteck-Seite, einen Kreis oder Bogen und tipp das Maß ein – auch eine Formel wie <b>breite/2</b>. Für einen <b>Abstand</b> klickst du zwei Punkte an (oder Punkt und Linie), für einen <b>Winkel</b> zwei Linien.',
  };
  // Bedingungen (Regeln): zweite Leiste unter den Zeichenwerkzeugen
  const CTOOLS = [
    { id: 'horizontal', icon: 'cHoriz', label: 'Waagerecht', help: 'cHoriz' },
    { id: 'vertical', icon: 'cVert', label: 'Senkrecht', help: 'cVert' },
    { id: 'parallel', icon: 'cParallel', label: 'Parallel', help: 'cParallel' },
    { id: 'perpendicular', icon: 'cPerp', label: 'Rechtwinklig', help: 'cPerp' },
    { id: 'tangent', icon: 'cTangent', label: 'Tangential', help: 'cTangent' },
    { id: 'equal', icon: 'cEqual', label: 'Gleich', help: 'cEqual' },
    { id: 'symmetric', icon: 'cSymmetric', label: 'Symmetrisch', help: 'cSymmetric' },
    { id: 'coincident', icon: 'cCoincident', label: 'Deckungsgleich', help: 'cCoincident' },
    { id: 'midpoint', icon: 'cMid', label: 'Mittig', help: 'cMid' },
    { id: 'concentric', icon: 'cConcentric', label: 'Konzentrisch', help: 'cConcentric' },
    { id: 'fix', icon: 'cFix', label: 'Fixieren', help: 'cFix' },
    { id: 'project', icon: 'project', label: 'Kante übernehmen', help: 'project' },
  ];
  const CNAME = Object.fromEntries(CTOOLS.map((t) => [t.id, t.label]));
  const CICON = Object.fromEntries(CTOOLS.map((t) => [t.id, t.icon]));
  // Regeln, die Werkzeuge selbst anlegen (nicht in der Regel-Leiste)
  CNAME.xform = 'Muster'; CICON.xform = 'patternRect'; CNAME.offset = 'Versatz'; CICON.offset = 'offset2d';
  const CHINTS = {
    horizontal: 'Klick eine Linie an – oder zwei Punkte, die auf gleicher Höhe liegen sollen.',
    vertical: 'Klick eine Linie an – oder zwei Punkte, die genau übereinander liegen sollen.',
    parallel: 'Klick zwei Linien an, die parallel laufen sollen.',
    perpendicular: 'Klick zwei Linien an, die einen rechten Winkel bilden sollen.',
    tangent: 'Klick eine Linie und einen Kreis oder Bogen an – oder zwei Kreise, die sich berühren sollen.',
    equal: 'Klick zwei Linien (gleich lang) oder zwei Kreise (gleich groß) an.',
    symmetric: 'Klick zwei Punkte oder zwei Kreise an, dann die Linie, an der gespiegelt wird.',
    coincident: 'Klick zwei Punkte an – oder einen Punkt und dann die Linie oder den Kreis, auf dem er liegen soll.',
    fix: 'Klick ein Element oder einen Punkt an, das sich nicht mehr bewegen soll.',
    midpoint: 'Klick einen Punkt (oder Kreis) an, dann die Linie, auf deren Mitte er liegen soll.',
    concentric: 'Klick zwei Kreise, Bögen oder Ellipsen an – sie bekommen denselben Mittelpunkt.',
    project: 'Klick eine gestrichelte Kante der Fläche an – sie wird zu einer festen Linie deiner Skizze.',
  };
  for (const k in CHINTS) HINTS['c:' + k] = '<b>' + CNAME[k] + ':</b> ' + CHINTS[k];
  CHINTS.xform = 'Die Kopie folgt ihrem Original: Ändert sich das Original, wandert die Kopie mit. Den Abstand bzw. Winkel kannst du hier ändern.';
  CHINTS.offset = 'Die Kopie bleibt im festen Abstand zum Original. Ändert sich das Original, wandert die Kopie mit. Den Abstand kannst du hier ändern.';
  // ---------- Start ----------
  function chooseAndStart() {
    Panels.closeFlyout();
    const face = Actions.selectedFace();
    if (face && face.info.t === 'PLANE') { startOnFace(face); return; }
    const btn = $('#t-sketch');
    const box = h('div', { style: { display: 'grid', gap: '10px' } });
    box.append(h('b', null, 'Wo möchtest du zeichnen?'));
    box.append(h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, 'Tipp: Klick eine flache Fläche eines Körpers an und wähle „Skizze hierauf“, um direkt darauf zu zeichnen.'));
    const row = h('div', { class: 'btn-row' });
    let off = 0;
    const mk = (label, pl) => { const b = h('button', { type: 'button', class: 'btn' }, label); b.onclick = () => { UI.closePop(); startOnPlane(pl, off); }; return b; };
    row.append(mk('Auf der Arbeitsfläche', 'XY'), mk('Stehend (vorne)', 'XZ'), mk('Stehend (seitlich)', 'YZ'));
    box.append(UI.numField({ id: 'sk-off', label: 'Abstand vom Nullpunkt (Ebene verschieben)', value: 0, unit: 'mm', expr: false, onCommit: (v) => { off = v; } }));
    box.append(row);
    // Konstruktionsebenen an Körpern
    const row2 = h('div', { class: 'btn-row' });
    const pk = (id, label, kind) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); startPlanePick(kind); }; return b; };
    row2.append(pk('sk-mid', 'Mittig zwischen zwei Flächen', 'mid'), pk('sk-3p', 'Durch drei Punkte', '3p'));
    box.append(row2);
    UI.pop(btn, box);
  }
  const PLANES = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  // ---------- Konstruktionsebenen: mittig zwischen zwei parallelen Flächen oder durch drei Punkte auf Körpern ----------
  let planePick = null;
  function stopPlanePick() {
    if (!planePick) return;
    Viewer.canvas.removeEventListener('pointerdown', planePick.down, true); window.removeEventListener('keydown', planePick.key, true);
    for (const m of planePick.marks) { Viewer.groups.overlay.remove(m); m.geometry.dispose(); m.material.dispose(); }
    Viewer.canvas.style.cursor = ''; UI.hint(null); Viewer.highlightFace('sel', null, null); planePick = null; Viewer.requestRender();
  }
  // Punkt auf einem Körper: Ecken und Kantenmitten in der Nähe der Maus rasten ein (12 Bildpunkte)
  function bodyPoint(hit, cx, cy) {
    const n = hit.node, r = Viewer.canvas.getBoundingClientRect(); let best = null;
    for (const g of (n && n.data && n.data.edges) || []) for (const q of [g.a, g.b, g.m]) {
      if (!q) continue;
      const w = new THREE.Vector3(...q).applyMatrix4(n.obj.matrixWorld), sc = Viewer.toScreen(w), d = Math.hypot(sc.x + r.left - cx, sc.y + r.top - cy);
      if (d < 12 && (!best || d < best.d)) best = { w, d };
    }
    return best ? best.w : hit.faceIdx >= 0 ? hit.point.clone() : null;
  }
  function startPlanePick(kind) {
    stopPlanePick(); if (S) cancel();
    const need = kind === 'mid' ? 2 : 3, got = [], marks = [];
    const hint = () => UI.hint(kind === 'mid' ? `<b>Mittelebene:</b> Klick ${got.length ? 'die zweite' : 'die erste'} flache Fläche (beide parallel). <b>Esc</b> bricht ab.` : `<b>Ebene durch drei Punkte:</b> Klick Punkt ${got.length + 1} von 3 auf einem Körper – Ecken und Kantenmitten rasten ein. <b>Esc</b> bricht ab.`);
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: kind === 'mid', solidsOnly: true });
      if (!hit) { UI.toast(kind === 'mid' ? 'Klick eine flache Fläche eines Körpers.' : 'Klick auf einen Körper.', { icon: 'info', ms: 1600 }); return; }
      if (kind === 'mid') {
        const r = App.results.get(hit.id), info = r && r.data && r.data.faces[hit.faceIdx];
        if (!info || info.t !== 'PLANE' || !info.n) { UI.toast('Klick eine flache Fläche.', { icon: 'info', ms: 1600 }); return; }
        const W = Model.worldMatrix(App.doc, hit.id), fr = Actions.faceFrame(info);
        got.push({ c: new THREE.Vector3(...info.c).applyMatrix4(W), n: new THREE.Vector3(...info.n).transformDirection(W).normalize(), x: new THREE.Vector3(...fr.x).transformDirection(W).normalize() });
        Viewer.highlightFace('sel', hit.id, hit.faceIdx);
      } else {
        const p = bodyPoint(hit, e.clientX, e.clientY); if (!p) return;
        got.push(p);
        const m = new THREE.Mesh(new THREE.SphereGeometry(Viewer.pixelSizeAt(p) * 5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e0457b'), depthTest: false }));
        m.position.copy(p); m.renderOrder = 41; Viewer.groups.overlay.add(m); marks.push(m); Viewer.requestRender();
      }
      if (got.length < need) { hint(); return; }
      const pl = kind === 'mid' ? midPlane(got) : plane3(got);
      stopPlanePick();
      if (!pl) { UI.toast(kind === 'mid' ? 'Die beiden Flächen sind nicht parallel – eine Mittelebene gibt es nur zwischen parallelen Flächen.' : 'Die drei Punkte liegen auf einer Linie – sie spannen keine Ebene auf.', { kind: 'bad' }); return; }
      begin({ plane: pl, W: new THREE.Matrix4(), ents: [], refs: [], ctx: { mode: 'new', targetId: null } });
      UI.toast(kind === 'mid' ? 'Skizze auf der Mittelebene – genau zwischen den beiden Flächen.' : 'Skizze auf der Ebene durch die drei Punkte.', { icon: 'check' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPlanePick(); } };
    planePick = { down, key, marks };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    hint();
  }
  const r6v = (v) => v.toArray().map((x) => round(x, 6));
  function midPlane([A, B]) {
    if (Math.abs(A.n.dot(B.n)) < 0.999) return null;
    const d = B.c.clone().sub(A.c).dot(A.n);
    return { o: r6v(A.c.clone().addScaledVector(A.n, d / 2)), x: r6v(A.x), n: r6v(A.n) };
  }
  function plane3([a, b, c]) {
    const u = b.clone().sub(a), v = c.clone().sub(a), n = u.clone().cross(v);
    if (n.length() < 1e-6 * Math.max(1, u.length() * v.length())) return null;
    n.normalize();
    // Normale möglichst nach oben (sonst zur Kamera), damit „Hochziehen“ nach außen geht
    if (Math.abs(n.z) > 1e-6 ? n.z < 0 : n.dot(Viewer.camera.position.clone().sub(a)) < 0) n.negate();
    return { o: r6v(a), x: r6v(u.normalize()), n: r6v(n) };
  }
  function startOnPlane(name, off = 0) {
    const pl = PLANES[name];
    begin({ plane: deepClone(pl), W: new THREE.Matrix4(), ents: [], refs: [], ctx: { mode: 'new', targetId: null }, pOff: off || 0 });
  }
  // Konstruktionsebene: Grundebene um einen Abstand verschieben und um ihre X-Achse neigen
  function applyPlane(look, noRender) {
    const P = S.plane0, n0 = new THREE.Vector3(...P.n).normalize(), x0 = new THREE.Vector3(...P.x).normalize(), y0 = new THREE.Vector3().crossVectors(n0, x0);
    const a = ((S.pTilt || 0) * Math.PI) / 180;
    const n = n0.clone().multiplyScalar(Math.cos(a)).addScaledVector(y0, -Math.sin(a));
    const o = new THREE.Vector3(...P.o).addScaledVector(n0, S.pOff || 0);
    S.plane = { ...deepClone(P), o: o.toArray().map((v) => round(v, 6)), x: x0.toArray(), n: n.toArray().map((v) => round(v, 9)) };
    S.F = frameWorld(S.plane, S.W);
    if (look) Viewer.lookAtPlane(S.F.o.toArray(), S.F.n.toArray(), S.F.x.toArray(), Math.max(40, (Viewer.camera.position.distanceTo(S.F.o) || 100) * 0.5));
    if (!noRender) render();
  }
  async function loopsOf(face) {
    const r = App.results.get(face.id);
    if (!r) return [];
    try { return await Kernel.call('faceLoops', { key: r.key, faceIdx: face.idx }); }
    catch (e) { UI.toast(e.message, { kind: 'bad' }); return null; }
  }
  async function startOnFace(face) {
    const loops = await loopsOf(face); if (loops == null) return;
    const fr = Actions.faceFrame(face.info);
    const plane = { o: fr.o, x: fr.x, n: fr.n };
    const W = Model.worldMatrix(App.doc, face.id);
    const refs = SK.faceLoopsToEnts({ o: fr.o, x: fr.x, y: fr.y }, loops);
    begin({ plane, W, ents: [], refs, ctx: { mode: 'new', targetId: face.id } });
  }
  function editItem(id) {
    const f = Model.find(App.doc, id); if (!f || !f.item.p.sketch) return;
    const W = Model.worldMatrix(App.doc, id);
    begin({ plane: deepClone(f.item.p.sketch.plane), W, ents: deepClone(f.item.p.sketch.ents), dims: deepClone(f.item.p.sketch.dims || []), cons: deepClone(f.item.p.sketch.cons || []), bg: f.item.p.sketch.bg, refs: [], ctx: { mode: 'edit', editId: id } });
    if (f.item.kind === 'group') return;   // Muster entlang Kurve: Original und Kopien bleiben sichtbar
    // Körper während des Bearbeitens ausblenden
    S.hiddenEdit = id;
    const top = Model.topOf(App.doc, id);
    if (top && top.id === id) Viewer.updateNode(id, { visible: false });
  }
  // Kurve für „Muster entlang Kurve“ zeichnen (o: { plane, W, ents, ids })
  function startPath(o) {
    begin({ plane: o.plane, W: o.W, ents: o.ents || [], dims: [], cons: [], refs: [], viewSize: o.viewSize, ctx: { mode: 'patpath', ids: o.ids } });
    UI.toast('Zeichne die Kurve, an der die Kopien entlanglaufen – Linie, Bogen, Spline oder Kreis. Dann „Fertig“.', { icon: 'info', ms: 4200 });
  }
  // Mittellinie für einen Übergang: Ebene durch den ersten Umriss, in der auch der letzte liegt; vorgezeichnet als Spline durch die Mitten
  let lpKey = '';
  // kind 'path' = Mittellinie, 'rail' = Führungskurve (Seitenlinie, der der Übergang zwischen den Umrissen folgt)
  // 'rail2' = zweite Führungskurve, quer zur ersten (z. B. von oben, wenn die erste von der Seite kommt)
  const LOFTMODE = { path: 'loftpath', rail: 'loftrail', rail2: 'loftrail2' };
  const isLoftLine = () => !!S && (S.ctx.mode === 'loftpath' || S.ctx.mode === 'loftrail' || S.ctx.mode === 'loftrail2');
  const railKey = () => (S.ctx.mode === 'loftrail2' ? 'rail2' : S.ctx.mode === 'loftrail' ? 'rail' : null);
  function startLoftPath(id, kind = 'path') {
    const f = Model.find(App.doc, id); if (!f || f.item.kind !== 'loft') return false;
    const key = kind === 'rail' || kind === 'rail2' ? kind : 'path';
    if (key === 'rail2' && !f.item.p.rail) return startLoftPath(id, 'rail');
    const it = f.item, V = Model.vars(App.doc).v;
    const Y = (pl) => { const n = pl.n, x = pl.x; return [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]]; };
    const W3 = (pl, q) => { const y = Y(pl); return [0, 1, 2].map((k) => pl.o[k] + pl.x[k] * q[0] + y[k] * q[1]); };
    const prof = [];
    for (const sk of it.p.sketches || []) {
      const regs = SK.regions(Solver.cached(sk, V).ents).sort((a, b) => b.area - a.area); if (!regs.length) continue;
      const poly = regs[0].outer.poly; let cx = 0, cy = 0; for (const q of poly) { cx += q[0]; cy += q[1]; } cx /= poly.length || 1; cy /= poly.length || 1;
      prof.push({ c: W3(sk.plane, [cx, cy]), n: sk.plane.n.slice(), pts: poly.map((q) => W3(sk.plane, q)) });
    }
    if (prof.length < 2) { UI.toast(`Für eine ${key !== 'path' ? 'Führungskurve' : 'Mittellinie'} braucht der Übergang mindestens zwei Umrisse.`, { kind: 'bad', icon: 'info' }); return false; }
    let plane, ents = [], dims = [], cons = [];
    const old = it.p[key];
    if (old) { plane = deepClone(old.plane); ents = deepClone(old.ents || []); dims = deepClone(old.dims || []); cons = deepClone(old.cons || []); }
    else if (key === 'rail2') {
      // quer zur ersten Führungskurve: Ebene durch die Achse, deren Normale die Richtung der ersten Kurve ist
      const C0 = prof[0].c, C1 = prof[prof.length - 1].c, D = new THREE.Vector3(C1[0] - C0[0], C1[1] - C0[1], C1[2] - C0[2]).normalize();
      const n1 = new THREE.Vector3(...it.p.rail.plane.n), n2 = n1.clone().cross(D);
      if (n2.length() < 0.2) { UI.toast('Die erste Führungskurve liegt ungünstig – eine zweite geht hier nicht.', { kind: 'bad', icon: 'info' }); return false; }
      n2.normalize();
      const std = ['XZ', 'YZ', 'XY'].find((k) => Math.abs(new THREE.Vector3(...PLANES[k].n).dot(n2)) > 0.999);
      if (std) { const B = PLANES[std], off = B.n[0] * C0[0] + B.n[1] * C0[1] + B.n[2] * C0[2]; plane = { o: B.n.map((v) => round(v * off, 6)), x: B.x.slice(), n: B.n.slice() }; }
      else plane = { o: C0.map((v) => round(v, 6)), x: D.toArray().map((v) => round(v, 9)), n: n2.toArray().map((v) => round(v, 9)) };
    } else {
      const C0 = prof[0].c, C1 = prof[prof.length - 1].c, D = new THREE.Vector3(C1[0] - C0[0], C1[1] - C0[1], C1[2] - C0[2]).normalize();
      // bevorzugt „Stehend (vorne)“, dann „seitlich“, dann „Arbeitsfläche“ – die, in der die Verbindung am besten liegt
      const cand = ['XZ', 'YZ', 'XY'].map((k) => ({ k, d: Math.abs(new THREE.Vector3(...PLANES[k].n).dot(D)) }));
      const best = Math.min(...cand.map((c) => c.d)), pk = cand.find((c) => c.d <= best + 1e-6).k, B = PLANES[pk];
      const off = B.n[0] * C0[0] + B.n[1] * C0[1] + B.n[2] * C0[2];
      plane = { o: B.n.map((v) => round(v * off, 6)), x: B.x.slice(), n: B.n.slice() };
    }
    const y = Y(plane), to2 = (P) => { const d = [P[0] - plane.o[0], P[1] - plane.o[1], P[2] - plane.o[2]]; return [round(d[0] * plane.x[0] + d[1] * plane.x[1] + d[2] * plane.x[2], 4), round(d[0] * y[0] + d[1] * y[1] + d[2] * y[2], 4)]; };
    if (!old && key !== 'path') {
      // Führungskurve: Spline durch die äußerste Stelle jedes Umrisses (der Übergang bleibt so zunächst gleich), dazwischen je ein Punkt zum Ziehen
      const R3 = Model.railStart(it, V, plane);
      if (!R3) { UI.toast('Die Umrisse liegen dafür ungünstig – die Führungskurve braucht eine Ebene, die die Achse vom ersten zum letzten Umriss enthält.', { kind: 'bad', icon: 'info' }); return false; }
      const pts = R3.map(to2), out = [pts[0]];
      for (let i = 1; i < pts.length; i++) out.push([round((pts[i - 1][0] + pts[i][0]) / 2, 4), round((pts[i - 1][1] + pts[i][1]) / 2, 4)], pts[i]);
      ents = [{ id: uid('e'), type: 'spline', pts: out, closed: false }];
    } else if (!old) {
      // Spline durch die Mitten; kurz hinter dem ersten und vor dem letzten Umriss je ein Hilfspunkt in Richtung der Umriss-Normale,
      // damit die Linie senkrecht aus den Umrissen herausläuft – auch wenn man die Mitte wegzieht
      const pts = prof.map((q) => to2(q.c)), m = pts.length;
      const L = Math.hypot(pts[m - 1][0] - pts[0][0], pts[m - 1][1] - pts[0][1]) || 1;
      const nd = (q, toward) => { const v = [q.n[0] * plane.x[0] + q.n[1] * plane.x[1] + q.n[2] * plane.x[2], q.n[0] * y[0] + q.n[1] * y[1] + q.n[2] * y[2]]; const l = Math.hypot(v[0], v[1]); if (l < 0.3) return null; const s0 = v[0] * toward[0] + v[1] * toward[1] < 0 ? -1 : 1; return [(s0 * v[0]) / l, (s0 * v[1]) / l]; };
      const a = nd(prof[0], [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]), b = nd(prof[m - 1], [pts[m - 1][0] - pts[m - 2][0], pts[m - 1][1] - pts[m - 2][1]]);
      const k = L * (m === 2 ? 0.2 : 0.12), out = [pts[0]];
      if (a) out.push([round(pts[0][0] + a[0] * k, 4), round(pts[0][1] + a[1] * k, 4)]);
      if (m === 2) out.push([round((pts[0][0] + pts[1][0]) / 2, 4), round((pts[0][1] + pts[1][1]) / 2, 4)]);
      else out.push(...pts.slice(1, -1));
      if (b) out.push([round(pts[m - 1][0] - b[0] * k, 4), round(pts[m - 1][1] - b[1] * k, 4)]);
      out.push(pts[m - 1]);
      ents = [{ id: uid('e'), type: 'spline', pts: out, closed: false }];
    }
    // Wo die Umrisse stehen: je Umriss eine Hilfskante (die zwei am weitesten auseinanderliegenden Randpunkte in der Ebene)
    const refs = [];
    for (const q of prof) {
      const P = q.pts.map(to2); let a = P[0], b = P[0], dm = -1;
      const step = Math.max(1, Math.floor(P.length / 80));
      for (let i = 0; i < P.length; i += step) for (let j = i + 1; j < P.length; j += step) { const d = SK.d2(P[i], P[j]); if (d > dm) { dm = d; a = P[i]; b = P[j]; } }
      if (dm > 1e-6) refs.push({ id: uid('r'), type: 'line', a, b });
    }
    lpKey = '';
    const bb = SK.bounds([...ents, ...refs]), ext = bb ? Math.max(bb[2] - bb[0], bb[3] - bb[1]) : 40;
    begin({ plane, W: Model.worldMatrix(App.doc, id), ents, dims, cons, refs, viewSize: Math.max(60, ext * 1.7), ctx: { mode: LOFTMODE[key], id } });
    S.hiddenEdit = id;
    const top = Model.topOf(App.doc, id); if (top && top.id === id) Viewer.updateNode(id, { visible: false });
    loftPreview();
    if (key === 'rail2') UI.toast(old ? 'Zieh die zweite Führungskurve – der Übergang folgt beiden. Dann „Fertig“.' : 'Die zweite Führungskurve steht quer zur ersten – z. B. von oben, wenn die erste von der Seite kommt. Zieh ihre Punkte, dann „Fertig“.', { icon: 'info', ms: 4200 });
    else if (key === 'rail') UI.toast(old ? 'Zieh die Führungskurve – der Übergang folgt ihr. Dann „Fertig“.' : 'Die Führungskurve läuft an der Seite der Umrisse entlang. Zieh die Punkte dazwischen nach außen oder innen – der Übergang folgt. Dann „Fertig“.', { icon: 'info', ms: 4200 });
    else UI.toast(it.p.path ? 'Bieg die Mittellinie – der Übergang folgt ihr. Dann „Fertig“.' : 'Die Mittellinie läuft durch die Mitten der Umrisse. Zieh ihre Punkte, um den Übergang zu biegen – dann „Fertig“.', { icon: 'info', ms: 4200 });
    return true;
  }
  // Vorschau: der Übergang mit der gerade gezeichneten Mittellinie
  const loftPreview = debounce(() => {
    if (!isLoftLine()) return;
    const k = JSON.stringify([S.ents, S.plane, S.dims]); if (k === lpKey) return; lpKey = k;
    const f = Model.find(App.doc, S.ctx.id); if (!f) return;
    const it = deepClone(f.item), sk = { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons) };
    const rk = railKey(); if (rk) { it.p[rk] = sk; delete it.p.path; } else { it.p.path = sk; delete it.p.rail; delete it.p.rail2; }
    Model.setFromMatrix(it, S.W); it.id = '__preview'; it.finishes = [];
    App.extra = SK.chains(S.ents).length ? [it] : []; App.rebuild();
  }, 250);
  const pathGroup = () => { if (!S || S.ctx.mode !== 'edit') return null; const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.pt === 'path' ? f.item : null; };
  const isPathEdit = () => !!(S && S.ctx.mode === 'edit' && (() => { const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.pt === 'path'; })());
  async function pushPullFace(face) {
    const loops = await loopsOf(face); if (loops == null) return;
    const fr = Actions.faceFrame(face.info);
    const plane = { o: fr.o, x: fr.x, n: fr.n };
    const ents = SK.faceLoopsToEnts({ o: fr.o, x: fr.x, y: fr.y }, loops);
    if (!SK.regions(ents).length) { UI.toast('Diese Fläche kann ich nicht herausziehen.', { kind: 'bad' }); return; }
    begin({ plane, W: Model.worldMatrix(App.doc, face.id), ents, refs: [], ctx: { mode: 'pushpull', targetId: face.id } }, true);
    extrudeStep({ dist: 5, dir: 'normal', fromPushPull: true });
  }
  function frameWorld(plane, W) {
    const o = new THREE.Vector3(...plane.o).applyMatrix4(W);
    const x = new THREE.Vector3(...plane.x).transformDirection(W).normalize();
    const n = new THREE.Vector3(...plane.n).transformDirection(W).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    return { o, x, y, n };
  }
  function begin(init, skipDraw) {
    Views.collapse();
    if (S) cancel(true);
    if (Notes.active) Notes.stop();
    Panels.closeFlyout(); UI.closePop();
    const F = frameWorld(init.plane, init.W);
    S = { ...init, F, tool: skipDraw || init.ctx.mode === 'edit' || ((init.ctx.mode === 'loftpath' || init.ctx.mode === 'loftrail' || init.ctx.mode === 'loftrail2') && init.ents.length) ? 'select' : init.ctx.mode === 'patpath' ? 'line' : 'rect', draft: null, sel: null, cam: Viewer.saveCamera(), undo: [], polySides: 6, construction: false, step: null, hover: null, snapSet: defaultSnapSet(), pat: { nx: 3, dx: 10, ny: 1, dy: 10, n: 6, ang: 360 }, corner: { mode: 'fillet', r: 2 }, txt: { s: 'Tracery', h: 5, font: 'inter', align: 'l' }, tpl: { type: 'qfp', p: { ...SKO.TEMPLATES.qfp.p } }, wallT: 2, bg: init.bg ? deepClone(init.bg) : null, patSel: [], patCenter: null, patPick: false, mir: null, hoverEnt: null, trimHover: null };
    S.dims = init.dims || []; S.cons = init.cons || []; S.picks = []; S.dimFirst = null; S.selCon = null;
    S.plane0 = deepClone(init.plane); S.pOff = init.pOff || 0; S.pTilt = 0;
    if (S.pOff) applyPlane(false, true);
    reapply();   // Maße mit den aktuellen Werten aus „Maße“ nachrechnen
    App.clearSelection();
    Viewer.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    document.body.classList.add('sketching');
    buildGroup();
    const b = SK.bounds([...S.ents, ...S.refs]);
    const size = init.viewSize || (b ? Math.max(40, Math.max(b[2] - b[0], b[3] - b[1]) * 0.75) : 70);
    const c2 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
    const cw = S.F.o.clone().addScaledVector(S.F.x, c2[0]).addScaledVector(S.F.y, c2[1]);
    Viewer.lookAtPlane(cw.toArray(), S.F.n.toArray(), S.F.x.toArray(), size);
    if (!skipDraw) showBar();
    App.emit('mode');
    Panels.renderRight(); Panels.renderCtx(); Handles.clear();
    UI.hint(HINTS[S.tool]);
    render();
  }
  // ---------- Leiste ----------
  let bar = null;
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar', role: 'toolbar', 'aria-label': 'Skizzenwerkzeuge' });
    bar.append(h('span', { class: 'title' }, 'Skizze'));
    const vsep = () => h('span', { class: 'vsep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)', margin: '4px 4px' } });
    for (const t of TOOLS) {
      if (t.sep) bar.append(vsep());
      const hk = HELPKEY[t.id] || t.id;
      const b = h('button', { type: 'button', class: 'tool' + (S.tool === t.id ? ' active' : ''), 'data-tip': t.tip, 'data-kbd': t.key, 'aria-label': t.label, dataset: { tool: t.id, help: hk } });
      b.innerHTML = icon(t.icon) + `<span>${t.label}</span>`;
      b.onclick = () => setTool(t.id);
      bar.append(b);
    }
    const cb = h('button', { type: 'button', class: 'tool conmode' + (S.construction ? ' active' : ''), 'aria-pressed': S.construction ? 'true' : 'false', 'data-tip': 'Hilfslinie: neue Elemente als Hilfslinien zeichnen – oder das gewählte Element umwandeln', 'data-kbd': 'X', 'aria-label': 'Hilfslinie', dataset: { help: 'construct2d' } });
    cb.innerHTML = icon('construct') + '<span>Hilfslinie</span>'; cb.onclick = () => toggleConstruction();
    bar.append(vsep(), cb, vsep());
    const un = h('button', { type: 'button', class: 'tool', 'data-tip': 'Rückgängig', 'data-kbd': 'Strg Z', 'aria-label': 'Rückgängig' }); un.innerHTML = icon('undo'); un.onclick = () => sketchUndo();
    const cn = h('button', { type: 'button', class: 'tool', 'data-tip': 'Skizze verwerfen (Abbrechen)', 'aria-label': 'Abbrechen' }); cn.innerHTML = icon('close'); cn.onclick = () => cancel();
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-tip': 'Skizze fertig – weiter zum Hochziehen', 'data-kbd': 'Enter' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = () => done();
    bar.append(un, cn, ok);
    bars = h('div', { class: 'skbars' });
    bars.append(bar);
    $('#overlay').append(bars);
    // zweite Leiste: Regeln
    cbar = h('div', { class: 'consbar vert', role: 'toolbar', 'aria-label': 'Regeln', 'aria-orientation': 'vertical' });
    cbar.append(h('span', { class: 'title' }, 'Regeln'));
    for (const t of CTOOLS) {
      if (t.id === 'project' && !S.refs.length) continue;
      const b = h('button', { type: 'button', class: 'tool' + (S.tool === 'c:' + t.id ? ' active' : ''), 'data-tip': t.label, 'aria-label': t.label, dataset: { tool: 'c:' + t.id, help: t.help } });
      b.innerHTML = icon(t.icon);
      b.onclick = () => quickOrTool(t.id);
      cbar.append(b);
    }
    $('#overlay').append(cbar);
  }
  let cbar = null;
  let bars = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } if (cbar) { cbar.remove(); cbar = null; } if (bars) { bars.remove(); bars = null; } }
  function setTool(id) {
    if (!S) return;
    commitDraftPolyline();
    S.tool = id; S.draft = null; S.picks = []; S.dimFirst = null; hideEntry(); hideDimBox();
    S.mir = null; S.patSel = []; S.patPick = false; S.trimHover = null; S.trimming = false; S.hoverEnt = null;
    for (const el of [bar, cbar]) if (el) $$('.tool[data-tool]', el).forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    UI.hint(HINTS[id]); Panels.renderRight(); render();
  }
  // ---------- Umrechnung ----------
  function toWorld(u, v) { return S.F.o.clone().addScaledVector(S.F.x, u).addScaledVector(S.F.y, v); }
  function toUV(p) { const d = p.clone().sub(S.F.o); return [d.dot(S.F.x), d.dot(S.F.y)]; }
  function mouseUV(e) { const p = Viewer.rayPlane(e.clientX, e.clientY, S.F.o, S.F.n); return p ? toUV(p) : null; }
  function pxSize() { return Viewer.pixelSizeAt(S.F.o); }
  // ---------- Einrasten (Fangen) ----------
  // Jede Art von Fangpunkt lässt sich rechts ausschalten; mit gedrückter Alt-Taste wird gar nicht gefangen.
  const SNAPNAMES = { end: 'Endpunkt', mid: 'Mitte', center: 'Mittelpunkt', quad: 'Kreispunkt', origin: 'Ursprung', cross: 'Schnittpunkt', curve: 'Auf Linie', perp: 'Lot', tangent: 'Tangente' };
  const SNAPGROUP = { end: 'end', origin: 'end', mid: 'mid', center: 'center', quad: 'quad', cross: 'cross', curve: 'curve', perp: 'perp', tangent: 'tangent' };
  // kleiner Wert = stärker (wird zum Abstand addiert): Ecken und Schnittpunkte vor Mitten vor „irgendwo auf der Linie“
  const SNAPRANK = { end: 0, origin: 0, center: 0, cross: 0, mid: 0.25, perp: 0.35, tangent: 0.35, quad: 0.5, curve: 0.9 };
  const SNAPLIST = [['end', 'Endpunkte'], ['mid', 'Mitten'], ['center', 'Mittelpunkte'], ['quad', 'Kreispunkte'], ['cross', 'Schnittpunkte'], ['curve', 'Auf Linien und Kurven'], ['perp', 'Lot (rechtwinklig)'], ['tangent', 'Tangenten an Kreise'], ['align', 'Ausrichtung zu anderen Punkten'], ['grid', 'Raster']];
  function defaultSnapSet() { const o = {}; for (const [k] of SNAPLIST) o[k] = true; return o; }
  let crossCache = null;
  function crossings() {
    const k = JSON.stringify(S.ents) + '|' + S.refs.length;
    if (!crossCache || crossCache.k !== k) crossCache = { k, v: SKO.intersections(S.ents, S.refs) };
    return crossCache.v;
  }
  // Startpunkt des gerade gezeichneten Stücks – davon aus gelten Lot und Tangente
  function snapFrom() {
    const d = S.draft; if (!d) return null;
    if (d.pts && d.pts.length) return d.pts[d.pts.length - 1];
    if (d.a && !d.b && (S.tool === 'arc' || S.tool === 'slot')) return d.a;
    return null;
  }
  function snap(uv, opts = {}) {
    if (opts.off) return { p: uv.slice(), guides: [], kind: null };
    const set = S.snapSet || defaultSnapSet();
    const tol = pxSize() * 11;
    const list = S.ents.filter((e) => !opts.exclude || !opts.exclude.includes(e.id));
    const pts = SK.snapPoints(list, S.refs);
    if (S.draft && S.draft.pts) for (const p of S.draft.pts) pts.push({ p, type: 'end' });
    const cands = [];
    const consider = (p, type) => { if (set[SNAPGROUP[type]] === false) return; const d = SK.d2(p, uv); if (d < tol) cands.push({ p, type, d, score: d + SNAPRANK[type] * tol * 0.5 }); };
    for (const c of pts) consider(c.p, c.type);
    if (set.cross !== false) for (const x of crossings()) if (!opts.exclude || !(opts.exclude.includes(x.a) || opts.exclude.includes(x.b))) consider(x.p, 'cross');
    const from = snapFrom();
    if (from && !opts.noLot) {
      if (set.perp !== false) for (const f of SKO.perpFeet(from, [...list, ...S.refs])) consider(f.p, 'perp');
      if (set.tangent !== false) for (const f of SKO.tangentFeet(from, [...list, ...S.refs])) consider(f.p, 'tangent');
    }
    if (!cands.length && set.curve !== false) { const nr = SKO.nearestOn([...list, ...S.refs], uv, tol * 0.7); if (nr) cands.push({ p: nr.p, type: 'curve', d: SK.d2(nr.p, uv), score: 1 }); }
    if (cands.length) {
      cands.sort((a, b) => a.score - b.score);
      const best = cands[0];
      return { p: best.p.slice(), tip: SNAPNAMES[best.type], kind: best.type };
    }
    // Ausrichtung an vorhandenen Punkten
    let p = uv.slice(), guides = [];
    let gx = null, gy = null, dx = tol * 0.7, dy = tol * 0.7;
    if (set.align !== false) for (const c of pts) {
      if (Math.abs(c.p[0] - uv[0]) < dx) { dx = Math.abs(c.p[0] - uv[0]); gx = c.p; }
      if (Math.abs(c.p[1] - uv[1]) < dy) { dy = Math.abs(c.p[1] - uv[1]); gy = c.p; }
    }
    const grid = set.grid === false || App.doc.settings.snap === false ? 0 : (opts.fine ? 0.1 : App.doc.settings.grid || 1);
    if (grid) { p = [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid]; }
    if (gx) { p[0] = gx[0]; guides.push([gx, [gx[0], p[1]]]); }
    if (gy) { p[1] = gy[1]; guides.push([gy, [p[0], gy[1]]]); }
    return { p, guides, kind: grid ? 'grid' : null };
  }
  function angleSnap(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy); if (L < 1e-9) return { p: b, tip: null };
    const ang = Math.atan2(dy, dx); const deg = (ang * 180) / Math.PI;
    for (const t of [0, 90, 180, -90, -180]) {
      if (Math.abs(deg - t) < 2.5) { const r = (t * Math.PI) / 180; return { p: [a[0] + Math.cos(r) * L, a[1] + Math.sin(r) * L], tip: t === 0 || Math.abs(t) === 180 ? 'waagerecht' : 'senkrecht' }; }
    }
    return { p: b, tip: null };
  }
  // ---------- Zeichnen ----------
  function pushUndo() { S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons })); if (S.undo.length > 100) S.undo.shift(); }
  function sketchUndo() {
    if (S.draft && S.draft.pts && S.draft.pts.length > 1 && S.tool === 'line') { S.draft = null; render(); return; }
    const last = S.undo.pop(); if (last == null) return;
    const st = JSON.parse(last); S.ents = st.ents; S.dims = st.dims || []; S.cons = st.cons || []; S.sel = null; S.selCon = null; S.draft = null; S.picks = []; reapply(); render(); Panels.renderRight();
  }
  function addEnt(e) { pushUndo(); e.id = uid('e'); if (S.construction) e.con = true; S.ents.push(e); return e; }
  // ---------- Maße und Regeln: der Löser rechnet alles gemeinsam ----------
  const vars = () => Model.vars(App.doc).v;
  // fast: beim Ziehen ohne Beweglichkeits-Analyse (die kommt beim Loslassen)
  // Text entlang einer Kurve: Punkte der Kurve nachführen (die Kurve kann sich gerade geändert haben)
  function refreshTextPaths() {
    for (const t of S.ents) {
      if (t.type !== 'text' || !t.on) continue;
      const c = S.ents.find((x) => x.id === t.on), pts = c ? SK.textPathPts(c, t.flip) : null;
      if (pts) t.onP = pts; else { delete t.on; delete t.onP; delete t.os; delete t.flip; }
    }
  }
  function reapply(opts = {}) {
    if (!S) return null;
    const r = Solver.solve({ ents: S.ents, dims: S.dims, cons: S.cons }, vars(), { inPlace: true, analyze: !opts.fast, pins: opts.pins });
    refreshTextPaths();
    if (!opts.fast) S.status = r; else if (S.status) S.status.conflicts = r.conflicts;
    return r;
  }
  const ent = (id) => S.ents.find((x) => x.id === id);
  const sameRefs = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const specMatch = (d, sp) => d.k === sp.k && (sp.e ? d.e === sp.e : !!d.refs && sameRefs(d.refs, sp.refs));
  function dimFind(sp) { return S.dims.find((d) => specMatch(d, sp)) || null; }
  function dimOf(eid, k) { return dimFind({ e: eid, k }); }
  function putDimSpec(sp, v) {
    const old = dimFind(sp);
    if (old) old.v = v; else S.dims.push(sp.e ? { id: uid('m'), e: sp.e, k: sp.k, v } : { id: uid('m'), k: sp.k, refs: sp.refs, v });
  }
  function putDim(eid, k, v) { putDimSpec({ e: eid, k }, v); }
  // Maß setzen (Zahl oder Formel) – vorher prüfen, ob es zu den anderen Regeln passt
  function setDimSpec(sp, v) {
    if (sp.e && !ent(sp.e)) return false;
    const n = Model.num(v, vars(), NaN);
    const signed = sp.k === 'ang' || sp.k === 'x' || sp.k === 'y';
    const zeroOk = sp.k === 'dist' || sp.k === 'distPL' || sp.k === 'angLL';
    if (!isFinite(n) || (!signed && (zeroOk ? n < 0 : n <= 0)) || (sp.k === 'angLL' && n > 180)) { UI.toast('Dieser Wert passt hier nicht: ' + v, { kind: 'bad' }); return false; }
    if (typeof v === 'string' && !Expr.names(v).length) v = round(n, 4);   // reine Rechnung wie 10*3 → 30
    if (sp.k !== 'n') {
      const others = S.dims.filter((d) => !specMatch(d, sp));
      const tr = Solver.trial({ ents: S.ents, cons: S.cons, dims: [...others, sp.e ? { id: '_neu', e: sp.e, k: sp.k, v } : { id: '_neu', k: sp.k, refs: sp.refs, v }], dimsBefore: others }, vars());
      if (!tr.ok) { UI.toast(ERRORS.sketchOverConstrained.titel + ': Dieses Maß widerspricht den anderen Regeln. ' + ERRORS.sketchOverConstrained.loesung, { kind: 'bad', ms: 6000 }); return false; }
      if (tr.redundant) { UI.toast('Das liegt schon fest – andere Maße oder Regeln bestimmen diesen Wert bereits.', { icon: 'info', ms: 4500 }); return false; }
    }
    pushUndo(); putDimSpec(sp, v); reapply(); render(); Panels.renderRight();
    return true;
  }
  function setDim(eid, k, v) { return setDimSpec({ e: eid, k }, v); }
  function removeDimSpec(sp) { pushUndo(); S.dims = S.dims.filter((d) => !specMatch(d, sp)); reapply(); render(); Panels.renderRight(); }
  function removeDim(eid, k) { removeDimSpec({ e: eid, k }); }
  const usesEnt = (r, id) => r && r.e === id;
  // alle Verweise einer Regel (Muster und Versatz haben mehr als „refs“)
  const conRefs = (c) => [...(c.refs || []), ...(c.req || []), ...(c.center ? [c.center] : [])];
  // Element samt zugehörigen Maßen und Regeln aus den Daten nehmen (ohne Rückgängig-Schritt, ohne Neuzeichnen)
  function removeEntData(id) {
    S.ents = S.ents.filter((x) => x.id !== id);
    S.dims = S.dims.filter((d) => d.e !== id && !(d.refs || []).some((r) => usesEnt(r, id)));
    S.cons = S.cons.filter((c) => !conRefs(c).some((r) => usesEnt(r, id)));
    if (S.sel === id) S.sel = null;
    S.patSel = (S.patSel || []).filter((x) => x !== id);
  }
  function deleteEnt(id) {
    pushUndo();
    removeEntData(id);
    reapply(); render(); Panels.renderRight();
  }
  // Nach einer Änderung am Aufbau (Trimmen, Versatz, Spiegeln, Muster): alles neu rechnen. Passt etwas nicht mehr,
  // fliegen zuerst die neuen Regeln raus, dann – nur wenn es nicht anders geht – alte, die nicht mehr aufgehen.
  function sanitize(newCons = []) {
    let r = reapply();
    if (!r || r.ok) return 0;
    let dropped = 0;
    const isNew = new Set(newCons);
    for (let round = 0; round < 3 && r && !r.ok; round++) {
      const bad = new Set(r.conflicts);
      const nc = S.cons.filter((c) => bad.has(c.id) && isNew.has(c.id));
      const drop = nc.length ? nc : S.cons.filter((c) => bad.has(c.id));
      const dd = nc.length ? [] : S.dims.filter((d) => bad.has(d.id));
      if (!drop.length && !dd.length) break;
      const ids = new Set(drop.map((c) => c.id)), dids = new Set(dd.map((d) => d.id));
      S.cons = S.cons.filter((c) => !ids.has(c.id)); S.dims = S.dims.filter((d) => !dids.has(d.id));
      dropped += ids.size + dids.size;
      r = reapply();
    }
    if (dropped) UI.toast(dropped + (dropped === 1 ? ' Regel oder Maß wurde' : ' Regeln oder Maße wurden') + ' entfernt, weil sie nach der Änderung nicht mehr aufgingen.', { icon: 'info', ms: 5000 });
    return dropped;
  }
  function removeCons(id) { pushUndo(); S.cons = S.cons.filter((c) => c.id !== id); if (S.selCon === id) S.selCon = null; reapply(); render(); Panels.renderRight(); }
  // Welches Maß meint ein Klick auf dieses Element?
  function dimKeyAt(en, uv) {
    if (en.type === 'line') return 'len';
    if (en.type === 'circle' || en.type === 'poly') return 'd';
    if (en.type === 'text') return 'h';
    if (en.type === 'ellipse') { const cs = Math.cos(-(en.rot || 0)), sn = Math.sin(-(en.rot || 0)), x = uv[0] - en.c[0], y = uv[1] - en.c[1]; return Math.abs((cs * x - sn * y) / en.rx) >= Math.abs((sn * x + cs * y) / en.ry) ? 'w' : 'h'; }
    if (en.type === 'arc') return 'r';
    if (en.type === 'slot') return 'len';
    if (en.type === 'rect') {
      const x0 = Math.min(en.a[0], en.b[0]), x1 = Math.max(en.a[0], en.b[0]), y0 = Math.min(en.a[1], en.b[1]), y1 = Math.max(en.a[1], en.b[1]);
      const dh = Math.min(Math.abs(uv[1] - y0), Math.abs(uv[1] - y1)), dv = Math.min(Math.abs(uv[0] - x0), Math.abs(uv[0] - x1));
      return dh <= dv ? 'w' : 'h';
    }
    return null;
  }
  // ---------- Punkte, Linien, Kreise anklicken ----------
  function pointsOf(e) {
    const out = []; const P = (p, xy) => out.push([{ e: e.id, p }, xy]);
    if (e.type === 'line' || e.type === 'arc' || e.type === 'slot') { P('a', e.a); P('b', e.b); if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); if (ai) P('c', ai.c); } }
    else if (e.type === 'spline') { e.pts.forEach((q, i) => P('p' + i, q)); P('a', e.pts[0]); P('b', e.pts[e.pts.length - 1]); }
    else if (e.type === 'circle' || e.type === 'ellipse') P('c', e.c);
    else if (e.type === 'text' || e.type === 'point') P('a', e.a);
    else if (e.type === 'poly') { P('c', e.c); SK.polyCorners(e).forEach((q, i) => P('v' + i, q)); }
    else if (e.type === 'rect') { SK.rectCorners(e).forEach((q, i) => P('k' + i, q)); P('c', [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); }
    return out;
  }
  function refPts(e) { if (e.type === 'line' || e.type === 'arc') return [e.a, e.b]; if (e.type === 'spline') return e.pts; if (e.type === 'circle') return [e.c]; return []; }
  function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function rectEdgeAt(e, uv) { const c = SK.rectCorners(e); let bi = 0, bd = Infinity; for (let i = 0; i < 4; i++) { const d = segDist(uv, c[i], c[(i + 1) % 4]); if (d < bd) { bd = d; bi = i; } } return bi; }
  const kindOf = (e) => (e.type === 'circle' || e.type === 'arc' ? 'circle' : e.type === 'line' || e.type === 'slot' || e.type === 'rect' ? 'line' : 'other');
  function pickAt(uv, opts = {}) {
    const tol = pxSize() * 9;
    if (opts.points !== false) {
      let best = null, bd = tol;
      const tryP = (ref, q) => { const d = SK.d2(q, uv); if (d < bd) { bd = d; best = { ref, xy: q.slice(), kind: 'point' }; } };
      for (const e of S.ents) for (const [ref, q] of pointsOf(e)) tryP(ref, q);
      tryP({ e: 'origin' }, [0, 0]);
      for (const e of S.refs) for (const q of refPts(e)) tryP({ at: q.slice() }, q);
      // Ein Punkt gewinnt nur, wenn er nicht deutlich weiter weg ist als die Linie unter der Maus
      // (sonst wäre der Rand eines kleinen Kreises nie anklickbar, nur sein Mittelpunkt)
      const he = SK.hit(S.ents, uv, tol);
      if (best && (!he || bd <= SK.distEnt(he, uv) + tol * 0.35)) return best;
    }
    const hit = SK.hit(S.ents, uv, tol);
    if (hit) { const ref = { e: hit.id }; if (hit.type === 'rect') ref.edge = rectEdgeAt(hit, uv); return { ref, kind: kindOf(hit), ent: hit }; }
    if (opts.refs) { const r = SK.hit(S.refs, uv, tol); if (r) return { ref: null, kind: 'refent', ent: r }; }
    return null;
  }
  function refXY(ref) {
    if (!ref) return null; if (ref.at) return ref.at; if (ref.e === 'origin') return [0, 0];
    const e = ent(ref.e); if (!e) return null;
    if (ref.p === 'mid' && e.a && e.b) return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const m = pointsOf(e).find(([r]) => r.p === ref.p); return m ? m[1] : null;
  }
  function refLine(ref) {
    const e = ref && ent(ref.e); if (!e) return null;
    if (e.type === 'rect') { const c = SK.rectCorners(e); const i = ref.edge || 0; return [c[i], c[(i + 1) % 4]]; }
    return e.a && e.b ? [e.a, e.b] : null;
  }
  function refCircle(ref) {
    const e = ref && ent(ref.e); if (!e) return null;
    if (e.type === 'circle') return { c: e.c, r: e.r };
    if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); return ai ? { c: ai.c, r: ai.r } : null; }
    return null;
  }
  function measureSpec(sp) {
    if (sp.e) { const en = ent(sp.e); return en ? SK.measure(en, sp.k) : NaN; }
    const [r0, r1] = sp.refs;
    if (sp.k === 'dist') { const a = refXY(r0), b = refXY(r1); return a && b ? SK.d2(a, b) : NaN; }
    if (sp.k === 'distPL') { const p = refXY(r0), L = refLine(r1); if (!p || !L) return NaN; const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((p[0] - L[0][0]) * dy - (p[1] - L[0][1]) * dx) / (Math.hypot(dx, dy) || 1); }
    if (sp.k === 'angLL') { const A = refLine(r0), B = refLine(r1); if (!A || !B) return NaN; const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], vx = B[1][0] - B[0][0], vy = B[1][1] - B[0][1]; return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI; }
    return NaN;
  }
  // ---------- Regeln hinzufügen ----------
  function addCons(c) {
    const cons2 = [...S.cons, c];
    const tr = Solver.trial({ ents: S.ents, dims: S.dims, cons: cons2, consBefore: S.cons }, vars());
    if (!tr.ok) { UI.toast(ERRORS.sketchOverConstrained.titel + ': Diese Regel widerspricht den anderen. ' + ERRORS.sketchOverConstrained.loesung, { kind: 'bad', ms: 6000 }); render(); return false; }
    if (tr.redundant) { UI.toast('Das liegt schon fest – diese Regel würde nichts ändern.', { icon: 'info' }); render(); return false; }
    pushUndo(); S.cons = cons2; reapply(); render(); Panels.renderRight();
    return true;
  }
  // Regel-Knopf: ist schon eine passende Linie gewählt, gilt die Regel sofort
  function quickOrTool(id) {
    const sel = S.sel && ent(S.sel);
    if (sel && (id === 'horizontal' || id === 'vertical') && (sel.type === 'line' || sel.type === 'slot')) { addCons({ id: uid('k'), type: id, refs: [{ e: sel.id }] }); return; }
    if (sel && id === 'fix') { fixEnt(sel); return; }
    setTool('c:' + id);
  }
  function fixEnt(e) {
    const ks = Solver.varsOf(e); if (!ks) return;
    const at = {}; for (const k of ks) at[k] = Solver.getK(e, k);
    addCons({ id: uid('k'), type: 'fix', refs: [{ e: e.id }], at });
  }
  function consPick(pk, e) {
    const t = S.tool.slice(2);
    if (t === 'project') {
      const p2 = pickAt(mouseUV(e), { points: false, refs: true });
      if (!p2 || p2.kind !== 'refent') { UI.toast(CHINTS.project, { icon: 'info' }); return; }
      const copy = deepClone(p2.ent); copy.id = uid('e'); delete copy.con;
      pushUndo(); S.ents.push(copy);
      const at = {}; for (const k of Solver.varsOf(copy) || []) at[k] = Solver.getK(copy, k);
      S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: copy.id }], at });
      reapply(); render(); Panels.renderRight();
      return;
    }
    if (!pk) { S.picks = []; render(); return; }
    S.picks.push(pk);
    const P = S.picks, n = P.length, last = P[n - 1];
    const isPt = (x) => x.kind === 'point';
    const asPoint = (x) => (isPt(x) ? x.ref : x.ent && (x.ent.type === 'circle' || x.ent.type === 'arc' || x.ent.type === 'poly' || x.ent.type === 'ellipse') ? { e: x.ent.id, p: 'c' } : null);
    const fail = () => { UI.toast(CHINTS[t], { icon: 'info' }); S.picks = []; render(); };
    const wait = () => { render(); };
    let c = null;
    if (t === 'horizontal' || t === 'vertical') {
      if (n === 1 && last.kind === 'line' && last.ent.type !== 'rect') c = { refs: [last.ref] };
      else if (n === 1 && isPt(last)) return wait();
      else if (n === 2 && isPt(P[0]) && isPt(P[1])) c = { refs: [P[0].ref, P[1].ref] };
      else return fail();
    } else if (t === 'parallel' || t === 'perpendicular') {
      if (last.kind !== 'line') return fail(); if (n < 2) return wait();
      c = { refs: [P[0].ref, P[1].ref] };
    } else if (t === 'equal') {
      if (last.kind !== 'line' && last.kind !== 'circle') return fail(); if (n < 2) return wait();
      if (P[0].kind !== P[1].kind) return fail();
      c = { refs: [P[0].ref, P[1].ref] };
    } else if (t === 'tangent') {
      if (last.kind !== 'line' && last.kind !== 'circle') return fail(); if (n < 2) return wait();
      if (P[0].kind === 'line' && P[1].kind === 'line') return fail();
      c = { refs: [P[0].ref, P[1].ref] };
      if (P[0].kind === 'circle' && P[1].kind === 'circle') { const A = refCircle(P[0].ref), B = refCircle(P[1].ref); c.mode = SK.d2(A.c, B.c) < Math.max(A.r, B.r) ? 'int' : 'ext'; }
    } else if (t === 'coincident') {
      if (n === 1) { if (isPt(last) || last.kind === 'line' || last.kind === 'circle') return wait(); return fail(); }
      if (isPt(P[0]) && (isPt(P[1]) || P[1].kind === 'line' || P[1].kind === 'circle')) c = { refs: [P[0].ref, P[1].ref] };
      else if (isPt(P[1]) && (P[0].kind === 'line' || P[0].kind === 'circle')) c = { refs: [P[1].ref, P[0].ref] };
      else return fail();
    } else if (t === 'symmetric') {
      if (n <= 2) { if (!asPoint(last)) return fail(); return wait(); }
      if (last.kind !== 'line') return fail();
      c = { refs: [asPoint(P[0]), asPoint(P[1]), P[2].ref] };
    } else if (t === 'midpoint') {
      if (n === 1) { if (asPoint(last)) return wait(); return fail(); }
      if (last.kind !== 'line' || last.ent.type === 'rect' && last.ref.edge == null) return fail();
      c = { refs: [asPoint(P[0]), P[1].ref] };
    } else if (t === 'concentric') {
      const cen = (x) => x.ent && ['circle', 'arc', 'poly', 'ellipse'].includes(x.ent.type);
      if (!cen(last)) return fail(); if (n < 2) return wait();
      if (P[0].ent.id === P[1].ent.id) return fail();
      c = { refs: [{ e: P[0].ent.id }, { e: P[1].ent.id }] };
    } else if (t === 'fix') {
      S.picks = [];
      if (isPt(last)) { if (last.ref.e === 'origin' || last.ref.at) { UI.toast('Dieser Punkt liegt schon fest.', { icon: 'info' }); render(); return; } addCons({ id: uid('k'), type: 'fix', refs: [last.ref], at: last.xy.slice() }); }
      else if (last.ent) fixEnt(last.ent);
      return;
    }
    S.picks = [];
    if (c) addCons({ id: uid('k'), type: t, ...c });
  }
  // kleines Eingabefeld direkt im Bild
  let dimBox = null;
  function hideDimBox() { if (dimBox) { dimBox.remove(); dimBox = null; } }
  const DIMLABEL = (k) => SK.DIMNAME[k] || { dist: 'Abstand', distPL: 'Abstand', angLL: 'Winkel', r: 'Radius' }[k] || 'Maß';
  function askDim(sp, clientX, clientY) {
    hideDimBox(); hideEntry();
    const cur = dimFind(sp);
    const val = cur ? (typeof cur.v === 'number' ? fmt(cur.v, 4) : cur.v) : fmt(round(measureSpec(sp), 4), 4);
    dimBox = h('div', { class: 'numentry dimask' });
    const inp = h('input', { type: 'text', value: val, 'aria-label': DIMLABEL(sp.k), spellcheck: 'false', autocomplete: 'off', style: { width: '120px' } });
    dimBox.append(h('label', null, DIMLABEL(sp.k), inp));
    if (cur) {
      const del = h('button', { type: 'button', class: 'dimlock', 'data-tip': 'Maß löschen', 'aria-label': 'Maß löschen' }); del.innerHTML = icon('trash');
      del.onclick = () => { hideDimBox(); removeDimSpec(sp); };
      dimBox.append(del);
    }
    const r = Viewer.canvas.getBoundingClientRect();
    dimBox.style.left = clientX - r.left + 'px'; dimBox.style.top = clientY - r.top + 'px';
    $('#overlay').append(dimBox);
    // nach dem Mausklick fokussieren, sonst holt sich das 3D-Bild den Fokus zurück
    const grab = () => { if (dimBox && dimBox.contains(inp)) { inp.focus(); inp.select(); } };
    grab(); setTimeout(grab, 0); setTimeout(grab, 60);
    const commit = () => {
      const raw = inp.value.trim(); if (!raw) { hideDimBox(); return; }
      // ein neuer Name wie „breite“ wird unter „Maße“ mit dem jetzigen Wert angelegt
      if (/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(raw) && !/^pi$/i.test(raw) && isNaN(Model.num(raw, vars(), NaN))) {
        const now = round(measureSpec(sp), 4);
        App.change(`Maß „${raw}“ angelegt`, (doc) => { doc.params.push({ id: uid('m'), name: raw, expr: now }); });
        UI.toast(`Neuer Name „${raw}“ = ${fmt(now, 2)} – zu finden links unter „Maße“.`, { icon: 'check' });
      }
      const n = parseNum(raw); const v = isNaN(n) ? raw : n;
      if (isNaN(Model.num(v, vars(), NaN))) { inp.parentElement.parentElement.classList.add('invalid'); UI.toast('Das kann ich nicht ausrechnen: „' + raw + '“. Prüf die Schreibweise – Beispiele findest du unter „Maße“.', { kind: 'bad' }); return; }
      hideDimBox(); if (sp.e) S.sel = sp.e; setDimSpec(sp, v); Viewer.canvas.focus();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { hideDimBox(); Viewer.canvas.focus(); } });
  }
  // ---------- Spline ----------
  function finishSpline(closed) {
    const d = S.draft; S.draft = null; hideEntry();
    if (!d || !d.pts || d.pts.length < (closed ? 3 : 2)) { render(); return; }
    addEnt({ type: 'spline', pts: d.pts.map((q) => q.slice()), closed: !!closed });
    reapply(); render(); Panels.renderRight();
  }
  // ---------- Hilfslinien ----------
  function syncConBtn() {
    for (const b of document.querySelectorAll('.tool.conmode')) { b.classList.toggle('active', !!S.construction); b.setAttribute('aria-pressed', S.construction ? 'true' : 'false'); }
    const c = document.getElementById('sk-con'); if (c) c.checked = !!S.construction;
  }
  function toggleConstruction() {
    if (!S || S.step) return;
    const sel = S.sel && ent(S.sel);
    if (sel && S.tool === 'select') {
      pushUndo(); if (sel.con) delete sel.con; else sel.con = true;
      reapply(); render(); Panels.renderRight();
      UI.toast(sel.con ? 'Jetzt eine Hilfslinie (zählt nicht zur Fläche).' : 'Wieder eine normale Linie.', { icon: 'info', ms: 2200 });
      return;
    }
    S.construction = !S.construction; syncConBtn();
    UI.toast(S.construction ? 'Neue Elemente werden Hilfslinien.' : 'Neue Elemente sind wieder normale Linien.', { icon: 'info', ms: 2200 });
  }
  // ---------- Trimmen ----------
  const tolPx = () => pxSize() * 9;
  const SIMPLE = ['line', 'arc', 'circle', 'spline'];
  // Teilstück unter dem Mauszeiger als einfaches Element (bei Rechteck, Vieleck, Langloch nur die eine Kante bzw. der eine Bogen)
  function trimPart(hit, uv) {
    if (SIMPLE.includes(hit.type)) return { target: hit, skip: null };
    if (hit.type === 'ellipse') return { target: { id: '_tmp', ...ellipseSpline(hit) }, skip: { ent: hit, i: 0 } };
    if (hit.type === 'text') return null;
    let best = null, bd = Infinity, bi = -1;
    SK.segsOf(hit).forEach((s, i) => { const q = SKO.closest(SKO.curve(s), uv), d = SK.d2(q, uv); if (d < bd) { bd = d; best = s; bi = i; } });
    if (!best) return null;
    const target = best.t === 'arc' ? { id: '_tmp', type: 'arc', a: best.a, m: best.m, b: best.b } : best.t === 'circle' ? { id: '_tmp', type: 'circle', c: best.c, r: best.r } : { id: '_tmp', type: 'line', a: best.a, b: best.b };
    return { target, skip: { ent: hit, i: bi } };
  }
  // Ellipse als geschlossene Spline durch 48 Punkte auf ihr (Abweichung weit unter 0,01 mm bei üblichen Größen)
  function ellipseSpline(e) { return { type: 'spline', pts: SK.ellipsePoints(e.c, e.rx, e.ry, e.rot || 0, 48).map((q) => [round(q[0], 5), round(q[1], 5)]), closed: true }; }
  function trimCutters(skip) {
    const parts = [...SKO.partsOf(S.ents), ...SKO.partsOf(S.refs, true)];
    return skip ? parts.filter((k) => !(k.ent === skip.ent && k.i === skip.i)) : parts;
  }
  function trimHoverAt(uv) {
    S.trimHover = null;
    const hit = SK.hit(S.ents, uv, tolPx()); if (!hit) return;
    const tp = trimPart(hit, uv); if (!tp) return;
    const plan = SKO.trimPlan(tp.target, trimCutters(tp.skip), uv);
    S.trimHover = SKO.trimRemoved(plan);
  }
  function cutRef(by) {
    const e = ent(by.id); if (!e || by.ref) return null;
    if (e.type === 'line' || e.type === 'arc' || e.type === 'circle') return { e: e.id };
    if (e.type === 'rect') return { e: e.id, edge: by.i };
    return null;
  }
  function trimAt(uv) {
    const hit = SK.hit(S.ents, uv, tolPx()); if (!hit) return false;
    pushUndo();
    let target = hit;
    if (hit.type === 'text') return false;
    if (hit.type === 'ellipse') {
      // Ellipse: wird dafür zur Spline, die genau auf ihr liegt
      const sp = { id: uid('e'), ...(hit.con ? { con: true } : {}), ...ellipseSpline(hit) };
      const at = S.ents.indexOf(hit);
      removeEntData(hit.id);
      S.ents.splice(at, 0, sp); target = sp;
      UI.toast('Die Ellipse wurde dafür zu einer Spline, die genau auf ihr liegt.', { icon: 'info', ms: 2600 });
    } else if (!SIMPLE.includes(hit.type)) {
      // Rechteck, Vieleck, Langloch: erst in einzelne Linien und Bögen zerlegen
      const parts = SKO.explode(hit);
      const at = S.ents.indexOf(hit);
      removeEntData(hit.id);
      S.ents.splice(at, 0, ...parts);
      let bd = Infinity; for (const p of parts) { const d = SK.distEnt(p, uv); if (d < bd) { bd = d; target = p; } }
      UI.toast('Die Form wurde dafür in einzelne Linien und Bögen zerlegt.', { icon: 'info', ms: 2600 });
    }
    const plan = SKO.trimPlan(target, trimCutters(null), uv);
    const newCons = [];
    if (plan.kind === 'delete' || plan.kind === 'single') {
      removeEntData(target.id);
    } else {
      const pieces = SKO.trimPieces(plan);
      const tid = target.id, wasLine = target.type === 'line';
      S.dims = S.dims.filter((d) => d.e !== tid && !(d.refs || []).some((r) => usesEnt(r, tid)));
      S.cons = S.cons.filter((c) => {
        if (!conRefs(c).some((r) => usesEnt(r, tid))) return true;
        return wasLine && ['horizontal', 'vertical', 'parallel', 'perpendicular'].includes(c.type) && conRefs(c).every((r) => !usesEnt(r, tid) || (r.p == null && !r.at));
      });
      const keeps = pieces.some((pc) => pc.keepsId);
      let at = S.ents.indexOf(target);
      if (!keeps) { S.ents.splice(at, 1); if (S.sel === tid) S.sel = null; }
      for (const pc of pieces) {
        let en;
        if (pc.keepsId) { en = target; for (const k of ['a', 'b', 'm', 'c', 'r', 'pts', 'closed']) delete en[k]; Object.assign(en, pc.ent); }
        else { en = { id: uid('e'), ...(target.con ? { con: true } : {}), ...pc.ent }; S.ents.push(en); }
        for (const [end, cut] of [['a', pc.endA], ['b', pc.endB]]) {
          if (!cut || !cut.by) continue;
          const ref = cutRef(cut.by);
          if (ref && ref.e !== en.id) newCons.push({ id: uid('k'), type: 'coincident', refs: [{ e: en.id, p: end }, ref] });
        }
      }
    }
    S.cons.push(...newCons);
    S.sel = null; sanitize(newCons.map((c) => c.id));
    S.trimHover = null; render(); Panels.renderRight();
    return true;
  }
  // ---------- Ecken runden oder fasen ----------
  // Ecke = Punkt, an dem genau zwei Linien enden (auch Ecken von Rechteck und Vieleck – die werden dafür zerlegt).
  function cornerFind(uv) {
    const tol = pxSize() * 12; let best = null;
    const take = (p, d, shape) => { if (d < tol && (!best || d < best.d)) best = { p: p.slice(), d, shape }; };
    for (const en of S.ents) {
      if (en.con) continue;
      if (en.type === 'line') for (const k of ['a', 'b']) take(en[k], SK.d2(en[k], uv), null);
      else if (en.type === 'rect' || en.type === 'poly') for (const c of en.type === 'rect' ? SK.rectCorners(en) : SK.polyCorners(en)) take(c, SK.d2(c, uv), en.id);
    }
    if (!best) return null;
    if (!best.shape && cornerLines(best.p).length !== 2) return null;
    return best;
  }
  // Alle Ecken der Skizze auf einmal runden bzw. fasen (ein Rückgängig-Schritt)
  function cornerAll() {
    const pts = [];
    const add = (q) => { if (!pts.some((x) => SK.d2(x, q) < 1e-4)) pts.push(q.slice()); };
    for (const en of S.ents) {
      if (en.con) continue;
      if (en.type === 'rect' || en.type === 'poly') (en.type === 'rect' ? SK.rectCorners(en) : SK.polyCorners(en)).forEach(add);
      else if (en.type === 'line') for (const k of ['a', 'b']) if (cornerLines(en[k]).length === 2) add(en[k]);
    }
    if (!pts.length) { UI.toast('In dieser Skizze gibt es keine Ecken zwischen zwei Linien.', { icon: 'info' }); return; }
    const n0 = S.undo.length, toast = UI.toast; let ok = 0;
    UI.toast = () => {};
    try { for (const q of pts) if (cornerDo(q)) ok++; }
    finally { UI.toast = toast; }
    if (S.undo.length > n0 + 1) S.undo.splice(n0 + 1);
    reapply(); render(); Panels.renderRight();
    UI.toast(`${ok} von ${pts.length} Ecken ${S.corner.mode === 'fillet' ? 'gerundet' : 'gefast'}.` + (ok < pts.length ? ' An den übrigen ist der Wert zu groß.' : ''), { icon: ok ? 'check' : 'info', ms: 3500 });
  }
  function cornerLines(p) {
    const out = [];
    for (const en of S.ents) if (en.type === 'line' && !en.con) for (const k of ['a', 'b']) if (SK.d2(en[k], p) < 1e-4) out.push([en, k]);
    return out;
  }
  // Geometrie der Rundung/Fase an Ecke p zwischen zwei Linien (Endpunkt k1 bzw. k2 liegt auf p)
  function cornerGeom(p, l1, k1, l2, k2, mode, r) {
    const o1 = l1[k1 === 'a' ? 'b' : 'a'], o2 = l2[k2 === 'a' ? 'b' : 'a'];
    const L1 = SK.d2(p, o1), L2 = SK.d2(p, o2);
    if (L1 < 1e-9 || L2 < 1e-9) return { err: 'kurz' };
    const u1 = [(o1[0] - p[0]) / L1, (o1[1] - p[1]) / L1], u2 = [(o2[0] - p[0]) / L2, (o2[1] - p[1]) / L2];
    const th = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1));
    if (th < 0.01 || th > Math.PI - 0.01) return { err: 'gerade' };
    const t = mode === 'fillet' ? r / Math.tan(th / 2) : r;
    const tMax = Math.min(L1, L2) - 1e-4;
    if (t > tMax) return { err: 'gross', max: Math.floor((mode === 'fillet' ? tMax * Math.tan(th / 2) : tMax) * 100) / 100 };
    const T1 = [p[0] + u1[0] * t, p[1] + u1[1] * t], T2 = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    if (mode !== 'fillet') return { T1, T2 };
    let bx = u1[0] + u2[0], by = u1[1] + u2[1]; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
    const dc = r / Math.sin(th / 2), c = [p[0] + bx * dc, p[1] + by * dc];
    return { T1, T2, m: [c[0] - bx * r, c[1] - by * r] };
  }
  function cornerPreview(hv) {
    const C = S.corner;
    let l1, k1, l2, k2;
    if (hv.shape) {
      const sh = ent(hv.shape); if (!sh) return null;
      const parts = SKO.explode(sh).filter((x) => x.type === 'line');
      const at = parts.map((x) => (SK.d2(x.a, hv.p) < 1e-4 ? [x, 'a'] : SK.d2(x.b, hv.p) < 1e-4 ? [x, 'b'] : null)).filter(Boolean);
      if (at.length !== 2) return null; [[l1, k1], [l2, k2]] = at;
    } else { const L = cornerLines(hv.p); if (L.length !== 2) return null; [[l1, k1], [l2, k2]] = L; }
    const g = cornerGeom(hv.p, l1, k1, l2, k2, C.mode, C.r);
    if (g.err) return null;
    return C.mode === 'fillet' ? SK.arcPoints(g.T1, g.m, g.T2) : [g.T1, g.T2];
  }
  function cornerDo(uv) {
    const hv = cornerFind(uv);
    if (!hv) { UI.toast('Klick genau auf eine Ecke, an der zwei Linien zusammenkommen.', { icon: 'info', ms: 2200 }); return false; }
    const C = S.corner;
    pushUndo();
    if (hv.shape) {
      const sh = ent(hv.shape); const parts = SKO.explode(sh); const at = S.ents.indexOf(sh);
      removeEntData(sh.id); S.ents.splice(at, 0, ...parts);
      // die zerlegten Linien bleiben an den Ecken verbunden
      const lines = parts.filter((x) => x.type === 'line');
      for (let i = 0; i < lines.length; i++) { const A = lines[i], B = lines[(i + 1) % lines.length]; if (SK.d2(A.b, B.a) < 1e-4) S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: A.id, p: 'b' }, { e: B.id, p: 'a' }] }); }
    }
    const L = cornerLines(hv.p);
    if (L.length !== 2) { sketchUndo(); UI.toast('Hier treffen nicht genau zwei Linien aufeinander.', { icon: 'info' }); return false; }
    const [[l1, k1], [l2, k2]] = L;
    const g = cornerGeom(hv.p, l1, k1, l2, k2, C.mode, C.r);
    if (g.err) {
      sketchUndo();
      UI.toast(g.err === 'gross' ? `${C.mode === 'fillet' ? 'Der Radius' : 'Die Fase'} ist zu groß für diese Ecke – höchstens ${String(g.max).replace('.', ',')} mm.` : g.err === 'gerade' ? 'Die beiden Linien liegen in einer Flucht – da gibt es keine Ecke.' : 'Die Linien sind zu kurz.', { icon: 'info', ms: 3500 });
      return false;
    }
    // Ecke abschneiden: die Linien enden jetzt an der Rundung; Längen-Maße der beiden Linien passen nicht mehr
    const same = (r, e, k) => r && r.e === e.id && r.p === k;
    S.cons = S.cons.filter((c) => !(c.type === 'coincident' && c.refs && ((same(c.refs[0], l1, k1) && same(c.refs[1], l2, k2)) || (same(c.refs[0], l2, k2) && same(c.refs[1], l1, k1)))));
    const dropDims = S.dims.filter((d) => (d.e === l1.id || d.e === l2.id) && d.k === 'len').length;
    S.dims = S.dims.filter((d) => !((d.e === l1.id || d.e === l2.id) && d.k === 'len'));
    l1[k1] = g.T1.map((x) => round(x, 4)); l2[k2] = g.T2.map((x) => round(x, 4));
    const nid = uid('e'), newCons = [];
    if (C.mode === 'fillet') {
      S.ents.push({ id: nid, type: 'arc', a: l1[k1].slice(), m: g.m.map((x) => round(x, 4)), b: l2[k2].slice() });
      newCons.push({ id: uid('k'), type: 'tangent', refs: [{ e: l1.id }, { e: nid }] }, { id: uid('k'), type: 'tangent', refs: [{ e: l2.id }, { e: nid }] });
      S.dims.push({ id: uid('m'), e: nid, k: 'r', v: C.r });
    } else S.ents.push({ id: nid, type: 'line', a: l1[k1].slice(), b: l2[k2].slice() });
    newCons.push({ id: uid('k'), type: 'coincident', refs: [{ e: l1.id, p: k1 }, { e: nid, p: 'a' }] }, { id: uid('k'), type: 'coincident', refs: [{ e: l2.id, p: k2 }, { e: nid, p: 'b' }] });
    S.cons.push(...newCons);
    sanitize(newCons.map((c) => c.id));
    S.cornerHover = null; S.sel = null;
    if (dropDims) UI.toast('Die Längen-Maße der beiden Linien wurden entfernt – die Linien enden jetzt an der ' + (C.mode === 'fillet' ? 'Rundung.' : 'Fase.'), { icon: 'info', ms: 4000 });
    render(); Panels.renderRight();
    return true;
  }
  // ---------- Versatz ----------
  const OFFTYPES = ['line', 'arc', 'circle', 'rect', 'poly', 'slot', 'spline', 'ellipse'];
  function offsetDown(uv0, e) {
    const p = snap(uv0, { fine: e.shiftKey, off: e.altKey, exclude: S.draft && S.draft.off ? [S.draft.off.id] : undefined }).p;
    if (S.draft && S.draft.off) {
      const sd = round(offsetSigned(S.draft.off, p), 3);
      if (Math.abs(sd) < 0.01) { UI.toast('Zieh die Maus weg von der Linie – dort liegt die Kopie.', { icon: 'info' }); return; }
      applyOffset(sd, Math.abs(sd)); return;
    }
    const hit = SK.hit(S.ents, uv0, tolPx());
    if (!hit || !OFFTYPES.includes(hit.type)) { UI.toast('Klick eine Linie, einen Bogen, Kreis oder eine Form an.', { icon: 'info' }); return; }
    const off = { id: hit.id };
    if (hit.type === 'line' || hit.type === 'arc') off.chain = SKO.chainOf(S.ents, hit);
    S.draft = { off }; S.offUV = uv0;
    UI.hint('Maus auf die Seite ziehen, auf der die Kopie liegen soll, und klicken – oder den <b>Abstand eintippen</b> und Enter.');
    render(); Panels.renderRight();
  }
  // Abstand der Maus zum Element, mit Vorzeichen: Formen nach außen +, Ketten und Splines links (in Laufrichtung) +
  function offsetSigned(off, uv) {
    const e = ent(off.id); if (!e) return 0;
    if (off.chain) {
      let best = null, bd = Infinity;
      for (const s of off.chain.segs) {
        const seg = s.e.type === 'line' ? { t: 'line', a: s.a, b: s.b } : { t: 'arc', a: s.a, m: s.e.m, b: s.b };
        const d = SK.d2(SKO.closest(SKO.curve(seg), uv), uv); if (d < bd) { bd = d; best = s; }
      }
      if (!best) return 0;
      if (best.e.type === 'line') { const L = SK.d2(best.a, best.b) || 1; return ((best.b[0] - best.a[0]) * (uv[1] - best.a[1]) - (best.b[1] - best.a[1]) * (uv[0] - best.a[0])) / L; }
      const ai = SK.arcInfo(best.a, best.e.m, best.b); if (!ai) return 0;
      const D = SK.d2(uv, ai.c); return ai.sweep > 0 ? ai.r - D : D - ai.r;
    }
    if (e.type === 'circle') return SK.d2(uv, e.c) - e.r;
    if (e.type === 'poly') return SK.d2(uv, e.c) - e.r * Math.cos(Math.PI / Math.max(3, Math.round(e.n || 6)));
    if (e.type === 'slot') return segDist(uv, e.a, e.b) - e.r;
    if (e.type === 'ellipse') {
      // Abstand zur Ellipse (über Punkte auf ihr), außen +, innen −
      const pl = SK.ellipsePoints(e.c, e.rx, e.ry, e.rot || 0, 180); let bd = Infinity;
      for (let i = 0; i < pl.length; i++) bd = Math.min(bd, segDist(uv, pl[i], pl[(i + 1) % pl.length]));
      const cr = Math.cos(-(e.rot || 0)), sr = Math.sin(-(e.rot || 0)), dx = uv[0] - e.c[0], dy = uv[1] - e.c[1];
      const x = cr * dx - sr * dy, y = sr * dx + cr * dy;
      return (x / e.rx) ** 2 + (y / e.ry) ** 2 < 1 ? -bd : bd;
    }
    if (e.type === 'rect') {
      const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]), y0 = Math.min(e.a[1], e.b[1]), y1 = Math.max(e.a[1], e.b[1]);
      const dx = Math.max(x0 - uv[0], 0, uv[0] - x1), dy = Math.max(y0 - uv[1], 0, uv[1] - y1);
      return dx || dy ? Math.hypot(dx, dy) : -Math.min(uv[0] - x0, x1 - uv[0], uv[1] - y0, y1 - uv[1]);
    }
    if (e.type === 'spline') {
      const pl = SK.segPoints(SK.segsOf(e)[0]); let bd = Infinity, sg = 1;
      for (let i = 0; i < pl.length - 1; i++) {
        const d = segDist(uv, pl[i], pl[i + 1]);
        if (d < bd) { bd = d; sg = (pl[i + 1][0] - pl[i][0]) * (uv[1] - pl[i][1]) - (pl[i + 1][1] - pl[i][1]) * (uv[0] - pl[i][0]) >= 0 ? 1 : -1; }
      }
      return sg * bd;
    }
    return 0;
  }
  function offsetCalc(off, sd) {
    const e = ent(off.id); if (!e) return { ok: false, why: 'Das Element gibt es nicht mehr.' };
    if (Math.abs(sd) < 1e-6) return { ok: false, why: 'Der Abstand darf nicht 0 sein.' };
    if (off.chain) { const r = SKO.offsetChain(off.chain, sd); return r.ok ? { ok: true, items: r.items.map((x) => ({ src: x.src, ent: x.ent })) } : r; }
    const r = SKO.offsetShape(e, sd);
    return r.ok ? { ok: true, items: [{ src: e, ent: r.ent, sgs: r.sgs }] } : r;
  }
  function offsetCon(src, ne, it, sd, v) {
    const base = { id: uid('k'), type: 'offset', refs: [{ e: src.id }, { e: ne.id }], v };
    if (src.type === 'spline') return null;
    if (src.type === 'rect') return { ...base, sg: 1, sgs: it.sgs };
    if (src.type === 'circle' || src.type === 'slot' || src.type === 'poly') return { ...base, sg: sd > 0 ? 1 : -1 };
    if (src.type === 'arc') { const a0 = SK.arcInfo(src.a, src.m, src.b), a1 = SK.arcInfo(ne.a, ne.m, ne.b); if (!a0 || !a1) return null; return { ...base, sg: a1.r > a0.r ? 1 : -1 }; }
    if (src.type === 'line') { const cr = (src.b[0] - src.a[0]) * (ne.a[1] - src.a[1]) - (src.b[1] - src.a[1]) * (ne.a[0] - src.a[0]); return { ...base, sg: cr >= 0 ? 1 : -1 }; }
    return null;
  }
  function applyOffset(sd, v) {
    const off = S.draft && S.draft.off; if (!off) return false;
    const calc = offsetCalc(off, sd);
    if (!calc.ok) { UI.toast(calc.why, { kind: 'bad' }); return false; }
    pushUndo();
    const newCons = [];
    for (const it of calc.items) {
      const ne = { id: uid('e'), ...it.ent }; if (it.src.con) ne.con = true;
      S.ents.push(ne);
      const c = offsetCon(it.src, ne, it, sd, v); if (c) newCons.push(c);
    }
    if (newCons.length > 1) { const og = uid('og'); for (const c of newCons) c.og = og; }   // zusammen entstanden: später zusammen ändern
    S.cons.push(...newCons);
    S.draft = null; hideEntry(); S.sel = null;
    sanitize(newCons.map((c) => c.id));
    UI.hint(HINTS.offset); render(); Panels.renderRight();
    if (calc.items.some((x) => x.src.type === 'ellipse')) UI.toast('Der Versatz einer Ellipse ist keine Ellipse mehr – die Kopie ist eine Spline durch 48 Punkte genau im Abstand. Sie folgt der Ellipse nicht, wenn du diese später änderst.', { icon: 'info', ms: 5000 });
    return true;
  }
  // Abstand eingetippt (Zahl oder Formel): die Seite kommt von der Maus, ein Minus dreht sie um
  function commitOffset(r) {
    const off = S.draft && S.draft.off; if (!off) return;
    const num = Model.num(r, vars(), NaN);
    if (!isFinite(num) || num === 0) { UI.toast('Das ist kein gültiger Abstand: ' + r, { kind: 'bad' }); return; }
    const side = Math.sign(offsetSigned(off, S.offUV || [0, 0])) || 1;
    const sd = side * (num < 0 ? -1 : 1) * Math.abs(num);
    applyOffset(sd, typeof r === 'string' && Expr.names(r).length ? r : round(Math.abs(num), 4));
  }
  // ---------- Spiegeln ----------
  function mirrorDown(uv) {
    const hit = SK.hit(S.ents, uv, tolPx());
    if (!S.mir) {
      if (!hit || hit.type !== 'line') { UI.toast('Klick zuerst eine Linie an – an ihr wird gespiegelt.', { icon: 'info' }); return; }
      S.mir = { axis: hit.id, sel: [] };
      UI.hint('Jetzt die Elemente anklicken, die gespiegelt werden sollen. <b>Enter</b> spiegelt die Gewählten – ohne Auswahl alles.');
      render(); Panels.renderRight(); return;
    }
    if (hit && hit.id !== S.mir.axis) {
      const i = S.mir.sel.indexOf(hit.id);
      if (i >= 0) S.mir.sel.splice(i, 1); else S.mir.sel.push(hit.id);
      render(); Panels.renderRight();
    }
  }
  // Spiegelachse ohne eigene Linie: feste Hilfslinie durch den Nullpunkt anlegen
  function mirrorAxis(dir) {
    const b = SK.bounds(S.ents) || [-20, -20, 20, 20];
    const L = Math.max(20, Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3])) + 10;
    pushUndo();
    const ax = { id: uid('e'), type: 'line', con: true, a: dir === 'x' ? [-L, 0] : [0, -L], b: dir === 'x' ? [L, 0] : [0, L] };
    S.ents.push(ax);
    S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: ax.id }], at: Object.fromEntries((Solver.varsOf(ax) || []).map((k) => [k, Solver.getK(ax, k)])) });
    reapply();
    S.mir = { axis: ax.id, sel: [] };
    UI.hint('Jetzt die Elemente anklicken, die gespiegelt werden sollen. <b>Enter</b> spiegelt die Gewählten – ohne Auswahl alles.');
    render(); Panels.renderRight();
  }
  function mirrorAll() {
    if (!S.mir) return;
    const ids = S.mir.sel.length ? S.mir.sel.slice() : S.ents.filter((e) => e.id !== S.mir.axis).map((e) => e.id);
    mirrorEnts(ids);
  }
  function mirrorEnts(ids) {
    const ax = S.mir && ent(S.mir.axis); if (!ax) return 0;
    pushUndo();
    const newCons = []; let n = 0;
    for (const id of ids) {
      const e = ent(id); if (!e || e.id === ax.id) continue;
      if (S.cons.some((c) => c.type === 'symmetric' && c.refs[2] && c.refs[2].e === ax.id && (c.refs[0].e === id || c.refs[1].e === id))) continue;
      const r = SKO.mirrorEnt(e, ax.a, ax.b);
      S.ents.push(...r.ents);
      for (const [p, q] of r.pairs) newCons.push({ id: uid('k'), type: 'symmetric', refs: [p, q, { e: ax.id }] });
      for (const [p, q] of r.rad) newCons.push({ id: uid('k'), type: 'equal', refs: [{ ...p, k: 'r' }, { ...q, k: 'r' }] });
      n++;
    }
    if (!n) { S.undo.pop(); UI.toast('Da ist nichts Neues zu spiegeln.', { icon: 'info' }); return 0; }
    S.cons.push(...newCons);
    S.mir = null; S.sel = null;
    sanitize(newCons.map((c) => c.id));
    UI.hint(HINTS.mirror); render(); Panels.renderRight();
    return n;
  }
  // ---------- Muster ----------
  function patternDown(uv, p) {
    if (S.tool === 'patcirc' && S.patPick) {
      const pk = pickAt(uv);
      if (!pk || pk.kind !== 'point') { UI.toast('Klick genau auf einen Punkt: Ecke, Mittelpunkt oder den Nullpunkt.', { icon: 'info' }); return; }
      S.patCenter = { ref: pk.ref, xy: pk.xy.slice() }; S.patPick = false;
      UI.hint(HINTS.patcirc); render(); Panels.renderRight(); return;
    }
    const hit = SK.hit(S.ents, uv, tolPx()); if (!hit) return;
    const i = S.patSel.indexOf(hit.id);
    if (i >= 0) S.patSel.splice(i, 1); else S.patSel.push(hit.id);
    render(); Panels.renderRight();
  }
  // alle Verschiebungen bzw. Drehungen der Kopien (ohne das Original)
  function patternJobs() {
    const P = S.pat, out = [];
    if (S.tool === 'patrect') {
      const nx = clamp(Math.round(P.nx) || 1, 1, 50), ny = clamp(Math.round(P.ny) || 1, 1, 50);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i || j) out.push({ dx: i * P.dx, dy: j * P.dy });
    } else {
      const n = clamp(Math.round(P.n) || 2, 2, 100), full = Math.abs(P.ang) >= 360 - 1e-9;
      const step = full ? P.ang / n : P.ang / (n - 1);
      for (let k = 1; k < n; k++) out.push({ ang: k * step });
    }
    return out;
  }
  function patternCopy(e, job, C) {
    return S.tool === 'patcirc' ? SKO.rotateEnt(e, C.xy, (job.ang * Math.PI) / 180) : SKO.moveEnt(e, job.dx, job.dy);
  }
  function createPattern(o = {}) {
    const ids = S.patSel.filter((id) => ent(id));
    if (!ids.length) { UI.toast('Klick zuerst die Elemente an, die vervielfältigt werden sollen.', { icon: 'info' }); return 0; }
    const circ = S.tool === 'patcirc';
    const C = circ ? S.patCenter || { ref: { e: 'origin' }, xy: [0, 0] } : null;
    const jobs = patternJobs();
    if (!jobs.length) { UI.toast('Mit dieser Anzahl entstehen keine Kopien.', { icon: 'info' }); return 0; }
    if (!o.noUndo) pushUndo();
    // alle Regeln dieses Musters tragen dieselbe Kennung und die Einstellungen – so lässt es sich später als Ganzes ändern
    const P = S.pat, pg = o.pg || uid('pg');
    const pm = circ ? { kind: 'circ', n: P.n, ang: P.ang, src: ids.slice(), center: C.ref, cxy: C.xy.slice() } : { kind: 'rect', nx: P.nx, ny: P.ny, dx: P.dx, dy: P.dy, src: ids.slice() };
    const newCons = []; let made = 0;
    for (const job of jobs) for (const id of ids) {
      const e = ent(id);
      const r = patternCopy(e, job, C);
      S.ents.push(...r.ents);
      const refs = []; for (const [a, b] of r.pairs) refs.push(a, b);
      const c = { id: uid('k'), type: 'xform', refs };
      if (r.rad.length) c.req = r.rad.flat();
      if (circ) { c.mode = 'rot'; c.center = C.ref; c.ang = round(job.ang, 4); } else { c.dx = round(job.dx, 4); c.dy = round(job.dy, 4); }
      c.pg = pg; c.pm = deepClone(pm);
      newCons.push(c); made += r.ents.length;
    }
    S.cons.push(...newCons);
    S.patSel = []; S.sel = null;
    sanitize(newCons.map((c) => c.id));
    if (o.select && newCons.length) S.selCon = newCons[0].id;
    UI.hint(HINTS[S.tool]); render(); Panels.renderRight();
    return made;
  }
  // Ein Muster als Ganzes ändern: alte Kopien weg, mit den neuen Einstellungen neu anlegen (ein Rückgängig-Schritt)
  function regenPattern(pg, P) {
    const cons = S.cons.filter((c) => c.type === 'xform' && c.pg === pg); if (!cons.length || !cons[0].pm) return false;
    const pm = cons[0].pm, src = pm.src.filter((id) => ent(id));
    if (!src.length) { UI.toast('Die Originale dieses Musters gibt es nicht mehr.', { kind: 'bad' }); return false; }
    pushUndo();
    const copies = new Set(); for (const c of cons) for (let i = 1; i < c.refs.length; i += 2) if (c.refs[i] && c.refs[i].e) copies.add(c.refs[i].e);
    S.cons = S.cons.filter((c) => !(c.type === 'xform' && c.pg === pg));
    for (const id of copies) if (!src.includes(id)) removeEntData(id);
    const keep = { tool: S.tool, pat: S.pat, patSel: S.patSel, patCenter: S.patCenter };
    S.tool = pm.kind === 'circ' ? 'patcirc' : 'patrect';
    S.pat = { ...S.pat, ...(pm.kind === 'circ' ? { n: pm.n, ang: pm.ang } : { nx: pm.nx, ny: pm.ny, dx: pm.dx, dy: pm.dy }), ...P };
    S.patSel = src.slice();
    S.patCenter = pm.kind === 'circ' && pm.center && pm.center.e !== 'origin' ? { ref: pm.center, xy: refXY(pm.center) || pm.cxy } : null;
    const made = createPattern({ noUndo: true, pg, select: true });
    S.tool = keep.tool; S.pat = keep.pat; S.patSel = keep.patSel; S.patCenter = keep.patCenter;
    UI.hint(HINTS[S.tool]); render(); Panels.renderRight();
    if (!made) UI.toast('Mit dieser Anzahl bleibt nur das Original – das Muster ist aufgelöst.', { icon: 'info' });
    return true;
  }
  function onDown(e) {
    if (!S || S.step) return stepDown(e);
    if (e.button !== 0) return;
    const uv0 = mouseUV(e); if (!uv0) return;
    const sn = snap(uv0, { fine: e.shiftKey, off: e.altKey });
    let p = sn.p;
    const t = S.tool;
    if (t === 'dim') {
      const pk = pickAt(uv0);
      if (!pk) { S.dimFirst = null; UI.toast('Klick genau auf eine Linie, einen Kreis oder einen Punkt.', { icon: 'info', ms: 1800 }); render(); return; }
      const f = S.dimFirst;
      if (f) {
        // zweites Element: Abstand oder Winkel zwischen zwei Dingen
        let k = null, refs = null;
        const fp = f.kind === 'point', np = pk.kind === 'point';
        if (fp && np && !sameRefs(f.ref, pk.ref)) { k = 'dist'; refs = [f.ref, pk.ref]; }
        else if (fp && pk.kind === 'line') { k = 'distPL'; refs = [f.ref, pk.ref]; }
        else if (f.kind === 'line' && np) { k = 'distPL'; refs = [pk.ref, f.ref]; }
        else if (f.kind === 'line' && pk.kind === 'line' && !sameRefs(f.ref, pk.ref)) { k = 'angLL'; refs = [f.ref, pk.ref]; }
        if (k) { S.dimFirst = null; askDim({ k, refs }, e.clientX, e.clientY); render(); return; }
      }
      if (pk.kind === 'point') { S.dimFirst = pk; hideDimBox(); UI.hint('Jetzt einen <b>zweiten Punkt</b> oder eine <b>Linie</b> anklicken – für den Abstand.'); render(); return; }
      const k = dimKeyAt(pk.ent, uv0);
      if (!k) { S.dimFirst = null; UI.toast('Dafür gibt es noch kein Maß.', { icon: 'info' }); return; }
      S.sel = pk.ent.id; S.dimFirst = pk.kind === 'line' ? pk : null;
      UI.hint(HINTS.dim); render(); Panels.renderRight();
      askDim({ e: pk.ent.id, k }, e.clientX, e.clientY); return;
    }
    if (t.startsWith('c:')) { consPick(t === 'c:project' ? null : pickAt(uv0), e); return; }
    if (t === 'select') {
      // Endpunkt ziehen? (alle Linien, die sich dort treffen, gehen mit)
      const tol = pxSize() * 9;
      const endHit = [];
      for (const en of S.ents) {
        if (en.type === 'line' || en.type === 'arc') { for (const k of ['a', 'b']) if (SK.d2(en[k], uv0) < tol) endHit.push([en, k]); }
        else if (en.type === 'spline') en.pts.forEach((q, i) => { if (SK.d2(q, uv0) < tol) endHit.push([en, 'p' + i + '_']); });
      }
      if (endHit.length) { pushUndo(); S.drag = { points: endHit, start: uv0 }; S.selCon = null; return; }
      const hit = SK.hit(S.ents, uv0, tol);
      if (hit && (hit.type === 'point' || hit.type === 'text' || hit.type === 'ellipse' || hit.type === 'circle' || hit.type === 'rect' || hit.type === 'poly' || hit.type === 'slot' || hit.type === 'line' || hit.type === 'arc' || hit.type === 'spline')) { pushUndo(); S.drag = { move: hit.id, start: uv0, orig: deepClone(hit) }; }
      S.sel = hit ? hit.id : null; S.selCon = null; render(); Panels.renderRight(); return;
    }
    if (t === 'corner') { cornerDo(uv0); return; }
    if (t === 'bgcal') { bgCalDown(uv0); return; }
    if (t === 'bg') { if (S.bg) { pushUndoBg(); S.bgDrag = { start: uv0, a0: S.bg.a.slice() }; } return; }
    if (t === 'point') { addEnt({ type: 'point', a: p.slice() }); reapply(); render(); Panels.renderRight(); return; }
    if (t === 'tpl') {
      const ents = SKO.tplEnts(S.tpl.type, S.tpl.p, p);
      if (!ents.length) return;
      pushUndo(); for (const en of ents) { if (S.construction) en.con = true; S.ents.push(en); }
      reapply(); render(); Panels.renderRight();
      UI.toast(`${SKO.TEMPLATES[S.tpl.type].name}: ${ents.length} Elemente gesetzt.`, { icon: 'check', ms: 2200 });
      return;
    }
    if (t === 'text') {
      const T = S.txt; if (!String(T.s).trim()) { UI.toast('Bitte zuerst rechts einen Text eingeben.', { icon: 'info' }); return; }
      const en = addEnt({ type: 'text', a: p.slice(), s: T.s, h: T.h, font: T.font, align: T.align, rot: 0 });
      S.sel = en.id; reapply(); render(); Panels.renderRight(); return;
    }
    if (t === 'extend') { extendAt(uv0); return; }
    if (t === 'splitl') { splitAt(p); return; }
    if (t === 'wall') { wallAt(p); return; }
    if (t === 'project') { projectAt(e); return; }
    if (t === 'trim') { S.trimming = true; if (trimAt(uv0)) Panels.renderRight(); return; }
    if (t === 'offset') { offsetDown(uv0, e); return; }
    if (t === 'mirror') { mirrorDown(uv0); return; }
    if (t === 'patrect' || t === 'patcirc') { patternDown(uv0, p); return; }
    if (t === 'spline') {
      if (!S.draft) S.draft = { pts: [p] };
      else {
        const pts = S.draft.pts;
        const near = pxSize() * 7;
        if (SK.d2(pts[pts.length - 1], uv0) < near) { finishSpline(false); return; }
        if (pts.length >= 3 && SK.d2(pts[0], uv0) < near) { finishSpline(true); return; }
        pts.push(p);
      }
    } else if (t === 'line') {
      if (!S.draft) { S.draft = { pts: [p] }; }
      else {
        const a = S.draft.pts[S.draft.pts.length - 1];
        if (sn.kind !== 'end' && sn.kind !== 'center' && sn.kind !== 'mid') p = angleSnap(a, p).p;
        if (SK.d2(a, p) < 1e-6) return;
        addEnt({ type: 'line', a: a.slice(), b: p.slice() });
        const closed = SK.d2(p, S.draft.pts[0]) < 1e-6;
        if (closed) { S.draft = null; hideEntry(); }
        else S.draft.pts.push(p);
      }
    } else if (t === 'rect') {
      if (S.rect3) {
        if (!S.draft) { S.draft = { r3: [p] }; reapply(); render(); Panels.renderRight(); return; }
        if (S.draft.r3.length === 1) { if (SK.d2(S.draft.r3[0], p) > 1e-6) S.draft.r3.push(p); render(); return; }
        const c = rect3Corners(S.draft.r3[0], S.draft.r3[1], p); S.draft = null;
        if (c) addRect3(c);
        reapply(); render(); Panels.renderRight(); return;
      }
      if (!S.draft) S.draft = { a: p, mid: S.rectMid };
      else { const q = rectDraft(S.draft, p); if (Math.abs(q.b[0] - q.a[0]) > 1e-6 && Math.abs(q.b[1] - q.a[1]) > 1e-6) { const en = addEnt({ type: 'rect', a: q.a, b: q.b }); if (S.draft.mid) midCons(en, S.draft.a); } S.draft = null; hideEntry(); }
    } else if (t === 'ellipse') {
      if (!S.draft) S.draft = { c: p };
      else if (!S.draft.ax) { if (SK.d2(S.draft.c, p) > 1e-6) S.draft.ax = p; }
      else { const q = ellDraft(S.draft, p); if (q.ry > 1e-6) addEnt({ type: 'ellipse', c: S.draft.c, rx: round(q.rx, 4), ry: round(q.ry, 4), rot: q.rot }); S.draft = null; hideEntry(); }
    } else if (t === 'circle' && S.circMode && S.circMode !== 'center') {
      const need = S.circMode === '3p' ? 3 : 2;
      if (!S.draft) S.draft = { pts: [p] };
      else if (!S.draft.pts.some((q) => SK.d2(q, p) < 1e-6)) S.draft.pts.push(p);
      if (S.draft.pts.length >= need) { const ci = circOfDraft(S.draft.pts); if (ci && ci.r > 1e-6) addEnt({ type: 'circle', c: ci.c.map((v) => round(v, 4)), r: round(ci.r, 4) }); S.draft = null; }
    } else if (t === 'arc' && S.arcMode === 'tan') {
      if (!S.draft) { const st = tanStart(uv0); if (!st) { UI.toast('Klick zuerst auf das Ende einer Linie oder eines Bogens – dort setzt der Bogen tangential an.', { icon: 'info' }); return; } S.draft = { tan: st }; }
      else { const g = tanArc(S.draft.tan, p); if (g) { const en = addEnt({ type: 'arc', a: S.draft.tan.p.slice(), m: g.m.map((v) => round(v, 4)), b: p.slice() }); S.cons.push({ id: uid('k'), type: 'tangent', refs: [{ e: S.draft.tan.e }, { e: en.id }] }, { id: uid('k'), type: 'coincident', refs: [{ e: S.draft.tan.e, p: S.draft.tan.k }, { e: en.id, p: 'a' }] }); if (!reapply().ok) { S.cons.splice(-2); reapply(); } } S.draft = null; }
    } else if (t === 'circle') {
      if (!S.draft) S.draft = { c: p };
      else { const r = SK.d2(S.draft.c, p); if (r > 1e-6) addEnt({ type: 'circle', c: S.draft.c, r: round(r, 4) }); S.draft = null; hideEntry(); }
    } else if (t === 'poly') {
      if (!S.draft) S.draft = { c: p };
      else { const r = SK.d2(S.draft.c, p); if (r > 1e-6) addEnt({ type: 'poly', c: S.draft.c, r: round(r, 4), n: S.polySides, rot: Math.atan2(p[1] - S.draft.c[1], p[0] - S.draft.c[0]) - Math.PI / 2 }); S.draft = null; hideEntry(); }
    } else if (t === 'arc') {
      if (!S.draft) S.draft = { a: p };
      else if (!S.draft.b) { if (SK.d2(S.draft.a, p) > 1e-6) S.draft.b = p; }
      else { if (SK.arcInfo(S.draft.a, p, S.draft.b)) addEnt({ type: 'arc', a: S.draft.a, b: S.draft.b, m: p }); S.draft = null; }
    } else if (t === 'slot' && S.slotArc) {
      if (!S.draft) S.draft = { arcslot: true, c: p };
      else if (!S.draft.s) { if (SK.d2(S.draft.c, p) > 1e-6) S.draft.s = p; }
      else if (!S.draft.e) { if (SK.d2(S.draft.s, p) > 1e-6) S.draft.e = p; }
      else { const g = arcSlotGeom(S.draft, p); if (g) addArcSlot(g); S.draft = null; hideEntry(); }
    } else if (t === 'slot') {
      if (!S.draft) S.draft = { a: p };
      else if (!S.draft.b) { if (SK.d2(S.draft.a, p) > 1e-6) S.draft.b = p; }
      else { const r = slotR(S.draft.a, S.draft.b, p); if (r > 1e-6) addEnt({ type: 'slot', a: S.draft.a, b: S.draft.b, r: round(r, 4) }); S.draft = null; hideEntry(); }
    }
    reapply(); render(); Panels.renderRight();
  }
  // Rechteck aus der Mitte: d.a ist die Mitte, p eine Ecke
  function rectDraft(d, p) { if (!d.mid) return { a: d.a, b: p }; return { a: [2 * d.a[0] - p[0], 2 * d.a[1] - p[1]], b: p }; }
  // Mitte des Rechtecks bleibt per Symmetrie-Regel am angeklickten Punkt (Nullpunkt oder gefangener Punkt)
  function midCons(en, m, sn) {
    let ref = Math.hypot(m[0], m[1]) < 1e-6 ? { e: 'origin' } : null;
    if (!ref) for (const o of S.ents) { if (o.id === en.id) continue; const hit = pointsOf(o).find(([, xy]) => SK.d2(xy, m) < 1e-6); if (hit) { ref = hit[0]; break; } }
    if (!ref) return;
    const c = { id: uid('c'), type: 'midpoint', refs: [ref, { e: en.id, p: 'k0' }, { e: en.id, p: 'k2' }] };
    S.cons.push(c); if (!reapply().ok) S.cons.pop();
  }
  // Ellipse aus Mitte, Achsenende und drittem Punkt
  function ellDraft(d, p) { const ax = d.ax || p, rx = SK.d2(d.c, ax), rot = Math.atan2(ax[1] - d.c[1], ax[0] - d.c[0]); if (!d.ax) return { rx, ry: 0, rot }; const ux = Math.cos(rot), uy = Math.sin(rot); return { rx, ry: Math.abs((p[0] - d.c[0]) * -uy + (p[1] - d.c[1]) * ux), rot }; }
  // ---------- Bild als Vorlage ----------
  let bgTex = null, bgTexSrc = null;
  function pushUndoBg() { /* Bildlage gehört nicht zum Rückgängig der Geometrie */ }
  function bgLoad() {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    inp.onchange = () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          // verkleinern, damit das Projekt klein bleibt
          const M = 1600, s = Math.min(1, M / Math.max(img.width, img.height));
          const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const src = cv.toDataURL('image/jpeg', 0.85);
          const w = 100, r = cv.height / cv.width;
          S.bg = { src, a: [-w / 2, -(w * r) / 2], w, r, op: 0.5, name: file.name };
          UI.toast('Bild geladen. Leg jetzt mit „Maßstab festlegen“ die echte Größe fest.', { icon: 'info', ms: 4000 });
          render(); Panels.renderRight();
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    };
    document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
  }
  function setBg(src, w = 100, r = 0.75) { S.bg = { src, a: [-w / 2, -(w * r) / 2], w, r, op: 0.5 }; render(); Panels.renderRight(); }
  async function bgCalDown(uv) {
    if (!S.bgCal) { S.bgCal = [uv]; render(); return; }
    const a = S.bgCal[0], b = uv; S.bgCal = null;
    const L = SK.d2(a, b); if (L < 1e-6) { setTool('bg'); return; }
    render();
    const ans = await UI.prompt('Maßstab festlegen', `Wie weit liegen die beiden Punkte in Wirklichkeit auseinander (mm)? Im Bild sind es jetzt ${fmt(L, 2)} mm.`, fmt(L, 2));
    const v = ans == null ? NaN : parseNum(String(ans));
    if (S && S.bg && v > 0) {
      const f = v / L;
      S.bg.a = [round(a[0] + (S.bg.a[0] - a[0]) * f, 4), round(a[1] + (S.bg.a[1] - a[1]) * f, 4)]; S.bg.w = round(S.bg.w * f, 4);
      UI.toast(`Maßstab gesetzt: Das Bild ist jetzt ${fmt(S.bg.w, 1)} mm breit.`, { icon: 'check' });
    }
    if (S) setTool('bg');
  }
  function bgDraw() {
    const B = S.bg; if (!B || !B.src || B.hide) return;
    if (bgTexSrc !== B.src) { if (bgTex) bgTex.dispose(); bgTex = new THREE.TextureLoader().load(B.src, () => Viewer.requestRender && Viewer.requestRender()); bgTex.colorSpace = THREE.SRGBColorSpace || bgTex.colorSpace; bgTexSrc = B.src; }
    const W = B.w, H = B.w * B.r, n = S.F.n;
    const c = [[B.a[0], B.a[1]], [B.a[0] + W, B.a[1]], [B.a[0] + W, B.a[1] + H], [B.a[0], B.a[1] + H]].map((q) => toWorld(q[0], q[1]).addScaledVector(n, 0.02));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([c[0], c[1], c[2], c[0], c[2], c[3]].flatMap((v) => [v.x, v.y, v.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: bgTex, transparent: true, opacity: B.op ?? 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 15; grp.add(m);
    if (S.tool === 'bgcal' && S.bgCal) { const cur = S.cursor ? S.cursor.p : S.bgCal[0]; lineObj([S.bgCal[0], cur], Viewer.theme.accent, 2, { dashed: true }); label(`${fmt(SK.d2(S.bgCal[0], cur), 2)} mm`, cur); }
  }
  // Gedrehtes Rechteck aus drei Punkten: erste Kante a–b, dann die Höhe
  function rect3Corners(a, b, p) {
    const L = SK.d2(a, b); if (L < 1e-9) return null;
    const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], hgt = (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
    if (Math.abs(hgt) < 1e-6) return null;
    return [a, b, [b[0] + n[0] * hgt, b[1] + n[1] * hgt], [a[0] + n[0] * hgt, a[1] + n[1] * hgt]].map((q) => q.map((v) => round(v, 6)));
  }
  function addRect3(c) {
    pushUndo();
    const ids = [0, 1, 2, 3].map(() => uid('e'));
    for (let i = 0; i < 4; i++) S.ents.push({ id: ids[i], type: 'line', a: c[i], b: c[(i + 1) % 4], ...(S.construction ? { con: true } : {}) });
    for (let i = 0; i < 4; i++) S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: ids[i], p: 'b' }, { e: ids[(i + 1) % 4], p: 'a' }] });
    S.cons.push({ id: uid('k'), type: 'perpendicular', refs: [{ e: ids[0] }, { e: ids[1] }] }, { id: uid('k'), type: 'parallel', refs: [{ e: ids[0] }, { e: ids[2] }] }, { id: uid('k'), type: 'parallel', refs: [{ e: ids[1] }, { e: ids[3] }] });
  }
  // Gebogenes Langloch: Mitte, Start, Ende (Richtung gegen den Uhrzeigersinn), dann Breite
  function arcSlotGeom(d, wp) {
    const c = d.c, R = SK.d2(c, d.s); if (R < 1e-6) return null;
    const a0 = Math.atan2(d.s[1] - c[1], d.s[0] - c[0]); let a1 = Math.atan2(d.e[1] - c[1], d.e[0] - c[0]);
    while (a1 <= a0 + 1e-6) a1 += Math.PI * 2;
    if (a1 - a0 > Math.PI * 2 - 0.05) return null;
    const P = (r, a) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    const am = (a0 + a1) / 2, s = P(R, a0), e = P(R, a1), m = P(R, am);
    if (!wp) return { s, e, m };
    const w = Math.min(Math.abs(SK.d2(c, wp) - R), R * 0.95); if (w < 1e-4) return null;
    const ri = R - w, ro = R + w;
    const arcs = [
      { a: P(ro, a0), m: P(ro, am), b: P(ro, a1) },             // außen
      { a: P(ro, a1), m: [e[0] + Math.cos(a1 + Math.PI / 2) * w, e[1] + Math.sin(a1 + Math.PI / 2) * w], b: P(ri, a1) },   // Endkappe
      { a: P(ri, a1), m: P(ri, am), b: P(ri, a0) },             // innen
      { a: P(ri, a0), m: [s[0] + Math.cos(a0 - Math.PI / 2) * w, s[1] + Math.sin(a0 - Math.PI / 2) * w], b: P(ro, a0) },   // Anfangskappe
    ];
    return { s, e, m, w, arcs, c };
  }
  function addArcSlot(g) {
    pushUndo();
    const ids = g.arcs.map(() => uid('e')), r6 = (q) => q.map((v) => round(v, 6));
    g.arcs.forEach((a, i) => S.ents.push({ id: ids[i], type: 'arc', a: r6(a.a), m: r6(a.m), b: r6(a.b), ...(S.construction ? { con: true } : {}) }));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: ids[i], p: 'b' }, { e: ids[j], p: 'a' }] }, { id: uid('k'), type: 'tangent', refs: [{ e: ids[i] }, { e: ids[j] }], mode: i === 0 || i === 3 ? 'int' : 'ext' });
    }
    S.cons.push({ id: uid('k'), type: 'concentric', refs: [{ e: ids[0] }, { e: ids[2] }] }, { id: uid('k'), type: 'equal', refs: [{ e: ids[1], k: 'r' }, { e: ids[3], k: 'r' }] });
    const r = reapply();
    if (r && !r.ok) { // ohne Regeln, nur die Form
      S.cons = S.cons.filter((c) => !c.refs || !c.refs.some((x) => x && ids.includes(x.e)) || c.type === 'coincident');
      reapply();
    }
    render(); Panels.renderRight();
  }
  // Teilen: Linie oder Bogen am Punkt p in zwei verbundene Stücke
  // ---------- Kante übernehmen (projizieren) ----------
  // Kantenpunkte (Polylinie in Welt-Koordinaten) aus dem Ergebnis eines Körpers
  function edgeWorldPts(data, idx, W) {
    const g = (data.edgeGroups || []).find((x) => x[2] === idx); if (!g) return [];
    const out = [];
    for (let i = g[0]; i < g[0] + g[1]; i++) { const v = new THREE.Vector3(data.lines[i * 3], data.lines[i * 3 + 1], data.lines[i * 3 + 2]).applyMatrix4(W); if (!out.length || out[out.length - 1].distanceToSquared(v) > 1e-12) out.push(v); }
    return out;
  }
  const uvIn = (F, v) => { const d = v.clone().sub(F.o); return [round(d.dot(F.x), 4), round(d.dot(F.y), 4)]; };
  // Polylinie in der Skizzenebene → Skizzen-Element: gerade als Linie, rund als Bogen/Kreis, sonst Spline
  function edgeGeom2D(pts, t) {
    const n = pts.length - 1; if (n < 1) return null;
    const closed = SK.d2(pts[0], pts[n]) < 1e-3;
    if (t === 'LINE' || n === 1) return { type: 'line', a: pts[0], b: pts[n] };
    if (t === 'CIRCLE') {
      const A = pts[0], B = pts[Math.floor(n / 3)], C = pts[Math.floor((2 * n) / 3)], ai = SK.arcInfo(A, B, C);
      if (ai && pts.every((q) => Math.abs(SK.d2(q, ai.c) - ai.r) < Math.max(1e-3, ai.r * 2e-3))) return closed ? { type: 'circle', c: ai.c.map((v) => round(v, 4)), r: round(ai.r, 4) } : { type: 'arc', a: pts[0], m: pts[Math.floor(n / 2)], b: pts[n] };
    }
    const k = Math.max(1, Math.ceil(n / 24)), sp = pts.filter((_, i) => i % k === 0);
    if (closed) sp.pop(); else if (SK.d2(sp[sp.length - 1], pts[n]) > 1e-4) sp.push(pts[n]);
    return { type: 'spline', pts: sp, ...(closed ? { closed: true } : {}) };
  }
  // Steckbrief einer Kante, damit sie nach einer Änderung des Körpers wiedergefunden wird
  function edgeLink(id, g, pts3) {
    const r6 = (v) => Math.round(v * 1e6) / 1e6, W = Model.worldMatrix(App.doc, id);
    const m = new THREE.Vector3(...g.m).applyMatrix4(W);
    const link = { id, t: g.t, m: m.toArray().map(r6), l: r6(g.l || 0) };
    if (g.t === 'LINE' && pts3.length >= 2) link.d = pts3[pts3.length - 1].clone().sub(pts3[0]).normalize().toArray().map(r6);
    return link;
  }
  // ---------- Kante übernehmen (projizieren) ----------
  function projectAt(ev) {
    const hit = Viewer.pick(ev.clientX, ev.clientY, { edgePx: 9 });
    if (!hit || hit.edgeIdx == null || !hit.node) { UI.toast('Klick genau auf eine Kante eines Körpers.', { icon: 'info' }); return; }
    const pts3 = edgeWorldPts(hit.node.data, hit.edgeIdx, hit.node.obj.matrixWorld);
    const pts = []; for (const v of pts3) { const uv = uvIn(S.F, v); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
    if (pts.length < 2) { UI.toast('Diese Kante steht senkrecht auf der Skizze – sie wäre nur ein Punkt.', { icon: 'info' }); return; }
    const g = hit.node.data.edges[hit.edgeIdx] || {};
    const en = edgeGeom2D(pts, g.t); if (!en) return;
    // verbunden: wandert mit, wenn sich der Körper ändert (nicht beim Körper, zu dem diese Skizze selbst gehört)
    const own = S.ctx.editId ? Model.topOf(App.doc, S.ctx.editId) : null;
    if (Model.find(App.doc, hit.id) && !(own && own.id === hit.id)) en.link = edgeLink(hit.id, g, pts3);
    const ne = addEnt(en);
    const ks = Solver.varsOf(ne);
    if (ne.type !== 'spline' && ks) S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) });
    const r = reapply(); if (r && !r.ok) { S.cons = S.cons.filter((c) => !(c.type === 'fix' && c.refs[0].e === ne.id)); reapply(); }
    UI.toast({ line: 'Kante als Linie übernommen.', arc: 'Kante als Bogen übernommen.', circle: 'Kante als Kreis übernommen.', spline: 'Kante als Spline übernommen.' }[ne.type] + (ne.link ? ' Sie bleibt mit dem Körper verbunden.' : ''), { icon: 'check', ms: 2200 });
    render(); Panels.renderRight();
  }
  // ---------- Verbundene Kanten nachführen ----------
  // Nach jeder Neuberechnung: übernommene Kanten neu projizieren. Die Änderung hängt am letzten Rückgängig-Schritt,
  // so nimmt ein Rückgängig Körper und Kante zusammen zurück.
  let relinkRounds = 0;
  function relinkGeom(e, F) {
    const L = e.link, r = App.results.get(L.id); if (!r || !r.data || !r.data.edges) return null;
    const W = Model.worldMatrix(App.doc, L.id), m0 = new THREE.Vector3(...L.m), d0 = L.d ? new THREE.Vector3(...L.d) : null;
    let best = -1, bs = Infinity, bpts = null;
    r.data.edges.forEach((g, i) => {
      if (!g || g.t !== L.t || !g.m) return;
      const s = new THREE.Vector3(...g.m).applyMatrix4(W).distanceTo(m0) + 0.25 * Math.abs((g.l || 0) - (L.l || 0));
      if (s >= bs) return;
      const pts3 = edgeWorldPts(r.data, i, W); if (pts3.length < 2) return;
      if (d0 && Math.abs(pts3[pts3.length - 1].clone().sub(pts3[0]).normalize().dot(d0)) < 0.98) return;
      bs = s; best = i; bpts = pts3;
    });
    if (best < 0) return null;
    const bb = r.data.bbox, size = bb ? Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) : 100;
    if (bs > Math.max(5, 0.6 * size)) return null;   // zu weit weg: lieber stehen lassen als die falsche Kante nehmen
    const pts = []; for (const v of bpts) { const uv = uvIn(F, v); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
    const en = edgeGeom2D(pts, L.t); if (!en || en.type !== e.type) return null;
    return { ent: en, link: edgeLink(L.id, r.data.edges[best], bpts) };
  }
  function sameGeom(e, n) {
    const close = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => (Array.isArray(v) ? close(v, b[i]) : Math.abs(v - b[i]) < 1e-4));
    for (const k of ['a', 'b', 'm', 'c']) if (n[k] && !close(e[k], n[k])) return false;
    if (n.r != null && Math.abs(e.r - n.r) > 1e-4) return false;
    if (n.pts && !close(e.pts, n.pts)) return false;
    return true;
  }
  function relinkAll() {
    if (S || !App.doc) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      const sk = it.p && it.p.sketch; if (!sk || !(sk.ents || []).some((e) => e.link)) return;
      if (!Model.isActive(App.doc, it.id)) return;
      const own = Model.topOf(App.doc, it.id), F = frameWorld(sk.plane, Model.worldMatrix(App.doc, it.id));
      for (const e of sk.ents) {
        if (!e.link || (own && own.id === e.link.id)) continue;
        const g = relinkGeom(e, F); if (!g) continue;
        if (!sameGeom(e, g.ent)) jobs.push({ id: it.id, eid: e.id, g });
      }
    });
    if (!jobs.length) { relinkRounds = 0; return; }
    if (++relinkRounds > 3) { relinkRounds = 0; return; }   // Schutz gegen Hin und Her
    App.change('Übernommene Kanten nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f) continue;
        const sk = f.item.p.sketch, e = sk.ents.find((x) => x.id === j.eid); if (!e) continue;
        for (const k of ['a', 'b', 'm', 'c', 'r', 'pts']) if (j.g.ent[k] != null) e[k] = deepClone(j.g.ent[k]);
        e.link = j.g.link;
        const ks = Solver.varsOf(e);
        for (const c of sk.cons || []) if (c.type === 'fix' && c.refs[0].e === e.id && ks) c.at = Object.fromEntries(ks.map((k) => [k, Solver.getK(e, k)]));
      }
    }, { amend: true });
  }
  // ---------- Wand aus einer offenen Linie (Rippe, Steg) ----------
  // Beide Seiten im halben Abstand versetzen, die Enden schließen – per Regeln verbunden, die Linie wird Hilfslinie in der Mitte
  function wallAt(p) {
    const hit = SK.hit(S.ents, p, pxSize() * 9);
    if (!hit || hit.con || !['line', 'arc', 'spline'].includes(hit.type) || (hit.type === 'spline' && hit.closed)) { UI.toast('Klick auf eine offene Linie, einen Bogen oder eine Spline.', { icon: 'info' }); return; }
    const t = Number(S.wallT) > 0 ? Number(S.wallT) : 2, h2 = t / 2;
    const L = (a, b) => ({ id: uid('e'), type: 'line', a: a.slice(), b: b.slice() });
    const add = [], cons = [], co = (e1, k1, e2, k2) => cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: e1.id, p: k1 }, { e: e2.id, p: k2 }] });
    let path;
    if (hit.type === 'spline') {
      const a = SKO.offsetShape(hit, h2), b = SKO.offsetShape(hit, -h2);
      if (!a.ok || !b.ok) { UI.toast((a.ok ? b : a).why, { kind: 'bad' }); return; }
      const A = { id: uid('e'), ...a.ent }, B = { id: uid('e'), ...b.ent }, n = A.pts.length - 1;
      add.push(A, B, L(A.pts[0], B.pts[0]), L(A.pts[n], B.pts[n]));
      path = [hit];
    } else {
      const ch = SKO.chainOf(S.ents, hit);
      if (ch.closed) { UI.toast('Das ist schon ein geschlossener Umriss – den kannst du direkt hochziehen.', { icon: 'info' }); return; }
      const a = SKO.offsetChain(ch, h2), b = SKO.offsetChain(ch, -h2);
      if (!a.ok || !b.ok) { UI.toast((a.ok ? b : a).why, { kind: 'bad' }); return; }
      const n = ch.segs.length, kS = ch.segs[0].rev ? 'b' : 'a', kE = ch.segs[n - 1].rev ? 'a' : 'b';
      const side = (r, sd) => r.items.map((it) => { const ne = { id: uid('e'), ...it.ent }; delete ne.con; const c = offsetCon(it.src, ne, it, sd, round(h2, 4)); if (c) cons.push(c); return ne; });
      const A = side(a, h2), B = side(b, -h2);
      for (const P of [A, B]) for (let i = 0; i + 1 < n; i++) co(P[i], ch.segs[i].rev ? 'a' : 'b', P[i + 1], ch.segs[i + 1].rev ? 'b' : 'a');
      const c0 = L(A[0][kS], B[0][kS]), c1 = L(A[n - 1][kE], B[n - 1][kE]);
      co(c0, 'a', A[0], kS); co(c0, 'b', B[0], kS); co(c1, 'a', A[n - 1], kE); co(c1, 'b', B[n - 1], kE);
      add.push(...A, ...B, c0, c1);
      path = ch.segs.map((x) => x.e);
    }
    pushUndo();
    for (const e of path) e.con = true;
    S.ents.push(...add); S.cons.push(...cons);
    let r = reapply();
    if (r && !r.ok) { S.cons = S.cons.filter((c) => !cons.includes(c)); r = reapply(); }
    if (r && !r.ok) { sketchUndo(); UI.toast('Das geht mit den Regeln dieser Skizze nicht.', { kind: 'bad' }); return; }
    if (!SK.regions(S.ents).length) UI.toast('Die Wand überschneidet sich selbst – nimm eine kleinere Dicke.', { kind: 'bad' });
    else UI.toast(`Wand ${fmt(t, 2)} mm dick. „Fertig“ zieht sie hoch.`, { icon: 'check', ms: 2400 });
    S.sel = null; render(); Panels.renderRight();
  }
  function splitAt(p) {
    const hit = SK.hit(S.ents, p, pxSize() * 9);
    if (!hit || (hit.type !== 'line' && hit.type !== 'arc')) { UI.toast('Klick auf eine Linie oder einen Bogen.', { icon: 'info' }); return; }
    const q = SKO.closest(SKO.curve(SK.segsOf(hit)[0]), p);
    if (SK.d2(q, hit.a) < 1e-4 || SK.d2(q, hit.b) < 1e-4) { UI.toast('Am Ende gibt es nichts zu teilen – klick weiter innen.', { icon: 'info' }); return; }
    pushUndo();
    const qq = q.map((v) => round(v, 6));
    const base = hit.con ? { con: true } : {};
    let A, B;
    if (hit.type === 'line') { A = { id: uid('e'), type: 'line', a: hit.a, b: qq, ...base }; B = { id: uid('e'), type: 'line', a: qq, b: hit.b, ...base }; }
    else {
      const ai = SK.arcInfo(hit.a, hit.m, hit.b); const ang = (x) => Math.atan2(x[1] - ai.c[1], x[0] - ai.c[0]);
      const mid = (x, y) => { let a0 = ang(x), a1 = ang(y); let d = a1 - a0; if (ai.sweep > 0) { while (d <= 0) d += Math.PI * 2; } else { while (d >= 0) d -= Math.PI * 2; } const am = a0 + d / 2; return [round(ai.c[0] + Math.cos(am) * ai.r, 6), round(ai.c[1] + Math.sin(am) * ai.r, 6)]; };
      A = { id: uid('e'), type: 'arc', a: hit.a, m: mid(hit.a, qq), b: qq, ...base }; B = { id: uid('e'), type: 'arc', a: qq, m: mid(qq, hit.b), b: hit.b, ...base };
    }
    const i = S.ents.findIndex((e) => e.id === hit.id); S.ents.splice(i, 1, A, B);
    // Regeln und Maße am alten Element: Enden umhängen, Rest entfernen
    const remap = (r) => (r && r.e === hit.id ? (r.p === 'a' ? { ...r, e: A.id } : r.p === 'b' ? { ...r, e: B.id } : null) : r);
    S.cons = S.cons.map((c) => { const refs = (c.refs || []).map(remap); return refs.some((r) => r === null) ? null : { ...c, refs }; }).filter(Boolean);
    S.dims = S.dims.filter((d) => d.e !== hit.id && !(d.refs || []).some((r) => r && r.e === hit.id));
    S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: A.id, p: 'b' }, { e: B.id, p: 'a' }] });
    if (hit.type === 'line') S.cons.push({ id: uid('k'), type: 'parallel', refs: [{ e: A.id }, { e: B.id }] });
    else S.cons.push({ id: uid('k'), type: 'concentric', refs: [{ e: A.id }, { e: B.id }] }, { id: uid('k'), type: 'equal', refs: [{ e: A.id, k: 'r' }, { e: B.id, k: 'r' }] });
    const r = reapply();
    if (r && !r.ok) { sketchUndo(); UI.toast('Das geht mit den Regeln dieser Skizze nicht.', { kind: 'bad' }); return; }
    render(); Panels.renderRight();
  }
  // Verlängern: Linienende bis zum nächsten Schnitt mit einem anderen Element
  function extendTarget(uv) {
    const hit = SK.hit(S.ents, uv, pxSize() * 9);
    if (!hit || hit.type !== 'line') return null;
    const k = SK.d2(uv, hit.a) < SK.d2(uv, hit.b) ? 'a' : 'b', P = hit[k], Q = k === 'a' ? hit.b : hit.a;
    const L = SK.d2(P, Q); if (L < 1e-9) return null;
    const u = [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L];
    let best = null;
    const take = (t, e) => { if (t > 1e-6 && (!best || t < best.t)) best = { t, e }; };
    const raySeg = (a, b, e) => { const dx = b[0] - a[0], dy = b[1] - a[1], den = u[0] * dy - u[1] * dx; if (Math.abs(den) < 1e-12) return; const wx = a[0] - P[0], wy = a[1] - P[1]; const t = (wx * dy - wy * dx) / den, s = (wx * u[1] - wy * u[0]) / den; if (s >= -1e-9 && s <= 1 + 1e-9) take(t, e); };
    const rayCirc = (c, r, e, okAng) => { const fx = P[0] - c[0], fy = P[1] - c[1], bb = fx * u[0] + fy * u[1], cc = fx * fx + fy * fy - r * r, D = bb * bb - cc; if (D < 0) return; for (const t of [-bb - Math.sqrt(D), -bb + Math.sqrt(D)]) { const q = [P[0] + u[0] * t, P[1] + u[1] * t]; if (!okAng || okAng(q)) take(t, e); } };
    for (const e of S.ents) {
      if (e.id === hit.id) continue;
      if (e.type === 'line') raySeg(e.a, e.b, e);
      else if (e.type === 'circle') rayCirc(e.c, e.r, e);
      else if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); if (ai) rayCirc(ai.c, ai.r, e, (q) => SK.distEnt(e, q) < 0.02 * ai.r + 0.05); }
      else for (const s of SK.segsOf(e)) { const pts = SK.segPoints(s); for (let i = 1; i < pts.length; i++) raySeg(pts[i - 1], pts[i], e); }
    }
    if (!best) return { line: hit, k, none: true };
    return { line: hit, k, p: [P[0] + u[0] * best.t, P[1] + u[1] * best.t], other: best.e };
  }
  function extendAt(uv) {
    const T = extendTarget(uv);
    if (!T) { UI.toast('Klick nahe an das Ende einer Linie.', { icon: 'info' }); return; }
    if (T.none) { UI.toast('In dieser Richtung liegt nichts, bis wohin die Linie wachsen könnte.', { icon: 'info' }); return; }
    pushUndo();
    const L = S.ents.find((e) => e.id === T.line.id);
    L[T.k] = T.p.map((v) => round(v, 6));
    const dropped = S.dims.filter((d) => d.e === L.id && d.k === 'len');
    S.dims = S.dims.filter((d) => !(d.e === L.id && d.k === 'len'));
    if (['line', 'circle', 'arc'].includes(T.other.type)) S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: L.id, p: T.k }, { e: T.other.id }] });
    const r = reapply();
    if (r && !r.ok) { sketchUndo(); UI.toast('Das geht nicht mit den Regeln dieser Skizze zusammen.', { kind: 'bad' }); return; }
    if (dropped.length) UI.toast('Das Längen-Maß der Linie wurde entfernt.', { icon: 'info' });
    render(); Panels.renderRight();
  }
  // Kreis aus 2 Punkten (Durchmesser) oder 3 Punkten
  function circOfDraft(pts) {
    if (pts.length === 2) return { c: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], r: SK.d2(pts[0], pts[1]) / 2 };
    const ai = pts.length >= 3 ? SK.arcInfo(pts[0], pts[1], pts[2]) : null; return ai ? { c: ai.c, r: ai.r } : null;
  }
  // Tangentialer Bogen: Start am Ende einer Linie oder eines Bogens, Richtung = dort weiter
  function tanStart(uv) {
    const tol = pxSize() * 10; let best = null;
    for (const e of S.ents) {
      if (e.type !== 'line' && e.type !== 'arc') continue;
      for (const k of ['a', 'b']) {
        const d = SK.d2(e[k], uv); if (d > tol || (best && d >= best.d)) continue;
        let t;
        if (e.type === 'line') { const o = k === 'a' ? e.b : e.a; t = [e[k][0] - o[0], e[k][1] - o[1]]; }
        else { const ai = SK.arcInfo(e.a, e.m, e.b); if (!ai) continue; const r = [e[k][0] - ai.c[0], e[k][1] - ai.c[1]]; const ccwAtK = k === 'b' ? ai.sweep > 0 : ai.sweep < 0; t = ccwAtK ? [-r[1], r[0]] : [r[1], -r[0]]; }
        const L = Math.hypot(t[0], t[1]); if (L < 1e-9) continue;
        best = { e: e.id, k, p: e[k], t: [t[0] / L, t[1] / L], d };
      }
    }
    return best;
  }
  function tanArc(st, b) {
    const a = st.p, v = [b[0] - a[0], b[1] - a[1]], n = [-st.t[1], st.t[0]];
    const dn = v[0] * n[0] + v[1] * n[1]; if (Math.abs(dn) < 1e-6) return null;
    const r = (v[0] * v[0] + v[1] * v[1]) / (2 * dn), c = [a[0] + n[0] * r, a[1] + n[1] * r];
    // Mittelpunkt des Bogens: Winkelhalbierende zwischen a und b auf der Seite, in die t zeigt
    const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
    const a0 = ang(a), a1 = ang(b), ccw = r > 0;
    let sw = ccw ? a1 - a0 : a0 - a1; while (sw <= 0) sw += Math.PI * 2; while (sw > Math.PI * 2) sw -= Math.PI * 2;
    const am = a0 + (ccw ? sw / 2 : -sw / 2), R = Math.abs(r);
    return { c, r: R, m: [c[0] + Math.cos(am) * R, c[1] + Math.sin(am) * R] };
  }
  function slotR(a, b, p) { const L = SK.d2(a, b); if (L < 1e-9) return SK.d2(a, p); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; return Math.abs((p[0] - a[0]) * -uy + (p[1] - a[1]) * ux); }
  function commitDraftPolyline() { if (!S || !S.draft) return; if (S.tool === 'line') S.draft = null; else if (S.tool === 'spline') finishSpline(false); }
  let lastMouse = null;
  function onMove(e) {
    if (!S) return;
    if (S.step) return stepMove(e);
    const uv0 = mouseUV(e); if (!uv0) return;
    lastMouse = { e, uv: uv0 };
    if (S.bgDrag) { S.bg.a = [round(S.bgDrag.a0[0] + uv0[0] - S.bgDrag.start[0], 3), round(S.bgDrag.a0[1] + uv0[1] - S.bgDrag.start[1], 3)]; render(); return; }
    if (S.tool === 'bgcal') { S.cursor = { p: uv0 }; render(); return; }
    if (S.drag) {
      const sn = snap(uv0, { fine: e.shiftKey, off: e.altKey, noLot: true, exclude: S.drag.move ? [S.drag.move] : S.drag.points.map(([en]) => en.id) });
      // Wunschlage festhalten, der Löser bewegt den Rest – Maße und Regeln gehen vor
      const pins = [];
      if (S.drag.points) for (const [en, k] of S.drag.points) pins.push([en.id, k + '0', sn.p[0]], [en.id, k + '1', sn.p[1]]);
      else {
        const o = S.drag.orig; const moved = SK.translateEnt(o, round(sn.p[0] - S.drag.start[0], 4), round(sn.p[1] - S.drag.start[1], 4));
        for (const k of Solver.varsOf(o) || []) if (k !== 'r') pins.push([o.id, k, Solver.getK(moved, k)]);
      }
      S.dragPins = pins; S.dragged = true;
      dragFrame(); return;
    }
    if (S.tool === 'trim') { if (S.trimming && (e.buttons & 1)) trimAt(uv0); trimHoverAt(uv0); S.cursor = null; render(); return; }
    if (S.tool === 'corner') { S.cornerHover = cornerFind(uv0); S.cursor = null; render(); return; }
    if (S.tool === 'extend') { const T = extendTarget(uv0); S.extHover = T && !T.none ? T : null; S.cursor = null; render(); return; }
    if (S.tool === 'offset' && S.draft && S.draft.off) { S.offUV = uv0; S.cursor = null; render(); return; }
    if (S.tool === 'offset' || S.tool === 'mirror' || S.tool === 'patrect' || S.tool === 'patcirc') {
      const hv = SK.hit(S.ents, uv0, pxSize() * 9); S.hoverEnt = hv ? hv.id : null;
      S.cursor = S.tool === 'patcirc' && S.patPick ? snap(uv0, { fine: e.shiftKey, off: e.altKey }) : null;
      render(); return;
    }
    if (S.tool === 'dim' || S.tool.startsWith('c:')) { S.hoverPick = pickAt(uv0, { refs: S.tool === 'c:project', points: S.tool !== 'c:project' }); S.cursor = null; render(); return; }
    S.cursor = snap(uv0, { fine: e.shiftKey, off: e.altKey });
    if (S.tool === 'line' && S.draft) {
      const a = S.draft.pts[S.draft.pts.length - 1];
      if (S.cursor.kind !== 'end' && S.cursor.kind !== 'center' && S.cursor.kind !== 'mid') { const as = angleSnap(a, S.cursor.p); S.cursor.p = as.p; if (as.tip) S.cursor.tip = as.tip; }
    }
    render();
  }
  // Beim Ziehen höchstens einmal pro Bildschirmbild rechnen und zeichnen
  let dragRaf = 0;
  function dragFrame() {
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => { dragRaf = 0; if (!S || !S.dragPins) return; reapply({ fast: true, pins: S.dragPins }); render(); });
  }
  function onUp() {
    if (S && S.trimming) S.trimming = false;
    if (S && S.bgDrag) { S.bgDrag = null; Panels.renderRight(); return; }
    if (!S || !S.drag) return;
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    if (S.dragPins) { reapply({ fast: true, pins: S.dragPins }); S.dragPins = null; }
    const moved = S.dragged; S.drag = null; S.dragged = false;
    if (!moved) S.undo.pop();   // nur geklickt, nicht gezogen
    reapply(); render(); Panels.renderRight();
  }
  // ---------- Zahlen eintippen ----------
  let entry = null;
  function entryFields() {
    const t = S.tool, d = S.draft;
    if (!d) return null;
    if (t === 'line') return [['len', 'Länge'], ['ang', 'Winkel °']];
    if (t === 'rect' && d.r3) return null;
    if (t === 'rect') return [['w', 'Breite'], ['h', 'Höhe']];
    if (t === 'ellipse') return [['w', 'Breite'], ['h', 'Höhe']];
    if (t === 'circle' && d.pts) return null;
    if (t === 'arc') return null;
    if (t === 'circle') return [['d', 'Ø']];
    if (t === 'poly') return [['d', 'Ø']];
    if (t === 'slot' && d.arcslot) return null;
    if (t === 'slot' && !d.b) return [['len', 'Länge'], ['ang', 'Winkel °']];
    if (t === 'slot' && d.b) return [['w', 'Breite']];
    if (t === 'offset' && d.off) return [['dist', 'Abstand']];
    return null;
  }
  function showEntry(firstChar) {
    const fields = entryFields(); if (!fields) return false;
    hideEntry();
    entry = h('div', { class: 'numentry' });
    const inputs = [];
    for (const [k, label] of fields) {
      const inp = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': label, dataset: { k } });
      entry.append(h('label', null, label, inp)); inputs.push(inp);
    }
    $('#overlay').append(entry);
    placeEntry();
    const inp0 = inputs[0]; inp0.focus(); if (firstChar) inp0.value = firstChar;
    entry.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { hideEntry(); Viewer.canvas.focus(); return; }
      if (e.key === 'Enter') { e.preventDefault(); applyEntry(inputs); }
    });
    return true;
  }
  function placeEntry() {
    if (!entry || !lastMouse) return;
    const r = Viewer.canvas.getBoundingClientRect();
    entry.style.left = lastMouse.e.clientX - r.left + 'px'; entry.style.top = lastMouse.e.clientY - r.top + 'px';
  }
  function hideEntry() { if (entry) { entry.remove(); entry = null; } }
  function applyEntry(inputs) {
    const val = (k) => { const i = inputs.find((x) => x.dataset.k === k); if (!i || !i.value.trim()) return NaN; const n = parseNum(i.value); return isNaN(n) ? Model.num(i.value, Model.vars(App.doc).v, NaN) : n; };
    // Eingetippte Werte werden zu festen Maßen (Formeln bleiben Formeln)
    const raw = (k) => { const i = inputs.find((x) => x.dataset.k === k); if (!i || !i.value.trim()) return null; const n = parseNum(i.value); return isNaN(n) ? i.value.trim() : n; };
    const fix = (en, k, rk) => { const r = raw(rk); if (r == null || !en) return; putDim(en.id, k, typeof r === 'number' ? round(r, 4) : r); };
    const t = S.tool, d = S.draft, cur = S.cursor ? S.cursor.p : null;
    if (t === 'line' || (t === 'slot' && !d.b)) {
      const a = t === 'line' ? d.pts[d.pts.length - 1] : d.a;
      let L = val('len'); let ang = val('ang');
      if (isNaN(L) || L <= 0) { UI.toast('Bitte eine Länge eingeben.', { kind: 'bad' }); return; }
      if (isNaN(ang)) ang = cur ? (Math.atan2(cur[1] - a[1], cur[0] - a[0]) * 180) / Math.PI : 0;
      const r = (ang * Math.PI) / 180;
      const b = [round(a[0] + Math.cos(r) * L, 4), round(a[1] + Math.sin(r) * L, 4)];
      if (t === 'line') { const en = addEnt({ type: 'line', a: a.slice(), b }); fix(en, 'len', 'len'); if (raw('ang') != null) fix(en, 'ang', 'ang'); d.pts.push(b); }
      else d.b = b;
    } else if (t === 'rect') {
      let w = val('w'), hh = val('h');
      if (isNaN(w) || w <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      if (isNaN(hh) || hh <= 0) hh = w;
      const sx = cur && cur[0] < d.a[0] ? -1 : 1, sy = cur && cur[1] < d.a[1] ? -1 : 1;
      const en = d.mid ? addEnt({ type: 'rect', a: [round(d.a[0] - w / 2, 4), round(d.a[1] - hh / 2, 4)], b: [round(d.a[0] + w / 2, 4), round(d.a[1] + hh / 2, 4)] })
        : addEnt({ type: 'rect', a: d.a, b: [round(d.a[0] + sx * w, 4), round(d.a[1] + sy * hh, 4)] });
      fix(en, 'w', 'w'); fix(en, 'h', 'h'); if (d.mid) midCons(en, d.a); S.draft = null;
    } else if (t === 'ellipse') {
      let w = val('w'), hh = val('h');
      if (isNaN(w) || w <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      if (isNaN(hh) || hh <= 0) hh = w;
      const en = addEnt({ type: 'ellipse', c: d.c, rx: round(w / 2, 4), ry: round(hh / 2, 4), rot: 0 }); fix(en, 'w', 'w'); fix(en, 'h', 'h'); S.draft = null;
    } else if (t === 'circle' || t === 'poly') {
      const D = val('d'); if (isNaN(D) || D <= 0) { UI.toast('Bitte einen Durchmesser eingeben.', { kind: 'bad' }); return; }
      const rr = t === 'poly' && S.polyFlats ? D / 2 / Math.cos(Math.PI / S.polySides) : D / 2;
      const en = t === 'circle' ? addEnt({ type: 'circle', c: d.c, r: round(D / 2, 4) }) : addEnt({ type: 'poly', c: d.c, r: round(rr, 6), n: S.polySides, rot: S.polyFlats ? Math.PI / S.polySides - Math.PI / 2 : 0 });
      if (t === 'poly' && S.polyFlats) { setDim(en.id, 'd', round(2 * rr, 6)); S.draft = null; } else
      fix(en, 'd', 'd');
      S.draft = null;
    } else if (t === 'slot' && d.b) {
      const W = val('w'); if (isNaN(W) || W <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      const en = addEnt({ type: 'slot', a: d.a, b: d.b, r: round(W / 2, 4) }); fix(en, 'w', 'w'); S.draft = null;
    } else if (t === 'offset' && d.off) {
      const r = raw('dist'); if (r == null) { UI.toast('Bitte einen Abstand eingeben.', { kind: 'bad' }); return; }
      hideEntry(); commitOffset(r); Viewer.canvas.focus(); return;
    }
    reapply(); hideEntry(); Viewer.canvas.focus(); render(); Panels.renderRight();
  }
  // ---------- Tastatur ----------
  function onKey(e) {
    if (!S) return false;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (S.step) { if (e.key === 'Escape') { stepBack(); return true; } if (e.key === 'Enter') { stepOK(); return true; } return false; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); sketchUndo(); return true; }
    if (e.key === 'Escape' && S.mir) { S.mir = null; UI.hint(HINTS.mirror); render(); return true; }
    if (e.key === 'Escape' && S.patPick) { S.patPick = false; UI.hint(HINTS[S.tool]); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.patSel && S.patSel.length) { S.patSel = []; render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; hideEntry(); render(); } else if (S.picks.length || S.dimFirst) { S.picks = []; S.dimFirst = null; UI.hint(HINTS[S.tool]); render(); } else if (S.tool !== 'select') setTool('select'); else cancel(); return true; }
    if (e.key === 'Enter' && S.draft && S.tool === 'spline') { finishSpline(false); return true; }
    if (e.key === 'Enter' && S.tool === 'mirror' && S.mir) { mirrorAll(); return true; }
    if (e.key === 'Enter' && (S.tool === 'patrect' || S.tool === 'patcirc') && S.patSel.length) { createPattern(); return true; }
    if (e.key === 'Enter') { if (S.draft && S.tool === 'line') { S.draft = null; render(); } else done(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.selCon) { removeCons(S.selCon); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { deleteEnt(S.sel); return true; }
    // Beim Zeichnen landet jede Zahl und jeder Buchstabe im Eingabefeld (Formeln wie „breite/2“)
    if (S.draft && !e.ctrlKey && !e.metaKey && !e.altKey && /^[0-9.,\-(A-Za-zÄÖÜäöüß_]$/.test(e.key)) { if (showEntry(e.key)) { e.preventDefault(); return true; } }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'x') { toggleConstruction(); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) { const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase()); if (t) { setTool(t.id); return true; } }
    return false;
  }
  // ---------- Anzeige ----------
  let grp = null, labels = [];
  function buildGroup() { grp = Viewer.groups.sketch; clearGroup(); }
  function clearGroup() { if (!grp) return; for (const o of [...grp.children]) { grp.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.isLineSegments2 || x.isLine2) Viewer.disposeFat(x); else x.material.dispose(); } }); } for (const l of labels) l.remove(); labels = []; }
  function lineObj(pts2, color, width, opts = {}) {
    const pos = [];
    for (let i = 0; i < pts2.length - 1; i++) { const a = toWorld(...pts2[i]).addScaledVector(S.F.n, 0.06), b = toWorld(...pts2[i + 1]).addScaledVector(S.F.n, 0.06); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    if (!pos.length) return null;
    const l = Viewer.makeFat(pos, color, width, { depthTest: false, order: opts.order || 24, dashed: opts.dashed, dashSize: opts.dash || 2, gapSize: opts.gap || 1.6, opacity: opts.opacity });
    grp.add(l); return l;
  }
  function entPts(e) { const out = []; for (const s of SK.segsOf(e)) out.push(SK.segPoints(s)); return out; }
  function label(text, uv, cls = 'dimlabel live') {
    const el = h('div', { class: cls }, text); $('#overlay').append(el); labels.push(el);
    const s = Viewer.toScreen(toWorld(uv[0], uv[1])); el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    return el;
  }
  function render() {
    if (!S) return;
    clearGroup();
    bgDraw();
    const th = Viewer.theme; const ink = th.dark ? '#cfe3df' : '#123b37', acc = th.accent, muted = th.dark ? '#7f8c99' : '#8a96a3';
    // Raster in der Ebene
    const b = SK.bounds([...S.ents, ...S.refs]) || [-40, -40, 40, 40];
    const R = Math.max(60, Math.max(Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3])) + 40);
    const gpos = [], gpos2 = [];
    const step = R > 300 ? 10 : 5;
    for (let v = -Math.ceil(R / step) * step; v <= R; v += step) {
      const arr = v % (step * 2) === 0 ? gpos2 : gpos;
      const a = toWorld(v, -R), c = toWorld(v, R), d = toWorld(-R, v), e2 = toWorld(R, v);
      arr.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, e2.x, e2.y, e2.z);
    }
    const mk = (arr, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(acc), transparent: true, opacity: op, depthTest: false })); l.renderOrder = 18; grp.add(l); };
    mk(gpos, 0.08); mk(gpos2, 0.16);
    // Achsen der Skizze
    lineObj([[-R, 0], [R, 0]], '#d24a3c', 1.2, { opacity: 0.5, order: 19 });
    lineObj([[0, -R], [0, R]], '#3a9a3f', 1.2, { opacity: 0.5, order: 19 });
    // Bezugskanten der Fläche
    for (const e of S.refs) for (const p of entPts(e)) lineObj(p, muted, 1.5, { dashed: true, order: 20 });
    // Flächen füllen
    const regs = SK.regions(S.ents);
    for (const r of regs) {
      const chosen = !S.step || !S.step.sel || S.step.sel.includes(r.key);
      const shape = new THREE.Shape(r.outer.poly.map((p) => new THREE.Vector2(p[0], p[1])));
      for (const hl of r.holes) shape.holes.push(new THREE.Path(hl.poly.map((p) => new THREE.Vector2(p[0], p[1]))));
      const g = new THREE.ShapeGeometry(shape);
      const pos = g.attributes.position; const M = new THREE.Matrix4().makeBasis(S.F.x, S.F.y, S.F.n).setPosition(S.F.o.clone().addScaledVector(S.F.n, 0.04));
      g.applyMatrix4(M);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(acc), transparent: true, opacity: chosen ? (S.step ? 0.34 : 0.2) : 0.06, depthTest: false, side: THREE.DoubleSide }));
      m.renderOrder = 21; grp.add(m);
    }
    // Elemente: blau = noch beweglich, dunkel = voll bestimmt
    const free = th.dark ? '#5aa9ff' : '#1c6fd1';
    const st = S.status;
    const picked = new Set(S.picks.filter((p) => p.ent || (p.ref && p.ref.e && p.kind !== 'point')).map((p) => p.ref.e));
    const hov = S.hoverPick;
    for (const e of S.ents) {
      const sel = e.id === S.sel || picked.has(e.id);
      const isFree = !st || !st.freeEnts || st.freeEnts.has(e.id);
      const hot = hov && hov.kind !== 'point' && hov.ent && hov.ent.id === e.id;
      const col = sel ? acc : isFree ? free : ink;
      for (const p of entPts(e)) lineObj(p, col, sel ? 3.4 : hot ? 3 : 2.2, { dashed: e.con, order: 25, opacity: hot && !sel ? 0.8 : 1 });
      if (e.link && !S.step) {   // mit einer Körperkante verbunden: kleines Ketten-Symbol in der Mitte
        const pl = entPts(e)[0] || []; const q = pl.length === 2 ? [(pl[0][0] + pl[1][0]) / 2, (pl[0][1] + pl[1][1]) / 2] : pl[Math.floor(pl.length / 2)];
        if (q) { const el = label('', q, 'sklink'); el.innerHTML = icon('link'); el.dataset.tip = 'Mit einer Körperkante verbunden – wandert mit'; }
      }
      if (e.type === 'point') { const k = pxSize() * 4; lineObj([[e.a[0] - k, e.a[1]], [e.a[0] + k, e.a[1]]], col, sel ? 3.4 : 2.4, { order: 26 }); lineObj([[e.a[0], e.a[1] - k], [e.a[0], e.a[1] + k]], col, sel ? 3.4 : 2.4, { order: 26 }); }
      if (hot && e.type === 'rect' && hov.ref && hov.ref.edge != null) { const c = SK.rectCorners(e); lineObj([c[hov.ref.edge], c[(hov.ref.edge + 1) % 4]], acc, 4, { order: 26 }); }
    }
    // gewählte und überfahrene Punkte
    const ring = (p, r, col, w = 2) => { const q = SK.circlePoints(p, r, 20); q.push(q[0]); lineObj(q, col, w, { order: 27 }); };
    for (const p of S.picks) if (p.kind === 'point') ring(p.xy, pxSize() * 5, acc, 2.6);
    if (S.dimFirst && S.dimFirst.kind === 'point') ring(S.dimFirst.xy, pxSize() * 5, acc, 2.6);
    if (hov && hov.kind === 'point') ring(hov.xy, pxSize() * 4.5, acc, 1.8);
    if (hov && hov.kind === 'refent') for (const p of entPts(hov.ent)) lineObj(p, acc, 3, { order: 26 });
    // feste Maße als Schildchen, anklicken zum Ändern
    const conflicts = (st && st.conflicts) || new Set();
    const placed = [];   // Schildchen, die schon stehen – neue rücken nach unten, statt sie zu verdecken
    if (!S.step) for (const dm of S.dims) {
      const sp = dm.refs ? { k: dm.k, refs: dm.refs } : { e: dm.e, k: dm.k };
      const pos = dimPosSpec(dm); if (!pos) continue;
      if (pos.line) lineObj(pos.line, acc, 1, { dashed: true, opacity: 0.7, dash: 1.2, gap: 1.2 });
      const val = measureSpec(sp);
      const isF = typeof dm.v === 'string' && Model.isExpr(dm.v);
      const bad = isNaN(Model.num(dm.v, vars(), NaN)) || conflicts.has(dm.id);
      const pre = { d: 'Ø ', x: 'X ', y: 'Y ', r: 'R ' }[dm.k] || '';
      const unit = dm.k === 'ang' || dm.k === 'angLL' ? '°' : dm.k === 'n' ? ' Ecken' : '';
      const el = h('div', { class: 'skdim' + (bad ? ' bad' : ''), 'data-tip': bad ? 'Dieses Maß geht nicht auf – klicken zum Ändern' : DIMLABEL(dm.k) + ' – klicken zum Ändern', dataset: { dim: dm.id } });
      el.innerHTML = (isF ? `<span class="fx">${esc(dm.v)}&nbsp;=</span>` : '') + esc(pre + fmt(val, 2) + unit);
      $('#overlay').append(el); labels.push(el);
      const spx = Viewer.toScreen(toWorld(pos.p[0], pos.p[1]));
      const lw = el.offsetWidth || 40, lh = el.offsetHeight || 18; let ly = spx.y;
      for (let k = 0; k < 8 && placed.some((q) => Math.abs(q[0] - spx.x) < (q[2] + lw) / 2 && Math.abs(q[1] - ly) < (q[3] + lh) / 2); k++) ly += lh + 3;
      placed.push([spx.x, ly, lw, lh]);
      el.style.left = spx.x + 'px'; el.style.top = ly + 'px';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('click', (e) => { if (sp.e) S.sel = sp.e; render(); Panels.renderRight(); askDim(sp, e.clientX, e.clientY); });
    }
    // Regeln als kleine Symbole neben den Elementen
    if (!S.step) {
      const slots = new Map();
      for (const c of S.cons) {
        for (const a of consAnchors(c)) {
          const key = Math.round(a[0] / (pxSize() * 12)) + ',' + Math.round(a[1] / (pxSize() * 12));
          const n = slots.get(key) || 0; slots.set(key, n + 1);
          const spx = Viewer.toScreen(toWorld(a[0], a[1]));
          const el = h('div', { class: 'skcon' + (S.selCon === c.id ? ' sel' : '') + (conflicts.has(c.id) ? ' bad' : ''), 'data-tip': (CNAME[c.type] || 'Regel') + ' – anklicken, dann Entf zum Löschen', dataset: { con: c.id } });
          el.innerHTML = icon(CICON[c.type] || 'info');
          el.style.left = spx.x + n * 19 + 'px'; el.style.top = spx.y + 'px';
          el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
          el.addEventListener('click', () => { S.selCon = c.id; S.sel = null; render(); Panels.renderRight(); });
          $('#overlay').append(el); labels.push(el);
        }
      }
    }
    // Muster entlang Kurve: wo die Kopien landen (statt „offene Enden“)
    const pathM = S.ctx.mode === 'patpath' || isPathEdit();
    if (pathM && !S.step) {
      const g = pathGroup(), V = Model.vars(App.doc).v;
      const L = Model.pathPlaces(S.ents, g ? Model.num(g.p.n, V, 5) : 5, g ? Model.num(g.p.d, V, 0) : 0);
      const bb = SK.bounds(S.ents) || [0, 0, 10, 10], rr = clamp(Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.025, 0.6, 4);
      L.forEach((q, i) => { const ring = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; ring.push([q.p[0] + Math.cos(a) * rr, q.p[1] + Math.sin(a) * rr]); } lineObj(ring, acc, i ? 2 : 3.2, { order: 26 }); const t = [Math.cos(q.ang) * rr * 1.8, Math.sin(q.ang) * rr * 1.8]; lineObj([q.p, [q.p[0] + t[0], q.p[1] + t[1]]], acc, 2, { order: 26 }); });
      S.pathCount = L.length; const pc = document.getElementById('path-count'); if (pc) pc.textContent = String(L.length);
    }
    // offene Enden markieren
    if (!pathM && !isLoftLine()) for (const p of SK.openEnds(S.ents)) { const w = toWorld(p[0], p[1]); const l = label('', p, 'snaptip'); l.style.transform = 'translate(-50%,-50%)'; l.style.width = '9px'; l.style.height = '9px'; l.style.padding = '0'; l.style.borderRadius = '50%'; l.style.background = th.hole; l.title = 'Offenes Ende'; }
    // Entwurf
    const d = S.draft, cur = S.cursor ? S.cursor.p : null;
    if (d && cur && !S.step) {
      const t = S.tool;
      if (t === 'line') { const a = d.pts[d.pts.length - 1]; lineObj([a, cur], acc, 2.2); const L = SK.d2(a, cur); const ang = (Math.atan2(cur[1] - a[1], cur[0] - a[0]) * 180) / Math.PI; label(`${fmt(L, 2)} mm · ${fmt(ang, 1)}°`, [(a[0] + cur[0]) / 2, (a[1] + cur[1]) / 2]); }
      if (t === 'rect' && d.r3) { if (d.r3.length === 1) lineObj([d.r3[0], cur], acc, 2.2); else { const c = rect3Corners(d.r3[0], d.r3[1], cur); if (c) { lineObj([...c, c[0]], acc, 2.2); label(`${fmt(SK.d2(c[0], c[1]), 2)} × ${fmt(SK.d2(c[1], c[2]), 2)}`, cur); } } }
      else if (t === 'rect') { const q = rectDraft(d, cur), e = { type: 'rect', a: q.a, b: q.b }; for (const p of entPts(e)) lineObj(p, acc, 2.2); if (d.mid) lineObj([d.a, cur], acc, 1, { dashed: true }); label(`${fmt(Math.abs(q.b[0] - q.a[0]), 2)} × ${fmt(Math.abs(q.b[1] - q.a[1]), 2)}`, [(d.a[0] + cur[0]) / 2, (d.a[1] + cur[1]) / 2]); }
      if (t === 'ellipse') {
        if (!d.ax) { const r = SK.d2(d.c, cur); lineObj([[2 * d.c[0] - cur[0], 2 * d.c[1] - cur[1]], cur], acc, 1.4, { dashed: true }); label(`${fmt(2 * r, 2)} mm`, cur); }
        else { const q = ellDraft(d, cur); lineObj([[2 * d.c[0] - d.ax[0], 2 * d.c[1] - d.ax[1]], d.ax], acc, 1, { dashed: true }); if (q.ry > 1e-6) { const pts = SK.ellipsePoints(d.c, q.rx, q.ry, q.rot); pts.push(pts[0]); lineObj(pts, acc, 2.2); } label(`${fmt(2 * q.rx, 2)} × ${fmt(2 * q.ry, 2)}`, cur); }
      }
      if (t === 'circle' && d.pts) { for (const q of d.pts) label('•', q, 'snaptip'); const ci = circOfDraft([...d.pts, cur]); if (ci && d.pts.length + 1 >= 2) { lineObj(SK.segPoints({ t: 'circle', c: ci.c, r: ci.r }), acc, d.pts.length + 1 >= (S.circMode === '3p' ? 3 : 2) ? 2.2 : 1.2, { dashed: d.pts.length + 1 < (S.circMode === '3p' ? 3 : 2) }); label(`Ø ${fmt(2 * ci.r, 2)}`, cur); } }
      else if (t === 'arc' && d.tan) { const g = tanArc(d.tan, cur); if (g) { lineObj(SK.arcPoints(d.tan.p, g.m, cur), acc, 2.2); label(`R ${fmt(g.r, 2)}`, cur); } }
      else if (t === 'circle') { const r = SK.d2(d.c, cur); lineObj(SK.segPoints({ t: 'circle', c: d.c, r }), acc, 2.2); lineObj([d.c, cur], acc, 1, { dashed: true }); label(`Ø ${fmt(2 * r, 2)}`, cur); }
      if (t === 'poly') { const r = SK.d2(d.c, cur); const e = { type: 'poly', c: d.c, r, n: S.polySides, rot: Math.atan2(cur[1] - d.c[1], cur[0] - d.c[0]) - Math.PI / 2 }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Ø ${fmt(2 * r, 2)}`, cur); }
      if (t === 'arc' && !d.tan) { if (!d.b) lineObj([d.a, cur], acc, 1.4, { dashed: true }); else if (SK.arcInfo(d.a, cur, d.b)) { lineObj(SK.arcPoints(d.a, cur, d.b), acc, 2.2); const ai = SK.arcInfo(d.a, cur, d.b); label(`R ${fmt(ai.r, 2)}`, cur); } }
      if (t === 'slot' && d.arcslot) {
        if (!d.s) { lineObj([d.c, cur], acc, 1.2, { dashed: true }); label(`R ${fmt(SK.d2(d.c, cur), 2)}`, cur); }
        else if (!d.e) { const g = arcSlotGeom({ ...d, e: cur }, null); if (g) lineObj(SK.arcPoints(g.s, g.m, g.e), acc, 1.4, { dashed: true }); }
        else { const g = arcSlotGeom(d, cur); if (g) { for (const a of g.arcs) lineObj(SK.arcPoints(a.a, a.m, a.b), acc, 2.2); label(`Breite ${fmt(2 * g.w, 2)}`, cur); } }
      } else if (t === 'slot') { if (!d.b) { lineObj([d.a, cur], acc, 1.4, { dashed: true }); label(`${fmt(SK.d2(d.a, cur), 2)} mm`, cur); } else { const r = slotR(d.a, d.b, cur); if (r > 1e-6) { const e = { type: 'slot', a: d.a, b: d.b, r }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Breite ${fmt(2 * r, 2)}`, cur); } } }
    }
    // Verlängern-Vorschau
    if (S.tool === 'extend' && S.extHover) lineObj([S.extHover.line[S.extHover.k], S.extHover.p], th.accent, 2.4, { dashed: true });
    // Schablonen-Vorschau
    if (S.tool === 'tpl' && cur && !S.step) for (const en of SKO.tplEnts(S.tpl.type, S.tpl.p, cur)) for (const q of entPts(en)) lineObj(q, acc, 1.4, { dashed: true });
    // Spline-Entwurf
    if (d && S.tool === 'spline' && d.pts && !S.step) {
      const pts = cur ? [...d.pts, cur] : d.pts;
      if (pts.length >= 2) lineObj(SK.segPoints({ t: 'spline', pts, closed: false }), acc, 2.2);
      for (const q of d.pts) ring(q, pxSize() * 3.5, acc, 1.8);
      if (d.pts.length >= 3) ring(d.pts[0], pxSize() * 6, acc, 1.2);
    }
    // Trimmen: der Teil, der wegfällt, wird rot
    if (S.tool === 'trim' && S.trimHover && S.trimHover.length > 1) lineObj(S.trimHover, '#e03a3a', 4.5, { order: 28 });
    if (S.tool === 'corner' && S.cornerHover) { const pv = cornerPreview(S.cornerHover); if (pv) lineObj(pv, '#e8833a', 3.5, { order: 28 }); }
    // Versatz: Vorschau der Kopie
    if (S.tool === 'offset') {
      const hv = S.hoverEnt && ent(S.hoverEnt);
      if (hv && !(S.draft && S.draft.off)) for (const p of entPts(hv)) lineObj(p, acc, 3.2, { order: 26 });
      const off = S.draft && S.draft.off, src = off && ent(off.id);
      if (src) {
        for (const p of entPts(src)) lineObj(p, acc, 3.4, { order: 26 });
        if (S.offUV) {
          const sd = offsetSigned(off, S.offUV), calc = offsetCalc(off, sd);
          if (calc.ok) { for (const it of calc.items) for (const p of entPts(it.ent)) lineObj(p, acc, 2.2, { dashed: true, order: 27 }); label(fmt(Math.abs(sd), 2) + ' mm', S.offUV); }
          else if (Math.abs(sd) > 0.01) label(calc.why, S.offUV, 'dimlabel live bad');
        }
      }
    }
    // Spiegeln: Achse, gewählte Elemente und Vorschau
    if (S.tool === 'mirror') {
      const hv = S.hoverEnt && ent(S.hoverEnt);
      if (hv) for (const p of entPts(hv)) lineObj(p, acc, 3, { order: 26, opacity: 0.7 });
      if (S.mir) {
        const ax = ent(S.mir.axis);
        if (ax) {
          const L = Math.max(SK.d2(ax.a, ax.b), 1), u = [(ax.b[0] - ax.a[0]) / L, (ax.b[1] - ax.a[1]) / L], ext = L * 0.15 + pxSize() * 30;
          lineObj([[ax.a[0] - u[0] * ext, ax.a[1] - u[1] * ext], [ax.b[0] + u[0] * ext, ax.b[1] + u[1] * ext]], acc, 3.4, { order: 27, dashed: true });
          const ids = S.mir.sel.length ? S.mir.sel : S.ents.filter((e) => e.id !== ax.id).map((e) => e.id);
          for (const id of ids) {
            const e = ent(id); if (!e) continue;
            if (S.mir.sel.includes(id)) for (const p of entPts(e)) lineObj(p, acc, 3.2, { order: 26 });
            for (const ne of SKO.mirrorEnt(e, ax.a, ax.b).ents) for (const p of entPts(ne)) lineObj(p, acc, 1.8, { dashed: true, opacity: 0.6, order: 26 });
          }
        }
      }
    }
    // Muster: Auswahl und Vorschau der Kopien
    if (S.tool === 'patrect' || S.tool === 'patcirc') {
      const hv = S.hoverEnt && ent(S.hoverEnt);
      if (hv) for (const p of entPts(hv)) lineObj(p, acc, 3, { order: 26, opacity: 0.7 });
      for (const id of S.patSel) { const e = ent(id); if (e) for (const p of entPts(e)) lineObj(p, acc, 3.4, { order: 26 }); }
      if (S.patSel.length) {
        const C = S.patCenter || { xy: [0, 0] };
        if (S.tool === 'patcirc') { ring(C.xy, pxSize() * 6, acc, 2); }
        const jobs = patternJobs();
        if (jobs.length * S.patSel.length <= 240) for (const job of jobs) for (const id of S.patSel) { const e = ent(id); if (!e) continue; for (const ne of patternCopy(e, job, C).ents) for (const p of entPts(ne)) lineObj(p, acc, 1.6, { dashed: true, opacity: 0.55, order: 26 }); }
      }
    }
    // Einrast-Markierung
    if (S.cursor && !S.step && S.tool !== 'select') {
      const c = S.cursor;
      if (c.guides) for (const [a, bb] of c.guides) lineObj([a, bb], acc, 1, { dashed: true, opacity: 0.8, dash: 1.2, gap: 1.2 });
      const w = c.p; const ps = pxSize();
      snapMarker(c.kind, w, ps, acc);
      if (c.tip) { const l = label(c.tip, w, 'snaptip'); }
    }
    if (isLoftLine()) loftPreview();
    Viewer.requestRender();
  }
  // Form des Fangpunkts zeigt, was gefangen wurde
  function snapMarker(kind, w, ps, col) {
    const r = ps * 5, P = (x, y) => [w[0] + x * r, w[1] + y * r];
    const line = (arr, close) => { const q = arr.map(([x, y]) => P(x, y)); if (close) q.push(q[0]); lineObj(q, col, 2, { order: 26 }); };
    const circ = (rad) => { const q = SK.circlePoints(w, ps * rad, 24); q.push(q[0]); lineObj(q, col, 2, { order: 26 }); };
    switch (kind) {
      case 'end': case 'origin': line([[-1, -1], [1, -1], [1, 1], [-1, 1]], true); break;
      case 'mid': line([[-1, -0.9], [1, -0.9], [0, 1]], true); break;
      case 'cross': line([[-1, -1], [1, 1]]); line([[-1, 1], [1, -1]]); break;
      case 'quad': line([[0, -1.2], [1.2, 0], [0, 1.2], [-1.2, 0]], true); break;
      case 'perp': line([[-1, 1], [-1, -1], [1, -1]]); line([[-1, 0], [0, 0], [0, -1]]); break;
      case 'tangent': circ(4); line([[-1.4, -1.6], [1.4, -1.6]]); break;
      case 'curve': line([[-1, 0], [1, 0]]); line([[0, -1], [0, 1]]); break;
      case 'grid': circ(3); break;
      default: circ(5);
    }
  }
  // Wo stehen die Symbole einer Regel? (Skizzen-Koordinaten)
  function consAnchors(c) {
    const px = pxSize(); const out = [];
    const refs = c.type === 'xform' || c.type === 'offset' ? [c.refs[1]] : c.type === 'symmetric' ? [c.refs[2]] : c.type === 'coincident' || c.type === 'midpoint' ? [c.refs[0]] : c.type === 'concentric' ? [{ e: c.refs[1].e, p: 'c' }] : (c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 2 ? [c.refs[0]] : c.refs;
    for (const r of refs || []) {
      if (!r) continue;
      if (r.p || r.at || r.e === 'origin') { const q = refXY(r); if (q) out.push([q[0] + px * 12, q[1] - px * 12]); continue; }
      const e = ent(r.e); if (!e) continue;
      const L = r.edge != null || e.type === 'line' || e.type === 'slot' ? refLine(r) : null;
      if (L) { const [a, b] = L; const len = SK.d2(a, b) || 1; const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; out.push([(a[0] + b[0]) / 2 - nx * px * 15 + (b[0] - a[0]) / len * px * 10, (a[1] + b[1]) / 2 - ny * px * 15 + (b[1] - a[1]) / len * px * 10]); continue; }
      const C = refCircle(r); if (C) { const q = Math.SQRT1_2 * C.r + px * 10; out.push([C.c[0] - q, C.c[1] + q]); continue; }
      const P = refXY({ e: e.id, p: 'c' }); if (P) out.push([P[0] + px * 12, P[1] - px * 12]);
    }
    return out;
  }
  function dimPosSpec(dm) {
    if (!dm.refs) { const en = ent(dm.e); return en ? dimPos(en, dm.k) : null; }
    const px = pxSize(); const [r0, r1] = dm.refs;
    if (dm.k === 'dist') { const a = refXY(r0), b = refXY(r1); if (!a || !b) return null; const L = SK.d2(a, b) || 1; const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; return { p: [(a[0] + b[0]) / 2 + nx * px * 14, (a[1] + b[1]) / 2 + ny * px * 14], line: [a, b] }; }
    if (dm.k === 'distPL') { const p = refXY(r0), Ln = refLine(r1); if (!p || !Ln) return null; const [a, b] = Ln; const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; const f = [a[0] + t * dx, a[1] + t * dy]; return { p: [(p[0] + f[0]) / 2 + px * 10, (p[1] + f[1]) / 2], line: [p, f] }; }
    if (dm.k === 'angLL') {
      const A = refLine(r0), B = refLine(r1); if (!A || !B) return null;
      const ma = [(A[0][0] + A[1][0]) / 2, (A[0][1] + A[1][1]) / 2], mb = [(B[0][0] + B[1][0]) / 2, (B[0][1] + B[1][1]) / 2];
      return { p: [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2] };
    }
    return null;
  }
  // Wo steht das Schildchen eines Maßes? (Skizzen-Koordinaten)
  function dimPos(en, k) {
    const px = pxSize();
    if (k === 'x' || k === 'y') {
      const p = en.type === 'circle' || en.type === 'poly' || en.type === 'ellipse' ? en.c : en.a;
      if (k === 'x') return { p: [p[0] / 2, p[1] + px * 12], line: [[0, p[1]], p] };
      return { p: [p[0] - px * 18, p[1] / 2], line: [[p[0], 0], p] };
    }
    if (en.type === 'line' || en.type === 'slot') {
      const L = SK.d2(en.a, en.b) || 1, ux = (en.b[0] - en.a[0]) / L, uy = (en.b[1] - en.a[1]) / L, nx = -uy, ny = ux;
      if (k === 'len') { const off = (en.type === 'slot' ? en.r : 0) + px * 16; return { p: [(en.a[0] + en.b[0]) / 2 + nx * off, (en.a[1] + en.b[1]) / 2 + ny * off] }; }
      if (k === 'ang') return { p: [en.a[0] + ux * px * 34 - nx * px * 14, en.a[1] + uy * px * 34 - ny * px * 14] };
      if (k === 'w') return { p: [en.b[0] + ux * (en.r + px * 22), en.b[1] + uy * (en.r + px * 22)] };
    }
    if (en.type === 'rect') {
      const x0 = Math.min(en.a[0], en.b[0]), x1 = Math.max(en.a[0], en.b[0]), y0 = Math.min(en.a[1], en.b[1]), y1 = Math.max(en.a[1], en.b[1]);
      if (k === 'w') return { p: [(x0 + x1) / 2, y0 - px * 16] };
      if (k === 'h') return { p: [x1 + px * 26, (y0 + y1) / 2] };
    }
    if (en.type === 'arc' && k === 'r') { const ai = SK.arcInfo(en.a, en.m, en.b); if (!ai) return null; const d = SK.d2(en.m, ai.c) || 1; const q = px * 16; return { p: [en.m[0] + (en.m[0] - ai.c[0]) / d * q, en.m[1] + (en.m[1] - ai.c[1]) / d * q], line: [ai.c, en.m] }; }
    if (en.type === 'text' && k === 'h') { const tb = SK.textBox(en); if (!tb) return null; const r = en.rot || 0; return { p: [tb.c[0] - Math.sin(r) * (tb.h / 2 + px * 14), tb.c[1] + Math.cos(r) * (tb.h / 2 + px * 14)] }; }
    if (en.type === 'ellipse') { const r = en.rot || 0, cs = Math.cos(r), sn = Math.sin(r); if (k === 'w') return { p: [en.c[0] + cs * (en.rx + px * 16), en.c[1] + sn * (en.rx + px * 16)] }; if (k === 'h') return { p: [en.c[0] - sn * (en.ry + px * 14), en.c[1] + cs * (en.ry + px * 14)] }; }
    if (en.type === 'circle' || en.type === 'poly') {
      if (k === 'n') return { p: en.c.slice() };
      const q = Math.SQRT1_2 * en.r + px * 12; return { p: [en.c[0] + q, en.c[1] + q] };
    }
    return null;
  }
  Viewer.on('camera', () => { if (S) { render(); placeEntry(); } });

  // ---------- Rechte Leiste ----------
  function renderPanel(body) {
    if (!S) return;
    const w = h('div', { class: 'props' });
    if (!S.step && (S.ctx.mode === 'patpath' || isPathEdit())) w.append(h('div', { class: 'ok-box', id: 'path-hint', html: '<b>Kurve für das Muster</b> – die Kopien laufen sie vom Anfang bis zum Ende ab. Der Punkt markiert das Original: Am Ende der Kurve, das ihm näher liegt, geht es los. Ein Kreis oder ein geschlossener Umriss verteilt die Kopien rundherum.' }));
    if (S.ctx.mode === 'loftrail') w.append(h('div', { class: 'ok-box', id: 'loftrail-hint', html: '<b>Führungskurve für den Übergang</b> – sie gibt die Seitenlinie vor: Zwischen den Umrissen wird der Übergang in dieser Richtung so weit, dass er die Kurve berührt. Die Umrisse selbst bleiben, wie sie sind. Sie sollte vom ersten bis zum letzten Umriss laufen.' }));
    if (S.ctx.mode === 'loftrail2') w.append(h('div', { class: 'ok-box', id: 'loftrail2-hint', html: '<b>Zweite Führungskurve</b> – sie steht quer zur ersten und gibt die Breite in der anderen Richtung vor (z. B. von oben gesehen, wenn die erste von der Seite kommt). Der Übergang folgt beiden, die Umrisse bleiben gleich.' }));
    if (S.ctx.mode === 'loftpath') w.append(h('div', { class: 'ok-box', id: 'loftpath-hint', html: '<b>Mittellinie für den Übergang</b> – die Umrisse bleiben, wo sie sind (die dünnen Hilfskanten zeigen sie), und die Fläche dazwischen folgt der Linie. Sie sollte vom ersten Umriss durch alle anderen bis zum letzten laufen. Zieh die Punkte der Kurve oder zeichne eine neue Linie, einen Bogen oder eine Spline.' }));
    if (S.step) { w.append(h('div', { class: 'hint-box', html: S.step.revolve ? 'Wähle die Achse, um die gedreht wird. Klick im Bild auf Flächen, um sie ab- oder anzuwählen.' : 'Zieh am Pfeil im Bild oder tipp die Höhe ein. Klick auf Flächen, um sie ab- oder anzuwählen.' })); body.append(w); return; }
    const sel = S.ents.find((x) => x.id === S.sel);
    const selCon = S.selCon && S.cons.find((c) => c.id === S.selCon);
    if (selCon) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, 'Regel: ' + (CNAME[selCon.type] || selCon.type))));
      w.append(h('div', { class: 'hint-box', html: CHINTS[selCon.type] || '' }));
      const editNum = (id, label, unit, key) => w.append(UI.numField({ id, label, value: selCon[key], unit, onCommit: (v) => {
        const old = selCon[key]; selCon[key] = v;
        const r = reapply();
        if (r && !r.ok) { selCon[key] = old; reapply(); UI.toast('Dieser Wert widerspricht den anderen Regeln.', { kind: 'bad' }); }
        else { S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons.map((c) => (c === selCon ? { ...c, [key]: old } : c)) })); }
        render(); Panels.renderRight();
      } }));
      if (selCon.type === 'offset') {
        // Versatz einer ganzen Kette: alle Stücke, die zusammen entstanden sind, bekommen denselben Abstand
        const grp = selCon.og ? S.cons.filter((c) => c.type === 'offset' && c.og === selCon.og) : [selCon];
        w.append(UI.numField({ id: 'co-v', label: grp.length > 1 ? `Abstand (alle ${grp.length} Stücke)` : 'Abstand', value: selCon.v, unit: 'mm', onCommit: (v) => {
          const old = grp.map((c) => c.v); grp.forEach((c) => { c.v = v; });
          // die Originale möglichst stehen lassen – die Kopien wandern
          const pins = []; for (const c of grp) { const src = ent(c.refs[0].e); if (src) for (const k of Solver.varsOf(src) || []) pins.push([src.id, k, Solver.getK(src, k)]); }
          const r = reapply({ pins });
          if (r && !r.ok) { grp.forEach((c, i) => { c.v = old[i]; }); reapply(); UI.toast('Dieser Wert widerspricht den anderen Regeln.', { kind: 'bad' }); }
          else S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons.map((c) => { const i = grp.indexOf(c); return i >= 0 ? { ...c, v: old[i] } : c; }) }));
          render(); Panels.renderRight();
        } }));
        if (grp.length > 1) w.append(h('div', { class: 'hint-box', id: 'co-v-all', html: `Dieser Versatz gehört zu einer Kette aus <b>${grp.length} Stücken</b> – der Abstand gilt für alle zusammen.` }));
      }
      if (selCon.type === 'xform' && selCon.mode === 'rot') editNum('co-ang', 'Winkel', '°', 'ang');
      if (selCon.type === 'xform' && selCon.mode !== 'rot') { editNum('co-dx', 'Versatz X', 'mm', 'dx'); editNum('co-dy', 'Versatz Y', 'mm', 'dy'); }
      if (selCon.type === 'xform' && selCon.pg && selCon.pm) {
        // ganzes Muster: Anzahl und Abstand für alle Kopien zusammen
        const pm = selCon.pm, Q = pm.kind === 'circ' ? { n: pm.n, ang: pm.ang } : { nx: pm.nx, dx: pm.dx, ny: pm.ny, dy: pm.dy };
        const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Ganzes Muster'));
        const fm = h('div', { class: 'fields' });
        const fld = (id, label, key, unit, o2 = {}) => fm.append(UI.numField({ id, label, value: Q[key], unit, expr: false, min: o2.min, int: o2.int, onCommit: (v) => { Q[key] = v; } }));
        if (pm.kind === 'circ') { fld('pg-n', 'Anzahl', 'n', '', { min: 1, int: true }); fld('pg-ang', 'Winkel gesamt', 'ang', '°'); }
        else { fld('pg-nx', 'Anzahl in X', 'nx', '', { min: 1, int: true }); fld('pg-dx', 'Abstand in X', 'dx', 'mm'); fld('pg-ny', 'Anzahl in Y', 'ny', '', { min: 1, int: true }); fld('pg-dy', 'Abstand in Y', 'dy', 'mm'); }
        const ap = h('button', { type: 'button', class: 'btn primary', id: 'pg-apply' }); ap.innerHTML = icon('check') + 'Muster ändern';
        ap.onclick = () => regenPattern(selCon.pg, Q);
        sec.append(fm, h('div', { class: 'btn-row' }, ap), h('div', { class: 'hint-box', html: 'Ändert alle Kopien dieses Musters zusammen – die Anzahl zählt das Original mit.' }));
        w.append(sec);
      }
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + 'Regel löschen';
      del.onclick = () => removeCons(selCon.id);
      w.append(h('div', { class: 'btn-row' }, del));
      body.append(w); return;
    }
    if (sel) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, { point: 'Punkt', text: 'Text', line: 'Linie', rect: 'Rechteck', circle: 'Kreis', ellipse: 'Ellipse', arc: 'Bogen', slot: 'Langloch', poly: 'Vieleck', spline: 'Spline' }[sel.type])));
      if (sel.link) {
        const src = Model.find(App.doc, sel.link.id);
        const ub = h('button', { type: 'button', class: 'btn', id: 'link-off' }); ub.innerHTML = icon('ungroup') + 'Verbindung lösen';
        ub.onclick = () => { pushUndo(); delete sel.link; render(); Panels.renderRight(); };
        w.append(h('div', { class: 'ok-box', id: 'link-info', html: `<b>Verbunden</b> mit einer Kante von „${esc(src ? Model.label(src.item) : 'einem Körper')}“ – wandert mit, wenn sich der Körper ändert.` }), h('div', { class: 'btn-row' }, ub));
      }
      const upd = (fn) => { pushUndo(); fn(sel); reapply(); render(); Panels.renderRight(); };
      // Jedes eingetippte Maß wird fest (auch als Formel). Das Schloss löst es wieder.
      const dimField = (k, label, unit = 'mm', opts = {}) => {
        const dm = dimOf(sel.id, k);
        const fld = UI.numField({ id: 'se-' + k, label, value: dm ? dm.v : round(SK.measure(sel, k), 4), unit, min: opts.min, int: opts.int, onCommit: (v) => setDim(sel.id, k, v) });
        const box = fld.querySelector('.inp');
        if (dm) {
          fld.classList.add('dimmed');
          const bad = isNaN(Model.num(dm.v, vars(), NaN));
          if (bad) box.classList.add('invalid');
          const lk = h('button', { type: 'button', class: 'dimlock', 'data-tip': 'Festes Maß – klicken zum Lösen', 'aria-label': label + ' lösen' }); lk.innerHTML = icon('lock');
          lk.onclick = () => removeDim(sel.id, k);
          box.append(lk);
        }
        return fld;
      };
      const f = h('div', { class: 'fields' });
      if (sel.type === 'line') { f.append(dimField('len', 'Länge', 'mm', { min: 0.01 }), dimField('ang', 'Winkel', '°')); }
      else if (sel.type === 'rect') { f.append(dimField('w', 'Breite', 'mm', { min: 0.01 }), dimField('h', 'Höhe', 'mm', { min: 0.01 })); }
      else if (sel.type === 'circle') { f.append(dimField('d', 'Durchmesser', 'mm', { min: 0.01 })); }
      else if (sel.type === 'text') {
        w.append(UI.textField({ id: 'se-s', label: 'Text', value: sel.s, onCommit: (v) => { if (!v.trim()) { UI.toast('Ein leerer Text geht nicht – lösch das Element stattdessen.', { icon: 'info' }); Panels.renderRight(); return; } upd((e) => { e.s = v; }); } }));
        f.append(dimField('h', 'Höhe (Großbuchstaben)', 'mm', { min: 0.1 }));
        f.append(UI.selectField({ id: 'se-font', label: 'Schrift', value: sel.font || 'inter', options: Object.entries(SK.FONTNAMES), onChange: (v) => upd((e) => { e.font = v; }) }));
        f.append(UI.selectField({ id: 'se-align', label: 'Ausrichtung', value: sel.align || 'l', options: [['l', 'Links'], ['m', 'Mitte'], ['r', 'Rechts']], onChange: (v) => upd((e) => { e.align = v; }) }));
        if (!sel.on) f.append(UI.numField({ id: 'se-rot', label: 'Drehung', value: round(((sel.rot || 0) * 180) / Math.PI, 3), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
        f.append(UI.numField({ id: 'se-sp', label: 'Zeichenabstand', value: sel.sp || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { e.sp = v; }) }));
        // entlang einer offenen Kurve der Skizze (Linie, Bogen, Spline)
        const curves = S.ents.filter((x) => x.type === 'line' || x.type === 'arc' || (x.type === 'spline' && !x.closed));
        if (curves.length || sel.on) {
          const nm = { line: 'Linie', arc: 'Bogen', spline: 'Spline' };
          f.append(UI.selectField({ id: 'se-on', label: 'Entlang', value: sel.on || '', options: [['', 'Gerade'], ...curves.map((c, i) => [c.id, `${nm[c.type]} ${i + 1}${c.con ? ' (Hilfslinie)' : ''}`])], onChange: (v) => upd((e) => {
            if (v) { const c = S.ents.find((x) => x.id === v), pts = c && SK.textPathPts(c, false); if (!pts) return; e.on = v; e.onP = pts; e.align = 'm'; delete e.bend; }
            else { delete e.on; delete e.onP; delete e.os; delete e.flip; }
          }) }));
          if (sel.on) {
            f.append(UI.numField({ id: 'se-os', label: 'Verschieben entlang', value: sel.os || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { if (Math.abs(v) < 1e-9) delete e.os; else e.os = v; }) }));
            const fb = h('button', { type: 'button', class: 'btn', id: 'se-flip' }); fb.innerHTML = icon('mirror') + 'Andere Seite';
            fb.onclick = () => upd((e) => { e.flip = !e.flip; if (!e.flip) delete e.flip; const c = S.ents.find((x) => x.id === e.on); const pts = c && SK.textPathPts(c, e.flip); if (pts) e.onP = pts; });
            f.append(h('div', { class: 'btn-row' }, fb));
            const cv = S.ents.find((x) => x.id === sel.on);
            if (cv && !cv.con) w.append(h('div', { class: 'hint-box', id: 'se-on-hint', html: 'Tipp: Mach die Kurve zur <b>Hilfslinie</b> (Kurve anklicken → „Hilfslinie“) – dann zählt sie nicht zur Fläche und die Buchstaben stehen frei.' }));
          }
        }
        if (!sel.on) f.append(UI.numField({ id: 'se-bend', label: 'Bogen-Radius', value: sel.bend || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { if (Math.abs(v) < 1e-6) delete e.bend; else e.bend = v; }) }));
        // An Kreis oder Bogen legen: die Grundlinie läuft auf dem nächsten Kreis, Mitte des Texts dort, wo er gerade steht
        const rounds = S.ents.filter((x) => x.type === 'circle' || x.type === 'arc');
        if (rounds.length && !sel.on) {
          const ob = h('button', { type: 'button', class: 'btn', id: 'se-oncircle' }); ob.innerHTML = icon('circle') + 'An Kreis legen';
          ob.onclick = () => upd((e) => {
            const tb = e.align === 'm' ? null : SK.textBox(e), p0 = tb ? tb.c : e.a;   // Mitte der Grundlinie (bei „Mitte“ der Ankerpunkt)
            let best = null;
            for (const x of rounds) { const ci = x.type === 'circle' ? { c: x.c, r: x.r } : SK.arcInfo(x.a, x.m, x.b); if (!ci) continue; const d = Math.abs(Math.hypot(p0[0] - ci.c[0], p0[1] - ci.c[1]) - ci.r); if (!best || d < best.d) best = { ...ci, d }; }
            if (!best) return;
            const th = Math.atan2(p0[1] - best.c[1], p0[0] - best.c[0]);
            e.align = 'm'; e.bend = round(best.r, 4); e.rot = th - Math.PI / 2;
            e.a = [round(best.c[0] + Math.cos(th) * best.r, 4), round(best.c[1] + Math.sin(th) * best.r, 4)];
          });
          f.append(h('div', { class: 'btn-row' }, ob));
        }
        const tb = SK.textBox(sel); if (tb) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Größe'), h('b', { class: 'mono' }, fmt(tb.w, 2) + ' × ' + fmt(tb.h, 2) + ' mm')));
      }
      else if (sel.type === 'ellipse') {
        f.append(dimField('w', 'Breite (Achse 1)', 'mm', { min: 0.01 }), dimField('h', 'Höhe (Achse 2)', 'mm', { min: 0.01 }));
        f.append(UI.numField({ id: 'se-rot', label: 'Drehung', value: round(((sel.rot || 0) * 180) / Math.PI, 3), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
      }
      else if (sel.type === 'poly') { f.append(dimField('d', 'Durchmesser', 'mm', { min: 0.01 }), dimField('n', 'Ecken', '', { min: 3, int: true })); }
      else if (sel.type === 'slot') { f.append(dimField('len', 'Länge (Mitte–Mitte)', 'mm', { min: 0.01 }), dimField('w', 'Breite', 'mm', { min: 0.01 })); }
      else if (sel.type === 'arc') {
        const ai = SK.arcInfo(sel.a, sel.m, sel.b); if (ai) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Radius'), h('b', { class: 'mono' }, fmt(ai.r, 3) + ' mm')));
      }
      w.append(f);
      const fp = h('div', { class: 'fields' });
      const ak = sel.type === 'circle' || sel.type === 'poly' || sel.type === 'ellipse' ? 'Mitte' : sel.type === 'point' ? 'Punkt' : 'Start';
      fp.append(dimField('x', ak + ' X'), dimField('y', ak + ' Y'));
      w.append(fp);
      if (S.dims.some((d) => d.e === sel.id)) w.append(h('div', { class: 'hint-box', html: 'Werte mit <b>Schloss</b> sind fest und bleiben beim Ziehen erhalten. Formeln wie <b>breite/2</b> rechnen mit den Namen aus „Maße“.' }));
      // Regeln an diesem Element
      const mine = S.cons.filter((c) => conRefs(c).some((r) => r && r.e === sel.id));
      if (mine.length) {
        const list = h('div', { class: 'mini-list' });
        for (const c of mine) {
          const row = h('div', { class: 'mini-row' });
          const ic = h('span', { class: 'con-ic' }); ic.innerHTML = icon(CICON[c.type] || 'info');
          const x = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': 'Regel löschen', 'aria-label': 'Regel löschen' }); x.innerHTML = icon('close'); x.onclick = () => removeCons(c.id);
          row.append(ic, h('span', { class: 'grow' }, CNAME[c.type] || c.type), x); list.append(row);
        }
        w.append(h('div', { class: 'section-h' }, 'Regeln'), list);
      }
      const isFree = !S.status || !S.status.freeEnts || S.status.freeEnts.has(sel.id);
      w.append(h('div', { class: isFree ? 'hint-box' : 'ok-box', html: isFree ? 'Dieses Element ist noch <b>beweglich</b> (blau).' : 'Dieses Element liegt <b>fest</b> – Maße und Regeln bestimmen es ganz.' }));
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'se-con', checked: !!sel.con }), 'Hilfslinie (zählt nicht zur Fläche)');
      con.querySelector('input').onchange = (e) => upd((x) => { x.con = e.target.checked; });
      w.append(con);
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + 'Löschen';
      del.onclick = () => deleteEnt(sel.id);
      w.append(h('div', { class: 'btn-row' }, del));
    } else {
      // Zustand der ganzen Skizze
      const st = S.status;
      if (st && S.ents.length) {
        if (!st.ok) w.append(h('div', { class: 'err-box', html: '<b>' + ERRORS.sketchOverConstrained.titel + '</b><br>' + ERRORS.sketchOverConstrained.erklaerung + ' ' + ERRORS.sketchOverConstrained.loesung }));
        else if (st.dof === 0) w.append(h('div', { class: 'ok-box', html: '<b>Voll bestimmt</b> – alles liegt fest. Dunkle Linien können nicht mehr verrutschen.' }));
        else w.append(h('div', { class: 'hint-box', html: `<b>Noch ${st.dof} ${st.dof === 1 ? 'Freiheit' : 'Freiheiten'}</b> – <span style="color:${Viewer.theme.dark ? '#5aa9ff' : '#1c6fd1'};font-weight:600">blaue</span> Teile lassen sich noch verschieben. Mit Maßen und Regeln legst du sie fest.` }));
      }
      w.append(h('div', { class: 'hint-box', html: HINTS[S.tool] }));
      if (S.tool === 'corner') {
        const C = S.corner;
        w.append(UI.segmented ? UI.segmented({ id: 'cn-mode', value: C.mode, options: [['fillet', 'Rundung'], ['chamfer', 'Fase']], onChange: (v) => { C.mode = v; Panels.renderRight(); render(); } })
          : UI.selectField({ id: 'cn-mode', label: 'Art', value: C.mode, options: [['fillet', 'Rundung'], ['chamfer', 'Fase']], onChange: (v) => { C.mode = v; Panels.renderRight(); render(); } }));
        w.append(UI.numField({ id: 'cn-r', label: C.mode === 'fillet' ? 'Radius' : 'Abstand', value: C.r, unit: 'mm', expr: false, min: 0.01, onCommit: (v) => { if (v > 0) C.r = v; render(); } }));
        { const ab = h('button', { type: 'button', class: 'btn', id: 'cn-all' }); ab.innerHTML = icon('fillet') + 'Alle Ecken auf einmal'; ab.onclick = () => cornerAll(); w.append(h('div', { class: 'btn-row' }, ab)); }
      }
      if (S.tool === 'bg' || S.tool === 'bgcal') {
        const B = S.bg;
        const lb = h('button', { type: 'button', class: 'btn' + (B ? '' : ' primary'), id: 'bg-load' }); lb.innerHTML = icon('image') + (B ? 'Anderes Bild …' : 'Bild laden …'); lb.onclick = bgLoad;
        w.append(h('div', { class: 'btn-row' }, lb));
        if (B) {
          const cal = h('button', { type: 'button', class: 'btn' + (S.tool === 'bgcal' ? ' primary' : ''), id: 'bg-cal' }, S.tool === 'bgcal' ? 'Zwei Punkte anklicken …' : 'Maßstab festlegen');
          cal.onclick = () => { S.bgCal = null; setTool(S.tool === 'bgcal' ? 'bg' : 'bgcal'); };
          w.append(h('div', { class: 'btn-row' }, cal));
          const f4 = h('div', { class: 'fields' });
          f4.append(UI.numField({ id: 'bg-w', label: 'Breite', value: B.w, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) { B.w = v; render(); } } }));
          f4.append(UI.numField({ id: 'bg-op', label: 'Deckkraft', value: Math.round((B.op ?? 0.5) * 100), unit: '%', expr: false, min: 5, int: true, onCommit: (v) => { B.op = clamp(v, 5, 100) / 100; render(); } }));
          w.append(f4);
          const hide = h('button', { type: 'button', class: 'btn', id: 'bg-hide' }, B.hide ? 'Einblenden' : 'Ausblenden'); hide.onclick = () => { B.hide = !B.hide; render(); Panels.renderRight(); };
          const del = h('button', { type: 'button', class: 'btn danger', id: 'bg-del' }); del.innerHTML = icon('trash') + 'Entfernen'; del.onclick = () => { S.bg = null; render(); Panels.renderRight(); };
          w.append(h('div', { class: 'btn-row' }, hide, del));
          w.append(h('div', { class: 'hint-box', html: 'Das Bild ist nur eine Vorlage zum Nachzeichnen. Es wird mit der Skizze gespeichert, kommt aber nicht in den Körper oder den Export.' }));
        }
      }
      if (S.tool === 'wall') {
        const fw = h('div', { class: 'fields' });
        fw.append(UI.numField({ id: 'wall-t', label: 'Wandstärke', value: S.wallT, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) S.wallT = v; } }));
        w.append(fw);
      }
      if (S.tool === 'tpl') {
        const T = S.tpl;
        w.append(UI.selectField({ id: 'tp-type', label: 'Schablone', value: T.type, options: Object.entries(SKO.TEMPLATES).map(([k, v]) => [k, v.name]), onChange: (v) => { T.type = v; T.p = { ...SKO.TEMPLATES[v].p }; Panels.renderRight(); render(); } }));
        const f6 = h('div', { class: 'fields' });
        for (const k of Object.keys(SKO.TEMPLATES[T.type].p)) {
          const isInt = ['nx', 'ny', 'n'].includes(k);
          f6.append(UI.numField({ id: 'tp-' + k, label: SKO.TPLNAMES[k] || k, value: T.p[k], unit: isInt ? '' : 'mm', expr: false, int: isInt, min: isInt ? 1 : 0, onCommit: (v) => { T.p[k] = v; render(); } }));
        }
        const note = SKO.TEMPLATES[T.type].note;
        w.append(f6);
        if (note) w.append(h('div', { class: 'hint-box', id: 'tp-note' }, note));
        w.append(h('div', { class: 'hint-box', html: 'Die Werte sind übliche Standardmaße – prüf sie mit dem Datenblatt deines Bauteils. Danach sind es normale Linien, Bögen, Rechtecke und Kreise, die du einzeln ändern kannst.' }));
      }
      if (S.tool === 'text') {
        const T = S.txt;
        w.append(UI.textField({ id: 'tx-s', label: 'Text', value: T.s, live: true, onCommit: (v) => { T.s = v; } }));
        const f3 = h('div', { class: 'fields' });
        f3.append(UI.numField({ id: 'tx-h', label: 'Höhe (Großbuchstaben)', value: T.h, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) T.h = v; } }));
        f3.append(UI.selectField({ id: 'tx-font', label: 'Schrift', value: T.font, options: Object.entries(SK.FONTNAMES), onChange: (v) => { T.font = v; } }));
        f3.append(UI.selectField({ id: 'tx-align', label: 'Ausrichtung', value: T.align, options: [['l', 'Links'], ['m', 'Mitte'], ['r', 'Rechts']], onChange: (v) => { T.align = v; } }));
        w.append(f3);
      }
      if (S.tool === 'slot') w.append(UI.selectField({ id: 'sl-mode', label: 'Langloch', value: S.slotArc ? 'arc' : 'line', options: [['line', 'Gerade'], ['arc', 'Gebogen (um eine Mitte)']], onChange: (v) => { S.slotArc = v === 'arc'; S.draft = null; render(); UI.hint(S.slotArc ? 'Gebogenes Langloch: Mitte klicken, dann Anfang, dann Ende (gegen den Uhrzeigersinn), zum Schluss die Breite.' : HINTS.slot); } }));
      if (S.tool === 'circle') w.append(UI.selectField({ id: 'ci-mode', label: 'Kreis', value: S.circMode || 'center', options: [['center', 'Mitte und Größe'], ['2p', 'Zwei Punkte (Durchmesser)'], ['3p', 'Drei Punkte']], onChange: (v) => { S.circMode = v; S.draft = null; render(); } }));
      if (S.tool === 'arc') w.append(UI.selectField({ id: 'ar-mode', label: 'Bogen', value: S.arcMode || '3p', options: [['3p', 'Start, Ende, Wölbung'], ['tan', 'Tangential an Linie oder Bogen']], onChange: (v) => { S.arcMode = v; S.draft = null; render(); } }));
      if (S.tool === 'rect') w.append(UI.selectField({ id: 'rk-mode', label: 'Aufziehen', value: S.rect3 ? 'r3' : S.rectMid ? 'mid' : 'corner', options: [['corner', 'Von Ecke zu Ecke'], ['mid', 'Von der Mitte aus'], ['r3', 'Gedreht: Kante, dann Höhe']], onChange: (v) => { S.rectMid = v === 'mid'; S.rect3 = v === 'r3'; if (S.draft) S.draft = null; render(); } }));
      if (S.tool === 'poly') w.append(UI.selectField({ id: 'po-mode', label: 'Getipptes Maß', value: S.polyFlats ? 'flats' : 'corners', options: [['corners', 'Über die Ecken (Umkreis)'], ['flats', 'Über die Flächen (Schlüsselweite)']], onChange: (v) => { S.polyFlats = v === 'flats'; } }));
      if (S.tool === 'poly') w.append(UI.numField({ id: 'sk-n', label: 'Ecken', value: S.polySides, unit: '', expr: false, min: 3, int: true, onCommit: (v) => { S.polySides = clamp(v, 3, 64); } }));
      if (S.tool === 'patrect' || S.tool === 'patcirc') {
        const P = S.pat; const f2 = h('div', { class: 'fields' });
        const fld = (id, label, key, unit, opts = {}) => f2.append(UI.numField({ id, label, value: P[key], unit, expr: false, min: opts.min, int: opts.int, onCommit: (v) => { P[key] = v; render(); } }));
        if (S.tool === 'patrect') { fld('pt-nx', 'Anzahl in X', 'nx', '', { min: 1, int: true }); fld('pt-dx', 'Abstand in X', 'dx', 'mm'); fld('pt-ny', 'Anzahl in Y', 'ny', '', { min: 1, int: true }); fld('pt-dy', 'Abstand in Y', 'dy', 'mm'); }
        else { fld('pt-n', 'Anzahl', 'n', '', { min: 2, int: true }); fld('pt-ang', 'Winkel gesamt', 'ang', '°'); }
        w.append(f2);
        if (S.tool === 'patcirc') {
          const cb = h('button', { type: 'button', class: 'btn' + (S.patPick ? ' primary' : ''), id: 'pt-center' }, S.patPick ? 'Klick einen Punkt …' : 'Mittelpunkt wählen');
          cb.onclick = () => { S.patPick = !S.patPick; UI.hint(S.patPick ? 'Klick den Punkt an, um den gedreht wird.' : HINTS.patcirc); Panels.renderRight(); render(); };
          w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Mitte: ' + (S.patCenter ? 'gewählter Punkt' : 'Nullpunkt'))), h('div', { class: 'btn-row' }, cb));
        }
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'pt-make' }, `Muster anlegen (${S.patSel.length} gewählt)`);
        ok.disabled = !S.patSel.length; ok.onclick = () => createPattern();
        w.append(h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'mirror' && !S.mir) {
        const mk = (lab, id, dir) => { const b = h('button', { type: 'button', class: 'btn', id }, lab); b.onclick = () => mirrorAxis(dir); return b; };
        w.append(h('div', { class: 'btn-row' }, mk('An der X-Achse', 'mir-x', 'x'), mk('An der Y-Achse', 'mir-y', 'y')));
      }
      if (S.tool === 'mirror' && S.mir) {
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'mir-make' }, S.mir.sel.length ? `${S.mir.sel.length} Elemente spiegeln` : 'Alles spiegeln');
        ok.onclick = () => mirrorAll(); w.append(h('div', { class: 'btn-row' }, ok));
      }
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'sk-con', checked: S.construction }), 'Als Hilfslinien zeichnen');
      con.querySelector('input').onchange = (e) => { S.construction = e.target.checked; syncConBtn(); };
      w.append(con);
      const sn = h('details', { class: 'snapset' }, h('summary', null, 'Fangen'));
      sn.open = !!S.snapOpen; sn.addEventListener('toggle', () => { S.snapOpen = sn.open; });
      for (const [k, lab] of SNAPLIST) {
        const cbx = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'snap-' + k, checked: S.snapSet[k] !== false }), lab);
        cbx.querySelector('input').onchange = (e) => { S.snapSet[k] = e.target.checked; };
        sn.append(cbx);
      }
      sn.append(h('div', { class: 'hint-box', html: 'Mit gedrückter <b>Alt</b>-Taste wird gar nicht gefangen.' }));
      w.append(sn);
      if (S.ctx.mode !== 'pushpull') {
        const pe = h('details', { class: 'snapset', id: 'sk-plane' }, h('summary', null, 'Ebene verschieben / neigen'));
        pe.open = !!(S.planeOpen || S.pOff || S.pTilt); pe.addEventListener('toggle', () => { S.planeOpen = pe.open; });
        const f5 = h('div', { class: 'fields' });
        f5.append(UI.numField({ id: 'pl-off', label: 'Abstand', value: S.pOff || 0, unit: 'mm', expr: false, onCommit: (v) => { S.pOff = v; applyPlane(false); } }));
        f5.append(UI.numField({ id: 'pl-tilt', label: 'Neigung', value: S.pTilt || 0, unit: '°', expr: false, onCommit: (v) => { S.pTilt = clamp(v, -89, 89); applyPlane(true); Panels.renderRight(); } }));
        pe.append(f5, h('div', { class: 'hint-box', html: 'Verschiebt die Zeichenebene entlang ihrer Richtung oder kippt sie um ihre X-Achse – z. B. für einen Kamerahalter mit 30° Neigung.' }));
        w.append(pe);
      }
      const regs = SK.regions(S.ents);
      if (S.ctx.mode === 'patpath' || isPathEdit()) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Teile auf der Kurve (mit Original)'), h('b', { class: 'mono', id: 'path-count' }, String(S.pathCount || 0))));
      else if (isLoftLine()) { if (!SK.chains(S.ents).length) w.append(h('div', { class: 'err-box' }, 'Noch keine offene Linie – die Mittellinie braucht einen Anfang und ein Ende.')); }
      else {
        w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Geschlossene Flächen'), h('b', { class: 'mono' }, String(regs.length))));
        if (SK.openEnds(S.ents).length) w.append(h('div', { class: 'err-box' }, 'Rot markierte Enden sind noch offen. Verbinde sie, damit eine Fläche entsteht.'));
      }
    }
    w.append(h('div', { class: 'hint-box', html: 'Ansicht verschieben: <b>rechte Maustaste</b> · Zoomen: <b>Mausrad</b> · Genauer: <b>Umschalt</b> halten' }));
    body.append(w);
  }

  // ---------- Fertig / Hochziehen ----------
  function done() {
    if (!S) return;
    S.draft = null; hideEntry();
    const regs = SK.regions(S.ents);
    const editKind = S.ctx.mode === 'edit' ? (Model.find(App.doc, S.ctx.editId) || { item: {} }).item.kind : null;
    const pathMode = S.ctx.mode === 'patpath' || isPathEdit();
    if (isLoftLine()) {
      const rk = railKey(), nm = rk === 'rail2' ? 'zweiten Führungskurve' : rk ? 'Führungskurve' : 'Mittellinie';
      if (!SK.chains(S.ents).length) { UI.toast(`Die ${rk === 'rail2' ? 'zweite Führungskurve' : nm} braucht eine offene Linie, einen Bogen oder eine Spline – keinen geschlossenen Umriss.`, { kind: 'bad', icon: 'info' }); return; }
      const id = S.ctx.id, sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons };
      App.extra = []; finishSession();
      App.change(rk === 'rail2' ? 'Zweite Führungskurve' : rk ? 'Führungskurve' : 'Mittellinie', (doc) => { const f = Model.find(doc, id); if (!f) return false; if (rk) { f.item.p[rk] = sk; delete f.item.p.path; } else { f.item.p.path = sk; delete f.item.p.rail; delete f.item.p.rail2; } });
      App.select([id]); UI.toast(`Der Übergang folgt jetzt der ${nm}.`, { icon: 'check' }); return;
    }
    if (pathMode && !SK.chains(S.ents).length && !regs.length) { UI.toast('Zeichne zuerst eine Kurve: eine Linie, einen Bogen, eine Spline oder einen Kreis.', { kind: 'bad', icon: 'info' }); return; }
    if (S.ctx.mode === 'patpath') {
      const sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons }, ids = S.ctx.ids;
      finishSession(); Features.pathFromSketch(ids, sk); return;
    }
    if (S.ctx.mode === 'edit') {
      if (!pathMode && (editKind === 'sweep' ? !SK.chains(S.ents).length : !regs.length)) { UI.toast(editKind === 'sweep' ? 'Der Pfad braucht mindestens eine offene Linie, einen Bogen oder eine Spline.' : 'Die Skizze braucht mindestens eine geschlossene Fläche.', { kind: 'bad' }); return; }
      const id = S.ctx.editId, ents = S.ents, dims = S.dims, cons = S.cons, plane = deepClone(S.plane), bg = S.bg ? deepClone(S.bg) : null;
      App.change('Skizze bearbeitet', (doc) => { const f = Model.find(doc, id); f.item.p.sketch.ents = ents; f.item.p.sketch.dims = dims; f.item.p.sketch.cons = cons; f.item.p.sketch.plane = plane; if (bg) f.item.p.sketch.bg = bg; else delete f.item.p.sketch.bg; const keys = regs.map((r) => r.key); if (f.item.p.sel) f.item.p.sel = f.item.p.sel.filter((k) => keys.includes(k)); });
      finishSession(); App.select([id]); return;
    }
    // nur Punkte auf einer Körperfläche: an jedem Punkt eine Bohrung (Bohrungs-Assistent)
    const pts = S.ents.filter((e) => e.type === 'point' && !e.con);
    if (!regs.length && pts.length && !SK.chains(S.ents).length) {
      if (!S.ctx.targetId) { UI.toast('Punkte werden zu Bohrungen, wenn die Skizze auf einer Körperfläche liegt – starte sie mit Doppelklick auf die Fläche.', { kind: 'bad', icon: 'info' }); return; }
      const id = S.ctx.targetId, n = S.F.n.clone(), wp = pts.map((e) => toWorld(e.a[0], e.a[1]));
      finishSession(); Place.holesAtPoints(id, wp, n); return;
    }
    if (!regs.length && SK.chains(S.ents).length) { sweepFromSketch(); return; }
    if (!regs.length) { UI.toast(S.ents.length ? 'Noch keine geschlossene Fläche. Schließe den Umriss oder zeichne ein Rechteck oder einen Kreis.' : 'Zeichne zuerst etwas, zum Beispiel ein Rechteck.', { kind: 'bad', icon: 'info' }); return; }
    extrudeStep({ dist: S.ctx.targetId ? 5 : 10, dir: 'normal' });
  }
  let stepBox = null, arrow = null;
  function tiltView() {
    const regs = SK.regions(S.ents); const b = SK.bounds(S.ents) || [-20, -20, 20, 20];
    const c = toWorld((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    const size = Math.max(30, Math.hypot(b[2] - b[0], b[3] - b[1]));
    const dir = S.F.n.clone().multiplyScalar(0.8).add(new THREE.Vector3(0.35, -0.55, 0.55)).normalize();
    const fov = (Viewer.camera.fov * Math.PI) / 180;
    const dist = (size / Math.tan(fov / 2)) * 0.95;
    // Das Einstellfenster liegt links oben: Modell etwas nach rechts rücken
    const cw = Viewer.container.clientWidth, ch = Viewer.container.clientHeight || 1;
    const target = c.clone();
    const pxs = (2 * dist * Math.tan(fov / 2)) / ch;
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 0, 1)).normalize();
    if (cw > 700) target.addScaledVector(right, -150 * pxs);
    else { const upS = new THREE.Vector3().crossVectors(right, fwd).normalize(); target.addScaledVector(upS, 0.2 * ch * pxs); }   // Handy: Fenster oben, Modell tiefer zeigen
    Viewer.moveCamera(target.clone().addScaledVector(dir, dist), target, new THREE.Vector3(0, 0, 1));
  }
  function extrudeStep(opts) {
    hideBar(); tiltView();
    const regs = SK.regions(S.ents);
    const tgt = S.ctx.targetId ? Model.find(App.doc, S.ctx.targetId) : null;
    S.step = { dist: opts.dist, dir: opts.dir, sel: regs.map((r) => r.key), revolve: false, axis: 'y', angle: 360, fromPushPull: !!opts.fromPushPull, color: tgt ? tgt.item.color : nextColor() };
    stepBox = h('div', { class: 'stepbox' });
    renderStep();
    $('#overlay').append(stepBox);
    Panels.renderRight();
    updatePreview(); render();
  }
  function renderStep() {
    const st = S.step; stepBox.innerHTML = '';
    UI.hint(st.revolve ? 'Wähl die <b>Achse</b> und den <b>Winkel</b> – 360° ergibt einen ganzen Drehkörper, zum Beispiel eine Schale oder einen Knopf.' : 'Zieh am <b>Pfeil</b> oder tipp die Höhe ein. Nach innen wird es ein <b>Loch</b>.');
    stepBox.append(h('h3', null, st.revolve ? 'Drehen' : (st.dir === 'reverse' ? 'Hineindrücken (Loch)' : 'Hochziehen')));
    const seg = h('div', { class: 'role-switch' });
    const a = h('button', { type: 'button', 'aria-pressed': !st.revolve ? 'true' : 'false' }); a.innerHTML = icon('lift') + 'Hochziehen'; a.onclick = () => { st.revolve = false; renderStep(); updatePreview(); };
    const b = h('button', { type: 'button', 'aria-pressed': st.revolve ? 'true' : 'false' }); b.innerHTML = icon('rotate') + 'Drehen'; b.onclick = () => { st.revolve = true; renderStep(); updatePreview(); };
    seg.append(a, b); if (!st.fromPushPull) stepBox.append(seg);
    if (!st.revolve) {
      stepBox.append(UI.numField({ id: 'st-dist', label: 'Höhe', value: st.dist, onCommit: (v) => { st.dist = v; updatePreview(); } }));
      stepBox.append(UI.selectField({ id: 'st-dir', label: 'Richtung', value: st.dir, options: [['normal', S.ctx.targetId ? 'Nach außen (Körper)' : 'Nach oben'], ['reverse', S.ctx.targetId ? 'Nach innen (Loch)' : 'Nach unten'], ['both', 'Beidseitig']], onChange: (v) => { st.dir = v; renderStep(); updatePreview(); } }));
    } else {
      const sel = S.ents.find((x) => x.id === S.sel && x.type === 'line');
      const opts = [['y', 'Um die senkrechte Achse'], ['x', 'Um die waagerechte Achse']];
      if (S.ents.some((x) => x.type === 'line')) opts.push(['line', 'Um eine Linie der Skizze']);
      stepBox.append(UI.selectField({ id: 'st-axis', label: 'Achse', value: st.axis, options: opts, onChange: (v) => { st.axis = v; if (v === 'line') { const l = S.ents.find((x) => x.type === 'line' && x.con) || S.ents.find((x) => x.type === 'line'); st.axisLine = l ? l.id : null; } updatePreview(); renderStep(); } }));
      if (st.axis === 'line') {
        const lines = S.ents.filter((x) => x.type === 'line');
        stepBox.append(UI.selectField({ id: 'st-line', label: 'Linie', value: st.axisLine, options: lines.map((l, i) => [l.id, `Linie ${i + 1} (${fmt(SK.d2(l.a, l.b), 1)} mm)${l.con ? ' – Hilfslinie' : ''}`]), onChange: (v) => { st.axisLine = v; updatePreview(); } }));
      }
      stepBox.append(UI.numField({ id: 'st-angle', label: 'Winkel', value: st.angle, unit: '°', min: 1, onCommit: (v) => { st.angle = clamp(v, 1, 360); updatePreview(); } }));
    }
    const hole = !st.revolve && st.dir === 'reverse' && S.ctx.targetId;
    stepBox.append(h('p', null, hole ? 'Wird als Loch aus dem Körper geschnitten.' : S.ctx.targetId ? 'Wird Teil des Körpers, auf dem du gezeichnet hast.' : 'Wird ein neuer Körper.'));
    const row = h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } });
    const back = h('button', { type: 'button', class: 'btn ghost' }); back.innerHTML = st.fromPushPull ? 'Abbrechen' : icon('undo') + 'Skizze'; back.dataset.tip = st.fromPushPull ? '' : 'Zurück zur Skizze'; back.onclick = () => stepBack();
    const ok = h('button', { type: 'button', class: 'btn primary' }); ok.innerHTML = icon('check') + 'Fertig'; ok.onclick = () => stepOK();
    row.append(back, ok); stepBox.append(row);
  }
  function stepItem() {
    const st = S.step;
    const regs = SK.regions(S.ents);
    const sel = st.sel && st.sel.length && st.sel.length < regs.length ? st.sel.slice() : null;
    const role = !st.revolve && st.dir === 'reverse' && S.ctx.targetId ? 'hole' : 'solid';
    const kind = st.revolve ? 'revolve' : 'extrude';
    const target = S.ctx.targetId ? Model.find(App.doc, S.ctx.targetId) : null;
    const it = Model.newItem(kind, {}, { name: st.revolve ? 'Drehkörper' : role === 'hole' ? 'Aussparung' : S.ctx.targetId ? 'Erhöhung' : 'Skizzenkörper', role, color: st.color });
    const p = { sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...(S.bg ? { bg: deepClone(S.bg) } : {}) }, sel };
    if (kind === 'extrude') { p.dist = st.dist; p.dir = st.dir; if (role === 'hole') p.extra = 0.05; else if (S.ctx.targetId) p.extra = 0.02; }
    else {
      p.angle = st.angle;
      if (st.axis === 'x') p.axis = { a: [0, 0], b: [1, 0] };
      else if (st.axis === 'line' && st.axisLine) { const l = S.ents.find((x) => x.id === st.axisLine); if (l) { p.axis = { a: l.a, b: l.b }; } }
      else p.axis = { a: [0, 0], b: [0, 1] };
    }
    it.p = p;
    return it;
  }
  const previewUpd = debounce(() => {
    if (!S || !S.step) return;
    const it = stepItem();
    // Vorschau als Objekt in Weltlage
    Model.setFromMatrix(it, S.W);
    it.id = '__preview';
    App.extra = [it];
    App.rebuild();
    placeArrow();
  }, 60);
  function updatePreview() { previewUpd(); }
  function arrowPos() {
    const regs = SK.regions(S.ents); const r = regs.find((x) => S.step.sel.includes(x.key)) || regs[0];
    const lab = r ? r.label : [0, 0];
    const st = S.step; const V = Model.vars(App.doc).v; const d = Model.num(st.dist, V, 10);
    const sgn = st.dir === 'reverse' ? -1 : 1; const off = st.dir === 'both' ? d / 2 : d;
    return toWorld(lab[0], lab[1]).addScaledVector(S.F.n, sgn * off);
  }
  function placeArrow() {
    if (arrow) { arrow.remove(); arrow = null; }
    for (const l of labels.filter((x) => x.classList.contains('steplabel'))) l.remove();
    if (!S || !S.step || S.step.revolve) { Viewer.requestRender(); return; }
    const p = arrowPos();
    const dir = S.F.n.clone().multiplyScalar(S.step.dir === 'reverse' ? -1 : 1);
    const ps = Viewer.pixelSizeAt(p);
    const a = Viewer.toScreen(p), b = Viewer.toScreen(p.clone().addScaledVector(dir, 40 * ps));
    let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy);
    if (L < 6) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    // Pfeil im Bildschirm: zeigt immer in Zugrichtung, gut greifbar
    arrow = h('div', { class: 'pull-arrow', role: 'slider', 'aria-label': 'Höhe ziehen', 'data-tip': 'Ziehen ändert die Höhe' });
    arrow.innerHTML = '<svg viewBox="0 0 30 58" aria-hidden="true"><circle cx="15" cy="50" r="5.5" class="pa-base"/><path d="M15 46V20" class="pa-shaft"/><path d="M15 3 26 21H4z" class="pa-head"/></svg>';
    arrow.style.left = a.x + 'px'; arrow.style.top = a.y + 'px';
    arrow.style.transform = `translate(-50%, -86%) rotate(${ang}deg)`;
    arrow.style.transformOrigin = '50% 86%';
    arrow.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const p0 = arrowPos();
      S.step.dragging = { p0, s0: axisParam(p0, e), d0: signedDist() };
      arrow.setPointerCapture(e.pointerId);
    });
    arrow.addEventListener('pointermove', (e) => { if (S && S.step && S.step.dragging) stepMove(e); });
    arrow.addEventListener('pointerup', () => stepUp());
    $('#overlay').append(arrow);
    // Höhe neben der Pfeilspitze
    const tipX = a.x + dx * 46, tipY = a.y + dy * 46;
    const el = h('div', { class: 'dimlabel live steplabel' }, fmt(Model.num(S.step.dist, Model.vars(App.doc).v, 10), 2) + ' mm');
    el.style.left = tipX + (dx >= 0 ? 34 : -34) + 'px'; el.style.top = tipY + 'px'; $('#overlay').append(el); labels.push(el);
  }
  Viewer.on('camera', () => { if (S && S.step && !S.step.dragging) placeArrow(); });
  function stepDown(e) {
    if (e.button !== 0 || !S.step) return;
    // Fläche an-/abwählen
    const uv = mouseUV(e); if (!uv) return;
    const r = SK.regionAt(SK.regions(S.ents), uv);
    if (r) {
      const st = S.step; const i = st.sel.indexOf(r.key);
      if (i >= 0) { if (st.sel.length > 1) st.sel.splice(i, 1); else UI.toast('Mindestens eine Fläche muss gewählt bleiben.', { icon: 'info' }); }
      else st.sel.push(r.key);
      render(); updatePreview();
    }
  }
  function signedDist() { const V = Model.vars(App.doc).v; const d = Model.num(S.step.dist, V, 10); return S.step.dir === 'reverse' ? -d : d; }
  function axisParam(p0, e) {
    const ray = Viewer.setRay(e.clientX, e.clientY).ray; const dir = S.F.n;
    const w0 = p0.clone().sub(ray.origin); const a = 1, b = dir.dot(ray.direction), c = 1, d = dir.dot(w0), ee = ray.direction.dot(w0);
    const den = a * c - b * b; if (Math.abs(den) < 1e-9) return 0; return (b * ee - c * d) / den;
  }
  function stepMove(e) {
    const dr = S.step && S.step.dragging; if (!dr) return;
    const s = axisParam(dr.p0, e);
    const grid = App.doc.settings.snap === false ? 0 : (e.shiftKey ? 0.1 : App.doc.settings.grid || 1);
    let v = dr.d0 + (s - dr.s0);
    if (grid) v = Math.round(v / grid) * grid;
    if (Math.abs(v) < (grid || 0.1)) v = v < 0 ? -(grid || 0.1) : (grid || 0.1);
    const st = S.step;
    const newDir = st.dir === 'both' ? 'both' : v < 0 ? 'reverse' : 'normal';
    const changedDir = newDir !== st.dir;
    st.dir = newDir; st.dist = round(Math.abs(v), 4);
    if (changedDir) renderStep(); else { const inp = $('#st-dist'); if (inp) inp.value = fmt(st.dist, 3); }
    updatePreview();
    placeArrowSoon();
  }
  const placeArrowSoon = throttle(() => { if (S && S.step) { const d = S.step.dragging; placeArrow(); if (d) S.step.dragging = d; } }, 50);
  function stepUp() { if (S && S.step && S.step.dragging) { S.step.dragging = null; renderStep(); } }
  function stepBack() {
    if (S.step.fromPushPull) { cancel(); return; }
    S.step = null; App.extra = []; App.rebuild();
    if (stepBox) { stepBox.remove(); stepBox = null; }
    { const b = SK.bounds([...S.ents, ...S.refs]); const size = b ? Math.max(40, Math.max(b[2] - b[0], b[3] - b[1]) * 0.75) : 70; const c2 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]; Viewer.lookAtPlane(toWorld(c2[0], c2[1]).toArray(), S.F.n.toArray(), S.F.x.toArray(), size); }
    placeArrow(); showBar(); Panels.renderRight(); UI.hint(HINTS[S.tool]); render();
  }
  function stepOK() {
    const it = stepItem();
    const ctx = S.ctx;
    App.extra = [];
    App.change(it.role === 'hole' ? 'Aussparung erstellt' : it.kind === 'revolve' ? 'Drehkörper erstellt' : 'Hochgezogen', (doc) => {
      if (ctx.targetId && Model.find(doc, ctx.targetId)) Actions.attach(doc, ctx.targetId, it);
      else { Model.setFromMatrix(it, S.W); doc.items.push(it); }
    });
    finishSession();
    const top = Model.topOf(App.doc, it.id);
    App.select([top ? top.id : it.id]);
    // neues Teil gut sichtbar machen, wenn es nach dem Zurückspringen zu klein wäre
    setTimeout(() => { const b = Actions.worldBox(top ? top.id : it.id); if (b && (Viewer.screenFraction(b) < 0.22 || !Viewer.inView(b))) Viewer.fit(App.doc.items.map((x) => x.id)); }, 480);
    UI.toast(it.role === 'hole' ? 'Aussparung erstellt. Im Verlauf kannst du die Tiefe jederzeit ändern.' : 'Fertig! Die Maße kannst du rechts jederzeit ändern.', { icon: 'check' });
  }
  // Offener Pfad ohne Fläche: Querschnitt (Rohr Ø 6) entlang ziehen
  function sweepFromSketch() {
    const ctx = S.ctx;
    const it = Model.newItem('sweep', { sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons) }, shape: 'circle', d: 6, w: 6, h: 4, wall: 0 }, { name: 'Entlang Pfad' });
    App.extra = [];
    App.change('Entlang Pfad gezogen', (doc) => {
      if (ctx.targetId && Model.find(doc, ctx.targetId)) Actions.attach(doc, ctx.targetId, it);
      else { Model.setFromMatrix(it, S.W); doc.items.push(it); }
    });
    finishSession();
    const top = Model.topOf(App.doc, it.id);
    App.select([top ? top.id : it.id]);
    UI.toast('Offener Pfad erkannt – als Rohr Ø 6 mm entlang gezogen. Form, Größe und Wand stellst du rechts ein.', { icon: 'check', ms: 5000 });
  }
  // ---------- Beenden ----------
  function cancel(silent) {
    if (!S) return;
    App.extra = []; App.rebuild();
    finishSession();
    if (!silent) UI.toast('Skizze verworfen.', { icon: 'close', ms: 1800 });
  }
  function finishSession() {
    if (!S) return;
    const cam = S.cam, hid = S.hiddenEdit;
    clearGroup(); hideBar(); hideEntry(); hideDimBox();
    if (stepBox) { stepBox.remove(); stepBox = null; }
    S = null; placeArrow();
    if (hid) Viewer.updateNode(hid, { visible: true });
    Viewer.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    document.body.classList.remove('sketching');
    Viewer.restoreCamera(cam);
    UI.hint(null); App.emit('mode'); Panels.renderRight(); Handles.rebuild();
  }
  function init() {
    App.on('results', relinkAll);
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', (e) => { if (S) { onDown(e); } }, true);
    cv.addEventListener('pointermove', (e) => { if (S) onMove(e); });
    window.addEventListener('pointerup', (e) => { if (S) { onUp(e); stepUp(e); } });
  }
  return { init, chooseAndStart, startOnPlane, startOnFace, startPath, startLoftPath, editItem, pushPullFace, renderPanel, onKey, cancel, setBg, setTool, get active() { return !!S; }, get state() { return S; }, get picking() { return !!planePick; }, startPlanePick };
})();

