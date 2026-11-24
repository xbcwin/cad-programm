// ================= Ansicht: Raster, Ursprungsebenen, Achsen, Projektion =================
// Persönliche Einstellung (nicht im Projekt gespeichert), gilt für alle Projekte in diesem Browser.
const ViewPrefs = (() => {
  const KEY = 'masswerk.view';
  const DEF = { grid: 'auto', gridOn: true, planes: true, axes: true, ortho: false, quality: 'normal', adaptive: true, multiWorker: true, theme: 'system', decimals: 2, angleDecimals: 1, notes: true, cog: false, level: 'pro', look: 'studio', mood: 'studio', shadows: true, display: 'edges', lang: 'auto', mouse: 'tracery', uiScale: 100 };
  const VALID_MOUSE = new Set(['tracery', 'onshape', 'solidworks', 'fusion', 'blender']);
  const VALID_THEME = new Set(['system', 'light', 'dark']);
  const VALID_QUALITY = new Set(['coarse', 'normal', 'fine', 'ultra']);
  const VALID_LEVEL = new Set(['simple', 'pro']);
  const VALID_LOOK = new Set(['studio', 'clay', 'chrome', 'simple']);
  const VALID_MOOD = new Set(['studio', 'bright', 'workshop']);
  const VALID_DISPLAY = new Set(['edges', 'shaded', 'wire', 'hidden']);
  const normDec = (x, fb) => { const n = Number(x); return Number.isFinite(n) ? clamp(Math.round(n), 0, 4) : fb; };
  const normLang = (x) => (x === 'de' || x === 'en' ? x : 'auto');
  const normUiScale = (x) => { const n = Number(x); return Number.isFinite(n) ? clamp(Math.round(n), 80, 150) : 100; };
  const normMouse = (x) => (VALID_MOUSE.has(x) ? x : 'tracery');
  let v = { ...DEF };
  let firstStart = !storageGet(KEY) && !storageGet('masswerk.last') && !storageGet('masswerk.index');
  let openDialogState = null;
  try {
    const raw = storageGet(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.decimals === 0 && !('angleDecimals' in parsed)) parsed.decimals = 2;
      v = { ...DEF, ...parsed };
    }
  } catch (_) {}
  v.decimals = normDec(v.decimals, DEF.decimals);
  v.angleDecimals = normDec(v.angleDecimals, DEF.angleDecimals);
  v.lang = normLang(v.lang);
  v.uiScale = normUiScale(v.uiScale);
  v.mouse = normMouse(v.mouse);
  const ev = makeEmitter();
  function applyTheme() {
    const r = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') r.setAttribute('data-theme', v.theme); else r.removeAttribute('data-theme');
  }
  function applyUiScale() {
    const pct = normUiScale(v.uiScale);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--ui-scale', String(pct / 100));
      document.documentElement.dataset.uiScale = String(pct);
    }
  }
  applyUiScale();
  const simple = () => v.level === 'simple';
  function apply() {
    if (typeof I18n !== 'undefined' && I18n.use) {
      const targetLang = I18n.resolve ? I18n.resolve(v.lang) : (v.lang === 'auto' ? I18n.detect() : v.lang);
      if (I18n.lang !== targetLang) I18n.use(targetLang);
      else if (document.documentElement) document.documentElement.lang = I18n.lang;
    }
    document.body.classList.toggle('simple', simple());
    Viewer.setViewOptions({ grid: v.grid, gridOn: v.gridOn, planes: v.planes, axes: v.axes });
    Viewer.setOrtho(v.ortho);
    Viewer.setAdaptive(v.adaptive !== false);
    Viewer.setLook({ look: v.look, mood: v.mood, shadows: v.shadows !== false, display: v.display || 'edges' });
    if (typeof Kernel !== 'undefined' && Kernel.setMultiWorker) Kernel.setMultiWorker(v.multiWorker !== false);
    applyTheme();
    applyUiScale();
    FMT.dec = normDec(v.decimals, DEF.decimals);
    FMT.angle = normDec(v.angleDecimals, DEF.angleDecimals);
    Viewer.setMouseStyle(v.mouse || 'tracery');
    ev.emit('change', v);
  }
  function set(patch, msg) {
    const oldQ = v.quality, oldDec = v.decimals, oldAng = v.angleDecimals, oldL = v.level, oldMW = v.multiWorker;
    const next = { ...patch };
    if ('decimals' in next) next.decimals = normDec(next.decimals, DEF.decimals);
    if ('angleDecimals' in next) next.angleDecimals = normDec(next.angleDecimals, DEF.angleDecimals);
    if ('lang' in next) next.lang = normLang(next.lang);
    if ('uiScale' in next) next.uiScale = normUiScale(next.uiScale);
    if ('mouse' in next) next.mouse = normMouse(next.mouse);
    if ('level' in next) firstStart = false;
    Object.assign(v, next); storageSet(KEY, JSON.stringify(v)); apply();
    syncLevel();
    if (v.level !== oldL) {
      // Oberfläche gewechselt: Werkzeuge, Leisten und Kontextleiste neu aufbauen
      if (simple() && App.mode !== 'model') Commands.setMode('model');
      Panels.closeFlyout(); Panels.renderTools(); Panels.renderLeft(); Panels.renderRight(); Panels.renderCtx();
      if (typeof Commands !== 'undefined' && Commands.syncCmdKbds) Commands.syncCmdKbds();
    }
    if (v.quality !== oldQ) App.requalify();
    if (v.multiWorker !== oldMW && v.multiWorker === false && typeof Kernel !== 'undefined' && Kernel.ready && typeof App !== 'undefined' && App.doc && App.doc.items && App.doc.items.length) {
      App.rebuild();
    }
    if (v.decimals !== oldDec || v.angleDecimals !== oldAng) {
      App.emit('doc');
      Panels.renderLeft(); Panels.renderRight(); Panels.renderCtx();
      if (typeof Print !== 'undefined' && Print.updateAmpel) Print.updateAmpel();
      if (typeof Sketch !== 'undefined' && Sketch.active && Sketch.render) Sketch.render();
      if (typeof Measure !== 'undefined' && Measure.refreshDisplay) Measure.refreshDisplay();
    }
    if (msg) UI.toast(msg, { icon: 'check', ms: 1600 });
  }
  function toggle(k) {
    const labels = {
      ortho: ['dlg.settings.tOrthoOn', 'dlg.settings.tOrthoOff'],
      gridOn: ['dlg.settings.tGridOn', 'dlg.settings.tGridOff'],
      planes: ['dlg.settings.tPlanesOn', 'dlg.settings.tPlanesOff'],
      axes: ['dlg.settings.tAxesOn', 'dlg.settings.tAxesOff'],
      notes: ['dlg.settings.tNotesOn', 'dlg.settings.tNotesOff'],
    }[k];
    set({ [k]: !v[k] }, labels ? T(labels[v[k] ? 1 : 0]) : null);
  }
  // Schild oben rechts: Einfach ↔ Profi
  function syncLevel() {
    const b = document.getElementById('btn-level');
    if (b) {
      b.textContent = simple() ? T('level.simple') : T('level.pro');
      b.setAttribute('aria-pressed', simple() ? 'true' : 'false');
      b.dataset.level = v.level;
      b.dataset.tip = simple() ? T('level.tipSimple') : T('level.tipPro');
    }
  }
  function setLevel(l) { set({ level: l }, T(l === 'simple' ? 'dlg.settings.levelSimpleToast' : 'dlg.settings.levelProToast')); }
  function setLang(l) {
    const nextLang = normLang(l);
    set({ lang: nextLang });
    const eff = typeof I18n !== 'undefined' ? I18n.lang : 'de';
    const effName = T(eff === 'en' ? 'dlg.settings.langEn' : 'dlg.settings.langDe');
    const toastMsg = nextLang === 'auto'
      ? T('dlg.settings.langToastAuto', { lang: effName })
      : T(eff === 'en' ? 'dlg.settings.langToastEn' : 'dlg.settings.langToastDe');
    UI.toast(toastMsg, { icon: 'check', ms: 1600 });
  }
  function setUiScale(pct) { set({ uiScale: normUiScale(pct) }); }
  function refreshOpenDialog() {
    if (!openDialogState) return;
    const tab = openDialogState.tab;
    openDialogState.handle.close();
    dialog(tab);
  }
  function exportData() {
    const tb = typeof Toolbar !== 'undefined' && Toolbar.getState ? Toolbar.getState() : null;
    return {
      format: 'tracery-settings',
      version: 1,
      exportedAt: new Date().toISOString(),
      view: { ...v },
      shortcuts: typeof Commands !== 'undefined' && Commands.exportShortcuts ? Commands.exportShortcuts() : {},
      toolbar: tb ? { items: tb.items, favs: tb.favs } : { items: [], favs: [] },
      sketch: { angleSnap: typeof Sketch !== 'undefined' ? !!Sketch.angleSnap : true },
    };
  }
  function sanitizeView(src) {
    const out = { ...DEF };
    if (!src || typeof src !== 'object') return out;
    if (src.grid === 'auto' || (typeof src.grid === 'number' && isFinite(src.grid) && src.grid > 0)) out.grid = src.grid;
    for (const k of ['gridOn', 'planes', 'axes', 'ortho', 'adaptive', 'multiWorker', 'notes', 'cog', 'shadows']) {
      if (typeof src[k] === 'boolean') out[k] = src[k];
    }
    if (VALID_QUALITY.has(src.quality)) out.quality = src.quality;
    if (VALID_THEME.has(src.theme)) out.theme = src.theme;
    if (VALID_LEVEL.has(src.level)) out.level = src.level;
    if (VALID_LOOK.has(src.look)) out.look = src.look;
    if (VALID_MOOD.has(src.mood)) out.mood = src.mood;
    if (VALID_DISPLAY.has(src.display)) out.display = src.display;
    out.decimals = normDec(src.decimals, DEF.decimals);
    out.angleDecimals = normDec(src.angleDecimals, DEF.angleDecimals);
    out.lang = normLang(src.lang);
    out.mouse = normMouse(src.mouse);
    out.uiScale = normUiScale(src.uiScale);
    return out;
  }
  function importData(raw, opts = {}) {
    let obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch (_) { obj = null; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== 'tracery-settings') {
      if (!opts.silent) UI.toast(T('dlg.settings.loadBadFile'), { kind: 'bad', icon: 'warn' });
      return { ok: false, error: 'invalid_format' };
    }
    set(sanitizeView(obj.view));
    if (typeof Commands !== 'undefined' && Commands.importShortcuts) {
      Commands.importShortcuts(obj.shortcuts && typeof obj.shortcuts === 'object' ? obj.shortcuts : {});
    }
    if (typeof Toolbar !== 'undefined') {
      if (obj.toolbar && typeof obj.toolbar === 'object' && Toolbar.setState) Toolbar.setState(obj.toolbar);
      else if (Toolbar.reset) Toolbar.reset(true);
    }
    if (obj.sketch && typeof obj.sketch.angleSnap === 'boolean' && typeof Sketch !== 'undefined' && Sketch.setAngleSnap) {
      Sketch.setAngleSnap(obj.sketch.angleSnap);
    }
    if (!opts.silent) UI.toast(T('dlg.settings.loadedToast'), { icon: 'check' });
    refreshOpenDialog();
    return { ok: true };
  }
  async function saveToFile() {
    const data = JSON.stringify(exportData(), null, 2);
    const filename = T('dlg.settings.fileName');
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    if (typeof Print !== 'undefined' && Print.save) {
      return await Print.save(filename, blob);
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    UI.toast(T('dlg.settings.savedToast', { name: filename }), { icon: 'check' });
    return true;
  }
  async function loadFromFile(file) {
    if (!file) return { ok: false, error: 'no_file' };
    try {
      const txt = await file.text();
      return importData(txt);
    } catch (_) {
      UI.toast(T('dlg.settings.loadBadFile'), { kind: 'bad', icon: 'warn' });
      return { ok: false, error: 'read_error' };
    }
  }
  function openFilePicker() {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (f) loadFromFile(f);
    };
    document.body.append(inp);
    inp.click();
    setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
  }
  function resetAll(opts = {}) {
    const backup = exportData();
    firstStart = false;
    set({ ...DEF });
    if (typeof Commands !== 'undefined' && Commands.resetShortcuts) Commands.resetShortcuts();
    if (typeof Toolbar !== 'undefined' && Toolbar.reset) Toolbar.reset(true);
    if (typeof Sketch !== 'undefined' && Sketch.setAngleSnap) Sketch.setAngleSnap(true);
    if (!opts.silent) {
      UI.toast(T('dlg.settings.resetToast'), {
        icon: 'undo',
        action: { label: T('topbar.undo'), run: () => importData(backup) },
      });
    }
    refreshOpenDialog();
  }
  // Zwei Stufen-Karten („Einfach“ / „Profi“) für ersten Start und Einstellungen
  function levelCards({ idPrefix, active = v.level, onPick } = {}) {
    const wrap = h('div', { class: 'level-cards', role: 'group', 'aria-label': T('level.chooseAria') });
    const defs = [
      ['simple', 'cube', T('level.simple'), T('level.simpleDesc')],
      ['pro', 'sliders', T('level.pro'), T('level.proDesc')],
    ];
    const btns = [];
    for (const [lvl, ic, title, desc] of defs) {
      const on = active === lvl;
      const b = h('button', {
        type: 'button',
        id: idPrefix ? `${idPrefix}-${lvl}` : null,
        class: 'level-card' + (on ? ' on' : ''),
        dataset: { level: lvl },
        'aria-pressed': on ? 'true' : 'false',
      });
      b.append(
        h('div', { class: 'level-card-head' }, svgEl(`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[ic]}</svg>`), h('b', null, title)),
        h('span', { class: 'level-card-desc' }, desc),
      );
      b.onclick = () => {
        setLevel(lvl);
        for (const x of btns) {
          const act = x.dataset.level === lvl;
          x.classList.toggle('on', act);
          x.setAttribute('aria-pressed', act ? 'true' : 'false');
        }
        onPick && onPick(lvl);
      };
      btns.push(b);
      wrap.append(b);
    }
    return wrap;
  }
  // Einstellungen-Fenster (Menü ⋯ → Einstellungen)
  function dialog(initialTab = 'general', opts = {}) {
    const body = h('div', { style: { display: 'grid', gap: '14px', minWidth: 'min(480px, 84vw)' } });
    const sel = (id, label, val, opts, fn, hint) => { const f = UI.selectField({ id, label, value: String(val), options: opts, onChange: fn }); if (hint) f.append(h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, hint)); return f; };
    const chk = (k, label, hint) => { const l = h('label', { class: 'check', style: { alignItems: 'flex-start' } }, h('input', { type: 'checkbox', id: 'set-' + k, checked: !!v[k] }), h('span', null, label, hint ? h('small', { style: { display: 'block', color: 'var(--muted)' } }, hint) : null)); l.querySelector('input').onchange = (e) => set({ [k]: e.target.checked }); return l; };

    let curTab = !simple() && initialTab === 'keys' ? 'keys' : 'general';
    let kbdEd = null;
    let modalHandle = null;
    const tabs = h('div', { class: 'seg set-tabs', role: 'tablist', 'aria-label': T('dlg.settings.tabsAria') });
    const tabGen = h('button', { type: 'button', role: 'tab', id: 'set-tab-general', 'aria-selected': 'true', 'aria-pressed': 'true' }, T('dlg.settings.tabGeneral'));
    const tabKeys = h('button', { type: 'button', role: 'tab', id: 'set-tab-keys', 'data-help': 'customShortcuts', 'aria-selected': 'false', 'aria-pressed': 'false' }, T('dlg.settings.tabKeys'));
    tabs.append(tabGen, tabKeys);

    const paneGen = h('div', { id: 'set-pane-general', style: { display: 'grid', gap: '14px' } });
    const paneKeys = h('div', { id: 'set-pane-keys', style: { display: 'grid', gap: '10px' }, hidden: true });

    const lvlField = h('div', { class: 'field' },
      h('label', null, T('dlg.settings.levelLabel')),
      levelCards({ idPrefix: 'set-level', active: v.level, onPick: () => syncTabs(curTab) }),
      h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, T('dlg.settings.levelHint')),
    );
    const detName = (typeof I18n !== 'undefined' && I18n.detect && I18n.detect() === 'en') ? T('dlg.settings.langEn') : T('dlg.settings.langDe');
    const langSel = sel('set-lang', T('dlg.settings.langLabel'), v.lang || 'auto', [
      ['auto', T('dlg.settings.langAuto', { lang: detName })],
      ['de', T('dlg.settings.langDe')],
      ['en', T('dlg.settings.langEn')],
    ], (x) => {
      const prev = v.lang;
      setLang(x);
      if (normLang(x) !== prev && modalHandle) {
        modalHandle.close();
        dialog(curTab, { focus: 'set-lang' });
      }
    }, T('dlg.settings.langHint'));
    langSel.dataset.help = 'language';
    const decWord = (d) => T(d === 1 ? 'dlg.settings.decOne' : 'dlg.settings.decMany', { d, ex: `${fmtFixed(12.3456, d)} ${Units.label()}` });
    const angWord = (d) => T(d === 1 ? 'dlg.settings.decOne' : 'dlg.settings.decMany', { d, ex: `${fmtFixed(45.1234, d)}°` });
    const decOpts = () => [0, 1, 2, 3, 4].map((d) => [String(d), decWord(d)]);
    const angOpts = [0, 1, 2, 3, 4].map((d) => [String(d), angWord(d)]);
    const decFields = h('div', { class: 'fields', 'data-help': 'precision' },
      sel('set-dec', T('dlg.settings.decLen'), v.decimals, decOpts(), (x) => set({ decimals: +x })),
      sel('set-angle-dec', T('dlg.settings.decAng'), v.angleDecimals, angOpts, (x) => set({ angleDecimals: +x })),
    );
    const decBlock = h('div', { 'data-help': 'precision' },
      decFields,
      h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, T('dlg.settings.decHint')),
    );
    const unitSel = sel('set-proj-unit', T('dlg.settings.unitLabel'), Units.key(), Units.OPTIONS, (x) => {
      Units.set(x);
      const sd = decFields.querySelector('#set-dec');
      if (sd) {
        const cur = sd.value;
        sd.innerHTML = '';
        for (const [ov, ol] of decOpts()) {
          const op = h('option', { value: ov }, ol);
          if (String(ov) === String(cur)) op.selected = true;
          sd.append(op);
        }
      }
    }, T('dlg.settings.unitHint'));
    const scaleVal = h('span', { id: 'set-uiscale-val', class: 'uiscale-val mono' }, `${v.uiScale} %`);
    const scaleInp = h('input', {
      type: 'range',
      id: 'set-uiscale',
      min: '80',
      max: '150',
      step: '5',
      value: String(v.uiScale),
      'aria-label': T('dlg.settings.uiScaleLabel'),
    });
    const presetBtns = [];
    const syncScaleUI = (pct) => {
      scaleInp.value = String(pct);
      scaleVal.textContent = `${pct} %`;
      for (const b of presetBtns) {
        const on = Number(b.dataset.scale) === pct;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    };
    scaleInp.oninput = (e) => {
      const pct = normUiScale(e.target.value);
      set({ uiScale: pct });
      syncScaleUI(pct);
    };
    const presets = h('div', { class: 'uiscale-presets' });
    for (const pct of [80, 100, 125, 150]) {
      const b = h('button', {
        type: 'button',
        class: 'btn small' + (v.uiScale === pct ? ' on' : ''),
        id: `set-uiscale-${pct}`,
        dataset: { scale: String(pct) },
        'aria-pressed': v.uiScale === pct ? 'true' : 'false',
      }, `${pct} %`);
      b.onclick = () => {
        set({ uiScale: pct });
        syncScaleUI(pct);
      };
      presetBtns.push(b);
      presets.append(b);
    }
    const scaleField = h('div', { class: 'field', 'data-help': 'uiScale' },
      h('label', { for: 'set-uiscale' }, T('dlg.settings.uiScaleLabel')),
      h('div', { class: 'uiscale-row' }, scaleInp, scaleVal),
      presets,
      h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, T('dlg.settings.uiScaleHint')),
    );
    paneGen.append(
      lvlField,
      langSel,
      unitSel,
      sel('set-theme', T('dlg.settings.themeLabel'), v.theme, [['system', T('dlg.settings.themeSys')], ['light', T('dlg.settings.themeLight')], ['dark', T('dlg.settings.themeDark')]], (x) => set({ theme: x })),
      scaleField,
      decBlock,
      sel('set-quality', T('dlg.settings.qualityLabel'), v.quality, [['coarse', T('dlg.settings.qCoarse')], ['normal', T('dlg.settings.qNormal')], ['fine', T('dlg.settings.qFine')], ['ultra', T('dlg.settings.qUltra')]], (x) => set({ quality: x }), T('dlg.settings.qualityHint')),
      sel('set-mouse', T('dlg.settings.mouseLabel'), v.mouse || 'tracery', [['tracery', T('dlg.settings.mTracery')], ['onshape', T('dlg.settings.mOnshape')], ['solidworks', T('dlg.settings.mSolidworks')], ['fusion', T('dlg.settings.mFusion')], ['blender', T('dlg.settings.mBlender')]], (x) => set({ mouse: x }), T('dlg.settings.mouseHint')),
      chk('adaptive', T('dlg.settings.adaptive'), T('dlg.settings.adaptiveHint')),
    );
    const maxW = typeof Kernel !== 'undefined' && Kernel.maxWorkers ? Kernel.maxWorkers : 1;
    const cores = typeof Kernel !== 'undefined' && Kernel.poolStats && Kernel.poolStats.cores ? Kernel.poolStats.cores : maxW;
    const mwChk = chk('multiWorker', T('dlg.settings.multiWorker'), maxW > 1 ? T('dlg.settings.multiWorkerHint', { n: maxW, cores }) : T('dlg.settings.multiWorkerSingleHint'));
    mwChk.classList.add('pro');
    mwChk.dataset.help = 'multiWorker';
    paneGen.append(mwChk);

    const importInp = h('input', { type: 'file', id: 'set-import-input', accept: '.json,application/json', hidden: true });
    importInp.onchange = () => {
      const f = importInp.files && importInp.files[0];
      importInp.value = '';
      if (f) loadFromFile(f);
    };
    const saveBtn = h('button', { type: 'button', class: 'btn small', id: 'set-save-btn' });
    saveBtn.innerHTML = icon('save');
    saveBtn.append(document.createTextNode(T('dlg.settings.ioSave')));
    saveBtn.onclick = () => saveToFile();

    const loadBtn = h('button', { type: 'button', class: 'btn small', id: 'set-load-btn' });
    loadBtn.innerHTML = icon('folder');
    loadBtn.append(document.createTextNode(T('dlg.settings.ioLoad')));
    loadBtn.onclick = () => importInp.click();

    const resetBtn = h('button', { type: 'button', class: 'btn small', id: 'set-reset-all' });
    resetBtn.innerHTML = icon('undo');
    resetBtn.append(document.createTextNode(T('dlg.settings.ioReset')));
    resetBtn.onclick = () => resetAll();

    const ioBox = h('div', { class: 'set-io-box', 'data-help': 'settingsFile' },
      h('div', { class: 'section-h' }, T('dlg.settings.ioTitle')),
      h('small', { style: { color: 'var(--muted)' } }, T('dlg.settings.ioHint')),
      h('div', { class: 'btn-row' }, saveBtn, loadBtn, resetBtn),
      importInp,
    );
    paneGen.append(ioBox);

    const syncTabs = (tab) => {
      tabs.hidden = simple();
      curTab = simple() ? 'general' : tab;
      if (curTab === 'keys' && !kbdEd) kbdEd = Commands.renderShortcutsEditor(paneKeys);
      if (curTab !== 'keys' && kbdEd) { kbdEd.destroy(); kbdEd = null; paneKeys.innerHTML = ''; }
      paneGen.hidden = curTab !== 'general';
      paneKeys.hidden = curTab !== 'keys';
      tabGen.setAttribute('aria-selected', curTab === 'general' ? 'true' : 'false');
      tabGen.setAttribute('aria-pressed', curTab === 'general' ? 'true' : 'false');
      tabKeys.setAttribute('aria-selected', curTab === 'keys' ? 'true' : 'false');
      tabKeys.setAttribute('aria-pressed', curTab === 'keys' ? 'true' : 'false');
    };
    tabGen.onclick = () => syncTabs('general');
    tabKeys.onclick = () => syncTabs('keys');

    body.append(tabs, paneGen, paneKeys);
    syncTabs(curTab);
    modalHandle = UI.modal({
      title: T('dlg.settings.title'),
      body,
      actions: [{ label: T('common.done'), primary: true }],
      onClose: () => {
        if (kbdEd) kbdEd.destroy();
        if (openDialogState && openDialogState.handle === modalHandle) openDialogState = null;
      },
    });
    openDialogState = { handle: modalHandle, get tab() { return curTab; } };
    if (opts && opts.focus) setTimeout(() => { const el = document.getElementById(opts.focus); if (el) el.focus(); }, 45);
  }
  return { get: () => ({ ...v }), get level() { return v.level; }, set level(l) { setLevel(l); }, get lang() { return v.lang; }, setLang, get uiScale() { return v.uiScale; }, setUiScale, exportData, importData, saveToFile, loadFromFile, openFilePicker, resetAll, get firstStart() { return firstStart && !(typeof Store !== 'undefined' && Store.hasProjects); }, set, toggle, apply, dialog, setLevel, syncLevel, levelCards, get simple() { return simple(); }, on: ev.on };
})();

