// ================= Zeitleiste: Schritte, Marker, Unterdrücken =================
// Jeder oberste Eintrag im Verlauf ist ein Schritt. Der Marker legt fest, bis wohin gerechnet wird;
// neue Schritte landen am Marker. Unterdrückte Schritte bleiben erhalten, zählen aber nicht mit.
const Timeline = (() => {
  let el, track, info, bStart, bPrev, bNext, bEnd, drag = null, peekT = null, peekK = null;
  function iconFor(it) {
    if (it.kind === 'part') { const d = LIBMAP[(it.p || {}).lib]; return d && d.icon ? d.icon : 'bolt'; }
    return ({ box: 'cube', cylinder: 'circle', tube: 'circle', sphere: 'circle', hemisphere: 'circle', torus: 'circle', cone: 'polygon', pyramid: 'polygon', prism: 'hex', wedge: 'chamfer', extrude: 'extrude', revolve: 'revolve', loft: 'loft', sweep: 'sweep', helix: 'helix', import: 'folder', group: 'group', ref: 'parts', transform: 'moveStep', scale: 'scaleBody', deform: 'deform', thicken: 'thicken', rib: 'rib', vent: 'vent', fins: 'fins', web: 'web', wrap: 'wrap', emboss: 'emboss', splitFace: 'splitFace', dome: 'dome', mirrorStep: 'mirror', deleteBody: 'deleteBody', boss: 'boss', lipGroove: 'lipGroove', undercut: 'undercut', circlipGroove: 'circlipGroove', keyway: 'keyway', splineProfile: 'splineShaft', sketch3d: 'sketch3d' })[it.kind] || 'cube';
  }
  // Zeitleiste des Projekts – oder des Bauteils, das gerade bearbeitet wird
  function owner(doc = App.doc) { const c = App.ctx ? doc.items.find((x) => x.id === App.ctx) : null; return c || doc; }
  const listOf = (o) => (o.items || o.children || []);
  const markerPos = () => { const o = owner(); const n = listOf(o).length; return o.rollback == null ? n : clamp(o.rollback, 0, n); };
  function setMarker(k, label) {
    const n = listOf(owner()).length; k = clamp(Math.round(k), 0, n);
    if (k === markerPos()) return;
    App.change(label || (k >= n ? 'Zeitleiste: ans Ende' : `Zeitleiste: Marker nach Schritt ${k}`), (doc) => { const o = owner(doc); o.rollback = k >= listOf(o).length ? null : k; }, { merge: 'timeline' });
  }
  function toggleSuppress(id) {
    const f = Model.find(App.doc, id); if (!f) return;
    App.change(f.item.suppressed ? `Aktiviert: ${Model.label(f.item)}` : `Unterdrückt: ${Model.label(f.item)}`, (doc) => { const t = Model.find(doc, id).item; t.suppressed = !t.suppressed; });
  }
  function chipTip(it, i, V) {
    const errs = RefFix.hardErrorsFor(it.id);
    const refs = RefFix.issuesOf(it.id);
    const mk = markerPos();
    const st = it.suppressed ? T('tl.suppressed') : i >= mk ? T('tl.afterMarker') : '';
    const cs = (!it.suppressed && i < mk && owner() === App.doc && App.stepCacheStatus) ? App.stepCacheStatus(it.id) : null;
    const cacheTxt = cs ? (cs.cached ? ' · aus Speicher' : cs.rebuilt ? ' · neu gerechnet' : '') : '';
    const ai = it.ai ? ` · ${it.ai.edit ? T('tl.aiEdited') : T('tl.aiCreated')}: „${it.ai.q}“` : '';
    const msg = errs.length ? ' · ' + errs[0].message : refs.length ? ' · ' + refs[0].message : '';
    return `${i + 1}. ${Model.label(it)}${Model.sizeText(it, V) ? ' · ' + Model.sizeText(it, V) : ''}${st}${cacheTxt}${ai}${msg}${it.note ? T('tl.notePrefix') + it.note : ''}`;
  }
  function render() {
    if (!el) return;
    const own = owner(), items = listOf(own), n = items.length, mk = markerPos();
    const V = Model.vars(App.doc).v;
    const selTop = own === App.doc ? new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id)) : new Set(App.sel);
    el.classList.toggle('ctx', own !== App.doc);
    track.innerHTML = '';
    if (!n) track.append(h('span', { class: 'tl-empty' }, own !== App.doc ? T('tl.emptyComp', { name: Model.label(own) }) : T('tl.emptyDoc')));
    const marker = h('div', { class: 'tl-marker', role: 'slider', 'aria-label': T('tl.markerAria'), 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': mk, tabindex: 0, 'data-tip': T('tl.markerTip'), 'data-help': 'rollback' }, h('i'));
    marker.addEventListener('pointerdown', startDrag);
    marker.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); setMarker(mk - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); setMarker(mk + 1); } });
    items.forEach((it, i) => {
      if (i === mk) track.append(marker);
      const hardErrs = RefFix.hardErrorsFor(it.id);
      const hasWarn = !hardErrs.length && RefFix.hasBrokenRef(it.id);
      const cls = hardErrs.length && i < mk && !it.suppressed ? ' err' : hasWarn && i < mk && !it.suppressed ? ' warn' : '';
      const cs = (!it.suppressed && i < mk && own === App.doc && App.stepCacheStatus) ? App.stepCacheStatus(it.id) : null;
      const ds = { idx: i };
      if (cs && cs.fp) ds.fp = cs.fp;
      if (cs && (cs.cached || cs.rebuilt)) ds.cache = cs.cached ? 'hit' : 'rebuilt';
      const c = h('button', { type: 'button', class: 'tl-chip' + (it.role === 'hole' ? ' hole' : '') + (selTop.has(it.id) ? ' sel' : '') + (i >= mk ? ' off' : '') + (it.suppressed ? ' sup' : '') + cls + (it.ai ? ' ai' : '') + (it.note ? ' note' : ''), 'data-tip': chipTip(it, i, V), 'aria-label': chipTip(it, i, V), 'data-help': it.ai ? 'aiSteps' : null, dataset: ds });
      c.innerHTML = icon(iconFor(it)); c.append(h('span', { class: 'bar', style: { background: it.role === 'hole' ? 'transparent' : it.color } }));
      if (it.ai) { const b = h('span', { class: 'ai-badge', 'aria-hidden': 'true' }); b.innerHTML = icon('spark'); c.append(b); }
      c.onclick = (e) => { clearTimeout(peekT); peekK = null; App.peek(null); App.select([it.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); };
      // Maus kurz über einem Schritt halten: Stand nach diesem Schritt ansehen (nur im Projekt, nur vor dem Marker)
      if (own === App.doc && i < mk - 1) c.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || drag) return;
        if (peekK === i + 1) return;
        peekK = i + 1; clearTimeout(peekT); peekT = setTimeout(() => App.peek(i + 1), 450);
      });
      c.ondblclick = (e) => { e.preventDefault(); setMarker(i + 1, `Zeitleiste: bis „${Model.label(it)}“`); };
      c.oncontextmenu = (e) => { e.preventDefault(); menu(c, it, i); };
      track.append(c);
    });
    if (mk >= n && n) track.append(marker);
    const pk = own === App.doc ? App.peeking : null;
    info.classList.toggle('peek', pk != null);
    info.textContent = pk != null ? T('tl.peekInfo', { n: pk }) : n ? (mk >= n ? (n === 1 ? T('tl.oneStep') : T('tl.manySteps', { n })) : `${mk} / ${n}`) : '';
    const le = own === App.doc && App.evalStats && App.evalStats.lastEval;
    if (le) info.dataset.tip = `Letztes Rechnen: ${le.rebuilt.length} neu gerechnet, ${le.cached.length} aus Speicher`;
    else delete info.dataset.tip;
    if (pk != null) track.querySelectorAll('.tl-chip').forEach((c, j) => c.classList.toggle('peekoff', j >= pk));
    bStart.disabled = !n || mk === 0; bPrev.disabled = !n || mk === 0; bNext.disabled = mk >= n; bEnd.disabled = mk >= n;
    // aktiven Bereich sichtbar halten
    const m = track.querySelector('.tl-marker'); if (m && !drag) { const r = m.offsetLeft - track.clientWidth + 60; if (r > track.scrollLeft) track.scrollLeft = r; }
  }
  function menu(anchor, it, i) {
    const box = h('div', { class: 'menu-list', style: { display: 'grid', gap: '2px', minWidth: '200px' } });
    const add = (ic, label, fn) => { const b = h('button', { type: 'button', class: 'btn ghost', style: { justifyContent: 'flex-start' } }); b.innerHTML = icon(ic) + esc(label); b.onclick = () => { UI.closePop(); fn(); }; box.append(b); };
    box.append(h('div', { class: 'section-h' }, `${i + 1}. ${Model.label(it)}`));
    if (it.kind === 'sketch3d') {
      add('edit', T('sk3.editBtn'), () => Sketch.edit3d(it.id));
      add('sweep', T('ctx.alongPath'), () => Features.sweepFromSketch3d(it.id));
    } else {
      add('edit', T('common.edit'), () => App.select([it.id]));
    }
    add('help', T('common.explainStep'), () => Explain.dialog(it.id));
    add('copy', T('common.duplicate'), () => Actions.duplicate([it.id]));
    const topSel = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    if (topSel.length >= 2 && !App.ctx) add('folder', T('menu.tree.toFolder'), () => Actions.createFolder(topSel));
    add('rollback', T('menu.tl.markerAfter'), () => setMarker(i + 1));
    add('rollback', T('menu.tl.markerBefore'), () => setMarker(i));
    add('suppress', it.suppressed ? T('common.unsuppress') : T('common.suppress'), () => toggleSuppress(it.id));
    add('trash', T('common.delete'), () => Actions.remove([it.id]));
    UI.pop(anchor, box, { up: true });
  }
  // Marker ziehen: Lücke zwischen den Schritten unter dem Mauszeiger finden
  function gapAt(x) {
    const chips = [...track.querySelectorAll('.tl-chip')];
    for (let i = 0; i < chips.length; i++) { const r = chips[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return i; }
    return chips.length;
  }
  function startDrag(e) {
    e.preventDefault(); const m = e.currentTarget; try { m.setPointerCapture(e.pointerId); } catch (_) {} m.classList.add('drag');
    drag = { k: markerPos(), ind: null };
    const move = (ev) => {
      const k = gapAt(ev.clientX); if (k === drag.k && drag.ind) return; drag.k = k;
      if (drag.ind) drag.ind.remove();
      drag.ind = h('div', { class: 'tl-drop' });
      const chips = track.querySelectorAll('.tl-chip');
      if (k < chips.length) chips[k].before(drag.ind); else track.append(drag.ind);
    };
    const up = () => { m.removeEventListener('pointermove', move); m.removeEventListener('pointerup', up); m.removeEventListener('pointercancel', up); const k = drag.k; if (drag.ind) drag.ind.remove(); drag = null; m.classList.remove('drag'); setMarker(k); render(); };
    m.addEventListener('pointermove', move); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
  }
  function refreshLabels() {
    if (!el) return;
    el.setAttribute('aria-label', T('tl.aria'));
    const setTip = (b, k) => { if (!b) return; const t = T(k); b.setAttribute('aria-label', t); b.dataset.tip = t; };
    setTip(bStart, 'tl.toStart'); setTip(bPrev, 'tl.stepBack'); setTip(bNext, 'tl.stepForward'); setTip(bEnd, 'tl.toEnd');
  }
  function init() {
    el = h('div', { class: 'timeline', id: 'timeline', role: 'toolbar', 'aria-label': T('tl.aria') });
    const bt = (ic, tip, fn) => { const b = h('button', { type: 'button', 'aria-label': tip, 'data-tip': tip }); b.innerHTML = icon(ic); b.onclick = fn; return b; };
    bStart = bt('chevR', T('tl.toStart'), () => setMarker(0)); bStart.querySelector('svg').style.transform = 'scaleX(-1)';
    bPrev = bt('arrowR', T('tl.stepBack'), () => setMarker(markerPos() - 1)); bPrev.querySelector('svg').style.transform = 'scaleX(-1)';
    bNext = bt('arrowR', T('tl.stepForward'), () => setMarker(markerPos() + 1));
    bEnd = bt('chevR', T('tl.toEnd'), () => setMarker(listOf(owner()).length));
    track = h('div', { class: 'tl-track' }); info = h('div', { class: 'tl-info', 'data-help': 'timeline' });
    el.append(h('div', { class: 'tl-btns' }, bStart, bPrev), track, h('div', { class: 'tl-btns' }, bNext, bEnd), info);
    $('#center').append(el); $('#center').classList.add('has-tl');
    const r = debounce(render, 30);
    const now = () => { r.cancel(); render(); };
    App.on('doc', r); App.on('selection', r); App.on('results', r); App.on('ctx', now); App.on('peek', now);
    App.on('doc', () => { clearTimeout(peekT); peekK = null; });
    track.addEventListener('pointerleave', () => { clearTimeout(peekT); peekK = null; App.peek(null); });
    App.on('mode', () => { el.hidden = App.mode !== 'model'; $('#center').classList.toggle('has-tl', App.mode === 'model'); });
    render();
  }
  return { init, render, refreshLabels, setMarker, toggleSuppress, markerPos };
})();

