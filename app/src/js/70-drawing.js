// ================= Technische Zeichnung =================
const Drawing = (() => {
  const SHEETS = { A4: [297, 210], A3: [420, 297] };
  const SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02];
  const scaleText = (s) => (s >= 1 ? `${fmt(s, 2)}:1` : `1:${fmt(1 / s, 2)}`);
  let proj = null, projRev = -1, loadingProj = false, projId = 0;
  let svg = null, wrap = null, holder = null, zoom = 1, tool = null, toolState = null, selDim = null;
  let layout = null;
  function dwg() {
    const d = App.doc;
    if (!d.drawing) d.drawing = { sheet: 'A4', orient: 'landscape', scale: 'auto', views: { front: true, top: true, left: true, iso: true }, hidden: true, centers: true, dims: [{ id: uid('d'), auto: 'width', view: 'front' }, { id: uid('d'), auto: 'height', view: 'front' }, { id: uid('d'), auto: 'depth', view: 'left' }, { id: uid('d'), auto: 'circles', view: 'top' }], free: [], title: { titel: '', nummer: '', name: '', datum: new Date().toLocaleDateString('de-DE'), werkstoff: 'PLA', firma: '', blatt: '1/1' } };
    return d.drawing;
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
    wrap.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
    dwg();
    fitZoom(true);
    refresh();
  }
  function close() { tool = null; toolState = null; const el = $('#sheet'); if (el) el.innerHTML = ''; svg = null; }
  function setZoom(z) { zoom = clamp(z, 0.3, 8); if (svg) { const [W, H] = sheetSize(); svg.setAttribute('width', W * zoom * 3.2); svg.setAttribute('height', H * zoom * 3.2); } }
  function fitZoom(noRender) {
    const [W, H] = sheetSize(); const c = $('#center').getBoundingClientRect();
    zoom = Math.max(0.3, Math.min((c.width - 60) / (W * 3.2), (c.height - 70) / (H * 3.2)));
    if (!noRender) setZoom(zoom);
  }
  function sheetSize() { const d = dwg(); const s = SHEETS[d.sheet] || SHEETS.A4; return d.orient === 'portrait' ? [s[1], s[0]] : s; }
  async function refresh() {
    if (App.mode !== 'drawing') return;
    const need = App.revision !== projRev;
    if (need && !loadingProj && Kernel.ready) {
      loadingProj = true;
      const d = dwg();
      try {
        const views = ['front', 'top', 'left']; if (d.views.iso) views.push('iso');
        const scene = Model.kernelScene(App.doc);
        const rev = App.revision;
        proj = await Kernel.call('project', { scene, views }); projId++;
        projRev = rev;
      } catch (e) { UI.toast('Die Ansichten konnten nicht berechnet werden: ' + e.message, { kind: 'bad' }); }
      loadingProj = false;
      if (App.revision !== projRev) return refresh();
    }
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
  function viewGeom(name) {
    if (!proj || !proj.views || !proj.views[name]) return null;
    // beim Bemaßen wird bei jeder Mausbewegung neu gezeichnet – die aufgeräumten Kanten merken
    const ck = name + '|' + projId + '|' + !!dwg().hidden + '|' + !!dwg().centers;
    if (geoCache.has(ck)) return geoCache.get(ck);
    if (geoCache.size > 16) geoCache.clear();
    const g = viewGeom_(name); geoCache.set(ck, g); return g;
  }
  function viewGeom_(name) {
    const v = proj.views[name];
    const raw = (e) => (e.t === 'LINE' && e.a ? { kind: 'line', a: e.a, b: e.b } : e.t === 'CIRCLE' && e.c && e.pts ? { kind: 'arc', c: e.c, r: e.r, full: !!e.full, pts: e.pts } : e.pts ? { kind: 'curve', pts: e.pts } : null);
    // Isometrie wie üblich ohne verdeckte Kanten
    const showHidden = dwg().hidden && name !== 'iso';
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
    const centers = [];
    if (dwg().centers) {
      const dir = new THREE.Vector3(...v.dir), ex = new THREE.Vector3(...v.x), ey = new THREE.Vector3(...v.y);
      const seen = new Set();
      for (const a of proj.axes || []) {
        const d = new THREE.Vector3(...a.d); const o = new THREE.Vector3(...a.o);
        const k = Math.abs(d.dot(dir));
        if (k > 0.995) {
          const c = [o.dot(ex), o.dot(ey)]; const key = 'c' + Math.round(c[0] * 100) + ',' + Math.round(c[1] * 100);
          if (seen.has(key)) continue; seen.add(key);
          centers.push({ type: 'cross', c, r: a.r });
        } else if (k < 0.01) {
          const p0 = o.clone().addScaledVector(d, a.t0), p1 = o.clone().addScaledVector(d, a.t1);
          const A = [p0.dot(ex), p0.dot(ey)], B = [p1.dot(ex), p1.dot(ey)];
          const key = 'l' + [A, B].flat().map((x) => Math.round(x * 10)).join(',');
          if (seen.has(key)) continue; seen.add(key);
          centers.push({ type: 'line', a: A, b: B });
        }
      }
    }
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
    return { polys, hidden, circles, points, centers, threads, box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
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
  function freeGeom() {
    const d = dwg(); if (!d.free.length) return null;
    const polys = [], circles = [], points = [];
    for (const e of d.free) {
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
    for (const e of d.free) if (e.type === 'text') points.push(e.p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polys) for (const q of p.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    for (const e of d.free) if (e.type === 'text') { x0 = Math.min(x0, e.p[0]); y0 = Math.min(y0, e.p[1]); x1 = Math.max(x1, e.p[0] + 10); y1 = Math.max(y1, e.p[1] + 5); }
    if (!isFinite(x0)) { x0 = -10; y0 = -10; x1 = 10; y1 = 10; }
    return { polys, hidden: [], circles, points, centers: [], box: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0 };
  }
  function computeLayout() {
    const d = dwg(); const [W, H] = sheetSize();
    const frame = { x: 20, y: 10, w: W - 30, h: H - 20 };
    const tb = { w: Math.min(180, frame.w), h: 32 };
    const area = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - tb.h - 16 };
    const G = { front: d.views.front ? viewGeom('front') : null, top: d.views.top ? viewGeom('top') : null, left: d.views.left ? viewGeom('left') : null, iso: d.views.iso ? viewGeom('iso') : null, free: freeGeom() };
    const main = G.front || G.top || G.left;
    let s = 1;
    const gap = 22;
    const needW = (sc) => (G.front ? G.front.w * sc : G.top ? G.top.w * sc : 0) + (G.left ? gap + G.left.w * sc : 0) + (G.iso && !G.top ? 0 : 0);
    const needH = (sc) => (G.front ? G.front.h * sc : G.left ? G.left.h * sc : 0) + (G.top ? gap + G.top.h * sc : 0);
    const isoRoom = G.iso ? 0.35 : 0;
    if (d.scale === 'auto') {
      s = SCALES[SCALES.length - 1];
      for (const sc of SCALES) {
        if (!main) { s = 1; break; }
        if (needW(sc) + 24 <= area.w * (G.iso && !G.top ? 1 - isoRoom : 1) && needH(sc) + 24 <= area.h) { s = sc; break; }
      }
    } else s = +d.scale || 1;
    const views = {};
    if (main) {
      const fw = G.front ? G.front.w * s : G.top.w * s, fh = G.front ? G.front.h * s : 0;
      const lw = G.left ? G.left.w * s : 0; const th = G.top ? G.top.h * s : 0;
      const totalW = fw + (G.left ? gap + lw : 0), totalH = fh + (G.top ? gap + th : 0);
      const x0 = area.x + Math.max(12, (area.w * (G.iso ? 0.72 : 1) - totalW) / 2), y0 = area.y + Math.max(12, (area.h - totalH) / 2);
      const place = (name, geo, px, py) => { views[name] = { geo, s, ox: px - geo.box[0] * s, oy: py + geo.box[3] * s }; };
      if (G.front) place('front', G.front, x0, y0);
      if (G.left) { const ref = G.front || G.left; const py = G.front ? y0 + (G.front.box[3] - G.left.box[3]) * s : y0; place('left', G.left, x0 + fw + gap, py); if (G.front) views.left.oy = views.front.oy; }
      if (G.top) { place('top', G.top, x0, y0 + fh + (G.front ? gap : 0)); if (G.front) views.top.ox = views.front.ox; }
      if (G.iso) {
        const rx = G.left ? x0 + fw + gap : x0 + fw + gap; const ry = G.top ? y0 + fh + gap : y0;
        const aw = area.x + area.w - rx - 6, ah = area.y + area.h - ry - 6;
        let si = s; while (si > 0.02 && (G.iso.w * si > aw || G.iso.h * si > ah)) si /= 1.25;
        if (aw > 20 && ah > 20) views.iso = { geo: G.iso, s: si, ox: rx + (aw - G.iso.w * si) / 2 - G.iso.box[0] * si, oy: ry + (ah - G.iso.h * si) / 2 + G.iso.box[3] * si, noDims: true };
      }
    }
    // frei Gezeichnetes liegt fest auf dem Papier: Millimeter ab der linken unteren Blattecke, 1:1
    if (G.free) views.free = { geo: G.free, s: 1, ox: 0, oy: H };
    return { W, H, frame, tb, area, s, views };
  }
  const toSheet = (v, p) => [v.ox + p[0] * v.s, v.oy - p[1] * v.s];
  const toView = (v, P) => [(P[0] - v.ox) / v.s, (v.oy - P[1]) / v.s];

  // ---------- Bemaßung ----------
  function autoDimList() {
    const d = dwg(); const all = [];
    for (const dim of d.dims) {
      if (!dim.auto) { all.push(dim); continue; }
      const out = [];
      const v = layout.views[dim.view]; if (!v) continue;
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
          out.push({ ...dim, id: dim.id + '_' + Math.round(best.r * 200), type: 'dia', c: best.c, r: best.r, ang, count: g.length, ...(mt ? { threadLabel: `${mt.size} × ${fmtDim(mt.length)}` } : {}) });
        }
        // Rundungen: gleiche Radien zusammenfassen („4× R5“). Nur deutliche Bögen – Zahnköpfe und Ähnliches bleiben weg.
        const ag = new Map();
        for (const c of v.geo.circles) { if (c.full || !c.arc || c.arc[1] - c.arc[0] < 0.35) continue; const k = Math.round(c.r * 200); let l = ag.get(k); if (!l) ag.set(k, (l = [])); l.push(c); }
        for (const g of [...ag.values()].sort((p, q) => q[0].r - p[0].r)) {
          if (g.length > 12) continue;
          let best = g[0], bd = -1;
          for (const c of g) { const mid = (c.arc[0] + c.arc[1]) / 2; const d = Math.hypot(c.c[0] + c.r * Math.cos(mid) - mx, c.c[1] + c.r * Math.sin(mid) - my); if (d > bd) { bd = d; best = c; } }
          const mid = (best.arc[0] + best.arc[1]) / 2;
          out.push({ ...dim, id: dim.id + '_r' + Math.round(best.r * 200), type: 'rad', c: best.c, r: best.r, ang: (mid * 180) / Math.PI, count: g.length });
        }
      }
      // einzeln gelöschte automatische Maße bleiben weg
      for (const x of out) if (!(dim.hide || []).includes(x.id)) all.push(x);
    }
    return all;
  }
  function dimSVG(dim, lines, texts) {
    const v = layout.views[dim.view]; if (!v) return;
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
      texts.push({ x: tx, y: ty, t: fmtDim(val), size: TXT, rot: ang, anchor: 'middle', id: dim.id, cls: 'dimtext' });
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
      const label = (dim.count > 1 ? dim.count + '× ' : '') + (dim.threadLabel ? dim.threadLabel : (dim.type === 'dia' ? 'Ø' : 'R') + fmtDim(dim.type === 'dia' ? dim.r * 2 : dim.r));
      const tl = textW(label, TXT) * 0.92 + 2;
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
      texts.push({ x: (out[0] + tail[0]) / 2, y: out[1] - 1.2, t: label, size: TXT, rot: 0, anchor: 'middle', id: dim.id, cls: 'dimtext' });
    }
  }
  function fmtDim(v) { return fmt(Math.round(v * 100) / 100, 2); }
  function arrowHead(lines, tip, from, len, inside, id) {
    const dx = from[0] - tip[0], dy = from[1] - tip[1]; const L = Math.hypot(dx, dy) || 1; let ux = dx / L, uy = dy / L;
    if (!inside) { ux = -ux; uy = -uy; }
    const w = len * 0.28;
    const b = [tip[0] + ux * len, tip[1] + uy * len];
    lines.push({ poly: [tip, [b[0] - uy * w, b[1] + ux * w], [b[0] + uy * w, b[1] - ux * w]], cls: 'arrow', id });
  }

  // ---------- Zeichnen ----------
  function render() {
    if (!holder) return;
    layout = computeLayout();
    const { W, H, frame, tb } = layout;
    const d = dwg();
    const lines = [], texts = [];
    // Rahmen
    lines.push({ rect: [0, 0, W, H], cls: 'paper' });
    lines.push({ rect: [frame.x, frame.y, frame.w, frame.h], cls: 'frame' });
    // Ansichten
    for (const [name, v] of Object.entries(layout.views)) {
      const asLine = (p, cls) => {
        if (p.c && !p.arc) return { circle: [...toSheet(v, p.c), p.r * v.s], cls };
        const l = { pts: p.pts.map((q) => toSheet(v, q)), cls };
        if (p.arc) l.arc = { c: toSheet(v, p.c), r: p.r * v.s, a: p.arc };
        return l;
      };
      for (const p of v.geo.polys) lines.push(asLine(p, 'vis'));
      for (const p of v.geo.hidden) lines.push(asLine(p, 'hid'));
      for (const c of v.geo.centers) {
        if (c.type === 'cross') { const C = toSheet(v, c.c); const r = c.r * v.s + 2; lines.push({ pts: [[C[0] - r, C[1]], [C[0] + r, C[1]]], cls: 'ctr' }, { pts: [[C[0], C[1] - r], [C[0], C[1] + r]], cls: 'ctr' }); }
        else { const A = toSheet(v, c.a), B = toSheet(v, c.b); const dx = B[0] - A[0], dy = B[1] - A[1]; const L = Math.hypot(dx, dy) || 1; const e = 2.5; lines.push({ pts: [[A[0] - (dx / L) * e, A[1] - (dy / L) * e], [B[0] + (dx / L) * e, B[1] + (dy / L) * e]], cls: 'ctr' }); }
      }
      // Kosmetische Gewinde nach DIN ISO 6410-1: 3/4-Kreis (Stirnansicht) bzw. dünne parallele Linien (Seitenansicht)
      const labelSide = name === 'front' || (name === 'left' && !layout.views.front);
      for (const th of v.geo.threads || []) {
        if (th.type === 'end') {
          const C = toSheet(v, th.c), rr = th.rThread * v.s;
          if (rr > 0.3) lines.push({ pts: arcPts(th.c, th.rThread, 0, Math.PI * 1.5).map((q) => toSheet(v, q)), arc: { c: C, r: rr, a: [0, Math.PI * 1.5] }, cls: 'thin' });
        } else if (th.type === 'side') {
          const A = toSheet(v, th.a), B = toSheet(v, th.b);
          const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
          if (L < 0.3) continue;
          const px = -dy / L, py = dx / L, rt = th.rThread * v.s, ro = th.r * v.s;
          lines.push({ pts: [[A[0] + px * rt, A[1] + py * rt], [B[0] + px * rt, B[1] + py * rt]], cls: 'thin' });
          lines.push({ pts: [[A[0] - px * rt, A[1] - py * rt], [B[0] - px * rt, B[1] - py * rt]], cls: 'thin' });
          lines.push({ pts: [[A[0] - px * ro, A[1] - py * ro], [A[0] + px * ro, A[1] + py * ro]], cls: 'vis' });
          lines.push({ pts: [[B[0] - px * ro, B[1] - py * ro], [B[0] + px * ro, B[1] + py * ro]], cls: 'vis' });
          if (labelSide) {
            const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
            const P0 = [mx + px * ro, my + py * ro];
            const P1 = [P0[0] + px * 5 + 3, P0[1] + py * 5 - 4];
            const lbl = `${th.size} × ${fmtDim(th.length)}`;
            const tw = textW(lbl, 3.2) + 2;
            const P2 = [P1[0] + tw, P1[1]];
            lines.push({ pts: [P0, P1, P2], cls: 'dim' });
            texts.push({ x: (P1[0] + P2[0]) / 2, y: P1[1] - 1, t: lbl, size: 3.2, rot: 0, anchor: 'middle', cls: 'dimtext' });
          }
        }
      }
      if (name === 'free') for (const e of d.free) if (e.type === 'text') { const P = toSheet(v, e.p); texts.push({ x: P[0], y: P[1], t: e.text, size: e.size || 3.5, rot: 0, anchor: 'start', id: e.id, cls: 'free' }); }
    }
    if (!Object.keys(layout.views).length) texts.push({ x: W / 2, y: H / 2 - 10, t: 'Noch kein Modell – bau zuerst etwas im Reiter „Modell“.', size: 5, anchor: 'middle', cls: 'note' });
    // Bemaßungen
    for (const dim of autoDimList()) if (layout.views[dim.view] && !layout.views[dim.view].noDims) dimSVG(dim, lines, texts);
    // Schriftfeld
    titleBlock(lines, texts);
    // Werkzeug-Vorschau
    if (tool === 'dim' && toolState) previewDim(lines, texts);
    buildSVG(lines, texts);
    const sv = document.getElementById('dw-scale-val'); if (sv) sv.textContent = scaleText(layout.s);
  }
  function titleBlock(lines, texts) {
    const { frame, tb } = layout; const d = dwg(); const T = d.title;
    const x1 = frame.x + frame.w, y1 = frame.y + frame.h, x0 = x1 - tb.w, y0 = y1 - tb.h;
    lines.push({ rect: [x0, y0, tb.w, tb.h], cls: 'frame' });
    // links: 4 Zeilen × 2 Spalten · Mitte: Benennung · rechts: Projektionssymbol
    const cA = x0, cB = x0 + 32, cC = x0 + 72, cD = x1 - 32;
    const rows = [y0, y0 + 8, y0 + 16, y0 + 24, y1];
    for (const r of rows.slice(1, -1)) lines.push({ pts: [[cA, r], [cC, r]], cls: 'thin' });
    lines.push({ pts: [[cB, y0], [cB, y1]], cls: 'thin' }, { pts: [[cC, y0], [cC, y1]], cls: 'thin' }, { pts: [[cD, y0], [cD, y1]], cls: 'thin' });
    lines.push({ pts: [[cC, y0 + 24], [cD, y0 + 24]], cls: 'thin' }, { pts: [[cD, y0 + 20], [x1, y0 + 20]], cls: 'thin' });
    const lab = (x, y, t) => texts.push({ x: x + 1.2, y: y + 2.6, t, size: 1.9, anchor: 'start', cls: 'lab' });
    const val = (x, y, t, w, size = 3) => { const s = fitSize(t || '', w - 2.6, size, 1.8); texts.push({ x: x + 1.5, y: y + 6.6, t: clipText(t || '', w - 2.6, s), size: s, anchor: 'start', cls: 'val' }); };
    lab(cA, rows[0], 'Gezeichnet'); val(cA, rows[0], T.name, 32, 2.8);
    lab(cB, rows[0], 'Datum'); val(cB, rows[0], T.datum, 40, 2.8);
    lab(cA, rows[1], 'Werkstoff'); val(cA, rows[1], T.werkstoff, 32, 2.8);
    lab(cB, rows[1], 'Maßstab'); val(cB, rows[1], scaleText(layout.s), 40, 3.2);
    lab(cA, rows[2], 'Firma / Schule'); val(cA, rows[2], T.firma, 32, 2.6);
    lab(cB, rows[2], 'Blatt'); val(cB, rows[2], T.blatt, 40, 2.8);
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
    texts.push({ x: cC + 1.5, y: rows[3] + 5.4, t: 'Erstellt mit Tracery', size: 2, anchor: 'start', cls: 'lab' });
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
    return String(s).replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[^\x00-\xff]/g, '?');
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
    style.textContent = `.paper{fill:#fff;stroke:none}.frame{fill:none;stroke:#111;stroke-width:.7}.thin{fill:none;stroke:#111;stroke-width:.25}.vis{fill:none;stroke:#111;stroke-width:.5;stroke-linecap:round;stroke-linejoin:round}.hid{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:2.4 1.2}.ctr{fill:none;stroke:#111;stroke-width:.25;stroke-dasharray:8 1.2 .6 1.2}.dim{fill:none;stroke:#111;stroke-width:.25}.arrow{fill:#111;stroke:none}.sel .dim,.dim.sel{stroke:#0c7a70;stroke-width:.4}.arrow.sel{fill:#0c7a70}text{font-family:"Barlow Semi Condensed","Barlow",Arial,sans-serif;fill:#111}text.lab{fill:#555}text.note{fill:#888}text.sel{fill:#0c7a70}.prev{fill:none;stroke:#0c7a70;stroke-width:.35;stroke-dasharray:1.5 1}.snap{fill:none;stroke:#0c7a70;stroke-width:.4}`;
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
      g.append(el);
    }
    for (const t of texts) {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', f(t.x)); el.setAttribute('y', f(t.y)); el.setAttribute('font-size', f(t.size)); el.setAttribute('text-anchor', t.anchor || 'start');
      if (t.rot) el.setAttribute('transform', `rotate(${f(t.rot)} ${f(t.x)} ${f(t.y)})`);
      el.setAttribute('class', (t.cls || '') + (t.id && t.id === selDim ? ' sel' : ''));
      if (t.id) el.dataset.id = t.id;
      el.textContent = t.t;
      g.append(el);
    }
    holder.innerHTML = ''; holder.append(s); svg = s;
    s.addEventListener('pointermove', onMove); s.addEventListener('pointerdown', onDown);
    lastLines = lines; lastTexts = texts;
  }
  let lastLines = [], lastTexts = [];
  // ---------- Maus ----------
  function sheetPt(e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); if (!m) return [0, 0]; const q = pt.matrixTransform(m.inverse()); return [q.x, q.y]; }
  function viewAt(P) {
    let best = null;
    for (const [name, v] of Object.entries(layout.views)) { if (v.noDims) continue; const b = v.geo.box; const A = toSheet(v, [b[0], b[3]]), B = toSheet(v, [b[2], b[1]]); if (P[0] >= A[0] - 8 && P[0] <= B[0] + 8 && P[1] >= A[1] - 8 && P[1] <= B[1] + 8) best = name; }
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
  function onMove(e) {
    if (tool === 'dim') {
      const P = sheetPt(e);
      toolState = toolState || { stage: 0 };
      toolState.P = P;
      const name = toolState.view || viewAt(P);
      toolState.hoverView = name;
      toolState.snap = name ? snapIn(name, P) : null;
      render();
    } else if (tool && tool.startsWith('free-')) { freeMove(e); }
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const P = sheetPt(e);
    if (tool === 'dim') { dimClick(P, e); return; }
    if (tool && tool.startsWith('free-')) { freeDown(e); return; }
    const t = e.target.closest && e.target.closest('[data-id]');
    selDim = t ? t.dataset.id : null;
    if (t && e.detail === 2) editFreeText(selDim);
    render(); Panels.renderRight();
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
    if (e.key === 'Escape') { if (tool) { setTool(null); return true; } if (selDim) { selDim = null; render(); return true; } return false; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selDim) { removeSel(); return true; }
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) { setTool('dim'); return true; }
    return false;
  }
  function removeSel() {
    const id = selDim; if (!id) return;
    App.change('Gelöscht', () => {
      const d = dwg();
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
    tool = t; toolState = t === 'dim' ? { stage: 0 } : t ? { } : null;
    if (svg) svg.style.cursor = t ? 'crosshair' : '';
    UI.hint(t === 'dim' ? '<b>Maß:</b> Zwei Punkte anklicken, dann die Maßlinie platzieren. Ein Klick auf einen Kreis bemaßt den Durchmesser. <b>Esc</b> beendet.' : t && t.startsWith('free-') ? HINTS2[t] : null);
    Panels.renderTools(); render();
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
  function sheetMenu(anchor) {
    const d = dwg();
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    const f = h('div', { class: 'fields' });
    f.append(UI.selectField({ id: 'dw-sheet', label: T('menu.draw.sheet'), value: d.sheet, options: [['A4', 'A4'], ['A3', 'A3']], onChange: (v) => { set((x) => { x.sheet = v; }); fitZoom(); } }));
    f.append(UI.selectField({ id: 'dw-orient', label: T('menu.draw.orient'), value: d.orient, options: [['landscape', T('menu.draw.landscape')], ['portrait', T('menu.draw.portrait')]], onChange: (v) => { set((x) => { x.orient = v; }); fitZoom(); } }));
    box.append(f);
    box.append(UI.selectField({ id: 'dw-scale', label: T('menu.draw.scale'), value: String(d.scale), options: [['auto', T('menu.draw.scaleAuto')], ...SCALES.map((s) => [String(s), scaleText(s)])], onChange: (v) => set((x) => { x.scale = v === 'auto' ? 'auto' : +v; }) }));
    box.append(h('div', { class: 'section-h' }, T('menu.draw.viewsHeading')));
    for (const [k, l] of [['front', T('menu.draw.vFront')], ['top', T('menu.draw.vTop')], ['left', T('menu.draw.vLeft')], ['iso', T('menu.draw.vIso')]]) {
      const c = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-v-' + k, checked: !!d.views[k] }), l);
      c.querySelector('input').onchange = (e) => set((x) => { x.views[k] = e.target.checked; }); box.append(c);
    }
    for (const [k, l] of [['hidden', T('menu.draw.hiddenEdges')], ['centers', T('menu.draw.centers')]]) {
      const c = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'dw-' + k, checked: !!d[k] }), l);
      c.querySelector('input').onchange = (e) => set((x) => { x[k] = e.target.checked; }); box.append(c);
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
  function fileBase() { return Print.safeName((dwg().title.titel || App.doc.name) + ' Zeichnung'); }
  function exportSVG() {
    if (!svg) return;
    const clone = svg.cloneNode(true); clone.removeAttribute('width'); clone.removeAttribute('height');
    const [W, H] = sheetSize(); clone.setAttribute('width', W + 'mm'); clone.setAttribute('height', H + 'mm');
    clone.querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'));
    const str = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    Print.save(fileBase() + '.svg', str);
  }
  let jspdfPromise = null;
  function loadJsPDF() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!jspdfPromise) jspdfPromise = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => res(window.jspdf); s.onerror = () => { jspdfPromise = null; rej(new Error('PDF-Baustein konnte nicht geladen werden.')); }; document.head.append(s); });
    return jspdfPromise;
  }
  async function exportPDF() {
    const tst = UI.toast('PDF wird erstellt …', { icon: 'file', ms: 15000 });
    try {
      const lib = await loadJsPDF(); const { jsPDF } = lib;
      render();
      const [W, H] = sheetSize(); const pdf = new jsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'mm', format: [W, H] });
      pdf.setProperties({ title: dwg().title.titel || App.doc.name, creator: 'Tracery' });
      const style = { frame: [0.7, null], thin: [0.25, null], vis: [0.5, null], hid: [0.25, [2.4, 1.2]], ctr: [0.25, [8, 1.2, 0.6, 1.2]], dim: [0.25, null] };
      for (const l of lastLines) {
        if (l.cls === 'paper' || l.cls === 'prev' || l.cls === 'snap') continue;
        const st = style[l.cls]; pdf.setDrawColor(17, 17, 17);
        if (l.cls === 'arrow') { pdf.setFillColor(17, 17, 17); const [a, b, c] = l.poly; pdf.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F'); continue; }
        if (!st) continue;
        pdf.setLineWidth(st[0]); pdf.setLineDashPattern(st[1] || [], 0);
        if (l.rect) pdf.rect(l.rect[0], l.rect[1], l.rect[2], l.rect[3], 'S');
        else if (l.circle) pdf.circle(l.circle[0], l.circle[1], l.circle[2], 'S');
        else if (l.pts && l.pts.length > 1) {
          // als ein zusammenhängender Pfad, damit das Strichmuster durchläuft
          const d = []; for (let i = 1; i < l.pts.length; i++) d.push([l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]]);
          pdf.lines(d, l.pts[0][0], l.pts[0][1], [1, 1], 'S', false);
        }
      }
      pdf.setLineDashPattern([], 0);
      for (const t of lastTexts) {
        if (t.cls === 'note') continue;
        pdf.setFont('helvetica', t.cls === 'title' ? 'bold' : 'normal'); pdf.setFontSize(t.size * 2.83465 / 1.0);
        pdf.setTextColor(t.cls === 'lab' ? 85 : 17);
        const opts = { align: t.anchor === 'middle' ? 'center' : 'left', angle: t.rot ? -t.rot : 0, baseline: 'alphabetic' };
        pdf.text(latin1(t.t), t.x, t.y, opts);
      }
      const buf = pdf.output('arraybuffer');
      tst.remove();
      await Print.save(fileBase() + '.pdf', new Blob([buf]));
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
    P(0, 'LTYPE', 2, 'CENTER', 70, 0, 3, '____ _ ____', 72, 65, 73, 4, 40, 11, 49, 8, 49, -1.2, 49, 0.6, 49, -1.2);
    P(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, 5);
    for (const [n, lt, col] of [['SICHTBAR', 'CONTINUOUS', 7], ['VERDECKT', 'DASHED', 8], ['MITTELLINIE', 'CENTER', 1], ['BEMASSUNG', 'CONTINUOUS', 3], ['RAHMEN', 'CONTINUOUS', 7]]) P(0, 'LAYER', 2, n, 70, 0, 62, col, 6, lt);
    P(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    const layer = { vis: 'SICHTBAR', hid: 'VERDECKT', ctr: 'MITTELLINIE', dim: 'BEMASSUNG', arrow: 'BEMASSUNG', frame: 'RAHMEN', thin: 'RAHMEN' };
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
    for (const t of lastTexts) { if (t.cls === 'note') continue; P(0, 'TEXT', 8, t.cls === 'dimtext' ? 'BEMASSUNG' : 'RAHMEN', 10, t.x.toFixed(4), 20, Y(t.y).toFixed(4), 30, 0, 40, t.size.toFixed(3), 1, String(t.t).replace(/Ø/g, '%%c'), 50, (-(t.rot || 0)).toFixed(3), ...(t.anchor === 'middle' ? [72, 1, 11, t.x.toFixed(4), 21, Y(t.y).toFixed(4), 31, 0] : [])); }
    P(0, 'ENDSEC', 0, 'EOF');
    const text = out.join('\r\n') + '\r\n';
    const bytes = new Uint8Array([...text].map((ch) => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; }));
    const zip = await Zip.make([{ name: fileBase() + '.dxf', data: bytes }]);
    await Print.save(fileBase() + ' DXF.zip', new Blob([zip]));
  }
  // ---------- Rechte Leiste ----------
  function renderPanel(body) {
    const d = dwg(); const w = h('div', { class: 'props' });
    const sec = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Schriftfeld'));
    const tf = (k, label, ph) => { const f = h('div', { class: 'field' }, h('label', { for: 'tb-' + k }, label), h('div', { class: 'inp' }, h('input', { id: 'tb-' + k, value: d.title[k] || '', placeholder: ph || '', style: { fontFamily: 'var(--font)' } }))); f.querySelector('input').addEventListener('change', (e) => set((x) => { x.title[k] = e.target.value; }, 'Schriftfeld geändert')); f.querySelector('input').addEventListener('keydown', (e) => e.stopPropagation()); return f; };
    sec.append(tf('titel', 'Benennung', App.doc.name), h('div', { class: 'fields' }, tf('nummer', 'Zeichnungsnummer'), tf('blatt', 'Blatt')), h('div', { class: 'fields' }, tf('name', 'Gezeichnet von'), tf('datum', 'Datum')), h('div', { class: 'fields' }, tf('werkstoff', 'Werkstoff'), tf('firma', 'Firma / Schule')));
    w.append(sec);
    const info = h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Blatt'));
    info.append(h('div', { class: 'mini-list' }, h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Format'), h('b', null, d.sheet + ' ' + (d.orient === 'portrait' ? 'hoch' : 'quer'))), h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Maßstab'), h('b', { class: 'mono', id: 'dw-scale-val' }, layout ? scaleText(layout.s) : '–')), h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, 'Maße'), h('b', { class: 'mono' }, String(layout ? autoDimList().length : d.dims.length)))));
    const b = h('button', { type: 'button', class: 'btn' }); b.innerHTML = icon('sheet') + 'Blatt & Ansichten'; b.onclick = (e) => sheetMenu(e.currentTarget);
    info.append(h('div', { class: 'btn-row' }, b)); w.append(info);
    if (selDim) {
      const del = h('button', { type: 'button', class: 'btn danger' }); del.innerHTML = icon('trash') + 'Gewähltes löschen'; del.onclick = () => removeSel();
      w.append(h('div', { class: 'section' }, h('div', { class: 'section-h' }, 'Auswahl'), h('div', { class: 'btn-row' }, del)));
    }
    w.append(h('div', { class: 'hint-box', html: 'Die Ansichten stehen nach <b>Projektionsmethode 1</b>: Draufsicht unter der Vorderansicht, Seitenansicht von links rechts daneben. Maß anklicken und <b>Entf</b> drücken zum Löschen.' }));
    body.append(w);
  }
  function tool_(t) { setTool(tool === t ? null : t); }
  App.on('doc', () => { if (App.mode === 'drawing') refreshSoonDoc(); });
  const refreshSoonDoc = debounce(() => refresh(), 150);
  return { open, close, refresh, sheetMenu, exportMenu, drawMenu, autoDims, tool: tool_, onKey, renderPanel };
})();

