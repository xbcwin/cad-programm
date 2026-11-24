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
    // Spline, Ellipse und elliptischer Bogen: als Linienzug mit Bogenlängen-Parameter
    const poly = seg.t === 'ellipse' ? (() => { const q = SK.ellipsePoints(seg.c, seg.rx, seg.ry, seg.rot); q.push(q[0]); return q; })()
      : seg.t === 'ellarc' ? SK.ellArcPoints(seg.c, seg.rx, seg.ry, seg.rot, seg.a0, seg.a1, seg.ccw)
      : seg.t === 'bez' ? SK.bezPoints(seg) : SK.splinePoints(seg.pts, seg.closed);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + d2(poly[i - 1], poly[i]));
    const total = cum[cum.length - 1] || 1;
    return {
      type: 'spline', closed: seg.t === 'ellipse' || (seg.t !== 'ellarc' && !!seg.closed), poly, cum, total, pts: seg.pts || poly,
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


  // ---------- Formen-Sammlung (SK-41): geschlossene Umrisse mit einstellbaren Maßen (Mitte c) ----------
  const SHAPES = {
    star: { name: 'Stern', p: { n: 5, ro: 20, ri: 8 } },
    arrow: { name: 'Pfeil', p: { len: 30, shaftW: 8, headW: 18, headL: 12 } },
    heart: { name: 'Herz', p: { w: 24, h: 22 } },
    gear: { name: 'Zahnrad-Umriss', p: { z: 12, m: 2, bore: 6 } },
    keyhole: { name: 'Schlüsselloch', p: { d: 10, w: 5, h: 20 } },
  };
  const SHAPENAMES = {
    n: 'Zacken', ro: 'Außenradius', ri: 'Innenradius',
    len: 'Länge', shaftW: 'Schaftbreite', headW: 'Kopfbreite', headL: 'Kopflänge',
    w: 'Breite', h: 'Höhe', z: 'Zähne', m: 'Modul', bore: 'Bohrung Ø', d: 'Kopf Ø',
  };
  function shapeEnts(type, P = {}, c = [0, 0]) {
    const out = [];
    const pos = (k, d) => { const v = Number(P[k]); return isFinite(v) && v > 0 ? v : d; };
    const cx = c[0] || 0, cy = c[1] || 0;
    const polyLines = (pts) => {
      const rp = pts.map((q) => pr([cx + q[0], cy + q[1]]));
      for (let i = 0; i < rp.length; i++) out.push({ id: uid('e'), type: 'line', a: rp[i].slice(), b: rp[(i + 1) % rp.length].slice() });
    };
    if (type === 'star') {
      const n = Math.max(3, Math.min(64, Math.round(pos('n', 5))));
      const ro = pos('ro', 20), ri = Math.min(pos('ri', 8), ro * 0.95);
      const pts = [];
      for (let i = 0; i < 2 * n; i++) {
        const th = Math.PI / 2 + (i * Math.PI) / n;
        const r = i % 2 === 0 ? ro : ri;
        pts.push([Math.cos(th) * r, Math.sin(th) * r]);
      }
      polyLines(pts);
    } else if (type === 'arrow') {
      const len = pos('len', 30);
      const headL = Math.min(pos('headL', 12), len * 0.9);
      const shaftW = pos('shaftW', 8);
      const headW = Math.max(pos('headW', 18), shaftW + 0.5);
      const x0 = -len / 2, x1 = len / 2 - headL, x2 = len / 2;
      const sh = shaftW / 2, hh = headW / 2;
      polyLines([[x0, -sh], [x1, -sh], [x1, -hh], [x2, 0], [x1, hh], [x1, sh], [x0, sh]]);
    } else if (type === 'heart') {
      const w = pos('w', 24), hh = pos('h', 22);
      const half = [[0, -0.50], [0.28, -0.26], [0.50, 0.04], [0.46, 0.34], [0.26, 0.50], [0.08, 0.38], [0, 0.22]];
      const rightPts = half.map(([x, y]) => pr([cx + x * w, cy + y * hh]));
      const leftPts = half.slice().reverse().map(([x, y]) => pr([cx - x * w, cy + y * hh]));
      leftPts[0] = rightPts[rightPts.length - 1].slice();
      leftPts[leftPts.length - 1] = rightPts[0].slice();
      out.push({ id: uid('e'), type: 'spline', pts: rightPts, closed: false });
      out.push({ id: uid('e'), type: 'spline', pts: leftPts, closed: false });
    } else if (type === 'gear') {
      const z = Math.max(5, Math.min(48, Math.round(pos('z', 12))));
      const m = Math.max(0.2, pos('m', 2));
      const bore = Math.max(0, Number(P.bore) || 0);
      const rp = (m * z) / 2, ra = rp + m, rf = Math.max(0.2 * m, rp - 1.25 * m);
      const alpha = (20 * Math.PI) / 180, rb = rp * Math.cos(alpha);
      const step = TAU / z, psiP = Math.PI / (2 * z), inv0 = Math.tan(alpha) - alpha, psiB = psiP + inv0;
      const psiTip = ra > rb ? Math.max(0.06 * step, psiB - (Math.tan(Math.acos(rb / ra)) - Math.acos(rb / ra))) : 0.15 * step;
      const psiRoot = Math.min(0.38 * step, Math.max(psiP * 1.15, psiB + (Math.max(0, rb - rf) / rp) * 0.25));
      const pts = [];
      for (let i = 0; i < z; i++) {
        const th = i * step;
        for (const [r, a] of [[rf, th - psiRoot], [ra, th - psiTip], [ra, th + psiTip], [rf, th + psiRoot]]) {
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
      }
      polyLines(pts);
      if (bore > 0.1 && bore / 2 < rf - 0.2 * m) out.push({ id: uid('e'), type: 'circle', c: pr([cx, cy]), r: pr1(bore / 2) });
    } else if (type === 'keyhole') {
      const R = pos('d', 10) / 2, r = Math.min(pos('w', 5) / 2, R * 0.92);
      const dy = Math.sqrt(Math.max(1e-6, R * R - r * r));
      const hh = Math.max(pos('h', 20), R + dy + r + 0.5);
      const C1y = cy + hh / 2 - R, C2y = cy - hh / 2 + r;
      const PR = pr([cx + r, C1y - dy]), PL = pr([cx - r, C1y - dy]);
      const QL = pr([cx - r, C2y]), QR = pr([cx + r, C2y]);
      out.push({ id: uid('e'), type: 'arc', a: PR.slice(), m: pr([cx, C1y + R]), b: PL.slice() });
      out.push({ id: uid('e'), type: 'line', a: PL.slice(), b: QL.slice() });
      out.push({ id: uid('e'), type: 'arc', a: QL.slice(), m: pr([cx, C2y - r]), b: QR.slice() });
      out.push({ id: uid('e'), type: 'line', a: QR.slice(), b: PR.slice() });
    }
    return out;
  }

  // ---------- Kurve aus Formel (SK-38) und aus Tabelle / CSV (SK-39) ----------
  const FORMULA_CURVES = {
    sinus: { name: 'Sinus (y = sin(x))', mode: 'yfx', fx: '', fy: 'sin(x)', from: '0', to: '2*pi', n: 41, kind: 'spline', closed: false },
    evolvente: { name: 'Evolvente (Zahnradflanke)', mode: 'param', fx: '10 * (cos(t) + t * sin(t))', fy: '10 * (sin(t) - t * cos(t))', from: '0', to: '1.2', n: 25, kind: 'spline', closed: false },
    parabel: { name: 'Parabel (y = 0,05·x²)', mode: 'yfx', fx: '', fy: '0.05 * x^2', from: '-20', to: '20', n: 25, kind: 'spline', closed: false },
    spirale: { name: 'Archimedische Spirale', mode: 'param', fx: '2 * t * cos(t)', fy: '2 * t * sin(t)', from: '0', to: '4*pi', n: 65, kind: 'spline', closed: false },
  };
  function evalFormulaCurve(spec = {}, vars = {}) {
    const mode = spec.mode === 'param' ? 'param' : 'yfx';
    const fyClean = String(spec.fy ?? '').trim().replace(/^\s*(?:y(?:\s*\(\s*[xt]\s*\))?|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    const fxClean = String(spec.fx ?? '').trim().replace(/^\s*x(?:\s*\(\s*t\s*\))?\s*=\s*/i, '');
    if (!fyClean) return { ok: false, pts: [], error: mode === 'param' ? 'Bitte gib eine Formel für y(t) ein.' : 'Bitte gib eine Formel für y = f(x) ein.' };
    if (mode === 'param' && !fxClean) return { ok: false, pts: [], error: 'Bitte gib eine Formel für x(t) ein.' };
    const fromStr = String(spec.from ?? '').trim(), toStr = String(spec.to ?? '').trim();
    if (!fromStr || !toStr) return { ok: false, pts: [], error: 'Bitte gib Start- und Endwert für den Bereich ein.' };
    const r0 = Expr.tryEvalRad(fromStr, vars);
    if (!r0.ok) return { ok: false, pts: [], error: 'Startwert: ' + r0.error };
    const r1 = Expr.tryEvalRad(toStr, vars);
    if (!r1.ok) return { ok: false, pts: [], error: 'Endwert: ' + r1.error };
    const t0 = r0.value, t1 = r1.value;
    if (Math.abs(t1 - t0) < 1e-12) return { ok: false, pts: [], error: 'Start- und Endwert dürfen nicht gleich sein.' };
    const nRaw = Number(spec.n);
    if (!isFinite(nRaw) || nRaw < 2 || nRaw > 200) return { ok: false, pts: [], error: 'Die Punktzahl muss zwischen 2 und 200 liegen.' };
    const n = Math.round(nRaw);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = t0 + ((t1 - t0) * i) / (n - 1);
      if (mode === 'param') {
        const env = { ...vars, t: u };
        const rx = Expr.tryEvalRad(fxClean, env);
        if (!rx.ok) return { ok: false, pts: [], error: 'x(t): ' + rx.error };
        const ry = Expr.tryEvalRad(fyClean, env);
        if (!ry.ok) return { ok: false, pts: [], error: 'y(t): ' + ry.error };
        const p = pr([rx.value, ry.value]);
        if (!pts.length || d2(pts[pts.length - 1], p) >= 1e-7) pts.push(p);
      } else {
        const env = { ...vars, x: u, t: u };
        const ry = Expr.tryEvalRad(fyClean, env);
        if (!ry.ok) return { ok: false, pts: [], error: 'y = f(x): ' + ry.error };
        const p = pr([u, ry.value]);
        if (!pts.length || d2(pts[pts.length - 1], p) >= 1e-7) pts.push(p);
      }
    }
    if (pts.length < 2) return { ok: false, pts: [], error: 'Die Formel ergibt weniger als 2 verschiedene Punkte.' };
    return { ok: true, pts, t0, t1, closed: !!spec.closed };
  }
  function splitCsvLine(line, sep) {
    if (sep === 'ws') return line.trim().split(/\s+/);
    const out = []; let cur = '', qq = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (qq) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') qq = false;
        else cur += ch;
      } else if (ch === '"') qq = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parsePointsCSV(text, opts = {}) {
    const minPoints = opts && opts.minPoints === 1 ? 1 : 2;
    const lines = String(text ?? '').replace(/^\ufeff/, '').split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
    if (!lines.length) return { ok: false, pts: [], error: 'Die CSV-Datei ist leer.' };
    let sep = 'ws';
    if (lines.some((l) => l.includes(';'))) sep = ';';
    else if (lines.some((l) => l.includes('\t'))) sep = '\t';
    else if (lines.some((l) => l.includes(','))) {
      const testLine = lines[lines.length - 1];
      const byComma = splitCsvLine(testLine, ',');
      if (byComma.length >= 2 && byComma.slice(0, 2).every((c) => !isNaN(parseNum(c)))) sep = ',';
      else if (/\s+/.test(testLine)) sep = 'ws';
      else sep = ',';
    }
    const firstCells = splitCsvLine(lines[0], sep);
    const hasHeader = firstCells.length < 2 || isNaN(parseNum(firstCells[0])) || isNaN(parseNum(firstCells[1]));
    let colX = 0, colY = 1;
    if (hasHeader) {
      const lower = firstCells.map((c) => c.trim().toLowerCase());
      const ix = lower.indexOf('x');
      const iy = lower.indexOf('y');
      if (ix >= 0 && iy >= 0 && ix !== iy) {
        colX = ix; colY = iy;
      } else if (firstCells.length >= 3 && /^(id|nr|no|index|punkt|point|name|#)$/i.test(firstCells[0])) {
        colX = 1; colY = 2;
      }
    }
    const startIdx = hasHeader ? 1 : 0;
    const pts = []; let skipped = 0;
    for (let i = startIdx; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], sep);
      if (cells.length <= Math.max(colX, colY)) { skipped++; continue; }
      const x = parseNum(cells[colX]), y = parseNum(cells[colY]);
      if (!isFinite(x) || !isFinite(y)) { skipped++; continue; }
      pts.push(pr([x, y]));
    }
    if (pts.length < minPoints) {
      return { ok: false, pts: [], error: minPoints === 1 ? 'Mindestens 1 gültiger Punkt (X und Y je Zeile) erforderlich.' : 'Mindestens 2 gültige Punkte (X und Y je Zeile) erforderlich.' };
    }
    if (pts.length > 5000) return { ok: false, pts: [], error: 'Zu viele Punkte in der Datei (höchstens 5000).' };
    return { ok: true, pts, skipped, header: hasHeader };
  }
  function pointsToCurveEnts(pts, { kind = 'spline', closed = false, con = false } = {}) {
    const base = con ? { con: true } : {};
    if (kind === 'points') {
      const out = [];
      for (const p of pts || []) {
        if (!Array.isArray(p) || p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) continue;
        out.push({ id: uid('e'), type: 'point', a: pr(p), ...base });
      }
      return out;
    }
    const clean = [];
    for (const p of pts || []) {
      if (!Array.isArray(p) || p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) continue;
      const q = pr(p);
      if (!clean.length || d2(clean[clean.length - 1], q) >= 1e-7) clean.push(q);
    }
    if (clean.length < 2) return [];
    if (kind === 'polyline') {
      const ents = [];
      for (let i = 0; i < clean.length - 1; i++) {
        ents.push({ id: uid('e'), type: 'line', a: clean[i].slice(), b: clean[i + 1].slice(), ...base });
      }
      if (closed && clean.length >= 3 && d2(clean[0], clean[clean.length - 1]) > 1e-6) {
        ents.push({ id: uid('e'), type: 'line', a: clean[clean.length - 1].slice(), b: clean[0].slice(), ...base });
      }
      return ents;
    }
    const spPts = clean.map((q) => q.slice());
    let isClosed = !!closed;
    if (isClosed && spPts.length >= 3 && d2(spPts[0], spPts[spPts.length - 1]) < 1e-5) spPts.pop();
    if (isClosed && spPts.length < 3) isClosed = false;
    return [{ id: uid('e'), type: 'spline', pts: spPts, closed: isClosed, ...base }];
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
  // sd > 0: nach links (in Laufrichtung der Kette), sd < 0: nach rechts; corners: 'sharp' | 'round'
  function offsetChain(chain, sd, corners = 'sharp') {
    const n = chain.segs.length;
    const items = chain.segs.map((s) => {
      if (s.e.type === 'line') {
        const L = d2(s.a, s.b), u = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L], nv = [-u[1], u[0]];
        const A = [s.a[0] + nv[0] * sd, s.a[1] + nv[1] * sd], B = [s.b[0] + nv[0] * sd, s.b[1] + nv[1] * sd];
        return { s, line: { p: A, u }, start: A, end: B, tStart: u, tEnd: u };
      }
      const ai = SK.arcInfo(s.a, s.e.m, s.b);
      if (!ai) return null;
      const r = ai.sweep > 0 ? ai.r - sd : ai.r + sd;
      if (r < 1e-6) return null;
      const at = (p) => { const d = d2(p, ai.c); return [ai.c[0] + ((p[0] - ai.c[0]) / d) * r, ai.c[1] + ((p[1] - ai.c[1]) / d) * r]; };
      const tAt = (a) => (ai.sweep > 0 ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)]);
      return { s, ai, r, circle: { c: ai.c, r }, start: at(s.a), end: at(s.b), tStart: tAt(ai.a0), tEnd: tAt(ai.a1) };
    });
    if (items.some((x) => !x)) return { ok: false, why: 'Der Versatz ist hier zu groß – ein Bogen würde verschwinden.' };
    const starts = items.map((it) => it.start), ends = items.map((it) => it.end), cornerArcs = new Array(n).fill(null);
    const joint = (i, j) => {
      const P = items[i], Q = items[j];
      const c = infInter(P, Q);
      if (!c.length) return d2(P.end, Q.start) < 1e-5 ? P.end : null;
      let best = c[0], bd = d2(c[0], P.end);
      for (const x of c) { const dd = d2(x, P.end); if (dd < bd) { bd = dd; best = x; } }
      return best;
    };
    const joinPair = (i, j) => {
      const cr = cross(items[i].tEnd, items[j].tStart);
      const dt = items[i].tEnd[0] * items[j].tStart[0] + items[i].tEnd[1] * items[j].tStart[1];
      const isOuter = corners === 'round' && (cr * sd < -1e-7 || (Math.abs(cr) <= 1e-7 && dt < -1 + 1e-6)) && d2(items[i].end, items[j].start) > 1e-5;
      if (isOuter) {
        const C = chain.segs[i].b, r = Math.abs(sd), a = ends[i], b = starts[j];
        const a0 = Math.atan2(a[1] - C[1], a[0] - C[0]), a1 = Math.atan2(b[1] - C[1], b[0] - C[0]);
        let sw = sd < 0 ? norm(a1 - a0) : -norm(a0 - a1);
        if (Math.abs(sw) < 1e-6) sw = sd < 0 ? Math.PI : -Math.PI;
        const m = [C[0] + Math.cos(a0 + sw / 2) * r, C[1] + Math.sin(a0 + sw / 2) * r];
        cornerArcs[i] = { type: 'arc', a: pr(a), m: pr(m), b: pr(b), ...(chain.segs[i].e.con ? { con: true } : {}) };
        return true;
      }
      const v = joint(i, j);
      if (!v) return false;
      ends[i] = v; starts[j] = v;
      return true;
    };
    for (let i = 0; i < n; i++) {
      if (i < n - 1) { if (!joinPair(i, i + 1)) return { ok: false, why: 'Der Versatz passt hier nicht an die Ecke.' }; }
      else if (chain.closed && !joinPair(n - 1, 0)) return { ok: false, why: 'Der Versatz passt hier nicht an die Ecke.' };
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = starts[i], b = ends[i], it = items[i];
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
      out.push({ src: it.s.e, ent, segIdx: i, startKey: it.s.rev ? 'b' : 'a', endKey: it.s.rev ? 'a' : 'b' });
      if (cornerArcs[i]) out.push({ src: it.s.e, ent: cornerArcs[i], corner: true, prevSeg: i, nextSeg: (i + 1) % n });
    }
    return { ok: true, items: out };
  }
  // Versatz einer Form (Kreis, Rechteck, Vieleck, Langloch, Spline); d > 0 = nach außen / größer, d < 0 = nach innen
  function offsetShape(e, d, corners = 'sharp') {
    const n = Math.max(3, Math.round(e.n || 6));
    if (e.type === 'circle') { const r = e.r + d; return r > 1e-6 ? { ok: true, ent: { type: 'circle', c: e.c.slice(), r: r6(r) } } : { ok: false, why: 'Der Kreis würde verschwinden.' }; }
    if (e.type === 'slot') { const r = e.r + d; return r > 1e-6 ? { ok: true, ent: { type: 'slot', a: e.a.slice(), b: e.b.slice(), r: r6(r) } } : { ok: false, why: 'Das Langloch würde verschwinden.' }; }
    if (e.type === 'poly') {
      if (d > 0 && corners === 'round') {
        const segs = SK.segsOf(e);
        const chain = { segs: segs.map((s) => ({ e: { type: 'line', a: s.a, b: s.b, con: e.con }, rev: false, a: s.a, b: s.b })), closed: true };
        const r = offsetChain(chain, -d, 'round');
        if (!r.ok) return r;
        return { ok: true, items: r.items.map((it) => (it.corner ? { ...it, src: e } : { ...it, src: e, edge: it.segIdx, srcA: segs[it.segIdx].a, srcB: segs[it.segIdx].b })) };
      }
      const r = e.r + d / Math.cos(Math.PI / n); return r > 1e-6 ? { ok: true, ent: { type: 'poly', c: e.c.slice(), r: r6(r), n, rot: e.rot || 0 } } : { ok: false, why: 'Das Vieleck würde verschwinden.' };
    }
    if (e.type === 'rect') {
      if (d > 0 && corners === 'round') {
        const cs = SK.rectCorners(e), area = (e.b[0] - e.a[0]) * (e.b[1] - e.a[1]);
        if (Math.abs(area) < 1e-12) return { ok: false, why: 'Das Rechteck ist leer.' };
        const chain = { segs: [0, 1, 2, 3].map((i) => { const a = cs[i], b = cs[(i + 1) % 4]; return { e: { type: 'line', a, b, con: e.con }, rev: false, a, b }; }), closed: true };
        const r = offsetChain(chain, area >= 0 ? -d : d, 'round');
        if (!r.ok) return r;
        return { ok: true, items: r.items.map((it) => (it.corner ? { ...it, src: e } : { ...it, src: e, edge: it.segIdx, srcA: cs[it.segIdx], srcB: cs[(it.segIdx + 1) % 4] })) };
      }
      const sa = [e.a[0] <= e.b[0] ? -1 : 1, e.a[1] <= e.b[1] ? -1 : 1], sb = [-sa[0], -sa[1]];
      const w = Math.abs(e.b[0] - e.a[0]) + 2 * d, h = Math.abs(e.b[1] - e.a[1]) + 2 * d;
      if (w < 1e-6 || h < 1e-6) return { ok: false, why: 'Das Rechteck würde verschwinden.' };
      const sgn = d >= 0 ? 1 : -1;
      return { ok: true, ent: { type: 'rect', a: pr([e.a[0] + sa[0] * d, e.a[1] + sa[1] * d]), b: pr([e.b[0] + sb[0] * d, e.b[1] + sb[1] * d]) }, sgs: [sa[0] * sgn, sa[1] * sgn, sb[0] * sgn, sb[1] * sgn] };
    }
    if (e.type === 'ellipse') {
      // Die Versatzkurve einer Ellipse ist keine Ellipse: geschlossene Spline durch 48 Punkte genau auf ihr (Punkt + d · Normale)
      const rx = e.rx, ry = e.ry, rmin = Math.min(rx, ry) ** 2 / Math.max(rx, ry);   // kleinster Krümmungsradius
      if (d <= -rmin * 0.98) return { ok: false, why: `Nach innen geht bei dieser Ellipse höchstens ${Math.floor(rmin * 0.98 * 100) / 100} mm – sonst entstehen Spitzen.` };
      const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0), N = 48, pts = [];
      for (let k = 0; k < N; k++) {
        const t = (k / N) * Math.PI * 2, x = rx * Math.cos(t), y = ry * Math.sin(t);
        let nx = ry * Math.cos(t), ny = rx * Math.sin(t); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        const u = x + nx * d, v = y + ny * d;
        pts.push(pr([e.c[0] + cs * u - sn * v, e.c[1] + sn * u + cs * v]));
      }
      return { ok: true, ent: { type: 'spline', pts, closed: true } };
    }
    if (e.type === 'ellarc') {
      const rx = e.rx, ry = e.ry, rmin = Math.min(rx, ry) ** 2 / Math.max(rx, ry);
      if (d <= -rmin * 0.98) return { ok: false, why: `Nach innen geht bei diesem Bogen höchstens ${Math.floor(rmin * 0.98 * 100) / 100} mm – sonst entstehen Spitzen.` };
      const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0), sw = SK.ellArcSweep(e.a0, e.a1, e.ccw !== false), N = 36, pts = [];
      for (let k = 0; k < N; k++) {
        const t = e.a0 + (sw * k) / (N - 1), x = rx * Math.cos(t), y = ry * Math.sin(t);
        let nx = ry * Math.cos(t), ny = rx * Math.sin(t); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        const u = x + nx * d, v = y + ny * d;
        pts.push(pr([e.c[0] + cs * u - sn * v, e.c[1] + sn * u + cs * v]));
      }
      return { ok: true, ent: { type: 'spline', pts, closed: false } };
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
      case 'circle': case 'poly': case 'ellipse': case 'ellarc': return ['c'];
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
      case 'ellarc': {
        const p0 = f(e.c), u = e.rot || 0;
        const px = f([e.c[0] + Math.cos(u), e.c[1] + Math.sin(u)]), py = f([e.c[0] - Math.sin(u), e.c[1] + Math.cos(u)]);
        const ux = [px[0] - p0[0], px[1] - p0[1]], uy = [py[0] - p0[0], py[1] - p0[1]], flip = ux[0] * uy[1] - ux[1] * uy[0] < 0;
        ents.push({ id, type: 'ellarc', c: pr(p0), rx: e.rx, ry: e.ry, rot: flip ? Math.atan2(ux[1], ux[0]) : polyRot(e), a0: flip ? -e.a0 : e.a0, a1: flip ? -e.a1 : e.a1, ccw: flip ? !(e.ccw !== false) : e.ccw !== false, ...base });
        pairs.push([R(e.id, 'c'), R(id, 'c')]); break;
      }
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

  // ---------- Skizzen-Prüfer (SK-09): doppelte Linien, winzige Lücken (< 0,05 mm) und offene Enden ----------
  function inspect(ents, opts = {}) {
    const gapTol = opts.gapTol != null ? opts.gapTol : 0.05;
    const dupTol = opts.dupTol != null ? opts.dupTol : 0.01;
    const list = (ents || []).filter((e) => !e.con);
    const dims = opts.dims || [], cons = opts.cons || [];
    const scores = new Map();
    const scoreOf = (e) => {
      if (scores.has(e.id)) return scores.get(e.id);
      let s = e.link ? 10 : 0;
      for (const d of dims) if (d.e === e.id || (d.refs || []).some((r) => r && r.e === e.id)) s += 3;
      for (const c of cons) if ((c.refs || []).some((r) => r && r.e === e.id)) s += 1;
      scores.set(e.id, s);
      return s;
    };
    const pickKeep = (A, B, ia, ib) => {
      const sa = scoreOf(A), sb = scoreOf(B);
      return sa > sb || (sa === sb && ia <= ib) ? [A, B] : [B, A];
    };
    const bboxOf = (e) => {
      if (e.type === 'line') return [Math.min(e.a[0], e.b[0]), Math.min(e.a[1], e.b[1]), Math.max(e.a[0], e.b[0]), Math.max(e.a[1], e.b[1])];
      if (e.type === 'rect') return [Math.min(e.a[0], e.b[0]), Math.min(e.a[1], e.b[1]), Math.max(e.a[0], e.b[0]), Math.max(e.a[1], e.b[1])];
      if (e.type === 'circle') return [e.c[0] - e.r, e.c[1] - e.r, e.c[0] + e.r, e.c[1] + e.r];
      if (e.type === 'arc') { const pts = SK.arcPoints(e.a, e.m, e.b, 16); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return [x0, y0, x1, y1]; }
      return null;
    };
    const boxOverlap = (a, b, tol) => a && b && a[0] <= b[2] + tol && b[0] <= a[2] + tol && a[1] <= b[3] + tol && b[1] <= a[3] + tol;
    const boxes = list.map(bboxOf);
    const dups = [], dropped = new Set();

    // 1. Doppelte / übereinanderliegende Elemente (Linien, Bögen, Kreise, Rechtecke)
    for (let i = 0; i < list.length; i++) {
      const A = list[i]; if (dropped.has(A.id)) continue;
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j]; if (dropped.has(B.id)) continue;
        if (!boxOverlap(boxes[i], boxes[j], dupTol)) continue;
        if (A.type === 'line' && B.type === 'line') {
          const LA = d2(A.a, A.b), LB = d2(B.a, B.b);
          if (LA < 1e-9 || LB < 1e-9) continue;
          const aLonger = LA >= LB;
          const P = aLonger ? A : B, Q = aLonger ? B : A;
          const LP = aLonger ? LA : LB, LQ = aLonger ? LB : LA;
          const ux = (P.b[0] - P.a[0]) / LP, uy = (P.b[1] - P.a[1]) / LP;
          const da = Math.abs((Q.a[0] - P.a[0]) * uy - (Q.a[1] - P.a[1]) * ux);
          const db = Math.abs((Q.b[0] - P.a[0]) * uy - (Q.b[1] - P.a[1]) * ux);
          if (da > dupTol || db > dupTol) continue;
          const t0 = (Q.a[0] - P.a[0]) * ux + (Q.a[1] - P.a[1]) * uy;
          const t1 = (Q.b[0] - P.a[0]) * ux + (Q.b[1] - P.a[1]) * uy;
          const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
          const ov0 = Math.max(0, lo), ov1 = Math.min(LP, hi), ov = ov1 - ov0;
          if (ov <= Math.max(1e-3, Math.min(LP, LQ) * 0.01)) continue;
          const mid = pr([P.a[0] + ux * ((ov0 + ov1) / 2), P.a[1] + uy * ((ov0 + ov1) / 2)]);
          const contained = lo >= -dupTol && hi <= LP + dupTol;
          if (contained) {
            const [keep, drop] = Math.abs(LP - LQ) <= dupTol ? pickKeep(A, B, i, j) : [P, Q];
            dropped.add(drop.id);
            dups.push({ kind: 'dup', sub: 'line', keepId: keep.id, dropId: drop.id, ents: [keep.id, drop.id], p: mid, len: ov, partial: false, fixable: true });
            if (drop === A) break;
          } else {
            const uMin = Math.min(0, lo), uMax = Math.max(LP, hi);
            const mergePts = [pr([P.a[0] + ux * uMin, P.a[1] + uy * uMin]), pr([P.a[0] + ux * uMax, P.a[1] + uy * uMax])];
            dropped.add(Q.id);
            dups.push({ kind: 'dup', sub: 'line', keepId: P.id, dropId: Q.id, ents: [P.id, Q.id], p: mid, len: ov, partial: true, mergePts, fixable: true });
            if (Q === A) break;
          }
        } else if (A.type === 'arc' && B.type === 'arc') {
          const ai = SK.arcInfo(A.a, A.m, A.b), bi = SK.arcInfo(B.a, B.m, B.b);
          if (!ai || !bi || d2(ai.c, bi.c) > dupTol || Math.abs(ai.r - bi.r) > dupTol) continue;
          const sameEnds = (d2(A.a, B.a) <= dupTol && d2(A.b, B.b) <= dupTol) || (d2(A.a, B.b) <= dupTol && d2(A.b, B.a) <= dupTol);
          if (!sameEnds || SK.distEnt(A, B.m) > dupTol || SK.distEnt(B, A.m) > dupTol) continue;
          const [keep, drop] = pickKeep(A, B, i, j);
          dropped.add(drop.id);
          dups.push({ kind: 'dup', sub: 'arc', keepId: keep.id, dropId: drop.id, ents: [keep.id, drop.id], p: pr(keep.m), len: Math.abs(ai.sweep) * ai.r, partial: false, fixable: true });
          if (drop === A) break;
        } else if (A.type === 'circle' && B.type === 'circle') {
          if (d2(A.c, B.c) > dupTol || Math.abs(A.r - B.r) > dupTol) continue;
          const [keep, drop] = pickKeep(A, B, i, j);
          dropped.add(drop.id);
          dups.push({ kind: 'dup', sub: 'circle', keepId: keep.id, dropId: drop.id, ents: [keep.id, drop.id], p: pr([keep.c[0] + keep.r, keep.c[1]]), len: TAU * keep.r, partial: false, fixable: true });
          if (drop === A) break;
        } else if (A.type === 'rect' && B.type === 'rect') {
          const ba = boxes[i], bb = boxes[j];
          if (Math.abs(ba[0] - bb[0]) > dupTol || Math.abs(ba[1] - bb[1]) > dupTol || Math.abs(ba[2] - bb[2]) > dupTol || Math.abs(ba[3] - bb[3]) > dupTol) continue;
          const [keep, drop] = pickKeep(A, B, i, j);
          dropped.add(drop.id);
          dups.push({ kind: 'dup', sub: 'rect', keepId: keep.id, dropId: drop.id, ents: [keep.id, drop.id], p: pr([(ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2]), len: 0, partial: false, fixable: true });
          if (drop === A) break;
        }
      }
    }
    // Linie, die direkt auf einer Kante eines Rechtecks liegt
    for (let i = 0; i < list.length; i++) {
      const R = list[i]; if (R.type !== 'rect' || dropped.has(R.id)) continue;
      const rc = SK.rectCorners(R);
      for (let j = 0; j < list.length; j++) {
        const L = list[j]; if (L.type !== 'line' || dropped.has(L.id) || !boxOverlap(boxes[i], boxes[j], dupTol)) continue;
        const LL = d2(L.a, L.b); if (LL < 1e-9) continue;
        for (let k = 0; k < 4; k++) {
          const p0 = rc[k], p1 = rc[(k + 1) % 4], LE = d2(p0, p1);
          if (LE < 1e-9) continue;
          const ux = (p1[0] - p0[0]) / LE, uy = (p1[1] - p0[1]) / LE;
          const da = Math.abs((L.a[0] - p0[0]) * uy - (L.a[1] - p0[1]) * ux);
          const db = Math.abs((L.b[0] - p0[0]) * uy - (L.b[1] - p0[1]) * ux);
          if (da > dupTol || db > dupTol) continue;
          const t0 = (L.a[0] - p0[0]) * ux + (L.a[1] - p0[1]) * uy;
          const t1 = (L.b[0] - p0[0]) * ux + (L.b[1] - p0[1]) * uy;
          const lo = Math.min(t0, t1), hi = Math.max(t0, t1), ov = Math.min(LE, hi) - Math.max(0, lo);
          if (lo >= -dupTol && hi <= LE + dupTol && ov > 1e-3) {
            dropped.add(L.id);
            dups.push({ kind: 'dup', sub: 'line', keepId: R.id, dropId: L.id, ents: [R.id, L.id], p: pr([(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2]), len: LL, partial: false, fixable: true });
            break;
          }
        }
      }
    }

    // 2. Offene Enden und winzige Lücken (< gapTol) auf den bereinigten offenen Elementen
    const verts = new Map();
    const putV = (xy, ep) => { const k = key(xy); if (!verts.has(k)) verts.set(k, []); verts.get(k).push(ep); };
    for (const e of list) {
      if (dropped.has(e.id)) continue;
      if (!(e.type === 'line' || e.type === 'arc' || e.type === 'ellarc' || (e.type === 'spline' && !e.closed && e.pts && e.pts.length >= 2))) continue;
      const a = SK.endA(e), b = SK.endB(e);
      if (d2(a, b) <= 1e-9) continue;
      putV(a, { e: e.id, p: 'a', xy: a, type: e.type, npts: e.pts ? e.pts.length : 0, revAxis: !!e.revAxis });
      putV(b, { e: e.id, p: 'b', xy: b, type: e.type, npts: e.pts ? e.pts.length : 0, revAxis: !!e.revAxis });
    }
    const openPts = [];
    for (const arr of verts.values()) if (arr.length === 1 && !arr[0].revAxis) openPts.push(arr[0]);

    const cands = [];
    for (let i = 0; i < openPts.length; i++) {
      const u = openPts[i];
      for (let j = i + 1; j < openPts.length; j++) {
        const v = openPts[j];
        if (u.e === v.e && !(u.type === 'spline' && u.npts >= 3)) continue;
        if (Math.abs(u.xy[0] - v.xy[0]) >= gapTol || Math.abs(u.xy[1] - v.xy[1]) >= gapTol) continue;
        const dist = d2(u.xy, v.xy);
        if (dist < gapTol) cands.push({ i, j, u, v, dist });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const used = new Set(), gaps = [];
    for (const c of cands) {
      if (used.has(c.i) || used.has(c.j)) continue;
      used.add(c.i); used.add(c.j);
      gaps.push({
        kind: 'gap',
        a: { e: c.u.e, p: c.u.p },
        b: { e: c.v.e, p: c.v.p },
        p: pr([(c.u.xy[0] + c.v.xy[0]) / 2, (c.u.xy[1] + c.v.xy[1]) / 2]),
        pA: c.u.xy.slice(),
        pB: c.v.xy.slice(),
        dist: c.dist,
        ents: c.u.e === c.v.e ? [c.u.e] : [c.u.e, c.v.e],
        fixable: true,
      });
    }
    const opens = [];
    openPts.forEach((u, idx) => {
      if (!used.has(idx)) opens.push({ kind: 'open', ref: { e: u.e, p: u.p }, p: u.xy.slice(), ents: [u.e], fixable: false });
    });

    const issues = [...gaps, ...dups, ...opens];
    return { issues, gaps, dups, opens, fixable: gaps.length + dups.length };
  }

  // ---------- Dünne Wand (KP-03): offene Linien/Ketten und geschlossene Umrisse versetzen ----------
  function polyArea2(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function revSeg(s) { return s.t === 'bez' ? { t: 'bez', a: s.b, c1: s.c2, c2: s.c1, b: s.a } : s.t === 'arc' ? { t: 'arc', a: s.b, m: s.m, b: s.a } : { t: 'line', a: s.b, b: s.a }; }
  function cloneSeg(s) {
    if (s.t === 'arc') return { t: 'arc', a: s.a.slice(), m: s.m.slice(), b: s.b.slice() };
    if (s.t === 'bez') return { t: 'bez', a: s.a.slice(), c1: s.c1.slice(), c2: s.c2.slice(), b: s.b.slice() };
    return { t: 'line', a: s.a.slice(), b: s.b.slice() };
  }
  // Linienzug mit Bogenlängen-Winkelhalbierender versetzen (sd > 0 links der Laufrichtung)
  function offsetPolyline(pts, sd, closed) {
    const P = [];
    for (const q of pts) if (!P.length || d2(P[P.length - 1], q) > 1e-9) P.push(q);
    if (closed && P.length > 1 && d2(P[0], P[P.length - 1]) < 1e-9) P.pop();
    const m = P.length;
    if (m < (closed ? 3 : 2)) return { ok: false, why: 'Die Kurve ist zu kurz.' };
    const edgeCount = closed ? m : m - 1;
    const norms = [];
    for (let i = 0; i < edgeCount; i++) {
      const a = P[i], b = P[(i + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      norms.push([-dy / L, dx / L]);
    }
    const V = [];
    for (let i = 0; i < m; i++) {
      let off;
      if (!closed && i === 0) off = [norms[0][0] * sd, norms[0][1] * sd];
      else if (!closed && i === m - 1) off = [norms[m - 2][0] * sd, norms[m - 2][1] * sd];
      else {
        const nA = norms[(i - 1 + edgeCount) % edgeCount], nB = norms[i % edgeCount];
        const bx = nA[0] + nB[0], by = nA[1] + nB[1], den = 1 + nA[0] * nB[0] + nA[1] * nB[1];
        if (den > 0.1) off = [(bx / den) * sd, (by / den) * sd];
        else {
          const bl = Math.hypot(bx, by);
          off = bl > 1e-9 ? [(bx / bl) * 3 * sd, (by / bl) * 3 * sd] : [nA[0] * sd, nA[1] * sd];
        }
      }
      V.push(pr([P[i][0] + off[0], P[i][1] + off[1]]));
    }
    const segs = [];
    for (let i = 0; i < edgeCount; i++) {
      const a = V[i], b = V[(i + 1) % m];
      if (d2(a, b) > 1e-7) segs.push({ t: 'line', a, b });
    }
    for (let i = 1; i < segs.length; i++) segs[i].a = segs[i - 1].b.slice();
    if (closed && segs.length > 1) segs[0].a = segs[segs.length - 1].b.slice();
    if (segs.length < (closed ? 3 : 1)) return { ok: false, why: 'Die Wandstärke ist für diese Kurve zu groß.' };
    return { ok: true, segs };
  }
  function offsetSegs(segs, sd, closed) {
    if (!segs || !segs.length) return { ok: false, why: 'Keine Segmente vorhanden.' };
    if (Math.abs(sd) < 1e-9) {
      const out = segs.map(cloneSeg);
      for (let i = 1; i < out.length; i++) if (d2(out[i - 1].b, out[i].a) < 1e-3) out[i].a = out[i - 1].b.slice();
      if (closed && out.length > 1 && d2(out[out.length - 1].b, out[0].a) < 1e-3) out[0].a = out[out.length - 1].b.slice();
      return { ok: true, segs: out };
    }
    if (segs.every((s) => s.t === 'line' || s.t === 'arc')) {
      const chIn = {
        closed: !!closed,
        segs: segs.map((s) => ({
          e: s.t === 'arc' ? { type: 'arc', a: s.a, m: s.m, b: s.b } : { type: 'line', a: s.a, b: s.b },
          rev: false, a: s.a, b: s.b,
        })),
      };
      const r = offsetChain(chIn, sd);
      if (!r.ok) return r;
      const out = r.items.map((x) => (x.ent.type === 'arc' ? { t: 'arc', a: x.ent.a, m: x.ent.m, b: x.ent.b } : { t: 'line', a: x.ent.a, b: x.ent.b }));
      for (let i = 1; i < out.length; i++) out[i].a = out[i - 1].b.slice();
      if (closed && out.length > 1) out[0].a = out[out.length - 1].b.slice();
      return { ok: true, segs: out };
    }
    const pts = [];
    for (const s of segs) {
      const sp = s.t === 'bez' ? SK.bezPoints(s, 16) : SK.segPoints(s);
      for (const q of sp) if (!pts.length || d2(pts[pts.length - 1], q) > 1e-7) pts.push(q);
    }
    return offsetPolyline(pts, sd, closed);
  }
  // Geschlossene Schleife um d versetzen (d > 0 nach außen, d < 0 nach innen)
  function offsetClosedLoop(L, d, ents) {
    if (Math.abs(d) < 1e-9) return { ok: true, k: L.k };
    if (L.k.circle) {
      const r = L.k.circle.r + d;
      if (r <= 1e-4) return { ok: false, why: 'Die Wandstärke ist zu groß für diesen Kreis.' };
      return { ok: true, k: { circle: { c: L.k.circle.c.slice(), r: r6(r) } } };
    }
    if (L.k.ellipse) {
      const r = offsetShape({ type: 'ellipse', ...L.k.ellipse }, d);
      if (!r.ok) return { ok: false, why: 'Die Wandstärke ist zu groß für diese Ellipse.' };
      return { ok: true, k: { segs: SK.splineBez(r.ent.pts, true) } };
    }
    const e = L.ents.length === 1 ? (ents || []).find((x) => x.id === L.ents[0]) : null;
    if (e && (e.type === 'rect' || e.type === 'poly' || e.type === 'slot')) {
      const r = offsetShape(e, d);
      if (!r.ok) return { ok: false, why: 'Die Wandstärke ist zu groß für diesen Umriss.' };
      if (r.ent.type === 'slot' && d2(r.ent.a, r.ent.b) < 1e-9) return { ok: true, k: { circle: { c: r.ent.a, r: r.ent.r } } };
      return { ok: true, k: { segs: SK.segsOf(r.ent).map((s) => (s.t === 'arc' ? { t: 'arc', a: s.a, m: s.m, b: s.b } : { t: 'line', a: s.a, b: s.b })) } };
    }
    const ccw = polyArea2(L.poly) > 0;
    const sd = ccw ? -d : d;
    const r = offsetSegs(L.k.segs, sd, true);
    if (!r.ok) return { ok: false, why: 'Die Wandstärke ist zu groß für diesen Umriss.' };
    const pts = [];
    for (const s of r.segs) { const sp = SK.segPoints(s); for (let i = 0; i < sp.length - 1; i++) pts.push(sp[i]); }
    const aNew = polyArea2(pts);
    if (Math.abs(aNew) < 1e-4 || (aNew > 0) !== ccw || (d < 0 && Math.abs(aNew) >= L.area)) {
      return { ok: false, why: 'Die Wandstärke ist zu groß für diesen Umriss.' };
    }
    return { ok: true, k: { segs: r.segs } };
  }
  function thinRegions(ents, wall, side = 'center', sel = null) {
    if (!(wall > 1e-4)) return { regions: [], error: 'Die Wandstärke muss größer als 0 mm sein.' };
    const s = side === 'in' || side === 'out' ? side : 'center';
    const regions = [];
    const regs = SK.regions(ents);
    let chosen = regs;
    if (Array.isArray(sel) && sel.length) { const f = regs.filter((r) => sel.includes(r.key)); if (f.length) chosen = f; }
    const dOut = s === 'in' ? 0 : s === 'out' ? wall : wall / 2;
    const dIn = s === 'out' ? 0 : s === 'in' ? -wall : -wall / 2;
    for (const rg of chosen) {
      for (const L of [rg.outer, ...rg.holes]) {
        const oR = offsetClosedLoop(L, dOut, ents);
        if (!oR.ok) return { regions: [], error: oR.why };
        const iR = offsetClosedLoop(L, dIn, ents);
        if (!iR.ok) return { regions: [], error: iR.why };
        regions.push({ outer: oR.k, holes: [iR.k] });
      }
    }
    for (const ch of SK.chains(ents)) {
      const pts = [];
      for (const sg of ch.segs) for (const q of SK.segPoints(sg)) if (!pts.length || d2(pts[pts.length - 1], q) > 1e-7) pts.push(q);
      const A = polyArea2(pts);
      const inSign = Math.abs(A) > 1e-4 ? (A > 0 ? 1 : -1) : 1;
      const d1 = s === 'in' ? inSign * wall : s === 'out' ? -inSign * wall : wall / 2;
      const d2s = s === 'center' ? -wall / 2 : 0;
      const rA = offsetSegs(ch.segs, d1, false);
      if (!rA.ok) return { regions: [], error: rA.why || 'Die Wandstärke ist für diese Kurve zu groß.' };
      const rB = offsetSegs(ch.segs, d2s, false);
      if (!rB.ok) return { regions: [], error: rB.why || 'Die Wandstärke ist für diese Kurve zu groß.' };
      const A0 = rA.segs, B0 = rB.segs;
      const loopSegs = [
        ...A0,
        { t: 'line', a: A0[A0.length - 1].b.slice(), b: B0[B0.length - 1].b.slice() },
        ...B0.slice().reverse().map(revSeg),
        { t: 'line', a: B0[0].a.slice(), b: A0[0].a.slice() },
      ];
      regions.push({ outer: { segs: loopSegs }, holes: [] });
    }
    if (!regions.length) return { regions: [], error: 'Die Skizze hat keine Linie und keinen Umriss für eine dünne Wand.' };
    return { regions, error: null };
  }

  // ---------- Skizze fertig bestimmen (SK-06): fehlende Regeln & Maße vorschlagen ----------
  function autoDefine(sketch, V, opts = {}) {
    const angleTol = opts.angleTol != null ? opts.angleTol : 2;
    const gapTol = opts.gapTol != null ? opts.gapTol : 0.05;
    let wEnts = JSON.parse(JSON.stringify(sketch.ents || []));
    let wDims = JSON.parse(JSON.stringify(sketch.dims || []));
    let wCons = JSON.parse(JSON.stringify(sketch.cons || []));
    const r4 = (x) => { const v = Math.round(x * 1e4) / 1e4; return Math.abs(v) < 1e-6 ? 0 : v; };

    if (!wEnts.length) return { ok: true, empty: true, alreadyFull: true, cons: [], dims: [], ents: wEnts, dofBefore: 0, dofAfter: 0 };
    let cur = Solver.solve({ ents: wEnts, dims: wDims, cons: wCons }, V, { analyze: true });
    if (!cur.ok) return { ok: false, overConstrained: true, cons: [], dims: [], ents: wEnts, dofBefore: cur.dof, dofAfter: cur.dof };
    const dofBefore = cur.dof;
    if (cur.dof === 0) return { ok: true, alreadyFull: true, cons: [], dims: [], ents: wEnts, dofBefore: 0, dofAfter: 0 };
    wEnts = cur.ents;

    const propCons = [], propDims = [];
    const byId = (id) => wEnts.find((e) => e.id === id);
    const hasDim = (eid, k) => wDims.some((d) => !d.ref && d.e === eid && d.k === k);
    const collapsed = (ents) => ents.some((e) => {
      if (e.type === 'circle' || e.type === 'poly' || e.type === 'slot') return !(e.r > 1e-5);
      if (e.type === 'ellipse' || e.type === 'ellarc') return !(e.rx > 1e-5 && e.ry > 1e-5);
      if (e.type === 'text') return !(e.h > 1e-5);
      if (e.type === 'rect') return !(Math.abs(e.b[0] - e.a[0]) > 1e-5 && Math.abs(e.b[1] - e.a[1]) > 1e-5);
      return false;
    });
    const tryAdd = (kind, item) => {
      if (cur.dof <= 0) return false;
      const nextCons = kind === 'con' ? [...wCons, item] : wCons;
      const nextDims = kind === 'dim' ? [...wDims, item] : wDims;
      const res = Solver.solve({ ents: wEnts, dims: nextDims, cons: nextCons }, V, { analyze: true });
      if (!res.ok || res.dof >= cur.dof || collapsed(res.ents)) return false;
      wEnts = res.ents;
      if (kind === 'con') { wCons = nextCons; propCons.push(item); }
      else { wDims = nextDims; propDims.push(item); }
      cur = res;
      return true;
    };
    const refXY = (ref) => {
      if (!ref) return null;
      if (ref.e === 'origin') return [0, 0];
      const e = byId(ref.e); if (!e) return null;
      const p = ref.p || 'c';
      if (e.type === 'line' || e.type === 'slot') return p === 'a' ? e.a : p === 'b' ? e.b : null;
      if (e.type === 'arc') {
        if (p === 'a' || p === 'b') return e[p];
        if (p === 'c') { const ai = SK.arcInfo(e.a, e.m, e.b); return ai ? ai.c : null; }
        return null;
      }
      if (e.type === 'rect') {
        const c = SK.rectCorners(e);
        if (p === 'a' || p === 'k0') return c[0];
        if (p === 'k1') return c[1];
        if (p === 'b' || p === 'k2') return c[2];
        if (p === 'k3') return c[3];
        if (p === 'c') return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
        return null;
      }
      if (e.type === 'circle' || e.type === 'ellipse' || e.type === 'poly') return p === 'c' ? e.c : null;
      if (e.type === 'ellarc') return p === 'c' ? e.c : p === 'a' ? SK.endA(e) : p === 'b' ? SK.endB(e) : null;
      if (e.type === 'point' || e.type === 'text') return p === 'a' ? e.a : null;
      if (e.type === 'spline' && /^p\d+$/.test(p)) return e.pts[+p.slice(1)] || null;
      return null;
    };

    // Phase 1a: Deckungsgleich für Punkte mit < gapTol (0,05 mm) Abstand
    const pts = [];
    for (const e of wEnts) {
      const addP = (p, xy) => { if (xy) pts.push({ e: e.id, type: e.type, npts: e.pts ? e.pts.length : 0, p, ref: { e: e.id, p }, xy }); };
      if (e.type === 'line' || e.type === 'slot') { addP('a', e.a); addP('b', e.b); }
      else if (e.type === 'arc') { addP('a', e.a); addP('b', e.b); const ai = SK.arcInfo(e.a, e.m, e.b); if (ai) addP('c', ai.c); }
      else if (e.type === 'rect') { SK.rectCorners(e).forEach((q, i) => addP('k' + i, q)); addP('c', [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); }
      else if (e.type === 'circle' || e.type === 'ellipse' || e.type === 'poly') addP('c', e.c);
      else if (e.type === 'ellarc') { addP('a', SK.endA(e)); addP('b', SK.endB(e)); addP('c', e.c); }
      else if (e.type === 'point' || e.type === 'text') addP('a', e.a);
      else if (e.type === 'spline') (e.pts || []).forEach((q, i) => addP('p' + i, q));
    }
    const cands = [];
    for (let i = 0; i < pts.length; i++) {
      const P = pts[i];
      if (cur.freeEnts.has(P.e)) {
        const d0 = d2(P.xy, [0, 0]);
        if (d0 < gapTol) cands.push({ a: P.ref, b: { e: 'origin' }, d: d0 });
      }
      for (let j = i + 1; j < pts.length; j++) {
        const Q = pts[j];
        if (P.e === Q.e) {
          const splineEnd = P.type === 'spline' && P.npts >= 3 && ((P.p === 'p0' && Q.p === 'p' + (P.npts - 1)) || (Q.p === 'p0' && P.p === 'p' + (P.npts - 1)));
          if (!splineEnd) continue;
        }
        if (!cur.freeEnts.has(P.e) && !cur.freeEnts.has(Q.e)) continue;
        if (Math.abs(P.xy[0] - Q.xy[0]) >= gapTol || Math.abs(P.xy[1] - Q.xy[1]) >= gapTol) continue;
        const dist = d2(P.xy, Q.xy);
        if (dist < gapTol) cands.push({ a: P.ref, b: Q.ref, d: dist });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      if (cur.dof <= 0) break;
      const pa = refXY(c.a), pb = refXY(c.b);
      if (pa && pb && d2(pa, pb) < gapTol) tryAdd('con', { id: uid('k'), type: 'coincident', refs: [c.a, c.b] });
    }

    // Phase 1b: Waagerecht / Senkrecht für Linien und Langlöcher mit < angleTol (2°) Abweichung
    const ids = wEnts.map((e) => e.id);
    for (const id of ids) {
      if (cur.dof <= 0) break;
      const e = byId(id);
      if (!e || (e.type !== 'line' && e.type !== 'slot') || !cur.freeEnts.has(id)) continue;
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const degH = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
      const degV = 90 - degH;
      if (degH < angleTol) tryAdd('con', { id: uid('k'), type: 'horizontal', refs: [{ e: id }] });
      else if (degV < angleTol) tryAdd('con', { id: uid('k'), type: 'vertical', refs: [{ e: id }] });
    }

    const tryDim = (eid, k, val) => {
      if (hasDim(eid, k) || !isFinite(val)) return false;
      const signed = k === 'x' || k === 'y' || k === 'ang';
      if (!signed && val <= 1e-5) return false;
      return tryAdd('dim', { id: uid('m'), e: eid, k, v: r4(val) });
    };

    // Phase 2: Fehlende Größenmaße (Längen, Breiten, Höhen, Durchmesser, Radien)
    for (const id of ids) {
      if (cur.dof <= 0) break;
      if (!cur.freeEnts.has(id)) continue;
      const e = byId(id); if (!e) continue;
      if (e.type === 'rect') {
        tryDim(id, 'w', Math.abs(e.b[0] - e.a[0]));
        tryDim(id, 'h', Math.abs(e.b[1] - e.a[1]));
      } else if (e.type === 'circle' || e.type === 'poly') {
        tryDim(id, 'd', 2 * e.r);
      } else if (e.type === 'arc') {
        const ai = SK.arcInfo(e.a, e.m, e.b);
        if (ai) tryDim(id, 'r', ai.r);
      } else if (e.type === 'line') {
        tryDim(id, 'len', d2(e.a, e.b));
      } else if (e.type === 'slot') {
        tryDim(id, 'len', d2(e.a, e.b));
        tryDim(id, 'w', 2 * e.r);
      } else if (e.type === 'ellipse') {
        tryDim(id, 'w', 2 * e.rx);
        tryDim(id, 'h', 2 * e.ry);
      } else if (e.type === 'ellarc') {
        tryDim(id, 'rx', e.rx);
        tryDim(id, 'ry', e.ry);
      } else if (e.type === 'text') {
        tryDim(id, 'h', e.h);
      }
    }

    // Phase 3: Lage zum Ursprung (X, Y)
    for (const id of ids) {
      if (cur.dof <= 0) break;
      if (!cur.freeEnts.has(id)) continue;
      const e = byId(id); if (!e) continue;
      const p = SK.anchorOf(e);
      if (!p) continue;
      tryDim(id, 'x', p[0]);
      tryDim(id, 'y', p[1]);
    }

    // Phase 4: Winkel für schräge Linien und Langlöcher
    for (const id of ids) {
      if (cur.dof <= 0) break;
      if (!cur.freeEnts.has(id)) continue;
      const e = byId(id); if (!e) continue;
      if (e.type === 'line' || e.type === 'slot') tryDim(id, 'ang', SK.measure(e, 'ang'));
    }

    // Phase 5: Restliche Freiheiten (z. B. Bogen-Endpunkt oder Spline-Kontrollpunkte)
    for (const id of ids) {
      if (cur.dof <= 0) break;
      if (!cur.freeEnts.has(id)) continue;
      const e = byId(id); if (!e) continue;
      const fixP = (pName, xy) => { if (xy) tryAdd('con', { id: uid('k'), type: 'fix', refs: [{ e: id, p: pName }], at: xy.map(r4) }); };
      if (e.type === 'arc') { fixP('b', e.b); fixP('a', e.a); }
      else if (e.type === 'spline') (e.pts || []).forEach((q, i) => { if (cur.dof > 0) fixP('p' + i, q); });
      else if (e.type === 'line' || e.type === 'slot') { fixP('b', e.b); fixP('a', e.a); }
      else if (e.type === 'rect') { const c = SK.rectCorners(e); fixP('k2', c[2]); fixP('k0', c[0]); }
      else if (e.type === 'circle' || e.type === 'poly' || e.type === 'ellipse' || e.type === 'ellarc') fixP('c', e.c);
      else if (e.type === 'point' || e.type === 'text') fixP('a', e.a);
      for (const k of Solver.varsOf(e) || []) {
        if (cur.dof <= 0 || !cur.freeEnts.has(id)) break;
        const curE = byId(id);
        if (curE) tryAdd('con', { id: uid('k'), type: 'fix', refs: [{ e: id }], at: { [k]: r4(Solver.getK(curE, k)) } });
      }
    }

    return { ok: cur.ok, alreadyFull: false, cons: propCons, dims: propDims, ents: wEnts, dofBefore, dofAfter: cur.dof };
  }

  // ---------- Strecken (SK-30): Punkte im Rahmen wählen und verschieben ----------
  function stretchSelect(ents, box) {
    if (!Array.isArray(box) || box.length < 4) return { items: [], pointCount: 0, entCount: 0, pts: [] };
    const x0 = Math.min(box[0], box[2]), x1 = Math.max(box[0], box[2]);
    const y0 = Math.min(box[1], box[3]), y1 = Math.max(box[1], box[3]);
    const inBox = (p) => Array.isArray(p) && p[0] >= x0 - 1e-6 && p[0] <= x1 + 1e-6 && p[1] >= y0 - 1e-6 && p[1] <= y1 + 1e-6;
    const items = [], pts = [];
    const addMove = (moves, k, axis, scale = 1) => moves.push({ k, axis, scale });
    for (const e of ents || []) {
      if (!e || e.link) continue;
      const moves = [], ePts = [];
      if (e.type === 'line' || e.type === 'slot') {
        if (inBox(e.a)) { addMove(moves, 'a0', 0); addMove(moves, 'a1', 1); ePts.push(e.a.slice()); }
        if (inBox(e.b)) { addMove(moves, 'b0', 0); addMove(moves, 'b1', 1); ePts.push(e.b.slice()); }
      } else if (e.type === 'point' || e.type === 'text') {
        if (inBox(e.a)) { addMove(moves, 'a0', 0); addMove(moves, 'a1', 1); ePts.push(e.a.slice()); }
      } else if (e.type === 'circle' || e.type === 'poly' || e.type === 'ellipse' || e.type === 'ellarc') {
        if (inBox(e.c)) { addMove(moves, 'c0', 0); addMove(moves, 'c1', 1); ePts.push(e.c.slice()); }
      } else if (e.type === 'arc') {
        const inA = inBox(e.a), inB = inBox(e.b), inM = inBox(e.m);
        if (inA) { addMove(moves, 'a0', 0); addMove(moves, 'a1', 1); ePts.push(e.a.slice()); }
        if (inB) { addMove(moves, 'b0', 0); addMove(moves, 'b1', 1); ePts.push(e.b.slice()); }
        if ((inA && inB) || inM) {
          addMove(moves, 'm0', 0, 1); addMove(moves, 'm1', 1, 1);
          if (inM) ePts.push(e.m.slice());
        } else if (inA || inB) {
          // Bogenmitte halb mitführen, damit die Krümmung beim Strecken eines Endpunkts sauber bleibt
          addMove(moves, 'm0', 0, 0.5); addMove(moves, 'm1', 1, 0.5);
        }
      } else if (e.type === 'spline') {
        (e.pts || []).forEach((q, i) => {
          if (inBox(q)) { addMove(moves, 'p' + i + '_0', 0); addMove(moves, 'p' + i + '_1', 1); ePts.push(q.slice()); }
        });
      } else if (e.type === 'rect') {
        const cs = SK.rectCorners(e);
        const inC = cs.map(inBox);
        const cnt = inC.filter(Boolean).length;
        for (let i = 0; i < 4; i++) if (inC[i]) ePts.push(cs[i].slice());
        if (cnt > 0) {
          const mvA0 = (inC[0] && inC[3]) || (cnt === 1 && (inC[0] || inC[3]));
          const mvB0 = (inC[1] && inC[2]) || (cnt === 1 && (inC[1] || inC[2]));
          const mvA1 = (inC[0] && inC[1]) || (cnt === 1 && (inC[0] || inC[1]));
          const mvB1 = (inC[2] && inC[3]) || (cnt === 1 && (inC[2] || inC[3]));
          if (mvA0) addMove(moves, 'a0', 0);
          if (mvB0) addMove(moves, 'b0', 0);
          if (mvA1) addMove(moves, 'a1', 1);
          if (mvB1) addMove(moves, 'b1', 1);
        }
      }
      if (moves.length) {
        items.push({ id: e.id, type: e.type, moves, pts: ePts });
        pts.push(...ePts);
      }
    }
    return { items, pointCount: pts.length, entCount: items.length, pts };
  }

  function stretchPreview(ents, sel, dx, dy) {
    if (!sel || !sel.items || !sel.items.length) return { ok: true, ents: [], movedVars: [] };
    const byId = new Map((ents || []).map((e) => [e.id, e]));
    const out = [], movedVars = [];
    for (const it of sel.items) {
      const src = byId.get(it.id);
      if (!src) continue;
      const ne = JSON.parse(JSON.stringify(src));
      for (const mv of it.moves) {
        const delta = (mv.axis === 0 ? dx : dy) * (mv.scale != null ? mv.scale : 1);
        if (Math.abs(delta) < 1e-12) continue;
        const nv = r6(Solver.getK(ne, mv.k) + delta);
        Solver.setK(ne, mv.k, nv);
        movedVars.push([ne.id, mv.k, nv]);
      }
      if (ne.type === 'rect' && (Math.abs(ne.b[0] - ne.a[0]) < 1e-4 || Math.abs(ne.b[1] - ne.a[1]) < 1e-4)) {
        return { ok: false, why: 'Das Rechteck würde durch das Strecken zusammenfallen.' };
      }
      if ((ne.type === 'line' || ne.type === 'slot') && d2(ne.a, ne.b) < 1e-4) {
        return { ok: false, why: 'Eine Linie würde auf Länge 0 schrumpfen.' };
      }
      if (ne.type === 'arc' && (d2(ne.a, ne.b) < 1e-4 || !SK.arcInfo(ne.a, ne.m, ne.b))) {
        return { ok: false, why: 'Ein Bogen wäre nach dem Strecken ungültig.' };
      }
      out.push(ne);
    }
    return { ok: true, ents: out, movedVars };
  }

  function isMirrorSelf(e, A, B) {
    if (!e) return false;
    if (e.type === 'point' || e.type === 'circle') {
      const p = e.a || e.c;
      return !!p && d2(p, mirrorPoint(p, A, B)) < 1e-5;
    }
    if (e.type === 'line' || e.type === 'slot') {
      const fa = mirrorPoint(e.a, A, B), fb = mirrorPoint(e.b, A, B);
      return (d2(e.a, fa) < 1e-5 && d2(e.b, fb) < 1e-5) || (d2(e.a, fb) < 1e-5 && d2(e.b, fa) < 1e-5);
    }
    return false;
  }

  return { TEMPLATES, TPLNAMES, tplEnts, SHAPES, SHAPENAMES, shapeEnts, FORMULA_CURVES, evalFormulaCurve, parsePointsCSV, pointsToCurveEnts, curve, inter, intersections, partsOf, nearestOn, closest, perpFeet, tangentFeet, trimPlan, trimPieces, trimRemoved, explode, chainOf, offsetChain, offsetShape, linkPoints, hasRadius, mirrorEnt, mirrorPoint, isMirrorSelf, moveEnt, rotateEnt, rotPt, stretchSelect, stretchPreview, pr, inspect, thinRegions, autoDefine };
})();
