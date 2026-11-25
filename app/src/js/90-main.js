// ================= Start der App =================
const THIRD_PARTY_LIBS = /*JSON:fremde-bausteine.json*/null;
(function boot() {
  let errShown = 0;
  window.addEventListener('error', (e) => { console.error(e.error || e.message); if (Date.now() - errShown > 4000 && /Tracery|app|THREE|replicad/i.test(String(e.filename || '') + String(e.message || '')) === false) { errShown = Date.now(); } });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (Date.now() - errShown > 4000) { errShown = Date.now(); const m = (e.reason && e.reason.message) || String(e.reason || ''); if (m && !/abort|cancel/i.test(m)) UI.toast(T('status.unhandledErr', { msg: m.slice(0, 140) }), { kind: 'bad' }); } });

  // Symbole in die festen Knöpfe setzen
  $('#btn-undo').innerHTML = icon('undo'); $('#btn-redo').innerHTML = icon('redo'); $('#btn-whatis').innerHTML = icon('help'); $('#btn-menu').innerHTML = icon('menu');
  $('#btn-workspace').innerHTML = icon('layout');
  $('#btn-left').innerHTML = icon('list'); $('#btn-right').innerHTML = icon('sliders');
  $('#btn-left-close').innerHTML = icon('close'); $('#btn-right-close').innerHTML = icon('close');

  window.__masswerk = { App, Viewer, Model, Actions, Clipboard, Sketch, SK, TTF, THREE, Print, Drawing, Kernel, UI, Commands, Toolbar, Panels, Handles, Start, Templates, AI, Measure, Place, Store, I18n, T, Units, RefFix, Expr, GeomCheck, ClashCheck, InnerRadius, SymmetryCheck, UserLib, Assembly, Motion, PointClouds, Notices, PWA };
  UI.initTips();
  I18n.applyDom();
  UI.initTablet();
  UI.initA11y();
  Viewer.init($('#viewport'));
  window.__V = Viewer; window.__M = { Store, Interact, Measure, Datums, PointClouds, RefFix, Print, ViewPrefs, App, Actions, Clipboard, Model, Timeline, Start, Templates, Comp, Assembly, Motion, Handles, DragInput, Sketch, SK, TTF, Viewer, Commands, Solver, Notes, SKO, Features, Place, Views, Mass, Select, Versions, DroneTpl, DroneUI, DroneLib, UserLib, DroneCheck, Plates, Variants, Explain, Weak, AI, Snap, Toolbar, Panels, Joints, I18n, T, Units, Expr, Tour, GeomCheck, ClashCheck, InnerRadius, SymmetryCheck, Log, Notices, PWA, Kernel, Drawing, UI }; window.__S = Start; // für automatische Tests
  Panels.init(); Datums.init(); PointClouds.init(); RefFix.init(); Handles.init(); Interact.init(); Sketch.init(); Measure.init(); Notes.init(); Commands.init(); Print.init(); ViewPrefs.apply(); Log.init(); Notices.init(); Timeline.init(); Refine.init(); Comp.init(); Assembly.init(); Motion.init(); Views.init(); GeomCheck.init(); ClashCheck.init(); InnerRadius.init(); SymmetryCheck.init(); Mass.init(); Joints.init(); Versions.init(); Start.init(); PWA.init();

  // Kopfzeile
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  const updHist = () => { $('#btn-undo').disabled = !App.undoStack.length; $('#btn-redo').disabled = !App.redoStack.length; const l = App.undoStack[App.undoStack.length - 1]; $('#btn-undo').dataset.tip = l ? T('topbar.undoLabel', { label: l.label }) : T('topbar.undo'); };
  App.on('history', updHist); App.on('doc', updHist); updHist();
  const updName = () => {
    document.body.dataset.docType = Model.docType(App.doc);
    const isDef = !App.doc.name || App.doc.name === 'Neues Projekt';
    $('#btn-project').textContent = isDef ? T('start.newProject') : App.doc.name;
    document.title = !isDef ? App.doc.name + ' – Tracery' : 'Tracery';
  };
  const syncBed = () => {
    const pb = App.doc && App.doc.settings && App.doc.settings.printBed;
    Viewer.setPrintBed(pb && pb.enabled ? { ...pb, warn: !Print.fitCheck(pb).fits } : pb);
  };
  App.on('doc', updName); App.on('doc', syncBed);
  $('#btn-level').onclick = () => ViewPrefs.setLevel(ViewPrefs.simple ? 'pro' : 'simple'); ViewPrefs.syncLevel();
  $('#btn-whatis').onclick = () => UI.toggleWhatIs();
  $('#tab-model').onclick = () => Commands.setMode('model');
  $('#tab-drawing').onclick = () => Commands.setMode('drawing');
  $('#brand').onclick = (e) => { e.preventDefault(); Start.show(); };
  I18n.on('change', () => { I18n.applyDom(); ViewPrefs.syncLevel(); Panels.renderTools(); Panels.renderLeft(); Panels.renderRight(); Panels.renderCtx(); Panels.refreshViewCube(); UI.renderHint(); UI.refreshWhatIs(); Measure.updateStatus(); Print.updateAmpel(); Notices.refreshUI(); Timeline.refreshLabels(); Timeline.render(); updHist(); updName(); Start.renderTabs(); Assembly.renderBanner(); if (Motion.active) Motion.render(); if (Sketch.active) Sketch.refreshUI(); if (App.mode === 'drawing') Drawing.refreshUI(); if (Start.open) Start.show(); });
  const projectItems = () => [
    { label: T('menu.proj.rename'), icon: 'edit', run: async () => { const n = await UI.prompt(T('menu.proj.rename'), T('common.name'), App.doc.name, T('common.rename')); if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); }); } },
    { label: T('menu.proj.saveFile'), icon: 'save', kbd: 'Strg S', run: () => Start.saveFile() },
    { id: 'pm-export-bundle', label: T('menu.proj.exportBundle'), icon: 'export', help: 'exportBundle', run: () => Print.exportBundle() },
    ...(Model.isAssembly(App.doc) && (typeof ViewPrefs === 'undefined' || !ViewPrefs.simple) ? [
      { id: 'pm-single-body', label: T('asm.singleBodyShort'), icon: 'cube', help: 'asmSingleBody', run: () => Assembly.singleBodyDialog() },
    ] : []),
    ...(Start.folderSupported() ? (Start.folderInfo() ? [
      { label: T('menu.proj.saveInFolderNow', { name: Start.folderInfo().name }), icon: 'save', id: 'pm-folder-now', help: 'saveFolder', run: () => Start.saveToFolderNow() },
      { label: T('menu.proj.changeFolder'), icon: 'folder', id: 'pm-folder-change', help: 'saveFolder', run: () => Start.saveToFolder() },
      { label: T('menu.proj.disconnectFolder'), icon: 'close', id: 'pm-folder-stop', run: () => Start.disconnectFolder() },
    ] : [
      { label: T('menu.proj.saveToFolder'), icon: 'folder', id: 'pm-folder-save', help: 'saveFolder', run: () => Start.saveToFolder() },
    ]) : []),
    { label: T('menu.proj.openImport'), icon: 'folder', help: 'importCad', run: () => Start.openFile() },
    { label: T('asm.insertFromFile'), icon: 'folder', id: 'pm-insert-file', help: 'insertFromFile', run: () => Comp.insertFromFile() },
    { label: T('menu.proj.versions'), icon: 'rollback', help: 'versions', run: () => Versions.dialog() },
    { label: T('menu.proj.saveTemplate'), icon: 'save', id: 'pm-save-template', help: 'saveTemplate', run: () => Start.saveAsTemplate() },
    '-',
    { label: T('menu.proj.newProject'), icon: 'newfile', id: 'pm-new-project', help: 'projectTemplates', run: () => Start.newProjectDialog() },
    { label: T('start.newAssembly'), icon: 'parts', id: 'pm-new-assembly', help: 'assemblyDoc', run: () => Start.newAssembly() },
    { label: T('menu.proj.startAndTemplates'), icon: 'home', run: () => Start.show() },
  ];
  $('#btn-project').onclick = (e) => UI.menu(e.currentTarget, projectItems(), { alignRight: true });
  const vw = () => (document.documentElement && document.documentElement.clientWidth) || innerWidth;
  const openThirdPartyDialog = () => {
    const libs = Array.isArray(THIRD_PARTY_LIBS) ? THIRD_PARTY_LIBS : [];
    const body = h('div', { id: 'third-party-dialog', class: 'tp-dialog' },
      h('p', null, T('menu.main.thirdPartyIntro')),
      h('div', { class: 'tp-list' }, ...libs.map((lib) => h('div', { class: 'tp-card', 'data-lib-id': lib.id },
        h('div', { class: 'tp-head' },
          h('b', null, lib.version ? `${lib.name} (${lib.version})` : lib.name),
          h('span', { class: 'tp-lic' }, lib.license)),
        h('div', { class: 'tp-desc' }, I18n.lang === 'en' ? (lib.purposeEn || lib.purposeDe) : lib.purposeDe),
        h('div', { class: 'tp-meta' }, lib.author),
        h('div', { class: 'tp-meta mono' }, T('menu.main.thirdPartyPaths', { paths: (lib.paths || []).join(', ') })),
        h('details', { class: 'tp-text' },
          h('summary', null, T('menu.main.licenseText')),
          h('pre', { class: 'tp-pre' }, lib.licenseText)))))
    );
    UI.modal({
      title: T('menu.main.thirdParty'),
      wide: true,
      body,
      actions: [
        { id: 'third-party-back', label: T('menu.main.aboutBack'), run: () => { setTimeout(() => openAboutDialog(), 0); } },
        { label: T('common.close'), primary: true },
      ],
    });
  };
  const openAboutDialog = () => UI.modal({
    title: T('menu.main.about'),
    body: h('div', { style: { display: 'grid', gap: '10px', color: 'var(--muted)', lineHeight: 1.55 } },
      h('p', null, T('menu.main.aboutP1')),
      h('p', null, T('menu.main.aboutP2')),
      h('p', null, T('menu.main.aboutP3')),
      h('p', null, T('menu.main.aboutP4')),
      h('p', { id: 'about-copyright', class: 'about-copyright' }, T('menu.main.aboutCopyright'))),
    actions: [
      { id: 'about-third-party', label: T('menu.main.thirdParty'), help: 'thirdPartyLibs', run: () => { setTimeout(() => openThirdPartyDialog(), 0); } },
      { label: T('common.close'), primary: true },
    ],
  });
  // auf schmalen Bildschirmen ist der Projektname ausgeblendet – dann steht das Projektmenü hier mit drin
  $('#btn-menu').onclick = (e) => UI.menu(e.currentTarget, [
    ...(vw() <= 900 || UI.isTablet() ? [...projectItems(), '-'] : []),
    { label: T('menu.main.tourBasics'), icon: 'play', run: () => Tour.start() },
    { label: T('menu.main.tourSketch'), icon: 'sketch', run: () => Tour.start('sketch') },
    { label: T('menu.main.settings'), icon: 'gear', run: () => ViewPrefs.dialog() },
    { label: T('menu.main.shortcuts'), icon: 'help', run: () => Commands.showKeys() },
    { label: T('menu.main.export'), icon: 'export', run: () => Print.exportDialog() },
    { id: 'mm-export-bundle', label: T('menu.proj.exportBundle'), icon: 'export', help: 'exportBundle', run: () => Print.exportBundle() },
    { label: T('menu.main.saveImage'), icon: 'image', run: () => Print.imageDialog() },
    '-',
    { label: T('menu.main.about'), icon: 'info', run: () => openAboutDialog() },
  ], { alignRight: true });
  $('#btn-workspace').onclick = (e) => Panels.workspaceMenu(e.currentTarget);
  const ws = $('#workspace');
  const setPanels = (side) => {
    const showL = side === 'left', showR = side === 'right';
    ws.classList.toggle('show-left', showL);
    ws.classList.toggle('show-right', showR);
    $('#btn-left').setAttribute('aria-expanded', String(showL));
    $('#btn-right').setAttribute('aria-expanded', String(showR));
  };
  const isNarrow = () => vw() <= 900 || UI.isTablet();
  $('#btn-left').onclick = () => {
    if (isNarrow()) setPanels(ws.classList.contains('show-left') ? null : 'left');
    else Panels.setPanel('left', { open: !Panels.getLayout().left.open });
  };
  $('#btn-right').onclick = () => {
    if (isNarrow()) setPanels(ws.classList.contains('show-right') ? null : 'right');
    else Panels.setPanel('right', { open: !Panels.getLayout().right.open });
  };
  $('#btn-left-close').onclick = () => {
    if (isNarrow()) setPanels(null);
    else Panels.setPanel('left', { open: false });
  };
  $('#btn-right-close').onclick = () => {
    if (isNarrow()) setPanels(null);
    else Panels.setPanel('right', { open: false });
  };
  $('#center').addEventListener('pointerdown', () => { if (isNarrow()) setPanels(null); });
  App.on('busy', (on) => UI.busy(on));
  App.on('selection', () => { if (innerWidth <= 900 && App.sel.length) { /* rechte Leiste nicht aufzwingen */ } });
  window.addEventListener('beforeunload', () => {
    if (Start.flushRecovery) Start.flushRecovery();
    if (App.autosave && App.autosave.flush && !Start.pendingRecovery) App.autosave.flush();
  });

  // Letztes Projekt aus der Browser-Datenbank laden (ggf. aus localStorage übernehmen) oder Startseite zeigen
  updName(); UI.renderHint();
  Kernel.on('state', ({ state, progress }) => {
    if (state === 'loading') UI.busy(true, progress > 0.84 ? T('status.kernelStarting') : T('status.kernelWillLoad'));
    else if (state === 'ready') { if (App.busy) UI.busy(true, T('status.calcBusy')); else UI.busy(false); }
    else if (state === 'error') UI.busy(false);
  });
  Kernel.on('ready', (t) => { Log.markKernelReady(t); Print.updateAmpel(); });
  SK.onFont('loaded', (info) => { Log.markFontLoaded(info); });

  (async () => {
    try {
      await Store.init();
      const rec = Start.checkRecoveryOnBoot ? await Start.checkRecoveryOnBoot() : null;
      if (rec) {
        let baseLoaded = false;
        if (rec.baseDoc) {
          try {
            await Store.hydrateDoc(rec.baseDoc);
            App.setDoc(rec.baseDoc, { fit: true, fromBoot: true, noAutosave: true });
            baseLoaded = true;
          } catch (_) { baseLoaded = false; }
        }
        if (!baseLoaded) App.setDoc(Model.newDoc(), { fit: false, fromBoot: true, noAutosave: true });
        updName(); syncBed(); UI.renderHint();
        Start.startRecoveryTracking(baseLoaded ? rec.baseDoc : null);
      } else {
        const savedTabs = Store.getOpenTabs ? Store.getOpenTabs() : { ids: [], activeId: null };
        const loadedDocs = [];
        for (const id of savedTabs.ids || []) {
          try {
            const d = await App.loadStored(id);
            if (d) loadedDocs.push(d);
          } catch (_) {}
        }
        if (loadedDocs.length) {
          App.restoreOpenTabs(loadedDocs, savedTabs.activeId);
          updName(); syncBed(); UI.renderHint();
          Start.startRecoveryTracking(App.doc);
        } else {
          const lastId = Store.getLastId();
          const last = lastId ? await App.loadStored(lastId) : null;
          if (last) { try { App.setDoc(last, { fit: true, fromBoot: true, noAutosave: true }); } catch (_) { App.setDoc(Model.newDoc(), { fit: false, fromBoot: true, noAutosave: true }); } }
          else App.setDoc(Model.newDoc(), { fit: false, fromBoot: true, noAutosave: true });
          updName(); syncBed(); UI.renderHint();
          Start.startRecoveryTracking(last || null);
          if (!last) Start.show();
        }
      }
    } finally {
      Print.updateAmpel();
      Measure.updateStatus();
      Log.markUiReady(performance.now());
      setTimeout(() => PWA.register(), 300);
    }
  })();
})();

