// ================= Drohnen: Rahmen-Generator, Vorlagen, Frame-Assistent, Bibliothek =================
// Ein vollständiger, veränderbarer Rohbau: Unterteil mit Armen, Abstandsbolzen, Oberplatte,
// Kamerahalter und Platzhalter für Stack, Videosender, Kamera, Motoren, Propeller und Akku.
// Vorne ist −Y wie in der Ansicht „Vorne“ (Kamera). Die Motoren sitzen in Armlänge = Achsabstand/2
// um die Mitte; „Armwinkel“ ist der Winkel der vorderen Arme zur Flugrichtung, „Armwinkel_hinten“
// der der hinteren (bei X-Rahmen gleich, beim Deadcat vorne weiter gespreizt).
// Alle Lagen hängen an Maßen (links unter „Maße“) – ändert man z. B. den Achsabstand, wandert alles mit.
// Kaufteile tragen ein festes Gewicht (massG) aus Datenblättern, Rahmenteile ihr Material.
const DroneTpl = (() => {
  const param = (name, expr) => ({ id: uid('m'), name, expr });
  const item = (kind, p, o = {}) => {
    const x = Model.newItem(kind, p, { name: o.name, role: o.role, color: o.color });
    Object.assign(x.t, o.t || {});
    if (o.mat) x.mat = o.mat;
    if (o.massG != null) x.massG = o.massG;
    if (o.hidden) x.hidden = true;
    return x;
  };
  const group = (name, children, o = {}) => {
    const g = item('group', {}, { ...o, name, color: o.color || (children.find((c) => c.role !== 'hole') || children[0]).color });
    g.children = children;
    return g;
  };
  const hole = (size, t, len, name) => {
    const x = Model.newItem('part', { lib: 'screwHole', size, head: 'none', fit: 'medium', length: len }, { name: name || 'Loch ' + size, role: 'hole' });
    Object.assign(x.t, t); return x;
  };
  // vier Ecken: vorne rechts, vorne links, hinten rechts, hinten links
  const CORNERS = [['vorne rechts', 1, -1], ['vorne links', -1, -1], ['hinten rechts', 1, 1], ['hinten links', -1, 1]];
  const sg = (s, e) => (s > 0 ? `(${e})` : `-(${e})`);
  const W = (sy) => (sy < 0 ? 'Armwinkel' : 'Armwinkel_hinten');
  const MX = (sy) => `Achsabstand/2*sin(${W(sy)})`, MY = (sy) => `Achsabstand/2*cos(${W(sy)})`;
  // Bei ungleichen Armwinkeln (Deadcat) rückt der Körper so, dass die Mitte der vier Motoren über der Plattenmitte liegt – sonst sitzt der Schwerpunkt vorne
  const SHIFT = ' + Achsabstand/4*(cos(Armwinkel) - cos(Armwinkel_hinten))';
  const PY = (sy) => sg(sy, MY(sy)) + SHIFT, PY2 = (sy) => sg(sy, MY(sy) + '/2') + SHIFT;
  // Bolzen vorne hinter der Kamera (lange HD-Kameras schieben sie nach hinten), hinten aus dem Propellerkreis
  const frontOff = (camL) => Math.max(22, Math.ceil((8 + (camL || 18) / 2 + 3.5) * 2) / 2);
  const SX = 'Plattenbreite/2 - 4.5';   // Lochmitte 4,5 mm vom Rand: mehr als 1,2 × Lochdurchmesser (M3)
  const SYof = (fo) => (sy) => (sy < 0 ? `Plattenlänge/2 - ${fo}` : 'Plattenlänge/2 - 16');

  // ---------- Auswahl für den Frame-Assistenten ----------
  const SIZES = {
    3: { Armbreite: 8, Armdicke: 3, Plattenbreite: 30, Plattenlänge: 90, Plattendicke: 1.5, Bolzenhöhe: 20, stack: 20, motor: '1404', akku: '4S 450 mAh', prop: 2 },
    4: { Armbreite: 10, Armdicke: 4, Plattenbreite: 34, Plattenlänge: 100, Plattendicke: 2, Bolzenhöhe: 22, stack: 20, motor: '2004', akku: '4S 650 mAh', prop: 3 },
    5: { Armbreite: 13, Armdicke: 5, Plattenbreite: 42, Plattenlänge: 130, Plattendicke: 2, Bolzenhöhe: 25, stack: 30.5, motor: '2207', akku: '6S 1300 mAh', prop: 4.5 },
    6: { Armbreite: 14, Armdicke: 5.5, Plattenbreite: 44, Plattenlänge: 140, Plattendicke: 2, Bolzenhöhe: 28, stack: 30.5, motor: '2306', akku: '6S 1500 mAh', prop: 6 },
    7: { Armbreite: 15, Armdicke: 6, Plattenbreite: 45, Plattenlänge: 150, Plattendicke: 2.5, Bolzenhöhe: 30, stack: 30.5, motor: '2806.5', akku: '6S 1500 mAh', prop: 7 },
  };
  const FORMS = { x: ['True-X', 45, 45], stretch: ['Stretched-X', 35, 35], wide: ['Wide-X', 55, 55], deadcat: ['Deadcat', 60, 35] };
  // Videosysteme: Sendeeinheit und Kamera aus der Bauteil-Bibliothek
  const VIDEO = {
    analog: ['Analog (TBS Unify + Micro-Kamera)', 'TBS Unify Pro32 HV (analog)', null],
    o3: ['DJI O3', 'DJI O3 Air Unit (Sendeeinheit)', 'DJI O3 Air Unit (Kameramodul)'],
    o4pro: ['DJI O4 Pro', 'DJI O4 Air Unit Pro (Sendeeinheit)', 'DJI O4 Air Unit Pro (Kameramodul)'],
    o4: ['DJI O4', 'DJI O4 Air Unit (Sendeeinheit)', 'DJI O4 Air Unit (Kameramodul)'],
    walksnail: ['Walksnail Avatar HD Pro', 'Walksnail Avatar HD V2 (Sendeeinheit, Pro Kit)', 'Walksnail Avatar HD Pro Kamera'],
    hdzero: ['HDZero Freestyle V2', 'HDZero Freestyle V2 (Sendeeinheit)', 'HDZero Micro V3 Kamera'],
    none: ['Keiner', null, null],
  };
  const buy = (name) => name && (BUY_DATA.videosender || []).find((v) => v.name === name);
  const R = (d) => (d * Math.PI) / 180;
  // Achsabstand so, dass zwischen benachbarten Propellern ein Viertel Propeller Luft bleibt
  function wheelbase(zoll, wv, wh) {
    const D = zoll * 25.4;
    const side = Math.hypot(Math.sin(R(wv)) - Math.sin(R(wh)), Math.cos(R(wv)) + Math.cos(R(wh)));
    const L = (1.25 * D) / Math.min(2 * Math.sin(R(wv)), 2 * Math.sin(R(wh)), side);
    return Math.round((2 * L) / 5) * 5;
  }
  // kleinster Abstand der Propellerspitzen benachbarter Motoren
  function tipGap(A, zoll, wv, wh) {
    const L = A / 2, D = zoll * 25.4;
    const m = [[L * Math.sin(R(wv)), -L * Math.cos(R(wv))], [-L * Math.sin(R(wv)), -L * Math.cos(R(wv))], [L * Math.sin(R(wh)), L * Math.cos(R(wh))], [-L * Math.sin(R(wh)), L * Math.cos(R(wh))]];
    const d = (a, b) => Math.hypot(m[a][0] - m[b][0], m[a][1] - m[b][1]);
    return Math.min(d(0, 1), d(2, 3), d(0, 2), d(1, 3)) - D;
  }
  // Abstandsbolzen so hoch, dass die Propeller unter der Oberplatte durchlaufen (Motor + 7 mm, auf 5 mm aufgerundet),
  // der Videosender auf den Stack passt (Stack oben bei 16 mm) und die Kamera zwischen die Platten
  const standoff = (S, mot, vtx, cam) => Math.max(S.Bolzenhöhe, Math.ceil((mot.h + 7) / 5) * 5, vtx ? Math.ceil(16 + vtx.h_mm + 1) : 0, cam ? Math.ceil(cam.h_mm + 2) : 0);
  // kleinster Abstand von Kamera, Kamerahalter und Abstandsbolzen zum Propellerkreis (von oben gesehen)
  function bodyGap(A, zoll, wv, wh, S, camW, camL) {
    const L = A / 2, r = (zoll * 25.4) / 2, s = (A / 4) * (Math.cos(R(wv)) - Math.cos(R(wh)));
    const mot = [[L * Math.sin(R(wv)), -L * Math.cos(R(wv)) + s], [L * Math.sin(R(wh)), L * Math.cos(R(wh)) + s]];
    const yc = -(S.Plattenlänge / 2 - 8), sx = S.Plattenbreite / 2 - 4.5;
    const pts = [[camW / 2, yc - camL / 2, 0], [camW / 2 + 2.2, yc - 6, 0], [sx, -(S.Plattenlänge / 2 - frontOff(camL)), 2.5], [sx, S.Plattenlänge / 2 - 16, 2.5]];
    return Math.min(...mot.flatMap(([x, y]) => pts.map(([px, py, pr]) => Math.hypot(x - px, y - py) - pr - r)));
  }
  // vollständige Einstellung aus einer kurzen Auswahl
  function config(o = {}) {
    const zoll = o.zoll || 5, S = SIZES[zoll] || SIZES[5], F = FORMS[o.form] || FORMS.x;
    const mot = DroneLib.motor(o.motor || S.motor);
    const vid = VIDEO[o.video || 'analog'] || VIDEO.analog;
    const vtx = buy(vid[1]), cam = buy(vid[2]);
    const stack = o.stack || S.stack;
    const camW = cam ? cam.b_mm : o.cam || 19, camL = cam ? cam.l_mm : 18;
    let A = o.A || wheelbase(zoll, F[1], F[2]);
    if (!o.A) while (bodyGap(A, zoll, F[1], F[2], S, camW, camL) < 2 && A < 600) A += 5;   // Kamera und Bolzen raus aus den Propellerkreisen
    const th = DroneLib.thrust(mot.stator);
    const akkuName = o.akku === undefined ? S.akku : o.akku;
    return {
      name: o.name || `${zoll}" ${F[0]}`, doc: o.doc || `${zoll}-Zoll-${F[0]}`, zoll, form: o.form || 'x', video: o.video || 'analog',
      params: { Achsabstand: A, Armwinkel: F[1], Armwinkel_hinten: F[1] === F[2] ? 'Armwinkel' : F[2], Armbreite: S.Armbreite, Armdicke: o.Armdicke || S.Armdicke, Plattenbreite: S.Plattenbreite, Plattenlänge: S.Plattenlänge, Plattendicke: S.Plattendicke, Bolzenhöhe: standoff(S, mot, vtx, cam), Stack: stack, Motorlochkreis: mot.circle, Kamerabreite: cam ? cam.kamera_breite_mm : o.cam || 19, Propeller: zoll },
      stackScrew: stack >= 30 ? 'M3' : 'M2', motorScrew: mot.screw.startsWith('M1') ? 'M2' : mot.screw,
      motor: { name: 'Motor ' + mot.stator, d: mot.d, h: mot.h, g: mot.g }, prop: S.prop,
      akku: akkuName ? DroneLib.akku(akkuName) : null,
      vtx: vtx ? { name: vtx.name.replace(/\s*\(Sendeeinheit.*\)/, '') + (vid[2] ? ' Sender' : ''), src: vtx.name, lochbild: vtx.lochbild, l: vtx.l_mm, b: vtx.b_mm, h: vtx.h_mm, g: vtx.gewicht_g ?? '' } : null,
      cam: cam ? { name: cam.name.replace(/\s*\(Kameramodul\)/, ' Kamera'), l: cam.l_mm, b: cam.b_mm, h: cam.h_mm, g: cam.gewicht_g ?? '' } : { name: 'Kamera (Platzhalter)', g: 6 },
      stackG: 20, thrust: th ? th.g : null, thrustSrc: th ? th.src : null,
    };
  }
  const PRESETS = {
    f5: config({ zoll: 5, form: 'x', name: '5" Freestyle', doc: '5-Zoll-Freestyle' }),
    f7: config({ zoll: 7, form: 'x', A: 295, name: '7" Long Range', doc: '7-Zoll-Long-Range' }),
  };
  PRESETS.f5.desc = 'True-X mit 225 mm Achsabstand, 30,5er Stack, Micro-Kamera, 6S-Akku. Alles über Maße veränderbar.';
  PRESETS.f7.desc = 'Größerer True-X mit 295 mm Achsabstand und 19er Motoren für lange Flüge mit 6S 1500.';

  function build(key) {
    const P = typeof key === 'object' ? key : PRESETS[key] || PRESETS.f5;
    const d = Model.newDoc(P.doc);
    d.params = Object.entries(P.params).map(([k, v]) => param(k, v));
    d.settings.material = 'CFK';
    d.drone = { zoll: P.zoll, form: P.form, video: P.video, motorH: P.motor.h, thrustG: P.thrust || null, thrustSrc: P.thrust ? P.thrustSrc : null };
    const CF = '#3b4148';
    const SY = SYof(frontOff(P.cam && P.cam.l));
    // Unterteil: Mittelplatte, vier Arme, Motorauflagen, Löcher
    const kids = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Armdicke' }, { name: 'Mittelplatte', color: CF })];
    for (const [n, sx, sy] of CORNERS) {
      kids.push(item('box', { w: 'Armbreite', d: 'Achsabstand/2', h: 'Armdicke' }, { name: 'Arm ' + n, color: CF, t: { x: sg(sx, MX(sy) + '/2'), y: PY2(sy), rz: sx * sy < 0 ? W(sy) : '-' + W(sy) } }));
      kids.push(item('cylinder', { d: 'Motorlochkreis + 9', h: 'Armdicke' }, { name: 'Motorauflage ' + n, color: CF, t: { x: sg(sx, MX(sy)), y: PY(sy) } }));
    }
    for (const [, sx, sy] of CORNERS) kids.push(hole(P.stackScrew, { x: sg(sx, 'Stack/2'), y: sg(sy, 'Stack/2'), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Stack-Loch'));
    for (const [, sx, sy] of CORNERS) kids.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Bolzen-Loch'));
    for (const [n, sx, sy] of CORNERS) {
      // vier Motorschrauben als Kreismuster um die Motormitte (Lochkreis = Motorlochkreis)
      const g = Model.newItem('group', {}, { name: 'Motorlöcher ' + n, role: 'hole' });
      g.p = { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx: sg(sx, MX(sy)), cy: PY(sy) };
      g.children = [hole(P.motorScrew, { x: `${sg(sx, MX(sy))} + Motorlochkreis/2`, y: PY(sy), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Motorschraube')];
      kids.push(g);
      kids.push(item('cylinder', { d: 7, h: 'Armdicke + 2' }, { name: 'Wellenloch ' + n, role: 'hole', t: { x: sg(sx, MX(sy)), y: PY(sy), z: -1 } }));
    }
    const unten = group('Unterteil', kids, { color: CF });
    // Abstandsbolzen mit Gewinde
    const bk = [];
    for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 5, h: 'Bolzenhöhe' }, { name: 'Bolzen', color: '#9aa3ad', t: { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke' } }));
    for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 2.5, h: 'Bolzenhöhe + 2' }, { name: 'Gewinde', role: 'hole', t: { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke - 1' } }));
    const bolzen = group('Abstandsbolzen', bk, { color: '#9aa3ad', mat: 'Alu 7075' });
    // Oberplatte mit Schlitzen für den Akkugurt
    const ok = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Plattendicke' }, { name: 'Platte', color: CF, t: { z: 'Armdicke + Bolzenhöhe' } })];
    for (const [, sx, sy] of CORNERS) ok.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke + Bolzenhöhe + Plattendicke + 1' }, 'Plattendicke + 2', 'Bolzen-Loch'));
    for (const s of [1, -1]) ok.push(item('box', { w: 3, d: 21, h: 'Plattendicke + 2' }, { name: 'Gurtschlitz', role: 'hole', t: { x: sg(s, 'Plattenbreite/2 - 6'), z: 'Armdicke + Bolzenhöhe - 1' } }));
    const oben = group('Oberplatte', ok, { color: CF });
    // Kamerahalter: zwei Seitenwangen mit M2-Loch auf Kamerahöhe
    const kh = [];
    for (const s of [1, -1]) kh.push(item('box', { w: 2, d: 12, h: 'Bolzenhöhe' }, { name: 'Wange', color: '#5b6470', t: { x: sg(s, 'Kamerabreite/2 + 1.2'), y: '-(Plattenlänge/2 - 8)', z: 'Armdicke' } }));
    kh.push(item('cylinder', { d: 2.2, h: 'Kamerabreite + 10' }, { name: 'Kameraschraube M2', role: 'hole', t: { x: '-(Kamerabreite/2 + 5)', y: '-(Plattenlänge/2 - 8)', z: 'Armdicke + Bolzenhöhe/2', ry: 90 } }));
    const halter = group('Kamerahalter', kh, { color: '#5b6470', mat: 'TPU 95A' });
    // Kaufteile in ihrer echten Form (Kern: buildBuy) mit festem Gewicht aus dem Datenblatt
    const out = [unten, bolzen, oben, halter];
    const buyItem = (lib, p, o) => item('part', { lib, ...p }, o);
    out.push(buyItem('buyStack', { a: 'Stack', h: 12, size: P.stackScrew }, { name: 'Stack (FC + ESC)', color: '#3a8f6a', t: { z: 'Armdicke + 4' }, massG: P.stackG }));
    if (P.vtx) {
      const vs = DroneLib.videoShape({ name: P.vtx.src, lochbild: P.vtx.lochbild });
      out.push(vs.lib === 'buyVtx' ? buyItem('buyVtx', { w: P.vtx.b, d: P.vtx.l, h: P.vtx.h, a: vs.a }, { name: P.vtx.name, color: '#16202b', t: { z: 'Armdicke + 16' }, massG: P.vtx.g })
        : buyItem('buyPcb', { w: P.vtx.b, d: P.vtx.l, h: P.vtx.h }, { name: P.vtx.name, color: '#16202b', t: { z: 'Armdicke + 16' }, massG: P.vtx.g }));
    }
    const camD = P.cam.l || 18, camH = P.cam.h || 'Kamerabreite';
    out.push(buyItem('buyCamera', { w: P.cam.b || 'Kamerabreite', d: camD, h: camH }, { name: P.cam.name, color: '#16202b', t: { y: '-(Plattenlänge/2 - 8)', z: `Armdicke + Bolzenhöhe/2 - (${camH})/2` }, massG: P.cam.g }));
    const mk = [], pk = [];
    for (const [n, sx, sy] of CORNERS) {
      mk.push(buyItem('buyMotor', { d: P.motor.d, h: P.motor.h, lk: 'Motorlochkreis', size: P.motorScrew }, { name: 'Motor ' + n, color: '#b9c2cb', t: { x: sg(sx, MX(sy)), y: PY(sy), z: 'Armdicke' } }));
      // hinten rechts und vorne links drehen andersherum: gespiegelte Blätter
      pk.push(buyItem('buyProp', { zoll: 'Propeller', blades: 3, pitch: sx * sy < 0 ? 13 : -13 }, { name: 'Propeller ' + n, color: '#e8833a', t: { x: sg(sx, MX(sy)), y: PY(sy), z: `Armdicke + ${P.motor.h}` } }));
    }
    out.push(group(P.motor.name + ' (4×)', mk, { color: '#b9c2cb', massG: P.motor.g === '' ? '' : `4*${P.motor.g}` }));
    out.push(group(`Propeller ${P.zoll}" (4×)`, pk, { color: '#e8833a', massG: `4*${P.prop}` }));
    if (P.akku) out.push(buyItem('buyBattery', { w: P.akku.w, d: P.akku.l, h: P.akku.h }, { name: P.akku.name, color: '#e2b53a', t: { z: 'Armdicke + Bolzenhöhe + Plattendicke' }, massG: P.akku.g }));
    d.items = out;
    return d;
  }
  // Vorschaubild: Rahmen von oben
  function svg(big) {
    const r = big ? 21 : 19;
    const pts = [[55 + r, 28 - r * 0.62], [55 - r, 28 - r * 0.62], [55 + r, 28 + r * 0.62], [55 - r, 28 + r * 0.62]];
    return pts.map(([x, y]) => `<path d="M55 28L${x} ${y}" class="line" stroke-width="5" stroke-linecap="round"/>`).join('') +
      '<rect x="47" y="16" width="16" height="24" rx="2" class="a3"/>' +
      pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" class="a2"/><ellipse cx="${x}" cy="${y}" rx="${big ? 13 : 11}" ry="${big ? 7 : 6}" class="b1" fill-opacity=".15"/>`).join('');
  }
  const LIST = Object.entries(PRESETS).map(([k, P]) => ({ id: 'drone-' + k, name: P.name, desc: P.desc, build: () => build(k), svg: svg(k === 'f7'), drone: true }));
  return { build, config, wheelbase, tipGap, bodyGap, PRESETS, LIST, SIZES, FORMS, VIDEO };
})();

// ================= Frame-Assistent und Drohnen-Bibliothek in der Oberfläche =================
const DroneUI = (() => {
  // Frame-Assistent: Größe, Form, Stack, Motor, Video, Akku wählen – mit Vorschau der wichtigsten Werte
  function assistant() {
    const o = { zoll: 5, form: 'x', stack: 30.5, motor: '2207', video: 'analog', akku: '6S 1300 mAh', A: null };
    const body = h('div', { class: 'frame-assist' });
    const out = h('div', { class: 'fa-out', id: 'fa-out' });
    const sel = (id, label, val, opts, fn) => UI.selectField({ id, label, value: String(val), options: opts, onChange: fn });
    const motors = DroneLib.motors(), akkus = DroneLib.akkus();
    let aField = null;
    const draw = () => {
      body.innerHTML = '';
      const S = DroneTpl.SIZES[o.zoll], F = DroneTpl.FORMS[o.form];
      const auto = DroneTpl.wheelbase(o.zoll, F[1], F[2]);
      const A = o.A || auto;
      const f = h('div', { class: 'fields' });
      f.append(
        sel('fa-zoll', 'Propeller', o.zoll, [3, 4, 5, 6, 7].map((z) => [String(z), `${z} Zoll (${fmt(z * 25.4, 1)} mm)`]), (v) => { o.zoll = +v; const s = DroneTpl.SIZES[o.zoll]; o.stack = s.stack; o.motor = s.motor; o.akku = s.akku; o.A = null; draw(); }),
        sel('fa-form', 'Rahmenform', o.form, Object.entries(DroneTpl.FORMS).map(([k, v]) => [k, `${v[0]} (${v[1]}°${v[1] !== v[2] ? ' / ' + v[2] + '°' : ''})`]), (v) => { o.form = v; o.A = null; draw(); }),
        sel('fa-stack', 'Stack', o.stack, DroneLib.stacks().map((s) => [String(s.a), `${s.name} · ${s.screw}`]), (v) => { o.stack = +v; draw(); }),
        sel('fa-motor', 'Motor', o.motor, motors.map((m) => [m.stator, `${m.stator} · Lochkreis ${fmt(m.circle, 1)} · ${m.sheet ? fmt(m.g, 1) + ' g' : 'Gewicht eintragen'}`]), (v) => { o.motor = v; draw(); }),
        sel('fa-video', 'Videosystem', o.video, Object.entries(DroneTpl.VIDEO).map(([k, v]) => [k, v[0]]), (v) => { o.video = v; draw(); }),
        sel('fa-akku', 'Akku', o.akku || '', [['', 'Keiner'], ...akkus.map((a) => [a.name.replace(/^Akku /, ''), `${a.name.replace(/^Akku /, '')} · ca. ${a.g} g`])], (v) => { o.akku = v || null; draw(); }),
      );
      aField = UI.numField({ id: 'fa-a', label: 'Achsabstand', value: A, onCommit: (v) => { const n = parseFloat(String(v).replace(',', '.')); o.A = isFinite(n) && n > 0 ? n : null; draw(); } });
      f.append(aField);
      body.append(f);
      // Vorschau der wichtigsten Werte
      const gap = DroneTpl.tipGap(A, o.zoll, F[1], F[2]);
      const m = motors.find((x) => x.stator === o.motor);
      const warn = [];
      if (gap < 0) warn.push('Die Propeller überlappen sich – größerer Achsabstand nötig.');
      else if (gap < o.zoll * 25.4 * 0.08) warn.push('Sehr wenig Luft zwischen den Propellern.');
      if (m && m.props && (o.zoll < m.props[0] - 0.01 || o.zoll > m.props[1] + 0.01)) warn.push(`Motor ${m.stator} passt eher zu ${fmt(m.props[0], 1)}–${fmt(m.props[1], 1)}"-Propellern.`);
      out.innerHTML = `<div class="mini-list">
        <div class="mini-row"><span class="grow">Achsabstand</span><b class="mono">${fmt(A, 0)} mm${o.A ? '' : ' (berechnet)'}</b></div>
        <div class="mini-row"><span class="grow">Luft zwischen den Propellerspitzen</span><b class="mono" id="fa-gap">${fmt(gap, 1)} mm</b></div>
        <div class="mini-row"><span class="grow">Motorlochkreis</span><b class="mono">${m ? fmt(m.circle, 1) + ' mm · ' + m.screw : '–'}</b></div></div>` +
        (warn.length ? `<div class="hint-box warn" id="fa-warn">${warn.join('<br>')}</div>` : '<div class="hint-box">Alles passt. Nach dem Bauen änderst du jedes Maß links unter „Maße“.</div>');
      body.append(out);
    };
    draw();
    UI.modal({ title: 'Frame-Assistent', body, wide: true, actions: [{ label: 'Abbrechen' }, { label: 'Rahmen bauen', primary: true, run: () => { make(o); } }] });
  }
  function make(o) {
    const cfg = DroneTpl.config(o);
    App.setDoc(DroneTpl.build(cfg)); Start.hide();
    UI.toast(`${cfg.name} gebaut. Links unter „Maße“ änderst du Achsabstand, Armwinkel, Stack und mehr.`, { icon: 'check', ms: 6000 });
    return cfg;
  }
  // Drohnen-Bibliothek als Klappfenster: Kategorien, darunter Kacheln zum Klicken oder Ziehen
  let cat = 'motor';
  function flyout(el) {
    el.append(h('h3', null, 'Drohne'));
    const top = h('div', { class: 'btn-row' });
    const fa = h('button', { type: 'button', class: 'btn primary small', id: 'drone-assist' }); fa.innerHTML = icon('frame') + 'Frame-Assistent';
    fa.onclick = () => { Panels.closeFlyout(); assistant(); };
    const dc = h('button', { type: 'button', class: 'btn small', id: 'drone-check', 'data-help': 'droneCheck' }); dc.innerHTML = icon('clearance') + 'Drohnen-Check';
    dc.onclick = () => { Panels.closeFlyout(); DroneCheck.dialog(); };
    top.append(fa, dc); el.append(top);
    const chips = h('div', { class: 'chips', role: 'tablist' });
    const tiles = h('div', { class: 'tiles' });
    const fill = () => {
      tiles.innerHTML = '';
      for (const b of chips.children) b.setAttribute('aria-pressed', b.dataset.cat === cat ? 'true' : 'false');
      const list = cat === 'loch' ? DroneLib.holeParts() : DroneLib.buyParts(cat);
      for (const spec of list) {
        const t = h('div', { class: 'tile' + (spec.part && spec.part.role === 'hole' ? ' hole-part' : ''), role: 'button', tabindex: '0', 'data-tip': spec.info || (spec.part ? spec.part.desc : ''), 'data-help': spec.part && HELP[spec.part.lib] ? spec.part.lib : null });
        t.innerHTML = spec.part ? partSVG(spec.part) : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[DroneLib.CATS.find((c) => c[0] === cat)[2]] || IC.cube}</svg>`;
        const m = spec.name.match(/^(.*?)\s*\((.*)\)\s*$/);   // Zusatz in Klammern klein darunter
        t.append(h('span', { class: 'lbl' }, m ? m[1] : spec.name));
        if (m) t.append(h('span', { class: 'role' }, m[2]));
        Place.bindTile(t, spec);
        tiles.append(t);
      }
    };
    for (const [k, label, ic] of DroneLib.CATS) {
      const b = h('button', { type: 'button', class: 'chip', 'data-cat': k, 'aria-pressed': 'false' }); b.innerHTML = icon(ic) + label;
      b.onclick = () => { cat = k; fill(); };
      chips.append(b);
    }
    el.append(chips, tiles, h('div', { class: 'foot' }, 'Kaufteile haben ihre echte Form, Maße und Gewicht aus dem Datenblatt. Auf eine Fläche ziehen legt sie dort ab.'));
    fill();
  }
  return { assistant, make, flyout, get cat() { return cat; }, set cat(c) { cat = c; } };
})();
