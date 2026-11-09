// ================= Oberfläche: Leisten, Verlauf, Einstellungen =================
const Panels = (() => {
  const expanded = new Set();
  let leftTab = 'tree';
  let flyout = null;

  // ---------- Werkzeugleiste ----------
  // einfache Oberfläche: diese Grundkörper und Bauteile bleiben sichtbar
  const SIMPLE_KINDS = ['box', 'cylinder', 'sphere', 'cone', 'tube', 'hemisphere'];
  const SIMPLE_PARTS = ['screwHole', 'nutTrap', 'slotHole', 'holePattern', 'zipTie'];
  function renderTools() {
    const el = $('#tools'); el.innerHTML = '';
    const btn = (id, ic, label, tip, kbd, onClick, cls = '', short = '') => {
      const b = h('button', { type: 'button', class: 'tool ' + cls, id, 'data-tip': tip, 'data-kbd': kbd || null, 'aria-label': label });
      // langer und kurzer Name: schmale Fenster zeigen den kurzen
      b.innerHTML = icon(ic) + (short ? `<span class="l-full">${label}</span><span class="l-short">${short}</span>` : `<span>${label}</span>`);
      b.addEventListener('click', onClick);
      el.append(b); return b;
    };
    if (App.mode === 'model') {
      btn('t-body', 'cube', 'Körper', 'Grundkörper hinzufügen – anklicken oder auf die Fläche ziehen', 'K', (e) => toggleFlyout('bodies', e.currentTarget));
      btn('t-sketch', 'sketch', 'Skizze', 'Eine 2D-Skizze zeichnen und daraus einen Körper machen', 'S', () => Sketch.chooseAndStart());
      btn('t-parts', 'parts', 'Bauteile', 'Schraubenlöcher, Mutternfallen, Scharniere, Zahnräder …', 'B', (e) => toggleFlyout('parts', e.currentTarget));
      btn('t-drone', 'drone', 'Drohne', 'Frame-Assistent, Kaufteile wie Motoren und Akkus, Lochbilder', '', (e) => toggleFlyout('drone', e.currentTarget));
      btn('t-measure', 'measure', 'Messen', 'Messen: Abstände, Winkel, Flächen und Durchmesser', 'M', () => Measure.toggle(), 'minor pro');
      btn('t-notes', 'noteDraw', 'Notizen', 'Notizstift: frei malen und Text hinschreiben – ohne technische Bedeutung', 'N', () => Notes.toggle(), 'minor pro');
      btn('t-views', 'xray', 'Ansicht', 'Ansicht: Schnitt, Röntgen, Explosion und Fokus-Vorschau – ändert nur die Anzeige', '', (e) => Views.menu(e.currentTarget), 'minor pro');
      // einfache Oberfläche: die Profi-Werkzeuge stecken hinter „Mehr“
      btn('t-more', 'menu', 'Mehr', 'Weitere Werkzeuge: Messen, Notizen, Ansicht – oder alle Werkzeuge zeigen', '', (e) => UI.menu(e.currentTarget, [
        { label: 'Messen', icon: 'measure', kbd: 'M', run: () => Measure.toggle() },
        { label: 'Notizstift', icon: 'noteDraw', kbd: 'N', run: () => Notes.toggle() },
        { label: 'Ansicht: Schnitt, Röntgen, Explosion …', icon: 'xray', run: () => Views.menu($('#t-more')) },
        { label: 'Schwachstellen suchen', icon: 'target', run: () => Weak.dialog() },
        '-', { label: 'Alle Werkzeuge zeigen (Profi)', icon: 'sliders', help: 'levelSwitch', run: () => ViewPrefs.setLevel('pro') },
      ]), 'simple-only');
      el.append(h('div', { class: 'sep' }));
      Views.sync();
      btn('t-export', 'export', 'Exportieren', 'Als STEP, STL, 3MF oder DXF speichern (ZIP)', 'Strg E', () => Print.exportDialog(), 'primary', 'Export');
    } else {
      btn('t-sheet', 'sheet', 'Blatt', 'Blattgröße, Maßstab und Ansichten', '', (e) => Drawing.sheetMenu(e.currentTarget));
      btn('t-dim', 'dim', 'Maß', 'Bemaßung hinzufügen: zwei Punkte oder einen Kreis anklicken', 'D', () => Drawing.tool('dim'));
      btn('t-autodim', 'target', 'Automatisch bemaßen', 'Gesamtmaße und Bohrungen automatisch bemaßen', '', () => Drawing.autoDims(), '', 'Auto-Maße');
      btn('t-draw', 'line', '2D zeichnen', 'Linien, Kreise und Text frei auf das Blatt zeichnen', '', (e) => Drawing.drawMenu(e.currentTarget));
      el.append(h('div', { class: 'sep' }));
      btn('t-dexport', 'export', 'Zeichnung speichern', 'Als PDF, SVG oder DXF speichern', '', (e) => Drawing.exportMenu(e.currentTarget), 'primary', 'Speichern');
    }
  }
  // weiche Trennstellen für lange Wörter auf schmalen Kacheln (nur Anzeige)
  const HY = { Schraubenloch: 'Schrauben\u00ADloch', Mutternfalle: 'Muttern\u00ADfalle', Gewindeeinsatz: 'Gewinde\u00ADeinsatz', Schnapphaken: 'Schnapp\u00ADhaken', Halbkugel: 'Halb\u00ADkugel' };
  const hyph = (s) => HY[s] || s;
  function closeFlyout() { if (flyout) { flyout.el.remove(); const b = flyout.btn; b && b.setAttribute('aria-expanded', 'false'); flyout = null; document.removeEventListener('pointerdown', flyOutside, true); } }
  function flyOutside(e) { if (flyout && !flyout.el.contains(e.target) && !flyout.btn.contains(e.target)) closeFlyout(); }
  function toggleFlyout(kind, btn) {
    if (flyout && flyout.kind === kind) { closeFlyout(); return; }
    closeFlyout();
    const el = h('div', { class: 'flyout' });
    if (kind === 'bodies') {
      el.append(h('h3', null, 'Grundkörper'));
      const tiles = h('div', { class: 'tiles' });
      for (const k of PRIMITIVE_ORDER) {
        const t = h('div', { class: 'tile' + (SIMPLE_KINDS.includes(k) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-tip': 'Klicken fügt ihn ein, Ziehen setzt ihn genau hin' });
        t.innerHTML = primitiveSVG(k); t.append(h('span', { class: 'lbl' }, hyph(KINDS[k].label)));
        Place.bindTile(t, { kind: k });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { Actions.addPrimitive(k); closeFlyout(); } });
        tiles.append(t);
      }
      el.append(tiles);
      const row = h('div', { class: 'btn-row' });
      const holeBtn = h('button', { type: 'button', class: 'btn small' }); holeBtn.innerHTML = icon('hole') + 'Zylinder als Loch';
      holeBtn.onclick = () => { Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }); closeFlyout(); };
      const boxHole = h('button', { type: 'button', class: 'btn small' }); boxHole.innerHTML = icon('hole') + 'Quader als Loch';
      boxHole.onclick = () => { Actions.addPrimitive('box', { role: 'hole', name: 'Aussparung', p: { w: 10, d: 10, h: 30 } }); closeFlyout(); };
      const routeBtn = h('button', { type: 'button', class: 'btn small pro', id: 'add-route', 'data-help': 'route3d' }); routeBtn.innerHTML = icon('sweep') + 'Rohr im Raum';
      routeBtn.onclick = () => { closeFlyout(); Features.route3d(); };
      row.append(holeBtn, boxHole, routeBtn); el.append(row);
      el.append(h('div', { class: 'foot' }, 'Tipp: Jeder Körper kann mit einem Klick zum Loch werden.'));
    } else if (kind === 'drone') {
      el.classList.add('drone');
      DroneUI.flyout(el);
    } else {
      el.append(h('h3', null, 'Bauteile'));
      const tiles = h('div', { class: 'tiles' });
      for (const d of LIB.filter((x) => !x.buy)) {
        const t = h('div', { class: 'tile' + (d.role === 'hole' ? ' hole-part' : '') + (SIMPLE_PARTS.includes(d.lib) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-tip': d.desc });
        t.innerHTML = partSVG(d); t.append(h('span', { class: 'lbl' }, hyph(d.label)), h('span', { class: 'role' }, d.role === 'hole' ? 'Loch' : 'Körper'));
        Place.bindTile(t, { part: d });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { Actions.addPart(d, libDefaults(d)); closeFlyout(); } });
        tiles.append(t);
      }
      el.append(tiles);
      el.append(h('div', { class: 'foot' }, 'Löcher auf eine Fläche ziehen – sie richten sich automatisch aus.'));
    }
    $('#center').append(el);
    const br = btn.getBoundingClientRect(), cr = $('#center').getBoundingClientRect();
    el.style.left = clamp(br.left - cr.left, 8, cr.width - el.offsetWidth - 8) + 'px'; el.style.top = '8px';
    btn.setAttribute('aria-expanded', 'true');
    flyout = { el, btn, kind };
    setTimeout(() => document.addEventListener('pointerdown', flyOutside, true), 0);
  }

  // ---------- Verlauf (links) ----------
  function renderLeft() {
    const body = $('#left-body'); body.innerHTML = '';
    $('#lt-tree').setAttribute('aria-selected', leftTab === 'tree'); $('#lt-params').setAttribute('aria-selected', leftTab === 'params'); $('#lt-log').setAttribute('aria-selected', leftTab === 'log');
    if (leftTab === 'tree') renderTree(body); else if (leftTab === 'log') renderLog(body); else renderParams(body);
  }
  // ---------- Erste Schritte (nur in der einfachen Oberfläche): hakt sich selbst ab ----------
  const FS_KEY = 'tracery-erste-schritte';
  const fsGet = () => { try { return JSON.parse(localStorage.getItem(FS_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const fsSet = (o) => { try { localStorage.setItem(FS_KEY, JSON.stringify({ ...fsGet(), ...o })); } catch (_) {} };
  function firstStepsState() {
    const all = []; Model.walk(App.doc.items, (it) => { all.push(it); });
    const plain = (it) => it.kind !== 'group' && it.kind !== 'part' && KINDS[it.kind] && KINDS[it.kind].params;
    const sized = all.some((it) => plain(it) && KINDS[it.kind].params.some((q) => typeof q.def === 'number' && it.p && it.p[q.k] !== undefined && String(it.p[q.k]) !== String(q.def)));
    return { body: all.some((it) => it.kind !== 'group' && it.role !== 'hole'), size: sized, hole: all.some((it) => it.role === 'hole'), save: !!fsGet().saved };
  }
  function firstSteps() {
    if (!ViewPrefs.simple || fsGet().off) return null;
    const st = firstStepsState();
    const steps = [
      ['body', 'Einen Körper hinzufügen', 'Klick oben auf „Körper“ und dann auf einen Quader oder Zylinder – oder zieh ihn auf die Fläche.', () => toggleFlyout('bodies', $('#t-body'))],
      ['size', 'Die Größe ändern', 'Klick den Körper an und zieh an einem Pfeil – oder tipp rechts unter „Maße“ eine neue Zahl ein.', null],
      ['hole', 'Ein Loch machen', 'Füg einen Zylinder hinzu, schieb ihn in den ersten Körper und klick oben in der Leiste auf „Zum Loch“.', null],
      ['save', 'Als Datei speichern', 'Klick oben auf „Exportieren“. STL ist die Datei für den 3D-Drucker.', () => Print.exportDialog()],
    ];
    const n = steps.filter(([k]) => st[k]).length;
    const box = h('div', { class: 'first-steps', id: 'first-steps' });
    const x = h('button', { type: 'button', class: 'fs-x', 'aria-label': 'Erste Schritte ausblenden', 'data-tip': 'Ausblenden' }); x.innerHTML = icon('close');
    x.onclick = () => { fsSet({ off: true }); renderLeft(); };
    box.append(h('div', { class: 'fs-head' }, h('b', null, 'Erste Schritte'), h('span', { class: 'fs-n', id: 'fs-n' }, `${n} von 4`), x));
    steps.forEach(([k, t, how, run], i) => {
      const row = h('div', { class: 'fs-row' + (st[k] ? ' done' : ''), 'data-step': k });
      const mark = h('span', { class: 'fs-mark', 'aria-hidden': 'true' }); if (st[k]) mark.innerHTML = icon('check'); else mark.textContent = String(i + 1);
      row.append(mark, h('span', { class: 'grow' }, t));
      if (!st[k]) { const b = h('button', { type: 'button', class: 'btn small ghost', 'data-how': k }, 'Wie?'); b.onclick = () => { UI.toast(how, { icon: 'info', ms: 6000 }); if (run) run(); }; row.append(b); }
      box.append(row);
    });
    if (n === 4) box.append(h('div', { class: 'ok-box', id: 'fs-done' }, 'Geschafft – du kennst die Grundlagen! Mehr zeigt dir die Einführung auf der Startseite.'));
    return box;
  }
  function firstStepDone(k) { fsSet({ [k]: true }); if (leftTab === 'tree') renderLeft(); }
  let dragId = null;
  function renderTree(body) {
    const items = App.doc.items;
    const fs = items.length <= 8 ? firstSteps() : null;
    if (fs) body.append(fs);
    if (!items.length) {
      body.append(h('div', { class: 'empty-tree', html: 'Hier erscheint alles, was du baust – <b>Schritt für Schritt</b>.<br><br>Fang mit einem <b>Körper</b> an oder beschreibe unten in der Zeile, was du bauen möchtest.' }));
      return;
    }
    const V = Model.vars(App.doc).v;
    const selSet = new Set(App.sel);
    const ul = h('ul', { class: 'tree', role: 'tree' });
    const rec = (list, parentUl) => {
      for (const it of list) {
        const li = h('li', { role: 'treeitem' });
        const topIdx = App.doc.items.indexOf(it);
        const ctxTop = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
        const inCtx = !!ctxTop && Model.topOf(App.doc, it.id) === ctxTop;
        const ownList = ctxTop ? ctxTop.children : App.doc.items, ownIdx = ownList.indexOf(it);
        const rolled = ownIdx >= 0 && (!ctxTop || inCtx) && ownIdx >= Timeline.markerPos();
        const row = h('div', { class: 'node' + (selSet.has(it.id) ? ' sel' : '') + (it.hidden ? ' hidden-item' : '') + (it.suppressed ? ' supp' : '') + (rolled ? ' rolled' : '') + (ctxTop && !inCtx ? ' ctx-other' : '') + (ctxTop === it ? ' ctx-active' : ''), draggable: 'true', dataset: { id: it.id } });
        const tw = h('button', { type: 'button', class: 'tw' + (expanded.has(it.id) ? ' open' : ''), 'aria-label': 'Aufklappen' });
        if (it.kind === 'group' || (it.finishes || []).length) { tw.innerHTML = icon('chevR'); tw.onclick = (e) => { e.stopPropagation(); expanded.has(it.id) ? expanded.delete(it.id) : expanded.add(it.id); renderLeft(); }; }
        else tw.style.visibility = 'hidden';
        const sw = h('span', { class: 'swatch' + (it.role === 'hole' ? ' hole' : ''), style: { background: it.color } });
        if (it.comp) { sw.innerHTML = icon('parts'); sw.classList.add('comp'); }
        const nm = h('span', { class: 'nm', title: Model.label(it) }, Model.label(it));
        const sub = h('span', { class: 'sub mono' }, Model.sizeText(it, V));
        const acts = h('span', { class: 'acts' });
        const eye = h('button', { type: 'button', 'aria-label': it.hidden ? 'Einblenden' : 'Ausblenden', 'data-tip': it.hidden ? 'Einblenden' : 'Ausblenden' }); eye.innerHTML = icon(it.hidden ? 'eyeOff' : 'eye');
        eye.onclick = (e) => { e.stopPropagation(); App.change(it.hidden ? 'Eingeblendet' : 'Ausgeblendet', (doc) => { const f = Model.find(doc, it.id); f.item.hidden = !f.item.hidden; }); };
        const del = h('button', { type: 'button', 'aria-label': 'Löschen', 'data-tip': 'Löschen' }); del.innerHTML = icon('trash');
        del.onclick = (e) => { e.stopPropagation(); Actions.remove([it.id]); };
        if (topIdx >= 0 && it.kind === 'group') { const be = h('button', { type: 'button', 'aria-label': 'Bauteil bearbeiten', 'data-tip': App.ctx === it.id ? 'Bearbeitung beenden' : 'Als Bauteil bearbeiten (Rest wird durchsichtig)' }); be.innerHTML = icon(App.ctx === it.id ? 'check' : 'edit'); be.onclick = (e) => { e.stopPropagation(); App.ctx === it.id ? App.setCtx(null) : Comp.edit(it.id); }; acts.append(be); }
        if (topIdx >= 0) { const io = h('button', { type: 'button', 'aria-label': 'Isolieren', 'data-tip': App.iso === it.id ? 'Alle wieder zeigen' : 'Nur dieses Teil zeigen' }); io.innerHTML = icon('focusView'); io.onclick = (e) => { e.stopPropagation(); Comp.toggleIso(it.id); }; acts.append(io); }
        if (ownIdx >= 0 && (!ctxTop || inCtx)) { const sp = h('button', { type: 'button', 'aria-label': it.suppressed ? 'Aktivieren' : 'Unterdrücken', 'data-tip': it.suppressed ? 'Wieder aktivieren' : 'Unterdrücken (bleibt erhalten, zählt nicht mit)', 'data-help': 'suppress' }); sp.innerHTML = icon('suppress'); sp.onclick = (e) => { e.stopPropagation(); Timeline.toggleSuppress(it.id); }; acts.append(sp); }
        acts.append(eye, del);
        row.append(tw, sw, nm);
        if (it.ai) { const am = h('span', { class: 'ai-mark', 'data-tip': (it.ai.edit ? 'Von der KI geändert: „' : 'Von der KI gebaut: „') + it.ai.q + '“' }); am.innerHTML = icon('spark'); row.append(am); }
        const errs = App.errorsFor(it.id);
        if (errs.length) { const er = h('span', { class: 'err', 'data-tip': errs[0].message }); er.innerHTML = icon('warn'); row.append(er); }
        row.append(sub, acts);
        row.addEventListener('click', (e) => { App.select([it.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); });
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault(); if (!selSet.has(it.id)) App.select([it.id]);
          UI.menu(row, [
            { icon: 'help', label: 'Erklär diesen Schritt', help: 'explainStep', run: () => Explain.dialog(it.id) },
            { icon: 'edit', label: 'Umbenennen', run: async () => { const n = await UI.prompt('Umbenennen', 'Name', Model.label(it), 'Umbenennen'); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); } },
            ...(ownIdx >= 0 ? [{ icon: 'suppress', label: it.suppressed ? 'Wieder aktivieren' : 'Unterdrücken', run: () => Timeline.toggleSuppress(it.id) }] : []),
            '-', { icon: 'trash', label: 'Löschen', run: () => Actions.remove([it.id]) },
          ]);
        });
        row.addEventListener('dblclick', async (e) => { e.stopPropagation(); const n = await UI.prompt('Umbenennen', 'Name', Model.label(it), 'Umbenennen'); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); });
        // Ziehen im Verlauf: umsortieren oder in eine Gruppe legen
        row.addEventListener('dragstart', (e) => { dragId = it.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (_) {} });
        row.addEventListener('dragover', (e) => {
          if (!dragId || dragId === it.id) return; e.preventDefault();
          const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height;
          row.classList.remove('drop-before', 'drop-after', 'drop-into');
          if (it.kind === 'group' && y > 0.3 && y < 0.7) row.classList.add('drop-into'); else row.classList.add(y < 0.5 ? 'drop-before' : 'drop-after');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-into'));
        row.addEventListener('drop', (e) => {
          e.preventDefault(); const mode = row.classList.contains('drop-into') ? 'into' : row.classList.contains('drop-before') ? 'before' : 'after';
          row.classList.remove('drop-before', 'drop-after', 'drop-into');
          moveInTree(dragId, it.id, mode); dragId = null;
        });
        li.append(row);
        if (expanded.has(it.id)) {
          for (const fin of it.finishes || []) {
            const ferr = errs.find((x) => x.finishId === fin.id);
            const fr = h('div', { class: 'finish-row' + (ferr ? ' bad' : ''), title: ferr ? ferr.message : '' });
            fr.innerHTML = icon(fin.type === 'chamfer' ? 'chamfer' : fin.type === 'shell' ? 'shell' : 'fillet');
            if (fin.type === 'shell') fr.append(h('span', null, 'Wandstärke ' + fmt(Model.num(fin.r, V, 2), 2) + ' mm'));
            else if (fin.type === 'draft') fr.append(h('span', null, 'Entformungsschräge ' + fmt(Model.num(fin.r, V, 3), 1) + '°'));
            else fr.append(h('span', null, (fin.type === 'chamfer' ? 'Fase ' : 'Rundung ') + fmt(Model.num(fin.r, V, 1), 2) + ' mm' + (typeof fin.edges === 'string' ? ' · ' + ({ all: 'alle Kanten', top: 'oben', bottom: 'unten', vertical: 'senkrecht', horizontal: 'waagerecht' }[fin.edges] || '') : ' · ' + (fin.edges || []).length + ' Kante' + ((fin.edges || []).length === 1 ? '' : 'n'))));
            fr.onclick = () => App.select([it.id]);
            li.append(fr);
          }
          if (it.kind === 'group') { const cu = h('ul', { role: 'group' }); rec(it.children || [], cu); li.append(cu); }
        }
        parentUl.append(li);
      }
    };
    rec(items, ul);
    body.append(ul);
  }
  function moveInTree(srcId, dstId, mode) {
    if (!srcId || srcId === dstId) return;
    const src = Model.find(App.doc, srcId);
    if (!src) return;
    // nicht in sich selbst legen
    let bad = false; if (src.item.children) Model.walk(src.item.children, (c) => { if (c.id === dstId) bad = true; });
    if (bad) return;
    App.change('Verschoben im Verlauf', (doc) => {
      const s = Model.find(doc, srcId), d = Model.find(doc, dstId);
      const W = Model.worldMatrix(doc, srcId);
      s.list.splice(s.list.indexOf(s.item), 1);
      let targetList, parentW;
      if (mode === 'into') { targetList = d.item.children; parentW = Model.worldMatrix(doc, d.item.id); targetList.push(s.item); }
      else { targetList = d.list; parentW = d.parent ? Model.worldMatrix(doc, d.parent.id) : new THREE.Matrix4(); const i = targetList.indexOf(d.item); targetList.splice(mode === 'before' ? i : i + 1, 0, s.item); }
      Model.setFromMatrix(s.item, parentW.clone().invert().multiply(W));
      Model.walk(doc.items, (it, parent, depth, list, i) => { if (it.kind === 'group' && !it.comp && !it.children.length) list.splice(i, 1); });
    });
  }
  // ---------- Protokoll ----------
  let logFilter = 'all';
  function renderLog(body) {
    const all = Log.entries();
    const tools = h('div', { class: 'log-tools' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' });
    for (const [k, l] of [['all', 'Alle'], ['change', 'Änderungen'], ['error', 'Fehler']]) { const b = h('button', { type: 'button', 'aria-pressed': logFilter === k }, l); b.onclick = () => { logFilter = k; renderLeft(); }; seg.append(b); }
    const clr = h('button', { type: 'button', class: 'btn small ghost', style: { marginLeft: 'auto' } }, 'Leeren'); clr.onclick = () => Log.clear();
    tools.append(seg, clr); body.append(tools);
    const shown = all.filter((e) => logFilter === 'all' || (logFilter === 'error' ? e.kind === 'error' : e.kind !== 'error' && e.kind !== 'info')).slice().reverse();
    if (!shown.length) { body.append(h('div', { class: 'empty-tree' }, logFilter === 'error' ? 'Keine Fehler – alles in Ordnung.' : 'Noch nichts passiert. Jede Änderung erscheint hier mit Uhrzeit.')); return; }
    const ul = h('div', { class: 'log-list' });
    const depthNow = App.undoStack.length;
    const ic = { change: 'edit', undo: 'undo', redo: 'redo', error: 'warn', info: 'info' };
    for (const e of shown.slice(0, 200)) {
      const d = new Date(e.t); const tm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const reach = e.kind === 'change' && e.s === Log.session && e.depth != null && e.depth <= depthNow;
      const row = h('div', { class: 'log-row ' + e.kind + (e.kind === 'change' && !reach && e.s === Log.session ? ' gone' : '') });
      const ico = h('span'); ico.innerHTML = icon(ic[e.kind] || 'info');
      const txt = h('div', null, e.kind === 'error' ? h('b', null, (e.name ? e.name + ': ' : '') + e.text) : h('span', null, e.kind === 'undo' ? 'Rückgängig: ' + e.text : e.kind === 'redo' ? 'Wiederholt: ' + e.text : e.text));
      if (e.kind === 'error') {
        if (Log.hint(e.code)) txt.append(h('small', null, Log.hint(e.code)));
        if (e.itemId && Model.find(App.doc, e.itemId)) { const b = h('button', { type: 'button', class: 'lk' }, 'Schritt zeigen'); b.onclick = () => App.select([e.itemId]); txt.append(b); }
      }
      if (reach && e.depth < depthNow) { const b = h('button', { type: 'button', class: 'lk', 'data-tip': 'Alle späteren Änderungen rückgängig machen' }, 'Bis hierher zurück'); b.onclick = () => App.undoTo(e.depth); txt.append(b); }
      row.append(h('span', { class: 'tm' }, tm), ico, txt); ul.append(row);
    }
    body.append(ul);
  }
  // ---------- Maße (Parameter) ----------
  function renderParams(body) {
    const { v, errors } = Model.vars(App.doc);
    const wrap = h('div', { class: 'props' });
    wrap.append(h('div', { class: 'hint-box', html: 'Lege hier Maße mit Namen fest, zum Beispiel <b>Wandstärke = 2</b>. In jedem Zahlenfeld kannst du dann den Namen oder eine Formel wie <b>Breite/2 + 3</b> eintippen. Änderst du das Maß hier, passt sich alles an.' }));
    if ((App.doc.params || []).length) { const vs = Variants.section(); vs.classList.add('pro'); wrap.append(vs); }
    const list = h('div', { class: 'mini-list' });
    (App.doc.params || []).forEach((p, i) => {
      const row = h('div', { class: 'section' });
      const f = h('div', { class: 'fields' });
      const nameIn = h('div', { class: 'field' }, h('label', { for: 'pn-' + p.id }, 'Name'), h('div', { class: 'inp' }, h('input', { id: 'pn-' + p.id, value: p.name, style: { fontFamily: 'var(--font)' } })));
      nameIn.querySelector('input').addEventListener('change', (e) => {
        const nv = e.target.value.trim().replace(/\s+/g, '_');
        if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(nv)) { UI.toast('Namen dürfen nur Buchstaben, Ziffern und _ enthalten und nicht mit einer Ziffer beginnen.', { kind: 'bad' }); e.target.value = p.name; return; }
        renameParam(p.id, nv);
      });
      const valF = UI.numField({ id: 'pv-' + p.id, label: 'Wert', value: p.expr, unit: '', onCommit: (val) => App.change('Maß geändert', (doc) => { doc.params.find((x) => x.id === p.id).expr = val; }, { merge: 'param:' + p.id }) });
      f.append(nameIn, valF);
      row.append(f);
      const info = h('div', { class: 'btn-row', style: { justifyContent: 'space-between', alignItems: 'center' } });
      info.append(h('span', { class: 'mono', style: { color: errors[p.id] ? 'var(--bad)' : 'var(--muted)', fontSize: '12.5px' } }, errors[p.id] ? errors[p.id] : '= ' + fmt(v[p.name], 3)));
      const del = h('button', { type: 'button', class: 'btn ghost small danger' }); del.innerHTML = icon('trash') + 'Entfernen';
      del.onclick = () => removeParam(p.id);
      info.append(del); row.append(info);
      list.append(row);
      if (i < App.doc.params.length - 1) list.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '2px 0', width: '100%' } }));
    });
    wrap.append(list);
    const add = h('button', { type: 'button', class: 'btn' }); add.innerHTML = icon('plus') + 'Maß hinzufügen';
    add.onclick = () => { let n = 1; while ((App.doc.params || []).some((x) => x.name === 'Maß' + n)) n++; App.change('Maß hinzugefügt', (doc) => { doc.params.push({ id: uid('m'), name: 'Maß' + n, expr: 10 }); }); };
    const exb = h('button', { type: 'button', class: 'btn ghost' }); exb.innerHTML = icon('help') + 'Formel-Beispiele';
    exb.onclick = () => formulaHelp();
    wrap.append(h('div', { class: 'btn-row' }, add, exb));
    body.append(wrap);
  }
  // Fenster mit Schreibweise und 12 Beispielen zum Ausprobieren
  function formulaHelp() {
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    box.append(h('div', { class: 'hint-box', html: 'Erlaubt sind <b>+ − * / ^</b>, Klammern, <b>pi</b> und die Funktionen <b>min, max, abs, wurzel, runden, floor, ceil, sin, cos, tan</b> (Winkel in Grad). Mehrere Werte in einer Funktion trennst du mit <b>;</b> – zum Beispiel <b>max(a; b)</b>. Dezimalzahlen gehen mit Komma oder Punkt.' }));
    const demo = Object.entries(FORMULA_DEMO).map(([k, x]) => `${k} = ${x}`).join(', ');
    box.append(h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '13.5px' } }, 'Die Ergebnisse gelten für ' + demo + '.'));
    const list = h('div', { class: 'formula-list' });
    for (const x of FORMULA_EXAMPLES) {
      let val = '';
      try { val = fmt(Expr.eval(x.f, FORMULA_DEMO), 2); } catch (_) {}
      const cp = h('button', { type: 'button', class: 'btn ghost small', 'data-tip': 'Formel kopieren' }); cp.innerHTML = icon('copy');
      cp.onclick = async () => { try { await navigator.clipboard.writeText(x.f); UI.toast('Kopiert: ' + x.f, { icon: 'check', ms: 1500 }); } catch (_) { UI.toast('Kopieren ging nicht – markier die Formel einfach.', { icon: 'info' }); } };
      list.append(h('div', { class: 'formula-row' }, h('div', { class: 'formula-top' }, h('code', null, x.f), h('b', { class: 'mono' }, '= ' + val), cp), h('p', null, x.e)));
    }
    box.append(list);
    const missing = Object.keys(FORMULA_DEMO).filter((k) => !(App.doc.params || []).some((p) => p.name.toLowerCase() === k));
    const actions = [{ label: 'Schließen', primary: true }];
    if (missing.length) actions.unshift({ label: 'Beispiel-Maße anlegen', run: () => { App.change('Beispiel-Maße angelegt', (doc) => { for (const k of missing) doc.params.push({ id: uid('m'), name: k, expr: FORMULA_DEMO[k] }); }); UI.toast(missing.length + ' Maße angelegt – jetzt kannst du die Formeln überall eintippen.', { icon: 'check' }); } });
    UI.modal({ title: 'Formel-Beispiele', body: box, actions });
  }
  // ersetzt einen Maßnamen überall (Maße, Größen, Lage, Rundungen) – gibt zurück, ob er vorkam
  function replaceName(doc, old, repl) {
    const re = new RegExp('(^|[^A-Za-zÄÖÜäöüß_0-9])' + old.replace(/[$^.*+?()[\]{}|\\]/g, '\\$&') + '(?![A-Za-zÄÖÜäöüß_0-9])', 'gi');
    let hit = false;
    const fix = (s) => { if (typeof s !== 'string') return s; const r = s.replace(re, (m, pre) => { hit = true; return pre + repl; }); return /^-?\d+(\.\d+)?$/.test(r.trim()) ? +r : r; };
    for (const q of doc.params) q.expr = fix(q.expr);
    Model.walk(doc.items, (it) => { for (const k in it.p || {}) it.p[k] = fix(it.p[k]); for (const k in it.t) it.t[k] = fix(it.t[k]); for (const f of it.finishes || []) f.r = fix(f.r); if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) d.v = fix(d.v); });
    return hit;
  }
  function renameParam(id, nv) {
    const p = App.doc.params.find((x) => x.id === id); if (!p || p.name === nv) return;
    if (App.doc.params.some((x) => x.id !== id && x.name.toLowerCase() === nv.toLowerCase())) { UI.toast('Diesen Namen gibt es schon.', { kind: 'bad' }); renderLeft(); return; }
    const old = p.name;
    App.change('Maß umbenannt', (doc) => { doc.params.find((x) => x.id === id).name = nv; replaceName(doc, old, nv); });
  }
  function removeParam(id) {
    const p = App.doc.params.find((x) => x.id === id); if (!p) return;
    // wo das Maß benutzt wird, bleibt sein aktueller Wert stehen – so ändert sich am Modell nichts
    const val = Model.vars(App.doc).v[p.name];
    const num = Number.isFinite(val) ? String(round(val, 4)) : '0';
    let used = false;
    App.change('Maß entfernt', (doc) => { doc.params = doc.params.filter((x) => x.id !== id); used = replaceName(doc, p.name, +num < 0 ? '(' + num + ')' : num); });
    if (used) UI.toast(`Wo „${p.name}“ benutzt wurde, steht jetzt ${fmt(+num, 3)}.`, { icon: 'info' });
  }

  // Abstand zwischen zwei Teilen: Achse wählen, Lücke eintippen
  function gapPop(anchor) {
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '240px' } });
    box.append(h('b', null, 'Abstand zwischen den Teilen'));
    let ax = 'x';
    const g0 = () => { const g = Actions.gapOf(null, ax); return g ? round(g.gap, 3) : 0; };
    const body = h('div', { style: { display: 'grid', gap: '10px' } });
    const draw = () => {
      body.innerHTML = '';
      body.append(UI.selectField({ id: 'gap-ax', label: 'Richtung', value: ax, options: [['x', 'Links / rechts (X)'], ['y', 'Vorne / hinten (Y)'], ['z', 'Oben / unten (Z)']], onChange: (v) => { ax = v; draw(); } }));
      body.append(UI.numField({ id: 'gap-v', label: 'Lücke (jetzt ' + fmt(g0(), 2) + ' mm)', value: g0(), onCommit: (v) => { const n = Model.num(v, Model.vars(App.doc).v, NaN); if (!isNaN(n)) { Actions.setGap(null, ax, n); UI.closePop(); } } }));
    };
    draw(); box.append(body, h('div', { class: 'hint-box', html: 'Der zuletzt gewählte Teil bewegt sich. 0 = bündig aneinander, negativ = ineinander.' }));
    UI.pop(anchor, box);
  }
  // ---------- Einstellungen (rechts) ----------
  function renderRight() {
    const body = $('#right-body'); body.innerHTML = '';
    if (App.mode === 'drawing') { $('#right-title').textContent = 'Zeichnung'; Drawing.renderPanel(body); return; }
    if (Sketch.active) { $('#right-title').textContent = 'Skizze'; Sketch.renderPanel(body); return; }
    const items = App.selectedItems();
    if (!items.length) { $('#right-title').textContent = 'Projekt'; renderProject(body); return; }
    if (items.length > 1) { $('#right-title').textContent = 'Auswahl'; renderMulti(body, items); return; }
    $('#right-title').textContent = 'Eigenschaften';
    renderItem(body, items[0]);
  }
  function renderProject(body) {
    const w = h('div', { class: 'props' });
    const nameF = h('div', { class: 'field' }, h('label', { for: 'proj-name' }, 'Projektname'), h('div', { class: 'inp' }, h('input', { id: 'proj-name', value: App.doc.name, style: { fontFamily: 'var(--font)' } })));
    nameF.querySelector('input').addEventListener('change', (e) => { const v = e.target.value.trim() || 'Neues Projekt'; App.change('Projekt umbenannt', (doc) => { doc.name = v; }); });
    w.append(nameF);
    if (DroneCheck.isDrone()) {
      const ds = h('div', { class: 'section', id: 'proj-drone' }, h('div', { class: 'section-h' }, 'Drohne'));
      const last = DroneCheck.summary();
      if (last) ds.append(DroneCheck.rows(last.filter((c) => c.s !== 'ok' || c.id === 'tw'), null), ...(last.every((c) => c.s === 'ok' || c.s === 'info') ? [h('div', { class: 'hint-box' }, 'Alle Prüfungen bestanden.')] : []));
      const b = h('button', { type: 'button', class: 'btn small', id: 'proj-dcheck', 'data-help': 'droneCheck' }); b.innerHTML = icon('clearance') + (last ? 'Noch mal prüfen' : 'Drohnen-Check');
      b.onclick = () => DroneCheck.dialog();
      ds.append(h('div', { class: 'btn-row' }, b));
      w.append(ds);
    }
    if (App.doc.items.length) {
      const ps = h('div', { class: 'section', id: 'proj-weak-sec' }, h('div', { class: 'section-h' }, 'Schwachstellen'));
      const wl = Weak.summary();
      if (wl) ps.append(wl.length ? Weak.rows(wl.slice(0, 4), null, true) : h('div', { class: 'hint-box' }, 'Keine Schwachstellen gefunden.'), ...(wl.length > 4 ? [h('div', { class: 'hint-box' }, `… und ${wl.length - 4} weitere.`)] : []));
      const wb = h('button', { type: 'button', class: 'btn small', id: 'proj-weak', 'data-help': 'weakSpots' }); wb.innerHTML = icon('target') + (wl ? 'Noch mal suchen' : 'Schwachstellen suchen');
      wb.onclick = () => Weak.dialog();
      ps.append(h('div', { class: 'btn-row' }, wb));
      w.append(ps);
    }
    const pv = ViewPrefs.get();
    const va = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, 'Ansicht'));
    va.append(UI.selectField({ id: 'view-grid', label: 'Rasterweite', value: String(pv.grid), options: [['auto', 'Automatisch (folgt dem Zoom)'], ['0.01', '0,01 mm'], ['0.1', '0,1 mm'], ['1', '1 mm'], ['10', '10 mm'], ['100', '100 mm']], onChange: (val) => ViewPrefs.set({ grid: val === 'auto' ? 'auto' : parseFloat(val) }) }));
    const chk = (k, label) => { const l = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'view-' + k, checked: !!pv[k] }), label); l.querySelector('input').onchange = (e) => ViewPrefs.set({ [k]: e.target.checked }); return l; };
    va.append(UI.selectField({ id: 'view-quality', label: 'Darstellungsqualität', value: pv.quality, options: [['coarse', 'Grob'], ['normal', 'Normal'], ['fine', 'Fein'], ['ultra', 'Sehr fein']], onChange: (val) => ViewPrefs.set({ quality: val }) }));
    va.append(h('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } }, chk('adaptive', 'Darstellung anpassen (Zoom, Drehen)'), chk('gridOn', 'Raster zeigen'), chk('planes', 'Ursprungsebenen zeigen'), chk('axes', 'Achsen zeigen'), chk('notes', 'Notizen zeigen'), chk('ortho', 'Orthografisch (ohne Perspektive)')));
    w.append(va);
    const gr = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, 'Fangen beim Verschieben'));
    const f2 = h('div', { class: 'fields' });
    f2.append(UI.selectField({ id: 'grid', label: 'Schrittweite', value: App.doc.settings.grid, options: [[0.01, '0,01 mm'], [0.05, '0,05 mm'], [0.1, '0,1 mm'], [0.5, '0,5 mm'], [1, '1 mm'], [2, '2 mm'], [5, '5 mm'], [10, '10 mm']], onChange: (v) => App.change('Raster geändert', (doc) => { doc.settings.grid = parseFloat(v); }) }));
    const snap = h('label', { class: 'check', style: { alignSelf: 'end', paddingBottom: '8px' } }, h('input', { type: 'checkbox', id: 'snap', checked: App.doc.settings.snap !== false }), 'Einrasten');
    snap.querySelector('input').onchange = (e) => App.change('Einrasten geändert', (doc) => { doc.settings.snap = e.target.checked; });
    const mag = h('label', { class: 'check', style: { paddingBottom: '4px' } }, h('input', { type: 'checkbox', id: 'magnet', checked: App.doc.settings.magnet !== false }), 'Magnetisch einrasten (Mitte, Mittellinien, Lochmitten, ganz oben auf Rundungen, bündig zu anderen Teilen) – Strg hält es kurz an');
    mag.querySelector('input').onchange = (e) => App.change('Magnet geändert', (doc) => { doc.settings.magnet = e.target.checked; });
    f2.append(snap); gr.append(f2, mag); w.append(gr);
    const st = Print.stats();
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Überblick'));
    info.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Objekte'), h('b', { class: 'mono' }, String(Model.countItems(App.doc)))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Größe gesamt'), h('b', { class: 'mono' }, st ? `${fmt(st.x, 1)} × ${fmt(st.y, 1)} × ${fmt(st.z, 1)} mm` : '–'))));
    w.append(info);
    // Material und Gewicht des ganzen Projekts (exaktes Volumen aus dem CAD-Kern)
    const curMat = App.doc.settings.material || 'CFK';
    const ms = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Material und Gewicht'));
    ms.append(UI.selectField({ id: 'proj-mat', label: 'Material', value: curMat, options: MATERIALS.map((m) => [m.k, `${m.k} · ${String(m.rho).replace('.', ',')} g/cm³`]), onChange: (v) => App.change('Material gewählt', (doc) => { doc.settings.material = v; }) }));
    const vRow = h('b', { class: 'mono' }, '…'), gRow = h('b', { class: 'mono' }, '…');
    ms.append(h('div', { class: 'mini-list', style: { marginTop: '8px' } },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Volumen'), vRow),
      h('div', { class: 'mini-row', 'data-help': 'massProps' }, h('span', { class: 'grow' }, 'Gewicht'), gRow)));
    w.append(ms);
    const cRow = h('b', { class: 'mono' }, '…');
    const ml = ms.querySelector('.mini-list');
    ml.append(h('div', { class: 'mini-row', 'data-tip': 'Schwerpunkt aller Teile, nach Gewicht gemittelt' }, h('span', { class: 'grow' }, 'Schwerpunkt'), cRow));
    const own = h('div', { class: 'hint-box', hidden: true });
    const cog = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'proj-cog', checked: !!ViewPrefs.get().cog }), 'Schwerpunkt im Bild zeigen');
    cog.querySelector('input').onchange = (e) => ViewPrefs.set({ cog: e.target.checked });
    ms.append(cog, own);
    Mass.measure().then((r) => {
      if (!r) { vRow.textContent = gRow.textContent = cRow.textContent = '–'; return; }
      const cm3 = r.volume / 1000;
      vRow.textContent = `${fmt(cm3, 3)} cm³`; gRow.textContent = Mass.gText(r.mass);
      cRow.textContent = r.com ? r.com.map((v) => fmt(v, 1)).join(' · ') : '–';
      const n = (r.parts || []).filter((p) => p.own && !p.fixed).length, nf = (r.parts || []).filter((p) => p.fixed).length;
      const bits = [];
      if (n) bits.push(`${n} ${n === 1 ? 'Teil hat' : 'Teile haben'} ein eigenes Material`);
      if (nf) bits.push(`${nf} ${nf === 1 ? 'Kaufteil zählt' : 'Kaufteile zählen'} mit festem Gewicht`);
      const nm = (r.parts || []).filter((p) => p.missing).length;
      if (nm) bits.push(`<b>bei ${nm} ${nm === 1 ? 'Kaufteil fehlt' : 'Kaufteilen fehlt'} noch das Gewicht</b>`);
      if (bits.length) { own.hidden = false; own.innerHTML = bits.join(', ') + ' – das Gewicht rechnet alles zusammen.'; }
    });
    w.append(h('div', { class: 'hint-box', html: '<b>So geht’s:</b> Körper anklicken und ziehen. Die Pfeile ändern die Größe, die Zahlen kannst du anklicken und genau eintippen. <span class="kbd">Entf</span> löscht, <span class="kbd">Strg Z</span> macht rückgängig.' }));
    body.append(w);
  }
  function renderMulti(body, found) {
    const w = h('div', { class: 'props' });
    w.append(h('div', { class: 'prop-title' }, h('b', { style: { fontSize: '17px' } }, found.length + ' Objekte gewählt')));
    const allHole = found.every((f) => f.item.role === 'hole');
    w.append(roleSwitch(allHole ? 'hole' : found.every((f) => f.item.role !== 'hole') ? 'solid' : null, (r) => Actions.setRole(null, r)));
    const r1 = h('div', { class: 'btn-row' });
    const g = h('button', { type: 'button', class: 'btn primary' }); g.innerHTML = icon('group') + 'Gruppieren'; g.onclick = () => Actions.group();
    const d = h('button', { type: 'button', class: 'btn' }); d.innerHTML = icon('copy') + 'Duplizieren'; d.onclick = () => Actions.duplicate();
    const x = h('button', { type: 'button', class: 'btn danger' }); x.innerHTML = icon('trash') + 'Löschen'; x.onclick = () => Actions.remove();
    r1.append(g, d, x); w.append(r1);
    const al = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Ausrichten'));
    const ar = h('div', { class: 'btn-row' });
    for (const [m, l] of [['left', 'Links'], ['cx', 'Mitte X'], ['right', 'Rechts'], ['front', 'Vorne'], ['cy', 'Mitte Y'], ['back', 'Hinten'], ['bottom', 'Unten'], ['top', 'Oben']]) {
      const b = h('button', { type: 'button', class: 'btn small' }, l); b.onclick = () => Actions.align(null, m); ar.append(b);
    }
    al.append(ar); w.append(al);
    w.append(colorSection((c) => App.change('Farbe geändert', (doc) => { for (const f of found) Model.find(doc, f.item.id).item.color = c; }), found[0].item.color));
    body.append(w);
  }
  function roleSwitch(role, onSet) {
    const s = h('div', { class: 'role-switch', role: 'group', 'aria-label': 'Körper oder Loch' });
    const a = h('button', { type: 'button', 'aria-pressed': role === 'solid' ? 'true' : 'false' }); a.innerHTML = icon('solid') + 'Körper';
    const b = h('button', { type: 'button', class: 'hole', 'aria-pressed': role === 'hole' ? 'true' : 'false' }); b.innerHTML = icon('hole') + 'Loch';
    a.onclick = () => onSet('solid'); b.onclick = () => onSet('hole');
    s.append(a, b); return s;
  }
  function colorSection(onPick, cur) {
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Farbe'));
    const row = h('div', { class: 'colors' });
    for (const c of COLORS) { const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': c.c === cur ? 'true' : 'false', style: { background: c.c } }); b.onclick = () => onPick(c.c); row.append(b); }
    sec.append(row); return sec;
  }
  function renderItem(body, f) {
    const it = f.item; const V = Model.vars(App.doc).v;
    const w = h('div', { class: 'props' });
    const title = h('div', { class: 'prop-title' });
    const nameInp = h('input', { id: 'item-name', value: Model.label(it), 'aria-label': 'Name' });
    nameInp.addEventListener('change', () => { const v = nameInp.value.trim(); if (v) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = v; }); });
    nameInp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nameInp.blur(); });
    const kindLabel = it.kind === 'part' ? (LIBMAP[it.p.lib] || {}).label || 'Bauteil' : KINDS[it.kind].label;
    title.append(nameInp);
    if (kindLabel && kindLabel !== Model.label(it)) title.append(h('span', { class: 'kind-badge' }, kindLabel));
    const exb = h('button', { type: 'button', class: 'icon-btn', id: 'item-explain', 'aria-label': 'Erklär diesen Schritt', 'data-tip': 'Erklär diesen Schritt', 'data-help': 'explainStep' }); exb.innerHTML = icon('help');
    exb.onclick = () => Explain.dialog(it.id); title.append(exb);
    w.append(title);
    for (const e of App.errorsFor(it.id)) {
      const box = h('div', { class: 'err-box' }, h('span', null, e.message));
      if (e.code === 'toobig' && e.max > 0) { const b = h('button', { type: 'button', class: 'btn small' }, `Auf ${fmt(e.max, 1)} mm setzen`); b.onclick = () => Actions.setFinish(it.id, e.finishId, { r: e.max }); box.append(h('div', null, b)); }
      if (e.code === 'edges') { const b = h('button', { type: 'button', class: 'btn small' }, 'Rundung entfernen'); b.onclick = () => Actions.removeFinish(it.id, e.finishId); box.append(h('div', null, b)); }
      w.append(box);
    }
    w.append(roleSwitch(it.role, (r) => Actions.setRole([it.id], r)));
    // Maße
    const three = !!(KINDS[it.kind] && KINDS[it.kind].params.length === 3);
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, three ? 'Maße (mm)' : 'Maße'));
    const setP = (k, val) => App.change('Maß geändert', (doc) => { Model.find(doc, it.id).item.p[k] = val; }, { merge: 'p:' + it.id + ':' + k });
    if (KINDS[it.kind] && KINDS[it.kind].params.length) {
      const fl = h('div', { class: 'fields' + (KINDS[it.kind].params.length === 3 ? ' three' : '') });
      for (const q of KINDS[it.kind].params) fl.append(UI.numField({ id: 'p-' + q.k, label: q.label, value: it.p[q.k], unit: q.unit, axis: q.axis, min: q.min, int: q.int, onCommit: (val) => setP(q.k, val) }));
      sec.append(fl); w.append(sec);
    } else if (it.kind === 'part') {
      const def = LIBMAP[it.p.lib];
      if (def) {
        const fl = h('div', { class: 'fields' });
        for (const q of def.params) {
          if (q.type === 'select') fl.append(UI.selectField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k], options: q.options, onChange: (v) => setP(q.k, v) }));
          else fl.append(UI.numField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k] ?? '', unit: q.unit ?? 'mm', int: q.int, placeholder: q.auto ? 'passend' : '', onCommit: (v) => setP(q.k, v) }));
        }
        sec.append(fl);
        if (def.lib === 'screwHole' || def.lib === 'insert' || def.lib === 'nutTrap') sec.append(h('div', { class: 'hint-box', html: 'Das Loch zeigt mit der flachen Seite nach oben. Setz es mit <b>Loch hier</b> direkt auf eine Fläche, dann richtet es sich von selbst aus.' }));
        w.append(sec);
      }
    } else if (it.kind === 'extrude' || it.kind === 'revolve') {
      const fl = h('div', { class: 'fields' });
      if (it.kind === 'extrude') {
        fl.append(UI.numField({ id: 'p-dist', label: 'Höhe', value: it.p.dist, onCommit: (v) => setP('dist', v) }));
        fl.append(UI.selectField({ id: 'p-dir', label: 'Richtung', value: it.p.dir || 'normal', options: [['normal', 'Nach außen'], ['reverse', 'Nach innen'], ['both', 'Beidseitig']], onChange: (v) => setP('dir', v) }));
      } else {
        fl.append(UI.numField({ id: 'p-angle', label: 'Winkel', value: it.p.angle, unit: '°', onCommit: (v) => setP('angle', v) }));
      }
      sec.append(fl);
      const eb = h('button', { type: 'button', class: 'btn' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
      eb.onclick = () => Sketch.editItem(it.id);
      sec.append(eb); w.append(sec);
    } else if (it.kind === 'import') {
      sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Datei'), h('b', { class: 'mono' }, it.p.file || '–')));
      const fl = h('div', { class: 'fields' });
      fl.append(UI.selectField({ id: 'p-scale', label: 'Einheit der Datei', value: String(it.p.scale || 1), options: [['1', 'Millimeter'], ['10', 'Zentimeter'], ['25.4', 'Zoll'], ['1000', 'Meter']], onChange: (v) => setP('scale', parseFloat(v)) }));
      sec.append(fl, h('div', { class: 'hint-box', html: 'Importierte Teile sind feste Formen ohne Zeitleiste. Du kannst sie verschieben, drehen, runden, als Loch nutzen oder mit anderen Körpern verbinden.' }));
      w.append(sec);
    } else if (it.kind === 'sweep') {
      const fl = h('div', { class: 'fields' });
      const profs = App.doc.items.filter((x) => x.kind === 'extrude' && x.p && x.p.sketch && x.id !== it.id);
      const shp = it.p.shape || 'circle';
      fl.append(UI.selectField({ id: 'p-shape', label: 'Querschnitt', value: shp, options: [['circle', 'Rund (Rohr)'], ['rect', 'Rechteckig (Kanal, Leiste)'], ...(profs.length || shp === 'sketch' ? [['sketch', 'Eigene Form aus einem Skizzenkörper']] : [])], onChange: (v) => { if (v === 'sketch' && !it.p.prof) { const src = profs[0]; if (src) App.change('Querschnitt übernommen', (doc) => { const f = Model.find(doc, it.id).item; f.p.shape = 'sketch'; f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name; const s2 = doc.items.find((x) => x.id === src.id); if (s2) s2.hidden = true; }); } else setP('shape', v); } }));
      if (shp === 'sketch') {
        fl.append(UI.selectField({ id: 'p-prof', label: 'Form von', value: '', options: [['', it.p.profName || 'übernommen'], ...profs.map((x) => [x.id, x.name])], onChange: (v) => { const src = profs.find((x) => x.id === v); if (src) App.change('Querschnitt übernommen', (doc) => { const f = Model.find(doc, it.id).item; f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name; const s2 = doc.items.find((x) => x.id === src.id); if (s2) s2.hidden = true; }); } }));
      } else if (shp === 'circle') fl.append(UI.numField({ id: 'p-d', label: 'Durchmesser', value: it.p.d, onCommit: (v) => setP('d', v) }));
      else { fl.append(UI.numField({ id: 'p-w', label: 'Breite', value: it.p.w, onCommit: (v) => setP('w', v) }), UI.numField({ id: 'p-h', label: 'Höhe', value: it.p.h, onCommit: (v) => setP('h', v) })); }
      if (shp !== 'sketch') fl.append(UI.numField({ id: 'p-wall', label: 'Wand (0 = voll)', value: it.p.wall || 0, min: 0, onCommit: (v) => setP('wall', v) }));
      sec.append(fl);
      if (it.p.path3d) {
        // Pfad im Raum: Punkte als Zahlen, glatt oder mit Ecken, weitere Punkte im Bild anklicken
        const V3 = Model.vars(App.doc).v, P3 = it.p.path3d.pts || [], RP = Model.path3dPoints(it.p.path3d, V3), RU = it.p.path3d.rules || [];
        // erst alle Zahlen-Punkte auf ihre Lage mit Regeln setzen – dann bleibt beim Ändern jeder andere Punkt, wo er ist
        const bake = (pp) => Model.path3dBake(pp, V3);
        const setPt = (i, k, v) => App.change('Punkt geändert', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d || !f.item.p.path3d.pts[i]) return false; bake(f.item.p.path3d); f.item.p.path3d.pts[i][k] = v; }, { merge: 'p3:' + it.id + ':' + i + ':' + k });
        // Regel je Stück: Richtung (entlang X/Y/Z) und Länge – wie in einer Skizze, nur im Raum
        const setRule = (i, patch) => App.change('Regel im Pfad', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d) return false; Model.path3dSetRule(f.item.p.path3d, i, patch, V3); });
        const fs = h('div', { class: 'fields' });
        fs.append(UI.selectField({ id: 'p-smooth', label: 'Verlauf', value: it.p.path3d.smooth === false ? 'corner' : 'smooth', options: [['smooth', 'Glatte Kurve durch die Punkte'], ['corner', 'Gerade Stücke, runde Ecken']], onChange: (v) => App.change('Verlauf', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; f.item.p.path3d.smooth = v !== 'corner'; }) }));
        sec.append(fs);
        const list = h('div', { class: 'p3-list', id: 'p3-list' });
        P3.forEach((q, i) => {
          const row = h('div', { class: 'fields three p3-row' });
          ['x', 'y', 'z'].forEach((ax, k) => row.append(UI.numField({ id: `p3-${i}-${ax}`, label: (k === 0 ? `P${i + 1} ` : '') + ax.toUpperCase(), value: typeof q[k] === 'string' ? q[k] : round(RP[i][k], 3), onCommit: (v) => setPt(i, k, v) })));
          list.append(row);
          if (P3.length > 2) { const del = h('button', { type: 'button', class: 'btn ghost small', id: `p3-del-${i}`, 'aria-label': `Punkt ${i + 1} löschen` }); del.innerHTML = icon('trash') + `Punkt ${i + 1} löschen`; del.onclick = () => App.change('Punkt gelöscht', (doc) => {
            const f = Model.find(doc, it.id); if (!f) return false; const pp = f.item.p.path3d; bake(pp); pp.pts.splice(i, 1);
            // Regeln: die beiden Stücke am gelöschten Punkt werden eins – ohne Regel
            if (pp.rules) { const R = pp.rules.slice(); if (i === 0) R.splice(0, 1); else if (i >= R.length) R.splice(R.length - 1, 1); else { R.splice(i, 1); R[i - 1] = null; } if (R.some(Boolean)) pp.rules = R; else delete pp.rules; }
          }); list.append(del); }
          if (i + 1 < P3.length) {
            const L = Math.hypot(RP[i + 1][0] - RP[i][0], RP[i + 1][1] - RP[i][1], RP[i + 1][2] - RP[i][2]), r = RU[i] || {};
            const sr = h('div', { class: 'fields p3-seg' });
            sr.append(UI.selectField({ id: `p3-ax-${i}`, label: `Stück P${i + 1} → P${i + 2}`, value: r.ax || '', options: [['', 'Richtung frei'], ['x', 'entlang X'], ['y', 'entlang Y'], ['z', 'entlang Z (senkrecht)'], ...(i > 0 ? [['perp', 'rechtwinklig zum vorigen'], ['par', 'parallel zum vorigen']] : [])], onChange: (v) => setRule(i, { ax: v || null }) }));
            sr.append(UI.numField({ id: `p3-len-${i}`, label: r.len != null ? 'Länge (fest)' : `Länge (jetzt ${fmt(L, 1)})`, value: r.len != null ? r.len : 0, min: 0, onCommit: (v) => setRule(i, { len: v || null }) }));
            list.append(sr);
          }
        });
        sec.append(list);
        const mb = h('button', { type: 'button', class: 'btn', id: 'route-more' }); mb.innerHTML = icon('plus') + 'Punkte im Bild anhängen';
        mb.onclick = () => Features.routeAppend(it.id);
        sec.append(mb, h('div', { class: 'hint-box', html: 'Das Rohr läuft durch die Punkte im Raum – gut für Kabelkanäle, Antennenrohre und Bügel, die sich in alle Richtungen biegen. Mit <b>Wand</b> wird es hohl.' }));
      } else {
        const eb = h('button', { type: 'button', class: 'btn' }); eb.innerHTML = icon('edit') + 'Pfad bearbeiten';
        eb.onclick = () => Sketch.editItem(it.id);
        sec.append(eb, h('div', { class: 'hint-box', html: 'Der Querschnitt läuft am Pfad entlang – gut für Rohre, Kabelkanäle, Bügel und Leisten. Mit <b>Wand</b> wird er hohl.' }));
      }
      w.append(sec);
    } else if (it.kind === 'loft') {
      const n = (it.p.sketches || []).length, hasPath = !!it.p.path, hasRail1 = !!it.p.rail, hasRail2 = !!it.p.rail2, hasRail = hasRail1 || hasRail2;
      sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Umrisse'), h('b', { class: 'mono' }, String(n))));
      if (!hasPath && !hasRail) {
        const fl = h('div', { class: 'fields' });
        fl.append(UI.numField({ id: 'p-tip', label: 'Spitze verlängern', value: it.p.tip || 0, min: 0, onCommit: (v) => setP('tip', v) }));
        fl.append(UI.selectField({ id: 'p-ruled', label: 'Übergang', value: it.p.ruled ? 'ruled' : 'smooth', options: [['smooth', 'Weich'], ['ruled', 'Gerade Flächen']], onChange: (v) => setP('ruled', v === 'ruled') }));
        sec.append(fl);
        sec.append(h('div', { class: 'hint-box', html: '<b>Spitze verlängern</b> zieht den Körper hinter dem letzten Umriss zu einer Spitze zusammen – z. B. für eine Nase oder einen Kegel mit weichem Ende. Danach kannst du die Kanten wie gewohnt runden.' }));
      }
      // Mittellinie: der Übergang folgt einer gebogenen Linie statt dem kürzesten Weg
      const ml = h('div', { class: 'section', id: 'loft-path' }, h('div', { class: 'section-h' }, 'Mittellinie'));
      if (n >= 2) {
        const eb = h('button', { type: 'button', class: 'btn', id: 'loft-path-edit' }); eb.innerHTML = icon(hasPath ? 'edit' : 'spline') + (hasPath ? 'Mittellinie bearbeiten' : 'Mittellinie zeichnen');
        eb.onclick = () => Sketch.startLoftPath(it.id);
        const row = h('div', { class: 'btn-row' }, eb);
        if (hasPath) {
          const rb = h('button', { type: 'button', class: 'btn', id: 'loft-path-off' }); rb.innerHTML = icon('close') + 'Ohne Mittellinie';
          rb.onclick = () => App.change('Mittellinie entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.path; });
          row.append(rb);
        }
        const ang = hasPath ? Model.loftPathAngles(it, Model.vars(App.doc).v) : [];
        const bad = ang.map((a, i) => [a, i]).filter(([a]) => a > 30);
        if (bad.length) ml.append(h('div', { class: 'hint-box warn', id: 'loft-path-warn', html: `Die Mittellinie trifft ${bad.length === ang.length ? 'die Umrisse' : bad.map(([, i]) => (i === 0 ? 'den ersten' : i === ang.length - 1 ? 'den letzten' : `den ${i + 1}.`) + ' Umriss').join(' und ')} schräg (${bad.map(([a]) => a + '°').join(', ')}). Dann wird der Körper dünn oder verdreht – lass sie möglichst senkrecht durch die Umrisse laufen.` }));
        ml.append(row, h('div', { class: 'hint-box', html: hasPath ? 'Der Übergang läuft an der Mittellinie entlang. Spitze und „Gerade Flächen“ gibt es dabei nicht.' : 'Ohne Mittellinie nimmt der Übergang den kürzesten Weg. Mit einer <b>Mittellinie</b> biegst du ihn – z. B. einen Rumpf, der nach oben schwingt, oder einen Arm im Bogen.' }));
      } else ml.append(h('div', { class: 'hint-box', html: 'Eine Mittellinie braucht mindestens zwei Umrisse.' }));
      // Führungskurve: gibt die Seitenlinie vor – der Übergang wird zwischen den Umrissen so weit, dass er sie berührt
      const fk = h('div', { class: 'section', id: 'loft-rail' }, h('div', { class: 'section-h' }, 'Führungskurve'));
      if (n >= 2 && !hasPath) {
        const eb = h('button', { type: 'button', class: 'btn', id: 'loft-rail-edit' }); eb.innerHTML = icon(hasRail1 ? 'edit' : 'spline') + (hasRail1 ? 'Führungskurve bearbeiten' : 'Führungskurve zeichnen');
        eb.onclick = () => Sketch.startLoftPath(it.id, 'rail');
        const row = h('div', { class: 'btn-row' }, eb);
        if (hasRail1) {
          const rb = h('button', { type: 'button', class: 'btn', id: 'loft-rail-off' }); rb.innerHTML = icon('close') + 'Ohne Führungskurve';
          rb.onclick = () => App.change('Führungskurve entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.rail; delete f.item.p.rail2; });
          row.append(rb);
        }
        fk.append(row, h('div', { class: 'hint-box', html: hasRail ? 'Zwischen den Umrissen folgt der Übergang der Führungskurve – z. B. ein Rumpf, der in der Mitte bauchig wird. Die Umrisse selbst bleiben gleich.' : 'Mit einer <b>Führungskurve</b> gibst du die Seitenlinie vor: Der Übergang wird zwischen den Umrissen bauchiger oder schlanker, ohne dass du mehr Umrisse zeichnen musst.' }));
      } else fk.append(h('div', { class: 'hint-box', html: hasPath ? 'Mit Mittellinie geht keine Führungskurve – erst „Ohne Mittellinie“.' : 'Eine Führungskurve braucht mindestens zwei Umrisse.' }));
      // zweite Führungskurve quer zur ersten (z. B. Rumpf: erste von der Seite für die Höhe, zweite von oben für die Breite)
      const fk2 = hasRail1 && n >= 2 && !hasPath ? h('div', { class: 'section', id: 'loft-rail2' }, h('div', { class: 'section-h' }, 'Zweite Führungskurve')) : null;
      if (fk2) {
        const eb = h('button', { type: 'button', class: 'btn', id: 'loft-rail2-edit' }); eb.innerHTML = icon(hasRail2 ? 'edit' : 'spline') + (hasRail2 ? 'Zweite bearbeiten' : 'Zweite zeichnen');
        eb.onclick = () => Sketch.startLoftPath(it.id, 'rail2');
        const row = h('div', { class: 'btn-row' }, eb);
        if (hasRail2) {
          const rb = h('button', { type: 'button', class: 'btn', id: 'loft-rail2-off' }); rb.innerHTML = icon('close') + 'Ohne zweite';
          rb.onclick = () => App.change('Zweite Führungskurve entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.rail2; });
          row.append(rb);
        }
        fk2.append(row, h('div', { class: 'hint-box', html: hasRail2 ? 'Der Übergang folgt beiden Führungskurven – jede bestimmt die Breite in ihrer Richtung.' : 'Die erste Führungskurve gibt die Breite in einer Richtung vor. Eine <b>zweite</b> quer dazu gibt die andere vor – so formst du einen Rumpf von der Seite <i>und</i> von oben.' }));
      }
      if (hasRail) { ml.innerHTML = ''; ml.append(h('div', { class: 'section-h' }, 'Mittellinie'), h('div', { class: 'hint-box', html: 'Mit Führungskurve geht keine Mittellinie – erst „Ohne Führungskurve“.' })); }
      w.append(sec, ml, fk); if (fk2) w.append(fk2);
    } else if (Features.isOp(it)) {
      sec.firstChild.textContent = Features.NAMES[it.p.op === 'pattern' ? it.p.pt : it.p.op] || 'Feature';
      Features.renderOp(it, sec, setP); w.append(sec);
    } else if (it.kind === 'group') {
      sec.append(h('div', { class: 'hint-box', html: `Diese Gruppe besteht aus <b>${it.children.length} Teilen</b>. Löcher darin sind fest aus den Körpern geschnitten. Die Teile findest du links im Verlauf.` }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Gruppe lösen'; ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub)); w.append(sec);
    }
    const jsec = Joints.panel(it); if (jsec) w.append(jsec);
    // Lage
    const pos = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Lage'));
    const setT = (k, val) => App.change(k.startsWith('r') ? 'Gedreht' : 'Verschoben', (doc) => { Model.find(doc, it.id).item.t[k] = val; }, { merge: 't:' + it.id + ':' + k });
    const fp = h('div', { class: 'fields three' });
    for (const k of ['x', 'y', 'z']) fp.append(UI.numField({ id: 't-' + k, value: it.t[k], axis: k, unit: '', onCommit: (v) => setT(k, v) }));
    const fr = h('div', { class: 'fields three' });
    for (const k of ['rx', 'ry', 'rz']) fr.append(UI.numField({ id: 't-' + k, value: it.t[k], axis: k[1], unit: '°', onCommit: (v) => setT(k, v) }));
    pos.append(h('div', { class: 'field' }, h('label', null, 'Position (mm)'), fp), h('div', { class: 'field' }, h('label', null, 'Drehung (°)'), fr));
    const qa = h('div', { class: 'btn-row' });
    const drop = h('button', { type: 'button', class: 'btn small', 'data-tip': 'Unterkante auf Höhe 0 setzen' }); drop.innerHTML = icon('push') + 'Auf XY-Ebene';
    drop.onclick = () => Actions.dropToPlate([it.id]);
    const rz = h('button', { type: 'button', class: 'btn small', 'data-tip': 'Um 90° drehen (um Z)', 'data-kbd': 'R' }); rz.innerHTML = icon('rotate') + '90°';
    rz.onclick = () => Actions.rotate90([it.id], 'z');
    if (!f.parent) qa.append(drop);
    qa.append(rz); pos.append(qa);
    w.append(pos);
    // Kanten
    if (it.role !== 'hole') {
      const ks = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Kanten'));
      for (const fin of (it.finishes || []).filter((x) => x.type === 'shell')) {
        const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
        const sh = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Wandstärke'));
        const row = h('div', { class: 'fields', style: { gridTemplateColumns: '1fr auto', alignItems: 'end' } });
        const nf = UI.numField({ id: 'fin-' + fin.id, label: `Wand · ${(fin.faces || []).length} Öffnung${(fin.faces || []).length === 1 ? '' : 'en'}`, value: fin.r, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
        if (err) nf.querySelector('.inp').classList.add('invalid');
        const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Aushöhlen entfernen', 'data-tip': 'Aushöhlen entfernen' }); del.innerHTML = icon('trash');
        del.onclick = () => Actions.removeFinish(it.id, fin.id);
        row.append(nf, del); sh.append(row);
        sh.append(h('div', { class: 'hint-box', html: 'Klick eine weitere Fläche an und wähle <b>Aushöhlen</b>, um sie zu öffnen oder wieder zu schließen.' }));
        w.append(sh);
      }
      for (const fin of (it.finishes || []).filter((x) => x.type !== 'shell')) {
        const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
        const row = h('div', { class: 'fields', style: { gridTemplateColumns: '1fr auto', alignItems: 'end' } });
        if (fin.type === 'draft') {
          const nf = UI.numField({ id: 'fin-' + fin.id, label: 'Entformungsschräge', value: fin.r, unit: '°', onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
          if (err) nf.querySelector('.inp').classList.add('invalid');
          const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Entfernen', 'data-tip': 'Entfernen' }); del.innerHTML = icon('trash');
          del.onclick = () => Actions.removeFinish(it.id, fin.id);
          row.append(nf, del); ks.append(row); continue;
        }
        const lbl = (fin.type === 'chamfer' ? 'Fase' : 'Rundung') + (typeof fin.edges === 'string' ? ' · ' + ({ all: 'alle', top: 'oben', bottom: 'unten', vertical: 'senkrecht', horizontal: 'waagerecht' }[fin.edges] || '') : ` · ${(fin.edges || []).length} Kante${(fin.edges || []).length === 1 ? '' : 'n'}`);
        const ch = fin.type === 'chamfer', vr = !ch && !!fin.vr, cm = ch ? fin.cm || '' : '';
        const nf = UI.numField({ id: 'fin-' + fin.id, label: vr ? lbl + ' · von' : cm ? lbl + ' · Abstand' : lbl, value: fin.r, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
        if (err) nf.querySelector('.inp').classList.add('invalid');
        const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Entfernen', 'data-tip': 'Entfernen' }); del.innerHTML = icon('trash');
        del.onclick = () => Actions.removeFinish(it.id, fin.id);
        row.append(nf, del); ks.append(row);
        // Art: Rundung gleichmäßig oder von … bis; Fase gleich, mit zwei Abständen oder mit Winkel
        const r0 = Model.num(fin.r, V, 1);
        const mo = h('div', { class: 'fields pro fin-more' });
        if (ch) {
          mo.append(UI.selectField({ id: 'fin-mode-' + fin.id, label: 'Art der Fase', value: cm, options: [['', 'Gleich'], ['two', 'Zwei Abstände'], ['angle', 'Mit Winkel']], onChange: (v) => Actions.setFinish(it.id, fin.id, v === 'two' ? { cm: 'two', r2: fin.r2 != null ? fin.r2 : round(r0 * 2, 3) } : v === 'angle' ? { cm: 'angle', a: fin.a != null ? fin.a : 30 } : { cm: null }) }));
          if (cm === 'two') mo.append(UI.numField({ id: 'fin-r2-' + fin.id, label: 'Zweiter Abstand', value: fin.r2 != null ? fin.r2 : r0, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r2: v }) }));
          if (cm === 'angle') mo.append(UI.numField({ id: 'fin-a-' + fin.id, label: 'Winkel', value: fin.a != null ? fin.a : 45, unit: '°', onCommit: (v) => Actions.setFinish(it.id, fin.id, { a: v }) }));
        } else {
          mo.append(UI.selectField({ id: 'fin-mode-' + fin.id, label: 'Art der Rundung', value: vr ? 'var' : '', options: [['', 'Gleichmäßig'], ['var', 'Von … bis']], onChange: (v) => Actions.setFinish(it.id, fin.id, v === 'var' ? { vr: true, r2: fin.r2 != null ? fin.r2 : round(r0 / 2, 3) } : { vr: null }) }));
          if (vr) mo.append(UI.numField({ id: 'fin-r2-' + fin.id, label: 'bis', value: fin.r2 != null ? fin.r2 : r0, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r2: v }) }));
        }
        ks.append(mo);
        if (vr || cm) {
          const sw = h('button', { type: 'button', class: 'btn ghost small pro', id: 'fin-swap-' + fin.id }); sw.innerHTML = icon('mirror') + (vr ? 'Richtung tauschen' : 'Seiten tauschen');
          sw.onclick = () => Actions.setFinish(it.id, fin.id, vr ? { r: fin.r2, r2: fin.r } : { side: fin.side ? null : 1 });
          ks.append(h('div', { class: 'btn-row' }, sw));
        }
      }
      const kr = h('div', { class: 'btn-row' });
      const mk = (label, sel) => { const b = h('button', { type: 'button', class: 'btn small', 'data-help': 'fillet' }); b.innerHTML = icon('fillet') + label; b.onclick = () => { Actions.finishAll(it.id, 'fillet', sel, 1); }; return b; };
      kr.append(mk('Alle runden', 'all'), mk('Senkrechte', 'vertical'), mk('Obere', 'top'));
      if (!(it.finishes || []).some((x) => x.type === 'draft')) { const db = h('button', { type: 'button', class: 'btn small pro', id: 'btn-draft', 'data-help': 'draft' }); db.innerHTML = icon('chamfer') + 'Schräge'; db.onclick = () => Actions.finishAll(it.id, 'draft', 'all', 3); kr.append(db); }
      ks.append(kr);
      ks.append(h('div', { class: 'hint-box', html: 'Oder klick im Modell <b>direkt auf eine Kante</b> und wähle Abrunden.' }));
      w.append(ks);
    }
    w.append(colorSection((c) => App.change('Farbe geändert', (doc) => { Model.find(doc, it.id).item.color = c; }), it.color));
    // Material und Gewicht dieses Teils (nur Teile der obersten Ebene)
    if (!f.parent && it.role !== 'hole') {
      const pm = Mass.projectMaterial();
      const ms = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, 'Material und Gewicht'));
      const fixed = Mass.fixedOf(it);
      ms.append(UI.selectField({ id: 'p-mat', label: 'Material', value: fixed ? '__fix' : it.mat || '', options: [['', `Wie das Projekt (${pm.k})`], ['__fix', 'Kaufteil: festes Gewicht'], ...MATERIALS.map((m) => [m.k, `${m.k} · ${String(m.rho).replace('.', ',')} g/cm³`])], onChange: (v) => {
        if (v === '__fix') { Mass.measure().then((r) => { const p = Mass.partOf(r, it.id); App.change('Festes Gewicht', (doc) => { const T = Model.find(doc, it.id).item; delete T.mat; T.massG = p ? round(p.mass, 1) : 10; }); }); return; }
        App.change('Material gewählt', (doc) => { const T = Model.find(doc, it.id).item; delete T.massG; if (v) T.mat = v; else delete T.mat; });
      } }));
      if (fixed) {
        ms.append(h('div', { class: 'fields', style: { marginTop: '8px' } }, UI.numField({ id: 'p-massg', label: 'Gewicht (Datenblatt)', value: it.massG, unit: 'g', onCommit: (v) => App.change('Gewicht geändert', (doc) => { Model.find(doc, it.id).item.massG = v; }, { merge: 'massg:' + it.id }) })));
        ms.append(h('div', { class: 'hint-box' + (it.massG === '' ? ' warn' : ''), html: it.massG === '' ? '<b>Gewicht fehlt:</b> Trag das Gewicht aus dem Datenblatt ein – bis dahin zählt dieses Teil mit 0 g.' : 'Für gekaufte Teile wie Motoren oder Akkus: Das Gewicht kommt aus dem Datenblatt, nicht aus der Form. Auch Formeln gehen, z. B. <b>4*33,8</b>.' }));
      }
      const vR = h('b', { class: 'mono' }, '…'), gR = h('b', { class: 'mono' }, '…');
      ms.append(h('div', { class: 'mini-list', style: { marginTop: '8px' } }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Volumen'), vR), h('div', { class: 'mini-row', 'data-help': 'massProps' }, h('span', { class: 'grow' }, 'Gewicht'), gR)));
      Mass.measure().then((r) => { const p = Mass.partOf(r, it.id); vR.textContent = p ? `${fmt(p.volume / 1000, 3)} cm³` : '–'; gR.textContent = p ? Mass.gText(p.mass) + (p.fixed ? ' (fest)' : '') : '–'; vR.id = 'p-vol'; gR.id = 'p-mass'; });
      w.append(ms);
    }
    // Mehr
    const more = h('button', { type: 'button', class: 'more', 'aria-expanded': 'false' }); more.innerHTML = icon('chevR') + 'Mehr Optionen';
    const mbox = h('div', { class: 'section', hidden: true });
    more.onclick = () => { const o = more.getAttribute('aria-expanded') !== 'true'; more.setAttribute('aria-expanded', o); mbox.hidden = !o; };
    const lk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'lock', checked: !!it.locked }), 'Sperren (nicht versehentlich verschieben)');
    lk.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Gesperrt' : 'Entsperrt', (doc) => { Model.find(doc, it.id).item.locked = e.target.checked; });
    const hd = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'hide', checked: !!it.hidden }), 'Ausblenden');
    hd.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Ausgeblendet' : 'Eingeblendet', (doc) => { Model.find(doc, it.id).item.hidden = e.target.checked; });
    const br = h('div', { class: 'btn-row' });
    const b1 = h('button', { type: 'button', class: 'btn small' }); b1.innerHTML = icon('copy') + 'Duplizieren'; b1.onclick = () => Actions.duplicate([it.id]);
    const b2 = h('button', { type: 'button', class: 'btn small' }); b2.innerHTML = icon('mirror') + 'Spiegeln X'; b2.onclick = () => Actions.mirror([it.id], 'x');
    const b3 = h('button', { type: 'button', class: 'btn small' }); b3.innerHTML = icon('mirror') + 'Spiegeln Y'; b3.onclick = () => Actions.mirror([it.id], 'y');
    const b4 = h('button', { type: 'button', class: 'btn small danger' }); b4.innerHTML = icon('trash') + 'Löschen'; b4.onclick = () => Actions.remove([it.id]);
    br.append(b1, b2, b3, b4);
    mbox.append(lk, hd, br);
    w.append(more, mbox);
    body.append(w);
  }

  // ---------- Kontextleiste im 3D-Bild ----------
  let ctx = null;
  function renderCtx() {
    if (ctx) { ctx.remove(); ctx = null; }
    if (App.mode !== 'model' || Sketch.active || Place.active || Handles.dragging) return;
    const items = App.selectedItems(); if (!items.length) return;
    const bar = h('div', { class: 'ctxbar', role: 'toolbar', 'aria-label': 'Aktionen' });
    const PRO = ['similar', 'shell', 'patternCirc', 'split', 'boolSubtract', 'layers'];
    const b = (ic, label, fn, cls = '', tip, iconOnly) => { const x = h('button', { type: 'button', class: cls + (PRO.includes(ic) ? ' pro' : ''), 'data-tip': tip || (iconOnly ? label : null), 'aria-label': label || tip, 'data-help': HELP[ic] ? ic : null }); x.innerHTML = icon(ic) + (label && !iconOnly ? `<span>${label}</span>` : ''); x.onclick = (e) => { e.stopPropagation(); fn(e); }; bar.append(x); return x; };
    const sep = () => bar.append(h('span', { class: 'vsep' }));
    // Schritt hinter dem Marker oder unterdrückt: nichts zum Bearbeiten, nur zurückholen
    const off = !App.ctx ? items.map((x) => Model.topOf(App.doc, x.item.id)).find((t) => t && !Model.isActive(App.doc, t.id)) : null;
    if (off) {
      bar.classList.add('inactive');
      bar.append(h('span', { class: 'lbl' }, off.suppressed ? 'Unterdrückt' : 'Hinter dem Marker'));
      if (off.suppressed) b('eye', 'Wieder einschalten', () => Timeline.toggleSuppress(off.id), 'accent', 'Diesen Schritt wieder mitrechnen');
      else b('rollback', 'Marker dahinter', () => Timeline.setMarker(App.doc.items.indexOf(off) + 1, `Zeitleiste: bis „${Model.label(off)}“`), 'accent', 'Den Marker hinter diesen Schritt ziehen – dann wird er wieder mitgerechnet');
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      return;
    }
    const face = Actions.selectedFace();
    if (App.edges.length) {
      bar.append(h('span', { class: 'lbl' }, App.edges.length > 1 ? App.edges.length + ' Kanten' : 'Kante'));
      b('fillet', 'Abrunden', () => Actions.addFinish('fillet', 1), 'accent', 'Kante abrunden (1 mm, danach änderbar)');
      b('chamfer', 'Abschrägen', () => Actions.addFinish('chamfer', 1), '', 'Kante abschrägen (1 mm, danach änderbar)');
      b('similar', 'Ähnliche', () => Select.similar(), '', 'Alle gleich langen Kanten dazuwählen (A)', true);
      b('chainEdges', 'Kette', () => Select.chain(), '', 'Alle Kanten dazuwählen, die ohne Knick weiterlaufen (z. B. ein gerundeter Umriss)', true);
      sep();
    } else if (face && items.length === 1 && face.info.t === 'PLANE') {
      bar.append(h('span', { class: 'lbl' }, 'Fläche'));
      b('sketch', 'Skizze hierauf', () => Sketch.startOnFace(face), 'accent', 'Auf dieser Fläche zeichnen');
      b('holeWizard', 'Bohrung', (e) => Place.holeHere(face, e.currentTarget), '', 'Bohrungs-Assistent: Schraubenloch, Gewinde, Einsatz oder Mutternfalle – hier und per Klick weitere');
      b('lift', 'Hochziehen', () => Sketch.pushPullFace(face), '', 'Die Fläche herausziehen oder hineindrücken');
      if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) b('shell', 'Aushöhlen', () => Features.shell(face), '', 'Körper aushöhlen – diese Fläche wird die Öffnung');
      b('section', 'Schnitt hier', () => Views.section(true, { face }), '', 'Schnitt parallel zu dieser Fläche – den Abstand stellst du in der Schnitt-Leiste ein', true);
      if (items[0].item.role !== 'hole') b('mirror', 'An Fläche spiegeln', () => Features.mirrorAtFace(face), '', 'Gespiegelte Kopie an dieser Fläche – z. B. die zweite Hälfte eines symmetrischen Teils', true);
      sep();
    } else if (face && items.length === 1 && face.info.t !== 'PLANE') {
      bar.append(h('span', { class: 'lbl' }, 'Runde Fläche'));
      b('holeWizard', 'Bohrung', (e) => Place.holeHere(face, e.currentTarget), 'accent', 'Bohrungs-Assistent: Loch senkrecht in die runde Fläche – der Magnet rastet ganz oben, an den Seiten und in der Mitte ein');
      sep();
    }
    if (items.length === 1) {
      const it = items[0].item;
      const hole = it.role === 'hole';
      const compact = !!(face || App.edges.length);
      b(hole ? 'solid' : 'hole', hole ? 'Zum Körper' : 'Zum Loch', () => Actions.toggleRole(), '', hole ? 'Wieder zum festen Körper machen (H)' : 'Zum Loch machen – schneidet dann in andere Körper (H)', compact);
      b('rotate', 'Drehen', (e) => UI.menu(e.currentTarget, [{ label: 'Um 90° drehen (flach)', icon: 'rotate', kbd: 'R', run: () => Actions.rotate90(null, 'z') }, { label: 'Nach vorne kippen', icon: 'rotate', run: () => Actions.rotate90(null, 'x') }, { label: 'Zur Seite kippen', icon: 'rotate', run: () => Actions.rotate90(null, 'y') }]), '', 'Um 90° drehen oder kippen', true);
      b('mirror', 'Spiegeln', (e) => UI.menu(e.currentTarget, [{ label: 'Links ↔ rechts', icon: 'mirror', run: () => Actions.mirror(null, 'x') }, { label: 'Vorne ↔ hinten', icon: 'mirror', run: () => Actions.mirror(null, 'y') }, { label: 'Oben ↔ unten', icon: 'mirror', run: () => Actions.mirror(null, 'z') }]), '', 'Spiegeln', true);
      b('copy', 'Duplizieren', () => Actions.duplicate(), '', 'Duplizieren (Strg D)', true);
      b('patternCirc', 'Muster', (e) => UI.menu(e.currentTarget, [{ label: 'Rechteckmuster', icon: 'patternRect', run: () => Features.pattern('rect') }, { label: 'Kreismuster', icon: 'patternCirc', run: () => Features.pattern('circ') }, { label: 'Muster entlang Kurve', icon: 'patternPath', run: () => Features.patternPath() }, { label: 'Gespiegelte Kopie', icon: 'mirror', run: () => Features.pattern('mirror') }]), '', hole ? 'Loch als Muster oder gespiegelt vervielfachen' : 'Muster oder gespiegelte Kopie', true);
      if (!hole) b('split', 'Teilen', () => Features.split(), '', 'Körper an einer Ebene teilen', true);
      if (!hole && it.kind === 'extrude' && it.p && it.p.sketch) b('loft', 'Zur Spitze', () => Actions.loft([it.id], { tip: 10 }), '', 'Den Umriss zu einer Spitze zusammenlaufen lassen (Übergang mit Spitze)', true);
      if (!App.edges.length) b('similar', 'Ähnliche', () => Select.similar(), '', 'Alle gleichen Teile wählen (A)', true);
      if (it.kind === 'group') b('ungroup', 'Gruppe lösen', () => Actions.ungroup(), '', 'Gruppe lösen', true);
    } else {
      b('group', 'Gruppieren', () => Actions.group(), 'accent', 'Zu einem Körper verbinden (Strg G)');
      if (items.length === 2) b('dim', 'Abstand', (e) => gapPop(e.currentTarget), '', 'Abstand zwischen den beiden Teilen genau setzen (der zuletzt gewählte bewegt sich)', true);
      if (items.length === 2 && !Model.parentsOf(App.doc, items[0].item.id).some((q) => q.id === items[1].item.id) && !Model.parentsOf(App.doc, items[1].item.id).some((q) => q.id === items[0].item.id)) b('hinge', 'Gelenk', () => Joints.start(), '', 'Drehgelenk: das zuletzt gewählte Teil dreht sich um eine Achse, die du im Bild wählst', true);
      if (items.length >= 2 && items.every((x) => x.item.kind === 'extrude')) b('loft', 'Übergang', () => Actions.loft(), '', 'Weicher Übergang durch die Umrisse – in der Reihenfolge, in der du sie gewählt hast');
      b('boolSubtract', 'Boolesch', (e) => UI.menu(e.currentTarget, [{ label: 'Vereinigen', icon: 'boolUnion', run: () => Features.boolean('union') }, { label: 'Abziehen (der zuerst gewählte bleibt)', icon: 'boolSubtract', run: () => Features.boolean('subtract') }, { label: 'Schnittmenge', icon: 'boolIntersect', run: () => Features.boolean('intersect') }]), '', 'Körper vereinigen, abziehen oder schneiden', true);
      b('layers', 'Ausrichten', (e) => UI.menu(e.currentTarget, [['left', 'Links bündig'], ['cx', 'Mittig (X)'], ['right', 'Rechts bündig'], ['front', 'Vorne bündig'], ['cy', 'Mittig (Y)'], ['back', 'Hinten bündig'], ['bottom', 'Unten bündig']].map(([m, l]) => ({ label: l, run: () => Actions.align(null, m) }))), '', 'Objekte aneinander ausrichten');
      b('copy', 'Duplizieren', () => Actions.duplicate(), '', 'Duplizieren (Strg D)', true);
    }
    b('trash', 'Löschen', () => Actions.remove(), 'danger', 'Löschen (Entf)', true);
    $('#overlay').append(bar); ctx = bar;
    placeCtx();
  }
  function placeCtx() {
    if (!ctx) return;
    const ids = App.sel;
    let box = new THREE.Box3();
    for (const id of ids) { const b = Actions.worldBox(id); if (b) box.union(b); }
    if (box.isEmpty() && ctx.classList.contains('inactive')) { const cr0 = $('#center').getBoundingClientRect(); ctx.hidden = false; ctx.style.left = cr0.width / 2 + 'px'; ctx.style.top = '70px'; return; }
    if (box.isEmpty()) { ctx.hidden = true; return; }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, any = false;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      const s = Viewer.toScreen(p); if (s.behind) continue; any = true;
      minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x); miny = Math.min(miny, s.y); maxy = Math.max(maxy, s.y);
    }
    const cr = $('#center').getBoundingClientRect();
    if (!any && ctx.classList.contains('inactive')) { ctx.hidden = false; ctx.style.left = cr.width / 2 + 'px'; ctx.style.top = '70px'; return; }
    if (!any) { ctx.hidden = true; return; }
    ctx.hidden = false;
    const bw = ctx.offsetWidth, bh = ctx.offsetHeight;
    let x = (minx + maxx) / 2, y = miny - bh - 44;
    if (y < 8) y = Math.min(cr.height - bh - 8, maxy + 44);
    x = clamp(x, bw / 2 + 8, cr.width - bw / 2 - 8);
    ctx.style.left = x + 'px'; ctx.style.top = clamp(y, 8, cr.height - bh - 8) + 'px';
  }

  // ---------- Ansichtswürfel ----------
  let cubeEl = null, gizmo = null;
  function initViewCube() {
    const wrap = h('div', { class: 'viewcube', 'aria-label': 'Ansicht wählen' });
    const cube = h('div', { class: 'cube' });
    const F = [['top', 'Oben', [0, 0, 1], [0, 1, 0]], ['front', 'Vorne', [0, -1, 0], [0, 0, 1]], ['right', 'Rechts', [1, 0, 0], [0, 0, 1]], ['back', 'Hinten', [0, 1, 0], [0, 0, 1]], ['left', 'Links', [-1, 0, 0], [0, 0, 1]], ['bottom', 'Unten', [0, 0, -1], [0, 1, 0]]];
    for (const [id, label, n, up] of F) {
      const N = new THREE.Vector3(...n), U = new THREE.Vector3(...up), Rr = new THREE.Vector3().crossVectors(U, N);
      const t = N.clone().multiplyScalar(30);
      const m = [Rr.x, Rr.y, Rr.z, 0, -U.x, -U.y, -U.z, 0, N.x, N.y, N.z, 0, t.x, t.y, t.z, 1];
      const f = h('div', { class: 'face', role: 'button', 'aria-label': label + ' ansehen', title: label }, label);
      f.style.transform = `matrix3d(${m.join(',')})`;
      f.style.left = '0'; f.style.top = '0';
      f.addEventListener('click', () => Viewer.setView(id));
      cube.append(f);
    }
    wrap.append(cube);
    $('#overlay').append(wrap); cubeEl = cube;
    const vb = h('div', { class: 'view-btns' });
    const b1 = h('button', { type: 'button', 'aria-label': 'Alles zeigen', 'data-tip': 'Alles zeigen', 'data-kbd': 'F' }); b1.innerHTML = icon('fit'); b1.onclick = () => Viewer.fit();
    const b2 = h('button', { type: 'button', 'aria-label': 'Schräge Ansicht', 'data-tip': 'Schräge Ansicht' }); b2.innerHTML = icon('home'); b2.onclick = () => Viewer.setView('iso');
    const tg = (k, ic, tip, kbd) => { const b = h('button', { type: 'button', 'aria-label': tip, 'data-tip': tip, 'data-kbd': kbd || null }); b.innerHTML = icon(ic); b.onclick = () => ViewPrefs.toggle(k); b.dataset.pref = k; return b; };
    const bO = tg('ortho', 'viewOrtho', 'Orthografisch / Perspektive', 'O'); bO.classList.add('pro');
    const bG = tg('gridOn', 'grid', 'Raster ein/aus', 'G');
    const bP = tg('planes', 'originPlanes', 'Ursprungsebenen ein/aus'); bP.classList.add('pro');
    const syncBtns = (pv) => { for (const b of [bO, bG, bP]) b.classList.toggle('on', !!pv[b.dataset.pref]); bO.innerHTML = icon(pv.ortho ? 'viewOrtho' : 'viewPersp'); };
    ViewPrefs.on('change', syncBtns); syncBtns(ViewPrefs.get());
    // Notizen ein/aus – nur sichtbar, wenn das Projekt Notizen hat
    const bN = tg('notes', 'notesShow', 'Notizen ein/aus', 'N');
    bN.removeAttribute('data-kbd');
    const syncNotes = () => { const on = ViewPrefs.get().notes !== false; bN.hidden = !(App.doc.notes || []).length; bN.innerHTML = icon(on ? 'notesShow' : 'notesHide'); bN.classList.toggle('on', on); };
    ViewPrefs.on('change', syncNotes); App.on('doc', syncNotes); syncNotes();
    const bX = h('button', { type: 'button', 'aria-label': 'Röntgen ein/aus', 'data-tip': 'Röntgen: Körper durchsichtig', 'data-kbd': 'X', 'data-view': 'xray', 'data-help': 'xray' }); bX.innerHTML = icon('xray'); bX.onclick = () => Views.xray();
    const bC = h('button', { type: 'button', 'aria-label': 'Schnitt ein/aus', 'data-tip': 'Schnitt: Modell aufschneiden', 'data-kbd': 'C', 'data-view': 'cut', 'data-help': 'section' }); bC.innerHTML = icon('section'); bC.onclick = () => Views.section();
    const bF = h('button', { type: 'button', 'aria-label': 'Auswahlfilter', 'data-tip': 'Wählen: Alles', 'data-view': 'filter', 'data-help': 'selectFilter' }); bF.innerHTML = icon('pointer'); bF.onclick = (e) => Select.menu(e.currentTarget);
    for (const x of [bX, bC, bF]) x.classList.add('pro');
    vb.append(bO, bG, bP, bN, bX, bC, bF, h('div', { class: 'sep' }), b1, b2); $('#overlay').append(vb);
    gizmo = svgEl('<svg class="axis-gizmo" viewBox="0 0 64 64" aria-hidden="true"></svg>');
    $('#overlay').append(gizmo);
    Viewer.on('camera', syncCube); syncCube();
  }
  function syncCube() {
    if (!cubeEl) return;
    const cam = Viewer.camera; cam.updateMatrixWorld();
    const R = new THREE.Matrix4().extractRotation(cam.matrixWorldInverse);
    const e = R.elements; // Spaltenweise
    const S = [1, -1, 1];
    const m = [e[0] * S[0], e[1] * S[1], e[2] * S[2], 0, e[4] * S[0], e[5] * S[1], e[6] * S[2], 0, e[8] * S[0], e[9] * S[1], e[10] * S[2], 0, 0, 0, 0, 1];
    cubeEl.style.transform = `matrix3d(${m.map((v) => +v.toFixed(5)).join(',')})`;
    // Achsenkreuz
    const ax = [[1, 0, 0, '#d24a3c', 'X'], [0, 1, 0, '#3a9a3f', 'Y'], [0, 0, 1, '#3067d0', 'Z']];
    let html = '';
    const pts = ax.map(([x, y, z, c, l]) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(R); return { x: 32 + v.x * 20, y: 32 - v.y * 20, z: v.z, c, l }; }).sort((a, b) => a.z - b.z);
    for (const p of pts) html += `<line x1="32" y1="32" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${p.c}" stroke-width="2.2" stroke-linecap="round"/><text x="${(32 + (p.x - 32) * 1.32).toFixed(1)}" y="${(32 + (p.y - 32) * 1.32 + 4).toFixed(1)}" fill="${p.c}" font-size="10" font-weight="700" text-anchor="middle" font-family="Barlow Semi Condensed, sans-serif">${p.l}</text>`;
    gizmo.innerHTML = html;
    placeCtx();
  }

  function init() {
    $('#lt-tree').onclick = () => { leftTab = 'tree'; renderLeft(); };
    $('#lt-params').onclick = () => { leftTab = 'params'; renderLeft(); };
    $('#lt-log').onclick = () => { leftTab = 'log'; renderLeft(); };
    App.on('ctx', () => renderLeft());
    Log.on('change', debounce(() => { if (leftTab === 'log') renderLeft(); }, 80));
    renderTools(); initViewCube();
    const rerender = debounce(() => { renderLeft(); renderRight(); renderCtx(); UI.renderHint(); }, 16);
    App.on('doc', rerender); App.on('selection', rerender); App.on('results', rerender); DroneCheck.on('checked', () => { if (!App.sel.length) rerender(); }); Weak.on('analyzed', () => { if (!App.sel.length) rerender(); }); App.on('mode', () => { renderTools(); rerender(); });
    Viewer.on('camera', placeCtx);
    ViewPrefs.on('change', debounce(() => { if (leftTab === 'tree') renderLeft(); }, 30));   // Erste Schritte ein-/ausblenden
  }
  return { init, renderLeft, renderRight, renderTools, renderCtx, closeFlyout, toggleFlyout, firstStepDone, firstStepsState, expand: (id) => { expanded.add(id); renderLeft(); }, showParams: () => { leftTab = 'params'; renderLeft(); } };
})();

