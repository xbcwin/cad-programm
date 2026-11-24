// ================= Ansicht: Raster, Ursprungsebenen, Achsen, Projektion =================
// Persönliche Einstellung (nicht im Projekt gespeichert), gilt für alle Projekte in diesem Browser.
const ViewPrefs = (() => {
  const KEY = 'masswerk.view';
  const DEF = { grid: 'auto', gridOn: true, planes: true, axes: true, ortho: false, quality: 'normal', adaptive: true, theme: 'system', decimals: 0, notes: true, cog: false, level: 'pro', look: 'studio', mood: 'studio', shadows: true, display: 'edges' };
  let v = { ...DEF };
  let firstStart = !storageGet(KEY) && !storageGet('masswerk.last') && !storageGet('masswerk.index');
  try { const raw = storageGet(KEY); if (raw) v = { ...DEF, ...JSON.parse(raw) }; } catch (_) {}
  const ev = makeEmitter();
  function applyTheme() {
    const r = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') r.setAttribute('data-theme', v.theme); else r.removeAttribute('data-theme');
  }
  const simple = () => v.level === 'simple';
  function apply() { document.body.classList.toggle('simple', simple()); Viewer.setViewOptions({ grid: v.grid, gridOn: v.gridOn, planes: v.planes, axes: v.axes }); Viewer.setOrtho(v.ortho); Viewer.setAdaptive(v.adaptive !== false); Viewer.setLook({ look: v.look, mood: v.mood, shadows: v.shadows !== false, display: v.display || 'edges' }); applyTheme(); FMT.min = +v.decimals || 0; Viewer.setMouseStyle(v.mouse || 'tracery'); ev.emit('change', v); }
  function set(patch, msg) {
    const oldQ = v.quality, oldDec = v.decimals, oldL = v.level;
    if ('level' in patch) firstStart = false;
    Object.assign(v, patch); storageSet(KEY, JSON.stringify(v)); apply();
    syncLevel();
    if (v.level !== oldL) {
      // Oberfläche gewechselt: Werkzeuge, Leisten und Kontextleiste neu aufbauen
      if (simple() && App.mode !== 'model') Commands.setMode('model');
      Panels.closeFlyout(); Panels.renderTools(); Panels.renderLeft(); Panels.renderRight(); Panels.renderCtx();
      if (typeof Commands !== 'undefined' && Commands.syncCmdKbds) Commands.syncCmdKbds();
    }
    if (v.quality !== oldQ) App.requalify();
    if (v.decimals !== oldDec) { App.emit('doc'); Panels.renderRight(); }
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
      b.textContent = simple() ? 'Einfach' : 'Profi';
      b.setAttribute('aria-pressed', simple() ? 'true' : 'false');
      b.dataset.level = v.level;
      b.dataset.tip = simple() ? 'Stufe: Einfach – klicken zum Wechseln auf Profi' : 'Stufe: Profi – klicken zum Wechseln auf Einfach';
    }
  }
  function setLevel(l) { set({ level: l }, l === 'simple' ? 'Einfach: wenige, große Knöpfe, alles erklärt.' : 'Profi: alle Werkzeuge und Tastenkürzel.'); }
  // Zwei Stufen-Karten („Einfach“ / „Profi“) für ersten Start und Einstellungen
  function levelCards({ idPrefix, active = v.level, onPick } = {}) {
    const wrap = h('div', { class: 'level-cards', role: 'group', 'aria-label': 'Stufe wählen' });
    const defs = [
      ['simple', 'cube', 'Einfach', 'wenige, große Knöpfe, alles erklärt'],
      ['pro', 'sliders', 'Profi', 'alle Werkzeuge, Tastenkürzel, Maus wie in deinem CAD'],
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
  function dialog(initialTab = 'general') {
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
    paneGen.append(
      lvlField,
      sel('set-proj-unit', 'Einheit in diesem Projekt', Units.key(), Units.OPTIONS, (x) => Units.set(x), 'Gilt für alle Anzeigen, Maße und Eingaben ohne eigene Einheit in diesem Projekt.'),
      sel('set-theme', 'Design', v.theme, [['system', 'Wie das System'], ['light', 'Hell'], ['dark', 'Dunkel']], (x) => set({ theme: x })),
      sel('set-dec', 'Nachkommastellen in Anzeigen', v.decimals, [['0', 'Automatisch (2 Stellen)'], ['3', `3 Stellen (0,001 ${Units.label()})`], ['4', `4 Stellen (0,0001 ${Units.label()})`]], (x) => set({ decimals: +x }), 'Eingaben werden immer exakt gespeichert, das betrifft nur die Anzeige.'),
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
  }
  return { get: () => ({ ...v }), get level() { return v.level; }, set level(l) { setLevel(l); }, get firstStart() { return firstStart && !(typeof Store !== 'undefined' && Store.hasProjects); }, set, toggle, apply, dialog, setLevel, syncLevel, levelCards, get simple() { return simple(); }, on: ev.on };
})();

