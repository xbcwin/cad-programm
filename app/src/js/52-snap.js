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
    const info = r.data.faces[faceIdx]; if (!info || info.t !== 'PLANE' || !info.n || !info.c) return null;
    const k = r.key + '|' + faceIdx;
    const c = cache.get(k);
    if (c) return c === 'pending' ? null : c;
    cache.set(k, 'pending');
    if (cache.size > 60) for (const key of [...cache.keys()].slice(0, 20)) cache.delete(key);
    Kernel.call('faceLoops', { key: r.key, faceIdx }).then((loops) => { cache.set(k, build(info, loops)); }).catch(() => cache.delete(k));
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
  function onFace(id, faceIdx, pointWorld) {
    if (!on()) { clear(); return null; }
    const D = faceData(id, faceIdx); if (!D) { clear(); return null; }
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
