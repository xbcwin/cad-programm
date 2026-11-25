// ================= Oberfläche: Grundbausteine =================
const UI = (() => {
  // ---------- Meldungen ----------
  // stumm geschaltet (z. B. während der KI-Kollege arbeitet): Meldungen werden gesammelt statt gezeigt
  let muted = null;
  function mute(on) { if (on) { muted = []; return null; } const m = muted || []; muted = null; return m; }
  const TOAST_SLICE = 500;
  function scheduleToast(el, ms) {
    clearTimeout(el._timer);
    el._rem = Math.max(0, ms);
    const tick = () => {
      if (!el.isConnected) return;
      if (busyEl || (typeof App !== 'undefined' && App.busy)) {
        el._waitBusy = true;
        el._timer = setTimeout(tick, TOAST_SLICE);
        return;
      }
      if (el._waitBusy) {
        el._waitBusy = false;
        el._rem = el._ttl || 3200;
      }
      const step = Math.min(el._rem, TOAST_SLICE);
      const started = performance.now();
      el._timer = setTimeout(() => {
        if (!el.isConnected) return;
        if (busyEl || (typeof App !== 'undefined' && App.busy)) {
          el._waitBusy = true;
          el._timer = setTimeout(tick, TOAST_SLICE);
          return;
        }
        if (el._waitBusy) {
          el._waitBusy = false;
          el._rem = el._ttl || 3200;
          tick();
          return;
        }
        const dt = performance.now() - started;
        // Ein Hauptthread-Hänger (> 250 ms über Zielzeit) darf höchstens 100 ms Restzeit abziehen
        el._rem -= dt > step + 250 ? Math.min(step, 100) : step;
        if (el._rem <= 0) el.remove();
        else tick();
      }, step);
    };
    tick();
  }
  function toast(text, opts = {}) {
    const plain = typeof text === 'string' ? text : (text && text.textContent) || '';
    if (!muted && typeof Notices !== 'undefined' && Notices.fromToast && !opts.noNotice) {
      Notices.fromToast(plain, opts);
    }
    if (muted && !opts.force) { muted.push(plain); return h('div'); }
    const box = $('#toasts');
    const el = h('div', { class: 'toast' + (opts.kind === 'bad' ? ' bad' : ''), role: 'status' });
    el.innerHTML = icon(opts.icon || (opts.kind === 'bad' ? 'warn' : 'check'));
    el.append(h('div', { class: 'grow' }, text));
    if (opts.action) el.append(h('button', { type: 'button', onclick: () => { clearTimeout(el._timer); opts.action.run(); el.remove(); } }, opts.action.label));
    // dieselbe Meldung nicht doppelt stapeln
    if (typeof text === 'string') { for (const old of [...box.children]) if (old.dataset.text === text) { clearTimeout(old._timer); old.remove(); } el.dataset.text = text; }
    box.append(el);
    while (box.children.length > 3) { clearTimeout(box.firstChild._timer); box.firstChild.remove(); }
    el._ttl = opts.ms || (opts.action ? 6000 : 3200);
    el._waitBusy = !!(busyEl || (typeof App !== 'undefined' && App.busy));
    scheduleToast(el, el._ttl);
    return el;
  }
  // ---------- Dialog ----------
  function modal({ title, body, actions = [], wide = false, onClose }) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || T('common.dialog') });
    if (title) box.append(h('h2', null, title));
    if (body) box.append(typeof body === 'string' ? h('p', null, body) : body);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(v); };
    if (actions.length) {
      const row = h('div', { class: 'actions' });
      for (const a of actions) row.append(h('button', { type: 'button', id: a.id || null, 'data-help': a.help || null, class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), onclick: () => { if (a.run && a.run() === false) return; close(a.value); } }, a.label));
      box.append(row);
    }
    back.append(box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', key, true);
    document.body.append(back);
    setTimeout(() => { const f = box.querySelector('input,select,textarea,button.primary'); if (f) f.focus(); }, 30);
    return { close, el: box };
  }
  function confirm(title, text, okLabel = T('common.ok'), danger = false) {
    return new Promise((res) => modal({ title, body: text, actions: [{ label: T('common.cancel'), value: false }, { label: okLabel, primary: !danger, danger, value: true }], onClose: (v) => res(!!v) }));
  }
  function prompt(title, label, value = '', okLabel = T('common.ok')) {
    return new Promise((res) => {
      const inp = h('input', { type: 'text', value, id: 'prompt-inp', style: { width: '100%', padding: '10px 12px', border: '1px solid var(--line-strong)', borderRadius: '8px', background: 'var(--surface)', fontSize: '15px' } });
      const body = h('div', { style: { display: 'grid', gap: '6px' } }, h('label', { for: 'prompt-inp', style: { color: 'var(--muted)', fontSize: '13.5px' } }, label), inp);
      let result = null;
      const m = modal({ title, body, actions: [{ label: T('common.cancel') }, { label: okLabel, primary: true, run: () => { result = inp.value; } }], onClose: () => res(result) });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { result = inp.value; m.close(); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
    });
  }
  // ---------- Menüs ----------
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('pointerdown', outside, true); } }
  function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
  function menu(anchor, entries, opts = {}) {
    closeMenu();
    const m = h('div', { class: 'menu', role: 'menu' });
    for (const en of entries) {
      if (en === '-') { m.append(h('hr')); continue; }
      if (en.hidden) continue;
      const b = h('button', { type: 'button', role: 'menuitem', id: en.id || null, disabled: en.disabled, 'data-help': en.help || null, onclick: () => { closeMenu(); en.run && en.run(); } });
      b.innerHTML = en.icon ? icon(en.icon) : '';
      b.append(h('span', null, en.label));
      if (en.kbd) b.append(h('span', { class: 'k' }, en.kbd));
      m.append(b);
    }
    document.body.append(m); openMenu = m;
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    let x = opts.alignRight ? r.right - mr.width : r.left, y = opts.up ? r.top - mr.height - 6 : r.bottom + 6;
    x = clamp(x, 8, Math.max(8, innerWidth - mr.width - 8)); y = clamp(y, 8, Math.max(8, innerHeight - mr.height - 8));
    m.style.left = x + 'px'; m.style.top = y + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    return m;
  }
  let openPop = null;
  function closePop() { if (openPop) { openPop.el.remove(); document.removeEventListener('pointerdown', openPop.outside, true); const cb = openPop.onClose; openPop = null; cb && cb(); } }
  function pop(anchor, content, opts = {}) {
    closePop();
    const el = h('div', { class: 'pop' }); el.append(content);
    document.body.append(el);
    const r = anchor.getBoundingClientRect(), pr = el.getBoundingClientRect();
    let x = opts.alignRight ? r.right - pr.width : r.left, y = opts.up ? r.top - pr.height - 8 : r.bottom + 8;
    x = clamp(x, 8, innerWidth - pr.width - 8); y = clamp(y, 8, innerHeight - pr.height - 8);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    const outside2 = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    openPop = { el, outside: outside2, onClose: opts.onClose, anchor };
    setTimeout(() => document.addEventListener('pointerdown', outside2, true), 0);
    if (typeof App !== 'undefined' && App.emit) App.emit('pop');
    return el;
  }
  // ---------- Tooltips ----------
  let tipEl = null, tipTimer = 0, helpTimer = 0;
  // Hilfe-Schlüssel eines Elements: data-help, sonst nach id oder Beschriftung
  const HELP_IDS = { 't-measure': 'measure', 't-sketch': 'sketchFace', 'lt-params': 'params', 'timeline': 'timeline', 't-drone': 'droneLib', 'drone-assist': 'frameAssist', 'var-new': 'variants', 'var-cmp': 'variants' };
  const HELP_LABELS = { 'Spiegeln': 'mirror', 'Hochziehen': 'extrude', 'Skizze hierauf': 'sketchFace' };
  function helpKey(t) { const k = t.dataset.help || HELP_IDS[t.id] || HELP_LABELS[(t.textContent || '').trim()]; return k && HELP[k] ? k : null; }
  function initTips() {
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const t = e.target.closest && e.target.closest('[data-tip],[data-help],#t-measure,#t-sketch,#lt-params,#t-drone,#drone-assist');
      clearTimeout(tipTimer); clearTimeout(helpTimer);
      if (!t) { hideTip(); return; }
      tipTimer = setTimeout(() => showTip(t), 420);
    });
    document.addEventListener('pointerdown', hideTip, true);
    document.addEventListener('scroll', hideTip, true);
  }
  function showTip(t) {
    hideTip();
    if (!document.body.contains(t)) return;
    const key = helpKey(t);
    tipEl = h('div', { class: 'tooltip' }, t.dataset.tip || (key ? HELP[key].tip : ''));
    if (t.dataset.kbd) tipEl.append(h('span', { class: 'kbd' }, t.dataset.kbd));
    if (key) tipEl.append(h('span', { class: 'more' }, T('hint.waitMore')));
    document.body.append(tipEl); placeTip(t);
    // länger drauf bleiben: ausführliche Hilfe
    if (key) helpTimer = setTimeout(() => {
      if (!tipEl || !document.body.contains(t)) return;
      const H = HELP[key]; const m = tipEl.querySelector('.more'); if (m) m.remove();
      tipEl.classList.add('big');
      tipEl.append(h('span', { class: 'hl' }, H.hilfe), h('span', { class: 'tp' }, h('b', null, T('hint.tipPrefix')), H.tipp));
      placeTip(t);
    }, 1100);
  }
  function placeTip(t) {
    const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2, y = r.bottom + 8;
    if (y + tr.height > innerHeight - 8) y = r.top - tr.height - 8;
    tipEl.style.left = clamp(x, 8, innerWidth - tr.width - 8) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { clearTimeout(helpTimer); if (tipEl) { tipEl.remove(); tipEl = null; } }
  // ---------- Tablet- & Touch-Erkennung ----------
  let seenTouch = false;
  function hasTouch() {
    return seenTouch
      || (navigator.maxTouchPoints > 0)
      || ('ontouchstart' in window)
      || (typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches));
  }
  function viewportWidth() {
    return (document.documentElement && document.documentElement.clientWidth) || innerWidth;
  }
  function isTablet() {
    return viewportWidth() < 1100 && hasTouch();
  }
  function syncTablet() {
    const t = hasTouch(), tab = isTablet();
    document.body.classList.toggle('touch', t);
    document.body.classList.toggle('tablet', tab);
    const ws = $('#workspace');
    if (ws && !tab && viewportWidth() > 900) ws.classList.remove('show-left', 'show-right');
    const bl = $('#btn-left'), br = $('#btn-right');
    if (bl && ws) bl.setAttribute('aria-expanded', String(ws.classList.contains('show-left')));
    if (br && ws) br.setAttribute('aria-expanded', String(ws.classList.contains('show-right')));
    return tab;
  }
  function initTablet() {
    syncTablet();
    window.addEventListener('resize', syncTablet);
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(pointer: coarse)');
      if (mq.addEventListener) mq.addEventListener('change', syncTablet);
      else if (mq.addListener) mq.addListener(syncTablet);
    }
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !seenTouch) { seenTouch = true; syncTablet(); }
    }, { capture: true, passive: true });
  }
  // ---------- Hinweiszeile ----------
  let hintOverride = null;
  function hint(html) { hintOverride = html; renderHint(); }
  function renderHint() {
    const el = $('#hintline');
    let html = hintOverride;
    if (!html) html = defaultHint();
    el.innerHTML = icon('info') + '<span>' + html + '</span>';
  }
  function defaultHint() {
    if (App.mode === 'drawing') return T('hint.defaultDrawing');
    const n = App.doc.items.length;
    if (!n) return T('hint.defaultEmpty');
    if (App.edges.length) return T('hint.defaultEdges');
    if (App.face && App.sel.length === 1) return T('hint.defaultFace');
    if (App.sel.length > 1) return T('hint.defaultMulti', { n: App.sel.length });
    if (App.sel.length === 1) return T('hint.defaultOne');
    return isTablet() ? T('hint.defaultIdleTouch') : T('hint.defaultIdle');
  }
  // ---------- Ladeanzeige ----------
  let loadingEl = null;
  function loading(show, pct, text) {
    if (!show) { if (loadingEl) { loadingEl.remove(); loadingEl = null; } return; }
    if (!loadingEl) {
      loadingEl = h('div', { class: 'loading' }, h('div', { class: 'box' }, h('b', null, T('hint.starting')), h('div', { class: 'bar' }, h('i')), h('span', { class: 'lt' }, T('hint.kernelLoading'))));
      $('#center').append(loadingEl);
    }
    if (pct != null) loadingEl.querySelector('.bar i').style.width = Math.round(pct * 100) + '%';
    if (text) loadingEl.querySelector('.lt').textContent = text;
  }
  let busyEl = null;
  function busy(on, text = T('status.calcBusy')) {
    const box = $('#toasts');
    if (on) {
      if (!busyEl) { busyEl = h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('span', { class: 'bt' }, text)); $('#overlay').append(busyEl); }
      else { const bt = busyEl.querySelector('.bt'); if (bt) bt.textContent = text; }
      if (box) for (const t of box.children) t._waitBusy = true;
    } else {
      if (busyEl) { busyEl.remove(); busyEl = null; }
      if (box) for (const t of box.children) if (t._waitBusy) { t._waitBusy = false; scheduleToast(t, t._ttl || 3200); }
    }
    if (typeof Measure !== 'undefined' && Measure.setCalcBusy) Measure.setCalcBusy(!!on);
  }
  // ---------- Eingabefelder ----------
  function numField({ id, label, value, unit = 'mm', len, axis, onCommit, min, int, placeholder, expr = true, step, vars, measurePick }) {
    const getV = () => (typeof vars === 'function' ? vars() : vars) || Model.vars(App.doc).v;
    const V = getV();
    const isLen = len != null ? !!len : unit === 'mm';
    const isAng = !isLen && unit === '°';
    const dispUnit = isLen && unit === 'mm' ? Units.label() : unit;
    const fmtDisp = (val) => (int ? String(Math.round(val)) : isLen ? Units.fmtLen(val) : isAng ? fmtAngle(val) : fmt(val));
    const isE = typeof value === 'string' && Model.isExpr(value);
    const isMeasRef = isE && typeof App !== 'undefined' && App.doc && Array.isArray(App.doc.params) && App.doc.params.some((mp) => mp && mp.measure && typeof Expr !== 'undefined' && Expr.names && Expr.names(value).some((n) => n.toLowerCase() === String(mp.name || '').toLowerCase()));
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const box = h('div', { class: 'inp' + (isE ? ' expr' : '') + (isMeasRef ? ' measured' : '') });
    if (axis) box.append(h('span', { class: 'axis ' + axis }, axis.toUpperCase()));
    const dispVal = typeof value === 'number' ? fmtDisp(value) : (value ?? '');
    const inp = h('input', { id, type: 'text', inputmode: 'decimal', value: dispVal, placeholder: placeholder || '', autocomplete: 'off', spellcheck: 'false' });
    box.append(inp);
    let badErr = null;
    if (isE) {
      const res = Expr.tryEval(value, V);
      if (res.ok) {
        const ev = res.value;
        const uSuf = isLen && Units.key() !== 'mm' ? ' ' + Units.label() : '';
        const evTxt = isLen ? Units.fmtLen(ev) + uSuf : isAng ? fmtAngleU(ev) : fmt(ev);
        const evTip = isLen ? Units.fmtLenU(ev) : isAng ? fmtAngleU(ev) : fmt(ev);
        box.append(h('span', { class: 'fx', title: T('hint.formulaTip', { expr: value, val: evTip }) }, '= ' + evTxt));
      } else {
        badErr = res.error;
        box.classList.add('invalid');
        box.append(h('span', { class: 'fx bad', title: res.error }, T('hint.formulaErrShort')));
      }
    } else if (dispUnit) box.append(h('span', { class: 'unit' }, dispUnit));
    const canMeasure = measurePick !== false && expr !== false && !int && (isLen || unit === '') && typeof Measure !== 'undefined' && typeof Measure.pickEdgeForField === 'function' && App.mode === 'model';
    if (canMeasure) {
      const mb = h('button', {
        type: 'button',
        class: 'meas-btn',
        id: id ? id + '-meas' : null,
        'data-measure-for': id || '',
        'data-help': 'measureParam',
        'data-tip': T('measure.pickForFieldTip'),
        'aria-label': T('measure.pickForFieldAria'),
      });
      mb.innerHTML = icon('measure');
      mb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      mb.addEventListener('click', (e) => {
        e.stopPropagation();
        Measure.pickEdgeForField({
          fieldId: id || null,
          btn: mb,
          onPick: (paramName) => {
            orig = paramName;
            inp.value = paramName;
            box.classList.remove('invalid');
            box.classList.add('expr', 'measured');
            onCommit(paramName);
          },
        });
      });
      box.append(mb);
    }
    wrap.append(box);
    if (badErr) wrap.append(h('div', { class: 'field-err' }, badErr));
    let orig = inp.value, lastBad = null;
    const commit = () => {
      const raw = inp.value.trim();
      if (raw === orig) { if (!badErr) box.classList.remove('invalid'); lastBad = null; return; }
      let val;
      if (isLen) {
        const p = Units.parseLen(raw, getV(), { expr });
        if (!p.ok) { box.classList.add('invalid'); if (expr && lastBad !== raw) toast(T('hint.calcErr', { err: p.error || T('hint.calcErrRaw', { raw }) }), { kind: 'bad' }); lastBad = raw; return; }
        val = p.value;
      } else {
        val = parseNum(raw);
        if (isNaN(val)) {
          if (!expr) { box.classList.add('invalid'); return; }
          const res = Expr.tryEval(raw, getV());
          if (!res.ok) { box.classList.add('invalid'); if (lastBad !== raw) toast(T('hint.calcErr', { err: res.error }), { kind: 'bad' }); lastBad = raw; return; }
          val = raw;
        }
      }
      if (typeof val === 'number') {
        if (min != null && val < min) val = min;
        if (int) val = Math.round(val);
      }
      box.classList.remove('invalid');
      orig = typeof val === 'number' ? fmtDisp(val) : val;
      inp.value = orig;
      onCommit(val);
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { commit(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = orig; inp.blur(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const n = parseNum(inp.value); if (isNaN(n)) return;
        e.preventDefault();
        const u = isLen ? Units.def() : null;
        const s = (step || (u ? (e.shiftKey ? u.shiftStep : u.step) : (e.shiftKey ? 10 : 1))) * (e.key === 'ArrowUp' ? 1 : -1);
        let nv = round(n + s, isLen ? u.inputDec : 4);
        if (min != null) nv = Math.max(isLen ? Units.fromMM(min) : min, nv);
        inp.value = fmtFixed(nv, isLen ? u.inputDec : 4); commit();
      }
    });
    inp.addEventListener('blur', commit);
    inp.addEventListener('focus', () => inp.select());
    return wrap;
  }
  // Textfeld: übernimmt beim Tippen (live) oder erst bei Enter/Verlassen
  function textField({ id, label, value, onCommit, live, placeholder }) {
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const inp = h('input', { id, type: 'text', value: value ?? '', placeholder: placeholder || '', autocomplete: 'off', spellcheck: 'false' });
    let orig = inp.value;
    const commit = () => { if (inp.value === orig) return; orig = inp.value; onCommit(inp.value); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); inp.blur(); } if (e.key === 'Escape') { inp.value = orig; inp.blur(); } });
    if (live) inp.addEventListener('input', commit);
    inp.addEventListener('change', commit);
    inp.addEventListener('blur', commit);
    wrap.append(h('div', { class: 'inp' }, inp));
    return wrap;
  }
  function selectField({ id, label, value, options, onChange }) {
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const sel = h('select', { id });
    const addOpt = (parent, o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      const op = h('option', { value: v }, l);
      if (String(v) === String(value)) op.selected = true;
      parent.append(op);
    };
    for (const o of (typeof options === 'function' ? options() : options)) {
      if (o && typeof o === 'object' && !Array.isArray(o) && Array.isArray(o.options)) {
        const og = h('optgroup', { label: o.group });
        for (const sub of o.options) addOpt(og, sub);
        sel.append(og);
      } else addOpt(sel, o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    wrap.append(h('div', { class: 'inp' }, sel));
    return wrap;
  }
  return { toast, mute, modal, confirm, prompt, menu, closeMenu, pop, closePop, initTips, hasTouch, isTablet, syncTablet, initTablet, hint, renderHint, loading, busy, numField, selectField, textField };
})();

