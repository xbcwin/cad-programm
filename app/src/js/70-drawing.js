// ================= Technische Zeichnung =================
const Drawing = (() => {
  const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
  const SHEET_ORDER = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const SCALES = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  const DETAIL_SCALES = [1, 2, 2.5, 3, 4, 5, 10, 20];
  const DETAIL_LETTERS = 'ZYXWVUTSRQPONMLKJIHGFEDCBA'.split('');
  const VIEW_NAMES = { front: 'Vorderansicht', top: 'Draufsicht', left: 'Seitenansicht' };
  const DIM_ARROWS = [
    { key: 'filled', label: 'Pfeil gefüllt' },
    { key: 'open', label: 'Pfeil offen' },
    { key: 'slash', label: 'Schrägstrich (45°)' },
    { key: 'dot', label: 'Punkt' },
  ];
  const DIM_FONT_SIZES = [2.5, 3.5, 5, 7, 10];
  const DEFAULT_DIM_STYLE = { arrow: 'filled', fontSize: 3.5, decimals: null };
  const NOTE_TIPS = [
    { key: 'auto', label: 'Automatisch (Kante = Pfeil, Fläche = Punkt)' },
    { key: 'arrow', label: 'Pfeil' },
    { key: 'dot', label: 'Punkt' },
  ];
  const ISO286_DATA = /*JSON:iso286.json*/null;
  const DIM_MODES = [
    { key: 'lin', label: 'Abstand', short: 'Abstand', hint: '<b>Maß:</b> Zwei Punkte anklicken, dann die Maßlinie platzieren. Ein Klick auf einen Kreis bemaßt den Durchmesser. <b>Esc</b> beendet.' },
    { key: 'chain', label: 'Kettenmaß', short: 'Kettenmaß', hint: '<b>Kettenmaß:</b> Startpunkt, zweiten Punkt und Maßlinie anklicken, dann weitere Punkte der Kette anklicken. <b>Enter</b> schließt die Kette ab, <b>Esc</b> beendet.' },
    { key: 'base', label: 'Bezugsmaß', short: 'Bezugsmaß', hint: '<b>Bezugsmaß:</b> Bezugskante oder -punkt anklicken, erstes Ziel und Maßlinie platzieren, dann weitere Ziele anklicken. <b>Enter</b> schließt ab, <b>Esc</b> beendet.' },
    { key: 'ang', label: 'Winkel', short: 'Winkel', hint: '<b>Winkelmaß:</b> Zwei Kanten im Winkel zueinander anklicken, dann den Winkelbogen platzieren. <b>Esc</b> beendet.' },
    { key: 'rad', label: 'Radius (R)', short: 'Radius (R)', hint: '<b>Radius:</b> Auf eine Rundung oder einen Kreisbogen klicken, um R anzuzeigen. <b>Esc</b> beendet.' },
    { key: 'dia', label: 'Durchmesser (Ø)', short: 'Durchmesser (Ø)', hint: '<b>Durchmesser:</b> Auf eine Bohrung oder einen Kreis klicken, um Ø anzuzeigen. <b>Esc</b> beendet.' },
    { key: 'chamfer', label: 'Fase (1×45°)', short: 'Fase (1×45°)', hint: '<b>Fase:</b> Auf eine abgeschrägte Fasen-Kante klicken, um Abstand × Winkel anzuzeigen. <b>Esc</b> beendet.' },
  ];
  const scaleText = (s) => (s >= 1 ? `${fmtFixed(s, 2)}:1` : `1:${fmtFixed(1 / s, 2)}`);
  let proj = null, projRev = -1, projSceneKey = null, loadingProjPromise = null, projId = 0;
  const projSigs = new Map(), shadeCache = new Map();
  let svg = null, wrap = null, holder = null, tabsBar = null, zoom = 1, tool = null, toolState = null, selDim = null, selView = null;
  let dimMode = 'lin';
  let layout = null, dragDetail = null, dragNote = null, dragView = null;
  let detailDraft = { scale: 2, label: 'Z' };
  let noteDraft = { tip: 'auto', text: '' };
  let centersListOpen = false;
  let lastLostKey = '';
  function normDimStyle(raw, tpl = null) {
    const t = (tpl && tpl.dimStyle) || DEFAULT_DIM_STYLE;
    const rawArrow = raw && raw.arrow;
    const arrow = DIM_ARROWS.some((a) => a.key === rawArrow) ? rawArrow : (DIM_ARROWS.some((a) => a.key === t.arrow) ? t.arrow : DEFAULT_DIM_STYLE.arrow);
    const rawFs = raw && raw.fontSize != null ? Number(raw.fontSize) : Number(t.fontSize);
    const fontSize = Number.isFinite(rawFs) ? Math.round(clamp(rawFs, 1.5, 14) * 100) / 100 : DEFAULT_DIM_STYLE.fontSize;
    const rawDec = (raw && 'decimals' in raw) ? raw.decimals : t.decimals;
    const decimals = (rawDec === null || rawDec === undefined || rawDec === '' || rawDec === 'auto')
      ? null
      : (Number.isFinite(Number(rawDec)) ? clamp(Math.round(Number(rawDec)), 0, 4) : null);
    return { arrow, fontSize, decimals };
  }
  function sheetDimStyle(sh = dwg()) {
    return normDimStyle(sh && sh.dimStyle);
  }
  function norm3(v, fb = [1, -1, 1]) {
    const a = Array.isArray(v) && v.length >= 3 ? v : fb;
    const L = Math.hypot(a[0], a[1], a[2]);
    if (L < 1e-8) return norm3(fb, [0, -1, 0]);
    return [a[0] / L, a[1] / L, a[2] / L];
  }
  function orthoX3(x, dir) {
    const d = norm3(dir);
    let x0 = Array.isArray(x) && x.length >= 3 ? [x[0], x[1], x[2]] : [0, 0, 0];
    const k = x0[0] * d[0] + x0[1] * d[1] + x0[2] * d[2];
    x0 = [x0[0] - d[0] * k, x0[1] - d[1] * k, x0[2] - d[2] * k];
    if (Math.hypot(x0[0], x0[1], x0[2]) < 1e-6) {
      const up = Math.abs(d[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1];
      x0 = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
    }
    return norm3(x0, [1, 0, 0]);
  }
  const ISO_DIR = norm3([1, -1, 1]);
  const ISO_X = orthoX3([1, 1, 0], ISO_DIR);
  const STD_DIR = {
    front: { dir: [0, -1, 0], x: [1, 0, 0] },
    top: { dir: [0, 0, 1], x: [1, 0, 0] },
    left: { dir: [-1, 0, 0], x: [0, -1, 0] },
    iso: { dir: ISO_DIR, x: ISO_X },
  };
  function normalizeExtraView(v) {
    if (!v || typeof v !== 'object') return null;
    const kind = v.kind === 'free' ? 'free' : 'iso';
    const dir = norm3(v.dir, ISO_DIR);
    const x = orthoX3(v.x, dir);
    return {
      id: v.id || uid('v'),
      kind,
      name: String(v.name || (kind === 'free' ? 'Freie Ansicht' : 'Isometrie')),
      dir,
      x,
    };
  }
  function defaultAutoDims() {
    return [
      { id: uid('d'), auto: 'width', view: 'front' },
      { id: uid('d'), auto: 'height', view: 'front' },
      { id: uid('d'), auto: 'depth', view: 'left' },
      { id: uid('d'), auto: 'circles', view: 'top' },
    ];
  }
  function makeSheet(opts = {}, tpl = null) {
    const t0 = tpl && tpl.title ? tpl.title : {};
    return {
      id: opts.id || uid('sh'),
      name: opts.name || 'Blatt 1',
      sheet: SHEETS[opts.sheet] ? opts.sheet : (tpl && SHEETS[tpl.sheet] ? tpl.sheet : 'A4'),
      orient: opts.orient === 'portrait' || opts.orient === 'landscape' ? opts.orient : (tpl && tpl.orient ? tpl.orient : 'landscape'),
      scale: opts.scale != null ? opts.scale : 'auto',
      views: opts.views ? { ...opts.views } : { front: true, top: true, left: true, iso: false },
      viewOpts: opts.viewOpts && typeof opts.viewOpts === 'object' ? JSON.parse(JSON.stringify(opts.viewOpts)) : {},
      extraViews: Array.isArray(opts.extraViews) ? opts.extraViews.map(normalizeExtraView).filter(Boolean) : [],
      hidden: opts.hidden != null ? !!opts.hidden : (tpl ? !!tpl.hidden : true),
      centers: opts.centers != null ? !!opts.centers : (tpl ? !!tpl.centers : true),
      hiddenCenters: Array.isArray(opts.hiddenCenters) ? opts.hiddenCenters.slice() : [],
      dims: opts.dims || defaultAutoDims(),
      free: opts.free || [],
      details: opts.details ? opts.details.map((x) => ({ ...x, c: x.c ? [...x.c] : [0, 0], pos: x.pos ? [...x.pos] : null })) : [],
      sections: Array.isArray(opts.sections) ? opts.sections : [],
      dimStyle: normDimStyle(opts.dimStyle, tpl),
      notes: Array.isArray(opts.notes) ? opts.notes.map((n) => ({ ...n, anchor: n.anchor ? [...n.anchor] : [0, 0], elbow: n.elbow ? [...n.elbow] : [14, -10] })) : [],
      viewPos: opts.viewPos && typeof opts.viewPos === 'object' ? JSON.parse(JSON.stringify(opts.viewPos)) : {},
      title: {
        titel: t0.titel || '',
        nummer: t0.nummer || '',
        name: t0.name || '',
        datum: t0.datum || new Date().toLocaleDateString('de-DE'),
        werkstoff: t0.werkstoff || 'PLA',
        firma: t0.firma || '',
        blatt: '',
      },
    };
  }
  function normalizeSheet(raw, fallbackName = 'Blatt 1') {
    const s = makeSheet({
      id: raw && raw.id,
      name: raw && raw.name ? String(raw.name) : fallbackName,
      sheet: raw && raw.sheet,
      orient: raw && raw.orient,
      scale: raw && raw.scale != null ? raw.scale : 'auto',
      views: raw && raw.views,
      viewOpts: raw && raw.viewOpts,
      extraViews: raw && raw.extraViews,
      hidden: raw && raw.hidden,
      centers: raw && raw.centers,
      hiddenCenters: raw && Array.isArray(raw.hiddenCenters) ? raw.hiddenCenters : [],
      dims: raw && Array.isArray(raw.dims) ? raw.dims : undefined,
      free: raw && Array.isArray(raw.free) ? raw.free : undefined,
      details: raw && Array.isArray(raw.details) ? raw.details : [],
      sections: raw && Array.isArray(raw.sections) ? raw.sections : undefined,
      dimStyle: raw && raw.dimStyle && typeof raw.dimStyle === 'object' ? raw.dimStyle : undefined,
      notes: raw && Array.isArray(raw.notes) ? raw.notes : undefined,
      viewPos: raw && raw.viewPos && typeof raw.viewPos === 'object' ? raw.viewPos : undefined,
    });
    if (raw && raw.title && typeof raw.title === 'object') {
      Object.assign(s.title, raw.title);
      if (s.title.blatt === '1/1') s.title.blatt = '';
    }
    return s;
  }
  function dwgState() {
    const d = App.doc;
    if (!d.drawing) {
      const first = makeSheet({ name: 'Blatt 1' });
      d.drawing = { sheets: [first], active: first.id };
      return d.drawing;
    }
    if (!Array.isArray(d.drawing.sheets)) {
      const legacy = normalizeSheet(d.drawing, 'Blatt 1');
      d.drawing = { sheets: [legacy], active: legacy.id };
      return d.drawing;
    }
    if (!d.drawing.sheets.length) {
      const first = makeSheet({ name: 'Blatt 1' });
      d.drawing.sheets.push(first);
      d.drawing.active = first.id;
      return d.drawing;
    }
    for (let i = 0; i < d.drawing.sheets.length; i++) {
      const cur = d.drawing.sheets[i];
      if (cur && !Array.isArray(cur.sections)) cur.sections = [];
      if (cur && !Array.isArray(cur.hiddenCenters)) cur.hiddenCenters = [];
      if (cur && !Array.isArray(cur.notes)) cur.notes = [];
      if (cur && (!cur.viewPos || typeof cur.viewPos !== 'object')) cur.viewPos = {};
      if (cur) cur.dimStyle = normDimStyle(cur.dimStyle);
      if (!cur || !cur.id || !SHEETS[cur.sheet] || !cur.views || !Array.isArray(cur.dims) || !Array.isArray(cur.free) || !cur.title || !cur.name) {
        d.drawing.sheets[i] = normalizeSheet(cur, `Blatt ${i + 1}`);
      } else {
        if (!cur.viewOpts || typeof cur.viewOpts !== 'object') cur.viewOpts = {};
        if (!Array.isArray(cur.extraViews)) cur.extraViews = [];
        if (!Array.isArray(cur.details)) cur.details = [];
      }
    }
    if (!d.drawing.sheets.some((x) => x.id === d.drawing.active)) d.drawing.active = d.drawing.sheets[0].id;
    return d.drawing;
  }
  function sheets() { return dwgState().sheets; }
  function activeIndex() {
    const st = dwgState();
    const idx = st.sheets.findIndex((x) => x.id === st.active);
    return idx >= 0 ? idx : 0;
  }
  function dwg() {
    const st = dwgState();
    return st.sheets[activeIndex()] || st.sheets[0];
  }
  function nextSheetName() {
    const used = new Set(sheets().map((s) => s.name));
    let n = 1;
    while (used.has('Blatt ' + n)) n++;
    return 'Blatt ' + n;
  }
  function selectSheet(id) {
    const st = dwgState();
    if (!st.sheets.some((x) => x.id === id) || st.active === id) return;
    st.active = id;
    selDim = null; selView = null;
    dragNote = null; dragView = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section' || tool === 'note') ? { stage: 0 } : tool ? {} : null;
    fitZoom(true);
    refresh();
    Panels.renderRight();
  }
  function addSheet(opts = {}) {
    const cur = dwg();
    const name = opts.name || nextSheetName();
    const ns = makeSheet({ ...opts, name }, cur);
    App.change('Blatt hinzugefügt', () => {
      const st = dwgState();
      st.sheets.push(ns);
      st.active = ns.id;
    });
    selDim = null; selView = null;
    dragNote = null; dragView = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section' || tool === 'note') ? { stage: 0 } : tool ? {} : null;
    fitZoom(true);
    refresh();
    Panels.renderRight();
    return ns;
  }
  function duplicateSheet(id) {
    const st = dwgState();
    const src = st.sheets.find((x) => x.id === id) || dwg();
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = uid('sh');
    const used = new Set(st.sheets.map((x) => x.name));
    let n = 1, cand = src.name + ' Kopie';
    while (used.has(cand)) { n++; cand = src.name + ' Kopie ' + n; }
    clone.name = cand;
    const detMap = new Map();
    clone.details = (clone.details || []).map((x) => { const nid = uid('det'); detMap.set(x.id, nid); return { ...x, id: nid, c: x.c ? [...x.c] : [0, 0], pos: x.pos ? [...x.pos] : null }; });
    const secMap = new Map();
    clone.sections = (clone.sections || []).map((s) => {
      const nid = uid('sec');
      secMap.set(s.id, nid);
      return { ...s, id: nid };
    });
    clone.dims = (clone.dims || []).map((x) => {
      const oldId = x.id, nid = uid('d');
      let view = detMap.get(x.view) || x.view;
      if (view && view.startsWith('sec_') && secMap.has(view.slice(4))) view = 'sec_' + secMap.get(view.slice(4));
      const out = { ...x, id: nid, view };
      if (Array.isArray(x.hide)) {
        out.hide = x.hide.map((hId) => (hId && hId.startsWith(oldId + '_') ? nid + hId.slice(oldId.length) : hId));
      }
      if (x.tols && typeof x.tols === 'object') {
        const nt = {};
        for (const [tk, tv] of Object.entries(x.tols)) {
          const nk = tk.startsWith(oldId + '_') ? nid + tk.slice(oldId.length) : tk;
          nt[nk] = JSON.parse(JSON.stringify(tv));
        }
        out.tols = nt;
      }
      if (x.tol && typeof x.tol === 'object') out.tol = JSON.parse(JSON.stringify(x.tol));
      return out;
    });
    clone.hiddenCenters = (clone.hiddenCenters || []).map((cid) => {
      if (typeof cid !== 'string' || !cid.startsWith('ctr|')) return cid;
      const parts = cid.split('|');
      let vName = parts[1];
      if (detMap.has(vName)) vName = detMap.get(vName);
      else if (vName && vName.startsWith('sec_') && secMap.has(vName.slice(4))) vName = 'sec_' + secMap.get(vName.slice(4));
      parts[1] = vName;
      return parts.join('|');
    });
    clone.free = (clone.free || []).map((x) => ({ ...x, id: uid('f') }));
    const idMap = new Map();
    if (Array.isArray(clone.extraViews) && clone.extraViews.length) {
      clone.extraViews = clone.extraViews.map((v) => { const nid = uid('v'); idMap.set(v.id, nid); return { ...v, id: nid }; });
      if (clone.viewOpts && typeof clone.viewOpts === 'object') {
        const nextOpts = {};
        for (const [k, val] of Object.entries(clone.viewOpts)) nextOpts[idMap.get(k) || k] = val;
        clone.viewOpts = nextOpts;
      }
    }
    clone.dimStyle = normDimStyle(src.dimStyle);
    clone.notes = (clone.notes || []).map((n) => {
      let view = detMap.get(n.view) || idMap.get(n.view) || n.view;
      if (view && view.startsWith('sec_') && secMap.has(view.slice(4))) view = 'sec_' + secMap.get(view.slice(4));
      return { ...n, id: uid('ln'), view, anchor: n.anchor ? [...n.anchor] : [0, 0], elbow: n.elbow ? [...n.elbow] : [14, -10] };
    });
    const nextVP = {};
    for (const [k, v] of Object.entries(clone.viewPos || {})) {
      if (Array.isArray(v) && v.length >= 2) nextVP[idMap.get(k) || k] = [Number(v[0]) || 0, Number(v[1]) || 0];
    }
    clone.viewPos = nextVP;
    if (clone.title) clone.title.blatt = '';
    App.change('Blatt dupliziert', () => {
      const st2 = dwgState();
      st2.sheets.push(clone);
      st2.active = clone.id;
    });
    selDim = null;
    fitZoom(true);
    refresh();
    Panels.renderRight();
    return clone;
  }
  async function renameSheet(id, newName) {
    const st = dwgState();
    const target = st.sheets.find((x) => x.id === id) || dwg();
    if (!target) return false;
    let val = newName;
    if (val === undefined) val = await UI.prompt('Blatt umbenennen', 'Blattname', target.name, 'Umbenennen');
    const clean = String(val || '').trim();
    if (!clean || clean === target.name) return false;
    App.change('Blatt umbenannt', () => {
      const s = dwgState().sheets.find((x) => x.id === target.id);
      if (s) s.name = clean;
    });
    render();
    Panels.renderRight();
    return true;
  }
  function removeSheet(id) {
    const list = sheets();
    if (list.length <= 1) { UI.toast('Mindestens ein Blatt muss bleiben.', { icon: 'info' }); return false; }
    const target = list.find((x) => x.id === id) || dwg();
    if (!target) return false;
    const removedName = target.name;
    App.change('Blatt gelöscht', () => {
      const st = dwgState();
      const i = st.sheets.findIndex((x) => x.id === target.id);
      if (i < 0 || st.sheets.length <= 1) return;
      st.sheets.splice(i, 1);
      if (st.active === target.id) st.active = st.sheets[Math.min(i, st.sheets.length - 1)].id;
    });
    selDim = null;
    fitZoom(true);
    refresh();
    Panels.renderRight();
    UI.toast(`„${removedName}“ entfernt.`, { icon: 'info' });
    return true;
  }
  // ---------- Öffnen ----------
  function open() {
    const el = $('#sheet'); el.innerHTML = '';
    wrap = h('div', { class: 'sheet-wrap' });
    holder = h('div', { class: 'sheet-holder' });
    wrap.append(holder); el.append(wrap);
    const zb = h('div', { class: 'zoom-btns' });
    const b1 = h('button', { type: 'button', 'aria-label': 'Verkleinern', 'data-tip': 'Verkleinern' }); b1.innerHTML = icon('zoomOut'); b1.onclick = () => setZoom(zoom / 1.25);
    const b2 = h('button', { type: 'button', 'aria-label': 'Ganzes Blatt', 'data-tip': 'Ganzes Blatt zeigen' }); b2.innerHTML = icon('fit'); b2.onclick = () => fitZoom();
    const b3 = h('button', { type: 'button', 'aria-label': 'Vergrößern', 'data-tip': 'Vergrößern' }); b3.innerHTML = icon('zoomIn'); b3.onclick = () => setZoom(zoom * 1.25);
    zb.append(b1, b2, b3); el.append(zb);
    tabsBar = h('div', { class: 'sheet-tabs', id: 'sheet-tabs', role: 'tablist', 'aria-label': 'Zeichnungsblätter', 'data-help': 'drawingSheets' });
    el.append(tabsBar);
    wrap.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    window.addEventListener('pointerup', onUp);
    dwgState();
    fitZoom(true);
    renderTabs();
    refresh();
  }
  function close() { window.removeEventListener('pointerup', onUp); tool = null; toolState = null; selView = null; dragDetail = null; dragNote = null; dragView = null; const el = $('#sheet'); if (el) el.innerHTML = ''; svg = null; wrap = null; holder = null; tabsBar = null; }
  function renderTabs() {
    if (!tabsBar) return;
    const list = sheets();
    const active = dwg();
    tabsBar.innerHTML = '';
    for (const s of list) {
      const isAct = s.id === active.id;
      const tab = h('div', {
        class: 'sheet-tab' + (isAct ? ' active' : ''),
        role: 'tab',
        tabindex: '0',
        'aria-selected': String(isAct),
        'data-sheet-id': s.id,
      });
      const nm = h('span', { class: 'st-name', title: s.name }, s.name);
      nm.ondblclick = (e) => { e.stopPropagation(); renameSheet(s.id); };
      const fmt = h('span', { class: 'st-fmt' }, s.sheet);
      tab.append(nm, fmt);
      if (proj) {
        const nLost = lostDims(s).length;
        if (nLost > 0) tab.append(h('span', { class: 'st-lost', title: `${nLost} ${nLost === 1 ? 'verlorenes Maß' : 'verlorene Maße'}` }, String(nLost)));
      }
      const ren = h('button', { type: 'button', class: 'st-act st-ren', 'aria-label': 'Blatt umbenennen', 'data-tip': 'Blatt umbenennen' });
      ren.innerHTML = icon('edit');
      ren.onclick = (e) => { e.stopPropagation(); renameSheet(s.id); };
      tab.append(ren);
      if (list.length > 1) {
        const del = h('button', { type: 'button', class: 'st-act st-del', 'aria-label': 'Blatt löschen', 'data-tip': 'Blatt löschen' });
        del.innerHTML = icon('close');
        del.onclick = (e) => { e.stopPropagation(); removeSheet(s.id); };
        tab.append(del);
      }
      tab.onclick = () => selectSheet(s.id);
      tab.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSheet(s.id); } };
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        UI.menu(tab, [
          { label: 'Umbenennen …', icon: 'edit', run: () => renameSheet(s.id) },
          { label: 'Duplizieren', icon: 'copy', run: () => duplicateSheet(s.id) },
          '-',
          { label: 'Blatt löschen', icon: 'trash', disabled: list.length <= 1, run: () => removeSheet(s.id) },
        ]);
      });
      tabsBar.append(tab);
    }
    const addBtn = h('button', {
      type: 'button',
      class: 'sheet-tab-add',
      id: 'dw-add-sheet',
      'data-help': 'drawingSheets',
      'aria-label': 'Blatt hinzufügen',
      'data-tip': 'Neues Blatt hinzufügen',
    });
    addBtn.innerHTML = icon('plus') + '<span>Blatt</span>';
    addBtn.onclick = () => addSheet();
    tabsBar.append(addBtn);
  }
  function setZoom(z) { zoom = clamp(z, 0.08, 8); if (svg) { const [W, H] = sheetSize(); svg.setAttribute('width', W * zoom * 3.2); svg.setAttribute('height', H * zoom * 3.2); } }
  function fitZoom(noRender) {
    const [W, H] = sheetSize(); const c = $('#center').getBoundingClientRect();
    zoom = Math.max(0.08, Math.min((c.width - 60) / (W * 3.2), (c.height - 106) / (H * 3.2)));
    if (!noRender) setZoom(zoom);
  }
  function sheetSize(sh = dwg()) { const s = SHEETS[sh.sheet] || SHEETS.A4; return sh.orient === 'portrait' ? [s[1], s[0]] : [s[0], s[1]]; }
  function dirSig(v) {
    return (v.dir || []).concat(v.x || []).map((n) => Math.round(n * 10000)).join(',');
  }
  function viewLabel(vName, sh = dwg()) {
    if (VIEW_NAMES[vName]) return VIEW_NAMES[vName];
    if (vName === 'iso') return 'Isometrie';
    if (String(vName).startsWith('sec_')) {
      const sec = (sh.sections || []).find((x) => 'sec_' + x.id === vName);
      return sec ? `Schnitt ${sec.label}–${sec.label}` : 'Schnitt';
    }
    const det = (sh.details || []).find((x) => x.id === vName);
    if (det) return `Detail ${det.label}`;
    const ev = (sh.extraViews || []).find((v) => v.id === vName);
    return ev ? ev.name : vName;
  }
  function is3dView(sh, key) {
    return key === 'iso' || (sh.extraViews || []).some((v) => v.id === key);
  }
  function viewOpts(sh, key) {
    const is3d = is3dView(sh, key);
    const def = { scale: 'sheet', hidden: is3d ? false : !!sh.hidden, tangent: true, shaded: false };
    const ov = (sh.viewOpts && sh.viewOpts[key]) || {};
    return {
      scale: typeof ov.scale === 'number' && ov.scale > 0 ? ov.scale : 'sheet',
      hidden: ov.hidden != null ? !!ov.hidden : def.hidden,
      tangent: ov.tangent != null ? !!ov.tangent : def.tangent,
      shaded: ov.shaded != null ? !!ov.shaded : def.shaded,
    };
  }
  function activeViews(sh = dwg()) {
    const out = [];
    for (const k of ['front', 'top', 'left', 'iso']) {
      if (sh.views && sh.views[k]) out.push({ id: k, kind: k, name: viewLabel(k, sh), is3d: k === 'iso', custom: false, removable: k === 'iso' });
    }
    for (const ev of sh.extraViews || []) {
      out.push({ id: ev.id, kind: ev.kind, name: ev.name, is3d: true, custom: true, removable: true, dir: ev.dir, x: ev.x });
    }
    return out;
  }
  function currentViewKey(sh = dwg()) {
    const list = activeViews(sh);
    if (!list.length) return null;
    return list.some((v) => v.id === selView) ? selView : list[0].id;
  }
  function selectView(key) {
    selView = key; selDim = null;
    render(); Panels.renderRight();
  }
  function setViewOpt(key, patch, label) {
    App.change(label || 'Ansicht geändert', () => {
      const s = dwg();
      s.viewOpts = s.viewOpts || {};
      s.viewOpts[key] = { ...(s.viewOpts[key] || {}), ...patch };
    });
    render(); Panels.renderRight();
  }
  async function addView(kind = 'iso', opts = {}) {
    const k = kind === 'free' ? 'free' : 'iso';
    let dir, x;
    if (k === 'free') {
      if (opts.dir) { dir = norm3(opts.dir, ISO_DIR); x = orthoX3(opts.x, dir); }
      else if (typeof Viewer !== 'undefined' && Viewer.cameraBasis) { const cb = Viewer.cameraBasis(); dir = norm3(cb.dir, ISO_DIR); x = orthoX3(cb.x, dir); }
      else { dir = ISO_DIR; x = ISO_X; }
    } else {
      dir = norm3(opts.dir, ISO_DIR); x = orthoX3(opts.x, dir);
    }
    const base = k === 'free' ? 'Freie Ansicht' : 'Isometrie';
    const used = new Set(activeViews(dwg()).map((v) => v.name));
    let name = opts.name || base;
    if (!opts.name && used.has(name)) {
      let n = 2;
      while (used.has(base + ' ' + n)) n++;
      name = base + ' ' + n;
    }
    const nv = { id: uid('v'), kind: k, name, dir, x };
    const vOpts = {
      scale: typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : 'sheet',
      hidden: opts.hidden != null ? !!opts.hidden : false,
      tangent: opts.tangent != null ? !!opts.tangent : true,
      shaded: !!opts.shaded,
    };
    App.change(k === 'free' ? 'Freie Ansicht hinzugefügt' : 'Isometrische Ansicht hinzugefügt', () => {
      const s = dwg();
      s.extraViews = s.extraViews || [];
      s.extraViews.push(nv);
      s.viewOpts = s.viewOpts || {};
      s.viewOpts[nv.id] = vOpts;
    });
    selView = nv.id; selDim = null;
    await refresh(); Panels.renderRight();
    return nv;
  }
  function removeView(key) {
    App.change('Ansicht entfernt', () => {
      const s = dwg();
      if (key === 'iso') s.views.iso = false;
      else s.extraViews = (s.extraViews || []).filter((v) => v.id !== key);
      if (s.viewOpts) delete s.viewOpts[key];
      if (s.viewPos) delete s.viewPos[key];
      s.notes = (s.notes || []).filter((n) => n.view !== key);
    });
    selView = currentViewKey();
    render(); Panels.renderRight();
  }
  async function updateFreeViewCamera(key) {
    const cb = typeof Viewer !== 'undefined' && Viewer.cameraBasis ? Viewer.cameraBasis() : null;
    if (!cb) return;
    const dir = norm3(cb.dir, ISO_DIR), x = orthoX3(cb.x, dir);
    App.change('3D-Blickwinkel übernommen', () => {
      const s = dwg();
      const ev = (s.extraViews || []).find((v) => v.id === key);
      if (ev) { ev.dir = dir; ev.x = x; }
    });
    for (const ck of [...shadeCache.keys()]) if (ck.startsWith(key + '|')) shadeCache.delete(ck);
    await refresh(); Panels.renderRight();
  }
  function collectNeededViews() {
    const specs = [];
    const seen = new Set();
    const addSpec = (key, spec, sig) => {
      if (seen.has(key)) return;
      seen.add(key);
      specs.push({ key, spec, sig });
    };
    for (const k of ['front', 'top', 'left']) addSpec(k, k, 'std');
    const all = sheets();
    if (all.some((s) => s.views && s.views.iso)) addSpec('iso', 'iso', 'std');
    for (const s of all) {
      for (const ev of s.extraViews || []) {
        addSpec(ev.id, { key: ev.id, dir: ev.dir, x: ev.x }, dirSig(ev));
      }
    }
    return specs;
  }
  const VIEW_FRAMES = {
    front: { dir: [0, -1, 0], x: [1, 0, 0], y: [0, 0, 1] },
    top: { dir: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] },
    left: { dir: [-1, 0, 0], x: [0, -1, 0], y: [0, 0, 1] },
  };
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vNorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function sectionPlaneSpec(sec) {
    const vf = (proj && proj.views && proj.views[sec.parent]) || VIEW_FRAMES[sec.parent] || VIEW_FRAMES.top;
    const ex = vf.x, ey = vf.y;
    const a = sec.a || [0, 0], b = sec.b || [10, 0];
    const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv) || 1;
    const t2 = [du / L, dv / L];
    const look2 = sec.flip ? [t2[1], -t2[0]] : [-t2[1], t2[0]];
    const mu = (a[0] + b[0]) * 0.5, mv = (a[1] + b[1]) * 0.5;
    const o = [ex[0] * mu + ey[0] * mv, ex[1] * mu + ey[1] * mv, ex[2] * mu + ey[2] * mv];
    const look3 = vNorm([ex[0] * look2[0] + ey[0] * look2[1], ex[1] * look2[0] + ey[1] * look2[1], ex[2] * look2[0] + ey[2] * look2[1]]);
    const dir = [-look3[0], -look3[1], -look3[2]];
    let secX, secY;
    if (Math.abs(dir[2]) < 0.01) {
      secY = [0, 0, 1];
      secX = vNorm(vCross(secY, dir));
    } else {
      const tPos = (t2[0] > 1e-6 || (Math.abs(t2[0]) <= 1e-6 && t2[1] >= 0)) ? t2 : [-t2[0], -t2[1]];
      secX = vNorm([ex[0] * tPos[0] + ey[0] * tPos[1], ex[1] * tPos[0] + ey[1] * tPos[1], ex[2] * tPos[0] + ey[2] * tPos[1]]);
      secY = vNorm(vCross(dir, secX));
    }
    return { o, dir, x: secX, y: secY, look2, t2 };
  }
  function secCacheKey(sec) {
    const a = sec.a || [0, 0], b = sec.b || [10, 0];
    return `${sec.parent}|${r4(a[0])},${r4(a[1])}|${r4(b[0])},${r4(b[1])}|${sec.flip ? 1 : 0}`;
  }
  function collectNeededSections() {
    const map = new Map();
    for (const sh of sheets()) {
      for (const sec of sh.sections || []) {
        const key = secCacheKey(sec);
        if (!map.has(key)) {
          const sp = sectionPlaneSpec(sec);
          map.set(key, { key, o: sp.o, dir: sp.dir, x: sp.x, y: sp.y });
        }
      }
    }
    return [...map.values()];
  }
  async function ensureProjections() {
    if (!Model.activeItems(App.doc).length) {
      proj = null; projRev = App.revision; projSceneKey = null; projSigs.clear(); geoCache.clear(); shadeCache.clear();
      return;
    }
    if (loadingProjPromise) {
      await loadingProjPromise;
      return ensureProjections();
    }
    const specs = collectNeededViews();
    const allSecs = collectNeededSections();
    const scene = Model.kernelScene(App.doc);
    const sceneKey = JSON.stringify(scene);
    const rev = App.revision;
    const needFull = !proj || sceneKey !== projSceneKey;
    const missingViews = needFull ? specs : specs.filter((s) => !proj.views || !proj.views[s.key] || projSigs.get(s.key) !== s.sig);
    const existingSecs = (proj && proj.sections) || {};
    const missingSecs = needFull ? allSecs : allSecs.filter((s) => !existingSecs[s.key]);
    if (!needFull && !missingViews.length && !missingSecs.length) { projRev = rev; return; }
    loadingProjPromise = (async () => {
      try {
        if (needFull) {
          proj = await Kernel.call('project', { scene, views: specs.map((s) => s.spec), sections: allSecs });
          projSceneKey = sceneKey;
          projRev = rev;
          projSigs.clear();
          for (const s of specs) projSigs.set(s.key, s.sig);
          projId++;
          geoCache.clear();
          shadeCache.clear();
        } else {
          const res = await Kernel.call('project', {
            scene,
            views: missingViews.map((s) => s.spec),
            sections: missingSecs,
          });
          if (missingViews.length) {
            proj.views = proj.views || {};
            if (res && res.views) Object.assign(proj.views, res.views);
            for (const s of missingViews) {
              projSigs.set(s.key, s.sig);
              for (const ck of [...shadeCache.keys()]) if (ck.startsWith(s.key + '|')) shadeCache.delete(ck);
            }
          }
          if (missingSecs.length) {
            proj.sections = { ...(proj.sections || {}), ...((res && res.sections) || {}) };
          }
          projRev = rev;
          projId++;
        }
      } finally {
        loadingProjPromise = null;
      }
    })();
    await loadingProjPromise;
  }
  async function waitReady() {
    if (loadingProjPromise) await loadingProjPromise;
    await ensureProjections();
    if (holder) {
      render();
      if (App.mode === 'drawing') Panels.renderRight();
    }
  }
  async function refresh() {
    if (App.mode !== 'drawing') return;
    const prevProjId = projId;
    try {
      await ensureProjections();
    } catch (e) { UI.toast('Die Ansichten konnten nicht berechnet werden: ' + e.message, { kind: 'bad' }); }
    render();
    Panels.renderRight();
    const curLost = layout ? lostDims(dwg()) : [];
    const curLostKey = curLost.map((x) => x.id).sort().join(',');
    if (projId !== prevProjId && curLost.length) {
      const prevSet = new Set(lastLostKey ? lastLostKey.split(',') : []);
      const newlyLost = curLost.filter((x) => !prevSet.has(x.id));
      if (newlyLost.length) {
        UI.toast(`${newlyLost.length === 1 ? '1 Maß hat seine Kante verloren' : newlyLost.length + ' Maße haben ihre Kante verloren'} – siehe „Verlorene Maße“.`, { icon: 'warn', kind: 'warn', ms: 4000 });
      }
    }
    lastLostKey = curLostKey;
  }
  // ---------- Kanten aufräumen ----------
  // Die Projektion liefert viele Kanten doppelt (Vorder- und Hinterkante liegen übereinander) und verdeckte
  // Kanten genau unter sichtbaren. Übereinanderliegende Strichlinien sehen durchgezogen aus und ein
  // Laserschneider würde doppelt schneiden. Darum: Geraden und Kreisbögen exakt zusammenfassen,
  // verdeckte Teile unter sichtbaren entfernen, übrige Kurven entdoppeln.
  const TWO_PI = Math.PI * 2;
  const angOf = (c, p) => { let a = Math.atan2(p[1] - c[1], p[0] - c[0]); if (a < 0) a += TWO_PI; return a; };
  function arcPts(c, r, s, e) {
    const step = Math.max(0.0087, Math.min(0.087, 1 / Math.max(r, 1e-6)));
    const n = Math.max(4, Math.ceil((e - s) / step)); const out = [];
    for (let i = 0; i <= n; i++) { const a = s + ((e - s) * i) / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return out;
  }
  function cleanGeom(vis, hid) {
    const ptsOf = (e) => (e.kind === 'line' ? [e.a, e.b] : e.pts);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const arr of [vis, hid]) for (const e of arr) for (const q of ptsOf(e)) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    if (!isFinite(x0)) return { vis: [], hid: [] };
    const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
    const EPS = Math.max(0.003, diag * 1e-5);
    const union = (iv, tol) => { iv.sort((p, q) => p[0] - q[0]); const out = []; for (const [s, e] of iv) { const l = out[out.length - 1]; if (l && s <= l[1] + tol) { if (e > l[1]) l[1] = e; } else out.push([s, e]); } return out; };
    const minus = (iv, cut, tol) => { const out = []; for (const [s0, e] of iv) { let s = s0; for (const [cs, ce] of cut) { if (ce <= s + tol || cs >= e - tol) continue; if (cs > s + tol) out.push([s, cs]); s = Math.max(s, ce); if (s >= e - tol) break; } if (e - s > tol * 2) out.push([s, e]); } return out; };
    const bucket = (map, key, g) => { let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(g); };
    // Geraden: nach Richtung und Abstand gruppieren, Abschnitte als Intervalle
    const lines = new Map(), ASTEP = 1e-4;
    function lineGroup(a, b) {
      let th = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (th < -ASTEP / 2) th += Math.PI;
      if (th >= Math.PI - ASTEP / 2) th -= Math.PI;
      const nx = -Math.sin(th), ny = Math.cos(th);
      const d = ((a[0] + b[0]) * nx + (a[1] + b[1]) * ny) / 2;
      const ti = Math.round(th / ASTEP), di = Math.round(d / (EPS * 2));
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const l = lines.get(ti + i + ',' + (di + j)); if (!l) continue;
        for (const g of l) if (Math.abs(g.th - th) <= ASTEP * 1.5 && Math.abs(a[0] * g.nx + a[1] * g.ny - g.d) <= EPS && Math.abs(b[0] * g.nx + b[1] * g.ny - g.d) <= EPS) return g;
      }
      const g = { th, d, ux: Math.cos(th), uy: Math.sin(th), nx, ny, vis: [], hid: [], V: [] };
      bucket(lines, ti + ',' + di, g); return g;
    }
    const addLine = (a, b, w) => { const g = lineGroup(a, b); let t0 = a[0] * g.ux + a[1] * g.uy, t1 = b[0] * g.ux + b[1] * g.uy; if (t0 > t1) [t0, t1] = [t1, t0]; g[w].push([t0, t1]); };
    // Kreise und Bögen: nach Mittelpunkt und Radius gruppieren, Winkelintervalle
    const arcs = new Map();
    function arcGroup(c, r) {
      const S = EPS * 2, ci = Math.round(c[0] / S), cj = Math.round(c[1] / S), ri = Math.round(r / S);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = arcs.get(ci + i + ',' + (cj + j) + ',' + (ri + k)); if (!l) continue;
        for (const g of l) if (Math.hypot(g.c[0] - c[0], g.c[1] - c[1]) <= EPS * 1.5 && Math.abs(g.r - r) <= EPS * 1.5) return g;
      }
      const g = { c, r, vis: [], hid: [], V: [] };
      bucket(arcs, ci + ',' + cj + ',' + ri, g); return g;
    }
    function arcIv(e) {
      const P = e.pts; const a0 = angOf(e.c, P[0]), a1 = angOf(e.c, P[P.length - 1]), am = angOf(e.c, P[Math.floor(P.length / 2)]);
      const span = (s, t) => { let d = t - s; if (d < 0) d += TWO_PI; return d; };
      let s = a0, t = a1; if (span(a0, am) > span(a0, a1)) { s = a1; t = a0; }
      return t >= s ? [[s, t]] : [[s, TWO_PI], [0, t]];
    }
    // gerade Linienzüge erkennen (z. B. Kreise, die man von der Seite sieht)
    function straight(P) {
      if (!P || P.length < 2) return null;
      const far = (q) => { let best = q, bd = -1; for (const r of P) { const d = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2; if (d > bd) { bd = d; best = r; } } return best; };
      const a = far(P[0]), b = far(a); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < EPS) return null;
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (const q of P) if (Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny) > EPS) return null;
      return [a, b];
    }
    const curves = [];
    for (const [arr, w] of [[vis, 'vis'], [hid, 'hid']]) for (const e of arr) {
      if (e.kind === 'line') { if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) > EPS) addLine(e.a, e.b, w); continue; }
      const st = straight(e.pts); if (st) { addLine(st[0], st[1], w); continue; }
      if (e.kind === 'arc' && e.c && e.r > EPS) { arcGroup(e.c, e.r)[w].push(...(e.full ? [[0, TWO_PI]] : arcIv(e))); continue; }
      if (e.pts && e.pts.length > 1) curves.push({ pts: e.pts, w });
    }
    const outV = [], outH = [];
    for (const l of lines.values()) for (const g of l) {
      const P = (t) => [g.ux * t + g.nx * g.d, g.uy * t + g.ny * g.d];
      g.V = union(g.vis, EPS);
      for (const [s, e] of g.V) outV.push({ pts: [P(s), P(e)] });
      for (const [s, e] of minus(union(g.hid, EPS), g.V, EPS)) if (e - s > EPS * 4) outH.push({ pts: [P(s), P(e)] });
    }
    for (const l of arcs.values()) for (const g of l) {
      const tol = Math.min(0.01, EPS / g.r);
      g.V = union(g.vis, tol);
      const emit = (iv, out) => {
        if (!iv.length) return;
        if (iv.length === 1 && iv[0][0] <= tol && iv[0][1] >= TWO_PI - tol) { out.push({ pts: arcPts(g.c, g.r, 0, TWO_PI), c: g.c, r: g.r }); return; }
        const L = iv.map((x) => x.slice());
        if (L.length > 1 && L[0][0] <= tol && L[L.length - 1][1] >= TWO_PI - tol) { const first = L.shift(); L[L.length - 1][1] = first[1] + TWO_PI; }
        for (const [s, e] of L) if ((e - s) * g.r > EPS * 4) out.push({ pts: arcPts(g.c, g.r, s, e), c: g.c, r: g.r, arc: [s, e] });
      };
      emit(g.V, outV);
      emit(minus(union(g.hid, tol), g.V, tol), outH);
    }
    // übrige Kurven (Ellipsen, Splines)
    const qz = (x) => Math.round(x / (EPS * 25));
    const keyOf = (P) => {
      let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
      for (const p of P) { if (p[0] < a0) a0 = p[0]; if (p[0] > a1) a1 = p[0]; if (p[1] < b0) b0 = p[1]; if (p[1] > b1) b1 = p[1]; }
      const s = qz(P[0][0]) + ':' + qz(P[0][1]), e = qz(P[P.length - 1][0]) + ':' + qz(P[P.length - 1][1]);
      return (s < e ? s + '|' + e : e + '|' + s) + '|' + [a0, b0, a1, b1].map(qz).join(':');
    };
    const seen = new Set(), visCurves = [];
    for (const c of curves) if (c.w === 'vis') { const k = keyOf(c.pts); if (seen.has(k)) continue; seen.add(k); outV.push({ pts: c.pts }); visCurves.push(c.pts); }
    const hidCurves = curves.filter((c) => c.w === 'hid');
    if (hidCurves.length) {
      const TOL = Math.max(EPS * 6, 0.02);
      const cell = Math.max(TOL * 8, diag / 48), grid = new Map();
      for (const P of visCurves) for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i];
        const gx0 = Math.floor((Math.min(a[0], b[0]) - TOL) / cell), gx1 = Math.floor((Math.max(a[0], b[0]) + TOL) / cell), gy0 = Math.floor((Math.min(a[1], b[1]) - TOL) / cell), gy1 = Math.floor((Math.max(a[1], b[1]) + TOL) / cell);
        for (let x = gx0; x <= gx1; x++) for (let y = gy0; y <= gy1; y++) bucket(grid, x + ',' + y, [a, b]);
      }
      const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy; let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
      const covered = (p) => {
        const l = grid.get(Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell));
        if (l) for (const [a, b] of l) if (segD(p, a, b) <= TOL) return true;
        for (const gl of lines.values()) for (const g of gl) { if (!g.V.length || Math.abs(p[0] * g.nx + p[1] * g.ny - g.d) > TOL) continue; const t = p[0] * g.ux + p[1] * g.uy; for (const [s, e] of g.V) if (t >= s - TOL && t <= e + TOL) return true; }
        for (const gl of arcs.values()) for (const g of gl) { if (!g.V.length || Math.abs(Math.hypot(p[0] - g.c[0], p[1] - g.c[1]) - g.r) > TOL) continue; const a = angOf(g.c, p), at = TOL / g.r; for (const [s, e] of g.V) if (a >= s - at && a <= e + at) return true; }
        return false;
      };
      for (const c of hidCurves) {
        const k = keyOf(c.pts); if (seen.has(k)) continue; seen.add(k);
        // Abschnitte, deren beide Enden unter sichtbaren Kanten liegen, fallen weg
        const P = c.pts, cov = P.map(covered); let run = null;
        for (let i = 0; i < P.length - 1; i++) {
          if (cov[i] && cov[i + 1]) { if (run && run.length > 1) outH.push({ pts: run }); run = null; }
          else { if (!run) run = [P[i]]; run.push(P[i + 1]); }
        }
        if (run && run.length > 1) outH.push({ pts: run });
      }
    }
    return { vis: outV, hid: outH };
  }
  // ---------- Geometrie der Ansichten ----------
  const geoCache = new Map();
  function filterVisibleCenters(allCtrs, sh = dwg()) {
    if (!sh || !sh.centers) return [];
    const hid = new Set(sh.hiddenCenters || []);
    return (allCtrs || []).filter((c) => !hid.has(c.id));
  }
  function computeViewCenters(viewName, v, filterFn = null) {
    if (viewName === 'iso' || !v || !proj || !Array.isArray(proj.axes)) return [];
    const dir = new THREE.Vector3(...v.dir), ex = new THREE.Vector3(...v.x), ey = new THREE.Vector3(...v.y);
    const crosses = [];
    const lines2d = [];
    for (const a of proj.axes) {
      const d = new THREE.Vector3(...a.d).normalize();
      const o = new THREE.Vector3(...a.o);
      if (filterFn && !filterFn(a, o, d)) continue;
      const k = Math.abs(d.dot(dir));
      if (k > 0.995) {
        const c = [o.dot(ex), o.dot(ey)];
        const hit = crosses.find((cr) => Math.hypot(cr.c[0] - c[0], cr.c[1] - c[1]) < 0.05);
        if (hit) {
          hit.r = Math.max(hit.r, a.r);
          if (a.kind === 'cyl') hit.kind = 'cyl';
        } else {
          crosses.push({ type: 'cross', c, r: a.r, kind: a.kind || 'cyl' });
        }
      } else if (k < 0.95) {
        const p0 = o.clone().addScaledVector(d, a.t0), p1 = o.clone().addScaledVector(d, a.t1);
        let A = [p0.dot(ex), p0.dot(ey)], B = [p1.dot(ex), p1.dot(ey)];
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (L < 0.5) continue;
        if (A[0] > B[0] + 1e-6 || (Math.abs(A[0] - B[0]) <= 1e-6 && A[1] > B[1])) [A, B] = [B, A];
        const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
        let merged = null;
        for (const ln of lines2d) {
          if (Math.abs(ln.ux * ux + ln.uy * uy) <= 0.9995) continue;
          const perp = Math.abs((A[0] - ln.a[0]) * ln.nx + (A[1] - ln.a[1]) * ln.ny);
          if (perp >= 0.08) continue;
          const tA = (A[0] - ln.a[0]) * ln.ux + (A[1] - ln.a[1]) * ln.uy;
          const tB = (B[0] - ln.a[0]) * ln.ux + (B[1] - ln.a[1]) * ln.uy;
          const tMin = Math.min(tA, tB), tMax = Math.max(tA, tB);
          if (tMin <= ln.len + 0.5 && tMax >= -0.5) {
            const m0 = Math.min(0, tMin), m1 = Math.max(ln.len, tMax);
            let nA = [ln.a[0] + ln.ux * m0, ln.a[1] + ln.uy * m0];
            let nB = [ln.a[0] + ln.ux * m1, ln.a[1] + ln.uy * m1];
            if (nA[0] > nB[0] + 1e-6 || (Math.abs(nA[0] - nB[0]) <= 1e-6 && nA[1] > nB[1])) [nA, nB] = [nB, nA];
            const nL = Math.hypot(nB[0] - nA[0], nB[1] - nA[1]) || 1;
            ln.a = nA; ln.b = nB; ln.len = nL;
            ln.ux = (nB[0] - nA[0]) / nL; ln.uy = (nB[1] - nA[1]) / nL;
            ln.nx = -ln.uy; ln.ny = ln.ux;
            ln.r = Math.max(ln.r, a.r);
            if (a.kind === 'cyl') ln.kind = 'cyl';
            merged = ln;
            break;
          }
        }
        if (!merged) {
          lines2d.push({ type: 'line', a: A, b: B, len: L, ux, uy, nx: -uy, ny: ux, r: a.r, kind: a.kind || 'cyl' });
        }
      }
    }
    crosses.sort((p, q) => (p.c[0] - q.c[0]) || (p.c[1] - q.c[1]) || (p.r - q.r));
    lines2d.sort((p, q) => (p.a[0] - q.a[0]) || (p.a[1] - q.a[1]) || (p.b[0] - q.b[0]) || (p.b[1] - q.b[1]) || (p.r - q.r));
    const usedIds = new Set();
    const uniqId = (base) => {
      if (!usedIds.has(base)) { usedIds.add(base); return base; }
      let k = 2;
      while (usedIds.has(base + '|' + k)) k++;
      const out = base + '|' + k;
      usedIds.add(out);
      return out;
    };
    const out = [];
    for (const cr of crosses) {
      const id = uniqId('ctr|' + viewName + '|x|' + Math.round(cr.c[0] * 10) + ',' + Math.round(cr.c[1] * 10));
      out.push({ id, view: viewName, type: 'cross', kind: cr.kind, r: cr.r, c: cr.c });
    }
    for (const ln of lines2d) {
      const id = uniqId('ctr|' + viewName + '|l|' + [ln.a[0], ln.a[1], ln.b[0], ln.b[1]].map((q) => Math.round(q * 10)).join(','));
      out.push({ id, view: viewName, type: 'line', kind: ln.kind, r: ln.r, a: ln.a, b: ln.b });
    }
    return out;
  }
  function viewGeom(name, sh = dwg()) {
    if (!proj || !proj.views || !proj.views[name]) return null;
    const opts = viewOpts(sh, name);
    const is3d = is3dView(sh, name);
    // beim Bemaßen wird bei jeder Mausbewegung neu gezeichnet – die aufgeräumten Kanten merken
    const ck = name + '|' + projId + '|' + !!opts.hidden + '|' + !!opts.tangent + '|' + is3d;
    let g = geoCache.get(ck);
    if (!g) {
      if (geoCache.size > 32) geoCache.clear();
      g = viewGeom_(name, sh, opts, is3d);
      if (!g) return null;
      geoCache.set(ck, g);
    }
    return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh) };
  }
  function viewGeom_(name, sh = dwg(), opts = viewOpts(sh, name), is3d = is3dView(sh, name)) {
    const v = proj.views[name];
    const raw = (e) => (e.t === 'LINE' && e.a ? { kind: 'line', a: e.a, b: e.b } : e.t === 'CIRCLE' && e.c && e.pts ? { kind: 'arc', c: e.c, r: e.r, full: !!e.full, pts: e.pts } : e.pts ? { kind: 'curve', pts: e.pts } : null);
    const sharpVis = (v.visible || []).map(raw).filter(Boolean);
    const tanVis = (v.tangentVisible || []).map(raw).filter(Boolean);
    const sharpHid = (v.hidden || []).map(raw).filter(Boolean);
    const tanHid = (v.tangentHidden || []).map(raw).filter(Boolean);
    const cg1 = cleanGeom(sharpVis, opts.tangent ? tanVis : []);
    const polys = cg1.vis, tangents = opts.tangent ? cg1.hid : [];
    let hidden = [];
    if (opts.hidden) {
      const allVis = opts.tangent ? [...sharpVis, ...tanVis] : sharpVis;
      const allHid = opts.tangent ? [...sharpHid, ...tanHid] : sharpHid;
      hidden = cleanGeom(allVis, allHid).hid;
    }
    const circles = [], points = [];
    for (const arr of [polys, tangents]) for (const p of arr) {
      points.push(p.pts[0], p.pts[p.pts.length - 1]);
      if (p.c) { circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }); points.push(p.c); }
    }
    for (const p of hidden) points.push(p.pts[0], p.pts[p.pts.length - 1]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const arr of [polys, tangents, hidden]) for (const p of arr) for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    if (!isFinite(x0)) return null;
    // Mittellinien und kosmetische Gewinde (KP-20)
    const allCenters = is3d ? [] : computeViewCenters(name, v);
    const threads = [];
    if (!is3d) {
      const dir = new THREE.Vector3(...v.dir), ex = new THREE.Vector3(...v.x), ey = new THREE.Vector3(...v.y);
      const seenT = new Set();
      for (const th of docThreads()) {
        const k = Math.abs(th.d.dot(dir));
        if (k > 0.995) {
          const c = [th.p0.dot(ex), th.p0.dot(ey)];
          const key = 'e|' + Math.round(c[0] * 20) + ',' + Math.round(c[1] * 20) + '|' + th.size + '|' + th.kind;
          if (seenT.has(key)) continue; seenT.add(key);
          threads.push({ type: 'end', c, r: th.r, rThread: th.rThread, size: th.size, length: th.length, kind: th.kind });
        } else if (k < 0.05) {
          const a = [th.p0.dot(ex), th.p0.dot(ey)], b = [th.p1.dot(ex), th.p1.dot(ey)];
          const sA = Math.round(a[0] * 20) + ',' + Math.round(a[1] * 20), sB = Math.round(b[0] * 20) + ',' + Math.round(b[1] * 20);
          const key = 's|' + (sA < sB ? sA + '|' + sB : sB + '|' + sA) + '|' + th.size + '|' + th.kind;
          if (seenT.has(key)) continue; seenT.add(key);
          threads.push({ type: 'side', a, b, r: th.r, rThread: th.rThread, size: th.size, length: th.length, kind: th.kind });
        }
      }
    }
    return { polys, tangents, hidden, circles, points, allCenters, threads, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
  }
  function sectionGeom(sec, sh = dwg()) {
    const key = secCacheKey(sec);
    if (!proj || !proj.sections || !proj.sections[key]) return null;
    const viewName = 'sec_' + sec.id;
    const ck = 'sec|' + key + '|' + sec.id + '|' + projId + '|' + !!sh.hidden;
    let g = geoCache.get(ck);
    if (!g) {
      if (geoCache.size > 32) geoCache.clear();
      const v = proj.sections[key];
      const raw = (e) => (e.t === 'LINE' && e.a ? { kind: 'line', a: e.a, b: e.b } : e.t === 'CIRCLE' && e.c && e.pts ? { kind: 'arc', c: e.c, r: e.r, full: !!e.full, pts: e.pts } : e.pts ? { kind: 'curve', pts: e.pts } : null);
      const cg = cleanGeom((v.visible || []).map(raw).filter(Boolean), sh.hidden ? (v.hidden || []).map(raw).filter(Boolean) : []);
      const polys = cg.vis, hidden = cg.hid, circles = [], points = [];
      for (const p of polys) {
        points.push(p.pts[0], p.pts[p.pts.length - 1]);
        if (p.c) { circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }); points.push(p.c); }
      }
      for (const p of hidden) points.push(p.pts[0], p.pts[p.pts.length - 1]);
      const caps = v.caps || [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const arr of [polys, hidden]) for (const p of arr) for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      for (const cap of caps) {
        if (cap.bbox) { x0 = Math.min(x0, cap.bbox[0]); y0 = Math.min(y0, cap.bbox[1]); x1 = Math.max(x1, cap.bbox[2]); y1 = Math.max(y1, cap.bbox[3]); }
        for (const p of cap.outer || []) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      }
      if (!isFinite(x0)) return null;
      const sDir = new THREE.Vector3(...v.dir), oVec = new THREE.Vector3(...(v.o || [0, 0, 0]));
      const allCenters = computeViewCenters(viewName, v, (a, o, d) => {
        const p0 = o.clone().addScaledVector(d, a.t0), p1 = o.clone().addScaledVector(d, a.t1);
        const w0 = p0.sub(oVec).dot(sDir), w1 = p1.sub(oVec).dot(sDir);
        return Math.min(w0, w1) <= a.r + 0.5;
      });
      g = { polys, hidden, caps, circles, points, allCenters, threads: [], box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
      geoCache.set(ck, g);
    }
    return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh) };
  }
  function docThreads() {
    const out = [], V = Model.vars(App.doc).v;
    Model.walk(App.doc.items, (it) => {
      if (it.role === 'hole' || it.suppressed || !Model.isActive(App.doc, it.id) || !it.threads || !it.threads.length) return;
      const mats = Model.instanceMatrices(App.doc, it.id, V);
      for (const th of it.threads) {
        const fi = Viewer.threadFaceIndex(it.id, th);
        const g = (fi >= 0 && Viewer.cylinderFaceInfo(it.id, fi)) || (Array.isArray(th.axis) && th.axis.length >= 6 ? {
          o: th.axis.slice(0, 3), d: th.axis.slice(3, 6), r: th.r || 3, t0: th.t0 ?? 0, t1: th.t1 ?? 10, faceLen: Math.max(0.1, (th.t1 ?? 10) - (th.t0 ?? 0)), kind: th.kind || 'ext',
        } : null);
        if (!g) continue;
        const kind = th.kind || g.kind || 'ext';
        const L = clamp(Number(th.length) || g.faceLen, 0.2, g.faceLen);
        const s0 = th.from === 'bottom' ? g.t0 : g.t1 - L;
        const s1 = th.from === 'bottom' ? g.t0 + L : g.t1;
        const spec = THREAD_MAP[th.size];
        const rThread = kind === 'int' ? (spec ? spec.d / 2 : g.r * 1.15) : (spec ? spec.core / 2 : g.r * 0.85);
        const dL = new THREE.Vector3(...g.d).normalize();
        const p0L = new THREE.Vector3(...g.o).addScaledVector(dL, s0);
        const p1L = new THREE.Vector3(...g.o).addScaledVector(dL, s1);
        for (const M of mats) {
          const p0 = p0L.clone().applyMatrix4(M), p1 = p1L.clone().applyMatrix4(M);
          out.push({ p0, p1, d: p1.clone().sub(p0).normalize(), r: g.r, rThread, size: th.size, length: L, kind });
        }
      }
    });
    return out;
  }
  function freeGeom(sh = dwg()) {
    if (!sh.free.length) return null;
    const polys = [], circles = [], points = [];
    for (const e of sh.free) {
      if (e.type === 'text') continue;
      for (const s of SK.segsOf(e)) {
        const pts = SK.segPoints(s);
        if (s.t === 'circle') { polys.push({ pts, c: s.c, r: s.r }); circles.push({ c: s.c, r: s.r, full: true }); points.push(s.c); }
        else if (s.t === 'arc') {
          const ai = SK.arcInfo(s.a, s.m, s.b);
          if (ai) { const st = ai.sweep > 0 ? ai.a0 : ai.a0 + ai.sweep; const arc = [st, st + Math.abs(ai.sweep)]; polys.push({ pts, c: ai.c, r: ai.r, arc }); circles.push({ c: ai.c, r: ai.r, full: false, arc }); points.push(ai.c); }
          else polys.push({ pts });
        } else polys.push({ pts });
        points.push(pts[0], pts[pts.length - 1]);
      }
    }
    for (const e of sh.free) if (e.type === 'text') points.push(e.p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polys) for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    for (const e of sh.free) if (e.type === 'text') { x0 = Math.min(x0, e.p[0]); y0 = Math.min(y0, e.p[1]); x1 = Math.max(x1, e.p[0] + 10); y1 = Math.max(y1, e.p[1] + 5); }
    if (!isFinite(x0)) { x0 = -10; y0 = -10; x1 = 10; y1 = 10; }
    return { polys, hidden: [], circles, points, centers: [], allCenters: [], box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
  }
  // ---------- Detailansichten (ZE-03) ----------
  function details(sh = dwg()) { return sh.details || []; }
  function cleanDetailLabel(raw, fallback = 'Z') {
    const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
    return s || fallback;
  }
  function nextDetailLabel(sh = dwg()) {
    const used = new Set((sh.details || []).map((x) => String(x.label || '').toUpperCase()));
    const free = DETAIL_LETTERS.find((ch) => !used.has(ch));
    if (free) return free;
    let n = (sh.details || []).length + 1;
    while (used.has('Z' + n)) n++;
    return 'Z' + n;
  }
  function defaultDetailScale(lay = layout) {
    const s = lay ? lay.s : 1;
    for (const sc of [2, 4, 5, 10, 20]) if (sc >= s * 2 - 1e-6) return sc;
    return 20;
  }
  function addDetail(opts = {}) {
    if (!opts || !['front', 'top', 'left'].includes(opts.source) || !Array.isArray(opts.c) || !(Number(opts.r) > 0.1)) return null;
    const det = {
      id: uid('det'),
      label: cleanDetailLabel(opts.label, nextDetailLabel()),
      source: opts.source,
      c: [Number(opts.c[0]), Number(opts.c[1])],
      r: Math.max(0.2, Number(opts.r)),
      scale: Math.max(0.1, Number(opts.scale) || defaultDetailScale()),
      pos: Array.isArray(opts.pos) ? [Number(opts.pos[0]), Number(opts.pos[1])] : null,
    };
    App.change('Detailansicht hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.details)) d.details = [];
      d.details.push(det);
    });
    selDim = det.id;
    render(); Panels.renderRight();
    return det;
  }
  function updateDetail(id, patch = {}) {
    let changed = false;
    App.change('Detailansicht geändert', () => {
      const det = (dwg().details || []).find((x) => x.id === id);
      if (!det) return;
      if (patch.label != null) {
        const lbl = cleanDetailLabel(patch.label, det.label);
        if (lbl !== det.label) { det.label = lbl; changed = true; }
      }
      if (patch.scale != null && Number(patch.scale) > 0) {
        det.scale = Number(patch.scale); changed = true;
      }
      if (patch.r != null && Number(patch.r) > 0.2) {
        det.r = Math.max(0.2, Number(patch.r)); changed = true;
      }
      if (Array.isArray(patch.c) && patch.c.length >= 2) {
        det.c = [Number(patch.c[0]), Number(patch.c[1])]; changed = true;
      }
      if (patch.pos === null) { det.pos = null; changed = true; }
      else if (Array.isArray(patch.pos) && patch.pos.length >= 2) {
        det.pos = [Number(patch.pos[0]), Number(patch.pos[1])]; changed = true;
      }
    });
    if (changed) { render(); Panels.renderRight(); }
    return changed;
  }
  function removeDetail(id) {
    App.change('Detailansicht gelöscht', () => {
      const d = dwg();
      d.details = (d.details || []).filter((x) => x.id !== id);
      d.dims = d.dims.filter((x) => x.view !== id);
      d.notes = (d.notes || []).filter((x) => x.view !== id);
      d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|' + id + '|'));
    });
    if (selDim === id) selDim = null;
    render(); Panels.renderRight();
  }
  function clipSegCircle(a, b, cx, cy, R) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const fx = a[0] - cx, fy = a[1] - cy;
    const A = dx * dx + dy * dy;
    if (A < 1e-12) return null;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - R * R;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const sq = Math.sqrt(disc);
    const t0 = Math.max(0, (-B - sq) / (2 * A));
    const t1 = Math.min(1, (-B + sq) / (2 * A));
    if (t1 - t0 <= 1e-9) return null;
    const P0 = [a[0] + t0 * dx, a[1] + t0 * dy];
    const P1 = [a[0] + t1 * dx, a[1] + t1 * dy];
    if (Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) <= 1e-6) return null;
    return [P0, P1];
  }
  function clipPolyCircle(pts, cx, cy, R) {
    const out = [];
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = clipSegCircle(pts[i], pts[i + 1], cx, cy, R);
      if (!seg) {
        if (run && run.length > 1) out.push({ pts: run });
        run = null;
        continue;
      }
      if (run && Math.hypot(run[run.length - 1][0] - seg[0][0], run[run.length - 1][1] - seg[0][1]) <= 1e-5) {
        run.push(seg[1]);
      } else {
        if (run && run.length > 1) out.push({ pts: run });
        run = [seg[0], seg[1]];
      }
    }
    if (run && run.length > 1) out.push({ pts: run });
    return out;
  }
  function normAngleIntervals(a, b) {
    if (b - a >= TWO_PI - 1e-7) return [[0, TWO_PI]];
    let s = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    let e = s + (b - a);
    if (e <= TWO_PI + 1e-9) return [[s, Math.min(TWO_PI, e)]];
    return [[s, TWO_PI], [0, e - TWO_PI]];
  }
  function intersectIntervals(A, B) {
    const raw = [];
    for (const [a0, a1] of A) for (const [b0, b1] of B) {
      const s = Math.max(a0, b0), e = Math.min(a1, b1);
      if (e - s > 1e-6) raw.push([s, e]);
    }
    raw.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [s, e] of raw) {
      const last = out[out.length - 1];
      if (last && s <= last[1] + 1e-6) last[1] = Math.max(last[1], e);
      else out.push([s, e]);
    }
    if (out.length > 1 && out[0][0] <= 1e-6 && out[out.length - 1][1] >= TWO_PI - 1e-6) {
      const first = out.shift();
      out[out.length - 1][1] = first[1] + TWO_PI;
    }
    return out;
  }
  function clipArcCircle(item, cx, cy, R) {
    const [ox, oy] = item.c, cr = item.r;
    const d = Math.hypot(ox - cx, oy - cy);
    if (d < 1e-9) return cr <= R + 1e-6 ? [item] : [];
    const rhs = (R * R - d * d - cr * cr) / (2 * d * cr);
    if (rhs >= 1 - 1e-9) return [item];
    if (rhs <= -1 + 1e-9) return [];
    const phi = Math.atan2(oy - cy, ox - cx);
    const alpha = Math.acos(clamp(rhs, -1, 1));
    const allowed = normAngleIntervals(phi + alpha, phi + TWO_PI - alpha);
    const srcIv = item.arc ? normAngleIntervals(item.arc[0], item.arc[1]) : [[0, TWO_PI]];
    const kept = intersectIntervals(srcIv, allowed);
    const out = [];
    for (const [s, e] of kept) {
      if ((e - s) * cr <= 1e-4) continue;
      if (!item.arc && e - s >= TWO_PI - 1e-5) { out.push({ pts: arcPts(item.c, cr, 0, TWO_PI), c: item.c, r: cr }); continue; }
      out.push({ pts: arcPts(item.c, cr, s, e), c: item.c, r: cr, arc: [s, e] });
    }
    return out;
  }
  function clipViewGeomToCircle(srcGeo, c, r, detId = '', sh = null) {
    const [cx, cy] = c, R = r;
    const polys = [], tangents = [], hidden = [], circles = [], points = [], allCenters = [], threads = [];
    for (const p of srcGeo.polys || []) {
      if (p.c) polys.push(...clipArcCircle(p, cx, cy, R));
      else polys.push(...clipPolyCircle(p.pts, cx, cy, R));
    }
    for (const p of srcGeo.tangents || []) {
      if (p.c) tangents.push(...clipArcCircle(p, cx, cy, R));
      else tangents.push(...clipPolyCircle(p.pts, cx, cy, R));
    }
    for (const p of srcGeo.hidden || []) {
      if (p.c) hidden.push(...clipArcCircle(p, cx, cy, R));
      else hidden.push(...clipPolyCircle(p.pts, cx, cy, R));
    }
    for (const p of polys) {
      if (p.c) circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc });
    }
    for (const q of srcGeo.points || []) {
      if (Math.hypot(q[0] - cx, q[1] - cy) <= R + 1e-4) points.push(q);
    }
    for (const cc of circles) {
      if (Math.hypot(cc.c[0] - cx, cc.c[1] - cy) <= R + 1e-4) points.push(cc.c);
    }
    for (const ctr of srcGeo.centers || []) {
      const cid = detId && ctr.id ? 'ctr|' + detId + '|' + ctr.id.split('|').slice(2).join('|') : ctr.id;
      if (ctr.type === 'cross') {
        if (Math.hypot(ctr.c[0] - cx, ctr.c[1] - cy) + ctr.r <= R + 1e-4) {
          allCenters.push({ type: 'cross', c: ctr.c, r: ctr.r, kind: ctr.kind, id: cid, view: detId || ctr.view });
        } else {
          const hSeg = clipSegCircle([ctr.c[0] - ctr.r, ctr.c[1]], [ctr.c[0] + ctr.r, ctr.c[1]], cx, cy, R);
          const vSeg = clipSegCircle([ctr.c[0], ctr.c[1] - ctr.r], [ctr.c[0], ctr.c[1] + ctr.r], cx, cy, R);
          if (hSeg) allCenters.push({ type: 'line', a: hSeg[0], b: hSeg[1], noExt: true, kind: ctr.kind, r: ctr.r, id: cid, view: detId || ctr.view, ctrGroup: 'cross' });
          if (vSeg) allCenters.push({ type: 'line', a: vSeg[0], b: vSeg[1], noExt: true, kind: ctr.kind, r: ctr.r, id: cid, view: detId || ctr.view, ctrGroup: 'cross' });
        }
      } else {
        const seg = clipSegCircle(ctr.a, ctr.b, cx, cy, R);
        if (seg) allCenters.push({ type: 'line', a: seg[0], b: seg[1], noExt: true, kind: ctr.kind, r: ctr.r, id: cid, view: detId || ctr.view });
      }
    }
    for (const th of srcGeo.threads || []) {
      if (th.type === 'end') {
        if (Math.hypot(th.c[0] - cx, th.c[1] - cy) + th.rThread <= R + 1e-4) threads.push(th);
      } else if (th.type === 'side') {
        const seg = clipSegCircle(th.a, th.b, cx, cy, R);
        if (seg && Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > 0.2) threads.push({ ...th, a: seg[0], b: seg[1] });
      }
    }
    const centers = sh ? filterVisibleCenters(allCenters, sh) : allCenters.slice();
    return { polys, tangents, hidden, circles, points, centers, allCenters, threads, box: [cx - R, cy - R, cx + R, cy + R], w: 2 * R, h: 2 * R };
  }
  function placeDetailAuto(R, frame, occupied) {
    const xMin = frame.x + R + 5, xMax = frame.x + frame.w - R - 5;
    const yMin = frame.y + R + 10, yMax = frame.y + frame.h - R - 7;
    if (xMin > xMax || yMin > yMax) return [frame.x + frame.w - Math.max(15, R + 8), frame.y + Math.max(15, R + 10)];
    const overlap = (cx, cy) => {
      const x0 = cx - R - 5, y0 = cy - R - 9, x1 = cx + R + 5, y1 = cy + R + 6;
      let area = 0;
      for (const b of occupied) {
        const ox = Math.max(0, Math.min(x1, b[0] + b[2]) - Math.max(x0, b[0]));
        const oy = Math.max(0, Math.min(y1, b[1] + b[3]) - Math.max(y0, b[1]));
        area += ox * oy;
      }
      return area;
    };
    let best = [xMax, yMin], bestArea = Infinity;
    for (let x = xMax; x >= xMin - 0.1; x -= 12) {
      for (let y = yMin; y <= yMax + 0.1; y += 12) {
        const cx = clamp(x, xMin, xMax), cy = clamp(y, yMin, yMax);
        const a = overlap(cx, cy);
        if (a === 0) return [cx, cy];
        if (a < bestArea) { bestArea = a; best = [cx, cy]; }
      }
    }
    return best;
  }
  function layoutSheet(sh, s, G, extras, secGeos, area) {
    const gap = 22;
    const views = {};
    const occ = [];
    const addOcc = (px, py, vw, vh, pad = 8, padBot = 10) => occ.push([px - pad, py - pad, px + vw + pad, py + vh + padBot]);
    const hits = (r) => {
      if (r[0] < area.x + 2 || r[1] < area.y + 2 || r[2] > area.x + area.w - 2 || r[3] > area.y + area.h - 2) return true;
      for (const o of occ) if (r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]) return true;
      return false;
    };
    const oF = viewOpts(sh, 'front'), oT = viewOpts(sh, 'top'), oL = viewOpts(sh, 'left');
    const scOf = (opts, baseS) => (typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : baseS);
    const place = (name, geo, sc, px, py, opts, label, is3d, pad = 8, padBot = 10) => {
      const vw = geo.w * sc, vh = geo.h * sc;
      views[name] = {
        geo, s: sc, ox: px - geo.box[0] * sc, oy: py + geo.box[3] * sc,
        noDims: is3d, is3d, opts, label,
        customScale: typeof opts.scale === 'number' && opts.scale > 0,
        rect: [px, py, px + vw, py + vh],
      };
      addOcc(px, py, vw, vh, pad, padBot);
    };
    const main = G.front || G.top || G.left;
    const placeExtra = (ex, rx, ry, aw, ah) => {
      if (aw < 16 || ah < 16) return;
      let si;
      if (typeof ex.opts.scale === 'number' && ex.opts.scale > 0) si = ex.opts.scale;
      else {
        const start = main ? s : 1;
        if (ex.geo.w * start <= aw && ex.geo.h * start <= ah) si = start;
        else {
          si = SCALES.find((sc) => sc <= start && ex.geo.w * sc <= aw && ex.geo.h * sc <= ah);
          if (!si) si = Math.max(0.01, Math.min(aw / Math.max(1e-6, ex.geo.w), ah / Math.max(1e-6, ex.geo.h)) * 0.92);
        }
      }
      const px = rx + (aw - ex.geo.w * si) / 2;
      const py = ry + (ah - ex.geo.h * si) / 2;
      place(ex.id, ex.geo, si, px, py, ex.opts, ex.label, true, 4, 4);
    };
    let x0 = area.x + 12, y0 = area.y + 12, fw = 0, fh = 0, lw = 0, th = 0;
    if (main) {
      const sf = scOf(oF, s), st = scOf(oT, s), sl = scOf(oL, s);
      fw = G.front ? G.front.w * sf : G.top.w * st; fh = G.front ? G.front.h * sf : 0;
      lw = G.left ? G.left.w * sl : 0; th = G.top ? G.top.h * st : 0;
      const totalW = fw + (G.left ? gap + lw : 0), totalH = fh + (G.top ? gap + th : 0);
      const room = extras.length ? 0.68 : secGeos.length ? 0.72 : 1;
      x0 = area.x + Math.max(12, (area.w * room - totalW) / 2);
      y0 = area.y + Math.max(12, (area.h - totalH) / 2);
      if (G.front) place('front', G.front, sf, x0, y0, oF, viewLabel('front', sh), false);
      if (G.left) {
        const py = G.front ? (sl === sf ? y0 + (G.front.box[3] - G.left.box[3]) * sf : y0 + (fh - G.left.h * sl) / 2) : y0;
        place('left', G.left, sl, x0 + fw + gap, py, oL, viewLabel('left', sh), false);
        if (G.front && sl === sf) views.left.oy = views.front.oy;
      }
      if (G.top) {
        const px = G.front && st !== sf ? x0 + (fw - G.top.w * st) / 2 : x0;
        place('top', G.top, st, px, y0 + fh + (G.front ? gap : 0), oT, viewLabel('top', sh), false);
        if (G.front && st === sf) views.top.ox = views.front.ox;
      }
      if (extras.length === 1 && G.front && G.left && G.top && !secGeos.length) {
        const rx = x0 + fw + gap, ry = y0 + fh + gap;
        placeExtra(extras[0], rx, ry, area.x + area.w - rx - 6, area.y + area.h - ry - 10);
      } else if (extras.length) {
        const rx = x0 + totalW + gap;
        const aw = area.x + area.w - rx - 6;
        const slotH = (area.h - 6) / extras.length;
        for (let i = 0; i < extras.length; i++) placeExtra(extras[i], rx, area.y + i * slotH, aw, slotH - 10);
      }
    } else if (extras.length) {
      const cols = Math.min(extras.length, 2), rows = Math.ceil(extras.length / cols);
      const cw = (area.w - (cols - 1) * 14) / cols, ch = (area.h - (rows - 1) * 12) / rows;
      for (let i = 0; i < extras.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        placeExtra(extras[i], area.x + col * (cw + 14), area.y + row * (ch + 12), cw, ch - 10);
      }
    }
    let fits = true;
    for (const { sec, geo } of secGeos) {
      const vw = geo.w * s, vh = geo.h * s;
      let px = null, py = null;
      if (dragView && dragView.kind === 'section' && dragView.secId === sec.id && dragView.curPos) {
        px = dragView.curPos[0]; py = dragView.curPos[1];
      } else if (Array.isArray(sec.pos) && sec.pos.length >= 2) {
        px = sec.pos[0]; py = sec.pos[1];
      } else {
        const pv = views[sec.parent];
        const pcx = pv ? pv.ox + ((pv.geo.box[0] + pv.geo.box[2]) * 0.5) * pv.s : area.x + area.w * 0.5;
        const pcy = pv ? pv.oy - ((pv.geo.box[1] + pv.geo.box[3]) * 0.5) * pv.s : area.y + area.h * 0.5;
        const cands = [];
        if (G.left) cands.push([x0 + fw + gap + lw + gap, y0]);
        if (G.front || G.top) cands.push([x0 + fw + gap, y0 + fh + gap]);
        if (G.top) cands.push([x0, y0 + fh + gap + th + gap]);
        cands.push([x0 + fw + gap, y0]);
        for (let gy = area.y + 8; gy <= area.y + area.h - vh - 14; gy += 14) {
          for (let gx = area.x + 8; gx <= area.x + area.w - vw - 8; gx += 14) cands.push([gx, gy]);
        }
        let best = null, bestD = Infinity;
        for (const [cx, cy] of cands) {
          const rect = [cx - 6, cy - 6, cx + vw + 6, cy + vh + 12];
          if (hits(rect)) continue;
          const d = Math.hypot(cx + vw * 0.5 - pcx, cy + vh * 0.5 - pcy);
          if (d < bestD) { bestD = d; best = [cx, cy]; }
        }
        if (best) { px = best[0]; py = best[1]; }
        else {
          fits = false;
          px = Math.min(area.x + area.w - vw - 8, x0 + fw + (G.left ? gap + lw + gap : gap));
          py = area.y + 12;
        }
      }
      views['sec_' + sec.id] = {
        geo, s,
        ox: px - geo.box[0] * s,
        oy: py + geo.box[3] * s,
        isSection: true,
        section: sec,
      };
      addOcc(px, py, vw, vh, 6, 12);
    }
    return { views, fits };
  }
  function computeLayout(sh = dwg()) {
    const [W, H] = sheetSize(sh);
    // ISO 5457: Heft-Rand links 20 mm; übrige Ränder 10 mm bei A4–A2, 20 mm bei A1–A0
    const m = sh.sheet === 'A1' || sh.sheet === 'A0' ? 20 : 10;
    const frame = { x: 20, y: m, w: W - 20 - m, h: H - 2 * m };
    const tb = { w: Math.min(180, frame.w), h: 32 };
    const area = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - tb.h - 16 };
    const G = {
      front: sh.views.front ? viewGeom('front', sh) : null,
      top: sh.views.top ? viewGeom('top', sh) : null,
      left: sh.views.left ? viewGeom('left', sh) : null,
      iso: sh.views.iso ? viewGeom('iso', sh) : null,
      free: freeGeom(sh),
    };
    const extras = [];
    if (G.iso) extras.push({ id: 'iso', geo: G.iso, opts: viewOpts(sh, 'iso'), label: viewLabel('iso', sh) });
    for (const ev of sh.extraViews || []) {
      const geo = viewGeom(ev.id, sh);
      if (geo) extras.push({ id: ev.id, geo, opts: viewOpts(sh, ev.id), label: ev.name });
    }
    const secGeos = (sh.sections || []).map((sec) => ({ sec, geo: sectionGeom(sec, sh) })).filter((x) => x.geo);
    const oF = viewOpts(sh, 'front'), oT = viewOpts(sh, 'top'), oL = viewOpts(sh, 'left');
    const scOf = (opts, baseS) => (typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : baseS);
    const main = G.front || G.top || G.left;
    let s = 1;
    const gap = 22;
    const needW = (sc) => (G.front ? G.front.w * scOf(oF, sc) : G.top ? G.top.w * scOf(oT, sc) : 0) + (G.left ? gap + G.left.w * scOf(oL, sc) : 0);
    const needH = (sc) => (G.front ? G.front.h * scOf(oF, sc) : G.left ? G.left.h * scOf(oL, sc) : 0) + (G.top ? gap + G.top.h * scOf(oT, sc) : 0);
    const extraRoom = extras.length > 1 || (extras.length && !G.top) ? 0.35 : 0;
    let views = {};
    if (!secGeos.length) {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main) { s = 1; break; }
          if (needW(sc) + 24 <= area.w * (1 - extraRoom) && needH(sc) + 24 <= area.h) { s = sc; break; }
        }
      } else s = +sh.scale || 1;
      views = layoutSheet(sh, s, G, extras, [], area).views;
    } else {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main && !secGeos.length) { s = 1; break; }
          if (main && (needW(sc) + 24 > area.w * 0.78 || needH(sc) + 24 > area.h)) continue;
          const tryLay = layoutSheet(sh, sc, G, extras, secGeos, area);
          if (tryLay.fits) { s = sc; views = tryLay.views; break; }
        }
        if (!Object.keys(views).length) views = layoutSheet(sh, s, G, extras, secGeos, area).views;
      } else {
        s = +sh.scale || 1;
        views = layoutSheet(sh, s, G, extras, secGeos, area).views;
      }
    }
    const vp = sh.viewPos || {};
    for (const name of ['front', 'top', 'left', 'iso', ...(sh.extraViews || []).map((e) => e.id)]) {
      const v = views[name];
      if (!v) continue;
      const off = (dragView && dragView.kind === 'main' && dragView.name === name && dragView.curOff) ? dragView.curOff : vp[name];
      if (Array.isArray(off) && off.length >= 2) {
        const dx = Number(off[0]) || 0, dy = Number(off[1]) || 0;
        v.ox += dx;
        v.oy += dy;
        if (Array.isArray(v.rect)) v.rect = [v.rect[0] + dx, v.rect[1] + dy, v.rect[2] + dx, v.rect[3] + dy];
      }
    }
    // Detailansichten platzieren
    if (Array.isArray(sh.details) && sh.details.length) {
      const occupied = [[frame.x + frame.w - tb.w - 4, frame.y + frame.h - tb.h - 4, tb.w + 4, tb.h + 4]];
      for (const [k, v] of Object.entries(views)) {
        const b = v.geo.box;
        occupied.push([v.ox + b[0] * v.s - 8, v.oy - b[3] * v.s - 8, (b[2] - b[0]) * v.s + 16, (b[3] - b[1]) * v.s + 16]);
      }
      for (const det of sh.details) {
        const srcGeo = G[det.source];
        if (!srcGeo || !views[det.source]) continue;
        const detGeo = clipViewGeomToCircle(srcGeo, det.c, det.r, det.id, sh);
        const ds = Math.max(0.1, Number(det.scale) || 2);
        const R = det.r * ds;
        let pos;
        if (dragDetail && dragDetail.id === det.id && dragDetail.curPos) pos = dragDetail.curPos;
        else if (Array.isArray(det.pos)) pos = [clamp(det.pos[0], frame.x + 8, frame.x + frame.w - 8), clamp(det.pos[1], frame.y + 10, frame.y + frame.h - 8)];
        else pos = placeDetailAuto(R, frame, occupied);
        views[det.id] = { geo: detGeo, s: ds, ox: pos[0] - det.c[0] * ds, oy: pos[1] + det.c[1] * ds, detail: det, sheetCenter: pos, sheetR: R };
        occupied.push([pos[0] - R - 5, pos[1] - R - 9, 2 * R + 10, 2 * R + 15]);
      }
    }
    // frei Gezeichnetes liegt fest auf dem Papier: Millimeter ab der linken unteren Blattecke, 1:1
    if (G.free) views.free = { geo: G.free, s: 1, ox: 0, oy: H };
    return { W, H, frame, tb, area, s, views };
  }
  const toSheet = (v, p) => [v.ox + p[0] * v.s, v.oy - p[1] * v.s];
  const toView = (v, P) => [(P[0] - v.ox) / v.s, (v.oy - P[1]) / v.s];

  // ---------- Toleranzen & ISO-286-Passungen (ZE-08, ZE-09) ----------
  function decNeeded(v) {
    const r = Math.round(Math.abs(v) * 10000) / 10000;
    if (r < 1e-9) return 0;
    const s = r.toFixed(4).replace(/\.?0+$/, '');
    const dot = s.indexOf('.');
    return dot >= 0 ? s.length - dot - 1 : 0;
  }
  function fmtTolVal(vDisp, dec) {
    const r = round(vDisp, dec);
    const clean = Object.is(r, -0) ? 0 : r;
    return clean.toFixed(dec).replace('.', ',');
  }
  function fmtDevPair(upperMm, lowerMm, { minDec = 0 } = {}) {
    const u = Units.fromMM(upperMm);
    const l = Units.fromMM(lowerMm);
    const isZero = (v) => Math.abs(round(v, 4)) < 1e-9;
    const dec = Units.key() === 'mm'
      ? Math.max(minDec, decNeeded(u), decNeeded(l))
      : Math.max(minDec, Units.def().dec, decNeeded(u), decNeeded(l));
    const fmtOne = (v) => {
      if (isZero(v)) return '0';
      return (v > 0 ? '+' : '\u2212') + fmtTolVal(Math.abs(v), dec);
    };
    return { upStr: fmtOne(u), loStr: fmtOne(l), dec };
  }
  function fmtLimitsPair(nominalMm, upperMm, lowerMm, { minDec = 0 } = {}) {
    const loMm = Math.min(upperMm, lowerMm);
    const hiMm = Math.max(upperMm, lowerMm);
    const hi = Units.fromMM(nominalMm + hiMm);
    const lo = Units.fromMM(nominalMm + loMm);
    const dec = Units.key() === 'mm'
      ? Math.max(minDec, decNeeded(hi), decNeeded(lo))
      : Math.max(minDec, Units.def().dec, decNeeded(hi), decNeeded(lo));
    return { maxStr: fmtTolVal(hi, dec), minStr: fmtTolVal(lo, dec), dec };
  }
  function fmtSymVal(symMm) {
    const v = Math.abs(Units.fromMM(symMm));
    const dec = Units.key() === 'mm' ? Math.max(1, decNeeded(v)) : Math.max(Units.def().dec, decNeeded(v));
    return fmtFixed(v, dec);
  }
  function iso286(code, nominalMm) {
    const classes = (ISO286_DATA && ISO286_DATA.klassen) || {};
    const raw = String(code || '').trim();
    const key = classes[raw] ? raw : Object.keys(classes).find((k) => k.toLowerCase() === raw.toLowerCase());
    const entry = key ? classes[key] : null;
    if (!entry) return null;
    const nom = Number(nominalMm);
    const steps = (ISO286_DATA && ISO286_DATA.stufen_mm) || [];
    if (!(nom > 0) || !steps.length || nom > steps[steps.length - 1]) {
      return {
        code: key,
        kind: entry.art,
        hint: entry.hinweis || '',
        norm: ISO286_DATA.norm || 'DIN EN ISO 286-2:2010',
        sources: ISO286_DATA._quellen || [],
        outOfRange: true,
      };
    }
    const idx = steps.findIndex((hi) => nom <= hi);
    const pair = entry.abmasse_um[idx];
    const upperUm = pair[0], lowerUm = pair[1];
    const upperMm = upperUm / 1000, lowerMm = lowerUm / 1000;
    const rangeMin = idx === 0 ? 0 : steps[idx - 1];
    const rangeMax = steps[idx];
    const minDec = (!Number.isInteger(upperUm) || !Number.isInteger(lowerUm)) ? 4 : 3;
    const dev = fmtDevPair(upperMm, lowerMm, { minDec });
    const lim = fmtLimitsPair(nom, upperMm, lowerMm, { minDec });
    return {
      code: key,
      kind: entry.art,
      hint: entry.hinweis || '',
      norm: ISO286_DATA.norm || 'DIN EN ISO 286-2:2010',
      sources: ISO286_DATA._quellen || [],
      rangeMin,
      rangeMax,
      upperUm,
      lowerUm,
      upperMm,
      lowerMm,
      minMm: nom + lowerMm,
      maxMm: nom + upperMm,
      upStr: dev.upStr,
      loStr: dev.loStr,
      minStr: lim.minStr,
      maxStr: lim.maxStr,
      outOfRange: false,
    };
  }
  function dimNominal(dim) {
    if (!dim) return 0;
    if (dim.type === 'dia') return Number(dim.r || 0) * 2;
    if (dim.type === 'rad') return Number(dim.r || 0);
    if (dim.type === 'lin') {
      if (dim.dir === 'h') return Math.abs(dim.b[0] - dim.a[0]);
      if (dim.dir === 'v') return Math.abs(dim.b[1] - dim.a[1]);
      return Math.hypot(dim.b[0] - dim.a[0], dim.b[1] - dim.a[1]);
    }
    return 0;
  }
  function dimLabelParts(dim, nominalMm, st = sheetDimStyle()) {
    const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
    if (dim.type === 'dia' || dim.type === 'rad') {
      if (dim.threadLabel) return { mainLabel: countPrefix + dim.threadLabel, prefix: '', isThread: true };
      const prefix = dim.type === 'dia' ? 'Ø' : 'R';
      return { mainLabel: countPrefix + prefix + fmtDim(nominalMm, st), prefix, isThread: false };
    }
    return { mainLabel: fmtDim(nominalMm, st), prefix: '', isThread: false };
  }
  function findDimById(id, sh = dwg(), lay = layout) {
    if (!id || !sh) return null;
    const list = lay ? autoDimList(sh, lay) : (sh.dims || []).filter((x) => !x.auto);
    const dim = list.find((x) => x.id === id);
    if (!dim || !['lin', 'dia', 'rad'].includes(dim.type)) return null;
    const nominalMm = dimNominal(dim);
    const { mainLabel } = dimLabelParts(dim, nominalMm, sheetDimStyle(sh));
    return { dim, nominalMm, label: mainLabel };
  }
  function sanitizeTol(raw) {
    if (!raw || typeof raw !== 'object' || !raw.mode || raw.mode === 'none') return null;
    if (raw.mode === 'sym') {
      const sym = Math.abs(Number(raw.sym) || 0);
      return { mode: 'sym', sym: round(sym, 6) };
    }
    if (raw.mode === 'dev' || raw.mode === 'limits') {
      let upper = Number(raw.upper) || 0, lower = Number(raw.lower) || 0;
      if (lower > upper) [upper, lower] = [lower, upper];
      return { mode: raw.mode, upper: round(upper, 6), lower: round(lower, 6) };
    }
    if (raw.mode === 'fit') {
      const classes = (ISO286_DATA && ISO286_DATA.klassen) || {};
      const rawCode = String(raw.fit || 'H7').trim();
      const code = classes[rawCode] ? rawCode : (Object.keys(classes).find((k) => k.toLowerCase() === rawCode.toLowerCase()) || 'H7');
      const fitShow = ['both', 'code', 'dev', 'limits'].includes(raw.fitShow) ? raw.fitShow : 'both';
      return { mode: 'fit', fit: code, fitShow };
    }
    return null;
  }
  function getDimTol(id) {
    const d = dwg();
    const direct = (d.dims || []).find((x) => x.id === id);
    if (direct) return direct.tol ? { ...direct.tol } : null;
    const parent = (d.dims || []).find((x) => x.auto === 'circles' && id.startsWith(x.id + '_'));
    if (parent && parent.tols && parent.tols[id]) return { ...parent.tols[id] };
    return null;
  }
  function setDimTol(id, tol) {
    if (!id) return false;
    const clean = sanitizeTol(tol);
    let found = false;
    App.change(clean ? 'Toleranz geändert' : 'Toleranz entfernt', () => {
      const d = dwg();
      const direct = (d.dims || []).find((x) => x.id === id);
      if (direct) {
        if (clean) direct.tol = clean;
        else delete direct.tol;
        found = true;
        return;
      }
      const parent = (d.dims || []).find((x) => x.auto === 'circles' && id.startsWith(x.id + '_'));
      if (parent) {
        if (clean) {
          if (!parent.tols) parent.tols = {};
          parent.tols[id] = clean;
        } else if (parent.tols) {
          delete parent.tols[id];
          if (!Object.keys(parent.tols).length) delete parent.tols;
        }
        found = true;
      }
    });
    if (found) { render(); Panels.renderRight(); }
    return found;
  }
  function resolveDimTol(dim, nominalMm) {
    const tol = dim && dim.tol;
    if (!tol || !tol.mode || tol.mode === 'none') return null;
    if (tol.mode === 'sym') {
      const sym = Math.abs(Number(tol.sym) || 0);
      return { mode: 'sym', sym, symStr: fmtSymVal(sym), upperMm: sym, lowerMm: -sym };
    }
    if (tol.mode === 'dev') {
      const upperMm = Number(tol.upper) || 0, lowerMm = Number(tol.lower) || 0;
      const dev = fmtDevPair(upperMm, lowerMm);
      return { mode: 'dev', upperMm, lowerMm, upStr: dev.upStr, loStr: dev.loStr };
    }
    if (tol.mode === 'limits') {
      const upperMm = Number(tol.upper) || 0, lowerMm = Number(tol.lower) || 0;
      const lim = fmtLimitsPair(nominalMm, upperMm, lowerMm);
      return { mode: 'limits', upperMm, lowerMm, maxStr: lim.maxStr, minStr: lim.minStr };
    }
    if (tol.mode === 'fit') {
      const info = iso286(tol.fit, nominalMm);
      if (!info) return null;
      const fitShow = ['both', 'code', 'dev', 'limits'].includes(tol.fitShow) ? tol.fitShow : 'both';
      return { mode: 'fit', fitShow, ...info };
    }
    return null;
  }
  function measureDimLabel(mainLabel, prefix, tolInfo, TXT, count = 1) {
    if (!tolInfo) return { totalW: textW(mainLabel, TXT) * 0.92 };
    if (tolInfo.mode === 'sym') return { totalW: textW(`${mainLabel} ±${tolInfo.symStr}`, TXT) * 0.92 };
    if (tolInfo.mode === 'fit' && (tolInfo.fitShow === 'code' || tolInfo.outOfRange)) {
      return { totalW: textW(`${mainLabel} ${tolInfo.code}`, TXT) * 0.92 };
    }
    const k = TXT / 3.5;
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = round(2.8 * k, 2);
      const countPrefix = count > 1 ? count + '× ' : '';
      return { totalW: Math.max(textW(countPrefix + prefix + tolInfo.maxStr, LIM), textW(prefix + tolInfo.minStr, LIM)) * 0.95 };
    }
    const SUB = round(2.3 * k, 2), gap = round(0.8 * k, 2);
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    return { totalW: wMain + gap + wStack };
  }
  function emitDimTexts(texts, cx, cy, ang, dim, mainLabel, prefix, tolInfo, TXT, isLost = !!(dim && dim.lost)) {
    const rad = (ang * Math.PI) / 180;
    const exX = Math.cos(rad), exY = Math.sin(rad);
    const euX = Math.sin(rad), euY = -Math.cos(rad);
    const pt = (lx, ly) => [cx + exX * lx + euX * ly, cy + exY * lx + euY * ly];
    const base = { rot: ang, id: dim.id, view: dim.view, ...(isLost ? { lost: true } : {}) };
    if (!tolInfo) {
      texts.push({ ...base, x: cx, y: cy, t: mainLabel, size: TXT, anchor: 'middle', cls: 'dimtext' });
      return;
    }
    if (tolInfo.mode === 'sym') {
      texts.push({ ...base, x: cx, y: cy, t: `${mainLabel} ±${tolInfo.symStr}`, size: TXT, anchor: 'middle', cls: 'dimtext', tolPart: 'sym' });
      return;
    }
    if (tolInfo.mode === 'fit' && (tolInfo.fitShow === 'code' || tolInfo.outOfRange)) {
      texts.push({ ...base, x: cx, y: cy, t: `${mainLabel} ${tolInfo.code}`, size: TXT, anchor: 'middle', cls: 'dimtext', tolPart: 'fit' });
      return;
    }
    const k = TXT / 3.5;
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = round(2.8 * k, 2);
      const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
      const pTop = pt(0, 2.7 * k), pBot = pt(0, 0);
      texts.push({ ...base, x: pTop[0], y: pTop[1], t: countPrefix + prefix + tolInfo.maxStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'max' });
      texts.push({ ...base, x: pBot[0], y: pBot[1], t: prefix + tolInfo.minStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'min' });
      return;
    }
    const SUB = round(2.3 * k, 2), gap = round(0.8 * k, 2);
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    const x0 = -(wMain + gap + wStack) / 2;
    const pMain = pt(x0, 0.1 * k), pUp = pt(x0 + wMain + gap, 2.0 * k), pLo = pt(x0 + wMain + gap, -0.2 * k);
    texts.push({ ...base, x: pMain[0], y: pMain[1], t: leftText, size: TXT, anchor: 'start', cls: 'dimtext', tolPart: 'main' });
    texts.push({ ...base, x: pUp[0], y: pUp[1], t: tolInfo.upStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'upper' });
    texts.push({ ...base, x: pLo[0], y: pLo[1], t: tolInfo.loStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'lower' });
  }

  // ---------- Bemaßung ----------
  function setDimStyle(patch = {}) {
    let next = null;
    App.change('Maß-Stil geändert', () => {
      const s = dwg();
      s.dimStyle = normDimStyle({ ...sheetDimStyle(s), ...patch });
      next = s.dimStyle;
    });
    render();
    Panels.renderRight();
    return next;
  }
  // ---------- Modelländerungen & verlorene Maße (ZE-14) ----------
  function viewCirclesPool(v) {
    if (!v || !v.geo) return [];
    return [
      ...(v.geo.circles || []),
      ...(v.geo.hidden || []).filter((p) => p.c).map((p) => ({ c: p.c, r: p.r, full: !p.arc, arc: p.arc, hidden: true })),
    ];
  }
  function viewVertexPoints(v) {
    if (!v || !v.geo) return [];
    const pts = [];
    const addPt = (p) => {
      if (!p) return;
      if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.02)) pts.push([p[0], p[1]]);
    };
    for (const arr of [v.geo.polys, v.geo.tangents || [], v.geo.hidden || []]) {
      for (const p of arr || []) {
        if (!p.pts || !p.pts.length || (p.c && !p.arc)) continue;
        addPt(p.pts[0]);
        addPt(p.pts[p.pts.length - 1]);
      }
    }
    return pts;
  }
  function isCircleInner(c, box) {
    return Boolean(box && c && c.c[0] - c.r > box[0] + 0.15 && c.c[0] + c.r < box[2] - 0.15 && c.c[1] - c.r > box[1] + 0.15 && c.c[1] + c.r < box[3] - 0.15);
  }
  function incidentDirs(v, pt) {
    const dirs = [];
    for (const s of straightSegsOf(v, true)) {
      let u = null;
      if (Math.hypot(s.a[0] - pt[0], s.a[1] - pt[1]) <= 0.05) u = [(s.b[0] - s.a[0]) / s.L, (s.b[1] - s.a[1]) / s.L];
      else if (Math.hypot(s.b[0] - pt[0], s.b[1] - pt[1]) <= 0.05) u = [(s.a[0] - s.b[0]) / s.L, (s.a[1] - s.b[1]) / s.L];
      if (u && !dirs.some((d) => d[0] * u[0] + d[1] * u[1] > 0.99)) dirs.push(u);
    }
    return dirs;
  }
  function dirMatchScore(d1, d2) {
    if (!d1 || !d1.length || !d2 || !d2.length) return 0;
    let n = 0;
    for (const u of d1) if (d2.some((w) => u[0] * w[0] + u[1] * w[1] > 0.985)) n++;
    return n;
  }
  function angleDiff(a, b) {
    let d = Math.abs((((a - b) % TWO_PI) + TWO_PI) % TWO_PI);
    return Math.min(d, TWO_PI - d);
  }
  function makeCircleRef(v, c) {
    const b = (v && v.geo && v.geo.box) || [0, 0, 0, 0];
    const nearX = Math.abs((c.c[0] - c.r) - b[0]) <= 0.25 ? 'min' : Math.abs((c.c[0] + c.r) - b[2]) <= 0.25 ? 'max' : null;
    const nearY = Math.abs((c.c[1] - c.r) - b[1]) <= 0.25 ? 'min' : Math.abs((c.c[1] + c.r) - b[3]) <= 0.25 ? 'max' : null;
    const arcMid = c.arc ? (c.arc[0] + c.arc[1]) * 0.5 : null;
    return {
      kind: 'circle',
      c: [c.c[0], c.c[1]],
      r: c.r,
      full: !!c.full,
      isInner: isCircleInner(c, b),
      arcMid,
      nearX,
      nearY,
      box: [...b],
    };
  }
  function makePointRef(v, pt, edge = null) {
    const b = (v && v.geo && v.geo.box) || [0, 0, 0, 0];
    const [x0, y0, x1, y1] = b;
    if (!edge) {
      const verts = viewVertexPoints(v);
      const nearVert = verts.some((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) <= 0.05);
      if (!nearVert) {
        const hitC = viewCirclesPool(v).find((c) => Math.hypot(c.c[0] - pt[0], c.c[1] - pt[1]) <= 0.05);
        if (hitC) return { kind: 'circleCenter', circle: makeCircleRef(v, hitC), p: [pt[0], pt[1]], box: [...b] };
      }
    }
    const sideOf = (val, minV, maxV) => {
      if (Math.abs(val - minV) <= 0.08) return 'min';
      if (Math.abs(val - maxV) <= 0.08) return 'max';
      if (Math.abs(val - (minV + maxV) * 0.5) <= 0.08) return 'mid';
      return null;
    };
    const xSide = sideOf(pt[0], x0, x1);
    const ySide = sideOf(pt[1], y0, y1);
    const dxMin = pt[0] - x0, dxMax = pt[0] - x1, dyMin = pt[1] - y0, dyMax = pt[1] - y1;
    if (edge && edge.a && edge.b) {
      const L = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) || 1;
      const edgeDir = [(edge.b[0] - edge.a[0]) / L, (edge.b[1] - edge.a[1]) / L];
      return { kind: 'edgePt', p: [pt[0], pt[1]], edgeDir, xSide, ySide, dxMin, dxMax, dyMin, dyMax, box: [...b] };
    }
    return { kind: 'vertex', p: [pt[0], pt[1]], xSide, ySide, dxMin, dxMax, dyMin, dyMax, dirs: incidentDirs(v, pt), box: [...b] };
  }
  function makeEdgeRef(v, seg) {
    const b = (v && v.geo && v.geo.box) || [0, 0, 0, 0];
    const L = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]) || 1;
    return {
      kind: 'edge',
      a: [...seg.a],
      b: [...seg.b],
      dir: [(seg.b[0] - seg.a[0]) / L, (seg.b[1] - seg.a[1]) / L],
      aRef: makePointRef(v, seg.a),
      bRef: makePointRef(v, seg.b),
      box: [...b],
    };
  }
  function makeChamferRef(v, seg, info) {
    const b = (v && v.geo && v.geo.box) || [0, 0, 0, 0];
    return {
      kind: 'chamfer',
      a: [...seg.a],
      b: [...seg.b],
      aRef: makePointRef(v, seg.a),
      bRef: makePointRef(v, seg.b),
      dir: [...info.dir],
      p: [...info.p],
      dist: info.dist,
      ang: info.ang,
      box: [...b],
    };
  }
  function buildDimRef(dim, v) {
    if (!dim || !v || !v.geo) return null;
    if (dim.type === 'dia' || dim.type === 'rad') {
      const hit = viewCirclesPool(v).find((c) => Math.hypot(c.c[0] - dim.c[0], c.c[1] - dim.c[1]) <= 0.2 && Math.abs(c.r - dim.r) <= 0.2)
        || { c: dim.c, r: dim.r, full: !dim.partial };
      return makeCircleRef(v, hit);
    }
    if (dim.type === 'lin') {
      return { kind: 'lin', a: makePointRef(v, dim.a), b: makePointRef(v, dim.b) };
    }
    if (dim.type === 'chamfer') {
      const seg = straightSegsOf(v, false).find((s) => Math.hypot((s.a[0] + s.b[0]) * 0.5 - dim.p[0], (s.a[1] + s.b[1]) * 0.5 - dim.p[1]) <= 0.5)
        || { a: dim.p, b: dim.p };
      return makeChamferRef(v, seg, { dir: dim.dir || [1, 1], p: dim.p, dist: dim.dist, ang: dim.ang });
    }
    if (dim.type === 'ang' && dim.e1 && dim.e2) {
      return { kind: 'ang', e1: makeEdgeRef(v, { a: dim.e1[0], b: dim.e1[1] }), e2: makeEdgeRef(v, { a: dim.e2[0], b: dim.e2[1] }) };
    }
    if (dim.type === 'chain') {
      return { kind: 'chain', pts: (dim.pts || []).map((p) => makePointRef(v, p)) };
    }
    if (dim.type === 'base' && dim.base) {
      return { kind: 'base', base: makePointRef(v, dim.base), pts: (dim.pts || []).map((p) => makePointRef(v, p)) };
    }
    return null;
  }
  function resolveCircleRef(v, ref) {
    if (!v || !v.geo || !ref) return null;
    const pool = viewCirclesPool(v);
    const b = v.geo.box, oldB = ref.box;
    const cands = pool.filter((c) => {
      if (ref.full && !c.full) return false;
      if (ref.isInner === true && !isCircleInner(c, b)) return false;
      return true;
    });
    const arcMidOf = (c) => (c.arc ? (c.arc[0] + c.arc[1]) * 0.5 : null);
    const pickBest = (list, targetFn, tol = 0.35, maxAngDiff = 0.8) => {
      let best = null, bestScore = Infinity;
      for (const c of list) {
        const tp = targetFn(c);
        const d = Math.hypot(c.c[0] - tp[0], c.c[1] - tp[1]);
        if (d > tol) continue;
        if (!ref.full && ref.arcMid != null && c.arc) {
          if (angleDiff(arcMidOf(c), ref.arcMid) > maxAngDiff) continue;
        }
        const outerBias = (ref.isInner === false && ref.full && isCircleInner(c, b)) ? 50 : 0;
        const score = d * 20 + Math.abs(c.r - ref.r) + outerBias;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best;
    };
    let hit = pickBest(cands, () => ref.c, 0.35, 0.8);
    if (!hit && !ref.full && (ref.nearX || ref.nearY)) {
      hit = pickBest(cands, (c) => [
        ref.nearX === 'min' ? b[0] + c.r : ref.nearX === 'max' ? b[2] - c.r : ref.c[0],
        ref.nearY === 'min' ? b[1] + c.r : ref.nearY === 'max' ? b[3] - c.r : ref.c[1],
      ], 0.35, 0.6);
    }
    if (!hit && oldB && Math.abs((b[2] - b[0]) - (oldB[2] - oldB[0])) <= 0.1 && Math.abs((b[3] - b[1]) - (oldB[3] - oldB[1])) <= 0.1) {
      const dx = b[0] - oldB[0], dy = b[1] - oldB[1];
      hit = pickBest(cands, () => [ref.c[0] + dx, ref.c[1] + dy], 0.35, 0.8);
    }
    return hit ? { c: [hit.c[0], hit.c[1]], r: hit.r, full: !!hit.full, arc: hit.arc } : null;
  }
  function resolvePointRef(v, ref) {
    if (!v || !v.geo || !ref) return null;
    if (ref.kind === 'circleCenter') {
      const cr = resolveCircleRef(v, ref.circle);
      return cr ? cr.c : null;
    }
    const b = v.geo.box, [x0, y0, x1, y1] = b, oldB = ref.box;
    const expX = ref.xSide === 'min' ? x0 : ref.xSide === 'max' ? x1 : ref.xSide === 'mid' ? (x0 + x1) * 0.5 : ref.p[0];
    const expY = ref.ySide === 'min' ? y0 : ref.ySide === 'max' ? y1 : ref.ySide === 'mid' ? (y0 + y1) * 0.5 : ref.p[1];
    if (ref.kind === 'edgePt') {
      const segs = straightSegsOf(v, true);
      const targets = [[expX, expY]];
      if (oldB && Math.abs((x1 - x0) - (oldB[2] - oldB[0])) <= 0.1 && Math.abs((y1 - y0) - (oldB[3] - oldB[1])) <= 0.1) {
        targets.push([ref.p[0] + (x0 - oldB[0]), ref.p[1] + (y0 - oldB[1])]);
      }
      for (const tp of targets) {
        let best = null, bd = 0.25;
        for (const s of segs) {
          const ux = (s.b[0] - s.a[0]) / s.L, uy = (s.b[1] - s.a[1]) / s.L;
          if (Math.abs(ux * ref.edgeDir[0] + uy * ref.edgeDir[1]) <= 0.995) continue;
          const tRaw = (tp[0] - s.a[0]) * ux + (tp[1] - s.a[1]) * uy;
          if (tRaw < -0.25 || tRaw > s.L + 0.25) continue;
          const t = clamp(tRaw, 0, s.L);
          const px = s.a[0] + ux * t, py = s.a[1] + uy * t;
          const d = Math.hypot(px - tp[0], py - tp[1]);
          if (d < bd) { bd = d; best = [px, py]; }
        }
        if (best) return best;
      }
      return null;
    }
    const verts = viewVertexPoints(v);
    const findNear = (target, tol = 0.2, requireDir = false) => {
      let best = null, bestScore = Infinity;
      for (const pt of verts) {
        const d = Math.hypot(pt[0] - target[0], pt[1] - target[1]);
        if (d > tol) continue;
        const dScore = ref.dirs && ref.dirs.length ? dirMatchScore(incidentDirs(v, pt), ref.dirs) : 0;
        if (requireDir && ref.dirs && ref.dirs.length && dScore <= 0) continue;
        const score = d - dScore * 0.05;
        if (score < bestScore) { bestScore = score; best = [pt[0], pt[1]]; }
      }
      return best;
    };
    let hit = findNear([expX, expY], 0.2);
    if (!hit && oldB) {
      const dw = (x1 - x0) - (oldB[2] - oldB[0]), dh = (y1 - y0) - (oldB[3] - oldB[1]);
      if (Math.abs(dw) > 0.1 || Math.abs(dh) > 0.1) {
        const cands = [];
        if (ref.ySide) {
          if (ref.dxMin != null) cands.push([x0 + ref.dxMin, expY]);
          if (ref.dxMax != null) cands.push([x1 + ref.dxMax, expY]);
        }
        if (ref.xSide) {
          if (ref.dyMin != null) cands.push([expX, y0 + ref.dyMin]);
          if (ref.dyMax != null) cands.push([expX, y1 + ref.dyMax]);
        }
        for (const tp of cands) {
          hit = findNear(tp, 0.15, true);
          if (hit) break;
        }
      } else {
        hit = findNear([ref.p[0] + (x0 - oldB[0]), ref.p[1] + (y0 - oldB[1])], 0.2);
      }
    }
    return hit;
  }
  function resolveEdgeRef(v, ref) {
    if (!v || !v.geo || !ref) return null;
    const segs = straightSegsOf(v, true);
    const a = resolvePointRef(v, ref.aRef), b = resolvePointRef(v, ref.bRef);
    const matchesDir = (s) => {
      const ux = (s.b[0] - s.a[0]) / s.L, uy = (s.b[1] - s.a[1]) / s.L;
      return Math.abs(ux * ref.dir[0] + uy * ref.dir[1]) > 0.995;
    };
    const onSeg = (s, pt, tol = 0.2) => {
      const ux = (s.b[0] - s.a[0]) / s.L, uy = (s.b[1] - s.a[1]) / s.L;
      const nx = -uy, ny = ux;
      if (Math.abs((pt[0] - s.a[0]) * nx + (pt[1] - s.a[1]) * ny) > tol) return false;
      const t = (pt[0] - s.a[0]) * ux + (pt[1] - s.a[1]) * uy;
      return t >= -tol && t <= s.L + tol;
    };
    if (a && b) {
      const direct = segs.find((s) => matchesDir(s) && onSeg(s, a) && onSeg(s, b));
      if (direct) return { a: [...direct.a], b: [...direct.b] };
    }
    const anchor = a || b || [(ref.a[0] + ref.b[0]) * 0.5, (ref.a[1] + ref.b[1]) * 0.5];
    const cand = segs.find((s) => matchesDir(s) && onSeg(s, anchor, 0.25));
    return cand ? { a: [...cand.a], b: [...cand.b] } : null;
  }
  function resolveChamferRef(v, ref) {
    if (!v || !v.geo || !ref) return null;
    const b = v.geo.box, oldB = ref.box;
    let dx = 0, dy = 0;
    if (oldB) {
      const xSide = (ref.aRef && ref.aRef.xSide === 'max') || (ref.bRef && ref.bRef.xSide === 'max') ? 'max'
        : ((ref.aRef && ref.aRef.xSide === 'min') || (ref.bRef && ref.bRef.xSide === 'min') ? 'min' : null);
      const ySide = (ref.aRef && ref.aRef.ySide === 'max') || (ref.bRef && ref.bRef.ySide === 'max') ? 'max'
        : ((ref.aRef && ref.aRef.ySide === 'min') || (ref.bRef && ref.bRef.ySide === 'min') ? 'min' : null);
      if (xSide === 'min') dx = b[0] - oldB[0];
      else if (xSide === 'max') dx = b[2] - oldB[2];
      if (ySide === 'min') dy = b[1] - oldB[1];
      else if (ySide === 'max') dy = b[3] - oldB[3];
    }
    const expP = [ref.p[0] + dx, ref.p[1] + dy];
    let best = null, bd = Infinity;
    for (const seg of straightSegsOf(v, false)) {
      const info = analyzeChamfer(v, seg);
      if (!info) continue;
      if (info.dir[0] * ref.dir[0] + info.dir[1] * ref.dir[1] <= 0.85) continue;
      const d = Math.hypot(info.p[0] - expP[0], info.p[1] - expP[1]);
      const tol = Math.max(1.5, Math.max(ref.dist || 1, info.dist || 1) * 1.5);
      if (d <= tol && d < bd) { bd = d; best = info; }
    }
    return best;
  }
  function resolveManualDim(dim, lay, sh = dwg()) {
    if (!dim || dim.auto) return dim;
    if (dim.view === 'free' || !dim.view) return { ...dim, lost: false };
    if (['front', 'top', 'left', 'iso'].includes(dim.view) && sh.views && !sh.views[dim.view]) {
      return { ...dim, lost: false, hiddenView: true };
    }
    const v = lay && lay.views ? lay.views[dim.view] : null;
    if (!v || !v.geo) return { ...dim, lost: true, lostReason: 'Ansicht leer' };
    if (!dim.ref) return { ...dim, lost: false };
    if (dim.type === 'dia' || dim.type === 'rad') {
      const c = resolveCircleRef(v, dim.ref);
      if (!c) return { ...dim, lost: true, lostReason: dim.type === 'dia' ? 'Bohrung/Kreis fehlt' : 'Rundung/Bogen fehlt' };
      return { ...dim, c: c.c, r: c.r, partial: !c.full, lost: false };
    }
    if (dim.type === 'lin') {
      const a = resolvePointRef(v, dim.ref.a), b = resolvePointRef(v, dim.ref.b);
      if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4) return { ...dim, lost: true, lostReason: 'Kante oder Punkt fehlt' };
      return { ...dim, a, b, lost: false };
    }
    if (dim.type === 'chamfer') {
      const ch = resolveChamferRef(v, dim.ref);
      if (!ch) return { ...dim, lost: true, lostReason: 'Fase fehlt' };
      return { ...dim, p: ch.p, dir: ch.dir, dist: ch.dist, ang: ch.ang, lost: false };
    }
    if (dim.type === 'ang') {
      const e1 = resolveEdgeRef(v, dim.ref.e1), e2 = resolveEdgeRef(v, dim.ref.e2);
      if (!e1 || !e2) return { ...dim, lost: true, lostReason: 'Kante fehlt' };
      const V = lineIntersect2D(e1.a, e1.b, e2.a, e2.b);
      if (!V) return { ...dim, lost: true, lostReason: 'Kanten parallel' };
      const mid = (dim.a0 + dim.a1) * 0.5;
      const r = Math.max(4, dim.r || 10);
      const sec = angularSector(V, e1, e2, [V[0] + Math.cos(mid) * r, V[1] + Math.sin(mid) * r]);
      return { ...dim, v: V, e1: [e1.a, e1.b], e2: [e2.a, e2.b], a0: sec.a0, a1: sec.a1, lost: false };
    }
    if (dim.type === 'chain') {
      const pts = (dim.ref.pts || []).map((pr) => resolvePointRef(v, pr));
      if (pts.length < 2 || pts.some((p) => !p)) return { ...dim, lost: true, lostReason: 'Kante oder Punkt fehlt' };
      return { ...dim, pts, lost: false };
    }
    if (dim.type === 'base') {
      const base = resolvePointRef(v, dim.ref.base);
      const pts = (dim.ref.pts || []).map((pr) => resolvePointRef(v, pr));
      if (!base || !pts.length || pts.some((p) => !p)) return { ...dim, lost: true, lostReason: 'Bezugspunkt oder Kante fehlt' };
      return { ...dim, base, pts, lost: false };
    }
    return { ...dim, lost: false };
  }
  function dimSummaryLabel(dim, st = sheetDimStyle()) {
    if (!dim) return 'Maß';
    if (dim.type === 'dia' || dim.type === 'rad') return dimLabelParts(dim, dimNominal(dim), st).mainLabel;
    if (dim.type === 'lin') return fmtDim(dimNominal(dim), st);
    if (dim.type === 'chamfer') {
      const angTxt = Math.abs(dim.ang - 45) < 0.1 && st.decimals == null ? '45°' : fmtDimAngle(dim.ang, st);
      return `${fmtDim(dim.dist, st)}×${angTxt}`;
    }
    if (dim.type === 'ang') return fmtDimAngle(((dim.a1 - dim.a0) * 180) / Math.PI, st);
    if (dim.type === 'chain') return 'Kettenmaß';
    if (dim.type === 'base') return 'Bezugsmaß';
    return 'Maß';
  }
  function lostDims(sh = dwg()) {
    const lay = (sh === dwg() && layout) ? layout : computeLayout(sh);
    return autoDimList(sh, lay).filter((x) => x.lost);
  }
  function autoDimList(sh = dwg(), lay = layout) {
    const all = [];
    const st = sheetDimStyle(sh);
    for (const dim of sh.dims) {
      if (!dim.auto) { all.push(resolveManualDim(dim, lay, sh)); continue; }
      const out = [];
      const v = lay.views[dim.view]; if (!v) continue;
      const b = v.geo.box;
      if (dim.auto === 'width') out.push({ ...dim, type: 'lin', dir: 'h', a: [b[0], b[1]], b: [b[2], b[1]], off: -(9 / v.s) });
      if (dim.auto === 'height') out.push({ ...dim, type: 'lin', dir: 'v', a: [b[0], b[1]], b: [b[0], b[3]], off: -(9 / v.s) });
      if (dim.auto === 'depth') out.push({ ...dim, type: 'lin', dir: 'h', a: [b[0], b[1]], b: [b[2], b[1]], off: -(9 / v.s) });
      if (dim.auto === 'circles') {
        // Gleiche Durchmesser nur einmal bemaßen („2× Ø4,5“). Verschiedene Durchmesser möglichst an verschiedenen
        // Bohrungen, sonst in verschiedene Richtungen – immer vom Teil weg, damit sich nichts überdeckt.
        const groups = new Map();
        for (const c of v.geo.circles) { if (!c.full) continue; const k = Math.round(c.r * 200); let l = groups.get(k); if (!l) groups.set(k, (l = [])); l.push(c); }
        const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
        const ck = (c) => Math.round(c.c[0] * 20) + ',' + Math.round(c.c[1] * 20);
        const angD = (p, q) => { const d = Math.abs((((p - q) % 360) + 360) % 360); return Math.min(d, 360 - d); };
        const used = new Map();
        for (const g of [...groups.values()].sort((p, q) => q[0].r - p[0].r)) {
          let best = g[0], bs = Infinity;
          for (const c of g) { const n = (used.get(ck(c)) || []).length; const s = n * 1e6 - Math.hypot(c.c[0] - mx, c.c[1] - my); if (s < bs - 1e-6) { bs = s; best = c; } }
          const taken = used.get(ck(best)) || []; used.set(ck(best), taken);
          const away = Math.hypot(best.c[0] - mx, best.c[1] - my) > 1e-6 ? (Math.atan2(best.c[1] - my, best.c[0] - mx) * 180) / Math.PI : 30;
          const ang = [45, 135, 225, 315].sort((p, q) => angD(p, away) - angD(q, away)).find((a) => !taken.includes(a)) ?? 45;
          taken.push(ang);
          const mt = (v.geo.threads || []).find((th) => th.type === 'end' && Math.hypot(th.c[0] - best.c[0], th.c[1] - best.c[1]) < 0.25 && Math.abs(th.r - best.r) < 0.35);
          const subId = dim.id + '_' + Math.round(best.r * 200);
          const subTol = dim.tols && dim.tols[subId] ? dim.tols[subId] : undefined;
          const item = { ...dim, id: subId, type: 'dia', c: best.c, r: best.r, ang, count: g.length, ...(mt ? { threadLabel: `${mt.size} × ${fmtDim(mt.length, st)}` } : {}) };
          delete item.tols;
          if (subTol) item.tol = subTol;
          out.push(item);
        }
        // Rundungen: gleiche Radien zusammenfassen („4× R5“). Nur deutliche Bögen – Zahnköpfe und Ähnliches bleiben weg.
        const ag = new Map();
        for (const c of v.geo.circles) { if (c.full || !c.arc || c.arc[1] - c.arc[0] < 0.35) continue; const k = Math.round(c.r * 200); let l = ag.get(k); if (!l) ag.set(k, (l = [])); l.push(c); }
        for (const g of [...ag.values()].sort((p, q) => q[0].r - p[0].r)) {
          if (g.length > 12) continue;
          let best = g[0], bd = -1;
          for (const c of g) { const mid = (c.arc[0] + c.arc[1]) / 2; const d = Math.hypot(c.c[0] + c.r * Math.cos(mid) - mx, c.c[1] + c.r * Math.sin(mid) - my); if (d > bd) { bd = d; best = c; } }
          const mid = (best.arc[0] + best.arc[1]) / 2;
          const subId = dim.id + '_r' + Math.round(best.r * 200);
          const subTol = dim.tols && dim.tols[subId] ? dim.tols[subId] : undefined;
          const item = { ...dim, id: subId, type: 'rad', c: best.c, r: best.r, ang: (mid * 180) / Math.PI, count: g.length };
          delete item.tols;
          if (subTol) item.tol = subTol;
          out.push(item);
        }
      }
      // einzeln gelöschte automatische Maße bleiben weg
      for (const x of out) if (!(dim.hide || []).includes(x.id)) all.push(x);
    }
    return all;
  }
  function drawSpanDim(lines, texts, P1, P2, val, dimOrId, outerTail = true, st = sheetDimStyle(), isLost = !!(dimOrId && typeof dimOrId === 'object' && dimOrId.lost)) {
    const dim = dimOrId && typeof dimOrId === 'object' ? dimOrId : null;
    const id = dim ? dim.id : dimOrId;
    const lostObj = isLost ? { lost: true } : {};
    const TXT = st.fontSize, AR = clamp(TXT * 0.85, 2, 7), aStyle = st.arrow;
    lines.push({ pts: [P1, P2], cls: 'dim', id, ...lostObj });
    const L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
    const inside = (aStyle === 'slash' || aStyle === 'dot') ? true : L > AR * 2.6;
    arrowHead(lines, P1, P2, AR, inside, id, null, aStyle, null, null, isLost);
    arrowHead(lines, P2, P1, AR, inside, id, null, aStyle, null, null, isLost);
    if (!inside && outerTail) {
      const ux = (P2[0] - P1[0]) / (L || 1), uy = (P2[1] - P1[1]) / (L || 1);
      lines.push({ pts: [[P1[0] - ux * AR * 2.4, P1[1] - uy * AR * 2.4], P1], cls: 'dim', id, ...lostObj }, { pts: [P2, [P2[0] + ux * AR * 2.4, P2[1] + uy * AR * 2.4]], cls: 'dim', id, ...lostObj });
    }
    const mx = (P1[0] + P2[0]) / 2, my = (P1[1] + P2[1]) / 2;
    // Maßzahl lesbar von unten oder von rechts (ISO 129): Winkel in [-90°, 90°)
    let ang = (Math.atan2(P2[1] - P1[1], P2[0] - P1[0]) * 180) / Math.PI;
    if (ang >= 89.99) ang -= 180; if (ang < -90.01) ang += 180;
    const r = (ang * Math.PI) / 180;
    const gap = Math.max(1.2, TXT * 0.34);
    const tx = mx + Math.sin(r) * gap, ty = my - Math.cos(r) * gap;
    if (dim) {
      const { mainLabel, prefix } = dimLabelParts(dim, val, st);
      const tolInfo = resolveDimTol(dim, val);
      emitDimTexts(texts, tx, ty, ang, dim, mainLabel, prefix, tolInfo, TXT, isLost);
    } else {
      texts.push({ x: tx, y: ty, t: fmtDim(val, st), size: TXT, rot: ang, anchor: 'middle', id, cls: 'dimtext', ...lostObj });
    }
  }
  function dimSVG(dim, lines, texts, lay = layout, sh = dwg()) {
    const v = lay.views[dim.view]; if (!v) return;
    const st = sheetDimStyle(sh);
    const isLost = !!dim.lost, lostObj = isLost ? { lost: true } : {};
    const TXT = st.fontSize, AR = clamp(TXT * 0.85, 2, 7), EXT = Math.max(2, TXT * 0.55), GAPX = 1, TGAP = Math.max(1.2, TXT * 0.34), aStyle = st.arrow;
    if (dim.type === 'lin') {
      const A = toSheet(v, dim.a), B = toSheet(v, dim.b);
      let val, P1, P2, E1s, E2s;
      if (dim.dir === 'h') {
        const off = dim.off * v.s; const yl = (dim.off < 0 ? Math.max(A[1], B[1]) - off : Math.min(A[1], B[1]) - off);
        P1 = [A[0], yl]; P2 = [B[0], yl]; val = Math.abs(dim.b[0] - dim.a[0]);
        const sgn = Math.sign(yl - A[1]) || 1;
        E1s = [[A[0], A[1] + sgn * GAPX], [A[0], yl + sgn * EXT]]; E2s = [[B[0], B[1] + sgn * GAPX], [B[0], yl + sgn * EXT]];
      } else if (dim.dir === 'v') {
        const off = dim.off * v.s; const xl = (dim.off < 0 ? Math.min(A[0], B[0]) + off : Math.max(A[0], B[0]) + off);
        P1 = [xl, A[1]]; P2 = [xl, B[1]]; val = Math.abs(dim.b[1] - dim.a[1]);
        const sgn = Math.sign(xl - A[0]) || -1;
        E1s = [[A[0] + sgn * GAPX, A[1]], [xl + sgn * EXT, A[1]]]; E2s = [[B[0] + sgn * GAPX, B[1]], [xl + sgn * EXT, B[1]]];
      } else {
        const dx = B[0] - A[0], dy = B[1] - A[1]; const L = Math.hypot(dx, dy) || 1; const nx = -dy / L, ny = dx / L; const off = dim.off * v.s;
        P1 = [A[0] + nx * off, A[1] + ny * off]; P2 = [B[0] + nx * off, B[1] + ny * off]; val = Math.hypot(dim.b[0] - dim.a[0], dim.b[1] - dim.a[1]);
        const sg = Math.sign(off) || 1;
        E1s = [[A[0] + nx * sg * GAPX, A[1] + ny * sg * GAPX], [P1[0] + nx * sg * EXT, P1[1] + ny * sg * EXT]]; E2s = [[B[0] + nx * sg * GAPX, B[1] + ny * sg * GAPX], [P2[0] + nx * sg * EXT, P2[1] + ny * sg * EXT]];
      }
      lines.push({ pts: E1s, cls: 'dim', id: dim.id, ...lostObj }, { pts: E2s, cls: 'dim', id: dim.id, ...lostObj });
      drawSpanDim(lines, texts, P1, P2, val, dim, true, st, isLost);
    } else if (dim.type === 'dia' || dim.type === 'rad') {
      const C = toSheet(v, dim.c); const R = dim.r * v.s; const ang = ((dim.ang ?? 45) * Math.PI) / 180;
      const ux = Math.cos(ang), uy = -Math.sin(ang);
      const P = [C[0] + ux * R, C[1] + uy * R];
      // Knick der Hinweislinie möglichst knapp außerhalb des Teils, damit die Maßzahl frei steht
      const bx = v.geo.box, TL = toSheet(v, [bx[0], bx[3]]), BR = toSheet(v, [bx[2], bx[1]]), M = 3;
      const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
      const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
      const tEx = Math.min(tx, ty);
      const lead = tEx > 0 && tEx < 24 ? Math.max(5, tEx) : 7;
      const out = [P[0] + ux * lead, P[1] + uy * lead];
      const nomVal = dim.type === 'dia' ? dim.r * 2 : dim.r;
      const { mainLabel, prefix } = dimLabelParts(dim, nomVal, st);
      const tolInfo = resolveDimTol(dim, nomVal);
      const { totalW } = measureDimLabel(mainLabel, prefix, tolInfo, TXT, dim.count);
      const tl = totalW + 2.5;
      const tail = [out[0] + (ux >= 0 ? tl : -tl), out[1]];
      if (dim.type === 'dia') {
        const Q = [C[0] - ux * R, C[1] - uy * R];
        if (dim.partial) {
          lines.push({ pts: [C, P], cls: 'dim', id: dim.id, ...lostObj });
          arrowHead(lines, P, R >= AR * 1.3 ? C : out, AR, true, dim.id, null, aStyle, null, null, isLost);
        } else if (2 * R >= AR * 2.6 || aStyle === 'slash' || aStyle === 'dot') {
          lines.push({ pts: [Q, P], cls: 'dim', id: dim.id, ...lostObj });
          arrowHead(lines, Q, P, AR, true, dim.id, null, aStyle, null, null, isLost);
          arrowHead(lines, P, Q, AR, true, dim.id, null, aStyle, null, null, isLost);
        } else {
          // kleine Kreise: Pfeile von außen
          const Q2 = [Q[0] - ux * AR * 2.2, Q[1] - uy * AR * 2.2];
          lines.push({ pts: [Q2, P], cls: 'dim', id: dim.id, ...lostObj });
          arrowHead(lines, Q, Q2, AR, true, dim.id, null, aStyle, null, null, isLost);
          arrowHead(lines, P, out, AR, true, dim.id, null, aStyle, null, null, isLost);
        }
      } else if (R >= AR * 1.3) {
        lines.push({ pts: [C, P], cls: 'dim', id: dim.id, ...lostObj });
        arrowHead(lines, P, C, AR, true, dim.id, null, aStyle, null, null, isLost);
      } else arrowHead(lines, P, out, AR, true, dim.id, null, aStyle, null, null, isLost);
      lines.push({ pts: [P, out, tail], cls: 'dim', id: dim.id, ...lostObj });
      emitDimTexts(texts, (out[0] + tail[0]) / 2, out[1] - TGAP, 0, dim, mainLabel, prefix, tolInfo, TXT, isLost);
    } else if (dim.type === 'chamfer') {
      const P = toSheet(v, dim.p);
      const ux = dim.dir[0], uy = -dim.dir[1];
      const bx = v.geo.box, TL = toSheet(v, [bx[0], bx[3]]), BR = toSheet(v, [bx[2], bx[1]]), M = 3.5;
      const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
      const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
      const tEx = Math.min(tx, ty);
      const lead = tEx > 0 && tEx < 24 ? Math.max(6, tEx) : 8;
      const out = [P[0] + ux * lead, P[1] + uy * lead];
      const angTxt = Math.abs(dim.ang - 45) < 0.1 && st.decimals == null ? '45°' : fmtDimAngle(dim.ang, st);
      const label = `${fmtDim(dim.dist, st)}×${angTxt}`;
      const tl = textW(label, TXT) * 0.92 + 2;
      const tail = [out[0] + (ux >= 0 ? tl : -tl), out[1]];
      arrowHead(lines, P, out, AR, true, dim.id, null, aStyle, null, null, isLost);
      lines.push({ pts: [P, out, tail], cls: 'dim', id: dim.id, ...lostObj });
      texts.push({ x: (out[0] + tail[0]) / 2, y: out[1] - TGAP, t: label, size: TXT, rot: 0, anchor: 'middle', id: dim.id, cls: 'dimtext', ...lostObj });
    } else if (dim.type === 'ang') {
      const VC = toSheet(v, dim.v), R = Math.max(3, dim.r * v.s), rModel = R / v.s;
      const a0 = dim.a0, a1 = dim.a1;
      const span = a1 - a0;
      if (span <= 1e-4) return;
      const P0 = [VC[0] + R * Math.cos(a0), VC[1] - R * Math.sin(a0)];
      const P1 = [VC[0] + R * Math.cos(a1), VC[1] - R * Math.sin(a1)];
      for (const [ang, edge] of [[a0, dim.e1], [a1, dim.e2]]) {
        if (!edge || edge.length < 2) continue;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const tA = (edge[0][0] - dim.v[0]) * ux + (edge[0][1] - dim.v[1]) * uy;
        const tB = (edge[1][0] - dim.v[0]) * ux + (edge[1][1] - dim.v[1]) * uy;
        const tMin = Math.min(tA, tB), tMax = Math.max(tA, tB);
        if (rModel > tMax + 1e-3) {
          const s0 = Math.max(0, tMax) + GAPX / v.s, s1 = rModel + EXT / v.s;
          lines.push({ pts: [toSheet(v, [dim.v[0] + ux * s0, dim.v[1] + uy * s0]), toSheet(v, [dim.v[0] + ux * s1, dim.v[1] + uy * s1])], cls: 'dim', id: dim.id, ...lostObj });
        } else if (rModel < tMin - 1e-3) {
          const s0 = Math.max(0, rModel - EXT / v.s), s1 = tMin - GAPX / v.s;
          if (s1 > s0) lines.push({ pts: [toSheet(v, [dim.v[0] + ux * s0, dim.v[1] + uy * s0]), toSheet(v, [dim.v[0] + ux * s1, dim.v[1] + uy * s1])], cls: 'dim', id: dim.id, ...lostObj });
        }
      }
      const nA0 = ((a0 % TWO_PI) + TWO_PI) % TWO_PI;
      const nA1 = nA0 + span;
      const aPts = arcPts(dim.v, rModel, a0, a1).map((q) => toSheet(v, q));
      lines.push({ pts: aPts, arc: { c: VC, r: R, a: [nA0, nA1 <= TWO_PI ? nA1 : nA1 - TWO_PI] }, cls: 'dim', id: dim.id, ...lostObj });
      const inside = (aStyle === 'slash' || aStyle === 'dot') ? true : span * R > AR * 2.6;
      const from0 = [P0[0] - Math.sin(a0) * AR, P0[1] - Math.cos(a0) * AR];
      const from1 = [P1[0] + Math.sin(a1) * AR, P1[1] + Math.cos(a1) * AR];
      arrowHead(lines, P0, from0, AR, inside, dim.id, null, aStyle, null, null, isLost);
      arrowHead(lines, P1, from1, AR, inside, dim.id, null, aStyle, null, null, isLost);
      if (!inside) {
        const extA = (AR * 2.4) / R;
        lines.push(
          { pts: arcPts(dim.v, rModel, a0 - extA, a0).map((q) => toSheet(v, q)), cls: 'dim', id: dim.id, ...lostObj },
          { pts: arcPts(dim.v, rModel, a1, a1 + extA).map((q) => toSheet(v, q)), cls: 'dim', id: dim.id, ...lostObj }
        );
      }
      const deg = (span * 180) / Math.PI;
      const label = fmtDimAngle(deg, st);
      const am = (a0 + a1) * 0.5;
      const radOut = R + Math.max(3.2, TXT * 0.95);
      const tx = VC[0] + Math.cos(am) * radOut;
      const ty = VC[1] - Math.sin(am) * radOut + TXT * 0.34;
      texts.push({ x: tx, y: ty, t: label, size: TXT, rot: 0, anchor: 'middle', id: dim.id, cls: 'dimtext', ...lostObj });
    } else if (dim.type === 'chain') {
      const pts = [...(dim.pts || [])];
      if (pts.length < 2) return;
      if (dim.dir === 'h') {
        pts.sort((p, q) => p[0] - q[0]);
        const yl = toSheet(v, [0, dim.linePos])[1];
        const SP = pts.map((p) => toSheet(v, p));
        for (const P of SP) {
          const sgn = Math.sign(yl - P[1]) || 1;
          lines.push({ pts: [[P[0], P[1] + sgn * GAPX], [P[0], yl + sgn * EXT]], cls: 'dim', id: dim.id, ...lostObj });
        }
        for (let i = 0; i < SP.length - 1; i++) {
          const val = Math.abs(pts[i + 1][0] - pts[i][0]);
          drawSpanDim(lines, texts, [SP[i][0], yl], [SP[i + 1][0], yl], val, dim.id, i === 0 || i === SP.length - 2, st, isLost);
        }
      } else {
        pts.sort((p, q) => p[1] - q[1]);
        const xl = toSheet(v, [dim.linePos, 0])[0];
        const SP = pts.map((p) => toSheet(v, p));
        for (const P of SP) {
          const sgn = Math.sign(xl - P[0]) || -1;
          lines.push({ pts: [[P[0] + sgn * GAPX, P[1]], [xl + sgn * EXT, P[1]]], cls: 'dim', id: dim.id, ...lostObj });
        }
        for (let i = 0; i < SP.length - 1; i++) {
          const val = Math.abs(pts[i + 1][1] - pts[i][1]);
          drawSpanDim(lines, texts, [xl, SP[i][1]], [xl, SP[i + 1][1]], val, dim.id, i === 0 || i === SP.length - 2, st, isLost);
        }
      }
    } else if (dim.type === 'base') {
      const STEP_SHEET = Math.max(8, TXT * 2.3);
      const basePt = dim.base;
      const pts = [...(dim.pts || [])];
      if (!basePt || !pts.length) return;
      const B0 = toSheet(v, basePt);
      if (dim.dir === 'h') {
        pts.sort((p, q) => Math.abs(p[0] - basePt[0]) - Math.abs(q[0] - basePt[0]));
        const yl0 = toSheet(v, [0, dim.linePos])[1];
        const outSign = yl0 >= B0[1] ? 1 : -1;
        const ylLast = yl0 + (pts.length - 1) * outSign * STEP_SHEET;
        lines.push({ pts: [[B0[0], B0[1] + outSign * GAPX], [B0[0], ylLast + outSign * EXT]], cls: 'dim', id: dim.id, ...lostObj });
        for (let i = 0; i < pts.length; i++) {
          const P = toSheet(v, pts[i]);
          const yli = yl0 + i * outSign * STEP_SHEET;
          const sgn = Math.sign(yli - P[1]) || outSign;
          lines.push({ pts: [[P[0], P[1] + sgn * GAPX], [P[0], yli + sgn * EXT]], cls: 'dim', id: dim.id, ...lostObj });
          drawSpanDim(lines, texts, [B0[0], yli], [P[0], yli], Math.abs(pts[i][0] - basePt[0]), dim.id, true, st, isLost);
        }
      } else {
        pts.sort((p, q) => Math.abs(p[1] - basePt[1]) - Math.abs(q[1] - basePt[1]));
        const xl0 = toSheet(v, [dim.linePos, 0])[0];
        const outSign = xl0 <= B0[0] ? -1 : 1;
        const xlLast = xl0 + (pts.length - 1) * outSign * STEP_SHEET;
        lines.push({ pts: [[B0[0] + outSign * GAPX, B0[1]], [xlLast + outSign * EXT, B0[1]]], cls: 'dim', id: dim.id, ...lostObj });
        for (let i = 0; i < pts.length; i++) {
          const P = toSheet(v, pts[i]);
          const xli = xl0 + i * outSign * STEP_SHEET;
          const sgn = Math.sign(xli - P[0]) || outSign;
          lines.push({ pts: [[P[0] + sgn * GAPX, P[1]], [xli + sgn * EXT, P[1]]], cls: 'dim', id: dim.id, ...lostObj });
          drawSpanDim(lines, texts, [xli, B0[1]], [xli, P[1]], Math.abs(pts[i][1] - basePt[1]), dim.id, true, st, isLost);
        }
      }
    }
  }
  function fmtDim(v, st = sheetDimStyle()) {
    if (typeof v !== 'number' || !isFinite(v)) return '–';
    const dec = (st && st.decimals != null) ? st.decimals : FMT.dec;
    return fmtFixed(Units.fromMM(v), dec);
  }
  function fmtDimAngle(deg, st = sheetDimStyle()) {
    if (st && st.decimals != null) return fmtFixed(deg, st.decimals) + '°';
    return Math.abs(deg - Math.round(deg)) < 0.05 ? `${Math.round(deg)}°` : fmtAngleU(deg);
  }
  function arrowHead(lines, tip, from, len, inside, id, secId, style = 'filled', clsOverride = null, view = null, isLost = false) {
    const dx = from[0] - tip[0], dy = from[1] - tip[1]; const L = Math.hypot(dx, dy) || 1; let ux = dx / L, uy = dy / L;
    if (!inside && (style === 'filled' || style === 'open')) { ux = -ux; uy = -uy; }
    const extra = { id, ...(secId ? { secId } : {}), ...(view ? { view } : {}), ...(isLost ? { lost: true } : {}) };
    if (style === 'open') {
      const w = len * 0.32;
      const b = [tip[0] + ux * len, tip[1] + uy * len];
      lines.push({ pts: [[b[0] - uy * w, b[1] + ux * w], tip, [b[0] + uy * w, b[1] - ux * w]], cls: clsOverride || 'arrow-open', ...extra });
      return;
    }
    if (style === 'slash') {
      const cu = (ux > 1e-6 || (Math.abs(ux) <= 1e-6 && uy >= 0)) ? ux : -ux;
      const cv = (ux > 1e-6 || (Math.abs(ux) <= 1e-6 && uy >= 0)) ? uy : -uy;
      const sx = (cu + cv) * Math.SQRT1_2, sy = (-cu + cv) * Math.SQRT1_2;
      const h = len * 0.55;
      lines.push({ pts: [[tip[0] - sx * h, tip[1] - sy * h], [tip[0] + sx * h, tip[1] + sy * h]], cls: clsOverride || 'arrow-slash', ...extra });
      return;
    }
    if (style === 'dot') {
      lines.push({ circle: [tip[0], tip[1], Math.max(0.55, len * 0.24)], cls: clsOverride || 'arrow-dot', ...extra });
      return;
    }
    const w = len * 0.28;
    const b = [tip[0] + ux * len, tip[1] + uy * len];
    lines.push({ poly: [tip, [b[0] - uy * w, b[1] + ux * w], [b[0] + uy * w, b[1] - ux * w]], cls: clsOverride || 'arrow', ...extra });
  }
  // ---------- Schraffur & Schnittlinie ----------
  function hatchStepSheet(s, geo) {
    const diagMm = geo ? Math.hypot(geo.w * s, geo.h * s) : 60;
    const byScale = s >= 2 ? 3.2 : s >= 1 ? 2.5 : s >= 0.5 ? 2.0 : 1.6;
    return clamp(Math.min(byScale, Math.max(1.2, diagMm / 18)), 1.2, 4.5);
  }
  function buildHatchLines(v, sec, lines) {
    const caps = (v.geo && v.geo.caps) || [];
    if (!caps.length) return;
    const paperStep = hatchStepSheet(v.s, v.geo);
    const modelStep = paperStep / (v.s || 1);
    for (let capIdx = 0; capIdx < caps.length; capIdx++) {
      const cap = caps[capIdx];
      const loops = [cap.outer, ...(cap.holes || [])].filter((lp) => lp && lp.length >= 3);
      if (!loops.length) continue;
      const deg = (cap.partIdx % 2 === 1) ? 135 : 45;
      const rad = (deg * Math.PI) / 180;
      const tx = Math.cos(rad), ty = Math.sin(rad), nx = -ty, ny = tx;
      let bMin = Infinity, bMax = -Infinity;
      const rotLoops = loops.map((lp) => lp.map((p) => {
        const a = p[0] * tx + p[1] * ty;
        const b = p[0] * nx + p[1] * ny;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
        return [a, b];
      }));
      if (!isFinite(bMin) || bMax - bMin < 1e-6) continue;
      let k0 = Math.ceil((bMin + 1e-6) / modelStep);
      let k1 = Math.floor((bMax - 1e-6) / modelStep);
      const bs = [];
      if (k0 <= k1) {
        for (let k = k0; k <= k1; k++) bs.push(k * modelStep);
      } else {
        bs.push((bMin + bMax) * 0.5);
      }
      for (const b0 of bs) {
        const hits = [];
        for (const lp of rotLoops) {
          for (let i = 0, n = lp.length; i < n; i++) {
            const p0 = lp[i], p1 = lp[(i + 1) % n];
            if ((p0[1] <= b0 && p1[1] > b0) || (p1[1] <= b0 && p0[1] > b0)) {
              const t = (b0 - p0[1]) / (p1[1] - p0[1]);
              hits.push(p0[0] + t * (p1[0] - p0[0]));
            }
          }
        }
        hits.sort((x, y) => x - y);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          const a0 = hits[i], a1 = hits[i + 1];
          if (a1 - a0 < 1e-5) continue;
          const P0 = [a0 * tx + b0 * nx, a0 * ty + b0 * ny];
          const P1 = [a1 * tx + b0 * nx, a1 * ty + b0 * ny];
          lines.push({ pts: [toSheet(v, P0), toSheet(v, P1)], cls: 'hatch', id: sec.id, secId: sec.id, capIdx });
        }
      }
    }
  }
  function drawSectionLine(v, sec, lines, texts) {
    const vf = sectionPlaneSpec(sec);
    const A0 = toSheet(v, sec.a), B0 = toSheet(v, sec.b);
    const dx = B0[0] - A0[0], dy = B0[1] - A0[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-3) return;
    const ux = dx / L, uy = dy / L;
    const b = v.geo.box;
    const TL = toSheet(v, [b[0], b[3]]), BR = toSheet(v, [b[2], b[1]]);
    const corners = [TL, [BR[0], TL[1]], BR, [TL[0], BR[1]]];
    let tMin = Infinity, tMax = -Infinity;
    for (const c of corners) {
      const t = (c[0] - A0[0]) * ux + (c[1] - A0[1]) * uy;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
    const sStart = Math.min(0, tMin - 5), sEnd = Math.max(L, tMax + 5);
    const E1 = [A0[0] + ux * sStart, A0[1] + uy * sStart];
    const E2 = [A0[0] + ux * sEnd, A0[1] + uy * sEnd];
    const lookSheet = [vf.look2[0], -vf.look2[1]];
    const endLen = 5;
    lines.push({ pts: [E1, E2], cls: 'cutline', id: sec.id, secId: sec.id });
    lines.push({ pts: [E1, [E1[0] + ux * endLen, E1[1] + uy * endLen]], cls: 'cutend', id: sec.id, secId: sec.id });
    lines.push({ pts: [[E2[0] - ux * endLen, E2[1] - uy * endLen], E2], cls: 'cutend', id: sec.id, secId: sec.id });
    const shaft = 8;
    for (const [EP, outU] of [[E1, -1], [E2, 1]]) {
      const tail = [EP[0] - lookSheet[0] * shaft, EP[1] - lookSheet[1] * shaft];
      lines.push({ pts: [tail, EP], cls: 'dim', id: sec.id, secId: sec.id });
      arrowHead(lines, EP, tail, 3.2, true, sec.id, sec.id, 'filled');
      const lx = tail[0] - lookSheet[0] * 1.2 + ux * outU * 3.2;
      const ly = tail[1] - lookSheet[1] * 1.2 + uy * outU * 3.2 + 1.5;
      texts.push({ x: lx, y: ly, t: sec.label, size: 4.5, anchor: 'middle', id: sec.id, secId: sec.id, cls: 'cutlabel' });
    }
  }

  // ---------- Zeichnen ----------
  function drawLeaderNote(note, lines, texts, lay = layout, sh = dwg()) {
    const st = sheetDimStyle(sh);
    let A;
    if (note.view) {
      const v = lay.views[note.view];
      if (!v) return;
      A = toSheet(v, note.anchor);
    } else {
      A = [note.anchor[0], note.anchor[1]];
    }
    const elb = (dragNote && dragNote.id === note.id && dragNote.curElbow) ? dragNote.curElbow : (note.elbow || [14, -10]);
    const E = [A[0] + elb[0], A[1] + elb[1]];
    const TXT = st.fontSize, TGAP = Math.max(1.2, TXT * 0.34);
    const tLines = String(note.text || '').split(/\r?\n/).filter((x, i, a) => x.length || a.length === 1);
    const dir = E[0] >= A[0] ? 1 : -1;
    const maxW = Math.max(...tLines.map((s) => textW(s, TXT)), 6);
    const tailLen = Math.max(8, maxW + 2.4);
    const T = [E[0] + dir * tailLen, E[1]];
    const tipKind = note.tip === 'dot' ? 'dot' : 'arrow';
    lines.push({ pts: [A, E, T], cls: 'leader', id: note.id, view: note.view || undefined, noteTip: tipKind, anchorPt: A });
    if (tipKind === 'dot') {
      lines.push({ circle: [A[0], A[1], Math.max(0.75, TXT * 0.24)], cls: 'leader-dot', id: note.id, view: note.view || undefined, anchorPt: A });
    } else {
      arrowHead(lines, A, E, clamp(TXT * 0.85, 2.2, 6.5), true, note.id, null, 'filled', 'leader-arrow', note.view || undefined);
    }
    const lh = TXT * 1.25;
    const tx = dir >= 0 ? E[0] + 1.2 : E[0] - 1.2;
    const anchor = dir >= 0 ? 'start' : 'end';
    for (let i = 0; i < tLines.length; i++) {
      const y = E[1] - TGAP - (tLines.length - 1 - i) * lh;
      texts.push({ x: tx, y, t: tLines[i], size: TXT, rot: 0, anchor, id: note.id, view: note.view || undefined, cls: 'leadertext' });
    }
  }
  function getShadedImage(name, v) {
    if (!proj || !proj.views || !proj.views[name] || !v || !v.geo || typeof Viewer === 'undefined' || !Viewer.renderOrthoView) return null;
    const pv = proj.views[name];
    const ck = name + '|' + projSceneKey + '|' + dirSig(pv) + '|' + v.geo.box.map((n) => Math.round(n * 100)).join(',');
    if (shadeCache.has(ck)) return shadeCache.get(ck);
    const img = Viewer.renderOrthoView({ dir: pv.dir, x: pv.x, box: v.geo.box, maxPx: 720 });
    if (img) {
      if (shadeCache.size > 24) shadeCache.clear();
      shadeCache.set(ck, img);
    }
    return img;
  }
  function buildSheetContent(sh, idx, total) {
    const lay = computeLayout(sh);
    const { W, H, frame } = lay;
    const st = sheetDimStyle(sh);
    const lines = [], texts = [], images = [];
    // Rahmen
    lines.push({ rect: [0, 0, W, H], cls: 'paper' });
    lines.push({ rect: [frame.x, frame.y, frame.w, frame.h], cls: 'frame' });
    // Ansichten
    for (const [name, v] of Object.entries(lay.views)) {
      if (v.opts && v.opts.shaded && name !== 'free') {
        const img = getShadedImage(name, v);
        if (img) {
          const b = v.geo.box;
          const TL = toSheet(v, [b[0], b[3]]);
          images.push({ x: TL[0], y: TL[1], w: v.geo.w * v.s, h: v.geo.h * v.s, png: img.png, jpg: img.jpg, iw: img.w, ih: img.h, viewKey: name });
        }
      }
      const asLine = (p, cls) => {
        if (p.c && !p.arc) return { circle: [...toSheet(v, p.c), p.r * v.s], cls, view: name };
        const l = { pts: p.pts.map((q) => toSheet(v, q)), cls, view: name };
        if (p.arc) l.arc = { c: toSheet(v, p.c), r: p.r * v.s, a: p.arc };
        return l;
      };
      if (v.isSection) buildHatchLines(v, v.section, lines);
      for (const p of v.geo.polys) lines.push(asLine(p, 'vis'));
      for (const p of v.geo.tangents || []) lines.push(asLine(p, 'tan'));
      for (const p of v.geo.hidden) lines.push(asLine(p, 'hid'));
      if (v.isSection && v.section) {
        const b = v.geo.box;
        const TL = toSheet(v, [b[0], b[3]]), BR = toSheet(v, [b[2], b[1]]);
        texts.push({ x: (TL[0] + BR[0]) * 0.5, y: BR[1] + 6, t: `Schnitt ${v.section.label}–${v.section.label}`, size: 4, anchor: 'middle', id: v.section.id, secId: v.section.id, cls: 'viewlabel' });
      }
      for (const c of v.geo.centers) {
        if (c.type === 'cross') {
          const C = toSheet(v, c.c);
          const r = c.r * v.s + 2;
          lines.push(
            { pts: [[C[0] - r, C[1]], [C[0] + r, C[1]]], cls: 'ctr', view: name, id: c.id, ctrType: 'cross' },
            { pts: [[C[0], C[1] - r], [C[0], C[1] + r]], cls: 'ctr', view: name, id: c.id, ctrType: 'cross' }
          );
        } else {
          const A = toSheet(v, c.a), B = toSheet(v, c.b);
          const dx = B[0] - A[0], dy = B[1] - A[1];
          const L = Math.hypot(dx, dy) || 1;
          const e = c.noExt ? 0 : 2.5;
          lines.push({ pts: [[A[0] - (dx / L) * e, A[1] - (dy / L) * e], [B[0] + (dx / L) * e, B[1] + (dy / L) * e]], cls: 'ctr', view: name, id: c.id, ctrType: c.ctrGroup || 'line' });
        }
      }
      // Kosmetische Gewinde nach DIN ISO 6410-1: 3/4-Kreis (Stirnansicht) bzw. dünne parallele Linien (Seitenansicht)
      const labelSide = !v.detail && (name === 'front' || (name === 'left' && !lay.views.front));
      for (const th of v.geo.threads || []) {
        if (th.type === 'end') {
          const C = toSheet(v, th.c), rr = th.rThread * v.s;
          if (rr > 0.3) lines.push({ pts: arcPts(th.c, th.rThread, 0, Math.PI * 1.5).map((q) => toSheet(v, q)), arc: { c: C, r: rr, a: [0, Math.PI * 1.5] }, cls: 'thin', view: name });
        } else if (th.type === 'side') {
          const A = toSheet(v, th.a), B = toSheet(v, th.b);
          const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
          if (L < 0.3) continue;
          const px = -dy / L, py = dx / L, rt = th.rThread * v.s, ro = th.r * v.s;
          lines.push({ pts: [[A[0] + px * rt, A[1] + py * rt], [B[0] + px * rt, B[1] + py * rt]], cls: 'thin', view: name });
          lines.push({ pts: [[A[0] - px * rt, A[1] - py * rt], [B[0] - px * rt, B[1] - py * rt]], cls: 'thin', view: name });
          lines.push({ pts: [[A[0] - px * ro, A[1] - py * ro], [A[0] + px * ro, A[1] + py * ro]], cls: 'vis', view: name });
          lines.push({ pts: [[B[0] - px * ro, B[1] - py * ro], [B[0] + px * ro, B[1] + py * ro]], cls: 'vis', view: name });
          if (labelSide) {
            const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
            const P0 = [mx + px * ro, my + py * ro];
            const P1 = [P0[0] + px * 5 + 3, P0[1] + py * 5 - 4];
            const lbl = `${th.size} × ${fmtDim(th.length, st)}`;
            const thSz = Math.max(2.5, st.fontSize * 0.92);
            const tw = textW(lbl, thSz) + 2;
            const P2 = [P1[0] + tw, P1[1]];
            lines.push({ pts: [P0, P1, P2], cls: 'dim', view: name });
            texts.push({ x: (P1[0] + P2[0]) / 2, y: P1[1] - 1, t: lbl, size: thSz, rot: 0, anchor: 'middle', cls: 'dimtext', view: name });
          }
        }
      }
      if (v.rect && v.is3d) {
        texts.push({ x: (v.rect[0] + v.rect[2]) / 2, y: v.rect[3] + 4.5, t: `${v.label} (${scaleText(v.s)})`, size: 3.0, anchor: 'middle', cls: 'vlabel', view: name });
      } else if (v.rect && v.customScale) {
        texts.push({ x: (v.rect[0] + v.rect[2]) / 2, y: v.rect[1] - 2.5, t: `${v.label} (${scaleText(v.s)})`, size: 2.8, anchor: 'middle', cls: 'vlabel', view: name });
      }
      if (name === 'free') for (const e of sh.free) if (e.type === 'text') { const P = toSheet(v, e.p); texts.push({ x: P[0], y: P[1], t: e.text, size: e.size || 3.5, rot: 0, anchor: 'start', id: e.id, cls: 'free' }); }
    }
    // Detailkreise & Detailrahmen + Kennbuchstaben (ZE-03)
    for (const det of sh.details || []) {
      const srcV = lay.views[det.source], detV = lay.views[det.id];
      if (!srcV || !detV) continue;
      const SC = toSheet(srcV, det.c), SR = det.r * srcV.s;
      const b = srcV.geo.box;
      const VC = toSheet(srcV, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
      let ux = SC[0] - VC[0], uy = SC[1] - VC[1];
      const ul = Math.hypot(ux, uy);
      if (ul > 1e-3) { ux /= ul; uy /= ul; } else { ux = Math.SQRT1_2; uy = -Math.SQRT1_2; }
      lines.push({ circle: [SC[0], SC[1], SR], cls: 'detail', id: det.id, view: det.source });
      lines.push({ pts: [[SC[0] + ux * SR, SC[1] + uy * SR], [SC[0] + ux * (SR + 3.2), SC[1] + uy * (SR + 3.2)]], cls: 'detail', id: det.id, view: det.source });
      texts.push({ x: SC[0] + ux * (SR + 5.2), y: SC[1] + uy * (SR + 5.2) + 1.4, t: det.label, size: 4.2, anchor: 'middle', cls: 'detail-lbl', id: det.id, view: det.source });
      const DC = detV.sheetCenter, DR = detV.sheetR;
      lines.push({ circle: [DC[0], DC[1], DR], cls: 'detail-border', id: det.id, view: det.id });
      const ly = DC[1] - DR - 3 >= frame.y + 5 ? DC[1] - DR - 3 : DC[1] + DR + 5.5;
      texts.push({ x: DC[0], y: ly, t: `Detail ${det.label} (${scaleText(detV.s)})`, size: 4, anchor: 'middle', cls: 'detail-lbl', id: det.id, view: det.id });
    }
    if (!Object.keys(lay.views).length) texts.push({ x: W / 2, y: H / 2 - 10, t: 'Noch kein Modell – bau zuerst etwas im Reiter „Modell“.', size: 5, anchor: 'middle', cls: 'note' });
    // Schnittlinien auf Eltern-Ansichten
    for (const sec of sh.sections || []) {
      const pv = lay.views[sec.parent];
      if (pv) drawSectionLine(pv, sec, lines, texts);
    }
    // Bemaßungen
    for (const dim of autoDimList(sh, lay)) if (lay.views[dim.view] && !lay.views[dim.view].noDims) dimSVG(dim, lines, texts, lay, sh);
    // Notizen mit Hinweislinie
    for (const note of sh.notes || []) drawLeaderNote(note, lines, texts, lay, sh);
    // Schriftfeld
    titleBlock(sh, lay, idx, total, lines, texts);
    return { layout: lay, lines, texts, images };
  }
  function render() {
    if (!holder) return;
    const all = sheets(), idx = activeIndex(), sh = all[idx] || dwg();
    const cur = buildSheetContent(sh, idx, all.length);
    layout = cur.layout;
    const svKey = currentViewKey(sh);
    if (svKey && layout.views[svKey] && layout.views[svKey].rect && !tool) {
      const r = layout.views[svKey].rect;
      cur.lines.push({ rect: [r[0] - 2, r[1] - 2, r[2] - r[0] + 4, r[3] - r[1] + 4], cls: 'view-sel' });
    }
    // Werkzeug-Vorschau
    if (tool === 'dim' && toolState) previewDim(cur.lines, cur.texts);
    if (tool === 'detail' && toolState) previewDetail(cur.lines, cur.texts);
    if (tool === 'section' && toolState) previewSection(cur.lines, cur.texts);
    if (tool === 'note' && toolState) previewNote(cur.lines, cur.texts);
    buildSVG(cur.lines, cur.texts, cur.images);
    const sv = document.getElementById('dw-scale-val'); if (sv) sv.textContent = scaleText(layout.s);
    renderTabs();
  }
  function titleBlock(sh, lay, idx, total, lines, texts) {
    const { frame, tb } = lay; const T = sh.title || {};
    const x1 = frame.x + frame.w, y1 = frame.y + frame.h, x0 = x1 - tb.w, y0 = y1 - tb.h;
    lines.push({ rect: [x0, y0, tb.w, tb.h], cls: 'frame' });
    // links: 4 Zeilen × 2 Spalten (Blatt + Format geteilt) · Mitte: Benennung · rechts: Projektionssymbol
    const cA = x0, cB = x0 + 32, cB2 = x0 + 54, cC = x0 + 72, cD = x1 - 32;
    const rows = [y0, y0 + 8, y0 + 16, y0 + 24, y1];
    for (const r of rows.slice(1, -1)) lines.push({ pts: [[cA, r], [cC, r]], cls: 'thin' });
    lines.push({ pts: [[cB, y0], [cB, y1]], cls: 'thin' }, { pts: [[cB2, rows[2]], [cB2, rows[3]]], cls: 'thin' }, { pts: [[cC, y0], [cC, y1]], cls: 'thin' }, { pts: [[cD, y0], [cD, y1]], cls: 'thin' });
    lines.push({ pts: [[cC, y0 + 24], [cD, y0 + 24]], cls: 'thin' }, { pts: [[cD, y0 + 20], [x1, y0 + 20]], cls: 'thin' });
    const lab = (x, y, t) => texts.push({ x: x + 1.2, y: y + 2.6, t, size: 1.9, anchor: 'start', cls: 'lab' });
    const val = (x, y, t, w, size = 3) => { const s = fitSize(t || '', w - 2.6, size, 1.8); texts.push({ x: x + 1.5, y: y + 6.6, t: clipText(t || '', w - 2.6, s), size: s, anchor: 'start', cls: 'val' }); };
    lab(cA, rows[0], 'Gezeichnet'); val(cA, rows[0], T.name, 32, 2.8);
    lab(cB, rows[0], 'Datum'); val(cB, rows[0], T.datum, 40, 2.8);
    lab(cA, rows[1], 'Werkstoff'); val(cA, rows[1], T.werkstoff, 32, 2.8);
    lab(cB, rows[1], 'Maßstab'); val(cB, rows[1], scaleText(lay.s), 40, 3.2);
    lab(cA, rows[2], 'Firma / Schule'); val(cA, rows[2], T.firma, 32, 2.6);
    lab(cB, rows[2], 'Blatt'); val(cB, rows[2], T.blatt ? T.blatt : `${idx + 1}/${total}`, 22, 2.8);
    lab(cB2, rows[2], 'Format'); val(cB2, rows[2], sh.sheet, 18, 2.8);
    lab(cA, rows[3], 'Zeichnungsnummer'); val(cA, rows[3], T.nummer, 32, 2.8);
    lab(cB, rows[3], 'Allgemeintoleranz'); val(cB, rows[3], 'ISO 2768-m', 40, 2.6);
    // Benennung, bei Bedarf zweizeilig
    lab(cC, rows[0], 'Benennung');
    const title = String(T.titel || App.doc.name || '');
    const tw = cD - cC - 3;
    let ts = fitSize(title, tw, 6, 3.4);
    if (textW(title, ts) > tw) {
      const words = title.split(/\s+/); let l1 = '', l2 = '';
      for (const w of words) { if (!l2 && textW((l1 + ' ' + w).trim(), 4.2) <= tw) l1 = (l1 + ' ' + w).trim(); else l2 = (l2 + ' ' + w).trim(); }
      ts = Math.min(fitSize(l1, tw, 4.2, 2.6), fitSize(l2, tw, 4.2, 2.6));
      texts.push({ x: cC + 1.5, y: rows[0] + 10.5, t: clipText(l1, tw, ts), size: ts, anchor: 'start', cls: 'title' });
      texts.push({ x: cC + 1.5, y: rows[0] + 10.5 + ts * 1.25, t: clipText(l2, tw, ts), size: ts, anchor: 'start', cls: 'title' });
    } else texts.push({ x: cC + 1.5, y: rows[0] + 13.5, t: title, size: ts, anchor: 'start', cls: 'title' });
    texts.push({ x: cC + 1.5, y: rows[3] + 5.4, t: clipText(`Erstellt mit Tracery · ${sh.name} · Maße in ${Units.label()}`, tw, 2), size: 2, anchor: 'start', cls: 'lab' });
    // Projektionssymbol Methode 1 (ISO 5456-2): Kegelstumpf links mit schmalem Ende links, Ansicht von links rechts daneben
    lab(cD, rows[0], 'Projektion');
    const sx = cD + 4.5, cy = y0 + 11.5;
    lines.push({ pts: [[sx, cy - 1.6], [sx + 10, cy - 3], [sx + 10, cy + 3], [sx, cy + 1.6], [sx, cy - 1.6]], cls: 'thin' });
    lines.push({ pts: [[sx - 1.5, cy], [sx + 11.5, cy]], cls: 'ctr' });
    const ccx = sx + 18.5;
    lines.push({ circle: [ccx, cy, 1.6], cls: 'thin' }, { circle: [ccx, cy, 3], cls: 'thin' });
    lines.push({ pts: [[ccx - 4, cy], [ccx + 4, cy]], cls: 'ctr' }, { pts: [[ccx, cy - 4], [ccx, cy + 4]], cls: 'ctr' });
    texts.push({ x: cD + 1.2, y: y0 + 26.2, t: 'ISO 5456-2', size: 2, anchor: 'start', cls: 'lab' });
    texts.push({ x: cD + 1.2, y: y0 + 30.4, t: 'Methode 1', size: 2.5, anchor: 'start', cls: 'val' });
  }
  // grobe Textbreite (Schmalschrift ≈ 0,5 em, Helvetica im PDF ≈ 0,56 em)
  // Die Standardschrift im PDF kennt nur Latin-1: typografische Zeichen ersetzen
  function latin1(s) {
    return String(s).replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[^\x00-\xff]/g, '?');
  }
  function textW(t, size) { return String(t).length * size * 0.56; }
  function fitSize(t, w, max, min) { const n = String(t).length || 1; return Math.max(min, Math.min(max, w / (n * 0.56))); }
  function clipText(t, w, size) { t = String(t); if (textW(t, size) <= w) return t; const n = Math.max(1, Math.floor(w / (size * 0.56)) - 1); return t.slice(0, n) + '…'; }
  function buildSVG(lines, texts, images = []) {
    const { W, H } = layout;
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('xmlns', NS);
    s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('width', W * zoom * 3.2); s.setAttribute('height', H * zoom * 3.2);
    const style = document.createElementNS(NS, 'style');
    style.textContent = `.paper{fill:#fff;stroke:none}.frame{fill:none;stroke:#111;stroke-width:.7}.thin{fill:none;stroke:#111;stroke-width:.25}.vis{fill:none;stroke:#111;stroke-width:.5;stroke-linecap:round;stroke-linejoin:round}.tan{fill:none;stroke:#444;stroke-width:.2;stroke-linecap:round;stroke-linejoin:round}.hid{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:2.4 1.2}.ctr{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:5 1.2 .6 1.2}.ctr[data-id]{cursor:pointer}.ctr.sel{stroke:#0c7a70;stroke-width:.45}.hatch{fill:none;stroke:#111;stroke-width:.22}.cutline{fill:none;stroke:#111;stroke-width:.35;stroke-dasharray:7 1.2 .7 1.2}.cutend{fill:none;stroke:#111;stroke-width:.7;stroke-linecap:square}.dim{fill:none;stroke:#111;stroke-width:.25}.arrow{fill:#111;stroke:none}.arrow-open{fill:none;stroke:#111;stroke-width:.3;stroke-linecap:round;stroke-linejoin:round}.arrow-slash{fill:none;stroke:#111;stroke-width:.45;stroke-linecap:round}.arrow-dot,.leader-dot,.leader-arrow{fill:#111;stroke:none}.leader{fill:none;stroke:#111;stroke-width:.25;cursor:pointer}.view-sel{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:2 1.5;pointer-events:none}.detail{fill:none;stroke:#111;stroke-width:.25;cursor:pointer}.detail-border{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:3 1.5;cursor:grab}.detail.sel,.detail-border.sel{stroke:#0c7a70;stroke-width:.45}.sel .dim,.dim.sel,.cutline.sel,.cutend.sel,.hatch.sel,.arrow-open.sel,.arrow-slash.sel{stroke:#0c7a70}.dim.sel,.leader.sel{stroke:#0c7a70;stroke-width:.4}.arrow.sel,.arrow-dot.sel,.leader-dot.sel,.leader-arrow.sel{fill:#0c7a70}.dim.lost,.arrow-open.lost,.arrow-slash.lost{stroke:#c9372e;stroke-width:.38}.dim.lost{stroke-dasharray:2 1}.arrow.lost,.arrow-dot.lost{fill:#c9372e}text{font-family:"Barlow Semi Condensed","Barlow",Arial,sans-serif;fill:#111}text.dimtext{cursor:pointer}text.lab{fill:#555}text.note{fill:#888}text.vlabel{fill:#333;font-weight:500}text.cutlabel,text.viewlabel{font-weight:700}text.sel{fill:#0c7a70}text.dimtext.lost{fill:#c9372e;font-weight:600}.dim.lost.sel,.arrow-open.lost.sel,.arrow-slash.lost.sel{stroke:#991b1b;stroke-width:.5}.arrow.lost.sel,.arrow-dot.lost.sel{fill:#991b1b}text.dimtext.lost.sel{fill:#991b1b}text.detail-lbl{font-weight:600;cursor:pointer}text.leadertext{cursor:grab}.prev{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:1.5 1}.snap{fill:none;stroke:#0c7a70;stroke-width:.4}`;
    s.append(style);
    const g = document.createElementNS(NS, 'g'); s.append(g);
    const f = (n) => (Math.round(n * 1000) / 1000).toString();
    const appendLine = (l) => {
      let el;
      const sel = l.id && l.id === selDim;
      if (l.rect) { el = document.createElementNS(NS, 'rect'); el.setAttribute('x', f(l.rect[0])); el.setAttribute('y', f(l.rect[1])); el.setAttribute('width', f(l.rect[2])); el.setAttribute('height', f(l.rect[3])); }
      else if (l.circle) { el = document.createElementNS(NS, 'circle'); el.setAttribute('cx', f(l.circle[0])); el.setAttribute('cy', f(l.circle[1])); el.setAttribute('r', f(l.circle[2])); }
      else if (l.poly) { el = document.createElementNS(NS, 'polygon'); el.setAttribute('points', l.poly.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      else { el = document.createElementNS(NS, 'polyline'); el.setAttribute('points', l.pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      el.setAttribute('class', l.cls + (l.lost ? ' lost' : '') + (sel ? ' sel' : ''));
      if (l.id) el.dataset.id = l.id;
      if (l.lost) el.dataset.lost = '1';
      if (l.view) el.dataset.view = l.view;
      if (l.ctrType) el.dataset.ctr = l.ctrType;
      if (l.secId) el.dataset.sec = l.secId;
      if (l.capIdx != null) el.dataset.cap = String(l.capIdx);
      if (l.noteTip) el.dataset.tipKind = l.noteTip;
      if (l.anchorPt) { el.dataset.ax = f(l.anchorPt[0]); el.dataset.ay = f(l.anchorPt[1]); }
      g.append(el);
    };
    for (const l of lines) if (l.cls === 'paper') appendLine(l);
    for (const im of images) {
      if (!im.png && !im.jpg) continue;
      const el = document.createElementNS(NS, 'image');
      el.setAttribute('class', 'shade-img');
      el.setAttribute('x', f(im.x)); el.setAttribute('y', f(im.y));
      el.setAttribute('width', f(im.w)); el.setAttribute('height', f(im.h));
      el.setAttribute('preserveAspectRatio', 'none');
      el.setAttribute('href', im.png || im.jpg);
      if (im.viewKey) el.dataset.view = im.viewKey;
      g.append(el);
    }
    for (const l of lines) if (l.cls !== 'paper') appendLine(l);
    for (const t of texts) {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', f(t.x)); el.setAttribute('y', f(t.y)); el.setAttribute('font-size', f(t.size)); el.setAttribute('text-anchor', t.anchor || 'start');
      if (t.rot) el.setAttribute('transform', `rotate(${f(t.rot)} ${f(t.x)} ${f(t.y)})`);
      el.setAttribute('class', (t.cls || '') + (t.lost ? ' lost' : '') + (t.id && t.id === selDim ? ' sel' : ''));
      if (t.id) el.dataset.id = t.id;
      if (t.lost) el.dataset.lost = '1';
      if (t.view) el.dataset.view = t.view;
      if (t.secId) el.dataset.sec = t.secId;
      if (t.tolPart) el.dataset.tol = t.tolPart;
      el.textContent = t.t;
      g.append(el);
    }
    holder.innerHTML = ''; holder.append(s); svg = s;
    s.addEventListener('pointermove', onMove); s.addEventListener('pointerdown', onDown); s.addEventListener('contextmenu', onContextMenu);
    lastLines = lines; lastTexts = texts; lastImages = images;
  }
  let lastLines = [], lastTexts = [], lastImages = [];
  // ---------- Maus ----------
  function sheetPt(e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); if (!m) return [0, 0]; const q = pt.matrixTransform(m.inverse()); return [q.x, q.y]; }
  function sourceViewAt(P) {
    for (const name of ['front', 'top', 'left']) {
      const v = layout && layout.views[name]; if (!v) continue;
      const b = v.geo.box; const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 6 && P[0] <= B[0] + 6 && P[1] >= A[1] - 6 && P[1] <= B[1] + 6) return name;
    }
    return null;
  }
  function viewAt(P) {
    for (const [name, v] of Object.entries(layout.views)) {
      if (v.detail && Math.hypot(P[0] - v.sheetCenter[0], P[1] - v.sheetCenter[1]) <= v.sheetR + 6) return name;
    }
    let best = null;
    for (const [name, v] of Object.entries(layout.views)) { if (v.noDims || v.detail) continue; const b = v.geo.box; const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]); if (P[0] >= A[0] - 8 && P[0] <= B[0] + 8 && P[1] >= A[1] - 8 && P[1] <= B[1] + 8) best = name; }
    return best;
  }
  function viewAtAll(P) {
    if (!layout || !layout.views) return null;
    for (const [name, v] of Object.entries(layout.views)) {
      if (name === 'free' || !v.rect) continue;
      if (P[0] >= v.rect[0] - 4 && P[0] <= v.rect[2] + 4 && P[1] >= v.rect[1] - 4 && P[1] <= v.rect[3] + 4) return name;
    }
    return null;
  }
  function snapIn(name, P) {
    const v = layout.views[name]; if (!v) return null;
    const tol = 2.6 / zoom;
    let best = null, bd = tol;
    for (const q of v.geo.points) { const S = toSheet(v, q); const d = Math.hypot(S[0] - P[0], S[1] - P[1]); if (d < bd) { bd = d; best = { p: q, S }; } }
    return best;
  }
  function circleAt(name, P, allowInside = false) {
    const v = layout.views[name]; if (!v) return null;
    const q = toView(v, P);
    const tol = Math.max(2.5, 4 / zoom) / v.s;
    const pool = [...v.geo.circles, ...v.geo.hidden.filter((p) => p.c).map((p) => ({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }))];
    let best = null, bd = tol;
    for (const c of pool) {
      const d = Math.abs(Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) - c.r); if (d >= bd) continue;
      if (c.arc) {
        let a = angOf(c.c, q);
        if (a < c.arc[0] - 0.08) a += TWO_PI;
        if (a > c.arc[1] + 0.08) continue;
      }
      bd = d; best = c;
    }
    if (!best && allowInside) {
      let bestR = Infinity;
      for (const c of pool) {
        if (c.arc) continue;
        const d = Math.hypot(q[0] - c.c[0], q[1] - c.c[1]);
        if (d <= c.r + tol && c.r < bestR) { bestR = c.r; best = c; }
      }
    }
    if (!best) return null;
    const ang = Math.hypot(q[0] - best.c[0], q[1] - best.c[1]) > 1e-3 ? (angOf(best.c, q) * 180) / Math.PI : 45;
    return { ...best, ang };
  }
  function straightSegsOf(v, includeHidden = false) {
    const out = [];
    const add = (arr, hid) => {
      for (const p of arr || []) {
        if (p.c || !p.pts || p.pts.length < 2) continue;
        for (let i = 0; i < p.pts.length - 1; i++) {
          const a = p.pts[i], b = p.pts[i + 1];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (L > 1e-4) out.push({ a, b, L, hid });
        }
      }
    };
    add(v.geo.polys, false);
    if (includeHidden) add(v.geo.hidden, true);
    return out;
  }
  function lineIntersect2D(a1, b1, a2, b2) {
    const dx1 = b1[0] - a1[0], dy1 = b1[1] - a1[1];
    const dx2 = b2[0] - a2[0], dy2 = b2[1] - a2[1];
    const det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) < 1e-8) return null;
    const t = ((a2[0] - a1[0]) * dy2 - (a2[1] - a1[1]) * dx2) / det;
    return [a1[0] + t * dx1, a1[1] + t * dy1];
  }
  function edgeAt(name, P, includeHidden = false) {
    const v = layout.views[name]; if (!v) return null;
    const tol = Math.max(2.2, 3.4 / zoom);
    const pickFrom = (segs) => {
      let best = null, bd = tol;
      for (const seg of segs) {
        const A = toSheet(v, seg.a), B = toSheet(v, seg.b);
        const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
        if (L2 < 1e-6) continue;
        const t = clamp(((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2, 0, 1);
        const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
        if (d < bd) {
          bd = d;
          best = { a: seg.a, b: seg.b, A, B, t, L: seg.L, d, hit: [seg.a[0] + t * (seg.b[0] - seg.a[0]), seg.a[1] + t * (seg.b[1] - seg.a[1])] };
        }
      }
      return best;
    };
    const vis = pickFrom(straightSegsOf(v, false));
    if (vis || !includeHidden) return vis;
    return pickFrom(straightSegsOf(v, true).filter((s) => s.hid));
  }
  function analyzeChamfer(v, seg) {
    const a = seg.a, b = seg.b, L = seg.L;
    if (L < 1e-4) return null;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const M = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
    const tol = Math.max(0.05, L * 0.02);
    const vis = straightSegsOf(v, false);
    const adj = (pt) => {
      const dirs = [];
      for (const s of vis) {
        if (s.a === a && s.b === b) continue;
        let dir = null;
        if (Math.hypot(s.a[0] - pt[0], s.a[1] - pt[1]) <= tol) dir = [(s.b[0] - s.a[0]) / s.L, (s.b[1] - s.a[1]) / s.L];
        else if (Math.hypot(s.b[0] - pt[0], s.b[1] - pt[1]) <= tol) dir = [(s.a[0] - s.b[0]) / s.L, (s.a[1] - s.b[1]) / s.L];
        if (!dir) continue;
        if (Math.abs(u[0] * dir[1] - u[1] * dir[0]) < 0.05) continue;
        dirs.push(dir);
      }
      return dirs;
    };
    const adjA = adj(a), adjB = adj(b);
    let best = null, bestScore = Infinity;
    for (const nA of adjA) for (const nB of adjB) {
      if (Math.abs(nA[0] * nB[1] - nA[1] * nB[0]) < 0.05) continue;
      const C = lineIntersect2D(a, [a[0] + nA[0], a[1] + nA[1]], b, [b[0] + nB[0], b[1] + nB[1]]);
      if (!C) continue;
      if ((C[0] - a[0]) * nA[0] + (C[1] - a[1]) * nA[1] > -1e-4) continue;
      if ((C[0] - b[0]) * nB[0] + (C[1] - b[1]) * nB[1] > -1e-4) continue;
      const d1 = Math.hypot(C[0] - a[0], C[1] - a[1]);
      const d2 = Math.hypot(C[0] - b[0], C[1] - b[1]);
      const score = Math.abs(nA[0] * nB[0] + nA[1] * nB[1]) * 10 + Math.abs(d1 - d2);
      if (score < bestScore) { bestScore = score; best = { nA, nB, C, d1, d2 }; }
    }
    if (best) {
      const ang1 = (Math.acos(clamp(Math.abs(u[0] * best.nA[0] + u[1] * best.nA[1]), 0, 1)) * 180) / Math.PI;
      const odx = best.C[0] - M[0], ody = best.C[1] - M[1];
      const ol = Math.hypot(odx, ody) || 1;
      const outDir = [odx / ol, ody / ol];
      if (Math.abs(ang1 - 45) < 0.5 && Math.abs(best.d1 - best.d2) < Math.max(0.05, best.d1 * 0.02)) {
        return { p: M, dir: outDir, dist: (best.d1 + best.d2) * 0.5, ang: 45 };
      }
      return { p: M, dir: outDir, dist: best.d1, ang: ang1 };
    }
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dx > 1e-3 && dy > 1e-3) {
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const is45 = Math.abs(ang - 45) < 0.5;
      const bx = v.geo.box, cx = (bx[0] + bx[2]) * 0.5, cy = (bx[1] + bx[3]) * 0.5;
      let nx = -u[1], ny = u[0];
      if ((M[0] - cx) * nx + (M[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
      return { p: M, dir: [nx, ny], dist: is45 ? (dx + dy) * 0.5 : dx, ang: is45 ? 45 : ang };
    }
    return null;
  }
  function chamferEdgeAt(name, P) {
    const v = layout.views[name]; if (!v) return null;
    const tol = Math.max(2.6, 4.2 / zoom);
    const cands = [];
    for (const seg of straightSegsOf(v, false)) {
      const A = toSheet(v, seg.a), B = toSheet(v, seg.b);
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
      if (L2 < 1e-6) continue;
      const t = clamp(((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2, 0, 1);
      const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
      if (d >= tol) continue;
      const info = analyzeChamfer(v, seg);
      if (info) cands.push({ seg, info, d, L: seg.L });
    }
    if (!cands.length) return null;
    cands.sort((p, q) => (Math.abs(p.d - q.d) < 0.6 ? p.L - q.L : p.d - q.d));
    return cands[0];
  }
  function pickDimPoint(name, P) {
    const sn = snapIn(name, P);
    if (sn) return sn;
    const ed = edgeAt(name, P, false);
    if (!ed) return null;
    const v = layout.views[name];
    const dx = Math.abs(ed.b[0] - ed.a[0]), dy = Math.abs(ed.b[1] - ed.a[1]);
    const preferDir = dy > dx * 4 ? 'h' : dx > dy * 4 ? 'v' : null;
    return { p: ed.hit, S: toSheet(v, ed.hit), edge: ed, preferDir };
  }
  function angularSector(V, e1, e2, q) {
    const rayAngles = (edge) => {
      const dA = Math.hypot(edge.a[0] - V[0], edge.a[1] - V[1]);
      const dB = Math.hypot(edge.b[0] - V[0], edge.b[1] - V[1]);
      const ref = dA >= dB ? edge.a : edge.b;
      let a = Math.atan2(ref[1] - V[1], ref[0] - V[0]);
      if (a < 0) a += TWO_PI;
      return [a, (a + Math.PI) % TWO_PI];
    };
    const r1 = rayAngles(e1), r2 = rayAngles(e2);
    const rays = [...r1, ...r2].sort((a, b) => a - b);
    const distQ = Math.hypot(q[0] - V[0], q[1] - V[1]);
    let aq = distQ > 1e-4 ? Math.atan2(q[1] - V[1], q[0] - V[0]) : ((r1[0] + r2[0]) * 0.5);
    if (aq < 0) aq += TWO_PI;
    for (let i = 0; i < 4; i++) {
      const a0 = rays[i], a1 = i < 3 ? rays[i + 1] : rays[0] + TWO_PI;
      const qN = i === 3 && aq < rays[0] ? aq + TWO_PI : aq;
      if (qN >= a0 - 1e-6 && qN <= a1 + 1e-6) {
        return { a0, a1, r: Math.max(4, distQ), e1: [e1.a, e1.b], e2: [e2.a, e2.b] };
      }
    }
    return { a0: rays[0], a1: rays[1], r: Math.max(4, distQ), e1: [e1.a, e1.b], e2: [e2.a, e2.b] };
  }
  function sectionParentAt(P) {
    for (const name of ['front', 'top', 'left']) {
      const v = layout && layout.views && layout.views[name];
      if (!v) continue;
      const b = v.geo.box;
      const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 14 && P[0] <= B[0] + 14 && P[1] >= A[1] - 14 && P[1] <= B[1] + 14) return name;
    }
    return null;
  }
  function snapSectionPt(name, P, anchorA, shiftKey, altKey) {
    const v = layout.views[name];
    if (!v) return [0, 0];
    let q = toView(v, P);
    if (altKey) return q;
    const tol = Math.max(1.2, 3.2 / zoom / v.s);
    const b = v.geo.box;
    const center = [(b[0] + b[2]) * 0.5, (b[1] + b[3]) * 0.5];
    const snapTargets = [center, ...v.geo.circles.map((c) => c.c), ...v.geo.points];
    const alignTargets = [center, ...v.geo.circles.map((c) => c.c)];
    if (!anchorA) {
      let best = null, bd = tol;
      for (const p of snapTargets) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) return [best[0], best[1]];
      let bx = null, bxd = tol, by = null, byd = tol;
      for (const p of alignTargets) {
        const dx = Math.abs(p[0] - q[0]), dy = Math.abs(p[1] - q[1]);
        if (dx < bxd) { bxd = dx; bx = p[0]; }
        if (dy < byd) { byd = dy; by = p[1]; }
      }
      if (bx != null) q[0] = bx;
      if (by != null) q[1] = by;
      return q;
    }
    const dx = q[0] - anchorA[0], dy = q[1] - anchorA[1];
    if (shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) return [q[0], anchorA[1]];
      return [anchorA[0], q[1]];
    }
    if (Math.abs(dy) < Math.abs(dx) * 0.105) return [q[0], anchorA[1]];
    if (Math.abs(dx) < Math.abs(dy) * 0.105) return [anchorA[0], q[1]];
    let best = null, bd = tol;
    for (const p of snapTargets) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? [best[0], best[1]] : q;
  }
  function isMainMovable(name, sh = dwg()) {
    return ['front', 'top', 'left', 'iso'].includes(name) || (sh.extraViews || []).some((v) => v.id === name);
  }
  function movableViewAt(P) {
    if (!layout || !layout.views) return null;
    const sh = dwg();
    const names = [...Object.keys(layout.views).filter((k) => k.startsWith('sec_')), 'front', 'top', 'left', 'iso', ...(sh.extraViews || []).map((e) => e.id)];
    for (const name of names) {
      const v = layout.views[name];
      if (!v || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 4 && P[0] <= B[0] + 4 && P[1] >= A[1] - 4 && P[1] <= B[1] + 4) return name;
    }
    return null;
  }
  function moveView(viewName, dx, dy) {
    const numDx = Number(dx) || 0, numDy = Number(dy) || 0;
    if (!numDx && !numDy) return false;
    const lay = layout || computeLayout(dwg());
    if (isMainMovable(viewName)) {
      if (!lay.views[viewName]) return false;
      App.change('Ansicht verschoben', () => {
        const d = dwg();
        if (!d.viewPos || typeof d.viewPos !== 'object') d.viewPos = {};
        const cur = Array.isArray(d.viewPos[viewName]) ? d.viewPos[viewName] : [0, 0];
        d.viewPos[viewName] = [Number(cur[0] || 0) + numDx, Number(cur[1] || 0) + numDy];
      });
      render(); Panels.renderRight();
      return true;
    }
    if (String(viewName).startsWith('sec_')) {
      const secId = String(viewName).slice(4);
      const sec = (dwg().sections || []).find((x) => x.id === secId);
      const v = lay.views[viewName];
      if (!sec || !v) return false;
      const b = v.geo.box;
      const curPx = v.ox + b[0] * v.s, curPy = v.oy - b[3] * v.s;
      App.change('Ansicht verschoben', () => {
        const s = (dwg().sections || []).find((x) => x.id === secId);
        if (s) s.pos = [curPx + numDx, curPy + numDy];
      });
      render(); Panels.renderRight();
      return true;
    }
    const det = (dwg().details || []).find((x) => x.id === viewName);
    const dv = lay.views[viewName];
    if (det && dv && dv.sheetCenter) {
      return updateDetail(det.id, { pos: [dv.sheetCenter[0] + numDx, dv.sheetCenter[1] + numDy] });
    }
    return false;
  }
  function setViewOffset(viewName, off) {
    if (!isMainMovable(viewName) || !Array.isArray(off) || off.length < 2) return false;
    App.change('Ansicht verschoben', () => {
      const d = dwg();
      if (!d.viewPos || typeof d.viewPos !== 'object') d.viewPos = {};
      d.viewPos[viewName] = [Number(off[0]) || 0, Number(off[1]) || 0];
    });
    render(); Panels.renderRight();
    return true;
  }
  function resetViewPos(viewName = null) {
    const d = dwg();
    const hasMain = d.viewPos && Object.keys(d.viewPos).length > 0;
    const hasSec = (d.sections || []).some((s) => Array.isArray(s.pos));
    if (!hasMain && !hasSec && !viewName) return false;
    App.change('Ansichten zurückgesetzt', () => {
      const sh = dwg();
      if (viewName) {
        if (sh.viewPos) delete sh.viewPos[viewName];
        if (String(viewName).startsWith('sec_')) {
          const s = (sh.sections || []).find((x) => x.id === String(viewName).slice(4));
          if (s) s.pos = null;
        }
      } else {
        sh.viewPos = {};
        for (const s of sh.sections || []) s.pos = null;
      }
    });
    render(); Panels.renderRight();
    return true;
  }
  // ---------- Hinweislinien / Notizen (ZE-11) ----------
  function leaderViewAt(P) {
    if (!layout || !layout.views) return null;
    for (const [name, v] of Object.entries(layout.views)) {
      if (v.detail && Math.hypot(P[0] - v.sheetCenter[0], P[1] - v.sheetCenter[1]) <= v.sheetR + 6) return name;
    }
    let best = null;
    for (const [name, v] of Object.entries(layout.views)) {
      if (name === 'free' || v.detail || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 6 && P[0] <= B[0] + 6 && P[1] >= A[1] - 6 && P[1] <= B[1] + 6) best = name;
    }
    return best;
  }
  function pickLeaderTarget(P) {
    const name = leaderViewAt(P);
    if (!name || !layout || !layout.views[name]) {
      return { view: null, anchor: [P[0], P[1]], sheetPt: [P[0], P[1]], targetKind: 'free', autoTip: 'arrow' };
    }
    const v = layout.views[name];
    const tol = Math.max(2.5, 3.8 / zoom);
    let bestPt = null, bd = tol;
    for (const seg of straightSegsOf(v, false)) {
      const A = toSheet(v, seg.a), B = toSheet(v, seg.b);
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
      if (L2 < 1e-6) continue;
      const t = clamp(((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2, 0, 1);
      const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
      if (d < bd) { bd = d; bestPt = [seg.a[0] + t * (seg.b[0] - seg.a[0]), seg.a[1] + t * (seg.b[1] - seg.a[1])]; }
    }
    const q = toView(v, P);
    for (const c of v.geo.circles || []) {
      const dist = Math.hypot(q[0] - c.c[0], q[1] - c.c[1]);
      const d = Math.abs(dist - c.r) * v.s;
      if (d >= bd) continue;
      let ang = dist > 1e-6 ? angOf(c.c, q) : 0;
      if (c.arc) {
        let a = ang;
        if (a < c.arc[0] - 0.08) a += TWO_PI;
        if (a > c.arc[1] + 0.08) continue;
      }
      bd = d;
      bestPt = [c.c[0] + Math.cos(ang) * c.r, c.c[1] + Math.sin(ang) * c.r];
    }
    for (const p of v.geo.polys || []) {
      if (p.c || !p.pts || p.pts.length <= 2) continue;
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i], b = p.pts[i + 1];
        const A = toSheet(v, a), B = toSheet(v, b);
        const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
        if (L2 < 1e-6) continue;
        const t = clamp(((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2, 0, 1);
        const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
        if (d < bd) { bd = d; bestPt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; }
      }
    }
    if (bestPt) {
      return { view: name, anchor: bestPt, sheetPt: toSheet(v, bestPt), targetKind: 'edge', autoTip: 'arrow' };
    }
    const bx = v.geo.box;
    const inBox = q[0] >= bx[0] - 1e-4 && q[0] <= bx[2] + 1e-4 && q[1] >= bx[1] - 1e-4 && q[1] <= bx[3] + 1e-4;
    const inDet = !v.detail || Math.hypot(q[0] - v.detail.c[0], q[1] - v.detail.c[1]) <= v.detail.r + 1e-4;
    if (inBox && inDet) {
      return { view: name, anchor: [q[0], q[1]], sheetPt: [P[0], P[1]], targetKind: 'face', autoTip: 'dot' };
    }
    return { view: null, anchor: [P[0], P[1]], sheetPt: [P[0], P[1]], targetKind: 'free', autoTip: 'arrow' };
  }
  function notes(sh = dwg()) { return (sh.notes || []).slice(); }
  function addNote(opts = {}) {
    const text = String(opts.text ?? '').trim();
    if (!text) return null;
    const tip = opts.tip === 'dot' ? 'dot' : 'arrow';
    const note = {
      id: uid('ln'),
      view: opts.view || null,
      anchor: Array.isArray(opts.anchor) ? [Number(opts.anchor[0]) || 0, Number(opts.anchor[1]) || 0] : [0, 0],
      elbow: Array.isArray(opts.elbow) ? [Number(opts.elbow[0]) || 0, Number(opts.elbow[1]) || 0] : [14, -10],
      tip,
      text,
      targetKind: opts.targetKind || (opts.view ? (tip === 'dot' ? 'face' : 'edge') : 'free'),
    };
    App.change('Hinweislinie hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.notes)) d.notes = [];
      d.notes.push(note);
    });
    selDim = note.id;
    render(); Panels.renderRight();
    return note;
  }
  function updateNote(id, patch = {}) {
    let changed = false;
    App.change('Hinweislinie geändert', () => {
      const n = (dwg().notes || []).find((x) => x.id === id);
      if (!n) return;
      if (patch.text != null) {
        const clean = String(patch.text).trim();
        if (clean && clean !== n.text) { n.text = clean; changed = true; }
      }
      if (patch.tip === 'arrow' || patch.tip === 'dot') {
        if (n.tip !== patch.tip) { n.tip = patch.tip; changed = true; }
      }
      if (Array.isArray(patch.elbow) && patch.elbow.length >= 2) {
        n.elbow = [Number(patch.elbow[0]) || 0, Number(patch.elbow[1]) || 0];
        changed = true;
      }
      if (Array.isArray(patch.anchor) && patch.anchor.length >= 2) {
        n.anchor = [Number(patch.anchor[0]) || 0, Number(patch.anchor[1]) || 0];
        changed = true;
      }
    });
    if (changed) { render(); Panels.renderRight(); }
    return changed;
  }
  function removeNote(id) {
    const cur = (dwg().notes || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Hinweislinie gelöscht', () => {
      const d = dwg();
      d.notes = (d.notes || []).filter((x) => x.id !== id);
    });
    if (selDim === id) selDim = null;
    render(); Panels.renderRight();
    return true;
  }
  async function editNoteText(id) {
    const n = (dwg().notes || []).find((x) => x.id === id);
    if (!n) return;
    const t = await UI.prompt('Notiz ändern', 'Text', n.text, 'Ändern');
    if (t != null && t.trim()) updateNote(id, { text: t });
  }
  async function noteClick(P) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const target = pickLeaderTarget(P);
      const tip = noteDraft.tip === 'auto' ? target.autoTip : noteDraft.tip;
      toolState = { stage: 1, target, tip, P };
      render();
      return;
    }
    const target = st.target;
    const v = target.view && layout && layout.views[target.view];
    const A = v ? toSheet(v, target.anchor) : target.anchor;
    let elbow = [P[0] - A[0], P[1] - A[1]];
    if (Math.hypot(elbow[0], elbow[1]) < 3) elbow = [14, -10];
    const tip = noteDraft.tip === 'auto' ? target.autoTip : noteDraft.tip;
    let txt = String(noteDraft.text || '').trim();
    toolState = { stage: 0 };
    if (!txt) {
      render();
      const entered = await UI.prompt('Notiz mit Hinweislinie', 'Text', '', 'Einfügen');
      txt = entered ? entered.trim() : '';
    }
    if (txt) {
      addNote({ view: target.view, anchor: target.anchor, elbow, tip, text: txt, targetKind: target.targetKind });
    } else {
      render();
    }
  }
  function previewNote(lines, texts) {
    const st = toolState;
    if (!st) return;
    if (st.stage === 0 && st.target && st.target.sheetPt) {
      const S = st.target.sheetPt;
      const r = st.target.targetKind === 'face' ? Math.max(0.9, 1.1 / zoom) : (1.3 / zoom) * 1.5;
      lines.push({ circle: [S[0], S[1], r], cls: st.target.targetKind === 'face' ? 'leader-dot' : 'snap' });
      return;
    }
    if (st.stage === 1 && st.target && st.P) {
      const v = st.target.view && layout && layout.views[st.target.view];
      const A = v ? toSheet(v, st.target.anchor) : st.target.anchor;
      let elbow = [st.P[0] - A[0], st.P[1] - A[1]];
      if (Math.hypot(elbow[0], elbow[1]) < 3) elbow = [14, -10];
      const tip = noteDraft.tip === 'auto' ? st.target.autoTip : noteDraft.tip;
      drawLeaderNote({
        id: '__noteprev',
        view: st.target.view,
        anchor: st.target.anchor,
        elbow,
        tip,
        text: String(noteDraft.text || '').trim() || 'Notiz',
      }, lines, texts, layout, dwg());
    }
  }
  function onMove(e) {
    if (dragDetail) {
      const P = sheetPt(e);
      dragDetail.curPos = [dragDetail.origPos[0] + (P[0] - dragDetail.startP[0]), dragDetail.origPos[1] + (P[1] - dragDetail.startP[1])];
      if (Math.hypot(P[0] - dragDetail.startP[0], P[1] - dragDetail.startP[1]) > 0.5) dragDetail.moved = true;
      render();
      return;
    }
    if (dragNote) {
      const P = sheetPt(e);
      dragNote.curElbow = [dragNote.origElbow[0] + (P[0] - dragNote.startP[0]), dragNote.origElbow[1] + (P[1] - dragNote.startP[1])];
      if (Math.hypot(P[0] - dragNote.startP[0], P[1] - dragNote.startP[1]) > 0.5) dragNote.moved = true;
      render();
      return;
    }
    if (dragView) {
      const P = sheetPt(e);
      const dx = P[0] - dragView.startP[0], dy = P[1] - dragView.startP[1];
      if (Math.hypot(dx, dy) > 1.2) dragView.moved = true;
      if (dragView.kind === 'main') dragView.curOff = [dragView.origOff[0] + dx, dragView.origOff[1] + dy];
      else if (dragView.kind === 'section') dragView.curPos = [dragView.origPos[0] + dx, dragView.origPos[1] + dy];
      if (dragView.moved) render();
      return;
    }
    if (tool === 'note') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      if (toolState.stage === 0) toolState.target = pickLeaderTarget(P);
      render();
      return;
    }
    if (tool === 'dim') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      const name = toolState.view || viewAt(P);
      toolState.hoverView = name;
      if (dimMode === 'dia' || dimMode === 'rad') {
        toolState.hoverCircle = name ? circleAt(name, P, true) : null;
        toolState.snap = null;
      } else if (dimMode === 'chamfer') {
        toolState.hoverChamfer = name ? chamferEdgeAt(name, P) : null;
        toolState.snap = null;
      } else if (dimMode === 'ang') {
        toolState.hoverEdge = (toolState.stage < 2 && name) ? edgeAt(name, P, true) : null;
        toolState.snap = null;
      } else if (dimMode === 'chain' || dimMode === 'base') {
        toolState.snap = name ? pickDimPoint(name, P) : null;
      } else {
        toolState.snap = name ? snapIn(name, P) : null;
      }
      render();
    } else if (tool === 'detail') {
      toolState = toolState || { stage: 0 };
      toolState.P = sheetPt(e);
      render();
    } else if (tool === 'section') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      if (toolState.stage === 1 && toolState.view) {
        toolState.b = snapSectionPt(toolState.view, P, toolState.a, e.shiftKey, e.altKey);
      } else {
        const name = sectionParentAt(P);
        toolState.hoverView = name;
        toolState.snapPt = name ? snapSectionPt(name, P, null, e.shiftKey, e.altKey) : null;
      }
      render();
    } else if (tool && tool.startsWith('free-')) { freeMove(e); }
  }
  function centerAt(P) {
    const tol = Math.max(1.8, 2.6 / zoom);
    let best = null, bd = tol;
    for (const l of lastLines) {
      if (l.cls !== 'ctr' || !l.id || !l.pts || l.pts.length < 2) continue;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        let t = L2 ? ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(P[0] - (a[0] + t * dx), P[1] - (a[1] + t * dy));
        if (d < bd) { bd = d; best = l.id; }
      }
    }
    return best;
  }
  function onContextMenu(e) {
    if (tool) return;
    const t = e.target.closest && e.target.closest('.ctr[data-id]');
    const P = sheetPt(e);
    const id = t ? t.dataset.id : centerAt(P);
    if (!id || !String(id).startsWith('ctr|')) return;
    e.preventDefault();
    selDim = id;
    render(); Panels.renderRight();
    const c = findCenterById(id);
    const isCross = c ? c.type === 'cross' : id.includes('|x|');
    const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
    const entries = [
      { label: isCross ? 'Mittelkreuz ausblenden' : 'Mittellinie ausblenden', icon: 'eyeOff', run: () => hideCenter(id) },
    ];
    if ((dwg().hiddenCenters || []).length) {
      entries.push({ label: 'Alle Mittellinien einblenden', icon: 'eye', run: () => showAllCenters() });
    }
    UI.menu(anchor, entries);
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const P = sheetPt(e);
    if (tool === 'dim') { dimClick(P, e); return; }
    if (tool === 'detail') { detailClick(P); return; }
    if (tool === 'section') { sectionDown(P, e); return; }
    if (tool === 'note') { noteClick(P); return; }
    if (tool && tool.startsWith('free-')) { freeDown(e); return; }
    const t = e.target.closest && e.target.closest('[data-id]');
    selDim = t ? t.dataset.id : centerAt(P);
    if (selDim && layout && layout.views[selDim] && layout.views[selDim].detail) {
      dragDetail = { id: selDim, startP: P, origPos: [...layout.views[selDim].sheetCenter], curPos: null, moved: false };
    } else if (selDim && (dwg().notes || []).some((x) => x.id === selDim)) {
      const noteObj = dwg().notes.find((x) => x.id === selDim);
      if (e.detail === 2) { editNoteText(selDim); render(); Panels.renderRight(); return; }
      dragNote = { id: selDim, startP: P, origElbow: [...(noteObj.elbow || [14, -10])], curElbow: null, moved: false };
    } else if (!selDim) {
      const hitV = viewAtAll(P);
      if (hitV) selView = hitV;
      const mv = movableViewAt(P);
      if (mv && String(mv).startsWith('sec_')) {
        const v = layout.views[mv], b = v.geo.box, secId = mv.slice(4);
        dragView = { kind: 'section', secId, startP: P, origPos: [v.ox + b[0] * v.s, v.oy - b[3] * v.s], curPos: null, moved: false };
      } else if (mv && isMainMovable(mv)) {
        const curOff = (dwg().viewPos && Array.isArray(dwg().viewPos[mv])) ? dwg().viewPos[mv] : [0, 0];
        dragView = { kind: 'main', name: mv, startP: P, origOff: [Number(curOff[0]) || 0, Number(curOff[1]) || 0], curOff: null, moved: false };
      }
    }
    if (t && e.detail === 2) editFreeText(selDim);
    render(); Panels.renderRight();
  }
  function onUp(e) {
    if (dragDetail) {
      const d = dragDetail;
      dragDetail = null;
      if (d.moved && d.curPos) updateDetail(d.id, { pos: d.curPos });
      return;
    }
    if (dragNote) {
      const d = dragNote;
      dragNote = null;
      if (d.moved && d.curElbow) updateNote(d.id, { elbow: d.curElbow });
      return;
    }
    if (dragView) {
      const d = dragView;
      dragView = null;
      if (d.moved) {
        if (d.kind === 'main' && d.curOff) setViewOffset(d.name, d.curOff);
        else if (d.kind === 'section' && d.curPos) {
          App.change('Ansicht verschoben', () => {
            const s = (dwg().sections || []).find((x) => x.id === d.secId);
            if (s) s.pos = [d.curPos[0], d.curPos[1]];
          });
          render(); Panels.renderRight();
        }
      }
      return;
    }
    if (!e || e.button !== 0 || tool !== 'section' || !toolState || toolState.stage !== 1 || !svg) return;
    const P = sheetPt(e);
    const downP = toolState.downSheet || P;
    if (Math.hypot(P[0] - downP[0], P[1] - downP[1]) < 4) return;
    const a = toolState.a;
    const b = snapSectionPt(toolState.view, P, a, e.shiftKey, e.altKey);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2) {
      addSection({ parent: toolState.view, a, b });
    } else {
      toolState = { stage: 0 };
      render();
    }
  }
  function detailClick(P) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const src = sourceViewAt(P);
      if (!src) { UI.toast('Klick auf die Vorder-, Drauf- oder Seitenansicht für die Mitte des Detailkreises.', { icon: 'info', ms: 2500 }); return; }
      const c = toView(layout.views[src], P);
      toolState = { stage: 1, source: src, c, P };
    } else if (st.stage === 1) {
      const v = layout.views[st.source];
      const q = toView(v, P);
      const r = Math.hypot(q[0] - st.c[0], q[1] - st.c[1]);
      if (r < 0.5) { UI.toast('Zieh den Kreis etwas größer auf.', { icon: 'info', ms: 2000 }); return; }
      toolState = { ...st, stage: 2, r, P };
    } else if (st.stage === 2) {
      addDetail({ source: st.source, c: st.c, r: st.r, scale: detailDraft.scale, label: detailDraft.label, pos: P });
      setTool(null);
      return;
    }
    render();
  }
  function previewDetail(lines, texts) {
    const st = toolState;
    if (!st || st.stage === 0 || !st.P) return;
    const v = layout.views[st.source];
    if (!v) return;
    const SC = toSheet(v, st.c);
    const r = st.stage === 1 ? Math.hypot(toView(v, st.P)[0] - st.c[0], toView(v, st.P)[1] - st.c[1]) : st.r;
    if (r > 0.2) {
      lines.push({ circle: [SC[0], SC[1], r * v.s], cls: 'prev' });
      texts.push({ x: SC[0] + r * v.s * 0.707 + 3.5, y: SC[1] - r * v.s * 0.707 - 2, t: detailDraft.label, size: 4, anchor: 'middle', cls: 'detail-lbl' });
    }
    if (st.stage === 2) {
      const ds = Math.max(0.1, Number(detailDraft.scale) || 2);
      const DR = st.r * ds;
      lines.push({ circle: [st.P[0], st.P[1], DR], cls: 'prev' });
      texts.push({ x: st.P[0], y: st.P[1] - DR - 3, t: `Detail ${detailDraft.label} (${scaleText(ds)})`, size: 4, anchor: 'middle', cls: 'detail-lbl' });
    }
  }
  function sectionDown(P, e) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const name = sectionParentAt(P);
      if (!name) { UI.toast('Zieh oder klick eine Schnittlinie durch die Vorder-, Drauf- oder Seitenansicht.', { icon: 'info', ms: 2200 }); return; }
      const a = snapSectionPt(name, P, null, e.shiftKey, e.altKey);
      toolState = { stage: 1, view: name, a, b: a, downSheet: P, P };
      render();
    } else if (st.stage === 1) {
      const b = snapSectionPt(st.view, P, st.a, e.shiftKey, e.altKey);
      if (Math.hypot(b[0] - st.a[0], b[1] - st.a[1]) < 2) return;
      addSection({ parent: st.view, a: st.a, b });
    }
  }
  function previewSection(lines, texts) {
    const st = toolState;
    if (!st) return;
    if (st.stage === 0 && st.hoverView && st.snapPt) {
      const v = layout.views[st.hoverView];
      if (v) {
        const S = toSheet(v, st.snapPt);
        lines.push({ circle: [S[0], S[1], (1.4 / zoom) * 1.4], cls: 'snap' });
      }
      return;
    }
    if (st.stage === 1 && st.view && st.a && st.b) {
      const v = layout.views[st.view];
      if (!v) return;
      const A = toSheet(v, st.a), B = toSheet(v, st.b);
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.5) {
        lines.push({ circle: [A[0], A[1], (1.4 / zoom) * 1.4], cls: 'snap' });
        return;
      }
      const lbl = nextSectionLabel();
      drawSectionLine(v, { id: '__secprev', label: lbl, parent: st.view, a: st.a, b: st.b, flip: false }, lines, texts);
    }
  }
  function nextSectionLabel(sh = dwg()) {
    const used = new Set((sh.sections || []).map((s) => s.label));
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (const ch of letters) if (!used.has(ch)) return ch;
    let n = 1;
    while (used.has('A' + n)) n++;
    return 'A' + n;
  }
  async function addSection(opts) {
    if (!opts || !opts.parent || !opts.a || !opts.b) return null;
    if (Math.hypot(opts.b[0] - opts.a[0], opts.b[1] - opts.a[1]) < 1e-3) return null;
    let sec = null;
    App.change('Schnittansicht hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.sections)) d.sections = [];
      sec = {
        id: uid('sec'),
        label: opts.label || nextSectionLabel(d),
        parent: opts.parent,
        a: [opts.a[0], opts.a[1]],
        b: [opts.b[0], opts.b[1]],
        flip: !!opts.flip,
        pos: opts.pos || null,
      };
      d.sections.push(sec);
    });
    selDim = sec.id;
    tool = null;
    toolState = null;
    if (svg) svg.style.cursor = '';
    UI.hint(null);
    Panels.renderTools();
    await ensureProjections();
    render();
    Panels.renderRight();
    return sec;
  }
  async function flipSection(id) {
    const cur = (dwg().sections || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Schnittrichtung umgekehrt', () => {
      const s = (dwg().sections || []).find((x) => x.id === id);
      if (s) s.flip = !s.flip;
    });
    await ensureProjections();
    render();
    Panels.renderRight();
    return true;
  }
  function removeSection(id) {
    const cur = (dwg().sections || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Schnittansicht gelöscht', () => {
      const d = dwg();
      d.sections = (d.sections || []).filter((x) => x.id !== id);
      d.dims = (d.dims || []).filter((x) => x.view !== 'sec_' + id);
      d.notes = (d.notes || []).filter((x) => x.view !== 'sec_' + id);
      d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|sec_' + id + '|'));
    });
    if (selDim === id) selDim = null;
    render();
    Panels.renderRight();
    return true;
  }
  function dimClick(P, e) {
    const st = toolState || { stage: 0 };
    if (dimMode === 'dia' || dimMode === 'rad') {
      const name = viewAt(P); if (!name) return;
      const c = circleAt(name, P, true);
      if (!c) { UI.toast('Klick auf einen Kreis, eine Bohrung oder eine Rundung.', { icon: 'info', ms: 2000 }); return; }
      addDim({ view: name, type: dimMode, c: c.c, r: c.r, ang: Math.round(c.ang), ...(c.full ? {} : { partial: true }), ref: makeCircleRef(layout.views[name], c) });
      return;
    }
    if (dimMode === 'chamfer') {
      const name = viewAt(P); if (!name) return;
      const ch = chamferEdgeAt(name, P);
      if (!ch) { UI.toast('Klick auf eine schräge Fasen-Kante (z. B. 45°).', { icon: 'info', ms: 2000 }); return; }
      addDim({ view: name, type: 'chamfer', p: ch.info.p, dir: ch.info.dir, dist: ch.info.dist, ang: ch.info.ang, ref: makeChamferRef(layout.views[name], ch.seg, ch.info) });
      return;
    }
    if (dimMode === 'ang') {
      if (st.stage === 0) {
        const name = viewAt(P); if (!name) return;
        const ed = edgeAt(name, P, true);
        if (!ed) { UI.toast('Klick auf die erste Kante.', { icon: 'info', ms: 1800 }); return; }
        toolState = { ...st, stage: 1, view: name, e1: ed, P };
      } else if (st.stage === 1) {
        const ed = edgeAt(st.view, P, true);
        if (!ed) { UI.toast('Klick auf die zweite Kante in derselben Ansicht.', { icon: 'info', ms: 1800 }); return; }
        const V = lineIntersect2D(st.e1.a, st.e1.b, ed.a, ed.b);
        if (!V) { UI.toast('Diese beiden Kanten sind parallel – wähle zwei Kanten im Winkel zueinander.', { icon: 'info', ms: 2200 }); return; }
        toolState = { ...st, stage: 2, view: st.view, e1: st.e1, e2: ed, v: V, P };
      } else if (st.stage === 2) {
        const v = layout.views[st.view]; if (!v) return;
        const q = toView(v, P);
        const sec = angularSector(st.v, st.e1, st.e2, q);
        addDim({ view: st.view, type: 'ang', v: st.v, e1: sec.e1, e2: sec.e2, a0: sec.a0, a1: sec.a1, r: sec.r, ref: { kind: 'ang', e1: makeEdgeRef(v, st.e1), e2: makeEdgeRef(v, st.e2) } });
        return;
      }
      render();
      return;
    }
    if (dimMode === 'chain' || dimMode === 'base') {
      const isBase = dimMode === 'base';
      if (st.stage === 0) {
        const name = viewAt(P); if (!name) return;
        const sn = pickDimPoint(name, P);
        if (!sn) { UI.toast(isBase ? 'Klick auf eine Bezugskante oder einen Bezugspunkt.' : 'Klick auf einen Punkt oder eine Kante.', { icon: 'info', ms: 2000 }); return; }
        toolState = { ...st, stage: 1, view: name, a: sn.p, aEdge: sn.edge || null, preferDir: sn.preferDir || null, P };
      } else if (st.stage === 1) {
        const sn = pickDimPoint(st.view, P); if (!sn) return;
        if (Math.hypot(sn.p[0] - st.a[0], sn.p[1] - st.a[1]) < 1e-4) return;
        toolState = { ...st, stage: 2, b: sn.p, bEdge: sn.edge || null, P };
      } else if (st.stage === 2) {
        const v = layout.views[st.view]; if (!v) return;
        const q = toView(v, P);
        const dir = chainDir(st.a, st.b, q, st.preferDir);
        const linePos = dir === 'h' ? q[1] : q[0];
        const aRef = makePointRef(v, st.a, st.aEdge), bRef = makePointRef(v, st.b, st.bEdge);
        const dimData = isBase
          ? { view: st.view, type: 'base', dir, linePos, base: st.a, pts: [st.b], ref: { kind: 'base', base: aRef, pts: [bRef] } }
          : { view: st.view, type: 'chain', dir, linePos, pts: [st.a, st.b], ref: { kind: 'chain', pts: [aRef, bRef] } };
        if (st.rebindId) {
          const targetId = st.rebindId;
          App.change('Maß neu zugeordnet', () => {
            const d = dwg();
            const idx = (d.dims || []).findIndex((x) => x.id === targetId);
            if (idx >= 0) {
              const old = d.dims[idx];
              d.dims[idx] = { ...dimData, id: old.id, ...(old.tol ? { tol: old.tol } : {}) };
            }
          });
          selDim = targetId;
          toolState = { stage: 3, view: st.view, dimId: targetId, dir, linePos, P };
          lastLostKey = lostDims(dwg()).map((x) => x.id).sort().join(',');
          Panels.renderRight();
        } else {
          const dim = { id: uid('d'), ...dimData };
          App.change(isBase ? 'Bezugsmaß hinzugefügt' : 'Kettenmaß hinzugefügt', () => { dwg().dims.push(dim); });
          selDim = dim.id;
          toolState = { stage: 3, view: st.view, dimId: dim.id, dir, linePos, P };
          Panels.renderRight();
        }
      } else if (st.stage === 3) {
        const hitView = viewAt(P);
        if (hitView && hitView !== st.view) { toolState = { stage: 0 }; render(); Panels.renderRight(); return; }
        const sn = pickDimPoint(st.view, P);
        if (!sn) {
          if (!hitView) { toolState = { stage: 0 }; render(); Panels.renderRight(); }
          return;
        }
        const cur = dwg().dims.find((x) => x.id === st.dimId);
        if (!cur) { toolState = { stage: 0 }; render(); return; }
        const coord = st.dir === 'h' ? sn.p[0] : sn.p[1];
        const existing = [...(cur.pts || []), ...(cur.base ? [cur.base] : [])];
        if (existing.some((p) => Math.abs((st.dir === 'h' ? p[0] : p[1]) - coord) < 1e-4)) return;
        const v = layout.views[st.view];
        const ptRef = v ? makePointRef(v, sn.p, sn.edge || null) : null;
        App.change(isBase ? 'Bezugsmaß erweitert' : 'Kettenmaß erweitert', () => {
          const d = dwg().dims.find((x) => x.id === st.dimId);
          if (d) {
            d.pts.push(sn.p);
            if (ptRef && d.ref && Array.isArray(d.ref.pts)) d.ref.pts.push(ptRef);
          }
        });
      }
      render();
      return;
    }
    if (st.stage === 0) {
      const name = viewAt(P); if (!name) return;
      const sn = snapIn(name, P);
      if (!sn) {
        const c = circleAt(name, P);
        if (c) {
          addDim({ view: name, type: c.full ? 'dia' : 'rad', c: c.c, r: c.r, ang: Math.round(c.ang), ...(c.full ? {} : { partial: true }), ref: makeCircleRef(layout.views[name], c) });
          return;
        }
        UI.toast('Klick auf einen Eckpunkt, eine Linie, einen Kreis oder eine Rundung.', { icon: 'info', ms: 2000 });
        return;
      }
      toolState = { ...st, stage: 1, view: name, a: sn.p, P };
    } else if (st.stage === 1) {
      const sn = snapIn(st.view, P); if (!sn) return;
      if (Math.hypot(sn.p[0] - st.a[0], sn.p[1] - st.a[1]) < 1e-6) return;
      toolState = { ...st, stage: 2, b: sn.p };
    } else if (st.stage === 2) {
      const v = layout.views[st.view]; const q = toView(v, P);
      const dimObj = placeDim(st.a, st.b, q);
      addDim({ view: st.view, ...dimObj, ref: { kind: 'lin', a: makePointRef(v, st.a), b: makePointRef(v, st.b) } });
    }
    render();
  }
  function chainDir(a, b, q, preferDir = null) {
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    if (dx > 1e-4 && dy <= 1e-4) return 'h';
    if (dy > 1e-4 && dx <= 1e-4) return 'v';
    const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5;
    const qx = Math.abs(q[0] - mx), qy = Math.abs(q[1] - my);
    if (preferDir === 'h' && qy >= qx * 0.5) return 'h';
    if (preferDir === 'v' && qx >= qy * 0.5) return 'v';
    return qy / (dy + 1e-9) >= qx / (dx + 1e-9) ? 'h' : 'v';
  }
  function placeDim(a, b, q) {
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const qx = q[0] - mx, qy = q[1] - my;
    let dir;
    if (dx > 1e-6 && dy > 1e-6) dir = Math.abs(qy) / (dy + 1e-9) > Math.abs(qx) / (dx + 1e-9) ? 'h' : 'v';
    else dir = dx >= dy ? 'h' : 'v';
    let off;
    if (dir === 'h') off = qy >= 0 ? Math.max(0.1, q[1] - Math.max(a[1], b[1])) : Math.min(-0.1, q[1] - Math.min(a[1], b[1]));
    else off = qx >= 0 ? Math.max(0.1, q[0] - Math.max(a[0], b[0])) : Math.min(-0.1, q[0] - Math.min(a[0], b[0]));
    return { type: 'lin', dir, a, b, off };
  }
  function previewDim(lines, texts) {
    const st = toolState;
    if (!st) return;
    if (st.snap) lines.push({ circle: [st.snap.S[0], st.snap.S[1], (1.2 / zoom) * 1.5], cls: 'snap' });
    if ((dimMode === 'dia' || dimMode === 'rad') && st.hoverCircle && st.hoverView) {
      const v = layout.views[st.hoverView];
      if (v) {
        const C = toSheet(v, st.hoverCircle.c);
        lines.push({ circle: [C[0], C[1], st.hoverCircle.r * v.s], cls: 'prev' });
        dimSVG({ id: '__prev', view: st.hoverView, type: dimMode, c: st.hoverCircle.c, r: st.hoverCircle.r, ang: Math.round(st.hoverCircle.ang), ...(st.hoverCircle.full ? {} : { partial: true }) }, lines, texts);
      }
      return;
    }
    if (dimMode === 'chamfer' && st.hoverChamfer && st.hoverView) {
      const v = layout.views[st.hoverView];
      if (v) {
        lines.push({ pts: [toSheet(v, st.hoverChamfer.seg.a), toSheet(v, st.hoverChamfer.seg.b)], cls: 'prev' });
        const ci = st.hoverChamfer.info;
        dimSVG({ id: '__prev', view: st.hoverView, type: 'chamfer', p: ci.p, dir: ci.dir, dist: ci.dist, ang: ci.ang }, lines, texts);
      }
      return;
    }
    if (dimMode === 'ang') {
      const v = layout.views[st.view || st.hoverView];
      if (st.hoverEdge && v) lines.push({ pts: [st.hoverEdge.A, st.hoverEdge.B], cls: 'prev' });
      if (st.stage >= 1 && st.e1 && v) lines.push({ pts: [toSheet(v, st.e1.a), toSheet(v, st.e1.b)], cls: 'prev' });
      if (st.stage === 2 && st.P && v) {
        lines.push({ pts: [toSheet(v, st.e2.a), toSheet(v, st.e2.b)], cls: 'prev' });
        const q = toView(v, st.P);
        const sec = angularSector(st.v, st.e1, st.e2, q);
        dimSVG({ id: '__prev', view: st.view, type: 'ang', v: st.v, e1: sec.e1, e2: sec.e2, a0: sec.a0, a1: sec.a1, r: sec.r }, lines, texts);
      }
      return;
    }
    if (dimMode === 'chain' || dimMode === 'base') {
      if (st.stage === 1 && st.P) { const v = layout.views[st.view]; if (v) lines.push({ pts: [toSheet(v, st.a), st.P], cls: 'prev' }); }
      if (st.stage === 2 && st.P) {
        const v = layout.views[st.view]; if (!v) return;
        const q = toView(v, st.P);
        const dir = chainDir(st.a, st.b, q, st.preferDir);
        const linePos = dir === 'h' ? q[1] : q[0];
        const d = dimMode === 'base'
          ? { id: '__prev', view: st.view, type: 'base', dir, linePos, base: st.a, pts: [st.b] }
          : { id: '__prev', view: st.view, type: 'chain', dir, linePos, pts: [st.a, st.b] };
        dimSVG(d, lines, texts);
      }
      if (st.stage === 3 && st.snap && st.snap.p) {
        const v = layout.views[st.view];
        if (v) lines.push({ circle: [st.snap.S[0], st.snap.S[1], (1.3 / zoom) * 1.6], cls: 'prev' });
      }
      return;
    }
    if (st.stage === 1 && st.P) { const v = layout.views[st.view]; const A = toSheet(v, st.a); lines.push({ pts: [A, st.P], cls: 'prev' }); }
    if (st.stage === 2 && st.P) { const v = layout.views[st.view]; const q = toView(v, st.P); const d = { id: '__prev', view: st.view, ...placeDim(st.a, st.b, q) }; dimSVG(d, lines, texts); }
  }
  function addDim(dim) {
    if (tool === 'dim' && toolState && toolState.rebindId) {
      rebindDim(toolState.rebindId, dim);
      return;
    }
    const next = { id: uid('d'), ...dim };
    if (!next.ref && !next.auto && layout && layout.views && layout.views[next.view]) {
      const r = buildDimRef(next, layout.views[next.view]);
      if (r) next.ref = r;
    }
    App.change('Maß hinzugefügt', () => { dwg().dims.push(next); });
    selDim = null;
    toolState = { stage: 0 };
    render();
    Panels.renderRight();
  }
  function removeDim(id) {
    if (!id) return false;
    const d = dwg();
    const cur = (d.dims || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Verlorenes Maß gelöscht', () => {
      const sh = dwg();
      sh.dims = (sh.dims || []).filter((x) => x.id !== id);
    });
    if (selDim === id) selDim = null;
    if (tool === 'dim' && toolState && toolState.rebindId === id) {
      setTool(null);
      return true;
    }
    render();
    lastLostKey = layout ? lostDims(dwg()).map((x) => x.id).sort().join(',') : '';
    Panels.renderRight();
    return true;
  }
  function removeLostDims() {
    const lost = lostDims(dwg());
    if (!lost.length) return 0;
    const ids = new Set(lost.filter((x) => !x.auto).map((x) => x.id));
    if (!ids.size) return 0;
    App.change('Verlorene Maße gelöscht', () => {
      const sh = dwg();
      sh.dims = (sh.dims || []).filter((x) => !ids.has(x.id));
    });
    if (selDim && ids.has(selDim)) selDim = null;
    if (tool === 'dim' && toolState && toolState.rebindId && ids.has(toolState.rebindId)) {
      tool = null; toolState = null; if (svg) svg.style.cursor = ''; UI.hint(null); Panels.renderTools();
    }
    render();
    lastLostKey = '';
    Panels.renderRight();
    UI.toast(`${ids.size} ${ids.size === 1 ? 'verlorenes Maß' : 'verlorene Maße'} gelöscht.`, { icon: 'trash', ms: 2000 });
    return ids.size;
  }
  function rebindDim(id, newDim) {
    if (!id || !newDim) return false;
    let updated = false;
    App.change('Maß neu zugeordnet', () => {
      const d = dwg();
      const idx = (d.dims || []).findIndex((x) => x.id === id);
      if (idx < 0) return;
      const old = d.dims[idx];
      const keep = { id: old.id };
      if (old.tol) keep.tol = old.tol;
      const next = { ...newDim, ...keep };
      delete next.auto;
      delete next.lost;
      delete next.lostReason;
      delete next.hiddenView;
      if (!next.ref && layout && layout.views && layout.views[next.view]) {
        const r = buildDimRef(next, layout.views[next.view]);
        if (r) next.ref = r;
      }
      d.dims[idx] = next;
      updated = true;
    });
    if (!updated) return false;
    tool = null;
    toolState = null;
    if (svg) svg.style.cursor = '';
    UI.hint(null);
    selDim = id;
    render();
    lastLostKey = layout ? lostDims(dwg()).map((x) => x.id).sort().join(',') : '';
    Panels.renderTools();
    Panels.renderRight();
    UI.toast('Maß neu zugeordnet.', { icon: 'check', ms: 2000 });
    return true;
  }
  function startRebind(id) {
    const d = dwg();
    const dim = (d.dims || []).find((x) => x.id === id && !x.auto);
    if (!dim) return false;
    selDim = id;
    dragDetail = null; dragNote = null; dragView = null;
    dimMode = DIM_MODES.some((x) => x.key === dim.type) ? dim.type : 'lin';
    tool = 'dim';
    toolState = { stage: 0, rebindId: id };
    if (svg) svg.style.cursor = 'crosshair';
    const what = dimMode === 'dia' ? 'die neue Bohrung oder den Kreis'
      : dimMode === 'rad' ? 'die neue Rundung oder den Bogen'
        : dimMode === 'chamfer' ? 'die neue Fasen-Kante'
          : dimMode === 'ang' ? 'zwei neue Kanten im Winkel'
            : 'neue Punkte oder Kanten';
    UI.hint(`<b>Maß neu zuordnen:</b> Klicke auf ${what} in einer Ansicht. <b>Esc</b> bricht ab.`);
    Panels.renderTools();
    Panels.renderRight();
    render();
    return true;
  }
  function flipAngleDim(id) {
    let changed = false;
    App.change('Gegenwinkel gewählt', () => {
      const d = dwg().dims.find((x) => x.id === id && x.type === 'ang');
      if (!d) return;
      const na0 = ((d.a1 % TWO_PI) + TWO_PI) % TWO_PI;
      const span = Math.PI - (d.a1 - d.a0);
      if (span <= 1e-4) return;
      d.a0 = na0;
      d.a1 = na0 + span;
      changed = true;
    });
    if (changed) { render(); Panels.renderRight(); }
    return changed;
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (tool) { setTool(null); return true; } if (selDim) { selDim = null; render(); Panels.renderRight(); return true; } return false; }
    if (e.key === 'Enter' && tool === 'dim' && (dimMode === 'chain' || dimMode === 'base') && toolState && toolState.stage === 3) {
      toolState = { stage: 0 };
      render(); Panels.renderRight();
      return true;
    }
    if (e.key === 'Enter' && tool === 'detail' && toolState && toolState.stage === 2) {
      addDetail({ source: toolState.source, c: toolState.c, r: toolState.r, scale: detailDraft.scale, label: detailDraft.label, pos: null });
      setTool(null);
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selDim) { removeSel(); return true; }
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('dim'); return true; }
    if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('detail'); return true; }
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('section'); return true; }
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('note'); return true; }
    return false;
  }
  function allCenters(viewName = null) {
    const sh = dwg();
    const lay = layout || computeLayout(sh);
    const hid = new Set(sh.hiddenCenters || []);
    const seen = new Set();
    const out = [];
    for (const [vName, v] of Object.entries(lay.views || {})) {
      if (viewName && vName !== viewName) continue;
      for (const c of (v.geo && v.geo.allCenters) || []) {
        if (!c.id || seen.has(c.id)) continue;
        seen.add(c.id);
        out.push({
          id: c.id,
          view: c.view || vName,
          type: c.ctrGroup || c.type,
          kind: c.kind || 'cyl',
          r: c.r || 0,
          c: c.c ? [...c.c] : null,
          a: c.a ? [...c.a] : null,
          b: c.b ? [...c.b] : null,
          hidden: !sh.centers || hid.has(c.id),
        });
      }
    }
    return out;
  }
  function centers(viewName = null) {
    return allCenters(viewName).filter((x) => !x.hidden);
  }
  function findCenterById(id) {
    return allCenters().find((x) => x.id === id) || null;
  }
  function setCenters(on) {
    const val = !!on;
    if (dwg().centers === val) return;
    App.change(val ? 'Mittellinien eingeblendet' : 'Mittellinien ausgeblendet', () => { dwg().centers = val; });
    if (!val && selDim && String(selDim).startsWith('ctr|')) selDim = null;
    render(); Panels.renderRight();
  }
  function hideCenter(id) {
    if (!id || !String(id).startsWith('ctr|')) return false;
    const d = dwg();
    if ((d.hiddenCenters || []).includes(id)) return false;
    App.change('Mittellinie ausgeblendet', () => {
      const sh = dwg();
      if (!Array.isArray(sh.hiddenCenters)) sh.hiddenCenters = [];
      if (!sh.hiddenCenters.includes(id)) sh.hiddenCenters.push(id);
    });
    if (selDim === id) selDim = null;
    render(); Panels.renderRight();
    return true;
  }
  function showCenter(id) {
    if (!id) return false;
    const d = dwg();
    if (!(d.hiddenCenters || []).includes(id)) return false;
    App.change('Mittellinie eingeblendet', () => {
      const sh = dwg();
      sh.hiddenCenters = (sh.hiddenCenters || []).filter((x) => x !== id);
    });
    render(); Panels.renderRight();
    return true;
  }
  function toggleCenter(id) {
    const d = dwg();
    return (d.hiddenCenters || []).includes(id) ? showCenter(id) : hideCenter(id);
  }
  function showAllCenters() {
    const d = dwg();
    if (d.centers && !(d.hiddenCenters || []).length) return false;
    App.change('Alle Mittellinien eingeblendet', () => {
      const sh = dwg();
      sh.centers = true;
      sh.hiddenCenters = [];
    });
    render(); Panels.renderRight();
    return true;
  }
  function removeSel() {
    const id = selDim; if (!id) return;
    if (String(id).startsWith('ctr|')) { hideCenter(id); return; }
    if ((dwg().sections || []).some((x) => x.id === id)) { removeSection(id); return; }
    if ((dwg().notes || []).some((x) => x.id === id)) { removeNote(id); return; }
    App.change('Gelöscht', () => {
      const d = dwg();
      if ((d.details || []).some((x) => x.id === id)) {
        d.details = (d.details || []).filter((x) => x.id !== id);
        d.dims = d.dims.filter((x) => x.view !== id);
        d.notes = (d.notes || []).filter((x) => x.view !== id);
        d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|' + id + '|'));
        return;
      }
      // automatische Maße: das ganze Maß (Breite, Höhe …) oder bei Bohrungen nur das angeklickte
      const auto = d.dims.find((x) => x.auto && (x.id === id || id.startsWith(x.id + '_')));
      if (auto && auto.id === id) d.dims = d.dims.filter((x) => x !== auto);
      else if (auto) auto.hide = [...(auto.hide || []), id];
      else d.dims = d.dims.filter((x) => x.id !== id);
      d.free = d.free.filter((x) => x.id !== id);
    });
    selDim = null;
    if (tool === 'dim' && toolState && toolState.rebindId === id) { setTool(null); return; }
    render();
    lastLostKey = layout ? lostDims(dwg()).map((x) => x.id).sort().join(',') : '';
    Panels.renderRight();
  }
  function dimHint(mode) {
    const m = DIM_MODES.find((x) => x.key === mode);
    return m ? m.hint : DIM_MODES[0].hint;
  }
  function setDimMode(mode) {
    if (!mode) { setTool(null); return; }
    dimMode = DIM_MODES.some((x) => x.key === mode) ? mode : 'lin';
    dragDetail = null;
    tool = 'dim';
    toolState = { stage: 0 };
    if (svg) svg.style.cursor = 'crosshair';
    UI.hint(dimHint(dimMode));
    Panels.renderTools(); Panels.renderRight(); render();
  }
  function dimMenu(anchor) {
    const tMap = { lin: 'menu.draw.dimLin', chain: 'menu.draw.dimChain', base: 'menu.draw.dimBase', ang: 'menu.draw.dimAng', rad: 'menu.draw.dimRad', dia: 'menu.draw.dimDia', chamfer: 'menu.draw.dimChamfer' };
    UI.menu(anchor, DIM_MODES.map((m) => ({
      label: T(tMap[m.key] || m.label),
      icon: 'dim',
      help: 'drawingDimTypes',
      checked: tool === 'dim' && dimMode === m.key,
      run: () => setDimMode(m.key),
    })));
  }
  function setTool(t) {
    dragDetail = null; dragNote = null; dragView = null;
    tool = t;
    if (t === 'dim') dimMode = 'lin';
    if (t === 'detail') {
      detailDraft = { scale: defaultDetailScale(), label: nextDetailLabel() };
      toolState = { stage: 0 };
    } else {
      toolState = (t === 'dim' || t === 'section' || t === 'note') ? { stage: 0 } : t ? {} : null;
    }
    if (svg) svg.style.cursor = t ? 'crosshair' : '';
    UI.hint(
      t === 'dim' ? dimHint(dimMode)
        : t === 'detail' ? '<b>Detailansicht:</b> Mitte des Kreises in einer Ansicht anklicken, Kreis aufziehen, dann die Detailansicht auf dem Blatt platzieren. <b>Esc</b> beendet.'
          : t === 'section' ? '<b>Schnittansicht:</b> Schnittlinie A–A durch eine Ansicht ziehen oder zwei Punkte anklicken (<b>Umschalt</b> = waagerecht/senkrecht, <b>Alt</b> = frei). <b>Esc</b> beendet.'
            : t === 'note' ? '<b>Hinweislinie:</b> Kante (Pfeil) oder Fläche (Punkt) anklicken, dann die Textstelle wählen. <b>Esc</b> beendet.'
              : t && t.startsWith('free-') ? HINTS2[t] : null
    );
    Panels.renderTools(); Panels.renderRight(); render();
  }
  function autoDims() {
    App.change('Automatisch bemaßt', () => {
      const d = dwg();
      d.dims = d.dims.filter((x) => !x.auto);
      d.dims.push({ id: uid('d'), auto: 'width', view: 'front' }, { id: uid('d'), auto: 'height', view: 'front' }, { id: uid('d'), auto: 'depth', view: 'left' }, { id: uid('d'), auto: 'circles', view: 'top' });
    });
    render(); UI.toast('Gesamtmaße und Bohrungen sind bemaßt.', { icon: 'dim' });
  }
  // ---------- Freies Zeichnen (2D) ----------
  const HINTS2 = { 'free-line': '<b>Linie:</b> Punkte anklicken, <b>Esc</b> beendet.', 'free-rect': '<b>Rechteck:</b> Zwei Ecken anklicken.', 'free-circle': '<b>Kreis:</b> Mittelpunkt, dann Größe anklicken.', 'free-text': '<b>Text:</b> Stelle anklicken und Text eingeben.' };
  function freeView() {
    return layout.views.free || { s: 1, ox: 0, oy: layout.H, geo: { box: [0, 0, 0, 0], points: [], circles: [] } };
  }
  function freeSnap(P) {
    const v = freeView(); const grid = 1;
    let q = toView(v, P);
    const pts = []; for (const vv of Object.values(layout.views)) for (const p of vv.geo.points) pts.push(toView(v, toSheet(vv, p)));
    const tol = 2.4 / zoom / v.s; let best = null, bd = tol;
    for (const p of pts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = p; } }
    if (best) return best;
    return [Math.round(q[0] / grid) * grid, Math.round(q[1] / grid) * grid];
  }
  function freeMove(e) { const P = sheetPt(e); toolState.cur = freeSnap(P); renderFreePreview(); }
  function freeDown(e) {
    const P = sheetPt(e); const q = freeSnap(P); const st = toolState;
    if (tool === 'free-text') { addFreeText(q); return; }
    if (!st.a) { st.a = q; return; }
    if (tool === 'free-line') { addFree({ type: 'line', a: st.a, b: q }); st.a = q; }
    else if (tool === 'free-rect') { if (Math.abs(q[0] - st.a[0]) > 1e-6 && Math.abs(q[1] - st.a[1]) > 1e-6) addFree({ type: 'rect', a: st.a, b: q }); st.a = null; }
    else if (tool === 'free-circle') { const r = Math.hypot(q[0] - st.a[0], q[1] - st.a[1]); if (r > 1e-6) addFree({ type: 'circle', c: st.a, r }); st.a = null; }
  }
  function renderFreePreview() {
    render();
    const st = toolState; if (!st || !st.cur || !svg) return;
    const v = freeView(); const NS = 'http://www.w3.org/2000/svg';
    const g = svg.querySelector('g');
    const C = toSheet(v, st.cur);
    const mk = document.createElementNS(NS, 'circle'); mk.setAttribute('cx', C[0]); mk.setAttribute('cy', C[1]); mk.setAttribute('r', 1.4 / zoom); mk.setAttribute('class', 'snap'); g.append(mk);
    if (st.a) {
      let e2;
      if (tool === 'free-line') e2 = { type: 'line', a: st.a, b: st.cur };
      if (tool === 'free-rect') e2 = { type: 'rect', a: st.a, b: st.cur };
      if (tool === 'free-circle') e2 = { type: 'circle', c: st.a, r: Math.hypot(st.cur[0] - st.a[0], st.cur[1] - st.a[1]) };
      if (e2) for (const s of SK.segsOf(e2)) { const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', SK.segPoints(s).map((p) => toSheet(v, p).join(',')).join(' ')); pl.setAttribute('class', 'prev'); g.append(pl); }
    }
  }
  function addFree(el) {
    App.change('Gezeichnet', () => { dwg().free.push({ id: uid('f'), ...el }); });
    render();
  }
  async function addFreeText(q) {
    const t = await UI.prompt('Text einfügen', 'Text', '', 'Einfügen');
    if (t && t.trim()) addFree({ type: 'text', p: q, text: t.trim(), size: 3.5 });
  }
  async function editFreeText(id) {
    const f = dwg().free.find((x) => x.id === id && x.type === 'text'); if (!f) return;
    const t = await UI.prompt('Text ändern', 'Text', f.text, 'Ändern');
    if (t != null) App.change('Text geändert', () => { const g = dwg().free.find((x) => x.id === id); if (g) g.text = t; });
    render();
  }
  function drawMenu(anchor) {
    UI.menu(anchor, [
      { label: T('menu.draw.line'), icon: 'line', run: () => setTool('free-line') },
      { label: T('menu.draw.rect'), icon: 'rect', run: () => setTool('free-rect') },
      { label: T('menu.draw.circle'), icon: 'circle', run: () => setTool('free-circle') },
      { label: T('menu.draw.text'), icon: 'text', run: () => setTool('free-text') },
      '-',
      { label: T('menu.draw.clearAll'), icon: 'trash', disabled: !dwg().free.length, run: async () => { if (await UI.confirm(T('menu.draw.clearTitle'), T('menu.draw.clearBody'), T('common.delete'), true)) App.change('Gezeichnetes gelöscht', () => { dwg().free = []; }); render(); } },
    ]);
  }
  // ---------- Menüs ----------
  function set(fn, label) { App.change(label || 'Zeichnung geändert', () => fn(dwg())); refreshSoon(); }
  const refreshSoon = debounce(() => { refresh(); }, 30);
  function sheetOptions() {
    return SHEET_ORDER.map((k) => {
      const [w, h] = SHEETS[k];
      return [k, `${k} (${h} × ${w} mm)`];
    });
  }
  function sheetMenu(anchor) {
    const d = dwg();
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    const f = h('div', { class: 'fields' });
    f.append(UI.selectField({ id: 'dw-sheet', label: T('menu.draw.sheet'), value: d.sheet, options: sheetOptions(), onChange: (v) => { set((x) => { x.sheet = v; }); fitZoom(); Panels.renderRight(); renderTabs(); } }));
    f.append(UI.selectField({ id: 'dw-orient', label: T('menu.draw.orient'), value: d.orient, options: [['landscape', T('menu.draw.landscape')], ['portrait', T('menu.draw.portrait')]], onChange: (v) => { set((x) => { x.orient = v; }); fitZoom(); Panels.renderRight(); renderTabs(); } }));
    box.append(f);
    box.append(UI.selectField({ id: 'dw-scale', label: T('menu.draw.scale'), value: String(d.scale), options: [['auto', T('menu.draw.scaleAuto')], ...SCALES.map((s) => [String(s), scaleText(s)])], onChange: (v) => set((x) => { x.scale = v === 'auto' ? 'auto' : +v; }) }));
    box.append(h('div', { class: 'section-h' }, T('menu.draw.viewsHeading')));
    for (const [k, l] of [['front', T('menu.draw.vFront')], ['top', T('menu.draw.vTop')], ['left', T('menu.draw.vLeft')], ['iso', T('menu.draw.vIso')]]) {
      const c = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-v-' + k, checked: !!d.views[k] }), l);
      c.querySelector('input').onchange = (e) => { set((x) => { x.views[k] = e.target.checked; }); Panels.renderRight(); }; box.append(c);
    }
    for (const [k, l] of [['hidden', T('menu.draw.hiddenEdges')], ['centers', T('menu.draw.centers')]]) {
      const c = h('label', { class: 'check', ...(k === 'centers' ? { 'data-help': 'drawingCenters' } : {}) }, h('input', { type: 'checkbox', id: 'dw-' + k, checked: !!d[k] }), l);
      c.querySelector('input').onchange = k === 'centers'
        ? (e) => { setCenters(e.target.checked); }
        : (e) => {
            const on = e.target.checked;
            set((x) => {
              x[k] = on;
              if (k === 'hidden' && x.viewOpts) {
                for (const vk of ['front', 'top', 'left']) if (x.viewOpts[vk]) delete x.viewOpts[vk].hidden;
              }
            });
            Panels.renderRight();
          };
      box.append(c);
    }
    UI.pop(anchor, box);
  }
  function viewMenu(anchor) {
    UI.menu(anchor, [
      { label: T('menu.draw.addIso'), icon: 'cube', run: () => addView('iso') },
      { label: T('menu.draw.addIsoShaded'), icon: 'cube', run: () => addView('iso', { shaded: true }) },
      '-',
      { label: T('menu.draw.addFree'), icon: 'eye', run: () => addView('free') },
      { label: T('menu.draw.addFreeShaded'), icon: 'eye', run: () => addView('free', { shaded: true }) },
    ]);
  }
  function exportMenu(anchor) {
    UI.menu(anchor, [
      { label: T('menu.draw.exportPdf'), icon: 'file', run: () => exportPDF() },
      { label: T('menu.draw.exportSvg'), icon: 'file', run: () => exportSVG() },
      { label: T('menu.draw.exportDxf'), icon: 'file', run: () => exportDXF() },
    ]);
  }
  function fileBase(withSheet = false) {
    const d = dwg();
    const base = (d.title.titel || App.doc.name) + ' Zeichnung';
    return Print.safeName(withSheet && sheets().length > 1 ? `${base} ${d.name}` : base);
  }
  function exportSVG() {
    if (!svg) return;
    const clone = svg.cloneNode(true); clone.removeAttribute('width'); clone.removeAttribute('height');
    const [W, H] = sheetSize(); clone.setAttribute('width', W + 'mm'); clone.setAttribute('height', H + 'mm');
    clone.querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'));
    clone.querySelectorAll('.view-sel').forEach((el) => el.remove());
    const str = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    Print.save(fileBase(true) + '.svg', str);
  }
  // Eingebauter PDF-1.4-Writer ohne externe Abhängigkeit: unterstützt mehrere Blätter mit beliebigen Größen (A4–A0, hoch/quer)
  const PT = 72 / 25.4;
  const pf = (n) => (Math.round(n * 1000) / 1000).toString();
  const pf2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  function pdfEsc(s) {
    return latin1(s).replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  function pdfTextW(str, fsPt) {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if ('iIl1.,:;\'|! '.includes(c)) w += 0.28;
      else if ('MWmwØ'.includes(c)) w += 0.78;
      else if (c >= 'A' && c <= 'Z') w += 0.64;
      else w += 0.54;
    }
    return w * fsPt;
  }
  function toPdfBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }
  function dataUrlToBytes(url) {
    if (!url || typeof url !== 'string') return null;
    const idx = url.indexOf(';base64,');
    if (idx < 0) return null;
    const bin = atob(url.slice(idx + 8));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function pageStream(W, H, lines, texts, pdfImages = []) {
    const out = ['1 J 1 j'];
    const style = {
      frame: [0.7, null],
      thin: [0.25, null],
      vis: [0.5, null],
      tan: [0.2, null],
      hid: [0.25, [2.4, 1.2]],
      ctr: [0.25, [5, 1.2, 0.6, 1.2]],
      hatch: [0.22, null],
      cutline: [0.35, [7, 1.2, 0.7, 1.2]],
      cutend: [0.7, null],
      dim: [0.25, null],
      'arrow-open': [0.3, null],
      'arrow-slash': [0.45, null],
      leader: [0.25, null],
      detail: [0.25, null],
      'detail-border': [0.25, [3, 1.5]],
    };
    const px = (x) => pf(x * PT);
    const py = (y) => pf((H - y) * PT);
    for (const im of pdfImages) {
      out.push(`q ${pf(im.w * PT)} 0 0 ${pf(im.h * PT)} ${px(im.x)} ${py(im.y + im.h)} cm /${im.name} Do Q`);
    }
    for (const l of lines) {
      if (l.cls === 'paper' || l.cls === 'prev' || l.cls === 'snap' || l.cls === 'view-sel') continue;
      if (l.cls === 'arrow' || l.cls === 'leader-arrow') {
        const [a, b, c] = l.poly;
        out.push(`${l.lost ? '0.788 0.216 0.180' : '0.067'} g ${px(a[0])} ${py(a[1])} m ${px(b[0])} ${py(b[1])} l ${px(c[0])} ${py(c[1])} l h f`);
        continue;
      }
      if ((l.cls === 'arrow-dot' || l.cls === 'leader-dot') && l.circle) {
        const cx = l.circle[0] * PT, cy = (H - l.circle[1]) * PT, R = l.circle[2] * PT;
        const k = 0.5522847498 * R;
        out.push(
          `${l.lost ? '0.788 0.216 0.180' : '0.067'} g ${pf(cx + R)} ${pf(cy)} m`,
          `${pf(cx + R)} ${pf(cy + k)} ${pf(cx + k)} ${pf(cy + R)} ${pf(cx)} ${pf(cy + R)} c`,
          `${pf(cx - k)} ${pf(cy + R)} ${pf(cx - R)} ${pf(cy + k)} ${pf(cx - R)} ${pf(cy)} c`,
          `${pf(cx - R)} ${pf(cy - k)} ${pf(cx - k)} ${pf(cy - R)} ${pf(cx)} ${pf(cy - R)} c`,
          `${pf(cx + k)} ${pf(cy - R)} ${pf(cx + R)} ${pf(cy - k)} ${pf(cx + R)} ${pf(cy)} c f`
        );
        continue;
      }
      const st = style[l.cls];
      if (!st) continue;
      out.push(`${l.lost ? '0.788 0.216 0.180' : (l.cls === 'tan' ? '0.267' : '0.067')} G ${pf(st[0] * PT)} w`);
      if (l.lost && l.cls === 'dim') out.push(`[${pf(2 * PT)} ${pf(1 * PT)}] 0 d`);
      else if (st[1]) out.push(`[${st[1].map((v) => pf(v * PT)).join(' ')}] 0 d`);
      else out.push('[] 0 d');
      if (l.rect) {
        const [rx, ry, rw, rh] = l.rect;
        out.push(`${px(rx)} ${py(ry + rh)} ${pf(rw * PT)} ${pf(rh * PT)} re S`);
      } else if (l.circle) {
        const cx = l.circle[0] * PT, cy = (H - l.circle[1]) * PT, R = l.circle[2] * PT;
        const k = 0.5522847498 * R;
        out.push(
          `${pf(cx + R)} ${pf(cy)} m`,
          `${pf(cx + R)} ${pf(cy + k)} ${pf(cx + k)} ${pf(cy + R)} ${pf(cx)} ${pf(cy + R)} c`,
          `${pf(cx - k)} ${pf(cy + R)} ${pf(cx - R)} ${pf(cy + k)} ${pf(cx - R)} ${pf(cy)} c`,
          `${pf(cx - R)} ${pf(cy - k)} ${pf(cx - k)} ${pf(cy - R)} ${pf(cx)} ${pf(cy - R)} c`,
          `${pf(cx + k)} ${pf(cy - R)} ${pf(cx + R)} ${pf(cy - k)} ${pf(cx + R)} ${pf(cy)} c S`
        );
      } else if (l.pts && l.pts.length > 1) {
        const seg = [`${px(l.pts[0][0])} ${py(l.pts[0][1])} m`];
        for (let i = 1; i < l.pts.length; i++) seg.push(`${px(l.pts[i][0])} ${py(l.pts[i][1])} l`);
        seg.push('S');
        out.push(seg.join(' '));
      }
    }
    out.push('[] 0 d');
    for (const t of texts) {
      if (t.cls === 'note') continue;
      const raw = latin1(t.t);
      const esc = pdfEsc(t.t);
      const fs = t.size * PT;
      const fnt = (t.cls === 'title' || t.cls === 'detail-lbl' || t.cls === 'cutlabel' || t.cls === 'viewlabel') ? '/F2' : '/F1';
      const gray = t.lost ? '0.788 0.216 0.180' : (t.cls === 'lab' ? '0.333' : '0.067');
      const rad = -((t.rot || 0) * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const dx = t.anchor === 'middle' ? -pdfTextW(raw, fs) / 2 : t.anchor === 'end' ? -pdfTextW(raw, fs) : 0;
      out.push(`${gray} ${t.lost ? 'rg' : 'g'} q ${pf(c)} ${pf(s)} ${pf(-s)} ${pf(c)} ${px(t.x)} ${py(t.y)} cm BT ${fnt} ${pf(fs)} Tf ${pf(dx)} 0 Td (${esc}) Tj ET Q`);
    }
    return out.join('\n') + '\n';
  }
  function buildPDF(pages, meta = {}) {
    const objs = [];
    const addObj = (bodyBytes) => { objs.push(bodyBytes); return objs.length; };
    const addStr = (s) => addObj(toPdfBytes(s));
    addStr(''); // 1: Catalog (wird unten gesetzt)
    addStr(''); // 2: Pages (wird unten gesetzt)
    const f1 = addStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = addStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const infoId = addStr(`<< /Title (${pdfEsc(meta.title || 'Zeichnung')}) /Creator (Tracery) >>`);
    const kids = [];
    for (const p of pages) {
      const pdfImages = [];
      for (const im of p.images || []) {
        const imgBytes = dataUrlToBytes(im.jpg);
        if (!imgBytes || imgBytes.length < 4 || imgBytes[0] !== 0xff || imgBytes[1] !== 0xd8) continue;
        const ih = toPdfBytes(`<< /Type /XObject /Subtype /Image /Width ${im.iw} /Height ${im.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
        const it = toPdfBytes('\nendstream');
        const imObj = new Uint8Array(ih.length + imgBytes.length + it.length);
        imObj.set(ih, 0); imObj.set(imgBytes, ih.length); imObj.set(it, ih.length + imgBytes.length);
        const imId = addObj(imObj);
        pdfImages.push({ ...im, name: 'Im' + (pdfImages.length + 1), id: imId });
      }
      const sBytes = toPdfBytes(pageStream(p.W, p.H, p.lines, p.texts, pdfImages));
      const head = toPdfBytes(`<< /Length ${sBytes.length} >>\nstream\n`);
      const tail = toPdfBytes('\nendstream');
      const cObj = new Uint8Array(head.length + sBytes.length + tail.length);
      cObj.set(head, 0); cObj.set(sBytes, head.length); cObj.set(tail, head.length + sBytes.length);
      const cId = addObj(cObj);
      const xobj = pdfImages.length ? ` /XObject << ${pdfImages.map((im) => `/${im.name} ${im.id} 0 R`).join(' ')} >>` : '';
      const pId = addStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pf2(p.W * PT)} ${pf2(p.H * PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> /Contents ${cId} 0 R >>`);
      kids.push(pId);
    }
    objs[0] = toPdfBytes('<< /Type /Catalog /Pages 2 0 R >>');
    objs[1] = toPdfBytes(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
    const chunks = [];
    const hdr = toPdfBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    chunks.push(hdr);
    let pos = hdr.length;
    const offsets = [0];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(pos);
      const pre = toPdfBytes(`${i + 1} 0 obj\n`);
      const post = toPdfBytes('\nendobj\n');
      chunks.push(pre, objs[i], post);
      pos += pre.length + objs[i].length + post.length;
    }
    const xrefPos = pos;
    const xrefLines = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`];
    for (let i = 1; i <= objs.length; i++) {
      xrefLines.push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    xrefLines.push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    const tailBytes = toPdfBytes(xrefLines.join(''));
    chunks.push(tailBytes);
    pos += tailBytes.length;
    const out = new Uint8Array(pos);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  async function buildPDFBytes() {
    await ensureProjections();
    const all = sheets();
    const pages = all.map((sh, i) => {
      const content = buildSheetContent(sh, i, all.length);
      return { W: content.layout.W, H: content.layout.H, lines: content.lines, texts: content.texts, images: content.images };
    });
    const active = dwg();
    return buildPDF(pages, { title: (active.title && active.title.titel) || App.doc.name });
  }
  async function exportPDF() {
    const tst = UI.toast('PDF wird erstellt …', { icon: 'file', ms: 15000 });
    try {
      const bytes = await buildPDFBytes();
      tst.remove();
      await Print.save(fileBase(false) + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
    } catch (e) { tst.remove(); UI.toast('PDF hat nicht geklappt: ' + e.message, { kind: 'bad' }); }
  }
  async function exportDXF() {
    render();
    const [W, H] = sheetSize();
    const out = [];
    const P = (...a) => out.push(...a.map(String));
    P(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 9, '$EXTMIN', 10, 0, 20, 0, 9, '$EXTMAX', 10, W, 20, H, 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 3);
    P(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0.0);
    P(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 3.6, 49, 2.4, 49, -1.2);
    P(0, 'LTYPE', 2, 'CENTER', 70, 0, 3, '____ _ ____', 72, 65, 73, 4, 40, 8, 49, 5, 49, -1.2, 49, 0.6, 49, -1.2);
    P(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, 8);
    for (const [n, lt, col] of [['SICHTBAR', 'CONTINUOUS', 7], ['TANGENTIAL', 'CONTINUOUS', 9], ['VERDECKT', 'DASHED', 8], ['MITTELLINIE', 'CENTER', 1], ['SCHRAFFUR', 'CONTINUOUS', 8], ['SCHNITTLINIE', 'CENTER', 1], ['BEMASSUNG', 'CONTINUOUS', 3], ['RAHMEN', 'CONTINUOUS', 7]]) P(0, 'LAYER', 2, n, 70, 0, 62, col, 6, lt);
    P(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    const layer = { vis: 'SICHTBAR', tan: 'TANGENTIAL', hid: 'VERDECKT', ctr: 'MITTELLINIE', hatch: 'SCHRAFFUR', cutline: 'SCHNITTLINIE', cutend: 'SCHNITTLINIE', dim: 'BEMASSUNG', arrow: 'BEMASSUNG', 'arrow-open': 'BEMASSUNG', 'arrow-slash': 'BEMASSUNG', 'arrow-dot': 'BEMASSUNG', leader: 'BEMASSUNG', 'leader-arrow': 'BEMASSUNG', 'leader-dot': 'BEMASSUNG', detail: 'BEMASSUNG', 'detail-border': 'RAHMEN', frame: 'RAHMEN', thin: 'RAHMEN' };
    const Y = (y) => H - y;
    const line = (a, b, ly) => P(0, 'LINE', 8, ly, 10, a[0].toFixed(4), 20, Y(a[1]).toFixed(4), 30, 0, 11, b[0].toFixed(4), 21, Y(b[1]).toFixed(4), 31, 0);
    for (const l of lastLines) {
      const ly = layer[l.cls]; if (!ly) continue;
      if (l.rect) { const [x, y, w, hh] = l.rect; const c = [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]; for (let i = 0; i < 4; i++) line(c[i], c[(i + 1) % 4], ly); }
      else if (l.circle) P(0, 'CIRCLE', 8, ly, 10, l.circle[0].toFixed(4), 20, Y(l.circle[1]).toFixed(4), 30, 0, 40, l.circle[2].toFixed(4));
      else if (l.poly) { const q = l.poly; for (let i = 0; i < q.length; i++) line(q[i], q[(i + 1) % q.length], ly); }
      else if (l.arc) {
        // echter Bogen (gegen den Uhrzeigersinn); die Winkel der Ansicht gelten unverändert, weil DXF wie die Ansicht nach oben zählt
        const deg = (x) => ((((x * 180) / Math.PI) % 360) + 360) % 360;
        P(0, 'ARC', 8, ly, 10, l.arc.c[0].toFixed(4), 20, Y(l.arc.c[1]).toFixed(4), 30, 0, 40, l.arc.r.toFixed(4), 50, deg(l.arc.a[0]).toFixed(4), 51, deg(l.arc.a[1]).toFixed(4));
      }
      else if (l.pts && l.pts.length === 2) line(l.pts[0], l.pts[1], ly);
      else if (l.pts && l.pts.length > 2) {
        P(0, 'POLYLINE', 8, ly, 66, 1, 10, 0, 20, 0, 30, 0, 70, 0);
        for (const q of l.pts) P(0, 'VERTEX', 8, ly, 10, q[0].toFixed(4), 20, Y(q[1]).toFixed(4), 30, 0);
        P(0, 'SEQEND', 8, ly);
      }
    }
    for (const t of lastTexts) { if (t.cls === 'note') continue; const tLy = (String(t.cls || '').startsWith('dimtext') || t.cls === 'leadertext') ? 'BEMASSUNG' : (t.cls === 'cutlabel' || t.cls === 'viewlabel') ? 'SCHNITTLINIE' : 'RAHMEN'; const align = t.anchor === 'middle' ? [72, 1, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0] : t.anchor === 'end' ? [72, 2, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0] : []; const dxfTxt = String(t.t).replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/[–—−]/g, '-'); P(0, 'TEXT', 8, tLy, 10, t.x.toFixed(4), 20, Y(t.y).toFixed(4), 30, 0, 40, t.size.toFixed(3), 1, dxfTxt, 50, (-(t.rot || 0)).toFixed(3), ...align); }
    P(0, 'ENDSEC', 0, 'EOF');
    const text = out.join('\r\n') + '\r\n';
    const bytes = new Uint8Array([...text].map((ch) => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; }));
    const zip = await Zip.make([{ name: fileBase(true) + '.dxf', data: bytes }]);
    await Print.save(fileBase(true) + ' DXF.zip', new Blob([zip]));
  }
  // ---------- Rechte Leiste ----------
  function tolNumField({ id, label, value, min = null, placeholder = '0', onCommit }) {
    const wrap = h('div', { class: 'field' });
    if (label) wrap.append(h('label', { for: id }, label));
    const box = h('div', { class: 'inp' });
    const fmtVal = (mm) => {
      if (typeof mm !== 'number' || !isFinite(mm)) return '';
      const v = Units.fromMM(mm);
      const r = round(v, 4);
      const clean = Object.is(r, -0) ? 0 : r;
      return clean.toFixed(4).replace(/\.?0+$/, '').replace('.', ',');
    };
    const inp = h('input', { id, type: 'text', inputmode: 'decimal', value: fmtVal(value), placeholder, autocomplete: 'off', spellcheck: 'false' });
    box.append(inp, h('span', { class: 'unit' }, Units.label()));
    wrap.append(box);
    let orig = inp.value;
    const commit = () => {
      const raw = inp.value.trim().replace(/\u2212/g, '-');
      if (raw === orig) { box.classList.remove('invalid'); return; }
      const p = raw ? Units.parseLen(raw, {}, { expr: false }) : { ok: true, value: 0 };
      if (!p.ok || !isFinite(p.value)) { box.classList.add('invalid'); return; }
      let v = p.value;
      if (min != null && v < min) v = min;
      box.classList.remove('invalid');
      orig = fmtVal(v);
      inp.value = orig;
      onCommit(v);
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { commit(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = orig; inp.blur(); }
    });
    inp.addEventListener('blur', commit);
    inp.addEventListener('focus', () => inp.select());
    return wrap;
  }
  function renderPanel(body) {
    const all = sheets(), idx = activeIndex(), d = all[idx] || dwg();
    const w = h('div', { class: 'props' });
    const lostList = layout ? lostDims(d) : [];
    if (lostList.length) {
      const dsLost = sheetDimStyle(d);
      const lostSec = h('div', { class: 'section dw-lost-sec', id: 'dw-lost-sec', 'data-help': 'drawingLostDims' });
      lostSec.append(h('div', { class: 'section-h dw-lost-h' }, `Verlorene Maße (${lostList.length})`));
      const lWrap = h('div', { class: 'dw-lost-list', id: 'dw-lost-list' });
      for (const ld of lostList) {
        const isRebinding = tool === 'dim' && toolState && toolState.rebindId === ld.id;
        const row = h('div', {
          class: 'dw-lost-row' + (selDim === ld.id ? ' active' : ''),
          'data-dim-id': ld.id,
        });
        row.append(
          h('div', { class: 'dw-lost-top' },
            h('span', { class: 'dw-lost-val' }, dimSummaryLabel(ld, dsLost)),
            h('span', { class: 'dw-lost-view' }, viewLabel(ld.view, d)),
          ),
          h('div', { class: 'dw-lost-reason' }, ld.lostReason || 'Kante fehlt'),
        );
        const acts = h('div', { class: 'dw-lost-acts' });
        const bRebind = h('button', {
          type: 'button',
          class: 'btn dw-lost-rebind' + (isRebinding ? ' active' : ''),
          'data-dim-id': ld.id,
        }, isRebinding ? 'Abbrechen' : 'Neu zuordnen');
        bRebind.onclick = (e) => {
          e.stopPropagation();
          if (isRebinding) setTool(null);
          else startRebind(ld.id);
        };
        const bDel = h('button', {
          type: 'button',
          class: 'btn danger dw-lost-del',
          'data-dim-id': ld.id,
        }, 'Löschen');
        bDel.onclick = (e) => { e.stopPropagation(); removeDim(ld.id); };
        acts.append(bRebind, bDel);
        row.append(acts);
        row.onclick = () => { selDim = ld.id; render(); Panels.renderRight(); };
        lWrap.append(row);
      }
      lostSec.append(lWrap);
      if (lostList.length > 1) {
        const bDelAll = h('button', { type: 'button', class: 'btn danger', id: 'dw-lost-del-all', style: { marginTop: '6px', width: '100%' } }, 'Alle verlorenen Maße löschen');
        bDelAll.onclick = () => removeLostDims();
        lostSec.append(bDelAll);
      }
      w.append(lostSec);
    }
    const vSec = h('div', { class: 'section', 'data-help': 'drawingViews' }, h('div', { class: 'section-h' }, 'Ansichten'));
    const bIso = h('button', { type: 'button', class: 'btn', id: 'dw-add-iso', 'data-help': 'drawingViews' });
    bIso.innerHTML = icon('plus') + 'Isometrie';
    bIso.onclick = () => addView('iso');
    const bFree = h('button', { type: 'button', class: 'btn', id: 'dw-add-free', 'data-help': 'drawingViews' });
    bFree.innerHTML = icon('eye') + '3D-Ansicht';
    bFree.onclick = () => addView('free');
    vSec.append(h('div', { class: 'btn-row' }, bIso, bFree));
    const avList = activeViews(d);
    const curKey = currentViewKey(d);
    if (avList.length) {
      const vList = h('div', { class: 'dw-view-list', id: 'dw-view-list' });
      for (const av of avList) {
        const isAct = av.id === curKey;
        const vo = viewOpts(d, av.id);
        const layV = layout && layout.views ? layout.views[av.id] : null;
        const scLbl = typeof vo.scale === 'number' ? scaleText(vo.scale) : layV ? scaleText(layV.s) : (layout ? scaleText(layout.s) : '–');
        const row = h('div', { class: 'dw-view-row' + (isAct ? ' active' : ''), 'data-view-id': av.id });
        row.append(h('span', { class: 'dw-view-name' }, av.name), h('span', { class: 'dw-view-badge' }, scLbl));
        if (av.removable) {
          const del = h('button', { type: 'button', class: 'dw-view-del', 'aria-label': 'Ansicht entfernen', 'data-tip': 'Ansicht entfernen' });
          del.innerHTML = icon('close');
          del.onclick = (e) => { e.stopPropagation(); removeView(av.id); };
          row.append(del);
        }
        row.onclick = () => selectView(av.id);
        vList.append(row);
      }
      vSec.append(vList);
      const curMeta = avList.find((x) => x.id === curKey);
      const curOpts = viewOpts(d, curKey);
      const vp = h('div', { class: 'dw-view-props', id: 'dw-view-props', 'data-help': 'drawingViewProps' });
      vp.append(h('div', { class: 'dw-view-props-h' }, 'Ansicht: ' + (curMeta ? curMeta.name : curKey)));
      const sheetScaleLbl = `${T('menu.draw.scaleSheet')} (${layout ? scaleText(layout.s) : '–'})`;
      vp.append(UI.selectField({
        id: 'dw-v-scale',
        label: T('menu.draw.scale'),
        value: curOpts.scale === 'sheet' ? 'sheet' : String(curOpts.scale),
        options: [['sheet', sheetScaleLbl], ...SCALES.map((s) => [String(s), scaleText(s)])],
        onChange: (v) => setViewOpt(curKey, { scale: v === 'sheet' ? 'sheet' : +v }, 'Ansichts-Maßstab geändert'),
      }));
      for (const [ok, ol] of [['hidden', T('menu.draw.hiddenEdges')], ['tangent', T('menu.draw.tangentEdges')], ['shaded', T('menu.draw.shaded')]]) {
        const chk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-v-' + ok, checked: !!curOpts[ok] }), ol);
        chk.querySelector('input').onchange = (e) => setViewOpt(curKey, { [ok]: e.target.checked }, 'Ansichtseinstellung geändert');
        vp.append(chk);
      }
      if (curMeta && curMeta.kind === 'free') {
        const recam = h('button', { type: 'button', class: 'btn', id: 'dw-v-recam' });
        recam.innerHTML = icon('eye') + 'Aktuelle 3D-Ansicht übernehmen';
        recam.onclick = () => updateFreeViewCamera(curKey);
        vp.append(recam);
      }
      vSec.append(vp);
    }
    w.append(vSec);

    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Schriftfeld'));
    const tf = (k, label, ph) => { const f = h('div', { class: 'field' }, h('label', { for: 'tb-' + k }, label), h('div', { class: 'inp' }, h('input', { id: 'tb-' + k, value: d.title[k] || '', placeholder: ph || '', style: { fontFamily: 'var(--font)' } }))); f.querySelector('input').addEventListener('change', (e) => set((x) => { x.title[k] = e.target.value; }, 'Schriftfeld geändert')); f.querySelector('input').addEventListener('keydown', (e) => e.stopPropagation()); return f; };
    sec.append(tf('titel', 'Benennung', App.doc.name), h('div', { class: 'fields' }, tf('nummer', 'Zeichnungsnummer'), tf('blatt', 'Blatt', `${idx + 1}/${all.length}`)), h('div', { class: 'fields' }, tf('name', 'Gezeichnet von'), tf('datum', 'Datum')), h('div', { class: 'fields' }, tf('werkstoff', 'Werkstoff'), tf('firma', 'Firma / Schule')));
    w.append(sec);
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Blatt'));
    info.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Blattname'), h('b', null, d.name)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Blatt'), h('b', { class: 'mono' }, `${idx + 1} / ${all.length}`)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Maßstab'), h('b', { class: 'mono', id: 'dw-scale-val' }, layout ? scaleText(layout.s) : '–')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Maße'), h('b', { class: 'mono' }, String(layout ? autoDimList(d, layout).length : d.dims.length)))));
    const flds = h('div', { class: 'fields', 'data-help': 'drawingFormat' });
    flds.append(UI.selectField({ id: 'dw-panel-sheet', label: T('menu.draw.sheet'), value: d.sheet, options: sheetOptions(), onChange: (v) => { set((x) => { x.sheet = v; }); fitZoom(); renderTabs(); } }));
    flds.append(UI.selectField({ id: 'dw-panel-orient', label: T('menu.draw.orient'), value: d.orient, options: [['landscape', T('menu.draw.landscape')], ['portrait', T('menu.draw.portrait')]], onChange: (v) => { set((x) => { x.orient = v; }); fitZoom(); renderTabs(); } }));
    info.append(flds);
    const b = h('button', { type: 'button', class: 'btn', id: 'dw-sheet-btn', 'data-help': 'drawingFormat' }); b.innerHTML = icon('sheet') + 'Blatt & Ansichten'; b.onclick = (e) => sheetMenu(e.currentTarget);
    const bAdd = h('button', { type: 'button', class: 'btn', id: 'dw-panel-add', 'data-help': 'drawingSheets' }); bAdd.innerHTML = icon('plus') + 'Neues Blatt'; bAdd.onclick = () => addSheet();
    info.append(h('div', { class: 'btn-row' }, b, bAdd));
    if (d.viewPos && Object.keys(d.viewPos).length) {
      const bResetV = h('button', { type: 'button', class: 'btn', id: 'dw-reset-views', style: { marginTop: '6px' } }, 'Ansichten-Lage zurücksetzen');
      bResetV.onclick = () => resetViewPos();
      info.append(bResetV);
    }
    w.append(info);
    const dimSec = h('div', { class: 'section', id: 'dw-dims-sec', 'data-help': 'drawingDimTypes' }, h('div', { class: 'section-h' }, 'Bemaßung'));
    const dimGrid = h('div', { class: 'dw-dim-grid' });
    for (const m of DIM_MODES) {
      const act = tool === 'dim' && dimMode === m.key;
      const db = h('button', {
        type: 'button',
        class: 'btn' + (act ? ' active' : ''),
        id: 'dw-dm-' + m.key,
        'aria-pressed': String(act),
        'data-help': 'drawingDimTypes',
      }, m.short);
      db.onclick = () => { if (tool === 'dim' && dimMode === m.key) setTool(null); else setDimMode(m.key); };
      dimGrid.append(db);
    }
    dimSec.append(dimGrid);
    if (tool === 'dim' && (dimMode === 'chain' || dimMode === 'base') && toolState && toolState.stage === 3) {
      const fin = h('button', { type: 'button', class: 'btn primary', id: 'dw-dm-finish', style: { marginTop: '6px' } }, 'Abschließen (Enter)');
      fin.onclick = () => { toolState = { stage: 0 }; render(); Panels.renderRight(); };
      dimSec.append(fin);
    }
    w.append(dimSec);
    // Maß-Stil je Blatt (ZE-10)
    const ds = sheetDimStyle(d);
    const styleSec = h('div', { class: 'section', id: 'dw-dimstyle-sec', 'data-help': 'drawingDimStyle' }, h('div', { class: 'section-h' }, 'Maß-Stil'));
    const fsList = DIM_FONT_SIZES.includes(ds.fontSize) ? DIM_FONT_SIZES : [...DIM_FONT_SIZES, ds.fontSize].sort((a, b) => a - b);
    const decVal = ds.decimals == null ? 'auto' : String(ds.decimals);
    const decOpts = [
      ['auto', 'Wie Einstellung'],
      ['0', '0 Stellen (12)'],
      ['1', '1 Stelle (12,3)'],
      ['2', '2 Stellen (12,35)'],
      ['3', '3 Stellen (12,346)'],
      ['4', '4 Stellen (12,3456)'],
    ];
    styleSec.append(
      UI.selectField({ id: 'dw-style-arrow', label: 'Pfeilart', value: ds.arrow, options: DIM_ARROWS.map((a) => [a.key, a.label]), onChange: (v) => setDimStyle({ arrow: v }) }),
      h('div', { class: 'fields' },
        UI.selectField({ id: 'dw-style-size', label: 'Schriftgröße', value: String(ds.fontSize), options: fsList.map((s) => [String(s), fmtFixed(s, 1) + ' mm']), onChange: (v) => setDimStyle({ fontSize: +v || 3.5 }) }),
        UI.selectField({ id: 'dw-style-dec', label: 'Nachkommastellen', value: decVal, options: decOpts, onChange: (v) => setDimStyle({ decimals: v === 'auto' ? null : +v }) }),
      ),
    );
    w.append(styleSec);
    // Hinweislinien / Notizen (ZE-11)
    const noteSec = h('div', { class: 'section', id: 'dw-notes-sec', 'data-help': 'drawingLeader' }, h('div', { class: 'section-h' }, 'Hinweislinien'));
    const bNote = h('button', { type: 'button', class: 'btn' + (tool === 'note' ? ' active' : ''), id: 'dw-add-note', 'data-help': 'drawingLeader' });
    bNote.innerHTML = icon('noteText') + (tool === 'note' ? 'Hinweislinie aktiv' : 'Hinweislinie setzen');
    bNote.onclick = () => tool_('note');
    noteSec.append(bNote);
    if (tool === 'note') {
      const tipFld = UI.selectField({ id: 'dw-note-new-tip', label: 'Spitze', value: noteDraft.tip, options: NOTE_TIPS.map((x) => [x.key, x.label]), onChange: (v) => { noteDraft.tip = v; render(); } });
      const txtFld = UI.textField({ id: 'dw-note-new-text', label: 'Text', value: noteDraft.text, live: true, placeholder: 'Leer = beim Absetzen fragen', onCommit: (v) => { noteDraft.text = v; render(); } });
      noteSec.append(tipFld, txtFld);
    }
    const noteList = d.notes || [];
    if (noteList.length) {
      const nl = h('div', { class: 'mini-list', style: { marginTop: '6px' } });
      for (const n of noteList) {
        const row = h('div', {
          class: 'mini-row note-row',
          'data-note-id': n.id,
          style: { cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selDim === n.id ? 'var(--accent-soft)' : '' },
        });
        const badge = h('b', { class: 'mono' }, n.tip === 'dot' ? '●' : '→');
        const txt = h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, n.text.replace(/\s+/g, ' '));
        const vw = h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } }, n.view ? viewLabel(n.view, d) : 'Blatt');
        const db = h('button', { type: 'button', class: 'btn danger note-del', style: { padding: '2px 6px', fontSize: '11.5px' }, 'data-tip': 'Hinweislinie löschen' });
        db.innerHTML = icon('trash');
        db.onclick = (e) => { e.stopPropagation(); removeNote(n.id); };
        row.append(badge, txt, vw, db);
        row.onclick = () => { selDim = n.id; render(); Panels.renderRight(); };
        nl.append(row);
      }
      noteSec.append(nl);
    }
    w.append(noteSec);
    const secs = d.sections || [];
    const secBox = h('div', { class: 'section', id: 'dw-sections-sec' }, h('div', { class: 'section-h' }, 'Schnittansichten'));
    const bSec = h('button', { type: 'button', class: 'btn' + (tool === 'section' ? ' primary' : ''), id: 'dw-add-section', 'data-help': 'drawingSection' });
    bSec.innerHTML = icon('section') + 'Schnittlinie ziehen';
    bSec.onclick = () => tool_('section');
    secBox.append(bSec);
    if (secs.length) {
      const lst = h('div', { class: 'mini-list', style: { marginTop: '6px' } });
      const pName = { front: 'Vorne', top: 'Oben', left: 'Links' };
      for (const sec of secs) {
        const row = h('div', { class: 'mini-row sec-row', 'data-sec-id': sec.id });
        const lbl = h('span', { class: 'grow' }, `Schnitt ${sec.label}–${sec.label} (${pName[sec.parent] || sec.parent})`);
        lbl.style.cursor = 'pointer';
        lbl.onclick = () => { selDim = sec.id; render(); Panels.renderRight(); };
        const fb = h('button', { type: 'button', class: 'btn sec-flip', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': 'Blickrichtung der Pfeile umkehren' }, 'Richtung');
        fb.onclick = () => flipSection(sec.id);
        const db = h('button', { type: 'button', class: 'btn danger sec-del', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': 'Schnittansicht löschen' });
        db.innerHTML = icon('trash');
        db.onclick = () => removeSection(sec.id);
        row.append(lbl, fb, db);
        lst.append(row);
      }
      secBox.append(lst);
    }
    w.append(secBox);
    // Detailansichten (ZE-03)
    const detSec = h('div', { class: 'section', 'data-help': 'drawingDetail' }, h('div', { class: 'section-h' }, 'Detailansichten'));
    if (tool === 'detail') {
      const box = h('div', { class: 'fields' });
      const lblField = UI.textField({ id: 'dw-det-new-label', label: 'Buchstabe', value: detailDraft.label, onCommit: (v) => { detailDraft.label = cleanDetailLabel(v, detailDraft.label); render(); } });
      lblField.querySelector('input').maxLength = 2;
      const scOpts = DETAIL_SCALES.includes(detailDraft.scale) ? DETAIL_SCALES : [...DETAIL_SCALES, detailDraft.scale].sort((a, b) => a - b);
      const scField = UI.selectField({ id: 'dw-det-new-scale', label: 'Maßstab', value: String(detailDraft.scale), options: scOpts.map((s) => [String(s), scaleText(s)]), onChange: (v) => { detailDraft.scale = +v || 2; render(); } });
      box.append(lblField, scField);
      detSec.append(box);
    }
    const detList = d.details || [];
    if (detList.length) {
      const ml = h('div', { class: 'mini-list' });
      for (const det of detList) {
        const row = h('div', { class: 'mini-row', style: { cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selDim === det.id ? 'var(--accent-soft)' : '' } },
          h('b', { class: 'mono' }, det.label),
          h('span', { class: 'grow' }, `${VIEW_NAMES[det.source] || det.source}`),
          h('span', { class: 'mono' }, scaleText(det.scale)));
        row.onclick = () => { selDim = det.id; render(); Panels.renderRight(); };
        ml.append(row);
      }
      detSec.append(ml);
    }
    const bDet = h('button', { type: 'button', class: 'btn' + (tool === 'detail' ? ' active' : ''), id: 'dw-add-detail', 'data-help': 'drawingDetail' });
    bDet.innerHTML = icon('zoomIn') + (tool === 'detail' ? 'Detail-Werkzeug aktiv' : 'Detailansicht (Kreis)');
    bDet.onclick = () => tool_('detail');
    detSec.append(h('div', { class: 'btn-row' }, bDet));
    w.append(detSec);
    // Mittellinien & Mittelkreuze (ZE-06)
    const ctrSec = h('div', { class: 'section', id: 'dw-centers-sec', 'data-help': 'drawingCenters' }, h('div', { class: 'section-h' }, 'Mittellinien'));
    const ctrToggle = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-panel-centers', checked: !!d.centers }), 'Mittellinien automatisch');
    ctrToggle.querySelector('input').onchange = (e) => setCenters(e.target.checked);
    ctrSec.append(ctrToggle);
    const allCtrs = allCenters();
    const visCtrs = allCtrs.filter((c) => !c.hidden);
    const visCrossN = visCtrs.filter((c) => c.type === 'cross').length;
    const visLineN = visCtrs.filter((c) => c.type === 'line').length;
    const hiddenN = allCtrs.filter((c) => c.hidden).length || (d.hiddenCenters || []).length;
    const sumParts = [`${visCrossN} ${visCrossN === 1 ? 'Mittelkreuz' : 'Mittelkreuze'}`, `${visLineN} ${visLineN === 1 ? 'Mittellinie' : 'Mittellinien'}`];
    if (d.centers && hiddenN > 0) sumParts.push(`${hiddenN} ausgeblendet`);
    ctrSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row', id: 'dw-centers-summary' }, h('span', { class: 'grow' }, sumParts.join(' · ')))));
    if ((d.hiddenCenters || []).length > 0 || !d.centers) {
      const bShowAll = h('button', { type: 'button', class: 'btn', id: 'dw-centers-show-all' });
      bShowAll.innerHTML = icon('eye') + ((d.hiddenCenters || []).length ? `Alle einblenden (${(d.hiddenCenters || []).length})` : 'Alle einblenden');
      bShowAll.onclick = () => showAllCenters();
      ctrSec.append(h('div', { class: 'btn-row' }, bShowAll));
    }
    if (allCtrs.length) {
      const detCtrs = h('details', { id: 'dw-centers-list', ...(centersListOpen ? { open: true } : {}) }, h('summary', null, `Einzeln ein-/ausblenden (${allCtrs.length})`));
      detCtrs.addEventListener('toggle', () => { centersListOpen = detCtrs.open; });
      const cl = h('div', { class: 'mini-list' });
      for (const c of allCtrs) {
        const lbl = `${viewLabel(c.view, d)} · ${c.type === 'cross' ? 'Mittelkreuz' : 'Mittellinie'} Ø${fmtDim(c.r * 2)}`;
        const row = h('div', {
          class: 'mini-row ctr-row',
          'data-ctr-id': c.id,
          style: { padding: '3px 5px', borderRadius: '6px', background: selDim === c.id ? 'var(--accent-soft)' : '', opacity: c.hidden ? '0.55' : '' },
        });
        const sp = h('span', { class: 'grow', style: { cursor: 'pointer' } }, lbl);
        sp.onclick = () => { selDim = c.id; render(); Panels.renderRight(); };
        const tb = h('button', {
          type: 'button',
          class: 'btn ctr-toggle',
          'aria-pressed': String(!c.hidden),
          'data-tip': c.hidden ? 'Einblenden' : 'Ausblenden',
          style: { padding: '2px 6px' },
        });
        tb.innerHTML = icon(c.hidden ? 'eyeOff' : 'eye');
        tb.onclick = (e) => { e.stopPropagation(); toggleCenter(c.id); };
        row.append(sp, tb);
        cl.append(row);
      }
      detCtrs.append(cl);
      ctrSec.append(detCtrs);
    }
    w.append(ctrSec);
    if (selDim) {
      const selDet = detList.find((x) => x.id === selDim);
      const isSec = secs.some((x) => x.id === selDim);
      const selD = d.dims.find((x) => x.id === selDim);
      const selNote = (d.notes || []).find((x) => x.id === selDim);
      const selCtr = String(selDim).startsWith('ctr|') ? findCenterById(selDim) : null;
      const selDimInfo = !selDet && !isSec && !selNote && !selCtr ? findDimById(selDim, d, layout) : null;
      const selResolved = selDimInfo ? selDimInfo.dim : (!selDet && !isSec && !selNote && !selCtr && selD && layout ? autoDimList(d, layout).find((x) => x.id === selDim) : null);
      const selSec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, selDet ? `Detail ${selDet.label}` : selNote ? 'Hinweislinie' : selCtr ? (selCtr.type === 'cross' ? 'Mittelkreuz' : 'Mittellinie') : selDimInfo ? `Maß ${selDimInfo.label}` : selResolved ? `Maß ${dimSummaryLabel(selResolved, sheetDimStyle(d))}` : 'Auswahl'));
      if (selDet) {
        const fDet = h('div', { class: 'fields' });
        const lFld = UI.textField({ id: 'dw-det-label', label: 'Buchstabe', value: selDet.label, onCommit: (v) => updateDetail(selDet.id, { label: v }) });
        lFld.querySelector('input').maxLength = 2;
        const scOpts = DETAIL_SCALES.includes(selDet.scale) ? DETAIL_SCALES : [...DETAIL_SCALES, selDet.scale].sort((a, b) => a - b);
        const sFld = UI.selectField({ id: 'dw-det-scale', label: 'Maßstab', value: String(selDet.scale), options: scOpts.map((s) => [String(s), scaleText(s)]), onChange: (v) => updateDetail(selDet.id, { scale: +v || 2 }) });
        const rFld = UI.numField({ id: 'dw-det-r', label: 'Kreis-Radius', unit: 'len', value: selDet.r, min: 0.5, step: 1, onCommit: (v) => { if (v > 0.2) updateDetail(selDet.id, { r: v }); } });
        fDet.append(lFld, sFld);
        selSec.append(fDet, rFld);
      }
      if (selNote) {
        const kindTxt = selNote.targetKind === 'edge' ? 'Kante' : selNote.targetKind === 'face' ? 'Fläche' : 'Frei';
        selSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, selNote.view ? viewLabel(selNote.view, d) : 'Frei auf dem Blatt'), h('b', null, kindTxt))));
        selSec.append(UI.selectField({ id: 'dw-note-tip', label: 'Spitze', value: selNote.tip, options: [['arrow', 'Pfeil'], ['dot', 'Punkt']], onChange: (v) => updateNote(selNote.id, { tip: v }) }));
        const ta = h('textarea', {
          id: 'dw-note-text',
          rows: '2',
          style: { width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px', border: '1px solid var(--line-strong)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: '12.5px' },
        });
        ta.value = selNote.text || '';
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        ta.addEventListener('change', () => updateNote(selNote.id, { text: ta.value }));
        selSec.append(h('div', { class: 'field' }, h('label', { for: 'dw-note-text' }, 'Notiz-Text'), ta));
      }
      if (selCtr) {
        selSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, viewLabel(selCtr.view, d)), h('b', { class: 'mono' }, `Ø${fmtDim(selCtr.r * 2)}`))));
      }
      if (selDimInfo) {
        const curTol = selDimInfo.dim.tol || null;
        const curMode = curTol && curTol.mode ? curTol.mode : 'none';
        const tolBox = h('div', { id: 'dw-tol-sec', 'data-help': 'drawingTolerance', style: { display: 'grid', gap: '8px', marginBottom: '8px' } });
        const prefillDev = () => {
          if (curTol && curTol.mode === 'fit') {
            const fi = iso286(curTol.fit, selDimInfo.nominalMm);
            if (fi && !fi.outOfRange) return { upper: fi.upperMm, lower: fi.lowerMm };
          }
          if (curTol && curTol.mode === 'sym') return { upper: curTol.sym || 0, lower: -(curTol.sym || 0) };
          if (curTol && (curTol.mode === 'dev' || curTol.mode === 'limits')) return { upper: curTol.upper || 0, lower: curTol.lower || 0 };
          return { upper: 0.05, lower: -0.05 };
        };
        tolBox.append(UI.selectField({
          id: 'dw-tol-mode',
          label: 'Toleranz',
          value: curMode,
          options: [
            ['none', 'Keine (Allgemeintoleranz)'],
            ['sym', 'Symmetrisch (±)'],
            ['dev', 'Abmaße (oben / unten)'],
            ['limits', 'Grenzmaße (min / max)'],
            ['fit', 'ISO-Passung (H7, g6 …)'],
          ],
          onChange: (m) => {
            if (m === 'none') setDimTol(selDimInfo.dim.id, null);
            else if (m === 'sym') setDimTol(selDimInfo.dim.id, { mode: 'sym', sym: curTol && curTol.sym != null ? curTol.sym : 0.1 });
            else if (m === 'dev' || m === 'limits') setDimTol(selDimInfo.dim.id, { mode: m, ...prefillDev() });
            else if (m === 'fit') setDimTol(selDimInfo.dim.id, { mode: 'fit', fit: (curTol && curTol.fit) || (selDimInfo.dim.type === 'dia' ? 'H7' : 'h6'), fitShow: (curTol && curTol.fitShow) || 'both' });
          },
        }));
        if (curMode === 'sym') {
          tolBox.append(tolNumField({
            id: 'dw-tol-sym',
            label: 'Toleranz ±',
            value: curTol.sym ?? 0.1,
            min: 0,
            onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'sym', sym: Math.abs(v) }),
          }));
        } else if (curMode === 'dev') {
          const fRow = h('div', { class: 'fields' });
          fRow.append(
            tolNumField({
              id: 'dw-tol-upper',
              label: 'Oberes Abmaß',
              value: curTol.upper ?? 0,
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'dev', upper: v, lower: curTol.lower ?? 0 }),
            }),
            tolNumField({
              id: 'dw-tol-lower',
              label: 'Unteres Abmaß',
              value: curTol.lower ?? 0,
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'dev', upper: curTol.upper ?? 0, lower: v }),
            })
          );
          tolBox.append(fRow);
        } else if (curMode === 'limits') {
          const fRow = h('div', { class: 'fields' });
          fRow.append(
            tolNumField({
              id: 'dw-tol-max',
              label: 'Höchstmaß',
              value: selDimInfo.nominalMm + (curTol.upper ?? 0),
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'limits', upper: v - selDimInfo.nominalMm, lower: curTol.lower ?? 0 }),
            }),
            tolNumField({
              id: 'dw-tol-min',
              label: 'Mindestmaß',
              value: selDimInfo.nominalMm + (curTol.lower ?? 0),
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'limits', upper: curTol.upper ?? 0, lower: v - selDimInfo.nominalMm }),
            })
          );
          tolBox.append(fRow);
        } else if (curMode === 'fit') {
          const classes = (ISO286_DATA && ISO286_DATA.klassen) || {};
          const holeOpts = Object.entries(classes).filter(([, v]) => v.art === 'bohrung').map(([k]) => [k, k]);
          const shaftOpts = Object.entries(classes).filter(([, v]) => v.art === 'welle').map(([k]) => [k, k]);
          const fitSel = UI.selectField({
            id: 'dw-tol-fit',
            label: 'Passung (ISO 286)',
            value: curTol.fit || 'H7',
            options: [
              { group: 'Bohrung (ISO 286)', options: holeOpts },
              { group: 'Welle (ISO 286)', options: shaftOpts },
            ],
            onChange: (v) => setDimTol(selDimInfo.dim.id, { mode: 'fit', fit: v, fitShow: curTol.fitShow || 'both' }),
          });
          fitSel.dataset.help = 'drawingFit';
          const showSel = UI.selectField({
            id: 'dw-tol-fit-show',
            label: 'Anzeige',
            value: curTol.fitShow || 'both',
            options: [
              ['both', 'Kurzzeichen + Abmaße'],
              ['code', 'Nur Kurzzeichen'],
              ['dev', 'Nur Abmaße'],
              ['limits', 'Grenzmaße (min / max)'],
            ],
            onChange: (v) => setDimTol(selDimInfo.dim.id, { mode: 'fit', fit: curTol.fit || 'H7', fitShow: v }),
          });
          tolBox.append(fitSel, showSel);
        }
        const tolInfo = resolveDimTol(selDimInfo.dim, selDimInfo.nominalMm);
        if (tolInfo) {
          if (tolInfo.outOfRange) {
            tolBox.append(h('div', { class: 'hint-box', id: 'dw-tol-info', html: `<b>${esc(tolInfo.code)}</b>: Nennmaß liegt außerhalb der ISO-286-Tabelle (0–500 mm).` }));
          } else {
            const fitDec = tolInfo.mode === 'fit' ? ((!Number.isInteger(tolInfo.upperUm) || !Number.isInteger(tolInfo.lowerUm)) ? 4 : 3) : 0;
            const dev = fmtDevPair(tolInfo.upperMm, tolInfo.lowerMm, { minDec: fitDec });
            const lim = fmtLimitsPair(selDimInfo.nominalMm, tolInfo.upperMm, tolInfo.lowerMm, { minDec: fitDec });
            const linesHtml = [];
            if (tolInfo.mode === 'fit') {
              const kindTxt = tolInfo.kind === 'bohrung' ? 'Bohrung' : 'Welle';
              linesHtml.push(`<b>${esc(tolInfo.code)} (${kindTxt})</b> · Bereich &gt;${tolInfo.rangeMin} bis ${tolInfo.rangeMax} mm`);
              const umU = tolInfo.upperUm === 0 ? '0' : (tolInfo.upperUm > 0 ? '+' : '\u2212') + String(Math.abs(tolInfo.upperUm)).replace('.', ',');
              const umL = tolInfo.lowerUm === 0 ? '0' : (tolInfo.lowerUm > 0 ? '+' : '\u2212') + String(Math.abs(tolInfo.lowerUm)).replace('.', ',');
              linesHtml.push(`Abmaße: <b>${esc(dev.upStr)} / ${esc(dev.loStr)} ${esc(Units.label())}</b> (${umU} / ${umL} µm)`);
            } else {
              linesHtml.push(`Abmaße: <b>${esc(dev.upStr)} / ${esc(dev.loStr)} ${esc(Units.label())}</b>`);
            }
            linesHtml.push(`Grenzmaße: <b>${esc(lim.minStr)} – ${esc(lim.maxStr)} ${esc(Units.label())}</b>`);
            if (tolInfo.mode === 'fit' && tolInfo.hint) linesHtml.push(`<span style="color:var(--muted)">${esc(tolInfo.hint)}</span>`);
            if (tolInfo.mode === 'fit' && tolInfo.norm) linesHtml.push(`<span style="color:var(--muted)">Quelle: ${esc(tolInfo.norm)}</span>`);
            tolBox.append(h('div', { class: 'hint-box', id: 'dw-tol-info', html: linesHtml.join('<br>') }));
          }
        }
        selSec.append(tolBox);
      }
      if (selResolved && selResolved.lost) {
        selSec.append(h('div', { class: 'hint-box', id: 'dw-dim-lost-hint', html: `<b>Bezug verloren:</b> ${esc(selResolved.lostReason || 'Die zugehörige Kante oder Bohrung gibt es im Modell nicht mehr.')}` }));
      }
      const row = h('div', { class: 'btn-row' });
      if (selResolved && selResolved.lost && !selResolved.auto) {
        const isRb = tool === 'dim' && toolState && toolState.rebindId === selResolved.id;
        const rb = h('button', { type: 'button', class: 'btn' + (isRb ? ' active' : ''), id: 'dw-dim-rebind' }, isRb ? 'Abbrechen' : 'Neu zuordnen');
        rb.onclick = () => { if (isRb) setTool(null); else startRebind(selResolved.id); };
        row.append(rb);
      }
      if (isSec) {
        const fl = h('button', { type: 'button', class: 'btn', id: 'dw-sec-flip' }, 'Blickrichtung umkehren');
        fl.onclick = () => flipSection(selDim);
        row.append(fl);
      }
      if (selD && selD.type === 'ang') {
        const sup = h('button', { type: 'button', class: 'btn', id: 'dw-dim-supp' }, 'Gegenwinkel (180° − α)');
        sup.onclick = () => flipAngleDim(selDim);
        row.append(sup);
      }
      if (selCtr) {
        const hb = h('button', { type: 'button', class: 'btn', id: 'dw-ctr-hide' });
        hb.innerHTML = icon('eyeOff') + 'Ausblenden';
        hb.onclick = () => hideCenter(selCtr.id);
        row.append(hb);
      } else {
        const del = h('button', { type: 'button', class: 'btn danger', id: 'dw-del-sel' }); del.innerHTML = icon('trash') + 'Gewähltes löschen'; del.onclick = () => removeSel();
        row.append(del);
      }
      selSec.append(row);
      w.append(selSec);
    }
    w.append(h('div', { class: 'hint-box', html: 'Die Ansichten stehen nach <b>Projektionsmethode 1</b>: Draufsicht unter der Vorderansicht, Seitenansicht von links rechts daneben (Ansichten lassen sich per Ziehen verschieben). Wähle eine Ansicht auf dem Blatt oder in der Liste, um Maßstab, Kanten oder Schattierung einzustellen. Mit <b>Schnittansicht (S)</b> ziehst du eine Schnittlinie A–A durch eine Ansicht, mit <b>Detailansicht (Z)</b> vergrößerst du einen Ausschnitt im eigenen Maßstab, mit <b>Hinweislinie (N)</b> setzt du Notizen an Kanten oder Flächen. Klick ein <b>Maß</b> an für Toleranzen (±, Abmaße, Grenzmaße) oder ISO-286-Passungen (H7, g6 …) – oder wähle Maß, Schnitt, Detail, Hinweislinie oder Mittellinie und drück <b>Entf</b> zum Löschen bzw. Ausblenden.' }));
    body.append(w);
  }
  function tool_(t) { setTool(tool === t ? null : t); }
  App.on('doc', () => { if (App.mode === 'drawing') refreshSoonDoc(); });
  App.on('docLoaded', () => { lastLostKey = ''; });
  const refreshSoonDoc = debounce(async () => { await refresh(); Panels.renderRight(); }, 150);
  return {
    open, close, refresh, sheetMenu, viewMenu, exportMenu, drawMenu, autoDims, tool: tool_, setDimMode, dimMenu, flipAngleDim, onKey, renderPanel,
    SHEETS, sheets, activeSheet: dwg, addSheet, selectSheet, renameSheet, removeSheet, duplicateSheet,
    addView, removeView, selectView, setViewOpt, viewOpts, activeViews, updateFreeViewCamera,
    get selectedView() { return currentViewKey(); },
    details, addDetail, updateDetail, removeDetail, nextDetailLabel, DETAIL_SCALES,
    DIM_ARROWS, DIM_FONT_SIZES, dimStyle: () => sheetDimStyle(), setDimStyle,
    notes, addNote, updateNote, removeNote, moveView, resetViewPos,
    select: (id) => { selDim = id; render(); Panels.renderRight(); },
    get selectedId() { return selDim; },
    addSection, flipSection, removeSection, sections: () => (dwg().sections || []).slice(), waitReady, hatchStepSheet,
    centers, allCenters, setCenters, hideCenter, showCenter, toggleCenter, showAllCenters,
    iso286, ISO286: ISO286_DATA,
    dims: () => autoDimList(dwg(), layout || computeLayout(dwg())).map((x) => ({ ...x, nominalMm: dimNominal(x) })),
    lostDims, removeDim, removeLostDims, startRebind, rebindDim, addDim,
    getDimTol, setDimTol,
    exportPDF, buildPDFBytes,
    get layout() { return layout; },
    get activeTool() { return tool; },
    get dimMode() { return dimMode; },
  };
})();

