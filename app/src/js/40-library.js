// ================= Bauteil-Bibliothek (Definitionen für die Oberfläche) =================
const SIZES = ['M1.6', 'M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'];
const THREAD_DATA = /*JSON:gewinde.json*/null;
const PIN_DATA = /*JSON:passstifte.json*/null;
const KEY_DATA = /*JSON:passfedern.json*/null;
const BEARING_DATA = /*JSON:lager.json*/null;
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
const LIB = [
  { lib: 'screwHole', label: 'Schraubenloch', role: 'hole', icon: 'bolt', desc: 'Durchgangsloch mit Senkung für Schrauben', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: THREAD_GROUPED_OPTIONS, def: 'M3' },
    { k: 'head', label: 'Kopf', type: 'select', options: [['countersunk', 'Senkkopf'], ['counterbore', 'Zylinderkopf'], ['none', 'ohne Senkung']], def: 'countersunk' },
    { k: 'fit', label: 'Loch', type: 'select', options: [['medium', 'Mittel (Standard)'], ['fine', 'Eng (genau)'], ['coarse', 'Weit (mit Spiel)'], ['tap', 'Kernloch für Gewinde']], def: 'medium' },
    { k: 'length', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'nutTrap', label: 'Mutternfalle', role: 'hole', icon: 'hex', desc: 'Sechskant-Tasche für eine Mutter, mit Schraubenloch', params: [
    { k: 'size', label: 'Mutter', type: 'select', options: SIZES, def: 'M3' },
    { k: 'depth', label: 'Taschentiefe', type: 'num', def: null, auto: true },
    { k: 'length', label: 'Lochtiefe', type: 'num', def: 12 },
  ] },
  { lib: 'threadHole', label: 'Gewindeloch (gedruckt)', role: 'hole', icon: 'target', desc: 'Echtes Innengewinde zum Drucken, mit etwas Spiel', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], def: 'M6' },
    { k: 'length', label: 'Tiefe', type: 'num', def: 10 },
    { k: 'pitch', label: 'Steigung', type: 'num', def: null, auto: true },
    { k: 'clear', label: 'Spiel', type: 'num', def: 0.3 },
  ] },
  { lib: 'threadRod', label: 'Gewindebolzen', role: 'solid', icon: 'target', desc: 'Außengewinde (ISO metrisch) – z. B. für gedruckte Schraubdeckel', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'], def: 'M6' },
    { k: 'length', label: 'Länge', type: 'num', def: 12 },
    { k: 'pitch', label: 'Steigung', type: 'num', def: null, auto: true },
  ] },
  { lib: 'insert', label: 'Gewindeeinsatz', role: 'hole', icon: 'target', desc: 'Loch für einen Einschmelz-Gewindeeinsatz', params: [
    { k: 'size', label: 'Gewinde', type: 'select', options: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8'], def: 'M3' },
    { k: 'depth', label: 'Tiefe', type: 'num', def: null, auto: true },
  ] },
  { lib: 'blindHole', label: 'Sackloch', role: 'hole', icon: 'holeWizard', desc: 'Bohrung mit fester Tiefe und 118°-Bohrspitze (Standard-Spiralbohrer)', params: [
    { k: 'd', label: 'Durchmesser', type: 'num', def: 5 },
    { k: 'depth', label: 'Tiefe (Zylinder)', type: 'num', def: 10 },
    { k: 'tipAngle', label: 'Bohrspitze', type: 'select', options: [['118', '118° (Spiralbohrer)'], ['140', '140° (Hartmetall)'], ['180', 'Flacher Boden']], def: 118 },
  ] },
  { lib: 'fitHole', label: 'Passbohrung H7', role: 'hole', icon: 'target', desc: 'Präzisionsbohrung auf genaues Nennmaß mit Toleranz-Hinweis nach ISO 286 H7', params: [
    { k: 'd', label: 'Nenn-Ø', type: 'num', def: 6 },
    { k: 'depth', label: 'Tiefe', type: 'num', def: 10 },
  ] },
  { lib: 'centerHole', label: 'Zentrierbohrung', role: 'hole', icon: 'holeWizard', desc: 'Zentrierbohrung nach DIN 332 Form A (60°-Kegel + Führungsbohrung)', params: [
    { k: 'size', label: 'Größe (DIN 332 A)', type: 'select', options: CENTER_SIZES, def: 'A2.5' },
  ] },
  { lib: 'stdScrew', label: 'Schraube (Norm)', role: 'solid', icon: 'bolt', mat: 'V2A Edelstahl', std: true, desc: 'Echte Schraube mit Innensechskant: Zylinderkopf ISO 4762 oder Senkkopf ISO 10642 – Gewinde nur angedeutet', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
    { k: 'head', label: 'Kopf', type: 'select', options: [['zyl', 'Zylinderkopf (ISO 4762)'], ['senk', 'Senkkopf (ISO 10642, ab M3)']], def: 'zyl' },
    { k: 'length', label: 'Länge', type: 'num', def: 10 },
  ] },
  { lib: 'stdNut', label: 'Mutter (Norm)', role: 'solid', icon: 'hex', mat: 'V2A Edelstahl', std: true, desc: 'Sechskantmutter ISO 4032', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
  ] },
  { lib: 'stdWasher', label: 'Scheibe (Norm)', role: 'solid', icon: 'circle', mat: 'V2A Edelstahl', std: true, desc: 'Unterlegscheibe ISO 7089', params: [
    { k: 'size', label: 'Größe', type: 'select', options: SIZES, def: 'M3' },
  ] },
  { lib: 'stdPin', label: 'Zylinderstift (ISO 2338)', role: 'solid', icon: 'pin', mat: 'V2A Edelstahl', std: true, desc: 'Zylinderstift nach ISO 2338 mit 15°-Endfasen (m6 oder h8)', params: [
    { k: 'size', label: 'Durchmesser', type: 'select', options: PIN_OPTIONS, def: '6' },
    { k: 'length', label: 'Länge', type: 'num', def: 20 },
    { k: 'tol', label: 'Toleranz', type: 'select', options: [['m6', 'm6 (Form A, Standard)'], ['h8', 'h8 (Form B)']], def: 'm6' },
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
  { lib: 'stdBearing', label: 'Kugellager (Norm)', role: 'solid', icon: 'bearing', mat: 'V2A Edelstahl', std: true, desc: 'Rillenkugellager nach DIN 625-1 / ISO 15 (608, 6000er und 6200er Reihe)', params: [
    { k: 'size', label: 'Lager-Typ', type: 'select', options: BEARING_GROUPED_OPTIONS, def: '608' },
    { k: 'seal', label: 'Ausführung', type: 'select', options: [['2rs', 'Geschlossen (2RS / ZZ)'], ['open', 'Offen (mit Kugeln)']], def: '2rs' },
  ] },
  { lib: 'stdSleeve', label: 'Gleitlager (Norm)', role: 'solid', icon: 'sleeve', mat: 'Messing', std: true, desc: 'Gleitlagerbuchse nach ISO 3547 / DIN 1850 (zylindrisch oder mit Bund)', params: [
    { k: 'size', label: 'Größe (d × D)', type: 'select', options: SLEEVE_OPTIONS, def: '8x10' },
    { k: 'length', label: 'Länge (B)', type: 'num', def: 10 },
    { k: 'flange', label: 'Bauform', type: 'select', options: [['cyl', 'Zylindrisch (Form C)'], ['flange', 'Mit Bund (Form F)']], def: 'cyl' },
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

