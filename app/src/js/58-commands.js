// ================= Befehle, Eingabezeile, Tastatur =================
const Commands = (() => {
  const C = [];
  const KBD_KEY = 'tracery-kuerzel';
  let customKeys = {};
  const add = (id, label, icon, keys, run, opts = {}) => C.push({ id, label, icon, keys: normTxt(label + ' ' + keys), run, ...opts });

  // Zentrale Tastenkürzel-Tabelle (Reihenfolge je Bereich bestimmt die Anzeige in Einstellungen → Tastenkürzel)
  const SHORTCUTS = [
    // Ansicht
    { id: 'fit', group: 'Ansicht', label: 'Auswahl oder alles zeigen', def: 'f', run: () => Viewer.fit(App.sel.length ? App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean) : null) },
    { id: 'viewBack', group: 'Ansicht', label: 'Vorige Ansicht', def: 'shift+z', run: () => { if (!Viewer.viewBack()) UI.toast('Keine vorige Ansicht mehr.', { icon: 'info', ms: 1800 }); } },
    { id: 'present', group: 'Ansicht', label: 'Vorführen (Vollbild)', def: 'p', run: () => Views.present(!Views.presenting) },
    { id: 'view-front', group: 'Ansicht', label: 'Ansicht Vorne', def: '1', run: () => Viewer.setView('front') },
    { id: 'view-right', group: 'Ansicht', label: 'Ansicht Rechts', def: '3', run: () => Viewer.setView('right') },
    { id: 'view-top', group: 'Ansicht', label: 'Ansicht Oben', def: '7', run: () => Viewer.setView('top') },
    { id: 'view-iso', group: 'Ansicht', label: 'Ansicht Schräg', def: '0', run: () => Viewer.setView('iso') },
    { id: 'ortho', group: 'Ansicht', label: 'Orthografisch / Perspektive', def: 'o', run: () => ViewPrefs.toggle('ortho') },
    { id: 'gridtoggle', group: 'Ansicht', label: 'Raster ein / aus', def: 'g', run: () => ViewPrefs.toggle('gridOn') },
    { id: 'section', group: 'Ansicht', label: 'Schnitt ein / aus', def: 'c', run: () => Views.section() },
    { id: 'xray', group: 'Ansicht', label: 'Röntgen ein / aus', def: 'x', run: () => Views.xray() },
    { id: 'explode', group: 'Ansicht', label: 'Explosion ein / aus', def: 'u', run: () => Views.explode() },
    { id: 'isolate', group: 'Ansicht', label: 'Gewähltes Teil isolieren / alle zeigen', def: 'i', run: () => { const top = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (top) Comp.toggleIso(top.id); else if (App.iso) App.setIso(null); } },
    // Modell
    { id: 'repeat', group: 'Modell', label: 'Letzten Befehl wiederholen', def: 'space', run: () => repeat() },
    { id: 'hideSel', group: 'Modell', label: 'Ausblenden / Alles einblenden', def: 'shift+h', run: () => { if (App.sel.length) Actions.hideSelected(); else Actions.showAll(); } },
    { id: 'invertSel', group: 'Modell', label: 'Auswahl umkehren', def: 'ctrl+shift+i', run: () => Actions.invertSelection() },
    { id: 'dupLinked', group: 'Modell', label: 'Verknüpft duplizieren', def: 'ctrl+shift+d', run: () => Actions.duplicateLinked() },
    { id: 'editItem', group: 'Modell', label: 'Skizze bzw. Bauteil bearbeiten', def: 'e', run: () => { if (App.sel.length !== 1) return false; const f = Model.find(App.doc, App.sel[0]); if (!f) return false; if ((f.item.kind === 'extrude' || f.item.kind === 'revolve' || f.item.kind === 'sweep' || f.item.kind === 'rib' || f.item.kind === 'wrap' || f.item.kind === 'emboss') && f.item.p.sketch) Sketch.editItem(f.item.id); else if (f.item.kind === 'group' && App.doc.items.includes(f.item)) Comp.edit(f.item.id); } },
    { id: 'delete', group: 'Modell', label: 'Auswahl löschen', def: 'delete', run: () => { if (App.sel.length) Actions.remove(); else return false; } },
    { id: 'hole', group: 'Modell', label: 'Zwischen Körper und Loch wechseln', def: 'h', run: () => { if (App.sel.length) Actions.toggleRole(); else return false; } },
    { id: 'similar', group: 'Modell', label: 'Ähnliche auswählen', def: 'a', run: () => { if (App.sel.length || App.edges.length) Select.similar(); else return false; } },
    { id: 'rot', group: 'Modell', label: 'Um 90° drehen', def: 'r', run: () => { if (App.sel.length) Actions.rotate90(null, 'z'); else return false; } },
    { id: 'dup', group: 'Modell', label: 'Duplizieren', def: 'ctrl+d', run: () => Actions.duplicate() },
    { id: 'group', group: 'Modell', label: 'Gruppieren', def: 'ctrl+g', run: () => Actions.group() },
    { id: 'ungroup', group: 'Modell', label: 'Gruppe lösen', def: 'ctrl+shift+g', run: () => Actions.ungroup() },
    { id: 'selectAll', group: 'Modell', label: 'Alles auswählen', def: 'ctrl+a', run: () => App.select(App.doc.items.filter((x) => !x.hidden && !App.mergedInto(x.id)).map((x) => x.id)) },
    // Werkzeuge
    { id: 'sketch', group: 'Werkzeuge', label: 'Skizze zeichnen', def: 's', run: () => Sketch.chooseAndStart() },
    { id: 'measure', group: 'Werkzeuge', label: 'Messen', def: 'm', run: () => Measure.toggle() },
    { id: 'notes', group: 'Werkzeuge', label: 'Notizstift', def: 'n', run: () => Notes.toggle() },
    { id: 'bodies', group: 'Werkzeuge', label: 'Körper-Menü', def: 'k', run: () => Panels.toggleFlyout('bodies', $('#t-body')) },
    { id: 'parts', group: 'Werkzeuge', label: 'Bauteile-Menü', def: 'b', run: () => Panels.toggleFlyout('parts', $('#t-parts')) },
    { id: 'cmdFocus', group: 'Werkzeuge', label: 'Eingabezeile öffnen', def: 'ctrl+k', global: true, run: () => $('#cmd-input').focus() },
    // Dateien und Verlauf
    { id: 'undo', group: 'Dateien und Verlauf', label: 'Rückgängig', def: 'ctrl+z', global: true, run: () => App.undo() },
    { id: 'redo', group: 'Dateien und Verlauf', label: 'Wiederholen', def: 'ctrl+y', global: true, run: () => App.redo() },
    { id: 'save', group: 'Dateien und Verlauf', label: 'Projekt speichern', def: 'ctrl+s', global: true, run: () => Start.saveFile() },
    { id: 'export', group: 'Dateien und Verlauf', label: 'Exportieren (STEP und mehr)', def: 'ctrl+e', global: true, run: () => Print.exportDialog() },
  ];
  const SHORTCUT_MAP = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));
  const CMD_KBD_MAP = {
    sketch: 'sketch', measure: 'measure', notes: 'notes', dupLinked: 'dupLinked',
    hideSel: 'hideSel', showAll: 'hideSel', present: 'present', viewBack: 'viewBack',
    invertSel: 'invertSel', repeat: 'repeat', export: 'export', ortho: 'ortho',
    gridtoggle: 'gridtoggle', section: 'section', xray: 'xray', explode: 'explode',
    isolate: 'isolate', undo: 'undo', redo: 'redo', delete: 'delete', dup: 'dup',
    group: 'group', ungroup: 'ungroup', hole: 'hole', rot: 'rot', fit: 'fit', save: 'save',
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
  function build() {
    C.length = 0;
    for (const k of PRIMITIVE_ORDER) add('add-' + k, KINDS[k].label + ' hinzufügen', 'cube', 'körper form grundkörper ' + ({ box: 'würfel kasten block platte', cylinder: 'rund stab säule scheibe', sphere: 'ball', cone: 'spitze', pyramid: 'spitze', wedge: 'rampe dach schräge', tube: 'röhre ring hohl', torus: 'donut kringel', prism: 'sechseck achteck polygon', hemisphere: 'kuppel halbkugel' }[k] || ''), () => Actions.addPrimitive(k), { group: 'Körper' });
    add('add-hole', 'Loch (Zylinder) hinzufügen', 'hole', 'bohrung loch rund ausschnitt', () => Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }), { group: 'Körper' });
    for (const d of LIB.filter((x) => !x.buy && !x.drone)) add('lib-' + d.lib, d.label + ' hinzufügen', d.icon, 'bauteil ' + d.desc, () => Actions.addPart(d, libDefaults(d)), { group: 'Bauteile' });
    add('sketch', 'Skizze zeichnen', 'sketch', 'zeichnen 2d profil umriss extrudieren', () => Sketch.chooseAndStart(), { group: 'Werkzeuge', kbd: 'S' });
    add('sketch-check', 'Skizze prüfen (Lücken und doppelte Linien)', 'target', 'skizze prüfen pruefer lücke lücken offen doppelt reparieren fehler', () => { if (Sketch.active) Sketch.check(); else UI.toast('Öffne zuerst eine Skizze, um sie zu prüfen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-autodef', 'Skizze fertig bestimmen (Regeln & Maße vorschlagen)', 'lock', 'skizze fertig bestimmen voll bestimmt regeln masse auto', () => { if (Sketch.active) Sketch.autoDefine(); else UI.toast('Öffne zuerst eine Skizze, um sie fertig zu bestimmen.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('sketch-free', 'Freie Stellen zeigen (Wo fehlt ein Maß?)', 'unlock', 'skizze freie stellen wackeln freiheit fehlt maß unterbestimmt', () => { if (Sketch.active) Sketch.toggleFreeSpots(); else UI.toast('Öffne zuerst eine Skizze, um freie Stellen zu sehen.', { icon: 'info' }); }, { group: 'Werkzeuge', kbd: 'Umschalt F' });
    add('hole-wizard', 'Bohrungs-Assistent', 'holeWizard', 'bohrung loch schraube gewinde senkung einsatz mutter sackloch bohrspitze passbohrung h7 zentrierbohrung feingewinde zoll unc unf rohrgewinde', () => Place.holeWizard($('#t-parts')), { group: 'Bearbeiten' });
    add('cosmetic-thread', 'Gewinde markieren (kosmetisch)', 'thread', 'gewinde kosmetisch markieren metrisch m3 m4 m5 m6 m8 echt schraube', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'CYLINDRE') Features.threadPop(f, $('#center')); else UI.toast('Klick zuerst eine runde Fläche (Zylinder) an, um dort ein Gewinde zu markieren.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('thread-face', 'Gewinde auf runde Fläche …', 'thread', 'gewinde bolzen bohrung zylinder aussengewinde innengewinde steigung metrisch echt kosmetisch m10', () => { const f = Actions.selectedFace(); if (f && f.info && f.info.t === 'CYLINDRE') Features.threadPop(f, $('#center'), { mode: 'real' }); else UI.toast('Klick zuerst eine runde Fläche (Bolzen oder Bohrung) an, um dort ein Gewinde zu setzen.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('pattern-rect', 'Rechteckmuster', 'patternRect', 'muster reihe raster kopien vervielfachen', () => Features.pattern('rect'), { group: 'Bearbeiten' });
    add('pattern-circ', 'Kreismuster', 'patternCirc', 'muster kreis rund kopien löcher', () => Features.pattern('circ'), { group: 'Bearbeiten' });
    add('pattern-path', 'Muster entlang Kurve', 'patternPath', 'muster kurve pfad bogen entlang linie spline kette kopien löcher zähne', () => Features.patternPath(), { group: 'Bearbeiten' });
    add('mirror-copy', 'Gespiegelte Kopie', 'mirror', 'spiegeln kopie symmetrisch', () => Features.pattern('mirror'), { group: 'Bearbeiten' });
    add('mirror-step', 'Schritt spiegeln (Formschritt im selben Körper)', 'mirror', 'spiegeln schritt formschritt tasche loch rippe symmetrisch ebene fläche körper', () => Features.mirrorStep(), { group: 'Bearbeiten' });
    add('split', 'Körper teilen', 'split', 'teilen schneiden trennen hälfte', () => Features.split(), { group: 'Bearbeiten' });
    add('move-step', 'Verschieben/Drehen als Schritt', 'moveStep', 'verschieben drehen kopieren schritt transform versetzen bewegen lage verlauf', () => Features.transform(), { group: 'Bearbeiten' });
    add('scale-body', 'Körper skalieren (als Schritt)', 'scaleBody', 'skalieren groesser kleiner faktor achse strecken stauchen verlauf', () => Features.scale(), { group: 'Bearbeiten' });
    add('thicken-face', 'Fläche aufdicken (als Schritt)', 'thicken', 'aufdicken flaeche platte dicke schale wand aussen innen mittig verlauf', () => { const f = Actions.selectedFace(); if (f) Features.thicken(f); else UI.toast('Klick zuerst eine Fläche an, die aufgedickt werden soll.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('bool-sub', 'Abziehen (Boolesch)', 'boolSubtract', 'boolesch abziehen differenz', () => Features.boolean('subtract'), { group: 'Bearbeiten' });
    add('bool-int', 'Schnittmenge (Boolesch)', 'boolIntersect', 'boolesch schnittmenge', () => Features.boolean('intersect'), { group: 'Bearbeiten' });
    add('shell', 'Aushöhlen / Wandstärke', 'shell', 'wandstärke aushöhlen schale hohl gehäuse', () => { const f = Actions.selectedFace(); if (f) Features.shell(f); else UI.toast('Klick zuerst die Fläche an, die offen sein soll.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('rib', 'Rippe anlegen (Versteifung aus Linie)', 'rib', 'rippe steg versteifung schräge gehäuse schale wand', () => Features.startRib(), { group: 'Bearbeiten' });
    add('wrap-cyl', 'Um Zylinder wickeln (Prägung oder Linie)', 'wrap', 'wickeln zylinder prägen prägung erhaben vertieft gravieren linie kurve mantel abwickeln', () => Features.startWrap(), { group: 'Bearbeiten' });
    add('emboss', 'Prägen auf Fläche (Text / Logo)', 'emboss', 'praegen prägen text logo gravur gravieren erhaben vertieft zylinder kugel flaeche gewölbt emboss deboss', () => { const f = Actions.selectedFace(); if (f) Features.startEmboss(f); else UI.toast('Klick zuerst eine Fläche an (z. B. einen Zylindermantel oder eine Kugel).', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('reffix', 'Kaputten Bezug neu wählen', 'warn', 'kaputt bezug neu wählen kante fläche warnung gelb rundung fase skizze', () => {
      const selIssue = App.sel.length ? RefFix.issuesOf(App.sel[0])[0] : null;
      const iss = selIssue || RefFix.allIssues()[0];
      if (iss) RefFix.start(iss);
      else UI.toast('Alle Bezüge sind in Ordnung.', { icon: 'check' });
    }, { group: 'Bearbeiten' });
    add('measure', 'Messen', 'measure', 'abstand länge durchmesser lineal', () => Measure.toggle(), { group: 'Werkzeuge', kbd: 'M' });
    add('notes', 'Notizstift', 'noteDraw', 'notiz stift malen zeichnen kritzeln text markieren hinweis', () => Notes.toggle(), { group: 'Werkzeuge', kbd: 'N' });
    add('notes-show', 'Notizen ein- oder ausblenden', 'notesShow', 'notizen zeigen verstecken ausblenden', () => ViewPrefs.toggle('notes'), { group: 'Ansicht' });
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
    add('datum-csys', 'Eigenes Koordinatensystem anlegen', 'axes', 'koordinatensystem nullpunkt ursprung achsen export step stl 3mf', () => Datums.csysDialog(), { group: 'Werkzeuge' });
    add('image', 'Bild speichern (PNG)', 'image', 'bild png foto screenshot rendering präsentation hintergrund durchsichtig', () => Print.imageDialog(), { group: 'Werkzeuge' });
    add('export', 'Exportieren (STEP, IGES, BREP, STL, 3MF, OBJ, GLB, DXF)', 'export', 'step igs iges brep stl 3mf obj mtl glb gltf dxf platten fräse laser exportieren speichern download', () => Print.exportDialog(), { group: 'Werkzeuge', kbd: 'Strg E' });
    add('status', 'Modell-Status', 'info', 'status prüfen größe fehler', () => $('#ampel').click(), { group: 'Werkzeuge' });
    add('drop', 'Auf die XY-Ebene setzen', 'push', 'boden unten absetzen z null ebene', () => Actions.dropToPlate(null), { group: 'Werkzeuge' });
    add('ortho', 'Orthografisch / Perspektive', 'viewOrtho', 'ortho perspektive projektion kamera', () => ViewPrefs.toggle('ortho'), { group: 'Ansicht', kbd: 'O' });
    add('gridtoggle', 'Raster ein/aus', 'grid', 'raster gitter grid', () => ViewPrefs.toggle('gridOn'), { group: 'Ansicht', kbd: 'G' });
    add('section', 'Schnitt ein/aus', 'section', 'schnitt aufschneiden querschnitt innen schnittebene', () => Views.section(), { group: 'Ansicht', kbd: 'C' });
    add('xray', 'Röntgen ein/aus', 'xray', 'röntgen durchsichtig transparent glas innen', () => Views.xray(), { group: 'Ansicht', kbd: 'X' });
    add('explode', 'Explosion: Teile auseinanderziehen', 'explode', 'explosion explosionsansicht auseinander zerlegen baugruppe', () => Views.explode(), { group: 'Ansicht', kbd: 'U' });
    add('verbund-alle', 'Alles zu einem Körper verbinden (Verbund)', 'group', 'verbund verbinden alles zusammen zusammenfügen ein körper vereinigen gruppieren alle', () => Actions.groupAll(), { group: 'Bearbeiten' });
    add('variants', 'Varianten vergleichen', 'list', 'variante varianten vergleichen maße sätze schritte unterdrücken', () => Variants.compareDialog(), { group: 'Projekt' });
    add('explain', 'Erklär diesen Schritt', 'help', 'erklär erklären was ist das schritt warum', () => Explain.dialog(), { group: 'Projekt' });
    add('weak', 'Schwachstellen suchen', 'target', 'schwachstellen schwach prüfen bruch dünn rand loch festigkeit stabil', () => Weak.dialog(), { group: 'Projekt' });
    add('geom-check', 'Geometrie prüfen (kaputte Flächen, winzige Kanten)', 'target', 'geometrie prüfen check kaputt fläche kante winzig selbstschnitt brep fehler', () => GeomCheck.open(), { group: 'Projekt' });
    add('versions', 'Versionen: speichern, vergleichen, zurückholen', 'rollback', 'version versionen stand vergleichen zurück sichern', () => Versions.dialog(), { group: 'Projekt' });
    add('version-save', 'Jetzigen Stand als Version speichern', 'save', 'version speichern sichern stand', async () => { const n = await UI.prompt('Version speichern', 'Name der Version', 'Version ' + (Versions.list().length + 1), 'Speichern'); if (n != null) Versions.save(n); }, { group: 'Projekt' });
    add('chain', 'Kantenkette wählen', 'chainEdges', 'kette kanten umriss tangential rand alle zusammen', () => Select.chain(), { group: 'Bearbeiten', needSel: true });
    add('similar', 'Ähnliche auswählen', 'similar', 'ähnliche gleiche alle auswählen bohrungen kanten', () => Select.similar(), { group: 'Bearbeiten', kbd: 'A', needSel: true });
    add('filter-body', 'Auswahlfilter: nur Körper', 'cube', 'filter auswahl körper', () => Select.setFilter('body'), { group: 'Ansicht' });
    add('filter-face', 'Auswahlfilter: nur Flächen', 'planeXY', 'filter auswahl flächen', () => Select.setFilter('face'), { group: 'Ansicht' });
    add('filter-edge', 'Auswahlfilter: nur Kanten', 'line', 'filter auswahl kanten', () => Select.setFilter('edge'), { group: 'Ansicht' });
    add('filter-all', 'Auswahlfilter aus (alles wählen)', 'pointer', 'filter auswahl alles', () => Select.setFilter('all'), { group: 'Ansicht' });
    add('focus', 'Fokus-Vorschau ein/aus', 'focusView', 'fokus vorschau zweites fenster lupe groß', () => Views.focus(), { group: 'Ansicht' });
    add('planes', 'Ursprungsebenen ein/aus', 'originPlanes', 'ursprung ebenen xy xz yz origin', () => ViewPrefs.toggle('planes'), { group: 'Ansicht' });
    add('axes', 'Achsen ein/aus', 'axes', 'achsen x y z', () => ViewPrefs.toggle('axes'), { group: 'Ansicht' });
    add('newcomp', 'Neues Bauteil', 'parts', 'bauteil komponente baugruppe component neu', () => Comp.newComponent(), { group: 'Werkzeuge' });
    add('editcomp', 'Gewählte Gruppe als Bauteil bearbeiten', 'edit', 'bauteil bearbeiten kontext', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (t && t.kind === 'group') Comp.edit(t.id); else UI.toast('Wähle zuerst eine Gruppe oder ein Bauteil aus.', { icon: 'info' }); }, { group: 'Werkzeuge' });
    add('isolate', 'Gewähltes Teil isolieren', 'focusView', 'isolieren nur dieses zeigen', () => { const t = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (t) Comp.toggleIso(t.id); }, { group: 'Ansicht' });
    add('drawing', 'Technische Zeichnung öffnen', 'sheet', 'zeichnung ansichten bemaßung pdf dreitafel', () => setMode('drawing'), { group: 'Werkzeuge' });
    add('model', 'Zurück zum Modell', 'cube', 'modell 3d', () => setMode('model'), { group: 'Werkzeuge' });
    add('params', 'Maße mit Namen festlegen', 'sliders', 'parameter variable formel maß', () => Panels.showParams(), { group: 'Werkzeuge' });
    for (const [uk, un] of Units.OPTIONS) add('unit-' + uk, 'Einheit: ' + un, 'ruler', 'einheit einheiten mm cm m zoll inch ' + uk, () => Units.set(uk), { group: 'Projekt' });
    add('undo', 'Rückgängig', 'undo', 'zurück', () => App.undo(), { group: 'Bearbeiten', kbd: 'Strg Z' });
    add('redo', 'Wiederholen', 'redo', 'vor', () => App.redo(), { group: 'Bearbeiten', kbd: 'Strg Y' });
    add('delete', 'Auswahl löschen', 'trash', 'entfernen weg', () => Actions.remove(), { group: 'Bearbeiten', kbd: 'Entf', needSel: true });
    add('dup', 'Duplizieren', 'copy', 'kopieren kopie', () => Actions.duplicate(), { group: 'Bearbeiten', kbd: 'Strg D', needSel: true });
    add('tree-folder', 'In Ordner legen', 'folder', 'ordner verlauf schritte zusammenfassen gruppieren', () => Actions.createFolder(), { group: 'Verlauf', needSel: true });
    add('group', 'Gruppieren', 'group', 'verbinden vereinen zusammenfügen kombinieren', () => Actions.group(), { group: 'Bearbeiten', kbd: 'Strg G', needSel: true });
    add('ungroup', 'Gruppe lösen', 'ungroup', 'trennen auflösen', () => Actions.ungroup(), { group: 'Bearbeiten', needSel: true });
    add('hole', 'Zwischen Körper und Loch wechseln', 'hole', 'loch körper umschalten aussparung', () => Actions.toggleRole(), { group: 'Bearbeiten', kbd: 'H', needSel: true });
    add('rot', 'Um 90° drehen', 'rotate', 'drehen rotieren', () => Actions.rotate90(null, 'z'), { group: 'Bearbeiten', kbd: 'R', needSel: true });
    add('mirror', 'Spiegeln', 'mirror', 'spiegel umdrehen', () => Actions.mirror(null, 'x'), { group: 'Bearbeiten', needSel: true });
    add('fillet', 'Kanten abrunden', 'fillet', 'runden rundung verrunden fillet', () => { if (App.edges.length) Actions.addFinish('fillet', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('chamfer', 'Kanten abschrägen', 'chamfer', 'fase anfasen schräge', () => { if (App.edges.length) Actions.addFinish('chamfer', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'chamfer', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('fit', 'Alles zeigen', 'fit', 'zoom ansicht einpassen', () => Viewer.fit(), { group: 'Ansicht', kbd: 'F' });
    add('toolbar-customize', 'Werkzeugleiste anpassen', 'sliders', 'werkzeugleiste leiste anpassen favoriten stern sortieren zurücksetzen', () => Toolbar.dialog(), { group: 'Ansicht' });
    for (const [v, l] of [['front', 'Vorne'], ['top', 'Oben'], ['right', 'Rechts'], ['left', 'Links'], ['back', 'Hinten'], ['iso', 'Schräg']]) add('view-' + v, 'Ansicht ' + l, 'eye', 'ansicht kamera blick ' + l, () => Viewer.setView(v), { group: 'Ansicht' });
    add('new', 'Neues Projekt', 'newfile', 'neu leer vorlage vorlagen zoll 3d-druck laser gehäuse anfangen', () => Start.newProjectDialog(), { group: 'Projekt' });
    add('save-template', 'Als Vorlage speichern', 'save', 'vorlage speichern eigene vorlage template', () => Start.saveAsTemplate(), { group: 'Projekt' });
    add('open', 'Projekt öffnen', 'folder', 'laden datei öffnen', () => Start.openFile(), { group: 'Projekt' });
    add('loft', 'Übergang (Loft) aus gewählten Skizzenkörpern', 'loft', 'loft übergang profile nase verbinden spitze', () => Actions.loft(), { group: 'Bearbeiten', needSel: true });
    add('loft-tip', 'Zur Spitze zusammenlaufen lassen', 'loft', 'spitze kegel nase verlängern zuspitzen', () => { if (App.sel.length === 1) Actions.loft([App.sel[0]], { tip: 10 }); }, { group: 'Bearbeiten', needSel: true });
    add('draft', 'Entformungsschräge', 'chamfer', 'schräge entformung guss form draft konisch neigen', () => { if (App.sel.length) Actions.finishAll(App.sel[0], 'draft', 'all', 3); }, { group: 'Bearbeiten', needSel: true });
    add('gap', 'Abstand zwischen zwei Teilen setzen', 'dim', 'abstand lücke distanz zwischen zwei teile', () => { if (App.sel.length === 2) $('.ctxbar button[aria-label="Abstand"]') && $('.ctxbar button[aria-label="Abstand"]').click(); else UI.toast('Wähle genau zwei Teile.', { icon: 'info' }); }, { group: 'Bearbeiten', needSel: true });
    add('route3d', 'Rohr im Raum: Punkte auf Körper oder in den Raum klicken', 'sweep', 'rohr raum 3d pfad kabel kanal punkte biegen', () => Features.route3d(), { group: 'Werkzeuge' });
    add('sweep-help', 'Rohr oder Kanal entlang Pfad (Sweep)', 'sweep', 'sweep pfad rohr kabelkanal bügel entlang', () => { Sketch.chooseAndStart(); UI.toast('Zeichne einen offenen Pfad und klick „Fertig“ – daraus wird ein Rohr.', { icon: 'info', ms: 5000 }); }, { group: 'Werkzeuge' });
    add('import', 'STEP, IGES, BREP, STL, 3MF oder OBJ importieren', 'folder', 'import step stp igs iges brep stl 3mf obj datei einlesen', () => Start.openFile(), { group: 'Projekt' });
    add('import-check', 'Import prüfen (offene Kanten, Lücken, Flächen)', 'warn', 'import pruefen brepcheck offene kanten luecken flaechen', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'import') Start.checkImport(f.item.id); else UI.toast('Wähle zuerst ein importiertes Teil.', { icon: 'info' }); }, { group: 'Projekt', when: () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); return !!(f && f.item && f.item.kind === 'import'); } });
    add('import-heal', 'Import heilen (Nähen & reparieren)', 'spark', 'import heilen reparieren naehen shapefix toleranz luecken schliessen', () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); if (f && f.item.kind === 'import') Start.healImport(f.item.id); else UI.toast('Wähle zuerst ein importiertes Teil.', { icon: 'info' }); }, { group: 'Projekt', when: () => { const f = App.sel.length === 1 && Model.find(App.doc, App.sel[0]); return !!(f && f.item && f.item.kind === 'import'); } });
    add('save', 'Projekt als Datei speichern', 'save', 'sichern json datei', () => Start.saveFile(), { group: 'Projekt', kbd: 'Strg S' });
    add('save-folder', 'In Ordner speichern …', 'folder', 'ordner automatisch speichern sichern sync datei', () => Start.saveToFolder(), { group: 'Projekt', when: () => Start.folderSupported() });
    add('start', 'Startseite und Vorlagen', 'home', 'vorlagen beispiele start', () => Start.show(), { group: 'Projekt' });
    add('tour', 'Einführung starten', 'play', 'hilfe tutorial einführung lernen', () => Tour.start(), { group: 'Hilfe' });
    add('tour-sketch', 'Einführung: Deine erste Skizze', 'sketch', 'hilfe tutorial einführung lernen skizze maß formel', () => Tour.start('sketch'), { group: 'Hilfe' });
    add('keys', 'Tastenkürzel anzeigen', 'help', 'hilfe tasten kürzel', () => showKeys(), { group: 'Hilfe' });
  }
  function score(c, q) {
    if (!q) return 0;
    const words = q.split(/\s+/).filter(Boolean); let s = 0;
    for (const w of words) { const i = c.keys.indexOf(w); if (i < 0) return -1; s += i === 0 ? 3 : c.keys[i - 1] === ' ' ? 2 : 1; }
    return s + (normTxt(c.label).startsWith(q) ? 5 : 0);
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
    if (e.key === 'Escape') { if (RefFix.picking) RefFix.stop(); else if (Place.active) Place.cancel(); else if (Measure.active) Measure.stop(); else if (!App.sel.length && App.ctx) App.setCtx(null); else if (!App.sel.length && App.iso) App.setIso(null); else { Panels.closeFlyout(); App.clearSelection(); } return; }
    const mHit = combo && SHORTCUTS.find((s) => !s.global && getCombo(s.id) === combo);
    if (mHit) {
      const res = mHit.run();
      if (res !== false) e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && !mod && !e.altKey && !e.shiftKey && getCombo('delete') === 'delete') { if (App.sel.length) { e.preventDefault(); Actions.remove(); } return; }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown'].includes(k) && App.sel.length) {
      e.preventDefault();
      const g = (App.doc.settings.grid || 1) * (e.shiftKey ? 10 : 1);
      const d = { arrowleft: [-g, 0, 0], arrowright: [g, 0, 0], arrowup: [0, g, 0], arrowdown: [0, -g, 0], pageup: [0, 0, g], pagedown: [0, 0, -g] }[k];
      App.change('Verschoben', (doc) => { for (const id of App.sel) { const f = Model.find(doc, id); if (!f || f.item.locked) continue; const PW = Model.parentWorld(doc, id); const q = new THREE.Quaternion(); PW.decompose(new THREE.Vector3(), q, new THREE.Vector3()); const v = new THREE.Vector3(...d).applyQuaternion(q.invert()); const tn = Model.tNumeric(f.item); f.item.t.x = round(tn.x + v.x, 4); f.item.t.y = round(tn.y + v.y, 4); f.item.t.z = round(tn.z + v.z, 4); } }, { merge: 'nudge' });
    }
  }
  function showKeys() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const M = mac ? '⌘' : 'Strg';
    const K = (id) => keyLabel(id, true);
    const groups = [
      ['Ansicht', [['Linke Maustaste ziehen', 'Ansicht drehen'], ['Rechte Maustaste ziehen', 'Ansicht verschieben'], ['Mausrad', 'Zoomen'], [K('fit'), 'Auswahl oder alles zeigen'], [K('viewBack'), 'Vorige Ansicht'], [K('present'), 'Vorführen (Vollbild, dreht langsam)'], [`${K('view-front')} · ${K('view-right')} · ${K('view-top')} · ${K('view-iso')}`, 'Ansicht vorne · rechts · oben · schräg'], [K('ortho'), 'Orthografisch / Perspektive'], [K('gridtoggle'), 'Raster ein / aus'], [K('section'), 'Schnitt ein / aus'], [K('xray'), 'Röntgen ein / aus'], [K('explode'), 'Explosion ein / aus'], [K('isolate'), 'Gewähltes Teil isolieren / alle zeigen']]],
      ['Modell', [['Klicken', 'Körper, Fläche oder Kante wählen'], ['Umschalt + Klick', 'Mehrere wählen'], ['Alt + Klick', 'Das Teil dahinter wählen (nochmal: noch weiter dahinter)'], ['Umschalt + Ziehen im Leeren', 'Rahmen: nach rechts ganz drin, nach links berührt'], ['Rechtsklick', 'Menü zum Teil oder zum Bild'], [K('repeat'), 'Letzten Befehl wiederholen'], [K('hideSel'), 'Auswahl ausblenden · ohne Auswahl alles einblenden'], [K('invertSel'), 'Auswahl umkehren'], [K('dupLinked'), 'Verknüpft duplizieren'], ['Ziehen', 'Körper verschieben – dabei Zahl tippen für genaue Werte'], ['Doppelklick', 'Skizze eines Skizzenkörpers bearbeiten · auf eine ebene Fläche: darauf zeichnen'], [K('editItem'), 'Skizze bzw. Bauteil bearbeiten'], ['Esc', 'Auswahl aufheben · Bauteil verlassen'], [K('delete'), 'Löschen'], [K('hole'), 'Körper ↔ Loch'], [K('similar'), 'Ähnliche auswählen (gleiche Teile oder Kanten)'], [K('rot'), 'Um 90° drehen'], ['Pfeiltasten', 'Um einen Rasterschritt verschieben (Umschalt: 10)'], ['Bild ↑ / Bild ↓', 'Anheben / Absenken'], [K('dup'), 'Duplizieren'], [`${K('group')} · ${K('ungroup')}`, 'Gruppieren · Gruppe lösen'], [K('selectAll'), 'Alles wählen']]],
      ['Werkzeuge', [[K('sketch'), 'Skizze'], [K('measure'), 'Messen'], [K('notes'), 'Notizstift (P Stift · T Text · E Radierer)'], [K('bodies'), 'Körper'], [K('parts'), 'Bauteile'], ['/ oder ' + K('cmdFocus'), 'Eingabezeile']]],
      ['In der Skizze', [['V', 'Auswahl'], ['L · R · C · A', 'Linie · Rechteck · Kreis · Bogen'], ['A (beim Linienzug)', 'Zwischen Linie und tangentialem Bogen wechseln'], ['G · P · S', 'Langloch · Vieleck · Spline'], ['T · F', 'Trimmen · Versatz'], ['M · Q · W', 'Spiegeln · Rechteckmuster · Kreismuster'], ['H', 'Verschieben oder drehen (Doppelklick wählt die ganze Kette)'], ['Umschalt F', 'Freie Stellen zeigen (wo noch ein Maß fehlt)'], [M + ' C · V', 'Elemente kopieren · einfügen (auch in eine andere Skizze)'], ['X', 'Hilfslinie (neue Elemente oder das gewählte)'], ['Alt halten', 'Nicht einrasten'], ['D', 'Maß festlegen (auch Formel)'], ['Zahl tippen', 'Genaue Länge beim Zeichnen'], ['Tab', 'Nächstes Eingabefeld'], ['Umschalt halten', 'Feiner einrasten'], ['Enter', 'Linienzug beenden · Skizze fertig'], ['Esc', 'Zeichnen abbrechen · Skizze verlassen']]],
      ['Dateien und Verlauf', [[K('undo'), 'Rückgängig'], [K('redo'), 'Wiederholen'], [K('save'), 'Projekt speichern'], [K('export'), 'Exportieren (STEP und mehr)'], ['?', 'Diese Übersicht']]],
    ];
    const t = h('div', { class: 'keys-grid' });
    for (const [title, rows] of groups) {
      const sec = h('div', { class: 'keys-sec' }, h('div', { class: 'section-h' }, title));
      for (const [a, b] of rows) sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'kbd' }, a), h('span', { class: 'grow' }, b)));
      t.append(sec);
    }
    const acts = ViewPrefs.simple ? [{ label: 'Schließen', primary: true }] : [{ label: 'Kürzel ändern …', run: () => { setTimeout(() => ViewPrefs.dialog('keys'), 0); } }, { label: 'Schließen', primary: true }];
    UI.modal({ title: 'Tastenkürzel', body: t, actions: acts });
  }
  // Editor für Einstellungen → Tastenkürzel (nur Profi-Stufe)
  function renderShortcutsEditor(container) {
    container.innerHTML = '';
    let listening = null;
    const msgEl = h('div', { class: 'kbd-msg', id: 'kbd-msg', role: 'alert', hidden: true });
    const filterInp = h('input', { type: 'text', id: 'kbd-filter', placeholder: 'Befehl suchen …', autocomplete: 'off', spellcheck: 'false' });
    const resetBtn = h('button', { type: 'button', class: 'btn small', id: 'kbd-reset' }, 'Zurücksetzen');
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
        showMsg('Diese Taste kann nicht als Kürzel vergeben werden.');
        return;
      }
      const res = setShortcut(id, combo);
      if (!res.ok) {
        stopCapture();
        const txt = `Tastenkürzel „${formatCombo(combo)}“ ist schon für „${res.conflict.label}“ belegt.`;
        showMsg(txt);
        UI.toast(txt, { kind: 'bad', icon: 'warn', ms: 3200 });
        const row = listEl.querySelector(`.kbd-row[data-cmd="${res.conflict.id}"]`);
        if (row) { row.classList.add('conflict'); setTimeout(() => row.classList.remove('conflict'), 1800); }
        return;
      }
      stopCapture();
      showMsg('');
      refreshButtons();
      UI.toast(`Kürzel für „${SHORTCUT_MAP[id].label}“: ${res.labelKey}`, { icon: 'check', ms: 1800 });
    }
    const startCapture = (id, btn) => {
      const same = listening === id;
      stopCapture();
      showMsg('');
      if (same) return;
      listening = id;
      btn.classList.add('listening');
      btn.textContent = 'Taste drücken …';
      window.addEventListener('keydown', onCapture, true);
    };

    const groups = ['Ansicht', 'Modell', 'Werkzeuge', 'Dateien und Verlauf'];
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
      UI.toast('Alle Tastenkürzel zurückgesetzt.', { icon: 'check', ms: 1800 });
    };

    container.append(
      h('small', { style: { color: 'var(--muted)' } }, 'Klick auf ein Kürzel und drück die neue Taste. Esc bricht die Eingabe ab.'),
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
    if (Notes.active) Notes.stop();
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
  return { init, search, setMode, showKeys, list: () => C, exec, repeat, shortcuts, setShortcut, resetShortcuts, keyLabel, eventToCombo, formatCombo, renderShortcutsEditor, syncCmdKbds, get last() { return last; }, get recent() { return recent.slice(); } };
})();

