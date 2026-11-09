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
    if (!on()) { clear(); return null; }
    const D = faceData(id, faceIdx); if (!D) { clear(); return null; }
    if (D.curved) return opt.flatOnly ? (clear(), null) : onCurved(id, D, pointWorld, opt.normal);
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
    if (!label) { clear(); return null; }
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
    if (!pick[0] && !pick[1]) { clear(); return null; }
    let ss = s, tt = t;
    for (let it = 0; it < 4; it++) {
      if (pick[0]) { const v = lineAt(pick[0].L, tt); if (v !== null) ss = v; }
      if (pick[1]) { const v = lineAt(pick[1].L, ss); if (v !== null) tt = v; }
    }
    if (!inside(g, ss, tt)) { clear(); return null; }
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
    if (!on()) { clear(); return null; }
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
    if (!names.length) { clear(); return null; }
    // Hilfslinien bei der neuen Lage zeichnen
    const label = [...new Set(names)].join(' · ');
    show(guides, label, new THREE.Vector3((lo[0] + hi[0]) / 2 + res[0] - d[0], hi[1] + res[1] - d[1], z));
    return { d: res, label };
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
  function clear() { clearGuides(); if (tip) { tip.remove(); tip = null; } Viewer.requestRender(); }
  // Flächendaten vorab holen (z. B. beim Überfahren)
  function prime(id, faceIdx) { faceData(id, faceIdx); }
  return { onFace, bodies, clear, prime, get label() { return tip ? tip.textContent : null; } };
})();
