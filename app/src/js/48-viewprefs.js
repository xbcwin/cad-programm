// ================= Ansicht: Raster, Ursprungsebenen, Achsen, Projektion =================
// Persönliche Einstellung (nicht im Projekt gespeichert), gilt für alle Projekte in diesem Browser.
const ViewPrefs = (() => {
  const KEY = 'masswerk.view';
  const DEF = { grid: 'auto', gridOn: true, planes: true, axes: true, ortho: false, quality: 'normal', adaptive: true, theme: 'system', decimals: 2, angleDecimals: 1, notes: true, cog: false, level: 'pro', look: 'studio', mood: 'studio', shadows: true, display: 'edges' };
  const normDec = (x, fb) => { const n = Number(x); return Number.isFinite(n) ? clamp(Math.round(n), 0, 4) : fb; };
  let v = { ...DEF };
  let firstStart = !storageGet(KEY) && !storageGet('masswerk.last') && !storageGet('masswerk.index');
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
  const ev = makeEmitter();
  function applyTheme() {
    const r = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') r.setAttribute('data-theme', v.theme); else r.removeAttribute('data-theme');
  }
  const simple = () => v.level === 'simple';
  function apply() {
    document.body.classList.toggle('simple', simple());
    Viewer.setViewOptions({ grid: v.grid, gridOn: v.gridOn, planes: v.planes, axes: v.axes });
    Viewer.setOrtho(v.ortho);
    Viewer.setAdaptive(v.adaptive !== false);
    Viewer.setLook({ look: v.look, mood: v.mood, shadows: v.shadows !== false, display: v.display || 'edges' });
    applyTheme();
    FMT.dec = normDec(v.decimals, DEF.decimals);
    FMT.angle = normDec(v.angleDecimals, DEF.angleDecimals);
    Viewer.setMouseStyle(v.mouse || 'tracery');
    ev.emit('change', v);
  }
  function set(patch, msg) {
    const oldQ = v.quality, oldDec = v.decimals, oldAng = v.angleDecimals, oldL = v.level;
    const next = { ...patch };
    if ('decimals' in next) next.decimals = normDec(next.decimals, DEF.decimals);
    if ('angleDecimals' in next) next.angleDecimals = normDec(next.angleDecimals, DEF.angleDecimals);
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
    const labels = { ortho: ['Orthografische Ansicht', 'Perspektivische Ansicht'], gridOn: ['Raster an', 'Raster aus'], planes: ['Ursprungsebenen an', 'Ursprungsebenen aus'], axes: ['Achsen an', 'Achsen aus'], notes: ['Notizen eingeblendet', 'Notizen ausgeblendet'] }[k];
    set({ [k]: !v[k] }, labels ? labels[v[k] ? 1 : 0] : null);
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
  function setLevel(l) { set({ level: l }, l === 'simple' ? 'Einfach: wenige, große Knöpfe, alles erklärt.' : 'Profi: alle Werkzeuge und Tastenkürzel.'); }
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
    const tabs = h('div', { class: 'seg set-tabs', role: 'tablist', 'aria-label': 'Einstellungsbereiche' });
    const tabGen = h('button', { type: 'button', role: 'tab', id: 'set-tab-general', 'aria-selected': 'true', 'aria-pressed': 'true' }, 'Allgemein');
    const tabKeys = h('button', { type: 'button', role: 'tab', id: 'set-tab-keys', 'data-help': 'customShortcuts', 'aria-selected': 'false', 'aria-pressed': 'false' }, 'Tastenkürzel');
    tabs.append(tabGen, tabKeys);

    const paneGen = h('div', { id: 'set-pane-general', style: { display: 'grid', gap: '14px' } });
    const paneKeys = h('div', { id: 'set-pane-keys', style: { display: 'grid', gap: '10px' }, hidden: true });

    const lvlField = h('div', { class: 'field' },
      h('label', null, 'Stufe'),
      levelCards({ idPrefix: 'set-level', active: v.level, onPick: () => syncTabs(curTab) }),
      h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, 'Einfach blendet Messen, Notizen, Ansicht, Zeichnung und Profi-Werkzeuge aus. Über „Mehr“ kommst du trotzdem hin.'),
    );
    const decOpts = () => [0, 1, 2, 3, 4].map((d) => [String(d), `${d} ${d === 1 ? 'Stelle' : 'Stellen'} (${fmtFixed(12.3456, d)} ${Units.label()})`]);
    const angOpts = [0, 1, 2, 3, 4].map((d) => [String(d), `${d} ${d === 1 ? 'Stelle' : 'Stellen'} (${fmtFixed(45.1234, d)}°)`]);
    const decFields = h('div', { class: 'fields', 'data-help': 'precision' },
      sel('set-dec', 'Nachkommastellen (Anzeige)', v.decimals, decOpts(), (x) => set({ decimals: +x })),
      sel('set-angle-dec', 'Nachkommastellen (Winkel)', v.angleDecimals, angOpts, (x) => set({ angleDecimals: +x })),
    );
    const decBlock = h('div', { 'data-help': 'precision' },
      decFields,
      h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, 'Gilt für Schilder, Maße, Messungen und Panels. Gespeicherte Werte und die Rechengenauigkeit bleiben immer exakt.'),
    );
    const unitSel = sel('set-proj-unit', 'Einheit in diesem Projekt', Units.key(), Units.OPTIONS, (x) => {
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
    }, 'Gilt für alle Anzeigen, Maße und Eingaben ohne eigene Einheit in diesem Projekt.');
    paneGen.append(
      lvlField,
      unitSel,
      sel('set-theme', 'Design', v.theme, [['system', 'Wie das System'], ['light', 'Hell'], ['dark', 'Dunkel']], (x) => set({ theme: x })),
      decBlock,
      sel('set-quality', 'Darstellungsqualität', v.quality, [['coarse', 'Grob – am schnellsten'], ['normal', 'Normal'], ['fine', 'Fein'], ['ultra', 'Sehr fein – braucht mehr Leistung']], (x) => set({ quality: x }), 'Wie glatt Rundungen auf dem Bildschirm aussehen. Die Geometrie selbst ist immer exakt.'),
      sel('set-mouse', 'Maus-Steuerung', v.mouse || 'tracery', [['tracery', 'Tracery – links drehen, rechts verschieben, Rad zoomt'], ['onshape', 'Wie Onshape – rechts drehen, Mitte verschieben'], ['solidworks', 'Wie SolidWorks – Mitte drehen, rechts verschieben'], ['fusion', 'Wie Fusion – Mitte verschieben, Umschalt + Mitte drehen'], ['blender', 'Wie Blender – Mitte drehen, Umschalt + Mitte verschieben']], (x) => set({ mouse: x }), 'Bei allen außer Tracery zieht die linke Maustaste im Leeren einen Auswahl-Rahmen auf. Das Mausrad zoomt immer.'),
      chk('adaptive', 'Darstellung automatisch anpassen', 'Teile, die du von nah ansiehst, werden feiner dargestellt. Beim Drehen eines großen Modells wird kurz gröber gezeichnet, damit es flüssig bleibt.'),
    );

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
    UI.modal({ title: 'Einstellungen', body, actions: [{ label: 'Fertig', primary: true }], onClose: () => { if (kbdEd) kbdEd.destroy(); } });
    if (opts && opts.focus) setTimeout(() => { const el = document.getElementById(opts.focus); if (el) el.focus(); }, 45);
  }
  return { get: () => ({ ...v }), get level() { return v.level; }, set level(l) { setLevel(l); }, get firstStart() { return firstStart && !(typeof Store !== 'undefined' && Store.hasProjects); }, set, toggle, apply, dialog, setLevel, syncLevel, levelCards, get simple() { return simple(); }, on: ev.on };
})();

