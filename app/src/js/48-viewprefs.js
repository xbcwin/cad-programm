// ================= Ansicht: Raster, Ursprungsebenen, Achsen, Projektion =================
// Persönliche Einstellung (nicht im Projekt gespeichert), gilt für alle Projekte in diesem Browser.
const ViewPrefs = (() => {
  const KEY = 'masswerk.view';
  const DEF = { grid: 'auto', gridOn: true, planes: true, axes: true, ortho: false, quality: 'normal', adaptive: true, theme: 'system', decimals: 0, notes: true, cog: false, level: 'pro' };
  let v = { ...DEF };
  try { const raw = storageGet(KEY); if (raw) v = { ...DEF, ...JSON.parse(raw) }; } catch (_) {}
  const ev = makeEmitter();
  function applyTheme() {
    const r = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') r.setAttribute('data-theme', v.theme); else r.removeAttribute('data-theme');
  }
  const simple = () => v.level === 'simple';
  function apply() { document.body.classList.toggle('simple', simple()); Viewer.setViewOptions({ grid: v.grid, gridOn: v.gridOn, planes: v.planes, axes: v.axes }); Viewer.setOrtho(v.ortho); Viewer.setAdaptive(v.adaptive !== false); applyTheme(); FMT.min = +v.decimals || 0; ev.emit('change', v); }
  function set(patch, msg) {
    const oldQ = v.quality, oldDec = v.decimals, oldL = v.level;
    Object.assign(v, patch); storageSet(KEY, JSON.stringify(v)); apply();
    if (v.level !== oldL) {
      // Oberfläche gewechselt: Werkzeuge, Leisten und Kontextleiste neu aufbauen
      if (simple() && App.mode !== 'model') Commands.setMode('model');
      Panels.closeFlyout(); Panels.renderTools(); Panels.renderLeft(); Panels.renderRight(); Panels.renderCtx(); syncLevel();
    }
    if (v.quality !== oldQ) App.requalify();
    if (v.decimals !== oldDec) { App.emit('doc'); Panels.renderRight(); }
    if (msg) UI.toast(msg, { icon: 'check', ms: 1600 });
  }
  function toggle(k) {
    const labels = { ortho: ['Orthografische Ansicht', 'Perspektivische Ansicht'], gridOn: ['Raster an', 'Raster aus'], planes: ['Ursprungsebenen an', 'Ursprungsebenen aus'], axes: ['Achsen an', 'Achsen aus'], notes: ['Notizen eingeblendet', 'Notizen ausgeblendet'] }[k];
    set({ [k]: !v[k] }, labels ? labels[v[k] ? 1 : 0] : null);
  }
  // Knopf oben rechts: Einfach ↔ Profi
  function syncLevel() { const b = document.getElementById('btn-level'); if (b) { b.textContent = simple() ? 'Einfach' : 'Profi'; b.setAttribute('aria-pressed', simple() ? 'true' : 'false'); b.dataset.tip = simple() ? 'Einfache Oberfläche – klicken für alle Werkzeuge (Profi)' : 'Alle Werkzeuge – klicken für die einfache Oberfläche'; } }
  function setLevel(l) { set({ level: l }, l === 'simple' ? 'Einfache Oberfläche: nur die wichtigsten Werkzeuge. Mehr unter „Mehr“.' : 'Profi: alle Werkzeuge.'); }
  // Einstellungen-Fenster (Menü ⋯ → Einstellungen)
  function dialog() {
    const body = h('div', { style: { display: 'grid', gap: '14px', minWidth: 'min(420px, 80vw)' } });
    const sel = (id, label, val, opts, fn, hint) => { const f = UI.selectField({ id, label, value: String(val), options: opts, onChange: fn }); if (hint) f.append(h('small', { style: { color: 'var(--muted)', display: 'block', marginTop: '4px' } }, hint)); return f; };
    const chk = (k, label, hint) => { const l = h('label', { class: 'check', style: { alignItems: 'flex-start' } }, h('input', { type: 'checkbox', id: 'set-' + k, checked: !!v[k] }), h('span', null, label, hint ? h('small', { style: { display: 'block', color: 'var(--muted)' } }, hint) : null)); l.querySelector('input').onchange = (e) => set({ [k]: e.target.checked }); return l; };
    body.append(
      sel('set-level', 'Oberfläche', v.level, [['simple', 'Einfach – die wichtigsten Werkzeuge'], ['pro', 'Profi – alle Werkzeuge']], (x) => setLevel(x), 'Einfach blendet Messen, Notizen, Ansicht, Zeichnung und Profi-Werkzeuge aus. Über „Mehr“ kommst du trotzdem hin.'),
      sel('set-theme', 'Design', v.theme, [['system', 'Wie das System'], ['light', 'Hell'], ['dark', 'Dunkel']], (x) => set({ theme: x })),
      sel('set-dec', 'Nachkommastellen in Anzeigen', v.decimals, [['0', 'Automatisch (2 Stellen)'], ['3', '3 Stellen (0,001 mm)'], ['4', '4 Stellen (0,0001 mm)']], (x) => set({ decimals: +x }), 'Eingaben werden immer exakt gespeichert, das betrifft nur die Anzeige.'),
      sel('set-quality', 'Darstellungsqualität', v.quality, [['coarse', 'Grob – am schnellsten'], ['normal', 'Normal'], ['fine', 'Fein'], ['ultra', 'Sehr fein – braucht mehr Leistung']], (x) => set({ quality: x }), 'Wie glatt Rundungen auf dem Bildschirm aussehen. Die Geometrie selbst ist immer exakt.'),
      chk('adaptive', 'Darstellung automatisch anpassen', 'Teile, die du von nah ansiehst, werden feiner dargestellt. Beim Drehen eines großen Modells wird kurz gröber gezeichnet, damit es flüssig bleibt.'),
    );
    UI.modal({ title: 'Einstellungen', body, actions: [{ label: 'Fertig', primary: true }] });
  }
  return { get: () => ({ ...v }), set, toggle, apply, dialog, setLevel, syncLevel, get simple() { return simple(); }, on: ev.on };
})();

