// ================= Platzieren aus der Leiste (Ziehen & Ablegen) =================
const Place = (() => {
  let st = null; // { spec, preview, onFace, pos }
  let magnetOff = false;
  function specBox(spec) {
    if (spec.kind) return Model.primitiveBox(spec.kind, spec.p ? { ...Model.newItem(spec.kind).p, ...spec.p } : Model.newItem(spec.kind).p) || [-10, -10, 0, 10, 10, 20];
    const d = spec.part; const p = spec.params || libDefaults(d);
    if (d.lib === 'holePattern') return [-17, -17, -(p.depth || 10), 17, 17, 0.2];
    if (d.lib === 'zipTie') return [-5, -2, -(p.depth || 10), 5, 2, 0.2];
    if (d.lib === 'screwHole') {
      const te = typeof threadEntry === 'function' ? threadEntry(p.size) : null;
      const hd = te ? Math.max(threadHoleDia(te, p.fit), p.head === 'countersunk' ? (te.senkung_senk_d_mm || 0) : p.head === 'counterbore' ? (te.senkung_zyl_d_mm || 0) : 0) : 7;
      const r = Math.max(2, hd / 2 + 0.5);
      return [-r, -r, -(p.length || 10), r, r, 0.2];
    }
    if (d.lib === 'nutTrap') return [-3.5, -3.5, -12, 3.5, 3.5, 0.2];
    if (d.lib === 'insert') return [-2, -2, -7.7, 2, 2, 0.2];
    if (d.lib === 'blindHole') { const r = (Number(p.d) || 5) / 2, tip = blindTipHeight(Number(p.d) || 5, p.tipAngle ?? 118); return [-r, -r, -((Number(p.depth) || 10) + tip), r, r, 0.2]; }
    if (d.lib === 'fitHole') { const r = (Number(p.d) || 6) / 2; return [-r, -r, -(Number(p.depth) || 10), r, r, 0.2]; }
    if (d.lib === 'centerHole') { const m = centerHoleMetrics(p.size), r = m.d2 / 2; return [-r, -r, -m.totalDepth, r, r, 0.2]; }
    if (d.lib === 'stdScrew' || d.lib === 'stdNut' || d.lib === 'stdWasher' || d.lib === 'stdPin' || d.lib === 'stdKey' || d.lib === 'stdKeyway' || d.lib === 'stdBearing' || d.lib === 'stdSleeve') {
      return Model.primitiveBox('part', { lib: d.lib, ...p }) || [-10, -10, 0, 10, 10, 10];
    }
    if (d.lib === 'threadHole') return [-3.5, -3.5, -(p.length || 10), 3.5, 3.5, 0.2];
    if (d.lib === 'threadRod') return [-3, -3, 0, 3, 3, p.length || 12];
    if (d.lib === 'slotHole') return [-10, -2.3, -10, 10, 2.3, 0.2];
    if (d.lib === 'snapHook') return [0, -4, 0, 2.8, 4, 12];
    if (d.lib === 'hinge') return [-20, -17.5, 0, 20, 17.5, 5.3];
    if (d.lib === 'gear') return [-16.5, -16.5, 0, 16.5, 16.5, 6];
    return [-10, -10, 0, 10, 10, 10];
  }
  function makePreview(spec) {
    const b = specBox(spec);
    const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    const hole = spec.part ? spec.part.role === 'hole' : false;
    const col = new THREE.Color(hole ? Viewer.theme.hole : Viewer.theme.accent);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
    const obj = new THREE.Group(); obj.add(mesh, edges); obj.matrixAutoUpdate = false; obj.renderOrder = 8;
    Viewer.groups.overlay.add(obj);
    return obj;
  }
  function bindTile(el, spec) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const down = { x: e.clientX, y: e.clientY };
      // Bewegungen am Fenster verfolgen: das Menü schließt sich beim Ziehen
      const move = (ev) => {
        if (!st && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) begin(spec);
        magnetOff = ev.ctrlKey || ev.metaKey;
        if (st) track(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt);
        if (st) { finish(ev.clientX, ev.clientY); return; }
        // einfacher Klick: in die Mitte setzen
        Panels.closeFlyout();
        if (spec.buy) Actions.addBuyPart(spec);
        else if (spec.kind) Actions.addPrimitive(spec.kind);
        else Actions.addPart(spec.part, spec.params || libDefaults(spec.part), { name: spec.name });
        setTimeout(() => { const id = App.sel[0]; const b = id && Actions.worldBox(id); if (b && !Viewer.inView(b)) Viewer.fit(App.doc.items.map((x) => x.id)); }, 400);
      };
      const cancelIt = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelIt); cancel(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelIt);
    });
  }
  // Vorschau in echter Form: das Teil wird einmal im Kern gerechnet (als Zusatz-Element „__dragprev“) und dann nur noch verschoben.
  // Löcher bleiben beim Kasten – sie würden sonst schon beim Ziehen in Körper schneiden.
  const DP = '__dragprev';
  function previewItem(spec) {
    if (spec.buy) return Model.newItem(spec.kind, { ...Model.newItem(spec.kind).p, ...spec.p }, { name: spec.name, color: spec.color });
    if (spec.kind) return Model.newItem(spec.kind, spec.p || {});
    if (spec.part && spec.part.role !== 'hole') return Model.newItem('part', { lib: spec.part.lib, ...(spec.params || libDefaults(spec.part)) }, { role: spec.part.role });
    return null;
  }
  function showReal() {
    if (!st || !st.real) return;
    const has = Viewer.nodes.has(DP);
    for (const c of st.preview.children) c.visible = !has;   // Kasten nur, bis die echte Form da ist
    if (has) Viewer.updateNode(DP, { matrix: st.preview.matrix, visible: st.preview.visible, hover: true });
  }
  function begin(spec) {
    Views.collapse();
    st = { spec, preview: makePreview(spec), onFace: null, pos: null };
    const tmp = previewItem(spec);
    if (tmp) { tmp.id = DP; App.extra = [...App.extra.filter((x) => x.id !== DP), tmp]; App.rebuild(); st.real = true; st.offRes = App.on('results', showReal); }
    Panels.closeFlyout();
    Panels.renderCtx();
    UI.hint('Loslassen, um es abzulegen. Auf einem Körper wird es <b>Teil dieses Körpers</b>.');
    document.body.style.cursor = 'copy';
  }
  function inCanvas(x, y) { const r = Viewer.canvas.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function track(x, y) {
    if (!inCanvas(x, y)) { st.preview.visible = false; showReal(); Viewer.requestRender(); return; }
    st.preview.visible = true;
    const hit = Viewer.pick(x, y, { noEdges: true, solidsOnly: true, exclude: new Set([DP]) });
    if (hit && hit.normal) {
      const top = App.doc.items.find((it) => it.id === hit.id);
      if (top) {
        const sn = magnetOff ? (Snap.clear(), null) : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
        st.onFace = Actions.onFaceTransform(hit.id, (sn ? sn.point : hit.point).toArray(), ((sn && sn.normal) || hit.normal).toArray(), { exact: !!sn });
        const L = Model.localMatrix({ t: st.onFace.t });
        st.preview.matrix.copy(Model.worldMatrix(App.doc, hit.id).multiply(L));
        st.pos = null; Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        showReal(); Viewer.requestRender(); return;
      }
    }
    Viewer.highlightFace('hover', null, null); Snap.clear();
    st.onFace = null;
    const p = Viewer.pickPlane(x, y, 0);
    if (p) {
      const g = App.doc.settings.snap === false ? 0.1 : App.doc.settings.grid || 1;
      st.pos = [round(Math.round(p.x / g) * g, 4), round(Math.round(p.y / g) * g, 4)];
      const hz = st.spec.part && st.spec.part.role === 'hole' ? 10 : 0;
      st.preview.matrix.makeTranslation(st.pos[0], st.pos[1], hz);
    }
    showReal(); Viewer.requestRender();
  }
  function finish(x, y) {
    const s = st; cleanup();
    if (!inCanvas(x, y) || (!s.onFace && !s.pos)) return;
    if (s.spec.buy) { Actions.addBuyPart(s.spec, s.onFace ? { onFace: s.onFace } : { pos: s.pos }); return; }
    if (s.spec.kind) Actions.addPrimitive(s.spec.kind, s.onFace ? { onFace: s.onFace } : { pos: s.pos });
    else Actions.addPart(s.spec.part, s.spec.params || libDefaults(s.spec.part), { ...(s.onFace ? { onFace: s.onFace } : { pos: s.pos }), name: s.spec.name });
    if (s.onFace) UI.toast('Abgelegt – es ist jetzt Teil des Körpers darunter.', { icon: 'check' });
  }
  function cancel() { cleanup(); stopHoles(); }
  function cleanup() {
    if (!st) return;
    if (st.offRes) st.offRes();
    if (st.real) { App.extra = App.extra.filter((x) => x.id !== DP); Viewer.removeNode(DP); App.rebuild(); }
    Viewer.groups.overlay.remove(st.preview); st.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    st = null; Snap.clear(); document.body.style.cursor = ''; UI.hint(null); Viewer.highlightFace('hover', null, null); Viewer.requestRender();
  }
  // ---------- Bohrungs-Assistent: Art, Größe, Tiefe wählen, dann Löcher per Klick setzen ----------
  const HOLE_TYPES = [
    ['through', 'Durchgangsloch für Schraube'],
    ['tap', 'Gewinde schneiden (Kernloch)'],
    ['blind', 'Sackloch (mit 118°-Bohrspitze)'],
    ['fit', 'Passbohrung H7 (ISO 286)'],
    ['center', 'Zentrierbohrung (DIN 332 A)'],
    ['insert', 'Gewindeeinsatz'],
    ['nut', 'Mutternfalle'],
  ];
  let lastHole = { type: 'through', norm: 'metric', size: 'M3', head: 'countersunk', fit: 'medium', depth: 10, thru: true, d: 5, tipAngle: 118, fitD: 6, centerSize: 'A2.5' };
  let hw = null;   // laufender Setz-Modus
  const hwNum = (v, fb) => { const n = Model.num(v, Model.vars(App.doc).v, NaN); return n > 0 ? n : fb; };
  function holeHelpKey(type) { return type === 'blind' ? 'blindHole' : type === 'fit' ? 'fitHole' : type === 'center' ? 'centerHole' : 'holeWizard'; }
  function holePreviewSVG(o) {
    const W = 236, H = 82, cx = 118, y0 = 14, yB = 72;
    const mat = (holePath) => `<path d="M24 ${y0} H212 V${yB} H24 Z" fill="var(--accent)" fill-opacity=".14" stroke="var(--line-strong)" stroke-width="1"/>`
      + `<path d="${holePath}" fill="var(--surface)" stroke="var(--hole)" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<line x1="${cx}" y1="6" x2="${cx}" y2="${yB + 4}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 2.5"/>`;
    if (o.type === 'blind') {
      const d = hwNum(o.d, 5), depth = hwNum(o.depth, 10), ang = Number(o.tipAngle ?? 118);
      const tipH = blindTipHeight(d, ang);
      const scale = Math.min(46 / Math.max(depth + tipH, 1), 36 / Math.max(d / 2, 1));
      const rPx = Math.max(8, Math.min(36, (d / 2) * scale));
      const dPx = Math.max(18, Math.min(44, depth * scale));
      const tPx = ang >= 179.5 ? 0 : Math.max(5, Math.min(18, tipH * scale));
      const y1 = y0 + dPx, y2 = y1 + tPx;
      const lbl = `<text x="${cx + rPx + 6}" y="${y0 + dPx / 2 + 3}" font-size="10" fill="var(--muted)">t ${fmtFixed(depth, 1)}</text>`
        + `<text x="28" y="${y0 + 13}" font-size="10" fill="var(--ink)">Ø ${fmtFixed(d, 2)}</text>`
        + (tPx > 0 ? `<text x="${cx + rPx + 6}" y="${y2}" font-size="10" fill="var(--hole)">${ang}°</text>` : '');
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - rPx} ${y0} V${y1} L${cx} ${y2} L${cx + rPx} ${y1} V${y0} Z`)}${lbl}</svg>`;
    }
    if (o.type === 'fit') {
      const d = hwNum(o.fitD, 6), info = h7Info(d);
      const rPx = Math.max(12, Math.min(30, d * 2.4));
      const tolLbl = info.um != null ? `${info.esText} / 0` : 'H7';
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - rPx} ${y0} V${yB} H${cx + rPx} V${y0} Z`)}`
        + `<text x="28" y="${y0 + 14}" font-size="10.5" font-weight="600" fill="var(--ink)">Ø ${fmtFixed(d, 2)} H7</text>`
        + `<text x="${cx + rPx + 7}" y="${y0 + 30}" font-size="10" fill="var(--hole)">${tolLbl}</text></svg>`;
    }
    if (o.type === 'center') {
      const m = centerHoleMetrics(o.centerSize);
      const sc = Math.min(34 / Math.max(m.d2 / 2, 1), 48 / Math.max(m.totalDepth, 1));
      const r1 = Math.max(7, m.d1 / 2 * sc), r2 = Math.max(r1 + 8, Math.min(38, m.d2 / 2 * sc));
      const y1 = y0 + Math.max(12, m.hCone * sc), y2 = y1 + Math.max(14, m.t1 * sc), y3 = y2 + Math.max(5, m.tipH * sc);
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - r2} ${y0} L${cx - r1} ${y1} V${y2} L${cx} ${y3} L${cx + r1} ${y2} V${y1} L${cx + r2} ${y0} Z`)}`
        + `<text x="28" y="${y0 + 13}" font-size="10" fill="var(--ink)">Ø ${fmtFixed(m.d2, 2)}</text>`
        + `<text x="28" y="${y2}" font-size="10" fill="var(--muted)">Ø ${fmtFixed(m.d1, 2)}</text>`
        + `<text x="${cx + r2 + 6}" y="${y1}" font-size="10" fill="var(--hole)">60°</text></svg>`;
    }
    const te = (o.type === 'through' || o.type === 'tap') ? threadEntry(o.size) : null;
    if (o.type === 'through' && o.head === 'countersunk') {
      const ang = (te && te.senkung_winkel_grad) || 90;
      const dCsk = te && te.senkung_senk_d_mm;
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - 28} ${y0} L${cx - 14} ${y0 + 16} V${yB} H${cx + 14} V${y0 + 16} L${cx + 28} ${y0} Z`)}`
        + `<text x="28" y="${y0 + 14}" font-size="10" fill="var(--ink)">${esc(o.size)} Senk. (${ang}°)</text>`
        + (dCsk ? `<text x="${cx + 32}" y="${y0 + 14}" font-size="10" fill="var(--hole)">Ø ${fmtFixed(dCsk, 1)}</text>` : '') + `</svg>`;
    }
    if (o.type === 'through' && o.head === 'counterbore') {
      const dCb = te && te.senkung_zyl_d_mm, tCb = te && te.senkung_zyl_t_mm;
      const headName = te && te.normId === 'pipe_g' ? 'Flach.' : 'Zyl.';
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - 26} ${y0} V${y0 + 22} H${cx - 14} V${yB} H${cx + 14} V${y0 + 22} H${cx + 26} V${y0} Z`)}`
        + `<text x="28" y="${y0 + 14}" font-size="10" fill="var(--ink)">${esc(o.size)} ${headName}</text>`
        + (dCb ? `<text x="${cx + 30}" y="${y0 + 14}" font-size="10" fill="var(--hole)">Ø ${fmtFixed(dCb, 1)}×${fmtFixed(tCb, 1)}</text>` : '') + `</svg>`;
    }
    if (o.type === 'nut') {
      return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - 26} ${y0} V${y0 + 20} H${cx - 13} V${yB} H${cx + 13} V${y0 + 20} H${cx + 26} V${y0} Z`)}`
        + `<text x="28" y="${y0 + 14}" font-size="10" fill="var(--ink)">Mutter ${esc(o.size)}</text></svg>`;
    }
    const r = o.type === 'insert' ? 18 : 13;
    const endY = o.thru ? yB : yB - 12;
    const dia = te ? threadHoleDia(te, o.type === 'tap' ? 'tap' : o.fit) : null;
    const lbl = o.type === 'tap' ? `${o.size} Kernloch${dia ? ' Ø ' + fmtFixed(dia, 2) : ''}` : o.type === 'insert' ? `${o.size} Einsatz` : `${o.size} Durchg.${dia ? ' Ø ' + fmtFixed(dia, 2) : ''}`;
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${mat(`M${cx - r} ${y0} V${endY} H${cx + r} V${y0} Z`)}`
      + `<text x="28" y="${y0 + 14}" font-size="10" fill="var(--ink)">${esc(lbl)}</text></svg>`;
  }
  function holeInfoHTML(o) {
    if (o.type === 'blind') {
      const d = hwNum(o.d, 5), depth = hwNum(o.depth, 10), ang = Number(o.tipAngle ?? 118);
      const tipH = blindTipHeight(d, ang);
      if (ang >= 179.5) return `<b>Flacher Boden:</b> Tiefe ${Units.fmtLenU(depth, 2)} (wie gefräst).`;
      return `<b>Bohrspitze (${ang}°):</b> +${Units.fmtLenU(tipH, 2)} → Gesamttiefe <b>${Units.fmtLenU(depth + tipH, 2)}</b>.`;
    }
    if (o.type === 'fit') {
      const d = hwNum(o.fitD, 6), info = h7Info(d);
      if (info.um != null) return `<b>Passung Ø ${Units.fmtLenU(d, 2)} H7 (ISO 286):</b> ${info.esText} / 0 mm (${info.rangeText}). Im Modell wird genau das Nennmaß gebohrt – beim Fertigen auf Maß reiben.`;
      return `<b>Passung Ø ${Units.fmtLenU(d, 2)} H7:</b> Im Modell wird genau das Nennmaß gebohrt (ISO 286 H7 gilt bis Ø 500 mm).`;
    }
    if (o.type === 'center') {
      const m = centerHoleMetrics(o.centerSize);
      return `<b>DIN 332 Form A (${o.centerSize}):</b> Führungs-Ø ${Units.fmtLenU(m.d1, 2)} · 60°-Kegel Ø ${Units.fmtLenU(m.d2, 2)} · Gesamttiefe ${Units.fmtLenU(m.totalDepth, 2)}.`;
    }
    if (o.type === 'tap') {
      const te = threadEntry(o.size);
      if (!te) return '';
      const pitchTxt = te.tpi ? `${te.tpi} Gg/1″ (${fmtFixed(te.steigung_mm, 2)} mm)` : `Steigung ${fmtFixed(te.steigung_mm, 2)} mm`;
      const drillTxt = te.bohrer ? ` · Bohrer ${esc(te.bohrer)}` : '';
      return `<b>Kernloch ${esc(te.id)}:</b> Ø <b>${Units.fmtLenU(te.kernloch_mm, 2)}</b> (${pitchTxt}${drillTxt}).<br><span style="color:var(--muted)">Norm: ${esc(te.quelle)}</span>`;
    }
    if (o.type === 'through') {
      const te = threadEntry(o.size);
      if (!te) return '';
      const dia = threadHoleDia(te, o.fit);
      let headTxt = '';
      if (o.head === 'countersunk' && te.senkung_senk_d_mm) headTxt = ` · Senkkopf Ø ${Units.fmtLenU(te.senkung_senk_d_mm, 2)} (${te.senkung_winkel_grad || 90}°)`;
      else if (o.head === 'counterbore' && te.senkung_zyl_d_mm) headTxt = ` · ${te.normId === 'pipe_g' ? 'Flachsenkung' : 'Zylindersenkung'} Ø ${Units.fmtLenU(te.senkung_zyl_d_mm, 2)} × ${Units.fmtLenU(te.senkung_zyl_t_mm, 2)}`;
      return `<b>Durchgang ${esc(te.id)}:</b> Ø <b>${Units.fmtLenU(dia, 2)}</b>${headTxt}.<br><span style="color:var(--muted)">Norm: ${esc(te.quelle)}</span>`;
    }
    return '';
  }
  function holeHere(face, anchor, at) {
    if (face) Snap.prime(face.id, face.idx);   // Flächendaten schon holen, damit das erste Loch einrastet
    const o = { ...lastHole };
    const box = h('div', { class: 'holewiz', style: { display: 'grid', gap: '10px', minWidth: '264px' } });
    const titleEl = h('b', null, at ? `Bohrungen an ${at.pts.length} ${at.pts.length === 1 ? 'Punkt' : 'Punkten'}` : 'Bohrungs-Assistent');
    box.append(titleEl);
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    const prev = h('div', { id: 'hw-preview', class: 'hw-preview' });
    const infoBox = h('div', { id: 'hw-info', class: 'hint-box hw-info' });
    const updatePreview = () => {
      box.dataset.help = holeHelpKey(o.type);
      prev.innerHTML = holePreviewSVG(o);
      const txt = holeInfoHTML(o);
      infoBox.innerHTML = txt;
      infoBox.style.display = txt ? '' : 'none';
    };
    const bindLive = (wrap, apply) => {
      const inp = wrap.querySelector('input');
      if (inp) inp.addEventListener('input', () => { const n = parseNum(inp.value); if (n > 0) { apply(n); updatePreview(); } });
    };
    const draw = () => {
      body.innerHTML = '';
      const tf = UI.selectField({ id: 'hw-type', label: 'Art', value: o.type, options: HOLE_TYPES, onChange: (v) => { o.type = v; draw(); } });
      tf.dataset.help = holeHelpKey(o.type);
      body.append(tf);
      if (o.type === 'blind') {
        const f = h('div', { class: 'fields' });
        const df = UI.numField({ id: 'hw-d', label: 'Durchmesser', value: o.d, min: 0.2, onCommit: (v) => { o.d = v; updatePreview(); } });
        const dp = UI.numField({ id: 'hw-depth', label: 'Tiefe (Zylinder)', value: o.depth, min: 0.2, onCommit: (v) => { o.depth = v; updatePreview(); } });
        bindLive(df, (n) => { o.d = n; });
        bindLive(dp, (n) => { o.depth = n; });
        f.append(df, dp);
        body.append(f);
        body.append(UI.selectField({ id: 'hw-tip', label: 'Bohrspitze', value: String(o.tipAngle ?? 118), options: LIBMAP.blindHole.params[2].options, onChange: (v) => { o.tipAngle = Number(v); updatePreview(); } }));
      } else if (o.type === 'fit') {
        const df = UI.numField({ id: 'hw-d', label: 'Nenn-Ø (H7)', value: o.fitD, min: 0.2, onCommit: (v) => { o.fitD = v; updatePreview(); } });
        bindLive(df, (n) => { o.fitD = n; });
        body.append(df);
        const thru = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hw-thru', checked: !!o.thru }), 'Ganz durch den Körper');
        thru.querySelector('input').onchange = (e) => { o.thru = e.target.checked; draw(); };
        body.append(thru);
        if (!o.thru) {
          const dp = UI.numField({ id: 'hw-depth', label: 'Tiefe', value: o.depth, min: 0.2, onCommit: (v) => { o.depth = v; updatePreview(); } });
          bindLive(dp, (n) => { o.depth = n; });
          body.append(dp);
        }
      } else if (o.type === 'center') {
        body.append(UI.selectField({ id: 'hw-size', label: 'Größe (DIN 332 A)', value: o.centerSize, options: CENTER_SIZES, onChange: (v) => { o.centerSize = v; updatePreview(); } }));
      } else if (o.type === 'through' || o.type === 'tap') {
        if (!THREAD_BY_NORM.has(o.norm)) o.norm = 'metric';
        const sizes = threadSizesForNorm(o.norm);
        if (!sizes.includes(o.size)) o.size = threadDefaultSize(o.norm);
        if (o.norm === 'pipe_g' && o.head === 'countersunk') o.head = 'none';
        const nf = UI.selectField({
          id: 'hw-norm',
          label: 'Gewindenorm',
          value: o.norm,
          options: THREAD_NORM_OPTIONS,
          onChange: (v) => {
            o.norm = v;
            const ns = threadSizesForNorm(v);
            if (!ns.includes(o.size)) o.size = threadDefaultSize(v);
            if (v === 'pipe_g' && o.head === 'countersunk') o.head = 'none';
            draw();
          },
        });
        nf.dataset.help = 'threadStandards';
        body.append(nf);
        body.append(UI.selectField({ id: 'hw-size', label: o.norm === 'pipe_g' ? 'Rohrgewinde' : 'Gewinde', value: o.size, options: sizes, onChange: (v) => { o.size = v; updatePreview(); } }));
        if (o.type === 'through') {
          const f = h('div', { class: 'fields' });
          const headOpts = o.norm === 'pipe_g'
            ? [['none', 'ohne Senkung'], ['counterbore', 'Flachsenkung (DIN 3852-2)']]
            : [['countersunk', o.norm === 'unc' || o.norm === 'unf' ? 'Senkkopf (82°)' : 'Senkkopf (90°)'], ['counterbore', 'Zylinderkopf'], ['none', 'ohne Senkung']];
          f.append(UI.selectField({ id: 'hw-head', label: 'Kopf', value: o.head, options: headOpts, onChange: (v) => { o.head = v; updatePreview(); } }));
          f.append(UI.selectField({ id: 'hw-fit', label: 'Loch', value: o.fit, options: [['medium', 'Mittel'], ['fine', 'Eng'], ['coarse', 'Weit']], onChange: (v) => { o.fit = v; updatePreview(); } }));
          body.append(f);
        }
        const thru = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hw-thru', checked: !!o.thru }), 'Ganz durch den Körper');
        thru.querySelector('input').onchange = (e) => { o.thru = e.target.checked; draw(); };
        body.append(thru);
        if (!o.thru) body.append(UI.numField({ id: 'hw-depth', label: 'Tiefe', value: o.depth, onCommit: (v) => { o.depth = v; } }));
      } else {
        const sizes = o.type === 'insert' ? ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'] : SIZES;
        if (!sizes.includes(o.size)) o.size = 'M3';
        body.append(UI.selectField({ id: 'hw-size', label: o.type === 'nut' ? 'Mutter' : 'Gewinde', value: o.size, options: sizes, onChange: (v) => { o.size = v; updatePreview(); } }));
        const thru = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hw-thru', checked: !!o.thru }), o.type === 'insert' ? 'So tief wie der Körper' : 'Ganz durch den Körper');
        thru.querySelector('input').onchange = (e) => { o.thru = e.target.checked; draw(); };
        body.append(thru);
        if (!o.thru) body.append(UI.numField({ id: 'hw-depth', label: 'Tiefe', value: o.depth, onCommit: (v) => { o.depth = v; } }));
      }
      updatePreview();
      const popEl = box.closest('.pop');
      if (popEl) { const pr = popEl.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) popEl.style.top = Math.max(8, innerHeight - pr.height - 8) + 'px'; }
    };
    draw(); box.append(body, prev, infoBox);
    const go = h('button', { type: 'button', class: 'btn primary', id: 'hw-go' }); go.innerHTML = icon('check') + 'Löcher setzen';
    go.onclick = () => {
      const ae = document.activeElement; if (ae && box.contains(ae) && ae.tagName === 'INPUT') ae.blur();
      UI.closePop(); lastHole = { ...o };
      startHoles(o);
      // aus Skizzenpunkten: alle Löcher genau an den Punkten setzen, dann fertig
      if (at) { for (const p of at.pts) placeAt(at.id, p, at.normal, true); stopHoles(); return; }
      // aus einer gewählten Fläche: das erste Loch gleich dort setzen
      if (face && face.point && face.normal) { const pt = new THREE.Vector3(...face.point), nn = new THREE.Vector3(...face.normal), sn = Snap.onFace(face.id, face.idx, pt, { normal: nn }); Snap.clear(); placeAt(face.id, sn ? sn.point : pt, (sn && sn.normal) || nn, !!sn); }
    };
    box.append(go);
    UI.pop(anchor || $('#t-parts'), box);
  }
  // Dicke des Körpers entlang der Bohrrichtung
  function thicknessAlong(id, n) {
    const b = Actions.worldBox(id); if (!b || b.isEmpty()) return 20;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 8; i++) { const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z); const d = p.dot(n); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    return round(hi - lo + 0.5, 1);
  }
  function specFor(o, thick) {
    const depth = o.thru ? thick : o.depth;
    if (o.type === 'blind') return [LIBMAP.blindHole, { d: o.d, depth: o.depth, tipAngle: Number(o.tipAngle ?? 118) }];
    if (o.type === 'fit') return [LIBMAP.fitHole, { d: o.fitD, depth: o.thru ? thick : o.depth }];
    if (o.type === 'center') return [LIBMAP.centerHole, { size: o.centerSize }];
    if (o.type === 'insert') return [LIBMAP.insert, { size: o.size, depth: o.thru ? thick : depth }];
    if (o.type === 'nut') return [LIBMAP.nutTrap, { size: o.size, depth: null, length: depth }];
    if (o.type === 'tap') return [LIBMAP.screwHole, { size: o.size, head: 'none', fit: 'tap', length: depth }];
    return [LIBMAP.screwHole, { size: o.size, head: o.head, fit: o.fit, length: depth }];
  }
  function placeAt(id, point, normal, exact) {
    if (!hw) return;
    const [def, params] = specFor(hw.o, thicknessAlong(id, normal));
    const onFace = Actions.onFaceTransform(id, point.toArray(), normal.toArray(), { exact });
    Actions.addPart(def, params, { onFace });
    App.clearSelection(); Handles.clear();
    hw.count++; holeBar();
  }
  function holeBar() {
    if (hw.bar) hw.bar.remove();
    const bar = h('div', { class: 'sketchbar holebar', role: 'toolbar', 'aria-label': 'Bohrungen' });
    const name = { through: 'Durchgang', tap: 'Kernloch', blind: 'Sackloch', fit: 'Passung H7', center: 'Zentrierung', insert: 'Einsatz', nut: 'Mutternfalle' }[hw.o.type];
    const sz = hw.o.type === 'blind' ? `Ø ${fmt(hwNum(hw.o.d, 5), 2)}` : hw.o.type === 'fit' ? `Ø ${fmt(hwNum(hw.o.fitD, 6), 2)}` : hw.o.type === 'center' ? hw.o.centerSize : hw.o.size;
    bar.append(h('span', { class: 'title' }, 'Bohrungen'), h('span', { class: 'lbl', style: { padding: '0 8px', fontSize: '13px' } }, `${sz} · ${name} · ${hw.count} gesetzt`));
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-kbd': 'Esc' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = () => stopHoles();
    bar.append(ok); $('#overlay').append(bar); hw.bar = bar;
  }
  function ringObj(o) {
    const grp = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(Viewer.theme.hole), depthTest: false, transparent: true });
    const mkCircle = (radius, z = 0) => {
      const pts = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, z)); }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    };
    const mkLine = (a, b) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), mat);
    const te = (o.type === 'through' || o.type === 'tap') && typeof threadEntry === 'function' ? threadEntry(o.size) : null;
    let r = te
      ? (o.type === 'through' && o.head === 'countersunk' && te.senkung_senk_d_mm ? te.senkung_senk_d_mm / 2
        : o.type === 'through' && o.head === 'counterbore' && te.senkung_zyl_d_mm ? te.senkung_zyl_d_mm / 2
        : threadHoleDia(te, o.type === 'tap' ? 'tap' : o.fit) / 2)
      : (parseFloat(String(o.size).slice(1)) || 3) * (o.type === 'through' && o.head !== 'none' ? 1.1 : 0.6);
    if (o.type === 'blind') {
      r = hwNum(o.d, 5) / 2;
      const dep = hwNum(o.depth, 10), tip = blindTipHeight(r * 2, o.tipAngle ?? 118);
      grp.add(mkCircle(r, 0), mkCircle(r, -dep));
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) grp.add(mkLine([sx * r, sy * r, 0], [sx * r, sy * r, -dep]), mkLine([sx * r, sy * r, -dep], [0, 0, -(dep + tip)]));
    } else if (o.type === 'fit') {
      r = hwNum(o.fitD, 6) / 2;
      const dep = o.thru ? 12 : hwNum(o.depth, 10);
      grp.add(mkCircle(r, 0), mkCircle(r, -dep));
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) grp.add(mkLine([sx * r, sy * r, 0], [sx * r, sy * r, -dep]));
    } else if (o.type === 'center') {
      const m = centerHoleMetrics(o.centerSize), r1 = m.d1 / 2; r = m.d2 / 2;
      grp.add(mkCircle(r, 0), mkCircle(r1, -m.hCone), mkCircle(r1, -(m.hCone + m.t1)));
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) grp.add(mkLine([sx * r, sy * r, 0], [sx * r1, sy * r1, -m.hCone]), mkLine([sx * r1, sy * r1, -m.hCone], [sx * r1, sy * r1, -(m.hCone + m.t1)]), mkLine([sx * r1, sy * r1, -(m.hCone + m.t1)], [0, 0, -m.totalDepth]));
    } else {
      grp.add(mkCircle(r, 0));
    }
    grp.add(mkLine([-r * 1.4, 0, 0], [r * 1.4, 0, 0]), mkLine([0, -r * 1.4, 0], [0, r * 1.4, 0]));
    grp.traverse((c) => { c.renderOrder = 30; });
    grp.matrixAutoUpdate = false; grp.visible = false;
    Viewer.groups.overlay.add(grp); return grp;
  }
  function startHoles(o) {
    Views.collapse();
    stopHoles(true);
    hw = { o, count: 0, ring: ringObj(o), down: null };
    App.clearSelection(); Handles.clear(); Panels.renderCtx();
    Viewer.useButtons('place');
    Viewer.canvas.style.cursor = 'crosshair';
    UI.hint('<b>Löcher setzen:</b> Jeder Klick auf eine Fläche setzt ein Loch. Ansicht drehen: <b>rechte Maustaste</b>. <b>Esc</b> beendet.');
    const cv = Viewer.canvas;
    hw.onDown = (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); hw.down = { x: e.clientX, y: e.clientY }; };
    hw.onUp = (e) => {
      if (!hw || !hw.down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - hw.down.x, e.clientY - hw.down.y) > 5; hw.down = null;
      if (moved) return;
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      if (!hit || !hit.normal) { UI.toast('Klick auf eine Fläche eines Körpers.', { icon: 'info', ms: 1600 }); return; }
      const sn = e.ctrlKey || e.metaKey ? null : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
      placeAt(hit.id, sn ? sn.point : hit.point, (sn && sn.normal) || hit.normal, !!sn);
    };
    hw.onMove = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true, solidsOnly: true });
      if (!hit || !hit.normal) { hw.ring.visible = false; Snap.clear(); Viewer.requestRender(); return; }
      const sn = e.ctrlKey || e.metaKey ? (Snap.clear(), null) : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
      const nn = (sn && sn.normal) || hit.normal, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn);
      hw.ring.matrix.compose((sn ? sn.point : hit.point).clone().addScaledVector(nn, 0.05), q, new THREE.Vector3(1, 1, 1));
      hw.ring.matrixWorldNeedsUpdate = true; hw.ring.visible = true; Viewer.requestRender();
    };
    cv.addEventListener('pointerdown', hw.onDown, true);
    window.addEventListener('pointerup', hw.onUp);
    cv.addEventListener('pointermove', hw.onMove);
    holeBar();
  }
  function stopHoles(silent) {
    if (!hw) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', hw.onDown, true); window.removeEventListener('pointerup', hw.onUp); cv.removeEventListener('pointermove', hw.onMove);
    Viewer.groups.overlay.remove(hw.ring);
    const mats = new Set(); hw.ring.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) mats.add(c.material); });
    for (const m of mats) m.dispose();
    Snap.clear();
    if (hw.bar) hw.bar.remove();
    const n = hw.count; hw = null;
    Viewer.useButtons('model');
    Viewer.canvas.style.cursor = ''; UI.hint(null); Viewer.requestRender(); Handles.rebuild(); Panels.renderCtx();
    if (!silent && n) UI.toast(`${n} ${n === 1 ? 'Loch' : 'Löcher'} gesetzt. Ziehen verschiebt ein Loch auf der Fläche.`, { icon: 'check' });
  }
  // Bohrungen an Punkten einer Skizze auf einer Körperfläche (Punkte in Weltlage, n = Flächennormale nach außen)
  function holesAtPoints(id, pts, n) { holeHere(null, $('#t-parts'), { id, pts, normal: n }); }
  return { bindTile, holeHere, holesAtPoints, holeWizard: (anchor) => holeHere(Actions.selectedFace(), anchor), stopHoles, cancel, get active() { return !!st || !!hw; }, get holes() { return !!hw; } };
})();

