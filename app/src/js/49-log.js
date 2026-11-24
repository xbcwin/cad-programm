// ================= Protokoll: jede Änderung mit Uhrzeit, Fehler in normaler Sprache =================
const Log = (() => {
  const MAX = 300; const ev = makeEmitter();
  const session = uid('s');          // Rückgängig-Sprünge gehen nur innerhalb dieser Sitzung
  let docId = null, list = [];
  const HINT = {
    edges: 'Eine frühere Änderung hat die gewählten Kanten verändert. Körper anklicken und die Kanten für Rundung oder Fase neu auswählen.',
    toobig: 'Den Radius kleiner machen oder die Kante länger.',
    build: 'Die Maße dieses Schritts prüfen – z. B. ob eine Wand dünner als null wird.',
    cut: 'Prüfen, ob das Loch den Körper überhaupt berührt.',
    mesh: 'Ein Maß leicht ändern und erneut versuchen.',
    split: 'Rechts bei „Lage der Ebene“ einen Wert innerhalb des Körpers eintippen oder bei „Behalten“ die andere Hälfte wählen.',
  };
  const key = (id) => 'masswerk.log.' + id;
  function load(id) { docId = id; try { list = JSON.parse(storageGet(key(id)) || '[]'); } catch (_) { list = []; } }
  const save = debounce(() => { if (docId) storageSet(key(docId), JSON.stringify(list.slice(-MAX))); }, 600);
  function add(e) {
    if (App.doc.id !== docId) load(App.doc.id);
    const it = e.itemId ? Model.find(App.doc, e.itemId) : null;
    list.push({ t: Date.now(), s: session, ...e, name: it ? Model.label(it.item) : e.name });
    if (list.length > MAX) list = list.slice(-MAX);
    save(); ev.emit('change');
  }
  function clear() { list = []; startupLogs.length = 0; save.flush(); ev.emit('change'); }
  function hint(code) { const k = ERROR_FOR_CODE[code]; return k && ERRORS[k] ? ERRORS[k].loesung : (HINT[code] || ''); }
  const startup = { uiReadyMs: null, kernelStartMs: null, kernelReadyMs: null, kernelLoadMs: null, fonts: {} };
  const startupLogs = [];
  const fmtDur = (ms) => (ms == null ? '–' : ms >= 1000 ? `${fmt(ms / 1000, 2)} s` : `${Math.round(ms)} ms`);
  function pushStartupLog(startupKey, text) {
    const entry = { t: Date.now(), s: session, kind: 'info', text, startupKey };
    startupLogs.push(entry);
    if (App.doc.id !== docId) load(App.doc.id);
    list.push(entry);
    if (list.length > MAX) list = list.slice(-MAX);
    save(); ev.emit('change');
  }
  function markUiReady(ms) {
    if (startup.uiReadyMs != null) return;
    startup.uiReadyMs = Math.max(1, Math.round(ms != null ? ms : performance.now()));
    pushStartupLog('ui', `Startzeit: Oberfläche bereit nach ${fmtDur(startup.uiReadyMs)} (Kern lädt bei Bedarf)`);
  }
  function markKernelReady(t = {}) {
    if (startup.kernelReadyMs != null) return;
    startup.kernelStartMs = t.loadStartMs != null ? Math.round(t.loadStartMs) : null;
    startup.kernelReadyMs = Math.max(1, Math.round(t.readyMs != null ? t.readyMs : performance.now()));
    startup.kernelLoadMs = t.loadDurMs != null ? Math.max(1, Math.round(t.loadDurMs)) : null;
    const suf = startup.kernelLoadMs != null ? ` (Ladezeit ${fmtDur(startup.kernelLoadMs)})` : '';
    pushStartupLog('kernel', `CAD-Kern bereit nach ${fmtDur(startup.kernelReadyMs)}${suf}`);
  }
  function markFontLoaded(info = {}) {
    const id = info.id || 'inter';
    const name = info.name || id;
    const ms = Math.max(1, Math.round(info.ms || 1));
    startup.fonts[id] = { id, name, ms, atMs: info.atMs != null ? Math.round(info.atMs) : Math.round(performance.now()) };
    pushStartupLog('font:' + id, `Schrift geladen: ${name} (${fmtDur(ms)})`);
  }
  function entries() {
    if (App.doc.id !== docId) load(App.doc.id);
    const have = new Set(list.filter((x) => x.s === session && x.startupKey).map((x) => x.startupKey));
    const missing = startupLogs.filter((x) => !have.has(x.startupKey));
    return missing.length ? [...list, ...missing].sort((a, b) => a.t - b.t) : list;
  }
  function init() {
    App.on('log', add);
    App.on('doc', () => { if (App.doc.id !== docId) { load(App.doc.id); add({ kind: 'info', text: `Projekt geöffnet: ${App.doc.name}` }); } });
  }
  return { init, entries, clear, hint, on: ev.on, get session() { return session; }, get startup() { return startup; }, markUiReady, markKernelReady, markFontLoaded };
})();

