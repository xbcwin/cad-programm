// ================= Oberfläche: Grundbausteine =================
const UI = (() => {
  // ---------- Meldungen ----------
  // stumm geschaltet (z. B. während der KI-Kollege arbeitet): Meldungen werden gesammelt statt gezeigt
  let muted = null;
  function mute(on) { if (on) { muted = []; return null; } const m = muted || []; muted = null; return m; }
  function toast(text, opts = {}) {
    if (muted && !opts.force) { muted.push(typeof text === 'string' ? text : (text && text.textContent) || ''); return h('div'); }
    const box = $('#toasts');
    const el = h('div', { class: 'toast' + (opts.kind === 'bad' ? ' bad' : ''), role: 'status' });
    el.innerHTML = icon(opts.icon || (opts.kind === 'bad' ? 'warn' : 'check'));
    el.append(h('div', { class: 'grow' }, text));
    if (opts.action) el.append(h('button', { type: 'button', onclick: () => { opts.action.run(); el.remove(); } }, opts.action.label));
    // dieselbe Meldung nicht doppelt stapeln
    if (typeof text === 'string') { for (const old of [...box.children]) if (old.dataset.text === text) old.remove(); el.dataset.text = text; }
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), opts.ms || (opts.action ? 6000 : 3200));
    return el;
  }
  // ---------- Dialog ----------
  function modal({ title, body, actions = [], wide = false, onClose }) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
    if (title) box.append(h('h2', null, title));
    if (body) box.append(typeof body === 'string' ? h('p', null, body) : body);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(v); };
    if (actions.length) {
      const row = h('div', { class: 'actions' });
      for (const a of actions) row.append(h('button', { type: 'button', class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), onclick: () => { if (a.run && a.run() === false) return; close(a.value); } }, a.label));
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
    x = clamp(x, 8, innerWidth - mr.width - 8); y = clamp(y, 8, innerHeight - mr.height - 8);
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
    if (key) tipEl.append(h('span', { class: 'more' }, 'Kurz warten für mehr …'));
    document.body.append(tipEl); placeTip(t);
    // länger drauf bleiben: ausführliche Hilfe
    if (key) helpTimer = setTimeout(() => {
      if (!tipEl || !document.body.contains(t)) return;
      const H = HELP[key]; const m = tipEl.querySelector('.more'); if (m) m.remove();
      tipEl.classList.add('big');
      tipEl.append(h('span', { class: 'hl' }, H.hilfe), h('span', { class: 'tp' }, h('b', null, 'Tipp: '), H.tipp));
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
    if (App.mode === 'drawing') return 'Die Zeichnung entsteht automatisch aus deinem Modell. Mit <b>Maß</b> fügst du Bemaßungen hinzu.';
    const n = App.doc.items.length;
    if (!n) return 'Zieh einen <b>Körper</b> auf die Fläche – oder schreib unten, was du bauen willst.';
    if (App.edges.length) return '<b>Kante gewählt:</b> Am rosa Pfeil ziehen rundet die Kante (Zahl tippen geht auch) – oder Abrunden / Abschrägen. Mit Umschalt weitere Kanten dazunehmen.';
    if (App.face && App.sel.length === 1) return '<b>Fläche gewählt:</b> Darauf skizzieren, ein Loch setzen oder den Körper ziehen.';
    if (App.sel.length > 1) return '<b>' + App.sel.length + ' Objekte gewählt:</b> Gruppieren verbindet sie zu einem Körper.';
    if (App.sel.length === 1) return 'Ziehen verschiebt · Pfeile ändern die Größe · <b>Zahl anklicken</b> zum Eintippen';
    return 'Klick einen Körper an, um ihn zu bearbeiten. Links ziehen dreht die Ansicht, rechts verschiebt sie.';
  }
  // ---------- Ladeanzeige ----------
  let loadingEl = null;
  function loading(show, pct, text) {
    if (!show) { if (loadingEl) { loadingEl.remove(); loadingEl = null; } return; }
    if (!loadingEl) {
      loadingEl = h('div', { class: 'loading' }, h('div', { class: 'box' }, h('b', null, 'Tracery startet'), h('div', { class: 'bar' }, h('i')), h('span', { class: 'lt' }, 'Der CAD-Kern wird geladen …')));
      $('#center').append(loadingEl);
    }
    if (pct != null) loadingEl.querySelector('.bar i').style.width = Math.round(pct * 100) + '%';
    if (text) loadingEl.querySelector('.lt').textContent = text;
  }
  let busyEl = null;
  function busy(on) {
    if (on && !busyEl) { busyEl = h('div', { class: 'busy' }, h('div', { class: 'spin' }), 'Rechnet …'); $('#overlay').append(busyEl); }
    else if (!on && busyEl) { busyEl.remove(); busyEl = null; }
  }
  // ---------- Eingabefelder ----------
  function numField({ id, label, value, unit = 'mm', len, axis, onCommit, min, int, placeholder, expr = true, step }) {
    const V = Model.vars(App.doc).v;
    const isLen = len != null ? !!len : unit === 'mm';
    const dispUnit = isLen && unit === 'mm' ? Units.label() : unit;
    const isE = typeof value === 'string' && Model.isExpr(value);
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const box = h('div', { class: 'inp' + (isE ? ' expr' : '') });
    if (axis) box.append(h('span', { class: 'axis ' + axis }, axis.toUpperCase()));
    const dispVal = typeof value === 'number' ? (isLen ? Units.fmtInput(value) : fmt(value, 3)) : (value ?? '');
    const inp = h('input', { id, type: 'text', inputmode: 'decimal', value: dispVal, placeholder: placeholder || '', autocomplete: 'off', spellcheck: 'false' });
    box.append(inp);
    if (isE) {
      const ev = Model.num(value, V, NaN);
      const uSuf = isLen && Units.key() !== 'mm' ? ' ' + Units.label() : '';
      const evTxt = isLen ? Units.fmtLen(ev, 2) + uSuf : fmt(ev, 2);
      const evTip = isLen ? Units.fmtLenU(ev, 3) : fmt(ev, 3);
      box.append(h('span', { class: 'fx', title: 'Formel: ' + value + ' = ' + evTip }, '= ' + evTxt));
    } else if (dispUnit) box.append(h('span', { class: 'unit' }, dispUnit));
    wrap.append(box);
    let orig = inp.value, lastBad = null;
    const commit = () => {
      const raw = inp.value.trim();
      if (raw === orig) { box.classList.remove('invalid'); lastBad = null; return; }
      let val;
      if (isLen) {
        const p = Units.parseLen(raw, Model.vars(App.doc).v, { expr });
        if (!p.ok) { box.classList.add('invalid'); if (expr && lastBad !== raw) toast('Das kann ich nicht ausrechnen: „' + raw + '“ – prüf die Schreibweise oder den Namen.', { kind: 'bad' }); lastBad = raw; return; }
        val = p.value;
      } else {
        val = parseNum(raw);
        if (isNaN(val)) {
          if (!expr) { box.classList.add('invalid'); return; }
          const vv = Model.num(raw, Model.vars(App.doc).v, NaN);
          if (isNaN(vv)) { box.classList.add('invalid'); if (lastBad !== raw) toast('Das kann ich nicht ausrechnen: „' + raw + '“ – prüf die Schreibweise oder den Namen.', { kind: 'bad' }); lastBad = raw; return; }
          val = raw;
        }
      }
      if (typeof val === 'number') {
        if (min != null && val < min) val = min;
        if (int) val = Math.round(val);
      }
      box.classList.remove('invalid');
      orig = typeof val === 'number' ? (isLen ? Units.fmtInput(val) : fmt(val, 3)) : val;
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
        inp.value = fmt(nv, isLen ? u.inputDec : 3); commit();
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
    inp.addEventListener('blur', commit);
    wrap.append(h('div', { class: 'inp' }, inp));
    return wrap;
  }
  function selectField({ id, label, value, options, onChange }) {
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const sel = h('select', { id });
    for (const o of options) { const [v, l] = Array.isArray(o) ? o : [o, o]; const op = h('option', { value: v }, l); if (String(v) === String(value)) op.selected = true; sel.append(op); }
    sel.addEventListener('change', () => onChange(sel.value));
    wrap.append(h('div', { class: 'inp' }, sel));
    return wrap;
  }
  return { toast, mute, modal, confirm, prompt, menu, closeMenu, pop, closePop, initTips, hint, renderHint, loading, busy, numField, selectField, textField };
})();

