// ================= Datenmodell =================
const COLORS = [
  { c: '#2f9e91', n: 'Petrol' }, { c: '#3f7fd6', n: 'Blau' }, { c: '#e8833a', n: 'Orange' }, { c: '#e2b53a', n: 'Gelb' },
  { c: '#d6574c', n: 'Rot' }, { c: '#8a6ad1', n: 'Violett' }, { c: '#5b9f55', n: 'Grün' }, { c: '#8b96a1', n: 'Grau' },
  { c: '#eceff2', n: 'Weiß' }, { c: '#3b4149', n: 'Schwarz' },
];
let colorTurn = 0;
function nextColor() { const c = COLORS[colorTurn % 6].c; colorTurn++; return c; }

const P = (k, label, def, opt = {}) => ({ k, label, def, unit: 'mm', min: 0.1, ...opt });
const KINDS = {
  box: { label: 'Quader', icon: 'cube', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  cylinder: { label: 'Zylinder', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' }), P('h', 'Höhe', 20)] },
  tube: { label: 'Rohr', params: [P('d', 'Außen-Ø', 20, { sym: 'Ø' }), P('wall', 'Wandstärke', 2), P('h', 'Höhe', 20)] },
  sphere: { label: 'Kugel', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' })] },
  hemisphere: { label: 'Halbkugel', params: [P('d', 'Durchmesser', 20, { sym: 'Ø' })] },
  cone: { label: 'Kegel', params: [P('d1', 'Ø unten', 20), P('d2', 'Ø oben', 0, { min: 0 }), P('h', 'Höhe', 20)] },
  pyramid: { label: 'Pyramide', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  torus: { label: 'Ring', params: [P('d', 'Außen-Ø', 30), P('t', 'Ringdicke', 6)] },
  prism: { label: 'Vieleck', params: [P('n', 'Ecken', 6, { unit: '', min: 3, max: 64, step: 1, int: true }), P('d', 'Durchmesser', 20), P('h', 'Höhe', 20)] },
  wedge: { label: 'Keil', params: [P('w', 'Breite', 20, { axis: 'x' }), P('d', 'Tiefe', 20, { axis: 'y' }), P('h', 'Höhe', 20, { axis: 'z' })] },
  extrude: { label: 'Skizzenkörper', params: [] },
  revolve: { label: 'Drehkörper', params: [] },
  loft: { label: 'Übergang', params: [] },
  sweep: { label: 'Entlang Pfad', params: [] },
  import: { label: 'Importiert', params: [] },
  group: { label: 'Gruppe', params: [] },
  part: { label: 'Bauteil', params: [] },
  transform: { label: 'Verschieben/Drehen', params: [] },
  scale: { label: 'Skalieren', params: [] },
  thicken: { label: 'Aufdicken', params: [] },
  rib: { label: 'Rippe', params: [] },
  wrap: { label: 'Wickeln', params: [] },
  emboss: { label: 'Prägen', params: [] },
  mirrorStep: { label: 'Schritt spiegeln', params: [] },
};
const PRIMITIVE_ORDER = ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'wedge', 'tube', 'torus', 'prism', 'hemisphere'];

// Metrische ISO-Regelgewinde für kosmetische Gewinde (KP-20)
const THREAD_SPECS = [
  { size: 'M2',   d: 2.0,  pitch: 0.4,  core: 1.6  },
  { size: 'M2.5', d: 2.5,  pitch: 0.45, core: 2.05 },
  { size: 'M3',   d: 3.0,  pitch: 0.5,  core: 2.5  },
  { size: 'M4',   d: 4.0,  pitch: 0.7,  core: 3.3  },
  { size: 'M5',   d: 5.0,  pitch: 0.8,  core: 4.2  },
  { size: 'M6',   d: 6.0,  pitch: 1.0,  core: 5.0  },
  { size: 'M8',   d: 8.0,  pitch: 1.25, core: 6.8  },
  { size: 'M10',  d: 10.0, pitch: 1.5,  core: 8.5  },
  { size: 'M12',  d: 12.0, pitch: 1.75, core: 10.2 },
  { size: 'M16',  d: 16.0, pitch: 2.0,  core: 14.0 },
  { size: 'M20',  d: 20.0, pitch: 2.5,  core: 17.5 },
  { size: 'M24',  d: 24.0, pitch: 3.0,  core: 21.0 },
];
const THREAD_MAP = Object.fromEntries(THREAD_SPECS.map((t) => [t.size, t]));

const Model = (() => {
  const T0 = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const defBed = () => ({ enabled: false, x: 220, y: 220, z: 250, nozzle: 0.4 });
  function newDoc(name = 'Neues Projekt') {
    return {
      format: 'masswerk', version: 1, id: uid('p'), name, created: Date.now(), modified: Date.now(),
      params: [], tables: [], items: [], notes: [],
      settings: { printer: 'std', custom: { x: 220, y: 220, z: 250 }, printBed: defBed(), grid: 1, snap: true, unit: 'mm' },
      drawing: null,
    };
  }
  function newItem(kind, p = {}, extra = {}) {
    const def = KINDS[kind] || { params: [] };
    const params = {};
    for (const q of def.params) params[q.k] = q.def;
    Object.assign(params, p);
    const ld = kind === 'part' && typeof LIBMAP !== 'undefined' ? LIBMAP[params.lib] : null;
    if (ld && ld.mat && !extra.mat) extra = { ...extra, mat: ld.mat };
    return { id: uid('i'), kind, name: extra.name || def.label || 'Objekt', role: extra.role || 'solid', p: params, t: T0(), color: extra.color || nextColor(), hidden: false, locked: false, finishes: [], ...(kind === 'group' ? { children: [] } : {}), ...(extra.mat ? { mat: extra.mat } : {}), ...extra.more };
  }
  function walk(items, fn, parent = null, depth = 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (fn(it, parent, depth, items, i) === false) return false;
      if (it.children && walk(it.children, fn, it, depth + 1) === false) return false;
    }
    return true;
  }
  function find(doc, id) {
    let res = null;
    walk(doc.items, (it, parent, depth, list, index) => { if (it.id === id) { res = { item: it, parent, list, index, depth }; return false; } });
    return res;
  }
  function topOf(doc, id) { // oberstes Objekt, das dieses enthält
    for (const it of doc.items) { if (it.id === id) return it; let found = false; if (it.children) walk(it.children, (c) => { if (c.id === id) { found = true; return false; } }); if (found) return it; }
    return null;
  }
  function parentsOf(doc, id) {
    const chain = [];
    function rec(items, path) { for (const it of items) { if (it.id === id) { chain.push(...path); return true; } if (it.children && rec(it.children, [...path, it])) return true; } return false; }
    rec(doc.items, []);
    return chain;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const D2R = Math.PI / 180;
  let curV = {};
  let curDoc = null;
  function useVars(v) { curV = v || {}; }
  const tv = (x) => (typeof x === 'number' ? x : x == null || x === '' ? 0 : num(x, curV, 0));
  function tnum(it, k) { return tv((it.t || {})[k]); }
  function tNumeric(it) { const t = it.t || {}; return { x: tv(t.x), y: tv(t.y), z: tv(t.z), rx: tv(t.rx), ry: tv(t.ry), rz: tv(t.rz) }; }
  function localMatrix(it, target = new THREE.Matrix4()) {
    const t = it.t || T0();
    _e.set(tv(t.rx) * D2R, tv(t.ry) * D2R, tv(t.rz) * D2R, 'XYZ');
    _q.setFromEuler(_e);
    _v.set(tv(t.x), tv(t.y), tv(t.z));
    return target.compose(_v, _q, _s);
  }
  function worldMatrix(doc, id) {
    const chain = parentsOf(doc, id);
    const f = find(doc, id);
    const m = new THREE.Matrix4();
    for (const p of chain) m.multiply(localMatrix(p, new THREE.Matrix4()));
    if (f) m.multiply(localMatrix(f.item, new THREE.Matrix4()));
    return m;
  }
  // Alle Kopie-Instanzen einer Muster-Gruppe (inkl. skipped-Flag) – genau wie der Kern sie baut
  function patternInstances(g, V) {
    const I = new THREE.Matrix4();
    if (!g || !g.p || g.p.op !== 'pattern') return [{ idx: 0, matrix: I, skipped: false, label: '1' }];
    const p = g.p.pt === 'path' ? pathPatternParams(g, V) : resolveP(g.p, V), N = (k, d) => num(p[k], V, d);
    const skipSet = new Set(Array.isArray(g.p.skip) ? g.p.skip.map((x) => Math.round(Number(x))) : []);
    const rot = (c, ax, deg) => { const a = new THREE.Vector3(...ax).normalize(); return new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]).multiply(new THREE.Matrix4().makeRotationAxis(a, (deg * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2])); };
    const refl = (nn, o) => { const v = new THREE.Vector3(...nn).normalize(), a = v.x, b = v.y, c = v.z, d = a * o[0] + b * o[1] + c * o[2]; return new THREE.Matrix4().set(1 - 2 * a * a, -2 * a * b, -2 * a * c, 2 * d * a, -2 * a * b, 1 - 2 * b * b, -2 * b * c, 2 * d * b, -2 * a * c, -2 * b * c, 1 - 2 * c * c, 2 * d * c, 0, 0, 0, 1); };
    const out = [];
    if (p.pt === 'rect') {
      const nx = clamp(Math.round(N('nx', 1)), 1, 60), ny = clamp(Math.round(N('ny', 1)), 1, 60), dx = N('dx', 10), dy = N('dy', 10);
      let idx = 0;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, idx++) {
        out.push({ idx, matrix: idx === 0 ? I : new THREE.Matrix4().makeTranslation(i * dx, j * dy, 0), skipped: skipSet.has(idx), label: nx > 1 && ny > 1 ? `${i + 1}·${j + 1}` : String(idx + 1) });
      }
    } else if (p.pt === 'circ') {
      const n = clamp(Math.round(N('n', 4)), 1, 120), ang = N('ang', 360);
      const step = Math.abs(Math.abs(ang) - 360) < 1e-9 ? 360 / n : n > 1 ? ang / (n - 1) : 0;
      const picked = p.axis === 'pick' && Array.isArray(p.ad) && Array.isArray(p.ao);
      const ax = picked ? p.ad.map(Number) : p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const c = picked ? p.ao.map(Number) : [N('cx', 0), N('cy', 0), N('cz', 0)];
      for (let k = 0; k < n; k++) {
        out.push({ idx: k, matrix: k === 0 ? I : rot(c, ax, k * step), skipped: skipSet.has(k), label: String(k + 1) });
      }
    } else if (p.pt === 'path') {
      const places = (p.places || []).slice(0, 200);
      if (!places.length) out.push({ idx: 0, matrix: I, skipped: false, label: '1' });
      else places.forEach((q, k) => {
        if (k === 0) { out.push({ idx: 0, matrix: I, skipped: skipSet.has(0), label: '1' }); return; }
        const d = (q.d || [0, 0, 0]).map(Number), m = new THREE.Matrix4().makeTranslation(d[0], d[1], d[2]);
        if (p.align && Math.abs(Number(q.a) || 0) > 1e-9) m.multiply(rot(p.p0, p.n, Number(q.a)));
        out.push({ idx: k, matrix: m, skipped: skipSet.has(k), label: String(k + 1) });
      });
    } else if (p.pt === 'mirror' && p.plane === 'FACE' && Array.isArray(p.mn) && Array.isArray(p.mo)) {
      out.push({ idx: 0, matrix: I, skipped: false, label: '1' }, { idx: 1, matrix: refl(p.mn.map(Number), p.mo.map(Number)), skipped: false, label: '2' });
    } else if (p.pt === 'mirror') {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ', n = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl], off = N('off', 0);
      out.push({ idx: 0, matrix: I, skipped: false, label: '1' }, { idx: 1, matrix: refl(n, [n[0] * off, n[1] * off, n[2] * off]), skipped: false, label: '2' });
    }
    return out.length ? out : [{ idx: 0, matrix: I, skipped: false, label: '1' }];
  }
  // Lage jeder aktiven Kopie einer Muster-Gruppe im Gruppen-Koordinatensystem – genau wie der Kern sie baut; die erste ist das Original
  function patternMatrices(g, V) {
    const mats = patternInstances(g, V).filter((x) => !x.skipped).map((x) => x.matrix);
    return mats.length ? mats : [new THREE.Matrix4()];
  }
  // Weltlage eines Teils – einmal je Kopie, wenn es in Muster-Gruppen steckt (z. B. ein Motor, viermal im Kreis kopiert)
  function instanceMatrices(doc, id, V = vars(doc).v) {
    const f = find(doc, id); if (!f) return [];
    const chain = parentsOf(doc, id), prev = curV; curV = V;
    try {
      let mats = [new THREE.Matrix4()];
      for (const g of chain) {
        const L = localMatrix(g, new THREE.Matrix4()), P = patternMatrices(g, V), next = [];
        for (const m of mats) for (const q of P) next.push(m.clone().multiply(L).multiply(q));
        mats = next.slice(0, 2000);
      }
      const Li = localMatrix(f.item, new THREE.Matrix4());
      return mats.map((m) => m.multiply(Li));
    } finally { curV = prev; }
  }
  function parentWorld(doc, id) {
    const chain = parentsOf(doc, id);
    const m = new THREE.Matrix4();
    for (const p of chain) m.multiply(localMatrix(p, new THREE.Matrix4()));
    return m;
  }
  function setFromMatrix(it, m) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const r = (a) => { let d = round(a / D2R, 6); if (Math.abs(d) < 1e-6) d = 0; if (Math.abs(Math.abs(d) - 180) < 1e-6) d = 180; return d; };
    it.t = { x: round(pos.x, 6), y: round(pos.y, 6), z: round(pos.z, 6), rx: r(e.x), ry: r(e.y), rz: r(e.z) };
  }

  // ---------- Parameter & Tabellen ----------
  function vars(doc) {
    const v = {}, errors = {};
    const tables = (doc && Array.isArray(doc.tables)) ? doc.tables : [];
    Object.defineProperty(v, '__tables', { value: tables, enumerable: false, configurable: true });
    for (const p of doc.params || []) {
      try { v[p.name] = Expr.eval(String(p.expr), v, tables); }
      catch (e) { errors[p.id] = e.message; v[p.name] = 0; }
    }
    return { v, errors };
  }
  function evalInfo(val, V) {
    if (typeof val === 'number') return isFinite(val) ? { ok: true, value: val } : { ok: false, error: 'Ergebnis ist keine gültige Zahl.' };
    if (val == null || String(val).trim() === '') return { ok: false, error: 'Formel ist leer.' };
    return Expr.tryEval(String(val), V || {});
  }
  function num(val, V, fallback = 0) {
    if (typeof val === 'number') return isFinite(val) ? val : fallback;
    if (val == null || val === '') return fallback;
    try { return Expr.eval(String(val), V || {}); } catch (_) { return fallback; }
  }
  function isExpr(val) { return typeof val === 'string' && isNaN(parseNum(val)); }
  function resolveP(p, V) {
    const out = {};
    for (const k in p || {}) {
      const v = p[k];
      if (typeof v === 'number') out[k] = v;
      else if (typeof v === 'string' && (isExpr(v) || !isNaN(parseNum(v)))) {
        const n = num(v, V, NaN); out[k] = isNaN(n) ? v : n;
      } else out[k] = v;
    }
    return out;
  }

  // Verknüpfte Kopien: Teile mit link = Kennung des Originals übernehmen dessen Form (Art, Maße, Kanten, Rolle);
  // Lage, Name, Farbe, Sichtbarkeit bleiben eigen. Nur für Teile ohne Unterteile.
  function syncLinks(doc) {
    let n = 0;
    walk(doc.items, (it) => {
      if (!it.link) return;
      const f = find(doc, it.link);
      if (!f || f.item === it || f.item.link || f.item.kind === 'group') { it.linkLost = true; return; }
      delete it.linkLost;
      const s = f.item;
      const want = JSON.stringify([s.kind, s.p, s.finishes || [], s.role, s.mir || null]);
      if (JSON.stringify([it.kind, it.p, it.finishes || [], it.role, it.mir || null]) === want) return;
      it.kind = s.kind; it.p = deepClone(s.p); it.finishes = deepClone(s.finishes || []); it.role = s.role;
      if (s.mir) it.mir = deepClone(s.mir); else delete it.mir;
      n++;
    });
    return n;
  }
  // „Was hängt davon ab?“: Bezüge zwischen Teilen – Formschritt-Modus, verknüpfte Kopien, übernommene Kanten,
  // an Körpern hängende Rohr-Punkte, Bezugsebenen an Flächen. Ergebnis: Liste {from, to, what}
  function dependencies(doc) {
    const out = [], top = (id) => { const t = topOf(doc, id); return t ? t.id : id; };
    walk(doc.items, (it) => {
      const me = top(it.id);
      if (it.op && it.op.target) out.push({ from: me, to: top(it.op.target), what: { join: 'vereinigt mit', cut: 'abgezogen von', common: 'Schnittmenge mit' }[it.op.type] || 'verrechnet mit' });
      if (it.p && it.p.extent === 'toFace' && it.p.toFace && it.p.toFace.id) out.push({ from: me, to: top(it.p.toFace.id), what: 'hochgezogen bis Fläche von' });
      if (it.kind === 'transform' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: it.p.copy ? 'versetzte Kopie von' : 'versetzt' });
      if (it.kind === 'scale' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'skaliert' });
      if (it.kind === 'thicken' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: it.p.mode === 'new' ? 'Platte von Fläche aus' : 'dickt Fläche auf von' });
      if (it.kind === 'rib' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'Rippe an' });
      if (it.kind === 'wrap' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'wickelt um' });
      if (it.kind === 'sweep' && it.p && it.p.wrapId) out.push({ from: me, to: top(it.p.wrapId), what: 'folgt gewickelter Linie von' });
      if (it.kind === 'emboss' && it.p && it.p.target) out.push({ from: me, to: top(it.p.target), what: 'prägt auf' });
      if (it.kind === 'mirrorStep' && it.p) {
        for (const fid of Array.isArray(it.p.features) ? it.p.features : []) if (fid) out.push({ from: me, to: top(fid), what: 'spiegelt Schritt' });
        if (it.p.plane === 'FACE' && it.p.faceRef && it.p.faceRef.id) out.push({ from: me, to: top(it.p.faceRef.id), what: 'spiegelt an Fläche von' });
      }
      if (it.link) out.push({ from: me, to: top(it.link), what: 'verknüpfte Kopie von' });
      const sk = it.p && it.p.sketch;
      for (const e of (sk && sk.ents) || []) if (e.link && e.link.id) out.push({ from: me, to: top(e.link.id), what: 'Skizze übernimmt Kante von' });
      const b = it.p && it.p.path3d && it.p.path3d.bind;
      for (const x of b || []) if (x && x.id) out.push({ from: me, to: top(x.id), what: 'Rohr hängt an' });
      if (it.kind === 'revolve' && it.p && it.p.dir === 'toFace' && it.p.toFace && it.p.toFace.targetId) {
        out.push({ from: me, to: top(it.p.toFace.targetId), what: 'dreht bis Fläche von' });
      }
    });
    for (const d of doc.datums || []) {
      const b = d.base || {};
      if ((b.type === 'face' || b.type === 'tangent') && b.id) out.push({ from: 'datum:' + d.id, to: top(b.id), what: 'Bezugsebene an', datum: d.name });
      else if (b.type === 'edgeAngle') {
        if (b.edgeId) out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
        if (b.faceId) out.push({ from: 'datum:' + d.id, to: top(b.faceId), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'normalToCurve' && b.edgeId) {
        out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'edgePoint') {
        if (b.edgeId) out.push({ from: 'datum:' + d.id, to: top(b.edgeId), what: 'Bezugsebene an', datum: d.name });
        if (b.pBind && b.pBind.id) out.push({ from: 'datum:' + d.id, to: top(b.pBind.id), what: 'Bezugsebene an', datum: d.name });
      } else if (b.type === 'twoEdges') {
        if (b.e1 && b.e1.id) out.push({ from: 'datum:' + d.id, to: top(b.e1.id), what: 'Bezugsebene an', datum: d.name });
        if (b.e2 && b.e2.id) out.push({ from: 'datum:' + d.id, to: top(b.e2.id), what: 'Bezugsebene an', datum: d.name });
      }
    }
    for (const ax of doc.axes || []) {
      const b = ax.base || {};
      if ((b.type === 'roundFace' || b.type === 'roundEdge' || b.type === 'faceNormal') && b.id) out.push({ from: 'axis:' + ax.id, to: top(b.id), what: 'Bezugsachse an', axis: ax.name });
      else if (b.type === 'twoPoints') {
        if (b.bindA && b.bindA.id) out.push({ from: 'axis:' + ax.id, to: top(b.bindA.id), what: 'Bezugsachse an', axis: ax.name });
        if (b.bindB && b.bindB.id) out.push({ from: 'axis:' + ax.id, to: top(b.bindB.id), what: 'Bezugsachse an', axis: ax.name });
      }
    }
    for (const pt of doc.points || []) {
      const b = pt.base || {};
      if ((b.type === 'edgeMid' || b.type === 'curvePercent') && b.edgeId) out.push({ from: 'point:' + pt.id, to: top(b.edgeId), what: 'Bezugspunkt an', point: pt.name });
      else if (b.type === 'faceCenter' && b.id) out.push({ from: 'point:' + pt.id, to: top(b.id), what: 'Bezugspunkt an', point: pt.name });
      else if (b.type === 'edgePlaneIntersect') {
        if (b.edgeId) out.push({ from: 'point:' + pt.id, to: top(b.edgeId), what: 'Bezugspunkt an', point: pt.name });
        if (b.planeRef && b.planeRef.kind === 'face' && b.planeRef.id) out.push({ from: 'point:' + pt.id, to: top(b.planeRef.id), what: 'Bezugspunkt an', point: pt.name });
      }
    }
    for (const cs of doc.csys || []) {
      const b = cs.base || {};
      if (b.originBind && b.originBind.id) out.push({ from: 'csys:' + cs.id, to: top(b.originBind.id), what: 'Koordinatensystem an', csys: cs.name });
      if (b.xEdge && b.xEdge.id) out.push({ from: 'csys:' + cs.id, to: top(b.xEdge.id), what: 'Koordinatensystem an', csys: cs.name });
      if (b.yEdge && b.yEdge.id) out.push({ from: 'csys:' + cs.id, to: top(b.yEdge.id), what: 'Koordinatensystem an', csys: cs.name });
    }
    const seen = new Set();
    return out.filter((x) => { if (x.from === x.to) return false; const k = x.from + '|' + x.to + '|' + x.what; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Größe des ganzen Modells für „Durch alles“ (setzt App nach dem Rechnen, auf 10 mm gerundet)
  let sceneSpan = 100;
  function setSceneSpan(v) { const n = Math.max(20, Math.ceil(v / 10) * 10); if (n === sceneSpan) return false; sceneSpan = n; return true; }
  // Formschritt-Modus: neuer Körper (kein op) oder mit einem früheren Körper verrechnet
  const OPS = { join: 'Vereinigen mit', cut: 'Abziehen von', common: 'Schnittmenge mit' };
  // ---------- Für den CAD-Kern ----------
  function matArr(m) { return Array.from(m.elements); }
  function displayColor(it) {
    if (!it) return '#2f9e91';
    if (it.colorSet && it.color) return it.color;
    if (it.mat && typeof Viewer !== 'undefined' && Viewer.lookOf) {
      const L = Viewer.lookOf(it.mat);
      if (L && L.nat && L.col) return L.col;
    }
    return it.color || '#2f9e91';
  }
  function kernelItem(it, V) {
    const o = { id: it.id, kind: it.kind, role: it.role, hidden: !!it.hidden, name: label(it), color: displayColor(it), m: matArr(localMatrix(it)) };
    if (it.opacity != null && it.opacity < 1) o.opacity = Math.max(0.05, it.opacity);
    if (it.comp) o.comp = true;
    if (it.kind === 'group') {
      let kids = it.children || [];
      if (it.rollback != null) kids = kids.slice(0, clamp(it.rollback, 0, kids.length));
      o.children = kids.filter((c) => !c.suppressed).map((c) => kernelItem(c, V));
      if (it.p && it.p.op) o.p = it.p.op === 'pattern' && it.p.pt === 'path' ? pathPatternParams(it, V) : resolveP(it.p, V);
      if (it.p && it.p.assembly) o.p = { ...(o.p || {}), assembly: true };
    }
    else if (it.kind === 'extrude' || it.kind === 'revolve') o.p = sketchParams(it, V);
    else if (it.kind === 'loft') o.p = loftParams(it, V);
    else if (it.kind === 'sweep') o.p = sweepParams(it, V);
    else if (it.kind === 'rib') o.p = ribParams(it, V);
    else if (it.kind === 'wrap') o.p = wrapParams(it, V);
    else if (it.kind === 'emboss') o.p = embossParams(it, V);
    else if (it.kind === 'import') {
      o.p = { fmt: it.p.fmt, scale: num(it.p.scale, V, 1) };
      if (it.p.blobId) o.p.blobId = it.p.blobId;
      else if (it.p.data) o.p.data = it.p.data;
      if (it.p.stepEntity != null) o.p.stepEntity = it.p.stepEntity;
      if (Array.isArray(it.p.stepMat) && it.p.stepMat.length === 16) o.p.stepMat = it.p.stepMat;
    } else if (it.kind === 'transform') {
      const p = it.p || {};
      o.p = {
        target: p.target || null,
        dx: num(p.dx, V, 0), dy: num(p.dy, V, 0), dz: num(p.dz, V, 0),
        rx: num(p.rx, V, 0), ry: num(p.ry, V, 0), rz: num(p.rz, V, 0),
        pivot: p.pivot === 'origin' || p.pivot === 'point' ? p.pivot : 'center',
        px: num(p.px, V, 0), py: num(p.py, V, 0), pz: num(p.pz, V, 0),
        copy: !!p.copy,
      };
    } else if (it.kind === 'scale') {
      const p = it.p || {};
      o.p = {
        target: p.target || null,
        uniform: p.uniform !== false,
        s: num(p.s, V, 1),
        sx: num(p.sx, V, 1), sy: num(p.sy, V, 1), sz: num(p.sz, V, 1),
        pivot: p.pivot === 'origin' ? 'origin' : 'centroid',
      };
    } else if (it.kind === 'thicken') {
      const p = it.p || {};
      o.p = {
        target: p.target || null,
        face: p.face || null,
        t: num(p.t, V, 2),
        dir: p.dir === 'in' || p.dir === 'mid' ? p.dir : 'out',
        mode: p.mode === 'new' || p.mode === 'cut' ? p.mode : 'join',
      };
    } else if (it.kind === 'mirrorStep') {
      o.p = mirrorStepParams(it, V);
    }
    else {
      o.p = resolveP(it.p, V);
      if (it.kind === 'part') {
        if (it.p && typeof it.p.size === 'string') o.p.size = it.p.size;
        if (o.p.lib === 'screwHole' && typeof threadEntry === 'function') {
          const te = threadEntry(o.p.size);
          if (te) o.p.spec = { fine: te.durchgang_fein_mm, hole: te.durchgang_mittel_mm, coarse: te.durchgang_grob_mm, tap: te.kernloch_mm, csk: te.senkung_senk_d_mm || 0, cskAngle: te.senkung_winkel_grad || 90, cbD: te.senkung_zyl_d_mm || 0, cbH: te.senkung_zyl_t_mm || 0 };
        } else if (o.p.lib === 'stdPin' && typeof pinEntry === 'function') {
          const pe = pinEntry(o.p.size ?? o.p.d);
          if (pe) o.p.spec = { d: pe.d_mm, c: pe.c_mm };
        } else if ((o.p.lib === 'stdKey' || o.p.lib === 'stdKeyway') && typeof keyEntry === 'function') {
          const ke = keyEntry(o.p.size);
          if (ke) o.p.spec = { b: ke.b_mm, h: ke.h_mm, t1: ke.t1_mm, t2: ke.t2_mm };
        } else if (o.p.lib === 'stdBearing' && typeof bearingEntry === 'function') {
          const be = bearingEntry(o.p.size);
          if (be) o.p.spec = { d: be.d_mm, D: be.D_mm, B: be.B_mm, r: be.r_min_mm, balls: be.kugeln_richtwert || 8 };
        } else if (o.p.lib === 'stdSleeve' && typeof sleeveEntry === 'function') {
          const se = sleeveEntry(o.p.size);
          if (se) o.p.spec = { d: se.d_mm, D: se.D_mm, wall: se.wand_mm, fD: se.flansch_d_mm || (se.D_mm + 4 * se.wand_mm) };
        }
      }
    }
    if (it.mir) o.mir = it.mir;
    if (it.op && OPS[it.op.type] && it.op.target) o.op = { type: it.op.type, target: it.op.target };
    if (it.finishes && it.finishes.length) o.finishes = it.finishes.filter((f) => !f.off).map((f) => { const x = { id: f.id, type: f.type, r: num(f.r, V, 1), edges: f.edges, faces: f.faces }; if (f.vr) { x.vr = true; x.r2 = num(f.r2, V, x.r); } if (f.cm) { x.cm = f.cm; if (f.cm === 'two') x.r2 = num(f.r2, V, x.r); else x.a = num(f.a, V, 45); } if (f.side) x.side = 1; return x; });
    if (it.bodies && it.bodies.length) o.bodies = it.bodies.map((b) => ({ idx: b.idx, c: b.c, name: b.name, color: b.color, hidden: !!b.hidden }));
    return o;
  }
  function sketchParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    let out;
    if (it.kind === 'extrude' && p.thin) {
      const wall = num(p.wall, V, 2);
      const side = p.wallSide === 'in' || p.wallSide === 'out' ? p.wallSide : 'center';
      const tr = SKO.thinRegions(ents, wall, side, p.sel);
      out = { plane, regions: tr.regions, thin: true };
      if (tr.error) out.thinError = tr.error;
    } else {
      const regs = SK.regions(ents);
      let chosen = regs;
      if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
      out = { plane, regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })) };
    }
    if (it.kind === 'extrude') {
      out.dist = num(p.dist, V, 10); out.dir = p.dir || 'normal'; out.extra = num(p.extra, V, 0);
      if (out.dir === 'two') out.dist2 = num(p.dist2, V, out.dist);
      if (p.extent === 'toNext' || p.extent === 'toFace') {
        out.extent = p.extent;
        if (p.extent === 'toFace' && p.toFace) {
          if (p.toFace.datumId) {
            const dm = typeof Datums !== 'undefined' ? Datums.find(p.toFace.datumId, curDoc || App.doc) : null;
            out.toFace = dm && dm.plane ? { datumId: p.toFace.datumId, plane: { o: dm.plane.o, n: dm.plane.n } } : { datumId: p.toFace.datumId, missing: true };
          } else {
            out.toFace = { id: p.toFace.id, idx: p.toFace.idx, t: p.toFace.t, c: p.toFace.c, n: p.toFace.n, rel: p.toFace.rel, wc: p.toFace.wc, wn: p.toFace.wn };
          }
        }
      } else if (p.thru) {
        // „Durch alles“: so lang, dass es sicher durch alle Körper reicht (aus der Größe des Modells)
        out.dist = sceneSpan; if (out.dir === 'two' || out.dir === 'both') { out.dir = 'two'; out.dist2 = sceneSpan; }
      }
    }
    else {
      out.dir = p.dir || 'normal';
      out.angle = num(p.angle, V, 360);
      if (out.dir === 'two') out.angle2 = num(p.angle2, V, out.angle);
      if (out.dir === 'toFace') {
        if (p.toFace && Array.isArray(p.toFace.o) && Array.isArray(p.toFace.fn)) {
          out.toFace = { o: p.toFace.o.map(Number), fn: p.toFace.fn.map(Number) };
        }
        out.toFaceFlip = !!p.toFaceFlip;
      }
      if (p.axis3d && Array.isArray(p.axis3d.o) && Array.isArray(p.axis3d.d)) out.axis3d = { o: p.axis3d.o.map(Number), d: p.axis3d.d.map(Number) };
      else out.axis = p.axis || { a: [0, 0], b: [0, 1] };
    }
    return out;
  }
  function ribParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
    return {
      target: p.target || null,
      plane,
      chains,
      thickness: num(p.thickness, V, 2),
      side: p.side === 'side1' || p.side === 'side2' ? p.side : 'center',
      dir: p.dir === 'parallel' ? 'parallel' : 'normal',
      flip: !!p.flip,
      depth: Math.max(0, num(p.depth, V, 0)),
      draft: num(p.draft, V, 0),
    };
  }
  function wrapParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const regs = SK.regions(ents);
    const regions = regs.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) }));
    const chains = SK.chains(ents).map((ch) => ({ segs: ch.segs }));
    return {
      target: p.target || null,
      face: p.face || null,
      regions,
      chains,
      mode: p.mode === 'deboss' || p.mode === 'line' ? p.mode : 'emboss',
      depth: num(p.depth, V, 2),
      angle: num(p.angle, V, 0),
      shiftY: num(p.shiftY, V, 0),
      rot: num(p.rot, V, 0),
      flip: !!p.flip,
    };
  }
  function wrapAngleInfo(itOrP, V = {}, doc = null) {
    const p = (itOrP && itOrP.p) ? itOrP.p : (itOrP || {});
    const sk = p.sketch;
    if (!sk) return null;
    const ents = typeof Solver !== 'undefined' ? Solver.cached(sk, V).ents : (sk.ents || []);
    const rotRad = (num(p.rot, V, 0) * Math.PI) / 180;
    const flip = !!p.flip;
    let minX = Infinity, maxX = -Infinity;
    const addPt = (q) => {
      if (!q) return;
      let x = flip ? -q[0] : q[0], y = q[1];
      if (Math.abs(rotRad) > 1e-9) x = x * Math.cos(rotRad) - y * Math.sin(rotRad);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    };
    const regs = typeof SK !== 'undefined' ? SK.regions(ents) : [];
    for (const r of regs) {
      if (r.outer && r.outer.poly) for (const q of r.outer.poly) addPt(q);
    }
    if (!isFinite(minX)) {
      const chains = typeof SK !== 'undefined' ? SK.chains(ents) : [];
      for (const ch of chains) for (const s of ch.segs || []) for (const q of SK.segPoints(s)) addPt(q);
    }
    if (!isFinite(minX)) {
      const b = typeof SK !== 'undefined' ? SK.bounds(ents) : null;
      if (b) { addPt([b[0], b[1]]); addPt([b[2], b[3]]); addPt([b[0], b[3]]); addPt([b[2], b[1]]); }
    }
    if (!isFinite(minX)) return null;
    const width = Math.max(0, maxX - minX);
    let R = null;
    const rr = itOrP && itOrP.id && typeof App !== 'undefined' && App.resolvedOf ? App.resolvedOf(itOrP.id) : null;
    if (rr && rr.radius > 1e-6) R = rr.radius;
    const d = doc || (typeof App !== 'undefined' ? App.doc : null);
    if (R == null && p.target && typeof App !== 'undefined' && App.results) {
      let tid = p.target;
      while (tid && App.mergedInto && App.mergedInto(tid)) tid = App.mergedInto(tid);
      const res = App.results.get(tid) || App.results.get(p.target);
      const cyls = (res && res.data && res.data.faces || []).filter((f) => f.t === 'CYLINDRE' && typeof f.r === 'number');
      if (cyls.length === 1) R = cyls[0].r;
      else if (cyls.length > 1 && p.face && typeof p.face.r === 'number') {
        let best = cyls[0], bd = Infinity;
        for (const fc of cyls) {
          const dd = Math.abs(fc.r - p.face.r) * 10 + (p.face.c && fc.c ? Math.hypot(fc.c[0] - p.face.c[0], fc.c[1] - p.face.c[1], fc.c[2] - p.face.c[2]) : 0);
          if (dd < bd) { bd = dd; best = fc; }
        }
        R = best.r;
      } else if (cyls.length) {
        R = cyls[0].r;
      }
      if (R == null && d) {
        const tf = find(d, p.target);
        if (tf && (tf.item.kind === 'cylinder' || tf.item.kind === 'tube') && tf.item.p) R = num(tf.item.p.d, V, 20) / 2;
      }
    }
    if (R == null && p.face && typeof p.face.r === 'number') R = p.face.r;
    if (!(R > 1e-6)) return null;
    const deg = (width / R) * (180 / Math.PI);
    const pct = (width / (2 * Math.PI * R)) * 100;
    return { width, radius: R, deg, pct };
  }
  function embossParams(it, V) {
    const p = it.p || {};
    const ents = p.sketch ? Solver.cached(p.sketch, V).ents : [];
    const plane = p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    return {
      target: p.target || null,
      face: p.face || null,
      plane,
      regions: chosen.map((r) => ({ outer: r.outer.k, holes: r.holes.map((h) => h.k) })),
      height: num(p.height, V, 1),
      mode: p.mode === 'deboss' ? 'deboss' : 'emboss',
      flip: !!p.flip,
    };
  }
  function mirrorStepParams(it, V) {
    const p = it.p || {};
    const features = Array.isArray(p.features) ? p.features.slice() : [];
    const doc = curDoc || (typeof App !== 'undefined' ? App.doc : null);
    let moW, mnW;
    if (p.plane === 'DATUM') {
      const dm = typeof Datums !== 'undefined' && doc ? Datums.find(p.datumId, doc) : null;
      if (!dm || !dm.plane) return { features, missingPlane: 'Die gewählte Bezugsebene fehlt' };
      moW = dm.plane.o.map(Number);
      mnW = dm.plane.n.map(Number);
    } else if (p.plane === 'FACE') {
      if (!Array.isArray(p.mo) || !Array.isArray(p.mn)) return { features, missingPlane: 'Keine Spiegelfläche gewählt' };
      moW = p.mo.map(Number);
      mnW = p.mn.map(Number);
    } else {
      const pl = ['XY', 'XZ', 'YZ'].includes(p.plane) ? p.plane : 'YZ';
      const off = num(p.off, V, 0);
      mnW = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] }[pl];
      moW = [mnW[0] * off, mnW[1] * off, mnW[2] * off];
    }
    const len = Math.hypot(mnW[0], mnW[1], mnW[2]);
    if (!(len > 1e-6) || !moW.every(isFinite) || !mnW.every(isFinite)) return { features, missingPlane: 'Ungültige Spiegelebene' };
    let mo = moW, mn = [mnW[0] / len, mnW[1] / len, mnW[2] / len];
    const ps = doc ? parentsOf(doc, it.id) : [];
    if (ps.length) {
      const inv = parentWorld(doc, it.id).invert();
      mo = new THREE.Vector3(...mo).applyMatrix4(inv).toArray();
      mn = new THREE.Vector3(...mn).transformDirection(inv).normalize().toArray();
    }
    return { features, mo: mo.map((x) => round(x, 6)), mn: mn.map((x) => round(x, 9)), plane: p.plane || 'YZ' };
  }
  // Muster entlang Kurve: Lage und Drehung jeder Kopie aus der Kurve der Gruppe (p.sketch) berechnen.
  // Die Kopie k wird um (Punkt k − Punkt 0) verschoben; mit „ausrichten“ dreht sie sich mit der Kurve.
  function pathCurve(ents) {
    let poly = null, closed = false;
    const ch = SK.chains(ents)[0];
    if (ch) { poly = []; for (const s of ch.segs) for (const q of SK.segPoints(s)) if (!poly.length || SK.d2(poly[poly.length - 1], q) > 1e-9) poly.push(q); }
    else { const regs = SK.regions(ents).sort((a, b) => b.area - a.area); if (regs.length) { poly = regs[0].outer.poly.slice(); closed = true; } }
    if (!poly || poly.length < 2) return null;
    const ref = ents.find((e) => e.type === 'point');
    if (ref && closed) { let bi = 0, bd = Infinity; poly.forEach((q, i) => { const d = SK.d2(q, ref.a); if (d < bd) { bd = d; bi = i; } }); poly = poly.slice(bi).concat(poly.slice(0, bi)); }
    else if (ref && SK.d2(ref.a, poly[poly.length - 1]) < SK.d2(ref.a, poly[0])) poly.reverse();
    if (closed) poly.push(poly[0]);
    const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + SK.d2(poly[i - 1], poly[i]));
    return { poly, cum, len: cum[cum.length - 1], closed };
  }
  function pathAt(C, s) {
    const { poly, cum } = C; let i = 1;
    while (i < poly.length - 1 && cum[i] < s) i++;
    const a = poly[i - 1], b = poly[i], L = cum[i] - cum[i - 1] || 1, t = clamp((s - cum[i - 1]) / L, 0, 1);
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  // Lage (2D in der Kurvenebene) und Richtung jeder Kopie; die erste ist das Original am Kurvenanfang
  function pathPlaces(ents, n, d) {
    const C = pathCurve(ents); if (!C || C.len < 1e-6) return [];
    const N = clamp(Math.round(n), 1, 200);
    const step = d > 0 ? d : C.closed ? C.len / N : N > 1 ? C.len / (N - 1) : 0;
    const out = [];
    for (let k = 0; k < N; k++) {
      const s = k * step;
      if (k && (C.closed ? s > C.len - 1e-6 : s > C.len + 1e-6)) break;
      out.push(pathAt(C, Math.min(s, C.len)));
    }
    return out;
  }
  function pathPatternParams(it, V) {
    const p = it.p || {}, out = { op: 'pattern', pt: 'path', places: [], n: [0, 0, 1], p0: [0, 0, 0], align: p.align !== false && p.align !== 'nein' };
    if (Array.isArray(p.skip) && p.skip.length) out.skip = p.skip.slice();
    if (!p.sketch) return out;
    const L = pathPlaces(Solver.cached(p.sketch, V).ents, num(p.n, V, 5), num(p.d, V, 0)); if (!L.length) return out;
    const pl = p.sketch.plane, x = pl.x, n = pl.n, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    const W = (u, v) => [x[0] * u + y[0] * v, x[1] * u + y[1] * v, x[2] * u + y[2] * v];
    const P0 = L[0];
    for (const q of L) {
      let da = ((q.ang - P0.ang) * 180) / Math.PI; while (da > 180) da -= 360; while (da <= -180) da += 360;
      out.places.push({ d: W(q.p[0] - P0.p[0], q.p[1] - P0.p[1]).map((v) => Math.round(v * 1e6) / 1e6), a: Math.round(da * 1e6) / 1e6 });
    }
    const o = pl.o, w0 = W(P0.p[0], P0.p[1]);
    out.p0 = [o[0] + w0[0], o[1] + w0[1], o[2] + w0[2]]; out.n = n.slice();
    return out;
  }
  // Übergang (Loft): je Profil die größte geschlossene Fläche, dazu optional eine Spitze hinter dem letzten Profil
  function loftParams(it, V) {
    const p = it.p || {};
    const profiles = [];
    for (const sk of p.sketches || []) {
      const regs = SK.regions(Solver.cached(sk, V).ents).sort((a, b) => b.area - a.area);
      if (!regs.length) continue;
      const L = regs[0].outer; let cx = 0, cy = 0; for (const q of L.poly) { cx += q[0]; cy += q[1]; } cx /= L.poly.length || 1; cy /= L.poly.length || 1;
      profiles.push({ plane: sk.plane, outer: L.k, c: [cx, cy], poly: L.poly });
    }
    const out = { profiles, ruled: !!p.ruled };
    // Führungskurve: Zwischenschnitte, die in Richtung der Kurve so gestreckt werden, dass sie die Kurve berühren
    const rails = p.path ? [] : [p.rail, p.rail2].filter(Boolean).map((r) => ({ plane: r.plane, ch: SK.chains(Solver.cached(r, V).ents)[0] })).filter((r) => r.ch);
    if (rails.length && profiles.length >= 2) { const sec = railSections(profiles, rails); if (sec) { out.sections3 = sec; return out; } }
    // Mittellinie: längster offener Zug der Pfad-Skizze, so gedreht, dass er beim ersten Umriss beginnt
    const ch = p.path ? SK.chains(Solver.cached(p.path, V).ents)[0] : null;
    if (ch && profiles.length >= 2) {
      const W3 = (pl, q) => { const n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]]; return [0, 1, 2].map((k) => pl.o[k] + x[k] * q[0] + y[k] * q[1]); };
      const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const c0 = W3(profiles[0].plane, profiles[0].c), c1 = W3(profiles[profiles.length - 1].plane, profiles[profiles.length - 1].c);
      const s0 = W3(p.path.plane, ch.segs[0].a), s1 = W3(p.path.plane, ch.segs[ch.segs.length - 1].b);
      let segs = ch.segs;
      if (d3(s0, c0) + d3(s1, c1) > d3(s0, c1) + d3(s1, c0)) segs = segs.slice().reverse().map((g) => (g.t === 'bez' ? { ...g, a: g.b, b: g.a, c1: g.c2, c2: g.c1 } : { ...g, a: g.b, b: g.a }));
      out.path = { plane: p.path.plane, segs };
      return out;   // mit Mittellinie: keine Spitze, kein „gerade“
    }
    const tip = num(p.tip, V, 0);
    if (tip > 0 && profiles.length) {
      const last = profiles[profiles.length - 1], pl = last.plane;
      const n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
      const prev = profiles.length > 1 ? profiles[profiles.length - 2].plane.o : null;
      let s = 1; if (prev) { const d = [0, 1, 2].map((k) => pl.o[k] - prev[k]); if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0) s = -1; }
      out.tipPoint = [0, 1, 2].map((k) => pl.o[k] + x[k] * last.c[0] + y[k] * last.c[1] + n[k] * tip * s);
    }
    return out;
  }
  // ---------- Übergang mit Führungskurve ----------
  const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: (a) => Math.hypot(a[0], a[1], a[2]) };
  const planeY = (pl) => v3.cross(pl.n, pl.x);
  const W3p = (pl, q) => { const y = planeY(pl); return [0, 1, 2].map((k) => pl.o[k] + pl.x[k] * q[0] + y[k] * q[1]); };
  // Achse (erster → letzter Umriss) und Richtung u der Führungskurve (in ihrer Ebene, quer zur Achse, zur Kurve hin)
  function railFrame(profiles, plane, railPts) {
    const C = profiles.map((q) => W3p(q.plane, q.c)), c0 = C[0], A = v3.sub(C[C.length - 1], c0), La = v3.len(A);
    if (La < 1e-6) return null;
    const a = v3.mul(A, 1 / La);
    let u = v3.cross(plane.n, a); const ul = v3.len(u); if (ul < 0.2) return null; u = v3.mul(u, 1 / ul);
    if (railPts && railPts.length) { const m = railPts[Math.floor(railPts.length / 2)]; if (v3.dot(v3.sub(m, c0), u) < 0) u = v3.mul(u, -1); }
    return { C, c0, a, La, u };
  }
  // Umriss gleichmäßig in n Punkte teilen – Start an der Seite zur Kurve hin, gleiche Umlaufrichtung um die Achse
  function resampleLoop(pts, c, u, a, n) {
    let P = pts.slice(); if (P.length > 2 && v3.len(v3.sub(P[0], P[P.length - 1])) < 1e-9) P.pop();
    let area = 0; for (let i = 0; i < P.length; i++) area += v3.dot(v3.cross(v3.sub(P[i], c), v3.sub(P[(i + 1) % P.length], c)), a);
    if (area < 0) P.reverse();
    let i0 = 0, best = -Infinity; P.forEach((q, i) => { const d = v3.dot(v3.sub(q, c), u); if (d > best + 1e-9) { best = d; i0 = i; } });
    P = P.slice(i0).concat(P.slice(0, i0));
    const cum = [0]; for (let i = 1; i <= P.length; i++) cum.push(cum[i - 1] + v3.len(v3.sub(P[i % P.length], P[i - 1])));
    const T = cum[cum.length - 1] || 1, out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const L = (k / n) * T; while (j < cum.length - 1 && cum[j] < L) j++;
      const t = (L - cum[j - 1]) / Math.max(1e-12, cum[j] - cum[j - 1]), A0 = P[j - 1], B0 = P[j % P.length];
      out.push([0, 1, 2].map((q) => A0[q] + (B0[q] - A0[q]) * t));
    }
    return out;
  }
  function railPoints(plane, ch) {
    const pts = []; for (const g of ch.segs) { const sp = SK.segPoints(g); for (let i = pts.length ? 1 : 0; i < sp.length; i++) pts.push(W3p(plane, sp[i])); }
    return pts;
  }
  // rails: [{ plane, ch }] – jede Führungskurve streckt die Zwischenschnitte in ihrer Richtung u (in ihrer Ebene, quer zur Achse).
  // Zwei Kurven in Ebenen quer zueinander (z. B. von der Seite und von oben) wirken unabhängig: Strecken in u₁ ändert nichts in u₂.
  function railSections(profiles, rails, n = 48, K = 6) {
    const R = [];
    for (const r of rails || []) {
      if (!r || !r.ch) continue;
      const rp = railPoints(r.plane, r.ch), F = railFrame(profiles, r.plane, rp); if (!F) continue;
      if (R.some((x) => Math.abs(v3.dot(x.F.u, F.u)) > 0.9)) continue;   // dieselbe Richtung zweimal: nur die erste zählt
      R.push({ rp, F });
    }
    if (!R.length) return null;
    const { C, c0, a, La } = R[0].F;
    const loops = profiles.map((q, i) => resampleLoop(q.poly.map((r) => W3p(q.plane, r)), C[i], R[0].F.u, a, n));
    const sOf = (pt) => v3.dot(v3.sub(pt, c0), a) / La;
    for (const r of R) {
      const u = r.F.u;
      // Kurve als Breite über der Achse: e(s) = Abstand von der Achse in Richtung u
      const rs = r.rp.map((q) => [sOf(q), v3.dot(v3.sub(q, c0), u)]).sort((x, y) => x[0] - y[0]);
      const eAt = (s) => { if (s < rs[0][0] - 1e-6 || s > rs[rs.length - 1][0] + 1e-6) return null; let i = 1; while (i < rs.length - 1 && rs[i][0] < s) i++; const A0 = rs[i - 1], B0 = rs[i], t = (s - A0[0]) / Math.max(1e-12, B0[0] - A0[0]); return A0[1] + (B0[1] - A0[1]) * Math.max(0, Math.min(1, t)); };
      const ext = (L, c) => Math.max(...L.map((q) => v3.dot(v3.sub(q, c), u)));
      r.ratio = (L, c, s) => { const e = eAt(s); if (e == null) return 1; const x = ext(L, c); return x > 1e-6 ? (e - v3.dot(v3.sub(c, c0), u)) / x : 1; };
      r.g = loops.map((L, i) => r.ratio(L, C[i], sOf(C[i])));
    }
    const out = [];
    for (let i = 0; i < loops.length - 1; i++) {
      for (let k = 0; k < K; k++) {
        const t = k / K;
        if (k === 0) { out.push(loops[i]); continue; }
        const c = v3.add(C[i], v3.mul(v3.sub(C[i + 1], C[i]), t));
        let L = loops[i].map((q, m) => v3.add(q, v3.mul(v3.sub(loops[i + 1][m], q), t)));
        for (const r of R) {
          const u = r.F.u, f = Math.max(0.05, Math.min(20, r.ratio(L, c, sOf(c)) / (r.g[i] + (r.g[i + 1] - r.g[i]) * t)));
          L = L.map((q) => { const d = v3.dot(v3.sub(q, c), u); return v3.add(q, v3.mul(u, d * (f - 1))); });
        }
        out.push(L);
      }
    }
    out.push(loops[loops.length - 1]);
    return out;
  }
  // Vorgezeichnete Führungskurve: durch die äußerste Stelle jedes Umrisses in Richtung u (dann bleibt der Übergang zunächst gleich)
  function railStart(it, V, plane) {
    const lp = loftParams({ p: { ...it.p, rail: null, rail2: null, path: null, tip: 0 } }, V);
    const F = railFrame(lp.profiles, plane, null); if (!F) return null;
    return lp.profiles.map((q, i) => { const P3 = q.poly.map((r) => W3p(q.plane, r)), c = F.C[i]; const e = Math.max(...P3.map((x) => v3.dot(v3.sub(x, c), F.u))); return v3.add(c, v3.mul(F.u, e)); });
  }
  // Wie schräg trifft die Mittellinie die Umrisse? Winkel (Grad) zwischen Linie und Umriss-Normale je Umriss
  function loftPathAngles(it, V) {
    const lp = loftParams(it, V); if (!lp.path) return [];
    const pl = lp.path.plane, n = pl.n, x = pl.x, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    const W = (q, o) => [0, 1, 2].map((k) => (o ? o[k] : 0) + x[k] * q[0] + y[k] * q[1]);
    const pts = []; for (const g of lp.path.segs) { const sp = SK.segPoints(g); for (let i = pts.length ? 1 : 0; i < sp.length; i++) pts.push(W(sp[i], pl.o)); }
    if (pts.length < 2) return [];
    return lp.profiles.map((q) => {
      const qn = q.plane.n, qx = q.plane.x, qy = [qn[1] * qx[2] - qn[2] * qx[1], qn[2] * qx[0] - qn[0] * qx[2], qn[0] * qx[1] - qn[1] * qx[0]];
      const c = [0, 1, 2].map((k) => q.plane.o[k] + qx[k] * q.c[0] + qy[k] * q.c[1]);
      let bi = 0, bd = Infinity; pts.forEach((P, i) => { const d = Math.hypot(P[0] - c[0], P[1] - c[1], P[2] - c[2]); if (d < bd) { bd = d; bi = i; } });
      const A = pts[Math.max(0, bi - 1)], B = pts[Math.min(pts.length - 1, bi + 1)], t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...t) || 1;
      const cs = Math.abs((t[0] * qn[0] + t[1] * qn[1] + t[2] * qn[2]) / L);
      return Math.round((Math.acos(Math.min(1, cs)) * 180) / Math.PI);
    });
  }
  // Glatte Kurve durch Punkte im Raum: je Abschnitt ein kubisches Bézier-Stück (wie die Skizzen-Spline, nur in 3D)
  function bez3(pts) {
    const n = pts.length; if (n < 3) return [];
    const P = (i) => (i < 0 ? pts[0].map((v, k) => 2 * v - pts[1][k]) : i > n - 1 ? pts[n - 1].map((v, k) => 2 * v - pts[n - 2][k]) : pts[i]);
    const dist = (a, b) => Math.max(1e-9, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t1 = dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3), dt = t2 - t1;
      const m1 = [0, 1, 2].map((k) => ((p1[k] - p0[k]) / t1 - (p2[k] - p0[k]) / t2 + (p2[k] - p1[k]) / dt) * dt);
      const m2 = [0, 1, 2].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
      out.push({ a: p1, c1: [0, 1, 2].map((k) => p1[k] + m1[k] / 3), c2: [0, 1, 2].map((k) => p2[k] - m2[k] / 3), b: p2 });
    }
    return out;
  }
  // Pfad im Raum als 3D-Skizze: rules[i] gilt für das Stück von Punkt i zu Punkt i+1 –
  // ax 'x' | 'y' | 'z' = genau entlang dieser Achse, len = Länge (Zahl oder Formel). Die Punkte dahinter wandern mit
  // (jedes Stück behält seine Richtung aus den eingetragenen Punkten).
  const AXI = { x: 0, y: 1, z: 2 };
  function path3dPoints(path3d, V) {
    const raw = (path3d && path3d.pts ? path3d.pts : []).map((q) => [0, 1, 2].map((k) => num(q[k], V, 0)));
    const R = (path3d && path3d.rules) || [];
    if (raw.length < 2 || !R.some(Boolean)) return raw;
    const out = [raw[0].slice()];
    for (let i = 0; i + 1 < raw.length; i++) {
      const d0 = [0, 1, 2].map((k) => raw[i + 1][k] - raw[i][k]);
      let d = d0.slice();
      const r = R[i];
      if (r) {
        const ai = AXI[r.ax], l0 = Math.hypot(d0[0], d0[1], d0[2]);
        if (ai != null) { const v = d[ai]; d = [0, 0, 0]; d[ai] = Math.abs(v) > 1e-9 ? v : l0; }   // steht das Stück quer zur Achse: so lang wie vorher in Achsrichtung
        else if ((r.ax === 'perp' || r.ax === 'par') && i > 0) {
          // rechtwinklig oder parallel zum vorigen Stück (so, wie es mit seinen Regeln liegt)
          const u = [0, 1, 2].map((k) => out[i][k] - out[i - 1][k]), lu = Math.hypot(u[0], u[1], u[2]);
          if (lu > 1e-9) {
            const un = u.map((v) => v / lu), dot = d[0] * un[0] + d[1] * un[1] + d[2] * un[2];
            d = r.ax === 'par' ? un.map((v) => v * (Math.abs(dot) > 1e-9 ? dot : l0)) : d.map((v, k) => v - un[k] * dot);
            if (r.ax === 'perp' && Math.hypot(d[0], d[1], d[2]) < 1e-9) { const c = Math.abs(un[2]) < 0.9 ? [un[1], -un[0], 0] : [0, un[2], -un[1]], lc = Math.hypot(...c); d = c.map((v) => (v / lc) * l0); }
          }
        }
        const L = r.len != null && r.len !== '' ? num(r.len, V, NaN) : NaN;
        if (isFinite(L) && L > 0) {
          const l = Math.hypot(d[0], d[1], d[2]);
          if (l > 1e-9) d = d.map((v) => (v / l) * L); else if (ai != null) d[ai] = L; else { const l0 = Math.hypot(...d0); if (l0 > 1e-9) d = d0.map((v) => (v / l0) * L); }
        }
        if (Math.hypot(d[0], d[1], d[2]) < 1e-6) d = d0;   // Regel geht hier nicht (Stück hätte keine Länge)
      }
      out.push([0, 1, 2].map((k) => out[i][k] + d[k]));
    }
    return out;
  }
  // Zahlen-Punkte auf ihre Lage mit Regeln setzen (Formeln bleiben) – danach bleibt beim Ändern jeder andere Punkt, wo er ist
  function path3dBake(pp, V) { const r = path3dPoints(pp, V); pp.pts = pp.pts.map((q, i) => q.map((v, k) => (typeof v === 'number' ? Math.round(r[i][k] * 1e4) / 1e4 : v))); }
  // Regel für Stück i ändern (patch: { ax, len }; null oder 0 = weg)
  function path3dSetRule(pp, i, patch, V) {
    path3dBake(pp, V);
    const R = (pp.rules || []).slice(); while (R.length < pp.pts.length - 1) R.push(null);
    const r = { ...(R[i] || {}), ...patch }; for (const k of Object.keys(r)) if (r[k] == null || r[k] === '' || r[k] === 0) delete r[k];
    R[i] = Object.keys(r).length ? r : null;
    if (R.some(Boolean)) pp.rules = R; else delete pp.rules;
  }
  // Entlang Pfad (Sweep): längster offener Zug der Skizze, Querschnitt Kreis oder Rechteck, optional hohl
  function sweepParams(it, V) {
    const p = it.p || {};
    if (p.wrapId) {
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      return { wrapId: p.wrapId, prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 2), w: num(p.w, V, 3), h: num(p.h, V, 2), wall: num(p.wall, V, 0) };
    }
    if (p.path3d && Array.isArray(p.path3d.pts)) {
      // Pfad im Raum statt Skizze
      const pts = path3dPoints(p.path3d, V);
      let prof = null;
      if (p.shape === 'sketch' && p.prof) {
        const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
        if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
      }
      const smooth = p.path3d.smooth !== false;
      return { path3d: { pts, smooth, segs: smooth ? bez3(pts) : [] }, prof, shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0) };
    }
    const ch = SK.chains(p.sketch ? Solver.cached(p.sketch, V).ents : [])[0];
    let prof = null;
    if (p.shape === 'sketch' && p.prof) {
      const regs = SK.regions(Solver.cached(p.prof, V).ents).sort((a, b) => b.area - a.area);
      if (regs.length) { const Lp = regs[0].outer; let cx = 0, cy = 0; for (const q of Lp.poly) { cx += q[0]; cy += q[1]; } cx /= Lp.poly.length; cy /= Lp.poly.length; prof = { outer: Lp.k, holes: regs[0].holes.map((h) => h.k), c: [cx, cy] }; }
    }
    const out = { prof, plane: p.sketch ? p.sketch.plane : { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, segs: ch ? ch.segs : [], shape: p.shape === 'rect' ? 'rect' : p.shape === 'sketch' && prof ? 'sketch' : 'circle', d: num(p.d, V, 6), w: num(p.w, V, 6), h: num(p.h, V, 4), wall: num(p.wall, V, 0) };
    if (ch) {
      const s = ch.segs[0];
      let t;
      if (s.t === 'line') t = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
      else if (s.t === 'bez') t = [s.c1[0] - s.a[0], s.c1[1] - s.a[1]];
      else { const ai = SK.arcInfo(s.a, s.m, s.b); const r = [s.a[0] - ai.c[0], s.a[1] - ai.c[1]]; t = ai.sweep > 0 ? [-r[1], r[0]] : [r[1], -r[0]]; }
      const L = Math.hypot(t[0], t[1]) || 1; out.t0 = [t[0] / L, t[1] / L];
    }
    return out;
  }
  // Zeitleiste: nur Schritte vor dem Marker zählen, unterdrückte Schritte werden übersprungen
  function activeItems(doc) {
    const end = doc.rollback == null ? doc.items.length : clamp(doc.rollback, 0, doc.items.length);
    return doc.items.slice(0, end).filter((it) => !it.suppressed);
  }
  function isActive(doc, id) { const top = topOf(doc, id); if (!top) return false; return activeItems(doc).includes(top); }
  function kernelScene(doc, extra = [], peek = null) {
    // Lagen mit Formeln (z. B. x = Achsabstand/2) mit den Maßen DIESES Projektstands auflösen – wichtig für Versionen und Varianten
    if (doc && doc.fonts && doc.fonts.length && typeof SK !== 'undefined' && SK.ensureFonts) SK.ensureFonts(doc.fonts);
    const { v } = vars(doc); const prev = curV, prevDoc = curDoc; curV = v; curDoc = doc;
    // peek = Vorschau der Zeitleiste: nur die ersten k Schritte rechnen, ohne den Marker zu verschieben
    let act = activeItems(doc); if (peek != null) { const keep = new Set(doc.items.slice(0, Math.max(0, peek))); act = act.filter((it) => keep.has(it)); }
    const out = { items: [...act, ...extra].map((it) => kernelItem(it, v)) };
    if (doc && Array.isArray(doc.folders) && doc.folders.length) out.folders = doc.folders.map((f) => ({ id: f.id, name: f.name, ids: (f.ids || []).slice() }));
    try { return out; } finally { curV = prev; curDoc = prevDoc; }
  }

  // ---------- Größen ----------
  function primitiveBox(kind, p) {
    const n = (k, d) => (typeof p[k] === 'number' ? p[k] : d);
    switch (kind) {
      case 'box': case 'pyramid': case 'wedge': { const w = n('w', 20), d = n('d', 20), h = n('h', 20); return [-w / 2, -d / 2, 0, w / 2, d / 2, h]; }
      case 'cylinder': case 'tube': case 'prism': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
      case 'cone': { const r = Math.max(n('d1', 20), n('d2', 0)) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
      case 'sphere': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, 2 * r]; }
      case 'hemisphere': { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, r]; }
      case 'torus': { const r = n('d', 30) / 2; return [-r, -r, 0, r, r, n('t', 6)]; }
      case 'part': {
        const L = String(p.lib || '');
        if (L === 'buyMotor' || L === 'buyCap') { const r = n('d', 20) / 2; return [-r, -r, 0, r, r, n('h', 20)]; }
        if (L === 'buyProp') { const r = (n('zoll', 5) * 25.4) / 2; return [-r, -r, 0, r, r, n('zoll', 5) * 1.2 + 0.5]; }
        if (L === 'motorFairing') { const r = n('d', 28) / 2 + Math.max(0, n('gap', 0.5)) + n('wall', 1.2); return [-r, -r, -n('at', 5) - n('tail', 30), r, r, n('h', 18)]; }
        if (L === 'stdScrew' || L === 'stdNut' || L === 'stdWasher') {
          const D = { 'M1.6': [3, 1.6, 3.2, 1.3, 4, 0.3], M2: [3.8, 2, 4, 1.6, 5, 0.3], 'M2.5': [4.5, 2.5, 5, 2, 6, 0.5], M3: [5.5, 3, 5.5, 2.4, 7, 0.5], M4: [7, 4, 7, 3.2, 9, 0.8], M5: [8.5, 5, 8, 4.7, 10, 1], M6: [10, 6, 10, 5.2, 12, 1.6], M8: [13, 8, 13, 6.8, 16, 1.6] }[p.size] || [5.5, 3, 5.5, 2.4, 7, 0.5];
          if (L === 'stdNut') { const r = D[2] / Math.sqrt(3); return [-r, -r, 0, r, r, D[3]]; }
          if (L === 'stdWasher') { const r = D[4] / 2; return [-r, -r, 0, r, r, D[5]]; }
          const r = D[0] / 2, len = n('length', 10); return p.head === 'senk' ? [-r, -r, -len, r, r, 0] : [-r, -r, -len, r, r, D[1]];
        }
        if (L === 'stdPin') { const pe = typeof pinEntry === 'function' ? pinEntry(p.size ?? p.d) : null; const r = (pe ? pe.d_mm : 6) / 2, len = n('length', 20); return [-r, -r, 0, r, r, len]; }
        if (L === 'stdKey') { const ke = typeof keyEntry === 'function' ? keyEntry(p.size) : null; const b = ke ? ke.b_mm : 6, h = ke ? ke.h_mm : 6, len = n('length', 20); return [-len / 2, -b / 2, 0, len / 2, b / 2, h]; }
        if (L === 'stdKeyway') { const ke = typeof keyEntry === 'function' ? keyEntry(p.size) : null; const b = ke ? ke.b_mm : 6, dep = ke ? (p.kind === 'hub' ? ke.t2_mm : ke.t1_mm) : 3.5, len = n('length', 20), up = Math.max(0.2, n('extra', 0.5)); return [-len / 2, -b / 2, -dep, len / 2, b / 2, up]; }
        if (L === 'stdBearing') { const be = typeof bearingEntry === 'function' ? bearingEntry(p.size) : null; const r = (be ? be.D_mm : 22) / 2, B = be ? be.B_mm : 7; return [-r, -r, 0, r, r, B]; }
        if (L === 'stdSleeve') { const se = typeof sleeveEntry === 'function' ? sleeveEntry(p.size) : null; const D = se ? (p.flange === 'flange' ? (se.flansch_d_mm || se.D_mm + 4 * se.wand_mm) : se.D_mm) : 10, r = D / 2, len = n('length', 10); return [-r, -r, 0, r, r, len]; }
        if (L === 'buyAntenna') { const r = Math.max(4, p.form === 'stab' ? n('d', 3) : n('kd', 14)) / 2; return [-r, -r, 0, r, r, n('L', 45)]; }
        if (L === 'buyStack') { const s = n('a', 30.5) + 5.5; return [-s / 2, -s / 2, 0, s / 2, s / 2, n('h', 12)]; }
        if (L.startsWith('buy')) { const w = n('w', 20), d = n('d', 20), h = n('h', 10); return [-w / 2, -d / 2, 0, w / 2, d / 2, h]; }
        return null;
      }
    }
    return null;
  }
  function itemLocalBox(it, V = {}) {
    if (!it) return null;
    const pb = primitiveBox(it.kind, resolveP(it.p, V));
    if (pb) return pb;
    if ((it.kind === 'extrude' || it.kind === 'rib' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'revolve') && it.p && it.p.sketch) {
      const ents = typeof Solver !== 'undefined' ? Solver.cached(it.p.sketch, V).ents : it.p.sketch.ents || [];
      const b = typeof SK !== 'undefined' ? SK.bounds(ents) : null;
      if (b) {
        const pl = it.p.sketch.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
        const x = new THREE.Vector3(...(pl.x || [1, 0, 0])).normalize(), n = new THREE.Vector3(...(pl.n || [0, 0, 1])).normalize(), y = new THREE.Vector3().crossVectors(n, x), o = new THREE.Vector3(...(pl.o || [0, 0, 0]));
        const dist = num(it.p.dist, V, 10), dir = it.p.dir || 'normal';
        const w0 = it.kind === 'extrude' ? (dir === 'both' ? -dist / 2 : dir === 'two' ? -num(it.p.dist2, V, dist) : dir === 'reverse' ? -dist : 0) : -1;
        const w1 = it.kind === 'extrude' ? (dir === 'both' ? dist / 2 : dir === 'reverse' ? 0 : dist) : 1;
        const box = new THREE.Box3();
        for (const u of [b[0], b[2]]) for (const v of [b[1], b[3]]) for (const w of [w0, w1]) {
          box.expandByPoint(o.clone().addScaledVector(x, u).addScaledVector(y, v).addScaledVector(n, w));
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      }
    }
    if (it.kind === 'part') {
      const p = resolveP(it.p || {}, V);
      const r = Math.max(1, Number(p.d) || 6) / 2, dep = Math.max(2, Number(p.depth || p.length || p.h) || 10);
      return [-r, -r, -dep / 2, r, r, dep / 2];
    }
    if (it.kind === 'group' && it.children && it.children.length) {
      const prev = curV; curV = V;
      try {
        const box = new THREE.Box3();
        for (const c of it.children) {
          if (c.hidden) continue;
          const cb = itemLocalBox(c, V); if (!cb) continue;
          const b = new THREE.Box3(new THREE.Vector3(cb[0], cb[1], cb[2]), new THREE.Vector3(cb[3], cb[4], cb[5])).applyMatrix4(localMatrix(c, new THREE.Matrix4()));
          box.union(b);
        }
        if (!box.isEmpty()) return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
      } finally { curV = prev; }
    }
    return null;
  }
  function label(it) { return it.name || (KINDS[it.kind] && KINDS[it.kind].label) || 'Objekt'; }
  function sizeText(it, V) {
    const p = resolveP(it.p || {}, V || {});
    const f = (x) => Units.fmtLen(x, 1);
    const u = Units.key() !== 'mm' ? ' ' + Units.label() : '';
    switch (it.kind) {
      case 'box': case 'pyramid': case 'wedge': return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}${u}`;
      case 'cylinder': case 'tube': case 'prism': return `Ø ${f(p.d)} × ${f(p.h)}${u}`;
      case 'cone': return `Ø ${f(p.d1)} × ${f(p.h)}${u}`;
      case 'sphere': case 'hemisphere': return `Ø ${f(p.d)}${u}`;
      case 'torus': return `Ø ${f(p.d)}${u}`;
      case 'extrude': {
        if (p.extent === 'toNext' || p.extent === 'toFace') {
          const rd = typeof App !== 'undefined' && App.resolvedDist ? App.resolvedDist(it.id) : null;
          const base = p.extent === 'toNext' ? 'bis nächste Fläche' : 'bis Fläche';
          const lenTxt = rd != null ? ` (${f(rd)}${u})` : '';
          return p.thin ? `${base}${lenTxt} · Wand ${f(p.wall || 2)}${u}` : `${base}${lenTxt}`;
        }
        return p.thin ? `${f(p.dist)}${u} hoch · Wand ${f(p.wall || 2)}${u}` : `${f(p.dist)}${u} hoch`;
      }
      case 'revolve': {
        const dir = (it.p && it.p.dir) || 'normal';
        if (dir === 'toFace') return it.p && it.p.toFace && it.p.toFace.name ? `bis „${it.p.toFace.name}“` : 'bis Fläche';
        if (dir === 'both') return `${fmtAngleU(p.angle)} (2×${fmtAngleU((p.angle || 0) / 2)})`;
        if (dir === 'two') return `${fmtAngleU(p.angle)} / ${fmtAngleU(p.angle2 ?? p.angle)}`;
        if (dir === 'reverse') return `−${fmtAngleU(p.angle)}`;
        return fmtAngleU(p.angle);
      }
      case 'transform': {
        const parts = [];
        for (const k of ['dx', 'dy', 'dz']) if (Math.abs(p[k] || 0) > 1e-6) parts.push(`${k[1].toUpperCase()} ${p[k] > 0 ? '+' : ''}${Units.fmtLen(p[k])}`);
        for (const k of ['rx', 'ry', 'rz']) if (Math.abs(p[k] || 0) > 1e-6) parts.push(`↻${k[1].toUpperCase()} ${fmtAngleU(p[k])}`);
        const s = parts.length ? parts.join(' ') : `0 ${Units.label()}`;
        return p.copy ? 'Kopie · ' + s : s;
      }
      case 'rib': {
        const t = f(p.thickness ?? 2);
        const dr = Math.abs(p.draft || 0) > 1e-6 ? ' · ' + fmtAngleU(p.draft) : '';
        return `${t}${u} dick${dr}`;
      }
      case 'wrap': {
        const info = wrapAngleInfo(it, V);
        const angTxt = info ? ` · ${fmtAngleU(info.deg)}` : '';
        if (p.mode === 'line') return `Linie${angTxt}`;
        const d = f(p.depth ?? 2);
        return `${p.mode === 'deboss' ? '−' : '+'}${d}${u}${angTxt}`;
      }
      case 'emboss': return `${f(p.height ?? 1)}${u} · ${(it.p && it.p.mode) === 'deboss' ? 'vertieft' : 'erhaben'}`;
      case 'scale': return it.p && it.p.uniform === false ? `×${fmt(p.sx ?? 1, 2)} / ${fmt(p.sy ?? 1, 2)} / ${fmt(p.sz ?? 1, 2)}` : `×${fmt(p.s ?? 1, 2)}`;
      case 'thicken': return `${f(p.t ?? 2)}${u} · ${{ out: 'außen', in: 'innen', mid: 'mittig' }[(it.p && it.p.dir) || 'out'] || 'außen'}`;
      case 'mirrorStep': {
        const mp = it.p || {};
        if (mp.plane === 'DATUM') {
          const dm = typeof Datums !== 'undefined' && typeof App !== 'undefined' && App.doc ? Datums.find(mp.datumId, App.doc) : null;
          return dm ? `an „${dm.name}“` : 'Bezugsebene fehlt';
        }
        if (mp.plane === 'FACE') return 'an Fläche';
        const pl = ['XY', 'XZ', 'YZ'].includes(mp.plane) ? mp.plane : 'YZ';
        const off = num(mp.off, V, 0);
        return Math.abs(off) > 1e-6 ? `${pl} (${off > 0 ? '+' : ''}${f(off)}${u})` : `${pl}-Ebene`;
      }
      case 'group': return (typeof Features !== 'undefined' && Features.sizeText(it, V)) || `${(it.children || []).length} Teile`;
      case 'part': {
        const L = String(p.lib || '');
        if (L === 'buyMotor' || L === 'buyCap') return `Ø ${f(p.d)} × ${f(p.h)}${u}`;
        if (L === 'buyProp') return `${fmtFixed(p.zoll, 1)}"`;
        if (L === 'buyAntenna') return `${f(p.L)}${u} lang`;
        if (L === 'buyStack') return `${f(p.a)} × ${f(p.a)}${u}`;
        if (L.startsWith('buy')) return `${f(p.w)} × ${f(p.d)} × ${f(p.h)}${u}`;
        return p.size || '';
      }
    }
    return '';
  }
  function countItems(doc) { let n = 0; walk(doc.items, () => { n++; }); return n; }
  function reId(it) {
    it.id = uid('i');
    if (it.finishes) it.finishes = it.finishes.map((f) => ({ ...f, id: uid('f') }));
    if (it.children) it.children.forEach(reId);
    return it;
  }
  function migrate(doc) {
    if (!doc || doc.format !== 'masswerk') throw new Error('Das ist keine Tracery-Projektdatei.');
    doc.params = doc.params || []; doc.items = doc.items || [];
    if (!Array.isArray(doc.tables)) doc.tables = [];
    for (const t of doc.tables) { if (!t || typeof t !== 'object') continue; if (!Array.isArray(t.rows)) t.rows = []; }
    doc.settings = Object.assign({ printer: 'std', custom: { x: 220, y: 220, z: 250 }, grid: 1, snap: true, unit: 'mm' }, doc.settings || {});
    const rawBed = doc.settings.printBed && typeof doc.settings.printBed === 'object' ? doc.settings.printBed : {};
    doc.settings.printBed = {
      enabled: !!rawBed.enabled,
      x: Number(rawBed.x) > 0 ? Number(rawBed.x) : 220,
      y: Number(rawBed.y) > 0 ? Number(rawBed.y) : 220,
      z: Number(rawBed.z) > 0 ? Number(rawBed.z) : 250,
      nozzle: Number(rawBed.nozzle) > 0 ? Number(rawBed.nozzle) : 0.4,
    };
    if (!Units.DEFS[doc.settings.unit]) doc.settings.unit = 'mm';
    if (doc.rollback != null && !(doc.rollback >= 0 && doc.rollback < doc.items.length)) doc.rollback = null;
    if (!Array.isArray(doc.notes)) doc.notes = [];
    if (doc.variants != null && !Array.isArray(doc.variants)) doc.variants = [];
    if (Array.isArray(doc.variants)) for (const v of doc.variants) {
      if (!v.values || typeof v.values !== 'object') v.values = {};
      if (v.suppressed != null && !Array.isArray(v.suppressed)) v.suppressed = [];
    }
    if (doc.fonts != null && !Array.isArray(doc.fonts)) doc.fonts = [];
    if (doc.folders != null && !Array.isArray(doc.folders)) doc.folders = [];
    walk(doc.items, (it) => { it.t = Object.assign(T0(), it.t || {}); it.p = it.p || {}; it.finishes = it.finishes || []; if (it.bodies != null && !Array.isArray(it.bodies)) delete it.bodies; if (!it.role) it.role = 'solid'; if (!it.color) it.color = nextColor(); });
    cleanFolders(doc);
    return doc;
  }
  // ---------- Ordner & Reihenfolge im Verlauf (KP-10) ----------
  function folderOf(doc, id) {
    for (const f of (doc && doc.folders) || []) if ((f.ids || []).includes(id)) return f;
    return null;
  }
  function cleanFolders(doc) {
    if (!doc || !Array.isArray(doc.folders)) return;
    const topPos = new Map((doc.items || []).map((x, i) => [x.id, i]));
    const used = new Set();
    for (const f of doc.folders) {
      f.ids = (f.ids || []).filter((id) => topPos.has(id) && !used.has(id) && (used.add(id), true));
      f.ids.sort((a, b) => topPos.get(a) - topPos.get(b));
    }
    doc.folders = doc.folders.filter((f) => f.ids.length > 0);
  }
  function itemWorldBox(doc, it, opts) {
    if (opts && opts.boxOf) { const b = opts.boxOf(it.id); if (b && !b.isEmpty()) return b; }
    let b = null;
    if (typeof App !== 'undefined' && App.results) { const r = App.results.get(it.id); if (r && r.data && r.data.bbox) b = r.data.bbox; }
    if (!b) b = primitiveBox(it.kind, resolveP(it.p || {}, vars(doc).v));
    if (!b) return null;
    return new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])).applyMatrix4(worldMatrix(doc, it.id));
  }
  function boxesTouch(doc, solid, hole, opts, unknownMeansTouch = false) {
    const bs = itemWorldBox(doc, solid, opts), bh = itemWorldBox(doc, hole, opts);
    if (bs && bh) return bs.intersectsBox(bh);
    return unknownMeansTouch;
  }
  function topOrderEdges(doc, opts) {
    const topIds = new Set((doc.items || []).map((x) => x.id));
    const edges = [];
    for (const d of dependencies(doc)) {
      if (topIds.has(d.from) && topIds.has(d.to) && d.from !== d.to) edges.push({ child: d.from, parent: d.to, what: d.what });
    }
    const items = doc.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].role === 'hole') continue;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].role !== 'hole') continue;
        if (boxesTouch(doc, items[i], items[j], opts, true)) edges.push({ child: items[j].id, parent: items[i].id, what: 'Loch in' });
      }
    }
    return edges;
  }
  function orderFailReason(doc, edge, srcSet) {
    const nm = (id) => { const f = find(doc, id); return f ? label(f.item) : 'Schritt'; };
    if (srcSet && srcSet.has(edge.child)) return `„${nm(edge.child)}“ kann nicht vor „${nm(edge.parent)}“ verschoben werden.`;
    return `„${nm(edge.parent)}“ muss vor „${nm(edge.child)}“ bleiben.`;
  }
  function validateTopOrder(doc, orderedIds, opts = {}) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    for (const e of topOrderEdges(doc, opts)) {
      if (!pos.has(e.parent) || !pos.has(e.child)) continue;
      if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, null) };
    }
    return { ok: true };
  }
  function validateMove(doc, srcIds, dstId, mode, opts = {}) {
    const ids = (Array.isArray(srcIds) ? srcIds : [srcIds]).filter(Boolean);
    if (!ids.length) return { ok: false, reason: '' };
    const topIds = new Set((doc.items || []).map((x) => x.id));
    if (mode === 'into-folder') {
      const fld = (doc.folders || []).find((f) => f.id === dstId);
      if (!fld) return { ok: false, reason: '' };
      if (!ids.every((id) => topIds.has(id))) return { ok: false, reason: 'Nur Schritte auf oberster Ebene passen in einen Ordner.' };
      const inFld = new Set(fld.ids || []);
      if (ids.every((id) => inFld.has(id))) return { ok: true };
      const rest = (fld.ids || []).filter((id) => !ids.includes(id));
      if (!rest.length) return { ok: true };
      return validateMove(doc, ids, rest[rest.length - 1], 'after', opts);
    }
    if (ids.includes(dstId)) return { ok: false, reason: '' };
    const srcs = ids.map((id) => find(doc, id)).filter(Boolean);
    const dst = find(doc, dstId);
    if (!srcs.length || !dst) return { ok: false, reason: '' };
    for (const s of srcs) {
      let self = false;
      if (s.item.children) walk(s.item.children, (c) => { if (c.id === dstId) { self = true; return false; } });
      if (self) return { ok: false, reason: 'Ein Schritt lässt sich nicht in sich selbst legen.' };
    }
    const srcSet = new Set(ids);
    const sameParent = srcs.every((s) => s.parent === srcs[0].parent);
    if (mode === 'into') {
      if (dst.item.kind !== 'group' || srcs.length !== 1) return { ok: false, reason: '' };
      const s = srcs[0];
      if ((s.item.op && s.item.op.target) || s.item.kind === 'transform' || s.item.kind === 'rib' || s.item.kind === 'wrap' || s.item.kind === 'emboss' || (!s.parent && s.item.kind === 'mirrorStep')) {
        return { ok: false, reason: 'Dieser Schritt muss auf oberster Ebene bleiben.' };
      }
      if (!s.parent && !dst.parent) {
        const gIdx = doc.items.indexOf(dst.item);
        for (const e of topOrderEdges(doc, opts)) {
          if (e.child === s.item.id) {
            const pIdx = doc.items.findIndex((x) => x.id === e.parent);
            if (pIdx > gIdx) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
          }
          if (e.parent === s.item.id) {
            const cIdx = doc.items.findIndex((x) => x.id === e.child);
            if (cIdx < gIdx) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
          }
        }
      }
      return { ok: true };
    }
    // Beide auf oberster Ebene
    if (sameParent && !srcs[0].parent && !dst.parent) {
      const order = (doc.items || []).map((x) => x.id).filter((id) => !srcSet.has(id));
      const di = order.indexOf(dstId);
      if (di < 0) return { ok: false, reason: '' };
      const moving = (doc.items || []).map((x) => x.id).filter((id) => srcSet.has(id));
      order.splice(mode === 'before' ? di : di + 1, 0, ...moving);
      const pos = new Map(order.map((id, i) => [id, i]));
      for (const e of topOrderEdges(doc, opts)) {
        if (!srcSet.has(e.child) && !srcSet.has(e.parent)) continue;
        if (!pos.has(e.parent) || !pos.has(e.child)) continue;
        if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
      }
      return { ok: true };
    }
    // Gleiche Eltern-Gruppe
    if (sameParent && srcs[0].parent && srcs[0].parent === dst.parent) {
      const kids = srcs[0].parent.children || [];
      const edges = [];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].role === 'hole') continue;
        for (let j = i + 1; j < kids.length; j++) {
          if (kids[j].role === 'hole' && boxesTouch(doc, kids[i], kids[j], opts, true)) edges.push({ child: kids[j].id, parent: kids[i].id });
        }
      }
      for (const k of kids) {
        if (k.kind === 'mirrorStep' && k.p && Array.isArray(k.p.features)) {
          for (const fid of k.p.features) edges.push({ child: k.id, parent: fid });
        }
      }
      const order = kids.map((x) => x.id).filter((id) => !srcSet.has(id));
      const di = order.indexOf(dstId);
      if (di < 0) return { ok: false, reason: '' };
      const moving = kids.map((x) => x.id).filter((id) => srcSet.has(id));
      order.splice(mode === 'before' ? di : di + 1, 0, ...moving);
      const pos = new Map(order.map((id, i) => [id, i]));
      for (const e of edges) {
        if (!srcSet.has(e.child) && !srcSet.has(e.parent)) continue;
        if (pos.get(e.parent) >= pos.get(e.child)) return { ok: false, parentId: e.parent, childId: e.child, reason: orderFailReason(doc, e, srcSet) };
      }
      return { ok: true };
    }
    // Aus einer Gruppe auf die oberste Ebene ziehen
    if (sameParent && srcs[0].parent && !dst.parent) {
      const g = topOf(doc, srcs[0].id);
      if (g) {
        const gIdx = doc.items.indexOf(g);
        const dIdx = doc.items.indexOf(dst.item);
        const targetPos = mode === 'before' ? dIdx : dIdx + 1;
        if (targetPos <= gIdx) {
          for (const s of srcs) {
            if (s.item.role !== 'hole') continue;
            const kids = s.parent.children || [];
            const si = kids.indexOf(s.item);
            if (kids.slice(0, si).some((k) => k.role !== 'hole' && boxesTouch(doc, k, s.item, opts, true))) {
              return { ok: false, parentId: g.id, childId: s.item.id, reason: `„${label(s.item)}“ kann nicht vor „${label(g)}“ verschoben werden.` };
            }
          }
        }
      }
    }
    return { ok: true };
  }
  function matchBodies(saved, evalBodies) {
    const n = (evalBodies && evalBodies.length) || 0;
    const out = new Array(n).fill(null);
    if (!n || !Array.isArray(saved) || !saved.length) return out;
    const usedS = new Set(), usedE = new Set();
    const pairs = [];
    for (let si = 0; si < saved.length; si++) {
      const s = saved[si];
      if (!s || !Array.isArray(s.c) || s.c.length < 3) continue;
      for (let ei = 0; ei < n; ei++) {
        const ec = evalBodies[ei].c;
        const d = Math.hypot(s.c[0] - ec[0], s.c[1] - ec[1], s.c[2] - ec[2]);
        if (d < 0.5) pairs.push({ d, si, ei });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const p of pairs) {
      if (usedS.has(p.si) || usedE.has(p.ei)) continue;
      usedS.add(p.si); usedE.add(p.ei); out[p.ei] = saved[p.si];
    }
    for (let si = 0; si < saved.length; si++) {
      if (usedS.has(si)) continue;
      const s = saved[si];
      if (s && typeof s.idx === 'number' && s.idx >= 0 && s.idx < n && !usedE.has(s.idx)) {
        usedS.add(si); usedE.add(s.idx); out[s.idx] = s;
      }
    }
    const rem = [];
    for (let si = 0; si < saved.length; si++) {
      if (usedS.has(si)) continue;
      const s = saved[si];
      if (!s || !Array.isArray(s.c) || s.c.length < 3) continue;
      for (let ei = 0; ei < n; ei++) {
        if (usedE.has(ei)) continue;
        const ec = evalBodies[ei].c;
        rem.push({ d: Math.hypot(s.c[0] - ec[0], s.c[1] - ec[1], s.c[2] - ec[2]), si, ei });
      }
    }
    rem.sort((a, b) => a.d - b.d);
    for (const p of rem) {
      if (usedS.has(p.si) || usedE.has(p.ei)) continue;
      usedS.add(p.si); usedE.add(p.ei); out[p.ei] = saved[p.si];
    }
    return out;
  }
  // Drehkörper-Bezugssystem (Achse, äußerster Radius und Bogen-Mitte in lokalen Koordinaten)
  function revolveFrame(p, V) {
    const sk = p && p.sketch;
    if (!sk) return null;
    const pl = sk.plane || { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] };
    const norm3 = (a) => { const l = v3.len(a) || 1; return v3.mul(a, 1 / l); };
    const o = pl.o || [0, 0, 0], x = norm3(pl.x || [1, 0, 0]), n = norm3(pl.n || [0, 0, 1]), y = v3.cross(n, x);
    const P = (uv) => [o[0] + x[0] * uv[0] + y[0] * uv[1], o[1] + x[1] * uv[0] + y[1] * uv[1], o[2] + x[2] * uv[0] + y[2] * uv[1]];
    let c, d;
    if (p.axis3d && Array.isArray(p.axis3d.o) && Array.isArray(p.axis3d.d)) {
      c = p.axis3d.o.map(Number); d = norm3(p.axis3d.d.map(Number));
    } else {
      const ax = p.axis || { a: [0, 0], b: [0, 1] };
      c = P(ax.a); d = norm3(v3.sub(P(ax.b), c));
    }
    const ents = Solver.cached(sk, V || {}).ents;
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(p.sel) && p.sel.length) { const f = regs.filter((r) => p.sel.includes(r.key)); if (f.length) chosen = f; }
    const pts = [];
    for (const r of chosen) for (const q of (r.outer && r.outer.poly) || []) pts.push(P(q));
    if (!pts.length) { const b = SK.bounds(ents); if (b) for (const q of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) pts.push(P(q)); }
    let rMax = 0, bestU = null, labelPt = null, hSum = 0, hCnt = 0;
    for (const q of pts) {
      const v = v3.sub(q, c), h = v3.dot(v, d), u = v3.sub(v, v3.mul(d, h)), rl = v3.len(u);
      if (rl > 1e-5) { hSum += h; hCnt++; }
      if (rl > rMax) { rMax = rl; bestU = u; labelPt = q; }
    }
    if (rMax < 1e-5 || !bestU) {
      const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u0 = norm3(v3.cross(ref, d));
      return { c, d, u0, w0: v3.cross(d, u0), arcC: c.slice(), rMax: 10, labelPt: v3.add(c, v3.mul(u0, 10)), pts: [] };
    }
    const u0 = norm3(bestU), w0 = v3.cross(d, u0), hAvg = hCnt ? hSum / hCnt : 0;
    return { c, d, u0, w0, arcC: v3.add(c, v3.mul(d, hAvg)), rMax, labelPt, pts };
  }
  function revolveHitAngle(frame, fo, fn, flip) {
    if (!frame || !fo || !fn) return null;
    const norm3 = (a) => { const l = v3.len(a) || 1; return v3.mul(a, 1 / l); };
    const fnn = norm3(fn), dn = flip ? v3.mul(frame.d, -1) : frame.d;
    const pts = frame.pts && frame.pts.length ? frame.pts : [frame.labelPt];
    const sVals = pts.map((P) => v3.dot(v3.sub(P, fo), fnn));
    const sMin = Math.min(...sVals), sMax = Math.max(...sVals);
    if (sMax > 1e-3 && sMin < -1e-3) return null;
    if (Math.max(Math.abs(sMax), Math.abs(sMin)) < 1e-4) return null;
    const nKeep = sMax + sMin >= 0 ? fnn : v3.mul(fnn, -1);
    const normPos = (a) => { const T = Math.PI * 2; let x = ((a % T) + T) % T; if (x < 1e-3) x = T; return x; };
    let maxFirst = 0, any = false;
    for (const P of pts) {
      const v = v3.sub(P, frame.c), h = v3.dot(v, dn), u = v3.sub(v, v3.mul(dn, h));
      if (v3.len(u) < 1e-5) continue;
      const w = v3.cross(dn, u);
      const A = v3.dot(u, nKeep), B = v3.dot(w, nKeep), C = v3.dot(v3.sub(v3.add(frame.c, v3.mul(dn, h)), fo), nKeep), Mab = Math.hypot(A, B);
      if (Mab < 1e-7 || Math.abs(C) > Mab + 1e-4) return null;
      if (Math.abs(A + C) < 1e-4 && B < -1e-6) return null;
      const phi = Math.atan2(B, A), alpha = Math.acos(clamp(-C / Mab, -1, 1));
      const tFirst = Math.min(normPos(phi + alpha), normPos(phi - alpha));
      if (tFirst > maxFirst) maxFirst = tFirst;
      any = true;
    }
    return any ? (maxFirst * 180) / Math.PI : null;
  }
  function revolveAutoFlip(frame, fo, fn, pickPtLocal) {
    if (!frame) return false;
    if (pickPtLocal) {
      const vp = v3.sub(pickPtLocal, frame.c), hp = v3.dot(vp, frame.d), up = v3.sub(vp, v3.mul(frame.d, hp));
      if (v3.len(up) > 1e-4) {
        const phi = Math.atan2(v3.dot(up, frame.w0), v3.dot(up, frame.u0));
        if (Math.abs(phi) > 1e-4) {
          const wantFlip = phi < 0;
          if (revolveHitAngle(frame, fo, fn, wantFlip) != null) return wantFlip;
        }
      }
    }
    const aPos = revolveHitAngle(frame, fo, fn, false), aNeg = revolveHitAngle(frame, fo, fn, true);
    if (aPos != null && aNeg != null) return aNeg < aPos;
    return aPos == null && aNeg != null;
  }
  return { matchBodies, displayColor, folderOf, cleanFolders, validateMove, validateTopOrder, revolveFrame, revolveHitAngle, revolveAutoFlip, dependencies, syncLinks, setSceneSpan, get sceneSpan() { return sceneSpan; }, OPS, path3dPoints, path3dBake, path3dSetRule, railStart, railSections, bez3, patternInstances, patternMatrices, instanceMatrices, itemLocalBox, loftParams, loftPathAngles, pathPatternParams, pathPlaces, wrapAngleInfo, useVars, tnum, tNumeric, newDoc, newItem, walk, find, topOf, parentsOf, localMatrix, worldMatrix, parentWorld, setFromMatrix, vars, evalInfo, num, isExpr, resolveP, kernelScene, kernelItem, activeItems, isActive, primitiveBox, label, sizeText, countItems, reId, migrate, matArr, T0 };
})();

