// ================= Werkzeugleiste anpassen & Favoriten (BE-04) =================
const Toolbar = (() => {
  const KEY = 'tracery-werkzeugleiste';
  const DEFAULT_ITEMS = ['body', 'sketch', 'parts', 'measure', 'notes', 'views', 'check', 'export'];

  let items = [...DEFAULT_ITEMS];
  let favs = [];
  let inited = false;
  let openDialogRefresh = null;

  function catalog() {
    return [
      // Grundwerkzeuge
      { id: 'body', group: 'Grundwerkzeuge', domId: 't-body', icon: 'cube', label: T('tool.body'), tip: T('tool.bodyTip'), kbd: 'K', run: (e) => Panels.toggleFlyout('bodies', e.currentTarget) },
      { id: 'sketch', group: 'Grundwerkzeuge', domId: 't-sketch', icon: 'sketch', label: T('tool.sketch'), tip: T('tool.sketchTip'), kbd: 'S', help: 'sketchFace', run: () => Sketch.chooseAndStart() },
      { id: 'parts', group: 'Grundwerkzeuge', domId: 't-parts', icon: 'parts', label: T('tool.parts'), tip: T('tool.partsTip'), kbd: 'B', run: (e) => Panels.toggleFlyout('parts', e.currentTarget) },
      { id: 'measure', group: 'Grundwerkzeuge', domId: 't-measure', icon: 'measure', label: T('tool.measure'), tip: T('tool.measureTip'), kbd: 'M', cls: 'minor pro', help: 'measure', run: () => Measure.toggle() },
      { id: 'notes', group: 'Grundwerkzeuge', domId: 't-notes', icon: 'noteDraw', label: T('tool.notes'), tip: T('tool.notesTip'), kbd: 'N', cls: 'minor pro', run: () => Notes.toggle() },
      { id: 'views', group: 'Grundwerkzeuge', domId: 't-views', icon: 'xray', label: T('tool.views'), tip: T('tool.viewsTip'), cls: 'minor pro', run: (e) => Views.menu(e.currentTarget) },
      { id: 'check', group: 'Grundwerkzeuge', domId: 't-check', icon: 'target', label: T('tool.check'), tip: T('tool.checkTip'), cls: 'minor pro', run: (e) => GeomCheck.menu(e.currentTarget) },
      { id: 'export', group: 'Grundwerkzeuge', domId: 't-export', icon: 'export', label: T('tool.export'), short: T('tool.exportShort'), tip: T('tool.exportTip'), kbd: 'Strg E', cls: 'primary', run: () => Print.exportDialog() },
      // Bearbeiten & Formen
      { id: 'holeWizard', group: T('dlg.tb.grpEdit'), domId: 't-holeWizard', icon: 'holeWizard', label: T('dlg.tb.hole'), tip: T('dlg.tb.holeTip'), cls: 'minor', help: 'holeWizard', run: (e) => Place.holeWizard(e.currentTarget) },
      { id: 'fillet', group: T('dlg.tb.grpEdit'), domId: 't-fillet', icon: 'fillet', label: T('ctx.fillet'), tip: T('dlg.tb.filletTip'), cls: 'minor', help: 'fillet', run: () => { if (App.edges.length) Actions.addFinish('fillet', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1); else UI.toast(T('dlg.tb.needBodyOrEdge'), { icon: 'info' }); } },
      { id: 'chamfer', group: T('dlg.tb.grpEdit'), domId: 't-chamfer', icon: 'chamfer', label: T('ctx.chamfer'), tip: T('dlg.tb.chamferTip'), cls: 'minor', help: 'chamfer', run: () => { if (App.edges.length) Actions.addFinish('chamfer', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'chamfer', 'all', 1); else UI.toast(T('dlg.tb.needBodyOrEdge'), { icon: 'info' }); } },
      { id: 'shell', group: T('dlg.tb.grpEdit'), domId: 't-shell', icon: 'shell', label: T('ctx.shell'), tip: T('dlg.tb.shellTip'), cls: 'minor', help: 'shell', run: () => { const f = Actions.selectedFace(); if (f) Features.shell(f); else UI.toast(T('dlg.tb.needOpenFace'), { icon: 'info' }); } },
      { id: 'patternRect', group: T('dlg.tb.grpEdit'), domId: 't-patternRect', icon: 'patternRect', label: T('ctx.patRect'), tip: T('tool.fly.patRectTip'), cls: 'minor', help: 'patternRect', run: () => Features.pattern('rect') },
      { id: 'patternCirc', group: T('dlg.tb.grpEdit'), domId: 't-patternCirc', icon: 'patternCirc', label: T('ctx.patCirc'), tip: T('tool.fly.patCircTip'), cls: 'minor', help: 'patternCirc', run: () => Features.pattern('circ') },
      { id: 'patternPath', group: T('dlg.tb.grpEdit'), domId: 't-patternPath', icon: 'patternPath', label: T('dlg.tb.patternPath'), tip: T('dlg.tb.patternPathTip'), cls: 'minor', help: 'patternPath', run: () => Features.patternPath() },
      { id: 'mirror', group: T('dlg.tb.grpEdit'), domId: 't-mirror', icon: 'mirror', label: T('ctx.mirror'), tip: T('dlg.tb.mirrorTip'), cls: 'minor', help: 'mirror', run: () => Features.pattern('mirror') },
      { id: 'split', group: T('dlg.tb.grpEdit'), domId: 't-split', icon: 'split', label: T('ctx.split'), tip: T('dlg.tb.splitTip'), cls: 'minor', help: 'split', run: () => Features.split() },
      { id: 'rib', group: T('dlg.tb.grpEdit'), domId: 't-rib', icon: 'rib', label: T('kind.rib'), tip: T('dlg.tb.ribTip'), cls: 'minor', help: 'rib', run: () => Features.startRib() },
      { id: 'route3d', group: T('dlg.tb.grpEdit'), domId: 't-route3d', icon: 'sweep', label: T('tool.fly.route3d'), tip: T('dlg.tb.route3dTip'), cls: 'minor', help: 'route3d', run: () => Features.route3d() },
      { id: 'helix', group: T('dlg.tb.grpEdit'), domId: 't-helix', icon: 'helix', label: T('kind.helix'), tip: T('dlg.tb.helixTip'), cls: 'minor', help: 'helix', run: () => Features.helix() },
      // Konstruktion
      { id: 'datum', group: T('dlg.tb.grpConstruct'), domId: 't-datum', icon: 'originPlanes', label: T('panel.title.datumPlane'), tip: T('dlg.tb.datumTip'), cls: 'minor', help: 'datum', run: (e) => Datums.dialog(e.currentTarget) },
      { id: 'datumAxis', group: T('dlg.tb.grpConstruct'), domId: 't-datumAxis', icon: 'axes', label: T('dlg.tb.datumAxis'), tip: T('dlg.tb.datumAxisTip'), cls: 'minor', help: 'datumAxis', run: (e) => Datums.axisDialog(e.currentTarget) },
      { id: 'datumPoint', group: T('dlg.tb.grpConstruct'), domId: 't-datumPoint', icon: 'point', label: T('dlg.tb.datumPoint'), tip: T('dlg.tb.datumPointTip'), cls: 'minor', help: 'datumPoint', run: (e) => Datums.pointDialog(e.currentTarget) },
      { id: 'fixedJoint', group: T('dlg.tb.grpConstruct'), domId: 't-fixedJoint', icon: 'lock', label: T('ctx.fixedJoint'), tip: T('ctx.fixedJointTip'), cls: 'minor', help: 'fixedJoint', run: () => Joints.startFixed() },
      { id: 'params', group: T('dlg.tb.grpConstruct'), domId: 't-params', icon: 'sliders', label: T('topbar.params'), tip: T('dlg.tb.paramsTip'), cls: 'minor', help: 'params', run: () => Panels.showParams() },
      // Ansicht & Prüfen
      { id: 'section', group: T('dlg.tb.grpViewCheck'), domId: 't-section', icon: 'section', label: T('menu.view.section'), tip: T('dlg.tb.sectionTip'), kbd: 'C', cls: 'minor', help: 'section', run: () => Views.section() },
      { id: 'xray', group: T('dlg.tb.grpViewCheck'), domId: 't-xray', icon: 'xray', label: T('menu.view.xray'), tip: T('dlg.tb.xrayTip'), kbd: 'X', cls: 'minor', help: 'xray', run: () => Views.xray() },
      { id: 'explode', group: T('dlg.tb.grpViewCheck'), domId: 't-explode', icon: 'explode', label: T('menu.view.explode'), tip: T('dlg.tb.explodeTip'), kbd: 'U', cls: 'minor', help: 'explode', run: () => Views.explode() },
      { id: 'fit', group: T('dlg.tb.grpViewCheck'), domId: 't-fit', icon: 'fit', label: T('menu.ctx.fitAll'), tip: T('dlg.tb.fitTip'), kbd: 'F', cls: 'minor', run: () => Viewer.fit(App.sel.length ? App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean) : null) },
      { id: 'weak', group: T('dlg.tb.grpViewCheck'), domId: 't-weak', icon: 'target', label: T('dlg.tb.weak'), tip: T('dlg.tb.weakTip'), cls: 'minor', help: 'weakSpots', run: () => Weak.dialog() },
      { id: 'clashes', group: T('dlg.tb.grpViewCheck'), domId: 't-clashes', icon: 'boolIntersect', label: T('menu.check.clashes'), tip: T('clash.btnTip'), cls: 'minor', help: 'clashCheck', run: () => ClashCheck.open() },
      { id: 'bom', group: T('dlg.tb.grpViewCheck'), domId: 't-bom', icon: 'list', label: T('dlg.tb.bom'), tip: T('dlg.tb.bomTip'), cls: 'minor', help: 'bom', run: () => Mass.bomDialog() },
      // Projekt & Datei
      { id: 'save', group: T('dlg.tb.grpProject'), domId: 't-save', icon: 'save', label: T('common.save'), tip: T('dlg.tb.saveTip'), kbd: 'Strg S', cls: 'minor', run: () => Start.saveFile() },
      { id: 'import', group: T('dlg.tb.grpProject'), domId: 't-import', icon: 'folder', label: T('dlg.tb.import'), tip: T('dlg.tb.importTip'), cls: 'minor', help: 'importCad', run: () => Start.openFile() },
      { id: 'insertFile', group: T('dlg.tb.grpProject'), domId: 't-insert-file-tool', icon: 'folder', label: T('asm.insertFromFileShort'), tip: T('asm.insertFromFileTip'), cls: 'minor', help: 'insertFromFile', run: () => Comp.insertFromFile() },
      { id: 'image', group: T('dlg.tb.grpProject'), domId: 't-image', icon: 'image', label: T('dlg.tb.image'), tip: T('dlg.tb.imageTip'), cls: 'minor', run: () => Print.imageDialog() },
      { id: 'versions', group: T('dlg.tb.grpProject'), domId: 't-versions', icon: 'rollback', label: T('dlg.tb.versions'), tip: T('dlg.tb.versionsTip'), cls: 'minor', help: 'versions', run: () => Versions.dialog() },
    ];
  }

  function catalogMap() {
    return Object.fromEntries(catalog().map((c) => [c.id, c]));
  }

  function uniqValid(list, map) {
    const out = [];
    const seen = new Set();
    for (const id of Array.isArray(list) ? list : []) {
      if (typeof id !== 'string' || seen.has(id) || !map[id]) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function isDefault() {
    return favs.length === 0
      && items.length === DEFAULT_ITEMS.length
      && items.every((id, i) => id === DEFAULT_ITEMS[i]);
  }

  function save() {
    if (isDefault()) storageDel(KEY);
    else storageSet(KEY, JSON.stringify({ items, favs }));
  }

  function load() {
    items = [...DEFAULT_ITEMS];
    favs = [];
    try {
      const raw = storageGet(KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      const map = catalogMap();
      if (Array.isArray(obj.items)) items = uniqValid(obj.items, map);
      favs = uniqValid(obj.favs, map);
      for (const f of favs) {
        if (!items.includes(f)) items.unshift(f);
      }
    } catch (_) {
      items = [...DEFAULT_ITEMS];
      favs = [];
    }
  }

  function isFav(id) {
    return favs.includes(id);
  }

  function orderedItems() {
    const favSet = new Set(favs);
    return [
      ...favs.filter((id) => items.includes(id)),
      ...items.filter((id) => !favSet.has(id)),
    ];
  }

  function getState() {
    return {
      items: orderedItems(),
      favs: favs.slice(),
      default: isDefault(),
    };
  }

  function syncNormalized() {
    items = orderedItems();
    save();
    Panels.renderTools();
    if (openDialogRefresh) openDialogRefresh();
  }

  function add(id, targetId = null, after = false) {
    const map = catalogMap();
    if (!map[id]) return false;
    if (items.includes(id)) return move(id, targetId, after);
    if (targetId && items.includes(targetId)) {
      if (isFav(targetId)) {
        favs.push(id);
        const fi = favs.indexOf(targetId);
        favs.splice(favs.indexOf(id), 1);
        favs.splice(after ? fi + 1 : fi, 0, id);
      }
      const idx = items.indexOf(targetId);
      items.splice(after ? idx + 1 : idx, 0, id);
    } else {
      items.push(id);
    }
    syncNormalized();
    return true;
  }

  function remove(id) {
    const i = items.indexOf(id);
    const fi = favs.indexOf(id);
    if (i < 0 && fi < 0) return false;
    if (i >= 0) items.splice(i, 1);
    if (fi >= 0) favs.splice(fi, 1);
    syncNormalized();
    return true;
  }

  function toggleFav(id) {
    const map = catalogMap();
    if (!map[id]) return false;
    const fi = favs.indexOf(id);
    if (fi >= 0) {
      favs.splice(fi, 1);
    } else {
      if (!items.includes(id)) items.unshift(id);
      favs.push(id);
    }
    syncNormalized();
    return isFav(id);
  }

  function move(id, targetId = null, after = false) {
    const map = catalogMap();
    if (!map[id]) return false;
    if (!items.includes(id)) return add(id, targetId, after);
    if (targetId === id) return false;

    const idFav = isFav(id);
    if (targetId && items.includes(targetId)) {
      const targetFav = isFav(targetId);
      if (idFav && targetFav) {
        favs.splice(favs.indexOf(id), 1);
        const ti = favs.indexOf(targetId);
        favs.splice(after ? ti + 1 : ti, 0, id);
      } else if (!idFav && !targetFav) {
        const rest = items.filter((x) => !isFav(x) && x !== id);
        const ti = rest.indexOf(targetId);
        rest.splice(after ? ti + 1 : ti, 0, id);
        items = [...favs, ...rest];
      } else if (idFav && !targetFav) {
        // Favoriten bleiben immer ganz links: ans Ende der Favoriten schieben
        favs.splice(favs.indexOf(id), 1);
        favs.push(id);
      } else {
        // Nicht-Favorit auf Favoriten gezogen: direkt an den Anfang nach den Favoriten
        const rest = items.filter((x) => !isFav(x) && x !== id);
        rest.unshift(id);
        items = [...favs, ...rest];
      }
    } else {
      if (idFav) {
        favs.splice(favs.indexOf(id), 1);
        favs.push(id);
      } else {
        const rest = items.filter((x) => !isFav(x) && x !== id);
        rest.push(id);
        items = [...favs, ...rest];
      }
    }
    syncNormalized();
    return true;
  }

  function reset(silent = false) {
    items = [...DEFAULT_ITEMS];
    favs = [];
    storageDel(KEY);
    Panels.renderTools();
    if (openDialogRefresh) openDialogRefresh();
    if (!silent) UI.toast(T('dlg.tb.resetToast'), { icon: 'undo', ms: 1800 });
  }

  function setState(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const map = catalogMap();
    items = Array.isArray(obj.items) ? uniqValid(obj.items, map) : [...DEFAULT_ITEMS];
    favs = Array.isArray(obj.favs) ? uniqValid(obj.favs, map) : [];
    for (const f of favs) {
      if (!items.includes(f)) items.unshift(f);
    }
    syncNormalized();
    return true;
  }

  function buildToolButton(def, fav) {
    const cls = ['tool'];
    if (def.cls) cls.push(def.cls);
    if (fav) cls.push('fav');
    const b = h('button', {
      type: 'button',
      class: cls.join(' '),
      id: def.domId || ('t-' + def.id),
      'data-tool-id': def.id,
      'data-tip': def.tip,
      'data-kbd': def.kbd || null,
      'data-help': def.help || null,
      'aria-label': def.label,
    });
    const labelHtml = def.short
      ? `<span class="l-full">${esc(def.label)}</span><span class="l-short">${esc(def.short)}</span>`
      : `<span>${esc(def.label)}</span>`;
    const starHtml = fav ? `<i class="tb-fav-star" aria-hidden="true">${icon('starFill')}</i>` : '';
    b.innerHTML = icon(def.icon) + labelHtml + starHtml;
    b.addEventListener('click', def.run);
    if (def.id === 'measure' && typeof Measure !== 'undefined' && Measure.active) b.classList.add('active');
    if (def.id === 'notes' && typeof Notes !== 'undefined' && Notes.active) b.classList.add('active');
    if (def.id === 'check' && ((typeof GeomCheck !== 'undefined' && GeomCheck.active) || (typeof ClashCheck !== 'undefined' && ClashCheck.active))) b.classList.add('active');
    if (def.id === 'clashes' && typeof ClashCheck !== 'undefined' && ClashCheck.active) b.classList.add('active');
    return b;
  }

  function makeMoreButton() {
    const b = h('button', {
      type: 'button',
      class: 'tool simple-only',
      id: 't-more',
      'data-tip': T('tool.moreTip'),
      'aria-label': T('tool.more'),
    });
    b.innerHTML = icon('menu') + `<span>${esc(T('tool.more'))}</span>`;
    b.addEventListener('click', (e) => UI.menu(e.currentTarget, [
      { label: T('menu.more.measure'), icon: 'measure', kbd: 'M', run: () => Measure.toggle() },
      { label: T('menu.more.notes'), icon: 'noteDraw', kbd: 'N', run: () => Notes.toggle() },
      { label: T('menu.more.views'), icon: 'xray', run: () => Views.menu($('#t-more')) },
      { label: T('menu.more.weakSpots'), icon: 'target', run: () => Weak.dialog() },
      { label: T('menu.check.geom'), icon: 'target', id: 'more-geom-check', help: 'geomCheck', run: () => GeomCheck.open() },
      { label: T('menu.check.clashes'), icon: 'boolIntersect', id: 'more-clash-check', help: 'clashCheck', run: () => ClashCheck.open() },
      '-', { label: T('menu.more.showAllPro'), icon: 'sliders', help: 'levelSwitch', run: () => ViewPrefs.setLevel('pro') },
    ]));
    return b;
  }

  function renderModelTools(el) {
    el.innerHTML = '';
    if (typeof Model !== 'undefined' && Model.isAssembly && typeof App !== 'undefined' && App.doc && Model.isAssembly(App.doc)) {
      const ins = h('button', {
        type: 'button',
        class: 'tool primary',
        id: 't-insert-part',
        'data-tip': T('asm.insertTip'),
        'data-help': 'insertPart',
        'aria-label': T('asm.insertBtn'),
      });
      ins.innerHTML = icon('parts') + `<span>${esc(T('asm.insertBtn'))}</span>`;
      ins.addEventListener('click', () => Comp.insertPartDialog());
      el.append(ins);
      const insFile = h('button', {
        type: 'button',
        class: 'tool minor',
        id: 't-insert-file',
        'data-tip': T('asm.insertFromFileTip'),
        'data-help': 'insertFromFile',
        'aria-label': T('asm.insertFromFile'),
      });
      insFile.innerHTML = icon('folder') + `<span>${esc(T('asm.insertFromFileShort'))}</span>`;
      insFile.addEventListener('click', () => Comp.insertFromFile());
      el.append(insFile);
      const map = catalogMap();
      for (const id of ['clashes', 'measure', 'notes', 'views', 'check']) {
        if (map[id]) el.append(buildToolButton(map[id], false));
      }
      el.append(makeMoreButton());
      el.append(h('div', { class: 'sep' }));
      if (map.export) el.append(buildToolButton(map.export, false));
      if (typeof Views !== 'undefined' && Views.sync) Views.sync();
      if (typeof Commands !== 'undefined' && Commands.syncCmdKbds) Commands.syncCmdKbds();
      return;
    }
    const map = catalogMap();
    const list = orderedItems().filter((id) => !!map[id]);
    const favCount = favs.filter((id) => list.includes(id)).length;
    const nonFavCount = list.length - favCount;
    const expIdx = list.indexOf('export');
    let moreInserted = false;

    list.forEach((id, idx) => {
      const def = map[id];
      const fav = isFav(id);
      if (id === 'export' && !fav && idx > 0) {
        el.append(makeMoreButton());
        moreInserted = true;
        if (!el.lastElementChild || !el.lastElementChild.classList.contains('sep')) {
          el.append(h('div', { class: 'sep' }));
        }
      }
      el.append(buildToolButton(def, fav));
      if (favCount > 0 && nonFavCount > 0 && idx === favCount - 1) {
        el.append(h('div', { class: 'sep tb-fav-sep', 'aria-hidden': 'true' }));
      }
    });

    if (!moreInserted) el.append(makeMoreButton());

    if (!list.length) {
      const emptyBtn = h('button', { type: 'button', class: 'tool', id: 't-empty-customize', 'data-help': 'toolbarCustomize' });
      emptyBtn.innerHTML = icon('sliders') + '<span>Werkzeugleiste anpassen …</span>';
      emptyBtn.onclick = () => dialog();
      el.append(emptyBtn);
    }

    if (typeof Views !== 'undefined' && Views.sync) Views.sync();
    if (typeof Commands !== 'undefined' && Commands.syncCmdKbds) Commands.syncCmdKbds();
  }

  function virtualAnchor(x, y, fallback) {
    if ((x || y) && (x > 0 || y > 0)) {
      return { getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }), contains: () => false };
    }
    return fallback || $('#tools');
  }

  function openContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const toolBtn = e.target.closest && e.target.closest('button.tool[data-tool-id]');
    const toolId = toolBtn ? toolBtn.dataset.toolId : null;
    const anchor = virtualAnchor(e.clientX, e.clientY, toolBtn || $('#tools'));
    const entries = [
      { id: 'cm-tb-customize', label: T('dlg.tb.customizeMenu'), icon: 'sliders', help: 'toolbarCustomize', run: () => dialog() },
    ];
    if (toolId && App.mode === 'model') {
      entries.push(
        '-',
        { id: 'cm-tb-fav', label: isFav(toolId) ? T('dlg.tb.favRemove') : T('dlg.tb.favAdd'), icon: isFav(toolId) ? 'starFill' : 'star', run: () => toggleFav(toolId) },
        { id: 'cm-tb-remove', label: T('dlg.tb.removeFromBar'), icon: 'trash', run: () => remove(toolId) },
      );
    }
    entries.push(
      '-',
      { id: 'cm-tb-reset', label: T('common.reset'), icon: 'undo', disabled: isDefault(), run: () => reset() },
    );
    UI.menu(anchor, entries);
  }

  function dialog() {
    let dragState = null;
    let searchQuery = '';

    const wrap = h('div', { class: 'tb-cust', id: 'tb-dialog' });
    const intro = h('p', { class: 'tb-intro' }, T('dlg.tb.intro'), h('b', null, T('dlg.tb.introFav')), T('dlg.tb.introEnd'));

    const cols = h('div', { class: 'tb-cols' });

    // Linke Spalte: Aktive Werkzeuge
    const colActive = h('div', { class: 'tb-col' });
    const countEl = h('span', { class: 'tb-count', id: 'tb-active-count' });
    const resetBtn = h('button', { type: 'button', class: 'btn small ghost', id: 'tb-reset', 'data-help': 'toolbarCustomize' }, iconEl('undo'), T('common.reset'));
    resetBtn.onclick = () => reset();
    const headActive = h('div', { class: 'tb-col-head' }, h('div', { class: 'tb-col-title' }, h('b', null, T('dlg.tb.inBar')), countEl), resetBtn);
    const activeList = h('div', { class: 'tb-list', id: 'tb-active', role: 'list' });
    colActive.append(headActive, activeList);

    // Rechte Spalte: Verfügbare Werkzeuge
    const colAvail = h('div', { class: 'tb-col' });
    const searchInp = h('input', { type: 'search', id: 'tb-search', class: 'tb-search', placeholder: T('dlg.tb.searchPh'), 'aria-label': T('dlg.tb.searchAria'), autocomplete: 'off', spellcheck: 'false' });
    searchInp.addEventListener('keydown', (e) => e.stopPropagation());
    searchInp.addEventListener('input', () => { searchQuery = searchInp.value; renderLists(); });
    const headAvail = h('div', { class: 'tb-col-head' }, h('div', { class: 'tb-col-title' }, h('b', null, T('dlg.tb.avail'))), searchInp);
    const availList = h('div', { class: 'tb-list', id: 'tb-avail', role: 'list' });
    colAvail.append(headAvail, availList);

    cols.append(colActive, colAvail);
    wrap.append(intro, cols);

    function clearDropVisuals() {
      for (const el of wrap.querySelectorAll('.drop-before, .drop-after, .dragging')) {
        el.classList.remove('drop-before', 'drop-after', 'dragging');
      }
      activeList.classList.remove('drop-over');
      availList.classList.remove('drop-remove');
    }

    function readDrag(e) {
      if (dragState) return dragState;
      try {
        const raw = e.dataTransfer && e.dataTransfer.getData('text/plain');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id) return parsed;
        }
      } catch (_) {}
      return null;
    }

    function makeRow(def, zone, fav) {
      const row = h('div', {
        class: 'tb-row' + (fav ? ' fav' : ''),
        draggable: 'true',
        role: 'listitem',
        'data-tool-id': def.id,
        'data-zone': zone,
      });
      const grip = h('span', { class: 'tb-grip', 'aria-hidden': 'true' });
      grip.innerHTML = icon('grip');
      const ic = h('span', { class: 'tb-ic', 'aria-hidden': 'true' });
      ic.innerHTML = icon(def.icon);
      const name = h('span', { class: 'tb-name' }, def.label);
      row.append(grip, ic, name);

      if (zone === 'active') {
        const starBtn = h('button', {
          type: 'button',
          class: 'tb-star' + (fav ? ' on' : ''),
          'aria-label': fav ? T('dlg.tb.favRemove') : T('dlg.tb.favAdd'),
          'aria-pressed': fav ? 'true' : 'false',
          'data-tip': fav ? T('dlg.tb.favUnpinTip') : T('dlg.tb.favPinTip'),
        });
        starBtn.innerHTML = icon(fav ? 'starFill' : 'star');
        starBtn.onclick = (e) => { e.stopPropagation(); toggleFav(def.id); };

        const delBtn = h('button', {
          type: 'button',
          class: 'tb-del',
          'aria-label': T('dlg.tb.removeFromBar'),
          'data-tip': T('common.remove'),
        });
        delBtn.innerHTML = icon('close');
        delBtn.onclick = (e) => { e.stopPropagation(); remove(def.id); };
        row.append(starBtn, delBtn);
      } else {
        const addBtn = h('button', {
          type: 'button',
          class: 'tb-add',
          'aria-label': T('dlg.tb.addAria'),
          'data-tip': T('common.add'),
        });
        addBtn.innerHTML = icon('plus');
        addBtn.onclick = (e) => { e.stopPropagation(); add(def.id); };
        row.append(addBtn);
      }

      row.addEventListener('dragstart', (e) => {
        if (e.target && e.target.closest && e.target.closest('button')) {
          e.preventDefault();
          return;
        }
        dragState = { id: def.id, zone };
        row.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', JSON.stringify(dragState)); } catch (_) {}
        }
      });

      row.addEventListener('dragend', () => {
        dragState = null;
        clearDropVisuals();
      });

      if (zone === 'active') {
        row.addEventListener('dragover', (e) => {
          const d = readDrag(e);
          if (!d || d.id === def.id) return;
          e.preventDefault();
          e.stopPropagation();
          clearDropVisuals();
          const r = row.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          row.classList.add(after ? 'drop-after' : 'drop-before');
        });
        row.addEventListener('drop', (e) => {
          const d = readDrag(e);
          if (!d || d.id === def.id) return;
          e.preventDefault();
          e.stopPropagation();
          const r = row.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          clearDropVisuals();
          dragState = null;
          if (d.zone === 'avail') add(d.id, def.id, after);
          else move(d.id, def.id, after);
        });
      }

      return row;
    }

    activeList.addEventListener('dragover', (e) => {
      const d = readDrag(e);
      if (!d) return;
      e.preventDefault();
      if (!e.target.closest('.tb-row')) {
        clearDropVisuals();
        activeList.classList.add('drop-over');
      }
    });
    activeList.addEventListener('dragleave', (e) => {
      if (!activeList.contains(e.relatedTarget)) activeList.classList.remove('drop-over');
    });
    activeList.addEventListener('drop', (e) => {
      const d = readDrag(e);
      if (!d) return;
      e.preventDefault();
      clearDropVisuals();
      dragState = null;
      if (d.zone === 'avail') add(d.id, null, false);
      else move(d.id, null, false);
    });

    availList.addEventListener('dragover', (e) => {
      const d = readDrag(e);
      if (!d || d.zone !== 'active') return;
      e.preventDefault();
      clearDropVisuals();
      availList.classList.add('drop-remove');
    });
    availList.addEventListener('dragleave', (e) => {
      if (!availList.contains(e.relatedTarget)) availList.classList.remove('drop-remove');
    });
    availList.addEventListener('drop', (e) => {
      const d = readDrag(e);
      if (!d || d.zone !== 'active') return;
      e.preventDefault();
      clearDropVisuals();
      dragState = null;
      remove(d.id);
    });

    function renderLists() {
      const all = catalog();
      const map = Object.fromEntries(all.map((c) => [c.id, c]));
      const activeIds = orderedItems().filter((id) => !!map[id]);
      const favCount = favs.filter((id) => activeIds.includes(id)).length;

      countEl.textContent = T('dlg.tb.countActive', { n: activeIds.length }) + (favCount ? T('dlg.tb.countFav', { n: favCount, word: favCount === 1 ? T('dlg.tb.favOne') : T('dlg.tb.favMany') }) : '');
      resetBtn.disabled = isDefault();

      activeList.innerHTML = '';
      if (!activeIds.length) {
        activeList.append(h('div', { class: 'tb-empty' }, T('dlg.tb.emptyActive')));
      } else {
        let nonFavStarted = false;
        activeIds.forEach((id) => {
          const fav = isFav(id);
          if (!fav && favCount > 0 && !nonFavStarted) {
            nonFavStarted = true;
            activeList.append(h('div', { class: 'tb-fav-div' }, T('dlg.tb.moreTools')));
          }
          activeList.append(makeRow(map[id], 'active', fav));
        });
      }

      const q = normTxt(searchQuery.trim());
      const activeSet = new Set(activeIds);
      const avail = all.filter((c) => !activeSet.has(c.id) && (!q || normTxt(c.label + ' ' + c.group + ' ' + c.tip).includes(q)));

      availList.innerHTML = '';
      if (!avail.length) {
        availList.append(h('div', { class: 'tb-empty' }, q ? T('dlg.tb.emptyAvailSearch') : T('dlg.tb.emptyAvailAll')));
      } else {
        let lastGroup = null;
        for (const c of avail) {
          if (c.group !== lastGroup) {
            lastGroup = c.group;
            availList.append(h('div', { class: 'tb-group' }, c.group));
          }
          availList.append(makeRow(c, 'avail', false));
        }
      }
    }

    openDialogRefresh = renderLists;
    renderLists();
    UI.modal({
      title: T('dlg.tb.title'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.done'), primary: true }],
      onClose: () => { openDialogRefresh = null; },
    });
  }

  function init() {
    load();
    if (inited) return;
    inited = true;
    const el = $('#tools');
    if (el) el.addEventListener('contextmenu', openContextMenu);
  }

  return {
    init,
    renderModelTools,
    dialog,
    catalog,
    getState,
    setState,
    importState: setState,
    add,
    remove,
    toggleFav,
    move,
    reset,
    isFav,
    isDefault,
    DEFAULT_ITEMS,
  };
})();
