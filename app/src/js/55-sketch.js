// ================= Skizzen-Modus (Zeichnen auf einer Ebene) =================
const Sketch = (() => {
  let S = null;
  let S3 = null;
  const TOOLS = [
    { id: 'select', icon: 'cursor', get label() { return T('sk.tool.select'); }, key: 'V', get tip() { return T('sk.toolTip.select'); } },
    { id: 'line', icon: 'line', get label() { return T('sk.tool.line'); }, key: 'L', get tip() { return T('sk.toolTip.line'); } },
    { id: 'rect', icon: 'rect', get label() { return T('sk.tool.rect'); }, key: 'R', get tip() { return T('sk.toolTip.rect'); } },
    { id: 'circle', icon: 'circle', get label() { return T('sk.tool.circle'); }, key: 'C', get tip() { return T('sk.toolTip.circle'); } },
    { id: 'ellipse', icon: 'ellipse', get label() { return T('sk.tool.ellipse'); }, key: 'E', get tip() { return T('sk.toolTip.ellipse'); } },
    { id: 'ellarc', icon: 'ellipseArc', get label() { return T('sk.tool.ellarc'); }, key: '', get tip() { return T('sk.toolTip.ellarc'); } },
    { id: 'arc', icon: 'arc', get label() { return T('sk.tool.arc'); }, key: 'A', get tip() { return T('sk.toolTip.arc'); } },
    { id: 'slot', icon: 'slot', get label() { return T('sk.tool.slot'); }, key: 'G', get tip() { return T('sk.toolTip.slot'); } },
    { id: 'poly', icon: 'polygon', get label() { return T('sk.tool.poly'); }, key: 'P', get tip() { return T('sk.toolTip.poly'); } },
    { id: 'point', icon: 'point', get label() { return T('sk.tool.point'); }, key: 'O', get tip() { return T('sk.toolTip.point'); } },
    { id: 'tpl', icon: 'chip', get label() { return T('sk.tool.tpl'); }, key: 'J', get tip() { return T('sk.toolTip.tpl'); } },
    { id: 'text', icon: 'text', get label() { return T('sk.tool.text'); }, key: 'B', get tip() { return T('sk.toolTip.text'); } },
    { id: 'spline', icon: 'spline', get label() { return T('sk.tool.spline'); }, key: 'S', get tip() { return T('sk.toolTip.spline'); } },
    { id: 'conic', icon: 'conic', get label() { return T('sk.tool.conic'); }, key: '', get tip() { return T('sk.toolTip.conic'); }, pro: true },
    { id: 'bridge', icon: 'bridge', get label() { return T('sk.tool.bridge'); }, key: '', get tip() { return T('sk.toolTip.bridge'); }, pro: true },
    { id: 'corner', icon: 'fillet', get label() { return T('sk.tool.corner'); }, key: 'K', get tip() { return T('sk.toolTip.corner'); }, sep: true },
    { id: 'trim', icon: 'trim', get label() { return T('sk.tool.trim'); }, key: 'T', get tip() { return T('sk.toolTip.trim'); } },
    { id: 'extend', icon: 'extend', get label() { return T('sk.tool.extend'); }, key: 'U', get tip() { return T('sk.toolTip.extend'); } },
    { id: 'splitl', icon: 'splitLine', get label() { return T('sk.tool.splitl'); }, key: 'Y', get tip() { return T('sk.toolTip.splitl'); } },
    { id: 'offset', icon: 'offset2d', get label() { return T('sk.tool.offset'); }, key: 'F', get tip() { return T('sk.toolTip.offset'); } },
    { id: 'wall', icon: 'wall2d', get label() { return T('sk.tool.wall'); }, key: 'N', get tip() { return T('sk.toolTip.wall'); } },
    { id: 'project', icon: 'projectEdge', get label() { return T('sk.tool.project'); }, key: 'Z', get tip() { return T('sk.toolTip.project'); } },
    { id: 'mirror', icon: 'mirror', get label() { return T('sk.tool.mirror'); }, key: 'M', get tip() { return T('sk.toolTip.mirror'); } },
    { id: 'patrect', icon: 'patternRect', get label() { return T('sk.tool.patrect'); }, key: 'Q', get tip() { return T('sk.toolTip.patrect'); } },
    { id: 'patcirc', icon: 'patternCirc', get label() { return T('sk.tool.patcirc'); }, key: 'W', get tip() { return T('sk.toolTip.patcirc'); } },
    { id: 'patcurve', icon: 'patternPath', get label() { return T('sk.tool.patcurve'); }, key: '', get tip() { return T('sk.toolTip.patcurve'); } },
    { id: 'patfill', icon: 'patternFill', get label() { return T('sk.tool.patfill'); }, key: '', get tip() { return T('sk.toolTip.patfill'); } },
    { id: 'xmove', icon: 'arrowR', get label() { return T('sk.tool.xmove'); }, key: 'H', get tip() { return T('sk.toolTip.xmove'); } },
    { id: 'stretch', icon: 'stretch', get label() { return T('sk.tool.stretch'); }, key: '', get tip() { return T('sk.toolTip.stretch'); }, pro: true },
    { id: 'block', icon: 'sketchBlock', get label() { return T('sk.tool.block'); }, key: '', get tip() { return T('sk.toolTip.block'); }, pro: true },
    { id: 'dim', icon: 'dim', get label() { return T('sk.tool.dim'); }, key: 'D', get tip() { return T('sk.toolTip.dim'); }, sep: true },
    { id: 'bg', icon: 'image', get label() { return T('sk.tool.bg'); }, key: 'I', get tip() { return T('sk.toolTip.bg'); } },
  ];
  const HELPKEY = { wall: 'wall2d', project: 'project2d', silhouette: 'silhouette2d', intersect: 'intersectCurve2d', splitl: 'split2d', extend: 'extend2d', tpl: 'sketchTemplate', ellarc: 'ellipseArc', conic: 'conic2d', bridge: 'bridge2d', corner: 'corner2d', text: 'sketchText', bg: 'sketchImage', poly: 'polygon', dim: 'dimension', offset: 'offset2d', mirror: 'mirror2d', patrect: 'patternRect2d', patcirc: 'patternCirc2d', patcurve: 'patternCurve2d', patfill: 'patternFill2d', stretch: 'stretch2d', block: 'sketchBlocks' };
  // Bedingungen (Regeln): zweite Leiste unter den Zeichenwerkzeugen
  const CTOOLS = [
    { id: 'horizontal', icon: 'cHoriz', get label() { return T('sk.con.horizontal'); }, help: 'cHoriz' },
    { id: 'vertical', icon: 'cVert', get label() { return T('sk.con.vertical'); }, help: 'cVert' },
    { id: 'parallel', icon: 'cParallel', get label() { return T('sk.con.parallel'); }, help: 'cParallel' },
    { id: 'perpendicular', icon: 'cPerp', get label() { return T('sk.con.perpendicular'); }, help: 'cPerp' },
    { id: 'collinear', icon: 'cCollinear', get label() { return T('sk.con.collinear'); }, help: 'cCollinear' },
    { id: 'tangent', icon: 'cTangent', get label() { return T('sk.con.tangent'); }, help: 'cTangent' },
    { id: 'curvature', icon: 'cCurvature', get label() { return T('sk.con.curvature'); }, help: 'cCurvature', pro: true },
    { id: 'equal', icon: 'cEqual', get label() { return T('sk.con.equal'); }, help: 'cEqual' },
    { id: 'symmetric', icon: 'cSymmetric', get label() { return T('sk.con.symmetric'); }, help: 'cSymmetric' },
    { id: 'coincident', icon: 'cCoincident', get label() { return T('sk.con.coincident'); }, help: 'cCoincident' },
    { id: 'midpoint', icon: 'cMid', get label() { return T('sk.con.midpoint'); }, help: 'cMid' },
    { id: 'concentric', icon: 'cConcentric', get label() { return T('sk.con.concentric'); }, help: 'cConcentric' },
    { id: 'fix', icon: 'cFix', get label() { return T('sk.con.fix'); }, help: 'cFix' },
    { id: 'project', icon: 'project', get label() { return T('sk.con.project'); }, help: 'project' },
  ];
  const cname = (id) => T('sk.con.' + id);
  const chint = (id) => T('sk.chint.' + id);
  const hintFor = (id) => {
    if (!id) return null;
    if (id.startsWith('c:')) { const k = id.slice(2); return `<b>${cname(k)}:</b> ${chint(k)}`; }
    if (id === 'spline' && S && S.splineMode === 'cv' && !isSimpleMode()) return T('sk.hint.splineCV');
    if (id === 'stretch' && S && S.stretch && S.stretch.sel && S.stretch.sel.pointCount > 0) {
      const n = S.stretch.sel.pointCount;
      return T('sk.hint.stretchReady', { n, unit: T(n === 1 ? 'sk.panel.stretchPtOne' : 'sk.panel.stretchPtMany') });
    }
    if (id === 'intersect' && S) return T(S.icPick ? 'sk.hint.intersect1' : 'sk.hint.intersect0');
    if (id === 'patcurve' && S) {
      if (S.patPickCurve) return T('sk.hint.patcurvePick');
      if (S.patSel && S.patSel.length && S.patCurve) return T('sk.hint.patcurveReady');
    }
    if (id === 'patfill' && S && activeFillRegion().reg) return T('sk.hint.patfillReady');
    if (id === 'dim' && S) {
      if (S.dimMode === 'arcLen') return T('sk.hint.dimArcLen');
      if (S.dimMode === 'ang3') return T('sk.hint.dimAng3_' + Math.min(2, (S.dimPicks || []).length));
      if (S.dimMode === 'ord') return T(S.ordBase ? 'sk.hint.dimOrd1' : 'sk.hint.dimOrd0');
    }
    if (id === 'conic' && S && S.draft) {
      if (S.draft.m) return T('sk.hint.conicRho');
      if (S.draft.b) return T('sk.hint.conicApex');
    }
    if (id === 'bridge' && S && S.bridge && S.bridge.first) return T('sk.hint.bridge2');
    if (S && S.blockEdit) return T('sk.hint.blockEdit', { name: esc(S.blockEdit.name) });
    return T('sk.hint.' + id);
  };
  const CICON = Object.fromEntries(CTOOLS.map((t) => [t.id, t.icon]));
  // Regeln, die Werkzeuge selbst anlegen (nicht in der Regel-Leiste)
  CICON.xform = 'patternRect'; CICON.offset = 'offset2d';
  // ---------- Start ----------
  function chooseAndStart(opts = {}) {
    Panels.closeFlyout();
    const face = Actions.selectedFace();
    if (face && face.info.t === 'PLANE') { startOnFace(face, opts); return; }
    const btn = $('#t-sketch');
    const box = h('div', { style: { display: 'grid', gap: '10px' } });
    box.append(h('b', null, T('sk.start.where')));
    box.append(h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, T('sk.start.tip')));
    const row = h('div', { class: 'btn-row' });
    let off = 0;
    const mk = (label, pl) => { const b = h('button', { type: 'button', class: 'btn' }, label); b.onclick = () => { UI.closePop(); startOnPlane(pl, off, opts); }; return b; };
    row.append(mk(T('sk.start.xy'), 'XY'), mk(T('sk.start.xz'), 'XZ'), mk(T('sk.start.yz'), 'YZ'));
    box.append(UI.numField({ id: 'sk-off', label: T('sk.start.offset'), value: 0, unit: 'mm', expr: false, onCommit: (v) => { off = v; } }));
    box.append(row);
    // Konstruktionsebenen an Körpern
    const row2 = h('div', { class: 'btn-row' });
    const pk = (id, label, kind) => { const b = h('button', { type: 'button', class: 'btn', id }, label); b.onclick = () => { UI.closePop(); startPlanePick(kind, (opts.ribMode || opts.webMode || opts.frameMode) ? (pl) => startOnPlaneObj(pl, opts) : undefined); }; return b; };
    row2.append(pk('sk-mid', T('sk.start.mid'), 'mid'), pk('sk-3p', T('sk.start.p3'), '3p'));
    if (!opts.ribMode && !opts.frameMode) {
      const b3d = h('button', { type: 'button', class: 'btn pro', id: 'sk-3d', 'data-help': 'sketch3d' });
      b3d.innerHTML = icon('sketch3d') + esc(T('kind.sketch3d'));
      b3d.onclick = () => { UI.closePop(); start3d(); };
      row2.append(b3d);
    }
    box.append(row2);
    // eigene Bezugsebenen des Projekts
    const ds = Datums.list().filter((d) => !d.hidden);
    const row3 = h('div', { class: 'btn-row' });
    for (const d of ds) { const b = h('button', { type: 'button', class: 'btn', 'data-datum': d.id }, d.name); b.onclick = () => { UI.closePop(); Datums.sketchOn(d.id); }; row3.append(b); }
    const nb = h('button', { type: 'button', class: 'btn ghost', id: 'sk-datum' }); nb.innerHTML = icon('plus') + esc(T('sk.start.newDatum')); nb.onclick = () => { UI.closePop(); Datums.dialog(btn); };
    const na = h('button', { type: 'button', class: 'btn ghost', id: 'sk-axis', 'data-help': 'datumAxis' }); na.innerHTML = icon('axes') + esc(T('sk.start.newAxis')); na.onclick = () => { UI.closePop(); Datums.axisDialog(btn); };
    const np = h('button', { type: 'button', class: 'btn ghost', id: 'sk-point', 'data-help': 'datumPoint' }); np.innerHTML = icon('point') + esc(T('sk.start.newPoint')); np.onclick = () => { UI.closePop(); Datums.pointDialog(btn); };
    const nc = h('button', { type: 'button', class: 'btn ghost', id: 'sk-csys', 'data-help': 'datumCsys' }); nc.innerHTML = icon('axes') + esc(T('sk.start.newCsys')); nc.onclick = () => { UI.closePop(); Datums.csysDialog(btn); };
    row3.append(nb, na, np, nc); box.append(row3);
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
  function startPlanePick(kind, onPlane) {
    stopPlanePick(); if (S) cancel();
    const need = kind === 'mid' ? 2 : 3, got = [], marks = [];
    const hint = () => UI.hint(kind === 'mid' ? T('sk.start.pickMidHint', { which: T(got.length ? 'sk.start.pickMidSecond' : 'sk.start.pickMidFirst') }) : T('sk.start.pick3pHint', { n: got.length + 1 }));
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: kind === 'mid', solidsOnly: true });
      if (!hit) { UI.toast(T(kind === 'mid' ? 'sk.start.pickMidClick' : 'sk.start.pickBodyClick'), { icon: 'info', ms: 1600 }); return; }
      if (kind === 'mid') {
        const r = App.results.get(hit.id), info = r && r.data && r.data.faces[hit.faceIdx];
        if (!info || info.t !== 'PLANE' || !info.n) { UI.toast(T('sk.start.pickFlatClick'), { icon: 'info', ms: 1600 }); return; }
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
      if (!pl) { UI.toast(T(kind === 'mid' ? 'sk.start.pickMidFail' : 'sk.start.pick3pFail'), { kind: 'bad' }); return; }
      if (onPlane) { onPlane(pl); return; }
      begin({ plane: pl, W: new THREE.Matrix4(), ents: [], refs: [], ctx: { mode: 'new', targetId: null } });
      UI.toast(T(kind === 'mid' ? 'sk.start.pickMidOk' : 'sk.start.pick3pOk'), { icon: 'check' });
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
  // Skizze auf einer beliebigen Ebene (z. B. einer Bezugsebene)
  function startOnPlaneObj(plane, opts = {}) {
    const planeRef = opts.datumId ? { kind: 'datum', datumId: opts.datumId, name: opts.datumName || '' } : null;
    begin({ plane: deepClone(plane), W: new THREE.Matrix4(), ents: [], refs: [], planeRef, ctx: { mode: 'new', targetId: null, ribMode: !!opts.ribMode, webMode: !!opts.webMode, frameMode: !!opts.frameMode, wrapCtx: opts.wrapCtx || null } });
  }
  function startOnPlane(name, off = 0, opts = {}) {
    const pl = PLANES[name];
    begin({ plane: deepClone(pl), W: new THREE.Matrix4(), ents: [], refs: [], ctx: { mode: 'new', targetId: null, ribMode: !!opts.ribMode, webMode: !!opts.webMode, frameMode: !!opts.frameMode }, pOff: off || 0 });
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
  function faceSizeApprox(face, loops) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const lp of loops || []) for (const s of lp || []) for (const pt of [s.a, s.b, s.m, s.c].filter(Boolean)) {
      minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]); minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
    }
    if (isFinite(minX)) {
      const span = Math.max(maxX - minX, maxY - minY);
      if (span > 1e-3) return round(clamp(span * 0.8, 10, 80), 2);
    }
    const bb = App.results.get(face.id)?.data?.bbox;
    if (bb) return round(clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6, 10, 80), 2);
    return 24;
  }
  async function startOnFace(face, opts = {}) {
    const loops = await loopsOf(face); if (loops == null) return;
    const fr = Actions.faceFrame(face.info);
    const plane = { o: fr.o, x: fr.x, n: fr.n };
    const W = Model.worldMatrix(App.doc, face.id);
    const refs = SK.faceLoopsToEnts({ o: fr.o, x: fr.x, y: fr.y }, loops);
    const planeRef = {
      kind: 'face',
      id: face.id,
      c: face.info.c.map((v) => round(v, 5)),
      n: (face.info.n || [0, 0, 1]).map((v) => round(v, 5)),
      size: faceSizeApprox(face, loops),
      ...(face.info.tid ? { tid: face.info.tid } : {}),
    };
    begin({ plane, W, ents: [], refs, planeRef, ctx: { mode: 'new', targetId: face.id, ribMode: !!opts.ribMode, webMode: !!opts.webMode, frameMode: !!opts.frameMode } });
  }
  function startEmboss(face, plane, opts = {}) {
    const tid = opts.targetId || (face && face.id) || null;
    const W = tid ? Model.worldMatrix(App.doc, tid) : new THREE.Matrix4();
    begin({ plane: deepClone(plane), W, ents: [], refs: [], ctx: { mode: 'new', targetId: tid, embossMode: true, embossFace: opts.faceSig || null, embossOpt: opts } });
  }
  function startSplitFace(face, plane, opts = {}) {
    const tid = opts.targetId || (face && face.id) || null;
    const W = tid ? Model.worldMatrix(App.doc, tid) : new THREE.Matrix4();
    begin({ plane: deepClone(plane), W, ents: [], refs: [], ctx: { mode: 'new', targetId: tid, splitFaceMode: true, splitFaceSig: opts.faceSig || null, splitFaceOpt: opts } });
  }
  function editItem(id) {
    const f = Model.find(App.doc, id);
    if (f && f.item.kind === 'sketch3d') { edit3d(id); return; }
    if (!f || !f.item.p.sketch) return;
    if (typeof Assembly !== 'undefined' && Assembly.isLightweightItem) {
      const top = Model.topOf(App.doc, id);
      if (top && Assembly.isLightweightItem(top.id)) Assembly.resolveLightweight(top.id, { silent: true });
    }
    const W = Model.worldMatrix(App.doc, id);
    const planeRef = f.item.p.sketch.planeRef ? deepClone(f.item.p.sketch.planeRef) : null;
    begin({ plane: deepClone(f.item.p.sketch.plane), W, ents: deepClone(f.item.p.sketch.ents), dims: deepClone(f.item.p.sketch.dims || []), cons: deepClone(f.item.p.sketch.cons || []), blockInsts: deepClone(f.item.p.sketch.blockInsts || []), guides: deepClone(f.item.p.sketch.guides || []), gridMode: f.item.p.sketch.gridMode || 'rect', polar: f.item.p.sketch.polar ? deepClone(f.item.p.sketch.polar) : null, bg: f.item.p.sketch.bg, locked: !!f.item.p.sketch.locked, planeRef, refs: [], ctx: { mode: 'edit', editId: id } });
    if (f.item.kind === 'group' || f.item.kind === 'rib' || f.item.kind === 'web' || f.item.kind === 'wrap' || f.item.kind === 'emboss' || f.item.kind === 'splitFace' || f.item.kind === 'asmCut') return;   // Muster entlang Kurve, Rippe, Steg-Netz, Wickeln, Prägen, Fläche teilen & Baugruppen-Schnitt: Zielkörper bleibt sichtbar
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
  // Schnitt-Kurve für „Körper mit Skizze teilen“ zeichnen (o: { plane, W, ents, gid, ids })
  function startSplitCurve(o) {
    begin({ plane: o.plane, W: o.W, ents: o.ents || [], dims: [], cons: [], refs: [], viewSize: o.viewSize, ctx: { mode: 'splitcurve', gid: o.gid || null, ids: o.ids || null } });
    UI.toast('Zeichne eine Linie, einen Bogen oder Spline durch den Körper – dann „Fertig“.', { icon: 'info', ms: 4200 });
  }
  function startPoints(o) {
    begin({ plane: o.plane, W: o.W, ents: o.ents || [], dims: [], cons: [], refs: [], viewSize: o.viewSize, ctx: { mode: 'patpoints', ids: o.ids } });
    UI.toast(T('sk.toast.patPointsStart'), { icon: 'info', ms: 4200 });
  }
  function startAsmCut(o) {
    begin({ plane: o.plane, W: o.W || new THREE.Matrix4(), ents: o.ents || [], dims: [], cons: [], refs: [], viewSize: o.viewSize, ctx: { mode: 'asmcut', targets: o.targets || null, scope: o.scope || 'auto', dir: o.dir || 'reverse', thru: o.thru !== false, dist: o.dist ?? 20 } });
    UI.toast(T('asm.cutSketchHint'), { icon: 'info', ms: 4200 });
  }
  const isSkeletonMode = () => !!(S && S.ctx && S.ctx.mode === 'skeleton');
  function startSkeleton(opts = {}) {
    if (isSimpleMode()) {
      UI.toast(T('skel.proOnly'), { icon: 'info' });
      return false;
    }
    stopPlanePick();
    if (S3) cancel3d(true);
    if (opts.id && typeof Comp !== 'undefined' && Comp.findSkeleton) {
      const sk = Comp.findSkeleton(opts.id);
      if (!sk) return false;
      begin({
        plane: deepClone(sk.plane || PLANES.XY),
        W: new THREE.Matrix4(),
        ents: deepClone(sk.ents || []),
        dims: deepClone(sk.dims || []),
        cons: deepClone(sk.cons || []),
        blockInsts: deepClone(sk.blockInsts || []),
        guides: deepClone(sk.guides || []),
        gridMode: sk.gridMode || 'rect',
        polar: sk.polar ? deepClone(sk.polar) : null,
        bg: sk.bg ? deepClone(sk.bg) : null,
        locked: !!sk.locked,
        refs: [],
        ctx: { mode: 'skeleton', skeletonId: sk.id, skeletonName: sk.name || Comp.defaultSkeletonName() },
      });
    } else {
      const pk = PLANES[opts.planeName] ? opts.planeName : 'XY';
      const plane = opts.plane ? deepClone(opts.plane) : deepClone(PLANES[pk]);
      const skName = opts.name || (typeof Comp !== 'undefined' && Comp.defaultSkeletonName ? Comp.defaultSkeletonName() : T('skel.defaultName'));
      begin({
        plane,
        W: new THREE.Matrix4(),
        ents: deepClone(opts.ents || []),
        dims: deepClone(opts.dims || []),
        cons: deepClone(opts.cons || []),
        refs: [],
        pOff: opts.off || 0,
        ctx: { mode: 'skeleton', skeletonId: null, skeletonName: skName },
      });
    }
    render3dScene();
    UI.toast(T('skel.editHintToast'), { icon: 'info', ms: 4200 });
    return true;
  }
  function editSkeleton(id) {
    return startSkeleton({ id });
  }
  function chooseAndStartSkeleton(anchor) {
    if (isSimpleMode()) {
      UI.toast(T('skel.proOnly'), { icon: 'info' });
      return false;
    }
    const btn = anchor || $('#t-asm-skeleton') || $('#t-sketch');
    const box = h('div', { style: { display: 'grid', gap: '10px' } });
    box.append(h('b', null, T('skel.startTitle')));
    box.append(h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, T('skel.startTip')));
    let off = 0;
    box.append(UI.numField({ id: 'skel-off', label: T('sk.start.offset'), value: 0, unit: 'mm', expr: false, onCommit: (v) => { off = v; } }));
    const row = h('div', { class: 'btn-row' });
    for (const [label, pl] of [[T('sk.start.xy'), 'XY'], [T('sk.start.xz'), 'XZ'], [T('sk.start.yz'), 'YZ']]) {
      const b = h('button', { type: 'button', class: 'btn', dataset: { skelPlane: pl } }, label);
      b.onclick = () => { UI.closePop(); startSkeleton({ planeName: pl, off }); };
      row.append(b);
    }
    box.append(row);
    const ds = typeof Datums !== 'undefined' && Datums.list ? Datums.list().filter((d) => !d.hidden) : [];
    if (ds.length) {
      const row2 = h('div', { class: 'btn-row' });
      for (const d of ds) {
        const b = h('button', { type: 'button', class: 'btn small' }, d.name);
        b.onclick = () => { UI.closePop(); startSkeleton({ plane: d.plane }); };
        row2.append(b);
      }
      box.append(row2);
    }
    UI.pop(btn, box);
    return true;
  }
  // Mittellinie für einen Übergang: Ebene durch den ersten Umriss, in der auch der letzte liegt; vorgezeichnet als Spline durch die Mitten
  let lpKey = '', lpPending = '';
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
    loftPreviewDebounced.cancel(); lpKey = ''; lpPending = '';
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
  // Vorschau: der Übergang mit der gerade gezeichneten Mittellinie (nur bei echter Kurvenänderung neu verzögern)
  const loftPreviewDebounced = debounce(() => {
    lpPending = '';
    if (!isLoftLine()) return;
    const k = JSON.stringify([S.ents, S.plane, S.dims]); if (k === lpKey) return; lpKey = k;
    const f = Model.find(App.doc, S.ctx.id); if (!f) return;
    const it = deepClone(f.item), sk = { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons) };
    const rk = railKey(); if (rk) { it.p[rk] = sk; delete it.p.path; } else { it.p.path = sk; delete it.p.rail; delete it.p.rail2; }
    Model.setFromMatrix(it, S.W); it.id = '__preview'; it.finishes = [];
    App.extra = SK.chains(S.ents).length ? [it] : []; App.rebuild();
  }, 250);
  function loftPreview() {
    if (!isLoftLine()) return;
    const k = JSON.stringify([S.ents, S.plane, S.dims]);
    if (k === lpKey) { if (lpPending) { loftPreviewDebounced.cancel(); lpPending = ''; } return; }
    if (k === lpPending) return;
    lpPending = k;
    loftPreviewDebounced();
  }
  const pathGroup = () => { if (!S || S.ctx.mode !== 'edit') return null; const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.pt === 'path' ? f.item : null; };
  const isPathEdit = () => !!(S && S.ctx.mode === 'edit' && (() => { const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.pt === 'path'; })());
  const isSplitSketchEdit = () => !!(S && S.ctx.mode === 'edit' && (() => { const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.op === 'split'; })());
  const isPointsEdit = () => !!(S && S.ctx.mode === 'edit' && (() => { const f = Model.find(App.doc, S.ctx.editId); return f && f.item.kind === 'group' && f.item.p && f.item.p.pt === 'points'; })());
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
  function ensureSketchFonts(extraFont = null) {
    if (!S || !SK.ensureEntsFonts) return;
    SK.ensureEntsFonts(S.ents, extraFont).catch((e) => UI.toast((e && e.message) || 'Schrift konnte nicht geladen werden.', { kind: 'bad' }));
  }
  function begin(init, skipDraw) {
    Views.collapse();
    if (S) cancel(true);
    donePending = false;
    if (Notes.active) Notes.stop();
    Panels.closeFlyout(); UI.closePop();
    const F = frameWorld(init.plane, init.W);
    S = { ...init, F, tool: skipDraw || init.ctx.mode === 'edit' || ((init.ctx.mode === 'loftpath' || init.ctx.mode === 'loftrail' || init.ctx.mode === 'loftrail2') && init.ents.length) ? 'select' : init.ctx.embossMode ? 'text' : init.ctx.splitFaceMode ? 'circle' : init.ctx.mode === 'patpoints' ? 'point' : (init.ctx.mode === 'patpath' || init.ctx.mode === 'splitcurve' || init.ctx.ribMode || init.ctx.webMode) ? 'line' : 'rect', draft: null, sels: [], get sel() { return this.sels && this.sels.length === 1 ? this.sels[0] : null; }, set sel(v) { this.sels = v ? [v] : []; }, band: null, cam: Viewer.saveCamera(), undo: [], polySides: 6, splineMode: 'fit', selHandle: null, hoverHandle: null, construction: false, locked: !!init.locked, lockedDrag: null, step: null, hover: null, snapSet: defaultSnapSet(), pat: { nx: 3, dx: 10, ny: 1, dy: 10, n: 6, ang: 360, curveMode: 'count', curveN: 5, curveDist: 10, curveAlign: true, curveFlip: false }, xm: { mode: 'move', dx: 10, dy: 0, ang: 90, copy: false }, stretch: { box: null, sel: null, dir: 'x', dist: 5, dx: 5, dy: 0, ang: 0 }, fill: { kind: 'grid', size: 5, pitch: 8, margin: 3, regionKey: null, hoverRegionKey: null }, off: { count: 1, both: false, corners: 'sharp' }, projOff: 0, icPick: null, corner: { mode: 'fillet', r: 2 }, txt: { s: 'Tracery', h: 5, font: 'inter', align: init.ctx.embossMode ? 'm' : 'l' }, tpl: { type: 'qfp', p: { ...SKO.TEMPLATES.qfp.p } }, ellArcCW: false, conicRho: 0.5, bridge: { mode: 'g1', s1: 1, s2: 1, first: null, hoverEnd: null }, shape: { type: 'star', p: { ...SKO.SHAPES.star.p } }, shapesOpen: false, formula: { preset: 'sinus', ...SKO.FORMULA_CURVES.sinus }, formulaOpen: false, csv: { kind: 'spline', closed: false, text: '' }, csvOpen: false, wallT: 2, bg: init.bg ? deepClone(init.bg) : null, patSel: [], patCenter: null, patPick: false, patCurve: null, patPickCurve: false, mir: null, liveMir: null, liveMirPick: false, hoverEnt: null, trimHover: null, check: null, checkFocus: null, autoDef: null, freeMode: false, wiggle: null, lastWiggle: null, conflict: null, showCurv: false, curvScale: 1, curvCombCount: 0, blockInsts: Array.isArray(init.blockInsts) ? deepClone(init.blockInsts) : [], blocks0: App.doc && Array.isArray(App.doc.blocks) ? deepClone(App.doc.blocks) : [], selBlockInst: null, blockActive: (App.doc && Array.isArray(App.doc.blocks) && App.doc.blocks[0]) ? App.doc.blocks[0].id : null, blockEdit: null, blockRot: 0, blockLibOpen: false, gridMode: init.gridMode === 'polar' ? 'polar' : 'rect', polar: { rStep: clamp(Number(init.polar && init.polar.rStep) || 5, 0.1, 1000), aStep: clamp(Number(init.polar && init.polar.aStep) || 15, 1, 90) }, guides: Array.isArray(init.guides) ? deepClone(init.guides) : [], guideDrag: null, gridOpen: false, guideAxis: 'x', guideVal: 15, _lastSimple: isSimpleMode() };
    S.dims = init.dims || []; S.cons = init.cons || []; S.picks = []; S.dimFirst = null; S.dimMode = 'auto'; S.dimCircMode = 'center'; S.dimPicks = []; S.ordBase = null; S.ordAxis = 'auto'; S.selCon = null;
    S.plane0 = deepClone(init.plane); S.pOff = init.pOff || 0; S.pTilt = 0;
    if (S.pOff) applyPlane(false, true);
    ensureSketchFonts(S.tool === 'text' ? S.txt.font : null);
    syncCurrentBlocks();
    reapply();   // Maße mit den aktuellen Werten aus „Maße“ nachrechnen
    App.clearSelection();
    Viewer.useButtons('sketch');
    document.body.classList.add('sketching');
    buildGroup();
    const b = SK.bounds([...S.ents, ...S.refs]);
    const size = init.viewSize || (b ? Math.max(40, Math.max(b[2] - b[0], b[3] - b[1]) * 0.75) : 70);
    const c2 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
    const cw = S.F.o.clone().addScaledVector(S.F.x, c2[0]).addScaledVector(S.F.y, c2[1]);
    Viewer.lookAtPlane(cw.toArray(), S.F.n.toArray(), S.F.x.toArray(), size);
    if (!skipDraw) { showBar(); showRulers(); }
    App.emit('mode');
    Panels.renderRight(); Panels.renderCtx(); Handles.clear();
    UI.hint(hintFor(S.tool));
    render();
  }
  // ---------- Leiste ----------
  let bar = null;
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar', role: 'toolbar', 'aria-label': T('sk.bar.aria') });
    bar.append(h('span', { class: 'title' }, S.blockEdit ? T('sk.bar.blockEditTitle', { name: S.blockEdit.name }) : isSkeletonMode() ? T('skel.barTitle', { name: S.ctx.skeletonName || T('skel.defaultName') }) : T('sk.bar.title')));
    const vsep = () => h('span', { class: 'vsep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)', margin: '4px 4px' } });
    for (const t of TOOLS) {
      if (t.id === 'block' && S.blockEdit) continue;
      if (t.sep) bar.append(vsep());
      const hk = HELPKEY[t.id] || t.id;
      const b = h('button', { type: 'button', class: 'tool' + (t.pro ? ' pro' : '') + (S.tool === t.id ? ' active' : ''), 'data-tip': t.tip, 'data-kbd': t.key || null, 'aria-label': t.label, dataset: { tool: t.id, help: hk } });
      b.innerHTML = icon(t.icon) + `<span>${esc(t.label)}</span>`;
      b.onclick = () => setTool(t.id);
      bar.append(b);
    }
    const cb = h('button', { type: 'button', class: 'tool conmode' + (S.construction ? ' active' : ''), 'aria-pressed': S.construction ? 'true' : 'false', 'data-tip': T('sk.bar.conTip'), 'data-kbd': 'X', 'aria-label': T('sk.bar.con'), dataset: { help: 'construct2d' } });
    cb.innerHTML = icon('construct') + `<span>${esc(T('sk.bar.con'))}</span>`; cb.onclick = () => toggleConstruction();
    const lm = h('button', { type: 'button', class: 'tool livemirror pro' + (S.liveMir ? ' active' : ''), id: 'sk-live-mir-btn', 'aria-pressed': S.liveMir ? 'true' : 'false', 'data-tip': T('sk.bar.liveMirTip'), 'aria-label': T('sk.bar.liveMir'), dataset: { help: 'liveMirror' } });
    lm.innerHTML = icon('cSymmetric') + `<span>${esc(T('sk.bar.liveMir'))}</span>`; lm.onclick = () => toggleLiveMirror();
    bar.append(vsep(), cb, lm, vsep());
    const un = h('button', { type: 'button', class: 'tool', 'data-tip': T('topbar.undo'), 'data-kbd': 'Strg Z', 'aria-label': T('topbar.undo') }); un.innerHTML = icon('undo'); un.onclick = () => sketchUndo();
    const cn = h('button', { type: 'button', class: 'tool', 'data-tip': S.blockEdit ? T('sk.block.cancelEdit') : T('sk.bar.cancelTip'), 'aria-label': T('common.cancel') }); cn.innerHTML = icon('close'); cn.onclick = () => (S && S.blockEdit ? finishBlockEdit(false) : cancel());
    const ok = h('button', { type: 'button', class: 'tool primary', id: S.blockEdit ? 'sk-block-bar-done' : undefined, 'data-tip': S.blockEdit ? T('sk.block.finishEdit') : T('sk.bar.doneTip'), 'data-kbd': 'Enter' }); ok.innerHTML = icon('check') + `<span>${esc(T('common.done'))}</span>`; ok.onclick = () => (S && S.blockEdit ? finishBlockEdit(true) : done());
    bar.append(un, cn, ok);
    bars = h('div', { class: 'skbars' });
    bars.append(bar);
    $('#overlay').append(bars);
    // zweite Leiste: Regeln
    cbar = h('div', { class: 'consbar vert', role: 'toolbar', 'aria-label': T('sk.bar.rulesAria'), 'aria-orientation': 'vertical' });
    cbar.append(h('span', { class: 'title' }, T('sk.bar.rulesTitle')));
    for (const t of CTOOLS) {
      if (t.id === 'project' && !S.refs.length) continue;
      const b = h('button', { type: 'button', class: 'tool' + (t.pro ? ' pro' : '') + (S.tool === 'c:' + t.id ? ' active' : ''), 'data-tip': t.label, 'aria-label': t.label, dataset: { tool: 'c:' + t.id, help: t.help } });
      b.innerHTML = icon(t.icon);
      b.onclick = () => quickOrTool(t.id);
      cbar.append(b);
    }
    $('#overlay').append(cbar);
  }
  let cbar = null;
  let bars = null;
  let rulerT = null, rulerL = null, rulerC = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } if (cbar) { cbar.remove(); cbar = null; } if (bars) { bars.remove(); bars = null; } }
  function hideRulers() { if (rulerT) { rulerT.remove(); rulerT = null; } if (rulerL) { rulerL.remove(); rulerL = null; } if (rulerC) { rulerC.remove(); rulerC = null; } }
  const polarActive = () => !!(S && !S.step && S.gridMode === 'polar' && !isSimpleMode());
  const guidesActive = () => !!(S && !S.step && !isSimpleMode());
  function startGuideDrag(axis, id, e) {
    if (!guidesActive() || guardLocked()) return;
    e.preventDefault(); e.stopPropagation();
    const uv = mouseUV(e) || [0, 0];
    const ex = id ? (S.guides || []).find((g) => g.id === id) : null;
    S.guideDrag = {
      mode: ex ? 'move' : 'new',
      axis,
      id: ex ? ex.id : null,
      v: ex ? ex.v : round(axis === 'x' ? uv[0] : uv[1], 4),
      origV: ex ? ex.v : null,
      remove: !ex,
    };
    guideDragMove(e);
  }
  function guideDragMove(e) {
    if (!S || !S.guideDrag) return;
    const d = S.guideDrag;
    const cr = Viewer.canvas.getBoundingClientRect();
    d.remove = d.axis === 'x' ? (e.clientX <= cr.left + 20) : (e.clientY <= cr.top + 20);
    const uv = mouseUV(e);
    if (uv) {
      let raw = d.axis === 'x' ? uv[0] : uv[1];
      if (!e.altKey) {
        const step = e.shiftKey ? 0.1 : (App.doc.settings.snap === false ? 0 : (App.doc.settings.grid || 1));
        if (step) raw = Math.round(raw / step) * step;
      }
      d.v = round(raw, 4);
    }
    render();
  }
  function guideDragUp(e) {
    if (!S || !S.guideDrag) return;
    if (e) guideDragMove(e);
    const d = S.guideDrag;
    S.guideDrag = null;
    if (d.remove) {
      if (d.mode === 'move' && d.id) removeGuide(d.id);
      else render();
    } else if (d.mode === 'new') {
      addGuide(d.axis, d.v);
    } else if (d.mode === 'move' && d.id) {
      if (Math.abs(d.v - d.origV) > 1e-6) moveGuide(d.id, d.v);
      else render();
    }
  }
  function showRulers() {
    hideRulers();
    const ov = $('#overlay');
    if (!ov) return;
    rulerC = h('button', { type: 'button', class: 'sk-ruler-corner pro', id: 'sk-ruler-c', 'data-tip': T('sk.ruler.cornerTip'), 'data-help': 'polarGrid', 'aria-label': T('sk.ruler.cornerTip') });
    rulerC.innerHTML = icon(polarActive() ? 'target' : 'grid');
    rulerC.onclick = () => togglePolarGrid();
    rulerT = h('div', { class: 'sk-ruler sk-ruler-t pro', id: 'sk-ruler-t', 'data-tip': T('sk.ruler.topTip'), 'data-help': 'rulerGuides' }, h('canvas'));
    rulerL = h('div', { class: 'sk-ruler sk-ruler-l pro', id: 'sk-ruler-l', 'data-tip': T('sk.ruler.leftTip'), 'data-help': 'rulerGuides' }, h('canvas'));
    rulerT.addEventListener('pointerdown', (e) => { if (e.button === 0) startGuideDrag('y', null, e); });
    rulerL.addEventListener('pointerdown', (e) => { if (e.button === 0) startGuideDrag('x', null, e); });
    ov.append(rulerC, rulerT, rulerL);
    updateRulers();
  }
  function updateRulers() {
    if (!S || S.step || !rulerT || !rulerL || isSimpleMode()) return;
    if (rulerC) {
      rulerC.classList.toggle('polar', polarActive());
      rulerC.innerHTML = icon(polarActive() ? 'target' : 'grid');
    }
    const s0 = Viewer.toScreen(toWorld(0, 0));
    const sx = Viewer.toScreen(toWorld(10, 0));
    const sy = Viewer.toScreen(toWorld(0, 10));
    const pxX = (sx.x - s0.x) / 10;
    const pxY = (sy.y - s0.y) / 10;
    const th = Viewer.theme;
    const tickCol = th.dark ? 'rgba(207,227,223,0.42)' : 'rgba(18,59,55,0.36)';
    const textCol = th.dark ? 'rgba(207,227,223,0.72)' : 'rgba(18,59,55,0.68)';
    const guideCol = th.dark ? '#3bc9db' : '#0b93a8';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawOne = (el, axis, pxPerMm, originScr) => {
      const cv = el.querySelector('canvas');
      if (!cv) return;
      const w = el.clientWidth, hh = el.clientHeight;
      if (!w || !hh) return;
      const cw = Math.round(w * dpr), ch = Math.round(hh * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hh);
      const absPx = Math.abs(pxPerMm);
      if (!(absPx > 1e-4) || !isFinite(originScr)) return;
      const len = axis === 'x' ? w : hh;
      const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
      const step = steps.find((st) => st * absPx >= 48) || 500;
      const sub = step >= 10 ? 5 : 2;
      const minor = step / sub;
      const vStart = (20 - originScr) / pxPerMm;
      const vEnd = (len + 20 - originScr) / pxPerMm;
      const vLo = Math.min(vStart, vEnd), vHi = Math.max(vStart, vEnd);
      const k0 = Math.floor(vLo / minor) - 1, k1 = Math.ceil(vHi / minor) + 1;
      ctx.font = '500 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = tickCol;
      ctx.fillStyle = textCol;
      for (let k = k0; k <= k1 && k - k0 < 400; k++) {
        const val = k * minor;
        const pos = originScr + val * pxPerMm - 20;
        if (pos < -2 || pos > len + 2) continue;
        const isMaj = ((k % sub) + sub) % sub === 0;
        ctx.beginPath();
        if (axis === 'x') {
          ctx.moveTo(pos, hh);
          ctx.lineTo(pos, isMaj ? 5 : 13);
        } else {
          ctx.moveTo(w, pos);
          ctx.lineTo(isMaj ? 5 : 13, pos);
        }
        ctx.stroke();
        if (isMaj) {
          const disp = Units ? Units.fromMM(val) : val;
          const lbl = String(Math.abs(disp) < 1e-6 ? 0 : round(disp, 2));
          if (axis === 'x') ctx.fillText(lbl, pos + 2, 2);
          else {
            ctx.save();
            ctx.translate(2, pos - 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(lbl, 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.fillStyle = guideCol;
      for (const g of S.guides || []) {
        if (g.axis !== axis) continue;
        const pos = originScr + g.v * pxPerMm - 20;
        if (pos < -6 || pos > len + 6) continue;
        ctx.beginPath();
        if (axis === 'x') {
          ctx.moveTo(pos, hh); ctx.lineTo(pos - 4, hh - 7); ctx.lineTo(pos + 4, hh - 7);
        } else {
          ctx.moveTo(w, pos); ctx.lineTo(w - 7, pos - 4); ctx.lineTo(w - 7, pos + 4);
        }
        ctx.closePath();
        ctx.fill();
      }
    };
    drawOne(rulerT, 'x', pxX, s0.x);
    drawOne(rulerL, 'y', pxY, s0.y);
  }
  function selectedIds() {
    if (!S) return [];
    return [...new Set((S.sels || []).filter((id) => ent(id)))];
  }
  function setSel(ids) {
    if (!S) return;
    const uniq = [...new Set((ids || []).filter((id) => ent(id)))];
    S.sels = uniq;
    if (uniq.length) S.selCon = null;
    if (typeof App !== 'undefined' && App.emit) App.emit('sketchSel');
  }
  function clearSel() { if (!S) return; S.sels = []; S.selHandle = null; S.selBlockInst = null; if (typeof App !== 'undefined' && App.emit) App.emit('sketchSel'); }
  function clearBand() { if (S && S.band) { if (S.band.el) S.band.el.remove(); S.band = null; } }
  const isSimpleMode = () => typeof ViewPrefs !== 'undefined' && ViewPrefs.level === 'simple';
  function setSplineMode(mode) {
    if (!S || S.step) return false;
    if (mode === 'cv' && isSimpleMode()) return false;
    S.splineMode = mode === 'cv' ? 'cv' : 'fit';
    S.draft = null;
    if (S.tool === 'spline') UI.hint(hintFor('spline'));
    render(); Panels.renderRight();
    return true;
  }
  function setDimMode(mode) {
    if (!S || !['auto', 'arcLen', 'ang3', 'ord'].includes(mode)) return false;
    if (mode === 'ord' && isSimpleMode()) return false;
    S.dimMode = mode; S.dimFirst = null; S.dimPicks = []; S.ordBase = null; hideDimBox();
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    return true;
  }
  function setDimCircMode(cm) {
    if (!S || !['center', 'min', 'max'].includes(cm)) return false;
    S.dimCircMode = cm;
    Panels.renderRight();
    return true;
  }
  let lastLockToast = 0;
  function guardLocked() {
    if (!S || !S.locked) return false;
    const now = Date.now();
    if (now - lastLockToast > 1200) {
      lastLockToast = now;
      UI.toast(T('sk.toast.locked'), { icon: 'lock', ms: 2400 });
    }
    return true;
  }
  function setLocked(on) {
    if (!S) return false;
    const next = !!on;
    if (S.locked === next) return next;
    S.locked = next;
    S.lockedDrag = null;
    if (next) {
      S.draft = null; S.drag = null; S.dragPins = null; S.dragged = false;
      S.picks = []; S.dimFirst = null; S.dimPicks = []; S.ordBase = null;
      S.autoDef = null; S.mir = null; S.liveMirPick = false; S.patPick = false; S.patPickCurve = false; S.icPick = null;
      Viewer.highlightFace('sel', null, null);
      if (S.stretch) { S.stretch.box = null; S.stretch.sel = null; }
      if (S.bridge) { S.bridge.first = null; S.bridge.hoverEnd = null; }
      stopWiggle(true);
      if (S.freeMode) setFreeMode(false);
      hideEntry(); hideDimBox();
      if (S.tool !== 'select') {
        S.tool = 'select';
        for (const el of [bar, cbar]) if (el) $$('.tool[data-tool]', el).forEach((b) => b.classList.toggle('active', b.dataset.tool === 'select'));
        UI.hint(hintFor('select'));
      }
    }
    render(); Panels.renderRight();
    UI.toast(T(next ? 'sk.toast.lockOn' : 'sk.toast.lockOff'), { icon: next ? 'lock' : 'unlock', ms: 2400 });
    return S.locked;
  }
  function toggleLocked() { return S ? setLocked(!S.locked) : false; }
  function setTool(id) {
    if (!S) return;
    if (S.locked && id !== 'select') { guardLocked(); return; }
    if (id === 'c:curvature' && isSimpleMode()) { UI.toast(T('sk.toast.curvProOnly'), { icon: 'info' }); return; }
    if ((id === 'stretch' || id === 'silhouette' || id === 'intersect' || id === 'conic' || id === 'bridge' || id === 'block') && isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return; }
    if (id === 'block' && S.blockEdit) { UI.toast(T('sk.toast.blockNoNest'), { icon: 'info' }); return; }
    if (id === 'block') {
      const blks = (App.doc && Array.isArray(App.doc.blocks)) ? App.doc.blocks : [];
      if (!blks.some((b) => b.id === S.blockActive)) S.blockActive = blks[0] ? blks[0].id : null;
    }
    commitDraftPolyline();
    clearBand();
    const carry = (id === 'xmove' || id === 'patrect' || id === 'patcirc' || id === 'patcurve') ? selectedIds() : [];
    S.tool = id; S.draft = null; S.picks = []; S.dimFirst = null; S.dimPicks = []; S.ordBase = null; S.icPick = null; hideEntry(); hideDimBox();
    if (isSimpleMode() && S.dimMode === 'ord') S.dimMode = 'auto';
    if (isSimpleMode() && S.splineMode === 'cv') S.splineMode = 'fit';
    S.mir = null; S.liveMirPick = false; S.patSel = carry; S.patPick = false; S.patCurve = null; S.patPickCurve = (id === 'patcurve' && carry.length > 0); S.trimHover = null; S.trimming = false; S.hoverEnt = null; S.hoverHandle = null; S.autoDef = null;
    if (S.fill) {
      S.fill.hoverRegionKey = null;
      if (id === 'patfill') {
        const regs = SK.regions(S.ents);
        if (regs.length === 1) S.fill.regionKey = regs[0].key;
        else if (!regs.some((r) => r.key === S.fill.regionKey)) S.fill.regionKey = null;
      }
    }
    if (S.stretch) { S.stretch.box = null; S.stretch.sel = null; }
    Viewer.highlightFace('sel', null, null);
    if (S.bridge) { S.bridge.first = null; S.bridge.hoverEnd = null; }
    Viewer.highlightFace('hover', null, null);
    if (id !== 'select') clearSel();
    for (const el of [bar, cbar]) if (el) $$('.tool[data-tool]', el).forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    if (id === 'text') ensureSketchFonts(S.txt.font || 'inter');
    UI.hint(hintFor(id)); Panels.renderRight(); render();
  }
  // ---------- Umrechnung ----------
  function toWorld(u, v) { return S.F.o.clone().addScaledVector(S.F.x, u).addScaledVector(S.F.y, v); }
  function toUV(p) { const d = p.clone().sub(S.F.o); return [d.dot(S.F.x), d.dot(S.F.y)]; }
  function mouseUV(e) { const p = Viewer.rayPlane(e.clientX, e.clientY, S.F.o, S.F.n); return p ? toUV(p) : null; }
  function pxSize() { return Viewer.pixelSizeAt(S.F.o); }
  // ---------- Einrasten (Fangen) ----------
  // Jede Art von Fangpunkt lässt sich rechts ausschalten; mit gedrückter Alt-Taste wird gar nicht gefangen.
  const SNAPNAMES = { get end() { return 'Endpunkt'; }, get mid() { return 'Mitte'; }, get center() { return 'Mittelpunkt'; }, get quad() { return 'Kreispunkt'; }, get origin() { return 'Ursprung'; }, get cross() { return 'Schnittpunkt'; }, get curve() { return 'Auf Linie'; }, get perp() { return 'Lot'; }, get tangent() { return 'Tangente'; }, get guide() { return T('sk.snap.guide'); } };
  const SNAPGROUP = { end: 'end', origin: 'end', mid: 'mid', center: 'center', quad: 'quad', cross: 'cross', curve: 'curve', perp: 'perp', tangent: 'tangent', guide: 'guide' };
  // kleiner Wert = stärker (wird zum Abstand addiert): Ecken und Schnittpunkte vor Mitten vor „irgendwo auf der Linie“
  const SNAPRANK = { end: 0, origin: 0, center: 0, cross: 0, mid: 0.25, perp: 0.35, tangent: 0.35, quad: 0.5, curve: 0.9 };
  const SNAP_KEYS = ['end', 'mid', 'center', 'quad', 'cross', 'curve', 'perp', 'tangent', 'align', 'guide', 'grid'];
  const snapList = () => SNAP_KEYS.map((k) => [k, T('sk.snap.' + k)]);
  function defaultSnapSet() { const o = {}; for (const k of SNAP_KEYS) o[k] = true; return o; }
  const ANGLE_SNAP_KEY = 'tracery.angleSnap';
  function loadAngleSnap() {
    const raw = storageGet(ANGLE_SNAP_KEY);
    return raw === null ? true : raw !== '0' && raw !== 'false';
  }
  let angleSnapOn = loadAngleSnap();
  function setAngleSnap(on) {
    angleSnapOn = !!on;
    storageSet(ANGLE_SNAP_KEY, angleSnapOn ? '1' : '0');
    const cb = document.getElementById('sk-angle-snap');
    if (cb) cb.checked = angleSnapOn;
    if (S && !S.step && S.tool === 'line' && S.lineMode !== 'tan2' && S.draft && !S.draft.arc && lastMouse) {
      S.cursor = linePoint(lastMouse.uv, lastMouse.e);
      render();
    }
  }
  function setShowCurvature(on) {
    if (!S) return false;
    if (on && isSimpleMode()) { UI.toast(T('sk.toast.curvProOnly'), { icon: 'info' }); return false; }
    S.showCurv = !!on;
    render(); Panels.renderRight();
    return S.showCurv;
  }
  function toggleCurvature() {
    if (!S) return false;
    const next = setShowCurvature(!S.showCurv);
    if (!isSimpleMode()) UI.toast(T(next ? 'sk.toast.curvOn' : 'sk.toast.curvOff'), { icon: 'info', ms: 2000 });
    return next;
  }
  function setCurvatureScale(v) {
    if (!S || !(v > 0)) return false;
    S.curvScale = clamp(Number(v) || 1, 0.1, 20);
    render();
    return S.curvScale;
  }
  function setGridMode(mode) {
    if (!S || S.step) return false;
    if (mode === 'polar' && isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    S.gridMode = mode === 'polar' ? 'polar' : 'rect';
    render(); Panels.renderRight();
    return true;
  }
  function togglePolarGrid() {
    if (!S || S.step) return false;
    const next = S.gridMode === 'polar' ? 'rect' : 'polar';
    if (!setGridMode(next)) return false;
    UI.toast(T(S.gridMode === 'polar' ? 'sk.toast.polarOn' : 'sk.toast.polarOff'), { icon: 'info', ms: 2000 });
    return S.gridMode === 'polar';
  }
  function setPolarGrid(opts = {}) {
    if (!S || S.step) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    if (opts.rStep != null && Number(opts.rStep) > 0) S.polar.rStep = clamp(Number(opts.rStep), 0.1, 1000);
    if (opts.aStep != null && Number(opts.aStep) > 0) S.polar.aStep = clamp(Number(opts.aStep), 1, 90);
    render(); Panels.renderRight();
    return { ...S.polar };
  }
  function addGuide(axis, v, opts = {}) {
    if (!S || S.step || isSimpleMode() || guardLocked()) return null;
    const ax = axis === 'y' ? 'y' : 'x';
    const val = round(Number(v), 4);
    if (!isFinite(val)) return null;
    const dup = (S.guides || []).find((g) => g.axis === ax && Math.abs(g.v - val) < 1e-4);
    if (dup) return dup;
    pushUndo();
    const g = { id: uid('g'), axis: ax, v: val };
    S.guides.push(g);
    render(); Panels.renderRight();
    if (!opts.quiet) UI.toast(T('sk.toast.guideAdded', { axis: ax.toUpperCase(), v: Units.fmtLenU(val, 2) }), { icon: 'check', ms: 2000 });
    return g;
  }
  function moveGuide(id, v) {
    if (!S || S.step || isSimpleMode() || guardLocked()) return false;
    const g = (S.guides || []).find((x) => x.id === id);
    const val = round(Number(v), 4);
    if (!g || !isFinite(val)) return false;
    if (Math.abs(g.v - val) < 1e-6) return true;
    pushUndo();
    g.v = val;
    render(); Panels.renderRight();
    return true;
  }
  function removeGuide(id, opts = {}) {
    if (!S || guardLocked()) return false;
    const idx = (S.guides || []).findIndex((x) => x.id === id);
    if (idx < 0) return false;
    pushUndo();
    S.guides.splice(idx, 1);
    render(); Panels.renderRight();
    if (!opts.quiet) UI.toast(T('sk.toast.guideRemoved'), { icon: 'info', ms: 1800 });
    return true;
  }
  function clearGuides() {
    if (!S || !(S.guides || []).length || guardLocked()) return 0;
    const n = S.guides.length;
    pushUndo();
    S.guides = [];
    render(); Panels.renderRight();
    UI.toast(T('sk.toast.guidesCleared'), { icon: 'info', ms: 1800 });
    return n;
  }
  let crossCache = null;
  function crossings() {
    const k = JSON.stringify(S.ents) + '|' + S.refs.length;
    if (!crossCache || crossCache.k !== k) crossCache = { k, v: SKO.intersections(S.ents, S.refs) };
    return crossCache.v;
  }
  // Startpunkt des gerade gezeichneten Stücks – davon aus gelten Lot und Tangente
  function snapFrom() {
    const d = S.draft; if (!d) return null;
    if (d.pts && d.pts.length && !d.arc) return d.pts[d.pts.length - 1];
    if (d.a && !d.b && (S.tool === 'arc' || S.tool === 'slot')) return d.a;
    return null;
  }
  let lastPtrType = 'mouse', penDown = false, lastPenAt = 0, skTouchDraft = null;
  function snap(uv, opts = {}) {
    if (opts.off) return { p: uv.slice(), guides: [], kind: null };
    const set = S.snapSet || defaultSnapSet();
    const tol = pxSize() * (opts.pen ? 8 : opts.touch ? 15 : 11);
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
    if (!opts.noAlign && set.align !== false) for (const c of pts) {
      if (Math.abs(c.p[0] - uv[0]) < dx) { dx = Math.abs(c.p[0] - uv[0]); gx = c.p; }
      if (Math.abs(c.p[1] - uv[1]) < dy) { dy = Math.abs(c.p[1] - uv[1]); gy = c.p; }
    }
    const gridOn = !opts.noGrid && set.grid !== false && App.doc.settings.snap !== false;
    // Lineal-Hilfslinien (vor dem Raster prüfen, damit auch bei polarem Raster exakt darauf gefangen wird)
    if (guidesActive() && set.guide !== false && S.guides && S.guides.length) {
      const gs = Snap.guideSnap(uv, S.guides, tol);
      if (gs) {
        if (gs.both) {
          return {
            p: [gs.x.v, gs.y.v],
            guides: [],
            tip: T('sk.snap.guideCrossTip', { x: Units.fmtLen(gs.x.v, 2), y: Units.fmtLenU(gs.y.v, 2) }),
            kind: 'guide',
            guideHits: gs.ids,
          };
        }
        const cartGrid = gridOn && !polarActive() ? (opts.fine ? 0.1 : App.doc.settings.grid || 1) : 0;
        if (gs.x) {
          p[0] = gs.x.v;
          if (gy) { p[1] = gy[1]; guides.push([gy, [p[0], gy[1]]]); }
          else if (cartGrid) p[1] = round(Math.round(uv[1] / cartGrid) * cartGrid, 6);
          else p[1] = round(uv[1], 4);
        } else if (gs.y) {
          p[1] = gs.y.v;
          if (gx) { p[0] = gx[0]; guides.push([gx, [gx[0], p[1]]]); }
          else if (cartGrid) p[0] = round(Math.round(uv[0] / cartGrid) * cartGrid, 6);
          else p[0] = round(uv[0], 4);
        }
        const tip = gs.x ? T('sk.snap.guideXTip', { v: Units.fmtLenU(gs.x.v, 2) }) : T('sk.snap.guideYTip', { v: Units.fmtLenU(gs.y.v, 2) });
        return { p, guides, tip, kind: 'guide', guideHits: gs.ids };
      }
    }
    // Polares Raster (Ringe und Strahlen, nur Profi)
    if (gridOn && polarActive()) {
      const ps = Snap.polarSnap(uv, { rStep: S.polar.rStep, aStep: S.polar.aStep, fine: !!opts.fine });
      return {
        p: ps.p,
        guides: ps.r > 1e-6 ? [[[0, 0], ps.p]] : [],
        tip: 'r ' + Units.fmtLenU(ps.r, 2) + ' · ' + fmtAngleU(ps.deg),
        kind: 'polar',
        polar: ps,
      };
    }
    const grid = gridOn ? (opts.fine ? 0.1 : App.doc.settings.grid || 1) : 0;
    if (grid) { p = [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid]; }
    if (gx) { p[0] = gx[0]; guides.push([gx, [gx[0], p[1]]]); }
    if (gy) { p[1] = gy[1]; guides.push([gy, [p[0], gy[1]]]); }
    return { p, guides, kind: grid ? 'grid' : null };
  }
  function lengthSnapStep() {
    const ps = pxSize();
    if (ps <= 0.015) return 0.1;
    if (ps <= 0.055) return 0.5;
    return 1;
  }
  function angleSnap(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L0 = Math.hypot(dx, dy);
    if (L0 < 1e-6) return { p: b.slice(), tip: null, guide: null, angle: null, step: null };
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const near15 = Math.round(deg / 15) * 15;
    const hitAngle = Math.abs(deg - near15) <= 4;
    const rad = hitAngle ? (near15 * Math.PI) / 180 : Math.atan2(dy, dx);
    const step = lengthSnapStep();
    const L = round(Math.max(step, Math.round(L0 / step) * step), 4);
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const p = [round(a[0] + ux * L, 6), round(a[1] + uy * L, 6)];
    if (!hitAngle) return { p, tip: null, guide: null, angle: null, step };
    let disp = Math.round(near15);
    if (disp === -180) disp = 180;
    if (Object.is(disp, -0)) disp = 0;
    const tip = disp === 0 || disp === 180 ? `waagerecht · ${disp}°` : (disp === 90 || disp === -90 ? `senkrecht · ${disp}°` : `${disp}°`);
    const ext = pxSize() * 140;
    const guide = [a.slice(), [p[0] + ux * ext, p[1] + uy * ext]];
    return { p, tip, guide, angle: disp, step };
  }
  function linePoint(uv0, e) {
    const shift = !!(e && e.shiftKey), alt = !!(e && e.altKey);
    const pt = (e && e.pointerType) || lastPtrType;
    if (alt) return snap(uv0, { off: true });
    const a = S.draft.pts[S.draft.pts.length - 1];
    const prev = S.draft.last && ent(S.draft.last.id);
    const prevTan = prev && prev.type === 'arc' ? endTangent(prev, S.draft.last.end) : null;
    const sn = snap(uv0, { fine: shift, off: false, noGrid: shift, noAlign: shift, pen: pt === 'pen', touch: pt === 'touch' });
    const isGeomSnap = !!(sn.kind && sn.kind !== 'grid');
    if (isGeomSnap) return sn;
    if (prevTan) {
      const ts = tanLineSnap(a, shift ? sn.p : uv0, prevTan);
      if (ts) {
        let p = ts.p;
        if (angleSnapOn && !shift) {
          const L0 = SK.d2(a, p), step = lengthSnapStep(), L = round(Math.max(step, Math.round(L0 / step) * step), 4);
          p = [round(a[0] + prevTan.t[0] * L, 6), round(a[1] + prevTan.t[1] * L, 6)];
        }
        const ext = pxSize() * 140;
        return { ...sn, p, tip: ts.tip, guides: [...(sn.guides || []), [a.slice(), [p[0] + prevTan.t[0] * ext, p[1] + prevTan.t[1] * ext]]], tan: true };
      }
    }
    if (!angleSnapOn || shift) return sn;
    const as = angleSnap(a, uv0);
    const guides = (sn.guides || []).filter((g) => SK.d2(g[0], a) > 1e-6);
    if (as.guide) guides.push(as.guide);
    return { p: as.p, guides, tip: as.tip, kind: as.angle != null ? 'angle' : null, angle: as.angle, lenStep: as.step };
  }
  // ---------- Zeichnen ----------
  function pushUndo() { if (S) { S.autoDef = null; S.conflict = null; stopWiggle(true); } S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons, guides: S.guides || [], blockInsts: S.blockInsts || [], ...(!S.blockEdit && App.doc ? { blocks: App.doc.blocks || [] } : {}) })); if (S.undo.length > 100) S.undo.shift(); }
  function sketchUndo() {
    if (guardLocked()) return;
    if (S.draft && S.draft.pts && S.draft.pts.length > 1 && S.tool === 'line') { S.draft = null; hideEntry(); updateLineHint(); render(); return; }
    const last = S.undo.pop(); if (last == null) return;
    const st = JSON.parse(last); S.ents = st.ents; S.dims = st.dims || []; S.cons = st.cons || [];
    if (Array.isArray(st.guides)) S.guides = st.guides;
    if (Array.isArray(st.blockInsts)) S.blockInsts = st.blockInsts;
    if (!S.blockEdit && Array.isArray(st.blocks) && App.doc) { App.doc.blocks = st.blocks; syncCurrentBlocks(); }
    clearSel(); S.selCon = null; S.draft = null; S.picks = []; S.dimPicks = []; S.ordBase = null; S.autoDef = null; S.conflict = null;
    if (S.liveMir && !ent(S.liveMir.axis)) { S.liveMir = null; S.liveMirPick = false; syncLiveMirBtn(); }
    if (S.stretch) { S.stretch.box = null; S.stretch.sel = null; }
    if (S.bridge) { S.bridge.first = null; S.bridge.hoverEnd = null; }
    stopWiggle(true); reapply(); updateLineHint(); render(); Panels.renderRight();
  }
  // ---------- Skizzen-Blöcke (SK-31): Gruppen speichern, mehrfach einsetzen, zentral ändern ----------
  function moveEntDirect(e, dx, dy) {
    const sh = (p) => { if (Array.isArray(p)) { p[0] = round(p[0] + dx, 6); p[1] = round(p[1] + dy, 6); } };
    for (const k of ['a', 'b', 'c', 'm']) sh(e[k]);
    for (const k of ['pts', 'onP']) if (Array.isArray(e[k])) e[k].forEach(sh);
  }
  function docBlocks() {
    if (!App.doc) return [];
    if (!Array.isArray(App.doc.blocks)) App.doc.blocks = [];
    return App.doc.blocks;
  }
  function instEnts(instId) { return S ? S.ents.filter((e) => e.blk === instId) : []; }
  function syncCurrentBlocks() {
    if (!S || S.blockEdit || typeof Model.syncSketchBlocks !== 'function') return;
    Model.syncSketchBlocks(S, docBlocks(), vars());
    if (S.selBlockInst && !(S.blockInsts || []).some((i) => i.id === S.selBlockInst)) S.selBlockInst = null;
    if (S.sels && S.sels.length) S.sels = S.sels.filter((id) => ent(id));
  }
  function selectBlockInst(instId) {
    if (!S) return false;
    const inst = (S.blockInsts || []).find((i) => i.id === instId);
    if (!inst) { clearSel(); return false; }
    setSel(instEnts(instId).map((e) => e.id));
    S.selBlockInst = instId;
    S.selCon = null;
    return true;
  }
  function createBlock(name, ids) {
    if (!S || S.step || guardLocked()) return null;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return null; }
    if (S.blockEdit) { UI.toast(T('sk.toast.blockNoNest'), { icon: 'info' }); return null; }
    const srcIds = [...new Set(ids && ids.length ? ids : selectedIds())].filter((id) => { const e = ent(id); return e && !e.blk; });
    if (!srcIds.length) { UI.toast(T('sk.toast.blockNeedSel'), { icon: 'info' }); return null; }
    const srcSet = new Set(srcIds);
    const srcEnts = srcIds.map((id) => ent(id));
    const bb = SK.bounds(srcEnts) || [0, 0, 0, 0];
    const cx = round((bb[0] + bb[2]) / 2, 4), cy = round((bb[1] + bb[3]) / 2, 4);
    pushUndo();
    const idMap = new Map();
    for (const id of srcIds) idMap.set(id, uid('e'));
    const re = (r) => (r && r.e && idMap.has(r.e) ? { ...r, e: idMap.get(r.e) } : r);
    const inSet = (r) => !r || srcSet.has(r.e);
    const blkEnts = srcEnts.map((src) => {
      const c = deepClone(src);
      c.id = idMap.get(src.id);
      delete c.link; delete c.revAxis; delete c.blk; delete c.blkId; delete c.blkSrc;
      moveEntDirect(c, -cx, -cy);
      return c;
    });
    const blkCons = S.cons.filter((c) => CLIPCONS.has(c.type) && (c.refs || []).length && c.refs.every(inSet) && c.refs.some((r) => r && srcSet.has(r.e)))
      .map((c) => ({ ...deepClone(c), id: uid('k'), refs: c.refs.map(re) }));
    const blkDims = S.dims.filter((d) => (d.e ? srcSet.has(d.e) && d.k !== 'x' && d.k !== 'y' : (d.refs || []).length && d.refs.every((r) => r && srcSet.has(r.e))))
      .map((d) => (d.e ? { ...deepClone(d), id: uid('m'), e: idMap.get(d.e) } : { ...deepClone(d), id: uid('m'), refs: d.refs.map(re) }));
    const blocks = docBlocks();
    const blk = { id: uid('blk'), name: (name || '').trim() || T('sk.block.defName', { n: blocks.length + 1 }), ents: blkEnts, dims: blkDims, cons: blkCons };
    blocks.push(blk);
    for (const id of srcIds) removeEntData(id);
    if (!Array.isArray(S.blockInsts)) S.blockInsts = [];
    const inst = { id: uid('bi'), blockId: blk.id, x: cx, y: cy, rot: 0 };
    S.blockInsts.push(inst);
    S.blockActive = blk.id;
    S.blockLibOpen = true;
    syncCurrentBlocks();
    selectBlockInst(inst.id);
    reapply(); render(); Panels.renderRight();
    UI.toast(T('sk.toast.blockCreated', { name: blk.name }), { icon: 'check', ms: 2600 });
    return blk;
  }
  function insertBlock(blockId, x = 0, y = 0, rot = 0) {
    if (!S || S.step || guardLocked()) return null;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return null; }
    if (S.blockEdit) { UI.toast(T('sk.toast.blockNoNest'), { icon: 'info' }); return null; }
    const blk = docBlocks().find((b) => b.id === blockId);
    if (!blk) { UI.toast(T('sk.toast.blockSelectFirst'), { icon: 'info' }); return null; }
    pushUndo();
    if (!Array.isArray(S.blockInsts)) S.blockInsts = [];
    const inst = { id: uid('bi'), blockId: blk.id, x: round(Number(x) || 0, 4), y: round(Number(y) || 0, 4), rot: round(Number(rot) || 0, 4) };
    S.blockInsts.push(inst);
    S.blockActive = blk.id;
    syncCurrentBlocks();
    selectBlockInst(inst.id);
    reapply(); render(); Panels.renderRight();
    return inst;
  }
  function updateBlockInst(instId, patch = {}, opts = {}) {
    if (!S || S.step || (!opts.noUndo && guardLocked())) return false;
    const inst = (S.blockInsts || []).find((i) => i.id === instId);
    if (!inst) return false;
    if (!opts.noUndo) pushUndo();
    if (patch.x != null && isFinite(Number(patch.x))) inst.x = round(Number(patch.x), 4);
    if (patch.y != null && isFinite(Number(patch.y))) inst.y = round(Number(patch.y), 4);
    if (patch.rot != null && isFinite(Number(patch.rot))) inst.rot = round(Number(patch.rot), 4);
    syncCurrentBlocks();
    if (S.selBlockInst === instId) selectBlockInst(instId);
    reapply({ fast: !!opts.fast });
    render();
    if (!opts.fast) Panels.renderRight();
    return true;
  }
  function deleteBlockInst(instId) {
    if (!S || S.step || guardLocked() || S.blockEdit) return false;
    const had = (S.blockInsts || []).some((i) => i.id === instId);
    if (!had) return false;
    pushUndo();
    S.blockInsts = S.blockInsts.filter((i) => i.id !== instId);
    if (S.selBlockInst === instId) clearSel();
    syncCurrentBlocks(); reapply(); render(); Panels.renderRight();
    return true;
  }
  function explodeBlockInst(instId) {
    if (!S || S.step || guardLocked() || S.blockEdit) return 0;
    const inst = (S.blockInsts || []).find((i) => i.id === instId);
    if (!inst) return 0;
    const blk = docBlocks().find((b) => b.id === inst.blockId);
    pushUndo();
    let solvedEnts = blk ? (blk.ents || []) : [];
    if (blk && ((blk.dims && blk.dims.length) || (blk.cons && blk.cons.length))) {
      solvedEnts = Solver.cached({ ents: blk.ents || [], dims: blk.dims || [], cons: blk.cons || [] }, vars()).ents;
    }
    const ang = ((Number(inst.rot) || 0) * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang);
    const ix = Number(inst.x) || 0, iy = Number(inst.y) || 0;
    const xf = (pt) => [round(ix + pt[0] * cs - pt[1] * sn, 6), round(iy + pt[0] * sn + pt[1] * cs, 6)];
    const rot90 = Math.abs(sn) < 1e-6 || Math.abs(cs) < 1e-6;
    const singleMap = new Map(), added = [];
    for (const se of solvedEnts) {
      const m = SKO.mapEnt(se, xf, (q) => (q.rot || 0) + ang, se.type === 'rect' && !rot90);
      if (m.ents.length === 1) singleMap.set(se.id, m.ents[0].id);
      for (const me of m.ents) added.push(me);
    }
    const re = (r) => (r && r.e && singleMap.has(r.e) ? { ...r, e: singleMap.get(r.e) } : r);
    S.blockInsts = S.blockInsts.filter((i) => i.id !== instId);
    S.ents = S.ents.filter((e) => e.blk !== instId);
    S.ents.push(...added);
    if (blk) {
      for (const c of blk.cons || []) if ((c.refs || []).length && c.refs.every((r) => r && singleMap.has(r.e))) S.cons.push({ ...deepClone(c), id: uid('k'), refs: c.refs.map(re) });
      for (const d of blk.dims || []) {
        if (d.e && singleMap.has(d.e)) S.dims.push({ ...deepClone(d), id: uid('m'), e: singleMap.get(d.e) });
        else if (!d.e && (d.refs || []).length && d.refs.every((r) => r && singleMap.has(r.e))) S.dims.push({ ...deepClone(d), id: uid('m'), refs: d.refs.map(re) });
      }
    }
    S.selBlockInst = null;
    setSel(added.map((e) => e.id));
    reapply(); render(); Panels.renderRight();
    UI.toast(T('sk.toast.blockExploded', { name: blk ? blk.name : 'Block' }), { icon: 'check', ms: 2400 });
    return added.length;
  }
  function editBlock(blockId) {
    if (!S || S.step || guardLocked()) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    if (S.blockEdit) { UI.toast(T('sk.toast.blockNoNest'), { icon: 'info' }); return false; }
    const blk = docBlocks().find((b) => b.id === blockId);
    if (!blk) return false;
    S.blockEdit = {
      blockId: blk.id,
      name: blk.name,
      saved: {
        ents: S.ents, dims: S.dims, cons: S.cons,
        blockInsts: S.blockInsts || [],
        sels: selectedIds(), selBlockInst: S.selBlockInst,
        undo: S.undo, tool: S.tool,
      },
    };
    S.ents = deepClone(blk.ents || []);
    S.dims = deepClone(blk.dims || []);
    S.cons = deepClone(blk.cons || []);
    S.blockInsts = [];
    S.selBlockInst = null;
    S.undo = [];
    S.tool = 'select';
    S.draft = null; S.picks = []; S.dimFirst = null; S.dimPicks = []; S.ordBase = null; S.selCon = null; S.autoDef = null; S.conflict = null;
    clearSel();
    showBar(); reapply(); render(); Panels.renderRight();
    UI.hint(hintFor(S.tool));
    return true;
  }
  function finishBlockEdit(save = true) {
    if (!S || !S.blockEdit) return false;
    const be = S.blockEdit;
    let newEnts = null, newDims = null, newCons = null;
    if (save) {
      reapply();
      newEnts = deepClone(S.ents).map((e) => { delete e.blk; delete e.blkId; delete e.blkSrc; return e; });
      newDims = deepClone(S.dims);
      newCons = deepClone(S.cons);
    }
    const sv = be.saved;
    S.ents = sv.ents; S.dims = sv.dims; S.cons = sv.cons;
    S.blockInsts = sv.blockInsts || [];
    S.undo = sv.undo || [];
    S.tool = sv.tool === 'block' ? 'select' : (sv.tool || 'select');
    S.draft = null; S.picks = []; S.dimFirst = null; S.dimPicks = []; S.ordBase = null; S.selCon = null; S.autoDef = null; S.conflict = null;
    S.blockEdit = null;
    const blk = docBlocks().find((b) => b.id === be.blockId);
    if (save && blk) {
      pushUndo();
      blk.name = be.name;
      blk.ents = newEnts;
      blk.dims = newDims;
      blk.cons = newCons;
      syncCurrentBlocks();
      if (sv.selBlockInst) selectBlockInst(sv.selBlockInst); else setSel(sv.sels || []);
      reapply();
      UI.toast(T('sk.toast.blockUpdated', { name: blk.name }), { icon: 'check', ms: 2600 });
    } else {
      syncCurrentBlocks();
      if (sv.selBlockInst) selectBlockInst(sv.selBlockInst); else setSel(sv.sels || []);
      reapply();
      UI.toast(T('sk.toast.blockEditCancelled'), { icon: 'info', ms: 1800 });
    }
    showBar(); render(); Panels.renderRight(); UI.hint(hintFor(S.tool));
    return true;
  }
  function renameBlock(blockId, name) {
    if (!S || !name || !String(name).trim()) return false;
    const nm = String(name).trim();
    const blk = docBlocks().find((b) => b.id === blockId);
    if (!blk) return false;
    if (!S.blockEdit) pushUndo();
    blk.name = nm;
    if (S.blockEdit && S.blockEdit.blockId === blockId) { S.blockEdit.name = nm; showBar(); UI.hint(hintFor(S.tool)); }
    render(); Panels.renderRight();
    return true;
  }
  function deleteBlockDef(blockId) {
    if (!S || S.step || guardLocked() || S.blockEdit) return false;
    const blocks = docBlocks();
    const blk = blocks.find((b) => b.id === blockId);
    if (!blk) return false;
    let usedOther = false;
    Model.walk(App.doc.items, (it) => {
      if (S.ctx.mode === 'edit' && it.id === S.ctx.editId) return;
      if (it.p && it.p.sketch && Array.isArray(it.p.sketch.blockInsts) && it.p.sketch.blockInsts.some((i) => i.blockId === blockId)) usedOther = true;
    });
    if (usedOther) { UI.toast(T('sk.toast.blockUsedElsewhere'), { icon: 'info' }); return false; }
    pushUndo();
    App.doc.blocks = blocks.filter((b) => b.id !== blockId);
    const rmInsts = new Set((S.blockInsts || []).filter((i) => i.blockId === blockId).map((i) => i.id));
    S.blockInsts = (S.blockInsts || []).filter((i) => i.blockId !== blockId);
    if (S.selBlockInst && rmInsts.has(S.selBlockInst)) clearSel();
    if (S.blockActive === blockId) S.blockActive = App.doc.blocks[0] ? App.doc.blocks[0].id : null;
    syncCurrentBlocks(); reapply(); render(); Panels.renderRight();
    UI.toast(T('sk.toast.blockDeleted', { name: blk.name }), { icon: 'info', ms: 2000 });
    return true;
  }
  function docBlocksForCommit() {
    const next = deepClone(docBlocks());
    if (S && S.blocks0 && App.doc) App.doc.blocks = deepClone(S.blocks0);
    return next;
  }
  function addEnt(e, opts = {}) {
    pushUndo();
    e.id = uid('e');
    if (S.construction) e.con = true;
    S.ents.push(e);
    if (!opts.noMirror) liveMirrorEnts([e]);
    App.emit('sketch');
    return e;
  }
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
    if (!opts.fast) {
      S.status = r;
      if (!r.ok) {
        const prevFocus = S.conflict && S.conflict.focusId;
        recordConflict(null, { ents: S.ents, dims: S.dims, cons: S.cons }, null);
        if (prevFocus && S.conflict && S.conflict.items.some((x) => x.id === prevFocus)) S.conflict.focusId = prevFocus;
      } else if (S.conflict && !S.conflict.pending) {
        S.conflict = null;
      }
      if (S.check) {
        S.check = inspectCurrent();
        if (S.checkFocus != null && S.checkFocus >= S.check.issues.length) S.checkFocus = null;
      }
    } else if (S.status) S.status.conflicts = r.conflicts;
    return r;
  }
  let entList = null;
  const ent = (id) => (entList || S.ents).find((x) => x.id === id);
  const isAngDim = (k) => k === 'ang' || k === 'angLL' || k === 'ang3' || /^hAng\d+$/.test(k);
  const dimSpecOf = (dm) => (dm.refs ? { k: dm.k, refs: dm.refs, ...(dm.k === 'distCC' ? { cm: dm.cm || 'center' } : {}), ...(dm.k === 'ord' ? { ...(dm.sg != null ? { sg: dm.sg } : {}), ...(dm.axis ? { axis: dm.axis } : {}) } : {}) } : { e: dm.e, k: dm.k });
  const sameRefs = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const samePairRefs = (a, b) => !!a && !!b && a.length === 2 && b.length === 2 && ((sameRefs(a[0], b[0]) && sameRefs(a[1], b[1])) || (sameRefs(a[0], b[1]) && sameRefs(a[1], b[0])));
  const specMatch = (d, sp) => d.k === sp.k && (sp.e ? d.e === sp.e : !!d.refs && (sp.k === 'distCC' ? samePairRefs(d.refs, sp.refs) : sameRefs(d.refs, sp.refs) && (sp.k !== 'ord' || (d.axis || null) === (sp.axis || null))));
  function dimFind(sp) { return S.dims.find((d) => specMatch(d, sp)) || null; }
  function dimOf(eid, k) { return dimFind({ e: eid, k }); }
  function putDimSpec(sp, v, ref = false) {
    const old = dimFind(sp);
    let targetDim;
    if (old) {
      old.v = v; if (ref) old.ref = true; else delete old.ref;
      if (sp.k === 'distCC') old.cm = sp.cm || 'center';
      if (sp.k === 'ord') { if (sp.sg != null) old.sg = sp.sg; if (sp.axis) old.axis = sp.axis; }
      targetDim = old;
    } else {
      const dm = sp.e ? { id: uid('m'), e: sp.e, k: sp.k, v } : { id: uid('m'), k: sp.k, refs: sp.refs, v, ...(sp.k === 'distCC' ? { cm: sp.cm || 'center' } : {}), ...(sp.k === 'ord' ? { ...(sp.sg != null ? { sg: sp.sg } : {}), ...(sp.axis ? { axis: sp.axis } : {}) } : {}) };
      if (ref) dm.ref = true;
      S.dims.push(dm);
      targetDim = dm;
    }
    if (sp.name !== undefined) {
      const cleanName = String(sp.name || '').trim();
      if (cleanName) targetDim.name = cleanName;
      else delete targetDim.name;
    } else if (isSkeletonMode() && !targetDim.name && typeof Comp !== 'undefined' && Comp.nextSkeletonDimName) {
      const rawStr = typeof v === 'string' ? v.trim() : '';
      const isNonSkelParam = !!rawStr && (App.doc.params || []).some((p) => p && !p.skeleton && p.name && p.name.toLowerCase() === rawStr.toLowerCase());
      if (!isNonSkelParam) {
        targetDim.name = Comp.nextSkeletonDimName(targetDim.k, S.dims, App.doc, S.ctx.skeletonId);
      }
    }
    App.emit('sketch');
  }
  function getDimTol(spOrId) {
    if (!S) return null;
    const dm = typeof spOrId === 'string' ? S.dims.find((d) => d && d.id === spOrId) : dimFind(spOrId);
    return dm && dm.tol ? { ...dm.tol } : null;
  }
  function setDimTol(spOrId, tol) {
    if (!S || guardLocked()) return false;
    const dm = typeof spOrId === 'string' ? S.dims.find((d) => d && d.id === spOrId) : dimFind(spOrId);
    if (!dm) return false;
    const clean = typeof Iso286 !== 'undefined' && Iso286.sanitizeTol ? Iso286.sanitizeTol(tol) : (tol || null);
    pushUndo();
    if (clean) dm.tol = clean;
    else delete dm.tol;
    App.emit('sketch');
    render();
    Panels.renderRight();
    return true;
  }
  function setDimName(spOrId, newName) {
    if (!S || guardLocked()) return false;
    const dm = typeof spOrId === 'string' ? S.dims.find((d) => d && d.id === spOrId) : dimFind(spOrId);
    if (!dm) return false;
    const clean = String(newName || '').trim().replace(/\s+/g, '_');
    if (!clean) {
      if (!dm.name) return true;
      pushUndo();
      delete dm.name;
      render(); Panels.renderRight();
      return true;
    }
    if (typeof Comp !== 'undefined' && Comp.isValidSkelParamName && !Comp.isValidSkelParamName(clean)) {
      UI.toast(T('left.par.badName'), { kind: 'bad' });
      return false;
    }
    const clash = S.dims.some((d) => d && d !== dm && d.name && d.name.toLowerCase() === clean.toLowerCase())
      || (App.doc && (App.doc.params || []).some((p) => p && p.name && p.name.toLowerCase() === clean.toLowerCase() && !(p.skeleton && p.skeleton.id === (S.ctx && S.ctx.skeletonId) && p.skeleton.dimId === dm.id)));
    if (clash) {
      UI.toast(T('left.par.paramExists'), { kind: 'bad' });
      return false;
    }
    if (dm.name === clean) return true;
    pushUndo();
    dm.name = clean;
    render(); Panels.renderRight();
    return true;
  }
  // Maß nur zum Ablesen (Referenzmaß): steht in Klammern, zeigt den Wert, legt aber nichts fest
  function setRefDim(sp, quiet = false) {
    if (guardLocked()) return false;
    if (sp.e && !ent(sp.e)) return false;
    pushUndo(); putDimSpec(sp, round(measureSpec(sp), 4), true); reapply(); render(); Panels.renderRight();
    if (!quiet) UI.toast(T('sk.toast.refDim'), { icon: 'info', ms: 4500 });
    return true;
  }
  function putDim(eid, k, v) { putDimSpec({ e: eid, k }, v); }
  // Maß setzen (Zahl oder Formel) – vorher prüfen, ob es zu den anderen Regeln passt
  function setDimSpec(sp, v) {
    if (guardLocked()) return false;
    if (sp.e && !ent(sp.e)) return false;
    const n = Model.num(v, vars(), NaN);
    const signed = sp.k === 'ang' || sp.k === 'x' || sp.k === 'y' || sp.k === 'ord' || /^hAng\d+$/.test(sp.k);
    const zeroOk = sp.k === 'dist' || sp.k === 'distPL' || sp.k === 'distCC' || sp.k === 'angLL' || sp.k === 'ang3';
    if (!isFinite(n) || (!signed && (zeroOk ? n < 0 : n <= 0)) || ((sp.k === 'angLL' || sp.k === 'ang3') && n > 180)) { UI.toast(T('sk.toast.badVal', { v }), { kind: 'bad' }); return false; }
    if (typeof v === 'string' && !Expr.names(v).length) v = round(n, 4);   // reine Rechnung wie 10*3 → 30
    let testEnts = S.ents, hmEn = null, hmIdx = -1, hmKind = null;
    const hm = sp.e ? /^h(Ang|Len)(\d+)$/.exec(sp.k) : null;
    if (hm) {
      hmEn = ent(sp.e); hmIdx = +hm[2]; hmKind = hm[1];
      if (!hmEn || hmEn.type !== 'spline' || hmEn.mode === 'cv' || hmIdx < 0 || hmIdx >= (hmEn.pts || []).length) return false;
      testEnts = deepClone(S.ents);
      const ten = testEnts.find((x) => x.id === hmEn.id);
      ensureSplineHandle(ten, hmIdx, hmKind === 'Ang' ? n : null, hmKind === 'Len' ? n : null);
    }
    if (sp.k !== 'n') {
      const others = S.dims.filter((d) => !specMatch(d, sp));
      const candDim = sp.e ? { id: '_neu', e: sp.e, k: sp.k, v } : { id: '_neu', k: sp.k, refs: sp.refs, v, ...(sp.k === 'distCC' ? { cm: sp.cm || 'center' } : {}), ...(sp.k === 'ord' ? { ...(sp.sg != null ? { sg: sp.sg } : {}), ...(sp.axis ? { axis: sp.axis } : {}) } : {}) };
      const tr = Solver.trial({ ents: testEnts, cons: S.cons, dims: [...others, candDim], dimsBefore: others }, vars());
      if (!tr.ok) {
        recordConflict({ kind: 'dim', sp, v, raw: candDim }, { ents: testEnts, cons: S.cons, dims: [...others, candDim] }, '_neu');
        render(); Panels.renderRight();
        UI.toast(T('sk.toast.dimConflict', { title: ERRORS.sketchOverConstrained.titel, sol: ERRORS.sketchOverConstrained.loesung }), { kind: 'bad', ms: 7000, action: { label: T('sk.toast.onlyReadBtn'), run: () => { clearConflict(); setRefDim(sp); } } }); return false;
      }
      if (tr.redundant) {
        // schon bestimmt: als Maß zum Ablesen zeigen statt nichts zu tun
        const had = dimFind(sp); if (had && had.ref) { UI.toast(T('sk.toast.dimAlreadyRef'), { icon: 'info', ms: 4500 }); return false; }
        setRefDim(sp, true);
        UI.toast(T('sk.toast.dimBecameRef'), { icon: 'info', ms: 5000 });
        return true;
      }
    }
    pushUndo();
    if (hmEn) {
      ensureSplineHandle(hmEn, hmIdx, hmKind === 'Ang' ? n : null, hmKind === 'Len' ? n : null);
      S.selHandle = { e: hmEn.id, i: hmIdx };
    }
    putDimSpec(sp, v); reapply(); render(); Panels.renderRight();
    return true;
  }
  function setDim(eid, k, v) { return setDimSpec({ e: eid, k }, v); }
  // Text in Kurven umwandeln: aus den Buchstaben werden Linien und Splines, die man trimmen, versetzen und einzeln ändern kann
  function curvesOfContours(contours) {
    const ents = [], P = (q) => [round(q[0], 4), round(q[1], 4)];
    const bez = (s, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k]); };
    for (const c of contours) {
      if (c.every((s) => s.t === 'bez')) { const pts = []; for (const s of c) for (let j = 0; j < 6; j++) pts.push(P(bez(s, j / 6))); ents.push({ id: uid('e'), type: 'spline', pts, closed: true }); continue; }
      let k = 0; const N = c.length;
      let start = c.findIndex((s) => s.t !== 'bez'); if (start < 0) start = 0;
      const ord = c.map((_, i) => c[(i + start) % N]);
      while (k < N) {
        const s = ord[k];
        if (s.t !== 'bez') { ents.push({ id: uid('e'), type: 'line', a: P(s.a), b: P(s.b) }); k++; continue; }
        const pts = [P(s.a)];
        while (k < N && ord[k].t === 'bez') { for (let j = 1; j <= 6; j++) pts.push(P(bez(ord[k], j / 6))); k++; }
        ents.push({ id: uid('e'), type: 'spline', pts, closed: false });
      }
    }
    return ents;
  }
  // Eigene TrueType-Schrift (.ttf) laden, im Projekt als Base64 speichern und in der Schriftliste anbieten
  async function loadFontFile(file, targetEntId = null) {
    if (!file) return null;
    const sz = Store.checkFileSize(file, 'font');
    if (!sz.ok) {
      UI.toast(sz.message, { kind: 'bad', ms: 6000 });
      return null;
    }
    let bytes, parsed;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      parsed = TTF.parse(bytes, { fallbackName: String(file.name || '').replace(/\.(ttf|otf|woff2?|ttc)$/i, '') });
    } catch (e) {
      UI.toast((e && e.message) || T('sk.toast.fontUnreadable'), { kind: 'bad', ms: 6500 });
      return null;
    }
    const b64 = Store.bytesToBase64(bytes);
    const existing = (App.doc.fonts || []).find((f) => f && f.data === b64);
    let id;
    if (existing) {
      id = existing.id;
      SK.syncFonts(App.doc.fonts);
      UI.toast(T('sk.toast.fontExists', { name: existing.name }), { icon: 'info', ms: 3500 });
    } else {
      const base = parsed.name || 'Eigene Schrift';
      const used = new Set([...Object.values(SK.FONTNAMES), ...(App.doc.fonts || []).map((f) => f && f.name)]);
      let name = base, n = 2;
      while (used.has(name)) name = `${base} (${n++})`;
      id = uid('ft');
      App.change(`Schrift geladen: ${name}`, (doc) => {
        if (!Array.isArray(doc.fonts)) doc.fonts = [];
        doc.fonts.push({ id, name, file: file.name || name + '.ttf', data: b64 });
      });
      UI.toast(T('sk.toast.fontLoaded', { name, kern: parsed.hasKern ? T('sk.toast.fontKern') : '' }), { icon: 'check', ms: 4500 });
    }
    if (S) {
      S.txt.font = id;
      if (targetEntId) {
        const tgt = S.ents.find((x) => x.id === targetEntId && x.type === 'text');
        if (tgt && tgt.font !== id) { pushUndo(); tgt.font = id; reapply(); }
      }
      render();
      Panels.renderRight();
    }
    return id;
  }
  function pickFont(targetEntId = null) {
    const inp = h('input', { type: 'file', accept: '.ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-opentype', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) loadFontFile(f, targetEntId); };
    document.body.append(inp);
    inp.click();
    setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
  }
  function textToCurves(id) {
    if (guardLocked()) return 0;
    const e = S && S.ents.find((x) => x.id === id && x.type === 'text'); if (!e) return 0;
    const ents = curvesOfContours(SK.textContours(e));
    if (!ents.length) { UI.toast(T('sk.toast.textNoLetters'), { kind: 'bad' }); return 0; }
    pushUndo();
    S.ents.splice(S.ents.indexOf(e), 1, ...ents);
    S.dims = S.dims.filter((d) => d.e !== id); S.cons = S.cons.filter((c) => !(c.refs || []).includes(id) && c.e !== id);
    clearSel(); reapply(); render(); Panels.renderRight();
    UI.toast(T('sk.toast.textConverted', { n: ents.length }), { icon: 'check', ms: 3200 });
    return ents.length;
  }
  // Fertige Elemente (z. B. aus einer DXF oder SVG) in die offene Skizze legen – ein Rückgängig-Schritt
  // ---------- Kopieren und Einfügen (SK-12): Elemente mit ihren Regeln und Maßen untereinander ----------
  let clip = null;
  const CLIPCONS = new Set(['horizontal', 'vertical', 'parallel', 'perpendicular', 'collinear', 'tangent', 'curvature', 'equal', 'symmetric', 'coincident', 'midpoint', 'concentric']);
  function copySel() {
    const ids = (S.patSel && S.patSel.length ? S.patSel : selectedIds()).filter((id) => { const e = ent(id); return e && !e.blk; });
    if (!ids.length) { UI.toast(T('sk.toast.copyEmpty'), { icon: 'info' }); return 0; }
    const set = new Set(ids), inSet = (r) => !r || r.e === 'origin' || set.has(r.e);
    const ents = ids.map((id) => { const e = deepClone(ent(id)); delete e.link; delete e.revAxis; return e; });
    const cons = S.cons.filter((c) => CLIPCONS.has(c.type) && (c.refs || []).length && c.refs.every(inSet) && c.refs.some((r) => r && set.has(r.e))).map(deepClone);
    const dims = S.dims.filter((d) => (d.e ? set.has(d.e) && d.k !== 'x' && d.k !== 'y' : (d.refs || []).length && d.refs.every((r) => r && set.has(r.e)))).map(deepClone);
    clip = { ents, cons, dims };
    try { localStorage.setItem('tracery.sketchClip', JSON.stringify(clip)); } catch (_) {}
    UI.toast(T('sk.toast.copied', { n: ents.length, unit: T(ents.length === 1 ? 'sk.toast.elOne' : 'sk.toast.elMany') }), { icon: 'copy' });
    return ents.length;
  }
  function pasteClip() {
    if (guardLocked()) return 0;
    let c = clip;
    if (!c) { try { c = JSON.parse(localStorage.getItem('tracery.sketchClip') || 'null'); } catch (_) { c = null; } }
    if (!c || !c.ents || !c.ents.length) { UI.toast(T('sk.toast.pasteEmpty'), { icon: 'info' }); return 0; }
    pushUndo();
    const map = new Map(); for (const e of c.ents) map.set(e.id, uid('e'));
    const re = (r) => (r && r.e && map.has(r.e) ? { ...r, e: map.get(r.e) } : r);
    let ents = c.ents.map((e) => ({ ...deepClone(e), id: map.get(e.id) }));
    // liegt die Kopie genau auf vorhandenen Punkten, rückt sie daneben (sonst kleben die Enden zusammen)
    const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
    const have = new Set(); for (const e of S.ents) for (const pl of entPts(e)) for (const p of pl) have.add(key(p));
    let x0 = Infinity, x1 = -Infinity, hit = false;
    for (const e of ents) for (const pl of entPts(e)) for (const p of pl) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); if (have.has(key(p))) hit = true; }
    if (hit) { const dx = round((x1 - x0) + Math.max(2, (x1 - x0) * 0.15), 3); ents = ents.map((e) => { const r = SKO.moveEnt(e, dx, 0).ents[0]; return { ...r, id: e.id, ...(e.con ? { con: true } : {}) }; }); }
    S.ents.push(...ents);
    for (const k of c.cons || []) S.cons.push({ ...deepClone(k), id: uid('k'), refs: k.refs.map(re) });
    for (const d of c.dims || []) S.dims.push(d.e ? { ...deepClone(d), id: uid('m'), e: map.get(d.e) } : { ...deepClone(d), id: uid('m'), refs: d.refs.map(re) });
    // gleich zum Verschieben bereit
    setTool('xmove'); S.patSel = ents.map((e) => e.id); S.xm.mode = 'move'; S.xm.copy = false;
    reapply(); render(); Panels.renderRight();
    UI.toast(T('sk.toast.pasted', { n: ents.length, unit: T(ents.length === 1 ? 'sk.toast.elOne' : 'sk.toast.elMany'), beside: hit ? T('sk.toast.pastedBeside') : '' }), { icon: 'check', ms: 5000 });
    return ents.length;
  }
  function insertEnts(list) {
    if (!S || S.step || !list || !list.length || guardLocked()) return 0;
    pushUndo();
    for (const e of list) S.ents.push({ ...JSON.parse(JSON.stringify(e)), id: uid('e') });
    clearSel(); setTool('select'); reapply(); render(); Panels.renderRight();
    return list.length;
  }
  function insertShape(type, params, center = [0, 0]) {
    if (!S || S.step || guardLocked()) return [];
    const spec = SKO.SHAPES[type];
    if (!spec) return [];
    const ents = SKO.shapeEnts(type, params || spec.p, center);
    if (!ents.length) return [];
    pushUndo();
    for (const en of ents) { if (S.construction) en.con = true; S.ents.push(en); }
    clearSel(); reapply(); render(); Panels.renderRight();
    UI.toast(`${spec.name}: ${ents.length} Elemente eingefügt.`, { icon: 'check', ms: 2200 });
    return ents;
  }
  function insertFormulaCurve(spec) {
    if (!S || S.step || guardLocked()) return [];
    const cfg = spec ? { ...S.formula, ...spec } : S.formula;
    const res = SKO.evalFormulaCurve(cfg, Model.vars(App.doc).v);
    if (!res.ok) { UI.toast(res.error, { kind: 'bad' }); return []; }
    const kind = cfg.kind || 'spline';
    const ents = SKO.pointsToCurveEnts(res.pts, { kind, closed: !!cfg.closed, con: !!S.construction });
    if (!ents.length) return [];
    pushUndo(); S.ents.push(...ents); clearSel(); reapply(); render(); Panels.renderRight();
    UI.toast(T(kind === 'polyline' ? 'sk.toast.formulaInsertedPoly' : 'sk.toast.formulaInsertedSpline', { n: res.pts.length }), { icon: 'check', ms: 2600 });
    return ents;
  }
  function insertPointsCSV(text, opts = {}) {
    if (!S || S.step || guardLocked()) return [];
    const kind = opts.kind || (S.csv && S.csv.kind) || 'spline';
    const res = SKO.parsePointsCSV(text, { minPoints: kind === 'points' ? 1 : 2 });
    if (!res.ok) { UI.toast(res.error, { kind: 'bad' }); return []; }
    const closed = opts.closed != null ? !!opts.closed : !!(S.csv && S.csv.closed);
    const ents = SKO.pointsToCurveEnts(res.pts, { kind, closed, con: !!S.construction });
    if (!ents.length) return [];
    pushUndo(); S.ents.push(...ents); clearSel(); reapply(); render(); Panels.renderRight();
    const msgKey = kind === 'points' ? 'sk.toast.csvInsertedPoints' : (kind === 'polyline' ? 'sk.toast.csvInsertedPoly' : 'sk.toast.csvInsertedSpline');
    UI.toast(T(msgKey, { n: res.pts.length }), { icon: 'check', ms: 2600 });
    return ents;
  }
  function openFormulaPanel() {
    if (!S || S.step) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    clearSel(); S.selCon = null; S.formulaOpen = true; Panels.renderRight(); render();
    return true;
  }
  function openCsvPanel() {
    if (!S || S.step) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    clearSel(); S.selCon = null; S.csvOpen = true; Panels.renderRight(); render();
    return true;
  }
  // Ganze Skizze um den Nullpunkt vergrößern oder verkleinern: Elemente, Längen-Maße und Abstände in Regeln wandern mit
  function scaleAll(f) {
    if (!S || !(f > 0) || Math.abs(f - 1) < 1e-9 || guardLocked()) return false;
    pushUndo();
    const P = (q) => { q[0] = round(q[0] * f, 4); q[1] = round(q[1] * f, 4); }, fs = String(round(f, 6)).replace('.', ',');
    for (const e of S.ents) {
      if (e.blk) continue;
      for (const k of ['a', 'b', 'm', 'c']) if (Array.isArray(e[k])) P(e[k]);
      for (const k of ['pts', 'onP']) if (Array.isArray(e[k])) e[k].forEach(P);
      if (Array.isArray(e.handles)) e.handles.forEach((h) => { if (Array.isArray(h)) P(h); });
      for (const k of ['r', 'rx', 'ry', 'bend', 'os', 'sp'].concat(e.type === 'text' ? ['h'] : [])) if (typeof e[k] === 'number') e[k] = round(e[k] * f, 4);
    }
    for (const inst of S.blockInsts || []) { inst.x = round((inst.x || 0) * f, 4); inst.y = round((inst.y || 0) * f, 4); }
    for (const d of S.dims) { if (isAngDim(d.k) || d.k === 'n') continue; d.v = typeof d.v === 'number' ? round(d.v * f, 4) : `(${d.v})*${fs}`; }
    for (const c of S.cons) {
      for (const k of c.type === 'offset' ? ['v'] : c.type === 'xform' && c.mode !== 'rot' ? ['dx', 'dy'] : []) c[k] = typeof c[k] === 'number' ? round(c[k] * f, 4) : c[k] != null ? `(${c[k]})*${fs}` : c[k];
      if (Array.isArray(c.at)) P(c.at);
      if (c.center && Array.isArray(c.center.at)) P(c.center.at);
      if (c.pm) for (const k of ['dx', 'dy', 'dist', 'curveDist']) if (typeof c.pm[k] === 'number') c.pm[k] = round(c.pm[k] * f, 4);
    }
    syncCurrentBlocks(); reapply(); render(); Panels.renderRight();
    return true;
  }
  function removeDimSpec(sp) { if (guardLocked()) return; pushUndo(); S.dims = S.dims.filter((d) => !specMatch(d, sp)); reapply(); render(); Panels.renderRight(); }
  function removeDim(eid, k) { removeDimSpec({ e: eid, k }); }
  const usesEnt = (r, id) => r && r.e === id;
  // alle Verweise einer Regel (Muster und Versatz haben mehr als „refs“)
  const conRefs = (c) => [...(c.refs || []), ...(c.req || []), ...(c.center ? [c.center] : [])];
  // Element samt zugehörigen Maßen und Regeln aus den Daten nehmen (ohne Rückgängig-Schritt, ohne Neuzeichnen)
  function removeEntData(id) {
    S.ents = S.ents.filter((x) => x.id !== id);
    S.dims = S.dims.filter((d) => d.e !== id && !(d.refs || []).some((r) => usesEnt(r, id)));
    S.cons = S.cons.filter((c) => !conRefs(c).some((r) => usesEnt(r, id)));
    if (S.sels && S.sels.length) S.sels = S.sels.filter((x) => x !== id);
    if (S.ordBase && S.ordBase.ref && S.ordBase.ref.e === id) S.ordBase = null;
    S.patSel = (S.patSel || []).filter((x) => x !== id);
    if (S.patCurve === id) S.patCurve = null;
    if (S.liveMir && S.liveMir.axis === id) {
      S.liveMir = null; S.liveMirPick = false; syncLiveMirBtn();
      UI.toast(T('sk.toast.liveMirLost'), { icon: 'info', ms: 2600 });
    }
    if (S.bridge && S.bridge.first && S.bridge.first.e === id) { S.bridge.first = null; }
    for (const b of S.ents) {
      if (b.type !== 'bridge') continue;
      if (b.refA && b.refA.e === id) b.refA = null;
      if (b.refB && b.refB.e === id) b.refB = null;
    }
  }
  function deleteEnts(ids) {
    if (guardLocked()) return 0;
    const list = [...new Set((ids || []).filter((id) => ent(id)))];
    if (!list.length && !(S && S.selBlockInst)) return 0;
    pushUndo();
    const blkInsts = new Set();
    for (const id of list) { const e = ent(id); if (e && e.blk) blkInsts.add(e.blk); }
    if (S.selBlockInst && !list.length) blkInsts.add(S.selBlockInst);
    if (blkInsts.size) {
      S.blockInsts = (S.blockInsts || []).filter((i) => !blkInsts.has(i.id));
      for (const id of S.ents.filter((e) => e.blk && blkInsts.has(e.blk)).map((e) => e.id)) removeEntData(id);
    }
    for (const id of list) { const e = ent(id); if (e && !e.blk) removeEntData(id); }
    clearSel();
    reapply(); render(); Panels.renderRight();
    return list.length || blkInsts.size;
  }
  function deleteEnt(id) { deleteEnts([id]); }
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
    if (dropped) UI.toast(dropped === 1 ? T('sk.toast.droppedOne') : T('sk.toast.droppedMany', { n: dropped }), { icon: 'info', ms: 5000 });
    return dropped;
  }
  function removeCons(id) { if (guardLocked()) return; pushUndo(); S.cons = S.cons.filter((c) => c.id !== id); if (S.selCon === id) S.selCon = null; reapply(); render(); Panels.renderRight(); }
  // Welches Maß meint ein Klick auf dieses Element?
  function dimKeyAt(en, uv) {
    if (en.type === 'line') return 'len';
    if (en.type === 'circle' || en.type === 'poly') return 'd';
    if (en.type === 'text') return 'h';
    if (en.type === 'ellipse') { const cs = Math.cos(-(en.rot || 0)), sn = Math.sin(-(en.rot || 0)), x = uv[0] - en.c[0], y = uv[1] - en.c[1]; return Math.abs((cs * x - sn * y) / en.rx) >= Math.abs((sn * x + cs * y) / en.ry) ? 'w' : 'h'; }
    if (en.type === 'ellarc') { const cs = Math.cos(-(en.rot || 0)), sn = Math.sin(-(en.rot || 0)), x = uv[0] - en.c[0], y = uv[1] - en.c[1]; return Math.abs((cs * x - sn * y) / en.rx) >= Math.abs((sn * x + cs * y) / en.ry) ? 'rx' : 'ry'; }
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
    else if (e.type === 'ellarc') { P('c', e.c); P('a', SK.endA(e)); P('b', SK.endB(e)); }
    else if (e.type === 'conic') { P('a', e.a); P('b', e.b); P('m', e.m); }
    else if (e.type === 'bridge') { P('a', SK.endA(e)); P('b', SK.endB(e)); }
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
    if (sp.k === 'distCC') {
      const A = refCircle(r0), B = refCircle(r1);
      if (!A || !B) return NaN;
      const d = SK.d2(A.c, B.c);
      return sp.cm === 'min' ? d - A.r - B.r : sp.cm === 'max' ? d + A.r + B.r : d;
    }
    if (sp.k === 'distPL') { const p = refXY(r0), L = refLine(r1); if (!p || !L) return NaN; const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1]; return Math.abs((p[0] - L[0][0]) * dy - (p[1] - L[0][1]) * dx) / (Math.hypot(dx, dy) || 1); }
    if (sp.k === 'angLL') { const A = refLine(r0), B = refLine(r1); if (!A || !B) return NaN; const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], vx = B[1][0] - B[0][0], vy = B[1][1] - B[0][1]; return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI; }
    if (sp.k === 'ang3') {
      const a = refXY(sp.refs[0]), v0 = refXY(sp.refs[1]), b = refXY(sp.refs[2]);
      if (!a || !v0 || !b) return NaN;
      const ux = a[0] - v0[0], uy = a[1] - v0[1], wx = b[0] - v0[0], wy = b[1] - v0[1];
      if (Math.hypot(ux, uy) < 1e-12 || Math.hypot(wx, wy) < 1e-12) return NaN;
      return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
    }
    if (sp.k === 'ord') {
      const p = refXY(r0); if (!p) return NaN;
      const sg = sp.sg === -1 ? -1 : 1;
      const Ln = refLine(r1);
      if (Ln) {
        const dx = Ln[1][0] - Ln[0][0], dy = Ln[1][1] - Ln[0][1];
        return sg * (-(p[0] - Ln[0][0]) * dy + (p[1] - Ln[0][1]) * dx) / (Math.hypot(dx, dy) || 1);
      }
      const o = refXY(r1); if (!o) return NaN;
      const ax = sp.axis === 'y' ? 1 : 0;
      return sg * (p[ax] - o[ax]);
    }
    return NaN;
  }
  // ---------- Regeln hinzufügen ----------
  function addCons(c) {
    if (guardLocked()) return false;
    const cons2 = [...S.cons, c];
    const tr = Solver.trial({ ents: S.ents, dims: S.dims, cons: cons2, consBefore: S.cons }, vars());
    if (!tr.ok) {
      recordConflict({ kind: 'con', con: c, raw: c }, { ents: S.ents, dims: S.dims, cons: cons2 }, c.id);
      render(); Panels.renderRight();
      UI.toast(ERRORS.sketchOverConstrained.titel + ': Diese Regel widerspricht den anderen. ' + ERRORS.sketchOverConstrained.loesung, { kind: 'bad', ms: 6000 }); return false;
    }
    if (tr.redundant) { UI.toast('Das liegt schon fest – diese Regel würde nichts ändern.', { icon: 'info' }); render(); return false; }
    pushUndo(); S.cons = cons2; reapply(); render(); Panels.renderRight();
    return true;
  }
  // Regel-Knopf: ist schon eine passende Linie gewählt, gilt die Regel sofort
  function quickOrTool(id) {
    if (guardLocked()) return;
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
      if (!p2 || p2.kind !== 'refent') { UI.toast(chint('project'), { icon: 'info' }); return; }
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
    const asPoint = (x) => (isPt(x) ? x.ref : x.ent && (x.ent.type === 'circle' || x.ent.type === 'arc' || x.ent.type === 'poly' || x.ent.type === 'ellipse' || x.ent.type === 'ellarc') ? { e: x.ent.id, p: 'c' } : null);
    const fail = () => { UI.toast(chint(t), { icon: 'info' }); S.picks = []; render(); };
    const wait = () => { render(); };
    let c = null;
    if (t === 'horizontal' || t === 'vertical') {
      if (n === 1 && last.kind === 'line' && last.ent.type !== 'rect') c = { refs: [last.ref] };
      else if (n === 1 && isPt(last)) return wait();
      else if (n === 2 && isPt(P[0]) && isPt(P[1])) c = { refs: [P[0].ref, P[1].ref] };
      else return fail();
    } else if (t === 'parallel' || t === 'perpendicular' || t === 'collinear') {
      if (last.kind !== 'line') return fail(); if (n < 2) return wait();
      if (t === 'collinear' && JSON.stringify(P[0].ref) === JSON.stringify(P[1].ref)) return fail();
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
    } else if (t === 'curvature') {
      const pe = last.ent || (last.ref && last.ref.e && last.ref.e !== 'origin' ? ent(last.ref.e) : null);
      const isG2Spline = (x) => x && x.type === 'spline' && !x.closed && (x.pts || []).length >= 3;
      const isG2Curve = (x, ref) => x && ((x.type === 'spline' && !x.closed && (x.pts || []).length >= 2) || (x.type === 'arc' && !!SK.arcInfo(x.a, x.m, x.b)) || x.type === 'line' || x.type === 'ellarc' || x.type === 'circle' || (x.type === 'rect' && ref && ref.edge != null));
      if (pe && pe.type === 'spline' && pe.closed) { UI.toast(T('sk.toast.curvNeedOpen'), { icon: 'info' }); S.picks = []; render(); return; }
      if (pe && pe.type === 'spline' && (pe.pts || []).length < 3) { UI.toast(T('sk.toast.curvNeedSpline3'), { icon: 'info' }); S.picks = []; render(); return; }
      if (!isG2Curve(pe, last.ref)) return fail();
      if (n < 2) return wait();
      const e0 = P[0].ent || (P[0].ref && ent(P[0].ref.e)), e1 = P[1].ent || (P[1].ref && ent(P[1].ref.e));
      if (!e0 || !e1 || e0.id === e1.id) return fail();
      if (!isG2Spline(e0) && !isG2Spline(e1)) return fail();
      const [sp, spRef, nb, nbRef] = isG2Spline(e0) ? [e0, P[0].ref, e1, P[1].ref] : [e1, P[1].ref, e0, P[0].ref];
      const endPt = (en, ref, ep) => {
        if (en.type === 'rect' && ref && ref.edge != null) {
          const cs = SK.rectCorners(en), i = ((ref.edge % 4) + 4) % 4;
          return ep === 'a' ? cs[i] : cs[(i + 1) % 4];
        }
        return ep === 'a' ? SK.endA(en) : SK.endB(en);
      };
      if (nb.type === 'circle') {
        const da = Math.abs(SK.d2(endPt(sp, spRef, 'a'), nb.c) - nb.r);
        const db = Math.abs(SK.d2(endPt(sp, spRef, 'b'), nb.c) - nb.r);
        c = { refs: [{ e: sp.id, p: da <= db ? 'a' : 'b' }, { e: nb.id }] };
      } else {
        let best = ['a', 'a'], bd = Infinity;
        for (const ep1 of ['a', 'b']) for (const ep2 of ['a', 'b']) {
          const d = SK.d2(endPt(sp, spRef, ep1), endPt(nb, nbRef, ep2));
          if (d < bd) { bd = d; best = [ep1, ep2]; }
        }
        const r2 = { e: nb.id, p: best[1] };
        if (nbRef && nbRef.edge != null) r2.edge = nbRef.edge;
        c = { refs: [{ e: sp.id, p: best[0] }, r2] };
      }
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
      const cen = (x) => x.ent && ['circle', 'arc', 'poly', 'ellipse', 'ellarc'].includes(x.ent.type);
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
  const DIMLABEL = (k) => {
    const ha = /^hAng(\d+)$/.exec(k); if (ha) return T('sk.dim.hAng', { n: +ha[1] + 1 });
    const hl = /^hLen(\d+)$/.exec(k); if (hl) return T('sk.dim.hLen', { n: +hl[1] + 1 });
    return SK.DIMNAME[k] || { dist: T('sk.dim.dist'), distPL: T('sk.dim.distPL'), distCC: T('sk.dim.distCC'), angLL: T('sk.dim.angLL'), ang3: T('sk.dim.ang3'), r: T('sk.dim.r'), arcLen: T('sk.dim.arcLen'), ord: T('sk.dim.ord') }[k] || T('sk.dim.fallback');
  };
  const dimLabelOf = (dm) => (dm && dm.k === 'distCC' ? T(dm.cm === 'min' ? 'sk.dim.distCCMin' : dm.cm === 'max' ? 'sk.dim.distCCMax' : 'sk.dim.distCCCenter') : DIMLABEL(dm ? dm.k : ''));
  function askDim(sp, clientX, clientY) {
    if (guardLocked()) return;
    hideDimBox(); hideEntry();
    const cur = dimFind(sp);
    const sameMode = sp.k !== 'distCC' || !cur || (cur.cm || 'center') === (sp.cm || 'center');
    const isAng = isAngDim(sp.k);
    const isLen = !isAng && sp.k !== 'n';
    const rawNum = cur && !cur.ref && sameMode ? cur.v : round(measureSpec(sp), 6);
    const val = typeof rawNum === 'number' ? (isLen ? Units.fmtInput(rawNum) : sp.k === 'n' ? String(Math.round(rawNum)) : fmtFixed(rawNum, Math.max(4, FMT.angle))) : rawNum;
    const orig = String(val);
    dimBox = h('div', { class: 'numentry dimask' });
    const inp = h('input', { type: 'text', value: val, 'aria-label': dimLabelOf(sp), spellcheck: 'false', autocomplete: 'off', style: { width: '120px' } });
    const lbl = dimLabelOf(sp) + (isLen && Units.key() !== 'mm' ? ' (' + Units.label() + ')' : '');
    let nameInp = null;
    if (isSkeletonMode() && sp.k !== 'n') {
      const defName = (cur && cur.name) || (typeof Comp !== 'undefined' && Comp.nextSkeletonDimName ? Comp.nextSkeletonDimName(sp.k, S.dims, App.doc, S.ctx.skeletonId) : '');
      nameInp = h('input', { type: 'text', id: 'sk-dim-name', class: 'dimask-name', value: defName, placeholder: T('skel.dimNamePh'), 'aria-label': T('skel.dimNameLabel'), spellcheck: 'false', autocomplete: 'off' });
      dimBox.append(h('label', { class: 'dimask-namelbl' }, T('skel.dimNameLabel'), nameInp));
    }
    dimBox.append(h('label', null, lbl, inp));
    if (sp.k === 'distCC') {
      const curCm = sp.cm || 'center';
      const sw = h('div', { class: 'dim-cc-sw', id: 'dim-cc-mode', 'data-help': 'circleEdgeDim' });
      for (const [m, id, txt, tip] of [
        ['center', 'dim-cc-center', T('sk.dimBox.ccCenter'), T('sk.dimBox.ccCenterTip')],
        ['min', 'dim-cc-min', T('sk.dimBox.ccMin'), T('sk.dimBox.ccMinTip')],
        ['max', 'dim-cc-max', T('sk.dimBox.ccMax'), T('sk.dimBox.ccMaxTip')],
      ]) {
        const b = h('button', { type: 'button', class: 'dim-cc-btn' + (curCm === m ? ' active' : ''), id, 'aria-pressed': curCm === m ? 'true' : 'false', 'data-tip': tip }, txt);
        b.onclick = () => { S.dimCircMode = m; Panels.renderRight(); askDim({ k: 'distCC', refs: sp.refs, cm: m }, clientX, clientY); };
        sw.append(b);
      }
      dimBox.append(sw);
    }
    if (sp.e && (sp.k === 'r' || sp.k === 'arcLen')) {
      const en = ent(sp.e);
      if (en && en.type === 'arc') {
        const nk = sp.k === 'r' ? 'arcLen' : 'r';
        const ab = h('button', { type: 'button', class: 'dimlock', id: 'dim-arc-toggle', 'data-tip': T(sp.k === 'r' ? 'sk.dimBox.toArcLen' : 'sk.dimBox.toRadius'), 'aria-label': T(sp.k === 'r' ? 'sk.dimBox.toArcLen' : 'sk.dimBox.toRadius') }, sp.k === 'r' ? '⌒' : 'R');
        ab.onclick = () => askDim({ e: sp.e, k: nk }, clientX, clientY);
        dimBox.append(ab);
      }
    }
    if (sp.e && /^h(Ang|Len)(\d+)$/.test(sp.k)) {
      const hm = /^h(Ang|Len)(\d+)$/.exec(sp.k);
      const en = ent(sp.e);
      if (en && en.type === 'spline' && en.mode !== 'cv') {
        const nk = (hm[1] === 'Ang' ? 'hLen' : 'hAng') + hm[2];
        const tipKey = hm[1] === 'Ang' ? 'sk.dimBox.toHandleLen' : 'sk.dimBox.toHandleAng';
        const hb = h('button', { type: 'button', class: 'dimlock', id: 'dim-handle-toggle', 'data-tip': T(tipKey), 'aria-label': T(tipKey) }, hm[1] === 'Ang' ? '↔' : '°');
        hb.onclick = () => askDim({ e: sp.e, k: nk }, clientX, clientY);
        dimBox.append(hb);
      }
    }
    if (sp.k !== 'n' && !(cur && cur.ref)) {
      if (isLen && typeof Iso286 !== 'undefined' && Iso286.openDialog) {
        const tb = h('button', {
          type: 'button',
          class: 'dimlock pro' + (cur && cur.tol ? ' active' : ''),
          id: 'dim-iso286',
          'data-help': 'iso286Table',
          'data-tip': T('iso286.dimBtnTip'),
          'aria-label': T('iso286.dimBtnAria'),
        }, '±');
        tb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
        tb.onclick = () => {
          const raw = inp.value.trim();
          const parsed = Units.parseLen(raw, vars(), { expr: true });
          const meas = round(measureSpec(sp), 6);
          const nomMm = parsed.ok && isFinite(parsed.num) && parsed.num > 0 ? parsed.num : (isFinite(meas) && meas > 0 ? meas : 20);
          hideDimBox();
          Iso286.openDialog({
            nominalMm: nomMm,
            code: (cur && cur.tol && cur.tol.fit) || (sp.k === 'd' ? 'H7' : 'h6'),
            fitShow: (cur && cur.tol && cur.tol.fitShow) || 'both',
            targetLabel: T('iso286.targetSketchDim', { label: dimLabelOf(sp) }),
            onApply: (tol) => {
              if (!cur || (parsed.ok && String(parsed.value) !== String(cur.v))) {
                setDimSpec(sp, parsed.ok ? parsed.value : meas);
              }
              setDimTol(sp, tol);
            },
          });
        };
        dimBox.append(tb);
      }
      // Knopf „( )“: nur ablesen statt festlegen
      const rb = h('button', { type: 'button', class: 'dimlock', id: 'dim-ref', 'data-tip': T('sk.dimBox.refTip'), 'aria-label': T('sk.dimBox.refAria') }, '( )');
      rb.onclick = () => { hideDimBox(); if (cur) { pushUndo(); cur.ref = true; cur.v = round(measureSpec(sp), 6); if (sp.k === 'distCC') cur.cm = sp.cm || 'center'; reapply(); render(); Panels.renderRight(); } else setRefDim(sp); };
      dimBox.append(rb);
    }
    if (cur) {
      const del = h('button', { type: 'button', class: 'dimlock', 'data-tip': T('sk.dimBox.delTip'), 'aria-label': T('sk.dimBox.delTip') }); del.innerHTML = icon('trash');
      del.onclick = () => { hideDimBox(); removeDimSpec(sp); };
      dimBox.append(del);
    }
    const r = Viewer.canvas.getBoundingClientRect();
    dimBox.style.left = clientX - r.left + 'px'; dimBox.style.top = clientY - r.top + 'px';
    $('#overlay').append(dimBox);
    const commit = () => {
      let raw = inp.value.trim(); if (!raw) { hideDimBox(); return; }
      let skNameOverride = nameInp ? nameInp.value.trim().replace(/\s+/g, '_') : undefined;
      if (isSkeletonMode()) {
        const eqM = /^([A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*)\s*=\s*(.+)$/.exec(raw);
        if (eqM) {
          skNameOverride = eqM[1];
          raw = eqM[2].trim();
        }
        if (skNameOverride && typeof Comp !== 'undefined' && Comp.isValidSkelParamName && !Comp.isValidSkelParamName(skNameOverride)) {
          UI.toast(T('left.par.badName'), { kind: 'bad' });
          if (nameInp) nameInp.focus();
          return;
        }
      }
      const nameChanged = isSkeletonMode() && cur && (cur.name || '') !== (skNameOverride || '');
      if (raw === orig && cur && !cur.ref && sameMode && !nameChanged) { hideDimBox(); S.dimFirst = null; Viewer.canvas.focus(); return; }
      // ein neuer Name wie „breite“ wird unter „Maße“ mit dem jetzigen Wert angelegt
      if (/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(raw) && !/^pi$/i.test(raw) && isNaN(Model.num(raw, vars(), NaN))) {
        const now = round(measureSpec(sp), 6);
        App.change(`Maß „${raw}“ angelegt`, (doc) => { doc.params.push({ id: uid('m'), name: raw, expr: now }); });
        UI.toast(T('sk.dimBox.newParamToast', { raw, val: isLen ? Units.fmtLenU(now) : isAng ? fmtAngleU(now) : fmt(now) }), { icon: 'check' });
      }
      let v;
      if (isLen) {
        const p = Units.parseLen(raw, vars(), { expr: true });
        if (!p.ok) { inp.parentElement.parentElement.classList.add('invalid'); UI.toast(T('sk.dimBox.calcErr', { err: p.error || `„${raw}“` }), { kind: 'bad' }); return; }
        v = p.value;
      } else {
        const n = parseNum(raw); v = isNaN(n) ? raw : n;
        const res = typeof v === 'number' ? { ok: isFinite(v) } : Expr.tryEval(v, vars());
        if (!res.ok) { inp.parentElement.parentElement.classList.add('invalid'); UI.toast(T('sk.dimBox.calcErr', { err: res.error || `„${raw}“` }), { kind: 'bad' }); return; }
      }
      hideDimBox(); S.dimFirst = null; if (sp.e) setSel([sp.e]);
      const nextSp = isSkeletonMode() && skNameOverride !== undefined ? { ...sp, name: skNameOverride } : sp;
      if (raw === orig && cur && !cur.ref && sameMode && nameChanged) setDimName(cur.id, skNameOverride);
      else setDimSpec(nextSp, v);
      Viewer.canvas.focus();
    };
    dimBox._inp = inp; dimBox._commit = commit; dimBox._typed = false;
    inp.addEventListener('input', () => { if (dimBox) dimBox._typed = true; });
    if (nameInp) {
      nameInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { hideDimBox(); Viewer.canvas.focus(); } });
    }
    // nach dem Mausklick fokussieren, sonst holt sich das 3D-Bild den Fokus zurück
    const grab = () => {
      if (!dimBox || !dimBox.contains(inp)) return;
      if (document.activeElement !== inp && !dimBox.contains(document.activeElement)) inp.focus();
      if (!dimBox._typed && document.activeElement === inp) inp.select();
    };
    grab(); setTimeout(grab, 0); requestAnimationFrame(grab);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { hideDimBox(); Viewer.canvas.focus(); } });
  }
  // ---------- Spline ----------
  function finishSpline(closed) {
    const d = S.draft; S.draft = null; hideEntry();
    if (!d || !d.pts || d.pts.length < (closed ? 3 : 2)) { render(); return; }
    const mode = !isSimpleMode() && S.splineMode === 'cv' ? 'cv' : null;
    addEnt({ type: 'spline', pts: d.pts.map((q) => q.slice()), closed: !!closed, ...(mode ? { mode } : {}) });
    reapply(); render(); Panels.renderRight();
  }
  function ensureSplineHandle(e, i, targetAngDeg, targetLen) {
    if (!e || e.type !== 'spline' || e.mode === 'cv' || i < 0 || i >= (e.pts || []).length) return null;
    if (!Array.isArray(e.handles)) e.handles = [];
    if (!Array.isArray(e.handles[i])) {
      const nat = SK.splineHandle(e, i) || [10, 0];
      let L = Math.max(0.5, Math.hypot(nat[0], nat[1]) || 10);
      let vx = Math.hypot(nat[0], nat[1]) >= 0.5 ? nat[0] : 10, vy = Math.hypot(nat[0], nat[1]) >= 0.5 ? nat[1] : 0;
      if (targetLen != null && targetLen > 0) {
        const curL = Math.hypot(vx, vy) || 1;
        vx = (vx / curL) * targetLen; vy = (vy / curL) * targetLen; L = targetLen;
      }
      if (targetAngDeg != null) {
        const rad = (targetAngDeg * Math.PI) / 180;
        vx = Math.cos(rad) * L; vy = Math.sin(rad) * L;
      }
      e.handles[i] = [round(vx, 4), round(vy, 4)];
    } else if (targetAngDeg != null) {
      const curAng = (Math.atan2(e.handles[i][1], e.handles[i][0]) * 180) / Math.PI;
      const diff = Math.abs(((curAng - targetAngDeg + 540) % 360) - 180);
      if (diff > 170) {
        const rad = ((targetAngDeg + 15) * Math.PI) / 180;
        const curL = Math.max(0.5, Math.hypot(e.handles[i][0], e.handles[i][1]));
        e.handles[i] = [round(Math.cos(rad) * curL, 4), round(Math.sin(rad) * curL, 4)];
      }
    }
    return e.handles[i];
  }
  function setSplineHandle(id, idx, val, opts = {}) {
    if (!S || S.step || guardLocked()) return false;
    const e = ent(id);
    if (!e || e.type !== 'spline' || e.mode === 'cv' || idx < 0 || idx >= (e.pts || []).length) return false;
    let dx, dy;
    if (Array.isArray(val) && val.length >= 2) {
      dx = +val[0]; dy = +val[1];
    } else if (val && typeof val === 'object') {
      const cur = SK.splineHandle(e, idx) || [10, 0];
      const ang = val.ang != null ? (+val.ang * Math.PI) / 180 : Math.atan2(cur[1], cur[0]);
      const len = val.len != null ? +val.len : Math.hypot(cur[0], cur[1]);
      dx = Math.cos(ang) * len; dy = Math.sin(ang) * len;
    } else return false;
    if (!isFinite(dx) || !isFinite(dy) || Math.hypot(dx, dy) < 0.1) return false;
    pushUndo();
    if (!Array.isArray(e.handles)) e.handles = [];
    e.handles[idx] = [round(dx, 4), round(dy, 4)];
    S.selHandle = { e: id, i: idx };
    if (opts.dimAng && val && val.ang != null) putDim(id, 'hAng' + idx, +val.ang);
    if (opts.dimLen && val && val.len != null) putDim(id, 'hLen' + idx, +val.len);
    reapply(); render(); Panels.renderRight();
    return true;
  }
  function resetSplineHandle(id, idx) {
    if (!S || S.step || guardLocked()) return false;
    const e = ent(id);
    if (!e || e.type !== 'spline' || idx < 0 || idx >= (e.pts || []).length) return false;
    pushUndo();
    if (Array.isArray(e.handles)) {
      e.handles[idx] = null;
      if (!e.handles.some((h) => Array.isArray(h))) delete e.handles;
    }
    S.dims = S.dims.filter((d) => !(d.e === id && (d.k === 'hAng' + idx || d.k === 'hLen' + idx)));
    S.cons = S.cons.filter((c) => !conRefs(c).some((r) => r && r.e === id && (r.p === 'h' + idx || r.handle === idx)));
    reapply(); render(); Panels.renderRight();
    return true;
  }
  function selectSplineHandle(id, idx) {
    if (!S || S.step) return false;
    const e = ent(id);
    if (!e || e.type !== 'spline' || e.mode === 'cv' || idx < 0 || idx >= (e.pts || []).length) return false;
    setSel([id]); S.selHandle = { e: id, i: idx }; render(); Panels.renderRight();
    return true;
  }
  function hitSplineHandle(uv, opts = {}) {
    if (!S || S.step || isSimpleMode()) return null;
    const tol = opts.tol || pxSize() * 10;
    const selSet = new Set(selectedIds());
    let best = null, bd = tol;
    for (const en of S.ents) {
      if (en.type !== 'spline' || en.mode === 'cv' || !en.pts || en.pts.length < 2) continue;
      const hasCustom = Array.isArray(en.handles) && en.handles.some((h) => Array.isArray(h));
      if (!opts.all && !selSet.has(en.id) && !hasCustom) continue;
      for (let i = 0; i < en.pts.length; i++) {
        const p = en.pts[i], hv = SK.splineHandle(en, i);
        if (!hv || Math.hypot(hv[0], hv[1]) < 1e-6) continue;
        const tPlus = [p[0] + hv[0], p[1] + hv[1]];
        const dp = SK.d2(tPlus, uv);
        if (dp < bd) { bd = dp; best = { ent: en, i, sign: 1, tip: tPlus, dist: dp }; }
        if (i > 0 || en.closed) {
          const tMinus = [p[0] - hv[0], p[1] - hv[1]];
          const dm = SK.d2(tMinus, uv);
          if (dm < bd) { bd = dm; best = { ent: en, i, sign: -1, tip: tMinus, dist: dm }; }
        }
        if (opts.allowLine && SK.d2(uv, p) > tol * 0.7) {
          const dlp = segDist(uv, p, tPlus);
          if (dlp < bd) { bd = dlp; best = { ent: en, i, sign: 1, tip: tPlus, dist: dlp }; }
          if (i > 0 || en.closed) {
            const tMinus = [p[0] - hv[0], p[1] - hv[1]];
            const dlm = segDist(uv, p, tMinus);
            if (dlm < bd) { bd = dlm; best = { ent: en, i, sign: -1, tip: tMinus, dist: dlm }; }
          }
        }
      }
    }
    return best;
  }
  // ---------- Hilfslinien ----------
  function syncConBtn() {
    for (const b of document.querySelectorAll('.tool.conmode')) { b.classList.toggle('active', !!S.construction); b.setAttribute('aria-pressed', S.construction ? 'true' : 'false'); }
    const c = document.getElementById('sk-con'); if (c) c.checked = !!S.construction;
  }
  function toggleConstruction() {
    if (!S || S.step || guardLocked()) return;
    const ids = selectedIds();
    if (ids.length && S.tool === 'select') {
      pushUndo();
      const allCon = ids.every((id) => ent(id).con);
      for (const id of ids) { const e = ent(id); if (allCon) delete e.con; else e.con = true; }
      reapply(); render(); Panels.renderRight();
      UI.toast(
        allCon
          ? (ids.length === 1 ? T('sk.toast.conOneNormal') : T('sk.toast.conManyNormal', { n: ids.length }))
          : (ids.length === 1 ? T('sk.toast.conOneOn') : T('sk.toast.conManyOn', { n: ids.length })),
        { icon: 'info', ms: 2200 }
      );
      return;
    }
    S.construction = !S.construction; syncConBtn();
    UI.toast(S.construction ? T('sk.toast.conModeOn') : T('sk.toast.conModeOff'), { icon: 'info', ms: 2200 });
  }
  function setRevAxis(id, on = true) {
    if (!S || S.step || guardLocked()) return false;
    const e = ent(id);
    if (!e || e.type !== 'line') return false;
    pushUndo();
    for (const x of S.ents) if (x.revAxis) delete x.revAxis;
    if (on) e.revAxis = true;
    reapply(); render(); Panels.renderRight();
    UI.toast(T(on ? 'sk.toast.revAxisOn' : 'sk.toast.revAxisOff'), { icon: 'rotate', ms: 2600 });
    return true;
  }
  // ---------- Trimmen ----------
  const tolPx = (pt = lastPtrType) => pxSize() * (pt === 'pen' ? 6 : pt === 'touch' ? 16 : 9);
  const SIMPLE = ['line', 'arc', 'circle', 'spline'];
  // Teilstück unter dem Mauszeiger als einfaches Element (bei Rechteck, Vieleck, Langloch nur die eine Kante bzw. der eine Bogen)
  function trimPart(hit, uv) {
    if (SIMPLE.includes(hit.type)) return { target: hit, skip: null };
    if (hit.type === 'ellipse') return { target: { id: '_tmp', ...ellipseSpline(hit) }, skip: { ent: hit, i: 0 } };
    if (hit.type === 'ellarc') return { target: { id: '_tmp', ...ellArcSpline(hit) }, skip: { ent: hit, i: 0 } };
    if (hit.type === 'conic') return { target: { id: '_tmp', ...conicSpline(hit) }, skip: { ent: hit, i: 0 } };
    if (hit.type === 'bridge') return { target: { id: '_tmp', ...bridgeSpline(hit) }, skip: { ent: hit, i: 0 } };
    if (hit.type === 'text') return null;
    let best = null, bd = Infinity, bi = -1;
    SK.segsOf(hit).forEach((s, i) => { const q = SKO.closest(SKO.curve(s), uv), d = SK.d2(q, uv); if (d < bd) { bd = d; best = s; bi = i; } });
    if (!best) return null;
    const target = best.t === 'arc' ? { id: '_tmp', type: 'arc', a: best.a, m: best.m, b: best.b } : best.t === 'circle' ? { id: '_tmp', type: 'circle', c: best.c, r: best.r } : { id: '_tmp', type: 'line', a: best.a, b: best.b };
    return { target, skip: { ent: hit, i: bi } };
  }
  // Ellipse als geschlossene Spline durch 48 Punkte auf ihr (Abweichung weit unter 0,01 mm bei üblichen Größen)
  function ellipseSpline(e) { return { type: 'spline', pts: SK.ellipsePoints(e.c, e.rx, e.ry, e.rot || 0, 48).map((q) => [round(q[0], 5), round(q[1], 5)]), closed: true }; }
  function ellArcSpline(e) { return { type: 'spline', pts: SK.ellArcPoints(e.c, e.rx, e.ry, e.rot || 0, e.a0, e.a1, e.ccw !== false, 36).map((q) => [round(q[0], 5), round(q[1], 5)]), closed: false }; }
  function conicSpline(e) { return { type: 'spline', pts: SK.conicPoints(e.a, e.m, e.b, e.rho, 40).map((q) => [round(q[0], 5), round(q[1], 5)]), closed: false }; }
  function bridgeSpline(e) { return { type: 'spline', pts: SK.bridgePoints(e.pts, 40).map((q) => [round(q[0], 5), round(q[1], 5)]), closed: false }; }
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
    if (hit.blk) { UI.toast(T('sk.toast.blockExplodeFirst'), { icon: 'info' }); return false; }
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
    } else if (hit.type === 'ellarc') {
      const sp = { id: uid('e'), ...(hit.con ? { con: true } : {}), ...ellArcSpline(hit) };
      const at = S.ents.indexOf(hit);
      removeEntData(hit.id);
      S.ents.splice(at, 0, sp); target = sp;
      UI.toast('Der elliptische Bogen wurde dafür zu einer Spline, die genau auf ihm liegt.', { icon: 'info', ms: 2600 });
    } else if (hit.type === 'conic' || hit.type === 'bridge') {
      const sp = { id: uid('e'), ...(hit.con ? { con: true } : {}), ...(hit.type === 'conic' ? conicSpline(hit) : bridgeSpline(hit)) };
      const at = S.ents.indexOf(hit);
      removeEntData(hit.id);
      S.ents.splice(at, 0, sp); target = sp;
      UI.toast('Die Kurve wurde dafür zu einer Spline, die genau auf ihr liegt.', { icon: 'info', ms: 2600 });
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
        return wasLine && ['horizontal', 'vertical', 'parallel', 'perpendicular', 'collinear'].includes(c.type) && conRefs(c).every((r) => !usesEnt(r, tid) || (r.p == null && !r.at));
      });
      const keeps = pieces.some((pc) => pc.keepsId);
      let at = S.ents.indexOf(target);
      if (!keeps) { S.ents.splice(at, 1); if (S.sels && S.sels.length) S.sels = S.sels.filter((x) => x !== tid); }
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
    clearSel(); sanitize(newCons.map((c) => c.id));
    S.trimHover = null; render(); Panels.renderRight();
    return true;
  }
  // ---------- Ecken runden oder fasen ----------
  // Ecke = Punkt, an dem genau zwei Linien enden (auch Ecken von Rechteck und Vieleck – die werden dafür zerlegt).
  function cornerFind(uv) {
    const tol = pxSize() * 12; let best = null;
    const take = (p, d, shape) => { if (d < tol && (!best || d < best.d)) best = { p: p.slice(), d, shape }; };
    for (const en of S.ents) {
      if (en.con || en.blk) continue;
      if (en.type === 'line') for (const k of ['a', 'b']) take(en[k], SK.d2(en[k], uv), null);
      else if (en.type === 'rect' || en.type === 'poly') for (const c of en.type === 'rect' ? SK.rectCorners(en) : SK.polyCorners(en)) take(c, SK.d2(c, uv), en.id);
    }
    if (!best) return null;
    if (!best.shape && cornerLines(best.p).length !== 2) return null;
    return best;
  }
  // Alle Ecken der Skizze auf einmal runden bzw. fasen (ein Rückgängig-Schritt)
  function cornerAll() {
    if (guardLocked()) return;
    const pts = [];
    const add = (q) => { if (!pts.some((x) => SK.d2(x, q) < 1e-4)) pts.push(q.slice()); };
    for (const en of S.ents) {
      if (en.con || en.blk) continue;
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
  // Rechteck mit runden Ecken in einem Zug (SK-17): vier Linien, vier Bögen, waagerecht/senkrecht, ein Radius für alle
  function roundRect(en, r, keepWH) {
    const w = Math.abs(en.b[0] - en.a[0]), hh = Math.abs(en.b[1] - en.a[1]);
    if (!(r > 0)) return false;
    if (2 * r >= Math.min(w, hh) - 1e-6) { UI.toast(`Der Ecken-Radius ist zu groß für dieses Rechteck – höchstens ${fmt(Math.floor((Math.min(w, hh) / 2 - 0.01) * 100) / 100, 2)} mm. Es bleibt eckig.`, { icon: 'info', ms: 4000 }); return false; }
    const before = new Set(S.ents.map((e) => e.id)), corners = SK.rectCorners(en).map((c) => c.slice());
    const n0 = S.undo.length, save = S.corner, toast = UI.toast;
    S.corner = { mode: 'fillet', r }; UI.toast = () => {};
    let ok = 0;
    try { for (const q of corners) if (cornerDo(q)) ok++; } finally { UI.toast = toast; S.corner = save; }
    S.undo.splice(n0);   // ein Rückgängig-Schritt: zurück vor das Rechteck
    const lines = S.ents.filter((e) => !before.has(e.id) && e.type === 'line'), arcs = S.ents.filter((e) => !before.has(e.id) && e.type === 'arc');
    for (const l of lines) S.cons.push({ id: uid('k'), type: Math.abs(l.a[1] - l.b[1]) < 1e-6 ? 'horizontal' : 'vertical', refs: [{ e: l.id }] });
    // ein Radius-Maß, die anderen Bögen „gleich“
    for (let i = 1; i < arcs.length; i++) { S.dims = S.dims.filter((d) => !(d.e === arcs[i].id && d.k === 'r')); S.cons.push({ id: uid('k'), type: 'equal', refs: [{ e: arcs[0].id, k: 'r' }, { e: arcs[i].id, k: 'r' }] }); }
    if (keepWH) {
      const H = lines.filter((l) => Math.abs(l.a[1] - l.b[1]) < 1e-6), Vv = lines.filter((l) => Math.abs(l.a[0] - l.b[0]) < 1e-6);
      if (Vv.length === 2) S.dims.push({ id: uid('m'), k: 'distPL', refs: [{ e: Vv[0].id, p: 'a' }, { e: Vv[1].id }], v: round(w, 4) });
      if (H.length === 2) S.dims.push({ id: uid('m'), k: 'distPL', refs: [{ e: H[0].id, p: 'a' }, { e: H[1].id }], v: round(hh, 4) });
    }
    return ok === 4;
  }
  // Ecke bilden (SK-20): zwei Linien bis zum gemeinsamen Schnittpunkt verlängern oder kürzen; der angeklickte Teil bleibt
  function meetDo(uv) {
    const hit = SK.hit(S.ents, uv, tolPx());
    if (!hit || hit.type !== 'line') { UI.toast('Klick eine Linie an.', { icon: 'info', ms: 2000 }); return false; }
    if (!S.meetFirst || S.meetFirst.id === hit.id || !ent(S.meetFirst.id)) { S.meetFirst = { id: hit.id, uv: uv.slice() }; UI.hint('<b>Ecke bilden:</b> Jetzt die zweite Linie anklicken. Der angeklickte Teil jeder Linie bleibt stehen.'); render(); return false; }
    const A = ent(S.meetFirst.id), B = hit, ua = S.meetFirst.uv; S.meetFirst = null;
    const da = [A.b[0] - A.a[0], A.b[1] - A.a[1]], db = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
    const den = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(den) < 1e-9 * (Math.hypot(...da) * Math.hypot(...db) + 1e-12)) { UI.toast('Die beiden Linien sind parallel – sie treffen sich nie.', { icon: 'info' }); UI.hint(hintFor('corner')); render(); return false; }
    const t = ((B.a[0] - A.a[0]) * db[1] - (B.a[1] - A.a[1]) * db[0]) / den;
    const I = [round(A.a[0] + da[0] * t, 4), round(A.a[1] + da[1] * t, 4)];
    const param = (L, d, p) => ((p[0] - L.a[0]) * d[0] + (p[1] - L.a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
    const endOf = (L, d, click) => (param(L, d, click) < param(L, d, I) ? 'b' : 'a');
    const ka = endOf(A, da, ua), kb = endOf(B, db, uv);
    const other = (L, k) => L[k === 'a' ? 'b' : 'a'];
    if (SK.d2(other(A, ka), I) < 1e-6 || SK.d2(other(B, kb), I) < 1e-6) { UI.toast('Dann bliebe von einer Linie nichts übrig – klick auf den Teil, der stehen bleiben soll.', { icon: 'info' }); UI.hint(hintFor('corner')); render(); return false; }
    pushUndo();
    // Enden, die an anderen Elementen hingen, lösen sich; Längen-Maße passen nicht mehr
    const at = (r, L, k) => r && r.e === L.id && r.p === k;
    S.cons = S.cons.filter((c) => !(c.type === 'coincident' && (c.refs || []).some((r) => at(r, A, ka) || at(r, B, kb))));
    S.dims = S.dims.filter((d) => !((d.e === A.id || d.e === B.id) && d.k === 'len'));
    A[ka] = I.slice(); B[kb] = I.slice();
    const nc = { id: uid('k'), type: 'coincident', refs: [{ e: A.id, p: ka }, { e: B.id, p: kb }] };
    S.cons.push(nc); sanitize([nc.id]);
    UI.hint(hintFor('corner')); reapply(); render(); Panels.renderRight();
    return true;
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
      const sh = ent(hv.shape); if (sh && sh.blk) { sketchUndo(); UI.toast(T('sk.toast.blockExplodeFirst'), { icon: 'info' }); return false; }
      const parts = SKO.explode(sh); const at = S.ents.indexOf(sh);
      removeEntData(sh.id); S.ents.splice(at, 0, ...parts);
      // die zerlegten Linien bleiben an den Ecken verbunden
      const lines = parts.filter((x) => x.type === 'line');
      for (let i = 0; i < lines.length; i++) { const A = lines[i], B = lines[(i + 1) % lines.length]; if (SK.d2(A.b, B.a) < 1e-4) S.cons.push({ id: uid('k'), type: 'coincident', refs: [{ e: A.id, p: 'b' }, { e: B.id, p: 'a' }] }); }
    }
    const L = cornerLines(hv.p);
    if (L.length !== 2) { sketchUndo(); UI.toast('Hier treffen nicht genau zwei Linien aufeinander.', { icon: 'info' }); return false; }
    const [[l1, k1], [l2, k2]] = L;
    if (l1.blk || l2.blk) { sketchUndo(); UI.toast(T('sk.toast.blockExplodeFirst'), { icon: 'info' }); return false; }
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
    S.cornerHover = null; clearSel();
    if (dropDims) UI.toast('Die Längen-Maße der beiden Linien wurden entfernt – die Linien enden jetzt an der ' + (C.mode === 'fillet' ? 'Rundung.' : 'Fase.'), { icon: 'info', ms: 4000 });
    render(); Panels.renderRight();
    return true;
  }
  // ---------- Versatz ----------
  const OFFTYPES = ['line', 'arc', 'circle', 'rect', 'poly', 'slot', 'spline', 'ellipse', 'ellarc'];
  function offsetDown(uv0, e) {
    const p = snap(uv0, { fine: e.shiftKey, off: e.altKey, exclude: S.draft && S.draft.off ? [S.draft.off.id] : undefined }).p;
    if (S.draft && S.draft.off) {
      const sd = round(offsetSigned(S.draft.off, p), 3);
      if (Math.abs(sd) < 0.01) { UI.toast('Zieh die Maus weg von der Linie – dort liegt die Kopie.', { icon: 'info' }); return; }
      applyOffset(sd, Math.abs(sd)); return;
    }
    const hit = SK.hit(S.ents, uv0, tolPx());
    if (!hit || !OFFTYPES.includes(hit.type)) { UI.toast('Klick eine Linie, einen Bogen, Kreis oder eine Form an.', { icon: 'info' }); return; }
    if (hit.blk) { UI.toast(T('sk.toast.blockExplodeFirst'), { icon: 'info' }); return; }
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
    if (e.type === 'ellarc') {
      const pl = SK.ellArcPoints(e.c, e.rx, e.ry, e.rot || 0, e.a0, e.a1, e.ccw !== false, 90); let bd = Infinity;
      for (let i = 0; i < pl.length - 1; i++) bd = Math.min(bd, segDist(uv, pl[i], pl[i + 1]));
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
  function offsetCalc(off, sd, corners = 'sharp') {
    const e = ent(off.id); if (!e) return { ok: false, why: 'Das Element gibt es nicht mehr.' };
    if (Math.abs(sd) < 1e-6) return { ok: false, why: 'Der Abstand darf nicht 0 sein.' };
    if (off.chain) { const r = SKO.offsetChain(off.chain, sd, corners); return r.ok ? { ok: true, items: r.items } : r; }
    const r = SKO.offsetShape(e, sd, corners);
    if (!r.ok) return r;
    return r.items ? { ok: true, items: r.items } : { ok: true, items: [{ src: e, ent: r.ent, sgs: r.sgs }] };
  }
  function offsetPlan(off, sd, v) {
    const O = (S && S.off) || { count: 1, both: false, corners: 'sharp' };
    const count = clamp(Math.round(O.count || 1), 1, 20);
    const both = !!O.both;
    const corners = O.corners === 'round' ? 'round' : 'sharp';
    const signs = both ? [1, -1] : [1];
    const scaleV = (val, k) => (k === 1 ? val : typeof val === 'number' ? round(val * k, 4) : `(${val})*${k}`);
    const copies = [], errs = [];
    for (const s of signs) {
      for (let k = 1; k <= count; k++) {
        const sdk = s * k * sd;
        const r = offsetCalc(off, sdk, corners);
        if (r.ok) copies.push({ sd: sdk, v: scaleV(v, k), items: r.items });
        else errs.push(r.why);
      }
    }
    return { ok: copies.length > 0, copies, skipped: errs.length, total: signs.length * count, why: errs[0] || '' };
  }
  function offsetCon(src, ne, it, sd, v) {
    if (it.edge != null) {
      const cr = (it.srcB[0] - it.srcA[0]) * (ne.a[1] - it.srcA[1]) - (it.srcB[1] - it.srcA[1]) * (ne.a[0] - it.srcA[0]);
      return { id: uid('k'), type: 'offset', refs: [{ e: src.id, edge: it.edge }, { e: ne.id }], v, sg: cr >= 0 ? 1 : -1 };
    }
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
    const plan = offsetPlan(off, sd, v);
    if (!plan.ok) { UI.toast(plan.why, { kind: 'bad' }); return false; }
    pushUndo();
    const allCons = [];
    for (const cp of plan.copies) {
      const copyOffCons = [], copyAuxCons = [], segEnts = new Map(), cornerJobs = [];
      for (const it of cp.items) {
        const ne = { id: uid('e'), ...it.ent }; if (it.src && it.src.con) ne.con = true;
        S.ents.push(ne);
        if (it.corner) { cornerJobs.push({ it, ne }); continue; }
        if (it.segIdx != null) segEnts.set(it.segIdx, { ne, startKey: it.startKey, endKey: it.endKey });
        const c = offsetCon(it.src, ne, it, cp.sd, cp.v); if (c) copyOffCons.push(c);
      }
      for (const { it, ne } of cornerJobs) {
        const P = segEnts.get(it.prevSeg), Q = segEnts.get(it.nextSeg);
        if (P && Q) {
          copyAuxCons.push(
            { id: uid('k'), type: 'coincident', refs: [{ e: P.ne.id, p: P.endKey }, { e: ne.id, p: 'a' }] },
            { id: uid('k'), type: 'coincident', refs: [{ e: Q.ne.id, p: Q.startKey }, { e: ne.id, p: 'b' }] },
            makeTanCon(P.ne, ne),
            makeTanCon(ne, Q.ne),
          );
        }
        if (it.src) copyOffCons.push({ id: uid('k'), type: 'offset', refs: [{ e: it.src.id }, { e: ne.id }], v: cp.v, sg: 1, corner: true });
      }
      if (copyOffCons.length > 1) { const og = uid('og'); for (const c of copyOffCons) c.og = og; }   // pro Kopie zusammen entstanden: später zusammen ändern
      allCons.push(...copyOffCons, ...copyAuxCons);
    }
    S.cons.push(...allCons);
    S.draft = null; hideEntry(); clearSel();
    sanitize(allCons.map((c) => c.id));
    UI.hint(hintFor('offset')); render(); Panels.renderRight();
    if (plan.skipped > 0) UI.toast(`${plan.copies.length} von ${plan.total} Versätzen erstellt – die übrigen waren zu eng.`, { icon: 'info', ms: 3500 });
    if (plan.copies.some((cp) => cp.items.some((x) => x.src && x.src.type === 'ellipse'))) UI.toast('Der Versatz einer Ellipse ist keine Ellipse mehr – die Kopie ist eine Spline durch 48 Punkte genau im Abstand. Sie folgt der Ellipse nicht, wenn du diese später änderst.', { icon: 'info', ms: 5000 });
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
    if (!S.mir || guardLocked()) return;
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
    S.mir = null; clearSel();
    sanitize(newCons.map((c) => c.id));
    UI.hint(hintFor('mirror')); render(); Panels.renderRight();
    return n;
  }
  // ---------- Live-Spiegeln (SK-46): alles neu Gezeichnete sofort spiegeln ----------
  function syncLiveMirBtn() {
    const on = !!(S && S.liveMir);
    for (const b of document.querySelectorAll('.tool.livemirror')) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  function liveMirAxisLabel() {
    if (!S || !S.liveMir) return '';
    if (S.liveMir.axisDir === 'x') return T('sk.panel.liveMirAxisX');
    if (S.liveMir.axisDir === 'y') return T('sk.panel.liveMirAxisY');
    return entName(S.liveMir.axis);
  }
  function ensureOriginAxis(dir) {
    const isX = dir === 'x';
    const existing = S.ents.find((e) => e.type === 'line' && e.con && (isX ? (Math.abs(e.a[1]) < 1e-6 && Math.abs(e.b[1]) < 1e-6) : (Math.abs(e.a[0]) < 1e-6 && Math.abs(e.b[0]) < 1e-6)));
    if (existing) return existing;
    const b = SK.bounds(S.ents) || [-20, -20, 20, 20];
    const L = Math.max(20, Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3])) + 10;
    pushUndo();
    const ax = { id: uid('e'), type: 'line', con: true, a: isX ? [-L, 0] : [0, -L], b: isX ? [L, 0] : [0, L] };
    S.ents.push(ax);
    S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: ax.id }], at: Object.fromEntries((Solver.varsOf(ax) || []).map((k) => [k, Solver.getK(ax, k)])) });
    reapply();
    return ax;
  }
  function setLiveMirror(target) {
    if (!S || S.step || guardLocked()) return false;
    if (target && isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    if (!target) {
      S.liveMir = null; S.liveMirPick = false; syncLiveMirBtn();
      UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
      UI.toast(T('sk.toast.liveMirOff'), { icon: 'info', ms: 2000 });
      return true;
    }
    const axisDir = (target === 'x' || target === 'y') ? target : null;
    const ax = axisDir ? ensureOriginAxis(axisDir) : ent(target);
    if (!ax || ax.type !== 'line') {
      UI.toast(T('sk.toast.liveMirPickLine'), { icon: 'info' });
      return false;
    }
    S.liveMir = { axis: ax.id, axisDir };
    S.liveMirPick = false;
    syncLiveMirBtn();
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    UI.toast(T('sk.toast.liveMirOn', { axis: liveMirAxisLabel() }), { icon: 'check', ms: 2600 });
    return ax.id;
  }
  function startLiveMirrorPick() {
    if (!S || S.step || guardLocked()) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    S.liveMirPick = true;
    UI.hint(T('sk.hint.liveMirPick')); render(); Panels.renderRight();
    return true;
  }
  function toggleLiveMirror() {
    if (!S || S.step || guardLocked()) return false;
    if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return false; }
    if (S.liveMir) return setLiveMirror(false);
    const sel = S.sel && ent(S.sel);
    if (sel && sel.type === 'line') return setLiveMirror(sel.id);
    if (S.liveMirPick) { S.liveMirPick = false; UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); return false; }
    return startLiveMirrorPick();
  }
  function liveMirrorEnts(list) {
    if (!S || !S.liveMir || isSimpleMode()) return [];
    const ax = ent(S.liveMir.axis);
    if (!ax || ax.type !== 'line') { S.liveMir = null; syncLiveMirBtn(); return []; }
    const created = [], newCons = [];
    for (const e of list || []) {
      if (!e || e.id === ax.id || e.link || SKO.isMirrorSelf(e, ax.a, ax.b)) continue;
      const r = SKO.mirrorEnt(e, ax.a, ax.b);
      S.ents.push(...r.ents);
      created.push(...r.ents);
      for (const [p, q] of r.pairs) newCons.push({ id: uid('k'), type: 'symmetric', refs: [p, q, { e: ax.id }] });
      for (const [p, q] of r.rad) newCons.push({ id: uid('k'), type: 'equal', refs: [{ ...p, k: 'r' }, { ...q, k: 'r' }] });
    }
    if (newCons.length) S.cons.push(...newCons);
    return created;
  }
  // ---------- Strecken (SK-30): Bereich im Rahmen verschieben, Regeln bleiben erhalten ----------
  function stretchDelta(st = S && S.stretch) {
    if (!st) return { dx: 0, dy: 0 };
    if (st.dir === 'x') return { dx: Number(st.dist) || 0, dy: 0 };
    if (st.dir === 'y') return { dx: 0, dy: Number(st.dist) || 0 };
    if (st.dir === 'ang') {
      const d = Number(st.dist) || 0, rad = ((Number(st.ang) || 0) * Math.PI) / 180;
      return { dx: round(Math.cos(rad) * d, 6), dy: round(Math.sin(rad) * d, 6) };
    }
    return { dx: Number(st.dx) || 0, dy: Number(st.dy) || 0 };
  }
  function stretchBox(x0, y0, x1, y1) {
    if (!S || S.step || guardLocked() || isSimpleMode()) return null;
    const box = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    const sel = SKO.stretchSelect(S.ents, box);
    if (!sel.pointCount) {
      S.stretch.box = null; S.stretch.sel = null;
      UI.toast(T('sk.toast.stretchEmpty'), { icon: 'info', ms: 2400 });
      UI.hint(hintFor('stretch')); render(); Panels.renderRight();
      return null;
    }
    S.stretch.box = box;
    S.stretch.sel = sel;
    UI.hint(hintFor('stretch')); render(); Panels.renderRight();
    return sel;
  }
  function applyStretch(opts = {}) {
    if (!S || S.step || guardLocked() || isSimpleMode()) return 0;
    const st = S.stretch;
    if (!st || !st.sel || !st.sel.pointCount) {
      UI.toast(T('sk.toast.stretchEmpty'), { icon: 'info' });
      return 0;
    }
    if (opts.dir) st.dir = opts.dir;
    if (opts.dist != null) st.dist = opts.dist;
    if (opts.ang != null) st.ang = opts.ang;
    if (opts.dx != null && opts.dy != null) { st.dir = 'xy'; st.dx = opts.dx; st.dy = opts.dy; }
    else if (opts.dx != null) { st.dir = 'x'; st.dist = opts.dx; }
    else if (opts.dy != null) { st.dir = 'y'; st.dist = opts.dy; }
    const { dx, dy } = stretchDelta(st);
    if (Math.hypot(dx, dy) < 1e-9) { UI.toast(T('sk.toast.stretchZero'), { icon: 'info' }); return 0; }
    const pv = SKO.stretchPreview(S.ents, st.sel, dx, dy);
    if (!pv.ok) { UI.toast(pv.why, { kind: 'bad' }); return 0; }
    if (!pv.movedVars.length) { UI.toast(T('sk.toast.stretchNoEffect'), { icon: 'info' }); return 0; }
    pushUndo();
    const beforeDims = new Map();
    for (const d of S.dims) {
      if (!d.ref && typeof d.v === 'number' && d.k !== 'n') beforeDims.set(d.id, measureSpec(dimSpecOf(d)));
    }
    const movedMap = new Map();
    for (const [eid, k, val] of pv.movedVars) {
      const e = ent(eid);
      if (!e) continue;
      Solver.setK(e, k, val);
      if (!movedMap.has(eid)) movedMap.set(eid, new Set());
      movedMap.get(eid).add(k);
    }
    for (const c of S.cons) {
      if (c.type !== 'fix' || !c.refs || !c.refs[0] || !c.refs[0].e) continue;
      const r0 = c.refs[0], ks = movedMap.get(r0.e);
      if (!ks) continue;
      if (r0.p && Array.isArray(c.at)) {
        const pt = refXY(r0);
        if (pt) c.at = pt.map((v) => round(v, 6));
      } else if (c.at && typeof c.at === 'object') {
        const e = ent(r0.e);
        if (e) for (const k of Object.keys(c.at)) if (ks.has(k)) c.at[k] = Solver.getK(e, k);
      }
    }
    for (const d of S.dims) {
      if (!beforeDims.has(d.id)) continue;
      const now = measureSpec(dimSpecOf(d));
      if (isFinite(now) && Math.abs(now - beforeDims.get(d.id)) > 1e-6) d.v = round(now, 4);
    }
    const r = reapply({ pins: pv.movedVars });
    if (r && !r.ok) {
      sketchUndo();
      UI.toast(T('sk.toast.stretchConflict'), { kind: 'bad', ms: 4200 });
      return 0;
    }
    const cnt = st.sel.pointCount;
    st.box = null; st.sel = null;
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    UI.toast(T('sk.toast.stretchDone', { n: cnt, unit: T(cnt === 1 ? 'sk.panel.stretchPtOne' : 'sk.panel.stretchPtMany') }), { icon: 'check', ms: 2600 });
    return cnt;
  }
  // ---------- Muster ----------
  let lastPatClick = null;
  function patSelCenter(ids = S.patSel) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) { const e = ent(id); if (!e) continue; for (const pl of entPts(e)) for (const p of pl) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } }
    return isFinite(x0) ? [round((x0 + x1) / 2, 6), round((y0 + y1) / 2, 6)] : [0, 0];
  }
  function curvePlan() {
    if (!S || !S.patCurve) return null;
    const ce = ent(S.patCurve);
    if (!ce || !SKO.isCurveEnt(ce)) return null;
    const P = S.pat;
    return SKO.curvePatternJobs(ce, {
      mode: P.curveMode || 'count',
      n: P.curveN,
      dist: P.curveDist,
      align: P.curveAlign !== false,
      flip: !!P.curveFlip,
    }, S.patSel && S.patSel.length ? patSelCenter() : null);
  }
  function patternDown(uv, p) {
    if ((S.tool === 'patcirc' || S.tool === 'xmove') && S.patPick) {
      const pk = pickAt(uv);
      if (!pk || pk.kind !== 'point') { UI.toast('Klick genau auf einen Punkt: Ecke, Mittelpunkt oder den Nullpunkt.', { icon: 'info' }); return; }
      S.patCenter = { ref: pk.ref, xy: pk.xy.slice() }; S.patPick = false;
      UI.hint(hintFor('patcirc')); render(); Panels.renderRight(); return;
    }
    if (S.tool === 'patcurve' && S.patPickCurve) {
      const hit = SK.hit(S.ents, uv, tolPx());
      if (!hit || !SKO.isCurveEnt(hit)) { UI.toast(T('sk.toast.patCurveBadEnt'), { icon: 'info' }); return; }
      S.patCurve = hit.id;
      S.patSel = (S.patSel || []).filter((id) => id !== hit.id);
      S.patPickCurve = false;
      UI.hint(hintFor('patcurve')); render(); Panels.renderRight(); return;
    }
    const hit = SK.hit(S.ents, uv, tolPx()); if (!hit) return;
    if (S.tool === 'patcurve' && hit.id === S.patCurve) return;
    const now = performance.now(), dbl = lastPatClick && lastPatClick.id === hit.id && now - lastPatClick.t < 400;
    lastPatClick = { id: hit.id, t: now };
    if (dbl && (hit.type === 'line' || hit.type === 'arc')) {
      // Doppelklick: alle verbundenen Linien und Bögen dazu
      const ch = SKO.chainOf(S.ents, hit); const ids = (ch && ch.segs ? ch.segs.map((x) => x.e.id) : [hit.id]).filter((id) => S.tool !== 'patcurve' || id !== S.patCurve);
      for (const id of ids) if (!S.patSel.includes(id)) S.patSel.push(id);
      lastPatClick = null;
      UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); return;
    }
    const i = S.patSel.indexOf(hit.id);
    if (i >= 0) S.patSel.splice(i, 1); else S.patSel.push(hit.id);
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
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
    return job.ang != null ? SKO.rotateEnt(e, C.xy, (job.ang * Math.PI) / 180) : SKO.moveEnt(e, job.dx, job.dy);
  }
  // ---------- Verschieben und Drehen mit genauen Werten (SK-02, SK-03) ----------
  function xmoveJob() { const X = S.xm; return X.mode === 'rot' ? { ang: X.ang } : { dx: X.dx, dy: X.dy }; }
  function xmoveCenter() {
    if (S.patCenter) return S.patCenter;
    // ohne gewählten Punkt: Mitte der gewählten Elemente
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of S.patSel) { const e = ent(id); if (!e) continue; for (const pl of entPts(e)) for (const p of pl) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } }
    return { xy: isFinite(x0) ? [round((x0 + x1) / 2, 6), round((y0 + y1) / 2, 6)] : [0, 0], auto: true };
  }
  function applyXmove() {
    if (guardLocked()) return 0;
    const ids = S.patSel.filter((id) => ent(id) && !ent(id).link);
    if (!ids.length) { UI.toast('Klick zuerst die Elemente an, die verschoben oder gedreht werden sollen.', { icon: 'info' }); return 0; }
    const X = S.xm, job = xmoveJob(), C = xmoveCenter();
    if (job.ang != null ? Math.abs(job.ang) < 1e-9 : Math.hypot(job.dx, job.dy) < 1e-9) { UI.toast('Abstand bzw. Winkel ist 0 – da bewegt sich nichts.', { icon: 'info' }); return 0; }
    pushUndo();
    let n = 0, dropped = 0;
    if (X.copy) {
      for (const id of ids) { const r = patternCopy(ent(id), job, C); for (const ne of r.ents) delete ne.revAxis; S.ents.push(...r.ents); n += r.ents.length; }
    } else {
      const moved = new Set(ids);
      for (const id of ids) {
        const e = ent(id), r = patternCopy(e, job, C);
        if (r.ents.length === 1 && r.ents[0].type === e.type) { const keepCon = e.con, keepRev = e.revAxis; Object.assign(e, r.ents[0], { id: e.id }); if (!keepCon) delete e.con; if (!keepRev) delete e.revAxis; }
        else { removeEntData(id); S.ents.push(...r.ents); moved.delete(id); dropped++; }   // gedrehtes Rechteck wird zu vier Linien
        n++;
      }
      // feste Lage mitnehmen: Maße X/Y und „Fixieren“ der bewegten Elemente
      for (const d of S.dims) if (moved.has(d.e) && (d.k === 'x' || d.k === 'y') && !d.ref) {
        if (job.ang == null && typeof d.v === 'number') d.v = round(d.v + (d.k === 'x' ? job.dx : job.dy), 4);
        else if (job.ang != null) { d.ref = true; dropped++; }
      }
      for (const d of S.dims) if (moved.has(d.e) && d.k === 'ang' && job.ang != null && typeof d.v === 'number') d.v = round(d.v + job.ang, 4);
      for (const c of S.cons) {
        const refsMoved = (c.refs || []).length && (c.refs || []).every((r) => r && moved.has(r.e));
        if (c.type === 'fix' && refsMoved && c.at) { const e = ent(c.refs[0].e); if (e) for (const k of Object.keys(c.at)) c.at[k] = Solver.getK(e, k); }
      }
      if (job.ang != null && Math.abs(((job.ang % 90) + 90) % 90) > 1e-6) {
        // waagerecht/senkrecht passt nach einer schrägen Drehung nicht mehr
        const before = S.cons.length;
        S.cons = S.cons.filter((c) => !((c.type === 'horizontal' || c.type === 'vertical') && (c.refs || []).some((r) => r && moved.has(r.e))));
        dropped += before - S.cons.length;
      }
    }
    S.patSel = []; clearSel();
    reapply(); render(); Panels.renderRight();
    const what = X.copy ? (job.ang != null ? 'gedreht kopiert' : 'verschoben kopiert') : job.ang != null ? 'gedreht' : 'verschoben';
    UI.toast(`${n} ${n === 1 ? 'Element' : 'Elemente'} ${what}${dropped ? ' – Regeln, die nicht mehr passten, sind angepasst' : ''}.`, { icon: 'check' });
    return n;
  }
  function createPattern(o = {}) {
    if (guardLocked()) return 0;
    const ids = S.patSel.filter((id) => ent(id));
    if (!ids.length) { UI.toast('Klick zuerst die Elemente an, die vervielfältigt werden sollen.', { icon: 'info' }); return 0; }
    const curve = S.tool === 'patcurve';
    const circ = S.tool === 'patcirc';
    const P = S.pat, pg = o.pg || uid('pg');
    let jobs, C = null, piv = null, pm;
    if (curve) {
      if (!S.patCurve || !ent(S.patCurve)) { UI.toast(T('sk.toast.patCurveNeedCurve'), { icon: 'info' }); return 0; }
      const plan = curvePlan();
      if (!plan || !plan.ok) { UI.toast((plan && plan.why) || T('sk.toast.patCurveNeedCurve'), { kind: 'bad' }); return 0; }
      if (!plan.jobs.length) { UI.toast('Mit dieser Einstellung entstehen keine Kopien.', { icon: 'info' }); return 0; }
      jobs = plan.jobs;
      piv = patSelCenter(ids);
      pm = { kind: 'curve', curveId: S.patCurve, curveMode: P.curveMode || 'count', curveN: P.curveN, curveDist: P.curveDist, curveAlign: P.curveAlign !== false, curveFlip: !!P.curveFlip, src: ids.slice() };
    } else {
      C = circ ? S.patCenter || { ref: { e: 'origin' }, xy: [0, 0] } : null;
      jobs = patternJobs();
      if (!jobs.length) { UI.toast('Mit dieser Anzahl entstehen keine Kopien.', { icon: 'info' }); return 0; }
      pm = circ ? { kind: 'circ', n: P.n, ang: P.ang, src: ids.slice(), center: C.ref, cxy: C.xy.slice() } : { kind: 'rect', nx: P.nx, ny: P.ny, dx: P.dx, dy: P.dy, src: ids.slice() };
    }
    if (!o.noUndo) pushUndo();
    // alle Regeln dieses Musters tragen dieselbe Kennung und die Einstellungen – so lässt es sich später als Ganzes ändern
    const newCons = []; let made = 0;
    for (const job of jobs) for (const id of ids) {
      const e = ent(id);
      const r = curve ? SKO.transformEnt(e, job.dx, job.dy, job.da, piv) : patternCopy(e, job, C);
      for (const ne of r.ents) delete ne.revAxis;
      S.ents.push(...r.ents);
      const refs = []; for (const [a, b] of r.pairs) refs.push(a, b);
      const c = { id: uid('k'), type: 'xform', refs };
      if (r.rad.length) c.req = r.rad.flat();
      if (curve) {
        if (r.xform.mode === 'rot') { c.mode = 'rot'; c.center = r.xform.center; c.ang = r.xform.ang; }
        else { c.dx = r.xform.dx; c.dy = r.xform.dy; }
      } else if (circ) { c.mode = 'rot'; c.center = C.ref; c.ang = round(job.ang, 4); }
      else { c.dx = round(job.dx, 4); c.dy = round(job.dy, 4); }
      c.pg = pg; c.pm = deepClone(pm);
      newCons.push(c); made += r.ents.length;
    }
    S.cons.push(...newCons);
    S.patSel = []; clearSel();
    if (curve) { S.patCurve = null; S.patPickCurve = false; }
    sanitize(newCons.map((c) => c.id));
    if (o.select && newCons.length) S.selCon = newCons[0].id;
    if (curve && !o.noUndo && made) UI.toast(T('sk.toast.patCurveDone', { n: made }), { icon: 'check' });
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    return made;
  }
  // Ein Muster als Ganzes ändern: alte Kopien weg, mit den neuen Einstellungen neu anlegen (ein Rückgängig-Schritt)
  function regenPattern(pg, P) {
    const cons = S.cons.filter((c) => c.type === 'xform' && c.pg === pg); if (!cons.length || !cons[0].pm) return false;
    const pm = cons[0].pm, src = pm.src.filter((id) => ent(id));
    if (!src.length) { UI.toast('Die Originale dieses Musters gibt es nicht mehr.', { kind: 'bad' }); return false; }
    if (pm.kind === 'curve' && (!pm.curveId || !ent(pm.curveId))) { UI.toast('Die Leitkurve dieses Musters gibt es nicht mehr.', { kind: 'bad' }); return false; }
    pushUndo();
    const copies = new Set(); for (const c of cons) for (let i = 1; i < c.refs.length; i += 2) if (c.refs[i] && c.refs[i].e) copies.add(c.refs[i].e);
    S.cons = S.cons.filter((c) => !(c.type === 'xform' && c.pg === pg));
    for (const id of copies) if (!src.includes(id)) removeEntData(id);
    const keep = { tool: S.tool, pat: S.pat, patSel: S.patSel, patCenter: S.patCenter, patCurve: S.patCurve, patPickCurve: S.patPickCurve };
    S.tool = pm.kind === 'circ' ? 'patcirc' : pm.kind === 'curve' ? 'patcurve' : 'patrect';
    S.pat = { ...S.pat, ...(pm.kind === 'circ' ? { n: pm.n, ang: pm.ang } : pm.kind === 'curve' ? { curveMode: pm.curveMode, curveN: pm.curveN, curveDist: pm.curveDist, curveAlign: pm.curveAlign, curveFlip: pm.curveFlip } : { nx: pm.nx, ny: pm.ny, dx: pm.dx, dy: pm.dy }), ...P };
    S.patSel = src.slice();
    S.patCenter = pm.kind === 'circ' && pm.center && pm.center.e !== 'origin' ? { ref: pm.center, xy: refXY(pm.center) || pm.cxy } : null;
    S.patCurve = pm.kind === 'curve' ? pm.curveId : null;
    S.patPickCurve = false;
    const made = createPattern({ noUndo: true, pg, select: true });
    S.tool = keep.tool; S.pat = keep.pat; S.patSel = keep.patSel; S.patCenter = keep.patCenter; S.patCurve = keep.patCurve; S.patPickCurve = keep.patPickCurve;
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    if (!made) UI.toast('Mit dieser Anzahl bleibt nur das Original – das Muster ist aufgelöst.', { icon: 'info' });
    return true;
  }
  // ---------- Füllmuster in der Skizze (SK-45) ----------
  function activeFillRegion() {
    if (!S || !S.fill) return { regs: [], reg: null };
    const regs = SK.regions(S.ents);
    let reg = regs.find((r) => r.key === S.fill.regionKey) || null;
    if (!reg && regs.length === 1) { reg = regs[0]; S.fill.regionKey = reg.key; }
    return { regs, reg };
  }
  function fillPreviewResult() {
    const { reg } = activeFillRegion();
    return reg ? SKO.fillPattern(reg, S.fill) : null;
  }
  function fillPatternDown(uv) {
    const regs = SK.regions(S.ents);
    let reg = SK.regionAt(regs, uv);
    if (!reg) {
      const hit = SK.hit(S.ents, uv, tolPx());
      if (hit) reg = regs.find((r) => r.outer.ents.includes(hit.id));
    }
    if (!reg) { UI.toast(T('sk.toast.fillNoRegion'), { icon: 'info' }); return; }
    S.fill.regionKey = reg.key;
    UI.hint(hintFor('patfill')); render(); Panels.renderRight();
  }
  function applyFillPattern() {
    if (guardLocked()) return 0;
    const res = fillPreviewResult();
    if (!res || !res.ok || !res.ents.length) {
      UI.toast((res && res.why) || T('sk.panel.fillEmpty'), { icon: 'info' });
      return 0;
    }
    pushUndo();
    S.ents.push(...res.ents);
    S.fill.regionKey = null;
    reapply(); UI.hint(hintFor('patfill')); render(); Panels.renderRight();
    UI.toast(T('sk.toast.fillDone', { n: res.ents.length }), { icon: 'check' });
    return res.ents.length;
  }
  function onDown(e) {
    if (!S || S.step) return stepDown(e);
    if (e.button !== 0) return;
    lastPtrType = e.pointerType || 'mouse';
    const uv0 = mouseUV(e); if (!uv0) return;
    const hadDraft = !!S.draft;
    const sn = snap(uv0, { fine: e.shiftKey, off: e.altKey, pen: lastPtrType === 'pen', touch: lastPtrType === 'touch' });
    let p = sn.p;
    const t = S.tool;
    if (S.locked && t !== 'select') { guardLocked(); return; }
    if (S.liveMirPick) {
      const hit = SK.hit(S.ents, uv0, tolPx());
      if (hit && hit.type === 'line') setLiveMirror(hit.id);
      else UI.toast(T('sk.toast.liveMirPickLine'), { icon: 'info' });
      return;
    }
    if (t === 'stretch') {
      if (isSimpleMode()) { UI.toast(T('sk.toast.proOnly'), { icon: 'info' }); return; }
      clearBand();
      S.band = { x: e.clientX, y: e.clientY, mode: 'stretch', el: null, moved: false };
      try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (t === 'dim') {
      const dmMode = (S.dimMode === 'ord' && isSimpleMode()) ? 'auto' : (S.dimMode || 'auto');
      const dimPointOf = (q) => {
        if (!q) return null;
        if (q.kind === 'point') return { ref: q.ref, xy: q.xy };
        if (q.ent && (q.ent.type === 'circle' || q.ent.type === 'arc' || q.ent.type === 'poly' || q.ent.type === 'ellipse')) {
          const xy = refXY({ e: q.ent.id, p: 'c' });
          return xy ? { ref: { e: q.ent.id, p: 'c' }, xy } : null;
        }
        return null;
      };
      if (dmMode === 'arcLen') {
        const pk = pickAt(uv0, { points: false });
        if (!pk || !pk.ent || pk.ent.type !== 'arc' || !SK.arcInfo(pk.ent.a, pk.ent.m, pk.ent.b)) {
          UI.toast(T('sk.toast.arcLenPickArc'), { icon: 'info', ms: 2000 }); render(); return;
        }
        e.preventDefault(); setSel([pk.ent.id]); render(); Panels.renderRight();
        askDim({ e: pk.ent.id, k: 'arcLen' }, e.clientX, e.clientY); return;
      }
      if (dmMode === 'ang3') {
        const pk = pickAt(uv0);
        const pt = dimPointOf(pk);
        if (!pt) { UI.toast(T('sk.toast.ang3PickPt'), { icon: 'info', ms: 2000 }); render(); return; }
        if ((S.dimPicks || []).some((x) => sameRefs(x.ref, pt.ref) || SK.d2(x.xy, pt.xy) < 1e-6)) {
          UI.toast(T('sk.toast.ang3SamePt'), { icon: 'info', ms: 1800 }); return;
        }
        S.dimPicks.push(pt);
        if (S.dimPicks.length < 3) { hideDimBox(); UI.hint(hintFor('dim')); render(); return; }
        const refs = S.dimPicks.map((x) => x.ref);
        S.dimPicks = [];
        e.preventDefault(); UI.hint(hintFor('dim'));
        askDim({ k: 'ang3', refs }, e.clientX, e.clientY); render(); return;
      }
      if (dmMode === 'ord') {
        const pk = pickAt(uv0);
        if (!pk) { UI.toast(T(S.ordBase ? 'sk.toast.ordPickPoint' : 'sk.toast.ordPickBase'), { icon: 'info', ms: 2000 }); render(); return; }
        if (!S.ordBase) {
          if (pk.kind !== 'line' && pk.kind !== 'point') { UI.toast(T('sk.toast.ordPickBase'), { icon: 'info', ms: 2000 }); return; }
          const ex = S.dims.find((d) => d.k === 'ord' && d.refs && sameRefs(d.refs[1], pk.ref));
          S.ordBase = { ref: pk.ref, kind: pk.kind, sg: ex && ex.sg != null ? ex.sg : null, axis: pk.kind === 'point' ? (ex && ex.axis ? ex.axis : (S.ordAxis || 'auto')) : null, xy: pk.xy || null, ent: pk.ent || null };
          hideDimBox(); UI.hint(hintFor('dim')); render(); Panels.renderRight(); return;
        }
        let pt = dimPointOf(pk);
        if (!pt && S.ordBase.kind === 'line' && pk.kind === 'line' && !sameRefs(pk.ref, S.ordBase.ref)) {
          const pRef = pk.ent.type === 'rect' ? { e: pk.ent.id, p: 'k' + (pk.ref.edge || 0) } : { e: pk.ent.id, p: 'a' };
          const xy = refXY(pRef);
          if (xy) pt = { ref: pRef, xy };
        }
        if (!pt || sameRefs(pt.ref, S.ordBase.ref)) { UI.toast(T('sk.toast.ordPickPoint'), { icon: 'info', ms: 2000 }); return; }
        let axis = S.ordBase.axis;
        if (S.ordBase.kind === 'point' && (!axis || axis === 'auto')) {
          const o = refXY(S.ordBase.ref) || [0, 0];
          axis = Math.abs(pt.xy[0] - o[0]) >= Math.abs(pt.xy[1] - o[1]) ? 'x' : 'y';
          S.ordBase.axis = axis;
        }
        if (S.ordBase.sg == null) {
          if (S.ordBase.kind === 'line') {
            const Ln = refLine(S.ordBase.ref);
            if (Ln) {
              const dx = Ln[1][0] - Ln[0][0], dy = Ln[1][1] - Ln[0][1];
              const raw = -(pt.xy[0] - Ln[0][0]) * dy + (pt.xy[1] - Ln[0][1]) * dx;
              if (Math.abs(raw) > 1e-6 * (Math.hypot(dx, dy) || 1)) S.ordBase.sg = raw >= 0 ? 1 : -1;
              else S.ordBase.sg = Math.abs(dy) >= Math.abs(dx) ? (-dy >= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);
            }
          } else {
            const o = refXY(S.ordBase.ref) || [0, 0];
            const ax = axis === 'y' ? 1 : 0;
            const raw = pt.xy[ax] - o[ax];
            S.ordBase.sg = Math.abs(raw) > 1e-6 ? (raw >= 0 ? 1 : -1) : 1;
          }
        }
        e.preventDefault();
        askDim({ k: 'ord', refs: [pt.ref, S.ordBase.ref], sg: S.ordBase.sg, ...(S.ordBase.kind === 'point' ? { axis } : {}) }, e.clientX, e.clientY);
        render(); return;
      }
      const circRefOf = (q) => {
        if (!q) return null;
        if (q.kind === 'circle' && q.ent) return { e: q.ent.id };
        if (q.kind === 'point' && q.ref && q.ref.p === 'c' && q.ref.e) {
          const en = ent(q.ref.e);
          if (en && (en.type === 'circle' || en.type === 'arc')) return { e: en.id };
        }
        return null;
      };
      if (dmMode === 'auto' && !isSimpleMode() && !S.dimFirst) {
        const hh = hitSplineHandle(uv0, { all: true, allowLine: true });
        if (hh) {
          e.preventDefault();
          setSel([hh.ent.id]); S.selHandle = { e: hh.ent.id, i: hh.i };
          render(); Panels.renderRight();
          askDim({ e: hh.ent.id, k: 'hAng' + hh.i }, e.clientX, e.clientY);
          return;
        }
      }
      const pk = pickAt(uv0);
      if (!pk) { S.dimFirst = null; UI.toast('Klick genau auf eine Linie, einen Kreis oder einen Punkt.', { icon: 'info', ms: 1800 }); render(); return; }
      const f = S.dimFirst;
      if (f) {
        // zweites Element: Abstand oder Winkel zwischen zwei Dingen
        let k = null, refs = null, extra = {};
        const fp = f.kind === 'point', np = pk.kind === 'point';
        const cA = circRefOf(f), cB = circRefOf(pk);
        if (cA && cB && cA.e !== cB.e) { k = 'distCC'; refs = [cA, cB]; extra = { cm: S.dimCircMode || 'center' }; }
        else if (fp && np && !sameRefs(f.ref, pk.ref)) { k = 'dist'; refs = [f.ref, pk.ref]; }
        else if (fp && pk.kind === 'line') { k = 'distPL'; refs = [f.ref, pk.ref]; }
        else if (f.kind === 'line' && np) { k = 'distPL'; refs = [pk.ref, f.ref]; }
        else if (f.kind === 'line' && pk.kind === 'line' && !sameRefs(f.ref, pk.ref)) { k = 'angLL'; refs = [f.ref, pk.ref]; }
        if (k) { e.preventDefault(); S.dimFirst = null; askDim({ k, refs, ...extra }, e.clientX, e.clientY); render(); return; }
      }
      if (pk.kind === 'point') { S.dimFirst = pk; hideDimBox(); UI.hint('Jetzt einen <b>zweiten Punkt</b> oder eine <b>Linie</b> anklicken – für den Abstand.'); render(); return; }
      const k = dimKeyAt(pk.ent, uv0);
      if (!k) { S.dimFirst = null; UI.toast('Dafür gibt es noch kein Maß.', { icon: 'info' }); return; }
      setSel([pk.ent.id]); S.dimFirst = pk.kind === 'line' || pk.kind === 'circle' ? pk : null;
      UI.hint(hintFor('dim')); render(); Panels.renderRight();
      e.preventDefault();
      askDim({ e: pk.ent.id, k }, e.clientX, e.clientY); return;
    }
    if (t.startsWith('c:')) { consPick(t === 'c:project' ? null : pickAt(uv0, { points: t !== 'c:curvature' }), e); return; }
    if (t === 'select') {
      const tol = tolPx(e.pointerType || 'mouse');
      if (S.locked) {
        const hit = SK.hit(S.ents, uv0, tol);
        if (hit) {
          if (e.shiftKey) {
            const cur = selectedIds(), idx = cur.indexOf(hit.id);
            if (idx >= 0) cur.splice(idx, 1); else cur.push(hit.id);
            setSel(cur); S.selCon = null; render(); Panels.renderRight(); return;
          }
          setSel([hit.id]); S.selCon = null; S.lockedDrag = { x: e.clientX, y: e.clientY }; render(); Panels.renderRight(); return;
        }
        clearBand();
        S.band = { x: e.clientX, y: e.clientY, shift: e.shiftKey, el: null, moved: false };
        try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      // Endpunkt oder Tangenten-Griff ziehen? (alle Linien, die sich dort treffen, gehen mit)
      const endHit = [];
      let minEndDist = Infinity;
      if (!e.shiftKey) {
        for (const en of S.ents) {
          if (en.blk) continue;
          if (en.type === 'line' || en.type === 'arc') { for (const k of ['a', 'b']) { const dd = SK.d2(en[k], uv0); if (dd < tol) { endHit.push([en, k]); minEndDist = Math.min(minEndDist, dd); } } }
          else if (en.type === 'conic') { for (const k of ['a', 'b', 'm']) { const dd = SK.d2(en[k], uv0); if (dd < tol) { endHit.push([en, k]); minEndDist = Math.min(minEndDist, dd); } } }
          else if (en.type === 'spline') en.pts.forEach((q, i) => { const dd = SK.d2(q, uv0); if (dd < tol) { endHit.push([en, 'p' + i + '_']); minEndDist = Math.min(minEndDist, dd); } });
        }
        const hh = hitSplineHandle(uv0, { tol: Math.max(tol, pxSize() * 11) });
        if (hh && (!endHit.length || hh.dist < minEndDist)) {
          pushUndo();
          setSel([hh.ent.id]); S.selHandle = { e: hh.ent.id, i: hh.i }; S.selCon = null;
          S.drag = { handle: { e: hh.ent.id, i: hh.i, sign: hh.sign, initVec: SK.splineHandle(hh.ent, hh.i), activated: Array.isArray(hh.ent.handles) && Array.isArray(hh.ent.handles[hh.i]) }, start: uv0 };
          render(); Panels.renderRight();
          return;
        }
      }
      if (endHit.length) { pushUndo(); S.drag = { points: endHit, start: uv0 }; S.selCon = null; return; }
      const hit = SK.hit(S.ents, uv0, tol);
      if (hit) {
        if (hit.blk) {
          if (e.shiftKey) {
            const cur = selectedIds();
            const bIds = instEnts(hit.blk).map((x) => x.id);
            const allIn = bIds.every((id) => cur.includes(id));
            const next = allIn ? cur.filter((id) => !bIds.includes(id)) : [...new Set([...cur, ...bIds])];
            setSel(next);
            const remBlks = new Set(next.map((id) => ent(id)).filter((x) => x && x.blk).map((x) => x.blk));
            S.selBlockInst = remBlks.size === 1 && !next.some((id) => { const x = ent(id); return x && !x.blk; }) ? [...remBlks][0] : null;
            S.selCon = null; render(); Panels.renderRight(); return;
          }
          const inst = (S.blockInsts || []).find((i) => i.id === hit.blk);
          if (inst) { pushUndo(); S.drag = { blockInst: inst.id, start: uv0, orig: { x: inst.x || 0, y: inst.y || 0 } }; }
          selectBlockInst(hit.blk); render(); Panels.renderRight(); return;
        }
        if (e.shiftKey) {
          const cur = selectedIds(), idx = cur.indexOf(hit.id);
          if (idx >= 0) cur.splice(idx, 1); else cur.push(hit.id);
          setSel(cur); S.selCon = null; render(); Panels.renderRight(); return;
        }
        if (hit.type === 'point' || hit.type === 'text' || hit.type === 'ellipse' || hit.type === 'ellarc' || hit.type === 'conic' || hit.type === 'bridge' || hit.type === 'circle' || hit.type === 'rect' || hit.type === 'poly' || hit.type === 'slot' || hit.type === 'line' || hit.type === 'arc' || hit.type === 'spline') {
          pushUndo(); S.drag = { move: hit.id, start: uv0, orig: deepClone(hit) };
        }
        setSel([hit.id]); S.selCon = null; render(); Panels.renderRight(); return;
      }
      if (guidesActive() && !S.locked && S.guides && S.guides.length && !e.shiftKey) {
        const hg = Snap.hitGuide(uv0, S.guides, tol);
        if (hg) {
          startGuideDrag(hg.guide.axis, hg.guide.id, e);
          return;
        }
      }
      // Im Leeren: Rahmen-Auswahl beginnen (erst ab > 4 px Ziehen sichtbar; kurzer Klick hebt Auswahl auf)
      clearBand();
      S.band = { x: e.clientX, y: e.clientY, shift: e.shiftKey, el: null, moved: false };
      try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (t === 'block') {
      if (isSimpleMode() || S.blockEdit) return;
      if (!S.blockActive) { UI.toast(T('sk.toast.blockSelectFirst'), { icon: 'info' }); return; }
      insertBlock(S.blockActive, p[0], p[1], S.blockRot || 0);
      return;
    }
    if (t === 'corner') { if (S.corner.mode === 'meet') meetDo(uv0); else cornerDo(uv0); return; }
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
    if (t === 'shape') { insertShape(S.shape.type, S.shape.p, p); return; }
    if (t === 'text') {
      const T = S.txt; if (!String(T.s).trim()) { UI.toast('Bitte zuerst rechts einen Text eingeben.', { icon: 'info' }); return; }
      const en = addEnt({ type: 'text', a: p.slice(), s: T.s, h: T.h, font: T.font, align: T.align, rot: 0 });
      setSel([en.id]); reapply(); render(); Panels.renderRight(); return;
    }
    if (t === 'extend') { extendAt(uv0); return; }
    if (t === 'splitl') { splitAt(p); return; }
    if (t === 'wall') { wallAt(p); return; }
    if (t === 'project') { projectAt(e); return; }
    if (t === 'silhouette') { silhouetteAt(e); return; }
    if (t === 'intersect') { intersectAt(e); return; }
    if (t === 'trim') { S.trimming = true; if (trimAt(uv0)) Panels.renderRight(); return; }
    if (t === 'offset') { offsetDown(uv0, e); return; }
    if (t === 'mirror') { mirrorDown(uv0); return; }
    if (t === 'patrect' || t === 'patcirc' || t === 'patcurve' || t === 'xmove') { patternDown(uv0, p); return; }
    if (t === 'patfill') { fillPatternDown(uv0); return; }
    if (t === 'bridge') { bridgeDown(uv0); return; }
    if (t === 'spline') {
      if (!S.draft) S.draft = { pts: [p] };
      else {
        const pts = S.draft.pts;
        const near = pxSize() * 7;
        if (SK.d2(pts[pts.length - 1], uv0) < near) { finishSpline(false); return; }
        if (pts.length >= 3 && SK.d2(pts[0], uv0) < near) { finishSpline(true); return; }
        pts.push(p);
      }
    } else if (t === 'line' && S.lineMode === 'tan2') {
      tan2Down(uv0); return;
    } else if (t === 'line') {
      if (!S.draft) { S.draft = { pts: [p], arc: false, first: null, last: null, hadArc: false }; }
      else if (S.draft.arc) {
        const st = draftTan();
        if (!st) {
          S.draft.arc = false; updateLineHint();
        } else {
          if (SK.d2(st.p, p) < 1e-6) return;
          const g = tanArc(st, p);
          if (!g) { UI.toast('Für einen tangentialen Bogen muss der Endpunkt seitlich neben der bisherigen Richtung liegen.', { icon: 'info', ms: 2600 }); return; }
          const en = addEnt({ type: 'arc', a: st.p.slice(), m: g.m.map((v) => round(v, 4)), b: p.slice() });
          const prev = ent(st.e);
          const added = [];
          if (prev) {
            added.push(makeTanCon(prev, en, g), { id: uid('k'), type: 'coincident', refs: [{ e: st.e, p: st.k }, { e: en.id, p: 'a' }] });
          }
          const closed = S.draft.pts.length >= 2 && SK.d2(p, S.draft.pts[0]) < 1e-6;
          if (closed && S.draft.first && ent(S.draft.first.id) && S.draft.first.id !== en.id) {
            added.push({ id: uid('k'), type: 'coincident', refs: [{ e: en.id, p: 'b' }, { e: S.draft.first.id, p: S.draft.first.end }] });
          }
          if (added.length) {
            S.cons.push(...added);
            const r = reapply();
            if (r && !r.ok) {
              S.cons = S.cons.filter((c) => !added.includes(c) || c.type === 'coincident');
              if (!reapply().ok) { S.cons = S.cons.filter((c) => !added.includes(c)); reapply(); }
            }
          }
          if (closed && S.draft.first) {
            const firstEnt = ent(S.draft.first.id);
            if (firstEnt && firstEnt.id !== en.id) {
              const tEnd = endTangent(en, 'b'), tFirst = endTangent(firstEnt, S.draft.first.end);
              if (tEnd && tFirst && -(tEnd.t[0] * tFirst.t[0] + tEnd.t[1] * tFirst.t[1]) > Math.cos((2 * Math.PI) / 180)) {
                const tcClose = makeTanCon(en, firstEnt, g);
                const tr = Solver.trial({ ents: S.ents, dims: S.dims, cons: [...S.cons, tcClose], consBefore: S.cons }, vars());
                if (tr.ok && !tr.redundant) { S.cons.push(tcClose); reapply(); }
              }
            }
          }
          if (!S.draft.first) S.draft.first = { id: en.id, end: 'a' };
          if (closed) { S.draft = null; hideEntry(); updateLineHint(); }
          else { S.draft.pts.push(en.b.slice()); S.draft.last = { id: en.id, end: 'b' }; }
        }
      } else {
        const a = S.draft.pts[S.draft.pts.length - 1];
        const prev = S.draft.last && ent(S.draft.last.id);
        const prevTan = prev && prev.type === 'arc' ? endTangent(prev, S.draft.last.end) : null;
        const lp = linePoint(uv0, e);
        p = lp.p;
        const snappedTan = !!lp.tan;
        if (SK.d2(a, p) < 1e-6) return;
        const en = addEnt({ type: 'line', a: a.slice(), b: p.slice() });
        const added = [];
        if (prev) {
          if (prev.type === 'arc' || S.draft.hadArc) {
            added.push({ id: uid('k'), type: 'coincident', refs: [{ e: prev.id, p: S.draft.last.end }, { e: en.id, p: 'a' }] });
          }
          if (prevTan) {
            const L = SK.d2(a, p);
            const dot = ((p[0] - a[0]) * prevTan.t[0] + (p[1] - a[1]) * prevTan.t[1]) / (L || 1);
            if (snappedTan || dot > Math.cos((8 * Math.PI) / 180)) added.push(makeTanCon(prev, en));
          }
        }
        const closed = SK.d2(p, S.draft.pts[0]) < 1e-6;
        if (closed && S.draft.first && S.draft.hadArc && ent(S.draft.first.id) && S.draft.first.id !== en.id) {
          added.push({ id: uid('k'), type: 'coincident', refs: [{ e: en.id, p: 'b' }, { e: S.draft.first.id, p: S.draft.first.end }] });
        }
        if (added.length) {
          S.cons.push(...added);
          const r = reapply();
          if (r && !r.ok) {
            S.cons = S.cons.filter((c) => !added.includes(c) || c.type === 'coincident');
            if (!reapply().ok) { S.cons = S.cons.filter((c) => !added.includes(c)); reapply(); }
          }
        }
        if (!S.draft.first) S.draft.first = { id: en.id, end: 'a' };
        if (closed) { S.draft = null; hideEntry(); updateLineHint(); }
        else { S.draft.pts.push(en.b.slice()); S.draft.last = { id: en.id, end: 'b' }; }
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
      else {
        const q = rectDraft(S.draft, p);
        if (Math.abs(q.b[0] - q.a[0]) > 1e-6 && Math.abs(q.b[1] - q.a[1]) > 1e-6) {
          if (S.rectR > 0) {
            const beforeIds = new Set(S.ents.map((x) => x.id));
            const en = addEnt({ type: 'rect', a: q.a, b: q.b }, { noMirror: true });
            if (S.draft.mid) midCons(en, S.draft.a);
            roundRect(en, S.rectR, false);
            liveMirrorEnts(S.ents.filter((x) => !beforeIds.has(x.id)));
          } else {
            const en = addEnt({ type: 'rect', a: q.a, b: q.b });
            if (S.draft.mid) midCons(en, S.draft.a);
          }
        }
        S.draft = null; hideEntry();
      }
    } else if (t === 'ellipse') {
      if (!S.draft) S.draft = { c: p };
      else if (!S.draft.ax) { if (SK.d2(S.draft.c, p) > 1e-6) S.draft.ax = p; }
      else { const q = ellDraft(S.draft, p); if (q.ry > 1e-6) addEnt({ type: 'ellipse', c: S.draft.c, rx: round(q.rx, 4), ry: round(q.ry, 4), rot: q.rot }); S.draft = null; hideEntry(); }
    } else if (t === 'ellarc') {
      if (!S.draft) S.draft = { c: p };
      else if (!S.draft.ax) { if (SK.d2(S.draft.c, p) > 1e-6) S.draft.ax = p; }
      else if (!S.draft.ry) { const q = ellDraft(S.draft, p); if (q.ry > 1e-6) { S.draft.rx = round(q.rx, 4); S.draft.ry = round(q.ry, 4); S.draft.rot = q.rot; } }
      else if (S.draft.a0 == null) { S.draft.a0 = round(ellParamAt(S.draft.c, S.draft.rx, S.draft.ry, S.draft.rot, p), 6); }
      else {
        const a1 = round(ellParamAt(S.draft.c, S.draft.rx, S.draft.ry, S.draft.rot, p), 6);
        if (Math.abs(SK.ellArcSweep(S.draft.a0, a1, !S.ellArcCW)) > 1e-4) addEnt({ type: 'ellarc', c: S.draft.c, rx: S.draft.rx, ry: S.draft.ry, rot: S.draft.rot, a0: S.draft.a0, a1, ccw: !S.ellArcCW });
        S.draft = null; hideEntry();
      }
    } else if (t === 'circle' && S.circMode && S.circMode !== 'center') {
      const need = S.circMode === '3p' ? 3 : 2;
      if (!S.draft) S.draft = { pts: [p] };
      else if (!S.draft.pts.some((q) => SK.d2(q, p) < 1e-6)) S.draft.pts.push(p);
      if (S.draft.pts.length >= need) { const ci = circOfDraft(S.draft.pts); if (ci && ci.r > 1e-6) addEnt({ type: 'circle', c: ci.c.map((v) => round(v, 4)), r: round(ci.r, 4) }); S.draft = null; }
    } else if (t === 'arc' && S.arcMode === 'tan') {
      if (!S.draft) { const st = tanStart(uv0); if (!st) { UI.toast('Klick zuerst auf das Ende einer Linie oder eines Bogens – dort setzt der Bogen tangential an.', { icon: 'info' }); return; } S.draft = { tan: st }; }
      else { const g = tanArc(S.draft.tan, p); if (g) { const en = addEnt({ type: 'arc', a: S.draft.tan.p.slice(), m: g.m.map((v) => round(v, 4)), b: p.slice() }); const prev = ent(S.draft.tan.e); S.cons.push(prev ? makeTanCon(prev, en, g) : { id: uid('k'), type: 'tangent', refs: [{ e: S.draft.tan.e }, { e: en.id }] }, { id: uid('k'), type: 'coincident', refs: [{ e: S.draft.tan.e, p: S.draft.tan.k }, { e: en.id, p: 'a' }] }); if (!reapply().ok) { S.cons.splice(-2); reapply(); } } S.draft = null; }
    } else if (t === 'circle') {
      if (!S.draft) S.draft = { c: p };
      else { const r = SK.d2(S.draft.c, p); if (r > 1e-6) addEnt({ type: 'circle', c: S.draft.c, r: round(r, 4) }); S.draft = null; hideEntry(); }
    } else if (t === 'poly') {
      if (!S.draft) S.draft = { c: p };
      else { const r = SK.d2(S.draft.c, p); if (r > 1e-6) addEnt({ type: 'poly', c: S.draft.c, r: round(r, 4), n: S.polySides, rot: Math.atan2(p[1] - S.draft.c[1], p[0] - S.draft.c[0]) - Math.PI / 2 }); S.draft = null; hideEntry(); }
    } else if (t === 'arc' && S.arcMode === 'center') {
      if (!S.draft) S.draft = { ctr: p };
      else if (!S.draft.s) { if (SK.d2(S.draft.ctr, p) > 1e-6) S.draft.s = p; }
      else { const g = centerArc(S.draft, p); if (g) { const en = addEnt({ type: 'arc', a: g.a, m: g.m, b: g.b }); if (S.draft.ctrRef) S.cons.push({ id: uid('k'), type: 'coincident', refs: [S.draft.ctrRef, { e: en.id, p: 'c' }] }); } S.draft = null; }
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
      else {
        const r = slotR(S.draft.a, S.draft.b, p);
        if (r > 1e-6 && S.slotTotal) { const q = slotInset(S.draft.a, S.draft.b, r); if (q) addEnt({ type: 'slot', a: q.a, b: q.b, r: round(r, 4) }); else UI.toast('So breit geht nicht – die Breite muss kleiner als die Gesamtlänge sein.', { icon: 'info' }); }
        else if (r > 1e-6) addEnt({ type: 'slot', a: S.draft.a, b: S.draft.b, r: round(r, 4) });
        S.draft = null; hideEntry();
      }
    } else if (t === 'conic') {
      if (!S.draft) { S.draft = { a: p }; UI.hint(hintFor('conic')); }
      else if (!S.draft.b) { if (SK.d2(S.draft.a, p) > 1e-6) { S.draft.b = p; UI.hint(hintFor('conic')); } }
      else if (!S.draft.m) { if (SK.d2(S.draft.a, p) > 1e-6 && SK.d2(S.draft.b, p) > 1e-6) { S.draft.m = p; UI.hint(hintFor('conic')); } }
      else {
        const rho = conicRhoAt(S.draft.a, S.draft.m, S.draft.b, p);
        S.conicRho = rho;
        addEnt({ type: 'conic', a: S.draft.a, m: S.draft.m, b: S.draft.b, rho });
        S.draft = null; hideEntry(); UI.hint(hintFor('conic'));
      }
    }
    if (!hadDraft && S.draft) {
      if (e.pointerType === 'pen' && Viewer.gestures && ((t === 'rect' && !S.rect3) || (t === 'circle' && (!S.circMode || S.circMode === 'center')) || t === 'poly' || (t === 'line' && S.lineMode !== 'tan2'))) {
        S.penStroke = { tool: t, x: e.clientX, y: e.clientY, id: e.pointerId };
      } else if (e.pointerType === 'touch') {
        skTouchDraft = { t: performance.now(), id: e.pointerId };
      }
    }
    reapply(); render(); Panels.renderRight();
  }
  // Kegelschnitt (SK-36) & Brückenkurve (SK-40)
  function conicRhoAt(a, m, b, uv) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const vx = m[0] - mid[0], vy = m[1] - mid[1], l2 = vx * vx + vy * vy;
    let r = l2 > 1e-9 ? ((uv[0] - mid[0]) * vx + (uv[1] - mid[1]) * vy) / l2 : 0.5;
    if (Math.abs(r - 0.5) < 0.025) r = 0.5;
    return round(clamp(r, 0.05, 0.95), 4);
  }
  function conicKindLabel(rho) {
    if (Math.abs(rho - 0.5) < 1e-4) return T('sk.panel.conicParabola');
    return rho < 0.5 ? T('sk.panel.conicEllipse') : T('sk.panel.conicHyperbola');
  }
  const BRIDGE_OPEN_TYPES = ['line', 'arc', 'ellarc', 'spline', 'conic', 'bridge'];
  function pickCurveEnd(uv, tol = pxSize() * 14, exclude = null) {
    const open = S.ents.filter((e) => BRIDGE_OPEN_TYPES.includes(e.type) && !(e.type === 'spline' && e.closed));
    let best = null, bd = tol;
    for (const e of open) {
      for (const k of ['a', 'b']) {
        if (exclude && exclude.e === e.id && exclude.k === k) continue;
        const p = k === 'a' ? SK.endA(e) : SK.endB(e);
        if (!p) continue;
        const d = SK.d2(p, uv);
        if (d < bd) {
          const end = SK.curveEnd(e, k);
          if (end) { bd = d; best = end; }
        }
      }
    }
    if (best) return best;
    const hit = SK.hit(open, uv, pxSize() * 10);
    if (hit) {
      const ea = SK.endA(hit), eb = SK.endB(hit);
      if (ea && eb) {
        const order = SK.d2(ea, uv) <= SK.d2(eb, uv) ? ['a', 'b'] : ['b', 'a'];
        for (const k of order) {
          if (exclude && exclude.e === hit.id && exclude.k === k) continue;
          const end = SK.curveEnd(hit, k);
          if (end) return end;
        }
      }
    }
    return null;
  }
  function bridgeDown(uv0) {
    const B = S.bridge;
    const end = pickCurveEnd(uv0, pxSize() * 14, B.first);
    if (!B.first) {
      if (!end) { UI.toast(T('sk.toast.bridgePickEnd'), { icon: 'info' }); return; }
      B.first = end;
      B.hoverEnd = null;
      UI.hint(hintFor('bridge')); render(); Panels.renderRight();
      return;
    }
    if (!end) { UI.toast(T('sk.toast.bridgePickSecond'), { icon: 'info' }); return; }
    if (SK.d2(B.first.p, end.p) < 1e-4) { UI.toast(T('sk.toast.bridgeSamePt'), { icon: 'info' }); return; }
    const pts = SK.bridgeControlPoints(B.first, end, B.mode, B.s1, B.s2);
    addEnt({ type: 'bridge', a: pts[0].slice(), b: pts[pts.length - 1].slice(), mode: B.mode, s1: B.s1, s2: B.s2, refA: { e: B.first.e, p: B.first.k }, refB: { e: end.e, p: end.k }, pts });
    const modeLbl = T(B.mode === 'g2' ? 'sk.panel.bridgeG2' : 'sk.panel.bridgeG1');
    B.first = null; B.hoverEnd = null;
    reapply(); UI.hint(hintFor('bridge')); render(); Panels.renderRight();
    UI.toast(T('sk.toast.bridgeDone', { mode: modeLbl }), { icon: 'check', ms: 2400 });
  }
  // Tangente an zwei Kreise oder Bögen (SK-19): die äußere Tangente auf der Seite, auf die geklickt wurde
  function circOf(e) { if (e.type === 'circle') return { c: e.c, r: e.r }; if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); return ai ? { c: ai.c, r: ai.r } : null; } return null; }
  function tan2Geom(A, ua, B, ub) {
    const c1 = A.c, c2 = B.c, dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
    if (d < Math.abs(A.r - B.r) + 1e-6) return null;
    const th = Math.atan2(dy, dx), ph = Math.acos(clamp((A.r - B.r) / d, -1, 1));
    let best = null;
    for (const s of [1, -1]) {
      const n = [Math.cos(th + s * ph), Math.sin(th + s * ph)];
      const p1 = [c1[0] + A.r * n[0], c1[1] + A.r * n[1]], p2 = [c2[0] + B.r * n[0], c2[1] + B.r * n[1]];
      const sc = SK.d2(p1, ua) + SK.d2(p2, ub);
      if (!best || sc < best.sc) best = { a: p1.map((v) => round(v, 4)), b: p2.map((v) => round(v, 4)), sc };
    }
    return best;
  }
  function tan2Down(uv) {
    const hit = SK.hit(S.ents, uv, tolPx());
    const C = hit && circOf(hit);
    if (!C) { UI.toast('Klick einen Kreis oder Bogen an.', { icon: 'info', ms: 2000 }); return; }
    if (!S.tanFirst || S.tanFirst.id === hit.id || !ent(S.tanFirst.id)) { S.tanFirst = { id: hit.id, uv: uv.slice() }; UI.hint('<b>Tangente:</b> Jetzt den zweiten Kreis oder Bogen anklicken – auf der Seite, an der die Linie entlanglaufen soll.'); render(); return; }
    const A = ent(S.tanFirst.id), g = tan2Geom(circOf(A), S.tanFirst.uv, C, uv);
    const first = S.tanFirst; S.tanFirst = null; UI.hint(hintFor('line'));
    if (!g) { UI.toast('Ein Kreis liegt im anderen – da gibt es keine Tangente.', { icon: 'info' }); render(); return; }
    const en = addEnt({ type: 'line', a: g.a, b: g.b });
    const nc = [{ id: uid('k'), type: 'tangent', refs: [{ e: en.id }, { e: first.id }] }, { id: uid('k'), type: 'tangent', refs: [{ e: en.id }, { e: hit.id }] }];
    S.cons.push(...nc); sanitize(nc.map((c) => c.id));
    reapply(); render(); Panels.renderRight();
  }
  // Bogen über Mitte, Start, Ende (gegen den Uhrzeigersinn vom Start zum Ende, Radius vom Start)
  function centerArc(d, p) {
    const c = d.ctr, s = d.s, r = SK.d2(c, s); if (r < 1e-6 || SK.d2(c, p) < 1e-6) return null;
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]), a1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
    let sw = a1 - a0; while (sw <= 1e-6) sw += 2 * Math.PI; if (sw >= 2 * Math.PI - 1e-6) return null;
    const at = (t) => [round(c[0] + r * Math.cos(t), 4), round(c[1] + r * Math.sin(t), 4)];
    return { a: s.slice(), m: at(a0 + sw / 2), b: at(a1), r, sw };
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
  function ellParamAt(c, rx, ry, rot, p) {
    const cs = Math.cos(-(rot || 0)), sn = Math.sin(-(rot || 0));
    const dx = p[0] - c[0], dy = p[1] - c[1];
    return Math.atan2((sn * dx + cs * dy) / (ry || 1), (cs * dx - sn * dy) / (rx || 1));
  }
  // ---------- Bild als Vorlage ----------
  let bgTex = null, bgTexSrc = null;
  function pushUndoBg() { /* Bildlage gehört nicht zum Rückgängig der Geometrie */ }
  function bgLoad() {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    inp.onchange = async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      const sz = Store.checkFileSize(file, 'image');
      if (!sz.ok) { UI.toast(sz.message, { kind: 'bad', ms: 6000 }); return; }
      const isSvg = (file.type || '').toLowerCase().includes('svg') || /\.svg$/i.test(file.name || '');
      let dataUrl = '';
      if (isSvg) {
        try {
          const san = Store.sanitizeSVG(await file.text(), { name: file.name });
          if (!san.ok) { UI.toast(san.error, { kind: 'bad', ms: 6000 }); return; }
          if (san.stats && san.stats.stripped > 0) UI.toast(T('import.svgSanitized'), { icon: 'warn', ms: 6000 });
          dataUrl = 'data:image/svg+xml;base64,' + Store.bytesToBase64(new TextEncoder().encode(san.svg));
        } catch (_) {
          UI.toast('Das Bild konnte nicht gelesen werden.', { kind: 'bad', ms: 6000 });
          return;
        }
      } else {
        dataUrl = await new Promise((resolve) => {
          const rd = new FileReader();
          rd.onload = () => resolve(String(rd.result || ''));
          rd.onerror = () => resolve('');
          rd.readAsDataURL(file);
        });
        if (!dataUrl) { UI.toast('Das Bild konnte nicht gelesen werden.', { kind: 'bad', ms: 6000 }); return; }
      }
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
      img.onerror = () => UI.toast('Das Bild konnte nicht geladen werden – vielleicht ist die Datei beschädigt.', { kind: 'bad', ms: 6000 });
      img.src = dataUrl;
    };
    document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
  }
  function setBg(src, w = 100, r = 0.75) { S.bg = { src, a: [-w / 2, -(w * r) / 2], w, r, op: 0.5 }; render(); Panels.renderRight(); }
  async function bgCalDown(uv) {
    if (!S.bgCal) { S.bgCal = [uv]; render(); return; }
    const a = S.bgCal[0], b = uv; S.bgCal = null;
    const L = SK.d2(a, b); if (L < 1e-6) { setTool('bg'); return; }
    render();
    const ans = await UI.prompt('Maßstab festlegen', `Wie weit liegen die beiden Punkte in Wirklichkeit auseinander (${Units.label()})? Im Bild sind es jetzt ${Units.fmtLenU(L, 2)}.`, Units.fmtInput(L));
    const p = ans == null ? { ok: false } : Units.parseLen(String(ans), vars(), { expr: false });
    const v = p.ok ? p.num : NaN;
    if (S && S.bg && v > 0) {
      const f = v / L;
      S.bg.a = [round(a[0] + (S.bg.a[0] - a[0]) * f, 4), round(a[1] + (S.bg.a[1] - a[1]) * f, 4)]; S.bg.w = round(S.bg.w * f, 4);
      UI.toast(`Maßstab gesetzt: Das Bild ist jetzt ${Units.fmtLenU(S.bg.w, 1)} breit.`, { icon: 'check' });
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
    if (S.tool === 'bgcal' && S.bgCal) { const cur = S.cursor ? S.cursor.p : S.bgCal[0]; lineObj([S.bgCal[0], cur], Viewer.theme.accent, 2, { dashed: true }); label(Units.fmtLenU(SK.d2(S.bgCal[0], cur), 2), cur); }
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
    liveMirrorEnts(ids.map((id) => ent(id)).filter(Boolean));
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
    liveMirrorEnts(ids.map((id) => ent(id)).filter(Boolean));
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
  // Klick auf eine Fläche statt auf eine Kante: der ganze Schnitt des Körpers mit der Skizzen-Ebene kommt als Kontur in die Skizze
  async function sectionAt(hit) {
    const r = App.results.get(hit.id); if (!r || !r.key) return;
    const W = Model.worldMatrix(App.doc, hit.id), WI = W.clone().invert(), F = S.F;
    const o = F.o.clone().applyMatrix4(WI), n = F.n.clone().transformDirection(WI).normalize();
    let edges;
    try { edges = await Kernel.call('section', { key: r.key, o: o.toArray(), n: n.toArray() }); } catch (e) { UI.toast('Den Schnitt konnte ich nicht rechnen: ' + (e.message || e), { kind: 'bad' }); return; }
    if (!S || S.F !== F) return;
    if (!edges || !edges.length) { UI.toast('Die Skizzen-Ebene schneidet diesen Körper nicht.', { icon: 'info' }); return; }
    pushUndo(); let n2 = 0;
    for (const g of edges) {
      const pts = []; for (const q of g.pts) { const uv = uvIn(F, new THREE.Vector3(...q).applyMatrix4(W)); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
      const en = edgeGeom2D(pts, g.t); if (!en) continue;
      en.id = uid('e'); if (S.construction) en.con = true; S.ents.push(en); n2++;
    }
    reapply(); render(); Panels.renderRight();
    UI.toast(`Schnitt übernommen: ${n2} ${n2 === 1 ? 'Stück' : 'Stücke'} – die Kontur des Körpers in dieser Ebene.`, { icon: 'check' });
  }
  function faceEdgeTo2D(g, W, F, fnW) {
    if (g.t === 'LINE') {
      const aW = new THREE.Vector3(...g.a).applyMatrix4(W), bW = new THREE.Vector3(...g.b).applyMatrix4(W);
      const a = uvIn(F, aW), b = uvIn(F, bW);
      if (SK.d2(a, b) < 1e-4) return null;
      return { ent: { type: 'line', a, b }, pts3: [aW, bW] };
    }
    if (g.t === 'CIRCLE' && g.c && g.r > 1e-6) {
      const cW = new THREE.Vector3(...g.c).applyMatrix4(W);
      const aW = new THREE.Vector3(...g.a).applyMatrix4(W);
      const mW = new THREE.Vector3(...g.m).applyMatrix4(W);
      const bW = new THREE.Vector3(...g.b).applyMatrix4(W);
      const cnW = g.n ? new THREE.Vector3(...g.n).transformDirection(W).normalize() : fnW.clone();
      const closed = aW.distanceTo(bW) < 1e-4;
      if (Math.abs(cnW.dot(F.n)) > 1 - 1e-4) {
        return closed
          ? { ent: { type: 'circle', c: uvIn(F, cW), r: round(g.r, 4) }, pts3: [] }
          : { ent: { type: 'arc', a: uvIn(F, aW), m: uvIn(F, mW), b: uvIn(F, bW) }, pts3: [] };
      }
      const uW = aW.clone().sub(cW).normalize();
      const vW = new THREE.Vector3().crossVectors(cnW, uW).normalize();
      const angOf = (p) => { const d = p.clone().sub(cW); return Math.atan2(d.dot(vW), d.dot(uW)); };
      const normA = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let span = Math.PI * 2;
      if (!closed) {
        const am = normA(angOf(mW)), ab = normA(angOf(bW));
        span = ab > 1e-6 ? (am <= ab + 1e-4 ? ab : ab - Math.PI * 2) : Math.PI * 2;
      }
      const N = 24, pts = [], pts3 = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * span;
        const pW = cW.clone().addScaledVector(uW, Math.cos(th) * g.r).addScaledVector(vW, Math.sin(th) * g.r);
        pts3.push(pW);
        const uv = uvIn(F, pW);
        if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv);
      }
      const en = edgeGeom2D(pts, 'CIRCLE');
      return en ? { ent: en, pts3 } : null;
    }
    const src = g.pts && g.pts.length >= 2 ? g.pts : [g.a, g.b];
    const pts3 = src.map((q) => new THREE.Vector3(...q).applyMatrix4(W));
    const pts = [];
    for (const v of pts3) { const uv = uvIn(F, v); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
    const en = edgeGeom2D(pts, g.t);
    return en ? { ent: en, pts3 } : null;
  }
  function weldLoop(ents) {
    const pts = [];
    const weld = (p) => { for (const q of pts) if (SK.d2(p, q) < 1e-3) return q.slice(); pts.push(p.slice()); return p.slice(); };
    for (const e of ents) {
      if (e.type === 'line' || e.type === 'arc') { e.a = weld(e.a); e.b = weld(e.b); }
    }
    return ents;
  }
  function loopSignedArea2(segs) {
    const poly = [];
    for (const s of segs) {
      const seg = s.e.type === 'line' ? { t: 'line', a: s.a, b: s.b } : { t: 'arc', a: s.a, m: s.e.m, b: s.b };
      const pts = SK.segPoints(seg);
      for (let i = 0; i < pts.length - 1; i++) poly.push(pts[i]);
    }
    let a2 = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    return a2;
  }
  function offsetLoop2D(ents, off, isHole) {
    if (Math.abs(off) < 1e-6) return { ok: true, items: ents.map((e) => ({ src: e, ent: deepClone(e) })) };
    const dLoop = isHole ? -off : off;
    if (ents.length === 1 && ents[0].type === 'circle') {
      const r = SKO.offsetShape(ents[0], dLoop);
      return r.ok ? { ok: true, items: [{ src: ents[0], ent: r.ent }] } : r;
    }
    if (ents.length === 1 && ents[0].type === 'spline' && ents[0].closed) {
      const P = ents[0].pts || [];
      let a2 = 0;
      for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
      const r = SKO.offsetShape(ents[0], a2 >= 0 ? -dLoop : dLoop);
      return r.ok ? { ok: true, items: [{ src: ents[0], ent: r.ent }] } : r;
    }
    if (ents.every((e) => e.type === 'line' || e.type === 'arc')) {
      const ch = SKO.chainOf(ents, ents[0]);
      if (!ch.closed || ch.segs.length !== ents.length) return { ok: false, why: 'Der Umriss ist nicht geschlossen – Versatz geht hier nicht.' };
      const a2 = loopSignedArea2(ch.segs);
      const sd = a2 >= 0 ? -dLoop : dLoop;
      return SKO.offsetChain(ch, sd, 'sharp');
    }
    return { ok: false, why: 'Für diese gemischte Kontur gibt es keinen Versatz.' };
  }
  async function projectFaceAt(hit) {
    if (!hit || !hit.node || hit.faceIdx == null || hit.faceIdx < 0) return;
    const r = App.results.get(hit.id); if (!r || !r.key) return;
    const fi = r.data && r.data.faces && r.data.faces[hit.faceIdx];
    if (!fi || fi.t !== 'PLANE' || !fi.n) { UI.toast('Umschalt + Klick übernimmt die Randkanten einer ebenen Fläche.', { icon: 'info' }); return; }
    const W = Model.worldMatrix(App.doc, hit.id);
    const fnW = new THREE.Vector3(...fi.n).transformDirection(W).normalize();
    if (Math.abs(fnW.dot(S.F.n)) < 1e-3) { UI.toast('Diese Fläche steht senkrecht auf der Skizzen-Ebene.', { icon: 'info' }); return; }
    const F = S.F;
    let loops;
    try { loops = await Kernel.call('faceLoops', { key: r.key, faceIdx: hit.faceIdx }); } catch (e) { UI.toast('Die Flächenkanten konnte ich nicht lesen: ' + (e.message || e), { kind: 'bad' }); return; }
    if (!S || S.F !== F) return;
    if (!loops || !loops.length) { UI.toast('Diese Fläche hat keine Kanten.', { icon: 'info' }); return; }
    const off = Number(S.projOff) || 0;
    const own = S.ctx.editId ? Model.topOf(App.doc, S.ctx.editId) : null;
    const canLink = !!(Model.find(App.doc, hit.id) && !(own && own.id === hit.id));
    const addedEnts = [];
    let skippedHoles = 0;
    for (let li = 0; li < loops.length; li++) {
      const isHole = li > 0;
      const loopEnts = [];
      const baseLinks = new Map();
      let tmpIdx = 0;
      for (const g of loops[li] || []) {
        const res = faceEdgeTo2D(g, W, F, fnW);
        if (!res) continue;
        const tmp = { id: '_tmp_' + li + '_' + (tmpIdx++), ...res.ent };
        if (S.construction) tmp.con = true;
        loopEnts.push(tmp);
        if (canLink) baseLinks.set(tmp.id, edgeLink(hit.id, g, res.pts3));
      }
      if (!loopEnts.length) continue;
      weldLoop(loopEnts);
      let items;
      if (Math.abs(off) >= 1e-6) {
        const oRes = offsetLoop2D(loopEnts, off, isHole);
        if (!oRes.ok) {
          if (!isHole) { UI.toast(oRes.why, { kind: 'bad' }); return; }
          skippedHoles++;
          continue;
        }
        items = oRes.items;
      } else {
        items = loopEnts.map((e) => ({ src: e, ent: deepClone(e) }));
      }
      const loopKey = canLink && Math.abs(off) >= 1e-6 ? uid('fl') : null;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const ne = { id: uid('e'), ...it.ent };
        if (S.construction) ne.con = true;
        if (canLink && it.src && baseLinks.has(it.src.id)) {
          const bl = baseLinks.get(it.src.id);
          if (Math.abs(off) >= 1e-6) ne.link = { ...bl, off: round(off, 4), fl: loopKey, fi: idx, fn: items.length, hole: isHole };
          else ne.link = bl;
        }
        addedEnts.push(ne);
      }
    }
    if (!addedEnts.length) { UI.toast('Keine übernehmbaren Kanten auf dieser Fläche gefunden.', { icon: 'info' }); return; }
    pushUndo();
    const addedFixes = [];
    for (const ne of addedEnts) {
      S.ents.push(ne);
      const ks = Solver.varsOf(ne);
      if (ne.type !== 'spline' && ks) {
        const fx = { id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) };
        S.cons.push(fx); addedFixes.push(fx);
      }
    }
    const res = reapply();
    if (res && !res.ok) {
      S.cons = S.cons.filter((c) => !addedFixes.includes(c));
      reapply();
    }
    Viewer.highlightFace('hover', null, null);
    render(); Panels.renderRight();
    const cnt = { line: 0, arc: 0, circle: 0, spline: 0 };
    for (const e of addedEnts) if (cnt[e.type] != null) cnt[e.type]++;
    const parts = [];
    if (cnt.line) parts.push(`${cnt.line} ${cnt.line === 1 ? 'Linie' : 'Linien'}`);
    if (cnt.arc) parts.push(`${cnt.arc} ${cnt.arc === 1 ? 'Bogen' : 'Bögen'}`);
    if (cnt.circle) parts.push(`${cnt.circle} ${cnt.circle === 1 ? 'Kreis' : 'Kreise'}`);
    if (cnt.spline) parts.push(`${cnt.spline} ${cnt.spline === 1 ? 'Spline' : 'Splines'}`);
    let msg = `Fläche übernommen: ${parts.join(', ')}`;
    if (Math.abs(off) >= 1e-6) msg += ` (Versatz ${off > 0 ? '+' : ''}${Units.fmtLenU(off, 2)})`;
    msg += canLink ? ' – bleibt mit dem Körper verbunden.' : '.';
    if (skippedHoles) msg += ` ${skippedHoles} ${skippedHoles === 1 ? 'Loch war' : 'Löcher waren'} für diesen Versatz zu klein.`;
    UI.toast(msg, { icon: 'check', ms: 3200 });
  }
  function projectAt(ev) {
    const inp = $('#proj-off'); if (inp && document.activeElement === inp) inp.blur();
    if (ev.shiftKey) {
      const fhit = Viewer.pick(ev.clientX, ev.clientY, { noEdges: true, solidsOnly: true });
      if (fhit && fhit.faceIdx >= 0 && fhit.node) { projectFaceAt(fhit); return; }
      UI.toast('Klick mit gedrückter Umschalt-Taste auf eine ebene Körperfläche.', { icon: 'info' });
      return;
    }
    const hit = Viewer.pick(ev.clientX, ev.clientY, { edgePx: 9 });
    if (hit && hit.edgeIdx == null && hit.faceIdx >= 0 && hit.node && hit.node.role !== 'hole') { sectionAt(hit); return; }
    if (!hit || hit.edgeIdx == null || !hit.node) { UI.toast('Klick genau auf eine Kante eines Körpers – oder auf eine Fläche, um den ganzen Schnitt zu übernehmen.', { icon: 'info' }); return; }
    const pts3 = edgeWorldPts(hit.node.data, hit.edgeIdx, hit.node.obj.matrixWorld);
    const pts = []; for (const v of pts3) { const uv = uvIn(S.F, v); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
    if (pts.length < 2) { UI.toast('Diese Kante steht senkrecht auf der Skizze – sie wäre nur ein Punkt.', { icon: 'info' }); return; }
    const g = hit.node.data.edges[hit.edgeIdx] || {};
    const en = edgeGeom2D(pts, g.t); if (!en) return;
    // verbunden: wandert mit, wenn sich der Körper ändert (nicht beim Körper, zu dem diese Skizze selbst gehört)
    const own = S.ctx.editId ? Model.topOf(App.doc, S.ctx.editId) : null;
    if (Model.find(App.doc, hit.id) && !(own && own.id === hit.id)) en.link = edgeLink(hit.id, g, pts3);
    const ne = addEnt(en, { noMirror: true });
    const ks = Solver.varsOf(ne);
    if (ne.type !== 'spline' && ks) S.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) });
    const r = reapply(); if (r && !r.ok) { S.cons = S.cons.filter((c) => !(c.type === 'fix' && c.refs[0].e === ne.id)); reapply(); }
    UI.toast({ line: 'Kante als Linie übernommen.', arc: 'Kante als Bogen übernommen.', circle: 'Kante als Kreis übernommen.', spline: 'Kante als Spline übernommen.' }[ne.type] + (ne.link ? ' Sie bleibt mit dem Körper verbunden.' : ''), { icon: 'check', ms: 2200 });
    render(); Panels.renderRight();
  }
  // ---------- Umriss holen (SK-42) & Schnittkurve zweier Flächen (SK-43) ----------
  const relinkSigMemo = new Map();
  const lostLinkGroups = new Map();
  let relinkAsyncPromise = null;
  let asyncRelinkGen = 0;
  let asyncRelinkRounds = 0;

  function linkCountsMsg(ents) {
    const cnt = { line: 0, arc: 0, circle: 0, spline: 0 };
    for (const e of ents) if (cnt[e.type] != null) cnt[e.type]++;
    const parts = [];
    if (cnt.line) parts.push(`${cnt.line} ${cnt.line === 1 ? 'Linie' : 'Linien'}`);
    if (cnt.arc) parts.push(`${cnt.arc} ${cnt.arc === 1 ? 'Bogen' : 'Bögen'}`);
    if (cnt.circle) parts.push(`${cnt.circle} ${cnt.circle === 1 ? 'Kreis' : 'Kreise'}`);
    if (cnt.spline) parts.push(`${cnt.spline} ${cnt.spline === 1 ? 'Spline' : 'Splines'}`);
    return parts.join(', ');
  }
  function silEdgesToEnts(edges, con) {
    const out = [];
    for (const g of edges || []) {
      let en = null;
      if (g.t === 'LINE' && Array.isArray(g.a) && Array.isArray(g.b)) {
        const a = [round(g.a[0], 4), round(g.a[1], 4)], b = [round(g.b[0], 4), round(g.b[1], 4)];
        if (SK.d2(a, b) >= 1e-4) en = { type: 'line', a, b };
      } else if (g.t === 'CIRCLE' && g.full && Array.isArray(g.c) && g.r > 1e-4) {
        en = { type: 'circle', c: [round(g.c[0], 4), round(g.c[1], 4)], r: round(g.r, 4) };
      } else if (Array.isArray(g.pts) && g.pts.length >= 2) {
        const pts = [];
        for (const q of g.pts) {
          const uv = [round(q[0], 4), round(q[1], 4)];
          if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv);
        }
        if (pts.length >= 2) en = edgeGeom2D(pts, g.t);
      }
      if (!en) continue;
      if (en.type === 'spline' && en.closed && (!en.pts || en.pts.length < 3)) delete en.closed;
      if (con) en.con = true;
      out.push(en);
    }
    return weldLoop(out);
  }
  function icEdgesToEnts(edges, F, con) {
    const out = [];
    for (const g of edges || []) {
      const pts = [];
      for (const q of g.pts || []) {
        const uv = uvIn(F, new THREE.Vector3(...q));
        if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv);
      }
      if (pts.length < 2) continue;
      let plen = 0;
      for (let i = 1; i < pts.length; i++) plen += SK.d2(pts[i - 1], pts[i]);
      if (plen < 1e-3) continue;
      const en = edgeGeom2D(pts, g.t);
      if (!en) continue;
      if (en.type === 'spline' && en.closed && (!en.pts || en.pts.length < 3)) delete en.closed;
      if (con) en.con = true;
      out.push(en);
    }
    return out;
  }
  function faceLinkSig(id, faceIdx) {
    const r = App.results.get(id);
    const fi = r && r.data && r.data.faces && r.data.faces[faceIdx];
    if (!fi || !fi.c) return null;
    const sig = {
      id,
      t: fi.t || null,
      c: fi.c.map((v) => round(v, 5)),
      ...(fi.n ? { n: fi.n.map((v) => round(v, 5)) } : {}),
      ...(fi.r != null ? { r: round(fi.r, 5) } : {}),
      ...(fi.tid ? { tid: fi.tid } : {}),
    };
    return sig;
  }
  function resolveFaceLink(sig) {
    if (!sig || !sig.id || !App.doc) return -1;
    const rf = Model.find(App.doc, sig.id);
    if (!rf || rf.item.suppressed) return -1;
    const r = App.results.get(sig.id);
    if (!r || !r.data || !Array.isArray(r.data.faces)) return -1;
    const faces = r.data.faces;
    if (sig.tid) {
      const wantBase = String(sig.tid).split('|')[0];
      const i1 = faces.findIndex((f) => f && f.tid === sig.tid && (!sig.t || f.t === sig.t));
      if (i1 >= 0) return i1;
      const i2 = faces.findIndex((f) => f && f.tid && String(f.tid).split('|')[0] === wantBase && (!sig.t || f.t === sig.t));
      if (i2 >= 0) return i2;
    }
    if (!Array.isArray(sig.c)) return -1;
    const bb = r.data.bbox;
    const size = bb ? Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) : 100;
    const maxD = Math.max(5, 0.6 * size);
    let best = -1, bs = Infinity;
    for (let i = 0; i < faces.length; i++) {
      const fc = faces[i];
      if (!fc || !fc.c || (sig.t && fc.t !== sig.t)) continue;
      if (sig.t === 'PLANE' && sig.n && fc.n) {
        if (fc.n[0] * sig.n[0] + fc.n[1] * sig.n[1] + fc.n[2] * sig.n[2] < 0.98) continue;
      }
      const d = Math.hypot(fc.c[0] - sig.c[0], fc.c[1] - sig.c[1], fc.c[2] - sig.c[2]);
      if (d <= maxD && d < bs) { bs = d; best = i; }
    }
    return best;
  }
  async function computeSilhouetteEnts(bodyId, F, con) {
    const r = App.results.get(bodyId);
    if (!r || !r.key) return null;
    const WI = Model.worldMatrix(App.doc, bodyId).clone().invert();
    const oL = F.o.clone().applyMatrix4(WI).toArray();
    const xL = F.x.clone().transformDirection(WI).normalize().toArray();
    const nL = F.n.clone().transformDirection(WI).normalize().toArray();
    const edges = await Kernel.call('silhouette', { key: r.key, o: oL, x: xL, n: nL });
    return silEdgesToEnts(edges, con);
  }
  async function computeFaceIntersectEnts(sigA, sigB, F, con, optIdxA = null, optIdxB = null) {
    const idxA = optIdxA != null && optIdxA >= 0 ? optIdxA : resolveFaceLink(sigA);
    const idxB = optIdxB != null && optIdxB >= 0 ? optIdxB : resolveFaceLink(sigB);
    if (idxA < 0 || idxB < 0) return { ok: false, reason: 'faceMissing' };
    if (sigA.id === sigB.id && idxA === idxB) return { ok: false, reason: 'sameFace' };
    const rA = App.results.get(sigA.id), rB = App.results.get(sigB.id);
    if (!rA || !rA.key || !rB || !rB.key) return { ok: false, reason: 'notReady' };
    const wA = Model.worldMatrix(App.doc, sigA.id), wB = Model.worldMatrix(App.doc, sigB.id);
    const edges = await Kernel.call('faceIntersect', {
      a: { id: sigA.id, key: rA.key, m: Model.matArr(wA), faceIdx: idxA, faceSig: sigA },
      b: { id: sigB.id, key: rB.key, m: Model.matArr(wB), faceIdx: idxB, faceSig: sigB },
      scene: Model.kernelScene(App.doc),
    });
    const ents = icEdgesToEnts(edges, F, con);
    if (!ents.length) return { ok: false, reason: 'noIntersect' };
    return { ok: true, ents, sigA: faceLinkSig(sigA.id, idxA) || sigA, sigB: faceLinkSig(sigB.id, idxB) || sigB };
  }
  async function projectSilhouette(bodyId) {
    if (!S || !bodyId) return false;
    const F = S.F;
    let ents;
    try { ents = await computeSilhouetteEnts(bodyId, F, !!S.construction); }
    catch (err) { UI.toast('Umriss konnte nicht gerechnet werden: ' + ((err && err.message) || err), { kind: 'bad' }); return false; }
    if (!S || S.F !== F) return false;
    if (!ents || !ents.length) { UI.toast(T('sk.toast.silEmpty'), { icon: 'info' }); return false; }
    const own = S.ctx.editId ? Model.topOf(App.doc, S.ctx.editId) : null;
    const canLink = !!(Model.find(App.doc, bodyId) && !(own && own.id === bodyId));
    const grp = uid('sl');
    pushUndo();
    const addedFixes = [];
    for (const base of ents) {
      const ne = { id: uid('e'), ...base };
      if (canLink) ne.link = { kind: 'silhouette', id: bodyId, grp, con: !!S.construction };
      S.ents.push(ne);
      const ks = Solver.varsOf(ne);
      if (ne.type !== 'spline' && ks) {
        const fx = { id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) };
        S.cons.push(fx);
        addedFixes.push(fx);
      }
    }
    const r = reapply();
    if (r && !r.ok) {
      S.cons = S.cons.filter((c) => !addedFixes.includes(c));
      reapply();
    }
    Viewer.highlightFace('hover', null, null);
    render(); Panels.renderRight();
    UI.toast(T('sk.toast.silDone', { parts: linkCountsMsg(ents), linked: canLink ? ' – bleibt mit dem Körper verbunden.' : '.' }), { icon: 'check', ms: 3000 });
    return true;
  }
  async function silhouetteAt(ev) {
    const hit = Viewer.pick(ev.clientX, ev.clientY, { noEdges: true, solidsOnly: true });
    if (!hit || !hit.id || !hit.node || hit.node.role === 'hole') {
      UI.toast(T('sk.toast.silClickBody'), { icon: 'info' });
      return;
    }
    await projectSilhouette(hit.id);
  }
  async function projectFaceIntersect(pickA, pickB) {
    if (!S || !pickA || !pickB) return false;
    if (pickA.id === pickB.id && pickA.faceIdx === pickB.faceIdx) {
      UI.toast(T('sk.toast.icSameFace'), { icon: 'info' });
      return false;
    }
    const sigA = faceLinkSig(pickA.id, pickA.faceIdx);
    const sigB = faceLinkSig(pickB.id, pickB.faceIdx);
    if (!sigA || !sigB) {
      UI.toast(T('sk.toast.icClickFace'), { icon: 'info' });
      return false;
    }
    const F = S.F;
    let res;
    try { res = await computeFaceIntersectEnts(sigA, sigB, F, !!S.construction, pickA.faceIdx, pickB.faceIdx); }
    catch (err) { UI.toast('Schnittkurve konnte nicht gerechnet werden: ' + ((err && err.message) || err), { kind: 'bad' }); return false; }
    if (!S || S.F !== F) return false;
    S.icPick = null;
    Viewer.highlightFace('sel', null, null);
    Viewer.highlightFace('hover', null, null);
    UI.hint(hintFor('intersect'));
    if (!res.ok) {
      UI.toast(T(res.reason === 'sameFace' ? 'sk.toast.icSameFace' : 'sk.toast.icEmpty'), { icon: 'info' });
      Panels.renderRight();
      return false;
    }
    const own = S.ctx.editId ? Model.topOf(App.doc, S.ctx.editId) : null;
    const canLink = !!(Model.find(App.doc, pickA.id) && Model.find(App.doc, pickB.id) && !(own && (own.id === pickA.id || own.id === pickB.id)));
    const grp = uid('ic');
    pushUndo();
    const addedFixes = [];
    for (const base of res.ents) {
      const ne = { id: uid('e'), ...base };
      if (canLink) ne.link = { kind: 'faceIntersect', id: pickA.id, id2: pickB.id, a: res.sigA, b: res.sigB, grp, con: !!S.construction };
      S.ents.push(ne);
      const ks = Solver.varsOf(ne);
      if (ne.type !== 'spline' && ks) {
        const fx = { id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) };
        S.cons.push(fx);
        addedFixes.push(fx);
      }
    }
    const r = reapply();
    if (r && !r.ok) {
      S.cons = S.cons.filter((c) => !addedFixes.includes(c));
      reapply();
    }
    render(); Panels.renderRight();
    UI.toast(T('sk.toast.icDone', { parts: linkCountsMsg(res.ents), linked: canLink ? ' – bleibt mit beiden Flächen verbunden.' : '.' }), { icon: 'check', ms: 3000 });
    return true;
  }
  async function intersectAt(ev) {
    const hit = Viewer.pick(ev.clientX, ev.clientY, { noEdges: true, solidsOnly: true });
    if (!hit || !hit.id || hit.faceIdx == null || hit.faceIdx < 0 || !hit.node || hit.node.role === 'hole') {
      UI.toast(T('sk.toast.icClickFace'), { icon: 'info' });
      return;
    }
    if (!S.icPick) {
      S.icPick = { id: hit.id, faceIdx: hit.faceIdx };
      Viewer.highlightFace('sel', hit.id, hit.faceIdx);
      UI.hint(hintFor('intersect'));
      Panels.renderRight();
      return;
    }
    if (S.icPick.id === hit.id && S.icPick.faceIdx === hit.faceIdx) {
      UI.toast(T('sk.toast.icSameFace'), { icon: 'info' });
      return;
    }
    const first = S.icPick;
    await projectFaceIntersect(first, { id: hit.id, faceIdx: hit.faceIdx });
  }
  function entCenter(e) {
    if (!e) return [0, 0];
    if (e.type === 'line') return [(e.a[0] + e.b[0]) * 0.5, (e.a[1] + e.b[1]) * 0.5];
    if (e.type === 'circle') return e.c || [0, 0];
    if (e.type === 'arc') return e.m || [(e.a[0] + e.b[0]) * 0.5, (e.a[1] + e.b[1]) * 0.5];
    if (e.type === 'spline' && Array.isArray(e.pts) && e.pts.length) {
      let sx = 0, sy = 0;
      for (const p of e.pts) { sx += p[0]; sy += p[1]; }
      return [sx / e.pts.length, sy / e.pts.length];
    }
    return [0, 0];
  }
  function applyGroupUpdate(sk, grp, freshEnts, makeLink) {
    const oldEnts = (sk.ents || []).filter((e) => e.link && e.link.grp === grp);
    if (!oldEnts.length || !freshEnts || !freshEnts.length) return false;
    const linkMatch = (o, n) => {
      const nl = makeLink(n);
      return JSON.stringify(o.link) === JSON.stringify(nl);
    };
    if (oldEnts.length === freshEnts.length) {
      const used = new Set();
      let allSame = true;
      for (const o of oldEnts) {
        let found = -1;
        for (let j = 0; j < freshEnts.length; j++) {
          if (!used.has(j) && sameGeom(o, freshEnts[j]) && linkMatch(o, freshEnts[j])) { found = j; break; }
        }
        if (found < 0) { allSame = false; break; }
        used.add(found);
      }
      if (allSame) return false;
    }
    const usedFresh = new Set();
    const matchedOld = new Map();
    for (const o of oldEnts) {
      const oc = entCenter(o);
      let best = -1, bd = Infinity;
      for (let j = 0; j < freshEnts.length; j++) {
        if (usedFresh.has(j) || freshEnts[j].type !== o.type) continue;
        const d = SK.d2(oc, entCenter(freshEnts[j]));
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) {
        usedFresh.add(best);
        matchedOld.set(o.id, freshEnts[best]);
      }
    }
    const removedIds = new Set();
    const geomKeys = ['a', 'b', 'm', 'c', 'r', 'pts', 'closed'];
    for (const o of oldEnts) {
      const ne = matchedOld.get(o.id);
      if (!ne) { removedIds.add(o.id); continue; }
      for (const k of geomKeys) {
        if (ne[k] != null) o[k] = deepClone(ne[k]);
        else delete o[k];
      }
      o.link = makeLink(ne);
      const ks = Solver.varsOf(o);
      if (o.type === 'spline') {
        sk.cons = (sk.cons || []).filter((c) => !(c.type === 'fix' && c.refs && c.refs[0] && c.refs[0].e === o.id));
      } else if (ks) {
        let hasFix = false;
        for (const c of sk.cons || []) {
          if (c.type === 'fix' && c.refs && c.refs[0] && c.refs[0].e === o.id) {
            c.at = Object.fromEntries(ks.map((k) => [k, Solver.getK(o, k)]));
            hasFix = true;
          }
        }
        if (!hasFix) {
          sk.cons = sk.cons || [];
          sk.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: o.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(o, k)])) });
        }
      }
    }
    if (removedIds.size) {
      sk.ents = (sk.ents || []).filter((e) => !removedIds.has(e.id));
      sk.cons = (sk.cons || []).filter((c) => !c.refs || !c.refs.some((r) => r && removedIds.has(r.e)));
      sk.dims = (sk.dims || []).filter((d) => !removedIds.has(d.e) && !(d.refs || []).some((r) => r && removedIds.has(r.e)));
    }
    const baseCon = !!oldEnts[0].con;
    for (let j = 0; j < freshEnts.length; j++) {
      if (usedFresh.has(j)) continue;
      const base = freshEnts[j];
      const ne = { id: uid('e'), ...deepClone(base), ...(baseCon ? { con: true } : {}), link: makeLink(base) };
      sk.ents.push(ne);
      const ks = Solver.varsOf(ne);
      if (ne.type !== 'spline' && ks) {
        sk.cons = sk.cons || [];
        sk.cons.push({ id: uid('k'), type: 'fix', refs: [{ e: ne.id }], at: Object.fromEntries(ks.map((k) => [k, Solver.getK(ne, k)])) });
      }
    }
    return true;
  }
  async function rebindSilhouette(itemId, grp, newBodyId) {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item.p || !f.item.p.sketch) return { ok: false, why: 'Skizze nicht gefunden.' };
    const own = Model.topOf(App.doc, itemId);
    if (own && own.id === newBodyId) return { ok: false, why: 'Wähle einen anderen Körper als diese Skizze selbst.' };
    const sk = f.item.p.sketch;
    const old0 = (sk.ents || []).find((e) => e.link && e.link.grp === grp);
    if (!old0) return { ok: false, why: 'Übernommener Umriss nicht gefunden.' };
    const F = frameWorld(sk.plane, Model.worldMatrix(App.doc, itemId));
    let fresh;
    try { fresh = await computeSilhouetteEnts(newBodyId, F, !!old0.con); }
    catch (err) { return { ok: false, why: (err && err.message) || 'Umriss konnte nicht gerechnet werden.' }; }
    if (!fresh || !fresh.length) return { ok: false, why: T('sk.toast.silEmpty') };
    lostLinkGroups.delete(`${itemId}:${grp}`);
    relinkSigMemo.delete(`${itemId}:${grp}`);
    App.change('Übernommenen Umriss neu gewählt', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn || !fn.item.p || !fn.item.p.sketch) return false;
      applyGroupUpdate(fn.item.p.sketch, grp, fresh, () => ({ kind: 'silhouette', id: newBodyId, grp, con: !!old0.con }));
    });
    return { ok: true };
  }
  async function rebindFaceIntersect(itemId, grp, pickA, pickB) {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item.p || !f.item.p.sketch) return { ok: false, why: 'Skizze nicht gefunden.' };
    if (!pickA || !pickB || (pickA.id === pickB.id && pickA.faceIdx === pickB.faceIdx)) {
      return { ok: false, why: T('sk.toast.icSameFace') };
    }
    const own = Model.topOf(App.doc, itemId);
    if (own && (own.id === pickA.id || own.id === pickB.id)) return { ok: false, why: 'Wähle Flächen anderer Körper.' };
    const sigA = faceLinkSig(pickA.id, pickA.faceIdx), sigB = faceLinkSig(pickB.id, pickB.faceIdx);
    if (!sigA || !sigB) return { ok: false, why: T('sk.toast.icClickFace') };
    const sk = f.item.p.sketch;
    const old0 = (sk.ents || []).find((e) => e.link && e.link.grp === grp);
    if (!old0) return { ok: false, why: 'Übernommene Schnittkurve nicht gefunden.' };
    const F = frameWorld(sk.plane, Model.worldMatrix(App.doc, itemId));
    let res;
    try { res = await computeFaceIntersectEnts(sigA, sigB, F, !!old0.con, pickA.faceIdx, pickB.faceIdx); }
    catch (err) { return { ok: false, why: (err && err.message) || 'Schnittkurve konnte nicht gerechnet werden.' }; }
    if (!res.ok) return { ok: false, why: T('sk.toast.icEmpty') };
    lostLinkGroups.delete(`${itemId}:${grp}`);
    relinkSigMemo.delete(`${itemId}:${grp}`);
    App.change('Übernommene Schnittkurve neu gewählt', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn || !fn.item.p || !fn.item.p.sketch) return false;
      applyGroupUpdate(fn.item.p.sketch, grp, res.ents, () => ({
        kind: 'faceIntersect', id: pickA.id, id2: pickB.id, a: res.sigA, b: res.sigB, grp, con: !!old0.con,
      }));
    });
    return { ok: true };
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
    if (!e || !n || e.type !== n.type || !!e.closed !== !!n.closed) return false;
    const close = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => (Array.isArray(v) ? close(v, b[i]) : Math.abs(v - b[i]) < 1e-4));
    for (const k of ['a', 'b', 'm', 'c']) if (n[k] && !close(e[k], n[k])) return false;
    if (n.r != null && Math.abs(e.r - n.r) > 1e-4) return false;
    if (n.pts && !close(e.pts, n.pts)) return false;
    return true;
  }
  // Prüft rein lesend, ob eine verbundene Körperkante, ein Umriss oder eine Schnittkurve ihr Ziel verloren hat (KP-12)
  function isLinkLost(it, e) {
    if (!e || !e.link || !e.link.id || !App.doc) return false;
    const L = e.link;
    if (L.frozen) return false;
    if (L.kind === 'silhouette') {
      const rf = Model.find(App.doc, L.id);
      if (!rf || rf.item.suppressed) return true;
      return !!(L.grp && lostLinkGroups.has(`${it.id}:${L.grp}`));
    }
    if (L.kind === 'faceIntersect') {
      const rfA = Model.find(App.doc, L.id);
      const rfB = Model.find(App.doc, L.id2 || (L.b && L.b.id));
      if (!rfA || rfA.item.suppressed || !rfB || rfB.item.suppressed) return true;
      if (L.a && App.results.has(L.a.id) && resolveFaceLink(L.a) < 0) return true;
      if (L.b && App.results.has(L.b.id) && resolveFaceLink(L.b) < 0) return true;
      return !!(L.grp && lostLinkGroups.has(`${it.id}:${L.grp}`));
    }
    const rf = Model.find(App.doc, L.id);
    if (!rf || rf.item.suppressed) return true;
    if (!App.results.has(L.id)) return false;
    const sk = it && it.p && it.p.sketch; if (!sk || !sk.plane) return false;
    const F = frameWorld(sk.plane, Model.worldMatrix(App.doc, it.id));
    return !relinkGeom(e, F);
  }
  function linkPointsWorld(it, e) {
    const sk = it && it.p && it.p.sketch; if (!sk || !sk.plane || !e) return [];
    const F = frameWorld(sk.plane, Model.worldMatrix(App.doc, it.id));
    return SK.segsOf(e).flatMap((s) => SK.segPoints(s)).map((q) => F.o.clone().addScaledVector(F.x, q[0]).addScaledVector(F.y, q[1]).toArray());
  }
  function rebindLink(itemId, entId, targetId, edgeIdx) {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item.p || !f.item.p.sketch) return { ok: false, why: 'Skizze nicht gefunden.' };
    const r = App.results.get(targetId);
    if (!r || !r.data || !r.data.edges || !r.data.edges[edgeIdx]) return { ok: false, why: 'Kante nicht gefunden.' };
    const g = r.data.edges[edgeIdx];
    const W = Model.worldMatrix(App.doc, targetId);
    const pts3 = edgeWorldPts(r.data, edgeIdx, W);
    if (pts3.length < 2) return { ok: false, why: 'Kante hat keine Geometrie.' };
    const sk = f.item.p.sketch;
    const F = frameWorld(sk.plane, Model.worldMatrix(App.doc, itemId));
    const pts = []; for (const v of pts3) { const uv = uvIn(F, v); if (!pts.length || SK.d2(pts[pts.length - 1], uv) > 1e-4) pts.push(uv); }
    const en = edgeGeom2D(pts, g.t);
    if (!en) return { ok: false, why: 'Kante konnte nicht in die Skizzenebene übernommen werden.' };
    const link = edgeLink(targetId, g, pts3);
    App.change('Verbundene Kante neu gewählt', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn || !fn.item.p || !fn.item.p.sketch) return false;
      const sk2 = fn.item.p.sketch;
      const orig = (sk2.ents || []).find((x) => x.id === entId); if (!orig) return false;
      const sameType = orig.type === en.type;
      if (!sameType) {
        for (const k of ['a', 'b', 'm', 'c', 'r', 'pts', 'closed']) delete orig[k];
        orig.type = en.type;
        sk2.cons = (sk2.cons || []).filter((c) => c.type === 'fix' || !c.refs || !c.refs.some((x) => x && x.e === orig.id));
        sk2.dims = (sk2.dims || []).filter((d) => !d.refs || !d.refs.some((x) => x && x.e === orig.id));
      }
      for (const k of ['a', 'b', 'm', 'c', 'r', 'pts', 'closed']) {
        if (en[k] != null) orig[k] = deepClone(en[k]);
        else delete orig[k];
      }
      orig.link = link;
      const ks = Solver.varsOf(orig);
      for (const c of sk2.cons || []) if (c.type === 'fix' && c.refs && c.refs[0] && c.refs[0].e === orig.id && ks) c.at = Object.fromEntries(ks.map((k) => [k, Solver.getK(orig, k)]));
    });
    return { ok: true };
  }
  function relinkAll() {
    if (S || !App.doc) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      const sk = it.p && it.p.sketch; if (!sk || !(sk.ents || []).some((e) => e.link)) return;
      if (!Model.isActive(App.doc, it.id)) return;
      const own = Model.topOf(App.doc, it.id), F = frameWorld(sk.plane, Model.worldMatrix(App.doc, it.id));
      const offGroups = new Map();
      for (const e of sk.ents) {
        if (!e.link || e.link.frozen || e.link.kind === 'silhouette' || e.link.kind === 'faceIntersect' || (own && own.id === e.link.id)) continue;
        if (e.link.off && e.link.fl) {
          if (!offGroups.has(e.link.fl)) offGroups.set(e.link.fl, []);
          offGroups.get(e.link.fl).push(e);
          continue;
        }
        const g = relinkGeom(e, F); if (!g) continue;
        if (!sameGeom(e, g.ent)) jobs.push({ id: it.id, eid: e.id, g });
      }
      for (const grp of offGroups.values()) {
        const ref0 = grp[0].link;
        if (ref0.frozen || (ref0.fn && grp.length !== ref0.fn)) continue;
        grp.sort((a, b) => (a.link.fi || 0) - (b.link.fi || 0));
        const resList = [];
        let ok = true;
        for (const e of grp) { const g = relinkGeom(e, F); if (!g) { ok = false; break; } resList.push(g); }
        if (!ok) continue;
        const base = resList.map((g, i) => ({ id: '_r' + i, ...g.ent, ...(grp[0].con ? { con: true } : {}) }));
        weldLoop(base);
        const oRes = offsetLoop2D(base, ref0.off, !!ref0.hole);
        if (!oRes.ok || oRes.items.length !== grp.length) continue;
        for (let i = 0; i < grp.length; i++) {
          const orig = grp[i], ne = oRes.items[i].ent;
          const link = { ...resList[i].link, off: ref0.off, fl: ref0.fl, fi: i, fn: grp.length, hole: !!ref0.hole };
          if (!sameGeom(orig, ne)) jobs.push({ id: it.id, eid: orig.id, g: { ent: ne, link } });
        }
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
  function relinkAsync() {
    if (S || !App.doc) return;
    const tasks = [];
    const activeGroupKeys = new Set();
    Model.walk(App.doc.items, (it) => {
      const sk = it.p && it.p.sketch; if (!sk || !sk.plane) return;
      if (!Model.isActive(App.doc, it.id)) return;
      const own = Model.topOf(App.doc, it.id);
      const seenGrp = new Set();
      for (const e of sk.ents || []) {
        const L = e.link;
        if (!L || L.frozen || (L.kind !== 'silhouette' && L.kind !== 'faceIntersect') || !L.grp) continue;
        if (own && (own.id === L.id || (L.id2 && own.id === L.id2))) continue;
        if (seenGrp.has(L.grp)) continue;
        seenGrp.add(L.grp);
        const memoKey = `${it.id}:${L.grp}`;
        activeGroupKeys.add(memoKey);
        if (L.kind === 'silhouette') {
          const rf = Model.find(App.doc, L.id);
          const r = rf && !rf.item.suppressed ? App.results.get(L.id) : null;
          if (!r || !r.key) continue;
          const sigStr = JSON.stringify(['sil', r.key, Model.matArr(Model.worldMatrix(App.doc, L.id)), sk.plane, Model.matArr(Model.worldMatrix(App.doc, it.id)), !!L.con]);
          if (relinkSigMemo.get(memoKey) === sigStr) continue;
          tasks.push({ kind: 'silhouette', itemId: it.id, grp: L.grp, link: deepClone(L), plane: deepClone(sk.plane), itM: Model.worldMatrix(App.doc, it.id), memoKey, sigStr });
        } else {
          const idA = L.id, idB = L.id2 || (L.b && L.b.id);
          const rfA = Model.find(App.doc, idA), rfB = Model.find(App.doc, idB);
          const rA = rfA && !rfA.item.suppressed ? App.results.get(idA) : null;
          const rB = rfB && !rfB.item.suppressed ? App.results.get(idB) : null;
          if (!rA || !rA.key || !rB || !rB.key) continue;
          const idxA = resolveFaceLink(L.a), idxB = resolveFaceLink(L.b);
          const sigStr = JSON.stringify(['ic', rA.key, rB.key, idxA, idxB, Model.matArr(Model.worldMatrix(App.doc, idA)), Model.matArr(Model.worldMatrix(App.doc, idB)), sk.plane, Model.matArr(Model.worldMatrix(App.doc, it.id)), !!L.con]);
          if (relinkSigMemo.get(memoKey) === sigStr) continue;
          tasks.push({ kind: 'faceIntersect', itemId: it.id, grp: L.grp, link: deepClone(L), idxA, idxB, plane: deepClone(sk.plane), itM: Model.worldMatrix(App.doc, it.id), memoKey, sigStr });
        }
      }
    });
    for (const k of [...lostLinkGroups.keys()]) if (!activeGroupKeys.has(k)) lostLinkGroups.delete(k);
    for (const k of [...relinkSigMemo.keys()]) if (!activeGroupKeys.has(k)) relinkSigMemo.delete(k);
    if (!tasks.length) { asyncRelinkRounds = 0; return; }
    const myGen = ++asyncRelinkGen;
    const p = (async () => {
      const updates = [];
      let lostChanged = false;
      for (const t of tasks) {
        if (S || !App.doc || myGen !== asyncRelinkGen) return;
        const F = frameWorld(t.plane, t.itM);
        if (t.kind === 'silhouette') {
          let fresh = null;
          try { fresh = await computeSilhouetteEnts(t.link.id, F, !!t.link.con); } catch (_) { fresh = null; }
          if (myGen !== asyncRelinkGen || S) return;
          if (!fresh || !fresh.length) {
            if (!lostLinkGroups.has(t.memoKey)) { lostLinkGroups.set(t.memoKey, 'empty'); lostChanged = true; }
            relinkSigMemo.set(t.memoKey, t.sigStr);
            continue;
          }
          if (lostLinkGroups.delete(t.memoKey)) lostChanged = true;
          updates.push({
            itemId: t.itemId, grp: t.grp, ents: fresh, memoKey: t.memoKey, sigStr: t.sigStr,
            makeLink: () => ({ kind: 'silhouette', id: t.link.id, grp: t.grp, con: !!t.link.con }),
          });
        } else {
          if (t.idxA < 0 || t.idxB < 0 || (t.link.id === (t.link.id2 || (t.link.b && t.link.b.id)) && t.idxA === t.idxB)) {
            if (!lostLinkGroups.has(t.memoKey)) { lostLinkGroups.set(t.memoKey, 'face'); lostChanged = true; }
            relinkSigMemo.set(t.memoKey, t.sigStr);
            continue;
          }
          let res = null;
          try { res = await computeFaceIntersectEnts(t.link.a, t.link.b, F, !!t.link.con, t.idxA, t.idxB); } catch (_) { res = null; }
          if (myGen !== asyncRelinkGen || S) return;
          if (!res || !res.ok) {
            if (!lostLinkGroups.has(t.memoKey)) { lostLinkGroups.set(t.memoKey, 'empty'); lostChanged = true; }
            relinkSigMemo.set(t.memoKey, t.sigStr);
            continue;
          }
          if (lostLinkGroups.delete(t.memoKey)) lostChanged = true;
          updates.push({
            itemId: t.itemId, grp: t.grp, ents: res.ents, memoKey: t.memoKey, sigStr: t.sigStr,
            makeLink: () => ({ kind: 'faceIntersect', id: t.link.id, id2: t.link.id2, a: res.sigA, b: res.sigB, grp: t.grp, con: !!t.link.con }),
          });
        }
      }
      if (S || !App.doc || myGen !== asyncRelinkGen) return;
      for (const u of updates) relinkSigMemo.set(u.memoKey, u.sigStr);
      if (updates.length && asyncRelinkRounds < 3) {
        let changed = false;
        App.change('Übernommene Konturen nachgeführt', (doc) => {
          for (const u of updates) {
            const f = Model.find(doc, u.itemId);
            if (!f || !f.item.p || !f.item.p.sketch) continue;
            if (applyGroupUpdate(f.item.p.sketch, u.grp, u.ents, u.makeLink)) changed = true;
          }
          return changed ? undefined : false;
        }, { amend: true });
        if (changed) asyncRelinkRounds++;
        else asyncRelinkRounds = 0;
      } else {
        asyncRelinkRounds = 0;
      }
      if (lostChanged) {
        Panels.renderLeft();
        Panels.renderRight({ preserveFocus: true });
        if (typeof Timeline !== 'undefined' && Timeline.refreshLabels) Timeline.refreshLabels();
      }
    })().finally(() => {
      if (relinkAsyncPromise === p) relinkAsyncPromise = null;
    });
    relinkAsyncPromise = p;
  }
  async function whenRelinked() {
    for (let i = 0; i < 12; i++) {
      if (relinkAsyncPromise) await relinkAsyncPromise;
      if (typeof App !== 'undefined' && App.busy) {
        await new Promise((res) => setTimeout(res, 50));
        continue;
      }
      if (!relinkAsyncPromise) break;
    }
  }
  let relinkPlaneRounds = 0;
  function samePlane(a, b) {
    if (!a || !b) return false;
    const vd = (u, v) => Math.max(Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1]), Math.abs(u[2] - v[2]));
    return vd(a.o, b.o) < 1e-4 && vd(a.x, b.x) < 1e-4 && vd(a.n, b.n) < 1e-4;
  }
  function updateSketchPlaneFromFace(oldPlane, fcL, fnL) {
    const n0 = new THREE.Vector3(...(oldPlane.n || [0, 0, 1])).normalize();
    const n1 = new THREE.Vector3(...fnL).normalize();
    const x0 = new THREE.Vector3(...(oldPlane.x || [1, 0, 0])).normalize();
    const o0 = new THREE.Vector3(...(oldPlane.o || [0, 0, 0]));
    const fc = new THREE.Vector3(...fcL);
    const dp = n0.dot(n1);
    let oNew, xNew;
    if (dp > 0.9999) {
      const d = fc.clone().sub(o0).dot(n1);
      oNew = o0.clone().addScaledVector(n1, d);
      xNew = x0;
    } else if (dp < -0.9999) {
      oNew = fc;
      xNew = x0;
    } else {
      const q = new THREE.Quaternion().setFromUnitVectors(n0, n1);
      xNew = x0.clone().applyQuaternion(q);
      xNew.addScaledVector(n1, -xNew.dot(n1)).normalize();
      oNew = fc;
    }
    const r6 = (arr) => arr.map((v) => round(v, 6));
    return { o: r6(oNew.toArray()), x: r6(xNew.toArray()), n: r6(n1.toArray()) };
  }
  function relinkSketchPlanes() {
    if (S || !App.doc) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      const sk = it.p && it.p.sketch;
      const pr = sk && sk.planeRef;
      if (!sk || !sk.plane || !pr || pr.kind !== 'face' || pr.frozen) return;
      if (!Model.isActive(App.doc, it.id)) return;
      const resInfo = App.resolvedOf(it.id);
      if (resInfo && resInfo.planeRefOk === true && resInfo.plane) {
        if (!samePlane(sk.plane, resInfo.plane)) {
          jobs.push({
            id: it.id,
            plane: resInfo.plane,
            c: resInfo.faceC ? resInfo.faceC.map((v) => round(v, 5)) : pr.c,
            n: resInfo.faceN ? resInfo.faceN.map((v) => round(v, 5)) : pr.n,
          });
        }
        return;
      }
      const host = pr.id ? App.results.get(pr.id) : null;
      if (!host || !host.data || !Array.isArray(host.data.faces)) return;
      const faces = host.data.faces;
      let fc = null;
      if (pr.tid) {
        const wantBase = pr.tid.split('|')[0];
        fc = faces.find((f) => f && f.t === 'PLANE' && f.tid === pr.tid)
          || faces.find((f) => f && f.t === 'PLANE' && f.tid && f.tid.split('|')[0] === wantBase);
      }
      if (!fc && Array.isArray(pr.c) && Array.isArray(pr.n)) {
        let bestD = Infinity;
        for (const f of faces) {
          if (!f || f.t !== 'PLANE' || !f.n || !f.c) continue;
          if (f.n[0] * pr.n[0] + f.n[1] * pr.n[1] + f.n[2] * pr.n[2] < 0.995) continue;
          const d = Math.hypot(f.c[0] - pr.c[0], f.c[1] - pr.c[1], f.c[2] - pr.c[2]);
          if (d < bestD) { bestD = d; fc = f; }
        }
      }
      if (!fc || !fc.c || !fc.n) return;
      const HW = Model.worldMatrix(App.doc, pr.id);
      const PWInv = Model.parentWorld(App.doc, it.id).multiply(Model.localMatrix(it)).invert();
      const fcL = new THREE.Vector3(...fc.c).applyMatrix4(HW).applyMatrix4(PWInv).toArray();
      const fnL = new THREE.Vector3(...fc.n).transformDirection(HW).transformDirection(PWInv).normalize().toArray();
      const newPlane = updateSketchPlaneFromFace(sk.plane, fcL, fnL);
      if (!samePlane(sk.plane, newPlane)) {
        jobs.push({
          id: it.id,
          plane: newPlane,
          c: fc.c.map((v) => round(v, 5)),
          n: fc.n.map((v) => round(v, 5)),
        });
      }
    });
    if (!jobs.length) { relinkPlaneRounds = 0; return; }
    if (++relinkPlaneRounds > 3) { relinkPlaneRounds = 0; return; }
    App.change('Skizzen-Fläche nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id);
        if (!f || !f.item.p || !f.item.p.sketch) continue;
        f.item.p.sketch.plane = j.plane;
        if (f.item.p.sketch.planeRef) {
          if (j.c) f.item.p.sketch.planeRef.c = j.c;
          if (j.n) f.item.p.sketch.planeRef.n = j.n;
        }
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
    clearSel(); render(); Panels.renderRight();
  }
  function splitAt(p) {
    const hit = SK.hit(S.ents, p, pxSize() * 9);
    if (!hit || (hit.type !== 'line' && hit.type !== 'arc')) { UI.toast('Klick auf eine Linie oder einen Bogen.', { icon: 'info' }); return; }
    if (hit.blk) { UI.toast(T('sk.toast.blockExplodeFirst'), { icon: 'info' }); return; }
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
    if (!hit || hit.type !== 'line' || hit.blk) return null;
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
  function endTangent(e, k) {
    if (!e || (e.type !== 'line' && e.type !== 'arc')) return null;
    let t;
    if (e.type === 'line') { const o = k === 'a' ? e.b : e.a; t = [e[k][0] - o[0], e[k][1] - o[1]]; }
    else { const ai = SK.arcInfo(e.a, e.m, e.b); if (!ai) return null; const r = [e[k][0] - ai.c[0], e[k][1] - ai.c[1]]; const ccwAtK = k === 'b' ? ai.sweep > 0 : ai.sweep < 0; t = ccwAtK ? [-r[1], r[0]] : [r[1], -r[0]]; }
    const L = Math.hypot(t[0], t[1]); if (L < 1e-9) return null;
    return { e: e.id, k, p: e[k], t: [t[0] / L, t[1] / L] };
  }
  function tanStart(uv, tol = pxSize() * 10) {
    let best = null;
    for (const e of S.ents) {
      if (e.type !== 'line' && e.type !== 'arc') continue;
      for (const k of ['a', 'b']) {
        const d = SK.d2(e[k], uv); if (d > tol || (best && d >= best.d)) continue;
        const st = endTangent(e, k);
        if (st) best = { ...st, d };
      }
    }
    return best;
  }
  function draftTan() {
    const d = S && S.draft;
    if (!d || S.tool !== 'line' || S.lineMode === 'tan2' || !d.pts || !d.pts.length) return null;
    if (d.last) { const prev = ent(d.last.id); if (prev) return endTangent(prev, d.last.end); }
    return tanStart(d.pts[d.pts.length - 1], 1e-4);
  }
  function makeTanCon(prev, en, arcG) {
    const c = { id: uid('k'), type: 'tangent', refs: [{ e: prev.id }, { e: en.id }] };
    if (prev.type === 'arc' && en.type === 'arc') {
      const A = SK.arcInfo(prev.a, prev.m, prev.b), B = arcG || SK.arcInfo(en.a, en.m, en.b);
      if (A && B) { const d = SK.d2(A.c, B.c); c.mode = Math.abs(d - Math.abs(A.r - B.r)) < Math.abs(d - (A.r + B.r)) ? 'int' : 'ext'; }
    }
    return c;
  }
  function tanLineSnap(a, b, st) {
    if (!st) return null;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) return null;
    const dot = (dx * st.t[0] + dy * st.t[1]) / L;
    if (dot > Math.cos((8 * Math.PI) / 180)) return { p: [a[0] + st.t[0] * L, a[1] + st.t[1] * L], tip: 'tangential' };
    return null;
  }
  const LINE_ARC_HINT = '<b>Tangentialer Bogen:</b> Endpunkt klicken – der Bogen schließt ohne Knick an. <b>A</b> schaltet zurück auf Linie, <b>Enter</b> beendet.';
  function updateLineHint() {
    if (!S || S.tool !== 'line') return;
    if (S.lineMode === 'tan2') { UI.hint(T('sk.panel.lineTan2Hint')); return; }
    UI.hint(S.draft && S.draft.arc ? LINE_ARC_HINT : hintFor('line'));
  }
  function toggleLineArc() {
    if (!S || S.tool !== 'line' || S.lineMode === 'tan2' || !S.draft) return false;
    if (S.draft.arc) {
      S.draft.arc = false;
      updateLineHint();
      render();
      return true;
    }
    const st = draftTan();
    if (!st) {
      UI.toast('Zeichne zuerst ein Stück Linie – danach wechselt A auf tangentialen Bogen.', { icon: 'info', ms: 2600 });
      return true;
    }
    S.draft.arc = true;
    S.draft.hadArc = true;
    hideEntry();
    updateLineHint();
    render();
    return true;
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
  // Langloch über die Gesamtlänge: a und b sind die äußeren Enden, die Mittelpunkte rücken um den Radius hinein
  function slotInset(a, b, r) { const L = SK.d2(a, b); if (L <= 2 * r + 1e-6) return null; const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; return { a: [round(a[0] + ux * r, 4), round(a[1] + uy * r, 4)], b: [round(b[0] - ux * r, 4), round(b[1] - uy * r, 4)] }; }
  function slotR(a, b, p) { const L = SK.d2(a, b); if (L < 1e-9) return SK.d2(a, p); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; return Math.abs((p[0] - a[0]) * -uy + (p[1] - a[1]) * ux); }
  function commitDraftPolyline() { if (!S || !S.draft) return; if (S.tool === 'line') S.draft = null; else if (S.tool === 'spline') finishSpline(false); }
  // ---------- Rahmen-Auswahl (SK-10): links→rechts = ganz drin, rechts→links = berührt ----------
  function segIntersectsRect(a, b, L, T, R, B) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const clip = (p, q) => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    };
    return clip(-dx, a[0] - L) && clip(dx, R - a[0]) && clip(-dy, a[1] - T) && clip(dy, B - a[1]) && t0 <= t1;
  }
  function bandMove(e) {
    if (!S || !S.band) return;
    const b = S.band;
    if (!b.moved && Math.hypot(e.clientX - b.x, e.clientY - b.y) <= 4) return;
    b.moved = true;
    if (!b.el) { b.el = h('div', { class: 'sel-band' }); document.body.append(b.el); }
    const x0 = Math.min(b.x, e.clientX), y0 = Math.min(b.y, e.clientY), cross = e.clientX < b.x;
    Object.assign(b.el.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - b.x) + 'px', height: Math.abs(e.clientY - b.y) + 'px' });
    if (b.mode === 'stretch') { b.el.classList.remove('cross'); b.el.classList.add('stretch'); }
    else { b.el.classList.remove('stretch'); b.el.classList.toggle('cross', cross); }
  }
  function bandSelect(x1, y1, x2, y2, additive = false) {
    if (!S) return [];
    const cross = x2 < x1, L = Math.min(x1, x2), R = Math.max(x1, x2), T = Math.min(y1, y2), B = Math.max(y1, y2);
    const cr = Viewer.canvas.getBoundingClientRect();
    const toScr = (p) => { const s = Viewer.toScreen(toWorld(p[0], p[1])); return { x: s.x + cr.left, y: s.y + cr.top, behind: !!s.behind }; };
    const inBox = (q) => !q.behind && q.x >= L && q.x <= R && q.y >= T && q.y <= B;
    const hits = [];
    for (const e of S.ents) {
      if (e.type === 'point') {
        if (inBox(toScr(e.a))) hits.push(e.id);
        continue;
      }
      const pls = entPts(e);
      if (!pls.length) continue;
      let allIn = true, anyTouch = false, hasPts = false;
      for (const pl of pls) {
        if (!pl.length) continue;
        const sp = pl.map(toScr);
        hasPts = true;
        for (let i = 0; i < sp.length; i++) {
          if (inBox(sp[i])) anyTouch = true;
          else allIn = false;
          if (i > 0 && !anyTouch && !sp[i - 1].behind && !sp[i].behind && segIntersectsRect([sp[i - 1].x, sp[i - 1].y], [sp[i].x, sp[i].y], L, T, R, B)) anyTouch = true;
        }
      }
      if (hasPts && (cross ? anyTouch : allIn)) hits.push(e.id);
    }
    const next = additive ? [...selectedIds(), ...hits] : hits;
    const expandBlk = new Set(next);
    const blkIds = new Set();
    for (const id of next) { const en = ent(id); if (en && en.blk) blkIds.add(en.blk); }
    if (blkIds.size) for (const en of S.ents) if (en.blk && blkIds.has(en.blk)) expandBlk.add(en.id);
    setSel([...expandBlk]);
    S.selBlockInst = blkIds.size === 1 && ![...expandBlk].some((id) => { const en = ent(id); return en && !en.blk; }) ? [...blkIds][0] : null;
    S.selCon = null;
    render(); Panels.renderRight();
    const n = selectedIds().length;
    UI.toast(
      hits.length
        ? `${n} ${n === 1 ? 'Element' : 'Elemente'} gewählt (${cross ? 'alles, was der Rahmen berührt' : 'nur Elemente ganz im Rahmen'}).`
        : additive ? 'Im Rahmen liegt kein weiteres Element.' : 'Im Rahmen liegt kein Element.',
      { icon: 'pointer', ms: 2200 }
    );
    return selectedIds();
  }
  let lastMouse = null;
  function onMove(e) {
    if (!S) return;
    if (e.pointerType) lastPtrType = e.pointerType;
    if (S.step) {
      if (S.step.pickingFace) {
        const h2 = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: new Set(['__preview']) });
        Viewer.highlightFace('hover', h2 && h2.faceIdx >= 0 ? h2.id : null, h2 && h2.faceIdx >= 0 ? h2.faceIdx : null);
      }
      return stepMove(e);
    }
    if (S.band) return;
    const uv0 = mouseUV(e);
    if (!uv0) { if (S.tool === 'select' && isLoftLine()) loftPreview(); return; }
    lastMouse = { e, uv: uv0 };
    if (S.bgDrag) { S.bg.a = [round(S.bgDrag.a0[0] + uv0[0] - S.bgDrag.start[0], 3), round(S.bgDrag.a0[1] + uv0[1] - S.bgDrag.start[1], 3)]; render(); return; }
    if (S.tool === 'bgcal') { S.cursor = { p: uv0 }; render(); return; }
    if (S.lockedDrag) {
      if (Math.hypot(e.clientX - S.lockedDrag.x, e.clientY - S.lockedDrag.y) > 4) {
        S.lockedDrag = null;
        guardLocked();
      }
      return;
    }
    if (S.drag) {
      if (S.locked) { S.drag = null; S.dragPins = null; return; }
      if (S.drag.blockInst) {
        const sn = snap(uv0, { fine: e.shiftKey, off: e.altKey, noLot: true, pen: lastPtrType === 'pen', touch: lastPtrType === 'touch', exclude: instEnts(S.drag.blockInst).map((x) => x.id) });
        const dx = round(sn.p[0] - S.drag.start[0], 4), dy = round(sn.p[1] - S.drag.start[1], 4);
        if (Math.hypot(dx, dy) > 1e-6) S.dragged = true;
        updateBlockInst(S.drag.blockInst, { x: round(S.drag.orig.x + dx, 4), y: round(S.drag.orig.y + dy, 4) }, { noUndo: true, fast: true });
        return;
      }
      if (S.drag.handle) {
        const dh = S.drag.handle;
        const en = ent(dh.e);
        if (!en || !en.pts || !en.pts[dh.i]) { S.drag = null; S.dragPins = null; return; }
        if (!dh.activated) {
          if (!Array.isArray(en.handles)) en.handles = [];
          en.handles[dh.i] = dh.initVec.slice();
          dh.activated = true;
        }
        const p = en.pts[dh.i];
        let dx = dh.sign * (uv0[0] - p[0]), dy = dh.sign * (uv0[1] - p[1]);
        const len = Math.hypot(dx, dy);
        if (len < 0.5) {
          const u = dh.initVec, ul = Math.hypot(u[0], u[1]) || 1;
          dx = (u[0] / ul) * 0.5; dy = (u[1] / ul) * 0.5;
        } else if (angleSnapOn && !e.shiftKey && !e.altKey) {
          const ang = Math.atan2(dy, dx), step = Math.PI / 12;
          const snapped = Math.round(ang / step) * step;
          if (Math.abs(ang - snapped) < (2.5 * Math.PI) / 180) {
            dx = Math.cos(snapped) * len;
            dy = Math.sin(snapped) * len;
          }
        }
        S.dragPins = [[en.id, 'h' + dh.i + '_0', round(dx, 4)], [en.id, 'h' + dh.i + '_1', round(dy, 4)]];
        S.dragged = true;
        dragFrame(); return;
      }
      const sn = snap(uv0, { fine: e.shiftKey, off: e.altKey, noLot: true, pen: lastPtrType === 'pen', touch: lastPtrType === 'touch', exclude: S.drag.move ? [S.drag.move] : S.drag.points.map(([en]) => en.id) });
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
    if (S.tool === 'corner') { S.cornerHover = S.corner.mode === 'meet' ? null : cornerFind(uv0); if (S.corner.mode === 'meet') { const hv = SK.hit(S.ents, uv0, tolPx()); S.hoverEnt = hv && hv.type === 'line' ? hv.id : null; } S.cursor = null; render(); return; }
    if (S.tool === 'extend') { const T = extendTarget(uv0); S.extHover = T && !T.none ? T : null; S.cursor = null; render(); return; }
    if (S.tool === 'offset' && S.draft && S.draft.off) { S.offUV = uv0; S.cursor = null; render(); return; }
    if (S.liveMirPick) {
      const hv = SK.hit(S.ents, uv0, pxSize() * 9);
      S.hoverEnt = hv && hv.type === 'line' ? hv.id : null;
      S.cursor = null; render(); return;
    }
    if (S.tool === 'stretch') { S.cursor = null; return; }
    if (S.tool === 'patfill') {
      const regs = SK.regions(S.ents), r = SK.regionAt(regs, uv0);
      S.fill.hoverRegionKey = r ? r.key : null;
      S.cursor = null; render(); return;
    }
    if (S.tool === 'bridge') { S.bridge.hoverEnd = pickCurveEnd(uv0, pxSize() * 14, S.bridge.first); S.cursor = null; render(); return; }
    if (S.tool === 'offset' || S.tool === 'mirror' || S.tool === 'patrect' || S.tool === 'patcirc' || S.tool === 'patcurve' || S.tool === 'xmove') {
      const hv = SK.hit(S.ents, uv0, pxSize() * 9);
      S.hoverEnt = hv && !(S.tool === 'patcurve' && S.patPickCurve && !SKO.isCurveEnt(hv)) ? hv.id : null;
      S.cursor = (S.tool === 'patcirc' || S.tool === 'xmove') && S.patPick ? snap(uv0, { fine: e.shiftKey, off: e.altKey, pen: lastPtrType === 'pen', touch: lastPtrType === 'touch' }) : null;
      render(); return;
    }
    if (S.tool === 'project') {
      if (e.shiftKey) {
        const h2 = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
        const fi = h2 && h2.node && h2.node.data && h2.node.data.faces && h2.node.data.faces[h2.faceIdx];
        Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? h2.id : null, fi && fi.t === 'PLANE' ? h2.faceIdx : null);
      } else {
        Viewer.highlightFace('hover', null, null);
      }
      S.cursor = null; render(); return;
    }
    if (S.tool === 'silhouette' || S.tool === 'intersect') {
      const h2 = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      const okH = h2 && h2.node && h2.node.role !== 'hole' && h2.faceIdx >= 0;
      Viewer.highlightFace('hover', okH ? h2.id : null, okH ? h2.faceIdx : null);
      S.cursor = null; render(); return;
    }
    if (S.tool === 'dim' || S.tool.startsWith('c:')) {
      S.hoverHandle = (S.tool === 'dim' && !isSimpleMode() && (S.dimMode || 'auto') === 'auto' && !S.dimFirst) ? hitSplineHandle(uv0, { all: true, allowLine: true }) : null;
      S.hoverPick = S.hoverHandle ? null : pickAt(uv0, { refs: S.tool === 'c:project', points: S.tool !== 'c:project' && S.tool !== 'c:curvature' && !(S.tool === 'dim' && S.dimMode === 'arcLen') });
      S.cursor = null; render(); return;
    }
    if (S.tool === 'select') { S.cursor = null; if (isLoftLine()) loftPreview(); return; }
    if (S.tool === 'line' && S.lineMode !== 'tan2' && S.draft && !S.draft.arc) {
      S.cursor = linePoint(uv0, e);
    } else {
      S.cursor = snap(uv0, { fine: e.shiftKey, off: e.altKey, pen: lastPtrType === 'pen', touch: lastPtrType === 'touch' });
    }
    render();
  }
  // Beim Ziehen höchstens einmal pro Bildschirmbild rechnen und zeichnen
  let dragRaf = 0;
  function dragFrame() {
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => { dragRaf = 0; if (!S || !S.dragPins) return; reapply({ fast: true, pins: S.dragPins }); render(); });
  }
  function onUp(e) {
    if (S && S.penStroke && e && e.pointerType === 'pen' && S.penStroke.id === e.pointerId) {
      const ps = S.penStroke;
      S.penStroke = null;
      if (Viewer.gestures && S.draft && S.tool === ps.tool && Math.hypot(e.clientX - ps.x, e.clientY - ps.y) > 8) {
        onDown({ clientX: e.clientX, clientY: e.clientY, button: 0, pointerId: e.pointerId, pointerType: 'pen', shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, preventDefault() {} });
        if (ps.tool === 'line' && S && S.draft) { S.draft = null; hideEntry(); updateLineHint(); render(); }
        return;
      }
    }
    if (dimBox && dimBox._inp && document.body.contains(dimBox) && !dimBox.contains(e && e.target)) {
      if (document.activeElement !== dimBox._inp) {
        dimBox._inp.focus();
        if (!dimBox._typed) dimBox._inp.select();
      }
    }
    if (S && S.band) {
      const b = S.band; clearBand();
      if (b.mode === 'stretch') {
        if (b.moved && e) {
          const L = Math.min(b.x, e.clientX), R = Math.max(b.x, e.clientX), T0 = Math.min(b.y, e.clientY), B = Math.max(b.y, e.clientY);
          const corners = [[L, T0], [R, T0], [R, B], [L, B]].map(([cx, cy]) => {
            const wp = Viewer.rayPlane(cx, cy, S.F.o, S.F.n);
            return wp ? toUV(wp) : null;
          }).filter(Boolean);
          if (corners.length === 4) {
            const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
            stretchBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
          }
        } else {
          S.stretch.box = null; S.stretch.sel = null;
          UI.hint(hintFor('stretch')); render(); Panels.renderRight();
        }
        return;
      }
      if (b.moved && e) {
        bandSelect(b.x, b.y, e.clientX, e.clientY, !!(b.shift || e.shiftKey));
      } else if (!b.shift) {
        clearSel(); S.selCon = null; render(); Panels.renderRight();
      }
      return;
    }
    if (S && S.trimming) S.trimming = false;
    if (S && S.lockedDrag) S.lockedDrag = null;
    if (S && S.bgDrag) { S.bgDrag = null; Panels.renderRight(); return; }
    if (!S || !S.drag) return;
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    if (S.dragPins) { reapply({ fast: true, pins: S.dragPins }); S.dragPins = null; }
    const moved = S.dragged; S.drag = null; S.dragged = false;
    if (!moved) S.undo.pop();   // nur geklickt, nicht gezogen
    reapply(); render(); Panels.renderRight();
    if (!moved && S.freeMode && S.sel && S.status && S.status.freeEnts && S.status.freeEnts.has(S.sel)) wiggleEnt(S.sel);
  }
  // ---------- Zahlen eintippen ----------
  let entry = null;
  function entryFields() {
    const t = S.tool, d = S.draft;
    if (!d) return null;
    if (t === 'line') return d.arc ? null : [['len', 'Länge'], ['ang', 'Winkel °']];
    if (t === 'rect' && d.r3) return null;
    if (t === 'rect') return [['w', 'Breite'], ['h', 'Höhe']];
    if (t === 'ellipse') return [['w', 'Breite'], ['h', 'Höhe']];
    if (t === 'ellarc') return !d.ax ? [['rx', 'Halbachse 1'], ['ry', 'Halbachse 2'], ['a0', 'Start °'], ['a1', 'Ende °']] : !d.ry ? [['ry', 'Halbachse 2'], ['a0', 'Start °'], ['a1', 'Ende °']] : d.a0 == null ? [['a0', 'Start °'], ['a1', 'Ende °']] : [['a1', 'Ende °']];
    if (t === 'conic' && d.m) return [['rho', 'Rho']];
    if (t === 'circle' && d.pts) return null;
    if (t === 'arc') return null;
    if (t === 'circle') return [['d', 'Ø']];
    if (t === 'poly') return [['d', 'Ø']];
    if (t === 'slot' && d.arcslot) return null;
    if (t === 'slot' && !d.b) return [['len', S.slotTotal ? 'Gesamtlänge' : 'Länge'], ['ang', 'Winkel °']];
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
      const isAngF = k === 'ang' || k === 'a0' || k === 'a1' || k === 'rho';
      const lbl = !isAngF && Units.key() !== 'mm' ? `${label} (${Units.label()})` : label;
      entry.append(h('label', null, lbl, inp)); inputs.push(inp);
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
    const val = (k) => {
      const i = inputs.find((x) => x.dataset.k === k); if (!i || !i.value.trim()) return NaN;
      if (k !== 'ang' && k !== 'a0' && k !== 'a1' && k !== 'rho') { const p = Units.parseLen(i.value, Model.vars(App.doc).v, { expr: true }); return p.ok ? p.num : NaN; }
      const n = parseNum(i.value); return isNaN(n) ? Model.num(i.value, Model.vars(App.doc).v, NaN) : n;
    };
    // Eingetippte Werte werden zu festen Maßen (Formeln bleiben Formeln)
    const raw = (k) => {
      const i = inputs.find((x) => x.dataset.k === k); if (!i || !i.value.trim()) return null;
      if (k !== 'ang' && k !== 'a0' && k !== 'a1' && k !== 'rho') { const p = Units.parseLen(i.value, Model.vars(App.doc).v, { expr: true }); return p.ok ? p.value : i.value.trim(); }
      const n = parseNum(i.value); return isNaN(n) ? i.value.trim() : n;
    };
    const fix = (en, k, rk) => { const r = raw(rk); if (r == null || !en) return; putDim(en.id, k, typeof r === 'number' ? round(r, 4) : r); };
    const t = S.tool, d = S.draft, cur = S.cursor ? S.cursor.p : null;
    if (t === 'line' || (t === 'slot' && !d.b)) {
      const a = t === 'line' ? d.pts[d.pts.length - 1] : d.a;
      let L = val('len'); let ang = val('ang');
      if (isNaN(L) || L <= 0) { UI.toast('Bitte eine Länge eingeben.', { kind: 'bad' }); return; }
      const prev = t === 'line' && d.last ? ent(d.last.id) : null;
      const prevTan = prev && prev.type === 'arc' ? endTangent(prev, d.last.end) : null;
      if (isNaN(ang)) ang = cur ? (Math.atan2(cur[1] - a[1], cur[0] - a[0]) * 180) / Math.PI : prevTan ? (Math.atan2(prevTan.t[1], prevTan.t[0]) * 180) / Math.PI : 0;
      const r = (ang * Math.PI) / 180;
      const b = [round(a[0] + Math.cos(r) * L, 4), round(a[1] + Math.sin(r) * L, 4)];
      if (t === 'line') {
        const en = addEnt({ type: 'line', a: a.slice(), b });
        fix(en, 'len', 'len'); if (raw('ang') != null) fix(en, 'ang', 'ang');
        const added = [];
        if (prev && (prev.type === 'arc' || d.hadArc)) added.push({ id: uid('k'), type: 'coincident', refs: [{ e: prev.id, p: d.last.end }, { e: en.id, p: 'a' }] });
        if (prevTan && Math.cos(r) * prevTan.t[0] + Math.sin(r) * prevTan.t[1] > Math.cos((8 * Math.PI) / 180)) added.push(makeTanCon(prev, en));
        if (added.length) { S.cons.push(...added); if (!reapply().ok) { S.cons = S.cons.filter((c) => !added.includes(c) || c.type === 'coincident'); if (!reapply().ok) S.cons = S.cons.filter((c) => !added.includes(c)); } }
        if (!d.first) d.first = { id: en.id, end: 'a' };
        d.pts.push(b); d.last = { id: en.id, end: 'b' };
      }
      else { d.b = b; if (S.slotTotal) d.totRaw = raw('len'); }
    } else if (t === 'rect') {
      let w = val('w'), hh = val('h');
      if (isNaN(w) || w <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      if (isNaN(hh) || hh <= 0) hh = w;
      const sx = cur && cur[0] < d.a[0] ? -1 : 1, sy = cur && cur[1] < d.a[1] ? -1 : 1;
      const hasRR = S.rectR > 0;
      const beforeIds = hasRR ? new Set(S.ents.map((x) => x.id)) : null;
      const en = d.mid ? addEnt({ type: 'rect', a: [round(d.a[0] - w / 2, 4), round(d.a[1] - hh / 2, 4)], b: [round(d.a[0] + w / 2, 4), round(d.a[1] + hh / 2, 4)] }, { noMirror: hasRR })
        : addEnt({ type: 'rect', a: d.a, b: [round(d.a[0] + sx * w, 4), round(d.a[1] + sy * hh, 4)] }, { noMirror: hasRR });
      fix(en, 'w', 'w'); fix(en, 'h', 'h'); if (d.mid) midCons(en, d.a); S.draft = null;
      if (hasRR) { roundRect(en, S.rectR, true); liveMirrorEnts(S.ents.filter((x) => !beforeIds.has(x.id))); }
    } else if (t === 'ellipse') {
      let w = val('w'), hh = val('h');
      if (isNaN(w) || w <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      if (isNaN(hh) || hh <= 0) hh = w;
      const en = addEnt({ type: 'ellipse', c: d.c, rx: round(w / 2, 4), ry: round(hh / 2, 4), rot: 0 }); fix(en, 'w', 'w'); fix(en, 'h', 'h'); S.draft = null;
    } else if (t === 'ellarc') {
      const rx0 = d.rx != null ? d.rx : (d.ax ? SK.d2(d.c, d.ax) : NaN);
      const rx = isNaN(val('rx')) ? rx0 : val('rx');
      const ry = isNaN(val('ry')) ? (d.ry != null ? d.ry : rx) : val('ry');
      if (isNaN(rx) || rx <= 0 || isNaN(ry) || ry <= 0) { UI.toast('Bitte gültige Halbachsen eingeben.', { kind: 'bad' }); return; }
      const rot = d.rot != null ? d.rot : (d.ax ? Math.atan2(d.ax[1] - d.c[1], d.ax[0] - d.c[0]) : 0);
      const a0Deg = isNaN(val('a0')) ? (d.a0 != null ? (d.a0 * 180) / Math.PI : 0) : val('a0');
      const a1Deg = isNaN(val('a1')) ? 180 : val('a1');
      const a0 = round((a0Deg * Math.PI) / 180, 6), a1 = round((a1Deg * Math.PI) / 180, 6);
      const ccw = !S.ellArcCW;
      if (Math.abs(SK.ellArcSweep(a0, a1, ccw)) <= 1e-4) { UI.toast('Start- und Endwinkel dürfen nicht gleich sein.', { kind: 'bad' }); return; }
      const en = addEnt({ type: 'ellarc', c: d.c, rx: round(rx, 4), ry: round(ry, 4), rot, a0, a1, ccw });
      if (raw('rx') != null) fix(en, 'rx', 'rx');
      if (raw('ry') != null) fix(en, 'ry', 'ry');
      S.draft = null;
    } else if (t === 'circle' || t === 'poly') {
      const D = val('d'); if (isNaN(D) || D <= 0) { UI.toast('Bitte einen Durchmesser eingeben.', { kind: 'bad' }); return; }
      const rr = t === 'poly' && S.polyFlats ? D / 2 / Math.cos(Math.PI / S.polySides) : D / 2;
      const en = t === 'circle' ? addEnt({ type: 'circle', c: d.c, r: round(D / 2, 4) }) : addEnt({ type: 'poly', c: d.c, r: round(rr, 6), n: S.polySides, rot: S.polyFlats ? Math.PI / S.polySides - Math.PI / 2 : 0 });
      if (t === 'poly' && S.polyFlats) { setDim(en.id, 'd', round(2 * rr, 6)); S.draft = null; } else
      fix(en, 'd', 'd');
      S.draft = null;
    } else if (t === 'slot' && d.b) {
      const W = val('w'); if (isNaN(W) || W <= 0) { UI.toast('Bitte eine Breite eingeben.', { kind: 'bad' }); return; }
      if (S.slotTotal) {
        const q = slotInset(d.a, d.b, W / 2); if (!q) { UI.toast('Die Breite muss kleiner als die Gesamtlänge sein.', { kind: 'bad' }); return; }
        const en = addEnt({ type: 'slot', a: q.a, b: q.b, r: round(W / 2, 4) }); fix(en, 'w', 'w');
        // Gesamtlänge als Maß: Abstand der Mitten = Gesamtlänge − Breite
        if (d.totRaw != null) { const wr = raw('w'); putDim(en.id, 'len', typeof d.totRaw === 'number' && typeof wr === 'number' ? round(d.totRaw - wr, 4) : `(${d.totRaw})-(${wr})`); }
        S.draft = null;
      } else {
      const en = addEnt({ type: 'slot', a: d.a, b: d.b, r: round(W / 2, 4) }); fix(en, 'w', 'w'); S.draft = null;
      }
    } else if (t === 'offset' && d.off) {
      const r = raw('dist'); if (r == null) { UI.toast('Bitte einen Abstand eingeben.', { kind: 'bad' }); return; }
      hideEntry(); commitOffset(r); Viewer.canvas.focus(); return;
    } else if (t === 'conic' && d.m) {
      const rho = val('rho');
      if (isNaN(rho) || rho <= 0.01 || rho >= 0.99) { UI.toast('Bitte einen Rho-Wert zwischen 0,05 und 0,95 eingeben.', { kind: 'bad' }); return; }
      const r = round(rho, 4);
      S.conicRho = r;
      addEnt({ type: 'conic', a: d.a, m: d.m, b: d.b, rho: r });
      S.draft = null; UI.hint(hintFor('conic'));
    }
    reapply(); hideEntry(); Viewer.canvas.focus(); render(); Panels.renderRight();
  }
  // ---------- Tastatur ----------
  function onKey(e) {
    if (S3) return onKey3d(e);
    if (!S) return false;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (dimBox && dimBox._inp && document.body.contains(dimBox)) {
      if (e.key === 'Enter') { e.preventDefault(); dimBox._commit(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); hideDimBox(); Viewer.canvas.focus(); return true; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); dimBox._inp.focus(); dimBox._inp.select(); return true; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        e.preventDefault();
        dimBox._inp.focus();
        dimBox._inp.value = dimBox._typed ? dimBox._inp.value + e.key : e.key;
        dimBox._typed = true;
        const pos = dimBox._inp.value.length;
        try { dimBox._inp.setSelectionRange(pos, pos); } catch (_) {}
        return true;
      }
    }
    if (S.step) {
      if (e.key === 'Escape') {
        if (S.step.pickingFace) {
          S.step.pickingFace = false;
          Viewer.canvas.style.cursor = '';
          Viewer.highlightFace('hover', null, null);
          renderStep();
          return true;
        }
        stepBack(); return true;
      }
      if (e.key === 'Enter') { stepOK(); return true; }
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); sketchUndo(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !e.shiftKey) { e.preventDefault(); copySel(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !e.shiftKey) { e.preventDefault(); pasteClip(); return true; }
    if (e.key === 'Escape' && S.conflict && S.conflict.pending) { clearConflict(); return true; }
    if (e.key === 'Escape' && S.freeMode && !S.draft && S.tool === 'select' && !selectedIds().length) { setFreeMode(false); return true; }
    if (e.key === 'Escape' && S.autoDef) { cancelAutoDefine(); return true; }
    if (e.key === 'Enter' && S.autoDef) { applyAutoDefine(); return true; }
    if (e.key === 'Escape' && S.band) { clearBand(); return true; }
    if (e.key === 'Escape' && S.tool === 'intersect' && S.icPick) { S.icPick = null; Viewer.highlightFace('sel', null, null); UI.hint(hintFor('intersect')); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.liveMirPick) { S.liveMirPick = false; UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.mir) { S.mir = null; UI.hint(hintFor('mirror')); render(); return true; }
    if (e.key === 'Escape' && S.tool === 'stretch' && S.stretch && S.stretch.box) { S.stretch.box = null; S.stretch.sel = null; UI.hint(hintFor('stretch')); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.tool === 'bridge' && S.bridge && S.bridge.first) { S.bridge.first = null; S.bridge.hoverEnd = null; UI.hint(hintFor('bridge')); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.patPick) { S.patPick = false; UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.patPickCurve) { S.patPickCurve = false; UI.hint(hintFor('patcurve')); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.tool === 'patcurve' && S.patCurve) { S.patCurve = null; UI.hint(hintFor('patcurve')); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.tool === 'patfill' && S.fill && S.fill.regionKey) { S.fill.regionKey = null; UI.hint(hintFor('patfill')); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.patSel && S.patSel.length) { S.patSel = []; render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape' && S.tool === 'select' && S.sels && S.sels.length > 1) { clearSel(); render(); Panels.renderRight(); return true; }
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; hideEntry(); if (S.tool === 'line') updateLineHint(); UI.hint(hintFor(S.tool)); render(); } else if (S.picks.length || S.dimFirst || (S.dimPicks && S.dimPicks.length) || S.ordBase) { S.picks = []; S.dimFirst = null; S.dimPicks = []; S.ordBase = null; UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); } else if (S.tool !== 'select') setTool('select'); else if (S.blockEdit) finishBlockEdit(false); else cancel(); return true; }
    if (e.key === 'Enter' && S.draft && S.tool === 'spline') { finishSpline(false); return true; }
    if (e.key === 'Enter' && S.draft && S.tool === 'conic' && S.draft.m) {
      addEnt({ type: 'conic', a: S.draft.a, m: S.draft.m, b: S.draft.b, rho: S.conicRho });
      S.draft = null; hideEntry(); UI.hint(hintFor('conic')); reapply(); render(); Panels.renderRight(); return true;
    }
    if (e.key === 'Enter' && S.tool === 'mirror' && S.mir) { mirrorAll(); return true; }
    if (e.key === 'Enter' && S.tool === 'stretch' && S.stretch && S.stretch.sel && S.stretch.sel.pointCount > 0) { applyStretch(); return true; }
    if (e.key === 'Enter' && (S.tool === 'patrect' || S.tool === 'patcirc' || (S.tool === 'patcurve' && S.patCurve)) && S.patSel.length) { createPattern(); return true; }
    if (e.key === 'Enter' && S.tool === 'patfill' && activeFillRegion().reg) { applyFillPattern(); return true; }
    if (e.key === 'Enter' && S.tool === 'xmove' && S.patSel.length) { applyXmove(); return true; }
    if (e.key === 'Enter') { if (S.draft && S.tool === 'line') { S.draft = null; hideEntry(); updateLineHint(); render(); } else if (S.blockEdit) finishBlockEdit(true); else done(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.selCon) { removeCons(S.selCon); return true; }
    const selIds = selectedIds();
    if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length) { deleteEnts(selIds); return true; }
    // Beim Linienzug wechselt A zwischen Linie und tangentialem Bogen (SK-15)
    if (S.draft && S.tool === 'line' && S.lineMode !== 'tan2' && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); toggleLineArc(); return true; }
    // Beim Zeichnen landet jede Zahl und jeder Buchstabe im Eingabefeld (Formeln wie „breite/2“)
    if (S.draft && !e.ctrlKey && !e.metaKey && !e.altKey && /^[0-9.,\-(A-Za-zÄÖÜäöüß_]$/.test(e.key)) { if (showEntry(e.key)) { e.preventDefault(); return true; } }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') { toggleFreeSpots(); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'x') { toggleConstruction(); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) { const t = TOOLS.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase()); if (t) { setTool(t.id); return true; } }
    return false;
  }
  // ---------- Anzeige ----------
  let grp = null, labels = [], freeGlowMats = [];
  function buildGroup() { grp = Viewer.groups.sketch; clearGroup(); }
  function clearGroup() { freeGlowMats = []; if (!grp) return; for (const o of [...grp.children]) { grp.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.isLineSegments2 || x.isLine2) Viewer.disposeFat(x); else x.material.dispose(); } }); } for (const l of labels) l.remove(); labels = []; }
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
  let rendering = false, renderAgain = false;
  function render() {
    if (S3) { render3d(); return; }
    if (!S) return;
    if (rendering) { renderAgain = true; return; }
    rendering = true;
    try {
      clearGroup();
      const dispEnts = S.wiggle ? wiggledEnts(S.wiggle, clamp((performance.now() - S.wiggle.t0) / S.wiggle.dur, 0, 1)) : S.ents;
      const prevEntList = entList;
      const th = Viewer.theme; const ink = th.dark ? '#cfe3df' : '#123b37', acc = th.accent, muted = th.dark ? '#7f8c99' : '#8a96a3';
      const ring = (p, r, col, w = 2) => { const q = SK.circlePoints(p, r, 20); q.push(q[0]); lineObj(q, col, w, { order: 27 }); };
      entList = dispEnts;
      try {
        bgDraw();
        // Raster in der Ebene (rechteckig oder polar)
        const b = SK.bounds([...dispEnts, ...S.refs]) || [-40, -40, 40, 40];
        let R = Math.max(60, Math.max(Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3])) + 40);
        for (const g of S.guides || []) R = Math.max(R, Math.abs(g.v) + 40);
        if (S.guideDrag) R = Math.max(R, Math.abs(S.guideDrag.v) + 40);
        const gpos = [], gpos2 = [];
        if (polarActive()) {
          let rStep = clamp(Number(S.polar && S.polar.rStep) || 5, 0.1, 1000);
          while (R / rStep > 60) rStep *= 2;
          const majorN = (rStep === 5 || rStep === 25) ? 2 : 5;
          const maxRing = Math.ceil(R / rStep);
          for (let i = 1; i <= maxRing; i++) {
            const rad = i * rStep;
            const arr = i % majorN === 0 ? gpos2 : gpos;
            const segs = rad > 80 ? 96 : 64;
            const pts = SK.circlePoints([0, 0], rad, segs);
            for (let k = 0; k < pts.length; k++) {
              const p0 = toWorld(...pts[k]), p1 = toWorld(...pts[(k + 1) % pts.length]);
              arr.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            }
          }
          const aStep = clamp(Number(S.polar && S.polar.aStep) || 15, 1, 90);
          const nRays = Math.max(1, Math.round(360 / aStep));
          const o3 = toWorld(0, 0);
          for (let i = 0; i < nRays; i++) {
            const deg = i * aStep;
            const rad = (deg * Math.PI) / 180;
            const p1 = toWorld(Math.cos(rad) * R, Math.sin(rad) * R);
            const arr = Math.abs(deg % 45) < 1e-4 ? gpos2 : gpos;
            arr.push(o3.x, o3.y, o3.z, p1.x, p1.y, p1.z);
          }
        } else {
          const step = R > 300 ? 10 : 5;
          for (let v = -Math.ceil(R / step) * step; v <= R; v += step) {
            const arr = v % (step * 2) === 0 ? gpos2 : gpos;
            const a = toWorld(v, -R), c = toWorld(v, R), d = toWorld(-R, v), e2 = toWorld(R, v);
            arr.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, e2.x, e2.y, e2.z);
          }
        }
      const gridKind = polarActive() ? 'polar' : 'rect';
      const mk = (arr, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(acc), transparent: true, opacity: op, depthTest: false })); l.renderOrder = 18; l.userData.sketchGrid = gridKind; grp.add(l); };
      mk(gpos, 0.08); mk(gpos2, 0.16);
      // Achsen der Skizze
      lineObj([[-R, 0], [R, 0]], '#d24a3c', 1.2, { opacity: 0.5, order: 19 });
      lineObj([[0, -R], [0, R]], '#3a9a3f', 1.2, { opacity: 0.5, order: 19 });
      // Herausgezogene Hilfslinien (Profi)
      if (guidesActive()) {
        const hitIds = new Set((S.cursor && S.cursor.guideHits) || []);
        const gCol = th.dark ? '#3bc9db' : '#0b93a8';
        const gHot = th.dark ? '#66d9e8' : '#0c8599';
        for (const g of S.guides || []) {
          if (S.guideDrag && S.guideDrag.mode === 'move' && S.guideDrag.id === g.id) continue;
          const hot = hitIds.has(g.id);
          const seg = g.axis === 'x' ? [[g.v, -R], [g.v, R]] : [[-R, g.v], [R, g.v]];
          const lo = lineObj(seg, hot ? gHot : gCol, hot ? 2.4 : 1.5, { dashed: true, dash: 4, gap: 3, opacity: hot ? 1 : 0.82, order: hot ? 26 : 20 });
          if (lo) lo.userData.sketchGuide = g.id;
        }
        if (S.guideDrag) {
          const d = S.guideDrag;
          const seg = d.axis === 'x' ? [[d.v, -R], [d.v, R]] : [[-R, d.v], [R, d.v]];
          const col = d.remove ? '#e03131' : gHot;
          lineObj(seg, col, 2.4, { dashed: true, dash: 4, gap: 3, opacity: 1, order: 28 });
          const tipPos = d.axis === 'x' ? [d.v, 0] : [0, d.v];
          label(d.remove ? T('sk.ruler.releaseRemove') : `${d.axis.toUpperCase()} = ${Units.fmtLenU(d.v, 2)}`, tipPos, 'snaptip');
        }
      }
      // Bezugskanten der Fläche
      for (const e of S.refs) for (const p of entPts(e)) lineObj(p, muted, 1.5, { dashed: true, order: 20 });
      // Flächen füllen
      const regs = SK.regions(dispEnts);
      for (const r of regs) {
        const chosen = !S.step || !S.step.sel || S.step.sel.includes(r.key);
        const shape = new THREE.Shape(r.outer.poly.map((p) => new THREE.Vector2(p[0], p[1])));
        for (const hl of r.holes) shape.holes.push(new THREE.Path(hl.poly.map((p) => new THREE.Vector2(p[0], p[1]))));
        const g = new THREE.ShapeGeometry(shape);
        const M = new THREE.Matrix4().makeBasis(S.F.x, S.F.y, S.F.n).setPosition(S.F.o.clone().addScaledVector(S.F.n, 0.04));
        g.applyMatrix4(M);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(acc), transparent: true, opacity: chosen ? (S.step ? 0.34 : 0.2) : 0.06, depthTest: false, side: THREE.DoubleSide }));
        m.renderOrder = 21; grp.add(m);
      }
      // Elemente: blau = noch beweglich, dunkel = voll bestimmt, orange = „Freie Stellen“ aktiv
      const free = th.dark ? '#5aa9ff' : '#1c6fd1', freeOrange = th.dark ? '#ff922b' : '#f08c00';
      const showFree = !!(S.freeMode && !S.step);
      const pulsePhase = showFree ? 0.22 + 0.36 * (0.5 + 0.5 * Math.sin(performance.now() / 260)) : 0;
      const st = S.status;
      const selSet = new Set(selectedIds());
      const picked = new Set(S.picks.filter((p) => p.ent || (p.ref && p.ref.e && p.kind !== 'point')).map((p) => p.ref.e));
      if (S.dimFirst && S.dimFirst.kind === 'circle' && S.dimFirst.ent) picked.add(S.dimFirst.ent.id);
      const hov = S.hoverPick;
      const revCol = th.dark ? '#da77f2' : '#9c36b5';
      const blkCol = th.dark ? '#b197fc' : '#6741d9';
      for (const e of dispEnts) {
        const sel = selSet.has(e.id) || picked.has(e.id);
        const isFree = !st || !st.freeEnts || st.freeEnts.has(e.id);
        const isRevAxis = e.type === 'line' && !!e.revAxis;
        const hot = hov && hov.kind !== 'point' && hov.ent && hov.ent.id === e.id;
        const col = sel ? acc : isRevAxis ? revCol : e.blk ? blkCol : S.locked ? ink : isFree ? (showFree ? freeOrange : free) : ink;
        if (showFree && isFree) {
          for (const p of entPts(e)) {
            const gl = lineObj(p, freeOrange, 6, { dashed: e.con, order: 24, opacity: pulsePhase });
            if (gl && gl.material) freeGlowMats.push(gl.material);
          }
        }
        for (const p of entPts(e)) lineObj(p, col, sel ? 3.6 : hot ? 3 : isRevAxis ? 2.8 : (showFree && isFree ? 2.8 : 2.2), { dashed: e.con || isRevAxis, ...(isRevAxis ? { dash: 4.5, gap: 2.2 } : {}), order: 25, opacity: hot && !sel ? 0.8 : 1 });
        if (isRevAxis) {
          const L = SK.d2(e.a, e.b) || 1, ux = (e.b[0] - e.a[0]) / L, uy = (e.b[1] - e.a[1]) / L, ext = pxSize() * 14;
          lineObj([[e.a[0] - ux * ext, e.a[1] - uy * ext], e.a], revCol, 1.8, { dashed: true, dash: 3, gap: 2, order: 24, opacity: 0.55 });
          lineObj([e.b, [e.b[0] + ux * ext, e.b[1] + uy * ext]], revCol, 1.8, { dashed: true, dash: 3, gap: 2, order: 24, opacity: 0.55 });
          if (!S.step) {
            const q = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
            const el = label('', q, 'sklink sk-revaxis');
            el.innerHTML = icon('rotate');
            el.dataset.tip = T('sk.revAxisBadgeTip');
            if (e.link) el.style.transform = 'translate(35%,-140%)';
          }
        }
        if (e.link && !S.step) {   // mit einer Körperkante, Silhouette oder Schnittkurve verbunden: kleines Ketten-Symbol in der Mitte
          const pl = entPts(e)[0] || []; const q = pl.length === 2 ? [(pl[0][0] + pl[1][0]) / 2, (pl[0][1] + pl[1][1]) / 2] : pl[Math.floor(pl.length / 2)];
          if (q) {
            const el = label('', q, 'sklink');
            el.innerHTML = icon('link');
            el.dataset.tip = e.link.kind === 'silhouette' ? 'Mit Umriss (Silhouette) verbunden – wandert mit' : e.link.kind === 'faceIntersect' ? 'Mit Schnittkurve verbunden – wandert mit' : 'Mit einer Körperkante verbunden – wandert mit';
          }
        }
        if (e.type === 'point') {
          const k = pxSize() * 4;
          if (showFree && isFree) {
            const g1 = lineObj([[e.a[0] - k, e.a[1]], [e.a[0] + k, e.a[1]]], freeOrange, 5.5, { order: 25, opacity: pulsePhase });
            const g2 = lineObj([[e.a[0], e.a[1] - k], [e.a[0], e.a[1] + k]], freeOrange, 5.5, { order: 25, opacity: pulsePhase });
            if (g1 && g1.material) freeGlowMats.push(g1.material);
            if (g2 && g2.material) freeGlowMats.push(g2.material);
          }
          lineObj([[e.a[0] - k, e.a[1]], [e.a[0] + k, e.a[1]]], col, sel ? 3.4 : 2.4, { order: 26 });
          lineObj([[e.a[0], e.a[1] - k], [e.a[0], e.a[1] + k]], col, sel ? 3.4 : 2.4, { order: 26 });
        }
        if (hot && e.type === 'rect' && hov.ref && hov.ref.edge != null) { const c = SK.rectCorners(e); lineObj([c[hov.ref.edge], c[(hov.ref.edge + 1) % 4]], acc, 4, { order: 26 }); }
        if (sel && e.type === 'conic' && !S.step) {
          lineObj([e.a, e.m, e.b], acc, 1.2, { dashed: true, opacity: 0.55, order: 24 });
          ring(e.m, pxSize() * 3.8, acc, 1.8);
        }
        if (e.type === 'spline' && e.mode === 'cv' && e.pts && e.pts.length >= 2 && !S.step) {
          const ps = pxSize();
          const poly = e.closed ? [...e.pts, e.pts[0]] : e.pts;
          lineObj(poly, sel ? acc : muted, sel ? 1.5 : 1.1, { dashed: true, dash: 2.2, gap: 1.8, opacity: sel ? 0.85 : 0.45, order: 24 });
          const r = ps * (sel ? 3.8 : 2.6);
          for (const q of e.pts) {
            const sq = [[q[0] - r, q[1] - r], [q[0] + r, q[1] - r], [q[0] + r, q[1] + r], [q[0] - r, q[1] + r], [q[0] - r, q[1] - r]];
            lineObj(sq, sel ? acc : muted, sel ? 2 : 1.4, { opacity: sel ? 0.95 : 0.65, order: 26 });
          }
        }
        if (e.type === 'spline' && e.mode !== 'cv' && !isSimpleMode() && e.pts && e.pts.length >= 2 && !S.step) {
          const ps = pxSize();
          const hasCustom = Array.isArray(e.handles) && e.handles.some((h) => Array.isArray(h));
          if (sel) for (const q of e.pts) ring(q, ps * 3, acc, 1.8);
          if (sel || S.tool === 'dim' || hasCustom) {
            for (let i = 0; i < e.pts.length; i++) {
              const custom = Array.isArray(e.handles) && Array.isArray(e.handles[i]);
              if (!sel && S.tool !== 'dim' && !custom) continue;
              const p = e.pts[i], hv = SK.splineHandle(e, i);
              if (!hv || Math.hypot(hv[0], hv[1]) < 1e-6) continue;
              const isSelH = S.selHandle && S.selHandle.e === e.id && S.selHandle.i === i;
              const isHovH = S.hoverHandle && S.hoverHandle.ent && S.hoverHandle.ent.id === e.id && S.hoverHandle.i === i;
              const hCol = (isSelH || isHovH) ? '#e8833a' : custom ? '#e8833a' : acc;
              const hOp = (isSelH || isHovH || custom) ? 0.95 : 0.65;
              const tPlus = [p[0] + hv[0], p[1] + hv[1]];
              const hasMinus = i > 0 || !!e.closed;
              const tMinus = hasMinus ? [p[0] - hv[0], p[1] - hv[1]] : null;
              lineObj(hasMinus ? [tMinus, tPlus] : [p, tPlus], hCol, isSelH || isHovH ? 2.4 : custom ? 1.8 : 1.3, { opacity: hOp, order: 27 });
              const r = ps * (isSelH || isHovH ? 4.8 : 3.8);
              const dm = [[tPlus[0], tPlus[1] - r], [tPlus[0] + r, tPlus[1]], [tPlus[0], tPlus[1] + r], [tPlus[0] - r, tPlus[1]], [tPlus[0], tPlus[1] - r]];
              lineObj(dm, hCol, isSelH || isHovH ? 2.4 : 1.8, { opacity: hOp, order: 28 });
              if (custom || isSelH) ring(tPlus, ps * 2, hCol, 1.6);
              if (tMinus) ring(tMinus, ps * (isSelH || isHovH ? 3.8 : 3.1), hCol, 1.6);
              if (S.drag && S.drag.handle && S.drag.handle.e === e.id && S.drag.handle.i === i && S.dragged) {
                label(`${fmtAngleU((Math.atan2(hv[1], hv[0]) * 180) / Math.PI)} · ${Units.fmtLenU(Math.hypot(hv[0], hv[1]), 1)}`, tPlus);
              }
            }
          }
        }
      }
      // Krümmungskamm (SK-34, nur Profi): Zähne zeigen nach außen (-K) mit gemeinsamem Maßstab über alle Kurven
      S.curvCombCount = 0;
      if (S.showCurv && !S.step && !isSimpleMode()) {
        const combList = [];
        for (const e of dispEnts) {
          if (e.type !== 'spline' && e.type !== 'arc' && e.type !== 'ellarc' && e.type !== 'ellipse') continue;
          const data = Solver.curvatureSamples(e);
          if (data && data.samples && data.samples.length) combList.push({ e, data });
        }
        if (combList.length) {
          const span = b ? Math.max(b[2] - b[0], b[3] - b[1], 10) : 40;
          const targetH = clamp(span * 0.14, 3, 25);
          const ks = [];
          for (const it of combList) for (const s of it.data.samples) if (s.kAbs > 1e-7) ks.push(s.kAbs);
          ks.sort((a, c) => a - c);
          const kRef = ks.length ? ks[Math.min(ks.length - 1, Math.floor(ks.length * 0.9))] : 0.1;
          const scaleMul = clamp(Number(S.curvScale) || 1, 0.1, 20);
          const gain = (targetH / Math.max(kRef, 1e-5)) * scaleMul;
          const maxTooth = targetH * 2.5 * scaleMul;
          const combCol = th.dark ? '#f783ac' : '#d6336c';
          for (const { e, data } of combList) {
            const teethPos = [], tips = [];
            for (const s of data.samples) {
              let vx = -s.K[0] * gain, vy = -s.K[1] * gain;
              const L = Math.hypot(vx, vy);
              if (L > maxTooth && L > 1e-12) { const f = maxTooth / L; vx *= f; vy *= f; }
              const tip = [s.p[0] + vx, s.p[1] + vy];
              tips.push(tip);
              const w0 = toWorld(s.p[0], s.p[1]).addScaledVector(S.F.n, 0.055);
              const w1 = toWorld(tip[0], tip[1]).addScaledVector(S.F.n, 0.055);
              teethPos.push(w0.x, w0.y, w0.z, w1.x, w1.y, w1.z);
              S.curvCombCount++;
            }
            if (teethPos.length) {
              const g = new THREE.BufferGeometry();
              g.setAttribute('position', new THREE.Float32BufferAttribute(teethPos, 3));
              const tl = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(combCol), transparent: true, opacity: e.con ? 0.35 : 0.65, depthTest: false }));
              tl.renderOrder = 23;
              tl.userData.curvComb = 'teeth';
              tl.userData.entId = e.id;
              grp.add(tl);
            }
            const envPts = data.closed && tips.length > 2 ? [...tips, tips[0]] : tips;
            const env = lineObj(envPts, combCol, 1.5, { order: 23, opacity: e.con ? 0.45 : 0.9 });
            if (env) { env.userData.curvComb = 'envelope'; env.userData.entId = e.id; }
          }
        }
      }
      // gewählte und überfahrene Punkte
      for (const p of S.picks) if (p.kind === 'point') ring(p.xy, pxSize() * 5, acc, 2.6);
      if (S.dimFirst && S.dimFirst.kind === 'point') ring(S.dimFirst.xy, pxSize() * 5, acc, 2.6);
      for (let i = 0; i < (S.dimPicks || []).length; i++) {
        const dp = S.dimPicks[i];
        ring(dp.xy, pxSize() * (i === 1 ? 6 : 5), acc, 2.6);
      }
      if ((S.dimPicks || []).length === 2) lineObj([S.dimPicks[1].xy, S.dimPicks[0].xy], acc, 1.5, { dashed: true, dash: 1.5, gap: 1.2 });
      if (S.ordBase) {
        if (S.ordBase.kind === 'line') { const Ln = refLine(S.ordBase.ref); if (Ln) lineObj(Ln, acc, 3.8, { order: 27 }); }
        else { const q = refXY(S.ordBase.ref); if (q) ring(q, pxSize() * 6, acc, 2.8); }
      }
      if (hov && hov.kind === 'point') ring(hov.xy, pxSize() * 4.5, acc, 1.8);
      if (hov && hov.kind === 'refent') for (const p of entPts(hov.ent)) lineObj(p, acc, 3, { order: 26 });
      // feste Maße als Schildchen, anklicken zum Ändern
      const confFocusId = !S.step && S.conflict ? S.conflict.focusId : null;
      const conflicts = new Set((st && st.conflicts) || []);
      if (!S.step && S.conflict) for (const it of S.conflict.items) conflicts.add(it.id);
      // Hervorhebung des angeklickten Widerspruch-Eintrags
      if (confFocusId) {
        const fi = S.conflict.items.find((x) => x.id === confFocusId);
        if (fi && fi.raw) {
          const refs = fi.raw.e ? [{ e: fi.raw.e }] : (fi.kind === 'con' ? conRefs(fi.raw) : fi.raw.refs || []);
          for (const r of refs) {
            if (!r) continue;
            if (r.p || r.at || r.e === 'origin') {
              const q = refXY(r);
              if (q) ring(q, pxSize() * 6, '#e03131', 3);
            } else if (r.edge != null && ent(r.e)) {
              const L = refLine(r);
              if (L) lineObj(L, '#e03131', 4.8, { order: 29 });
            } else if (r.e && ent(r.e)) {
              for (const pts of entPts(ent(r.e))) lineObj(pts, '#e03131', 4.8, { order: 29 });
            }
          }
        }
      }
      const placed = [];   // Schildchen, die schon stehen – neue rücken nach unten, statt sie zu verdecken
      const ordInfo = !S.step ? ordLayout(S.dims) : { zeros: [], map: new Map() };
      const placeBadge = (el, uv) => {
        $('#overlay').append(el); labels.push(el);
        const spx = Viewer.toScreen(toWorld(uv[0], uv[1]));
        const br = el.getBoundingClientRect();
        const lw = Math.ceil(br.width) || el.offsetWidth || 40, lh = Math.ceil(br.height) || el.offsetHeight || 18;
        let ly = spx.y;
        for (let k = 0; k < 8 && placed.some((q) => Math.abs(q[0] - spx.x) < (q[2] + lw) / 2 + 1 && Math.abs(q[1] - ly) < (q[3] + lh) / 2 + 1); k++) ly += lh + 3;
        placed.push([spx.x, ly, lw, lh]);
        el.style.left = spx.x + 'px'; el.style.top = ly + 'px';
      };
      for (const z of ordInfo.zeros) {
        if (z.line) lineObj(z.line, acc, 1, { dashed: true, opacity: 0.7, dash: 1.2, gap: 1.2 });
        const el = h('div', { class: 'skdim ord-zero', 'data-tip': T('sk.dim.ordZeroTip') }, '0');
        placeBadge(el, z.p);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
      }
      if (!S.step) for (const dm of S.dims) {
        const sp = dimSpecOf(dm);
        const pos = dimPosSpec(dm, ordInfo.map); if (!pos) continue;
        for (const ln of pos.lines || (pos.line ? [pos.line] : [])) lineObj(ln, confFocusId === dm.id ? '#e03131' : acc, confFocusId === dm.id ? 2 : 1, { dashed: true, opacity: confFocusId === dm.id ? 0.95 : 0.7, dash: 1.2, gap: 1.2 });
        const val = measureSpec(sp);
        const isF = typeof dm.v === 'string' && Model.isExpr(dm.v);
        const bad = !dm.ref && (isNaN(Model.num(dm.v, vars(), NaN)) || conflicts.has(dm.id));
        const pre = dm.k === 'distCC' ? (dm.cm === 'min' ? 'min ' : dm.cm === 'max' ? 'max ' : '') : ({ d: 'Ø ', x: 'X ', y: 'Y ', r: 'R ', arcLen: '⌒ ', rx: 'a ', ry: 'b ' }[dm.k] || '');
        const isAng = isAngDim(dm.k);
        const isLen = !isAng && dm.k !== 'n';
        const unit = isAng ? '°' : dm.k === 'n' ? ' Ecken' : (Units.key() !== 'mm' ? ' ' + Units.label() : '');
        const valTxt = isLen ? Units.fmtLen(val) : isAng ? fmtAngle(val) : String(Math.round(val));
        const dLbl = dimLabelOf(dm);
        const tf = !dm.ref && isLen && dm.tol && typeof Iso286 !== 'undefined' && Iso286.formatTolShort
          ? Iso286.formatTolShort(dm.tol, val)
          : null;
        const tolHtml = tf ? `<span class="skdim-tol"> ${esc(tf.badge)}</span>` : '';
        const tolTip = tf && (tf.dev || tf.range) ? ` · ${tf.dev}${tf.range ? ` (${tf.range})` : ''}` : '';
        const el = h('div', { class: 'skdim' + (bad ? ' bad' : '') + (dm.ref ? ' ref' : '') + (confFocusId === dm.id ? ' conf-focus' : ''), 'data-tip': bad ? 'Dieses Maß geht nicht auf – klicken zum Ändern' : dm.ref ? dLbl + ' zum Ablesen – legt nichts fest, klicken zum Festlegen' : dLbl + tolTip + ' – klicken zum Ändern', dataset: { dim: dm.id } });
        el.innerHTML = dm.ref
          ? (isSkeletonMode() && dm.name ? `<span class="fx">${esc(dm.name)}&nbsp;=</span>` : '') + esc('(' + pre + valTxt + unit + ')')
          : (isSkeletonMode() && dm.name ? `<span class="fx">${esc(dm.name)}&nbsp;=</span>` : isF ? `<span class="fx">${esc(dm.v)}&nbsp;=</span>` : '') + esc(pre + valTxt + unit) + tolHtml;
        placeBadge(el, pos.p);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        el.addEventListener('click', (e) => { if (sp.e) setSel([sp.e]); render(); Panels.renderRight(); askDim(sp, e.clientX, e.clientY); });
      }
      // Ausstehendes widersprüchliches Maß ebenfalls als Schildchen anzeigen
      if (!S.step && S.conflict && S.conflict.pending && S.conflict.pending.kind === 'dim') {
        const pd = S.conflict.pending.raw;
        const pos = dimPosSpec(pd);
        if (pos) {
          for (const ln of pos.lines || (pos.line ? [pos.line] : [])) lineObj(ln, '#e03131', 1.5, { dashed: true, opacity: 0.9, dash: 1.2, gap: 1.2 });
          const val = Model.num(pd.v, vars(), NaN);
          const pre = { d: 'Ø ', x: 'X ', y: 'Y ', r: 'R ', arcLen: '⌒ ', rx: 'a ', ry: 'b ' }[pd.k] || '';
          const isAng = isAngDim(pd.k);
          const isLen = !isAng && pd.k !== 'n';
          const unit = isAng ? '°' : pd.k === 'n' ? ' Ecken' : (Units.key() !== 'mm' ? ' ' + Units.label() : '');
          const valTxt = isFinite(val) ? (isLen ? Units.fmtLen(val) : isAng ? fmtAngle(val) : String(Math.round(val))) : String(pd.v);
          const el = h('div', { class: 'skdim bad conf-pending' + (confFocusId === '_neu' ? ' conf-focus' : ''), 'data-tip': 'Neues widersprüchliches Maß – klicken zum Hervorheben', dataset: { dim: '_neu' } }, pre + valTxt + unit);
          placeBadge(el, pos.p);
          el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
          el.addEventListener('click', () => focusConflictItem('_neu'));
        }
      }
      // Regeln als kleine Symbole neben den Elementen
      const slots = new Map();
      if (!S.step) {
        for (const c of S.cons) {
          for (const a of consAnchors(c)) {
            const key = Math.round(a[0] / (pxSize() * 12)) + ',' + Math.round(a[1] / (pxSize() * 12));
            const n = slots.get(key) || 0; slots.set(key, n + 1);
            const spx = Viewer.toScreen(toWorld(a[0], a[1]));
            const el = h('div', { class: 'skcon' + (S.selCon === c.id ? ' sel' : '') + (conflicts.has(c.id) ? ' bad' : '') + (confFocusId === c.id ? ' conf-focus' : ''), 'data-tip': (cname(c.type) || T('sk.bar.rulesTitle')) + ' – anklicken, dann Entf zum Löschen', dataset: { con: c.id } });
            el.innerHTML = icon(CICON[c.type] || 'info');
            const lx = spx.x + n * 19, lw = 18, lh = 18;
            let ly = spx.y;
            for (let k = 0; k < 8 && placed.some((q) => Math.abs(q[0] - lx) < (q[2] + lw) / 2 + 1 && Math.abs(q[1] - ly) < (q[3] + lh) / 2 + 1); k++) ly += lh + 3;
            placed.push([lx, ly, lw, lh]);
            el.style.left = lx + 'px'; el.style.top = ly + 'px';
            el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
            el.addEventListener('click', () => { S.selCon = c.id; clearSel(); render(); Panels.renderRight(); });
            $('#overlay').append(el); labels.push(el);
          }
        }
      }
      // Vorschläge von „Fertig bestimmen“ (gestrichelt im Bild)
      if (S.autoDef && !S.step) {
        const ad = S.autoDef, origById = new Map(S.ents.map((e) => [e.id, e]));
        const movedPt = (p, q) => !p || !q || SK.d2(p, q) > 1e-4;
        const movedEnt = (a, b) => {
          if (!a || !b || a.type !== b.type) return true;
          for (const k of ['a', 'b', 'm', 'c']) if (a[k] && movedPt(a[k], b[k])) return true;
          for (const k of ['r', 'rx', 'ry']) if (a[k] != null && Math.abs(a[k] - b[k]) > 1e-4) return true;
          if (a.pts && (!b.pts || a.pts.length !== b.pts.length || a.pts.some((q, i) => movedPt(q, b.pts[i])))) return true;
          return false;
        };
        const dimGuide = (en, k, pos) => {
          if (pos.line) return pos.line;
          if (!en) return null;
          if (en.type === 'rect') {
            const x0 = Math.min(en.a[0], en.b[0]), x1 = Math.max(en.a[0], en.b[0]), y0 = Math.min(en.a[1], en.b[1]), y1 = Math.max(en.a[1], en.b[1]);
            if (k === 'w') return [[x0, pos.p[1]], [x1, pos.p[1]]];
            if (k === 'h') return [[pos.p[0], y0], [pos.p[0], y1]];
          }
          if ((en.type === 'line' || en.type === 'slot') && k === 'len') {
            const mx = (en.a[0] + en.b[0]) / 2, my = (en.a[1] + en.b[1]) / 2;
            const dx = pos.p[0] - mx, dy = pos.p[1] - my;
            return [[en.a[0] + dx, en.a[1] + dy], [en.b[0] + dx, en.b[1] + dy]];
          }
          if ((en.type === 'circle' || en.type === 'poly') && k === 'd') {
            return [[en.c[0] - Math.SQRT1_2 * en.r, en.c[1] - Math.SQRT1_2 * en.r], pos.p];
          }
          if ((en.type === 'ellipse' || en.type === 'ellarc') && (k === 'w' || k === 'h' || k === 'rx' || k === 'ry')) return [en.c, pos.p];
          if (en.a) return [en.a, pos.p];
          return null;
        };
        const prevAd = entList;
        entList = ad.ents;
        try {
          for (const eNew of ad.ents) {
            if (movedEnt(eNew, origById.get(eNew.id))) {
              for (const pts of entPts(eNew)) lineObj(pts, acc, 2, { dashed: true, opacity: 0.75, dash: 2, gap: 1.6, order: 27 });
            }
          }
          for (const dm of ad.dims) {
            const sp = dimSpecOf(dm);
            const pos = dimPosSpec(dm); if (!pos) continue;
            const en = dm.e ? ent(dm.e) : null;
            const gd = dimGuide(en, dm.k, pos);
            if (gd) lineObj(gd, acc, 1.3, { dashed: true, opacity: 0.85, dash: 1.4, gap: 1.2, order: 27 });
            const val = measureSpec(sp);
            const pre = { d: 'Ø ', x: 'X ', y: 'Y ', r: 'R ', arcLen: '⌒ ', rx: 'a ', ry: 'b ' }[dm.k] || '';
            const isAng = isAngDim(dm.k);
            const isLen = !isAng && dm.k !== 'n';
            const unit = isAng ? '°' : dm.k === 'n' ? ' Ecken' : (Units.key() !== 'mm' ? ' ' + Units.label() : '');
            const dv = isFinite(val) ? val : dm.v;
            const valTxt = isFinite(dv) ? (isLen ? Units.fmtLen(dv) : isAng ? fmtAngle(dv) : String(Math.round(dv))) : String(dv);
            const el = h('div', { class: 'skdim prop', 'data-tip': 'Vorschlag: ' + DIMLABEL(dm.k), dataset: { propDim: dm.id } }, pre + valTxt + unit);
            $('#overlay').append(el); labels.push(el);
            const spx = Viewer.toScreen(toWorld(pos.p[0], pos.p[1]));
            const br = el.getBoundingClientRect();
            const lw = Math.ceil(br.width) || el.offsetWidth || 40, lh = Math.ceil(br.height) || el.offsetHeight || 18; let ly = spx.y;
            for (let k = 0; k < 8 && placed.some((q) => Math.abs(q[0] - spx.x) < (q[2] + lw) / 2 + 1 && Math.abs(q[1] - ly) < (q[3] + lh) / 2 + 1); k++) ly += lh + 3;
            placed.push([spx.x, ly, lw, lh]);
            el.style.left = spx.x + 'px'; el.style.top = ly + 'px';
          }
          for (const c of ad.cons) {
            if (c.type === 'coincident' && c.refs && c.refs[0]) {
              const q = refXY(c.refs[0]);
              if (q) { const rg = SK.circlePoints(q, pxSize() * 6, 20); rg.push(rg[0]); lineObj(rg, acc, 1.8, { dashed: true, dash: 1.2, gap: 1, order: 27 }); }
            }
            for (const a of consAnchors(c)) {
              const key = Math.round(a[0] / (pxSize() * 12)) + ',' + Math.round(a[1] / (pxSize() * 12));
              const n = slots.get(key) || 0; slots.set(key, n + 1);
              const spx = Viewer.toScreen(toWorld(a[0], a[1]));
              const el = h('div', { class: 'skcon prop', 'data-tip': 'Vorschlag: ' + (cname(c.type) || c.type), dataset: { propCon: c.id, type: c.type } });
              el.innerHTML = icon(CICON[c.type] || 'info');
              el.style.left = spx.x + n * 19 + 'px'; el.style.top = spx.y + 'px';
              $('#overlay').append(el); labels.push(el);
            }
          }
        } finally { entList = prevAd; }
      }
      if (S.locked && !S.step) {
        const badge = h('div', { class: 'sk-lock-badge', id: 'sk-lock-badge' });
        badge.innerHTML = icon('lock') + `<span>${esc(T('sk.panel.lockedBadge'))}</span>`;
        $('#overlay').append(badge); labels.push(badge);
      }
      if (S.liveMir && !S.step && !isSimpleMode()) {
        const ax = ent(S.liveMir.axis);
        if (ax && ax.type === 'line') {
          const lmCol = th.dark ? '#f06595' : '#c2255c';
          const L = Math.max(SK.d2(ax.a, ax.b), 1), u = [(ax.b[0] - ax.a[0]) / L, (ax.b[1] - ax.a[1]) / L], ext = L * 0.15 + pxSize() * 30;
          lineObj([[ax.a[0] - u[0] * ext, ax.a[1] - u[1] * ext], [ax.b[0] + u[0] * ext, ax.b[1] + u[1] * ext]], lmCol, 3, { order: 27, dashed: true });
          const lmBadge = h('div', { class: 'sk-live-mir-badge', id: 'sk-live-mir-badge' });
          lmBadge.innerHTML = icon('cSymmetric') + `<span>${esc(T('sk.panel.liveMirBadge', { axis: liveMirAxisLabel() }))}</span>`;
          $('#overlay').append(lmBadge); labels.push(lmBadge);
        }
      }
      if (S.liveMirPick && S.hoverEnt && ent(S.hoverEnt) && !S.step) {
        for (const p of entPts(ent(S.hoverEnt))) lineObj(p, acc, 3.4, { order: 28, opacity: 0.85 });
      }
      // Freie Stellen (SK-07): pulsierende orange Punkte zum Anklicken + Zähler-Schild
      if (showFree && st) {
        const dof = st.dof || 0;
        const badge = h('div', { class: 'sk-free-badge', id: 'sk-free-badge' }, dof ? `${dof} fehlende ${dof === 1 ? 'Angabe' : 'Angaben'}` : 'Voll bestimmt · 0 fehlende Angaben');
        $('#overlay').append(badge); labels.push(badge);
        const byPos = new Map();
        for (const fp of st.freePoints || []) {
          const q = freePointXY(fp);
          const key = Math.round(q[0] * 1e3) + ',' + Math.round(q[1] * 1e3);
          if (!byPos.has(key)) byPos.set(key, { q, list: [fp] });
          else byPos.get(key).list.push(fp);
        }
        for (const { q, list } of byPos.values()) {
          const fp = list[0];
          const spx = Viewer.toScreen(toWorld(q[0], q[1]));
          const ptEl = h('button', {
            type: 'button',
            class: 'skfree-pt',
            dataset: { eid: fp.eid, pt: fp.p, kind: fp.kind },
            'aria-label': 'Freie Stelle – klicken zum Wackeln',
            'data-tip': 'Freie Stelle – klicken zum Wackeln',
          });
          ptEl.style.left = spx.x + 'px'; ptEl.style.top = spx.y + 'px';
          ptEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
          ptEl.addEventListener('click', (e) => { e.stopPropagation(); wiggleFree(fp); });
          $('#overlay').append(ptEl); labels.push(ptEl);
        }
      }
      // Muster entlang Kurve: wo die Kopien landen (statt „offene Enden“)
      const pathM = S.ctx.mode === 'patpath' || isPathEdit();
      const pointsM = S.ctx.mode === 'patpoints' || isPointsEdit();
      if (pathM && !S.step) {
        const g = pathGroup(), V = Model.vars(App.doc).v;
        const L = Model.pathPlaces(dispEnts, g ? Model.num(g.p.n, V, 5) : 5, g ? Model.num(g.p.d, V, 0) : 0);
        const bb = SK.bounds(dispEnts) || [0, 0, 10, 10], rr = clamp(Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.025, 0.6, 4);
        L.forEach((q, i) => { const ringPts = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; ringPts.push([q.p[0] + Math.cos(a) * rr, q.p[1] + Math.sin(a) * rr]); } lineObj(ringPts, acc, i ? 2 : 3.2, { order: 26 }); const t = [Math.cos(q.ang) * rr * 1.8, Math.sin(q.ang) * rr * 1.8]; lineObj([q.p, [q.p[0] + t[0], q.p[1] + t[1]]], acc, 2, { order: 26 }); });
        S.pathCount = L.length; const pc = document.getElementById('path-count'); if (pc) pc.textContent = String(L.length);
      }
      if (pointsM && !S.step) {
        const ptsOnly = dispEnts.filter((e) => e && e.type === 'point' && Array.isArray(e.a));
        const bb = SK.bounds(dispEnts) || [0, 0, 20, 20], rr = clamp(Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.03, 0.8, 4);
        ptsOnly.forEach((q) => { const ringPts = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; ringPts.push([q.a[0] + Math.cos(a) * rr, q.a[1] + Math.sin(a) * rr]); } lineObj(ringPts, acc, 2.4, { order: 26 }); });
        S.pointsCount = ptsOnly.length; const pc = document.getElementById('points-count'); if (pc) pc.textContent = String(ptsOnly.length);
      }
      // offene Enden markieren
      if (!pathM && !pointsM && !isLoftLine()) for (const p of SK.openEnds(dispEnts)) { const l = label('', p, 'snaptip'); l.style.transform = 'translate(-50%,-50%)'; l.style.width = '9px'; l.style.height = '9px'; l.style.padding = '0'; l.style.borderRadius = '50%'; l.style.background = th.hole; l.title = 'Offenes Ende'; }
      // Skizzen-Prüfer: Fundstellen und hervorgehobene Stelle
      if (S.check && S.check.issues.length && !S.step) {
        const ps = pxSize();
        S.check.issues.forEach((it, idx) => {
          const focused = S.checkFocus === idx;
          const col = it.kind === 'dup' ? (focused ? '#e03131' : '#e8833a') : '#e03131';
          if (it.kind === 'dup') {
            for (const id of it.ents) {
              const e = ent(id); if (!e) continue;
              for (const pts of entPts(e)) lineObj(pts, col, focused ? 5 : 3.2, { order: focused ? 29 : 27, opacity: focused ? 1 : 0.75 });
            }
            if (focused) ring(it.p, ps * 10, col, 2.8);
          } else {
            ring(it.p, ps * (focused ? 10 : 7), col, focused ? 3 : 2);
            if (focused) {
              ring(it.p, ps * 16, col, 1.8);
              for (const id of it.ents) {
                const e = ent(id); if (!e) continue;
                for (const pts of entPts(e)) lineObj(pts, '#e8833a', 3.6, { order: 28, opacity: 0.9 });
              }
            }
          }
          if (focused) {
            const tag = it.kind === 'gap'
              ? `Lücke ${Units.fmtLenFixedU(it.dist, 3)}`
              : it.kind === 'dup'
                ? (it.partial ? 'Überlappende Linie' : ({ line: 'Doppelte Linie', arc: 'Doppelter Bogen', circle: 'Doppelter Kreis', rect: 'Doppeltes Rechteck' }[it.sub] || 'Doppeltes Element'))
                : 'Offenes Ende';
            const el = label(tag, [it.p[0], it.p[1] + ps * 18], 'dimlabel live bad sk-chk-tag');
            el.dataset.issue = String(idx);
          }
        });
      }
    } finally {
      entList = prevEntList;
    }
    // Entwurf
    const d = S.draft, cur = S.cursor ? S.cursor.p : null;
    if (d && cur && !S.step) {
      const t = S.tool;
      if (t === 'line' && d.arc) {
        const st = draftTan(), g = st ? tanArc(st, cur) : null;
        if (g) { lineObj(SK.arcPoints(st.p, g.m, cur), acc, 2.2); lineObj([g.c, st.p], acc, 1, { dashed: true, opacity: 0.55 }); label(`Bogen · R ${Units.fmtLenU(g.r, 2)}`, cur); }
        else if (st) { lineObj([st.p, cur], acc, 1.4, { dashed: true }); label('Tangentialer Bogen', cur); }
      } else if (t === 'line') { const a = d.pts[d.pts.length - 1]; lineObj([a, cur], acc, 2.2); const L = SK.d2(a, cur); const ang = (Math.atan2(cur[1] - a[1], cur[0] - a[0]) * 180) / Math.PI; label(`${Units.fmtLenU(L)} · ${fmtAngleU(ang)}`, [(a[0] + cur[0]) / 2, (a[1] + cur[1]) / 2]); }
      if (t === 'rect' && d.r3) { if (d.r3.length === 1) lineObj([d.r3[0], cur], acc, 2.2); else { const c = rect3Corners(d.r3[0], d.r3[1], cur); if (c) { lineObj([...c, c[0]], acc, 2.2); label(`${Units.fmtLen(SK.d2(c[0], c[1]), 2)} × ${Units.fmtLen(SK.d2(c[1], c[2]), 2)}`, cur); } } }
      else if (t === 'rect') { const q = rectDraft(d, cur), e = { type: 'rect', a: q.a, b: q.b }; for (const p of entPts(e)) lineObj(p, acc, 2.2); if (d.mid) lineObj([d.a, cur], acc, 1, { dashed: true }); label(`${Units.fmtLen(Math.abs(q.b[0] - q.a[0]), 2)} × ${Units.fmtLen(Math.abs(q.b[1] - q.a[1]), 2)}`, [(d.a[0] + cur[0]) / 2, (d.a[1] + cur[1]) / 2]); }
      if (t === 'ellipse') {
        if (!d.ax) { const r = SK.d2(d.c, cur); lineObj([[2 * d.c[0] - cur[0], 2 * d.c[1] - cur[1]], cur], acc, 1.4, { dashed: true }); label(Units.fmtLenU(2 * r, 2), cur); }
        else { const q = ellDraft(d, cur); lineObj([[2 * d.c[0] - d.ax[0], 2 * d.c[1] - d.ax[1]], d.ax], acc, 1, { dashed: true }); if (q.ry > 1e-6) { const pts = SK.ellipsePoints(d.c, q.rx, q.ry, q.rot); pts.push(pts[0]); lineObj(pts, acc, 2.2); } label(`${Units.fmtLen(2 * q.rx, 2)} × ${Units.fmtLen(2 * q.ry, 2)}`, cur); }
      }
      if (t === 'ellarc') {
        if (!d.ax) {
          const r = SK.d2(d.c, cur);
          lineObj([[2 * d.c[0] - cur[0], 2 * d.c[1] - cur[1]], cur], acc, 1.4, { dashed: true });
          label(`a ${Units.fmtLenU(r, 2)}`, cur);
        } else if (!d.ry) {
          const q = ellDraft(d, cur);
          lineObj([[2 * d.c[0] - d.ax[0], 2 * d.c[1] - d.ax[1]], d.ax], acc, 1, { dashed: true });
          if (q.ry > 1e-6) { const pts = SK.ellipsePoints(d.c, q.rx, q.ry, q.rot); pts.push(pts[0]); lineObj(pts, acc, 1.6, { dashed: true }); }
          label(`a ${Units.fmtLen(q.rx, 2)} · b ${Units.fmtLenU(q.ry, 2)}`, cur);
        } else {
          const base = SK.ellipsePoints(d.c, d.rx, d.ry, d.rot); base.push(base[0]);
          lineObj(base, acc, 1.1, { dashed: true, opacity: 0.45 });
          const a = ellParamAt(d.c, d.rx, d.ry, d.rot, cur);
          if (d.a0 == null) {
            const p0 = SK.ellArcPt(d.c, d.rx, d.ry, d.rot, a);
            lineObj([d.c, p0], acc, 1.4, { dashed: true });
            ring(p0, pxSize() * 4, acc, 2);
            label(`Start ${fmtAngleU((a * 180) / Math.PI)}`, cur);
          } else {
            const p0 = SK.ellArcPt(d.c, d.rx, d.ry, d.rot, d.a0), p1 = SK.ellArcPt(d.c, d.rx, d.ry, d.rot, a);
            lineObj([d.c, p0], acc, 1, { dashed: true }); lineObj([d.c, p1], acc, 1, { dashed: true });
            const sw = SK.ellArcSweep(d.a0, a, !S.ellArcCW);
            if (Math.abs(sw) > 1e-4) lineObj(SK.ellArcPoints(d.c, d.rx, d.ry, d.rot, d.a0, a, !S.ellArcCW), acc, 2.4);
            label(fmtAngleU((a * 180) / Math.PI), cur);
          }
        }
      }
      if (t === 'circle' && d.pts) { for (const q of d.pts) label('•', q, 'snaptip'); const ci = circOfDraft([...d.pts, cur]); if (ci && d.pts.length + 1 >= 2) { lineObj(SK.segPoints({ t: 'circle', c: ci.c, r: ci.r }), acc, d.pts.length + 1 >= (S.circMode === '3p' ? 3 : 2) ? 2.2 : 1.2, { dashed: d.pts.length + 1 < (S.circMode === '3p' ? 3 : 2) }); label(`Ø ${Units.fmtLen(2 * ci.r, 2)}`, cur); } }
      else if (t === 'arc' && d.tan) { const g = tanArc(d.tan, cur); if (g) { lineObj(SK.arcPoints(d.tan.p, g.m, cur), acc, 2.2); label(`R ${Units.fmtLen(g.r, 2)}`, cur); } }
      else if (t === 'circle') { const r = SK.d2(d.c, cur); lineObj(SK.segPoints({ t: 'circle', c: d.c, r }), acc, 2.2); lineObj([d.c, cur], acc, 1, { dashed: true }); label(`Ø ${Units.fmtLen(2 * r, 2)}`, cur); }
      if (t === 'poly') { const r = SK.d2(d.c, cur); const e = { type: 'poly', c: d.c, r, n: S.polySides, rot: Math.atan2(cur[1] - d.c[1], cur[0] - d.c[0]) - Math.PI / 2 }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Ø ${Units.fmtLen(2 * r, 2)}`, cur); }
      if (t === 'arc' && d.ctr) {
        if (!d.s) { lineObj([d.ctr, cur], acc, 1.4, { dashed: true }); label(`R ${Units.fmtLen(SK.d2(d.ctr, cur), 2)}`, cur); }
        else { const g = centerArc(d, cur); lineObj([d.ctr, d.s], acc, 1, { dashed: true }); if (g) { lineObj(SK.arcPoints(g.a, g.m, g.b), acc, 2.2); lineObj([d.ctr, g.b], acc, 1, { dashed: true }); label(fmtAngleU((g.sw * 180) / Math.PI), cur); } }
      }
      if (t === 'arc' && !d.tan && !d.ctr) { if (!d.b) lineObj([d.a, cur], acc, 1.4, { dashed: true }); else if (SK.arcInfo(d.a, cur, d.b)) { lineObj(SK.arcPoints(d.a, cur, d.b), acc, 2.2); const ai = SK.arcInfo(d.a, cur, d.b); label(`R ${Units.fmtLen(ai.r, 2)}`, cur); } }
      if (t === 'slot' && d.arcslot) {
        if (!d.s) { lineObj([d.c, cur], acc, 1.2, { dashed: true }); label(`R ${Units.fmtLen(SK.d2(d.c, cur), 2)}`, cur); }
        else if (!d.e) { const g = arcSlotGeom({ ...d, e: cur }, null); if (g) lineObj(SK.arcPoints(g.s, g.m, g.e), acc, 1.4, { dashed: true }); }
        else { const g = arcSlotGeom(d, cur); if (g) { for (const a of g.arcs) lineObj(SK.arcPoints(a.a, a.m, a.b), acc, 2.2); label(`Breite ${Units.fmtLen(2 * g.w, 2)}`, cur); } }
      } else if (t === 'slot') { if (!d.b) { lineObj([d.a, cur], acc, 1.4, { dashed: true }); label(`${S.slotTotal ? 'gesamt ' : ''}${Units.fmtLenU(SK.d2(d.a, cur), 2)}`, cur); } else { const r = slotR(d.a, d.b, cur); const q = S.slotTotal ? slotInset(d.a, d.b, r) : { a: d.a, b: d.b }; if (S.slotTotal) lineObj([d.a, d.b], acc, 1, { dashed: true }); if (r > 1e-6 && q) { const e = { type: 'slot', a: q.a, b: q.b, r }; for (const p of entPts(e)) lineObj(p, acc, 2.2); label(`Breite ${Units.fmtLen(2 * r, 2)}`, cur); } } }
      if (t === 'conic') {
        if (!d.b) {
          lineObj([d.a, cur], acc, 1.4, { dashed: true });
          label(Units.fmtLenU(SK.d2(d.a, cur), 2), cur);
        } else if (!d.m) {
          lineObj([d.a, cur, d.b], acc, 1.2, { dashed: true, opacity: 0.65 });
          if (SK.d2(d.a, cur) > 1e-6 && SK.d2(d.b, cur) > 1e-6) lineObj(SK.conicPoints(d.a, cur, d.b, S.conicRho), acc, 2.2);
          label(`ρ ${fmt(S.conicRho, 2)} · ${conicKindLabel(S.conicRho)}`, cur);
        } else {
          const rho = conicRhoAt(d.a, d.m, d.b, cur);
          const mid = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
          lineObj([d.a, d.m, d.b], acc, 1.2, { dashed: true, opacity: 0.65 });
          lineObj([mid, d.m], acc, 1, { dashed: true, opacity: 0.45 });
          const sh = SK.conicPt(d.a, d.m, d.b, rho, 0.5);
          ring(sh, pxSize() * 4, acc, 2);
          lineObj(SK.conicPoints(d.a, d.m, d.b, rho), acc, 2.4);
          label(`ρ ${fmt(rho, 2)} · ${conicKindLabel(rho)}`, cur);
        }
      }
      // Live-Spiegeln: gespiegelte Entwurfsvorschau gestrichelt
      const lmAx = S.liveMir && !isSimpleMode() ? ent(S.liveMir.axis) : null;
      if (lmAx && lmAx.type === 'line') {
        let pvEnts = [];
        if (t === 'line' && d.arc) {
          const st = draftTan(), g = st ? tanArc(st, cur) : null;
          if (g) pvEnts.push({ id: '_pv', type: 'arc', a: st.p, m: g.m, b: cur });
        } else if (t === 'line') {
          const a = d.pts[d.pts.length - 1];
          if (SK.d2(a, cur) > 1e-6) pvEnts.push({ id: '_pv', type: 'line', a, b: cur });
        } else if (t === 'rect' && d.r3 && d.r3.length === 2) {
          const c = rect3Corners(d.r3[0], d.r3[1], cur);
          if (c) for (let i = 0; i < 4; i++) pvEnts.push({ id: '_pv' + i, type: 'line', a: c[i], b: c[(i + 1) % 4] });
        } else if (t === 'rect' && !d.r3) {
          const q = rectDraft(d, cur);
          if (Math.abs(q.b[0] - q.a[0]) > 1e-6 && Math.abs(q.b[1] - q.a[1]) > 1e-6) pvEnts.push({ id: '_pv', type: 'rect', a: q.a, b: q.b });
        } else if (t === 'circle' && d.pts) {
          const ci = circOfDraft([...d.pts, cur]);
          if (ci && d.pts.length + 1 >= (S.circMode === '3p' ? 3 : 2) && ci.r > 1e-6) pvEnts.push({ id: '_pv', type: 'circle', c: ci.c, r: ci.r });
        } else if (t === 'circle') {
          const r = SK.d2(d.c, cur);
          if (r > 1e-6) pvEnts.push({ id: '_pv', type: 'circle', c: d.c, r });
        } else if (t === 'poly') {
          const r = SK.d2(d.c, cur);
          if (r > 1e-6) pvEnts.push({ id: '_pv', type: 'poly', c: d.c, r, n: S.polySides, rot: Math.atan2(cur[1] - d.c[1], cur[0] - d.c[0]) - Math.PI / 2 });
        } else if (t === 'arc' && d.tan) {
          const g = tanArc(d.tan, cur);
          if (g) pvEnts.push({ id: '_pv', type: 'arc', a: d.tan.p, m: g.m, b: cur });
        } else if (t === 'arc' && d.ctr && d.s) {
          const g = centerArc(d, cur);
          if (g) pvEnts.push({ id: '_pv', type: 'arc', a: g.a, m: g.m, b: g.b });
        } else if (t === 'arc' && !d.tan && !d.ctr && d.b && SK.arcInfo(d.a, cur, d.b)) {
          pvEnts.push({ id: '_pv', type: 'arc', a: d.a, m: cur, b: d.b });
        } else if (t === 'ellipse' && d.ax) {
          const q = ellDraft(d, cur);
          if (q.ry > 1e-6) pvEnts.push({ id: '_pv', type: 'ellipse', c: d.c, rx: q.rx, ry: q.ry, rot: q.rot });
        } else if (t === 'ellarc' && d.ry && d.a0 != null) {
          const a = ellParamAt(d.c, d.rx, d.ry, d.rot, cur);
          if (Math.abs(SK.ellArcSweep(d.a0, a, !S.ellArcCW)) > 1e-4) pvEnts.push({ id: '_pv', type: 'ellarc', c: d.c, rx: d.rx, ry: d.ry, rot: d.rot, a0: d.a0, a1: a, ccw: !S.ellArcCW });
        } else if (t === 'slot' && !d.arcslot && d.b) {
          const r = slotR(d.a, d.b, cur);
          const q = S.slotTotal ? slotInset(d.a, d.b, r) : { a: d.a, b: d.b };
          if (r > 1e-6 && q) pvEnts.push({ id: '_pv', type: 'slot', a: q.a, b: q.b, r });
        } else if (t === 'conic' && d.b) {
          const m = d.m || cur;
          const rho = d.m ? conicRhoAt(d.a, d.m, d.b, cur) : S.conicRho;
          if (SK.d2(d.a, d.b) > 1e-6 && SK.d2(d.a, m) > 1e-6 && SK.d2(d.b, m) > 1e-6) pvEnts.push({ id: '_pv', type: 'conic', a: d.a, m, b: d.b, rho });
        }
        const lmCol = th.dark ? '#f06595' : '#c2255c';
        for (const pe of pvEnts) {
          for (const me of SKO.mirrorEnt(pe, lmAx.a, lmAx.b).ents) for (const pts of entPts(me)) lineObj(pts, lmCol, 1.8, { dashed: true, opacity: 0.65, order: 26 });
        }
      }
    }
    // Verlängern-Vorschau
    if (S.tool === 'extend' && S.extHover) lineObj([S.extHover.line[S.extHover.k], S.extHover.p], th.accent, 2.4, { dashed: true });
    // Schablonen- & Formen-Vorschau
    if (S.tool === 'tpl' && cur && !S.step) for (const en of SKO.tplEnts(S.tpl.type, S.tpl.p, cur)) for (const q of entPts(en)) lineObj(q, acc, 1.4, { dashed: true });
    if (S.tool === 'shape' && cur && !S.step) for (const en of SKO.shapeEnts(S.shape.type, S.shape.p, cur)) for (const q of entPts(en)) lineObj(q, acc, 1.4, { dashed: true });
    if (S.formulaOpen && !S.step && !isSimpleMode()) {
      const fres = SKO.evalFormulaCurve(S.formula, Model.vars(App.doc).v);
      if (fres.ok && fres.pts.length >= 2) {
        const pEnts = SKO.pointsToCurveEnts(fres.pts, { kind: S.formula.kind || 'spline', closed: !!S.formula.closed });
        for (const en of pEnts) for (const q of entPts(en)) lineObj(q, acc, 1.8, { dashed: true, opacity: 0.85 });
      }
    }
    // Spline-Entwurf
    if (d && S.tool === 'spline' && d.pts && !S.step) {
      const pts = cur ? [...d.pts, cur] : d.pts;
      const isCV = !isSimpleMode() && S.splineMode === 'cv';
      if (isCV && pts.length >= 2) lineObj(pts, muted, 1.3, { dashed: true, dash: 2.2, gap: 1.8, opacity: 0.75 });
      if (pts.length >= 2) lineObj(SK.segPoints({ t: 'spline', pts, closed: false, ...(isCV ? { mode: 'cv' } : {}) }), acc, 2.2);
      for (const q of d.pts) ring(q, pxSize() * 3.5, acc, 1.8);
      if (d.pts.length >= 3) ring(d.pts[0], pxSize() * 6, acc, 1.2);
    }
    // Trimmen: der Teil, der wegfällt, wird rot
    if (S.tool === 'trim' && S.trimHover && S.trimHover.length > 1) lineObj(S.trimHover, '#e03a3a', 4.5, { order: 28 });
    if (S.tool === 'corner' && S.cornerHover) { const pv = cornerPreview(S.cornerHover); if (pv) lineObj(pv, '#e8833a', 3.5, { order: 28 }); }
    if (S.tool === 'line' && S.tanFirst && ent(S.tanFirst.id)) for (const p of entPts(ent(S.tanFirst.id))) lineObj(p, '#e8833a', 3.6, { order: 28 });
    if (S.tool === 'corner' && S.corner.mode === 'meet') {
      for (const id of [S.hoverEnt, S.meetFirst && S.meetFirst.id]) { const e = id && ent(id); if (e) for (const p of entPts(e)) lineObj(p, '#e8833a', id === S.hoverEnt ? 3 : 3.6, { order: 28, opacity: id === S.hoverEnt ? 0.7 : 1 }); }
    }
    // Versatz: Vorschau der Kopie
    if (S.tool === 'offset') {
      const hv = S.hoverEnt && ent(S.hoverEnt);
      if (hv && !(S.draft && S.draft.off)) for (const p of entPts(hv)) lineObj(p, acc, 3.2, { order: 26 });
      const off = S.draft && S.draft.off, src = off && ent(off.id);
      if (src) {
        for (const p of entPts(src)) lineObj(p, acc, 3.4, { order: 26 });
        if (S.offUV) {
          const sd = offsetSigned(off, S.offUV), plan = offsetPlan(off, sd, Math.abs(sd));
          if (plan.ok) {
            for (const cp of plan.copies) for (const it of cp.items) for (const p of entPts(it.ent)) lineObj(p, acc, 2.2, { dashed: true, order: 27 });
            const O = S.off || {};
            const tags = [Units.fmtLenU(Math.abs(sd))];
            if ((O.count || 1) > 1) tags.push(Math.round(O.count) + '×');
            if (O.both) tags.push('beidseitig');
            if (O.corners === 'round') tags.push('rund');
            label(tags.join(' · '), S.offUV);
          } else if (Math.abs(sd) > 0.01) label(plan.why, S.offUV, 'dimlabel live bad');
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
    if (S.tool === 'patrect' || S.tool === 'patcirc' || S.tool === 'patcurve' || S.tool === 'xmove') {
      const hv = S.hoverEnt && ent(S.hoverEnt);
      if (hv) for (const p of entPts(hv)) lineObj(p, acc, 3, { order: 26, opacity: 0.7 });
      if (S.tool === 'patcurve' && S.patCurve && ent(S.patCurve)) {
        for (const p of entPts(ent(S.patCurve))) lineObj(p, '#0f9d58', 3.2, { order: 26 });
      }
      for (const id of S.patSel) { const e = ent(id); if (e) for (const p of entPts(e)) lineObj(p, acc, 3.4, { order: 26 }); }
      if (S.tool === 'patcurve') {
        const plan = curvePlan();
        if (plan && plan.ok) {
          ring(plan.start, pxSize() * 5, '#0f9d58', 2.2);
          if (S.patSel.length && plan.jobs.length * S.patSel.length <= 240) {
            const piv = patSelCenter();
            for (const job of plan.jobs) for (const id of S.patSel) {
              const e = ent(id); if (!e) continue;
              for (const ne of SKO.transformEnt(e, job.dx, job.dy, job.da, piv).ents) for (const p of entPts(ne)) lineObj(p, acc, 1.6, { dashed: true, opacity: 0.55, order: 26 });
            }
          }
        }
      } else if (S.patSel.length) {
        const C = S.tool === 'xmove' ? xmoveCenter() : S.patCenter || { xy: [0, 0] };
        if (S.tool === 'patcirc' || (S.tool === 'xmove' && S.xm.mode === 'rot')) { ring(C.xy, pxSize() * 6, acc, 2); }
        const jobs = S.tool === 'xmove' ? [xmoveJob()] : patternJobs();
        if (jobs.length * S.patSel.length <= 240) for (const job of jobs) for (const id of S.patSel) { const e = ent(id); if (!e) continue; for (const ne of patternCopy(e, job, C).ents) for (const p of entPts(ne)) lineObj(p, acc, 1.6, { dashed: true, opacity: 0.55, order: 26 }); }
      }
    }
    // Füllmuster: gewählte Fläche und Vorschau der Löcher
    if (S.tool === 'patfill') {
      const { regs, reg } = activeFillRegion();
      if (S.fill && S.fill.hoverRegionKey && (!reg || reg.key !== S.fill.hoverRegionKey)) {
        const hreg = regs.find((r) => r.key === S.fill.hoverRegionKey);
        if (hreg) { const hp = hreg.outer.poly.slice(); hp.push(hp[0]); lineObj(hp, acc, 2.2, { opacity: 0.5, order: 25 }); }
      }
      if (reg) {
        const op = reg.outer.poly.slice(); op.push(op[0]);
        lineObj(op, '#0f9d58', 2.8, { order: 26 });
        const res = fillPreviewResult();
        if (res && res.ok && res.ents.length) {
          const lim = Math.min(res.ents.length, 300);
          for (let i = 0; i < lim; i++) for (const p of entPts(res.ents[i])) lineObj(p, acc, 1.5, { dashed: true, opacity: 0.65, order: 26 });
        }
      }
    }
    // Strecken: Auswahlrahmen, markierte Punkte & Vorschau
    if (S.tool === 'stretch' && S.stretch && S.stretch.box && !S.step) {
      const [bx0, by0, bx1, by1] = S.stretch.box;
      lineObj([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1], [bx0, by0]], '#e67700', 2, { dashed: true, order: 27 });
      const sel = S.stretch.sel;
      if (sel && sel.pts) {
        for (const pt of sel.pts) ring(pt, pxSize() * 5, '#e67700', 2.4);
        const { dx, dy } = stretchDelta(S.stretch);
        if (Math.hypot(dx, dy) >= 1e-9) {
          const pv = SKO.stretchPreview(S.ents, sel, dx, dy);
          if (pv.ok) {
            for (const ne of pv.ents) for (const p of entPts(ne)) lineObj(p, acc, 2, { dashed: true, opacity: 0.72, order: 27 });
            const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
            lineObj([[cx, cy], [cx + dx, cy + dy]], '#e67700', 2.2, { dashed: true, order: 28 });
            ring([cx + dx, cy + dy], pxSize() * 4, '#e67700', 2);
          }
        }
      }
    }
    // Brückenkurve: Enden, Tangenten & Live-Vorschau
    if (S.tool === 'bridge' && S.bridge && !S.step) {
      const B = S.bridge, ps = pxSize();
      const drawEnd = (end, col) => {
        if (!end) return;
        ring(end.p, ps * 5, col, 2.4);
        lineObj([end.p, [end.p[0] + end.t[0] * ps * 24, end.p[1] + end.t[1] * ps * 24]], col, 1.5, { dashed: true, opacity: 0.75, order: 27 });
      };
      drawEnd(B.first, acc);
      drawEnd(B.hoverEnd, B.first ? acc : '#e67700');
      if (B.first && B.hoverEnd && SK.d2(B.first.p, B.hoverEnd.p) > 1e-4) {
        const pts = SK.bridgeControlPoints(B.first, B.hoverEnd, B.mode, B.s1, B.s2);
        lineObj(SK.bridgePoints(pts), acc, 2.4, { order: 28 });
        label(T(B.mode === 'g2' ? 'sk.panel.bridgeG2' : 'sk.panel.bridgeG1'), B.hoverEnd.p);
      }
    }
    if (S.blockEdit && !S.step) {
      const ps = pxSize();
      ring([0, 0], ps * 7, th.dark ? '#b197fc' : '#6741d9', 2.2);
      const badge = h('div', { class: 'sk-blk-edit-badge', id: 'sk-blk-edit-badge' });
      badge.innerHTML = icon('sketchBlock') + `<span>${esc(T('sk.bar.blockEditTitle', { name: S.blockEdit.name }))}</span>`;
      $('#overlay').append(badge); labels.push(badge);
    } else if (!S.step && (S.blockInsts || []).length) {
      const ps = pxSize(), bcol = th.dark ? '#b197fc' : '#6741d9';
      for (const inst of S.blockInsts) {
        const isSel = S.selBlockInst === inst.id, c = isSel ? acc : bcol, r = ps * 4.5;
        lineObj([[inst.x - r, inst.y], [inst.x + r, inst.y]], c, isSel ? 2.2 : 1.5, { order: 27 });
        lineObj([[inst.x, inst.y - r], [inst.x, inst.y + r]], c, isSel ? 2.2 : 1.5, { order: 27 });
        if (isSel) {
          const bb = SK.bounds(instEnts(inst.id));
          if (bb) lineObj([[bb[0] - ps * 4, bb[1] - ps * 4], [bb[2] + ps * 4, bb[1] - ps * 4], [bb[2] + ps * 4, bb[3] + ps * 4], [bb[0] - ps * 4, bb[3] + ps * 4], [bb[0] - ps * 4, bb[1] - ps * 4]], acc, 1.4, { dashed: true, order: 26 });
        }
      }
    }
    if (S.tool === 'block' && !S.blockEdit && !S.step && S.blockActive && cur) {
      const blk = docBlocks().find((b) => b.id === S.blockActive);
      if (blk && typeof Model.materializeBlockInst === 'function') {
        const solved = ((blk.dims && blk.dims.length) || (blk.cons && blk.cons.length)) ? Solver.cached({ ents: blk.ents || [], dims: blk.dims || [], cons: blk.cons || [] }, vars()).ents : (blk.ents || []);
        for (const pe of Model.materializeBlockInst({ id: '_pv', blockId: blk.id, x: cur[0], y: cur[1], rot: S.blockRot || 0 }, blk, solved)) {
          for (const q of entPts(pe)) lineObj(q, acc, 1.8, { dashed: true, opacity: 0.65, order: 26 });
        }
      }
    }
    // Einrast-Markierung
    if (S.cursor && !S.step && S.tool !== 'select') {
      const c = S.cursor;
      const w = c.p; const ps = pxSize();
      if (c.guides) for (const [a, bb] of c.guides) lineObj([a, bb], acc, 1.2, { dashed: true, opacity: 0.85, dash: Math.max(0.15, ps * 8), gap: Math.max(0.15, ps * 6) });
      snapMarker(c.kind, w, ps, acc);
      if (c.tip) { const l = label(c.tip, w, 'snaptip'); }
    }
      if (isLoftLine()) loftPreview();
      updateRulers();
      Viewer.requestRender();
    } finally {
      rendering = false;
    }
    if (renderAgain) { renderAgain = false; render(); }
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
      case 'angle': circ(3.5); break;
      case 'polar': circ(4); line([[-0.8, 0], [0.8, 0]]); line([[0, -0.8], [0, 0.8]]); break;
      case 'guide': line([[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]], true); break;
      case 'grid': circ(3); break;
      default: circ(5);
    }
  }
  // Wo stehen die Symbole einer Regel? (Skizzen-Koordinaten)
  function consAnchors(c) {
    const px = pxSize(); const out = [];
    const refs = c.type === 'xform' || c.type === 'offset' ? [c.refs[1]] : c.type === 'symmetric' ? [c.refs[2]] : c.type === 'coincident' || c.type === 'midpoint' || c.type === 'curvature' ? [c.refs[0]] : c.type === 'concentric' ? [{ e: c.refs[1].e, p: 'c' }] : (c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 2 ? [c.refs[0]] : c.refs;
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
  function ordDir(baseRef, axis) {
    const Ln = refLine(baseRef);
    if (Ln) {
      const dx = Ln[1][0] - Ln[0][0], dy = Ln[1][1] - Ln[0][1], L = Math.hypot(dx, dy) || 1;
      const sg = (Math.abs(dy) >= Math.abs(dx) ? dy : dx) >= 0 ? 1 : -1;
      return [(sg * dx) / L, (sg * dy) / L];
    }
    return axis === 'y' ? [1, 0] : [0, 1];
  }
  function ordLayout(dims) {
    const groups = new Map(), zeros = [], map = new Map();
    for (const dm of dims || []) {
      if (dm.k !== 'ord' || !dm.refs || dm.refs.length < 2) continue;
      const p = refXY(dm.refs[0]); if (!p) continue;
      const Ln = refLine(dm.refs[1]), o = Ln ? null : refXY(dm.refs[1]);
      if (!Ln && !o) continue;
      const key = JSON.stringify(dm.refs[1]) + '|' + (dm.axis || '');
      if (!groups.has(key)) groups.set(key, { u: ordDir(dm.refs[1], dm.axis), basePts: Ln ? [Ln[0], Ln[1]] : [o], items: [] });
      groups.get(key).items.push({ dm, p });
    }
    const pad = pxSize() * 24;
    for (const g of groups.values()) {
      const u = g.u, dot = (q) => q[0] * u[0] + q[1] * u[1];
      let tBar = -Infinity;
      for (const q of g.basePts) tBar = Math.max(tBar, dot(q));
      for (const it of g.items) tBar = Math.max(tBar, dot(it.p));
      tBar += pad;
      const bPt = g.basePts.reduce((a, b) => (dot(b) > dot(a) ? b : a), g.basePts[0]);
      const proj = (q) => { const dt = tBar - dot(q); return [q[0] + dt * u[0], q[1] + dt * u[1]]; };
      const q0 = proj(bPt);
      zeros.push({ p: q0, line: [bPt, q0] });
      for (const it of g.items) { const q = proj(it.p); map.set(it.dm.id, { p: q, line: [it.p, q] }); }
    }
    return { zeros, map };
  }
  function dimPosSpec(dm, ordMap) {
    if (!dm.refs) { const en = ent(dm.e); return en ? dimPos(en, dm.k) : null; }
    const px = pxSize(); const [r0, r1] = dm.refs;
    if (dm.k === 'dist') { const a = refXY(r0), b = refXY(r1); if (!a || !b) return null; const L = SK.d2(a, b) || 1; const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; return { p: [(a[0] + b[0]) / 2 + nx * px * 14, (a[1] + b[1]) / 2 + ny * px * 14], line: [a, b] }; }
    if (dm.k === 'distCC') {
      const A = refCircle(r0), B = refCircle(r1);
      if (!A || !B) return null;
      const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
      const ux = d > 1e-9 ? dx / d : 1, uy = d > 1e-9 ? dy / d : 0, nx = -uy, ny = ux;
      const cm = dm.cm || 'center';
      const sgn = cm === 'min' ? 1 : cm === 'max' ? -1 : 0;
      const p1 = [A.c[0] + sgn * ux * A.r, A.c[1] + sgn * uy * A.r];
      const p2 = [B.c[0] - sgn * ux * B.r, B.c[1] - sgn * uy * B.r];
      if (cm === 'max') {
        const off = Math.max(A.r, B.r) + px * 18;
        const q1 = [p1[0] + nx * off, p1[1] + ny * off], q2 = [p2[0] + nx * off, p2[1] + ny * off];
        return { p: [(q1[0] + q2[0]) / 2 + nx * px * 10, (q1[1] + q2[1]) / 2 + ny * px * 10], lines: [[p1, q1], [p2, q2], [q1, q2]] };
      }
      return { p: [(p1[0] + p2[0]) / 2 + nx * px * 14, (p1[1] + p2[1]) / 2 + ny * px * 14], line: [p1, p2] };
    }
    if (dm.k === 'distPL') { const p = refXY(r0), Ln = refLine(r1); if (!p || !Ln) return null; const [a, b] = Ln; const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; const f = [a[0] + t * dx, a[1] + t * dy]; return { p: [(p[0] + f[0]) / 2 + px * 10, (p[1] + f[1]) / 2], line: [p, f] }; }
    if (dm.k === 'angLL') {
      const A = refLine(r0), B = refLine(r1); if (!A || !B) return null;
      const ma = [(A[0][0] + A[1][0]) / 2, (A[0][1] + A[1][1]) / 2], mb = [(B[0][0] + B[1][0]) / 2, (B[0][1] + B[1][1]) / 2];
      return { p: [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2] };
    }
    if (dm.k === 'ang3') {
      const a = refXY(r0), v0 = refXY(r1), b = refXY(dm.refs[2]);
      if (!a || !v0 || !b) return null;
      const la = SK.d2(v0, a), lb = SK.d2(v0, b);
      if (la < 1e-6 || lb < 1e-6) return null;
      const t0 = Math.atan2(a[1] - v0[1], a[0] - v0[0]);
      const t1 = Math.atan2(b[1] - v0[1], b[0] - v0[0]);
      const d = ((t1 - t0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const ra = clamp(Math.min(la, lb) * 0.45, px * 14, Math.max(px * 14, Math.min(la, lb) * 0.8));
      const arcPts = [];
      for (let i = 0; i <= 16; i++) { const t = t0 + (d * i) / 16; arcPts.push([v0[0] + Math.cos(t) * ra, v0[1] + Math.sin(t) * ra]); }
      const tm = t0 + d / 2, rt = ra + px * 14;
      return { p: [v0[0] + Math.cos(tm) * rt, v0[1] + Math.sin(tm) * rt], lines: [arcPts, [v0, a], [v0, b]] };
    }
    if (dm.k === 'ord') {
      if (ordMap && dm.id && ordMap.has(dm.id)) return ordMap.get(dm.id);
      const p = refXY(r0); if (!p) return null;
      const u = ordDir(r1, dm.axis), q = [p[0] + u[0] * px * 24, p[1] + u[1] * px * 24];
      return { p: q, line: [p, q] };
    }
    return null;
  }
  // Wo steht das Schildchen eines Maßes? (Skizzen-Koordinaten)
  function dimPos(en, k) {
    const px = pxSize();
    if (k === 'x' || k === 'y') {
      const p = SK.anchorOf(en); if (!p) return null;
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
    if (en.type === 'arc' && (k === 'r' || k === 'arcLen')) {
      const ai = SK.arcInfo(en.a, en.m, en.b); if (!ai) return null;
      if (k === 'arcLen') {
        const r = ai.r + px * 12, n = 24, pts = [];
        for (let i = 0; i <= n; i++) { const t = ai.a0 + (ai.sweep * i) / n; pts.push([ai.c[0] + Math.cos(t) * r, ai.c[1] + Math.sin(t) * r]); }
        const tm = ai.a0 + ai.sweep / 2, rl = r + px * 12;
        return { p: [ai.c[0] + Math.cos(tm) * rl, ai.c[1] + Math.sin(tm) * rl], line: pts };
      }
      const d = SK.d2(en.m, ai.c) || 1; const q = px * 16; return { p: [en.m[0] + (en.m[0] - ai.c[0]) / d * q, en.m[1] + (en.m[1] - ai.c[1]) / d * q], line: [ai.c, en.m] };
    }
    if (en.type === 'text' && k === 'h') { const tb = SK.textBox(en); if (!tb) return null; const r = en.rot || 0; return { p: [tb.c[0] - Math.sin(r) * (tb.h / 2 + px * 14), tb.c[1] + Math.cos(r) * (tb.h / 2 + px * 14)] }; }
    if (en.type === 'ellipse') { const r = en.rot || 0, cs = Math.cos(r), sn = Math.sin(r); if (k === 'w') return { p: [en.c[0] + cs * (en.rx + px * 16), en.c[1] + sn * (en.rx + px * 16)] }; if (k === 'h') return { p: [en.c[0] - sn * (en.ry + px * 14), en.c[1] + cs * (en.ry + px * 14)] }; }
    if (en.type === 'ellarc') { const r = en.rot || 0, cs = Math.cos(r), sn = Math.sin(r); if (k === 'rx') return { p: [en.c[0] + cs * (en.rx + px * 16), en.c[1] + sn * (en.rx + px * 16)] }; if (k === 'ry') return { p: [en.c[0] - sn * (en.ry + px * 14), en.c[1] + cs * (en.ry + px * 14)] }; }
    if (en.type === 'circle' || en.type === 'poly') {
      if (k === 'n') return { p: en.c.slice() };
      const q = Math.SQRT1_2 * en.r + px * 12; return { p: [en.c[0] + q, en.c[1] + q] };
    }
    if (en.type === 'spline' && en.mode !== 'cv') {
      const hm = /^h(Ang|Len)(\d+)$/.exec(k);
      if (hm) {
        const hi = +hm[2], p = en.pts && en.pts[hi], hv = p ? SK.splineHandle(en, hi) : null;
        if (!p || !hv) return null;
        const L = Math.hypot(hv[0], hv[1]) || 10, ang = Math.atan2(hv[1], hv[0]);
        if (hm[1] === 'Ang') {
          const ra = clamp(L * 0.65, px * 16, Math.max(px * 18, Math.min(L * 0.85, px * 38)));
          const arcPts = [];
          for (let j = 0; j <= 16; j++) { const t = (ang * j) / 16; arcPts.push([p[0] + Math.cos(t) * ra, p[1] + Math.sin(t) * ra]); }
          const rt = ra + px * 14;
          return { p: [p[0] + Math.cos(ang / 2) * rt, p[1] + Math.sin(ang / 2) * rt], lines: [arcPts, [p, [p[0] + ra * 1.15, p[1]]], [p, [p[0] + hv[0], p[1] + hv[1]]]] };
        }
        const nx = -hv[1] / L, ny = hv[0] / L, mid = [p[0] + hv[0] / 2, p[1] + hv[1] / 2];
        return { p: [mid[0] + nx * px * 14, mid[1] + ny * px * 14], line: [p, [p[0] + hv[0], p[1] + hv[1]]] };
      }
    }
    return null;
  }
  Viewer.on('camera', () => { if (S) { render(); placeEntry(); } });

  // ---------- Skizzen-Prüfer (SK-09) ----------
  const getEndPt = (e, p) => (e.type === 'spline' ? (p === 'a' ? e.pts[0] : e.pts[e.pts.length - 1]) : e.type === 'ellarc' ? (p === 'a' ? SK.endA(e) : SK.endB(e)) : e.type === 'bridge' ? (p === 'a' ? SK.endA(e) : SK.endB(e)) : e[p]);
  function setEndPt(e, p, xy) {
    if (e.type === 'spline') { e.pts = e.pts.slice(); e.pts[p === 'a' ? 0 : e.pts.length - 1] = xy.slice(); }
    else if (e.type === 'ellarc') { e[p === 'a' ? 'a0' : 'a1'] = round(ellParamAt(e.c, e.rx, e.ry, e.rot, xy), 6); }
    else e[p] = xy.slice();
  }
  function inspectCurrent() {
    return S ? SKO.inspect(S.ents, { gapTol: 0.05, dims: S.dims, cons: S.cons }) : { issues: [], gaps: [], dups: [], opens: [], fixable: 0 };
  }
  function runCheck(quiet = false) {
    if (!S) return null;
    clearSel(); S.selCon = null;
    S.check = inspectCurrent();
    S.checkFocus = null;
    render(); Panels.renderRight();
    if (!quiet) {
      if (!S.ents.length) UI.toast('Die Skizze ist noch leer – zeichne zuerst etwas.', { icon: 'info' });
      else if (!S.check.issues.length) UI.toast('Skizze geprüft: Alles in Ordnung – keine Lücken oder doppelten Linien.', { icon: 'check' });
      else {
        const parts = [];
        if (S.check.gaps.length) parts.push(`${S.check.gaps.length} ${S.check.gaps.length === 1 ? 'winzige Lücke' : 'winzige Lücken'}`);
        if (S.check.dups.length) parts.push(`${S.check.dups.length} ${S.check.dups.length === 1 ? 'doppelte Linie' : 'doppelte Linien'}`);
        if (S.check.opens.length) parts.push(`${S.check.opens.length} ${S.check.opens.length === 1 ? 'offenes Ende' : 'offene Enden'}`);
        UI.toast('Skizze geprüft: ' + parts.join(', ') + ' gefunden.', { icon: 'info', ms: 4200 });
      }
    }
    return S.check;
  }
  function focusCheckIssue(idx) {
    if (!S || !S.check || !S.check.issues[idx]) return false;
    S.checkFocus = idx;
    const it = S.check.issues[idx];
    const w = toWorld(it.p[0], it.p[1]), sc = Viewer.toScreen(w), r = Viewer.canvas.getBoundingClientRect();
    if (sc.x < 40 || sc.x > r.width - 40 || sc.y < 40 || sc.y > r.height - 40) {
      const size = Math.max(20, Viewer.pixelSizeAt(S.F.o) * Math.min(r.width, r.height) * 0.45);
      Viewer.lookAtPlane(w.toArray(), S.F.n.toArray(), S.F.x.toArray(), size);
    }
    render(); Panels.renderRight();
    return true;
  }
  function repairCheck() {
    if (!S || guardLocked()) return null;
    const res = inspectCurrent();
    if (!res.fixable) {
      S.check = res; S.checkFocus = null; render(); Panels.renderRight();
      UI.toast('Hier gibt es nichts automatisch zu reparieren.', { icon: 'info' });
      return { dups: 0, gaps: 0, failed: 0, remaining: res.issues.length };
    }
    pushUndo();
    let dupsFixed = 0, gapsFixed = 0, gapsFailed = 0;
    for (const d of res.dups) {
      if (!ent(d.dropId)) continue;
      if (d.partial && d.mergePts) {
        const keep = ent(d.keepId);
        if (keep && keep.type === 'line') { keep.a = d.mergePts[0].slice(); keep.b = d.mergePts[1].slice(); }
      }
      removeEntData(d.dropId);
      dupsFixed++;
    }
    const welded = [];
    for (const g of res.gaps) {
      const eA = ent(g.a.e), eB = ent(g.b.e);
      if (!eA || !eB) continue;
      if (eA === eB && eA.type === 'spline' && !eA.closed && eA.pts.length >= 3) {
        eA.closed = true;
        if (SK.d2(eA.pts[0], eA.pts[eA.pts.length - 1]) < 0.05 && eA.pts.length > 3) eA.pts.pop();
        gapsFixed++;
        continue;
      }
      const c = { id: uid('k'), type: 'coincident', refs: [g.a, g.b] };
      const tr = Solver.trial({ ents: S.ents, dims: S.dims, cons: [...S.cons, c], consBefore: S.cons }, vars());
      if (tr.ok) { S.cons.push(c); welded.push(g); gapsFixed++; }
      else gapsFailed++;
    }
    reapply();
    for (const g of welded) {
      const eA = ent(g.a.e), eB = ent(g.b.e);
      if (!eA || !eB) continue;
      const pA = getEndPt(eA, g.a.p), pB = getEndPt(eB, g.b.p);
      if (pA && pB && SK.d2(pA, pB) < 1e-4) setEndPt(eB, g.b.p, pA.slice());
    }
    reapply();
    S.check = inspectCurrent(); S.checkFocus = null;
    render(); Panels.renderRight();
    const parts = [];
    if (gapsFixed) parts.push(`${gapsFixed} ${gapsFixed === 1 ? 'Lücke' : 'Lücken'} geschlossen`);
    if (dupsFixed) parts.push(`${dupsFixed} doppelte ${dupsFixed === 1 ? 'Linie' : 'Linien'} gelöscht`);
    let msg = parts.length ? 'Repariert: ' + parts.join(', ') + '.' : 'Nichts geändert.';
    if (gapsFailed) msg += ` ${gapsFailed} ${gapsFailed === 1 ? 'Lücke konnte' : 'Lücken konnten'} wegen fester Regeln nicht geschlossen werden.`;
    UI.toast(msg, { icon: gapsFailed && !parts.length ? 'warn' : 'check', kind: gapsFailed && !parts.length ? 'bad' : undefined, ms: 4500 });
    return { dups: dupsFixed, gaps: gapsFixed, failed: gapsFailed, remaining: S.check.issues.length };
  }

  // ---------- Skizze fertig bestimmen (SK-06) ----------
  function proposeAutoDefine() {
    if (!S || S.step || guardLocked()) return null;
    S.draft = null; hideEntry(); hideDimBox(); clearSel(); S.selCon = null;
    if (!S.ents.length) { UI.toast('Die Skizze ist noch leer – zeichne zuerst etwas.', { icon: 'info' }); return null; }
    const res = SKO.autoDefine({ ents: S.ents, dims: S.dims, cons: S.cons }, vars(), { angleTol: 2, gapTol: 0.05 });
    if (res.overConstrained) {
      S.autoDef = null; render(); Panels.renderRight();
      UI.toast('Die Skizze hat schon Widersprüche – löse sie zuerst, bevor du „Fertig bestimmen“ nutzt.', { kind: 'bad', ms: 5000 });
      return res;
    }
    if (res.alreadyFull || (!res.cons.length && !res.dims.length)) {
      S.autoDef = null; render(); Panels.renderRight();
      UI.toast('Die Skizze ist schon voll bestimmt.', { icon: 'check' });
      return res;
    }
    S.autoDef = res; render(); Panels.renderRight();
    UI.hint('<b>Vorschläge (gestrichelt):</b> Klick rechts auf <b>Übernehmen</b>, um alle Regeln und Maße in einem Schritt anzulegen – oder <b>Abbrechen</b>.');
    return res;
  }
  function cancelAutoDefine() {
    if (!S || !S.autoDef) return false;
    S.autoDef = null; UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    return true;
  }
  function applyAutoDefine() {
    if (!S || !S.autoDef || guardLocked()) return false;
    const prop = S.autoDef;
    S.autoDef = null;
    pushUndo();
    for (const dm of prop.dims) {
      if (dm.e) S.dims = S.dims.filter((d) => !(d.ref && d.e === dm.e && d.k === dm.k));
    }
    S.cons.push(...deepClone(prop.cons));
    S.dims.push(...deepClone(prop.dims));
    let r = reapply();
    if (!r || !r.ok) {
      for (const eSol of prop.ents || []) {
        const eCur = ent(eSol.id);
        if (!eCur) continue;
        for (const k of Solver.varsOf(eCur) || []) {
          const val = Solver.getK(eSol, k);
          if (k === 'r' || k === 'rx' || k === 'ry' || k === 'a0' || k === 'a1' || (k === 'h' && eCur.type === 'text')) eCur[k] = val;
          else if (/^p(\d+)_([01])$/.test(k)) { const [, idx, ax] = /^p(\d+)_([01])$/.exec(k); eCur.pts[+idx][+ax] = val; }
          else eCur[k[0]][+k[1]] = val;
        }
      }
      r = reapply();
    }
    let snapped = false;
    for (const c of prop.cons) {
      if (c.type !== 'coincident' || !c.refs || c.refs.length < 2) continue;
      const [rA, rB] = c.refs;
      const eA = rA && rA.e ? ent(rA.e) : null;
      if (eA && rB && rB.e === 'origin' && (rA.p === 'a' || rA.p === 'b' || (eA.type === 'spline' && /^p\d+$/.test(rA.p)))) {
        const pA = getEndPt(eA, rA.p === 'p0' ? 'a' : rA.p === 'p' + ((eA.pts || []).length - 1) ? 'b' : rA.p);
        if (pA && SK.d2(pA, [0, 0]) < 1e-4) { setEndPt(eA, rA.p === 'p0' ? 'a' : rA.p === 'p' + ((eA.pts || []).length - 1) ? 'b' : rA.p, [0, 0]); snapped = true; }
      } else if (eA && rB && rB.e) {
        const eB = ent(rB.e);
        const kA = rA.p === 'p0' ? 'a' : eA.type === 'spline' && rA.p === 'p' + ((eA.pts || []).length - 1) ? 'b' : (rA.p === 'a' || rA.p === 'b' ? rA.p : null);
        const kB = eB && (rB.p === 'p0' ? 'a' : eB.type === 'spline' && rB.p === 'p' + ((eB.pts || []).length - 1) ? 'b' : (rB.p === 'a' || rB.p === 'b' ? rB.p : null));
        if (eB && kA && kB) {
          const pA = getEndPt(eA, kA), pB = getEndPt(eB, kB);
          if (pA && pB && SK.d2(pA, pB) < 1e-4) { setEndPt(eB, kB, pA.slice()); snapped = true; }
        }
      }
    }
    if (snapped) r = reapply();
    UI.hint(hintFor(S.tool)); render(); Panels.renderRight();
    const parts = [];
    if (prop.cons.length) parts.push(`${prop.cons.length} ${prop.cons.length === 1 ? 'Regel' : 'Regeln'}`);
    if (prop.dims.length) parts.push(`${prop.dims.length} ${prop.dims.length === 1 ? 'Maß' : 'Maße'}`);
    const tail = r && r.ok && r.dof === 0 ? ' – die Skizze ist jetzt voll bestimmt.' : '.';
    UI.toast(`Übernommen: ${parts.join(' und ')}${tail}`, { icon: 'check', ms: 3800 });
    return true;
  }

  // ---------- Freie Stellen anzeigen & wackeln (SK-07) ----------
  let freePulseTimer = 0, wiggleRaf = 0, wiggleDoneTimer = 0;
  function stopFreePulse() { if (freePulseTimer) { clearInterval(freePulseTimer); freePulseTimer = 0; } }
  function syncFreePulse() {
    if (S && S.freeMode && !S.step) {
      if (!freePulseTimer) {
        freePulseTimer = setInterval(() => {
          if (!S || !S.freeMode || S.step) { stopFreePulse(); return; }
          if (!freeGlowMats.length) return;
          const op = 0.22 + 0.36 * (0.5 + 0.5 * Math.sin(performance.now() / 260));
          for (const m of freeGlowMats) m.opacity = op;
          Viewer.requestRender();
        }, 60);
      }
    } else stopFreePulse();
  }
  function stopWiggle(noRender) {
    if (wiggleRaf) { cancelAnimationFrame(wiggleRaf); wiggleRaf = 0; }
    if (wiggleDoneTimer) { clearTimeout(wiggleDoneTimer); wiggleDoneTimer = 0; }
    if (S && S.wiggle) { S.wiggle = null; if (!noRender) render(); }
  }
  function freePointXY(fp) {
    const e = ent(fp.eid);
    if (!e) return fp.xy;
    if (fp.kind === 'radius') {
      if ((e.type === 'circle' || e.type === 'poly') && e.c) return [e.c[0] + e.r, e.c[1]];
      if (e.type === 'slot' && e.a && e.b) {
        const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1;
        return [(e.a[0] + e.b[0]) / 2 - ((e.b[1] - e.a[1]) / L) * e.r, (e.a[1] + e.b[1]) / 2 + ((e.b[0] - e.a[0]) / L) * e.r];
      }
      if ((e.type === 'ellipse' || e.type === 'ellarc') && e.c) {
        const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
        return fp.p === 'ry' ? [e.c[0] - sn * e.ry, e.c[1] + cs * e.ry] : [e.c[0] + cs * e.rx, e.c[1] + sn * e.rx];
      }
      return fp.xy;
    }
    if (e.type === 'arc' && fp.p === 'm' && e.m) return e.m;
    if (fp.kind === 'handle' && e.type === 'spline' && /^h(\d+)$/.test(fp.p)) {
      const i = +fp.p.slice(1), p = e.pts && e.pts[i], hv = e.handles && e.handles[i];
      if (p && hv) return [p[0] + hv[0], p[1] + hv[1]];
    }
    return refXY({ e: fp.eid, p: fp.p }) || fp.xy;
  }
  function pickWiggleVectors(varIndices, amp) {
    const basis = (S && S.status && S.status.nullBasis) || [];
    if (!basis.length || !varIndices.length) return { dv1: null, dv2: null };
    const subNorm = (v) => Math.hypot(...varIndices.map((j) => v[j] || 0));
    let best1 = null, bn1 = 0;
    for (const v of basis) { const s = subNorm(v); if (s > bn1) { bn1 = s; best1 = v; } }
    if (!best1 || bn1 < 1e-8) return { dv1: null, dv2: null };
    const dv1 = best1.map((x) => (x / bn1) * amp);
    let best2 = null, bn2 = 0;
    const u1 = varIndices.map((j) => best1[j] / bn1);
    for (const v of basis) {
      if (v === best1) continue;
      const dot = varIndices.reduce((s, j, idx) => s + (v[j] || 0) * u1[idx], 0);
      const orth = v.map((x, idx) => x - (dot / bn1) * best1[idx]);
      const s = subNorm(orth);
      if (s > bn2) { bn2 = s; best2 = orth; }
    }
    const dv2 = best2 && bn2 > 1e-6 ? best2.map((x) => (x / bn2) * amp * 0.7) : null;
    return { dv1, dv2 };
  }
  function wiggledEnts(w, u) {
    const env = Math.sin(u * Math.PI);
    const s1 = Math.sin(u * Math.PI * 5) * env;
    const s2 = w.dv2 ? Math.cos(u * Math.PI * 5) * env * 0.6 : 0;
    const out = deepClone(w.baseEnts);
    for (const e of out) {
      const m = w.varIdx && w.varIdx.get(e.id);
      if (!m) continue;
      for (const k in m) {
        const j = m[k];
        const delta = (w.dv1[j] || 0) * s1 + (w.dv2 ? (w.dv2[j] || 0) * s2 : 0);
        if (Math.abs(delta) < 1e-9) continue;
        let val = Solver.getK(e, k) + delta;
        if (k === 'r' || k === 'rx' || k === 'ry') val = Math.max(0.05, val);
        Solver.setK(e, k, val);
      }
    }
    return out;
  }
  function wiggleFree(fp) {
    if (!S || S.step || !fp || !S.status || !S.status.varIdx || guardLocked()) return false;
    stopWiggle(true);
    let amp = clamp(pxSize() * 9, 0.6, 8);
    if (fp.kind === 'radius') {
      const e = ent(fp.eid);
      const curR = e ? (fp.p === 'ry' ? e.ry : fp.p === 'rx' ? e.rx : e.r) : 5;
      amp = Math.min(amp, Math.max(0.2, (curR || 5) * 0.25));
    }
    const { dv1, dv2 } = pickWiggleVectors(fp.vars || [], amp);
    if (!dv1) return false;
    const dur = 520;
    S.wiggle = { eid: fp.eid, p: fp.p, baseEnts: deepClone(S.ents), dv1, dv2, varIdx: S.status.varIdx, t0: performance.now(), dur };
    S.lastWiggle = { eid: fp.eid, p: fp.p, at: Date.now(), amp };
    const step = () => {
      if (!S || !S.wiggle) return;
      const u = (performance.now() - S.wiggle.t0) / S.wiggle.dur;
      if (u >= 1) { stopWiggle(false); return; }
      render();
      wiggleRaf = requestAnimationFrame(step);
    };
    wiggleRaf = requestAnimationFrame(step);
    wiggleDoneTimer = setTimeout(() => stopWiggle(false), dur + 60);
    render();
    return true;
  }
  function wiggleEnt(eid) {
    if (!S || !S.status || !S.status.freePoints) return false;
    const fp = S.status.freePoints.find((x) => x.eid === eid);
    return fp ? wiggleFree(fp) : false;
  }
  function setFreeMode(on) {
    if (!S) return false;
    if (on && guardLocked()) return false;
    S.freeMode = !!on;
    if (!S.freeMode) stopWiggle(true);
    syncFreePulse();
    if (!S.step) {
      UI.hint(S.freeMode ? '<b>Freie Stellen:</b> Orange Punkte und Linien sind noch beweglich. Klick auf einen Punkt, um ihn wackeln zu lassen. <b>Umschalt F</b> schaltet wieder aus.' : hintFor(S.tool));
    }
    render(); Panels.renderRight();
    return S.freeMode;
  }
  function toggleFreeSpots() { return S ? setFreeMode(!S.freeMode) : false; }

  // ---------- Widerspruch erklären & auflösen (SK-08) ----------
  const ENT_TITLES = { get line() { return T('sk.panel.ent.line'); }, get rect() { return T('sk.panel.ent.rect'); }, get circle() { return T('sk.panel.ent.circle'); }, get arc() { return T('sk.panel.ent.arc'); }, get slot() { return T('sk.panel.ent.slot'); }, get poly() { return T('sk.panel.ent.poly'); }, get ellipse() { return T('sk.panel.ent.ellipse'); }, get ellarc() { return T('sk.panel.ent.ellarc'); }, get conic() { return T('sk.panel.ent.conic'); }, get bridge() { return T('sk.panel.ent.bridge'); }, get text() { return T('sk.panel.ent.text'); }, get point() { return T('sk.panel.ent.point'); }, get spline() { return T('sk.panel.ent.spline'); } };
  function entName(id, list = S && S.ents) {
    if (id === 'origin') return 'Ursprung';
    const arr = list || [];
    const e = arr.find((x) => x.id === id);
    if (!e) return 'Element';
    const nr = arr.filter((x) => x.type === e.type).indexOf(e) + 1;
    return `${ENT_TITLES[e.type] || e.type} ${nr > 0 ? nr : ''}`.trim();
  }
  function describeDim(d, entsList) {
    const isAng = isAngDim(d.k);
    const num = Model.num(d.v, vars(), NaN);
    const valTxt = isFinite(num) ? (isAng ? fmtAngleU(num) : d.k === 'n' ? String(Math.round(num)) : Units.fmtLenU(num)) : String(d.v);
    const exprPre = typeof d.v === 'string' && Model.isExpr(d.v) ? `${d.v} = ` : '';
    const label = `${dimLabelOf(d)} = ${exprPre}${valTxt}`;
    const names = [];
    if (d.e) names.push(entName(d.e, entsList));
    for (const r of d.refs || []) {
      const nm = r && r.e ? entName(r.e, entsList) : r && r.at ? 'Feste Kante' : null;
      if (nm && !names.includes(nm)) names.push(nm);
    }
    return { label, sub: names.join(' ↔ ') || 'Maß' };
  }
  function describeCon(c, entsList) {
    const names = [];
    for (const r of conRefs(c)) {
      const nm = r && r.e ? entName(r.e, entsList) : null;
      if (nm && !names.includes(nm)) names.push(nm);
    }
    return { label: T('sk.panel.conTitle', { name: cname(c.type) || c.type }), sub: names.join(' · ') || 'Bedingung' };
  }
  function recordConflict(pending, testSketch, keepId) {
    if (!S) return null;
    const res = Solver.explainConflict(testSketch, vars(), { keepId });
    if (res.ok) { S.conflict = null; return null; }
    const dimMap = new Map((testSketch.dims || []).map((d) => [d.id, d]));
    const conMap = new Map((testSketch.cons || []).map((c) => [c.id, c]));
    const items = [];
    for (const x of res.items) {
      if (x.kind === 'dim') {
        const d = dimMap.get(x.id); if (!d) continue;
        const info = describeDim(d, testSketch.ents);
        items.push({ kind: 'dim', id: x.id, label: info.label, sub: info.sub, pending: !!(pending && keepId && x.id === keepId), raw: d });
      } else {
        const c = conMap.get(x.id); if (!c) continue;
        const info = describeCon(c, testSketch.ents);
        items.push({ kind: 'con', id: x.id, label: info.label, sub: info.sub, pending: !!(pending && keepId && x.id === keepId), raw: c });
      }
    }
    S.conflict = items.length ? { pending, items, focusId: null } : null;
    return S.conflict;
  }
  function clearConflict() {
    if (!S || !S.conflict) return false;
    S.conflict = null; render(); Panels.renderRight();
    return true;
  }
  function focusConflictItem(id) {
    if (!S || !S.conflict) return false;
    S.conflict.focusId = S.conflict.focusId === id ? null : id;
    render(); Panels.renderRight();
    return true;
  }
  function removeConflictItem(kind, id) {
    if (!S || !S.conflict) return false;
    const item = S.conflict.items.find((x) => x.kind === kind && x.id === id);
    if (!item) return false;
    if (item.pending) {
      clearConflict();
      UI.toast('Widerspruch gelöst – die neue Angabe wurde verworfen.', { icon: 'check' });
      return true;
    }
    const pending = S.conflict.pending;
    const label = item.label;
    pushUndo();
    if (kind === 'dim') S.dims = S.dims.filter((d) => d.id !== id);
    else { S.cons = S.cons.filter((c) => c.id !== id); if (S.selCon === id) S.selCon = null; }
    if (pending) {
      if (pending.kind === 'dim') {
        const others = S.dims.filter((d) => !specMatch(d, pending.sp));
        const tr = Solver.trial({ ents: S.ents, cons: S.cons, dims: [...others, pending.raw], dimsBefore: others }, vars());
        if (tr.ok) {
          putDimSpec(pending.sp, pending.v);
          reapply();
          S.conflict = null;
          render(); Panels.renderRight();
          UI.toast(`Widerspruch gelöst – „${label}“ entfernt.`, { icon: 'check' });
          return true;
        }
        reapply();
        recordConflict(pending, { ents: S.ents, cons: S.cons, dims: [...others, pending.raw] }, pending.raw.id);
        render(); Panels.renderRight();
        UI.toast(`„${label}“ entfernt – es gibt noch einen weiteren Widerspruch.`, { icon: 'info' });
        return false;
      }
      const cons2 = [...S.cons, pending.con];
      const tr = Solver.trial({ ents: S.ents, dims: S.dims, cons: cons2, consBefore: S.cons }, vars());
      if (tr.ok) {
        S.cons = cons2;
        reapply();
        S.conflict = null;
        render(); Panels.renderRight();
        UI.toast(`Widerspruch gelöst – „${label}“ entfernt.`, { icon: 'check' });
        return true;
      }
      reapply();
      recordConflict(pending, { ents: S.ents, dims: S.dims, cons: cons2 }, pending.con.id);
      render(); Panels.renderRight();
      UI.toast(`„${label}“ entfernt – es gibt noch einen weiteren Widerspruch.`, { icon: 'info' });
      return false;
    }
    const r = reapply();
    render(); Panels.renderRight();
    if (r && r.ok) UI.toast(`Widerspruch gelöst – „${label}“ entfernt.`, { icon: 'check' });
    else UI.toast(`„${label}“ entfernt – ein weiterer Widerspruch bleibt.`, { icon: 'info' });
    return !!(r && r.ok);
  }

  // ---------- Rechte Leiste ----------
  function renderPanel(body) {
    if (S3) { renderPanel3d(body); return; }
    if (!S) return;
    const curSimple = isSimpleMode();
    if (S._lastSimple !== curSimple) {
      S._lastSimple = curSimple;
      requestAnimationFrame(() => { if (S && !S.step) render(); });
    }
    const w = h('div', { class: 'props' });
    if (!S.step && (S.ctx.mode === 'patpath' || isPathEdit())) w.append(h('div', { class: 'ok-box', id: 'path-hint', html: T('sk.panel.patPathHint') }));
    if (!S.step && (S.ctx.mode === 'splitcurve' || isSplitSketchEdit())) w.append(h('div', { class: 'ok-box', id: 'splitcurve-hint', html: 'Zeichne eine Linie, einen Bogen, Spline oder Umriss durch den Körper und klick <b>Fertig</b>.' }));
    if (!S.step && (S.ctx.mode === 'patpoints' || isPointsEdit())) w.append(h('div', { class: 'ok-box', id: 'points-hint', html: T('sk.panel.patPointsHint') }));
    if (S.ctx.mode === 'loftrail') w.append(h('div', { class: 'ok-box', id: 'loftrail-hint', html: T('sk.panel.loftRailHint') }));
    if (S.ctx.mode === 'loftrail2') w.append(h('div', { class: 'ok-box', id: 'loftrail2-hint', html: T('sk.panel.loftRail2Hint') }));
    if (S.ctx.mode === 'loftpath') w.append(h('div', { class: 'ok-box', id: 'loftpath-hint', html: T('sk.panel.loftPathHint') }));
    if (isSkeletonMode() && !S.step) w.append(h('div', { class: 'ok-box', id: 'skel-edit-hint', html: T('skel.sketchPanelHint') }));
    if (S.step) { w.append(h('div', { class: 'hint-box', html: T(S.step.revolve ? 'sk.panel.stepRevHint' : 'sk.panel.stepExtHint') })); body.append(w); return; }
    const lockBtn = h('button', { type: 'button', class: 'btn sk-lock-btn' + (S.locked ? ' active' : ''), id: 'sk-lock', 'aria-pressed': S.locked ? 'true' : 'false', 'data-help': 'sketchLock' });
    lockBtn.innerHTML = icon(S.locked ? 'lock' : 'unlock') + `<span>${esc(T(S.locked ? 'sk.panel.lockedBtn' : 'sk.panel.lockBtn'))}</span>`;
    lockBtn.onclick = () => toggleLocked();
    w.append(h('div', { class: 'btn-row' }, lockBtn));
    if (S.locked) w.append(h('div', { class: 'hint-box sk-lock-info', id: 'sk-lock-info', html: T('sk.panel.lockedInfo') }));
    if (S.blockEdit) {
      const be = S.blockEdit;
      const box = h('div', { class: 'sk-blk-box', id: 'sk-blk-edit-box' });
      box.append(h('div', { class: 'ok-box', html: T('sk.block.editBanner', { name: esc(be.name) }) }));
      box.append(UI.textField({ id: 'blk-name', label: T('sk.block.nameLabel'), value: be.name, onCommit: (v) => renameBlock(be.blockId, v) }));
      const fd = h('button', { type: 'button', class: 'btn primary', id: 'blk-edit-done' }); fd.innerHTML = icon('check') + esc(T('sk.block.finishEdit')); fd.onclick = () => finishBlockEdit(true);
      const fc = h('button', { type: 'button', class: 'btn', id: 'blk-edit-cancel' }); fc.innerHTML = icon('close') + esc(T('sk.block.cancelEdit')); fc.onclick = () => finishBlockEdit(false);
      box.append(h('div', { class: 'btn-row' }, fd, fc));
      w.append(box);
    }
    if (!S.locked && !isLoftLine() && S.ctx.mode !== 'patpath' && !isPathEdit() && S.ctx.mode !== 'patpoints' && !isPointsEdit() && S.ctx.mode !== 'pushpull') {
      const lmBox = h('div', { class: 'pro sk-lm-box', id: 'sk-live-mir-box', dataset: { help: 'liveMirror' } });
      if (S.liveMir) {
        lmBox.append(h('div', { class: 'ok-box', id: 'sk-live-mir-active', html: T('sk.panel.liveMirActive', { axis: esc(liveMirAxisLabel()) }) }));
        const bOff = h('button', { type: 'button', class: 'btn', id: 'lm-off' }, T('sk.panel.liveMirOff'));
        bOff.onclick = () => setLiveMirror(false);
        const bChg = h('button', { type: 'button', class: 'btn' + (S.liveMirPick ? ' primary' : ''), id: 'lm-pick' }, T(S.liveMirPick ? 'sk.panel.liveMirPicking' : 'sk.panel.liveMirChange'));
        bChg.onclick = () => startLiveMirrorPick();
        lmBox.append(h('div', { class: 'btn-row' }, bOff, bChg));
      } else {
        const row = h('div', { class: 'btn-row' });
        const bPick = h('button', { type: 'button', class: 'btn' + (S.liveMirPick ? ' primary' : ''), id: 'lm-pick' }, T(S.liveMirPick ? 'sk.panel.liveMirPicking' : 'sk.panel.liveMirPick'));
        bPick.onclick = () => { if (S.liveMirPick) { S.liveMirPick = false; UI.hint(hintFor(S.tool)); render(); Panels.renderRight(); } else startLiveMirrorPick(); };
        const bY = h('button', { type: 'button', class: 'btn', id: 'lm-y' }, T('sk.panel.liveMirAxisY'));
        bY.onclick = () => setLiveMirror('y');
        const bX = h('button', { type: 'button', class: 'btn', id: 'lm-x' }, T('sk.panel.liveMirAxisX'));
        bX.onclick = () => setLiveMirror('x');
        row.append(bPick, bY, bX);
        const selLine = selectedIds().length === 1 ? ent(selectedIds()[0]) : null;
        if (selLine && selLine.type === 'line') {
          const bSel = h('button', { type: 'button', class: 'btn primary', id: 'lm-use-sel' }, T('sk.panel.liveMirUseSel'));
          bSel.onclick = () => setLiveMirror(selLine.id);
          lmBox.append(h('div', { class: 'btn-row' }, bSel));
        }
        lmBox.append(row);
      }
      w.append(lmBox);
      const projPro = h('div', { class: 'btn-row pro', id: 'sk-proj-pro' });
      const bSil = h('button', { type: 'button', class: 'btn' + (S.tool === 'silhouette' ? ' primary' : ''), id: 'sk-silhouette', dataset: { tool: 'silhouette', help: 'silhouette2d' }, 'data-tip': T('sk.toolTip.silhouette') });
      bSil.innerHTML = icon('silhouette2d') + esc(T('sk.tool.silhouette'));
      bSil.onclick = () => setTool(S.tool === 'silhouette' ? 'select' : 'silhouette');
      const bIc = h('button', { type: 'button', class: 'btn' + (S.tool === 'intersect' ? ' primary' : ''), id: 'sk-intersect', dataset: { tool: 'intersect', help: 'intersectCurve2d' }, 'data-tip': T('sk.toolTip.intersect') });
      bIc.innerHTML = icon('intersectCurve') + esc(T('sk.tool.intersect'));
      bIc.onclick = () => setTool(S.tool === 'intersect' ? 'select' : 'intersect');
      projPro.append(bSil, bIc);
      w.append(projPro);
    }
    const buildFreeBtn = () => {
      const dof = S.status && S.status.dof != null ? S.status.dof : 0;
      const fb = h('button', { type: 'button', class: 'btn sk-free-btn' + (S.freeMode ? ' active' : ''), id: 'sk-free', 'aria-pressed': S.freeMode ? 'true' : 'false', 'data-help': 'sketchFreeSpots', 'data-kbd': 'Umschalt F' });
      fb.innerHTML = icon('unlock') + `<span>${esc(T('sk.panel.freeSpots'))}</span><span class="sk-free-count" id="sk-free-count">${dof}</span>`;
      fb.onclick = () => toggleFreeSpots();
      return fb;
    };
    const appendFreeInfo = () => {
      if (!S.freeMode) return;
      const dof = S.status && S.status.dof != null ? S.status.dof : 0;
      const pts = S.status && S.status.freePoints ? S.status.freePoints.length : 0;
      w.append(h('div', { class: 'hint-box sk-free-info', id: 'sk-free-info', html: dof ? T('sk.panel.freeInfo', { dof, dofWord: T(dof === 1 ? 'sk.panel.angabeOne' : 'sk.panel.angabeMany'), pts, ptsWord: T(pts === 1 ? 'sk.panel.stelleOne' : 'sk.panel.stelleMany') }) : T('sk.panel.freeInfoNone') }));
    };
    if (!isLoftLine() && S.ctx.mode !== 'patpath' && !isPathEdit() && S.ctx.mode !== 'patpoints' && !isPointsEdit() && S.conflict && S.conflict.items.length) {
      const cf = S.conflict;
      const box = h('div', { class: 'err-box sk-conflict-box', id: 'sk-conflict' });
      const head = h('div', { class: 'sk-conf-head' }, h('b', null, ERRORS.sketchOverConstrained.titel));
      if (cf.pending) {
        const cl = h('button', { type: 'button', class: 'btn ghost small', id: 'sk-conf-close', 'aria-label': T('sk.panel.confCloseAria'), 'data-tip': T('sk.panel.confCloseTip') });
        cl.innerHTML = icon('close'); cl.onclick = () => clearConflict();
        head.append(cl);
      }
      box.append(head, h('span', { style: { fontSize: '12.5px' } }, T('sk.panel.confIntro')));
      const list = h('div', { class: 'sk-conf-list' });
      for (const it of cf.items) {
        const row = h('div', { class: 'sk-conf-row' + (cf.focusId === it.id ? ' active' : ''), dataset: { confId: it.id, confKind: it.kind } });
        const pick = h('button', { type: 'button', class: 'sk-conf-pick' });
        pick.innerHTML = icon(it.kind === 'dim' ? 'dim' : (CICON[it.raw && it.raw.type] || 'info'));
        pick.append(h('span', { class: 'sk-conf-txt' }, h('b', null, it.label), h('small', null, it.sub + (it.pending ? T('sk.panel.confNew') : ''))));
        pick.onclick = () => focusConflictItem(it.id);
        const del = h('button', { type: 'button', class: 'btn small danger sk-conf-del' }, T('common.remove'));
        del.onclick = () => removeConflictItem(it.kind, it.id);
        row.append(pick, del);
        list.append(row);
      }
      box.append(list);
      if (cf.pending && cf.pending.kind === 'dim') {
        const rb = h('button', { type: 'button', class: 'btn small', id: 'sk-conf-ref' }, T('sk.panel.confRefOnly'));
        rb.onclick = () => { const sp = cf.pending.sp; clearConflict(); setRefDim(sp); };
        box.append(h('div', { class: 'btn-row' }, rb));
      }
      w.append(box);
    }
    const appendCurvControls = (parent) => {
      const cb = h('label', { class: 'check pro', 'data-help': 'curvatureComb' },
        h('input', { type: 'checkbox', id: 'sk-curv-comb', checked: !!S.showCurv }),
        T('sk.panel.showCurv')
      );
      cb.querySelector('input').onchange = (e) => { setShowCurvature(e.target.checked); };
      parent.append(cb);
      if (S.showCurv) {
        const fc = h('div', { class: 'fields pro' });
        fc.append(UI.numField({ id: 'sk-curv-scale', label: T('sk.panel.curvScale'), value: S.curvScale || 1, unit: '×', expr: false, min: 0.1, onCommit: (v) => setCurvatureScale(v) }));
        parent.append(fc);
      }
    };
    const sels = selectedIds();
    const sel = sels.length === 1 ? ent(sels[0]) : null;
    const selCon = S.selCon && S.cons.find((c) => c.id === S.selCon);
    if (selCon) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, T('sk.panel.conTitle', { name: cname(selCon.type) || selCon.type }))));
      w.append(h('div', { class: 'hint-box', html: chint(selCon.type) || '' }));
      const editNum = (id, label, unit, key) => w.append(UI.numField({ id, label, value: selCon[key], unit, onCommit: (v) => {
        if (guardLocked()) { Panels.renderRight(); return; }
        const old = selCon[key]; selCon[key] = v;
        const r = reapply();
        if (r && !r.ok) { selCon[key] = old; reapply(); UI.toast(T('sk.panel.conBadVal'), { kind: 'bad' }); }
        else { S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons.map((c) => (c === selCon ? { ...c, [key]: old } : c)) })); }
        render(); Panels.renderRight();
      } }));
      if (selCon.type === 'offset') {
        // Versatz einer ganzen Kette: alle Stücke, die zusammen entstanden sind, bekommen denselben Abstand
        const grp = selCon.og ? S.cons.filter((c) => c.type === 'offset' && c.og === selCon.og) : [selCon];
        w.append(UI.numField({ id: 'co-v', label: grp.length > 1 ? T('sk.panel.offsetAll', { n: grp.length }) : T('sk.dim.dist'), value: selCon.v, unit: 'mm', onCommit: (v) => {
          if (guardLocked()) { Panels.renderRight(); return; }
          const old = grp.map((c) => c.v); grp.forEach((c) => { c.v = v; });
          // die Originale möglichst stehen lassen – die Kopien wandern
          const pins = []; for (const c of grp) { const src = ent(c.refs[0].e); if (src) for (const k of Solver.varsOf(src) || []) pins.push([src.id, k, Solver.getK(src, k)]); }
          const r = reapply({ pins });
          if (r && !r.ok) { grp.forEach((c, i) => { c.v = old[i]; }); reapply(); UI.toast(T('sk.panel.conBadVal'), { kind: 'bad' }); }
          else S.undo.push(JSON.stringify({ ents: S.ents, dims: S.dims, cons: S.cons.map((c) => { const i = grp.indexOf(c); return i >= 0 ? { ...c, v: old[i] } : c; }) }));
          render(); Panels.renderRight();
        } }));
        if (grp.length > 1) w.append(h('div', { class: 'hint-box', id: 'co-v-all', html: T('sk.panel.offsetChainHint', { n: grp.length }) }));
      }
      if (selCon.type === 'xform' && selCon.mode === 'rot') editNum('co-ang', T('sk.dim.angLL'), '°', 'ang');
      if (selCon.type === 'xform' && selCon.mode !== 'rot') { editNum('co-dx', T('sk.panel.xformX'), 'mm', 'dx'); editNum('co-dy', T('sk.panel.xformY'), 'mm', 'dy'); }
      if (selCon.type === 'xform' && selCon.pg && selCon.pm) {
        // ganzes Muster: Anzahl und Abstand für alle Kopien zusammen
        const pm = selCon.pm, Q = pm.kind === 'circ' ? { n: pm.n, ang: pm.ang } : pm.kind === 'curve' ? { curveMode: pm.curveMode || 'count', curveN: pm.curveN || 5, curveDist: pm.curveDist || 10, curveAlign: pm.curveAlign !== false, curveFlip: !!pm.curveFlip } : { nx: pm.nx, dx: pm.dx, ny: pm.ny, dy: pm.dy };
        const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('sk.panel.wholePattern')));
        const fm = h('div', { class: 'fields' });
        const fld = (id, label, key, unit, o2 = {}) => fm.append(UI.numField({ id, label, value: Q[key], unit, expr: false, min: o2.min, int: o2.int, onCommit: (v) => { Q[key] = v; } }));
        if (pm.kind === 'circ') { fld('pg-n', T('common.count'), 'n', '', { min: 1, int: true }); fld('pg-ang', T('sk.panel.totalAngle'), 'ang', '°'); }
        else if (pm.kind === 'curve') {
          const valEl = h('div', { class: 'fields' });
          const renderCurveFields = () => {
            valEl.innerHTML = '';
            if (Q.curveMode === 'spacing') valEl.append(UI.numField({ id: 'pg-cdist', label: T('sk.panel.curveDist'), value: Q.curveDist, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { Q.curveDist = v; } }));
            else valEl.append(UI.numField({ id: 'pg-cn', label: T('common.count'), value: Q.curveN, unit: '', expr: false, min: 1, int: true, onCommit: (v) => { Q.curveN = v; } }));
          };
          fm.append(UI.selectField({ id: 'pg-cmode', label: T('sk.panel.curveMode'), value: Q.curveMode, options: [['count', T('sk.panel.curveModeCount')], ['spacing', T('sk.panel.curveModeSpacing')]], onChange: (v) => { Q.curveMode = v; renderCurveFields(); } }));
          renderCurveFields();
          fm.append(valEl);
          const al = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pg-calign', checked: !!Q.curveAlign }), T('sk.panel.curveAlign'));
          al.querySelector('input').onchange = (e) => { Q.curveAlign = e.target.checked; };
          const fl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pg-cflip', checked: !!Q.curveFlip }), T('sk.panel.curveFlip'));
          fl.querySelector('input').onchange = (e) => { Q.curveFlip = e.target.checked; };
          fm.append(al, fl);
        }
        else { fld('pg-nx', T('sk.panel.nx'), 'nx', '', { min: 1, int: true }); fld('pg-dx', T('sk.panel.dx'), 'dx', 'mm'); fld('pg-ny', T('sk.panel.ny'), 'ny', '', { min: 1, int: true }); fld('pg-dy', T('sk.panel.dy'), 'dy', 'mm'); }
        const ap = h('button', { type: 'button', class: 'btn primary', id: 'pg-apply' }); ap.innerHTML = icon('check') + esc(T('sk.panel.patApply'));
        ap.onclick = () => regenPattern(selCon.pg, Q);
        sec.append(fm, h('div', { class: 'btn-row' }, ap), h('div', { class: 'hint-box', html: T('sk.panel.patHint') }));
        w.append(sec);
      }
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + esc(T('sk.panel.delCon'));
      del.onclick = () => removeCons(selCon.id);
      w.append(h('div', { class: 'btn-row' }, del));
      body.append(w); return;
    }
    const selBlkInst = !S.blockEdit && S.selBlockInst ? (S.blockInsts || []).find((i) => i.id === S.selBlockInst) : null;
    if (selBlkInst) {
      const blk = docBlocks().find((b) => b.id === selBlkInst.blockId);
      const nInst = (S.blockInsts || []).filter((i) => i.blockId === selBlkInst.blockId).length;
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' }, id: 'blk-inst-title' }, T('sk.block.instTitle', { name: blk ? blk.name : 'Block' }))));
      w.append(h('div', { class: 'hint-box', html: T('sk.block.instHint', { n: nInst }) }));
      const fb = h('div', { class: 'fields' });
      fb.append(UI.numField({ id: 'bi-x', label: T('sk.block.posX'), value: round(selBlkInst.x || 0, 4), unit: 'mm', expr: false, onCommit: (v) => updateBlockInst(selBlkInst.id, { x: v }) }));
      fb.append(UI.numField({ id: 'bi-y', label: T('sk.block.posY'), value: round(selBlkInst.y || 0, 4), unit: 'mm', expr: false, onCommit: (v) => updateBlockInst(selBlkInst.id, { y: v }) }));
      fb.append(UI.numField({ id: 'bi-rot', label: T('sk.block.rot'), value: round(selBlkInst.rot || 0, 4), unit: '°', expr: false, onCommit: (v) => updateBlockInst(selBlkInst.id, { rot: v }) }));
      w.append(fb);
      const ed = h('button', { type: 'button', class: 'btn primary pro', id: 'blk-inst-edit', 'data-help': 'sketchBlocks' }); ed.innerHTML = icon('sketchBlock') + esc(T('sk.block.editBtn')); ed.onclick = () => editBlock(selBlkInst.blockId);
      const ex = h('button', { type: 'button', class: 'btn', id: 'blk-inst-explode', 'data-help': 'sketchBlocks' }); ex.innerHTML = icon('ungroup') + esc(T('sk.block.explodeBtn')); ex.onclick = () => explodeBlockInst(selBlkInst.id);
      const dl = h('button', { type: 'button', class: 'btn danger', id: 'blk-inst-del' }); dl.innerHTML = icon('trash') + esc(T('common.delete')); dl.onclick = () => deleteBlockInst(selBlkInst.id);
      w.append(h('div', { class: 'btn-row' }, ed, ex), h('div', { class: 'btn-row' }, dl));
    } else if (sel) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, T('sk.panel.ent.' + sel.type))));
      if (sel.link) {
        const src = Model.find(App.doc, sel.link.id);
        const ub = h('button', { type: 'button', class: 'btn', id: 'link-off' }); ub.innerHTML = icon('ungroup') + esc(T('sk.panel.unlink'));
        ub.onclick = () => {
          pushUndo();
          const grp = sel.link && sel.link.grp;
          if (grp) { for (const x of S.ents) if (x.link && x.link.grp === grp) delete x.link; }
          else delete sel.link;
          render(); Panels.renderRight();
          UI.toast(T('sk.toast.linkUnlinked'), { icon: 'check', ms: 2000 });
        };
        let infoHtml;
        if (sel.link.kind === 'silhouette') {
          infoHtml = T('sk.panel.linkSilInfo', { name: esc(src ? Model.label(src.item) : T('sk.panel.linkSomeBody')) });
        } else if (sel.link.kind === 'faceIntersect') {
          const src2 = sel.link.id2 ? Model.find(App.doc, sel.link.id2) : null;
          if (!src2 || (src && src2.item.id === src.item.id)) {
            infoHtml = T('sk.panel.linkIcSameInfo', { name: esc(src ? Model.label(src.item) : T('sk.panel.linkSomeBody')) });
          } else {
            infoHtml = T('sk.panel.linkIcInfo', { nameA: esc(src ? Model.label(src.item) : T('sk.panel.linkSomeBody')), nameB: esc(Model.label(src2.item)) });
          }
        } else {
          infoHtml = T('sk.panel.linkInfo', { name: esc(src ? Model.label(src.item) : T('sk.panel.linkSomeBody')), off: sel.link.off ? T('sk.panel.linkOff', { v: (sel.link.off > 0 ? '+' : '') + Units.fmtLenU(sel.link.off, 2) }) : '' });
        }
        w.append(h('div', { class: 'ok-box', id: 'link-info', html: infoHtml }), h('div', { class: 'btn-row' }, ub));
      }
      const upd = (fn) => { if (guardLocked()) { Panels.renderRight(); return; } pushUndo(); fn(sel); reapply(); render(); Panels.renderRight(); };
      // Jedes eingetippte Maß wird fest (auch als Formel). Das Schloss löst es wieder.
      const dimField = (k, label, unit = 'mm', opts = {}) => {
        const dm = dimOf(sel.id, k);
        const fld = UI.numField({ id: 'se-' + k, label, value: dm && !dm.ref ? dm.v : round(SK.measure(sel, k), 6), unit, min: opts.min, int: opts.int, onCommit: (v) => setDim(sel.id, k, v) });
        const box = fld.querySelector('.inp');
        if (dm && dm.ref) {
          const lk = h('button', { type: 'button', class: 'dimlock refmark', 'data-tip': T('sk.panel.refDimTip'), 'aria-label': T('sk.panel.refDimAria', { label }) }, '( )');
          lk.onclick = () => removeDim(sel.id, k);
          box.append(lk);
        } else if (dm) {
          fld.classList.add('dimmed');
          const bad = isNaN(Model.num(dm.v, vars(), NaN));
          if (bad) box.classList.add('invalid');
          const lk = h('button', { type: 'button', class: 'dimlock', 'data-tip': T('sk.panel.dimLockTip'), 'aria-label': T('sk.panel.dimLockAria', { label }) }); lk.innerHTML = icon('lock');
          lk.onclick = () => removeDim(sel.id, k);
          box.append(lk);
        }
        return fld;
      };
      const f = h('div', { class: 'fields' });
      if (sel.type === 'line') { f.append(dimField('len', T('common.length'), 'mm', { min: 0.01 }), dimField('ang', T('common.angle'), '°')); }
      else if (sel.type === 'rect') { f.append(dimField('w', T('param.w'), 'mm', { min: 0.01 }), dimField('h', T('param.h'), 'mm', { min: 0.01 })); }
      else if (sel.type === 'circle') { f.append(dimField('d', T('param.dia'), 'mm', { min: 0.01 })); }
      else if (sel.type === 'text') {
        w.append(UI.textField({ id: 'se-s', label: T('sk.tool.text'), value: sel.s, onCommit: (v) => { if (!v.trim()) { UI.toast(T('sk.panel.emptyTextToast'), { icon: 'info' }); Panels.renderRight(); return; } upd((e) => { e.s = v; }); } }));
        f.append(dimField('h', T('sk.panel.textHeight'), 'mm', { min: 0.1 }));
        const fontVal = SK.FONTNAMES[sel.font] ? sel.font : 'inter';
        f.append(UI.selectField({ id: 'se-font', label: T('sk.panel.font'), value: fontVal, options: Object.entries(SK.FONTNAMES), onChange: (v) => { upd((e) => { e.font = v; }); ensureSketchFonts(v); } }));
        const lf = h('button', { type: 'button', class: 'btn', id: 'se-load-font', 'data-help': 'loadFont' }); lf.innerHTML = icon('folder') + esc(T('sk.panel.loadFont'));
        lf.onclick = () => pickFont(sel.id);
        f.append(h('div', { class: 'btn-row' }, lf));
        f.append(UI.selectField({ id: 'se-align', label: T('sk.panel.align'), value: sel.align || 'l', options: [['l', T('sk.panel.alignL')], ['m', T('sk.panel.alignM')], ['r', T('sk.panel.alignR')]], onChange: (v) => upd((e) => { e.align = v; }) }));
        if (!sel.on) f.append(UI.numField({ id: 'se-rot', label: T('ctx.rotate'), value: round(((sel.rot || 0) * 180) / Math.PI, 6), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
        f.append(UI.numField({ id: 'se-sp', label: T('sk.panel.charSpacing'), value: sel.sp || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { e.sp = v; }) }));
        // entlang einer offenen Kurve der Skizze (Linie, Bogen, Teil-Ellipse, Kegelschnitt, Brücke, Spline)
        const curves = S.ents.filter((x) => x.type === 'line' || x.type === 'arc' || x.type === 'ellarc' || x.type === 'conic' || x.type === 'bridge' || (x.type === 'spline' && !x.closed));
        if (curves.length || sel.on) {
          const nm = { line: T('sk.panel.ent.line'), arc: T('sk.panel.ent.arc'), ellarc: T('sk.panel.ent.ellarc'), conic: T('sk.panel.ent.conic'), bridge: T('sk.panel.ent.bridge'), spline: T('sk.panel.ent.spline') };
          f.append(UI.selectField({ id: 'se-on', label: T('sk.panel.along'), value: sel.on || '', options: [['', T('sk.panel.straight')], ...curves.map((c, i) => [c.id, `${nm[c.type]} ${i + 1}${c.con ? T('sk.panel.conSuffix') : ''}`])], onChange: (v) => upd((e) => {
            if (v) { const c = S.ents.find((x) => x.id === v), pts = c && SK.textPathPts(c, false); if (!pts) return; e.on = v; e.onP = pts; e.align = 'm'; delete e.bend; }
            else { delete e.on; delete e.onP; delete e.os; delete e.flip; }
          }) }));
          if (sel.on) {
            f.append(UI.numField({ id: 'se-os', label: T('sk.panel.moveAlong'), value: sel.os || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { if (Math.abs(v) < 1e-9) delete e.os; else e.os = v; }) }));
            const fb = h('button', { type: 'button', class: 'btn', id: 'se-flip' }); fb.innerHTML = icon('mirror') + esc(T('sk.panel.otherSide'));
            fb.onclick = () => upd((e) => { e.flip = !e.flip; if (!e.flip) delete e.flip; const c = S.ents.find((x) => x.id === e.on); const pts = c && SK.textPathPts(c, e.flip); if (pts) e.onP = pts; });
            f.append(h('div', { class: 'btn-row' }, fb));
            const cv = S.ents.find((x) => x.id === sel.on);
            if (cv && !cv.con) w.append(h('div', { class: 'hint-box', id: 'se-on-hint', html: T('sk.panel.textAlongConHint') }));
          }
        }
        if (!sel.on) f.append(UI.numField({ id: 'se-bend', label: T('sk.panel.bendRadius'), value: sel.bend || 0, unit: 'mm', expr: false, onCommit: (v) => upd((e) => { if (Math.abs(v) < 1e-6) delete e.bend; else e.bend = v; }) }));
        // An Kreis oder Bogen legen: die Grundlinie läuft auf dem nächsten Kreis, Mitte des Texts dort, wo er gerade steht
        const rounds = S.ents.filter((x) => x.type === 'circle' || x.type === 'arc');
        if (rounds.length && !sel.on) {
          const ob = h('button', { type: 'button', class: 'btn', id: 'se-oncircle' }); ob.innerHTML = icon('circle') + esc(T('sk.panel.onCircle'));
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
        const tb = SK.textBox(sel); if (tb) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('common.size')), h('b', { class: 'mono' }, `${Units.fmtLen(tb.w, 2)} × ${Units.fmtLen(tb.h, 2)} ${Units.label()}`)));
        const cb = h('button', { type: 'button', class: 'btn', id: 'se-text-curves', 'data-help': 'textCurves' }); cb.innerHTML = icon('spline') + esc(T('sk.panel.toCurves'));
        cb.onclick = () => textToCurves(sel.id);
        w.append(h('div', { class: 'btn-row' }, cb));
      }
      else if (sel.type === 'ellipse') {
        f.append(dimField('w', T('sk.panel.axis1Width'), 'mm', { min: 0.01 }), dimField('h', T('sk.panel.axis2Height'), 'mm', { min: 0.01 }));
        f.append(UI.numField({ id: 'se-rot', label: T('ctx.rotate'), value: round(((sel.rot || 0) * 180) / Math.PI, 6), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
      }
      else if (sel.type === 'ellarc') {
        f.append(dimField('rx', T('sk.panel.semiAxis1'), 'mm', { min: 0.01 }), dimField('ry', T('sk.panel.semiAxis2'), 'mm', { min: 0.01 }));
        const degN = (r) => round(((r || 0) * 180) / Math.PI, 4);
        f.append(UI.numField({ id: 'se-a0', label: T('sk.panel.startAng'), value: degN(sel.a0), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.a0 = (v * Math.PI) / 180; }) }));
        f.append(UI.numField({ id: 'se-a1', label: T('sk.panel.endAng'), value: degN(sel.a1), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.a1 = (v * Math.PI) / 180; }) }));
        f.append(UI.numField({ id: 'se-rot', label: T('ctx.rotate'), value: degN(sel.rot), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
      }
      else if (sel.type === 'poly') {
        f.append(dimField('d', T('param.dia'), 'mm', { min: 0.01 }), dimField('n', T('sk.panel.corners'), '', { min: 3, int: true }));
        // Drehung: 0° = eine Ecke zeigt nach oben
        f.append(UI.numField({ id: 'se-rot', label: T('ctx.rotate'), value: round(((sel.rot || 0) * 180) / Math.PI, 6), unit: '°', expr: false, onCommit: (v) => upd((e) => { e.rot = (v * Math.PI) / 180; }) }));
      }
      else if (sel.type === 'slot') { f.append(dimField('len', T('sk.panel.slotLenMM'), 'mm', { min: 0.01 }), dimField('w', T('param.w'), 'mm', { min: 0.01 })); }
      else if (sel.type === 'arc') {
        // Radius oder Bogenlänge als Feld: Eintippen legt den Wert fest
        if (SK.arcInfo(sel.a, sel.m, sel.b)) f.append(dimField('r', T('sk.dim.r'), 'mm', { min: 0.01 }), dimField('arcLen', T('sk.dim.arcLen'), 'mm', { min: 0.01 }));
      }
      else if (sel.type === 'conic') {
        f.append(UI.numField({ id: 'se-rho', label: T('sk.panel.conicRho'), value: sel.rho != null ? sel.rho : 0.5, unit: '', expr: false, min: 0.05, max: 0.95, step: 0.05, onCommit: (v) => upd((e) => { e.rho = round(clamp(v, 0.05, 0.95), 4); }) }));
      }
      else if (sel.type === 'bridge') {
        f.append(UI.selectField({ id: 'se-br-mode', label: T('sk.panel.bridgeMode'), value: sel.mode || 'g1', options: [['g1', T('sk.panel.bridgeG1')], ['g2', T('sk.panel.bridgeG2')]], onChange: (v) => upd((e) => { e.mode = v; SK.syncBridges(S.ents); }) }));
        f.append(UI.numField({ id: 'se-br-s1', label: T('sk.panel.bridgeS1'), value: sel.s1 != null ? sel.s1 : 1, unit: '', expr: false, min: 0.1, max: 4, step: 0.1, onCommit: (v) => upd((e) => { e.s1 = round(clamp(v, 0.1, 4), 3); SK.syncBridges(S.ents); }) }));
        f.append(UI.numField({ id: 'se-br-s2', label: T('sk.panel.bridgeS2'), value: sel.s2 != null ? sel.s2 : 1, unit: '', expr: false, min: 0.1, max: 4, step: 0.1, onCommit: (v) => upd((e) => { e.s2 = round(clamp(v, 0.1, 4), 3); SK.syncBridges(S.ents); }) }));
      }
      w.append(f);
      if (sel.type === 'conic') w.append(h('div', { class: 'hint-box', id: 'se-conic-kind' }, conicKindLabel(sel.rho != null ? sel.rho : 0.5)));
      if (sel.type === 'spline') {
        if (!isSimpleMode()) {
          const mf = UI.selectField({
            id: 'se-sp-mode', label: T('common.kind'), value: sel.mode === 'cv' ? 'cv' : 'fit',
            options: [['fit', T('sk.panel.splineFit')], ['cv', T('sk.panel.splineCV')]],
            onChange: (v) => upd((e) => {
              if (v === 'cv') {
                e.mode = 'cv'; delete e.handles; S.selHandle = null;
                S.dims = S.dims.filter((d) => !(d.e === e.id && /^h(Ang|Len)\d+$/.test(d.k)));
                S.cons = S.cons.filter((c) => !conRefs(c).some((r) => r && r.e === e.id && (/^h\d+$/.test(r.p || '') || r.handle != null)));
              } else delete e.mode;
            }),
          });
          mf.dataset.help = 'splineControl';
          w.append(mf);
        }
        if (sel.pts && sel.pts.length >= 3) {
          const cl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'se-sp-closed', checked: !!sel.closed }), T('sk.panel.splineClosed'));
          cl.querySelector('input').onchange = (ev) => upd((e) => { e.closed = ev.target.checked; });
          w.append(cl);
        }
        if (sel.mode !== 'cv' && !isSimpleMode() && sel.pts && sel.pts.length >= 2) {
          const hi = (S.selHandle && S.selHandle.e === sel.id && S.selHandle.i >= 0 && S.selHandle.i < sel.pts.length) ? S.selHandle.i : 0;
          const sec = h('div', { class: 'section', id: 'se-spline-handles', 'data-help': 'splineHandles' }, h('div', { class: 'section-h' }, T('sk.panel.splineHandlesHead')));
          const ptOpts = sel.pts.map((_, idx) => [
            String(idx),
            !sel.closed && idx === 0 ? T('sk.panel.handleStart', { n: 1 }) : !sel.closed && idx === sel.pts.length - 1 ? T('sk.panel.handleEnd', { n: idx + 1 }) : T('sk.panel.handlePoint', { n: idx + 1 }),
          ]);
          sec.append(UI.selectField({ id: 'se-sh-pt', label: T('sk.tool.point'), value: String(hi), options: ptOpts, onChange: (v) => selectSplineHandle(sel.id, +v) }));
          const hf = h('div', { class: 'fields' });
          hf.append(dimField('hAng' + hi, T('sk.panel.handleAngle'), '°'), dimField('hLen' + hi, T('sk.panel.handleStrength'), 'mm', { min: 0.1 }));
          sec.append(hf);
          const isCustom = Array.isArray(sel.handles) && Array.isArray(sel.handles[hi]);
          const rb = h('button', { type: 'button', class: 'btn', id: 'se-sh-reset' }, T('sk.panel.handleReset'));
          rb.disabled = !isCustom;
          rb.onclick = () => resetSplineHandle(sel.id, hi);
          sec.append(h('div', { class: 'btn-row' }, rb), h('div', { class: 'hint-box', html: T('sk.panel.splineHandlesHint') }));
          w.append(sec);
        }
      }
      if (sel.type === 'ellarc') {
        const fb = h('button', { type: 'button', class: 'btn', id: 'se-ellarc-flip' });
        fb.innerHTML = icon('rotate') + esc(T('sk.panel.ellArcFlip'));
        fb.onclick = () => upd((e) => { e.ccw = e.ccw === false; });
        w.append(h('div', { class: 'btn-row' }, fb));
      }
      if (sel.type === 'poly') {
        const nn = Math.max(3, Math.round(sel.n || 6)), bt = (id, ic, label, rot) => { const b = h('button', { type: 'button', class: 'btn', id }); b.innerHTML = icon(ic) + esc(label); b.onclick = () => upd((e) => { e.rot = rot; }); return b; };
        w.append(h('div', { class: 'btn-row' }, bt('se-poly-corner', 'polygon', T('sk.panel.polyCornerTop'), 0), bt('se-poly-flat', 'rect', T('sk.panel.polyFlatTop'), Math.PI / nn)));
      }
      const fp = h('div', { class: 'fields' });
      const ak = sel.type === 'circle' || sel.type === 'poly' || sel.type === 'ellipse' || sel.type === 'ellarc' ? T('sk.panel.anchorCenter') : sel.type === 'point' ? T('sk.panel.anchorPoint') : T('sk.panel.anchorStart');
      fp.append(dimField('x', T('sk.panel.anchorX', { ak })), dimField('y', T('sk.panel.anchorY', { ak })));
      w.append(fp);
      if (S.dims.some((d) => d.e === sel.id)) w.append(h('div', { class: 'hint-box', html: T('sk.panel.lockHint') }));
      // Regeln an diesem Element
      const mine = S.cons.filter((c) => conRefs(c).some((r) => r && r.e === sel.id));
      if (mine.length) {
        const list = h('div', { class: 'mini-list' });
        for (const c of mine) {
          const row = h('div', { class: 'mini-row' });
          const ic = h('span', { class: 'con-ic' }); ic.innerHTML = icon(CICON[c.type] || 'info');
          const x = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': T('sk.panel.delCon'), 'aria-label': T('sk.panel.delCon') }); x.innerHTML = icon('close'); x.onclick = () => removeCons(c.id);
          row.append(ic, h('span', { class: 'grow' }, cname(c.type) || c.type), x); list.append(row);
        }
        w.append(h('div', { class: 'section-h' }, T('sk.panel.rulesHead')), list);
      }
      const isFree = !S.status || !S.status.freeEnts || S.status.freeEnts.has(sel.id);
      w.append(h('div', { class: isFree ? 'hint-box' : 'ok-box', html: T(isFree ? 'sk.panel.entFree' : 'sk.panel.entFixed') }));
      w.append(h('div', { class: 'btn-row' }, buildFreeBtn()));
      appendFreeInfo();
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'se-con', checked: !!sel.con }), T('sk.panel.conCheck'));
      con.querySelector('input').onchange = (e) => upd((x) => { x.con = e.target.checked; });
      w.append(con);
      if (sel.type === 'line') {
        const ra = h('label', { class: 'check', 'data-help': 'revolveAxis' }, h('input', { type: 'checkbox', id: 'se-rev-axis', checked: !!sel.revAxis }), T('sk.panel.revAxisCheck'));
        ra.querySelector('input').onchange = (e) => setRevAxis(sel.id, e.target.checked);
        w.append(ra);
      }
      if (sel.type === 'spline' || sel.type === 'arc' || sel.type === 'ellarc' || sel.type === 'ellipse') appendCurvControls(w);
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + esc(T('common.delete'));
      del.onclick = () => deleteEnt(sel.id);
      if (!S.blockEdit && !sel.blk) {
        const mb = h('button', { type: 'button', class: 'btn pro', id: 'sk-make-block', 'data-help': 'sketchBlocks' }); mb.innerHTML = icon('sketchBlock') + esc(T('sk.block.makeBtn'));
        mb.onclick = () => createBlock('', [sel.id]);
        w.append(h('div', { class: 'btn-row' }, mb, del));
      } else w.append(h('div', { class: 'btn-row' }, del));
    } else if (sels.length > 1) {
      w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' }, id: 'sk-sel-count' }, T('sk.panel.multiSelCount', { n: sels.length }))));
      w.append(h('div', { class: 'hint-box', html: T('sk.panel.multiSelHint') }));
      const mv = h('button', { type: 'button', class: 'btn primary', id: 'sk-sel-move' }); mv.innerHTML = icon('arrowR') + esc(T('sk.panel.moveOrRotate'));
      mv.onclick = () => setTool('xmove');
      const cn = h('button', { type: 'button', class: 'btn', id: 'sk-sel-con' }); cn.innerHTML = icon('construct') + esc(T('sk.bar.con'));
      cn.onclick = () => toggleConstruction();
      const del = h('button', { type: 'button', class: 'btn danger', id: 'sk-sel-del' }); del.innerHTML = icon('trash') + esc(T('common.delete'));
      del.onclick = () => deleteEnts(sels);
      const row2 = [cn];
      if (!S.blockEdit && sels.some((id) => { const e = ent(id); return e && !e.blk; })) {
        const mb = h('button', { type: 'button', class: 'btn pro', id: 'sk-make-block', 'data-help': 'sketchBlocks' }); mb.innerHTML = icon('sketchBlock') + esc(T('sk.block.makeBtn'));
        mb.onclick = () => createBlock('', sels);
        row2.push(mb);
      }
      row2.push(del);
      w.append(h('div', { class: 'btn-row' }, mv), h('div', { class: 'btn-row' }, ...row2));
    } else {
      // Zustand der ganzen Skizze
      const st = S.status;
      if (st && S.ents.length) {
        if (!st.ok && !(S.conflict && S.conflict.items.length)) w.append(h('div', { class: 'err-box', html: '<b>' + ERRORS.sketchOverConstrained.titel + '</b><br>' + ERRORS.sketchOverConstrained.erklaerung + ' ' + ERRORS.sketchOverConstrained.loesung }));
        else if (st.ok && st.dof === 0) w.append(h('div', { class: 'ok-box', html: T('sk.panel.fullyDefined') }));
        else if (st.ok) w.append(h('div', { class: 'hint-box', html: T('sk.panel.dofLeft', { dof: st.dof, word: T(st.dof === 1 ? 'sk.panel.dofOne' : 'sk.panel.dofMany'), col: Viewer.theme.dark ? '#5aa9ff' : '#1c6fd1' }) }));
      }
      if (!isLoftLine() && S.ctx.mode !== 'patpath' && !isPathEdit() && S.ctx.mode !== 'patpoints' && !isPointsEdit()) {
        if (S.autoDef) {
          const ad = S.autoDef;
          const box = h('div', { class: 'sk-autodef-box', id: 'sk-autodef-box' });
          const headParts = [];
          if (ad.cons.length) headParts.push(ad.cons.length === 1 ? T('sk.panel.adRuleOne') : T('sk.panel.adRuleMany', { n: ad.cons.length }));
          if (ad.dims.length) headParts.push(ad.dims.length === 1 ? T('sk.panel.adDimOne') : T('sk.panel.adDimMany', { n: ad.dims.length }));
          box.append(h('div', { class: 'sk-autodef-head' }, h('b', null, T('sk.panel.adProposal', { parts: headParts.join(', ') }))));
          const list = h('div', { class: 'sk-autodef-list' });
          const cc = new Map();
          for (const c of ad.cons) cc.set(c.type, (cc.get(c.type) || 0) + 1);
          const dc = new Map();
          for (const d of ad.dims) {
            const grp = d.k === 'x' || d.k === 'y' ? T('sk.panel.adGrpPos') : d.k === 'd' || d.k === 'r' ? T('sk.panel.adGrpDia') : d.k === 'ang' ? T('sk.panel.adGrpAng') : T('sk.panel.adGrpLen');
            dc.set(grp, (dc.get(grp) || 0) + 1);
          }
          for (const [t, n] of cc) list.append(h('span', null, `${n}× ${cname(t) || t}`));
          for (const [g, n] of dc) list.append(h('span', null, `${n}× ${g}`));
          if (ad.dofAfter === 0) list.append(h('span', { style: { color: 'var(--ok)', fontWeight: '600' } }, T('sk.panel.adDoneMsg')));
          box.append(list, h('div', { class: 'hint-box' }, T('sk.panel.adDashedHint')));
          const ap = h('button', { type: 'button', class: 'btn primary', id: 'sk-autodef-apply' }); ap.innerHTML = icon('check') + esc(T('common.apply')); ap.onclick = () => applyAutoDefine();
          const ca = h('button', { type: 'button', class: 'btn', id: 'sk-autodef-cancel' }); ca.innerHTML = icon('close') + esc(T('common.cancel')); ca.onclick = () => cancelAutoDefine();
          box.append(h('div', { class: 'btn-row' }, ap, ca));
          w.append(box, h('div', { class: 'btn-row' }, buildFreeBtn()));
        } else {
          const adBtn = h('button', { type: 'button', class: 'btn', id: 'sk-autodef', 'data-help': 'sketchAutoDefine' });
          adBtn.innerHTML = icon('lock') + esc(T('sk.panel.autoDefBtn'));
          adBtn.onclick = () => proposeAutoDefine();
          w.append(h('div', { class: 'btn-row' }, adBtn, buildFreeBtn()));
        }
        appendFreeInfo();
      }
      w.append(h('div', { class: 'hint-box', html: hintFor(S.tool) }));
      if (S.tool === 'dim') {
        if (isSimpleMode() && S.dimMode === 'ord') { S.dimMode = 'auto'; S.ordBase = null; }
        const opts = [['auto', T('sk.panel.dimAuto')], ['arcLen', T('sk.panel.dimArcLen')], ['ang3', T('sk.panel.dimAng3')]];
        if (!isSimpleMode()) opts.push(['ord', T('sk.panel.dimOrd')]);
        const dmField = UI.selectField({ id: 'dm-mode', label: T('sk.panel.dimMode'), value: S.dimMode || 'auto', options: opts, onChange: (v) => setDimMode(v) });
        dmField.dataset.help = 'dimModes';
        w.append(dmField);
        if ((S.dimMode || 'auto') === 'auto') {
          const cf = UI.selectField({
            id: 'dm-circ', label: T('sk.panel.dimCircLabel'), value: S.dimCircMode || 'center',
            options: [['center', T('sk.panel.dimCircCenter')], ['min', T('sk.panel.dimCircMin')], ['max', T('sk.panel.dimCircMax')]],
            onChange: (v) => setDimCircMode(v),
          });
          cf.dataset.help = 'circleEdgeDim';
          w.append(cf);
        }
        if (S.dimMode === 'ord' && !isSimpleMode()) {
          const ob = h('div', { class: 'pro', style: { display: 'grid', gap: '6px' }, dataset: { help: 'ordinateDim' } });
          const baseName = S.ordBase ? (S.ordBase.ref.e === 'origin' ? 'Ursprung' : entName(S.ordBase.ref.e)) : '';
          ob.append(h('div', { class: S.ordBase ? 'ok-box' : 'hint-box', id: 'dm-ord-status', html: S.ordBase ? T('sk.panel.ordBaseSet', { name: esc(baseName) }) : T('sk.panel.ordBaseNone') }));
          if (S.ordBase && S.ordBase.kind === 'point') {
            ob.append(UI.selectField({ id: 'dm-ord-axis', label: T('sk.panel.ordAxis'), value: S.ordBase.axis || 'auto', options: [['auto', T('sk.panel.ordAxisAuto')], ['x', T('sk.panel.ordAxisX')], ['y', T('sk.panel.ordAxisY')]], onChange: (v) => { S.ordAxis = v; if (S.ordBase) S.ordBase.axis = v; render(); } }));
          }
          if (S.ordBase) {
            const rb = h('button', { type: 'button', class: 'btn', id: 'dm-ord-reset' }, T('sk.panel.ordBaseReset'));
            rb.onclick = () => { S.ordBase = null; UI.hint(hintFor('dim')); render(); Panels.renderRight(); };
            ob.append(h('div', { class: 'btn-row' }, rb));
          }
          w.append(ob);
        }
      }
      if (S.tool === 'corner') {
        const C = S.corner;
        const opts = [['fillet', T('sk.panel.cornerFillet')], ['chamfer', T('sk.panel.cornerChamfer')], ['meet', T('sk.panel.cornerMeet')]];
        const onMode = (v) => { C.mode = v; S.meetFirst = null; S.cornerHover = null; UI.hint(v === 'meet' ? T('sk.panel.cornerMeetHint') : hintFor('corner')); Panels.renderRight(); render(); };
        w.append(UI.segmented ? UI.segmented({ id: 'cn-mode', value: C.mode, options: opts, onChange: onMode }) : UI.selectField({ id: 'cn-mode', label: T('common.kind'), value: C.mode, options: opts, onChange: onMode }));
        if (C.mode !== 'meet') {
          w.append(UI.numField({ id: 'cn-r', label: C.mode === 'fillet' ? T('sk.dim.r') : T('sk.dim.dist'), value: C.r, unit: 'mm', expr: false, min: 0.01, onCommit: (v) => { if (v > 0) C.r = v; render(); } }));
          const ab = h('button', { type: 'button', class: 'btn', id: 'cn-all' }); ab.innerHTML = icon('fillet') + esc(T('sk.panel.cornerAll')); ab.onclick = () => cornerAll(); w.append(h('div', { class: 'btn-row' }, ab));
        }
      }
      if (S.tool === 'bg' || S.tool === 'bgcal') {
        const B = S.bg;
        const lb = h('button', { type: 'button', class: 'btn' + (B ? '' : ' primary'), id: 'bg-load' }); lb.innerHTML = icon('image') + esc(T(B ? 'sk.panel.bgOther' : 'sk.panel.bgLoad')); lb.onclick = bgLoad;
        w.append(h('div', { class: 'btn-row' }, lb));
        if (B) {
          const cal = h('button', { type: 'button', class: 'btn' + (S.tool === 'bgcal' ? ' primary' : ''), id: 'bg-cal' }, T(S.tool === 'bgcal' ? 'sk.panel.bgCalPick' : 'sk.panel.bgCalBtn'));
          cal.onclick = () => { S.bgCal = null; setTool(S.tool === 'bgcal' ? 'bg' : 'bgcal'); };
          w.append(h('div', { class: 'btn-row' }, cal));
          const f4 = h('div', { class: 'fields' });
          f4.append(UI.numField({ id: 'bg-w', label: T('param.w'), value: B.w, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) { B.w = v; render(); } } }));
          f4.append(UI.numField({ id: 'bg-op', label: T('sk.panel.bgOpacity'), value: Math.round((B.op ?? 0.5) * 100), unit: '%', expr: false, min: 5, int: true, onCommit: (v) => { B.op = clamp(v, 5, 100) / 100; render(); } }));
          w.append(f4);
          const hide = h('button', { type: 'button', class: 'btn', id: 'bg-hide' }, T(B.hide ? 'panel.tree.show' : 'common.hide')); hide.onclick = () => { B.hide = !B.hide; render(); Panels.renderRight(); };
          const del = h('button', { type: 'button', class: 'btn danger', id: 'bg-del' }); del.innerHTML = icon('trash') + esc(T('common.remove')); del.onclick = () => { S.bg = null; render(); Panels.renderRight(); };
          w.append(h('div', { class: 'btn-row' }, hide, del));
          w.append(h('div', { class: 'hint-box', html: T('sk.panel.bgHint') }));
        }
      }
      if (S.tool === 'wall') {
        const fw = h('div', { class: 'fields' });
        fw.append(UI.numField({ id: 'wall-t', label: T('param.wall'), value: S.wallT, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) S.wallT = v; } }));
        w.append(fw);
      }
      if (S.tool === 'project') {
        const fp = h('div', { class: 'fields' });
        fp.append(UI.numField({ id: 'proj-off', label: T('sk.panel.projOffLabel'), value: S.projOff || 0, unit: 'mm', expr: false, onCommit: (v) => { S.projOff = isFinite(v) ? v : 0; } }));
        w.append(fp);
      }
      if (S.tool === 'silhouette') {
        w.append(h('div', { class: 'hint-box', id: 'sil-hint', html: T('sk.panel.silHint') }));
      }
      if (S.tool === 'intersect') {
        w.append(h('div', { class: 'hint-box', id: 'ic-hint', html: T('sk.panel.icHint') }));
        if (S.icPick) {
          const src = Model.find(App.doc, S.icPick.id);
          const rb = h('button', { type: 'button', class: 'btn', id: 'ic-reset' }); rb.innerHTML = icon('close') + esc(T('sk.panel.icReset'));
          rb.onclick = () => { S.icPick = null; Viewer.highlightFace('sel', null, null); UI.hint(hintFor('intersect')); Panels.renderRight(); };
          w.append(h('div', { class: 'ok-box', id: 'ic-picked', html: T('sk.panel.icPicked', { name: esc(src ? Model.label(src.item) : T('sk.panel.linkSomeBody')) }) }), h('div', { class: 'btn-row' }, rb));
        }
      }
      if (S.tool === 'offset') {
        const O = S.off;
        const fo = h('div', { class: 'fields' });
        fo.append(UI.numField({ id: 'off-n', label: T('common.count'), value: O.count, unit: '', expr: false, min: 1, int: true, onCommit: (v) => { O.count = clamp(Math.round(v), 1, 20); render(); } }));
        fo.append(UI.selectField({ id: 'off-corner', label: T('sk.panel.corners'), value: O.corners, options: [['sharp', T('sk.panel.offSharp')], ['round', T('sk.panel.offRound')]], onChange: (v) => { O.corners = v; const el = $('#off-corner'); if (el) el.blur(); render(); } }));
        w.append(fo);
        const bt = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'off-both', checked: !!O.both }), T('sk.panel.offBoth'));
        bt.querySelector('input').onchange = (e) => { O.both = e.target.checked; e.target.blur(); render(); };
        w.append(bt);
      }
      if (S.tool === 'tpl') {
        const tp = S.tpl;
        w.append(UI.selectField({ id: 'tp-type', label: T('sk.panel.tplLabel'), value: tp.type, options: Object.entries(SKO.TEMPLATES).map(([k, v]) => [k, v.name]), onChange: (v) => { tp.type = v; tp.p = { ...SKO.TEMPLATES[v].p }; Panels.renderRight(); render(); } }));
        const f6 = h('div', { class: 'fields' });
        for (const k of Object.keys(SKO.TEMPLATES[tp.type].p)) {
          const isInt = ['nx', 'ny', 'n'].includes(k);
          f6.append(UI.numField({ id: 'tp-' + k, label: SKO.TPLNAMES[k] || k, value: tp.p[k], unit: isInt ? '' : 'mm', expr: false, int: isInt, min: isInt ? 1 : 0, onCommit: (v) => { tp.p[k] = v; render(); } }));
        }
        const note = SKO.TEMPLATES[tp.type].note;
        w.append(f6);
        if (note) w.append(h('div', { class: 'hint-box', id: 'tp-note' }, note));
        w.append(h('div', { class: 'hint-box', html: T('sk.panel.tplHint') }));
      }
      if (S.tool === 'text') {
        const tx = S.txt;
        if (!SK.FONTNAMES[tx.font]) tx.font = 'inter';
        w.append(UI.textField({ id: 'tx-s', label: T('sk.tool.text'), value: tx.s, live: true, onCommit: (v) => { tx.s = v; } }));
        const f3 = h('div', { class: 'fields' });
        f3.append(UI.numField({ id: 'tx-h', label: T('sk.panel.textHeight'), value: tx.h, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { if (v > 0) tx.h = v; } }));
        f3.append(UI.selectField({ id: 'tx-font', label: T('sk.panel.font'), value: tx.font, options: Object.entries(SK.FONTNAMES), onChange: (v) => { tx.font = v; ensureSketchFonts(v); } }));
        f3.append(UI.selectField({ id: 'tx-align', label: T('sk.panel.align'), value: tx.align, options: [['l', T('sk.panel.alignL')], ['m', T('sk.panel.alignM')], ['r', T('sk.panel.alignR')]], onChange: (v) => { tx.align = v; } }));
        const lf = h('button', { type: 'button', class: 'btn', id: 'tx-load-font', 'data-help': 'loadFont' }); lf.innerHTML = icon('folder') + esc(T('sk.panel.loadFont'));
        lf.onclick = () => pickFont(null);
        w.append(f3, h('div', { class: 'btn-row' }, lf));
        if (SK.isFontLoaded && !SK.isFontLoaded(tx.font)) w.append(h('div', { class: 'hint-box', id: 'tx-font-loading' }, T('sk.panel.fontLoading')));
      }
      if (S.tool === 'slot') w.append(UI.selectField({ id: 'sl-mode', label: T('sk.tool.slot'), value: S.slotArc ? 'arc' : S.slotTotal ? 'total' : 'line', options: [['line', T('sk.panel.slotModeLine')], ['total', T('sk.panel.slotModeTotal')], ['arc', T('sk.panel.slotModeArc')]], onChange: (v) => { S.slotArc = v === 'arc'; S.slotTotal = v === 'total'; S.draft = null; render(); UI.hint(S.slotArc ? T('sk.panel.slotArcHint') : hintFor('slot')); } }));
      if (S.tool === 'circle') w.append(UI.selectField({ id: 'ci-mode', label: T('sk.tool.circle'), value: S.circMode || 'center', options: [['center', T('sk.panel.circCenter')], ['2p', T('sk.panel.circ2p')], ['3p', T('sk.panel.circ3p')]], onChange: (v) => { S.circMode = v; S.draft = null; render(); } }));
      if (S.tool === 'arc') w.append(UI.selectField({ id: 'ar-mode', label: T('sk.tool.arc'), value: S.arcMode || '3p', options: [['3p', T('sk.panel.arc3p')], ['center', T('sk.panel.arcCenter')], ['tan', T('sk.panel.arcTan')]], onChange: (v) => { S.arcMode = v; S.draft = null; render(); } }));
      if (S.tool === 'line') w.append(UI.selectField({ id: 'ln-mode', label: T('sk.tool.line'), value: S.lineMode || 'line', options: [['line', T('sk.panel.linePoly')], ['tan2', T('sk.panel.lineTan2')]], onChange: (v) => { S.lineMode = v; S.draft = null; S.tanFirst = null; UI.hint(v === 'tan2' ? T('sk.panel.lineTan2Hint') : hintFor('line')); render(); } }));
      if (S.tool === 'rect') w.append(UI.numField({ id: 'rk-r', label: T('sk.panel.rectR'), value: S.rectR || 0, unit: 'mm', expr: false, min: 0, onCommit: (v) => { S.rectR = v > 0 ? v : 0; } }));
      if (S.tool === 'rect') w.append(UI.selectField({ id: 'rk-mode', label: T('sk.panel.rectPull'), value: S.rect3 ? 'r3' : S.rectMid ? 'mid' : 'corner', options: [['corner', T('sk.panel.rectCorner')], ['mid', T('sk.panel.rectMid')], ['r3', T('sk.panel.rect3p')]], onChange: (v) => { S.rectMid = v === 'mid'; S.rect3 = v === 'r3'; if (S.draft) S.draft = null; render(); } }));
      if (S.tool === 'poly') w.append(UI.selectField({ id: 'po-mode', label: T('sk.panel.polyMeasure'), value: S.polyFlats ? 'flats' : 'corners', options: [['corners', T('sk.panel.polyCorners')], ['flats', T('sk.panel.polyFlats')]], onChange: (v) => { S.polyFlats = v === 'flats'; } }));
      if (S.tool === 'poly') w.append(UI.numField({ id: 'sk-n', label: T('sk.panel.corners'), value: S.polySides, unit: '', expr: false, min: 3, int: true, onCommit: (v) => { S.polySides = clamp(v, 3, 64); } }));
      if (S.tool === 'ellarc') w.append(UI.selectField({ id: 'ea-dir', label: T('sk.panel.ellArcDir'), value: S.ellArcCW ? 'cw' : 'ccw', options: [['ccw', T('sk.panel.ellArcCCW')], ['cw', T('sk.panel.ellArcCW')]], onChange: (v) => { S.ellArcCW = v === 'cw'; render(); } }));
      if (S.tool === 'conic' && !isSimpleMode()) {
        w.append(UI.numField({ id: 'cn-rho', label: T('sk.panel.conicRho'), value: S.conicRho, unit: '', expr: false, min: 0.05, max: 0.95, step: 0.05, onCommit: (v) => { S.conicRho = round(clamp(v, 0.05, 0.95), 4); render(); Panels.renderRight(); } }));
        w.append(h('div', { class: 'hint-box', id: 'cn-kind' }, conicKindLabel(S.conicRho)));
      }
      if (S.tool === 'bridge' && !isSimpleMode()) {
        const B = S.bridge;
        const fb = h('div', { class: 'fields' });
        fb.append(UI.selectField({ id: 'br-mode', label: T('sk.panel.bridgeMode'), value: B.mode, options: [['g1', T('sk.panel.bridgeG1')], ['g2', T('sk.panel.bridgeG2')]], onChange: (v) => { B.mode = v; render(); } }));
        fb.append(UI.numField({ id: 'br-s1', label: T('sk.panel.bridgeS1'), value: B.s1, unit: '', expr: false, min: 0.1, max: 4, step: 0.1, onCommit: (v) => { B.s1 = round(clamp(v, 0.1, 4), 3); render(); } }));
        fb.append(UI.numField({ id: 'br-s2', label: T('sk.panel.bridgeS2'), value: B.s2, unit: '', expr: false, min: 0.1, max: 4, step: 0.1, onCommit: (v) => { B.s2 = round(clamp(v, 0.1, 4), 3); render(); } }));
        w.append(fb);
        w.append(h('div', { class: B.first ? 'ok-box' : 'hint-box', id: 'br-info' }, T(B.first ? 'sk.panel.bridgeWait2' : 'sk.panel.bridgeWait1')));
        if (B.first) {
          const rb = h('button', { type: 'button', class: 'btn', id: 'br-reset' }, T('sk.panel.bridgeReset'));
          rb.onclick = () => { B.first = null; B.hoverEnd = null; UI.hint(hintFor('bridge')); render(); Panels.renderRight(); };
          w.append(h('div', { class: 'btn-row' }, rb));
        }
      }
      if (S.tool === 'spline' && !isSimpleMode()) {
        const sm = UI.selectField({ id: 'sp-mode', label: T('sk.tool.spline'), value: S.splineMode || 'fit', options: [['fit', T('sk.panel.splineFit')], ['cv', T('sk.panel.splineCV')]], onChange: (v) => setSplineMode(v) });
        sm.dataset.help = 'splineControl';
        w.append(sm);
      }
      if (S.tool === 'patrect' || S.tool === 'patcirc') {
        const P = S.pat; const f2 = h('div', { class: 'fields' });
        const fld = (id, label, key, unit, opts = {}) => f2.append(UI.numField({ id, label, value: P[key], unit, expr: false, min: opts.min, int: opts.int, onCommit: (v) => { P[key] = v; render(); } }));
        if (S.tool === 'patrect') { fld('pt-nx', T('sk.panel.nx'), 'nx', '', { min: 1, int: true }); fld('pt-dx', T('sk.panel.dx'), 'dx', 'mm'); fld('pt-ny', T('sk.panel.ny'), 'ny', '', { min: 1, int: true }); fld('pt-dy', T('sk.panel.dy'), 'dy', 'mm'); }
        else { fld('pt-n', T('common.count'), 'n', '', { min: 2, int: true }); fld('pt-ang', T('sk.panel.totalAngle'), 'ang', '°'); }
        w.append(f2);
        if (S.tool === 'patcirc') {
          const cb = h('button', { type: 'button', class: 'btn' + (S.patPick ? ' primary' : ''), id: 'pt-center' }, T(S.patPick ? 'sk.panel.pickPtWait' : 'sk.panel.pickCenter'));
          cb.onclick = () => { S.patPick = !S.patPick; UI.hint(S.patPick ? T('sk.panel.pickCenterHint') : hintFor('patcirc')); Panels.renderRight(); render(); };
          w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.centerPrefix') + T(S.patCenter ? 'sk.panel.centerPicked' : 'sk.panel.centerOrigin'))), h('div', { class: 'btn-row' }, cb));
        }
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'pt-make' }, T('sk.panel.makePattern', { n: S.patSel.length }));
        ok.disabled = !S.patSel.length; ok.onclick = () => createPattern();
        w.append(h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'patcurve') {
        const P = S.pat;
        const cEnt = S.patCurve ? ent(S.patCurve) : null;
        const cName = cEnt ? T('sk.panel.ent.' + cEnt.type) : T('sk.panel.curveNone');
        const cb = h('button', { type: 'button', class: 'btn' + (S.patPickCurve ? ' primary' : ''), id: 'pt-pick-curve' }, T(S.patPickCurve ? 'sk.panel.curvePicking' : 'sk.panel.curvePick'));
        cb.onclick = () => { S.patPickCurve = !S.patPickCurve; UI.hint(hintFor('patcurve')); Panels.renderRight(); render(); };
        w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.curvePrefix') + cName), h('div', { class: 'btn-row' }, cb)));
        w.append(UI.selectField({
          id: 'pt-cmode', label: T('sk.panel.curveMode'), value: P.curveMode || 'count',
          options: [['count', T('sk.panel.curveModeCount')], ['spacing', T('sk.panel.curveModeSpacing')]],
          onChange: (v) => { P.curveMode = v; Panels.renderRight(); render(); },
        }));
        const infoBox = h('div', { id: 'pt-cinfo' });
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'pt-make' }, T('sk.panel.makePattern', { n: S.patSel.length }));
        const syncCurveUI = (redraw = true) => {
          const plan = curvePlan();
          infoBox.innerHTML = '';
          if (plan && plan.ok) {
            infoBox.className = 'ok-box';
            infoBox.innerHTML = T('sk.panel.curveInfo', { len: Units.fmtLenU(plan.len, 2), n: plan.count, step: Units.fmtLenU(plan.spacing, 2) });
            ok.disabled = !(S.patSel.length > 0 && plan.jobs.length > 0);
          } else {
            infoBox.className = 'hint-box';
            infoBox.textContent = (plan && plan.why) || T('sk.toast.patCurveNeedCurve');
            ok.disabled = true;
          }
          if (redraw) render();
        };
        const f2 = h('div', { class: 'fields' });
        if ((P.curveMode || 'count') === 'spacing') {
          f2.append(UI.numField({ id: 'pt-cdist', label: T('sk.panel.curveDist'), value: P.curveDist, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { P.curveDist = v; syncCurveUI(); } }));
        } else {
          f2.append(UI.numField({ id: 'pt-cn', label: T('common.count'), value: P.curveN, unit: '', expr: false, min: 2, int: true, onCommit: (v) => { P.curveN = v; syncCurveUI(); } }));
        }
        w.append(f2);
        const al = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pt-calign', checked: P.curveAlign !== false }), T('sk.panel.curveAlign'));
        al.querySelector('input').onchange = (e) => { P.curveAlign = e.target.checked; syncCurveUI(); };
        const fl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pt-cflip', checked: !!P.curveFlip }), T('sk.panel.curveFlip'));
        fl.querySelector('input').onchange = (e) => { P.curveFlip = e.target.checked; syncCurveUI(); };
        ok.onclick = () => createPattern();
        syncCurveUI(false);
        w.append(al, fl, infoBox, h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'patfill') {
        const F = S.fill;
        w.append(UI.selectField({
          id: 'fp-kind', label: T('sk.panel.fillKind'), value: F.kind,
          options: [['grid', T('sk.panel.fillGrid')], ['staggered', T('sk.panel.fillStaggered')], ['hex', T('sk.panel.fillHex')]],
          onChange: (v) => { F.kind = v; syncFillUI(); },
        }));
        const infoBox = h('div', { id: 'fp-info' });
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'fp-make' });
        const syncFillUI = (redraw = true) => {
          const { regs, reg } = activeFillRegion();
          const res = reg ? SKO.fillPattern(reg, F) : null;
          infoBox.innerHTML = '';
          if (!reg) {
            infoBox.className = 'hint-box';
            infoBox.textContent = T(regs.length ? 'sk.panel.fillPickRegion' : 'sk.panel.fillNoRegion');
            ok.disabled = true;
            ok.textContent = T('sk.panel.fillMake', { n: 0 });
          } else if (!res || !res.ok) {
            infoBox.className = 'err-box';
            infoBox.textContent = (res && res.why) || T('sk.panel.fillEmpty');
            ok.disabled = true;
            ok.textContent = T('sk.panel.fillMake', { n: 0 });
          } else if (!res.ents.length) {
            infoBox.className = 'hint-box';
            infoBox.textContent = T('sk.panel.fillEmpty');
            ok.disabled = true;
            ok.textContent = T('sk.panel.fillMake', { n: 0 });
          } else {
            infoBox.className = 'ok-box';
            infoBox.innerHTML = T('sk.panel.fillInfo', { n: res.ents.length, wall: Units.fmtLenU(res.wall, 2) }) + (res.truncated ? T('sk.panel.fillTrunc', { n: res.ents.length }) : '');
            ok.disabled = false;
            ok.textContent = T('sk.panel.fillMake', { n: res.ents.length });
          }
          if (redraw) render();
        };
        const ff = h('div', { class: 'fields' });
        ff.append(UI.numField({ id: 'fp-size', label: T('sk.panel.fillSize'), value: F.size, unit: 'mm', expr: false, min: 0.2, onCommit: (v) => { F.size = v; syncFillUI(); } }));
        ff.append(UI.numField({ id: 'fp-pitch', label: T('sk.panel.fillPitch'), value: F.pitch, unit: 'mm', expr: false, min: 0.3, onCommit: (v) => { F.pitch = v; syncFillUI(); } }));
        ff.append(UI.numField({ id: 'fp-margin', label: T('sk.panel.fillMargin'), value: F.margin, unit: 'mm', expr: false, min: 0, onCommit: (v) => { F.margin = v; syncFillUI(); } }));
        ok.onclick = () => applyFillPattern();
        syncFillUI(false);
        w.append(ff, infoBox, h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'xmove') {
        const X = S.xm; const f2 = h('div', { class: 'fields' });
        w.append(UI.selectField({ id: 'xm-mode', label: T('common.kind'), value: X.mode, options: [['move', T('sk.panel.xformMove')], ['rot', T('sk.panel.xformRot')]], onChange: (v) => { X.mode = v; render(); Panels.renderRight(); } }));
        const fld = (id, label, key, unit) => f2.append(UI.numField({ id, label, value: X[key], unit, expr: false, onCommit: (v) => { X[key] = v; render(); } }));
        if (X.mode === 'rot') fld('xm-ang', T('sk.panel.angCCW'), 'ang', '°'); else { fld('xm-dx', T('sk.panel.dx'), 'dx', 'mm'); fld('xm-dy', T('sk.panel.dy'), 'dy', 'mm'); }
        w.append(f2);
        if (X.mode === 'rot') {
          const cb = h('button', { type: 'button', class: 'btn' + (S.patPick ? ' primary' : ''), id: 'xm-center' }, T(S.patPick ? 'sk.panel.pickPtWait' : 'sk.panel.pickPivot'));
          cb.onclick = () => { S.patPick = !S.patPick; UI.hint(S.patPick ? T('sk.panel.pickCenterHint') : hintFor('xmove')); Panels.renderRight(); render(); };
          w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.pivotPrefix') + T(S.patCenter ? 'sk.panel.centerPicked' : 'sk.panel.pivotSelCenter'))), h('div', { class: 'btn-row' }, cb));
        }
        w.append(h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', id: 'xm-copy', checked: X.copy }); c.onchange = () => { X.copy = c.checked; Panels.renderRight(); }; return c; })(), T('sk.panel.asCopy')));
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'xm-make' }, T('sk.panel.xmoveAct', { act: T(X.copy ? 'sk.panel.doCopy' : X.mode === 'rot' ? 'sk.panel.doRotate' : 'sk.panel.doMove'), n: S.patSel.length }));
        ok.disabled = !S.patSel.length; ok.onclick = () => applyXmove();
        w.append(h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'mirror' && !S.mir) {
        const mk = (lab, id, dir) => { const b = h('button', { type: 'button', class: 'btn', id }, lab); b.onclick = () => mirrorAxis(dir); return b; };
        w.append(h('div', { class: 'btn-row' }, mk(T('sk.panel.mirX'), 'mir-x', 'x'), mk(T('sk.panel.mirY'), 'mir-y', 'y')));
      }
      if (S.tool === 'mirror' && S.mir) {
        const ok = h('button', { type: 'button', class: 'btn primary', id: 'mir-make' }, S.mir.sel.length ? T('sk.panel.mirSel', { n: S.mir.sel.length }) : T('sk.panel.mirAll'));
        ok.onclick = () => mirrorAll(); w.append(h('div', { class: 'btn-row' }, ok));
      }
      if (S.tool === 'stretch' && !isSimpleMode()) {
        const st = S.stretch;
        const dirField = UI.selectField({
          id: 'str-dir', label: T('sk.panel.stretchDir'), value: st.dir,
          options: [['x', T('sk.panel.stretchDirX')], ['y', T('sk.panel.stretchDirY')], ['ang', T('sk.panel.stretchDirAng')], ['xy', T('sk.panel.stretchDirXY')]],
          onChange: (v) => { st.dir = v; Panels.renderRight(); render(); },
        });
        w.append(dirField);
        const fstr = h('div', { class: 'fields' });
        if (st.dir === 'xy') {
          fstr.append(UI.numField({ id: 'str-dx', label: T('sk.panel.dx'), value: st.dx, unit: 'mm', expr: false, onCommit: (v) => { st.dx = v; render(); } }));
          fstr.append(UI.numField({ id: 'str-dy', label: T('sk.panel.dy'), value: st.dy, unit: 'mm', expr: false, onCommit: (v) => { st.dy = v; render(); } }));
        } else {
          fstr.append(UI.numField({ id: 'str-dist', label: T('sk.panel.stretchDist'), value: st.dist, unit: 'mm', expr: false, onCommit: (v) => { st.dist = v; render(); } }));
          if (st.dir === 'ang') fstr.append(UI.numField({ id: 'str-ang', label: T('sk.panel.stretchAng'), value: st.ang, unit: '°', expr: false, onCommit: (v) => { st.ang = v; render(); } }));
        }
        w.append(fstr);
        const nPts = st.sel ? st.sel.pointCount : 0;
        const nEnts = st.sel ? st.sel.entCount : 0;
        w.append(h('div', {
          class: nPts ? 'ok-box' : 'hint-box',
          id: 'str-info',
          html: nPts
            ? T('sk.panel.stretchCount', { n: nPts, unit: T(nPts === 1 ? 'sk.panel.stretchPtOne' : 'sk.panel.stretchPtMany'), ents: nEnts, entWord: T(nEnts === 1 ? 'sk.toast.elOne' : 'sk.toast.elMany') })
            : T('sk.panel.stretchNone'),
        }));
        const bRow = h('div', { class: 'btn-row' });
        const ap = h('button', { type: 'button', class: 'btn primary', id: 'str-apply' }, T('sk.panel.stretchApply'));
        ap.disabled = !nPts;
        ap.onclick = () => applyStretch();
        bRow.append(ap);
        if (st.box) {
          const cl = h('button', { type: 'button', class: 'btn', id: 'str-clear' }, T('sk.panel.stretchClear'));
          cl.onclick = () => { st.box = null; st.sel = null; UI.hint(hintFor('stretch')); render(); Panels.renderRight(); };
          bRow.append(cl);
        }
        w.append(bRow);
      }
      const con = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'sk-con', checked: S.construction }), T('sk.panel.drawCon'));
      con.querySelector('input').onchange = (e) => { S.construction = e.target.checked; syncConBtn(); };
      w.append(con);
      const angSnap = h('label', { class: 'check', 'data-help': 'angleSnap' },
        h('input', { type: 'checkbox', id: 'sk-angle-snap', checked: angleSnapOn }),
        T('sk.panel.angleSnap')
      );
      angSnap.querySelector('input').onchange = (e) => { setAngleSnap(e.target.checked); };
      w.append(angSnap);
      appendCurvControls(w);
      // Größe der ganzen Skizze – Breite ändern skaliert alles mit (z. B. ein importiertes Logo passend machen)
      const bb = S.tool === 'select' && S.ctx.mode !== 'pushpull' ? SK.bounds(S.ents.filter((e) => !e.con)) : null;
      if (bb && bb[2] - bb[0] > 1e-6 && bb[3] - bb[1] > 1e-6) {
        const W = bb[2] - bb[0], H = bb[3] - bb[1], fz = h('div', { class: 'fields' });
        w.append(h('div', { class: 'mini-row', id: 'sk-size' }, h('span', { class: 'grow' }, T('sk.panel.skSize')), h('b', { class: 'mono' }, `${Units.fmtLen(W, 2)} × ${Units.fmtLen(H, 2)} ${Units.label()}`)));
        // Fläche und Umfang aller geschlossenen Flächen (Löcher abgezogen, Lochränder zählen zum Umfang)
        const regs = SK.regions(S.ents);
        if (regs.length) {
          const per = (poly) => poly.reduce((s, q, i) => s + Math.hypot(q[0] - poly[(i + 1) % poly.length][0], q[1] - poly[(i + 1) % poly.length][1]), 0);
          const A = regs.reduce((s, r) => s + r.area, 0), U = regs.reduce((s, r) => s + per(r.outer.poly) + r.holes.reduce((t, hh) => t + per(hh.poly), 0), 0);
          w.append(h('div', { class: 'mini-row', id: 'sk-area', 'data-help': 'sketchMeasure' }, h('span', { class: 'grow' }, regs.length === 1 ? T('sk.panel.areaPerimOne') : T('sk.panel.areaPerimMany', { n: regs.length })), h('b', { class: 'mono' }, `${Units.fmtAreaU(A, 2)} · ${Units.fmtLenU(U, 2)}`)));
        }
        const go = (fac) => { if (!(fac > 0) || fac > 1000 || fac < 0.001) { UI.toast(T('sk.panel.scaleBad'), { kind: 'bad' }); Panels.renderRight(); return; } if (scaleAll(fac)) UI.toast(T('sk.panel.scaleDone', { pct: fmtFixed(fac * 100, 1) }), { icon: 'check' }); };
        fz.append(UI.numField({ id: 'sk-scale-w', label: T('sk.panel.scaleWidth'), value: round(W, 6), unit: 'mm', expr: false, min: 0.01, onCommit: (v) => go(v / W) }));
        fz.append(UI.numField({ id: 'sk-scale-f', label: T('sk.panel.scaleFactor'), value: 100, unit: '%', expr: false, min: 0.1, onCommit: (v) => go(v / 100) }));
        w.append(fz);
      }
      if (!isLoftLine() && S.ctx.mode !== 'patpath' && !isPathEdit() && S.ctx.mode !== 'patpoints' && !isPointsEdit() && S.ctx.mode !== 'pushpull') {
        const sh = h('details', { class: 'snapset', id: 'sk-shapes', 'data-help': 'sketchShapes' }, h('summary', null, T('sk.panel.shapesTitle')));
        sh.open = !!(S.shapesOpen || S.tool === 'shape');
        sh.addEventListener('toggle', () => { S.shapesOpen = sh.open; });
        const sp = S.shape;
        sh.append(UI.selectField({ id: 'sh-type', label: T('sk.panel.shapeLabel'), value: sp.type, options: Object.entries(SKO.SHAPES).map(([k, v]) => [k, v.name]), onChange: (v) => { sp.type = v; sp.p = { ...SKO.SHAPES[v].p }; S.shapesOpen = true; Panels.renderRight(); render(); } }));
        const fsh = h('div', { class: 'fields' });
        for (const k of Object.keys(SKO.SHAPES[sp.type].p)) {
          const isInt = k === 'n' || k === 'z';
          const min = k === 'n' ? 3 : k === 'z' ? 5 : k === 'bore' ? 0 : 0.1;
          fsh.append(UI.numField({ id: 'sh-' + k, label: SKO.SHAPENAMES[k] || k, value: sp.p[k], unit: isInt ? '' : 'mm', expr: false, int: isInt, min, onCommit: (v) => { sp.p[k] = v; render(); } }));
        }
        sh.append(fsh);
        const insBtn = h('button', { type: 'button', class: 'btn primary', id: 'sh-insert' });
        insBtn.innerHTML = icon('star') + esc(T('sk.panel.shapeInsert'));
        insBtn.onclick = () => insertShape(sp.type, sp.p, [0, 0]);
        const plcBtn = h('button', { type: 'button', class: 'btn' + (S.tool === 'shape' ? ' primary' : ''), id: 'sh-place' });
        plcBtn.innerHTML = icon('pointer') + esc(T(S.tool === 'shape' ? 'sk.panel.shapePlacing' : 'sk.panel.shapePlace'));
        plcBtn.onclick = () => { S.shapesOpen = true; setTool(S.tool === 'shape' ? 'select' : 'shape'); };
        sh.append(h('div', { class: 'btn-row' }, insBtn, plcBtn));
        sh.append(h('div', { class: 'hint-box', html: T('sk.panel.shapeHint') }));
        w.append(sh);
      }
      if (S.ctx.mode !== 'pushpull') {
        // Kurve aus Formel (SK-38, nur Profi)
        const fc = h('details', { class: 'snapset pro', id: 'sk-formula', 'data-help': 'formulaCurve' }, h('summary', null, T('sk.panel.formulaTitle')));
        fc.open = !!S.formulaOpen;
        fc.addEventListener('toggle', () => { S.formulaOpen = fc.open; render(); });
        const F = S.formula;
        const fcStat = h('div', { id: 'fc-status' });
        const fcIns = h('button', { type: 'button', class: 'btn primary', id: 'fc-insert' });
        fcIns.innerHTML = icon('spline') + esc(T('sk.panel.fcInsert'));
        fcIns.onclick = () => insertFormulaCurve();
        const syncFormulaUI = (redraw = true) => {
          const res = SKO.evalFormulaCurve(F, Model.vars(App.doc).v);
          fcIns.disabled = !res.ok;
          fcStat.innerHTML = '';
          if (res.ok) {
            fcStat.className = 'hint-box';
            fcStat.textContent = T('sk.panel.fcReady', { n: res.pts.length, from: fmtFixed(res.t0, 3), to: fmtFixed(res.t1, 3) });
          } else {
            fcStat.className = 'err-box';
            fcStat.textContent = res.error;
          }
          if (redraw) render();
        };
        fc.append(UI.selectField({
          id: 'fc-preset', label: T('sk.panel.fcPreset'), value: F.preset || 'custom',
          options: [['custom', T('sk.panel.fcCustom')], ...Object.entries(SKO.FORMULA_CURVES).map(([k, v]) => [k, v.name])],
          onChange: (v) => {
            if (v !== 'custom' && SKO.FORMULA_CURVES[v]) { Object.assign(S.formula, { preset: v, ...SKO.FORMULA_CURVES[v] }); }
            else F.preset = 'custom';
            S.formulaOpen = true; Panels.renderRight(); render();
          },
        }));
        fc.append(UI.selectField({
          id: 'fc-mode', label: T('sk.panel.fcMode'), value: F.mode || 'yfx',
          options: [['yfx', T('sk.panel.fcModeYfx')], ['param', T('sk.panel.fcModeParam')]],
          onChange: (v) => {
            F.mode = v; F.preset = 'custom';
            if (v === 'param' && !F.fx) F.fx = 't';
            S.formulaOpen = true; Panels.renderRight(); render();
          },
        }));
        if (F.mode === 'param') {
          fc.append(UI.textField({ id: 'fc-fx', label: 'x(t) =', value: F.fx || '', live: true, onCommit: (v) => { F.fx = v; F.preset = 'custom'; syncFormulaUI(); } }));
          fc.append(UI.textField({ id: 'fc-fy', label: 'y(t) =', value: F.fy || '', live: true, onCommit: (v) => { F.fy = v; F.preset = 'custom'; syncFormulaUI(); } }));
        } else {
          fc.append(UI.textField({ id: 'fc-fy', label: 'y = f(x)', value: F.fy || '', live: true, onCommit: (v) => { F.fy = v; F.preset = 'custom'; syncFormulaUI(); } }));
        }
        const ffc = h('div', { class: 'fields' });
        ffc.append(UI.textField({ id: 'fc-from', label: T('sk.panel.fcFrom'), value: F.from ?? '0', live: true, onCommit: (v) => { F.from = v; F.preset = 'custom'; syncFormulaUI(); } }));
        ffc.append(UI.textField({ id: 'fc-to', label: T('sk.panel.fcTo'), value: F.to ?? '2*pi', live: true, onCommit: (v) => { F.to = v; F.preset = 'custom'; syncFormulaUI(); } }));
        ffc.append(UI.numField({ id: 'fc-n', label: T('sk.panel.fcPoints'), value: F.n || 41, unit: '', expr: false, int: true, min: 2, onCommit: (v) => { F.n = clamp(Math.round(v), 2, 200); F.preset = 'custom'; syncFormulaUI(); } }));
        ffc.append(UI.selectField({ id: 'fc-kind', label: T('sk.panel.curveKind'), value: F.kind || 'spline', options: [['spline', T('sk.panel.curveSpline')], ['polyline', T('sk.panel.curvePolyline')]], onChange: (v) => { F.kind = v; F.preset = 'custom'; syncFormulaUI(); } }));
        fc.append(ffc);
        const fcCl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fc-closed', checked: !!F.closed }), T('sk.panel.curveClosed'));
        fcCl.querySelector('input').onchange = (e) => { F.closed = e.target.checked; F.preset = 'custom'; syncFormulaUI(); };
        fc.append(fcCl, fcStat, h('div', { class: 'btn-row' }, fcIns));
        syncFormulaUI(false);
        w.append(fc);

        // Kurve aus Tabelle / CSV (SK-39, nur Profi)
        const cv = h('details', { class: 'snapset pro', id: 'sk-csv', 'data-help': 'csvCurve' }, h('summary', null, T('sk.panel.csvTitle')));
        cv.open = !!S.csvOpen;
        cv.addEventListener('toggle', () => { S.csvOpen = cv.open; });
        const C = S.csv;
        cv.append(UI.selectField({ id: 'csv-kind', label: T('sk.panel.curveKind'), value: C.kind || 'spline', options: [['spline', T('sk.panel.curveSpline')], ['polyline', T('sk.panel.curvePolyline')], ['points', T('sk.panel.curvePoints')]], onChange: (v) => { C.kind = v; } }));
        const cvCl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'csv-closed', checked: !!C.closed }), T('sk.panel.curveClosed'));
        cvCl.querySelector('input').onchange = (e) => { C.closed = e.target.checked; };
        cv.append(cvCl);
        const csvFileInp = h('input', { type: 'file', id: 'csv-file', accept: '.csv,.xyz,.txt,.dat,text/csv,text/plain', style: { display: 'none' } });
        csvFileInp.onchange = async () => {
          const f = csvFileInp.files && csvFileInp.files[0];
          csvFileInp.value = '';
          if (!f) return;
          try {
            const txt = await f.text();
            C.text = txt;
            const ta = $('#csv-text'); if (ta) ta.value = txt;
            insertPointsCSV(txt, { kind: C.kind, closed: C.closed, name: f.name });
          } catch (_) {
            UI.toast('Die CSV-Datei konnte nicht gelesen werden.', { kind: 'bad' });
          }
        };
        const csvFileBtn = h('button', { type: 'button', class: 'btn primary', id: 'csv-file-btn' });
        csvFileBtn.innerHTML = icon('folder') + esc(T('sk.panel.csvChooseFile'));
        csvFileBtn.onclick = () => csvFileInp.click();
        cv.append(csvFileInp, h('div', { class: 'btn-row' }, csvFileBtn));
        const csvTa = h('textarea', { id: 'csv-text', rows: 4, placeholder: '0;0\n10;5\n20;2\n30;12\n40;4' });
        csvTa.value = C.text || '';
        csvTa.addEventListener('keydown', (e) => e.stopPropagation());
        csvTa.addEventListener('input', () => { C.text = csvTa.value; });
        const csvInsBtn = h('button', { type: 'button', class: 'btn', id: 'csv-insert' });
        csvInsBtn.innerHTML = icon('spline') + esc(T('sk.panel.csvInsertText'));
        csvInsBtn.onclick = () => insertPointsCSV(C.text, { kind: C.kind, closed: C.closed });
        cv.append(h('div', { class: 'field csv-box' }, h('label', { for: 'csv-text' }, T('sk.panel.csvPasteLabel')), csvTa));
        cv.append(h('div', { class: 'btn-row' }, csvInsBtn));
        cv.append(h('div', { class: 'hint-box', html: T('sk.panel.csvHint') }));
        w.append(cv);
      }
      if (!S.step && S.ctx.mode !== 'pushpull') {
        const gs = h('details', { class: 'snapset pro', id: 'sk-grid-sec' }, h('summary', null, T('sk.panel.gridGuidesTitle')));
        gs.open = !!(S.gridOpen || S.gridMode === 'polar' || (S.guides && S.guides.length));
        gs.addEventListener('toggle', () => { S.gridOpen = gs.open; });
        const seg = h('div', { class: 'seg', 'data-help': 'polarGrid', role: 'group', 'aria-label': T('sk.panel.gridModeAria') });
        const bRect = h('button', { type: 'button', id: 'sk-grid-rect', 'aria-pressed': S.gridMode !== 'polar' ? 'true' : 'false' }, T('sk.panel.gridRect'));
        const bPolar = h('button', { type: 'button', id: 'sk-grid-polar', 'aria-pressed': S.gridMode === 'polar' ? 'true' : 'false' }, T('sk.panel.gridPolar'));
        bRect.onclick = () => { S.gridOpen = true; setGridMode('rect'); };
        bPolar.onclick = () => { S.gridOpen = true; setGridMode('polar'); };
        seg.append(bRect, bPolar);
        gs.append(seg);
        if (S.gridMode === 'polar') {
          const fp = h('div', { class: 'fields' });
          fp.append(UI.numField({ id: 'sk-polar-r', label: T('sk.panel.polarRStep'), value: S.polar.rStep, unit: 'mm', expr: false, min: 0.1, onCommit: (v) => { setPolarGrid({ rStep: v }); } }));
          fp.append(UI.numField({ id: 'sk-polar-a', label: T('sk.panel.polarAStep'), value: S.polar.aStep, unit: '°', expr: false, min: 1, onCommit: (v) => { setPolarGrid({ aStep: v }); } }));
          gs.append(fp);
        }
        const gWrap = h('div', { class: 'sk-guides-box', 'data-help': 'rulerGuides' });
        gWrap.append(h('div', { class: 'hint-box', html: T('sk.panel.guidesHint') }));
        const fg = h('div', { class: 'fields' });
        fg.append(UI.selectField({ id: 'sk-guide-axis', label: T('sk.panel.guideAxis'), value: S.guideAxis || 'x', options: [['x', T('sk.panel.guideAxisX')], ['y', T('sk.panel.guideAxisY')]], onChange: (v) => { S.guideAxis = v; } }));
        fg.append(UI.numField({ id: 'sk-guide-val', label: T('sk.panel.guidePos'), value: S.guideVal ?? 15, unit: 'mm', expr: false, onCommit: (v) => { S.guideVal = v; } }));
        gWrap.append(fg);
        const addBtn = h('button', { type: 'button', class: 'btn', id: 'sk-guide-add' }, T('sk.panel.guideAdd'));
        addBtn.onclick = () => {
          S.gridOpen = true;
          const axEl = document.getElementById('sk-guide-axis');
          const ax = axEl ? axEl.value : (S.guideAxis || 'x');
          const inp = document.getElementById('sk-guide-val');
          let val = S.guideVal ?? 15;
          if (inp) {
            const p = Units.parseLen(inp.value.trim(), vars(), { expr: false });
            if (p.ok && isFinite(p.value)) { val = p.value; S.guideVal = val; }
          }
          addGuide(ax, val);
        };
        const gRow = h('div', { class: 'btn-row' }, addBtn);
        if (S.guides && S.guides.length) {
          const clrBtn = h('button', { type: 'button', class: 'btn', id: 'sk-guides-clear' }, T('sk.panel.guidesClear'));
          clrBtn.onclick = () => clearGuides();
          gRow.append(clrBtn);
        }
        gWrap.append(gRow);
        if (S.guides && S.guides.length) {
          const list = h('div', { class: 'sk-guide-list', id: 'sk-guides-list' });
          for (const g of S.guides) {
            const row = h('div', { class: 'sk-guide-row', dataset: { guideId: g.id } },
              h('span', { class: 'sk-guide-ax' }, g.axis.toUpperCase()),
              h('span', { class: 'mono grow' }, Units.fmtLenU(g.v, 2))
            );
            const del = h('button', { type: 'button', class: 'btn ghost small', 'data-guide-del': g.id, 'aria-label': T('common.remove') });
            del.innerHTML = icon('close');
            del.onclick = () => removeGuide(g.id);
            row.append(del);
            list.append(row);
          }
          gWrap.append(list);
        }
        gs.append(gWrap);
        w.append(gs);
      }
      const sn = h('details', { class: 'snapset' }, h('summary', null, T('sk.panel.snapTitle')));
      sn.open = !!S.snapOpen; sn.addEventListener('toggle', () => { S.snapOpen = sn.open; });
      for (const [k, lab] of snapList()) {
        const cbx = h('label', { class: 'check' + (k === 'guide' ? ' pro' : '') }, h('input', { type: 'checkbox', id: 'snap-' + k, checked: S.snapSet[k] !== false }), lab);
        cbx.querySelector('input').onchange = (e) => { S.snapSet[k] = e.target.checked; };
        sn.append(cbx);
      }
      sn.append(h('div', { class: 'hint-box', html: T('sk.panel.snapHint') }));
      w.append(sn);
      if (S.ctx.mode !== 'pushpull') {
        const pe = h('details', { class: 'snapset', id: 'sk-plane' }, h('summary', null, T('sk.panel.planeTitle')));
        pe.open = !!(S.planeOpen || S.pOff || S.pTilt); pe.addEventListener('toggle', () => { S.planeOpen = pe.open; });
        const f5 = h('div', { class: 'fields' });
        f5.append(UI.numField({ id: 'pl-off', label: T('sk.dim.dist'), value: S.pOff || 0, unit: 'mm', expr: false, onCommit: (v) => { S.pOff = v; applyPlane(false); } }));
        f5.append(UI.numField({ id: 'pl-tilt', label: T('sk.panel.planeTilt'), value: S.pTilt || 0, unit: '°', expr: false, onCommit: (v) => { S.pTilt = clamp(v, -89, 89); applyPlane(true); Panels.renderRight(); } }));
        pe.append(f5, h('div', { class: 'hint-box', html: T('sk.panel.planeHint') }));
        w.append(pe);
      }
      const regs = SK.regions(S.ents);
      if (S.ctx.mode === 'patpath' || isPathEdit()) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.pathCount')), h('b', { class: 'mono', id: 'path-count' }, String(S.pathCount || 0))));
      else if (S.ctx.mode === 'patpoints' || isPointsEdit()) w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.pointsCount')), h('b', { class: 'mono', id: 'points-count' }, String(S.pointsCount || S.ents.filter((e) => e && e.type === 'point').length))));
      else if (isLoftLine()) { if (!SK.chains(S.ents).length) w.append(h('div', { class: 'err-box' }, T('sk.panel.loftNoLine'))); }
      else {
        w.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('sk.panel.closedRegions')), h('b', { class: 'mono' }, String(regs.length))));
        if (!isSkeletonMode() && SK.openEnds(S.ents).length) w.append(h('div', { class: 'err-box' }, T('sk.panel.openEndsWarn')));
        // Skizzen-Prüfer (SK-09)
        const chkBtn = h('button', { type: 'button', class: 'btn', id: 'sk-check', 'data-help': 'sketchCheck' });
        chkBtn.innerHTML = icon('target') + esc(T('sk.panel.checkBtn'));
        chkBtn.onclick = () => runCheck();
        w.append(h('div', { class: 'btn-row' }, chkBtn));
        if (S.check) {
          const box = h('div', { class: 'sk-check-box', id: 'sk-check-res' });
          if (!S.ents.length) {
            box.append(h('div', { class: 'hint-box' }, T('sk.panel.checkEmpty')));
          } else if (!S.check.issues.length) {
            box.append(h('div', { class: 'ok-box', id: 'sk-check-ok', html: T('sk.panel.checkOk') }));
          } else {
            const closeBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'sk-check-close', 'aria-label': T('sk.panel.checkHide'), 'data-tip': T('sk.panel.checkHide') });
            closeBtn.innerHTML = icon('close');
            closeBtn.onclick = () => { S.check = null; S.checkFocus = null; render(); Panels.renderRight(); };
            box.append(h('div', { class: 'sk-check-head' }, h('b', null, S.check.issues.length === 1 ? T('sk.panel.checkFoundOne') : T('sk.panel.checkFoundMany', { n: S.check.issues.length })), closeBtn));
            if (S.check.fixable > 0) {
              const repBtn = h('button', { type: 'button', class: 'btn primary', id: 'sk-repair', 'data-help': 'sketchRepair' });
              repBtn.innerHTML = icon('check') + esc(T('sk.panel.repairAll'));
              repBtn.onclick = () => repairCheck();
              box.append(h('div', { class: 'btn-row' }, repBtn));
            }
            const list = h('div', { class: 'chk-list sk-chk-list' });
            S.check.issues.forEach((it, idx) => {
              const cls = 'chk-row sk-chk-item ' + (it.kind === 'dup' ? 'warn' : 'bad') + (S.checkFocus === idx ? ' active' : '');
              const title = it.kind === 'gap'
                ? T('sk.panel.chkGap', { v: Units.fmtLenFixedU(it.dist, 3) })
                : it.kind === 'dup'
                  ? (it.partial ? T('sk.panel.chkOverlap') : T({ line: 'sk.panel.chkDupLine', arc: 'sk.panel.chkDupArc', circle: 'sk.panel.chkDupCircle', rect: 'sk.panel.chkDupRect' }[it.sub] || 'sk.panel.chkDupOther'))
                  : T('sk.panel.chkOpenEnd');
              const sub = it.kind === 'gap'
                ? T('sk.panel.chkGapSub', { x: Units.fmtLen(it.p[0], 1), y: Units.fmtLenU(it.p[1], 1) })
                : it.kind === 'dup'
                  ? (it.partial ? T('sk.panel.chkOverlapSub', { v: Units.fmtLenU(it.len, 1) }) : T('sk.panel.chkDupSub', { len: it.len ? ` (${Units.fmtLenU(it.len, 1)})` : '' }))
                  : T('sk.panel.chkOpenSub', { x: Units.fmtLen(it.p[0], 1), y: Units.fmtLenU(it.p[1], 1) });
              const row = h('button', { type: 'button', class: cls, dataset: { idx: String(idx), kind: it.kind } },
                h('span', { class: 'chk-dot' }, '!'),
                h('span', { class: 'grow' }, h('b', null, title), h('small', null, sub))
              );
              row.onclick = () => focusCheckIssue(idx);
              list.append(row);
            });
            box.append(list);
            if (S.check.fixable > 0 && S.check.opens.length > 0) {
              box.append(h('div', { class: 'hint-box' }, T('sk.panel.chkRepairHint')));
            }
          }
          w.append(box);
        }
        if (S.dims.length && S.tool === 'select' && !S.sel) {
          // Alle Maße der Skizze als Tabelle (SK-53): Wert oder Formel direkt ändern
          const TN = { line: T('sk.panel.ent.line'), rect: T('sk.panel.ent.rect'), circle: T('sk.panel.ent.circle'), arc: T('sk.panel.ent.arc'), slot: T('sk.panel.ent.slot'), poly: T('sk.panel.ent.poly'), ellipse: T('sk.panel.ent.ellipse'), ellarc: T('sk.panel.ent.ellarc'), conic: T('sk.panel.ent.conic'), bridge: T('sk.panel.ent.bridge'), text: T('sk.panel.ent.text'), point: T('sk.panel.ent.point'), spline: T('sk.panel.ent.spline') };
          const tbl = h('details', { class: 'section dim-table', id: 'dim-table', 'data-help': 'dimTable' }, h('summary', { class: 'section-h' }, T('sk.panel.allDims', { n: S.dims.length })));
          const unitOf = (k) => (isAngDim(k) ? '°' : k === 'n' ? '' : 'mm');
          S.dims.forEach((d, i) => {
            const sp = dimSpecOf(d);
            const e = d.e ? ent(d.e) : null;
            const nr = e ? S.ents.filter((x) => x.type === e.type).indexOf(e) + 1 : 0;
            const what = (dimLabelOf(d) + (e ? ` · ${TN[e.type] || e.type} ${nr}` : '')) + (d.ref ? T('sk.panel.dimReadSuffix') : '');
            if (isSkeletonMode()) {
              const nmIn = h('input', {
                type: 'text',
                id: 'dt-name-' + i,
                class: 'skel-dim-name',
                value: d.name || '',
                placeholder: T('skel.dimNamePh'),
                'aria-label': T('skel.dimNameLabel'),
                dataset: { skelDimName: d.id },
                spellcheck: 'false',
              });
              nmIn.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') nmIn.blur(); if (ev.key === 'Escape') { nmIn.value = d.name || ''; nmIn.blur(); } });
              nmIn.addEventListener('change', () => { if (!setDimName(d.id, nmIn.value)) nmIn.value = d.name || ''; });
              tbl.append(h('div', { class: 'skel-dt-name-row' }, h('span', { class: 'sub' }, T('skel.dimNameLabel')), nmIn));
            }
            const f = UI.numField({ id: 'dt-' + i, label: what, value: d.ref ? round(measureSpec(sp), 6) : d.v, unit: unitOf(d.k), onCommit: (v) => { setDimSpec(sp, v); } });
            f.addEventListener('mouseenter', () => { if (e && S.hoverDim !== e.id) { S.hoverDim = e.id; S.hoverEnt = e.id; render(); } });
            tbl.append(f);
            if (unitOf(d.k) === 'mm' && !d.ref && typeof Iso286 !== 'undefined' && Iso286.openDialog) {
              const nom = round(measureSpec(sp), 6);
              const tf = d.tol ? Iso286.formatTolShort(d.tol, nom) : null;
              const tRow = h('div', { class: 'param-tol-row pro' });
              const tb = h('button', { type: 'button', class: 'btn ghost small', id: 'dt-tol-' + i, 'data-help': 'iso286Table' }, tf ? tf.badge : '± ISO 286');
              tb.onclick = () => Iso286.openDialog({
                nominalMm: isFinite(nom) && nom > 0 ? nom : 20,
                code: (d.tol && d.tol.fit) || (d.k === 'd' ? 'H7' : 'h6'),
                fitShow: (d.tol && d.tol.fitShow) || 'both',
                targetLabel: T('iso286.targetSketchDim', { label: what }),
                onApply: (tol) => setDimTol(d.id, tol),
              });
              tRow.append(tb);
              if (d.tol) {
                const td = h('button', { type: 'button', class: 'ptbl-rdel', id: 'dt-tol-del-' + i, 'data-tip': T('iso286.clearTol'), 'aria-label': T('iso286.clearTol') }, '×');
                td.onclick = () => setDimTol(d.id, null);
                tRow.append(td);
              }
              tbl.append(tRow);
            }
          });
          if (S.dimTableOpen || (isSkeletonMode() && S.dimTableOpen !== false)) tbl.open = true;
          tbl.addEventListener('toggle', () => { S.dimTableOpen = tbl.open; });
          w.append(tbl);
        }
        if (S.ents.length && S.tool === 'select' && !S.sel) {
          // Skizze als 2D-Datei für Laser, Plotter oder Grafikprogramm (SK-23)
          const nm = () => (S.ctx.mode === 'edit' ? Model.label((Model.find(App.doc, S.ctx.editId) || { item: {} }).item) : T('sk.bar.title'));
          const bd = h('button', { type: 'button', class: 'btn', id: 'sk-dxf', 'data-help': 'sketchExport' }, T('sk.panel.saveDxf')); bd.onclick = () => Print.save2D(S.ents, nm(), 'dxf');
          const bs = h('button', { type: 'button', class: 'btn', id: 'sk-svg', 'data-help': 'sketchExport' }, T('sk.panel.saveSvg')); bs.onclick = () => Print.save2D(S.ents, nm(), 'svg');
          w.append(h('div', { class: 'btn-row' }, bd, bs));
        }
      }
    }
    const appendBlockLibrary = (dst, withPick) => {
      const blocks = docBlocks();
      if (!blocks.length) {
        dst.append(h('div', { class: 'hint-box', id: 'sk-blocks-empty' }, T('sk.block.none')));
        return;
      }
      if (withPick) {
        if (!blocks.some((b) => b.id === S.blockActive)) S.blockActive = blocks[0].id;
        dst.append(UI.selectField({ id: 'blk-select', label: T('sk.block.activeLabel'), value: S.blockActive, options: blocks.map((b) => [b.id, b.name]), onChange: (v) => { S.blockActive = v; render(); Panels.renderRight(); } }));
        dst.append(UI.numField({ id: 'blk-rot', label: T('sk.block.rot'), value: S.blockRot || 0, unit: '°', expr: false, onCommit: (v) => { S.blockRot = isFinite(v) ? v : 0; render(); } }));
        const ins0 = h('button', { type: 'button', class: 'btn primary', id: 'blk-insert-origin' }); ins0.innerHTML = icon('plus') + esc(T('sk.block.insertAtOrigin'));
        ins0.onclick = () => { if (S.blockActive) insertBlock(S.blockActive, 0, 0, S.blockRot || 0); };
        dst.append(h('div', { class: 'btn-row' }, ins0));
      }
      const list = h('div', { class: 'sk-blk-list' });
      for (const b of blocks) {
        const nEnt = (b.ents || []).length, nInst = (S.blockInsts || []).filter((i) => i.blockId === b.id).length;
        const cntTxt = (nEnt === 1 ? T('sk.block.entCountOne') : T('sk.block.entCountMany', { n: nEnt })) + (nInst ? ' · ' + T('sk.block.instCount', { n: nInst }) : '');
        const row = h('div', { class: 'sk-blk-row' + (S.blockActive === b.id ? ' active' : ''), dataset: { blockId: b.id } });
        row.append(h('div', { class: 'sk-blk-meta' }, h('b', null, b.name), h('small', null, cntTxt)));
        const acts = h('div', { class: 'sk-blk-acts' });
        const bIns = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': T('sk.block.insert'), 'aria-label': T('sk.block.insert') }); bIns.innerHTML = icon('plus'); bIns.onclick = () => { S.blockActive = b.id; setTool('block'); };
        const bEd = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': T('sk.block.editBtn'), 'aria-label': T('sk.block.editBtn') }); bEd.innerHTML = icon('edit'); bEd.onclick = () => editBlock(b.id);
        const bDel = h('button', { type: 'button', class: 'btn ghost small danger', 'data-tip': T('common.delete'), 'aria-label': T('common.delete') }); bDel.innerHTML = icon('trash'); bDel.onclick = () => deleteBlockDef(b.id);
        acts.append(bIns, bEd, bDel);
        row.append(acts);
        list.append(row);
      }
      dst.append(list);
    };
    if (S.tool === 'block' && !S.blockEdit && !S.step) {
      const box = h('div', { class: 'sk-blk-box pro', id: 'sk-block-tool-panel', 'data-help': 'sketchBlocks' });
      appendBlockLibrary(box, true);
      w.append(box);
    }
    if (!S.blockEdit && !S.step && !selBlkInst && !sel && sels.length <= 1 && !selCon && S.tool !== 'block' && !isLoftLine() && S.ctx.mode !== 'patpath' && !isPathEdit() && S.ctx.mode !== 'patpoints' && !isPointsEdit()) {
      const blocks = docBlocks();
      const blkDet = h('details', { class: 'section pro', id: 'sk-blocks', 'data-help': 'sketchBlocks' }, h('summary', { class: 'section-h' }, T('sk.block.title', { n: blocks.length })));
      if (S.blockLibOpen || blocks.length) blkDet.open = !!S.blockLibOpen;
      blkDet.addEventListener('toggle', () => { S.blockLibOpen = blkDet.open; });
      appendBlockLibrary(blkDet, false);
      w.append(blkDet);
    }
    w.append(h('div', { class: 'hint-box', html: T('sk.panel.navHint') }));
    body.append(w);
  }

  // ---------- Fertig / Hochziehen ----------
  let donePending = false;
  function done(skipFontWait = false) {
    if (!S || donePending) return;
    if (S.blockEdit) { finishBlockEdit(true); return; }
    S.draft = null; hideEntry();
    if (!skipFontWait && SK.needsEntsFonts && SK.needsEntsFonts(S.ents)) {
      const sess = S;
      donePending = true;
      SK.ensureEntsFonts(S.ents).then(() => {
        donePending = false;
        if (S === sess) { reapply(); render(); done(true); }
      }).catch((e) => {
        donePending = false;
        UI.toast((e && e.message) || T('sk.toast.fontErr'), { kind: 'bad' });
      });
      return;
    }
    const regs = SK.regions(S.ents);
    const editKind = S.ctx.mode === 'edit' ? (Model.find(App.doc, S.ctx.editId) || { item: {} }).item.kind : null;
    const pathMode = S.ctx.mode === 'patpath' || isPathEdit();
    const splitMode = S.ctx.mode === 'splitcurve' || isSplitSketchEdit();
    const pointsMode = S.ctx.mode === 'patpoints' || isPointsEdit();
    if (isLoftLine()) {
      const rk = railKey(), nm = rk === 'rail2' ? 'zweiten Führungskurve' : rk ? 'Führungskurve' : 'Mittellinie';
      if (!SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneNeedOpen', { what: rk === 'rail2' ? 'zweite Führungskurve' : nm }), { kind: 'bad', icon: 'info' }); return; }
      const id = S.ctx.id, sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons, ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}), ...(S.locked ? { locked: true } : {}), ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}), ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}) };
      const commitBlocks = docBlocksForCommit();
      App.extra = []; finishSession();
      App.change(rk === 'rail2' ? 'Zweite Führungskurve' : rk ? 'Führungskurve' : 'Mittellinie', (doc) => { doc.blocks = commitBlocks; const f = Model.find(doc, id); if (!f) return false; if (rk) { f.item.p[rk] = sk; delete f.item.p.path; } else { f.item.p.path = sk; delete f.item.p.rail; delete f.item.p.rail2; } });
      App.select([id]); UI.toast(T('sk.toast.doneLoftFollow', { what: nm }), { icon: 'check' }); return;
    }
    if (pathMode && !SK.chains(S.ents).length && !regs.length) { UI.toast(T('sk.toast.donePathEmpty'), { kind: 'bad', icon: 'info' }); return; }
    if (splitMode && !SK.chains(S.ents).length && !regs.length) { UI.toast('Zeichne mindestens eine Kurve oder einen Umriss zum Teilen.', { kind: 'bad', icon: 'info' }); return; }
    if (pointsMode && !S.ents.some((e) => e && e.type === 'point')) { UI.toast(T('sk.toast.donePointsEmpty'), { kind: 'bad', icon: 'info' }); return; }
    if (S.ctx.mode === 'patpath') {
      const sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons, ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}), ...(S.locked ? { locked: true } : {}), ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}), ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}) }, ids = S.ctx.ids;
      const commitBlocks = docBlocksForCommit();
      if (App.doc) App.doc.blocks = commitBlocks;
      finishSession(); Features.pathFromSketch(ids, sk); return;
    }
    if (S.ctx.mode === 'splitcurve') {
      const sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons, ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}), ...(S.locked ? { locked: true } : {}), ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}), ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}) };
      const target = { gid: S.ctx.gid, ids: S.ctx.ids };
      const commitBlocks = docBlocksForCommit();
      if (App.doc) App.doc.blocks = commitBlocks;
      finishSession(); Features.splitFromSketch(target, sk); return;
    }
    if (S.ctx.mode === 'patpoints') {
      const sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons, ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}), ...(S.locked ? { locked: true } : {}), ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}), ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}) }, ids = S.ctx.ids;
      const commitBlocks = docBlocksForCommit();
      if (App.doc) App.doc.blocks = commitBlocks;
      finishSession(); Features.pointsFromSketch(ids, sk); return;
    }
    if (S.ctx.mode === 'asmcut') {
      if (!regs.length) { UI.toast(T('sk.toast.doneClosedNeed'), { kind: 'bad', icon: 'info' }); return; }
      const sk = { plane: deepClone(S.plane), ents: S.ents, dims: S.dims, cons: S.cons, ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}), ...(S.locked ? { locked: true } : {}), ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}), ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}) };
      const opts = { targets: S.ctx.targets, scope: S.ctx.scope, dir: S.ctx.dir, thru: S.ctx.thru, dist: S.ctx.dist };
      const commitBlocks = docBlocksForCommit();
      if (App.doc) App.doc.blocks = commitBlocks;
      finishSession(); Assembly.asmCutFromSketch(sk, opts); return;
    }
    if (S.ctx.mode === 'skeleton') {
      if (!S.ents.length) { UI.toast(T('skel.emptyNeedEnt'), { kind: 'bad', icon: 'info' }); return; }
      const skData = {
        plane: deepClone(S.plane),
        ents: deepClone(S.ents),
        dims: deepClone(S.dims),
        cons: deepClone(S.cons),
        ...(S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {}),
        ...(S.locked ? { locked: true } : {}),
        ...(S.bg ? { bg: deepClone(S.bg) } : {}),
        ...(S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {}),
        ...(S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {}),
      };
      const editId = S.ctx.skeletonId || null;
      const skName = S.ctx.skeletonName || (typeof Comp !== 'undefined' && Comp.defaultSkeletonName ? Comp.defaultSkeletonName() : T('skel.defaultName'));
      const commitBlocks = docBlocksForCommit();
      finishSession();
      if (typeof Comp !== 'undefined' && Comp.saveSkeletonSketch) {
        const saved = Comp.saveSkeletonSketch(editId, skData, { name: skName, blocks: commitBlocks });
        if (saved && Comp.selectSkeleton) Comp.selectSkeleton(saved.id);
      }
      render3dScene();
      return;
    }
    if (S.ctx.mode === 'edit') {
      const editIt = (Model.find(App.doc, S.ctx.editId) || {}).item;
      const isThinEdit = editKind === 'extrude' && editIt && editIt.p && editIt.p.thin;
      if (!pathMode && !splitMode && !pointsMode) {
        if (editKind === 'sweep' && !SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneSweepNeed'), { kind: 'bad' }); return; }
        if (editKind === 'frame' && !Model.frameSegsFrom2d({ plane: S.plane, ents: S.ents, dims: S.dims, cons: S.cons }, Model.vars(App.doc).v).segs.length) { UI.toast(T('sk.toast.doneFrameNeed'), { kind: 'bad' }); return; }
        if (editKind === 'rib' && !SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneRibNeed'), { kind: 'bad' }); return; }
        if (editKind === 'web' && !(SK.webPaths && SK.webPaths(S.ents).length)) { UI.toast(T('sk.toast.doneWebNeed'), { kind: 'bad' }); return; }
        if (editKind === 'wrap') {
          const wMode = editIt && editIt.p && editIt.p.mode;
          if (wMode === 'line' && !regs.length && !SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneWrapLineNeed'), { kind: 'bad' }); return; }
          if (wMode !== 'line' && !regs.length) { UI.toast(T('sk.toast.doneWrapNeed'), { kind: 'bad' }); return; }
        }
        if (isThinEdit && !regs.length && !SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneThinNeed'), { kind: 'bad' }); return; }
        if (editKind !== 'sweep' && editKind !== 'frame' && editKind !== 'rib' && editKind !== 'web' && editKind !== 'wrap' && !isThinEdit && !regs.length) { UI.toast(T('sk.toast.doneClosedNeed'), { kind: 'bad' }); return; }
      }
      const id = S.ctx.editId, ents = S.ents, dims = S.dims, cons = S.cons, blockInsts = deepClone(S.blockInsts || []), plane = deepClone(S.plane), bg = S.bg ? deepClone(S.bg) : null, locked = !!S.locked, guides = S.guides && S.guides.length ? deepClone(S.guides) : null, gridMode = S.gridMode, polar = S.gridMode === 'polar' ? deepClone(S.polar) : null;
      const commitBlocks = docBlocksForCommit();
      App.change('Skizze bearbeitet', (doc) => {
        doc.blocks = commitBlocks;
        const f = Model.find(doc, id);
        f.item.p.sketch.ents = ents; f.item.p.sketch.dims = dims; f.item.p.sketch.cons = cons; f.item.p.sketch.plane = plane;
        if (blockInsts.length) f.item.p.sketch.blockInsts = blockInsts; else delete f.item.p.sketch.blockInsts;
        if (locked) f.item.p.sketch.locked = true; else delete f.item.p.sketch.locked;
        if (bg) f.item.p.sketch.bg = bg; else delete f.item.p.sketch.bg;
        if (guides) f.item.p.sketch.guides = guides; else delete f.item.p.sketch.guides;
        if (gridMode === 'polar') { f.item.p.sketch.gridMode = 'polar'; f.item.p.sketch.polar = polar; } else { delete f.item.p.sketch.gridMode; delete f.item.p.sketch.polar; }
        const keys = regs.map((r) => r.key);
        if (f.item.p.sel) f.item.p.sel = f.item.p.sel.filter((k) => keys.includes(k));
        if (editKind === 'revolve' && !f.item.p.axisId) {
          const revL = ents.find((x) => x.type === 'line' && x.revAxis);
          if (revL) { f.item.p.axisEnt = revL.id; f.item.p.axis = { a: revL.a.slice(), b: revL.b.slice() }; }
          else if (f.item.p.axisEnt) {
            const axL = ents.find((x) => x.id === f.item.p.axisEnt && x.type === 'line');
            if (axL) f.item.p.axis = { a: axL.a.slice(), b: axL.b.slice() };
            else delete f.item.p.axisEnt;
          }
        }
      });
      finishSession(); App.select([id]); return;
    }
    // nur Punkte auf einer Körperfläche: an jedem Punkt eine Bohrung (Bohrungs-Assistent)
    const pts = S.ents.filter((e) => e.type === 'point' && !e.con);
    if (!regs.length && pts.length && !SK.chains(S.ents).length && !(SK.webPaths && SK.webPaths(S.ents).length)) {
      if (!S.ctx.targetId) { UI.toast(T('sk.toast.donePointsNeedFace'), { kind: 'bad', icon: 'info' }); return; }
      const id = S.ctx.targetId, n = S.F.n.clone(), wp = pts.map((e) => toWorld(e.a[0], e.a[1]));
      finishSession(); Place.holesAtPoints(id, wp, n); return;
    }
    if (S.ctx.embossMode) {
      if (!regs.length) { UI.toast(T('sk.toast.doneEmbossNeed'), { kind: 'bad', icon: 'info' }); return; }
      extrudeStep({ dist: 1, dir: 'normal', emboss: true });
      return;
    }
    if (S.ctx.splitFaceMode) {
      if (!regs.length && !SK.chains(S.ents).length) { UI.toast(T('sk.toast.doneSplitFaceNeed'), { kind: 'bad', icon: 'info' }); return; }
      extrudeStep({ dist: 1, dir: 'normal', splitFace: true, openOnly: !regs.length });
      return;
    }
    if (S.ctx.frameMode) {
      const frSegs = Model.frameSegsFrom2d({ plane: S.plane, ents: S.ents, dims: S.dims, cons: S.cons }, Model.vars(App.doc).v).segs;
      if (!frSegs.length) { UI.toast(T('sk.toast.doneFrameNeed'), { kind: 'bad', icon: 'info' }); return; }
      extrudeStep({ dist: 10, dir: 'normal', frame: true, openOnly: !regs.length });
      return;
    }
    const hasWeb = SK.webPaths && SK.webPaths(S.ents).length;
    if (!regs.length && (SK.chains(S.ents).length || hasWeb)) {
      const onlyWeb = !SK.chains(S.ents).length;
      extrudeStep({ dist: S.ctx.targetId ? 5 : 10, dir: 'normal', openOnly: true, thin: !S.ctx.ribMode && !S.ctx.webMode && !S.ctx.wrapCtx && !onlyWeb, rib: !!S.ctx.ribMode && !onlyWeb, web: !!S.ctx.webMode || onlyWeb, wrap: !!S.ctx.wrapCtx, wrapMode: 'line' });
      return;
    }
    if (S.ctx.webMode && hasWeb) {
      extrudeStep({ dist: S.ctx.targetId ? 5 : 10, dir: 'normal', web: true });
      return;
    }
    if (!regs.length) { UI.toast(T(S.ents.length ? 'sk.toast.doneNoRegion' : 'sk.toast.doneEmpty'), { kind: 'bad', icon: 'info' }); return; }
    extrudeStep({ dist: S.ctx.targetId ? 5 : 10, dir: 'normal', wrap: !!S.ctx.wrapCtx, wrapMode: 'emboss' });
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
    hideBar(); hideRulers(); tiltView();
    const regs = SK.regions(S.ents);
    const openOnly = !!opts.openOnly || !regs.length;
    const tgt = S.ctx.targetId ? Model.find(App.doc, S.ctx.targetId) : null;
    const ribTargets = typeof Features !== 'undefined' && Features.ribTargets ? Features.ribTargets() : [];
    const ctxTop = S.ctx.targetId ? Model.topOf(App.doc, S.ctx.targetId) : null;
    const ribTarget = (ctxTop && ribTargets.some((x) => x.id === ctxTop.id) ? ctxTop.id : (ribTargets[ribTargets.length - 1] || {}).id) || null;
    const useRib = !!opts.rib && !!ribTarget;
    const useWeb = !!opts.web && !!ribTarget;
    const cylTargets = typeof Features !== 'undefined' && Features.cylTargets ? Features.cylTargets() : [];
    const wrapCtx = S.ctx.wrapCtx || null;
    const wrapTarget = wrapCtx ? wrapCtx.target : (ctxTop && cylTargets.some((x) => x.id === ctxTop.id) ? ctxTop.id : (cylTargets[cylTargets.length - 1] || {}).id) || null;
    let wrapFace = wrapCtx ? deepClone(wrapCtx.face) : null;
    if (!wrapFace && wrapTarget && typeof Features !== 'undefined' && Features.findCylFaceOnItem) {
      const cf = Features.findCylFaceOnItem(wrapTarget);
      if (cf) wrapFace = Features.wrapTangentPlane(wrapTarget, cf.info, null).faceSpec;
    }
    const useWrap = !!opts.wrap && !!wrapTarget;
    const wrapMode = openOnly ? 'line' : (opts.wrapMode || 'emboss');
    const useEmboss = !!opts.emboss;
    const useSplitFace = !!opts.splitFace;
    const useFrame = !!opts.frame;
    const revLine = S.ents.find((x) => x.type === 'line' && x.revAxis) || null;
    const autoRev = !!revLine && !openOnly && !opts.fromPushPull && !useRib && !useWeb && !useWrap && !useEmboss && !useSplitFace && !useFrame;
    S.step = { dist: opts.dist, dir: opts.dir, extent: opts.extent || 'dist', toFace: opts.toFace || null, revToFace: null, revDir: 'normal', angle2: 90, toFaceFlip: false, pickingFace: false, sel: regs.map((r) => r.key), revolve: autoRev, sweep: false, sweepShape: 'circle', sweepD: 6, sweepW: 6, sweepH: 4, sweepWall: 0, sweepTwist: 0, sweepProfId: null, sweepOp: 'new', sweepTarget: ribTarget, frame: useFrame, frameProfileMode: 'library', frameShape: 'squareTube', frameSize: '20x20x2', frameProfId: null, frameRot: 0, rib: useRib, ribTarget, ribThickness: 2, ribSide: 'center', ribDir: 'normal', ribFlip: false, ribDepth: 0, ribDraft: 0, web: useWeb, webTarget: ribTarget, webThickness: 2, webDepth: 0, webDraft: 0, webExtend: true, webFlip: false, wrap: useWrap, wrapTarget, wrapFace, wrapMode, wrapDepth: 2, wrapAngle: 0, wrapShiftY: 0, wrapRot: 0, wrapFlip: false, emboss: useEmboss, embossTarget: S.ctx.embossMode ? S.ctx.targetId : (ctxTop ? ctxTop.id : null), embossFace: S.ctx.embossFace ? deepClone(S.ctx.embossFace) : null, embossHeight: (S.ctx.embossOpt && S.ctx.embossOpt.height) || 1, embossMode: (S.ctx.embossOpt && S.ctx.embossOpt.mode === 'deboss') ? 'deboss' : 'emboss', embossFlip: !!(S.ctx.embossOpt && S.ctx.embossOpt.flip), splitFace: useSplitFace, splitFaceTarget: S.ctx.splitFaceMode ? S.ctx.targetId : (ctxTop ? ctxTop.id : null), splitFaceSig: S.ctx.splitFaceSig ? deepClone(S.ctx.splitFaceSig) : null, splitFaceSide: (S.ctx.splitFaceOpt && S.ctx.splitFaceOpt.side) || 'front', openOnly, thin: openOnly ? (!useRib && !useWeb && !useWrap && !useSplitFace && !useFrame) : !!opts.thin, wall: opts.wall || 2, wallSide: opts.wallSide || 'center', axis: revLine ? 'line' : 'y', axisLine: revLine ? revLine.id : null, angle: 360, fromPushPull: !!opts.fromPushPull, color: tgt ? tgt.item.color : nextColor() };
    stepBox = h('div', { class: 'stepbox' });
    renderStep();
    $('#overlay').append(stepBox);
    Panels.renderRight();
    updatePreview(); render();
    App.emit('sketch');
  }
  function updateStepExtInfo() {
    const box = stepBox && stepBox.querySelector('#st-ext-info');
    if (!box || !S || !S.step) return;
    const st = S.step;
    const rd = App.resolvedDist('__preview');
    const err = App.errorsFor('__preview')[0];
    box.className = err ? 'err-box' : 'hint-box';
    if (err) { box.textContent = err.message; return; }
    if (st.extent === 'toFace' && !st.toFace) { box.textContent = T('sk.step.extPickHint'); return; }
    const tgt = st.extent === 'toFace' && st.toFace && st.toFace.label ? ` (${st.toFace.label})` : '';
    box.textContent = rd != null ? T('sk.step.extCalcInfo', { v: Units.fmtLenU(rd, 2), tgt }) : T('sk.step.extCalcWait');
  }
  function renderStep() {
    const st = S.step; stepBox.innerHTML = '';
    const ribTargets = typeof Features !== 'undefined' && Features.ribTargets ? Features.ribTargets() : [];
    const cylTargets = typeof Features !== 'undefined' && Features.cylTargets ? Features.cylTargets() : [];
    const hasFrameSegs = Model.frameSegsFrom2d({ plane: S.plane, ents: S.ents, dims: S.dims, cons: S.cons }, Model.vars(App.doc).v).segs.length > 0;
    UI.hint(T(st.pickingFace ? 'sk.step.pickFaceHint' : st.frame ? 'sk.step.frameHint' : st.wrap ? 'sk.step.wrapHint' : st.emboss ? 'sk.step.embossHint' : st.splitFace ? 'sk.step.splitFaceHint' : st.web ? 'sk.step.webHint' : st.rib ? 'sk.step.ribHint' : st.sweep ? 'sk.step.sweepHint' : st.revolve ? 'sk.step.revHint' : st.thin ? 'sk.step.thinHint' : 'sk.step.extHint'));
    stepBox.append(h('h3', null, T(st.frame ? 'kind.frame' : st.wrap ? 'sk.step.titleWrap' : st.emboss ? 'kind.emboss' : st.splitFace ? 'kind.splitFace' : st.web ? 'kind.web' : st.rib ? 'kind.rib' : st.sweep ? 'kind.sweep' : st.revolve ? 'sk.step.titleRevolve' : st.dir === 'reverse' ? 'sk.step.titlePush' : st.thin ? 'sk.step.titleThin' : 'sk.step.titleExtrude')));
    const seg = h('div', { class: 'role-switch' });
    if (st.openOnly) {
      const hasChain = SK.chains(S.ents).length > 0;
      const a = h('button', { type: 'button', id: 'st-mode-thin', 'aria-pressed': !st.sweep && !st.frame && !st.rib && !st.web && !st.wrap && !st.splitFace ? 'true' : 'false' }); a.innerHTML = icon('wall2d') + esc(T('sk.step.titleThin')); a.onclick = () => { st.sweep = false; st.frame = false; st.rib = false; st.web = false; st.wrap = false; st.splitFace = false; st.thin = true; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      const b = h('button', { type: 'button', id: 'st-mode-sweep', 'aria-pressed': st.sweep && !st.frame && !st.rib && !st.web && !st.wrap && !st.splitFace ? 'true' : 'false' }); b.innerHTML = icon('sweep') + esc(T('kind.sweep')); b.onclick = () => { st.sweep = true; st.frame = false; st.rib = false; st.web = false; st.wrap = false; st.splitFace = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      const c = h('button', { type: 'button', id: 'st-mode-rib', 'data-help': 'rib', 'aria-pressed': st.rib ? 'true' : 'false' }); c.innerHTML = icon('rib') + esc(T('kind.rib')); c.onclick = () => { st.rib = true; st.frame = false; st.web = false; st.sweep = false; st.wrap = false; st.splitFace = false; st.thin = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      const wb = h('button', { type: 'button', id: 'st-mode-web', 'data-help': 'web', 'aria-pressed': st.web ? 'true' : 'false' }); wb.innerHTML = icon('web') + esc(T('kind.web')); wb.onclick = () => { st.web = true; st.frame = false; st.rib = false; st.sweep = false; st.wrap = false; st.splitFace = false; st.thin = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      if (hasChain) seg.append(a, b, c, wb);
      else seg.append(wb);
      if (st.frame || (!isSimpleMode() && hasFrameSegs)) {
        const frBtn = h('button', { type: 'button', class: 'pro', id: 'st-mode-frame', 'data-help': 'frame', 'aria-pressed': st.frame ? 'true' : 'false' });
        frBtn.innerHTML = icon('frame') + esc(T('kind.frame'));
        frBtn.onclick = () => { st.frame = true; st.sweep = false; st.rib = false; st.web = false; st.wrap = false; st.splitFace = false; st.thin = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(frBtn);
      }
      if (cylTargets.length && hasChain) {
        const wBtn = h('button', { type: 'button', id: 'st-mode-wrap', 'data-help': 'wrapCyl', 'aria-pressed': st.wrap ? 'true' : 'false' }); wBtn.innerHTML = icon('wrap') + esc(T('kind.wrap')); wBtn.onclick = () => { st.wrap = true; st.wrapMode = 'line'; st.frame = false; st.rib = false; st.web = false; st.sweep = false; st.splitFace = false; st.thin = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(wBtn);
      }
      if ((st.splitFace || (!isSimpleMode() && ribTargets.length)) && hasChain) {
        const sfBtn = h('button', { type: 'button', class: 'pro', id: 'st-mode-splitFace', 'data-help': 'splitFace', 'aria-pressed': st.splitFace ? 'true' : 'false' }); sfBtn.innerHTML = icon('splitFace') + esc(T('kind.splitFace')); sfBtn.onclick = () => { st.splitFace = true; st.frame = false; st.wrap = false; st.rib = false; st.web = false; st.sweep = false; st.thin = false; st.pickingFace = !st.splitFaceSig; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(sfBtn);
      }
      stepBox.append(seg);
    } else if (!st.fromPushPull) {
      const a = h('button', { type: 'button', id: 'st-mode-extrude', 'aria-pressed': !st.revolve && !st.frame && !st.wrap && !st.emboss && !st.splitFace && !st.web ? 'true' : 'false' }); a.innerHTML = icon('lift') + esc(T('sk.step.titleExtrude')); a.onclick = () => { st.revolve = false; st.frame = false; st.wrap = false; st.emboss = false; st.splitFace = false; st.web = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      const b = h('button', { type: 'button', id: 'st-mode-revolve', 'aria-pressed': st.revolve && !st.frame && !st.wrap && !st.emboss && !st.splitFace && !st.web ? 'true' : 'false' }); b.innerHTML = icon('rotate') + esc(T('sk.step.titleRevolve')); b.onclick = () => { st.revolve = true; st.frame = false; st.wrap = false; st.emboss = false; st.splitFace = false; st.web = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
      seg.append(a, b);
      if (st.frame || (!isSimpleMode() && hasFrameSegs)) {
        const frBtn = h('button', { type: 'button', class: 'pro', id: 'st-mode-frame', 'data-help': 'frame', 'aria-pressed': st.frame ? 'true' : 'false' });
        frBtn.innerHTML = icon('frame') + esc(T('kind.frame'));
        frBtn.onclick = () => { st.frame = true; st.revolve = false; st.wrap = false; st.emboss = false; st.splitFace = false; st.web = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(frBtn);
      }
      if (st.web || ((SK.webPaths && SK.webPaths(S.ents).length > 0) && ribTargets.length)) {
        const wb = h('button', { type: 'button', id: 'st-mode-web', 'data-help': 'web', 'aria-pressed': st.web ? 'true' : 'false' }); wb.innerHTML = icon('web') + esc(T('kind.web')); wb.onclick = () => { st.web = true; st.frame = false; st.revolve = false; st.wrap = false; st.emboss = false; st.splitFace = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(wb);
      }
      if (st.emboss || ribTargets.length) {
        const c = h('button', { type: 'button', id: 'st-mode-emboss', 'data-help': 'emboss', 'aria-pressed': st.emboss ? 'true' : 'false' }); c.innerHTML = icon('emboss') + esc(T('kind.emboss')); c.onclick = () => { st.emboss = true; st.frame = false; st.splitFace = false; st.web = false; st.wrap = false; st.revolve = false; st.pickingFace = !st.embossFace; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(c);
      }
      if (st.splitFace || (!isSimpleMode() && ribTargets.length)) {
        const sf = h('button', { type: 'button', class: 'pro', id: 'st-mode-splitFace', 'data-help': 'splitFace', 'aria-pressed': st.splitFace ? 'true' : 'false' }); sf.innerHTML = icon('splitFace') + esc(T('kind.splitFace')); sf.onclick = () => { st.splitFace = true; st.frame = false; st.emboss = false; st.web = false; st.wrap = false; st.revolve = false; st.pickingFace = !st.splitFaceSig; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(sf);
      }
      if (cylTargets.length) {
        const wBtn = h('button', { type: 'button', id: 'st-mode-wrap', 'data-help': 'wrapCyl', 'aria-pressed': st.wrap ? 'true' : 'false' }); wBtn.innerHTML = icon('wrap') + esc(T('kind.wrap')); wBtn.onclick = () => { st.wrap = true; st.frame = false; st.web = false; st.emboss = false; st.splitFace = false; st.revolve = false; st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); renderStep(); updatePreview(); };
        seg.append(wBtn);
      }
      stepBox.append(seg);
    }
    if (st.wrap) {
      if (!cylTargets.length) {
        stepBox.append(h('div', { class: 'hint-box' }, T('sk.step.wrapNeedCyl')));
      } else {
        if (!st.wrapTarget || !cylTargets.some((x) => x.id === st.wrapTarget)) {
          st.wrapTarget = cylTargets[cylTargets.length - 1].id;
          const cf = Features.findCylFaceOnItem(st.wrapTarget);
          st.wrapFace = cf ? Features.wrapTangentPlane(st.wrapTarget, cf.info, null).faceSpec : null;
        }
        stepBox.append(UI.selectField({
          id: 'st-wrap-target', label: T('sk.step.wrapBody'), value: st.wrapTarget,
          options: cylTargets.map((x) => [x.id, Model.label(x)]),
          onChange: (v) => {
            st.wrapTarget = v;
            const cf = Features.findCylFaceOnItem(v);
            st.wrapFace = cf ? Features.wrapTangentPlane(v, cf.info, null).faceSpec : null;
            renderStep(); updatePreview();
          },
        }));
        const modeOpts = st.openOnly ? [['line', T('sk.step.wrapLine')]] : [['emboss', T('sk.step.wrapEmboss')], ['deboss', T('sk.step.wrapDeboss')], ['line', T('sk.step.wrapLine')]];
        if (st.openOnly) st.wrapMode = 'line';
        stepBox.append(UI.selectField({ id: 'st-wrap-mode', label: T('common.kind'), value: st.wrapMode || 'emboss', options: modeOpts, onChange: (v) => { st.wrapMode = v; renderStep(); updatePreview(); } }));
        if (st.wrapMode !== 'line') {
          stepBox.append(UI.numField({ id: 'st-wrap-depth', label: st.wrapMode === 'deboss' ? T('param.d') : T('param.h'), value: st.wrapDepth ?? 2, min: 0.05, onCommit: (v) => { st.wrapDepth = v; updatePreview(); } }));
        }
        stepBox.append(UI.numField({ id: 'st-wrap-angle', label: T('sk.step.wrapStartAng'), value: st.wrapAngle ?? 0, unit: '°', onCommit: (v) => { st.wrapAngle = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-wrap-shift', label: T('sk.step.wrapShift'), value: st.wrapShiftY ?? 0, onCommit: (v) => { st.wrapShiftY = v; updatePreview(); } }));
        const tmpW = stepItem();
        const aInfo = Model.wrapAngleInfo ? Model.wrapAngleInfo(tmpW, Model.vars(App.doc).v) : null;
        if (aInfo) {
          stepBox.append(h('div', { class: 'mini-row', id: 'st-wrap-info' },
            h('span', { class: 'grow' }, T('sk.step.wrapCircAng', { d: Units.fmtLenU(aInfo.radius * 2, 1) })),
            h('b', { class: 'mono' }, fmtAngleU(aInfo.deg))));
        }
      }
    } else if (st.emboss) {
      const msw = h('div', { class: 'role-switch' });
      const m1 = h('button', { type: 'button', id: 'st-emb-emboss', 'aria-pressed': st.embossMode !== 'deboss' ? 'true' : 'false' }, T('sk.step.embossRaised'));
      m1.onclick = () => { st.embossMode = 'emboss'; renderStep(); updatePreview(); };
      const m2 = h('button', { type: 'button', id: 'st-emb-deboss', 'aria-pressed': st.embossMode === 'deboss' ? 'true' : 'false' }, T('sk.step.embossRecessed'));
      m2.onclick = () => { st.embossMode = 'deboss'; renderStep(); updatePreview(); };
      msw.append(m1, m2);
      stepBox.append(msw);
      stepBox.append(UI.numField({ id: 'st-emb-h', label: T('param.h'), value: st.embossHeight ?? 1, min: 0.1, unit: 'mm', onCommit: (v) => { st.embossHeight = v; updatePreview(); } }));
      const tgt = st.embossTarget ? Model.find(App.doc, st.embossTarget) : null;
      stepBox.append(h('div', { class: 'mini-row', id: 'st-emb-face-info' }, h('span', { class: 'grow' }, st.embossFace && tgt ? T('sk.step.embossFaceInfo', { name: Model.label(tgt.item) }) : T('sk.step.noTargetFace'))));
      const pb = h('button', { type: 'button', class: 'btn' + (st.pickingFace ? ' accent' : ''), id: 'st-emb-pick' });
      pb.innerHTML = icon('cursor') + esc(T(st.pickingFace ? 'sk.step.pickFaceClick' : st.embossFace ? 'panel.ext.pickOtherFace' : 'panel.ext.pickFace'));
      pb.onclick = () => { st.pickingFace = !st.pickingFace; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); };
      stepBox.append(pb);
      const flp = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'st-emb-flip', checked: !!st.embossFlip }), T('sk.panel.otherSide'));
      flp.querySelector('input').onchange = (e) => { st.embossFlip = e.target.checked; updatePreview(); };
      stepBox.append(flp);
    } else if (st.splitFace) {
      stepBox.append(UI.selectField({
        id: 'st-sf-side', label: T('panel.splitFace.side'), value: st.splitFaceSide || 'front',
        options: [['front', T('panel.splitFace.front')], ['back', T('panel.splitFace.back')], ['both', T('panel.splitFace.both')]],
        onChange: (v) => { st.splitFaceSide = v; updatePreview(); },
      }));
      const tgt = st.splitFaceTarget ? Model.find(App.doc, st.splitFaceTarget) : null;
      stepBox.append(h('div', { class: 'mini-row', id: 'st-sf-face-info' }, h('span', { class: 'grow' }, st.splitFaceSig && tgt ? T('sk.step.embossFaceInfo', { name: Model.label(tgt.item) }) : T('sk.step.noTargetFace'))));
      const pb = h('button', { type: 'button', class: 'btn' + (st.pickingFace ? ' accent' : ''), id: 'st-sf-pick' });
      pb.innerHTML = icon('cursor') + esc(T(st.pickingFace ? 'sk.step.pickFaceClick' : st.splitFaceSig ? 'panel.ext.pickOtherFace' : 'panel.ext.pickFace'));
      pb.onclick = () => { st.pickingFace = !st.pickingFace; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); };
      stepBox.append(pb);
    } else if (st.rib) {
      if (!ribTargets.length) {
        stepBox.append(h('div', { class: 'hint-box' }, T('sk.step.ribNeedBody')));
      } else {
        if (!st.ribTarget || !ribTargets.some((x) => x.id === st.ribTarget)) st.ribTarget = ribTargets[ribTargets.length - 1].id;
        stepBox.append(UI.selectField({ id: 'st-rib-target', label: T('ctx.targetBody'), value: st.ribTarget, options: ribTargets.map((x) => [x.id, Model.label(x)]), onChange: (v) => { st.ribTarget = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-rib-t', label: T('common.thickness'), value: st.ribThickness, min: 0.1, onCommit: (v) => { st.ribThickness = v; updatePreview(); } }));
        stepBox.append(UI.selectField({ id: 'st-rib-side', label: T('sk.step.ribSide'), value: st.ribSide || 'center', options: [['center', T('panel.ext.wallCenter')], ['side1', T('sk.step.ribSide1')], ['side2', T('sk.step.ribSide2')]], onChange: (v) => { st.ribSide = v; updatePreview(); } }));
        stepBox.append(UI.selectField({ id: 'st-rib-dir', label: T('panel.gap.dir'), value: st.ribDir || 'normal', options: [['normal', T('sk.step.ribDirNormal')], ['parallel', T('sk.step.ribDirPar')]], onChange: (v) => { st.ribDir = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-rib-draft', label: T('sk.step.ribDraft'), value: st.ribDraft ?? 0, unit: '°', min: 0, onCommit: (v) => { st.ribDraft = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-rib-depth', label: T('sk.step.ribDepth'), value: st.ribDepth ?? 0, min: 0, onCommit: (v) => { st.ribDepth = v; updatePreview(); } }));
        const fl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'st-rib-flip', checked: !!st.ribFlip }), T('sk.step.ribFlip'));
        fl.querySelector('input').onchange = (e) => { st.ribFlip = e.target.checked; updatePreview(); };
        stepBox.append(fl);
      }
    } else if (st.web) {
      if (!ribTargets.length) {
        stepBox.append(h('div', { class: 'hint-box' }, T('sk.step.webNeedBody')));
      } else {
        if (!st.webTarget || !ribTargets.some((x) => x.id === st.webTarget)) st.webTarget = ribTargets[ribTargets.length - 1].id;
        stepBox.append(UI.selectField({ id: 'st-web-target', label: T('ctx.targetBody'), value: st.webTarget, options: ribTargets.map((x) => [x.id, Model.label(x)]), onChange: (v) => { st.webTarget = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-web-t', label: T('common.thickness'), value: st.webThickness, min: 0.1, onCommit: (v) => { st.webThickness = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-web-depth', label: T('panel.web.depth'), value: st.webDepth ?? 0, min: 0, onCommit: (v) => { st.webDepth = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-web-draft', label: T('sk.step.ribDraft'), value: st.webDraft ?? 0, unit: '°', min: 0, onCommit: (v) => { st.webDraft = v; updatePreview(); } }));
        const ex = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'st-web-extend', checked: st.webExtend !== false }), T('panel.web.extend'));
        ex.querySelector('input').onchange = (e) => { st.webExtend = e.target.checked; updatePreview(); };
        const fl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'st-web-flip', checked: !!st.webFlip }), T('sk.step.ribFlip'));
        fl.querySelector('input').onchange = (e) => { st.webFlip = e.target.checked; updatePreview(); };
        stepBox.append(ex, fl);
      }
    } else if (st.sweep) {
      const sweepTargets = !App.ctx ? App.doc.items.filter((x) => x.role !== 'hole' && !x.suppressed && !(x.kind === 'group' && x.p && x.p.assembly) && x.kind !== 'ref' && x.kind !== 'rib' && x.kind !== 'wrap' && x.kind !== 'emboss' && x.kind !== 'mirrorStep' && x.kind !== 'deleteBody' && x.kind !== 'boss' && x.kind !== 'lipGroove' && !(x.kind === 'transform' && !(x.p && x.p.copy)) && x.kind !== 'scale' && x.kind !== 'deform' && x.kind !== 'directFace' && x.kind !== 'deleteFace' && x.kind !== 'replaceFace' && x.kind !== 'moveEdge' && x.kind !== 'editHole' && x.kind !== 'editFillet' && !(x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) && !(x.op && x.op.target)) : [];
      if (sweepTargets.length) {
        if (!st.sweepTarget || !sweepTargets.some((x) => x.id === st.sweepTarget)) st.sweepTarget = sweepTargets[sweepTargets.length - 1].id;
        const opF = UI.selectField({
          id: 'st-sweep-op', label: T('panel.op.what'), value: st.sweepOp || 'new',
          options: [['new', T('panel.op.new')], ['cut', T('panel.sweep.opCut')], ['join', T('panel.op.join')], ['common', T('panel.op.common')]],
          onChange: (v) => { st.sweepOp = v; renderStep(); updatePreview(); },
        });
        opF.setAttribute('data-help', 'sweepCut');
        stepBox.append(opF);
        if ((st.sweepOp || 'new') !== 'new') {
          stepBox.append(UI.selectField({
            id: 'st-sweep-target', label: T('panel.op.target'), value: st.sweepTarget,
            options: sweepTargets.map((x) => [x.id, Model.label(x)]),
            onChange: (v) => { st.sweepTarget = v; updatePreview(); },
          }));
        }
      }
      const profs = App.doc.items.filter((x) => x.kind === 'extrude' && x.p && x.p.sketch);
      const shp = st.sweepShape === 'rect' ? 'rect' : st.sweepShape === 'sketch' && profs.length ? 'sketch' : 'circle';
      st.sweepShape = shp;
      stepBox.append(UI.selectField({
        id: 'st-sweep-shape', label: T('panel.sweep.shape'), value: shp,
        options: [['circle', T('panel.sweep.circle')], ['rect', T('panel.sweep.rect')], ...(profs.length ? [['sketch', T('panel.sweep.sketch')]] : [])],
        onChange: (v) => { st.sweepShape = v; if (v === 'sketch' && (!st.sweepProfId || !profs.some((x) => x.id === st.sweepProfId))) st.sweepProfId = profs[0] ? profs[0].id : null; renderStep(); updatePreview(); },
      }));
      if (shp === 'sketch') {
        if (!st.sweepProfId || !profs.some((x) => x.id === st.sweepProfId)) st.sweepProfId = profs[0].id;
        stepBox.append(UI.selectField({
          id: 'st-sweep-prof', label: T('panel.sweep.profFrom'), value: st.sweepProfId,
          options: profs.map((x) => [x.id, Model.label(x)]),
          onChange: (v) => { st.sweepProfId = v; updatePreview(); },
        }));
      } else if (shp === 'circle') {
        stepBox.append(UI.numField({ id: 'st-sweep-d', label: T('param.dia'), value: st.sweepD ?? 6, min: 0.1, onCommit: (v) => { st.sweepD = v; updatePreview(); } }));
      } else {
        stepBox.append(UI.numField({ id: 'st-sweep-w', label: T('param.w'), value: st.sweepW ?? 6, min: 0.1, onCommit: (v) => { st.sweepW = v; updatePreview(); } }));
        stepBox.append(UI.numField({ id: 'st-sweep-h', label: T('param.h'), value: st.sweepH ?? 4, min: 0.1, onCommit: (v) => { st.sweepH = v; updatePreview(); } }));
      }
      if (shp !== 'sketch') {
        stepBox.append(UI.numField({ id: 'st-sweep-wall', label: T('panel.sweep.wallOpt'), value: st.sweepWall ?? 0, min: 0, onCommit: (v) => { st.sweepWall = v; updatePreview(); } }));
      }
      const twF = UI.numField({ id: 'st-sweep-twist', label: T('panel.sweep.twist'), value: st.sweepTwist ?? 0, unit: '°', onCommit: (v) => { st.sweepTwist = v; updatePreview(); } });
      twF.setAttribute('data-help', 'sweepTwist');
      stepBox.append(twF);
      stepBox.append(h('p', null, T('sk.step.sweepDesc')));
    } else if (st.frame) {
      const V = Model.vars(App.doc).v;
      const profs = App.doc.items.filter((x) => (x.kind === 'extrude' || x.kind === 'revolve') && x.p && x.p.sketch && SK.regions(Solver.cached(x.p.sketch, V).ents).length > 0);
      const pm = st.frameProfileMode === 'sketch' ? 'sketch' : 'library';
      st.frameProfileMode = pm;
      stepBox.append(UI.selectField({
        id: 'st-frame-mode', label: T('panel.frame.profMode'), value: pm,
        options: [['library', T('panel.frame.modeLibrary')], ['sketch', T('panel.frame.modeSketch')]],
        onChange: (v) => {
          st.frameProfileMode = v;
          if (v === 'sketch' && (!st.frameProfId || !profs.some((x) => x.id === st.frameProfId))) st.frameProfId = profs[0] ? profs[0].id : null;
          renderStep(); updatePreview();
        },
      }));
      if (pm === 'library') {
        const shOpts = typeof PROFILE_SHAPE_OPTIONS !== 'undefined' ? PROFILE_SHAPE_OPTIONS : [['squareTube', 'Vierkantrohr']];
        stepBox.append(UI.selectField({
          id: 'st-frame-shape', label: T('panel.frame.shape'), value: st.frameShape || 'squareTube', options: shOpts,
          onChange: (v) => {
            st.frameShape = v;
            st.frameSize = v === 'squareTube' ? '20x20x2' : (typeof profileDefaultSize === 'function' ? profileDefaultSize(v) : '20x20x2');
            renderStep(); updatePreview();
          },
        }));
        const szOpts = (typeof profileSizeOptions === 'function' ? profileSizeOptions(st.frameShape || 'squareTube') : [['20x20x2', '20 × 20 × 2 mm']]).filter(([k]) => k !== 'custom');
        if (!szOpts.some(([k]) => k === st.frameSize)) st.frameSize = szOpts[0] ? szOpts[0][0] : '20x20x2';
        stepBox.append(UI.selectField({
          id: 'st-frame-size', label: T('panel.frame.size'), value: st.frameSize, options: szOpts,
          onChange: (v) => { st.frameSize = v; updatePreview(); },
        }));
      } else if (profs.length) {
        if (!st.frameProfId || !profs.some((x) => x.id === st.frameProfId)) st.frameProfId = profs[0].id;
        stepBox.append(UI.selectField({
          id: 'st-frame-prof', label: T('panel.frame.profSketch'), value: st.frameProfId,
          options: profs.map((x) => [x.id, Model.label(x)]),
          onChange: (v) => { st.frameProfId = v; updatePreview(); },
        }));
      } else {
        st.frameProfId = null;
        stepBox.append(h('div', { class: 'hint-box' }, T('panel.frame.needProfSketch')));
      }
      stepBox.append(UI.numField({ id: 'st-frame-rot', label: T('panel.frame.rot'), value: st.frameRot ?? 0, unit: '°', onCommit: (v) => { st.frameRot = v; updatePreview(); } }));
      stepBox.append(h('p', null, T('sk.step.frameDesc')));
    } else if (!st.revolve) {
      const ext = st.extent === 'toNext' || st.extent === 'toFace' ? st.extent : 'dist';
      const exF = UI.selectField({
        id: 'st-extent',
        label: T('panel.ext.to'),
        value: ext,
        options: [['dist', T('panel.ext.dist')], ['toNext', T('panel.ext.toNext')], ['toFace', T('panel.ext.toFace')]],
        onChange: (v) => {
          st.extent = v;
          if (v === 'dist') {
            const rd = App.resolvedDist('__preview');
            if (rd != null) st.dist = round(rd, 4);
            st.pickingFace = false;
            Viewer.canvas.style.cursor = '';
            Viewer.highlightFace('hover', null, null);
          } else {
            if (st.dir === 'both') st.dir = 'normal';
            if (v === 'toNext') { st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); }
            else if (v === 'toFace' && !st.toFace) { st.pickingFace = true; Viewer.canvas.style.cursor = 'crosshair'; }
          }
          renderStep(); updatePreview();
        },
      });
      exF.setAttribute('data-help', 'extrudeToFace');
      stepBox.append(exF);
      if (ext === 'dist') {
        stepBox.append(UI.numField({ id: 'st-dist', label: T('param.h'), value: st.dist, onCommit: (v) => { st.dist = v; updatePreview(); } }));
      }
      const dirOpts = ext === 'dist'
        ? [['normal', T(S.ctx.targetId ? 'sk.step.dirOutBody' : 'sk.step.dirUp')], ['reverse', T(S.ctx.targetId ? 'sk.step.dirInHole' : 'sk.step.dirDown')], ['both', T('sk.step.dirBoth')]]
        : [['normal', T(S.ctx.targetId ? 'sk.step.dirOutBody' : 'sk.step.dirUp')], ['reverse', T(S.ctx.targetId ? 'sk.step.dirInHole' : 'sk.step.dirDown')]];
      stepBox.append(UI.selectField({ id: 'st-dir', label: T('panel.gap.dir'), value: st.dir === 'both' && ext !== 'dist' ? 'normal' : st.dir, options: dirOpts, onChange: (v) => { st.dir = v; renderStep(); updatePreview(); } }));
      if (ext === 'toFace') {
        const pb = h('button', { type: 'button', class: 'btn' + (st.pickingFace ? ' primary' : ''), id: 'st-pick-face' });
        pb.innerHTML = icon('pointer') + esc(T(st.pickingFace ? 'sk.step.clickFaceWait' : st.toFace ? 'panel.ext.pickOtherFace' : 'panel.ext.pickFace'));
        pb.onclick = () => {
          st.pickingFace = !st.pickingFace;
          Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : '';
          if (!st.pickingFace) Viewer.highlightFace('hover', null, null);
          renderStep();
        };
        stepBox.append(pb);
      }
      if (ext !== 'dist') {
        stepBox.append(h('div', { class: 'hint-box', id: 'st-ext-info' }));
        updateStepExtInfo();
      }
      if (!st.openOnly && !st.fromPushPull) {
        const tl = h('label', { class: 'check', 'data-help': 'thinWall' }, h('input', { type: 'checkbox', id: 'st-thin', checked: !!st.thin }), T('sk.step.titleThin'));
        tl.querySelector('input').onchange = (e) => { st.thin = e.target.checked; renderStep(); updatePreview(); };
        stepBox.append(tl);
      }
      if (st.thin) {
        stepBox.append(UI.numField({ id: 'st-wall', label: T('param.wall'), value: st.wall, min: 0.1, onCommit: (v) => { st.wall = v; updatePreview(); } }));
        stepBox.append(UI.selectField({ id: 'st-wall-side', label: T('panel.ext.wallSide'), value: st.wallSide || 'center', options: [['center', T('panel.ext.wallCenter')], ['in', T('panel.ext.wallIn')], ['out', T('panel.ext.wallOut')]], onChange: (v) => { st.wallSide = v; updatePreview(); } }));
      }
    } else {
      const sel = S.ents.find((x) => x.id === S.sel && x.type === 'line');
      const opts = [['y', T('sk.step.revAxisY')], ['x', T('sk.step.revAxisX')]];
      if (S.ents.some((x) => x.type === 'line')) opts.push(['line', T('sk.step.revAxisLine')]);
      if (typeof Datums !== 'undefined') for (const da of Datums.axes()) if (da.axis) opts.push(['da:' + da.id, T('panel.rev.axisDatum', { name: da.name })]);
      stepBox.append(UI.selectField({ id: 'st-axis', label: T('sk.step.revAxis'), value: st.axis, options: opts, onChange: (v) => { st.axis = v; if (v === 'line') { const l = S.ents.find((x) => x.type === 'line' && x.revAxis) || S.ents.find((x) => x.type === 'line' && x.con) || S.ents.find((x) => x.type === 'line'); st.axisLine = l ? l.id : null; } updatePreview(); renderStep(); } }));
      if (st.axis === 'line') {
        const lines = S.ents.filter((x) => x.type === 'line');
        stepBox.append(UI.selectField({ id: 'st-line', label: T('sk.panel.ent.line'), value: st.axisLine, options: lines.map((l, i) => [l.id, T('sk.step.revLineItem', { n: i + 1, len: Units.fmtLenU(SK.d2(l.a, l.b), 1), con: (l.revAxis ? T('sk.step.revLineAxis') : '') + (l.con ? T('sk.step.revLineCon') : '') })]), onChange: (v) => { st.axisLine = v; updatePreview(); } }));
      }
      const rdir = st.revDir || 'normal';
      const rdirSel = UI.selectField({
        id: 'st-rev-dir', label: T('panel.gap.dir'), value: rdir,
        options: [['normal', T('panel.rev.dirNormal')], ['reverse', T('panel.rev.dirReverse')], ['both', T('panel.rev.dirBoth')], ['two', T('panel.rev.dirTwo')], ['toFace', T('panel.rev.dirToFace')]],
        onChange: (v) => {
          st.revDir = v;
          if (v === 'two' && st.angle >= 359) { st.angle = 90; st.angle2 = 90; }
          if (v !== 'toFace') { st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null); }
          else if (!st.revToFace) { st.pickingFace = true; Viewer.canvas.style.cursor = 'crosshair'; }
          renderStep(); updatePreview();
        },
      });
      rdirSel.setAttribute('data-help', 'revolveOptions');
      stepBox.append(rdirSel);
      if (rdir !== 'toFace') {
        const angLbl = rdir === 'both' ? T('panel.rev.totalAngle') : rdir === 'two' ? T('panel.rev.angle1') : T('common.angle');
        const minA = rdir === 'two' ? 0 : 0.1;
        stepBox.append(UI.numField({ id: 'st-angle', label: angLbl, value: st.angle, unit: '°', min: minA, onCommit: (v) => { st.angle = clamp(v, minA, 360); renderStep(); updatePreview(); } }));
        if (rdir === 'both') stepBox.append(h('div', { class: 'mini-row', id: 'st-rev-sym-info' }, h('span', { class: 'grow' }, T('panel.rev.sym')), h('b', { class: 'mono' }, T('panel.rev.perSide', { v: fmtAngleU(st.angle / 2) }))));
        if (rdir === 'two') stepBox.append(UI.numField({ id: 'st-angle2', label: T('panel.rev.angle2'), value: st.angle2, unit: '°', min: 0, onCommit: (v) => { st.angle2 = clamp(v, 0, 360); updatePreview(); } }));
      } else {
        stepBox.append(h('div', { class: 'mini-row', id: 'st-rev-face-info' }, h('span', { class: 'grow' }, st.revToFace ? T('panel.rev.faceTarget', { kind: T(st.revToFace.kind === 'datum' ? 'panel.rev.datumKind' : 'panel.rev.faceKind'), name: st.revToFace.name || T('panel.rev.faceKind'), deg: '' }) : T('panel.rev.noFace'))));
        const pb = h('button', { type: 'button', class: 'btn' + (st.pickingFace ? ' primary' : ''), id: 'st-rev-face-pick' });
        pb.innerHTML = icon('cursor') + esc(T(st.pickingFace ? 'sk.step.pickFaceClick' : st.revToFace ? 'panel.ext.pickOtherFace' : 'panel.ext.pickFace'));
        pb.onclick = () => { st.pickingFace = !st.pickingFace; Viewer.canvas.style.cursor = st.pickingFace ? 'crosshair' : ''; if (!st.pickingFace) Viewer.highlightFace('hover', null, null); renderStep(); };
        stepBox.append(pb);
        const dats = typeof Datums !== 'undefined' ? Datums.list().filter((d) => d.plane) : [];
        if (dats.length) {
          stepBox.append(UI.selectField({
            id: 'st-rev-face-datum', label: T('panel.rev.datumGoal'),
            value: st.revToFace && st.revToFace.kind === 'datum' ? st.revToFace.datumId : '',
            options: [['', T('panel.rev.chooseDatum')], ...dats.map((d) => [d.id, d.name])],
            onChange: (v) => {
              const d = v ? Datums.find(v) : null; if (!d || !d.plane) return;
              const inv = S.W.clone().invert(), r6 = (a) => a.map((x) => round(x, 6));
              const oL = new THREE.Vector3(...d.plane.o).applyMatrix4(inv).toArray();
              const nL = new THREE.Vector3(...d.plane.n).transformDirection(inv).normalize().toArray();
              st.revToFace = { kind: 'datum', datumId: d.id, o: r6(oL), fn: r6(nL), name: d.name };
              const tmp = stepItem(), fr = Model.revolveFrame(tmp.p, Model.vars(App.doc).v);
              st.toFaceFlip = Model.revolveAutoFlip(fr, oL, nL, oL);
              st.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null);
              renderStep(); updatePreview();
            },
          }));
        }
        const flp = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'st-rev-face-flip', checked: !!st.toFaceFlip }), T('panel.rev.otherDir'));
        flp.querySelector('input').onchange = (e) => { st.toFaceFlip = e.target.checked; updatePreview(); };
        stepBox.append(flp);
        if (st.pickingFace) UI.hint(T('sk.step.revPickHint'));
      }
    }
    if (!st.sweep && !st.frame && !st.rib && !st.web && !st.wrap && !st.emboss && !st.splitFace) {
      const hole = !st.revolve && st.dir === 'reverse' && S.ctx.targetId;
      stepBox.append(h('p', null, T(hole ? 'sk.step.resHole' : S.ctx.targetId ? 'sk.step.resJoin' : 'sk.step.resNew')));
    }
    const row = h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } });
    const back = h('button', { type: 'button', class: 'btn ghost' }); back.innerHTML = st.fromPushPull ? esc(T('common.cancel')) : icon('undo') + esc(T('sk.bar.title')); back.dataset.tip = st.fromPushPull ? '' : T('sk.step.backTip'); back.onclick = () => stepBack();
    const ok = h('button', { type: 'button', class: 'btn primary', disabled: (st.rib && !ribTargets.length) || (st.web && !ribTargets.length) || (st.wrap && !cylTargets.length) || (st.emboss && (!st.embossTarget || !st.embossFace)) || (st.splitFace && (!st.splitFaceTarget || !st.splitFaceSig)) || (st.frame && st.frameProfileMode === 'sketch' && !st.frameProfId) }); ok.innerHTML = icon('check') + esc(T('common.done')); ok.onclick = () => stepOK();
    row.append(back, ok); stepBox.append(row);
  }
  function stepItem() {
    const st = S.step;
    const pr = S.planeRef ? { planeRef: deepClone(S.planeRef) } : {};
    const lk = S.locked ? { locked: true } : {};
    const bi = S.blockInsts && S.blockInsts.length ? { blockInsts: deepClone(S.blockInsts) } : {};
    const gd = S.guides && S.guides.length ? { guides: deepClone(S.guides) } : {};
    const pg = S.gridMode === 'polar' ? { gridMode: 'polar', polar: deepClone(S.polar) } : {};
    if (st.wrap) {
      return Model.newItem('wrap', {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        target: st.wrapTarget,
        face: st.wrapFace ? deepClone(st.wrapFace) : null,
        mode: st.openOnly ? 'line' : (st.wrapMode || 'emboss'),
        depth: st.wrapDepth ?? 2,
        angle: st.wrapAngle ?? 0,
        shiftY: st.wrapShiftY ?? 0,
        rot: st.wrapRot ?? 0,
        flip: !!st.wrapFlip,
      }, { name: 'Wickeln', color: st.color });
    }
    if (st.emboss) {
      const regs = SK.regions(S.ents);
      const sel = st.sel && st.sel.length && st.sel.length < regs.length ? st.sel.slice() : null;
      return Model.newItem('emboss', {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        sel,
        target: st.embossTarget,
        face: st.embossFace ? deepClone(st.embossFace) : null,
        height: st.embossHeight ?? 1,
        mode: st.embossMode === 'deboss' ? 'deboss' : 'emboss',
        flip: !!st.embossFlip,
      }, { name: 'Prägen', color: st.color });
    }
    if (st.splitFace) {
      const regs = SK.regions(S.ents);
      const sel = st.sel && st.sel.length && st.sel.length < regs.length ? st.sel.slice() : null;
      return Model.newItem('splitFace', {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        sel,
        target: st.splitFaceTarget,
        face: st.splitFaceSig ? deepClone(st.splitFaceSig) : null,
        side: st.splitFaceSide || 'front',
      }, { name: T('kind.splitFace'), color: st.color });
    }
    if (st.rib) {
      return Model.newItem('rib', {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        target: st.ribTarget,
        thickness: st.ribThickness,
        side: st.ribSide || 'center',
        dir: st.ribDir || 'normal',
        flip: !!st.ribFlip,
        depth: st.ribDepth ?? 0,
        draft: st.ribDraft ?? 0,
      }, { name: 'Rippe', color: st.color });
    }
    if (st.web) {
      return Model.newItem('web', {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        target: st.webTarget,
        thickness: st.webThickness,
        depth: st.webDepth ?? 0,
        draft: st.webDraft ?? 0,
        extend: st.webExtend !== false,
        flip: !!st.webFlip,
      }, { name: T('kind.web'), color: st.color });
    }
    if (st.sweep) {
      const p = {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        shape: st.sweepShape === 'rect' ? 'rect' : st.sweepShape === 'sketch' ? 'sketch' : 'circle',
        d: st.sweepD ?? 6,
        w: st.sweepW ?? 6,
        h: st.sweepH ?? 4,
        wall: st.sweepWall ?? 0,
        twist: st.sweepTwist ?? 0,
      };
      if (p.shape === 'sketch' && st.sweepProfId) {
        const src = Model.find(App.doc, st.sweepProfId);
        if (src && src.item && src.item.p && src.item.p.sketch) {
          p.prof = deepClone(src.item.p.sketch);
          p.profName = Model.label(src.item);
        } else p.shape = 'circle';
      }
      const hasOp = !App.ctx && st.sweepOp && st.sweepOp !== 'new' && st.sweepTarget && Model.find(App.doc, st.sweepTarget);
      const it = Model.newItem('sweep', p, { name: hasOp && st.sweepOp === 'cut' ? 'Nut entlang Pfad' : 'Entlang Pfad', color: st.color });
      if (hasOp) it.op = { type: st.sweepOp, target: st.sweepTarget };
      return it;
    }
    if (st.frame) {
      const p = {
        sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg },
        profileMode: st.frameProfileMode === 'sketch' ? 'sketch' : 'library',
        shape: st.frameShape || 'squareTube',
        size: st.frameSize || '20x20x2',
        rot: st.frameRot ?? 0,
        offX: 0,
        offY: 0,
      };
      if (p.profileMode === 'sketch' && st.frameProfId) {
        const src = Model.find(App.doc, st.frameProfId);
        if (src && src.item && src.item.p && src.item.p.sketch) {
          p.prof = deepClone(src.item.p.sketch);
          p.profName = Model.label(src.item);
          p.profId = src.item.id;
        } else p.profileMode = 'library';
      }
      return Model.newItem('frame', p, { name: T('kind.frame'), color: st.color, mat: 'Baustahl' });
    }
    const regs = SK.regions(S.ents);
    const sel = st.sel && st.sel.length && st.sel.length < regs.length ? st.sel.slice() : null;
    const role = !st.revolve && st.dir === 'reverse' && S.ctx.targetId ? 'hole' : 'solid';
    const kind = st.revolve ? 'revolve' : 'extrude';
    const target = S.ctx.targetId ? Model.find(App.doc, S.ctx.targetId) : null;
    const name = st.revolve ? 'Drehkörper' : role === 'hole' ? 'Aussparung' : S.ctx.targetId ? 'Erhöhung' : (st.thin && st.openOnly ? 'Dünne Wand' : 'Skizzenkörper');
    const it = Model.newItem(kind, {}, { name, role, color: st.color });
    const p = { sketch: { plane: deepClone(S.plane), ents: deepClone(S.ents), dims: deepClone(S.dims), cons: deepClone(S.cons), ...bi, ...pr, ...lk, ...gd, ...pg, ...(S.bg ? { bg: deepClone(S.bg) } : {}) }, sel };
    if (kind === 'extrude') {
      const rd = (st.extent === 'toNext' || st.extent === 'toFace') ? App.resolvedDist('__preview') : null;
      p.dist = rd != null ? round(rd, 4) : st.dist;
      p.dir = st.dir;
      if (st.extent === 'toNext' || st.extent === 'toFace') {
        p.extent = st.extent;
        if (st.extent === 'toFace' && st.toFace) p.toFace = deepClone(st.toFace);
      }
      if (role === 'hole') p.extra = 0.05; else if (S.ctx.targetId) p.extra = 0.02;
      if (st.thin) { p.thin = true; p.wall = st.wall; p.wallSide = st.wallSide || 'center'; }
    }
    else {
      p.dir = st.revDir || 'normal';
      p.angle = st.angle;
      if (p.dir === 'two') p.angle2 = st.angle2;
      if (p.dir === 'toFace') {
        if (st.revToFace) p.toFace = deepClone(st.revToFace);
        p.toFaceFlip = !!st.toFaceFlip;
      }
      if (typeof st.axis === 'string' && st.axis.startsWith('da:') && typeof Datums !== 'undefined') {
        const da = Datums.findAxis(st.axis.slice(3));
        if (da && da.axis) {
          const inv = S.W.clone().invert();
          const o = new THREE.Vector3(...da.axis.o).applyMatrix4(inv), d = new THREE.Vector3(...da.axis.d).transformDirection(inv).normalize();
          p.axisId = da.id;
          p.axis3d = { o: o.toArray().map((v) => round(v, 6)), d: d.toArray().map((v) => round(v, 9)) };
        } else p.axis = { a: [0, 0], b: [0, 1] };
      }
      else if (st.axis === 'x') p.axis = { a: [0, 0], b: [1, 0] };
      else if (st.axis === 'line' && st.axisLine) { const l = S.ents.find((x) => x.id === st.axisLine); if (l) { p.axis = { a: l.a.slice(), b: l.b.slice() }; p.axisEnt = l.id; } }
      else p.axis = { a: [0, 0], b: [0, 1] };
    }
    it.p = p;
    return it;
  }
  const previewUpd = debounce(() => {
    if (!S || !S.step) return;
    if ((S.step.rib && !S.step.ribTarget) || (S.step.web && !S.step.webTarget) || (S.step.wrap && !S.step.wrapTarget) || (S.step.emboss && (!S.step.embossTarget || !S.step.embossFace))) { App.extra = []; App.rebuild(); placeArrow(); return; }
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
    let lab = r ? r.label : null;
    if (!lab) {
      const ch = SK.chains(S.ents)[0];
      if (ch && ch.segs.length) {
        const pts = SK.segPoints(ch.segs[0]);
        lab = pts[Math.floor(pts.length / 2)] || ch.segs[0].a;
      } else {
        const b = SK.bounds(S.ents);
        lab = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
      }
    }
    const st = S.step; const V = Model.vars(App.doc).v; const d = Model.num(st.dist, V, 10);
    const sgn = st.dir === 'reverse' ? -1 : 1; const off = st.dir === 'both' ? d / 2 : d;
    return toWorld(lab[0], lab[1]).addScaledVector(S.F.n, sgn * off);
  }
  function placeArrow() {
    if (arrow) { arrow.remove(); arrow = null; }
    for (const l of labels.filter((x) => x.classList.contains('steplabel'))) l.remove();
    if (!S || !S.step || S.step.revolve || S.step.sweep || S.step.frame || S.step.rib || S.step.web || S.step.wrap || S.step.emboss || S.step.extent === 'toNext' || S.step.extent === 'toFace') { Viewer.requestRender(); return; }
    const p = arrowPos();
    const dir = S.F.n.clone().multiplyScalar(S.step.dir === 'reverse' ? -1 : 1);
    const ps = Viewer.pixelSizeAt(p);
    const a = Viewer.toScreen(p), b = Viewer.toScreen(p.clone().addScaledVector(dir, 40 * ps));
    let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy);
    if (L < 6) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    // Pfeil im Bildschirm: zeigt immer in Zugrichtung, gut greifbar
    arrow = h('div', { class: 'pull-arrow', role: 'slider', 'aria-label': T('sk.step.arrowAria'), 'data-tip': T('sk.step.arrowTip') });
    arrow.innerHTML = '<svg viewBox="0 0 30 58" aria-hidden="true"><circle cx="15" cy="50" r="5.5" class="pa-base"/><path d="M15 46V20" class="pa-shaft"/><path d="M15 3 26 21H4z" class="pa-head"/></svg>';
    arrow.style.left = a.x + 'px'; arrow.style.top = a.y + 'px';
    arrow.style.transform = `translate(-50%, -86%) rotate(${ang}deg)`;
    arrow.style.transformOrigin = '50% 86%';
    arrow.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const p0 = arrowPos();
      S.step.dragging = { p0, s0: axisParam(p0, e), d0: signedDist() };
      try { arrow.setPointerCapture(e.pointerId); } catch (_) {}
    });
    arrow.addEventListener('pointermove', (e) => { if (S && S.step && S.step.dragging) stepMove(e); });
    arrow.addEventListener('pointerup', () => stepUp());
    $('#overlay').append(arrow);
    // Höhe neben der Pfeilspitze
    const tipX = a.x + dx * 46, tipY = a.y + dy * 46;
    const el = h('div', { class: 'dimlabel live steplabel' }, Units.fmtLenU(Model.num(S.step.dist, Model.vars(App.doc).v, 10), 2));
    el.style.left = tipX + (dx >= 0 ? 34 : -34) + 'px'; el.style.top = tipY + 'px'; $('#overlay').append(el); labels.push(el);
  }
  Viewer.on('camera', () => { if (!S) return; if (S.step && !S.step.dragging) placeArrow(); else if (!S.step) updateRulers(); });
  function stepDown(e) {
    if (e.button !== 0 || !S.step) return;
    if ((S.step.emboss || S.step.splitFace) && S.step.pickingFace) {
      e.preventDefault(); e.stopPropagation();
      const hits = Viewer.pickAll(e.clientX, e.clientY).filter((h) => h.id !== '__preview');
      const hit = hits[0] || null;
      const top = hit ? Model.topOf(App.doc, hit.id) : null;
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      if (top && top.role !== 'hole' && fi && Array.isArray(fi.c)) {
        const sig = {
          c: fi.c.map((v) => round(v, 6)),
          n: Array.isArray(fi.n) ? fi.n.map((v) => round(v, 6)) : null,
          t: fi.t || null,
        };
        if (S.step.emboss) { S.step.embossTarget = top.id; S.step.embossFace = sig; }
        else { S.step.splitFaceTarget = top.id; S.step.splitFaceSig = sig; }
        S.step.pickingFace = false;
        Viewer.canvas.style.cursor = '';
        Viewer.highlightFace('hover', null, null);
        renderStep(); updatePreview();
      } else {
        UI.toast(T('sk.toast.stepPickBodyFace'), { icon: 'info' });
      }
      return;
    }
    if (S.step.revolve && S.step.pickingFace) {
      e.preventDefault(); e.stopPropagation();
      const hits = Viewer.pickAll(e.clientX, e.clientY).filter((h) => h.id !== '__preview');
      const hit = hits[0] || null;
      const r = hit ? App.results.get(hit.id) : null;
      const fi = hit && hit.faceIdx >= 0 && r && r.data && r.data.faces ? r.data.faces[hit.faceIdx] : null;
      const inv = S.W.clone().invert(), r6 = (a) => a.map((v) => round(v, 6));
      if (fi && fi.t === 'PLANE' && fi.n) {
        const W = Model.worldMatrix(App.doc, hit.id);
        const oW = new THREE.Vector3(...fi.c).applyMatrix4(W);
        const nW = new THREE.Vector3(...fi.n).transformDirection(W).normalize();
        const pickW = hit.point ? hit.point.clone() : oW.clone();
        const oL = oW.applyMatrix4(inv).toArray(), nL = nW.transformDirection(inv).normalize().toArray(), pickL = pickW.applyMatrix4(inv).toArray();
        const tgt = Model.find(App.doc, hit.id);
        S.step.revToFace = { kind: 'face', targetId: hit.id, c: r6(fi.c), n: r6(fi.n), o: r6(oL), fn: r6(nL), name: tgt ? Model.label(tgt.item) : T('panel.rev.faceKind') };
        const tmp = stepItem(), fr = Model.revolveFrame(tmp.p, Model.vars(App.doc).v);
        S.step.toFaceFlip = Model.revolveAutoFlip(fr, oL, nL, pickL);
        S.step.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null);
        renderStep(); updatePreview();
        return;
      }
      const dp = typeof Features !== 'undefined' && Features.pickDatumPlaneAt ? Features.pickDatumPlaneAt(e.clientX, e.clientY) : null;
      if (dp) {
        const oL = new THREE.Vector3(...dp.datum.plane.o).applyMatrix4(inv).toArray();
        const nL = new THREE.Vector3(...dp.datum.plane.n).transformDirection(inv).normalize().toArray();
        S.step.revToFace = { kind: 'datum', datumId: dp.datum.id, o: r6(oL), fn: r6(nL), name: dp.datum.name };
        const tmp = stepItem(), fr = Model.revolveFrame(tmp.p, Model.vars(App.doc).v);
        S.step.toFaceFlip = Model.revolveAutoFlip(fr, oL, nL, oL);
        S.step.pickingFace = false; Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null);
        renderStep(); updatePreview();
        return;
      }
      UI.toast(T('sk.toast.stepPickPlaneOrDatum'), { icon: 'info' });
      return;
    }
    if (S.step.pickingFace) {
      e.preventDefault(); e.stopPropagation();
      const ref = Features.pickTargetFaceAt(e.clientX, e.clientY, new Set(['__preview']));
      if (!ref) { UI.toast(T('sk.toast.stepPickTargetOrDatum'), { icon: 'info' }); return; }
      S.step.toFace = ref;
      S.step.pickingFace = false;
      Viewer.canvas.style.cursor = '';
      Viewer.highlightFace('hover', null, null);
      S.step.dir = Features.autoFlipDirForFace(S.plane, S.W, S.step.dir || 'normal', ref);
      renderStep(); updatePreview();
      return;
    }
    // Fläche an-/abwählen
    const uv = mouseUV(e); if (!uv) return;
    const r = SK.regionAt(SK.regions(S.ents), uv);
    if (r) {
      const st = S.step; const i = st.sel.indexOf(r.key);
      if (i >= 0) { if (st.sel.length > 1) st.sel.splice(i, 1); else UI.toast(T('sk.toast.stepNeedOneRegion'), { icon: 'info' }); }
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
    if (changedDir) renderStep(); else { const inp = $('#st-dist'); if (inp) inp.value = Units.fmtLen(st.dist); }
    updatePreview();
    placeArrowSoon();
  }
  const placeArrowSoon = throttle(() => { if (S && S.step) { const d = S.step.dragging; placeArrow(); if (d) S.step.dragging = d; } }, 50);
  function stepUp() { if (S && S.step && S.step.dragging) { S.step.dragging = null; renderStep(); } }
  function stepBack() {
    Viewer.canvas.style.cursor = ''; Viewer.highlightFace('hover', null, null);
    if (S.step.fromPushPull) { cancel(); return; }
    Viewer.canvas.style.cursor = '';
    S.step = null; App.extra = []; App.rebuild();
    if (stepBox) { stepBox.remove(); stepBox = null; }
    { const b = SK.bounds([...S.ents, ...S.refs]); const size = b ? Math.max(40, Math.max(b[2] - b[0], b[3] - b[1]) * 0.75) : 70; const c2 = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]; Viewer.lookAtPlane(toWorld(c2[0], c2[1]).toArray(), S.F.n.toArray(), S.F.x.toArray(), size); }
    placeArrow(); showBar(); showRulers(); Panels.renderRight(); UI.hint(hintFor(S.tool)); render();
  }
  function stepOK() {
    if (S.step && S.step.rib && !S.step.ribTarget) { UI.toast(T('sk.toast.stepNeedRibTarget'), { kind: 'bad' }); return; }
    if (S.step && S.step.web && !S.step.webTarget) { UI.toast(T('sk.toast.stepNeedWebTarget'), { kind: 'bad' }); return; }
    if (S.step && S.step.wrap && !S.step.wrapTarget) { UI.toast(T('sk.toast.stepNeedWrapTarget'), { kind: 'bad' }); return; }
    if (S.step && S.step.emboss && (!S.step.embossTarget || !S.step.embossFace)) { UI.toast(T('sk.toast.stepNeedEmbossFace'), { kind: 'bad' }); return; }
    if (S.step && S.step.splitFace && (!S.step.splitFaceTarget || !S.step.splitFaceSig)) { UI.toast(T('sk.toast.stepNeedSplitFace'), { kind: 'bad' }); return; }
    if (S.step && S.step.frame && S.step.frameProfileMode === 'sketch' && !S.step.frameProfId) { UI.toast(T('toast.frameNeedProf'), { kind: 'bad' }); return; }
    if (S.step.extent === 'toFace' && !S.step.toFace && !S.step.revolve && !S.step.sweep && !S.step.frame && !S.step.rib && !S.step.web && !S.step.wrap && !S.step.emboss && !S.step.splitFace) { UI.toast(T('sk.toast.stepNeedTargetFace'), { icon: 'info' }); return; }
    const it = stepItem();
    const ctx = S.ctx;
    App.extra = [];
    const lbl = it.kind === 'frame' ? T('undo.frameAdded') : it.kind === 'wrap' ? 'Um Zylinder gewickelt' : it.kind === 'emboss' ? 'Prägen erstellt' : it.kind === 'splitFace' ? 'Fläche geteilt' : it.kind === 'rib' ? 'Rippe erstellt' : it.kind === 'web' ? 'Steg-Netz erstellt' : it.kind === 'sweep' ? (it.op && it.op.type === 'cut' ? 'Nut entlang Pfad geschnitten' : 'Entlang Pfad gezogen') : it.role === 'hole' ? 'Aussparung erstellt' : it.kind === 'revolve' ? 'Drehkörper erstellt' : (it.p && it.p.thin ? 'Dünne Wand hochgezogen' : 'Hochgezogen');
    const hideProfId = (it.kind === 'sweep' && S.step.sweepShape === 'sketch') ? S.step.sweepProfId : (it.kind === 'frame' && S.step.frameProfileMode === 'sketch') ? S.step.frameProfId : null;
    const commitBlocks = docBlocksForCommit();
    App.change(lbl, (doc) => {
      doc.blocks = commitBlocks;
      if (it.kind !== 'rib' && it.kind !== 'web' && it.kind !== 'wrap' && it.kind !== 'emboss' && it.kind !== 'splitFace' && it.kind !== 'sweep' && it.kind !== 'frame' && ctx.targetId && Model.find(doc, ctx.targetId)) Actions.attach(doc, ctx.targetId, it);
      else { Model.setFromMatrix(it, S.W); doc.items.push(it); }
      if (hideProfId) { const sp = doc.items.find((x) => x.id === hideProfId); if (sp) sp.hidden = true; }
    });
    finishSession();
    const top = Model.topOf(App.doc, it.id);
    App.select([top ? top.id : it.id]);
    // neues Teil gut sichtbar machen, wenn es nach dem Zurückspringen zu klein wäre
    setTimeout(() => { const b = Actions.worldBox(top ? top.id : it.id); if (b && (Viewer.screenFraction(b) < 0.22 || !Viewer.inView(b))) Viewer.fit(App.doc.items.map((x) => x.id)); }, 480);
    UI.toast(T(it.kind === 'frame' ? 'toast.frameAdded' : it.kind === 'wrap' ? 'sk.toast.stepWrapOk' : it.kind === 'emboss' ? 'sk.toast.stepEmbossOk' : it.kind === 'splitFace' ? 'sk.toast.stepSplitFaceOk' : it.kind === 'rib' ? 'sk.toast.stepRibOk' : it.kind === 'web' ? 'sk.toast.stepWebOk' : it.kind === 'sweep' ? 'sk.toast.stepSweepOk' : it.role === 'hole' ? 'sk.toast.stepHoleOk' : 'sk.toast.stepDoneOk'), { icon: 'check' });
  }
  // ---------- 3D-Skizze (SK-51): Linien und Bögen frei im Raum ----------
  let sk3Labels = [];
  const sk3Tools = () => [
    { id: 'select', icon: 'cursor', label: T('sk.tool.select'), key: 'V', tip: T('sk3.toolTip.select') },
    { id: 'line', icon: 'line', label: T('sk.tool.line'), key: 'L', tip: T('sk3.toolTip.line') },
    { id: 'arc', icon: 'arc', label: T('sk.tool.arc'), key: 'A', tip: T('sk3.toolTip.arc') },
    { id: 'dim', icon: 'dim', label: T('sk3.tool.dim'), key: 'D', tip: T('sk3.toolTip.dim'), sep: true },
  ];
  function hint3dFor(tool) {
    if (!S3) return null;
    if (tool === 'line') return T(S3.draft && S3.draft.pts.length ? 'sk3.hint.lineNext' : 'sk3.hint.line');
    if (tool === 'arc') {
      const n = S3.draft && S3.draft.kind === 'arc' ? S3.draft.pts.length : 0;
      return T(n === 0 ? 'sk3.hint.arc0' : n === 1 ? 'sk3.hint.arc1' : 'sk3.hint.arc2');
    }
    if (tool === 'dim') return T('sk3.hint.dim');
    return T('sk3.hint.select');
  }
  function disposeThreeGroup(g) {
    if (!g) return;
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((x) => {
        if (x.geometry) x.geometry.dispose();
        if (x.material) {
          if (x.isLineSegments2 || x.isLine2) Viewer.disposeFat(x);
          else x.material.dispose();
        }
      });
    }
  }
  function clearSk3Labels() {
    for (const l of sk3Labels) l.remove();
    sk3Labels = [];
  }
  function place3dLabels() {
    for (const l of sk3Labels) {
      if (!l._pos3) continue;
      const sc = Viewer.toScreen(l._pos3);
      l.style.left = sc.x + 'px';
      l.style.top = sc.y + 'px';
    }
  }
  function addSk3Dot(g, pt, radius, color, depthTest = true, order = 26) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), depthTest })
    );
    m.position.set(pt[0], pt[1], pt[2]);
    m.renderOrder = order;
    g.add(m);
    return m;
  }
  function drawSk3Entity(g, e, color, width, opts = {}) {
    const dt = opts.depthTest !== false;
    const ord = opts.order || 24;
    if (e.type === 'arc' && e.m) {
      const ai = Model.sketch3dArcInfo(e.a, e.m, e.b);
      const pts = ai ? ai.sample(32) : [e.a, e.b];
      const pos = [];
      for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
      if (pos.length) g.add(Viewer.makeFat(pos, color, width, { depthTest: dt, order: ord, dashed: !!e.con, dashSize: 2, gapSize: 1.5 }));
      return ai;
    }
    if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]) > 1e-6) {
      g.add(Viewer.makeFat([e.a[0], e.a[1], e.a[2], e.b[0], e.b[1], e.b[2]], color, width, { depthTest: dt, order: ord, dashed: !!e.con, dashSize: 2, gapSize: 1.5 }));
    }
    return null;
  }
  function render3dScene() {
    const g = Viewer.groups && Viewer.groups.sketch3d;
    if (!g) return;
    disposeThreeGroup(g);
    if (!App.doc || App.mode !== 'model') { Viewer.requestRender(); return; }
    const V = Model.vars(App.doc).v;
    const rawItems = App.peeking != null ? (App.doc.items || []).slice(0, App.peeking) : null;
    const activeList = rawItems ? rawItems.filter((x) => !x.suppressed) : Model.activeItems(App.doc);
    const th = Viewer.theme;
    const baseCol = th.dark ? '#4dabf7' : '#2a80d0';
    for (const it of activeList) {
      if (it.kind !== 'sketch3d' || it.hidden) continue;
      if (App.iso && App.iso !== it.id) continue;
      if (S3 && S3.editId === it.id) continue;
      const sel = App.sel.includes(it.id);
      const col = sel ? th.accent : baseCol;
      const w = sel ? 3.2 : 2.2;
      const res = Model.sketch3dResolve(it.p && it.p.sketch3d, V);
      const M = Model.worldMatrix(App.doc, it.id);
      const wp = (q) => new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(M).toArray();
      const seenPts = [];
      for (const e of res.ents || []) {
        const we = { ...e, a: wp(e.a), b: wp(e.b), ...(e.m ? { m: wp(e.m) } : {}) };
        drawSk3Entity(g, we, col, w, { depthTest: true, order: 18 });
        seenPts.push(we.a, we.b);
      }
      for (const pt of seenPts) {
        const r = Math.max(0.45, Math.min(1.6, Viewer.pixelSizeAt(new THREE.Vector3(...pt)) * 3.5));
        addSk3Dot(g, pt, r, col, true, 19);
      }
    }
    if (typeof Comp !== 'undefined' && Comp.skeletons) {
      const skList = Comp.skeletons(App.doc);
      const skColBase = th.dark ? '#22d3ee' : '#0b7285';
      for (const sk of skList) {
        if (!sk || sk.hidden || sk.suppressed) continue;
        if (S && S.ctx && S.ctx.mode === 'skeleton' && S.ctx.skeletonId === sk.id) continue;
        const isSel = Comp.selectedSkeleton === sk.id;
        const col = isSel ? th.accent : skColBase;
        const w = isSel ? 3.0 : 2.2;
        const pl = sk.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
        const o = new THREE.Vector3(...(pl.o || [0, 0, 0]));
        const x = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize();
        const n = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize();
        const y = new THREE.Vector3().crossVectors(n, x);
        const to3 = (uv) => [
          o.x + x.x * uv[0] + y.x * uv[1],
          o.y + x.y * uv[0] + y.y * uv[1],
          o.z + x.z * uv[0] + y.z * uv[1],
        ];
        const solved = typeof Solver !== 'undefined' && Solver.cached
          ? Solver.cached({ ents: sk.ents || [], dims: sk.dims || [], cons: sk.cons || [] }, V).ents
          : (sk.ents || []);
        for (const e of solved || []) {
          if (!e) continue;
          if (e.type === 'point' && e.a) {
            const p3 = to3(e.a);
            const r = Math.max(0.45, Math.min(1.6, Viewer.pixelSizeAt(new THREE.Vector3(...p3)) * 3.5));
            addSk3Dot(g, p3, r, col, true, 19);
            continue;
          }
          for (const pts of entPts(e)) {
            if (!pts || pts.length < 2) continue;
            const flat = [];
            for (const q of pts) {
              const p3 = to3(q);
              flat.push(p3[0], p3[1], p3[2]);
            }
            g.add(Viewer.makeFat(flat, col, w, { depthTest: true, order: 18, dashed: !!e.con, dashSize: 2.5, gapSize: 1.8 }));
          }
        }
      }
    }
    Viewer.requestRender();
  }
  function push3dUndo() {
    if (!S3) return;
    S3.undo.push({ ents: deepClone(S3.ents), dims: deepClone(S3.dims) });
    if (S3.undo.length > 80) S3.undo.shift();
  }
  function undo3d() {
    if (!S3 || !S3.undo.length) return false;
    const prev = S3.undo.pop();
    S3.ents = prev.ents;
    S3.dims = prev.dims;
    S3.draft = null;
    if (S3.sel && !S3.ents.some((e) => e.id === S3.sel)) S3.sel = null;
    hideDimBox();
    render3d();
    Panels.renderRight();
    return true;
  }
  function snap3dAt(cx, cy) {
    const r = Viewer.canvas.getBoundingClientRect();
    const V = Model.vars(App.doc).v;
    const res = S3 ? Model.sketch3dResolve({ ents: S3.ents, dims: S3.dims }, V) : { ents: [] };
    // 1. Punkte der aktuellen 3D-Skizze
    let bestSk = null;
    const testSkPt = (pt) => {
      if (!pt) return;
      const v = new THREE.Vector3(pt[0], pt[1], pt[2]);
      const sc = Viewer.toScreen(v);
      const d = Math.hypot(sc.x + r.left - cx, sc.y + r.top - cy);
      if (d < 14 && (!bestSk || d < bestSk.d)) bestSk = { p: pt.slice(), d };
    };
    for (const e of res.ents) { testSkPt(e.a); testSkPt(e.b); if (e.m) testSkPt(e.m); }
    if (S3 && S3.draft) for (const q of S3.draft.pts) testSkPt(q.map((v) => Model.num(v, V, 0)));
    if (bestSk) return { p: bestSk.p.map((v) => round(v, 4)), kind: 'point', label: T('sk3.snapPoint'), bind: null };

    // 2. Körperecken und Kantenmitten an allen sichtbaren Körpern
    const nodes = Viewer.nodes;
    let bestBody = null;
    const camPos = Viewer.camera.position;
    if (nodes && nodes.values) {
      for (const n of nodes.values()) {
        if (!n || !n.obj || !n.obj.visible || n.allBodiesHidden || n.ctxDim || n.role === 'hole') continue;
        const eds = (n.data && n.data.edges) || [];
        const inv = n.obj.matrixWorld.clone().invert();
        const tryNodePt = (raw, isMid) => {
          if (!raw) return;
          const w = new THREE.Vector3(raw[0], raw[1], raw[2]).applyMatrix4(n.obj.matrixWorld);
          const sc = Viewer.toScreen(w);
          const d = Math.hypot(sc.x + r.left - cx, sc.y + r.top - cy);
          const score = d + (isMid ? 2.5 : 0);
          if (d < 14) {
            const camD = camPos.distanceTo(w);
            if (!bestBody || score < bestBody.score - 1 || (Math.abs(score - bestBody.score) <= 1 && camD < bestBody.camD)) {
              const lp = w.clone().applyMatrix4(inv).toArray().map((v) => round(v, 4));
              bestBody = { p: w.toArray().map((v) => round(v, 4)), score, camD, isMid, bind: { id: n.id, lp } };
            }
          }
        };
        for (const g of eds) {
          tryNodePt(g.a, false);
          tryNodePt(g.b, false);
          tryNodePt(g.m, true);
        }
      }
    }
    if (bestBody) {
      return {
        p: bestBody.p,
        kind: bestBody.isMid ? 'mid' : 'corner',
        label: T(bestBody.isMid ? 'sk3.snapMid' : 'sk3.snapCorner'),
        bind: bestBody.bind,
      };
    }

    // 3. Ursprung (0, 0, 0)
    const sc0 = Viewer.toScreen(new THREE.Vector3(0, 0, 0));
    if (Math.hypot(sc0.x + r.left - cx, sc0.y + r.top - cy) < 14) {
      return { p: [0, 0, 0], kind: 'origin', label: T('sk3.snapOrigin'), bind: null };
    }

    // 4. Fallback: waagerechte Ebene auf Z-Höhe des letzten Punkts (oder 0)
    let zRef = 0;
    if (S3 && S3.draft && S3.draft.pts.length) {
      const lp = S3.draft.pts[S3.draft.pts.length - 1];
      zRef = Model.num(lp[2], V, 0);
    } else if (res.ents.length) {
      zRef = res.ents[res.ents.length - 1].b[2];
    }
    const wp = Viewer.pickPlane(cx, cy, zRef);
    if (!wp) return null;
    const step = 0.5;
    return {
      p: [round(Math.round(wp.x / step) * step, 3), round(Math.round(wp.y / step) * step, 3), round(zRef, 3)],
      kind: 'plane',
      label: '',
      bind: null,
    };
  }
  function parse3dVal(raw, V) {
    if (typeof raw === 'number' && isFinite(raw)) return round(raw, 4);
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const normS = s.replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(normS)) {
      const n = parseFloat(normS);
      return isFinite(n) ? round(n, 4) : null;
    }
    const v = Model.num(s, V, NaN);
    return isFinite(v) ? s : null;
  }
  function add3dPoint(pt, bind = null) {
    if (!S3 || !Array.isArray(pt) || pt.length !== 3) return false;
    const V = Model.vars(App.doc).v;
    const cp = pt.map((v) => { const p = parse3dVal(v, V); return p == null ? 0 : p; });
    const np = cp.map((v) => Model.num(v, V, 0));
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (S3.tool === 'arc') {
      if (!S3.draft || S3.draft.kind !== 'arc') {
        S3.draft = { kind: 'arc', pts: [cp], binds: [bind] };
      } else if (S3.draft.pts.length === 1) {
        const p0 = S3.draft.pts[0].map((v) => Model.num(v, V, 0));
        if (d3(p0, np) < 1e-4) return false;
        S3.draft.pts.push(cp);
        S3.draft.binds.push(bind);
      } else {
        const p0 = S3.draft.pts[0].map((v) => Model.num(v, V, 0));
        const p1 = S3.draft.pts[1].map((v) => Model.num(v, V, 0));
        if (d3(p0, np) < 1e-4 || d3(p1, np) < 1e-4) return false;
        push3dUndo();
        const ent = {
          id: uid('e'), type: 'arc',
          a: S3.draft.pts[0], m: S3.draft.pts[1], b: cp,
          con: !!S3.con,
          ...(S3.draft.binds[0] ? { bindA: S3.draft.binds[0] } : {}),
          ...(S3.draft.binds[1] ? { bindM: S3.draft.binds[1] } : {}),
          ...(bind ? { bindB: bind } : {}),
        };
        S3.ents.push(ent);
        S3.sel = ent.id;
        S3.draft = null;
      }
    } else {
      if (S3.tool !== 'line') S3.tool = 'line';
      if (!S3.draft || S3.draft.kind !== 'line') {
        S3.draft = { kind: 'line', pts: [cp], binds: [bind] };
      } else {
        const aRaw = S3.draft.pts[0];
        const aNum = aRaw.map((v) => Model.num(v, V, 0));
        if (d3(aNum, np) < 1e-4) return false;
        push3dUndo();
        const ent = {
          id: uid('e'), type: 'line',
          a: aRaw, b: cp,
          con: !!S3.con,
          ...(S3.draft.binds[0] ? { bindA: S3.draft.binds[0] } : {}),
          ...(bind ? { bindB: bind } : {}),
        };
        S3.ents.push(ent);
        S3.sel = ent.id;
        S3.draft = { kind: 'line', pts: [cp], binds: [bind] };
      }
    }
    UI.hint(hint3dFor(S3.tool));
    showBar3d();
    render3d();
    Panels.renderRight();
    return true;
  }
  function add3dLine(a, b, opts = {}) {
    if (!S3) return null;
    push3dUndo();
    const ent = {
      id: uid('e'), type: 'line', a: a.slice(), b: b.slice(), con: !!opts.con,
      ...(opts.bindA ? { bindA: opts.bindA } : {}),
      ...(opts.bindB ? { bindB: opts.bindB } : {}),
    };
    S3.ents.push(ent);
    S3.sel = ent.id;
    render3d();
    Panels.renderRight();
    return ent.id;
  }
  function add3dArc(a, m, b, opts = {}) {
    if (!S3) return null;
    push3dUndo();
    const ent = {
      id: uid('e'), type: 'arc', a: a.slice(), m: m.slice(), b: b.slice(), con: !!opts.con,
      ...(opts.bindA ? { bindA: opts.bindA } : {}),
      ...(opts.bindM ? { bindM: opts.bindM } : {}),
      ...(opts.bindB ? { bindB: opts.bindB } : {}),
    };
    S3.ents.push(ent);
    S3.sel = ent.id;
    render3d();
    Panels.renderRight();
    return ent.id;
  }
  function end3dChain() {
    if (!S3 || !S3.draft) return false;
    S3.draft = null;
    UI.hint(hint3dFor(S3.tool));
    render3d();
    Panels.renderRight();
    return true;
  }
  function set3dLength(entId, val) {
    if (!S3) return false;
    const entObj = S3.ents.find((x) => x.id === entId);
    if (!entObj) return false;
    const V = Model.vars(App.doc).v;
    push3dUndo();
    const idx = S3.dims.findIndex((d) => d.e === entId && d.k === 'len');
    if (val == null || val === '' || val === 0 || (typeof val === 'number' && val <= 0)) {
      if (idx >= 0) S3.dims.splice(idx, 1);
    } else {
      const parsed = parse3dVal(val, V);
      if (parsed == null || Model.num(parsed, V, 0) <= 0) {
        S3.undo.pop();
        UI.toast(T('sk3.toast.invalidLen'), { icon: 'info', kind: 'bad' });
        return false;
      }
      if (idx >= 0) S3.dims[idx].v = parsed;
      else S3.dims.push({ id: uid('d'), e: entId, k: 'len', v: parsed });
    }
    render3d();
    Panels.renderRight();
    return true;
  }
  function delete3dEnt(entId) {
    if (!S3) return false;
    const i = S3.ents.findIndex((x) => x.id === entId);
    if (i < 0) return false;
    push3dUndo();
    S3.ents.splice(i, 1);
    S3.dims = S3.dims.filter((d) => d.e !== entId);
    if (S3.sel === entId) S3.sel = null;
    render3d();
    Panels.renderRight();
    return true;
  }
  function ask3dDim(entObj, curLen, clientX, clientY) {
    hideDimBox();
    const dm = S3.dims.find((d) => d.e === entObj.id && d.k === 'len');
    const curVal = dm ? dm.v : round(curLen, 3);
    const inp = h('input', { type: 'text', value: Units.fmtInput(curVal, 3) });
    dimBox = h('div', { class: 'dimlabel editing', style: { left: clientX + 'px', top: clientY + 'px', zIndex: '30' } }, inp);
    dimBox._inp = inp;
    dimBox._typed = false;
    dimBox._commit = () => {
      const raw = inp.value.trim();
      hideDimBox();
      if (!raw) return;
      const V = Model.vars(App.doc).v;
      const parsed = parse3dVal(raw, V);
      if (parsed == null) { UI.toast(T('sk3.toast.invalidLen'), { icon: 'info', kind: 'bad' }); return; }
      const val = typeof parsed === 'number' ? Units.toMM(parsed) : parsed;
      set3dLength(entObj.id, val);
    };
    inp.addEventListener('input', () => { dimBox._typed = true; });
    inp.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); dimBox._commit(); Viewer.canvas.focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); hideDimBox(); Viewer.canvas.focus(); }
    });
    inp.addEventListener('blur', () => { setTimeout(() => { if (dimBox && dimBox._inp === inp) hideDimBox(); }, 120); });
    $('#overlay').append(dimBox);
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  }
  function pick3dEntAt(cx, cy) {
    if (!S3) return null;
    const r = Viewer.canvas.getBoundingClientRect();
    const V = Model.vars(App.doc).v;
    const res = Model.sketch3dResolve({ ents: S3.ents, dims: S3.dims }, V);
    const distToSeg2 = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 1e-6 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null;
    for (const e of res.ents) {
      const pts = e.type === 'arc' && e.m ? (Model.sketch3dArcInfo(e.a, e.m, e.b)?.sample(24) || [e.a, e.b]) : [e.a, e.b];
      let minD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const s0 = Viewer.toScreen(new THREE.Vector3(...pts[i]));
        const s1 = Viewer.toScreen(new THREE.Vector3(...pts[i + 1]));
        const d = distToSeg2(cx - r.left, cy - r.top, s0.x, s0.y, s1.x, s1.y);
        if (d < minD) minD = d;
      }
      if (minD < 14 && (!best || minD < best.d)) best = { ent: e, d: minD };
    }
    return best ? best.ent : null;
  }
  function render3d() {
    if (!S3) return;
    const g = Viewer.groups.sketch;
    disposeThreeGroup(g);
    clearSk3Labels();
    const V = Model.vars(App.doc).v;
    const res = Model.sketch3dResolve({ ents: S3.ents, dims: S3.dims }, V);
    const th = Viewer.theme;
    const acc = th.accent;
    const baseCol = th.dark ? '#5aa9ff' : '#1c6fd1';
    const dimMap = new Map(res.dims.filter((d) => d.k === 'len').map((d) => [d.e, d]));
    const ptsAll = [];
    for (const e of res.ents) {
      const isSel = S3.sel === e.id;
      const col = isSel ? acc : baseCol;
      const ai = drawSk3Entity(g, e, col, isSel ? 3.5 : 2.5, { depthTest: false, order: 24 });
      ptsAll.push(e.a, e.b);
      if (e.m) ptsAll.push(e.m);
      const mid3 = ai ? ai.mid3d : [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
      const hasDim = dimMap.has(e.id);
      const txt = (hasDim ? '🔒 ' : '') + Units.fmtLenU(e.length || 0, 2);
      const lbl = h('div', { class: 'dimlabel sk3-dim' + (hasDim ? ' fixed' : '') + (isSel ? ' sel' : ''), dataset: { entId: e.id } }, txt);
      lbl._pos3 = new THREE.Vector3(mid3[0], mid3[1], mid3[2]);
      lbl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      lbl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        S3.sel = e.id;
        render3d();
        Panels.renderRight();
        const rect = lbl.getBoundingClientRect();
        ask3dDim(e, e.length || 0, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
      $('#overlay').append(lbl);
      sk3Labels.push(lbl);
    }
    for (const pt of ptsAll) {
      const r = Math.max(0.5, Math.min(1.8, Viewer.pixelSizeAt(new THREE.Vector3(...pt)) * 4));
      addSk3Dot(g, pt, r, acc, false, 26);
    }
    if (S3.draft && S3.draft.pts.length) {
      const dPts = S3.draft.pts.map((q) => q.map((v) => Model.num(v, V, 0)));
      for (const pt of dPts) {
        const r = Math.max(0.6, Math.min(2, Viewer.pixelSizeAt(new THREE.Vector3(...pt)) * 4.5));
        addSk3Dot(g, pt, r, '#e0457b', false, 27);
      }
      const cur = S3.hoverSnap ? S3.hoverSnap.p : null;
      if (cur) {
        if (S3.draft.kind === 'arc') {
          if (dPts.length === 1) {
            drawSk3Entity(g, { type: 'line', a: dPts[0], b: cur, con: true }, acc, 1.8, { depthTest: false, order: 25 });
          } else if (dPts.length === 2) {
            drawSk3Entity(g, { type: 'arc', a: dPts[0], m: dPts[1], b: cur, con: false }, acc, 2.4, { depthTest: false, order: 25 });
            const ai = Model.sketch3dArcInfo(dPts[0], dPts[1], cur);
            const len = ai ? ai.length : Math.hypot(cur[0] - dPts[0][0], cur[1] - dPts[0][1], cur[2] - dPts[0][2]);
            const live = h('div', { class: 'dimlabel live' }, Units.fmtLenU(len, 2));
            live._pos3 = new THREE.Vector3(...cur);
            $('#overlay').append(live);
            sk3Labels.push(live);
          }
        } else {
          const p0 = dPts[dPts.length - 1];
          drawSk3Entity(g, { type: 'line', a: p0, b: cur, con: !!S3.con }, acc, 2.4, { depthTest: false, order: 25 });
          const len = Math.hypot(cur[0] - p0[0], cur[1] - p0[1], cur[2] - p0[2]);
          const live = h('div', { class: 'dimlabel live' }, Units.fmtLenU(len, 2));
          live._pos3 = new THREE.Vector3((p0[0] + cur[0]) / 2, (p0[1] + cur[1]) / 2, (p0[2] + cur[2]) / 2);
          $('#overlay').append(live);
          sk3Labels.push(live);
        }
      }
    }
    if (S3.hoverSnap) {
      const hs = S3.hoverSnap;
      const r = Math.max(0.65, Math.min(2.2, Viewer.pixelSizeAt(new THREE.Vector3(...hs.p)) * 5.2));
      const snapCol = hs.kind === 'corner' || hs.kind === 'mid' ? '#e8833a' : hs.kind === 'point' || hs.kind === 'origin' ? '#0ca678' : acc;
      addSk3Dot(g, hs.p, r, snapCol, false, 28);
      if (hs.label) {
        const tag = h('div', { class: 'snaptip' }, `${hs.label} (${hs.p.map((v) => Units.fmtLen(v, 1)).join(', ')})`);
        tag._pos3 = new THREE.Vector3(...hs.p);
        tag.style.transform = 'translate(10px,-18px)';
        $('#overlay').append(tag);
        sk3Labels.push(tag);
      }
    }
    place3dLabels();
    Viewer.requestRender();
  }
  function showBar3d() {
    hideBar();
    if (!S3) return;
    bar = h('div', { class: 'sketchbar', id: 'sk3-bar', role: 'toolbar', 'aria-label': T('kind.sketch3d') });
    bar.append(h('span', { class: 'title' }, T('kind.sketch3d')));
    const vsep = () => h('span', { class: 'vsep', style: { width: '1px', alignSelf: 'stretch', background: 'var(--line)', margin: '4px 4px' } });
    for (const t of sk3Tools()) {
      if (t.sep) bar.append(vsep());
      const b = h('button', { type: 'button', class: 'tool' + (S3.tool === t.id ? ' active' : ''), 'data-tip': t.tip, 'data-kbd': t.key || null, 'aria-label': t.label, dataset: { tool3d: t.id } });
      b.innerHTML = icon(t.icon) + `<span>${esc(t.label)}</span>`;
      b.onclick = () => set3dTool(t.id);
      bar.append(b);
    }
    const cb = h('button', { type: 'button', class: 'tool conmode' + (S3.con ? ' active' : ''), id: 'sk3-con', 'aria-pressed': S3.con ? 'true' : 'false', 'data-tip': T('sk.bar.conTip'), 'data-kbd': 'X', 'aria-label': T('sk.bar.con') });
    cb.innerHTML = icon('construct') + `<span>${esc(T('sk.bar.con'))}</span>`;
    cb.onclick = () => { if (!S3) return; S3.con = !S3.con; showBar3d(); };
    bar.append(vsep(), cb, vsep());
    const un = h('button', { type: 'button', class: 'tool', id: 'sk3-undo', 'data-tip': T('topbar.undo'), 'data-kbd': 'Strg Z', 'aria-label': T('topbar.undo') });
    un.innerHTML = icon('undo');
    un.onclick = () => undo3d();
    const cn = h('button', { type: 'button', class: 'tool', id: 'sk3-cancel', 'data-tip': T('sk.bar.cancelTip'), 'aria-label': T('common.cancel') });
    cn.innerHTML = icon('close');
    cn.onclick = () => cancel3d();
    const ok = h('button', { type: 'button', class: 'tool primary', id: 'sk3-done', 'data-tip': T('sk3.doneTip'), 'data-kbd': 'Enter' });
    ok.innerHTML = icon('check') + `<span>${esc(T('common.done'))}</span>`;
    ok.onclick = () => finish3d();
    bar.append(un, cn, ok);
    bars = h('div', { class: 'skbars' });
    bars.append(bar);
    $('#overlay').append(bars);
  }
  function set3dTool(id) {
    if (!S3) return;
    S3.tool = id;
    S3.draft = null;
    hideDimBox();
    showBar3d();
    UI.hint(hint3dFor(id));
    render3d();
    Panels.renderRight();
  }
  function renderPanel3d(body) {
    if (!S3) return;
    const V = Model.vars(App.doc).v;
    const res = Model.sketch3dResolve({ ents: S3.ents, dims: S3.dims }, V);
    const w = h('div', { class: 'props' });
    // Punkt-Eingabe (X, Y, Z)
    const ptSec = h('div', { class: 'section', id: 'sk3-pt-sec' }, h('div', { class: 'section-h' }, T('sk3.pointInput')));
    const ptRow = h('div', { class: 'fields three' });
    const defPt = S3.draft && S3.draft.pts.length
      ? S3.draft.pts[S3.draft.pts.length - 1].map((v) => Model.num(v, V, 0))
      : res.ents.length ? res.ents[res.ents.length - 1].b : [0, 0, 0];
    const inps = {};
    for (const [k, ax] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
      const f = UI.numField({ id: 'sk3-in-' + ax, label: ax.toUpperCase(), value: round(defPt[k], 3), onCommit: () => {} });
      inps[ax] = f.querySelector('input');
      ptRow.append(f);
    }
    const commitPtInput = () => {
      const coords = ['x', 'y', 'z'].map((ax) => parse3dVal(inps[ax].value, Model.vars(App.doc).v));
      if (coords.some((v) => v == null)) { UI.toast(T('sk3.toast.invalidCoord'), { icon: 'info', kind: 'bad' }); return; }
      add3dPoint(coords, null);
    };
    for (const ax of ['x', 'y', 'z']) {
      inps[ax].addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commitPtInput(); }
      });
    }
    const ptBtns = h('div', { class: 'btn-row', style: { marginTop: '6px' } });
    const addBtn = h('button', { type: 'button', class: 'btn primary', id: 'sk3-pt-add' });
    addBtn.innerHTML = icon('plus') + esc(T('sk3.addPoint'));
    addBtn.onclick = commitPtInput;
    ptBtns.append(addBtn);
    if (S3.draft && S3.draft.pts.length) {
      const endBtn = h('button', { type: 'button', class: 'btn', id: 'sk3-chain-end' });
      endBtn.innerHTML = icon('check') + esc(T('sk3.endChain'));
      endBtn.onclick = () => end3dChain();
      ptBtns.append(endBtn);
    }
    ptSec.append(ptRow, ptBtns);
    if (S3.draft && S3.draft.pts.length) {
      const pTxt = S3.draft.pts.map((q) => `(${q.map((v) => Units.fmtLen(Model.num(v, V, 0), 1)).join(', ')})`).join(' → ');
      ptSec.append(h('div', { class: 'hint-box', id: 'sk3-draft-info' }, T('sk3.draftInfo', { pts: pTxt })));
    }
    w.append(ptSec);

    // Elemente & Längenmaße
    const elSec = h('div', { class: 'section', id: 'sk3-ents-sec' }, h('div', { class: 'section-h' }, T('sk3.elementsTitle')));
    elSec.append(h('div', { class: 'mini-row', id: 'sk3-total-len' },
      h('span', { class: 'grow' }, T('sk3.totalLen')),
      h('b', { class: 'mono' }, Units.fmtLenU(res.totalLength, 2))));
    const list = h('div', { id: 'sk3-ents-list', style: { display: 'grid', gap: '6px', marginTop: '6px' } });
    if (!res.ents.length) {
      list.append(h('div', { class: 'hint-box' }, T('sk3.emptyHint')));
    } else {
      const rawMap = new Map(S3.ents.map((x) => [x.id, x]));
      const dimMap = new Map(S3.dims.filter((d) => d.k === 'len').map((d) => [d.e, d]));
      res.ents.forEach((e, i) => {
        const rawE = rawMap.get(e.id) || e;
        const dm = dimMap.get(e.id);
        const card = h('div', { class: 'sk3-ent-card' + (S3.sel === e.id ? ' sel' : ''), dataset: { entId: e.id } });
        const head = h('div', { class: 'sk3-ent-head' });
        const title = h('span', { class: 'grow' }, `${i + 1}. ${e.type === 'arc' ? T('sk3.arc') : T('sk3.line')}${e.con ? ' (' + T('sk3.conShort') + ')' : ''}`);
        title.style.cursor = 'pointer';
        title.onclick = () => { S3.sel = e.id; render3d(); Panels.renderRight(); };
        const lenTag = h('span', { class: 'mono sk3-len', id: `sk3-len-val-${i}` }, Units.fmtLenU(e.length || 0, 2));
        const del = h('button', { type: 'button', class: 'btn ghost small', id: `sk3-del-${i}`, 'aria-label': T('common.delete') });
        del.innerHTML = icon('trash');
        del.onclick = () => delete3dEnt(e.id);
        head.append(title, lenTag, del);
        const fmtP = (q) => `(${q.map((v) => Units.fmtLen(v, 1)).join(', ')})`;
        const coordsTxt = e.type === 'arc' && e.m
          ? `${fmtP(e.a)} → ${fmtP(e.m)} → ${fmtP(e.b)}`
          : `${fmtP(e.a)} → ${fmtP(e.b)}`;
        const sub = h('div', { class: 'muted mono', style: { fontSize: '11.5px' } }, coordsTxt);
        const lf = UI.numField({
          id: `sk3-len-${i}`,
          label: dm ? T('sk3.lenFixed') : T('sk3.lenOpt'),
          value: dm ? dm.v : '',
          min: 0,
          onCommit: (v) => set3dLength(rawE.id, v),
        });
        card.append(head, sub, lf);
        list.append(card);
      });
    }
    elSec.append(list);
    w.append(elSec);
    w.append(h('div', { class: 'hint-box', html: T('sk3.panelHint') }));
    body.append(w);
  }
  function onClick3d(e) {
    if (!S3) return;
    if (S3.tool === 'select') {
      const hit = pick3dEntAt(e.clientX, e.clientY);
      S3.sel = hit ? hit.id : null;
      render3d();
      Panels.renderRight();
      return;
    }
    if (S3.tool === 'dim') {
      const hit = pick3dEntAt(e.clientX, e.clientY);
      if (!hit) { UI.toast(T('sk3.toast.pickEntForDim'), { icon: 'info', ms: 1600 }); return; }
      S3.sel = hit.id;
      render3d();
      Panels.renderRight();
      ask3dDim(hit, hit.length || 0, e.clientX, e.clientY);
      return;
    }
    const sn = snap3dAt(e.clientX, e.clientY);
    if (sn) add3dPoint(sn.p, sn.bind);
  }
  function onMove3d(e) {
    if (!S3) return;
    if (S3.tool === 'line' || S3.tool === 'arc') {
      const sn = snap3dAt(e.clientX, e.clientY);
      const prev = S3.hoverSnap;
      const same = (!sn && !prev) || (sn && prev && sn.kind === prev.kind && [0, 1, 2].every((k) => Math.abs(sn.p[k] - prev.p[k]) < 1e-4));
      if (!same) {
        S3.hoverSnap = sn;
        render3d();
      }
    } else if (S3.hoverSnap) {
      S3.hoverSnap = null;
      render3d();
    }
  }
  function onKey3d(e) {
    if (!S3) return false;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (dimBox && dimBox._inp && document.body.contains(dimBox)) {
      if (e.key === 'Enter') { e.preventDefault(); dimBox._commit(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); hideDimBox(); Viewer.canvas.focus(); return true; }
      return false;
    }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo3d(); return true; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (S3.draft) end3dChain();
      else cancel3d();
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (S3.draft) end3dChain();
      else finish3d();
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S3.sel) {
      e.preventDefault();
      delete3dEnt(S3.sel);
      return true;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (k === 'v') { set3dTool('select'); return true; }
      if (k === 'l') { set3dTool('line'); return true; }
      if (k === 'a') { set3dTool('arc'); return true; }
      if (k === 'd') { set3dTool('dim'); return true; }
      if (k === 'x') { S3.con = !S3.con; showBar3d(); return true; }
    }
    return false;
  }
  function finish3dSession() {
    if (!S3) return;
    disposeThreeGroup(Viewer.groups.sketch);
    clearSk3Labels();
    hideBar();
    hideDimBox();
    Viewer.canvas.style.cursor = '';
    S3 = null;
    document.body.classList.remove('sketching');
    Viewer.useButtons('model');
    UI.hint(null);
    App.emit('mode');
    render3dScene();
    Panels.renderRight();
    Handles.rebuild();
  }
  function cancel3d(silent) {
    if (!S3) return;
    finish3dSession();
    if (!silent) UI.toast(T('sk3.toast.cancelled'), { icon: 'close', ms: 1800 });
  }
  function finish3d() {
    if (!S3) return null;
    S3.draft = null;
    if (!S3.ents.length) {
      UI.toast(T('sk3.toast.empty'), { icon: 'info' });
      return null;
    }
    const payload = { ents: deepClone(S3.ents), dims: deepClone(S3.dims) };
    const editId = S3.editId;
    let outId = editId;
    App.change(editId ? '3D-Skizze geändert' : '3D-Skizze angelegt', (doc) => {
      if (editId) {
        const f = Model.find(doc, editId);
        if (!f) return false;
        f.item.p.sketch3d = payload;
      } else {
        const it = Model.newItem('sketch3d', { sketch3d: payload });
        const at = doc.rollback != null ? clamp(doc.rollback, 0, doc.items.length) : doc.items.length;
        doc.items.splice(at, 0, it);
        if (doc.rollback != null) doc.rollback = at + 1;
        outId = it.id;
      }
    });
    finish3dSession();
    if (outId) App.select([outId]);
    UI.toast(T('sk3.toast.done'), { icon: 'check' });
    return outId;
  }
  function start3d(opts = {}) {
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.simple) {
      UI.toast(T('sk3.toast.proOnly'), { icon: 'info' });
      return false;
    }
    stopPlanePick();
    if (S) cancel(true);
    if (S3) finish3dSession();
    if (typeof Features !== 'undefined' && Features.stopRoute) Features.stopRoute();
    if (App.mode !== 'model' && typeof Commands !== 'undefined' && Commands.setMode) Commands.setMode('model');
    let ents = [], dims = [];
    if (opts.editId) {
      const f = Model.find(App.doc, opts.editId);
      if (!f || f.item.kind !== 'sketch3d') return false;
      const sk = (f.item.p && f.item.p.sketch3d) || {};
      ents = deepClone(sk.ents || []);
      dims = deepClone(sk.dims || []);
    }
    S3 = {
      editId: opts.editId || null,
      ents,
      dims,
      tool: 'line',
      sel: null,
      con: false,
      draft: null,
      hoverSnap: null,
      undo: [],
      downAt: null,
      rDownAt: null,
    };
    document.body.classList.add('sketching');
    Viewer.useButtons('model');
    Viewer.canvas.style.cursor = 'crosshair';
    showBar3d();
    UI.hint(hint3dFor(S3.tool));
    App.emit('mode');
    render3dScene();
    render3d();
    Panels.renderRight();
    return true;
  }
  function edit3d(id) {
    if (typeof Assembly !== 'undefined' && Assembly.isLightweightItem) {
      const top = Model.topOf(App.doc, id);
      if (top && Assembly.isLightweightItem(top.id)) Assembly.resolveLightweight(top.id, { silent: true });
    }
    return start3d({ editId: id });
  }
  // ---------- Beenden ----------
  function cancel(silent) {
    if (S3) { cancel3d(silent); return; }
    if (!S) return;
    if (S.blocks0 && App.doc) App.doc.blocks = deepClone(S.blocks0);
    App.extra = []; App.rebuild();
    finishSession();
    if (!silent) UI.toast(T('sk.toast.cancelled'), { icon: 'close', ms: 1800 });
  }
  function finishSession() {
    if (!S) return;
    donePending = false;
    stopWiggle(true); stopFreePulse();
    loftPreviewDebounced.cancel(); lpKey = ''; lpPending = '';
    const cam = S.cam, hid = S.hiddenEdit;
    clearGroup(); clearBand(); hideBar(); hideRulers(); hideEntry(); hideDimBox();
    Viewer.highlightFace('sel', null, null);
    Viewer.highlightFace('hover', null, null);
    Viewer.canvas.style.cursor = '';
    if (stepBox) { stepBox.remove(); stepBox = null; }
    Viewer.canvas.style.cursor = '';
    S = null; lastMouse = null; placeArrow();
    if (hid) Viewer.updateNode(hid, { visible: true });
    Viewer.useButtons('model');
    document.body.classList.remove('sketching');
    Viewer.restoreCamera(cam);
    UI.hint(null); App.emit('mode'); Panels.renderRight(); Handles.rebuild();
  }
  function init() {
    if (SK.onFont) SK.onFont('loaded', () => {
      if (!S) return;
      reapply(); render();
      const note = $('#tx-font-loading');
      if (note && S.txt && SK.isFontLoaded && SK.isFontLoaded(S.txt.font || 'inter')) note.remove();
      Panels.renderRight({ preserveFocus: true });
    });
    App.on('results', () => { relinkAll(); relinkSketchPlanes(); relinkAsync(); if (S && S.step) updateStepExtInfo(); render3dScene(); });
    App.on('doc', () => render3dScene());
    App.on('selection', () => render3dScene());
    App.on('mode', () => render3dScene());
    App.on('peek', () => render3dScene());
    App.on('ctx', () => render3dScene());
    Viewer.on('camera', () => { if (S3) place3dLabels(); });
    App.on('docLoaded', () => { relinkSigMemo.clear(); lostLinkGroups.clear(); asyncRelinkGen++; asyncRelinkRounds = 0; });
    const cv = Viewer.canvas;
    const skTouches = new Set();
    let skTouchMulti = false;
    const isPalmTouch = (e) => e.pointerType === 'touch' && Viewer.gestures && skTouches.size <= 1 && (penDown || performance.now() - lastPenAt < 450);
    cv.addEventListener('pointerdown', (e) => {
      if (S3) {
        if (e.button === 0) S3.downAt = [e.clientX, e.clientY];
        else if (e.button === 2) S3.rDownAt = [e.clientX, e.clientY];
        return;
      }
      if (e.pointerType === 'pen') {
        penDown = true; lastPenAt = performance.now(); lastPtrType = 'pen';
        if (S && !S.step && e.button === 0) e.stopPropagation();
      } else if (e.pointerType === 'touch') {
        skTouches.add(e.pointerId);
        if (Viewer.gestures && skTouches.size >= 2) {
          skTouchMulti = true;
          clearBand();
          if (S && skTouchDraft && performance.now() - skTouchDraft.t < 220) {
            S.draft = null; skTouchDraft = null; hideEntry(); render();
          }
          if (S && S.drag) {
            if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
            if (!S.dragged && S.undo.length) S.undo.pop();
            S.drag = null; S.dragPins = null;
          }
          return;
        }
        if (isPalmTouch(e)) { e.stopPropagation(); e.preventDefault(); return; }
        if (skTouchMulti) return;
      }
      if (S) { onDown(e); }
    }, true);
    cv.addEventListener('pointermove', (e) => {
      if (S3) { onMove3d(e); return; }
      if (e.pointerType === 'pen') { lastPenAt = performance.now(); lastPtrType = 'pen'; }
      if (isPalmTouch(e)) { e.stopPropagation(); return; }
      if (e.pointerType === 'touch' && (skTouchMulti || skTouches.size >= 2)) return;
      if (S) onMove(e);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'pen') { lastPenAt = performance.now(); lastPtrType = 'pen'; }
      if (e.pointerType === 'touch' && (skTouchMulti || skTouches.size >= 2 || isPalmTouch(e))) return;
      if (S && S.guideDrag) { guideDragMove(e); return; }
      if (S && S.band) bandMove(e);
      else if (S && !S.step && S.tool === 'select' && isLoftLine()) loftPreview();
    });
    window.addEventListener('pointerup', (e) => {
      if (S3) {
        if (e.button === 0 && S3.downAt) {
          const moved = Math.hypot(e.clientX - S3.downAt[0], e.clientY - S3.downAt[1]);
          S3.downAt = null;
          if (moved < 5 && e.target === cv) onClick3d(e);
        }
        return;
      }
      if (e.pointerType === 'pen') { penDown = false; lastPenAt = performance.now(); }
      if (e.pointerType === 'touch') {
        const palm = isPalmTouch(e);
        skTouches.delete(e.pointerId);
        if (skTouchDraft && skTouchDraft.id === e.pointerId) skTouchDraft = null;
        if (skTouchMulti) { if (skTouches.size === 0) skTouchMulti = false; return; }
        if (palm) { e.stopPropagation(); return; }
      }
      if (S && S.guideDrag) { guideDragUp(e); return; }
      if (S) { onUp(e); stepUp(e); }
    });
    cv.addEventListener('contextmenu', (e) => {
      if (!S3) return;
      const moved = S3.rDownAt ? Math.hypot(e.clientX - S3.rDownAt[0], e.clientY - S3.rDownAt[1]) : 0;
      S3.rDownAt = null;
      if (moved < 5 && S3.draft) { e.preventDefault(); e.stopPropagation(); end3dChain(); }
    }, true);
    window.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'pen') { penDown = false; lastPenAt = performance.now(); }
      if (e.pointerType === 'touch') {
        skTouches.delete(e.pointerId);
        if (skTouchDraft && skTouchDraft.id === e.pointerId) skTouchDraft = null;
        if (skTouchMulti) { if (skTouches.size === 0) skTouchMulti = false; return; }
      }
      if (S && S.penStroke && S.penStroke.id === e.pointerId) S.penStroke = null;
      if (S && S.guideDrag) S.guideDrag = null;
      if (S && S.band) clearBand();
    });
    window.addEventListener('resize', () => { if (S && !S.step) updateRulers(); });
    const onModKey = (e) => {
      if (!S || S.step || !lastMouse || (e.key !== 'Shift' && e.key !== 'Alt')) return;
      if (S.tool === 'line' && S.lineMode !== 'tan2' && S.draft && !S.draft.arc) {
        S.cursor = linePoint(lastMouse.uv, e);
        render();
      }
    };
    window.addEventListener('keydown', onModKey);
    window.addEventListener('keyup', onModKey);
  }
  function refreshUI() {
    if (S3) { showBar3d(); UI.hint(hint3dFor(S3.tool)); Panels.renderRight(); return; }
    if (!S) return;
    if (S.step) { renderStep(); return; }
    if (isSimpleMode()) {
      S.liveMir = null; S.liveMirPick = false;
      if (S.tool === 'stretch' || S.tool === 'silhouette' || S.tool === 'intersect' || S.tool === 'conic' || S.tool === 'bridge' || S.tool === 'block') { S.tool = 'select'; S.icPick = null; Viewer.highlightFace('sel', null, null); S.stretch.box = null; S.stretch.sel = null; if (S.bridge) { S.bridge.first = null; S.bridge.hoverEnd = null; } }
    }
    showBar(); showRulers();
    UI.hint(hintFor(S.tool));
    Panels.renderRight();
  }
  return { isLinkLost, rebindLink, rebindSilhouette, rebindFaceIntersect, projectSilhouette, projectFaceIntersect, whenRelinked, linkPointsWorld, copySel, pasteClip, createBlock, insertBlock, updateBlockInst, explodeBlockInst, deleteBlockInst, editBlock, finishBlockEdit, renameBlock, deleteBlockDef, selectBlockInst, setRefDim, setDimSpec, setDimName, getDimTol, setDimTol, setDimMode, setDimCircMode, setSplineMode, setSplineHandle, resetSplineHandle, selectSplineHandle, setLocked, toggleLocked, setRevAxis, stretchBox, applyStretch, setLiveMirror, toggleLiveMirror, get liveMirror() { return S && S.liveMir ? S.liveMir.axis : null; }, check: runCheck, repair: repairCheck, focusCheckIssue, autoDefine: proposeAutoDefine, applyAutoDefine, cancelAutoDefine, toggleFreeSpots, setFreeMode, wiggleFree, focusConflictItem, removeConflictItem, clearConflict, bandSelect, init, refreshUI, chooseAndStart, startOnPlane, startOnPlaneObj, startOnFace, startEmboss, startSplitFace, startPath, startSplitCurve, startPoints, startAsmCut, startSkeleton, editSkeleton, chooseAndStartSkeleton, startLoftPath, start3d, edit3d, finish3d, cancel3d, set3dTool, add3dPoint, end3dChain, add3dLine, add3dArc, set3dLength, delete3dEnt, snap3dAt, render3dScene, editItem, pushPullFace, render, renderPanel, onKey, cancel, scaleAll, insertEnts, insertShape, insertFormulaCurve, insertPointsCSV, openFormulaPanel, openCsvPanel, textToCurves, loadFontFile, setBg, setTool, get angleSnap() { return angleSnapOn; }, setAngleSnap, setShowCurvature, toggleCurvature, setCurvatureScale, setGridMode, togglePolarGrid, setPolarGrid, addGuide, moveGuide, removeGuide, clearGuides, get gridMode() { return S ? S.gridMode : 'rect'; }, get guides() { return S ? S.guides : []; }, lengthSnapStep, get active() { return !!S || !!S3; }, get active3d() { return !!S3; }, get state3d() { return S3; }, get state() { return S; }, get picking() { return !!planePick; }, startPlanePick };
})();

