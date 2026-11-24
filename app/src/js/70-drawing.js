// ================= Technische Zeichnung =================
const Drawing = (() => {
  const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
  const SHEET_ORDER = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const SCALES = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  const DETAIL_SCALES = [1, 2, 2.5, 3, 4, 5, 10, 20];
  const DETAIL_LETTERS = 'ZYXWVUTSRQPONMLKJIHGFEDCBA'.split('');
  const VIEW_NAMES = { front: 'Vorderansicht', top: 'Draufsicht', left: 'Seitenansicht' };
  const ISO286_DATA = /*JSON:iso286.json*/null;
  const scaleText = (s) => (s >= 1 ? `${fmtFixed(s, 2)}:1` : `1:${fmtFixed(1 / s, 2)}`);
  let proj = null, projRev = -1, loadingProjPromise = null, projId = 0;
  let svg = null, wrap = null, holder = null, tabsBar = null, zoom = 1, tool = null, toolState = null, selDim = null;
  let layout = null, dragDetail = null;
  let detailDraft = { scale: 2, label: 'Z' };
  let centersListOpen = false;
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
      views: opts.views ? { ...opts.views } : { front: true, top: true, left: true, iso: true },
      hidden: opts.hidden != null ? !!opts.hidden : (tpl ? !!tpl.hidden : true),
      centers: opts.centers != null ? !!opts.centers : (tpl ? !!tpl.centers : true),
      hiddenCenters: Array.isArray(opts.hiddenCenters) ? opts.hiddenCenters.slice() : [],
      dims: opts.dims || defaultAutoDims(),
      free: opts.free || [],
      details: opts.details ? opts.details.map((x) => ({ ...x, c: x.c ? [...x.c] : [0, 0], pos: x.pos ? [...x.pos] : null })) : [],
      sections: Array.isArray(opts.sections) ? opts.sections : [],
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
      hidden: raw && raw.hidden,
      centers: raw && raw.centers,
      hiddenCenters: raw && Array.isArray(raw.hiddenCenters) ? raw.hiddenCenters : [],
      dims: raw && Array.isArray(raw.dims) ? raw.dims : undefined,
      free: raw && Array.isArray(raw.free) ? raw.free : undefined,
      details: raw && Array.isArray(raw.details) ? raw.details : [],
      sections: raw && Array.isArray(raw.sections) ? raw.sections : undefined,
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
      if (!cur || !cur.id || !SHEETS[cur.sheet] || !cur.views || !Array.isArray(cur.dims) || !Array.isArray(cur.free) || !cur.title || !cur.name) {
        d.drawing.sheets[i] = normalizeSheet(cur, `Blatt ${i + 1}`);
      } else if (!Array.isArray(cur.details)) {
        cur.details = [];
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
    selDim = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section') ? { stage: 0 } : tool ? {} : null;
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
    selDim = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section') ? { stage: 0 } : tool ? {} : null;
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
  function close() { window.removeEventListener('pointerup', onUp); tool = null; toolState = null; dragDetail = null; const el = $('#sheet'); if (el) el.innerHTML = ''; svg = null; wrap = null; holder = null; tabsBar = null; }
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
      const ren = h('button', { type: 'button', class: 'st-act st-ren', 'aria-label': 'Blatt umbenennen', 'data-tip': 'Blatt umbenennen' });
      ren.innerHTML = icon('edit');
      ren.onclick = (e) => { e.stopPropagation(); renameSheet(s.id); };
      tab.append(nm, fmt, ren);
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
    const needIso = sheets().some((s) => s.views && s.views.iso);
    if (!Model.activeItems(App.doc).length) { proj = null; projRev = App.revision; return; }
    const needBase = App.revision !== projRev || !proj || !proj.views || (needIso && !proj.views.iso);
    const allSecs = collectNeededSections();
    const existingSecs = (proj && proj.sections) || {};
    const missingSecs = needBase ? allSecs : allSecs.filter((s) => !existingSecs[s.key]);
    if (!needBase && !missingSecs.length) return;
    if (loadingProjPromise) {
      await loadingProjPromise;
      return ensureProjections();
    }
    loadingProjPromise = (async () => {
      try {
        const scene = Model.kernelScene(App.doc);
        const rev = App.revision;
        if (needBase) {
          const views = ['front', 'top', 'left'];
          if (needIso) views.push('iso');
          proj = await Kernel.call('project', { scene, views, sections: allSecs });
          projId++;
          projRev = rev;
        } else if (missingSecs.length) {
          const res = await Kernel.call('project', { scene, views: [], sections: missingSecs });
          if (App.revision === rev) {
            proj.sections = { ...(proj.sections || {}), ...(res.sections || {}) };
            projId++;
          }
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
    if (holder) render();
  }
  async function refresh() {
    if (App.mode !== 'drawing') return;
    try {
      await ensureProjections();
    } catch (e) { UI.toast('Die Ansichten konnten nicht berechnet werden: ' + e.message, { kind: 'bad' }); }
    render();
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
    // beim Bemaßen wird bei jeder Mausbewegung neu gezeichnet – die aufgeräumten Kanten merken
    const ck = name + '|' + projId + '|' + !!sh.hidden;
    let g = geoCache.get(ck);
    if (!g) {
      if (geoCache.size > 16) geoCache.clear();
      g = viewGeom_(name, sh);
      if (!g) return null;
      geoCache.set(ck, g);
    }
    return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh) };
  }
  function viewGeom_(name, sh = dwg()) {
    const v = proj.views[name];
    const raw = (e) => (e.t === 'LINE' && e.a ? { kind: 'line', a: e.a, b: e.b } : e.t === 'CIRCLE' && e.c && e.pts ? { kind: 'arc', c: e.c, r: e.r, full: !!e.full, pts: e.pts } : e.pts ? { kind: 'curve', pts: e.pts } : null);
    // Isometrie wie üblich ohne verdeckte Kanten
    const showHidden = sh.hidden && name !== 'iso';
    const cg = cleanGeom(v.visible.map(raw).filter(Boolean), showHidden ? v.hidden.map(raw).filter(Boolean) : []);
    const polys = cg.vis, hidden = cg.hid, circles = [], points = [];
    for (const p of polys) {
      points.push(p.pts[0], p.pts[p.pts.length - 1]);
      if (p.c) { circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }); points.push(p.c); }
    }
    for (const p of hidden) points.push(p.pts[0], p.pts[p.pts.length - 1]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const arr of [polys, hidden]) for (const p of arr) for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    if (!isFinite(x0)) return null;
    // Mittellinien und kosmetische Gewinde (KP-20)
    const allCenters = computeViewCenters(name, v);
    const threads = [];
    if (name !== 'iso') {
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
    return { polys, hidden, circles, points, allCenters, threads, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
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
    const polys = [], hidden = [], circles = [], points = [], allCenters = [], threads = [];
    for (const p of srcGeo.polys || []) {
      if (p.c) polys.push(...clipArcCircle(p, cx, cy, R));
      else polys.push(...clipPolyCircle(p.pts, cx, cy, R));
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
    return { polys, hidden, circles, points, centers, allCenters, threads, box: [cx - R, cy - R, cx + R, cy + R], w: 2 * R, h: 2 * R };
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
  function layoutSheet(sh, s, G, secGeos, area) {
    const gap = 22;
    const views = {};
    const occ = [];
    const addOcc = (px, py, vw, vh, pad = 8, padBot = 10) => occ.push([px - pad, py - pad, px + vw + pad, py + vh + padBot]);
    const hits = (r) => {
      if (r[0] < area.x + 2 || r[1] < area.y + 2 || r[2] > area.x + area.w - 2 || r[3] > area.y + area.h - 2) return true;
      for (const o of occ) if (r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]) return true;
      return false;
    };
    const main = G.front || G.top || G.left;
    let x0 = area.x + 12, y0 = area.y + 12, fw = 0, fh = 0, lw = 0, th = 0;
    if (main) {
      fw = G.front ? G.front.w * s : G.top.w * s; fh = G.front ? G.front.h * s : 0;
      lw = G.left ? G.left.w * s : 0; th = G.top ? G.top.h * s : 0;
      const totalW = fw + (G.left ? gap + lw : 0), totalH = fh + (G.top ? gap + th : 0);
      const secRoom = secGeos.length && !G.iso ? 0.72 : (G.iso ? 0.72 : 1);
      x0 = area.x + Math.max(12, (area.w * secRoom - totalW) / 2);
      y0 = area.y + Math.max(12, (area.h - totalH) / 2);
      const place = (name, geo, px, py) => {
        views[name] = { geo, s, ox: px - geo.box[0] * s, oy: py + geo.box[3] * s };
        addOcc(px, py, geo.w * s, geo.h * s);
      };
      if (G.front) place('front', G.front, x0, y0);
      if (G.left) {
        const py = G.front ? y0 + (G.front.box[3] - G.left.box[3]) * s : y0;
        place('left', G.left, x0 + fw + gap, py);
        if (G.front) views.left.oy = views.front.oy;
      }
      if (G.top) {
        place('top', G.top, x0, y0 + fh + (G.front ? gap : 0));
        if (G.front) views.top.ox = views.front.ox;
      }
      if (G.iso) {
        const rx = x0 + fw + gap; const ry = G.top ? y0 + fh + gap : y0;
        const aw = area.x + area.w - rx - 6, ah = area.y + area.h - ry - 6;
        let si = s; while (si > 0.01 && (G.iso.w * si > aw || G.iso.h * si > ah)) si /= 1.25;
        if (aw > 20 && ah > 20) {
          const ix = rx + (aw - G.iso.w * si) / 2, iy = ry + (ah - G.iso.h * si) / 2;
          views.iso = { geo: G.iso, s: si, ox: ix - G.iso.box[0] * si, oy: iy + G.iso.box[3] * si, noDims: true };
          addOcc(ix, iy, G.iso.w * si, G.iso.h * si, 4, 4);
        }
      }
    }
    let fits = true;
    for (const { sec, geo } of secGeos) {
      const vw = geo.w * s, vh = geo.h * s;
      let px = null, py = null;
      if (Array.isArray(sec.pos) && sec.pos.length >= 2) {
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
    const G = { front: sh.views.front ? viewGeom('front', sh) : null, top: sh.views.top ? viewGeom('top', sh) : null, left: sh.views.left ? viewGeom('left', sh) : null, iso: sh.views.iso ? viewGeom('iso', sh) : null, free: freeGeom(sh) };
    const secGeos = (sh.sections || []).map((sec) => ({ sec, geo: sectionGeom(sec, sh) })).filter((x) => x.geo);
    const main = G.front || G.top || G.left;
    let s = 1;
    const gap = 22;
    const needW = (sc) => (G.front ? G.front.w * sc : G.top ? G.top.w * sc : 0) + (G.left ? gap + G.left.w * sc : 0);
    const needH = (sc) => (G.front ? G.front.h * sc : G.left ? G.left.h * sc : 0) + (G.top ? gap + G.top.h * sc : 0);
    const isoRoom = G.iso ? 0.35 : 0;
    let views = {};
    if (!secGeos.length) {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main) { s = 1; break; }
          if (needW(sc) + 24 <= area.w * (G.iso && !G.top ? 1 - isoRoom : 1) && needH(sc) + 24 <= area.h) { s = sc; break; }
        }
      } else s = +sh.scale || 1;
      if (main) {
        const fw = G.front ? G.front.w * s : G.top.w * s, fh = G.front ? G.front.h * s : 0;
        const lw = G.left ? G.left.w * s : 0; const th = G.top ? G.top.h * s : 0;
        const totalW = fw + (G.left ? gap + lw : 0), totalH = fh + (G.top ? gap + th : 0);
        const x0 = area.x + Math.max(12, (area.w * (G.iso ? 0.72 : 1) - totalW) / 2), y0 = area.y + Math.max(12, (area.h - totalH) / 2);
        const place = (name, geo, px, py) => { views[name] = { geo, s, ox: px - geo.box[0] * s, oy: py + geo.box[3] * s }; };
        if (G.front) place('front', G.front, x0, y0);
        if (G.left) { const py = G.front ? y0 + (G.front.box[3] - G.left.box[3]) * s : y0; place('left', G.left, x0 + fw + gap, py); if (G.front) views.left.oy = views.front.oy; }
        if (G.top) { place('top', G.top, x0, y0 + fh + (G.front ? gap : 0)); if (G.front) views.top.ox = views.front.ox; }
        if (G.iso) {
          const rx = x0 + fw + gap; const ry = G.top ? y0 + fh + gap : y0;
          const aw = area.x + area.w - rx - 6, ah = area.y + area.h - ry - 6;
          let si = s; while (si > 0.01 && (G.iso.w * si > aw || G.iso.h * si > ah)) si /= 1.25;
          if (aw > 20 && ah > 20) views.iso = { geo: G.iso, s: si, ox: rx + (aw - G.iso.w * si) / 2 - G.iso.box[0] * si, oy: ry + (ah - G.iso.h * si) / 2 + G.iso.box[3] * si, noDims: true };
        }
      }
    } else {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main && !secGeos.length) { s = 1; break; }
          if (main && (needW(sc) + 24 > area.w * 0.78 || needH(sc) + 24 > area.h)) continue;
          const tryLay = layoutSheet(sh, sc, G, secGeos, area);
          if (tryLay.fits) { s = sc; views = tryLay.views; break; }
        }
        if (!Object.keys(views).length) views = layoutSheet(sh, s, G, secGeos, area).views;
      } else {
        s = +sh.scale || 1;
        views = layoutSheet(sh, s, G, secGeos, area).views;
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
  function dimLabelParts(dim, nominalMm) {
    const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
    if (dim.type === 'dia' || dim.type === 'rad') {
      if (dim.threadLabel) return { mainLabel: countPrefix + dim.threadLabel, prefix: '', isThread: true };
      const prefix = dim.type === 'dia' ? 'Ø' : 'R';
      return { mainLabel: countPrefix + prefix + fmtDim(nominalMm), prefix, isThread: false };
    }
    return { mainLabel: fmtDim(nominalMm), prefix: '', isThread: false };
  }
  function findDimById(id, sh = dwg(), lay = layout) {
    if (!id || !sh) return null;
    const list = lay ? autoDimList(sh, lay) : (sh.dims || []).filter((x) => !x.auto);
    const dim = list.find((x) => x.id === id);
    if (!dim) return null;
    const nominalMm = dimNominal(dim);
    const { mainLabel } = dimLabelParts(dim, nominalMm);
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
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = 2.8;
      const countPrefix = count > 1 ? count + '× ' : '';
      return { totalW: Math.max(textW(countPrefix + prefix + tolInfo.maxStr, LIM), textW(prefix + tolInfo.minStr, LIM)) * 0.95 };
    }
    const SUB = 2.3, gap = 0.8;
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    return { totalW: wMain + gap + wStack };
  }
  function emitDimTexts(texts, cx, cy, ang, dim, mainLabel, prefix, tolInfo, TXT) {
    const rad = (ang * Math.PI) / 180;
    const exX = Math.cos(rad), exY = Math.sin(rad);
    const euX = Math.sin(rad), euY = -Math.cos(rad);
    const pt = (lx, ly) => [cx + exX * lx + euX * ly, cy + exY * lx + euY * ly];
    const base = { rot: ang, id: dim.id, view: dim.view };
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
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = 2.8;
      const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
      const pTop = pt(0, 2.7), pBot = pt(0, 0);
      texts.push({ ...base, x: pTop[0], y: pTop[1], t: countPrefix + prefix + tolInfo.maxStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'max' });
      texts.push({ ...base, x: pBot[0], y: pBot[1], t: prefix + tolInfo.minStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'min' });
      return;
    }
    const SUB = 2.3, gap = 0.8;
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    const x0 = -(wMain + gap + wStack) / 2;
    const pMain = pt(x0, 0.1), pUp = pt(x0 + wMain + gap, 2.0), pLo = pt(x0 + wMain + gap, -0.2);
    texts.push({ ...base, x: pMain[0], y: pMain[1], t: leftText, size: TXT, anchor: 'start', cls: 'dimtext', tolPart: 'main' });
    texts.push({ ...base, x: pUp[0], y: pUp[1], t: tolInfo.upStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'upper' });
    texts.push({ ...base, x: pLo[0], y: pLo[1], t: tolInfo.loStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'lower' });
  }

  // ---------- Bemaßung ----------
  function autoDimList(sh = dwg(), lay = layout) {
    const all = [];
    for (const dim of sh.dims) {
      if (!dim.auto) { all.push(dim); continue; }
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
          const item = { ...dim, id: subId, type: 'dia', c: best.c, r: best.r, ang, count: g.length, ...(mt ? { threadLabel: `${mt.size} × ${fmtDim(mt.length)}` } : {}) };
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
  function dimSVG(dim, lines, texts, lay = layout) {
    const v = lay.views[dim.view]; if (!v) return;
    const TXT = 3.5, AR = 3, EXT = 2, GAPX = 1;
    if (dim.type === 'lin') {
      const A = toSheet(v, dim.a), B = toSheet(v, dim.b);
      let val, P1, P2, E1s, E2s;
      if (dim.dir === 'h') {
        const y = Math.min(A[1], B[1]) + (dim.off < 0 ? 0 : 0);
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
      lines.push({ pts: E1s, cls: 'dim', id: dim.id }, { pts: E2s, cls: 'dim', id: dim.id }, { pts: [P1, P2], cls: 'dim', id: dim.id });
      const L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
      const inside = L > AR * 2.6;
      arrowHead(lines, P1, P2, AR, inside, dim.id); arrowHead(lines, P2, P1, AR, inside, dim.id);
      if (!inside) { const ux = (P2[0] - P1[0]) / (L || 1), uy = (P2[1] - P1[1]) / (L || 1); lines.push({ pts: [[P1[0] - ux * AR * 2.4, P1[1] - uy * AR * 2.4], P1], cls: 'dim', id: dim.id }, { pts: [P2, [P2[0] + ux * AR * 2.4, P2[1] + uy * AR * 2.4]], cls: 'dim', id: dim.id }); }
      const mx = (P1[0] + P2[0]) / 2, my = (P1[1] + P2[1]) / 2;
      // Maßzahl lesbar von unten oder von rechts (ISO 129): Winkel in [-90°, 90°)
      let ang = (Math.atan2(P2[1] - P1[1], P2[0] - P1[0]) * 180) / Math.PI;
      if (ang >= 89.99) ang -= 180; if (ang < -90.01) ang += 180;
      const r = (ang * Math.PI) / 180; const tx = mx + Math.sin(r) * 1.2, ty = my - Math.cos(r) * 1.2;
      const { mainLabel, prefix } = dimLabelParts(dim, val);
      const tolInfo = resolveDimTol(dim, val);
      emitDimTexts(texts, tx, ty, ang, dim, mainLabel, prefix, tolInfo, TXT);
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
      const { mainLabel, prefix } = dimLabelParts(dim, nomVal);
      const tolInfo = resolveDimTol(dim, nomVal);
      const { totalW } = measureDimLabel(mainLabel, prefix, tolInfo, TXT, dim.count);
      const tl = totalW + 2.5;
      const tail = [out[0] + (ux >= 0 ? tl : -tl), out[1]];
      if (dim.type === 'dia') {
        const Q = [C[0] - ux * R, C[1] - uy * R];
        if (2 * R >= AR * 2.6) { lines.push({ pts: [Q, P], cls: 'dim', id: dim.id }); arrowHead(lines, Q, P, AR, true, dim.id); arrowHead(lines, P, Q, AR, true, dim.id); }
        else {
          // kleine Kreise: Pfeile von außen
          const Q2 = [Q[0] - ux * AR * 2.2, Q[1] - uy * AR * 2.2];
          lines.push({ pts: [Q2, P], cls: 'dim', id: dim.id }); arrowHead(lines, Q, Q2, AR, true, dim.id); arrowHead(lines, P, out, AR, true, dim.id);
        }
      } else if (R >= AR * 1.3) { lines.push({ pts: [C, P], cls: 'dim', id: dim.id }); arrowHead(lines, P, C, AR, true, dim.id); }
      else arrowHead(lines, P, out, AR, true, dim.id);
      lines.push({ pts: [P, out, tail], cls: 'dim', id: dim.id });
      emitDimTexts(texts, (out[0] + tail[0]) / 2, out[1] - 1.2, 0, dim, mainLabel, prefix, tolInfo, TXT);
    }
  }
  function fmtDim(v) { return Units.fmtLen(v, 2); }
  function arrowHead(lines, tip, from, len, inside, id, secId) {
    const dx = from[0] - tip[0], dy = from[1] - tip[1]; const L = Math.hypot(dx, dy) || 1; let ux = dx / L, uy = dy / L;
    if (!inside) { ux = -ux; uy = -uy; }
    const w = len * 0.28;
    const b = [tip[0] + ux * len, tip[1] + uy * len];
    lines.push({ poly: [tip, [b[0] - uy * w, b[1] + ux * w], [b[0] + uy * w, b[1] - ux * w]], cls: 'arrow', id, ...(secId ? { secId } : {}) });
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
      arrowHead(lines, EP, tail, 3.2, true, sec.id, sec.id);
      const lx = tail[0] - lookSheet[0] * 1.2 + ux * outU * 3.2;
      const ly = tail[1] - lookSheet[1] * 1.2 + uy * outU * 3.2 + 1.5;
      texts.push({ x: lx, y: ly, t: sec.label, size: 4.5, anchor: 'middle', id: sec.id, secId: sec.id, cls: 'cutlabel' });
    }
  }

  // ---------- Zeichnen ----------
  function buildSheetContent(sh, idx, total) {
    const lay = computeLayout(sh);
    const { W, H, frame } = lay;
    const lines = [], texts = [];
    // Rahmen
    lines.push({ rect: [0, 0, W, H], cls: 'paper' });
    lines.push({ rect: [frame.x, frame.y, frame.w, frame.h], cls: 'frame' });
    // Ansichten
    for (const [name, v] of Object.entries(lay.views)) {
      const asLine = (p, cls) => {
        if (p.c && !p.arc) return { circle: [...toSheet(v, p.c), p.r * v.s], cls, view: name };
        const l = { pts: p.pts.map((q) => toSheet(v, q)), cls, view: name };
        if (p.arc) l.arc = { c: toSheet(v, p.c), r: p.r * v.s, a: p.arc };
        return l;
      };
      if (v.isSection) buildHatchLines(v, v.section, lines);
      for (const p of v.geo.polys) lines.push(asLine(p, 'vis'));
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
            const lbl = `${th.size} × ${fmtDim(th.length)}`;
            const tw = textW(lbl, 3.2) + 2;
            const P2 = [P1[0] + tw, P1[1]];
            lines.push({ pts: [P0, P1, P2], cls: 'dim', view: name });
            texts.push({ x: (P1[0] + P2[0]) / 2, y: P1[1] - 1, t: lbl, size: 3.2, rot: 0, anchor: 'middle', cls: 'dimtext', view: name });
          }
        }
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
    for (const dim of autoDimList(sh, lay)) if (lay.views[dim.view] && !lay.views[dim.view].noDims) dimSVG(dim, lines, texts, lay);
    // Schriftfeld
    titleBlock(sh, lay, idx, total, lines, texts);
    return { layout: lay, lines, texts };
  }
  function render() {
    if (!holder) return;
    const all = sheets(), idx = activeIndex(), sh = all[idx] || dwg();
    const cur = buildSheetContent(sh, idx, all.length);
    layout = cur.layout;
    // Werkzeug-Vorschau
    if (tool === 'dim' && toolState) previewDim(cur.lines, cur.texts);
    if (tool === 'detail' && toolState) previewDetail(cur.lines, cur.texts);
    if (tool === 'section' && toolState) previewSection(cur.lines, cur.texts);
    buildSVG(cur.lines, cur.texts);
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
  function buildSVG(lines, texts) {
    const { W, H } = layout;
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('xmlns', NS);
    s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('width', W * zoom * 3.2); s.setAttribute('height', H * zoom * 3.2);
    const style = document.createElementNS(NS, 'style');
    style.textContent = `.paper{fill:#fff;stroke:none}.frame{fill:none;stroke:#111;stroke-width:.7}.thin{fill:none;stroke:#111;stroke-width:.25}.vis{fill:none;stroke:#111;stroke-width:.5;stroke-linecap:round;stroke-linejoin:round}.hid{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:2.4 1.2}.ctr{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:5 1.2 .6 1.2}.ctr[data-id]{cursor:pointer}.ctr.sel{stroke:#0c7a70;stroke-width:.45}.hatch{fill:none;stroke:#111;stroke-width:.22}.cutline{fill:none;stroke:#111;stroke-width:.35;stroke-dasharray:7 1.2 .7 1.2}.cutend{fill:none;stroke:#111;stroke-width:.7;stroke-linecap:square}.dim{fill:none;stroke:#111;stroke-width:.25}.arrow{fill:#111;stroke:none}.detail{fill:none;stroke:#111;stroke-width:.25;cursor:pointer}.detail-border{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:3 1.5;cursor:grab}.detail.sel,.detail-border.sel{stroke:#0c7a70;stroke-width:.45}.sel .dim,.dim.sel,.cutline.sel,.cutend.sel,.hatch.sel{stroke:#0c7a70}.dim.sel{stroke-width:.4}.arrow.sel{fill:#0c7a70}text{font-family:"Barlow Semi Condensed","Barlow",Arial,sans-serif;fill:#111}text.dimtext{cursor:pointer}text.lab{fill:#555}text.note{fill:#888}text.cutlabel,text.viewlabel{font-weight:700}text.sel{fill:#0c7a70}text.detail-lbl{font-weight:600;cursor:pointer}.prev{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:1.5 1}.snap{fill:none;stroke:#0c7a70;stroke-width:.4}`;
    s.append(style);
    const g = document.createElementNS(NS, 'g'); s.append(g);
    const f = (n) => (Math.round(n * 1000) / 1000).toString();
    for (const l of lines) {
      let el;
      const sel = l.id && l.id === selDim;
      if (l.rect) { el = document.createElementNS(NS, 'rect'); el.setAttribute('x', f(l.rect[0])); el.setAttribute('y', f(l.rect[1])); el.setAttribute('width', f(l.rect[2])); el.setAttribute('height', f(l.rect[3])); }
      else if (l.circle) { el = document.createElementNS(NS, 'circle'); el.setAttribute('cx', f(l.circle[0])); el.setAttribute('cy', f(l.circle[1])); el.setAttribute('r', f(l.circle[2])); }
      else if (l.poly) { el = document.createElementNS(NS, 'polygon'); el.setAttribute('points', l.poly.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      else { el = document.createElementNS(NS, 'polyline'); el.setAttribute('points', l.pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      el.setAttribute('class', l.cls + (sel ? ' sel' : ''));
      if (l.id) el.dataset.id = l.id;
      if (l.view) el.dataset.view = l.view;
      if (l.ctrType) el.dataset.ctr = l.ctrType;
      if (l.secId) el.dataset.sec = l.secId;
      if (l.capIdx != null) el.dataset.cap = String(l.capIdx);
      g.append(el);
    }
    for (const t of texts) {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', f(t.x)); el.setAttribute('y', f(t.y)); el.setAttribute('font-size', f(t.size)); el.setAttribute('text-anchor', t.anchor || 'start');
      if (t.rot) el.setAttribute('transform', `rotate(${f(t.rot)} ${f(t.x)} ${f(t.y)})`);
      el.setAttribute('class', (t.cls || '') + (t.id && t.id === selDim ? ' sel' : ''));
      if (t.id) el.dataset.id = t.id;
      if (t.view) el.dataset.view = t.view;
      if (t.secId) el.dataset.sec = t.secId;
      if (t.tolPart) el.dataset.tol = t.tolPart;
      el.textContent = t.t;
      g.append(el);
    }
    holder.innerHTML = ''; holder.append(s); svg = s;
    s.addEventListener('pointermove', onMove); s.addEventListener('pointerdown', onDown); s.addEventListener('contextmenu', onContextMenu);
    lastLines = lines; lastTexts = texts;
  }
  let lastLines = [], lastTexts = [];
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
  function snapIn(name, P) {
    const v = layout.views[name]; if (!v) return null;
    const tol = 2.6 / zoom;
    let best = null, bd = tol;
    for (const q of v.geo.points) { const S = toSheet(v, q); const d = Math.hypot(S[0] - P[0], S[1] - P[1]); if (d < bd) { bd = d; best = { p: q, S }; } }
    return best;
  }
  function circleAt(name, P) {
    const v = layout.views[name]; if (!v) return null;
    const q = toView(v, P); let best = null, bd = 2 / v.s / zoom + 0.5;
    for (const c of v.geo.circles) {
      const d = Math.abs(Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) - c.r); if (d >= bd) continue;
      if (c.arc) { let a = angOf(c.c, q); if (a < c.arc[0] - 0.05) a += TWO_PI; if (a > c.arc[1] + 0.05) continue; }
      bd = d; best = c;
    }
    return best && { ...best, ang: (angOf(best.c, q) * 180) / Math.PI };
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
  function onMove(e) {
    if (dragDetail) {
      const P = sheetPt(e);
      dragDetail.curPos = [dragDetail.origPos[0] + (P[0] - dragDetail.startP[0]), dragDetail.origPos[1] + (P[1] - dragDetail.startP[1])];
      if (Math.hypot(P[0] - dragDetail.startP[0], P[1] - dragDetail.startP[1]) > 0.5) dragDetail.moved = true;
      render();
      return;
    }
    if (tool === 'dim') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      const name = toolState.view || viewAt(P);
      toolState.hoverView = name;
      toolState.snap = name ? snapIn(name, P) : null;
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
    if (tool && tool.startsWith('free-')) { freeDown(e); return; }
    const t = e.target.closest && e.target.closest('[data-id]');
    selDim = t ? t.dataset.id : centerAt(P);
    if (selDim && layout && layout.views[selDim] && layout.views[selDim].detail) {
      dragDetail = { id: selDim, startP: P, origPos: [...layout.views[selDim].sheetCenter], curPos: null, moved: false };
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
      d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|sec_' + id + '|'));
    });
    if (selDim === id) selDim = null;
    render();
    Panels.renderRight();
    return true;
  }
  function dimClick(P, e) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const name = viewAt(P); if (!name) return;
      const sn = snapIn(name, P);
      if (!sn) { const c = circleAt(name, P); if (c) { addDim({ view: name, type: c.full ? 'dia' : 'rad', c: c.c, r: c.r, ang: Math.round(c.ang) }); return; } UI.toast('Klick auf einen Eckpunkt, eine Linie, einen Kreis oder eine Rundung.', { icon: 'info', ms: 2000 }); return; }
      toolState = { stage: 1, view: name, a: sn.p, P };
    } else if (st.stage === 1) {
      const sn = snapIn(st.view, P); if (!sn) return;
      if (Math.hypot(sn.p[0] - st.a[0], sn.p[1] - st.a[1]) < 1e-6) return;
      toolState = { ...st, stage: 2, b: sn.p };
    } else if (st.stage === 2) {
      const v = layout.views[st.view]; const q = toView(v, P);
      const dimObj = placeDim(st.a, st.b, q);
      addDim({ view: st.view, ...dimObj });
    }
    render();
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
    if (st.snap) lines.push({ circle: [st.snap.S[0], st.snap.S[1], 1.2 / zoom * 1.5], cls: 'snap' });
    if (st.stage === 1 && st.P) { const v = layout.views[st.view]; const A = toSheet(v, st.a); lines.push({ pts: [A, st.P], cls: 'prev' }); }
    if (st.stage === 2 && st.P) { const v = layout.views[st.view]; const q = toView(v, st.P); const d = { id: '__prev', view: st.view, ...placeDim(st.a, st.b, q) }; dimSVG(d, lines, texts); }
  }
  function addDim(dim) {
    App.change('Maß hinzugefügt', () => { dwg().dims.push({ id: uid('d'), ...dim }); });
    toolState = { stage: 0 };
    render();
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (tool) { setTool(null); return true; } if (selDim) { selDim = null; render(); Panels.renderRight(); return true; } return false; }
    if (e.key === 'Enter' && tool === 'detail' && toolState && toolState.stage === 2) {
      addDetail({ source: toolState.source, c: toolState.c, r: toolState.r, scale: detailDraft.scale, label: detailDraft.label, pos: null });
      setTool(null);
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selDim) { removeSel(); return true; }
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('dim'); return true; }
    if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('detail'); return true; }
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('section'); return true; }
    return false;
  }
  function viewLabel(vName, sh = dwg()) {
    if (VIEW_NAMES[vName]) return VIEW_NAMES[vName];
    if (String(vName).startsWith('sec_')) {
      const sec = (sh.sections || []).find((x) => 'sec_' + x.id === vName);
      return sec ? `Schnitt ${sec.label}–${sec.label}` : 'Schnitt';
    }
    const det = (sh.details || []).find((x) => x.id === vName);
    return det ? `Detail ${det.label}` : vName;
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
    App.change('Gelöscht', () => {
      const d = dwg();
      if ((d.details || []).some((x) => x.id === id)) {
        d.details = (d.details || []).filter((x) => x.id !== id);
        d.dims = d.dims.filter((x) => x.view !== id);
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
    selDim = null; render(); Panels.renderRight();
  }
  function setTool(t) {
    dragDetail = null;
    tool = t;
    if (t === 'detail') {
      detailDraft = { scale: defaultDetailScale(), label: nextDetailLabel() };
      toolState = { stage: 0 };
    } else {
      toolState = (t === 'dim' || t === 'section') ? { stage: 0 } : t ? {} : null;
    }
    if (svg) svg.style.cursor = t ? 'crosshair' : '';
    UI.hint(
      t === 'dim' ? '<b>Maß:</b> Zwei Punkte anklicken, dann die Maßlinie platzieren. Ein Klick auf einen Kreis bemaßt den Durchmesser. <b>Esc</b> beendet.'
        : t === 'detail' ? '<b>Detailansicht:</b> Mitte des Kreises in einer Ansicht anklicken, Kreis aufziehen, dann die Detailansicht auf dem Blatt platzieren. <b>Esc</b> beendet.'
          : t === 'section' ? '<b>Schnittansicht:</b> Schnittlinie A–A durch eine Ansicht ziehen oder zwei Punkte anklicken (<b>Umschalt</b> = waagerecht/senkrecht, <b>Alt</b> = frei). <b>Esc</b> beendet.'
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
  const refreshSoon = debounce(() => { projRev = -1; refresh(); }, 30);
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
      c.querySelector('input').onchange = (e) => set((x) => { x.views[k] = e.target.checked; }); box.append(c);
    }
    for (const [k, l] of [['hidden', T('menu.draw.hiddenEdges')], ['centers', T('menu.draw.centers')]]) {
      const c = h('label', { class: 'check', ...(k === 'centers' ? { 'data-help': 'drawingCenters' } : {}) }, h('input', { type: 'checkbox', id: 'dw-' + k, checked: !!d[k] }), l);
      c.querySelector('input').onchange = k === 'centers'
        ? (e) => { setCenters(e.target.checked); }
        : (e) => set((x) => { x[k] = e.target.checked; });
      box.append(c);
    }
    UI.pop(anchor, box);
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
  function pageStream(W, H, lines, texts) {
    const out = ['1 J 1 j'];
    const style = {
      frame: [0.7, null],
      thin: [0.25, null],
      vis: [0.5, null],
      hid: [0.25, [2.4, 1.2]],
      ctr: [0.25, [5, 1.2, 0.6, 1.2]],
      hatch: [0.22, null],
      cutline: [0.35, [7, 1.2, 0.7, 1.2]],
      cutend: [0.7, null],
      dim: [0.25, null],
      detail: [0.25, null],
      'detail-border': [0.25, [3, 1.5]],
    };
    const px = (x) => pf(x * PT);
    const py = (y) => pf((H - y) * PT);
    for (const l of lines) {
      if (l.cls === 'paper' || l.cls === 'prev' || l.cls === 'snap') continue;
      if (l.cls === 'arrow') {
        const [a, b, c] = l.poly;
        out.push(`0.067 g ${px(a[0])} ${py(a[1])} m ${px(b[0])} ${py(b[1])} l ${px(c[0])} ${py(c[1])} l h f`);
        continue;
      }
      const st = style[l.cls];
      if (!st) continue;
      out.push(`0.067 G ${pf(st[0] * PT)} w`);
      if (st[1]) out.push(`[${st[1].map((v) => pf(v * PT)).join(' ')}] 0 d`);
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
      const gray = t.cls === 'lab' ? '0.333' : '0.067';
      const rad = -((t.rot || 0) * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const dx = t.anchor === 'middle' ? -pdfTextW(raw, fs) / 2 : 0;
      out.push(`${gray} g q ${pf(c)} ${pf(s)} ${pf(-s)} ${pf(c)} ${px(t.x)} ${py(t.y)} cm BT ${fnt} ${pf(fs)} Tf ${pf(dx)} 0 Td (${esc}) Tj ET Q`);
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
      const sBytes = toPdfBytes(pageStream(p.W, p.H, p.lines, p.texts));
      const head = toPdfBytes(`<< /Length ${sBytes.length} >>\nstream\n`);
      const tail = toPdfBytes('\nendstream');
      const cObj = new Uint8Array(head.length + sBytes.length + tail.length);
      cObj.set(head, 0); cObj.set(sBytes, head.length); cObj.set(tail, head.length + sBytes.length);
      const cId = addObj(cObj);
      const pId = addStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pf2(p.W * PT)} ${pf2(p.H * PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cId} 0 R >>`);
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
      return { W: content.layout.W, H: content.layout.H, lines: content.lines, texts: content.texts };
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
    P(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, 7);
    for (const [n, lt, col] of [['SICHTBAR', 'CONTINUOUS', 7], ['VERDECKT', 'DASHED', 8], ['MITTELLINIE', 'CENTER', 1], ['SCHRAFFUR', 'CONTINUOUS', 8], ['SCHNITTLINIE', 'CENTER', 1], ['BEMASSUNG', 'CONTINUOUS', 3], ['RAHMEN', 'CONTINUOUS', 7]]) P(0, 'LAYER', 2, n, 70, 0, 62, col, 6, lt);
    P(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    const layer = { vis: 'SICHTBAR', hid: 'VERDECKT', ctr: 'MITTELLINIE', hatch: 'SCHRAFFUR', cutline: 'SCHNITTLINIE', cutend: 'SCHNITTLINIE', dim: 'BEMASSUNG', arrow: 'BEMASSUNG', detail: 'BEMASSUNG', 'detail-border': 'RAHMEN', frame: 'RAHMEN', thin: 'RAHMEN' };
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
    for (const t of lastTexts) { if (t.cls === 'note') continue; const tLy = String(t.cls || '').startsWith('dimtext') ? 'BEMASSUNG' : (t.cls === 'cutlabel' || t.cls === 'viewlabel') ? 'SCHNITTLINIE' : 'RAHMEN'; const dxfTxt = String(t.t).replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/[–—−]/g, '-'); P(0, 'TEXT', 8, tLy, 10, t.x.toFixed(4), 20, Y(t.y).toFixed(4), 30, 0, 40, t.size.toFixed(3), 1, dxfTxt, 50, (-(t.rot || 0)).toFixed(3), ...(t.anchor === 'middle' ? [72, 1, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0] : [])); }
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
    info.append(h('div', { class: 'btn-row' }, b, bAdd)); w.append(info);
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
      const selCtr = String(selDim).startsWith('ctr|') ? findCenterById(selDim) : null;
      const selDimInfo = !selDet && !isSec && !selCtr ? findDimById(selDim, d, layout) : null;
      const selSec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, selDet ? `Detail ${selDet.label}` : selCtr ? (selCtr.type === 'cross' ? 'Mittelkreuz' : 'Mittellinie') : selDimInfo ? `Maß ${selDimInfo.label}` : 'Auswahl'));
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
      const row = h('div', { class: 'btn-row' });
      if (isSec) {
        const fl = h('button', { type: 'button', class: 'btn', id: 'dw-sec-flip' }, 'Blickrichtung umkehren');
        fl.onclick = () => flipSection(selDim);
        row.append(fl);
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
    w.append(h('div', { class: 'hint-box', html: 'Die Ansichten stehen nach <b>Projektionsmethode 1</b>: Draufsicht unter der Vorderansicht, Seitenansicht von links rechts daneben. Mit <b>Schnittansicht (S)</b> ziehst du eine Schnittlinie A–A durch eine Ansicht, mit <b>Detailansicht (Z)</b> vergrößerst du einen Ausschnitt im eigenen Maßstab. Klick ein <b>Maß</b> an für Toleranzen (±, Abmaße, Grenzmaße) oder ISO-286-Passungen (H7, g6 …) – oder drück <b>Entf</b> zum Löschen bzw. Ausblenden.' }));
    body.append(w);
  }
  function tool_(t) { setTool(tool === t ? null : t); }
  App.on('doc', () => { if (App.mode === 'drawing') refreshSoonDoc(); });
  const refreshSoonDoc = debounce(async () => { await refresh(); Panels.renderRight(); }, 150);
  return {
    open, close, refresh, sheetMenu, exportMenu, drawMenu, autoDims, tool: tool_, onKey, renderPanel,
    SHEETS, sheets, activeSheet: dwg, addSheet, selectSheet, renameSheet, removeSheet, duplicateSheet,
    details, addDetail, updateDetail, removeDetail, nextDetailLabel, DETAIL_SCALES,
    select: (id) => { selDim = id; render(); Panels.renderRight(); },
    get selectedId() { return selDim; },
    addSection, flipSection, removeSection, sections: () => (dwg().sections || []).slice(), waitReady, hatchStepSheet,
    centers, allCenters, setCenters, hideCenter, showCenter, toggleCenter, showAllCenters,
    iso286, ISO286: ISO286_DATA,
    dims: () => autoDimList(dwg(), layout || computeLayout(dwg())).map((x) => ({ ...x, nominalMm: dimNominal(x) })),
    getDimTol, setDimTol,
    exportPDF, buildPDFBytes,
    get layout() { return layout; },
    get activeTool() { return tool; },
  };
})();

