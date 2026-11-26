// ================= Befehle, Eingabezeile, Tastatur =================
const Commands = (() => {
  const C = [];
  const KBD_KEY = 'tracery-kuerzel';
  let customKeys = {};
  const add = (id, label, icon, keys, run, opts = {}) => C.push({ id, label, icon, keys: normTxt(label + ' ' + keys), run, ...opts });

  // Zentrale Tastenkürzel-Tabelle (Reihenfolge je Bereich bestimmt die Anzeige in Einstellungen → Tastenkürzel)
  const SHORTCUTS = [
    // Ansicht
    { id: 'fit', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.fit'); }, def: 'f', run: () => Viewer.fit(App.sel.length ? App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean) : null) },
    { id: 'viewBack', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.viewBack'); }, def: 'shift+z', run: () => { if (!Viewer.viewBack()) UI.toast(T('dlg.keys.noPrevView'), { icon: 'info', ms: 1800 }); } },
    { id: 'present', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.present'); }, def: 'p', run: () => Views.present(!Views.presenting) },
    { id: 'view-front', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.viewFront'); }, def: '1', run: () => Viewer.setView('front') },
    { id: 'view-right', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.viewRight'); }, def: '3', run: () => Viewer.setView('right') },
    { id: 'view-top', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.viewTop'); }, def: '7', run: () => Viewer.setView('top') },
    { id: 'view-iso', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.viewIso'); }, def: '0', run: () => Viewer.setView('iso') },
    { id: 'ortho', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.ortho'); }, def: 'o', run: () => ViewPrefs.toggle('ortho') },
    { id: 'gridtoggle', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.gridtoggle'); }, def: 'g', run: () => ViewPrefs.toggle('gridOn') },
    { id: 'section', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.section'); }, def: 'c', run: () => Views.section() },
    { id: 'xray', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.xray'); }, def: 'x', run: () => Views.xray() },
    { id: 'explode', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.explode'); }, def: 'u', run: () => Views.explode() },
    { id: 'isolate', get group() { return T('dlg.keys.groupView'); }, get label() { return T('kbd.isolate'); }, def: 'i', run: () => { const top = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (top) Comp.toggleIso(top.id); else if (App.iso) App.setIso(null); } },
    // Modell
    { id: 'repeat', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.repeat'); }, def: 'space', run: () => repeat() },
    { id: 'hideSel', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.hideSel'); }, def: 'shift+h', run: () => { if (App.sel.length) Actions.hideSelected(); else Actions.showAll(); } },
    { id: 'invertSel', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.invertSel'); }, def: 'ctrl+shift+i', run: () => Actions.invertSelection() },
    { id: 'dupLinked', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.dupLinked'); }, def: 'ctrl+shift+d', run: () => Actions.duplicateLinked() },
    { id: 'editItem', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.editItem'); }, def: 'e', run: () => { if (App.sel.length !== 1) return false; const f = Model.find(App.doc, App.sel[0]); if (!f) return false; if (f.item.kind === 'ref') Comp.openRef(f.item.id); else if (typeof Assembly !== 'undefined' && Assembly.canOpenInTab(f.item, App.doc)) Assembly.openPartTab(f.item.id); else if (f.item.kind === 'sketch3d') Sketch.edit3d(f.item.id); else if ((f.item.kind === 'extrude' || f.item.kind === 'revolve' || f.item.kind === 'sweep' || f.item.kind === 'rib' || f.item.kind === 'web' || f.item.kind === 'wrap' || f.item.kind === 'emboss' || f.item.kind === 'asmCut') && f.item.p.sketch) Sketch.editItem(f.item.id); else if (f.item.kind === 'group' && App.doc.items.includes(f.item)) Comp.edit(f.item.id); } },
    { id: 'delete', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.delete'); }, def: 'delete', run: () => { if (App.sel.length) Actions.remove(); else return false; } },
    { id: 'hole', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.hole'); }, def: 'h', run: () => { if (App.sel.length) Actions.toggleRole(); else return false; } },
    { id: 'similar', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.similar'); }, def: 'a', run: () => { if (App.sel.length || App.edges.length) Select.similar(); else return false; } },
    { id: 'rot', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.rot'); }, def: 'r', run: () => { if (App.sel.length) Actions.rotate90(null, 'z'); else return false; } },
    { id: 'dup', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.dup'); }, def: 'ctrl+d', run: () => Actions.duplicate() },
    { id: 'copy', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.copy'); }, def: 'ctrl+c', run: () => Clipboard.copyFromShortcut() },
    { id: 'paste', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.paste'); }, def: 'ctrl+v', run: () => Clipboard.pasteFromShortcut() },
    { id: 'group', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.group'); }, def: 'ctrl+g', run: () => Actions.group() },
    { id: 'ungroup', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.ungroup'); }, def: 'ctrl+shift+g', run: () => Actions.ungroup() },
    { id: 'selectAll', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.selectAll'); }, def: 'ctrl+a', run: () => App.select(App.doc.items.filter((x) => !x.hidden && !App.mergedInto(x.id)).map((x) => x.id)) },
    { id: 'paintSelect', get group() { return T('dlg.keys.groupModel'); }, get label() { return T('kbd.paintSelect'); }, def: 'v', run: () => Select.togglePaint() },
    // Werkzeuge
    { id: 'radialMenu', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.radialMenu'); }, def: 'q', run: () => UI.toggleRadial() },
    { id: 'sketch', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.sketch'); }, def: 's', run: () => Sketch.chooseAndStart() },
    { id: 'measure', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.measure'); }, def: 'm', run: () => Measure.toggle() },
    { id: 'notes', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.notes'); }, def: 'n', run: () => Notes.toggle() },
    { id: 'bodies', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.bodies'); }, def: 'k', run: () => Panels.toggleFlyout('bodies', $('#t-body')) },
    { id: 'parts', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.parts'); }, def: 'b', run: () => Panels.toggleFlyout('parts', $('#t-parts')) },
    { id: 'cmdFocus', get group() { return T('dlg.keys.groupTools'); }, get label() { return T('kbd.cmdFocus'); }, def: 'ctrl+k', global: true, run: () => $('#cmd-input').focus() },
    // Dateien und Verlauf
    { id: 'undo', get group() { return T('dlg.keys.groupFiles'); }, get label() { return T('kbd.undo'); }, def: 'ctrl+z', global: true, run: () => App.undo() },
    { id: 'redo', get group() { return T('dlg.keys.groupFiles'); }, get label() { return T('kbd.redo'); }, def: 'ctrl+y', global: true, run: () => App.redo() },
    { id: 'save', get group() { return T('dlg.keys.groupFiles'); }, get label() { return T('kbd.save'); }, def: 'ctrl+s', global: true, run: () => Start.saveFile() },
    { id: 'export', get group() { return T('dlg.keys.groupFiles'); }, get label() { return T('kbd.export'); }, def: 'ctrl+e', global: true, run: () => Print.exportDialog() },
  ];
  const SHORTCUT_MAP = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));
  const CMD_KBD_MAP = {
    sketch: 'sketch', measure: 'measure', notes: 'notes', dupLinked: 'dupLinked',
    hideSel: 'hideSel', showAll: 'hideSel', present: 'present', viewBack: 'viewBack',
    invertSel: 'invertSel', repeat: 'repeat', export: 'export', ortho: 'ortho',
    gridtoggle: 'gridtoggle', section: 'section', xray: 'xray', explode: 'explode',
    isolate: 'isolate', undo: 'undo', redo: 'redo', delete: 'delete', dup: 'dup',
    copy: 'copy', paste: 'paste',
    group: 'group', ungroup: 'ungroup', hole: 'hole', rot: 'rot', fit: 'fit', save: 'save',
    radialMenu: 'radialMenu', paintSelect: 'paintSelect',
  };

  function loadShortcuts() {
    customKeys = {};
    try {
      const raw = storageGet(KBD_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      for (const s of SHORTCUTS) {
        const val = obj[s.id];
        if (typeof val === 'string' && val.trim() && val.trim().toLowerCase() !== s.def) {
          customKeys[s.id] = val.trim().toLowerCase();
        }
      }
    } catch (_) { customKeys = {}; }
  }
  function saveShortcuts() {
    if (Object.keys(customKeys).length) storageSet(KBD_KEY, JSON.stringify(customKeys));
    else storageDel(KBD_KEY);
  }
  function getCombo(id) {
    const s = SHORTCUT_MAP[id];
    return s ? (customKeys[id] || s.def) : '';
  }
  function formatCombo(combo, useMac = false) {
    if (!combo) return '';
    const mac = useMac && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    return combo.split('+').map((part) => {
      if (part === 'ctrl') return mac ? '⌘' : 'Strg';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Umschalt';
      if (part === 'space') return 'Leertaste';
      if (part === 'delete') return 'Entf';
      return part.toUpperCase();
    }).join(' ');
  }
  function keyLabel(id, useMac = false) { return formatCombo(getCombo(id), useMac); }
  function eventToCombo(e) {
    const k0 = e.key || '';
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified', 'Escape', 'Enter', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Insert'].includes(k0)) return null;
    let k = null;
    if (k0 === ' ') k = 'space';
    else if (k0 === 'Delete') k = 'delete';
    else if (/^F([1-9]|1[0-2])$/i.test(k0)) {
      k = k0.toLowerCase();
      if (k === 'f1' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return null;
    } else if (e.altKey && e.code && /^Key([A-Z])$/.test(e.code)) k = e.code.slice(3).toLowerCase();
    else if (e.altKey && e.code && /^Digit([0-9])$/.test(e.code)) k = e.code.slice(5);
    else if (k0.length === 1) k = k0.toLowerCase();
    if (!k) return null;
    if ((k === '?' || k === '/') && !e.ctrlKey && !e.metaKey && !e.altKey) return null;
    const p = [];
    if (e.ctrlKey || e.metaKey) p.push('ctrl');
    if (e.altKey) p.push('alt');
    if (e.shiftKey && (/^[a-z0-9]$/.test(k) || k === 'space' || k === 'delete' || /^f\d+$/.test(k))) p.push('shift');
    p.push(k);
    return p.join('+');
  }
  function syncCmdKbds() {
    for (const c of C) {
      const sid = CMD_KBD_MAP[c.id];
      if (sid) c.kbd = keyLabel(sid);
    }
    const domMap = {
      '#btn-undo': 'undo', '#btn-redo': 'redo', '#t-body': 'bodies', '#t-sketch': 'sketch',
      '#t-parts': 'parts', '#t-measure': 'measure', '#t-notes': 'notes', '#t-export': 'export',
      '.view-btns [data-view="xray"]': 'xray', '.view-btns [data-view="cut"]': 'section',
      '.view-btns [data-view="paint"]': 'paintSelect',
    };
    for (const [sel, sid] of Object.entries(domMap)) {
      const el = document.querySelector(sel);
      if (el) el.dataset.kbd = keyLabel(sid);
    }
  }
  function shortcuts() {
    return SHORTCUTS.map((s) => {
      const combo = getCombo(s.id);
      return { id: s.id, group: s.group, label: s.label, def: s.def, combo, labelKey: formatCombo(combo), custom: combo !== s.def };
    });
  }
  function setShortcut(id, combo) {
    const s = SHORTCUT_MAP[id];
    const c = String(combo || '').trim().toLowerCase();
    if (!s || !c) return { ok: false, reason: 'invalid' };
    const conflict = SHORTCUTS.find((x) => x.id !== id && getCombo(x.id) === c);
    if (conflict) return { ok: false, conflict: { id: conflict.id, label: conflict.label, group: conflict.group } };
    if (c === s.def) delete customKeys[id];
    else customKeys[id] = c;
    saveShortcuts();
    syncCmdKbds();
    return { ok: true, combo: c, labelKey: formatCombo(c) };
  }
  function resetShortcuts() {
    customKeys = {};
    storageDel(KBD_KEY);
    syncCmdKbds();
  }
  function exportShortcuts() {
    return { ...customKeys };
  }
  function importShortcuts(obj) {
    customKeys = {};
    let applied = 0, skipped = 0;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const candidate = {};
      for (const s of SHORTCUTS) {
        const val = obj[s.id];
        if (typeof val === 'string' && val.trim()) {
          candidate[s.id] = val.trim().toLowerCase();
        }
      }
      const used = new Map();
      for (const s of SHORTCUTS) {
        const c = candidate[s.id] || s.def;
        if (!used.has(c)) used.set(c, []);
        used.get(c).push(s.id);
      }
      for (const s of SHORTCUTS) {
        if (!candidate[s.id]) continue;
        const c = candidate[s.id];
        const owners = used.get(c) || [];
        if (owners.length > 1) {
          skipped++;
          continue;
        }
        if (c !== s.def) {
          customKeys[s.id] = c;
          applied++;
        }
      }
    }
    saveShortcuts();
    syncCmdKbds();
    return { applied, skipped };
  }
  function build() {
    C.length = 0;
    for (const k of PRIMITIVE_ORDER) add('add-' + k, KINDS[k].label + ' hinzufügen', 'cube', 'körper form grundkörper ' + ({ box: 'würfel kasten block platte', cylinder: 'rund stab säule scheibe', sphere: 'ball', cone: 'spitze', pyramid: 'spitze', wedge: 'rampe dach schräge', tube: 'röhre ring hohl', torus: 'donut kringel', prism: 'sechseck achteck polygon', hemisphere: 'kuppel halbkugel' }[k] || ''), () => Actions.addPrimitive(k), { group: 'Körper' });
    add('add-hole', 'Loch (Zylinder) hinzufügen', 'hole', 'bohrung loch rund ausschnitt', () => Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }), { group: 'Körper' });
    for (const d of LIB.filter((x) => !x.buy && !x.drone)) {
      add('lib-' + d.lib, d.label + ' hinzufügen', d.icon, 'bauteil ' + d.desc + (d.keys ? ' ' + d.keys : '') + (d.kw ? ' ' + d.kw : ''), () => Actions.addPart(d, libDefaults(d)), {
        group: 'Bauteile',
        ...(d.pro ? { when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple } : {}),
      });
    }
    add('lib-stdScrew-hex', 'Sechskantschraube (ISO 4017) hinzufügen', 'bolt', 'bauteil normteil sechskantschraube schraube m10 m12 m16 m20 m24 din 933 iso 4017', () => Actions.addPart(LIBMAP.stdScrew, { size: 'M10', head: 'hex', length: 30 }, { name: 'Sechskantschraube' }), { group: 'Bauteile' });
    add('mount-pattern', 'Lochbild setzen (Lüfter, Motor, Servo, Platine)', 'mountPattern', 'lochbild bohrbild luefter lüfter 25 30 40 50 60 70 80 92 120 140 motor schrittmotor nema 14 17 23 servo standard mini micro sg90 s3003 mg996 platte platine platinen raspberry pi pi4 rpi zero pico arduino uno nano esp32 devkit feather bi-16 bi-17', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.mountPattern(f); else Features.startMountPattern(); }, { group: 'Bauteile' });
    add('enclosure-gen', 'Gehäuse-Generator (Kasten mit Deckel)', 'enclosure', 'gehaeuse gehäuse generator kasten deckel box lippe nut schraubdom schraubdome schnapphaken rasten lueftung lüftung schlitze kabel kabeldurchfuehrung kabeldurchführung zugentlastung lasche elektronik bi-20 bi-21', () => Enclosure.openDialog(), { group: 'Bauteile' });
    add('port-cutout', 'Ausschnitt für Stecker, Schalter oder Display', 'portCutout', 'ausschnitt stecker buchse usb usb-c usbc usba micro-usb hdmi mini-hdmi micro-hdmi klinke audio rj45 lan ethernet sd microsd schalter wippschalter kippschalter taster drucktaster display oled lcd 1602 2004 gehäuse wand bi-18', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.portCutout(f); else Features.startPortCutout(); }, { group: 'Bauteile' });
    add('magnet-pocket', 'Magnet-Tasche in Fläche schneiden', 'magnetPocket', 'magnet tasche magnet-tasche magnettasche scheibenmagnet quadermagnet neodym spiel einbetten vertiefung bi-15', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.magnetPocket(f); else Features.startMagnetPocket(); }, { group: 'Bauteile' });
    add('sketch', 'Skizze zeichnen', 'sketch', 'zeichnen 2d profil umriss extrudieren', () => Sketch.chooseAndStart(), { group: 'Werkzeuge', kbd: 'S' });
    add('sketch-check', 'Skizze prüfen (Lücken und doppelte Linien)', 'target', 'skizze prüfen pruefer lücke lücken offen doppelt reparieren fehler', () => { if (Sketch.active) Sketch.check(); else UI.toast('Öffne zuerst eine Skizze, um sie zu prüfen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-autodef', 'Skizze fertig bestimmen (Regeln & Maße vorschlagen)', 'lock', 'skizze fertig bestimmen voll bestimmt regeln masse auto', () => { if (Sketch.active) Sketch.autoDefine(); else UI.toast('Öffne zuerst eine Skizze, um sie fertig zu bestimmen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-free', 'Freie Stellen zeigen (Wo fehlt ein Maß?)', 'unlock', 'skizze freie stellen wackeln freiheit fehlt maß unterbestimmt', () => { if (Sketch.active) Sketch.toggleFreeSpots(); else UI.toast('Öffne zuerst eine Skizze, um freie Stellen zu sehen.', { icon: 'info' }); }, { group: 'Werkzeuge', kbd: 'Umschalt F' });
    add('sketch-lock', 'Skizze sperren / entsperren', 'lock', 'skizze sperren schloss fixieren schützen nicht verschieben entsperren', () => { if (Sketch.active) Sketch.toggleLocked(); else UI.toast('Öffne zuerst eine Skizze, um sie zu sperren.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-ellarc', 'Elliptischer Bogen (Teil-Ellipse)', 'ellipseArc', 'skizze teil-ellipse elliptischer bogen halbachse', () => { if (Sketch.active) Sketch.setTool('ellarc'); else UI.toast('Öffne zuerst eine Skizze, um einen elliptischen Bogen zu zeichnen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-shapes', 'Formen-Sammlung (Stern, Pfeil, Herz, Zahnrad, Schlüsselloch)', 'star', 'skizze formen sammlung stern pfeil herz zahnrad schluesselloch', () => { if (Sketch.active) Sketch.setTool('shape'); else UI.toast('Öffne zuerst eine Skizze, um Formen einzufügen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-formula', 'Kurve aus Formel (y = f(x) oder x(t), y(t))', 'spline', 'skizze kurve formel funktion sinus evolvente parametrisch gleichung', () => { if (Sketch.active) Sketch.openFormulaPanel(); else UI.toast('Öffne zuerst eine Skizze, um eine Kurve aus einer Formel anzulegen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-csv', 'Kurve aus Tabelle (CSV-Punkte)', 'spline', 'skizze kurve tabelle csv punkte importieren spline linienzug', () => { if (Sketch.active) Sketch.openCsvPanel(); else UI.toast('Öffne zuerst eine Skizze, um Punkte aus einer CSV-Datei einzulesen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-curvature', 'Krümmungskamm ein-/ausblenden (Profi)', 'cCurvature', 'skizze kruemmung krümmungskamm kamm spline bogen glatt g2 pruefen', () => { if (Sketch.active) Sketch.toggleCurvature(); else UI.toast('Öffne zuerst eine Skizze, um den Krümmungskamm zu sehen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-g2', 'Regel „Krümmungsglatt (G2)“ (Profi)', 'cCurvature', 'skizze regel kruemmungsglatt krümmungsglatt g2 spline bogen uebergang glatt', () => { if (Sketch.active) Sketch.setTool('c:curvature'); else UI.toast('Öffne zuerst eine Skizze, um die Regel „Krümmungsglatt (G2)“ anzuwenden.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-stretch', 'Skizze strecken (Teil im Rahmen verschieben)', 'stretch', 'skizze strecken verlängern verlaengern rahmen teil verschieben sk-30', () => { if (Sketch.active) Sketch.setTool('stretch'); else UI.toast('Öffne zuerst eine Skizze, um einen Bereich zu strecken.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-live-mirror', 'Live-Spiegeln an einer Linie ein-/ausschalten', 'cSymmetric', 'skizze live spiegeln live-spiegeln symmetrisch symmetrie achse linie sk-46', () => { if (Sketch.active) Sketch.toggleLiveMirror(); else UI.toast('Öffne zuerst eine Skizze, um Live-Spiegeln zu nutzen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-silhouette', 'Umriss (Silhouette) eines Körpers holen (Profi)', 'silhouette2d', 'skizze umriss silhouette schattenriss projizieren koerper sk-42', () => { if (Sketch.active) Sketch.setTool('silhouette'); else UI.toast('Öffne zuerst eine Skizze, um einen Umriss zu holen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-intersect', 'Schnittkurve zweier Flächen holen (Profi)', 'intersectCurve', 'skizze schnittkurve schneiden flaechen durchdringung kurve sk-43', () => { if (Sketch.active) Sketch.setTool('intersect'); else UI.toast('Öffne zuerst eine Skizze, um eine Schnittkurve zu holen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-patcurve', 'Muster entlang Kurve (Skizze)', 'patternPath', 'skizze muster kurve bogen pfad spline kreis anzahl abstand sk-44', () => { if (Sketch.active) Sketch.setTool('patcurve'); else UI.toast('Öffne zuerst eine Skizze, um ein Kurvenmuster anzulegen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-patfill', 'Füllmuster in der Skizze (Raster, Versetzt, Waben)', 'patternFill', 'skizze fuellmuster füllmuster waben raster versetzt loecher löcher randabstand sk-45', () => { if (Sketch.active) Sketch.setTool('patfill'); else UI.toast('Öffne zuerst eine Skizze, um eine Fläche mit Löchern zu füllen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-conic', 'Kegelschnitt (Parabel, Ellipse, Hyperbel mit Rho)', 'conic', 'skizze kegelschnitt conic rho parabel hyperbel ellipse schulterpunkt sk-36', () => { if (Sketch.active) Sketch.setTool('conic'); else UI.toast('Öffne zuerst eine Skizze, um einen Kegelschnitt zu zeichnen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-bridge', 'Brückenkurve (weicher Übergang zwischen zwei Kurvenenden)', 'bridge', 'skizze brueckenkurve brückenkurve bruecke brücke uebergang übergang tangential kruemmungsglatt g1 g2 sk-40', () => { if (Sketch.active) Sketch.setTool('bridge'); else UI.toast('Öffne zuerst eine Skizze, um eine Brückenkurve zu zeichnen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-block', 'Skizzen-Block einfügen oder verwalten', 'sketchBlock', 'skizze block bloecke blöcke komponente mehrfach einsetzen sk-31', () => { if (Sketch.active) Sketch.setTool('block'); else UI.toast('Öffne zuerst eine Skizze, um einen Block einzusetzen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-make-block', 'Auswahl als Skizzen-Block speichern', 'sketchBlock', 'skizze block erstellen speichern auswahl sk-31', () => { if (Sketch.active) Sketch.createBlock(); else UI.toast('Öffne zuerst eine Skizze und wähle Elemente aus.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-polar-grid', 'Polares Raster ein-/ausschalten (Profi)', 'target', 'skizze polar raster ringe strahlen winkel sk-52', () => { if (Sketch.active) Sketch.togglePolarGrid(); else UI.toast('Öffne zuerst eine Skizze, um das polare Raster umzuschalten.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-guides-clear', 'Alle Skizzen-Hilfslinien entfernen (Profi)', 'ruler', 'skizze hilfslinien lineal guides entfernen loeschen sk-52', () => { if (Sketch.active) Sketch.clearGuides(); else UI.toast('Öffne zuerst eine Skizze, um Hilfslinien zu entfernen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('hole-wizard', 'Bohrungs-Assistent', 'holeWizard', 'bohrung loch schraube gewinde senkung einsatz mutter sackloch bohrspitze passbohrung h7 zentrierbohrung feingewinde zoll unc unf rohrgewinde', () => Place.holeWizard($('#t-parts')), { group: 'Bearbeiten' });
    add('cosmetic-thread', 'Gewinde markieren (kosmetisch)', 'thread', 'gewinde kosmetisch markieren metrisch m3 m4 m5 m6 m8 echt schraube', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'CYLINDRE') Features.threadPop(f, $('#center')); else UI.toast('Klick zuerst eine runde Fläche (Zylinder) an, um dort ein Gewinde zu markieren.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('thread-face', 'Gewinde auf runde Fläche …', 'thread', 'gewinde bolzen bohrung zylinder aussengewinde innengewinde steigung metrisch echt kosmetisch m10', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'CYLINDRE') Features.threadPop(f, $('#center'), { mode: 'real' }); else UI.toast('Klick zuerst eine runde Fläche (Bolzen oder Bohrung) an, um dort ein Gewinde zu setzen.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('undercut', 'Gewinde-Freistich (DIN 76-1)', 'undercut', 'freistich gewinde din 76 auslauf welle bolzen form a b kp-48', () => Features.startUndercut(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('circlip-groove', 'Einstich für Sicherungsring (DIN 471 / 472)', 'circlipGroove', 'einstich sicherungsring seegerring din 471 din 472 nut welle bohrung kp-48', () => Features.startCirclipGroove(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('keyway-step', 'Passfeder-Nut auf Welle / Nabe (DIN 6885)', 'keyway', 'passfeder nut passfedernut din 6885 welle nabe rundstirnig kp-49', () => Features.startKeyway(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('spline-profile', 'Keilwellen-Profil auf Welle / Bohrung (DIN ISO 14)', 'splineShaft', 'keilwelle keilwellen profil din iso 14 welle bohrung verzahnung kp-49', () => Features.startSplineProfile(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('knurl', 'Rändel auf Zylindermantel (gerade, gekreuzt, schräg)', 'knurl', 'raendel rändel kreuzraendel kreuzrändel knurl griff zylinder teilung din 82 kp-50', () => Features.startKnurl(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('grip-pattern', 'Griffmuster auf Fläche oder Zylinder (Rillen, Noppen)', 'gripPattern', 'griffmuster grip rillen noppen profil rutschfest griffig flaeche fläche zylinder kp-50', () => Features.startGripPattern(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('spline-shaft', 'Normteil: Keilwelle (DIN ISO 14) einfügen', 'splineShaft', 'keilwelle normteil din iso 14 profil welle bauteil kp-49', () => { if (LIBMAP.splineShaft) Actions.addPart(LIBMAP.splineShaft, libDefaults(LIBMAP.splineShaft)); }, { group: 'Hinzufügen', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('pattern-rect', 'Rechteckmuster', 'patternRect', 'muster reihe raster kopien vervielfachen', () => Features.pattern('rect'), { group: 'Bearbeiten' });
    add('pattern-circ', 'Kreismuster', 'patternCirc', 'muster kreis rund kopien löcher', () => Features.pattern('circ'), { group: 'Bearbeiten' });
    add('pattern-path', 'Muster entlang Kurve', 'patternPath', 'muster kurve pfad bogen entlang linie spline kette kopien löcher zähne', () => Features.patternPath(), { group: 'Bearbeiten' });
    add('pattern-points', 'Muster an Skizzenpunkten', 'point', 'muster skizzenpunkte punkte punkt bohrung loch kopien kp-45', () => Features.patternPoints(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('pattern-table', 'Muster aus Tabelle (CSV)', 'list', 'muster tabelle csv koordinaten x y z drehung kopien kp-45', () => Features.patternTable(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('fill-pattern', 'Füllmuster auf ebener Fläche (Löcher, Waben)', 'patternFill', 'fuellmuster füllmuster waben raster versetzt loecher löcher flaeche randabstand kp-44', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.fillPattern(f); else Features.startFillPattern(); }, { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('mirror-copy', 'Gespiegelte Kopie', 'mirror', 'spiegeln kopie symmetrisch', () => Features.pattern('mirror'), { group: 'Bearbeiten' });
    add('mirror-step', 'Schritt spiegeln (Formschritt im selben Körper)', 'mirror', 'spiegeln schritt formschritt tasche loch rippe symmetrisch ebene fläche körper', () => Features.mirrorStep(), { group: 'Bearbeiten' });
    add('split', 'Körper teilen', 'split', 'teilen schneiden trennen hälfte', () => Features.split(), { group: 'Bearbeiten' });
    add('split-face-tool', 'Körper an Fläche teilen (Profi)', 'split', 'teilen schneiden flaeche fläche bezugsebene gebogen kp-47', () => Features.splitWithFace(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('split-sketch', 'Körper mit Skizze teilen (Profi)', 'split', 'teilen schneiden skizze kurve bogen spline kp-47', () => Features.startSplitSketch(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('move-step', 'Verschieben/Drehen als Schritt', 'moveStep', 'verschieben drehen kopieren schritt transform versetzen bewegen lage verlauf', () => Features.transform(), { group: 'Bearbeiten' });
    add('scale-body', 'Körper skalieren (als Schritt)', 'scaleBody', 'skalieren groesser kleiner faktor achse strecken stauchen verlauf', () => Features.scale(), { group: 'Bearbeiten' });
    add('deform-body', 'Körper verformen (Biegen, Verdrehen, Verjüngen)', 'deform', 'verformen biegen verdrehen verjuengen verjüngen bogen torsion konisch schritt profi', () => Features.deform(), { group: 'Bearbeiten' });
    add('delete-body', 'Körper als Schritt löschen', 'deleteBody', 'koerper loeschen entfernen schritt verlauf unterdruecken rueckgaengig', () => Features.deleteBody(), { group: 'Bearbeiten' });
    add('thicken-face', 'Fläche aufdicken (als Schritt)', 'thicken', 'aufdicken flaeche platte dicke schale wand aussen innen mittig verlauf', () => { const f = Actions.selectedFace(); if (f) Features.thicken(f); else UI.toast('Klick zuerst eine Fläche an, die aufgedickt werden soll.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('bool-sub', 'Abziehen (Boolesch)', 'boolSubtract', 'boolesch abziehen differenz', () => Features.boolean('subtract'), { group: 'Bearbeiten' });
    add('bool-int', 'Schnittmenge (Boolesch)', 'boolIntersect', 'boolesch schnittmenge', () => Features.boolean('intersect'), { group: 'Bearbeiten' });
    add('shell', 'Aushöhlen / Wandstärke', 'shell', 'wandstärke aushöhlen schale hohl gehäuse', () => { const f = Actions.selectedFace(); if (f) Features.shell(f); else UI.toast('Klick zuerst die Fläche an, die offen sein soll.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('rib', 'Rippe anlegen (Versteifung aus Linie)', 'rib', 'rippe steg versteifung schräge gehäuse schale wand', () => Features.startRib(), { group: 'Bearbeiten' });
    add('boss', 'Schraubdom auf Fläche setzen (mit Rippen)', 'boss', 'schraubdom dom boss rippen bohrung befestigung gehaeuse gewindedom stuetzrippen', () => Features.startBoss(), { group: 'Bearbeiten' });
    add('lip-groove', 'Lippe und Nut für Gehäusehälften', 'lipGroove', 'lippe nut feder gehaeuse haelften trennkante spiel spalt rand stufe deckel', () => Features.startLipGroove(), { group: 'Bearbeiten' });
    add('vent', 'Lüftungsgitter in Fläche schneiden', 'vent', 'lueftungsgitter lüftungsgitter gitter schlitze schlitz luft kühlluft gehäuse flaeche rahmen winkel', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.vent(f); else Features.startVent(); }, { group: 'Bearbeiten' });
    add('fins', 'Kühlrippen auf Fläche setzen', 'fins', 'kuehlrippen kühlrippen rippen kühlung kühlkörper flaeche schräge', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.fins(f); else Features.startFins(); }, { group: 'Bearbeiten' });
    add('web', 'Steg-Netz aus Skizze (viele Rippen)', 'web', 'steg stegnetz steg-netz rippen rippennetz kreuz gitter schale versteifung skizze', () => Features.startWeb(), { group: 'Bearbeiten' });
    add('wrap-cyl', 'Um Zylinder wickeln (Prägung oder Linie)', 'wrap', 'wickeln zylinder prägen prägung erhaben vertieft gravieren linie kurve mantel abwickeln', () => Features.startWrap(), { group: 'Bearbeiten' });
    add('emboss', 'Prägen auf Fläche (Text / Logo)', 'emboss', 'praegen prägen text logo gravur gravieren erhaben vertieft zylinder kugel flaeche gewölbt emboss deboss', () => { const f = Actions.selectedFace(); if (f) Features.startEmboss(f); else UI.toast('Klick zuerst eine Fläche an (z. B. einen Zylindermantel oder eine Kugel).', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('split-face', 'Fläche teilen (Kurve auf Fläche projizieren)', 'splitFace', 'flaeche fläche teilen projizieren kurve kreis linie trennen farbe zylinder kugel kp-35', () => Features.startSplitFace(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('dome', 'Kuppel auf ebener Fläche', 'dome', 'kuppel wölbung dom haube rundung flaeche höhe höhe kugelkappe kp-36', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Features.dome(f); else Features.startDome(); }, { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('reffix', 'Kaputten Bezug neu wählen', 'warn', 'kaputt bezug neu wählen kante fläche warnung gelb rundung fase skizze', () => {
      const selIssue = App.sel.length ? RefFix.issuesOf(App.sel[0])[0] : null;
      const iss = selIssue || RefFix.allIssues()[0];
      if (iss) RefFix.start(iss);
      else UI.toast('Alle Bezüge sind in Ordnung.', { icon: 'check' });
    }, { group: 'Bearbeiten' });
    add('measure', 'Messen', 'measure', 'abstand länge durchmesser lineal', () => Measure.toggle(), { group: 'Werkzeuge', kbd: 'M' });
    add('pmi-dim', '3D-Maß mit Toleranz am Modell setzen (PMI)', 'dim', 'pmi 3d maß toleranz abmaß passung modell ze-35', () => Measure.pmiStart('dim'), { group: 'Werkzeuge', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('pmi-note', '3D-Hinweis am Modell setzen (PMI)', 'noteText', 'pmi 3d hinweis notiz modell kommentar ze-35', () => Measure.pmiStart('note'), { group: 'Werkzeuge', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('pmi-toggle-vis', '3D-Maße & Hinweise (PMI) ein- oder ausblenden', 'eye', 'pmi 3d maße hinweise zeigen verstecken ausblenden einblenden ze-35', () => Measure.togglePmiVisible(), { group: 'Ansicht', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('notes', 'Notizstift', 'noteDraw', 'notiz stift malen zeichnen kritzeln text markieren hinweis', () => Notes.toggle(), { group: 'Werkzeuge', kbd: 'N' });
    add('comment-pin', 'Kommentar-Pin setzen', 'commentPin', 'kommentar pin stecknadel markierung erledigt notiz be-28', () => Notes.startPin(), { group: 'Werkzeuge' });
    add('comment-pins-list', 'Kommentar-Pins anzeigen (Liste)', 'list', 'kommentar pin liste notizen aufgaben erledigt be-28', () => Notes.pinsDialog(), { group: 'Werkzeuge' });
    add('notes-show', 'Notizen ein- oder ausblenden', 'notesShow', 'notizen zeigen verstecken ausblenden', () => ViewPrefs.toggle('notes'), { group: 'Ansicht' });
    add('workspace-save', 'Arbeitsfläche speichern', 'layout', 'arbeitsflaeche arbeitsfläche layout panels speichern ansicht be-29', () => Panels.promptSaveWorkspace(), { group: 'Ansicht' });
    add('workspace-manage', 'Arbeitsflächen-Anordnung verwalten', 'layout', 'arbeitsflaeche arbeitsfläche layout panels breite seite wechseln be-29', () => Panels.workspaceDialog(), { group: 'Ansicht' });
    add('workspace-swap', 'Panel-Seiten tauschen (Links ↔ Rechts)', 'layout', 'panels seite tauschen links rechts arbeitsflaeche be-29', () => Panels.swapSides(), { group: 'Ansicht' });
    add('bom', 'Stückliste (alle Teile mit Anzahl und Gewicht)', 'list', 'stückliste teileliste bom einkaufsliste gewicht tabelle csv', () => Mass.bomDialog(), { group: 'Werkzeuge' });
    add('dupLinked', 'Verknüpft duplizieren', 'copy', 'verknüpft kopie duplizieren instanz mehrfach gleich original folgt', () => Actions.duplicateLinked(), { group: 'Werkzeuge', kbd: 'Strg Umschalt D' });
    add('hideSel', 'Ausgewählte ausblenden', 'eyeOff', 'ausblenden verstecken unsichtbar', () => Actions.hideSelected(), { group: 'Ansicht', kbd: 'Umschalt H' });
    add('showAll', 'Alles einblenden', 'eye', 'einblenden zeigen sichtbar alle', () => Actions.showAll(), { group: 'Ansicht', kbd: 'Umschalt H' });
    add('turntable', 'Drehteller-Video speichern', 'play', 'video drehteller film webm animation präsentation', () => Print.turntableDialog(), { group: 'Ansicht' });
    add('present', 'Vorführen (Vollbild)', 'play', 'vorführen präsentieren vollbild zeigen drehteller', () => Views.present(true), { group: 'Ansicht', kbd: 'P' });
    add('viewBack', 'Vorige Ansicht', 'undo', 'ansicht zurück vorige kamera blick', () => Viewer.viewBack(), { group: 'Ansicht', kbd: 'Umschalt Z' });
    add('invertSel', 'Auswahl umkehren', 'pointer', 'auswahl umkehren invertieren andere', () => Actions.invertSelection(), { group: 'Ansicht', kbd: 'Strg Umschalt I' });
    add('repeat', 'Letzten Befehl wiederholen', 'undo', 'wiederholen nochmal letzter befehl', () => repeat(), { group: 'Werkzeuge', kbd: 'Leertaste' });
    add('datum', 'Bezugsebene anlegen', 'originPlanes', 'bezugsebene ebene konstruktionsebene arbeitsebene abstand versetzt schräg winkel kante', () => Datums.dialog(), { group: 'Werkzeuge' });
    add('datum-series', 'Ebenen-Schar anlegen (mehrere Ebenen im gleichen Abstand)', 'originPlanes', 'ebenen schar reihe mehrfach parallel bezugsebene abstand', () => Datums.seriesDialog(), { group: 'Werkzeuge' });
    add('datum-edge-angle', 'Bezugsebene im Winkel an Kante', 'originPlanes', 'bezugsebene ebene kante winkel schräg geneigt', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; Datums.startEdgeAnglePick(30, e); }, { group: 'Werkzeuge' });
    add('datum-tangent', 'Bezugsebene tangential an Rundung', 'originPlanes', 'bezugsebene ebene tangential zylinder kegel rundung mantel', () => { const f = Actions.selectedFace(); Datums.startTangentPick(f && (f.info.t === 'CYLINDRE' || f.info.t === 'CONE') ? f : null); }, { group: 'Werkzeuge' });
    add('datum-normal-curve', 'Bezugsebene senkrecht zu Kante oder Kurve', 'originPlanes', 'bezugsebene ebene senkrecht kante kurve bogen pfad prozent mitte', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; Datums.startNormalCurvePick('mid', 50, e); }, { group: 'Werkzeuge' });
    add('datum-edge-point', 'Bezugsebene durch Kante und Punkt', 'originPlanes', 'bezugsebene ebene kante punkt ecke', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; Datums.startEdgePointPick(e); }, { group: 'Werkzeuge' });
    add('datum-two-edges', 'Bezugsebene durch zwei Kanten', 'originPlanes', 'bezugsebene ebene zwei kanten parallel schneidend', () => { if (App.edges && App.edges.length === 2) Datums.addTwoEdges(App.edges[0], App.edges[1]); else Datums.startTwoEdgesPick(App.edges && App.edges.length === 1 ? App.edges[0] : null); }, { group: 'Werkzeuge' });
    add('datum-axis', 'Bezugsachse anlegen', 'axes', 'bezugsachse achse hilfsachse mittellinie zylinder punkte', () => Datums.axisDialog(), { group: 'Werkzeuge' });
    add('datum-axis-2p', 'Bezugsachse durch zwei Punkte', 'axes', 'bezugsachse achse zwei punkte linie', () => Datums.startAxisPick('twoPoints'), { group: 'Werkzeuge' });
    add('datum-axis-round', 'Bezugsachse durch Mitte einer Rundung', 'axes', 'bezugsachse achse zylinder rundung loch kreis mitte', () => { const f = Actions.selectedFace(); if (f && Array.isArray(f.info.axis) && f.info.axis.length >= 6) Datums.addAxisFromFace(f); else Datums.startAxisPick('roundFace'); }, { group: 'Werkzeuge' });
    add('datum-axis-normal', 'Bezugsachse senkrecht auf Fläche', 'axes', 'bezugsachse achse senkrecht normale fläche punkt', () => Datums.startAxisPick('faceNormal'), { group: 'Werkzeuge' });
    add('datum-point', 'Bezugspunkt anlegen', 'point', 'bezugspunkt punkt kantenmitte flächenmitte schnittpunkt kurve prozent', () => Datums.pointDialog(), { group: 'Werkzeuge' });
    add('datum-point-edge-mid', 'Bezugspunkt: Kantenmitte', 'point', 'bezugspunkt punkt kante mitte kantenmitte', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; if (e) Datums.addPointEdgeMid(e); else Datums.startPointPick('edgeMid'); }, { group: 'Werkzeuge' });
    add('datum-point-face-center', 'Bezugspunkt: Flächenmitte', 'point', 'bezugspunkt punkt fläche mitte flächenmitte', () => { const f = Actions.selectedFace(); if (f) Datums.addPointFaceCenter(f); else Datums.startPointPick('faceCenter'); }, { group: 'Werkzeuge' });
    add('datum-point-edge-plane', 'Bezugspunkt: Schnittpunkt Kante und Ebene', 'point', 'bezugspunkt punkt schnittpunkt kante ebene fläche', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; Datums.startPointPick('edgePlaneIntersect', { preEdge: e }); }, { group: 'Werkzeuge' });
    add('datum-point-curve-pct', 'Bezugspunkt: auf Kurve bei x %', 'point', 'bezugspunkt punkt kurve kante prozent anteil entlang', () => { const e = App.edges && App.edges.length === 1 ? App.edges[0] : null; if (e) Datums.addPointOnCurve(e, 50); else Datums.startPointPick('curvePercent', { percent: 50 }); }, { group: 'Werkzeuge' });
    add('datum-point-com', 'Bezugspunkt: Schwerpunkt eines Körpers', 'point', 'bezugspunkt punkt schwerpunkt mitte masse zentrum cog com', () => { const id = App.sel.length === 1 ? App.sel[0] : null; const f = id ? Model.find(App.doc, id) : null; if (f && f.item.role !== 'hole') Datums.addPointCenterOfMass(id); else Datums.startPointPick('centerOfMass'); }, { group: 'Werkzeuge' });
    add('datum-csys', 'Eigenes Koordinatensystem anlegen', 'axes', 'koordinatensystem nullpunkt ursprung achsen export step stl 3mf', () => Datums.csysDialog(), { group: 'Werkzeuge' });
    add('image', 'Bild speichern (PNG)', 'image', 'bild png foto screenshot rendering präsentation hintergrund durchsichtig', () => Print.imageDialog(), { group: 'Werkzeuge' });
    add('export', 'Exportieren (STEP, IGES, BREP, STL, 3MF, OBJ, GLB, AMF, PLY, DXF)', 'export', 'step igs iges brep stl 3mf obj mtl glb gltf amf ply dxf platten fräse laser exportieren speichern download', () => Print.exportDialog(), { group: 'Werkzeuge', kbd: 'Strg E' });
    add('export-bundle', 'Alles als Paket speichern (ZIP: Projekt, PDF, STEP, STL)', 'export', 'paket alles zip komplett projekt zeichnung pdf step stl sichern exportieren io-18', () => Print.exportBundle(), { group: 'Werkzeuge' });
    add('printer-settings', '3D-Drucker und Loch-Ausgleich einstellen', 'printer', 'drucker bauraum bambu a1 p1s x1c prusa mk4 mini ender voron loch ausgleich 3d-druck passung lose gleitend fest presssitz duese wandstaerke', () => { Commands.setMode('model'); App.clearSelection(); setTimeout(() => { const el = $('#proj-printer'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }, 60); }, { group: 'Projekt' });
    add('orient-print', 'Für den Druck ausrichten (wenig Überhang)', 'overhang', 'druck ausrichten drehen ueberhang stuetzen orientieren 3d-druck flach legen', () => Print.orientForPrint(), { group: 'Projekt' });
    add('nozzle-wall', 'Wandstärke gegen Düse prüfen', 'ruler', 'wandstaerke duese 3d-druck duenn warnung pruefen wand', () => Views.thin(true, { limit: round(2 * Print.nozzle(), 2) }), { group: 'Projekt' });
    add('status', 'Modell-Status', 'info', 'status prüfen größe fehler', () => $('#ampel').click(), { group: 'Werkzeuge' });
    add('notices', 'Meldungs-Zentrale öffnen (Fehler und Hinweise)', 'bell', 'meldungen meldungszentrale glocke fehler hinweise warnung', () => Notices.toggle(), { group: 'Werkzeuge' });
    add('cancel-calc', 'Laufendes Rechnen abbrechen', 'stop', 'rechnen abbrechen stopp kern langsam', () => { if (!App.cancelRebuild()) UI.toast('Es läuft gerade keine Berechnung.', { icon: 'info', noNotice: true }); }, { group: 'Werkzeuge' });
    add('drop', 'Auf die XY-Ebene setzen', 'push', 'boden unten absetzen z null ebene', () => Actions.dropToPlate(null), { group: 'Werkzeuge' });
    add('ortho', 'Orthografisch / Perspektive', 'viewOrtho', 'ortho perspektive projektion kamera', () => ViewPrefs.toggle('ortho'), { group: 'Ansicht', kbd: 'O' });
    add('gridtoggle', 'Raster ein/aus', 'grid', 'raster gitter grid', () => ViewPrefs.toggle('gridOn'), { group: 'Ansicht', kbd: 'G' });
    add('look-panel', 'Aussehen: Boden, Umgebung & Licht einstellen', 'sun', 'aussehen studio boden spiegelung umgebung hdri hdr bild licht lichter farbe richtung an-11 an-12', () => ViewPrefs.openLookPanel(), { group: 'Ansicht' });
    add('disp-illustration', 'Technische Illustration (nur Umrisse & Kanten)', 'illustration', 'illustration technisch umriss kanten weiss zeichnung an-17', () => ViewPrefs.set({ display: ViewPrefs.get().display === 'illustration' ? 'edges' : 'illustration' }), { group: 'Ansicht', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('quad-view', 'Vierfach-Ansicht (Vorn, Oben, Rechts, Schräg)', 'quadView', 'vierfach vier ansichten quad split vorn oben rechts schraeg schräg an-18', () => Views.quad(), { group: 'Ansicht', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('floor-reflect', 'Boden-Spiegelung ein/aus', 'shadow', 'boden spiegelung reflektion studio boden an-11', () => { const on = !ViewPrefs.get().floorReflect; ViewPrefs.set({ floorReflect: on, ...(on ? { look: 'studio' } : {}) }); }, { group: 'Ansicht' });
    add('manual-lights', 'Lichter von Hand einstellen', 'sun', 'licht lichter beleuchtung farbe richtung staerke stärke an-12', () => { ViewPrefs.set({ manualLights: true }); ViewPrefs.openLookPanel(); }, { group: 'Ansicht' });
    add('section', 'Schnitt ein/aus', 'section', 'schnitt aufschneiden querschnitt innen schnittebene', () => Views.section(), { group: 'Ansicht', kbd: 'C' });
    add('xray', 'Röntgen ein/aus', 'xray', 'röntgen durchsichtig transparent glas innen', () => Views.xray(), { group: 'Ansicht', kbd: 'X' });
    add('explode', 'Explosion: Teile auseinanderziehen', 'explode', 'explosion explosionsansicht auseinander zerlegen baugruppe', () => Views.explode(), { group: 'Ansicht', kbd: 'U' });
    add('explode-steps', 'Explosion in Schritten', 'explode', 'explosion schritte stufenweise baugruppe wegen linien anleitung', () => Views.openExplodeSteps(), { group: 'Ansicht' });
    add('explode-video', 'Explosions-Video speichern', 'play', 'explosion video film webm baugruppe animation', () => Views.explodeVideoDialog(), { group: 'Ansicht' });
    add('verbund-alle', 'Alles zu einem Körper verbinden (Verbund)', 'group', 'verbund verbinden alles zusammen zusammenfügen ein körper vereinigen gruppieren alle', () => Actions.groupAll(), { group: 'Bearbeiten' });
    add('variants', 'Varianten vergleichen', 'list', 'variante varianten vergleichen maße sätze schritte unterdrücken', () => Variants.compareDialog(), { group: 'Projekt' });
    add('variants-table', 'Varianten-Tabelle öffnen (CSV)', 'grid', 'variante varianten tabelle kalkulation excel csv import export werkstoff maße', () => Variants.tableDialog(), { group: 'Projekt' });
    add('explain', 'Erklär diesen Schritt', 'help', 'erklär erklären was ist das schritt warum', () => Explain.dialog(), { group: 'Projekt' });
    add('weak', 'Schwachstellen suchen', 'target', 'schwachstellen schwach prüfen bruch dünn rand loch festigkeit stabil', () => Weak.dialog(), { group: 'Projekt' });
    add('geom-check', 'Geometrie prüfen (kaputte Flächen, winzige Kanten)', 'target', 'geometrie prüfen check kaputt fläche kante winzig selbstschnitt brep fehler', () => GeomCheck.open(), { group: 'Projekt' });
    add('draft-analysis', 'Schräge- und Hinterschnitt-Analyse', 'chamfer', 'schräge schraege entformung hinterschnitt form guss spritzguss winkel farben prüfen analyse draft undercut pf-09 pf-10', () => Measure.draft(), { group: 'Projekt' });
    add('inner-radius', 'Kleinster Innenradius (Fräser-Prüfung)', 'fillet', 'innenradius innenrundung radius fräser fraeser tasche ecke zu klein prüfen pf-11', () => InnerRadius.open(), { group: 'Projekt' });
    add('symmetry-check', 'Symmetrie prüfen', 'mirror', 'symmetrie symmetrisch spiegeln ebene abweichung prüfen farben pf-16', () => SymmetryCheck.open(), { group: 'Projekt' });
    add('print-cost', '3D-Druck: Kosten, Filament & Zeit schätzen', 'printer', 'druck kosten preis filament zeit dauer schaetzung schätzung fuellung füllung infill 3d-druck euro kg pf-17', () => Print.costDialog(), { group: 'Projekt' });
    add('report-pdf', 'Prüfbericht als PDF erstellen', 'file', 'pruefbericht prüfbericht bericht pdf report protokoll masse volumen wandstaerke wandstärke bild drucken export pf-18', () => Measure.reportDialog(), { group: 'Projekt' });
    add('compare-bodies', 'Körper oder Versionen vergleichen (Farben)', 'compare', 'vergleich vergleichen körper versionen unterschied diff farben grün rot grau pf-12', () => Versions.openCompare(), { group: 'Projekt' });
    add('silhouette-area', 'Schattenriss-Fläche in Blickrichtung (mm²)', 'silhouette2d', 'schattenriss silhouette fläche stirnfläche projektion blickrichtung querschnitt mm2 pf-15', () => Measure.silhouette(), { group: 'Projekt' });
    add('clash-check', 'Durchdringungen suchen (Baugruppe prüfen)', 'boolIntersect', 'durchdringung durchdringungen kollision kollisionen überlappung überschneidung schnitt baugruppe prüfen clash interference bg-10', () => ClashCheck.open(), { group: 'Baugruppe' });
    add('clearance-check', 'Luft prüfen (Abstände zwischen Teilen)', 'clearance', 'luft abstand abstaende abstände spiel spalt pruefen prüfen baugruppe clearance bg-18', () => ClashCheck.openClearance(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('drag-stop-contact', 'Beim Ziehen anhalten, wenn Teile sich berühren', 'warn', 'ziehen anhalten stoppen beruehrung berührung kollision kontakt baugruppe stop contact bg-17', () => ClashCheck.toggleStopOnContact(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('versions', 'Versionen: speichern, vergleichen, zurückholen', 'rollback', 'version versionen stand vergleichen zurück sichern', () => Versions.dialog(), { group: 'Projekt' });
    add('version-save', 'Jetzigen Stand als Version speichern', 'save', 'version speichern sichern stand', async () => { const n = await UI.prompt('Version speichern', 'Name der Version', 'Version ' + (Versions.list().length + 1), 'Speichern'); if (n != null) Versions.save(n); }, { group: 'Projekt' });
    add('chain', 'Kantenkette wählen', 'chainEdges', 'kette kanten umriss tangential rand alle zusammen', () => Select.chain(), { group: 'Bearbeiten', needSel: true });
    add('similar', 'Ähnliche auswählen', 'similar', 'ähnliche gleiche alle auswählen bohrungen kanten', () => Select.similar(), { group: 'Bearbeiten', kbd: 'A', needSel: true });
    add('filter-body', 'Auswahlfilter: nur Körper', 'cube', 'filter auswahl körper', () => Select.setFilter('body'), { group: 'Ansicht' });
    add('filter-face', 'Auswahlfilter: nur Flächen', 'planeXY', 'filter auswahl flächen', () => Select.setFilter('face'), { group: 'Ansicht' });
    add('filter-edge', 'Auswahlfilter: nur Kanten', 'line', 'filter auswahl kanten', () => Select.setFilter('edge'), { group: 'Ansicht' });
    add('filter-all', 'Auswahlfilter aus (alles wählen)', 'pointer', 'filter auswahl alles', () => Select.setFilter('all'), { group: 'Ansicht' });
    add('paintSelect', 'Malen-Auswahl (Flächen / Kanten überstreichen)', 'noteDraw', 'malen auswahl streichen pinsel flächen kanten mehrfach', () => Select.togglePaint(), { group: 'Bearbeiten', kbd: 'V' });
    add('paintSelect-face', 'Malen-Auswahl: Flächen', 'planeXY', 'malen auswahl flächen streichen pinsel', () => Select.startPaint('face'), { group: 'Bearbeiten' });
    add('paintSelect-edge', 'Malen-Auswahl: Kanten', 'line', 'malen auswahl kanten streichen pinsel', () => Select.startPaint('edge'), { group: 'Bearbeiten' });
    add('radialMenu', 'Kreis-Menü öffnen', 'menu', 'kreis menü kreismenü schnellmenü radial pie q', () => UI.toggleRadial(), { group: 'Werkzeuge', kbd: 'Q' });
    add('radial-config', 'Kreis-Menü anpassen (8 Befehle)', 'gear', 'kreis menü kreismenü anpassen einstellen 8 befehle', () => UI.radialDialog(), { group: 'Werkzeuge' });
    add('focus', 'Fokus-Vorschau ein/aus', 'focusView', 'fokus vorschau zweites fenster lupe groß', () => Views.focus(), { group: 'Ansicht' });
    add('planes', 'Ursprungsebenen ein/aus', 'originPlanes', 'ursprung ebenen xy xz yz origin', () => ViewPrefs.toggle('planes'), { group: 'Ansicht' });
    add('axes', 'Achsen ein/aus', 'axes', 'achsen x y z', () => ViewPrefs.toggle('axes'), { group: 'Ansicht' });
    add('newcomp', 'Neues Bauteil', 'parts', 'bauteil komponente baugruppe component neu', () => Comp.newComponent(), { group: 'Werkzeuge' });
    add('new-assembly', 'Neue Baugruppe anlegen', 'parts', 'baugruppe assembly neu dokument tab verweis', () => Start.openNewTab(Model.newAssemblyDoc(T('asm.defaultName'))), { group: 'Projekt' });
    add('insert-part', 'Bauteil oder Unterbaugruppe einsetzen …', 'parts', 'bauteil unterbaugruppe subassembly einsetzen verweis baugruppe assembly einfuegen einfügen teil', () => {
      if (Model.isAssembly(App.doc)) Comp.insertPartDialog();
      else UI.toast('Wechsle zuerst in eine Baugruppe (oder lege über Start → „Neue Baugruppe“ eine an).', { icon: 'info' });
    }, { group: 'Baugruppe' });
    add('insert-from-file', 'Teil aus Datei einfügen (STEP / Projekt) …', 'folder', 'datei einfuegen einfügen step projekt tracery json importieren teil baugruppe bg-13', () => Comp.insertFromFile(), { group: 'Baugruppe' });
    add('replace-part', 'Teil ersetzen (gegen Bauteil oder Datei) …', 'replace', 'teil ersetzen tauschen austauschen step projekt bauteil baugruppe bg-13', () => {
      const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null;
      if (!t) UI.toast(T('asm.selectPartToReplace'), { icon: 'info' });
      else if (!Comp.canReplace(t, App.doc)) UI.toast(T('asm.cannotReplace'), { icon: 'info' });
      else Comp.replacePartDialog(t.id);
    }, { group: 'Baugruppe', needSel: true });
    add('ground-part', 'Teil festsetzen / lösen', 'lock', 'festsetzen fixieren lösen loesen sperren schloss verankern ground fix lock baugruppe', () => Actions.toggleGround(), { group: 'Baugruppe', needSel: true });
    add('open-part-tab', 'Bauteil im Tab öffnen', 'edit', 'bauteil tab oeffnen öffnen baugruppe bearbeiten', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (t && Assembly.canOpenInTab(t, App.doc)) Assembly.openPartTab(t.id); else UI.toast(T('asm.selectPartFirst'), { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sync-assembly', 'Baugruppe aktualisieren', 'undo', 'baugruppe aktualisieren sync bauteil abgleichen', () => Assembly.syncCurrentAssembly({ announce: true }), { group: 'Werkzeuge' });
    add('save-pose', 'Stellung der Gelenke speichern', 'hinge', 'stellung stellungen pose position gelenk gelenke auf zu halb baugruppe speichern bg-20', () => Assembly.promptSavePose(), { group: 'Baugruppe' });
    add('auto-screws', 'Schrauben automatisch einsetzen', 'bolt', 'schrauben einsetzen automatisch bohrung loch normschraube mutter scheibe baugruppe bg-23', () => Assembly.autoScrewsDialog(), { group: 'Baugruppe' });
    add('asm-pattern-rect', 'Baugruppe: Teil im Rechteck / in Reihe mustern', 'patternRect', 'baugruppe teil muster reihe rechteck vervielfaeltigen verknuepft bg-26', () => Assembly.patternDialog('rect'), { group: 'Baugruppe' });
    add('asm-pattern-circ', 'Baugruppe: Teil im Kreis mustern', 'patternCirc', 'baugruppe teil muster kreis kreismuster vervielfaeltigen verknuepft bg-26', () => Assembly.patternDialog('circ'), { group: 'Baugruppe' });
    add('asm-mirror-part', 'Baugruppe: Teil spiegeln (verknüpfte Kopie)', 'mirror', 'baugruppe teil spiegeln spiegelkopie verknuepft links rechts bg-26', () => Assembly.patternDialog('mirror'), { group: 'Baugruppe' });
    add('asm-display-state-save', 'Baugruppe: Anzeige-Zustand speichern', 'eye', 'baugruppe anzeige zustand sichtbar durchsichtig farbig speichern bg-27', () => Assembly.promptSaveDisplayState(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-display-state-manage', 'Baugruppe: Anzeige-Zustände verwalten', 'sliders', 'baugruppe anzeige zustand zustaende zustände verwalten umschalten bg-27', () => Assembly.displayStateDialog(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-variant-save', 'Baugruppe: Variante speichern', 'sliders', 'baugruppe variante varianten konfiguration maße teile speichern bg-28', () => Assembly.promptSaveAsmVariant(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-variant-manage', 'Baugruppe: Varianten verwalten', 'list', 'baugruppe variante varianten konfiguration teile tauschen maße verwalten bg-28', () => Assembly.asmVariantDialog(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-single-body', 'Baugruppe als einen Körper speichern / exportieren', 'cube', 'baugruppe ein körper koerper vereinen verschmelzen exportieren step stl 3mf brep druck bg-31', () => Assembly.singleBodyDialog(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('tol-chain', 'Toleranzkette rechnen (schlimmster Fall & Mittelwert)', 'ruler', 'toleranz toleranzkette kette stapel maß plus minus schlimmster fall mittelwert rss bg-33', () => Measure.tolChain(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('part-refs', 'Bezüge zwischen Teilen verwalten (Einfrieren / Lösen)', 'link', 'bezuege bezüge verwalten einfrieren auftauen loesen lösen kontext bauteil baugruppe bg-22', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; Comp.refsDialog(t ? t.id : null); }, { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('motion-study', 'Bewegungs-Studie (Motoren & Zeitachse)', 'play', 'bewegung studie motor motoren zeitachse animation bahn kurve punkt bg-21', () => Motion.toggle(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-stack-hole', 'Bohrung durch Stapel (mehrere Teile)', 'holeWizard', 'bohrung stapel baugruppe durchbohren mehrteil schraube senkung bg-24', () => Assembly.startStackHole(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-cut', 'Baugruppen-Schnitt (durch mehrere Teile)', 'boolSubtract', 'baugruppe schnitt tasche durchschneiden mehrteil schritt skizze bg-25', () => Assembly.startAsmCut(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-lightweight', 'Leichtmodus für große Baugruppe umschalten', 'xray', 'leichtmodus schnell netz große baugruppe baugruppen leistung performance bg-29', () => Assembly.toggleLightweight(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-lw-resolve-all', 'Leichtmodus: Alle Teile voll laden', 'cube', 'leichtmodus voll laden b-rep auflösen alle teile baugruppe bg-29', () => Assembly.resolveAllLightweight(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-envelope', 'Vereinfachte Hülle aus Baugruppe erzeugen …', 'box', 'vereinfachte hülle außenhaut baugruppe ein teil schrumpfen verkleinern bg-30', () => Assembly.envelopeDialog(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('asm-cable', 'Kabel / Schlauch zwischen Anschlusspunkten', 'sweep', 'kabel schlauch leitung draht biegeradius anschluss kurve stückliste stueckliste baugruppe bg-34', () => Assembly.cableDialog(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-cable-pick', 'Kabel / Schlauch im 3D-Bild anklicken', 'sweep', 'kabel schlauch anklicken klicken anschlusspunkt fläche baugruppe bg-34', () => Assembly.startCable(), { group: 'Baugruppe', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('asm-skeleton', 'Baugruppe: Skelett-Skizze (Hauptskizze) anlegen', 'sketch', 'skelett skizze hauptskizze master layout baugruppe steuern bg-32', () => Comp.startSkeleton(), { group: 'Baugruppe', when: () => !ViewPrefs.simple });
    add('mate-cyl', 'Verbindung: Zylindrisch (Welle in Bohrung)', 'axes', 'verbindung gelenk zylindrisch welle bohrung bolzen achse drehen schieben bg-06', () => Joints.startCylindrical(), { group: 'Baugruppe' });
    add('mate-planar', 'Verbindung: Eben (Fläche auf Fläche)', 'planeXY', 'verbindung gelenk eben planar flaeche fläche schieben drehen bg-06', () => Joints.startPlanar(), { group: 'Baugruppe' });
    add('mate-parallel', 'Verbindung: Parallel (zwei Flächen)', 'cParallel', 'verbindung parallel flaechen flächen ausrichten bg-07', () => Joints.startParallel(), { group: 'Baugruppe' });
    add('mate-tangent', 'Verbindung: Tangential (Fläche an Zylinder)', 'cTangent', 'verbindung tangential beruehren berühren zylinder flaeche fläche bg-07', () => Joints.startTangent(), { group: 'Baugruppe' });
    add('mate-distance', 'Verbindung: Abstand (zwei Flächen)', 'clearance', 'verbindung abstand distanz spalt flaechen flächen formel bg-07', () => Joints.startDistance(), { group: 'Baugruppe' });
    add('mate-angle', 'Verbindung: Winkel (Flächen oder Kanten)', 'rotate', 'verbindung gelenk winkel grad formel flaeche fläche kante schraeg schräg neigung angle mate bg-07', () => Joints.startAngle(), { group: 'Baugruppe' });
    add('mate-center', 'Verbindung: Mittig (zwischen zwei Flächen / Nut)', 'cSymmetric', 'verbindung gelenk mittig mitte zentriert breite nut flaeche fläche width center mate bg-07', () => Joints.startCenter(), { group: 'Baugruppe' });
    add('mate-ball', 'Verbindung: Kugel (Kugelgelenk)', 'circle', 'verbindung gelenk kugel kugelgelenk ball punkt drehen frei bg-06', () => Joints.startBall(), { group: 'Baugruppe' });
    add('mate-slot', 'Verbindung: Stift im Langloch', 'slot', 'verbindung gelenk stift langloch anschlag endanschlag slot gleiten bg-06', () => Joints.startSlot(), { group: 'Baugruppe' });
    add('couple-gear', 'Kopplung: Zahnrad – Zahnrad (Übersetzung)', 'gear', 'kopplung zahnrad zaehne zähne getriebe uebersetzung übersetzung verhaeltnis verhältnis drehen baugruppe bg-14', () => Joints.startGear(), { group: 'Baugruppe' });
    add('couple-rack', 'Kopplung: Zahnrad – Zahnstange (Drehen → Schieben)', 'moveStep', 'kopplung zahnstange ritzel zahnrad teilkreis modul durchmesser schieben drehen baugruppe bg-14', () => Joints.startRack(), { group: 'Baugruppe' });
    add('couple-screw', 'Kopplung: Schraube (Drehen → Vorschub)', 'helix', 'kopplung schraube spindel gewinde steigung vorschub drehen schieben umdrehung baugruppe bg-14', () => Joints.startScrew(), { group: 'Baugruppe' });
    add('couple-belt', 'Kopplung: Riemen (gleiche Umfangsgeschwindigkeit)', 'link', 'kopplung riemen zahnriemen riemenscheibe rad zaehne zähne durchmesser uebersetzung übersetzung baugruppe bg-14', () => Joints.startBelt(), { group: 'Baugruppe' });
    add('couple-linear', 'Kopplung: Linear (Schieben → Schieben)', 'moveStep', 'kopplung linear schieben verhaeltnis verhältnis gegenlaeufig gegenläufig synchron baugruppe bg-14', () => Joints.startLinear(), { group: 'Baugruppe' });
    add('couple-cam', 'Verbindung: Kurvenscheibe / Nocken (Scheibe → Stößel)', 'cam', 'kurvenscheibe nocken cam stoessel stößel hub kontur wegkurve diagramm kopplung baugruppe bg-15', () => Joints.startCam(), { group: 'Baugruppe' });
    add('fixed-joint', 'Verbinden: fest (zwei Flächen oder Punkte)', 'lock', 'verbinden fest verbindung starr baugruppe bündig fläche punkt mate rigid joint', () => Joints.startFixed(), { group: 'Werkzeuge' });
    add('editcomp', 'Gewählte Gruppe als Bauteil bearbeiten', 'edit', 'bauteil bearbeiten kontext', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (t && t.kind === 'group') Comp.edit(t.id); else UI.toast('Wähle zuerst eine Gruppe oder ein Bauteil aus.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('isolate', 'Gewähltes Teil isolieren', 'focusView', 'isolieren nur dieses zeigen', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (t) Comp.toggleIso(t.id); }, { group: 'Ansicht' });
    add('drawing', 'Technische Zeichnung öffnen', 'sheet', 'zeichnung ansichten bemaßung pdf dreitafel', () => setMode('drawing'), { group: 'Werkzeuge' });
    add('drawingFinish', 'Zeichnung fertig machen (Ansichten, Maßstab, Maße, Mittellinien, Schriftfeld)', 'spark', 'zeichnung fertig machen automatisch komplett ansichten maßstab maße mittellinien schriftfeld ze-34', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => Drawing.finishDrawing()); }, { group: 'Werkzeuge' });
    add('drawingAddSheet', 'Neues Zeichnungsblatt hinzufügen', 'sheet', 'blatt seite zeichnung a4 a3 a2 a1 a0 format', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.addSheet(); }, { group: 'Werkzeuge' });
    add('drawingAddIso', 'Zeichnung: Isometrische Ansicht hinzufügen', 'cube', 'zeichnung isometrie isometrisch 3d ansicht schattiert', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.addView('iso'); }, { group: 'Werkzeuge' });
    add('drawingAddFree', 'Zeichnung: Freie 3D-Ansicht hinzufügen', 'eye', 'zeichnung freie ansicht 3d kamera aktuell schattiert', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.addView('free'); }, { group: 'Werkzeuge' });
    add('drawingAddExplode', 'Zeichnung: Explosionsansicht hinzufügen', 'explode', 'zeichnung explosion explosionsansicht baugruppe auseinander ze-18', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.addView('explode'); }, { group: 'Werkzeuge' });
    add('drawingProjEu', 'Zeichnung: Projektion Europa (ISO E)', 'sheet', 'zeichnung projektion europa iso e methode 1 ze-19', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setProjection('eu'); }, { group: 'Werkzeuge' });
    add('drawingProjUs', 'Zeichnung: Projektion USA (ISO A)', 'sheet', 'zeichnung projektion usa amerika iso a methode 3 ze-19', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setProjection('us'); }, { group: 'Werkzeuge' });
    add('drawingTitleBlock', 'Zeichnung: Schriftfeld gestalten (Editor & Vorlagen)', 'sheet', 'zeichnung schriftfeld editor vorlage felder logo linien iso din ansi ze-30', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.openTitleBlockEditor(); }, { group: 'Werkzeuge' });
    add('drawingTplIso', 'Zeichnung: Schriftfeld-Vorlage ISO 7200', 'sheet', 'zeichnung schriftfeld vorlage iso 7200 ze-30', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.applyTitleBlockTemplate('iso'); }, { group: 'Werkzeuge' });
    add('drawingTplDin', 'Zeichnung: Schriftfeld-Vorlage DIN EN ISO 7200', 'sheet', 'zeichnung schriftfeld vorlage din 7200 benennung ze-30', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.applyTitleBlockTemplate('din'); }, { group: 'Werkzeuge' });
    add('drawingTplAnsi', 'Zeichnung: Schriftfeld-Vorlage ANSI / ASME Y14.1', 'sheet', 'zeichnung schriftfeld vorlage ansi asme y14.1 ze-30', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.applyTitleBlockTemplate('ansi'); }, { group: 'Werkzeuge' });
    add('drawingDetail', 'Detailansicht in Zeichnung anlegen', 'zoomIn', 'detail lupe vergrößern ausschnitt kreis zeichnung ze-03', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('detail'); }, { group: 'Werkzeuge' });
    add('drawingSection', 'Schnittansicht in Zeichnung (A–A)', 'section', 'schnitt schnittansicht schraffur zeichnung a-a', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('section'); }, { group: 'Werkzeuge' });
    add('drawingBreakView', 'Zeichnung: Ansicht unterbrechen (Bruchlinie)', 'split', 'unterbrechen bruch bruchlinie gekürzt gekuerzt lang welle zeichnung ze-16', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('break'); }, { group: 'Werkzeuge', kbd: 'U' });
    add('drawingAuxView', 'Zeichnung: Hilfsansicht (senkrecht zu Kante)', 'arrowR', 'hilfsansicht schräg schraege kante fläche flaeche unverzerrt zeichnung ze-17', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('aux'); }, { group: 'Werkzeuge', kbd: 'H' });
    add('drawingHalfSection', 'Zeichnung: Halbschnitt (halb Ansicht, halb Schnitt)', 'section', 'halbschnitt halb schnitt schnittansicht zeichnung ze-15', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setSectionMode('half'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingSteppedSection', 'Zeichnung: Abgesetzter Schnitt (mit Knicken)', 'section', 'abgesetzter schnitt stufenschnitt knick knicke schnittansicht zeichnung ze-15', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setSectionMode('stepped'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingBreakoutSection', 'Zeichnung: Ausbruch (Teilschnitt im Bereich)', 'section', 'ausbruch teilschnitt bereich bruchlinie schnittansicht zeichnung ze-15', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setSectionMode('breakout'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingNormThreads', 'Zeichnung: Gewinde nach Norm ein-/ausblenden', 'thread', 'gewinde norm din iso 6410 dreiviertelkreis zeichnung ze-20', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setNormThreads(!Drawing.activeSheet().normThreads); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingMaterialHatch', 'Zeichnung: Schraffur je Werkstoff ein-/ausblenden', 'section', 'schraffur werkstoff material alu kunststoff stahl din 201 zeichnung ze-28', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setMaterialHatch(!Drawing.activeSheet().materialHatch); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingDimChain', 'Zeichnung: Kettenmaß', 'dim', 'kettenmaß kette bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('chain'); }, { group: 'Werkzeuge' });
    add('drawingDimBase', 'Zeichnung: Bezugsmaß (ab Kante)', 'dim', 'bezugsmaß bezug kante bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('base'); }, { group: 'Werkzeuge' });
    add('drawingDimAngle', 'Zeichnung: Winkelmaß', 'dim', 'winkel winkelmaß grad bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('ang'); }, { group: 'Werkzeuge' });
    add('drawingDimRadius', 'Zeichnung: Radius-Maß (R)', 'dim', 'radius r rundung bogen bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('rad'); }, { group: 'Werkzeuge' });
    add('drawingDimDia', 'Zeichnung: Durchmesser-Maß (Ø)', 'dim', 'durchmesser ø bohrung kreis bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('dia'); }, { group: 'Werkzeuge' });
    add('drawingDimChamfer', 'Zeichnung: Fasenmaß (1×45°)', 'dim', 'fase fasenmaß 45 grad schräge bemaßung zeichnung ze-07', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('chamfer'); }, { group: 'Werkzeuge' });
    add('drawingDimOrdinate', 'Zeichnung: Koordinatenmaße (ab Nullpunkt)', 'dim', 'koordinatenmaß koordinatenmaße ordinate nullpunkt löcher bemaßung zeichnung ze-21', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('ordinate'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingDimArcLen', 'Zeichnung: Bogenlängen-Maß', 'dim', 'bogenlänge bogenlängenmaß bogen kreisbogen bemaßung zeichnung ze-21', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDimMode('arclen'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingDualDims', 'Zeichnung: Doppelmaße (mm und Zoll) umschalten', 'sliders', 'doppelmaß doppelmaße zoll inch mm klammer zeichnung ze-22', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setDualDims(!Drawing.dimStyle().dual); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingCenters', 'Mittellinien automatisch ein-/ausblenden', 'target', 'mittellinie mittellinien mittelkreuz mittelkreuze achse bohrung zylinder zeichnung ze-06', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setCenters(!Drawing.activeSheet().centers); }, { group: 'Werkzeuge' });
    add('drawingCentersShowAll', 'Alle Mittellinien in Zeichnung einblenden', 'eye', 'mittellinie mittellinien mittelkreuz alle einblenden zeichnung', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.showAllCenters(); }, { group: 'Werkzeuge' });
    add('drawingLeaderNote', 'Zeichnung: Notiz mit Hinweislinie', 'noteText', 'notiz hinweislinie pfeil punkt kante fläche kommentar zeichnung ze-11', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('note'); }, { group: 'Werkzeuge', kbd: 'N' });
    add('drawingBalloons', 'Zeichnung: Positionsnummern automatisch setzen', 'list', 'positionsnummer positionsnummern ballon stückliste teileliste zeichnung ze-12', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.autoBalloons(); }, { group: 'Werkzeuge' });
    add('drawingBalloonTool', 'Zeichnung: Positionsnummer einzeln setzen', 'list', 'positionsnummer ballon einzeln setzen ze-12', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('balloon'); }, { group: 'Werkzeuge', kbd: 'B' });
    add('drawingBomTable', 'Zeichnung: Stückliste auf dem Blatt ein-/ausblenden', 'list', 'stückliste tabelle zeichnung ze-12 pos menge werkstoff', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setBomTable(!(Drawing.bomTable().show)); }, { group: 'Werkzeuge' });
    add('drawingHoleTable', 'Zeichnung: Bohrungstabelle ein-/ausblenden', 'layout', 'bohrungstabelle bohrungen löcher lochtabelle tabelle koordinaten durchmesser tiefe zeichnung ze-26', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setHoleTable(!(Drawing.holeTable().show)); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingRevTable', 'Zeichnung: Änderungstabelle ein-/ausblenden', 'layout', 'änderungstabelle aenderungstabelle revision tabelle änderung zeichnung ze-26', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setRevTable(!(Drawing.revTable().show)); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingFreeTable', 'Zeichnung: Freie Tabelle hinzufügen', 'layout', 'freie tabelle notiztabelle prüftabelle spalten zeilen zeichnung ze-26', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.addFreeTable(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingInspectionTable', 'Zeichnung: Prüftabelle auf dem Blatt ein-/ausblenden', 'layout', 'prüfmaß prüfmaße prüftabelle prueftabelle qualität ballon zeichnung ze-33', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.setInspectionTable(!(Drawing.inspectionTable().show)); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingInspectionCsv', 'Zeichnung: Prüftabelle als CSV speichern', 'file', 'prüfmaß prüfmaße prüftabelle prueftabelle csv tabelle qualität zeichnung ze-33', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.exportInspectionCSV(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingDimStyle', 'Zeichnung: Maß-Stil (Pfeile, Schriftgröße, Stellen)', 'sliders', 'maß-stil stil pfeil pfeilart schriftgröße nachkommastellen zeichnung ze-10', () => { if (App.mode !== 'drawing') setMode('drawing'); Panels.renderRight(); document.querySelector('#dw-style-size')?.focus(); }, { group: 'Werkzeuge' });
    add('drawingModelDims', 'Zeichnung: Maße aus dem Modell übernehmen', 'dim', 'maße modell übernehmen skizze schritt bemaßen ordnen ze-23', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => Drawing.importModelDims()); }, { group: 'Werkzeuge' });
    add('drawingImportPmi', 'Zeichnung: 3D-Maße & Hinweise (PMI) übernehmen', 'dim', 'pmi 3d maße toleranzen hinweise zeichnung übernehmen ze-35', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => Drawing.importPmi()); }, { group: 'Werkzeuge', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('drawingArrangeDims', 'Zeichnung: Maße automatisch ordnen', 'sliders', 'maße ordnen aufräumen überlappen bemaßung zeichnung ze-23', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => Drawing.arrangeDims()); }, { group: 'Werkzeuge' });
    add('drawingResetViews', 'Zeichnung: Ansichten-Lage zurücksetzen', 'fit', 'ansichten verschieben zurücksetzen lage zeichnung', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.resetViewPos(); }, { group: 'Werkzeuge' });
    add('drawingTolerance', 'Toleranz oder ISO-Passung am Maß setzen', 'dim', 'toleranz passung iso 286 h7 g6 grenzmaß abmaß symmetrisch zeichnung ze-08 ze-09', () => { if (App.mode !== 'drawing') setMode('drawing'); const sel = document.getElementById('dw-tol-mode'); if (sel) sel.focus(); else UI.toast('Klick ein Maß auf dem Blatt an, um rechts eine Toleranz oder Passung zu wählen.', { icon: 'dim', ms: 3000 }); }, { group: 'Werkzeuge' });
    add('drawingDatum', 'Zeichnung: Bezugsbuchstabe setzen (A, B, C …)', 'gdt', 'bezug bezugsbuchstabe datum a b c form lagetoleranz zeichnung ze-24', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('datum'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingGdtFrame', 'Zeichnung: Form- und Lagetoleranz (Rahmen)', 'gdt', 'toleranzrahmen form lagetoleranz gdt ebenheit parallelität rechtwinkligkeit position rundlauf zeichnung ze-24', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('gdt'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingSurface', 'Zeichnung: Oberflächenzeichen (Ra / Rz)', 'surface', 'oberfläche oberflächenzeichen rauheit ra rz rmax rt iso 1302 21920 zeichnung ze-25', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('surface'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingWeld', 'Zeichnung: Schweißsymbol setzen', 'weld', 'schweißen schweißsymbol kehlnaht v-naht naht iso 2553 zeichnung ze-25', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('weld'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingEdgeSym', 'Zeichnung: Kantenzustand (ISO 13715)', 'surface', 'kantenzustand kante grat entgratet iso 13715 zeichnung ze-25', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.tool('edge'); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingSymbolLibrary', 'Zeichnung: Symbol-Sammlung öffnen', 'symbols', 'symbole symbol-sammlung sammlung zeichen stempel senkung kegel neigung masse zeichnung ze-27', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.openSymbolLibrary(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingLostDims', 'Zeichnung: Verlorene Maße prüfen', 'dim', 'verlorene maße kante fehlt zeichnung aktualisieren ze-14', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => { const n = Drawing.lostDims().length; UI.toast(n ? `${n} ${n === 1 ? 'verlorenes Maß' : 'verlorene Maße'} gefunden – rechts unter „Verlorene Maße“.` : 'Alle Maße auf diesem Blatt sind gültig.', { icon: n ? 'warn' : 'check', kind: n ? 'warn' : undefined, ms: 3000 }); }); }, { group: 'Werkzeuge' });
    add('drawingLayers', 'Zeichnung: Linienarten und Ebenen (Layer)', 'layers', 'ebenen layer linienart strichstärke liniengruppe iso 128 dxf zeichnung ze-29', () => { if (App.mode !== 'drawing') setMode('drawing'); Panels.renderRight(); document.querySelector('#dw-line-group')?.focus(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingShowAllLayers', 'Zeichnung: Alle Ebenen einblenden', 'eye', 'ebenen layer alle einblenden sichtbar zeichnung ze-29', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.showAllLayers(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingSheetImage', 'Zeichnung: Bild oder Logo auf dem Blatt einfügen', 'image', 'bild logo grafik foto datei einfügen blatt zeichnung ze-31', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.pickSheetImage(); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('drawingExportDxf', 'Zeichnung als DXF speichern', 'file', 'zeichnung dxf export cad 2d layer linien bögen ze-13', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.exportDXF(); }, { group: 'Werkzeuge' });
    add('drawingExportPng', 'Zeichnung als PNG speichern …', 'image', 'zeichnung png bild export auflösung dpi pixel ze-13', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.pngDialog(); }, { group: 'Werkzeuge' });
    add('drawingTiledPrint', 'Zeichnung: 1:1 auf mehreren A4-Seiten drucken (Schablone)', 'file', 'drucken 1:1 schablone kacheln mehrere seiten a4 kleben klebemarke pdf zeichnung ze-36', () => { if (App.mode !== 'drawing') setMode('drawing'); Drawing.waitReady().then(() => Drawing.tiledPrintDialog()); }, { group: 'Werkzeuge', when: () => ViewPrefs.level !== 'simple' });
    add('model', 'Zurück zum Modell', 'cube', 'modell 3d', () => setMode('model'), { group: 'Werkzeuge' });
    add('params', 'Maße mit Namen festlegen', 'sliders', 'parameter variable formel maß', () => Panels.showParams(), { group: 'Werkzeuge' });
    for (const [uk, un] of Units.OPTIONS) add('unit-' + uk, 'Einheit: ' + un, 'ruler', 'einheit einheiten mm cm m zoll inch ' + uk, () => Units.set(uk), { group: 'Projekt' });
    add('undo', 'Rückgängig', 'undo', 'zurück', () => App.undo(), { group: 'Bearbeiten', kbd: 'Strg Z' });
    add('redo', 'Wiederholen', 'redo', 'vor', () => App.redo(), { group: 'Bearbeiten', kbd: 'Strg Y' });
    add('delete', 'Auswahl löschen', 'trash', 'entfernen weg', () => Actions.remove(), { group: 'Bearbeiten', kbd: 'Entf', needSel: true });
    add('copy', 'Körper kopieren (auch für andere Tabs)', 'copy', 'kopieren kopie zwischenablage tab projekt strg c', () => Clipboard.copy(), { group: 'Bearbeiten', kbd: 'Strg C', needSel: true });
    add('paste', 'Kopierte Körper einfügen', 'copy', 'einfügen einfuegen zwischenablage tab projekt strg v', () => Clipboard.paste(), { group: 'Bearbeiten', kbd: 'Strg V' });
    add('dup', 'Duplizieren', 'copy', 'kopieren kopie', () => Actions.duplicate(), { group: 'Bearbeiten', kbd: 'Strg D', needSel: true });
    add('tree-folder', 'In Ordner legen', 'folder', 'ordner verlauf schritte zusammenfassen gruppieren', () => Actions.createFolder(), { group: 'Verlauf', needSel: true });
    add('toggle-no-history', 'Ohne Verlauf arbeiten ein-/ausschalten', 'rollback', 'ohne verlauf abschalten einfrieren freies bearbeiten direkt schritte aus', () => Timeline.setNoHistory(!Timeline.isNoHistory()), { group: 'Verlauf', when: () => !ViewPrefs.simple && !Model.isAssembly(App.doc) });
    add('group', 'Gruppieren', 'group', 'verbinden vereinen zusammenfügen kombinieren', () => Actions.group(), { group: 'Bearbeiten', kbd: 'Strg G', needSel: true });
    add('ungroup', 'Gruppe lösen', 'ungroup', 'trennen auflösen', () => Actions.ungroup(), { group: 'Bearbeiten', needSel: true });
    add('hole', 'Zwischen Körper und Loch wechseln', 'hole', 'loch körper umschalten aussparung', () => Actions.toggleRole(), { group: 'Bearbeiten', kbd: 'H', needSel: true });
    add('rot', 'Um 90° drehen', 'rotate', 'drehen rotieren', () => Actions.rotate90(null, 'z'), { group: 'Bearbeiten', kbd: 'R', needSel: true });
    add('mirror', 'Spiegeln', 'mirror', 'spiegel umdrehen', () => Actions.mirror(null, 'x'), { group: 'Bearbeiten', needSel: true });
    add('decal', 'Aufkleber / Logo auf Fläche legen …', 'image', 'aufkleber logo bild decal png jpg svg flaeche an-15', () => { const sf = Actions.selectedFace(); if (sf && sf.info && sf.info.t === 'PLANE') Actions.pickDecalFile(sf); else UI.toast(T('decal.needPlane'), { icon: 'info' }); }, { group: 'Ansicht' });
    add('tex-wood', 'Textur: Holz auf Körper legen', 'image', 'textur holz maserung oberflaeche material an-16', () => Actions.setTexture(null, 'wood'), { group: 'Ansicht', needSel: true });
    add('tex-brushed', 'Textur: Metall gebürstet auf Körper legen', 'image', 'textur metall gebuerstet alu oberflaeche an-16', () => Actions.setTexture(null, 'brushed'), { group: 'Ansicht', needSel: true });
    add('tex-carbon', 'Textur: Karbon auf Körper legen', 'image', 'textur karbon carbon cfk gewebe oberflaeche an-16', () => Actions.setTexture(null, 'carbon'), { group: 'Ansicht', needSel: true });
    add('tex-none', 'Textur vom Körper entfernen', 'image', 'textur entfernen aus keine an-16', () => Actions.setTexture(null, null), { group: 'Ansicht', needSel: true });
    add('fillet', 'Kanten abrunden', 'fillet', 'runden rundung verrunden fillet', () => { if (App.edges.length) Actions.addFinish('fillet', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('fillet-g2', 'Krümmungsglatte Rundung (G2)', 'fillet', 'runden rundung verrunden kruemmungsglatt krümmungsglatt g2 weich kegelschnitt fillet kp-40', () => Features.filletG2(), { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('fillet-corner-smooth', 'Rundung mit weichem Eckübergang', 'fillet', 'runden rundung ecke ecken eckuebergang eckübergang kugel weich setback fillet kp-40', () => { if (App.edges.length) Actions.addFinish('fillet', 1, App.edges, { shape: 'g2', corner: 'smooth' }); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1, { shape: 'g2', corner: 'smooth' }); else UI.toast('Wähle zuerst einen Körper oder drei Kanten an einer Ecke.', { icon: 'info' }); }, { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('fullFillet', 'Vollrundung (drei Flächen)', 'fillet', 'vollrundung rundung drei flaechen full round fillet steg ende kp-38', () => { const sf = Actions.selectedFace(); if (sf) Features.startFullFillet(sf); else Features.startFullFillet(null, { itemId: App.sel.length === 1 ? App.sel[0] : null }); }, { group: 'Bearbeiten' });
    add('faceFillet', 'Flächen-Rundung (zwei Flächen)', 'fillet', 'flaechenrundung flächen-rundung rundung zwei flaechen nicht benachbart face fillet kp-39', () => { const sf = Actions.selectedFace(); if (sf) Features.startFaceFillet(sf); else Features.startFaceFillet(null, { itemId: App.sel.length === 1 ? App.sel[0] : null }); }, { group: 'Bearbeiten', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('chamfer', 'Kanten abschrägen', 'chamfer', 'fase anfasen schräge', () => { if (App.edges.length) Actions.addFinish('chamfer', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'chamfer', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('cornerChamfer', 'Ecken-Fase (drei Abstände)', 'chamfer', 'eckenfase ecken-fase fase ecke drei abstaende vertex chamfer kp-41', () => Features.startCornerChamfer(App.sel.length === 1 ? App.sel[0] : null), { group: 'Bearbeiten' });
    add('fit', 'Alles zeigen', 'fit', 'zoom ansicht einpassen', () => Viewer.fit(), { group: 'Ansicht', kbd: 'F' });
    add('toolbar-customize', 'Werkzeugleiste anpassen', 'sliders', 'werkzeugleiste leiste anpassen favoriten stern sortieren zurücksetzen', () => Toolbar.dialog(), { group: 'Ansicht' });
    add('settings-precision', 'Genauigkeit & Nachkommastellen einstellen', 'sliders', 'genauigkeit nachkommastellen dezimalstellen winkel rundung anzeige', () => ViewPrefs.dialog('general'), { group: 'Ansicht' });
    add('settings-language', 'Sprache ändern (Deutsch / English)', 'sliders', 'sprache language english deutsch uebersetzung translation einstellungen', () => ViewPrefs.dialog('general', { focus: 'set-lang' }), { group: 'Ansicht' });
    add('settings-export', 'Einstellungen als Datei speichern', 'save', 'einstellungen sichern exportieren datei json backup tastenkuerzel favoriten maus genauigkeit', () => ViewPrefs.saveToFile(), { group: 'Ansicht' });
    add('settings-import', 'Einstellungen aus Datei laden', 'folder', 'einstellungen laden importieren datei json wiederherstellen tastenkuerzel favoriten maus genauigkeit', () => ViewPrefs.openFilePicker(), { group: 'Ansicht' });
    add('settings-scale', 'Oberflächen-Größe einstellen (80–150 %)', 'sliders', 'oberflaeche groesse skalierung zoom schrift groesser kleiner prozent 80 125 150 einstellungen', () => ViewPrefs.dialog('general', { focus: 'set-uiscale' }), { group: 'Ansicht' });
    add('install-app', 'Als App installieren (ohne Internet nutzen)', 'logo', 'app installieren pwa offline ohne internet homescreen dock einstellungen', () => ViewPrefs.dialog('general', { focus: 'set-pwa-box' }), { group: 'Ansicht' });
    add('high-contrast', 'Hoher Kontrast ein/aus', 'sun', 'kontrast hoher kontrast barrierefreiheit lesbarkeit a11y fokus be-24', () => ViewPrefs.toggle('highContrast'), { group: 'Ansicht' });
    add('toggle-gestures', 'Trackpad-, Touch- und Stift-Gesten ein/aus', 'sliders', 'trackpad touch gesten stift pen pinch zoom langes druecken tablet ipad be-21', () => ViewPrefs.toggle('gestures'), { group: 'Ansicht' });
    for (const [v, l] of [['front', 'Vorne'], ['top', 'Oben'], ['right', 'Rechts'], ['left', 'Links'], ['back', 'Hinten'], ['iso', 'Schräg']]) add('view-' + v, 'Ansicht ' + l, 'eye', 'ansicht kamera blick ' + l, () => Viewer.setView(v), { group: 'Ansicht' });
    add('new', 'Neues Projekt', 'newfile', 'neu leer vorlage vorlagen zoll 3d-druck laser gehäuse anfangen', () => Start.newProjectDialog(), { group: 'Projekt' });
    add('save-template', 'Als Vorlage speichern', 'save', 'vorlage speichern eigene vorlage template', () => Start.saveAsTemplate(), { group: 'Projekt' });
    add('save-userlib', 'Teil in meine Bibliothek speichern', 'save', 'bibliothek meine teile speichern bauteil wiederverwenden', () => UserLib.saveDialog(), { group: 'Bauteile', needSel: true });
    add('my-parts', 'Meine Teile (eigene Bibliothek)', 'parts', 'meine teile bibliothek eigene bauteile', () => Panels.toggleFlyout('parts', $('#t-parts')), { group: 'Bauteile' });
    add('import-step-userlib', 'STEP-Teil in Bibliothek einsortieren', 'folder', 'step katalog hersteller bibliothek einsortieren import meine teile bi-29', () => UserLib.pickStepFile(), { group: 'Bauteile' });
    add('iso286-table', 'Toleranz-Tabelle ISO 286 (Passungen H7, g6 …)', 'ruler', 'toleranz toleranzen passung passungen iso 286 h7 g6 grundtoleranz it7 abmass abmasse bi-26', () => Iso286.openDialog(), { group: 'Bauteile', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('open', 'Projekt öffnen', 'folder', 'laden datei öffnen', () => Start.openFile(), { group: 'Projekt' });
    add('loft', 'Übergang (Loft) aus gewählten Skizzenkörpern', 'loft', 'loft übergang profile nase verbinden spitze', () => Actions.loft(), { group: 'Bearbeiten', needSel: true });
    add('loft-tip', 'Zur Spitze zusammenlaufen lassen', 'loft', 'spitze kegel nase verlängern zuspitzen', () => { if (App.sel.length === 1) Actions.loft([App.sel[0]], { tip: 10 }); }, { group: 'Bearbeiten', needSel: true });
    add('loft-closed', 'Übergang geschlossen (Ring) aus gewählten Skizzenkörpern', 'loft', 'loft übergang ring geschlossen schleife torus loop kp-30', () => Features.loftClosed(), { group: 'Bearbeiten', needSel: true, when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('loft-cut', 'Übergang als Schnitt abziehen (Loft-Schnitt)', 'loft', 'loft übergang schnitt abziehen aussparung nut kanal tasche cut kp-30', () => Features.loftCut(), { group: 'Bearbeiten', needSel: true, when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('loft-tangent', 'Übergang tangential anschließen (G1)', 'loft', 'loft übergang tangential g1 weich anschluss kp-31', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'loft') Features.setLoftContinuity(f.item.id, 'start', { mode: 'tangent' }); else { const nid = Actions.loft(); if (nid) Features.setLoftContinuity(nid, 'start', { mode: 'tangent' }); } }, { group: 'Bearbeiten', needSel: true, when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('loft-curvature', 'Übergang krümmungsglatt anschließen (G2)', 'loft', 'loft übergang kruemmungsglatt g2 weich anschluss kp-31', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'loft') Features.setLoftContinuity(f.item.id, 'start', { mode: 'curvature' }); else { const nid = Actions.loft(); if (nid) Features.setLoftContinuity(nid, 'start', { mode: 'curvature' }); } }, { group: 'Bearbeiten', needSel: true, when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('draft', 'Entformungsschräge', 'chamfer', 'schräge entformung guss form draft konisch neigen', () => { if (App.sel.length) Actions.finishAll(App.sel[0], 'draft', 'all', 3); }, { group: 'Bearbeiten', needSel: true });
    add('partingDraft', 'Schräge an Trennlinie', 'chamfer', 'schraege schräge trennlinie trennebene entformung entformungsschraege guss form parting draft kp-42', () => { if (App.edges.length === 1) Features.addPartingDraft(App.edges[0].id, { edge: App.edges[0] }); else if (App.sel.length) Features.addPartingDraft(App.sel[0]); }, { group: 'Bearbeiten', needSel: true, when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('gap', 'Abstand zwischen zwei Teilen setzen', 'dim', 'abstand lücke distanz zwischen zwei teile', () => { if (App.sel.length === 2) $('.ctxbar button[aria-label="Abstand"]') && $('.ctxbar button[aria-label="Abstand"]').click(); else UI.toast('Wähle genau zwei Teile.', { icon: 'info' }); }, { group: 'Bearbeiten', needSel: true });
    add('sketch3d', '3D-Skizze: Linien und Bögen frei im Raum', 'sketch3d', '3d skizze sketch3d linie bogen raum pfad sk-51', () => Sketch.start3d(), { group: 'Werkzeuge', when: () => typeof ViewPrefs === 'undefined' || !ViewPrefs.simple });
    add('route3d', 'Rohr im Raum: Punkte auf Körper oder in den Raum klicken', 'sweep', 'rohr raum 3d pfad kabel kanal punkte biegen', () => Features.route3d(), { group: 'Werkzeuge' });
    add('sweep-help', 'Rohr oder Kanal entlang Pfad (Sweep)', 'sweep', 'sweep pfad rohr kabelkanal bügel entlang verdrehung twist nut schnitt', () => { Sketch.chooseAndStart(); UI.toast('Zeichne einen offenen Pfad und klick „Fertig“ – wähl „Entlang Pfad“, Verdrehung und bei Bedarf „Schneiden (Nut)“.', { icon: 'info', ms: 5500 }); }, { group: 'Werkzeuge' });
    add('sweep-cut', 'Nut / Schnitt entlang Pfad (Sweep)', 'sweep', 'nut schnitt sweep pfad rille gravur entlang', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'PLANE') Sketch.startOnFace(f); else Sketch.chooseAndStart(); UI.toast('Zeichne die Kurve für deine Nut, wähl „Entlang Pfad“ und stelle „Schneiden (Nut)“ ein.', { icon: 'info', ms: 5500 }); }, { group: 'Werkzeuge' });
    add('helix', 'Feder / Spirale anlegen (Schraubenlinie)', 'helix', 'feder spirale helix schraubenlinie steigung windungen draht', () => Features.helix(), { group: 'Körper' });
    add('helix-cone', 'Kegel-Feder anlegen (konische Schraubenlinie)', 'helix', 'kegelfeder kegel feder konisch helix radius', () => Features.helix({ form: 'cone' }), { group: 'Körper' });
    add('helix-spiral', 'Flache Spirale anlegen (Archimedische Spirale)', 'helix', 'spirale flach uhrfeder schnecke helix windungen', () => Features.helix({ form: 'spiral' }), { group: 'Körper' });
    add('import', 'STEP, IGES, BREP, STL, 3MF, OBJ, AMF, PLY oder Punkte (CSV/XYZ) importieren', 'folder', 'import step stp igs iges brep stl 3mf obj amf ply csv xyz datei einlesen', () => Start.openFile(), { group: 'Projekt' });
    add('import-points', 'Punkte-Datei importieren (CSV / XYZ) …', 'point', 'punkte punktwolke csv xyz skizzenpunkte importieren scan messdaten io-14', () => Start.openPointsFile(), { group: 'Projekt' });
    add('import-check', 'Import prüfen (offene Kanten, Lücken, Flächen)', 'warn', 'import pruefen brepcheck offene kanten luecken flaechen', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'import') Start.checkImport(f.item.id); else UI.toast('Wähle zuerst ein importiertes Teil.', { icon: 'info' }); }, { group: 'Projekt', when: () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); return !!(f && f.item && f.item.kind === 'import'); } });
    add('import-heal', 'Import heilen (Nähen & reparieren)', 'spark', 'import heilen reparieren naehen shapefix toleranz luecken schliessen', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'import') Start.healImport(f.item.id); else UI.toast('Wähle zuerst ein importiertes Teil.', { icon: 'info' }); }, { group: 'Projekt', when: () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); return !!(f && f.item && f.item.kind === 'import'); } });
    add('save', 'Projekt als Datei speichern', 'save', 'sichern json datei', () => Start.saveFile(), { group: 'Projekt', kbd: 'Strg S' });
    add('save-folder', 'In Ordner speichern …', 'folder', 'ordner automatisch speichern sichern sync datei', () => Start.saveToFolder(), { group: 'Projekt', when: () => Start.folderSupported() });
    add('start', 'Startseite und Vorlagen', 'home', 'vorlagen beispiele start', () => Start.show(), { group: 'Projekt' });
    add('tour', 'Einführung starten', 'play', 'hilfe tutorial einführung lernen', () => Tour.start(), { group: 'Hilfe' });
    add('tour-sketch', 'Einführung: Deine erste Skizze', 'sketch', 'hilfe tutorial einführung lernen skizze maß formel', () => Tour.start('sketch'), { group: 'Hilfe' });
    add('keys', 'Tastenkürzel anzeigen', 'help', 'hilfe tasten kürzel', () => showKeys(), { group: 'Hilfe' });
    add('what-is-this', T('whatis.cmdLabel'), 'help', 'was ist das hilfe erklaeren erklaerung modus fragezeichen element be-32', () => UI.toggleWhatIs(), { group: 'Hilfe' });
  }
  function matchBonus(str, w) {
    let best = 0, pos = 0;
    while (pos <= str.length - w.length) {
      const i = str.indexOf(w, pos);
      if (i < 0) break;
      const sb = i === 0 || !/[a-z0-9]/.test(str[i - 1]);
      const eb = i + w.length === str.length || !/[a-z0-9]/.test(str[i + w.length]);
      const v = sb ? (eb ? 4 : 3) : 1;
      if (v > best) best = v;
      if (best === 4) break;
      pos = i + 1;
    }
    return best;
  }
  function score(c, q) {
    if (!q) return 0;
    const words = q.split(/\s+/).filter(Boolean); let s = 0;
    const lbl = normTxt(c.label);
    for (const w of words) {
      const i = c.keys.indexOf(w);
      if (i < 0) return -1;
      s += i === 0 ? 3 : !/[a-z0-9]/.test(c.keys[i - 1]) ? 2 : 1;
      s += matchBonus(lbl, w);
    }
    if (lbl.startsWith(q)) s += 5;
    if (words.length > 1) {
      if (lbl.includes(q)) s += 6;
      else if (c.keys.includes(q)) s += 3;
    }
    return s;
  }
  function search(text) {
    const q = normTxt(text.trim()); if (!q) return [];
    const top = C.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0 && (!x.c.needSel || App.sel.length) && (!x.c.when || x.c.when())).sort((a, b) => b.s - a.s).slice(0, 6);
    // Treffer derselben Gruppe zusammenhalten (Gruppen in der Reihenfolge ihres besten Treffers)
    const order = []; for (const x of top) if (!order.includes(x.c.group)) order.push(x.c.group);
    return top.sort((a, b) => order.indexOf(a.c.group) - order.indexOf(b.c.group) || b.s - a.s).map((x) => x.c);
  }
  // ---------- Eingabezeile ----------
  let pop = null, items = [], active = 0;
  function looksLikeSentence(t) { const w = t.trim().split(/\s+/); return w.length >= 3 || /[?]/.test(t) || /\d/.test(t) && w.length >= 2; }
  function renderPop(text) {
    closePop();
    const t = text.trim();
    // leere Eingabe: die zuletzt benutzten Befehle
    if (!t && !recent.length) return;
    const hits = t ? search(t) : recent.map((c) => ({ ...c, group: 'Zuletzt benutzt' }));
    items = hits.map((c) => ({ type: 'cmd', c }));
    if (t && AI.available) { const ai = { type: 'ai', text: t }; if (looksLikeSentence(t) || !hits.length) items.unshift(ai); else items.push(ai); }
    if (!items.length) return;
    active = 0;
    pop = h('div', { class: 'cmd-pop', role: 'listbox' });
    let lastGroup = null;
    items.forEach((it, i) => {
      if (it.type === 'cmd' && it.c.group !== lastGroup) { lastGroup = it.c.group; pop.append(h('div', { class: 'cmd-group' }, it.c.group)); }
      if (it.type === 'ai' && i > 0) pop.append(h('div', { class: 'cmd-group' }, 'KI'));
      const row = h('div', { class: 'cmd-item' + (it.type === 'ai' ? ' ai' : '') + (i === active ? ' on' : ''), role: 'option', dataset: { i } });
      if (it.type === 'ai') { row.innerHTML = icon('spark'); row.append(h('span', { class: 'grow' }, 'KI: „' + it.text + '“'), h('span', { class: 'k' }, 'Enter')); }
      else { row.innerHTML = icon(it.c.icon); row.append(h('span', { class: 'grow' }, it.c.label)); if (it.c.kbd) row.append(h('span', { class: 'k' }, it.c.kbd)); }
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); run(i); });
      pop.append(row);
    });
    $('#cmd').append(pop);
  }
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function move(d) { if (!pop) return; active = (active + d + items.length) % items.length; $$('.cmd-item', pop).forEach((el) => el.classList.toggle('on', +el.dataset.i === active)); }
  function run(i) {
    const it = items[i]; const inp = $('#cmd-input');
    closePop();
    if (!it) return;
    if (it.type === 'ai') { AI.ask(it.text); inp.value = ''; $('#cmd-go').disabled = true; inp.blur(); return; }
    inp.value = ''; $('#cmd-go').disabled = true; inp.blur();
    exec(it.c);
  }
  // Befehl ausführen und merken: Leertaste wiederholt ihn, die Eingabezeile zeigt die letzten Befehle
  let last = null; const recent = [];
  function exec(c) {
    c = C.find((x) => x.id === c.id) || c;
    if (c.id !== 'repeat') { last = c; const i = recent.indexOf(c); if (i >= 0) recent.splice(i, 1); recent.unshift(c); recent.length = Math.min(recent.length, 6); }
    return c.run();
  }
  function repeat() { if (!last) { UI.toast('Es gibt noch keinen Befehl zum Wiederholen. Befehle aus der Eingabezeile werden gemerkt.', { icon: 'info' }); return false; } UI.toast(`Wiederholt: ${last.label}`, { icon: 'undo', ms: 1400 }); last.run(); return true; }
  function initBar() {
    const inp = $('#cmd-input'), go = $('#cmd-go');
    inp.addEventListener('input', () => { go.disabled = !inp.value.trim(); renderPop(inp.value); });
    inp.addEventListener('focus', () => { if (inp.value.trim() || recent.length) renderPop(inp.value); });
    inp.addEventListener('blur', () => setTimeout(closePop, 120));
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (!pop && inp.value.trim()) renderPop(inp.value); if (pop) run(active); }
      else if (e.key === 'Escape') { closePop(); inp.blur(); }
    });
    go.addEventListener('click', () => { const t = inp.value.trim(); if (!t) return; if (!pop) renderPop(t); run(items.findIndex((x) => x.type === 'ai') >= 0 && looksLikeSentence(t) ? items.findIndex((x) => x.type === 'ai') : active); });
  }
  // ---------- Tastatur ----------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (document.querySelector('.modal-back')) return;
    if (Sketch.onKey(e)) { e.preventDefault(); return; }
    if (Notes.onKey(e)) { e.preventDefault(); return; }
    if (App.mode === 'drawing' && Drawing.onKey(e)) { e.preventDefault(); return; }
    const combo = eventToCombo(e); const mod = e.ctrlKey || e.metaKey;
    const gHit = combo && SHORTCUTS.find((s) => s.global && getCombo(s.id) === combo);
    if (gHit) { e.preventDefault(); gHit.run(); return; }
    // gewohnte Neben-Kürzel beibehalten, solange keine eigene Belegung darauf liegt
    if (combo === 'ctrl+shift+z' && !SHORTCUTS.some((s) => getCombo(s.id) === combo)) { e.preventDefault(); App.redo(); return; }
    if (e.key === '/' && !mod && !e.altKey && !SHORTCUTS.some((s) => getCombo(s.id) === '/')) { e.preventDefault(); $('#cmd-input').focus(); return; }
    if ((e.key === '?' || e.key === 'F1') && !mod && !e.altKey) { e.preventDefault(); showKeys(); return; }
    if (App.mode !== 'model') return;
    if (e.key === 'Escape' && Views.presenting) { Views.present(false); return; }
    if (e.key === 'Escape') { if (UI.menuOpen) UI.closeMenu(true); else if (UI.popOpen) UI.closePop(true); else if (UI.radialOpen) UI.closeRadial(true); else if (ViewPrefs.lookPanelOpen) ViewPrefs.closeLookPanel(); else if (Select.paintActive) Select.stopPaint(); else if (typeof Joints !== 'undefined' && Joints.picking) Joints.stopPick(); else if (RefFix.picking) RefFix.stop(); else if (Place.active) Place.cancel(); else if (Measure.pmiActive) Measure.pmiStop(); else if (Measure.active) Measure.stop(); else if (!App.sel.length && App.ctx) App.setCtx(null); else if (!App.sel.length && App.iso) App.setIso(null); else { Panels.closeFlyout(true); App.clearSelection(); } return; }
    if (combo === 'space' && e.target && e.target.closest && e.target.closest('button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary')) return;
    const mHit = combo && SHORTCUTS.find((s) => !s.global && getCombo(s.id) === combo);
    if (mHit) {
      if (mHit.id === 'delete' && !App.sel.length && typeof Joints !== 'undefined' && Joints.selected) { e.preventDefault(); Joints.remove(Joints.selected); return; }
      const res = mHit.run();
      if (res !== false) e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && !mod && !e.altKey && !e.shiftKey && getCombo('delete') === 'delete') {
      if (App.sel.length) { e.preventDefault(); Actions.remove(); }
      else if (typeof Joints !== 'undefined' && Joints.selected) { e.preventDefault(); Joints.remove(Joints.selected); }
      return;
    }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown'].includes(k) && App.sel.length) {
      e.preventDefault();
      const g = (App.doc.settings.grid || 1) * (e.shiftKey ? 10 : 1);
      const d = { arrowleft: [-g, 0, 0], arrowright: [g, 0, 0], arrowup: [0, g, 0], arrowdown: [0, -g, 0], pageup: [0, 0, g], pagedown: [0, 0, -g] }[k];
      let blockedName = null, lockedName = null;
      const moved = App.change('Verschoben', (doc) => {
        let any = false;
        for (const id of App.sel) {
          const f = Model.find(doc, id); if (!f) continue;
          if (f.item.locked) { if (!lockedName) lockedName = Model.label(f.item); continue; }
          const dctx = typeof Joints !== 'undefined' && Joints.dragContext ? Joints.dragContext(doc, id) : null;
          if (dctx && (dctx.blocked || (dctx.mode === 'joint' && dctx.reverse))) {
            if (dctx.reason === 'grounded') { if (!lockedName) lockedName = Model.label(f.item); }
            else if (!blockedName) blockedName = Model.label(f.item);
            continue;
          }
          if (typeof Joints !== 'undefined' && Joints.isFixedPart(id)) { if (!blockedName) blockedName = Model.label(f.item); continue; }
          const W0 = typeof Joints !== 'undefined' && Joints.captureChain ? Model.worldMatrix(doc, id).clone() : null;
          const chain = typeof Joints !== 'undefined' && Joints.captureChain ? Joints.captureChain(doc, id) : null;
          const PW = Model.parentWorld(doc, id); const q = new THREE.Quaternion(); PW.decompose(new THREE.Vector3(), q, new THREE.Vector3()); const v = new THREE.Vector3(...d).applyQuaternion(q.invert()); const tn = Model.tNumeric(f.item); f.item.t.x = round(tn.x + v.x, 4); f.item.t.y = round(tn.y + v.y, 4); f.item.t.z = round(tn.z + v.z, 4);
          const constrained = typeof Joints !== 'undefined' && Joints.constrain ? Joints.constrain(doc, id) : false;
          if (!constrained && chain && chain.entries.length && W0) {
            const D = Model.worldMatrix(doc, id).multiply(W0.invert());
            Joints.applyChainDelta(doc, chain, D);
          }
          any = true;
        }
        if (!any) return false;
      }, { merge: 'nudge' });
      if (moved === false) {
        if (lockedName) UI.toast(T('asm.groundedCannotMove', { name: lockedName }), { icon: 'lock' });
        else if (blockedName) UI.toast(T('joint.fixedCannotMove', { name: blockedName }), { icon: 'info' });
      }
    }
  }
  function showKeys() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const M = mac ? '⌘' : T('dlg.keys.ctrl');
    const K = (id) => keyLabel(id, true);
    const groups = [
      [T('dlg.keys.groupView'), [[T('keys.view.dragLeftKey'), T('keys.view.dragLeftVal')], [T('keys.view.dragRightKey'), T('keys.view.dragRightVal')], [T('keys.view.wheelKey'), T('keys.view.wheelVal')], [K('fit'), T('kbd.fit')], [K('viewBack'), T('kbd.viewBack')], [K('present'), T('keys.view.presentVal')], [`${K('view-front')} · ${K('view-right')} · ${K('view-top')} · ${K('view-iso')}`, T('keys.view.viewsVal')], [K('ortho'), T('kbd.ortho')], [K('gridtoggle'), T('kbd.gridtoggle')], [K('section'), T('kbd.section')], [K('xray'), T('kbd.xray')], [K('explode'), T('kbd.explode')], [K('isolate'), T('kbd.isolate')]]],
      [T('dlg.keys.groupModel'), [[T('keys.model.clickKey'), T('keys.model.clickVal')], [T('keys.model.shiftClickKey'), T('keys.model.shiftClickVal')], [T('keys.model.altClickKey'), T('keys.model.altClickVal')], [T('keys.model.boxKey'), T('keys.model.boxVal')], [T('keys.model.rclickKey'), T('keys.model.rclickVal')], [K('paintSelect'), T('kbd.paintSelect')], [K('repeat'), T('kbd.repeat')], [K('hideSel'), T('keys.model.hideSelVal')], [K('invertSel'), T('kbd.invertSel')], [K('dupLinked'), T('kbd.dupLinked')], [T('keys.model.dragKey'), T('keys.model.dragVal')], [T('keys.model.dblClickKey'), T('keys.model.dblClickVal')], [K('editItem'), T('kbd.editItem')], ['Esc', T('keys.model.escVal')], [K('delete'), T('common.delete')], [K('hole'), T('keys.model.holeVal')], [K('similar'), T('keys.model.similarVal')], [K('rot'), T('kbd.rot')], [T('keys.model.arrowsKey'), T('keys.model.arrowsVal')], [T('keys.model.pageKey'), T('keys.model.pageVal')], [`${K('copy')} · ${K('paste')}`, T('keys.model.copyPasteVal')], [K('dup'), T('kbd.dup')], [`${K('group')} · ${K('ungroup')}`, T('keys.model.groupVal')], [K('selectAll'), T('keys.model.selectAllVal')]]],
      [T('dlg.keys.groupTools'), [[K('radialMenu'), T('kbd.radialMenu')], [K('sketch'), T('keys.tools.sketchVal')], [K('measure'), T('kbd.measure')], [K('notes'), T('keys.tools.notesVal')], [K('bodies'), T('keys.tools.bodiesVal')], [K('parts'), T('keys.tools.partsVal')], [T('keys.tools.cmdKey', { key: K('cmdFocus') }), T('keys.tools.cmdVal')]]],
      [T('dlg.keys.groupSketch'), [['V', T('keys.sk.selVal')], ['L · R · C · A', T('keys.sk.drawVal')], [T('keys.sk.arcKey'), T('keys.sk.arcVal')], ['G · P · S', T('keys.sk.shapesVal')], ['T · F', T('keys.sk.editVal')], ['M · Q · W', T('keys.sk.patVal')], ['H', T('keys.sk.moveVal')], [T('keys.sk.freeKey'), T('keys.sk.freeVal')], [M + ' C · V', T('keys.sk.clipVal')], ['X', T('keys.sk.constrVal')], [T('keys.sk.altKey'), T('keys.sk.altVal')], ['D', T('keys.sk.dimVal')], [T('keys.sk.numKey'), T('keys.sk.numVal')], ['Tab', T('keys.sk.tabVal')], [T('keys.sk.shiftKey'), T('keys.sk.shiftVal')], ['Enter', T('keys.sk.enterVal')], ['Esc', T('keys.sk.escVal')]]],
      [T('dlg.keys.groupFiles'), [[K('undo'), T('kbd.undo')], [K('redo'), T('kbd.redo')], [K('save'), T('kbd.save')], [K('export'), T('kbd.export')], ['?', T('keys.files.helpVal')]]],
    ];
    const t = h('div', { class: 'keys-grid' });
    for (const [title, rows] of groups) {
      const sec = h('div', { class: 'keys-sec' }, h('div', { class: 'section-h' }, title));
      for (const [a, b] of rows) sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'kbd' }, a), h('span', { class: 'grow' }, b)));
      t.append(sec);
    }
    const acts = ViewPrefs.simple ? [{ label: T('common.close'), primary: true }] : [{ label: T('dlg.keys.changeBtn'), run: () => { setTimeout(() => ViewPrefs.dialog('keys'), 0); } }, { label: T('common.close'), primary: true }];
    UI.modal({ title: T('dlg.keys.title'), body: t, actions: acts });
  }
  // Editor für Einstellungen → Tastenkürzel (nur Profi-Stufe)
  function renderShortcutsEditor(container) {
    container.innerHTML = '';
    let listening = null;
    const msgEl = h('div', { class: 'kbd-msg', id: 'kbd-msg', role: 'alert', hidden: true });
    const filterInp = h('input', { type: 'text', id: 'kbd-filter', placeholder: T('dlg.keys.searchPh'), autocomplete: 'off', spellcheck: 'false' });
    const resetBtn = h('button', { type: 'button', class: 'btn small', id: 'kbd-reset' }, T('common.reset'));
    const toolbar = h('div', { class: 'kbd-toolbar' }, filterInp, resetBtn);
    const listEl = h('div', { class: 'kbd-list' });
    const btns = new Map();

    const showMsg = (txt) => { msgEl.textContent = txt || ''; msgEl.hidden = !txt; };
    const refreshButtons = () => {
      for (const s of SHORTCUTS) {
        const b = btns.get(s.id); if (!b) continue;
        const c = getCombo(s.id);
        b.textContent = formatCombo(c);
        b.classList.toggle('custom', c !== s.def);
        b.classList.remove('listening');
      }
    };
    const stopCapture = () => {
      if (!listening) return;
      window.removeEventListener('keydown', onCapture, true);
      const b = btns.get(listening);
      if (b) { b.classList.remove('listening'); b.textContent = formatCombo(getCombo(listening)); }
      listening = null;
    };
    function onCapture(e) {
      if (!listening) return;
      if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const id = listening;
      if (e.key === 'Escape') { stopCapture(); showMsg(''); return; }
      const combo = eventToCombo(e);
      if (!combo) {
        stopCapture();
        showMsg(T('dlg.keys.badKey'));
        return;
      }
      const res = setShortcut(id, combo);
      if (!res.ok) {
        stopCapture();
        const txt = T('dlg.keys.conflict', { combo: formatCombo(combo), label: res.conflict.label });
        showMsg(txt);
        UI.toast(txt, { kind: 'bad', icon: 'warn', ms: 3200 });
        const row = listEl.querySelector(`.kbd-row[data-cmd="${res.conflict.id}"]`);
        if (row) { row.classList.add('conflict'); setTimeout(() => row.classList.remove('conflict'), 1800); }
        return;
      }
      stopCapture();
      showMsg('');
      refreshButtons();
      UI.toast(T('dlg.keys.assigned', { label: SHORTCUT_MAP[id].label, key: res.labelKey }), { icon: 'check', ms: 1800 });
    }
    const startCapture = (id, btn) => {
      const same = listening === id;
      stopCapture();
      showMsg('');
      if (same) return;
      listening = id;
      btn.classList.add('listening');
      btn.textContent = T('dlg.keys.pressKey');
      window.addEventListener('keydown', onCapture, true);
    };

    const groups = [T('dlg.keys.groupView'), T('dlg.keys.groupModel'), T('dlg.keys.groupTools'), T('dlg.keys.groupFiles')];
    for (const g of groups) {
      const sec = h('div', { class: 'kbd-sec', dataset: { group: g } }, h('div', { class: 'section-h' }, g));
      for (const s of SHORTCUTS.filter((x) => x.group === g)) {
        const b = h('button', { type: 'button', class: 'kbd-btn', dataset: { cmd: s.id } });
        b.onclick = () => startCapture(s.id, b);
        btns.set(s.id, b);
        sec.append(h('div', { class: 'kbd-row', dataset: { cmd: s.id, search: normTxt(s.label + ' ' + g) } }, h('span', { class: 'grow' }, s.label), b));
      }
      listEl.append(sec);
    }
    refreshButtons();

    filterInp.oninput = () => {
      const q = normTxt(filterInp.value.trim());
      for (const sec of listEl.querySelectorAll('.kbd-sec')) {
        let vis = 0;
        for (const r of sec.querySelectorAll('.kbd-row')) {
          const ok = !q || r.dataset.search.includes(q);
          r.hidden = !ok;
          if (ok) vis++;
        }
        sec.hidden = vis === 0;
      }
    };
    resetBtn.onclick = () => {
      stopCapture();
      showMsg('');
      resetShortcuts();
      refreshButtons();
      UI.toast(T('dlg.keys.resetToast'), { icon: 'check', ms: 1800 });
    };

    container.append(
      h('small', { style: { color: 'var(--muted)' } }, T('dlg.keys.editorHint')),
      toolbar,
      msgEl,
      listEl,
    );
    return { destroy: stopCapture };
  }
  function setMode(m) {
    if (m === App.mode) return;
    if (Sketch.active) Sketch.cancel(true);
    if (Measure.active) Measure.stop();
    if (Measure.pmiActive) Measure.pmiStop();
    if (Notes.active) Notes.stop();
    if (Select.paintActive) Select.stopPaint();
    if (UI.radialOpen) UI.closeRadial();
    App.mode = m;
    $('#tab-model').setAttribute('aria-pressed', m === 'model'); $('#tab-drawing').setAttribute('aria-pressed', m === 'drawing');
    $('#workspace').classList.toggle('drawing-mode', m === 'drawing');
    $('#viewport').hidden = m !== 'model'; $('#sheet').hidden = m !== 'drawing';
    $$('#overlay > .viewcube, #overlay > .view-btns, #overlay > .axis-gizmo, #overlay > .viewbars').forEach((el) => { if (m !== 'model') el.setAttribute('hidden', ''); else el.removeAttribute('hidden'); });
    Handles.rebuild(); Panels.renderCtx();
    if (m === 'drawing') Drawing.open(); else Drawing.close();
    UI.renderHint();
  }
  function init() { loadShortcuts(); build(); syncCmdKbds(); initBar(); document.addEventListener('keydown', onKey); }
  return { init, search, setMode, showKeys, list: () => C, exec, repeat, shortcuts, setShortcut, resetShortcuts, exportShortcuts, importShortcuts, keyLabel, eventToCombo, formatCombo, renderShortcutsEditor, syncCmdKbds, get last() { return last; }, get recent() { return recent.slice(); } };
})();

