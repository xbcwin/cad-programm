// ================= Start der App =================
(function boot() {
  let errShown = 0;
  window.addEventListener('error', (e) => { console.error(e.error || e.message); if (Date.now() - errShown > 4000 && /Tracery|app|THREE|replicad/i.test(String(e.filename || '') + String(e.message || '')) === false) { errShown = Date.now(); } });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (Date.now() - errShown > 4000) { errShown = Date.now(); const m = (e.reason && e.reason.message) || String(e.reason || ''); if (m && !/abort|cancel/i.test(m)) UI.toast('Da ist etwas schiefgelaufen: ' + m.slice(0, 140), { kind: 'bad' }); } });

  // Symbole in die festen Knöpfe setzen
  $('#btn-undo').innerHTML = icon('undo'); $('#btn-redo').innerHTML = icon('redo'); $('#btn-menu').innerHTML = icon('menu');
  $('#btn-left').innerHTML = icon('list'); $('#btn-right').innerHTML = icon('sliders');

  window.__masswerk = { App, Viewer, Model, Actions, Sketch, SK, THREE, Print, Drawing, Kernel, UI, Commands, Panels, Handles, Start, AI, Measure, Place };
  UI.initTips();
  Viewer.init($('#viewport'));
  window.__V = Viewer; window.__M = { App, Actions, Model, Timeline, Start, Comp, Handles, Sketch, SK, Viewer, Commands, Solver, Notes, SKO, Features, Place }; window.__S = Start; // für automatische Tests
  Panels.init(); Handles.init(); Interact.init(); Sketch.init(); Measure.init(); Notes.init(); Commands.init(); Print.init(); ViewPrefs.apply(); Log.init(); Timeline.init(); Refine.init(); Comp.init();

  // Kopfzeile
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  const updHist = () => { $('#btn-undo').disabled = !App.undoStack.length; $('#btn-redo').disabled = !App.redoStack.length; const l = App.undoStack[App.undoStack.length - 1]; $('#btn-undo').dataset.tip = l ? 'Rückgängig: ' + l.label : 'Rückgängig'; };
  App.on('history', updHist); App.on('doc', updHist); updHist();
  const updName = () => { $('#btn-project').textContent = App.doc.name; document.title = App.doc.name && App.doc.name !== 'Neues Projekt' ? App.doc.name + ' – Tracery' : 'Tracery'; };
  App.on('doc', updName);
  $('#tab-model').onclick = () => Commands.setMode('model');
  $('#tab-drawing').onclick = () => Commands.setMode('drawing');
  $('#brand').onclick = (e) => { e.preventDefault(); Start.show(); };
  const projectItems = () => [
    { label: 'Projekt umbenennen', icon: 'edit', run: async () => { const n = await UI.prompt('Projekt umbenennen', 'Name', App.doc.name, 'Umbenennen'); if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); }); } },
    { label: 'Als Datei speichern', icon: 'save', kbd: 'Strg S', run: () => Start.saveFile() },
    { label: 'Datei öffnen …', icon: 'folder', run: () => Start.openFile() },
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
    '-',
    { label: 'Über Tracery', icon: 'info', run: () => UI.modal({ title: 'Über Tracery', body: h('div', { style: { display: 'grid', gap: '10px', color: 'var(--muted)', lineHeight: 1.55 } }, h('p', null, 'Tracery ist ein parametrisches CAD im Browser, spezialisiert auf FPV- und Speed-Drohnen, mit technischen Zeichnungen.'), h('p', null, 'Der Name: „Tracery“ ist das englische Wort für Maßwerk – die filigranen, exakt konstruierten Ornamente in gotischen Kirchenfenstern. Genau so sollen deine Teile werden.'), h('p', null, 'Gerechnet wird mit dem CAD-Kern OpenCascade (LGPL-2.1) über die Bibliothek replicad (MIT). Die 3D-Anzeige nutzt three.js (MIT), die PDF-Ausgabe jsPDF (MIT).'), h('p', null, 'Deine Projekte bleiben in deinem Browser. Der KI-Helfer nutzt dein Claude-Konto.')), actions: [{ label: 'Schließen', primary: true }] }) },
  ], { alignRight: true });
  const ws = $('#workspace');
  $('#btn-left').onclick = () => { ws.classList.toggle('show-left'); ws.classList.remove('show-right'); };
  $('#btn-right').onclick = () => { ws.classList.toggle('show-right'); ws.classList.remove('show-left'); };
  $('#center').addEventListener('pointerdown', () => { if (innerWidth <= 900) ws.classList.remove('show-left', 'show-right'); });
  App.on('busy', (on) => UI.busy(on));
  App.on('selection', () => { if (innerWidth <= 900 && App.sel.length) { /* rechte Leiste nicht aufzwingen */ } });
  window.addEventListener('beforeunload', () => App.autosave.flush && App.autosave.flush());

  // Letztes Projekt laden oder Startseite zeigen
  const lastId = storageGet('masswerk.last');
  const last = lastId ? App.loadStored(lastId) : null;
  if (last) { try { App.setDoc(last, { fit: true }); } catch (_) { App.setDoc(Model.newDoc()); } }
  else App.setDoc(Model.newDoc());
  updName(); UI.renderHint();
  if (!last) Start.show();

  UI.loading(true, 0.02);
  Kernel.start((p) => UI.loading(true, p, p > 0.84 ? 'CAD-Kern startet …' : 'Der CAD-Kern wird geladen …'))
    .then(async () => {
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

