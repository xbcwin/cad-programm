// ================= Technische Zeichnung =================
const Drawing = (() => {
  const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
  const SHEET_ORDER = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const SCALES = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  const DETAIL_SCALES = [1, 2, 2.5, 3, 4, 5, 10, 20];
  const DETAIL_LETTERS = 'ZYXWVUTSRQPONMLKJIHGFEDCBA'.split('');
  const PROJECTIONS = ['eu', 'us'];
  function normProjection(val, fallback = 'eu') {
    if (val === 'us' || val === 'iso-a' || val === 'third') return 'us';
    if (val === 'eu' || val === 'iso-e' || val === 'first') return 'eu';
    return fallback === 'us' ? 'us' : 'eu';
  }
  const VIEW_NAMES = { get front() { return T('draw.view.front'); }, get top() { return T('draw.view.top'); }, get left() { return T('draw.view.left'); } };
  const DIM_ARROWS = [
    { key: 'filled', get label() { return T('draw.arrow.filled'); } },
    { key: 'open', get label() { return T('draw.arrow.open'); } },
    { key: 'slash', get label() { return T('draw.arrow.slash'); } },
    { key: 'dot', get label() { return T('draw.arrow.dot'); } },
  ];
  const DIM_FONT_SIZES = [2.5, 3.5, 5, 7, 10];
  const DEFAULT_DIM_STYLE = { arrow: 'filled', fontSize: 3.5, decimals: null, dual: false, dualDecimals: 3 };
  const NOTE_TIPS = [
    { key: 'auto', get label() { return T('draw.noteTip.auto'); } },
    { key: 'arrow', get label() { return T('draw.noteTip.arrow'); } },
    { key: 'dot', get label() { return T('draw.noteTip.dot'); } },
  ];
  const ISO286_DATA = /*JSON:iso286.json*/null;
  const DIM_MODES = [
    { key: 'lin', get label() { return T('draw.dimMode.lin'); }, get short() { return T('draw.dimMode.lin'); }, get hint() { return T('draw.dimHint.lin'); } },
    { key: 'chain', get label() { return T('draw.dimMode.chain'); }, get short() { return T('draw.dimMode.chain'); }, get hint() { return T('draw.dimHint.chain'); } },
    { key: 'base', get label() { return T('draw.dimMode.base'); }, get short() { return T('draw.dimMode.base'); }, get hint() { return T('draw.dimHint.base'); } },
    { key: 'ordinate', pro: true, get label() { return T('draw.dimMode.ordinate'); }, get short() { return T('draw.dimMode.ordinate'); }, get hint() { return T('draw.dimHint.ordinate'); } },
    { key: 'ang', get label() { return T('draw.dimMode.ang'); }, get short() { return T('draw.dimMode.ang'); }, get hint() { return T('draw.dimHint.ang'); } },
    { key: 'rad', get label() { return T('draw.dimMode.rad'); }, get short() { return T('draw.dimMode.rad'); }, get hint() { return T('draw.dimHint.rad'); } },
    { key: 'dia', get label() { return T('draw.dimMode.dia'); }, get short() { return T('draw.dimMode.dia'); }, get hint() { return T('draw.dimHint.dia'); } },
    { key: 'arclen', pro: true, get label() { return T('draw.dimMode.arclen'); }, get short() { return T('draw.dimMode.arclen'); }, get hint() { return T('draw.dimHint.arclen'); } },
    { key: 'chamfer', get label() { return T('draw.dimMode.chamfer'); }, get short() { return T('draw.dimMode.chamfer'); }, get hint() { return T('draw.dimHint.chamfer'); } },
  ];
  const SECTION_MODES = [
    { key: 'full', get label() { return T('draw.secMode.full'); }, get hint() { return T('draw.hint.section'); } },
    { key: 'half', pro: true, get label() { return T('draw.secMode.half'); }, get hint() { return T('draw.hint.sectionHalf'); } },
    { key: 'stepped', pro: true, get label() { return T('draw.secMode.stepped'); }, get hint() { return T('draw.hint.sectionStepped'); } },
    { key: 'breakout', pro: true, get label() { return T('draw.secMode.breakout'); }, get hint() { return T('draw.hint.sectionBreakout'); } },
  ];
  const THREAD_ARC_START = Math.PI / 12;
  const THREAD_ARC_SPAN = Math.PI * 1.5;
  const HATCH_PATTERNS = {
    steel:     { key: 'steel',     get label() { return T('draw.hatch.steel'); },     angles: [45],       flipAngles: [135],      stepMul: 1.0,  pairOff: 0,    altDash: false },
    alu:       { key: 'alu',       get label() { return T('draw.hatch.alu'); },       angles: [45],       flipAngles: [135],      stepMul: 1.45, pairOff: 0.28, altDash: false },
    brass:     { key: 'brass',     get label() { return T('draw.hatch.brass'); },     angles: [45],       flipAngles: [135],      stepMul: 1.0,  pairOff: 0,    altDash: true  },
    plastic:   { key: 'plastic',   get label() { return T('draw.hatch.plastic'); },   angles: [45, 135],  flipAngles: [45, 135],  stepMul: 1.25, pairOff: 0,    altDash: false, oddPhase: 0.5 },
    composite: { key: 'composite', get label() { return T('draw.hatch.composite'); }, angles: [30, 150],  flipAngles: [30, 150],  stepMul: 1.2,  pairOff: 0,    altDash: false, oddPhase: 0.5 },
    wood:      { key: 'wood',      get label() { return T('draw.hatch.wood'); },      angles: [30],       flipAngles: [150],      stepMul: 1.1,  pairOff: 0,    altDash: true  },
  };
  const scaleText = (s) => (s >= 1 ? `${fmtFixed(s, 2)}:1` : `1:${fmtFixed(1 / s, 2)}`);
  const isSimpleMode = () => typeof ViewPrefs !== 'undefined' && ViewPrefs.level === 'simple';
  const normThreadsActive = (sh = dwg()) => !isSimpleMode() && (!sh || sh.normThreads !== false);
  const materialHatchActive = (sh = dwg()) => !isSimpleMode() && (!sh || sh.materialHatch !== false);
  let proj = null, projRev = -1, projSceneKey = null, loadingProjPromise = null, projId = 0;
  const projSigs = new Map(), shadeCache = new Map();
  let bomData = null, bomMeasure = null, bomCacheKey = null;
  let svg = null, wrap = null, holder = null, tabsBar = null, zoom = 1, tool = null, toolState = null, selDim = null, selView = null;
  let dimMode = 'lin';
  let sectionMode = 'full';
  let sectionDraft = { halfAxis: 'v', halfSide: 'right', depth: null };
  let layout = null, dragDetail = null, dragNote = null, dragView = null, dragBalloon = null, dragBom = null;
  let lastDXF = null, lastPNG = null;
  let detailDraft = { scale: 2, label: 'Z' };
  let noteDraft = { tip: 'auto', text: '' };
  let breakDraft = { dir: 'auto', gap: 6, style: 'zigzag' };
  let balloonViewPref = 'auto';
  let centersListOpen = false;
  let lastLostKey = '';
  function normalizeSection(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = raw.type === 'half' || raw.type === 'stepped' || raw.type === 'breakout' ? raw.type : 'full';
    const parent = raw.parent === 'front' || raw.parent === 'left' ? raw.parent : 'top';
    const normPt = (p) => (Array.isArray(p) && p.length >= 2 ? [Number(p[0]) || 0, Number(p[1]) || 0] : [0, 0]);
    const out = {
      id: raw.id || uid('sec'),
      label: String(raw.label || 'A'),
      parent,
      type,
      flip: !!raw.flip,
      pos: Array.isArray(raw.pos) && raw.pos.length >= 2 ? [Number(raw.pos[0]) || 0, Number(raw.pos[1]) || 0] : null,
    };
    if (type === 'stepped') {
      const pts = Array.isArray(raw.pts) ? raw.pts.map(normPt) : [normPt(raw.a), normPt(raw.b)];
      out.pts = pts;
      out.a = pts[0] ? [...pts[0]] : [0, 0];
      out.b = pts[pts.length - 1] ? [...pts[pts.length - 1]] : [10, 0];
    } else if (type === 'breakout') {
      out.region = Array.isArray(raw.region) ? raw.region.map(normPt) : [];
      out.depth = raw.depth != null && Number.isFinite(Number(raw.depth)) && Number(raw.depth) > 0 ? Number(raw.depth) : null;
    } else {
      out.a = normPt(raw.a);
      out.b = normPt(raw.b);
      if (type === 'half') {
        const ax = raw.halfAxis === 'h' ? 'h' : 'v';
        out.halfAxis = ax;
        out.halfSide = ax === 'h'
          ? (raw.halfSide === 'top' || raw.halfSide === 'bottom' ? raw.halfSide : 'bottom')
          : (raw.halfSide === 'left' || raw.halfSide === 'right' ? raw.halfSide : 'right');
        if (raw.split != null && Number.isFinite(Number(raw.split))) out.split = Number(raw.split);
      }
    }
    return out;
  }
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
    const dual = (raw && 'dual' in raw) ? !!raw.dual : !!t.dual;
    const rawDualDec = (raw && raw.dualDecimals != null) ? Number(raw.dualDecimals) : Number(t.dualDecimals);
    const dualDecimals = Number.isFinite(rawDualDec) ? clamp(Math.round(rawDualDec), 1, 4) : DEFAULT_DIM_STYLE.dualDecimals;
    return { arrow, fontSize, decimals, dual, dualDecimals };
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
    const kind = v.kind === 'free' ? 'free' : v.kind === 'explode' ? 'explode' : 'iso';
    const dir = norm3(v.dir, ISO_DIR);
    const x = orthoX3(v.x, dir);
    const defaultName = kind === 'free' ? 'Freie Ansicht' : kind === 'explode' ? (T('draw.view.explode') || 'Explosionsansicht') : 'Isometrie';
    const out = {
      id: v.id || uid('v'),
      kind,
      name: String(v.name || defaultName),
      dir,
      x,
    };
    if (kind === 'explode') {
      out.explodeAmount = Number.isFinite(Number(v.explodeAmount)) ? clamp(Number(v.explodeAmount), 0.1, 1.5) : 0.7;
      out.explodeMode = v.explodeMode === 'steps' ? 'steps' : 'auto';
      out.explodeTrails = v.explodeTrails !== false;
    }
    return out;
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
      projection: normProjection(opts.projection, tpl ? tpl.projection : 'eu'),
      scale: opts.scale != null ? opts.scale : 'auto',
      views: opts.views ? { ...opts.views } : { front: true, top: true, left: true, iso: false },
      viewOpts: opts.viewOpts && typeof opts.viewOpts === 'object' ? JSON.parse(JSON.stringify(opts.viewOpts)) : {},
      extraViews: Array.isArray(opts.extraViews) ? opts.extraViews.map(normalizeExtraView).filter(Boolean) : [],
      hidden: opts.hidden != null ? !!opts.hidden : (tpl ? !!tpl.hidden : true),
      centers: opts.centers != null ? !!opts.centers : (tpl ? !!tpl.centers : true),
      normThreads: opts.normThreads != null ? !!opts.normThreads : (tpl && tpl.normThreads != null ? !!tpl.normThreads : true),
      materialHatch: opts.materialHatch != null ? !!opts.materialHatch : (tpl && tpl.materialHatch != null ? !!tpl.materialHatch : true),
      hiddenCenters: Array.isArray(opts.hiddenCenters) ? opts.hiddenCenters.slice() : [],
      dims: opts.dims || defaultAutoDims(),
      free: opts.free || [],
      details: opts.details ? opts.details.map((x) => ({ ...x, c: x.c ? [...x.c] : [0, 0], pos: x.pos ? [...x.pos] : null })) : [],
      sections: Array.isArray(opts.sections) ? opts.sections.map(normalizeSection).filter(Boolean) : [],
      auxViews: Array.isArray(opts.auxViews) ? opts.auxViews.map((a) => ({ ...a, a: a.a ? [...a.a] : [0, 0], b: a.b ? [...a.b] : [10, 0], flip: !!a.flip, pos: Array.isArray(a.pos) ? [Number(a.pos[0]) || 0, Number(a.pos[1]) || 0] : null })) : [],
      breaks: Array.isArray(opts.breaks) ? opts.breaks.map((b) => {
        const a0 = Number(b.a) || 0, b0 = Number(b.b) || 0;
        return {
          id: b.id || uid('brk'),
          view: b.view || 'front',
          dir: b.dir === 'v' ? 'v' : 'h',
          a: Math.min(a0, b0),
          b: Math.max(a0, b0),
          gap: clamp(Number(b.gap) || 6, 0.5, 50),
          style: b.style === 'wave' ? 'wave' : 'zigzag',
        };
      }) : [],
      dimStyle: normDimStyle(opts.dimStyle, tpl),
      notes: Array.isArray(opts.notes) ? opts.notes.map((n) => ({ ...n, anchor: n.anchor ? [...n.anchor] : [0, 0], elbow: n.elbow ? [...n.elbow] : [14, -10] })) : [],
      balloons: Array.isArray(opts.balloons) ? opts.balloons.map((b) => ({ ...b, anchor: b.anchor ? [...b.anchor] : [0, 0], offset: b.offset ? [...b.offset] : [14, -12] })) : [],
      bomTable: {
        show: !!(opts.bomTable && opts.bomTable.show),
        pos: Array.isArray(opts.bomTable && opts.bomTable.pos) && opts.bomTable.pos.length >= 2
          ? [Number(opts.bomTable.pos[0]) || 0, Number(opts.bomTable.pos[1]) || 0]
          : null,
      },
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
      projection: raw && raw.projection,
      scale: raw && raw.scale != null ? raw.scale : 'auto',
      views: raw && raw.views,
      viewOpts: raw && raw.viewOpts,
      extraViews: raw && raw.extraViews,
      hidden: raw && raw.hidden,
      centers: raw && raw.centers,
      normThreads: raw && raw.normThreads,
      materialHatch: raw && raw.materialHatch,
      hiddenCenters: raw && Array.isArray(raw.hiddenCenters) ? raw.hiddenCenters : [],
      dims: raw && Array.isArray(raw.dims) ? raw.dims : undefined,
      free: raw && Array.isArray(raw.free) ? raw.free : undefined,
      details: raw && Array.isArray(raw.details) ? raw.details : [],
      sections: raw && Array.isArray(raw.sections) ? raw.sections : undefined,
      auxViews: raw && Array.isArray(raw.auxViews) ? raw.auxViews : undefined,
      breaks: raw && Array.isArray(raw.breaks) ? raw.breaks : undefined,
      dimStyle: raw && raw.dimStyle && typeof raw.dimStyle === 'object' ? raw.dimStyle : undefined,
      notes: raw && Array.isArray(raw.notes) ? raw.notes : undefined,
      balloons: raw && Array.isArray(raw.balloons) ? raw.balloons : undefined,
      bomTable: raw && raw.bomTable && typeof raw.bomTable === 'object' ? raw.bomTable : undefined,
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
      else if (cur) cur.sections = cur.sections.map(normalizeSection).filter(Boolean);
      if (cur && !Array.isArray(cur.auxViews)) cur.auxViews = [];
      if (cur && !Array.isArray(cur.breaks)) cur.breaks = [];
      if (cur && !Array.isArray(cur.hiddenCenters)) cur.hiddenCenters = [];
      if (cur && typeof cur.normThreads !== 'boolean') cur.normThreads = cur.normThreads == null ? true : !!cur.normThreads;
      if (cur && typeof cur.materialHatch !== 'boolean') cur.materialHatch = cur.materialHatch == null ? true : !!cur.materialHatch;
      if (cur && !Array.isArray(cur.notes)) cur.notes = [];
      if (cur && !Array.isArray(cur.balloons)) cur.balloons = [];
      if (cur && (!cur.bomTable || typeof cur.bomTable !== 'object')) cur.bomTable = { show: false, pos: null };
      else if (cur) cur.bomTable = {
        show: !!cur.bomTable.show,
        pos: Array.isArray(cur.bomTable.pos) && cur.bomTable.pos.length >= 2
          ? [Number(cur.bomTable.pos[0]) || 0, Number(cur.bomTable.pos[1]) || 0]
          : null,
      };
      if (cur && (!cur.viewPos || typeof cur.viewPos !== 'object')) cur.viewPos = {};
      if (cur) {
        cur.dimStyle = normDimStyle(cur.dimStyle);
        cur.projection = normProjection(cur.projection);
      }
      if (!cur || !cur.id || !SHEETS[cur.sheet] || !cur.views || !Array.isArray(cur.dims) || !Array.isArray(cur.free) || !cur.title || !cur.name) {
        d.drawing.sheets[i] = normalizeSheet(cur, `Blatt ${i + 1}`);
      } else {
        if (!cur.viewOpts || typeof cur.viewOpts !== 'object') cur.viewOpts = {};
        if (!Array.isArray(cur.extraViews)) cur.extraViews = [];
        else cur.extraViews = cur.extraViews.map(normalizeExtraView).filter(Boolean);
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
    dragNote = null; dragView = null; dragBalloon = null; dragBom = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section' || tool === 'note' || tool === 'balloon' || tool === 'break' || tool === 'aux') ? { stage: 0 } : tool ? {} : null;
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
    dragNote = null; dragView = null; dragBalloon = null; dragBom = null;
    toolState = (tool === 'dim' || tool === 'detail' || tool === 'section' || tool === 'note' || tool === 'balloon' || tool === 'break' || tool === 'aux') ? { stage: 0 } : tool ? {} : null;
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
    const auxMap = new Map();
    clone.auxViews = (clone.auxViews || []).map((a) => {
      const nid = uid('aux');
      auxMap.set(a.id, nid);
      return { ...a, id: nid, a: a.a ? [...a.a] : [0, 0], b: a.b ? [...a.b] : [10, 0], pos: Array.isArray(a.pos) ? [...a.pos] : null };
    });
    for (const a of clone.auxViews) {
      if (a.parent && a.parent.startsWith('aux_') && auxMap.has(a.parent.slice(4))) a.parent = 'aux_' + auxMap.get(a.parent.slice(4));
      else if (a.parent && a.parent.startsWith('sec_') && secMap.has(a.parent.slice(4))) a.parent = 'sec_' + secMap.get(a.parent.slice(4));
    }
    const idMap = new Map();
    if (Array.isArray(clone.extraViews) && clone.extraViews.length) {
      clone.extraViews = clone.extraViews.map((v) => { const nid = uid('v'); idMap.set(v.id, nid); return { ...v, id: nid }; });
    }
    if (clone.viewOpts && typeof clone.viewOpts === 'object') {
      const nextOpts = {};
      for (const [k, val] of Object.entries(clone.viewOpts)) {
        const nk = (k.startsWith('aux_') && auxMap.has(k.slice(4))) ? 'aux_' + auxMap.get(k.slice(4)) : (idMap.get(k) || k);
        nextOpts[nk] = val;
      }
      clone.viewOpts = nextOpts;
    }
    const remapView = (v) => {
      if (!v) return v;
      if (detMap.has(v)) return detMap.get(v);
      if (v.startsWith('sec_') && secMap.has(v.slice(4))) return 'sec_' + secMap.get(v.slice(4));
      if (v.startsWith('aux_') && auxMap.has(v.slice(4))) return 'aux_' + auxMap.get(v.slice(4));
      return idMap.get(v) || v;
    };
    clone.breaks = (clone.breaks || []).map((b) => ({ ...b, id: uid('brk'), view: remapView(b.view) }));
    clone.dims = (clone.dims || []).map((x) => {
      const oldId = x.id, nid = uid('d');
      const view = remapView(x.view);
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
      parts[1] = remapView(parts[1]);
      return parts.join('|');
    });
    clone.free = (clone.free || []).map((x) => ({ ...x, id: uid('f') }));
    clone.dimStyle = normDimStyle(src.dimStyle);
    clone.notes = (clone.notes || []).map((n) => ({ ...n, id: uid('ln'), view: remapView(n.view), anchor: n.anchor ? [...n.anchor] : [0, 0], elbow: n.elbow ? [...n.elbow] : [14, -10] }));
    clone.balloons = (clone.balloons || []).map((b) => ({ ...b, id: uid('bl'), view: remapView(b.view), anchor: b.anchor ? [...b.anchor] : [0, 0], offset: b.offset ? [...b.offset] : [14, -12] }));
    clone.bomTable = {
      show: !!(src.bomTable && src.bomTable.show),
      pos: Array.isArray(src.bomTable && src.bomTable.pos) ? [...src.bomTable.pos] : null,
    };
    clone.normThreads = src.normThreads !== false;
    clone.materialHatch = src.materialHatch !== false;
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
    if (val === undefined) val = await UI.prompt(T('draw.sheetRenameTitle'), T('draw.sheetNameLabel'), target.name, T('common.rename'));
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
    if (list.length <= 1) { UI.toast(T('draw.sheetMinToast'), { icon: 'info' }); return false; }
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
    UI.toast(T('draw.sheetRemovedToast', { name: removedName }), { icon: 'info' });
    return true;
  }
  // ---------- Öffnen ----------
  function open() {
    const el = $('#sheet'); el.innerHTML = '';
    wrap = h('div', { class: 'sheet-wrap' });
    holder = h('div', { class: 'sheet-holder' });
    wrap.append(holder); el.append(wrap);
    const zb = h('div', { class: 'zoom-btns' });
    const b1 = h('button', { type: 'button', 'aria-label': T('draw.zoomOut'), 'data-tip': T('draw.zoomOut') }); b1.innerHTML = icon('zoomOut'); b1.onclick = () => setZoom(zoom / 1.25);
    const b2 = h('button', { type: 'button', 'aria-label': T('draw.zoomFit'), 'data-tip': T('draw.zoomFitTip') }); b2.innerHTML = icon('fit'); b2.onclick = () => fitZoom();
    const b3 = h('button', { type: 'button', 'aria-label': T('draw.zoomIn'), 'data-tip': T('draw.zoomIn') }); b3.innerHTML = icon('zoomIn'); b3.onclick = () => setZoom(zoom * 1.25);
    zb.append(b1, b2, b3); el.append(zb);
    tabsBar = h('div', { class: 'sheet-tabs', id: 'sheet-tabs', role: 'tablist', 'aria-label': T('draw.sheetsAria'), 'data-help': 'drawingSheets' });
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
  function close() { window.removeEventListener('pointerup', onUp); tool = null; toolState = null; selView = null; dragDetail = null; dragNote = null; dragView = null; dragBalloon = null; dragBom = null; const el = $('#sheet'); if (el) el.innerHTML = ''; svg = null; wrap = null; holder = null; tabsBar = null; }
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
        if (nLost > 0) tab.append(h('span', { class: 'st-lost', title: T(nLost === 1 ? 'draw.tabs.lostOne' : 'draw.tabs.lostMany', { n: nLost }) }, String(nLost)));
      }
      const ren = h('button', { type: 'button', class: 'st-act st-ren', 'aria-label': T('draw.tabs.renameAria'), 'data-tip': T('draw.tabs.renameAria') });
      ren.innerHTML = icon('edit');
      ren.onclick = (e) => { e.stopPropagation(); renameSheet(s.id); };
      tab.append(ren);
      if (list.length > 1) {
        const del = h('button', { type: 'button', class: 'st-act st-del', 'aria-label': T('draw.tabs.deleteAria'), 'data-tip': T('draw.tabs.deleteAria') });
        del.innerHTML = icon('close');
        del.onclick = (e) => { e.stopPropagation(); removeSheet(s.id); };
        tab.append(del);
      }
      tab.onclick = () => selectSheet(s.id);
      tab.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSheet(s.id); } };
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        UI.menu(tab, [
          { label: T('draw.tabs.renameMenu'), icon: 'edit', run: () => renameSheet(s.id) },
          { label: T('draw.tabs.dupMenu'), icon: 'copy', run: () => duplicateSheet(s.id) },
          '-',
          { label: T('draw.tabs.deleteAria'), icon: 'trash', disabled: list.length <= 1, run: () => removeSheet(s.id) },
        ]);
      });
      tabsBar.append(tab);
    }
    const addBtn = h('button', {
      type: 'button',
      class: 'sheet-tab-add',
      id: 'dw-add-sheet',
      'data-help': 'drawingSheets',
      'aria-label': T('draw.tabs.addAria'),
      'data-tip': T('draw.tabs.addTip'),
    });
    addBtn.innerHTML = icon('plus') + `<span>${esc(T('draw.tabs.addLabel'))}</span>`;
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
  function sectionTitle(sec) {
    if (!sec) return T('draw.view.section');
    const a = sec.label, b = sec.label;
    if (sec.type === 'half') return T('draw.view.halfSectionNamed', { a, b });
    if (sec.type === 'stepped') return T('draw.view.steppedSectionNamed', { a, b });
    if (sec.type === 'breakout') return T('draw.view.breakoutSectionNamed', { a, b });
    return T('draw.view.sectionNamed', { a, b });
  }
  function viewLabel(vName, sh = dwg()) {
    if (VIEW_NAMES[vName]) return VIEW_NAMES[vName];
    if (vName === 'iso') return T('draw.view.iso');
    if (String(vName).startsWith('sec_')) {
      const sec = (sh.sections || []).find((x) => 'sec_' + x.id === vName);
      return sectionTitle(sec);
    }
    if (String(vName).startsWith('aux_')) {
      const aux = (sh.auxViews || []).find((x) => 'aux_' + x.id === vName);
      return aux ? T('draw.view.auxNamed', { lbl: aux.label }) : T('draw.view.aux');
    }
    const det = (sh.details || []).find((x) => x.id === vName);
    if (det) return T('draw.view.detailNamed', { lbl: det.label });
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
      out.push({
        id: ev.id, kind: ev.kind, name: ev.name, is3d: true, custom: true, removable: true, dir: ev.dir, x: ev.x,
        ...(ev.kind === 'explode' ? { explodeAmount: ev.explodeAmount, explodeMode: ev.explodeMode, explodeTrails: ev.explodeTrails } : {}),
      });
    }
    for (const av of sh.auxViews || []) {
      out.push({ id: 'aux_' + av.id, kind: 'aux', name: viewLabel('aux_' + av.id, sh), is3d: false, custom: false, removable: true, aux: av });
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
  function setProjection(mode) {
    const next = normProjection(mode);
    App.change('Projektion geändert', () => {
      dwg().projection = next;
    });
    render();
    Panels.renderRight();
    return next;
  }
  function itemWorldBox(it, doc = App.doc) {
    if (!it) return null;
    if (typeof Viewer !== 'undefined' && Viewer.baseBox) {
      const vb = Viewer.baseBox(it.id);
      if (vb && !vb.isEmpty()) return [vb.min.x, vb.min.y, vb.min.z, vb.max.x, vb.max.y, vb.max.z];
    }
    const r = typeof App !== 'undefined' && App.results && typeof App.results.get === 'function' ? App.results.get(it.id) : null;
    const b = r && r.data && Array.isArray(r.data.bbox) && r.data.bbox.length >= 6 ? r.data.bbox : null;
    if (b && typeof Model !== 'undefined' && Model.localMatrix) {
      const box = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])).applyMatrix4(Model.localMatrix(it));
      if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    }
    return null;
  }
  function approxChildWorldBox(parent, child, idx) {
    const pb = typeof Model !== 'undefined' && Model.primitiveBox ? Model.primitiveBox(child.kind, child.p || {}) : null;
    if (pb && pb.length >= 6 && typeof Model !== 'undefined' && Model.localMatrix) {
      const M = Model.localMatrix(parent, new THREE.Matrix4()).multiply(Model.localMatrix(child, new THREE.Matrix4()));
      const b3 = new THREE.Box3(new THREE.Vector3(pb[0], pb[1], pb[2]), new THREE.Vector3(pb[3], pb[4], pb[5])).applyMatrix4(M);
      if (!b3.isEmpty()) return [b3.min.x, b3.min.y, b3.min.z, b3.max.x, b3.max.y, b3.max.z];
    }
    const z0 = idx * 12;
    return [-5, -5, z0, 5, 5, z0 + 10];
  }
  function computeExplodeData(ev, doc = App.doc) {
    const active = Model.activeItems(doc);
    const candidates = active.filter((it) => it && !it.hidden && it.role !== 'hole' && !(typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)));
    const boxes = [];
    let splitGroupId = null;
    let splitChildren = [];
    if (candidates.length === 1 && candidates[0].kind === 'group' && !(candidates[0].p && candidates[0].p.op)) {
      const g = candidates[0];
      const kids = (g.children || []).filter((c) => c && !c.suppressed && !c.hidden);
      const solids = kids.filter((c) => c.role !== 'hole');
      if (solids.length >= 2) {
        splitGroupId = g.id;
        const holes = kids.filter((c) => c.role === 'hole');
        splitChildren = solids.map((c, idx) => {
          const exId = '__ex:' + c.id;
          const bb = (typeof Viewer !== 'undefined' && Viewer.baseBox && Viewer.baseBox(exId))
            ? (() => { const vb = Viewer.baseBox(exId); return [vb.min.x, vb.min.y, vb.min.z, vb.max.x, vb.max.y, vb.max.z]; })()
            : approxChildWorldBox(g, c, idx);
          boxes.push([exId, bb]);
          return { id: exId, child: c, holes, parent: g };
        });
      }
    }
    if (!splitGroupId) {
      for (const it of candidates) {
        const bb = itemWorldBox(it, doc);
        if (bb) boxes.push([it.id, bb]);
      }
    }
    const offsets = new Map();
    const trails3d = [];
    const partBoxes = new Map();
    const centerOf = (b) => [(b[0] + b[3]) * 0.5, (b[1] + b[4]) * 0.5, (b[2] + b[5]) * 0.5];
    const hasSteps = typeof Assembly !== 'undefined' && Assembly.explodeSteps(doc).length > 0;
    const mode = ev && ev.explodeMode === 'steps' && hasSteps ? 'steps' : 'auto';
    if (mode === 'steps') {
      const f = clamp(Number(ev.explodeAmount ?? 1), 0, 1);
      const evalRes = Assembly.evalExplodeSteps(f, doc);
      const boxMap = new Map(boxes);
      for (const [pid, arr] of evalRes.offsets.entries()) {
        const off = [Number(arr[0]) || 0, Number(arr[1]) || 0, Number(arr[2]) || 0];
        offsets.set(pid, off);
        if (splitGroupId) {
          for (const sc of splitChildren) offsets.set(sc.id, off);
        }
      }
      if (evalRes.paths) {
        for (const [pid, pts] of evalRes.paths.entries()) {
          const bb = boxMap.get(pid);
          if (!bb || !pts || pts.length < 2) continue;
          const c0 = centerOf(bb);
          trails3d.push({
            partId: pid,
            pts: pts.map(([dx, dy, dz]) => [c0[0] + dx, c0[1] + dy, c0[2] + dz]),
          });
        }
      }
    } else if (boxes.length >= 2) {
      const f = clamp(Number(ev && ev.explodeAmount != null ? ev.explodeAmount : 0.7), 0.1, 1.5);
      let b0 = Infinity, b1 = Infinity, b2 = Infinity, b3 = -Infinity, b4 = -Infinity, b5 = -Infinity;
      for (const [, b] of boxes) {
        b0 = Math.min(b0, b[0]); b1 = Math.min(b1, b[1]); b2 = Math.min(b2, b[2]);
        b3 = Math.max(b3, b[3]); b4 = Math.max(b4, b[4]); b5 = Math.max(b5, b[5]);
      }
      const C = [(b0 + b3) * 0.5, (b1 + b4) * 0.5, (b2 + b5) * 0.5];
      const S = Math.max(10, Math.hypot(b3 - b0, b4 - b1, b5 - b2));
      const sorted = boxes.slice().sort((a, b) => a[1][2] - b[1][2]);
      const layerOf = new Map();
      const layers = [];
      for (const [id, b] of sorted) {
        let L = layers[layers.length - 1];
        if (!L || b[2] - L.z > 0.5) { L = { z: b[2], h: 0 }; layers.push(L); }
        L.h = Math.max(L.h, b[5] - b[2]);
        layerOf.set(id, layers.length - 1);
      }
      const lift = [0];
      for (let i = 1; i < layers.length; i++) lift[i] = lift[i - 1] + layers[i - 1].h + S * 0.08;
      let maxOff = 0;
      for (const [id, b] of boxes) {
        const c = centerOf(b);
        const off = [(c[0] - C[0]) * f * 1.2, (c[1] - C[1]) * f * 1.2, lift[layerOf.get(id)] * f];
        offsets.set(id, off);
        maxOff = Math.max(maxOff, Math.hypot(off[0], off[1], off[2]));
      }
      if (maxOff < 0.1) {
        boxes.forEach(([id], idx) => {
          offsets.set(id, [0, 0, idx * (S * 0.35) * f]);
        });
      }
      for (const [id, b] of boxes) {
        const off = offsets.get(id);
        if (!off || Math.hypot(off[0], off[1], off[2]) <= 0.1) continue;
        const c = centerOf(b);
        trails3d.push({ partId: id, pts: [c, [c[0] + off[0], c[1] + off[1], c[2] + off[2]]] });
      }
    }
    for (const [id, b] of boxes) {
      const off = offsets.get(id) || [0, 0, 0];
      partBoxes.set(id, [b[0] + off[0], b[1] + off[1], b[2] + off[2], b[3] + off[0], b[4] + off[1], b[5] + off[2]]);
    }
    return { offsets, trails3d, partBoxes, partCount: boxes.length, splitGroupId, splitChildren };
  }
  function buildExplodedScene(baseScene, exData, doc = App.doc) {
    const scene = JSON.parse(JSON.stringify(baseScene));
    if (!exData) return scene;
    const shiftMatrix = (m, off) => {
      if (!off || !Array.isArray(m) || m.length < 16) return;
      m[12] += off[0];
      m[13] += off[1];
      m[14] += off[2];
    };
    if (exData.splitGroupId) {
      const idx = scene.items.findIndex((it) => it && it.id === exData.splitGroupId);
      if (idx >= 0) {
        const orig = scene.items[idx];
        const splitItems = [];
        for (const sc of exData.splitChildren || []) {
          const itemObj = {
            id: sc.id,
            kind: 'group',
            name: Model.label(sc.child),
            role: 'solid',
            color: sc.child.color || orig.color,
            mat: sc.child.mat || orig.mat,
            t: deepClone(sc.parent.t || Model.T0()),
            p: {},
            finishes: [],
            children: [deepClone(sc.child), ...sc.holes.map(deepClone)],
          };
          const kItem = Model.kernelItem(itemObj, Model.vars(doc).v);
          shiftMatrix(kItem.m, exData.offsets.get(sc.id));
          splitItems.push(kItem);
        }
        scene.items.splice(idx, 1, ...splitItems);
      }
      return scene;
    }
    const boxesHit = (a, b) => a && b && a[0] <= b[3] && a[3] >= b[0] && a[1] <= b[4] && a[4] >= b[1] && a[2] <= b[5] && a[5] >= b[2];
    const solidBoxes = [];
    for (const [id] of exData.offsets.entries()) {
      const it = Model.find(doc, id);
      const bb = it ? itemWorldBox(it, doc) : null;
      if (bb) solidBoxes.push([id, bb]);
    }
    for (const it of scene.items || []) {
      if (!it) continue;
      let off = exData.offsets.get(it.id);
      if (!off && typeof App !== 'undefined' && App.mergedInto) {
        const hostId = App.mergedInto(it.id);
        if (hostId) off = exData.offsets.get(hostId);
      }
      if (!off && it.role === 'hole') {
        const docIt = Model.find(doc, it.id);
        const hb = docIt ? itemWorldBox(docIt, doc) : null;
        const host = hb ? solidBoxes.find(([, b]) => boxesHit(hb, b)) : null;
        if (host) off = exData.offsets.get(host[0]);
      }
      if (off) shiftMatrix(it.m, off);
    }
    return scene;
  }
  function explodeSig(ev, doc = App.doc) {
    const stepsSig = ev.explodeMode === 'steps' && typeof Assembly !== 'undefined' ? JSON.stringify(Assembly.explodeSteps(doc)) : '';
    return dirSig(ev) + '|ex|' + (ev.explodeMode || 'auto') + '|' + round(Number(ev.explodeAmount ?? 0.7), 3) + '|' + stepsSig;
  }
  async function addView(kind = 'iso', opts = {}) {
    const k = kind === 'free' ? 'free' : kind === 'explode' ? 'explode' : 'iso';
    let dir, x;
    if (k === 'free' || (k === 'explode' && opts.fromCamera)) {
      if (opts.dir) { dir = norm3(opts.dir, ISO_DIR); x = orthoX3(opts.x, dir); }
      else if (typeof Viewer !== 'undefined' && Viewer.cameraBasis) { const cb = Viewer.cameraBasis(); dir = norm3(cb.dir, ISO_DIR); x = orthoX3(cb.x, dir); }
      else { dir = ISO_DIR; x = ISO_X; }
    } else {
      dir = norm3(opts.dir, ISO_DIR); x = orthoX3(opts.x, dir);
    }
    const base = k === 'free' ? 'Freie Ansicht' : k === 'explode' ? T('draw.view.explode') : 'Isometrie';
    const used = new Set(activeViews(dwg()).map((v) => v.name));
    let name = opts.name || base;
    if (!opts.name && used.has(name)) {
      let n = 2;
      while (used.has(base + ' ' + n)) n++;
      name = base + ' ' + n;
    }
    const nv = { id: uid('v'), kind: k, name, dir, x };
    if (k === 'explode') {
      const hasSteps = typeof Assembly !== 'undefined' && Assembly.explodeSteps().length > 0;
      nv.explodeMode = (opts.explodeMode === 'steps' || opts.explodeMode === 'auto') ? opts.explodeMode : (hasSteps ? 'steps' : 'auto');
      nv.explodeAmount = opts.explodeAmount != null ? clamp(Number(opts.explodeAmount), 0.1, 1.5) : (nv.explodeMode === 'steps' ? 1 : 0.7);
      nv.explodeTrails = opts.explodeTrails !== false;
    }
    const vOpts = {
      scale: typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : 'sheet',
      hidden: opts.hidden != null ? !!opts.hidden : false,
      tangent: opts.tangent != null ? !!opts.tangent : true,
      shaded: !!opts.shaded,
    };
    const undoLbl = k === 'free' ? 'Freie Ansicht hinzugefügt' : k === 'explode' ? 'Explosionsansicht hinzugefügt' : 'Isometrische Ansicht hinzugefügt';
    App.change(undoLbl, () => {
      const s = dwg();
      s.extraViews = s.extraViews || [];
      s.extraViews.push(nv);
      s.viewOpts = s.viewOpts || {};
      s.viewOpts[nv.id] = vOpts;
    });
    if (k === 'explode' && computeExplodeData(nv, App.doc).partCount < 2) {
      UI.toast(T('draw.explodeNeedTwo'), { icon: 'info', ms: 3800 });
    }
    selView = nv.id; selDim = null;
    await refresh(); Panels.renderRight();
    return nv;
  }
  async function updateExplodeView(key, patch = {}) {
    let changed = false;
    App.change('Explosionsansicht geändert', () => {
      const s = dwg();
      const ev = (s.extraViews || []).find((v) => v.id === key && v.kind === 'explode');
      if (!ev) return;
      if (patch.explodeAmount != null && Number.isFinite(Number(patch.explodeAmount))) {
        ev.explodeAmount = clamp(Number(patch.explodeAmount), 0.1, 1.5);
        changed = true;
      }
      if (patch.explodeMode === 'auto' || patch.explodeMode === 'steps') {
        ev.explodeMode = patch.explodeMode;
        changed = true;
      }
      if (patch.explodeTrails !== undefined) {
        ev.explodeTrails = !!patch.explodeTrails;
        changed = true;
      }
      if (patch.dir) {
        ev.dir = norm3(patch.dir, ISO_DIR);
        ev.x = orthoX3(patch.x || ev.x, ev.dir);
        changed = true;
      }
    });
    if (!changed) return false;
    for (const ck of [...shadeCache.keys()]) if (ck.startsWith(key + '|')) shadeCache.delete(ck);
    await refresh();
    Panels.renderRight();
    return true;
  }
  function explodeViewInfo(key) {
    const sh = dwg();
    const ev = (sh.extraViews || []).find((v) => v.id === key && v.kind === 'explode');
    if (!ev) return null;
    const meta = (proj && proj.explodeMeta && proj.explodeMeta[key]) || computeExplodeData(ev, App.doc);
    return {
      id: ev.id,
      amount: ev.explodeAmount,
      mode: ev.explodeMode,
      trails: ev.explodeTrails !== false,
      offsets: Object.fromEntries(meta.offsets || []),
      trailCount: (meta.trails3d || []).length,
      partCount: meta.partCount || 0,
    };
  }
  function removeView(key) {
    if (String(key).startsWith('aux_')) return removeAuxView(String(key).slice(4));
    App.change('Ansicht entfernt', () => {
      const s = dwg();
      if (key === 'iso') s.views.iso = false;
      else s.extraViews = (s.extraViews || []).filter((v) => v.id !== key);
      if (s.viewOpts) delete s.viewOpts[key];
      if (s.viewPos) delete s.viewPos[key];
      s.notes = (s.notes || []).filter((n) => n.view !== key);
      s.balloons = (s.balloons || []).filter((b) => b.view !== key);
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
        if (ev.kind === 'explode') continue;
        addSpec(ev.id, { key: ev.id, dir: ev.dir, x: ev.x }, dirSig(ev));
      }
      for (const aux of s.auxViews || []) {
        const sp = auxViewSpec(aux);
        addSpec('aux_' + aux.id, { key: 'aux_' + aux.id, dir: sp.dir, x: sp.x }, dirSig(sp));
      }
      for (const sec of s.sections || []) {
        if (sec.type === 'half') {
          const sp = sectionPlaneSpec(sec);
          const vk = secUncutViewKey(sp);
          addSpec(vk, { key: vk, dir: sp.dir, x: sp.x }, dirSig(sp));
        }
      }
    }
    return specs;
  }
  function collectNeededExplodeViews() {
    const specs = [];
    const seen = new Set();
    for (const s of sheets()) {
      for (const ev of s.extraViews || []) {
        if (ev.kind !== 'explode' || seen.has(ev.id)) continue;
        seen.add(ev.id);
        specs.push({ key: ev.id, ev, sig: explodeSig(ev) });
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
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vNorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function auxViewSpec(aux) {
    const pKey = aux && aux.parent ? aux.parent : 'front';
    const vf = (proj && proj.views && proj.views[pKey]) || VIEW_FRAMES[pKey] || VIEW_FRAMES.front;
    const ex = vf.x, ey = vf.y;
    const a = (aux && aux.a) || [0, 0], b = (aux && aux.b) || [10, 0];
    const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv) || 1;
    const t2 = [du / L, dv / L];
    const cam2 = aux && aux.flip ? [t2[1], -t2[0]] : [-t2[1], t2[0]];
    const look2 = [-cam2[0], -cam2[1]];
    const dir = vNorm([ex[0] * cam2[0] + ey[0] * cam2[1], ex[1] * cam2[0] + ey[1] * cam2[1], ex[2] * cam2[0] + ey[2] * cam2[1]]);
    const tPos = (t2[0] > 1e-6 || (Math.abs(t2[0]) <= 1e-6 && t2[1] >= 0)) ? t2 : [-t2[0], -t2[1]];
    const x = vNorm([ex[0] * tPos[0] + ey[0] * tPos[1], ex[1] * tPos[0] + ey[1] * tPos[1], ex[2] * tPos[0] + ey[2] * tPos[1]]);
    const y = vNorm(vCross(dir, x));
    return { dir, x, y, cam2, look2, t2, angleDeg: (Math.atan2(Math.abs(dv), Math.abs(du)) * 180) / Math.PI };
  }
  function modelDepthRange(dir) {
    let bb = proj && Array.isArray(proj.bbox) && proj.bbox.length >= 6 ? proj.bbox : null;
    if (!bb && typeof App !== 'undefined' && App.results) {
      let b0 = Infinity, b1 = Infinity, b2 = Infinity, b3 = -Infinity, b4 = -Infinity, b5 = -Infinity;
      for (const r of Object.values(App.results)) {
        if (!r || !Array.isArray(r.bbox) || r.bbox.length < 6) continue;
        b0 = Math.min(b0, r.bbox[0]); b1 = Math.min(b1, r.bbox[1]); b2 = Math.min(b2, r.bbox[2]);
        b3 = Math.max(b3, r.bbox[3]); b4 = Math.max(b4, r.bbox[4]); b5 = Math.max(b5, r.bbox[5]);
      }
      if (isFinite(b0)) bb = [b0, b1, b2, b3, b4, b5];
    }
    if (!bb) bb = [-10, -10, -10, 10, 10, 10];
    let wMin = Infinity, wMax = -Infinity;
    for (const x of [bb[0], bb[3]]) for (const y of [bb[1], bb[4]]) for (const z of [bb[2], bb[5]]) {
      const w = x * dir[0] + y * dir[1] + z * dir[2];
      if (w < wMin) wMin = w;
      if (w > wMax) wMax = w;
    }
    return [wMin, wMax];
  }
  function breakoutPlaneSpec(sec) {
    const vf = (proj && proj.views && proj.views[sec.parent]) || VIEW_FRAMES[sec.parent] || VIEW_FRAMES.top;
    const [wMin, wMax] = modelDepthRange(vf.dir);
    const thick = Math.max(0.1, wMax - wMin);
    const dVal = (sec.depth != null && Number.isFinite(Number(sec.depth)) && Number(sec.depth) > 0)
      ? clamp(Number(sec.depth), 0.05, thick - 0.05)
      : thick * 0.5;
    const wCut = wMax - dVal;
    const o = [vf.dir[0] * wCut, vf.dir[1] * wCut, vf.dir[2] * wCut];
    return { o, dir: vf.dir, x: vf.x, y: vf.y, wMin, wMax, depth: dVal, thick };
  }
  function sectionPlaneSpec(sec) {
    if (sec && sec.type === 'breakout') return breakoutPlaneSpec(sec);
    const vf = (proj && proj.views && proj.views[sec.parent]) || VIEW_FRAMES[sec.parent] || VIEW_FRAMES.top;
    const ex = vf.x, ey = vf.y;
    const pts = (sec && sec.type === 'stepped' && Array.isArray(sec.pts) && sec.pts.length >= 2) ? sec.pts : null;
    const a = pts ? pts[0] : (sec.a || [0, 0]);
    const b = pts ? pts[1] : (sec.b || [10, 0]);
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
  const secUncutViewKey = (sp) => '__secv_' + dirSig(sp);
  function steppedSegments(sec) {
    const pts = (sec && Array.isArray(sec.pts) && sec.pts.length >= 4) ? sec.pts : null;
    if (!pts) return null;
    const sp = sectionPlaneSpec(sec);
    const vf = (proj && proj.views && proj.views[sec.parent]) || VIEW_FRAMES[sec.parent] || VIEW_FRAMES.top;
    const ex = vf.x, ey = vf.y, t2 = sp.t2;
    const T3 = vNorm([ex[0] * t2[0] + ey[0] * t2[1], ex[1] * t2[0] + ey[1] * t2[1], ex[2] * t2[0] + ey[2] * t2[1]]);
    const axLen = Math.hypot(dot3(T3, sp.x), dot3(T3, sp.y)) || 1;
    const ax2 = [dot3(T3, sp.x) / axLen, dot3(T3, sp.y) / axLen];
    const sig = dirSig(sp);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const du = B[0] - A[0], dv = B[1] - A[1], L = Math.hypot(du, dv);
      if (L < 1e-3) continue;
      const align = Math.abs((du * t2[0] + dv * t2[1]) / L);
      if (align <= 0.7) continue;
      const mu = (A[0] + B[0]) * 0.5, mv = (A[1] + B[1]) * 0.5;
      const o = [ex[0] * mu + ey[0] * mv, ex[1] * mu + ey[1] * mv, ex[2] * mu + ey[2] * mv];
      const PA3 = [ex[0] * A[0] + ey[0] * A[1], ex[1] * A[0] + ey[1] * A[1], ex[2] * A[0] + ey[2] * A[1]];
      const PB3 = [ex[0] * B[0] + ey[0] * B[1], ex[1] * B[0] + ey[1] * B[1], ex[2] * B[0] + ey[2] * B[1]];
      const sA = dot3(PA3, sp.x) * ax2[0] + dot3(PA3, sp.y) * ax2[1];
      const sB = dot3(PB3, sp.x) * ax2[0] + dot3(PB3, sp.y) * ax2[1];
      const sLoRaw = Math.min(sA, sB), sHiRaw = Math.max(sA, sB);
      segs.push({
        o,
        sLoRaw,
        sHiRaw,
        sMid: (sLoRaw + sHiRaw) * 0.5,
        key: `st|${sec.parent}|${r4(o[0])},${r4(o[1])},${r4(o[2])}|${sig}`,
      });
    }
    if (!segs.length) return null;
    segs.sort((p, q) => p.sMid - q.sMid);
    for (let i = 0; i < segs.length; i++) {
      segs[i].lo = i === 0 ? -Infinity : (segs[i - 1].sHiRaw + segs[i].sLoRaw) * 0.5;
      segs[i].hi = i === segs.length - 1 ? Infinity : (segs[i].sHiRaw + segs[i + 1].sLoRaw) * 0.5;
    }
    return { sp, ax2, segments: segs };
  }
  function secCacheKey(sec) {
    if (sec && sec.type === 'breakout') {
      const bp = breakoutPlaneSpec(sec);
      return `br|${sec.parent}|${r4(bp.o[0])},${r4(bp.o[1])},${r4(bp.o[2])}`;
    }
    if (sec && sec.type === 'stepped') {
      const st = steppedSegments(sec);
      return st ? 'st|' + st.segments.map((g) => g.key).join(';') : 'st|invalid';
    }
    const a = sec.a || [0, 0], b = sec.b || [10, 0];
    return `${sec.parent}|${r4(a[0])},${r4(a[1])}|${r4(b[0])},${r4(b[1])}|${sec.flip ? 1 : 0}`;
  }
  function collectNeededSections() {
    const map = new Map();
    for (const sh of sheets()) {
      for (const sec of sh.sections || []) {
        if (sec.type === 'stepped') {
          const st = steppedSegments(sec);
          if (!st) continue;
          for (const seg of st.segments) {
            if (!map.has(seg.key)) map.set(seg.key, { key: seg.key, o: seg.o, dir: st.sp.dir, x: st.sp.x, y: st.sp.y });
          }
          continue;
        }
        const key = secCacheKey(sec);
        if (!map.has(key)) {
          const sp = sectionPlaneSpec(sec);
          map.set(key, { key, o: sp.o, dir: sp.dir, x: sp.x, y: sp.y });
        }
      }
    }
    return [...map.values()];
  }
  function computeBomKey(sceneKey) {
    const d = App.doc;
    const mat = (d.settings && d.settings.material) || '';
    const unit = (d.settings && d.settings.unit) || 'mm';
    const meta = (d.items || []).map((it) => [it.id, it.name || '', it.mat || '', it.massG ?? '', it.role || '', it.suppressed ? 1 : 0, it.hidden ? 1 : 0]);
    return sceneKey + '|' + mat + '|' + unit + '|' + JSON.stringify(meta);
  }
  async function ensureBom(sceneKey) {
    if (!Model.activeItems(App.doc).length) {
      bomData = null; bomMeasure = null; bomCacheKey = null;
      return null;
    }
    const bk = computeBomKey(sceneKey);
    if (bomData && bomCacheKey === bk) return bomData;
    try {
      const m = await Mass.measure();
      const b = await Mass.bom(App.doc);
      bomMeasure = m || null;
      bomData = b || null;
      bomCacheKey = bk;
    } catch (_) {
      bomMeasure = null;
      bomData = null;
      bomCacheKey = null;
    }
    return bomData;
  }
  function bomItems(bom = bomData) {
    return ((bom && bom.rows) || []).map((r, i) => ({
      pos: i + 1,
      n: r.n,
      name: r.name,
      mat: r.kind,
      kind: r.kind,
      g: r.g,
      buy: !!r.buy,
      ids: Array.isArray(r.ids) ? r.ids.slice() : [],
      key: `${r.name}|${r.kind}|${round(r.g, 2)}`,
    }));
  }
  function resolveBalloonPos(bl, bom = bomData) {
    const rows = bomItems(bom);
    if (rows.length && bl) {
      if (bl.itemId) {
        const hit = rows.find((r) => r.ids.includes(bl.itemId));
        if (hit) return hit.pos;
      }
      if (bl.bomKey) {
        const hit = rows.find((r) => r.key === bl.bomKey);
        if (hit) return hit.pos;
      }
    }
    return Math.max(1, Math.round(Number(bl && bl.pos) || 1));
  }
  async function ensureProjections() {
    if (!Model.activeItems(App.doc).length) {
      proj = null; projRev = App.revision; projSceneKey = null; projSigs.clear(); geoCache.clear(); shadeCache.clear();
      bomData = null; bomMeasure = null; bomCacheKey = null;
      return;
    }
    if (loadingProjPromise) {
      await loadingProjPromise;
      return ensureProjections();
    }
    const specs = collectNeededViews();
    const exSpecs = collectNeededExplodeViews();
    const allSecs = collectNeededSections();
    const scene = Model.kernelScene(App.doc);
    const sceneKey = JSON.stringify(scene);
    const rev = App.revision;
    const needFull = !proj || sceneKey !== projSceneKey;
    const missingViews = needFull ? specs : specs.filter((s) => !proj.views || !proj.views[s.key] || projSigs.get(s.key) !== s.sig);
    const missingEx = needFull ? exSpecs : exSpecs.filter((s) => !proj.views || !proj.views[s.key] || projSigs.get(s.key) !== s.sig);
    const existingSecs = (proj && proj.sections) || {};
    const missingSecs = needFull ? allSecs : allSecs.filter((s) => !existingSecs[s.key]);
    if (!needFull && !missingViews.length && !missingSecs.length && !missingEx.length) {
      await ensureBom(sceneKey);
      projRev = rev;
      return;
    }
    loadingProjPromise = (async () => {
      try {
        if (needFull) {
          proj = await Kernel.call('project', { scene, views: specs.map((s) => s.spec), sections: allSecs });
          proj.explodeMeta = {};
          projSceneKey = sceneKey;
          projRev = rev;
          projSigs.clear();
          for (const s of specs) projSigs.set(s.key, s.sig);
          projId++;
          geoCache.clear();
          shadeCache.clear();
          const afterSecs = collectNeededSections().filter((s) => !(proj.sections && proj.sections[s.key]));
          if (afterSecs.length) {
            const res2 = await Kernel.call('project', { scene, views: [], sections: afterSecs });
            proj.sections = { ...(proj.sections || {}), ...((res2 && res2.sections) || {}) };
          }
        } else {
          if (missingViews.length || missingSecs.length) {
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
          }
          projRev = rev;
          projId++;
        }
        for (const s of missingEx) {
          const exData = computeExplodeData(s.ev, App.doc);
          const exScene = buildExplodedScene(scene, exData, App.doc);
          const exRes = await Kernel.call('project', {
            scene: exScene,
            views: [{ key: s.key, dir: s.ev.dir, x: s.ev.x }],
            sections: [],
          });
          proj.views = proj.views || {};
          proj.explodeMeta = proj.explodeMeta || {};
          if (exRes && exRes.views && exRes.views[s.key]) proj.views[s.key] = exRes.views[s.key];
          proj.explodeMeta[s.key] = exData;
          projSigs.set(s.key, s.sig);
          for (const ck of [...shadeCache.keys()]) if (ck.startsWith(s.key + '|')) shadeCache.delete(ck);
        }
        await ensureBom(sceneKey);
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
      if (App.mode === 'drawing') Panels.renderRight({ preserveFocus: true });
    }
  }
  async function refresh() {
    if (App.mode !== 'drawing') return;
    const prevProjId = projId;
    try {
      await ensureProjections();
    } catch (e) { UI.toast('Die Ansichten konnten nicht berechnet werden: ' + e.message, { kind: 'bad' }); }
    if (App.mode !== 'drawing') return;
    render();
    Panels.renderRight({ preserveFocus: true });
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
  // ---------- Unterbrochene Ansichten (ZE-16) ----------
  function buildAxisCuts(rawBrks, dir, tMin, tMax) {
    const raw = (rawBrks || [])
      .filter((b) => b && b.dir === dir)
      .map((b) => {
        const a = Math.max(tMin + 0.5, Math.min(Number(b.a) || 0, Number(b.b) || 0));
        const bb = Math.min(tMax - 0.5, Math.max(Number(b.a) || 0, Number(b.b) || 0));
        if (bb - a <= 0.6) return null;
        const gap = clamp(Number(b.gap) || 6, 0.5, (bb - a) * 0.45);
        return { brk: b, a, b: bb, gap, style: b.style === 'wave' ? 'wave' : 'zigzag' };
      })
      .filter(Boolean)
      .sort((p, q) => p.a - q.a);
    const cuts = [];
    let shift = 0;
    for (const c of raw) {
      if (cuts.length && c.a <= cuts[cuts.length - 1].b + 0.2) continue;
      const xL = c.a - shift;
      const xR = xL + c.gap;
      const removed = (c.b - c.a) - c.gap;
      cuts.push({ ...c, shiftBefore: shift, xL, xR, removed });
      shift += removed;
    }
    return cuts;
  }
  function map1D(t, cuts) {
    if (!cuts.length) return t;
    let shift = 0;
    for (const c of cuts) {
      if (t <= c.a) return t - shift;
      if (t < c.b) {
        const frac = (t - c.a) / (c.b - c.a);
        return c.xL + frac * c.gap;
      }
      shift += c.removed;
    }
    return t - shift;
  }
  function unmap1D(dt, cuts) {
    if (!cuts.length) return dt;
    let shift = 0;
    for (const c of cuts) {
      if (dt <= c.xL) return dt + shift;
      if (dt < c.xR) {
        const frac = (dt - c.xL) / c.gap;
        return c.a + frac * (c.b - c.a);
      }
      shift += c.removed;
    }
    return dt + shift;
  }
  function clipSeg1D(p0, p1, cuts, axis) {
    if (!cuts.length) return [[p0, p1]];
    const u0 = p0[axis], u1 = p1[axis], du = u1 - u0;
    const pts = [];
    const addT = (t) => {
      if (t >= 0 && t <= 1 && !pts.some((x) => Math.abs(x - t) < 1e-7)) pts.push(t);
    };
    addT(0); addT(1);
    if (Math.abs(du) > 1e-9) {
      for (const c of cuts) {
        addT((c.a - u0) / du);
        addT((c.b - u0) / du);
      }
    }
    pts.sort((a, b) => a - b);
    const lerp = (t) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    const inCut = (u) => cuts.some((c) => u > c.a + 1e-5 && u < c.b - 1e-5);
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = pts[i], t1 = pts[i + 1];
      if (t1 - t0 < 1e-7) continue;
      const uMid = u0 + du * ((t0 + t1) * 0.5);
      if (inCut(uMid)) continue;
      const q0 = lerp(t0), q1 = lerp(t1);
      if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) > 1e-5) out.push([q0, q1]);
    }
    return out;
  }
  function clipSegByBreaks(p0, p1, hCuts, vCuts) {
    let segs = clipSeg1D(p0, p1, hCuts, 0);
    if (vCuts.length) {
      const next = [];
      for (const s of segs) next.push(...clipSeg1D(s[0], s[1], vCuts, 1));
      segs = next;
    }
    return segs;
  }
  function clipPolyItemByBreaks(p, hCuts, vCuts) {
    if (p.c) {
      const [cx, cy] = p.c, r = p.r;
      const hitH = hCuts.some((c) => cx + r > c.a + 1e-4 && cx - r < c.b - 1e-4);
      const hitV = vCuts.some((c) => cy + r > c.a + 1e-4 && cy - r < c.b - 1e-4);
      if (!hitH && !hitV) return [p];
    }
    const pts = p.pts || [];
    const out = [];
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const segs = clipSegByBreaks(pts[i], pts[i + 1], hCuts, vCuts);
      if (!segs.length) {
        if (run && run.length > 1) out.push({ pts: run });
        run = null;
        continue;
      }
      for (const [q0, q1] of segs) {
        if (run && Math.hypot(run[run.length - 1][0] - q0[0], run[run.length - 1][1] - q0[1]) <= 1e-5) {
          run.push(q1);
        } else {
          if (run && run.length > 1) out.push({ pts: run });
          run = [q0, q1];
        }
      }
    }
    if (run && run.length > 1) out.push({ pts: run });
    return out;
  }
  function cutSpanExtent(baseGeo, cutVal, axis, fallbackMin, fallbackMax) {
    let lo = Infinity, hi = -Infinity;
    const other = 1 - axis;
    for (const arr of [baseGeo.polys || [], baseGeo.tangents || []]) {
      for (const p of arr) {
        const pts = p.pts || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const u0 = a[axis], u1 = b[axis];
          if ((u0 <= cutVal + 1e-4 && u1 >= cutVal - 1e-4) || (u1 <= cutVal + 1e-4 && u0 >= cutVal - 1e-4)) {
            const du = u1 - u0;
            const t = Math.abs(du) > 1e-8 ? clamp((cutVal - u0) / du, 0, 1) : 0.5;
            const v = a[other] + (b[other] - a[other]) * t;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
    }
    if (!isFinite(lo) || hi - lo < 0.2) return [fallbackMin, fallbackMax];
    return [lo, hi];
  }
  function applyBreaksToGeom(baseGeo, viewBrks) {
    if (!baseGeo || !viewBrks || !viewBrks.length) return baseGeo;
    const [tx0, ty0, tx1, ty1] = baseGeo.box;
    const hCuts = buildAxisCuts(viewBrks, 'h', tx0, tx1);
    const vCuts = buildAxisCuts(viewBrks, 'v', ty0, ty1);
    if (!hCuts.length && !vCuts.length) return baseGeo;
    const mapPt = (p) => [map1D(p[0], hCuts), map1D(p[1], vCuts)];
    const unmapPt = (dp) => [unmap1D(dp[0], hCuts), unmap1D(dp[1], vCuts)];
    const isKeptPt = (p) => !hCuts.some((c) => p[0] > c.a + 1e-4 && p[0] < c.b - 1e-4) && !vCuts.some((c) => p[1] > c.a + 1e-4 && p[1] < c.b - 1e-4);
    const polys = (baseGeo.polys || []).flatMap((p) => clipPolyItemByBreaks(p, hCuts, vCuts));
    const tangents = (baseGeo.tangents || []).flatMap((p) => clipPolyItemByBreaks(p, hCuts, vCuts));
    const hidden = (baseGeo.hidden || []).flatMap((p) => clipPolyItemByBreaks(p, hCuts, vCuts));
    const circles = [];
    for (const p of polys) if (p.c) circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc });
    const points = (baseGeo.points || []).filter(isKeptPt);
    const clipCenterList = (arr) => {
      const out = [];
      for (const c of arr || []) {
        if (c.type === 'cross') {
          if (isKeptPt(c.c)) out.push(c);
        } else {
          const segs = clipSegByBreaks(c.a, c.b, hCuts, vCuts);
          for (let i = 0; i < segs.length; i++) {
            const [qa, qb] = segs[i];
            const touched = Math.hypot(qa[0] - c.a[0], qa[1] - c.a[1]) > 1e-3 || Math.hypot(qb[0] - c.b[0], qb[1] - c.b[1]) > 1e-3;
            out.push({ ...c, a: qa, b: qb, noExt: c.noExt || touched });
          }
        }
      }
      return out;
    };
    const allCenters = clipCenterList(baseGeo.allCenters);
    const centers = clipCenterList(baseGeo.centers);
    const threads = [];
    for (const th of baseGeo.threads || []) {
      if (th.type === 'end') {
        if (isKeptPt(th.c)) threads.push(th);
      } else if (th.type === 'side') {
        for (const [qa, qb] of clipSegByBreaks(th.a, th.b, hCuts, vCuts)) threads.push({ ...th, a: qa, b: qb });
      }
    }
    const box = [map1D(tx0, hCuts), map1D(ty0, vCuts), map1D(tx1, hCuts), map1D(ty1, vCuts)];
    for (const c of hCuts) {
      const eA = cutSpanExtent(baseGeo, c.a, 0, ty0, ty1);
      const eB = cutSpanExtent(baseGeo, c.b, 0, ty0, ty1);
      c.lo = Math.min(map1D(eA[0], vCuts), map1D(eB[0], vCuts));
      c.hi = Math.max(map1D(eA[1], vCuts), map1D(eB[1], vCuts));
    }
    for (const c of vCuts) {
      const eA = cutSpanExtent(baseGeo, c.a, 1, tx0, tx1);
      const eB = cutSpanExtent(baseGeo, c.b, 1, tx0, tx1);
      c.lo = Math.min(map1D(eA[0], hCuts), map1D(eB[0], hCuts));
      c.hi = Math.max(map1D(eA[1], hCuts), map1D(eB[1], hCuts));
    }
    return {
      ...baseGeo,
      polys, tangents, hidden, circles, points, allCenters, centers, threads,
      box, w: box[2] - box[0], h: box[3] - box[1], trueBox: [...baseGeo.box],
      breakMap: { mapPt, unmapPt, isKeptPt, hCuts, vCuts, breaks: viewBrks },
    };
  }
  function viewGeom(name, sh = dwg()) {
    if (!proj || !proj.views || !proj.views[name]) return null;
    const opts = viewOpts(sh, name);
    const is3d = is3dView(sh, name);
    const ev = (sh.extraViews || []).find((x) => x.id === name && x.kind === 'explode');
    const exTag = ev ? ('|ex:' + (ev.explodeTrails !== false ? 1 : 0)) : '';
    // beim Bemaßen wird bei jeder Mausbewegung neu gezeichnet – die aufgeräumten Kanten merken
    const ck = name + '|' + projId + '|' + !!opts.hidden + '|' + !!opts.tangent + '|' + is3d + exTag;
    let g = geoCache.get(ck);
    if (!g) {
      if (geoCache.size > 32) geoCache.clear();
      g = viewGeom_(name, sh, opts, is3d);
      if (!g) return null;
      geoCache.set(ck, g);
    }
    const threads = is3d ? [] : projectThreadsForView(proj.views[name], sh);
    const base = { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh), threads };
    const viewBrks = !is3d ? ((sh.breaks || []).filter((b) => b.view === name)) : [];
    return viewBrks.length ? applyBreaksToGeom(base, viewBrks) : base;
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
    // Mittellinien (KP-20/ZE-06); Gewinde werden ungecached in viewGeom() projiziert
    const allCenters = is3d ? [] : computeViewCenters(name, v);
    const explodeTrails = [];
    const exView = (sh.extraViews || []).find((x) => x.id === name && x.kind === 'explode');
    if (exView && exView.explodeTrails !== false && proj && proj.explodeMeta && proj.explodeMeta[name]) {
      const vx = v.x || [1, 0, 0], vy = v.y || [0, 1, 0];
      for (const tr of proj.explodeMeta[name].trails3d || []) {
        if (!tr || !Array.isArray(tr.pts) || tr.pts.length < 2) continue;
        explodeTrails.push({
          partId: tr.partId,
          pts: tr.pts.map((p) => [dot3(p, vx), dot3(p, vy)]),
        });
      }
    }
    return { polys, tangents, hidden, circles, points, allCenters, threads: [], explodeTrails, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
  }
  function clipSegStrip(a, b, ax, ay, lo, hi) {
    const d0 = a[0] * ax + a[1] * ay;
    const d1 = b[0] * ax + b[1] * ay;
    const dd = d1 - d0;
    let t0 = 0, t1 = 1;
    if (Math.abs(dd) < 1e-9) {
      if (d0 < lo - 1e-5 || d0 > hi + 1e-5) return null;
    } else {
      if (isFinite(lo)) {
        const t = (lo - d0) / dd;
        if (dd > 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
      if (isFinite(hi)) {
        const t = (hi - d0) / dd;
        if (dd > 0) t1 = Math.min(t1, t);
        else t0 = Math.max(t0, t);
      }
      if (t1 - t0 <= 1e-7) return null;
    }
    const P0 = [a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])];
    const P1 = [a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1])];
    if (Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) <= 1e-6) return null;
    return [P0, P1];
  }
  function clipPolyStrip(pts, ax, ay, lo, hi) {
    const out = [];
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = clipSegStrip(pts[i], pts[i + 1], ax, ay, lo, hi);
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
  function clipEdgeItemStrip(item, ax, ay, lo, hi) {
    if (item.c && item.pts && item.pts.length >= 2) {
      const allIn = item.pts.every((p) => {
        const d = p[0] * ax + p[1] * ay;
        return d >= lo - 1e-5 && d <= hi + 1e-5;
      });
      if (allIn) {
        if (item.arc) return [item];
        const cd = item.c[0] * ax + item.c[1] * ay;
        if (cd - item.r >= lo - 1e-5 && cd + item.r <= hi + 1e-5) return [item];
      }
    }
    return clipPolyStrip(item.pts || [], ax, ay, lo, hi);
  }
  function polySignedArea2D(poly) {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a * 0.5;
  }
  function pointInPoly2D(pt, poly) {
    let inside = false;
    const x = pt[0], y = pt[1];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function clipSegPolygon(a, b, poly, keepInside = true) {
    if (!poly || poly.length < 3) return keepInside ? [] : [[a, b]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 1e-7) return [];
    const hits = [];
    for (let i = 0, n = poly.length; i < n; i++) {
      const p0 = poly[i], p1 = poly[(i + 1) % n];
      const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-9) continue;
      const qx = p0[0] - a[0], qy = p0[1] - a[1];
      const t = (qx * ey - qy * ex) / det;
      const u = (qx * dy - qy * dx) / det;
      if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) hits.push(t);
    }
    hits.sort((p, q) => p - q);
    const ts = [0];
    for (const t of hits) if (t - ts[ts.length - 1] > 1e-6) ts.push(t);
    if (1 - ts[ts.length - 1] > 1e-6) ts.push(1);
    else ts[ts.length - 1] = 1;
    const kept = [];
    for (let k = 0; k < ts.length - 1; k++) {
      const s0 = ts[k], s1 = ts[k + 1];
      if (s1 - s0 <= 1e-6) continue;
      const tm = (s0 + s1) * 0.5;
      const pm = [a[0] + tm * dx, a[1] + tm * dy];
      if (pointInPoly2D(pm, poly) === !!keepInside) {
        if (kept.length && Math.abs(kept[kept.length - 1][1] - s0) <= 1e-6) kept[kept.length - 1][1] = s1;
        else kept.push([s0, s1]);
      }
    }
    const out = [];
    for (const [s0, s1] of kept) {
      const P0 = [a[0] + s0 * dx, a[1] + s0 * dy];
      const P1 = [a[0] + s1 * dx, a[1] + s1 * dy];
      if (Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) > 1e-5) out.push([P0, P1]);
    }
    return out;
  }
  function clipPolyPolygon(pts, poly, keepInside = true) {
    const out = [];
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const segs = clipSegPolygon(pts[i], pts[i + 1], poly, keepInside);
      if (!segs.length) {
        if (run && run.length > 1) out.push({ pts: run });
        run = null;
        continue;
      }
      for (const seg of segs) {
        if (run && Math.hypot(run[run.length - 1][0] - seg[0][0], run[run.length - 1][1] - seg[0][1]) <= 1e-5) {
          run.push(seg[1]);
        } else {
          if (run && run.length > 1) out.push({ pts: run });
          run = [seg[0], seg[1]];
        }
      }
    }
    if (run && run.length > 1) out.push({ pts: run });
    return out;
  }
  function clipEdgeItemPolygon(item, poly, keepInside = true) {
    if (item.c && item.pts && item.pts.length >= 2) {
      let crosses = false;
      for (let i = 0; i < item.pts.length - 1; i++) {
        const segs = clipSegPolygon(item.pts[i], item.pts[i + 1], poly, keepInside);
        if (segs.length !== 1 || Math.hypot(segs[0][0][0] - item.pts[i][0], segs[0][0][1] - item.pts[i][1]) > 1e-4 || Math.hypot(segs[0][1][0] - item.pts[i + 1][0], segs[0][1][1] - item.pts[i + 1][1]) > 1e-4) {
          crosses = true;
          break;
        }
      }
      if (!crosses && item.pts.every((p) => pointInPoly2D(p, poly) === !!keepInside)) return [item];
    }
    return clipPolyPolygon(item.pts || [], poly, keepInside);
  }
  function makeBreakPoly(region) {
    if (!Array.isArray(region) || region.length < 3) return [];
    if (region.length >= 10) return region.map((p) => [p[0], p[1]]);
    const ccw = polySignedArea2D(region) >= 0 ? 1 : -1;
    let minL = Infinity;
    for (let i = 0; i < region.length; i++) {
      const A = region[i], B = region[(i + 1) % region.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (L > 1e-4 && L < minL) minL = L;
    }
    if (!isFinite(minL)) minL = 10;
    const amp = clamp(minL * 0.035, 0.15, 0.65);
    const out = [];
    for (let i = 0; i < region.length; i++) {
      const A = region[i], B = region[(i + 1) % region.length];
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      out.push([A[0], A[1]]);
      if (L < 0.8) continue;
      const ux = dx / L, uy = dy / L;
      const inX = ccw >= 0 ? -uy : uy;
      const inY = ccw >= 0 ? ux : -ux;
      const steps = clamp(Math.round(L / 2.2), 4, 24);
      const cycles = Math.max(1, Math.round(L / 6));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const w = amp * 0.5 * (1 - Math.cos(t * TWO_PI * cycles)) * Math.sin(t * Math.PI);
        out.push([A[0] + dx * t + inX * w, A[1] + dy * t + inY * w]);
      }
    }
    return out;
  }
  function parseRawEdges(v, showHidden, withTangents = false) {
    const raw = (e) => (e.t === 'LINE' && e.a ? { kind: 'line', a: e.a, b: e.b } : e.t === 'CIRCLE' && e.c && e.pts ? { kind: 'arc', c: e.c, r: e.r, full: !!e.full, pts: e.pts } : e.pts ? { kind: 'curve', pts: e.pts } : null);
    const sharpVis = (v.visible || []).map(raw).filter(Boolean);
    const tanVis = withTangents ? (v.tangentVisible || []).map(raw).filter(Boolean) : [];
    const sharpHid = (v.hidden || []).map(raw).filter(Boolean);
    const tanHid = withTangents ? (v.tangentHidden || []).map(raw).filter(Boolean) : [];
    const cg1 = cleanGeom(sharpVis, tanVis);
    let hid = [];
    if (showHidden) {
      const allVis = withTangents ? [...sharpVis, ...tanVis] : sharpVis;
      const allHid = withTangents ? [...sharpHid, ...tanHid] : sharpHid;
      hid = cleanGeom(allVis, allHid).hid;
    }
    return { vis: cg1.vis, tan: withTangents ? cg1.hid : [], hid };
  }
  function finalizeSectionGeom(polys, tangents, hidden, caps, allCenters, extra = {}) {
    const circles = [], points = [];
    for (const arr of [polys, tangents]) for (const p of arr) {
      if (!p.pts || !p.pts.length) continue;
      points.push(p.pts[0], p.pts[p.pts.length - 1]);
      if (p.c) { circles.push({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }); points.push(p.c); }
    }
    for (const p of hidden) if (p.pts && p.pts.length) points.push(p.pts[0], p.pts[p.pts.length - 1]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const arr of [polys, tangents, hidden]) for (const p of arr) for (const q of p.pts || []) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    for (const cap of caps) {
      if (cap.bbox) { x0 = Math.min(x0, cap.bbox[0]); y0 = Math.min(y0, cap.bbox[1]); x1 = Math.max(x1, cap.bbox[2]); y1 = Math.max(y1, cap.bbox[3]); }
      for (const p of cap.outer || []) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    }
    if (!isFinite(x0)) return null;
    return { polys, tangents, hidden, caps, circles, points, allCenters, threads: [], box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, ...extra };
  }
  function sectionGeom(sec, sh = dwg()) {
    const type = sec.type || 'full';
    const key = secCacheKey(sec);
    const viewName = 'sec_' + sec.id;
    if (type === 'half') {
      const sp = sectionPlaneSpec(sec);
      const vk = secUncutViewKey(sp);
      if (!proj || !proj.sections || !proj.sections[key] || !proj.views || !proj.views[vk]) return null;
      const ck = 'half|' + key + '|' + sec.id + '|' + projId + '|' + !!sh.hidden + '|' + (sec.halfAxis || 'v') + '|' + (sec.halfSide || 'right') + '|' + (sec.split ?? '');
      let g = geoCache.get(ck);
      if (!g) {
        if (geoCache.size > 32) geoCache.clear();
        const secRaw = proj.sections[key], fullRaw = proj.views[vk];
        const sc = parseRawEdges(secRaw, !!sh.hidden, false);
        const fc = parseRawEdges(fullRaw, !!sh.hidden, true);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const arr of [fc.vis, fc.tan, fc.hid, sc.vis, sc.hid]) for (const p of arr) for (const q of p.pts || []) {
          x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
        }
        for (const cap of secRaw.caps || []) {
          if (cap.bbox) { x0 = Math.min(x0, cap.bbox[0]); y0 = Math.min(y0, cap.bbox[1]); x1 = Math.max(x1, cap.bbox[2]); y1 = Math.max(y1, cap.bbox[3]); }
        }
        if (!isFinite(x0)) return null;
        const isH = sec.halfAxis === 'h';
        const splitVal = (sec.split != null && Number.isFinite(Number(sec.split))) ? Number(sec.split) : (isH ? (y0 + y1) * 0.5 : (x0 + x1) * 0.5);
        const side = sec.halfSide || (isH ? 'bottom' : 'right');
        const ax = isH ? 0 : 1, ay = isH ? 1 : 0;
        const cutPosHalf = (!isH && side === 'right') || (isH && side === 'top');
        const cutStrip = cutPosHalf ? { ax, ay, lo: splitVal, hi: Infinity } : { ax, ay, lo: -Infinity, hi: splitVal };
        const uncutStrip = cutPosHalf ? { ax, ay, lo: -Infinity, hi: splitVal } : { ax, ay, lo: splitVal, hi: Infinity };
        const polys = [], tangents = [], hidden = [];
        for (const p of fc.vis) polys.push(...clipEdgeItemStrip(p, uncutStrip.ax, uncutStrip.ay, uncutStrip.lo, uncutStrip.hi));
        for (const p of fc.tan) tangents.push(...clipEdgeItemStrip(p, uncutStrip.ax, uncutStrip.ay, uncutStrip.lo, uncutStrip.hi));
        for (const p of fc.hid) hidden.push(...clipEdgeItemStrip(p, uncutStrip.ax, uncutStrip.ay, uncutStrip.lo, uncutStrip.hi));
        for (const p of sc.vis) polys.push(...clipEdgeItemStrip(p, cutStrip.ax, cutStrip.ay, cutStrip.lo, cutStrip.hi));
        for (const p of sc.hid) hidden.push(...clipEdgeItemStrip(p, cutStrip.ax, cutStrip.ay, cutStrip.lo, cutStrip.hi));
        const caps = [];
        for (const cap of secRaw.caps || []) {
          if (cap.bbox) {
            const cLo = Math.min(cap.bbox[0] * ax + cap.bbox[1] * ay, cap.bbox[2] * ax + cap.bbox[3] * ay);
            const cHi = Math.max(cap.bbox[0] * ax + cap.bbox[1] * ay, cap.bbox[2] * ax + cap.bbox[3] * ay);
            if (cHi < cutStrip.lo - 1e-4 || cLo > cutStrip.hi + 1e-4) continue;
          }
          caps.push({ ...cap, strip: cutStrip });
        }
        const splitLine = isH ? { a: [x0, splitVal], b: [x1, splitVal] } : { a: [splitVal, y0], b: [splitVal, y1] };
        const allCenters = computeViewCenters(viewName, fullRaw);
        g = finalizeSectionGeom(polys, tangents, hidden, caps, allCenters, { splitLine, halfClip: cutStrip });
        if (!g) return null;
        geoCache.set(ck, g);
      }
      const threads = projectThreadsForView(proj.views[vk], sh, { isSection: true, sectionPlane: sp, halfClip: g.halfClip });
      return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh), threads };
    }
    if (type === 'stepped') {
      const st = steppedSegments(sec);
      if (!st || !st.segments.length || !proj || !proj.sections) return null;
      for (const seg of st.segments) if (!proj.sections[seg.key]) return null;
      const ck = 'step|' + key + '|' + sec.id + '|' + projId + '|' + !!sh.hidden;
      let g = geoCache.get(ck);
      if (!g) {
        if (geoCache.size > 32) geoCache.clear();
        const polys = [], hidden = [], caps = [];
        const [ax, ay] = st.ax2;
        for (const seg of st.segments) {
          const v = proj.sections[seg.key];
          const sc = parseRawEdges(v, !!sh.hidden, false);
          for (const p of sc.vis) polys.push(...clipEdgeItemStrip(p, ax, ay, seg.lo, seg.hi));
          for (const p of sc.hid) hidden.push(...clipEdgeItemStrip(p, ax, ay, seg.lo, seg.hi));
          for (const cap of v.caps || []) {
            if (cap.bbox) {
              const vals = [
                cap.bbox[0] * ax + cap.bbox[1] * ay,
                cap.bbox[2] * ax + cap.bbox[1] * ay,
                cap.bbox[0] * ax + cap.bbox[3] * ay,
                cap.bbox[2] * ax + cap.bbox[3] * ay,
              ];
              if (Math.max(...vals) < seg.lo - 1e-4 || Math.min(...vals) > seg.hi + 1e-4) continue;
            }
            caps.push({ ...cap, strip: { ax, ay, lo: seg.lo, hi: seg.hi } });
          }
        }
        const allCenters = computeViewCenters(viewName, st.sp);
        g = finalizeSectionGeom(polys, [], hidden, caps, allCenters);
        if (!g) return null;
        geoCache.set(ck, g);
      }
      const threads = projectThreadsForView(st.sp, sh, { isSection: true, steppedSegments: st });
      return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh), threads };
    }
    if (type === 'breakout') {
      if (!proj || !proj.sections || !proj.sections[key] || !proj.views || !proj.views[sec.parent]) return null;
      if (!Array.isArray(sec.region) || sec.region.length < 3) return null;
      const regSig = sec.region.map((p) => `${r4(p[0])},${r4(p[1])}`).join(';');
      const ck = 'brk|' + key + '|' + sec.id + '|' + projId + '|' + !!sh.hidden + '|' + (sec.depth ?? '') + '|' + regSig;
      let g = geoCache.get(ck);
      if (!g) {
        if (geoCache.size > 32) geoCache.clear();
        const secRaw = proj.sections[key], fullRaw = proj.views[sec.parent];
        const fc = parseRawEdges(fullRaw, !!sh.hidden, true);
        const sc = parseRawEdges(secRaw, !!sh.hidden, false);
        const breakPoly = makeBreakPoly(sec.region);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const arr of [fc.vis, fc.tan, fc.hid, sc.vis, sc.hid]) for (const p of arr) for (const q of p.pts || []) {
          x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
        }
        if (!isFinite(x0)) return null;
        const polys = [], tangents = [], hidden = [];
        for (const p of fc.vis) polys.push(...clipEdgeItemPolygon(p, breakPoly, false));
        for (const p of fc.tan) tangents.push(...clipEdgeItemPolygon(p, breakPoly, false));
        for (const p of fc.hid) hidden.push(...clipEdgeItemPolygon(p, breakPoly, false));
        for (const p of sc.vis) polys.push(...clipEdgeItemPolygon(p, breakPoly, true));
        for (const p of sc.hid) hidden.push(...clipEdgeItemPolygon(p, breakPoly, true));
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const p of breakPoly) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
        const caps = [];
        for (const cap of secRaw.caps || []) {
          if (cap.bbox && (cap.bbox[2] < bx0 - 1e-4 || cap.bbox[0] > bx1 + 1e-4 || cap.bbox[3] < by0 - 1e-4 || cap.bbox[1] > by1 + 1e-4)) continue;
          caps.push({ ...cap, clipPoly: breakPoly });
        }
        const closedLoop = [...breakPoly, breakPoly[0]];
        const clipX = clipPolyStrip(closedLoop, 1, 0, x0 - 0.01, x1 + 0.01);
        const breakLines = [];
        for (const item of clipX) breakLines.push(...clipPolyStrip(item.pts, 0, 1, y0 - 0.01, y1 + 0.01));
        const allCenters = computeViewCenters(viewName, fullRaw);
        g = finalizeSectionGeom(polys, tangents, hidden, caps, allCenters, { breakPoly, breakLines });
        if (!g) return null;
        g.box = [x0, y0, x1, y1];
        g.w = x1 - x0;
        g.h = y1 - y0;
        geoCache.set(ck, g);
      }
      const bp = breakoutPlaneSpec(sec);
      const threads = projectThreadsForView(proj.views[sec.parent], sh, { isSection: true, sectionPlane: bp, breakPoly: g.breakPoly });
      return { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh), threads };
    }
    if (!proj || !proj.sections || !proj.sections[key]) return null;
    const ck = 'sec|' + key + '|' + sec.id + '|' + projId + '|' + !!sh.hidden;
    let g = geoCache.get(ck);
    if (!g) {
      if (geoCache.size > 32) geoCache.clear();
      const v = proj.sections[key];
      const sc = parseRawEdges(v, !!sh.hidden, false);
      const caps = v.caps || [];
      const sDir = new THREE.Vector3(...v.dir), oVec = new THREE.Vector3(...(v.o || [0, 0, 0]));
      const allCenters = computeViewCenters(viewName, v, (a, o, d) => {
        const p0 = o.clone().addScaledVector(d, a.t0), p1 = o.clone().addScaledVector(d, a.t1);
        const w0 = p0.sub(oVec).dot(sDir), w1 = p1.sub(oVec).dot(sDir);
        return Math.min(w0, w1) <= a.r + 0.5;
      });
      g = finalizeSectionGeom(sc.vis, [], sc.hid, caps, allCenters);
      if (!g) return null;
      geoCache.set(ck, g);
    }
    const secRaw = proj.sections[key];
    const threads = projectThreadsForView(secRaw, sh, { isSection: true, sectionPlane: { o: secRaw.o || [0, 0, 0], dir: secRaw.dir } });
    const base = { ...g, allCenters: g.allCenters, centers: filterVisibleCenters(g.allCenters, sh), threads };
    const viewBrks = (sh.breaks || []).filter((b) => b.view === viewName);
    return viewBrks.length ? applyBreaksToGeom(base, viewBrks) : base;
  }
  function threadDims(size) {
    const te = typeof threadEntry === 'function' ? threadEntry(size) : null;
    if (te && te.nenn_d_mm > 0) {
      return {
        d: Number(te.nenn_d_mm),
        core: Number(te.kernloch_mm) || Number(te.nenn_d_mm) * 0.82,
        pitch: Number(te.steigung_mm) || 1,
      };
    }
    const sp = THREAD_MAP[size];
    if (sp) return { d: sp.d, core: sp.core, pitch: sp.pitch };
    const d = parseFloat(String(size || '').replace(/[^\d.]/g, '')) || 6;
    return { d, core: d * 0.83, pitch: 1 };
  }
  function isItemActiveVisible(doc, it) {
    if (!it || it.suppressed || it.hidden || !Model.isActive(doc, it.id)) return false;
    for (const p of Model.parentsOf(doc, it.id)) {
      if (p && (p.suppressed || p.hidden)) return false;
    }
    return true;
  }
  function collectSolidBBoxes(doc = App.doc) {
    const boxes = [];
    if (typeof Actions !== 'undefined' && Actions.worldBox) {
      for (const top of Model.activeItems(doc)) {
        if (!top || top.role === 'hole' || top.suppressed || top.hidden) continue;
        const wb = Actions.worldBox(top.id);
        if (wb && !wb.isEmpty()) boxes.push([wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z]);
      }
    }
    if (!boxes.length && proj && Array.isArray(proj.bbox) && proj.bbox.length >= 6) boxes.push(proj.bbox);
    return boxes;
  }
  function ptInBox3(pt, b, eps = 0.05) {
    return pt.x >= b[0] - eps && pt.x <= b[3] + eps
      && pt.y >= b[1] - eps && pt.y <= b[4] + eps
      && pt.z >= b[2] - eps && pt.z <= b[5] + eps;
  }
  function clampThreadSeg(p0, p1, solidBBoxes) {
    const len = p0.distanceTo(p1);
    if (len < 0.2) return [];
    if (!solidBBoxes || !solidBBoxes.length) return [{ p0, p1, blind0: false, blind1: false }];
    const u = p1.clone().sub(p0).divideScalar(len);
    const dirArr = [u.x, u.y, u.z];
    const pArr = [p0.x, p0.y, p0.z];
    const ivs = [];
    const hitBoxes = [];
    for (const b of solidBBoxes) {
      let t0 = 0, t1 = len, ok = true;
      for (let k = 0; k < 3; k++) {
        const d = dirArr[k], lo = b[k] - 0.02, hi = b[k + 3] + 0.02;
        if (Math.abs(d) < 1e-8) {
          if (pArr[k] < lo || pArr[k] > hi) { ok = false; break; }
        } else {
          let a = (lo - pArr[k]) / d, bb = (hi - pArr[k]) / d;
          if (a > bb) [a, bb] = [bb, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, bb);
          if (t0 >= t1 - 0.2) { ok = false; break; }
        }
      }
      if (ok && t1 - t0 > 0.2) {
        ivs.push([t0, t1]);
        hitBoxes.push(b);
      }
    }
    if (!ivs.length) return [];
    ivs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of ivs) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return merged.map(([tA, tB]) => {
      const q0 = p0.clone().addScaledVector(u, tA);
      const q1 = p0.clone().addScaledVector(u, tB);
      const probe0 = q0.clone().addScaledVector(u, -0.15);
      const probe1 = q1.clone().addScaledVector(u, 0.15);
      const blind0 = hitBoxes.some((b) => ptInBox3(probe0, b, 0.04));
      const blind1 = hitBoxes.some((b) => ptInBox3(probe1, b, 0.04));
      return { p0: q0, p1: q1, blind0, blind1 };
    });
  }
  function docThreads(doc = App.doc, extraMat = null, visited = null, solidBBoxes = null) {
    if (!doc || !Array.isArray(doc.items)) return [];
    const vis = visited || new Set();
    if (doc.id && vis.has(doc.id)) return [];
    if (doc.id) vis.add(doc.id);
    const out = [], V = Model.vars(doc).v;
    const boxes = solidBBoxes || collectSolidBBoxes(doc);
    try {
      Model.walk(doc.items, (it) => {
        if (!isItemActiveVisible(doc, it)) return;
        const mats = Model.instanceMatrices(doc, it.id, V).map((m) => (extraMat ? extraMat.clone().multiply(m) : m));
        if (!mats.length) return;
        if (it.kind === 'ref' && it.p && it.p.docId && typeof Model.resolveDoc === 'function') {
          const rd = Model.resolveDoc(it.p.docId);
          if (rd) {
            for (const M of mats) out.push(...docThreads(rd, M, vis, boxes));
          }
          return;
        }
        if (it.role !== 'hole' && it.threads && it.threads.length) {
          for (const th of it.threads) {
            const fi = !extraMat ? Viewer.threadFaceIndex(it.id, th) : -1;
            const g = (fi >= 0 && Viewer.cylinderFaceInfo(it.id, fi)) || (Array.isArray(th.axis) && th.axis.length >= 6 ? {
              o: th.axis.slice(0, 3), d: th.axis.slice(3, 6), r: th.r || 3, t0: th.t0 ?? 0, t1: th.t1 ?? 10, faceLen: Math.max(0.1, (th.t1 ?? 10) - (th.t0 ?? 0)), kind: th.kind || 'ext',
            } : null);
            if (!g) continue;
            const kind = th.kind || g.kind || 'ext';
            const L = clamp(Number(th.length) || g.faceLen, 0.2, g.faceLen);
            const s0 = th.from === 'bottom' ? g.t0 : g.t1 - L;
            const s1 = th.from === 'bottom' ? g.t0 + L : g.t1;
            const td = threadDims(th.size);
            const rThread = kind === 'int' ? (td ? td.d / 2 : g.r * 1.15) : (td ? td.core / 2 : g.r * 0.85);
            const dL = new THREE.Vector3(...g.d).normalize();
            const p0L = new THREE.Vector3(...g.o).addScaledVector(dL, s0);
            const p1L = new THREE.Vector3(...g.o).addScaledVector(dL, s1);
            for (const M of mats) {
              const p0 = p0L.clone().applyMatrix4(M), p1 = p1L.clone().applyMatrix4(M);
              out.push({ p0, p1, d: p1.clone().sub(p0).normalize(), r: g.r, rThread, size: th.size, length: L, kind, source: 'cosmetic', blind0: true, blind1: true });
            }
          }
        }
        if (it.kind === 'part' && it.p) {
          const p = it.p;
          if (p.lib === 'screwHole' && p.fit === 'tap') {
            const size = p.size || 'M6';
            const td = threadDims(size);
            const L = Math.max(0.2, Model.num(p.length, V, 10));
            const p0L = new THREE.Vector3(0, 0, -L), p1L = new THREE.Vector3(0, 0, 0);
            for (const M of mats) {
              const w0 = p0L.clone().applyMatrix4(M), w1 = p1L.clone().applyMatrix4(M);
              for (const seg of clampThreadSeg(w0, w1, boxes)) {
                out.push({ p0: seg.p0, p1: seg.p1, d: seg.p1.clone().sub(seg.p0).normalize(), r: td.core / 2, rThread: td.d / 2, size, length: round(seg.p0.distanceTo(seg.p1), 2), kind: 'int', source: 'tapHole', blind0: seg.blind0, blind1: seg.blind1 });
              }
            }
          } else if (p.lib === 'threadHole') {
            const size = p.size || 'M6';
            const td = threadDims(size);
            const L = Math.max(0.2, Model.num(p.length, V, 10));
            const p0L = new THREE.Vector3(0, 0, -L), p1L = new THREE.Vector3(0, 0, 0);
            for (const M of mats) {
              const w0 = p0L.clone().applyMatrix4(M), w1 = p1L.clone().applyMatrix4(M);
              const segs = (it.role === 'hole' || (it.op && it.op.type === 'cut')) ? clampThreadSeg(w0, w1, boxes) : [{ p0: w0, p1: w1, blind0: false, blind1: false }];
              for (const seg of segs) {
                out.push({ p0: seg.p0, p1: seg.p1, d: seg.p1.clone().sub(seg.p0).normalize(), r: td.core / 2, rThread: td.d / 2, size, length: round(seg.p0.distanceTo(seg.p1), 2), kind: 'int', source: 'threadHole', blind0: seg.blind0, blind1: seg.blind1 });
              }
            }
          } else if (it.role !== 'hole' && p.lib === 'threadRod') {
            const size = p.size || 'M6';
            const td = threadDims(size);
            const L = Math.max(0.2, Model.num(p.length, V, 12));
            const p0L = new THREE.Vector3(0, 0, 0), p1L = new THREE.Vector3(0, 0, L);
            for (const M of mats) {
              const p0 = p0L.clone().applyMatrix4(M), p1 = p1L.clone().applyMatrix4(M);
              out.push({ p0, p1, d: p1.clone().sub(p0).normalize(), r: td.d / 2, rThread: td.core / 2, size, length: round(L, 2), kind: 'ext', source: 'threadRod', blind0: true, blind1: true });
            }
          } else if (it.role !== 'hole' && p.lib === 'stdScrew') {
            const size = p.size || 'M3';
            const td = threadDims(size);
            const L = Math.max(0.5, Model.num(p.length, V, 10));
            const se = typeof screwEntry === 'function' ? screwEntry(size) : null;
            const ck = se && se.senkkopf && se.senkkopf.kopf_h_mm ? Number(se.senkkopf.kopf_h_mm) : 0;
            const z0 = p.head === 'senk' && ck > 0 ? -Math.max(L, ck + 0.5) : -L;
            const z1 = p.head === 'senk' && ck > 0 ? -ck : 0;
            if (z1 - z0 >= 0.2) {
              const p0L = new THREE.Vector3(0, 0, z0), p1L = new THREE.Vector3(0, 0, z1);
              for (const M of mats) {
                const p0 = p0L.clone().applyMatrix4(M), p1 = p1L.clone().applyMatrix4(M);
                out.push({ p0, p1, d: p1.clone().sub(p0).normalize(), r: td.d / 2, rThread: td.core / 2, size, length: round(z1 - z0, 2), kind: 'ext', source: 'stdScrew', blind0: true, blind1: true });
              }
            }
          } else if (it.role !== 'hole' && p.lib === 'stdNut') {
            const size = p.size || 'M3';
            const td = threadDims(size);
            const se = typeof screwEntry === 'function' ? screwEntry(size) : null;
            const nutH = (se && se.mutter && Number(se.mutter.hoehe_mm)) || td.d * 0.8;
            const p0L = new THREE.Vector3(0, 0, 0), p1L = new THREE.Vector3(0, 0, nutH);
            for (const M of mats) {
              const p0 = p0L.clone().applyMatrix4(M), p1 = p1L.clone().applyMatrix4(M);
              out.push({ p0, p1, d: p1.clone().sub(p0).normalize(), r: td.core / 2, rThread: td.d / 2, size, length: round(nutH, 2), kind: 'int', source: 'stdNut', blind0: false, blind1: false });
            }
          }
        }
      });
    } finally {
      if (doc.id) vis.delete(doc.id);
    }
    return out;
  }
  function projectThreadsForView(v, sh = dwg(), opts = {}) {
    if (!v || !v.dir || !v.x || !v.y) return [];
    const normOn = normThreadsActive(sh);
    const allowCosmetic = !sh || sh.normThreads !== false;
    if (!normOn && !allowCosmetic) return [];
    const rawList = docThreads().filter((th) => normOn || th.source === 'cosmetic');
    if (!rawList.length) return [];
    const dir = new THREE.Vector3(...v.dir).normalize();
    const ex = new THREE.Vector3(...v.x).normalize();
    const ey = new THREE.Vector3(...v.y).normalize();
    const threads = [];
    const seenT = new Set();
    const sp = opts.sectionPlane || null;
    const spO = sp && sp.o ? new THREE.Vector3(...sp.o) : null;
    const spDir = sp && sp.dir ? new THREE.Vector3(...sp.dir).normalize() : null;
    const cutStatus = (th, planeO, planeDir) => {
      if (!planeO || !planeDir) return { keep: true, isCut: false };
      const w0 = th.p0.clone().sub(planeO).dot(planeDir);
      const w1 = th.p1.clone().sub(planeO).dot(planeDir);
      if (Math.min(w0, w1) > th.rThread + 0.5) return { keep: false, isCut: false };
      const isCut = Math.min(w0, w1) <= th.rThread + 0.25 && Math.max(w0, w1) >= -(th.rThread + 0.25);
      return { keep: true, isCut };
    };
    const pushSide = (a, b, th, isCut, blind0 = th.blind0, blind1 = th.blind1) => {
      if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) <= 0.2) return;
      const sA = Math.round(a[0] * 20) + ',' + Math.round(a[1] * 20);
      const sB = Math.round(b[0] * 20) + ',' + Math.round(b[1] * 20);
      const key = 's|' + (sA < sB ? sA + '|' + sB : sB + '|' + sA) + '|' + th.size + '|' + th.kind + '|' + (isCut ? 1 : 0);
      if (seenT.has(key)) return;
      seenT.add(key);
      threads.push({ type: 'side', a, b, r: th.r, rThread: th.rThread, size: th.size, length: th.length, kind: th.kind, source: th.source, blind0, blind1, isCut: !!isCut });
    };
    const pushEnd = (c, th, isCut) => {
      const key = 'e|' + Math.round(c[0] * 20) + ',' + Math.round(c[1] * 20) + '|' + th.size + '|' + th.kind;
      if (seenT.has(key)) return;
      seenT.add(key);
      threads.push({ type: 'end', c, r: th.r, rThread: th.rThread, size: th.size, length: th.length, kind: th.kind, source: th.source, blind0: th.blind0, blind1: th.blind1, isCut: !!isCut });
    };
    for (const th of rawList) {
      const k = Math.abs(th.d.dot(dir));
      if (k > 0.995) {
        const c = [th.p0.dot(ex), th.p0.dot(ey)];
        if (opts.isSection && spO && spDir) {
          const w0 = th.p0.clone().sub(spO).dot(spDir), w1 = th.p1.clone().sub(spO).dot(spDir);
          if (Math.min(w0, w1) > 0.5) continue;
        }
        if (opts.halfClip) {
          const d = c[0] * opts.halfClip.ax + c[1] * opts.halfClip.ay;
          const inCut = d >= opts.halfClip.lo - 1e-4 && d <= opts.halfClip.hi + 1e-4;
          pushEnd(c, th, inCut);
        } else if (opts.breakPoly) {
          pushEnd(c, th, pointInPoly2D(c, opts.breakPoly));
        } else {
          pushEnd(c, th, !!opts.isSection);
        }
      } else if (k < 0.05) {
        const a = [th.p0.dot(ex), th.p0.dot(ey)], b = [th.p1.dot(ex), th.p1.dot(ey)];
        if (opts.steppedSegments && opts.steppedSegments.segments) {
          const st = opts.steppedSegments;
          for (const seg of st.segments) {
            const clipped = clipSegStrip(a, b, st.ax2[0], st.ax2[1], seg.lo, seg.hi);
            if (!clipped) continue;
            const cs = cutStatus(th, new THREE.Vector3(...seg.o), new THREE.Vector3(...st.sp.dir).normalize());
            if (!cs.keep) continue;
            pushSide(clipped[0], clipped[1], th, cs.isCut, th.blind0 && Math.hypot(clipped[0][0] - a[0], clipped[0][1] - a[1]) < 0.05, th.blind1 && Math.hypot(clipped[1][0] - b[0], clipped[1][1] - b[1]) < 0.05);
          }
        } else if (opts.halfClip) {
          const hc = opts.halfClip;
          const cutSeg = clipSegStrip(a, b, hc.ax, hc.ay, hc.lo, hc.hi);
          if (cutSeg) {
            const cs = cutStatus(th, spO, spDir);
            if (cs.keep) pushSide(cutSeg[0], cutSeg[1], th, cs.isCut, th.blind0 && Math.hypot(cutSeg[0][0] - a[0], cutSeg[0][1] - a[1]) < 0.05, th.blind1 && Math.hypot(cutSeg[1][0] - b[0], cutSeg[1][1] - b[1]) < 0.05);
          }
          const uncutLo = isFinite(hc.lo) ? -Infinity : hc.hi;
          const uncutHi = isFinite(hc.lo) ? hc.lo : Infinity;
          const unSeg = clipSegStrip(a, b, hc.ax, hc.ay, uncutLo, uncutHi);
          if (unSeg) {
            pushSide(unSeg[0], unSeg[1], th, false, th.blind0 && Math.hypot(unSeg[0][0] - a[0], unSeg[0][1] - a[1]) < 0.05, th.blind1 && Math.hypot(unSeg[1][0] - b[0], unSeg[1][1] - b[1]) < 0.05);
          }
        } else if (opts.breakPoly) {
          for (const seg of clipSegPolygon(a, b, opts.breakPoly, true)) {
            const cs = cutStatus(th, spO, spDir);
            if (cs.keep) pushSide(seg[0], seg[1], th, cs.isCut, th.blind0 && Math.hypot(seg[0][0] - a[0], seg[0][1] - a[1]) < 0.05, th.blind1 && Math.hypot(seg[1][0] - b[0], seg[1][1] - b[1]) < 0.05);
          }
          for (const seg of clipSegPolygon(a, b, opts.breakPoly, false)) {
            pushSide(seg[0], seg[1], th, false, th.blind0 && Math.hypot(seg[0][0] - a[0], seg[0][1] - a[1]) < 0.05, th.blind1 && Math.hypot(seg[1][0] - b[0], seg[1][1] - b[1]) < 0.05);
          }
        } else if (opts.isSection && spO && spDir) {
          const cs = cutStatus(th, spO, spDir);
          if (!cs.keep) continue;
          pushSide(a, b, th, cs.isCut);
        } else {
          pushSide(a, b, th, false);
        }
      }
    }
    return threads;
  }
  function hatchPatternForMaterial(matKey) {
    const k = String(matKey || '').trim().toLowerCase();
    if (!k) return 'steel';
    if (k.includes('alu')) return 'alu';
    if (k.includes('messing') || k.includes('kupfer') || k.includes('brass') || k.includes('copper') || k.includes('bronze')) return 'brass';
    if (k.includes('cfk') || k.includes('gfk') || k.includes('faser') || k.includes('carbon')) return 'composite';
    if (k.includes('holz') || k.includes('buche') || k.includes('birke') || k.includes('pappel') || k.includes('mdf') || k.includes('wood')) return 'wood';
    if (k.includes('stahl') || k.includes('titan') || k.includes('eisen') || k.includes('steel')) return 'steel';
    const m = typeof MATERIALS !== 'undefined' ? MATERIALS.find((x) => String(x.k || '').toLowerCase() === k || String(x.name || '').toLowerCase() === k) : null;
    if (m) {
      if (m.cat === 'Kunststoffe') return 'plastic';
      if (m.cat === 'Holz & Platten') return 'wood';
      if (m.cat === 'Faserverbund') return 'composite';
      if (m.cat === 'Metalle') return 'steel';
    }
    if (/(pla|petg|abs|asa|tpu|pa6|pa12|nylon|pom|pc|kunststoff|plastic)/i.test(k)) return 'plastic';
    return 'steel';
  }
  function resolveCapItem(cap, doc = App.doc) {
    if (!doc || !Array.isArray(doc.items)) return null;
    if (cap && cap.partId) {
      const direct = doc.items.find((x) => x.id === cap.partId);
      if (direct) return direct;
      const found = Model.find(doc, cap.partId);
      if (found && found.item) return found.item;
    }
    const solids = Model.activeItems(doc).filter((it) => it && it.role !== 'hole' && !(typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id)));
    return (cap && typeof cap.partIdx === 'number' && solids[cap.partIdx]) || null;
  }
  function itemExplicitMaterial(it, doc = App.doc) {
    if (it && it.mat) return String(it.mat);
    if (it && it.kind === 'ref' && it.p && it.p.docId && typeof Model.resolveDoc === 'function') {
      const rd = Model.resolveDoc(it.p.docId);
      if (rd) {
        if (rd.settings && rd.settings.material) return String(rd.settings.material);
        const solids = Model.activeItems(rd).filter((x) => x && x.role !== 'hole');
        const mats = [...new Set(solids.map((x) => x.mat).filter(Boolean))];
        if (mats.length === 1) return String(mats[0]);
      }
    }
    if (doc && doc.settings && doc.settings.material) return String(doc.settings.material);
    return null;
  }
  function capMaterialInfo(cap, doc = App.doc) {
    const it = resolveCapItem(cap, doc);
    const matKey = itemExplicitMaterial(it, doc);
    return { item: it, matKey, pattern: hatchPatternForMaterial(matKey) };
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
      d.balloons = (d.balloons || []).filter((x) => x.view !== id);
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
  function bomTableRect(sh = dwg(), frame, tb, bom = bomData) {
    if (!(sh && sh.bomTable && sh.bomTable.show)) return null;
    const rows = bomItems(bom);
    const w = tb.w;
    const cPos = Math.round(w * (16 / 180) * 10) / 10;
    const cQty = Math.round(w * (20 / 180) * 10) / 10;
    const cMat = Math.round(w * (46 / 180) * 10) / 10;
    const cName = w - cPos - cQty - cMat;
    const hh = 7.0, rh = 6.2;
    const h = hh + Math.max(1, rows.length) * rh;
    let x = frame.x + frame.w - w;
    let y = Math.max(frame.y, frame.y + frame.h - tb.h - h);
    if (dragBom && dragBom.curPos) {
      x = clamp(dragBom.curPos[0], frame.x, frame.x + frame.w - w);
      y = clamp(dragBom.curPos[1], frame.y, frame.y + frame.h - h);
    } else if (Array.isArray(sh.bomTable.pos) && sh.bomTable.pos.length >= 2) {
      x = clamp(Number(sh.bomTable.pos[0]) || 0, frame.x, frame.x + frame.w - w);
      y = clamp(Number(sh.bomTable.pos[1]) || 0, frame.y, frame.y + frame.h - h);
    }
    return { x, y, w, h, hh, rh, cols: [cPos, cQty, cName, cMat], rows };
  }
  function layoutSheet(sh, s, G, extras, secGeos, area, bomRect = null, auxGeos = []) {
    const gap = 22;
    const views = {};
    const occ = [];
    const addOcc = (px, py, vw, vh, pad = 8, padBot = 10) => occ.push([px - pad, py - pad, px + vw + pad, py + vh + padBot]);
    if (bomRect) occ.push([bomRect.x - 4, bomRect.y - 4, bomRect.x + bomRect.w + 4, bomRect.y + bomRect.h + 4]);
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
    const isUS = normProjection(sh.projection) === 'us';
    let x0 = area.x + 12, y0 = area.y + 12, fw = 0, fh = 0, lw = 0, th = 0, totalW = 0, totalH = 0;
    let frontX = x0, frontY = y0;
    if (main) {
      const sf = scOf(oF, s), st = scOf(oT, s), sl = scOf(oL, s);
      fw = Math.max(G.front ? G.front.w * sf : 0, G.top ? G.top.w * st : 0);
      fh = Math.max(G.front ? G.front.h * sf : 0, G.left ? G.left.h * sl : 0);
      lw = G.left ? G.left.w * sl : 0; th = G.top ? G.top.h * st : 0;
      const gapX = G.left && fw > 0 ? gap : 0;
      const gapY = G.top && fh > 0 ? gap : 0;
      totalW = fw + gapX + lw; totalH = fh + gapY + th;
      const room = extras.length ? 0.68 : (secGeos.length || auxGeos.length) ? 0.72 : 1;
      x0 = area.x + Math.max(12, (area.w * room - totalW) / 2);
      y0 = area.y + Math.max(12, (area.h - totalH) / 2);
      frontX = x0 + (isUS && G.left ? lw + gapX : 0);
      frontY = y0 + (isUS && G.top ? th + gapY : 0);
      if (G.front) place('front', G.front, sf, frontX, frontY, oF, viewLabel('front', sh), false);
      if (G.left) {
        const lx = isUS ? x0 : x0 + fw + gapX;
        const ly = G.front ? (sl === sf && Math.abs(G.front.h - G.left.h) <= 0.1 ? frontY + (G.front.box[3] - G.left.box[3]) * sf : frontY + (fh - G.left.h * sl) / 2) : frontY;
        place('left', G.left, sl, lx, ly, oL, viewLabel('left', sh), false);
        if (G.front && sl === sf && Math.abs(G.front.h - G.left.h) <= 0.1) views.left.oy = views.front.oy;
      }
      if (G.top) {
        const tx = G.front && (st !== sf || Math.abs(G.front.w - G.top.w) > 0.1) ? frontX + (fw - G.top.w * st) / 2 : frontX;
        const ty = isUS ? y0 : y0 + fh + gapY;
        place('top', G.top, st, tx, ty, oT, viewLabel('top', sh), false);
        if (G.front && st === sf && Math.abs(G.front.w - G.top.w) <= 0.1) views.top.ox = views.front.ox;
      }
      if (!isUS && extras.length === 1 && G.front && G.left && G.top && !secGeos.length && !auxGeos.length) {
        const rx = x0 + fw + gap, ry = y0 + fh + gap;
        const rawH = area.y + area.h - ry - 10;
        const maxH = bomRect ? Math.min(rawH, bomRect.y - ry - 6) : rawH;
        placeExtra(extras[0], rx, ry, area.x + area.w - rx - 6, maxH > 24 ? maxH : rawH);
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
    const placeFreeOrtho = (vw, vh, pcx, pcy, extraCands = []) => {
      const cands = [...extraCands];
      if (isUS) {
        cands.push([x0 + totalW + gap, y0]);
        if (G.top && G.left) cands.push([x0, y0]);
      } else {
        if (G.left) cands.push([x0 + fw + gap + lw + gap, y0]);
        if (G.front || G.top) cands.push([x0 + fw + gap, y0 + fh + gap]);
        if (G.top) cands.push([x0, y0 + fh + gap + th + gap]);
        cands.push([x0 + fw + gap, y0]);
      }
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
      if (best) return best;
      fits = false;
      return [Math.min(area.x + area.w - vw - 8, x0 + fw + (G.left ? gap + lw + gap : gap)), area.y + 12];
    };
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
        [px, py] = placeFreeOrtho(vw, vh, pcx, pcy);
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
    for (const { aux, geo, opts: aOpts } of auxGeos) {
      const asc = scOf(aOpts, s);
      const vw = geo.w * asc, vh = geo.h * asc;
      let px = null, py = null;
      if (dragView && dragView.kind === 'aux' && dragView.auxId === aux.id && dragView.curPos) {
        px = dragView.curPos[0]; py = dragView.curPos[1];
      } else if (Array.isArray(aux.pos) && aux.pos.length >= 2) {
        px = aux.pos[0]; py = aux.pos[1];
      } else {
        const pv = views[aux.parent];
        const sp = auxViewSpec(aux);
        const mid = [(aux.a[0] + aux.b[0]) * 0.5, (aux.a[1] + aux.b[1]) * 0.5];
        const pcx = pv ? pv.ox + ((pv.geo.box[0] + pv.geo.box[2]) * 0.5) * pv.s : area.x + area.w * 0.5;
        const pcy = pv ? pv.oy - ((pv.geo.box[1] + pv.geo.box[3]) * 0.5) * pv.s : area.y + area.h * 0.5;
        const extraCands = [];
        if (pv) {
          const mp = pv.geo.breakMap ? pv.geo.breakMap.mapPt(mid) : mid;
          const ms = [pv.ox + mp[0] * pv.s, pv.oy - mp[1] * pv.s];
          const camS = [sp.cam2[0], -sp.cam2[1]];
          for (const dist of [Math.max(vw, vh) * 0.7 + 24, Math.max(vw, vh) * 0.9 + 42]) {
            extraCands.push([ms[0] + camS[0] * dist - vw * 0.5, ms[1] + camS[1] * dist - vh * 0.5]);
          }
        }
        [px, py] = placeFreeOrtho(vw, vh, pcx, pcy, extraCands);
      }
      const key = 'aux_' + aux.id;
      views[key] = {
        geo, s: asc,
        ox: px - geo.box[0] * asc,
        oy: py + geo.box[3] * asc,
        isAux: true,
        aux,
        opts: aOpts,
        noDims: false,
        is3d: false,
        customScale: typeof aOpts.scale === 'number' && aOpts.scale > 0,
        label: viewLabel(key, sh),
        rect: [px, py, px + vw, py + vh],
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
    const bomRect = bomTableRect(sh, frame, tb, bomData);
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
    const auxGeos = (sh.auxViews || []).map((aux) => ({ aux, geo: viewGeom('aux_' + aux.id, sh), opts: viewOpts(sh, 'aux_' + aux.id) })).filter((x) => x.geo);
    const oF = viewOpts(sh, 'front'), oT = viewOpts(sh, 'top'), oL = viewOpts(sh, 'left');
    const scOf = (opts, baseS) => (typeof opts.scale === 'number' && opts.scale > 0 ? opts.scale : baseS);
    const main = G.front || G.top || G.left;
    let s = 1;
    const gap = 22;
    const needW = (sc) => Math.max(G.front ? G.front.w * scOf(oF, sc) : 0, G.top ? G.top.w * scOf(oT, sc) : 0) + (G.left ? gap + G.left.w * scOf(oL, sc) : 0);
    const needH = (sc) => Math.max(G.front ? G.front.h * scOf(oF, sc) : 0, G.left ? G.left.h * scOf(oL, sc) : 0) + (G.top ? gap + G.top.h * scOf(oT, sc) : 0);
    const isUS = normProjection(sh.projection) === 'us';
    const extraRoom = extras.length > 1 || (extras.length && (!G.top || isUS)) ? 0.35 : 0;
    let views = {};
    if (!secGeos.length && !auxGeos.length) {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main) { s = 1; break; }
          if (needW(sc) + 24 <= area.w * (1 - extraRoom) && needH(sc) + 24 <= area.h) { s = sc; break; }
        }
      } else s = +sh.scale || 1;
      views = layoutSheet(sh, s, G, extras, [], area, bomRect, []).views;
    } else {
      if (sh.scale === 'auto') {
        s = SCALES[SCALES.length - 1];
        for (const sc of SCALES) {
          if (!main && !secGeos.length && !auxGeos.length) { s = 1; break; }
          if (main && (needW(sc) + 24 > area.w * 0.78 || needH(sc) + 24 > area.h)) continue;
          const tryLay = layoutSheet(sh, sc, G, extras, secGeos, area, bomRect, auxGeos);
          if (tryLay.fits) { s = sc; views = tryLay.views; break; }
        }
        if (!Object.keys(views).length) views = layoutSheet(sh, s, G, extras, secGeos, area, bomRect, auxGeos).views;
      } else {
        s = +sh.scale || 1;
        views = layoutSheet(sh, s, G, extras, secGeos, area, bomRect, auxGeos).views;
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
      if (bomRect) occupied.push([bomRect.x - 4, bomRect.y - 4, bomRect.w + 8, bomRect.h + 8]);
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
    return { W, H, frame, tb, area, s, views, bomRect };
  }
  const toSheetRaw = (v, dp) => [v.ox + dp[0] * v.s, v.oy - dp[1] * v.s];
  const toSheet = (v, p) => {
    const mp = (v && v.geo && v.geo.breakMap) ? v.geo.breakMap.mapPt(p) : p;
    return [v.ox + mp[0] * v.s, v.oy - mp[1] * v.s];
  };
  const toViewRaw = (v, P) => [(P[0] - v.ox) / v.s, (v.oy - P[1]) / v.s];
  const toView = (v, P) => {
    const dp = [(P[0] - v.ox) / v.s, (v.oy - P[1]) / v.s];
    return (v && v.geo && v.geo.breakMap) ? v.geo.breakMap.unmapPt(dp) : dp;
  };

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
    if (dim.type === 'arclen') return Math.abs(Number(dim.r || 0) * (Number(dim.a1 || 0) - Number(dim.a0 || 0)));
    if (dim.type === 'lin') {
      if (dim.dir === 'h') return Math.abs(dim.b[0] - dim.a[0]);
      if (dim.dir === 'v') return Math.abs(dim.b[1] - dim.a[1]);
      return Math.hypot(dim.b[0] - dim.a[0], dim.b[1] - dim.a[1]);
    }
    return 0;
  }
  function dimLabelParts(dim, nominalMm, st = sheetDimStyle()) {
    const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
    const dualLabel = (st && st.dual) ? fmtDualSecondary(nominalMm, st) : '';
    if (dim.type === 'dia' || dim.type === 'rad') {
      if (dim.threadLabel) return { mainLabel: countPrefix + dim.threadLabel, dualLabel: '', prefix: '', isThread: true };
      const prefix = dim.type === 'dia' ? 'Ø' : 'R';
      return { mainLabel: countPrefix + prefix + fmtDim(nominalMm, st), dualLabel, prefix, isThread: false };
    }
    if (dim.type === 'arclen') {
      return { mainLabel: countPrefix + '⌒' + fmtDim(nominalMm, st), dualLabel, prefix: '⌒', isThread: false };
    }
    return { mainLabel: fmtDim(nominalMm, st), dualLabel, prefix: '', isThread: false };
  }
  function findDimById(id, sh = dwg(), lay = layout) {
    if (!id || !sh) return null;
    const list = lay ? autoDimList(sh, lay) : (sh.dims || []).filter((x) => !x.auto);
    const dim = list.find((x) => x.id === id);
    if (!dim || !['lin', 'dia', 'rad', 'arclen'].includes(dim.type)) return null;
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
  function measureDimLabel(mainLabel, prefix, tolInfo, TXT, count = 1, dualLabel = '') {
    const dualTxt = dualLabel ? ' ' + dualLabel : '';
    if (!tolInfo) return { totalW: textW(mainLabel + dualTxt, TXT) * 0.92 };
    if (tolInfo.mode === 'sym') return { totalW: textW(`${mainLabel} ±${tolInfo.symStr}${dualTxt}`, TXT) * 0.92 };
    if (tolInfo.mode === 'fit' && (tolInfo.fitShow === 'code' || tolInfo.outOfRange)) {
      return { totalW: textW(`${mainLabel} ${tolInfo.code}${dualTxt}`, TXT) * 0.92 };
    }
    const k = TXT / 3.5;
    const wDual = dualLabel ? textW(dualLabel, TXT) * 0.92 : 0;
    const gap = round(0.8 * k, 2);
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = round(2.8 * k, 2);
      const countPrefix = count > 1 ? count + '× ' : '';
      const wLim = Math.max(textW(countPrefix + prefix + tolInfo.maxStr, LIM), textW(prefix + tolInfo.minStr, LIM)) * 0.95;
      return { totalW: wLim + (wDual ? gap + wDual : 0) };
    }
    const SUB = round(2.3 * k, 2);
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    return { totalW: wMain + gap + wStack + (wDual ? gap + wDual : 0) };
  }
  function emitDimTexts(texts, cx, cy, ang, dim, mainLabel, prefix, tolInfo, TXT, isLost = !!(dim && dim.lost), dualLabel = '') {
    const rad = (ang * Math.PI) / 180;
    const exX = Math.cos(rad), exY = Math.sin(rad);
    const euX = Math.sin(rad), euY = -Math.cos(rad);
    const pt = (lx, ly) => [cx + exX * lx + euX * ly, cy + exY * lx + euY * ly];
    const base = { rot: ang, id: dim.id, view: dim.view, ...(isLost ? { lost: true } : {}) };
    const dualTxt = dualLabel ? ' ' + dualLabel : '';
    if (!tolInfo) {
      texts.push({ ...base, x: cx, y: cy, t: mainLabel + dualTxt, size: TXT, anchor: 'middle', cls: 'dimtext' });
      return;
    }
    if (tolInfo.mode === 'sym') {
      texts.push({ ...base, x: cx, y: cy, t: `${mainLabel} ±${tolInfo.symStr}${dualTxt}`, size: TXT, anchor: 'middle', cls: 'dimtext', tolPart: 'sym' });
      return;
    }
    if (tolInfo.mode === 'fit' && (tolInfo.fitShow === 'code' || tolInfo.outOfRange)) {
      texts.push({ ...base, x: cx, y: cy, t: `${mainLabel} ${tolInfo.code}${dualTxt}`, size: TXT, anchor: 'middle', cls: 'dimtext', tolPart: 'fit' });
      return;
    }
    const k = TXT / 3.5;
    const gap = round(0.8 * k, 2);
    const wDual = dualLabel ? textW(dualLabel, TXT) * 0.92 : 0;
    if (tolInfo.mode === 'limits' || (tolInfo.mode === 'fit' && tolInfo.fitShow === 'limits')) {
      const LIM = round(2.8 * k, 2);
      const countPrefix = dim.count > 1 ? dim.count + '× ' : '';
      if (dualLabel) {
        const wLim = Math.max(textW(countPrefix + prefix + tolInfo.maxStr, LIM), textW(prefix + tolInfo.minStr, LIM)) * 0.95;
        const x0 = -(wLim + gap + wDual) / 2;
        const pTop = pt(x0 + wLim * 0.5, 2.7 * k), pBot = pt(x0 + wLim * 0.5, 0), pDual = pt(x0 + wLim + gap, 0.1 * k);
        texts.push({ ...base, x: pTop[0], y: pTop[1], t: countPrefix + prefix + tolInfo.maxStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'max' });
        texts.push({ ...base, x: pBot[0], y: pBot[1], t: prefix + tolInfo.minStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'min' });
        texts.push({ ...base, x: pDual[0], y: pDual[1], t: dualLabel, size: TXT, anchor: 'start', cls: 'dimtext dimdual' });
      } else {
        const pTop = pt(0, 2.7 * k), pBot = pt(0, 0);
        texts.push({ ...base, x: pTop[0], y: pTop[1], t: countPrefix + prefix + tolInfo.maxStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'max' });
        texts.push({ ...base, x: pBot[0], y: pBot[1], t: prefix + tolInfo.minStr, size: LIM, anchor: 'middle', cls: 'dimtext dimtol', tolPart: 'min' });
      }
      return;
    }
    const SUB = round(2.3 * k, 2);
    const leftText = (tolInfo.mode === 'fit' && tolInfo.fitShow === 'both') ? `${mainLabel} ${tolInfo.code}` : mainLabel;
    const wMain = textW(leftText, TXT) * 0.92;
    const wStack = Math.max(textW(tolInfo.upStr, SUB), textW(tolInfo.loStr, SUB)) * 0.95;
    const x0 = -(wMain + gap + wStack + (wDual ? gap + wDual : 0)) / 2;
    const pMain = pt(x0, 0.1 * k), pUp = pt(x0 + wMain + gap, 2.0 * k), pLo = pt(x0 + wMain + gap, -0.2 * k);
    texts.push({ ...base, x: pMain[0], y: pMain[1], t: leftText, size: TXT, anchor: 'start', cls: 'dimtext', tolPart: 'main' });
    texts.push({ ...base, x: pUp[0], y: pUp[1], t: tolInfo.upStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'upper' });
    texts.push({ ...base, x: pLo[0], y: pLo[1], t: tolInfo.loStr, size: SUB, anchor: 'start', cls: 'dimtext dimtol', tolPart: 'lower' });
    if (dualLabel) {
      const pDual = pt(x0 + wMain + gap + wStack + gap, 0.1 * k);
      texts.push({ ...base, x: pDual[0], y: pDual[1], t: dualLabel, size: TXT, anchor: 'start', cls: 'dimtext dimdual' });
    }
  }

  // ---------- Bemaßung ----------
  function setDimStyle(patch = {}) {
    const cleanPatch = { ...(patch || {}) };
    if (cleanPatch.dual && isSimpleMode()) {
      UI.toast(T('draw.dimProOnly'), { icon: 'info' });
      delete cleanPatch.dual;
      if (!Object.keys(cleanPatch).length) return null;
    }
    let next = null;
    App.change('Maß-Stil geändert', () => {
      const s = dwg();
      s.dimStyle = normDimStyle({ ...sheetDimStyle(s), ...cleanPatch });
      next = s.dimStyle;
    });
    render();
    Panels.renderRight();
    return next;
  }
  function setDualDims(on) {
    if (on && isSimpleMode()) { UI.toast(T('draw.dimProOnly'), { icon: 'info' }); return false; }
    setDimStyle({ dual: !!on });
    return true;
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
    const b = (v && v.geo && (v.geo.trueBox || v.geo.box)) || [0, 0, 0, 0];
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
    const b = (v && v.geo && (v.geo.trueBox || v.geo.box)) || [0, 0, 0, 0];
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
    const b = (v && v.geo && (v.geo.trueBox || v.geo.box)) || [0, 0, 0, 0];
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
    const b = (v && v.geo && (v.geo.trueBox || v.geo.box)) || [0, 0, 0, 0];
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
    if (dim.type === 'arclen') {
      const hit = viewCirclesPool(v).find((c) => !c.full && c.arc && Math.hypot(c.c[0] - dim.c[0], c.c[1] - dim.c[1]) <= 0.2 && Math.abs(c.r - dim.r) <= 0.2)
        || { c: dim.c, r: dim.r, full: false, arc: [dim.a0, dim.a1] };
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
    if (dim.type === 'ordinate' && dim.origin) {
      return { kind: 'ordinate', origin: makePointRef(v, dim.origin), pts: (dim.pts || []).map((p) => makePointRef(v, p)) };
    }
    return null;
  }
  function resolveCircleRef(v, ref) {
    if (!v || !v.geo || !ref) return null;
    const pool = viewCirclesPool(v);
    const b = v.geo.trueBox || v.geo.box, oldB = ref.box;
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
    const b = v.geo.trueBox || v.geo.box, [x0, y0, x1, y1] = b, oldB = ref.box;
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
    const b = v.geo.trueBox || v.geo.box, oldB = ref.box;
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
    if (dim.type === 'arclen') {
      const c = resolveCircleRef(v, dim.ref);
      if (!c || c.full || !c.arc) return { ...dim, lost: true, lostReason: 'Kreisbogen fehlt' };
      return { ...dim, c: c.c, r: c.r, a0: c.arc[0], a1: c.arc[1], lost: false };
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
    if (dim.type === 'ordinate') {
      const origin = resolvePointRef(v, dim.ref.origin);
      const pts = (dim.ref.pts || []).map((pr) => resolvePointRef(v, pr));
      if (!origin || !pts.length || pts.some((p) => !p)) return { ...dim, lost: true, lostReason: 'Nullpunkt oder Zielpunkt fehlt' };
      return { ...dim, origin, pts, lost: false };
    }
    return { ...dim, lost: false };
  }
  function dimSummaryLabel(dim, st = sheetDimStyle()) {
    if (!dim) return 'Maß';
    if (dim.type === 'dia' || dim.type === 'rad' || dim.type === 'arclen') return dimLabelParts(dim, dimNominal(dim), st).mainLabel;
    if (dim.type === 'lin') return fmtDim(dimNominal(dim), st);
    if (dim.type === 'chamfer') {
      const angTxt = Math.abs(dim.ang - 45) < 0.1 && st.decimals == null ? '45°' : fmtDimAngle(dim.ang, st);
      return `${fmtDim(dim.dist, st)}×${angTxt}`;
    }
    if (dim.type === 'ang') return fmtDimAngle(((dim.a1 - dim.a0) * 180) / Math.PI, st);
    if (dim.type === 'chain') return 'Kettenmaß';
    if (dim.type === 'base') return 'Bezugsmaß';
    if (dim.type === 'ordinate') return T('draw.dimMode.ordinate');
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
      const b = v.geo.trueBox || v.geo.box;
      if (dim.auto === 'width') out.push({ ...dim, type: 'lin', dir: 'h', a: [b[0], b[1]], b: [b[2], b[1]], off: typeof dim.off === 'number' && isFinite(dim.off) ? dim.off : -(9 / v.s) });
      if (dim.auto === 'height') out.push({ ...dim, type: 'lin', dir: 'v', a: [b[0], b[1]], b: [b[0], b[3]], off: typeof dim.off === 'number' && isFinite(dim.off) ? dim.off : -(9 / v.s) });
      if (dim.auto === 'depth') out.push({ ...dim, type: 'lin', dir: 'h', a: [b[0], b[1]], b: [b[2], b[1]], off: typeof dim.off === 'number' && isFinite(dim.off) ? dim.off : -(9 / v.s) });
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
          const mt = (v.geo.threads || []).find((th) => th.type === 'end' && Math.hypot(th.c[0] - best.c[0], th.c[1] - best.c[1]) < 0.25 && (Math.abs(th.r - best.r) < 0.45 || Math.abs(th.rThread - best.r) < 0.45));
          const subId = dim.id + '_' + Math.round(best.r * 200);
          const subTol = dim.tols && dim.tols[subId] ? dim.tols[subId] : undefined;
          const thLbl = mt ? ((mt.source === 'cosmetic' || mt.blind0 || mt.blind1) ? `${mt.size} × ${fmtDim(mt.length, st)}` : `${mt.size}`) : null;
          const item = { ...dim, id: subId, type: 'dia', c: best.c, r: best.r, ang, count: g.length, ...(thLbl ? { threadLabel: thLbl } : {}) };
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
      const { mainLabel, dualLabel, prefix } = dimLabelParts(dim, val, st);
      const tolInfo = resolveDimTol(dim, val);
      emitDimTexts(texts, tx, ty, ang, dim, mainLabel, prefix, tolInfo, TXT, isLost, dualLabel);
    } else {
      texts.push({ x: tx, y: ty, t: fmtDimWithDual(val, st), size: TXT, rot: ang, anchor: 'middle', id, cls: 'dimtext', ...lostObj });
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
      const bx = v.geo.box, TL = toSheetRaw(v, [bx[0], bx[3]]), BR = toSheetRaw(v, [bx[2], bx[1]]), M = 3;
      const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
      const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
      const tEx = Math.min(tx, ty);
      const autoLead = tEx > 0 && tEx < 24 ? Math.max(5, tEx) : 7;
      const lead = typeof dim.lead === 'number' && isFinite(dim.lead) && dim.lead > 0 ? dim.lead : autoLead;
      const out = [P[0] + ux * lead, P[1] + uy * lead];
      const nomVal = dim.type === 'dia' ? dim.r * 2 : dim.r;
      const { mainLabel, dualLabel, prefix } = dimLabelParts(dim, nomVal, st);
      const tolInfo = resolveDimTol(dim, nomVal);
      const { totalW } = measureDimLabel(mainLabel, prefix, tolInfo, TXT, dim.count, dualLabel);
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
      emitDimTexts(texts, (out[0] + tail[0]) / 2, out[1] - TGAP, 0, dim, mainLabel, prefix, tolInfo, TXT, isLost, dualLabel);
    } else if (dim.type === 'chamfer') {
      const P = toSheet(v, dim.p);
      const ux = dim.dir[0], uy = -dim.dir[1];
      const bx = v.geo.box, TL = toSheetRaw(v, [bx[0], bx[3]]), BR = toSheetRaw(v, [bx[2], bx[1]]), M = 3.5;
      const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
      const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
      const tEx = Math.min(tx, ty);
      const autoLead = tEx > 0 && tEx < 24 ? Math.max(6, tEx) : 8;
      const lead = typeof dim.lead === 'number' && isFinite(dim.lead) && dim.lead > 0 ? dim.lead : autoLead;
      const out = [P[0] + ux * lead, P[1] + uy * lead];
      const angTxt = Math.abs(dim.ang - 45) < 0.1 && st.decimals == null ? '45°' : fmtDimAngle(dim.ang, st);
      const label = `${fmtDimWithDual(dim.dist, st)}×${angTxt}`;
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
    } else if (dim.type === 'arclen') {
      const a0 = dim.a0, a1 = dim.a1, span = a1 - a0;
      if (!(span > 1e-4) || !(dim.r > 1e-4)) return;
      const off = Number.isFinite(Number(dim.off)) ? Number(dim.off) : (6 / v.s);
      const rModel = Math.max(2 / v.s, dim.r + off);
      const R = rModel * v.s;
      const VC = toSheet(v, dim.c);
      const sgn = rModel >= dim.r ? 1 : -1;
      for (const ang of [a0, a1]) {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const s0 = dim.r + sgn * (GAPX / v.s);
        const s1 = rModel + sgn * (EXT / v.s);
        lines.push({ pts: [toSheet(v, [dim.c[0] + ux * s0, dim.c[1] + uy * s0]), toSheet(v, [dim.c[0] + ux * s1, dim.c[1] + uy * s1])], cls: 'dim', id: dim.id, ...lostObj });
      }
      const nA0 = ((a0 % TWO_PI) + TWO_PI) % TWO_PI;
      const nA1 = nA0 + span;
      const aPts = arcPts(dim.c, rModel, a0, a1).map((q) => toSheet(v, q));
      lines.push({ pts: aPts, arc: { c: VC, r: R, a: [nA0, nA1 <= TWO_PI ? nA1 : nA1 - TWO_PI] }, cls: 'dim', id: dim.id, ...lostObj });
      const P0 = [VC[0] + R * Math.cos(a0), VC[1] - R * Math.sin(a0)];
      const P1 = [VC[0] + R * Math.cos(a1), VC[1] - R * Math.sin(a1)];
      const inside = (aStyle === 'slash' || aStyle === 'dot') ? true : span * R > AR * 2.6;
      const from0 = [P0[0] - Math.sin(a0) * AR, P0[1] - Math.cos(a0) * AR];
      const from1 = [P1[0] + Math.sin(a1) * AR, P1[1] + Math.cos(a1) * AR];
      arrowHead(lines, P0, from0, AR, inside, dim.id, null, aStyle, null, null, isLost);
      arrowHead(lines, P1, from1, AR, inside, dim.id, null, aStyle, null, null, isLost);
      if (!inside) {
        const extA = (AR * 2.4) / R;
        lines.push(
          { pts: arcPts(dim.c, rModel, a0 - extA, a0).map((q) => toSheet(v, q)), cls: 'dim', id: dim.id, ...lostObj },
          { pts: arcPts(dim.c, rModel, a1, a1 + extA).map((q) => toSheet(v, q)), cls: 'dim', id: dim.id, ...lostObj }
        );
      }
      const val = dim.r * span;
      const { mainLabel, dualLabel, prefix } = dimLabelParts(dim, val, st);
      const tolInfo = resolveDimTol(dim, val);
      const am = (a0 + a1) * 0.5;
      const radOut = R + Math.max(3.2, TXT * 0.95);
      const tx = VC[0] + Math.cos(am) * radOut;
      const ty = VC[1] - Math.sin(am) * radOut + TXT * 0.34;
      emitDimTexts(texts, tx, ty, 0, dim, mainLabel, prefix, tolInfo, TXT, isLost, dualLabel);
    } else if (dim.type === 'ordinate') {
      const originPt = dim.origin;
      const pts = [...(dim.pts || [])];
      if (!originPt || !pts.length) return;
      const O = toSheet(v, originPt);
      const origR = clamp(TXT * 0.36, 0.9, 1.8);
      const minGap = Math.max(TXT * 1.15, 3.8);
      const axis = dim.dir === 'v' ? 1 : 0;
      const deltas = pts.map((p) => p[axis] - originPt[axis]);
      const useSigned = deltas.some((d) => d > 1e-4) && deltas.some((d) => d < -1e-4);
      const fmtOrd = (delta) => {
        const sVal = useSigned ? delta : Math.abs(delta);
        if (Math.abs(sVal) < 1e-6) return '0';
        return (sVal < 0 ? '\u2212' : '') + fmtDimWithDual(Math.abs(sVal), st);
      };
      const entries = [
        { isOrigin: true, P: O, coord: dim.dir === 'v' ? O[1] : O[0], lCoord: 0, label: '0' },
        ...pts.map((p, i) => {
          const S = toSheet(v, p);
          return { isOrigin: false, P: S, coord: dim.dir === 'v' ? S[1] : S[0], lCoord: 0, label: fmtOrd(deltas[i]) };
        }),
      ];
      entries.sort((a, b) => a.coord - b.coord);
      const oi = entries.findIndex((e) => e.isOrigin);
      entries[oi].lCoord = entries[oi].coord;
      for (let i = oi + 1; i < entries.length; i++) {
        entries[i].lCoord = Math.max(entries[i].coord, entries[i - 1].lCoord + minGap);
      }
      for (let i = oi - 1; i >= 0; i--) {
        entries[i].lCoord = Math.min(entries[i].coord, entries[i + 1].lCoord - minGap);
      }
      if (dim.dir === 'h') {
        const yl = toSheet(v, [0, dim.linePos])[1];
        const outSign = yl >= O[1] ? 1 : -1;
        for (const e of entries) {
          const sgn = Math.sign(yl - e.P[1]) || outSign;
          const start = [e.P[0], e.P[1] + sgn * GAPX];
          const lPts = (Math.abs(e.lCoord - e.P[0]) > 0.15 && Math.abs(yl - e.P[1]) > 5.5)
            ? [start, [e.P[0], yl - sgn * 4.5], [e.lCoord, yl - sgn * 1.6], [e.lCoord, yl]]
            : [start, [e.lCoord, yl]];
          lines.push({ pts: lPts, cls: 'dim', id: dim.id, ...lostObj });
          if (e.isOrigin) lines.push({ circle: [e.lCoord, yl, origR], cls: 'dim', id: dim.id, ...lostObj });
          const tx = e.lCoord + TXT * 0.34;
          const ty = yl + outSign * (e.isOrigin ? origR + 1.4 : 1.4);
          texts.push({ x: tx, y: ty, t: e.label, size: TXT, rot: -90, anchor: outSign > 0 ? 'end' : 'start', id: dim.id, view: dim.view, cls: 'dimtext', ...lostObj });
        }
      } else {
        const xl = toSheet(v, [dim.linePos, 0])[0];
        const outSign = xl <= O[0] ? -1 : 1;
        for (const e of entries) {
          const sgn = Math.sign(xl - e.P[0]) || outSign;
          const start = [e.P[0] + sgn * GAPX, e.P[1]];
          const lPts = (Math.abs(e.lCoord - e.P[1]) > 0.15 && Math.abs(xl - e.P[0]) > 5.5)
            ? [start, [xl - sgn * 4.5, e.P[1]], [xl - sgn * 1.6, e.lCoord], [xl, e.lCoord]]
            : [start, [xl, e.lCoord]];
          lines.push({ pts: lPts, cls: 'dim', id: dim.id, ...lostObj });
          if (e.isOrigin) lines.push({ circle: [xl, e.lCoord, origR], cls: 'dim', id: dim.id, ...lostObj });
          const tx = xl + outSign * (e.isOrigin ? origR + 1.4 : 1.4);
          const ty = e.lCoord + TXT * 0.34;
          texts.push({ x: tx, y: ty, t: e.label, size: TXT, rot: 0, anchor: outSign < 0 ? 'end' : 'start', id: dim.id, view: dim.view, cls: 'dimtext', ...lostObj });
        }
      }
    }
  }
  function fmtDim(v, st = sheetDimStyle()) {
    if (typeof v !== 'number' || !isFinite(v)) return '–';
    const dec = (st && st.decimals != null) ? st.decimals : FMT.dec;
    return fmtFixed(Units.fromMM(v), dec);
  }
  function fmtDualSecondary(mmVal, st = sheetDimStyle()) {
    if (typeof mmVal !== 'number' || !isFinite(mmVal)) return '';
    if (Units.key() === 'in') {
      const dec = (st && st.decimals != null) ? st.decimals : FMT.dec;
      return `[${fmtFixed(mmVal, dec)}]`;
    }
    const dec = clamp(Math.round(Number(st && st.dualDecimals != null ? st.dualDecimals : 3)), 1, 4);
    let v = round(mmVal / 25.4, dec);
    if (Object.is(v, -0)) v = 0;
    return `[${v.toFixed(dec)}]`;
  }
  function fmtDimWithDual(mmVal, st = sheetDimStyle()) {
    const pri = fmtDim(mmVal, st);
    return (st && st.dual) ? `${pri} ${fmtDualSecondary(mmVal, st)}` : pri;
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
  function buildHatchLines(v, sec, lines, sh = dwg()) {
    const caps = (v.geo && v.geo.caps) || [];
    if (!caps.length) return;
    const paperStep = hatchStepSheet(v.s, v.geo);
    const useMat = materialHatchActive(sh);
    for (let capIdx = 0; capIdx < caps.length; capIdx++) {
      const cap = caps[capIdx];
      const loops = [cap.outer, ...(cap.holes || [])].filter((lp) => lp && lp.length >= 3);
      if (!loops.length) continue;
      const mi = useMat ? capMaterialInfo(cap) : { item: null, matKey: null, pattern: 'steel' };
      const pat = HATCH_PATTERNS[mi.pattern] || HATCH_PATTERNS.steel;
      const odd = cap.partIdx % 2 === 1;
      const angles = odd ? pat.flipAngles : pat.angles;
      const effModelStep = (paperStep * pat.stepMul) / (v.s || 1);
      const phase = (odd && pat.oddPhase) ? pat.oddPhase * effModelStep : 0;
      const pairGap = pat.pairOff > 0 ? (paperStep * pat.pairOff) / (v.s || 1) : 0;
      const partId = cap.partId || (mi.item ? mi.item.id : '');
      for (const deg of angles) {
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
        const k0 = Math.ceil((bMin + 1e-6 - phase) / effModelStep);
        const k1 = Math.floor((bMax - 1e-6 - phase) / effModelStep);
        const bs = [];
        if (k0 <= k1) {
          const kStart = pairGap > 0 ? k0 - 1 : k0;
          for (let k = kStart; k <= k1; k++) {
            const b0 = k * effModelStep + phase;
            if (b0 >= bMin + 1e-6 && b0 <= bMax - 1e-6) bs.push({ b0, k });
            if (pairGap > 0) {
              const b2 = b0 + pairGap;
              if (b2 >= bMin + 1e-6 && b2 <= bMax - 1e-6) bs.push({ b0: b2, k });
            }
          }
        }
        if (!bs.length) bs.push({ b0: (bMin + bMax) * 0.5, k: 0 });
        for (const { b0, k } of bs) {
          const isDashed = !!(pat.altDash && (Math.abs(k) % 2 === 1));
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
            const emitSeg = (S0, S1) => {
              const segs = (v.geo && v.geo.breakMap)
                ? clipSegByBreaks(S0, S1, v.geo.breakMap.hCuts, v.geo.breakMap.vCuts)
                : [[S0, S1]];
              for (const [q0, q1] of segs) {
                if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) > 1e-4) {
                  lines.push({
                    pts: [toSheet(v, q0), toSheet(v, q1)],
                    cls: 'hatch',
                    extraCls: isDashed ? 'hatch-dash' : '',
                    dashed: isDashed,
                    hatchPat: pat.key,
                    matKey: mi.matKey || '',
                    partId,
                    id: sec.id,
                    secId: sec.id,
                    capIdx,
                    secType: sec.type || 'full',
                  });
                }
              }
            };
            if (cap.strip) {
              const clipped = clipSegStrip(P0, P1, cap.strip.ax, cap.strip.ay, cap.strip.lo, cap.strip.hi);
              if (clipped) emitSeg(clipped[0], clipped[1]);
            } else if (cap.clipPoly) {
              for (const sub of clipSegPolygon(P0, P1, cap.clipPoly, true)) emitSeg(sub[0], sub[1]);
            } else {
              emitSeg(P0, P1);
            }
          }
        }
      }
    }
  }
  function drawSectionLine(v, sec, lines, texts) {
    const type = (sec && sec.type) || 'full';
    const secType = type;
    if (type === 'breakout') {
      if (!Array.isArray(sec.region) || sec.region.length < 3) return;
      const bPoly = makeBreakPoly(sec.region);
      if (bPoly.length < 3) return;
      const pts = bPoly.map((p) => toSheet(v, p));
      pts.push([...pts[0]]);
      lines.push({ pts, cls: 'breakline', id: sec.id, secId: sec.id, secType });
      let tr = pts[0];
      for (const p of pts) if (p[0] - p[1] > tr[0] - tr[1]) tr = p;
      texts.push({ x: tr[0] + 3.2, y: tr[1] - 1.5, t: sec.label, size: 4.5, anchor: 'middle', id: sec.id, secId: sec.id, cls: 'cutlabel', secType });
      return;
    }
    const vf = sectionPlaneSpec(sec);
    const lookSheet = [vf.look2[0], -vf.look2[1]];
    const b = v.geo.box;
    const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
    const corners = [TL, [BR[0], TL[1]], BR, [TL[0], BR[1]]];
    const endLen = 5;
    const shaft = 8;
    const drawArrowEnd = (EP, ux, uy, outU) => {
      const tail = [EP[0] - lookSheet[0] * shaft, EP[1] - lookSheet[1] * shaft];
      lines.push({ pts: [tail, EP], cls: 'dim', id: sec.id, secId: sec.id, secType });
      arrowHead(lines, EP, tail, 3.2, true, sec.id, sec.id, 'filled');
      const lx = tail[0] - lookSheet[0] * 1.2 + ux * outU * 3.2;
      const ly = tail[1] - lookSheet[1] * 1.2 + uy * outU * 3.2 + 1.5;
      texts.push({ x: lx, y: ly, t: sec.label, size: 4.5, anchor: 'middle', id: sec.id, secId: sec.id, cls: 'cutlabel', secType });
    };
    if (type === 'stepped') {
      const rawPts = Array.isArray(sec.pts) && sec.pts.length >= 2 ? sec.pts : [sec.a, sec.b];
      const S = rawPts.map((p) => toSheet(v, p));
      if (S.length < 2) return;
      const s0 = S[0], s1 = S[1];
      let d0x = s1[0] - s0[0], d0y = s1[1] - s0[1], L0 = Math.hypot(d0x, d0y);
      if (L0 < 1e-3) return;
      const u0x = d0x / L0, u0y = d0y / L0;
      const sn1 = S[S.length - 2], sn2 = S[S.length - 1];
      let dnx = sn2[0] - sn1[0], dny = sn2[1] - sn1[1], Ln = Math.hypot(dnx, dny);
      if (Ln < 1e-3) { dnx = d0x; dny = d0y; Ln = L0; }
      const unx = dnx / Ln, uny = dny / Ln;
      let tMin0 = Infinity, tMaxN = -Infinity;
      for (const c of corners) {
        const t0 = (c[0] - s0[0]) * u0x + (c[1] - s0[1]) * u0y;
        if (t0 < tMin0) tMin0 = t0;
        const tn = (c[0] - sn1[0]) * unx + (c[1] - sn1[1]) * uny;
        if (tn > tMaxN) tMaxN = tn;
      }
      const sStart = Math.min(0, tMin0 - 5), sEnd = Math.max(Ln, tMaxN + 5);
      const E1 = [s0[0] + u0x * sStart, s0[1] + u0y * sStart];
      const E2 = [sn1[0] + unx * sEnd, sn1[1] + uny * sEnd];
      const poly = [E1, ...S.slice(1, -1), E2];
      lines.push({ pts: poly, cls: 'cutline', id: sec.id, secId: sec.id, secType });
      lines.push({ pts: [E1, [E1[0] + u0x * endLen, E1[1] + u0y * endLen]], cls: 'cutend', id: sec.id, secId: sec.id, secType });
      lines.push({ pts: [[E2[0] - unx * endLen, E2[1] - uny * endLen], E2], cls: 'cutend', id: sec.id, secId: sec.id, secType });
      for (let k = 1; k < poly.length - 1; k++) {
        const P = poly[k], prev = poly[k - 1], next = poly[k + 1];
        const lA = Math.hypot(prev[0] - P[0], prev[1] - P[1]);
        const lB = Math.hypot(next[0] - P[0], next[1] - P[1]);
        if (lA > 1e-3) {
          const kA = Math.min(3.5, lA * 0.45) / lA;
          lines.push({ pts: [[P[0] + (prev[0] - P[0]) * kA, P[1] + (prev[1] - P[1]) * kA], P], cls: 'cutend', id: sec.id, secId: sec.id, secType });
        }
        if (lB > 1e-3) {
          const kB = Math.min(3.5, lB * 0.45) / lB;
          lines.push({ pts: [P, [P[0] + (next[0] - P[0]) * kB, P[1] + (next[1] - P[1]) * kB]], cls: 'cutend', id: sec.id, secId: sec.id, secType });
        }
      }
      drawArrowEnd(E1, u0x, u0y, -1);
      drawArrowEnd(E2, unx, uny, 1);
      return;
    }
    const A0 = toSheet(v, sec.a), B0 = toSheet(v, sec.b);
    const dx = B0[0] - A0[0], dy = B0[1] - A0[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-3) return;
    const ux = dx / L, uy = dy / L;

    let tMin = Infinity, tMax = -Infinity;
    for (const c of corners) {
      const t = (c[0] - A0[0]) * ux + (c[1] - A0[1]) * uy;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
    const sStart = Math.min(0, tMin - 5), sEnd = Math.max(L, tMax + 5);
    const E1 = [A0[0] + ux * sStart, A0[1] + uy * sStart];
    const E2 = [A0[0] + ux * sEnd, A0[1] + uy * sEnd];
    if (type === 'half' && sec.halfAxis !== 'h') {
      const pvf = (proj && proj.views && proj.views[sec.parent]) || VIEW_FRAMES[sec.parent] || VIEW_FRAMES.top;
      const p3 = (p) => [pvf.x[0] * p[0] + pvf.y[0] * p[1], pvf.x[1] * p[0] + pvf.y[1] * p[1], pvf.x[2] * p[0] + pvf.y[2] * p[1]];
      const uA = dot3(p3(sec.a), vf.x), uB = dot3(p3(sec.b), vf.x);
      const cutRight = (sec.halfSide || 'right') !== 'left';
      const cutIsE2 = cutRight ? uB >= uA : uA > uB;
      const E_cut = cutIsE2 ? E2 : E1;
      const uDir = cutIsE2 ? [ux, uy] : [-ux, -uy];
      const M = [(E1[0] + E2[0]) * 0.5, (E1[1] + E2[1]) * 0.5];
      let turnLen = 10;
      for (const c of corners) {
        const d = (c[0] - M[0]) * (-lookSheet[0]) + (c[1] - M[1]) * (-lookSheet[1]);
        if (d + 5 > turnLen) turnLen = d + 5;
      }
      const E_turn = [M[0] - lookSheet[0] * turnLen, M[1] - lookSheet[1] * turnLen];
      lines.push({ pts: [E_cut, M, E_turn], cls: 'cutline', id: sec.id, secId: sec.id, secType });
      lines.push({ pts: [E_cut, [E_cut[0] - uDir[0] * endLen, E_cut[1] - uDir[1] * endLen]], cls: 'cutend', id: sec.id, secId: sec.id, secType });
      lines.push({ pts: [[M[0] + uDir[0] * 3.5, M[1] + uDir[1] * 3.5], M, [M[0] - lookSheet[0] * 3.5, M[1] - lookSheet[1] * 3.5]], cls: 'cutend', id: sec.id, secId: sec.id, secType });
      lines.push({ pts: [[E_turn[0] + lookSheet[0] * endLen, E_turn[1] + lookSheet[1] * endLen], E_turn], cls: 'cutend', id: sec.id, secId: sec.id, secType });
      drawArrowEnd(E_cut, uDir[0], uDir[1], 1);
      texts.push({ x: E_turn[0] - lookSheet[0] * 3.5, y: E_turn[1] - lookSheet[1] * 3.5 + 1.5, t: sec.label, size: 4.5, anchor: 'middle', id: sec.id, secId: sec.id, cls: 'cutlabel', secType });
      return;
    }
    lines.push({ pts: [E1, E2], cls: 'cutline', id: sec.id, secId: sec.id, secType });
    lines.push({ pts: [E1, [E1[0] + ux * endLen, E1[1] + uy * endLen]], cls: 'cutend', id: sec.id, secId: sec.id, secType });
    lines.push({ pts: [[E2[0] - ux * endLen, E2[1] - uy * endLen], E2], cls: 'cutend', id: sec.id, secId: sec.id, secType });
    drawArrowEnd(E1, ux, uy, -1);
    drawArrowEnd(E2, ux, uy, 1);
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
  function drawBalloon(bl, lines, texts, lay = layout, sh = dwg(), bom = bomData) {
    const st = sheetDimStyle(sh);
    let A;
    if (bl.view) {
      const v = lay.views[bl.view];
      if (!v) return;
      A = toSheet(v, bl.anchor);
    } else {
      A = [bl.anchor[0], bl.anchor[1]];
    }
    const off = (dragBalloon && dragBalloon.id === bl.id && dragBalloon.curOffset) ? dragBalloon.curOffset : (bl.offset || [14, -12]);
    const C = [A[0] + off[0], A[1] + off[1]];
    const pos = resolveBalloonPos(bl, bom);
    const posStr = String(pos);
    const FS = clamp(st.fontSize * 1.05, 2.8, 7.5);
    const R = Math.max(clamp(FS * 1.15, 3.6, 8.0), (textW(posStr, FS) + 2.4) / 2);
    const dx = C[0] - A[0], dy = C[1] - A[1], dist = Math.hypot(dx, dy);
    const E = dist > R + 0.5 ? [C[0] - (dx / dist) * R, C[1] - (dy / dist) * R] : A;
    const tipKind = bl.tip === 'arrow' ? 'arrow' : 'dot';
    if (dist > R + 0.5) {
      lines.push({ pts: [A, E], cls: 'balloon-line', id: bl.id, view: bl.view || undefined, balloonPos: pos, anchorPt: A });
    }
    if (tipKind === 'arrow') {
      if (dist > 1) arrowHead(lines, A, C, clamp(st.fontSize * 0.82, 2.2, 6.0), true, bl.id, null, 'filled', 'balloon-arrow', bl.view || undefined);
    } else {
      lines.push({ circle: [A[0], A[1], Math.max(0.75, FS * 0.22)], cls: 'balloon-dot', id: bl.id, view: bl.view || undefined, balloonPos: pos, anchorPt: A });
    }
    lines.push({ circle: [C[0], C[1], R], cls: 'balloon-circle', id: bl.id, view: bl.view || undefined, balloonPos: pos });
    texts.push({ x: C[0], y: C[1] + FS * 0.35, t: posStr, size: FS, rot: 0, anchor: 'middle', id: bl.id, view: bl.view || undefined, cls: 'balloon-text', balloonPos: pos });
  }
  function drawBomTable(sh, lay, lines, texts) {
    const br = lay && lay.bomRect;
    if (!br) return;
    const [cPos, cQty, cName, cMat] = br.cols;
    const x0 = br.x, y0 = br.y, x1 = x0 + br.w, y1 = y0 + br.h;
    const cx1 = x0 + cPos, cx2 = cx1 + cQty, cx3 = cx2 + cName;
    lines.push({ rect: [x0, y0, br.w, br.h], cls: 'bom-bg', id: '__bom__' });
    lines.push({ rect: [x0, y0, br.w, br.h], cls: 'bom-frame', id: '__bom__' });
    lines.push({ pts: [[x0, y0 + br.hh], [x1, y0 + br.hh]], cls: 'bom-head-line', id: '__bom__' });
    lines.push(
      { pts: [[cx1, y0], [cx1, y1]], cls: 'bom-grid', id: '__bom__' },
      { pts: [[cx2, y0], [cx2, y1]], cls: 'bom-grid', id: '__bom__' },
      { pts: [[cx3, y0], [cx3, y1]], cls: 'bom-grid', id: '__bom__' },
    );
    const hy = y0 + br.hh * 0.66;
    texts.push(
      { x: x0 + cPos / 2, y: hy, t: 'Pos.', size: 2.9, anchor: 'middle', cls: 'bom-th', id: '__bom__' },
      { x: cx1 + cQty / 2, y: hy, t: 'Menge', size: 2.9, anchor: 'middle', cls: 'bom-th', id: '__bom__' },
      { x: cx2 + 1.8, y: hy, t: 'Name', size: 2.9, anchor: 'start', cls: 'bom-th', id: '__bom__' },
      { x: cx3 + 1.8, y: hy, t: 'Werkstoff', size: 2.9, anchor: 'start', cls: 'bom-th', id: '__bom__' },
    );
    if (!br.rows.length) {
      texts.push({ x: x0 + br.w / 2, y: y0 + br.hh + br.rh * 0.66, t: 'Noch keine Teile im Modell', size: 2.6, anchor: 'middle', cls: 'bom-td', id: '__bom__' });
      return;
    }
    for (let i = 0; i < br.rows.length; i++) {
      const r = br.rows[i];
      const ry = y0 + br.hh + i * br.rh;
      if (i > 0) lines.push({ pts: [[x0, ry], [x1, ry]], cls: 'bom-grid', id: '__bom__' });
      const ty = ry + br.rh * 0.67;
      const fsN = fitSize(r.name, cName - 3.2, 2.9, 1.8);
      const fsM = fitSize(r.mat, cMat - 3.2, 2.8, 1.8);
      texts.push(
        { x: x0 + cPos / 2, y: ty, t: String(r.pos), size: 2.9, anchor: 'middle', cls: 'bom-td', id: '__bom__', bomRow: r.pos, bomCol: 'pos' },
        { x: cx1 + cQty / 2, y: ty, t: String(r.n), size: 2.9, anchor: 'middle', cls: 'bom-td', id: '__bom__', bomRow: r.pos, bomCol: 'qty' },
        { x: cx2 + 1.8, y: ty, t: clipText(r.name, cName - 3.2, fsN), size: fsN, anchor: 'start', cls: 'bom-td', id: '__bom__', bomRow: r.pos, bomCol: 'name' },
        { x: cx3 + 1.8, y: ty, t: clipText(r.mat, cMat - 3.2, fsM), size: fsM, anchor: 'start', cls: 'bom-td', id: '__bom__', bomRow: r.pos, bomCol: 'mat' },
      );
    }
  }
  function getShadedImage(name, v) {
    if (!proj || !proj.views || !proj.views[name] || !v || !v.geo || typeof Viewer === 'undefined' || !Viewer.renderOrthoView) return null;
    const pv = proj.views[name];
    const sig = projSigs.get(name) || '';
    const ck = name + '|' + projSceneKey + '|' + dirSig(pv) + '|' + sig + '|' + v.geo.box.map((n) => Math.round(n * 100)).join(',');
    if (shadeCache.has(ck)) return shadeCache.get(ck);
    const exMeta = proj.explodeMeta && proj.explodeMeta[name];
    let img = null;
    if (exMeta && exMeta.offsets && Viewer.setOffsets && Viewer.nodes) {
      const prevOffsets = new Map();
      for (const [nid, node] of Viewer.nodes.entries()) {
        if (node && node.off) prevOffsets.set(nid, node.off.clone());
      }
      const exVecMap = new Map();
      for (const [pid, arr] of exMeta.offsets.entries()) {
        exVecMap.set(pid, new THREE.Vector3(arr[0], arr[1], arr[2]));
      }
      if (typeof App !== 'undefined' && App.mergedInto) {
        for (const nid of Viewer.nodes.keys()) {
          if (exVecMap.has(nid)) continue;
          const hostId = App.mergedInto(nid);
          if (hostId && exVecMap.has(hostId)) exVecMap.set(nid, exVecMap.get(hostId).clone());
        }
      }
      try {
        Viewer.setOffsets(exVecMap.size ? exVecMap : null);
        img = Viewer.renderOrthoView({ dir: pv.dir, x: pv.x, box: v.geo.box, maxPx: 720 });
      } finally {
        Viewer.setOffsets(prevOffsets.size ? prevOffsets : null);
      }
    } else {
      img = Viewer.renderOrthoView({ dir: pv.dir, x: pv.x, box: v.geo.box, maxPx: 720 });
    }
    if (img) {
      if (shadeCache.size > 24) shadeCache.clear();
      shadeCache.set(ck, img);
    }
    return img;
  }
  function drawBreakLines(v, viewName, lines) {
    const bm = v && v.geo && v.geo.breakMap;
    if (!bm) return;
    const ov = 2.5;
    for (const c of bm.hCuts || []) {
      const top = toSheetRaw(v, [c.xL, c.hi]), bot = toSheetRaw(v, [c.xL, c.lo]);
      const y0 = Math.min(top[1], bot[1]) - ov, y1 = Math.max(top[1], bot[1]) + ov;
      const ym = (y0 + y1) * 0.5, H = y1 - y0;
      const xL = toSheetRaw(v, [c.xL, 0])[0], xR = toSheetRaw(v, [c.xR, 0])[0];
      const gapS = Math.abs(xR - xL);
      const amp = clamp(Math.min(1.8, gapS * 0.32), 0.65, 2.0);
      const zh = clamp(H * 0.14, 1.2, 3.0);
      for (const x of [xL, xR]) {
        let pts;
        if (c.style === 'wave') {
          pts = [];
          const N = 16;
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            pts.push([x + Math.sin(t * Math.PI * 2) * amp * 0.7, y0 + t * H]);
          }
        } else {
          pts = [[x, y0], [x, ym - zh], [x + amp, ym - zh * 0.45], [x - amp, ym + zh * 0.45], [x, ym + zh], [x, y1]];
        }
        lines.push({ pts, cls: 'breakline', id: c.brk.id, view: viewName, brkId: c.brk.id });
      }
    }
    for (const c of bm.vCuts || []) {
      const left = toSheetRaw(v, [c.lo, c.xL]), right = toSheetRaw(v, [c.hi, c.xL]);
      const x0 = Math.min(left[0], right[0]) - ov, x1 = Math.max(left[0], right[0]) + ov;
      const xm = (x0 + x1) * 0.5, W = x1 - x0;
      const yB = toSheetRaw(v, [0, c.xL])[1], yT = toSheetRaw(v, [0, c.xR])[1];
      const gapS = Math.abs(yB - yT);
      const amp = clamp(Math.min(1.8, gapS * 0.32), 0.65, 2.0);
      const zw = clamp(W * 0.14, 1.2, 3.0);
      for (const y of [yB, yT]) {
        let pts;
        if (c.style === 'wave') {
          pts = [];
          const N = 16;
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            pts.push([x0 + t * W, y + Math.sin(t * Math.PI * 2) * amp * 0.7]);
          }
        } else {
          pts = [[x0, y], [xm - zw, y], [xm - zw * 0.45, y - amp], [xm + zw * 0.45, y + amp], [xm + zw, y], [x1, y]];
        }
        lines.push({ pts, cls: 'breakline', id: c.brk.id, view: viewName, brkId: c.brk.id });
      }
    }
  }
  function drawAuxArrow(pv, aux, lines, texts) {
    const sp = auxViewSpec(aux);
    const M = [(aux.a[0] + aux.b[0]) * 0.5, (aux.a[1] + aux.b[1]) * 0.5];
    const Ms = toSheet(pv, M);
    const camSheet = [sp.cam2[0], -sp.cam2[1]];
    const EP = [Ms[0] + camSheet[0] * 2.5, Ms[1] + camSheet[1] * 2.5];
    const tail = [EP[0] + camSheet[0] * 9.5, EP[1] + camSheet[1] * 9.5];
    lines.push({ pts: [tail, EP], cls: 'auxarrow', id: aux.id, auxId: aux.id, view: aux.parent });
    arrowHead(lines, EP, tail, 3.2, true, aux.id, null, 'filled', null, aux.parent);
    if (lines.length) lines[lines.length - 1].auxId = aux.id;
    texts.push({ x: tail[0] + camSheet[0] * 3.2, y: tail[1] + camSheet[1] * 3.2 + 1.5, t: aux.label, size: 4.5, anchor: 'middle', id: aux.id, auxId: aux.id, cls: 'auxlabel', view: aux.parent });
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
      if (v.opts && v.opts.shaded && name !== 'free' && !(v.geo && v.geo.breakMap)) {
        const img = getShadedImage(name, v);
        if (img) {
          const b = v.geo.box;
          const TL = toSheetRaw(v, [b[0], b[3]]);
          images.push({ x: TL[0], y: TL[1], w: v.geo.w * v.s, h: v.geo.h * v.s, png: img.png, jpg: img.jpg, iw: img.w, ih: img.h, viewKey: name });
        }
      }
      const asLine = (p, cls) => {
        if (p.c && !p.arc) return { circle: [...toSheet(v, p.c), p.r * v.s], cls, view: name };
        const l = { pts: p.pts.map((q) => toSheet(v, q)), cls, view: name };
        if (p.arc) l.arc = { c: toSheet(v, p.c), r: p.r * v.s, a: p.arc };
        return l;
      };
      if (v.isSection) buildHatchLines(v, v.section, lines, sh);
      for (const p of v.geo.polys) lines.push(asLine(p, 'vis'));
      for (const p of v.geo.tangents || []) lines.push(asLine(p, 'tan'));
      for (const p of v.geo.hidden) lines.push(asLine(p, 'hid'));
      if (v.geo && v.geo.breakMap) drawBreakLines(v, name, lines);
      for (const tr of v.geo.explodeTrails || []) {
        if (tr.pts && tr.pts.length >= 2) lines.push({ pts: tr.pts.map((q) => toSheet(v, q)), cls: 'explode-trail', view: name });
      }
      if (v.isSection && v.geo.splitLine) {
        const A = toSheet(v, v.geo.splitLine.a), B = toSheet(v, v.geo.splitLine.b);
        const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
        const e = 2.5;
        lines.push({ pts: [[A[0] - (dx / L) * e, A[1] - (dy / L) * e], [B[0] + (dx / L) * e, B[1] + (dy / L) * e]], cls: 'ctr', view: name, id: v.section.id, secId: v.section.id });
      }
      if (v.isSection && v.geo.breakLines) {
        for (const bl of v.geo.breakLines) {
          lines.push({ pts: bl.pts.map((q) => toSheet(v, q)), cls: 'breakline', view: name, id: v.section.id, secId: v.section.id, secType: 'breakout' });
        }
      }
      if (v.isSection && v.section) {
        const b = v.geo.box;
        const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
        texts.push({ x: (TL[0] + BR[0]) * 0.5, y: BR[1] + 6, t: sectionTitle(v.section), size: 4, anchor: 'middle', id: v.section.id, secId: v.section.id, cls: 'viewlabel', secType: v.section.type || 'full' });
      }
      if (v.isAux && v.aux) {
        const b = v.geo.box;
        const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
        const txt = v.customScale ? `Ansicht ${v.aux.label} (${scaleText(v.s)})` : `Ansicht ${v.aux.label}`;
        texts.push({ x: (TL[0] + BR[0]) * 0.5, y: BR[1] + 6, t: txt, size: 4, anchor: 'middle', id: v.aux.id, auxId: v.aux.id, cls: 'viewlabel' });
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
      // Kosmetische & Norm-Gewinde nach DIN ISO 6410-1: 3/4-Kreis (Stirnansicht) bzw. dünne parallele Linien (Seiten-/Schnittansicht)
      const labelSide = !v.detail && (name === 'front' || (name === 'left' && !lay.views.front));
      const showHid = v.opts ? !!v.opts.hidden : !!sh.hidden;
      for (const th of v.geo.threads || []) {
        if (th.type === 'end') {
          const C = toSheet(v, th.c), rr = th.rThread * v.s;
          if (rr > 0.3) {
            lines.push({
              pts: arcPts(th.c, th.rThread, THREAD_ARC_START, THREAD_ARC_START + THREAD_ARC_SPAN).map((q) => toSheet(v, q)),
              arc: { c: C, r: rr, a: [THREAD_ARC_START, THREAD_ARC_START + THREAD_ARC_SPAN] },
              cls: 'thin',
              extraCls: 'thread',
              thread: 'end',
              threadKind: th.kind,
              threadSize: th.size,
              view: name,
            });
          }
        } else if (th.type === 'side') {
          const A = toSheet(v, th.a), B = toSheet(v, th.b);
          const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
          if (L < 0.3) continue;
          const px = -dy / L, py = dx / L, rt = th.rThread * v.s, ro = th.r * v.s;
          const isHiddenInt = th.kind === 'int' && (!v.isSection || !th.isCut);
          if (isHiddenInt && !showHid) continue;
          const lineCls = isHiddenInt ? 'hid' : 'thin';
          const endCls = isHiddenInt ? 'hid' : 'vis';
          lines.push({ pts: [[A[0] + px * rt, A[1] + py * rt], [B[0] + px * rt, B[1] + py * rt]], cls: lineCls, extraCls: 'thread', thread: 'side', threadKind: th.kind, threadSize: th.size, view: name });
          lines.push({ pts: [[A[0] - px * rt, A[1] - py * rt], [B[0] - px * rt, B[1] - py * rt]], cls: lineCls, extraCls: 'thread', thread: 'side', threadKind: th.kind, threadSize: th.size, view: name });
          if (th.kind === 'ext') {
            lines.push({ pts: [[A[0] - px * ro, A[1] - py * ro], [A[0] + px * ro, A[1] + py * ro]], cls: 'vis', extraCls: 'thread-end', threadEnd: true, threadKind: th.kind, threadSize: th.size, view: name });
            lines.push({ pts: [[B[0] - px * ro, B[1] - py * ro], [B[0] + px * ro, B[1] + py * ro]], cls: 'vis', extraCls: 'thread-end', threadEnd: true, threadKind: th.kind, threadSize: th.size, view: name });
          } else {
            if (th.blind0) lines.push({ pts: [[A[0] - px * rt, A[1] - py * rt], [A[0] + px * rt, A[1] + py * rt]], cls: endCls, extraCls: 'thread-end', threadEnd: true, threadKind: th.kind, threadSize: th.size, view: name });
            if (th.blind1) lines.push({ pts: [[B[0] - px * rt, B[1] - py * rt], [B[0] + px * rt, B[1] + py * rt]], cls: endCls, extraCls: 'thread-end', threadEnd: true, threadKind: th.kind, threadSize: th.size, view: name });
          }
          if (labelSide && th.source === 'cosmetic') {
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
      } else if (v.rect && v.customScale && !v.isAux) {
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
      const VC = toSheetRaw(srcV, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
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
    // Blickpfeile für Hilfsansichten auf Eltern-Ansichten
    for (const aux of sh.auxViews || []) {
      const pv = lay.views[aux.parent];
      if (pv) drawAuxArrow(pv, aux, lines, texts);
    }
    // Bemaßungen
    for (const dim of autoDimList(sh, lay)) if (lay.views[dim.view] && !lay.views[dim.view].noDims) dimSVG(dim, lines, texts, lay, sh);
    // Notizen mit Hinweislinie
    for (const note of sh.notes || []) drawLeaderNote(note, lines, texts, lay, sh);
    // Positionsnummern
    for (const bl of sh.balloons || []) drawBalloon(bl, lines, texts, lay, sh, bomData);
    // Schriftfeld & Stückliste
    titleBlock(sh, lay, idx, total, lines, texts);
    drawBomTable(sh, lay, lines, texts);
    return { layout: lay, lines, texts, images };
  }
  function render() {
    if (!holder) return;
    if (loadingProjPromise && !proj && Model.activeItems(App.doc).length > 0) return;
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
    if (tool === 'balloon' && toolState) previewBalloon(cur.lines, cur.texts);
    if (tool === 'break' && toolState) previewBreak(cur.lines, cur.texts);
    if (tool === 'aux' && toolState) previewAux(cur.lines, cur.texts);
    buildSVG(cur.lines, cur.texts, cur.images);
    const sv = document.getElementById('dw-scale-val'); if (sv) sv.textContent = scaleText(layout.s);
    renderTabs();
  }
  function titleBlock(sh, lay, idx, total, lines, texts) {
    const { frame, tb } = lay; const tbT = sh.title || {};
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
    lab(cA, rows[0], T('draw.tb.drawn')); val(cA, rows[0], tbT.name, 32, 2.8);
    lab(cB, rows[0], T('draw.tb.date')); val(cB, rows[0], tbT.datum, 40, 2.8);
    lab(cA, rows[1], T('draw.tb.material')); val(cA, rows[1], tbT.werkstoff, 32, 2.8);
    lab(cB, rows[1], T('draw.tb.scale')); val(cB, rows[1], scaleText(lay.s), 40, 3.2);
    lab(cA, rows[2], T('draw.tb.company')); val(cA, rows[2], tbT.firma, 32, 2.6);
    lab(cB, rows[2], T('draw.tb.sheet')); val(cB, rows[2], tbT.blatt ? tbT.blatt : `${idx + 1}/${total}`, 22, 2.8);
    lab(cB2, rows[2], T('draw.tb.format')); val(cB2, rows[2], sh.sheet, 18, 2.8);
    lab(cA, rows[3], T('draw.tb.dwgNo')); val(cA, rows[3], tbT.nummer, 32, 2.8);
    lab(cB, rows[3], T('draw.tb.genTol')); val(cB, rows[3], 'ISO 2768-m', 40, 2.6);
    // Benennung, bei Bedarf zweizeilig
    lab(cC, rows[0], T('draw.tb.title'));
    const title = String(tbT.titel || App.doc.name || '');
    const tw = cD - cC - 3;
    let ts = fitSize(title, tw, 6, 3.4);
    if (textW(title, ts) > tw) {
      const words = title.split(/\s+/); let l1 = '', l2 = '';
      for (const w of words) { if (!l2 && textW((l1 + ' ' + w).trim(), 4.2) <= tw) l1 = (l1 + ' ' + w).trim(); else l2 = (l2 + ' ' + w).trim(); }
      ts = Math.min(fitSize(l1, tw, 4.2, 2.6), fitSize(l2, tw, 4.2, 2.6));
      texts.push({ x: cC + 1.5, y: rows[0] + 10.5, t: clipText(l1, tw, ts), size: ts, anchor: 'start', cls: 'title' });
      texts.push({ x: cC + 1.5, y: rows[0] + 10.5 + ts * 1.25, t: clipText(l2, tw, ts), size: ts, anchor: 'start', cls: 'title' });
    } else texts.push({ x: cC + 1.5, y: rows[0] + 13.5, t: title, size: ts, anchor: 'start', cls: 'title' });
    const unitLabel = sheetDimStyle(sh).dual ? (Units.key() === 'in' ? 'in [mm]' : `${Units.label()} [in]`) : Units.label();
    texts.push({ x: cC + 1.5, y: rows[3] + 5.4, t: clipText(T('draw.tb.footer', { sheet: sh.name, u: unitLabel }), tw, 2), size: 2, anchor: 'start', cls: 'lab' });
    // Projektionssymbol nach ISO 5456-2: Methode 1 (Europa / ISO E) oder Methode 3 (USA / ISO A)
    const projMode = normProjection(sh.projection);
    lab(cD, rows[0], T('draw.tb.projection'));
    const cy = y0 + 11.5;
    if (projMode === 'us') {
      const ccx = cD + 8.5;
      lines.push({ circle: [ccx, cy, 1.6], cls: 'thin', projSym: 'circles' }, { circle: [ccx, cy, 3], cls: 'thin', projSym: 'circles' });
      lines.push({ pts: [[ccx - 4, cy], [ccx + 4, cy]], cls: 'ctr' }, { pts: [[ccx, cy - 4], [ccx, cy + 4]], cls: 'ctr' });
      const tx = cD + 16.5;
      lines.push({ pts: [[tx, cy - 1.6], [tx + 10, cy - 3], [tx + 10, cy + 3], [tx, cy + 1.6], [tx, cy - 1.6]], cls: 'thin', projSym: 'cone' });
      lines.push({ pts: [[tx - 1.5, cy], [tx + 11.5, cy]], cls: 'ctr' });
      texts.push({ x: cD + 1.2, y: y0 + 26.2, t: 'ISO 5456-2 (A)', size: 2, anchor: 'start', cls: 'lab', projMode: 'us' });
      const mTxt = T('draw.tb.method3');
      const mSz = fitSize(mTxt, 29.6, 2.5, 1.8);
      texts.push({ x: cD + 1.2, y: y0 + 30.4, t: clipText(mTxt, 29.6, mSz), size: mSz, anchor: 'start', cls: 'val', projMode: 'us' });
    } else {
      const sx = cD + 4.5;
      lines.push({ pts: [[sx, cy - 1.6], [sx + 10, cy - 3], [sx + 10, cy + 3], [sx, cy + 1.6], [sx, cy - 1.6]], cls: 'thin', projSym: 'cone' });
      lines.push({ pts: [[sx - 1.5, cy], [sx + 11.5, cy]], cls: 'ctr' });
      const ccx = sx + 18.5;
      lines.push({ circle: [ccx, cy, 1.6], cls: 'thin', projSym: 'circles' }, { circle: [ccx, cy, 3], cls: 'thin', projSym: 'circles' });
      lines.push({ pts: [[ccx - 4, cy], [ccx + 4, cy]], cls: 'ctr' }, { pts: [[ccx, cy - 4], [ccx, cy + 4]], cls: 'ctr' });
      texts.push({ x: cD + 1.2, y: y0 + 26.2, t: 'ISO 5456-2 (E)', size: 2, anchor: 'start', cls: 'lab', projMode: 'eu' });
      const mTxt = T('draw.tb.method1Iso');
      const mSz = fitSize(mTxt, 29.6, 2.5, 1.8);
      texts.push({ x: cD + 1.2, y: y0 + 30.4, t: clipText(mTxt, 29.6, mSz), size: mSz, anchor: 'start', cls: 'val', projMode: 'eu' });
    }
  }
  // grobe Textbreite (Schmalschrift ≈ 0,5 em, Helvetica im PDF ≈ 0,56 em)
  // Die Standardschrift im PDF kennt nur Latin-1: typografische Zeichen ersetzen
  function latin1(s) {
    return String(s).replace(/⌒/g, 'Bogen ').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[^\x00-\xff]/g, '?');
  }
  function textW(t, size) { return String(t).length * size * 0.56; }
  function fitSize(t, w, max, min) { const n = String(t).length || 1; return Math.max(min, Math.min(max, w / (n * 0.56))); }
  function clipText(t, w, size) { t = String(t); if (textW(t, size) <= w) return t; const n = Math.max(1, Math.floor(w / (size * 0.56)) - 1); return t.slice(0, n) + '…'; }
  const SHEET_SVG_CSS = `.paper{fill:#fff;stroke:none}.frame{fill:none;stroke:#111;stroke-width:.7}.thin{fill:none;stroke:#111;stroke-width:.25}.vis{fill:none;stroke:#111;stroke-width:.5;stroke-linecap:round;stroke-linejoin:round}.tan{fill:none;stroke:#444;stroke-width:.2;stroke-linecap:round;stroke-linejoin:round}.hid{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:2.4 1.2}.ctr{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:5 1.2 .6 1.2}.ctr[data-id]{cursor:pointer}.ctr.sel{stroke:#0c7a70;stroke-width:.45}.explode-trail{fill:none;stroke:#444;stroke-width:.22;stroke-dasharray:3 1.4}.hatch{fill:none;stroke:#111;stroke-width:.22}.hatch.hatch-dash{stroke-dasharray:3 1.2}.cutline{fill:none;stroke:#111;stroke-width:.35;stroke-dasharray:7 1.2 .7 1.2}.cutend{fill:none;stroke:#111;stroke-width:.7;stroke-linecap:square}.breakline{fill:none;stroke:#111;stroke-width:.25;stroke-linecap:round;stroke-linejoin:round;cursor:pointer}.breakline.sel{stroke:#0c7a70;stroke-width:.45}.auxarrow{fill:none;stroke:#111;stroke-width:.35;cursor:pointer}.auxarrow.sel{stroke:#0c7a70;stroke-width:.5}.dim{fill:none;stroke:#111;stroke-width:.25}.arrow{fill:#111;stroke:none}.arrow-open{fill:none;stroke:#111;stroke-width:.3;stroke-linecap:round;stroke-linejoin:round}.arrow-slash{fill:none;stroke:#111;stroke-width:.45;stroke-linecap:round}.arrow-dot,.leader-dot,.leader-arrow,.balloon-dot,.balloon-arrow{fill:#111;stroke:none}.leader,.balloon-line{fill:none;stroke:#111;stroke-width:.25;cursor:pointer}.balloon-circle{fill:#fff;stroke:#111;stroke-width:.35;cursor:grab}.bom-bg{fill:#fff;stroke:none;cursor:grab}.bom-frame{fill:none;stroke:#111;stroke-width:.5;cursor:grab}.bom-head-line{fill:none;stroke:#111;stroke-width:.35}.bom-grid{fill:none;stroke:#111;stroke-width:.22}.bom-frame.sel,.bom-head-line.sel,.bom-grid.sel{stroke:#0c7a70}.view-sel{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:2 1.5;pointer-events:none}.detail{fill:none;stroke:#111;stroke-width:.25;cursor:pointer}.detail-border{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:3 1.5;cursor:grab}.detail.sel,.detail-border.sel{stroke:#0c7a70;stroke-width:.45}.sel .dim,.dim.sel,.cutline.sel,.cutend.sel,.hatch.sel,.arrow-open.sel,.arrow-slash.sel,.balloon-circle.sel{stroke:#0c7a70}.dim.sel,.leader.sel,.balloon-line.sel{stroke:#0c7a70;stroke-width:.4}.arrow.sel,.arrow-dot.sel,.leader-dot.sel,.leader-arrow.sel,.balloon-dot.sel,.balloon-arrow.sel{fill:#0c7a70}.dim.lost,.arrow-open.lost,.arrow-slash.lost{stroke:#c9372e;stroke-width:.38}.dim.lost{stroke-dasharray:2 1}.arrow.lost,.arrow-dot.lost{fill:#c9372e}text{font-family:"Barlow Semi Condensed","Barlow",Arial,sans-serif;fill:#111}text.dimtext{cursor:pointer}text.lab{fill:#555}text.note{fill:#888}text.vlabel{fill:#333;font-weight:500}text.cutlabel,text.auxlabel,text.viewlabel,text.bom-th{font-weight:700}text.auxlabel{cursor:pointer}text.balloon-text{font-weight:600;cursor:grab}text.bom-td{cursor:grab}text.sel{fill:#0c7a70}text.dimtext.lost{fill:#c9372e;font-weight:600}.dim.lost.sel,.arrow-open.lost.sel,.arrow-slash.lost.sel{stroke:#991b1b;stroke-width:.5}.arrow.lost.sel,.arrow-dot.lost.sel{fill:#991b1b}text.dimtext.lost.sel{fill:#991b1b}text.detail-lbl{font-weight:600;cursor:pointer}text.leadertext{cursor:grab}.prev{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:1.5 1}.snap{fill:none;stroke:#0c7a70;stroke-width:.4}`;
  function buildSheetSVGElement(cur, { widthAttr, heightAttr, transparent = false, interactive = false } = {}) {
    const { W, H } = cur.layout;
    const lines = cur.lines || [], texts = cur.texts || [], images = cur.images || [];
    const NS = 'http://www.w3.org/2000/svg';
    const XLINK = 'http://www.w3.org/1999/xlink';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('xmlns', NS);
    if (!interactive) s.setAttribute('xmlns:xlink', XLINK);
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s.setAttribute('width', widthAttr != null ? widthAttr : `${W}mm`);
    s.setAttribute('height', heightAttr != null ? heightAttr : `${H}mm`);
    const style = document.createElementNS(NS, 'style');
    style.textContent = SHEET_SVG_CSS;
    s.append(style);
    const g = document.createElementNS(NS, 'g'); s.append(g);
    const f = (n) => (Math.round(n * 1000) / 1000).toString();
    const skipCls = interactive ? null : new Set(['prev', 'snap', 'view-sel']);
    const appendLine = (l) => {
      if (skipCls && skipCls.has(l.cls)) return;
      let el;
      const sel = interactive && l.id && l.id === selDim;
      if (l.rect) { el = document.createElementNS(NS, 'rect'); el.setAttribute('x', f(l.rect[0])); el.setAttribute('y', f(l.rect[1])); el.setAttribute('width', f(l.rect[2])); el.setAttribute('height', f(l.rect[3])); }
      else if (l.circle) { el = document.createElementNS(NS, 'circle'); el.setAttribute('cx', f(l.circle[0])); el.setAttribute('cy', f(l.circle[1])); el.setAttribute('r', f(l.circle[2])); }
      else if (l.poly) { el = document.createElementNS(NS, 'polygon'); el.setAttribute('points', l.poly.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      else { el = document.createElementNS(NS, 'polyline'); el.setAttribute('points', l.pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); }
      el.setAttribute('class', l.cls + (l.extraCls ? ' ' + l.extraCls : '') + (l.lost ? ' lost' : '') + (sel ? ' sel' : ''));
      if (interactive) {
        if (l.id) el.dataset.id = l.id;
        if (l.lost) el.dataset.lost = '1';
        if (l.view) el.dataset.view = l.view;
        if (l.ctrType) el.dataset.ctr = l.ctrType;
        if (l.secId) el.dataset.sec = l.secId;
        if (l.brkId) el.dataset.brk = l.brkId;
        if (l.auxId) el.dataset.aux = l.auxId;
        if (l.secType) el.dataset.secType = l.secType;
        if (l.capIdx != null) el.dataset.cap = String(l.capIdx);
        if (l.thread) el.dataset.thread = l.thread;
        if (l.threadKind) el.dataset.threadKind = l.threadKind;
        if (l.threadSize) el.dataset.threadSize = l.threadSize;
        if (l.hatchPat) el.dataset.hatchPat = l.hatchPat;
        if (l.matKey) el.dataset.mat = l.matKey;
        if (l.partId) el.dataset.part = l.partId;
        if (l.noteTip) el.dataset.tipKind = l.noteTip;
        if (l.balloonPos != null) el.dataset.pos = String(l.balloonPos);
        if (l.anchorPt) { el.dataset.ax = f(l.anchorPt[0]); el.dataset.ay = f(l.anchorPt[1]); }
        if (l.projSym) el.dataset.projSym = l.projSym;
      }
      g.append(el);
    };
    if (!transparent) for (const l of lines) if (l.cls === 'paper') appendLine(l);
    for (const im of images) {
      const src = im.png || im.jpg;
      if (!src) continue;
      const el = document.createElementNS(NS, 'image');
      el.setAttribute('class', 'shade-img');
      el.setAttribute('x', f(im.x)); el.setAttribute('y', f(im.y));
      el.setAttribute('width', f(im.w)); el.setAttribute('height', f(im.h));
      el.setAttribute('preserveAspectRatio', 'none');
      el.setAttribute('href', src);
      if (!interactive) el.setAttributeNS(XLINK, 'xlink:href', src);
      if (interactive && im.viewKey) el.dataset.view = im.viewKey;
      g.append(el);
    }
    for (const l of lines) if (l.cls !== 'paper') appendLine(l);
    for (const t of texts) {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', f(t.x)); el.setAttribute('y', f(t.y)); el.setAttribute('font-size', f(t.size)); el.setAttribute('text-anchor', t.anchor || 'start');
      if (t.rot) el.setAttribute('transform', `rotate(${f(t.rot)} ${f(t.x)} ${f(t.y)})`);
      el.setAttribute('class', (t.cls || '') + (t.lost ? ' lost' : '') + (interactive && t.id && t.id === selDim ? ' sel' : ''));
      if (interactive) {
        if (t.id) el.dataset.id = t.id;
        if (t.lost) el.dataset.lost = '1';
        if (t.view) el.dataset.view = t.view;
        if (t.secId) el.dataset.sec = t.secId;
        if (t.auxId) el.dataset.aux = t.auxId;
        if (t.secType) el.dataset.secType = t.secType;
        if (t.tolPart) el.dataset.tol = t.tolPart;
        if (t.balloonPos != null) el.dataset.pos = String(t.balloonPos);
        if (t.bomRow != null) el.dataset.bomRow = String(t.bomRow);
        if (t.bomCol) el.dataset.bomCol = t.bomCol;
        if (t.projMode) el.dataset.projMode = t.projMode;
      }
      el.textContent = t.t;
      g.append(el);
    }
    return s;
  }
  function buildSVG(lines, texts, images = []) {
    const { W, H } = layout;
    const s = buildSheetSVGElement({ layout, lines, texts, images }, {
      widthAttr: W * zoom * 3.2,
      heightAttr: H * zoom * 3.2,
      transparent: false,
      interactive: true,
    });
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
      const b = v.geo.box; const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 6 && P[0] <= B[0] + 6 && P[1] >= A[1] - 6 && P[1] <= B[1] + 6) return name;
    }
    return null;
  }
  function viewAt(P) {
    for (const [name, v] of Object.entries(layout.views)) {
      if (v.detail && Math.hypot(P[0] - v.sheetCenter[0], P[1] - v.sheetCenter[1]) <= v.sheetR + 6) return name;
    }
    let best = null;
    for (const [name, v] of Object.entries(layout.views)) { if (v.noDims || v.detail) continue; const b = v.geo.box; const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]); if (P[0] >= A[0] - 8 && P[0] <= B[0] + 8 && P[1] >= A[1] - 8 && P[1] <= B[1] + 8) best = name; }
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
      const bx = v.geo.trueBox || v.geo.box, cx = (bx[0] + bx[2]) * 0.5, cy = (bx[1] + bx[3]) * 0.5;
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
  function arcAt(name, P) {
    const v = layout.views[name]; if (!v) return null;
    const q = toView(v, P);
    const tol = Math.max(2.5, 4 / zoom) / v.s;
    const pool = [...v.geo.circles, ...v.geo.hidden.filter((p) => p.c).map((p) => ({ c: p.c, r: p.r, full: !p.arc, arc: p.arc }))];
    let best = null, bd = tol;
    for (const c of pool) {
      if (c.full || !c.arc || c.arc[1] - c.arc[0] <= 1e-4) continue;
      const d = Math.abs(Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) - c.r);
      if (d >= bd) continue;
      let a = angOf(c.c, q);
      if (a < c.arc[0] - 0.12) a += TWO_PI;
      if (a > c.arc[1] + 0.12) continue;
      bd = d; best = c;
    }
    if (!best) return null;
    return { ...best, a0: best.arc[0], a1: best.arc[1] };
  }
  function pickOrdinatePoint(name, P) {
    const sn = snapIn(name, P);
    if (sn) return sn;
    const c = circleAt(name, P, true);
    if (c) {
      const v = layout.views[name];
      return { p: [c.c[0], c.c[1]], S: toSheet(v, c.c), edge: null, preferDir: null };
    }
    return pickDimPoint(name, P);
  }
  function ordinateDir(v, origin, b, q, preferDir = null) {
    const dx = Math.abs(b[0] - origin[0]), dy = Math.abs(b[1] - origin[1]);
    if (dx > 1e-4 && dy <= 1e-4) return 'h';
    if (dy > 1e-4 && dx <= 1e-4) return 'v';
    const b0 = v && v.geo && v.geo.box;
    if (b0) {
      if ((q[1] < b0[1] - 0.5 || q[1] > b0[3] + 0.5) && q[0] >= b0[0] - 2 && q[0] <= b0[2] + 2) return 'h';
      if ((q[0] < b0[0] - 0.5 || q[0] > b0[2] + 0.5) && q[1] >= b0[1] - 2 && q[1] <= b0[3] + 2) return 'v';
    }
    return chainDir(origin, b, q, preferDir);
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
      const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
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
    const b = v.geo.trueBox || v.geo.box;
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
    const names = [
      ...Object.keys(layout.views).filter((k) => k.startsWith('sec_') || k.startsWith('aux_')),
      'front', 'top', 'left', 'iso', ...(sh.extraViews || []).map((e) => e.id),
    ];
    for (const name of names) {
      const v = layout.views[name];
      if (!v || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
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
    if (String(viewName).startsWith('aux_')) {
      const auxId = String(viewName).slice(4);
      const aux = (dwg().auxViews || []).find((x) => x.id === auxId);
      const v = lay.views[viewName];
      if (!aux || !v) return false;
      const b = v.geo.box;
      const curPx = v.ox + b[0] * v.s, curPy = v.oy - b[3] * v.s;
      App.change('Ansicht verschoben', () => {
        const a = (dwg().auxViews || []).find((x) => x.id === auxId);
        if (a) a.pos = [curPx + numDx, curPy + numDy];
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
    const hasAux = (d.auxViews || []).some((a) => Array.isArray(a.pos));
    const hasBomPos = !viewName && d.bomTable && Array.isArray(d.bomTable.pos);
    if (!hasMain && !hasSec && !hasAux && !hasBomPos && !viewName) return false;
    App.change('Ansichten zurückgesetzt', () => {
      const sh = dwg();
      if (viewName) {
        if (sh.viewPos) delete sh.viewPos[viewName];
        if (String(viewName).startsWith('sec_')) {
          const s = (sh.sections || []).find((x) => x.id === String(viewName).slice(4));
          if (s) s.pos = null;
        }
        if (String(viewName).startsWith('aux_')) {
          const a = (sh.auxViews || []).find((x) => x.id === String(viewName).slice(4));
          if (a) a.pos = null;
        }
      } else {
        sh.viewPos = {};
        for (const s of sh.sections || []) s.pos = null;
        for (const a of sh.auxViews || []) a.pos = null;
        if (sh.bomTable) sh.bomTable.pos = null;
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
      const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
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
    const bx = v.geo.trueBox || v.geo.box;
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
  // ---------- Positionsnummern & Stückliste auf dem Blatt (ZE-12) ----------
  function viewBasis(viewName, sh = dwg()) {
    if (!proj) return null;
    if (String(viewName).startsWith('sec_')) {
      const sec = (sh.sections || []).find((x) => 'sec_' + x.id === viewName);
      if (!sec) return null;
      const sv = proj.sections && proj.sections[secCacheKey(sec)];
      if (sv && sv.dir && sv.x && sv.y) return { dir: sv.dir, x: sv.x, y: sv.y };
      const sp = sectionPlaneSpec(sec);
      return { dir: sp.dir, x: sp.x, y: sp.y };
    }
    if (String(viewName).startsWith('aux_')) {
      const aux = (sh.auxViews || []).find((x) => 'aux_' + x.id === viewName);
      if (aux) {
        const pv = proj.views && proj.views[viewName];
        if (pv && pv.dir && pv.x && pv.y) return { dir: pv.dir, x: pv.x, y: pv.y };
        const sp = auxViewSpec(aux);
        return { dir: sp.dir, x: sp.x, y: sp.y };
      }
    }
    const det = (sh.details || []).find((x) => x.id === viewName);
    const key = det ? det.source : viewName;
    const pv = proj.views && proj.views[key];
    if (pv && pv.dir && pv.x && pv.y) return { dir: pv.dir, x: pv.x, y: pv.y };
    if (STD_DIR[key]) {
      const { dir, x } = STD_DIR[key];
      return { dir, x, y: vNorm(vCross(dir, x)) };
    }
    const ev = (sh.extraViews || []).find((x) => x.id === key);
    if (ev) return { dir: ev.dir, x: ev.x, y: vNorm(vCross(ev.dir, ev.x)) };
    return null;
  }
  function projectPartInView(part, basis, offset = null) {
    if (!part || !part.bbox || !basis) return null;
    const ox = offset ? (Number(offset[0]) || 0) : 0;
    const oy = offset ? (Number(offset[1]) || 0) : 0;
    const oz = offset ? (Number(offset[2]) || 0) : 0;
    const b = [part.bbox[0] + ox, part.bbox[1] + oy, part.bbox[2] + oz, part.bbox[3] + ox, part.bbox[4] + oy, part.bbox[5] + oz];
    const ex = basis.x, ey = basis.y, d = basis.dir;
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    let dMin = Infinity, dMax = -Infinity;
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
      const u = x * ex[0] + y * ex[1] + z * ex[2];
      const v = x * ey[0] + y * ey[1] + z * ey[2];
      const dp = x * d[0] + y * d[1] + z * d[2];
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      if (dp < dMin) dMin = dp; if (dp > dMax) dMax = dp;
    }
    const cRaw = Array.isArray(part.com) && part.com.length >= 3
      ? part.com
      : [(part.bbox[0] + part.bbox[3]) * 0.5, (part.bbox[1] + part.bbox[4]) * 0.5, (part.bbox[2] + part.bbox[5]) * 0.5];
    const c = [cRaw[0] + ox, cRaw[1] + oy, cRaw[2] + oz];
    const cu = clamp(c[0] * ex[0] + c[1] * ex[1] + c[2] * ex[2], uMin, uMax);
    const cv = clamp(c[0] * ey[0] + c[1] * ey[1] + c[2] * ey[2], vMin, vMax);
    return { box2: [uMin, vMin, uMax, vMax], center2: [cu, cv], minDepth: dMin, maxDepth: dMax };
  }
  function explodePartOffset(vk, partId) {
    const exMeta = proj && proj.explodeMeta && proj.explodeMeta[vk];
    return exMeta && exMeta.offsets ? (exMeta.offsets.get(partId) || null) : null;
  }
  function chooseBalloonView(sh, lay, rows, partsById) {
    const avail = Object.keys(lay.views || {}).filter((k) => k !== 'free' && lay.views[k] && lay.views[k].geo && lay.views[k].geo.box);
    if (!avail.length) return null;
    if (balloonViewPref && balloonViewPref !== 'auto' && avail.includes(balloonViewPref)) return balloonViewPref;
    const bonus = { front: 3, iso: 2.5, top: 2, left: 1 };
    let bestKey = avail[0], bestScore = -Infinity;
    for (const vk of avail) {
      const v = lay.views[vk];
      const basis = viewBasis(vk, sh);
      if (!basis) continue;
      const pts = [];
      for (const row of rows) {
        let chosen = null, bestD = -Infinity;
        for (const id of row.ids) {
          const p = partsById.get(id);
          const pr = projectPartInView(p, basis, explodePartOffset(vk, id));
          if (!pr) continue;
          if (pr.maxDepth > bestD) { bestD = pr.maxDepth; chosen = pr; }
        }
        if (chosen) pts.push(toSheet(v, chosen.center2));
      }
      let minDist = pts.length > 1 ? Infinity : 20;
      let sumDist = 0, cnt = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d < minDist) minDist = d;
          sumDist += d; cnt++;
        }
      }
      const avgDist = cnt ? sumDist / cnt : 20;
      const sc = minDist * 3 + avgDist * 0.25 + (bonus[vk] || (v.is3d ? 2.2 : 0.5));
      if (sc > bestScore) { bestScore = sc; bestKey = vk; }
    }
    return bestKey;
  }
  function clampBalloonCenter(cx, cy, R, frame, tb, bomRect) {
    const xMin = frame.x + R + 3, xMax = frame.x + frame.w - R - 3;
    const yMin = frame.y + R + 3, yMax = frame.y + frame.h - R - 3;
    let x = clamp(cx, xMin, xMax), y = clamp(cy, yMin, yMax);
    const keepOut = (rx0, ry0, rx1, ry1) => {
      if (x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) {
        const upY = ry0 - 1;
        const leftX = rx0 - 1;
        if (upY >= yMin && (leftX < xMin || (y - upY) <= (x - leftX))) y = upY;
        else if (leftX >= xMin) x = leftX;
      }
    };
    const tbx0 = frame.x + frame.w - tb.w - R - 3, tby0 = frame.y + frame.h - tb.h - R - 3;
    keepOut(tbx0, tby0, frame.x + frame.w, frame.y + frame.h);
    if (bomRect) {
      keepOut(bomRect.x - R - 3, bomRect.y - R - 3, bomRect.x + bomRect.w + R + 3, bomRect.y + bomRect.h + R + 3);
    }
    return [clamp(x, xMin, xMax), clamp(y, yMin, yMax)];
  }
  function pickRowAnchorInView(row, vName, v, basis, partsById, allProjected, chosenAnchors) {
    const cands = [];
    for (const id of row.ids) {
      const part = partsById.get(id);
      const pr = projectPartInView(part, basis, explodePartOffset(vName, id));
      if (pr) cands.push({ id, pr });
    }
    if (!cands.length) {
      const b = v.geo.box;
      return { itemId: row.ids[0] || null, anchor: [(b[0] + b[2]) * 0.5, (b[1] + b[3]) * 0.5], tip: 'dot' };
    }
    let bestCand = null, bestScore = -Infinity;
    for (const cand of cands) {
      const [u0, v0, u1, v1] = cand.pr.box2;
      const du = u1 - u0, dv = v1 - v0;
      const thin = du * v.s < 3.2 || dv * v.s < 3.2;
      const samplePts = thin
        ? [[(u0 + u1) * 0.5, v1], [u1, (v0 + v1) * 0.5], [(u0 + u1) * 0.5, v0], [u0, (v0 + v1) * 0.5]]
        : [cand.pr.center2, ...[0.2, 0.5, 0.8].flatMap((fu) => [0.2, 0.5, 0.8].map((fv) => [u0 + du * fu, v0 + dv * fv]))];
      for (const pt of samplePts) {
        const covered = allProjected.some((other) => (
          !row.ids.includes(other.id)
          && other.pr.maxDepth > cand.pr.maxDepth + 0.05
          && pt[0] >= other.pr.box2[0] && pt[0] <= other.pr.box2[2]
          && pt[1] >= other.pr.box2[1] && pt[1] <= other.pr.box2[3]
        ));
        let sep = Infinity;
        const S = toSheet(v, pt);
        for (const ca of chosenAnchors) {
          const d = Math.hypot(S[0] - ca[0], S[1] - ca[1]);
          if (d < sep) sep = d;
        }
        const cx = (u0 + u1) * 0.5, cy = (v0 + v1) * 0.5;
        const centerDist = Math.hypot(pt[0] - cx, pt[1] - cy);
        const sc = (covered ? -1000 : 0) + cand.pr.maxDepth * 0.05 + Math.min(sep, 40) * 2 - centerDist * 0.1;
        if (sc > bestScore) {
          bestScore = sc;
          bestCand = { itemId: cand.id, anchor: [pt[0], pt[1]], tip: thin ? 'arrow' : 'dot' };
        }
      }
    }
    return bestCand;
  }
  async function autoBalloons(opts = {}) {
    await ensureProjections();
    const sh = dwg();
    const rows = bomItems(bomData);
    if (!rows.length) {
      UI.toast('Noch keine Teile für Positionsnummern vorhanden.', { icon: 'info' });
      return [];
    }
    const showTable = opts.showTable !== false;
    const simSh = showTable ? { ...sh, bomTable: { ...(sh.bomTable || { pos: null }), show: true } } : sh;
    const lay = computeLayout(simSh);
    const partsById = new Map(((bomMeasure && bomMeasure.parts) || []).map((p) => [p.id, p]));
    const vName = opts.view && lay.views[opts.view] ? opts.view : chooseBalloonView(simSh, lay, rows, partsById);
    const v = vName && lay.views[vName];
    if (!v || !v.geo || !v.geo.box) {
      UI.toast('Keine sichtbare Ansicht für Positionsnummern gefunden.', { icon: 'info' });
      return [];
    }
    const basis = viewBasis(vName, simSh);
    const allProjected = [];
    for (const [id, part] of partsById.entries()) {
      const pr = projectPartInView(part, basis, explodePartOffset(vName, id));
      if (pr) allProjected.push({ id, pr });
    }
    const st = sheetDimStyle(sh);
    const FS = clamp(st.fontSize * 1.05, 2.8, 7.5);
    const R = clamp(FS * 1.15, 3.6, 8.0);
    const b = v.geo.box;
    const vTL = toSheetRaw(v, [b[0], b[3]]), vBR = toSheetRaw(v, [b[2], b[1]]);
    const vCx = (vTL[0] + vBR[0]) * 0.5, vCy = (vTL[1] + vBR[1]) * 0.5;
    const chosenAnchors = [];
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pick = pickRowAnchorInView(row, vName, v, basis, partsById, allProjected, chosenAnchors);
      const A = toSheet(v, pick.anchor);
      chosenAnchors.push(A);
      let dx = A[0] - vCx, dy = A[1] - vCy;
      if (Math.hypot(dx, dy) < 1) {
        const ang = -Math.PI / 4 + (i * Math.PI * 2) / Math.max(1, rows.length);
        dx = Math.cos(ang); dy = Math.sin(ang);
      }
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const margin = Math.max(10, R * 2.5);
      const tX = ux > 1e-6 ? (vBR[0] + margin - A[0]) / ux : ux < -1e-6 ? (vTL[0] - margin - A[0]) / ux : Infinity;
      const tY = uy > 1e-6 ? (vBR[1] + margin - A[1]) / uy : uy < -1e-6 ? (vTL[1] - margin - A[1]) / uy : Infinity;
      const tOut = clamp(Math.min(tX, tY), 10, 46);
      let C = clampBalloonCenter(A[0] + ux * tOut, A[1] + uy * tOut, R, lay.frame, lay.tb, lay.bomRect);
      items.push({ row, pick, A, C });
    }
    const minSep = R * 2.6 + 2;
    for (let it = 0; it < 18; it++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const dx = items[j].C[0] - items[i].C[0], dy = items[j].C[1] - items[i].C[1];
          const d = Math.hypot(dx, dy);
          if (d < minSep) {
            const push = (minSep - d) * 0.55;
            const ux = d > 1e-4 ? dx / d : Math.cos((i + 1) * 1.1);
            const uy = d > 1e-4 ? dy / d : Math.sin((i + 1) * 1.1);
            items[i].C = clampBalloonCenter(items[i].C[0] - ux * push, items[i].C[1] - uy * push, R, lay.frame, lay.tb, lay.bomRect);
            items[j].C = clampBalloonCenter(items[j].C[0] + ux * push, items[j].C[1] + uy * push, R, lay.frame, lay.tb, lay.bomRect);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    const created = items.map(({ row, pick, A, C }) => ({
      id: uid('bl'),
      view: vName,
      itemId: pick.itemId,
      bomKey: row.key,
      pos: row.pos,
      anchor: [pick.anchor[0], pick.anchor[1]],
      offset: [round(C[0] - A[0], 2), round(C[1] - A[1], 2)],
      tip: pick.tip,
    }));
    App.change('Positionsnummern gesetzt', () => {
      const d = dwg();
      d.balloons = created;
      if (showTable) d.bomTable = { ...(d.bomTable || { pos: null }), show: true };
    });
    selDim = null;
    tool = null;
    toolState = null;
    if (svg) svg.style.cursor = '';
    UI.hint(null);
    Panels.renderTools();
    render();
    Panels.renderRight();
    UI.toast(`${created.length} Positionsnummer${created.length === 1 ? '' : 'n'} gesetzt.`, { icon: 'list', ms: 2400 });
    return created;
  }
  function pickBalloonTarget(P) {
    const name = leaderViewAt(P);
    const rows = bomItems(bomData);
    if (!name || !layout || !layout.views[name]) {
      const r0 = rows[0] || null;
      return {
        view: null,
        anchor: [P[0], P[1]],
        sheetPt: [P[0], P[1]],
        itemId: r0 && r0.ids[0] ? r0.ids[0] : null,
        bomKey: r0 ? r0.key : null,
        pos: r0 ? r0.pos : 1,
        autoTip: 'arrow',
      };
    }
    const v = layout.views[name];
    const q = toView(v, P);
    const basis = viewBasis(name, dwg());
    const partsById = new Map(((bomMeasure && bomMeasure.parts) || []).map((p) => [p.id, p]));
    let hitRow = null, hitItemId = null, bestDepth = -Infinity, bestDist = Infinity;
    for (const row of rows) {
      for (const id of row.ids) {
        const pr = projectPartInView(partsById.get(id), basis);
        if (!pr) continue;
        const [u0, v0, u1, v1] = pr.box2;
        const inside = q[0] >= u0 - 1e-3 && q[0] <= u1 + 1e-3 && q[1] >= v0 - 1e-3 && q[1] <= v1 + 1e-3;
        if (inside) {
          if (pr.maxDepth > bestDepth) { bestDepth = pr.maxDepth; hitRow = row; hitItemId = id; bestDist = 0; }
        } else if (bestDepth === -Infinity) {
          const dx = q[0] < u0 ? u0 - q[0] : q[0] > u1 ? q[0] - u1 : 0;
          const dy = q[1] < v0 ? v0 - q[1] : q[1] > v1 ? q[1] - v1 : 0;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) { bestDist = d; hitRow = row; hitItemId = id; }
        }
      }
    }
    const lt = pickLeaderTarget(P);
    if (!hitRow && rows.length) { hitRow = rows[0]; hitItemId = rows[0].ids[0] || null; }
    return {
      view: lt.view || name,
      anchor: lt.view ? lt.anchor : q,
      sheetPt: lt.view ? lt.sheetPt : [P[0], P[1]],
      itemId: hitItemId,
      bomKey: hitRow ? hitRow.key : null,
      pos: hitRow ? hitRow.pos : 1,
      autoTip: lt.targetKind === 'edge' ? 'arrow' : 'dot',
    };
  }
  function addBalloon(opts = {}) {
    const bl = {
      id: uid('bl'),
      view: opts.view || null,
      itemId: opts.itemId || null,
      bomKey: opts.bomKey || null,
      pos: Math.max(1, Math.round(Number(opts.pos) || 1)),
      anchor: Array.isArray(opts.anchor) ? [Number(opts.anchor[0]) || 0, Number(opts.anchor[1]) || 0] : [0, 0],
      offset: Array.isArray(opts.offset) ? [Number(opts.offset[0]) || 0, Number(opts.offset[1]) || 0] : [14, -12],
      tip: opts.tip === 'arrow' ? 'arrow' : 'dot',
    };
    App.change('Positionsnummer hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.balloons)) d.balloons = [];
      d.balloons.push(bl);
    });
    selDim = bl.id;
    render(); Panels.renderRight();
    return bl;
  }
  function updateBalloon(id, patch = {}) {
    let changed = false;
    App.change('Positionsnummer geändert', () => {
      const bl = (dwg().balloons || []).find((x) => x.id === id);
      if (!bl) return;
      if (patch.pos != null) {
        const np = Math.max(1, Math.round(Number(patch.pos) || 1));
        if (np !== bl.pos) { bl.pos = np; changed = true; }
      }
      if ('itemId' in patch && patch.itemId !== bl.itemId) { bl.itemId = patch.itemId; changed = true; }
      if ('bomKey' in patch && patch.bomKey !== bl.bomKey) { bl.bomKey = patch.bomKey; changed = true; }
      if (patch.tip === 'arrow' || patch.tip === 'dot') {
        if (bl.tip !== patch.tip) { bl.tip = patch.tip; changed = true; }
      }
      if (Array.isArray(patch.offset) && patch.offset.length >= 2) {
        bl.offset = [Number(patch.offset[0]) || 0, Number(patch.offset[1]) || 0];
        changed = true;
      }
      if (Array.isArray(patch.anchor) && patch.anchor.length >= 2) {
        bl.anchor = [Number(patch.anchor[0]) || 0, Number(patch.anchor[1]) || 0];
        changed = true;
      }
    });
    if (changed) { render(); Panels.renderRight(); }
    return changed;
  }
  function removeBalloon(id) {
    const cur = (dwg().balloons || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Positionsnummer gelöscht', () => {
      const d = dwg();
      d.balloons = (d.balloons || []).filter((x) => x.id !== id);
    });
    if (selDim === id) selDim = null;
    render(); Panels.renderRight();
    return true;
  }
  function clearBalloons() {
    if (!(dwg().balloons || []).length) return false;
    App.change('Positionsnummern entfernt', () => {
      dwg().balloons = [];
    });
    if (selDim && String(selDim).startsWith('bl')) selDim = null;
    render(); Panels.renderRight();
    return true;
  }
  async function setBomTable(show) {
    const val = !!show;
    const cur = dwg();
    if ((cur.bomTable && !!cur.bomTable.show) === val) return false;
    await ensureProjections();
    App.change(val ? 'Stückliste eingeblendet' : 'Stückliste ausgeblendet', () => {
      const d = dwg();
      d.bomTable = { ...(d.bomTable || { pos: null }), show: val };
    });
    if (!val && selDim === '__bom__') selDim = null;
    render(); Panels.renderRight();
    return true;
  }
  function resetBomTablePos() {
    const d = dwg();
    if (!d.bomTable || !Array.isArray(d.bomTable.pos)) return false;
    App.change('Stücklisten-Lage zurückgesetzt', () => {
      const sh = dwg();
      if (sh.bomTable) sh.bomTable.pos = null;
    });
    render(); Panels.renderRight();
    return true;
  }
  function balloonClick(P) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const target = pickBalloonTarget(P);
      toolState = { stage: 1, target, P };
      render();
      return;
    }
    const target = st.target;
    const v = target.view && layout && layout.views[target.view];
    const A = v ? toSheet(v, target.anchor) : target.anchor;
    let offset = [P[0] - A[0], P[1] - A[1]];
    if (Math.hypot(offset[0], offset[1]) < 4) offset = [14, -12];
    toolState = { stage: 0 };
    addBalloon({
      view: target.view,
      itemId: target.itemId,
      bomKey: target.bomKey,
      pos: target.pos,
      anchor: target.anchor,
      offset,
      tip: target.autoTip,
    });
  }
  function previewBalloon(lines, texts) {
    const st = toolState;
    if (!st) return;
    if (st.stage === 0 && st.target && st.target.sheetPt) {
      const S = st.target.sheetPt;
      const r = st.target.autoTip === 'dot' ? Math.max(0.9, 1.1 / zoom) : (1.3 / zoom) * 1.5;
      lines.push({ circle: [S[0], S[1], r], cls: st.target.autoTip === 'dot' ? 'balloon-dot' : 'snap' });
      return;
    }
    if (st.stage === 1 && st.target && st.P) {
      const v = st.target.view && layout && layout.views[st.target.view];
      const A = v ? toSheet(v, st.target.anchor) : st.target.anchor;
      let offset = [st.P[0] - A[0], st.P[1] - A[1]];
      if (Math.hypot(offset[0], offset[1]) < 4) offset = [14, -12];
      drawBalloon({
        id: '__blprev',
        view: st.target.view,
        itemId: st.target.itemId,
        bomKey: st.target.bomKey,
        pos: st.target.pos,
        anchor: st.target.anchor,
        offset,
        tip: st.target.autoTip,
      }, lines, texts, layout, dwg(), bomData);
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
    if (dragBalloon) {
      const P = sheetPt(e);
      dragBalloon.curOffset = [dragBalloon.origOffset[0] + (P[0] - dragBalloon.startP[0]), dragBalloon.origOffset[1] + (P[1] - dragBalloon.startP[1])];
      if (Math.hypot(P[0] - dragBalloon.startP[0], P[1] - dragBalloon.startP[1]) > 0.5) dragBalloon.moved = true;
      render();
      return;
    }
    if (dragBom) {
      const P = sheetPt(e);
      dragBom.curPos = [dragBom.origPos[0] + (P[0] - dragBom.startP[0]), dragBom.origPos[1] + (P[1] - dragBom.startP[1])];
      if (Math.hypot(P[0] - dragBom.startP[0], P[1] - dragBom.startP[1]) > 0.5) dragBom.moved = true;
      render();
      return;
    }
    if (dragView) {
      const P = sheetPt(e);
      const dx = P[0] - dragView.startP[0], dy = P[1] - dragView.startP[1];
      if (Math.hypot(dx, dy) > 1.2) dragView.moved = true;
      if (dragView.kind === 'main') dragView.curOff = [dragView.origOff[0] + dx, dragView.origOff[1] + dy];
      else if (dragView.kind === 'section' || dragView.kind === 'aux') dragView.curPos = [dragView.origPos[0] + dx, dragView.origPos[1] + dy];
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
    if (tool === 'balloon') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      if (toolState.stage === 0) toolState.target = pickBalloonTarget(P);
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
      } else if (dimMode === 'arclen') {
        toolState.hoverArc = (toolState.stage === 0 && name) ? arcAt(name, P) : null;
        toolState.snap = null;
      } else if (dimMode === 'chamfer') {
        toolState.hoverChamfer = name ? chamferEdgeAt(name, P) : null;
        toolState.snap = null;
      } else if (dimMode === 'ang') {
        toolState.hoverEdge = (toolState.stage < 2 && name) ? edgeAt(name, P, true) : null;
        toolState.snap = null;
      } else if (dimMode === 'ordinate') {
        toolState.snap = name ? pickOrdinatePoint(name, P) : null;
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
      if (sectionMode === 'stepped') {
        if (toolState.stage === 1 && toolState.view && toolState.pts && toolState.pts.length === 1) {
          toolState.cur = snapSectionPt(toolState.view, P, toolState.pts[0], e.shiftKey, e.altKey);
        } else if (toolState.stage === 2 && toolState.view) {
          toolState.cur = snapSteppedNext(toolState, P);
        } else {
          const name = sectionParentAt(P);
          toolState.hoverView = name;
          toolState.snapPt = name ? snapSectionPt(name, P, null, e.shiftKey, e.altKey) : null;
        }
      } else if (sectionMode === 'breakout') {
        if (toolState.stage >= 1 && toolState.view) {
          const v = layout && layout.views && layout.views[toolState.view];
          if (v) toolState.cur = toView(v, P);
        } else {
          const name = sectionParentAt(P);
          toolState.hoverView = name;
          toolState.snapPt = name ? snapSectionPt(name, P, null, e.shiftKey, e.altKey) : null;
        }
      } else if (toolState.stage === 1 && toolState.view) {
        toolState.b = snapSectionPt(toolState.view, P, toolState.a, e.shiftKey, e.altKey);
      } else {
        const name = sectionParentAt(P);
        toolState.hoverView = name;
        toolState.snapPt = name ? snapSectionPt(name, P, null, e.shiftKey, e.altKey) : null;
      }
      render();
    } else if (tool === 'break') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      if (toolState.stage === 0) {
        const vn = breakViewAt(P);
        toolState.hoverView = vn;
        toolState.dir = vn ? resolveBreakDir(vn, e.shiftKey) : (breakDraft.dir === 'v' ? 'v' : 'h');
      } else if (toolState.stage === 1 && toolState.view) {
        const v = layout && layout.views[toolState.view];
        if (v) toolState.q = toView(v, P);
      }
      render();
    } else if (tool === 'aux') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      const vn = auxParentAt(P);
      toolState.hoverView = vn;
      toolState.hoverEdge = vn ? edgeAt(vn, P, false) : null;
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
    if (tool === 'balloon') { balloonClick(P); return; }
    if (tool === 'break') { breakClick(P, e); return; }
    if (tool === 'aux') { auxClick(P); return; }
    if (tool && tool.startsWith('free-')) { freeDown(e); return; }
    const t = e.target.closest && e.target.closest('[data-id]');
    selDim = t ? t.dataset.id : centerAt(P);
    if (selDim && layout && layout.views[selDim] && layout.views[selDim].detail) {
      dragDetail = { id: selDim, startP: P, origPos: [...layout.views[selDim].sheetCenter], curPos: null, moved: false };
    } else if (selDim && (dwg().notes || []).some((x) => x.id === selDim)) {
      const noteObj = dwg().notes.find((x) => x.id === selDim);
      if (e.detail === 2) { editNoteText(selDim); render(); Panels.renderRight(); return; }
      dragNote = { id: selDim, startP: P, origElbow: [...(noteObj.elbow || [14, -10])], curElbow: null, moved: false };
    } else if (selDim && (dwg().balloons || []).some((x) => x.id === selDim)) {
      const blObj = dwg().balloons.find((x) => x.id === selDim);
      dragBalloon = { id: selDim, startP: P, origOffset: [...(blObj.offset || [14, -12])], curOffset: null, moved: false };
    } else if (selDim === '__bom__' && layout && layout.bomRect) {
      dragBom = { startP: P, origPos: [layout.bomRect.x, layout.bomRect.y], curPos: null, moved: false };
    } else if (!selDim) {
      const hitV = viewAtAll(P);
      if (hitV) selView = hitV;
      const mv = movableViewAt(P);
      if (mv && String(mv).startsWith('sec_')) {
        const v = layout.views[mv], b = v.geo.box, secId = mv.slice(4);
        dragView = { kind: 'section', secId, startP: P, origPos: [v.ox + b[0] * v.s, v.oy - b[3] * v.s], curPos: null, moved: false };
      } else if (mv && String(mv).startsWith('aux_')) {
        const v = layout.views[mv], b = v.geo.box, auxId = mv.slice(4);
        dragView = { kind: 'aux', auxId, startP: P, origPos: [v.ox + b[0] * v.s, v.oy - b[3] * v.s], curPos: null, moved: false };
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
    if (dragBalloon) {
      const d = dragBalloon;
      dragBalloon = null;
      if (d.moved && d.curOffset) updateBalloon(d.id, { offset: d.curOffset });
      return;
    }
    if (dragBom) {
      const d = dragBom;
      dragBom = null;
      if (d.moved && d.curPos) {
        const lay = layout || computeLayout(dwg());
        const br = lay.bomRect;
        const w = br ? br.w : lay.tb.w, h = br ? br.h : 20;
        const nx = clamp(d.curPos[0], lay.frame.x, lay.frame.x + lay.frame.w - w);
        const ny = clamp(d.curPos[1], lay.frame.y, lay.frame.y + lay.frame.h - h);
        App.change('Stückliste verschoben', () => {
          const sh = dwg();
          sh.bomTable = { ...(sh.bomTable || { show: true }), show: true, pos: [round(nx, 2), round(ny, 2)] };
        });
        render(); Panels.renderRight();
      }
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
        } else if (d.kind === 'aux' && d.curPos) {
          App.change('Ansicht verschoben', () => {
            const a = (dwg().auxViews || []).find((x) => x.id === d.auxId);
            if (a) a.pos = [d.curPos[0], d.curPos[1]];
          });
          render(); Panels.renderRight();
        }
      }
      return;
    }
    if (!e || e.button !== 0 || tool !== 'section' || !toolState || toolState.stage !== 1 || !svg) return;
    if (sectionMode === 'breakout') {
      if (toolState.dragging && Array.isArray(toolState.pts) && toolState.pts.length === 1) {
        toolState.dragging = false;
        const P = sheetPt(e);
        const downP = toolState.downSheet || P;
        if (Math.hypot(P[0] - downP[0], P[1] - downP[1]) >= 4) {
          const v = layout && layout.views && layout.views[toolState.view];
          if (v) {
            const p0 = toolState.pts[0];
            const p1 = toView(v, P);
            if (Math.abs(p1[0] - p0[0]) >= 1 && Math.abs(p1[1] - p0[1]) >= 1) {
              addSection({ type: 'breakout', parent: toolState.view, region: [p0, [p1[0], p0[1]], p1, [p0[0], p1[1]]], depth: sectionDraft.depth });
              return;
            }
          }
        }
        render(); Panels.renderRight();
      }
      return;
    }
    if (sectionMode === 'stepped') return;
    const P = sheetPt(e);
    const downP = toolState.downSheet || P;
    if (Math.hypot(P[0] - downP[0], P[1] - downP[1]) < 4) return;
    const a = toolState.a;
    const b = snapSectionPt(toolState.view, P, a, e.shiftKey, e.altKey);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2) {
      addSection({
        type: sectionMode === 'half' ? 'half' : 'full',
        parent: toolState.view,
        a,
        b,
        ...(sectionMode === 'half' ? { halfAxis: sectionDraft.halfAxis, halfSide: sectionDraft.halfSide } : {}),
      });
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
  function snapSteppedNext(st, P) {
    const v = layout && layout.views && layout.views[st.view];
    if (!v || !st.pts || !st.pts.length) return [0, 0];
    const q = toView(v, P);
    const last = st.pts[st.pts.length - 1];
    const t2 = st.t2 || [1, 0];
    const n2 = [-t2[1], t2[0]];
    if (st.pts.length % 2 === 0) {
      const proj = (q[0] - last[0]) * n2[0] + (q[1] - last[1]) * n2[1];
      return [last[0] + n2[0] * proj, last[1] + n2[1] * proj];
    }
    const proj = (q[0] - last[0]) * t2[0] + (q[1] - last[1]) * t2[1];
    return [last[0] + t2[0] * proj, last[1] + t2[1] * proj];
  }
  function finishSectionTool() {
    if (tool !== 'section' || !toolState || !toolState.view) return false;
    if (sectionMode === 'stepped') {
      const pts = (toolState.pts || []).map((p) => [...p]);
      if (pts.length === 3 && toolState.cur) {
        const last = pts[pts.length - 1];
        if (Math.hypot(toolState.cur[0] - last[0], toolState.cur[1] - last[1]) >= 1) pts.push([...toolState.cur]);
      } else if (pts.length >= 5 && pts.length % 2 === 1) {
        const last = pts[pts.length - 1];
        if (toolState.cur && Math.hypot(toolState.cur[0] - last[0], toolState.cur[1] - last[1]) >= 1) pts.push([...toolState.cur]);
        else pts.pop();
      }
      if (pts.length < 4) { UI.toast('Klicke mindestens 4 Punkte für einen abgesetzten Schnitt.', { icon: 'info', ms: 2200 }); return false; }
      addSection({ type: 'stepped', parent: toolState.view, pts });
      return true;
    }
    if (sectionMode === 'breakout') {
      const region = (toolState.pts || []).map((p) => [...p]);
      if (region.length < 3) { UI.toast('Klicke mindestens 3 Punkte oder ziehe ein Rechteck auf.', { icon: 'info', ms: 2200 }); return false; }
      addSection({ type: 'breakout', parent: toolState.view, region, depth: sectionDraft.depth });
      return true;
    }
    return false;
  }
  function sectionDown(P, e) {
    const st = toolState || { stage: 0 };
    if (sectionMode === 'stepped') {
      if (st.stage === 0) {
        const name = sectionParentAt(P);
        if (!name) { UI.toast('Klicke den Startpunkt des abgesetzten Schnitts in der Vorder-, Drauf- oder Seitenansicht.', { icon: 'info', ms: 2200 }); return; }
        const a = snapSectionPt(name, P, null, e.shiftKey, e.altKey);
        toolState = { stage: 1, view: name, pts: [a], cur: a };
        render(); Panels.renderRight();
      } else if (st.stage === 1) {
        const b = snapSectionPt(st.view, P, st.pts[0], e.shiftKey, e.altKey);
        const L = Math.hypot(b[0] - st.pts[0][0], b[1] - st.pts[0][1]);
        if (L < 1.5) return;
        const t2 = [(b[0] - st.pts[0][0]) / L, (b[1] - st.pts[0][1]) / L];
        toolState = { stage: 2, view: st.view, pts: [st.pts[0], b], cur: b, t2 };
        render(); Panels.renderRight();
      } else if (st.stage === 2) {
        const nextPt = snapSteppedNext(st, P);
        const last = st.pts[st.pts.length - 1];
        if (st.pts.length >= 4 && (e.detail === 2 || Math.hypot(nextPt[0] - last[0], nextPt[1] - last[1]) < 1.0)) {
          finishSectionTool();
          return;
        }
        if (Math.hypot(nextPt[0] - last[0], nextPt[1] - last[1]) < 0.8) return;
        st.pts.push(nextPt);
        st.cur = nextPt;
        render(); Panels.renderRight();
      }
      return;
    }
    if (sectionMode === 'breakout') {
      if (st.stage === 0) {
        const name = sectionParentAt(P);
        if (!name) { UI.toast('Zieh ein Rechteck oder klicke einen Umriss in der Vorder-, Drauf- oder Seitenansicht.', { icon: 'info', ms: 2200 }); return; }
        const v = layout.views[name];
        const p0 = toView(v, P);
        toolState = { stage: 1, view: name, pts: [p0], cur: p0, downSheet: P, dragging: true };
        render(); Panels.renderRight();
      } else if (st.stage === 1 && !st.dragging) {
        const v = layout.views[st.view];
        if (!v) return;
        const q = toView(v, P);
        const closeTol = Math.max(2, 5 / zoom / v.s);
        if (st.pts.length >= 3 && (e.detail === 2 || Math.hypot(q[0] - st.pts[0][0], q[1] - st.pts[0][1]) <= closeTol)) {
          finishSectionTool();
          return;
        }
        const last = st.pts[st.pts.length - 1];
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.5) return;
        st.pts.push(q);
        st.cur = q;
        render(); Panels.renderRight();
      }
      return;
    }
    if (st.stage === 0) {
      const name = sectionParentAt(P);
      if (!name) { UI.toast('Zieh oder klick eine Schnittlinie durch die Vorder-, Drauf- oder Seitenansicht.', { icon: 'info', ms: 2200 }); return; }
      const a = snapSectionPt(name, P, null, e.shiftKey, e.altKey);
      toolState = { stage: 1, view: name, a, b: a, downSheet: P, P };
      render();
    } else if (st.stage === 1) {
      const b = snapSectionPt(st.view, P, st.a, e.shiftKey, e.altKey);
      if (Math.hypot(b[0] - st.a[0], b[1] - st.a[1]) < 2) return;
      addSection({
        type: sectionMode === 'half' ? 'half' : 'full',
        parent: st.view,
        a: st.a,
        b,
        ...(sectionMode === 'half' ? { halfAxis: sectionDraft.halfAxis, halfSide: sectionDraft.halfSide } : {}),
      });
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
    if (sectionMode === 'stepped' && st.stage >= 1 && st.view && Array.isArray(st.pts)) {
      const v = layout.views[st.view];
      if (!v) return;
      const pts = st.cur ? [...st.pts, st.cur] : st.pts.slice();
      if (pts.length >= 2) {
        const S = pts.map((p) => toSheet(v, p));
        if (pts.length >= 2 && Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]) >= 0.5) {
          drawSectionLine(v, { id: '__secprev', type: 'stepped', label: nextSectionLabel(), parent: st.view, pts, flip: false }, lines, texts);
        }
      }
      return;
    }
    if (sectionMode === 'breakout' && st.stage >= 1 && st.view && Array.isArray(st.pts)) {
      const v = layout.views[st.view];
      if (!v) return;
      if (st.dragging && st.pts.length === 1 && st.cur) {
        const p0 = st.pts[0], p1 = st.cur;
        const reg = [p0, [p1[0], p0[1]], p1, [p0[0], p1[1]]];
        const S = reg.map((p) => toSheet(v, p));
        S.push([...S[0]]);
        lines.push({ pts: S, cls: 'prev' });
      } else {
        const pts = st.cur ? [...st.pts, st.cur] : st.pts.slice();
        if (pts.length >= 2) lines.push({ pts: pts.map((p) => toSheet(v, p)), cls: 'prev' });
        if (st.pts.length >= 3 && st.cur) {
          lines.push({ pts: [toSheet(v, st.cur), toSheet(v, st.pts[0])], cls: 'prev' });
          const S0 = toSheet(v, st.pts[0]);
          lines.push({ circle: [S0[0], S0[1], (1.4 / zoom) * 1.4], cls: 'snap' });
        }
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
      drawSectionLine(v, {
        id: '__secprev',
        type: sectionMode === 'half' ? 'half' : 'full',
        label: lbl,
        parent: st.view,
        a: st.a,
        b: st.b,
        flip: false,
        ...(sectionMode === 'half' ? { halfAxis: sectionDraft.halfAxis, halfSide: sectionDraft.halfSide } : {}),
      }, lines, texts);
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
    if (!opts || !opts.parent) return null;
    const type = opts.type === 'half' || opts.type === 'stepped' || opts.type === 'breakout' ? opts.type : 'full';
    if (type !== 'full' && isSimpleMode()) {
      UI.toast(T('draw.secProOnly'), { icon: 'info' });
      return null;
    }
    if (type === 'stepped') {
      if (!Array.isArray(opts.pts) || opts.pts.length < 4) return null;
    } else if (type === 'breakout') {
      if (!Array.isArray(opts.region) || opts.region.length < 3) return null;
    } else {
      if (!opts.a || !opts.b || Math.hypot(opts.b[0] - opts.a[0], opts.b[1] - opts.a[1]) < 1e-3) return null;
    }
    let sec = null;
    App.change('Schnittansicht hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.sections)) d.sections = [];
      sec = normalizeSection({
        id: uid('sec'),
        label: opts.label || nextSectionLabel(d),
        parent: opts.parent,
        type,
        a: opts.a,
        b: opts.b,
        pts: opts.pts,
        region: opts.region,
        halfAxis: opts.halfAxis,
        halfSide: opts.halfSide,
        split: opts.split,
        depth: opts.depth,
        flip: !!opts.flip,
        pos: opts.pos || null,
      });
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
  async function updateSection(id, patch = {}) {
    const cur = (dwg().sections || []).find((x) => x.id === id);
    if (!cur || !patch || typeof patch !== 'object') return false;
    let changed = false;
    App.change('Schnittansicht geändert', () => {
      const s = (dwg().sections || []).find((x) => x.id === id);
      if (!s) return;
      if (patch.label != null) {
        const lbl = String(patch.label).trim().slice(0, 3);
        if (lbl && lbl !== s.label) { s.label = lbl; changed = true; }
      }
      if (patch.flip != null && !!patch.flip !== !!s.flip) { s.flip = !!patch.flip; changed = true; }
      if (patch.halfAxis === 'v' || patch.halfAxis === 'h') {
        if (s.halfAxis !== patch.halfAxis) {
          s.halfAxis = patch.halfAxis;
          if (!patch.halfSide) {
            s.halfSide = patch.halfAxis === 'h'
              ? (s.halfSide === 'left' ? 'top' : 'bottom')
              : (s.halfSide === 'top' ? 'left' : 'right');
          }
          changed = true;
        }
      }
      if (patch.halfSide === 'left' || patch.halfSide === 'right' || patch.halfSide === 'top' || patch.halfSide === 'bottom') {
        if (s.halfSide !== patch.halfSide) { s.halfSide = patch.halfSide; changed = true; }
      }
      if ('split' in patch) {
        const spVal = patch.split === null || patch.split === '' ? undefined : Number(patch.split);
        if (spVal === undefined) { if (s.split !== undefined) { delete s.split; changed = true; } }
        else if (Number.isFinite(spVal) && spVal !== s.split) { s.split = spVal; changed = true; }
      }
      if ('depth' in patch) {
        const dVal = patch.depth === null || patch.depth === '' ? null : Number(patch.depth);
        if (dVal === null) { if (s.depth !== null) { s.depth = null; changed = true; } }
        else if (Number.isFinite(dVal) && dVal > 0 && dVal !== s.depth) { s.depth = dVal; changed = true; }
      }
      if (patch.pos === null) { if (s.pos !== null) { s.pos = null; changed = true; } }
      else if (Array.isArray(patch.pos) && patch.pos.length >= 2) {
        s.pos = [Number(patch.pos[0]) || 0, Number(patch.pos[1]) || 0];
        changed = true;
      }
    });
    if (!changed) return false;
    await ensureProjections();
    render();
    Panels.renderRight();
    return true;
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
      d.balloons = (d.balloons || []).filter((x) => x.view !== 'sec_' + id);
      d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|sec_' + id + '|'));
    });
    if (selDim === id) selDim = null;
    render();
    Panels.renderRight();
    return true;
  }
  // ---------- Unterbrochene Ansicht: Werkzeug & Verwaltung (ZE-16) ----------
  function breakViewAt(P) {
    if (!layout || !layout.views) return null;
    for (const [name, v] of Object.entries(layout.views)) {
      if (name === 'free' || v.detail || v.is3d || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 8 && P[0] <= B[0] + 8 && P[1] >= A[1] - 8 && P[1] <= B[1] + 8) return name;
    }
    return null;
  }
  function resolveBreakDir(viewName, shiftKey = false) {
    let dir;
    if (breakDraft.dir === 'h' || breakDraft.dir === 'v') dir = breakDraft.dir;
    else {
      const v = layout && layout.views && layout.views[viewName];
      const tb = v && v.geo && (v.geo.trueBox || v.geo.box);
      dir = tb && (tb[2] - tb[0]) >= (tb[3] - tb[1]) ? 'h' : 'v';
    }
    return shiftKey ? (dir === 'h' ? 'v' : 'h') : dir;
  }
  function breaks(viewName = null, sh = dwg()) {
    const list = (sh.breaks || []).slice();
    return viewName ? list.filter((b) => b.view === viewName) : list;
  }
  function addBreak(opts = {}) {
    if (!opts || !opts.view) return null;
    const dir = opts.dir === 'v' ? 'v' : 'h';
    let a = Number(opts.a), b = Number(opts.b);
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a > b) [a, b] = [b, a];
    if (b - a < 1) {
      UI.toast('Der Unterbrechungs-Bereich ist zu schmal.', { icon: 'info', ms: 2000 });
      return null;
    }
    const gap = clamp(Number(opts.gap != null ? opts.gap : breakDraft.gap) || 6, 0.5, (b - a) * 0.45);
    const style = (opts.style || breakDraft.style) === 'wave' ? 'wave' : 'zigzag';
    const brk = { id: uid('brk'), view: opts.view, dir, a, b, gap, style };
    App.change('Ansicht unterbrochen', () => {
      const d = dwg();
      if (!Array.isArray(d.breaks)) d.breaks = [];
      d.breaks.push(brk);
    });
    selDim = brk.id;
    render();
    Panels.renderRight();
    return brk;
  }
  function updateBreak(id, patch = {}) {
    let changed = false;
    App.change('Unterbrechung geändert', () => {
      const brk = (dwg().breaks || []).find((x) => x.id === id);
      if (!brk) return;
      let na = patch.a != null && isFinite(Number(patch.a)) ? Number(patch.a) : brk.a;
      let nb = patch.b != null && isFinite(Number(patch.b)) ? Number(patch.b) : brk.b;
      if (na > nb) [na, nb] = [nb, na];
      if (nb - na >= 1 && (na !== brk.a || nb !== brk.b)) { brk.a = na; brk.b = nb; changed = true; }
      if (patch.gap != null && isFinite(Number(patch.gap))) {
        const ng = clamp(Number(patch.gap), 0.5, Math.max(0.5, (brk.b - brk.a) * 0.45));
        if (ng !== brk.gap) { brk.gap = ng; changed = true; }
      }
      if (patch.style === 'zigzag' || patch.style === 'wave') {
        if (brk.style !== patch.style) { brk.style = patch.style; changed = true; }
      }
      if (patch.dir === 'h' || patch.dir === 'v') {
        if (brk.dir !== patch.dir) { brk.dir = patch.dir; changed = true; }
      }
    });
    if (changed) { render(); Panels.renderRight(); }
    return changed;
  }
  function removeBreak(id) {
    const cur = (dwg().breaks || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Unterbrechung entfernt', () => {
      const d = dwg();
      d.breaks = (d.breaks || []).filter((x) => x.id !== id);
    });
    if (selDim === id) selDim = null;
    render();
    Panels.renderRight();
    return true;
  }
  function breakClick(P, e) {
    const st = toolState || { stage: 0 };
    if (st.stage === 0) {
      const vn = breakViewAt(P);
      if (!vn) { UI.toast('Klick in eine Ansicht, um die erste Bruchlinie zu setzen.', { icon: 'info', ms: 2200 }); return; }
      const v = layout.views[vn];
      const q = toView(v, P);
      const dir = resolveBreakDir(vn, e && e.shiftKey);
      toolState = { stage: 1, view: vn, dir, p0: q, q, P };
      render();
      return;
    }
    const v = layout.views[st.view];
    if (!v) { toolState = { stage: 0 }; render(); return; }
    const q = toView(v, P);
    const c0 = st.dir === 'h' ? st.p0[0] : st.p0[1];
    const c1 = st.dir === 'h' ? q[0] : q[1];
    if (Math.abs(c1 - c0) < 2) {
      UI.toast('Zweiter Klick liegt zu nah am ersten – wähle den Bereich zum Kürzen.', { icon: 'info', ms: 2000 });
      return;
    }
    const brk = addBreak({ view: st.view, dir: st.dir, a: c0, b: c1, gap: breakDraft.gap, style: breakDraft.style });
    if (brk) setTool(null);
  }
  function previewBreak(lines) {
    const st = toolState;
    if (!st || !layout || !layout.views) return;
    if (st.stage === 0 && st.hoverView && st.P) {
      const v = layout.views[st.hoverView];
      if (!v) return;
      const b = v.geo.box;
      const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
      if ((st.dir || 'h') === 'h') lines.push({ pts: [[st.P[0], TL[1] - 2], [st.P[0], BR[1] + 2]], cls: 'prev' });
      else lines.push({ pts: [[TL[0] - 2, st.P[1]], [BR[0] + 2, st.P[1]]], cls: 'prev' });
      return;
    }
    if (st.stage === 1 && st.view && st.p0) {
      const v = layout.views[st.view];
      if (!v) return;
      const b = v.geo.box;
      const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
      const P0 = toSheet(v, st.p0);
      const P1 = st.q ? toSheet(v, st.q) : st.P;
      if (st.dir === 'h') {
        lines.push({ pts: [[P0[0], TL[1] - 2], [P0[0], BR[1] + 2]], cls: 'prev' });
        if (P1) lines.push({ pts: [[P1[0], TL[1] - 2], [P1[0], BR[1] + 2]], cls: 'prev' });
      } else {
        lines.push({ pts: [[TL[0] - 2, P0[1]], [BR[0] + 2, P0[1]]], cls: 'prev' });
        if (P1) lines.push({ pts: [[TL[0] - 2, P1[1]], [BR[0] + 2, P1[1]]], cls: 'prev' });
      }
    }
  }
  // ---------- Hilfsansicht senkrecht zu schräger Kante (ZE-17) ----------
  function auxParentAt(P) {
    if (!layout || !layout.views) return null;
    for (const [name, v] of Object.entries(layout.views)) {
      if (name === 'free' || v.detail || v.is3d || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const A = toSheetRaw(v, [b[0], b[3]]), B = toSheetRaw(v, [b[2], b[1]]);
      if (P[0] >= A[0] - 8 && P[0] <= B[0] + 8 && P[1] >= A[1] - 8 && P[1] <= B[1] + 8) return name;
    }
    return null;
  }
  function auxViews(sh = dwg()) { return (sh.auxViews || []).slice(); }
  function nextAuxLabel(sh = dwg()) {
    const used = new Set([
      ...(sh.auxViews || []).map((a) => String(a.label || '').toUpperCase()),
      ...(sh.sections || []).map((s) => String(s.label || '').toUpperCase()),
    ]);
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (const ch of letters) if (!used.has(ch)) return ch;
    let n = 1;
    while (used.has('A' + n)) n++;
    return 'A' + n;
  }
  async function addAuxView(opts = {}) {
    if (!opts || !opts.parent || !Array.isArray(opts.a) || !Array.isArray(opts.b)) return null;
    let a = [Number(opts.a[0]) || 0, Number(opts.a[1]) || 0];
    let b = [Number(opts.b[0]) || 0, Number(opts.b[1]) || 0];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) return null;
    if (!opts.keepOrder && layout && layout.views && layout.views[opts.parent] && layout.views[opts.parent].geo) {
      const gb = layout.views[opts.parent].geo.trueBox || layout.views[opts.parent].geo.box;
      const cx = (gb[0] + gb[2]) * 0.5, cy = (gb[1] + gb[3]) * 0.5;
      const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5;
      const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      const camX = -ty, camY = tx;
      if ((mx - cx) * camX + (my - cy) * camY < 0) [a, b] = [b, a];
    }
    let aux = null;
    App.change('Hilfsansicht hinzugefügt', () => {
      const d = dwg();
      if (!Array.isArray(d.auxViews)) d.auxViews = [];
      aux = {
        id: uid('aux'),
        label: opts.label || nextAuxLabel(d),
        parent: opts.parent,
        a,
        b,
        flip: !!opts.flip,
        pos: Array.isArray(opts.pos) ? [Number(opts.pos[0]) || 0, Number(opts.pos[1]) || 0] : null,
      };
      d.auxViews.push(aux);
    });
    selDim = aux.id;
    selView = 'aux_' + aux.id;
    tool = null;
    toolState = null;
    if (svg) svg.style.cursor = '';
    UI.hint(null);
    Panels.renderTools();
    await ensureProjections();
    render();
    Panels.renderRight();
    return aux;
  }
  async function flipAuxView(id) {
    const cur = (dwg().auxViews || []).find((x) => x.id === id);
    if (!cur) return false;
    App.change('Hilfsansicht umgekehrt', () => {
      const a = (dwg().auxViews || []).find((x) => x.id === id);
      if (a) a.flip = !a.flip;
    });
    await ensureProjections();
    render();
    Panels.renderRight();
    return true;
  }
  function removeAuxView(id) {
    const cur = (dwg().auxViews || []).find((x) => x.id === id);
    if (!cur) return false;
    const key = 'aux_' + id;
    App.change('Hilfsansicht gelöscht', () => {
      const d = dwg();
      d.auxViews = (d.auxViews || []).filter((x) => x.id !== id);
      d.dims = (d.dims || []).filter((x) => x.view !== key);
      d.notes = (d.notes || []).filter((x) => x.view !== key);
      d.balloons = (d.balloons || []).filter((x) => x.view !== key);
      d.breaks = (d.breaks || []).filter((x) => x.view !== key);
      d.hiddenCenters = (d.hiddenCenters || []).filter((cid) => !cid.startsWith('ctr|' + key + '|'));
      if (d.viewOpts) delete d.viewOpts[key];
    });
    if (selDim === id) selDim = null;
    if (selView === key) selView = currentViewKey();
    render();
    Panels.renderRight();
    return true;
  }
  function auxClick(P) {
    const vn = auxParentAt(P);
    if (!vn) { UI.toast('Klick auf eine gerade oder schräge Kante in einer Ansicht.', { icon: 'info', ms: 2200 }); return; }
    const ed = edgeAt(vn, P, false);
    if (!ed) { UI.toast('Klick direkt auf eine sichtbare Kante der Ansicht.', { icon: 'info', ms: 2200 }); return; }
    addAuxView({ parent: vn, a: ed.a, b: ed.b });
  }
  function previewAux(lines, texts) {
    const st = toolState;
    if (!st || !st.hoverView || !st.hoverEdge) return;
    const v = layout && layout.views && layout.views[st.hoverView];
    if (!v) return;
    let a = st.hoverEdge.a, b = st.hoverEdge.b;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const gb = v.geo.trueBox || v.geo.box;
    const cx = (gb[0] + gb[2]) * 0.5, cy = (gb[1] + gb[3]) * 0.5;
    const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5;
    const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
    if ((mx - cx) * (-ty) + (my - cy) * tx < 0) [a, b] = [b, a];
    lines.push({ pts: [toSheet(v, a), toSheet(v, b)], cls: 'prev' });
    drawAuxArrow(v, { id: '__auxprev', label: nextAuxLabel(), parent: st.hoverView, a, b, flip: false }, lines, texts);
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
    if (dimMode === 'arclen') {
      if (st.stage === 0) {
        const name = viewAt(P); if (!name) return;
        const arc = arcAt(name, P);
        if (!arc) { UI.toast(T('draw.toast.pickArc'), { icon: 'info', ms: 2000 }); return; }
        toolState = { ...st, stage: 1, view: name, arc, P };
        render();
        return;
      }
      if (st.stage === 1) {
        const v = layout.views[st.view]; if (!v || !st.arc) return;
        const q = toView(v, P);
        const rawOff = Math.hypot(q[0] - st.arc.c[0], q[1] - st.arc.c[1]) - st.arc.r;
        const minOff = 2 / v.s - st.arc.r;
        const off = Math.max(minOff, Math.abs(rawOff) < 2 / v.s ? 6 / v.s : rawOff);
        addDim({ view: st.view, type: 'arclen', c: st.arc.c, r: st.arc.r, a0: st.arc.a0, a1: st.arc.a1, off, ref: makeCircleRef(v, st.arc) });
        return;
      }
    }
    if (dimMode === 'ordinate') {
      if (st.stage === 0) {
        const name = viewAt(P); if (!name) return;
        const sn = pickOrdinatePoint(name, P);
        if (!sn) { UI.toast(T('draw.toast.pickOrigin'), { icon: 'info', ms: 2000 }); return; }
        toolState = { ...st, stage: 1, view: name, origin: sn.p, originEdge: sn.edge || null, preferDir: sn.preferDir || null, P };
      } else if (st.stage === 1) {
        const sn = pickOrdinatePoint(st.view, P); if (!sn) return;
        if (Math.hypot(sn.p[0] - st.origin[0], sn.p[1] - st.origin[1]) < 1e-4) return;
        toolState = { ...st, stage: 2, b: sn.p, bEdge: sn.edge || null, P };
      } else if (st.stage === 2) {
        const v = layout.views[st.view]; if (!v) return;
        const q = toView(v, P);
        const dir = ordinateDir(v, st.origin, st.b, q, st.preferDir);
        const linePos = dir === 'h' ? q[1] : q[0];
        const oRef = makePointRef(v, st.origin, st.originEdge), bRef = makePointRef(v, st.b, st.bEdge);
        const dimData = { view: st.view, type: 'ordinate', dir, linePos, origin: st.origin, pts: [st.b], ref: { kind: 'ordinate', origin: oRef, pts: [bRef] } };
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
          App.change('Koordinatenmaß hinzugefügt', () => { dwg().dims.push(dim); });
          selDim = dim.id;
          toolState = { stage: 3, view: st.view, dimId: dim.id, dir, linePos, P };
          Panels.renderRight();
        }
      } else if (st.stage === 3) {
        const hitView = viewAt(P);
        if (hitView && hitView !== st.view) { toolState = { stage: 0 }; render(); Panels.renderRight(); return; }
        const sn = pickOrdinatePoint(st.view, P);
        if (!sn) {
          if (!hitView) { toolState = { stage: 0 }; render(); Panels.renderRight(); }
          return;
        }
        const cur = dwg().dims.find((x) => x.id === st.dimId);
        if (!cur) { toolState = { stage: 0 }; render(); return; }
        const coord = st.dir === 'h' ? sn.p[0] : sn.p[1];
        const existing = [cur.origin, ...(cur.pts || [])].filter(Boolean);
        if (existing.some((p) => Math.abs((st.dir === 'h' ? p[0] : p[1]) - coord) < 1e-4)) return;
        const v = layout.views[st.view];
        const ptRef = v ? makePointRef(v, sn.p, sn.edge || null) : null;
        App.change('Koordinatenmaß erweitert', () => {
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
    if (dimMode === 'arclen') {
      const v = layout.views[st.view || st.hoverView];
      const arc = st.stage === 1 ? st.arc : st.hoverArc;
      if (arc && v) {
        lines.push({ pts: arcPts(arc.c, arc.r, arc.a0, arc.a1).map((q) => toSheet(v, q)), cls: 'prev' });
        let off = 6 / v.s;
        if (st.stage === 1 && st.P) {
          const q = toView(v, st.P);
          const rawOff = Math.hypot(q[0] - arc.c[0], q[1] - arc.c[1]) - arc.r;
          off = Math.max(2 / v.s - arc.r, Math.abs(rawOff) < 2 / v.s ? 6 / v.s : rawOff);
        }
        dimSVG({ id: '__prev', view: st.view || st.hoverView, type: 'arclen', c: arc.c, r: arc.r, a0: arc.a0, a1: arc.a1, off }, lines, texts);
      }
      return;
    }
    if (dimMode === 'ordinate') {
      if (st.stage === 1 && st.P) { const v = layout.views[st.view]; if (v) lines.push({ pts: [toSheet(v, st.origin), st.P], cls: 'prev' }); }
      if (st.stage === 2 && st.P) {
        const v = layout.views[st.view]; if (!v) return;
        const q = toView(v, st.P);
        const dir = ordinateDir(v, st.origin, st.b, q, st.preferDir);
        const linePos = dir === 'h' ? q[1] : q[0];
        dimSVG({ id: '__prev', view: st.view, type: 'ordinate', dir, linePos, origin: st.origin, pts: [st.b] }, lines, texts);
      }
      if (st.stage === 3 && st.snap && st.snap.p) {
        const v = layout.views[st.view];
        if (v) lines.push({ circle: [st.snap.S[0], st.snap.S[1], (1.3 / zoom) * 1.6], cls: 'prev' });
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
        : dimMode === 'arclen' ? 'den neuen Kreisbogen'
          : dimMode === 'chamfer' ? 'die neue Fasen-Kante'
            : dimMode === 'ang' ? 'zwei neue Kanten im Winkel'
              : dimMode === 'ordinate' ? 'Nullpunkt und Zielpunkte'
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
    if (e.key === 'Enter' && tool === 'dim' && (dimMode === 'chain' || dimMode === 'base' || dimMode === 'ordinate') && toolState && toolState.stage === 3) {
      toolState = { stage: 0 };
      render(); Panels.renderRight();
      return true;
    }
    if (e.key === 'Enter' && tool === 'section' && (sectionMode === 'stepped' || sectionMode === 'breakout')) {
      return finishSectionTool();
    }
    if (e.key === 'Backspace' && tool === 'section' && (sectionMode === 'stepped' || sectionMode === 'breakout') && toolState && Array.isArray(toolState.pts) && toolState.pts.length > 0) {
      toolState.pts.pop();
      if (!toolState.pts.length) toolState = { stage: 0 };
      else if (sectionMode === 'stepped' && toolState.pts.length === 1) toolState.stage = 1;
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
    if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('balloon'); return true; }
    if (e.key.toLowerCase() === 'u' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('break'); return true; }
    if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) { setTool('aux'); return true; }
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
  function setNormThreads(on) {
    const val = !!on;
    const cur = dwg();
    if ((cur.normThreads !== false) === val) return;
    App.change(val ? 'Gewinde nach Norm eingeblendet' : 'Gewinde nach Norm ausgeblendet', () => { dwg().normThreads = val; });
    render(); Panels.renderRight();
  }
  function setMaterialHatch(on) {
    const val = !!on;
    const cur = dwg();
    if ((cur.materialHatch !== false) === val) return;
    App.change(val ? 'Schraffur je Werkstoff aktiviert' : 'Schraffur je Werkstoff deaktiviert', () => { dwg().materialHatch = val; });
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
    if (id === '__bom__') { setBomTable(false); return; }
    if (String(id).startsWith('ctr|')) { hideCenter(id); return; }
    if ((dwg().sections || []).some((x) => x.id === id)) { removeSection(id); return; }
    if ((dwg().auxViews || []).some((x) => x.id === id)) { removeAuxView(id); return; }
    if ((dwg().breaks || []).some((x) => x.id === id)) { removeBreak(id); return; }
    if ((dwg().notes || []).some((x) => x.id === id)) { removeNote(id); return; }
    if ((dwg().balloons || []).some((x) => x.id === id)) { removeBalloon(id); return; }
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
    if (!mode) { setTool(null); return false; }
    const m = DIM_MODES.find((x) => x.key === mode) || DIM_MODES[0];
    if (m.pro && isSimpleMode()) { UI.toast(T('draw.dimProOnly'), { icon: 'info' }); return false; }
    dimMode = m.key;
    dragDetail = null;
    tool = 'dim';
    toolState = { stage: 0 };
    if (svg) svg.style.cursor = 'crosshair';
    UI.hint(dimHint(dimMode));
    Panels.renderTools(); Panels.renderRight(); render();
    return true;
  }
  function dimMenu(anchor) {
    const simple = isSimpleMode();
    const tMap = { lin: 'menu.draw.dimLin', chain: 'menu.draw.dimChain', base: 'menu.draw.dimBase', ordinate: 'menu.draw.dimOrdinate', ang: 'menu.draw.dimAng', rad: 'menu.draw.dimRad', dia: 'menu.draw.dimDia', arclen: 'menu.draw.dimArcLen', chamfer: 'menu.draw.dimChamfer' };
    UI.menu(anchor, DIM_MODES.filter((m) => !simple || !m.pro).map((m) => ({
      label: T(tMap[m.key] || m.label),
      icon: 'dim',
      help: m.pro ? 'drawingOrdArc' : 'drawingDimTypes',
      checked: tool === 'dim' && dimMode === m.key,
      run: () => setDimMode(m.key),
    })));
  }
  function sectionHint(mode) {
    const m = SECTION_MODES.find((x) => x.key === mode);
    return m ? m.hint : SECTION_MODES[0].hint;
  }
  function setSectionMode(mode) {
    if (!mode) { setTool(null); return false; }
    const m = SECTION_MODES.find((x) => x.key === mode) || SECTION_MODES[0];
    if (m.pro && isSimpleMode()) { UI.toast(T('draw.secProOnly'), { icon: 'info' }); return false; }
    sectionMode = m.key;
    dragDetail = null; dragNote = null; dragView = null; dragBalloon = null; dragBom = null;
    tool = 'section';
    toolState = { stage: 0 };
    if (svg) svg.style.cursor = 'crosshair';
    UI.hint(sectionHint(sectionMode));
    Panels.renderTools(); Panels.renderRight(); render();
    return true;
  }
  function sectionMenu(anchor) {
    const simple = isSimpleMode();
    UI.menu(anchor, SECTION_MODES.filter((m) => !simple || !m.pro).map((m) => ({
      label: m.label,
      icon: 'section',
      help: 'drawingSectionKinds',
      checked: tool === 'section' && sectionMode === m.key,
      run: () => setSectionMode(m.key),
    })));
  }
  function setTool(t) {
    dragDetail = null; dragNote = null; dragView = null; dragBalloon = null; dragBom = null;
    tool = t;
    if (t === 'dim') dimMode = 'lin';
    if (t === 'section' && (!SECTION_MODES.some((x) => x.key === sectionMode) || (sectionMode !== 'full' && isSimpleMode()))) sectionMode = 'full';
    if (t === 'detail') {
      detailDraft = { scale: defaultDetailScale(), label: nextDetailLabel() };
      toolState = { stage: 0 };
    } else {
      toolState = (t === 'dim' || t === 'section' || t === 'note' || t === 'balloon' || t === 'break' || t === 'aux') ? { stage: 0 } : t ? {} : null;
    }
    if (svg) svg.style.cursor = t ? 'crosshair' : '';
    UI.hint(
      t === 'dim' ? dimHint(dimMode)
        : t === 'detail' ? T('draw.hint.detail')
          : t === 'section' ? sectionHint(sectionMode)
            : t === 'note' ? T('draw.hint.note')
              : t === 'balloon' ? T('draw.hint.balloon')
                : t === 'break' ? T('draw.hint.break')
                  : t === 'aux' ? T('draw.hint.aux')
                    : t && t.startsWith('free-') ? freeHint(t) : null
    );
    Panels.renderTools(); Panels.renderRight(); render();
  }
  // ---------- Maße aus dem Modell übernehmen & ordnen (ZE-23) ----------
  function vec3FromPt(p, M) {
    const v = new THREE.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
    return M ? v.applyMatrix4(M) : v;
  }
  function normalToWorld3(n, M) {
    const v = new THREE.Vector3(Number(n[0]) || 0, Number(n[1]) || 0, Number(n[2]) || 0);
    if (M) v.applyMatrix3(new THREE.Matrix3().getNormalMatrix(M));
    return v.lengthSq() > 1e-12 ? v.normalize() : new THREE.Vector3(0, 0, 1);
  }
  function sketchRefPt2(ref, entById) {
    if (!ref) return null;
    if (ref.e === 'origin') return [0, 0];
    const e = entById.get(ref.e);
    if (!e) return null;
    if (e.type === 'rect' && ref.p && /^k[0-3]$/.test(ref.p)) {
      const c = SK.rectCorners(e);
      return c[Number(ref.p[1])] || null;
    }
    if (e.type === 'circle' || e.type === 'ellipse') return e.c ? [...e.c] : null;
    if (e.type === 'poly') return e.c ? [...e.c] : null;
    if (e.type === 'point' || e.type === 'text') return e.a ? [...e.a] : null;
    if (ref.p === 'a' && e.a) return [...e.a];
    if (ref.p === 'b' && e.b) return [...e.b];
    if (ref.p === 'm' && e.m) return [...e.m];
    if (ref.p === 'c' && e.c) return [...e.c];
    return e.a ? [...e.a] : e.c ? [...e.c] : null;
  }
  function sketchRefLine2(ref, entById) {
    if (!ref) return null;
    const e = entById.get(ref.e);
    if (!e) return null;
    if (e.type === 'line' && e.a && e.b) return [e.a, e.b];
    if (e.type === 'rect' && ref.edge != null) {
      const c = SK.rectCorners(e);
      const i = ((Number(ref.edge) % 4) + 4) % 4;
      return [c[i], c[(i + 1) % 4]];
    }
    return null;
  }
  function collectSketchModelDims(sk, M, V, itemId, out, isHole = false, addFallback = true) {
    if (!sk) return null;
    const ents = (typeof Solver !== 'undefined' && Solver.cached) ? Solver.cached(sk, V).ents : (sk.ents || []);
    const entById = new Map();
    for (const e of ents) if (e && e.id) entById.set(e.id, e);
    const pl = sk.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const px = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize();
    const pn = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize();
    const py = new THREE.Vector3().crossVectors(pn, px).normalize();
    const po = new THREE.Vector3(...(pl.o || [0, 0, 0]));
    const wn = normalToWorld3([pn.x, pn.y, pn.z], M);
    const skPt = (pt) => {
      const v = po.clone().addScaledVector(px, Number(pt[0]) || 0).addScaledVector(py, Number(pt[1]) || 0);
      return M ? v.applyMatrix4(M) : v;
    };
    const pushLin = (a2, b2, valHint = null, axisHint = null) => {
      if (!a2 || !b2 || Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) < 0.15) return;
      out.push({ kind: 'lin', p0: skPt(a2), p1: skPt(b2), planeNormal: wn, valHint, axisHint, itemId, source: 'sketch' });
    };
    let addedHere = 0;
    for (const dm of sk.dims || []) {
      if (!dm || dm.ref) continue;
      const val = Model.num(dm.v, V, NaN);
      if (!isFinite(val)) continue;
      if (dm.e) {
        const e = entById.get(dm.e);
        if (!e || e.con) continue;
        if (dm.k === 'w' && e.type === 'rect' && e.a && e.b) {
          const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
          const y0 = Math.min(e.a[1], e.b[1]);
          pushLin([x0, y0], [x1, y0], val);
          addedHere++;
        } else if (dm.k === 'h' && e.type === 'rect' && e.a && e.b) {
          const x0 = Math.min(e.a[0], e.b[0]);
          const y0 = Math.min(e.a[1], e.b[1]), y1 = Math.max(e.a[1], e.b[1]);
          pushLin([x0, y0], [x0, y1], val);
          addedHere++;
        } else if (dm.k === 'w' && e.type === 'slot' && e.a && e.r > 0.05) {
          out.push({ kind: 'dia', c: skPt(e.a), n: wn, r: e.r, isHole, itemId, source: 'sketch' });
          addedHere++;
        } else if (dm.k === 'len' && (e.type === 'line' || e.type === 'slot') && e.a && e.b) {
          pushLin(e.a, e.b, val);
          addedHere++;
        } else if (dm.k === 'd' && e.type === 'circle' && e.c && e.r > 0.05) {
          out.push({ kind: 'dia', c: skPt(e.c), n: wn, r: e.r, isHole, itemId, source: 'sketch' });
          addedHere++;
        } else if (dm.k === 'r' && e.type === 'circle' && e.c && e.r > 0.05) {
          out.push({ kind: 'rad', c: skPt(e.c), n: wn, r: e.r, itemId, source: 'sketch' });
          addedHere++;
        } else if (dm.k === 'r' && e.type === 'arc' && e.a && e.m && e.b) {
          const ai = SK.arcInfo(e.a, e.m, e.b);
          if (ai && ai.r > 0.05) {
            out.push({ kind: 'rad', c: skPt(ai.c), n: wn, r: ai.r, pMid: skPt(e.m), itemId, source: 'sketch' });
            addedHere++;
          }
        } else if ((dm.k === 'rx' || dm.k === 'ry') && e.type === 'ellipse' && e.c) {
          const rot = e.rot || 0;
          const dir = dm.k === 'rx' ? [Math.cos(rot), Math.sin(rot)] : [-Math.sin(rot), Math.cos(rot)];
          const rVal = dm.k === 'rx' ? e.rx : e.ry;
          if (rVal > 0.05) {
            pushLin(e.c, [e.c[0] + dir[0] * rVal, e.c[1] + dir[1] * rVal], val);
            addedHere++;
          }
        }
      } else if (Array.isArray(dm.refs) && dm.refs.length >= 2) {
        if (dm.k === 'dist') {
          const a2 = sketchRefPt2(dm.refs[0], entById), b2 = sketchRefPt2(dm.refs[1], entById);
          if (a2 && b2) { pushLin(a2, b2, val); addedHere++; }
        } else if (dm.k === 'distPL') {
          const p2 = sketchRefPt2(dm.refs[0], entById), L = sketchRefLine2(dm.refs[1], entById);
          if (p2 && L) {
            const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1], L2 = dx * dx + dy * dy;
            if (L2 > 1e-8) {
              const t = ((p2[0] - L[0][0]) * dx + (p2[1] - L[0][1]) * dy) / L2;
              const q2 = [L[0][0] + t * dx, L[0][1] + t * dy];
              pushLin(p2, q2, val);
              addedHere++;
            }
          }
        } else if (dm.k === 'distCC') {
          const e0 = entById.get(dm.refs[0].e), e1 = entById.get(dm.refs[1].e);
          const c0 = e0 && e0.c, c1 = e1 && e1.c;
          if (c0 && c1) { pushLin(c0, c1, val); addedHere++; }
        } else if (dm.k === 'ord') {
          const p2 = sketchRefPt2(dm.refs[0], entById);
          const L = sketchRefLine2(dm.refs[1], entById);
          const o2 = sketchRefPt2(dm.refs[1], entById);
          if (p2 && L) {
            const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1], L2 = dx * dx + dy * dy;
            if (L2 > 1e-8) {
              const t = ((p2[0] - L[0][0]) * dx + (p2[1] - L[0][1]) * dy) / L2;
              pushLin(p2, [L[0][0] + t * dx, L[0][1] + t * dy], Math.abs(val));
              addedHere++;
            }
          } else if (p2 && o2) {
            const ax = dm.axis === 'y' ? 1 : 0;
            const q2 = ax === 0 ? [o2[0], p2[1]] : [p2[0], o2[1]];
            pushLin(p2, q2, Math.abs(val));
            addedHere++;
          }
        } else if (dm.k === 'angLL') {
          const L1 = sketchRefLine2(dm.refs[0], entById), L2 = sketchRefLine2(dm.refs[1], entById);
          if (L1 && L2) {
            const V2 = lineIntersect2D(L1[0], L1[1], L2[0], L2[1]);
            if (V2) {
              out.push({
                kind: 'ang',
                v: skPt(V2),
                e1: [skPt(L1[0]), skPt(L1[1])],
                e2: [skPt(L2[0]), skPt(L2[1])],
                n: wn,
                itemId,
                source: 'sketch',
              });
              addedHere++;
            }
          }
        } else if (dm.k === 'ang3' && dm.refs.length >= 3) {
          const A2 = sketchRefPt2(dm.refs[0], entById), V2 = sketchRefPt2(dm.refs[1], entById), B2 = sketchRefPt2(dm.refs[2], entById);
          if (A2 && V2 && B2) {
            out.push({
              kind: 'ang',
              v: skPt(V2),
              e1: [skPt(V2), skPt(A2)],
              e2: [skPt(V2), skPt(B2)],
              n: wn,
              itemId,
              source: 'sketch',
            });
            addedHere++;
          }
        }
      }
    }
    if (addedHere === 0 && addFallback) {
      const visEnts = ents.filter((e) => e && !e.con);
      for (const e of visEnts) {
        if (e.type === 'circle' && e.c && e.r > 0.05) {
          out.push({ kind: 'dia', c: skPt(e.c), n: wn, r: e.r, isHole, itemId, source: 'sketch' });
          addedHere++;
        } else if (e.type === 'rect' && e.a && e.b) {
          const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
          const y0 = Math.min(e.a[1], e.b[1]), y1 = Math.max(e.a[1], e.b[1]);
          pushLin([x0, y0], [x1, y0]);
          pushLin([x0, y0], [x0, y1]);
          addedHere += 2;
        }
      }
      if (addedHere === 0) {
        const b = SK.bounds(visEnts);
        if (b && b.w > 0.1 && b.h > 0.1) {
          pushLin([b.minX, b.minY], [b.maxX, b.minY]);
          pushLin([b.minX, b.minY], [b.minX, b.maxY]);
        }
      }
    }
    return { ents, plane: pl, px, py, pn, po, wn, skPt };
  }
  function collectModelDims(doc = App.doc, extraMat = null, visited = null, out = []) {
    if (!doc || !Array.isArray(doc.items)) return out;
    const vis = visited || new Set();
    if (doc.id && vis.has(doc.id)) return out;
    if (doc.id) vis.add(doc.id);
    try {
      Model.walk(doc.items, (it) => {
        if (!isItemActiveVisible(doc, it)) return;
        const V = Model.itemVars(doc, it.id);
        const mats = Model.instanceMatrices(doc, it.id, V).map((m) => (extraMat ? extraMat.clone().multiply(m) : m));
        if (!mats.length) return;
        const M = mats[0];
        if (it.kind === 'ref' && it.p && it.p.docId && typeof Model.resolveDoc === 'function') {
          const rd = Model.resolveDoc(it.p.docId);
          if (rd) collectModelDims(rd, M, vis, out);
          return;
        }
        if (it.kind === 'group') return;
        const isCut = it.role === 'hole' || (it.op && it.op.type === 'cut');
        const p = Model.resolveP(it.p || {}, V);
        const wN = (n) => normalToWorld3(n, M);
        const wP = (pt) => vec3FromPt(pt, M);

        if (it.kind === 'box' || it.kind === 'pyramid' || it.kind === 'wedge') {
          const w = Number(p.w) || 0, d = Number(p.d) || 0, h = Number(p.h) || 0;
          if (w > 0.1) out.push({ kind: 'lin', p0: wP([-w / 2, -d / 2, 0]), p1: wP([w / 2, -d / 2, 0]), axisHint: 'x', itemId: it.id, source: 'step' });
          if (d > 0.1) out.push({ kind: 'lin', p0: wP([-w / 2, -d / 2, 0]), p1: wP([-w / 2, d / 2, 0]), axisHint: 'y', itemId: it.id, source: 'step' });
          if (h > 0.1 && !(isCut && p.thru)) out.push({ kind: 'lin', p0: wP([-w / 2, -d / 2, 0]), p1: wP([-w / 2, -d / 2, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'cylinder') {
          const r = (Number(p.d) || 0) / 2, h = Number(p.h) || 0;
          if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r, isHole: isCut, itemId: it.id, source: 'step' });
          if (h > 0.1 && !isCut) out.push({ kind: 'lin', p0: wP([r, 0, 0]), p1: wP([r, 0, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'tube') {
          const r = (Number(p.d) || 0) / 2, wall = Number(p.wall) || 0, h = Number(p.h) || 0;
          if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r, isHole: false, itemId: it.id, source: 'step' });
          if (r - wall > 0.05) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r: r - wall, isHole: true, itemId: it.id, source: 'step' });
          if (h > 0.1 && !isCut) out.push({ kind: 'lin', p0: wP([r, 0, 0]), p1: wP([r, 0, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'cone') {
          const r1 = (Number(p.d1) || 0) / 2, r2 = (Number(p.d2) || 0) / 2, h = Number(p.h) || 0;
          if (r1 > 0.05) out.push({ kind: 'dia', c: wP([0, 0, 0]), n: wN([0, 0, 1]), r: r1, isHole: isCut, itemId: it.id, source: 'step' });
          if (r2 > 0.05 && Math.abs(r2 - r1) > 0.1) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r: r2, isHole: isCut, itemId: it.id, source: 'step' });
          if (h > 0.1 && !isCut) out.push({ kind: 'lin', p0: wP([Math.max(r1, r2), 0, 0]), p1: wP([Math.max(r1, r2), 0, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'sphere' || it.kind === 'hemisphere') {
          const r = (Number(p.d) || 0) / 2;
          if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, it.kind === 'sphere' ? r : 0]), n: wN([0, 0, 1]), r, omni: true, isHole: isCut, itemId: it.id, source: 'step' });
        } else if (it.kind === 'prism') {
          const r = (Number(p.d) || 0) / 2, h = Number(p.h) || 0;
          if (h > 0.1 && !isCut) out.push({ kind: 'lin', p0: wP([r, 0, 0]), p1: wP([r, 0, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'torus') {
          const r = (Number(p.d) || 0) / 2, t = (Number(p.t) || 0) / 2;
          if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, t]), n: wN([0, 0, 1]), r: r + t, itemId: it.id, source: 'step' });
        } else if (it.kind === 'extrude' && it.p && it.p.sketch) {
          const skInfo = collectSketchModelDims(it.p.sketch, M, V, it.id, out, isCut, true);
          if (skInfo && !p.thru) {
            const dist = Number(p.dist) || 0, dir = p.dir || 'normal';
            const b = SK.bounds(skInfo.ents);
            if (b && dist > 0.1) {
              const base2 = [b.minX, b.minY];
              const pBase = skInfo.skPt(base2);
              const w0 = dir === 'both' ? -dist / 2 : dir === 'two' ? -(Number(p.dist2) || dist) : dir === 'reverse' ? -dist : 0;
              const w1 = dir === 'both' ? dist / 2 : dir === 'reverse' ? 0 : dist;
              if (Math.abs(w1 - w0) > 0.1) {
                out.push({
                  kind: 'lin',
                  p0: pBase.clone().addScaledVector(skInfo.wn, w0),
                  p1: pBase.clone().addScaledVector(skInfo.wn, w1),
                  itemId: it.id,
                  source: 'step',
                });
              }
            }
          }
        } else if ((it.kind === 'revolve' || it.kind === 'rib' || it.kind === 'web' || it.kind === 'emboss' || it.kind === 'splitFace') && it.p && it.p.sketch) {
          collectSketchModelDims(it.p.sketch, M, V, it.id, out, isCut, true);
        } else if (it.kind === 'loft' && it.p && Array.isArray(it.p.sketches)) {
          for (const sk of it.p.sketches) collectSketchModelDims(sk, M, V, it.id, out, isCut, false);
        } else if (it.kind === 'sweep' && it.p && it.p.sketch) {
          collectSketchModelDims(it.p.sketch, M, V, it.id, out, isCut, false);
        } else if (it.kind === 'boss') {
          const rOut = (Number(p.outerD) || 0) / 2, rHole = (Number(p.holeD) || 0) / 2, h = Number(p.height) || 0;
          if (rOut > 0.05) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r: rOut, itemId: it.id, source: 'step' });
          if (rHole > 0.05) out.push({ kind: 'dia', c: wP([0, 0, h]), n: wN([0, 0, 1]), r: rHole, isHole: true, itemId: it.id, source: 'step' });
          if (h > 0.1) out.push({ kind: 'lin', p0: wP([rOut, 0, 0]), p1: wP([rOut, 0, h]), axisHint: 'z', itemId: it.id, source: 'step' });
        } else if (it.kind === 'part') {
          const L = String(p.lib || '');
          if (L === 'screwHole') {
            const r = (Number(p.d) || 0) / 2, dep = Number(p.depth) || 0;
            if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, 0]), n: wN([0, 0, 1]), r, isHole: true, itemId: it.id, source: 'step' });
            if (!p.thru && dep > 0.1) out.push({ kind: 'lin', p0: wP([r, 0, 0]), p1: wP([r, 0, -dep]), axisHint: 'z', itemId: it.id, source: 'step' });
          } else if (L === 'slotHole') {
            const r = (Number(p.d) || 0) / 2, len = Number(p.len) || 0;
            if (r > 0.05) out.push({ kind: 'dia', c: wP([-len / 2, 0, 0]), n: wN([0, 0, 1]), r, isHole: true, itemId: it.id, source: 'step' });
            if (len > 0.1) out.push({ kind: 'lin', p0: wP([-len / 2, 0, 0]), p1: wP([len / 2, 0, 0]), itemId: it.id, source: 'step' });
          } else if (L === 'stdPin') {
            const pe = typeof pinEntry === 'function' ? pinEntry(p.size ?? p.d) : null;
            const r = (pe ? pe.d_mm : 6) / 2, len = Number(p.length) || 20;
            if (r > 0.05) out.push({ kind: 'dia', c: wP([0, 0, len]), n: wN([0, 0, 1]), r, itemId: it.id, source: 'step' });
            if (len > 0.1) out.push({ kind: 'lin', p0: wP([r, 0, 0]), p1: wP([r, 0, len]), axisHint: 'z', itemId: it.id, source: 'step' });
          } else if (L === 'stdBearing') {
            const be = typeof bearingEntry === 'function' ? bearingEntry(p.size) : null;
            if (be) {
              if (be.D_mm > 0.1) out.push({ kind: 'dia', c: wP([0, 0, be.B_mm || 7]), n: wN([0, 0, 1]), r: be.D_mm / 2, itemId: it.id, source: 'step' });
              if (be.d_mm > 0.1) out.push({ kind: 'dia', c: wP([0, 0, be.B_mm || 7]), n: wN([0, 0, 1]), r: be.d_mm / 2, isHole: true, itemId: it.id, source: 'step' });
            }
          }
        }
        for (const f of it.finishes || []) {
          if (!f) continue;
          if (f.type === 'fillet' || f.type === 'faceFillet' || f.type === 'fullFillet') {
            const r = Model.num(f.r, V, 0);
            if (r > 0.05) out.push({ kind: 'finishRad', r, itemId: it.id, source: 'step' });
          } else if (f.type === 'chamfer') {
            const dist = Model.num(f.r, V, 0);
            const ang = f.cm === 'angle' ? Model.num(f.a, V, 45) : 45;
            if (dist > 0.05) out.push({ kind: 'finishChamfer', dist, ang, itemId: it.id, source: 'step' });
          }
        }
      });
    } finally {
      if (doc.id) vis.delete(doc.id);
    }
    return out;
  }
  function project3ToView2(p, basis) {
    return [
      p.x * basis.x[0] + p.y * basis.x[1] + p.z * basis.x[2],
      p.x * basis.y[0] + p.y * basis.y[1] + p.z * basis.y[2],
    ];
  }
  function snapPtToView(v, pt2, tol = 0.45) {
    let best = pt2, bd = tol;
    for (const q of viewVertexPoints(v)) {
      const d = Math.hypot(q[0] - pt2[0], q[1] - pt2[1]);
      if (d < bd) { bd = d; best = [q[0], q[1]]; }
    }
    if (bd === tol) {
      for (const c of viewCirclesPool(v)) {
        const d = Math.hypot(c.c[0] - pt2[0], c.c[1] - pt2[1]);
        if (d < bd) { bd = d; best = [c.c[0], c.c[1]]; }
      }
    }
    return best;
  }
  function inViewBox2(v, pt2, tol = 0.8) {
    const b = v && v.geo && v.geo.box;
    if (!b) return false;
    return pt2[0] >= b[0] - tol && pt2[0] <= b[2] + tol && pt2[1] >= b[1] - tol && pt2[1] <= b[3] + tol;
  }
  function attachSafeRef(dim, v, lay, sh) {
    if (!v || !v.geo) return dim;
    const ref = buildDimRef(dim, v);
    if (!ref) return dim;
    const check = resolveManualDim({ ...dim, ref }, lay, sh);
    if (!check.lost) return { ...dim, ref };
    return dim;
  }
  function mapModelDimsToViews(rawDims, sh, lay) {
    const avail = ['front', 'top', 'left'].filter((k) => lay.views[k] && lay.views[k].geo && !lay.views[k].noDims);
    if (!avail.length) return [];
    const bases = {};
    for (const vk of avail) bases[vk] = viewBasis(vk, sh);
    const viewCount = { front: 0, top: 0, left: 0 };
    const mapped = [];
    const globalLinKeys = [];
    const hasLinInView = (vk, dir, a, b) => mapped.some((d) => {
      if (d.view !== vk || d.type !== 'lin' || d.dir !== dir) return false;
      const d1 = Math.hypot(d.a[0] - a[0], d.a[1] - a[1]) + Math.hypot(d.b[0] - b[0], d.b[1] - b[1]);
      const d2 = Math.hypot(d.a[0] - b[0], d.a[1] - b[1]) + Math.hypot(d.b[0] - a[0], d.b[1] - a[1]);
      if (Math.min(d1, d2) < 0.45) return true;
      if (dir === 'h' && Math.abs(Math.min(d.a[0], d.b[0]) - Math.min(a[0], b[0])) < 0.35 && Math.abs(Math.max(d.a[0], d.b[0]) - Math.max(a[0], b[0])) < 0.35) return true;
      if (dir === 'v' && Math.abs(Math.min(d.a[1], d.b[1]) - Math.min(a[1], b[1])) < 0.35 && Math.abs(Math.max(d.a[1], d.b[1]) - Math.max(a[1], b[1])) < 0.35) return true;
      return false;
    });
    const isDuplicateGlobalLin = (item) => {
      const len = item.p0.distanceTo(item.p1);
      const u = item.p1.clone().sub(item.p0).normalize();
      for (const g of globalLinKeys) {
        if (g.itemId === item.itemId && Math.abs(g.len - len) < 0.25 && Math.abs(g.u.dot(u)) > 0.985) return true;
      }
      return false;
    };
    const pendingCircleGroups = new Map();
    const pendingFinishRad = new Set();
    const pendingFinishChamfer = new Set();

    for (const item of rawDims) {
      if (item.kind === 'lin') {
        const L3 = item.p0.distanceTo(item.p1);
        if (L3 < 0.2) continue;
        if (isDuplicateGlobalLin(item)) continue;
        const u3 = item.p1.clone().sub(item.p0).normalize();
        let best = null;
        for (const vk of avail) {
          const v = lay.views[vk], basis = bases[vk];
          if (!v || !basis) continue;
          const aRaw = project3ToView2(item.p0, basis);
          const bRaw = project3ToView2(item.p1, basis);
          const L2 = Math.hypot(bRaw[0] - aRaw[0], bRaw[1] - aRaw[1]);
          if (L2 < 0.2 || Math.abs(L2 - L3) > Math.max(0.18, L3 * 0.02)) continue;
          if (!inViewBox2(v, aRaw) || !inViewBox2(v, bRaw)) continue;
          let a = snapPtToView(v, aRaw), b = snapPtToView(v, bRaw);
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2) { a = aRaw; b = bRaw; }
          const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
          const dir = dy <= 0.12 ? 'h' : dx <= 0.12 ? 'v' : 'a';
          if (dir === 'h' && a[0] > b[0]) [a, b] = [b, a];
          if (dir === 'v' && a[1] > b[1]) [a, b] = [b, a];
          if (hasLinInView(vk, dir, a, b)) continue;
          let score = 0;
          if (item.planeNormal) {
            const dn = Math.abs(item.planeNormal.x * basis.dir[0] + item.planeNormal.y * basis.dir[1] + item.planeNormal.z * basis.dir[2]);
            if (dn > 0.98) score += 50;
          }
          const verts = viewVertexPoints(v);
          const hitA = verts.some((q) => Math.hypot(q[0] - a[0], q[1] - a[1]) <= 0.45);
          const hitB = verts.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) <= 0.45);
          if (hitA) score += 12;
          if (hitB) score += 12;
          const ax = Math.abs(u3.x) > 0.9 ? 'x' : Math.abs(u3.y) > 0.9 ? 'y' : Math.abs(u3.z) > 0.9 ? 'z' : item.axisHint;
          if (ax === 'x') score += vk === 'front' ? 14 : vk === 'top' ? 8 : 0;
          else if (ax === 'z') score += vk === 'front' ? 14 : vk === 'left' ? 8 : 0;
          else if (ax === 'y') score += vk === 'left' ? 14 : vk === 'top' ? 10 : 0;
          if (dir !== 'a') score += 4;
          score -= viewCount[vk] * 2.5;
          if (!best || score > best.score) best = { vk, v, dir, a, b, score };
        }
        if (best) {
          const dObj = attachSafeRef({ id: uid('d'), view: best.vk, type: 'lin', dir: best.dir, a: best.a, b: best.b, off: -(9 / best.v.s), fromModel: true }, best.v, lay, sh);
          mapped.push(dObj);
          viewCount[best.vk]++;
          globalLinKeys.push({ itemId: item.itemId, len: L3, u: u3 });
        }
      } else if (item.kind === 'dia' || item.kind === 'rad') {
        let best = null;
        for (const vk of avail) {
          const v = lay.views[vk], basis = bases[vk];
          if (!v || !basis) continue;
          if (!item.omni && item.n) {
            const dn = Math.abs(item.n.x * basis.dir[0] + item.n.y * basis.dir[1] + item.n.z * basis.dir[2]);
            if (dn <= 0.96) continue;
          }
          const c2 = project3ToView2(item.c, basis);
          if (!inViewBox2(v, c2, item.r + 1)) continue;
          const visPool = v.geo.circles || [];
          const allPool = viewCirclesPool(v);
          const matchC = (cc) => Math.hypot(cc.c[0] - c2[0], cc.c[1] - c2[1]) <= 0.55 && Math.abs(cc.r - item.r) <= 0.3;
          let hit = item.kind === 'dia'
            ? (visPool.find((cc) => cc.full && matchC(cc)) || allPool.find((cc) => cc.full && matchC(cc)) || visPool.find(matchC) || allPool.find(matchC))
            : visPool.find(matchC);
          if (!hit && !item.omni) continue;
          const cUse = hit ? hit.c : c2;
          const rUse = hit ? hit.r : item.r;
          let score = hit ? (hit.hidden ? 22 : hit.full ? 40 : 32) : 10;
          if (vk === 'top') score += 8;
          else if (vk === 'front') score += 6;
          score -= viewCount[vk] * 2.0;
          if (!best || score > best.score) best = { vk, v, c: cUse, r: rUse, hit, score };
        }
        if (best) {
          const rk = `${best.vk}|${item.kind}|${Math.round(best.r * 200)}`;
          if (!pendingCircleGroups.has(rk)) pendingCircleGroups.set(rk, []);
          pendingCircleGroups.get(rk).push({ vk: best.vk, v: best.v, c: best.c, r: best.r, hit: best.hit });
          viewCount[best.vk]++;
        }
      } else if (item.kind === 'ang') {
        for (const vk of avail) {
          const v = lay.views[vk], basis = bases[vk];
          if (!v || !basis) continue;
          if (item.n && Math.abs(item.n.x * basis.dir[0] + item.n.y * basis.dir[1] + item.n.z * basis.dir[2]) <= 0.96) continue;
          const V2 = snapPtToView(v, project3ToView2(item.v, basis));
          const e1 = [project3ToView2(item.e1[0], basis), project3ToView2(item.e1[1], basis)];
          const e2 = [project3ToView2(item.e2[0], basis), project3ToView2(item.e2[1], basis)];
          const midPt = [(e1[0][0] + e1[1][0] + e2[0][0] + e2[1][0]) * 0.25, (e1[0][1] + e1[1][1] + e2[0][1] + e2[1][1]) * 0.25];
          const sec = angularSector(V2, { a: e1[0], b: e1[1] }, { a: e2[0], b: e2[1] }, midPt);
          const span = sec.a1 - sec.a0;
          if (span > 1e-3 && span < Math.PI - 1e-3) {
            const dObj = attachSafeRef({ id: uid('d'), view: vk, type: 'ang', v: V2, e1, e2, a0: sec.a0, a1: sec.a1, r: Math.max(6, 12 / v.s), fromModel: true }, v, lay, sh);
            mapped.push(dObj);
            viewCount[vk]++;
            break;
          }
        }
      } else if (item.kind === 'finishRad') {
        const rk = Math.round(item.r * 200);
        if (pendingFinishRad.has(rk)) continue;
        pendingFinishRad.add(rk);
        let best = null;
        for (const vk of avail) {
          const v = lay.views[vk];
          const arcs = (v.geo.circles || []).filter((c) => !c.full && c.arc && c.arc[1] - c.arc[0] >= 0.35 && Math.abs(c.r - item.r) <= 0.28);
          if (!arcs.length) continue;
          const b = v.geo.box, mx = (b[0] + b[2]) * 0.5, my = (b[1] + b[3]) * 0.5;
          let pick = arcs[0], bd = -1;
          for (const c of arcs) {
            const mid = (c.arc[0] + c.arc[1]) * 0.5;
            const d = Math.hypot(c.c[0] + c.r * Math.cos(mid) - mx, c.c[1] + c.r * Math.sin(mid) - my);
            if (d > bd) { bd = d; pick = c; }
          }
          const score = arcs.length * 10 - viewCount[vk] * 2;
          if (!best || score > best.score) best = { vk, v, pick, count: arcs.length, score };
        }
        if (best) {
          const mid = (best.pick.arc[0] + best.pick.arc[1]) * 0.5;
          const rkKey = `${best.vk}|rad|${Math.round(best.pick.r * 200)}`;
          if (!pendingCircleGroups.has(rkKey)) {
            const dObj = attachSafeRef({ id: uid('d'), view: best.vk, type: 'rad', c: best.pick.c, r: best.pick.r, ang: (mid * 180) / Math.PI, count: best.count, partial: true, fromModel: true }, best.v, lay, sh);
            mapped.push(dObj);
            viewCount[best.vk]++;
          }
        }
      } else if (item.kind === 'finishChamfer') {
        const ck = `${Math.round(item.dist * 100)}|${Math.round(item.ang * 10)}`;
        if (pendingFinishChamfer.has(ck)) continue;
        pendingFinishChamfer.add(ck);
        for (const vk of avail) {
          const v = lay.views[vk];
          let foundInfo = null;
          for (const seg of straightSegsOf(v, false)) {
            const info = analyzeChamfer(v, seg);
            if (!info) continue;
            if (Math.abs(info.dist - item.dist) <= 0.35 && Math.abs(info.ang - item.ang) <= 3.0) {
              foundInfo = info; break;
            }
          }
          if (foundInfo) {
            const dObj = attachSafeRef({ id: uid('d'), view: vk, type: 'chamfer', p: foundInfo.p, dir: foundInfo.dir, dist: foundInfo.dist, ang: foundInfo.ang, fromModel: true }, v, lay, sh);
            mapped.push(dObj);
            viewCount[vk]++;
            break;
          }
        }
      }
    }

    const st = sheetDimStyle(sh);
    for (const [rk, list] of pendingCircleGroups.entries()) {
      const first = list[0];
      const v = first.v, b = v.geo.box, mx = (b[0] + b[2]) * 0.5, my = (b[1] + b[3]) * 0.5;
      const type = rk.split('|')[1];
      let pick = first;
      if (list.length > 1) {
        let bd = -1;
        for (const it of list) {
          const d = Math.hypot(it.c[0] - mx, it.c[1] - my);
          if (d > bd) { bd = d; pick = it; }
        }
      }
      const away = Math.hypot(pick.c[0] - mx, pick.c[1] - my) > 1e-4 ? (Math.atan2(pick.c[1] - my, pick.c[0] - mx) * 180) / Math.PI : 45;
      const toRad = Math.PI / 180;
      const ang = type === 'rad' && pick.hit && pick.hit.arc
        ? (((pick.hit.arc[0] + pick.hit.arc[1]) * 0.5) * 180) / Math.PI
        : ([45, 135, 225, 315].sort((p, q) => Math.abs(angleDiff(p * toRad, away * toRad)) - Math.abs(angleDiff(q * toRad, away * toRad)))[0] || 45);
      const mt = type === 'dia' ? (v.geo.threads || []).find((th) => th.type === 'end' && Math.hypot(th.c[0] - pick.c[0], th.c[1] - pick.c[1]) < 0.3 && (Math.abs(th.r - pick.r) < 0.45 || Math.abs(th.rThread - pick.r) < 0.45)) : null;
      const thLbl = mt ? ((mt.source === 'cosmetic' || mt.blind0 || mt.blind1) ? `${mt.size} × ${fmtDim(mt.length, st)}` : `${mt.size}`) : null;
      const dObj = attachSafeRef({
        id: uid('d'),
        view: first.vk,
        type,
        c: pick.c,
        r: pick.r,
        ang,
        count: list.length,
        ...(type === 'rad' && pick.hit && !pick.hit.full ? { partial: true } : {}),
        ...(thLbl ? { threadLabel: thLbl } : {}),
        fromModel: true,
      }, v, lay, sh);
      mapped.push(dObj);
    }

    if (!mapped.length && avail.length) {
      const addFallbackLin = (vk, dir, a, b) => {
        const v = lay.views[vk];
        if (!v || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2) return;
        mapped.push(attachSafeRef({ id: uid('d'), view: vk, type: 'lin', dir, a, b, off: -(9 / v.s), fromModel: true }, v, lay, sh));
      };
      if (lay.views.front) {
        const b = lay.views.front.geo.box;
        addFallbackLin('front', 'h', [b[0], b[1]], [b[2], b[1]]);
        addFallbackLin('front', 'v', [b[0], b[1]], [b[0], b[3]]);
      } else if (lay.views.top) {
        const b = lay.views.top.geo.box;
        addFallbackLin('top', 'h', [b[0], b[1]], [b[2], b[1]]);
        addFallbackLin('top', 'v', [b[0], b[1]], [b[0], b[3]]);
      }
      if (lay.views.left) {
        const b = lay.views.left.geo.box;
        addFallbackLin('left', 'h', [b[0], b[1]], [b[2], b[1]]);
        if (!lay.views.front) addFallbackLin('left', 'v', [b[0], b[1]], [b[0], b[3]]);
      } else if (lay.views.top && lay.views.front) {
        const b = lay.views.top.geo.box;
        addFallbackLin('top', 'v', [b[0], b[1]], [b[0], b[3]]);
      }
    }
    return mapped;
  }
  function textRectOf(t, pad = 0) {
    const str = String((t && t.t) || '');
    const sz = Math.max(1, Number(t && t.size) || 3.5);
    const w = Math.max(sz * 0.85, str.length * sz * 0.64);
    const lx0 = t.anchor === 'middle' ? -w * 0.5 : t.anchor === 'end' ? -w : 0;
    const lx1 = lx0 + w;
    const ly0 = -sz * 0.98, ly1 = sz * 0.34;
    const rad = ((t.rot || 0) * Math.PI) / 180;
    const cs = Math.cos(rad), sn = Math.sin(rad);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [lx, ly] of [[lx0, ly0], [lx1, ly0], [lx1, ly1], [lx0, ly1]]) {
      const gx = t.x + lx * cs - ly * sn;
      const gy = t.y + lx * sn + ly * cs;
      if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
      if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
    }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  function rectsOverlap(a, b) {
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  }
  function rectOverlapArea(a, b) {
    const ox = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const oy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    return ox * oy;
  }
  function measureDimTexts(dim, lay, sh, pad = 1.3) {
    const tmpTexts = [];
    dimSVG(dim, [], tmpTexts, lay, sh);
    return tmpTexts
      .filter((t) => t && String(t.cls || '').includes('dimtext'))
      .map((t) => ({ rect: textRectOf(t, pad), rawRect: textRectOf(t, 0), t }));
  }
  function dimTextBoxes(sh = dwg(), lay = layout) {
    const useLay = lay || computeLayout(sh);
    const items = [];
    for (const dim of autoDimList(sh, useLay)) {
      if (!useLay.views[dim.view] || useLay.views[dim.view].noDims) continue;
      for (const m of measureDimTexts(dim, useLay, sh, 0)) {
        items.push({ id: dim.id, view: dim.view, text: m.t.t, rect: m.rawRect });
      }
    }
    let overlaps = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].id === items[j].id) continue;
        if (rectsOverlap(items[i].rect, items[j].rect)) overlaps++;
      }
    }
    return { items, overlaps };
  }
  function arrangeSheetDims(sh, lay) {
    if (!sh || !lay || !lay.views) return 0;
    const st = sheetDimStyle(sh);
    const TXT = st.fontSize;
    const { frame, tb } = lay;
    const viewRects = new Map();
    for (const [k, v] of Object.entries(lay.views)) {
      if (k === 'free' || !v || !v.geo || !v.geo.box) continue;
      const b = v.geo.box;
      const TL = toSheetRaw(v, [b[0], b[3]]), BR = toSheetRaw(v, [b[2], b[1]]);
      viewRects.set(k, [Math.min(TL[0], BR[0]), Math.min(TL[1], BR[1]), Math.max(TL[0], BR[0]), Math.max(TL[1], BR[1])]);
    }
    const staticObs = [
      [frame.x + frame.w - tb.w - 2, frame.y + frame.h - tb.h - 2, frame.x + frame.w, frame.y + frame.h],
    ];
    if (lay.bomRect) {
      staticObs.push([lay.bomRect.x - 2, lay.bomRect.y - 2, lay.bomRect.x + lay.bomRect.w + 2, lay.bomRect.y + lay.bomRect.h + 2]);
    }
    for (const [k, v] of Object.entries(lay.views)) {
      const r = viewRects.get(k);
      if (!r) continue;
      if (v.isSection) staticObs.push([r[0], r[3] + 1, r[2], r[3] + 8.5]);
      else if (v.is3d) staticObs.push([r[0], r[3] + 0.5, r[2], r[3] + 6.5]);
      else if (v.customScale) staticObs.push([r[0], r[1] - 6, r[2], r[1] - 0.5]);
    }
    const placedTexts = [];
    for (const dim of autoDimList(sh, lay)) {
      if (!lay.views[dim.view] || lay.views[dim.view].noDims) continue;
      if (dim.auto === 'circles' || dim.type === 'chain' || dim.type === 'base') {
        for (const m of measureDimTexts(dim, lay, sh, 1.3)) placedTexts.push(m.rect);
      }
    }
    const evalCost = (dim, viewKey, preferPen = 0) => {
      const boxes = measureDimTexts(dim, lay, sh, 1.3);
      if (!boxes.length) return preferPen;
      let cost = preferPen;
      for (const { rect } of boxes) {
        for (const pt of placedTexts) {
          if (rectsOverlap(rect, pt)) cost += 1e6 + rectOverlapArea(rect, pt) * 1e4;
        }
        for (const ob of staticObs) {
          if (rectsOverlap(rect, ob)) cost += 5e5 + rectOverlapArea(rect, ob) * 1e3;
        }
        if (rect[0] < frame.x + 1 || rect[1] < frame.y + 1 || rect[2] > frame.x + frame.w - 1 || rect[3] > frame.y + frame.h - 1) {
          const ox = Math.max(0, (frame.x + 1) - rect[0], rect[2] - (frame.x + frame.w - 1));
          const oy = Math.max(0, (frame.y + 1) - rect[1], rect[3] - (frame.y + frame.h - 1));
          cost += 4e5 + (ox + oy) * 1e3;
        }
        for (const [, vr] of viewRects.entries()) {
          const padVr = [vr[0] - 0.8, vr[1] - 0.8, vr[2] + 0.8, vr[3] + 0.8];
          if (rectsOverlap(rect, padVr)) cost += 2e5 + rectOverlapArea(rect, padVr) * 500;
        }
      }
      return cost;
    };
    const clearSpace = (viewKey, side) => {
      const vr = viewRects.get(viewKey);
      if (!vr) return 0;
      let limit = side === 'left' ? vr[0] - frame.x : side === 'right' ? (frame.x + frame.w) - vr[2] : side === 'top' ? vr[1] - frame.y : (frame.y + frame.h) - vr[3];
      for (const [ok, or] of viewRects.entries()) {
        if (ok === viewKey) continue;
        if ((side === 'left' || side === 'right') && Math.min(vr[3], or[3]) > Math.max(vr[1], or[1]) - 14) {
          if (side === 'left' && or[2] <= vr[0]) limit = Math.min(limit, vr[0] - or[2]);
          if (side === 'right' && or[0] >= vr[2]) limit = Math.min(limit, or[0] - vr[2]);
        }
        if ((side === 'top' || side === 'bottom') && Math.min(vr[2], or[2]) > Math.max(vr[0], or[0]) - 14) {
          if (side === 'top' && or[3] <= vr[1]) limit = Math.min(limit, vr[1] - or[3]);
          if (side === 'bottom' && or[1] >= vr[3]) limit = Math.min(limit, or[1] - vr[3]);
        }
      }
      return limit;
    };

    const resolvedAll = autoDimList(sh, lay);
    const linGroups = new Map();
    const otherDims = [];
    for (const rawDim of sh.dims) {
      if (rawDim.auto === 'circles' || rawDim.type === 'chain' || rawDim.type === 'base') continue;
      const res = resolvedAll.find((x) => x.id === rawDim.id) || rawDim;
      const v = lay.views[res.view];
      if (!v || v.noDims || res.lost) continue;
      if (res.type === 'lin') {
        const gk = `${res.view}|${res.dir || 'a'}`;
        if (!linGroups.has(gk)) linGroups.set(gk, []);
        linGroups.get(gk).push({ raw: rawDim, res, v });
      } else if (res.type === 'dia' || res.type === 'rad' || res.type === 'chamfer' || res.type === 'ang') {
        otherDims.push({ raw: rawDim, res, v });
      }
    }

    const firstClear = Math.max(8, TXT * 2.4);
    const stepClear = Math.max(7.5, TXT * 2.2);
    let moved = 0;

    for (const [gk, list] of linGroups.entries()) {
      const [vk, dir] = gk.split('|');
      const v = list[0].v;
      const vr = viewRects.get(vk);
      if (!vr) continue;
      list.sort((a, b) => dimNominal(a.res) - dimNominal(b.res));
      let sides = ['bottom', 'top'];
      if (dir === 'h') {
        const spBot = clearSpace(vk, 'bottom'), spTop = clearSpace(vk, 'top');
        sides = spBot >= spTop ? ['bottom', 'top'] : ['top', 'bottom'];
      } else if (dir === 'v') {
        const spL = clearSpace(vk, 'left'), spR = clearSpace(vk, 'right');
        sides = spL >= spR ? ['left', 'right'] : ['right', 'left'];
      } else {
        sides = ['out', 'in'];
      }
      const usedBands = [];
      for (const item of list) {
        const A = toSheet(v, item.res.a), B = toSheet(v, item.res.b);
        let bestOff = item.res.off, bestCost = Infinity;
        for (let si = 0; si < sides.length; si++) {
          const side = sides[si];
          for (let tier = 0; tier < 14; tier++) {
            const clr = firstClear + tier * stepClear;
            let off;
            let lineCoord = null, span0 = 0, span1 = 0;
            if (dir === 'h') {
              const targetY = side === 'bottom' ? vr[3] + clr : vr[1] - clr;
              off = side === 'bottom' ? (Math.max(A[1], B[1]) - targetY) / v.s : (Math.min(A[1], B[1]) - targetY) / v.s;
              if (Math.abs(off) < 1e-4) off = side === 'bottom' ? -0.1 : 0.1;
              lineCoord = targetY; span0 = Math.min(A[0], B[0]); span1 = Math.max(A[0], B[0]);
            } else if (dir === 'v') {
              const targetX = side === 'left' ? vr[0] - clr : vr[2] + clr;
              off = side === 'left' ? (targetX - Math.min(A[0], B[0])) / v.s : (targetX - Math.max(A[0], B[0])) / v.s;
              if (Math.abs(off) < 1e-4) off = side === 'left' ? -0.1 : 0.1;
              lineCoord = targetX; span0 = Math.min(A[1], B[1]); span1 = Math.max(A[1], B[1]);
            } else {
              const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
              const nx = -dy / L, ny = dx / L;
              const vcx = (vr[0] + vr[2]) * 0.5, vcy = (vr[1] + vr[3]) * 0.5;
              const mx = (A[0] + B[0]) * 0.5, my = (A[1] + B[1]) * 0.5;
              const outSign = ((mx - vcx) * nx + (my - vcy) * ny) >= 0 ? 1 : -1;
              off = (side === 'out' ? outSign : -outSign) * (clr / v.s);
            }
            let bandPen = si * 12 + tier * 2.5;
            if (lineCoord != null) {
              for (const ub of usedBands) {
                if (ub.side === side && Math.abs(ub.coord - lineCoord) < 4.5 && Math.min(span1, ub.s1) > Math.max(span0, ub.s0) - 4) {
                  bandPen += 1500;
                }
              }
            }
            const cand = { ...item.res, off };
            const c = evalCost(cand, vk, bandPen);
            if (c < bestCost) {
              bestCost = c;
              bestOff = off;
            }
            if (c < 20) break;
          }
          if (bestCost < 20) break;
        }
        let chosenLine = null;
        if (dir === 'h' || dir === 'v') {
          const lineC = dir === 'h'
            ? (bestOff < 0 ? Math.max(A[1], B[1]) - bestOff * v.s : Math.min(A[1], B[1]) - bestOff * v.s)
            : (bestOff < 0 ? Math.min(A[0], B[0]) + bestOff * v.s : Math.max(A[0], B[0]) + bestOff * v.s);
          const sideTag = dir === 'h' ? (bestOff < 0 ? 'bottom' : 'top') : (bestOff < 0 ? 'left' : 'right');
          chosenLine = { side: sideTag, coord: lineC, s0: dir === 'h' ? Math.min(A[0], B[0]) : Math.min(A[1], B[1]), s1: dir === 'h' ? Math.max(A[0], B[0]) : Math.max(A[1], B[1]) };
        }
        if (chosenLine) usedBands.push(chosenLine);
        if (Math.abs((item.raw.off ?? 0) - bestOff) > 1e-4) moved++;
        item.raw.off = bestOff;
        item.res.off = bestOff;
        for (const m of measureDimTexts(item.res, lay, sh, 1.3)) placedTexts.push(m.rect);
      }
    }

    const baseAngles = [45, 135, 225, 315, 30, 60, 120, 150, 210, 240, 300, 330, 15, 75, 165, 195, 255, 285, 345, 105];
    for (const item of otherDims) {
      const { raw, res, v } = item;
      const vr = viewRects.get(res.view);
      if (res.type === 'dia' || res.type === 'rad') {
        const C = toSheet(v, res.c);
        const vcx = vr ? (vr[0] + vr[2]) * 0.5 : C[0], vcy = vr ? (vr[1] + vr[3]) * 0.5 : C[1];
        const away = Math.hypot(C[0] - vcx, C[1] - vcy) > 1e-3 ? (-Math.atan2(C[1] - vcy, C[0] - vcx) * 180) / Math.PI : (res.ang ?? 45);
        const toRad = Math.PI / 180;
        const angs = [...new Set([Math.round(res.ang ?? 45), ...baseAngles])].sort((p, q) => angleDiff(p * toRad, away * toRad) - angleDiff(q * toRad, away * toRad));
        let bestAng = res.ang ?? 45, bestLead = raw.lead ?? null, bestCost = Infinity;
        for (const leadExtra of [0, 6, 12, 18, 26, 35]) {
          for (let ai = 0; ai < angs.length; ai++) {
            const ang = angs[ai];
            const rad = (ang * Math.PI) / 180;
            const ux = Math.cos(rad), uy = -Math.sin(rad);
            const P = [C[0] + ux * res.r * v.s, C[1] + uy * res.r * v.s];
            const bx = v.geo.box, TL = toSheet(v, [bx[0], bx[3]]), BR = toSheet(v, [bx[2], bx[1]]), M = 3;
            const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
            const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
            const tEx = Math.min(tx, ty);
            const autoLead = tEx > 0 && tEx < 24 ? Math.max(5, tEx) : 7;
            const lead = leadExtra > 0 ? autoLead + leadExtra : undefined;
            const cand = { ...res, ang, ...(lead != null ? { lead } : {}) };
            if (!lead) delete cand.lead;
            const c = evalCost(cand, res.view, leadExtra * 1.5 + ai * 0.5);
            if (c < bestCost) { bestCost = c; bestAng = ang; bestLead = lead ?? null; }
            if (c < 15) break;
          }
          if (bestCost < 15) break;
        }
        if (Math.abs((raw.ang ?? 45) - bestAng) > 0.1 || (raw.lead ?? null) !== bestLead) moved++;
        raw.ang = bestAng;
        if (bestLead != null) raw.lead = bestLead;
        else delete raw.lead;
        const fin = { ...res, ang: bestAng, ...(bestLead != null ? { lead: bestLead } : {}) };
        if (bestLead == null) delete fin.lead;
        for (const m of measureDimTexts(fin, lay, sh, 1.3)) placedTexts.push(m.rect);
      } else if (res.type === 'chamfer') {
        const P = toSheet(v, res.p);
        const ux = res.dir[0], uy = -res.dir[1];
        const bx = v.geo.box, TL = toSheet(v, [bx[0], bx[3]]), BR = toSheet(v, [bx[2], bx[1]]), M = 3.5;
        const tx = ux > 1e-9 ? (BR[0] + M - P[0]) / ux : ux < -1e-9 ? (TL[0] - M - P[0]) / ux : Infinity;
        const ty = uy > 1e-9 ? (BR[1] + M - P[1]) / uy : uy < -1e-9 ? (TL[1] - M - P[1]) / uy : Infinity;
        const tEx = Math.min(tx, ty);
        const autoLead = tEx > 0 && tEx < 24 ? Math.max(6, tEx) : 8;
        let bestLead = null, bestCost = Infinity;
        for (const leadExtra of [0, 6, 12, 18, 26, 34]) {
          const lead = leadExtra > 0 ? autoLead + leadExtra : undefined;
          const cand = { ...res, ...(lead != null ? { lead } : {}) };
          if (!lead) delete cand.lead;
          const c = evalCost(cand, res.view, leadExtra);
          if (c < bestCost) { bestCost = c; bestLead = lead ?? null; }
          if (c < 15) break;
        }
        if ((raw.lead ?? null) !== bestLead) moved++;
        if (bestLead != null) raw.lead = bestLead;
        else delete raw.lead;
        const fin = { ...res, ...(bestLead != null ? { lead: bestLead } : {}) };
        if (bestLead == null) delete fin.lead;
        for (const m of measureDimTexts(fin, lay, sh, 1.3)) placedTexts.push(m.rect);
      } else if (res.type === 'ang') {
        const baseR = Math.max(6, res.r || 10);
        let bestR = baseR, bestCost = Infinity;
        for (const step of [0, 5 / v.s, 10 / v.s, 16 / v.s, 22 / v.s]) {
          const cand = { ...res, r: baseR + step };
          const c = evalCost(cand, res.view, step);
          if (c < bestCost) { bestCost = c; bestR = baseR + step; }
          if (c < 15) break;
        }
        if (Math.abs((raw.r ?? baseR) - bestR) > 1e-4) moved++;
        raw.r = bestR;
        for (const m of measureDimTexts({ ...res, r: bestR }, lay, sh, 1.3)) placedTexts.push(m.rect);
      }
    }
    return moved;
  }
  function importModelDims() {
    const sh0 = dwg();
    const lay = layout || computeLayout(sh0);
    const hasViews = ['front', 'top', 'left'].some((k) => lay.views[k] && lay.views[k].geo && !lay.views[k].noDims);
    if (!hasViews) {
      UI.toast(T('draw.modelDimsEmptyToast'), { icon: 'info' });
      return { added: 0, total: (sh0.dims || []).length, arranged: 0, overlaps: 0 };
    }
    const raw = collectModelDims(App.doc);
    const newDims = mapModelDimsToViews(raw, sh0, lay);
    let added = 0;
    let arranged = 0;
    App.change('Maße aus dem Modell übernommen', () => {
      const d = dwg();
      d.dims = (d.dims || []).filter((x) => !x.auto && !x.fromModel);
      for (const nd of newDims) {
        if (nd.type === 'lin') {
          const dup = d.dims.some((m) => m.view === nd.view && m.type === 'lin' && m.dir === nd.dir
            && ((Math.hypot(m.a[0] - nd.a[0], m.a[1] - nd.a[1]) < 0.35 && Math.hypot(m.b[0] - nd.b[0], m.b[1] - nd.b[1]) < 0.35)
              || (Math.hypot(m.a[0] - nd.b[0], m.a[1] - nd.b[1]) < 0.35 && Math.hypot(m.b[0] - nd.a[0], m.b[1] - nd.a[1]) < 0.35)));
          if (dup) continue;
        } else if (nd.type === 'dia' || nd.type === 'rad') {
          const dup = d.dims.some((m) => m.view === nd.view && m.type === nd.type && Math.hypot(m.c[0] - nd.c[0], m.c[1] - nd.c[1]) < 0.35 && Math.abs(m.r - nd.r) < 0.25);
          if (dup) continue;
        }
        d.dims.push(nd);
        added++;
      }
      const curLay = computeLayout(d);
      arranged = arrangeSheetDims(d, curLay);
    });
    render();
    Panels.renderRight();
    const res = dimTextBoxes(dwg(), layout);
    UI.toast(added === 1 ? T('draw.modelDimsOneToast') : T('draw.modelDimsToast', { n: added }), { icon: 'dim' });
    return { added, total: res.items.length, arranged, overlaps: res.overlaps };
  }
  function arrangeDims() {
    const sh0 = dwg();
    const lay = layout || computeLayout(sh0);
    let moved = 0;
    App.change('Maße geordnet', () => {
      const d = dwg();
      moved = arrangeSheetDims(d, lay);
    });
    render();
    Panels.renderRight();
    const res = dimTextBoxes(dwg(), layout);
    UI.toast(T('draw.arrangeDimsToast'), { icon: 'dim' });
    return { moved, overlaps: res.overlaps };
  }
  function autoDims() {
    App.change('Automatisch bemaßt', () => {
      const d = dwg();
      d.dims = d.dims.filter((x) => !x.auto);
      d.dims.push({ id: uid('d'), auto: 'width', view: 'front' }, { id: uid('d'), auto: 'height', view: 'front' }, { id: uid('d'), auto: 'depth', view: 'left' }, { id: uid('d'), auto: 'circles', view: 'top' });
    });
    render(); UI.toast(T('draw.autoDimsToast'), { icon: 'dim' });
  }
  // ---------- Freies Zeichnen (2D) ----------
  const freeHint = (t) => T('draw.freeHint.' + String(t || '').slice(5));
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
    const t = await UI.prompt(T('draw.addTextTitle'), T('menu.draw.text'), '', T('draw.panel.addBtn'));
    if (t && t.trim()) addFree({ type: 'text', p: q, text: t.trim(), size: 3.5 });
  }
  async function editFreeText(id) {
    const f = dwg().free.find((x) => x.id === id && x.type === 'text'); if (!f) return;
    const t = await UI.prompt(T('draw.editTextTitle'), T('menu.draw.text'), f.text, T('draw.panel.changeBtn'));
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
    const projMenuFld = UI.selectField({ id: 'dw-projection', label: T('draw.tb.projection'), value: normProjection(d.projection), options: [['eu', T('draw.proj.eu')], ['us', T('draw.proj.us')]], onChange: (v) => setProjection(v) });
    projMenuFld.dataset.help = 'drawingProjection';
    box.append(projMenuFld);
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
      '-',
      { id: 'dw-menu-aux', label: T('menu.draw.addAux'), icon: 'arrowR', help: 'drawingAuxView', run: () => tool_('aux') },
      { id: 'dw-menu-break', label: T('menu.draw.addBreak'), icon: 'split', help: 'drawingBreakView', run: () => tool_('break') },
      '-',
      { id: 'dw-menu-add-explode', label: T('menu.draw.addExplode'), icon: 'explode', help: 'drawingExplode', run: () => addView('explode') },
      { id: 'dw-menu-add-explode-shaded', label: T('menu.draw.addExplodeShaded'), icon: 'explode', help: 'drawingExplode', run: () => addView('explode', { shaded: true }) },
    ]);
  }
  function bomMenu(anchor) {
    const sh = dwg();
    const hasB = !!(sh.balloons && sh.balloons.length);
    const hasBom = !!(sh.bomTable && sh.bomTable.show);
    UI.menu(anchor, [
      { id: 'dw-menu-auto-balloons', label: T('menu.draw.autoBalloons'), icon: 'list', help: 'drawingBalloons', run: () => autoBalloons() },
      { id: 'dw-menu-add-balloon', label: T('menu.draw.addBalloon'), icon: 'plus', kbd: 'B', help: 'drawingBalloons', checked: tool === 'balloon', run: () => tool_('balloon') },
      '-',
      { id: 'dw-menu-bom-table', label: T('menu.draw.bomTable'), icon: 'sheet', help: 'drawingBom', checked: hasBom, run: () => setBomTable(!hasBom) },
      '-',
      { id: 'dw-menu-clear-balloons', label: T('menu.draw.clearBalloons'), icon: 'trash', disabled: !hasB, run: () => clearBalloons() },
    ]);
  }
  function exportMenu(anchor) {
    const entries = [
      { id: 'dw-exp-pdf', label: T('menu.draw.exportPdf'), icon: 'file', run: () => exportPDF() },
      { id: 'dw-exp-svg', label: T('menu.draw.exportSvg'), icon: 'file', run: () => exportSVG() },
      { id: 'dw-exp-dxf', label: T('menu.draw.exportDxf'), icon: 'file', help: 'drawingExportDxf', run: () => exportDXF() },
    ];
    if (sheets().length > 1) {
      entries.push({ id: 'dw-exp-dxf-all', label: T('menu.draw.exportDxfAll'), icon: 'file', help: 'drawingExportDxf', run: () => exportDXF({ allSheets: true }) });
    }
    entries.push('-', { id: 'dw-exp-png', label: T('menu.draw.exportPng'), icon: 'image', help: 'drawingExportPng', run: () => pngDialog() });
    UI.menu(anchor, entries);
  }
  function fileBase(withSheet = false, sh = dwg()) {
    const base = ((sh.title && sh.title.titel) || App.doc.name) + ' Zeichnung';
    return Print.safeName(withSheet && sheets().length > 1 ? `${base} ${sh.name}` : base);
  }
  async function exportSVG() {
    await ensureProjections();
    const all = sheets(), idx = activeIndex(), sh = all[idx] || dwg();
    const cur = buildSheetContent(sh, idx, all.length);
    const [W, H] = [cur.layout.W, cur.layout.H];
    const el = buildSheetSVGElement(cur, { widthAttr: `${W}mm`, heightAttr: `${H}mm`, transparent: false, interactive: false });
    const str = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(el);
    await Print.save(fileBase(true, sh) + '.svg', str);
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
      'explode-trail': [0.22, [3, 1.4]],
      hatch: [0.22, null],
      breakline: [0.25, null],
      auxarrow: [0.35, null],
      cutline: [0.35, [7, 1.2, 0.7, 1.2]],
      cutend: [0.7, null],
      breakline: [0.25, null],
      dim: [0.25, null],
      'arrow-open': [0.3, null],
      'arrow-slash': [0.45, null],
      leader: [0.25, null],
      'balloon-line': [0.25, null],
      'balloon-circle': [0.35, null],
      'bom-frame': [0.5, null],
      'bom-head-line': [0.35, null],
      'bom-grid': [0.22, null],
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
      if (l.cls === 'bom-bg' && l.rect) {
        const [rx, ry, rw, rh] = l.rect;
        out.push(`1 g ${px(rx)} ${py(ry + rh)} ${pf(rw * PT)} ${pf(rh * PT)} re f`);
        continue;
      }
      if (l.cls === 'arrow' || l.cls === 'leader-arrow' || l.cls === 'balloon-arrow') {
        const [a, b, c] = l.poly;
        out.push(`${l.lost ? '0.788 0.216 0.180' : '0.067'} g ${px(a[0])} ${py(a[1])} m ${px(b[0])} ${py(b[1])} l ${px(c[0])} ${py(c[1])} l h f`);
        continue;
      }
      if ((l.cls === 'arrow-dot' || l.cls === 'leader-dot' || l.cls === 'balloon-dot') && l.circle) {
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
      else if (l.cls === 'hatch' && l.dashed) out.push(`[${pf(3 * PT)} ${pf(1.2 * PT)}] 0 d`);
      else if (st[1]) out.push(`[${st[1].map((v) => pf(v * PT)).join(' ')}] 0 d`);
      else out.push('[] 0 d');
      if (l.rect) {
        const [rx, ry, rw, rh] = l.rect;
        out.push(`${px(rx)} ${py(ry + rh)} ${pf(rw * PT)} ${pf(rh * PT)} re S`);
      } else if (l.circle) {
        const cx = l.circle[0] * PT, cy = (H - l.circle[1]) * PT, R = l.circle[2] * PT;
        const k = 0.5522847498 * R;
        const op = l.cls === 'balloon-circle' ? 'B' : 'S';
        if (l.cls === 'balloon-circle') out.push('1 g');
        out.push(
          `${pf(cx + R)} ${pf(cy)} m`,
          `${pf(cx + R)} ${pf(cy + k)} ${pf(cx + k)} ${pf(cy + R)} ${pf(cx)} ${pf(cy + R)} c`,
          `${pf(cx - k)} ${pf(cy + R)} ${pf(cx - R)} ${pf(cy + k)} ${pf(cx - R)} ${pf(cy)} c`,
          `${pf(cx - R)} ${pf(cy - k)} ${pf(cx - k)} ${pf(cy - R)} ${pf(cx)} ${pf(cy - R)} c`,
          `${pf(cx + k)} ${pf(cy - R)} ${pf(cx + R)} ${pf(cy - k)} ${pf(cx + R)} ${pf(cy)} c ${op}`
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
      const fnt = (t.cls === 'title' || t.cls === 'detail-lbl' || t.cls === 'cutlabel' || t.cls === 'auxlabel' || t.cls === 'viewlabel' || t.cls === 'bom-th' || t.cls === 'balloon-text') ? '/F2' : '/F1';
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
  const DXF_LAYERS = [
    ['SICHTBAR', 'CONTINUOUS', 7],
    ['TANGENTIAL', 'CONTINUOUS', 9],
    ['VERDECKT', 'DASHED', 8],
    ['MITTELLINIE', 'CENTER', 1],
    ['SCHRAFFUR', 'CONTINUOUS', 8],
    ['SCHNITTLINIE', 'CENTER', 1],
    ['BEMASSUNG', 'CONTINUOUS', 3],
    ['GEWINDE', 'CONTINUOUS', 4],
    ['RAHMEN', 'CONTINUOUS', 7],
  ];
  function dxfEscText(s) {
    return String(s ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/⌒/g, 'Bogen ')
      .replace(/Ø/g, '%%c')
      .replace(/±/g, '%%p')
      .replace(/°/g, '%%d')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[„“”]/g, '"')
      .replace(/[‚‘’]/g, "'");
  }
  function buildSheetDXF(cur) {
    const W = cur.layout.W, H = cur.layout.H;
    const out = [];
    const P = (...a) => out.push(...a.map(String));
    P(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 9, '$EXTMIN', 10, 0, 20, 0, 30, 0, 9, '$EXTMAX', 10, W, 20, H, 30, 0, 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 3);
    P(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0.0);
    P(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 3.6, 49, 2.4, 49, -1.2);
    P(0, 'LTYPE', 2, 'CENTER', 70, 0, 3, '____ _ ____', 72, 65, 73, 4, 40, 8, 49, 5, 49, -1.2, 49, 0.6, 49, -1.2);
    P(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, DXF_LAYERS.length);
    for (const [n, lt, col] of DXF_LAYERS) P(0, 'LAYER', 2, n, 70, 0, 62, col, 6, lt);
    P(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    const layer = {
      vis: 'SICHTBAR', tan: 'TANGENTIAL', hid: 'VERDECKT', ctr: 'MITTELLINIE', 'explode-trail': 'MITTELLINIE',
      hatch: 'SCHRAFFUR', cutline: 'SCHNITTLINIE', cutend: 'SCHNITTLINIE', auxarrow: 'BEMASSUNG',
      dim: 'BEMASSUNG', arrow: 'BEMASSUNG', 'arrow-open': 'BEMASSUNG', 'arrow-slash': 'BEMASSUNG', 'arrow-dot': 'BEMASSUNG',
      leader: 'BEMASSUNG', 'leader-arrow': 'BEMASSUNG', 'leader-dot': 'BEMASSUNG', detail: 'BEMASSUNG',
      'balloon-line': 'BEMASSUNG', 'balloon-arrow': 'BEMASSUNG', 'balloon-dot': 'BEMASSUNG', 'balloon-circle': 'BEMASSUNG',
      'detail-border': 'RAHMEN', breakline: 'RAHMEN', frame: 'RAHMEN', thin: 'RAHMEN',
      'bom-frame': 'RAHMEN', 'bom-head-line': 'RAHMEN', 'bom-grid': 'RAHMEN',
    };
    const stats = { lines: 0, circles: 0, arcs: 0, polylines: 0, solids: 0, texts: 0, byLayer: {} };
    const bumpLayer = (ly) => { stats.byLayer[ly] = (stats.byLayer[ly] || 0) + 1; };
    const Y = (y) => H - y;
    const line = (a, b, ly, lt = null) => {
      P(0, 'LINE', 8, ly, ...(lt ? [6, lt] : []), 10, a[0].toFixed(4), 20, Y(a[1]).toFixed(4), 30, 0, 11, b[0].toFixed(4), 21, Y(b[1]).toFixed(4), 31, 0);
      stats.lines++; bumpLayer(ly);
    };
    for (const l of cur.lines || []) {
      const ly = (l.thread || l.threadEnd) ? 'GEWINDE' : (l.cls === 'breakline' && l.secId ? 'SCHNITTLINIE' : layer[l.cls]); if (!ly) continue;
      const lt = l.cls === 'breakline' ? 'CONTINUOUS' : ((l.cls === 'hatch' && l.dashed) || ((l.thread || l.threadEnd) && l.cls === 'hid')) ? 'DASHED' : null;
      if (l.rect) {
        const [x, y, w, hh] = l.rect;
        const c = [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]];
        for (let i = 0; i < 4; i++) line(c[i], c[(i + 1) % 4], ly, lt);
      } else if (l.circle) {
        P(0, 'CIRCLE', 8, ly);
        if (l.cls === 'detail-border') P(6, 'DASHED');
        P(10, l.circle[0].toFixed(4), 20, Y(l.circle[1]).toFixed(4), 30, 0, 40, l.circle[2].toFixed(4));
        stats.circles++; bumpLayer(ly);
      } else if (l.poly) {
        const q = l.poly;
        if (q.length === 3 && (l.cls === 'arrow' || l.cls === 'leader-arrow' || l.cls === 'balloon-arrow')) {
          P(0, 'SOLID', 8, ly,
            10, q[0][0].toFixed(4), 20, Y(q[0][1]).toFixed(4), 30, 0,
            11, q[1][0].toFixed(4), 21, Y(q[1][1]).toFixed(4), 31, 0,
            12, q[2][0].toFixed(4), 22, Y(q[2][1]).toFixed(4), 32, 0,
            13, q[2][0].toFixed(4), 23, Y(q[2][1]).toFixed(4), 33, 0);
          stats.solids++; bumpLayer(ly);
        } else {
          for (let i = 0; i < q.length; i++) line(q[i], q[(i + 1) % q.length], ly, lt);
        }
      } else if (l.arc) {
        // echter Bogen (gegen den Uhrzeigersinn); die Winkel der Ansicht gelten unverändert, weil DXF wie die Ansicht nach oben zählt
        const deg = (x) => ((((x * 180) / Math.PI) % 360) + 360) % 360;
        P(0, 'ARC', 8, ly, ...(lt ? [6, lt] : []), 10, l.arc.c[0].toFixed(4), 20, Y(l.arc.c[1]).toFixed(4), 30, 0, 40, l.arc.r.toFixed(4), 50, deg(l.arc.a[0]).toFixed(4), 51, deg(l.arc.a[1]).toFixed(4));
        stats.arcs++; bumpLayer(ly);
      } else if (l.pts && l.pts.length === 2) {
        line(l.pts[0], l.pts[1], ly, lt);
      } else if (l.pts && l.pts.length > 2) {
        P(0, 'POLYLINE', 8, ly, ...(lt ? [6, lt] : []), 66, 1, 10, 0, 20, 0, 30, 0, 70, 0);
        for (const q of l.pts) P(0, 'VERTEX', 8, ly, 10, q[0].toFixed(4), 20, Y(q[1]).toFixed(4), 30, 0);
        P(0, 'SEQEND', 8, ly);
        stats.polylines++; bumpLayer(ly);
      }
    }
    for (const t of cur.texts || []) {
      if (t.cls === 'note') continue;
      const cls = String(t.cls || '');
      const tLy = (cls.startsWith('dimtext') || cls === 'leadertext' || cls === 'detail-lbl' || cls === 'balloon-text' || cls === 'auxlabel') ? 'BEMASSUNG'
        : (cls === 'cutlabel' || cls === 'viewlabel') ? 'SCHNITTLINIE' : 'RAHMEN';
      const align = t.anchor === 'middle' ? [72, 1, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0]
        : t.anchor === 'end' ? [72, 2, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0] : [];
      P(0, 'TEXT', 8, tLy, 10, t.x.toFixed(4), 20, Y(t.y).toFixed(4), 30, 0, 40, t.size.toFixed(3), 1, dxfEscText(t.t), 50, (-(t.rot || 0)).toFixed(3), ...align);
      stats.texts++; bumpLayer(tLy);
    }
    P(0, 'ENDSEC', 0, 'EOF');
    const text = out.join('\r\n') + '\r\n';
    const bytes = new TextEncoder().encode(text);
    return { text, bytes, layers: DXF_LAYERS.map((x) => x[0]), stats };
  }
  async function buildDXF(opts = {}) {
    await ensureProjections();
    const all = sheets();
    const idx = opts.sheetIndex != null ? clamp(opts.sheetIndex, 0, all.length - 1) : activeIndex();
    const sh = all[idx] || dwg();
    const cur = buildSheetContent(sh, idx, all.length);
    const res = buildSheetDXF(cur);
    return { ...res, filename: fileBase(true, sh) + '.dxf', sheet: sh.name };
  }
  async function exportDXF(opts = {}) {
    const tst = UI.toast('DXF wird erstellt …', { icon: 'file', ms: 15000 });
    try {
      const all = sheets();
      if (opts.allSheets && all.length > 1) {
        await ensureProjections();
        const files = [];
        const used = new Set();
        for (let i = 0; i < all.length; i++) {
          const sh = all[i];
          const cur = buildSheetContent(sh, i, all.length);
          const dxf = buildSheetDXF(cur);
          let fname = fileBase(true, sh) + '.dxf';
          if (used.has(fname)) fname = Print.safeName(`${fileBase(false, sh)} ${i + 1}`) + '.dxf';
          used.add(fname);
          files.push({ name: fname, data: dxf.bytes });
        }
        const zip = await Zip.make(files);
        tst.remove();
        const zipName = fileBase(false) + ' DXF.zip';
        await Print.save(zipName, new Blob([zip]));
        lastDXF = { filename: zipName, files: files.map((f) => f.name), zipBytes: zip.length };
        return lastDXF;
      }
      const res = await buildDXF(opts);
      tst.remove();
      await Print.save(res.filename, new Blob([res.bytes], { type: 'application/dxf' }));
      lastDXF = res;
      return res;
    } catch (e) {
      tst.remove();
      UI.toast('DXF hat nicht geklappt: ' + e.message, { kind: 'bad' });
      return null;
    }
  }
  // ---------- PNG-Export mit wählbarer Auflösung (ZE-13) ----------
  const PNG_MIN_DIM = 200;
  const PNG_MAX_DIM = 8192;
  const PNG_PRESETS = [
    { key: '1600', get label() { return T('draw.png.p1600'); } },
    { key: '2400', get label() { return T('draw.png.p2400'); } },
    { key: '3840', get label() { return T('draw.png.p3840'); } },
    { key: 'dpi150', get label() { return T('draw.png.dpi150'); } },
    { key: 'dpi300', get label() { return T('draw.png.dpi300'); } },
    { key: 'custom', get label() { return T('draw.png.custom'); } },
  ];
  function pngDimensions(opts = {}, sh = dwg()) {
    const [W, H] = sheetSize(sh);
    let rawW = 2400;
    if (typeof opts.width === 'number' && isFinite(opts.width) && opts.width > 0) {
      rawW = Math.round(opts.width);
    } else if (typeof opts.dpi === 'number' && isFinite(opts.dpi) && opts.dpi > 0) {
      rawW = Math.round((W / 25.4) * opts.dpi);
    } else if (opts.preset === 'dpi150') {
      rawW = Math.round((W / 25.4) * 150);
    } else if (opts.preset === 'dpi300') {
      rawW = Math.round((W / 25.4) * 300);
    } else if (opts.preset && isFinite(+opts.preset) && +opts.preset > 0) {
      rawW = Math.round(+opts.preset);
    }
    let width = clamp(rawW, PNG_MIN_DIM, PNG_MAX_DIM);
    let height = Math.max(1, Math.round((width * H) / W));
    let clamped = width !== rawW;
    if (height > PNG_MAX_DIM) {
      height = PNG_MAX_DIM;
      width = Math.max(PNG_MIN_DIM, Math.round((height * W) / H));
      clamped = true;
    }
    return { width, height, clamped, sheetW: W, sheetH: H };
  }
  async function buildPNG(opts = {}) {
    await ensureProjections();
    const all = sheets();
    const idx = opts.sheetIndex != null ? clamp(opts.sheetIndex, 0, all.length - 1) : activeIndex();
    const sh = all[idx] || dwg();
    const cur = buildSheetContent(sh, idx, all.length);
    const transparent = !!opts.transparent;
    const { width, height, clamped } = pngDimensions(opts, sh);
    const svgEl = buildSheetSVGElement(cur, {
      widthAttr: String(width),
      heightAttr: String(height),
      transparent,
      interactive: false,
    });
    const svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('Zeichnung konnte nicht als Bild gerendert werden.'));
        im.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!transparent) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden.'))), 'image/png');
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { blob, bytes, width, height, clamped, transparent, filename: fileBase(true, sh) + '.png', sheet: sh.name };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function exportPNG(opts = {}) {
    const tst = UI.toast('PNG wird erstellt …', { icon: 'image', ms: 15000 });
    try {
      const res = await buildPNG(opts);
      tst.remove();
      await Print.save(res.filename, res.blob);
      lastPNG = res;
      return res;
    } catch (e) {
      tst.remove();
      UI.toast(T('draw.png.err', { msg: e.message }), { kind: 'bad' });
      return null;
    }
  }
  function pngDialog() {
    const sh = dwg();
    const st = { preset: '2400', width: pngDimensions({ preset: '2400' }, sh).width, transparent: false };
    const body = h('div', { style: { display: 'grid', gap: '12px', minWidth: 'min(380px, 80vw)' } });
    const presetOpts = PNG_PRESETS.map((p) => {
      if (p.key === 'custom') return [p.key, p.label];
      const d = pngDimensions({ preset: p.key }, sh);
      return [p.key, `${p.label} (${d.width} × ${d.height})`];
    });
    const infoEl = h('div', { class: 'mini-row', id: 'dw-png-info', style: { color: 'var(--muted)', fontSize: '12.5px' } });
    const widthInp = h('input', { id: 'dw-png-width', type: 'number', min: String(PNG_MIN_DIM), max: String(PNG_MAX_DIM), step: '10', value: String(st.width), autocomplete: 'off' });
    const widthFld = h('div', { class: 'field' },
      h('label', { for: 'dw-png-width' }, T('draw.png.widthPx')),
      h('div', { class: 'inp' }, widthInp, h('span', { class: 'unit' }, 'px'))
    );
    const presetFld = UI.selectField({
      id: 'dw-png-preset',
      label: T('draw.png.resolution'),
      value: st.preset,
      options: presetOpts,
      onChange: (v) => {
        st.preset = v;
        if (v !== 'custom') {
          st.width = pngDimensions({ preset: v }, sh).width;
          widthInp.value = String(st.width);
        }
        updateInfo();
      },
    });
    const presetSel = presetFld.querySelector('select');
    const updateInfo = () => {
      const d = pngDimensions({ width: st.width }, sh);
      const orientTxt = T(sh.orient === 'portrait' ? 'menu.draw.portrait' : 'menu.draw.landscape').toLowerCase();
      infoEl.textContent = T('draw.png.info', { w: d.width, h: d.height, sheet: sh.sheet, orient: orientTxt, clamped: d.clamped ? T('draw.png.clamped', { max: PNG_MAX_DIM }) : '' });
    };
    const onWidthInput = () => {
      const n = Math.round(Number(widthInp.value));
      if (isFinite(n) && n > 0) st.width = n;
      st.preset = 'custom';
      if (presetSel) presetSel.value = 'custom';
      updateInfo();
    };
    widthInp.addEventListener('input', onWidthInput);
    widthInp.addEventListener('change', () => {
      const d = pngDimensions({ width: Number(widthInp.value) || st.width }, sh);
      st.width = d.width;
      widthInp.value = String(d.width);
      updateInfo();
    });
    widthInp.addEventListener('keydown', (e) => e.stopPropagation());
    const transChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-png-transparent' }), T('draw.png.transparent'));
    transChk.querySelector('input').onchange = (e) => { st.transparent = e.target.checked; };
    updateInfo();
    body.append(
      presetFld,
      widthFld,
      infoEl,
      transChk,
      h('div', { class: 'hint-box' }, T('draw.png.hint'))
    );
    UI.modal({
      title: T('draw.png.dialogTitle'),
      body,
      actions: [
        { label: T('common.cancel') },
        { id: 'dw-png-save', label: T('draw.png.saveBtn'), primary: true, run: () => { exportPNG({ width: st.width, transparent: st.transparent }); } },
      ],
    });
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
      lostSec.append(h('div', { class: 'section-h dw-lost-h' }, T('draw.panel.lostHeading', { n: lostList.length })));
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
          h('div', { class: 'dw-lost-reason' }, ld.lostReason || T('draw.panel.lostEdgeMissing')),
        );
        const acts = h('div', { class: 'dw-lost-acts' });
        const bRebind = h('button', {
          type: 'button',
          class: 'btn dw-lost-rebind' + (isRebinding ? ' active' : ''),
          'data-dim-id': ld.id,
        }, T(isRebinding ? 'common.cancel' : 'draw.panel.lostRebind'));
        bRebind.onclick = (e) => {
          e.stopPropagation();
          if (isRebinding) setTool(null);
          else startRebind(ld.id);
        };
        const bDel = h('button', {
          type: 'button',
          class: 'btn danger dw-lost-del',
          'data-dim-id': ld.id,
        }, T('common.delete'));
        bDel.onclick = (e) => { e.stopPropagation(); removeDim(ld.id); };
        acts.append(bRebind, bDel);
        row.append(acts);
        row.onclick = () => { selDim = ld.id; render(); Panels.renderRight(); };
        lWrap.append(row);
      }
      lostSec.append(lWrap);
      if (lostList.length > 1) {
        const bDelAll = h('button', { type: 'button', class: 'btn danger', id: 'dw-lost-del-all', style: { marginTop: '6px', width: '100%' } }, T('draw.panel.lostDelAll'));
        bDelAll.onclick = () => removeLostDims();
        lostSec.append(bDelAll);
      }
      w.append(lostSec);
    }
    const vSec = h('div', { class: 'section', 'data-help': 'drawingViews' }, h('div', { class: 'section-h' }, T('menu.draw.viewsHeading')));
    const bIso = h('button', { type: 'button', class: 'btn', id: 'dw-add-iso', 'data-help': 'drawingViews' });
    bIso.innerHTML = icon('plus') + esc(T('draw.panel.addIso'));
    bIso.onclick = () => addView('iso');
    const bFree = h('button', { type: 'button', class: 'btn', id: 'dw-add-free', 'data-help': 'drawingViews' });
    bFree.innerHTML = icon('eye') + esc(T('draw.panel.addFree'));
    bFree.onclick = () => addView('free');
    const bEx = h('button', { type: 'button', class: 'btn', id: 'dw-add-explode', 'data-help': 'drawingExplode' });
    bEx.innerHTML = icon('explode') + esc(T('draw.panel.addExplode'));
    bEx.onclick = () => addView('explode');
    vSec.append(h('div', { class: 'btn-row' }, bIso, bFree), h('div', { class: 'btn-row', style: { marginTop: '6px' } }, bEx));
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
          const del = h('button', { type: 'button', class: 'dw-view-del', 'aria-label': T('draw.panel.delView'), 'data-tip': T('draw.panel.delView') });
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
      vp.append(h('div', { class: 'dw-view-props-h' }, T('draw.panel.viewHeading', { name: curMeta ? curMeta.name : curKey })));
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
      if (curMeta && curMeta.kind === 'explode') {
        const pctVal = Math.round((curMeta.explodeAmount ?? 0.7) * 100);
        const pctEl = h('b', { class: 'mono', id: 'dw-v-ex-pct' }, pctVal + ' %');
        const rng = h('input', { type: 'range', id: 'dw-v-ex-amount', min: '10', max: '150', step: '5', value: String(pctVal), style: { flex: '1' } });
        rng.addEventListener('input', () => { pctEl.textContent = rng.value + ' %'; });
        rng.addEventListener('change', () => updateExplodeView(curKey, { explodeAmount: Number(rng.value) / 100 }));
        vp.append(h('div', { class: 'field' },
          h('div', { class: 'mini-row' }, h('label', { for: 'dw-v-ex-amount', class: 'grow' }, T('draw.panel.exAmount')), pctEl),
          rng));
        const hasExSteps = typeof Assembly !== 'undefined' && Assembly.explodeSteps().length > 0;
        if (hasExSteps || curMeta.explodeMode === 'steps') {
          vp.append(UI.selectField({
            id: 'dw-v-ex-mode',
            label: T('draw.panel.exMode'),
            value: curMeta.explodeMode === 'steps' ? 'steps' : 'auto',
            options: [['auto', T('draw.panel.exModeAuto')], ['steps', T('draw.panel.exModeSteps')]],
            onChange: (v) => updateExplodeView(curKey, { explodeMode: v }),
          }));
        }
        const trChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-v-ex-trails', checked: curMeta.explodeTrails !== false }), T('draw.panel.exTrails'));
        trChk.querySelector('input').onchange = (e) => updateExplodeView(curKey, { explodeTrails: e.target.checked });
        vp.append(trChk);
      }
      if (curMeta && (curMeta.kind === 'free' || curMeta.kind === 'explode')) {
        const recam = h('button', { type: 'button', class: 'btn', id: 'dw-v-recam' });
        recam.innerHTML = icon('eye') + esc(T('draw.panel.recam'));
        recam.onclick = () => updateFreeViewCamera(curKey);
        vp.append(recam);
      }
      vSec.append(vp);
    }
    w.append(vSec);

    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('draw.panel.titleBlock')));
    const tf = (k, label, ph) => { const f = h('div', { class: 'field' }, h('label', { for: 'tb-' + k }, label), h('div', { class: 'inp' }, h('input', { id: 'tb-' + k, value: d.title[k] || '', placeholder: ph || '', style: { fontFamily: 'var(--font)' } }))); const inp = f.querySelector('input'); inp.addEventListener('change', (e) => set((x) => { x.title[k] = e.target.value; }, 'Schriftfeld geändert')); inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } }); return f; };
    sec.append(tf('titel', T('draw.tb.title'), App.doc.name), h('div', { class: 'fields' }, tf('nummer', T('draw.tb.dwgNo')), tf('blatt', T('draw.tb.sheet'), `${idx + 1}/${all.length}`)), h('div', { class: 'fields' }, tf('name', T('draw.panel.drawnBy')), tf('datum', T('draw.tb.date'))), h('div', { class: 'fields' }, tf('werkstoff', T('draw.tb.material')), tf('firma', T('draw.tb.company'))));
    w.append(sec);
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('draw.panel.sheetHeading')));
    info.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.sheetNameLabel')), h('b', null, d.name)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.tb.sheet')), h('b', { class: 'mono' }, `${idx + 1} / ${all.length}`)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.tb.scale')), h('b', { class: 'mono', id: 'dw-scale-val' }, layout ? scaleText(layout.s) : '–')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.panel.dimsCount')), h('b', { class: 'mono' }, String(layout ? autoDimList(d, layout).length : d.dims.length)))));
    const flds = h('div', { class: 'fields', 'data-help': 'drawingFormat' });
    flds.append(UI.selectField({ id: 'dw-panel-sheet', label: T('menu.draw.sheet'), value: d.sheet, options: sheetOptions(), onChange: (v) => { set((x) => { x.sheet = v; }); fitZoom(); renderTabs(); } }));
    flds.append(UI.selectField({ id: 'dw-panel-orient', label: T('menu.draw.orient'), value: d.orient, options: [['landscape', T('menu.draw.landscape')], ['portrait', T('menu.draw.portrait')]], onChange: (v) => { set((x) => { x.orient = v; }); fitZoom(); renderTabs(); } }));
    const projFld = UI.selectField({ id: 'dw-panel-projection', label: T('draw.tb.projection'), value: normProjection(d.projection), options: [['eu', T('draw.proj.eu')], ['us', T('draw.proj.us')]], onChange: (v) => setProjection(v) });
    projFld.dataset.help = 'drawingProjection';
    info.append(flds, projFld);
    const b = h('button', { type: 'button', class: 'btn', id: 'dw-sheet-btn', 'data-help': 'drawingFormat' }); b.innerHTML = icon('sheet') + esc(T('draw.panel.sheetAndViews')); b.onclick = (e) => sheetMenu(e.currentTarget);
    const bAdd = h('button', { type: 'button', class: 'btn', id: 'dw-panel-add', 'data-help': 'drawingSheets' }); bAdd.innerHTML = icon('plus') + esc(T('draw.panel.newSheet')); bAdd.onclick = () => addSheet();
    info.append(h('div', { class: 'btn-row' }, b, bAdd));
    if (d.viewPos && Object.keys(d.viewPos).length) {
      const bResetV = h('button', { type: 'button', class: 'btn', id: 'dw-reset-views', style: { marginTop: '6px' } }, T('draw.panel.resetViews'));
      bResetV.onclick = () => resetViewPos();
      info.append(bResetV);
    }
    w.append(info);
    const dimSec = h('div', { class: 'section', id: 'dw-dims-sec', 'data-help': 'drawingDimTypes' }, h('div', { class: 'section-h' }, T('draw.panel.dimSec')));
    const dimGrid = h('div', { class: 'dw-dim-grid' });
    const simpleMode = isSimpleMode();
    for (const m of DIM_MODES) {
      if (simpleMode && m.pro) continue;
      const act = tool === 'dim' && dimMode === m.key;
      const db = h('button', {
        type: 'button',
        class: 'btn' + (m.pro ? ' pro' : '') + (act ? ' active' : ''),
        id: 'dw-dm-' + m.key,
        'aria-pressed': String(act),
        'data-help': m.pro ? 'drawingOrdArc' : 'drawingDimTypes',
      }, m.short);
      db.onclick = () => { if (tool === 'dim' && dimMode === m.key) setTool(null); else setDimMode(m.key); };
      dimGrid.append(db);
    }
    dimSec.append(dimGrid);
    const bModelDims = h('button', { type: 'button', class: 'btn', id: 'dw-model-dims', 'data-help': 'drawingModelDims' });
    bModelDims.innerHTML = icon('dim') + esc(T('draw.panel.modelDimsBtn'));
    bModelDims.onclick = () => importModelDims();
    const bArrangeDims = h('button', { type: 'button', class: 'btn', id: 'dw-arrange-dims', 'data-help': 'drawingModelDims' });
    bArrangeDims.innerHTML = icon('sliders') + esc(T('draw.panel.arrangeDimsBtn'));
    bArrangeDims.onclick = () => arrangeDims();
    dimSec.append(h('div', { class: 'btn-row', style: { marginTop: '6px' } }, bModelDims, bArrangeDims));
    if (tool === 'dim' && (dimMode === 'chain' || dimMode === 'base' || dimMode === 'ordinate') && toolState && toolState.stage === 3) {
      const fin = h('button', { type: 'button', class: 'btn primary', id: 'dw-dm-finish', style: { marginTop: '6px' } }, T('draw.panel.finishChain'));
      fin.onclick = () => { toolState = { stage: 0 }; render(); Panels.renderRight(); };
      dimSec.append(fin);
    }
    w.append(dimSec);
    // Maß-Stil je Blatt (ZE-10) & Doppelmaße (ZE-22)
    const ds = sheetDimStyle(d);
    const styleSec = h('div', { class: 'section', id: 'dw-dimstyle-sec', 'data-help': 'drawingDimStyle' }, h('div', { class: 'section-h' }, T('draw.panel.dimStyleSec')));
    const fsList = DIM_FONT_SIZES.includes(ds.fontSize) ? DIM_FONT_SIZES : [...DIM_FONT_SIZES, ds.fontSize].sort((a, b) => a - b);
    const decVal = ds.decimals == null ? 'auto' : String(ds.decimals);
    const decOpts = [
      ['auto', T('draw.panel.decAuto')],
      ['0', T('draw.panel.dec0')],
      ['1', T('draw.panel.dec1')],
      ['2', T('draw.panel.dec2')],
      ['3', T('draw.panel.dec3')],
      ['4', T('draw.panel.dec4')],
    ];
    styleSec.append(
      UI.selectField({ id: 'dw-style-arrow', label: T('draw.panel.arrow'), value: ds.arrow, options: DIM_ARROWS.map((a) => [a.key, a.label]), onChange: (v) => setDimStyle({ arrow: v }) }),
      h('div', { class: 'fields' },
        UI.selectField({ id: 'dw-style-size', label: T('draw.panel.fontSize'), value: String(ds.fontSize), options: fsList.map((s) => [String(s), fmtFixed(s, 1) + ' mm']), onChange: (v) => setDimStyle({ fontSize: +v || 3.5 }) }),
        UI.selectField({ id: 'dw-style-dec', label: T('draw.panel.decimals'), value: decVal, options: decOpts, onChange: (v) => setDimStyle({ decimals: v === 'auto' ? null : +v }) }),
      ),
    );
    if (!simpleMode) {
      const dualChk = h('label', { class: 'check pro', 'data-help': 'drawingDualDims' }, h('input', { type: 'checkbox', id: 'dw-style-dual', checked: !!ds.dual }), T('draw.panel.dualDims'));
      dualChk.querySelector('input').onchange = (e) => setDualDims(e.target.checked);
      styleSec.append(dualChk);
      if (ds.dual && Units.key() !== 'in') {
        const dualDecFld = UI.selectField({
          id: 'dw-style-dual-dec',
          label: T('draw.panel.dualDec'),
          value: String(ds.dualDecimals),
          options: [['2', T('draw.panel.dualDec2')], ['3', T('draw.panel.dualDec3')], ['4', T('draw.panel.dualDec4')]],
          onChange: (v) => setDimStyle({ dualDecimals: +v || 3 }),
        });
        dualDecFld.classList.add('pro');
        dualDecFld.dataset.help = 'drawingDualDims';
        styleSec.append(dualDecFld);
      }
    }
    w.append(styleSec);
    // Hinweislinien / Notizen (ZE-11)
    const noteSec = h('div', { class: 'section', id: 'dw-notes-sec', 'data-help': 'drawingLeader' }, h('div', { class: 'section-h' }, T('draw.panel.leadersSec')));
    const bNote = h('button', { type: 'button', class: 'btn' + (tool === 'note' ? ' active' : ''), id: 'dw-add-note', 'data-help': 'drawingLeader' });
    bNote.innerHTML = icon('noteText') + esc(T(tool === 'note' ? 'draw.panel.leaderActive' : 'draw.panel.leaderAdd'));
    bNote.onclick = () => tool_('note');
    noteSec.append(bNote);
    if (tool === 'note') {
      const tipFld = UI.selectField({ id: 'dw-note-new-tip', label: T('draw.panel.tip'), value: noteDraft.tip, options: NOTE_TIPS.map((x) => [x.key, x.label]), onChange: (v) => { noteDraft.tip = v; render(); } });
      const txtFld = UI.textField({ id: 'dw-note-new-text', label: T('menu.draw.text'), value: noteDraft.text, live: true, placeholder: T('draw.panel.notePh'), onCommit: (v) => { noteDraft.text = v; render(); } });
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
        const vw = h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } }, n.view ? viewLabel(n.view, d) : T('draw.tb.sheet'));
        const db = h('button', { type: 'button', class: 'btn danger note-del', style: { padding: '2px 6px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.leaderDelTip'), 'aria-label': T('draw.panel.leaderDelTip') });
        db.innerHTML = icon('trash');
        db.onclick = (e) => { e.stopPropagation(); removeNote(n.id); };
        row.append(badge, txt, vw, db);
        row.onclick = () => { selDim = n.id; render(); Panels.renderRight(); };
        nl.append(row);
      }
      noteSec.append(nl);
    }
    w.append(noteSec);
    // Positionsnummern & Stückliste auf dem Blatt (ZE-12)
    const bomSec = h('div', { class: 'section', id: 'dw-bom-sec', 'data-help': 'drawingBom' }, h('div', { class: 'section-h' }, T('draw.panel.bomSec')));
    const bomShow = !!(d.bomTable && d.bomTable.show);
    const bomChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-bom-show', checked: bomShow }), T('draw.panel.bomShow'));
    bomChk.querySelector('input').onchange = (e) => setBomTable(e.target.checked);
    bomSec.append(bomChk);
    const viewOptsBal = [['auto', T('draw.panel.balloonViewAuto')], ...avList.map((av) => [av.id, av.name])];
    if (!viewOptsBal.some(([k]) => k === balloonViewPref)) balloonViewPref = 'auto';
    bomSec.append(UI.selectField({
      id: 'dw-balloon-view',
      label: T('draw.panel.balloonView'),
      value: balloonViewPref,
      options: viewOptsBal,
      onChange: (v) => { balloonViewPref = v; },
    }));
    const bAutoBal = h('button', { type: 'button', class: 'btn', id: 'dw-balloons-auto', 'data-help': 'drawingBalloons' });
    bAutoBal.innerHTML = icon('list') + esc(T('draw.panel.balloonsAuto'));
    bAutoBal.onclick = () => autoBalloons({ view: balloonViewPref === 'auto' ? null : balloonViewPref });
    const bAddBal = h('button', { type: 'button', class: 'btn' + (tool === 'balloon' ? ' active' : ''), id: 'dw-balloon-add', 'data-help': 'drawingBalloons' });
    bAddBal.innerHTML = icon('plus') + esc(T(tool === 'balloon' ? 'draw.panel.balloonActive' : 'draw.panel.balloonAdd'));
    bAddBal.onclick = () => tool_('balloon');
    bomSec.append(h('div', { class: 'btn-row' }, bAutoBal, bAddBal));
    if (d.bomTable && Array.isArray(d.bomTable.pos)) {
      const bResetBom = h('button', { type: 'button', class: 'btn', id: 'dw-bom-reset-pos', style: { marginTop: '6px' } }, T('draw.panel.bomResetPos'));
      bResetBom.onclick = () => resetBomTablePos();
      bomSec.append(bResetBom);
    }
    const bomRowsList = bomItems(bomData);
    if (bomRowsList.length) {
      const bList = h('div', { class: 'mini-list', id: 'dw-bom-list', style: { marginTop: '6px' } });
      for (const r of bomRowsList) {
        bList.append(h('div', { class: 'mini-row', 'data-bom-pos': String(r.pos) },
          h('b', { class: 'mono' }, `${r.pos}`),
          h('span', { class: 'mono', style: { color: 'var(--muted)' } }, `${r.n}×`),
          h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
          h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } }, r.mat)));
      }
      bomSec.append(bList);
    }
    const blList = d.balloons || [];
    if (blList.length) {
      const bItems = h('div', { class: 'mini-list', id: 'dw-balloons-list', style: { marginTop: '6px' } });
      for (const bl of blList) {
        const bPos = resolveBalloonPos(bl, bomData);
        const matchRow = bomRowsList.find((r) => r.pos === bPos);
        const row = h('div', {
          class: 'mini-row balloon-row',
          'data-balloon-id': bl.id,
          style: { cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selDim === bl.id ? 'var(--accent-soft)' : '' },
        });
        const badge = h('b', { class: 'mono' }, `(${bPos})`);
        const nm = h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, matchRow ? matchRow.name : T('draw.panel.posShort', { pos: bPos }));
        const vw = h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } }, bl.view ? viewLabel(bl.view, d) : T('draw.tb.sheet'));
        const db = h('button', { type: 'button', class: 'btn danger balloon-del', style: { padding: '2px 6px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.balloonDelTip'), 'aria-label': T('draw.panel.balloonDelTip') });
        db.innerHTML = icon('trash');
        db.onclick = (e) => { e.stopPropagation(); removeBalloon(bl.id); };
        row.append(badge, nm, vw, db);
        row.onclick = () => { selDim = bl.id; render(); Panels.renderRight(); };
        bItems.append(row);
      }
      bomSec.append(bItems);
    }
    w.append(bomSec);
    const secs = d.sections || [];
    const secBox = h('div', { class: 'section', id: 'dw-sections-sec' }, h('div', { class: 'section-h' }, T('draw.panel.sectionsSec')));
    if (!isSimpleMode()) {
      const modeSel = UI.selectField({
        id: 'dw-sec-type',
        label: T('draw.panel.secType'),
        value: sectionMode,
        options: SECTION_MODES.map((m) => [m.key, m.label]),
        onChange: (v) => {
          sectionMode = SECTION_MODES.some((m) => m.key === v) ? v : 'full';
          if (tool === 'section') setSectionMode(sectionMode);
          else { Panels.renderTools(); Panels.renderRight(); }
        },
      });
      modeSel.classList.add('pro');
      modeSel.dataset.help = 'drawingSectionKinds';
      secBox.append(modeSel);
      if (sectionMode === 'half') {
        const hRow = h('div', { class: 'fields pro' });
        const ax = sectionDraft.halfAxis === 'h' ? 'h' : 'v';
        const sideOpts = ax === 'h'
          ? [['bottom', T('draw.panel.secHalfBottom')], ['top', T('draw.panel.secHalfTop')]]
          : [['right', T('draw.panel.secHalfRight')], ['left', T('draw.panel.secHalfLeft')]];
        hRow.append(
          UI.selectField({
            id: 'dw-sec-half-axis',
            label: T('draw.panel.secHalfAxis'),
            value: ax,
            options: [['v', T('draw.panel.secHalfAxisV')], ['h', T('draw.panel.secHalfAxisH')]],
            onChange: (v) => {
              sectionDraft.halfAxis = v === 'h' ? 'h' : 'v';
              sectionDraft.halfSide = sectionDraft.halfAxis === 'h' ? 'bottom' : 'right';
              Panels.renderRight();
            },
          }),
          UI.selectField({
            id: 'dw-sec-half-side',
            label: T('draw.panel.secHalfSide'),
            value: sideOpts.some((o) => o[0] === sectionDraft.halfSide) ? sectionDraft.halfSide : sideOpts[0][0],
            options: sideOpts,
            onChange: (v) => { sectionDraft.halfSide = v; },
          }),
        );
        secBox.append(hRow);
      } else if (sectionMode === 'breakout') {
        const dInp = h('input', {
          type: 'number',
          id: 'dw-sec-depth',
          step: '0.5',
          min: '0.1',
          placeholder: T('draw.panel.secDepthAuto'),
          value: sectionDraft.depth != null ? String(sectionDraft.depth) : '',
        });
        dInp.addEventListener('keydown', (e) => e.stopPropagation());
        dInp.addEventListener('change', () => {
          const val = dInp.value.trim();
          const num = val === '' ? null : Number(val);
          sectionDraft.depth = num != null && Number.isFinite(num) && num > 0 ? num : null;
        });
        secBox.append(h('div', { class: 'field pro' }, h('label', { for: 'dw-sec-depth' }, T('draw.panel.secDepth')), dInp));
      }
    }
    const bSec = h('button', { type: 'button', class: 'btn' + (tool === 'section' ? ' primary' : ''), id: 'dw-add-section', 'data-help': 'drawingSection' });
    bSec.innerHTML = icon('section') + esc(T('draw.panel.drawSection'));
    bSec.onclick = () => {
      if (tool === 'section') setTool(null);
      else setSectionMode(isSimpleMode() ? 'full' : sectionMode);
    };
    const secBtnRow = h('div', { class: 'btn-row' }, bSec);
    if (tool === 'section' && toolState && Array.isArray(toolState.pts)
      && ((sectionMode === 'stepped' && toolState.pts.length >= 4) || (sectionMode === 'breakout' && toolState.pts.length >= 3))) {
      const fBtn = h('button', { type: 'button', class: 'btn primary', id: 'dw-sec-finish' }, T('draw.panel.secFinish'));
      fBtn.onclick = () => finishSectionTool();
      secBtnRow.append(fBtn);
    }
    secBox.append(secBtnRow);
    if (secs.length) {
      const lst = h('div', { class: 'mini-list', style: { marginTop: '6px' } });
      const pName = { front: T('draw.panel.pFront'), top: T('draw.panel.pTop'), left: T('draw.panel.pLeft') };
      for (const sec of secs) {
        const row = h('div', { class: 'mini-row sec-row', 'data-sec-id': sec.id, 'data-sec-type': sec.type || 'full' });
        const lbl = h('span', { class: 'grow' }, `${sectionTitle(sec)} (${pName[sec.parent] || sec.parent})`);
        lbl.style.cursor = 'pointer';
        lbl.onclick = () => { selDim = sec.id; render(); Panels.renderRight(); };
        row.append(lbl);
        if (sec.type !== 'breakout') {
          const fb = h('button', { type: 'button', class: 'btn sec-flip', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.secFlipTip') }, T('draw.panel.secFlipShort'));
          fb.onclick = () => flipSection(sec.id);
          row.append(fb);
        }
        const db = h('button', { type: 'button', class: 'btn danger sec-del', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.secDelTip'), 'aria-label': T('draw.panel.secDelTip') });
        db.innerHTML = icon('trash');
        db.onclick = () => removeSection(sec.id);
        row.append(db);
        lst.append(row);
      }
      secBox.append(lst);
    }
    w.append(secBox);
    // Unterbrochene Ansichten (ZE-16)
    const brkList = d.breaks || [];
    const brkBox = h('div', { class: 'section', id: 'dw-breaks-sec', 'data-help': 'drawingBreakView' }, h('div', { class: 'section-h' }, T('draw.panel.breaksSec')));
    const bBrk = h('button', { type: 'button', class: 'btn' + (tool === 'break' ? ' active' : ''), id: 'dw-add-break', 'data-help': 'drawingBreakView' });
    bBrk.innerHTML = icon('split') + esc(T(tool === 'break' ? 'draw.panel.breakActive' : 'draw.panel.breakAdd'));
    bBrk.onclick = () => tool_('break');
    brkBox.append(bBrk);
    if (tool === 'break') {
      const bf = h('div', { class: 'fields', style: { marginTop: '6px' } });
      bf.append(UI.selectField({
        id: 'dw-brk-new-dir',
        label: T('draw.panel.breakDir'),
        value: breakDraft.dir,
        options: [['auto', T('draw.panel.breakDirAuto')], ['h', T('draw.panel.breakDirH')], ['v', T('draw.panel.breakDirV')]],
        onChange: (v) => { breakDraft.dir = v; render(); },
      }));
      bf.append(UI.selectField({
        id: 'dw-brk-new-style',
        label: T('draw.panel.breakStyle'),
        value: breakDraft.style,
        options: [['zigzag', T('draw.panel.breakStyleZigzag')], ['wave', T('draw.panel.breakStyleWave')]],
        onChange: (v) => { breakDraft.style = v; render(); },
      }));
      const gf = UI.numField({
        id: 'dw-brk-new-gap',
        label: T('draw.panel.breakGap'),
        unit: 'len',
        value: breakDraft.gap,
        min: 0.5,
        step: 1,
        onCommit: (v) => { breakDraft.gap = Math.max(0.5, v); render(); },
      });
      brkBox.append(bf, gf);
    }
    if (brkList.length) {
      const bl = h('div', { class: 'mini-list', id: 'dw-breaks-list', style: { marginTop: '6px' } });
      for (const brk of brkList) {
        const span = Math.max(0, brk.b - brk.a);
        const row = h('div', {
          class: 'mini-row brk-row',
          'data-brk-id': brk.id,
          style: { cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selDim === brk.id ? 'var(--accent-soft)' : '' },
        });
        const lbl = h('span', { class: 'grow' }, `${viewLabel(brk.view, d)} · ${brk.dir === 'v' ? '↕' : '↔'} −${fmtDim(Math.max(0, span - brk.gap))}`);
        lbl.onclick = () => { selDim = brk.id; render(); Panels.renderRight(); };
        const db = h('button', { type: 'button', class: 'btn danger brk-del', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.breakDelTip'), 'aria-label': T('draw.panel.breakDelTip') });
        db.innerHTML = icon('trash');
        db.onclick = (e) => { e.stopPropagation(); removeBreak(brk.id); };
        row.append(lbl, db);
        bl.append(row);
      }
      brkBox.append(bl);
    }
    w.append(brkBox);
    // Hilfsansichten (ZE-17)
    const auxList = d.auxViews || [];
    const auxBox = h('div', { class: 'section', id: 'dw-aux-sec', 'data-help': 'drawingAuxView' }, h('div', { class: 'section-h' }, T('draw.panel.auxSec')));
    const bAux = h('button', { type: 'button', class: 'btn' + (tool === 'aux' ? ' active' : ''), id: 'dw-add-aux', 'data-help': 'drawingAuxView' });
    bAux.innerHTML = icon('arrowR') + esc(T(tool === 'aux' ? 'draw.panel.auxActive' : 'draw.panel.auxAdd'));
    bAux.onclick = () => tool_('aux');
    auxBox.append(bAux);
    if (auxList.length) {
      const al = h('div', { class: 'mini-list', id: 'dw-aux-list', style: { marginTop: '6px' } });
      for (const aux of auxList) {
        const row = h('div', {
          class: 'mini-row aux-row',
          'data-aux-id': aux.id,
          style: { cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: selDim === aux.id ? 'var(--accent-soft)' : '' },
        });
        const lbl = h('span', { class: 'grow' }, T('draw.panel.auxRow', { lbl: aux.label, parent: viewLabel(aux.parent, d) }));
        lbl.onclick = () => { selDim = aux.id; selView = 'aux_' + aux.id; render(); Panels.renderRight(); };
        const fb = h('button', { type: 'button', class: 'btn aux-flip', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.auxFlipTip') }, T('draw.panel.secFlipShort'));
        fb.onclick = (e) => { e.stopPropagation(); flipAuxView(aux.id); };
        const db = h('button', { type: 'button', class: 'btn danger aux-del', style: { padding: '3px 7px', fontSize: '11.5px' }, 'data-tip': T('draw.panel.auxDelTip'), 'aria-label': T('draw.panel.auxDelTip') });
        db.innerHTML = icon('trash');
        db.onclick = (e) => { e.stopPropagation(); removeAuxView(aux.id); };
        row.append(lbl, fb, db);
        al.append(row);
      }
      auxBox.append(al);
    }
    w.append(auxBox);
    // Norm-Darstellung (Profi): Gewinde (ZE-20) & Werkstoff-Schraffur (ZE-28)
    if (!isSimpleMode()) {
      const normSec = h('div', { class: 'section pro', id: 'dw-norm-sec' }, h('div', { class: 'section-h' }, T('draw.panel.normSec')));
      const thChk = h('label', { class: 'check', 'data-help': 'drawingNormThreads' },
        h('input', { type: 'checkbox', id: 'dw-norm-threads', checked: d.normThreads !== false }),
        T('draw.panel.normThreads'));
      thChk.querySelector('input').onchange = (e) => setNormThreads(e.target.checked);
      normSec.append(thChk);
      const thList = docThreads();
      if (thList.length) {
        const sizes = [...new Set(thList.map((x) => x.size).filter(Boolean))].join(', ');
        normSec.append(h('div', {
          class: 'mini-row',
          id: 'dw-threads-summary',
          style: { fontSize: '11.5px', color: 'var(--muted)', paddingLeft: '22px' },
        }, thList.length === 1 ? T('draw.panel.threadsFoundOne', { sizes }) : T('draw.panel.threadsFoundMany', { n: thList.length, sizes })));
      }
      const mhChk = h('label', { class: 'check', 'data-help': 'drawingMaterialHatch' },
        h('input', { type: 'checkbox', id: 'dw-mat-hatch', checked: d.materialHatch !== false }),
        T('draw.panel.matHatch'));
      mhChk.querySelector('input').onchange = (e) => setMaterialHatch(e.target.checked);
      normSec.append(mhChk);
      if (d.materialHatch !== false) {
        const usedMats = new Map();
        for (const top of Model.activeItems(App.doc)) {
          if (!top || top.role === 'hole' || (typeof App.mergedInto === 'function' && App.mergedInto(top.id))) continue;
          const mk = itemExplicitMaterial(top, App.doc);
          if (!mk) continue;
          const pk = hatchPatternForMaterial(mk);
          if (!usedMats.has(mk)) usedMats.set(mk, pk);
        }
        if (usedMats.size) {
          const swatchSvg = (pk) => {
            const segs = [];
            if (pk === 'alu') {
              for (const x of [-4, 6, 16]) {
                segs.push(`<line x1="${x}" y1="14" x2="${x + 14}" y2="0"/>`);
                segs.push(`<line x1="${x + 2.4}" y1="14" x2="${x + 16.4}" y2="0"/>`);
              }
            } else if (pk === 'brass') {
              [-4, 2, 8, 14, 20].forEach((x, idx) => {
                segs.push(`<line x1="${x}" y1="14" x2="${x + 14}" y2="0"${idx % 2 === 1 ? ' stroke-dasharray="3 1.4"' : ''}/>`);
              });
            } else if (pk === 'plastic') {
              for (const x of [-4, 3, 10, 17]) {
                segs.push(`<line x1="${x}" y1="14" x2="${x + 14}" y2="0"/>`);
                segs.push(`<line x1="${x}" y1="0" x2="${x + 14}" y2="14"/>`);
              }
            } else if (pk === 'composite') {
              for (const x of [-4, 4, 12, 20]) {
                segs.push(`<line x1="${x}" y1="14" x2="${x + 20}" y2="0"/>`);
                segs.push(`<line x1="${x}" y1="0" x2="${x + 20}" y2="14"/>`);
              }
            } else if (pk === 'wood') {
              [-4, 3, 10, 17].forEach((x, idx) => {
                segs.push(`<line x1="${x}" y1="14" x2="${x + 20}" y2="0"${idx % 2 === 1 ? ' stroke-dasharray="3 1.4"' : ''}/>`);
              });
            } else {
              for (const x of [-4, 2, 8, 14, 20]) segs.push(`<line x1="${x}" y1="14" x2="${x + 14}" y2="0"/>`);
            }
            return `<svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true" style="border:1px solid var(--line-strong);border-radius:3px;background:#fff;flex-shrink:0"><g stroke="#111" stroke-width="0.9">${segs.join('')}</g></svg>`;
          };
          const leg = h('div', { class: 'mini-list', id: 'dw-hatch-legend', style: { marginTop: '4px' } });
          for (const [mk, pk] of usedMats.entries()) {
            const pat = HATCH_PATTERNS[pk] || HATCH_PATTERNS.steel;
            const row = h('div', { class: 'mini-row', 'data-mat': mk, 'data-hatch-pat': pk, style: { gap: '8px', alignItems: 'center' } });
            row.innerHTML = swatchSvg(pk);
            row.append(h('b', { style: { fontSize: '12px' } }, mk), h('span', { class: 'grow', style: { fontSize: '11.5px', color: 'var(--muted)', textAlign: 'right' } }, pat.label));
            leg.append(row);
          }
          normSec.append(leg);
        }
      }
      w.append(normSec);
    }
    // Detailansichten (ZE-03)
    const detSec = h('div', { class: 'section', 'data-help': 'drawingDetail' }, h('div', { class: 'section-h' }, T('draw.panel.detailsSec')));
    if (tool === 'detail') {
      const box = h('div', { class: 'fields' });
      const lblField = UI.textField({ id: 'dw-det-new-label', label: T('draw.panel.letter'), value: detailDraft.label, onCommit: (v) => { detailDraft.label = cleanDetailLabel(v, detailDraft.label); render(); } });
      lblField.querySelector('input').maxLength = 2;
      const scOpts = DETAIL_SCALES.includes(detailDraft.scale) ? DETAIL_SCALES : [...DETAIL_SCALES, detailDraft.scale].sort((a, b) => a - b);
      const scField = UI.selectField({ id: 'dw-det-new-scale', label: T('draw.tb.scale'), value: String(detailDraft.scale), options: scOpts.map((s) => [String(s), scaleText(s)]), onChange: (v) => { detailDraft.scale = +v || 2; render(); } });
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
    bDet.innerHTML = icon('zoomIn') + esc(T(tool === 'detail' ? 'draw.panel.detailActive' : 'draw.panel.detailAdd'));
    bDet.onclick = () => tool_('detail');
    detSec.append(h('div', { class: 'btn-row' }, bDet));
    w.append(detSec);
    // Mittellinien & Mittelkreuze (ZE-06)
    const ctrSec = h('div', { class: 'section', id: 'dw-centers-sec', 'data-help': 'drawingCenters' }, h('div', { class: 'section-h' }, T('menu.draw.centers')));
    const ctrToggle = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-panel-centers', checked: !!d.centers }), T('draw.panel.centersAuto'));
    ctrToggle.querySelector('input').onchange = (e) => setCenters(e.target.checked);
    ctrSec.append(ctrToggle);
    const allCtrs = allCenters();
    const visCtrs = allCtrs.filter((c) => !c.hidden);
    const visCrossN = visCtrs.filter((c) => c.type === 'cross').length;
    const visLineN = visCtrs.filter((c) => c.type === 'line').length;
    const hiddenN = allCtrs.filter((c) => c.hidden).length || (d.hiddenCenters || []).length;
    const sumParts = [visCrossN === 1 ? T('draw.panel.crossOne') : T('draw.panel.crossMany', { n: visCrossN }), visLineN === 1 ? T('draw.panel.lineOne') : T('draw.panel.lineMany', { n: visLineN })];
    if (d.centers && hiddenN > 0) sumParts.push(T('draw.panel.hiddenSuffix', { n: hiddenN }));
    ctrSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row', id: 'dw-centers-summary' }, h('span', { class: 'grow' }, sumParts.join(' · ')))));
    if ((d.hiddenCenters || []).length > 0 || !d.centers) {
      const bShowAll = h('button', { type: 'button', class: 'btn', id: 'dw-centers-show-all' });
      bShowAll.innerHTML = icon('eye') + esc((d.hiddenCenters || []).length ? T('draw.panel.showAllCount', { n: (d.hiddenCenters || []).length }) : T('draw.panel.showAll'));
      bShowAll.onclick = () => showAllCenters();
      ctrSec.append(h('div', { class: 'btn-row' }, bShowAll));
    }
    if (allCtrs.length) {
      const detCtrs = h('details', { id: 'dw-centers-list', ...(centersListOpen ? { open: true } : {}) }, h('summary', null, T('draw.panel.toggleCenters', { n: allCtrs.length })));
      detCtrs.addEventListener('toggle', () => { centersListOpen = detCtrs.open; });
      const cl = h('div', { class: 'mini-list' });
      for (const c of allCtrs) {
        const lbl = `${viewLabel(c.view, d)} · ${T(c.type === 'cross' ? 'draw.panel.crossName' : 'draw.panel.lineName')} Ø${fmtDim(c.r * 2)}`;
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
          'aria-label': T(c.hidden ? 'panel.tree.show' : 'common.hide'),
          'data-tip': T(c.hidden ? 'panel.tree.show' : 'common.hide'),
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
      const selSecObj = secs.find((x) => x.id === selDim);
      const isSec = !!selSecObj;
      const selBrk = brkList.find((x) => x.id === selDim);
      const selAux = auxList.find((x) => x.id === selDim);
      const selD = d.dims.find((x) => x.id === selDim);
      const selNote = (d.notes || []).find((x) => x.id === selDim);
      const selBalloon = (d.balloons || []).find((x) => x.id === selDim);
      const isBomSel = selDim === '__bom__';
      const selCtr = String(selDim).startsWith('ctr|') ? findCenterById(selDim) : null;
      const selDimInfo = !selDet && !isSec && !selBrk && !selAux && !selNote && !selBalloon && !isBomSel && !selCtr ? findDimById(selDim, d, layout) : null;
      const selResolved = selDimInfo ? selDimInfo.dim : (!selDet && !isSec && !selBrk && !selAux && !selNote && !selBalloon && !isBomSel && !selCtr && selD && layout ? autoDimList(d, layout).find((x) => x.id === selDim) : null);
      const selSec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, selDet ? T('draw.view.detailNamed', { lbl: selDet.label }) : selSecObj ? sectionTitle(selSecObj) : selBrk ? T('draw.panel.selBreak') : selAux ? T('draw.panel.selAux', { lbl: selAux.label }) : selNote ? T('draw.panel.selLeader') : selBalloon ? T('draw.panel.selBalloon', { pos: resolveBalloonPos(selBalloon, bomData) }) : isBomSel ? T('menu.draw.bomTable') : selCtr ? T(selCtr.type === 'cross' ? 'draw.panel.crossName' : 'draw.panel.lineName') : selDimInfo ? T('draw.panel.selDim', { lbl: selDimInfo.label }) : selResolved ? T('draw.panel.selDim', { lbl: dimSummaryLabel(selResolved, sheetDimStyle(d)) }) : T('draw.panel.selDefault')));
      if (selBrk) {
        selSec.append(
          UI.selectField({
            id: 'dw-brk-style',
            label: T('draw.panel.breakStyle'),
            value: selBrk.style,
            options: [['zigzag', T('draw.panel.breakStyleZigzag')], ['wave', T('draw.panel.breakStyleWave')]],
            onChange: (v) => updateBreak(selBrk.id, { style: v }),
          }),
          h('div', { class: 'fields' },
            UI.numField({ id: 'dw-brk-a', label: T('draw.panel.breakStart'), unit: 'len', value: selBrk.a, step: 5, onCommit: (v) => updateBreak(selBrk.id, { a: v }) }),
            UI.numField({ id: 'dw-brk-b', label: T('draw.panel.breakEnd'), unit: 'len', value: selBrk.b, step: 5, onCommit: (v) => updateBreak(selBrk.id, { b: v }) }),
          ),
          UI.numField({ id: 'dw-brk-gap', label: T('draw.panel.breakGap'), unit: 'len', value: selBrk.gap, min: 0.5, step: 1, onCommit: (v) => updateBreak(selBrk.id, { gap: v }) }),
          h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.panel.breakShortened')), h('b', { class: 'mono' }, fmtDim(Math.max(0, (selBrk.b - selBrk.a) - selBrk.gap)) + ' ' + Units.label()))),
        );
      }
      if (selAux) {
        const aKey = 'aux_' + selAux.id;
        const aOpts = viewOpts(d, aKey);
        const sheetScLbl = `${T('menu.draw.scaleSheet')} (${layout ? scaleText(layout.s) : '–'})`;
        selSec.append(
          UI.selectField({
            id: 'dw-aux-scale',
            label: T('menu.draw.scale'),
            value: aOpts.scale === 'sheet' ? 'sheet' : String(aOpts.scale),
            options: [['sheet', sheetScLbl], ...SCALES.map((s) => [String(s), scaleText(s)])],
            onChange: (v) => setViewOpt(aKey, { scale: v === 'sheet' ? 'sheet' : +v }, 'Ansichts-Maßstab geändert'),
          }),
          (() => {
            const chk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-aux-hidden', checked: !!aOpts.hidden }), T('menu.draw.hiddenEdges'));
            chk.querySelector('input').onchange = (e) => setViewOpt(aKey, { hidden: e.target.checked }, 'Ansichtseinstellung geändert');
            return chk;
          })(),
        );
      }
      if (selBalloon) {
        const curPos = resolveBalloonPos(selBalloon, bomData);
        const posOpts = bomRowsList.length
          ? bomRowsList.map((r) => [String(r.pos), `${r.pos} · ${r.name} (${r.n}×)`])
          : [[String(curPos), T('draw.panel.posShort', { pos: curPos })]];
        selSec.append(UI.selectField({
          id: 'dw-bl-pos',
          label: T('draw.panel.bomPosLabel'),
          value: String(curPos),
          options: posOpts,
          onChange: (v) => {
            const np = Math.max(1, Math.round(Number(v) || 1));
            const r = bomRowsList.find((x) => x.pos === np);
            updateBalloon(selBalloon.id, { pos: np, itemId: r && r.ids[0] ? r.ids[0] : null, bomKey: r ? r.key : null });
          },
        }));
        selSec.append(UI.selectField({
          id: 'dw-bl-tip',
          label: T('draw.panel.tip'),
          value: selBalloon.tip === 'arrow' ? 'arrow' : 'dot',
          options: [['dot', T('draw.panel.balloonTipDot')], ['arrow', T('draw.panel.balloonTipArrow')]],
          onChange: (v) => updateBalloon(selBalloon.id, { tip: v }),
        }));
      }
      if (isBomSel) {
        selSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('draw.panel.bomPositions')), h('b', { class: 'mono' }, String(bomRowsList.length)))));
      }
      if (selDet) {
        const fDet = h('div', { class: 'fields' });
        const lFld = UI.textField({ id: 'dw-det-label', label: T('draw.panel.letter'), value: selDet.label, onCommit: (v) => updateDetail(selDet.id, { label: v }) });
        lFld.querySelector('input').maxLength = 2;
        const scOpts = DETAIL_SCALES.includes(selDet.scale) ? DETAIL_SCALES : [...DETAIL_SCALES, selDet.scale].sort((a, b) => a - b);
        const sFld = UI.selectField({ id: 'dw-det-scale', label: T('draw.tb.scale'), value: String(selDet.scale), options: scOpts.map((s) => [String(s), scaleText(s)]), onChange: (v) => updateDetail(selDet.id, { scale: +v || 2 }) });
        const rFld = UI.numField({ id: 'dw-det-r', label: T('draw.panel.detRadius'), unit: 'len', value: selDet.r, min: 0.5, step: 1, onCommit: (v) => { if (v > 0.2) updateDetail(selDet.id, { r: v }); } });
        fDet.append(lFld, sFld);
        selSec.append(fDet, rFld);
      }
      if (selNote) {
        const kindTxt = T(selNote.targetKind === 'edge' ? 'draw.panel.kindEdge' : selNote.targetKind === 'face' ? 'draw.panel.kindFace' : 'draw.panel.kindFree');
        selSec.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, selNote.view ? viewLabel(selNote.view, d) : T('draw.panel.freeOnSheet')), h('b', null, kindTxt))));
        selSec.append(UI.selectField({ id: 'dw-note-tip', label: T('draw.panel.tip'), value: selNote.tip, options: [['arrow', T('draw.noteTip.arrow')], ['dot', T('draw.noteTip.dot')]], onChange: (v) => updateNote(selNote.id, { tip: v }) }));
        const ta = h('textarea', {
          id: 'dw-note-text',
          rows: '2',
          style: { width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px', border: '1px solid var(--line-strong)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: '12.5px' },
        });
        ta.value = selNote.text || '';
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        ta.addEventListener('change', () => updateNote(selNote.id, { text: ta.value }));
        selSec.append(h('div', { class: 'field' }, h('label', { for: 'dw-note-text' }, T('draw.panel.noteText')), ta));
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
          label: T('draw.panel.tolLabel'),
          value: curMode,
          options: [
            ['none', T('draw.panel.tolNone')],
            ['sym', T('draw.panel.tolSym')],
            ['dev', T('draw.panel.tolDev')],
            ['limits', T('draw.panel.tolLimits')],
            ['fit', T('draw.panel.tolFit')],
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
            label: T('draw.panel.tolSymField'),
            value: curTol.sym ?? 0.1,
            min: 0,
            onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'sym', sym: Math.abs(v) }),
          }));
        } else if (curMode === 'dev') {
          const fRow = h('div', { class: 'fields' });
          fRow.append(
            tolNumField({
              id: 'dw-tol-upper',
              label: T('draw.panel.tolUpper'),
              value: curTol.upper ?? 0,
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'dev', upper: v, lower: curTol.lower ?? 0 }),
            }),
            tolNumField({
              id: 'dw-tol-lower',
              label: T('draw.panel.tolLower'),
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
              label: T('draw.panel.tolMax'),
              value: selDimInfo.nominalMm + (curTol.upper ?? 0),
              onCommit: (v) => setDimTol(selDimInfo.dim.id, { mode: 'limits', upper: v - selDimInfo.nominalMm, lower: curTol.lower ?? 0 }),
            }),
            tolNumField({
              id: 'dw-tol-min',
              label: T('draw.panel.tolMin'),
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
            label: T('draw.panel.fitLabel'),
            value: curTol.fit || 'H7',
            options: [
              { group: T('draw.panel.fitHoleGroup'), options: holeOpts },
              { group: T('draw.panel.fitShaftGroup'), options: shaftOpts },
            ],
            onChange: (v) => setDimTol(selDimInfo.dim.id, { mode: 'fit', fit: v, fitShow: curTol.fitShow || 'both' }),
          });
          fitSel.dataset.help = 'drawingFit';
          const showSel = UI.selectField({
            id: 'dw-tol-fit-show',
            label: T('draw.panel.fitShowLabel'),
            value: curTol.fitShow || 'both',
            options: [
              ['both', T('draw.panel.fitShowBoth')],
              ['code', T('draw.panel.fitShowCode')],
              ['dev', T('draw.panel.fitShowDev')],
              ['limits', T('draw.panel.fitShowLimits')],
            ],
            onChange: (v) => setDimTol(selDimInfo.dim.id, { mode: 'fit', fit: curTol.fit || 'H7', fitShow: v }),
          });
          tolBox.append(fitSel, showSel);
        }
        const tolInfo = resolveDimTol(selDimInfo.dim, selDimInfo.nominalMm);
        if (tolInfo) {
          if (tolInfo.outOfRange) {
            tolBox.append(h('div', { class: 'hint-box', id: 'dw-tol-info', html: T('draw.panel.tolOutOfRange', { code: esc(tolInfo.code) }) }));
          } else {
            const fitDec = tolInfo.mode === 'fit' ? ((!Number.isInteger(tolInfo.upperUm) || !Number.isInteger(tolInfo.lowerUm)) ? 4 : 3) : 0;
            const dev = fmtDevPair(tolInfo.upperMm, tolInfo.lowerMm, { minDec: fitDec });
            const lim = fmtLimitsPair(selDimInfo.nominalMm, tolInfo.upperMm, tolInfo.lowerMm, { minDec: fitDec });
            const linesHtml = [];
            if (tolInfo.mode === 'fit') {
              const kindTxt = T(tolInfo.kind === 'bohrung' ? 'draw.panel.fitKindHole' : 'draw.panel.fitKindShaft');
              linesHtml.push(T('draw.panel.fitHead', { code: esc(tolInfo.code), kind: kindTxt, min: tolInfo.rangeMin, max: tolInfo.rangeMax }));
              const umU = tolInfo.upperUm === 0 ? '0' : (tolInfo.upperUm > 0 ? '+' : '\u2212') + String(Math.abs(tolInfo.upperUm)).replace('.', ',');
              const umL = tolInfo.lowerUm === 0 ? '0' : (tolInfo.lowerUm > 0 ? '+' : '\u2212') + String(Math.abs(tolInfo.lowerUm)).replace('.', ',');
              linesHtml.push(T('draw.panel.fitDevsUm', { up: esc(dev.upStr), lo: esc(dev.loStr), u: esc(Units.label()), umU, umL }));
            } else {
              linesHtml.push(T('draw.panel.tolDevs', { up: esc(dev.upStr), lo: esc(dev.loStr), u: esc(Units.label()) }));
            }
            linesHtml.push(T('draw.panel.tolLimitsLine', { min: esc(lim.minStr), max: esc(lim.maxStr), u: esc(Units.label()) }));
            if (tolInfo.mode === 'fit' && tolInfo.hint) linesHtml.push(`<span style="color:var(--muted)">${esc(tolInfo.hint)}</span>`);
            if (tolInfo.mode === 'fit' && tolInfo.norm) linesHtml.push(`<span style="color:var(--muted)">${T('draw.panel.tolSrc', { src: esc(tolInfo.norm) })}</span>`);
            tolBox.append(h('div', { class: 'hint-box', id: 'dw-tol-info', html: linesHtml.join('<br>') }));
          }
        }
        selSec.append(tolBox);
      }
      if (selResolved && selResolved.lost) {
        selSec.append(h('div', { class: 'hint-box', id: 'dw-dim-lost-hint', html: T('draw.panel.lostRefHint', { reason: esc(selResolved.lostReason || T('draw.panel.lostDefaultReason')) }) }));
      }
      const row = h('div', { class: 'btn-row' });
      if (selResolved && selResolved.lost && !selResolved.auto) {
        const isRb = tool === 'dim' && toolState && toolState.rebindId === selResolved.id;
        const rb = h('button', { type: 'button', class: 'btn' + (isRb ? ' active' : ''), id: 'dw-dim-rebind' }, T(isRb ? 'common.cancel' : 'draw.panel.lostRebind'));
        rb.onclick = () => { if (isRb) setTool(null); else startRebind(selResolved.id); };
        row.append(rb);
      }
      if (selSecObj && selSecObj.type === 'half') {
        const ax = selSecObj.halfAxis === 'h' ? 'h' : 'v';
        const sideOpts = ax === 'h'
          ? [['bottom', T('draw.panel.secHalfBottom')], ['top', T('draw.panel.secHalfTop')]]
          : [['right', T('draw.panel.secHalfRight')], ['left', T('draw.panel.secHalfLeft')]];
        const hFields = h('div', { class: 'fields' });
        hFields.append(
          UI.selectField({
            id: 'dw-sel-half-axis',
            label: T('draw.panel.secHalfAxis'),
            value: ax,
            options: [['v', T('draw.panel.secHalfAxisV')], ['h', T('draw.panel.secHalfAxisH')]],
            onChange: (v) => updateSection(selSecObj.id, { halfAxis: v }),
          }),
          UI.selectField({
            id: 'dw-sel-half-side',
            label: T('draw.panel.secHalfSide'),
            value: sideOpts.some((o) => o[0] === selSecObj.halfSide) ? selSecObj.halfSide : sideOpts[0][0],
            options: sideOpts,
            onChange: (v) => updateSection(selSecObj.id, { halfSide: v }),
          }),
        );
        selSec.append(hFields);
      }
      if (selSecObj && selSecObj.type === 'breakout') {
        const dInp = h('input', {
          type: 'number',
          id: 'dw-sel-sec-depth',
          step: '0.5',
          min: '0.1',
          placeholder: T('draw.panel.secDepthAuto'),
          value: selSecObj.depth != null ? String(selSecObj.depth) : '',
        });
        dInp.addEventListener('keydown', (e) => e.stopPropagation());
        dInp.addEventListener('change', () => {
          const val = dInp.value.trim();
          updateSection(selSecObj.id, { depth: val === '' ? null : Number(val) });
        });
        selSec.append(h('div', { class: 'field' }, h('label', { for: 'dw-sel-sec-depth' }, T('draw.panel.secDepth')), dInp));
      }
      if (isSec && selSecObj && selSecObj.type !== 'breakout') {
        const fl = h('button', { type: 'button', class: 'btn', id: 'dw-sec-flip' }, T('draw.panel.secFlipBtn'));
        fl.onclick = () => flipSection(selDim);
        row.append(fl);
      }
      if (selAux) {
        const fl = h('button', { type: 'button', class: 'btn', id: 'dw-aux-flip' }, T('draw.panel.secFlipBtn'));
        fl.onclick = () => flipAuxView(selAux.id);
        row.append(fl);
      }
      if (selD && selD.type === 'ang') {
        const sup = h('button', { type: 'button', class: 'btn', id: 'dw-dim-supp' }, T('draw.panel.dimSuppBtn'));
        sup.onclick = () => flipAngleDim(selDim);
        row.append(sup);
      }
      if (selCtr) {
        const hb = h('button', { type: 'button', class: 'btn', id: 'dw-ctr-hide' });
        hb.innerHTML = icon('eyeOff') + esc(T('common.hide'));
        hb.onclick = () => hideCenter(selCtr.id);
        row.append(hb);
      } else if (isBomSel) {
        if (d.bomTable && Array.isArray(d.bomTable.pos)) {
          const rb = h('button', { type: 'button', class: 'btn', id: 'dw-bom-sel-reset' }, T('draw.panel.bomPosReset'));
          rb.onclick = () => resetBomTablePos();
          row.append(rb);
        }
        const hb = h('button', { type: 'button', class: 'btn', id: 'dw-bom-hide' });
        hb.innerHTML = icon('eyeOff') + esc(T('common.hide'));
        hb.onclick = () => setBomTable(false);
        row.append(hb);
      } else {
        const del = h('button', { type: 'button', class: 'btn danger', id: 'dw-del-sel' }); del.innerHTML = icon('trash') + esc(T('draw.panel.delSelBtn')); del.onclick = () => removeSel();
        row.append(del);
      }
      selSec.append(row);
      w.append(selSec);
    }
    w.append(h('div', { class: 'hint-box', html: T('draw.panel.helpHintHtml') }));
    body.append(w);
  }
  function refreshUI() {
    if (App.mode !== 'drawing') return;
    renderTabs();
    render();
    Panels.renderTools();
    Panels.renderRight();
  }
  function tool_(t) { setTool(tool === t ? null : t); }
  App.on('doc', () => { if (App.mode === 'drawing') refreshSoonDoc(); });
  App.on('docLoaded', () => { lastLostKey = ''; });
  if (typeof ViewPrefs !== 'undefined' && ViewPrefs.on) ViewPrefs.on('change', () => { if (App.mode === 'drawing') refreshUI(); });
  const refreshSoonDoc = debounce(async () => { await refresh(); }, 150);
  return {
    open, close, refresh, refreshUI, sheetMenu, viewMenu, bomMenu, exportMenu, drawMenu, autoDims, importModelDims, arrangeDims, dimTextBoxes, tool: tool_, setDimMode, dimMenu, flipAngleDim, onKey, renderPanel,
    SHEETS, sheets, activeSheet: dwg, addSheet, selectSheet, renameSheet, removeSheet, duplicateSheet,
    PROJECTIONS, projection: () => normProjection(dwg().projection), setProjection,
    addView, removeView, selectView, setViewOpt, viewOpts, activeViews, updateFreeViewCamera, updateExplodeView, explodeViewInfo,
    get selectedView() { return currentViewKey(); },
    details, addDetail, updateDetail, removeDetail, nextDetailLabel, DETAIL_SCALES,
    DIM_ARROWS, DIM_FONT_SIZES, DIM_MODES, dimStyle: () => sheetDimStyle(), setDimStyle, setDualDims,
    notes, addNote, updateNote, removeNote, moveView, resetViewPos,
    bomTable: () => ({ ...(dwg().bomTable || { show: false, pos: null }) }), setBomTable, resetBomTablePos,
    bomRows: () => bomItems(),
    balloons: () => (dwg().balloons || []).map((b) => ({ ...b, pos: resolveBalloonPos(b, bomData) })),
    autoBalloons, addBalloon, updateBalloon, removeBalloon, clearBalloons,
    select: (id) => { selDim = id; render(); Panels.renderRight(); },
    get selectedId() { return selDim; },
    SECTION_MODES, setSectionMode, sectionMenu, finishSectionTool,
    addSection, updateSection, flipSection, removeSection, sections: () => (dwg().sections || []).slice(), waitReady, hatchStepSheet,
    breaks, addBreak, updateBreak, removeBreak,
    auxViews, addAuxView, flipAuxView, removeAuxView, nextAuxLabel, auxViewSpec,
    HATCH_PATTERNS, hatchPatternForMaterial, setNormThreads, setMaterialHatch,
    normThreads: () => normThreadsActive(),
    materialHatch: () => materialHatchActive(),
    threads: () => docThreads(),
    get sectionMode() { return sectionMode; },
    centers, allCenters, setCenters, hideCenter, showCenter, toggleCenter, showAllCenters,
    iso286, ISO286: ISO286_DATA,
    dims: () => autoDimList(dwg(), layout || computeLayout(dwg())).map((x) => ({ ...x, nominalMm: dimNominal(x) })),
    lostDims, removeDim, removeLostDims, startRebind, rebindDim, addDim,
    getDimTol, setDimTol,
    exportPDF, buildPDFBytes, exportSVG, exportDXF, buildDXF, exportPNG, buildPNG, pngDialog, pngDimensions,
    get lastDXF() { return lastDXF; },
    get lastPNG() { return lastPNG; },
    get layout() { return layout; },
    get activeTool() { return tool; },
    get dimMode() { return dimMode; },
  };
})();

