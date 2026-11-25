// ================= Löser für Skizzen: Maße und Bedingungen gleichzeitig erfüllen =================
// Jede Skizze wird in Zahlen (Variablen) und Gleichungen übersetzt. Ein gedämpftes Gauß-Newton-Verfahren
// sucht die Lösung, die am wenigsten von der jetzigen Zeichnung abweicht – so bewegt sich nur, was muss.
// Danach zeigt eine Rang-Analyse, welche Elemente noch beweglich sind (blau) und welche fest (schwarz).
//
// Bedingung:  { id, type, refs: [Bezug, …], mode?, at? }
// Maß:        { id, k, e?, refs?, v }   (v: Zahl oder Formel)
// Bezug:      { e: Element-ID }                    ganzes Element (Linie, Kreis …)
//             { e, edge: i }                       Kante i eines Rechtecks
//             { e, p: 'a'|'b'|'c'|'k0'…'k3'|'v0'…}  Punkt eines Elements
//             { e: 'origin' } · { at: [x, y] }      Ursprung · fester Punkt (z. B. von einer Körperkante)
const Solver = (() => {
  const TAU = Math.PI * 2;
  const EPS = 1e-12;
  const qk = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  const hyp = Math.hypot;
  const wrap = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };

  // ---------- Variablen je Element ----------
  const VARS = {
    line: ['a0', 'a1', 'b0', 'b1'], point: ['a0', 'a1'], arc: ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'], circle: ['c0', 'c1', 'r'],
    rect: ['a0', 'a1', 'b0', 'b1'], slot: ['a0', 'a1', 'b0', 'b1', 'r'], poly: ['c0', 'c1', 'r'], ellipse: ['c0', 'c1', 'rx', 'ry'], ellarc: ['c0', 'c1', 'rx', 'ry', 'a0', 'a1'], conic: ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'], text: ['a0', 'a1', 'h'],
  };
  // Splines haben beliebig viele Punkte: Schlüssel „p3_0“ = X des vierten Punkts, „p3_1“ = Y, aktive Griffe „h3_0“/„h3_1“
  const varsOf = (e) => {
    if (e.type !== 'spline') return VARS[e.type];
    const ks = (e.pts || []).flatMap((_, i) => ['p' + i + '_0', 'p' + i + '_1']);
    if (e.mode !== 'cv' && Array.isArray(e.handles)) {
      e.handles.forEach((h, i) => { if (Array.isArray(h)) ks.push('h' + i + '_0', 'h' + i + '_1'); });
    }
    return ks;
  };
  const SPK = /^p(\d+)_([01])$/;
  const SPHK = /^h(\d+)_([01])$/;
  const getK = (e, k) => {
    if (k === 'r' || k === 'rx' || k === 'ry' || ((k === 'a0' || k === 'a1') && e.type === 'ellarc') || (k === 'h' && e.type === 'text')) return e[k];
    const m = SPK.exec(k); if (m) return e.pts[+m[1]][+m[2]];
    const mh = SPHK.exec(k); if (mh) return e.handles[+mh[1]][+mh[2]];
    return e[k[0]][+k[1]];
  };
  const setK = (e, k, v) => {
    if (k === 'r' || k === 'rx' || k === 'ry' || ((k === 'a0' || k === 'a1') && e.type === 'ellarc') || (k === 'h' && e.type === 'text')) { e[k] = v; return; }
    const m = SPK.exec(k);
    if (m) { e.pts = e.pts.slice(); e.pts[+m[1]] = e.pts[+m[1]].slice(); e.pts[+m[1]][+m[2]] = v; return; }
    const mh = SPHK.exec(k);
    if (mh) { e.handles = e.handles.slice(); e.handles[+mh[1]] = e.handles[+mh[1]].slice(); e.handles[+mh[1]][+mh[2]] = v; return; }
    e[k[0]] = e[k[0]].slice(); e[k[0]][+k[1]] = v;
  };

  function circum(ax, ay, bx, by, mx, my) {
    const d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by));
    if (Math.abs(d) < 1e-12) return [(ax + bx) / 2, (ay + by) / 2, 1e6];
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, m2 = mx * mx + my * my;
    const ux = (a2 * (by - my) + b2 * (my - ay) + m2 * (ay - by)) / d;
    const uy = (a2 * (mx - bx) + b2 * (ax - mx) + m2 * (bx - ax)) / d;
    return [ux, uy, hyp(ax - ux, ay - uy)];
  }
  function arcLen(ax, ay, bx, by, mx, my) {
    const d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by));
    if (Math.abs(d) < 1e-10) return hyp(bx - ax, by - ay);
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, m2 = mx * mx + my * my;
    const ux = (a2 * (by - my) + b2 * (my - ay) + m2 * (ay - by)) / d;
    const uy = (a2 * (mx - bx) + b2 * (ax - mx) + m2 * (bx - ax)) / d;
    const r = hyp(ax - ux, ay - uy);
    if (r > 1e5) return hyp(mx - ax, my - ay) + hyp(bx - mx, by - my);
    const norm = (t) => ((t % TAU) + TAU) % TAU;
    const a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(my - uy, mx - ux), a1 = Math.atan2(by - uy, bx - ux);
    const ccw = norm(am - a0) < norm(a1 - a0);
    const sweep = ccw ? norm(a1 - a0) : norm(a0 - a1);
    return sweep * r;
  }

  // ---------- Krümmung & G2-Endzustände (gemeinsam für Löser & Krümmungskamm) ----------
  function bezDeriv(a, c1, c2, b, t) {
    const u = 1 - t, u2 = u * u, t2 = t * t;
    const A = u2 * u, B = 3 * u2 * t, C = 3 * u * t2, D = t2 * t;
    const p = [A * a[0] + B * c1[0] + C * c2[0] + D * b[0], A * a[1] + B * c1[1] + C * c2[1] + D * b[1]];
    const dx = 3 * u2 * (c1[0] - a[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t2 * (b[0] - c2[0]);
    const dy = 3 * u2 * (c1[1] - a[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t2 * (b[1] - c2[1]);
    const ddx = 6 * u * (c2[0] - 2 * c1[0] + a[0]) + 6 * t * (b[0] - 2 * c2[0] + c1[0]);
    const ddy = 6 * u * (c2[1] - 2 * c1[1] + a[1]) + 6 * t * (b[1] - 2 * c2[1] + c1[1]);
    const s2 = dx * dx + dy * dy;
    if (s2 < 1e-12) return { p, tan: [1, 0], K: [0, 0], k: 0 };
    const sp = Math.sqrt(s2), cross = dx * ddy - dy * ddx, f = cross / (s2 * s2);
    return { p, tan: [dx / sp, dy / sp], K: [-dy * f, dx * f], k: cross / (s2 * sp) };
  }
  function crSeg(p0, p1, p2, p3) {
    const dist = (u, v) => hyp(v[0] - u[0], v[1] - u[1]);
    const d01 = Math.sqrt(Math.max(dist(p0, p1), 1e-9));
    const d12 = Math.sqrt(Math.max(dist(p1, p2), 1e-9));
    const d23 = Math.sqrt(Math.max(dist(p2, p3), 1e-9));
    const t1 = d01, t2 = t1 + d12, t3 = t2 + d23, dt = t2 - t1;
    const m1 = [0, 1].map((k) => ((p1[k] - p0[k]) / t1 - (p2[k] - p0[k]) / t2 + (p2[k] - p1[k]) / dt) * dt);
    const m2 = [0, 1].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
    return { a: p1, c1: [p1[0] + m1[0] / 3, p1[1] + m1[1] / 3], c2: [p2[0] - m2[0] / 3, p2[1] - m2[1] / 3], b: p2 };
  }
  function lineEndStateFromPts(a, b, end) {
    const p = end === 'a' ? a : b, q = end === 'a' ? b : a;
    const L = hyp(q[0] - p[0], q[1] - p[1]) || 1;
    return { p: p.slice(), t: [(q[0] - p[0]) / L, (q[1] - p[1]) / L], K: [0, 0], k: 0 };
  }
  function splineEndStateFromPts(pts, end) {
    const n = pts ? pts.length : 0;
    if (n < 2) return null;
    if (n === 2) return lineEndStateFromPts(pts[0], pts[1], end);
    if (end === 'a') {
      const q0 = [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
      const s = crSeg(q0, pts[0], pts[1], pts[2]);
      const d = bezDeriv(s.a, s.c1, s.c2, s.b, 0);
      return { p: d.p, t: d.tan, K: d.K, k: d.k };
    }
    const q3 = [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
    const s = crSeg(pts[n - 3], pts[n - 2], pts[n - 1], q3);
    const d = bezDeriv(s.a, s.c1, s.c2, s.b, 1);
    return { p: d.p, t: [-d.tan[0], -d.tan[1]], K: d.K, k: d.k };
  }
  function arcEndStateFromPts(a, m, b, end) {
    const [cx, cy, r] = circum(a[0], a[1], b[0], b[1], m[0], m[1]);
    if (!isFinite(r) || r > 1e5 || r < 1e-9) return lineEndStateFromPts(a, b, end);
    const norm = (t) => ((t % TAU) + TAU) % TAU;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx), am = Math.atan2(m[1] - cy, m[0] - cx), a1 = Math.atan2(b[1] - cy, b[0] - cx);
    const ccw = norm(am - a0) < norm(a1 - a0);
    const p = end === 'a' ? a : b;
    const ux = (p[0] - cx) / r, uy = (p[1] - cy) / r;
    const goCCW = end === 'a' ? ccw : !ccw;
    const t = goCCW ? [-uy, ux] : [uy, -ux];
    const K = [-ux / r, -uy / r];
    return { p: p.slice(), t, K, k: (goCCW ? 1 : -1) / r, r, c: [cx, cy], ccw };
  }
  function ellArcEndStateFromVals(c, rx, ry, rot, a0, a1, ccw, end) {
    const th = end === 'a' ? a0 : a1;
    const sgn = (end === 'a' ? 1 : -1) * (ccw === false ? -1 : 1);
    const cs = Math.cos(rot), sn = Math.sin(rot), ct = Math.cos(th), st = Math.sin(th);
    const lx = rx * ct, ly = ry * st, ldx = -rx * st, ldy = ry * ct, lddx = -rx * ct, lddy = -ry * st;
    const p = [c[0] + cs * lx - sn * ly, c[1] + sn * lx + cs * ly];
    const dx = cs * ldx - sn * ldy, dy = sn * ldx + cs * ldy;
    const ddx = cs * lddx - sn * lddy, ddy = sn * lddx + cs * lddy;
    const s2 = dx * dx + dy * dy;
    if (s2 < 1e-12) return { p, t: [sgn, 0], K: [0, 0], k: 0 };
    const sp = Math.sqrt(s2), cross = dx * ddy - dy * ddx, f = cross / (s2 * s2);
    return { p, t: [(sgn * dx) / sp, (sgn * dy) / sp], K: [-dy * f, dx * f], k: cross / (s2 * sp) };
  }
  function curveEndState(e, end = 'a') {
    if (!e) return null;
    if (e.type === 'spline' && !e.closed) return splineEndStateFromPts(e.pts, end);
    if (e.type === 'arc') return arcEndStateFromPts(e.a, e.m, e.b, end);
    if (e.type === 'line') return lineEndStateFromPts(e.a, e.b, end);
    if (e.type === 'ellarc') return ellArcEndStateFromVals(e.c, e.rx, e.ry, e.rot || 0, e.a0, e.a1, e.ccw !== false, end);
    return null;
  }
  function curvatureSamples(e) {
    if (!e) return null;
    if (e.type === 'spline') {
      if (!e.pts || e.pts.length < 2) return null;
      const segs = SK.splineBez(e.pts, !!e.closed);
      const samples = [];
      for (const s of segs) {
        if (s.t === 'line') {
          samples.push({ p: s.a.slice(), K: [0, 0], kAbs: 0 }, { p: s.b.slice(), K: [0, 0], kAbs: 0 });
        } else if (s.t === 'bez') {
          const len = hyp(s.c1[0] - s.a[0], s.c1[1] - s.a[1]) + hyp(s.c2[0] - s.c1[0], s.c2[1] - s.c1[1]) + hyp(s.b[0] - s.c2[0], s.b[1] - s.c2[1]);
          const N = clamp(Math.ceil(len / 1.5), 10, 28);
          for (let i = 0; i <= N; i++) {
            const d = bezDeriv(s.a, s.c1, s.c2, s.b, i / N);
            samples.push({ p: d.p, K: d.K, kAbs: Math.abs(d.k) });
          }
        }
      }
      return samples.length ? { closed: !!e.closed, samples } : null;
    }
    if (e.type === 'arc') {
      const ai = SK.arcInfo(e.a, e.m, e.b);
      if (!ai || !isFinite(ai.r) || ai.r > 1e5 || ai.r < 1e-9) return null;
      const N = clamp(Math.ceil((Math.abs(ai.sweep) * ai.r) / 2), 10, 48);
      const samples = [];
      for (let i = 0; i <= N; i++) {
        const th = ai.a0 + (ai.sweep * i) / N, cs = Math.cos(th), sn = Math.sin(th);
        samples.push({ p: [ai.c[0] + cs * ai.r, ai.c[1] + sn * ai.r], K: [-cs / ai.r, -sn / ai.r], kAbs: 1 / ai.r });
      }
      return { closed: false, samples };
    }
    if (e.type === 'ellipse' || e.type === 'ellarc') {
      if (!(e.rx > 1e-6 && e.ry > 1e-6)) return null;
      const closed = e.type === 'ellipse' || Math.abs(SK.ellArcSweep(e.a0, e.a1, e.ccw !== false)) >= TAU - 1e-6;
      const sw = e.type === 'ellipse' ? TAU : SK.ellArcSweep(e.a0, e.a1, e.ccw !== false);
      const a0 = e.type === 'ellipse' ? 0 : e.a0;
      const N = clamp(Math.ceil((Math.abs(sw) / TAU) * 48), 10, 48);
      const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
      const samples = [];
      const count = closed ? N - 1 : N;
      for (let i = 0; i <= count; i++) {
        const th = a0 + (sw * i) / N, ct = Math.cos(th), st = Math.sin(th);
        const lx = e.rx * ct, ly = e.ry * st, ldx = -e.rx * st, ldy = e.ry * ct, lddx = -e.rx * ct, lddy = -e.ry * st;
        const p = [e.c[0] + cs * lx - sn * ly, e.c[1] + sn * lx + cs * ly];
        const dx = cs * ldx - sn * ldy, dy = sn * ldx + cs * ldy;
        const ddx = cs * lddx - sn * lddy, ddy = sn * lddx + cs * lddy;
        const s2 = dx * dx + dy * dy;
        const sp = Math.sqrt(s2);
        if (s2 < 1e-12) samples.push({ p, K: [0, 0], kAbs: 0 });
        else {
          const cross = dx * ddy - dy * ddx, f = cross / (s2 * s2);
          samples.push({ p, K: [-dy * f, dx * f], kAbs: Math.abs(cross / (s2 * sp)) });
        }
      }
      return { closed, samples };
    }
    return null;
  }

  // ---------- Aufbau des Gleichungssystems ----------
  function build(ents, V, opts = {}) {
    const x = [], idx = new Map(), owner = [];
    const byId = new Map(ents.map((e) => [e.id, e]));
    for (const e of ents) {
      const ks = varsOf(e); if (!ks) continue;
      const m = {};
      for (const k of ks) { m[k] = x.length; owner.push(e.id); x.push(getK(e, k)); }
      idx.set(e.id, m);
    }
    const I = (e, k) => idx.get(e)[k];
    // Punkt-Zugriff: Abhängigkeiten + Rechenvorschrift
    function point(ref) {
      if (!ref) return null;
      if (ref.at) { const p = ref.at.slice(); return { deps: [], get: () => p }; }
      if (ref.e === 'origin') return { deps: [], get: () => [0, 0] };
      const e = byId.get(ref.e); if (!e) return null;
      const p = ref.p || 'c';
      const two = (k) => { const i = I(e.id, k + '0'), j = I(e.id, k + '1'); return { deps: [i, j], get: (X) => [X[i], X[j]] }; };
      if (e.type === 'spline') {
        const n = e.pts.length;
        if (/^h\d+$/.test(p)) {
          const i = +p.slice(1);
          const p0 = I(e.id, 'p' + i + '_0'), p1 = I(e.id, 'p' + i + '_1');
          const h0 = I(e.id, 'h' + i + '_0'), h1 = I(e.id, 'h' + i + '_1');
          if (p0 == null || p1 == null || h0 == null || h1 == null) return null;
          return { deps: [p0, p1, h0, h1], get: (X) => [X[p0] + X[h0], X[p1] + X[h1]] };
        }
        const i = p === 'a' ? 0 : p === 'b' ? n - 1 : /^p\d+$/.test(p) ? +p.slice(1) : -1;
        if (i < 0 || i >= n) return null;
        const a = I(e.id, 'p' + i + '_0'), b = I(e.id, 'p' + i + '_1');
        return { deps: [a, b], get: (X) => [X[a], X[b]] };
      }
      if (e.type === 'line' || e.type === 'slot' || e.type === 'conic') { if (p === 'a' || p === 'b' || (e.type === 'conic' && p === 'm')) return two(p); if (p === 'mid' || p === 'c') { const A = two('a'), B = two('b'); return { deps: [...A.deps, ...B.deps], get: (X) => { const a = A.get(X), b = B.get(X); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; } }; } }
      if (e.type === 'bridge') {
        if (p === 'a' && e.refA) return point(e.refA);
        if (p === 'b' && e.refB) return point(e.refB);
        return null;
      }
      if (e.type === 'arc') {
        if (p === 'a' || p === 'b') return two(p);
        const ks = ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'].map((k) => I(e.id, k));
        return { deps: ks, get: (X) => { const c = circum(X[ks[0]], X[ks[1]], X[ks[2]], X[ks[3]], X[ks[4]], X[ks[5]]); return [c[0], c[1]]; } };
      }
      if (e.type === 'ellipse' && p === 'c') return two('c');
      if (e.type === 'ellarc') {
        if (p === 'c') return two('c');
        if (p === 'a' || p === 'b') {
          const c0 = I(e.id, 'c0'), c1 = I(e.id, 'c1'), rx = I(e.id, 'rx'), ry = I(e.id, 'ry'), ak = I(e.id, p === 'a' ? 'a0' : 'a1');
          const rot = e.rot || 0;
          return { deps: [c0, c1, rx, ry, ak], get: (X) => SK.ellArcPt([X[c0], X[c1]], X[rx], X[ry], rot, X[ak]) };
        }
      }
      if (e.type === 'text' || e.type === 'point') return two('a');
      if (e.type === 'circle' || e.type === 'poly') {
        if (p === 'c') return two('c');
        if (e.type === 'poly' && p[0] === 'v') {
          const n = Math.max(3, Math.round(e.n || 6)), k = +p.slice(1), t = (e.rot || 0) + (k / n) * TAU + Math.PI / 2;
          const i = I(e.id, 'c0'), j = I(e.id, 'c1'), r = I(e.id, 'r');
          return { deps: [i, j, r], get: (X) => [X[i] + Math.cos(t) * X[r], X[j] + Math.sin(t) * X[r]] };
        }
      }
      if (e.type === 'rect') {
        const a0 = I(e.id, 'a0'), a1 = I(e.id, 'a1'), b0 = I(e.id, 'b0'), b1 = I(e.id, 'b1');
        const map = { a: [a0, a1], k0: [a0, a1], k1: [b0, a1], b: [b0, b1], k2: [b0, b1], k3: [a0, b1] };
        if (map[p]) { const [i, j] = map[p]; return { deps: [i, j], get: (X) => [X[i], X[j]] }; }
        if (p === 'c') return { deps: [a0, a1, b0, b1], get: (X) => [(X[a0] + X[b0]) / 2, (X[a1] + X[b1]) / 2] };
      }
      return null;
    }
    // Linien-Zugriff: Linie, Achse eines Langlochs, Kante eines Rechtecks, Spline-Griff
    function line(ref) {
      if (!ref) return null;
      const e = byId.get(ref.e); if (!e) return null;
      if (e.type === 'line' || e.type === 'slot') return [point({ e: e.id, p: 'a' }), point({ e: e.id, p: 'b' })];
      if (e.type === 'spline' && ref.handle != null) {
        const A = point({ e: e.id, p: 'p' + ref.handle }), B = point({ e: e.id, p: 'h' + ref.handle });
        return A && B ? [A, B] : null;
      }
      if (e.type === 'rect' && ref.edge != null) { const i = ((ref.edge % 4) + 4) % 4; return [point({ e: e.id, p: 'k' + i }), point({ e: e.id, p: 'k' + ((i + 1) % 4) })]; }
      if (e.type === 'poly' && ref.edge != null) { const n = Math.max(3, Math.round(e.n || 6)), i = ((ref.edge % n) + n) % n; return [point({ e: e.id, p: 'v' + i }), point({ e: e.id, p: 'v' + ((i + 1) % n) })]; }
      return null;
    }
    // Kreis-Zugriff: Mittelpunkt + Radius
    function circle(ref) {
      if (!ref) return null;
      const e = byId.get(ref.e); if (!e) return null;
      if (e.type === 'circle') { const c = point({ e: e.id, p: 'c' }), r = I(e.id, 'r'); return { deps: [...c.deps, r], c: c.get, r: (X) => X[r] }; }
      if (e.type === 'arc') {
        const ks = ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'].map((k) => I(e.id, k));
        const cc = (X) => circum(X[ks[0]], X[ks[1]], X[ks[2]], X[ks[3]], X[ks[4]], X[ks[5]]);
        return { deps: ks, c: (X) => { const c = cc(X); return [c[0], c[1]]; }, r: (X) => cc(X)[2] };
      }
      if (e.type === 'poly' || e.type === 'slot') { const c = point({ e: e.id, p: e.type === 'poly' ? 'c' : 'a' }), r = I(e.id, 'r'); return { deps: [...c.deps, r], c: c.get, r: (X) => X[r] }; }
      return null;
    }
    // Kurven-Endzustand (Punkt, Tangente in die Kurve, Krümmungsvektor K) für G2-Regeln
    function curveEnd(ref) {
      if (!ref) return null;
      const e = byId.get(ref.e); if (!e) return null;
      const end = ref.p === 'b' ? 'b' : 'a';
      if (e.type === 'spline' && !e.closed) {
        const n = (e.pts || []).length;
        if (n < 2) return null;
        if (n === 2) {
          const ks = ['p0_0', 'p0_1', 'p1_0', 'p1_1'].map((k) => I(e.id, k));
          return { deps: ks, get: (X) => lineEndStateFromPts([X[ks[0]], X[ks[1]]], [X[ks[2]], X[ks[3]]], end) };
        }
        const idxs = end === 'a' ? [0, 1, 2] : [n - 3, n - 2, n - 1];
        const ks = idxs.flatMap((i) => [I(e.id, 'p' + i + '_0'), I(e.id, 'p' + i + '_1')]);
        return {
          deps: ks,
          get: (X) => {
            const pA = [X[ks[0]], X[ks[1]]], pB = [X[ks[2]], X[ks[3]]], pC = [X[ks[4]], X[ks[5]]];
            if (end === 'a') {
              const q0 = [2 * pA[0] - pB[0], 2 * pA[1] - pB[1]];
              const s = crSeg(q0, pA, pB, pC);
              const d = bezDeriv(s.a, s.c1, s.c2, s.b, 0);
              return { p: d.p, t: d.tan, K: d.K };
            }
            const q3 = [2 * pC[0] - pB[0], 2 * pC[1] - pB[1]];
            const s = crSeg(pA, pB, pC, q3);
            const d = bezDeriv(s.a, s.c1, s.c2, s.b, 1);
            return { p: d.p, t: [-d.tan[0], -d.tan[1]], K: d.K };
          },
        };
      }
      if (e.type === 'arc') {
        const ks = ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'].map((k) => I(e.id, k));
        return { deps: ks, get: (X) => arcEndStateFromPts([X[ks[0]], X[ks[1]]], [X[ks[4]], X[ks[5]]], [X[ks[2]], X[ks[3]]], end) };
      }
      if (e.type === 'line' || (e.type === 'rect' && ref.edge != null)) {
        const Ln = line(ref); if (!Ln) return null;
        return { deps: [...Ln[0].deps, ...Ln[1].deps], get: (X) => lineEndStateFromPts(Ln[0].get(X), Ln[1].get(X), end) };
      }
      if (e.type === 'ellarc') {
        const ks = ['c0', 'c1', 'rx', 'ry', 'a0', 'a1'].map((k) => I(e.id, k));
        const rot = e.rot || 0, ccw = e.ccw !== false;
        return { deps: ks, get: (X) => ellArcEndStateFromVals([X[ks[0]], X[ks[1]]], X[ks[2]], X[ks[3]], rot, X[ks[4]], X[ks[5]], ccw, end) };
      }
      return null;
    }
    const eqs = [];
    const uniq = (a) => [...new Set(a)];
    const add = (deps, f, tag, w = 1) => eqs.push({ deps: uniq(deps), f, tag, w });
    const L = (X, P) => { const a = P[0].get(X), b = P[1].get(X); return [b[0] - a[0], b[1] - a[1], a, b]; };

    // Bögen: Hilfspunkt m liegt immer in der Bogenmitte (sonst wäre er eine Schein-Freiheit)
    for (const e of ents) if (e.type === 'arc') {
      const [a0, a1, b0, b1, m0, m1] = ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'].map((k) => I(e.id, k));
      add([a0, a1, b0, b1, m0, m1], (X) => hyp(X[m0] - X[a0], X[m1] - X[a1]) - hyp(X[m0] - X[b0], X[m1] - X[b1]), { internal: true });
    }
    // Punkte, die genau aufeinanderliegen, bleiben verbunden (so bleiben Umrisse geschlossen)
    if (!opts.noJoin) {
      const groups = new Map();
      const put = (ref, e) => { const P = point(ref); if (!P) return; const k = qk(P.get(x)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(P); };
      groups.set(qk([0, 0]), [point({ e: 'origin' })]);
      for (const e of ents) {
        if (e.type === 'line' || e.type === 'arc' || e.type === 'ellarc' || e.type === 'conic' || e.type === 'slot' || (e.type === 'spline' && !e.closed)) { put({ e: e.id, p: 'a' }); put({ e: e.id, p: 'b' }); }
        else if (e.type === 'rect') for (let i = 0; i < 4; i++) put({ e: e.id, p: 'k' + i });
        else if (e.type === 'circle' || e.type === 'ellipse') put({ e: e.id, p: 'c' });
        else if (e.type === 'text' || e.type === 'point') put({ e: e.id, p: 'a' });
        else if (e.type === 'poly') { put({ e: e.id, p: 'c' }); }
      }
      for (const g of groups.values()) for (let i = 1; i < g.length; i++) {
        const A = g[0], B = g[i];
        if (!A.deps.length && !B.deps.length) continue;
        add([...A.deps, ...B.deps], (X) => B.get(X)[0] - A.get(X)[0], { join: true });
        add([...A.deps, ...B.deps], (X) => B.get(X)[1] - A.get(X)[1], { join: true });
      }
    }
    // ---------- Maße ----------
    const badDims = [];
    for (const dm of opts.dims || []) {
      if (dm.ref) continue;   // Maß nur zum Ablesen: zeigt an, legt nichts fest
      const v = Model.num(dm.v, V || {}, NaN);
      if (!isFinite(v)) { badDims.push(dm.id); continue; }
      const tag = { dim: dm.id };
      const k = dm.k;
      if (dm.refs) {
        if (k === 'dist') { const A = point(dm.refs[0]), B = point(dm.refs[1]); if (!A || !B) continue; add([...A.deps, ...B.deps], (X) => { const a = A.get(X), b = B.get(X); return hyp(b[0] - a[0], b[1] - a[1]) - v; }, tag); }
        else if (k === 'distPL') { const P = point(dm.refs[0]), Ln = line(dm.refs[1]); if (!P || !Ln) continue; add([...P.deps, ...Ln[0].deps, ...Ln[1].deps], (X) => { const p = P.get(X); const [dx, dy, a] = L(X, Ln); return Math.abs(((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / (hyp(dx, dy) + EPS)) - v; }, tag); }
        else if (k === 'angLL') { const A = line(dm.refs[0]), B = line(dm.refs[1]); if (!A || !B) continue; add([...A[0].deps, ...A[1].deps, ...B[0].deps, ...B[1].deps], (X) => { const [ux, uy] = L(X, A), [vx, vy] = L(X, B); return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) - (v * Math.PI) / 180) * 10; }, tag); }
        else if (k === 'ang3') {
          const A = point(dm.refs[0]), Vp = point(dm.refs[1]), B = point(dm.refs[2]);
          if (!A || !Vp || !B) continue;
          add([...A.deps, ...Vp.deps, ...B.deps], (X) => {
            const a = A.get(X), v0 = Vp.get(X), b = B.get(X);
            const ux = a[0] - v0[0], uy = a[1] - v0[1], wx = b[0] - v0[0], wy = b[1] - v0[1];
            return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) - (v * Math.PI) / 180) * 10;
          }, tag);
        } else if (k === 'ord') {
          const P = point(dm.refs[0]);
          const Ln = line(dm.refs[1]);
          const sg = dm.sg === -1 ? -1 : 1;
          if (P && Ln) {
            add([...P.deps, ...Ln[0].deps, ...Ln[1].deps], (X) => {
              const p = P.get(X);
              const [dx, dy, a] = L(X, Ln);
              return (sg * (-(p[0] - a[0]) * dy + (p[1] - a[1]) * dx) / (hyp(dx, dy) + EPS)) - v;
            }, tag);
          } else {
            const O = point(dm.refs[1]);
            if (!P || !O) continue;
            const ax = dm.axis === 'y' ? 1 : 0;
            add([...P.deps, ...O.deps], (X) => sg * (P.get(X)[ax] - O.get(X)[ax]) - v, tag);
          }
        } else if (k === 'distCC') {
          const A = circle(dm.refs[0]), B = circle(dm.refs[1]);
          if (!A || !B) continue;
          const cm = dm.cm || 'center';
          const sgn = cm === 'min' ? -1 : cm === 'max' ? 1 : 0;
          add([...A.deps, ...B.deps], (X) => {
            const a = A.c(X), b = B.c(X);
            const d = hyp(b[0] - a[0], b[1] - a[1]);
            return (sgn ? d + sgn * (A.r(X) + B.r(X)) : d) - v;
          }, tag);
        }
        continue;
      }
      const e = byId.get(dm.e); if (!e || !idx.has(e.id)) continue;
      const J = idx.get(e.id);
      if (k === 'n') continue;   // Eckenzahl ist keine Lage, sie wird direkt gesetzt
      if (k === 'len') add([J.a0, J.a1, J.b0, J.b1], (X) => hyp(X[J.b0] - X[J.a0], X[J.b1] - X[J.a1]) - v, tag);
      else if (k === 'ang') add([J.a0, J.a1, J.b0, J.b1], (X) => wrap(Math.atan2(X[J.b1] - X[J.a1], X[J.b0] - X[J.a0]) - (v * Math.PI) / 180) * Math.max(1, hyp(X[J.b0] - X[J.a0], X[J.b1] - X[J.a1])), tag);
      else if (k === 'w' && e.type === 'slot') add([J.r], (X) => 2 * X[J.r] - v, tag);
      else if (k === 'w' && e.type === 'ellipse') add([J.rx], (X) => 2 * X[J.rx] - v, tag);
      else if (k === 'h' && e.type === 'ellipse') add([J.ry], (X) => 2 * X[J.ry] - v, tag);
      else if (k === 'rx' && e.type === 'ellarc') add([J.rx], (X) => X[J.rx] - v, tag);
      else if (k === 'ry' && e.type === 'ellarc') add([J.ry], (X) => X[J.ry] - v, tag);
      else if (k === 'h' && e.type === 'text') add([J.h], (X) => X[J.h] - v, tag);
      else if (k === 'w') { const s = x[J.b0] >= x[J.a0] ? 1 : -1; add([J.a0, J.b0], (X) => (X[J.b0] - X[J.a0]) * s - v, tag); }
      else if (k === 'h') { const s = x[J.b1] >= x[J.a1] ? 1 : -1; add([J.a1, J.b1], (X) => (X[J.b1] - X[J.a1]) * s - v, tag); }
      else if (k === 'd') add([J.r], (X) => 2 * X[J.r] - v, tag);
      else if (k === 'r') { const C = circle({ e: e.id }); if (C) add(C.deps, (X) => C.r(X) - v, tag); }
      else if (k === 'arcLen' && e.type === 'arc') {
        const ks = ['a0', 'a1', 'b0', 'b1', 'm0', 'm1'].map((q) => I(e.id, q));
        add(ks, (X) => arcLen(X[ks[0]], X[ks[1]], X[ks[2]], X[ks[3]], X[ks[4]], X[ks[5]]) - v, tag);
      }
      else if (k === 'x' || k === 'y') { const key = e.type === 'spline' ? 'p0_' + (k === 'x' ? '0' : '1') : (e.type === 'circle' || e.type === 'poly' || e.type === 'ellipse' || e.type === 'ellarc' ? 'c' : 'a') + (k === 'x' ? '0' : '1'); const i = J[key]; add([i], (X) => X[i] - v, tag); }
      else if (e.type === 'spline') {
        const hmAng = /^hAng(\d+)$/.exec(k), hmLen = /^hLen(\d+)$/.exec(k);
        if (hmAng) {
          const hi = +hmAng[1], h0 = J['h' + hi + '_0'], h1 = J['h' + hi + '_1'];
          if (h0 != null && h1 != null) add([h0, h1], (X) => wrap(Math.atan2(X[h1], X[h0]) - (v * Math.PI) / 180) * Math.max(1, hyp(X[h0], X[h1])), tag);
        } else if (hmLen) {
          const hi = +hmLen[1], h0 = J['h' + hi + '_0'], h1 = J['h' + hi + '_1'];
          if (h0 != null && h1 != null) add([h0, h1], (X) => hyp(X[h0], X[h1]) - v, tag);
        }
      }
    }
    // ---------- Bedingungen ----------
    for (const c of opts.cons || []) {
      const tag = { con: c.id };
      const R = c.refs || [];
      const t = c.type;
      if (t === 'horizontal' || t === 'vertical') {
        const k = t === 'horizontal' ? 1 : 0;
        let A, B;
        if (R.length === 1) { const Ln = line(R[0]); if (!Ln) continue; [A, B] = Ln; } else { A = point(R[0]); B = point(R[1]); }
        if (!A || !B) continue;
        add([...A.deps, ...B.deps], (X) => B.get(X)[k] - A.get(X)[k], tag);
      } else if (t === 'parallel' || t === 'perpendicular') {
        const A = line(R[0]), B = line(R[1]); if (!A || !B) continue;
        add([...A[0].deps, ...A[1].deps, ...B[0].deps, ...B[1].deps], (X) => {
          const [ux, uy] = L(X, A), [vx, vy] = L(X, B); const n = hyp(ux, uy) * hyp(vx, vy) + EPS;
          return (t === 'parallel' ? (ux * vy - uy * vx) : (ux * vx + uy * vy)) / n * 10;
        }, tag);
      } else if (t === 'collinear') {
        // beide Enden der zweiten Linie liegen auf der Geraden durch die erste
        const A = line(R[0]), B = line(R[1]); if (!A || !B) continue;
        for (const Q of B) add([...A[0].deps, ...A[1].deps, ...Q.deps], (X) => { const [dx, dy, a] = L(X, A); const q = Q.get(X); return ((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / (hyp(dx, dy) + EPS); }, tag);
      } else if (t === 'equal') {
        // { e, k: 'r' } meint den Radius (auch bei Vieleck und Langloch), sonst Länge bzw. Größe
        const rad = R[0] && R[1] && (R[0].k === 'r' || R[1].k === 'r');
        const A = rad ? null : line(R[0]), B = rad ? null : line(R[1]);
        if (A && B) add([...A[0].deps, ...A[1].deps, ...B[0].deps, ...B[1].deps], (X) => { const [ux, uy] = L(X, A), [vx, vy] = L(X, B); return hyp(ux, uy) - hyp(vx, vy); }, tag);
        else { const C = circle(R[0]), D = circle(R[1]); if (C && D) add([...C.deps, ...D.deps], (X) => C.r(X) - D.r(X), tag); }
      } else if (t === 'tangent') {
        let Ln = line(R[0]), C = circle(R[1]);
        if (!Ln || !C) { Ln = line(R[1]); C = circle(R[0]); }
        if (Ln && C) add([...Ln[0].deps, ...Ln[1].deps, ...C.deps], (X) => { const [dx, dy, a] = L(X, Ln); const c = C.c(X); return Math.abs(((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / (hyp(dx, dy) + EPS)) - C.r(X); }, tag);
        else {
          const A = circle(R[0]), B = circle(R[1]); if (!A || !B) continue;
          const inner = c.mode === 'int';
          add([...A.deps, ...B.deps], (X) => { const a = A.c(X), b = B.c(X); const d = hyp(b[0] - a[0], b[1] - a[1]); return inner ? d - Math.abs(A.r(X) - B.r(X)) : d - (A.r(X) + B.r(X)); }, tag);
        }
      } else if (t === 'curvature') {
        const r0 = R[0], r1 = R[1];
        const e0 = r0 && byId.get(r0.e), e1 = r1 && byId.get(r1.e);
        if (!e0 || !e1) continue;
        if (e0.type === 'circle' || e1.type === 'circle') {
          const rC = e0.type === 'circle' ? r0 : r1, rS = e0.type === 'circle' ? r1 : r0;
          const C = circle(rC);
          if (!C) continue;
          let endS = rS.p === 'a' || rS.p === 'b' ? rS.p : null;
          if (!endS) {
            const c0 = C.c(x), cr = C.r(x);
            const sa = curveEnd({ ...rS, p: 'a' }), sb = curveEnd({ ...rS, p: 'b' });
            if (!sa || !sb) continue;
            const pa = sa.get(x).p, pb = sb.get(x).p;
            endS = Math.abs(hyp(pa[0] - c0[0], pa[1] - c0[1]) - cr) <= Math.abs(hyp(pb[0] - c0[0], pb[1] - c0[1]) - cr) ? 'a' : 'b';
          }
          const Se = curveEnd({ ...rS, p: endS });
          if (!Se) continue;
          const deps = [...Se.deps, ...C.deps];
          add(deps, (X) => { const s = Se.get(X), cc = C.c(X); return hyp(s.p[0] - cc[0], s.p[1] - cc[1]) - C.r(X); }, tag);
          add(deps, (X) => { const s = Se.get(X), cc = C.c(X), d = hyp(s.p[0] - cc[0], s.p[1] - cc[1]) || 1; const ux = (s.p[0] - cc[0]) / d, uy = (s.p[1] - cc[1]) / d; return (s.t[0] * ux + s.t[1] * uy) * 10; }, tag);
          add(deps, (X) => { const s = Se.get(X), cc = C.c(X), d = hyp(s.p[0] - cc[0], s.p[1] - cc[1]) || 1; const ux = (s.p[0] - cc[0]) / d, uy = (s.p[1] - cc[1]) / d; const r = Math.max(C.r(X), 1e-6); return ((s.K[0] * -ux + s.K[1] * -uy) - 1 / r) * 50; }, tag);
        } else {
          let end0 = r0.p === 'a' || r0.p === 'b' ? r0.p : null;
          let end1 = r1.p === 'a' || r1.p === 'b' ? r1.p : null;
          if (!end0 || !end1) {
            let best = null, bd = Infinity;
            for (const p0 of end0 ? [end0] : ['a', 'b']) {
              const s0 = curveEnd({ ...r0, p: p0 }); if (!s0) continue;
              const q0 = s0.get(x).p;
              for (const p1 of end1 ? [end1] : ['a', 'b']) {
                const s1 = curveEnd({ ...r1, p: p1 }); if (!s1) continue;
                const q1 = s1.get(x).p, dd = hyp(q1[0] - q0[0], q1[1] - q0[1]);
                if (dd < bd) { bd = dd; best = [p0, p1]; }
              }
            }
            if (!best) continue;
            [end0, end1] = best;
          }
          const A = curveEnd({ ...r0, p: end0 }), B = curveEnd({ ...r1, p: end1 });
          if (!A || !B) continue;
          const deps = [...A.deps, ...B.deps];
          add(deps, (X) => B.get(X).p[0] - A.get(X).p[0], tag);
          add(deps, (X) => B.get(X).p[1] - A.get(X).p[1], tag);
          add(deps, (X) => { const a = A.get(X), b = B.get(X); const dx = -a.t[0], dy = -a.t[1]; return Math.atan2(dx * b.t[1] - dy * b.t[0], dx * b.t[0] + dy * b.t[1]) * 10; }, tag);
          add(deps, (X) => { const a = A.get(X), b = B.get(X); const nx = a.t[1], ny = -a.t[0]; return ((b.K[0] - a.K[0]) * nx + (b.K[1] - a.K[1]) * ny) * 50; }, tag);
        }
      } else if (t === 'coincident') {
        const A = point(R[0]);
        const Bp = R[1] && (R[1].p || R[1].at || R[1].e === 'origin') ? point(R[1]) : null;
        if (A && Bp) { add([...A.deps, ...Bp.deps], (X) => Bp.get(X)[0] - A.get(X)[0], tag); add([...A.deps, ...Bp.deps], (X) => Bp.get(X)[1] - A.get(X)[1], tag); continue; }
        const Ln = line(R[1]);
        if (A && Ln) { add([...A.deps, ...Ln[0].deps, ...Ln[1].deps], (X) => { const p = A.get(X); const [dx, dy, a] = L(X, Ln); return ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / (hyp(dx, dy) + EPS); }, tag); continue; }
        const C = circle(R[1]);
        if (A && C) add([...A.deps, ...C.deps], (X) => { const p = A.get(X), cc = C.c(X); return hyp(p[0] - cc[0], p[1] - cc[1]) - C.r(X); }, tag);
      } else if (t === 'concentric') {
        const A = point({ e: (R[0] || {}).e, p: 'c' }), B = point({ e: (R[1] || {}).e, p: 'c' }); if (!A || !B) continue;
        for (const k of [0, 1]) add([...A.deps, ...B.deps], (X) => B.get(X)[k] - A.get(X)[k], tag);
      } else if (t === 'midpoint') {
        const A = point(R[0]), Ln = R.length === 3 ? [point(R[1]), point(R[2])] : line(R[1]); if (!A || !Ln || !Ln[0] || !Ln[1]) continue;
        for (const k of [0, 1]) add([...A.deps, ...Ln[0].deps, ...Ln[1].deps], (X) => (Ln[0].get(X)[k] + Ln[1].get(X)[k]) / 2 - A.get(X)[k], tag);
      } else if (t === 'symmetric') {
        const A = point(R[0]), B = point(R[1]), Ln = line(R[2]); if (!A || !B || !Ln) continue;
        const deps = [...A.deps, ...B.deps, ...Ln[0].deps, ...Ln[1].deps];
        add(deps, (X) => { const a = A.get(X), b = B.get(X); const [dx, dy, p] = L(X, Ln); const mx = (a[0] + b[0]) / 2 - p[0], my = (a[1] + b[1]) / 2 - p[1]; return (mx * dy - my * dx) / (hyp(dx, dy) + EPS); }, tag);
        add(deps, (X) => { const a = A.get(X), b = B.get(X); const [dx, dy] = L(X, Ln); return ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (hyp(dx, dy) + EPS); }, tag);
      } else if (t === 'xform') {
        // Muster: Kopien hängen an ihrem Original. Verschieben um (dx, dy) oder Drehen um einen Mittelpunkt.
        // refs = [Original-Punkt, Kopie-Punkt, Original-Punkt, Kopie-Punkt, …] · req = [Original, Kopie, …] für gleiche Radien
        const num = (x) => Model.num(x, V || {}, 0);
        const dx = num(c.dx), dy = num(c.dy), th = (num(c.ang) * Math.PI) / 180;
        const C0 = c.mode === 'rot' ? point(c.center) : null;
        if (c.mode === 'rot' && !C0) continue;
        const cs = Math.cos(th), sn = Math.sin(th);
        for (let i = 0; i + 1 < R.length; i += 2) {
          const A = point(R[i]), B = point(R[i + 1]); if (!A || !B) continue;
          const deps = [...A.deps, ...B.deps, ...(C0 ? C0.deps : [])];
          if (C0) {
            add(deps, (X) => { const a = A.get(X), b = B.get(X), o = C0.get(X); return b[0] - (o[0] + cs * (a[0] - o[0]) - sn * (a[1] - o[1])); }, tag);
            add(deps, (X) => { const a = A.get(X), b = B.get(X), o = C0.get(X); return b[1] - (o[1] + sn * (a[0] - o[0]) + cs * (a[1] - o[1])); }, tag);
          } else {
            add(deps, (X) => B.get(X)[0] - A.get(X)[0] - dx, tag);
            add(deps, (X) => B.get(X)[1] - A.get(X)[1] - dy, tag);
          }
        }
        const Q = c.req || [];
        for (let i = 0; i + 1 < Q.length; i += 2) { const C1 = circle(Q[i]), D1 = circle(Q[i + 1]); if (C1 && D1) add([...C1.deps, ...D1.deps], (X) => D1.r(X) - C1.r(X), tag); }
      } else if (t === 'offset') {
        // Versatz: die Kopie liegt im Abstand v neben dem Original (sg = +1 links bzw. größer, −1 rechts bzw. kleiner)
        const eS = byId.get((R[0] || {}).e), eN = byId.get((R[1] || {}).e); if (!eS || !eN) continue;
        const v = Model.num(c.v, V || {}, NaN); if (!isFinite(v)) continue;
        const sg = c.sg || 1;
        if (c.corner) {
          const D1 = circle(R[1]); if (!D1) continue;
          add(D1.deps, (X) => D1.r(X) - Math.abs(v), tag);
        } else if (eS.type === 'rect' && eN.type === 'rect' && R[0].edge == null) {
          const sgs = c.sgs || [-1, -1, 1, 1];
          [['a0', 0], ['a1', 1], ['b0', 2], ['b1', 3]].forEach(([k, i]) => { const s = idx.get(eS.id)[k], n = idx.get(eN.id)[k]; add([s, n], (X) => X[n] - X[s] - sgs[i] * v, tag); });
        } else if (eS.type === 'slot' && eN.type === 'slot') {
          for (const p of ['a', 'b']) { const A = point({ e: eS.id, p }), B = point({ e: eN.id, p }); add([...A.deps, ...B.deps], (X) => B.get(X)[0] - A.get(X)[0], tag); add([...A.deps, ...B.deps], (X) => B.get(X)[1] - A.get(X)[1], tag); }
          const C1 = circle({ e: eS.id }), D1 = circle({ e: eN.id }); add([...C1.deps, ...D1.deps], (X) => D1.r(X) - C1.r(X) - sg * v, tag);
        } else if (eS.type === 'poly' && eN.type === 'poly') {
          const A = point({ e: eS.id, p: 'c' }), B = point({ e: eN.id, p: 'c' }), C1 = circle({ e: eS.id }), D1 = circle({ e: eN.id });
          const k = Math.cos(Math.PI / Math.max(3, Math.round(eN.n || 6)));
          add([...A.deps, ...B.deps], (X) => B.get(X)[0] - A.get(X)[0], tag); add([...A.deps, ...B.deps], (X) => B.get(X)[1] - A.get(X)[1], tag);
          add([...C1.deps, ...D1.deps], (X) => (D1.r(X) - C1.r(X)) * k - sg * v, tag);
        } else {
          const LS = line(R[0]), LN = line(R[1]);
          if (LS && LN) {
            const deps = [...LS[0].deps, ...LS[1].deps, ...LN[0].deps, ...LN[1].deps];
            add(deps, (X) => { const [ux, uy] = L(X, LS), [wx, wy] = L(X, LN); return ((ux * wy - uy * wx) / (hyp(ux, uy) * hyp(wx, wy) + EPS)) * 10; }, tag);
            add(deps, (X) => { const [dx, dy, a] = L(X, LS); const p = LN[0].get(X); return (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / (hyp(dx, dy) + EPS) - sg * v; }, tag);
          } else {
            const C1 = circle(R[0]), D1 = circle(R[1]); if (!C1 || !D1) continue;
            const deps = [...C1.deps, ...D1.deps];
            add(deps, (X) => D1.c(X)[0] - C1.c(X)[0], tag); add(deps, (X) => D1.c(X)[1] - C1.c(X)[1], tag);
            add(deps, (X) => D1.r(X) - C1.r(X) - sg * v, tag);
          }
        }
      } else if (t === 'fix') {
        const r0 = R[0]; if (!r0) continue;
        if (r0.p) { const A = point(r0); if (!A || !c.at) continue; add(A.deps, (X) => A.get(X)[0] - c.at[0], tag); add(A.deps, (X) => A.get(X)[1] - c.at[1], tag); }
        else if (idx.has(r0.e) && c.at) { const J = idx.get(r0.e); for (const k in c.at) if (J[k] != null) { const i = J[k], v = c.at[k]; add([i], (X) => X[i] - v, tag); } }
      }
    }
    return { x, idx, owner, eqs, point, badDims };
  }

  // ---------- Rechnen ----------
  function residuals(sys, X) { return sys.eqs.map((q) => q.f(X) * q.w); }
  // Ableitungen numerisch; central = genauer (für die Beweglichkeits-Analyse)
  function jacobian(sys, X, active, central) {
    const m = sys.eqs.length; const J = [];
    for (let i = 0; i < m; i++) {
      const q = sys.eqs[i]; const row = new Map(); const f0 = central ? 0 : q.f(X) * q.w;
      for (const j of q.deps) {
        if (!active[j]) continue;
        const o = X[j];
        let d;
        if (central) { const h = 1e-5 * (1 + Math.abs(o)); X[j] = o + h; const f1 = q.f(X); X[j] = o - h; const f2 = q.f(X); d = ((f1 - f2) / (2 * h)) * q.w; }
        else { const h = 1e-7 * (1 + Math.abs(o)); X[j] = o + h; d = (q.f(X) * q.w - f0) / h; }
        X[j] = o;
        if (Math.abs(d) > 1e-12 && isFinite(d)) row.set(j, d);
      }
      J.push(row);
    }
    return J;
  }
  // löst A·y = b (dicht, mit Pivotsuche); A wird verändert
  function linsolve(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-300) continue;
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const y = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * y[k]; y[r] = Math.abs(A[r][r]) > 1e-300 ? s / A[r][r] : 0; }
    return y;
  }
  function norm(r) { let s = 0; for (const v of r) s += v * v; return Math.sqrt(s); }
  function iterate(sys, X, active, maxIt = 80) {
    const cols = []; active.forEach((a, j) => { if (a) cols.push(j); });
    let r = residuals(sys, X), err = norm(r), lam = 1e-6;
    for (let it = 0; it < maxIt && err > 1e-10; it++) {
      const J = jacobian(sys, X, active);
      const m = J.length, n = cols.length; if (!n) break;
      let dx;
      if (m <= n) {
        // kleinster Schritt: dx = -Jᵀ (J Jᵀ + λI)⁻¹ r
        const A = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let i = 0; i < m; i++) for (let k = i; k < m; k++) { let s = 0; for (const [j, v] of J[i]) { const w = J[k].get(j); if (w) s += v * w; } A[i][k] = s; A[k][i] = s; }
        for (let i = 0; i < m; i++) A[i][i] += lam;
        const y = linsolve(A, r.slice());
        dx = new Map(); for (let i = 0; i < m; i++) for (const [j, v] of J[i]) dx.set(j, (dx.get(j) || 0) - v * y[i]);
      } else {
        const ci = new Map(cols.map((j, t) => [j, t]));
        const A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
        for (let i = 0; i < m; i++) { const row = [...J[i]]; for (const [j, v] of row) { const a = ci.get(j); g[a] -= v * r[i]; for (const [k, w] of row) A[a][ci.get(k)] += v * w; } }
        for (let t = 0; t < n; t++) A[t][t] += lam * (1 + A[t][t]);
        const s = linsolve(A, g);
        dx = new Map(cols.map((j, t) => [j, s[t]]));
      }
      const Xn = X.slice(); for (const [j, v] of dx) Xn[j] += v;
      const rn = residuals(sys, Xn), en = norm(rn);
      if (isFinite(en) && en < err) { for (let j = 0; j < X.length; j++) X[j] = Xn[j]; r = rn; err = en; lam = Math.max(lam / 10, 1e-12); }
      else { lam *= 10; if (lam > 1e10) break; }
    }
    return err;
  }

  // ---------- Was ist noch beweglich? (Rang des Gleichungssystems) ----------
  function analyze(sys, X, ents) {
    const n = X.length; const active = new Array(n).fill(true);
    const eqs = sys.eqs.filter((q) => !(q.tag && q.tag.pull));
    const J = jacobian({ eqs }, X, active, true);
    const M = J.map((row) => { const a = new Array(n).fill(0); for (const [j, v] of row) a[j] = v; return a; });
    let rank = 0; const pivCol = [];
    const scale = Math.max(1e-12, ...M.map((r) => Math.max(0, ...r.map(Math.abs))));
    const tol = 1e-8 * scale;
    for (let c = 0; c < n && rank < M.length; c++) {
      let p = rank; for (let r = rank + 1; r < M.length; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < tol) continue;
      [M[p], M[rank]] = [M[rank], M[p]];
      const pv = M[rank][c]; for (let k = c; k < n; k++) M[rank][k] /= pv;
      for (let r = 0; r < M.length; r++) if (r !== rank && Math.abs(M[r][c]) > 0) { const f = M[r][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[rank][k]; }
      pivCol.push(c); rank++;
    }
    const isPiv = new Set(pivCol);
    const freeCols = []; for (let j = 0; j < n; j++) if (!isPiv.has(j)) freeCols.push(j);
    const loose = new Set(freeCols);
    pivCol.forEach((c, r) => { for (const f of freeCols) if (Math.abs(M[r][f]) > 1e-6) { loose.add(c); break; } });
    const freeEnts = new Set(); for (const j of loose) freeEnts.add(sys.owner[j]);
    // Nullraum-Basis für die Wackel-Bewegung einzelner freier Stellen
    const nullBasis = [];
    if (n <= 400) {
      for (const f of freeCols) {
        const v = new Array(n).fill(0);
        v[f] = 1;
        pivCol.forEach((c, r) => { if (Math.abs(M[r][f]) > 1e-9) v[c] = -M[r][f]; });
        nullBasis.push(v);
      }
    }
    // Einzelne noch bewegliche Punkte und Radien sammeln
    const freePoints = [];
    const pushPt = (eid, p, xy, vars, kind = 'point') => {
      if (vars.some((j) => j != null && loose.has(j))) freePoints.push({ eid, p, xy: xy.slice(), vars, kind });
    };
    for (const e of ents || []) {
      const m = sys.idx.get(e.id);
      if (!m) continue;
      if (e.type === 'line') {
        pushPt(e.id, 'a', e.a, [m.a0, m.a1]);
        pushPt(e.id, 'b', e.b, [m.b0, m.b1]);
      } else if (e.type === 'arc') {
        pushPt(e.id, 'a', e.a, [m.a0, m.a1]);
        pushPt(e.id, 'b', e.b, [m.b0, m.b1]);
        pushPt(e.id, 'm', e.m, [m.m0, m.m1]);
      } else if (e.type === 'slot') {
        pushPt(e.id, 'a', e.a, [m.a0, m.a1]);
        pushPt(e.id, 'b', e.b, [m.b0, m.b1]);
        if (loose.has(m.r)) {
          const L = hyp(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1;
          const nx = -(e.b[1] - e.a[1]) / L, ny = (e.b[0] - e.a[0]) / L;
          pushPt(e.id, 'r', [(e.a[0] + e.b[0]) / 2 + nx * e.r, (e.a[1] + e.b[1]) / 2 + ny * e.r], [m.r], 'radius');
        }
      } else if (e.type === 'circle' || e.type === 'poly') {
        pushPt(e.id, 'c', e.c, [m.c0, m.c1]);
        if (loose.has(m.r)) pushPt(e.id, 'r', [e.c[0] + e.r, e.c[1]], [m.r], 'radius');
      } else if (e.type === 'ellipse') {
        pushPt(e.id, 'c', e.c, [m.c0, m.c1]);
        const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
        if (loose.has(m.rx)) pushPt(e.id, 'rx', [e.c[0] + cs * e.rx, e.c[1] + sn * e.rx], [m.rx], 'radius');
        if (loose.has(m.ry)) pushPt(e.id, 'ry', [e.c[0] - sn * e.ry, e.c[1] + cs * e.ry], [m.ry], 'radius');
      } else if (e.type === 'ellarc') {
        pushPt(e.id, 'c', e.c, [m.c0, m.c1]);
        pushPt(e.id, 'a', SK.ellArcPt(e.c, e.rx, e.ry, e.rot || 0, e.a0), [m.c0, m.c1, m.rx, m.ry, m.a0]);
        pushPt(e.id, 'b', SK.ellArcPt(e.c, e.rx, e.ry, e.rot || 0, e.a1), [m.c0, m.c1, m.rx, m.ry, m.a1]);
        const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0);
        if (loose.has(m.rx)) pushPt(e.id, 'rx', [e.c[0] + cs * e.rx, e.c[1] + sn * e.rx], [m.rx], 'radius');
        if (loose.has(m.ry)) pushPt(e.id, 'ry', [e.c[0] - sn * e.ry, e.c[1] + cs * e.ry], [m.ry], 'radius');
      } else if (e.type === 'conic') {
        pushPt(e.id, 'a', e.a, [m.a0, m.a1]);
        pushPt(e.id, 'b', e.b, [m.b0, m.b1]);
        pushPt(e.id, 'm', e.m, [m.m0, m.m1]);
      } else if (e.type === 'rect') {
        pushPt(e.id, 'k0', [e.a[0], e.a[1]], [m.a0, m.a1]);
        pushPt(e.id, 'k1', [e.b[0], e.a[1]], [m.b0, m.a1]);
        pushPt(e.id, 'k2', [e.b[0], e.b[1]], [m.b0, m.b1]);
        pushPt(e.id, 'k3', [e.a[0], e.b[1]], [m.a0, m.b1]);
      } else if (e.type === 'spline') {
        (e.pts || []).forEach((q, i) => pushPt(e.id, 'p' + i, q, [m['p' + i + '_0'], m['p' + i + '_1']]));
        if (e.mode !== 'cv' && Array.isArray(e.handles)) {
          e.handles.forEach((h, i) => {
            if (!Array.isArray(h) || m['h' + i + '_0'] == null || m['h' + i + '_1'] == null) return;
            const q = e.pts[i];
            if (q) pushPt(e.id, 'h' + i, [q[0] + h[0], q[1] + h[1]], [m['h' + i + '_0'], m['h' + i + '_1']], 'handle');
          });
        }
      } else if (e.type === 'point' || e.type === 'text') {
        pushPt(e.id, 'a', e.a, [m.a0, m.a1]);
      }
    }
    for (const e of ents || []) {
      if (e.type === 'bridge' && (!e.refA || freeEnts.has(e.refA.e) || !e.refB || freeEnts.has(e.refB.e))) freeEnts.add(e.id);
    }
    return { rank, dof: n - rank, freeEnts, looseVars: loose, freePoints, nullBasis, varIdx: sys.idx };
  }

  // ---------- Öffentlich ----------
  // sketch: { ents, dims, cons } · opts: { inPlace, analyze, pins: [[eid, key, value]], noJoin }
  function solve(sketch, V, opts = {}) {
    const ents = opts.inPlace ? sketch.ents : (sketch.ents || []).map((e) => JSON.parse(JSON.stringify(e)));
    // Eckenzahl von Vielecken ist eine ganze Zahl und wird direkt gesetzt
    for (const dm of sketch.dims || []) if (dm.k === 'n' && !dm.ref) { const e = ents.find((x) => x.id === dm.e); const n = Model.num(dm.v, V || {}, NaN); if (e && isFinite(n)) e.n = clamp(Math.round(n), 3, 64); }
    const sys = build(ents, V, { dims: sketch.dims, cons: sketch.cons, noJoin: opts.noJoin });
    const X = sys.x.slice();
    const active = new Array(X.length).fill(true);
    let err;
    if (opts.pins && opts.pins.length) {
      // erst versuchen, die gezogenen Werte genau zu halten …
      const pinned = X.slice(); const act2 = active.slice();
      for (const [eid, k, v] of opts.pins) { const m = sys.idx.get(eid); if (m && m[k] != null) { pinned[m[k]] = v; act2[m[k]] = false; } }
      const e1 = iterate(sys, pinned, act2);
      if (e1 < 1e-7) { for (let j = 0; j < X.length; j++) X[j] = pinned[j]; err = e1; }
      else {
        // … sonst vom gezogenen Stand aus den nächsten Zustand suchen, der alle Regeln erfüllt
        const Y = pinned.slice();
        const e2 = iterate(sys, Y, active);
        if (e2 < 1e-7) { for (let j = 0; j < X.length; j++) X[j] = Y[j]; err = e2; } else err = iterate(sys, X, active);
      }
    } else err = iterate(sys, X, active);
    // zurückschreiben
    for (const e of ents) { const m = sys.idx.get(e.id); if (!m) continue; for (const k in m) setK(e, k, Math.round(X[m[k]] * 1e6) / 1e6); }
    // Brückenkurven nachziehen, falls sich die verknüpften Kurvenenden geändert haben
    SK.syncBridges(ents);
    // Text entlang einer Kurve folgt der Kurve, wenn sie sich durch Maße oder Regeln ändert
    for (const e of ents) if (e.type === 'text' && e.on) { const c = ents.find((x) => x.id === e.on), pts = c ? SK.textPathPts(c, e.flip) : null; if (pts) e.onP = pts; }
    const res = residuals(sys, X);
    const conflicts = new Set();
    sys.eqs.forEach((q, i) => { if (Math.abs(res[i]) > 1e-5 && q.tag) { if (q.tag.con) conflicts.add(q.tag.con); if (q.tag.dim) conflicts.add(q.tag.dim); } });
    const out = { ents, ok: err < 1e-6, err, badDims: sys.badDims, conflicts };
    if (opts.analyze) Object.assign(out, analyze(sys, X, ents), { nVars: X.length });
    ents.badDims = sys.badDims;
    return out;
  }
  // Probe: Würde diese neue Bedingung oder dieses Maß passen? (ohne etwas zu ändern)
  function trial(sketch, V) {
    const before = solve({ ...sketch, cons: sketch.consBefore || sketch.cons, dims: sketch.dimsBefore || sketch.dims }, V, { analyze: true });
    const after = solve(sketch, V, { analyze: true });
    return { ok: after.ok, redundant: after.ok && after.rank === before.rank && after.dof === before.dof, after, before };
  }
  // Widerspruch erklären: alle unmittelbar am Konflikt beteiligten Maße und Regeln finden (minimaler Konflikt)
  function explainConflict(sketch, V, opts = {}) {
    const base = solve(sketch, V, { noJoin: opts.noJoin });
    if (base.ok) return { ok: true, items: [], conflicts: new Set() };
    const dims = sketch.dims || [], cons = sketch.cons || [];
    const activeDims = dims.filter((d) => !d.ref && d.k !== 'n');
    const entsCopy = (sketch.ents || []).map((e) => JSON.parse(JSON.stringify(e)));
    const sys = build(entsCopy, V, { dims, cons, noJoin: opts.noJoin });
    // Verbundene Gleichungs-Komponente(n) rund um die verletzten Gleichungen per BFS bestimmen
    const varToEqs = new Map();
    sys.eqs.forEach((q, i) => {
      for (const j of q.deps) {
        if (!varToEqs.has(j)) varToEqs.set(j, []);
        varToEqs.get(j).push(i);
      }
    });
    const seenEq = new Set(), queue = [], compIds = new Set();
    sys.eqs.forEach((q, i) => {
      const id = q.tag && (q.tag.dim || q.tag.con);
      if (id && base.conflicts.has(id)) { seenEq.add(i); queue.push(i); }
    });
    for (let qi = 0; qi < queue.length; qi++) {
      const q = sys.eqs[queue[qi]];
      if (q.tag) { if (q.tag.dim) compIds.add(q.tag.dim); if (q.tag.con) compIds.add(q.tag.con); }
      for (const j of q.deps) {
        for (const nb of varToEqs.get(j) || []) if (!seenEq.has(nb)) { seenEq.add(nb); queue.push(nb); }
      }
    }
    let candidates = [];
    const seenCand = new Set();
    const pushCand = (kind, id) => { if (!seenCand.has(id)) { seenCand.add(id); candidates.push({ kind, id }); } };
    for (const d of activeDims) if (compIds.has(d.id)) pushCand('dim', d.id);
    for (const c of cons) if (compIds.has(c.id)) pushCand('con', c.id);
    if (!candidates.length) {
      for (const d of activeDims) if (base.conflicts.has(d.id)) pushCand('dim', d.id);
      for (const c of cons) if (base.conflicts.has(c.id)) pushCand('con', c.id);
    }
    if (candidates.length > 35) {
      const seeds = candidates.filter((x) => base.conflicts.has(x.id) || (opts.keepId && x.id === opts.keepId));
      const rest = candidates.filter((x) => !base.conflicts.has(x.id) && !(opts.keepId && x.id === opts.keepId));
      candidates = [...seeds, ...rest].slice(0, 35);
    }
    // Nicht-Seeds zuerst prüfen, damit echte Verursacher im minimalen Konflikt bleiben
    candidates.sort((a, b) => {
      const ak = opts.keepId && a.id === opts.keepId ? 2 : base.conflicts.has(a.id) ? 1 : 0;
      const bk = opts.keepId && b.id === opts.keepId ? 2 : base.conflicts.has(b.id) ? 1 : 0;
      return ak - bk;
    });
    let cur = candidates.slice();
    const buildSubset = (list) => {
      const ds = new Set(list.filter((x) => x.kind === 'dim').map((x) => x.id));
      const cs = new Set(list.filter((x) => x.kind === 'con').map((x) => x.id));
      return { ents: sketch.ents, dims: dims.filter((d) => !d.ref && d.k !== 'n' && ds.has(d.id)), cons: cons.filter((c) => cs.has(c.id)) };
    };
    for (const u of candidates) {
      if (opts.keepId && u.id === opts.keepId) continue;
      const next = cur.filter((x) => !(x.kind === u.kind && x.id === u.id));
      if (!next.length) continue;
      const r = solve(buildSubset(next), V, { noJoin: opts.noJoin });
      if (!r.ok) cur = next;
    }
    for (const bid of base.badDims || []) if (!cur.some((x) => x.kind === 'dim' && x.id === bid)) cur.push({ kind: 'dim', id: bid });
    if (!cur.length) {
      for (const d of activeDims) if (base.conflicts.has(d.id)) cur.push({ kind: 'dim', id: d.id });
      for (const c of cons) if (base.conflicts.has(c.id)) cur.push({ kind: 'con', id: c.id });
    }
    return { ok: false, items: cur, conflicts: new Set(cur.map((x) => x.id)) };
  }
  // Zwischenspeicher für den CAD-Kern: dieselbe Skizze mit denselben Werten wird nur einmal gelöst
  const memo = new Map();
  function cached(sketch, V) {
    const names = new Set();
    for (const d of sketch.dims || []) if (typeof d.v === 'string') for (const n of Expr.names(d.v)) names.add(n);
    const vv = [...names].map((n) => { const k = Object.keys(V || {}).find((x) => x.toLowerCase() === n.toLowerCase()); return k ? V[k] : null; });
    const tbls = V && V.__tables ? V.__tables : null;
    const key = JSON.stringify([sketch.ents, sketch.dims || [], sketch.cons || [], vv, tbls]);
    if (memo.has(key)) { const r = memo.get(key); memo.delete(key); memo.set(key, r); return r; }
    const r = solve(sketch, V);
    memo.set(key, r); if (memo.size > 60) memo.delete(memo.keys().next().value);
    return r;
  }
  return { solve, trial, cached, explainConflict, curveEndState, curvatureSamples, VARS, varsOf, getK, setK };
})();
