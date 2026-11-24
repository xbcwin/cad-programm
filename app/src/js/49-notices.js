// ================= Meldungs-Zentrale (BE-25): Fehler & Hinweise der Sitzung =================
const Notices = (() => {
  const MAX = 200;
  const ev = makeEmitter();
  let list = [];
  let filter = 'all'; // 'all' | 'error' | 'info'
  let open = false;
  let popEl = null;

  function unreadCount() {
    let n = 0;
    for (const e of list) if (!e.read) n++;
    return n;
  }

  function errorCount() {
    let n = 0;
    for (const e of list) if (e.level === 'error') n++;
    return n;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function canJump(e) {
    if (!e) return false;
    if (typeof e.onJump === 'function') return true;
    return !!e.itemId;
  }

  function push({ level = 'info', text, title = '', hint = '', itemId = null, docId = null, code = null, source = 'app', onJump = null } = {}) {
    const cleanText = String(text ?? '').trim();
    if (!cleanText) return null;
    const normLevel = level === 'error' || level === 'warn' ? level : 'info';
    let itemTitle = String(title ?? '').trim();
    if (!itemTitle && itemId && typeof Model !== 'undefined' && typeof App !== 'undefined' && App.doc) {
      const f = Model.find(App.doc, itemId);
      if (f) itemTitle = Model.label(f.item);
    }
    const now = Date.now();
    const docKey = docId || (typeof App !== 'undefined' && App.doc && App.doc.id) || null;
    const dup = list.find((x) =>
      x.level === normLevel &&
      (x.itemId || null) === (itemId || null) &&
      (x.code || null) === (code || null) &&
      x.text === cleanText &&
      now - x.t < 2000
    );
    if (dup) {
      dup.t = now;
      if (open) dup.read = true;
      updateBell();
      if (open) renderBody();
      ev.emit('change');
      return dup;
    }
    const entry = {
      id: uid('nt'),
      t: now,
      level: normLevel,
      title: itemTitle,
      text: cleanText,
      hint: String(hint || '').trim(),
      itemId: itemId || null,
      docId: docKey,
      code: code || null,
      source,
      onJump: typeof onJump === 'function' ? onJump : null,
      read: !!open,
    };
    list.unshift(entry);
    if (list.length > MAX) list.length = MAX;
    updateBell();
    if (open) renderBody();
    ev.emit('change');
    return entry;
  }

  function fromToast(text, opts = {}) {
    if (opts && opts.noNotice) return null;
    let level = null;
    if (opts.kind === 'bad') level = 'error';
    else if (opts.icon === 'warn') level = 'warn';
    else if (opts.icon === 'info' || opts.notice === true) level = 'info';
    if (!level) return null;
    return push({
      level,
      text,
      itemId: opts.itemId || null,
      code: opts.code || null,
      hint: opts.hint || '',
      source: 'toast',
      onJump: opts.onJump || null,
    });
  }

  function jumpTo(entryId) {
    const e = list.find((x) => x.id === entryId);
    if (!e) return false;
    if (typeof e.onJump === 'function') {
      UI.closePop();
      e.onJump();
      return true;
    }
    if (!e.itemId) return false;
    if (e.docId && App.doc && App.doc.id !== e.docId && Array.isArray(App.tabs)) {
      const tab = App.tabs.find((t) => t.docId === e.docId);
      if (tab) App.switchTab(tab.tabId);
    }
    const f = Model.find(App.doc, e.itemId);
    if (!f) {
      UI.toast(T('notices.gone'), { icon: 'info', noNotice: true });
      return false;
    }
    if (App.mode !== 'model' && typeof Commands !== 'undefined' && Commands.setMode) Commands.setMode('model');
    App.select([e.itemId]);
    const top = Model.topOf(App.doc, e.itemId);
    const topId = (top && top.id) || e.itemId;
    if (typeof Viewer !== 'undefined' && Viewer.nodes && Viewer.nodes.has(topId)) Viewer.fit(topId, false);
    UI.closePop();
    return true;
  }

  function syncAria() {
    const btn = $('#status-bell');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  function updateBell() {
    const btn = $('#status-bell');
    if (!btn) return;
    if (!btn.querySelector('svg')) {
      btn.innerHTML = icon('bell') + '<span class="bell-badge" id="status-bell-badge" hidden></span>';
    }
    const badge = btn.querySelector('#status-bell-badge');
    const unread = unreadCount();
    const errs = errorCount();
    const hasUnreadWarn = list.some((e) => !e.read && e.level === 'warn');
    const hasUnreadInfo = list.some((e) => !e.read && e.level === 'info');
    btn.classList.toggle('has-err', errs > 0);
    btn.classList.toggle('has-warn', errs === 0 && hasUnreadWarn);
    btn.classList.toggle('has-info', errs === 0 && !hasUnreadWarn && hasUnreadInfo);
    btn.classList.toggle('open', open);
    const countTxt = unread > 0 ? String(unread) : (errs > 0 ? String(errs) : '');
    if (badge) {
      badge.hidden = !countTxt;
      badge.textContent = countTxt;
    }
    const tip = unread > 0
      ? T('notices.bellTipCount', { n: unread })
      : errs > 0
        ? T('notices.bellTipErr', { n: errs })
        : T('notices.bellTip');
    btn.dataset.tip = tip;
    btn.setAttribute('aria-label', T('notices.bellAria'));
    syncAria();
  }

  function renderBody() {
    if (!popEl) return;
    popEl.innerHTML = '';

    const head = h('div', { class: 'nc-head' },
      h('b', { class: 'nc-title' }, T('notices.title')),
      h('button', {
        type: 'button',
        id: 'nc-clear',
        class: 'btn ghost small',
        disabled: !list.length,
        onclick: () => clear(),
      }, T('notices.clear'))
    );

    const seg = h('div', { class: 'seg nc-filter', role: 'group', 'aria-label': T('notices.title') });
    for (const [k, label] of [['all', T('notices.all')], ['error', T('notices.errors')], ['info', T('notices.hints')]]) {
      const b = h('button', {
        type: 'button',
        id: 'nc-filter-' + k,
        'aria-pressed': filter === k,
        onclick: () => { filter = k; renderBody(); },
      }, label);
      seg.append(b);
    }

    const shown = list.filter((e) => {
      if (filter === 'error') return e.level === 'error';
      if (filter === 'info') return e.level !== 'error';
      return true;
    });

    const ul = h('div', { class: 'nc-list', id: 'nc-list' });
    if (!shown.length) {
      const emptyKey = filter === 'error' ? 'notices.emptyErr' : filter === 'info' ? 'notices.emptyHints' : 'notices.empty';
      ul.append(h('div', { class: 'nc-empty' }, T(emptyKey)));
    } else {
      for (const e of shown) {
        const icName = e.level === 'error' ? 'warn' : e.level === 'warn' ? 'warn' : 'info';
        const ico = h('span', { class: 'nc-ico', 'aria-hidden': 'true' });
        ico.innerHTML = icon(icName);
        const top = h('div', { class: 'nc-row-head' },
          e.title ? h('b', { class: 'nc-row-title' }, e.title) : null,
          h('span', { class: 'nc-time' }, formatTime(e.t))
        );
        const body = h('div', { class: 'nc-row-body' },
          top,
          h('div', { class: 'nc-text' }, e.text),
          e.hint ? h('div', { class: 'nc-hint' }, e.hint) : null
        );
        if (canJump(e)) {
          body.append(h('div', { class: 'nc-actions' },
            h('button', {
              type: 'button',
              class: 'btn ghost small nc-jump',
              'data-tip': T('notices.jumpTip'),
              onclick: () => jumpTo(e.id),
            }, T('notices.jump'))
          ));
        }
        ul.append(h('div', { class: 'nc-row nc-' + e.level, dataset: { level: e.level, id: e.id } }, ico, body));
      }
    }

    popEl.append(head, seg, ul);
  }

  function openPop(anchor = $('#status-bell')) {
    if (!anchor) return false;
    for (const e of list) e.read = true;
    const box = h('div', { class: 'notice-center', id: 'notice-center', 'data-help': 'noticeCenter' });
    popEl = box;
    open = true;
    renderBody();
    const wrap = UI.pop(anchor, box, {
      alignRight: true,
      up: true,
      onClose: () => {
        open = false;
        popEl = null;
        updateBell();
      },
    });
    if (wrap) wrap.classList.add('notice-pop');
    updateBell();
    return true;
  }

  function close() {
    if (!open) return false;
    UI.closePop();
    return true;
  }

  function toggle(anchor = $('#status-bell')) {
    if (open) return close();
    return openPop(anchor);
  }

  function clear() {
    list = [];
    updateBell();
    if (open) renderBody();
    ev.emit('change');
  }

  function refreshUI() {
    updateBell();
    if (open) renderBody();
  }

  function init() {
    const btn = $('#status-bell');
    if (btn) btn.addEventListener('click', (e) => toggle(e.currentTarget));
    if (typeof App !== 'undefined' && App.on) {
      App.on('log', (e) => {
        if (e && e.kind === 'error') {
          const hint = typeof Log !== 'undefined' && Log.hint ? Log.hint(e.code) : '';
          push({ level: 'error', text: e.text, itemId: e.itemId || null, code: e.code || null, hint, source: 'kernel' });
        }
      });
      App.on('cancelled', () => {
        push({
          level: 'warn',
          title: T('status.calcCancelledTitle'),
          text: T('status.calcCancelledToast'),
          code: 'cancelled',
          source: 'calc',
        });
      });
      App.on('doc', refreshUI);
      App.on('results', refreshUI);
    }
    updateBell();
  }

  return {
    init,
    push,
    fromToast,
    jumpTo,
    open: openPop,
    close,
    toggle,
    clear,
    refreshUI,
    entries: () => list.slice(),
    unreadCount,
    errorCount,
    get isOpen() { return open; },
    on: ev.on,
  };
})();
