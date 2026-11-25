// ================= Bauteil-Bibliothek (Definitionen für die Oberfläche) =================
const SIZES = ['M1.6', 'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'];
const SCREW_DATA = /*JSON:schrauben.json*/null;
const SCREW_LIST = (SCREW_DATA && SCREW_DATA.schrauben) || [];
const SCREW_BY_ID = new Map(SCREW_LIST.map((x) => [String(x.groesse), x]));
function screwEntry(size) { return SCREW_BY_ID.get(String(size || 'M3')) || SCREW_BY_ID.get('M3') || SCREW_LIST[0] || null; }
const SCREW_LENGTHS = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
function screwNominalDia(size) {
  return parseFloat(String(size || 'M3').replace(/^M/i, '')) || 3;
}
function matchScrewForHole(diaMm, opts = {}) {
  const d = Number(diaMm);
  if (!(d >= 1.1 && d <= 29.0)) return null;
  let best = null;
  let bestScore = Infinity;
  for (const se of SCREW_LIST) {
    const nomD = screwNominalDia(se.groesse);
    const candidates = [
      [se.durchgang_mittel_mm, 'medium', 'through', 0.0],
      [se.durchgang_fein_mm, 'fine', 'through', 0.02],
      [se.durchgang_grob_mm, 'coarse', 'through', 0.05],
      [se.kernloch_mm, 'tap', 'tap', opts.preferTap ? -0.02 : 0.08],
    ];
    for (const [targetDia, fit, fitKind, penalty] of candidates) {
      if (!(targetDia > 0)) continue;
      if (fitKind === 'through' && d < nomD - 0.05) continue;
      const tol = Math.min(0.85, Math.max(0.25, targetDia * 0.045));
      const diff = Math.abs(d - targetDia);
      if (diff > tol) continue;
      const score = diff + penalty;
      if (score < bestScore) {
        bestScore = score;
        best = { size: se.groesse, entry: se, nomD, fitKind, fit, targetDia, diff };
      }
    }
  }
  return best;
}
function suggestScrewLength(size, thicknessMm, opts = {}) {
  const se = screwEntry(size);
  const d = screwNominalDia(size);
  const pitch = (se && se.steigung_mm) || 0.8;
  const head = opts.head || 'zyl';
  const cbDepth = Math.max(0, Number(opts.cbDepth) || 0);
  const washerH = (se && se.scheibe && se.scheibe.dicke_mm) || 0;
  const nutH = (se && se.mutter && se.mutter.hoehe_mm) || 0;
  const t = Math.max(1, Number(thicknessMm) || 10);
  const eff = head === 'senk' ? t : Math.max(1, t - cbDepth);
  const minLen = head === 'senk'
    ? Math.max(4, Math.ceil(((se && se.senkkopf && se.senkkopf.kopf_h_mm) || d) + 2))
    : Math.max(4, Math.ceil(d * 1.2));
  if (opts.isBlind) {
    const maxL = Math.max(1, eff - Math.max(0.5, pitch));
    let chosen = null;
    for (const L of SCREW_LENGTHS) {
      if (L <= maxL + 1e-6) chosen = L;
    }
    if (chosen != null) return chosen;
    return Math.max(2, round(maxL, 1));
  }
  const wExtra = opts.withWasher
    ? (head === 'senk' ? (opts.withNut ? washerH : 0) : (opts.withNut ? 2 * washerH : washerH))
    : 0;
  const extra = opts.withNut
    ? nutH + Math.max(1.5, 2 * pitch)
    : (opts.fitKind === 'tap' ? Math.max(1.0, 2 * pitch) : Math.max(2, Math.round(d * 0.6)));
  const req = Math.max(minLen, eff + wExtra + extra);
  const hit = SCREW_LENGTHS.find((L) => L >= req - 1e-6);
  if (hit != null) return hit;
  return Math.ceil(req / 10) * 10;
}
function screwNormName(size, head = 'zyl', length = 10) {
  const s = String(size || 'M3');
  const L = String(round(Number(length) || 10, 1)).replace('.', ',');
  if (head === 'hex') {
    return {
      name: `Sechskantschraube ${s}×${L}`,
      partNo: `ISO 4017 ${s}×${L}`,
      desc: `Sechskantschraube ${s} × ${L} mm (ISO 4017)`,
    };
  }
  if (head === 'senk') {
    return {
      name: `Senkschraube ${s}×${L}`,
      partNo: `ISO 10642 ${s}×${L}`,
      desc: `Senkschraube ${s} × ${L} mm (ISO 10642)`,
    };
  }
  return {
    name: `Schraube ${s}×${L}`,
    partNo: `ISO 4762 ${s}×${L}`,
    desc: `Zylinderschraube ${s} × ${L} mm (ISO 4762)`,
  };
}
const THREAD_DATA = /*JSON:gewinde.json*/null;
const PIN_DATA = /*JSON:passstifte.json*/null;
const KEY_DATA = /*JSON:passfedern.json*/null;
const BEARING_DATA = /*JSON:lager.json*/null;
const SEAL_DATA = /*JSON:dichtungen.json*/null;
const SPRING_DATA = /*JSON:federn.json*/null;
const THREAD_NORMS = (THREAD_DATA && THREAD_DATA.normen) || [];
const THREAD_NORM_OPTIONS = THREAD_NORMS.map((n) => [n.id, n.name]);
const THREAD_BY_NORM = new Map(THREAD_NORMS.map((n) => [n.id, n]));
const THREAD_BY_ID = new Map();
for (const n of THREAD_NORMS) {
  for (const g of n.groessen || []) THREAD_BY_ID.set(g.id, { ...g, normId: n.id, normName: n.name, quelle: n.quelle });
}
const THREAD_GROUPED_OPTIONS = THREAD_NORMS.map((n) => ({ group: n.name, options: (n.groessen || []).map((g) => g.id) }));
function threadEntry(size) { return THREAD_BY_ID.get(String(size || '')) || null; }
function threadSizesForNorm(normId) { const n = THREAD_BY_NORM.get(normId); return n ? (n.groessen || []).map((g) => g.id) : SIZES; }
function threadDefaultSize(normId) { const n = THREAD_BY_NORM.get(normId); return (n && (n.standard_groesse || (n.groessen && n.groessen[0] && n.groessen[0].id))) || 'M3'; }
function threadHoleDia(te, fit) {
  if (!te) return 3.4;
  if (fit === 'fine') return te.durchgang_fein_mm;
  if (fit === 'coarse') return te.durchgang_grob_mm;
  if (fit === 'tap') return te.kernloch_mm;
  return te.durchgang_mittel_mm;
}
// Zentrierbohrungen nach DIN 332 Form A (60°-Kegel + Führungsbohrung mit 118°-Bohrspitze)
const CENTER_DRILLS = {
  A1: { d1: 1.0, d2: 2.12, t1: 1.3 },
  'A1.6': { d1: 1.6, d2: 3.35, t1: 2.0 },
  A2: { d1: 2.0, d2: 4.25, t1: 2.5 },
  'A2.5': { d1: 2.5, d2: 5.30, t1: 3.1 },
  'A3.15': { d1: 3.15, d2: 6.70, t1: 3.9 },
  A4: { d1: 4.0, d2: 8.50, t1: 5.0 },
  A5: { d1: 5.0, d2: 10.60, t1: 6.3 },
  'A6.3': { d1: 6.3, d2: 13.20, t1: 8.0 },
};
const CENTER_SIZES = [
  ['A1', 'A 1,0 (Ø 1,0 / 2,12)'],
  ['A1.6', 'A 1,6 (Ø 1,6 / 3,35)'],
  ['A2', 'A 2,0 (Ø 2,0 / 4,25)'],
  ['A2.5', 'A 2,5 (Ø 2,5 / 5,30)'],
  ['A3.15', 'A 3,15 (Ø 3,15 / 6,70)'],
  ['A4', 'A 4,0 (Ø 4,0 / 8,50)'],
  ['A5', 'A 5,0 (Ø 5,0 / 10,60)'],
  ['A6.3', 'A 6,3 (Ø 6,3 / 13,20)'],
];
// ISO 286-2 Grundtoleranz IT7 (oberes Abmaß ES in µm für Einheitsbohrung H7, EI = 0)
const H7_TABLE = [[3, 10], [6, 12], [10, 15], [18, 18], [30, 21], [50, 25], [80, 30], [120, 35], [180, 40], [250, 46], [315, 52], [400, 57], [500, 63]];
function h7Info(d) {
  const n = Number(d);
  if (!(n > 0)) return { d: 0, um: null };
  const row = H7_TABLE.find(([hi]) => n <= hi);
  if (!row) return { d: n, um: null };
  const es = row[1] / 1000;
  return {
    d: n,
    um: row[1],
    es,
    min: n,
    max: n + es,
    esText: '+' + es.toFixed(3).replace('.', ','),
    rangeText: `${n.toFixed(3).replace('.', ',')} – ${(n + es).toFixed(3).replace('.', ',')} mm`,
  };
}
function blindTipHeight(d, tipAngle = 118) {
  const ang = Number(tipAngle);
  if (!(d > 0) || !(ang > 1 && ang < 179.5)) return 0;
  return (d / 2) / Math.tan((ang * Math.PI) / 360);
}
function centerHoleMetrics(size) {
  const c = CENTER_DRILLS[size] || CENTER_DRILLS['A2.5'];
  const hCone = ((c.d2 - c.d1) / 2) / Math.tan(Math.PI / 6);
  const tipH = (c.d1 / 2) / Math.tan((118 * Math.PI) / 360);
  return { ...c, hCone, tipH, totalDepth: hCone + c.t1 + tipH };
}
// Normteile: Passstifte (ISO 2338), Passfedern & Nuten (DIN 6885 A), Kugel- & Gleitlager (DIN 625 / ISO 3547)
const PIN_LIST = (PIN_DATA && PIN_DATA.groessen) || [];
const PIN_BY_ID = new Map(PIN_LIST.map((x) => [String(x.id), x]));
const PIN_OPTIONS = PIN_LIST.map((x) => [String(x.id), 'Ø ' + String(x.d_mm).replace('.', ',') + ' mm']);
function pinEntry(size) {
  const s = String(size ?? '6').trim().replace(',', '.');
  if (PIN_BY_ID.has(s)) return PIN_BY_ID.get(s);
  const n = Number(s);
  if (isFinite(n)) { const hit = PIN_LIST.find((x) => Math.abs(x.d_mm - n) < 1e-6); if (hit) return hit; }
  return PIN_BY_ID.get('6') || PIN_LIST[0] || null;
}
const KEY_LIST = (KEY_DATA && KEY_DATA.groessen) || [];
const KEY_BY_ID = new Map(KEY_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const KEY_OPTIONS = KEY_LIST.map((x) => [x.id, `${x.b_mm} × ${x.h_mm} (Welle Ø ${x.welle_min_mm}–${x.welle_max_mm})`]);
function keyEntry(size) {
  const s = String(size || '6x6').trim().toLowerCase().replace(/\s+/g, '').replace('×', 'x');
  return KEY_BY_ID.get(s) || KEY_BY_ID.get('6x6') || KEY_LIST[0] || null;
}
// Passfeder (DIN 6885-1) passend zum Wellendurchmesser
function keyEntryForShaft(d) {
  const n = Number(d);
  if (!(n > 0) || !KEY_LIST.length) return keyEntry('6x6');
  const hit = KEY_LIST.find((x) => n > x.welle_min_mm && n <= x.welle_max_mm);
  if (hit) return hit;
  if (n <= KEY_LIST[0].welle_min_mm) return KEY_LIST[0];
  return KEY_LIST[KEY_LIST.length - 1];
}
// Gewindefreistich nach DIN 76-1 für metrische Außengewinde (Form A normal, Form B kurz; Innengewinde analog)
const UNDERCUT_DIN76 = [
  { p: 0.35, dMinus: 0.7, g1A: 0.7, g2A: 1.3, g1B: 0.6, g2B: 0.9, r: 0.16 },
  { p: 0.4, dMinus: 0.8, g1A: 0.8, g2A: 1.4, g1B: 0.6, g2B: 1.0, r: 0.2 },
  { p: 0.45, dMinus: 0.9, g1A: 0.9, g2A: 1.6, g1B: 0.7, g2B: 1.1, r: 0.2 },
  { p: 0.5, dMinus: 1.0, g1A: 1.0, g2A: 1.8, g1B: 0.8, g2B: 1.3, r: 0.2 },
  { p: 0.6, dMinus: 1.2, g1A: 1.2, g2A: 2.1, g1B: 1.0, g2B: 1.5, r: 0.4 },
  { p: 0.7, dMinus: 1.4, g1A: 1.4, g2A: 2.5, g1B: 1.1, g2B: 1.8, r: 0.4 },
  { p: 0.75, dMinus: 1.5, g1A: 1.5, g2A: 2.7, g1B: 1.2, g2B: 1.9, r: 0.4 },
  { p: 0.8, dMinus: 1.6, g1A: 1.6, g2A: 2.8, g1B: 1.3, g2B: 2.0, r: 0.4 },
  { p: 1.0, dMinus: 1.9, g1A: 2.0, g2A: 3.5, g1B: 1.6, g2B: 2.5, r: 0.6 },
  { p: 1.25, dMinus: 2.3, g1A: 2.5, g2A: 4.4, g1B: 2.0, g2B: 3.2, r: 0.6 },
  { p: 1.5, dMinus: 2.7, g1A: 3.0, g2A: 5.2, g1B: 2.4, g2B: 3.8, r: 0.8 },
  { p: 1.75, dMinus: 3.1, g1A: 3.5, g2A: 6.1, g1B: 2.8, g2B: 4.4, r: 1.0 },
  { p: 2.0, dMinus: 3.5, g1A: 4.0, g2A: 7.0, g1B: 3.2, g2B: 5.0, r: 1.0 },
  { p: 2.5, dMinus: 4.4, g1A: 5.0, g2A: 8.8, g1B: 4.0, g2B: 6.3, r: 1.2 },
  { p: 3.0, dMinus: 5.2, g1A: 6.0, g2A: 10.5, g1B: 4.8, g2B: 7.5, r: 1.6 },
];
const UNDERCUT_PITCH_OPTIONS = UNDERCUT_DIN76.map((u) => [String(u.p), `P ${String(u.p).replace('.', ',')} mm`]);
function undercutEntry(pitch) {
  const pv = Number(pitch);
  if (!(pv > 0)) return UNDERCUT_DIN76[8];
  let best = UNDERCUT_DIN76[0], bd = Infinity;
  for (const row of UNDERCUT_DIN76) {
    const dd = Math.abs(row.p - pv);
    if (dd < bd) { bd = dd; best = row; }
  }
  return best;
}
function undercutDimsForDia(d, pitch, form = 'A', isInner = false) {
  const row = undercutEntry(pitch);
  const f = form === 'B' ? 'B' : 'A';
  const grooveD = isInner
    ? Math.round((d + row.dMinus * 0.6) * 100) / 100
    : Math.round(Math.max(0.5, d - row.dMinus) * 100) / 100;
  return {
    pitch: row.p,
    form: f,
    grooveD,
    width: f === 'B' ? row.g2B : row.g2A,
    g1: f === 'B' ? row.g1B : row.g1A,
    r: row.r,
  };
}
// Einstiche für Sicherungsringe nach DIN 471 (Welle) und DIN 472 (Bohrung)
const CIRCLIP_DIN471 = [
  { d1: 4, d2: 3.8, m: 0.5, s: 0.4 }, { d1: 5, d2: 4.8, m: 0.7, s: 0.6 },
  { d1: 6, d2: 5.7, m: 0.8, s: 0.7 }, { d1: 7, d2: 6.7, m: 0.9, s: 0.8 },
  { d1: 8, d2: 7.6, m: 0.9, s: 0.8 }, { d1: 9, d2: 8.6, m: 1.1, s: 1.0 },
  { d1: 10, d2: 9.6, m: 1.1, s: 1.0 }, { d1: 12, d2: 11.5, m: 1.1, s: 1.0 },
  { d1: 14, d2: 13.4, m: 1.1, s: 1.0 }, { d1: 15, d2: 14.3, m: 1.1, s: 1.0 },
  { d1: 16, d2: 15.2, m: 1.1, s: 1.0 }, { d1: 17, d2: 16.2, m: 1.1, s: 1.0 },
  { d1: 18, d2: 17.0, m: 1.3, s: 1.2 }, { d1: 20, d2: 19.0, m: 1.3, s: 1.2 },
  { d1: 22, d2: 21.0, m: 1.3, s: 1.2 }, { d1: 24, d2: 22.9, m: 1.3, s: 1.2 },
  { d1: 25, d2: 23.9, m: 1.3, s: 1.2 }, { d1: 28, d2: 26.6, m: 1.6, s: 1.5 },
  { d1: 30, d2: 28.6, m: 1.6, s: 1.5 }, { d1: 32, d2: 30.3, m: 1.6, s: 1.5 },
  { d1: 35, d2: 33.0, m: 1.6, s: 1.5 }, { d1: 40, d2: 37.5, m: 1.85, s: 1.75 },
  { d1: 45, d2: 42.5, m: 1.85, s: 1.75 }, { d1: 50, d2: 47.0, m: 2.15, s: 2.0 },
];
const CIRCLIP_DIN472 = [
  { d1: 8, d2: 8.4, m: 0.9, s: 0.8 }, { d1: 10, d2: 10.4, m: 1.1, s: 1.0 },
  { d1: 12, d2: 12.5, m: 1.1, s: 1.0 }, { d1: 15, d2: 15.7, m: 1.1, s: 1.0 },
  { d1: 16, d2: 16.8, m: 1.1, s: 1.0 }, { d1: 18, d2: 19.0, m: 1.1, s: 1.0 },
  { d1: 20, d2: 21.0, m: 1.1, s: 1.0 }, { d1: 22, d2: 23.0, m: 1.1, s: 1.0 },
  { d1: 24, d2: 25.2, m: 1.3, s: 1.2 }, { d1: 25, d2: 26.2, m: 1.3, s: 1.2 },
  { d1: 26, d2: 27.2, m: 1.3, s: 1.2 }, { d1: 28, d2: 29.4, m: 1.3, s: 1.2 },
  { d1: 30, d2: 31.4, m: 1.3, s: 1.2 }, { d1: 32, d2: 33.7, m: 1.3, s: 1.2 },
  { d1: 35, d2: 37.0, m: 1.6, s: 1.5 }, { d1: 40, d2: 42.5, m: 1.85, s: 1.75 },
  { d1: 50, d2: 53.0, m: 2.15, s: 2.0 },
];
const CIRCLIP_471_OPTIONS = CIRCLIP_DIN471.map((c) => [String(c.d1), `Ø ${c.d1} (Nut Ø ${String(c.d2).replace('.', ',')} × ${String(c.m).replace('.', ',')})`]);
const CIRCLIP_472_OPTIONS = CIRCLIP_DIN472.map((c) => [String(c.d1), `Ø ${c.d1} (Nut Ø ${String(c.d2).replace('.', ',')} × ${String(c.m).replace('.', ',')})`]);
function circlipEntry(d, norm = 'din471') {
  const n = norm === 'din472' ? 'din472' : 'din471';
  const tbl = n === 'din472' ? CIRCLIP_DIN472 : CIRCLIP_DIN471;
  const dv = Number(d);
  if (!(dv > 0)) return { ...tbl[0], norm: n, exact: false };
  let best = tbl[0], bd = Infinity;
  for (const row of tbl) {
    const dd = Math.abs(row.d1 - dv);
    if (dd < bd) { bd = dd; best = row; }
  }
  if (bd < 0.05) return { ...best, norm: n, exact: true };
  const d2 = n === 'din472'
    ? Math.round((dv + Math.abs(best.d2 - best.d1)) * 100) / 100
    : Math.round(Math.max(0.5, dv - Math.abs(best.d1 - best.d2)) * 100) / 100;
  return { d1: best.d1, d2, m: best.m, s: best.s, norm: n, exact: false };
}
// Keilwellen-Profile nach DIN ISO 14 (gerade parallele Flanken, Innenzentrierung)
const SPLINE_DIN_ISO14 = [
  { id: '6x11x14', n: 6, d: 11, D: 14, b: 3 },
  { id: '6x13x16', n: 6, d: 13, D: 16, b: 3.5 },
  { id: '6x16x20', n: 6, d: 16, D: 20, b: 4 },
  { id: '6x18x22', n: 6, d: 18, D: 22, b: 5 },
  { id: '6x21x25', n: 6, d: 21, D: 25, b: 5 },
  { id: '6x23x28', n: 6, d: 23, D: 28, b: 6 },
  { id: '6x26x32', n: 6, d: 26, D: 32, b: 6 },
  { id: '6x28x34', n: 6, d: 28, D: 34, b: 7 },
  { id: '8x32x38', n: 8, d: 32, D: 38, b: 6 },
  { id: '8x36x42', n: 8, d: 36, D: 42, b: 7 },
  { id: '8x42x48', n: 8, d: 42, D: 48, b: 8 },
  { id: '8x46x54', n: 8, d: 46, D: 54, b: 9 },
];
const SPLINE_BY_ID = new Map(SPLINE_DIN_ISO14.map((x) => [x.id, x]));
const SPLINE_OPTIONS = SPLINE_DIN_ISO14.map((x) => [x.id, `${x.n} × ${x.d} × ${x.D} (b ${String(x.b).replace('.', ',')} mm)`]);
function splineEntry(id) {
  const s = String(id || '6x16x20').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
  return SPLINE_BY_ID.get(s) || SPLINE_BY_ID.get('6x16x20') || SPLINE_DIN_ISO14[0];
}
function splineEntryForDia(dia, isInner = false) {
  const dv = Number(dia);
  if (!(dv > 0)) return SPLINE_DIN_ISO14[2];
  let best = SPLINE_DIN_ISO14[0], bd = Infinity;
  for (const row of SPLINE_DIN_ISO14) {
    const ref = isInner ? row.d : row.D;
    const dd = Math.abs(ref - dv);
    if (dd < bd) { bd = dd; best = row; }
  }
  return best;
}
const BEARING_SERIES = (BEARING_DATA && BEARING_DATA.kugellager_reihen) || [];
const BEARING_BY_ID = new Map();
for (const s of BEARING_SERIES) {
  for (const b of s.lager || []) BEARING_BY_ID.set(String(b.id), { ...b, reiheId: s.id, reiheName: s.name, quelle: s.quelle });
}
const BEARING_GROUPED_OPTIONS = BEARING_SERIES.map((s) => ({
  group: s.name,
  options: (s.lager || []).map((b) => [b.id, `${b.id} (Ø ${b.d_mm} × ${b.D_mm} × ${b.B_mm})`]),
}));
function bearingEntry(size) {
  const s = String(size ?? '608').trim();
  return BEARING_BY_ID.get(s) || BEARING_BY_ID.get('608') || null;
}
const SLEEVE_DATA = (BEARING_DATA && BEARING_DATA.gleitlager) || {};
const SLEEVE_LIST = SLEEVE_DATA.groessen || [];
const SLEEVE_BY_ID = new Map(SLEEVE_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const SLEEVE_OPTIONS = SLEEVE_LIST.map((x) => [x.id, `Ø ${String(x.d_mm).replace('.', ',')} × ${String(x.D_mm).replace('.', ',')} (Wand ${String(x.wand_mm).replace('.', ',')})`]);
function sleeveEntry(size) {
  const s = String(size || '8x10').trim().toLowerCase().replace(/\s+/g, '').replace('×', 'x').replace(',', '.');
  return SLEEVE_BY_ID.get(s) || SLEEVE_BY_ID.get('8x10') || SLEEVE_LIST[0] || null;
}
// O-Ringe & Einbaunuten (DIN 3771 / ISO 3601) sowie Wellendichtringe (DIN 3760 / ISO 6194-1)
const ORING_DATA = (SEAL_DATA && SEAL_DATA.oringe) || {};
const ORING_GROOVE_RULES = ORING_DATA.nut_regeln || [];
const ORING_LIST = ORING_DATA.groessen || [];
const ORING_BY_ID = new Map(ORING_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const ORING_OPTIONS = ORING_LIST.map((x) => [x.id, `${String(x.d1_mm).replace('.', ',')} × ${String(x.d2_mm).replace('.', ',')} mm`]);
function oringEntry(size) {
  const s = String(size || '20x2').trim().toLowerCase().replace(/\s+/g, '').replace('×', 'x').replace(/,/g, '.');
  return ORING_BY_ID.get(s) || ORING_BY_ID.get('20x2') || ORING_LIST[0] || null;
}
function oringGrooveRule(d2) {
  const n = Number(d2);
  if (!(n > 0) || !ORING_GROOVE_RULES.length) {
    return { d2_mm: 2.0, t_stat_mm: 1.55, b_stat_mm: 2.7, t_dyn_mm: 1.65, b_dyn_mm: 2.8, t_axial_mm: 1.55, b_axial_mm: 2.8, r1_mm: 0.4 };
  }
  let best = ORING_GROOVE_RULES[0], bd = Infinity;
  for (const r of ORING_GROOVE_RULES) {
    const dd = Math.abs(r.d2_mm - n);
    if (dd < bd) { bd = dd; best = r; }
  }
  if (bd < 0.05) return best;
  const ratio = n / best.d2_mm;
  return {
    d2_mm: n,
    t_stat_mm: round(best.t_stat_mm * ratio, 2),
    b_stat_mm: round(best.b_stat_mm * ratio, 2),
    t_dyn_mm: round(best.t_dyn_mm * ratio, 2),
    b_dyn_mm: round(best.b_dyn_mm * ratio, 2),
    t_axial_mm: round(best.t_axial_mm * ratio, 2),
    b_axial_mm: round(best.b_axial_mm * ratio, 2),
    r1_mm: round(Math.max(0.2, best.r1_mm * ratio), 2),
  };
}
function oringMetrics(p = {}) {
  const isCustom = p.size === 'custom';
  const e = isCustom ? null : oringEntry(p.size);
  const rawD1 = Number(p.d1);
  const rawD2 = Number(p.d2);
  const d1 = rawD1 > 0 ? rawD1 : (e ? e.d1_mm : 20);
  const d2 = rawD2 > 0 ? rawD2 : (e ? e.d2_mm : 2);
  const Da = round(d1 + 2 * d2, 3);
  const Dm = round(d1 + d2, 3);
  const rule = oringGrooveRule(d2);
  return {
    id: isCustom || rawD1 > 0 || rawD2 > 0 ? `${round(d1, 2)}x${round(d2, 2)}` : (e ? e.id : '20x2'),
    d1,
    d2,
    Da,
    Dm,
    rule,
  };
}
function oringGrooveMetrics(p = {}) {
  const m = oringMetrics(p);
  const mode = p.mode === 'radial_shaft' || p.mode === 'radial_bore' ? p.mode : 'axial';
  const use = p.use === 'dynamic' ? 'dynamic' : 'static';
  const extra = Math.max(0.2, Number(p.extra) || 0.5);
  let b, t, ri, ro, dGrund;
  if (mode === 'axial') {
    b = m.rule.b_axial_mm;
    t = m.rule.t_axial_mm;
    const rm = m.Dm / 2;
    ri = Math.max(0.3, rm - b / 2);
    ro = rm + b / 2;
    dGrund = round(m.Dm, 2);
  } else if (mode === 'radial_shaft') {
    b = use === 'dynamic' ? m.rule.b_dyn_mm : m.rule.b_stat_mm;
    t = use === 'dynamic' ? m.rule.t_dyn_mm : m.rule.t_stat_mm;
    dGrund = Math.max(0.6, round(m.Da - 2 * t, 2));
    ri = dGrund / 2;
    ro = m.Da / 2 + extra;
  } else {
    b = use === 'dynamic' ? m.rule.b_dyn_mm : m.rule.b_stat_mm;
    t = use === 'dynamic' ? m.rule.t_dyn_mm : m.rule.t_stat_mm;
    dGrund = round(m.d1 + 2 * t, 2);
    ri = Math.max(0.2, m.d1 / 2 - extra);
    ro = dGrund / 2;
  }
  return {
    ...m,
    mode,
    use,
    b,
    t,
    r1: m.rule.r1_mm,
    ri: round(ri, 3),
    ro: round(ro, 3),
    dGrund,
    extra,
  };
}
const SHAFT_SEAL_DATA = (SEAL_DATA && SEAL_DATA.wellendichtringe) || {};
const SHAFT_SEAL_LIST = SHAFT_SEAL_DATA.groessen || [];
const SHAFT_SEAL_BY_ID = new Map(SHAFT_SEAL_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const SHAFT_SEAL_OPTIONS = SHAFT_SEAL_LIST.map((x) => [x.id, `${x.d_mm} × ${x.D_mm} × ${x.b_mm} mm`]);
function shaftSealEntry(size) {
  const s = String(size || '20x35x7').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x').replace(/,/g, '.');
  return SHAFT_SEAL_BY_ID.get(s) || SHAFT_SEAL_BY_ID.get('20x35x7') || SHAFT_SEAL_LIST[0] || null;
}
function shaftSealMetrics(p = {}) {
  const e = shaftSealEntry(p.size);
  const d = e ? e.d_mm : 20;
  const D = e ? e.D_mm : 35;
  const b = Number(p.b) > 0 ? Number(p.b) : (e ? e.b_mm : 7);
  const form = p.form === 'A' ? 'A' : 'AS';
  return { id: e ? e.id : '20x35x7', d, D, b, form };
}
// Druck- und Zugfedern (DIN EN 13906-1 / -2, EN 10270-1)
const SPRING_G = (SPRING_DATA && SPRING_DATA.schubmodul_mpa) || 81500;
const COMP_SPRING_LIST = (SPRING_DATA && SPRING_DATA.druckfedern && SPRING_DATA.druckfedern.groessen) || [];
const COMP_SPRING_BY_ID = new Map(COMP_SPRING_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const COMP_SPRING_OPTIONS = COMP_SPRING_LIST.map((x) => [x.id, `d ${String(x.d_mm).replace('.', ',')} × Dm ${x.Dm_mm} × L₀ ${x.L0_mm} (${x.n} Wdg.)`]);
function compSpringEntry(size) {
  const s = String(size || '2x16x43').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x').replace(/,/g, '.');
  return COMP_SPRING_BY_ID.get(s) || COMP_SPRING_BY_ID.get('2x16x43') || COMP_SPRING_LIST[0] || null;
}
function compSpringMetrics(p = {}) {
  const isCustom = p.size === 'custom';
  const e = isCustom ? null : compSpringEntry(p.size);
  const rawD = Number(p.d);
  const rawDm = Number(p.Dm);
  const rawN = Number(p.turns);
  const rawLen = Number(p.length);
  const rawPitch = Number(p.pitch);
  const d = rawD > 0 ? rawD : (e ? e.d_mm : 2);
  const Dm = Math.max(d * 1.6, rawDm > 0 ? rawDm : (e ? e.Dm_mm : 16));
  const n = Math.max(0.5, Math.min(60, rawN > 0 ? rawN : (e ? e.n : 8)));
  const ends = p.ends === 'open' ? 'open' : 'ground';
  const endAdd = ends === 'open' ? d : 1.5 * d;
  let L0, pitch;
  if (rawLen > endAdd + 0.1) {
    L0 = rawLen;
    pitch = round((L0 - endAdd) / n, 3);
  } else {
    pitch = rawPitch > 0 ? rawPitch : (e ? e.pitch_mm : Math.max(d * 2, 5));
    L0 = round(n * pitch + endAdd, 3);
  }
  const De = round(Dm + d, 3);
  const Di = round(Math.max(0.2, Dm - d), 3);
  const Lc = round((ends === 'open' ? n + 1 : n + 1.5) * d, 2);
  const rate = round((SPRING_G * Math.pow(d, 4)) / (8 * Math.pow(Dm, 3) * n), 3);
  return {
    id: e && !(rawD > 0 || rawDm > 0 || rawN > 0 || rawLen > 0 || rawPitch > 0) ? e.id : `${round(d, 2)}x${round(Dm, 1)}x${round(L0, 1)}`,
    d, Dm, De, Di, n, pitch, L0, Lc, ends, rate,
  };
}
const EXT_SPRING_LIST = (SPRING_DATA && SPRING_DATA.zugfedern && SPRING_DATA.zugfedern.groessen) || [];
const EXT_SPRING_BY_ID = new Map(EXT_SPRING_LIST.map((x) => [String(x.id).toLowerCase(), x]));
const EXT_SPRING_OPTIONS = EXT_SPRING_LIST.map((x) => [x.id, `d ${String(x.d_mm).replace('.', ',')} × Dm ${x.Dm_mm} (${x.n} Wdg.)`]);
function extSpringEntry(size) {
  const s = String(size || '1.5x15-24').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x').replace(/,/g, '.');
  return EXT_SPRING_BY_ID.get(s) || EXT_SPRING_BY_ID.get('1.5x15-24') || EXT_SPRING_LIST[0] || null;
}
function extSpringMetrics(p = {}) {
  const isCustom = p.size === 'custom';
  const e = isCustom ? null : extSpringEntry(p.size);
  const rawD = Number(p.d);
  const rawDm = Number(p.Dm);
  const rawN = Number(p.turns);
  const d = rawD > 0 ? rawD : (e ? e.d_mm : 1.5);
  const Dm = Math.max(d * 2.2, rawDm > 0 ? rawDm : (e ? e.Dm_mm : 15));
  const n = Math.max(2, Math.min(60, rawN > 0 ? rawN : (e ? e.n : 24)));
  const hookAngle = Number(p.hookAngle) === 90 ? 90 : 0;
  const De = round(Dm + d, 3);
  const Di = round(Math.max(0.2, Dm - d), 3);
  const coilPitch = round(d * 1.08, 4);
  const Lk = round(n * coilPitch + d, 2);
  const rEye = round(Math.max(d * 1.15, Dm * 0.45), 3);
  const L0 = round(n * coilPitch + 4 * rEye, 2);
  const Lges = round(L0 + 2 * d, 2);
  const rate = round((SPRING_G * Math.pow(d, 4)) / (8 * Math.pow(Dm, 3) * n), 3);
  return {
    id: e && !(rawD > 0 || rawDm > 0 || rawN > 0) ? e.id : `${round(d, 2)}x${round(Dm, 1)}-${Math.round(n)}`,
    d, Dm, De, Di, n, coilPitch, Lk, rEye, L0, Lges, hookAngle, rate,
  };
}
// Stellringe (DIN 705) & einfache Wellenkupplungen (BI-13)
const SHAFT_COLLAR_DIN705 = [
  { id: '3', d1: 3, d2: 7, b: 5, screw: 'M2', screwD: 2 },
  { id: '4', d1: 4, d2: 8, b: 5, screw: 'M2.5', screwD: 2.5 },
  { id: '5', d1: 5, d2: 10, b: 6, screw: 'M3', screwD: 3 },
  { id: '6', d1: 6, d2: 12, b: 8, screw: 'M4', screwD: 4 },
  { id: '8', d1: 8, d2: 16, b: 8, screw: 'M4', screwD: 4 },
  { id: '10', d1: 10, d2: 20, b: 10, screw: 'M5', screwD: 5 },
  { id: '12', d1: 12, d2: 22, b: 12, screw: 'M6', screwD: 6 },
  { id: '14', d1: 14, d2: 25, b: 12, screw: 'M6', screwD: 6 },
  { id: '15', d1: 15, d2: 25, b: 12, screw: 'M6', screwD: 6 },
  { id: '16', d1: 16, d2: 28, b: 12, screw: 'M6', screwD: 6 },
  { id: '18', d1: 18, d2: 32, b: 14, screw: 'M6', screwD: 6 },
  { id: '20', d1: 20, d2: 32, b: 14, screw: 'M6', screwD: 6 },
  { id: '25', d1: 25, d2: 40, b: 16, screw: 'M6', screwD: 6 },
  { id: '28', d1: 28, d2: 45, b: 16, screw: 'M8', screwD: 8 },
  { id: '30', d1: 30, d2: 45, b: 16, screw: 'M8', screwD: 8 },
  { id: '32', d1: 32, d2: 50, b: 16, screw: 'M8', screwD: 8 },
  { id: '35', d1: 35, d2: 56, b: 16, screw: 'M8', screwD: 8 },
  { id: '40', d1: 40, d2: 63, b: 18, screw: 'M10', screwD: 10 },
];
const SHAFT_COLLAR_BY_ID = new Map(SHAFT_COLLAR_DIN705.map((x) => [String(x.id), x]));
const SHAFT_COLLAR_OPTIONS = SHAFT_COLLAR_DIN705.map((x) => [x.id, `Ø ${x.d1} (Außen Ø ${x.d2} × ${x.b} mm)`]);
function shaftCollarEntry(size) {
  const s = String(size ?? '10').trim().replace(',', '.');
  if (SHAFT_COLLAR_BY_ID.has(s)) return SHAFT_COLLAR_BY_ID.get(s);
  const n = Number(s);
  if (isFinite(n)) {
    const hit = SHAFT_COLLAR_DIN705.find((x) => Math.abs(x.d1 - n) < 1e-6);
    if (hit) return hit;
  }
  return SHAFT_COLLAR_BY_ID.get('10') || SHAFT_COLLAR_DIN705[0] || null;
}
function shaftCollarForShaft(d) {
  const n = Math.max(1, Number(d) || 10);
  const hit = SHAFT_COLLAR_DIN705.find((x) => Math.abs(x.d1 - n) < 0.05);
  return hit ? { ...hit } : { id: 'custom', d: n };
}
function collarScrewForDia(d) {
  if (d <= 4) return { screw: 'M2.5', screwD: 2.5 };
  if (d <= 5) return { screw: 'M3', screwD: 3 };
  if (d <= 8) return { screw: 'M4', screwD: 4 };
  if (d <= 11) return { screw: 'M5', screwD: 5 };
  if (d <= 25) return { screw: 'M6', screwD: 6 };
  if (d <= 36) return { screw: 'M8', screwD: 8 };
  return { screw: 'M10', screwD: 10 };
}
function shaftCollarMetrics(p = {}) {
  const isCustom = p.size === 'custom';
  const e = isCustom ? null : shaftCollarEntry(p.size);
  const rawD = Number(p.d);
  const rawOuter = Number(p.D);
  const rawW = Number(p.width);
  const d = rawD > 0 ? rawD : (e ? e.d1 : 10);
  const D = Math.max(d + 2, rawOuter > 0 ? rawOuter : (e ? e.d2 : round(Math.max(d * 1.8, d + 6), 1)));
  const b = Math.max(2, rawW > 0 ? rawW : (e ? e.b : round(Math.max(5, d * 0.8), 1)));
  const hasClear = p.clear !== null && p.clear !== undefined && p.clear !== '';
  const clear = hasClear ? Math.max(0, Number(p.clear) || 0) : 0.05;
  const pf = printFitMm(p.printFit);
  const boreEff = round(d + clear + pf, 3);
  const style = p.style === 'clamp' ? 'clamp' : 'setscrew';
  const sc = e && !(rawD > 0) ? { screw: e.screw, screwD: e.screwD } : collarScrewForDia(d);
  const isNorm = !!(e && !(rawD > 0) && !(rawOuter > 0) && !(rawW > 0));
  return {
    id: isNorm ? `DIN 705 Ø${e.d1}` : `Ø${round(d, 2)}`,
    d, D, b, clear, pf, boreEff, style,
    screw: sc.screw, screwD: sc.screwD, isNorm,
  };
}
const SHAFT_COUPLING_SIZES = [
  { id: '5x5', d1: 5, d2: 5, D: 16, L: 25, screw: 'M3', screwD: 3 },
  { id: '6x6', d1: 6, d2: 6, D: 20, L: 30, screw: 'M3', screwD: 3 },
  { id: '6x8', d1: 6, d2: 8, D: 24, L: 35, screw: 'M4', screwD: 4 },
  { id: '8x8', d1: 8, d2: 8, D: 25, L: 35, screw: 'M4', screwD: 4 },
  { id: '8x10', d1: 8, d2: 10, D: 30, L: 45, screw: 'M4', screwD: 4 },
  { id: '10x10', d1: 10, d2: 10, D: 30, L: 45, screw: 'M4', screwD: 4 },
  { id: '12x12', d1: 12, d2: 12, D: 32, L: 45, screw: 'M5', screwD: 5 },
  { id: '15x15', d1: 15, d2: 15, D: 36, L: 50, screw: 'M5', screwD: 5 },
  { id: '16x16', d1: 16, d2: 16, D: 36, L: 50, screw: 'M5', screwD: 5 },
  { id: '20x20', d1: 20, d2: 20, D: 45, L: 65, screw: 'M6', screwD: 6 },
  { id: '25x25', d1: 25, d2: 25, D: 50, L: 75, screw: 'M6', screwD: 6 },
  { id: '30x30', d1: 30, d2: 30, D: 58, L: 83, screw: 'M8', screwD: 8 },
];
const SHAFT_COUPLING_BY_ID = new Map(SHAFT_COUPLING_SIZES.map((x) => [String(x.id).toLowerCase(), x]));
const SHAFT_COUPLING_OPTIONS = SHAFT_COUPLING_SIZES.map((x) => [x.id, `Ø ${x.d1} × Ø ${x.d2} (Außen Ø ${x.D} × ${x.L} mm)`]);
function shaftCouplingEntry(size) {
  const s = String(size || '10x10').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x').replace(/,/g, '.');
  return SHAFT_COUPLING_BY_ID.get(s) || SHAFT_COUPLING_BY_ID.get('10x10') || SHAFT_COUPLING_SIZES[0] || null;
}
function shaftCouplingMetrics(p = {}) {
  const isCustom = p.size === 'custom';
  const e = isCustom ? null : shaftCouplingEntry(p.size);
  const rawD1 = Number(p.d1);
  const rawD2 = Number(p.d2);
  const rawD = Number(p.D);
  const rawL = Number(p.length);
  const d1 = rawD1 > 0 ? rawD1 : (e ? e.d1 : 10);
  const d2 = rawD2 > 0 ? rawD2 : (e ? e.d2 : d1);
  const maxBore = Math.max(d1, d2);
  const D = Math.max(maxBore + 4, rawD > 0 ? rawD : (e ? e.D : round(Math.max(maxBore * 2.2, maxBore + 14), 1)));
  const L = Math.max(10, rawL > 0 ? rawL : (e ? e.L : round(Math.max(20, maxBore * 3.5), 1)));
  const hasClear = p.clear !== null && p.clear !== undefined && p.clear !== '';
  const clear = hasClear ? Math.max(0, Number(p.clear) || 0) : 0.05;
  const pf = printFitMm(p.printFit);
  const d1Eff = round(d1 + clear + pf, 3);
  const d2Eff = round(d2 + clear + pf, 3);
  const style = p.style === 'clamp' || p.style === 'flange' ? p.style : 'rigid';
  const sc = e && !(rawD1 > 0) && !(rawD2 > 0) ? { screw: e.screw, screwD: e.screwD } : collarScrewForDia(maxBore);
  const flangeD = style === 'flange' ? round(Math.max(D * 1.45, maxBore + 16), 1) : D;
  const outerD = style === 'flange' ? flangeD : D;
  return {
    id: e && !(rawD1 > 0) && !(rawD2 > 0) && !(rawD > 0) && !(rawL > 0) ? e.id : `${round(d1, 2)}x${round(d2, 2)}`,
    d1, d2, d1Eff, d2Eff, D, flangeD, outerD, L, clear, pf, style,
    screw: sc.screw, screwD: sc.screwD,
  };
}
function steppedShaftMetrics(p = {}) {
  const d = Math.max(1, Number(p.d ?? 10) || 10);
  const L = Math.max(2, Number(p.length ?? 100) || 100);
  const rawS1D = Math.max(0, Number(p.step1D ?? 0) || 0);
  const rawS1L = Math.max(0, Number(p.step1Len ?? 0) || 0);
  const hasStep1 = rawS1D >= 0.5 && rawS1L >= 0.5 && Math.abs(rawS1D - d) > 0.05;
  const rawS2D = Math.max(0, Number(p.step2D ?? 0) || 0);
  const rawS2L = Math.max(0, Number(p.step2Len ?? 0) || 0);
  const hasStep2 = rawS2D >= 0.5 && rawS2L >= 0.5 && Math.abs(rawS2D - d) > 0.05;
  const minMid = Math.max(1, Math.min(2, L * 0.1));
  const maxStepSum = Math.max(0, L - minMid);
  let l1 = hasStep1 ? rawS1L : 0;
  let l2 = hasStep2 ? rawS2L : 0;
  if (l1 + l2 > maxStepSum) {
    const sum = l1 + l2;
    const f = sum > 0 ? maxStepSum / sum : 0;
    l1 = hasStep1 ? round(l1 * f, 4) : 0;
    l2 = hasStep2 ? round(l2 * f, 4) : 0;
  }
  const midLen = Math.max(0.5, round(L - l1 - l2, 4));
  const hasEc = p.endChamfer !== null && p.endChamfer !== undefined && p.endChamfer !== '';
  const endChamfer = hasEc ? Math.max(0, Number(p.endChamfer) || 0) : 0.5;
  const hasSc = p.stepChamfer !== null && p.stepChamfer !== undefined && p.stepChamfer !== '';
  const stepChamfer = hasSc ? Math.max(0, Number(p.stepChamfer) || 0) : 0.3;
  const sections = [];
  let z = 0;
  if (hasStep1 && l1 >= 0.3) {
    sections.push({ role: 'step1', d: rawS1D, z0: z, z1: round(z + l1, 4), len: l1 });
    z = round(z + l1, 4);
  }
  const midZ1 = hasStep2 && l2 >= 0.3 ? round(L - l2, 4) : L;
  sections.push({ role: 'main', d, z0: z, z1: midZ1, len: round(midZ1 - z, 4) });
  if (hasStep2 && l2 >= 0.3) {
    sections.push({ role: 'step2', d: rawS2D, z0: midZ1, z1: L, len: round(L - midZ1, 4) });
  }
  const maxD = Math.max(...sections.map((s) => s.d));
  return {
    d, L,
    hasStep1: hasStep1 && l1 >= 0.3, d1: hasStep1 ? rawS1D : 0, l1: hasStep1 && l1 >= 0.3 ? l1 : 0,
    hasStep2: hasStep2 && l2 >= 0.3, d2: hasStep2 ? rawS2D : 0, l2: hasStep2 && l2 >= 0.3 ? l2 : 0,
    midLen, maxD, endChamfer, stepChamfer, sections,
  };
}
// 3D-Druck-Passungs-Vorgaben (DR-03): Spiel wird bei Löchern addiert, bei Bolzen abgezogen
const PRINT_FITS = [
  { id: 'loose', get label() { return T('printFit.loose.label'); }, mm: 0.4, get desc() { return T('printFit.loose.desc'); } },
  { id: 'slide', get label() { return T('printFit.slide.label'); }, mm: 0.2, get desc() { return T('printFit.slide.desc'); } },
  { id: 'snug', get label() { return T('printFit.snug.label'); }, mm: 0.1, get desc() { return T('printFit.snug.desc'); } },
  { id: 'press', get label() { return T('printFit.press.label'); }, mm: 0, get desc() { return T('printFit.press.desc'); } },
];
const PRINT_FIT_MAP = Object.fromEntries(PRINT_FITS.map((f) => [f.id, f]));
function printFitInfo(id) { return PRINT_FIT_MAP[String(id || '')] || null; }
function printFitMm(id) { const f = printFitInfo(id); return f ? f.mm : 0; }
const printFitProjOptions = () => [
  ['', T('printFit.projOff')],
  ...PRINT_FITS.map((f) => [f.id, `${f.label} (${f.mm === 0 ? '0' : fmtFixed(f.mm, 1)} mm)`]),
];
const printFitHoleOptions = () => [
  ['', T('printFit.noneExact')],
  ...PRINT_FITS.map((f) => [f.id, f.mm > 0 ? `${f.label} (+${fmtFixed(f.mm, 1)} mm)` : `${f.label} (0 mm)`]),
];
const printFitBoltOptions = () => [
  ['', T('printFit.noneExact')],
  ...PRINT_FITS.map((f) => [f.id, f.mm > 0 ? `${f.label} (−${fmtFixed(f.mm, 1)} mm)` : `${f.label} (0 mm)`]),
];
const PRINT_FIT_PROJ_OPTIONS = printFitProjOptions();
const PRINT_FIT_HOLE_OPTIONS = printFitHoleOptions();
const PRINT_FIT_BOLT_OPTIONS = printFitBoltOptions();
function gearRackMetrics(p) {
  const z = Math.max(2, Math.min(200, Math.round(Number(p && p.teeth) || 10)));
  const m = Math.max(0.1, Number(p && p.module) || 1.5);
  const h = Math.max(0.2, Number(p && p.h) || 6);
  const baseH = Math.max(0.5, Number(p && p.baseH) || 6);
  const pitch = Math.PI * m;
  return { z, m, h, baseH, pitch, length: pitch * z, ha: m, hf: 1.25 * m, toothH: 2.25 * m, totalH: baseH + 2.25 * m };
}
function internalGearMetrics(p) {
  const z = Math.max(12, Math.min(200, Math.round(Number(p && p.teeth) || 40)));
  const m = Math.max(0.1, Number(p && p.module) || 1.5);
  const h = Math.max(0.2, Number(p && p.h) || 6);
  const wall = Math.max(0.5, Number(p && p.wall) || 5);
  const dp = m * z, da = Math.max(1, dp - 2 * m), df = dp + 2.5 * m, outerD = df + 2 * wall;
  return { z, m, h, wall, dp, da, df, outerD };
}
function wormMetrics(p) {
  const m = Math.max(0.1, Number(p && p.module) || 1.5);
  const starts = Math.max(1, Math.min(4, Math.round(Number(p && p.starts) || 1)));
  const d1 = Math.max(Number(p && p.d) || 16, 2.5 * m + 2.4);
  const length = Math.max(1, Number(p && p.length) || 30);
  const bore = Math.max(0, Number(p && p.bore) || 0);
  const px = Math.PI * m, pz = starts * px, da1 = d1 + 2 * m, df1 = Math.max(1.2, d1 - 2.5 * m);
  const leadAngleDeg = (Math.atan((m * starts) / d1) * 180) / Math.PI;
  return { m, starts, d1, length, bore, px, pz, da1, df1, leadAngleDeg, dir: p && p.dir === 'left' ? 'left' : 'right' };
}
function wormWheelMetrics(p) {
  const z2 = Math.max(10, Math.min(120, Math.round(Number(p && p.teeth) || 24)));
  const m = Math.max(0.1, Number(p && p.module) || 1.5);
  const h = Math.max(0.2, Number(p && p.h) || 10);
  const d1 = Math.max(Number(p && p.wormD) || 16, 2.5 * m + 2.4);
  const starts = Math.max(1, Math.min(4, Math.round(Number(p && p.wormStarts) || 1)));
  const bore = Math.max(0, Number(p && p.bore) || 0);
  const d2 = m * z2, da2 = d2 + 2 * m, df2 = Math.max(1, d2 - 2.5 * m);
  const centerDist = (d1 + d2) / 2, ratio = z2 / starts;
  const leadAngleDeg = (Math.atan((m * starts) / d1) * 180) / Math.PI;
  return { z2, m, h, d1, starts, bore, d2, da2, df2, centerDist, ratio, leadAngleDeg, dir: p && p.dir === 'left' ? 'left' : 'right' };
}
// Batteriefächer für Rundzellen (AA, AAA, 18650; BI-19)
const BATTERY_CELLS = [
  { id: 'AA', label: 'AA (Mignon / LR6, Ø 14,5 × 50,5 mm)', d: 14.5, L: 50.5, clear: 0.8, contact: 3.0, wireHoleD: 2.5, source: 'IEC 60086-2 (LR6)' },
  { id: 'AAA', label: 'AAA (Micro / LR03, Ø 10,5 × 44,5 mm)', d: 10.5, L: 44.5, clear: 0.7, contact: 2.5, wireHoleD: 2.0, source: 'IEC 60086-2 (LR03)' },
  { id: '18650', label: '18650 (Li-Ion, Ø 18,5 × 65,5 mm)', d: 18.5, L: 65.5, clear: 0.8, contact: 3.5, wireHoleD: 2.8, source: 'IEC 61960 (18650)' },
  { id: '18650p', label: '18650 geschützt (Ø 18,6 × 70 mm)', d: 18.6, L: 70.0, clear: 0.8, contact: 3.5, wireHoleD: 2.8, source: '18650 geschützt (Richtwert)' },
];
const BATTERY_CELL_BY_ID = new Map(BATTERY_CELLS.map((x) => [x.id.toLowerCase(), x]));
const BATTERY_CELL_OPTIONS = BATTERY_CELLS.map((x) => [x.id, x.label]);
function batteryCellEntry(id) {
  const s = String(id || 'AA').trim().toLowerCase();
  return BATTERY_CELL_BY_ID.get(s) || BATTERY_CELL_BY_ID.get('aa') || BATTERY_CELLS[0];
}
function batteryHolderMetrics(p = {}) {
  const e = batteryCellEntry(p.cell);
  const count = Math.max(1, Math.min(8, Math.round(Number(p.count ?? 2) || 2)));
  const wall = Math.max(0.8, Number(p.wall ?? 2) || 2);
  const floor = Math.max(0.8, Number(p.floor ?? 2) || 2);
  const hasDiv = p.divider != null && p.divider !== '' && isFinite(Number(p.divider));
  const divider = hasDiv ? Math.max(0, Number(p.divider)) : 1.2;
  const hasClear = p.clear != null && p.clear !== '' && isFinite(Number(p.clear));
  const clear = hasClear ? Math.max(0, Number(p.clear)) : e.clear;
  const hasContact = p.contactSpace != null && p.contactSpace !== '' && isFinite(Number(p.contactSpace));
  const contactSpace = hasContact ? Math.max(0, Number(p.contactSpace)) : e.contact;
  const pf = printFitMm(p.printFit);
  const slotW = round(e.d + clear + pf, 3);
  const innerW = round(count * slotW + Math.max(0, count - 1) * divider, 3);
  const innerL = round(e.L + contactSpace + pf, 3);
  const innerH = round(e.d + clear * 0.5 + pf * 0.5, 3);
  const divH = count > 1 && divider >= 0.4 ? round(Math.min(innerH - 1.0, e.d * 0.65), 3) : 0;
  const outerW = round(innerW + 2 * wall, 3);
  const outerL = round(innerL + 2 * wall, 3);
  const outerH = round(floor + innerH, 3);
  const wireHoles = p.wireHoles !== 'nein' && p.wireHoles !== false;
  const mountHoles = p.mountHoles === 'ja' || p.mountHoles === true;
  return {
    id: e.id, cellLabel: e.label, source: e.source,
    cellD: e.d, cellL: e.L, count, wall, floor, divider,
    clear, contactSpace, pf, slotW, innerW, innerL, innerH, divH,
    outerW, outerL, outerH, wireHoles, wireHoleD: e.wireHoleD, mountHoles,
  };
}
// Zahnriemenscheiben (GT2 & HTD) und Rollenkettenräder nach Teilung (DIN 8187 / ISO 606, BI-12)
const TIMING_PULLEY_PROFILES = [
  { id: 'GT2', label: 'GT2 (2 mm Teilung)', family: 'GT2', pitch: 2.0, pld: 0.254, grooveDepth: 0.75, grooveFrac: 0.56, defBeltW: 6, flangeAdd: 3.2, flangeT: 1.2 },
  { id: 'GT2-3', label: 'GT2-3 (3 mm Teilung)', family: 'GT2', pitch: 3.0, pld: 0.381, grooveDepth: 1.14, grooveFrac: 0.56, defBeltW: 9, flangeAdd: 4.5, flangeT: 1.5 },
  { id: 'GT2-5', label: 'GT2-5 (5 mm Teilung)', family: 'GT2', pitch: 5.0, pld: 0.5715, grooveDepth: 1.93, grooveFrac: 0.56, defBeltW: 15, flangeAdd: 7.0, flangeT: 2.0 },
  { id: 'HTD3M', label: 'HTD 3M (3 mm Teilung)', family: 'HTD', pitch: 3.0, pld: 0.381, grooveDepth: 1.22, grooveFrac: 0.60, defBeltW: 9, flangeAdd: 4.5, flangeT: 1.5 },
  { id: 'HTD5M', label: 'HTD 5M (5 mm Teilung)', family: 'HTD', pitch: 5.0, pld: 0.5715, grooveDepth: 2.06, grooveFrac: 0.60, defBeltW: 15, flangeAdd: 7.5, flangeT: 2.0 },
  { id: 'HTD8M', label: 'HTD 8M (8 mm Teilung)', family: 'HTD', pitch: 8.0, pld: 0.686, grooveDepth: 3.48, grooveFrac: 0.60, defBeltW: 20, flangeAdd: 11.0, flangeT: 2.5 },
];
const TIMING_PULLEY_BY_ID = new Map(TIMING_PULLEY_PROFILES.map((x) => [x.id.toLowerCase(), x]));
const TIMING_PULLEY_OPTIONS = TIMING_PULLEY_PROFILES.map((x) => [x.id, x.label]);
function timingPulleyProfile(id) {
  const s = String(id || 'GT2').trim().toLowerCase();
  return TIMING_PULLEY_BY_ID.get(s) || TIMING_PULLEY_PROFILES[0];
}
function timingPulleyMetrics(p = {}) {
  const prof = timingPulleyProfile(p.profile);
  const z = Math.max(10, Math.min(120, Math.round(Number(p.teeth ?? 20) || 20)));
  const pitch = prof.pitch;
  const pld = prof.pld;
  const ht = prof.grooveDepth;
  const dp = (z * pitch) / Math.PI;
  const da = Math.max(2, dp - 2 * pld);
  const df = Math.max(1.2, da - 2 * ht);
  const rawBeltW = Number(p.beltW);
  const beltW = rawBeltW > 0 ? rawBeltW : prof.defBeltW;
  const flanges = p.flanges === 'none' || p.flanges === 'bottom' ? p.flanges : 'both';
  const trackW = flanges === 'none' ? round(beltW, 3) : round(beltW + Math.max(0.6, 0.2 * pitch), 3);
  const flangeT = flanges === 'none' ? 0 : prof.flangeT;
  const flangeD = flanges === 'none' ? da : round(da + prof.flangeAdd, 2);
  const bore = Math.max(0, Number(p.bore ?? 5) || 0);
  const rawHubH = p.hubH === null || p.hubH === undefined || p.hubH === '' ? 5 : Number(p.hubH);
  const hubH = Math.max(0, isFinite(rawHubH) ? rawHubH : 5);
  const rawHubD = Number(p.hubD);
  const maxHubD = flanges === 'none' ? Math.max(bore + 2, df - 0.2) : flangeD;
  const defHubD = round(Math.min(maxHubD, Math.max(bore + 4, da * 0.85)), 1);
  const hubD = hubH > 0 ? Math.min(maxHubD, Math.max(bore + 1.5, rawHubD > 0 ? rawHubD : defHubD)) : 0;
  const nFlanges = flanges === 'both' ? 2 : flanges === 'bottom' ? 1 : 0;
  const totalH = round(hubH + nFlanges * flangeT + trackW, 3);
  const outerD = Math.max(da, flangeD, hubD);
  return {
    profile: prof.id, family: prof.family, z, pitch, pld, ht, grooveFrac: prof.grooveFrac,
    dp, da, df, beltW, trackW, flanges, flangeT, flangeD, bore, hubH, hubD, totalH, outerD,
  };
}
const SPROCKET_CHAINS = [
  { id: '04B', short: '04B (6 mm)', label: '04B · 6 mm (DIN 8187)', pitch: 6.0, rollerD: 4.0, bf1: 2.6 },
  { id: '05B', short: '05B (8 mm)', label: '05B · 8 mm (DIN 8187)', pitch: 8.0, rollerD: 5.0, bf1: 2.8 },
  { id: '06B', short: '06B (3/8")', label: '06B · 3/8" (9,525 mm)', pitch: 9.525, rollerD: 6.35, bf1: 5.3 },
  { id: '08B', short: '08B (1/2")', label: '08B · 1/2" (12,7 mm · Standard)', pitch: 12.7, rollerD: 8.51, bf1: 7.2 },
  { id: '08A', short: '08A (1/2")', label: '08A / ANSI 40 · 1/2" (12,7 mm)', pitch: 12.7, rollerD: 7.95, bf1: 7.2 },
  { id: 'bike', short: 'Fahrrad 1/2"', label: 'Fahrradkette · 1/2" × 3/32"', pitch: 12.7, rollerD: 7.75, bf1: 2.1 },
  { id: '10B', short: '10B (5/8")', label: '10B · 5/8" (15,875 mm)', pitch: 15.875, rollerD: 10.16, bf1: 9.1 },
  { id: '12B', short: '12B (3/4")', label: '12B · 3/4" (19,05 mm)', pitch: 19.05, rollerD: 12.07, bf1: 11.1 },
  { id: '16B', short: '16B (1")', label: '16B · 1" (25,4 mm)', pitch: 25.4, rollerD: 15.88, bf1: 16.2 },
];
const SPROCKET_CHAIN_BY_ID = new Map(SPROCKET_CHAINS.map((x) => [x.id.toLowerCase(), x]));
const SPROCKET_CHAIN_OPTIONS = [...SPROCKET_CHAINS.map((x) => [x.id, x.label]), ['custom', 'Eigene Teilung']];
function sprocketChainEntry(id) {
  const s = String(id || '08B').trim().toLowerCase();
  return SPROCKET_CHAIN_BY_ID.get(s) || SPROCKET_CHAIN_BY_ID.get('08b') || SPROCKET_CHAINS[3];
}
function sprocketMetrics(p = {}) {
  const isCustom = p.chain === 'custom';
  const e = isCustom ? null : sprocketChainEntry(p.chain);
  const z = Math.max(8, Math.min(120, Math.round(Number(p.teeth ?? 15) || 15)));
  const rawPitch = Number(p.pitch);
  const pitch = rawPitch > 0 ? Math.max(2, rawPitch) : (e ? e.pitch : 12.7);
  const rawRoller = Number(p.rollerD);
  const d1 = Math.min(pitch * 0.72, Math.max(pitch * 0.3, rawRoller > 0 ? rawRoller : (e ? e.rollerD : round(pitch * 0.625, 2))));
  const rawThick = Number(p.thickness);
  const thickness = Math.max(0.8, rawThick > 0 ? rawThick : (e ? e.bf1 : round(pitch * 0.55, 1)));
  const dp = pitch / Math.sin(Math.PI / z);
  const ri = 0.505 * d1;
  const df = Math.max(2, dp - 2 * ri);
  const da = Math.max(dp + 0.25 * pitch, dp + pitch * (1.125 - 0.8 / z) - d1);
  const bore = Math.max(0, Number(p.bore ?? 10) || 0);
  const rawHubH = p.hubH === null || p.hubH === undefined || p.hubH === '' ? 0 : Number(p.hubH);
  const hubH = Math.max(0, isFinite(rawHubH) ? rawHubH : 0);
  const rawHubD = Number(p.hubD);
  const maxHubD = Math.max(bore + 2, df - 0.6);
  const defHubD = round(Math.min(maxHubD, Math.max(bore + 8, df * 0.62)), 1);
  const hubD = hubH > 0 ? Math.min(maxHubD, Math.max(bore + 2, rawHubD > 0 ? rawHubD : defHubD)) : 0;
  const totalH = round(thickness + hubH, 3);
  const chainLabelShort = e && !(rawPitch > 0) ? e.short : (`p ${fmt(pitch, 2)} mm`);
  return {
    chain: isCustom ? 'custom' : (e ? e.id : '08B'), chainLabelShort,
    z, pitch, d1, ri, dp, da, df, thickness, bore, hubH, hubD, totalH,
  };
}
// Griffe, Drehknöpfe, Rändelschrauben & Gerätefüße (BI-14)
function pullHandleMetrics(p = {}) {
  const style = p.style === 'bridge' || p.style === 'tHandle' ? p.style : 'bow';
  const gripD = Math.max(4, Math.min(40, Number(p.gripD ?? 12) || 12));
  const holeDist = Math.max(Math.max(20, gripD * 2.6), Number(p.holeDist ?? 96) || 96);
  const height = Math.max(Math.max(16, gripD * 2.1), Number(p.height ?? 35) || 35);
  const rawHoleD = p.holeD === 0 || p.holeD === '0' ? 0 : Number(p.holeD ?? 4.2);
  const holeD = isFinite(rawHoleD) && rawHoleD > 0 ? Math.min(gripD - 1.2, rawHoleD) : 0;
  const rawHoleDepth = p.holeDepth === 0 || p.holeDepth === '0' ? 0 : Number(p.holeDepth ?? 12);
  const holeDepth = isFinite(rawHoleDepth) && rawHoleDepth > 0 ? Math.min(height - 3, rawHoleDepth) : 0;
  const flangeL = style === 'bridge' ? round(Math.max(gripD * 1.6, holeD + 6), 3) : 0;
  const flangeH = style === 'bridge' ? round(Math.max(3, Math.min(6, height * 0.2)), 3) : 0;
  const outerW = style === 'bridge' ? round(holeDist + flangeL, 3) : round(holeDist + gripD, 3);
  const outerD = round(gripD, 3);
  const outerH = round(height, 3);
  return { style, holeDist, height, gripD, holeD, holeDepth, flangeL, flangeH, outerW, outerD, outerH };
}
function rotaryKnobMetrics(p = {}) {
  const style = p.style === 'smooth' || p.style === 'pointer' ? p.style : 'fluted';
  const D = Math.max(8, Math.min(120, Number(p.D ?? 24) || 24));
  const h = Math.max(6, Math.min(80, Number(p.h ?? 16) || 16));
  const rawShaftD = p.shaftD === 0 || p.shaftD === '0' ? 0 : Number(p.shaftD ?? 6);
  const shaftD = isFinite(rawShaftD) && rawShaftD > 0 ? Math.min(D - 3, rawShaftD) : 0;
  const shaftType = p.shaftType === 'round' || p.shaftType === 'setscrew' ? p.shaftType : 'dShaft';
  const hasDepth = p.boreDepth != null && p.boreDepth !== '' && isFinite(Number(p.boreDepth)) && Number(p.boreDepth) > 0;
  const boreDepth = hasDepth ? Math.min(h - 1.5, Number(p.boreDepth)) : round(h * 0.72, 2);
  const flutes = Math.max(4, Math.min(24, Math.round(Number(p.flutes ?? 12) || 12)));
  const pf = printFitMm(p.printFit);
  const shaftEff = shaftD > 0 ? round(shaftD + pf, 3) : 0;
  const noseLen = style === 'pointer' ? round(D * 0.22, 3) : 0;
  const outerR = round(D / 2, 3);
  const outerXPos = round(outerR + noseLen, 3);
  return { style, D, h, shaftD, shaftEff, shaftType, boreDepth, flutes, pf, noseLen, outerR, outerXPos };
}
const THUMBSCREW_DIN = [
  { id: 'M3', d: 3, d1: 12, kHigh: 7.5, k1: 2.5, d2: 6, kLow: 2.5 },
  { id: 'M4', d: 4, d1: 16, kHigh: 9.5, k1: 3.5, d2: 8, kLow: 3.5 },
  { id: 'M5', d: 5, d1: 20, kHigh: 11.5, k1: 4.0, d2: 10, kLow: 4.0 },
  { id: 'M6', d: 6, d1: 24, kHigh: 15.0, k1: 5.0, d2: 12, kLow: 5.0 },
  { id: 'M8', d: 8, d1: 30, kHigh: 18.0, k1: 6.0, d2: 16, kLow: 6.0 },
  { id: 'M10', d: 10, d1: 36, kHigh: 23.0, k1: 8.0, d2: 20, kLow: 8.0 },
];
const THUMBSCREW_BY_ID = new Map(THUMBSCREW_DIN.map((x) => [x.id, x]));
const THUMBSCREW_SIZES = THUMBSCREW_DIN.map((x) => x.id);
function thumbScrewEntry(size) {
  const s = String(size || 'M4').trim().toUpperCase();
  return THUMBSCREW_BY_ID.get(s) || THUMBSCREW_BY_ID.get('M4') || THUMBSCREW_DIN[1];
}
function thumbScrewMetrics(p = {}) {
  const e = thumbScrewEntry(p.size);
  const form = p.form === 'low' ? 'low' : 'high';
  const knurl = p.knurl === 'diamond' || p.knurl === 'none' ? p.knurl : 'straight';
  const length = Math.max(3, Number(p.length ?? 12) || 12);
  const rawHD = Number(p.headD);
  const headD = p.headD != null && p.headD !== '' && isFinite(rawHD) && rawHD > e.d + 2 ? rawHD : e.d1;
  const rawHH = Number(p.headH);
  const defHH = form === 'low' ? e.kLow : e.kHigh;
  const headH = p.headH != null && p.headH !== '' && isFinite(rawHH) && rawHH > 1.5 ? rawHH : defHH;
  const shoulderD = form === 'high' ? Math.min(headD - 2, e.d2) : 0;
  const knurlH = form === 'high' ? Math.min(headH - 1.5, e.k1 * (headH / e.kHigh)) : headH;
  const shoulderH = form === 'high' ? round(Math.max(0, headH - knurlH), 3) : 0;
  const norm = form === 'low' ? 'DIN 653' : 'DIN 464';
  return { size: e.id, d: e.d, form, norm, length, headD, headH, shoulderD, shoulderH, knurlH, knurl };
}
function deviceFootMetrics(p = {}) {
  const style = p.style === 'cylindrical' || p.style === 'bumper' ? p.style : 'conical';
  const D = Math.max(6, Math.min(120, Number(p.D ?? 20) || 20));
  const h = Math.max(3, Math.min(80, Number(p.h ?? 10) || 10));
  const topD = style === 'conical' ? round(D * 0.8, 2) : D;
  const screw = p.screw === 'M3' || p.screw === 'M5' || p.screw === 'none' ? p.screw : 'M4';
  const pf = printFitMm(p.printFit);
  const holeFb = { M3: 3.4, M4: 4.5, M5: 5.5 };
  const cbFb = { M3: 6.2, M4: 7.8, M5: 9.4 };
  let holeD = 0, cbD = 0, cbH = 0;
  if (screw !== 'none') {
    const se = typeof screwEntry === 'function' ? screwEntry(screw) : null;
    const baseHole = (se && se.durchgang_mittel_mm) || holeFb[screw] || 4.5;
    const baseHead = (se && se.zylinderkopf && se.zylinderkopf.kopf_d_mm ? se.zylinderkopf.kopf_d_mm + 0.6 : cbFb[screw]) || 7.8;
    const maxHole = Math.max(1.5, Math.min(D, topD) - 3);
    holeD = round(Math.min(maxHole, baseHole + pf), 3);
    const maxCb = Math.min(D, topD) - 1.6;
    if (h >= 4.5 && maxCb >= holeD + 1.2) {
      cbD = round(Math.min(maxCb, baseHead + pf), 3);
      cbH = round(Math.min(h - 2.0, Math.max(2.2, h * 0.48)), 3);
    }
  }
  return { style, D, topD, h, screw, holeD, cbD, cbH, pf };
}
const LIB = [
  { lib: 'screwHole', label: 'Schraubenloch', role: 'hole', icon: 'bolt', desc: 'Durchgangsloch mit Senkung für Schrauben', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: THREAD_GROUPED_OPTIONS, def: 'M3' },
    { k: 'head', label: 'Kopf', type: 'select', options: [['countersunk', 'Senkkopf'], ['counterbore', 'Zylinderkopf'], ['none', 'ohne Senkung']], def: 'countersunk' },
    { k: 'fit', label: 'Loch', type: 'select', options: [['medium', 'Mittel (Standard)'], ['fine', 'Eng (genau)'], ['coarse', 'Weit (mit Spiel)'], ['tap', 'Kernloch für Gewinde']], def: 'medium' },
    { k: 'length', label: 'Tiefe', type: 'num', def: 10 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'nutTrap', label: 'Mutternfalle', role: 'hole', icon: 'hex', desc: 'Sechskant-Tasche für eine Mutter, mit Schraubenloch', params: [
    { k: 'size', label: 'Mutter', type: 'select', options: SIZES, def: 'M3' },
    { k: 'depth', label: 'Taschentiefe', type: 'num', def: null, auto: true },
    { k: 'length', label: 'Lochtiefe', type: 'num', def: 12 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'threadHole', label: 'Gewindeloch (gedruckt)', role: 'hole', icon: 'target', desc: 'Echtes Innengewinde zum Drucken, mit etwas Spiel', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], def: 'M6' },
    { k: 'length', label: 'Tiefe', type: 'num', def: 10 },
    { k: 'pitch', label: 'Steigung', type: 'num', def: null, auto: true },
    { k: 'clear', label: 'Spiel', type: 'num', def: 0.3 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'threadRod', label: 'Gewindebolzen', role: 'solid', icon: 'target', desc: 'Außengewinde (ISO metrisch) – z. B. für gedruckte Schraubdeckel', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], def: 'M6' },
    { k: 'length', label: 'Länge', type: 'num', def: 12 },
    { k: 'pitch', label: 'Steigung', type: 'num', def: null, auto: true },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitBoltOptions, def: '' },
  ] },
  { lib: 'insert', label: 'Gewindeeinsatz', role: 'hole', icon: 'target', desc: 'Loch für einen Einschmelz-Gewindeeinsatz', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'], def: 'M3' },
    { k: 'depth', label: 'Tiefe', type: 'num', def: null, auto: true },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'blindHole', label: 'Sackloch', role: 'hole', icon: 'holeWizard', desc: 'Bohrung mit fester Tiefe und 118°-Bohrspitze (Standard-Spiralbohrer)', params: [
    { k: 'd', label: 'Durchmesser', type: 'num', def: 5 },
    { k: 'depth', label: 'Tiefe (Zylinder)', type: 'num', def: 10 },
    { k: 'tipAngle', label: 'Bohrspitze', type: 'select', options: [['118', '118° (Spiralbohrer)'], ['140', '140° (Hartmetall)'], ['180', 'Flacher Boden']], def: 118 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'fitHole', label: 'Passbohrung H7', role: 'hole', icon: 'target', desc: 'Präzisionsbohrung auf genaues Nennmaß mit Toleranz-Hinweis nach ISO 286 H7', params: [
    { k: 'd', label: 'Nenn-Ø', type: 'num', def: 6 },
    { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'centerHole', label: 'Zentrierbohrung', role: 'hole', icon: 'holeWizard', desc: 'Zentrierbohrung nach DIN 332 Form A (60°-Kegel + Führungsbohrung)', params: [
    { k: 'size', label: 'Größe (DIN 332 A)', type: 'select', options: CENTER_SIZES, def: 'A2.5' },
  ] },
  { lib: 'stdScrew', label: 'Schraube (Norm)', role: 'solid', icon: 'bolt', mat: 'V2A Edelstahl', std: true, desc: 'Normschraube M1.6–M24: Zylinderkopf (ISO 4762), Sechskantschraube (ISO 4017) oder Senkkopf (ISO 10642) – Gewinde nur angedeutet', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
    { k: 'head', label: 'Kopf', type: 'select', options: [['zyl', 'Zylinderkopf (ISO 4762)'], ['hex', 'Sechskantkopf (ISO 4017)'], ['senk', 'Senkkopf (ISO 10642, ab M3)']], def: 'zyl' },
    { k: 'length', label: 'Länge', type: 'num', def: 10 },
  ] },
  { lib: 'stdNut', label: 'Mutter (Norm)', role: 'solid', icon: 'hex', mat: 'V2A Edelstahl', std: true, desc: 'Sechskantmutter ISO 4032 (M1.6–M24)', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
  ] },
  { lib: 'stdWasher', label: 'Scheibe (Norm)', role: 'solid', icon: 'circle', mat: 'V2A Edelstahl', std: true, desc: 'Unterlegscheibe ISO 7089 (M1.6–M24)', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
  ] },
  { lib: 'stdPin', label: 'Zylinderstift (ISO 2338)', role: 'solid', icon: 'pin', mat: 'V2A Edelstahl', std: true, desc: 'Zylinderstift nach ISO 2338 mit 15°-Endfasen (m6 oder h8)', params: [
    { k: 'size', label: 'Durchmesser', type: 'select', options: PIN_OPTIONS, def: '6' },
    { k: 'length', label: 'Länge', type: 'num', def: 20 },
    { k: 'tol', label: 'Toleranz', type: 'select', options: [['m6', 'm6 (Form A, Standard)'], ['h8', 'h8 (Form B)']], def: 'm6' },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitBoltOptions, def: '' },
  ] },
  { lib: 'stdKey', label: 'Passfeder (DIN 6885 A)', role: 'solid', icon: 'key', mat: 'Baustahl', std: true, desc: 'Rundstirnige Passfeder nach DIN 6885 Form A', params: [
    { k: 'size', label: 'Querschnitt (b × h)', type: 'select', options: KEY_OPTIONS, def: '6x6' },
    { k: 'length', label: 'Länge (l)', type: 'num', def: 20 },
  ] },
  { lib: 'stdKeyway', label: 'Passfedernut (DIN 6885)', role: 'hole', icon: 'keyway', std: true, desc: 'Passende Wellen- (t₁) oder Nabennut (t₂) nach DIN 6885 Form A', params: [
    { k: 'size', label: 'Passfeder (b × h)', type: 'select', options: KEY_OPTIONS, def: '6x6' },
    { k: 'kind', label: 'Nut-Art', type: 'select', options: [['shaft', 'Wellennut (Tiefe t₁, rundstirnig)'], ['hub', 'Nabennut (Tiefe t₂, gerade)']], def: 'shaft' },
    { k: 'length', label: 'Länge (l)', type: 'num', def: 20 },
    { k: 'extra', label: 'Überstand oben', type: 'num', def: 0.5 },
  ] },
  { lib: 'splineShaft', label: 'Keilwelle (DIN ISO 14)', role: 'solid', icon: 'splineShaft', std: true, mat: 'Baustahl', desc: 'Keilwellen-Profil nach DIN ISO 14 mit geraden parallelen Flanken', params: [
    { k: 'profile', label: 'Profil (DIN ISO 14)', type: 'select', options: [...SPLINE_OPTIONS, ['custom', 'Eigene Maße']], def: '6x16x20' },
    { k: 'length', label: 'Länge', type: 'num', def: 40 },
    { k: 'teeth', label: 'Keile (N)', type: 'num', def: null, auto: true, int: true, unit: '' },
    { k: 'd', label: 'Innen-Ø (d)', type: 'num', def: null, auto: true },
    { k: 'D', label: 'Außen-Ø (D)', type: 'num', def: null, auto: true },
    { k: 'b', label: 'Keilbreite (b)', type: 'num', def: null, auto: true },
    { k: 'bore', label: 'Mittenbohrung Ø', type: 'num', def: 0 },
  ] },
  { lib: 'stdBearing', label: 'Kugellager (Norm)', role: 'solid', icon: 'bearing', mat: 'V2A Edelstahl', std: true, desc: 'Rillenkugellager nach DIN 625-1 / ISO 15 (608, 6000er und 6200er Reihe)', params: [
    { k: 'size', label: 'Lager-Typ', type: 'select', options: BEARING_GROUPED_OPTIONS, def: '608' },
    { k: 'seal', label: 'Ausführung', type: 'select', options: [['2rs', 'Geschlossen (2RS / ZZ)'], ['open', 'Offen (mit Kugeln)']], def: '2rs' },
  ] },
  { lib: 'stdSleeve', label: 'Gleitlager (Norm)', role: 'solid', icon: 'sleeve', mat: 'Messing', std: true, desc: 'Gleitlagerbuchse nach ISO 3547 / DIN 1850 (zylindrisch oder mit Bund)', params: [
    { k: 'size', label: 'Größe (d × D)', type: 'select', options: SLEEVE_OPTIONS, def: '8x10' },
    { k: 'length', label: 'Länge (B)', type: 'num', def: 10 },
    { k: 'flange', label: 'Bauform', type: 'select', options: [['cyl', 'Zylindrisch (Form C)'], ['flange', 'Mit Bund (Form F)']], def: 'cyl' },
  ] },
  { lib: 'stdORing', label: 'O-Ring (Norm)', role: 'solid', icon: 'oring', mat: 'TPU 95A', std: true, desc: 'O-Ring nach DIN 3771 / ISO 3601 mit passenden Nut-Maßen', params: [
    { k: 'size', label: 'Größe (d₁ × d₂)', type: 'select', options: [...ORING_OPTIONS, ['custom', 'Eigene Maße']], def: '20x2' },
    { k: 'd1', label: 'Innen-Ø (d₁)', type: 'num', def: null, auto: true },
    { k: 'd2', label: 'Schnurstärke (d₂)', type: 'num', def: null, auto: true },
  ] },
  { lib: 'stdORingGroove', label: 'O-Ring-Nut (Norm)', role: 'hole', icon: 'oringGroove', std: true, desc: 'Passende Einbaunut nach DIN 3771 / ISO 3601-2 (axial oder radial)', params: [
    { k: 'size', label: 'O-Ring (d₁ × d₂)', type: 'select', options: [...ORING_OPTIONS, ['custom', 'Eigene Maße']], def: '20x2' },
    { k: 'mode', label: 'Einbau-Art', type: 'select', options: [['axial', 'Axial (Planfläche)'], ['radial_shaft', 'Radial (Welle / Kolben)'], ['radial_bore', 'Radial (Bohrung / Gehäuse)']], def: 'axial' },
    { k: 'use', label: 'Dichtfall', type: 'select', options: [['static', 'Statisch (ruhend)'], ['dynamic', 'Dynamisch (bewegt)']], def: 'static' },
    { k: 'd1', label: 'Innen-Ø (d₁)', type: 'num', def: null, auto: true },
    { k: 'd2', label: 'Schnurstärke (d₂)', type: 'num', def: null, auto: true },
    { k: 'extra', label: 'Überstand', type: 'num', def: 0.5 },
  ] },
  { lib: 'stdShaftSeal', label: 'Wellendichtring (DIN 3760)', role: 'solid', icon: 'shaftSeal', mat: 'TPU 95A', std: true, desc: 'Radial-Wellendichtring nach DIN 3760 / ISO 6194 (Form AS mit Staublippe oder Form A)', params: [
    { k: 'size', label: 'Größe (d × D × b)', type: 'select', options: SHAFT_SEAL_OPTIONS, def: '20x35x7' },
    { k: 'form', label: 'Bauform', type: 'select', options: [['AS', 'Form AS (mit Staublippe)'], ['A', 'Form A (ohne Staublippe)']], def: 'AS' },
    { k: 'b', label: 'Breite (b)', type: 'num', def: null, auto: true },
  ] },
  { lib: 'stdCompSpring', label: 'Druckfeder (Norm)', role: 'solid', icon: 'compSpring', mat: 'Stahl 42CrMo4', std: true, desc: 'Zylindrische Schrauben-Druckfeder nach DIN EN 13906-1 / DIN 2098 mit Federrate', params: [
    { k: 'size', label: 'Größe (d × Dm × L₀)', type: 'select', options: [...COMP_SPRING_OPTIONS, ['custom', 'Eigene Maße']], def: '2x16x43' },
    { k: 'd', label: 'Draht-Ø (d)', type: 'num', def: null, auto: true },
    { k: 'Dm', label: 'Mittl. Ø (Dm)', type: 'num', def: null, auto: true },
    { k: 'turns', label: 'Windungen (n)', type: 'num', def: null, auto: true, unit: '' },
    { k: 'pitch', label: 'Steigung (P)', type: 'num', def: null, auto: true },
    { k: 'length', label: 'Länge (L₀)', type: 'num', def: null, auto: true },
    { k: 'ends', label: 'Federenden', type: 'select', options: [['ground', 'Angelegt & geschliffen'], ['open', 'Offen (ungeschliffen)']], def: 'ground' },
  ] },
  { lib: 'stdExtSpring', label: 'Zugfeder (Norm)', role: 'solid', icon: 'extSpring', mat: 'Stahl 42CrMo4', std: true, desc: 'Zylindrische Schrauben-Zugfeder nach DIN EN 13906-2 mit 1/1 deutschen Ösen', params: [
    { k: 'size', label: 'Größe (d × Dm - n)', type: 'select', options: [...EXT_SPRING_OPTIONS, ['custom', 'Eigene Maße']], def: '1.5x15-24' },
    { k: 'd', label: 'Draht-Ø (d)', type: 'num', def: null, auto: true },
    { k: 'Dm', label: 'Mittl. Ø (Dm)', type: 'num', def: null, auto: true },
    { k: 'turns', label: 'Windungen (n)', type: 'num', def: null, auto: true, unit: '' },
    { k: 'hookAngle', label: 'Ösen-Stellung', type: 'select', options: [['0', '0° (in einer Ebene)'], ['90', '90° (gedreht)']], def: '0' },
  ] },
  { lib: 'steppedShaft', label: 'Welle (abgesetzt)', role: 'solid', icon: 'steppedShaft', std: true, mat: 'Baustahl', kw: 'welle absatz abgesetzt fase stufenwelle achse antriebswelle bi-13', desc: 'Runde Welle mit optionalen Absätzen (z. B. Ø10 / Ø8) sowie End- und Absatzfasen', params: [
    { k: 'd', label: 'Haupt-Ø (d)', type: 'num', def: 10 },
    { k: 'length', label: 'Gesamtlänge (L)', type: 'num', def: 100 },
    { k: 'step1D', label: 'Absatz 1 Ø (unten)', type: 'num', def: 8 },
    { k: 'step1Len', label: 'Absatz 1 Länge', type: 'num', def: 20 },
    { k: 'step2D', label: 'Absatz 2 Ø (oben, 0=aus)', type: 'num', def: 0 },
    { k: 'step2Len', label: 'Absatz 2 Länge', type: 'num', def: 15 },
    { k: 'endChamfer', label: 'Endfase', type: 'num', def: 0.5 },
    { k: 'stepChamfer', label: 'Absatzfase', type: 'num', def: 0.3 },
  ] },
  { lib: 'shaftCollar', label: 'Stellring (DIN 705)', role: 'solid', icon: 'shaftCollar', std: true, mat: 'Baustahl', kw: 'stellring din 705 klemmring klemmstellring welle anschlag bi-13', desc: 'Stellring nach DIN 705 mit Gewindestift oder als Klemm-Stellring mit Schlitz', params: [
    { k: 'size', label: 'Wellen-Ø (DIN 705)', type: 'select', options: [...SHAFT_COLLAR_OPTIONS, ['custom', 'Eigene Maße']], def: '10' },
    { k: 'style', label: 'Bauform', type: 'select', options: [['setscrew', 'Gewindestift (DIN 705 A)'], ['clamp', 'Klemm-Stellring (geschlitzt)']], def: 'setscrew' },
    { k: 'd', label: 'Bohrung Ø (d₁)', type: 'num', def: null, auto: true },
    { k: 'D', label: 'Außen-Ø (d₂)', type: 'num', def: null, auto: true },
    { k: 'width', label: 'Breite (b)', type: 'num', def: null, auto: true },
    { k: 'clear', label: 'Laufspiel', type: 'num', def: 0.05 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'shaftCoupling', label: 'Wellenkupplung', role: 'solid', icon: 'shaftCoupling', std: true, mat: 'Alu 6061', kw: 'kupplung wellenkupplung klemmkupplung flanschkupplung starr welle antrieb bi-13', desc: 'Einfache Wellenkupplung (starr mit Gewindestiften, Klemmkupplung oder Flanschkupplung)', params: [
    { k: 'size', label: 'Bohrungen (d₁ × d₂)', type: 'select', options: [...SHAFT_COUPLING_OPTIONS, ['custom', 'Eigene Maße']], def: '10x10' },
    { k: 'style', label: 'Bauform', type: 'select', options: [['rigid', 'Starr (Gewindestifte)'], ['clamp', 'Klemmkupplung (geschlitzt)'], ['flange', 'Flanschkupplung']], def: 'rigid' },
    { k: 'd1', label: 'Bohrung 1 Ø (d₁)', type: 'num', def: null, auto: true },
    { k: 'd2', label: 'Bohrung 2 Ø (d₂)', type: 'num', def: null, auto: true },
    { k: 'D', label: 'Außen-Ø (D)', type: 'num', def: null, auto: true },
    { k: 'length', label: 'Länge (L)', type: 'num', def: null, auto: true },
    { k: 'clear', label: 'Laufspiel', type: 'num', def: 0.05 },
    { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
  ] },
  { lib: 'slotHole', label: 'Langloch', role: 'hole', icon: 'slot', desc: 'Längliches Loch zum Verstellen', params: [
    { k: 'len', label: 'Länge', type: 'num', def: 20 }, { k: 'w', label: 'Breite', type: 'num', def: 4.5 }, { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'holePattern', label: 'Lochbild', role: 'hole', icon: 'stack', drone: true, desc: 'Vier Schraubenlöcher für einen Stack oder einen Motor', params: [
    { k: 'pat', label: 'Lochbild', type: 'select', options: [['stack305', 'Stack 30,5 × 30,5'], ['stack255', 'Stack 25,5 × 25,5'], ['stack20', 'Stack 20 × 20'], ['stack16', 'Stack 16 × 16'], ['motor19', 'Motor, Lochkreis 19'], ['motor16', 'Motor, Lochkreis 16'], ['motor12', 'Motor, Lochkreis 12'], ['motor9', 'Motor, Lochkreis 9'], ['square', 'Quadrat (eigenes Maß)'], ['circle', 'Lochkreis (eigenes Maß)']], def: 'stack305' },
    { k: 'a', label: 'Eigenes Maß', type: 'num', def: 20 },
    { k: 'size', label: 'Schraube', type: 'select', options: SIZES, def: 'M3' },
    { k: 'center', label: 'Mittelloch Ø', type: 'num', def: null, auto: true },
    { k: 'rot', label: 'Drehung', type: 'num', def: 0, unit: '°' },
    { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'zipTie', label: 'Kabelbinder', role: 'hole', icon: 'strap', desc: 'Zwei Schlitze, um ein Kabel mit einem Kabelbinder festzumachen', params: [
    { k: 'w', label: 'Binderbreite', type: 'num', def: 3 }, { k: 't', label: 'Schlitzbreite', type: 'num', def: 1.6 }, { k: 'gap', label: 'Abstand', type: 'num', def: 6 }, { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'snapHook', label: 'Schnapphaken', role: 'solid', icon: 'snap', desc: 'Federnder Haken zum Einrasten', params: [
    { k: 'length', label: 'Länge', type: 'num', def: 12 }, { k: 'w', label: 'Breite', type: 'num', def: 8 }, { k: 't', label: 'Dicke', type: 'num', def: 1.6 }, { k: 'hook', label: 'Hakentiefe', type: 'num', def: 1.2 },
  ] },
  { lib: 'hinge', label: 'Scharnier', role: 'solid', icon: 'hinge', desc: 'Scharnier mit Spiel, aus einem Stück', params: [
    { k: 'len', label: 'Länge', type: 'num', def: 40 }, { k: 'w', label: 'Flügelbreite', type: 'num', def: 15 }, { k: 't', label: 'Dicke', type: 'num', def: 2.4 }, { k: 'gap', label: 'Spiel', type: 'num', def: 0.4 },
  ] },
  { lib: 'batteryHolder', label: 'Batteriefach', role: 'solid', icon: 'batteryHolder',
    kw: 'batterie batteriefach akku akkufach halter aa aaa mignon micro 18650 zelle zellen bi-19',
    desc: 'Parametrisches Batteriefach für AA-, AAA- oder 18650-Zellen (1–8 Zellen)', params: [
      { k: 'cell', label: 'Zellentyp', type: 'select', options: BATTERY_CELL_OPTIONS, def: 'AA' },
      { k: 'count', label: 'Zellenanzahl', type: 'num', def: 2, int: true, unit: '' },
      { k: 'wall', label: 'Wandstärke', type: 'num', def: 2 },
      { k: 'floor', label: 'Bodendicke', type: 'num', def: 2 },
      { k: 'divider', label: 'Trennwand (0 = ohne)', type: 'num', def: 1.2 },
      { k: 'clear', label: 'Spiel Ø', type: 'num', def: null, auto: true },
      { k: 'contactSpace', label: 'Kontakt-Zugabe', type: 'num', def: null, auto: true },
      { k: 'wireHoles', label: 'Kontakt-/Kabellöcher', type: 'select', options: [['ja', 'Ja (beide Enden)'], ['nein', 'Nein (geschlossen)']], def: 'ja' },
      { k: 'mountHoles', label: 'Boden-Schraublöcher', type: 'select', options: [['nein', 'Nein'], ['ja', 'Ja (2× M3)']], def: 'nein' },
      { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
    ] },
  { lib: 'pullHandle', label: 'Griff (Bügelgriff)', role: 'solid', icon: 'pullHandle', mat: 'Alu 6061',
    kw: 'griff buegelgriff bügelgriff brueckengriff brückengriff t-griff handgriff schrankgriff gehaeusegriff bi-14',
    desc: 'Parametrischer Bügel-, Brücken- oder T-Griff mit wählbarem Lochabstand', params: [
      { k: 'style', label: 'Bauform', type: 'select', options: [['bow', 'Bügelgriff (rund)'], ['bridge', 'Brückengriff (Flansch)'], ['tHandle', 'T-Griff']], def: 'bow' },
      { k: 'holeDist', label: 'Lochabstand / Breite', type: 'num', def: 96 },
      { k: 'height', label: 'Höhe', type: 'num', def: 35 },
      { k: 'gripD', label: 'Griffstärke Ø', type: 'num', def: 12 },
      { k: 'holeD', label: 'Befestigungsloch Ø (0 = ohne)', type: 'num', def: 4.2 },
      { k: 'holeDepth', label: 'Lochtiefe', type: 'num', def: 12 },
    ] },
  { lib: 'rotaryKnob', label: 'Drehknopf', role: 'solid', icon: 'rotaryKnob', mat: 'ABS',
    kw: 'drehknopf knopf regler poti potentiometer encoder drehregler geraeteknopf zeigerknopf bi-14',
    desc: 'Drehknopf für Potis und Drehgeber (geriffelt, glatt oder Zeigerknopf) mit Wellenaufnahme', params: [
      { k: 'style', label: 'Bauform', type: 'select', options: [['fluted', 'Geriffelt (Griffmulden)'], ['smooth', 'Glatt mit Zeigerstrich'], ['pointer', 'Zeigerknopf']], def: 'fluted' },
      { k: 'D', label: 'Durchmesser (D)', type: 'num', def: 24 },
      { k: 'h', label: 'Höhe (h)', type: 'num', def: 16 },
      { k: 'shaftD', label: 'Wellen-Ø (0 = ohne)', type: 'num', def: 6 },
      { k: 'shaftType', label: 'Wellenaufnahme', type: 'select', options: [['dShaft', 'D-Welle (abgeflacht)'], ['round', 'Rundbohrung'], ['setscrew', 'Mit Madenschraube']], def: 'dShaft' },
      { k: 'boreDepth', label: 'Lochtiefe', type: 'num', def: null, auto: true },
      { k: 'flutes', label: 'Griffmulden', type: 'num', def: 12, int: true, unit: '' },
      { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
    ] },
  { lib: 'thumbScrew', label: 'Rändelschraube', role: 'solid', icon: 'thumbScrew', mat: 'V2A Edelstahl',
    kw: 'raendelschraube rändelschraube daumenschraube fingerschraube din 464 din 653 schraube griffschraube bi-14',
    desc: 'Rändelschraube nach DIN 464 (hohe Form) oder DIN 653 (flache Form) für M3–M10', params: [
      { k: 'size', label: 'Gewinde', type: 'select', options: THUMBSCREW_SIZES, def: 'M4' },
      { k: 'form', label: 'Bauform', type: 'select', options: [['high', 'DIN 464 (hohe Form)'], ['low', 'DIN 653 (flache Form)']], def: 'high' },
      { k: 'length', label: 'Schaftlänge', type: 'num', def: 12 },
      { k: 'headD', label: 'Kopf-Ø', type: 'num', def: null, auto: true },
      { k: 'headH', label: 'Kopfhöhe', type: 'num', def: null, auto: true },
      { k: 'knurl', label: 'Rändel', type: 'select', options: [['straight', 'Geraderändel'], ['diamond', 'Kreuzrändel'], ['none', 'Glatt (ohne Rändel)']], def: 'straight' },
    ] },
  { lib: 'deviceFoot', label: 'Gerätefuß', role: 'solid', icon: 'deviceFoot', mat: 'TPU 95A',
    kw: 'geraetefuss gerätefuß fuss fuß gummifuss gummifuß standfuss standfuß puffer gehaeusefuss bi-14',
    desc: 'Gerätefuß oder Gummipuffer (konisch, zylindrisch, Halbkugel) mit optionalem Schraubenloch', params: [
      { k: 'style', label: 'Form', type: 'select', options: [['conical', 'Konisch (Standard)'], ['cylindrical', 'Zylindrisch'], ['bumper', 'Halbkugel-Puffer']], def: 'conical' },
      { k: 'D', label: 'Stand-Ø (D)', type: 'num', def: 20 },
      { k: 'h', label: 'Höhe (h)', type: 'num', def: 10 },
      { k: 'screw', label: 'Schraubenloch', type: 'select', options: [['M4', 'M4 (versenkt)'], ['M3', 'M3 (versenkt)'], ['M5', 'M5 (versenkt)'], ['none', 'Ohne Loch (Klebepuffer)']], def: 'M4' },
      { k: 'printFit', get label() { return T('printFit.label'); }, type: 'select', options: printFitHoleOptions, def: '' },
    ] },
  { lib: 'goproMount', label: 'GoPro-Halterung', role: 'solid', icon: 'actionMount', drone: true, desc: 'Finger mit M5-Loch für Action-Kameras, auf einer Grundplatte – mit Mutter-Nabe', params: [
    { k: 'n', label: 'Finger', type: 'select', options: ['3', '2'], def: '3' }, { k: 't', label: 'Fingerdicke', type: 'num', def: 3 }, { k: 'gap', label: 'Spalt', type: 'num', def: 3.2 }, { k: 'hole', label: 'Loch Ø', type: 'num', def: 5.2 },
    { k: 'fw', label: 'Fingerbreite', type: 'num', def: 15 }, { k: 'hz', label: 'Lochhöhe', type: 'num', def: 9 }, { k: 'nut', label: 'Mutter M5', type: 'select', options: ['ja', 'nein'], def: 'ja' },
    { k: 'bw', label: 'Platte breit', type: 'num', def: 24 }, { k: 'bd', label: 'Platte tief', type: 'num', def: 20 }, { k: 'bh', label: 'Platte dick', type: 'num', def: 2 },
  ] },
  { lib: 'xt60Holder', label: 'Stecker-Halter (XT60)', role: 'solid', icon: 'plugMount', drone: true, desc: 'Platte mit Ausschnitt für einen Akkustecker und zwei Schraubenlöchern', params: [
    { k: 'w', label: 'Stecker breit', type: 'num', def: 15.5 }, { k: 'h', label: 'Stecker hoch', type: 'num', def: 8.1 }, { k: 'fit', label: 'Spiel', type: 'num', def: 0.3 }, { k: 'ch', label: 'Abschrägung', type: 'num', def: 1.5 },
    { k: 't', label: 'Plattendicke', type: 'num', def: 3 }, { k: 'ea', label: 'Lochabstand', type: 'num', def: 26 }, { k: 'hole', label: 'Loch Ø', type: 'num', def: 3.2 }, { k: 'wall', label: 'Rand', type: 'num', def: 2.5 },
  ] },
  { lib: 'antennaMount', label: 'Antennenhalter', role: 'solid', icon: 'antenna', drone: true, desc: 'Grundplatte mit ein oder zwei Röhrchen, V-förmig gespreizt und nach hinten geneigt', params: [
    { k: 'n', label: 'Röhrchen', type: 'select', options: ['2', '1'], def: '2' }, { k: 'di', label: 'Innen-Ø', type: 'num', def: 3.5 }, { k: 'wall', label: 'Wand', type: 'num', def: 1.2 }, { k: 'len', label: 'Länge', type: 'num', def: 20 },
    { k: 'spread', label: 'Spreizung', type: 'num', def: 90, unit: '°' }, { k: 'lean', label: 'Neigung nach hinten', type: 'num', def: 30, unit: '°' }, { k: 's', label: 'Abstand', type: 'num', def: 10 },
    { k: 'bw', label: 'Platte breit', type: 'num', def: 22 }, { k: 'bd', label: 'Platte tief', type: 'num', def: 12 }, { k: 'bh', label: 'Platte dick', type: 'num', def: 2 },
  ] },
  { lib: 'aeroBody', label: 'Stromlinien-Rumpf', role: 'solid', icon: 'revolve', drone: true, desc: 'Hohler Rumpf in Tropfenform: runde Nase, Mittelteil, langes spitzes Heck – liegt längs, Nase nach vorne', params: [
    { k: 'd', label: 'Durchmesser', type: 'num', def: 60 }, { k: 'ln', label: 'Nasenlänge', type: 'num', def: 55 }, { k: 'lc', label: 'Mittelteil', type: 'num', def: 100 }, { k: 'lt', label: 'Hecklänge', type: 'num', def: 95 },
    { k: 'dn', label: 'Nasenöffnung Ø', type: 'num', def: 32 }, { k: 'dt', label: 'Hecköffnung Ø', type: 'num', def: 18 }, { k: 'wall', label: 'Wand', type: 'num', def: 1.6 },
  ] },
  { lib: 'armFairing', label: 'Armverkleidung', role: 'solid', icon: 'wind', drone: true, desc: 'Stromlinien-Hülle über einen Arm: NACA-Tropfenprofil, Nase nach vorne, innen ein Schlitz für den Arm – so dick wie nötig', params: [
    { k: 'len', label: 'Länge', type: 'num', def: 60 }, { k: 'aw', label: 'Armbreite', type: 'num', def: 14 }, { k: 'at', label: 'Armdicke', type: 'num', def: 5 },
    { k: 'wall', label: 'Wand', type: 'num', def: 1 }, { k: 'chord', label: 'Profiltiefe (0 = automatisch)', type: 'num', def: 0 },
  ] },
  { lib: 'motorFairing', label: 'Motorverkleidung', role: 'solid', icon: 'wind', drone: true, desc: 'Stromlinien-Becher um einen Motor: oben offen für den Propeller, unten ein spitzes Heck, seitlich ein Schlitz für den Arm', params: [
    { k: 'd', label: 'Motor Ø', type: 'num', def: 28 }, { k: 'h', label: 'Motorhöhe', type: 'num', def: 18 }, { k: 'tail', label: 'Hecklänge', type: 'num', def: 30 },
    { k: 'aw', label: 'Armbreite', type: 'num', def: 12 }, { k: 'at', label: 'Armdicke', type: 'num', def: 5 },
    { k: 'wall', label: 'Wand', type: 'num', def: 1.2 }, { k: 'gap', label: 'Luft um den Motor', type: 'num', def: 0.5 },
  ] },
  { lib: 'gear', label: 'Zahnrad', role: 'solid', icon: 'gear', desc: 'Stirnrad mit Evolventen-Zähnen', params: [
    { k: 'teeth', label: 'Zähne', type: 'num', def: 20, int: true, unit: '' }, { k: 'module', label: 'Modul', type: 'num', def: 1.5 }, { k: 'h', label: 'Dicke', type: 'num', def: 6 }, { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 5 },
  ] },
  { lib: 'internalGear', label: 'Innenzahnrad', role: 'solid', icon: 'internalGear', pro: true,
    keys: 'hohlrad innenverzahnung zahnrad planetengetriebe modul bi-11',
    desc: 'Hohlrad mit innenliegenden Evolventen-Zähnen passend zum Modul', params: [
      { k: 'teeth', label: 'Zähne', type: 'num', def: 40, int: true, unit: '' },
      { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
      { k: 'h', label: 'Dicke', type: 'num', def: 6 },
      { k: 'wall', label: 'Außenwand', type: 'num', def: 5 },
    ] },
  { lib: 'gearRack', label: 'Zahnstange', role: 'solid', icon: 'gearRack', pro: true,
    keys: 'zahnstange ritzel modul linear antrieb bi-11',
    desc: 'Gerade Zahnstange passend zum Modul (Länge = π · Modul · Zähne)', params: [
      { k: 'teeth', label: 'Zähne', type: 'num', def: 10, int: true, unit: '' },
      { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
      { k: 'h', label: 'Dicke', type: 'num', def: 6 },
      { k: 'baseH', label: 'Sockelhöhe', type: 'num', def: 6 },
    ] },
  { lib: 'worm', label: 'Schnecke', role: 'solid', icon: 'worm', pro: true,
    keys: 'schnecke schneckengetriebe schneckenrad schraube modul bi-11',
    desc: 'Zylinderschnecke passend zum Modul (1- bis 4-gängig) für Schneckengetriebe', params: [
      { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
      { k: 'starts', label: 'Gänge (z₁)', type: 'num', def: 1, int: true, unit: '' },
      { k: 'd', label: 'Teilkreis-Ø (d₁)', type: 'num', def: 16 },
      { k: 'length', label: 'Länge', type: 'num', def: 30 },
      { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 6 },
      { k: 'dir', label: 'Steigung', type: 'select', options: [['right', 'Rechtsgängig'], ['left', 'Linksgängig']], def: 'right' },
    ] },
  { lib: 'wormWheel', label: 'Schneckenrad', role: 'solid', icon: 'wormWheel', pro: true,
    keys: 'schneckenrad schnecke schneckengetriebe zahnrad schraeg modul bi-11',
    desc: 'Schrägverzahntes Schneckenrad passend zu Modul und Schnecke', params: [
      { k: 'teeth', label: 'Zähne (z₂)', type: 'num', def: 24, int: true, unit: '' },
      { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
      { k: 'h', label: 'Breite', type: 'num', def: 10 },
      { k: 'wormD', label: 'Schnecken-Ø (d₁)', type: 'num', def: 16 },
      { k: 'wormStarts', label: 'Schnecken-Gänge', type: 'num', def: 1, int: true, unit: '' },
      { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 6 },
      { k: 'dir', label: 'Steigung', type: 'select', options: [['right', 'Rechtsgängig'], ['left', 'Linksgängig']], def: 'right' },
    ] },
  { lib: 'helicalGear', label: 'Schrägzahnrad', role: 'solid', icon: 'helicalGear', pro: true, kw: 'schraegzahnrad schrägzahnrad zahnrad helical pfeilverzahnung schraeg getriebe bi-11', desc: 'Stirnrad mit schrägen Evolventen-Zähnen (rechts, links oder Pfeil)', params: [
    { k: 'teeth', label: 'Zähne', type: 'num', def: 20, int: true, unit: '' },
    { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
    { k: 'h', label: 'Breite', type: 'num', def: 8 },
    { k: 'helixAngle', label: 'Schrägungswinkel', type: 'num', def: 20, unit: '°' },
    { k: 'hand', label: 'Steigung', type: 'select', options: [['right', 'Rechtssteigend'], ['left', 'Linkssteigend'], ['double', 'Pfeilverzahnung']], def: 'right' },
    { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 5 },
  ] },
  { lib: 'bevelGear', label: 'Kegelrad', role: 'solid', icon: 'bevelGear', pro: true, kw: 'kegelrad kegelzahnrad bevel winkelgetriebe 90 grad getriebe zahnrad bi-11', desc: 'Geradverzahntes Kegelrad für abgewinkelte Wellen (Standard 90°)', params: [
    { k: 'teeth', label: 'Zähne', type: 'num', def: 20, int: true, unit: '' },
    { k: 'mateTeeth', label: 'Gegenrad-Zähne', type: 'num', def: 20, int: true, unit: '' },
    { k: 'module', label: 'Modul', type: 'num', def: 1.5 },
    { k: 'shaftAngle', label: 'Achswinkel', type: 'num', def: 90, unit: '°' },
    { k: 'coneAngle', label: 'Kegelwinkel', type: 'num', def: null, auto: true, unit: '°' },
    { k: 'faceWidth', label: 'Zahnbreite', type: 'num', def: null, auto: true },
    { k: 'hubH', label: 'Rückenhöhe', type: 'num', def: null, auto: true },
    { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 5 },
  ] },
  { lib: 'timingPulley', label: 'Zahnriemenscheibe', role: 'solid', icon: 'timingPulley', mat: 'Alu 6061',
    kw: 'zahnriemenscheibe riemenscheibe pulley gt2 htd 3m 5m 8m zahnriemen riemenantrieb bi-12',
    desc: 'Zahnriemenscheibe für GT2- und HTD-Riemen mit optionalen Bordscheiben und Nabe', params: [
      { k: 'profile', label: 'Profil', type: 'select', options: TIMING_PULLEY_OPTIONS, def: 'GT2' },
      { k: 'teeth', label: 'Zähne', type: 'num', def: 20, int: true, unit: '' },
      { k: 'beltW', label: 'Riemenbreite', type: 'num', def: null, auto: true },
      { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 5 },
      { k: 'flanges', label: 'Bordscheiben', type: 'select', options: [['both', 'Beidseitig'], ['bottom', 'Nur unten'], ['none', 'Ohne']], def: 'both' },
      { k: 'hubH', label: 'Nabenhöhe (0 = ohne)', type: 'num', def: 5 },
      { k: 'hubD', label: 'Naben-Ø', type: 'num', def: null, auto: true },
    ] },
  { lib: 'sprocket', label: 'Kettenrad', role: 'solid', icon: 'sprocket', mat: 'Baustahl',
    kw: 'kettenrad ritzel kettenblatt teilung kette rollenkette 1/2 3/8 5/8 08b 06b 10b din 8187 iso 606 fahrrad bi-12',
    desc: 'Rollenkettenrad nach Teilung (DIN 8187 / ISO 606, z. B. 1/2", 3/8" oder eigene Teilung)', params: [
      { k: 'chain', label: 'Kette / Teilung', type: 'select', options: SPROCKET_CHAIN_OPTIONS, def: '08B' },
      { k: 'teeth', label: 'Zähne', type: 'num', def: 15, int: true, unit: '' },
      { k: 'pitch', label: 'Teilung (p)', type: 'num', def: null, auto: true },
      { k: 'rollerD', label: 'Rollen-Ø (d₁)', type: 'num', def: null, auto: true },
      { k: 'thickness', label: 'Zahnbreite', type: 'num', def: null, auto: true },
      { k: 'bore', label: 'Bohrung Ø', type: 'num', def: 10 },
      { k: 'hubH', label: 'Nabenhöhe (0 = flach)', type: 'num', def: 0 },
      { k: 'hubD', label: 'Naben-Ø', type: 'num', def: null, auto: true },
    ] },
];
// Kaufteile mit ihrer echten Form (kommen über die Drohnen-Bibliothek, nicht ins Fenster „Bauteile“)
const N = (k, label, def, unit) => ({ k, label, type: 'num', def, ...(unit ? { unit } : {}) });
LIB.push(
  { lib: 'buyMotor', label: 'Motor', role: 'solid', icon: 'motor', buy: true, desc: 'Bürstenloser Außenläufer: Fuß mit Gewindelöchern, Glocke, Welle', params: [N('d', 'Glocke Ø', 28.5), N('h', 'Höhe', 19.7), N('lk', 'Lochkreis', 16), { k: 'size', label: 'Schrauben', type: 'select', options: SIZES, def: 'M3' }] },
  { lib: 'buyBattery', label: 'Akku', role: 'solid', icon: 'battery', buy: true, desc: 'LiPo-Akku mit abgerundeten Kanten', params: [N('w', 'Breite', 35), N('d', 'Länge', 75), N('h', 'Höhe', 30)] },
  { lib: 'buyCamera', label: 'FPV-Kamera', role: 'solid', icon: 'fpvCam', buy: true, desc: 'Kamera mit Objektiv nach vorne und seitlichen Gewinden', params: [N('w', 'Breite', 19), N('d', 'Tiefe', 20), N('h', 'Höhe', 19), N('lens', 'Objektiv Ø', 13)] },
  { lib: 'buyStack', label: 'Stack (FC + ESC)', role: 'solid', icon: 'stack', buy: true, desc: 'Flugsteuerung über dem ESC, zwei Platinen auf Gummi-Dämpfern', params: [N('a', 'Lochabstand', 30.5), N('h', 'Höhe', 12), { k: 'size', label: 'Schrauben', type: 'select', options: SIZES, def: 'M3' }] },
  { lib: 'buyVtx', label: 'Videosender', role: 'solid', icon: 'antenna', buy: true, desc: 'Digitaler Videosender mit Kühlrippen', params: [N('w', 'Breite', 30.5), N('d', 'Länge', 32.5), N('h', 'Höhe', 14.5), N('a', 'Lochbild', 25.5)] },
  { lib: 'buyPcb', label: 'Platine', role: 'solid', icon: 'stack', buy: true, desc: 'Kleine Platine mit Abschirmung, z. B. analoger Sender oder Empfänger', params: [N('w', 'Breite', 25), N('d', 'Länge', 37), N('h', 'Höhe', 5.8)] },
  { lib: 'buyGps', label: 'GPS', role: 'solid', icon: 'antenna', buy: true, desc: 'GPS-Modul mit Keramik-Antenne', params: [N('w', 'Breite', 15), N('d', 'Länge', 15), N('h', 'Höhe', 5.2)] },
  { lib: 'buyActioncam', label: 'Action-Kamera', role: 'solid', icon: 'cube', buy: true, desc: 'Action-Kamera mit Objektiv nach vorne', params: [N('w', 'Breite', 71.8), N('d', 'Tiefe', 33.6), N('h', 'Höhe', 50.8)] },
  { lib: 'buyPlug', label: 'Stecker', role: 'solid', icon: 'bolt', buy: true, desc: 'Akkustecker mit zwei Kontakten', params: [N('w', 'Breite', 15.5), N('d', 'Länge', 21.5), N('h', 'Höhe', 8.1)] },
  { lib: 'buyAntenna', label: 'Antenne', role: 'solid', icon: 'antenna', buy: true, desc: 'Video-Antenne nach oben: Stecker, Röhrchen und Pilzkopf (oder Stab)', params: [N('L', 'Länge gesamt', 45), N('d', 'Röhrchen Ø', 3), { k: 'form', label: 'Form', type: 'select', options: [['pilz', 'Pilz (rund oben)'], ['stab', 'Stab']], def: 'pilz' }, N('kd', 'Kopf Ø', 14), N('kl', 'Kopf Länge', 12), { k: 'conn', label: 'Stecker', type: 'select', options: [['sma', 'SMA / RP-SMA'], ['ufl', 'U.FL / MMCX (Kabel)']], def: 'sma' }] },
  { lib: 'buyCap', label: 'Kondensator', role: 'solid', icon: 'battery', buy: true, desc: 'Elko gegen Spannungsspitzen', params: [N('d', 'Durchmesser', 12.5), N('h', 'Länge', 20)] },
  { lib: 'buyProp', label: 'Propeller', role: 'solid', icon: 'prop', buy: true, desc: 'Propeller mit Nabe und Blättern, dazu ein dünner Ring für den Propellerkreis', params: [N('zoll', 'Durchmesser (Zoll)', 5, '"'), N('blades', 'Blätter', 3, ''), N('pitch', 'Anstellwinkel', 13, '°')] },
);
const LIBMAP = Object.fromEntries(LIB.map((d) => [d.lib, d]));
function libDefaults(def) { const p = {}; for (const q of def.params) p[q.k] = q.def; return p; }

// Kennwerte für Schrägzahnräder (Stirnmodul m_t = m)
function helicalGearMetrics(p = {}) {
  const z = Math.max(6, Math.min(120, Math.round(Number(p.teeth ?? 20) || 20)));
  const m = Math.max(0.2, Number(p.module ?? 1.5) || 1.5);
  const h = Math.max(0.5, Number(p.h ?? 8) || 8);
  const rawBeta = Number(p.helixAngle ?? 20);
  const betaDeg = Math.max(0, Math.min(45, isFinite(rawBeta) ? rawBeta : 20));
  const betaRad = (betaDeg * Math.PI) / 180;
  const hand = p.hand === 'left' || p.hand === 'double' ? p.hand : 'right';
  const bore = Math.max(0, Number(p.bore ?? 5) || 0);
  const d = m * z;
  const rp = d / 2;
  const da = d + 2 * m;
  const ra = da / 2;
  const df = Math.max(1, d - 2.5 * m);
  const rf = df / 2;
  const mn = m * Math.cos(betaRad);
  const twistRad = (h * Math.tan(betaRad)) / rp;
  const twistDeg = (twistRad * 180) / Math.PI;
  return { z, m, mn, h, betaDeg, hand, bore, d, da, df, rp, ra, rf, twistRad, twistDeg };
}

// Kennwerte für geradverzahnte Kegelräder (DIN 3971 / Tredgold)
function bevelGearMetrics(p = {}) {
  const z = Math.max(6, Math.min(120, Math.round(Number(p.teeth ?? 20) || 20)));
  const z2 = Math.max(6, Math.min(120, Math.round(Number(p.mateTeeth ?? z) || z)));
  const m = Math.max(0.2, Number(p.module ?? 1.5) || 1.5);
  const rawSigma = Number(p.shaftAngle ?? 90);
  const sigmaDeg = Math.max(20, Math.min(160, isFinite(rawSigma) ? rawSigma : 90));
  const sigmaRad = (sigmaDeg * Math.PI) / 180;
  const autoDeltaDeg = (Math.atan2(Math.sin(sigmaRad), z2 / z + Math.cos(sigmaRad)) * 180) / Math.PI;
  const hasManualCone = p.coneAngle != null && p.coneAngle !== '' && isFinite(Number(p.coneAngle));
  const deltaDeg = Math.max(10, Math.min(80, hasManualCone ? Number(p.coneAngle) : autoDeltaDeg));
  const deltaRad = (deltaDeg * Math.PI) / 180;
  const d = m * z;
  const rp = d / 2;
  const Re = rp / Math.sin(deltaRad);
  const minB = Math.max(0.5, 0.08 * Re);
  const maxB = 0.42 * Re;
  const defB = Math.min(Re / 3, 10 * m);
  const hasManualB = p.faceWidth != null && p.faceWidth !== '' && isFinite(Number(p.faceWidth));
  const b = Math.max(minB, Math.min(maxB, hasManualB ? Number(p.faceWidth) : defB));
  const Ri = Re - b;
  const scaleIn = Ri / Re;
  const thetaADeg = (Math.atan(m / Re) * 180) / Math.PI;
  const thetaFDeg = (Math.min(deltaRad - (3 * Math.PI) / 180, Math.atan((1.25 * m) / Re)) * 180) / Math.PI;
  const da = d + 2 * m * Math.cos(deltaRad);
  const df = Math.max(1, d - 2.5 * m * Math.cos(deltaRad));
  const rRootOut = Math.max(0.5, rp - 1.25 * m * Math.cos(deltaRad));
  const zetaRootOut = Re * Math.cos(deltaRad) + 1.25 * m * Math.sin(deltaRad);
  const defHub = Math.max(2, round(1.5 * m, 1));
  const hasManualHub = p.hubH != null && p.hubH !== '' && isFinite(Number(p.hubH));
  const hubH = Math.max(0.5, hasManualHub ? Number(p.hubH) : defHub);
  const zApex = zetaRootOut + hubH;
  const zetaTipIn = scaleIn * (Re * Math.cos(deltaRad) - m * Math.sin(deltaRad));
  const zetaRootIn = scaleIn * zetaRootOut;
  const totalH = zApex - Math.min(zetaTipIn, zetaRootIn);
  const mateDeltaDeg = Math.max(10, Math.min(80, sigmaDeg - deltaDeg));
  const bore = Math.max(0, Number(p.bore ?? 5) || 0);
  return { z, z2, m, sigmaDeg, deltaDeg, mateDeltaDeg, d, da, df, rp, Re, Ri, b, scaleIn, thetaADeg, thetaFDeg, rRootOut, zetaRootOut, hubH, zApex, totalH, bore };
}

function gearComposeWorldTransform(t1, rel) {
  const base = t1 || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const hasBaseRot = Math.abs(Number(base.rx) || 0) > 1e-6 || Math.abs(Number(base.ry) || 0) > 1e-6 || Math.abs(Number(base.rz) || 0) > 1e-6;
  if (!hasBaseRot || typeof THREE === 'undefined') {
    return {
      x: round((Number(base.x) || 0) + rel.x, 6),
      y: round((Number(base.y) || 0) + rel.y, 6),
      z: round((Number(base.z) || 0) + rel.z, 6),
      rx: round(rel.rx, 6),
      ry: round(rel.ry, 6),
      rz: round(rel.rz, 6),
    };
  }
  const D = Math.PI / 180;
  const m1 = new THREE.Matrix4().compose(
    new THREE.Vector3(Number(base.x) || 0, Number(base.y) || 0, Number(base.z) || 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler((Number(base.rx) || 0) * D, (Number(base.ry) || 0) * D, (Number(base.rz) || 0) * D, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const mRel = new THREE.Matrix4().compose(
    new THREE.Vector3(rel.x, rel.y, rel.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rel.rx * D, rel.ry * D, rel.rz * D, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const m2 = m1.multiply(mRel);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  m2.decompose(pos, quat, scl);
  const eul = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return {
    x: round(pos.x, 6),
    y: round(pos.y, 6),
    z: round(pos.z, 6),
    rx: round((eul.x * 180) / Math.PI, 6),
    ry: round((eul.y * 180) / Math.PI, 6),
    rz: round((eul.z * 180) / Math.PI, 6),
  };
}

// Passendes Gegenrad zu einem Schrägzahnrad (umgekehrte Steigung, Achsabstand = Teilkreis-Ø)
function helicalGearMateTransform(p1 = {}, t1 = null) {
  const m1 = helicalGearMetrics(p1);
  const mateHand = m1.hand === 'right' ? 'left' : m1.hand === 'left' ? 'right' : 'double';
  const p2 = {
    teeth: m1.z,
    module: m1.m,
    h: m1.h,
    helixAngle: m1.betaDeg,
    hand: mateHand,
    bore: m1.bore,
  };
  const rz2 = m1.z % 2 === 0 ? 180 / m1.z : 0;
  const rel = m1.hand === 'double'
    ? { x: m1.d, y: 0, z: m1.h, rx: 180, ry: 0, rz: rz2 }
    : { x: m1.d, y: 0, z: 0, rx: 0, ry: 0, rz: rz2 };
  return { params: p2, t: gearComposeWorldTransform(t1, rel), metrics: m1 };
}

// Passendes Gegenrad zu einem Kegelrad (gemeinsame Kegelspitze, eingreifende Verzahnung)
function bevelGearMateTransform(p1 = {}, t1 = null) {
  const m1 = bevelGearMetrics(p1);
  const hasManualCone = p1 && p1.coneAngle != null && p1.coneAngle !== '' && isFinite(Number(p1.coneAngle));
  const hasManualB = p1 && p1.faceWidth != null && p1.faceWidth !== '' && isFinite(Number(p1.faceWidth));
  const hasManualHub = p1 && p1.hubH != null && p1.hubH !== '' && isFinite(Number(p1.hubH));
  const p2 = {
    teeth: m1.z2,
    mateTeeth: m1.z,
    module: m1.m,
    shaftAngle: m1.sigmaDeg,
    coneAngle: hasManualCone ? round(m1.mateDeltaDeg, 4) : null,
    faceWidth: hasManualB ? p1.faceWidth : round(m1.b, 3),
    hubH: hasManualHub ? p1.hubH : null,
    bore: m1.bore,
  };
  const m2 = bevelGearMetrics(p2);
  const sigmaRad = (m1.sigmaDeg * Math.PI) / 180;
  const rz2 = m2.z % 2 === 0 ? 180 / m2.z : 0;
  const rel = {
    x: m2.zApex * Math.sin(sigmaRad),
    y: 0,
    z: m1.zApex - m2.zApex * Math.cos(sigmaRad),
    rx: 0,
    ry: -m1.sigmaDeg,
    rz: rz2,
  };
  return { params: p2, t: gearComposeWorldTransform(t1, rel), m1, m2 };
}

// Passender Stellring (DIN 705) konzentrisch auf dem Hauptabschnitt einer Welle
function shaftCollarOnShaftTransform(shaftP = {}, shaftT = null) {
  const m = steppedShaftMetrics(shaftP);
  const match = shaftCollarForShaft(m.d);
  const params = match.id === 'custom'
    ? { size: 'custom', style: 'setscrew', d: m.d, D: null, width: null, clear: 0.05, printFit: '' }
    : { size: match.id, style: 'setscrew', d: null, D: null, width: null, clear: 0.05, printFit: '' };
  const cm = shaftCollarMetrics(params);
  const zPos = m.l1 + Math.max(0, (m.midLen - cm.b) / 2);
  return {
    params,
    t: gearComposeWorldTransform(shaftT, { x: 0, y: 0, z: zPos, rx: 0, ry: 0, rz: 0 }),
    shaft: m,
    collar: cm,
  };
}

// Passende Wellenkupplung auf das obere Wellenende setzen
function shaftCouplingOnShaftTransform(shaftP = {}, shaftT = null) {
  const m = steppedShaftMetrics(shaftP);
  const endD = m.hasStep2 ? m.d2 : m.d;
  const hit = SHAFT_COUPLING_SIZES.find((x) => Math.abs(x.d1 - endD) < 0.05 && Math.abs(x.d2 - endD) < 0.05);
  const params = hit
    ? { size: hit.id, style: 'rigid', d1: null, d2: null, D: null, length: null, clear: 0.05, printFit: '' }
    : { size: 'custom', style: 'rigid', d1: endD, d2: endD, D: null, length: null, clear: 0.05, printFit: '' };
  const cm = shaftCouplingMetrics(params);
  const zPos = m.L - cm.L / 2;
  return {
    params,
    t: gearComposeWorldTransform(shaftT, { x: 0, y: 0, z: zPos, rx: 0, ry: 0, rz: 0 }),
    shaft: m,
    coupling: cm,
  };
}

// Zweite Zahnriemenscheibe daneben platzieren
function timingPulleyMateTransform(p1 = {}, t1 = null) {
  const m = timingPulleyMetrics(p1);
  const dx = Math.max(40, Math.ceil((m.outerD + 25) / 5) * 5);
  return {
    params: {
      profile: m.profile,
      teeth: m.z,
      beltW: p1 && p1.beltW != null && p1.beltW !== '' ? p1.beltW : null,
      bore: m.bore,
      flanges: m.flanges,
      hubH: m.hubH,
      hubD: p1 && p1.hubD != null && p1.hubD !== '' ? p1.hubD : null,
    },
    t: gearComposeWorldTransform(t1, { x: dx, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }),
    metrics: m,
  };
}

// Zweites Kettenrad daneben platzieren
function sprocketMateTransform(p1 = {}, t1 = null) {
  const m = sprocketMetrics(p1);
  const dx = Math.max(80, Math.ceil((m.da + 40) / 10) * 10);
  return {
    params: {
      chain: m.chain,
      teeth: m.z,
      pitch: p1 && p1.pitch != null && p1.pitch !== '' ? p1.pitch : null,
      rollerD: p1 && p1.rollerD != null && p1.rollerD !== '' ? p1.rollerD : null,
      thickness: p1 && p1.thickness != null && p1.thickness !== '' ? p1.thickness : null,
      bore: m.bore,
      hubH: m.hubH,
      hubD: p1 && p1.hubD != null && p1.hubD !== '' ? p1.hubD : null,
    },
    t: gearComposeWorldTransform(t1, { x: dx, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }),
    metrics: m,
  };
}

// Genormte Lochbilder für Lüfter (25–140 mm), Schrittmotoren (NEMA 14/17/23), Servos & Platinen (BI-16, BI-17)
const MOUNT_PATTERN_GROUPS = [
  { id: 'fan', label: 'Lüfter (25–140 mm)' },
  { id: 'nema', label: 'Schrittmotoren (NEMA)' },
  { id: 'servo', label: 'Servos' },
  { id: 'pcb', label: 'Platinen (Raspberry Pi, Arduino, ESP32)' },
];
const MOUNT_PATTERNS = [
  // Axiallüfter (Quadrat-Lochbild + runder Luftausschnitt)
  { id: 'fan25', group: 'fan', label: 'Lüfter 25 mm', layout: 'square', pitch: 20, holeD: 2.8, screw: 'M2.5', centerKind: 'circle', centerD: 23, source: 'Sunon MF2510 / ebm-papst 250' },
  { id: 'fan30', group: 'fan', label: 'Lüfter 30 mm', layout: 'square', pitch: 24, holeD: 3.2, screw: 'M3', centerKind: 'circle', centerD: 28, source: 'Sunon MF3010 / ebm-papst 300' },
  { id: 'fan40', group: 'fan', label: 'Lüfter 40 mm', layout: 'square', pitch: 32, holeD: 3.4, screw: 'M3', centerKind: 'circle', centerD: 38, source: 'ebm-papst 400 / Sunon MF4010' },
  { id: 'fan50', group: 'fan', label: 'Lüfter 50 mm', layout: 'square', pitch: 40, holeD: 4.3, screw: 'M4', centerKind: 'circle', centerD: 47, source: 'Sunon MF5015 / ebm-papst 500' },
  { id: 'fan60', group: 'fan', label: 'Lüfter 60 mm', layout: 'square', pitch: 50, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 57, source: 'Noctua NF-A6 / ebm-papst 600' },
  { id: 'fan70', group: 'fan', label: 'Lüfter 70 mm', layout: 'square', pitch: 61.5, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 67, source: 'Sunon ME7015 / ebm-papst 700' },
  { id: 'fan80', group: 'fan', label: 'Lüfter 80 mm', layout: 'square', pitch: 71.5, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 76, source: 'Noctua NF-A8 / ebm-papst 8400' },
  { id: 'fan92', group: 'fan', label: 'Lüfter 92 mm', layout: 'square', pitch: 82.5, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 88, source: 'Noctua NF-A9 / ebm-papst 3400' },
  { id: 'fan120', group: 'fan', label: 'Lüfter 120 mm', layout: 'square', pitch: 105, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 115, source: 'Noctua NF-A12 / ebm-papst 4400' },
  { id: 'fan140', group: 'fan', label: 'Lüfter 140 mm', layout: 'square', pitch: 124.5, holeD: 4.5, screw: 'M4', centerKind: 'circle', centerD: 135, source: 'Noctua NF-A14 / ebm-papst 5200' },
  // Schrittmotoren (NEMA ICS 16, Quadrat-Lochbild + runder Zentrierbund)
  { id: 'nema14', group: 'nema', label: 'NEMA 14 (35 mm)', layout: 'square', pitch: 26, holeD: 3.4, screw: 'M3', centerKind: 'circle', centerD: 22, source: 'NEMA ICS 16' },
  { id: 'nema17', group: 'nema', label: 'NEMA 17 (42 mm)', layout: 'square', pitch: 31, holeD: 3.4, screw: 'M3', centerKind: 'circle', centerD: 22, source: 'NEMA ICS 16' },
  { id: 'nema23', group: 'nema', label: 'NEMA 23 (57 mm)', layout: 'square', pitch: 47.14, holeD: 5.5, screw: 'M5', centerKind: 'circle', centerD: 38.1, source: 'NEMA ICS 16' },
  // Servos (2 oder 4 Befestigungslöcher + rechteckiger Gehäuse-Ausschnitt)
  { id: 'servoStd', group: 'servo', label: 'Standard-Servo (S3003 / MG996R)', layout: 'rect4', pitchX: 48.5, pitchY: 10, holeD: 3.2, screw: 'M3', centerKind: 'rect', cutW: 40.5, cutH: 20.5, source: 'Futaba S3003 / Hitec HS-311' },
  { id: 'servoMini', group: 'servo', label: 'Mini-Servo (HS-81 / MG92B)', layout: 'pair2', pitchX: 34.5, pitchY: 0, holeD: 2.5, screw: 'M2.5', centerKind: 'rect', cutW: 30.5, cutH: 12.5, source: 'Hitec HS-81' },
  { id: 'servoMicro', group: 'servo', label: 'Micro-Servo 9g (SG90 / MG90S)', layout: 'pair2', pitchX: 27.5, pitchY: 0, holeD: 2.2, screw: 'M2', centerKind: 'rect', cutW: 23, cutH: 12.5, source: 'TowerPro SG90' },
  { id: 'servoLarge', group: 'servo', label: 'Groß-Servo (HS-805BB)', layout: 'rect4', pitchX: 75.5, pitchY: 18, holeD: 4.2, screw: 'M4', centerKind: 'rect', cutW: 66.5, cutH: 30.5, source: 'Hitec HS-805BB' },
  // Platinen (Raspberry Pi, Arduino, ESP32; BI-17)
  { id: 'rpi4', group: 'pcb', label: 'Raspberry Pi 4 / 3 / 5 (Model B)', layout: 'rect4', pitchX: 58, pitchY: 49, holeD: 2.75, screw: 'M2.5', centerKind: 'none', boardW: 85, boardH: 56, source: 'Raspberry Pi Ltd (58 × 49 mm)' },
  { id: 'rpiZero', group: 'pcb', label: 'Raspberry Pi Zero / Zero 2 W', layout: 'rect4', pitchX: 58, pitchY: 23, holeD: 2.75, screw: 'M2.5', centerKind: 'none', boardW: 65, boardH: 30, source: 'Raspberry Pi Ltd (58 × 23 mm)' },
  { id: 'rpiPico', group: 'pcb', label: 'Raspberry Pi Pico / Pico 2', layout: 'rect4', pitchX: 47, pitchY: 11.4, holeD: 2.1, screw: 'M2', centerKind: 'none', boardW: 51, boardH: 21, source: 'Raspberry Pi Ltd (47 × 11,4 mm)' },
  { id: 'arduinoUno', group: 'pcb', label: 'Arduino Uno (R3 / R4)', layout: 'points', points: [[-20.32, -24.13], [-19.05, 24.13], [31.75, -19.05], [31.75, 8.89]], spanX: 52.07, spanY: 48.26, holeD: 3.2, screw: 'M3', centerKind: 'none', boardW: 68.6, boardH: 53.3, source: 'Arduino Uno R3 (asym.)' },
  { id: 'arduinoNano', group: 'pcb', label: 'Arduino Nano (V3 / Every)', layout: 'rect4', pitchX: 40.64, pitchY: 15.24, holeD: 1.7, screw: 'M1.6', centerKind: 'none', boardW: 43.2, boardH: 17.8, source: 'Arduino Nano V3 (40,64 × 15,24)' },
  { id: 'esp32Devkit', group: 'pcb', label: 'ESP32 DevKit V1 (30-Pin)', layout: 'rect4', pitchX: 44, pitchY: 24.5, holeD: 2.8, screw: 'M2.5', centerKind: 'none', boardW: 52, boardH: 28.2, source: 'DOIT ESP32 DevKit V1 (Richtwert)' },
  { id: 'esp32Feather', group: 'pcb', label: 'ESP32 Feather (Adafruit)', layout: 'rect4', pitchX: 45.72, pitchY: 17.78, holeD: 2.5, screw: 'M2.5', centerKind: 'none', boardW: 50.8, boardH: 22.9, source: 'Adafruit Feather (45,72 × 17,78)' },
];
const MOUNT_PATTERN_BY_ID = new Map(MOUNT_PATTERNS.map((x) => [x.id, x]));
function mountPatternDimSummary(e) {
  const f = (v) => String(v).replace('.', ',');
  if (e.layout === 'points') return `${f(e.spanX)} × ${f(e.spanY)} mm (asym.) · ${e.screw}`;
  if (e.layout === 'square') return `${f(e.pitch)} × ${f(e.pitch)} mm · Mitte Ø ${f(e.centerD)}`;
  if (e.layout === 'rect4') {
    return e.centerKind === 'none'
      ? `${f(e.pitchX)} × ${f(e.pitchY)} mm · ${e.screw}`
      : `${f(e.pitchX)} × ${f(e.pitchY)} mm · ${f(e.cutW)} × ${f(e.cutH)}`;
  }
  return `Abstand ${f(e.pitchX)} mm · ${f(e.cutW)} × ${f(e.cutH)}`;
}
const MOUNT_PATTERN_GROUPED_OPTIONS = MOUNT_PATTERN_GROUPS.map((g) => ({
  group: g.label,
  options: MOUNT_PATTERNS.filter((x) => x.group === g.id).map((x) => [x.id, `${x.label} (${mountPatternDimSummary(x)})`]),
}));
function mountPatternEntry(id) {
  return MOUNT_PATTERN_BY_ID.get(String(id || 'nema17')) || MOUNT_PATTERN_BY_ID.get('nema17') || MOUNT_PATTERNS[0];
}
function mountPatternMetrics(p = {}) {
  const e = mountPatternEntry(p.preset);
  const pf = printFitMm(p.printFit);
  const rawHoleD = Number(p.holeD);
  const holeD = p.holeD != null && p.holeD !== '' && isFinite(rawHoleD) && rawHoleD > 0 ? rawHoleD : e.holeD;
  const holeDEff = round(holeD + pf, 3);
  const centerKind = e.centerKind === 'circle' || e.centerKind === 'rect' ? e.centerKind : 'none';
  const includeCenter = centerKind === 'none' ? false : p.includeCenter !== false;
  let centerD = 0, centerDEff = 0, cutW = 0, cutH = 0, cutWEff = 0, cutHEff = 0;
  if (centerKind === 'circle') {
    const rawCD = Number(p.centerD);
    centerD = p.centerD != null && p.centerD !== '' && isFinite(rawCD) && rawCD >= 0 ? rawCD : e.centerD;
    centerDEff = centerD > 0 ? round(centerD + pf, 3) : 0;
  } else if (centerKind === 'rect') {
    const rawW = Number(p.cutW), rawH = Number(p.cutH);
    cutW = p.cutW != null && p.cutW !== '' && isFinite(rawW) && rawW > 0 ? rawW : e.cutW;
    cutH = p.cutH != null && p.cutH !== '' && isFinite(rawH) && rawH > 0 ? rawH : e.cutH;
    cutWEff = round(cutW + pf, 3);
    cutHEff = round(cutH + pf, 3);
  }
  let holes;
  if (e.layout === 'points' && Array.isArray(e.points)) {
    holes = e.points.map((q) => [q[0], q[1]]);
  } else if (e.layout === 'square') {
    const h = e.pitch / 2;
    holes = [[-h, -h], [h, -h], [h, h], [-h, h]];
  } else if (e.layout === 'rect4') {
    const hx = e.pitchX / 2, hy = e.pitchY / 2;
    holes = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  } else {
    const hx = e.pitchX / 2;
    holes = [[-hx, 0], [hx, 0]];
  }
  return {
    ...e,
    centerKind,
    holeD, holeDEff,
    includeCenter,
    centerD, centerDEff,
    cutW, cutH, cutWEff, cutHEff,
    holes,
    pf,
    u: Number(p.u) || 0,
    v: Number(p.v) || 0,
    angle: Number(p.angle) || 0,
    depth: Math.max(0, Number(p.depth) || 0),
  };
}

// Ausschnitte für Stecker, Buchsen, Schalter, Taster & kleine Displays (BI-18)
const PORT_CUTOUT_GROUPS = [
  { id: 'usb', label: 'USB & Daten' },
  { id: 'av', label: 'HDMI & Audio (Klinke)' },
  { id: 'net', label: 'Netzwerk & Karten (RJ45, SD)' },
  { id: 'switch', label: 'Schalter & Taster' },
  { id: 'display', label: 'Kleine Displays' },
];
const PORT_CUTOUTS = [
  { id: 'usbc', group: 'usb', label: 'USB-C (Buchse)', shape: 'slot', w: 9.0, h: 3.5, source: 'USB Type-C Spec (IEC 62680-1-3)' },
  { id: 'usbcPlug', group: 'usb', label: 'USB-C (Stecker-Durchgang)', shape: 'rect', w: 13.0, h: 7.0, r: 1.5, source: 'USB Type-C Spec (Stecker-Kappe)' },
  { id: 'usba', group: 'usb', label: 'USB-A (Buchse)', shape: 'rect', w: 14.0, h: 6.5, r: 0, source: 'USB 2.0 / 3.0 Spec Typ A' },
  { id: 'microUsb', group: 'usb', label: 'Micro-USB (Typ B)', shape: 'rect', w: 8.2, h: 3.3, r: 0.6, source: 'USB 2.0 Micro-B Spec' },
  { id: 'hdmi', group: 'av', label: 'HDMI (Typ A, Standard)', shape: 'hdmi', w: 15.0, h: 5.5, chamfer: 1.5, source: 'HDMI Spec Typ A' },
  { id: 'miniHdmi', group: 'av', label: 'Mini-HDMI (Typ C)', shape: 'hdmi', w: 11.4, h: 3.4, chamfer: 0.9, source: 'HDMI Spec Typ C' },
  { id: 'microHdmi', group: 'av', label: 'Micro-HDMI (Typ D)', shape: 'hdmi', w: 7.2, h: 3.4, chamfer: 0.8, source: 'HDMI Spec Typ D' },
  { id: 'jack35', group: 'av', label: 'Klinke 3,5 mm (Einbau)', shape: 'circle', d: 6.3, source: 'IEC 60603-11 / M6 Einbaubuchse' },
  { id: 'jack635', group: 'av', label: 'Klinke 6,35 mm (1/4" Einbau)', shape: 'circle', d: 9.8, source: 'IEC 60603-11 / 3/8"-Buchse' },
  { id: 'rj45', group: 'net', label: 'RJ45 (Ethernet / LAN)', shape: 'rect', w: 16.2, h: 13.8, r: 0, source: 'IEC 60603-7 / Amphenol RJHSE' },
  { id: 'sd', group: 'net', label: 'SD-Karte (Standard)', shape: 'rect', w: 25.0, h: 2.8, r: 0, source: 'SD Card Spec (24 × 2,1 mm)' },
  { id: 'microSd', group: 'net', label: 'microSD-Karte', shape: 'rect', w: 12.5, h: 2.0, r: 0, source: 'SD Card Spec (11 × 1,0 mm)' },
  { id: 'rockerSmall', group: 'switch', label: 'Wippschalter klein (KCD1)', shape: 'rect', w: 19.2, h: 13.0, r: 0, source: 'KCD1-101 Datenblatt' },
  { id: 'rockerStd', group: 'switch', label: 'Wippschalter groß (KCD4)', shape: 'rect', w: 28.5, h: 22.0, r: 0, source: 'KCD4 / Marquardt 1830' },
  { id: 'toggle6', group: 'switch', label: 'Kippschalter M6 (Mini)', shape: 'circle', d: 6.3, source: 'MTS-102 / M6-Buchse' },
  { id: 'toggle12', group: 'switch', label: 'Kippschalter M12 (Standard)', shape: 'circle', d: 12.2, source: 'DIN / M12-Kippschalter' },
  { id: 'button12', group: 'switch', label: 'Drucktaster Ø 12 mm', shape: 'circle', d: 12.2, source: 'PBS-33B / Ø 12 mm Einbautaster' },
  { id: 'button16', group: 'switch', label: 'Drucktaster Ø 16 mm', shape: 'circle', d: 16.2, source: 'M16 Einbautaster' },
  { id: 'tact6', group: 'switch', label: 'Kurzhubtaster 6×6 mm (Stößel)', shape: 'circle', d: 4.0, source: 'Omron B3F (6×6 mm Taster)' },
  { id: 'oled096', group: 'display', label: 'OLED 0,96" (128×64)', shape: 'rect', w: 24.5, h: 13.5, r: 0.5, pitchX: 23.0, pitchY: 23.0, holeD: 2.2, screw: 'M2', source: 'SSD1306 0,96" I2C-Modul' },
  { id: 'oled130', group: 'display', label: 'OLED 1,3" (128×64)', shape: 'rect', w: 31.5, h: 17.5, r: 0.5, pitchX: 30.5, pitchY: 28.5, holeD: 2.2, screw: 'M2', source: 'SH1106 1,3" I2C-Modul' },
  { id: 'lcd1602', group: 'display', label: 'LCD 1602 (16×2)', shape: 'rect', w: 71.5, h: 24.5, r: 0, pitchX: 75.0, pitchY: 31.0, holeD: 3.2, screw: 'M3', source: 'HD44780 1602 Datenblatt' },
  { id: 'lcd2004', group: 'display', label: 'LCD 2004 (20×4)', shape: 'rect', w: 77.0, h: 26.5, r: 0, pitchX: 93.0, pitchY: 55.0, holeD: 3.2, screw: 'M3', source: 'HD44780 2004 Datenblatt' },
];
const PORT_CUTOUT_BY_ID = new Map(PORT_CUTOUTS.map((x) => [x.id, x]));
function portCutoutDimSummary(e) {
  const f = (v) => String(v).replace('.', ',');
  let base;
  if (e.shape === 'circle') base = `Ø ${f(e.d)} mm`;
  else if (e.shape === 'slot') base = `${f(e.w)} × ${f(e.h)} mm · rund`;
  else if (e.shape === 'hdmi') base = `${f(e.w)} × ${f(e.h)} mm · Fase`;
  else base = `${f(e.w)} × ${f(e.h)} mm`;
  return e.pitchX > 0 && e.pitchY > 0 ? `${base} · 4× ${e.screw || 'M2'}` : base;
}
const PORT_CUTOUT_GROUPED_OPTIONS = PORT_CUTOUT_GROUPS.map((g) => ({
  group: g.label,
  options: PORT_CUTOUTS.filter((x) => x.group === g.id).map((x) => [x.id, `${x.label} (${portCutoutDimSummary(x)})`]),
}));
function portCutoutEntry(id) {
  return PORT_CUTOUT_BY_ID.get(String(id || 'usbc')) || PORT_CUTOUT_BY_ID.get('usbc') || PORT_CUTOUTS[0];
}
function portCutoutMetrics(p = {}) {
  const e = portCutoutEntry(p.preset);
  const pf = printFitMm(p.printFit);
  const shape = e.shape;
  let d = 0, dEff = 0, w = 0, h = 0, wEff = 0, hEff = 0, r = 0, rEff = 0, chamfer = 0, chamferEff = 0;
  if (shape === 'circle') {
    const rawD = Number(p.d);
    d = p.d != null && p.d !== '' && isFinite(rawD) && rawD > 0 ? rawD : e.d;
    dEff = round(d + pf, 3);
  } else {
    const rawW = Number(p.w), rawH = Number(p.h);
    w = p.w != null && p.w !== '' && isFinite(rawW) && rawW > 0 ? rawW : e.w;
    h = p.h != null && p.h !== '' && isFinite(rawH) && rawH > 0 ? rawH : e.h;
    wEff = round(w + pf, 3);
    hEff = round(h + pf, 3);
    if (shape === 'slot') {
      r = round(Math.min(w, h) / 2, 4);
      rEff = round(Math.min(wEff, hEff) / 2, 4);
    } else if (shape === 'rect') {
      const rawR = Number(p.r);
      r = Math.max(0, p.r != null && p.r !== '' && isFinite(rawR) ? rawR : (e.r || 0));
      rEff = r > 0.05 ? round(Math.min(r, Math.min(wEff, hEff) / 2 - 0.02), 4) : 0;
    } else if (shape === 'hdmi') {
      const rawC = Number(p.chamfer);
      chamfer = Math.max(0, p.chamfer != null && p.chamfer !== '' && isFinite(rawC) ? rawC : (e.chamfer || 1.5));
      chamferEff = chamfer > 0.05 ? round(Math.min(chamfer, wEff * 0.35, hEff * 0.65), 4) : 0;
    }
  }
  const hasHoles = !!(e.pitchX > 0 && e.pitchY > 0);
  const includeHoles = hasHoles && p.includeHoles !== false;
  let holeD = 0, holeDEff = 0, holes = [];
  if (hasHoles) {
    const rawHD = Number(p.holeD);
    holeD = p.holeD != null && p.holeD !== '' && isFinite(rawHD) && rawHD > 0 ? rawHD : e.holeD;
    holeDEff = round(holeD + pf, 3);
    const hx = e.pitchX / 2, hy = e.pitchY / 2;
    holes = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  }
  return {
    ...e,
    d, dEff,
    w, h, wEff, hEff,
    r, rEff,
    chamfer, chamferEff,
    hasHoles, includeHoles,
    holeD, holeDEff, holes,
    pf,
    u: Number(p.u) || 0,
    v: Number(p.v) || 0,
    angle: Number(p.angle) || 0,
    depth: Math.max(0, Number(p.depth) || 0),
  };
}

// Vorlagen & Kennwerte für Magnet-Taschen (BI-15)
const MAGNET_PRESETS = [
  { id: 'd5x2', group: 'round', label: 'Scheibe Ø 5 × 2 mm', shape: 'round', d: 5, h: 2 },
  { id: 'd6x2', group: 'round', label: 'Scheibe Ø 6 × 2 mm', shape: 'round', d: 6, h: 2 },
  { id: 'd6x3', group: 'round', label: 'Scheibe Ø 6 × 3 mm', shape: 'round', d: 6, h: 3 },
  { id: 'd8x2', group: 'round', label: 'Scheibe Ø 8 × 2 mm', shape: 'round', d: 8, h: 2 },
  { id: 'd8x3', group: 'round', label: 'Scheibe Ø 8 × 3 mm', shape: 'round', d: 8, h: 3 },
  { id: 'd10x2', group: 'round', label: 'Scheibe Ø 10 × 2 mm', shape: 'round', d: 10, h: 2 },
  { id: 'd10x3', group: 'round', label: 'Scheibe Ø 10 × 3 mm (Standard)', shape: 'round', d: 10, h: 3 },
  { id: 'd10x5', group: 'round', label: 'Scheibe Ø 10 × 5 mm', shape: 'round', d: 10, h: 5 },
  { id: 'd12x3', group: 'round', label: 'Scheibe Ø 12 × 3 mm', shape: 'round', d: 12, h: 3 },
  { id: 'd15x3', group: 'round', label: 'Scheibe Ø 15 × 3 mm', shape: 'round', d: 15, h: 3 },
  { id: 'd20x3', group: 'round', label: 'Scheibe Ø 20 × 3 mm', shape: 'round', d: 20, h: 3 },
  { id: 'r10x5x2', group: 'rect', label: 'Quader 10 × 5 × 2 mm', shape: 'rect', w: 10, l: 5, h: 2 },
  { id: 'r15x5x3', group: 'rect', label: 'Quader 15 × 5 × 3 mm', shape: 'rect', w: 15, l: 5, h: 3 },
  { id: 'r20x10x2', group: 'rect', label: 'Quader 20 × 10 × 2 mm', shape: 'rect', w: 20, l: 10, h: 2 },
  { id: 'r20x10x3', group: 'rect', label: 'Quader 20 × 10 × 3 mm', shape: 'rect', w: 20, l: 10, h: 3 },
  { id: 'r30x10x3', group: 'rect', label: 'Quader 30 × 10 × 3 mm', shape: 'rect', w: 30, l: 10, h: 3 },
  { id: 'customRound', group: 'custom', label: 'Eigene Größe (rund)', shape: 'round', d: 10, h: 3 },
  { id: 'customRect', group: 'custom', label: 'Eigene Größe (eckig)', shape: 'rect', w: 20, l: 10, h: 3 },
];
const MAGNET_PRESET_GROUPS = [
  ['round', 'Scheibenmagnete (rund)'],
  ['rect', 'Quadermagnete (eckig)'],
  ['custom', 'Eigene Größe'],
];
const MAGNET_PRESET_BY_ID = new Map(MAGNET_PRESETS.map((x) => [x.id, x]));
const MAGNET_PRESET_GROUPED_OPTIONS = MAGNET_PRESET_GROUPS.map(([gid, gname]) => ({
  group: gname,
  options: MAGNET_PRESETS.filter((x) => x.group === gid).map((x) => [x.id, x.label]),
}));
function magnetPresetEntry(id) {
  return MAGNET_PRESET_BY_ID.get(String(id || '')) || MAGNET_PRESET_BY_ID.get('d10x3') || MAGNET_PRESETS[0];
}
function magnetPocketMetrics(p = {}) {
  const e = magnetPresetEntry(p.preset);
  const shape = e.shape === 'rect' ? 'rect' : 'round';
  const hasClear = p.clear != null && p.clear !== '' && isFinite(Number(p.clear));
  const clear = hasClear ? Math.max(0, Number(p.clear)) : 0.1;
  const pf = printFitMm(p.printFit);
  const rawH = Number(p.h);
  const h = Math.max(0.3, p.h != null && p.h !== '' && isFinite(rawH) && rawH > 0 ? rawH : e.h);
  let d = 0, w = 0, l = 0, r = 0;
  if (shape === 'round') {
    const rawD = Number(p.d);
    d = Math.max(1, p.d != null && p.d !== '' && isFinite(rawD) && rawD > 0 ? rawD : e.d);
  } else {
    const rawW = Number(p.w), rawL = Number(p.l), rawR = Number(p.r);
    w = Math.max(1, p.w != null && p.w !== '' && isFinite(rawW) && rawW > 0 ? rawW : e.w);
    l = Math.max(1, p.l != null && p.l !== '' && isFinite(rawL) && rawL > 0 ? rawL : e.l);
    r = Math.max(0, p.r != null && p.r !== '' && isFinite(rawR) ? Math.min(rawR, Math.min(w, l) / 2 - 0.05) : 0);
  }
  const embed = Math.max(0, Number(p.embed) || 0);
  const chamfer = embed > 1e-4 ? 0 : Math.max(0, Number(p.chamfer) || 0);
  const dEff = shape === 'round' ? round(d + 2 * clear + pf, 3) : 0;
  const wEff = shape === 'rect' ? round(w + 2 * clear + pf, 3) : 0;
  const lEff = shape === 'rect' ? round(l + 2 * clear + pf, 3) : 0;
  const depthEff = round(h + clear, 3);
  return {
    id: e.id,
    label: e.label,
    group: e.group,
    shape,
    d, w, l, h, r,
    clear, pf,
    dEff, wEff, lEff, depthEff,
    chamfer, embed,
    u: Number(p.u) || 0,
    v: Number(p.v) || 0,
    angle: Number(p.angle) || 0,
  };
}

// kleine Vorschaubilder der Grundkörper (isometrisch)
function primitiveSVG(kind) {
  const A = 'var(--accent)', ink = 'var(--ink)';
  const f = (op) => `fill="${A}" fill-opacity="${op}"`;
  const st = `stroke="${ink}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round"`;
  const W = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
  switch (kind) {
    case 'box': return W(`<path d="M24 8 40 16 24 24 8 16z" ${f(0.35)} ${st}/><path d="M8 16 24 24v17L8 33z" ${f(0.62)} ${st}/><path d="M40 16 24 24v17l16-8z" ${f(0.85)} ${st}/>`);
    case 'cylinder': return W(`<path d="M9 13v21c0 3.3 6.7 6 15 6s15-2.7 15-6V13" ${f(0.7)} ${st}/><ellipse cx="24" cy="13" rx="15" ry="6" ${f(0.35)} ${st}/>`);
    case 'sphere': return W(`<defs><radialGradient id="gs" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".45" stop-color="${A}" stop-opacity=".55"/><stop offset="1" stop-color="${A}" stop-opacity=".95"/></radialGradient></defs><circle cx="24" cy="24" r="16" fill="url(#gs)" ${st}/>`);
    case 'hemisphere': return W(`<path d="M8 30a16 16 0 0 1 32 0" ${f(0.7)} ${st}/><ellipse cx="24" cy="30" rx="16" ry="5.5" ${f(0.4)} ${st}/>`);
    case 'cone': return W(`<path d="M24 6 9 34c0 3.3 6.7 6 15 6s15-2.7 15-6z" ${f(0.7)} ${st}/><path d="M9 34c0-3.3 6.7-6 15-6s15 2.7 15 6" fill="none" ${st} stroke-dasharray="2 2"/>`);
    case 'pyramid': return W(`<path d="M24 7 8 30l16 9z" ${f(0.62)} ${st}/><path d="M24 7 40 30l-16 9z" ${f(0.85)} ${st}/>`);
    case 'wedge': return W(`<path d="M8 20 24 12v10L8 30z" ${f(0.35)} ${st}/><path d="M8 20v18l16 8V22z" ${f(0.62)} ${st}/><path d="M24 22v24l16-8z" ${f(0.85)} ${st}/><path d="M24 12l16 26" ${st} fill="none"/>`);
    case 'tube': return W(`<path d="M9 13v21c0 3.3 6.7 6 15 6s15-2.7 15-6V13" ${f(0.7)} ${st}/><ellipse cx="24" cy="13" rx="15" ry="6" ${f(0.35)} ${st}/><ellipse cx="24" cy="13" rx="9" ry="3.6" fill="var(--surface)" ${st}/>`);
    case 'torus': return W(`<ellipse cx="24" cy="25" rx="18" ry="11" ${f(0.75)} ${st}/><ellipse cx="24" cy="23" rx="8.5" ry="4.2" fill="var(--surface)" ${st}/>`);
    case 'prism': return W(`<path d="M15 10h18l6 5-6 5H15l-6-5z" ${f(0.35)} ${st}/><path d="M9 15v18l6 5V20z" ${f(0.55)} ${st}/><path d="M15 20v18h18V20z" ${f(0.72)} ${st}/><path d="M33 20v18l6-5V15z" ${f(0.88)} ${st}/>`);
  }
  return W(`<rect x="10" y="10" width="28" height="28" rx="4" ${f(0.6)} ${st}/>`);
}
function partSVG(def) {
  const col = def.role === 'hole' ? 'var(--hole)' : 'var(--accent)';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[def.icon] || IC.parts}</svg>`;
}

// Parametrischer Gehäuse-Generator (BI-20): Kasten mit Deckel, Lippe/Nut und 4 Schraubdomen
function enclosureMetrics(opts = {}) {
  const numOpt = (v, def) => {
    if (v === null || v === undefined || v === '') return def;
    const n = Number(v);
    return isFinite(n) ? n : def;
  };
  const innerW = round(numOpt(opts.innerW, 80), 3);
  const innerD = round(numOpt(opts.innerD, 50), 3);
  const innerH = round(numOpt(opts.innerH, 30), 3);
  const wall = round(numOpt(opts.wall, 2), 3);
  const rawLidH = numOpt(opts.lidH, 0);
  const lidH = rawLidH > 0 ? round(rawLidH, 3) : wall;
  const withLip = opts.withLip !== false && opts.withLip !== 'nein';
  const clearance = round(Math.max(0, numOpt(opts.clearance, 0.2)), 3);
  const rawLipH = numOpt(opts.lipH, 2);
  const lipH = round(Math.max(0.5, Math.min(Math.max(0.5, innerH - 1.5), rawLipH)), 3);
  const rawLipW = numOpt(opts.lipW, 0);
  const autoLipW = round(Math.max(0.4, Math.min(wall * 0.5, wall - clearance - 0.5)), 3);
  const lipW = rawLipW > 0 ? round(rawLipW, 3) : autoLipW;
  const withBosses = opts.withBosses !== false && opts.withBosses !== 'nein';
  const bossOuterD = round(numOpt(opts.bossOuterD, 7), 3);
  const bossHoleD = round(numOpt(opts.bossHoleD, 3), 3);
  const rawBossH = numOpt(opts.bossH, 0);
  const bossH = rawBossH > 0 ? round(Math.min(innerH, rawBossH), 3) : innerH;
  const bossHoleDepth = round(Math.max(0, numOpt(opts.bossHoleDepth, 0)), 3);

  const outerW = round(innerW + 2 * wall, 3);
  const outerD = round(innerD + 2 * wall, 3);
  const boxH = round(innerH + wall, 3);
  const totalH = round(boxH + lidH, 3);
  const bossInset = round(bossOuterD / 2 + 0.5, 3);
  const bossX = round(innerW / 2 - bossInset, 3);
  const bossY = round(innerD / 2 - bossInset, 3);

  // basisFromNormal([0, 0, 1]) liefert bx = [0, -1, 0], by = [1, 0, 0] -> u = -y, v = x
  const corners = [
    { idx: 1, x: -bossX, y: -bossY, u: bossY, v: -bossX },
    { idx: 2, x: bossX, y: -bossY, u: bossY, v: bossX },
    { idx: 3, x: bossX, y: bossY, u: -bossY, v: bossX },
    { idx: 4, x: -bossX, y: bossY, u: -bossY, v: -bossX },
  ];

  let error = '';
  if (!(innerW >= 12 && innerD >= 12 && innerH >= 6)) {
    error = 'Die Innenmaße müssen mindestens 12 × 12 × 6 mm betragen.';
  } else if (!(wall >= 0.8)) {
    error = 'Die Wandstärke muss mindestens 0,8 mm betragen.';
  } else if (!(lidH >= 0.8)) {
    error = 'Die Deckelstärke muss mindestens 0,8 mm betragen.';
  } else if (withLip && !(lipW >= 0.3 && lipW + clearance <= wall - 0.2)) {
    error = 'Die Wand ist zu dünn für diese Lippenbreite plus Spiel.';
  } else if (withBosses && !(bossOuterD >= 2.5)) {
    error = 'Der Schraubdom-Durchmesser muss mindestens 2,5 mm betragen.';
  } else if (withBosses && !(bossHoleD >= 0 && bossHoleD <= bossOuterD - 0.6)) {
    error = 'Das Domloch muss mindestens 0,6 mm kleiner als der Außendurchmesser sein.';
  } else if (withBosses && !(bossX > bossOuterD / 2 + 0.5 && bossY > bossOuterD / 2 + 0.5)) {
    error = 'Der Innenraum ist zu klein für vier Schraubdome in den Ecken.';
  }

  return {
    ok: !error,
    error,
    innerW, innerD, innerH, wall, lidH,
    outerW, outerD, boxH, totalH,
    withLip, lipH, lipW, clearance,
    withBosses, bossOuterD, bossHoleD, bossH, bossHoleDepth,
    bossInset, bossX, bossY, corners,
  };
}

const Enclosure = (() => {
  function insertAtMarker(doc, step) {
    const at = doc.rollback != null ? clamp(doc.rollback, 0, doc.items.length) : doc.items.length;
    doc.items.splice(at, 0, step);
    if (doc.rollback != null) doc.rollback = at + 1;
  }

  function create(opts = {}) {
    if (typeof App !== 'undefined' && App.ctx) {
      UI.toast(T('toast.enclosureMainOnly'), { icon: 'info' });
      return null;
    }
    const m = enclosureMetrics(opts);
    if (!m.ok) {
      UI.toast(m.error, { icon: 'warn', kind: 'bad' });
      return null;
    }

    let box = null, lid = null, lip = null;
    const bosses = [];
    const createdIds = [];
    App.change(T('undo.enclosure'), (doc) => {
      const mat = (doc.settings && doc.settings.material) || 'PLA';
      box = Model.newItem('box', { w: m.outerW, d: m.outerD, h: m.boxH }, {
        name: 'Kasten',
        role: 'solid',
        color: '#2f9e91',
        mat,
      });
      box.finishes = [{
        id: uid('f'),
        type: 'shell',
        r: m.wall,
        dir: 'in',
        faces: [{ c: [0, 0, m.boxH], n: [0, 0, 1], t: 'PLANE' }],
      }];
      lid = Model.newItem('box', { w: m.outerW, d: m.outerD, h: m.lidH }, {
        name: 'Deckel',
        role: 'solid',
        color: '#e8833a',
        mat,
      });
      lid.t.z = m.boxH;
      insertAtMarker(doc, box);
      insertAtMarker(doc, lid);
      createdIds.push(box.id, lid.id);

      if (m.withLip) {
        lip = Model.newItem('lipGroove', {
          lipTarget: lid.id,
          grooveTarget: box.id,
          face: { c: [0, 0, 0], n: [0, 0, -1], t: 'PLANE' },
          edge: null,
          side: 'inner',
          height: m.lipH,
          width: m.lipW,
          clearance: m.clearance,
        }, {
          name: 'Deckel-Lippe & Nut',
          color: lid.color,
          role: 'solid',
          mat,
        });
        insertAtMarker(doc, lip);
        createdIds.push(lip.id);
      }

      if (m.withBosses) {
        for (const c of m.corners) {
          const b = Model.newItem('boss', {
            target: box.id,
            face: { c: [0, 0, m.wall], n: [0, 0, 1], t: 'PLANE' },
            origin: [0, 0, m.wall],
            outerD: m.bossOuterD,
            holeD: m.bossHoleD,
            height: m.bossH,
            holeDepth: m.bossHoleDepth,
            ribs: 0,
            ribT: 1.5,
            ribL: 4,
            ribH: 0,
            ribAngle: 0,
            u: c.u,
            v: c.v,
          }, {
            name: `Schraubdom ${c.idx}`,
            color: box.color,
            role: 'solid',
            mat,
          });
          insertAtMarker(doc, b);
          bosses.push(b);
          createdIds.push(b.id);
        }
      }
    });

    if (box) {
      App.select([box.id]);
      UI.toast(T('toast.enclosureAdded', {
        outW: fmt(m.outerW, 1),
        outD: fmt(m.outerD, 1),
        totalH: fmt(m.totalH, 1),
      }), { icon: 'check' });
    }
    return { box, lid, lip, bosses, metrics: m, ids: createdIds };
  }

  function openDialog(initial = {}) {
    if (typeof App !== 'undefined' && App.ctx) {
      UI.toast(T('toast.enclosureMainOnly'), { icon: 'info' });
      return null;
    }
    const def = enclosureMetrics(initial);
    const body = h('div', { id: 'enclosure-gen-dlg', class: 'fields' });

    const mkNum = (id, label, val, unit = 'mm') => {
      const wrap = h('div', { class: 'field' });
      wrap.append(h('label', { for: id }, label));
      const box = h('div', { class: 'inp' });
      const inp = h('input', { id, type: 'text', inputmode: 'decimal', value: val, autocomplete: 'off', spellcheck: 'false' });
      box.append(inp);
      if (unit) box.append(h('span', { class: 'unit' }, unit));
      wrap.append(box);
      return { wrap, inp };
    };
    const mkChk = (id, label, checked) => {
      const lbl = h('label', { class: 'chk', for: id, style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' } });
      const inp = h('input', { id, type: 'checkbox' });
      inp.checked = !!checked;
      lbl.append(inp, h('span', null, label));
      return { wrap: lbl, inp };
    };

    const fW = mkNum('enc-inner-w', T('dlg.enclosure.innerW'), fmt(def.innerW, 2));
    const fD = mkNum('enc-inner-d', T('dlg.enclosure.innerD'), fmt(def.innerD, 2));
    const fH = mkNum('enc-inner-h', T('dlg.enclosure.innerH'), fmt(def.innerH, 2));
    const fWall = mkNum('enc-wall', T('dlg.enclosure.wall'), fmt(def.wall, 2));
    const fLidH = mkNum('enc-lid-h', T('dlg.enclosure.lidH'), initial.lidH > 0 ? fmt(def.lidH, 2) : '0');

    const cLip = mkChk('enc-with-lip', T('dlg.enclosure.withLip'), def.withLip);
    const fLipH = mkNum('enc-lip-h', T('dlg.enclosure.lipH'), fmt(def.lipH, 2));
    const fLipW = mkNum('enc-lip-w', T('dlg.enclosure.lipW'), initial.lipW > 0 ? fmt(def.lipW, 2) : '0');
    const fClear = mkNum('enc-clear', T('dlg.enclosure.clearance'), fmt(def.clearance, 2));

    const cBoss = mkChk('enc-with-bosses', T('dlg.enclosure.withBosses'), def.withBosses);
    const fBossOD = mkNum('enc-boss-od', T('dlg.enclosure.bossOuterD'), fmt(def.bossOuterD, 2));
    const fBossHD = mkNum('enc-boss-hd', T('dlg.enclosure.bossHoleD'), fmt(def.bossHoleD, 2));
    const fBossH = mkNum('enc-boss-h', T('dlg.enclosure.bossH'), initial.bossH > 0 ? fmt(def.bossH, 2) : '0');

    const summary = h('div', { id: 'enc-preview-summary', class: 'hint-box', style: { gridColumn: '1 / -1' } });
    body.append(
      fW.wrap, fD.wrap, fH.wrap, fWall.wrap, fLidH.wrap,
      cLip.wrap, fLipH.wrap, fLipW.wrap, fClear.wrap,
      cBoss.wrap, fBossOD.wrap, fBossHD.wrap, fBossH.wrap,
      summary,
    );

    const parseRaw = (el, fallback) => {
      const s = String(el.value || '').trim().replace(',', '.');
      if (!s) return fallback;
      const n = Number(s);
      return isFinite(n) ? n : fallback;
    };

    const readValues = () => ({
      innerW: parseRaw(fW.inp, 80),
      innerD: parseRaw(fD.inp, 50),
      innerH: parseRaw(fH.inp, 30),
      wall: parseRaw(fWall.inp, 2),
      lidH: parseRaw(fLidH.inp, 0),
      withLip: !!cLip.inp.checked,
      lipH: parseRaw(fLipH.inp, 2),
      lipW: parseRaw(fLipW.inp, 0),
      clearance: parseRaw(fClear.inp, 0.2),
      withBosses: !!cBoss.inp.checked,
      bossOuterD: parseRaw(fBossOD.inp, 7),
      bossHoleD: parseRaw(fBossHD.inp, 3),
      bossH: parseRaw(fBossH.inp, 0),
    });

    const syncUI = () => {
      const lipOn = !!cLip.inp.checked;
      const bossOn = !!cBoss.inp.checked;
      for (const el of [fLipH, fLipW, fClear]) {
        el.inp.disabled = !lipOn;
        el.wrap.style.opacity = lipOn ? '' : '0.45';
      }
      for (const el of [fBossOD, fBossHD, fBossH]) {
        el.inp.disabled = !bossOn;
        el.wrap.style.opacity = bossOn ? '' : '0.45';
      }
      const m = enclosureMetrics(readValues());
      if (!m.ok) {
        summary.innerHTML = `<span style="color:var(--bad)">${esc(m.error)}</span>`;
        return m;
      }
      const lipInfo = m.withLip ? ` · Lippe ${fmt(m.lipW, 2)}×${fmt(m.lipH, 2)} mm (Spiel ${fmt(m.clearance, 2)})` : '';
      const bossInfo = m.withBosses ? ` · 4× Dom Ø ${fmt(m.bossOuterD, 1)} / Loch Ø ${fmt(m.bossHoleD, 1)} mm` : '';
      summary.innerHTML = T('dlg.enclosure.summary', {
        outW: fmt(m.outerW, 1),
        outD: fmt(m.outerD, 1),
        totalH: fmt(m.totalH, 1),
        boxH: fmt(m.boxH, 1),
        lidH: fmt(m.lidH, 1),
        inW: fmt(m.innerW, 1),
        inD: fmt(m.innerD, 1),
        inH: fmt(m.innerH, 1),
        lipInfo,
        bossInfo,
      });
      return m;
    };

    for (const el of [fW.inp, fD.inp, fH.inp, fWall.inp, fLidH.inp, fLipH.inp, fLipW.inp, fClear.inp, fBossOD.inp, fBossHD.inp, fBossH.inp]) {
      el.addEventListener('input', syncUI);
      el.addEventListener('change', syncUI);
    }
    cLip.inp.addEventListener('change', syncUI);
    cBoss.inp.addEventListener('change', syncUI);
    syncUI();

    return UI.modal({
      title: T('dlg.enclosure.title'),
      body,
      actions: [
        { label: T('common.cancel'), value: null },
        {
          id: 'enc-gen-create',
          label: T('dlg.enclosure.create'),
          primary: true,
          help: 'enclosureGen',
          run: () => {
            const vals = readValues();
            const m = enclosureMetrics(vals);
            if (!m.ok) {
              syncUI();
              UI.toast(m.error, { icon: 'warn', kind: 'bad' });
              return false;
            }
            return !!create(vals);
          },
        },
      ],
    });
  }

  return { metrics: enclosureMetrics, create, openDialog };
})();

