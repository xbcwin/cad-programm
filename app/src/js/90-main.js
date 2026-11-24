// ================= Start der App =================
(function boot() {
  let errShown = 0;
  window.addEventListener('error', (e) => { console.error(e.error || e.message); if (Date.now() - errShown > 4000 && /Tracery|app|THREE|replicad/i.test(String(e.filename || '') + String(e.message || '')) === false) { errShown = Date.now(); } });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (Date.now() - errShown > 4000) { errShown = Date.now(); const m = (e.reason && e.reason.message) || String(e.reason || ''); if (m && !/abort|cancel/i.test(m)) UI.toast('Da ist etwas schiefgelaufen: ' + m.slice(0, 140), { kind: 'bad' }); } });

  // Symbole in die festen Knöpfe setzen
  $('#btn-undo').innerHTML = icon('undo'); $('#btn-redo').innerHTML = icon('redo'); $('#btn-menu').innerHTML = icon('menu');
  $('#btn-left').innerHTML = icon('list'); $('#btn-right').innerHTML = icon('sliders');

  window.__masswerk = { App, Viewer, Model, Actions, Sketch, SK, TTF, THREE, Print, Drawing, Kernel, UI, Commands, Toolbar, Panels, Handles, Start, AI, Measure, Place, Store, I18n, T, Units, RefFix, Expr };
  UI.initTips();
  I18n.applyDom();
  Viewer.init($('#viewport'));
  window.__V = Viewer; window.__M = { Store, Interact, Measure, Datums, RefFix, Print, ViewPrefs, App, Actions, Model, Timeline, Start, Comp, Handles, Sketch, SK, TTF, Viewer, Commands, Solver, Notes, SKO, Features, Place, Views, Mass, Select, Versions, DroneTpl, DroneUI, DroneLib, DroneCheck, Plates, Variants, Explain, Weak, AI, Snap, Toolbar, Panels, Joints, I18n, T, Units, Expr, Tour }; window.__S = Start; // für automatische Tests
  Panels.init(); Datums.init(); RefFix.init(); Handles.init(); Interact.init(); Sketch.init(); Measure.init(); Notes.init(); Commands.init(); Print.init(); ViewPrefs.apply(); Log.init(); Timeline.init(); Refine.init(); Comp.init(); Views.init(); Mass.init(); Joints.init(); Versions.init(); Start.init();

  // Kopfzeile
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  const updHist = () => { $('#btn-undo').disabled = !App.undoStack.length; $('#btn-redo').disabled = !App.redoStack.length; const l = App.undoStack[App.undoStack.length - 1]; $('#btn-undo').dataset.tip = l ? T('topbar.undoLabel', { label: l.label }) : T('topbar.undo'); };
  App.on('history', updHist); App.on('doc', updHist); updHist();
  const updName = () => { $('#btn-project').textContent = App.doc.name; document.title = App.doc.name && App.doc.name !== 'Neues Projekt' ? App.doc.name + ' – Tracery' : 'Tracery'; };
  App.on('doc', updName);
  $('#btn-level').onclick = () => ViewPrefs.setLevel(ViewPrefs.simple ? 'pro' : 'simple'); ViewPrefs.syncLevel();
  $('#tab-model').onclick = () => Commands.setMode('model');
  $('#tab-drawing').onclick = () => Commands.setMode('drawing');
  $('#brand').onclick = (e) => { e.preventDefault(); Start.show(); };
  I18n.on('change', () => { I18n.applyDom(); ViewPrefs.syncLevel(); Panels.renderTools(); Panels.renderCtx(); updHist(); if (Start.open) Start.show(); });
  const projectItems = () => [
    { label: T('menu.proj.rename'), icon: 'edit', run: async () => { const n = await UI.prompt(T('menu.proj.rename'), T('common.name'), App.doc.name, T('common.rename')); if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); }); } },
    { label: T('menu.proj.saveFile'), icon: 'save', kbd: 'Strg S', run: () => Start.saveFile() },
    ...(Start.folderSupported() ? (Start.folderInfo() ? [
      { label: T('menu.proj.saveInFolderNow', { name: Start.folderInfo().name }), icon: 'save', id: 'pm-folder-now', help: 'saveFolder', run: () => Start.saveToFolderNow() },
      { label: T('menu.proj.changeFolder'), icon: 'folder', id: 'pm-folder-change', help: 'saveFolder', run: () => Start.saveToFolder() },
      { label: T('menu.proj.disconnectFolder'), icon: 'close', id: 'pm-folder-stop', run: () => Start.disconnectFolder() },
    ] : [
      { label: T('menu.proj.saveToFolder'), icon: 'folder', id: 'pm-folder-save', help: 'saveFolder', run: () => Start.saveToFolder() },
    ]) : []),
    { label: T('menu.proj.openImport'), icon: 'folder', help: 'importCad', run: () => Start.openFile() },
    { label: T('menu.proj.versions'), icon: 'rollback', help: 'versions', run: () => Versions.dialog() },
    '-',
    { label: T('menu.proj.newProject'), icon: 'newfile', run: () => Start.newProject() },
    { label: T('menu.proj.startAndTemplates'), icon: 'home', run: () => Start.show() },
  ];
  $('#btn-project').onclick = (e) => UI.menu(e.currentTarget, projectItems(), { alignRight: true });
  // auf schmalen Bildschirmen ist der Projektname ausgeblendet – dann steht das Projektmenü hier mit drin
  $('#btn-menu').onclick = (e) => UI.menu(e.currentTarget, [
    ...(innerWidth <= 900 ? [...projectItems(), '-'] : []),
    { label: T('menu.main.tourBasics'), icon: 'play', run: () => Tour.start() },
    { label: T('menu.main.tourSketch'), icon: 'sketch', run: () => Tour.start('sketch') },
    { label: T('menu.main.settings'), icon: 'gear', run: () => ViewPrefs.dialog() },
    { label: T('menu.main.shortcuts'), icon: 'help', run: () => Commands.showKeys() },
    { label: T('menu.main.export'), icon: 'export', run: () => Print.exportDialog() },
    { label: T('menu.main.saveImage'), icon: 'image', run: () => Print.imageDialog() },
    '-',
    { label: T('menu.main.about'), icon: 'info', run: () => UI.modal({ title: T('menu.main.about'), body: h('div', { style: { display: 'grid', gap: '10px', color: 'var(--muted)', lineHeight: 1.55 } }, h('p', null, T('menu.main.aboutP1')), h('p', null, T('menu.main.aboutP2')), h('p', null, T('menu.main.aboutP3')), h('p', null, T('menu.main.aboutP4'))), actions: [{ label: T('common.close'), primary: true }] }) },
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

