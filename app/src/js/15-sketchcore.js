// ================= Skizzen-Logik (2D, unabhängig von der Anzeige) =================
const SK = (() => {
  const TAU = Math.PI * 2;
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const qkey = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);

  function circumcircle(a, b, c) {
    const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return null;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) };
  }
  // Bogen durch Start a, Punkt m, Ende b → Mittelpunkt, Radius, Winkel, Drehsinn
  function arcInfo(a, m, b) {
    const cc = circumcircle(a, m, b);
    if (!cc) return null;
    const ang = (p) => Math.atan2(p[1] - cc.c[1], p[0] - cc.c[0]);
    const a0 = ang(a), am = ang(m), a1 = ang(b);
    const norm = (x) => ((x % TAU) + TAU) % TAU;
    const ccw = norm(am - a0) < norm(a1 - a0);
    const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
    return { c: cc.c, r: cc.r, a0, a1, ccw, sweep };
  }
  function arcPoints(a, m, b, n) {
    const info = arcInfo(a, m, b);
    if (!info) return [a, b];
    const N = n || Math.max(8, Math.min(64, Math.ceil(Math.abs(info.sweep) * info.r / 1.5)));
    const pts = [];
    for (let i = 0; i <= N; i++) { const t = info.a0 + (info.sweep * i) / N; pts.push([info.c[0] + Math.cos(t) * info.r, info.c[1] + Math.sin(t) * info.r]); }
    return pts;
  }
  // Ellipse: Mittelpunkt c, Halbachsen rx (entlang rot) und ry
  function ellipsePoints(c, rx, ry, rot = 0, n = 96) { const cs = Math.cos(rot), sn = Math.sin(rot), pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU, x = Math.cos(t) * rx, y = Math.sin(t) * ry; pts.push([c[0] + cs * x - sn * y, c[1] + sn * x + cs * y]); } return pts; }
  function circlePoints(c, r, n = 72) { const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]); } return pts; }
  // Spline: weiche Kurve genau durch alle Punkte (Catmull-Rom, „centripetal“ – macht keine Schleifen und Überschwinger)
  function splinePoints(pts, closed) {
    const n = pts.length;
    if (n < 2) return pts.slice();
    if (n === 2 && !closed) return [pts[0], pts[1]];
    const P = (i) => {
      if (closed) return pts[((i % n) + n) % n];
      if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
      if (i > n - 1) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
      return pts[i];
    };
    const out = [];
    const spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t0 = 0, t1 = t0 + Math.sqrt(Math.max(d2(p0, p1), 1e-9)), t2 = t1 + Math.sqrt(Math.max(d2(p1, p2), 1e-9)), t3 = t2 + Math.sqrt(Math.max(d2(p2, p3), 1e-9));
      const N = Math.max(6, Math.min(48, Math.ceil(d2(p1, p2) / 0.8)));
      for (let k = 0; k < N; k++) {
        const t = t1 + ((t2 - t1) * k) / N;
        const mix = (a, b, ta, tb) => [a[0] * ((tb - t) / (tb - ta)) + b[0] * ((t - ta) / (tb - ta)), a[1] * ((tb - t) / (tb - ta)) + b[1] * ((t - ta) / (tb - ta))];
        const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
        const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
        out.push(mix(B1, B2, t1, t2));
      }
    }
    out.push(closed ? out[0] : pts[n - 1]);
    return out;
  }
  const endA = (e) => (e.type === 'spline' ? e.pts[0] : e.a);
  const endB = (e) => (e.type === 'spline' ? e.pts[e.pts.length - 1] : e.b);
  // Linienstücke einer Punktfolge (für Flächen und den CAD-Kern: Splines gehen dort als feine Linienzüge hin)
  // Spline genau als kubische Bézier-Stücke (gleiche Kurve wie splinePoints: zentripetaler Catmull-Rom)
  function splineBez(pts, closed) {
    const n = pts.length;
    if (n < 2) return [];
    if (n === 2 && !closed) return [{ t: 'line', a: pts[0], b: pts[1] }];
    const P = (i) => {
      if (closed) return pts[((i % n) + n) % n];
      if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
      if (i > n - 1) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
      return pts[i];
    };
    const out = [], spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      if (d2(p1, p2) < 1e-9) continue;
      const d01 = Math.sqrt(Math.max(d2(p0, p1), 1e-9)), d12 = Math.sqrt(Math.max(d2(p1, p2), 1e-9)), d23 = Math.sqrt(Math.max(d2(p2, p3), 1e-9));
      const t1 = d01, t2 = t1 + d12, t3 = t2 + d23, dt = t2 - t1;
      const m1 = [0, 1].map((k) => ((p1[k] - p0[k]) / (t1 - 0) - (p2[k] - p0[k]) / (t2 - 0) + (p2[k] - p1[k]) / dt) * dt);
      const m2 = [0, 1].map((k) => ((p2[k] - p1[k]) / dt - (p3[k] - p1[k]) / (t3 - t1) + (p3[k] - p2[k]) / (t3 - t2)) * dt);
      out.push({ t: 'bez', a: p1, c1: [p1[0] + m1[0] / 3, p1[1] + m1[1] / 3], c2: [p2[0] - m2[0] / 3, p2[1] - m2[1] / 3], b: p2 });
    }
    return out;
  }
  function bezPoints(s, n) {
    n = n || Math.max(8, Math.min(40, Math.ceil((d2(s.a, s.c1) + d2(s.c1, s.c2) + d2(s.c2, s.b)) / 0.4)));
    const o = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t; o.push([A * s.a[0] + B * s.c1[0] + C * s.c2[0] + D * s.b[0], A * s.a[1] + B * s.c1[1] + C * s.c2[1] + D * s.b[1]]); }
    return o;
  }
  const revSeg = (s) => {
    const o = s.t === 'bez' ? { t: 'bez', a: s.b, c1: s.c2, c2: s.c1, b: s.a } : s.t === 'arc' ? { t: 'arc', a: s.b, m: s.m, b: s.a } : { t: 'line', a: s.b, b: s.a };
    if (s.sid) o.sid = s.sid;
    return o;
  };
  // ---------- Text: Umrisse aus eingebauten und geladenen Schriften ----------
  const BUILTIN_FONT_URLS = { inter: 'data/schrift-inter.json', fett: 'data/schrift-inter-fett.json' };
  const BUILTIN_FONTNAMES = { inter: 'Inter', fett: 'Inter Fett' };
  const FONTS = {};
  const FONTNAMES = { ...BUILTIN_FONTNAMES };
  const fontLoads = new Map();
  const fontEv = makeEmitter();
  const parsedFonts = new Map();
  const customIds = new Set();
  const glyphCache = new Map();
  const textCache = new Map();
  function isFontLoaded(id) {
    return !!FONTS[id];
  }
  async function loadFont(id = 'inter') {
    const key = BUILTIN_FONT_URLS[id] ? id : (FONTS[id] ? id : 'inter');
    if (FONTS[key]) return FONTS[key];
    const url = BUILTIN_FONT_URLS[key];
    if (!url) return null;
    if (fontLoads.has(key)) return fontLoads.get(key);
    const p = (async () => {
      const t0 = performance.now();
      const r = await fetch(url);
      if (!r.ok) throw new Error('Schrift konnte nicht geladen werden (Fehler ' + r.status + ').');
      const data = await r.json();
      FONTS[key] = data;
      textCache.clear();
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const atMs = Math.round(performance.now());
      fontLoads.delete(key);
      fontEv.emit('loaded', { id: key, name: BUILTIN_FONTNAMES[key] || key, ms, atMs });
      return data;
    })().catch((e) => {
      fontLoads.delete(key);
      throw e;
    });
    fontLoads.set(key, p);
    return p;
  }
  function collectTextFonts(ents, out = new Set()) {
    for (const e of ents || []) {
      if (!e || e.type !== 'text') continue;
      const id = e.font && BUILTIN_FONT_URLS[e.font] ? e.font : (e.font && FONTS[e.font] ? null : 'inter');
      if (id && !FONTS[id]) out.add(id);
    }
    return out;
  }
  function needsEntsFonts(ents, extraFont = null) {
    if (extraFont && BUILTIN_FONT_URLS[extraFont] && !FONTS[extraFont]) return true;
    return collectTextFonts(ents).size > 0;
  }
  async function ensureEntsFonts(ents, extraFont = null) {
    const need = collectTextFonts(ents);
    if (extraFont && BUILTIN_FONT_URLS[extraFont] && !FONTS[extraFont]) need.add(extraFont);
    if (!need.size) return false;
    await Promise.all([...need].map((id) => loadFont(id)));
    return true;
  }
  async function ensureDocFonts(doc, extra = []) {
    if (doc && doc.fonts && doc.fonts.length) ensureFonts(doc.fonts);
    const need = new Set();
    const scanSketch = (sk) => { if (sk && Array.isArray(sk.ents)) collectTextFonts(sk.ents, need); };
    const walkItems = (list) => {
      for (const it of list || []) {
        if (!it) continue;
        const p = it.p || {};
        scanSketch(p.sketch);
        if (Array.isArray(p.sketches)) for (const sk of p.sketches) scanSketch(sk);
        scanSketch(p.prof);
        scanSketch(p.path);
        scanSketch(p.rail);
        scanSketch(p.rail2);
        if (Array.isArray(it.children)) walkItems(it.children);
      }
    };
    if (doc && Array.isArray(doc.items)) walkItems(doc.items);
    if (Array.isArray(extra) && extra.length) walkItems(extra);
    if (!need.size) return false;
    await Promise.all([...need].map((id) => loadFont(id)));
    return true;
  }
  function parseCustomFont(f) {
    if (!f || !f.data || typeof TTF === 'undefined') return null;
    if (parsedFonts.has(f.data)) return parsedFonts.get(f.data);
    try {
      const parsed = TTF.parse(f.data, { fallbackName: f.name });
      parsedFonts.set(f.data, parsed);
      return parsed;
    } catch (e) {
      console.warn('Schrift konnte nicht geladen werden:', f.name || f.id, e);
      return null;
    }
  }
  function syncFonts(list) {
    let changed = false;
    const nextIds = new Set();
    for (const f of Array.isArray(list) ? list : []) {
      if (!f || !f.id || BUILTIN_FONT_URLS[f.id]) continue;
      const parsed = parseCustomFont(f);
      if (!parsed) continue;
      nextIds.add(f.id);
      const label = f.name || parsed.name || 'Eigene Schrift';
      if (FONTS[f.id] !== parsed || FONTNAMES[f.id] !== label) changed = true;
      FONTS[f.id] = parsed;
      FONTNAMES[f.id] = label;
      customIds.add(f.id);
    }
    for (const id of [...customIds]) {
      if (!nextIds.has(id)) {
        delete FONTS[id];
        delete FONTNAMES[id];
        customIds.delete(id);
        changed = true;
      }
    }
    if (changed) textCache.clear();
  }
  function ensureFonts(list) {
    let changed = false;
    for (const f of Array.isArray(list) ? list : []) {
      if (!f || !f.id || BUILTIN_FONT_URLS[f.id] || FONTS[f.id]) continue;
      const parsed = parseCustomFont(f);
      if (!parsed) continue;
      FONTS[f.id] = parsed;
      FONTNAMES[f.id] = f.name || parsed.name || 'Eigene Schrift';
      customIds.add(f.id);
      changed = true;
    }
    if (changed) textCache.clear();
  }
  function glyphContours(font, ch) {
    const key = font.name + '|' + ch;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const g = font.glyphs[ch]; const out = [];
    if (g && g.p) {
      const tk = g.p.split(' '); let i = 0, cur = null, start = null, segs = null;
      const nb = () => +tk[i++];
      while (i < tk.length) {
        const op = tk[i++];
        if (op === 'M') { if (segs && segs.length) out.push(segs); cur = [nb(), nb()]; start = cur; segs = []; }
        else if (op === 'L') { const p = [nb(), nb()]; if (p[0] !== cur[0] || p[1] !== cur[1]) segs.push({ t: 'line', a: cur, b: p }); cur = p; }
        else if (op === 'C') { const c1 = [nb(), nb()], c2 = [nb(), nb()], p = [nb(), nb()]; segs.push({ t: 'bez', a: cur, c1, c2, b: p }); cur = p; }
        else if (op === 'Z') { if (segs && start && (cur[0] !== start[0] || cur[1] !== start[1])) segs.push({ t: 'line', a: cur, b: start }); if (segs && segs.length) out.push(segs); segs = null; cur = start; }
      }
      if (segs && segs.length) out.push(segs);
    }
    glyphCache.set(key, out);
    return out;
  }
  function getGlyph(font, ch) {
    if (!font) return null;
    if (font.ttf) return font.glyph(ch);
    const g = font.glyphs[ch];
    return g ? { w: g.w, contours: glyphContours(font, ch) } : null;
  }
  function getKern(font, a, b) {
    return font && font.ttf && font.kern ? font.kern(a, b) : 0;
  }
  // Konturen eines Text-Elements in Skizzen-Koordinaten: [[seg, …], …]
  function textContours(e) {
    const want = e.font && FONTS[e.font] ? e.font : (e.font && BUILTIN_FONT_URLS[e.font] ? e.font : 'inter');
    const font = FONTS[want] || FONTS.inter;
    if (!font) {
      if (BUILTIN_FONT_URLS[want]) loadFont(want).catch(() => {});
      return [];
    }
    const PP = Array.isArray(e.onP) && e.onP.length >= 2 ? e.onP : null;
    const key = JSON.stringify([e.s, e.h, e.font, e.align, e.a, e.rot, e.mir, e.sp, e.bend, PP, e.os]);
    if (textCache.has(key)) return textCache.get(key);
    const k = (e.h > 0 ? e.h : 5) / font.cap, sp = (e.sp || 0) / k;
    const chars = [...String(e.s || '')];
    let w = 0;
    for (let i = 0; i < chars.length; i++) {
      const g = getGlyph(font, chars[i]) || getGlyph(font, '?');
      w += g ? g.w : font.em / 2;
      if (i + 1 < chars.length) w += getKern(font, chars[i], chars[i + 1]) + sp;
    }
    const x0 = PP ? 0 : e.align === 'm' ? -w / 2 : e.align === 'r' ? -w : 0;
    // Entlang einer Kurve (onP = Punkte auf ihr): Grundlinie folgt der Kurve, Buchstaben stehen senkrecht darauf (Normale links)
    let along = null;
    if (PP) {
      const cum = [0]; for (let i = 1; i < PP.length; i++) cum.push(cum[i - 1] + Math.hypot(PP[i][0] - PP[i - 1][0], PP[i][1] - PP[i - 1][1]));
      const T = cum[cum.length - 1], W = w * k;
      const s0 = (e.align === 'm' ? (T - W) / 2 : e.align === 'r' ? T - W : 0) + (e.os || 0);
      const nrm = []; for (let i = 0; i + 1 < PP.length; i++) { const dx = PP[i + 1][0] - PP[i][0], dy = PP[i + 1][1] - PP[i][1], l = Math.hypot(dx, dy) || 1; nrm.push([-dy / l, dx / l]); }
      const vn = PP.map((_, i) => { const a = nrm[Math.max(0, i - 1)], b = nrm[Math.min(nrm.length - 1, i)], x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; });
      along = (u, v) => {
        const sv = s0 + u; let j = 0; while (j < cum.length - 2 && cum[j + 1] < sv) j++;
        const L = cum[j + 1] - cum[j] || 1e-9, t = (sv - cum[j]) / L, tc = Math.max(0, Math.min(1, t));
        const nx = vn[j][0] + (vn[j + 1][0] - vn[j][0]) * tc, ny = vn[j][1] + (vn[j + 1][1] - vn[j][1]) * tc, nl = Math.hypot(nx, ny) || 1;
        return [PP[j][0] + (PP[j + 1][0] - PP[j][0]) * t + (nx / nl) * v, PP[j][1] + (PP[j + 1][1] - PP[j][1]) * t + (ny / nl) * v];
      };
    }
    const cs = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0), my = e.mir ? -1 : 1;
    // Bogen: Grundlinie auf einem Kreis mit Radius „bend“ (positiv: Mitte darunter, Text wölbt sich nach oben; negativ: nach unten)
    const R = !PP && Math.abs(e.bend) > 1e-6 ? e.bend : 0;
    const B = (u, v) => { if (!R) return [u, v]; const f = u / R, r = R + v; return [r * Math.sin(f), r * Math.cos(f) - R]; };
    const out = []; let x = x0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const g = getGlyph(font, ch) || getGlyph(font, '?');
      if (g) {
        const ox = x;
        const T = along ? (p) => along((p[0] + ox) * k, p[1] * k * my) : (p) => { const [u, v] = B((p[0] + ox) * k, p[1] * k * my); return [e.a[0] + cs * u - sn * v, e.a[1] + sn * u + cs * v]; };
        // gerade Stücke werden im Bogen zu Kurven (Stützpunkte bei einem und zwei Dritteln)
        const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (const c of g.contours) out.push(c.map((s) => (s.t === 'bez' ? { t: 'bez', a: T(s.a), c1: T(s.c1), c2: T(s.c2), b: T(s.b) } : R || along ? { t: 'bez', a: T(s.a), c1: T(L3(s.a, s.b, 1 / 3)), c2: T(L3(s.a, s.b, 2 / 3)), b: T(s.b) } : { t: 'line', a: T(s.a), b: T(s.b) })));
        x += g.w;
      } else x += font.em / 2;
      if (i + 1 < chars.length) x += getKern(font, ch, chars[i + 1]) + sp;
    }
    if (textCache.size > 300) textCache.clear();
    textCache.set(key, out);
    return out;
  }
  // Breite und Mitte eines Texts (für Fangpunkte und Anzeige)
  // Punkte einer offenen Kurve (Linie, Bogen, Spline) für Text entlang der Kurve; flip = andersherum
  function textPathPts(c, flip) {
    if (!c || !['line', 'arc', 'spline'].includes(c.type) || (c.type === 'spline' && c.closed)) return null;
    const pts = []; for (const sg of segsOf(c)) for (const q of segPoints(sg)) if (!pts.length || d2(pts[pts.length - 1], q) > 1e-9) pts.push([Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]);
    if (pts.length < 2) return null;
    if (c.type === 'line') { const n = 24, a = pts[0], b = pts[pts.length - 1]; pts.length = 0; for (let i = 0; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]); }
    return flip ? pts.reverse() : pts;
  }
  function textBox(e) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const cs = Math.cos(-(e.rot || 0)), sn = Math.sin(-(e.rot || 0));
    for (const c of textContours(e)) for (const s of c) for (const p of [s.a, s.b]) { const x = p[0] - e.a[0], y = p[1] - e.a[1], u = cs * x - sn * y, v = sn * x + cs * y; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    if (!isFinite(x0)) return null;
    const cu = (x0 + x1) / 2, cv = (y0 + y1) / 2, c2 = Math.cos(e.rot || 0), s2 = Math.sin(e.rot || 0);
    return { w: x1 - x0, h: y1 - y0, c: [e.a[0] + c2 * cu - s2 * cv, e.a[1] + s2 * cu + c2 * cv] };
  }
  function lineSegsOf(pts) { const o = []; for (let i = 0; i < pts.length - 1; i++) if (d2(pts[i], pts[i + 1]) > 1e-9) o.push({ t: 'line', a: pts[i], b: pts[i + 1] }); return o; }
  function rectCorners(e) { const [x0, y0] = e.a, [x1, y1] = e.b; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function polyCorners(e) { const pts = []; const n = Math.max(3, Math.round(e.n || 6)); for (let i = 0; i < n; i++) { const t = (e.rot || 0) + (i / n) * TAU + Math.PI / 2; pts.push([e.c[0] + Math.cos(t) * e.r, e.c[1] + Math.sin(t) * e.r]); } return pts; }
  function slotSegs(e) {
    const a = e.a, b = e.b, r = e.r;
    const L = d2(a, b);
    if (L < 1e-9) return null;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy * r, ny = ux * r;
    const a1 = [a[0] + nx, a[1] + ny], a2 = [a[0] - nx, a[1] - ny], b1 = [b[0] + nx, b[1] + ny], b2 = [b[0] - nx, b[1] - ny];
    return [
      { t: 'line', a: a2, b: b2, sid: e.id + ':0' },
      { t: 'arc', a: b2, m: [b[0] + ux * r, b[1] + uy * r], b: b1, sid: e.id + ':1' },
      { t: 'line', a: b1, b: a1, sid: e.id + ':2' },
      { t: 'arc', a: a1, m: [a[0] - ux * r, a[1] - uy * r], b: a2, sid: e.id + ':3' },
    ];
  }
  // Einzelteile eines Elements (für Anzeige und Schleifen)
  function segsOf(e) {
    switch (e.type) {
      case 'line': return [{ t: 'line', a: e.a, b: e.b, sid: e.id }];
      case 'arc': return [{ t: 'arc', a: e.a, m: e.m, b: e.b, sid: e.id }];
      case 'rect': { const c = rectCorners(e); return [0, 1, 2, 3].map((i) => ({ t: 'line', a: c[i], b: c[(i + 1) % 4], sid: e.id + ':' + i })); }
      case 'poly': { const c = polyCorners(e); return c.map((p, i) => ({ t: 'line', a: p, b: c[(i + 1) % c.length], sid: e.id + ':' + i })); }
      case 'slot': { if (d2(e.a, e.b) < 1e-9) return [{ t: 'circle', c: e.a, r: e.r, sid: e.id }]; return slotSegs(e); }
      case 'circle': return [{ t: 'circle', c: e.c, r: e.r, sid: e.id }];
      case 'ellipse': return [{ t: 'ellipse', c: e.c, rx: e.rx, ry: e.ry, rot: e.rot || 0, sid: e.id }];
      case 'spline': return e.pts && e.pts.length >= 2 ? [{ t: 'spline', pts: e.pts, closed: !!e.closed, sid: e.id }] : [];
      case 'text': return textContours(e).flat();
    }
    return [];
  }
  function segPoints(s) {
    if (s.t === 'line') return [s.a, s.b];
    if (s.t === 'arc') return arcPoints(s.a, s.m, s.b);
    if (s.t === 'circle') { const p = circlePoints(s.c, s.r); p.push(p[0]); return p; }
    if (s.t === 'ellipse') { const p = ellipsePoints(s.c, s.rx, s.ry, s.rot); p.push(p[0]); return p; }
    if (s.t === 'spline') return splinePoints(s.pts, s.closed);
    if (s.t === 'bez') return bezPoints(s);
    return [];
  }
  function polyArea(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function inPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-300) + xi) inside = !inside;
    }
    return inside;
  }
  function loopFromSegs(segs, key, ents) {
    const pts = [];
    for (const s of segs) { const sp = segPoints(s); for (let i = 0; i < sp.length - 1; i++) pts.push(sp[i]); }
    const area = polyArea(pts);
    return { key, ents, k: { segs: segs.map((s) => { const o = s.t === 'arc' ? { t: 'arc', a: s.a, m: s.m, b: s.b } : s.t === 'bez' ? { t: 'bez', a: s.a, c1: s.c1, c2: s.c2, b: s.b } : { t: 'line', a: s.a, b: s.b }; if (s.sid) o.sid = s.sid; return o; }) }, poly: pts, area: Math.abs(area) };
  }
  function loops(ents) {
    const out = [];
    const open = [];
    for (const e of ents || []) {
      if (e.con) continue;
      if (e.type === 'text') { textContours(e).forEach((c, i) => { const L = loopFromSegs(c.map((s, si) => ({ ...s, sid: e.id + ':' + i + ':' + si })), e.id + ':' + i, [e.id]); if (L.poly.length >= 3 && L.area > 1e-6) out.push(L); }); continue; }
      if (e.type === 'circle') { out.push({ key: e.id, ents: [e.id], k: { circle: { c: e.c, r: e.r, sid: e.id } }, poly: circlePoints(e.c, e.r), area: Math.PI * e.r * e.r }); continue; }
      if (e.type === 'ellipse') { if (e.rx > 1e-6 && e.ry > 1e-6) out.push({ key: e.id, ents: [e.id], k: { ellipse: { c: e.c, rx: e.rx, ry: e.ry, rot: e.rot || 0, sid: e.id } }, poly: ellipsePoints(e.c, e.rx, e.ry, e.rot || 0), area: Math.PI * e.rx * e.ry }); continue; }
      if (e.type === 'slot' && d2(e.a, e.b) < 1e-9) { out.push({ key: e.id, ents: [e.id], k: { circle: { c: e.a, r: e.r, sid: e.id } }, poly: circlePoints(e.a, e.r), area: Math.PI * e.r * e.r }); continue; }
      if (e.type === 'rect' || e.type === 'poly' || e.type === 'slot') {
        const segs = segsOf(e);
        if (e.type === 'rect' && (Math.abs(e.a[0] - e.b[0]) < 1e-6 || Math.abs(e.a[1] - e.b[1]) < 1e-6)) continue;
        out.push(loopFromSegs(segs, e.id, [e.id])); continue;
      }
      if (e.type === 'spline') {
        if (!e.pts || e.pts.length < 2) continue;
        if (e.closed) { if (e.pts.length >= 3) out.push(loopFromSegs(splineBez(e.pts, true).map((s, si) => ({ ...s, sid: e.id + ':' + si })), e.id, [e.id])); continue; }
        if (d2(endA(e), endB(e)) > 1e-9) open.push(e);
        continue;
      }
      if (e.type === 'line' || e.type === 'arc') { if (d2(e.a, e.b) > 1e-9) open.push(e); }
    }
    // offene Linien und Bögen zu geschlossenen Zügen verbinden
    const adj = new Map();
    const addV = (p, e, end) => { const k = qkey(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push({ e, end }); };
    for (const e of open) { addV(endA(e), e, 'a'); addV(endB(e), e, 'b'); }
    const used = new Set();
    for (const start of open) {
      if (used.has(start.id)) continue;
      // Komponente sammeln
      const comp = []; const stack = [start]; const seen = new Set([start.id]);
      while (stack.length) {
        const e = stack.pop(); comp.push(e);
        for (const p of [endA(e), endB(e)]) for (const n of adj.get(qkey(p)) || []) if (!seen.has(n.e.id)) { seen.add(n.e.id); stack.push(n.e); }
      }
      comp.forEach((e) => used.add(e.id));
      const degOk = comp.every((e) => [endA(e), endB(e)].every((p) => (adj.get(qkey(p)) || []).length === 2));
      if (!degOk || comp.length < 2) continue;
      // der Reihe nach durchlaufen
      const segs = []; let cur = comp[0]; let from = endA(cur); const visited = new Set();
      for (let guard = 0; guard < comp.length + 1 && cur && !visited.has(cur.id); guard++) {
        visited.add(cur.id);
        const forward = qkey(endA(cur)) === qkey(from);
        const a = forward ? endA(cur) : endB(cur), b = forward ? endB(cur) : endA(cur);
        if (cur.type === 'spline') { const bz = splineBez(cur.pts, false).map((s, si) => ({ ...s, sid: cur.id + ':' + si })); segs.push(...(forward ? bz : bz.slice().reverse().map(revSeg))); }
        else segs.push(cur.type === 'arc' ? { t: 'arc', a, m: cur.m, b, sid: cur.id } : { t: 'line', a, b, sid: cur.id });
        from = b;
        const nxt = (adj.get(qkey(b)) || []).find((n) => n.e.id !== cur.id && !visited.has(n.e.id));
        cur = nxt ? nxt.e : null;
      }
      if (segs.length >= comp.length && qkey(segs[segs.length - 1].b) === qkey(segs[0].a) && visited.size === comp.length) {
        const ids = comp.map((e) => e.id).sort();
        out.push(loopFromSegs(segs, ids.join('+'), ids));
      }
    }
    return out;
  }
  // Offene Züge (Pfade) aus Linien, Bögen und offenen Splines – der Reihe nach, vom freien Ende aus
  function chains(ents) {
    const list = (ents || []).filter((e) => !e.con && !e.revAxis && (e.type === 'line' || e.type === 'arc' || (e.type === 'spline' && !e.closed && e.pts && e.pts.length >= 2)) && d2(endA(e), endB(e)) > 1e-9);
    const adj = new Map();
    const addV = (p, e) => { const k = qkey(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); };
    for (const e of list) { addV(endA(e), e); addV(endB(e), e); }
    const used = new Set(), out = [];
    const segOf = (e, fwd) => {
      if (e.type === 'spline') { const bz = splineBez(e.pts, false); return fwd ? bz : bz.slice().reverse().map(revSeg); }
      const s = e.type === 'arc' ? { t: 'arc', a: e.a, m: e.m, b: e.b } : { t: 'line', a: e.a, b: e.b };
      return [fwd ? s : revSeg(s)];
    };
    for (const e0 of list) {
      if (used.has(e0.id)) continue;
      // Komponente sammeln
      const comp = []; const stack = [e0]; const seen = new Set([e0.id]);
      while (stack.length) { const e = stack.pop(); comp.push(e); for (const p of [endA(e), endB(e)]) for (const n of adj.get(qkey(p)) || []) if (!seen.has(n.id)) { seen.add(n.id); stack.push(n); } }
      comp.forEach((e) => used.add(e.id));
      const deg = (p) => (adj.get(qkey(p)) || []).length;
      if (comp.some((e) => deg(endA(e)) > 2 || deg(endB(e)) > 2)) continue;   // Abzweigungen: kein eindeutiger Pfad
      const start = comp.find((e) => deg(endA(e)) === 1 || deg(endB(e)) === 1); if (!start) continue;   // geschlossen: das ist eine Fläche
      let cur = start, from = deg(endA(start)) === 1 ? endA(start) : endB(start);
      const segs = [], ids = [], vis = new Set();
      while (cur && !vis.has(cur.id)) {
        vis.add(cur.id); ids.push(cur.id);
        const fwd = qkey(endA(cur)) === qkey(from);
        segs.push(...segOf(cur, fwd));
        from = fwd ? endB(cur) : endA(cur);
        cur = (adj.get(qkey(from)) || []).find((n) => !vis.has(n.id));
      }
      let len = 0; for (const s of segs) { const pts = segPoints(s); for (let i = 1; i < pts.length; i++) len += d2(pts[i - 1], pts[i]); }
      out.push({ segs, ents: ids, len });
    }
    return out.sort((a, b) => b.len - a.len);
  }
  function openEnds(ents) {
    // Endpunkte, die nur an einer Linie hängen (Hinweis „Umriss nicht geschlossen“)
    // Alleinstehende Drehachsen (revAxis) zählen nicht als offenes Ende.
    const cnt = new Map();
    for (const e of ents || []) {
      if (e.con || (e.type !== 'line' && e.type !== 'arc' && !(e.type === 'spline' && !e.closed))) continue;
      for (const p of [endA(e), endB(e)]) {
        const k = qkey(p), cur = cnt.get(k);
        cnt.set(k, { p, n: (cur ? cur.n : 0) + 1, rev: (cur ? cur.rev : true) && !!e.revAxis });
      }
    }
    return [...cnt.values()].filter((x) => x.n === 1 && !x.rev).map((x) => x.p);
  }
  function labelPoint(poly, holes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    let best = null, bestD = -1;
    const N = 18;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const q = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!inPoly(q, poly) || holes.some((h) => inPoly(q, h))) continue;
      let dm = Infinity;
      for (const ring of [poly, ...holes]) for (let k = 0; k < ring.length; k++) dm = Math.min(dm, distSeg(q, ring[k], ring[(k + 1) % ring.length]));
      if (dm > bestD) { bestD = dm; best = q; }
    }
    return best || poly[0];
  }
  function regions(ents) {
    const ls = loops(ents).sort((a, b) => b.area - a.area);
    for (let i = 0; i < ls.length; i++) {
      const L = ls[i]; L.parent = null; L.depth = 0;
      for (let j = i - 1; j >= 0; j--) {
        const C = ls[j];
        if (C.area <= L.area + 1e-9) continue;
        if (inPoly(L.poly[0], C.poly) && inPoly(L.poly[Math.floor(L.poly.length / 2)], C.poly)) { L.parent = C; L.depth = C.depth + 1; break; }
      }
    }
    const regs = [];
    for (const L of ls) {
      if (L.depth % 2) continue;
      const holes = ls.filter((x) => x.parent === L);
      regs.push({ key: L.key, outer: L, holes, area: L.area - holes.reduce((s, h) => s + h.area, 0), label: labelPoint(L.poly, holes.map((h) => h.poly)) });
    }
    return regs;
  }
  function regionAt(regs, pt) {
    let best = null;
    for (const r of regs) {
      if (!inPoly(pt, r.outer.poly)) continue;
      if (r.holes.some((h) => inPoly(pt, h.poly))) continue;
      if (!best || r.area < best.area) best = r;
    }
    return best;
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function distEnt(e, p) {
    if (e.type === 'point') return d2(e.a, p);
    let best = Infinity;
    for (const s of segsOf(e)) {
      if (s.t === 'line') best = Math.min(best, distSeg(p, s.a, s.b));
      else if (s.t === 'circle') best = Math.min(best, Math.abs(d2(p, s.c) - s.r));
      else { const pts = segPoints(s); for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distSeg(p, pts[i], pts[i + 1])); }
    }
    return best;
  }
  function hit(ents, p, tol) {
    let best = null, bd = tol;
    for (const e of ents) { const d = distEnt(e, p); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function snapPoints(ents, refs = []) {
    const pts = [{ p: [0, 0], type: 'origin' }];
    const add = (p, type, ref) => pts.push({ p, type, ref });
    const each = (list, isRef) => {
      for (const e of list) {
        const r = isRef ? 'ref' : e.id;
        if (e.type === 'line') { add(e.a, 'end', r); add(e.b, 'end', r); add(lerp(e.a, e.b, 0.5), 'mid', r); }
        else if (e.type === 'arc') { add(e.a, 'end', r); add(e.b, 'end', r); const ai = arcInfo(e.a, e.m, e.b); if (ai) add(ai.c, 'center', r); }
        else if (e.type === 'circle') { add(e.c, 'center', r); for (let k = 0; k < 4; k++) add([e.c[0] + Math.cos((k * Math.PI) / 2) * e.r, e.c[1] + Math.sin((k * Math.PI) / 2) * e.r], 'quad', r); }
        else if (e.type === 'ellipse') { add(e.c, 'center', r); ellipsePoints(e.c, e.rx, e.ry, e.rot || 0, 4).forEach((q) => add(q, 'quad', r)); }
        else if (e.type === 'rect') { const c = rectCorners(e); c.forEach((q, i) => { add(q, 'end', r); add(lerp(q, c[(i + 1) % 4], 0.5), 'mid', r); }); add(lerp(e.a, e.b, 0.5), 'center', r); }
        else if (e.type === 'poly') { polyCorners(e).forEach((q) => add(q, 'end', r)); add(e.c, 'center', r); }
        else if (e.type === 'slot') { add(e.a, 'center', r); add(e.b, 'center', r); }
        else if (e.type === 'spline') { e.pts.forEach((q) => add(q, 'end', r)); }
        else if (e.type === 'point') add(e.a, 'end', r);
        else if (e.type === 'text') { add(e.a, 'end', r); const tb = textBox(e); if (tb) add(tb.c, 'center', r); }
      }
    };
    each(ents, false); each(refs, true);
    return pts;
  }
  // Flächen-Umrisse des Körpers (3D) in Skizzen-Koordinaten umrechnen
  function project3(frame, p) { const d = [p[0] - frame.o[0], p[1] - frame.o[1], p[2] - frame.o[2]]; return [d[0] * frame.x[0] + d[1] * frame.x[1] + d[2] * frame.x[2], d[0] * frame.y[0] + d[1] * frame.y[1] + d[2] * frame.y[2]]; }
  function faceLoopsToEnts(frame, loops3, mat) {
    const ents = [];
    const tp = (p) => { if (!mat) return project3(frame, p); const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(mat); return project3(frame, [v.x, v.y, v.z]); };
    for (const loop of loops3 || []) {
      for (const s of loop) {
        if (s.t === 'LINE') ents.push({ id: uid('e'), type: 'line', a: tp(s.a), b: tp(s.b) });
        else if (s.t === 'CIRCLE' && s.c) {
          const a = tp(s.a), b = tp(s.b), m = tp(s.m);
          if (d2(a, b) < 1e-6) ents.push({ id: uid('e'), type: 'circle', c: tp(s.c), r: s.r });
          else ents.push({ id: uid('e'), type: 'arc', a, m, b });
        } else if (s.pts) {
          const pts = s.pts.map(tp);
          for (let i = 0; i < pts.length - 1; i++) ents.push({ id: uid('e'), type: 'line', a: pts[i], b: pts[i + 1] });
        } else ents.push({ id: uid('e'), type: 'line', a: tp(s.a), b: tp(s.b) });
      }
    }
    // Endpunkte exakt verschweißen
    const pts = [];
    const weld = (p) => { for (const q of pts) if (d2(p, q) < 1e-5) return q; pts.push(p); return p; };
    for (const e of ents) { if (e.type === 'line' || e.type === 'arc') { e.a = weld(e.a); e.b = weld(e.b); } }
    return ents;
  }
  function bounds(ents) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of ents) for (const p of e.type === 'point' ? [e.a] : segsOf(e).flatMap(segPoints)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return isFinite(x0) ? [x0, y0, x1, y1] : null;
  }
  function translateEnt(e, dx, dy) {
    const mv = (p) => [p[0] + dx, p[1] + dy];
    const o = { ...e };
    for (const k of ['a', 'b', 'm', 'c']) if (o[k]) o[k] = mv(o[k]);
    if (o.pts) o.pts = o.pts.map(mv);
    return o;
  }
  // ---------- Maße: feste Werte oder Formeln, die die Skizze steuern ----------
  // Ein Maß ist { id, e: Element-ID, k: Größe, v: Zahl oder Formel }.
  const DIMKEYS = {
    line: ['len', 'ang', 'x', 'y'], point: ['x', 'y'], rect: ['w', 'h', 'x', 'y'], circle: ['d', 'x', 'y'], ellipse: ['w', 'h', 'x', 'y'], text: ['h', 'x', 'y'],
    poly: ['d', 'n', 'x', 'y'], slot: ['len', 'w', 'x', 'y'], arc: ['r', 'arcLen', 'x', 'y'], spline: ['x', 'y'],
  };
  const DIMNAME = {
    get len() { return T('common.length'); }, get ang() { return T('common.angle'); },
    get w() { return T('common.width'); }, get h() { return T('common.height'); },
    get d() { return T('common.diameter'); }, get n() { return T('param.n'); },
    get x() { return T('sk.panel.dx'); }, get y() { return T('sk.panel.dy'); },
    get r() { return T('common.radius'); }, get arcLen() { return T('sk.dim.arcLen'); },
    get dist() { return T('common.distance'); }, get distPL() { return T('common.distance'); },
    get angLL() { return T('common.angle'); }, get ang3() { return T('sk.dim.ang3'); },
    get ord() { return T('sk.dim.ord'); }, get distCC() { return T('sk.dim.distCC'); },
  };
  const anchorKey = (e) => (e.type === 'circle' || e.type === 'poly' || e.type === 'ellipse' ? 'c' : 'a');
  const anchorOf = (e) => (e.type === 'spline' ? e.pts[0] : e[anchorKey(e)]);
  function measure(e, k) {
    switch (k) {
      case 'len': return d2(e.a, e.b);
      case 'ang': return (Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180) / Math.PI;
      case 'w': return e.type === 'slot' ? 2 * e.r : e.type === 'ellipse' ? 2 * e.rx : Math.abs(e.b[0] - e.a[0]);
      case 'h': return e.type === 'text' ? e.h : e.type === 'ellipse' ? 2 * e.ry : Math.abs(e.b[1] - e.a[1]);
      case 'd': return 2 * e.r;
      case 'r': { if (e.type === 'circle') return e.r; const ai = arcInfo(e.a, e.m, e.b); return ai ? ai.r : NaN; }
      case 'arcLen': { if (e.type !== 'arc') return NaN; const ai = arcInfo(e.a, e.m, e.b); return ai ? Math.abs(ai.sweep) * ai.r : NaN; }
      case 'n': return e.n;
      case 'x': return anchorOf(e)[0];
      case 'y': return anchorOf(e)[1];
    }
    return NaN;
  }
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  function setMeasure(e, k, v) {
    switch (k) {
      case 'len': { if (!(v > 0)) return false; const L = d2(e.a, e.b); const ux = L > 1e-9 ? (e.b[0] - e.a[0]) / L : 1, uy = L > 1e-9 ? (e.b[1] - e.a[1]) / L : 0; e.b = [r4(e.a[0] + ux * v), r4(e.a[1] + uy * v)]; return true; }
      case 'ang': { const L = d2(e.a, e.b); const t = (v * Math.PI) / 180; e.b = [r4(e.a[0] + Math.cos(t) * L), r4(e.a[1] + Math.sin(t) * L)]; return true; }
      case 'w': if (!(v > 0)) return false; if (e.type === 'slot') e.r = v / 2; else if (e.type === 'ellipse') e.rx = v / 2; else { const s = e.b[0] >= e.a[0] ? 1 : -1; e.b = [r4(e.a[0] + s * v), e.b[1]]; } return true;
      case 'h': { if (!(v > 0)) return false; if (e.type === 'text') { e.h = v; return true; } if (e.type === 'ellipse') { e.ry = v / 2; return true; } const s = e.b[1] >= e.a[1] ? 1 : -1; e.b = [e.b[0], r4(e.a[1] + s * v)]; return true; }
      case 'd': if (!(v > 0)) return false; e.r = v / 2; return true;
      case 'n': e.n = clamp(Math.round(v), 3, 64); return true;
      case 'x': case 'y': {
        const p = anchorOf(e); const dv = v - p[k === 'x' ? 0 : 1];
        if (Math.abs(dv) < 1e-9) return true;
        Object.assign(e, translateEnt(e, k === 'x' ? dv : 0, k === 'y' ? dv : 0)); return true;
      }
    }
    return false;
  }
  const ends = (e) => (e.type === 'line' || e.type === 'arc' ? [e.a, e.b] : []);
  // Maße (und ab Sitzung 6 auch Bedingungen) erfüllt jetzt der Löser – siehe 16-solver.js
  function applyDims(ents, dims, V, inPlace, cons) {
    const r = Solver.solve({ ents: ents || [], dims: dims || [], cons: cons || [] }, V, { inPlace });
    return r.ents;
  }
  return { textPathPts, chains, ellipsePoints, splineBez, bezPoints, textContours, textBox, FONTS, FONTNAMES, isFontLoaded, loadFont, needsEntsFonts, ensureEntsFonts, ensureDocFonts, onFont: fontEv.on, syncFonts, ensureFonts, loops, regions, regionAt, segsOf, segPoints, splinePoints, lineSegsOf, endA, endB, anchorOf, distSeg, arcInfo, arcPoints, circlePoints, rectCorners, polyCorners, hit, distEnt, snapPoints, faceLoopsToEnts, project3, openEnds, bounds, translateEnt, inPoly, d2, applyDims, measure, setMeasure, DIMKEYS, DIMNAME };
})();

