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
  // ---------- Fokus & Barrierefreiheit (BE-24) ----------
  function focusables(root = document) {
    if (!root || !root.querySelectorAll) return [];
    const sel = 'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])';
    return [...root.querySelectorAll(sel)].filter((el) => {
      if (el.hidden || el.closest('[hidden]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    });
  }
  function restoreFocusEl(el) {
    if (el && el.isConnected && typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    }
  }
  function ensureA11yLabels(root = document.body) {
    if (!root || root.nodeType !== 1) return;
    const list = root.matches && root.matches('button,[role="button"]') ? [root, ...root.querySelectorAll('button,[role="button"]')] : [...root.querySelectorAll('button,[role="button"]')];
    for (const el of list) {
      for (const sv of el.querySelectorAll('svg')) {
        if (!sv.getAttribute('aria-label') && !sv.getAttribute('aria-labelledby') && !sv.hasAttribute('aria-hidden')) {
          sv.setAttribute('aria-hidden', 'true');
        }
      }
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) continue;
      if ((el.textContent || '').trim()) continue;
      const helpTip = el.dataset && el.dataset.help && typeof HELP !== 'undefined' && HELP[el.dataset.help] ? HELP[el.dataset.help].tip : '';
      const lbl = ((el.dataset && el.dataset.tip) || el.getAttribute('title') || helpTip || '').trim();
      if (lbl) el.setAttribute('aria-label', lbl);
    }
  }
  let a11yInited = false;
  function initA11y() {
    if (a11yInited || typeof document === 'undefined' || !document.body) return;
    a11yInited = true;
    ensureA11yLabels(document.body);
    if (typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n && n.nodeType === 1) ensureA11yLabels(n);
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && typeof ViewPrefs !== 'undefined' && ViewPrefs.lookPanelOpen) {
        ViewPrefs.closeLookPanel();
      }
    });
  }
  // ---------- Dialog ----------
  function modal({ title, body, actions = [], wide = false, onClose }) {
    const prevFocus = document.activeElement;
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || T('common.dialog'), tabindex: '-1' });
    if (title) box.append(h('h2', null, title));
    if (body) box.append(typeof body === 'string' ? h('p', null, body) : body);
    const close = (v) => {
      if (!back.isConnected) return;
      back.remove();
      document.removeEventListener('keydown', key, true);
      onClose && onClose(v);
      if (!document.querySelector('.modal-back') && (!document.activeElement || document.activeElement === document.body)) {
        restoreFocusEl(prevFocus);
      }
    };
    if (actions.length) {
      const row = h('div', { class: 'actions' });
      for (const a of actions) row.append(h('button', { type: 'button', id: a.id || null, 'data-help': a.help || null, class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), onclick: () => { if (a.run && a.run() === false) return; close(a.value); } }, a.label));
      box.append(row);
    }
    back.append(box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    const key = (e) => {
      const backs = document.querySelectorAll('.modal-back');
      if (backs.length && backs[backs.length - 1] !== back) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
      if (e.key === 'Tab') {
        const f = focusables(box);
        if (!f.length) { e.preventDefault(); box.focus({ preventScroll: true }); return; }
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    document.body.append(back);
    setTimeout(() => {
      if (!box.isConnected) return;
      const f = box.querySelector('input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled),button.primary:not(:disabled),button:not(:disabled),[tabindex="0"]');
      if (f) f.focus();
      else box.focus({ preventScroll: true });
    }, 30);
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
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); result = inp.value; m.close(); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
    });
  }
  // ---------- Menüs ----------
  let openMenu = null, openMenuState = null;
  function closeMenu(restore = false) {
    if (!openMenu) return;
    const st = openMenuState;
    openMenu.remove();
    openMenu = null;
    openMenuState = null;
    document.removeEventListener('pointerdown', outside, true);
    if (st && st.onKey) document.removeEventListener('keydown', st.onKey, true);
    if (restore && st && st.prevFocus) restoreFocusEl(st.prevFocus);
  }
  function outside(e) { if (whatIsOn || (e.target && e.target.closest && e.target.closest('#btn-whatis, #whatis-pop'))) return; if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
  function menu(anchor, entries, opts = {}) {
    closeRadial();
    closeMenu();
    const prevFocus = (anchor && anchor.isConnected && typeof anchor.focus === 'function') ? anchor : document.activeElement;
    const m = h('div', { class: 'menu', role: 'menu', tabindex: '-1' });
    for (const en of entries) {
      if (en === '-') { m.append(h('hr')); continue; }
      if (en.hidden) continue;
      const b = h('button', { type: 'button', role: 'menuitem', id: en.id || null, disabled: en.disabled, 'data-help': en.help || null, onclick: () => { closeMenu(); en.run && en.run(); } });
      b.innerHTML = en.icon ? icon(en.icon) : '';
      b.append(h('span', null, en.label));
      if (en.kbd) b.append(h('span', { class: 'k' }, en.kbd));
      m.append(b);
    }
    const onKey = (e) => {
      if (openMenu !== m) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
      const items = [...m.querySelectorAll('button[role="menuitem"]:not(:disabled)')];
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        items[idx < 0 ? 0 : (idx + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        items[idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault(); e.stopPropagation();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault(); e.stopPropagation();
        items[items.length - 1].focus();
      } else if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        const next = e.shiftKey
          ? (idx <= 0 ? items.length - 1 : idx - 1)
          : (idx < 0 || idx >= items.length - 1 ? 0 : idx + 1);
        items[next].focus();
      }
    };
    document.body.append(m); openMenu = m; openMenuState = { el: m, anchor, prevFocus, onKey };
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    let x = opts.alignRight ? r.right - mr.width : r.left, y = opts.up ? r.top - mr.height - 6 : r.bottom + 6;
    x = clamp(x, 8, Math.max(8, innerWidth - mr.width - 8)); y = clamp(y, 8, Math.max(8, innerHeight - mr.height - 8));
    m.style.left = x + 'px'; m.style.top = y + 'px';
    m.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (openMenu === m) document.addEventListener('pointerdown', outside, true); }, 0);
    return m;
  }
  let openPop = null;
  function closePop(restore = false) {
    if (!openPop) return;
    const cur = openPop;
    cur.el.remove();
    document.removeEventListener('pointerdown', cur.outside, true);
    if (cur.onKey) document.removeEventListener('keydown', cur.onKey, true);
    openPop = null;
    cur.onClose && cur.onClose();
    if (restore && cur.prevFocus) restoreFocusEl(cur.prevFocus);
  }
  function pop(anchor, content, opts = {}) {
    closeRadial();
    closePop();
    const prevFocus = (anchor && anchor.isConnected && typeof anchor.focus === 'function') ? anchor : document.activeElement;
    const el = h('div', { class: 'pop', role: 'dialog', tabindex: '-1', ...(opts.label ? { 'aria-label': opts.label } : {}) }); el.append(content);
    document.body.append(el);
    const r = anchor.getBoundingClientRect(), pr = el.getBoundingClientRect();
    let x = opts.alignRight ? r.right - pr.width : r.left, y = opts.up ? r.top - pr.height - 8 : r.bottom + 8;
    x = clamp(x, 8, innerWidth - pr.width - 8); y = clamp(y, 8, innerHeight - pr.height - 8);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    const outside2 = (e) => { if (whatIsOn || (e.target && e.target.closest && e.target.closest('#btn-whatis, #whatis-pop'))) return; if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const onKey = (e) => {
      if (!openPop || openPop.el !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); }
    };
    openPop = { el, outside: outside2, onKey, onClose: opts.onClose, anchor, prevFocus };
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { if (openPop && openPop.el === el) document.addEventListener('pointerdown', outside2, true); }, 0);
    if (typeof App !== 'undefined' && App.emit) App.emit('pop');
    return el;
  }
  // ---------- Kreis-Menü an der Maus (BE-19) ----------
  const RADIAL_KEY = 'tracery-kreismenue';
  const RADIAL_DEFAULTS = ['box', 'cylinder', 'sketch', 'fillet', 'chamfer', 'hole', 'measure', 'paintSelect'];
  let lastPtr = { x: null, y: null };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', (e) => { lastPtr = { x: e.clientX, y: e.clientY }; }, { passive: true });
  }
  function radialCatalog() {
    return [
      { id: 'box', label: T('kind.box'), icon: 'cube', run: () => Actions.addPrimitive('box') },
      { id: 'cylinder', label: T('kind.cylinder'), icon: 'circle', run: () => Actions.addPrimitive('cylinder') },
      { id: 'sphere', label: T('kind.sphere'), icon: 'circle', run: () => Actions.addPrimitive('sphere') },
      { id: 'cone', label: T('kind.cone'), icon: 'cube', run: () => Actions.addPrimitive('cone') },
      { id: 'tube', label: T('kind.tube'), icon: 'circle', run: () => Actions.addPrimitive('tube') },
      { id: 'sketch', label: T('tool.sketch'), icon: 'sketch', help: 'sketchFace', run: () => Sketch.chooseAndStart() },
      { id: 'fillet', label: T('ctx.fillet'), icon: 'fillet', help: 'fillet', run: () => { if (App.edges.length) Actions.addFinish('fillet', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1); else toast(T('dlg.tb.needBodyOrEdge'), { icon: 'info' }); } },
      { id: 'chamfer', label: T('ctx.chamfer'), icon: 'chamfer', help: 'chamfer', run: () => { if (App.edges.length) Actions.addFinish('chamfer', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'chamfer', 'all', 1); else toast(T('dlg.tb.needBodyOrEdge'), { icon: 'info' }); } },
      { id: 'hole', label: T('dlg.tb.hole'), icon: 'holeWizard', help: 'holeWizard', run: () => Place.holeWizard($('#t-parts') || $('#center')) },
      { id: 'shell', label: T('ctx.shell'), icon: 'shell', help: 'shell', run: () => { const f = Actions.selectedFace(); if (f) Features.shell(f); else toast(T('dlg.tb.needOpenFace'), { icon: 'info' }); } },
      { id: 'mirror', label: T('ctx.mirror'), icon: 'mirror', help: 'mirror', run: () => Features.pattern('mirror') },
      { id: 'split', label: T('ctx.split'), icon: 'split', help: 'split', run: () => Features.split() },
      { id: 'patternRect', label: T('ctx.patRect'), icon: 'patternRect', help: 'patternRect', run: () => Features.pattern('rect') },
      { id: 'patternCirc', label: T('ctx.patCirc'), icon: 'patternCirc', help: 'patternCirc', run: () => Features.pattern('circ') },
      { id: 'duplicate', label: T('common.duplicate'), icon: 'copy', run: () => Actions.duplicate() },
      { id: 'measure', label: T('tool.measure'), icon: 'measure', help: 'measure', run: () => Measure.toggle() },
      { id: 'paintSelect', label: T('paint.title'), icon: 'noteDraw', help: 'paintSelect', run: () => Select.togglePaint() },
      { id: 'notes', label: T('tool.notes'), icon: 'noteDraw', help: 'notes', run: () => Notes.toggle() },
      { id: 'section', label: T('menu.view.section'), icon: 'section', help: 'section', run: () => Views.section() },
      { id: 'xray', label: T('menu.view.xray'), icon: 'xray', help: 'xray', run: () => Views.xray() },
      { id: 'explode', label: T('menu.view.explode'), icon: 'explode', help: 'explode', run: () => Views.explode() },
      { id: 'fit', label: T('menu.ctx.fitAll'), icon: 'fit', run: () => Viewer.fit(App.sel.length ? App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean) : null) },
      { id: 'export', label: T('tool.export'), icon: 'export', run: () => Print.exportDialog() },
      { id: 'undo', label: T('topbar.undo'), icon: 'undo', run: () => App.undo() },
    ];
  }
  function normalizeRadialIds(ids) {
    const map = new Map(radialCatalog().map((c) => [c.id, c]));
    const out = [];
    for (let i = 0; i < 8; i++) {
      const id = Array.isArray(ids) ? ids[i] : null;
      out.push(typeof id === 'string' && map.has(id) ? id : RADIAL_DEFAULTS[i]);
    }
    return out;
  }
  function radialItems() {
    try {
      const raw = storageGet(RADIAL_KEY);
      if (!raw) return [...RADIAL_DEFAULTS];
      return normalizeRadialIds(JSON.parse(raw));
    } catch (_) {
      return [...RADIAL_DEFAULTS];
    }
  }
  function setRadialItems(ids) {
    const next = normalizeRadialIds(ids);
    const isDef = next.every((id, i) => id === RADIAL_DEFAULTS[i]);
    if (isDef) storageDel(RADIAL_KEY);
    else storageSet(RADIAL_KEY, JSON.stringify(next));
    return next;
  }
  function resetRadial() {
    storageDel(RADIAL_KEY);
    return [...RADIAL_DEFAULTS];
  }
  let radialEl = null, radialState = null;
  function slotForPoint(cx, cy, px, py) {
    if (Math.hypot(px - cx, py - cy) < 26) return -1;
    const raw = Math.atan2(py - cy, px - cx) + Math.PI / 2 + Math.PI / 8;
    const norm = ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(norm / (Math.PI / 4)) % 8;
  }
  function setRadialActive(slot) {
    if (!radialEl || !radialState) return;
    radialState.activeSlot = slot;
    for (const el of radialEl.querySelectorAll('.radial-item')) {
      el.classList.toggle('active', Number(el.dataset.slot) === slot);
    }
  }
  function closeRadial(restore = false) {
    if (!radialEl) return;
    const prev = radialState && radialState.prevFocus;
    radialEl.remove();
    radialEl = null;
    if (radialState) {
      document.removeEventListener('pointerdown', radialState.onOut, true);
      window.removeEventListener('pointermove', radialState.onMove);
      window.removeEventListener('keydown', radialState.onKey, true);
      window.removeEventListener('resize', closeRadial);
      radialState = null;
    }
    if (restore && prev) restoreFocusEl(prev);
  }
  function openRadial(cx, cy, opts = {}) {
    closeMenu();
    closePop();
    closeRadial();
    const prevFocus = document.activeElement;
    let x = cx, y = cy;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (Number.isFinite(lastPtr.x) && Number.isFinite(lastPtr.y) && lastPtr.x >= 0 && lastPtr.y >= 0 && lastPtr.x <= innerWidth && lastPtr.y <= innerHeight) {
        x = lastPtr.x; y = lastPtr.y;
      } else {
        const vp = $('#viewport');
        if (vp) {
          const r = vp.getBoundingClientRect();
          x = r.left + r.width / 2; y = r.top + r.height / 2;
        } else {
          x = innerWidth / 2; y = innerHeight / 2;
        }
      }
    }
    const margin = Math.min(156, Math.max(40, Math.floor(Math.min(innerWidth, innerHeight) / 2) - 8));
    x = clamp(x, margin, Math.max(margin, innerWidth - margin));
    y = clamp(y, margin, Math.max(margin, innerHeight - margin));

    const map = new Map(radialCatalog().map((c) => [c.id, c]));
    const ids = radialItems();
    const cmds = ids.map((id) => map.get(id) || map.get('box'));
    const root = h('div', { id: 'radial-menu', class: 'radial-menu', role: 'menu', 'aria-label': T('radial.aria'), tabindex: '-1' });
    root.style.left = Math.round(x) + 'px';
    root.style.top = Math.round(y) + 'px';

    const ring = h('div', { class: 'radial-ring', 'aria-hidden': 'true' });
    let lines = '';
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 0.5) * (Math.PI / 4);
      const x1 = 114 + Math.cos(a) * 32, y1 = 114 + Math.sin(a) * 32;
      const x2 = 114 + Math.cos(a) * 112, y2 = 114 + Math.sin(a) * 112;
      lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }
    ring.innerHTML = `<svg viewBox="0 0 228 228">${lines}</svg>`;
    root.append(ring);

    const R = 102;
    cmds.forEach((cmd, i) => {
      const a = -Math.PI / 2 + i * (Math.PI / 4);
      const btn = h('button', {
        type: 'button',
        class: 'radial-item',
        role: 'menuitem',
        dataset: { slot: String(i), cmd: cmd.id },
        'data-help': cmd.help || 'radialMenu',
      });
      btn.style.left = Math.round(Math.cos(a) * R) + 'px';
      btn.style.top = Math.round(Math.sin(a) * R) + 'px';
      btn.innerHTML = icon(cmd.icon);
      btn.append(h('span', { class: 'radial-lbl' }, cmd.label));
      btn.onclick = () => { closeRadial(); cmd.run(); };
      root.append(btn);
    });

    const gearBtn = h('button', {
      type: 'button',
      id: 'radial-config-btn',
      class: 'radial-gear',
      'data-help': 'radialMenu',
      'data-tip': T('radial.configTip'),
      'aria-label': T('radial.configTip'),
    });
    gearBtn.innerHTML = icon('gear');
    gearBtn.onclick = () => { closeRadial(); radialDialog(); };
    root.append(h('div', { class: 'radial-center' }, gearBtn));

    const st = {
      x, y,
      prevFocus,
      holdMode: !!opts.holdMode,
      activeSlot: -1,
      cmds,
      onOut: (e) => {
        if (st.holdMode || whatIsOn || isOwnControl(e.target)) return;
        if (radialEl && !radialEl.contains(e.target)) closeRadial();
      },
      onMove: (e) => {
        if (!st.holdMode) return;
        setRadialActive(slotForPoint(st.x, st.y, e.clientX, e.clientY));
      },
      onKey: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRadial(true);
          return;
        }
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          const btns = [...root.querySelectorAll('.radial-item, .radial-gear')];
          if (!btns.length) return;
          const idx = btns.indexOf(document.activeElement);
          const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
          const next = idx < 0 ? 0 : (idx + dir + btns.length) % btns.length;
          btns[next].focus();
        }
      },
    };
    radialEl = root;
    radialState = st;
    document.body.append(root);
    if (!opts.holdMode) root.focus({ preventScroll: true });
    setTimeout(() => {
      if (radialState !== st) return;
      document.addEventListener('pointerdown', st.onOut, true);
      window.addEventListener('pointermove', st.onMove);
      window.addEventListener('keydown', st.onKey, true);
      window.addEventListener('resize', closeRadial);
    }, 0);
    return root;
  }
  function finishRadialHold(px, py) {
    if (!radialState || !radialState.holdMode) return false;
    const st = radialState;
    let slot = -1;
    const hitEl = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(px, py) : null;
    const itemBtn = hitEl && hitEl.closest ? hitEl.closest('#radial-menu .radial-item') : null;
    if (itemBtn && itemBtn.dataset.slot != null) slot = Number(itemBtn.dataset.slot);
    else slot = slotForPoint(st.x, st.y, px, py);
    if (slot >= 0 && slot < st.cmds.length) {
      const cmd = st.cmds[slot];
      closeRadial();
      cmd && cmd.run && cmd.run();
      return true;
    }
    st.holdMode = false;
    setRadialActive(-1);
    return false;
  }
  function toggleRadial(cx, cy) {
    if (radialEl) { closeRadial(); return false; }
    openRadial(cx, cy);
    return true;
  }
  function radialDialog() {
    const cat = radialCatalog();
    const cur = radialItems();
    const selects = [];
    const grid = h('div', { class: 'radial-cfg-grid' });
    for (let i = 0; i < 8; i++) {
      const sel = h('select', { id: 'radial-slot-' + i });
      for (const c of cat) {
        const opt = h('option', { value: c.id }, c.label);
        if (c.id === cur[i]) opt.selected = true;
        sel.append(opt);
      }
      selects.push(sel);
      grid.append(h('div', { class: 'radial-cfg-row' },
        h('label', { for: 'radial-slot-' + i }, T('radial.pos' + i)),
        sel));
    }
    const body = h('div', { style: { display: 'grid', gap: '10px' } },
      h('p', { style: { color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.45 } }, T('radial.configIntro')),
      grid);
    return modal({
      title: T('radial.configTitle'),
      body,
      actions: [
        {
          id: 'radial-reset',
          label: T('common.reset'),
          run: () => {
            const def = resetRadial();
            selects.forEach((s, i) => { s.value = def[i]; });
            toast(T('radial.resetToast'), { icon: 'check', ms: 1800 });
            return false;
          },
        },
        { label: T('common.cancel'), value: false },
        {
          id: 'radial-save',
          label: T('common.save'),
          primary: true,
          value: true,
          run: () => {
            setRadialItems(selects.map((s) => s.value));
            toast(T('radial.saved'), { icon: 'check', ms: 2000 });
          },
        },
      ],
    });
  }
  // ---------- Tooltips ----------
  let tipEl = null, tipTarget = null, tipTimer = 0, helpTimer = 0;
  // Hilfe-Schlüssel eines Elements: data-help, sonst nach id oder Beschriftung
  const HELP_IDS = { 't-measure': 'measure', 't-sketch': 'sketchFace', 'lt-params': 'params', 'timeline': 'timeline', 't-drone': 'droneLib', 'drone-assist': 'frameAssist', 'var-new': 'variants', 'var-table': 'variantTable', 'var-cmp': 'variants' };
  const HELP_LABELS = { 'Spiegeln': 'mirror', 'Hochziehen': 'extrude', 'Skizze hierauf': 'sketchFace' };
  function helpKey(t) { const k = t.dataset.help || HELP_IDS[t.id] || HELP_LABELS[(t.textContent || '').trim()]; return k && HELP[k] ? k : null; }
  function initTips() {
    document.addEventListener('pointerover', (e) => {
      if (whatIsOn) return;
      if (e.pointerType === 'touch') return;
      const t = e.target.closest && e.target.closest('[data-tip],[data-help],#t-measure,#t-sketch,#lt-params,#t-drone,#drone-assist');
      if (t && t === tipTarget && (tipTimer || tipEl)) return;
      clearTimeout(tipTimer); tipTimer = 0; clearTimeout(helpTimer); helpTimer = 0;
      if (!t) { hideTip(); return; }
      tipTarget = t;
      tipTimer = setTimeout(() => { tipTimer = 0; showTip(t); }, 420);
    });
    document.addEventListener('pointerdown', hideTip, true);
    document.addEventListener('scroll', hideTip, true);
  }
  function showTip(t) {
    const tgt = t;
    hideTip();
    if (!document.body.contains(tgt)) return;
    tipTarget = tgt;
    const key = helpKey(tgt);
    tipEl = h('div', { class: 'tooltip' }, tgt.dataset.tip || (key ? HELP[key].tip : ''));
    if (tgt.dataset.kbd) tipEl.append(h('span', { class: 'kbd' }, tgt.dataset.kbd));
    if (key) tipEl.append(h('span', { class: 'more' }, T('hint.waitMore')));
    document.body.append(tipEl); placeTip(tgt);
    // länger drauf bleiben: ausführliche Hilfe
    if (key) helpTimer = setTimeout(() => {
      if (!tipEl || !document.body.contains(tgt)) return;
      const H = HELP[key]; const m = tipEl.querySelector('.more'); if (m) m.remove();
      tipEl.classList.add('big');
      tipEl.append(h('span', { class: 'hl' }, H.hilfe), h('span', { class: 'tp' }, h('b', null, T('hint.tipPrefix')), H.tipp));
      placeTip(tgt);
    }, 1100);
  }
  function placeTip(t) {
    const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2, y = r.bottom + 8;
    if (y + tr.height > innerHeight - 8) y = r.top - tr.height - 8;
    tipEl.style.left = clamp(x, 8, innerWidth - tr.width - 8) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { clearTimeout(tipTimer); tipTimer = 0; clearTimeout(helpTimer); helpTimer = 0; tipTarget = null; if (tipEl) { tipEl.remove(); tipEl = null; } }
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
    if (typeof Select !== 'undefined' && Select.paintActive) return T('hint.paintActive');
    const n = App.doc.items.length;
    if (!n) return T('hint.defaultEmpty');
    if (App.edges.length) return T('hint.defaultEdges');
    if (App.faces && App.faces.length > 1) return T('hint.defaultFaces', { n: App.faces.length });
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
  // ---------- „Was ist das?“-Modus (BE-32) ----------
  let whatIsOn = false, whatIsPop = null, whatIsHoverEl = null, whatIsTargetEl = null, whatIsHandledAt = 0, whatIsLast = null, whatIsHintHtml = null;
  const WHATIS_BLOCK_EVS = ['mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu'];
  const isOwnControl = (t) => !!(t && t.closest && t.closest('#btn-whatis, #whatis-pop'));
  const pickHoverTarget = (el) => {
    const n = el && el.nodeType === 1 ? el : (el && el.parentElement);
    if (!n) return null;
    return n.closest('[data-kind],[data-lib],[data-user-lib-id],[data-whatis],[data-help],[data-tip],button,a,input,select,textarea,[role="button"],[role="menuitem"],[role="tab"],.tile,.tl-chip,.node,.viewcube,.section') || n;
  };
  function setHover(el) {
    if (whatIsHoverEl === el) return;
    if (whatIsHoverEl) whatIsHoverEl.classList.remove('whatis-hover');
    whatIsHoverEl = el && el !== document.body && el !== document.documentElement ? el : null;
    if (whatIsHoverEl) whatIsHoverEl.classList.add('whatis-hover');
  }
  function closeWhatIsPop() {
    if (whatIsPop) { whatIsPop.remove(); whatIsPop = null; }
    if (whatIsTargetEl) { whatIsTargetEl.classList.remove('whatis-target'); whatIsTargetEl = null; }
    whatIsLast = null;
  }
  function placeWhatIsPop(targetEl, pt) {
    if (!whatIsPop) return;
    const pr = whatIsPop.getBoundingClientRect();
    const tr = targetEl && targetEl.getBoundingClientRect ? targetEl.getBoundingClientRect() : null;
    const huge = !tr || !tr.width || !tr.height || (tr.width * tr.height > innerWidth * innerHeight * 0.45);
    let x, y;
    if (huge) {
      const px = pt && Number.isFinite(pt.x) && pt.x > 0 ? pt.x : innerWidth / 2;
      const py = pt && Number.isFinite(pt.y) && pt.y > 0 ? pt.y : innerHeight / 2;
      x = px + 14;
      y = py + 14;
      if (x + pr.width > innerWidth - 8) x = px - pr.width - 14;
      if (y + pr.height > innerHeight - 8) y = py - pr.height - 14;
    } else {
      x = tr.left + tr.width / 2 - pr.width / 2;
      y = tr.bottom + 10;
      if (y + pr.height > innerHeight - 8) y = tr.top - pr.height - 10;
      if (y < 8) {
        y = clamp(tr.top, 8, Math.max(8, innerHeight - pr.height - 8));
        x = tr.right + 10;
        if (x + pr.width > innerWidth - 8) x = tr.left - pr.width - 10;
      }
    }
    whatIsPop.style.left = clamp(x, 8, Math.max(8, innerWidth - pr.width - 8)) + 'px';
    whatIsPop.style.top = clamp(y, 8, Math.max(8, innerHeight - pr.height - 8)) + 'px';
  }
  function showWhatIsPop(targetEl, info, pt) {
    closeWhatIsPop();
    const markEl = targetEl && targetEl !== document.body && targetEl !== document.documentElement && targetEl.id !== 'viewport' && targetEl.tagName !== 'CANVAS' ? targetEl : null;
    if (markEl) { whatIsTargetEl = markEl; whatIsTargetEl.classList.add('whatis-target'); }
    const box = h('div', { id: 'whatis-pop', class: 'whatis-pop', role: 'dialog', 'aria-live': 'polite', 'aria-label': T('whatis.dialogAria') });
    const head = h('div', { class: 'whatis-head' });
    head.innerHTML = icon('help');
    head.append(h('strong', { class: 'whatis-title' }, info.title || T('whatis.genericTitle')));
    if (info.kbd) head.append(h('span', { class: 'kbd' }, info.kbd));
    const clsBtn = h('button', { type: 'button', id: 'whatis-close', class: 'whatis-close', 'aria-label': T('common.close') });
    clsBtn.innerHTML = icon('close');
    clsBtn.onclick = () => closeWhatIsPop();
    head.append(clsBtn);
    box.append(head, h('p', { class: 'whatis-text' }, info.text || T('whatis.genericFallback')));
    if (info.tip) box.append(h('p', { class: 'whatis-tip' }, h('b', null, T('whatis.tipPrefix') + ' '), info.tip));
    const exitBtn = h('button', { type: 'button', id: 'whatis-exit', class: 'btn small' }, T('whatis.exitBtn'));
    exitBtn.onclick = () => setWhatIs(false);
    box.append(h('div', { class: 'whatis-foot' }, h('span', null, T('whatis.footHint')), exitBtn));
    document.body.append(box);
    whatIsPop = box;
    placeWhatIsPop(targetEl, pt);
  }
  function fallbackDescribe(rawTarget) {
    const el = rawTarget && rawTarget.nodeType === 1 ? rawTarget : (rawTarget && rawTarget.parentElement);
    const tip = el && el.dataset ? el.dataset.tip : '';
    const lbl = (el && (el.getAttribute && (el.getAttribute('aria-label') || el.title))) || (el && el.textContent ? el.textContent.trim().slice(0, 60) : '');
    return {
      title: lbl || T('whatis.genericTitle'),
      text: tip ? T('whatis.tipFallback', { tip }) : T('whatis.genericFallback'),
      tip: '',
      kbd: el && el.dataset ? (el.dataset.kbd || '') : '',
      anchor: el,
    };
  }
  function explainTarget(rawTarget, clientX, clientY) {
    const el = rawTarget && rawTarget.nodeType === 1 ? rawTarget : (rawTarget && rawTarget.parentElement);
    if (!el) return;
    const info = (typeof Explain !== 'undefined' && Explain.describeElement) ? Explain.describeElement(el, clientX, clientY) : fallbackDescribe(el);
    showWhatIsPop(info.anchor || el, info, { x: clientX, y: clientY });
    whatIsLast = { el, x: clientX, y: clientY };
  }
  function blockEv(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  function onWhatIsPointerDown(e) {
    if (!whatIsOn || isOwnControl(e.target)) return;
    blockEv(e);
    whatIsHandledAt = performance.now();
    explainTarget(e.target, e.clientX, e.clientY);
  }
  function onWhatIsBlock(e) {
    if (!whatIsOn || isOwnControl(e.target)) return;
    blockEv(e);
  }
  function onWhatIsClick(e) {
    if (!whatIsOn || isOwnControl(e.target)) return;
    blockEv(e);
    if (performance.now() - whatIsHandledAt > 400) {
      const r = e.target && e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : null;
      const cx = (e.clientX || e.clientY) ? e.clientX : (r ? r.left + r.width / 2 : innerWidth / 2);
      const cy = (e.clientX || e.clientY) ? e.clientY : (r ? r.top + r.height / 2 : innerHeight / 2);
      explainTarget(e.target, cx, cy);
    }
  }
  function onWhatIsMove(e) {
    if (!whatIsOn) return;
    if (isOwnControl(e.target)) { setHover(null); return; }
    setHover(pickHoverTarget(e.target));
  }
  function onWhatIsKeyDown(e) {
    if (!whatIsOn) return;
    if (e.key === 'Escape') { blockEv(e); setWhatIs(false); return; }
    if ((e.key === 'Enter' || e.key === ' ') && !isOwnControl(e.target)) {
      blockEv(e);
      const r = e.target && e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : null;
      explainTarget(e.target, r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2);
    }
  }
  function syncWhatIsListeners(on) {
    const fn = on ? window.addEventListener : window.removeEventListener;
    fn.call(window, 'pointerdown', onWhatIsPointerDown, true);
    fn.call(window, 'click', onWhatIsClick, true);
    fn.call(window, 'pointermove', onWhatIsMove, true);
    fn.call(window, 'keydown', onWhatIsKeyDown, true);
    for (const ev of WHATIS_BLOCK_EVS) fn.call(window, ev, onWhatIsBlock, true);
  }
  function setWhatIs(on) {
    const next = !!on;
    if (whatIsOn === next) return whatIsOn;
    whatIsOn = next;
    document.body.classList.toggle('whatis-mode', whatIsOn);
    const btn = $('#btn-whatis');
    if (btn) {
      btn.setAttribute('aria-pressed', String(whatIsOn));
      btn.classList.toggle('active', whatIsOn);
    }
    syncWhatIsListeners(whatIsOn);
    if (whatIsOn) {
      hideTip();
      clearTimeout(tipTimer);
      whatIsHintHtml = T('whatis.hintActive');
      hint(whatIsHintHtml);
    } else {
      setHover(null);
      closeWhatIsPop();
      if (hintOverride === whatIsHintHtml) hint(null);
      whatIsHintHtml = null;
    }
    return whatIsOn;
  }
  function toggleWhatIs() { return setWhatIs(!whatIsOn); }
  function refreshWhatIs() {
    if (!whatIsOn) return;
    whatIsHintHtml = T('whatis.hintActive');
    hint(whatIsHintHtml);
    if (whatIsLast) {
      if (whatIsLast.el && document.body.contains(whatIsLast.el)) explainTarget(whatIsLast.el, whatIsLast.x, whatIsLast.y);
      else closeWhatIsPop();
    }
  }
  return { toast, mute, modal, confirm, prompt, menu, closeMenu, pop, closePop, openRadial, closeRadial, toggleRadial, finishRadialHold, radialItems, setRadialItems, resetRadial, radialCatalog, radialDialog, get radialOpen() { return !!radialEl; }, get menuOpen() { return !!openMenu; }, get popOpen() { return !!openPop; }, lastPointer: () => ({ ...lastPtr }), focusables, ensureA11yLabels, initA11y, initTips, helpKey, hideTip, setWhatIs, toggleWhatIs, closeWhatIsPop, refreshWhatIs, get whatIsActive() { return whatIsOn; }, hasTouch, isTablet, syncTablet, initTablet, hint, renderHint, loading, busy, numField, selectField, textField };
})();

