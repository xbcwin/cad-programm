// ================= Oberfläche: Leisten, Verlauf, Einstellungen =================
const Panels = (() => {
  const expanded = new Set();
  const collapsedBodies = new Set();
  let leftTab = 'tree';
  let flyout = null;

  // ---------- Werkzeugleiste ----------
  // einfache Oberfläche: diese Grundkörper und Bauteile bleiben sichtbar
  const SIMPLE_KINDS = ['box', 'cylinder', 'sphere', 'cone', 'tube', 'hemisphere'];
  const SIMPLE_PARTS = ['screwHole', 'nutTrap', 'slotHole', 'zipTie', 'hinge'];
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
      btn('t-body', 'cube', T('tool.body'), T('tool.bodyTip'), 'K', (e) => toggleFlyout('bodies', e.currentTarget));
      btn('t-sketch', 'sketch', T('tool.sketch'), T('tool.sketchTip'), 'S', () => Sketch.chooseAndStart());
      btn('t-parts', 'parts', T('tool.parts'), T('tool.partsTip'), 'B', (e) => toggleFlyout('parts', e.currentTarget));
      btn('t-measure', 'measure', T('tool.measure'), T('tool.measureTip'), 'M', () => Measure.toggle(), 'minor pro');
      btn('t-notes', 'noteDraw', T('tool.notes'), T('tool.notesTip'), 'N', () => Notes.toggle(), 'minor pro');
      btn('t-views', 'xray', T('tool.views'), T('tool.viewsTip'), '', (e) => Views.menu(e.currentTarget), 'minor pro');
      // einfache Oberfläche: die Profi-Werkzeuge stecken hinter „Mehr“
      btn('t-more', 'menu', T('tool.more'), T('tool.moreTip'), '', (e) => UI.menu(e.currentTarget, [
        { label: T('menu.more.measure'), icon: 'measure', kbd: 'M', run: () => Measure.toggle() },
        { label: T('menu.more.notes'), icon: 'noteDraw', kbd: 'N', run: () => Notes.toggle() },
        { label: T('menu.more.views'), icon: 'xray', run: () => Views.menu($('#t-more')) },
        { label: T('menu.more.weakSpots'), icon: 'target', run: () => Weak.dialog() },
        '-', { label: T('menu.more.showAllPro'), icon: 'sliders', help: 'levelSwitch', run: () => ViewPrefs.setLevel('pro') },
      ]), 'simple-only');
      el.append(h('div', { class: 'sep' }));
      Views.sync();
      btn('t-export', 'export', T('tool.export'), T('tool.exportTip'), 'Strg E', () => Print.exportDialog(), 'primary', T('tool.exportShort'));
    } else {
      btn('t-sheet', 'sheet', T('tool.sheet'), T('tool.sheetTip'), '', (e) => Drawing.sheetMenu(e.currentTarget));
      btn('t-dim', 'dim', T('tool.dim'), T('tool.dimTip'), 'D', () => Drawing.tool('dim'));
      btn('t-autodim', 'target', T('tool.autodim'), T('tool.autodimTip'), '', () => Drawing.autoDims(), '', T('tool.autodimShort'));
      btn('t-draw', 'line', T('tool.draw2d'), T('tool.draw2dTip'), '', (e) => Drawing.drawMenu(e.currentTarget));
      el.append(h('div', { class: 'sep' }));
      btn('t-dexport', 'export', T('tool.dexport'), T('tool.dexportTip'), '', (e) => Drawing.exportMenu(e.currentTarget), 'primary', T('tool.dexportShort'));
    }
  }
  // weiche Trennstellen für lange Wörter auf schmalen Kacheln (nur Anzeige)
  const HY = { Schraubenloch: 'Schrauben\u00ADloch', Mutternfalle: 'Muttern\u00ADfalle', Gewindeeinsatz: 'Gewinde\u00ADeinsatz', Schnapphaken: 'Schnapp\u00ADhaken', Halbkugel: 'Halb\u00ADkugel' };
  const hyph = (s) => HY[s] || s;
  function closeFlyout() { if (flyout) { flyout.el.remove(); const b = flyout.btn; b && b.setAttribute('aria-expanded', 'false'); flyout = null; document.removeEventListener('pointerdown', flyOutside, true); } }
  function flyOutside(e) { if (flyout && !flyout.el.contains(e.target) && !(flyout.btn && flyout.btn.contains(e.target))) closeFlyout(); }
  function toggleFlyout(kind, btn) {
    if (flyout && flyout.kind === kind) { closeFlyout(); return; }
    closeFlyout();
    const el = h('div', { class: 'flyout' });
    if (kind === 'bodies') {
      el.append(h('h3', null, T('tool.fly.bodiesTitle')));
      const tiles = h('div', { class: 'tiles' });
      for (const k of PRIMITIVE_ORDER) {
        const t = h('div', { class: 'tile' + (SIMPLE_KINDS.includes(k) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-tip': T('tool.fly.tileTip') });
        t.innerHTML = primitiveSVG(k); t.append(h('span', { class: 'lbl' }, hyph(KINDS[k].label)));
        Place.bindTile(t, { kind: k });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { Actions.addPrimitive(k); closeFlyout(); } });
        tiles.append(t);
      }
      el.append(tiles);
      const row = h('div', { class: 'btn-row' });
      const holeBtn = h('button', { type: 'button', class: 'btn small' }); holeBtn.innerHTML = icon('hole') + esc(T('tool.fly.cylHole'));
      holeBtn.onclick = () => { Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } }); closeFlyout(); };
      const boxHole = h('button', { type: 'button', class: 'btn small' }); boxHole.innerHTML = icon('hole') + esc(T('tool.fly.boxHole'));
      boxHole.onclick = () => { Actions.addPrimitive('box', { role: 'hole', name: 'Aussparung', p: { w: 10, d: 10, h: 30 } }); closeFlyout(); };
      const routeBtn = h('button', { type: 'button', class: 'btn small pro', id: 'add-route', 'data-help': 'route3d' }); routeBtn.innerHTML = icon('sweep') + esc(T('tool.fly.route3d'));
      routeBtn.onclick = () => { closeFlyout(); Features.route3d(); };
      row.append(holeBtn, boxHole, routeBtn); el.append(row);
      el.append(h('div', { class: 'foot' }, T('tool.fly.bodiesFoot')));
    } else if (kind === 'drone') {
      el.classList.add('drone');
      DroneUI.flyout(el);
    } else {
      el.append(h('h3', null, T('tool.fly.partsTitle')));
      const tiles = h('div', { class: 'tiles' });
      for (const d of LIB.filter((x) => !x.buy && !x.drone)) {
        const t = h('div', { class: 'tile' + (d.role === 'hole' ? ' hole-part' : '') + (SIMPLE_PARTS.includes(d.lib) ? '' : ' pro'), role: 'button', tabindex: '0', 'data-tip': d.desc, 'data-help': HELP[d.lib] ? d.lib : null });
        t.innerHTML = partSVG(d); t.append(h('span', { class: 'lbl' }, hyph(d.label)), h('span', { class: 'role' }, d.role === 'hole' ? T('common.hole') : T('common.body')));
        Place.bindTile(t, { part: d });
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { Actions.addPart(d, libDefaults(d)); closeFlyout(); } });
        tiles.append(t);
      }
      el.append(tiles);
      el.append(h('div', { class: 'foot' }, T('tool.fly.partsFoot')));
    }
    $('#center').append(el);
    const anc = btn || $('#t-parts') || $('#t-body');
    const br = anc ? anc.getBoundingClientRect() : { left: 16 }, cr = $('#center').getBoundingClientRect();
    el.style.left = clamp(br.left - cr.left, 8, cr.width - el.offsetWidth - 8) + 'px'; el.style.top = '8px';
    if (btn) btn.setAttribute('aria-expanded', 'true');
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
  let dragInfo = null;
  function clearDropClasses() {
    for (const n of document.querySelectorAll('#left-body .node')) {
      n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad', 'dragging');
      n.removeAttribute('title');
    }
  }
  // Suchen und Filtern im Verlauf (BE-09)
  let treeFilter = '', treeKind = 'all';
  const TFKINDS = [['all', 'Alle'], ['solid', 'Körper'], ['hole', 'Löcher'], ['hidden', 'Ausgeblendet'], ['err', 'Mit Fehler'], ['note', 'Mit Notiz'], ['ai', 'Von der KI']];
  function treeMatch(it) {
    const q = treeFilter.trim().toLowerCase();
    if (q) {
      const kl = it.kind === 'part' ? (LIBMAP[it.p && it.p.lib] || {}).label || '' : (KINDS[it.kind] || {}).label || '';
      const bodyHit = (it.bodies || []).some((b) => b && (b.name || '').toLowerCase().includes(q));
      if (!(Model.label(it).toLowerCase().includes(q) || kl.toLowerCase().includes(q) || (it.note || '').toLowerCase().includes(q) || bodyHit)) return false;
    }
    if (treeKind === 'solid') return it.role !== 'hole' && it.kind !== 'group';
    if (treeKind === 'hole') return it.role === 'hole';
    if (treeKind === 'hidden') return !!it.hidden || (it.bodies || []).some((b) => b && b.hidden);
    if (treeKind === 'err') return App.errorsFor(it.id).length > 0 || RefFix.hasBrokenRef(it.id);
    if (treeKind === 'note') return !!it.note;
    if (treeKind === 'ai') return !!it.ai;
    return true;
  }
  const filtering = () => !!treeFilter.trim() || treeKind !== 'all';
  function treeFilterBar(total) {
    const inp = h('input', { type: 'search', id: 'tree-filter', value: treeFilter, placeholder: 'Im Verlauf suchen …', 'aria-label': 'Im Verlauf suchen', autocomplete: 'off', spellcheck: 'false' });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { treeFilter = ''; renderLeft(); } });
    inp.addEventListener('input', () => { const pos = inp.selectionStart; treeFilter = inp.value; renderLeft(); const ni = $('#tree-filter'); if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (_) {} } });
    const sel = h('select', { id: 'tree-kind', 'aria-label': 'Nur zeigen' }); for (const [k, l] of TFKINDS) sel.append(h('option', { value: k, ...(k === treeKind ? { selected: true } : {}) }, l));
    sel.onchange = () => { treeKind = sel.value; renderLeft(); };
    return h('div', { class: 'tree-filter', 'data-help': 'treeFilter' }, inp, sel);
  }
  function openBodyColorPop(anchor, itemId, bodyIdx, curColor, hasOwnColor) {
    const box = h('div', { class: 'body-color-pop' });
    box.append(h('div', { class: 'section-h' }, 'Körperfarbe'));
    const row = h('div', { class: 'colors' });
    for (const c of COLORS) {
      const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': c.c === curColor ? 'true' : 'false', style: { background: c.c } });
      b.onclick = () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: c.c }); };
      row.append(b);
    }
    const free = h('input', { type: 'color', class: 'body-color-inp', value: /^#[0-9a-f]{6}$/i.test(curColor || '') ? curColor : '#2f9e91', 'aria-label': 'Eigene Farbe' });
    free.addEventListener('change', () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: free.value.toLowerCase() }); });
    row.append(h('label', { class: 'color-free', 'data-tip': 'Jede Farbe' }, free));
    box.append(row);
    if (hasOwnColor) {
      const rst = h('button', { type: 'button', class: 'btn ghost small body-color-reset' });
      rst.innerHTML = icon('undo') + 'Farbe vom Teil';
      rst.onclick = () => { UI.closePop(); Actions.setBody(itemId, bodyIdx, { color: null }); };
      box.append(rst);
    }
    UI.pop(anchor, box);
  }
  async function renameBodyPrompt(itemId, bodyIdx, curName) {
    const n = await UI.prompt('Körper umbenennen', 'Name', curName, 'Umbenennen');
    if (n !== null) Actions.setBody(itemId, bodyIdx, { name: n.trim() || null });
  }
  function renderBodiesList(it) {
    if (!App.doc.items.includes(it) || it.role === 'hole' || App.mergedInto(it.id)) return null;
    const res = App.results.get(it.id);
    const evalBodies = res && res.data && res.data.bodies;
    if (!evalBodies || evalBodies.length < 2) return null;
    const meta = Model.matchBodies(it.bodies, evalBodies);
    const open = !collapsedBodies.has(it.id);
    const wrap = h('div', { class: 'bodies-wrap', 'data-bodies-of': it.id, 'data-help': 'bodyList' });
    const head = h('button', { type: 'button', class: 'bodies-head', 'aria-expanded': open ? 'true' : 'false' });
    const chev = h('span', { class: 'tw' + (open ? ' open' : '') }); chev.innerHTML = icon('chevR');
    head.append(chev, h('span', null, `Körper (${evalBodies.length})`));
    head.onclick = (e) => { e.stopPropagation(); open ? collapsedBodies.add(it.id) : collapsedBodies.delete(it.id); renderLeft(); };
    wrap.append(head);
    if (!open) return wrap;
    const list = h('div', { class: 'bodies-list' });
    const anyHidden = meta.some((m) => m && m.hidden);
    for (let bi = 0; bi < evalBodies.length; bi++) {
      const mb = meta[bi];
      const bName = (mb && mb.name) || `Körper ${bi + 1}`;
      const ownCol = (mb && mb.color) || null;
      const bCol = ownCol || it.color || '#2f9e91';
      const hidden = !!(mb && mb.hidden);
      const row = h('div', { class: 'body-row' + (hidden ? ' hidden-item' : ''), dataset: { item: it.id, body: String(bi) } });
      const colBtn = h('button', { type: 'button', class: 'swatch body-color-btn', style: { background: bCol }, 'aria-label': 'Farbe ändern', 'data-tip': 'Farbe ändern' });
      colBtn.onclick = (e) => { e.stopPropagation(); openBodyColorPop(colBtn, it.id, bi, bCol, !!ownCol); };
      const nm = h('span', { class: 'nm', title: bName }, bName);
      const acts = h('span', { class: 'acts' });
      const ren = h('button', { type: 'button', class: 'body-rename', 'aria-label': 'Umbenennen', 'data-tip': 'Umbenennen' });
      ren.innerHTML = icon('edit');
      ren.onclick = (e) => { e.stopPropagation(); renameBodyPrompt(it.id, bi, bName); };
      const eye = h('button', { type: 'button', class: 'body-eye', 'aria-label': hidden ? 'Einblenden' : 'Ausblenden', 'data-tip': hidden ? 'Einblenden' : 'Ausblenden' });
      eye.innerHTML = icon(hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); Actions.setBody(it.id, bi, { hidden: !hidden }); };
      acts.append(ren, eye);
      row.append(colBtn, nm, acts);
      row.addEventListener('click', (e) => { e.stopPropagation(); App.select([it.id]); });
      row.addEventListener('dblclick', (e) => { e.stopPropagation(); renameBodyPrompt(it.id, bi, bName); });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: 'Umbenennen', run: () => renameBodyPrompt(it.id, bi, bName) },
          { icon: 'sliders', label: 'Farbe ändern', run: () => openBodyColorPop(colBtn, it.id, bi, bCol, !!ownCol) },
          { icon: hidden ? 'eye' : 'eyeOff', label: hidden ? 'Einblenden' : 'Ausblenden', run: () => Actions.setBody(it.id, bi, { hidden: !hidden }) },
          { icon: 'focusView', label: 'Nur diesen Körper zeigen', run: () => Actions.showOnlyBody(it.id, bi) },
          ...(anyHidden ? [{ icon: 'eye', label: 'Alle Körper einblenden', run: () => Actions.showAllBodies(it.id) }] : []),
        ]);
      });
      row.addEventListener('pointerenter', () => { if (!hidden) Viewer.highlightBody(it.id, bi); });
      row.addEventListener('pointerleave', () => Viewer.highlightBody(null, null));
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  }
  function renderTree(body) {
    const items = App.doc.items;
    const fs = items.length <= 8 ? firstSteps() : null;
    if (fs) body.append(fs);
    if (!items.length) {
      body.append(h('div', { class: 'empty-tree', html: 'Hier erscheint alles, was du baust – <b>Schritt für Schritt</b>.<br><br>Fang mit einem <b>Körper</b> an oder beschreibe unten in der Zeile, was du bauen möchtest.' }));
      const ds = Datums.treeSection(); if (ds) body.append(ds);
      const as = Datums.axisTreeSection(); if (as) body.append(as);
      const ps = Datums.pointTreeSection(); if (ps) body.append(ps);
      const cs = Datums.csysTreeSection(); if (cs) body.append(cs);
      const ms = Measure.treeSection(); if (ms) body.append(ms);
      return;
    }
    const V = Model.vars(App.doc).v;
    const selSet = new Set(App.sel);
    let nAll = 0; Model.walk(items, () => { nAll++; });
    if (nAll >= 6 || filtering()) body.append(treeFilterBar(nAll));
    // beim Filtern: Treffer und die Gruppen/Ordner, in denen sie liegen
    let show = null, hits = 0;
    const folders = App.doc.folders || [];
    const itemFolder = new Map();
    for (const fld of folders) for (const id of fld.ids || []) itemFolder.set(id, fld);
    if (filtering()) {
      show = new Set();
      const mark = (list, chain) => { for (const it of list) { if (treeMatch(it)) { hits++; show.add(it.id); for (const c of chain) show.add(c); } if (it.kind === 'group') mark(it.children || [], [...chain, it.id]); } };
      mark(items, []);
      const q = treeFilter.trim().toLowerCase();
      if (q && treeKind === 'all') {
        for (const fld of folders) if ((fld.name || '').toLowerCase().includes(q)) for (const id of fld.ids || []) show.add(id);
      }
      body.append(h('div', { class: 'tree-count', id: 'tree-count' }, hits ? `${hits} von ${nAll} ${nAll === 1 ? 'Schritt' : 'Schritten'}` : 'Nichts gefunden'));
    }
    const topSel = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    if (topSel.length >= 2 && !App.ctx) {
      const sb = h('div', { class: 'tree-sel-bar', id: 'tree-sel-bar' }, h('span', null, `${topSel.length} Schritte gewählt`));
      const fb = h('button', { type: 'button', class: 'btn small', id: 'btn-tree-folder', 'data-help': 'treeFolder' });
      fb.innerHTML = icon('folder') + esc(T('menu.tree.toFolder'));
      fb.onclick = () => Actions.createFolder(topSel);
      sb.append(fb);
      body.append(sb);
    }
    const ul = h('ul', { class: 'tree', role: 'tree' });
    const ctxTop = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
    const renderItemLi = (it) => {
      const li = h('li', { role: 'treeitem' });
      const topIdx = App.doc.items.indexOf(it);
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
      const into = App.mergedInto(it.id), OPI = { join: '∪', cut: '−', common: '∩' };
      const patTxt = Features.isOp(it) ? Model.sizeText(it, V) : '';
      const sub = h('span', { class: 'sub mono' }, into && it.op ? `${patTxt ? patTxt + ' · ' : ''}${OPI[it.op.type]} ${Model.label(Model.find(App.doc, into).item)}` : (it.link ? '↔ ' : '') + Model.sizeText(it, V));
      const acts = h('span', { class: 'acts' });
      const dup = h('button', { type: 'button', class: 'act-dup', 'aria-label': T('common.duplicate'), 'data-tip': T('ctx.dupTip'), 'data-help': 'treeDuplicate' });
      dup.innerHTML = icon('copy');
      dup.onclick = (e) => { e.stopPropagation(); Actions.duplicate([it.id]); };
      const eye = h('button', { type: 'button', 'aria-label': it.hidden ? 'Einblenden' : 'Ausblenden', 'data-tip': it.hidden ? 'Einblenden' : 'Ausblenden' }); eye.innerHTML = icon(it.hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); App.change(it.hidden ? 'Eingeblendet' : 'Ausgeblendet', (doc) => { const f = Model.find(doc, it.id); f.item.hidden = !f.item.hidden; }); };
      const del = h('button', { type: 'button', 'aria-label': 'Löschen', 'data-tip': 'Löschen' }); del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); Actions.remove([it.id]); };
      if (topIdx >= 0 && it.kind === 'group') { const be = h('button', { type: 'button', 'aria-label': 'Bauteil bearbeiten', 'data-tip': App.ctx === it.id ? 'Bearbeitung beenden' : 'Als Bauteil bearbeiten (Rest wird durchsichtig)' }); be.innerHTML = icon(App.ctx === it.id ? 'check' : 'edit'); be.onclick = (e) => { e.stopPropagation(); App.ctx === it.id ? App.setCtx(null) : Comp.edit(it.id); }; acts.append(be); }
      if (topIdx >= 0) { const io = h('button', { type: 'button', 'aria-label': 'Isolieren', 'data-tip': App.iso === it.id ? 'Alle wieder zeigen' : 'Nur dieses Teil zeigen' }); io.innerHTML = icon('focusView'); io.onclick = (e) => { e.stopPropagation(); Comp.toggleIso(it.id); }; acts.append(io); }
      if (ownIdx >= 0 && (!ctxTop || inCtx)) { const sp = h('button', { type: 'button', 'aria-label': it.suppressed ? 'Aktivieren' : 'Unterdrücken', 'data-tip': it.suppressed ? 'Wieder aktivieren' : 'Unterdrücken (bleibt erhalten, zählt nicht mit)', 'data-help': 'suppress' }); sp.innerHTML = icon('suppress'); sp.onclick = (e) => { e.stopPropagation(); Timeline.toggleSuppress(it.id); }; acts.append(sp); }
      acts.append(dup, eye, del);
      row.append(tw, sw, nm);
      if (it.ai) { const am = h('span', { class: 'ai-mark', 'data-tip': (it.ai.edit ? 'Von der KI geändert: „' : 'Von der KI gebaut: „') + it.ai.q + '“' }); am.innerHTML = icon('spark'); row.append(am); }
      const hardErrs = RefFix.hardErrorsFor(it.id);
      const refIssues = RefFix.issuesOf(it.id);
      const childRef = !refIssues.length && it.kind === 'group' && !expanded.has(it.id) ? RefFix.firstDescendantIssue(it) : null;
      if (hardErrs.length) { const er = h('span', { class: 'err', 'data-tip': hardErrs[0].message }); er.innerHTML = icon('warn'); row.append(er); }
      if (refIssues.length || childRef) {
        const iss = refIssues[0] || childRef;
        const wr = h('span', { class: 'warn-ref', 'data-tip': iss.message + ' · Klicken zum Neu wählen', title: iss.message + ' · Klicken zum Neu wählen', 'data-help': 'refFix' });
        wr.innerHTML = icon('warn');
        wr.onclick = (e) => { e.stopPropagation(); RefFix.start(iss); };
        row.append(wr);
      }
      row.append(sub, acts);
      row.addEventListener('click', (e) => { App.select([it.id], { additive: e.shiftKey || e.metaKey || e.ctrlKey }); });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); if (!selSet.has(it.id)) App.select([it.id]);
        const topSelNow = [...new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
        const inFld = topIdx >= 0 ? Model.folderOf(App.doc, it.id) : null;
        UI.menu(row, [
          ...(refIssues.length ? [{ icon: 'warn', label: 'Neu wählen (kaputter Bezug)', id: 'tm-reffix', help: 'refFix', run: () => RefFix.start(refIssues[0]) }] : []),
          { icon: 'help', label: T('common.explainStep'), help: 'explainStep', run: () => Explain.dialog(it.id) },
          { icon: 'copy', label: T('common.duplicate'), id: 'tm-dup', kbd: 'Strg D', help: 'treeDuplicate', run: () => Actions.duplicate([it.id]) },
          ...(Features.canMirrorStep(it, (Model.find(App.doc, it.id) || {}).parent) ? [{ icon: 'mirror', label: T('common.mirrorStep'), id: 'tm-mirrorstep', help: 'mirrorStep', run: () => Features.mirrorStep([it.id]) }] : []),
          ...(topIdx >= 0 ? [{ icon: 'moveStep', label: T('common.moveStep'), help: 'moveStep', run: () => Features.transform([it.id]) }, { icon: 'scaleBody', label: T('common.scaleStep'), help: 'scaleBody', run: () => Features.scale([it.id]) }] : []),
          ...(!((it.kind === 'transform' && !(it.p && it.p.copy)) || it.kind === 'scale' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new'))) ? [{ icon: 'patternRect', label: T('ctx.patRect'), id: 'tm-pat-rect', help: 'patternRect', run: () => Features.pattern('rect', [it.id]) }, { icon: 'patternCirc', label: T('ctx.patCirc'), id: 'tm-pat-circ', help: 'patternCirc', run: () => Features.pattern('circ', [it.id]) }] : []),
          ...(topSelNow.length >= 2 && !App.ctx ? [{ icon: 'folder', label: T('menu.tree.toFolder'), id: 'tm-folder', help: 'treeFolder', run: () => Actions.createFolder(topSelNow) }] : []),
          ...(inFld ? [{ icon: 'ungroup', label: T('menu.tree.fromFolder'), id: 'tm-unfolder', run: () => Actions.removeFromFolder([it.id]) }] : []),
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('common.rename'), T('common.name'), Model.label(it), T('common.rename')); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); } },
          ...(ownIdx >= 0 ? [{ icon: 'suppress', label: it.suppressed ? T('common.unsuppress') : T('common.suppress'), run: () => Timeline.toggleSuppress(it.id) }] : []),
          '-', { icon: 'trash', label: T('common.delete'), run: () => Actions.remove([it.id]) },
        ]);
      });
      row.addEventListener('dblclick', async (e) => { e.stopPropagation(); const n = await UI.prompt('Umbenennen', 'Name', Model.label(it), 'Umbenennen'); if (n && n.trim()) App.change('Umbenannt', (doc) => { Model.find(doc, it.id).item.name = n.trim(); }); });
      // Ziehen im Verlauf: umsortieren oder in eine Gruppe legen
      row.addEventListener('dragstart', (e) => {
        dragInfo = { type: 'item', id: it.id };
        row.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.id); } catch (_) {} }
      });
      row.addEventListener('dragend', () => { dragInfo = null; clearDropClasses(); });
      row.addEventListener('dragover', (e) => {
        if (!dragInfo) return;
        const srcIds = dragInfo.type === 'folder' ? dragInfo.ids : [dragInfo.id];
        if (srcIds.includes(it.id)) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = dragInfo.type === 'item' && it.kind === 'group' && y > 0.3 && y < 0.7 ? 'into' : (y < 0.5 ? 'before' : 'after');
        let dst = it.id;
        if (dragInfo.type === 'folder' && topIdx >= 0) {
          const otherFld = itemFolder.get(it.id);
          if (otherFld) dst = mode === 'before' ? otherFld.ids[0] : otherFld.ids[otherFld.ids.length - 1];
        }
        const chk = Model.validateMove(App.doc, srcIds, dst, mode, { boxOf: Actions.worldBox });
        row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad');
        row.classList.add(mode === 'into' ? 'drop-into' : mode === 'before' ? 'drop-before' : 'drop-after');
        if (!chk.ok) row.classList.add('drop-bad');
        row.title = chk.ok ? '' : (chk.reason || '');
      });
      row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad'); row.removeAttribute('title'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = row.classList.contains('drop-into') ? 'into' : row.classList.contains('drop-before') ? 'before' : row.classList.contains('drop-after') ? 'after' : (dragInfo && dragInfo.type === 'item' && it.kind === 'group' && y > 0.3 && y < 0.7 ? 'into' : y < 0.5 ? 'before' : 'after');
        const src = dragInfo;
        clearDropClasses();
        dragInfo = null;
        if (!src) {
          const raw = e.dataTransfer && e.dataTransfer.getData('text/plain');
          if (raw) Actions.reorder([raw], it.id, mode);
          return;
        }
        let dst = it.id;
        if (src.type === 'folder' && topIdx >= 0) {
          const otherFld = itemFolder.get(it.id);
          if (otherFld) dst = mode === 'before' ? otherFld.ids[0] : otherFld.ids[otherFld.ids.length - 1];
        }
        Actions.reorder(src.type === 'folder' ? src.ids : [src.id], dst, mode, src.type === 'folder' ? { folderId: src.id } : {});
      });
      li.append(row);
      const bl = renderBodiesList(it);
      if (bl) li.append(bl);
      if (expanded.has(it.id) || (show && it.kind === 'group')) {
        const errs = App.errorsFor(it.id);
        for (const fin of it.finishes || []) {
          const ferr = errs.find((x) => x.finishId === fin.id);
          const isRef = !!(ferr && RefFix.isRefError(ferr));
          const fr = h('div', { class: 'finish-row' + (isRef ? ' warn' : ferr ? ' bad' : ''), title: ferr ? ferr.message : '' });
          fr.innerHTML = icon(fin.type === 'chamfer' ? 'chamfer' : fin.type === 'shell' ? 'shell' : 'fillet');
          if (fin.type === 'shell') fr.append(h('span', null, 'Wandstärke ' + Units.fmtLenU(Model.num(fin.r, V, 2), 2)));
          else if (fin.type === 'draft') fr.append(h('span', null, 'Entformungsschräge ' + fmt(Model.num(fin.r, V, 3), 1) + '°'));
          else fr.append(h('span', null, (fin.type === 'chamfer' ? 'Fase ' : 'Rundung ') + Units.fmtLenU(Model.num(fin.r, V, 1), 2) + (typeof fin.edges === 'string' ? ' · ' + ({ all: 'alle Kanten', top: 'oben', bottom: 'unten', vertical: 'senkrecht', horizontal: 'waagerecht' }[fin.edges] || '') : ' · ' + (fin.edges || []).length + ' Kante' + ((fin.edges || []).length === 1 ? '' : 'n'))));
          if (isRef) {
            const iss = refIssues.find((x) => x.finishId === fin.id);
            if (iss) {
              const fb = h('button', { type: 'button', class: 'fin-fix-btn', 'data-help': 'refFix' }, 'Neu wählen');
              fb.onclick = (e) => { e.stopPropagation(); RefFix.start(iss); };
              fr.append(fb);
            }
          }
          fr.onclick = () => App.select([it.id]);
          li.append(fr);
        }
        if (it.kind === 'group') { const cu = h('ul', { role: 'group' }); rec(it.children || [], cu); li.append(cu); }
      }
      return li;
    };
    const renderFolderLi = (fld, fItems) => {
      const li = h('li', { role: 'treeitem', dataset: { folderLi: fld.id } });
      const allSel = fItems.length > 0 && fItems.every((x) => selSet.has(x.id));
      const row = h('div', { class: 'node folder-node' + (allSel ? ' sel' : ''), draggable: 'true', dataset: { folderId: fld.id } });
      const tw = h('button', { type: 'button', class: 'tw' + (!fld.collapsed ? ' open' : ''), 'aria-label': fld.collapsed ? T('menu.tree.expandFolder') : T('menu.tree.collapseFolder'), 'aria-expanded': String(!fld.collapsed), dataset: { folderToggle: fld.id } });
      tw.innerHTML = icon('chevR');
      tw.onclick = (e) => { e.stopPropagation(); Actions.toggleFolder(fld.id); };
      const sw = h('span', { class: 'swatch folder-ic' }); sw.innerHTML = icon('folder');
      const nm = h('span', { class: 'nm', title: fld.name }, fld.name);
      const sub = h('span', { class: 'sub mono' }, `${fItems.length} ${fItems.length === 1 ? 'Schritt' : 'Schritte'}`);
      const acts = h('span', { class: 'acts' });
      const un = h('button', { type: 'button', 'aria-label': T('menu.tree.dissolveFolder'), 'data-tip': T('menu.tree.dissolveFolder') });
      un.innerHTML = icon('ungroup');
      un.onclick = (e) => { e.stopPropagation(); Actions.ungroupFolder(fld.id); };
      acts.append(un);
      row.append(tw, sw, nm, sub, acts);
      row.addEventListener('click', () => { App.select(fItems.map((x) => x.id)); });
      row.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const n = await UI.prompt('Ordner umbenennen', T('common.name'), fld.name, T('common.rename'));
        if (n && n.trim()) Actions.renameFolder(fld.id, n);
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const allHidden = fItems.every((x) => x.hidden);
        const allSupp = fItems.every((x) => x.suppressed);
        UI.menu(row, [
          { icon: 'chevR', label: fld.collapsed ? T('menu.tree.expandFolder') : T('menu.tree.collapseFolder'), run: () => Actions.toggleFolder(fld.id) },
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt('Ordner umbenennen', T('common.name'), fld.name, T('common.rename')); if (n && n.trim()) Actions.renameFolder(fld.id, n); } },
          { icon: 'pointer', label: T('menu.tree.selectFolder'), run: () => App.select(fItems.map((x) => x.id)) },
          { icon: allHidden ? 'eye' : 'eyeOff', label: allHidden ? 'Alle einblenden' : 'Alle ausblenden', run: () => App.change(allHidden ? 'Eingeblendet' : 'Ausgeblendet', (doc) => { for (const x of fItems) { const f = Model.find(doc, x.id); if (f) f.item.hidden = !allHidden; } }) },
          { icon: 'suppress', label: allSupp ? 'Alle aktivieren' : 'Alle unterdrücken', run: () => App.change(allSupp ? 'Aktiviert' : 'Unterdrückt', (doc) => { for (const x of fItems) { const f = Model.find(doc, x.id); if (f) f.item.suppressed = !allSupp; } }) },
          '-',
          { icon: 'ungroup', label: T('menu.tree.dissolveFolder'), run: () => Actions.ungroupFolder(fld.id) },
        ]);
      });
      row.addEventListener('dragstart', (e) => {
        dragInfo = { type: 'folder', id: fld.id, ids: fItems.map((x) => x.id) };
        row.classList.add('dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'folder:' + fld.id); } catch (_) {} }
      });
      row.addEventListener('dragend', () => { dragInfo = null; clearDropClasses(); });
      row.addEventListener('dragover', (e) => {
        if (!dragInfo) return;
        if (dragInfo.type === 'folder' && dragInfo.id === fld.id) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = dragInfo.type === 'item' && y > 0.25 && y < 0.75 ? 'into-folder' : (y < 0.5 ? 'before' : 'after');
        const srcIds = dragInfo.type === 'folder' ? dragInfo.ids : [dragInfo.id];
        const dst = mode === 'into-folder' ? fld.id : (mode === 'before' ? fItems[0].id : fItems[fItems.length - 1].id);
        const chk = Model.validateMove(App.doc, srcIds, dst, mode, { boxOf: Actions.worldBox });
        row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad');
        row.classList.add(mode === 'into-folder' ? 'drop-into' : mode === 'before' ? 'drop-before' : 'drop-after');
        if (!chk.ok) row.classList.add('drop-bad');
        row.title = chk.ok ? '' : (chk.reason || '');
      });
      row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-bad'); row.removeAttribute('title'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / Math.max(1, r.height);
        const mode = row.classList.contains('drop-into') ? 'into-folder' : row.classList.contains('drop-before') ? 'before' : row.classList.contains('drop-after') ? 'after' : (dragInfo && dragInfo.type === 'item' && y > 0.25 && y < 0.75 ? 'into-folder' : y < 0.5 ? 'before' : 'after');
        const src = dragInfo;
        clearDropClasses();
        dragInfo = null;
        if (!src) return;
        const srcIds = src.type === 'folder' ? src.ids : [src.id];
        const dst = mode === 'into-folder' ? fld.id : (mode === 'before' ? fItems[0].id : fItems[fItems.length - 1].id);
        Actions.reorder(srcIds, dst, mode, src.type === 'folder' ? { folderId: src.id, outsideFolder: true } : { outsideFolder: mode !== 'into-folder' });
      });
      li.append(row);
      if (!fld.collapsed || show) {
        const cu = h('ul', { role: 'group', class: 'folder-list' });
        for (const fit of fItems) {
          if (show && !show.has(fit.id)) continue;
          cu.append(renderItemLi(fit));
        }
        li.append(cu);
      }
      return li;
    };
    const renderedFolders = new Set();
    const rec = (list, parentUl) => {
      for (const it of list) {
        if (list === items && itemFolder.has(it.id)) {
          const fld = itemFolder.get(it.id);
          if (renderedFolders.has(fld.id)) continue;
          renderedFolders.add(fld.id);
          const fItems = (fld.ids || []).map((id) => items.find((x) => x.id === id)).filter(Boolean);
          if (fItems.length) {
            if (show && !fItems.some((x) => show.has(x.id))) continue;
            parentUl.append(renderFolderLi(fld, fItems));
            continue;
          }
        }
        if (show && !show.has(it.id)) continue;
        parentUl.append(renderItemLi(it));
      }
    };
    rec(items, ul);
    body.append(ul);
    const ds = Datums.treeSection(); if (ds) body.append(ds);
    const as = Datums.axisTreeSection(); if (as) body.append(as);
    const ps = Datums.pointTreeSection(); if (ps) body.append(ps);
    const cs = Datums.csysTreeSection(); if (cs) body.append(cs);
    const ms = Measure.treeSection(); if (ms) body.append(ms);
  }
  function moveInTree(srcId, dstId, mode) {
    return Actions.reorder(srcId, dstId, mode);
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
    // Welche Schritte brauchen beim Rechnen am längsten? (BE-26)
    const slow = App.doc.items.map((it) => ({ it, t: App.timeOf(it.id) })).filter((x) => x.t && x.t.ms >= 1).sort((a, b) => b.t.ms - a.t.ms).slice(0, 5);
    if (slow.length) {
      const sec = h('details', { class: 'section slow-sec', id: 'slow-steps', 'data-help': 'slowSteps' }, h('summary', { class: 'section-h' }, 'Rechenzeit je Schritt'));
      const fmtMs = (ms) => (ms >= 1000 ? `${fmt(ms / 1000, 1)} s` : `${Math.round(ms)} ms`);
      for (const x of slow) { const r = h('div', { class: 'mini-row dep-row' }, h('span', { class: 'grow' }, Model.label(x.it)), h('b', { class: 'mono' }, fmtMs(x.t.ms))); r.style.cursor = 'pointer'; r.onclick = () => App.select([x.it.id]); sec.append(r); }
      sec.append(h('div', { class: 'hint-box', html: 'Gemessen beim letzten echten Neurechnen. Was gerade nicht geändert wurde, kommt aus dem Speicher und kostet fast nichts. Langsam sind meist Rundungen an vielen Kanten, Gewinde und Muster mit vielen Kopien.' }));
      if (slow[0].t.ms > 1500) sec.open = true;
      body.append(sec);
    }
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
    if ((App.doc.params || []).length || (App.doc.items || []).length || (App.doc.variants || []).length) { const vs = Variants.section(); vs.classList.add('pro'); wrap.append(vs); }
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
    // Maße als Tabelle tauschen (KP-23): CSV mit Name;Wert, lesbar in Excel und Numbers
    const csvOut = h('button', { type: 'button', class: 'btn ghost', id: 'par-csv-out', 'data-help': 'paramsCsv' }); csvOut.innerHTML = icon('export') + 'Als CSV speichern';
    csvOut.disabled = !(App.doc.params || []).length; csvOut.onclick = () => Print.save(Print.safeName(App.doc.name) + ' – Maße.csv', new Blob(['\ufeff' + paramsCSV()], { type: 'text/csv' }));
    const csvIn = h('button', { type: 'button', class: 'btn ghost', id: 'par-csv-in', 'data-help': 'paramsCsv' }); csvIn.innerHTML = icon('folder') + 'CSV laden';
    csvIn.onclick = () => { const inp = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' } }); inp.onchange = async () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) importParamsCSV(await f.text()); }; document.body.append(inp); inp.click(); };
    wrap.append(h('div', { class: 'btn-row' }, csvOut, csvIn));
    body.append(wrap);
  }
  function paramsCSV() {
    const q = (s) => (/[;"\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    const { v } = Model.vars(App.doc);
    const rows = [['Name', 'Wert', 'Ergebnis']];
    for (const p of App.doc.params || []) rows.push([p.name, typeof p.expr === 'number' ? fmt(p.expr, 6) : p.expr, fmt(v[p.name], 6)]);
    return rows.map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
  }
  // CSV lesen: Name;Wert (auch mit Komma oder Tab getrennt); bekannte Namen werden geändert, neue angelegt
  function importParamsCSV(txt) {
    const lines = String(txt).replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { UI.toast('Die Datei ist leer.', { icon: 'info' }); return 0; }
    const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const cells = (l) => { const out = []; let cur = '', qq = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (qq) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') qq = false; else cur += c; } else if (c === '"') qq = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()); };
    let changed = 0, added = 0, bad = 0; const plan = [];
    for (const l of lines) {
      const [name, val] = cells(l);
      if (!name || /^name$/i.test(name)) continue;
      if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(name) || val == null || val === '') { bad++; continue; }
      const n = parseNum(val); plan.push([name, isNaN(n) ? val : n]);
    }
    if (!plan.length) { UI.toast('In der Datei habe ich keine Maße gefunden (Spalten: Name;Wert).', { icon: 'info' }); return 0; }
    App.change('Maße aus CSV', (doc) => {
      doc.params = doc.params || [];
      for (const [name, val] of plan) { const p = doc.params.find((x) => x.name === name); if (p) { if (String(p.expr) !== String(val)) { p.expr = val; changed++; } } else { doc.params.push({ id: uid('m'), name, expr: val }); added++; } }
    });
    UI.toast(`${changed} ${changed === 1 ? 'Maß' : 'Maße'} geändert, ${added} neu${bad ? `, ${bad} Zeilen übersprungen` : ''}.`, { icon: 'check' });
    return changed + added;
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
    Model.walk(doc.items, (it) => { for (const k in it.p || {}) { if ((it.kind === 'transform' && (k === 'target' || k === 'pivot')) || (it.kind === 'scale' && (k === 'target' || k === 'pivot' || k === 'uniform')) || (it.kind === 'thicken' && (k === 'target' || k === 'face' || k === 'dir' || k === 'mode')) || (it.kind === 'rib' && (k === 'target' || k === 'side' || k === 'dir')) || (it.kind === 'extrude' && (k === 'extent' || k === 'dir' || k === 'wallSide'))) continue; it.p[k] = fix(it.p[k]); } for (const k in it.t) it.t[k] = fix(it.t[k]); for (const f of it.finishes || []) f.r = fix(f.r); if (it.p && it.p.sketch) for (const d of it.p.sketch.dims || []) d.v = fix(d.v); });
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
      body.append(UI.numField({ id: 'gap-v', label: 'Lücke (jetzt ' + Units.fmtLenU(g0(), 2) + ')', value: g0(), onCommit: (v) => { const n = Model.num(v, Model.vars(App.doc).v, NaN); if (!isNaN(n)) { Actions.setGap(null, ax, n); UI.closePop(); } } }));
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
    if (!items.length && Datums.selected && Datums.find(Datums.selected)) { $('#right-title').textContent = 'Bezugsebene'; Datums.renderPanel(body); return; }
    if (!items.length && Datums.selectedAxis && Datums.findAxis(Datums.selectedAxis)) { $('#right-title').textContent = 'Bezugsachse'; Datums.renderAxisPanel(body); return; }
    if (!items.length && Datums.selectedPoint && Datums.findPoint(Datums.selectedPoint)) { $('#right-title').textContent = 'Bezugspunkt'; Datums.renderPointPanel(body); return; }
    if (!items.length && Datums.selectedCsys && Datums.findCsys(Datums.selectedCsys)) { $('#right-title').textContent = 'Koordinatensystem'; Datums.renderCsysPanel(body); return; }
    if (!items.length && Measure.selected && Measure.find(Measure.selected)) { $('#right-title').textContent = 'Messung'; Measure.renderPanel(body); return; }
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
    const unitF = UI.selectField({ id: 'proj-unit', label: 'Einheit', value: Units.key(), options: Units.OPTIONS, onChange: (v) => Units.set(v) });
    unitF.dataset.help = 'projectUnit';
    w.append(unitF);
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
    va.append(UI.selectField({ id: 'view-grid', label: 'Rasterweite', value: String(pv.grid), options: [['auto', 'Automatisch (folgt dem Zoom)'], ['0.01', Units.fmtLenU(0.01, 2)], ['0.1', Units.fmtLenU(0.1, 2)], ['1', Units.fmtLenU(1, 2)], ['10', Units.fmtLenU(10, 2)], ['100', Units.fmtLenU(100, 2)]], onChange: (val) => ViewPrefs.set({ grid: val === 'auto' ? 'auto' : parseFloat(val) }) }));
    const chk = (k, label) => { const l = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'view-' + k, checked: !!pv[k] }), label); l.querySelector('input').onchange = (e) => ViewPrefs.set({ [k]: e.target.checked }); return l; };
    va.append(UI.selectField({ id: 'view-quality', label: 'Darstellungsqualität', value: pv.quality, options: [['coarse', 'Grob'], ['normal', 'Normal'], ['fine', 'Fein'], ['ultra', 'Sehr fein']], onChange: (val) => ViewPrefs.set({ quality: val }) }));
    va.append(h('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } }, chk('adaptive', 'Darstellung anpassen (Zoom, Drehen)'), chk('gridOn', 'Raster zeigen'), chk('planes', 'Ursprungsebenen zeigen'), chk('axes', 'Achsen zeigen'), chk('notes', 'Notizen zeigen'), chk('ortho', 'Orthografisch (ohne Perspektive)')));
    w.append(va);
    const gr = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, 'Fangen beim Verschieben'));
    const f2 = h('div', { class: 'fields' });
    f2.append(UI.selectField({ id: 'grid', label: 'Schrittweite', value: App.doc.settings.grid, options: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10].map((v) => [v, Units.fmtLenU(v, 2)]), onChange: (v) => App.change('Raster geändert', (doc) => { doc.settings.grid = parseFloat(v); }) }));
    const snap = h('label', { class: 'check', style: { alignSelf: 'end', paddingBottom: '8px' } }, h('input', { type: 'checkbox', id: 'snap', checked: App.doc.settings.snap !== false }), 'Einrasten');
    snap.querySelector('input').onchange = (e) => App.change('Einrasten geändert', (doc) => { doc.settings.snap = e.target.checked; });
    const mag = h('label', { class: 'check', style: { paddingBottom: '4px' } }, h('input', { type: 'checkbox', id: 'magnet', checked: App.doc.settings.magnet !== false }), 'Magnetisch einrasten (Mitte, Mittellinien, Lochmitten, ganz oben auf Rundungen, bündig zu anderen Teilen) – Strg hält es kurz an');
    mag.querySelector('input').onchange = (e) => App.change('Magnet geändert', (doc) => { doc.settings.magnet = e.target.checked; });
    f2.append(snap); gr.append(f2, mag); w.append(gr);
    const st = Print.stats();
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Überblick'));
    info.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Objekte'), h('b', { class: 'mono' }, String(Model.countItems(App.doc)))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Größe gesamt'), h('b', { class: 'mono' }, st ? `${Units.fmtLen(st.x, 1)} × ${Units.fmtLen(st.y, 1)} × ${Units.fmtLen(st.z, 1)} ${Units.label()}` : '–'))));
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
    const bomB = h('button', { type: 'button', class: 'btn', id: 'proj-bom', 'data-help': 'bom' }); bomB.innerHTML = icon('list') + 'Stückliste'; bomB.onclick = () => Mass.bomDialog();
    ms.append(h('div', { class: 'btn-row', style: { marginTop: '8px' } }, bomB));
    Mass.measure().then((r) => {
      if (!r) { vRow.textContent = gRow.textContent = cRow.textContent = '–'; return; }
      vRow.textContent = Units.fmtVolU(r.volume, 3); gRow.textContent = Mass.gText(r.mass);
      cRow.textContent = r.com ? r.com.map((v) => Units.fmtLen(v, 1)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '') : '–';
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
    const topSel = [...new Set(found.map((f) => (Model.topOf(App.doc, f.item.id) || {}).id).filter(Boolean))];
    const d = h('button', { type: 'button', class: 'btn' }); d.innerHTML = icon('copy') + 'Duplizieren'; d.onclick = () => Actions.duplicate();
    const x = h('button', { type: 'button', class: 'btn danger' }); x.innerHTML = icon('trash') + 'Löschen'; x.onclick = () => Actions.remove();
    r1.append(g);
    if (topSel.length >= 2 && !App.ctx) {
      const fldB = h('button', { type: 'button', class: 'btn', id: 'btn-multi-folder', 'data-help': 'treeFolder' });
      fldB.innerHTML = icon('folder') + esc(T('menu.tree.toFolder'));
      fldB.onclick = () => Actions.createFolder(topSel);
      r1.append(fldB);
    }
    r1.append(d, x); w.append(r1);
    // zwei Teile: kleinster Abstand (nur verschiedene Hauptteile, nicht ein Teil mit seiner eigenen Gruppe)
    const tops = found.length === 2 ? found.map((f) => (Model.topOf(App.doc, f.item.id) || f.item).id) : null;
    if (tops && tops[0] !== tops[1]) {
      const ds = h('div', { class: 'section', id: 'min-dist', 'data-help': 'minDistance' }, h('div', { class: 'section-h' }, 'Kleinster Abstand'));
      const val = h('b', { class: 'mono', id: 'min-dist-val' }, '…'); ds.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, `${Model.label(found[0].item)} ↔ ${Model.label(found[1].item)}`), val));
      Measure.minDistance(tops).then((r) => { val.textContent = !r ? '–' : r.d < 1e-6 ? 'berühren sich' : Units.fmtLenU(r.d, 3); });
      w.append(ds);
    }
    const al = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Ausrichten'));
    const ar = h('div', { class: 'btn-row' });
    for (const [m, l] of [['left', 'Links'], ['cx', 'Mitte X'], ['right', 'Rechts'], ['front', 'Vorne'], ['cy', 'Mitte Y'], ['back', 'Hinten'], ['bottom', 'Unten'], ['top', 'Oben']]) {
      const b = h('button', { type: 'button', class: 'btn small' }, l); b.onclick = () => Actions.align(null, m); ar.append(b);
    }
    al.append(ar); w.append(al);
    w.append(colorSection((c) => App.change('Farbe geändert', (doc) => { for (const f of found) { const T = Model.find(doc, f.item.id).item; if (c) { T.color = c; T.colorSet = true; } else delete T.colorSet; } }), found[0].item.color, found.some((f) => f.item.colorSet)));
    body.append(w);
  }
  // Formschritt mit Modus: eigener Körper oder mit einem früheren Körper verrechnen (nur Teile ganz oben im Verlauf)
  function opSection(it) {
    const idx = App.doc.items.indexOf(it);
    const isPatOp = Features.isOp(it) && it.p.op === 'pattern' && !(it.children || []).some((c) => c.kind === 'rib');
    if (idx < 0 || (it.kind === 'group' && !isPatOp) || it.kind === 'transform' || it.kind === 'scale' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) || it.kind === 'rib' || it.kind === 'mirrorStep') return null;
    const targets = App.doc.items.slice(0, idx).filter((x) => x.role !== 'hole' && !x.suppressed && x.kind !== 'group' && x.kind !== 'rib' && x.kind !== 'mirrorStep' && !(x.kind === 'transform' && !(x.p && x.p.copy)) && x.kind !== 'scale' && !(x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) && !(x.op && x.op.target === it.id));
    if (!targets.length && !it.op) return null;
    const sec = h('div', { class: 'section', id: 'op-sec', 'data-help': 'bodyOp' }, h('div', { class: 'section-h' }, 'Körper'));
    const type = it.op ? it.op.type : 'new';
    const tgt = it.op ? it.op.target : (targets[targets.length - 1] || {}).id;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({ id: 'op-type', label: 'Was passiert mit dem Teil?', value: type, options: [['new', 'Eigener Körper'], ['join', 'Vereinigen mit …'], ['cut', 'Abziehen von …'], ['common', 'Schnittmenge mit …']], onChange: (v) => Actions.setOp(it.id, v === 'new' ? null : v, tgt) }));
    if (type !== 'new') fl.append(UI.selectField({ id: 'op-target', label: 'Zielkörper', value: tgt, options: targets.map((x) => [x.id, Model.label(x)]), onChange: (v) => Actions.setOp(it.id, type, v) }));
    sec.append(fl);
    const into = App.mergedInto(it.id);
    if (type !== 'new') sec.append(h('div', { class: 'hint-box' }, into ? `Das Teil steckt jetzt in „${Model.label(Model.find(App.doc, into).item)}“ – im Bild siehst du nur den fertigen Körper. Klick im Verlauf auf das Teil, um es weiter zu ändern.` : 'Das Ziel fehlt oder kommt später im Verlauf – das Teil bleibt vorerst ein eigener Körper.'));
    return sec;
  }
  function roleSwitch(role, onSet) {
    const s = h('div', { class: 'role-switch', role: 'group', 'aria-label': 'Körper oder Loch' });
    const a = h('button', { type: 'button', 'aria-pressed': role === 'solid' ? 'true' : 'false' }); a.innerHTML = icon('solid') + 'Körper';
    const b = h('button', { type: 'button', class: 'hole', 'aria-pressed': role === 'hole' ? 'true' : 'false' }); b.innerHTML = icon('hole') + 'Loch';
    a.onclick = () => onSet('solid'); b.onclick = () => onSet('hole');
    s.append(a, b); return s;
  }
  // Farbe: zehn feste Töne oder jede beliebige Farbe. Metall, Kohlefaser, Holz und Glas zeigen im Studio-Look
  // die Farbe ihres Werkstoffs, bis man selbst eine Farbe wählt („Farbe vom Werkstoff“ nimmt das zurück).
  function colorSection(onPick, cur, set, it) {
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Farbe'));
    const row = h('div', { class: 'colors' });
    for (const c of COLORS) { const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': c.c === cur ? 'true' : 'false', style: { background: c.c } }); b.onclick = () => onPick(c.c); row.append(b); }
    const free = h('input', { type: 'color', id: 'item-color', value: /^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#2f9e91', 'aria-label': 'Eigene Farbe', 'data-tip': 'Eigene Farbe' });
    free.addEventListener('change', () => onPick(free.value.toLowerCase()));
    row.append(h('label', { class: 'color-free', 'data-tip': 'Jede Farbe' }, free));
    sec.append(row);
    const L = it ? Viewer.lookOf(it.mat || (App.doc.settings && App.doc.settings.material)) : null;
    if (L && L.nat) {
      if (set) { const b = h('button', { type: 'button', class: 'btn ghost', id: 'item-color-mat' }); b.innerHTML = icon('undo') + 'Farbe vom Werkstoff'; b.onclick = () => onPick(null); sec.append(h('div', { class: 'btn-row' }, b)); }
      else sec.append(h('div', { class: 'hint-box' }, `Im Studio-Look zeigt das Teil die Farbe seines Werkstoffs (${it.mat || App.doc.settings.material}). Eine Farbe hier wählen überschreibt sie.`));
    }
    return sec;
  }
  function edgeRuleMenu(id, anchor) {
    UI.menu(anchor, [
      { icon: 'pointer', label: T('menu.edge.convex'), id: 'er-convex', help: 'edgeRules', run: () => Select.edgesByRule(id, 'convex') },
      { icon: 'pointer', label: T('menu.edge.concave'), id: 'er-concave', help: 'edgeRules', run: () => Select.edgesByRule(id, 'concave') },
      { icon: 'pointer', label: T('menu.edge.all'), id: 'er-all', help: 'edgeRules', run: () => Select.edgesByRule(id, 'all') },
    ]);
  }
  // Alle Kanten einer Fläche: wählen, abrunden oder abschrägen (KP-15)
  function faceEdgeList(face) { return Viewer.faceEdges(face.id, face.idx).map((edgeIdx) => ({ id: face.id, edgeIdx })); }
  function faceEdgeMenu(face, anchor) {
    const list = faceEdgeList(face);
    if (!list.length) { UI.toast(T('menu.edge.faceNone'), { icon: 'info' }); return; }
    UI.menu(anchor, [
      { icon: 'pointer', label: T('menu.edge.faceSelect', { n: list.length }), id: 'fe-select', help: 'faceEdges', run: () => App.select([face.id], { edges: list }) },
      { icon: 'fillet', label: T('menu.edge.faceFillet', { v: Units.fmtLenU(1, 2) }), id: 'fe-fillet', help: 'faceEdges', run: () => Actions.addFinish('fillet', 1, list) },
      { icon: 'chamfer', label: T('menu.edge.faceChamfer', { v: Units.fmtLenU(1, 2) }), id: 'fe-chamfer', help: 'faceEdges', run: () => Actions.addFinish('chamfer', 1, list) },
    ]);
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
    // Notiz am Schritt (KP-55): eigener Text, steht auch in der Zeitleiste
    {
      const nd = h('details', { class: 'section note-sec', id: 'note-sec', 'data-help': 'stepNote' }, h('summary', { class: 'section-h' }, it.note ? 'Notiz' : 'Notiz hinzufügen'));
      const ta = h('textarea', { id: 'item-note', rows: 3, placeholder: 'Warum ist das so? Zum Beispiel: „Wand 2 mm, weil der Drucker sonst bricht“', 'aria-label': 'Notiz zu diesem Schritt' });
      ta.value = it.note || '';
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.addEventListener('change', () => { const v = ta.value.trim(); if (v === (it.note || '')) return; App.change(v ? 'Notiz geändert' : 'Notiz entfernt', (doc) => { const x = Model.find(doc, it.id).item; if (v) x.note = v; else delete x.note; }); });
      nd.append(ta);
      if (it.note) nd.open = true;
      w.append(nd);
    }
    const rightIssues = RefFix.issuesOf(it.id);
    const shownKeys = new Set();
    for (const e of App.errorsFor(it.id)) {
      if (RefFix.isRefError(e)) {
        const iss = e.finishId
          ? rightIssues.find((x) => x.finishId === e.finishId)
          : rightIssues.find((x) => x.kind === 'extrude-toFace');
        if (iss) shownKeys.add(iss.key);
        const box = h('div', { class: 'warn-box', 'data-help': 'refFix' }, h('span', null, e.message));
        const brow = h('div', { class: 'btn-row' });
        if (iss) {
          const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-reffix': '1', 'data-help': 'refFix' });
          fb.innerHTML = icon('warn') + 'Neu wählen';
          fb.onclick = () => RefFix.start(iss);
          brow.append(fb);
        }
        if (e.finishId) {
          const fin = (it.finishes || []).find((x) => x.id === e.finishId);
          const rmLabel = fin && fin.type === 'chamfer' ? 'Fase entfernen' : fin && fin.type === 'shell' ? 'Aushöhlen entfernen' : 'Rundung entfernen';
          const b = h('button', { type: 'button', class: 'btn small' }, rmLabel);
          b.onclick = () => Actions.removeFinish(it.id, e.finishId);
          brow.append(b);
        }
        if (brow.children.length) box.append(brow);
        w.append(box);
        continue;
      }
      const box = h('div', { class: 'err-box' }, h('span', null, e.message));
      if (e.code === 'toobig' && e.max > 0) { const b = h('button', { type: 'button', class: 'btn small' }, `Auf ${Units.fmtLenU(e.max, 1)} setzen`); b.onclick = () => Actions.setFinish(it.id, e.finishId, { r: e.max }); box.append(h('div', null, b)); }
      w.append(box);
    }
    for (const iss of rightIssues) {
      if (shownKeys.has(iss.key)) continue;
      const box = h('div', { class: 'warn-box', 'data-help': 'refFix' }, h('span', null, iss.message));
      const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-reffix': '1', 'data-help': 'refFix' });
      fb.innerHTML = icon('warn') + 'Neu wählen';
      fb.onclick = () => RefFix.start(iss);
      box.append(h('div', { class: 'btn-row' }, fb));
      w.append(box);
    }
    if (it.link) {
      const src = Model.find(App.doc, it.link);
      const ls = h('div', { class: 'section', id: 'link-sec', 'data-help': 'linkedCopy' }, h('div', { class: 'section-h' }, 'Verknüpfte Kopie'));
      ls.append(h('div', { class: src && !it.linkLost ? 'hint-box' : 'err-box' }, src && !it.linkLost ? `Diese Kopie folgt „${Model.label(src.item)}“: Maße und Kanten änderst du am Original, Lage und Farbe hier.` : 'Das Original gibt es nicht mehr – die Kopie behält ihre letzte Form.'));
      const row = h('div', { class: 'btn-row' });
      if (src) { const b = h('button', { type: 'button', class: 'btn', id: 'link-src' }); b.innerHTML = icon('pointer') + 'Original wählen'; b.onclick = () => App.select([it.link]); row.append(b); }
      const u = h('button', { type: 'button', class: 'btn ghost', id: 'link-off' }); u.innerHTML = icon('copy') + 'Verknüpfung lösen'; u.onclick = () => Actions.unlink(it.id); row.append(u);
      ls.append(row); w.append(ls);
    }
    // Eltern und Kinder: worauf dieses Teil aufbaut und was von ihm abhängt (KP-11)
    if (App.doc.items.includes(it)) {
      const deps = Model.dependencies(App.doc), up = deps.filter((x) => x.from === it.id), down = deps.filter((x) => x.to === it.id);
      if (up.length || down.length) {
        const ds = h('details', { class: 'section deps', id: 'deps', 'data-help': 'dependencies' }, h('summary', { class: 'section-h' }, `Bezüge (${up.length + down.length})`));
        const nm = (id) => { const f = Model.find(App.doc, id); return f ? Model.label(f.item) : '–'; };
        const line = (txt, id) => { const r = h('div', { class: 'mini-row dep-row' }, h('span', { class: 'grow' }, txt)); if (id && Model.find(App.doc, id)) { r.style.cursor = 'pointer'; r.onclick = () => App.select([id]); } return r; };
        for (const x of up) ds.append(line(`${x.what} „${nm(x.to)}“`, x.to));
        const back = { 'abgezogen von': 'wird hiervon abgezogen', 'vereinigt mit': 'ist hiermit vereinigt', 'Schnittmenge mit': 'bildet hiermit die Schnittmenge', 'verrechnet mit': 'ist hiermit verrechnet', 'versetzt': 'versetzt diesen Körper', 'versetzte Kopie von': 'ist eine versetzte Kopie hiervon', 'skaliert': 'skaliert diesen Körper', 'dickt Fläche auf von': 'dickt eine Fläche hiervon auf', 'Platte von Fläche aus': 'ist eine aufgedickte Platte hiervon', 'Rippe an': 'verstärkt diesen Körper als Rippe', 'spiegelt Schritt': 'wird hiervon gespiegelt', 'spiegelt an Fläche von': 'spiegelt an einer Fläche hiervon', 'verknüpfte Kopie von': 'ist eine verknüpfte Kopie hiervon', 'Skizze übernimmt Kante von': 'übernimmt Kanten hiervon', 'Rohr hängt an': 'hat Rohrpunkte hieran', 'hochgezogen bis Fläche von': 'wird bis zu dieser Fläche hochgezogen', 'dreht bis Fläche von': 'dreht bis zu einer Fläche hiervon' };
        for (const x of down) ds.append(line(x.datum ? `Bezugsebene „${x.datum}“ hängt hieran` : x.axis ? `Bezugsachse „${x.axis}“ hängt hieran` : x.point ? `Bezugspunkt „${x.point}“ hängt hieran` : x.csys ? `Koordinatensystem „${x.csys}“ hängt hieran` : `„${nm(x.from)}“ ${back[x.what] || 'hängt hieran'}`, x.datum || x.axis || x.point || x.csys ? null : x.from));
        if (down.length) ds.open = true;
        w.append(ds);
      }
    }
    const copies = []; Model.walk(App.doc.items, (x) => { if (x.link === it.id) copies.push(x); });
    if (copies.length) w.append(h('div', { class: 'hint-box', id: 'link-count' }, `${copies.length} verknüpfte ${copies.length === 1 ? 'Kopie folgt' : 'Kopien folgen'} diesem Teil.`));
    const isMoveOnly = (it.kind === 'transform' && !(it.p && it.p.copy)) || it.kind === 'scale' || (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) || it.kind === 'mirrorStep';
    const isMergedStep = isMoveOnly || it.kind === 'rib';
    if (!isMergedStep) w.append(roleSwitch(it.role, (r) => Actions.setRole([it.id], r)));
    const opSec = opSection(it); if (opSec) w.append(opSec);
    // Maße
    const three = !!(KINDS[it.kind] && KINDS[it.kind].params.length === 3);
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, three ? `Maße (${Units.label()})` : 'Maße'));
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
          if (q.type === 'select') fl.append(UI.selectField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k], options: q.options, onChange: (v) => setP(q.k, q.k === 'tipAngle' ? Number(v) : v) }));
          else fl.append(UI.numField({ id: 'lp-' + q.k, label: q.label, value: it.p[q.k] ?? '', unit: q.unit ?? 'mm', int: q.int, placeholder: q.auto ? 'passend' : '', onCommit: (v) => setP(q.k, v) }));
        }
        sec.append(fl);
        if (def.lib === 'blindHole') {
          const d = Model.num(it.p.d, V, 5), dep = Model.num(it.p.depth, V, 10), ang = Number(it.p.tipAngle ?? 118), tipH = blindTipHeight(d, ang);
          const tipTxt = ang >= 179.5 ? `Flacher Boden, Tiefe ${Units.fmtLenU(dep, 2)}.` : `Bohrspitze (${ang}°): +${Units.fmtLenU(tipH, 2)} → Gesamttiefe <b>${Units.fmtLenU(dep + tipH, 2)}</b>.`;
          sec.append(h('div', { class: 'hint-box', html: `${tipTxt} Setz es mit <b>Bohrung</b> direkt auf eine Fläche, dann richtet es sich von selbst aus.` }));
        } else if (def.lib === 'fitHole') {
          const d = Model.num(it.p.d, V, 6), info = h7Info(d);
          const tolTxt = info.um != null ? `<b>Passung Ø ${Units.fmtLenU(d, 2)} H7 (ISO 286):</b> ${info.esText} / 0 mm (${info.rangeText}). Im 3D-Modell wird genau das Nennmaß gebohrt – beim Fertigen auf Maß reiben.` : `<b>Passung Ø ${Units.fmtLenU(d, 2)} H7:</b> Im 3D-Modell wird genau das Nennmaß gebohrt.`;
          sec.append(h('div', { id: 'p-fit-hint', class: 'hint-box', html: tolTxt }));
        } else if (def.lib === 'centerHole') {
          const m = centerHoleMetrics(it.p.size);
          sec.append(h('div', { class: 'hint-box', html: `<b>DIN 332 Form A (${it.p.size || 'A2.5'}):</b> Führungs-Ø ${Units.fmtLenU(m.d1, 2)} · 60°-Kegel Ø ${Units.fmtLenU(m.d2, 2)} · Gesamttiefe ${Units.fmtLenU(m.totalDepth, 2)}.` }));
        } else if (def.lib === 'screwHole') {
          const te = threadEntry(it.p.size);
          let screwTxt = '';
          if (te) {
            const dia = threadHoleDia(te, it.p.fit);
            const art = it.p.fit === 'tap' ? 'Kernloch' : 'Durchgang';
            let headTxt = '';
            if (it.p.fit !== 'tap') {
              if (it.p.head === 'countersunk' && te.senkung_senk_d_mm) headTxt = ` · Senkkopf Ø ${Units.fmtLenU(te.senkung_senk_d_mm, 2)} (${te.senkung_winkel_grad || 90}°)`;
              else if (it.p.head === 'counterbore' && te.senkung_zyl_d_mm) headTxt = ` · ${te.normId === 'pipe_g' ? 'Flachsenkung' : 'Zylindersenkung'} Ø ${Units.fmtLenU(te.senkung_zyl_d_mm, 2)} × ${Units.fmtLenU(te.senkung_zyl_t_mm, 2)}`;
            }
            screwTxt = `<b>${esc(te.id)}</b> (${esc(te.normName)}): ${art} Ø <b>${Units.fmtLenU(dia, 2)}</b>${headTxt}<br><span style="color:var(--muted)">Norm: ${esc(te.quelle)}</span><br>`;
          }
          sec.append(h('div', { id: 'p-screw-hint', class: 'hint-box', html: `${screwTxt}Das Loch zeigt mit der flachen Seite nach oben. Setz es mit <b>Loch hier</b> direkt auf eine Fläche, dann richtet es sich von selbst aus.` }));
        } else if (def.lib === 'insert' || def.lib === 'nutTrap') sec.append(h('div', { class: 'hint-box', html: 'Das Loch zeigt mit der flachen Seite nach oben. Setz es mit <b>Loch hier</b> direkt auf eine Fläche, dann richtet es sich von selbst aus.' }));
        w.append(sec);
      }
    } else if (it.kind === 'extrude' || it.kind === 'revolve') {
      const fl = h('div', { class: 'fields' });
      if (it.kind === 'extrude') {
        const cuts = it.role === 'hole' || (it.op && it.op.type === 'cut');
        const ext = it.p.extent === 'toNext' || it.p.extent === 'toFace' ? it.p.extent : 'dist';
        const extField = UI.selectField({
          id: 'p-extent',
          label: 'Bis',
          value: ext,
          options: [['dist', 'Feste Höhe'], ['toNext', 'Bis zur nächsten Fläche'], ['toFace', 'Bis zu gewählter Fläche']],
          onChange: (v) => {
            let pickAfter = false;
            App.change(v === 'dist' ? 'Feste Höhe' : v === 'toNext' ? 'Bis zur nächsten Fläche' : 'Bis zu gewählter Fläche', (doc) => {
              const T = Model.find(doc, it.id).item;
              if (v === 'dist') {
                const rd = App.resolvedDist(it.id);
                if (rd != null) T.p.dist = round(rd, 4);
                delete T.p.extent; delete T.p.toFace;
              } else {
                T.p.extent = v;
                delete T.p.thru;
                if (T.p.dir === 'both') T.p.dir = 'normal';
                if (v === 'toNext') delete T.p.toFace;
                else if (!T.p.toFace) pickAfter = true;
              }
            });
            if (pickAfter) Features.pickExtrudeFace(it.id);
          },
        });
        extField.setAttribute('data-help', 'extrudeToFace');
        fl.append(extField);
        if (ext === 'dist' && !it.p.thru) fl.append(UI.numField({ id: 'p-dist', label: it.p.dir === 'two' ? 'Höhe Seite 1' : 'Höhe', value: it.p.dist, onCommit: (v) => setP('dist', v) }));
        const dirOpts = ext === 'dist'
          ? [['normal', 'Nach außen'], ['reverse', 'Nach innen'], ['both', 'Beidseitig gleich'], ['two', 'Beidseitig verschieden']]
          : [['normal', 'Nach außen'], ['reverse', 'Nach innen'], ['two', 'Beidseitig (Seite 2 fest)']];
        fl.append(UI.selectField({ id: 'p-dir', label: 'Richtung', value: it.p.dir || 'normal', options: dirOpts, onChange: (v) => setP('dir', v) }));
        if (it.p.dir === 'two' && !it.p.thru) fl.append(UI.numField({ id: 'p-dist2', label: 'Höhe Seite 2', value: it.p.dist2 ?? it.p.dist, onCommit: (v) => setP('dist2', v) }));
        if (ext === 'dist' && (cuts || it.p.thru)) { const l = h('label', { class: 'check', 'data-help': 'thruAll' }, h('input', { type: 'checkbox', id: 'p-thru', checked: !!it.p.thru }), 'Durch alles'); l.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Durch alles' : 'Feste Tiefe', (doc) => { const T = Model.find(doc, it.id).item; if (e.target.checked) T.p.thru = true; else delete T.p.thru; }); fl.append(l); }
        if (ext !== 'dist') {
          const rd = App.resolvedDist(it.id);
          const info = App.resolvedOf(it.id);
          const tgtIt = info && info.targetId ? Model.find(App.doc, info.targetId) : null;
          const tgtName = ext === 'toFace' && it.p.toFace && it.p.toFace.label ? it.p.toFace.label : tgtIt ? Model.label(tgtIt.item) : null;
          const txt = ext === 'toFace' && !it.p.toFace
            ? 'Noch keine Zielfläche gewählt – klick „Fläche im Bild wählen“.'
            : rd != null
              ? `Aktuelle Höhe: ${Units.fmtLenU(rd, 2)}${tgtName ? ` (bis ${tgtName})` : ''}`
              : 'Wird bis zur Zielfläche berechnet …';
          fl.append(h('div', { class: 'hint-box', id: 'p-ext-info' }, txt));
          if (ext === 'toFace') {
            const pb = h('button', { type: 'button', class: 'btn', id: 'p-pick-face' });
            pb.innerHTML = icon('pointer') + (it.p.toFace ? 'Andere Fläche wählen' : 'Fläche im Bild wählen');
            pb.onclick = () => Features.pickExtrudeFace(it.id);
            fl.append(pb);
          }
        }
        const hasRegs = SK.regions(it.p.sketch ? Solver.cached(it.p.sketch, Model.vars(App.doc).v).ents : []).length > 0;
        const tl = h('label', { class: 'check', 'data-help': 'thinWall' }, h('input', { type: 'checkbox', id: 'p-thin', checked: !!it.p.thin, disabled: !!it.p.thin && !hasRegs }), 'Dünne Wand');
        tl.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Dünne Wand an' : 'Dünne Wand aus', (doc) => {
          const T = Model.find(doc, it.id).item;
          if (e.target.checked) { T.p.thin = true; if (T.p.wall == null) T.p.wall = 2; if (!T.p.wallSide) T.p.wallSide = 'center'; }
          else delete T.p.thin;
        });
        fl.append(tl);
        if (it.p.thin) {
          fl.append(UI.numField({ id: 'p-wall', label: 'Wandstärke', value: it.p.wall ?? 2, min: 0.1, onCommit: (v) => setP('wall', v) }));
          fl.append(UI.selectField({ id: 'p-wall-side', label: 'Wand-Lage', value: it.p.wallSide || 'center', options: [['center', 'Mittig'], ['in', 'Nach innen'], ['out', 'Nach außen']], onChange: (v) => setP('wallSide', v) }));
        }
      } else {
        const dir = it.p.dir || 'normal';
        const dirSel = UI.selectField({
          id: 'p-rev-dir', label: 'Richtung', value: dir,
          options: [['normal', 'Eine Richtung'], ['reverse', 'Umgekehrt'], ['both', 'Symmetrisch (beidseitig gleich)'], ['two', 'Beidseitig verschieden'], ['toFace', 'Bis zu gewählter Fläche']],
          onChange: (v) => {
            App.change('Drehrichtung geändert', (doc) => {
              const T = Model.find(doc, it.id).item;
              T.p.dir = v;
              if (v === 'two' && T.p.angle2 == null) {
                const cur = Model.num(T.p.angle, Model.vars(doc).v, 360);
                if (cur >= 359) { T.p.angle = 90; T.p.angle2 = 90; }
                else T.p.angle2 = T.p.angle;
              }
            });
            if (v === 'toFace' && !it.p.toFace) Features.pickRevolveFace(it.id);
          },
        });
        dirSel.setAttribute('data-help', 'revolveOptions');
        fl.append(dirSel);
        if (dir !== 'toFace') {
          const angLbl = dir === 'both' ? 'Gesamtwinkel' : dir === 'two' ? 'Winkel Seite 1' : 'Winkel';
          const minA = dir === 'two' ? 0 : 0.1;
          fl.append(UI.numField({ id: 'p-angle', label: angLbl, value: it.p.angle, unit: '°', min: minA, onCommit: (v) => setP('angle', typeof v === 'number' ? clamp(v, minA, 360) : v) }));
          if (dir === 'both') {
            fl.append(h('div', { class: 'mini-row', id: 'p-rev-sym-info' }, h('span', { class: 'grow' }, 'Symmetrisch'), h('b', { class: 'mono' }, `je Seite ${fmt(Model.num(it.p.angle, V, 360) / 2, 1)}°`)));
          }
          if (dir === 'two') {
            fl.append(UI.numField({ id: 'p-angle2', label: 'Winkel Seite 2', value: it.p.angle2 ?? it.p.angle, unit: '°', min: 0, onCommit: (v) => setP('angle2', typeof v === 'number' ? clamp(v, 0, 360) : v) }));
          }
        } else {
          const tf = it.p.toFace;
          const fr = tf && !tf.lost ? Model.revolveFrame(it.p, V) : null;
          const hitDeg = fr ? Model.revolveHitAngle(fr, tf.o, tf.fn, !!it.p.toFaceFlip) : null;
          const infoTxt = !tf ? 'Noch keine Fläche gewählt' : tf.lost ? `Zielfläche „${tf.name || '?'}“ fehlt` : `${tf.kind === 'datum' ? 'Bezugsebene' : 'Fläche'}: „${tf.name || 'Fläche'}“${hitDeg != null ? ` (${fmt(hitDeg, 1)}°)` : ''}`;
          fl.append(h('div', { class: 'mini-row', id: 'p-rev-face-info', style: tf && tf.lost ? { color: 'var(--bad)' } : null }, h('span', { class: 'grow' }, infoTxt)));
          const pb = h('button', { type: 'button', class: 'btn', id: 'p-rev-face-pick' }); pb.innerHTML = icon('cursor') + (tf ? 'Andere Fläche wählen' : 'Fläche im Bild wählen');
          pb.onclick = () => Features.pickRevolveFace(it.id);
          fl.append(pb);
          const dats = typeof Datums !== 'undefined' ? Datums.list().filter((d) => d.plane) : [];
          if (dats.length) {
            fl.append(UI.selectField({
              id: 'p-rev-face-datum', label: 'Bezugsebene als Ziel',
              value: tf && tf.kind === 'datum' ? tf.datumId : '',
              options: [['', 'Bezugsebene wählen …'], ...dats.map((d) => [d.id, d.name])],
              onChange: (v) => { if (v) Features.setRevolveToFace(it.id, { datumId: v }); },
            }));
          }
          const flp = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'p-rev-face-flip', checked: !!it.p.toFaceFlip }), 'Andere Richtung');
          flp.querySelector('input').onchange = (e) => App.change('Drehrichtung umgekehrt', (doc) => { const T = Model.find(doc, it.id).item; T.p.toFaceFlip = e.target.checked; });
          fl.append(flp);
        }
        const axList = typeof Datums !== 'undefined' ? Datums.axes() : [];
        if (axList.length || it.p.axisId) {
          const opts = [['sketch', 'Achse aus der Skizze'], ...axList.filter((a) => a.axis).map((a) => ['da:' + a.id, 'Bezugsachse „' + a.name + '“'])];
          const val = it.p.axisId && Datums.findAxis(it.p.axisId) ? 'da:' + it.p.axisId : 'sketch';
          const as = UI.selectField({ id: 'p-rev-axis', label: 'Drehachse', value: val, options: opts, onChange: (v) => Datums.applyAxisToRevolve(it.id, v.startsWith('da:') ? v.slice(3) : null) });
          as.setAttribute('data-help', 'datumAxis');
          fl.append(as);
        }
      }
      sec.append(fl);
      const eb = h('button', { type: 'button', class: 'btn' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
      eb.onclick = () => Sketch.editItem(it.id);
      sec.append(eb);
      // Skizze auf eine andere Ebene umhängen (SK-13): Grundebenen und Bezugsebenen
      if (App.doc.items.includes(it) && it.p.sketch && it.p.sketch.plane) {
        const opts = [['', 'Ebene wechseln …'], ['o:XY', 'Arbeitsfläche (XY)'], ['o:XZ', 'Vorne (XZ)'], ['o:YZ', 'Seite (YZ)'], ...Datums.list().filter((d) => d.plane).map((d) => ['d:' + d.id, 'Bezugsebene „' + d.name + '“'])];
        const rs = UI.selectField({ id: 'p-replane', label: 'Skizze umhängen', value: '', options: opts, onChange: (v) => { if (v) Actions.replaneSketch(it.id, v); } });
        rs.setAttribute('data-help', 'replaneSketch'); sec.append(rs);
      }
      w.append(sec);
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
        const unbind = (pp, i) => { if (pp.bind && pp.bind[i]) { pp.bind[i] = null; if (!pp.bind.some(Boolean)) delete pp.bind; } };
        const setPt = (i, k, v) => App.change('Punkt geändert', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d || !f.item.p.path3d.pts[i]) return false; bake(f.item.p.path3d); f.item.p.path3d.pts[i][k] = v; unbind(f.item.p.path3d, i); }, { merge: 'p3:' + it.id + ':' + i + ':' + k });
        const BD = it.p.path3d.bind || [];
        // Regel je Stück: Richtung (entlang X/Y/Z) und Länge – wie in einer Skizze, nur im Raum
        const setRule = (i, patch) => App.change('Regel im Pfad', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d) return false; Model.path3dSetRule(f.item.p.path3d, i, patch, Model.vars(doc).v); });
        const fs = h('div', { class: 'fields' });
        fs.append(UI.selectField({ id: 'p-smooth', label: 'Verlauf', value: it.p.path3d.smooth === false ? 'corner' : 'smooth', options: [['smooth', 'Glatte Kurve durch die Punkte'], ['corner', 'Gerade Stücke, runde Ecken']], onChange: (v) => App.change('Verlauf', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; f.item.p.path3d.smooth = v !== 'corner'; }) }));
        sec.append(fs);
        const list = h('div', { class: 'p3-list', id: 'p3-list' });
        P3.forEach((q, i) => {
          const row = h('div', { class: 'fields three p3-row' });
          ['x', 'y', 'z'].forEach((ax, k) => row.append(UI.numField({ id: `p3-${i}-${ax}`, label: (k === 0 ? `P${i + 1} ` : '') + ax.toUpperCase(), value: typeof q[k] === 'string' ? q[k] : round(RP[i][k], 3), onCommit: (v) => setPt(i, k, v) })));
          list.append(row);
          if (BD[i]) {
            const bf = Model.find(App.doc, BD[i].id), ub = h('button', { type: 'button', class: 'btn ghost small', id: `p3-unbind-${i}` }); ub.innerHTML = icon('close') + 'lösen';
            ub.onclick = () => App.change('Punkt vom Körper gelöst', (doc) => { const f = Model.find(doc, it.id); if (!f || !f.item.p.path3d) return false; unbind(f.item.p.path3d, i); });
            list.append(h('div', { class: 'mini-row', id: `p3-bound-${i}` }, h('span', { class: 'grow' }, `P${i + 1} hängt an „${bf ? Model.label(bf.item) : '?'}“ und wandert mit`), ub));
          }
          if (P3.length > 2) { const del = h('button', { type: 'button', class: 'btn ghost small', id: `p3-del-${i}`, 'aria-label': `Punkt ${i + 1} löschen` }); del.innerHTML = icon('trash') + `Punkt ${i + 1} löschen`; del.onclick = () => App.change('Punkt gelöscht', (doc) => {
            const f = Model.find(doc, it.id); if (!f) return false; const pp = f.item.p.path3d; bake(pp); pp.pts.splice(i, 1);
            // Regeln: die beiden Stücke am gelöschten Punkt werden eins – ohne Regel
            if (pp.rules) { const R = pp.rules.slice(); if (i === 0) R.splice(0, 1); else if (i >= R.length) R.splice(R.length - 1, 1); else { R.splice(i, 1); R[i - 1] = null; } if (R.some(Boolean)) pp.rules = R; else delete pp.rules; }
            if (pp.bind) { pp.bind.splice(i, 1); if (!pp.bind.some(Boolean)) delete pp.bind; }
          }); list.append(del); }
          if (i + 1 < P3.length) {
            const L = Math.hypot(RP[i + 1][0] - RP[i][0], RP[i + 1][1] - RP[i][1], RP[i + 1][2] - RP[i][2]), r = RU[i] || {};
            const sr = h('div', { class: 'fields p3-seg' });
            sr.append(UI.selectField({ id: `p3-ax-${i}`, label: `Stück P${i + 1} → P${i + 2}`, value: r.ax || '', options: [['', 'Richtung frei'], ['x', 'entlang X'], ['y', 'entlang Y'], ['z', 'entlang Z (senkrecht)'], ...(i > 0 ? [['perp', 'rechtwinklig zum vorigen'], ['par', 'parallel zum vorigen']] : [])], onChange: (v) => setRule(i, { ax: v || null }) }));
            sr.append(UI.numField({ id: `p3-len-${i}`, label: r.len != null ? 'Länge (fest)' : `Länge (jetzt ${Units.fmtLen(L, 1)})`, value: r.len != null ? r.len : 0, min: 0, onCommit: (v) => setRule(i, { len: v || null }) }));
            list.append(sr);
          }
        });
        sec.append(list);
        const mb = h('button', { type: 'button', class: 'btn', id: 'route-more' }); mb.innerHTML = icon('plus') + 'Punkte im Bild anhängen';
        mb.onclick = () => Features.routeAppend(it.id);
        sec.append(mb, h('div', { class: 'hint-box', html: 'Das Rohr läuft durch die Punkte im Raum – gut für Kabelkanäle, Leitungen und Bügel, die sich in alle Richtungen biegen. Mit <b>Wand</b> wird es hohl.' }));
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
        ml.append(row, h('div', { class: 'hint-box', html: hasPath ? 'Der Übergang läuft an der Mittellinie entlang. Spitze und „Gerade Flächen“ gibt es dabei nicht.' : 'Ohne Mittellinie nimmt der Übergang den kürzesten Weg. Mit einer <b>Mittellinie</b> biegst du ihn – z. B. ein gebogenes Rohr oder ein geschwungenes Gehäuse.' }));
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
        fk.append(row, h('div', { class: 'hint-box', html: hasRail ? 'Zwischen den Umrissen folgt der Übergang der Führungskurve – z. B. ein Griff oder ein Gehäuse, das in der Mitte bauchig wird. Die Umrisse selbst bleiben gleich.' : 'Mit einer <b>Führungskurve</b> gibst du die Seitenlinie vor: Der Übergang wird zwischen den Umrissen bauchiger oder schlanker, ohne dass du mehr Umrisse zeichnen musst.' }));
      } else fk.append(h('div', { class: 'hint-box', html: hasPath ? 'Mit Mittellinie geht keine Führungskurve – erst „Ohne Mittellinie“.' : 'Eine Führungskurve braucht mindestens zwei Umrisse.' }));
      // zweite Führungskurve quer zur ersten (z. B. Gehäuse: erste von der Seite für die Höhe, zweite von oben für die Breite)
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
        fk2.append(row, h('div', { class: 'hint-box', html: hasRail2 ? 'Der Übergang folgt beiden Führungskurven – jede bestimmt die Breite in ihrer Richtung.' : 'Die erste Führungskurve gibt die Breite in einer Richtung vor. Eine <b>zweite</b> quer dazu gibt die andere vor – so formst du eine Hülle von der Seite <i>und</i> von oben.' }));
      }
      if (hasRail) { ml.innerHTML = ''; ml.append(h('div', { class: 'section-h' }, 'Mittellinie'), h('div', { class: 'hint-box', html: 'Mit Führungskurve geht keine Mittellinie – erst „Ohne Führungskurve“.' })); }
      w.append(sec, ml, fk); if (fk2) w.append(fk2);
    } else if (it.kind === 'transform') {
      sec.firstChild.textContent = 'Verschieben/Drehen';
      Features.renderTransform(it, sec, setP); w.append(sec);
    } else if (it.kind === 'scale') {
      sec.firstChild.textContent = 'Skalieren';
      Features.renderScale(it, sec, setP); w.append(sec);
    } else if (it.kind === 'thicken') {
      sec.firstChild.textContent = 'Aufdicken';
      Features.renderThicken(it, sec, setP); w.append(sec);
    } else if (it.kind === 'rib') {
      sec.firstChild.textContent = 'Rippe';
      Features.renderRib(it, sec, setP); w.append(sec);
    } else if (it.kind === 'mirrorStep') {
      sec.firstChild.textContent = 'Schritt spiegeln';
      Features.renderMirrorStep(it, sec, setP); w.append(sec);
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
    if (!isMergedStep && it.kind !== 'transform') {
      const pos = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Lage'));
      const setT = (k, val) => App.change(k.startsWith('r') ? 'Gedreht' : 'Verschoben', (doc) => { Model.find(doc, it.id).item.t[k] = val; }, { merge: 't:' + it.id + ':' + k });
      const fp = h('div', { class: 'fields three' });
      for (const k of ['x', 'y', 'z']) fp.append(UI.numField({ id: 't-' + k, value: it.t[k], axis: k, unit: '', len: true, onCommit: (v) => setT(k, v) }));
      const fr = h('div', { class: 'fields three' });
      for (const k of ['rx', 'ry', 'rz']) fr.append(UI.numField({ id: 't-' + k, value: it.t[k], axis: k[1], unit: '°', onCommit: (v) => setT(k, v) }));
      pos.append(h('div', { class: 'field' }, h('label', null, `Position (${Units.label()})`), fp), h('div', { class: 'field' }, h('label', null, 'Drehung (°)'), fr));
      const qa = h('div', { class: 'btn-row' });
      const drop = h('button', { type: 'button', class: 'btn small', 'data-tip': 'Unterkante auf Höhe 0 setzen' }); drop.innerHTML = icon('push') + 'Auf XY-Ebene';
      drop.onclick = () => Actions.dropToPlate([it.id]);
      const rz = h('button', { type: 'button', class: 'btn small', 'data-tip': 'Um 90° drehen (um Z)', 'data-kbd': 'R' }); rz.innerHTML = icon('rotate') + '90°';
      rz.onclick = () => Actions.rotate90([it.id], 'z');
      if (!f.parent) qa.append(drop);
      qa.append(rz); pos.append(qa);
      w.append(pos);
    }
    // Kanten
    if (it.role !== 'hole' && !isMergedStep) {
      const ks = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Kanten'));
      for (const fin of (it.finishes || []).filter((x) => x.type === 'shell')) {
        const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
        const isRef = !!(err && RefFix.isRefError(err));
        const sh = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Wandstärke'));
        const row = h('div', { class: 'fields', style: { gridTemplateColumns: isRef ? '1fr auto auto' : '1fr auto', alignItems: 'end' } });
        const nf = UI.numField({ id: 'fin-' + fin.id, label: `Wand · ${(fin.faces || []).length} Öffnung${(fin.faces || []).length === 1 ? '' : 'en'}`, value: fin.r, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
        if (err) nf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
        row.append(nf);
        if (isRef) {
          const iss = rightIssues.find((x) => x.finishId === fin.id);
          if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, 'Neu wählen'); fb.onclick = () => RefFix.start(iss); row.append(fb); }
        }
        const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Aushöhlen entfernen', 'data-tip': 'Aushöhlen entfernen' }); del.innerHTML = icon('trash');
        del.onclick = () => Actions.removeFinish(it.id, fin.id);
        row.append(del); sh.append(row);
        sh.append(h('div', { class: 'hint-box', html: 'Klick eine weitere Fläche an und wähle <b>Aushöhlen</b>, um sie zu öffnen oder wieder zu schließen.' }));
        w.append(sh);
      }
      for (const fin of (it.finishes || []).filter((x) => x.type !== 'shell')) {
        const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
        const isRef = !!(err && RefFix.isRefError(err));
        const row = h('div', { class: 'fields', style: { gridTemplateColumns: isRef ? '1fr auto auto' : '1fr auto', alignItems: 'end' } });
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
        if (err) nf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
        row.append(nf);
        if (isRef) {
          const iss = rightIssues.find((x) => x.finishId === fin.id);
          if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, 'Neu wählen'); fb.onclick = () => RefFix.start(iss); row.append(fb); }
        }
        const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'Entfernen', 'data-tip': 'Entfernen' }); del.innerHTML = icon('trash');
        del.onclick = () => Actions.removeFinish(it.id, fin.id);
        row.append(del); ks.append(row);
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
    if (!isMoveOnly) {
      w.append(colorSection((c) => App.change(c ? 'Farbe geändert' : 'Farbe vom Werkstoff', (doc) => { const T = Model.find(doc, it.id).item; if (c) { T.color = c; T.colorSet = true; } else delete T.colorSet; }), it.color, !!it.colorSet, it));
      // Farbe der gewählten Fläche
      const sf = Actions.selectedFace();
      if (sf && sf.id === it.id && it.role !== 'hole') {
        const fsec = h('div', { class: 'section', id: 'face-color', 'data-help': 'faceColor' }, h('div', { class: 'section-h' }, 'Farbe dieser Fläche'));
        const key = { n: sf.info.n || null, c: sf.info.c };
        const cur = (it.faceColors || []).find((x) => Viewer.faceIndexOf(it.id, x) === sf.idx);
        const setFace = (col) => App.change(col ? 'Flächenfarbe' : 'Flächenfarbe entfernt', (doc) => {
          const T = Model.find(doc, it.id).item; const list = (T.faceColors || []).filter((x) => Viewer.faceIndexOf(it.id, x) !== sf.idx);
          if (col) list.push({ ...key, col });
          if (list.length) T.faceColors = list; else delete T.faceColors;
        });
        const row = h('div', { class: 'colors' });
        for (const c of COLORS) { const b = h('button', { type: 'button', 'aria-label': c.n, 'data-tip': c.n, 'aria-pressed': cur && cur.col === c.c ? 'true' : 'false', style: { background: c.c } }); b.onclick = () => setFace(c.c); row.append(b); }
        const free = h('input', { type: 'color', id: 'face-color-inp', value: cur ? cur.col : '#e03131', 'aria-label': 'Eigene Flächenfarbe' });
        free.addEventListener('change', () => setFace(free.value.toLowerCase()));
        row.append(h('label', { class: 'color-free', 'data-tip': 'Jede Farbe' }, free));
        fsec.append(row);
        if (cur) { const b = h('button', { type: 'button', class: 'btn ghost', id: 'face-color-off' }); b.innerHTML = icon('undo') + 'Flächenfarbe entfernen'; b.onclick = () => setFace(null); fsec.append(h('div', { class: 'btn-row' }, b)); }
        w.append(fsec);
      }
      // Kosmetische Gewinde (KP-20)
      const isCylFace = !!(sf && sf.id === it.id && sf.info.t === 'CYLINDRE');
      if (it.role !== 'hole' && (isCylFace || (it.threads && it.threads.length))) {
        const tsec = h('div', { class: 'section', id: 'thread-sec', 'data-help': 'cosmeticThread' }, h('div', { class: 'section-h' }, 'Gewinde (Markierung)'));
        if (isCylFace && !Features.threadOnFace(it.id, sf.idx)) {
          const mb = h('button', { type: 'button', class: 'btn small', id: 'btn-mark-thread' });
          mb.innerHTML = icon('thread') + 'Gewinde auf dieser Fläche markieren';
          mb.onclick = (e) => Features.threadPop(sf, e.currentTarget);
          tsec.append(h('div', { class: 'btn-row' }, mb));
        }
        for (const th of it.threads || []) {
          const sp = THREAD_MAP[th.size] || { pitch: 1 };
          const box = h('div', { class: 'thread-item', style: { display: 'grid', gap: '6px', padding: '6px 0', borderTop: '1px solid var(--line)' } });
          box.append(h('div', { class: 'mini-row' }, h('b', null, `${th.size} × ${Units.fmtLenU(th.length, 1)}`), h('span', { class: 'grow muted', style: { marginLeft: '6px', fontSize: '11px' } }, `${th.kind === 'int' ? 'Innengewinde' : 'Außengewinde'} · P ${fmt(sp.pitch, 2)}`)));
          const fs = h('div', { class: 'fields' });
          fs.append(UI.selectField({ id: 'th-size-' + th.id, label: 'M-Größe', value: th.size, options: THREAD_SPECS.map((s) => [s.size, s.size]), onChange: (v) => Features.updateThread(it.id, th.id, { size: v }) }));
          fs.append(UI.numField({ id: 'th-len-' + th.id, label: 'Länge', value: th.length, min: 0.5, unit: 'mm', expr: false, onCommit: (v) => Features.updateThread(it.id, th.id, { length: v }) }));
          fs.append(UI.selectField({ id: 'th-from-' + th.id, label: 'Ende', value: th.from || 'top', options: [['top', 'Ende 1'], ['bottom', 'Ende 2']], onChange: (v) => Features.updateThread(it.id, th.id, { from: v }) }));
          box.append(fs);
          const br = h('div', { class: 'btn-row' });
          const rb = h('button', { type: 'button', class: 'btn small', id: 'th-real-' + th.id }); rb.innerHTML = icon('bolt') + 'Echt machen'; rb.onclick = () => Features.makeThreadReal(it.id, th.id);
          const db = h('button', { type: 'button', class: 'btn ghost small', id: 'th-del-' + th.id, 'aria-label': 'Gewinde entfernen', 'data-tip': 'Entfernen' }); db.innerHTML = icon('trash'); db.onclick = () => Features.removeThread(it.id, th.id);
          br.append(rb, db);
          box.append(br);
          tsec.append(box);
        }
        tsec.append(h('div', { class: 'hint-box' }, 'Nur Anzeige – rechnet sofort, steht in Stückliste und Zeichnung. „Echt machen“ wandelt in ein druckbares 3D-Gewinde.'));
        w.append(tsec);
      }
      if (it.role !== 'hole') {
        const op = h('div', { class: 'fields', 'data-help': 'opacity' });
        op.append(UI.numField({ id: 'item-opacity', label: 'Sichtbarkeit (100 % = undurchsichtig)', value: Math.round((it.opacity ?? 1) * 100), unit: '%', expr: false, min: 5, onCommit: (v) => App.change('Durchsichtigkeit', (doc) => { const T = Model.find(doc, it.id).item; const o = clamp(v, 5, 100) / 100; if (o >= 1) delete T.opacity; else T.opacity = o; }, { merge: 'op:' + it.id }) }));
        w.lastChild.append(op);
      }
    }
    // Material und Gewicht dieses Teils (nur Teile der obersten Ebene)
    if (!f.parent && it.role !== 'hole' && !isMoveOnly) {
      const pm = Mass.projectMaterial();
      const ms = h('div', { class: 'section pro' }, h('div', { class: 'section-h' }, 'Material und Gewicht'));
      const fixed = Mass.fixedOf(it);
      ms.append(UI.selectField({ id: 'p-mat', label: 'Material', value: fixed ? '__fix' : it.mat || '', options: [['', `Wie das Projekt (${pm.k})`], ['__fix', 'Kaufteil: festes Gewicht'], ...MATERIALS.map((m) => [m.k, `${m.k} · ${String(m.rho).replace('.', ',')} g/cm³`])], onChange: (v) => {
        if (v === '__fix') { Mass.measure().then((r) => { const p = Mass.partOf(r, it.id); App.change('Festes Gewicht', (doc) => { const T = Model.find(doc, it.id).item; delete T.mat; T.massG = p ? round(p.mass, 1) : 10; }); }); return; }
        App.change('Material gewählt', (doc) => { const T = Model.find(doc, it.id).item; delete T.massG; delete T.colorSet; if (v) T.mat = v; else delete T.mat; });
      } }));
      if (fixed) {
        ms.append(h('div', { class: 'fields', style: { marginTop: '8px' } }, UI.numField({ id: 'p-massg', label: 'Gewicht (Datenblatt)', value: it.massG, unit: 'g', onCommit: (v) => App.change('Gewicht geändert', (doc) => { Model.find(doc, it.id).item.massG = v; }, { merge: 'massg:' + it.id }) })));
        ms.append(h('div', { class: 'hint-box' + (it.massG === '' ? ' warn' : ''), html: it.massG === '' ? '<b>Gewicht fehlt:</b> Trag das Gewicht aus dem Datenblatt ein – bis dahin zählt dieses Teil mit 0 g.' : 'Für gekaufte Teile wie Lager, Schrauben oder Elektronik: Das Gewicht kommt aus dem Datenblatt, nicht aus der Form. Auch Formeln gehen, z. B. <b>4*33,8</b>.' }));
      }
      const vR = h('b', { class: 'mono' }, '…'), gR = h('b', { class: 'mono' }, '…'), aR = h('b', { class: 'mono' }, '…'), bR = h('b', { class: 'mono' }, '…');
      ms.append(h('div', { class: 'mini-list', style: { marginTop: '8px' } }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Volumen'), vR), h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Oberfläche'), aR), h('div', { class: 'mini-row', 'data-help': 'bboxSize' }, h('span', { class: 'grow' }, 'Hüllmaße (L × B × H)'), bR), h('div', { class: 'mini-row', 'data-help': 'massProps' }, h('span', { class: 'grow' }, 'Gewicht'), gR)));
      Mass.measure().then((r) => {
        const p = Mass.partOf(r, it.id); vR.textContent = p ? Units.fmtVolU(p.volume, 3) : '–'; gR.textContent = p ? Mass.gText(p.mass) + (p.fixed ? ' (fest)' : '') : '–'; vR.id = 'p-vol'; gR.id = 'p-mass';
        aR.textContent = p && p.area ? (Units.key() === 'mm' ? `${fmt(p.area / 100, 2)} cm²` : Units.fmtAreaU(p.area, 2)) : '–'; aR.id = 'p-area';
        const b = p && p.bbox; bR.textContent = b ? `${Units.fmtLen(b[3] - b[0], 2)} × ${Units.fmtLen(b[4] - b[1], 2)} × ${Units.fmtLen(b[5] - b[2], 2)} ${Units.label()}` : '–'; bR.id = 'p-bbox';
        // Trägheit um den Schwerpunkt (PF-13) und Standfestigkeit (PF-14)
        if (p && p.I && !p.fixed) {
          const gc = (x) => fmt(x / 100, x / 100 < 10 ? 2 : 1);
          ms.querySelector('.mini-list').append(h('div', { class: 'mini-row', 'data-help': 'inertia', 'data-tip': 'Trägheitsmomente um den Schwerpunkt, um die X-, Y- und Z-Richtung' }, h('span', { class: 'grow' }, 'Trägheit X · Y · Z'), h('b', { class: 'mono', id: 'p-inertia' }, `${gc(p.I[0])} · ${gc(p.I[1])} · ${gc(p.I[2])} g·cm²`)));
        }
        const st = p && p.com ? Mass.stability(it.id, p.com) : null;
        if (st) ms.querySelector('.mini-list').append(h('div', { class: 'mini-row', 'data-help': 'stability' }, h('span', { class: 'grow' }, 'Standfest'), h('b', { class: 'mono', id: 'p-stand', style: { color: st.ok ? '' : 'var(--bad)' } }, st.ok ? `ja – kippt ab ${fmt(st.angle, 0)}°` : 'nein – kippt um')));
      });
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
    if (App.mode !== 'model' || Sketch.active || Place.active || Handles.dragging) { Features.syncPatternMarkers(); return; }
    const items = App.selectedItems(); if (!items.length) { Features.syncPatternMarkers(); return; }
    const bar = h('div', { class: 'ctxbar', role: 'toolbar', 'aria-label': T('ctx.toolbarAria') });
    const PRO = ['similar', 'shell', 'patternCirc', 'split', 'boolSubtract', 'layers', 'moveStep', 'scaleBody', 'thicken'];
    const b = (ic, label, fn, cls = '', tip, iconOnly) => { const x = h('button', { type: 'button', class: cls + (PRO.includes(ic) ? ' pro' : ''), 'data-tip': tip || (iconOnly ? label : null), 'aria-label': label || tip, 'data-help': HELP[ic] ? ic : null }); x.innerHTML = icon(ic) + (label && !iconOnly ? `<span>${label}</span>` : ''); x.onclick = (e) => { e.stopPropagation(); fn(e); }; bar.append(x); return x; };
    const sep = () => bar.append(h('span', { class: 'vsep' }));
    // Schritt hinter dem Marker oder unterdrückt: nichts zum Bearbeiten, nur zurückholen
    const off = !App.ctx ? items.map((x) => Model.topOf(App.doc, x.item.id)).find((t) => t && !Model.isActive(App.doc, t.id)) : null;
    if (off) {
      bar.classList.add('inactive');
      bar.append(h('span', { class: 'lbl' }, off.suppressed ? T('ctx.suppressed') : T('ctx.behindMarker')));
      if (off.suppressed) b('eye', T('ctx.enableAgain'), () => Timeline.toggleSuppress(off.id), 'accent', T('ctx.enableAgainTip'));
      else b('rollback', T('ctx.markerAfter'), () => Timeline.setMarker(App.doc.items.indexOf(off) + 1, `Zeitleiste: bis „${Model.label(off)}“`), 'accent', T('ctx.markerAfterTip'));
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && ((items[0].item.kind === 'transform' && !(items[0].item.p && items[0].item.p.copy)) || items[0].item.kind === 'scale' || (items[0].item.kind === 'thicken' && !(items[0].item.p && items[0].item.p.mode === 'new')))) {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, it.kind === 'scale' ? T('ctx.scaleStepLabel') : it.kind === 'thicken' ? T('ctx.thickenStepLabel') : T('ctx.moveStepLabel')));
      if (it.kind === 'thicken') b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), 'accent', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'rib') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, 'Rippe'));
      b('edit', 'Skizze bearbeiten', () => Sketch.editItem(it.id), 'accent', 'Skizze dieser Rippe bearbeiten');
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      b('patternCirc', T('ctx.pattern'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.patRect'), icon: 'patternRect', run: () => Features.pattern('rect') }, { label: T('ctx.patCirc'), icon: 'patternCirc', run: () => Features.pattern('circ') }, { label: T('ctx.patPath'), icon: 'patternPath', run: () => Features.patternPath() }]), '', T('ctx.patternTip'), true);
      if (it.p && it.p.target && Model.find(App.doc, it.p.target)) b('pointer', T('ctx.targetBody'), () => App.select([it.p.target]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    if (items.length === 1 && items[0].item.kind === 'mirrorStep') {
      const it = items[0].item;
      bar.append(h('span', { class: 'lbl' }, T('ctx.mirrorStepLabel')));
      b('cursor', T('ctx.pickMirrorPlane'), () => Features.pickMirrorStepPlane(it.id), 'accent', T('ctx.pickMirrorPlaneTip')).dataset.help = 'mirrorStep';
      b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      const merged = App.mergedInto(it.id);
      if (merged && Model.find(App.doc, merged)) b('pointer', T('ctx.targetBody'), () => App.select([merged]), '', T('ctx.targetBodyTip'));
      b('suppress', T('common.suppress'), () => Timeline.toggleSuppress(it.id), '', T('ctx.suppressTip'));
      b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
      $('#overlay').append(bar); ctx = bar;
      placeCtx();
      Features.syncPatternMarkers();
      return;
    }
    const face = Actions.selectedFace();
    // Wert im Schild der Leiste: Klick kopiert ihn (Länge der Kanten, Durchmesser einer runden Fläche)
    const valLbl = (txt, val, unit, tip) => {
      const isL = unit === 'mm';
      const numStr = isL ? Units.fmtLen(val, 2) : fmt(val, 2);
      const uStr = isL ? Units.label() : unit;
      const l = h('span', { class: 'lbl copyable', id: 'sel-val', 'data-help': 'copyValue', 'data-tip': T('ctx.copyValTip', { tip }) }, txt, h('span', { class: 'mono' }, numStr + ' ' + uStr));
      l.onclick = () => Measure.copyText(numStr, txt.trim()); return l;
    };
    if (App.edges.length) {
      const eds = App.edges.map((x) => { const r = App.results.get(x.id); return r && r.data.edges[x.edgeIdx]; }).filter(Boolean);
      const one = eds.length === 1 && eds[0];
      const full = one && one.t === 'CIRCLE' && one.r && Math.hypot(one.a[0] - one.b[0], one.a[1] - one.b[1], one.a[2] - one.b[2]) < 1e-6;
      const total = eds.reduce((s, e) => s + (e.l || 0), 0);
      if (full) bar.append(valLbl(T('ctx.edgeDia'), one.r * 2, 'mm', T('ctx.edgeDiaTip', { r: Units.fmtLenU(one.r, 2), total: Units.fmtLenU(total, 2) })));
      else if (total > 0) bar.append(valLbl(App.edges.length > 1 ? T('ctx.edgesCount', { n: App.edges.length }) : T('ctx.edgeOne'), total, 'mm', App.edges.length > 1 ? T('ctx.edgesTotalTip') : (one && one.t === 'CIRCLE' && one.r ? T('ctx.edgeArcTip', { r: Units.fmtLenU(one.r, 2) }) : T('ctx.edgeLenTip'))));
      else bar.append(h('span', { class: 'lbl' }, App.edges.length > 1 ? T('ctx.edgesCount', { n: App.edges.length }) : T('ctx.edgeOne')));
      b('fillet', T('ctx.fillet'), () => Actions.addFinish('fillet', 1), 'accent', T('ctx.filletTip'));
      b('chamfer', T('ctx.chamfer'), () => Actions.addFinish('chamfer', 1), '', T('ctx.chamferTip'));
      b('similar', T('ctx.similar'), () => Select.similar(), '', T('ctx.similarEdgesTip'), true);
      b('chainEdges', T('ctx.chain'), () => Select.chain(), '', T('ctx.chainTip'), true);
      b('similar', T('ctx.byKind'), (e) => edgeRuleMenu(App.edges[0].id, e.currentTarget), '', T('ctx.byKindTip'), true);
      if (App.edges.length === 1 && one) {
        if (one.t === 'LINE') {
          const eb = b('originPlanes', T('ctx.planeAngle'), () => Datums.startEdgeAnglePick(30, App.edges[0]), 'pro', T('ctx.planeAngleTip'));
          eb.dataset.help = 'datumEdgeAngle';
        }
        const nb = b('originPlanes', T('ctx.planeNormal'), () => Datums.addNormalToCurve(App.edges[0], 'mid'), 'pro', T('ctx.planeNormalTip'));
        nb.dataset.help = 'datumNormalCurve';
        const pb = b('point', T('ctx.pointEdgeMid'), () => Datums.addPointEdgeMid(App.edges[0]), 'pro', T('ctx.pointEdgeMidTip'));
        pb.dataset.help = 'datumPoint';
      } else if (App.edges.length === 2 && eds.length === 2 && eds[0].t === 'LINE' && eds[1].t === 'LINE') {
        const tb = b('originPlanes', T('ctx.planeTwoEdges'), () => Datums.addTwoEdges(App.edges[0], App.edges[1]), 'pro', T('ctx.planeTwoEdgesTip'));
        tb.dataset.help = 'datumTwoEdges';
      }
      sep();
    } else if (face && items.length === 1 && face.info.t === 'PLANE') {
      bar.append(h('span', { class: 'lbl' }, T('ctx.face')));
      b('sketch', T('ctx.sketchHere'), () => Sketch.startOnFace(face), 'accent', T('ctx.sketchHereTip')).dataset.help = 'sketchFace';
      b('holeWizard', T('ctx.hole'), (e) => Place.holeHere(face, e.currentTarget), '', T('ctx.holeTip'));
      b('lift', T('ctx.extrude'), () => Sketch.pushPullFace(face), '', T('ctx.extrudeTip')).dataset.help = 'extrude';
      b('fillet', T('ctx.faceEdges'), (e) => faceEdgeMenu(face, e.currentTarget), '', T('ctx.faceEdgesTip'), true);
      if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) {
        b('thicken', T('ctx.thicken'), () => Features.thicken(face), '', T('ctx.thickenTip')).dataset.help = 'thickenFace';
        b('shell', T('ctx.shell'), () => Features.shell(face), '', T('ctx.shellTip'));
        b('rib', 'Rippe', () => Features.startRib(face), 'pro', 'Offene Linie als Rippe bis zu den Wänden ziehen').dataset.help = 'rib';
      }
      b('section', T('ctx.sectionHere'), () => Views.section(true, { face }), '', T('ctx.sectionHereTip'), true);
      if (items[0].item.role !== 'hole') b('mirror', T('ctx.mirrorFace'), () => Features.mirrorAtFace(face), '', T('ctx.mirrorFaceTip'), true);
      const pf = b('point', T('ctx.pointFaceCenter'), () => Datums.addPointFaceCenter(face), 'pro', T('ctx.pointFaceCenterTip'));
      pf.dataset.help = 'datumPoint';
      sep();
    } else if (face && items.length === 1 && face.info.t !== 'PLANE') {
      const fr = face.info.r;
      bar.append(fr ? valLbl(face.info.t === 'SPHERE' ? T('ctx.sphereDia') : T('ctx.roundFaceDia'), fr * 2, 'mm', T('ctx.roundFaceDiaTip', { r: Units.fmtLenU(fr, 2) })) : h('span', { class: 'lbl' }, T('ctx.roundFace')));
      b('holeWizard', T('ctx.hole'), (e) => Place.holeHere(face, e.currentTarget), 'accent', T('ctx.holeRoundTip'));
      if (face.info.t === 'CYLINDRE' && items[0].item.role !== 'hole') {
        const hasTh = !!Features.threadOnFace(face.id, face.idx);
        const tb = b('thread', hasTh ? T('ctx.threadEdit') : T('ctx.threadMark'), (e) => Features.threadPop(face, e.currentTarget), hasTh ? 'accent' : '', T('ctx.threadTip'));
        tb.dataset.help = 'cosmeticThread';
      }
      if (face.info.t === 'CYLINDRE') {
        const ab = b('axes', T('ctx.axis'), () => Datums.addAxisFromFace(face), 'pro', T('ctx.axisTip'));
        ab.dataset.help = 'datumAxis';
      }
      if (face.info.t === 'CYLINDRE' || face.info.t === 'CONE') {
        const tb = b('originPlanes', T('ctx.planeTangent'), () => Datums.startTangentPick(face), 'pro', T('ctx.planeTangentTip'));
        tb.dataset.help = 'datumTangent';
      }
      b('fillet', T('ctx.faceEdges'), (e) => faceEdgeMenu(face, e.currentTarget), '', T('ctx.faceEdgesTip'), true);
      if (items[0].item.role !== 'hole' && App.doc.items.some((x) => x.id === face.id)) b('thicken', T('ctx.thicken'), () => Features.thicken(face), '', T('ctx.thickenTip')).dataset.help = 'thickenFace';
      const pf = b('point', T('ctx.pointFaceCenter'), () => Datums.addPointFaceCenter(face), 'pro', T('ctx.pointFaceCenterTip'));
      pf.dataset.help = 'datumPoint';
      sep();
    }
    if (items.length === 1) {
      const it = items[0].item;
      const hole = it.role === 'hole';
      const compact = !!(face || App.edges.length);
      b(hole ? 'solid' : 'hole', hole ? T('ctx.toBody') : T('ctx.toHole'), () => Actions.toggleRole(), '', hole ? T('ctx.toBodyTip') : T('ctx.toHoleTip'), compact);
      b('rotate', T('ctx.rotate'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.rotZ'), icon: 'rotate', kbd: 'R', run: () => Actions.rotate90(null, 'z') }, { label: T('ctx.rotX'), icon: 'rotate', run: () => Actions.rotate90(null, 'x') }, { label: T('ctx.rotY'), icon: 'rotate', run: () => Actions.rotate90(null, 'y') }]), '', T('ctx.rotateTip'), true);
      b('mirror', T('ctx.mirror'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.mirrorX'), icon: 'mirror', run: () => Actions.mirror(null, 'x') }, { label: T('ctx.mirrorY'), icon: 'mirror', run: () => Actions.mirror(null, 'y') }, { label: T('ctx.mirrorZ'), icon: 'mirror', run: () => Actions.mirror(null, 'z') }]), '', T('ctx.mirrorTip'), true);
      b('copy', T('common.duplicate'), () => Actions.duplicate(), '', T('ctx.dupTip'), true);
      if (App.doc.items.includes(it)) b('moveStep', T('ctx.moveStep'), () => Features.transform(), '', T('ctx.moveStepTip'), true);
      if (App.doc.items.includes(it)) b('scaleBody', T('ctx.scale'), () => Features.scale(), '', T('ctx.scaleTip'), true).dataset.help = 'scaleBody';
      if (Features.canMirrorStep(it, items[0].parent)) b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep([it.id]), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      b('patternCirc', T('ctx.pattern'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.patRect'), icon: 'patternRect', run: () => Features.pattern('rect') }, { label: T('ctx.patCirc'), icon: 'patternCirc', run: () => Features.pattern('circ') }, { label: T('ctx.patPath'), icon: 'patternPath', run: () => Features.patternPath() }, { label: T('ctx.patMirror'), icon: 'mirror', run: () => Features.pattern('mirror') }, ...(Features.canMirrorStep(it, items[0].parent) ? [{ label: T('ctx.mirrorStep'), icon: 'mirror', help: 'mirrorStep', run: () => Features.mirrorStep([it.id]) }] : [])]), '', hole ? T('ctx.patternHoleTip') : T('ctx.patternTip'), true);
      if (!hole) b('split', T('ctx.split'), () => Features.split(), '', T('ctx.splitTip'), true);
      if (!hole && it.kind === 'extrude' && it.p && it.p.sketch) b('loft', T('ctx.toTip'), () => Actions.loft([it.id], { tip: 10 }), '', T('ctx.toTipTip'), true);
      if (!App.edges.length) b('similar', T('ctx.similar'), () => Select.similar(), '', T('ctx.similarPartsTip'), true);
      if (!App.edges.length && !face && !hole && App.results.get(it.id) && App.doc.items.includes(it)) b('fillet', T('ctx.selectEdges'), (e) => edgeRuleMenu(it.id, e.currentTarget), '', T('ctx.selectEdgesTip'), true);
      if (it.kind === 'group') b('ungroup', T('ctx.ungroup'), () => Actions.ungroup(), '', T('ctx.ungroupTip'), true);
    } else {
      b('group', T('ctx.group'), () => Actions.group(), 'accent', T('ctx.groupTip'));
      if (items.every((x) => x.list === items[0].list && Features.canMirrorStep(x.item, x.parent))) b('mirror', T('ctx.mirrorStep'), () => Features.mirrorStep(items.map((x) => x.item.id)), 'pro', T('ctx.mirrorStepTip')).dataset.help = 'mirrorStep';
      if (items.length === 2) b('dim', T('ctx.gap'), (e) => gapPop(e.currentTarget), '', T('ctx.gapTip'), true);
      if (items.length === 2 && !Model.parentsOf(App.doc, items[0].item.id).some((q) => q.id === items[1].item.id) && !Model.parentsOf(App.doc, items[1].item.id).some((q) => q.id === items[0].item.id)) b('hinge', T('ctx.joint'), () => Joints.start(), '', T('ctx.jointTip'), true);
      if (items.length >= 2 && items.every((x) => x.item.kind === 'extrude')) b('loft', T('ctx.loft'), () => Actions.loft(), '', T('ctx.loftTip'));
      b('boolSubtract', T('ctx.boolean'), (e) => UI.menu(e.currentTarget, [{ label: T('ctx.boolUnion'), icon: 'boolUnion', run: () => Features.boolean('union') }, { label: T('ctx.boolSub'), icon: 'boolSubtract', run: () => Features.boolean('subtract') }, { label: T('ctx.boolInt'), icon: 'boolIntersect', run: () => Features.boolean('intersect') }]), '', T('ctx.booleanTip'), true);
      b('layers', T('ctx.align'), (e) => UI.menu(e.currentTarget, [['left', T('ctx.alignLeft')], ['cx', T('ctx.alignCx')], ['right', T('ctx.alignRight')], ['front', T('ctx.alignFront')], ['cy', T('ctx.alignCy')], ['back', T('ctx.alignBack')], ['bottom', T('ctx.alignBottom')]].map(([m, l]) => ({ label: l, run: () => Actions.align(null, m) }))), '', T('ctx.alignTip'));
      b('copy', T('common.duplicate'), () => Actions.duplicate(), '', T('ctx.dupTip'), true);
    }
    b('trash', T('common.delete'), () => Actions.remove(), 'danger', T('ctx.deleteTip'), true);
    $('#overlay').append(bar); ctx = bar;
    placeCtx();
    Features.syncPatternMarkers();
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
    const rerenderLeftHint = debounce(() => { renderLeft(); UI.renderHint(); }, 16);
    const rerender = debounce(() => { rerenderLeftHint.cancel(); renderLeft(); renderRight(); renderCtx(); UI.renderHint(); }, 16);
    App.on('doc', rerender); App.on('selection', () => { rerender.cancel(); renderRight(); renderCtx(); rerenderLeftHint(); }); App.on('results', rerender); DroneCheck.on('checked', () => { if (!App.sel.length) rerender(); }); Weak.on('analyzed', () => { if (!App.sel.length) rerender(); }); App.on('mode', () => { renderTools(); rerender(); });
    Viewer.on('camera', placeCtx);
    App.on('ghosts', placeCtx);
    ViewPrefs.on('change', debounce(() => { if (leftTab === 'tree') renderLeft(); }, 30));   // Erste Schritte ein-/ausblenden
  }
  return { paramsCSV, importParamsCSV, faceEdgeList, init, renderLeft, renderRight, renderTools, renderCtx, closeFlyout, toggleFlyout, firstStepDone, firstStepsState, expand: (id) => { expanded.add(id); renderLeft(); }, showParams: () => { leftTab = 'params'; renderLeft(); } };
})();

