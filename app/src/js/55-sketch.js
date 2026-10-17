// ================= Skizzen-Modus (Zeichnen auf einer Ebene) =================
const Sketch = (() => {
  let S = null;
  const TOOLS = [
    { id: 'select', icon: 'cursor', label: 'Auswahl', key: 'V', tip: 'Auswählen und Punkte verschieben' },
    { id: 'line', icon: 'line', label: 'Linie', key: 'L', tip: 'Linienzug zeichnen – am Startpunkt schließen' },
    { id: 'rect', icon: 'rect', label: 'Rechteck', key: 'R', tip: 'Rechteck von Ecke zu Ecke' },
    { id: 'circle', icon: 'circle', label: 'Kreis', key: 'C', tip: 'Kreis vom Mittelpunkt aus' },
    { id: 'arc', icon: 'arc', label: 'Bogen', key: 'A', tip: 'Bogen: Start, Ende, dann Wölbung' },
    { id: 'slot', icon: 'slot', label: 'Langloch', key: 'G', tip: 'Langloch: zwei Mittelpunkte, dann Breite' },
    { id: 'poly', icon: 'polygon', label: 'Vieleck', key: 'P', tip: 'Regelmäßiges Vieleck vom Mittelpunkt aus' },
    { id: 'dim', icon: 'dim', label: 'Maß', key: 'D', tip: 'Maß festlegen – auch als Formel wie breite/2' },
  ];
  const HINTS = {
    select: 'Element anklicken zum Bearbeiten. Endpunkte lassen sich ziehen. <b>Entf</b> löscht.',
    line: 'Klick setzt Punkte. Zahl tippen für genaue Länge. Am Startpunkt schließen oder <b>Enter</b> zum Beenden.',
    rect: 'Erste Ecke klicken, dann die zweite. Oder Zahlen tippen: Breite <b>Tab</b> Höhe.',
    circle: 'Mittelpunkt klicken, dann Größe. Oder Durchmesser eintippen.',
    arc: 'Startpunkt, Endpunkt, dann die Wölbung klicken.',
    slot: 'Ersten und zweiten Mittelpunkt klicken, dann die Breite.',
    poly: 'Mittelpunkt klicken, dann Größe. Anzahl der Ecken rechts einstellen.',
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
    { id: 'fix', icon: 'cFix', label: 'Fixieren', help: 'cFix' },
    { id: 'project', icon: 'project', label: 'Kante übernehmen', help: 'project' },
  ];
  const CNAME = Object.fromEntries(CTOOLS.map((t) => [t.id, t.label]));
  const CICON = Object.fromEntries(CTOOLS.map((t) => [t.id, t.icon]));
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
    project: 'Klick eine gestrichelte Kante der Fläche an – sie wird zu einer festen Linie deiner Skizze.',
  };
  for (const k in CHINTS) HINTS['c:' + k] = '<b>' + CNAME[k] + ':</b> ' + CHINTS[k];
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
    const mk = (label, pl) => { const b = h('button', { type: 'button', class: 'btn' }, label); b.onclick = () => { UI.closePop(); startOnPlane(pl); }; return b; };
    row.append(mk('Auf der Arbeitsfläche', 'XY'), mk('Stehend (vorne)', 'XZ'), mk('Stehend (seitlich)', 'YZ'));
    box.append(row);
    UI.pop(btn, box);
  }
  const PLANES = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  function startOnPlane(name) {
    const pl = PLANES[name];
    begin({ plane: deepClone(pl), W: new THREE.Matrix4(), ents: [], refs: [], ctx: { mode: 'new', targetId: null } });
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
    begin({ plane: deepClone(f.item.p.sketch.plane), W, ents: deepClone(f.item.p.sketch.ents), dims: deepClone(f.item.p.sketch.dims || []), cons: deepClone(f.item.p.sketch.cons || []), refs: [], ctx: { mode: 'edit', editId: id } });
    // Körper während des Bearbeitens ausblenden
    S.hiddenEdit = id;
    const top = Model.topOf(App.doc, id);
    if (top && top.id === id) Viewer.updateNode(id, { visible: false });
  }
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
    if (S) cancel(true);
    if (Notes.active) Notes.stop();
    Panels.closeFlyout(); UI.closePop();
    const F = frameWorld(init.plane, init.W);
    S = { ...init, F, tool: skipDraw || init.ctx.mode === 'edit' ? 'select' : 'rect', draft: null, sel: null, cam: Viewer.saveCamera(), undo: [], polySides: 6, construction: false, step: null, hover: null };
    S.dims = init.dims || []; S.cons = init.cons || []; S.picks = []; S.dimFirst = null; S.selCon = null;
    reapply();   // Maße mit den aktuellen Werten aus „Maße“ nachrechnen
    App.clearSelection();
    Viewer.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    document.body.classList.add('sketching');
    buildGroup();
    const b = SK.bounds([...S.ents, ...S.refs]);
    const size = b ? Math.max(40, Math.max(b[2] - b[0], b[3] - b[1]) * 0.75) : 70;
    const c2 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
    const cw = F.o.clone().addScaledVector(F.x, c2[0]).addScaledVector(F.y, c2[1]);
    Viewer.lookAtPlane(cw.toArray(), F.n.toArray(), F.x.toArray(), size);
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
    for (const t of TOOLS) {
      const hk = { poly: 'polygon', dim: 'dimension' }[t.id] || t.id;
      const b = h('button', { type: 'button', class: 'tool' + (S.tool === t.id ? ' active' : ''), 'data-tip': t.tip, 'data-kbd': t.key, 'aria-label': t.label, dataset: { tool: t.id, help: hk } });
      b.innerHTML = icon(t.icon) + `<span>${t.label}</span>`;
      b.onclick = () => setTool(t.id);
      bar.append(b);
    }
    bar.append(h('span', { class: 'vsep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)', margin: '4px 4px' } }));
    const un = h('button', { type: 'button', class: 'tool', 'data-tip': 'Rückgängig', 'data-kbd': 'Strg Z', 'aria-label': 'Rückgängig' }); un.innerHTML = icon('undo'); un.onclick = () => sketchUndo();
    const cn = h('button', { type: 'button', class: 'tool', 'data-tip': 'Skizze verwerfen (Abbrechen)', 'aria-label': 'Abbrechen' }); cn.innerHTML = icon('close'); cn.onclick = () => cancel();
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-tip': 'Skizze fertig – weiter zum Hochziehen', 'data-kbd': 'Enter' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = () => done();
    bar.append(un, cn, ok);
    $('#overlay').append(bar);
    // zweite Leiste: Regeln
    cbar = h('div', { class: 'consbar', role: 'toolbar', 'aria-label': 'Regeln' });
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
  function hideBar() { if (bar) { bar.remove(); bar = null; } if (cbar) { cbar.remove(); cbar = null; } }
  function setTool(id) {
    if (!S) return;
    commitDraftPolyline();
    S.tool = id; S.draft = null; S.picks = []; S.dimFirst = null; hideEntry(); hideDimBox();
    for (const el of [bar, cbar]) if (el) $$('.tool[data-tool]', el).forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    UI.hint(HINTS[id]); Panels.renderRight(); render();
  }
  // ---------- Umrechnung ----------
  function toWorld(u, v) { return S.F.o.clone().addScaledVector(S.F.x, u).addScaledVector(S.F.y, v); }
  function toUV(p) { const d = p.clone().sub(S.F.o); return [d.dot(S.F.x), d.dot(S.F.y)]; }
  function mouseUV(e) { const p = Viewer.rayPlane(e.clientX, e.clientY, S.F.o, S.F.n); return p ? toUV(p) : null; }
  function pxSize() { return Viewer.pixelSizeAt(S.F.o); }
  // ---------- Einrasten ----------
  function snap(uv, opts = {}) {
    const tol = pxSize() * 11;
    const pts = SK.snapPoints(S.ents.filter((e) => !opts.exclude || !opts.exclude.includes(e.id)), S.refs);
    if (S.draft && S.draft.pts) for (const p of S.draft.pts) pts.push({ p, type: 'end' });
    let best = null, bd = tol;
    for (const c of pts) { const d = SK.d2(c.p, uv); if (d < bd) { bd = d; best = c; } }
    if (best) return { p: best.p.slice(), tip: { end: 'Endpunkt', mid: 'Mitte', center: 'Mittelpunkt', quad: 'Kreispunkt', origin: 'Ursprung' }[best.type], kind: best.type };
    // Ausrichtung an vorhandenen Punkten
    let p = uv.slice(), guides = [];
    let gx = null, gy = null, dx = tol * 0.7, dy = tol * 0.7;
    for (const c of pts) {
      if (Math.abs(c.p[0] - uv[0]) < dx) { dx = Math.abs(c.p[0] - uv[0]); gx = c.p; }
      if (Math.abs(c.p[1] - uv[1]) < dy) { dy = Math.abs(c.p[1] - uv[1]); gy = c.p; }
    }
    const grid = App.doc.settings.snap === false ? 0 : (opts.fine ? 0.1 : App.doc.settings.grid || 1);
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
  function reapply(opts = {}) {
    if (!S) return null;
    const r = Solver.solve({ ents: S.ents, dims: S.dims, cons: S.cons }, vars(), { inPlace: true, analyze: !opts.fast, pins: opts.pins });
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
  function deleteEnt(id) {
    pushUndo();
    S.ents = S.ents.filter((x) => x.id !== id);
    S.dims = S.dims.filter((d) => d.e !== id && !(d.refs || []).some((r) => usesEnt(r, id)));
    S.cons = S.cons.filter((c) => !(c.refs || []).some((r) => usesEnt(r, id)));
    if (S.sel === id) S.sel = null;
    reapply(); render(); Panels.renderRight();
  }
  function removeCons(id) { pushUndo(); S.cons = S.cons.filter((c) => c.id !== id); if (S.selCon === id) S.selCon = null; reapply(); render(); Panels.renderRight(); }
  // Welches Maß meint ein Klick auf dieses Element?
  function dimKeyAt(en, uv) {
    if (en.type === 'line') return 'len';
    if (en.type === 'circle' || en.type === 'poly') return 'd';
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
    else if (e.type === 'circle') P('c', e.c);
    else if (e.type === 'poly') { P('c', e.c); SK.polyCorners(e).forEach((q, i) => P('v' + i, q)); }
    else if (e.type === 'rect') { SK.rectCorners(e).forEach((q, i) => P('k' + i, q)); P('c', [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); }
    return out;
  }
  function refPts(e) { if (e.type === 'line' || e.type === 'arc') return [e.a, e.b]; if (e.type === 'circle') return [e.c]; return []; }
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
    const ks = Solver.VARS[e.type]; if (!ks) return;
    const at = {}; for (const k of ks) at[k] = k === 'r' ? e.r : e[k[0]][+k[1]];
    addCons({ id: uid('k'), type: 'fix', refs: [{ e: e.id }], at });
  }
  function consPick(pk, e) {
    const t = S.tool.slice(2);
    if (t === 'project') {
      const p2 = pickAt(mouseUV(e), { points: false, refs: true });
      if (!p2 || p2.kind !== 'refent') { UI.toast(CHINTS.project, { icon: 'info' }); return; }
      const copy = deepClone(p2.ent); copy.id = uid('e'); delete copy.con;
      pushUndo(); S.ents.push(copy);
      const at = {}; for (const k of Solver.VARS[copy.type] || []) at[k] = k === 'r' ? copy.r : copy[k[0]][+k[1]];
      S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: copy.id }], at });
      reapply(); render(); Panels.renderRight();
      return;
    }
    if (!pk) { S.picks = []; render(); return; }
    S.picks.push(pk);
    const P = S.picks, n = P.length, last = P[n - 1];
    const isPt = (x) => x.kind === 'point';
    const asPoint = (x) => (isPt(x) ? x.ref : x.ent && (x.ent.type === 'circle' || x.ent.type === 'arc' || x.ent.type === 'poly') ? { e: x.ent.id, p: 'c' } : null);
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
  function onDown(e) {
    if (!S || S.step) return stepDown(e);
    if (e.button !== 0) return;
    const uv0 = mouseUV(e); if (!uv0) return;
    const sn = snap(uv0, { fine: e.shiftKey });
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
      for (const en of S.ents) for (const k of ['a', 'b']) if ((en.type === 'line' || en.type === 'arc') && SK.d2(en[k], uv0) < tol) endHit.push([en, k]);
      if (endHit.length) { pushUndo(); S.drag = { points: endHit, start: uv0 }; S.selCon = null; return; }
      const hit = SK.hit(S.ents, uv0, tol);
      if (hit && (hit.type === 'circle' || hit.type === 'rect' || hit.type === 'poly' || hit.type === 'slot' || hit.type === 'line' || hit.type === 'arc')) { pushUndo(); S.drag = { move: hit.id, start: uv0, orig: deepClone(hit) }; }
      S.sel = hit ? hit.id : null; S.selCon = null; render(); Panels.renderRight(); return;
    }
    if (t === 'line') {
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
      if (!S.draft) S.draft = { a: p };
      else { if (Math.abs(p[0] - S.draft.a[0]) > 1e-6 && Math.abs(p[1] - S.draft.a[1]) > 1e-6) addEnt({ type: 'rect', a: S.draft.a, b: p }); S.draft = null; hideEntry(); }
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
    } else if (t === 'slot') {
      if (!S.draft) S.draft = { a: p };
      else if (!S.draft.b) { if (SK.d2(S.draft.a, p) > 1e-6) S.draft.b = p; }
      else { const r = slotR(S.draft.a, S.draft.b, p); if (r > 1e-6) addEnt({ type: 'slot', a: S.draft.a, b: S.draft.b, r: round(r, 4) }); S.draft = null; hideEntry(); }
    }
    reapply(); render(); Panels.renderRight();
  }
  function slotR(a, b, p) { const L = SK.d2(a, b); if (L < 1e-9) return SK.d2(a, p); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; return Math.abs((p[0] - a[0]) * -uy + (p[1] - a[1]) * ux); }
  function commitDraftPolyline() { if (S && S.draft && S.tool === 'line') S.draft = null; }
  let lastMouse = null;
  function onMove(e) {
    if (!S) return;
    if (S.step) return stepMove(e);
    const uv0 = mouseUV(e); if (!uv0) return;
    lastMouse = { e, uv: uv0 };
    if (S.drag) {
      const sn = snap(uv0, { fine: e.shiftKey, exclude: S.drag.move ? [S.drag.move] : S.drag.points.map(([en]) => en.id) });
      // Wunschlage festhalten, der Löser bewegt den Rest – Maße und Regeln gehen vor
      const pins = [];
      if (S.drag.points) for (const [en, k] of S.drag.points) pins.push([en.id, k + '0', sn.p[0]], [en.id, k + '1', sn.p[1]]);
      else {
        const o = S.drag.orig; const moved = SK.translateEnt(o, round(sn.p[0] - S.drag.start[0], 4), round(sn.p[1] - S.drag.start[1], 4));
        for (const k of Solver.VARS[o.type] || []) if (k !== 'r') pins.push([o.id, k, moved[k[0]][+k[1]]]);
      }
      S.dragPins = pins; S.dragged = true;
      dragFrame(); return;
    }
    if (S.tool === 'dim' || S.tool.startsWith('c:')) { S.hoverPick = pickAt(uv0, { refs: S.tool === 'c:project', points: S.tool !== 'c:project' }); S.cursor = null; render(); return; }
    S.cursor = snap(uv0, { fine: e.shiftKey });
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
    if (t === 'rect') return [['w', 'Breite'], ['h', 'Höhe']];
    if (t === 'circle') return [['d', 'Ø']];
    if (t === 'poly') return [['d', 'Ø']];
    if (t === 'slot' && !d.b) return [['len', 'Länge'], ['ang', 'Winkel °']];
    if (t === 'slot' && d.b) return [['w', 'Breite']];
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
      const en = addEnt({ type: 'rect', a: d.a, b: [round(d.a[0] + sx * w, 4), round(d.a[1] + sy * hh, 4)] }); fix(en, 'w', 'w'); fix(en, 'h', 'h'); S.draft = null;
    } else if (t === 'circle' || t === 'poly') {
      const D = val('d'); if (isNaN(D) || D <= 0) { UI.toast('Bitte einen Durchmesser eingeben.', { kind: 'bad' }); return; }
      const en = t === 'circle' ? addEnt({ type: 'circle', c: d.c, r: round(D / 2, 4) }) : addEnt({ type: 'poly', c: d.c, r: round(D / 2, 4), n: S.polySides, rot: 0 });
      fix(en, 'd', 'd');
      S.draft = null;
    } else if (t === 'slot' && d.b) {
      const W = val('w'); if (isNaN(W) || W <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      const en = addEnt({ type: 'slot', a: d.a, b: d.b, r: round(W / 2, 4) }); fix(en, 'w', 'w'); S.draft = null;
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
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; hideEntry(); render(); } else if (S.picks.length || S.dimFirst) { S.picks = []; S.dimFirst = null; UI.hint(HINTS[S.tool]); render(); } else if (S.tool !== 'select') setTool('select'); else cancel(); return true; }
    if (e.key === 'Enter') { if (S.draft && S.tool === 'line') { S.draft = null; render(); } else done(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.selCon) { removeCons(S.selCon); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { deleteEnt(S.sel); return true; }
    // Beim Zeichnen landet jede Zahl und jeder Buchstabe im Eingabefeld (Formeln wie „breite/2“)
    if (S.draft && !e.ctrlKey && !e.metaKey && !e.altKey && /^[0-9.,\-(A-Za-zÄÖÜäöüß_]$/.test(e.key)) { if (showEntry(e.key)) { e.preventDefault(); return true; } }
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
      const spx = Viewer.toScreen(toWorld(pos.p[0], pos.p[1])); el.style.left = spx.x + 'px'; el.style.top = spx.y + 'px';
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
    // offene Enden markieren
    for (const p of SK.openEnds(S.ents)) { const w = toWorld(p[0], p[1]); const l = label('', p, 'snaptip'); l.style.transform = 'translate(-50%,-50%)'; l.style.width = '9px'; l.style.height = '9px'; l.style.padding = '0'; l.style.borderRadius = '50%'; l.style.background = th.hole; l.title = 'Offenes Ende'; }
    // Entwurf
    const d = S.draft, cur = S.cursor ? S.cursor.p : null;
    if (d && cur && !S.step) {
      const t = S.tool;
      if (t === 'line') { const a = d.pts[d.pts.length - 1]; lineObj([a, cur], acc, 2.2); const L = SK.d2(a, cur); const ang = (Math.atan2(cur[1] - a[1], cur[0] - a[0]) * 180) / Math.PI; label(`${fmt(L, 2)} mm · ${fmt(ang, 1)}°`, [(a[0] + cur[0]) / 2, (a[1] + cur[1]) / 2]); }
      if (t === 'rect') { const e = { type: 'rect', a: d.a, b: cur }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`${fmt(Math.abs(cur[0] - d.a[0]), 2)} × ${fmt(Math.abs(cur[1] - d.a[1]), 2)}`, [(d.a[0] + cur[0]) / 2, (d.a[1] + cur[1]) / 2]); }
      if (t === 'circle') { const r = SK.d2(d.c, cur); lineObj(SK.segPoints({ t: 'circle', c: d.c, r }), acc, 2.2); lineObj([d.c, cur], acc, 1, { dashed: true }); label(`Ø ${fmt(2 * r, 2)}`, cur); }
      if (t === 'poly') { const r = SK.d2(d.c, cur); const e = { type: 'poly', c: d.c, r, n: S.polySides, rot: Math.atan2(cur[1] - d.c[1], cur[0] - d.c[0]) - Math.PI / 2 }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Ø ${fmt(2 * r, 2)}`, cur); }
      if (t === 'arc') { if (!d.b) lineObj([d.a, cur], acc, 1.4, { dashed: true }); else if (SK.arcInfo(d.a, cur, d.b)) { lineObj(SK.arcPoints(d.a, cur, d.b), acc, 2.2); const ai = SK.arcInfo(d.a, cur, d.b); label(`R ${fmt(ai.r, 2)}`, cur); } }
      if (t === 'slot') { if (!d.b) { lineObj([d.a, cur], acc, 1.4, { dashed: true }); label(`${fmt(SK.d2(d.a, cur), 2)} mm`, cur); } else { const r = slotR(d.a, d.b, cur); if (r > 1e-6) { const e = { type: 'slot', a: d.a, b: d.b, r }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Breite ${fmt(2 * r, 2)}`, cur); } } }
    }
    // Einrast-Markierung
    if (S.cursor && !S.step && S.tool !== 'select') {
      const c = S.cursor;
      if (c.guides) for (const [a, bb] of c.guides) lineObj([a, bb], acc, 1, { dashed: true, opacity: 0.8, dash: 1.2, gap: 1.2 });
      const w = c.p; const ps = pxSize();
      const ring = SK.circlePoints(w, ps * (c.kind && c.kind !== 'grid' ? 5 : 3), 24); ring.push(ring[0]);
      lineObj(ring, acc, 2, { order: 26 });
      if (c.tip) { const l = label(c.tip, w, 'snaptip'); }
    }
    Viewer.requestRender();
  }
  // Wo stehen die Symbole einer Regel? (Skizzen-Koordinaten)
  function consAnchors(c) {
    const px = pxSize(); const out = [];
    const refs = c.type === 'symmetric' ? [c.refs[2]] : c.type === 'coincident' ? [c.refs[0]] : (c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 2 ? [c.refs[0]] : c.refs;
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
      const p = en.type === 'circle' || en.type === 'poly' ? en.c : en.a;
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
    if (S.step) { w.append(h('div', { class: 'hint-box', html: S.step.revolve ? 'Wähle die Achse, um die gedreht wird. Klick im Bild auf Flächen, um sie ab- oder anzuwählen.' : 'Zieh am Pfeil im Bild oder tipp die Höhe ein. Klick auf Flächen, um sie ab- oder anzuwählen.' })); body.append(w); return; }
    const sel = S.ents.find((x) => x.id === S.sel);
    const selCon = S.selCon && S.cons.find((c) => c.id === S.selCon);
    if (selCon) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, 'Regel: ' + (CNAME[selCon.type] || selCon.type))));
      w.append(h('div', { class: 'hint-box', html: CHINTS[selCon.type] || '' }));
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + 'Regel löschen';
      del.onclick = () => removeCons(selCon.id);
      w.append(h('div', { class: 'btn-row' }, del));
      body.append(w); return;
    }
    if (sel) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, { line: 'Linie', rect: 'Rechteck', circle: 'Kreis', arc: 'Bogen', slot: 'Langloch', poly: 'Vieleck' }[sel.type])));
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
      else if (sel.type === 'poly') { f.append(dimField('d', 'Durchmesser', 'mm', { min: 0.01 }), dimField('n', 'Ecken', '', { min: 3, int: true })); }
      else if (sel.type === 'slot') { f.append(dimField('len', 'Länge (Mitte–Mitte)', 'mm', { min: 0.01 }), dimField('w', 'Breite', 'mm', { min: 0.01 })); }
      else if (sel.type === 'arc') {
        const ai = SK.arcInfo(sel.a, sel.m, sel.b); if (ai) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Radius'), h('b', { class: 'mono' }, fmt(ai.r, 3) + ' mm')));
      }
      w.append(f);
      const fp = h('div', { class: 'fields' });
      const ak = sel.type === 'circle' || sel.type === 'poly' ? 'Mitte' : 'Start';
      fp.append(dimField('x', ak + ' X'), dimField('y', ak + ' Y'));
      w.append(fp);
      if (S.dims.some((d) => d.e === sel.id)) w.append(h('div', { class: 'hint-box', html: 'Werte mit <b>Schloss</b> sind fest und bleiben beim Ziehen erhalten. Formeln wie <b>breite/2</b> rechnen mit den Namen aus „Maße“.' }));
      // Regeln an diesem Element
      const mine = S.cons.filter((c) => (c.refs || []).some((r) => r && r.e === sel.id));
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
      if (S.tool === 'poly') w.append(UI.numField({ id: 'sk-n', label: 'Ecken', value: S.polySides, unit: '', expr: false, min: 3, int: true, onCommit: (v) => { S.polySides = clamp(v, 3, 64); } }));
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'sk-con', checked: S.construction }), 'Als Hilfslinien zeichnen');
      con.querySelector('input').onchange = (e) => { S.construction = e.target.checked; };
      w.append(con);
      const regs = SK.regions(S.ents);
      w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Geschlossene Flächen'), h('b', { class: 'mono' }, String(regs.length))));
      if (SK.openEnds(S.ents).length) w.append(h('div', { class: 'err-box' }, 'Rot markierte Enden sind noch offen. Verbinde sie, damit eine Fläche entsteht.'));
    }
    w.append(h('div', { class: 'hint-box', html: 'Ansicht verschieben: <b>rechte Maustaste</b> · Zoomen: <b>Mausrad</b> · Genauer: <b>Umschalt</b> halten' }));
    body.append(w);
  }

  // ---------- Fertig / Hochziehen ----------
  function done() {
    if (!S) return;
    S.draft = null; hideEntry();
    const regs = SK.regions(S.ents);
    if (S.ctx.mode === 'edit') {
      if (!regs.length) { UI.toast('Die Skizze braucht mindestens eine geschlossene Fläche.', { kind: 'bad' }); return; }
      const id = S.ctx.editId, ents = S.ents, dims = S.dims, cons = S.cons;
      App.change('Skizze bearbeitet', (doc) => { const f = Model.find(doc, id); f.item.p.sketch.ents = ents; f.item.p.sketch.dims = dims; f.item.p.sketch.cons = cons; const keys = regs.map((r) => r.key); if (f.item.p.sel) f.item.p.sel = f.item.p.sel.filter((k) => keys.includes(k)); });
      finishSession(); App.select([id]); return;
    }
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
    const p = { sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons) }, sel };
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
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', (e) => { if (S) { onDown(e); } }, true);
    cv.addEventListener('pointermove', (e) => { if (S) onMove(e); });
    window.addEventListener('pointerup', (e) => { if (S) { onUp(e); stepUp(e); } });
  }
  return { init, chooseAndStart, startOnPlane, startOnFace, editItem, pushPullFace, renderPanel, onKey, cancel, get active() { return !!S; }, get state() { return S; } };
})();

