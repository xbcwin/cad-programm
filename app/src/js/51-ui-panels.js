// ================= Oberfläche: Leisten, Verlauf, Einstellungen =================
const Panels = (() => {
  const expanded = new Set();
  const collapsedBodies = new Set();
  let leftTab = 'tree';
  let flyout = null;

  // ---------- Arbeitsflächen-Anordnung (BE-29) ----------
  const WS_KEY = 'tracery-arbeitsflaechen';
  const DEF_LAYOUT = {
    left: { open: true, width: 252, side: 'left' },
    right: { open: true, width: 292, side: 'right' },
    leftTab: 'tree',
  };
  let wsState = {
    active: 'Standard',
    current: {
      left: { ...DEF_LAYOUT.left },
      right: { ...DEF_LAYOUT.right },
      leftTab: DEF_LAYOUT.leftTab,
    },
    presets: [],
  };
  let wsDialogRefresh = null;

  const isValidSide = (s) => s === 'left' || s === 'right';
  const isValidLeftTab = (t) => t === 'tree' || t === 'params' || t === 'log';
  function normalizeLayout(src) {
    const s = src && typeof src === 'object' ? src : {};
    const sl = s.left && typeof s.left === 'object' ? s.left : {};
    const sr = s.right && typeof s.right === 'object' ? s.right : {};
    let lSide = isValidSide(sl.side) ? sl.side : (isValidSide(sr.side) ? (sr.side === 'left' ? 'right' : 'left') : 'left');
    let rSide = lSide === 'left' ? 'right' : 'left';
    if (isValidSide(sr.side) && !isValidSide(sl.side)) {
      rSide = sr.side;
      lSide = rSide === 'left' ? 'right' : 'left';
    }
    const lW = Number(sl.width), rW = Number(sr.width);
    return {
      left: {
        open: typeof sl.open === 'boolean' ? sl.open : true,
        width: Number.isFinite(lW) ? clamp(Math.round(lW), 180, 520) : DEF_LAYOUT.left.width,
        side: lSide,
      },
      right: {
        open: typeof sr.open === 'boolean' ? sr.open : true,
        width: Number.isFinite(rW) ? clamp(Math.round(rW), 200, 560) : DEF_LAYOUT.right.width,
        side: rSide,
      },
      leftTab: isValidLeftTab(s.leftTab) ? s.leftTab : 'tree',
    };
  }
  function getBuiltinWorkspaces() {
    return [
      { id: 'builtin-standard', name: T('ws.stdName'), builtin: true, layout: { left: { open: true, width: 252, side: 'left' }, right: { open: true, width: 292, side: 'right' }, leftTab: 'tree' } },
      { id: 'builtin-focus', name: T('ws.focusName'), builtin: true, layout: { left: { open: false, width: 252, side: 'left' }, right: { open: false, width: 292, side: 'right' }, leftTab: 'tree' } },
      { id: 'builtin-params', name: T('ws.paramsName'), builtin: true, layout: { left: { open: true, width: 300, side: 'left' }, right: { open: true, width: 320, side: 'right' }, leftTab: 'params' } },
    ];
  }
  function saveWorkspaces() {
    try {
      storageSet(WS_KEY, JSON.stringify({
        active: wsState.active,
        current: wsState.current,
        presets: wsState.presets,
      }));
    } catch (_) {}
  }
  function loadWorkspaces() {
    wsState.current = normalizeLayout(DEF_LAYOUT);
    wsState.active = T('ws.stdName');
    wsState.presets = [];
    try {
      const raw = storageGet(WS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      if (obj.current) wsState.current = normalizeLayout(obj.current);
      if (typeof obj.active === 'string' || obj.active === null) wsState.active = obj.active;
      if (Array.isArray(obj.presets)) {
        wsState.presets = obj.presets
          .filter((p) => p && typeof p.name === 'string' && p.name.trim())
          .map((p) => ({ id: typeof p.id === 'string' ? p.id : uid('ws'), name: p.name.trim(), layout: normalizeLayout(p.layout) }));
      }
    } catch (_) {}
    if (isValidLeftTab(wsState.current.leftTab)) leftTab = wsState.current.leftTab;
  }
  function getLayout() {
    return normalizeLayout({ ...wsState.current, leftTab });
  }
  function applyLayout() {
    const ws = $('#workspace');
    if (!ws) return;
    const cur = wsState.current;
    const swapped = cur.left.side === 'right';
    const drawing = typeof App !== 'undefined' && App.mode === 'drawing';
    ws.classList.toggle('hide-left', !cur.left.open);
    ws.classList.toggle('hide-right', !cur.right.open);
    ws.classList.toggle('panels-swapped', swapped);
    document.body.classList.toggle('panel-left-closed', !cur.left.open);
    document.body.classList.toggle('panel-right-closed', !cur.right.open);
    const effL = cur.left.open && !drawing;
    const effR = cur.right.open;
    const colL = swapped ? (effR ? cur.right.width + 'px' : '0px') : (effL ? cur.left.width + 'px' : '0px');
    const colR = swapped ? (effL ? cur.left.width + 'px' : '0px') : (effR ? cur.right.width + 'px' : '0px');
    ws.style.setProperty('--col-l', colL);
    ws.style.setProperty('--col-r', colR);
    const vw = (document.documentElement && document.documentElement.clientWidth) || innerWidth;
    const narrow = vw <= 900 || (typeof UI !== 'undefined' && UI.isTablet && UI.isTablet());
    const bl = $('#btn-left'), br = $('#btn-right');
    if (!narrow) {
      if (bl) bl.setAttribute('aria-expanded', String(cur.left.open));
      if (br) br.setAttribute('aria-expanded', String(cur.right.open));
    }
    const bw = $('#btn-workspace');
    if (bw) bw.dataset.tip = wsState.active ? `${T('ws.btnTip')} (${wsState.active})` : T('ws.btnTip');
    if (cur.leftTab && cur.leftTab !== leftTab) {
      leftTab = cur.leftTab;
      renderLeft();
    }
    if (wsDialogRefresh) wsDialogRefresh();
    setTimeout(() => {
      if (typeof Notes !== 'undefined' && Notes.place) Notes.place();
      placeCtx();
      if (typeof Viewer !== 'undefined' && Viewer.requestRender) Viewer.requestRender();
    }, 0);
  }
  function setPanel(which, patch) {
    if (which !== 'left' && which !== 'right') return false;
    const cur = getLayout();
    const p = patch && typeof patch === 'object' ? patch : {};
    if ('open' in p) cur[which].open = !!p.open;
    if ('width' in p && Number.isFinite(Number(p.width))) {
      cur[which].width = clamp(Math.round(Number(p.width)), which === 'left' ? 180 : 200, which === 'left' ? 520 : 560);
    }
    if ('side' in p && isValidSide(p.side)) {
      cur[which].side = p.side;
      cur[which === 'left' ? 'right' : 'left'].side = p.side === 'left' ? 'right' : 'left';
    }
    wsState.current = normalizeLayout(cur);
    wsState.active = null;
    saveWorkspaces();
    applyLayout();
    return true;
  }
  function swapSides() {
    const cur = getLayout();
    const nextSide = cur.left.side === 'right' ? 'left' : 'right';
    setPanel('left', { side: nextSide });
    UI.toast(T('ws.swappedToast'), { icon: 'info', ms: 1600 });
  }
  function saveWorkspace(name, opts = {}) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const layout = getLayout();
    const idx = wsState.presets.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase());
    let entry;
    if (idx >= 0) {
      wsState.presets[idx] = { ...wsState.presets[idx], name: clean, layout };
      entry = wsState.presets[idx];
    } else {
      entry = { id: uid('ws'), name: clean, layout };
      wsState.presets.push(entry);
    }
    wsState.current = normalizeLayout(layout);
    wsState.active = entry.name;
    saveWorkspaces();
    applyLayout();
    if (!opts.silent) UI.toast(T('ws.savedToast', { name: entry.name }), { icon: 'check', ms: 1800 });
    return entry;
  }
  function findWorkspace(nameOrId) {
    const key = String(nameOrId || '').trim();
    if (!key) return null;
    const low = key.toLowerCase();
    const custom = wsState.presets.find((p) => p.id === key || p.name.toLowerCase() === low);
    if (custom) return { ...custom, builtin: false };
    const builtins = getBuiltinWorkspaces();
    const bi = builtins.find((b) => b.id === key || b.name.toLowerCase() === low);
    if (bi) return bi;
    if (low === 'standard') return builtins[0];
    if (low === 'fokus' || low === 'focus') return builtins[1];
    return null;
  }
  function loadWorkspace(nameOrId, opts = {}) {
    const found = findWorkspace(nameOrId);
    if (!found) return false;
    wsState.current = normalizeLayout(found.layout);
    wsState.active = found.name;
    if (isValidLeftTab(wsState.current.leftTab)) leftTab = wsState.current.leftTab;
    saveWorkspaces();
    renderLeft();
    applyLayout();
    if (!opts.silent) UI.toast(T('ws.loadedToast', { name: found.name }), { icon: 'check', ms: 1800 });
    return true;
  }
  function deleteWorkspace(nameOrId) {
    const key = String(nameOrId || '').trim();
    if (!key) return false;
    const low = key.toLowerCase();
    const idx = wsState.presets.findIndex((p) => p.id === key || p.name.toLowerCase() === low);
    if (idx < 0) return false;
    const removed = wsState.presets.splice(idx, 1)[0];
    if (wsState.active && wsState.active.toLowerCase() === removed.name.toLowerCase()) wsState.active = null;
    saveWorkspaces();
    applyLayout();
    UI.toast(T('ws.deletedToast', { name: removed.name }), { icon: 'info', ms: 1800 });
    return true;
  }
  function listWorkspaces() {
    return [
      ...getBuiltinWorkspaces().map((b) => ({ ...b, layout: normalizeLayout(b.layout) })),
      ...wsState.presets.map((p) => ({ ...p, builtin: false, layout: normalizeLayout(p.layout) })),
    ];
  }
  function resetLayout() {
    return loadWorkspace('builtin-standard', { silent: true });
  }
  async function promptSaveWorkspace() {
    const curCustom = wsState.active && wsState.presets.some((p) => p.name === wsState.active) ? wsState.active : '';
    const name = await UI.prompt(T('ws.promptTitle'), T('ws.promptLabel'), curCustom, T('common.save'));
    if (!name || !name.trim()) return null;
    return saveWorkspace(name);
  }
  function workspaceMenu(anchor) {
    const cur = wsState.current;
    const all = listWorkspaces();
    const custom = all.filter((w) => !w.builtin);
    const builtins = all.filter((w) => w.builtin);
    const entries = [];
    for (const p of custom) {
      const act = wsState.active && wsState.active.toLowerCase() === p.name.toLowerCase();
      entries.push({
        id: 'ws-item-' + p.id,
        label: (act ? '✓ ' : '') + p.name,
        icon: 'layout',
        help: 'workspaceLayout',
        dataset: { wsName: p.name },
        run: () => loadWorkspace(p.id),
      });
    }
    if (custom.length) entries.push('-');
    for (const b of builtins) {
      const act = wsState.active && wsState.active.toLowerCase() === b.name.toLowerCase();
      entries.push({
        id: 'ws-item-' + b.id,
        label: (act ? '✓ ' : '') + b.name,
        icon: 'layout',
        help: 'workspaceLayout',
        run: () => loadWorkspace(b.id),
      });
    }
    entries.push(
      '-',
      { id: 'ws-menu-save', label: T('ws.saveAs'), icon: 'save', help: 'workspaceLayout', run: () => promptSaveWorkspace() },
      { id: 'ws-menu-manage', label: T('ws.manage'), icon: 'sliders', help: 'workspaceLayout', run: () => workspaceDialog() },
      '-',
      { id: 'ws-menu-left', label: (cur.left.open ? '✓ ' : '') + T('ws.toggleLeft'), icon: 'list', run: () => setPanel('left', { open: !cur.left.open }) },
      { id: 'ws-menu-right', label: (cur.right.open ? '✓ ' : '') + T('ws.toggleRight'), icon: 'sliders', run: () => setPanel('right', { open: !cur.right.open }) },
      { id: 'ws-menu-swap', label: T('ws.swapSides'), icon: 'replace', help: 'workspaceLayout', run: () => swapSides() }
    );
    return UI.menu(anchor, entries, { alignRight: true });
  }
  function workspaceDialog() {
    const wrap = h('div', { class: 'ws-dlg', id: 'workspace-dlg' });
    const renderDlg = () => {
      wrap.innerHTML = '';
      const cur = wsState.current;
      const panelSec = h('div', { class: 'ws-sec' }, h('div', { class: 'section-h' }, T('ws.dlgPanels')));
      const grid = h('div', { class: 'ws-panel-grid' });
      const makeCard = (which, title, minW, maxW) => {
        const st = cur[which];
        const card = h('div', { class: 'ws-panel-card' });
        const chk = h('input', { type: 'checkbox', id: `ws-${which}-open`, checked: !!st.open });
        chk.onchange = () => setPanel(which, { open: chk.checked });
        const head = h('label', { class: 'check ws-card-head' }, chk, h('b', null, title));
        const wInp = h('input', { type: 'number', id: `ws-${which}-width`, min: minW, max: maxW, step: 10, value: st.width, class: 'ws-w-inp' });
        wInp.onchange = () => { const v = parseFloat(wInp.value); if (Number.isFinite(v)) setPanel(which, { width: v }); };
        const sSel = h('select', { id: `ws-${which}-side`, class: 'ws-s-sel' },
          h('option', { value: 'left', ...(st.side === 'left' ? { selected: true } : {}) }, T('ws.sideLeft')),
          h('option', { value: 'right', ...(st.side === 'right' ? { selected: true } : {}) }, T('ws.sideRight')));
        sSel.onchange = () => setPanel(which, { side: sSel.value });
        card.append(
          head,
          h('div', { class: 'ws-card-row' }, h('span', null, T('ws.dlgWidth')), wInp),
          h('div', { class: 'ws-card-row' }, h('span', null, T('ws.dlgSide')), sSel)
        );
        return card;
      };
      grid.append(
        makeCard('left', T('ws.dlgLeftPanel'), 180, 520),
        makeCard('right', T('ws.dlgRightPanel'), 200, 560)
      );
      panelSec.append(grid);
      wrap.append(panelSec);

      const saveSec = h('div', { class: 'ws-sec' }, h('div', { class: 'section-h' }, T('ws.dlgSaveSec')));
      const inp = h('input', { type: 'text', id: 'ws-save-name', placeholder: T('ws.dlgSavePh'), autocomplete: 'off', spellcheck: 'false' });
      const saveBtn = h('button', { type: 'button', class: 'btn primary', id: 'ws-save-btn' }, T('common.save'));
      const doSave = () => {
        const nm = inp.value.trim();
        if (!nm) { inp.focus(); return; }
        saveWorkspace(nm);
        inp.value = '';
      };
      saveBtn.onclick = doSave;
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
      saveSec.append(h('div', { class: 'ws-save-row' }, inp, saveBtn));
      wrap.append(saveSec);

      const listSec = h('div', { class: 'ws-sec' }, h('div', { class: 'section-h' }, T('ws.dlgSavedSec')));
      const listEl = h('div', { class: 'ws-list', id: 'ws-list' });
      const all = listWorkspaces();
      for (const item of all) {
        const isActive = wsState.active && wsState.active.toLowerCase() === item.name.toLowerCase();
        const L = item.layout;
        const metaParts = [
          `${T('ws.dlgLeftPanel')}: ${L.left.open ? L.left.width + 'px' : T('ws.panelClosed')}`,
          `${T('ws.dlgRightPanel')}: ${L.right.open ? L.right.width + 'px' : T('ws.panelClosed')}`,
        ];
        if (L.left.side === 'right') metaParts.push(T('ws.swappedTag'));
        const row = h('div', { class: 'ws-row' + (isActive ? ' active' : ''), dataset: { wsRow: item.name } });
        const info = h('div', { class: 'ws-row-info' },
          h('div', { class: 'ws-row-head' },
            h('b', null, item.name),
            item.builtin ? h('span', { class: 'ws-badge' }, T('ws.dlgBuiltin')) : null,
            isActive ? h('span', { class: 'ws-badge active' }, T('ws.dlgActive')) : null),
          h('div', { class: 'ws-row-meta mono' }, metaParts.join(' · ')));
        const acts = h('div', { class: 'ws-row-acts' });
        const bl = h('button', { type: 'button', class: 'btn small' + (isActive ? '' : ' primary'), dataset: { wsLoad: item.id } }, T('ws.dlgLoad'));
        bl.onclick = () => loadWorkspace(item.id);
        acts.append(bl);
        if (!item.builtin) {
          const bd = h('button', { type: 'button', class: 'btn small ghost', dataset: { wsDel: item.id }, 'aria-label': T('common.delete') });
          bd.innerHTML = icon('trash');
          bd.onclick = () => deleteWorkspace(item.id);
          acts.append(bd);
        }
        row.append(info, acts);
        listEl.append(row);
      }
      if (!wsState.presets.length) {
        listEl.append(h('div', { class: 'hint-box' }, T('ws.dlgNoCustom')));
      }
      listSec.append(listEl);
      wrap.append(listSec);
    };
    wsDialogRefresh = renderDlg;
    renderDlg();
    return UI.modal({
      title: T('ws.dlgTitle'),
      body: wrap,
      wide: true,
      actions: [
        { label: T('ws.swapSides'), run: () => { swapSides(); return false; } },
        { label: T('ws.resetBtn'), run: () => { resetLayout(); UI.toast(T('ws.loadedToast', { name: T('ws.stdName') }), { icon: 'check', ms: 1600 }); return false; } },
        { label: T('common.close'), primary: true },
      ],
      onClose: () => { wsDialogRefresh = null; },
    });
  }
  function initResizers() {
    for (const [which, hostSel, rid] of [['left', '#left', 'resizer-left'], ['right', '#right', 'resizer-right']]) {
      const host = $(hostSel);
      if (!host || host.querySelector('#' + rid)) continue;
      const bar = h('div', { class: 'panel-resizer', id: rid, role: 'separator', 'aria-orientation': 'vertical', 'data-help': 'workspaceLayout' });
      bar.addEventListener('dblclick', (e) => {
        e.preventDefault(); e.stopPropagation();
        setPanel(which, { width: DEF_LAYOUT[which].width });
      });
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX;
        const startW = wsState.current[which].width;
        const side = wsState.current[which].side;
        const sign = side === 'left' ? 1 : -1;
        const minW = which === 'left' ? 180 : 200;
        const maxW = which === 'left' ? 520 : 560;
        bar.classList.add('dragging');
        document.body.classList.add('resizing-panel');
        let lastW = startW;
        const onMove = (ev) => {
          lastW = clamp(Math.round(startW + (ev.clientX - startX) * sign), minW, maxW);
          wsState.current[which].width = lastW;
          applyLayout();
        };
        const onUp = () => {
          bar.classList.remove('dragging');
          document.body.classList.remove('resizing-panel');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          if (lastW !== startW) {
            wsState.active = null;
            saveWorkspaces();
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
      host.append(bar);
    }
  }

  // ---------- Werkzeugleiste ----------
  // einfache Oberfläche: diese Grundkörper und Bauteile bleiben sichtbar
  const SIMPLE_KINDS = ['box', 'cylinder', 'sphere', 'cone', 'tube', 'hemisphere'];
  const SIMPLE_PARTS = ['screwHole', 'nutTrap', 'slotHole', 'zipTie', 'hinge'];
  function renderTools() {
    const el = $('#tools'); el.innerHTML = '';
    const btn = (id, ic, label, tip, kbd, onClick, cls = '', short = '') => {
      const b = h('button', { type: 'button', class: 'tool ' + cls, id, 'data-tip': tip, 'data-kbd': kbd || null, 'aria-label': label });
      // langer und kurzer Name: schmale Fenster zeigen den kurzen
      b.innerHTML = icon(ic) + (short ? `<span class="l-full">${label}</span><span class="l-short">${short}</span>` : `<span>${label}</span>`);
      b.addEventListener('click', onClick);
      el.append(b); return b;
    };
    if (App.mode === 'model') {
      Toolbar.renderModelTools(el);
    } else {
      const sheetBtn = btn('t-sheet', 'sheet', T('tool.sheet'), T('tool.sheetTip'), '', (e) => Drawing.sheetMenu(e.currentTarget));
      sheetBtn.dataset.help = 'drawingFormat';
      const viewBtn = btn('t-view-add', 'cube', T('tool.viewAdd'), T('tool.viewAddTip'), '', (e) => Drawing.viewMenu(e.currentTarget));
      viewBtn.dataset.help = 'drawingViews';
      const secBtn = btn('t-section', 'section', T('tool.dsection'), T('tool.dsectionTip'), 'S', () => Drawing.tool('section'), Drawing.activeTool === 'section' ? 'active' : '');
      secBtn.dataset.help = 'drawingSection';
      secBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'section'));
      const detBtn = btn('t-detail', 'zoomIn', T('tool.detail'), T('tool.detailTip'), 'Z', () => Drawing.tool('detail'), Drawing.activeTool === 'detail' ? 'active' : '');
      detBtn.dataset.help = 'drawingDetail';
      detBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'detail'));
      const dimBtn = btn('t-dim', 'dim', T('tool.dim'), T('tool.dimTip'), 'D', () => Drawing.tool('dim'), Drawing.activeTool === 'dim' && Drawing.dimMode === 'lin' ? 'active' : '');
      dimBtn.dataset.help = 'drawingDimTypes';
      dimBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'dim' && Drawing.dimMode === 'lin'));
      const dimKindBtn = btn('t-dim-kind', 'dim', T('tool.dimKinds'), T('tool.dimKindsTip'), '', (e) => Drawing.dimMenu(e.currentTarget), Drawing.activeTool === 'dim' && Drawing.dimMode !== 'lin' ? 'active' : '');
      dimKindBtn.dataset.help = 'drawingDimTypes';
      dimKindBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'dim' && Drawing.dimMode !== 'lin'));
      btn('t-autodim', 'target', T('tool.autodim'), T('tool.autodimTip'), '', () => Drawing.autoDims(), '', T('tool.autodimShort'));
      const noteBtn = btn('t-note', 'noteText', T('tool.dnote'), T('tool.dnoteTip'), 'N', () => Drawing.tool('note'), Drawing.activeTool === 'note' ? 'active' : '');
      noteBtn.dataset.help = 'drawingLeader';
      noteBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'note'));
      const balBtn = btn('t-balloons', 'list', T('tool.balloons'), T('tool.balloonsTip'), '', (e) => Drawing.bomMenu(e.currentTarget), Drawing.activeTool === 'balloon' ? 'active' : '', T('tool.balloonsShort'));
      balBtn.dataset.help = 'drawingBalloons';
      balBtn.setAttribute('aria-pressed', String(Drawing.activeTool === 'balloon'));
      btn('t-draw', 'line', T('tool.draw2d'), T('tool.draw2dTip'), '', (e) => Drawing.drawMenu(e.currentTarget));
      el.append(h('div', { class: 'sep' }));
      const dexBtn = btn('t-dexport', 'export', T('tool.dexport'), T('tool.dexportTip'), '', (e) => Drawing.exportMenu(e.currentTarget), 'primary', T('tool.dexportShort'));
      dexBtn.dataset.help = 'drawingExportDxf';
    }
  }
  // weiche Trennstellen für lange Wörter auf schmalen Kacheln (nur Anzeige)
  const HY = { Schraubenloch: 'Schrauben\u00ADloch', Mutternfalle: 'Muttern\u00ADfalle', Gewindeeinsatz: 'Gewinde\u00ADeinsatz', Schnapphaken: 'Schnapp\u00ADhaken', Halbkugel: 'Halb\u00ADkugel' };
  const hyph = (s) => HY[s] || s;
  const MAT_CATS = ['Metalle', 'Kunststoffe', 'Faserverbund', 'Holz & Platten'];
  function materialOptions(extra = []) {
    const out = [...extra];
    for (const cat of MAT_CATS) {
      const items = MATERIALS.filter((m) => m.cat === cat);
      if (items.length) out.push({ group: T('panel.matCat.' + cat), options: items.map((m) => [m.k, `${m.k} · ${fmtFixed(m.rho, 2)} g/cm³`]) });
    }
    const rest = MATERIALS.filter((m) => !MAT_CATS.includes(m.cat));
    if (rest.length) out.push({ group: T('panel.matCat.other'), options: rest.map((m) => [m.k, `${m.k} · ${fmtFixed(m.rho, 2)} g/cm³`]) });
    return out;
  }
  function materialInfoBox(mat, id) {
    if (!mat) return h('div', { id, hidden: true });
    const parts = [T('panel.matInfoDensity', { rho: fmtFixed(mat.rho, 2) })];
    if (mat.e != null) parts.push(T('panel.matInfoEMod', { e: fmt(mat.e, 1) }));
    if (mat.rm != null) parts.push(T('panel.matInfoRm', { rm: fmt(mat.rm, 0) }));
    const srcHtml = mat.src ? `<br><span style="color:var(--muted)">${esc(T('panel.matInfoSource', { src: mat.src }))}</span>` : '';
    return h('div', { class: 'hint-box', id, style: { marginTop: '6px' }, html: `<b>${esc(mat.name || mat.k)}</b><br>${parts.join(' · ')}${srcHtml}` });
  }
  function closeFlyout(restore = false) {
    if (!flyout) return;
    const prev = flyout.btn;
    flyout.el.remove();
    prev && prev.setAttribute('aria-expanded', 'false');
    if (flyout.onKey) document.removeEventListener('keydown', flyout.onKey, true);
    flyout = null;
    document.removeEventListener('pointerdown', flyOutside, true);
    if (restore && prev && prev.isConnected && typeof prev.focus === 'function') {
      try { prev.focus({ preventScroll: true }); } catch (_) { prev.focus(); }
    }
  }
  function flyOutside(e) { if (e.target && e.target.closest && e.target.closest('#btn-whatis, #whatis-pop')) return; if (flyout && !flyout.el.contains(e.target) && !(flyout.btn && flyout.btn.contains(e.target))) closeFlyout(); }
  function toggleFlyout(kind, btn) {
    if (flyout && flyout.kind === kind) { closeFlyout(); return; }
    closeFlyout();
    const flyTitle = kind === 'bodies' ? T('tool.fly.bodiesTitle') : kind === 'drone' ? T('tool.drone') : T('tool.fly.partsTitle');
    const el = h('div', { class: 'flyout', role: 'dialog', 'aria-label': flyTitle, tabindex: '-1' });
    if (kind === 'bodies') {
      el.append(h('h3', null, T('tool.fly.bodiesTitle')));
      const tiles = h('div', { class: 'tiles' });
      for (const k of PRIMITIVE_ORDER) {
        const t = h('div', { class: 'tile' + (SIMPLE_KINDS.includes(k) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-kind': k, 'aria-label': KINDS[k].label, 'data-tip': T('tool.fly.tileTip') });
        t.innerHTML = primitiveSVG(k); t.append(h('span', { class: 'lbl' }, hyph(KINDS[k].label)));
        Place.bindTile(t, { kind: k });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); Actions.addPrimitive(k); closeFlyout(); } });
        tiles.append(t);
      }
      el.append(tiles);
      const row = h('div', { class: 'btn-row' });
      const holeBtn = h('button', { type: 'button', class: 'btn small', 'data-whatis': 'cylHole' }); holeBtn.innerHTML = icon('hole') + esc(T('tool.fly.cylHole'));
      holeBtn.onclick = () => { Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }); closeFlyout(); };
      const boxHole = h('button', { type: 'button', class: 'btn small', 'data-whatis': 'boxHole' }); boxHole.innerHTML = icon('hole') + esc(T('tool.fly.boxHole'));
      boxHole.onclick = () => { Actions.addPrimitive('box', { role: 'hole', name: 'Aussparung', p: { w: 10, d: 10, h: 30 } }); closeFlyout(); };
      const routeBtn = h('button', { type: 'button', class: 'btn small pro', id: 'add-route', 'data-help': 'route3d' }); routeBtn.innerHTML = icon('sweep') + esc(T('tool.fly.route3d'));
      routeBtn.onclick = () => { closeFlyout(); Features.route3d(); };
      const helixBtn = h('button', { type: 'button', class: 'btn small', id: 'add-helix', 'data-help': 'helix' }); helixBtn.innerHTML = icon('helix') + esc(ViewPrefs.simple ? T('tool.fly.springSimple') : T('tool.fly.helix'));
      helixBtn.onclick = () => { closeFlyout(); Features.helix(); };
      const bossBtn = h('button', { type: 'button', class: 'btn small', id: 'add-boss', 'data-help': 'boss' }); bossBtn.innerHTML = icon('boss') + esc(T('tool.fly.boss'));
      bossBtn.onclick = () => { closeFlyout(); Features.startBoss(); };
      const lipBtn = h('button', { type: 'button', class: 'btn small', id: 'add-lip-groove', 'data-help': 'lipGroove' }); lipBtn.innerHTML = icon('lipGroove') + esc(T('tool.fly.lipGroove'));
      lipBtn.onclick = () => { closeFlyout(); Features.startLipGroove(); };
      const deformBtn = h('button', { type: 'button', class: 'btn small pro', id: 'add-deform', 'data-help': 'deform' }); deformBtn.innerHTML = icon('deform') + esc(T('tool.fly.deform'));
      deformBtn.onclick = () => { closeFlyout(); Features.deform(); };
      row.append(holeBtn, boxHole, routeBtn, helixBtn, bossBtn, lipBtn, deformBtn); el.append(row);
      el.append(h('div', { class: 'foot' }, T('tool.fly.bodiesFoot')));
    } else if (kind === 'drone') {
      el.classList.add('drone');
      DroneUI.flyout(el);
    } else {
      el.classList.add('parts');
      const makeTile = (d) => {
        const t = h('div', { class: 'tile' + (d.role === 'hole' ? ' hole-part' : '') + (SIMPLE_PARTS.includes(d.lib) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-lib': d.lib, 'aria-label': d.label, 'data-tip': d.desc, 'data-help': HELP[d.lib] ? d.lib : null });
        t.innerHTML = partSVG(d); t.append(h('span', { class: 'lbl' }, hyph(d.label)), h('span', { class: 'role' }, d.role === 'hole' ? T('common.hole') : T('common.body')));
        Place.bindTile(t, { part: d });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); Actions.addPart(d, libDefaults(d)); closeFlyout(); } });
        return t;
      };
      const base = LIB.filter((x) => !x.buy && !x.drone && !x.std);
      const stds = LIB.filter((x) => !x.buy && !x.drone && x.std);
      el.append(h('h3', null, T('tool.fly.partsTitle')));
      const tiles = h('div', { class: 'tiles' });
      for (const d of base) tiles.append(makeTile(d));
      el.append(tiles);
      if (stds.length) {
        el.append(h('h3', { class: 'pro' }, T('fly.stdParts')));
        const stdTiles = h('div', { class: 'tiles pro' });
        for (const d of stds) stdTiles.append(makeTile(d));
        el.append(stdTiles);
      }
      el.append(h('h3', { id: 'my-parts-head', 'data-help': 'userLibrary' }, T('fly.myParts')));
      const myGrid = h('div', { class: 'tiles user-tiles', id: 'my-parts-grid' });
      const renderMyParts = () => {
        myGrid.innerHTML = '';
        const list = UserLib.list();
        if (!list.length) {
          myGrid.append(h('div', { class: 'hint-box', style: { gridColumn: '1 / -1' } }, T('fly.myPartsEmpty')));
          return;
        }
        for (const entry of list) {
          const pCount = Array.isArray(entry.params) ? entry.params.length : 0;
          const tipTxt = entry.desc || (pCount ? (pCount === 1 ? T('fly.myPartsTipDimsOne') : T('fly.myPartsTipDimsMany', { n: pCount })) : T('fly.myPartsTip'));
          const tile = h('div', { class: 'tile user-tile' + (entry.role === 'hole' ? ' hole-part' : ''), role: 'button', tabindex: '0', 'aria-label': entry.name, dataset: { userLibId: entry.id }, 'data-tip': tipTxt, 'data-help': 'userLibrary' });
          tile.append(h('div', { class: 'ul-thumb-wrap', html: UserLib.thumbHTML(entry) }), h('span', { class: 'lbl' }, entry.name), h('span', { class: 'role' }, pCount ? (pCount === 1 ? T('fly.myPartsOneDim') : T('fly.myPartsManyDims', { n: pCount })) : (entry.role === 'hole' ? T('common.hole') : T('common.body'))));
          const delBtn = h('button', { type: 'button', class: 'ul-del', 'aria-label': T('fly.myPartsRemove'), 'data-tip': T('fly.myPartsRemove') });
          delBtn.innerHTML = icon('trash');
          delBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
          delBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            UserLib.remove(entry.id);
            renderMyParts();
            UI.toast(T('fly.myPartsRemoved', { name: entry.name }), { icon: 'info' });
          });
          tile.append(delBtn);
          Place.bindTile(tile, { userPart: entry });
          tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); UserLib.insert(entry); closeFlyout(); } });
          tile.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            UI.menu(tile, [
              { icon: 'plus', label: T('fly.myPartsInsert'), run: () => { UserLib.insert(entry); closeFlyout(); } },
              { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('fly.myPartsRenameTitle'), T('common.name'), entry.name, T('common.rename')); if (n && n.trim()) { UserLib.rename(entry.id, n.trim()); renderMyParts(); } } },
              '-',
              { icon: 'trash', label: T('common.remove'), run: () => { UserLib.remove(entry.id); renderMyParts(); } },
            ]);
          });
          myGrid.append(tile);
        }
      };
      renderMyParts();
      el.append(myGrid);
      el.append(h('div', { class: 'foot' }, T('tool.fly.partsFoot')));
    }
    $('#center').append(el);
    const anc = btn || $('#t-parts') || $('#t-body');
    const br = anc ? anc.getBoundingClientRect() : { left: 16 }, cr = $('#center').getBoundingClientRect();
    el.style.left = clamp(br.left - cr.left, 8, cr.width - el.offsetWidth - 8) + 'px'; el.style.top = '8px';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    const onKey = (e) => {
      if (!flyout || flyout.el !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFlyout(true); }
    };
    flyout = { el, btn, kind, onKey };
    el.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('pointerdown', flyOutside, true), 0);
  }

  // ---------- Verlauf (links) ----------
  function renderLeft() {
    const body = $('#left-body'); body.innerHTML = '';
    $('#lt-tree').setAttribute('aria-selected', leftTab === 'tree'); $('#lt-params').setAttribute('aria-selected', leftTab === 'params'); $('#lt-log').setAttribute('aria-selected', leftTab === 'log');
    if (leftTab === 'tree') renderTree(body); else if (leftTab === 'log') renderLog(body); else renderParams(body);
  }
  // ---------- Erste Schritte (nur in der einfachen Oberfläche): hakt sich selbst ab ----------
  const FS_KEY = 'tracery-erste-schritte';
  const fsGet = () => { try { return JSON.parse(localStorage.getItem(FS_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const fsSet = (o) => { try { localStorage.setItem(FS_KEY, JSON.stringify({ ...fsGet(), ...o })); } catch (_) {} };
  function firstStepsState() {
    const all = []; Model.walk(App.doc.items, (it) => { all.push(it); });
    const plain = (it) => it.kind !== 'group' && it.kind !== 'part' && KINDS[it.kind] && KINDS[it.kind].params;
    const sized = all.some((it) => plain(it) && KINDS[it.kind].params.some((q) => typeof q.def === 'number' && it.p && it.p[q.k] !== undefined && String(it.p[q.k]) !== String(q.def)));
    return { body: all.some((it) => it.kind !== 'group' && it.role !== 'hole'), size: sized, hole: all.some((it) => it.role === 'hole'), save: !!fsGet().saved };
  }
  function firstSteps() {
    if (!ViewPrefs.simple || fsGet().off) return null;
    const st = firstStepsState();
    const steps = [
      ['body', T('left.fs.body'), T('left.fs.bodyHow'), () => toggleFlyout('bodies', $('#t-body'))],
      ['size', T('left.fs.size'), T('left.fs.sizeHow'), null],
      ['hole', T('left.fs.hole'), T('left.fs.holeHow'), null],
      ['save', T('left.fs.save'), T('left.fs.saveHow'), () => Print.exportDialog()],
    ];
    const n = steps.filter(([k]) => st[k]).length;
    const box = h('div', { class: 'first-steps', id: 'first-steps' });
    const x = h('button', { type: 'button', class: 'fs-x', 'aria-label': T('left.fs.hideAria'), 'data-tip': T('left.fs.hideTip') }); x.innerHTML = icon('close');
    x.onclick = () => { fsSet({ off: true }); renderLeft(); };
    box.append(h('div', { class: 'fs-head' }, h('b', null, T('left.fs.title')), h('span', { class: 'fs-n', id: 'fs-n' }, T('left.fs.count', { n })), x));
    steps.forEach(([k, t, how, run], i) => {
      const row = h('div', { class: 'fs-row' + (st[k] ? ' done' : ''), 'data-step': k });
      const mark = h('span', { class: 'fs-mark', 'aria-hidden': 'true' }); if (st[k]) mark.innerHTML = icon('check'); else mark.textContent = String(i + 1);
      row.append(mark, h('span', { class: 'grow' }, t));
      if (!st[k]) { const b = h('button', { type: 'button', class: 'btn small ghost', 'data-how': k }, T('left.fs.how')); b.onclick = () => { UI.toast(how, { icon: 'info', ms: 6000 }); if (run) run(); }; row.append(b); }
      box.append(row);
    });
    if (n === 4) box.append(h('div', { class: 'ok-box', id: 'fs-done' }, T('left.fs.done')));
    return box;
  }
  function firstStepDone(k) { fsSet({ [k]: true }); if (leftTab === 'tree') renderLeft(); }
  let dragInfo = null;
  function clearDropClasses() {
    for (const n of document.querySelectorAll('#left-body .node')) {
      n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad', 'dragging');
      n.removeAttribute('title');
    }
  }
  // Suchen und Filtern im Verlauf (BE-09)
  let treeFilter = '', treeKind = 'all';
  const getTfKinds = () => [['all', T('left.tree.kindAll')], ['solid', T('left.tree.kindSolid')], ['hole', T('left.tree.kindHole')], ['hidden', T('left.tree.kindHidden')], ['err', T('left.tree.kindErr')], ['note', T('left.tree.kindNote')], ['ai', T('left.tree.kindAi')]];
  function treeMatch(it) {
    const q = treeFilter.trim().toLowerCase();
    if (q) {
      const kl = it.kind === 'part' ? (LIBMAP[it.p && it.p.lib] || {}).label || '' : (KINDS[it.kind] || {}).label || '';
      const bodyHit = (it.bodies || []).some((b) => b && (b.name || '').toLowerCase().includes(q));
      if (!(Model.label(it).toLowerCase().includes(q) || kl.toLowerCase().includes(q) || (it.note || '').toLowerCase().includes(q) || bodyHit)) return false;
    }
    if (treeKind === 'solid') return it.role !== 'hole' && it.kind !== 'group';
    if (treeKind === 'hole') return it.role === 'hole';
    if (treeKind === 'hidden') return !!it.hidden || (it.bodies || []).some((b) => b && b.hidden);
    if (treeKind === 'err') return App.errorsFor(it.id).length > 0 || RefFix.hasBrokenRef(it.id);
    if (treeKind === 'note') return !!it.note;
    if (treeKind === 'ai') return !!it.ai;
    return true;
  }
  const filtering = () => !!treeFilter.trim() || treeKind !== 'all';
  function treeFilterBar(total) {
    const inp = h('input', { type: 'search', id: 'tree-filter', value: treeFilter, placeholder: T('left.tree.searchPh'), 'aria-label': T('left.tree.searchAria'), autocomplete: 'off', spellcheck: 'false' });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { treeFilter = ''; renderLeft(); } });
    inp.addEventListener('input', () => { const pos = inp.selectionStart; treeFilter = inp.value; renderLeft(); const ni = $('#tree-filter'); if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (_) {} } });
    const sel = h('select', { id: 'tree-kind', 'aria-label': T('left.tree.filterAria') }); for (const [k, l] of getTfKinds()) sel.append(h('option', { value: k, ...(k === treeKind ? { selected: true } : {}) }, l));
    sel.onchange = () => { treeKind = sel.value; renderLeft(); };
    return h('div', { class: 'tree-filter', 'data-help': 'treeFilter' }, inp, sel);
  }
  function openBodyColorPop(anchor, itemId, bodyIdx, curColor, hasOwnColor) {
    const box = h('div', { class: 'body-color-pop' });
    box.append(h('div', { class: 'section-h' }, T('left.tree.bodyColorTitle')));
    const row = h('div', { class: 'colors' });
    for (const c of COLORS) {
      const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': c.c === curColor ? 'true' : 'false', style: { background: c.c } });
      b.onclick = () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: c.c }); };
      row.append(b);
    }
    const free = h('input', { type: 'color', class: 'body-color-inp', value: /^#[0-9a-f]{6}$/i.test(curColor || '') ? curColor : '#2f9e91', 'aria-label': T('panel.color.own') });
    free.addEventListener('change', () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: free.value.toLowerCase() }); });
    row.append(h('label', { class: 'color-free', 'data-tip': T('panel.color.anyTip') }, free));
    box.append(row);
    if (hasOwnColor) {
      const rst = h('button', { type: 'button', class: 'btn ghost small body-color-reset' });
      rst.innerHTML = icon('undo') + esc(T('left.tree.bodyColorOwn'));
      rst.onclick = () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: null }); };
      box.append(rst);
    }
    UI.pop(anchor, box);
  }
  async function renameBodyPrompt(itemId, bodyIdx, curName) {
    const n = await UI.prompt(T('left.tree.renameBody'), T('common.name'), curName, T('common.rename'));
    if (n !== null) Actions.setBody(itemId, bodyIdx, { name: n.trim() || null });
  }
  function renderBodiesList(it) {
    if (!App.doc.items.includes(it) || it.role === 'hole' || it.kind === 'ref' || App.mergedInto(it.id) || (it.p && it.p.assembly)) return null;
    const res = App.results.get(it.id);
    const evalBodies = res && res.data && res.data.bodies;
    if (!evalBodies || evalBodies.length < 2) return null;
    const meta = Model.matchBodies(it.bodies, evalBodies);
    const open = !collapsedBodies.has(it.id);
    const wrap = h('div', { class: 'bodies-wrap', 'data-bodies-of': it.id, 'data-help': 'bodyList' });
    const head = h('button', { type: 'button', class: 'bodies-head', 'aria-expanded': open ? 'true' : 'false' });
    const chev = h('span', { class: 'tw' + (open ? ' open' : '') }); chev.innerHTML = icon('chevR');
    head.append(chev, h('span', null, T('left.tree.bodiesHead', { n: evalBodies.length })));
    head.onclick = (e) => { e.stopPropagation(); open ? collapsedBodies.add(it.id) : collapsedBodies.delete(it.id); renderLeft(); };
    wrap.append(head);
    if (!open) return wrap;
    const list = h('div', { class: 'bodies-list' });
    const anyHidden = meta.some((m) => m && m.hidden);
    for (let bi = 0; bi < evalBodies.length; bi++) {
      const mb = meta[bi];
      const bName = (mb && mb.name) || (evalBodies[bi] && evalBodies[bi].name) || T('left.tree.bodyDefault', { n: bi + 1 });
      const ownCol = (mb && mb.color) || (evalBodies[bi] && evalBodies[bi].color) || null;
      const bCol = ownCol || it.color || '#2f9e91';
      const hidden = !!(mb && mb.hidden);
      const row = h('div', { class: 'body-row' + (hidden ? ' hidden-item' : ''), dataset: { item: it.id, body: String(bi) } });
      const colBtn = h('button', { type: 'button', class: 'swatch body-color-btn', style: { background: bCol }, 'aria-label': T('left.tree.changeColor'), 'data-tip': T('left.tree.changeColor') });
      colBtn.onclick = (e) => { e.stopPropagation(); openBodyColorPop(colBtn, it.id, bi, bCol, !!ownCol); };
      const nm = h('span', { class: 'nm', title: bName }, bName);
      const acts = h('span', { class: 'acts' });
      const ren = h('button', { type: 'button', class: 'body-rename', 'aria-label': T('common.rename'), 'data-tip': T('common.rename') });
      ren.innerHTML = icon('edit');
      ren.onclick = (e) => { e.stopPropagation(); renameBodyPrompt(it.id, bi, bName); };
      const eye = h('button', { type: 'button', class: 'body-eye', 'aria-label': hidden ? T('common.show') : T('common.hide'), 'data-tip': hidden ? T('common.show') : T('common.hide') });
      eye.innerHTML = icon(hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); Actions.setBody(it.id, bi, { hidden: !hidden }); };
      acts.append(ren, eye);
      row.append(colBtn, nm, acts);
      row.addEventListener('click', (e) => { e.stopPropagation(); if (!(App.sel.length === 1 && App.sel[0] === it.id)) App.select([it.id]); });
      row.addEventListener('dblclick', (e) => { e.stopPropagation(); renameBodyPrompt(it.id, bi, bName); });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: T('common.rename'), run: () => renameBodyPrompt(it.id, bi, bName) },
          { icon: 'sliders', label: T('left.tree.changeColor'), run: () => openBodyColorPop(colBtn, it.id, bi, bCol, !!ownCol) },
          { icon: hidden ? 'eye' : 'eyeOff', label: hidden ? T('common.show') : T('common.hide'), run: () => Actions.setBody(it.id, bi, { hidden: !hidden }) },
          { icon: 'focusView', label: T('left.tree.onlyThisBody'), run: () => Actions.showOnlyBody(it.id, bi) },
          ...(anyHidden ? [{ icon: 'eye', label: T('left.tree.showAllBodies'), run: () => Actions.showAllBodies(it.id) }] : []),
        ]);
      });
      row.addEventListener('pointerenter', () => { if (!hidden) Viewer.highlightBody(it.id, bi); });
      row.addEventListener('pointerleave', () => Viewer.highlightBody(null, null));
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  }
  function renderTree(body) {
    const items = App.doc.items;
    const isAsm = Model.isAssembly(App.doc);
    const fs = items.length <= 8 ? firstSteps() : null;
    if (fs) body.append(fs);
    if (!isAsm) {
      const hm = h('div', { class: 'history-mode-bar pro', id: 'history-mode-bar', 'data-help': 'noHistory' });
      const chk = h('input', { type: 'checkbox', id: 'chk-no-history', checked: !!App.doc.noHistory });
      chk.onchange = () => { Timeline.setNoHistory(chk.checked); };
      hm.append(h('label', { class: 'check' }, chk, h('span', null, T('left.tree.noHistoryLabel'))));
      body.append(hm);
    }
    if (App.doc.noHistory && !isAsm) {
      const box = h('div', { class: 'hint-box no-history-info', id: 'no-history-info' });
      box.append(h('div', { html: T('left.tree.noHistoryInfoHtml') }));
      const rb = h('button', { type: 'button', class: 'btn small pro', id: 'btn-resume-history', 'data-help': 'noHistory' }, T('tl.resumeBtn'));
      rb.onclick = () => Timeline.setNoHistory(false);
      box.append(rb);
      body.append(box);
      const ds = Datums.treeSection(); if (ds) body.append(ds);
      const as = Datums.axisTreeSection(); if (as) body.append(as);
      const ps = Datums.pointTreeSection(); if (ps) body.append(ps);
      const cs = Datums.csysTreeSection(); if (cs) body.append(cs);
      const pcs = typeof PointClouds !== 'undefined' && PointClouds.treeSection ? PointClouds.treeSection() : null; if (pcs) body.append(pcs);
      const ms = Measure.treeSection(); if (ms) body.append(ms);
      const js = typeof Joints !== 'undefined' && Joints.treeSection ? Joints.treeSection() : null; if (js) body.append(js);
      const apTree = typeof Assembly !== 'undefined' && Assembly.patternTreeSection ? Assembly.patternTreeSection() : null; if (apTree) body.append(apTree);
      const posSec = typeof Assembly !== 'undefined' && Assembly.poseTreeSection ? Assembly.poseTreeSection() : null; if (posSec) body.append(posSec);
      const pns = typeof Notes !== 'undefined' && Notes.treeSection ? Notes.treeSection() : null; if (pns) body.append(pns);
      return;
    }
    if (!items.length) {
      if (Model.isAssembly(App.doc)) {
        const emptyAsm = h('div', { class: 'empty-tree empty-asm' });
        emptyAsm.append(h('div', { html: T('left.tree.emptyAsmHtml') }));
        const ib = h('button', { type: 'button', class: 'btn primary small', id: 'btn-asm-empty-insert', 'data-help': 'insertPart' });
        ib.innerHTML = icon('parts') + esc(T('asm.insertBtn'));
        ib.onclick = () => Comp.insertPartDialog();
        const fb = h('button', { type: 'button', class: 'btn small', id: 'btn-asm-empty-insert-file', 'data-help': 'insertFromFile' });
        fb.innerHTML = icon('folder') + esc(T('asm.insertFromFileShort'));
        fb.onclick = () => Comp.insertFromFile();
        emptyAsm.append(h('div', { class: 'btn-row', style: { marginTop: '10px', justifyContent: 'center' } }, ib, fb));
        body.append(emptyAsm);
      } else {
        body.append(h('div', { class: 'empty-tree', html: T('left.tree.emptyHtml') }));
      }
      const ds = Datums.treeSection(); if (ds) body.append(ds);
      const as = Datums.axisTreeSection(); if (as) body.append(as);
      const ps = Datums.pointTreeSection(); if (ps) body.append(ps);
      const cs = Datums.csysTreeSection(); if (cs) body.append(cs);
      const pcs = typeof PointClouds !== 'undefined' && PointClouds.treeSection ? PointClouds.treeSection() : null; if (pcs) body.append(pcs);
      const ms = Measure.treeSection(); if (ms) body.append(ms);
      const js = typeof Joints !== 'undefined' && Joints.treeSection ? Joints.treeSection() : null; if (js) body.append(js);
      const apTree = typeof Assembly !== 'undefined' && Assembly.patternTreeSection ? Assembly.patternTreeSection() : null; if (apTree) body.append(apTree);
      const posSec = typeof Assembly !== 'undefined' && Assembly.poseTreeSection ? Assembly.poseTreeSection() : null; if (posSec) body.append(posSec);
      const pns = typeof Notes !== 'undefined' && Notes.treeSection ? Notes.treeSection() : null; if (pns) body.append(pns);
      return;
    }
    if (Model.isAssembly(App.doc)) {
      const hdr = h('div', { class: 'asm-tree-head' });
      const ib = h('button', { type: 'button', class: 'btn small primary', id: 'btn-asm-insert', 'data-help': 'insertPart' });
      ib.innerHTML = icon('parts') + esc(T('asm.insertBtn'));
      ib.onclick = () => Comp.insertPartDialog();
      hdr.append(h('span', { class: 'doc-type-badge asm' }, T('doc.assembly')), ib);
      body.append(hdr);
    }
    const V = Model.vars(App.doc).v;
    const selSet = new Set(App.sel);
    let nAll = 0; Model.walk(items, () => { nAll++; });
    if (nAll >= 6 || filtering()) body.append(treeFilterBar(nAll));
    // beim Filtern: Treffer und die Gruppen/Ordner, in denen sie liegen
    let show = null, hits = 0;
    const folders = App.doc.folders || [];
    const itemFolder = new Map();
    for (const fld of folders) for (const id of fld.ids || []) itemFolder.set(id, fld);
    if (filtering()) {
      show = new Set();
      const mark = (list, chain) => { for (const it of list) { if (treeMatch(it)) { hits++; show.add(it.id); for (const c of chain) show.add(c); } if (it.kind === 'group') mark(it.children || [], [...chain, it.id]); } };
      mark(items, []);
      const q = treeFilter.trim().toLowerCase();
      if (q && treeKind === 'all') {
        for (const fld of folders) if ((fld.name || '').toLowerCase().includes(q)) for (const id of fld.ids || []) show.add(id);
      }
      body.append(h('div', { class: 'tree-count', id: 'tree-count' }, hits ? T('left.tree.hitsCount', { hits, total: nAll, unit: nAll === 1 ? T('left.tree.stepOne') : T('left.tree.stepMany') }) : T('left.tree.hitsNone')));
    }
    const topSel = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    if (topSel.length >= 2 && !App.ctx) {
      const sb = h('div', { class: 'tree-sel-bar', id: 'tree-sel-bar' }, h('span', null, T('left.tree.selSteps', { n: topSel.length })));
      const fb = h('button', { type: 'button', class: 'btn small', id: 'btn-tree-folder', 'data-help': 'treeFolder' });
      fb.innerHTML = icon('folder') + esc(T('menu.tree.toFolder'));
      fb.onclick = () => Actions.createFolder(topSel);
      sb.append(fb);
      body.append(sb);
    }
    const ul = h('ul', { class: 'tree', role: 'tree' });
    const ctxTop = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
    const renderSubAsmList = (subD, rootRefItem, seenDocs) => {
      const cu = h('ul', { role: 'group', class: 'subasm-children' });
      const nextSeen = new Set(seenDocs);
      if (subD.id) nextSeen.add(subD.id);
      const subV = Model.vars(subD).v;
      for (const child of subD.items || []) {
        if (!child || child.suppressed) continue;
        const childIsSub = Model.isSubAssemblyRef(child);
        const childSubDoc = childIsSub && child.p && child.p.docId && !nextSeen.has(child.p.docId) ? Model.resolveDoc(child.p.docId) : null;
        const subLi = h('li', { role: 'treeitem' });
        const subRow = h('div', { class: 'node subasm-child' + (child.hidden ? ' hidden-item' : '') + (child.locked ? ' grounded' : ''), dataset: { subdocItem: child.id } });
        const subTw = h('span', { class: 'tw' }); subTw.style.visibility = 'hidden';
        const subSw = h('span', { class: 'swatch' + (child.role === 'hole' ? ' hole' : '') + (child.kind === 'ref' ? ' comp ref' : '') + (childIsSub ? ' subasm' : ''), style: { background: child.color } });
        if (child.kind === 'ref') subSw.innerHTML = icon('parts');
        const subNm = h('span', { class: 'nm', title: Model.label(child) }, Model.label(child));
        const subSub = h('span', { class: 'sub mono' }, Model.sizeText(child, subV));
        subRow.append(subTw, subSw, subNm);
        if (child.locked) {
          const lm = h('span', { class: 'lock-mark', 'data-tip': T('asm.groundedTip'), title: T('asm.groundedTip') });
          lm.innerHTML = icon('lock');
          subRow.append(lm);
        }
        subRow.append(subSub);
        subRow.addEventListener('click', (e) => { e.stopPropagation(); App.select([rootRefItem.id]); });
        subRow.addEventListener('dblclick', (e) => { e.stopPropagation(); Comp.openRef(rootRefItem.id); });
        subLi.append(subRow);
        if (childSubDoc && (childSubDoc.items || []).length) {
          subLi.append(renderSubAsmList(childSubDoc, rootRefItem, nextSeen));
        }
        cu.append(subLi);
      }
      return cu;
    };
    const renderItemLi = (it) => {
      const li = h('li', { role: 'treeitem' });
      const topIdx = App.doc.items.indexOf(it);
      const inCtx = !!ctxTop && Model.topOf(App.doc, it.id) === ctxTop;
      const ownList = ctxTop ? ctxTop.children : App.doc.items, ownIdx = ownList.indexOf(it);
      const rolled = ownIdx >= 0 && (!ctxTop || inCtx) && ownIdx >= Timeline.markerPos();
      const isSubAsm = Model.isSubAssemblyRef(it);
      const subDoc = isSubAsm ? Model.resolveDoc(it.p && it.p.docId) : null;
      const hasSubKids = !!(subDoc && (subDoc.items || []).some((x) => x && !x.suppressed));
      const delBy = App.deletedBy && App.deletedBy(it.id);
      const row = h('div', { class: 'node' + (selSet.has(it.id) ? ' sel' : '') + (it.hidden ? ' hidden-item' : '') + (delBy ? ' dim' : '') + (it.locked ? ' grounded' : '') + (it.suppressed ? ' supp' : '') + (rolled ? ' rolled' : '') + (ctxTop && !inCtx ? ' ctx-other' : '') + (ctxTop === it ? ' ctx-active' : ''), tabindex: '0', 'aria-selected': selSet.has(it.id) ? 'true' : 'false', draggable: 'true', dataset: { id: it.id } });
      const tw = h('button', { type: 'button', class: 'tw' + (expanded.has(it.id) ? ' open' : ''), 'aria-label': T('left.tree.expand') });
      if ((it.kind === 'group' && !it.partRef) || (it.finishes || []).length || hasSubKids) { tw.innerHTML = icon('chevR'); tw.onclick = (e) => { e.stopPropagation(); expanded.has(it.id) ? expanded.delete(it.id) : expanded.add(it.id); renderLeft(); }; }
      else { tw.style.visibility = 'hidden'; tw.tabIndex = -1; tw.setAttribute('aria-hidden', 'true'); }
      const sw = h('span', { class: 'swatch' + (it.role === 'hole' ? ' hole' : ''), style: { background: it.color } });
      if (it.partRef) { sw.innerHTML = icon('parts'); sw.classList.add('partref'); }
      else if (it.comp) { sw.innerHTML = icon('parts'); sw.classList.add('comp'); }
      else if (it.kind === 'ref') { sw.innerHTML = icon('parts'); sw.classList.add('comp', 'ref'); if (isSubAsm) sw.classList.add('subasm'); }
      else if (it.kind === 'sketch3d') { sw.innerHTML = icon('sketch3d'); sw.classList.add('comp'); }
      else if (it.kind === 'stackHole') { sw.innerHTML = icon('holeWizard'); sw.classList.add('hole'); }
      else if (it.kind === 'asmCut') { sw.innerHTML = icon('boolSubtract'); sw.classList.add('hole'); }
      const nm = h('span', { class: 'nm', title: Model.label(it) }, Model.label(it));
      const into = App.mergedInto(it.id), intoF = into ? Model.find(App.doc, into) : null, OPI = { join: '∪', cut: '−', common: '∩' };
      const patTxt = Features.isOp(it) ? Model.sizeText(it, V) : '';
      const stepRes = (it.kind === 'stackHole' || it.kind === 'asmCut') && App.resolvedOf ? App.resolvedOf(it.id) : null;
      const stepCountTxt = stepRes && Array.isArray(stepRes.cutIds) ? ` · ${stepRes.cutIds.length} T.` : '';
      const subText = intoF && it.op ? `${patTxt ? patTxt + ' · ' : ''}${OPI[it.op.type]} ${Model.label(intoF.item)}` : (it.link || it.asmPat ? '↔ ' : '') + Model.sizeText(it, V) + (stepRes && !(it.p && it.p.scope === 'selected') ? stepCountTxt : '');
      const sub = h('span', { class: 'sub mono' }, delBy ? `${subText ? subText + ' · ' : ''}gelöscht` : subText);
      const acts = h('span', { class: 'acts' });
      const dup = h('button', { type: 'button', class: 'act-dup', 'aria-label': T('common.duplicate'), 'data-tip': T('ctx.dupTip'), 'data-help': 'treeDuplicate' });
      dup.innerHTML = icon('copy');
      dup.onclick = (e) => { e.stopPropagation(); Actions.duplicate([it.id]); };
      const eye = h('button', { type: 'button', 'aria-label': it.hidden ? T('common.show') : T('common.hide'), 'data-tip': it.hidden ? T('common.show') : T('common.hide') }); eye.innerHTML = icon(it.hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); App.change(it.hidden ? 'Eingeblendet' : 'Ausgeblendet', (doc) => { const f = Model.find(doc, it.id); f.item.hidden = !f.item.hidden; }); };
      const del = h('button', { type: 'button', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') }); del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); Actions.remove([it.id]); };
      if (topIdx >= 0 && it.partRef && typeof Assembly !== 'undefined') {
        const ob = h('button', { type: 'button', class: 'act-open-tab', 'aria-label': T('asm.openInTab'), 'data-tip': T('asm.openInTabTip'), 'data-help': 'assemblyPartTab' });
        ob.innerHTML = icon('edit');
        ob.onclick = (e) => { e.stopPropagation(); Assembly.openPartTab(it.id); };
        acts.append(ob);
      } else if (topIdx >= 0 && it.kind === 'group') { const be = h('button', { type: 'button', 'aria-label': T('left.tree.editComp'), 'data-tip': App.ctx === it.id ? T('left.tree.editCompEnd') : T('left.tree.editCompStart') }); be.innerHTML = icon(App.ctx === it.id ? 'check' : 'edit'); be.onclick = (e) => { e.stopPropagation(); App.ctx === it.id ? App.setCtx(null) : Comp.edit(it.id); }; acts.append(be); }
      if (it.kind === 'ref') { const ro = h('button', { type: 'button', 'aria-label': isSubAsm ? T('asm.openSubAsm') : T('asm.openPart'), 'data-tip': isSubAsm ? T('asm.openSubAsm') : T('asm.openPart') }); ro.innerHTML = icon('edit'); ro.onclick = (e) => { e.stopPropagation(); Comp.openRef(it.id); }; acts.append(ro); }
      if (topIdx >= 0) { const io = h('button', { type: 'button', 'aria-label': T('common.isolate'), 'data-tip': App.iso === it.id ? T('left.tree.isoOff') : T('left.tree.isoOn') }); io.innerHTML = icon('focusView'); io.onclick = (e) => { e.stopPropagation(); Comp.toggleIso(it.id); }; acts.append(io); }
      if (ownIdx >= 0 && (!ctxTop || inCtx)) { const sp = h('button', { type: 'button', 'aria-label': it.suppressed ? T('left.tree.activate') : T('common.suppress'), 'data-tip': it.suppressed ? T('common.unsuppress') : T('left.tree.suppressTip'), 'data-help': 'suppress' }); sp.innerHTML = icon('suppress'); sp.onclick = (e) => { e.stopPropagation(); Timeline.toggleSuppress(it.id); }; acts.append(sp); }
      acts.append(dup, eye, del);
      row.append(tw, sw, nm);
      if (it.locked) { const lm = h('span', { class: 'lock-mark', 'data-tip': T('asm.groundedTip'), title: T('asm.groundedTip'), 'data-help': 'groundPart' }); lm.innerHTML = icon('lock'); row.append(lm); }
      if (it.ai) { const am = h('span', { class: 'ai-mark', 'data-tip': it.ai.edit ? T('left.tree.aiEditTip', { q: it.ai.q }) : T('left.tree.aiNewTip', { q: it.ai.q }) }); am.innerHTML = icon('spark'); row.append(am); }
      const hardErrs = RefFix.hardErrorsFor(it.id);
      const refIssues = RefFix.issuesOf(it.id);
      const childRef = !refIssues.length && it.kind === 'group' && !expanded.has(it.id) ? RefFix.firstDescendantIssue(it) : null;
      if (hardErrs.length) { const er = h('span', { class: 'err', 'data-tip': hardErrs[0].message }); er.innerHTML = icon('warn'); row.append(er); }
      if (refIssues.length || childRef) {
        const iss = refIssues[0] || childRef;
        const tipR = T('left.tree.refFixTip', { msg: iss.message });
        const wr = h('span', { class: 'warn-ref', 'data-tip': tipR, title: tipR, 'data-help': 'refFix' });
        wr.innerHTML = icon('warn');
        wr.onclick = (e) => { e.stopPropagation(); RefFix.start(iss); };
        row.append(wr);
      }
      row.append(sub, acts);
      row.addEventListener('click', (e) => { App.select([it.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); });
      row.addEventListener('keydown', (e) => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); App.select([it.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); } });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); if (!selSet.has(it.id)) App.select([it.id]);
        const topSelNow = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
        const inFld = topIdx >= 0 ? Model.folderOf(App.doc, it.id) : null;
        UI.menu(row, [
          ...(it.kind === 'ref' ? [{ icon: 'edit', label: isSubAsm ? T('asm.openSubAsm') : T('asm.openPart'), id: 'tm-ref-open', help: isSubAsm ? 'subAssembly' : 'assemblyDoc', run: () => Comp.openRef(it.id) }] : []),
          ...(typeof Assembly !== 'undefined' && Assembly.canOpenInTab(it, App.doc) ? [{ icon: 'edit', label: T('asm.openInTab'), id: 'tm-open-part-tab', help: 'assemblyPartTab', run: () => Assembly.openPartTab(it.id) }] : []),
          ...(typeof Comp !== 'undefined' && Comp.canReplace && Comp.canReplace(it, App.doc) ? [{ icon: 'replace', label: T('asm.replacePart'), id: 'tm-replace-part', help: 'replacePart', run: () => Comp.replacePartDialog(it.id) }] : []),
          ...(topIdx >= 0 ? [{ icon: it.locked ? 'unlock' : 'lock', label: it.locked ? T('asm.unground') : T('asm.ground'), id: 'tm-ground', help: 'groundPart', run: () => Actions.toggleGround([it.id]) }] : []),
          ...(refIssues.length ? [{ icon: 'warn', label: T('left.tree.refFixMenu'), id: 'tm-reffix', help: 'refFix', run: () => RefFix.start(refIssues[0]) }] : []),
          ...(typeof Comp !== 'undefined' && Comp.partRefs && !ViewPrefs.simple && Comp.partRefs(it.id).length ? [{ icon: 'link', label: T('partRefs.menuLabel', { n: Comp.partRefs(it.id).length }), id: 'tm-part-refs', help: 'partRefs', run: () => Comp.refsDialog(it.id) }] : []),
          { icon: 'help', label: T('common.explainStep'), help: 'explainStep', run: () => Explain.dialog(it.id) },
          { icon: 'copy', label: T('common.duplicate'), id: 'tm-dup', kbd: 'Strg D', help: 'treeDuplicate', run: () => Actions.duplicate([it.id]) },
          ...(it.kind !== 'ref' && UserLib.canSave(it) ? [{ icon: 'save', label: T('left.tree.toMyLib'), id: 'tm-userlib', help: 'userLibrary', run: () => UserLib.saveDialog(it.id) }] : []),
          ...(it.kind !== 'ref' && Features.canMirrorStep(it, (Model.find(App.doc, it.id) || {}).parent) ? [{ icon: 'mirror', label: T('common.mirrorStep'), id: 'tm-mirrorstep', help: 'mirrorStep', run: () => Features.mirrorStep([it.id]) }] : []),
          ...(it.kind === 'sketch3d' ? [{ icon: 'edit', label: T('sk3.editBtn'), id: 'tm-sk3-edit', run: () => Sketch.edit3d(it.id) }, { icon: 'sweep', label: T('ctx.alongPath'), id: 'tm-sk3-sweep', run: () => Features.sweepFromSketch3d(it.id) }] : []),
          ...(it.kind !== 'ref' && it.kind !== 'deleteBody' && it.kind !== 'sketch3d' && it.kind !== 'boss' && it.kind !== 'lipGroove' && it.kind !== 'undercut' && it.kind !== 'circlipGroove' && it.kind !== 'keyway' && it.kind !== 'splineProfile' && it.kind !== 'knurl' && it.kind !== 'gripPattern' && it.kind !== 'stackHole' && it.kind !== 'asmCut' && topIdx >= 0 ? [{ icon: 'moveStep', label: T('common.moveStep'), help: 'moveStep', run: () => Features.transform([it.id]) }, { icon: 'scaleBody', label: T('common.scaleStep'), help: 'scaleBody', run: () => Features.scale([it.id]) }, ...(!ViewPrefs.simple ? [{ icon: 'deform', label: T('common.deformStep'), id: 'tm-deform', help: 'deform', run: () => Features.deform([it.id]) }] : []), { icon: 'deleteBody', label: T('common.deleteBodyStep'), id: 'tm-deletebody', help: 'deleteBody', run: () => Features.deleteBody([it.id]) }] : []),
          ...(Model.isAssembly(App.doc) && typeof Comp !== 'undefined' && Comp.canPatternPart && Comp.canPatternPart(it, App.doc) ? [
            { icon: 'patternRect', label: T('asm.patMenuRect'), id: 'tm-asm-pat-rect', help: 'asmPattern', run: () => Assembly.patternDialog('rect', [it.id]) },
            { icon: 'patternCirc', label: T('asm.patMenuCirc'), id: 'tm-asm-pat-circ', help: 'asmPattern', run: () => Assembly.patternDialog('circ', [it.id]) },
            { icon: 'mirror', label: T('asm.patMenuMirror'), id: 'tm-asm-mirror', help: 'asmMirror', run: () => Assembly.patternDialog('mirror', [it.id]) },
          ] : []),
          ...(!Model.isAssembly(App.doc) && it.kind !== 'ref' && !((it.kind === 'transform' && !(it.p && it.p.copy)) || it.kind === 'scale' || it.kind === 'deform' || it.kind === 'deleteBody' || it.kind === 'sketch3d' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome') ? [{ icon: 'patternRect', label: T('ctx.patRect'), id: 'tm-pat-rect', help: 'patternRect', run: () => Features.pattern('rect', [it.id]) }, { icon: 'patternCirc', label: T('ctx.patCirc'), id: 'tm-pat-circ', help: 'patternCirc', run: () => Features.pattern('circ', [it.id]) }, { icon: 'point', label: T('ctx.patPoints'), id: 'tm-pat-points', help: 'patternPoints', run: () => Features.patternPoints([it.id]) }, { icon: 'list', label: T('ctx.patTable'), id: 'tm-pat-table', help: 'patternTable', run: () => Features.patternTable([it.id]) }] : []),
          ...(topSelNow.length >= 2 && !App.ctx ? [{ icon: 'folder', label: T('menu.tree.toFolder'), id: 'tm-folder', help: 'treeFolder', run: () => Actions.createFolder(topSelNow) }] : []),
          ...(inFld ? [{ icon: 'ungroup', label: T('menu.tree.fromFolder'), id: 'tm-unfolder', run: () => Actions.removeFromFolder([it.id]) }] : []),
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('common.rename'), T('common.name'), Model.label(it), T('common.rename')); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); } },
          ...(ownIdx >= 0 ? [{ icon: 'suppress', label: it.suppressed ? T('common.unsuppress') : T('common.suppress'), run: () => Timeline.toggleSuppress(it.id) }] : []),
          '-', { icon: 'trash', label: T('common.delete'), run: () => Actions.remove([it.id]) },
        ]);
      });
      row.addEventListener('dblclick', async (e) => { e.stopPropagation(); if (it.kind === 'ref') { Comp.openRef(it.id); return; } if (typeof Assembly !== 'undefined' && Assembly.canOpenInTab(it, App.doc)) { Assembly.openPartTab(it.id); return; } if (it.kind === 'sketch3d') { Sketch.edit3d(it.id); return; } const n = await UI.prompt(T('common.rename'), T('common.name'), Model.label(it), T('common.rename')); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); });
      // Ziehen im Verlauf: umsortieren oder in eine Gruppe legen
      row.addEventListener('dragstart', (e) => {
        dragInfo = { type: 'item', id: it.id };
        row.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (_) {} }
      });
      row.addEventListener('dragend', () => { dragInfo = null; clearDropClasses(); });
      row.addEventListener('dragover', (e) => {
        if (!dragInfo) return;
        const srcIds = dragInfo.type === 'folder' ? dragInfo.ids : [dragInfo.id];
        if (srcIds.includes(it.id)) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = dragInfo.type === 'item' && it.kind === 'group' && y > 0.3 && y < 0.7 ? 'into' : (y < 0.5 ? 'before' : 'after');
        let dst = it.id;
        if (dragInfo.type === 'folder' && topIdx >= 0) {
          const otherFld = itemFolder.get(it.id);
          if (otherFld) dst = mode === 'before' ? otherFld.ids[0] : otherFld.ids[otherFld.ids.length - 1];
        }
        const chk = Model.validateMove(App.doc, srcIds, dst, mode, { boxOf: Actions.worldBox });
        row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad');
        row.classList.add(mode === 'into' ? 'drop-into' : mode === 'before' ? 'drop-before' : 'drop-after');
        if (!chk.ok) row.classList.add('drop-bad');
        row.title = chk.ok ? '' : (chk.reason || '');
      });
      row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad'); row.removeAttribute('title'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = row.classList.contains('drop-into') ? 'into' : row.classList.contains('drop-before') ? 'before' : row.classList.contains('drop-after') ? 'after' : (dragInfo && dragInfo.type === 'item' && it.kind === 'group' && y > 0.3 && y < 0.7 ? 'into' : y < 0.5 ? 'before' : 'after');
        const src = dragInfo;
        clearDropClasses();
        dragInfo = null;
        if (!src) {
          const raw = e.dataTransfer && e.dataTransfer.getData('text/plain');
          if (raw) Actions.reorder([raw], it.id, mode);
          return;
        }
        let dst = it.id;
        if (src.type === 'folder' && topIdx >= 0) {
          const otherFld = itemFolder.get(it.id);
          if (otherFld) dst = mode === 'before' ? otherFld.ids[0] : otherFld.ids[otherFld.ids.length - 1];
        }
        Actions.reorder(src.type === 'folder' ? src.ids : [src.id], dst, mode, src.type === 'folder' ? { folderId: src.id } : {});
      });
      li.append(row);
      const bl = renderBodiesList(it);
      if (bl) li.append(bl);
      if (expanded.has(it.id) || (show && it.kind === 'group')) {
        const errs = App.errorsFor(it.id);
        for (const fin of it.finishes || []) {
          const ferr = errs.find((x) => x.finishId === fin.id);
          const isRef = !!(ferr && RefFix.isRefError(ferr));
          const fr = h('div', { class: 'finish-row' + (isRef ? ' warn' : ferr ? ' bad' : ''), title: ferr ? ferr.message : '' });
          fr.innerHTML = icon(fin.type === 'chamfer' || fin.type === 'cornerChamfer' || fin.type === 'draft' || fin.type === 'partingDraft' ? 'chamfer' : fin.type === 'shell' ? 'shell' : 'fillet');
          if (fin.type === 'shell') {
            const dirTag = fin.dir === 'out' ? ' · ' + T('panel.edges.shellDirShortOut') : fin.dir === 'mid' ? ' · ' + T('panel.edges.shellDirShortMid') : '';
            const fwCnt = Array.isArray(fin.faceWalls) ? fin.faceWalls.length : 0;
            fr.append(h('span', null, T('panel.edges.shellTitle') + ' ' + Units.fmtLenU(Model.num(fin.r, V, 2), 2) + dirTag + (fwCnt ? ` · +${fwCnt}` : '')));
          }
          else if (fin.type === 'draft') fr.append(h('span', null, T('panel.edges.draft') + ' ' + fmtAngleU(Model.num(fin.r, V, 3))));
          else if (fin.type === 'partingDraft') fr.append(h('span', null, T('panel.edges.partingDraft') + ' ' + (fin.sym === false ? fmtAngleU(Model.num(fin.r, V, 3)) + ' / ' + fmtAngleU(Model.num(fin.r2, V, 3)) : fmtAngleU(Model.num(fin.r, V, 3)))));
          else if (fin.type === 'fullFillet') fr.append(h('span', null, T('panel.edges.fullFillet') + ' · ' + T('panel.edges.threeFaces')));
          else if (fin.type === 'faceFillet') fr.append(h('span', null, T('panel.edges.faceFillet') + ' ' + Units.fmtLenU(Model.num(fin.r, V, 5), 2)));
          else if (fin.type === 'cornerChamfer') fr.append(h('span', null, T('panel.edges.cornerChamfer') + ' ' + [fin.d1, fin.d2, fin.d3].map((x) => Units.fmtLen(Model.num(x, V, 2), 2)).join(' / ') + ' ' + Units.label()));
          else {
            const eMap = { all: T('left.tree.finAllEdges'), top: T('left.tree.finTop'), bottom: T('left.tree.finBottom'), vertical: T('left.tree.finVert'), horizontal: T('left.tree.finHoriz') };
            const cnt = (fin.edges || []).length;
            const eTxt = typeof fin.edges === 'string' ? (eMap[fin.edges] ? ' · ' + eMap[fin.edges] : '') : ' · ' + (cnt === 1 ? T('panel.edges.oneEdge') : T('panel.edges.manyEdges', { n: cnt }));
            const g2Txt = fin.type === 'fillet' && fin.shape === 'g2' ? ' · ' + T('panel.edges.shapeG2Short') : '';
            const cornerTxt = fin.type === 'fillet' && fin.corner === 'smooth' ? ' · ' + T('panel.edges.cornerSmoothShort') : '';
            fr.append(h('span', null, (fin.type === 'chamfer' ? T('panel.edges.chamfer') : T('panel.edges.fillet')) + ' ' + Units.fmtLenU(Model.num(fin.r, V, 1), 2) + g2Txt + cornerTxt + eTxt));
          }
          if (isRef) {
            const iss = refIssues.find((x) => x.finishId === fin.id);
            if (iss) {
              const fb = h('button', { type: 'button', class: 'fin-fix-btn', 'data-help': 'refFix' }, T('panel.item.pickAgain'));
              fb.onclick = (e) => { e.stopPropagation(); RefFix.start(iss); };
              fr.append(fb);
            }
          }
          fr.onclick = () => App.select([it.id]);
          li.append(fr);
        }
        if (it.kind === 'group') { const cu = h('ul', { role: 'group' }); rec(it.children || [], cu); li.append(cu); }
        if (hasSubKids) li.append(renderSubAsmList(subDoc, it, new Set(App.doc && App.doc.id ? [App.doc.id] : [])));
      }
      return li;
    };
    const renderFolderLi = (fld, fItems) => {
      const li = h('li', { role: 'treeitem', dataset: { folderLi: fld.id } });
      const allSel = fItems.length > 0 && fItems.every((x) => selSet.has(x.id));
      const row = h('div', { class: 'node folder-node' + (allSel ? ' sel' : ''), draggable: 'true', dataset: { folderId: fld.id } });
      const tw = h('button', { type: 'button', class: 'tw' + (!fld.collapsed ? ' open' : ''), 'aria-label': fld.collapsed ? T('menu.tree.expandFolder') : T('menu.tree.collapseFolder'), 'aria-expanded': String(!fld.collapsed), dataset: { folderToggle: fld.id } });
      tw.innerHTML = icon('chevR');
      tw.onclick = (e) => { e.stopPropagation(); Actions.toggleFolder(fld.id); };
      const sw = h('span', { class: 'swatch folder-ic' }); sw.innerHTML = icon('folder');
      const nm = h('span', { class: 'nm', title: fld.name }, fld.name);
      const sub = h('span', { class: 'sub mono' }, fItems.length === 1 ? T('left.tree.folderStepOne') : T('left.tree.folderStepMany', { n: fItems.length }));
      const acts = h('span', { class: 'acts' });
      const un = h('button', { type: 'button', 'aria-label': T('menu.tree.dissolveFolder'), 'data-tip': T('menu.tree.dissolveFolder') });
      un.innerHTML = icon('ungroup');
      un.onclick = (e) => { e.stopPropagation(); Actions.ungroupFolder(fld.id); };
      acts.append(un);
      row.append(tw, sw, nm, sub, acts);
      row.addEventListener('click', () => { App.select(fItems.map((x) => x.id)); });
      row.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const n = await UI.prompt(T('left.tree.renameFolder'), T('common.name'), fld.name, T('common.rename'));
        if (n && n.trim()) Actions.renameFolder(fld.id, n);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const allHidden = fItems.every((x) => x.hidden);
        const allSupp = fItems.every((x) => x.suppressed);
        UI.menu(row, [
          { icon: 'chevR', label: fld.collapsed ? T('menu.tree.expandFolder') : T('menu.tree.collapseFolder'), run: () => Actions.toggleFolder(fld.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('left.tree.renameFolder'), T('common.name'), fld.name, T('common.rename')); if (n && n.trim()) Actions.renameFolder(fld.id, n); } },
          { icon: 'pointer', label: T('menu.tree.selectFolder'), run: () => App.select(fItems.map((x) => x.id)) },
          { icon: allHidden ? 'eye' : 'eyeOff', label: allHidden ? T('left.tree.showAllFolder') : T('left.tree.hideAllFolder'), run: () => App.change(allHidden ? 'Eingeblendet' : 'Ausgeblendet', (doc) => { for (const x of fItems) { const f = Model.find(doc, x.id); if (f) f.item.hidden = !allHidden; } }) },
          { icon: 'suppress', label: allSupp ? T('left.tree.activateAllFolder') : T('left.tree.suppressAllFolder'), run: () => App.change(allSupp ? 'Aktiviert' : 'Unterdrückt', (doc) => { for (const x of fItems) { const f = Model.find(doc, x.id); if (f) f.item.suppressed = !allSupp; } }) },
          '-',
          { icon: 'ungroup', label: T('menu.tree.dissolveFolder'), run: () => Actions.ungroupFolder(fld.id) },
        ]);
      });
      row.addEventListener('dragstart', (e) => {
        dragInfo = { type: 'folder', id: fld.id, ids: fItems.map((x) => x.id) };
        row.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'folder:' + fld.id); } catch (_) {} }
      });
      row.addEventListener('dragend', () => { dragInfo = null; clearDropClasses(); });
      row.addEventListener('dragover', (e) => {
        if (!dragInfo) return;
        if (dragInfo.type === 'folder' && dragInfo.id === fld.id) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = dragInfo.type === 'item' && y > 0.25 && y < 0.75 ? 'into-folder' : (y < 0.5 ? 'before' : 'after');
        const srcIds = dragInfo.type === 'folder' ? dragInfo.ids : [dragInfo.id];
        const dst = mode === 'into-folder' ? fld.id : (mode === 'before' ? fItems[0].id : fItems[fItems.length - 1].id);
        const chk = Model.validateMove(App.doc, srcIds, dst, mode, { boxOf: Actions.worldBox });
        row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad');
        row.classList.add(mode === 'into-folder' ? 'drop-into' : mode === 'before' ? 'drop-before' : 'drop-after');
        if (!chk.ok) row.classList.add('drop-bad');
        row.title = chk.ok ? '' : (chk.reason || '');
      });
      row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad'); row.removeAttribute('title'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = row.classList.contains('drop-into') ? 'into-folder' : row.classList.contains('drop-before') ? 'before' : row.classList.contains('drop-after') ? 'after' : (dragInfo && dragInfo.type === 'item' && y > 0.25 && y < 0.75 ? 'into-folder' : y < 0.5 ? 'before' : 'after');
        const src = dragInfo;
        clearDropClasses();
        dragInfo = null;
        if (!src) return;
        const srcIds = src.type === 'folder' ? src.ids : [src.id];
        const dst = mode === 'into-folder' ? fld.id : (mode === 'before' ? fItems[0].id : fItems[fItems.length - 1].id);
        Actions.reorder(srcIds, dst, mode, src.type === 'folder' ? { folderId: src.id, outsideFolder: true } : { outsideFolder: mode !== 'into-folder' });
      });
      li.append(row);
      if (!fld.collapsed || show) {
        const cu = h('ul', { role: 'group', class: 'folder-list' });
        for (const fit of fItems) {
          if (show && !show.has(fit.id)) continue;
          cu.append(renderItemLi(fit));
        }
        li.append(cu);
      }
      return li;
    };
    const renderedFolders = new Set();
    const rec = (list, parentUl) => {
      for (const it of list) {
        if (list === items && itemFolder.has(it.id)) {
          const fld = itemFolder.get(it.id);
          if (renderedFolders.has(fld.id)) continue;
          renderedFolders.add(fld.id);
          const fItems = (fld.ids || []).map((id) => items.find((x) => x.id === id)).filter(Boolean);
          if (fItems.length) {
            if (show && !fItems.some((x) => show.has(x.id))) continue;
            parentUl.append(renderFolderLi(fld, fItems));
            continue;
          }
        }
        if (show && !show.has(it.id)) continue;
        parentUl.append(renderItemLi(it));
      }
    };
    rec(items, ul);
    body.append(ul);
    const ds = Datums.treeSection(); if (ds) body.append(ds);
    const as = Datums.axisTreeSection(); if (as) body.append(as);
    const ps = Datums.pointTreeSection(); if (ps) body.append(ps);
    const cs = Datums.csysTreeSection(); if (cs) body.append(cs);
    const pcs = typeof PointClouds !== 'undefined' && PointClouds.treeSection ? PointClouds.treeSection() : null; if (pcs) body.append(pcs);
    const ms = Measure.treeSection(); if (ms) body.append(ms);
    const js = typeof Joints !== 'undefined' && Joints.treeSection ? Joints.treeSection() : null; if (js) body.append(js);
    const apTree = typeof Assembly !== 'undefined' && Assembly.patternTreeSection ? Assembly.patternTreeSection() : null; if (apTree) body.append(apTree);
    const posSec = typeof Assembly !== 'undefined' && Assembly.poseTreeSection ? Assembly.poseTreeSection() : null; if (posSec) body.append(posSec);
    const pns = typeof Notes !== 'undefined' && Notes.treeSection ? Notes.treeSection() : null; if (pns) body.append(pns);
  }
  function moveInTree(srcId, dstId, mode) {
    return Actions.reorder(srcId, dstId, mode);
  }
  // ---------- Protokoll ----------
  let logFilter = 'all';
  function renderLog(body) {
    const all = Log.entries();
    const tools = h('div', { class: 'log-tools' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': T('left.log.filterAria') });
    for (const [k, l] of [['all', T('common.all')], ['change', T('left.log.changes')], ['error', T('left.log.errors')]]) { const b = h('button', { type: 'button', 'aria-pressed': logFilter === k }, l); b.onclick = () => { logFilter = k; renderLeft(); }; seg.append(b); }
    const clr = h('button', { type: 'button', class: 'btn small ghost', style: { marginLeft: 'auto' } }, T('left.log.clear')); clr.onclick = () => Log.clear();
    tools.append(seg, clr); body.append(tools);
    // Startzeiten: Oberfläche bereit, CAD-Kern bereit, geladene Schriften (PL-03)
    const st = Log.startup;
    if (st && st.uiReadyMs != null) {
      const fmtMs = (ms) => (ms >= 1000 ? `${fmt(ms / 1000, 2)} s` : `${Math.round(ms)} ms`);
      const sec = h('details', { class: 'section slow-sec', id: 'startup-times', open: true, 'data-help': 'startupTimes' }, h('summary', { class: 'section-h' }, T('left.log.startup')));
      sec.append(h('div', { class: 'mini-row', id: 'st-ui-ready' }, h('span', { class: 'grow' }, T('left.log.uiReady')), h('b', { class: 'mono' }, fmtMs(st.uiReadyMs))));
      const kState = typeof Kernel !== 'undefined' ? Kernel.state : 'idle';
      const kTxt = st.kernelReadyMs != null
        ? `${fmtMs(st.kernelReadyMs)}${st.kernelLoadMs != null ? T('left.log.loadTime', { t: fmtMs(st.kernelLoadMs) }) : ''}`
        : (kState === 'loading' ? T('status.loading') : kState === 'error' ? T('common.error') : T('left.log.onDemand'));
      sec.append(h('div', { class: 'mini-row', id: 'st-kernel-ready' }, h('span', { class: 'grow' }, T('left.log.kernelReady')), h('b', { class: 'mono' }, kTxt)));
      const loadedFonts = Object.values(st.fonts || {});
      if (loadedFonts.length) {
        for (const lf of loadedFonts) {
          sec.append(h('div', { class: 'mini-row', id: 'st-font-' + lf.id }, h('span', { class: 'grow' }, T('left.log.fontItem', { name: lf.name })), h('b', { class: 'mono' }, fmtMs(lf.ms))));
        }
      } else {
        sec.append(h('div', { class: 'mini-row', id: 'st-fonts-state' }, h('span', { class: 'grow' }, T('left.log.fonts')), h('b', { class: 'mono' }, T('left.log.fontsOnDemand'))));
      }
      body.append(sec);
    }
    // Welche Schritte brauchen beim Rechnen am längsten? (BE-26)
    const slow = App.doc.items.map((it) => ({ it, t: App.timeOf(it.id) })).filter((x) => x.t && x.t.ms >= 1).sort((a, b) => b.t.ms - a.t.ms).slice(0, 5);
    if (slow.length) {
      const sec = h('details', { class: 'section slow-sec', id: 'slow-steps', 'data-help': 'slowSteps' }, h('summary', { class: 'section-h' }, T('left.log.slowTitle')));
      const fmtMs = (ms) => (ms >= 1000 ? `${fmtFixed(ms / 1000, 1)} s` : `${Math.round(ms)} ms`);
      for (const x of slow) { const r = h('div', { class: 'mini-row dep-row' }, h('span', { class: 'grow' }, Model.label(x.it)), h('b', { class: 'mono' }, fmtMs(x.t.ms))); r.style.cursor = 'pointer'; r.onclick = () => App.select([x.it.id]); sec.append(r); }
      sec.append(h('div', { class: 'hint-box', html: T('left.log.slowHint') }));
      if (slow[0].t.ms > 1500) sec.open = true;
      body.append(sec);
    }
    const shown = all.filter((e) => logFilter === 'all' || (logFilter === 'error' ? e.kind === 'error' : e.kind !== 'error' && e.kind !== 'info')).slice().reverse();
    if (!shown.length) { body.append(h('div', { class: 'empty-tree' }, logFilter === 'error' ? T('left.log.emptyErr') : T('left.log.emptyAll'))); return; }
    const ul = h('div', { class: 'log-list' });
    const depthNow = App.undoStack.length;
    const ic = { change: 'edit', undo: 'undo', redo: 'redo', error: 'warn', info: 'info' };
    for (const e of shown.slice(0, 200)) {
      const d = new Date(e.t); const tm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const reach = e.kind === 'change' && e.s === Log.session && e.depth != null && e.depth <= depthNow;
      const row = h('div', { class: 'log-row ' + e.kind + (e.kind === 'change' && !reach && e.s === Log.session ? ' gone' : '') });
      const ico = h('span'); ico.innerHTML = icon(ic[e.kind] || 'info');
      const txt = h('div', null, e.kind === 'error' ? h('b', null, (e.name ? e.name + ': ' : '') + e.text) : h('span', null, e.kind === 'undo' ? T('left.log.undoPrefix', { t: e.text }) : e.kind === 'redo' ? T('left.log.redoPrefix', { t: e.text }) : e.text));
      if (e.kind === 'error') {
        if (Log.hint(e.code)) txt.append(h('small', null, Log.hint(e.code)));
        if (e.itemId && Model.find(App.doc, e.itemId)) { const b = h('button', { type: 'button', class: 'lk' }, T('left.log.showStep')); b.onclick = () => App.select([e.itemId]); txt.append(b); }
      }
      if (reach && e.depth < depthNow) { const b = h('button', { type: 'button', class: 'lk', 'data-tip': T('left.log.undoToTip') }, T('left.log.undoTo')); b.onclick = () => App.undoTo(e.depth); txt.append(b); }
      row.append(h('span', { class: 'tm' }, tm), ico, txt); ul.append(row);
    }
    body.append(ul);
  }
  // ---------- Maße (Parameter) ----------
  function renderParams(body) {
    const { v, errors } = Model.vars(App.doc);
    const wrap = h('div', { class: 'props' });
    wrap.append(h('div', { class: 'hint-box', html: T('left.par.hintHtml') }));
    if ((App.doc.params || []).length || (App.doc.items || []).length || (App.doc.variants || []).length) { const vs = Variants.section(); vs.classList.add('pro'); wrap.append(vs); }
    const list = h('div', { class: 'mini-list' });
    (App.doc.params || []).forEach((p, i) => {
      const row = h('div', { class: 'section' });
      const f = h('div', { class: 'fields' });
      const nameIn = h('div', { class: 'field' }, h('label', { for: 'pn-' + p.id }, T('common.name')), h('div', { class: 'inp' }, h('input', { id: 'pn-' + p.id, value: p.name, style: { fontFamily: 'var(--font)' } })));
      nameIn.querySelector('input').addEventListener('change', (e) => {
        const nv = e.target.value.trim().replace(/\s+/g, '_');
        if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(nv)) { UI.toast(T('left.par.badName'), { kind: 'bad' }); e.target.value = p.name; return; }
        renameParam(p.id, nv);
      });
      const valF = UI.numField({ id: 'pv-' + p.id, label: T('common.value'), value: p.expr, unit: '', measurePick: !p.measure, onCommit: (val) => App.change('Maß geändert', (doc) => { const tgt = doc.params.find((x) => x.id === p.id); if (!tgt) return false; tgt.expr = val; if (tgt.measure) delete tgt.measure; }, { merge: 'param:' + p.id }) });
      f.append(nameIn, valF);
      row.append(f);
      if (p.measure) {
        const mInfo = h('div', { class: 'meas-param-info' + (p.measure.frozen ? ' frozen' : p.measure.lost ? ' lost' : '') });
        const mTxt = h('span', { class: 'grow' }, p.measure.frozen ? T('partRefs.paramFrozen', { src: p.measure.label || 'Kante' }) : p.measure.lost ? T('measure.paramLost') : T('measure.paramFrom', { src: p.measure.label || 'Kante' }));
        const mUnlink = h('button', { type: 'button', class: 'btn ghost small', id: 'pm-unlink-' + p.id, 'data-tip': T('measure.paramUnlink') }, T('measure.paramUnlink'));
        mUnlink.onclick = () => Measure.unlinkMeasuredParam(p.id);
        if (p.measure.frozen) {
          const mUnfreeze = h('button', { type: 'button', class: 'btn ghost small', id: 'pm-unfreeze-' + p.id }, T('partRefs.unfreezeBtn'));
          mUnfreeze.onclick = () => {
            const ref = (typeof Comp !== 'undefined' && Comp.allPartRefs ? Comp.allPartRefs() : []).find((r) => r.kind === 'measure' && r.paramId === p.id);
            if (ref) Comp.unfreezeRef(ref.id);
            else App.change(T('partRefs.unfreezeUndo'), (doc) => { const x = (doc.params || []).find((q) => q.id === p.id); if (!x || !x.measure) return false; delete x.measure.frozen; });
          };
          mInfo.append(iconEl('freeze'), mTxt, mUnfreeze, mUnlink);
        } else {
          const mPick = h('button', { type: 'button', class: 'btn ghost small', id: 'pm-repick-' + p.id, 'data-tip': T('measure.paramRepick') }, T('measure.paramRepick'));
          mPick.onclick = () => Measure.pickEdgeForField({ repickParamId: p.id });
          mInfo.append(iconEl('measure'), mTxt, mPick, mUnlink);
        }
        row.append(mInfo);
      }
      const info = h('div', { class: 'btn-row', style: { justifyContent: 'space-between', alignItems: 'center' } });
      info.append(h('span', { class: 'mono', style: { color: errors[p.id] ? 'var(--bad)' : 'var(--muted)', fontSize: '12.5px' } }, errors[p.id] ? errors[p.id] : '= ' + fmt(v[p.name], 3)));
      const del = h('button', { type: 'button', class: 'btn ghost small danger' }); del.innerHTML = icon('trash') + esc(T('common.remove'));
      del.onclick = () => removeParam(p.id);
      info.append(del); row.append(info);
      list.append(row);
      if (i < App.doc.params.length - 1) list.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '2px 0', width: '100%' } }));
    });
    wrap.append(list);
    const add = h('button', { type: 'button', class: 'btn' }); add.innerHTML = icon('plus') + esc(T('left.par.addParam'));
    add.onclick = () => { let n = 1; while ((App.doc.params || []).some((x) => x.name === 'Maß' + n)) n++; App.change('Maß hinzugefügt', (doc) => { doc.params.push({ id: uid('m'), name: 'Maß' + n, expr: 10 }); }); };
    const exb = h('button', { type: 'button', class: 'btn ghost' }); exb.innerHTML = icon('help') + esc(T('left.par.formulaExamples'));
    exb.onclick = () => formulaHelp();
    wrap.append(h('div', { class: 'btn-row' }, add, exb));
    // Maße als Tabelle tauschen (KP-23): CSV mit Name;Wert, lesbar in Excel und Numbers
    const csvOut = h('button', { type: 'button', class: 'btn ghost', id: 'par-csv-out', 'data-help': 'paramsCsv' }); csvOut.innerHTML = icon('export') + esc(T('left.par.csvSave'));
    csvOut.disabled = !(App.doc.params || []).length; csvOut.onclick = () => Print.save(Print.safeName(App.doc.name) + ' – Maße.csv', new Blob(['\ufeff' + paramsCSV()], { type: 'text/csv' }));
    const csvIn = h('button', { type: 'button', class: 'btn ghost', id: 'par-csv-in', 'data-help': 'paramsCsv' }); csvIn.innerHTML = icon('folder') + esc(T('left.par.csvLoad'));
    csvIn.onclick = () => { const inp = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' } }); inp.onchange = async () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return; const sz = Store.checkFileSize(f, 'csv'); if (!sz.ok) { UI.toast(sz.message, { kind: 'bad' }); return; } importParamsCSV(await f.text()); }; document.body.append(inp); inp.click(); setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000); };
    wrap.append(h('div', { class: 'btn-row' }, csvOut, csvIn));
    // Kleine Nachschlagetabellen (KP-22): zwei Spalten Schlüssel & Wert für tabelle(Name; Schlüssel)
    const tblSec = h('div', { class: 'section param-tables', id: 'param-tables-sec' }, h('div', { class: 'section-h' }, T('left.par.tablesTitle')));
    const tbls = App.doc.tables || [];
    if (!tbls.length) {
      tblSec.append(h('div', { class: 'hint-box', html: T('left.par.tablesHintHtml') }));
    }
    for (const tb of tbls) {
      const card = h('div', { class: 'ptbl', dataset: { tableId: tb.id, tableName: tb.name } });
      const head = h('div', { class: 'ptbl-head' });
      const tNameIn = h('input', { id: 'ptn-' + tb.id, class: 'ptbl-name', value: tb.name, 'aria-label': T('left.par.tableNameAria'), spellcheck: 'false' });
      tNameIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') tNameIn.blur(); if (e.key === 'Escape') { tNameIn.value = tb.name; tNameIn.blur(); } });
      tNameIn.addEventListener('change', (e) => {
        const nv = e.target.value.trim().replace(/\s+/g, '_');
        if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(nv)) { UI.toast(T('left.par.badTableName'), { kind: 'bad' }); e.target.value = tb.name; return; }
        renameTable(tb.id, nv);
      });
      const tDel = h('button', { type: 'button', class: 'btn ghost small danger ptbl-del', 'data-tip': T('left.par.tableDel'), 'aria-label': T('left.par.tableDel') });
      tDel.innerHTML = icon('trash');
      tDel.onclick = () => removeTable(tb.id);
      head.append(tNameIn, tDel);
      card.append(head);
      const grid = h('div', { class: 'ptbl-grid' }, h('div', { class: 'ptbl-cols' }, h('span', null, T('left.par.colKey')), h('span', null, T('left.par.colVal')), h('span', null)));
      for (const r of tb.rows || []) {
        const rowEl = h('div', { class: 'ptbl-row', dataset: { rowId: r.id } });
        const kIn = h('input', { id: 'ptk-' + r.id, class: 'ptbl-key', value: r.key ?? '', placeholder: T('left.par.keyPh'), 'aria-label': T('left.par.colKey'), spellcheck: 'false' });
        kIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') kIn.blur(); if (e.key === 'Escape') { kIn.value = r.key ?? ''; kIn.blur(); } });
        kIn.addEventListener('change', () => {
          const nk = kIn.value.trim();
          if (!nk) { UI.toast(T('left.par.needKey'), { kind: 'bad' }); kIn.value = r.key ?? ''; return; }
          if (nk === r.key) return;
          App.change('Tabellenschlüssel geändert', (doc) => {
            const t = (doc.tables || []).find((x) => x.id === tb.id);
            const row = t && (t.rows || []).find((x) => x.id === r.id);
            if (!row) return false;
            row.key = nk;
          });
        });
        const valStr = typeof r.val === 'number' ? fmtFixed(r.val, 6) : (r.val ?? '');
        const vIn = h('input', { id: 'ptv-' + r.id, class: 'ptbl-val mono', value: valStr, placeholder: T('left.par.colVal'), 'aria-label': T('left.par.colVal'), spellcheck: 'false' });
        vIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') vIn.blur(); if (e.key === 'Escape') { vIn.value = valStr; vIn.classList.remove('invalid'); vIn.blur(); } });
        vIn.addEventListener('change', () => {
          const raw = vIn.value.trim();
          if (!raw) { vIn.classList.add('invalid'); UI.toast(T('left.par.needVal'), { kind: 'bad' }); return; }
          const n = parseNum(raw);
          let nextVal = raw;
          if (!isNaN(n)) nextVal = n;
          else {
            const res = Expr.tryEval(raw, Model.vars(App.doc).v, App.doc.tables || []);
            if (!res.ok) { vIn.classList.add('invalid'); UI.toast(T('hint.calcErr', { err: res.error }), { kind: 'bad' }); return; }
          }
          vIn.classList.remove('invalid');
          if (String(nextVal) === String(r.val)) return;
          App.change('Tabellenwert geändert', (doc) => {
            const t = (doc.tables || []).find((x) => x.id === tb.id);
            const row = t && (t.rows || []).find((x) => x.id === r.id);
            if (!row) return false;
            row.val = nextVal;
          }, { merge: 'tbl:' + r.id });
        });
        const rDel = h('button', { type: 'button', class: 'ptbl-rdel', 'data-tip': T('left.par.rowDel'), 'aria-label': T('left.par.rowDel') }, '×');
        rDel.onclick = () => App.change('Tabellenzeile entfernt', (doc) => {
          const t = (doc.tables || []).find((x) => x.id === tb.id);
          if (!t) return false;
          t.rows = (t.rows || []).filter((x) => x.id !== r.id);
        });
        rowEl.append(kIn, vIn, rDel);
        grid.append(rowEl);
      }
      card.append(grid);
      const foot = h('div', { class: 'ptbl-foot' });
      const addRow = h('button', { type: 'button', class: 'btn ghost small ptbl-addrow', id: 'ptadd-' + tb.id });
      addRow.innerHTML = icon('plus') + esc(T('left.par.addRow'));
      addRow.onclick = () => App.change('Tabellenzeile hinzugefügt', (doc) => {
        const t = (doc.tables || []).find((x) => x.id === tb.id);
        if (!t) return false;
        t.rows = t.rows || [];
        let k = 'Neu', idx = 1;
        while (t.rows.some((x) => String(x.key).toLowerCase() === k.toLowerCase())) { idx++; k = 'Neu' + idx; }
        t.rows.push({ id: uid('tr'), key: k, val: 10 });
      });
      const sampleKey = (tb.rows && tb.rows[0] && tb.rows[0].key) ? tb.rows[0].key : 'Schlüssel';
      foot.append(addRow, h('span', { class: 'ptbl-hint mono', title: `tabelle(${tb.name}; ${sampleKey})` }, `tabelle(${tb.name}; ${sampleKey})`));
      card.append(foot);
      tblSec.append(card);
    }
    const addTbl = h('button', { type: 'button', class: 'btn small', id: 'par-table-add', 'data-help': 'formulaTable' });
    addTbl.innerHTML = icon('plus') + esc(T('left.par.addTable'));
    addTbl.onclick = () => {
      let n = 1;
      while ((App.doc.tables || []).some((x) => x.name.toLowerCase() === ('tabelle' + n))) n++;
      App.change('Tabelle hinzugefügt', (doc) => {
        doc.tables = doc.tables || [];
        doc.tables.push({ id: uid('tb'), name: 'Tabelle' + n, rows: [{ id: uid('tr'), key: 'A', val: 10 }, { id: uid('tr'), key: 'B', val: 20 }] });
      });
    };
    tblSec.append(h('div', { class: 'btn-row' }, addTbl));
    wrap.append(tblSec);
    body.append(wrap);
  }
  function paramsCSV() {
    const q = (s) => (/[;"\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    const { v } = Model.vars(App.doc);
    const rows = [['Name', 'Wert', 'Ergebnis']];
    for (const p of App.doc.params || []) rows.push([p.name, typeof p.expr === 'number' ? fmtFixed(p.expr, 6) : p.expr, fmtFixed(v[p.name], 6)]);
    return rows.map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
  }
  // CSV lesen: Name;Wert (auch mit Komma oder Tab getrennt); bekannte Namen werden geändert, neue angelegt
  function importParamsCSV(txt) {
    const lines = String(txt).replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { UI.toast(T('left.par.csvEmpty'), { icon: 'info' }); return 0; }
    const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const cells = (l) => { const out = []; let cur = '', qq = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (qq) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') qq = false; else cur += c; } else if (c === '"') qq = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()); };
    let changed = 0, added = 0, bad = 0; const plan = [];
    for (const l of lines) {
      const [name, val] = cells(l);
      if (!name || /^name$/i.test(name)) continue;
      if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(name) || val == null || val === '') { bad++; continue; }
      const n = parseNum(val); plan.push([name, isNaN(n) ? val : n]);
    }
    if (!plan.length) { UI.toast(T('left.par.csvNone'), { icon: 'info' }); return 0; }
    App.change('Maße aus CSV', (doc) => {
      doc.params = doc.params || [];
      for (const [name, val] of plan) { const p = doc.params.find((x) => x.name === name); if (p) { if (String(p.expr) !== String(val)) { p.expr = val; changed++; } } else { doc.params.push({ id: uid('m'), name, expr: val }); added++; } }
    });
    UI.toast(T('left.par.csvSummary', { ch: changed, unit: changed === 1 ? T('left.par.csvUnitOne') : T('left.par.csvUnitMany'), add: added, bad: bad ? T('left.par.csvSkipped', { n: bad }) : '' }), { icon: 'check' });
    return changed + added;
  }
  // Fenster mit Schreibweise und 12 Beispielen zum Ausprobieren
  function formulaHelp() {
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    box.append(h('div', { class: 'hint-box', html: T('left.par.formulaIntroHtml') }));
    const demo = Object.entries(FORMULA_DEMO).map(([k, x]) => `${k} = ${x}`).join(', ');
    box.append(h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px' } }, T('left.par.formulaDemoFor', { demo })));
    const list = h('div', { class: 'formula-list' });
    for (const x of FORMULA_EXAMPLES) {
      let val = '';
      try { val = fmtFixed(Expr.eval(x.f, FORMULA_DEMO), 2); } catch (_) {}
      const cp = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': T('left.par.formulaCopyTip'), 'aria-label': T('left.par.formulaCopyTip') }); cp.innerHTML = icon('copy');
      cp.onclick = async () => { try { await navigator.clipboard.writeText(x.f); UI.toast(T('left.par.formulaCopied', { f: x.f }), { icon: 'check', ms: 1500 }); } catch (_) { UI.toast(T('left.par.formulaCopyFail'), { icon: 'info' }); } };
      list.append(h('div', { class: 'formula-row' }, h('div', { class: 'formula-top' }, h('code', null, x.f), h('b', { class: 'mono' }, '= ' + val), cp), h('p', null, x.e)));
    }
    box.append(list);
    const missing = Object.keys(FORMULA_DEMO).filter((k) => !(App.doc.params || []).some((p) => p.name.toLowerCase() === k));
    const actions = [{ label: T('common.close'), primary: true }];
    if (missing.length) actions.unshift({ label: T('left.par.formulaAddDemo'), run: () => { App.change('Beispiel-Maße angelegt', (doc) => { for (const k of missing) doc.params.push({ id: uid('m'), name: k, expr: FORMULA_DEMO[k] }); }); UI.toast(T('left.par.formulaAddedDemo', { n: missing.length }), { icon: 'check' }); } });
    UI.modal({ title: T('left.par.formulaExamples'), body: box, actions });
  }
  // ersetzt einen Maßnamen überall (Maße, Tabellen, Größen, Lage, Rundungen) – gibt zurück, ob er vorkam
  function replaceName(doc, old, repl) {
    const re = new RegExp('(^|[^A-Za-zÄÖÜäöüß_0-9])' + old.replace(/[$^.*+?()[\]{}|\\]/g, '\\$&') + '(?![A-Za-zÄÖÜäöüß_0-9])', 'gi');
    let hit = false;
    const fix = (s) => { if (typeof s !== 'string') return s; const r = s.replace(re, (m, pre) => { hit = true; return pre + repl; }); return /^-?\d+(\.\d+)?$/.test(r.trim()) ? +r : r; };
    for (const q of doc.params) q.expr = fix(q.expr);
    for (const tb of doc.tables || []) for (const r of tb.rows || []) r.val = fix(r.val);
    for (const v of doc.variants || []) if (v && v.values) for (const k of Object.keys(v.values)) v.values[k] = fix(v.values[k]);
    Model.walk(doc.items, (it) => { for (const k in it.p || {}) { if ((it.kind === 'group' && (k === 'op' || k === 'pt' || k === 'plane' || k === 'keep' || k === 'axis' || k === 'scaleUnit' || k === 'distUnit' || k === 'mode' || k === 'sourceId' || k === 'csv' || k === 'align')) || (it.kind === 'transform' && (k === 'target' || k === 'pivot')) || (it.kind === 'scale' && (k === 'target' || k === 'pivot' || k === 'uniform')) || (it.kind === 'deform' && (k === 'target' || k === 'mode' || k === 'axis' || k === 'bendAxis' || k === 'anchor' || k === 'flip')) || (it.kind === 'deleteBody' && (k === 'targets' || k === 'target')) || (it.kind === 'thicken' && (k === 'target' || k === 'face' || k === 'dir' || k === 'mode')) || (it.kind === 'rib' && (k === 'target' || k === 'side' || k === 'dir')) || (it.kind === 'vent' && (k === 'target' || k === 'face' || k === 'roundEnds')) || (it.kind === 'fins' && (k === 'target' || k === 'face')) || (it.kind === 'fillPattern' && (k === 'target' || k === 'face' || k === 'kind')) || (it.kind === 'web' && (k === 'target' || k === 'extend' || k === 'flip')) || (it.kind === 'wrap' && (k === 'target' || k === 'face' || k === 'mode')) || (it.kind === 'emboss' && (k === 'target' || k === 'face' || k === 'mode' || k === 'flip')) || (it.kind === 'splitFace' && (k === 'target' || k === 'face' || k === 'side')) || (it.kind === 'dome' && (k === 'target' || k === 'face' || k === 'shape' || k === 'flip')) || ((it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern') && (k === 'target' || k === 'face' || k === 'form' || k === 'norm' || k === 'end' || k === 'from' || k === 'ends' || (it.kind === 'keyway' && k === 'size') || k === 'profile' || k === 'autoNorm' || k === 'style' || k === 'autoDepth' || k === 'kind' || k === 'mode' || k === 'dir' || k === 'layout' || k === 'shape')) || (it.kind === 'sweep' && (k === 'sketch3dId' || k === 'wrapId')) || (it.kind === 'helix' && (k === 'form' || k === 'by' || k === 'dir' || k === 'shape' || k === 'prof' || k === 'profName')) || (it.kind === 'extrude' && (k === 'extent' || k === 'dir' || k === 'wallSide'))) continue; it.p[k] = fix(it.p[k]); } for (const k in it.t) it.t[k] = fix(it.t[k]); for (const f of it.finishes || []) { f.r = fix(f.r); if (f.r2 != null) f.r2 = fix(f.r2); if (f.a != null) f.a = fix(f.a); if (f.d1 != null) f.d1 = fix(f.d1); if (f.d2 != null) f.d2 = fix(f.d2); if (f.d3 != null) f.d3 = fix(f.d3); for (const fw of f.faceWalls || []) fw.r = fix(fw.r); } if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) d.v = fix(d.v); if (it.p && it.p.sketch3d) { for (const e of it.p.sketch3d.ents || []) for (const pk of ['a', 'm', 'b']) if (Array.isArray(e[pk])) for (let j = 0; j < 3; j++) e[pk][j] = fix(e[pk][j]); for (const d of it.p.sketch3d.dims || []) d.v = fix(d.v); } });
    for (const j of doc.joints || []) if (j.kind === 'distance' && j.dist != null) j.dist = fix(j.dist);
    return hit;
  }
  function replaceTableName(doc, old, repl) {
    const re = new RegExp('(tabelle\\s*\\(\\s*["\']?)' + old.replace(/[$^.*+?()[\]{}|\\]/g, '\\$&') + '(["\']?\\s*;)', 'gi');
    const fix = (s) => typeof s === 'string' ? s.replace(re, (_, a, b) => a + repl + b) : s;
    for (const q of doc.params || []) q.expr = fix(q.expr);
    for (const tb of doc.tables || []) for (const r of tb.rows || []) r.val = fix(r.val);
    Model.walk(doc.items, (it) => { for (const k in it.p || {}) it.p[k] = fix(it.p[k]); for (const k in it.t) it.t[k] = fix(it.t[k]); for (const f of it.finishes || []) { f.r = fix(f.r); if (f.r2 != null) f.r2 = fix(f.r2); if (f.a != null) f.a = fix(f.a); if (f.d1 != null) f.d1 = fix(f.d1); if (f.d2 != null) f.d2 = fix(f.d2); if (f.d3 != null) f.d3 = fix(f.d3); for (const fw of f.faceWalls || []) fw.r = fix(fw.r); } if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) d.v = fix(d.v); });
    for (const j of doc.joints || []) if (j.kind === 'distance' && j.dist != null) j.dist = fix(j.dist);
  }
  function renameTable(id, nv) {
    const tb = (App.doc.tables || []).find((x) => x.id === id); if (!tb || tb.name === nv) return;
    if ((App.doc.tables || []).some((x) => x.id !== id && x.name.toLowerCase() === nv.toLowerCase())) { UI.toast(T('left.par.tblExists'), { kind: 'bad' }); renderLeft(); return; }
    const old = tb.name;
    App.change('Tabelle umbenannt', (doc) => { const t = (doc.tables || []).find((x) => x.id === id); if (!t) return false; t.name = nv; replaceTableName(doc, old, nv); });
  }
  function removeTable(id) {
    const tb = (App.doc.tables || []).find((x) => x.id === id); if (!tb) return;
    App.change('Tabelle entfernt', (doc) => { doc.tables = (doc.tables || []).filter((x) => x.id !== id); });
  }
  function renameParam(id, nv) {
    const p = App.doc.params.find((x) => x.id === id); if (!p || p.name === nv) return;
    if (App.doc.params.some((x) => x.id !== id && x.name.toLowerCase() === nv.toLowerCase())) { UI.toast(T('left.par.paramExists'), { kind: 'bad' }); renderLeft(); return; }
    const old = p.name;
    App.change('Maß umbenannt', (doc) => {
      doc.params.find((x) => x.id === id).name = nv;
      for (const v of doc.variants || []) {
        if (v && v.values && Object.prototype.hasOwnProperty.call(v.values, old)) {
          v.values[nv] = v.values[old];
          delete v.values[old];
        }
      }
      replaceName(doc, old, nv);
    });
  }
  function removeParam(id) {
    const p = App.doc.params.find((x) => x.id === id); if (!p) return;
    // wo das Maß benutzt wird, bleibt sein aktueller Wert stehen – so ändert sich am Modell nichts
    const val = Model.vars(App.doc).v[p.name];
    const num = Number.isFinite(val) ? String(round(val, 4)) : '0';
    let used = false;
    App.change('Maß entfernt', (doc) => { doc.params = doc.params.filter((x) => x.id !== id); used = replaceName(doc, p.name, +num < 0 ? '(' + num + ')' : num); });
    if (used) UI.toast(T('left.par.paramReplaced', { name: p.name, val: fmt(+num, 3) }), { icon: 'info' });
  }

  // Abstand zwischen zwei Teilen: Achse wählen, Lücke eintippen
  function gapPop(anchor) {
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '240px' } });
    box.append(h('b', null, T('panel.gap.title')));
    let ax = 'x';
    const g0 = () => { const g = Actions.gapOf(null, ax); return g ? round(g.gap, 3) : 0; };
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    const draw = () => {
      body.innerHTML = '';
      body.append(UI.selectField({ id: 'gap-ax', label: T('panel.gap.dir'), value: ax, options: [['x', T('panel.gap.dirX')], ['y', T('panel.gap.dirY')], ['z', T('panel.gap.dirZ')]], onChange: (v) => { ax = v; draw(); } }));
      body.append(UI.numField({ id: 'gap-v', label: T('panel.gap.gapNow', { v: Units.fmtLenU(g0(), 2) }), value: g0(), onCommit: (v) => { const n = Model.num(v, Model.vars(App.doc).v, NaN); if (!isNaN(n)) { Actions.setGap(null, ax, n); UI.closePop(); } } }));
    };
    draw(); box.append(body, h('div', { class: 'hint-box', html: T('panel.gap.hint') }));
    UI.pop(anchor, box);
  }
  // ---------- Einstellungen (rechts) ----------
  let rightDeferred = false;
  function hasFocusedRightInput() {
    const body = $('#right-body');
    const ae = document.activeElement;
    if (!body || !ae || !body.contains(ae)) return false;
    if (ae.tagName === 'TEXTAREA') return true;
    if (ae.tagName !== 'INPUT') return false;
    const t = (ae.type || 'text').toLowerCase();
    return t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'submit' && t !== 'reset' && t !== 'range' && t !== 'color' && t !== 'file';
  }
  function renderRight(opts) {
    if (opts && opts.preserveFocus && hasFocusedRightInput()) { rightDeferred = true; return; }
    rightDeferred = false;
    const body = $('#right-body'); body.innerHTML = '';
    if (App.mode === 'drawing') { $('#right-title').textContent = T('panel.title.drawing'); Drawing.renderPanel(body); return; }
    if (Sketch.active) { $('#right-title').textContent = T('panel.title.sketch'); Sketch.renderPanel(body); return; }
    const items = App.selectedItems();
    if (!items.length && Datums.selected && Datums.find(Datums.selected)) { $('#right-title').textContent = T('panel.title.datumPlane'); Datums.renderPanel(body); return; }
    if (!items.length && Datums.selectedAxis && Datums.findAxis(Datums.selectedAxis)) { $('#right-title').textContent = T('panel.title.datumAxis'); Datums.renderAxisPanel(body); return; }
    if (!items.length && Datums.selectedPoint && Datums.findPoint(Datums.selectedPoint)) { $('#right-title').textContent = T('panel.title.datumPoint'); Datums.renderPointPanel(body); return; }
    if (!items.length && Datums.selectedCsys && Datums.findCsys(Datums.selectedCsys)) { $('#right-title').textContent = T('panel.title.datumCsys'); Datums.renderCsysPanel(body); return; }
    if (!items.length && typeof PointClouds !== 'undefined' && PointClouds.selected && PointClouds.find(PointClouds.selected)) { $('#right-title').textContent = T('panel.title.pointCloud'); PointClouds.renderPanel(body); return; }
    if (!items.length && Measure.selected && Measure.find(Measure.selected)) { $('#right-title').textContent = T('panel.title.measure'); Measure.renderPanel(body); return; }
    if (!items.length && typeof Joints !== 'undefined' && Joints.selected && (Joints.list.some((x) => x.id === Joints.selected) || (Joints.couplings && Joints.couplings.some((x) => x.id === Joints.selected)))) { $('#right-title').textContent = Joints.isCouplingSelected ? T('panel.title.coupling') : T('panel.title.joint'); Joints.renderPanel(body); return; }
    if (!items.length && typeof Notes !== 'undefined' && Notes.selectedPin && Notes.findPin(Notes.selectedPin)) { $('#right-title').textContent = T('panel.title.commentPin'); Notes.renderPanel(body); return; }
    if (!items.length) { $('#right-title').textContent = T('panel.title.project'); renderProject(body); return; }
    if (items.length > 1) { $('#right-title').textContent = T('panel.title.selection'); renderMulti(body, items); return; }
    $('#right-title').textContent = T('panel.title.props');
    renderItem(body, items[0]);
  }
  function renderProject(body) {
    const w = h('div', { class: 'props' });
    const nameF = h('div', { class: 'field' }, h('label', { for: 'proj-name' }, T('panel.proj.name')), h('div', { class: 'inp' }, h('input', { id: 'proj-name', value: App.doc.name, style: { fontFamily: 'var(--font)' } })));
    nameF.querySelector('input').addEventListener('change', (e) => { const v = e.target.value.trim() || 'Neues Projekt'; App.change('Projekt umbenannt', (doc) => { doc.name = v; }); });
    w.append(nameF);
    const isAsm = Model.isAssembly(App.doc);
    const dtRow = h('div', { class: 'mini-row', id: 'proj-doc-type', 'data-help': 'assemblyDoc' },
      h('span', { class: 'grow' }, T('asm.docKindLabel')),
      h('span', { class: 'doc-type-badge' + (isAsm ? ' asm' : '') }, isAsm ? T('doc.assembly') : T('doc.part')));
    w.append(dtRow);
    if (isAsm) {
      const ib = h('button', { type: 'button', class: 'btn primary', id: 'proj-insert-part', 'data-help': 'insertPart' });
      ib.innerHTML = icon('parts') + esc(T('asm.insertBtn'));
      ib.onclick = () => Comp.insertPartDialog();
      const fb = h('button', { type: 'button', class: 'btn', id: 'proj-insert-file', 'data-help': 'insertFromFile' });
      fb.innerHTML = icon('folder') + esc(T('asm.insertFromFileShort'));
      fb.onclick = () => Comp.insertFromFile();
      w.append(h('div', { class: 'btn-row' }, ib, fb));
      const sb = h('button', { type: 'button', class: 'btn', id: 'proj-auto-screws', 'data-help': 'autoScrews' });
      sb.innerHTML = icon('bolt') + esc(T('asm.autoScrewsBtn'));
      sb.onclick = () => Assembly.autoScrewsDialog();
      const pbBtn = h('button', { type: 'button', class: 'btn', id: 'proj-asm-pattern', 'data-help': 'asmPattern' });
      pbBtn.innerHTML = icon('patternRect') + esc(T('asm.patToolBtn'));
      pbBtn.onclick = (e) => Assembly.patternMenu(e.currentTarget);
      w.append(h('div', { class: 'btn-row' }, pbBtn, sb));
    }
    const poseSec = typeof Assembly !== 'undefined' && Assembly.poseSection ? Assembly.poseSection('proj') : null;
    if (poseSec) w.append(poseSec);
    const motSec = typeof Assembly !== 'undefined' && Assembly.motionSection ? Assembly.motionSection('proj') : null;
    if (motSec) w.append(motSec);
    const asmStepsSec = typeof Assembly !== 'undefined' && Assembly.stepsSection ? Assembly.stepsSection('proj') : null;
    if (asmStepsSec) w.append(asmStepsSec);
    const unitF = UI.selectField({ id: 'proj-unit', label: T('panel.proj.unit'), value: Units.key(), options: Units.OPTIONS, onChange: (v) => Units.set(v) });
    unitF.dataset.help = 'projectUnit';
    w.append(unitF);
    if (App.doc.items.length) {
      const ps = h('div', { class: 'section', id: 'proj-weak-sec' }, h('div', { class: 'section-h' }, T('panel.proj.weakTitle')));
      const wl = Weak.summary();
      if (wl) ps.append(wl.length ? Weak.rows(wl.slice(0, 4), null, true) : h('div', { class: 'hint-box' }, T('panel.proj.weakNone')), ...(wl.length > 4 ? [h('div', { class: 'hint-box' }, T('panel.proj.weakMore', { n: wl.length - 4 }))] : []));
      const wb = h('button', { type: 'button', class: 'btn small', id: 'proj-weak', 'data-help': 'weakSpots' }); wb.innerHTML = icon('target') + esc(wl ? T('panel.proj.weakAgain') : T('panel.proj.weakSearch'));
      wb.onclick = () => Weak.dialog();
      const cb = h('button', { type: 'button', class: 'btn small', id: 'proj-clashes', 'data-help': 'clashCheck' }); cb.innerHTML = icon('boolIntersect') + esc(T('menu.check.clashes'));
      cb.onclick = () => ClashCheck.open();
      ps.append(h('div', { class: 'btn-row' }, wb, cb));
      w.append(ps);
    }
    const pv = ViewPrefs.get();
    const lookSec = h('div', { class: 'section', id: 'proj-look-sec', 'data-help': 'studioFloorLight' }, h('div', { class: 'section-h' }, T('panel.proj.lookTitle')));
    const floorChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'proj-floor-reflect', checked: !!pv.floorReflect }), T('panel.proj.floorReflect'));
    floorChk.querySelector('input').onchange = (e) => ViewPrefs.set({ floorReflect: e.target.checked, ...(e.target.checked ? { look: 'studio' } : {}) });
    const lookOpenBtn = h('button', { type: 'button', class: 'btn small', id: 'proj-look-open' });
    lookOpenBtn.innerHTML = icon('sun') + esc(T('panel.proj.lookOpenBtn'));
    lookOpenBtn.onclick = () => ViewPrefs.openLookPanel();
    lookSec.append(floorChk, h('div', { class: 'btn-row', style: { marginTop: '6px' } }, lookOpenBtn));
    w.append(lookSec);
    const va = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, T('panel.proj.viewTitle')));
    va.append(UI.selectField({ id: 'view-grid', label: T('panel.proj.gridSize'), value: String(pv.grid), options: [['auto', T('panel.proj.gridAuto')], ['0.01', Units.fmtLenFixedU(0.01, 2)], ['0.1', Units.fmtLenFixedU(0.1, 2)], ['1', Units.fmtLenFixedU(1, 2)], ['10', Units.fmtLenFixedU(10, 2)], ['100', Units.fmtLenFixedU(100, 2)]], onChange: (val) => ViewPrefs.set({ grid: val === 'auto' ? 'auto' : parseFloat(val) }) }));
    const chk = (k, label) => { const l = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'view-' + k, checked: !!pv[k] }), label); l.querySelector('input').onchange = (e) => ViewPrefs.set({ [k]: e.target.checked }); return l; };
    va.append(UI.selectField({ id: 'view-quality', label: T('panel.proj.quality'), value: pv.quality, options: [['coarse', T('panel.proj.qCoarse')], ['normal', T('panel.proj.qNormal')], ['fine', T('panel.proj.qFine')], ['ultra', T('panel.proj.qUltra')]], onChange: (val) => ViewPrefs.set({ quality: val }) }));
    va.append(h('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } }, chk('adaptive', T('panel.proj.adaptive')), chk('gridOn', T('panel.proj.gridOn')), chk('planes', T('panel.proj.planes')), chk('axes', T('panel.proj.axes')), chk('notes', T('panel.proj.notes')), chk('ortho', T('panel.proj.ortho'))));
    w.append(va);
    const gr = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, T('panel.proj.snapTitle')));
    const f2 = h('div', { class: 'fields' });
    f2.append(UI.selectField({ id: 'grid', label: T('panel.proj.stepSize'), value: App.doc.settings.grid, options: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10].map((v) => [v, Units.fmtLenFixedU(v, 2)]), onChange: (v) => App.change('Raster geändert', (doc) => { doc.settings.grid = parseFloat(v); }) }));
    const snap = h('label', { class: 'check', style: { alignSelf: 'end', paddingBottom: '8px' } }, h('input', { type: 'checkbox', id: 'snap', checked: App.doc.settings.snap !== false }), T('panel.proj.snapOn'));
    snap.querySelector('input').onchange = (e) => App.change('Einrasten geändert', (doc) => { doc.settings.snap = e.target.checked; });
    const mag = h('label', { class: 'check', style: { paddingBottom: '4px' } }, h('input', { type: 'checkbox', id: 'magnet', checked: App.doc.settings.magnet !== false }), T('panel.proj.magnetOn'));
    mag.querySelector('input').onchange = (e) => App.change('Magnet geändert', (doc) => { doc.settings.magnet = e.target.checked; });
    f2.append(snap); gr.append(f2, mag); w.append(gr);
    const st = Print.stats();
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.proj.overview')));
    info.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.proj.objects')), h('b', { class: 'mono' }, String(Model.countItems(App.doc)))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.proj.totalSize')), h('b', { class: 'mono' }, st ? `${Units.fmtLen(st.x, 1)} × ${Units.fmtLen(st.y, 1)} × ${Units.fmtLen(st.z, 1)} ${Units.label()}` : '–'))));
    w.append(info);
    // 3D-Druck / Druckbett (Drucker-Auswahl, Bauraum-Warnung mit Drehvorschlag, Loch-Ausgleich)
    const pb = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0 }, (App.doc.settings && App.doc.settings.printBed) || {});
    const bedSec = h('div', { class: 'section', id: 'proj-bed-sec', 'data-help': 'printBed' }, h('div', { class: 'section-h' }, T('panel.proj.bedTitle')));
    const bedOn = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'proj-bed-on', checked: !!pb.enabled }), T('panel.proj.bedEnable'));
    bedOn.querySelector('input').onchange = (e) => {
      const on = e.target.checked;
      App.change(on ? 'Druckbett aktiviert' : 'Druckbett deaktiviert', (doc) => {
        doc.settings = doc.settings || {};
        doc.settings.printBed = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0 }, doc.settings.printBed || {}, { enabled: on });
      });
    };
    const printerVal = !pb.enabled ? '' : (Print.findPrinter(pb.printer) ? pb.printer : 'custom');
    const printerOpts = [
      ['', T('panel.proj.printerNone')],
      ...(Print.PRINTERS || []).map((p) => [p.id, `${p.name} (${p.x}×${p.y}×${p.z} mm)`]),
      ['custom', T('panel.proj.printerCustom')],
    ];
    const printerSel = UI.selectField({
      id: 'proj-printer', label: T('panel.proj.printer'), value: printerVal, options: printerOpts,
      onChange: (v) => Print.setPrinter(v),
    });
    printerSel.setAttribute('data-help', 'printerSelect');
    printerSel.style.marginTop = '8px';
    bedSec.append(bedOn, printerSel);
    const nozWrap = h('div', { style: { marginTop: '8px' } }, UI.numField({
      id: 'proj-bed-nozzle', label: T('panel.proj.nozzle'), value: Print.nozzle(), unit: 'mm', len: false, min: 0.1, max: 2, step: 0.1, expr: false,
      onCommit: (v) => Print.setNozzle(v),
    }));
    bedSec.append(nozWrap);
    if (pb.enabled) {
      const bedFields = h('div', { class: 'fields three', style: { marginTop: '8px' } });
      for (const [k, lbl] of [['x', T('common.width')], ['y', T('common.depth')], ['z', T('common.height')]]) {
        bedFields.append(UI.numField({
          id: 'proj-bed-' + k, label: lbl, value: pb[k], axis: k, unit: 'mm', min: 10, expr: false,
          onCommit: (v) => App.change('Druckbett geändert', (doc) => {
            doc.settings = doc.settings || {};
            doc.settings.printBed = Object.assign({ enabled: true, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0, printFit: '' }, doc.settings.printBed || {});
            doc.settings.printBed[k] = v;
            const pr = Print.findPrinter(doc.settings.printBed.printer);
            if (!pr || pr[k] !== v) doc.settings.printBed.printer = 'custom';
            doc.settings.custom = Object.assign({ x: 220, y: 220, z: 250 }, doc.settings.custom || {});
            doc.settings.custom[k] = v;
          }),
        }));
      }
      const fit = Print.fitCheck(pb, st);
      const bedStatus = h('div', { class: 'hint-box' + (!fit.fits ? ' warn' : ''), id: 'proj-bed-status', style: { marginTop: '8px' } });
      if (!fit.fits) {
        bedStatus.append(h('div', null, fit.summary));
        if (fit.suggestion && fit.suggestion.canFit) {
          const rotBtn = h('button', { type: 'button', class: 'btn', id: 'proj-bed-rotate', style: { marginTop: '6px' } }, T('ampel.rotateBtn'));
          rotBtn.onclick = () => Print.applyRotationSuggestion(fit.suggestion);
          bedStatus.append(rotBtn);
        }
      } else {
        const pPrefix = fit.printer ? fit.printer.name + ' · ' : T('panel.proj.bedPrefix');
        bedStatus.textContent = T('panel.proj.bedStatus', { prefix: pPrefix, x: Units.fmtLen(pb.x, 0), y: Units.fmtLen(pb.y, 0), z: Units.fmtLen(pb.z, 0), u: Units.label(), nozzle: fmt(pb.nozzle, 2) });
      }
      bedSec.append(bedFields, bedStatus);
    }
    const pfVal = Print.printFit();
    const pfSel = UI.selectField({
      id: 'proj-print-fit', label: T('panel.proj.printFitLabel'), value: pfVal,
      options: printFitProjOptions,
      onChange: (v) => Print.setPrintFit(v),
    });
    pfSel.setAttribute('data-help', 'printFit');
    pfSel.style.marginTop = '8px';
    bedSec.append(pfSel);
    if (pfVal) {
      const pfi = printFitInfo(pfVal);
      if (pfi) bedSec.append(h('small', { id: 'proj-print-fit-hint', style: { display: 'block', color: 'var(--muted)', marginTop: '4px' } }, T('panel.proj.printFitHint', { label: pfi.label, hole: pfi.mm > 0 ? `+${fmtFixed(pfi.mm, 1)}` : '0', bolt: pfi.mm > 0 ? `−${fmtFixed(pfi.mm, 1)}` : '0', desc: pfi.desc })));
    }
    if (st) {
      const nw = Print.nozzleWallCheck();
      if (nw.summary) {
        const nwBox = h('div', { class: 'hint-box' + (nw.warn ? ' warn' : ''), id: 'proj-nozzle-wall', 'data-help': 'nozzleWall', style: { marginTop: '8px' } }, h('div', null, nw.summary));
        if (nw.warn) {
          const showBtn = h('button', { type: 'button', class: 'btn', id: 'proj-nozzle-wall-show', style: { marginTop: '6px' } }, T('ampel.showSpotsBtn'));
          showBtn.onclick = () => Views.thin(true, { limit: nw.minWall });
          nwBox.append(showBtn);
        }
        bedSec.append(nwBox);
      }
      const orientRow = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
      const orientBtn = h('button', { type: 'button', class: 'btn', id: 'proj-orient-print', 'data-help': 'orientPrint' });
      orientBtn.innerHTML = icon('overhang') + esc(T('panel.proj.orientPrint'));
      orientBtn.onclick = () => Print.orientForPrint();
      const costBtn = h('button', { type: 'button', class: 'btn', id: 'proj-print-cost', 'data-help': 'printCost' });
      costBtn.innerHTML = icon('printer') + esc(T('panel.proj.printCost'));
      costBtn.onclick = () => Print.costDialog();
      orientRow.append(orientBtn, costBtn);
      bedSec.append(orientRow);
    }
    const hcVal = Print.holeComp();
    const hcChoices = [0, 0.1, 0.2, 0.3, 0.4];
    if (hcVal > 0 && !hcChoices.some((v) => Math.abs(v - hcVal) < 1e-4)) hcChoices.push(hcVal);
    hcChoices.sort((a, b) => a - b);
    const hcSel = UI.selectField({
      id: 'proj-hole-comp', label: T('panel.proj.holeCompLabel'), value: String(hcVal),
      options: hcChoices.map((v) => [String(v), v === 0 ? T('panel.proj.holeCompOff') : `+${fmt(v, 2)} mm`]),
      onChange: (v) => Print.setHoleComp(+v),
    });
    hcSel.setAttribute('data-help', 'holeComp');
    hcSel.style.marginTop = '8px';
    bedSec.append(hcSel);
    if (hcVal > 0) {
      bedSec.append(h('small', { style: { display: 'block', color: 'var(--muted)', marginTop: '4px' } }, T('panel.proj.holeCompHint', { v: fmt(hcVal, 2) })));
    }
    w.append(bedSec);
    // Material und Gewicht des ganzen Projekts (exaktes Volumen aus dem CAD-Kern)
    const curMat = App.doc.settings.material || 'CFK';
    const ms = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.proj.matTitle')));
    ms.append(UI.selectField({ id: 'proj-mat', label: T('panel.proj.matLabel'), value: curMat, options: materialOptions(), onChange: (v) => App.change('Material gewählt', (doc) => { doc.settings.material = v; }) }));
    ms.append(materialInfoBox(Mass.projectMaterial(), 'proj-mat-info'));
    const vRow = h('b', { class: 'mono' }, '…'), gRow = h('b', { class: 'mono' }, '…');
    ms.append(h('div', { class: 'mini-list', style: { marginTop: '8px' } },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.proj.volume')), vRow),
      h('div', { class: 'mini-row', 'data-help': 'massProps' }, h('span', { class: 'grow' }, T('panel.proj.weight')), gRow)));
    w.append(ms);
    const cRow = h('b', { class: 'mono' }, '…');
    const ml = ms.querySelector('.mini-list');
    ml.append(h('div', { class: 'mini-row', 'data-tip': T('panel.proj.cogTip') }, h('span', { class: 'grow' }, T('panel.proj.cog')), cRow));
    const own = h('div', { class: 'hint-box', hidden: true });
    const cog = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'proj-cog', checked: !!ViewPrefs.get().cog }), T('panel.proj.cogShow'));
    cog.querySelector('input').onchange = (e) => ViewPrefs.set({ cog: e.target.checked });
    ms.append(cog, own);
    const bomB = h('button', { type: 'button', class: 'btn', id: 'proj-bom', 'data-help': 'bom' }); bomB.innerHTML = icon('list') + esc(T('panel.proj.bom')); bomB.onclick = () => Mass.bomDialog();
    const repB = h('button', { type: 'button', class: 'btn', id: 'proj-report-pdf', 'data-help': 'reportPdf' }); repB.innerHTML = icon('file') + esc(T('panel.proj.reportPdf')); repB.onclick = () => Measure.reportDialog();
    ms.append(h('div', { class: 'btn-row', style: { marginTop: '8px' } }, bomB, repB));
    Mass.measure().then((r) => {
      if (!r) { vRow.textContent = gRow.textContent = cRow.textContent = '–'; return; }
      vRow.textContent = Units.fmtVolU(r.volume, 3); gRow.textContent = Mass.gText(r.mass);
      cRow.textContent = r.com ? r.com.map((v) => Units.fmtLen(v, 1)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '') : '–';
      const n = (r.parts || []).filter((p) => p.own && !p.fixed).length, nf = (r.parts || []).filter((p) => p.fixed).length;
      const bits = [];
      if (n) bits.push(n === 1 ? T('panel.proj.ownMatOne') : T('panel.proj.ownMatMany', { n }));
      if (nf) bits.push(nf === 1 ? T('panel.proj.fixedOne') : T('panel.proj.fixedMany', { n: nf }));
      const nm = (r.parts || []).filter((p) => p.missing).length;
      if (nm) bits.push(nm === 1 ? T('panel.proj.missingOne') : T('panel.proj.missingMany', { n: nm }));
      if (bits.length) { own.hidden = false; own.innerHTML = T('panel.proj.matSummaryJoin', { bits: bits.join(', ') }); }
    });
    if (typeof Notes !== 'undefined' && Notes.pins) {
      const allPins = Notes.pins();
      const openPins = allPins.filter((p) => !p.done).length;
      const pinSec = h('div', { class: 'section', id: 'proj-pins-sec', 'data-help': 'commentPins' },
        h('div', { class: 'section-h' }, T('notes.pinProjSec')),
        h('div', { class: 'mini-list' },
          h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('notes.pinProjSummary', { total: allPins.length, open: openPins })))));
      const pinAdd = h('button', { type: 'button', class: 'btn small', id: 'proj-pin-add' });
      pinAdd.innerHTML = icon('commentPin') + esc(T('notes.pinAddBtn'));
      pinAdd.onclick = () => Notes.startPin();
      const pinList = h('button', { type: 'button', class: 'btn small', id: 'proj-pin-list' });
      pinList.innerHTML = icon('list') + esc(T('notes.pinListBtn'));
      pinList.onclick = () => Notes.pinsDialog();
      pinSec.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, pinAdd, pinList));
      w.append(pinSec);
    }
    if (typeof Comp !== 'undefined' && Comp.allPartRefs) {
      const allRefs = Comp.allPartRefs();
      if (allRefs.length) {
        const frz = allRefs.filter((r) => r.frozen).length;
        const rSec = h('div', { class: 'section pro', id: 'proj-part-refs-sec', 'data-help': 'partRefs' },
          h('div', { class: 'section-h' }, T('partRefs.projTitle')),
          h('div', { class: 'mini-list' },
            h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('partRefs.projSummary', { total: allRefs.length, active: allRefs.length - frz, frozen: frz })))));
        const rBtn = h('button', { type: 'button', class: 'btn small', id: 'proj-part-refs-btn' });
        rBtn.innerHTML = icon('link') + esc(T('partRefs.manageBtn'));
        rBtn.onclick = () => Comp.refsDialog(null);
        rSec.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, rBtn));
        w.append(rSec);
      }
    }
    w.append(h('div', { class: 'hint-box', html: T('panel.proj.tipHtml') }));
    body.append(w);
  }
  function renderMulti(body, found) {
    const w = h('div', { class: 'props' });
    w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, T('panel.multi.selectedCount', { n: found.length }))));
    const allHole = found.every((f) => f.item.role === 'hole');
    w.append(roleSwitch(allHole ? 'hole' : found.every((f) => f.item.role !== 'hole') ? 'solid' : null, (r) => Actions.setRole(null, r)));
    const r1 = h('div', { class: 'btn-row' });
    const g = h('button', { type: 'button', class: 'btn primary' }); g.innerHTML = icon('group') + esc(T('panel.multi.group')); g.onclick = () => Actions.group();
    const topSel = [...new Set(found.map((f) => (Model.topOf(App.doc, f.item.id) || {}).id).filter(Boolean))];
    const d = h('button', { type: 'button', class: 'btn' }); d.innerHTML = icon('copy') + esc(T('common.duplicate')); d.onclick = () => Actions.duplicate();
    const x = h('button', { type: 'button', class: 'btn danger' }); x.innerHTML = icon('trash') + esc(T('common.delete')); x.onclick = () => Actions.remove();
    r1.append(g);
    if (topSel.length >= 2 && !App.ctx) {
      const fldB = h('button', { type: 'button', class: 'btn', id: 'btn-multi-folder', 'data-help': 'treeFolder' });
      fldB.innerHTML = icon('folder') + esc(T('menu.tree.toFolder'));
      fldB.onclick = () => Actions.createFolder(topSel);
      r1.append(fldB);
    }
    r1.append(d, x); w.append(r1);
    // zwei Teile: kleinster Abstand (nur verschiedene Hauptteile, nicht ein Teil mit seiner eigenen Gruppe)
    const tops = found.length === 2 ? found.map((f) => (Model.topOf(App.doc, f.item.id) || f.item).id) : null;
    if (tops && tops[0] !== tops[1]) {
      const ds = h('div', { class: 'section', id: 'min-dist', 'data-help': 'minDistance' }, h('div', { class: 'section-h' }, T('panel.multi.minDist')));
      const val = h('b', { class: 'mono', id: 'min-dist-val' }, '…'); ds.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, `${Model.label(found[0].item)} ↔ ${Model.label(found[1].item)}`), val));
      Measure.minDistance(tops).then((r) => { val.textContent = !r ? '–' : r.d < 1e-6 ? T('panel.multi.touching') : Units.fmtLenU(r.d, 3); });
      w.append(ds);
    }
    const al = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.multi.align')));
    const ar = h('div', { class: 'btn-row' });
    for (const [m, l] of [['left', T('panel.multi.alignLeft')], ['cx', T('panel.multi.alignCx')], ['right', T('panel.multi.alignRight')], ['front', T('panel.multi.alignFront')], ['cy', T('panel.multi.alignCy')], ['back', T('panel.multi.alignBack')], ['bottom', T('panel.multi.alignBottom')], ['top', T('panel.multi.alignTop')]]) {
      const b = h('button', { type: 'button', class: 'btn small' }, l); b.onclick = () => Actions.align(null, m); ar.append(b);
    }
    al.append(ar); w.append(al);
    w.append(colorSection((c) => App.change('Farbe geändert', (doc) => { for (const f of found) { const tgt = Model.find(doc, f.item.id).item; if (c) { tgt.color = c; tgt.colorSet = true; } else delete tgt.colorSet; } }), found[0].item.color, found.some((f) => f.item.colorSet)));
    body.append(w);
  }
  // Formschritt mit Modus: eigener Körper oder mit einem früheren Körper verrechnen (nur Teile ganz oben im Verlauf)
  function opSection(it) {
    const idx = App.doc.items.indexOf(it);
    const isPatOp = Features.isOp(it) && it.p.op === 'pattern' && !(it.children || []).some((c) => c.kind === 'rib');
    if (idx < 0 || (it.kind === 'group' && !isPatOp) || it.kind === 'transform' || it.kind === 'scale' || it.kind === 'deform' || it.kind === 'deleteBody' || it.kind === 'sketch3d' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut') return null;
    const targets = App.doc.items.slice(0, idx).filter((x) => x.role !== 'hole' && !x.suppressed && !(x.kind === 'group' && x.p && x.p.assembly) && x.kind !== 'ref' && x.kind !== 'rib' && x.kind !== 'vent' && x.kind !== 'fins' && x.kind !== 'fillPattern' && x.kind !== 'web' && x.kind !== 'wrap' && x.kind !== 'emboss' && x.kind !== 'splitFace' && x.kind !== 'dome' && x.kind !== 'mirrorStep' && x.kind !== 'deleteBody' && x.kind !== 'sketch3d' && x.kind !== 'boss' && x.kind !== 'lipGroove' && x.kind !== 'undercut' && x.kind !== 'circlipGroove' && x.kind !== 'keyway' && x.kind !== 'splineProfile' && x.kind !== 'knurl' && x.kind !== 'gripPattern' && x.kind !== 'stackHole' && x.kind !== 'asmCut' && !(x.kind === 'transform' && !(x.p && x.p.copy)) && x.kind !== 'scale' && x.kind !== 'deform' && !(x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) && !(x.op && x.op.target === it.id));
    if (!targets.length && !it.op) return null;
    const sec = h('div', { class: 'section', id: 'op-sec', 'data-help': 'bodyOp' }, h('div', { class: 'section-h' }, T('panel.op.title')));
    const type = it.op ? it.op.type : 'new';
    const tgt = it.op ? it.op.target : (targets[targets.length - 1] || {}).id;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({ id: 'op-type', label: T('panel.op.what'), value: type, options: [['new', T('panel.op.new')], ['join', T('panel.op.join')], ['cut', T('panel.op.cut')], ['common', T('panel.op.common')]], onChange: (v) => Actions.setOp(it.id, v === 'new' ? null : v, tgt) }));
    if (type !== 'new') fl.append(UI.selectField({ id: 'op-target', label: T('panel.op.target'), value: tgt, options: targets.map((x) => [x.id, Model.label(x)]), onChange: (v) => Actions.setOp(it.id, type, v) }));
    sec.append(fl);
    const into = App.mergedInto(it.id), intoF = into ? Model.find(App.doc, into) : null;
    if (type !== 'new') sec.append(h('div', { class: 'hint-box' }, intoF ? T('panel.op.mergedHint', { name: Model.label(intoF.item) }) : T('panel.op.missingHint')));
    return sec;
  }
  function roleSwitch(role, onSet) {
    const s = h('div', { class: 'role-switch', role: 'group', 'aria-label': T('panel.role.aria') });
    const a = h('button', { type: 'button', 'aria-pressed': role === 'solid' ? 'true' : 'false' }); a.innerHTML = icon('solid') + esc(T('common.body'));
    const b = h('button', { type: 'button', class: 'hole', 'aria-pressed': role === 'hole' ? 'true' : 'false' }); b.innerHTML = icon('hole') + esc(T('common.hole'));
    a.onclick = () => onSet('solid'); b.onclick = () => onSet('hole');
    s.append(a, b); return s;
  }
  // Farbe: zehn feste Töne oder jede beliebige Farbe. Metall, Kohlefaser, Holz und Glas zeigen im Studio-Look
  // die Farbe ihres Werkstoffs, bis man selbst eine Farbe wählt („Farbe vom Werkstoff“ nimmt das zurück).
  function colorSection(onPick, cur, set, it) {
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.color.title')));
    const row = h('div', { class: 'colors' });
    for (const c of COLORS) { const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': c.c === cur ? 'true' : 'false', style: { background: c.c } }); b.onclick = () => onPick(c.c); row.append(b); }
    const free = h('input', { type: 'color', id: 'item-color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#2f9e91', 'aria-label': T('panel.color.own'), 'data-tip': T('panel.color.own') });
    free.addEventListener('change', () => onPick(free.value.toLowerCase()));
    row.append(h('label', { class: 'color-free', 'data-tip': T('panel.color.anyTip') }, free));
    sec.append(row);
    const L = it ? Viewer.lookOf(it.mat || (App.doc.settings && App.doc.settings.material)) : null;
    if (L && L.nat) {
      if (set) { const b = h('button', { type: 'button', class: 'btn ghost', id: 'item-color-mat' }); b.innerHTML = icon('undo') + esc(T('panel.color.fromMat')); b.onclick = () => onPick(null); sec.append(h('div', { class: 'btn-row' }, b)); }
      else sec.append(h('div', { class: 'hint-box' }, T('panel.color.matHint', { mat: it.mat || App.doc.settings.material })));
    }
    return sec;
  }
  function edgeRuleMenu(id, anchor) {
    UI.menu(anchor, [
      { icon: 'pointer', label: T('menu.edge.convex'), id: 'er-convex', help: 'edgeRules', run: () => Select.edgesByRule(id, 'convex') },
      { icon: 'pointer', label: T('menu.edge.concave'), id: 'er-concave', help: 'edgeRules', run: () => Select.edgesByRule(id, 'concave') },
      { icon: 'pointer', label: T('menu.edge.all'), id: 'er-all', help: 'edgeRules', run: () => Select.edgesByRule(id, 'all') },
    ]);
  }
  // Alle Kanten einer Fläche: wählen, abrunden oder abschrägen (KP-15)
  function faceEdgeList(face) { return Viewer.faceEdges(face.id, face.idx).map((edgeIdx) => ({ id: face.id, edgeIdx })); }
  function faceEdgeMenu(face, anchor) {
    const list = faceEdgeList(face);
    if (!list.length) { UI.toast(T('menu.edge.faceNone'), { icon: 'info' }); return; }
    UI.menu(anchor, [
      { icon: 'pointer', label: T('menu.edge.faceSelect', { n: list.length }), id: 'fe-select', help: 'faceEdges', run: () => App.select([face.id], { edges: list }) },
      { icon: 'fillet', label: T('menu.edge.faceFillet', { v: Units.fmtLenU(1, 2) }), id: 'fe-fillet', help: 'faceEdges', run: () => Actions.addFinish('fillet', 1, list) },
      { icon: 'chamfer', label: T('menu.edge.faceChamfer', { v: Units.fmtLenU(1, 2) }), id: 'fe-chamfer', help: 'faceEdges', run: () => Actions.addFinish('chamfer', 1, list) },
    ]);
  }
  function renderItem(body, f) {
    const it = f.item; const V = Model.itemVars(App.doc, it.id);
    const outerV = (() => {
      let v = Model.vars(App.doc).v;
      for (const anc of Model.parentsOf(App.doc, it.id)) if (anc.userPart) v = Model.scopeVars(v, anc.userPart);
      return v;
    })();
    const w = h('div', { class: 'props' });
    const title = h('div', { class: 'prop-title' });
    const nameInp = h('input', { id: 'item-name', value: Model.label(it), 'aria-label': T('common.name') });
    nameInp.addEventListener('change', () => { const v = nameInp.value.trim(); if (v) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = v; }); });
    nameInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nameInp.blur(); });
    const isFrozen = it.kind === 'import' && it.p && it.p.frozen;
    const kindLabel = isFrozen ? T('kind.frozen') : it.kind === 'part' ? (LIBMAP[it.p.lib] || {}).label || T('kind.part') : KINDS[it.kind].label;
    title.append(nameInp);
    if (kindLabel && kindLabel !== Model.label(it)) title.append(h('span', { class: 'kind-badge' }, kindLabel));
    const exb = h('button', { type: 'button', class: 'icon-btn', id: 'item-explain', 'aria-label': T('common.explainStep'), 'data-tip': T('common.explainStep'), 'data-help': 'explainStep' }); exb.innerHTML = icon('help');
    exb.onclick = () => Explain.dialog(it.id); title.append(exb);
    w.append(title);
    // Notiz am Schritt (KP-55): eigener Text, steht auch in der Zeitleiste
    {
      const nd = h('details', { class: 'section note-sec', id: 'note-sec', 'data-help': 'stepNote' }, h('summary', { class: 'section-h' }, it.note ? T('panel.item.note') : T('panel.item.addNote')));
      const ta = h('textarea', { id: 'item-note', rows: 3, placeholder: T('panel.item.notePh'), 'aria-label': T('panel.item.noteAria') });
      ta.value = it.note || '';
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.addEventListener('change', () => { const v = ta.value.trim(); if (v === (it.note || '')) return; App.change(v ? 'Notiz geändert' : 'Notiz entfernt', (doc) => { const x = Model.find(doc, it.id).item; if (v) x.note = v; else delete x.note; }); });
      nd.append(ta);
      if (it.note) nd.open = true;
      w.append(nd);
    }
    const rightIssues = RefFix.issuesOf(it.id);
    const shownKeys = new Set();
    for (const e of App.errorsFor(it.id)) {
      if (RefFix.isRefError(e)) {
        const iss = e.finishId
          ? rightIssues.find((x) => x.finishId === e.finishId)
          : rightIssues.find((x) => x.kind === 'extrude-toFace');
        if (iss) shownKeys.add(iss.key);
        const box = h('div', { class: 'warn-box', 'data-help': 'refFix' }, h('span', null, e.message));
        const brow = h('div', { class: 'btn-row' });
        if (iss) {
          const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-reffix': '1', 'data-help': 'refFix' });
          fb.innerHTML = icon('warn') + esc(T('panel.item.pickAgain'));
          fb.onclick = () => RefFix.start(iss);
          brow.append(fb);
        }
        if (e.finishId) {
          const fin = (it.finishes || []).find((x) => x.id === e.finishId);
          const rmLabel = fin && fin.type === 'chamfer' ? T('panel.item.removeChamfer') : fin && fin.type === 'cornerChamfer' ? T('panel.item.removeCornerChamfer') : fin && fin.type === 'fullFillet' ? T('panel.item.removeFullFillet') : fin && fin.type === 'faceFillet' ? T('panel.item.removeFaceFillet') : fin && fin.type === 'partingDraft' ? T('panel.item.removePartingDraft') : fin && fin.type === 'shell' ? T('panel.item.removeShell') : T('panel.item.removeFillet');
          const b = h('button', { type: 'button', class: 'btn small' }, rmLabel);
          b.onclick = () => Actions.removeFinish(it.id, e.finishId);
          brow.append(b);
        }
        if (brow.children.length) box.append(brow);
        w.append(box);
        continue;
      }
      const box = h('div', { class: 'err-box' }, h('span', null, e.message));
      if (e.code === 'toobig' && e.max > 0) { const b = h('button', { type: 'button', class: 'btn small' }, T('panel.item.setToMax', { v: Units.fmtLenU(e.max, 1) })); b.onclick = () => Actions.setFinish(it.id, e.finishId, { r: e.max }); box.append(h('div', null, b)); }
      w.append(box);
    }
    for (const iss of rightIssues) {
      if (shownKeys.has(iss.key)) continue;
      const box = h('div', { class: 'warn-box', 'data-help': 'refFix' }, h('span', null, iss.message));
      const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-reffix': '1', 'data-help': 'refFix' });
      fb.innerHTML = icon('warn') + esc(T('panel.item.pickAgain'));
      fb.onclick = () => RefFix.start(iss);
      box.append(h('div', { class: 'btn-row' }, fb));
      w.append(box);
    }
    if (it.link) {
      const src = Model.find(App.doc, it.link);
      const ls = h('div', { class: 'section', id: 'link-sec', 'data-help': 'linkedCopy' }, h('div', { class: 'section-h' }, T('panel.item.linkedTitle')));
      ls.append(h('div', { class: src && !it.linkLost ? 'hint-box' : 'err-box' }, src && !it.linkLost ? T('panel.item.linkedActive', { name: Model.label(src.item) }) : T('panel.item.linkedLost')));
      const row = h('div', { class: 'btn-row' });
      if (src) { const b = h('button', { type: 'button', class: 'btn', id: 'link-src' }); b.innerHTML = icon('pointer') + esc(T('panel.item.selectOriginal')); b.onclick = () => App.select([it.link]); row.append(b); }
      const u = h('button', { type: 'button', class: 'btn ghost', id: 'link-off' }); u.innerHTML = icon('copy') + esc(T('panel.item.unlink')); u.onclick = () => Actions.unlink(it.id); row.append(u);
      ls.append(row); w.append(ls);
    }
    // Eltern und Kinder: worauf dieses Teil aufbaut und was von ihm abhängt (KP-11)
    if (App.doc.items.includes(it)) {
      const deps = Model.dependencies(App.doc), up = deps.filter((x) => x.from === it.id), down = deps.filter((x) => x.to === it.id);
      if (up.length || down.length) {
        const ds = h('details', { class: 'section deps', id: 'deps', 'data-help': 'dependencies' }, h('summary', { class: 'section-h' }, T('panel.item.depsTitle', { n: up.length + down.length })));
        const nm = (id) => { const f = Model.find(App.doc, id); return f ? Model.label(f.item) : '–'; };
        const line = (txt, id) => { const r = h('div', { class: 'mini-row dep-row' }, h('span', { class: 'grow' }, txt)); if (id && Model.find(App.doc, id)) { r.style.cursor = 'pointer'; r.onclick = () => App.select([id]); } return r; };
        for (const x of up) ds.append(line(`${x.what} „${nm(x.to)}“`, x.to));
        const back = { 'abgezogen von': 'wird hiervon abgezogen', 'vereinigt mit': 'ist hiermit vereinigt', 'Schnittmenge mit': 'bildet hiermit die Schnittmenge', 'verrechnet mit': 'ist hiermit verrechnet', 'versetzt': 'versetzt diesen Körper', 'versetzte Kopie von': 'ist eine versetzte Kopie hiervon', 'skaliert': 'skaliert diesen Körper', 'löscht Körper': 'löscht diesen Körper als Schritt', 'übernimmt Messwert von': 'übernimmt einen Messwert hiervon', 'dickt Fläche auf von': 'dickt eine Fläche hiervon auf', 'Platte von Fläche aus': 'ist eine aufgedickte Platte hiervon', 'Rippe an': 'verstärkt diesen Körper als Rippe', 'Lüftungsgitter in': 'schneidet ein Lüftungsgitter in diesen Körper', 'Kühlrippen auf': 'setzt Kühlrippen auf diesen Körper', 'Steg-Netz an': 'verstärkt diesen Körper als Steg-Netz', 'wickelt um': 'wickelt eine Skizze hierum', 'folgt gewickelter Linie von': 'läuft als Profil an dieser Wickel-Linie entlang', 'folgt 3D-Skizze': 'läuft als Profil entlang dieser 3D-Skizze', '3D-Skizze fängt an': '3D-Skizze hängt an einer Ecke hiervon', 'spiegelt Schritt': 'wird hiervon gespiegelt', 'spiegelt an Fläche von': 'spiegelt an einer Fläche hiervon', 'Schraubdom auf': 'trägt einen Schraubdom auf', 'Lippe an': 'bekommt hiervon eine Stecklippe', 'Nut in': 'bekommt hiervon eine Nut', 'verknüpfte Kopie von': 'ist eine verknüpfte Kopie hiervon', 'Baugruppen-Muster von': 'ist eine gemusterte Kopie hiervon', 'gespiegelt von': 'ist eine gespiegelte Kopie hiervon', 'Skizze übernimmt Kante von': 'übernimmt Kanten hiervon', 'Rohr hängt an': 'hat Rohrpunkte hieran', 'hochgezogen bis Fläche von': 'wird bis zu dieser Fläche hochgezogen', 'dreht bis Fläche von': 'dreht bis zu einer Fläche hiervon' };
        for (const x of down) ds.append(line(x.datum ? T('panel.item.depDatum', { name: x.datum }) : x.axis ? T('panel.item.depAxis', { name: x.axis }) : x.point ? T('panel.item.depPoint', { name: x.point }) : x.csys ? T('panel.item.depCsys', { name: x.csys }) : T('panel.item.depChild', { name: nm(x.from), what: back[x.what] || T('panel.item.depDefault') }), x.datum || x.axis || x.point || x.csys ? null : x.from));
        if (down.length) ds.open = true;
        w.append(ds);
      }
    }
    if (typeof Comp !== 'undefined' && Comp.refsSection) {
      const prs = Comp.refsSection(it);
      if (prs) w.append(prs);
    }
    const copies = []; Model.walk(App.doc.items, (x) => { if (x.link === it.id) copies.push(x); });
    if (copies.length) w.append(h('div', { class: 'hint-box', id: 'link-count' }, copies.length === 1 ? T('panel.item.linkedCountOne') : T('panel.item.linkedCountMany', { n: copies.length })));
    const isRef = it.kind === 'ref';
    const isMoveOnly = (it.kind === 'transform' && !(it.p && it.p.copy)) || it.kind === 'scale' || it.kind === 'deform' || it.kind === 'deleteBody' || it.kind === 'sketch3d' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) || it.kind === 'mirrorStep';
    const isMergedStep = isMoveOnly || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut';
    if (!isMergedStep && !isRef) w.append(roleSwitch(it.role, (r) => Actions.setRole([it.id], r)));
    if (!isRef) { const opSec = opSection(it); if (opSec) w.append(opSec); }
    // Maße aus „Meine Teile“ (lokale Parameter je eingesetztem Teil)
    if (it.userPart && Array.isArray(it.userPart.params) && it.userPart.params.length) {
      const upSec = h('div', { class: 'section', id: 'userpart-sec', 'data-help': 'userLibrary' },
        h('div', { class: 'section-h' }, T('panel.item.userPartTitle', { name: it.userPart.name || T('panel.item.myPart') })));
      const upFields = h('div', { class: 'fields', id: 'userpart-fields' });
      let runV = outerV;
      it.userPart.params.forEach((qp, idx) => {
        const evalScope = runV;
        const nf = UI.numField({
          id: 'up-' + idx,
          label: qp.label || qp.name,
          value: qp.expr,
          unit: qp.unit ?? 'mm',
          vars: evalScope,
          onCommit: (val) => App.change('Maß geändert', (doc) => {
            const x = Model.find(doc, it.id);
            if (!x || !x.item.userPart || !x.item.userPart.params[idx]) return false;
            x.item.userPart.params[idx].expr = val;
          }, { merge: 'up:' + it.id + ':' + idx }),
        });
        const inp = nf.querySelector('input');
        if (inp) inp.dataset.upName = qp.name;
        upFields.append(nf);
        runV = Model.scopeVars(runV, { params: [qp], tables: it.userPart.tables });
      });
      upSec.append(upFields);
      w.append(upSec);
    }
    // Maße oder Bauteil-Verweis
    if (isRef) {
      const refDoc = Model.resolveDoc(it.p && it.p.docId);
      const isSub = !!(refDoc ? Model.isAssembly(refDoc) : (it.p && it.p.docType === 'assembly'));
      const refSec = h('div', { class: 'section', id: 'ref-sec', 'data-help': isSub ? 'subAssembly' : 'assemblyDoc' }, h('div', { class: 'section-h' }, isSub ? T('asm.subAsmTitle') : T('asm.refTitle')));
      if (refDoc) {
        if (isSub) {
          const subItems = (refDoc.items || []).filter((x) => !x.suppressed);
          refSec.append(h('div', { class: 'hint-box' }, T('asm.subAsmActive', { name: refDoc.name || T('doc.assembly'), n: subItems.length, unit: subItems.length === 1 ? T('asm.partOne') : T('asm.partMany') })));
          if (subItems.length) {
            const subV = Model.vars(refDoc).v;
            const ml = h('div', { class: 'mini-list', style: { marginBottom: '8px' } });
            for (const c of subItems) {
              ml.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, Model.label(c)), h('span', { class: 'mono muted' }, Model.sizeText(c, subV))));
            }
            refSec.append(ml);
          }
        } else {
          const refCnt = Model.countItems(refDoc);
          refSec.append(h('div', { class: 'hint-box' }, T('asm.refActive', { name: refDoc.name || 'Bauteil', n: refCnt, unit: refCnt === 1 ? T('common.object') : T('common.objects') })));
        }
      } else {
        refSec.append(h('div', { class: 'err-box' }, T('asm.refMissingErr', { name: (it.p && it.p.docName) || Model.label(it) })));
      }
      const br = h('div', { class: 'btn-row' });
      const ob = h('button', { type: 'button', class: 'btn primary', id: 'btn-ref-open' });
      ob.innerHTML = icon('edit') + esc(isSub ? T('asm.openSubAsm') : T('asm.openPart'));
      ob.disabled = !refDoc;
      ob.onclick = () => Comp.openRef(it.id);
      br.append(ob);
      if (typeof Comp !== 'undefined' && Comp.canReplace && Comp.canReplace(it, App.doc)) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'btn-ref-replace', 'data-help': 'replacePart' });
        rb.innerHTML = icon('replace') + esc(T('asm.replacePartShort'));
        rb.onclick = () => Comp.replacePartDialog(it.id);
        br.append(rb);
      }
      refSec.append(br, h('div', { class: 'hint-box' }, isSub ? T('asm.subAsmHint') : T('asm.refHint')));
      w.append(refSec);
    } else {
    const three = !!(KINDS[it.kind] && KINDS[it.kind].params.length === 3);
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, three ? T('panel.item.dimsWithUnit', { u: Units.label() }) : T('panel.item.dims')));
    const setP = (k, val) => App.change('Maß geändert', (doc) => { Model.find(doc, it.id).item.p[k] = val; }, { merge: 'p:' + it.id + ':' + k });
    if (KINDS[it.kind] && KINDS[it.kind].params.length) {
      const fl = h('div', { class: 'fields' + (KINDS[it.kind].params.length === 3 ? ' three' : '') });
      for (const q of KINDS[it.kind].params) fl.append(UI.numField({ id: 'p-' + q.k, label: q.label, value: it.p[q.k], unit: q.unit, axis: q.axis, min: q.min, int: q.int, vars: V, onCommit: (val) => setP(q.k, val) }));
      sec.append(fl);
      if (it.kind === 'cylinder') {
        const pfVal = it.p.printFit || '';
        const pfSel = UI.selectField({
          id: 'p-printFit', label: T('printFit.label'), value: pfVal,
          options: it.role === 'hole' ? printFitHoleOptions : printFitBoltOptions,
          onChange: (v) => setP('printFit', v),
        });
        pfSel.setAttribute('data-help', 'printFit');
        pfSel.style.marginTop = '8px';
        sec.append(pfSel);
        const pfi = printFitInfo(pfVal);
        if (pfi) {
          const dNom = Model.num(it.p.d, V, 20);
          const dEff = Math.max(0.2, dNom + (it.role === 'hole' ? pfi.mm : -pfi.mm));
          sec.append(h('div', { id: 'p-cyl-fit-hint', class: 'hint-box', html: T('panel.item.cylFitHint', { label: esc(pfi.label), sign: it.role === 'hole' ? '+' : '−', mm: fmtFixed(pfi.mm, 1), eff: Units.fmtLenU(dEff, 2) }) }));
        }
      }
      w.append(sec);
    } else if (it.kind === 'part') {
      const def = LIBMAP[it.p.lib];
      if (def) {
        const fl = h('div', { class: 'fields' });
        for (const q of def.params) {
          let fld;
          if (q.type === 'select') fld = UI.selectField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k] ?? q.def ?? '', options: q.options, onChange: (v) => setP(q.k, q.k === 'tipAngle' ? Number(v) : v) });
          else fld = UI.numField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k] ?? '', unit: q.unit ?? 'mm', int: q.int, vars: V, placeholder: q.auto ? T('panel.item.autoFitPh') : '', onCommit: (v) => setP(q.k, v) });
          if (q.k === 'printFit') fld.setAttribute('data-help', 'printFit');
          fl.append(fld);
        }
        sec.append(fl);
        const pfi = printFitInfo(it.p.printFit);
        const pf = pfi ? pfi.mm : 0;
        const pfHoleNote = pfi ? T('panel.item.partFitNote', { label: esc(pfi.label), val: pf > 0 ? `+${Units.fmtLenU(pf, 2)} mm` : '0 mm' }) : '';
        if (def.lib === 'blindHole') {
          const dNom = Model.num(it.p.d, V, 5), d = dNom + pf, dep = Model.num(it.p.depth, V, 10), ang = Number(it.p.tipAngle ?? 118), tipH = blindTipHeight(d, ang);
          const dTxt = pfi && pf > 0 ? `Ø <b>${Units.fmtLenU(d, 2)}</b> (${Units.fmtLenU(dNom, 2)} + ${fmtFixed(pf, 1)} mm) · ` : '';
          const tipTxt = ang >= 179.5 ? T('panel.item.blindFlat', { dep: Units.fmtLenU(dep, 2) }) : T('panel.item.blindTip', { ang: fmtAngleU(ang), tipH: Units.fmtLenU(tipH, 2), tot: Units.fmtLenU(dep + tipH, 2) });
          sec.append(h('div', { class: 'hint-box', html: T('panel.item.blindHint', { dTxt, tipTxt, fitNote: pfHoleNote }) }));
        } else if (def.lib === 'fitHole') {
          const dNom = Model.num(it.p.d, V, 6), d = dNom + pf, info = h7Info(dNom);
          const tolTxt = info.um != null ? T('panel.item.fitHoleHint1', { d: Units.fmtLenU(d, 2), es: info.esText, range: info.rangeText, fitTxt: pfi && pf > 0 ? T('panel.item.fitHoleFitPrint', { label: esc(pfi.label), mm: fmtFixed(pf, 1) }) : T('panel.item.fitHoleExact') }) : T('panel.item.fitHoleHint2', { d: Units.fmtLenU(d, 2), fitTxt: pfi && pf > 0 ? T('panel.item.fitHoleHint2Print', { label: esc(pfi.label), mm: fmtFixed(pf, 1) }) : T('panel.item.fitHoleHint2Exact') });
          sec.append(h('div', { id: 'p-fit-hint', class: 'hint-box', html: tolTxt }));
        } else if (def.lib === 'centerHole') {
          const m = centerHoleMetrics(it.p.size);
          sec.append(h('div', { class: 'hint-box', html: T('panel.item.centerHoleHint', { size: it.p.size || 'A2.5', d1: Units.fmtLenU(m.d1, 2), d2: Units.fmtLenU(m.d2, 2), tot: Units.fmtLenU(m.totalDepth, 2) }) }));
        } else if (def.lib === 'screwHole') {
          const te = threadEntry(it.p.size);
          let screwTxt = '';
          if (te) {
            const dia = threadHoleDia(te, it.p.fit) + pf;
            const art = it.p.fit === 'tap' ? T('panel.item.screwTap') : T('panel.item.screwThrough');
            let headTxt = '';
            if (it.p.fit !== 'tap') {
              if (it.p.head === 'countersunk' && te.senkung_senk_d_mm) headTxt = T('panel.item.screwHeadCs', { d: Units.fmtLenU(te.senkung_senk_d_mm + pf, 2), ang: te.senkung_winkel_grad || 90 });
              else if (it.p.head === 'counterbore' && te.senkung_zyl_d_mm) headTxt = T('panel.item.screwHeadCb', { kind: te.normId === 'pipe_g' ? T('panel.item.screwCbPipe') : T('panel.item.screwCbStd'), d: Units.fmtLenU(te.senkung_zyl_d_mm + pf, 2), t: Units.fmtLenU(te.senkung_zyl_t_mm, 2) });
            }
            screwTxt = `<b>${esc(te.id)}</b> (${esc(te.normName)}): ${art} Ø <b>${Units.fmtLenU(dia, 2)}</b>${headTxt}${pfHoleNote}<br><span style="color:var(--muted)">${T('panel.item.screwNorm', { src: esc(te.quelle) })}</span><br>`;
          }
          sec.append(h('div', { id: 'p-screw-hint', class: 'hint-box', html: `${screwTxt}${T('panel.item.screwPlaceHint')}` }));
        } else if (def.lib === 'insert' || def.lib === 'nutTrap') {
          sec.append(h('div', { class: 'hint-box', html: T('panel.item.insertHint', { fitNote: pfi ? T('panel.item.partFitNote', { label: esc(pfi.label), val: pf > 0 ? `+${Units.fmtLenU(pf, 2)} mm` : '0 mm' }).slice(4) + '<br>' : '' }) }));
        } else if (def.lib === 'threadRod' && pfi) {
          const nom = parseFloat(String(it.p.size || 'M6').slice(1)) || 6;
          sec.append(h('div', { id: 'p-threadrod-hint', class: 'hint-box', html: T('panel.item.threadRodFit', { label: esc(pfi.label), adj: pf > 0 ? `−${Units.fmtLenU(pf, 2)}` : '0 mm', eff: Units.fmtLenU(Math.max(0.8, nom - pf), 2) }) }));
        } else if (def.lib === 'threadHole' && pfi) {
          const nom = parseFloat(String(it.p.size || 'M6').slice(1)) || 6;
          sec.append(h('div', { id: 'p-threadhole-hint', class: 'hint-box', html: T('panel.item.threadHoleFit', { label: esc(pfi.label), adj: pf > 0 ? `+${Units.fmtLenU(pf, 2)}` : '0 mm', eff: Units.fmtLenU(nom + pf, 2) }) }));
        } else if (def.lib === 'stdPin' && typeof pinEntry === 'function') {
          const pe = pinEntry(it.p.size ?? it.p.d);
          if (pe) {
            const L = Model.num(it.p.length, V, 20), tol = it.p.tol === 'h8' ? 'h8' : 'm6';
            const minD = tol === 'h8' ? pe.h8_min_mm : pe.m6_min_mm, maxD = tol === 'h8' ? pe.h8_max_mm : pe.m6_max_mm;
            const h7 = h7Info(pe.d_mm);
            const fitTxt = h7.um != null ? T('panel.item.stdPinFitRec', { d: Units.fmtLenU(pe.d_mm, 2), range: h7.rangeText }) : '';
            const pfPinTxt = pfi ? T('panel.item.stdPinFitPrint', { label: esc(pfi.label), adj: pf > 0 ? `−${Units.fmtLenU(pf, 2)}` : '0 mm', eff: Units.fmtLenU(Math.max(0.4, pe.d_mm - pf), 2) }) : '';
            sec.append(h('div', { id: 'p-stdpin-hint', class: 'hint-box', html: T('panel.item.stdPinHint', { d: pe.d_mm, tol, L: Units.fmtLenU(L, 1), min: fmtFixed(minD, 3), max: fmtFixed(maxD, 3), c: Units.fmtLenU(pe.c_mm, 2), fitRec: fitTxt, fitPrint: pfPinTxt }) }));
          }
        } else if (def.lib === 'stdKey' && typeof keyEntry === 'function') {
          const ke = keyEntry(it.p.size);
          if (ke) {
            const L = Model.num(it.p.length, V, 20);
            const normL = Array.isArray(ke.laengen_mm) && ke.laengen_mm.includes(Math.round(L)) ? T('panel.item.stdKeyNormLen') : T('panel.item.stdKeyCommonLen', { lens: (ke.laengen_mm || []).slice(0, 5).join(', ') });
            sec.append(h('div', { id: 'p-stdkey-hint', class: 'hint-box', html: T('panel.item.stdKeyHint', { b: ke.b_mm, h: ke.h_mm, L: Units.fmtLenU(L, 1), lenInfo: normL, min: Units.fmtLenU(ke.welle_min_mm, 1), max: Units.fmtLenU(ke.welle_max_mm, 1), t1: Units.fmtLenU(ke.t1_mm, 2), t2: Units.fmtLenU(ke.t2_mm, 2) }) }));
            const row = h('div', { class: 'btn-row' });
            const kwBtn = h('button', { type: 'button', class: 'btn small', id: 'btn-add-keyway' }, T('panel.item.addKeyway'));
            kwBtn.onclick = () => Actions.addPart(LIBMAP.stdKeyway, { size: ke.id, kind: 'shaft', length: it.p.length ?? 20, extra: 0.5 }, { name: 'Passfedernut ' + ke.id });
            row.append(kwBtn); sec.append(row);
          }
        } else if (def.lib === 'stdKeyway' && typeof keyEntry === 'function') {
          const ke = keyEntry(it.p.size);
          if (ke) {
            const isHub = it.p.kind === 'hub', dep = isHub ? ke.t2_mm : ke.t1_mm;
            sec.append(h('div', { id: 'p-stdkeyway-hint', class: 'hint-box', html: T('panel.item.stdKeywayHint', { kind: isHub ? T('panel.item.stdKeywayHub') : T('panel.item.stdKeywayShaft'), b: ke.b_mm, h: ke.h_mm, bw: Units.fmtLenU(ke.b_mm, 2), dep: Units.fmtLenU(dep, 2), wmin: ke.welle_min_mm, wmax: ke.welle_max_mm }) }));
          }
        } else if (def.lib === 'splineShaft' && typeof splineEntry === 'function') {
          const se = it.p.profile !== 'custom' ? splineEntry(it.p.profile) : null;
          const nn = Math.round(Model.num(it.p.teeth, V, se ? se.n : 6));
          const dd = Model.num(it.p.d, V, se ? se.d : 16);
          const DD = Model.num(it.p.D, V, se ? se.D : 20);
          const bb = Model.num(it.p.b, V, se ? se.b : 4);
          sec.append(h('div', { id: 'p-splineshaft-hint', class: 'hint-box', html: T('panel.item.splineShaftHint', { n: nn, d: Units.fmtLenU(dd, 1), D: Units.fmtLenU(DD, 1), b: Units.fmtLenU(bb, 2) }) }));
        } else if (def.lib === 'stdBearing' && typeof bearingEntry === 'function') {
          const be = bearingEntry(it.p.size);
          if (be) {
            sec.append(h('div', { id: 'p-stdbearing-hint', class: 'hint-box', html: T('panel.item.stdBearingHint', { id: esc(be.id), series: esc(be.reiheName), d: Units.fmtLenU(be.d_mm, 2), D: Units.fmtLenU(be.D_mm, 2), B: Units.fmtLenU(be.B_mm, 2), rmin: Units.fmtLenU(be.r_min_mm, 2), src: esc(be.quelle) }) }));
          }
        } else if (def.lib === 'stdSleeve' && typeof sleeveEntry === 'function') {
          const se = sleeveEntry(it.p.size);
          if (se) {
            const flTxt = se.flansch_d_mm ? T('panel.item.stdSleeveFlangeD', { d: Units.fmtLenU(se.flansch_d_mm, 2) }) : T('panel.item.stdSleeveFlangeApprox', { d: Units.fmtLenU(se.D_mm + 4 * se.wand_mm, 2) });
            const h7 = h7Info(se.D_mm);
            const h7Txt = h7.um != null ? T('panel.item.stdSleeveH7', { d: Units.fmtLenU(se.D_mm, 2) }) : '';
            sec.append(h('div', { id: 'p-stdsleeve-hint', class: 'hint-box', html: T('panel.item.stdSleeveHint', { id: esc(se.id), form: it.p.flange === 'flange' ? T('panel.item.stdSleeveFlange') : T('panel.item.stdSleeveCyl'), d: Units.fmtLenU(se.d_mm, 2), D: Units.fmtLenU(se.D_mm, 2), w: Units.fmtLenU(se.wand_mm, 2), flange: flTxt, h7: h7Txt }) }));
          }
        } else if (def.lib === 'stdScrew' && typeof screwEntry === 'function') {
          const se = screwEntry(it.p.size);
          if (se) {
            const L = Model.num(it.p.length, V, 10);
            const dNenn = parseFloat(String(se.groesse).slice(1)) || 3;
            let txt = '';
            if (it.p.head === 'hex' && se.sechskantkopf) {
              txt = T('panel.item.stdScrewHex', { size: esc(se.groesse), L: Units.fmtLenU(L, 1), norm: esc(se.sechskantkopf.norm), sw: Units.fmtLenU(se.sechskantkopf.schluesselweite_mm, 1), k: Units.fmtLenU(se.sechskantkopf.kopf_h_mm, 2), d: Units.fmtLenU(dNenn, 2) });
            } else if (it.p.head === 'senk' && se.senkkopf && se.senkkopf.kopf_h_mm) {
              const sk = se.senkkopf;
              txt = T('panel.item.stdScrewCs', { size: esc(se.groesse), L: Units.fmtLenU(L, 1), norm: esc(sk.norm), dk: Units.fmtLenU(sk.kopf_d_mm, 2), k: Units.fmtLenU(sk.kopf_h_mm, 2), hex: sk.innensechskant_mm ? T('panel.item.stdScrewInHex', { s: Units.fmtLenU(sk.innensechskant_mm, 1) }) : '', ang: sk.winkel_grad || 90 });
            } else if (se.zylinderkopf) {
              const zk = se.zylinderkopf;
              txt = T('panel.item.stdScrewCyl', { size: esc(se.groesse), L: Units.fmtLenU(L, 1), dk: Units.fmtLenU(zk.kopf_d_mm, 2), k: Units.fmtLenU(zk.kopf_h_mm, 2), hex: zk.innensechskant_mm ? T('panel.item.stdScrewInHex', { s: Units.fmtLenU(zk.innensechskant_mm, 1) }) : '' });
            }
            if (txt) sec.append(h('div', { id: 'p-stdscrew-hint', class: 'hint-box', html: `${txt}<br><span style="color:var(--muted)">${T('panel.item.stdScrewPitch', { p: fmt(se.steigung_mm, 2) })}</span>` }));
          }
        } else if (def.lib === 'stdNut' && typeof screwEntry === 'function') {
          const se = screwEntry(it.p.size);
          if (se && se.mutter) {
            sec.append(h('div', { id: 'p-stdnut-hint', class: 'hint-box', html: T('panel.item.stdNutHint', { size: esc(se.groesse), norm: esc(se.mutter.norm), sw: Units.fmtLenU(se.mutter.schluesselweite_mm, 1), m: Units.fmtLenU(se.mutter.hoehe_mm, 2) }) }));
          }
        } else if (def.lib === 'stdWasher' && typeof screwEntry === 'function') {
          const se = screwEntry(it.p.size);
          if (se && se.scheibe) {
            sec.append(h('div', { id: 'p-stdwasher-hint', class: 'hint-box', html: T('panel.item.stdWasherHint', { size: esc(se.groesse), norm: esc(se.scheibe.norm), d1: Units.fmtLenU(se.scheibe.innen_d_mm, 2), d2: Units.fmtLenU(se.scheibe.aussen_d_mm, 1), h: Units.fmtLenU(se.scheibe.dicke_mm, 2) }) }));
          }
        }
        w.append(sec);
      }
    } else if (it.kind === 'extrude' || it.kind === 'revolve') {
      const fl = h('div', { class: 'fields' });
      if (it.kind === 'extrude') {
        const cuts = it.role === 'hole' || (it.op && it.op.type === 'cut');
        const ext = it.p.extent === 'toNext' || it.p.extent === 'toFace' ? it.p.extent : 'dist';
        const extField = UI.selectField({
          id: 'p-extent',
          label: T('panel.ext.to'),
          value: ext,
          options: [['dist', T('panel.ext.dist')], ['toNext', T('panel.ext.toNext')], ['toFace', T('panel.ext.toFace')]],
          onChange: (v) => {
            let pickAfter = false;
            App.change(v === 'dist' ? 'Feste Höhe' : v === 'toNext' ? 'Bis zur nächsten Fläche' : 'Bis zu gewählter Fläche', (doc) => {
              const tgt = Model.find(doc, it.id).item;
              if (v === 'dist') {
                const rd = App.resolvedDist(it.id);
                if (rd != null) tgt.p.dist = round(rd, 4);
                delete tgt.p.extent; delete tgt.p.toFace;
              } else {
                tgt.p.extent = v;
                delete tgt.p.thru;
                if (tgt.p.dir === 'both') tgt.p.dir = 'normal';
                if (v === 'toNext') delete tgt.p.toFace;
                else if (!tgt.p.toFace) pickAfter = true;
              }
            });
            if (pickAfter) Features.pickExtrudeFace(it.id);
          },
        });
        extField.setAttribute('data-help', 'extrudeToFace');
        fl.append(extField);
        if (ext === 'dist' && !it.p.thru) fl.append(UI.numField({ id: 'p-dist', label: it.p.dir === 'two' ? T('panel.ext.height1') : T('param.h'), value: it.p.dist, vars: V, onCommit: (v) => setP('dist', v) }));
        const dirOpts = ext === 'dist'
          ? [['normal', T('panel.ext.dirNormal')], ['reverse', T('panel.ext.dirReverse')], ['both', T('panel.ext.dirBoth')], ['two', T('panel.ext.dirTwo')]]
          : [['normal', T('panel.ext.dirNormal')], ['reverse', T('panel.ext.dirReverse')], ['two', T('panel.ext.dirTwoFixed')]];
        fl.append(UI.selectField({ id: 'p-dir', label: T('panel.gap.dir'), value: it.p.dir || 'normal', options: dirOpts, onChange: (v) => setP('dir', v) }));
        if (it.p.dir === 'two' && !it.p.thru) fl.append(UI.numField({ id: 'p-dist2', label: T('panel.ext.height2'), value: it.p.dist2 ?? it.p.dist, vars: V, onCommit: (v) => setP('dist2', v) }));
        if (ext === 'dist' && (cuts || it.p.thru)) { const l = h('label', { class: 'check', 'data-help': 'thruAll' }, h('input', { type: 'checkbox', id: 'p-thru', checked: !!it.p.thru }), T('panel.ext.thruAll')); l.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Durch alles' : 'Feste Tiefe', (doc) => { const tgt = Model.find(doc, it.id).item; if (e.target.checked) tgt.p.thru = true; else delete tgt.p.thru; }); fl.append(l); }
        if (ext !== 'dist') {
          const rd = App.resolvedDist(it.id);
          const info = App.resolvedOf(it.id);
          const tgtIt = info && info.targetId ? Model.find(App.doc, info.targetId) : null;
          const tgtName = ext === 'toFace' && it.p.toFace && it.p.toFace.label ? it.p.toFace.label : tgtIt ? Model.label(tgtIt.item) : null;
          const txt = ext === 'toFace' && !it.p.toFace
            ? T('panel.ext.noTarget')
            : rd != null
              ? T('panel.ext.curHeight', { v: Units.fmtLenU(rd, 2), tgt: tgtName ? T('panel.ext.curTarget', { name: tgtName }) : '' })
              : T('panel.ext.calcTarget');
          fl.append(h('div', { class: 'hint-box', id: 'p-ext-info' }, txt));
          if (ext === 'toFace') {
            const pb = h('button', { type: 'button', class: 'btn', id: 'p-pick-face' });
            pb.innerHTML = icon('pointer') + esc(it.p.toFace ? T('panel.ext.pickOtherFace') : T('panel.ext.pickFace'));
            pb.onclick = () => Features.pickExtrudeFace(it.id);
            fl.append(pb);
          }
        }
        const hasRegs = SK.regions(it.p.sketch ? Solver.cached(it.p.sketch, V).ents : []).length > 0;
        const tl = h('label', { class: 'check', 'data-help': 'thinWall' }, h('input', { type: 'checkbox', id: 'p-thin', checked: !!it.p.thin, disabled: !!it.p.thin && !hasRegs }), T('panel.ext.thinWall'));
        tl.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Dünne Wand an' : 'Dünne Wand aus', (doc) => {
          const tgt = Model.find(doc, it.id).item;
          if (e.target.checked) { tgt.p.thin = true; if (tgt.p.wall == null) tgt.p.wall = 2; if (!tgt.p.wallSide) tgt.p.wallSide = 'center'; }
          else delete tgt.p.thin;
        });
        fl.append(tl);
        if (it.p.thin) {
          fl.append(UI.numField({ id: 'p-wall', label: T('param.wall'), value: it.p.wall ?? 2, min: 0.1, vars: V, onCommit: (v) => setP('wall', v) }));
          fl.append(UI.selectField({ id: 'p-wall-side', label: T('panel.ext.wallSide'), value: it.p.wallSide || 'center', options: [['center', T('panel.ext.wallCenter')], ['in', T('panel.ext.wallIn')], ['out', T('panel.ext.wallOut')]], onChange: (v) => setP('wallSide', v) }));
        }
      } else {
        const dir = it.p.dir || 'normal';
        const dirSel = UI.selectField({
          id: 'p-rev-dir', label: T('panel.gap.dir'), value: dir,
          options: [['normal', T('panel.rev.dirNormal')], ['reverse', T('panel.rev.dirReverse')], ['both', T('panel.rev.dirBoth')], ['two', T('panel.rev.dirTwo')], ['toFace', T('panel.rev.dirToFace')]],
          onChange: (v) => {
            App.change('Drehrichtung geändert', (doc) => {
              const tgt = Model.find(doc, it.id).item;
              tgt.p.dir = v;
              if (v === 'two' && tgt.p.angle2 == null) {
                const cur = Model.num(tgt.p.angle, Model.vars(doc).v, 360);
                if (cur >= 359) { tgt.p.angle = 90; tgt.p.angle2 = 90; }
                else tgt.p.angle2 = tgt.p.angle;
              }
            });
            if (v === 'toFace' && !it.p.toFace) Features.pickRevolveFace(it.id);
          },
        });
        dirSel.setAttribute('data-help', 'revolveOptions');
        fl.append(dirSel);
        if (dir !== 'toFace') {
          const minA = dir === 'two' ? 0 : 0.1;
          fl.append(UI.numField({ id: 'p-angle', label: dir === 'both' ? T('panel.rev.totalAngle') : dir === 'two' ? T('panel.rev.angle1') : T('common.angle'), value: it.p.angle, unit: '°', min: minA, vars: V, onCommit: (v) => setP('angle', typeof v === 'number' ? clamp(v, minA, 360) : v) }));
          if (dir === 'both') {
            fl.append(h('div', { class: 'mini-row', id: 'p-rev-sym-info' }, h('span', { class: 'grow' }, T('panel.rev.sym')), h('b', { class: 'mono' }, T('panel.rev.perSide', { v: fmtAngleU(Model.num(it.p.angle, V, 360) / 2) }))));
          }
          if (dir === 'two') {
            fl.append(UI.numField({ id: 'p-angle2', label: T('panel.rev.angle2'), value: it.p.angle2 ?? it.p.angle, unit: '°', min: 0, vars: V, onCommit: (v) => setP('angle2', typeof v === 'number' ? clamp(v, 0, 360) : v) }));
          }
        } else {
          const tf = it.p.toFace;
          const fr = tf && !tf.lost ? Model.revolveFrame(it.p, V) : null;
          const hitDeg = fr ? Model.revolveHitAngle(fr, tf.o, tf.fn, !!it.p.toFaceFlip) : null;
          const infoTxt = !tf ? T('panel.rev.noFace') : tf.lost ? T('panel.rev.faceLost', { name: tf.name || '?' }) : T('panel.rev.faceTarget', { kind: tf.kind === 'datum' ? T('panel.rev.datumKind') : T('panel.rev.faceKind'), name: tf.name || T('panel.rev.faceKind'), deg: hitDeg != null ? ` (${fmtAngleU(hitDeg)})` : '' });
          fl.append(h('div', { class: 'mini-row', id: 'p-rev-face-info', style: tf && tf.lost ? { color: 'var(--bad)' } : null }, h('span', { class: 'grow' }, infoTxt)));
          const pb = h('button', { type: 'button', class: 'btn', id: 'p-rev-face-pick' }); pb.innerHTML = icon('cursor') + esc(tf ? T('panel.ext.pickOtherFace') : T('panel.ext.pickFace'));
          pb.onclick = () => Features.pickRevolveFace(it.id);
          fl.append(pb);
          const dats = typeof Datums !== 'undefined' ? Datums.list().filter((d) => d.plane) : [];
          if (dats.length) {
            fl.append(UI.selectField({
              id: 'p-rev-face-datum', label: T('panel.rev.datumGoal'),
              value: tf && tf.kind === 'datum' ? tf.datumId : '',
              options: [['', T('panel.rev.chooseDatum')], ...dats.map((d) => [d.id, d.name])],
              onChange: (v) => { if (v) Features.setRevolveToFace(it.id, { datumId: v }); },
            }));
          }
          const flp = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'p-rev-face-flip', checked: !!it.p.toFaceFlip }), T('panel.rev.otherDir'));
          flp.querySelector('input').onchange = (e) => App.change('Drehrichtung umgekehrt', (doc) => { const tgt = Model.find(doc, it.id).item; tgt.p.toFaceFlip = e.target.checked; });
          fl.append(flp);
        }
        const axList = typeof Datums !== 'undefined' ? Datums.axes() : [];
        if (axList.length || it.p.axisId) {
          const opts = [['sketch', T('panel.rev.axisSketch')], ...axList.filter((a) => a.axis).map((a) => ['da:' + a.id, T('panel.rev.axisDatum', { name: a.name })])];
          const val = it.p.axisId && Datums.findAxis(it.p.axisId) ? 'da:' + it.p.axisId : 'sketch';
          const as = UI.selectField({ id: 'p-rev-axis', label: T('panel.rev.axisLabel'), value: val, options: opts, onChange: (v) => Datums.applyAxisToRevolve(it.id, v.startsWith('da:') ? v.slice(3) : null) });
          as.setAttribute('data-help', 'datumAxis');
          fl.append(as);
        }
      }
      sec.append(fl);
      const eb = h('button', { type: 'button', class: 'btn' }); eb.innerHTML = icon('edit') + esc(T('panel.item.editSketch'));
      eb.onclick = () => Sketch.editItem(it.id);
      sec.append(eb);
      // Skizze auf eine andere Ebene umhängen (SK-13): Grundebenen und Bezugsebenen
      if (App.doc.items.includes(it) && it.p.sketch && it.p.sketch.plane) {
        const opts = [['', T('panel.item.replanePh')], ['o:XY', T('panel.item.replaneXY')], ['o:XZ', T('panel.item.replaneXZ')], ['o:YZ', T('panel.item.replaneYZ')], ...Datums.list().filter((d) => d.plane).map((d) => ['d:' + d.id, T('panel.item.replaneDatum', { name: d.name })])];
        const rs = UI.selectField({ id: 'p-replane', label: T('panel.item.replane'), value: '', options: opts, onChange: (v) => { if (v) Actions.replaneSketch(it.id, v); } });
        rs.setAttribute('data-help', 'replaneSketch'); sec.append(rs);
      }
      w.append(sec);
    } else if (it.kind === 'import') {
      if (it.p && it.p.frozen) {
        sec.append(h('div', { class: 'hint-box', id: 'frozen-body-info' }, T(App.doc.noHistory ? 'panel.imp.frozenDirectHint' : 'panel.imp.frozenStepHint')));
        w.append(sec);
      } else {
      sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.imp.file')), h('b', { class: 'mono' }, it.p.file || '–')));
      const fl = h('div', { class: 'fields' });
      fl.append(UI.selectField({ id: 'p-scale', label: T('panel.imp.unit'), value: String(it.p.scale || 1), options: [['1', T('unit.mmShort')], ['10', T('unit.cmShort')], ['25.4', T('unit.inShort')], ['1000', T('unit.mShort')]], onChange: (v) => setP('scale', parseFloat(v)) }));
      sec.append(fl);
      const icPanel = h('div', { id: 'import-check-panel', style: { display: 'grid', gap: '8px' } });
      const st = typeof Start !== 'undefined' && Start.importCheckOf ? Start.importCheckOf(it.id) : null;
      const healed = (st && st.lastHeal) || (it.p && it.p.healed) || null;
      if (st && st.checking) {
        icPanel.append(h('div', { class: 'hint-box' }, T('panel.imp.checking')));
      } else if (st && st.report && st.report.hasIssues) {
        const rep = st.report;
        const wb = h('div', { class: 'warn-box' });
        wb.append(h('b', null, T('panel.imp.issuesTitle')));
        const met = h('div', { class: 'import-metrics' },
          h('span', null, T('panel.imp.openEdges')), h('b', null, String(rep.openEdges)),
          h('span', null, T('panel.imp.gaps')), h('b', null, String(rep.gaps)),
          h('span', null, T('panel.imp.invFaces')), h('b', null, String(rep.invertedFaces)),
          h('span', null, 'BRepCheck'), h('b', null, rep.brepValid ? T('panel.imp.brepOk') : T('panel.imp.brepErr', { n: Math.max(1, rep.invalidCount) })),
          h('span', null, T('common.body')), h('b', null, rep.solids > 0 ? T('panel.imp.volumes', { n: rep.solids }) : T('panel.imp.openShell')));
        wb.append(met);
        const hOpts = h('div', { class: 'fields' });
        hOpts.append(UI.numField({ id: 'imp-heal-tol', label: T('panel.imp.sewTol'), value: st.tol != null ? st.tol : 0.1, min: 0.001, step: 0.05, expr: false, onCommit: (v) => Start.setImportHealOpts(it.id, { tol: v }) }));
        const capInp = h('input', { id: 'imp-heal-cap', type: 'checkbox', checked: st.capOpen !== false, onchange: (e) => Start.setImportHealOpts(it.id, { capOpen: e.target.checked }) });
        wb.append(hOpts, h('label', { class: 'check' }, capInp, h('span', null, T('panel.imp.capOpen'))));
        const healBtn = h('button', { type: 'button', id: 'btn-import-heal', class: 'btn warn-act', 'data-help': 'importHeal', onclick: () => Start.healImport(it.id) }, T('panel.imp.heal'));
        const recheckBtn = h('button', { type: 'button', id: 'btn-import-check', class: 'btn small', 'data-help': 'importCheck', onclick: () => Start.checkImport(it.id) }, T('panel.imp.recheck'));
        wb.append(h('div', { class: 'btn-row' }, healBtn, recheckBtn));
        icPanel.append(wb);
      } else if (st && st.report && !st.report.hasIssues) {
        const rep = st.report;
        icPanel.append(h('div', { class: 'hint-box' }, T('panel.imp.okHint', { faces: rep.faces, solid: rep.solids > 0 ? T('panel.imp.okClosed') : T('panel.imp.okChecked') })));
        icPanel.append(h('button', { type: 'button', id: 'btn-import-check', class: 'btn small', 'data-help': 'importCheck', onclick: () => Start.checkImport(it.id) }, T('panel.imp.checkAgain')));
      } else if (st && st.error) {
        icPanel.append(h('div', { class: 'err-box' }, T('panel.imp.errPrefix', { err: st.error })));
        icPanel.append(h('button', { type: 'button', id: 'btn-import-check', class: 'btn small', 'data-help': 'importCheck', onclick: () => Start.checkImport(it.id) }, T('panel.imp.checkAgain')));
      } else {
        icPanel.append(h('button', { type: 'button', id: 'btn-import-check', class: 'btn small', 'data-help': 'importCheck', onclick: () => Start.checkImport(it.id) }, T('panel.imp.checkBtn')));
      }
      if (healed && healed.before && healed.after) {
        const b = healed.before, a = healed.after;
        const diff = h('div', { id: 'import-heal-diff', class: 'hint-box import-diff' });
        diff.append(h('b', null, T('panel.imp.healResult', { tol: fmtFixed(healed.tol ?? 0.1, 3) })));
        const rows = h('div', { class: 'import-metrics' },
          h('span', null, T('panel.imp.openEdges')), h('b', null, `${b.openEdges} → ${a.openEdges}`),
          h('span', null, T('panel.imp.gaps')), h('b', null, `${b.gaps} → ${a.gaps}`),
          h('span', null, T('panel.imp.invFaces')), h('b', null, `${b.invertedFaces} → ${a.invertedFaces}`),
          h('span', null, 'BRepCheck'), h('b', null, `${b.brepValid ? T('panel.imp.brepOk') : T('panel.imp.brepErr', { n: b.invalidCount })} → ${a.brepValid ? T('panel.imp.brepOk') : T('panel.imp.brepErr', { n: a.invalidCount })}`),
          h('span', null, T('common.body')), h('b', null, `${b.solids > 0 ? T('panel.imp.volShort', { n: b.solids }) : T('panel.imp.openShell')} → ${a.solids > 0 ? T('panel.imp.volShort', { n: a.solids }) : T('panel.imp.openShell')}`));
        if (healed.cappedFaces > 0) rows.append(h('span', null, T('panel.imp.cappedFaces')), h('b', null, `+${healed.cappedFaces}`));
        diff.append(rows);
        icPanel.append(diff);
      }
      sec.append(icPanel, h('div', { class: 'hint-box', html: T('panel.imp.fixedHint') }));
      w.append(sec);
      }
    } else if (it.kind === 'sweep') {
      const fl = h('div', { class: 'fields' });
      const profs = App.doc.items.filter((x) => x.kind === 'extrude' && x.p && x.p.sketch && x.id !== it.id);
      const shp = it.p.shape || 'circle';
      fl.append(UI.selectField({ id: 'p-shape', label: T('panel.sweep.shape'), value: shp, options: [['circle', T('panel.sweep.circle')], ['rect', T('panel.sweep.rect')], ...(profs.length || shp === 'sketch' ? [['sketch', T('panel.sweep.sketch')]] : [])], onChange: (v) => { if (v === 'sketch' && !it.p.prof) { const src = profs[0]; if (src) App.change('Querschnitt übernommen', (doc) => { const f = Model.find(doc, it.id).item; f.p.shape = 'sketch'; f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name; const s2 = doc.items.find((x) => x.id === src.id); if (s2) s2.hidden = true; }); } else setP('shape', v); } }));
      if (shp === 'sketch') {
        fl.append(UI.selectField({ id: 'p-prof', label: T('panel.sweep.profFrom'), value: '', options: [['', it.p.profName || T('panel.sweep.adopted')], ...profs.map((x) => [x.id, x.name])], onChange: (v) => { const src = profs.find((x) => x.id === v); if (src) App.change('Querschnitt übernommen', (doc) => { const f = Model.find(doc, it.id).item; f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name; const s2 = doc.items.find((x) => x.id === src.id); if (s2) s2.hidden = true; }); } }));
      } else if (shp === 'circle') fl.append(UI.numField({ id: 'p-d', label: T('param.dia'), value: it.p.d, onCommit: (v) => setP('d', v) }));
      else { fl.append(UI.numField({ id: 'p-w', label: T('param.w'), value: it.p.w, onCommit: (v) => setP('w', v) }), UI.numField({ id: 'p-h', label: T('param.h'), value: it.p.h, onCommit: (v) => setP('h', v) })); }
      if (shp !== 'sketch') fl.append(UI.numField({ id: 'p-wall', label: T('panel.sweep.wallOpt'), value: it.p.wall || 0, min: 0, onCommit: (v) => setP('wall', v) }));
      const twF = UI.numField({ id: 'p-twist', label: T('panel.sweep.twist'), value: it.p.twist ?? 0, unit: '°', vars: V, onCommit: (v) => setP('twist', v) });
      twF.setAttribute('data-help', 'sweepTwist');
      fl.append(twF);
      sec.append(fl);
      if (it.p.path3d) {
        // Pfad im Raum: Punkte als Zahlen, glatt oder mit Ecken, weitere Punkte im Bild anklicken
        const V3 = Model.vars(App.doc).v, P3 = it.p.path3d.pts || [], RP = Model.path3dPoints(it.p.path3d, V3), RU = it.p.path3d.rules || [];
        // erst alle Zahlen-Punkte auf ihre Lage mit Regeln setzen – dann bleibt beim Ändern jeder andere Punkt, wo er ist
        const bake = (pp) => Model.path3dBake(pp, V3);
        const unbind = (pp, i) => { if (pp.bind && pp.bind[i]) { pp.bind[i] = null; if (!pp.bind.some(Boolean)) delete pp.bind; } };
        const setPt = (i, k, v) => App.change('Punkt geändert', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d || !f.item.p.path3d.pts[i]) return false; bake(f.item.p.path3d); f.item.p.path3d.pts[i][k] = v; unbind(f.item.p.path3d, i); }, { merge: 'p3:' + it.id + ':' + i + ':' + k });
        const BD = it.p.path3d.bind || [];
        // Regel je Stück: Richtung (entlang X/Y/Z) und Länge – wie in einer Skizze, nur im Raum
        const setRule = (i, patch) => App.change('Regel im Pfad', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d) return false; Model.path3dSetRule(f.item.p.path3d, i, patch, Model.vars(doc).v); });
        const fs = h('div', { class: 'fields' });
        fs.append(UI.selectField({ id: 'p-smooth', label: T('panel.sweep.course'), value: it.p.path3d.smooth === false ? 'corner' : 'smooth', options: [['smooth', T('panel.sweep.smooth')], ['corner', T('panel.sweep.corner')]], onChange: (v) => App.change('Verlauf', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; f.item.p.path3d.smooth = v !== 'corner'; }) }));
        sec.append(fs);
        const list = h('div', { class: 'p3-list', id: 'p3-list' });
        P3.forEach((q, i) => {
          const row = h('div', { class: 'fields three p3-row' });
          ['x', 'y', 'z'].forEach((ax, k) => row.append(UI.numField({ id: `p3-${i}-${ax}`, label: (k === 0 ? `P${i + 1} ` : '') + ax.toUpperCase(), value: typeof q[k] === 'string' ? q[k] : round(RP[i][k], 3), onCommit: (v) => setPt(i, k, v) })));
          list.append(row);
          if (BD[i]) {
            const bf = Model.find(App.doc, BD[i].id), ub = h('button', { type: 'button', class: 'btn ghost small', id: `p3-unbind-${i}` }); ub.innerHTML = icon('close') + esc(T('panel.sweep.unbind'));
            ub.onclick = () => App.change('Punkt vom Körper gelöst', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d) return false; unbind(f.item.p.path3d, i); });
            list.append(h('div', { class: 'mini-row', id: `p3-bound-${i}` }, h('span', { class: 'grow' }, T('panel.sweep.boundInfo', { n: i + 1, name: bf ? Model.label(bf.item) : '?' })), ub));
          }
          if (P3.length > 2) { const del = h('button', { type: 'button', class: 'btn ghost small', id: `p3-del-${i}`, 'aria-label': T('panel.sweep.delPoint', { n: i + 1 }) }); del.innerHTML = icon('trash') + esc(T('panel.sweep.delPoint', { n: i + 1 })); del.onclick = () => App.change('Punkt gelöscht', (doc) => {
            const f = Model.find(doc, it.id); if (!f) return false; const pp = f.item.p.path3d; bake(pp); pp.pts.splice(i, 1);
            // Regeln: die beiden Stücke am gelöschten Punkt werden eins – ohne Regel
            if (pp.rules) { const R = pp.rules.slice(); if (i === 0) R.splice(0, 1); else if (i >= R.length) R.splice(R.length - 1, 1); else { R.splice(i, 1); R[i - 1] = null; } if (R.some(Boolean)) pp.rules = R; else delete pp.rules; }
            if (pp.bind) { pp.bind.splice(i, 1); if (!pp.bind.some(Boolean)) delete pp.bind; }
          }); list.append(del); }
          if (i + 1 < P3.length) {
            const L = Math.hypot(RP[i + 1][0] - RP[i][0], RP[i + 1][1] - RP[i][1], RP[i + 1][2] - RP[i][2]), r = RU[i] || {};
            const sr = h('div', { class: 'fields p3-seg' });
            sr.append(UI.selectField({ id: `p3-ax-${i}`, label: T('panel.sweep.segLabel', { a: i + 1, b: i + 2 }), value: r.ax || '', options: [['', T('panel.sweep.dirFree')], ['x', T('panel.sweep.dirX')], ['y', T('panel.sweep.dirY')], ['z', T('panel.sweep.dirZ')], ...(i > 0 ? [['perp', T('panel.sweep.dirPerp')], ['par', T('panel.sweep.dirPar')]] : [])], onChange: (v) => setRule(i, { ax: v || null }) }));
            sr.append(UI.numField({ id: `p3-len-${i}`, label: r.len != null ? T('panel.sweep.lenFixed') : T('panel.sweep.lenNow', { v: Units.fmtLen(L, 1) }), value: r.len != null ? r.len : 0, min: 0, onCommit: (v) => setRule(i, { len: v || null }) }));
            list.append(sr);
          }
        });
        sec.append(list);
        const mb = h('button', { type: 'button', class: 'btn', id: 'route-more' }); mb.innerHTML = icon('plus') + esc(T('panel.sweep.appendPts'));
        mb.onclick = () => Features.routeAppend(it.id);
        sec.append(mb, h('div', { class: 'hint-box', html: T('panel.sweep.routeHint') }));
      } else if (it.p.wrapId) {
        const wf = Model.find(App.doc, it.p.wrapId);
        if (wf) {
          const wb = h('button', { type: 'button', class: 'btn' }); wb.innerHTML = icon('wrap') + esc(T('panel.sweep.selectWrap', { name: Model.label(wf.item) }));
          wb.onclick = () => App.select([wf.item.id]);
          sec.append(wb);
        }
        sec.append(h('div', { class: 'hint-box', html: T('panel.sweep.wrapHint') }));
      } else if (it.p.sketch3dId) {
        const sk3List = App.doc.items.filter((x) => x.kind === 'sketch3d' && !x.suppressed);
        if (sk3List.length) {
          sec.append(UI.selectField({
            id: 'p-sweep-sk3', label: T('kind.sketch3d'), value: it.p.sketch3dId,
            options: sk3List.map((x) => [x.id, Model.label(x)]),
            onChange: (v) => setP('sketch3dId', v),
          }));
        }
        const sf = Model.find(App.doc, it.p.sketch3dId);
        if (sf) {
          const row = h('div', { class: 'btn-row', style: { marginTop: '6px' } });
          const eb = h('button', { type: 'button', class: 'btn', id: 'sweep-edit-sk3' }); eb.innerHTML = icon('edit') + esc(T('sk3.editBtn'));
          eb.onclick = () => Sketch.edit3d(sf.item.id);
          const sb = h('button', { type: 'button', class: 'btn', id: 'sweep-sel-sk3' }); sb.innerHTML = icon('pointer') + esc(T('sk3.selectBtn'));
          sb.onclick = () => App.select([sf.item.id]);
          row.append(eb, sb);
          sec.append(row);
        }
        sec.append(h('div', { class: 'hint-box', html: T('sk3.sweepHint') }));
      } else {
        const eb = h('button', { type: 'button', class: 'btn' }); eb.innerHTML = icon('edit') + esc(T('panel.sweep.editPath'));
        eb.onclick = () => Sketch.editItem(it.id);
        sec.append(eb, h('div', { class: 'hint-box', html: T('panel.sweep.pathHint') }));
      }
      w.append(sec);
    } else if (it.kind === 'loft') {
      Features.renderLoft(it, sec, setP, w);
    } else if (it.kind === 'transform') {
      sec.firstChild.textContent = T('kind.transform');
      Features.renderTransform(it, sec, setP); w.append(sec);
    } else if (it.kind === 'scale') {
      sec.firstChild.textContent = T('kind.scale');
      Features.renderScale(it, sec, setP); w.append(sec);
    } else if (it.kind === 'deform') {
      sec.firstChild.textContent = T('kind.deform');
      sec.setAttribute('data-help', 'deform');
      Features.renderDeform(it, sec, setP); w.append(sec);
    } else if (it.kind === 'deleteBody') {
      sec.firstChild.textContent = T('kind.deleteBody');
      Features.renderDeleteBody(it, sec, setP); w.append(sec);
    } else if (it.kind === 'sketch3d') {
      sec.firstChild.textContent = T('kind.sketch3d');
      Features.renderSketch3d(it, sec); w.append(sec);
    } else if (it.kind === 'thicken') {
      sec.firstChild.textContent = T('kind.thicken');
      Features.renderThicken(it, sec, setP); w.append(sec);
    } else if (it.kind === 'rib') {
      sec.firstChild.textContent = T('kind.rib');
      Features.renderRib(it, sec, setP); w.append(sec);
    } else if (it.kind === 'vent') {
      sec.firstChild.textContent = T('kind.vent');
      sec.setAttribute('data-help', 'vent');
      Features.renderVent(it, sec, setP); w.append(sec);
    } else if (it.kind === 'fins') {
      sec.firstChild.textContent = T('kind.fins');
      sec.setAttribute('data-help', 'fins');
      Features.renderFins(it, sec, setP); w.append(sec);
    } else if (it.kind === 'fillPattern') {
      sec.firstChild.textContent = T('kind.fillPattern');
      sec.setAttribute('data-help', 'fillPattern');
      Features.renderFillPattern(it, sec, setP); w.append(sec);
    } else if (it.kind === 'web') {
      sec.firstChild.textContent = T('kind.web');
      sec.setAttribute('data-help', 'web');
      Features.renderWeb(it, sec, setP); w.append(sec);
    } else if (it.kind === 'wrap') {
      sec.firstChild.textContent = T('kind.wrap');
      Features.renderWrap(it, sec, setP); w.append(sec);
    } else if (it.kind === 'emboss') {
      sec.firstChild.textContent = T('kind.emboss');
      Features.renderEmboss(it, sec, setP); w.append(sec);
    } else if (it.kind === 'splitFace') {
      sec.firstChild.textContent = T('kind.splitFace');
      sec.setAttribute('data-help', 'splitFace');
      Features.renderSplitFace(it, sec, setP); w.append(sec);
    } else if (it.kind === 'dome') {
      sec.firstChild.textContent = T('kind.dome');
      sec.setAttribute('data-help', 'dome');
      Features.renderDome(it, sec, setP); w.append(sec);
    } else if (it.kind === 'boss') {
      sec.firstChild.textContent = T('kind.boss');
      Features.renderBoss(it, sec, setP); w.append(sec);
    } else if (it.kind === 'lipGroove') {
      sec.firstChild.textContent = T('kind.lipGroove');
      Features.renderLipGroove(it, sec, setP); w.append(sec);
    } else if (it.kind === 'undercut') {
      sec.firstChild.textContent = T('kind.undercut');
      sec.setAttribute('data-help', 'undercut');
      Features.renderUndercut(it, sec, setP); w.append(sec);
    } else if (it.kind === 'circlipGroove') {
      sec.firstChild.textContent = T('kind.circlipGroove');
      sec.setAttribute('data-help', 'circlipGroove');
      Features.renderCirclipGroove(it, sec, setP); w.append(sec);
    } else if (it.kind === 'keyway') {
      sec.firstChild.textContent = T('kind.keyway');
      sec.setAttribute('data-help', 'keywayStep');
      Features.renderKeyway(it, sec, setP); w.append(sec);
    } else if (it.kind === 'splineProfile') {
      sec.firstChild.textContent = T('kind.splineProfile');
      sec.setAttribute('data-help', 'splineProfile');
      Features.renderSplineProfile(it, sec, setP); w.append(sec);
    } else if (it.kind === 'knurl') {
      sec.firstChild.textContent = T('kind.knurl');
      sec.setAttribute('data-help', 'knurl');
      Features.renderKnurl(it, sec, setP); w.append(sec);
    } else if (it.kind === 'gripPattern') {
      sec.firstChild.textContent = T('kind.gripPattern');
      sec.setAttribute('data-help', 'gripPattern');
      Features.renderGripPattern(it, sec, setP); w.append(sec);
    } else if (it.kind === 'stackHole') {
      sec.firstChild.textContent = T('kind.stackHole');
      sec.setAttribute('data-help', 'stackHole');
      Features.renderStackHole(it, sec, setP); w.append(sec);
    } else if (it.kind === 'asmCut') {
      sec.firstChild.textContent = T('kind.asmCut');
      sec.setAttribute('data-help', 'asmCut');
      Features.renderAsmCut(it, sec, setP); w.append(sec);
    } else if (it.kind === 'mirrorStep') {
      sec.firstChild.textContent = T('kind.mirrorStep');
      Features.renderMirrorStep(it, sec, setP); w.append(sec);
    } else if (it.kind === 'helix') {
      sec.firstChild.textContent = ViewPrefs.simple ? T('helix.simpleTitle') : T('kind.helix');
      Features.renderHelix(it, sec, setP); w.append(sec);
    } else if (Features.isOp(it)) {
      sec.firstChild.textContent = Features.NAMES[it.p.op === 'pattern' ? it.p.pt : it.p.op] || T('panel.item.feature');
      Features.renderOp(it, sec, setP); w.append(sec);
    } else if (it.kind === 'group') {
      if (it.partRef && typeof Assembly !== 'undefined') {
        sec.id = 'partref-sec';
        sec.setAttribute('data-help', 'assemblyPartTab');
        sec.firstChild.textContent = T('asm.partRefTitle');
        sec.append(h('div', { class: 'hint-box', html: T('asm.partRefHint', { name: esc(it.partRef.name || Model.label(it)) }) }));
        const ob = h('button', { type: 'button', class: 'btn primary', id: 'btn-open-part-tab' });
        ob.innerHTML = icon('edit') + esc(T('asm.openInTab'));
        ob.onclick = () => Assembly.openPartTab(it.id);
        const sb = h('button', { type: 'button', class: 'btn', id: 'btn-sync-part-ref' });
        sb.innerHTML = icon('undo') + esc(T('asm.syncNow'));
        sb.onclick = () => Assembly.syncCurrentAssembly({ announce: true });
        const ub = h('button', { type: 'button', class: 'btn ghost', id: 'btn-unlink-part-ref' });
        ub.innerHTML = icon('ungroup') + esc(T('asm.unlink'));
        ub.onclick = () => Assembly.unlinkPart(it.id);
        const rb = h('button', { type: 'button', class: 'btn', id: 'btn-partref-replace', 'data-help': 'replacePart' });
        rb.innerHTML = icon('replace') + esc(T('asm.replacePartShort'));
        rb.onclick = () => Comp.replacePartDialog(it.id);
        sec.append(h('div', { class: 'btn-row' }, ob, sb, rb, ub));
        w.append(sec);
      } else {
        sec.append(h('div', { class: 'hint-box', html: T('panel.group.hint', { n: it.children.length }) }));
        const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + esc(T('panel.group.ungroup')); ub.onclick = () => Actions.ungroup(it.id);
        sec.append(h('div', { class: 'btn-row' }, ub)); w.append(sec);
      }
    }
    }
    if (typeof Assembly !== 'undefined' && Assembly.patternSection) {
      const apSec = Assembly.patternSection(it);
      if (apSec) w.append(apSec);
    }
    const jsec = Joints.panel(it); if (jsec) w.append(jsec);
    if (jsec && typeof Assembly !== 'undefined' && Assembly.poseSection) {
      const poseSec = Assembly.poseSection('item');
      if (poseSec) w.append(poseSec);
    }
    // Lage
    if (!isMergedStep && it.kind !== 'transform') {
      const fixedJ = typeof Joints !== 'undefined' && Joints.fixedJointOf ? Joints.fixedJointOf(it.id) : null;
      const grounded = !!it.locked;
      const patCopy = typeof Assembly !== 'undefined' && Assembly.isPatternCopy ? Assembly.isPatternCopy(it.id) : false;
      const posLocked = !!(fixedJ || grounded || patCopy);
      const pos = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.pos.title')));
      const setT = (k, val) => App.change(k.startsWith('r') ? 'Gedreht' : 'Verschoben', (doc) => {
        const tgt = Model.find(doc, it.id)?.item;
        if (!tgt || tgt.locked || (typeof Joints !== 'undefined' && Joints.isFixedPart(it.id)) || (typeof Assembly !== 'undefined' && Assembly.isPatternCopy && Assembly.isPatternCopy(it.id))) return false;
        tgt.t[k] = val;
        if (typeof Joints !== 'undefined' && Joints.constrain) Joints.constrain(doc, it.id);
      }, { merge: 't:' + it.id + ':' + k });
      const fp = h('div', { class: 'fields three' });
      for (const k of ['x', 'y', 'z']) {
        const nf = UI.numField({ id: 't-' + k, value: it.t[k], axis: k, unit: '', len: true, measurePick: !posLocked, onCommit: (v) => setT(k, v) });
        if (posLocked) nf.querySelector('input').disabled = true;
        fp.append(nf);
      }
      const fr = h('div', { class: 'fields three' });
      for (const k of ['rx', 'ry', 'rz']) {
        const nf = UI.numField({ id: 't-' + k, value: it.t[k], axis: k[1], unit: '°', onCommit: (v) => setT(k, v) });
        if (posLocked) nf.querySelector('input').disabled = true;
        fr.append(nf);
      }
      pos.append(h('div', { class: 'field' }, h('label', null, T('panel.pos.position', { u: Units.label() })), fp), h('div', { class: 'field' }, h('label', null, T('panel.pos.rotation')), fr));
      if (grounded) {
        const gh = h('div', { class: 'hint-box', id: 'grounded-hint', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, h('span', null, T('asm.groundedLockedHint')));
        const ug = h('button', { type: 'button', class: 'btn small', id: 'btn-unground' }, T('asm.unground'));
        ug.onclick = () => Actions.setGrounded([it.id], false);
        gh.append(ug);
        pos.append(gh);
      }
      if (fixedJ) {
        const refA = Model.find(App.doc, fixedJ.a);
        pos.append(h('div', { class: 'hint-box' }, T('joint.fixedLockedHint', { name: refA ? Model.label(refA.item) : 'Teil' })));
      }
      if (patCopy) {
        const ph = h('div', { class: 'hint-box', id: 'pat-copy-pos-hint', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, h('span', null, T('asm.patCopyLockedHint')));
        const db = h('button', { type: 'button', class: 'btn small', id: 'btn-ap-dissolve-pos' }, T('asm.patDissolveBtn'));
        db.onclick = () => { const pat = Assembly.patternOf(it.id); if (pat) Assembly.dissolvePattern(pat.id); };
        ph.append(db);
        pos.append(ph);
      }
      const qa = h('div', { class: 'btn-row' });
      const drop = h('button', { type: 'button', class: 'btn small', disabled: posLocked, 'data-tip': T('panel.pos.toXYTip') }); drop.innerHTML = icon('push') + esc(T('panel.pos.toXY'));
      drop.onclick = () => Actions.dropToPlate([it.id]);
      const rz = h('button', { type: 'button', class: 'btn small', disabled: posLocked, 'data-tip': T('panel.pos.rot90Tip'), 'data-kbd': 'R' }); rz.innerHTML = icon('rotate') + esc(T('panel.pos.rot90'));
      rz.onclick = () => Actions.rotate90([it.id], 'z');
      if (!f.parent) qa.append(drop);
      qa.append(rz); pos.append(qa);
      w.append(pos);
    }
    // Kanten
    if (it.role !== 'hole' && !isMergedStep && !isRef) {
      const ks = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.edges.title')));
      for (const fin of (it.finishes || []).filter((x) => x.type === 'shell')) {
        Features.renderShell(it, fin, w, V, rightIssues);
      }
      for (const fin of (it.finishes || []).filter((x) => x.type !== 'shell')) {
        const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
        const isRef = !!(err && RefFix.isRefError(err));
        const row = h('div', { class: 'fields', style: { gridTemplateColumns: isRef ? '1fr auto auto' : '1fr auto', alignItems: 'end' } });
        if (fin.type === 'draft') {
          const nf = UI.numField({ id: 'fin-' + fin.id, label: T('panel.edges.draft'), value: fin.r, unit: '°', onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
          if (err) nf.querySelector('.inp').classList.add('invalid');
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(nf, del); ks.append(row); continue;
        }
        if (fin.type === 'fullFillet') {
          const ttl = h('div', { class: 'mini-row' + (isRef ? ' warn' : err ? ' invalid' : '') }, h('span', { class: 'grow' }, T('panel.edges.fullFillet') + ' · ' + T('panel.edges.threeFaces')));
          const rp = h('button', { type: 'button', class: 'btn ghost small', id: 'fin-repick-' + fin.id, 'data-help': 'fullFillet' }, T('panel.edges.repickFaces'));
          rp.onclick = () => Features.startFullFillet(null, { itemId: it.id, replaceFinId: fin.id });
          row.style.gridTemplateColumns = isRef ? '1fr auto auto auto' : '1fr auto auto';
          row.append(ttl, rp);
          if (isRef) {
            const iss = rightIssues.find((x) => x.finishId === fin.id);
            if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
          }
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(del); ks.append(row); continue;
        }
        if (fin.type === 'cornerChamfer') {
          const ttl = h('div', { class: 'mini-row' + (isRef ? ' warn' : err ? ' invalid' : '') }, h('span', { class: 'grow' }, T('panel.edges.cornerChamfer')));
          const rot = h('button', { type: 'button', class: 'btn ghost small', id: 'fin-rot-' + fin.id, 'data-tip': T('panel.edges.rotateOrder'), 'aria-label': T('panel.edges.rotateOrder') });
          rot.innerHTML = icon('rotate');
          rot.onclick = () => Actions.setFinish(it.id, fin.id, { d1: fin.d2, d2: fin.d3, d3: fin.d1 });
          row.style.gridTemplateColumns = isRef ? '1fr auto auto auto' : '1fr auto auto';
          row.append(ttl, rot);
          if (isRef) {
            const iss = rightIssues.find((x) => x.finishId === fin.id);
            if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
          }
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(del); ks.append(row);
          const ccFields = h('div', { class: 'fields', style: { gridTemplateColumns: '1fr 1fr 1fr' } });
          for (let k = 1; k <= 3; k++) {
            const dk = 'd' + k, sig = Array.isArray(fin.edges) ? fin.edges[k - 1] : null;
            const dVec = sig && Array.isArray(sig.dir) ? sig.dir : null;
            const axTag = dVec ? (Math.abs(dVec[0]) > 0.9 ? ' (X)' : Math.abs(dVec[1]) > 0.9 ? ' (Y)' : Math.abs(dVec[2]) > 0.9 ? ' (Z)' : '') : '';
            const cf = UI.numField({ id: `fin-${dk}-${fin.id}`, label: T(`panel.edges.dist${k}`) + axTag, value: fin[dk] != null ? fin[dk] : 2, min: 0.01, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { [dk]: v }) });
            if (err) cf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
            ccFields.append(cf);
          }
          ks.append(ccFields); continue;
        }
        if (fin.type === 'faceFillet') {
          const nf = UI.numField({ id: 'fin-' + fin.id, label: T('panel.edges.faceFillet') + ' · ' + T('panel.edges.twoFaces'), value: fin.r, min: 0.01, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
          if (err) nf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
          const rp = h('button', { type: 'button', class: 'btn ghost small', id: 'fin-repick-' + fin.id, 'data-help': 'faceFillet' }, T('panel.edges.repickFaces'));
          rp.onclick = () => Features.startFaceFillet(null, { itemId: it.id, replaceFinId: fin.id, r: fin.r });
          row.style.gridTemplateColumns = isRef ? '1fr auto auto auto' : '1fr auto auto';
          row.append(nf, rp);
          if (isRef) {
            const iss = rightIssues.find((x) => x.finishId === fin.id);
            if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
          }
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(del); ks.append(row); continue;
        }
        if (fin.type === 'partingDraft') {
          const ttl = h('div', { class: 'mini-row' + (isRef ? ' warn' : err ? ' invalid' : '') }, h('span', { class: 'grow' }, T('panel.edges.partingDraft')));
          row.style.gridTemplateColumns = isRef ? '1fr auto auto' : '1fr auto';
          row.append(ttl);
          if (isRef) {
            const iss = rightIssues.find((x) => x.finishId === fin.id);
            if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
          }
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(del); ks.append(row);

          const sym = fin.sym !== false;
          const angRow = h('div', { class: 'fields', style: { gridTemplateColumns: sym ? '1fr' : '1fr 1fr' } });
          const nf1 = UI.numField({ id: 'fin-' + fin.id, label: sym ? T('common.angle') : T('panel.edges.pdAngleUp'), value: fin.r != null ? fin.r : 3, unit: '°', vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
          if (err) nf1.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
          angRow.append(nf1);
          if (!sym) {
            const nf2 = UI.numField({ id: 'fin-r2-' + fin.id, label: T('panel.edges.pdAngleDown'), value: fin.r2 != null ? fin.r2 : (fin.r != null ? fin.r : 3), unit: '°', vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r2: v }) });
            if (err) nf2.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
            angRow.append(nf2);
          }
          ks.append(angRow);

          const pMode = fin.mode || 'mid';
          const pAxis = fin.axis === 'x' || fin.axis === 'y' ? fin.axis : 'z';
          const datums = (App.doc && Array.isArray(App.doc.datums)) ? App.doc.datums : [];
          const modeOpts = [['mid', T('panel.edges.pdMid')], ['offset', T('panel.edges.pdOffset')], ['edge', T('panel.edges.pdEdge')]];
          if (datums.length || pMode === 'datum') modeOpts.push(['datum', T('panel.edges.pdDatum')]);
          const modeRow = h('div', { class: 'fields', style: { gridTemplateColumns: pMode === 'datum' ? '1fr' : '1fr auto', marginTop: '6px' } });
          modeRow.append(UI.selectField({
            id: 'fin-pmode-' + fin.id,
            label: T('panel.edges.pdLine'),
            value: pMode,
            options: modeOpts,
            onChange: (v) => {
              const patch = { mode: v };
              if (v === 'offset' && fin.pos == null) {
                const axIdx = pAxis === 'x' ? 0 : pAxis === 'y' ? 1 : 2;
                const bb = App.results.get(it.id)?.data?.bbox;
                patch.pos = bb ? round((bb[axIdx] + bb[axIdx + 3]) / 2, 2) : 0;
              } else if (v === 'datum' && !fin.datumId && datums.length) {
                patch.datumId = datums[0].id;
              }
              Actions.setFinish(it.id, fin.id, patch);
            },
          }));
          if (pMode !== 'datum') {
            modeRow.append(UI.selectField({
              id: 'fin-paxis-' + fin.id,
              label: T('panel.edges.pdAxis'),
              value: pAxis,
              options: [['z', 'Z'], ['x', 'X'], ['y', 'Y']],
              onChange: (v) => {
                const patch = { axis: v };
                if (pMode === 'offset') {
                  const axIdx = v === 'x' ? 0 : v === 'y' ? 1 : 2;
                  const bb = App.results.get(it.id)?.data?.bbox;
                  if (bb) patch.pos = round((bb[axIdx] + bb[axIdx + 3]) / 2, 2);
                }
                Actions.setFinish(it.id, fin.id, patch);
              },
            }));
          }
          ks.append(modeRow);

          if (pMode === 'offset') {
            const axIdx = pAxis === 'x' ? 0 : pAxis === 'y' ? 1 : 2;
            const bb = App.results.get(it.id)?.data?.bbox;
            const defPos = bb ? round((bb[axIdx] + bb[axIdx + 3]) / 2, 2) : 0;
            ks.append(h('div', { class: 'fields one', style: { marginTop: '6px' } }, UI.numField({ id: 'fin-ppos-' + fin.id, label: T('panel.edges.pdPos'), value: fin.pos != null ? fin.pos : defPos, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { pos: v }) })));
          } else if (pMode === 'edge') {
            const peBtn = h('button', { type: 'button', class: 'btn small', id: 'fin-pedge-' + fin.id, 'data-help': 'partingDraft' }, T('panel.edges.pdPickEdge'));
            peBtn.onclick = () => Features.pickPartingDraftEdge(it.id, fin.id);
            ks.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, peBtn));
          } else if (pMode === 'datum' && datums.length) {
            ks.append(h('div', { class: 'fields one', style: { marginTop: '6px' } }, UI.selectField({
              id: 'fin-pdatum-' + fin.id,
              label: T('panel.edges.pdDatum'),
              value: fin.datumId || datums[0].id,
              options: datums.map((d) => [d.id, d.name || d.id]),
              onChange: (v) => Actions.setFinish(it.id, fin.id, { datumId: v }),
            })));
          }

          const optRow = h('div', { class: 'fields', style: { gridTemplateColumns: '1fr 1fr', marginTop: '6px' } });
          const symLbl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fin-psym-' + fin.id, checked: sym }), T('panel.edges.pdSym'));
          symLbl.querySelector('input').onchange = (e) => Actions.setFinish(it.id, fin.id, { sym: e.target.checked, r2: e.target.checked ? fin.r : (fin.r2 != null ? fin.r2 : fin.r) });
          const flipLbl = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'fin-pflip-' + fin.id, checked: !!fin.flip }), T('panel.edges.pdFlip'));
          flipLbl.querySelector('input').onchange = (e) => Actions.setFinish(it.id, fin.id, { flip: e.target.checked });
          optRow.append(symLbl, flipLbl);
          ks.append(optRow);
          continue;
        }
        const edgeSelMap = { all: T('panel.edges.selAll'), top: T('panel.edges.selTop'), bottom: T('panel.edges.selBottom'), vertical: T('panel.edges.selVertical'), horizontal: T('panel.edges.selHorizontal') };
        const eCnt = (fin.edges || []).length;
        const lbl = (fin.type === 'chamfer' ? T('panel.edges.chamfer') : T('panel.edges.fillet')) + (typeof fin.edges === 'string' ? ' · ' + (edgeSelMap[fin.edges] || '') : ' · ' + (eCnt === 1 ? T('panel.edges.oneEdge') : T('panel.edges.manyEdges', { n: eCnt })));
        const ch = fin.type === 'chamfer', vr = !ch && !!fin.vr, cm = ch ? fin.cm || '' : '';
        const nf = UI.numField({ id: 'fin-' + fin.id, label: vr ? T('panel.edges.fromLabel', { lbl }) : cm ? T('panel.edges.distLabel', { lbl }) : lbl, value: fin.r, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
        if (err) nf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
        row.append(nf);
        if (isRef) {
          const iss = rightIssues.find((x) => x.finishId === fin.id);
          if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
        }
        const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('common.remove'), 'data-tip': T('common.remove') }); del.innerHTML = icon('trash');
        del.onclick = () => Actions.removeFinish(it.id, fin.id);
        row.append(del); ks.append(row);
        // Art: Rundung gleichmäßig oder von … bis; Fase gleich, mit zwei Abständen oder mit Winkel
        const r0 = Model.num(fin.r, V, 1);
        const mo = h('div', { class: 'fields pro fin-more' });
        if (ch) {
          mo.append(UI.selectField({ id: 'fin-mode-' + fin.id, label: T('panel.edges.chamferMode'), value: cm, options: [['', T('panel.edges.cmEqual')], ['two', T('panel.edges.cmTwo')], ['angle', T('panel.edges.cmAngle')]], onChange: (v) => Actions.setFinish(it.id, fin.id, v === 'two' ? { cm: 'two', r2: fin.r2 != null ? fin.r2 : round(r0 * 2, 3) } : v === 'angle' ? { cm: 'angle', a: fin.a != null ? fin.a : 30 } : { cm: null }) }));
          if (cm === 'two') mo.append(UI.numField({ id: 'fin-r2-' + fin.id, label: T('panel.edges.dist2'), value: fin.r2 != null ? fin.r2 : r0, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r2: v }) }));
          if (cm === 'angle') mo.append(UI.numField({ id: 'fin-a-' + fin.id, label: T('common.angle'), value: fin.a != null ? fin.a : 45, unit: '°', vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { a: v }) }));
        } else {
          Features.renderFilletMore(it, fin, mo, V, r0);
        }
        ks.append(mo);
        if (vr || cm) {
          const sw = h('button', { type: 'button', class: 'btn ghost small pro', id: 'fin-swap-' + fin.id }); sw.innerHTML = icon('mirror') + esc(vr ? T('panel.edges.swapDir') : T('panel.edges.swapSide'));
          sw.onclick = () => Actions.setFinish(it.id, fin.id, vr ? { r: fin.r2, r2: fin.r } : { side: fin.side ? null : 1 });
          ks.append(h('div', { class: 'btn-row' }, sw));
        }
      }
      const kr = h('div', { class: 'btn-row' });
      const mk = (label, sel) => { const b = h('button', { type: 'button', class: 'btn small', 'data-help': 'fillet' }); b.innerHTML = icon('fillet') + esc(label); b.onclick = () => { Actions.finishAll(it.id, 'fillet', sel, 1); }; return b; };
      kr.append(mk(T('panel.edges.roundAll'), 'all'), mk(T('panel.edges.roundVert'), 'vertical'), mk(T('panel.edges.roundTop'), 'top'));
      const ffBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-full-fillet', 'data-help': 'fullFillet' }); ffBtn.innerHTML = icon('fillet') + esc(T('panel.edges.fullFilletBtn')); ffBtn.onclick = () => Features.startFullFillet(null, { itemId: it.id }); kr.append(ffBtn);
      const flfBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-face-fillet', 'data-help': 'faceFillet' }); flfBtn.innerHTML = icon('fillet') + esc(T('panel.edges.faceFilletBtn')); flfBtn.onclick = () => Features.startFaceFillet(null, { itemId: it.id }); kr.append(flfBtn);
      const ccBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-corner-chamfer', 'data-help': 'cornerChamfer' }); ccBtn.innerHTML = icon('chamfer') + esc(T('panel.edges.cornerChamferBtn')); ccBtn.onclick = () => Features.startCornerChamfer(it.id); kr.append(ccBtn);
      if (!(it.finishes || []).some((x) => x.type === 'draft')) { const db = h('button', { type: 'button', class: 'btn small pro', id: 'btn-draft', 'data-help': 'draft' }); db.innerHTML = icon('chamfer') + esc(T('panel.edges.draftBtn')); db.onclick = () => Actions.finishAll(it.id, 'draft', 'all', 3); kr.append(db); }
      const pdBtn = h('button', { type: 'button', class: 'btn small pro', id: 'btn-parting-draft', 'data-help': 'partingDraft' }); pdBtn.innerHTML = icon('chamfer') + esc(T('panel.edges.partingDraftBtn')); pdBtn.onclick = () => Features.addPartingDraft(it.id); kr.append(pdBtn);
      ks.append(kr);
      ks.append(h('div', { class: 'hint-box', html: T('panel.edges.hint') }));
      w.append(ks);
    }
    if (!isMoveOnly) {
      w.append(colorSection((c) => App.change(c ? 'Farbe geändert' : 'Farbe vom Werkstoff', (doc) => { const tgt = Model.find(doc, it.id).item; if (c) { tgt.color = c; tgt.colorSet = true; } else delete tgt.colorSet; }), it.color, !!it.colorSet, it));
      // Farbe der gewählten Fläche(n)
      const sfs = !isRef ? (App.faces || []).filter((x) => x.id === it.id).map((x) => {
        const r = App.results.get(x.id);
        const info = r && r.data && r.data.faces ? r.data.faces[x.faceIdx] : null;
        return info ? { id: x.id, idx: x.faceIdx, info } : null;
      }).filter(Boolean) : [];
      const sf = sfs.length ? sfs[sfs.length - 1] : (!isRef ? Actions.selectedFace() : null);
      if (sf && sf.id === it.id && it.role !== 'hole') {
        const targetFaces = sfs.length ? sfs : [sf];
        const targetIdxs = new Set(targetFaces.map((x) => x.idx));
        const fsec = h('div', { class: 'section', id: 'face-color', 'data-help': 'faceColor' }, h('div', { class: 'section-h' }, T('panel.faceCol.title')));
        const cur = (it.faceColors || []).find((x) => Viewer.faceIndexOf(it.id, x) === sf.idx);
        const setFace = (col) => App.change(col ? 'Flächenfarbe' : 'Flächenfarbe entfernt', (doc) => {
          const tgt = Model.find(doc, it.id).item; const list = (tgt.faceColors || []).filter((x) => !targetIdxs.has(Viewer.faceIndexOf(it.id, x)));
          if (col) for (const f of targetFaces) list.push({ n: f.info.n || null, c: f.info.c, col });
          if (list.length) tgt.faceColors = list; else delete tgt.faceColors;
        });
        const row = h('div', { class: 'colors' });
        for (const c of COLORS) { const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': cur && cur.col === c.c ? 'true' : 'false', style: { background: c.c } }); b.onclick = () => setFace(c.c); row.append(b); }
        const free = h('input', { type: 'color', id: 'face-color-inp', value: cur ? cur.col : '#e03131', 'aria-label': T('panel.faceCol.aria') });
        free.addEventListener('change', () => setFace(free.value.toLowerCase()));
        row.append(h('label', { class: 'color-free', 'data-tip': T('panel.color.anyTip') }, free));
        fsec.append(row);
        if (cur) { const b = h('button', { type: 'button', class: 'btn ghost', id: 'face-color-off' }); b.innerHTML = icon('undo') + esc(T('panel.faceCol.remove')); b.onclick = () => setFace(null); fsec.append(h('div', { class: 'btn-row' }, b)); }
        w.append(fsec);
      }
      // Kosmetische Gewinde (KP-20)
      const isCylFace = !!(!isRef && sf && sf.id === it.id && sf.info.t === 'CYLINDRE');
      if (!isRef && it.role !== 'hole' && (isCylFace || (it.threads && it.threads.length))) {
        const tsec = h('div', { class: 'section', id: 'thread-sec', 'data-help': 'cosmeticThread' }, h('div', { class: 'section-h' }, T('panel.thread.title')));
        if (isCylFace && !Features.threadOnFace(it.id, sf.idx)) {
          const mb = h('button', { type: 'button', class: 'btn small', id: 'btn-mark-thread' });
          mb.innerHTML = icon('thread') + esc(T('panel.thread.markBtn'));
          mb.onclick = (e) => Features.threadPop(sf, e.currentTarget);
          tsec.append(h('div', { class: 'btn-row' }, mb));
        }
        for (const th of it.threads || []) {
          const sp = THREAD_MAP[th.size] || { pitch: 1 };
          const pitch = (th.pitch > 0 ? th.pitch : null) || sp.pitch;
          const box = h('div', { class: 'thread-item', style: { display: 'grid', gap: '6px', padding: '6px 0', borderTop: '1px solid var(--line)' } });
          box.append(h('div', { class: 'mini-row' }, h('b', null, `${th.size} × ${Units.fmtLenU(th.length, 1)}`), h('span', { class: 'grow muted', style: { marginLeft: '6px', fontSize: '11px' } }, `${th.kind === 'int' ? T('panel.thread.int') : T('panel.thread.ext')} · P ${fmtFixed(pitch, 2)}`)));
          const fs = h('div', { class: 'fields' });
          fs.append(UI.selectField({ id: 'th-size-' + th.id, label: T('panel.thread.mSize'), value: th.size, options: THREAD_SPECS.map((s) => [s.size, s.size]), onChange: (v) => Features.updateThread(it.id, th.id, { size: v }) }));
          fs.append(UI.numField({ id: 'th-pitch-' + th.id, label: T('panel.thread.pitch'), value: pitch, min: 0.25, step: 0.05, unit: 'mm', expr: false, onCommit: (v) => Features.updateThread(it.id, th.id, { pitch: v }) }));
          fs.append(UI.numField({ id: 'th-len-' + th.id, label: T('common.length'), value: th.length, min: 0.5, unit: 'mm', expr: false, onCommit: (v) => Features.updateThread(it.id, th.id, { length: v }) }));
          fs.append(UI.selectField({ id: 'th-from-' + th.id, label: T('panel.thread.end'), value: th.from || 'top', options: [['top', T('panel.thread.end1')], ['bottom', T('panel.thread.end2')]], onChange: (v) => Features.updateThread(it.id, th.id, { from: v }) }));
          box.append(fs);
          const br = h('div', { class: 'btn-row' });
          const rb = h('button', { type: 'button', class: 'btn small', id: 'th-real-' + th.id }); rb.innerHTML = icon('bolt') + esc(T('panel.thread.makeReal')); rb.onclick = () => Features.makeThreadReal(it.id, th.id);
          const db = h('button', { type: 'button', class: 'btn ghost small', id: 'th-del-' + th.id, 'aria-label': T('panel.thread.removeAria'), 'data-tip': T('common.remove') }); db.innerHTML = icon('trash'); db.onclick = () => Features.removeThread(it.id, th.id);
          br.append(rb, db);
          box.append(br);
          tsec.append(box);
        }
        tsec.append(h('div', { class: 'hint-box' }, T('panel.thread.hint')));
        w.append(tsec);
      }
      if (it.role !== 'hole') {
        const op = h('div', { class: 'fields', 'data-help': 'opacity' });
        op.append(UI.numField({ id: 'item-opacity', label: T('panel.item.opacity'), value: Math.round((it.opacity ?? 1) * 100), unit: '%', expr: false, min: 5, onCommit: (v) => App.change('Durchsichtigkeit', (doc) => { const tgt = Model.find(doc, it.id).item; const o = clamp(v, 5, 100) / 100; if (o >= 1) delete tgt.opacity; else tgt.opacity = o; }, { merge: 'op:' + it.id }) }));
        w.lastChild.append(op);
      }
      // Textur je Körper (AN-16)
      if (it.role !== 'hole') {
        const curTex = it.texture && it.texture.kind ? it.texture : null;
        const txSec = h('div', { class: 'section', id: 'texture-sec', 'data-help': 'bodyTexture' }, h('div', { class: 'section-h' }, T('panel.tex.title')));
        txSec.append(UI.selectField({
          id: 'item-texture',
          label: T('panel.tex.label'),
          value: curTex ? curTex.kind : '',
          options: [['', T('tex.none')], ['wood', T('tex.wood')], ['brushed', T('tex.brushed')], ['carbon', T('tex.carbon')]],
          onChange: (v) => Actions.setTexture([it.id], v || null),
        }));
        if (curTex) {
          const tf = h('div', { class: 'fields', style: { marginTop: '6px' } });
          tf.append(UI.numField({ id: 'item-tex-scale', label: T('panel.tex.scale'), value: Math.round((curTex.scale || 1) * 100), unit: '%', expr: false, min: 10, onCommit: (v) => Actions.setTexture([it.id], { scale: clamp(v, 10, 2000) / 100 }, { merge: 'texs:' + it.id }) }));
          tf.append(UI.numField({ id: 'item-tex-rot', label: T('panel.tex.rot'), value: curTex.rot || 0, unit: '°', expr: false, onCommit: (v) => Actions.setTexture([it.id], { rot: v }, { merge: 'texr:' + it.id }) }));
          txSec.append(tf);
          txSec.append(h('div', { class: 'hint-box' }, T('panel.tex.hint')));
        }
        w.append(txSec);
      }
      // Aufkleber & Logos auf Flächen (AN-15)
      const isPlaneFace = !isRef && sf && sf.id === it.id && sf.info.t === 'PLANE';
      if (!isRef && it.role !== 'hole' && (isPlaneFace || (it.decals && it.decals.length))) {
        const dsec = h('div', { class: 'section', id: 'decal-sec', 'data-help': 'decal' }, h('div', { class: 'section-h' }, T('panel.decal.title')));
        if (isPlaneFace) {
          const ab = h('button', { type: 'button', class: 'btn small', id: 'btn-add-decal' });
          ab.innerHTML = icon('image') + esc(T('panel.decal.addBtn'));
          ab.onclick = () => Actions.pickDecalFile(sf);
          dsec.append(h('div', { class: 'btn-row' }, ab));
        }
        for (const dc of it.decals || []) {
          const itemBox = h('div', { class: 'decal-item', dataset: { decalId: dc.id } });
          const delBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'dc-del-' + dc.id, 'aria-label': T('panel.decal.removeAria'), 'data-tip': T('common.remove') });
          delBtn.innerHTML = icon('trash');
          delBtn.onclick = () => Actions.removeDecal(it.id, dc.id);
          itemBox.append(h('div', { class: 'decal-head' },
            h('img', { class: 'decal-thumb', src: dc.src, alt: dc.name || 'Aufkleber' }),
            h('b', { class: 'grow' }, dc.name || 'Aufkleber'),
            delBtn,
          ));
          const df = h('div', { class: 'fields' });
          df.append(UI.numField({ id: 'dc-u-' + dc.id, label: T('panel.decal.moveX'), value: dc.u || 0, unit: 'mm', expr: false, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { u: v }, { merge: 'dcu:' + dc.id }) }));
          df.append(UI.numField({ id: 'dc-v-' + dc.id, label: T('panel.decal.moveY'), value: dc.v || 0, unit: 'mm', expr: false, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { v: v }, { merge: 'dcv:' + dc.id }) }));
          df.append(UI.numField({ id: 'dc-rot-' + dc.id, label: T('panel.decal.rot'), value: dc.rot || 0, unit: '°', expr: false, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { rot: v }, { merge: 'dcrot:' + dc.id }) }));
          df.append(UI.numField({ id: 'dc-scale-' + dc.id, label: T('panel.decal.scale'), value: Math.round((dc.scale || 1) * 100), unit: '%', expr: false, min: 5, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { scale: clamp(v, 5, 5000) / 100 }, { merge: 'dcsc:' + dc.id }) }));
          df.append(UI.numField({ id: 'dc-w-' + dc.id, label: T('panel.decal.width'), value: dc.w || 20, unit: 'mm', expr: false, min: 0.5, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { w: Math.max(0.5, v) }, { merge: 'dcw:' + dc.id }) }));
          df.append(UI.numField({ id: 'dc-op-' + dc.id, label: T('panel.decal.opacity'), value: Math.round((dc.opacity ?? 1) * 100), unit: '%', expr: false, min: 5, onCommit: (v) => Actions.updateDecal(it.id, dc.id, { opacity: clamp(v, 5, 100) / 100 }, { merge: 'dcop:' + dc.id }) }));
          itemBox.append(df);
          const flipInp = h('input', { type: 'checkbox', id: 'dc-flip-' + dc.id, checked: !!dc.flipX });
          flipInp.onchange = (e) => Actions.updateDecal(it.id, dc.id, { flipX: e.target.checked });
          itemBox.append(h('label', { class: 'check' }, flipInp, h('span', null, T('panel.decal.flipX'))));
          dsec.append(itemBox);
        }
        dsec.append(h('div', { class: 'hint-box' }, T('panel.decal.hint')));
        w.append(dsec);
      }
    }
    // Material und Gewicht dieses Teils (nur Teile der obersten Ebene)
    if (!f.parent && it.role !== 'hole' && !isMoveOnly) {
      const pm = Mass.projectMaterial();
      const ms = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, T('panel.proj.matTitle')));
      const fixed = Mass.fixedOf(it);
      ms.append(UI.selectField({ id: 'p-mat', label: T('panel.proj.matLabel'), value: fixed ? '__fix' : it.mat || '', options: materialOptions([['', T('panel.item.matAsProj', { mat: pm.k })], ['__fix', T('panel.item.matBought')]]), onChange: (v) => {
        if (v === '__fix') { Mass.measure().then((r) => { const p = Mass.partOf(r, it.id); App.change('Festes Gewicht', (doc) => { const tgt = Model.find(doc, it.id).item; delete tgt.mat; tgt.massG = p ? round(p.mass, 1) : 10; }); }); return; }
        App.change('Material gewählt', (doc) => { const tgt = Model.find(doc, it.id).item; delete tgt.massG; delete tgt.colorSet; if (v) tgt.mat = v; else delete tgt.mat; });
      } }));
      if (!fixed) ms.append(materialInfoBox(Mass.materialFor(it), 'p-mat-info'));
      if (fixed) {
        ms.append(h('div', { class: 'fields', style: { marginTop: '8px' } }, UI.numField({ id: 'p-massg', label: T('panel.item.massDatasheet'), value: it.massG, unit: 'g', onCommit: (v) => App.change('Gewicht geändert', (doc) => { Model.find(doc, it.id).item.massG = v; }, { merge: 'massg:' + it.id }) })));
        ms.append(h('div', { class: 'hint-box' + (it.massG === '' ? ' warn' : ''), html: it.massG === '' ? T('panel.item.massMissingHint') : T('panel.item.massBoughtHint') }));
      }
      const vR = h('b', { class: 'mono' }, '…'), gR = h('b', { class: 'mono' }, '…'), aR = h('b', { class: 'mono' }, '…'), bR = h('b', { class: 'mono' }, '…');
      ms.append(h('div', { class: 'mini-list', style: { marginTop: '8px' } }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.proj.volume')), vR), h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.item.surface')), aR), h('div', { class: 'mini-row', 'data-help': 'bboxSize' }, h('span', { class: 'grow' }, T('panel.item.bbox')), bR), h('div', { class: 'mini-row', 'data-help': 'massProps' }, h('span', { class: 'grow' }, T('panel.proj.weight')), gR)));
      Mass.measure().then((r) => {
        const p = Mass.partOf(r, it.id); vR.textContent = p ? Units.fmtVolU(p.volume, 3) : '–'; gR.textContent = p ? Mass.gText(p.mass) + (p.fixed ? T('panel.item.massFixed') : '') : '–'; vR.id = 'p-vol'; gR.id = 'p-mass';
        aR.textContent = p && p.area ? (Units.key() === 'mm' ? `${fmt(p.area / 100, 2)} cm²` : Units.fmtAreaU(p.area, 2)) : '–'; aR.id = 'p-area';
        const b = p && p.bbox; bR.textContent = b ? `${Units.fmtLen(b[3] - b[0], 2)} × ${Units.fmtLen(b[4] - b[1], 2)} × ${Units.fmtLen(b[5] - b[2], 2)} ${Units.label()}` : '–'; bR.id = 'p-bbox';
        // Trägheit um den Schwerpunkt (PF-13) und Standfestigkeit (PF-14)
        if (p && p.I && !p.fixed) {
          const gc = (x) => fmtFixed(x / 100, x / 100 < 10 ? 2 : 1);
          ms.querySelector('.mini-list').append(h('div', { class: 'mini-row', 'data-help': 'inertia', 'data-tip': T('panel.item.inertiaTip') }, h('span', { class: 'grow' }, T('panel.item.inertia')), h('b', { class: 'mono', id: 'p-inertia' }, `${gc(p.I[0])} · ${gc(p.I[1])} · ${gc(p.I[2])} g·cm²`)));
        }
        const st = p && p.com ? Mass.stability(it.id, p.com) : null;
        if (st) ms.querySelector('.mini-list').append(h('div', { class: 'mini-row', 'data-help': 'stability' }, h('span', { class: 'grow' }, T('panel.item.stable')), h('b', { class: 'mono', id: 'p-stand', style: { color: st.ok ? '' : 'var(--bad)' } }, st.ok ? T('panel.item.stableTip', { ang: fmtFixed(st.angle, 0) }) : T('panel.item.unstable'))));
      });
      w.append(ms);
      // Teileigenschaften (BG-12): Teilenummer, Beschreibung, Lieferant, Preis
      const ownProps = (it.props && typeof it.props === 'object') ? it.props : {};
      const effProps = Mass.partProps(it);
      const psec = h('div', { class: 'section part-props-sec', id: 'part-props-sec', 'data-help': 'partProps' }, h('div', { class: 'section-h' }, T('panel.partProps.title')));
      const row1 = h('div', { class: 'fields' });
      row1.append(UI.textField({
        id: 'p-partno',
        label: T('panel.partProps.partNo'),
        value: ownProps.partNo || '',
        placeholder: (isRef && !ownProps.partNo && effProps.partNo) ? effProps.partNo : T('panel.partProps.partNoPh'),
        onCommit: (v) => Mass.setPartProps(it.id, { partNo: v }),
      }));
      const priceWrap = h('div', { class: 'field' }, h('label', { for: 'p-price' }, T('panel.partProps.price')));
      const priceBox = h('div', { class: 'inp' });
      const priceVal = typeof ownProps.price === 'number' && isFinite(ownProps.price) ? Mass.fmtPriceNum(ownProps.price) : '';
      const pricePh = (isRef && ownProps.price == null && effProps.price != null) ? Mass.fmtPriceNum(effProps.price) : T('panel.partProps.pricePh');
      const priceInp = h('input', { id: 'p-price', type: 'text', inputmode: 'decimal', value: priceVal, placeholder: pricePh, autocomplete: 'off', spellcheck: 'false' });
      priceBox.append(priceInp, h('span', { class: 'unit' }, '€'));
      priceWrap.append(priceBox);
      let priceOrig = priceInp.value, priceLastBad = null;
      const commitPrice = () => {
        const raw = priceInp.value.trim();
        if (raw === priceOrig) { priceBox.classList.remove('invalid'); priceLastBad = null; return; }
        const pv = Mass.parsePrice(raw);
        if (Number.isNaN(pv)) {
          priceBox.classList.add('invalid');
          if (priceLastBad !== raw) UI.toast(T('panel.partProps.priceErr'), { kind: 'bad' });
          priceLastBad = raw;
          return;
        }
        priceBox.classList.remove('invalid');
        priceLastBad = null;
        priceOrig = pv != null ? Mass.fmtPriceNum(pv) : '';
        priceInp.value = priceOrig;
        Mass.setPartProps(it.id, { price: pv });
      };
      priceInp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { commitPrice(); priceInp.blur(); }
        if (e.key === 'Escape') { priceInp.value = priceOrig; priceBox.classList.remove('invalid'); priceLastBad = null; priceInp.blur(); }
      });
      priceInp.addEventListener('change', commitPrice);
      priceInp.addEventListener('blur', commitPrice);
      priceInp.addEventListener('focus', () => priceInp.select());
      row1.append(priceWrap);
      psec.append(row1);
      const row2 = h('div', { style: { marginTop: '6px' } }, UI.textField({
        id: 'p-supplier',
        label: T('panel.partProps.supplier'),
        value: ownProps.supplier || '',
        placeholder: (isRef && !ownProps.supplier && effProps.supplier) ? effProps.supplier : T('panel.partProps.supplierPh'),
        onCommit: (v) => Mass.setPartProps(it.id, { supplier: v }),
      }));
      const row3 = h('div', { style: { marginTop: '6px' } }, UI.textField({
        id: 'p-desc',
        label: T('panel.partProps.desc'),
        value: ownProps.desc || '',
        placeholder: (isRef && !ownProps.desc && effProps.desc) ? effProps.desc : T('panel.partProps.descPh'),
        onCommit: (v) => Mass.setPartProps(it.id, { desc: v }),
      }));
      psec.append(row2, row3);
      w.append(psec);
    }
    // Mehr
    const more = h('button', { type: 'button', class: 'more', 'aria-expanded': 'false' }); more.innerHTML = icon('chevR') + esc(T('panel.item.moreOpts'));
    const mbox = h('div', { class: 'section', hidden: true });
    more.onclick = () => { const o = more.getAttribute('aria-expanded') !== 'true'; more.setAttribute('aria-expanded', o); mbox.hidden = !o; };
    const lk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'lock', checked: !!it.locked }), T('panel.item.lock'));
    lk.querySelector('input').onchange = (e) => Actions.setGrounded([it.id], e.target.checked);
    const hd = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hide', checked: !!it.hidden }), T('common.hide'));
    hd.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Ausgeblendet' : 'Eingeblendet', (doc) => { Model.find(doc, it.id).item.hidden = e.target.checked; });
    const br = h('div', { class: 'btn-row' });
    const b1 = h('button', { type: 'button', class: 'btn small' }); b1.innerHTML = icon('copy') + esc(T('common.duplicate')); b1.onclick = () => Actions.duplicate([it.id]);
    const b2 = h('button', { type: 'button', class: 'btn small' }); b2.innerHTML = icon('mirror') + esc(T('panel.item.mirrorX')); b2.onclick = () => Actions.mirror([it.id], 'x');
    const b3 = h('button', { type: 'button', class: 'btn small' }); b3.innerHTML = icon('mirror') + esc(T('panel.item.mirrorY')); b3.onclick = () => Actions.mirror([it.id], 'y');
    const b4 = h('button', { type: 'button', class: 'btn small danger' }); b4.innerHTML = icon('trash') + esc(T('common.delete')); b4.onclick = () => Actions.remove([it.id]);
    br.append(b1, b2, b3, b4);
    mbox.append(lk, hd, br);
    w.append(more, mbox);
    body.append(w);
  }

  // ---------- Kontextleiste im 3D-Bild ----------
  let ctx = null;
  function renderCtx() {
    if (ctx) { ctx.remove(); ctx = null; }
    if (App.mode !== 'model' || Sketch.active || Place.active || Handles.dragging) { Features.syncPatternMarkers(); return; }
    const items = App.selectedItems(); if (!items.length) { Features.syncPatternMarkers(); return; }
    const bar = h('div', { class: 'ctxbar', role: 'toolbar', 'aria-label': T('ctx.toolbarAria') });
    const PRO = ['similar', 'shell', 'patternCirc', 'split', 'boolSubtract', 'layers', 'moveStep', 'scaleBody', 'deform', 'deleteBody', 'thicken', 'wrap', 'vent', 'fins', 'patternFill', 'web'];
    const b = (ic, label, fn, cls = '', tip, iconOnly) => { const x = h('button', { type: 'button', class: cls + (PRO.includes(ic) ? ' pro' : ''), 'data-tip': tip || (iconOnly ? label : null), 'aria-label': label || tip, 'data-help': HELP[ic] ? ic : null }); x.innerHTML = icon(ic) + (label && !iconOnly ? `<span>${label}</span>` : ''); x.onclick = (e) => { e.stopPropagation(); fn(e); }; bar.append(x); return x; };
    const sep = () => bar.append(h('span', { class: 'vsep' }));
    // Schritt hinter dem Marker oder unterdrückt: nichts zum Bearbeiten, nur zurückholen
    const off = !App.ctx ? items.map((x) => Model.topOf(App.doc, x.item.id)).find((t) => t && !Model.isActive(App.doc, t.id)) : null;
    if (off) {
      bar.classList.add('inactive');
      bar.append(h('span', { class: 'lbl' }, off.suppressed ? T('ctx.suppressed') : T('ctx.behindMarker')));
      if (off.suppressed) b('eye', T('ctx.enableAgain'), () => Timeline.toggleSuppress(off.id), 'accent', T('ctx.enableAgainTip'));
      else b('rollback', T('ctx.markerAfter'), () => Timeline.setMarker(App.doc.items.indexOf(off) + 1, `Zeitleiste: bis „${Model.label(off)}“`), 'accent', T('ctx.markerAfterTip'));
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'deleteBody') {
      const it = items[0].item;
      const tgs = Array.isArray(it.p && it.p.targets) ? it.p.targets : (it.p && it.p.target ? [it.p.target] : []);
      bar.append(h('span', { class: 'lbl' }, T('ctx.deleteBodyStepLabel')));
      if (tgs.length === 1 && Model.find(App.doc, tgs[0])) b('pointer', T('ctx.targetBody'), () => App.select([tgs[0]]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), 'accent', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && ((items[0].item.kind === 'transform' && !(items[0].item.p && items[0].item.p.copy)) || items[0].item.kind === 'scale' || items[0].item.kind === 'deform' || (items[0].item.kind === 'thicken' && !(items[0].item.p && items[0].item.p.mode === 'new')))) {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, it.kind === 'scale' ? T('ctx.scaleStepLabel') : it.kind === 'deform' ? T('ctx.deformStepLabel') : it.kind === 'thicken' ? T('ctx.thickenStepLabel') : T('ctx.moveStepLabel')));
      if (it.kind === 'thicken') b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), 'accent', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'rib') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.rib')));
      b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent', T('ctx.ribTip'));
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      b('patternCirc', T('ctx.pattern'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.patRect'), icon: 'patternRect', run: () => Features.pattern('rect') }, { label: T('ctx.patCirc'), icon: 'patternCirc', run: () => Features.pattern('circ') }, { label: T('ctx.patPath'), icon: 'patternPath', run: () => Features.patternPath() }, { label: T('ctx.patPoints'), icon: 'point', help: 'patternPoints', run: () => Features.patternPoints() }, { label: T('ctx.patTable'), icon: 'list', help: 'patternTable', run: () => Features.patternTable() }]), '', T('ctx.patternTip'), true);
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && (items[0].item.kind === 'vent' || items[0].item.kind === 'fins' || items[0].item.kind === 'fillPattern' || items[0].item.kind === 'web' || items[0].item.kind === 'dome')) {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.' + it.kind)));
      if (it.kind === 'web') b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent', T('ctx.webTip'));
      else b('cursor', T('panel.ext.pickOtherFace'), () => (it.kind === 'vent' ? Features.pickVentFace(it.id) : it.kind === 'fins' ? Features.pickFinsFace(it.id) : it.kind === 'fillPattern' ? Features.pickFillPatternFace(it.id) : Features.pickDomeFace(it.id)), 'accent', T('ctx.' + it.kind + 'PickTip')).dataset.help = it.kind;
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'wrap') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.wrap')));
      b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent', T('ctx.wrapTip'));
      if (it.p && it.p.mode === 'line') {
        b('sweep', T('ctx.alongPath'), () => Features.sweepFromWrap(it.id), '', T('ctx.alongPathTip'));
      } else {
        b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      }
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'emboss') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.emboss')));
      b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent', T('ctx.embossTip2'));
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'splitFace') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.splitFace')));
      b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent', T('ctx.splitFaceEditTip')).dataset.help = 'splitFace';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'sketch3d') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.sketch3d')));
      b('edit', T('sk3.editBtn'), () => Sketch.edit3d(it.id), 'accent', T('sk3.editTip'));
      b('sweep', T('ctx.alongPath'), () => Features.sweepFromSketch3d(it.id), '', T('sk3.sweepTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'mirrorStep') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('ctx.mirrorStepLabel')));
      b('cursor', T('ctx.pickMirrorPlane'), () => Features.pickMirrorStepPlane(it.id), 'accent', T('ctx.pickMirrorPlaneTip')).dataset.help = 'mirrorStep';
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      const merged = App.mergedInto(it.id);
      if (merged && Model.find(App.doc, merged)) b('pointer', T('ctx.targetBody'), () => App.select([merged]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'boss') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.boss')));
      b('cursor', T('ctx.bossPickFace'), () => Features.pickBossFace(it.id), 'accent', T('ctx.bossTip')).dataset.help = 'boss';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'lipGroove') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('kind.lipGroove')));
      b('cursor', T('ctx.lipPickEdge'), () => Features.pickLipGrooveEdge(it.id), 'accent', T('ctx.lipGrooveTip')).dataset.help = 'lipGroove';
      b('replace', T('ctx.lipSwap'), () => Features.swapLipGroove(it.id), '', T('ctx.lipGrooveTip')).dataset.help = 'lipGroove';
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && (items[0].item.kind === 'undercut' || items[0].item.kind === 'circlipGroove' || items[0].item.kind === 'keyway' || items[0].item.kind === 'splineProfile' || items[0].item.kind === 'knurl' || items[0].item.kind === 'gripPattern')) {
      const it = items[0].item;
      const helpKey = it.kind === 'keyway' ? 'keywayStep' : it.kind;
      const undoLbl = `${it.kind === 'gripPattern' ? 'Fläche' : 'Zylinderfläche'} für ${T('kind.' + it.kind)} gewählt`;
      bar.append(h('span', { class: 'lbl' }, T('kind.' + it.kind)));
      b('cursor', 'Andere Fläche wählen', () => (it.kind === 'gripPattern' ? Features.pickGripPatternFace(it.id) : Features.pickStepCylFace(it.id, undoLbl)), 'accent').dataset.help = helpKey;
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && (items[0].item.kind === 'stackHole' || items[0].item.kind === 'asmCut')) {
      const it = items[0].item;
      const isHole = it.kind === 'stackHole';
      bar.append(h('span', { class: 'lbl' }, T('kind.' + it.kind)));
      if (isHole) b('cursor', T('asm.holePickBtn'), () => Features.pickStackHolePoint(it.id), 'accent').dataset.help = 'stackHole';
      else b('edit', T('panel.item.editSketch'), () => Sketch.editItem(it.id), 'accent').dataset.help = 'asmCut';
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    const face = Actions.selectedFace();
    // Wert im Schild der Leiste: Klick kopiert ihn (Länge der Kanten, Durchmesser einer runden Fläche)
    const valLbl = (txt, val, unit, tip) => {
      const isL = unit === 'mm';
      const numStr = isL ? Units.fmtLen(val, 2) : fmt(val, 2);
      const uStr = isL ? Units.label() : unit;
      const l = h('span', { class: 'lbl copyable', id: 'sel-val', 'data-help': 'copyValue', 'data-tip': T('ctx.copyValTip', { tip }) }, txt, h('span', { class: 'mono' }, numStr + ' ' + uStr));
      l.onclick = () => Measure.copyText(numStr, txt.trim()); return l;
    };
    if (App.edges.length) {
      const eds = App.edges.map((x) => { const r = App.results.get(x.id); return r && r.data.edges[x.edgeIdx]; }).filter(Boolean);
      const one = eds.length === 1 && eds[0];
      const full = one && one.t === 'CIRCLE' && one.r && Math.hypot(one.a[0] - one.b[0], one.a[1] - one.b[1], one.a[2] - one.b[2]) < 1e-6;
      const total = eds.reduce((s, e) => s + (e.l || 0), 0);
      if (full) bar.append(valLbl(T('ctx.edgeDia'), one.r * 2, 'mm', T('ctx.edgeDiaTip', { r: Units.fmtLenU(one.r, 2), total: Units.fmtLenU(total, 2) })));
      else if (total > 0) bar.append(valLbl(App.edges.length > 1 ? T('ctx.edgesCount', { n: App.edges.length }) : T('ctx.edgeOne'), total, 'mm', App.edges.length > 1 ? T('ctx.edgesTotalTip') : (one && one.t === 'CIRCLE' && one.r ? T('ctx.edgeArcTip', { r: Units.fmtLenU(one.r, 2) }) : T('ctx.edgeLenTip'))));
      else bar.append(h('span', { class: 'lbl' }, App.edges.length > 1 ? T('ctx.edgesCount', { n: App.edges.length }) : T('ctx.edgeOne')));
      b('fillet', T('ctx.fillet'), () => Actions.addFinish('fillet', 1), 'accent', T('ctx.filletTip'));
      b('chamfer', T('ctx.chamfer'), () => Actions.addFinish('chamfer', 1), '', T('ctx.chamferTip'));
      b('chamfer', T('ctx.cornerChamfer'), () => Features.startCornerChamfer(App.edges[0].id), 'pro', T('ctx.cornerChamferTip')).dataset.help = 'cornerChamfer';
      b('similar', T('ctx.similar'), () => Select.similar(), '', T('ctx.similarEdgesTip'), true);
      b('chainEdges', T('ctx.chain'), () => Select.chain(), '', T('ctx.chainTip'), true);
      b('similar', T('ctx.byKind'), (e) => edgeRuleMenu(App.edges[0].id, e.currentTarget), '', T('ctx.byKindTip'), true);
      if (App.edges.length === 1 && one) {
        if (items[0] && items[0].item.role !== 'hole') {
          const pd = b('chamfer', T('ctx.partingDraft'), () => Features.addPartingDraft(App.edges[0].id, { edge: App.edges[0] }), 'pro', T('ctx.partingDraftTip'));
          pd.id = 'ctx-edge-parting-draft'; pd.dataset.help = 'partingDraft';
        }
        if (App.doc.items.filter((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !x.op).length >= 2) {
          const lg = b('lipGroove', T('ctx.lipGroove'), () => Features.lipGroove({ edge: App.edges[0] }), '', T('ctx.lipGrooveTip'));
          lg.id = 'ctx-edge-lip-groove'; lg.dataset.help = 'lipGroove';
        }
        if (one.t === 'LINE') {
          const eb = b('originPlanes', T('ctx.planeAngle'), () => Datums.startEdgeAnglePick(30, App.edges[0]), 'pro', T('ctx.planeAngleTip'));
          eb.dataset.help = 'datumEdgeAngle';
        }
        const nb = b('originPlanes', T('ctx.planeNormal'), () => Datums.addNormalToCurve(App.edges[0], 'mid'), 'pro', T('ctx.planeNormalTip'));
        nb.dataset.help = 'datumNormalCurve';
        const pb = b('point', T('ctx.pointEdgeMid'), () => Datums.addPointEdgeMid(App.edges[0]), 'pro', T('ctx.pointEdgeMidTip'));
        pb.dataset.help = 'datumPoint';
      } else if (App.edges.length === 2 && eds.length === 2 && eds[0].t === 'LINE' && eds[1].t === 'LINE') {
        const tb = b('originPlanes', T('ctx.planeTwoEdges'), () => Datums.addTwoEdges(App.edges[0], App.edges[1]), 'pro', T('ctx.planeTwoEdgesTip'));
        tb.dataset.help = 'datumTwoEdges';
      }
      sep();
    } else if (App.faces && App.faces.length > 1) {
      bar.append(h('span', { class: 'lbl', id: 'ctx-faces-lbl' }, T('ctx.facesCount', { n: App.faces.length })));
      b('fillet', T('ctx.facesEdges'), () => {
        const seen = new Set(), list = [], ids = new Set();
        for (const f of App.faces) {
          for (const ei of Viewer.faceEdges(f.id, f.faceIdx)) {
            const k = f.id + ':' + ei;
            if (!seen.has(k)) { seen.add(k); list.push({ id: f.id, edgeIdx: ei }); ids.add(f.id); }
          }
        }
        if (list.length) App.select([...ids], { edges: list });
      }, 'accent', T('ctx.facesEdgesTip'));
      sep();
    } else if (face && items.length === 1 && face.info.t === 'PLANE') {
      bar.append(h('span', { class: 'lbl' }, T('ctx.face')));
      b('sketch', T('ctx.sketchHere'), () => Sketch.startOnFace(face), 'accent', T('ctx.sketchHereTip')).dataset.help = 'sketchFace';
      b('holeWizard', T('ctx.hole'), (e) => Place.holeHere(face, e.currentTarget), '', T('ctx.holeTip'));
      if (typeof Assembly !== 'undefined' && Assembly.assemblyPartTargets && Assembly.assemblyPartTargets().length >= 2) {
        const shb = b('holeWizard', T('ctx.stackHole'), () => Assembly.startStackHole({ face }), 'pro', T('ctx.stackHoleTip'));
        shb.id = 'ctx-stack-hole'; shb.dataset.help = 'stackHole';
        const acb = b('boolSubtract', T('ctx.asmCut'), () => Assembly.startAsmCut({ face }), 'pro', T('ctx.asmCutTip'));
        acb.id = 'ctx-asm-cut'; acb.dataset.help = 'asmCut';
      }
      b('lift', T('ctx.extrude'), () => Sketch.pushPullFace(face), '', T('ctx.extrudeTip')).dataset.help = 'extrude';
      b('fillet', T('ctx.faceEdges'), (e) => faceEdgeMenu(face, e.currentTarget), '', T('ctx.faceEdgesTip'), true);
      if (items[0].item.role !== 'hole') {
        const ffb = b('fillet', T('ctx.fullFillet'), () => Features.startFullFillet(face), 'pro', T('ctx.fullFilletTip'));
        ffb.id = 'ctx-full-fillet'; ffb.dataset.help = 'fullFillet';
        const flfb = b('fillet', T('ctx.faceFillet'), () => Features.startFaceFillet(face), 'pro', T('ctx.faceFilletTip'));
        flfb.id = 'ctx-face-fillet'; flfb.dataset.help = 'faceFillet';
      }
      if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) {
        b('thicken', T('ctx.thicken'), () => Features.thicken(face), '', T('ctx.thickenTip')).dataset.help = 'thickenFace';
        const bs = b('boss', T('ctx.boss'), () => Features.boss(face), '', T('ctx.bossTip'));
        bs.id = 'ctx-boss'; bs.dataset.help = 'boss';
        if (App.doc.items.filter((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !x.op).length >= 2) {
          const lg = b('lipGroove', T('ctx.lipGroove'), () => Features.lipGroove({ face }), '', T('ctx.lipGrooveTip'));
          lg.id = 'ctx-lip-groove'; lg.dataset.help = 'lipGroove';
        }
        b('emboss', T('ctx.emboss'), () => Features.startEmboss(face), '', T('ctx.embossTip')).dataset.help = 'emboss';
        b('shell', T('ctx.shell'), () => Features.shell(face), '', T('ctx.shellTip'));
        b('rib', T('kind.rib'), () => Features.startRib(face), 'pro', T('ctx.ribFaceTip')).dataset.help = 'rib';
        const vb = b('vent', T('kind.vent'), () => Features.vent(face), 'pro', T('ctx.ventFaceTip'), true);
        vb.id = 'ctx-vent'; vb.dataset.help = 'vent';
        const fb = b('fins', T('kind.fins'), () => Features.fins(face), 'pro', T('ctx.finsFaceTip'), true);
        fb.id = 'ctx-fins'; fb.dataset.help = 'fins';
        const fpb = b('patternFill', T('kind.fillPattern'), () => Features.fillPattern(face), 'pro', T('ctx.fillPatternFaceTip'), true);
        fpb.id = 'ctx-fill-pattern'; fpb.dataset.help = 'fillPattern';
        const gpb = b('gripPattern', T('ctx.gripPattern'), () => Features.gripPattern(face), 'pro', T('ctx.gripPatternTip'), true);
        gpb.id = 'ctx-grip-pattern'; gpb.dataset.help = 'gripPattern';
        const wb = b('web', T('kind.web'), () => Features.startWeb(face), 'pro', T('ctx.webFaceTip'), true);
        wb.id = 'ctx-web'; wb.dataset.help = 'web';
        const sfb = b('splitFace', T('kind.splitFace'), () => Features.startSplitFace(face), 'pro', T('ctx.splitFaceTip'), true);
        sfb.id = 'ctx-split-face'; sfb.dataset.help = 'splitFace';
        const dmb = b('dome', T('kind.dome'), () => Features.dome(face), 'pro', T('ctx.domeFaceTip'), true);
        dmb.id = 'ctx-dome'; dmb.dataset.help = 'dome';
      }
      b('section', T('ctx.sectionHere'), () => Views.section(true, { face }), '', T('ctx.sectionHereTip'), true);
      if (items[0].item.role !== 'hole') {
        const dcb = b('image', T('ctx.decal'), () => Actions.pickDecalFile(face), '', T('ctx.decalTip'), true);
        dcb.id = 'ctx-decal'; dcb.dataset.help = 'decal';
      }
      if (items[0].item.role !== 'hole') b('mirror', T('ctx.mirrorFace'), () => Features.mirrorAtFace(face), '', T('ctx.mirrorFaceTip'), true);
      const pf = b('point', T('ctx.pointFaceCenter'), () => Datums.addPointFaceCenter(face), 'pro', T('ctx.pointFaceCenterTip'));
      pf.dataset.help = 'datumPoint';
      if (items[0].item.role !== 'hole' && App.doc.items.filter((x) => !x.hidden && x.role !== 'hole').length >= 2) {
        const fj = b('lock', T('ctx.fixedJoint'), () => Joints.startFixed(face), '', T('ctx.fixedJointTip'), true);
        fj.id = 'ctx-face-fixed-joint'; fj.dataset.help = 'fixedJoint';
      }
      sep();
    } else if (face && items.length === 1 && face.info.t !== 'PLANE') {
      const fr = face.info.r;
      bar.append(fr ? valLbl(face.info.t === 'SPHERE' ? T('ctx.sphereDia') : T('ctx.roundFaceDia'), fr * 2, 'mm', T('ctx.roundFaceDiaTip', { r: Units.fmtLenU(fr, 2) })) : h('span', { class: 'lbl' }, T('ctx.roundFace')));
      b('holeWizard', T('ctx.hole'), (e) => Place.holeHere(face, e.currentTarget), 'accent', T('ctx.holeRoundTip'));
      if (face.info.t === 'CYLINDRE' && items[0].item.role !== 'hole') {
        const hasTh = !!Features.threadOnFace(face.id, face.idx);
        const tb = b('thread', hasTh ? T('ctx.threadEdit') : T('ctx.threadMark'), (e) => Features.threadPop(face, e.currentTarget), hasTh ? 'accent' : '', T('ctx.threadTip'));
        tb.dataset.help = 'cosmeticThread';
      }
      if (face.info.t === 'CYLINDRE') {
        const ab = b('axes', T('ctx.axis'), () => Datums.addAxisFromFace(face), 'pro', T('ctx.axisTip'));
        ab.dataset.help = 'datumAxis';
        if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) {
          b('wrap', T('kind.wrap'), () => Features.startWrap(face), 'pro', T('ctx.wrapFaceTip')).dataset.help = 'wrapCyl';
          const uc = b('undercut', T('ctx.undercut'), () => Features.undercut(face), 'pro', T('ctx.undercutTip'));
          uc.id = 'ctx-undercut'; uc.dataset.help = 'undercut';
          const cg = b('circlipGroove', T('ctx.circlip'), () => Features.circlipGroove(face), 'pro', T('ctx.circlipTip'));
          cg.id = 'ctx-circlip'; cg.dataset.help = 'circlipGroove';
          const kw = b('keyway', T('ctx.keyway'), () => Features.keyway(face), 'pro', T('ctx.keywayTip'));
          kw.id = 'ctx-keyway'; kw.dataset.help = 'keywayStep';
          const sp = b('splineShaft', T('ctx.splineProfile'), () => Features.splineProfile(face), 'pro', T('ctx.splineProfileTip'));
          sp.id = 'ctx-spline-profile'; sp.dataset.help = 'splineProfile';
          const kn = b('knurl', T('ctx.knurl'), () => Features.knurl(face), 'pro', T('ctx.knurlTip'));
          kn.id = 'ctx-knurl'; kn.dataset.help = 'knurl';
          const gp = b('gripPattern', T('ctx.gripPattern'), () => Features.gripPattern(face), 'pro', T('ctx.gripPatternTip'), true);
          gp.id = 'ctx-grip-pattern'; gp.dataset.help = 'gripPattern';
        }
      }
      if (face.info.t === 'CYLINDRE' || face.info.t === 'CONE') {
        const tb = b('originPlanes', T('ctx.planeTangent'), () => Datums.startTangentPick(face), 'pro', T('ctx.planeTangentTip'));
        tb.dataset.help = 'datumTangent';
      }
      b('fillet', T('ctx.faceEdges'), (e) => faceEdgeMenu(face, e.currentTarget), '', T('ctx.faceEdgesTip'), true);
      if (items[0].item.role !== 'hole') {
        const ffb = b('fillet', T('ctx.fullFillet'), () => Features.startFullFillet(face), 'pro', T('ctx.fullFilletTip'));
        ffb.id = 'ctx-full-fillet'; ffb.dataset.help = 'fullFillet';
        const flfb = b('fillet', T('ctx.faceFillet'), () => Features.startFaceFillet(face), 'pro', T('ctx.faceFilletTip'));
        flfb.id = 'ctx-face-fillet'; flfb.dataset.help = 'faceFillet';
      }
      if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) {
        b('thicken', T('ctx.thicken'), () => Features.thicken(face), '', T('ctx.thickenTip')).dataset.help = 'thickenFace';
        const bs = b('boss', T('ctx.boss'), () => Features.boss(face), '', T('ctx.bossTip'));
        bs.id = 'ctx-boss'; bs.dataset.help = 'boss';
        if (App.doc.items.filter((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !x.op).length >= 2) {
          const lg = b('lipGroove', T('ctx.lipGroove'), () => Features.lipGroove({ face }), '', T('ctx.lipGrooveTip'));
          lg.id = 'ctx-lip-groove'; lg.dataset.help = 'lipGroove';
        }
        b('emboss', T('ctx.emboss'), () => Features.startEmboss(face), '', T('ctx.embossTip')).dataset.help = 'emboss';
        const sfb = b('splitFace', T('kind.splitFace'), () => Features.startSplitFace(face), 'pro', T('ctx.splitFaceTip'), true);
        sfb.id = 'ctx-split-face'; sfb.dataset.help = 'splitFace';
      }
      const pf = b('point', T('ctx.pointFaceCenter'), () => Datums.addPointFaceCenter(face), 'pro', T('ctx.pointFaceCenterTip'));
      pf.dataset.help = 'datumPoint';
      if (items[0].item.role !== 'hole' && App.doc.items.filter((x) => !x.hidden && x.role !== 'hole').length >= 2) {
        const fj = b('lock', T('ctx.fixedJoint'), () => Joints.startFixed(face), '', T('ctx.fixedJointTip'), true);
        fj.id = 'ctx-face-fixed-joint'; fj.dataset.help = 'fixedJoint';
      }
      sep();
    }
    if (items.length === 1 && items[0].item.kind === 'ref') {
      const it = items[0].item;
      const isSubAsm = Model.isSubAssemblyRef(it);
      bar.append(h('span', { class: 'lbl' }, isSubAsm ? T('asm.subAsmShort') : T('kind.ref')));
      b('edit', isSubAsm ? T('asm.openSubAsm') : T('asm.openPart'), () => Comp.openRef(it.id), 'accent', isSubAsm ? T('asm.openSubAsmTip') : T('asm.openPartTip')).dataset.help = isSubAsm ? 'subAssembly' : 'assemblyDoc';
      const rp = b('replace', T('asm.replacePartShort'), () => Comp.replacePartDialog(it.id), '', T('asm.replacePartTip'), true);
      rp.id = 'ctx-replace-part'; rp.dataset.help = 'replacePart';
      const apb = b('patternRect', T('asm.patToolBtn'), (e) => Assembly.patternMenu(e.currentTarget, [it.id]), '', T('asm.patToolTip'), true);
      apb.id = 'ctx-asm-pattern'; apb.dataset.help = 'asmPattern';
      const amb = b('mirror', T('asm.patMenuMirror'), () => Assembly.patternDialog('mirror', [it.id]), '', T('asm.patMirrorTip'), true);
      amb.id = 'ctx-asm-mirror'; amb.dataset.help = 'asmMirror';
      const gb = b(it.locked ? 'unlock' : 'lock', it.locked ? T('asm.unground') : T('asm.ground'), () => Actions.toggleGround([it.id]), it.locked ? 'accent' : '', it.locked ? T('asm.ungroundTip') : T('asm.groundTip'), true);
      gb.id = 'ctx-ground'; gb.dataset.help = 'groundPart';
      b('rotate', T('ctx.rotate'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.rotZ'), icon: 'rotate', kbd: 'R', run: () => Actions.rotate90(null, 'z') }, { label: T('ctx.rotX'), icon: 'rotate', run: () => Actions.rotate90(null, 'x') }, { label: T('ctx.rotY'), icon: 'rotate', run: () => Actions.rotate90(null, 'y') }]), '', T('ctx.rotateTip'), true);
      b('copy', T('common.duplicate'), () => Actions.duplicate(), '', T('ctx.dupTip'), true);
      b('focusView', T('common.isolate'), () => Comp.toggleIso(it.id), '', T('left.tree.isoOn'), true);
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1) {
      const it = items[0].item;
      const hole = it.role === 'hole';
      const compact = !!(face || App.edges.length);
      if (it.locked || Model.isAssembly(App.doc)) {
        const gb = b(it.locked ? 'unlock' : 'lock', it.locked ? T('asm.unground') : T('asm.ground'), () => Actions.toggleGround([it.id]), it.locked ? 'accent' : '', it.locked ? T('asm.ungroundTip') : T('asm.groundTip'), true);
        gb.id = 'ctx-ground'; gb.dataset.help = 'groundPart';
      }
      b(hole ? 'solid' : 'hole', hole ? T('ctx.toBody') : T('ctx.toHole'), () => Actions.toggleRole(), '', hole ? T('ctx.toBodyTip') : T('ctx.toHoleTip'), compact);
      b('rotate', T('ctx.rotate'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.rotZ'), icon: 'rotate', kbd: 'R', run: () => Actions.rotate90(null, 'z') }, { label: T('ctx.rotX'), icon: 'rotate', run: () => Actions.rotate90(null, 'x') }, { label: T('ctx.rotY'), icon: 'rotate', run: () => Actions.rotate90(null, 'y') }, '-', { label: T('ctx.orientPrint'), icon: 'overhang', help: 'orientPrint', run: () => Print.orientForPrint() }]), '', T('ctx.rotateTip'), true);
      b('mirror', T('ctx.mirror'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.mirrorX'), icon: 'mirror', run: () => Actions.mirror(null, 'x') }, { label: T('ctx.mirrorY'), icon: 'mirror', run: () => Actions.mirror(null, 'y') }, { label: T('ctx.mirrorZ'), icon: 'mirror', run: () => Actions.mirror(null, 'z') }]), '', T('ctx.mirrorTip'), true);
      b('copy', T('common.duplicate'), () => Actions.duplicate(), '', T('ctx.dupTip'), true);
      if (App.doc.items.includes(it)) b('moveStep', T('ctx.moveStep'), () => Features.transform(), '', T('ctx.moveStepTip'), true);
      if (App.doc.items.includes(it)) b('scaleBody', T('ctx.scale'), () => Features.scale(), '', T('ctx.scaleTip'), true).dataset.help = 'scaleBody';
      if (App.doc.items.includes(it)) { const dfb = b('deform', T('ctx.deform'), () => Features.deform(), '', T('ctx.deformTip'), true); dfb.id = 'ctx-deform'; dfb.dataset.help = 'deform'; }
      if (App.doc.items.includes(it)) b('deleteBody', T('ctx.deleteBody'), () => Features.deleteBody([it.id]), '', T('ctx.deleteBodyTip'), true).dataset.help = 'deleteBody';
      if (Features.canMirrorStep(it, items[0].parent)) b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (Model.isAssembly(App.doc) && typeof Comp !== 'undefined' && Comp.canPatternPart && Comp.canPatternPart(it, App.doc)) {
        const apb = b('patternRect', T('asm.patToolBtn'), (e) => Assembly.patternMenu(e.currentTarget, [it.id]), '', T('asm.patToolTip'), true);
        apb.id = 'ctx-asm-pattern'; apb.dataset.help = 'asmPattern';
      } else {
        b('patternCirc', T('ctx.pattern'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.patRect'), icon: 'patternRect', run: () => Features.pattern('rect') }, { label: T('ctx.patCirc'), icon: 'patternCirc', run: () => Features.pattern('circ') }, { label: T('ctx.patPath'), icon: 'patternPath', run: () => Features.patternPath() }, { label: T('ctx.patPoints'), icon: 'point', help: 'patternPoints', run: () => Features.patternPoints() }, { label: T('ctx.patTable'), icon: 'list', help: 'patternTable', run: () => Features.patternTable() }, { label: T('ctx.patMirror'), icon: 'mirror', run: () => Features.pattern('mirror') }, ...(Features.canMirrorStep(it, items[0].parent) ? [{ label: T('ctx.mirrorStep'), icon: 'mirror', help: 'mirrorStep', run: () => Features.mirrorStep([it.id]) }] : [])]), '', hole ? T('ctx.patternHoleTip') : T('ctx.patternTip'), true);
      }
      if (!hole) b('split', T('ctx.split'), () => Features.split(), '', T('ctx.splitTip'), true);
      if (!hole && it.kind === 'extrude' && it.p && it.p.sketch) b('loft', T('ctx.toTip'), () => Actions.loft([it.id], { tip: 10 }), '', T('ctx.toTipTip'), true);
      if (!App.edges.length) b('similar', T('ctx.similar'), () => Select.similar(), '', T('ctx.similarPartsTip'), true);
      if (!App.edges.length && !face && !hole && App.results.get(it.id) && App.doc.items.includes(it)) b('fillet', T('ctx.selectEdges'), (e) => edgeRuleMenu(it.id, e.currentTarget), '', T('ctx.selectEdgesTip'), true);
      if (typeof Assembly !== 'undefined' && Assembly.canOpenInTab(it, App.doc)) {
        const ob = b('edit', T('asm.openInTab'), () => Assembly.openPartTab(it.id), 'accent', T('asm.openInTabTip'));
        ob.id = 'ctx-open-part-tab';
        ob.dataset.help = 'assemblyPartTab';
      }
      if (it.kind === 'group' && !it.partRef) b('ungroup', T('ctx.ungroup'), () => Actions.ungroup(), '', T('ctx.ungroupTip'), true);
    } else {
      const hasRef = items.some((x) => x.item.kind === 'ref');
      if (!hasRef) b('group', T('ctx.group'), () => Actions.group(), 'accent', T('ctx.groupTip'));
      if (!hasRef && items.every((x) => x.list === items[0].list && Features.canMirrorStep(x.item, x.parent))) b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep(items.map((x) => x.item.id)), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (!hasRef && items.every((x) => App.doc.items.includes(x.item))) b('deleteBody', T('ctx.deleteBody'), () => Features.deleteBody(items.map((x) => x.item.id)), '', T('ctx.deleteBodyTip'), true).dataset.help = 'deleteBody';
      if (items.length === 2) b('dim', T('ctx.gap'), (e) => gapPop(e.currentTarget), '', T('ctx.gapTip'), true);
      if (items.length === 2 && !Model.parentsOf(App.doc, items[0].item.id).some((q) => q.id === items[1].item.id) && !Model.parentsOf(App.doc, items[1].item.id).some((q) => q.id === items[0].item.id)) {
        if (items.every((x) => x.item.role !== 'hole' && App.doc.items.includes(x.item))) {
          const lg = b('lipGroove', T('ctx.lipGroove'), () => Features.lipGroove({ targets: items.map((x) => x.item.id) }), '', T('ctx.lipGrooveTip'));
          lg.id = 'ctx-two-lip-groove'; lg.dataset.help = 'lipGroove';
          const shb = b('holeWizard', T('ctx.stackHole'), () => Assembly.startStackHole({ targets: items.map((x) => x.item.id) }), 'pro', T('ctx.stackHoleTip'));
          shb.id = 'ctx-multi-stack-hole'; shb.dataset.help = 'stackHole';
          const acb = b('boolSubtract', T('ctx.asmCut'), () => Assembly.startAsmCut({ targets: items.map((x) => x.item.id) }), 'pro', T('ctx.asmCutTip'));
          acb.id = 'ctx-multi-asm-cut'; acb.dataset.help = 'asmCut';
        }
        const fj = b('lock', T('ctx.fixedJoint'), () => Joints.startFixed(), '', T('ctx.fixedJointTip'));
        fj.id = 'ctx-fixed-joint'; fj.dataset.help = 'fixedJoint';
        b('hinge', T('ctx.joint'), () => Joints.start(), '', T('ctx.jointTip'), true);
        b('axes', T('ctx.mate'), (e) => UI.menu(e.currentTarget, [
          { label: T('ctx.mateCyl'), icon: 'axes', help: 'mateCyl', run: () => Joints.startCylindrical() },
          { label: T('ctx.matePlanar'), icon: 'planeXY', help: 'matePlanar', run: () => Joints.startPlanar() },
          { label: T('ctx.mateAngle'), icon: 'rotate', help: 'mateAngle', run: () => Joints.startAngle() },
          { label: T('ctx.mateCenter'), icon: 'cSymmetric', help: 'mateCenter', run: () => Joints.startCenter() },
          { label: T('ctx.mateBall'), icon: 'circle', help: 'mateBall', run: () => Joints.startBall() },
          { label: T('ctx.mateSlot'), icon: 'slot', help: 'mateSlot', run: () => Joints.startSlot() },
          '-',
          { label: T('ctx.mateParallel'), icon: 'cParallel', help: 'mateParallel', run: () => Joints.startParallel() },
          { label: T('ctx.mateTangent'), icon: 'cTangent', help: 'mateTangent', run: () => Joints.startTangent() },
          { label: T('ctx.mateDistance'), icon: 'clearance', help: 'mateDistance', run: () => Joints.startDistance() },
          '-',
          { label: T('ctx.mateRot'), icon: 'hinge', run: () => Joints.start('rot') },
          { label: T('ctx.mateSlide'), icon: 'moveStep', run: () => Joints.start('slide') },
          '-',
          { label: T('ctx.coupleGear'), icon: 'gear', help: 'coupleGear', run: () => Joints.startGear() },
          { label: T('ctx.coupleRack'), icon: 'moveStep', help: 'coupleRack', run: () => Joints.startRack() },
          { label: T('ctx.coupleScrew'), icon: 'helix', help: 'coupleScrew', run: () => Joints.startScrew() },
          { label: T('ctx.coupleBelt'), icon: 'link', help: 'coupleBelt', run: () => Joints.startBelt() },
          { label: T('ctx.coupleLinear'), icon: 'moveStep', help: 'coupleLinear', run: () => Joints.startLinear() },
          { label: T('ctx.coupleCam'), icon: 'cam', help: 'coupleCam', run: () => Joints.startCam() },
        ]), '', T('ctx.mateTip'), true).dataset.help = 'mateCyl';
      }
      if (!hasRef && items.length >= 2 && items.every((x) => x.item.kind === 'extrude')) {
        b('loft', T('ctx.loft'), () => Actions.loft(), '', T('ctx.loftTip'));
        if (items.length >= 3) {
          const lc = b('loft', T('ctx.loftClosed'), () => Features.loftClosed(), 'pro', T('ctx.loftClosedTip'));
          lc.id = 'ctx-loft-closed'; lc.dataset.help = 'loftClosed';
        }
      }
      const loftExtrudes = items.filter((x) => x.item.kind === 'extrude' && x.item.p && x.item.p.sketch);
      const loftNonExtrudes = items.filter((x) => x.item.kind !== 'extrude' || !x.item.p || !x.item.p.sketch);
      const loftCutTargets = loftExtrudes.length >= 2 ? Features.loftTargets(App.doc, loftExtrudes.map((x) => x.item.id)) : [];
      if (!hasRef && items.every((x) => App.doc.items.includes(x.item)) && loftExtrudes.length >= 2 && ((loftNonExtrudes.length === 0 && loftCutTargets.length > 0) || (loftNonExtrudes.length === 1 && loftCutTargets.some((t) => t.id === loftNonExtrudes[0].item.id)))) {
        const lcut = b('loft', T('ctx.loftCut'), () => Features.loftCut(), 'pro', T('ctx.loftCutTip'));
        lcut.id = 'ctx-loft-cut'; lcut.dataset.help = 'loftCut';
      }
      if (!hasRef) b('boolSubtract', T('ctx.boolean'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.boolUnion'), icon: 'boolUnion', run: () => Features.boolean('union') }, { label: T('ctx.boolSub'), icon: 'boolSubtract', run: () => Features.boolean('subtract') }, { label: T('ctx.boolInt'), icon: 'boolIntersect', run: () => Features.boolean('intersect') }]), '', T('ctx.booleanTip'), true);
      b('layers', T('ctx.align'), (e) => UI.menu(e.currentTarget, [['left', T('ctx.alignLeft')], ['cx', T('ctx.alignCx')], ['right', T('ctx.alignRight')], ['front', T('ctx.alignFront')], ['cy', T('ctx.alignCy')], ['back', T('ctx.alignBack')], ['bottom', T('ctx.alignBottom')]].map(([m, l]) => ({ label: l, run: () => Actions.align(null, m) }))), '', T('ctx.alignTip'));
      b('copy', T('common.duplicate'), () => Actions.duplicate(), '', T('ctx.dupTip'), true);
    }
    b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
    $('#overlay').append(bar); ctx = bar;
    placeCtx();
    Features.syncPatternMarkers();
  }
  function placeCtx() {
    if (!ctx) return;
    const ids = App.sel;
    let box = new THREE.Box3();
    for (const id of ids) { const b = Actions.worldBox(id); if (b) box.union(b); }
    if (box.isEmpty() && ctx.classList.contains('inactive')) { const cr0 = $('#center').getBoundingClientRect(); ctx.hidden = false; ctx.style.left = cr0.width / 2 + 'px'; ctx.style.top = '70px'; return; }
    if (box.isEmpty()) { ctx.hidden = true; return; }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, any = false;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const s = Viewer.toScreen(p); if (s.behind) continue; any = true;
      minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); miny = Math.min(miny, s.y); maxy = Math.max(maxy, s.y);
    }
    const cr = $('#center').getBoundingClientRect();
    if (!any && ctx.classList.contains('inactive')) { ctx.hidden = false; ctx.style.left = cr.width / 2 + 'px'; ctx.style.top = '70px'; return; }
    if (!any) { ctx.hidden = true; return; }
    ctx.hidden = false;
    const bw = ctx.offsetWidth, bh = ctx.offsetHeight;
    let x = (minx + maxx) / 2, y = miny - bh - 44;
    if (y < 8) y = Math.min(cr.height - bh - 8, maxy + 44);
    x = clamp(x, bw / 2 + 8, cr.width - bw / 2 - 8);
    ctx.style.left = x + 'px'; ctx.style.top = clamp(y, 8, cr.height - bh - 8) + 'px';
  }

  // ---------- Ansichtswürfel ----------
  let cubeEl = null, cubeWrap = null, viewBtnsEl = null, gizmo = null;
  function refreshViewCube() {
    if (cubeWrap) cubeWrap.setAttribute('aria-label', T('vc.aria'));
    if (cubeEl) {
      for (const f of cubeEl.querySelectorAll('.face')) {
        const id = f.dataset.face;
        const lbl = T('vc.' + id);
        f.textContent = lbl;
        f.setAttribute('aria-label', T('vc.faceAria', { name: lbl }));
        f.setAttribute('title', lbl);
      }
    }
    if (viewBtnsEl) {
      for (const b of viewBtnsEl.querySelectorAll('button[data-vc-key]')) {
        const k = b.dataset.vcKey;
        const ak = b.dataset.vcAria || k;
        b.setAttribute('aria-label', T('vc.' + ak));
        b.setAttribute('data-tip', T('vc.' + k));
      }
    }
  }
  function initViewCube() {
    const wrap = h('div', { class: 'viewcube', 'aria-label': T('vc.aria') });
    const cube = h('div', { class: 'cube' });
    const F = [['top', T('vc.top'), [0, 0, 1], [0, 1, 0]], ['front', T('vc.front'), [0, -1, 0], [0, 0, 1]], ['right', T('vc.right'), [1, 0, 0], [0, 0, 1]], ['back', T('vc.back'), [0, 1, 0], [0, 0, 1]], ['left', T('vc.left'), [-1, 0, 0], [0, 0, 1]], ['bottom', T('vc.bottom'), [0, 0, -1], [0, 1, 0]]];
    for (const [id, label, n, up] of F) {
      const N = new THREE.Vector3(...n), U = new THREE.Vector3(...up), Rr = new THREE.Vector3().crossVectors(U, N);
      const t = N.clone().multiplyScalar(30);
      const m = [Rr.x, Rr.y, Rr.z, 0, -U.x, -U.y, -U.z, 0, N.x, N.y, N.z, 0, t.x, t.y, t.z, 1];
      const f = h('div', { class: 'face', role: 'button', tabindex: '0', 'data-face': id, 'aria-label': T('vc.faceAria', { name: label }), title: label }, label);
      f.style.transform = `matrix3d(${m.join(',')})`;
      f.style.left = '0'; f.style.top = '0';
      f.addEventListener('click', () => Viewer.setView(id));
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); Viewer.setView(id); } });
      cube.append(f);
    }
    wrap.append(cube);
    $('#overlay').append(wrap); cubeEl = cube; cubeWrap = wrap;
    const vb = h('div', { class: 'view-btns' });
    const b1 = h('button', { type: 'button', 'aria-label': T('vc.fit'), 'data-tip': T('vc.fit'), 'data-kbd': 'F', 'data-vc-key': 'fit' }); b1.innerHTML = icon('fit'); b1.onclick = () => Viewer.fit();
    const b2 = h('button', { type: 'button', 'aria-label': T('vc.iso'), 'data-tip': T('vc.iso'), 'data-vc-key': 'iso' }); b2.innerHTML = icon('home'); b2.onclick = () => Viewer.setView('iso');
    const tg = (k, ic, vck, kbd) => { const tip = T('vc.' + vck); const b = h('button', { type: 'button', 'aria-label': tip, 'data-tip': tip, 'data-kbd': kbd || null, 'data-vc-key': vck }); b.innerHTML = icon(ic); b.onclick = () => ViewPrefs.toggle(k); b.dataset.pref = k; return b; };
    const bO = tg('ortho', 'viewOrtho', 'ortho', 'O'); bO.classList.add('pro');
    const bG = tg('gridOn', 'grid', 'grid', 'G');
    const bP = tg('planes', 'originPlanes', 'planes'); bP.classList.add('pro');
    const syncBtns = (pv) => { for (const b of [bO, bG, bP]) b.classList.toggle('on', !!pv[b.dataset.pref]); bO.innerHTML = icon(pv.ortho ? 'viewOrtho' : 'viewPersp'); };
    ViewPrefs.on('change', syncBtns); syncBtns(ViewPrefs.get());
    // Notizen ein/aus – nur sichtbar, wenn das Projekt Notizen hat
    const bN = tg('notes', 'notesShow', 'notes', 'N');
    bN.removeAttribute('data-kbd');
    const syncNotes = () => { const on = ViewPrefs.get().notes !== false; bN.hidden = !(App.doc.notes || []).length; bN.innerHTML = icon(on ? 'notesShow' : 'notesHide'); bN.classList.toggle('on', on); };
    ViewPrefs.on('change', syncNotes); App.on('doc', syncNotes); syncNotes();
    const bX = h('button', { type: 'button', 'aria-label': T('vc.xrayAria'), 'data-tip': T('vc.xrayTip'), 'data-kbd': 'X', 'data-view': 'xray', 'data-help': 'xray', 'data-vc-key': 'xrayTip', 'data-vc-aria': 'xrayAria' }); bX.innerHTML = icon('xray'); bX.onclick = () => Views.xray();
    const bC = h('button', { type: 'button', 'aria-label': T('vc.sectionAria'), 'data-tip': T('vc.sectionTip'), 'data-kbd': 'C', 'data-view': 'cut', 'data-help': 'section', 'data-vc-key': 'sectionTip', 'data-vc-aria': 'sectionAria' }); bC.innerHTML = icon('section'); bC.onclick = () => Views.section();
    const bF = h('button', { type: 'button', 'aria-label': T('vc.filterAria'), 'data-tip': T('vc.filterTip'), 'data-view': 'filter', 'data-help': 'selectFilter', 'data-vc-key': 'filterTip', 'data-vc-aria': 'filterAria' }); bF.innerHTML = icon('pointer'); bF.onclick = (e) => Select.menu(e.currentTarget);
    const bPaint = h('button', { type: 'button', 'aria-label': T('vc.paintAria'), 'data-tip': T('vc.paintTip'), 'data-kbd': 'V', 'data-view': 'paint', 'data-help': 'paintSelect', 'data-vc-key': 'paintTip', 'data-vc-aria': 'paintAria' }); bPaint.innerHTML = icon('noteDraw'); bPaint.onclick = () => Select.togglePaint();
    for (const x of [bX, bC, bF]) x.classList.add('pro');
    vb.append(bO, bG, bP, bN, bX, bC, bF, bPaint, h('div', { class: 'sep' }), b1, b2); $('#overlay').append(vb); viewBtnsEl = vb;
    gizmo = svgEl('<svg class="axis-gizmo" viewBox="0 0 64 64" aria-hidden="true"></svg>');
    $('#overlay').append(gizmo);
    Viewer.on('camera', syncCube); syncCube();
  }
  function syncCube() {
    if (!cubeEl) return;
    const cam = Viewer.camera; cam.updateMatrixWorld();
    const R = new THREE.Matrix4().extractRotation(cam.matrixWorldInverse);
    const e = R.elements; // Spaltenweise
    const S = [1, -1, 1];
    const m = [e[0] * S[0], e[1] * S[1], e[2] * S[2], 0, e[4] * S[0], e[5] * S[1], e[6] * S[2], 0, e[8] * S[0], e[9] * S[1], e[10] * S[2], 0, 0, 0, 0, 1];
    cubeEl.style.transform = `matrix3d(${m.map((v) => +v.toFixed(5)).join(',')})`;
    // Achsenkreuz
    const ax = [[1, 0, 0, '#d24a3c', 'X'], [0, 1, 0, '#3a9a3f', 'Y'], [0, 0, 1, '#3067d0', 'Z']];
    let html = '';
    const pts = ax.map(([x, y, z, c, l]) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(R); return { x: 32 + v.x * 20, y: 32 - v.y * 20, z: v.z, c, l }; }).sort((a, b) => a.z - b.z);
    for (const p of pts) html += `<line x1="32" y1="32" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${p.c}" stroke-width="2.2" stroke-linecap="round"/><text x="${(32 + (p.x - 32) * 1.32).toFixed(1)}" y="${(32 + (p.y - 32) * 1.32 + 4).toFixed(1)}" fill="${p.c}" font-size="10" font-weight="700" text-anchor="middle" font-family="Barlow Semi Condensed, sans-serif">${p.l}</text>`;
    gizmo.innerHTML = html;
    placeCtx();
  }

  function syncLeftSelection() {
    if (leftTab !== 'tree') return false;
    const body = $('#left-body');
    if (!body) return false;
    const topSel = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    const needSelBar = topSel.length >= 2 && !App.ctx;
    if (needSelBar || body.querySelector('#tree-sel-bar')) return false;
    if (body.querySelector('.node.sel:not([data-id])')) return false;
    const nodes = body.querySelectorAll('.node[data-id]');
    if (!nodes.length && App.doc && App.doc.items && App.doc.items.length) return false;
    const selSet = new Set(App.sel);
    for (const el of nodes) {
      const on = selSet.has(el.dataset.id);
      el.classList.toggle('sel', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    return true;
  }
  function init() {
    loadWorkspaces();
    initResizers();
    applyLayout();
    const setTab = (tab) => {
      leftTab = tab;
      wsState.current.leftTab = tab;
      saveWorkspaces();
      renderLeft();
    };
    $('#lt-tree').onclick = () => setTab('tree');
    $('#lt-params').onclick = () => setTab('params');
    $('#lt-log').onclick = () => setTab('log');
    App.on('ctx', () => renderLeft());
    Log.on('change', debounce(() => { if (leftTab === 'log') renderLeft(); }, 80));
    if (typeof Kernel !== 'undefined' && Kernel.on) Kernel.on('state', debounce(() => { if (leftTab === 'log') renderLeft(); }, 80));
    Toolbar.init();
    renderTools(); initViewCube();
    const rightBody = $('#right-body');
    if (rightBody) {
      rightBody.addEventListener('focusout', () => {
        if (!rightDeferred) return;
        setTimeout(() => { if (rightDeferred && !hasFocusedRightInput()) renderRight(); }, 0);
      });
    }
    let pendingRightForce = false;
    const rerenderLeftHint = debounce(() => { renderLeft(); UI.renderHint(); }, 16);
    const rerender = debounce(() => {
      const force = pendingRightForce;
      pendingRightForce = false;
      rerenderLeftHint.cancel();
      renderLeft();
      renderRight(force ? undefined : { preserveFocus: true });
      renderCtx();
      UI.renderHint();
    }, 16);
    const scheduleRerender = (forceRight = true) => { if (forceRight) pendingRightForce = true; rerender(); };
    let lastDocType = Model.docType(App.doc);
    const checkDocType = () => {
      const next = Model.docType(App.doc);
      if (next !== lastDocType) { lastDocType = next; renderTools(); }
    };
    App.on('doc', () => { checkDocType(); scheduleRerender(false); });
    App.on('docLoaded', () => { checkDocType(); });
    App.on('selection', () => { rerender.cancel(); pendingRightForce = false; renderRight(); renderCtx(); if (syncLeftSelection()) UI.renderHint(); else rerenderLeftHint(); });
    App.on('results', () => scheduleRerender(false));
    DroneCheck.on('checked', () => { if (!App.sel.length) scheduleRerender(false); });
    Weak.on('analyzed', () => { if (!App.sel.length) scheduleRerender(false); });
    App.on('mode', () => { renderTools(); applyLayout(); scheduleRerender(true); });
    window.addEventListener('resize', applyLayout);
    Viewer.on('camera', placeCtx);
    App.on('ghosts', placeCtx);
    ViewPrefs.on('change', debounce(() => { if (leftTab === 'tree') renderLeft(); }, 30));   // Erste Schritte ein-/ausblenden
  }
  return {
    paramsCSV, importParamsCSV, faceEdgeList, init, renderLeft, renderRight, renderTools, renderCtx, refreshViewCube, closeFlyout, toggleFlyout, firstStepDone, firstStepsState,
    expand: (id) => { expanded.add(id); renderLeft(); },
    showParams: () => {
      leftTab = 'params';
      wsState.current.leftTab = 'params';
      saveWorkspaces();
      renderLeft();
      if (((document.documentElement && document.documentElement.clientWidth) || innerWidth) <= 900 || (UI.isTablet && UI.isTablet())) {
        const ws = $('#workspace');
        if (ws) { ws.classList.add('show-left'); ws.classList.remove('show-right'); }
        const bl = $('#btn-left'), br = $('#btn-right');
        if (bl) bl.setAttribute('aria-expanded', 'true');
        if (br) br.setAttribute('aria-expanded', 'false');
      } else if (!wsState.current.left.open) {
        setPanel('left', { open: true });
      }
    },
    getLayout, setPanel, swapSides, saveWorkspace, loadWorkspace, deleteWorkspace, listWorkspaces, resetLayout, promptSaveWorkspace, workspaceMenu, workspaceDialog,
    get activeWorkspace() { return wsState.active; },
  };
})();

