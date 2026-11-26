// ================= Magnetisches Einrasten (wie bei Canva) =================
// Auf einer ebenen Fläche: Mitte, Mittellinien, Lochmitten, Kantenmitten, gleicher Randabstand.
// Zwischen Körpern (Verschieben auf der Grundebene): Kanten und Mitten anderer Körper, gleiche Abstände.
const Snap = (() => {
  const TOL = 11;   // Fangbereich in Bildpunkten
  const cache = new Map();
  let guideObj = null, tip = null;
  const on = () => App.doc.settings.magnet !== false;

  // ---------- Flächen ----------
  function faceData(id, faceIdx) {
    const r = App.results.get(id); if (!r || !r.data || !r.data.faces) return null;
    const info = r.data.faces[faceIdx]; if (!info) return null;
    const flat = info.t === 'PLANE';
    if (flat && (!info.n || !info.c)) return null;
    const k = r.key + '|' + faceIdx;
    const c = cache.get(k);
    if (c) return c === 'pending' ? null : c;
    cache.set(k, 'pending');
    if (cache.size > 60) for (const key of [...cache.keys()].slice(0, 20)) cache.delete(key);
    if (flat) Kernel.call('faceLoops', { key: r.key, faceIdx }).then((loops) => { cache.set(k, build(info, loops)); }).catch(() => cache.delete(k));
    else Kernel.call('faceGrid', { key: r.key, faceIdx }).then((g) => { cache.set(k, { curved: true, g, info }); }).catch(() => cache.delete(k));
    return null;
  }
  function build(info, loops) {
    const F = Actions.faceFrame(info);
    const ents = SK.faceLoopsToEnts(F, loops);
    const outer = SK.faceLoopsToEnts(F, loops.slice(0, 1));
    const b = SK.bounds(outer.length ? outer : ents); if (!b) return null;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const pts = [{ p: [cx, cy], name: 'Mitte der Fläche', pri: 0 }];
    const xs = [{ v: cx, name: 'Mittellinie' }], ys = [{ v: cy, name: 'Mittellinie' }];
    const centers = [];
    for (const e of ents) {
      if (e.type === 'circle') centers.push(e.c);
      else if (e.type === 'arc') { const ai = SK.arcInfo(e.a, e.m, e.b); if (ai && ai.r > 0.3) centers.push(ai.c); }
      else if (e.type === 'line' && SK.d2(e.a, e.b) > 2) pts.push({ p: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], name: 'Kantenmitte', pri: 2 });
    }
    // gleiche Mittelpunkte (Bogen-Ecken) nur einmal
    const uniq = [];
    for (const c of centers) if (!uniq.some((q) => SK.d2(q, c) < 1e-3)) uniq.push(c);
    for (const c of uniq) {
      pts.push({ p: c, name: 'Lochmitte', pri: 1 });
      xs.push({ v: c[0], name: 'in Linie mit Loch' }); ys.push({ v: c[1], name: 'in Linie mit Loch' });
      // gespiegelt an den Mittellinien: gleicher Randabstand
      if (Math.abs(c[0] - cx) > 0.05) xs.push({ v: 2 * cx - c[0], name: 'gleicher Randabstand' });
      if (Math.abs(c[1] - cy) > 0.05) ys.push({ v: 2 * cy - c[1], name: 'gleicher Randabstand' });
    }
    return { F, b, pts, xs, ys };
  }
  // Punkt (Welt) auf einer Fläche einrasten. Ergebnis: { point: Vector3 (Welt), label } oder null
  // opt.normal: Normale am Treffpunkt (Welt), opt.flatOnly: nur ebene Flächen
  function onFace(id, faceIdx, pointWorld, opt = {}) {
    if (!on()) { clearSnap(); return null; }
    const D = faceData(id, faceIdx); if (!D) { clearSnap(); return null; }
    if (D.curved) return opt.flatOnly ? (clearSnap(), null) : onCurved(id, D, pointWorld, opt.normal);
    const W = Model.worldMatrix(App.doc, id), WI = W.clone().invert();
    const F = D.F, o = new THREE.Vector3(...F.o), X = new THREE.Vector3(...F.x), Y = new THREE.Vector3(...F.y);
    const lp = pointWorld.clone().applyMatrix4(WI).sub(o);
    const uv = [lp.dot(X), lp.dot(Y)];
    const toW = (u, v) => o.clone().addScaledVector(X, u).addScaledVector(Y, v).applyMatrix4(W);
    // mm je Bildpunkt an dieser Stelle
    const s0 = Viewer.toScreen(toW(uv[0], uv[1])), s1 = Viewer.toScreen(toW(uv[0] + 1, uv[1])), s2 = Viewer.toScreen(toW(uv[0], uv[1] + 1));
    const pxmm = Math.max(1e-6, Math.max(Math.hypot(s1.x - s0.x, s1.y - s0.y), Math.hypot(s2.x - s0.x, s2.y - s0.y)));
    const tol = TOL / pxmm;
    let best = null;
    for (const c of D.pts) { const d = SK.d2(c.p, uv); if (d < tol && (!best || d + c.pri * tol * 0.3 < best.d + best.pri * tol * 0.3)) best = { ...c, d }; }
    let u = uv[0], v = uv[1], label = null; const guides = [];
    const [x0, y0, x1, y1] = D.b;
    if (best) {
      [u, v] = best.p; label = best.name;
      guides.push([toW(u, y0), toW(u, y1)], [toW(x0, v), toW(x1, v)]);
    } else {
      let bx = null, by = null;
      for (const c of D.xs) { const d = Math.abs(c.v - uv[0]); if (d < tol && (!bx || d < bx.d)) bx = { ...c, d }; }
      for (const c of D.ys) { const d = Math.abs(c.v - uv[1]); if (d < tol && (!by || d < by.d)) by = { ...c, d }; }
      if (bx) { u = bx.v; guides.push([toW(u, y0), toW(u, y1)]); }
      if (by) { v = by.v; guides.push([toW(x0, v), toW(x1, v)]); }
      if (bx || by) label = bx && by && bx.name === by.name ? bx.name : [bx && bx.name, by && by.name].filter(Boolean).join(' · ');
    }
    if (!label) { clearSnap(); return null; }
    const point = toW(u, v);
    show(guides, label, point);
    return { point, label, uv: [u, v] };
  }

  // ---------- gewölbte Flächen (Rohr, Rumpf, Kugel …) ----------
  // Raster g: nu × nv Punkte P und Normalen N über (s, t) ∈ [0, 1]², uc/vc: Richtung geschlossen (rundherum)
  const gi = (g, i, j) => (j * g.nu + i) * 3;
  function wrap(g, s, t) {
    s = g.uc ? ((s % 1) + 1) % 1 : Math.min(1, Math.max(0, s));
    t = g.vc ? ((t % 1) + 1) % 1 : Math.min(1, Math.max(0, t));
    return [s, t];
  }
  function evalG(g, A, s, t) {
    [s, t] = wrap(g, s, t);
    const x = s * (g.nu - 1), y = t * (g.nv - 1);
    const i = Math.min(g.nu - 2, Math.floor(x)), j = Math.min(g.nv - 2, Math.floor(y)), fx = x - i, fy = y - j;
    const a = gi(g, i, j), b = gi(g, i + 1, j), c = gi(g, i, j + 1), d = gi(g, i + 1, j + 1);
    const o = new THREE.Vector3();
    for (let k = 0; k < 3; k++) o.setComponent(k, (A[a + k] * (1 - fx) + A[b + k] * fx) * (1 - fy) + (A[c + k] * (1 - fx) + A[d + k] * fx) * fy);
    return o;
  }
  const evalP = (g, s, t) => evalG(g, g.P, s, t);
  const evalN = (g, s, t) => evalG(g, g.N, s, t).normalize();
  function inside(g, s, t) {
    if (!g.ins) return true;
    [s, t] = wrap(g, s, t);
    return !!g.ins[Math.round(t * (g.nv - 1)) * g.nu + Math.round(s * (g.nu - 1))];
  }
  // nächster Flächenpunkt (s, t) zu einem Punkt p (lokal)
  function project(g, p) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < g.nu * g.nv; k++) { const d = (g.P[3 * k] - p.x) ** 2 + (g.P[3 * k + 1] - p.y) ** 2 + (g.P[3 * k + 2] - p.z) ** 2; if (d < bd) { bd = d; best = k; } }
    let s = (best % g.nu) / (g.nu - 1), t = Math.floor(best / g.nu) / (g.nv - 1);
    const hs = 0.5 / (g.nu - 1), ht = 0.5 / (g.nv - 1);
    for (let it = 0; it < 5; it++) {
      const q = evalP(g, s, t), r = p.clone().sub(q);
      const Ps = evalP(g, s + hs, t).sub(evalP(g, s - hs, t)).divideScalar(2 * hs), Pt = evalP(g, s, t + ht).sub(evalP(g, s, t - ht)).divideScalar(2 * ht);
      const a = Ps.dot(Ps), b = Ps.dot(Pt), c = Pt.dot(Pt), det = a * c - b * b; if (Math.abs(det) < 1e-12) break;
      const rs = r.dot(Ps), rt = r.dot(Pt);
      [s, t] = wrap(g, s + (c * rs - b * rt) / det, t + (a * rt - b * rs) / det);
    }
    return [s, t];
  }
  // Linien zum Einrasten: Mittellinien (offene Richtungen) und Scheitel („ganz oben“ …) je nach Lage in der Welt
  const DIRS = [['ganz oben', [0, 0, 1]], ['ganz unten', [0, 0, -1]], ['ganz rechts', [1, 0, 0]], ['ganz links', [-1, 0, 0]], ['ganz vorne', [0, -1, 0]], ['ganz hinten', [0, 1, 0]]];
  function curvedLines(g, W) {
    const WI = W.clone().invert(), lines = [];
    if (!g.uc) lines.push({ fix: 0, mid: true, name: 'Mittellinie' });
    if (!g.vc) lines.push({ fix: 1, mid: true, name: 'Mittellinie' });
    for (const [name, d] of DIRS) {
      const dl = new THREE.Vector3(...d).transformDirection(WI);
      const val = (i, j) => { const k = gi(g, i, j); return g.N[k] * dl.x + g.N[k + 1] * dl.y + g.N[k + 2] * dl.z; };
      // Richtung, in der sich die Normale am stärksten dreht
      let ru = 0, rv = 0;
      for (let j = 0; j < g.nv; j++) { let lo = 1, hi = -1; for (let i = 0; i < g.nu; i++) { const y = val(i, j); lo = Math.min(lo, y); hi = Math.max(hi, y); } ru += (hi - lo) / g.nv; }
      for (let i = 0; i < g.nu; i++) { let lo = 1, hi = -1; for (let j = 0; j < g.nv; j++) { const y = val(i, j); lo = Math.min(lo, y); hi = Math.max(hi, y); } rv += (hi - lo) / g.nu; }
      if (Math.max(ru, rv) < 0.15) continue;
      const fix = ru >= rv ? 0 : 1, n1 = fix ? g.nv : g.nu, n2 = fix ? g.nu : g.nv, closed = fix ? g.vc : g.uc;
      const get = (a, b) => (fix ? val(b, a) : val(a, b));
      const c = new Array(n2).fill(null);
      for (let b = 0; b < n2; b++) {
        let best = null;
        for (let a = 0; a < n1; a++) {
          if (closed && a === n1 - 1) continue;          // derselbe Punkt wie a = 0
          const y = get(a, b); if (y < 0.7) continue;
          let am = a - 1, ap = a + 1, edge = false;
          if (closed) { am = (a - 1 + n1 - 1) % (n1 - 1); ap = (a + 1) % (n1 - 1); }
          else if (am < 0) { am = ap; edge = true; } else if (ap >= n1) { ap = am; edge = true; }
          const y0 = get(am, b), y1 = get(ap, b);
          if (y < y0 - 1e-9 || y < y1 - 1e-9) continue;
          if (edge && y < 0.97) continue;                 // Scheitel am Rand nur, wenn er wirklich dorthin zeigt
          if (best && y <= best.y) continue;
          const den = y0 - 2 * y + y1, off = edge || Math.abs(den) < 1e-12 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y1)) / den));
          best = { y, p: (a + off) / (n1 - 1) };
        }
        if (best) c[b] = closed ? ((best.p % 1) + 1) % 1 : best.p;
      }
      if (c.some((x) => x !== null)) lines.push({ fix, c, closed, name, dl });
    }
    return lines;
  }
  // Wert einer Linie an der Stelle x der anderen Richtung
  function lineAt(L, x) {
    if (L.mid) return 0.5;
    const n = L.c.length, f = Math.min(Math.max(x, 0), 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)), w = f - i;
    let a = L.c[i], b = L.c[i + 1];
    if (a === null && b === null) return null;
    if (a === null) return w > 0.5 ? b : null;
    if (b === null) return w < 0.5 ? a : null;
    if (L.closed && Math.abs(b - a) > 0.5) b += b < a ? 1 : -1;
    if (Math.abs(b - a) > 0.25) return w < 0.5 ? a : b;  // Sprung: nicht über die Lücke mitteln
    const v = a + (b - a) * w; return L.closed ? ((v % 1) + 1) % 1 : v;
  }
  function onCurved(id, D, pointWorld, normalHint) {
    const g = D.g, W = Model.worldMatrix(App.doc, id), WI = W.clone().invert();
    const mk = W.elements.map((v) => v.toFixed(4)).join(',');
    if (D.mk !== mk) { D.lines = curvedLines(g, W); D.mk = mk; }
    const lp = pointWorld.clone().applyMatrix4(WI);
    const [s, t] = project(g, lp);
    const toW = (v) => v.clone().applyMatrix4(W);
    const p0 = evalP(g, s, t), w0 = toW(p0), sc0 = Viewer.toScreen(w0);
    let pxmm = 1e-6;
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const sc = Viewer.toScreen(w0.clone().add(new THREE.Vector3(...ax))); pxmm = Math.max(pxmm, Math.hypot(sc.x - sc0.x, sc.y - sc0.y)); }
    const tol = TOL / pxmm;
    const pick = [null, null];
    for (const L of D.lines) {
      const v = lineAt(L, L.fix ? s : t); if (v === null) continue;
      const q = L.fix ? evalP(g, s, v) : evalP(g, v, t), d = q.distanceTo(lp);
      if (d < tol && (!pick[L.fix] || d < pick[L.fix].d)) pick[L.fix] = { L, d };
    }
    if (!pick[0] && !pick[1]) { clearSnap(); return null; }
    let ss = s, tt = t;
    for (let it = 0; it < 4; it++) {
      if (pick[0]) { const v = lineAt(pick[0].L, tt); if (v !== null) ss = v; }
      if (pick[1]) { const v = lineAt(pick[1].L, ss); if (v !== null) tt = v; }
    }
    if (!inside(g, ss, tt)) { clearSnap(); return null; }
    const p = evalP(g, ss, tt), n = evalN(g, ss, tt);
    const ci = D.info;
    if (ci.t === 'CYLINDRE' && ci.axis && ci.r) {     // Zylinder: genau auf den Radius
      const o = new THREE.Vector3(ci.axis[0], ci.axis[1], ci.axis[2]), ax = new THREE.Vector3(ci.axis[3], ci.axis[4], ci.axis[5]).normalize();
      const rel = p.clone().sub(o), along = rel.dot(ax), rad = rel.addScaledVector(ax, -along);
      // eingerastet auf „ganz oben“ o. ä.: genau die Mantellinie in dieser Richtung
      const dirL = pick[0] && pick[0].L.dl ? pick[0].L : pick[1] && pick[1].L.dl ? pick[1].L : null;
      if (dirL) { const dp = dirL.dl.clone().addScaledVector(ax, -dirL.dl.dot(ax)); if (dp.length() > 0.2) rad.copy(dp).multiplyScalar(rad.dot(dp) < 0 ? -1 : 1); }
      if (rad.length() > 1e-9) { rad.normalize(); p.copy(o).addScaledVector(ax, along).addScaledVector(rad, ci.r); n.copy(rad.multiplyScalar(n.dot(rad) < 0 ? -1 : 1)); }
    }
    if (ci.t === 'SPHERE' && ci.sc && ci.r) {         // Kugel: genau auf den Radius
      const c = new THREE.Vector3(...ci.sc), rad = p.clone().sub(c);
      if (rad.length() > 1e-9) { rad.normalize(); p.copy(c).addScaledVector(rad, ci.r); n.copy(rad.multiplyScalar(n.dot(rad) < 0 ? -1 : 1)); }
    }
    const point = toW(p), normal = n.clone().transformDirection(W);
    if (normalHint && normal.dot(normalHint) < 0) normal.negate();
    const names = pick.filter(Boolean).map((x) => x.L).sort((a, b) => (b.mid ? 1 : 0) - (a.mid ? 1 : 0));
    let label;
    if (names.length === 2 && names[0].mid && names[1].mid) label = 'Mitte der Fläche';
    else label = names.map((L) => (L.mid ? 'Mitte' : L.name)).join(' · ');
    // Hilfslinien entlang der Fläche
    const guides = [], cam = Viewer.camera.position;
    for (const x of pick) {
      if (!x) continue;
      const L = x.L, n2 = L.fix ? g.nu : g.nv; let prev = null, pv = null;
      for (let k = 0; k <= n2 * 2; k++) {
        const o2 = k / (n2 * 2), v = lineAt(L, o2);
        const st = v === null ? null : L.fix ? [o2, v] : [v, o2];
        let q = st && inside(g, st[0], st[1]) ? toW(evalP(g, st[0], st[1])) : null;
        if (q && evalN(g, st[0], st[1]).transformDirection(W).dot(cam.clone().sub(q)) < 0) q = null;   // Rückseite nicht zeichnen
        let jump = pv === null || v === null ? 0 : Math.abs(v - pv); if (L.closed) jump = Math.min(jump, 1 - jump);
        if (q && prev && jump < 0.15) guides.push([prev, q]);
        prev = q; pv = v;
      }
    }
    show(guides, label, point);
    return { point, label, normal, uv: [ss, tt] };
  }

  // ---------- Körper zueinander (Grundebene, Z bleibt) ----------
  // box0: Weltbox des bewegten Körpers am Anfang, d: [dx, dy] gewünschte Verschiebung, ids: bewegte Körper
  function bodies(box0, d, ids, z) {
    if (!on()) { clearSnap(); return null; }
    const others = App.doc.items.filter((it) => !ids.includes(it.id) && !it.hidden).map((it) => Actions.worldBox(it.id)).filter((b) => b && !b.isEmpty());
    const lo = [box0.min.x + d[0], box0.min.y + d[1]], hi = [box0.max.x + d[0], box0.max.y + d[1]];
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    // mm je Bildpunkt
    const c3 = new THREE.Vector3(mid[0], mid[1], z), a = Viewer.toScreen(c3), b = Viewer.toScreen(c3.clone().add(new THREE.Vector3(1, 0, 0))), b2 = Viewer.toScreen(c3.clone().add(new THREE.Vector3(0, 1, 0)));
    const pxmm = Math.max(1e-6, Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(b2.x - a.x, b2.y - a.y)));
    const tol = TOL / pxmm;
    const res = [d[0], d[1]]; const guides = []; const names = [];
    for (const k of [0, 1]) {
      const mine = [[lo[k], 'Kante'], [mid[k], 'Mitte'], [hi[k], 'Kante']];
      const cands = [{ v: 0, name: 'Mitte am Nullpunkt', only: 1, span: null }];
      for (const o of others) {
        const olo = k ? o.min.y : o.min.x, ohi = k ? o.max.y : o.max.x, om = (olo + ohi) / 2;
        const span = k ? [o.min.x, o.max.x] : [o.min.y, o.max.y];
        cands.push({ v: olo, name: 'bündig', span }, { v: ohi, name: 'bündig', span }, { v: om, name: 'mittig', span, only: 1 });
      }
      // gleiche Abstände: Lücke zwischen zwei anderen Körpern übernehmen
      const sorted = others.map((o) => (k ? [o.min.y, o.max.y] : [o.min.x, o.max.x])).sort((p, q) => p[0] - q[0]);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const gap = sorted[i + 1][0] - sorted[i][1]; if (gap <= 0.01) continue;
        cands.push({ v: sorted[i + 1][1] + gap, name: 'gleicher Abstand', gapEdge: 'lo' }, { v: sorted[i][0] - gap, name: 'gleicher Abstand', gapEdge: 'hi' });
      }
      let best = null;
      for (const c of cands) for (const [mv, kind] of mine) {
        if (c.only && kind !== 'Mitte') continue;
        if (c.gapEdge === 'lo' && mv !== lo[k]) continue;
        if (c.gapEdge === 'hi' && mv !== hi[k]) continue;
        const dd = Math.abs(c.v - mv);
        if (dd < tol && (!best || dd < best.dd - 1e-9)) best = { ...c, dd, shift: c.v - mv };
      }
      if (best) {
        res[k] += best.shift; names.push(best.name);
        const L = Math.max(hi[1 - k] - lo[1 - k], 10);
        let s0 = Math.min(lo[1 - k] + d[1 - k] * 0, lo[1 - k]) - 6, s1 = hi[1 - k] + 6;
        if (best.span) { s0 = Math.min(s0, best.span[0] - 6); s1 = Math.max(s1, best.span[1] + 6); }
        if (!best.span && best.v === 0) { s0 = Math.min(s0, -L); s1 = Math.max(s1, L); }
        guides.push(k === 0 ? [new THREE.Vector3(best.v, s0, z), new THREE.Vector3(best.v, s1, z)] : [new THREE.Vector3(s0, best.v, z), new THREE.Vector3(s1, best.v, z)]);
      }
    }
    if (!names.length) { clearSnap(); return null; }
    // Hilfslinien bei der neuen Lage zeichnen
    const label = [...new Set(names)].join(' · ');
    show(guides, label, new THREE.Vector3((lo[0] + hi[0]) / 2 + res[0] - d[0], hi[1] + res[1] - d[1], z));
    return { d: res, label };
  }

  // ---------- Andock-Punkte an Teilen & Einrasten beim Ziehen (BG-08) ----------
  const DOCK_TOL = 24; // Fangbereich in Bildpunkten
  const DOCK_NORM_LIBS = {
    stdScrew: 'Schraubenachse',
    stdPin: 'Stiftachse',
    stdNut: 'Muttermitte',
    stdWasher: 'Scheibenmitte',
    stdBearing: 'Lagermitte',
    stdSleeve: 'Buchsenachse',
    stdORing: 'O-Ring-Mitte',
    stdShaftSeal: 'Dichtringachse',
    stdCompSpring: 'Federachse',
    stdExtSpring: 'Federachse',
    steppedShaft: 'Wellenachse',
    shaftCollar: 'Stellring-Mitte',
    shaftCoupling: 'Kupplungsachse',
    stdPipe: 'Rohrachse',
    pipeElbow: 'Bogen-Anschluss',
    pipeTee: 'T-Stück-Achse',
    pipeFlange: 'Flanschmitte',
    stdBelt: 'Riemenmitte',
    stdChain: 'Kettenmitte',
    tSlotProfile: 'Profilachse',
    tSlotBracket: 'Winkel-Ecke',
    tSlotNut: 'Nutenstein-Mitte',
    tSlotEndCap: 'Endkappe-Mitte',
  };
  let dockDrag = null;

  function dockRotBetween(from, to) {
    const a = from.clone().normalize(), b = to.clone().normalize();
    const dot = a.dot(b);
    if (dot > 1 - 1e-10) return new THREE.Quaternion();
    if (dot < -1 + 1e-10) {
      const ref = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(a, ref).normalize(), Math.PI);
    }
    return new THREE.Quaternion().setFromUnitVectors(a, b);
  }
  function dockCanonicalX(n) {
    const nv = new THREE.Vector3(...n).normalize();
    let ref = Math.abs(nv.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    let x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    if (x.lengthSq() < 1e-9) {
      ref = new THREE.Vector3(0, 1, 0);
      x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    }
    return x.normalize();
  }
  function dockBasisUV(n) {
    const u = dockCanonicalX(n.toArray());
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    return [u, v];
  }
  function normPartOf(it, doc) {
    if (!it) return null;
    if (it.kind === 'part' && it.p && DOCK_NORM_LIBS[it.p.lib]) return { item: it, lib: it.p.lib, M: new THREE.Matrix4() };
    if (it.kind === 'ref' && it.p && it.p.docId && Model.resolveDoc) {
      const refDoc = Model.resolveDoc(it.p.docId);
      const act = refDoc ? Model.activeItems(refDoc).filter((x) => x && !x.hidden && x.role !== 'hole') : [];
      if (act.length === 1 && act[0].kind === 'part' && act[0].p && DOCK_NORM_LIBS[act[0].p.lib]) {
        return { item: act[0], lib: act[0].p.lib, M: Model.localMatrix(act[0]) };
      }
    }
    return null;
  }

  function dockPoints(id, doc = App.doc) {
    const f = Model.find(doc, id);
    const it = f && f.item;
    if (!it || it.hidden || it.role === 'hole' || (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(it.id))) return [];
    const r = App.results.get(id);
    const data = r && r.data;
    if (!data) return [];

    const W = Model.worldMatrix(doc, id);
    const faces = data.faces || [];
    const edges = data.edges || [];
    const bb = data.bbox;
    const bc = Array.isArray(bb) && bb.length >= 6
      ? new THREE.Vector3((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2)
      : new THREE.Vector3();

    const planes = [];
    for (let i = 0; i < faces.length; i++) {
      const fi = faces[i];
      if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.c) || !Array.isArray(fi.n)) continue;
      const nv = new THREE.Vector3(...fi.n);
      if (nv.lengthSq() < 1e-12) continue;
      planes.push({ idx: i, c: new THREE.Vector3(...fi.c), n: nv.normalize() });
    }
    const cyls = [];
    for (let i = 0; i < faces.length; i++) {
      const fi = faces[i];
      if (!fi || fi.t !== 'CYLINDRE' || !Array.isArray(fi.axis)) continue;
      const d = new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]);
      if (d.lengthSq() < 1e-12) continue;
      d.normalize();
      const l = new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]);
      if (Array.isArray(fi.c)) {
        const fc = new THREE.Vector3(...fi.c);
        l.addScaledVector(d, fc.sub(l).dot(d));
      }
      cyls.push({ idx: i, l, d, r: Number(fi.r) || 0 });
    }

    const out = [];
    const addPt = (pt) => {
      const lp = new THREE.Vector3(...pt.localP);
      const ln = new THREE.Vector3(...pt.localN).normalize();
      const ld = pt.localDir ? new THREE.Vector3(...pt.localDir).normalize() : null;
      out.push({
        id,
        kind: pt.kind,
        sub: pt.sub || null,
        name: pt.name,
        primary: !!pt.primary,
        pri: pt.pri,
        localP: [round(lp.x, 6), round(lp.y, 6), round(lp.z, 6)],
        localN: [round(ln.x, 9), round(ln.y, 9), round(ln.z, 9)],
        localDir: ld ? [round(ld.x, 9), round(ld.y, 9), round(ld.z, 9)] : null,
        p: lp.clone().applyMatrix4(W),
        n: ln.clone().transformDirection(W).normalize(),
        dir: ld ? ld.clone().transformDirection(W).normalize() : null,
        r: pt.r || 0,
        faceIdx: pt.faceIdx != null ? pt.faceIdx : null,
        planeFaceIdx: pt.planeFaceIdx != null ? pt.planeFaceIdx : null,
        cylFaceIdx: pt.cylFaceIdx != null ? pt.cylFaceIdx : null,
        edgeIdx: pt.edgeIdx != null ? pt.edgeIdx : null,
      });
    };

    const matchPlane = (pt, nHint) => {
      let best = null, bd = 0.08;
      for (const pl of planes) {
        if (nHint && Math.abs(pl.n.dot(nHint)) < 0.99) continue;
        const d = Math.abs(pt.clone().sub(pl.c).dot(pl.n));
        if (d < bd) { bd = d; best = pl; }
      }
      return best;
    };
    const matchCyl = (pt, nHint) => {
      let best = null, bd = 0.15;
      for (const cy of cyls) {
        if (Math.abs(cy.d.dot(nHint)) < 0.99) continue;
        const v = pt.clone().sub(cy.l);
        const perp = v.addScaledVector(cy.d, -v.dot(cy.d)).length();
        if (perp < bd) { bd = perp; best = cy; }
      }
      return best;
    };

    // 1. Primärer Andock-Punkt bei Normteilen (z. B. Schraube: Kopfauflage auf Schaftachse)
    const np = normPartOf(it, doc);
    if (np) {
      const lp = new THREE.Vector3(0, 0, 0).applyMatrix4(np.M);
      const ln = new THREE.Vector3(0, 0, -1).transformDirection(np.M).normalize();
      const pl = matchPlane(lp, ln);
      const cy = matchCyl(lp, ln);
      addPt({
        kind: 'hole',
        sub: np.lib === 'stdScrew' ? 'shaft' : 'norm',
        name: DOCK_NORM_LIBS[np.lib],
        primary: true,
        pri: 0,
        localP: lp.toArray(),
        localN: ln.toArray(),
        r: cy ? cy.r : 0,
        faceIdx: pl ? pl.idx : (cy ? cy.idx : null),
        planeFaceIdx: pl ? pl.idx : null,
        cylFaceIdx: cy ? cy.idx : null,
      });
    }

    // 2. Lochmitten (Kreiskanten & Zylinderachsen)
    const holes = [];
    for (let i = 0; i < edges.length; i++) {
      const g = edges[i];
      if (!g || g.t !== 'CIRCLE' || !Array.isArray(g.c) || !Array.isArray(g.n) || !(g.r > 0.2)) continue;
      if (Number.isFinite(g.l) && g.l < Math.PI * g.r * 0.95) continue; // kleine Ecken-Bögen überspringen
      const cc = new THREE.Vector3(...g.c);
      let cn = new THREE.Vector3(...g.n);
      if (cn.lengthSq() < 1e-12) continue;
      cn.normalize();
      const pl = matchPlane(cc, cn);
      if (pl) cn = pl.n.clone();
      else if (cc.clone().sub(bc).dot(cn) < 0) cn.negate();
      const cy = matchCyl(cc, cn);
      const dup = holes.find((h0) => h0.lp.distanceTo(cc) < 0.15 && Math.abs(h0.ln.dot(cn)) > 0.99);
      if (dup) {
        if (pl && dup.planeFaceIdx == null) { dup.planeFaceIdx = pl.idx; dup.ln.copy(pl.n); }
        if (cy && dup.cylFaceIdx == null) dup.cylFaceIdx = cy.idx;
        continue;
      }
      holes.push({
        lp: cc, ln: cn, r: g.r,
        faceIdx: pl ? pl.idx : (cy ? cy.idx : null),
        planeFaceIdx: pl ? pl.idx : null,
        cylFaceIdx: cy ? cy.idx : null,
        edgeIdx: i,
      });
    }
    for (const cy of cyls) {
      const hasSame = out.some((x) => x.cylFaceIdx === cy.idx) || holes.some((h0) => h0.cylFaceIdx === cy.idx);
      if (hasSame) continue;
      const cn = cy.l.clone().sub(bc).dot(cy.d) >= 0 ? cy.d.clone() : cy.d.clone().negate();
      holes.push({ lp: cy.l.clone(), ln: cn, r: cy.r, faceIdx: cy.idx, planeFaceIdx: null, cylFaceIdx: cy.idx, edgeIdx: null });
    }
    let holeCount = out.length;
    for (const h0 of holes) {
      if (holeCount >= 40) break;
      if (out.some((x) => new THREE.Vector3(...x.localP).distanceTo(h0.lp) < 0.15 && Math.abs(new THREE.Vector3(...x.localN).dot(h0.ln)) > 0.99)) {
        const ex = out.find((x) => new THREE.Vector3(...x.localP).distanceTo(h0.lp) < 0.15 && Math.abs(new THREE.Vector3(...x.localN).dot(h0.ln)) > 0.99);
        if (ex && ex.planeFaceIdx == null && h0.planeFaceIdx != null) ex.planeFaceIdx = h0.planeFaceIdx;
        if (ex && ex.cylFaceIdx == null && h0.cylFaceIdx != null) ex.cylFaceIdx = h0.cylFaceIdx;
        continue;
      }
      addPt({
        kind: 'hole',
        name: 'Lochmitte',
        pri: 0,
        localP: h0.lp.toArray(),
        localN: h0.ln.toArray(),
        r: h0.r,
        faceIdx: h0.faceIdx,
        planeFaceIdx: h0.planeFaceIdx,
        cylFaceIdx: h0.cylFaceIdx,
        edgeIdx: h0.edgeIdx,
      });
      holeCount++;
    }

    // 3. Flächenmitten (ebene Flächen)
    let faceCount = 0;
    for (const pl of planes) {
      if (faceCount >= 24) break;
      if (out.some((x) => x.kind === 'hole' && new THREE.Vector3(...x.localP).distanceTo(pl.c) < 0.15 && Math.abs(new THREE.Vector3(...x.localN).dot(pl.n)) > 0.99)) continue;
      addPt({
        kind: 'face',
        name: 'Flächenmitte',
        pri: 1,
        localP: pl.c.toArray(),
        localN: pl.n.toArray(),
        faceIdx: pl.idx,
        planeFaceIdx: pl.idx,
      });
      faceCount++;
    }

    // 4. Kantenmitten (gerade Kanten > 2 mm, längste zuerst)
    const lineCands = [];
    for (let i = 0; i < edges.length; i++) {
      const g = edges[i];
      if (!g || g.t !== 'LINE' || !Array.isArray(g.a) || !Array.isArray(g.b) || !Array.isArray(g.m)) continue;
      const a = new THREE.Vector3(...g.a), b = new THREE.Vector3(...g.b), m = new THREE.Vector3(...g.m);
      const dv = b.clone().sub(a), len = dv.length();
      if (len <= 2) continue;
      if (out.some((x) => new THREE.Vector3(...x.localP).distanceTo(m) < 0.15)) continue;
      const dir = dv.divideScalar(len);
      // Normale aus anliegenden ebenen Flächen bestimmen
      const adjN = new THREE.Vector3();
      for (const pl of planes) {
        if (Math.abs(pl.n.dot(dir)) > 0.05) continue;
        if (Math.abs(m.clone().sub(pl.c).dot(pl.n)) < 0.08) adjN.add(pl.n);
      }
      adjN.addScaledVector(dir, -adjN.dot(dir));
      if (adjN.lengthSq() < 1e-6) {
        adjN.copy(m).sub(bc);
        adjN.addScaledVector(dir, -adjN.dot(dir));
        if (adjN.lengthSq() < 1e-6) adjN.copy(dockCanonicalX(dir.toArray()));
      }
      adjN.normalize();
      lineCands.push({ len, m, adjN, dir, edgeIdx: i });
    }
    lineCands.sort((p, q) => q.len - p.len);
    let edgeCount = 0;
    for (const lc of lineCands) {
      if (edgeCount >= 24) break;
      if (out.some((x) => new THREE.Vector3(...x.localP).distanceTo(lc.m) < 0.15)) continue;
      addPt({
        kind: 'edge',
        name: 'Kantenmitte',
        pri: 2,
        localP: lc.m.toArray(),
        localN: lc.adjN.toArray(),
        localDir: lc.dir.toArray(),
        edgeIdx: lc.edgeIdx,
      });
      edgeCount++;
    }
    return out;
  }

  function clearDockActive() {
    if (!dockDrag) return;
    for (const o of dockDrag.activeObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    dockDrag.activeObjs = [];
  }
  function clearDockMarkers() {
    if (!dockDrag) return;
    clearDockActive();
    for (const o of dockDrag.markerObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    dockDrag.markerObjs = [];
  }
  function pushCirclePos(pos, c, n, rad, segs = 16) {
    const [u, v] = dockBasisUV(n);
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
      const p1 = c.clone().addScaledVector(u, Math.cos(a1) * rad).addScaledVector(v, Math.sin(a1) * rad);
      const p2 = c.clone().addScaledVector(u, Math.cos(a2) * rad).addScaledVector(v, Math.sin(a2) * rad);
      pos.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  function pushCrossPos(pos, c, n, size) {
    const [u, v] = dockBasisUV(n);
    const a1 = c.clone().addScaledVector(u, -size), b1 = c.clone().addScaledVector(u, size);
    const a2 = c.clone().addScaledVector(v, -size), b2 = c.clone().addScaledVector(v, size);
    pos.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
  }
  function renderDockMarkers() {
    clearDockMarkers();
    if (!dockDrag || !dockDrag.targetPts.length) return;
    const holeRingPos = [], holeDotPos = [], facePos = [], edgePos = [];
    for (const t of dockDrag.targetPts) {
      const ps = Math.max(0.15, Viewer.pixelSizeAt(t.p));
      if (t.kind === 'hole') {
        const rad = t.r > 0.3 ? Math.min(Math.max(t.r, 4.5 * ps), 18 * ps) : 6 * ps;
        pushCirclePos(holeRingPos, t.p, t.n, rad, 18);
        holeDotPos.push(t.p.x, t.p.y, t.p.z, t.p.x, t.p.y, t.p.z + 0.001);
      } else if (t.kind === 'face') {
        const s = 5.5 * ps;
        const [u, v] = dockBasisUV(t.n);
        const p0 = t.p.clone().addScaledVector(u, s), p1 = t.p.clone().addScaledVector(v, s);
        const p2 = t.p.clone().addScaledVector(u, -s), p3 = t.p.clone().addScaledVector(v, -s);
        facePos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, p3.x, p3.y, p3.z, p0.x, p0.y, p0.z);
      } else {
        pushCrossPos(edgePos, t.p, t.n, 4 * ps);
      }
    }
    const addLayer = (arr, col, width, order, opacity = 0.88) => {
      if (!arr.length) return;
      const obj = Viewer.makeFat(arr, col, width, { depthTest: false, order, opacity });
      obj.visible = dockDrag.visible;
      Viewer.groups.overlay.add(obj);
      dockDrag.markerObjs.push(obj);
    };
    addLayer(holeRingPos, '#0c7a70', 2, 38, 0.9);
    addLayer(holeDotPos, '#0c7a70', 6, 39, 0.95);
    addLayer(facePos, '#1971c2', 1.8, 38, 0.85);
    addLayer(edgePos, '#f08c00', 1.8, 38, 0.82);
    Viewer.requestRender();
  }
  function renderDockActive(t) {
    clearDockActive();
    if (!dockDrag || !t) return;
    const ps = Math.max(0.15, Viewer.pixelSizeAt(t.p));
    const ringPos = [];
    const rad = t.kind === 'hole' && t.r > 0.3 ? Math.min(Math.max(t.r * 1.15, 7 * ps), 22 * ps) : 8 * ps;
    pushCirclePos(ringPos, t.p, t.n, rad, 24);
    const dot = Viewer.makeFat([t.p.x, t.p.y, t.p.z, t.p.x, t.p.y, t.p.z + 0.001], '#e0457b', 10, { depthTest: false, order: 42 });
    const ring = Viewer.makeFat(ringPos, '#e0457b', 3, { depthTest: false, order: 41 });
    const axLen = Math.max(8, 22 * ps);
    const a0 = t.p.clone().addScaledVector(t.n, -axLen * 0.5), a1 = t.p.clone().addScaledVector(t.n, axLen);
    const axis = Viewer.makeFat([a0.x, a0.y, a0.z, a1.x, a1.y, a1.z], '#e0457b', 2, { depthTest: false, dashed: true, dashSize: 1.6, gapSize: 1.2, order: 41 });
    Viewer.groups.overlay.add(ring, dot, axis);
    dockDrag.activeObjs.push(ring, dot, axis);
    Viewer.requestRender();
  }

  function beginDockDrag(draggedId) {
    endDockDrag();
    if (!on() || !draggedId || !App.doc) return false;
    const sourcePts = dockPoints(draggedId, App.doc);
    if (!sourcePts.length) return false;
    const excl = new Set([draggedId]);
    if (typeof Joints !== 'undefined' && Joints.downstream) {
      for (const d of Joints.downstream(App.doc, draggedId)) excl.add(d.b);
    }
    const targetPts = [];
    for (const it of App.doc.items || []) {
      if (excl.has(it.id) || it.hidden || it.role === 'hole' || (App.mergedInto && App.mergedInto(it.id))) continue;
      for (const pt of dockPoints(it.id, App.doc)) targetPts.push(pt);
    }
    if (!targetPts.length) return false;
    dockDrag = {
      draggedId,
      W0: Model.worldMatrix(App.doc, draggedId),
      sourcePts,
      targetPts,
      active: null,
      markerObjs: [],
      activeObjs: [],
      visible: true,
    };
    renderDockMarkers();
    return true;
  }

  function pickSourceFor(target, Wtent, sourcePts) {
    const scoreCand = (s) => {
      const sp = new THREE.Vector3(...s.localP).applyMatrix4(Wtent);
      const sn = new THREE.Vector3(...s.localN).transformDirection(Wtent).normalize();
      const dist = sp.distanceTo(target.p);
      const oppose = sn.dot(target.n); // -1 = zeigt genau in die Gegenrichtung (ideal zum Aufsetzen)
      if (target.kind === 'hole') {
        if (s.kind === 'hole') {
          const primBonus = s.primary ? -1000 : 0;
          const dirPen = oppose < -0.5 ? 0 : 120;
          const rDiff = target.r > 0 && s.r > 0 ? Math.abs(s.r - target.r) * 2 : 0;
          return primBonus + dirPen + rDiff + dist * 0.05;
        }
        if (s.kind === 'face') return 400 + (oppose + 1) * 80 + dist * 0.05;
        return 700 + dist * 0.05;
      }
      if (target.kind === 'face') {
        if (s.primary) return -400 + (oppose + 1) * 50 + dist * 0.05;
        if (s.kind === 'face') return (oppose + 1) * 120 + dist * 0.05;
        if (s.kind === 'hole') return 250 + (oppose + 1) * 100 + dist * 0.05;
        return 600 + dist * 0.05;
      }
      if (s.kind === 'edge') {
        const sDir = s.localDir ? new THREE.Vector3(...s.localDir).transformDirection(Wtent).normalize() : null;
        const par = sDir && target.dir ? 1 - Math.abs(sDir.dot(target.dir)) : 1;
        return par * 80 + dist * 0.05;
      }
      if (s.primary) return 150 + dist * 0.05;
      if (s.kind === 'face') return 220 + (oppose + 1) * 40 + dist * 0.05;
      return 350 + dist * 0.05;
    };
    let best = null, bestSc = Infinity;
    for (const s of sourcePts) {
      const sc = scoreCand(s);
      if (sc < bestSc) { bestSc = sc; best = s; }
    }
    return best;
  }

  function setDockVisible(vis) {
    if (!dockDrag) return;
    const v = !!vis;
    if (dockDrag.visible !== v) {
      dockDrag.visible = v;
      for (const o of dockDrag.markerObjs) o.visible = v;
    }
    if (!v) {
      dockDrag.active = null;
      clearDockActive();
      clearSnap();
    }
    Viewer.requestRender();
  }

  function updateDockDrag(item, t0, dXY, clientX, clientY) {
    if (!dockDrag || !on() || !item) return null;
    if (!dockDrag.visible) setDockVisible(true);
    const PW = Model.parentWorld(App.doc, item.id);
    const Ltent = Model.localMatrix({ t: { ...t0, x: t0.x + dXY[0], y: t0.y + dXY[1] } });
    const Wtent = PW.clone().multiply(Ltent);
    const rect = Viewer.canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const cam = Viewer.activeCamera || Viewer.camera;
    const orthoDir = Viewer.ortho ? new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion).normalize() : null;

    let best = null;
    for (const t of dockDrag.targetPts) {
      const st = Viewer.toScreen(t.p);
      if (st.behind) continue;
      const s = pickSourceFor(t, Wtent, dockDrag.sourcePts);
      if (!s) continue;
      const sp = new THREE.Vector3(...s.localP).applyMatrix4(Wtent);
      const ss = Viewer.toScreen(sp);
      const dCursor = Math.hypot(st.x - mx, st.y - my);
      const dSrc = ss.behind ? Infinity : Math.hypot(st.x - ss.x, st.y - ss.y);
      const dPx = Math.min(dCursor, dSrc);
      if (dPx >= DOCK_TOL) continue;
      const viewDir = orthoDir || cam.position.clone().sub(t.p).normalize();
      const facing = t.n.dot(viewDir);
      const backPenalty = facing < -0.1 ? 18 : 0;
      const kindBonus = t.kind === 'hole' && s.kind === 'hole' ? -4 : t.kind === 'face' && s.kind === 'face' ? -2 : 0;
      const score = dPx + t.pri * 5 + backPenalty + kindBonus;
      if (score < DOCK_TOL + 8 && (!best || score < best.score)) {
        best = { t, s, score };
      }
    }

    if (!best) {
      dockDrag.active = null;
      clearDockActive();
      clearSnap();
      return null;
    }

    const { t, s } = best;
    const W0 = dockDrag.W0;
    const R0 = new THREE.Matrix4().extractRotation(W0);
    const sN0 = new THREE.Vector3(...s.localN).transformDirection(W0).normalize();
    const zTarget = t.n.clone().negate();
    const Q = dockRotBetween(sN0, zTarget);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q).multiply(R0);
    const sP = new THREE.Vector3(...s.localP).applyMatrix4(R);
    const pos = t.p.clone().sub(sP);
    const worldMatrix = R.clone().setPosition(pos);

    const Wa = Model.worldMatrix(App.doc, t.id);
    const xBl = dockCanonicalX(s.localN);
    const xAw = xBl.clone().transformDirection(R).normalize();
    const xAl = xAw.clone().transformDirection(Wa.clone().invert());
    xAl.addScaledVector(new THREE.Vector3(...t.localN).normalize(), -xAl.dot(new THREE.Vector3(...t.localN).normalize()));
    if (xAl.lengthSq() < 1e-9) xAl.copy(dockCanonicalX(t.localN));
    xAl.normalize();

    const label = 'Andocken: ' + t.name;
    renderDockActive(t);
    show([], label, t.p);
    dockDrag.active = {
      target: t,
      source: s,
      worldMatrix,
      xAl: xAl.toArray().map((v) => round(v, 9)),
      xBl: xBl.toArray().map((v) => round(v, 9)),
      label,
    };
    return dockDrag.active;
  }

  function endDockDrag() {
    if (!dockDrag) return;
    clearDockMarkers();
    clearSnap();
    dockDrag = null;
    Viewer.requestRender();
  }

  // ---------- Skizze: Polares Raster & Lineal-Hilfslinien (SK-52) ----------
  function polarSnap(uv, opts = {}) {
    const ox = opts.origin ? opts.origin[0] : 0;
    const oy = opts.origin ? opts.origin[1] : 0;
    const rStep = opts.fine ? 0.1 : Math.max(0.1, Number(opts.rStep) || 5);
    const aStep = opts.fine ? 1 : clamp(Number(opts.aStep) || 15, 1, 90);
    const dx = uv[0] - ox, dy = uv[1] - oy;
    const r0 = Math.hypot(dx, dy);
    const r = round(Math.max(0, Math.round(r0 / rStep) * rStep), 6);
    if (r < 1e-9) return { p: [round(ox, 6), round(oy, 6)], r: 0, deg: 0, rad: 0 };
    const deg0 = (Math.atan2(dy, dx) * 180) / Math.PI;
    const degRaw = Math.round(deg0 / aStep) * aStep;
    const rad = (degRaw * Math.PI) / 180;
    let deg = round(((degRaw % 360) + 360) % 360, 4);
    if (Math.abs(deg - 360) < 1e-6 || Object.is(deg, -0)) deg = 0;
    const p = [round(ox + Math.cos(rad) * r, 6), round(oy + Math.sin(rad) * r, 6)];
    return { p, r, deg, rad };
  }

  function guideSnap(uv, guides, tol) {
    if (!Array.isArray(guides) || !guides.length || !(tol > 0)) return null;
    let bestX = null, dx = tol;
    let bestY = null, dy = tol;
    for (const g of guides) {
      if (!g || !isFinite(g.v)) continue;
      if (g.axis === 'x') {
        const d = Math.abs(g.v - uv[0]);
        if (d < dx) { dx = d; bestX = g; }
      } else if (g.axis === 'y') {
        const d = Math.abs(g.v - uv[1]);
        if (d < dy) { dy = d; bestY = g; }
      }
    }
    if (!bestX && !bestY) return null;
    return {
      x: bestX,
      y: bestY,
      both: !!(bestX && bestY),
      ids: [bestX && bestX.id, bestY && bestY.id].filter(Boolean),
    };
  }

  function hitGuide(uv, guides, tol) {
    if (!Array.isArray(guides) || !guides.length || !(tol > 0)) return null;
    let best = null;
    for (const g of guides) {
      if (!g || !isFinite(g.v)) continue;
      const d = g.axis === 'x' ? Math.abs(g.v - uv[0]) : Math.abs(g.v - uv[1]);
      if (d < tol && (!best || d < best.d)) best = { g, d };
    }
    return best ? { guide: best.g, dist: best.d } : null;
  }

  // ---------- Anzeige ----------
  function show(guides, label, at) {
    clearGuides();
    const pos = [];
    for (const [a, b] of guides) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (pos.length) {
      guideObj = Viewer.makeFat(pos, '#e0457b', 1.6, { depthTest: false, dashed: true, dashSize: 1.6, gapSize: 1.2 });
      guideObj.renderOrder = 40; Viewer.groups.overlay.add(guideObj);
    }
    if (!tip) { tip = h('div', { class: 'snaptip magnet' }); $('#overlay').append(tip); }
    tip.textContent = label;
    const s = Viewer.toScreen(at); tip.style.left = s.x + 'px'; tip.style.top = s.y + 'px';
    Viewer.requestRender();
  }
  function clearGuides() { if (guideObj) { Viewer.groups.overlay.remove(guideObj); Viewer.disposeFat(guideObj); guideObj = null; } }
  function clearSnap() { clearGuides(); if (tip) { tip.remove(); tip = null; } Viewer.requestRender(); }
  function clear() { clearSnap(); clearDockMarkers(); }
  // Flächendaten vorab holen (z. B. beim Überfahren)
  function prime(id, faceIdx) { faceData(id, faceIdx); }
  return {
    onFace, bodies, clear, prime,
    polarSnap, guideSnap, hitGuide,
    dockPoints, beginDockDrag, updateDockDrag, setDockVisible, endDockDrag,
    get label() { return tip ? tip.textContent : null; },
    get dockCount() { return dockDrag ? dockDrag.targetPts.length : 0; },
    get dockTargets() { return dockDrag ? dockDrag.targetPts.map((t) => ({ id: t.id, kind: t.kind, name: t.name, p: t.p.toArray(), n: t.n.toArray() })) : []; },
    get activeDock() { return dockDrag ? dockDrag.active : null; },
  };
})();
