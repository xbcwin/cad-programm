// ================= Zeitleiste: Schritte, Marker, Unterdrücken =================
// Jeder oberste Eintrag im Verlauf ist ein Schritt. Der Marker legt fest, bis wohin gerechnet wird;
// neue Schritte landen am Marker. Unterdrückte Schritte bleiben erhalten, zählen aber nicht mit.
const Timeline = (() => {
  let el, track, info, btnL, btnR, bStart, bPrev, bNext, bEnd, drag = null, pendingRender = false, peekT = null, peekK = null, switching = false;
  const isNoHistory = () => !!(App.doc && App.doc.noHistory);
  async function setNoHistory(on, opts = {}) {
    const target = !!on;
    if (switching || target === isNoHistory()) return false;
    if (target && Model.isAssembly(App.doc)) {
      UI.toast(T('tl.noHistoryNoAsm'), { icon: 'info' });
      Panels.renderLeft(); render();
      return false;
    }
    if (!target && !(opts && opts.skipConfirm)) {
      const ok = await new Promise((res) => {
        UI.modal({
          title: T('tl.resumeTitle'),
          body: h('p', { style: { margin: 0, lineHeight: 1.5 } }, T('tl.resumeBody')),
          actions: [
            { id: 'nh-resume-cancel', label: T('common.cancel'), value: false },
            { id: 'nh-resume-ok', label: T('tl.resumeConfirm'), primary: true, value: true },
          ],
          onClose: (v) => res(!!v),
        });
      });
      if (!ok) {
        Panels.renderLeft(); render();
        return false;
      }
    }
    switching = true;
    try {
      const ok = await App.setNoHistory(target);
      if (ok && !(opts && opts.silent)) {
        UI.toast(T(target ? 'tl.noHistoryOnToast' : 'tl.noHistoryOffToast'), { icon: target ? 'info' : 'check', ms: 4000 });
      }
      return ok;
    } finally {
      switching = false;
      render();
    }
  }
  function iconFor(it) {
    if (it.kind === 'part') { const d = LIBMAP[(it.p || {}).lib]; return d && d.icon ? d.icon : 'bolt'; }
    if (it.kind === 'recognizedFeature') {
      const ft = it.p && it.p.featType;
      return ft === 'hole' ? 'holeWizard' : ft === 'fillet' ? 'fillet' : 'recognizeFeatures';
    }
    return ({ box: 'cube', cylinder: 'circle', tube: 'circle', sphere: 'circle', hemisphere: 'circle', torus: 'circle', cone: 'polygon', pyramid: 'polygon', prism: 'hex', wedge: 'chamfer', extrude: 'extrude', revolve: 'revolve', loft: 'loft', sweep: 'sweep', helix: 'helix', frame: 'frame', import: 'folder', group: 'group', ref: 'parts', transform: 'moveStep', scale: 'scaleBody', deform: 'deform', thicken: 'thicken', directFace: 'directFace', rib: 'rib', vent: 'vent', fins: 'fins', fillPattern: 'patternFill', mountPattern: 'mountPattern', portCutout: 'portCutout', magnetPocket: 'magnetPocket', web: 'web', wrap: 'wrap', emboss: 'emboss', splitFace: 'splitFace', dome: 'dome', deleteFace: 'deleteFace', replaceFace: 'replaceFace', moveEdge: 'moveEdge', editHole: 'editHole', editFillet: 'editFillet', simplify: 'simplify', recognizedFeature: 'recognizeFeatures', mirrorStep: 'mirror', deleteBody: 'deleteBody', boss: 'boss', lipGroove: 'lipGroove', undercut: 'undercut', circlipGroove: 'circlipGroove', keyway: 'keyway', splineProfile: 'splineShaft', knurl: 'knurl', gripPattern: 'gripPattern', sketch3d: 'sketch3d', stackHole: 'holeWizard', asmCut: 'boolSubtract' })[it.kind] || 'cube';
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
  function applyChipState(c, it, i, mk, own, V, selTop) {
    const hardErrs = RefFix.hardErrorsFor(it.id);
    const hasWarn = !hardErrs.length && RefFix.hasBrokenRef(it.id);
    const cls = hardErrs.length && i < mk && !it.suppressed ? ' err' : hasWarn && i < mk && !it.suppressed ? ' warn' : '';
    const cs = (!it.suppressed && i < mk && own === App.doc && App.stepCacheStatus) ? App.stepCacheStatus(it.id) : null;
    const tip = chipTip(it, i, V);
    c._it = it;
    c.dataset.idx = i;
    c.dataset.id = it.id;
    c.dataset.kind = it.kind;
    c.dataset.feat = (it.p && it.p.featType) || '';
    c.dataset.lib = (it.p && it.p.lib) || '';
    c.dataset.ai = it.ai ? '1' : '';
    if (cs && cs.fp) c.dataset.fp = cs.fp; else delete c.dataset.fp;
    if (cs && (cs.cached || cs.rebuilt)) c.dataset.cache = cs.cached ? 'hit' : 'rebuilt'; else delete c.dataset.cache;
    c.className = 'tl-chip' + (it.role === 'hole' ? ' hole' : '') + (selTop.has(it.id) ? ' sel' : '') + (i >= mk ? ' off' : '') + (it.suppressed ? ' sup' : '') + cls + (it.ai ? ' ai' : '') + (it.note ? ' note' : '');
    c.setAttribute('data-tip', tip);
    c.setAttribute('aria-label', tip);
    if (it.ai) c.setAttribute('data-help', 'aiSteps'); else c.removeAttribute('data-help');
    const bar = c.querySelector('.bar');
    if (bar) bar.style.background = it.role === 'hole' ? 'transparent' : it.color;
  }
  function canUpdateInPlace(items, mk, ownKey) {
    const n = items.length;
    if (n <= 0 || track.dataset.tlOwn !== ownKey || track.children.length !== n + 1) return false;
    const mkEl = track.children[mk];
    if (!mkEl || !mkEl.classList.contains('tl-marker')) return false;
    for (let i = 0; i < n; i++) {
      const ch = track.children[i < mk ? i : i + 1];
      const it = items[i];
      if (!ch || !ch.classList.contains('tl-chip')) return false;
      if (ch.dataset.id !== it.id || ch.dataset.kind !== it.kind) return false;
      if ((ch.dataset.feat || '') !== ((it.p && it.p.featType) || '')) return false;
      if ((ch.dataset.lib || '') !== ((it.p && it.p.lib) || '')) return false;
      if ((ch.dataset.ai || '') !== (it.ai ? '1' : '')) return false;
    }
    return true;
  }
  function finishRender(own, n, mk) {
    const pk = own === App.doc ? App.peeking : null;
    info.classList.toggle('peek', pk != null);
    info.textContent = pk != null ? T('tl.peekInfo', { n: pk }) : n ? (mk >= n ? (n === 1 ? T('tl.oneStep') : T('tl.manySteps', { n })) : `${mk} / ${n}`) : '';
    const le = own === App.doc && App.evalStats && App.evalStats.lastEval;
    if (le) info.dataset.tip = `Letztes Rechnen: ${le.rebuilt.length} neu gerechnet, ${le.cached.length} aus Speicher`;
    else delete info.dataset.tip;
    track.querySelectorAll('.tl-chip').forEach((c, j) => c.classList.toggle('peekoff', pk != null && j >= pk));
    bStart.disabled = !n || mk === 0; bPrev.disabled = !n || mk === 0; bNext.disabled = mk >= n; bEnd.disabled = mk >= n;
    // aktiven Bereich sichtbar halten
    const m = track.querySelector('.tl-marker'); if (m && !drag) { const r = m.offsetLeft - track.clientWidth + 60; if (r > track.scrollLeft) track.scrollLeft = r; }
  }
  function render() {
    if (!el) return;
    if (drag) { pendingRender = true; return; }
    pendingRender = false;
    const own = owner(), items = listOf(own), n = items.length, mk = markerPos();
    const noHist = isNoHistory() && own === App.doc;
    el.classList.toggle('no-history', noHist);
    if (noHist) {
      el.classList.remove('ctx');
      if (btnL) btnL.hidden = true;
      if (btnR) btnR.hidden = true;
      delete track.dataset.tlOwn;
      track.innerHTML = '';
      const msg = h('span', { class: 'tl-nohist-msg' }, T('tl.noHistoryBar'));
      const btn = h('button', { type: 'button', class: 'btn small pro', id: 'tl-resume-history', 'data-help': 'noHistory' }, T('tl.resumeBtn'));
      btn.onclick = () => setNoHistory(false);
      track.append(msg, btn);
      info.classList.remove('peek');
      info.textContent = '';
      delete info.dataset.tip;
      return;
    }
    if (btnL) btnL.hidden = false;
    if (btnR) btnR.hidden = false;
    const V = Model.vars(App.doc).v;
    const selTop = own === App.doc ? new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id)) : new Set(App.sel);
    el.classList.toggle('ctx', own !== App.doc);
    const ownKey = own === App.doc ? 'doc' : own.id;
    if (canUpdateInPlace(items, mk, ownKey)) {
      const marker = track.children[mk];
      marker.setAttribute('aria-valuemax', n);
      marker.setAttribute('aria-valuenow', mk);
      items.forEach((it, i) => {
        const c = track.children[i < mk ? i : i + 1];
        applyChipState(c, it, i, mk, own, V, selTop);
      });
      finishRender(own, n, mk);
      return;
    }
    track.dataset.tlOwn = ownKey;
    track.innerHTML = '';
    if (!n) track.append(h('span', { class: 'tl-empty' }, own !== App.doc ? T('tl.emptyComp', { name: Model.label(own) }) : T('tl.emptyDoc')));
    const marker = h('div', { class: 'tl-marker', role: 'slider', 'aria-label': T('tl.markerAria'), 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': mk, tabindex: 0, 'data-tip': T('tl.markerTip'), 'data-help': 'rollback' }, h('i'));
    marker.addEventListener('pointerdown', startDrag);
    marker.addEventListener('keydown', (e) => { const curMk = markerPos(); if (e.key === 'ArrowLeft') { e.preventDefault(); setMarker(curMk - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); setMarker(curMk + 1); } });
    items.forEach((it, i) => {
      if (i === mk) track.append(marker);
      const c = h('button', { type: 'button', class: 'tl-chip' });
      c.innerHTML = icon(iconFor(it)); c.append(h('span', { class: 'bar' }));
      if (it.ai) { const b = h('span', { class: 'ai-badge', 'aria-hidden': 'true' }); b.innerHTML = icon('spark'); c.append(b); }
      applyChipState(c, it, i, mk, own, V, selTop);
      c.onclick = (e) => { const cur = c._it || it; clearTimeout(peekT); peekK = null; App.peek(null); App.select([cur.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); };
      // Maus kurz über einem Schritt halten: Stand nach diesem Schritt ansehen (nur im Projekt, nur vor dem Marker)
      c.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || drag || owner() !== App.doc) return;
        const idx = Number(c.dataset.idx);
        if (idx >= markerPos() - 1) return;
        if (peekK === idx + 1) return;
        peekK = idx + 1; clearTimeout(peekT); peekT = setTimeout(() => App.peek(idx + 1), 450);
      });
      c.ondblclick = (e) => { e.preventDefault(); const cur = c._it || it; const idx = Number(c.dataset.idx); setMarker(idx + 1, `Zeitleiste: bis „${Model.label(cur)}“`); };
      c.oncontextmenu = (e) => { e.preventDefault(); const cur = c._it || it; const idx = Number(c.dataset.idx); menu(c, cur, idx); };
      track.append(c);
    });
    if (mk >= n && n) track.append(marker);
    finishRender(own, n, mk);
  }
  function menu(anchor, it, i) {
    const box = h('div', { class: 'menu-list', style: { display: 'grid', gap: '2px', minWidth: '200px' } });
    const add = (ic, label, fn) => { const b = h('button', { type: 'button', class: 'btn ghost', style: { justifyContent: 'flex-start' } }); b.innerHTML = icon(ic) + esc(label); b.onclick = () => { UI.closePop(); fn(); }; box.append(b); };
    box.append(h('div', { class: 'section-h' }, `${i + 1}. ${Model.label(it)}`));
    if (it.kind === 'sketch3d') {
      add('edit', T('sk3.editBtn'), () => Sketch.edit3d(it.id));
      add('sweep', T('ctx.alongPath'), () => Features.sweepFromSketch3d(it.id));
      if (!ViewPrefs.simple) add('frame', T('kind.frame'), () => Features.frameFromSketch3d(it.id));
    } else {
      add('edit', T('common.edit'), () => App.select([it.id]));
    }
    if ((typeof ViewPrefs === 'undefined' || !ViewPrefs.simple) && it.kind === 'import' && it.role !== 'hole' && !(it.p && it.p.fmt === 'stl') && !App.ctx) {
      const rb = h('button', { type: 'button', class: 'btn ghost', id: 'tl-recognize-features', 'data-help': 'recognizeFeatures', style: { justifyContent: 'flex-start' } });
      rb.innerHTML = icon('recognizeFeatures') + esc(T('ctx.recognizeFeatures'));
      rb.onclick = () => { UI.closePop(); Features.recognizeFeatures(it.id); };
      box.append(rb);
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
    e.preventDefault();
    clearTimeout(peekT); peekK = null;
    const m = e.currentTarget; try { m.setPointerCapture(e.pointerId); } catch (_) {} m.classList.add('drag');
    drag = { k: markerPos(), ind: null };
    const move = (ev) => {
      const k = gapAt(ev.clientX); if (k === drag.k && drag.ind) return; drag.k = k;
      if (drag.ind) drag.ind.remove();
      drag.ind = h('div', { class: 'tl-drop' });
      const chips = track.querySelectorAll('.tl-chip');
      if (k < chips.length) chips[k].before(drag.ind); else track.append(drag.ind);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const k = drag.k; if (drag.ind) drag.ind.remove(); drag = null; pendingRender = false; m.classList.remove('drag');
      setMarker(k); render();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
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
    btnL = h('div', { class: 'tl-btns' }, bStart, bPrev);
    btnR = h('div', { class: 'tl-btns' }, bNext, bEnd);
    el.append(btnL, track, btnR, info);
    $('#center').append(el); $('#center').classList.add('has-tl');
    const r = debounce(render, 30);
    const now = () => { r.cancel(); render(); };
    App.on('doc', () => { clearTimeout(peekT); peekK = null; now(); });
    App.on('selection', r); App.on('results', r); App.on('ctx', now); App.on('peek', now);
    track.addEventListener('pointerleave', () => { clearTimeout(peekT); peekK = null; App.peek(null); });
    App.on('mode', () => { el.hidden = App.mode !== 'model'; $('#center').classList.toggle('has-tl', App.mode === 'model'); });
    render();
  }
  return { init, render, refreshLabels, setMarker, toggleSuppress, markerPos, isNoHistory, setNoHistory };
})();

