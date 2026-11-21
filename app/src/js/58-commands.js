// ================= Befehle, Eingabezeile, Tastatur =================
const Commands = (() => {
  const C = [];
  const add = (id, label, icon, keys, run, opts = {}) => C.push({ id, label, icon, keys: normTxt(label + ' ' + keys), run, ...opts });
  function build() {
    C.length = 0;
    for (const k of PRIMITIVE_ORDER) add('add-' + k, KINDS[k].label + ' hinzufügen', 'cube', 'körper form grundkörper ' + ({ box: 'würfel kasten block platte', cylinder: 'rund stab säule scheibe', sphere: 'ball', cone: 'spitze', pyramid: 'spitze', wedge: 'rampe dach schräge', tube: 'röhre ring hohl', torus: 'donut kringel', prism: 'sechseck achteck polygon', hemisphere: 'kuppel halbkugel' }[k] || ''), () => Actions.addPrimitive(k), { group: 'Körper' });
    add('add-hole', 'Loch (Zylinder) hinzufügen', 'hole', 'bohrung loch rund ausschnitt', () => Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }), { group: 'Körper' });
    for (const d of LIB.filter((x) => !x.buy)) add('lib-' + d.lib, d.label + ' hinzufügen', d.icon, 'bauteil ' + d.desc, () => Actions.addPart(d, libDefaults(d)), { group: 'Bauteile' });
    add('sketch', 'Skizze zeichnen', 'sketch', 'zeichnen 2d profil umriss extrudieren', () => Sketch.chooseAndStart(), { group: 'Werkzeuge', kbd: 'S' });
    add('hole-wizard', 'Bohrungs-Assistent', 'holeWizard', 'bohrung loch schraube gewinde senkung einsatz mutter', () => Place.holeWizard($('#t-parts')), { group: 'Bearbeiten' });
    add('pattern-rect', 'Rechteckmuster', 'patternRect', 'muster reihe raster kopien vervielfachen', () => Features.pattern('rect'), { group: 'Bearbeiten' });
    add('pattern-circ', 'Kreismuster', 'patternCirc', 'muster kreis rund kopien motor löcher', () => Features.pattern('circ'), { group: 'Bearbeiten' });
    add('pattern-path', 'Muster entlang Kurve', 'patternPath', 'muster kurve pfad bogen entlang linie spline kette kopien löcher zähne', () => Features.patternPath(), { group: 'Bearbeiten' });
    add('mirror-copy', 'Gespiegelte Kopie', 'mirror', 'spiegeln kopie symmetrisch', () => Features.pattern('mirror'), { group: 'Bearbeiten' });
    add('split', 'Körper teilen', 'split', 'teilen schneiden trennen hälfte', () => Features.split(), { group: 'Bearbeiten' });
    add('bool-sub', 'Abziehen (Boolesch)', 'boolSubtract', 'boolesch abziehen differenz', () => Features.boolean('subtract'), { group: 'Bearbeiten' });
    add('bool-int', 'Schnittmenge (Boolesch)', 'boolIntersect', 'boolesch schnittmenge', () => Features.boolean('intersect'), { group: 'Bearbeiten' });
    add('shell', 'Aushöhlen / Wandstärke', 'shell', 'wandstärke aushöhlen schale hohl gehäuse', () => { const f = Actions.selectedFace(); if (f) Features.shell(f); else UI.toast('Klick zuerst die Fläche an, die offen sein soll.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('measure', 'Messen', 'measure', 'abstand länge durchmesser lineal', () => Measure.toggle(), { group: 'Werkzeuge', kbd: 'M' });
    add('notes', 'Notizstift', 'noteDraw', 'notiz stift malen zeichnen kritzeln text markieren hinweis', () => Notes.toggle(), { group: 'Werkzeuge', kbd: 'N' });
    add('notes-show', 'Notizen ein- oder ausblenden', 'notesShow', 'notizen zeigen verstecken ausblenden', () => ViewPrefs.toggle('notes'), { group: 'Ansicht' });
    add('bom', 'Stückliste (alle Teile mit Anzahl und Gewicht)', 'list', 'stückliste teileliste bom einkaufsliste gewicht tabelle csv', () => Mass.bomDialog(), { group: 'Werkzeuge' });
    add('export', 'Exportieren (STEP, STL, 3MF, DXF)', 'export', 'step stl 3mf dxf platten fräse laser exportieren speichern download', () => Print.exportDialog(), { group: 'Werkzeuge', kbd: 'Strg E' });
    add('status', 'Modell-Status', 'info', 'status prüfen größe fehler', () => $('#ampel').click(), { group: 'Werkzeuge' });
    add('drop', 'Auf die XY-Ebene setzen', 'push', 'boden unten absetzen z null ebene', () => Actions.dropToPlate(null), { group: 'Werkzeuge' });
    add('ortho', 'Orthografisch / Perspektive', 'viewOrtho', 'ortho perspektive projektion kamera', () => ViewPrefs.toggle('ortho'), { group: 'Ansicht', kbd: 'O' });
    add('gridtoggle', 'Raster ein/aus', 'grid', 'raster gitter grid', () => ViewPrefs.toggle('gridOn'), { group: 'Ansicht', kbd: 'G' });
    add('section', 'Schnitt ein/aus', 'section', 'schnitt aufschneiden querschnitt innen schnittebene', () => Views.section(), { group: 'Ansicht', kbd: 'C' });
    add('xray', 'Röntgen ein/aus', 'xray', 'röntgen durchsichtig transparent glas innen', () => Views.xray(), { group: 'Ansicht', kbd: 'X' });
    add('explode', 'Explosion: Teile auseinanderziehen', 'explode', 'explosion explosionsansicht auseinander zerlegen baugruppe', () => Views.explode(), { group: 'Ansicht', kbd: 'U' });
    add('frame-assist', 'Frame-Assistent: Drohnenrahmen bauen', 'frame', 'frame assistent drohne rahmen bauen quad zoll', () => DroneUI.assistant(), { group: 'Projekt' });
    add('drone-lib', 'Drohnen-Teile: Motoren, Akkus, Videosender …', 'drone', 'motor akku videosender kamera empfänger gps kaufteil bibliothek', () => Panels.toggleFlyout('drone', $('#t-drone')), { group: 'Werkzeuge' });
    for (const t of DroneTpl.LIST) add('tpl-' + t.id, 'Drohnen-Vorlage: ' + t.name, 'drone', 'drohne vorlage rahmen frame quad ' + t.name.toLowerCase(), () => Start.openDrone(t), { group: 'Projekt' });
    add('verbund-alle', 'Alles zu einem Körper verbinden (Verbund)', 'group', 'verbund verbinden alles zusammen zusammenfügen ein körper vereinigen gruppieren alle', () => Actions.groupAll(), { group: 'Bearbeiten' });
    add('drone-check', 'Drohnen-Check: Propeller, Gewicht, Schwerpunkt, Schub', 'clearance', 'check prüfen drohne propeller abstand kollision gewicht schwerpunkt schub', () => DroneCheck.dialog(), { group: 'Projekt' });
    add('variants', 'Varianten vergleichen', 'list', 'variante varianten vergleichen maße sätze', () => Variants.compareDialog(), { group: 'Projekt' });
    add('explain', 'Erklär diesen Schritt', 'help', 'erklär erklären was ist das schritt warum', () => Explain.dialog(), { group: 'Projekt' });
    add('weak', 'Schwachstellen suchen', 'target', 'schwachstellen schwach prüfen bruch dünn rand loch festigkeit stabil', () => Weak.dialog(), { group: 'Projekt' });
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
    add('undo', 'Rückgängig', 'undo', 'zurück', () => App.undo(), { group: 'Bearbeiten', kbd: 'Strg Z' });
    add('redo', 'Wiederholen', 'redo', 'vor', () => App.redo(), { group: 'Bearbeiten', kbd: 'Strg Y' });
    add('delete', 'Auswahl löschen', 'trash', 'entfernen weg', () => Actions.remove(), { group: 'Bearbeiten', kbd: 'Entf', needSel: true });
    add('dup', 'Duplizieren', 'copy', 'kopieren kopie', () => Actions.duplicate(), { group: 'Bearbeiten', kbd: 'Strg D', needSel: true });
    add('group', 'Gruppieren', 'group', 'verbinden vereinen zusammenfügen kombinieren', () => Actions.group(), { group: 'Bearbeiten', kbd: 'Strg G', needSel: true });
    add('ungroup', 'Gruppe lösen', 'ungroup', 'trennen auflösen', () => Actions.ungroup(), { group: 'Bearbeiten', needSel: true });
    add('hole', 'Zwischen Körper und Loch wechseln', 'hole', 'loch körper umschalten aussparung', () => Actions.toggleRole(), { group: 'Bearbeiten', kbd: 'H', needSel: true });
    add('rot', 'Um 90° drehen', 'rotate', 'drehen rotieren', () => Actions.rotate90(null, 'z'), { group: 'Bearbeiten', kbd: 'R', needSel: true });
    add('mirror', 'Spiegeln', 'mirror', 'spiegel umdrehen', () => Actions.mirror(null, 'x'), { group: 'Bearbeiten', needSel: true });
    add('fillet', 'Kanten abrunden', 'fillet', 'runden rundung verrunden fillet', () => { if (App.edges.length) Actions.addFinish('fillet', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'fillet', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('chamfer', 'Kanten abschrägen', 'chamfer', 'fase anfasen schräge', () => { if (App.edges.length) Actions.addFinish('chamfer', 1); else if (App.sel.length) Actions.finishAll(App.sel[0], 'chamfer', 'all', 1); else UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' }); }, { group: 'Bearbeiten' });
    add('fit', 'Alles zeigen', 'fit', 'zoom ansicht einpassen', () => Viewer.fit(), { group: 'Ansicht', kbd: 'F' });
    for (const [v, l] of [['front', 'Vorne'], ['top', 'Oben'], ['right', 'Rechts'], ['left', 'Links'], ['back', 'Hinten'], ['iso', 'Schräg']]) add('view-' + v, 'Ansicht ' + l, 'eye', 'ansicht kamera blick ' + l, () => Viewer.setView(v), { group: 'Ansicht' });
    add('new', 'Neues Projekt', 'newfile', 'neu leer anfangen', () => Start.newProject(), { group: 'Projekt' });
    add('open', 'Projekt öffnen', 'folder', 'laden datei öffnen', () => Start.openFile(), { group: 'Projekt' });
    add('loft', 'Übergang (Loft) aus gewählten Skizzenkörpern', 'loft', 'loft übergang profile nase verbinden spitze', () => Actions.loft(), { group: 'Bearbeiten', needSel: true });
    add('loft-tip', 'Zur Spitze zusammenlaufen lassen', 'loft', 'spitze kegel nase verlängern zuspitzen', () => { if (App.sel.length === 1) Actions.loft([App.sel[0]], { tip: 10 }); }, { group: 'Bearbeiten', needSel: true });
    add('draft', 'Entformungsschräge', 'chamfer', 'schräge entformung guss form draft konisch neigen', () => { if (App.sel.length) Actions.finishAll(App.sel[0], 'draft', 'all', 3); }, { group: 'Bearbeiten', needSel: true });
    add('gap', 'Abstand zwischen zwei Teilen setzen', 'dim', 'abstand lücke distanz zwischen zwei teile', () => { if (App.sel.length === 2) $('.ctxbar button[aria-label="Abstand"]') && $('.ctxbar button[aria-label="Abstand"]').click(); else UI.toast('Wähle genau zwei Teile.', { icon: 'info' }); }, { group: 'Bearbeiten', needSel: true });
    add('route3d', 'Rohr im Raum: Punkte auf Körper oder in den Raum klicken', 'sweep', 'rohr raum 3d pfad kabel kanal antenne punkte biegen', () => Features.route3d(), { group: 'Werkzeuge' });
    add('sweep-help', 'Rohr oder Kanal entlang Pfad (Sweep)', 'sweep', 'sweep pfad rohr kabelkanal bügel entlang', () => { Sketch.chooseAndStart(); UI.toast('Zeichne einen offenen Pfad und klick „Fertig“ – daraus wird ein Rohr.', { icon: 'info', ms: 5000 }); }, { group: 'Werkzeuge' });
    add('import', 'STEP oder STL importieren', 'folder', 'import step stp stl datei einlesen motor', () => Start.openFile(), { group: 'Projekt' });
    add('save', 'Projekt als Datei speichern', 'save', 'sichern json datei', () => Start.saveFile(), { group: 'Projekt', kbd: 'Strg S' });
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
    const top = C.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0 && (!x.c.needSel || App.sel.length)).sort((a, b) => b.s - a.s).slice(0, 6);
    // Treffer derselben Gruppe zusammenhalten (Gruppen in der Reihenfolge ihres besten Treffers)
    const order = []; for (const x of top) if (!order.includes(x.c.group)) order.push(x.c.group);
    return top.sort((a, b) => order.indexOf(a.c.group) - order.indexOf(b.c.group) || b.s - a.s).map((x) => x.c);
  }
  // ---------- Eingabezeile ----------
  let pop = null, items = [], active = 0;
  function looksLikeSentence(t) { const w = t.trim().split(/\s+/); return w.length >= 3 || /[?]/.test(t) || /\d/.test(t) && w.length >= 2; }
  function renderPop(text) {
    closePop();
    const t = text.trim(); if (!t) return;
    const hits = search(t);
    items = hits.map((c) => ({ type: 'cmd', c }));
    if (AI.available) { const ai = { type: 'ai', text: t }; if (looksLikeSentence(t) || !hits.length) items.unshift(ai); else items.push(ai); }
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
    it.c.run();
  }
  function initBar() {
    const inp = $('#cmd-input'), go = $('#cmd-go');
    inp.addEventListener('input', () => { go.disabled = !inp.value.trim(); renderPop(inp.value); });
    inp.addEventListener('focus', () => { if (inp.value.trim()) renderPop(inp.value); });
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
    const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); App.undo(); return; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); App.redo(); return; }
    if (mod && k === 's') { e.preventDefault(); Start.saveFile(); return; }
    if (mod && k === 'e') { e.preventDefault(); Print.exportDialog(); return; }
    if (mod && k === 'k') { e.preventDefault(); $('#cmd-input').focus(); return; }
    if (k === '/') { e.preventDefault(); $('#cmd-input').focus(); return; }
    if (e.key === '?' || (e.key === 'F1')) { e.preventDefault(); showKeys(); return; }
    if (App.mode !== 'model') return;
    if (e.key === 'Escape') { if (Place.active) Place.cancel(); else if (Measure.active) Measure.stop(); else if (!App.sel.length && App.ctx) App.setCtx(null); else if (!App.sel.length && App.iso) App.setIso(null); else { Panels.closeFlyout(); App.clearSelection(); } return; }
    if (mod && k === 'd') { e.preventDefault(); Actions.duplicate(); return; }
    if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? Actions.ungroup() : Actions.group(); return; }
    if (mod && k === 'a') { e.preventDefault(); App.select(App.doc.items.map((x) => x.id)); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (App.sel.length) { e.preventDefault(); Actions.remove(); } return; }
    if (Views.onKey(e)) { e.preventDefault(); return; }
    if (k === 'f') { Viewer.fit(App.sel.length ? App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean) : null); return; }
    if (k === 'h' && App.sel.length) { Actions.toggleRole(); return; }
    if (k === 'a' && (App.sel.length || App.edges.length)) { Select.similar(); return; }
    if (k === 'r' && App.sel.length) { Actions.rotate90(null, 'z'); return; }
    if (k === 's') { Sketch.chooseAndStart(); return; }
    if (k === 'm') { Measure.toggle(); return; }
    if (k === 'n') { Notes.toggle(); return; }
    if (k === 'o') { ViewPrefs.toggle('ortho'); return; }
    if (k === 'g') { ViewPrefs.toggle('gridOn'); return; }
    if (['1', '3', '7', '0'].includes(k) && !e.shiftKey) { Viewer.setView({ 1: 'front', 3: 'right', 7: 'top', 0: 'iso' }[k]); return; }
    if (k === 'k') { Panels.toggleFlyout('bodies', $('#t-body')); return; }
    if (k === 'i') { const top = App.sel.length ? Model.topOf(App.doc, App.sel[0]) : null; if (top) Comp.toggleIso(top.id); else if (App.iso) App.setIso(null); return; }
    if (k === 'e' && App.sel.length === 1) {
      const f = Model.find(App.doc, App.sel[0]); if (!f) return;
      if ((f.item.kind === 'extrude' || f.item.kind === 'revolve' || f.item.kind === 'sweep') && f.item.p.sketch) Sketch.editItem(f.item.id);
      else if (f.item.kind === 'group' && App.doc.items.includes(f.item)) Comp.edit(f.item.id);
      return;
    }
    if (k === 'b') { Panels.toggleFlyout('parts', $('#t-parts')); return; }
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
    const groups = [
      ['Ansicht', [['Linke Maustaste ziehen', 'Ansicht drehen'], ['Rechte Maustaste ziehen', 'Ansicht verschieben'], ['Mausrad', 'Zoomen'], ['F', 'Auswahl oder alles zeigen'], ['1 · 3 · 7 · 0', 'Ansicht vorne · rechts · oben · schräg'], ['O', 'Orthografisch / Perspektive'], ['G', 'Raster ein / aus'], ['C', 'Schnitt ein / aus'], ['X', 'Röntgen ein / aus'], ['U', 'Explosion ein / aus'], ['I', 'Gewähltes Teil isolieren / alle zeigen']]],
      ['Modell', [['Klicken', 'Körper, Fläche oder Kante wählen'], ['Umschalt + Klick', 'Mehrere wählen'], ['Ziehen', 'Körper verschieben – dabei Zahl tippen für genaue Werte'], ['Doppelklick', 'Skizze eines Skizzenkörpers bearbeiten · auf eine ebene Fläche: darauf zeichnen'], ['E', 'Skizze bzw. Bauteil bearbeiten'], ['Esc', 'Auswahl aufheben · Bauteil verlassen'], ['Entf', 'Löschen'], ['H', 'Körper ↔ Loch'], ['A', 'Ähnliche auswählen (gleiche Teile oder Kanten)'], ['R', 'Um 90° drehen'], ['Pfeiltasten', 'Um einen Rasterschritt verschieben (Umschalt: 10)'], ['Bild ↑ / Bild ↓', 'Anheben / Absenken'], [M + ' D', 'Duplizieren'], [M + ' G', 'Gruppieren (Umschalt: lösen)'], [M + ' A', 'Alles wählen']]],
      ['Werkzeuge', [['S', 'Skizze'], ['M', 'Messen'], ['N', 'Notizstift (P Stift · T Text · E Radierer)'], ['K', 'Körper'], ['B', 'Bauteile'], ['/ oder ' + M + ' K', 'Eingabezeile']]],
      ['In der Skizze', [['V', 'Auswahl'], ['L · R · C · A', 'Linie · Rechteck · Kreis · Bogen'], ['G · P · S', 'Langloch · Vieleck · Spline'], ['T · F', 'Trimmen · Versatz'], ['M · Q · W', 'Spiegeln · Rechteckmuster · Kreismuster'], ['X', 'Hilfslinie (neue Elemente oder das gewählte)'], ['Alt halten', 'Nicht einrasten'], ['D', 'Maß festlegen (auch Formel)'], ['Zahl tippen', 'Genaue Länge beim Zeichnen'], ['Tab', 'Nächstes Eingabefeld'], ['Umschalt halten', 'Feiner einrasten'], ['Enter', 'Linienzug beenden · Skizze fertig'], ['Esc', 'Zeichnen abbrechen · Skizze verlassen']]],
      ['Dateien und Verlauf', [[M + ' Z', 'Rückgängig'], [M + ' Y', 'Wiederholen'], [M + ' S', 'Projekt speichern'], [M + ' E', 'Exportieren (STEP und mehr)'], ['?', 'Diese Übersicht']]],
    ];
    const t = h('div', { class: 'keys-grid' });
    for (const [title, rows] of groups) {
      const sec = h('div', { class: 'keys-sec' }, h('div', { class: 'section-h' }, title));
      for (const [a, b] of rows) sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'kbd' }, a), h('span', { class: 'grow' }, b)));
      t.append(sec);
    }
    UI.modal({ title: 'Tastenkürzel', body: t, actions: [{ label: 'Schließen', primary: true }] });
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
  function init() { build(); initBar(); document.addEventListener('keydown', onKey); }
  return { init, search, setMode, showKeys, list: () => C };
})();

