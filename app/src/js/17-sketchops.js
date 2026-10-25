// ================= Skizzen-Werkzeuge: Rechnen (Schnittpunkte, Trimmen, Versatz, Spiegeln, Muster, Fangen) =================
// Reine Geometrie ohne Anzeige. Die Bedienung (Klicks, Vorschau, Regeln anlegen) steht in 55-sketch.js.
const SKO = (() => {
  const TAU = Math.PI * 2;
  const d2 = SK.d2;
  const EPS = 1e-9;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const pr = (p) => [r6(p[0]), r6(p[1])];
  const key = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

  // ---------- Kurven mit Parameter t von 0 bis 1 ----------
  // at(t) = Punkt, tOf(p) = Parameter des nächsten Punkts auf der Kurve (kann bei Bögen/Linien außerhalb 0…1 liegen)
  function curve(seg) {
    if (seg.t === 'line') {
      const a = seg.a, b = seg.b, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      return { type: 'line', closed: false, a, b, at: (t) => [a[0] + dx * t, a[1] + dy * t], tOf: (p) => (L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0) };
    }
    if (seg.t === 'arc') {
      const ai = SK.arcInfo(seg.a, seg.m, seg.b);
      if (!ai) return curve({ t: 'line', a: seg.a, b: seg.b });
      const span = Math.abs(ai.sweep), wrap = TAU / span;
      return {
        type: 'arc', closed: false, c: ai.c, r: ai.r, info: ai,
        at: (t) => { const th = ai.a0 + ai.sweep * t; return [ai.c[0] + Math.cos(th) * ai.r, ai.c[1] + Math.sin(th) * ai.r]; },
        tOf: (p) => {
          const th = Math.atan2(p[1] - ai.c[1], p[0] - ai.c[0]);
          let t = (ai.sweep > 0 ? norm(th - ai.a0) : norm(ai.a0 - th)) / span;
          if (t > wrap - 1e-7) t -= wrap;   // knapp vor dem Start
          return t;
        },
      };
    }
    if (seg.t === 'circle') {
      return {
        type: 'circle', closed: true, c: seg.c, r: seg.r,
        at: (t) => [seg.c[0] + Math.cos(TAU * t) * seg.r, seg.c[1] + Math.sin(TAU * t) * seg.r],
        tOf: (p) => norm(Math.atan2(p[1] - seg.c[1], p[0] - seg.c[0])) / TAU,
      };
    }
    // Spline und Ellipse: als Linienzug mit Bogenlängen-Parameter
    const poly = seg.t === 'ellipse' ? (() => { const q = SK.ellipsePoints(seg.c, seg.rx, seg.ry, seg.rot); q.push(q[0]); return q; })() : seg.t === 'bez' ? SK.bezPoints(seg) : SK.splinePoints(seg.pts, seg.closed);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + d2(poly[i - 1], poly[i]));
    const total = cum[cum.length - 1] || 1;
    return {
      type: 'spline', closed: seg.t === 'ellipse' || !!seg.closed, poly, cum, total, pts: seg.pts || poly,
      at: (t) => {
        const L = Math.max(0, Math.min(1, t)) * total;
        let i = 1; while (i < cum.length - 1 && cum[i] < L) i++;
        const f = cum[i] - cum[i - 1] > 0 ? (L - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
        return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * f, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * f];
      },
      tOf: (p) => {
        let best = Infinity, bt = 0;
        for (let i = 1; i < poly.length; i++) {
          const a = poly[i - 1], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
          const f = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
          const q = [a[0] + dx * f, a[1] + dy * f], dd = d2(p, q);
          if (dd < best) { best = dd; bt = (cum[i - 1] + (cum[i] - cum[i - 1]) * f) / total; }
        }
        return bt;
      },
    };
  }
  const inRange = (C, p) => { if (C.type !== 'arc' && C.type !== 'line') return true; const t = C.tOf(p); return t >= -1e-7 && t <= 1 + 1e-7; };

  // ---------- Schnittpunkte ----------
  function lineLine(a1, b1, a2, b2) {
    const d1 = sub(b1, a1), dd = sub(b2, a2), den = cross(d1, dd);
    if (Math.abs(den) < 1e-12) return [];
    const w = sub(a2, a1);
    const t = cross(w, dd) / den, u = cross(w, d1) / den;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [[a1[0] + d1[0] * t, a1[1] + d1[1] * t]] : [];
  }
  // unendliche Gerade mit Kreis (t beliebig) – gibt die Punkte zurück
  function lineCircleInf(a, b, c, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - c[0], fy = a[1] - c[1];
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
    if (A < 1e-18) return [];
    let disc = B * B - 4 * A * C;
    if (disc < -1e-9 * Math.max(1, A * r * r)) return [];
    disc = Math.max(0, disc);
    const s = Math.sqrt(disc);
    const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
    return ts.map((t) => [a[0] + dx * t, a[1] + dy * t]);
  }
  function lineCircle(a, b, c, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    return lineCircleInf(a, b, c, r).filter((p) => { const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; return t >= -1e-9 && t <= 1 + 1e-9; });
  }
  function circleCircle(c1, r1, c2, r2) {
    const d = d2(c1, c2);
    if (d < 1e-12 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const ux = (c2[0] - c1[0]) / d, uy = (c2[1] - c1[1]) / d, px = c1[0] + ux * a, py = c1[1] + uy * a;
    return h < 1e-9 ? [[px, py]] : [[px - uy * h, py + ux * h], [px + uy * h, py - ux * h]];
  }
  function inter(A, B) {
    if (A.type === 'spline' || B.type === 'spline') {
      const Sp = A.type === 'spline' ? A : B, O = A.type === 'spline' ? B : A;
      const out = [];
      for (let i = 0; i < Sp.poly.length - 1; i++) {
        const piece = curve({ t: 'line', a: Sp.poly[i], b: Sp.poly[i + 1] });
        const O2 = O.type === 'spline' ? O : O;
        for (const p of inter(piece, O2)) if (!out.some((q) => d2(p, q) < 1e-6)) out.push(p);
      }
      return out;
    }
    let pts;
    if (A.type === 'line' && B.type === 'line') pts = lineLine(A.a, A.b, B.a, B.b);
    else if (A.type === 'line') pts = lineCircle(A.a, A.b, B.c, B.r);
    else if (B.type === 'line') pts = lineCircle(B.a, B.b, A.c, A.r);
    else pts = circleCircle(A.c, A.r, B.c, B.r);
    return pts.filter((p) => inRange(A, p) && inRange(B, p));
  }
  // Teile (Linie, Bogen, Kreis, Spline) aller Elemente, jeweils mit Verweis auf Element und Teilnummer
  function partsOf(ents, tag) {
    const out = [];
    for (const e of ents) SK.segsOf(e).forEach((s, i) => out.push({ ent: e, i, seg: s, curve: curve(s), ref: !!tag }));
    return out;
  }
  // alle Schnittpunkte zwischen verschiedenen Elementen (für Fangen)
  function intersections(ents, refs = []) {
    const parts = [...partsOf(ents), ...partsOf(refs, true)];
    const out = [];
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i], B = parts[j];
      if (A.ent === B.ent || (A.ref && B.ref)) continue;
      for (const p of inter(A.curve, B.curve)) if (!out.some((q) => d2(p, q.p) < 1e-6)) out.push({ p, a: A.ent.id, b: B.ent.id });
    }
    return out;
  }
  // nächster Punkt auf einer Kurve
  function closest(C, p) {
    if (C.type === 'line') { const t = Math.max(0, Math.min(1, C.tOf(p))); return C.at(t); }
    if (C.type === 'circle') { const d = d2(p, C.c); if (d < 1e-12) return C.at(0); return [C.c[0] + ((p[0] - C.c[0]) / d) * C.r, C.c[1] + ((p[1] - C.c[1]) / d) * C.r]; }
    if (C.type === 'arc') {
      const t = C.tOf(p);
      if (t >= 0 && t <= 1) { const d = d2(p, C.c); if (d < 1e-12) return C.at(0); return [C.c[0] + ((p[0] - C.c[0]) / d) * C.r, C.c[1] + ((p[1] - C.c[1]) / d) * C.r]; }
      const a = C.at(0), b = C.at(1); return d2(p, a) < d2(p, b) ? a : b;
    }
    return C.at(C.tOf(p));
  }
  function nearestOn(ents, p, tol) {
    let best = null, bd = tol;
    for (const e of ents) for (const s of SK.segsOf(e)) { const q = closest(curve(s), p), d = d2(p, q); if (d < bd) { bd = d; best = { p: q, ent: e }; } }
    return best;
  }
  // Fußpunkt des Lots von „from“ auf ein Element (nur wenn er auf dem Element liegt)
  function perpFeet(from, ents) {
    const out = [];
    for (const e of ents) for (const s of SK.segsOf(e)) {
      const C = curve(s);
      if (C.type === 'line') { const t = C.tOf(from); if (t > 1e-6 && t < 1 - 1e-6) out.push({ p: C.at(t), ent: e }); }
      else if (C.type === 'circle' || C.type === 'arc') {
        const d = d2(from, C.c); if (d < 1e-9) continue;
        for (const sgn of [1, -1]) { const p = [C.c[0] + sgn * ((from[0] - C.c[0]) / d) * C.r, C.c[1] + sgn * ((from[1] - C.c[1]) / d) * C.r]; if (inRange(C, p)) out.push({ p, ent: e }); }
      }
    }
    return out;
  }
  // Berührpunkte der Tangenten von „from“ an Kreise und Bögen
  function tangentFeet(from, ents) {
    const out = [];
    for (const e of ents) for (const s of SK.segsOf(e)) {
      const C = curve(s);
      if (C.type !== 'circle' && C.type !== 'arc') continue;
      const d = d2(from, C.c); if (d <= C.r + 1e-6) continue;
      const a = Math.atan2(from[1] - C.c[1], from[0] - C.c[0]), off = Math.acos(C.r / d);
      for (const sgn of [1, -1]) { const p = [C.c[0] + Math.cos(a + sgn * off) * C.r, C.c[1] + Math.sin(a + sgn * off) * C.r]; if (inRange(C, p)) out.push({ p, ent: e }); }
    }
    return out;
  }

  // ---------- Trimmen ----------
  // target: Linie, Bogen, Kreis oder Spline · cutters: alle anderen Teile (aus partsOf) · uv: Klickpunkt
  function trimPlan(target, cutters, uv) {
    const C = curve(SK.segsOf(target)[0]);
    const cuts = [];
    for (const k of cutters) {
      if (k.ent === target) continue;
      for (const p of inter(C, k.curve)) {
        let t = C.tOf(p);
        if (C.closed) t = norm(t * TAU) / TAU;
        else if (t < -1e-7 || t > 1 + 1e-7) continue;
        if (!cuts.some((c) => Math.abs(c.t - t) < 1e-7)) cuts.push({ t, p, by: { id: k.ent.id, i: k.i, type: k.ent.type, ref: k.ref } });
      }
    }
    cuts.sort((a, b) => a.t - b.t);
    let tc = C.tOf(uv);
    if (C.closed) tc = norm(tc * TAU) / TAU; else tc = Math.max(0, Math.min(1, tc));
    if (C.closed) {
      if (!cuts.length) return { kind: 'delete', C };
      if (cuts.length === 1) return { kind: 'single', C };
      let lo = null, hi = null;
      for (const c of cuts) if (c.t <= tc) lo = c;
      if (!lo) lo = cuts[cuts.length - 1];
      for (const c of cuts) if (c.t > tc) { hi = c; break; }
      if (!hi) hi = cuts[0];
      return { kind: 'cut', C, lo, hi };
    }
    const inner = cuts.filter((c) => c.t > 1e-7 && c.t < 1 - 1e-7);
    if (!inner.length) return { kind: 'delete', C };
    let lo = null, hi = null;
    for (const c of inner) if (c.t <= tc) lo = c;
    for (const c of inner) if (c.t > tc) { hi = c; break; }
    return { kind: 'cut', C, lo: lo || { t: 0, p: C.at(0), by: null }, hi: hi || { t: 1, p: C.at(1), by: null } };
  }
  // Stück der Kurve von t0 bis t1 (bei geschlossenen Kurven darf t1 < t0 sein: dann über den Anfang hinweg)
  function pieceOf(C, t0, t1) {
    if (C.type === 'line') return { type: 'line', a: pr(C.at(t0)), b: pr(C.at(t1)) };
    if (C.type === 'arc') return { type: 'arc', a: pr(C.at(t0)), m: pr(C.at((t0 + t1) / 2)), b: pr(C.at(t1)) };
    if (C.type === 'circle') {
      const span = norm((t1 - t0) * TAU) || TAU, th0 = t0 * TAU;
      const m = [C.c[0] + Math.cos(th0 + span / 2) * C.r, C.c[1] + Math.sin(th0 + span / 2) * C.r];
      return { type: 'arc', a: pr(C.at(t0)), m: pr(m), b: pr(C.at(t1)) };
    }
    // Spline: die feinen Stützpunkte des Linienzugs übernehmen
    const pts = [C.at(t0)];
    const L0 = t0 * C.total, L1 = (t1 >= t0 ? t1 : t1 + 1) * C.total;
    for (let k = 0; k < 2; k++) for (let i = 1; i < C.poly.length - 1; i++) {
      const L = C.cum[i] + k * C.total;
      if (L > L0 + 1e-6 && L < L1 - 1e-6 && (!C.closed ? k === 0 : true)) pts.push(C.poly[i]);
    }
    pts.push(C.at(t1));
    return { type: 'spline', pts: pts.map(pr) };
  }
  // Was bleibt nach dem Trimmen übrig? → Liste von { ent, endA, endB } (endX = Schnitt, an dem das Stück jetzt endet, oder null)
  function trimPieces(plan) {
    const { C, lo, hi } = plan;
    const out = [];
    if (C.closed) {
      out.push({ ent: pieceOf(C, hi.t, lo.t), endA: hi, endB: lo });
    } else {
      if (lo.by) out.push({ ent: pieceOf(C, 0, lo.t), endA: null, endB: lo, keepsId: true });
      if (hi.by) out.push({ ent: pieceOf(C, hi.t, 1), endA: hi, endB: null, keepsId: !lo.by });
    }
    return out.filter((o) => o.ent.type !== 'spline' || o.ent.pts.length >= 2);
  }
  // Vorschau: der Teil, der wegfällt
  function trimRemoved(plan) {
    const { C, lo, hi } = plan;
    if (plan.kind === 'delete' || plan.kind === 'single') return SK.segPoints(C.type === 'circle' ? { t: 'circle', c: C.c, r: C.r } : C.type === 'spline' ? { t: 'spline', pts: C.pts, closed: C.closed } : C.type === 'arc' ? { t: 'arc', a: C.at(0), m: C.at(0.5), b: C.at(1) } : { t: 'line', a: C.a, b: C.b });
    const e = pieceOf(C, lo.t, hi.t);
    return SK.segPoints(e.type === 'line' ? { t: 'line', a: e.a, b: e.b } : e.type === 'arc' ? { t: 'arc', a: e.a, m: e.m, b: e.b } : { t: 'spline', pts: e.pts, closed: false });
  }

  // ---------- Zerlegen: Rechteck, Vieleck, Langloch → einzelne Linien und Bögen ----------
  function explode(e) {
    const segs = SK.segsOf(e);
    return segs.map((s) => (s.t === 'arc' ? { id: uid('e'), type: 'arc', a: pr(s.a), m: pr(s.m), b: pr(s.b), ...(e.con ? { con: true } : {}) } : { id: uid('e'), type: 'line', a: pr(s.a), b: pr(s.b), ...(e.con ? { con: true } : {}) }));
  }

  // ---------- Schablonen: fertige Umrisse mit Maßen (Mitte c) ----------
  const TEMPLATES = {
    pins: { name: 'Pin-Raster (Löcher)', p: { nx: 5, ny: 2, pitch: 2.54, d: 1 } },
    vent: { name: 'Lüftungsgitter (Schlitze)', p: { n: 6, len: 20, w: 2, pitch: 4 } },
    qfp: { name: 'Chip QFP / LQFP', p: { n: 48, body: 7, pitch: 0.5, padW: 0.22, padL: 1 }, note: 'Nennmaße des Bauteils nach JEDEC MS-026 (LQFP-48: Pin-Breite 0,17–0,27 mm) – keine Lötpads.' },
    qfn: { name: 'Chip QFN', p: { n: 32, body: 5, pitch: 0.5, padW: 0.25, padL: 0.4, ep: 3.45 }, note: 'Nennmaße eines QFN-32 mit 5 × 5 mm (Pad-Breite 0,18–0,30 mm, Pad-Länge 0,30–0,50 mm).' },
    bga: { name: 'Chip BGA', p: { nx: 10, ny: 10, pitch: 0.8, d: 0.4, body: 10 }, note: 'Nennmaße eines BGA mit 10 × 10 Kugeln und 0,8 mm Raster: Gehäuse 10 × 10 mm.' },
    soic: { name: 'Chip SOIC / SO', p: { n: 8, pitch: 1.27, bodyL: 4.9, bodyW: 3.9, span: 6, padW: 0.41 }, note: 'Nennmaße nach JEDEC MS-012 (Spannweite 5,8–6,2 mm, Bein-Breite 0,31–0,51 mm).' },
    dip: { name: 'Chip DIP (Durchsteck)', p: { n: 8, pitch: 2.54, row: 7.62, d: 0.8, bodyL: 9.27, bodyW: 6.35 }, note: 'Nennmaße eines DIP-8 mit 300 mil Reihenabstand (Gehäuselänge 8,84–10,16 mm je nach Hersteller).' },
    usbc: { name: 'Ausschnitt USB-C-Buchse', p: { w: 9.5, h: 3.8 }, note: 'Für eine Buchse, die bündig mit der Wand abschließt: Die Buchse ist etwa 8,9 × 3,2 mm groß, dazu kommt rundum etwas Spiel. Sitzt die Buchse tiefer, nimm „Ausschnitt USB-C-Stecker“.' },
    usbcp: { name: 'Ausschnitt USB-C-Stecker', p: { w: 13, h: 7, r: 1.5 }, note: 'Für eine Buchse hinter der Wand: Der Stecker mit Gummikappe darf laut USB-Norm bis 12,35 × 6,5 mm groß sein. Probedruck lohnt sich.' },
    mhole: { name: 'Befestigungslöcher im Rechteck', p: { w: 30.5, h: 30.5, d: 3.4 } },
  };
  const TPLNAMES = { nx: 'Anzahl X', ny: 'Anzahl Y', n: 'Anzahl', pitch: 'Raster', d: 'Ø', len: 'Länge', w: 'Breite', body: 'Gehäuse', padW: 'Pin-Breite', padL: 'Pin-Länge', ep: 'Mittelfläche', bodyL: 'Gehäuse lang', bodyW: 'Gehäuse breit', span: 'Spannweite', row: 'Reihenabstand', h: 'Höhe', r: 'Eckradius' };
  const pr1 = (v) => Math.round(v * 1e4) / 1e4;
  function tplEnts(type, P, c) {
    const out = [];
    const R = (x0, y0, x1, y1, con) => out.push({ id: uid('e'), type: 'rect', a: pr([c[0] + Math.min(x0, x1), c[1] + Math.min(y0, y1)]), b: pr([c[0] + Math.max(x0, x1), c[1] + Math.max(y0, y1)]), ...(con ? { con: true } : {}) });
    const C = (x, y, r) => out.push({ id: uid('e'), type: 'circle', c: pr([c[0] + x, c[1] + y]), r: pr1(r) });
    const pos = (k, d) => { const v = Number(P[k]); return isFinite(v) && v > 0 ? v : d; };
    const int = (k, d) => Math.max(1, Math.round(pos(k, d)));
    if (type === 'pins') { const nx = int('nx', 5), ny = int('ny', 2), t = pos('pitch', 2.54), r = pos('d', 1) / 2; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) C((i - (nx - 1) / 2) * t, (j - (ny - 1) / 2) * t, r); }
    else if (type === 'vent') { const n = int('n', 6), L = pos('len', 20), w = pos('w', 2), t = pos('pitch', 4); for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * t; out.push({ id: uid('e'), type: 'slot', a: pr([c[0] + x, c[1] - (L - w) / 2]), b: pr([c[0] + x, c[1] + (L - w) / 2]), r: pr1(w / 2) }); } }
    else if (type === 'qfp' || type === 'qfn') {
      const n = Math.max(4, Math.round(pos('n', 32) / 4) * 4), s = n / 4, B = pos('body', 7) / 2, t = pos('pitch', 0.5), pw = pos('padW', 0.3) / 2, pl = pos('padL', 1);
      R(-B, -B, B, B);
      for (let i = 0; i < s; i++) {
        const u = (i - (s - 1) / 2) * t;
        if (type === 'qfp') { R(u - pw, -B - pl, u + pw, -B); R(u - pw, B, u + pw, B + pl); R(-B - pl, u - pw, -B, u + pw); R(B, u - pw, B + pl, u + pw); }
        else { R(u - pw, -B, u + pw, -B + pl); R(u - pw, B - pl, u + pw, B); R(-B, u - pw, -B + pl, u + pw); R(B - pl, u - pw, B, u + pw); }
      }
      if (type === 'qfn') { const e = pos('ep', 0) / 2; if (e > 0 && e < B - pl) R(-e, -e, e, e); }
    }
    else if (type === 'bga') { const nx = int('nx', 10), ny = int('ny', 10), t = pos('pitch', 0.8), r = pos('d', 0.4) / 2, B = Math.max(pos('body', 10) / 2, ((Math.max(nx, ny) - 1) * t) / 2 + r + 0.2); R(-B, -B, B, B); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) C((i - (nx - 1) / 2) * t, (j - (ny - 1) / 2) * t, r); }
    else if (type === 'soic') { const n = Math.max(2, Math.round(pos('n', 8) / 2) * 2), s = n / 2, t = pos('pitch', 1.27), L = pos('bodyL', 4.9) / 2, W = pos('bodyW', 3.9) / 2, S = Math.max(pos('span', 6) / 2, W + 0.2), pw = pos('padW', 0.41) / 2; R(-L, -W, L, W); for (let i = 0; i < s; i++) { const x = (i - (s - 1) / 2) * t; R(x - pw, -S, x + pw, -W); R(x - pw, W, x + pw, S); } }
    else if (type === 'usbc') { const w = pos('w', 9.5), hh = Math.min(pos('h', 3.8), w); out.push({ id: uid('e'), type: 'slot', a: pr([c[0] - (w - hh) / 2, c[1]]), b: pr([c[0] + (w - hh) / 2, c[1]]), r: pr1(hh / 2) }); }
    else if (type === 'usbcp') {
      const w = pos('w', 13) / 2, hh = pos('h', 7) / 2, r = Math.min(Math.max(0, Number(P.r) || 0), w - 1e-3, hh - 1e-3);
      if (r < 1e-3) R(-w, -hh, w, hh);
      else {
        const P2 = (x, y) => pr([c[0] + x, c[1] + y]), L = (a, b) => out.push({ id: uid('e'), type: 'line', a, b });
        const A = (cx, cy, a0) => { const am = a0 + Math.PI / 4, a1 = a0 + Math.PI / 2; out.push({ id: uid('e'), type: 'arc', a: P2(cx + r * Math.cos(a0), cy + r * Math.sin(a0)), m: P2(cx + r * Math.cos(am), cy + r * Math.sin(am)), b: P2(cx + r * Math.cos(a1), cy + r * Math.sin(a1)) }); };
        L(P2(-w + r, -hh), P2(w - r, -hh)); A(w - r, -hh + r, -Math.PI / 2);
        L(P2(w, -hh + r), P2(w, hh - r)); A(w - r, hh - r, 0);
        L(P2(w - r, hh), P2(-w + r, hh)); A(-w + r, hh - r, Math.PI / 2);
        L(P2(-w, hh - r), P2(-w, -hh + r)); A(-w + r, -hh + r, Math.PI);
      }
    }
    else if (type === 'mhole') { const w = pos('w', 30.5) / 2, hh = pos('h', 30.5) / 2, r = pos('d', 3.4) / 2; for (const sx of [-1, 1]) for (const sy of [-1, 1]) C(sx * w, sy * hh, r); }
    else if (type === 'dip') { const n = Math.max(2, Math.round(pos('n', 8) / 2) * 2), s = n / 2, t = pos('pitch', 2.54), rw = pos('row', 7.62) / 2, r = pos('d', 0.8) / 2, L = pos('bodyL', 9.27) / 2, W = pos('bodyW', 6.35) / 2; R(-L, -W, L, W, true); for (let i = 0; i < s; i++) { const x = (i - (s - 1) / 2) * t; C(x, -rw, r); C(x, rw, r); } }
    return out;
  }

  // ---------- Ketten (zusammenhängende Linien und Bögen) ----------
  function chainOf(ents, e0) {
    const adj = new Map();
    const cand = ents.filter((e) => (e.type === 'line' || e.type === 'arc') && !!e.con === !!e0.con && d2(e.a, e.b) > 1e-9);
    const put = (p, e) => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); };
    for (const e of cand) { put(e.a, e); put(e.b, e); }
    const seq = [{ e: e0, rev: false }];
    const used = new Set([e0.id]);
    let closed = false, pt = e0.b;
    for (let guard = 0; guard < 500; guard++) {
      const all = adj.get(key(pt)) || [];
      if (all.length !== 2) break;
      const nxt = all.find((x) => !used.has(x.id));
      if (!nxt) { closed = true; break; }
      used.add(nxt.id);
      const rev = key(nxt.b) === key(pt);
      seq.push({ e: nxt, rev });
      pt = rev ? nxt.a : nxt.b;
    }
    if (!closed) {
      pt = e0.a;
      for (let guard = 0; guard < 500; guard++) {
        const all = adj.get(key(pt)) || [];
        if (all.length !== 2) break;
        const nxt = all.find((x) => !used.has(x.id));
        if (!nxt) break;
        used.add(nxt.id);
        const rev = key(nxt.a) === key(pt);   // entgegen der Laufrichtung eingefügt
        seq.unshift({ e: nxt, rev });
        pt = rev ? nxt.b : nxt.a;
      }
    }
    return { segs: seq.map((s) => ({ e: s.e, rev: s.rev, a: s.rev ? s.e.b : s.e.a, b: s.rev ? s.e.a : s.e.b })), closed };
  }

  // ---------- Versatz ----------
  // Unendliche Kurve eines versetzten Stücks: { line: {p, u} } oder { circle: {c, r} }
  function infInter(P, Q) {
    if (P.line && Q.line) {
      const den = cross(P.line.u, Q.line.u); if (Math.abs(den) < 1e-9) return [];
      const w = sub(Q.line.p, P.line.p), t = cross(w, Q.line.u) / den;
      return [[P.line.p[0] + P.line.u[0] * t, P.line.p[1] + P.line.u[1] * t]];
    }
    if (P.line) return lineCircleInf(P.line.p, [P.line.p[0] + P.line.u[0], P.line.p[1] + P.line.u[1]], Q.circle.c, Q.circle.r);
    if (Q.line) return lineCircleInf(Q.line.p, [Q.line.p[0] + Q.line.u[0], Q.line.p[1] + Q.line.u[1]], P.circle.c, P.circle.r);
    return circleCircle(P.circle.c, P.circle.r, Q.circle.c, Q.circle.r);
  }
  // sd > 0: nach links (in Laufrichtung der Kette), sd < 0: nach rechts
  function offsetChain(chain, sd) {
    const n = chain.segs.length;
    const items = chain.segs.map((s) => {
      if (s.e.type === 'line') {
        const L = d2(s.a, s.b), u = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L], nv = [-u[1], u[0]];
        const A = [s.a[0] + nv[0] * sd, s.a[1] + nv[1] * sd], B = [s.b[0] + nv[0] * sd, s.b[1] + nv[1] * sd];
        return { s, line: { p: A, u }, start: A, end: B };
      }
      const ai = SK.arcInfo(s.a, s.e.m, s.b);
      if (!ai) return null;
      const r = ai.sweep > 0 ? ai.r - sd : ai.r + sd;
      if (r < 1e-6) return null;
      const at = (p) => { const d = d2(p, ai.c); return [ai.c[0] + ((p[0] - ai.c[0]) / d) * r, ai.c[1] + ((p[1] - ai.c[1]) / d) * r]; };
      return { s, ai, r, circle: { c: ai.c, r }, start: at(s.a), end: at(s.b) };
    });
    if (items.some((x) => !x)) return { ok: false, why: 'Der Versatz ist hier zu groß – ein Bogen würde verschwinden.' };
    const V = [];   // Eckpunkte: V[i] ist der Anfang von Stück i
    const joint = (i, j) => {
      const P = items[i], Q = items[j];
      const c = infInter(P, Q);
      if (!c.length) return d2(P.end, Q.start) < 1e-5 ? P.end : null;
      let best = c[0], bd = d2(c[0], P.end);
      for (const x of c) { const dd = d2(x, P.end); if (dd < bd) { bd = dd; best = x; } }
      return best;
    };
    for (let i = 0; i < n; i++) {
      if (i === 0) { if (chain.closed) { const v = joint(n - 1, 0); if (!v) return { ok: false, why: 'Der Versatz passt hier nicht an die Ecke.' }; V.push(v); } else V.push(items[0].start); }
      else { const v = joint(i - 1, i); if (!v) return { ok: false, why: 'Der Versatz passt hier nicht an die Ecke.' }; V.push(v); }
    }
    if (!chain.closed) V.push(items[n - 1].end);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = V[i], b = chain.closed ? V[(i + 1) % n] : V[i + 1], it = items[i];
      let ent;
      if (it.line) {
        if ((b[0] - a[0]) * it.line.u[0] + (b[1] - a[1]) * it.line.u[1] < 1e-6) return { ok: false, why: 'Der Versatz ist hier zu groß – eine Linie würde verschwinden.' };
        ent = { type: 'line', a: pr(a), b: pr(b) };
      } else {
        const c = it.ai.c, a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
        const sw = it.ai.sweep > 0 ? norm(a1 - a0) : -norm(a0 - a1);
        if (Math.abs(sw) < 1e-6 || Math.abs(sw) > Math.abs(it.ai.sweep) + Math.PI) return { ok: false, why: 'Der Versatz ist hier zu groß – ein Bogen würde verschwinden.' };
        const m = [c[0] + Math.cos(a0 + sw / 2) * it.r, c[1] + Math.sin(a0 + sw / 2) * it.r];
        ent = { type: 'arc', a: pr(a), m: pr(m), b: pr(b) };
      }
      // wieder so ausrichten wie das Original
      if (it.s.rev) { const t = ent.a; ent.a = ent.b; ent.b = t; }
      if (it.s.e.con) ent.con = true;
      out.push({ src: it.s.e, ent });
    }
    return { ok: true, items: out };
  }
  // Versatz einer Form (Kreis, Rechteck, Vieleck, Langloch, Spline); d > 0 = nach außen / größer, d < 0 = nach innen
  function offsetShape(e, d) {
    const n = Math.max(3, Math.round(e.n || 6));
    if (e.type === 'circle') { const r = e.r + d; return r > 1e-6 ? { ok: true, ent: { type: 'circle', c: e.c.slice(), r: r6(r) } } : { ok: false, why: 'Der Kreis würde verschwinden.' }; }
    if (e.type === 'slot') { const r = e.r + d; return r > 1e-6 ? { ok: true, ent: { type: 'slot', a: e.a.slice(), b: e.b.slice(), r: r6(r) } } : { ok: false, why: 'Das Langloch würde verschwinden.' }; }
    if (e.type === 'poly') { const r = e.r + d / Math.cos(Math.PI / n); return r > 1e-6 ? { ok: true, ent: { type: 'poly', c: e.c.slice(), r: r6(r), n, rot: e.rot || 0 } } : { ok: false, why: 'Das Vieleck würde verschwinden.' }; }
    if (e.type === 'rect') {
      const sa = [e.a[0] <= e.b[0] ? -1 : 1, e.a[1] <= e.b[1] ? -1 : 1], sb = [-sa[0], -sa[1]];
      const w = Math.abs(e.b[0] - e.a[0]) + 2 * d, h = Math.abs(e.b[1] - e.a[1]) + 2 * d;
      if (w < 1e-6 || h < 1e-6) return { ok: false, why: 'Das Rechteck würde verschwinden.' };
      const sgn = d >= 0 ? 1 : -1;
      return { ok: true, ent: { type: 'rect', a: pr([e.a[0] + sa[0] * d, e.a[1] + sa[1] * d]), b: pr([e.b[0] + sb[0] * d, e.b[1] + sb[1] * d]) }, sgs: [sa[0] * sgn, sa[1] * sgn, sb[0] * sgn, sb[1] * sgn] };
    }
    if (e.type === 'spline') {
      const P = e.pts, m = P.length;
      const pts = P.map((p, i) => {
        const p0 = e.closed ? P[(i - 1 + m) % m] : P[Math.max(0, i - 1)], p1 = e.closed ? P[(i + 1) % m] : P[Math.min(m - 1, i + 1)];
        const t = sub(p1, p0), L = Math.hypot(t[0], t[1]) || 1;
        return pr([p[0] - (t[1] / L) * d, p[1] + (t[0] / L) * d]);
      });
      return { ok: true, ent: { type: 'spline', pts, closed: !!e.closed } };
    }
    return { ok: false, why: 'Dafür gibt es noch keinen Versatz.' };
  }

  // ---------- Verbindungspunkte für Regeln (Spiegeln, Muster) ----------
  // Welche Punkte eines Elements müssen mit der Kopie verbunden werden? → Liste von Punkt-Namen
  function linkPoints(e) {
    switch (e.type) {
      case 'line': case 'slot': return ['a', 'b'];
      case 'point': return ['a'];
      case 'arc': return ['a', 'b', 'c'];
      case 'circle': case 'poly': case 'ellipse': return ['c'];
      case 'text': return ['a'];
      case 'rect': return ['k0', 'k1', 'k2', 'k3'];
      case 'spline': return e.pts.map((_, i) => 'p' + i);
    }
    return [];
  }
  const hasRadius = (e) => e.type === 'circle' || e.type === 'poly' || e.type === 'slot';

  // Kopie eines Elements mit Punktabbildung f. polyRot(e) gibt die neue Drehung eines Vielecks. Ergebnis: { ents, pairs, rad }
  function mapEnt(e, f, polyRot, explodeRect) {
    const id = uid('e');
    const base = e.con ? { con: true } : {};
    const R = (id2, p) => ({ e: id2, p });
    const ents = [], pairs = [], rad = [];
    switch (e.type) {
      case 'point': ents.push({ id, type: 'point', a: pr(f(e.a)), ...base }); pairs.push([R(e.id, 'a'), R(id, 'a')]); break;
      case 'line': ents.push({ id, type: 'line', a: pr(f(e.a)), b: pr(f(e.b)), ...base }); pairs.push([R(e.id, 'a'), R(id, 'a')], [R(e.id, 'b'), R(id, 'b')]); break;
      case 'arc': {
        ents.push({ id, type: 'arc', a: pr(f(e.a)), m: pr(f(e.m)), b: pr(f(e.b)), ...base });
        pairs.push([R(e.id, 'a'), R(id, 'a')], [R(e.id, 'b'), R(id, 'b')], [R(e.id, 'c'), R(id, 'c')]); break;
      }
      case 'circle': ents.push({ id, type: 'circle', c: pr(f(e.c)), r: e.r, ...base }); pairs.push([R(e.id, 'c'), R(id, 'c')]); rad.push([{ e: e.id }, { e: id }]); break;
      case 'slot': ents.push({ id, type: 'slot', a: pr(f(e.a)), b: pr(f(e.b)), r: e.r, ...base }); pairs.push([R(e.id, 'a'), R(id, 'a')], [R(e.id, 'b'), R(id, 'b')]); rad.push([{ e: e.id }, { e: id }]); break;
      case 'poly': ents.push({ id, type: 'poly', c: pr(f(e.c)), r: e.r, n: e.n, rot: polyRot(e), ...base }); pairs.push([R(e.id, 'c'), R(id, 'c')]); rad.push([{ e: e.id }, { e: id }]); break;
      case 'text': {
        const p0 = f(e.a), u = (e.rot || 0), px = f([e.a[0] + Math.cos(u), e.a[1] + Math.sin(u)]), py = f([e.a[0] - Math.sin(u), e.a[1] + Math.cos(u)]);
        const ux = [px[0] - p0[0], px[1] - p0[1]], uy = [py[0] - p0[0], py[1] - p0[1]], flip = ux[0] * uy[1] - ux[1] * uy[0] < 0;
        ents.push({ ...e, id, a: pr(p0), rot: Math.atan2(ux[1], ux[0]), mir: flip ? !e.mir : !!e.mir, ...base }); pairs.push([R(e.id, 'a'), R(id, 'a')]); break;
      }
      case 'ellipse': ents.push({ id, type: 'ellipse', c: pr(f(e.c)), rx: e.rx, ry: e.ry, rot: polyRot(e), ...base }); pairs.push([R(e.id, 'c'), R(id, 'c')]); break;
      case 'spline': ents.push({ id, type: 'spline', pts: e.pts.map((p) => pr(f(p))), closed: !!e.closed, ...base }); e.pts.forEach((_, i) => pairs.push([R(e.id, 'p' + i), R(id, 'p' + i)])); break;
      case 'rect': {
        if (!explodeRect) {
          ents.push({ id, type: 'rect', a: pr(f(e.a)), b: pr(f(e.b)), ...base });
          for (let i = 0; i < 4; i++) pairs.push([R(e.id, 'k' + i), R(id, 'k' + i)]);
        } else {
          const c = SK.rectCorners(e);
          const ids = c.map(() => uid('e'));
          c.forEach((q, i) => { ents.push({ id: ids[i], type: 'line', a: pr(f(q)), b: pr(f(c[(i + 1) % 4])), ...base }); pairs.push([R(e.id, 'k' + i), R(ids[i], 'a')]); });
        }
        break;
      }
    }
    return { ents, pairs, rad };
  }

  // ---------- Spiegeln ----------
  function mirrorPoint(p, A, B) {
    const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy, t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l2;
    const fx = A[0] + t * dx, fy = A[1] + t * dy;
    return [2 * fx - p[0], 2 * fy - p[1]];
  }
  function mirrorEnt(e, A, B) {
    const phi = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const axisAligned = Math.abs(B[0] - A[0]) < 1e-9 || Math.abs(B[1] - A[1]) < 1e-9;
    return mapEnt(e, (p) => mirrorPoint(p, A, B), (q) => 2 * phi - (q.rot || 0) - Math.PI, e.type === 'rect' && !axisAligned);
  }

  // ---------- Muster ----------
  function moveEnt(e, dx, dy) { return mapEnt(e, (p) => [p[0] + dx, p[1] + dy], (q) => q.rot || 0, false); }
  const rotPt = (p, C, th) => { const cs = Math.cos(th), sn = Math.sin(th), x = p[0] - C[0], y = p[1] - C[1]; return [C[0] + cs * x - sn * y, C[1] + sn * x + cs * y]; };
  function rotateEnt(e, C, th) { return mapEnt(e, (p) => rotPt(p, C, th), (q) => (q.rot || 0) + th, true); }

  return { TEMPLATES, TPLNAMES, tplEnts, curve, inter, intersections, partsOf, nearestOn, closest, perpFeet, tangentFeet, trimPlan, trimPieces, trimRemoved, explode, chainOf, offsetChain, offsetShape, linkPoints, hasRadius, mirrorEnt, mirrorPoint, moveEnt, rotateEnt, rotPt, pr };
})();
