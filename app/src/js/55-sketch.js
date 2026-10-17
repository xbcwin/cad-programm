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
    dim: 'Klick auf eine Linie, eine Rechteck-Seite oder einen Kreis und tipp das Maß ein – auch eine Formel wie <b>breite/2</b>. Feste Maße bleiben beim Ziehen erhalten. Ein neuer Name landet automatisch unter „Maße“.',
  };
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
    begin({ plane: deepClone(f.item.p.sketch.plane), W, ents: deepClone(f.item.p.sketch.ents), dims: deepClone(f.item.p.sketch.dims || []), refs: [], ctx: { mode: 'edit', editId: id } });
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
    S.dims = init.dims || [];
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
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function setTool(id) {
    if (!S) return;
    commitDraftPolyline();
    S.tool = id; S.draft = null; hideEntry(); hideDimBox();
    if (bar) $$('.tool[data-tool]', bar).forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
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
  function pushUndo() { S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims })); if (S.undo.length > 100) S.undo.shift(); }
  function sketchUndo() {
    if (S.draft && S.draft.pts && S.draft.pts.length > 1 && S.tool === 'line') { S.draft = null; render(); return; }
    const last = S.undo.pop(); if (last == null) return;
    const st = JSON.parse(last); S.ents = st.ents; S.dims = st.dims || []; S.sel = null; S.draft = null; render(); Panels.renderRight();
  }
  function addEnt(e) { pushUndo(); e.id = uid('e'); if (S.construction) e.con = true; S.ents.push(e); return e; }
  // ---------- Maße ----------
  const vars = () => Model.vars(App.doc).v;
  function reapply() { if (S) S.ents = SK.applyDims(S.ents, S.dims, vars(), true); }
  function dimOf(eid, k) { return S.dims.find((d) => d.e === eid && d.k === k) || null; }
  // Maß setzen (Zahl oder Formel); ohne Undo-Schritt, wenn quiet
  function putDim(eid, k, v) {
    const old = dimOf(eid, k);
    if (old) old.v = v; else S.dims.push({ id: uid('m'), e: eid, k, v });
  }
  function setDim(eid, k, v) {
    const en = S.ents.find((x) => x.id === eid); if (!en) return;
    const n = Model.num(v, vars(), NaN);
    if (!isFinite(n) || (k !== 'ang' && k !== 'x' && k !== 'y' && n <= 0)) { UI.toast('Dieser Wert passt hier nicht: ' + v, { kind: 'bad' }); return; }
    if (typeof v === 'string' && !Expr.names(v).length) v = round(n, 4);   // reine Rechnung wie 10*3 → 30
    pushUndo(); putDim(eid, k, v); reapply(); render(); Panels.renderRight();
  }
  function removeDim(eid, k) { pushUndo(); S.dims = S.dims.filter((d) => !(d.e === eid && d.k === k)); render(); Panels.renderRight(); }
  function deleteEnt(id) { pushUndo(); S.ents = S.ents.filter((x) => x.id !== id); S.dims = S.dims.filter((d) => d.e !== id); if (S.sel === id) S.sel = null; render(); Panels.renderRight(); }
  // Welches Maß meint ein Klick auf dieses Element?
  function dimKeyAt(en, uv) {
    if (en.type === 'line') return 'len';
    if (en.type === 'circle' || en.type === 'poly') return 'd';
    if (en.type === 'slot') return 'len';
    if (en.type === 'rect') {
      const x0 = Math.min(en.a[0], en.b[0]), x1 = Math.max(en.a[0], en.b[0]), y0 = Math.min(en.a[1], en.b[1]), y1 = Math.max(en.a[1], en.b[1]);
      const dh = Math.min(Math.abs(uv[1] - y0), Math.abs(uv[1] - y1)), dv = Math.min(Math.abs(uv[0] - x0), Math.abs(uv[0] - x1));
      return dh <= dv ? 'w' : 'h';
    }
    return null;
  }
  // kleines Eingabefeld direkt im Bild
  let dimBox = null;
  function hideDimBox() { if (dimBox) { dimBox.remove(); dimBox = null; } }
  function askDim(en, k, clientX, clientY) {
    hideDimBox(); hideEntry();
    const cur = dimOf(en.id, k);
    const val = cur ? (typeof cur.v === 'number' ? fmt(cur.v, 4) : cur.v) : fmt(round(SK.measure(en, k), 4), 4);
    dimBox = h('div', { class: 'numentry dimask' });
    const inp = h('input', { type: 'text', value: val, 'aria-label': SK.DIMNAME[k], spellcheck: 'false', autocomplete: 'off', style: { width: '120px' } });
    dimBox.append(h('label', null, SK.DIMNAME[k], inp));
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
        const cur = round(SK.measure(en, k), 4);
        App.change(`Maß „${raw}“ angelegt`, (doc) => { doc.params.push({ id: uid('m'), name: raw, expr: cur }); });
        UI.toast(`Neuer Name „${raw}“ = ${fmt(cur, 2)} – zu finden links unter „Maße“.`, { icon: 'check' });
      }
      const n = parseNum(raw); const v = isNaN(n) ? raw : n;
      if (isNaN(Model.num(v, vars(), NaN))) { inp.parentElement.parentElement.classList.add('invalid'); UI.toast('Das kann ich nicht ausrechnen: „' + raw + '“. Prüf die Schreibweise – Beispiele findest du unter „Maße“.', { kind: 'bad' }); return; }
      hideDimBox(); S.sel = en.id; setDim(en.id, k, v); Viewer.canvas.focus();
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
      const hit = SK.hit(S.ents, uv0, pxSize() * 9);
      if (!hit) { UI.toast('Klick genau auf eine Linie oder einen Kreis.', { icon: 'info', ms: 1800 }); return; }
      const k = dimKeyAt(hit, uv0);
      if (!k) { UI.toast('Für Bögen kommt das Maß in einer späteren Version.', { icon: 'info' }); return; }
      S.sel = hit.id; render(); Panels.renderRight();
      askDim(hit, k, e.clientX, e.clientY); return;
    }
    if (t === 'select') {
      // Endpunkt ziehen?
      const tol = pxSize() * 9;
      const endHit = [];
      for (const en of S.ents) for (const k of ['a', 'b']) if ((en.type === 'line' || en.type === 'arc') && SK.d2(en[k], uv0) < tol) endHit.push([en, k]);
      if (endHit.length) { pushUndo(); S.drag = { points: endHit, start: uv0 }; return; }
      const hit = SK.hit(S.ents, uv0, tol);
      if (hit && (hit.type === 'circle' || hit.type === 'rect' || hit.type === 'poly' || hit.type === 'slot')) { pushUndo(); S.drag = { move: hit.id, start: uv0, orig: deepClone(hit) }; }
      S.sel = hit ? hit.id : null; render(); Panels.renderRight(); return;
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
    render(); Panels.renderRight();
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
      if (S.drag.points) for (const [en, k] of S.drag.points) en[k] = sn.p.slice();
      else { const en = S.ents.find((x) => x.id === S.drag.move); const o = S.drag.orig; const dx = sn.p[0] - S.drag.start[0], dy = sn.p[1] - S.drag.start[1]; Object.assign(en, SK.translateEnt(o, round(dx, 4), round(dy, 4))); }
      reapply();   // feste Maße halten
      render(); return;
    }
    S.cursor = snap(uv0, { fine: e.shiftKey });
    if (S.tool === 'line' && S.draft) {
      const a = S.draft.pts[S.draft.pts.length - 1];
      if (S.cursor.kind !== 'end' && S.cursor.kind !== 'center' && S.cursor.kind !== 'mid') { const as = angleSnap(a, S.cursor.p); S.cursor.p = as.p; if (as.tip) S.cursor.tip = as.tip; }
    }
    render();
  }
  function onUp() { if (S && S.drag) { S.drag = null; render(); Panels.renderRight(); } }
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
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; hideEntry(); render(); } else if (S.tool !== 'select') setTool('select'); else cancel(); return true; }
    if (e.key === 'Enter') { if (S.draft && S.tool === 'line') { S.draft = null; render(); } else done(); return true; }
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
    // Elemente
    for (const e of S.ents) {
      const sel = e.id === S.sel;
      for (const p of entPts(e)) lineObj(p, sel ? acc : ink, sel ? 3.4 : 2.2, { dashed: e.con, order: 25 });
    }
    // feste Maße als Schildchen, anklicken zum Ändern
    if (!S.step) for (const dm of S.dims) {
      const en = S.ents.find((x) => x.id === dm.e); if (!en) continue;
      const pos = dimPos(en, dm.k); if (!pos) continue;
      if (pos.line) lineObj(pos.line, acc, 1, { dashed: true, opacity: 0.7, dash: 1.2, gap: 1.2 });
      const val = SK.measure(en, dm.k);
      const isF = typeof dm.v === 'string' && Model.isExpr(dm.v);
      const bad = isNaN(Model.num(dm.v, vars(), NaN));
      const pre = { d: 'Ø ', x: 'X ', y: 'Y ' }[dm.k] || '';
      const unit = dm.k === 'ang' ? '°' : dm.k === 'n' ? ' Ecken' : '';
      const el = h('div', { class: 'skdim' + (bad ? ' bad' : ''), 'data-tip': bad ? 'Formel lässt sich nicht ausrechnen – klicken zum Ändern' : SK.DIMNAME[dm.k] + ' – klicken zum Ändern', dataset: { dim: dm.id } });
      el.innerHTML = (isF ? `<span class="fx">${esc(dm.v)}&nbsp;=</span>` : '') + esc(pre + fmt(val, 2) + unit);
      $('#overlay').append(el); labels.push(el);
      const sp = Viewer.toScreen(toWorld(pos.p[0], pos.p[1])); el.style.left = sp.x + 'px'; el.style.top = sp.y + 'px';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('click', (e) => { S.sel = en.id; render(); Panels.renderRight(); askDim(en, dm.k, e.clientX, e.clientY); });
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
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'se-con', checked: !!sel.con }), 'Hilfslinie (zählt nicht zur Fläche)');
      con.querySelector('input').onchange = (e) => upd((x) => { x.con = e.target.checked; });
      w.append(con);
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + 'Löschen';
      del.onclick = () => deleteEnt(sel.id);
      w.append(h('div', { class: 'btn-row' }, del));
    } else {
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
      const id = S.ctx.editId, ents = S.ents, dims = S.dims;
      App.change('Skizze bearbeitet', (doc) => { const f = Model.find(doc, id); f.item.p.sketch.ents = ents; f.item.p.sketch.dims = dims; const keys = regs.map((r) => r.key); if (f.item.p.sel) f.item.p.sel = f.item.p.sel.filter((k) => keys.includes(k)); });
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
    const p = { sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims) }, sel };
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

