// ================= Start der App =================
(function boot() {
  let errShown = 0;
  window.addEventListener('error', (e) => { console.error(e.error || e.message); if (Date.now() - errShown > 4000 && /Tracery|app|THREE|replicad/i.test(String(e.filename || '') + String(e.message || '')) === false) { errShown = Date.now(); } });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (Date.now() - errShown > 4000) { errShown = Date.now(); const m = (e.reason && e.reason.message) || String(e.reason || ''); if (m && !/abort|cancel/i.test(m)) UI.toast('Da ist etwas schiefgelaufen: ' + m.slice(0, 140), { kind: 'bad' }); } });

  // Symbole in die festen Knöpfe setzen
  $('#btn-undo').innerHTML = icon('undo'); $('#btn-redo').innerHTML = icon('redo'); $('#btn-menu').innerHTML = icon('menu');
  $('#btn-left').innerHTML = icon('list'); $('#btn-right').innerHTML = icon('sliders');

  window.__masswerk = { App, Viewer, Model, Actions, Sketch, SK, THREE, Print, Drawing, Kernel, UI, Commands, Panels, Handles, Start, AI, Measure, Place, Store };
  UI.initTips();
  Viewer.init($('#viewport'));
  window.__V = Viewer; window.__M = { Store, Interact, Measure, Datums, Print, ViewPrefs, App, Actions, Model, Timeline, Start, Comp, Handles, Sketch, SK, Viewer, Commands, Solver, Notes, SKO, Features, Place, Views, Mass, Select, Versions, DroneTpl, DroneUI, DroneLib, DroneCheck, Plates, Variants, Explain, Weak, AI, Snap, Panels, Joints }; window.__S = Start; // für automatische Tests
  Panels.init(); Datums.init(); Handles.init(); Interact.init(); Sketch.init(); Measure.init(); Notes.init(); Commands.init(); Print.init(); ViewPrefs.apply(); Log.init(); Timeline.init(); Refine.init(); Comp.init(); Views.init(); Mass.init(); Joints.init(); Versions.init(); Start.init();

  // Kopfzeile
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  const updHist = () => { $('#btn-undo').disabled = !App.undoStack.length; $('#btn-redo').disabled = !App.redoStack.length; const l = App.undoStack[App.undoStack.length - 1]; $('#btn-undo').dataset.tip = l ? 'Rückgängig: ' + l.label : 'Rückgängig'; };
  App.on('history', updHist); App.on('doc', updHist); updHist();
  const updName = () => { $('#btn-project').textContent = App.doc.name; document.title = App.doc.name && App.doc.name !== 'Neues Projekt' ? App.doc.name + ' – Tracery' : 'Tracery'; };
  App.on('doc', updName);
  $('#btn-level').onclick = () => ViewPrefs.setLevel(ViewPrefs.simple ? 'pro' : 'simple'); ViewPrefs.syncLevel();
  $('#tab-model').onclick = () => Commands.setMode('model');
  $('#tab-drawing').onclick = () => Commands.setMode('drawing');
  $('#brand').onclick = (e) => { e.preventDefault(); Start.show(); };
  const projectItems = () => [
    { label: 'Projekt umbenennen', icon: 'edit', run: async () => { const n = await UI.prompt('Projekt umbenennen', 'Name', App.doc.name, 'Umbenennen'); if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); }); } },
    { label: 'Als Datei speichern', icon: 'save', kbd: 'Strg S', run: () => Start.saveFile() },
    ...(Start.folderSupported() ? (Start.folderInfo() ? [
      { label: `Jetzt in „${Start.folderInfo().name}“ speichern`, icon: 'save', id: 'pm-folder-now', help: 'saveFolder', run: () => Start.saveToFolderNow() },
      { label: 'Anderen Ordner wählen …', icon: 'folder', id: 'pm-folder-change', help: 'saveFolder', run: () => Start.saveToFolder() },
      { label: 'Ordner-Verbindung trennen', icon: 'close', id: 'pm-folder-stop', run: () => Start.disconnectFolder() },
    ] : [
      { label: 'In Ordner speichern …', icon: 'folder', id: 'pm-folder-save', help: 'saveFolder', run: () => Start.saveToFolder() },
    ]) : []),
    { label: 'Datei öffnen / STEP, STL, 3MF importieren …', icon: 'folder', help: 'importCad', run: () => Start.openFile() },
    { label: 'Versionen …', icon: 'rollback', help: 'versions', run: () => Versions.dialog() },
    '-',
    { label: 'Neues Projekt', icon: 'newfile', run: () => Start.newProject() },
    { label: 'Startseite und Vorlagen', icon: 'home', run: () => Start.show() },
  ];
  $('#btn-project').onclick = (e) => UI.menu(e.currentTarget, projectItems(), { alignRight: true });
  // auf schmalen Bildschirmen ist der Projektname ausgeblendet – dann steht das Projektmenü hier mit drin
  $('#btn-menu').onclick = (e) => UI.menu(e.currentTarget, [
    ...(innerWidth <= 900 ? [...projectItems(), '-'] : []),
    { label: 'Einführung starten', icon: 'play', run: () => Tour.start() },
    { label: 'Einführung: Erste Skizze', icon: 'sketch', run: () => Tour.start('sketch') },
    { label: 'Einstellungen', icon: 'gear', run: () => ViewPrefs.dialog() },
    { label: 'Tastenkürzel', icon: 'help', run: () => Commands.showKeys() },
    { label: 'Exportieren', icon: 'export', run: () => Print.exportDialog() },
    { label: 'Bild speichern (PNG)', icon: 'image', run: () => Print.imageDialog() },
    '-',
    { label: 'Über Tracery', icon: 'info', run: () => UI.modal({ title: 'Über Tracery', body: h('div', { style: { display: 'grid', gap: '10px', color: 'var(--muted)', lineHeight: 1.55 } }, h('p', null, 'Tracery ist ein kostenloses, parametrisches CAD im Browser – ohne Konto, mit exaktem Geometrie-Kern und technischen Zeichnungen.'), h('p', null, 'Der Name: „Tracery“ ist das englische Wort für Maßwerk – die filigranen, exakt konstruierten Ornamente in gotischen Kirchenfenstern. Genau so sollen deine Teile werden.'), h('p', null, 'Gerechnet wird mit dem CAD-Kern OpenCascade (LGPL-2.1) über die Bibliothek replicad (MIT). Die 3D-Anzeige nutzt three.js (MIT), die PDF-Ausgabe jsPDF (MIT).'), h('p', null, 'Deine Projekte bleiben in deinem Browser. Der KI-Helfer nutzt dein Claude-Konto.')), actions: [{ label: 'Schließen', primary: true }] }) },
  ], { alignRight: true });
  const ws = $('#workspace');
  $('#btn-left').onclick = () => { ws.classList.toggle('show-left'); ws.classList.remove('show-right'); };
  $('#btn-right').onclick = () => { ws.classList.toggle('show-right'); ws.classList.remove('show-left'); };
  $('#center').addEventListener('pointerdown', () => { if (innerWidth <= 900) ws.classList.remove('show-left', 'show-right'); });
  App.on('busy', (on) => UI.busy(on));
  App.on('selection', () => { if (innerWidth <= 900 && App.sel.length) { /* rechte Leiste nicht aufzwingen */ } });
  window.addEventListener('beforeunload', () => App.autosave.flush && App.autosave.flush());

  // Letztes Projekt aus der Browser-Datenbank laden (ggf. aus localStorage übernehmen) oder Startseite zeigen
  updName(); UI.renderHint();
  UI.loading(true, 0.02);
  const storageReady = (async () => {
    await Store.init();
    const lastId = Store.getLastId();
    const last = lastId ? await App.loadStored(lastId) : null;
    if (last) { try { App.setDoc(last, { fit: true }); } catch (_) { App.setDoc(Model.newDoc()); } }
    else App.setDoc(Model.newDoc());
    updName(); UI.renderHint();
    if (!last) Start.show();
  })();

  Kernel.start((p) => UI.loading(true, p, p > 0.84 ? 'CAD-Kern startet …' : 'Der CAD-Kern wird geladen …'))
    .then(async () => {
      await storageReady;
      UI.loading(false);
      await App.rebuild();
      Viewer.fit(null, false);
      Print.updateAmpel();
    })
    .catch((e) => {
      console.error(e);
      UI.loading(true, 0, '');
      const lb = $('.loading .box');
      if (lb) { lb.innerHTML = ''; lb.append(h('b', null, 'Der CAD-Kern konnte nicht starten'), h('span', null, String(e.message || e)), h('span', null, 'Lade die Seite neu. Wenn es wieder passiert, nutze einen aktuellen Browser wie Chrome, Edge, Firefox oder Safari.')); }
    });
})();

