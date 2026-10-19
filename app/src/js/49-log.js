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
  function entries() { if (App.doc.id !== docId) load(App.doc.id); return list; }
  function clear() { list = []; save.flush(); ev.emit('change'); }
  function hint(code) { const k = ERROR_FOR_CODE[code]; return k && ERRORS[k] ? ERRORS[k].loesung : (HINT[code] || ''); }
  function init() {
    App.on('log', add);
    App.on('doc', () => { if (App.doc.id !== docId) { load(App.doc.id); add({ kind: 'info', text: `Projekt geöffnet: ${App.doc.name}` }); } });
  }
  return { init, entries, clear, hint, on: ev.on, get session() { return session; } };
})();

