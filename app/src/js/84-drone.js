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
    3.5: { Armbreite: 9, Armdicke: 3.5, Plattenbreite: 32, Plattenlänge: 95, Plattendicke: 2, Bolzenhöhe: 20, stack: 25.5, motor: '2004', akku: '4S 850 mAh', prop: 3 },
    4: { Armbreite: 10, Armdicke: 4, Plattenbreite: 34, Plattenlänge: 100, Plattendicke: 2, Bolzenhöhe: 22, stack: 20, motor: '2004', akku: '4S 650 mAh', prop: 3 },
    5: { Armbreite: 13, Armdicke: 5, Plattenbreite: 42, Plattenlänge: 130, Plattendicke: 2, Bolzenhöhe: 25, stack: 30.5, motor: '2207', akku: '6S 1300 mAh', prop: 4.5 },
    6: { Armbreite: 14, Armdicke: 5.5, Plattenbreite: 44, Plattenlänge: 140, Plattendicke: 2, Bolzenhöhe: 28, stack: 30.5, motor: '2306', akku: '6S 1500 mAh', prop: 6 },
    7: { Armbreite: 15, Armdicke: 6, Plattenbreite: 45, Plattenlänge: 150, Plattendicke: 2.5, Bolzenhöhe: 30, stack: 30.5, motor: '2806.5', akku: '6S 1500 mAh', prop: 7 },
  };
  const FORMS = { x: ['True-X', 45, 45], stretch: ['Stretched-X', 35, 35], wide: ['Wide-X', 55, 55], deadcat: ['Deadcat', 60, 35], cine: ['Cinewhoop', 45, 45], speed: ['Speed-Rumpf', 55, 55] };
  const ZOLL = [3, 3.5, 4, 5, 6, 7];
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
  function bodyGap(A, zoll, wv, wh, S, camW, camL, rr, noCam) {
    const L = A / 2, r = rr || (zoll * 25.4) / 2, s = (A / 4) * (Math.cos(R(wv)) - Math.cos(R(wh)));
    const mot = [[L * Math.sin(R(wv)), -L * Math.cos(R(wv)) + s], [L * Math.sin(R(wh)), L * Math.cos(R(wh)) + s]];
    const yc = -(S.Plattenlänge / 2 - 8), sx = S.Plattenbreite / 2 - 4.5;
    const pts = [...(noCam ? [] : [[camW / 2, yc - camL / 2, 0], [camW / 2 + 2.2, yc - 6, 0]]), [sx, -(S.Plattenlänge / 2 - frontOff(camL)), 2.5], [sx, S.Plattenlänge / 2 - 16, 2.5]];
    return Math.min(...mot.flatMap(([x, y]) => pts.map(([px, py, pr]) => Math.hypot(x - px, y - py) - pr - r)));
  }
  // Speed-Rumpf: Stromlinien-Rumpf (Kern: aeroBody) – Kamera in der Nase, dahinter Stack mit Sender, dann der Akku.
  // Durchmesser und Achshöhe so, dass alle Querschnitte hineinpassen; die Lage längs so, dass der Schwerpunkt
  // über der Mitte der Motoren liegt. Maße in z über der Oberkante des Unterteils.
  function fuselage(stack, vtx, cam, akku, stackG) {
    const S = stack + 5.5, sl = Math.max(S, vtx ? vtx.l_mm : 0);
    const boxes = [[S / 2, 4, 16]];
    if (vtx) boxes.push([vtx.b_mm / 2, 16, 16 + vtx.h_mm]);
    if (akku) boxes.push([akku.w / 2, 0.5, akku.h + 0.5]);
    const cw = cam ? cam.b_mm : 19, ch = cam ? cam.h_mm : 19, cl = cam ? cam.l_mm : 18;
    let best = null;
    for (let a = 6; a <= 60; a += 0.5) {
      const ri = Math.max(...boxes.flatMap(([hw, z0, z1]) => [Math.hypot(hw, z0 - a), Math.hypot(hw, z1 - a)]));
      if (!best || ri < best.ri - 1e-9) best = { a, ri };
    }
    const wall = 1.6, D = Math.ceil(2 * (best.ri + 1.5 + wall));
    const dn = Math.ceil(2 * (Math.hypot(cw, ch) / 2 + 0.8 + wall));   // Nasenöffnung: die Kamera passt genau hinein
    // runde Nase (knapp ein Durchmesser lang), langes Heck (1,6 Durchmesser) mit kleiner Öffnung für die Abluft
    const Ln = Math.max(Math.ceil(cl + 6), Math.round(0.9 * D)), Lt = Math.round(1.6 * D), dt = Math.max(Math.ceil(0.3 * D), Math.ceil(2 * wall + 6));
    const Lc = Math.ceil(sl + 3 + (akku ? akku.l + 3 : 3));
    // Abstände zur Mitte des Mittelteils: Stack vorne, Akku hinten, Kamera in der Nase
    const oS = -Lc / 2 + 1.5 + sl / 2, oB = akku ? Lc / 2 - 1.5 - akku.l / 2 : 0, oC = -Lc / 2 - Ln + cl / 2 + 0.5;
    // Schale (PETG) grob als Kegelstümpfe: Mantelfläche × Wand
    const Rr = D / 2, rn = dn / 2, rt = dt / 2, shell = (r1, r2, l) => Math.PI * (r1 + r2) * Math.hypot(r1 - r2, l) * wall / 1000 * 1.27;
    const ms = [[(stackG || 20) + (vtx && vtx.gewicht_g ? vtx.gewicht_g : 0), oS], [cam && cam.gewicht_g ? cam.gewicht_g : 6, oC], [akku ? akku.g : 0, oB],
      [shell(Rr, rn, Ln), -Lc / 2 - Ln * 0.4], [shell(Rr, Rr, Lc), 0], [shell(Rr, rt, Lt), Lc / 2 + Lt * 0.4]];
    const mid = Math.round((-ms.reduce((t, [m, o]) => t + m * o, 0) / ms.reduce((t, [m]) => t + m, 0)) * 2) / 2;
    return { D, a: best.a, Lc, Ln, Lt, dn, dt, wall, mid, sl, oS, oB, cl, front: mid + oS - sl / 2 - 3, rear: mid + (akku ? oB + akku.l / 2 : oS + sl / 2) + 3 };
  }
  // größte Motorneigung, bei der die hinteren Propeller noch über ihren Armen bleiben (vorne kippt die Scheibe
  // nach unten, der Arm läuft zur Mitte nach vorne); 0,5 mm Luft wie im Drohnen-Check mit 1 mm Sicherheitsrand
  function maxTilt(cfg) {
    const P = cfg.params, rp = (P.Propeller * 25.4) / 2 + 1, mh = cfg.motor.h + 1, cw = Math.cos(R(P.Armwinkel));
    let best = 0;
    for (let t = 0; t <= 45; t++) { const k = 1 + ((P.Motorlochkreis + 9) / 2) * Math.tan(R(t)); if (k + mh * Math.cos(R(t)) - rp * cw * Math.tan(R(t)) >= 0.5) best = t; else break; }
    return best;
  }
  const sizeOf = (zoll) => SIZES[zoll] || SIZES[ZOLL.reduce((b, z) => (Math.abs(z - zoll) < Math.abs(b - zoll) ? z : b), 5)];
  // vollständige Einstellung aus einer kurzen Auswahl (o.frame: Rahmen eines Herstellers mit festen Maßen)
  function config(o = {}) {
    const zoll = o.zoll || 5, form = FORMS[o.form] ? o.form : 'x', F = FORMS[form];
    const cine = form === 'cine', speed = form === 'speed';
    const S = { ...sizeOf(zoll) };
    if (o.Plattendicke) S.Plattendicke = o.Plattendicke;
    const mot = DroneLib.motor(o.motor || S.motor);
    const vid = VIDEO[o.video || 'analog'] || VIDEO.analog;
    const vtx = buy(vid[1]), cam = buy(vid[2]);
    const stack = o.stack || S.stack;
    const camW = cam ? cam.b_mm : o.cam || 19, camL = cam ? cam.l_mm : 18;
    // kürzeste Platte: vorne Kamera, dahinter die Bolzen gerade vor der Stack-Platine und dem Videosender;
    // schmalste Platte: Stack-Löcher noch 1,25 × Lochdurchmesser vom Rand
    const Lmin = Math.ceil((2 * (frontOff(camL) + Math.max(stack + 5.5, vtx ? vtx.l_mm : 0) / 2 + 3)) / 5) * 5;
    const Wmin = Math.ceil((stack + 2.5 * (stack >= 30 ? 3.4 : 2.4)) / 2) * 2;
    if (cine) S.Plattenlänge = Lmin;   // Cinewhoop: so kurz wie möglich
    const rp = (zoll * 25.4) / 2;
    const duct = cine ? { gap: o.ductGap != null ? o.ductGap : 3, wall: 1.6 } : null;
    const akkuName = o.akku === undefined ? S.akku : o.akku, akku = akkuName ? DroneLib.akku(akkuName) : null;
    const fus = speed ? fuselage(stack, vtx, cam, akku, 20) : null;
    // Speed: so eng wie möglich – 8 % Propeller Luft nach vorne/hinten, 5 mm zwischen Rumpf und Propellerkreis
    const speedA = (D) => Math.ceil(Math.max((1.08 * 2 * rp) / Math.cos(R(F[1])), (2 * (rp + D / 2 + 5)) / Math.sin(R(F[1]))) / 5) * 5;
    let A = o.A || (duct ? Math.ceil((2 * rp + 2 * (duct.gap + duct.wall) + 4) / Math.sin(R(F[1])) / 5) * 5 : fus ? speedA(fus.D) : wheelbase(zoll, F[1], F[2]));
    if (fus) {
      // Platte trägt Stack und Akku; breit genug für die Gurtschlitze neben dem Akku
      S.Plattenlänge = Math.max(100, Math.ceil((2 * Math.max(-fus.front, fus.rear)) / 5) * 5);
      S.Plattenbreite = Math.max(Wmin, S.Plattenbreite, akku ? Math.ceil((akku.w + 12) / 2) * 2 : 0);
      if (o.A && o.frame) while ((A / 2) * Math.sin(R(F[1])) - rp - fus.D / 2 < 3 && A < 800) A += 1;   // Herstellerrahmen: notfalls mehr Achsabstand
    }
    if (o.A && !speed) {
      // fester Achsabstand (eingetippt oder vom Hersteller): erst die Platten kürzer und schmaler, bis Kamera und Bolzen frei sind –
      // beim Nachbau eines Herstellerrahmens notfalls auch der Achsabstand größer (steht dann im Frame-Assistenten und im Drohnen-Check)
      const rr = duct ? rp + duct.gap + duct.wall + 1 : 0, need = duct ? 1 : 2;
      const fit = () => bodyGap(A, zoll, F[1], F[2], S, camW, camL, rr) >= need;
      while (!fit() && S.Plattenlänge - 5 >= Lmin) S.Plattenlänge -= 5;
      while (!fit() && S.Plattenbreite - 2 >= Wmin) S.Plattenbreite -= 2;
      if (o.frame) while (!fit() && A < 600) A += 1;
    }
    if (!o.A && !fus) {
      if (duct) while (bodyGap(A, zoll, F[1], F[2], S, camW, camL, rp + duct.gap + duct.wall + 1) < 1 && A < 600) A += 5;   // Kamera und Bolzen raus aus den Ducts
      else while (bodyGap(A, zoll, F[1], F[2], S, camW, camL) < 2 && A < 600) A += 5;   // Kamera und Bolzen raus aus den Propellerkreisen
    }
    const th = DroneLib.thrust(mot.stator);
    const fr = o.frame || null;
    const zs = String(zoll).replace('.', ',');
    const params = { Achsabstand: A, Armwinkel: F[1], Armwinkel_hinten: F[1] === F[2] ? 'Armwinkel' : F[2], Armbreite: S.Armbreite, Armdicke: o.Armdicke || S.Armdicke, Plattenbreite: S.Plattenbreite, Plattenlänge: S.Plattenlänge };
    if (!speed) Object.assign(params, { Plattendicke: S.Plattendicke, Bolzenhöhe: Math.max(o.bolzen || 0, standoff(S, mot, vtx, cam)) });
    Object.assign(params, { Stack: stack, Motorlochkreis: mot.circle, Kamerabreite: cam ? cam.kamera_breite_mm : o.cam || 19, Propeller: zoll });
    if (duct) Object.assign(params, { Ductspalt: duct.gap, Ductwand: duct.wall, Ducthöhe: 'Bolzenhöhe - 1' });   // Ducts enden knapp unter der Oberplatte
    if (fus) Object.assign(params, { Rumpfdurchmesser: fus.D, Rumpfachse: fus.a, Rumpfmitte: fus.mid, Rumpflänge: fus.Lc, Nasenlänge: fus.Ln, Hecklänge: fus.Lt, Nasenöffnung: fus.dn, Hecköffnung: fus.dt, Haubenwand: fus.wall,
      // geneigte Motoren: bei dieser Schräglage im schnellen Flug liegt der Rumpf genau im Fahrtwind; Keil vorne 1 mm dick
      Motorneigung: o.tilt != null ? o.tilt : 20, Keilhöhe: '1 + (Motorlochkreis + 9)/2*tan(Motorneigung)' });
    return {
      name: o.name || (fr ? `${fr.hersteller} ${fr.name}` : `${zs}" ${F[0]}`), doc: o.doc || (fr ? `${fr.hersteller}-${fr.name}`.replace(/\s+/g, '-') : `${zs}-Zoll-${F[0]}`), zoll, form, video: o.video || 'analog',
      frame: fr,
      params,
      stackScrew: stack >= 30 ? 'M3' : 'M2', motorScrew: mot.screw.startsWith('M1') ? 'M2' : mot.screw,
      motor: { name: 'Motor ' + mot.stator, d: mot.d, h: mot.h, g: mot.g }, prop: S.prop,
      akku, fus,
      vtx: vtx ? { name: vtx.name.replace(/\s*\(Sendeeinheit.*\)/, '') + (vid[2] ? ' Sender' : ''), src: vtx.name, lochbild: vtx.lochbild, l: vtx.l_mm, b: vtx.b_mm, h: vtx.h_mm, g: vtx.gewicht_g ?? '' } : null,
      cam: cam ? { name: cam.name.replace(/\s*\(Kameramodul\)/, ' Kamera'), l: cam.l_mm, b: cam.b_mm, h: cam.h_mm, g: cam.gewicht_g ?? '' } : { name: 'Kamera (Platzhalter)', g: 6 },
      stackG: 20, thrust: th ? th.g : null, thrustSrc: th ? th.src : null,
    };
  }
  // Rahmen eines Herstellers (rahmen.json) als Einstellung für config(): Maße fest, Kaufteile nach Größe
  function fromFrame(f) {
    const S = sizeOf(f.zoll), lb = f.motor_lochbild_mm || [];
    const motor = lb.includes(16) || !lb.length ? S.motor : lb.includes(12) ? '2004' : lb.includes(19) ? '2806.5' : S.motor;
    const o = { zoll: f.zoll, form: FORMS[f.form] ? f.form : 'x', A: f.achsabstand_mm, Armdicke: f.armdicke_mm, stack: f.stack_mm || S.stack, motor, akku: S.akku, frame: f };
    if (f.oberplatte_mm) o.Plattendicke = f.oberplatte_mm;
    if (f.bolzen_mm) o.bolzen = f.bolzen_mm;
    if (f.duct_innen_mm) o.ductGap = Math.max(1, Math.round(((f.duct_innen_mm - f.zoll * 25.4) / 2) * 10) / 10);
    return o;
  }
  const PRESETS = {
    f5: config({ zoll: 5, form: 'x', name: '5" Freestyle', doc: '5-Zoll-Freestyle' }),
    r5: config({ zoll: 5, form: 'stretch', Armdicke: 5, name: '5" Race', doc: '5-Zoll-Race' }),
    s5: config({ zoll: 5, form: 'speed', name: '5" Speed', doc: '5-Zoll-Speed' }),
    c35: config({ zoll: 3.5, form: 'cine', video: 'o4', name: '3,5" Cinewhoop', doc: '3,5-Zoll-Cinewhoop' }),
    f7: config({ zoll: 7, form: 'x', A: 295, name: '7" Long Range', doc: '7-Zoll-Long-Range' }),
  };
  PRESETS.f5.desc = 'True-X mit 225 mm Achsabstand, 30,5er Stack, Micro-Kamera, 6S-Akku. Alles über Maße veränderbar.';
  PRESETS.r5.desc = `Stretched-X für Rennen: Arme 35° zur Flugrichtung, ${PRESETS.r5.params.Achsabstand} mm Achsabstand, flach und leicht.`;
  PRESETS.s5.desc = `Speed-Drohne mit Stromlinien-Rumpf: Kamera in der Nase, Stack und Akku innen, Motoren ${PRESETS.s5.params.Motorneigung}° geneigt – so liegt der Rumpf im schnellen Flug im Wind.`;
  PRESETS.c35.desc = `Cinewhoop mit Ducts um die Propeller und DJI O4 – für ruhige Aufnahmen nah an Menschen und Häusern. ${PRESETS.c35.params.Achsabstand} mm Achsabstand.`;
  PRESETS.f7.desc = 'Größerer True-X mit 295 mm Achsabstand und 19er Motoren für lange Flüge mit 6S 1500.';

  function build(key) {
    const P = typeof key === 'object' ? key : PRESETS[key] || PRESETS.f5;
    const d = Model.newDoc(P.doc);
    d.params = Object.entries(P.params).map(([k, v]) => param(k, v));
    d.settings.material = 'CFK';
    d.drone = { zoll: P.zoll, form: P.form, video: P.video, motorH: P.motor.h, thrustG: P.thrust || null, thrustSrc: P.thrust ? P.thrustSrc : null };
    if (P.frame) d.drone.frame = { name: P.frame.name, hersteller: P.frame.hersteller, g: P.frame.gewicht_g, a: P.frame.achsabstand_mm, quelle: P.frame.quelle };
    const cine = P.form === 'cine', speed = P.form === 'speed' && !!P.fus;
    const CF = '#3b4148';
    const SY = SYof(frontOff(P.cam && P.cam.l));
    // Speed: Stack vorne, Akku hinten im Rumpf, Motoren geneigt auf Keilen (alles hängt an Rumpfmitte und Motorneigung)
    const fus = speed ? P.fus : null;
    const YS = fus ? `Rumpfmitte - Rumpflänge/2 + ${fus.sl / 2 + 1.5}` : null;
    const YB = fus && P.akku ? `Rumpfmitte + Rumpflänge/2 - ${P.akku.l / 2 + 1.5}` : null;
    const TILT = 'Motorneigung', KZ = 'Armdicke + Keilhöhe', TL = '(Armdicke + 2*Keilhöhe)/cos(Motorneigung) + 2';
    const tiltHoles = (n, sx, sy) => {
      const x0 = sg(sx, MX(sy)), y0 = PY(sy), r = 'Motorlochkreis/2';
      const hs = [[`${x0} + ${r}`, y0, KZ], [x0, `${y0} + ${r}*cos(${TILT})`, `${KZ} + ${r}*sin(${TILT})`], [`${x0} - ${r}`, y0, KZ], [x0, `${y0} - ${r}*cos(${TILT})`, `${KZ} - ${r}*sin(${TILT})`]]
        .map(([x, y, z]) => hole(P.motorScrew, { x, y, z, rx: TILT }, TL, 'Motorschraube'));
      hs.push(item('cylinder', { d: 7, h: `${TL} + 1` }, { name: 'Wellenloch ' + n, role: 'hole', t: { x: x0, y: `${y0} + (${TL})*sin(${TILT})`, z: `${KZ} - (${TL})*cos(${TILT})`, rx: TILT } }));
      return hs;
    };
    // Unterteil: Mittelplatte, vier Arme, Motorauflagen, Löcher
    const kids = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Armdicke' }, { name: 'Mittelplatte', color: CF })];
    for (const [n, sx, sy] of CORNERS) {
      kids.push(item('box', { w: 'Armbreite', d: 'Achsabstand/2', h: 'Armdicke' }, { name: 'Arm ' + n, color: CF, t: { x: sg(sx, MX(sy) + '/2'), y: PY2(sy), rz: sx * sy < 0 ? W(sy) : '-' + W(sy) } }));
      kids.push(item('cylinder', { d: 'Motorlochkreis + 9', h: 'Armdicke' }, { name: 'Motorauflage ' + n, color: CF, t: { x: sg(sx, MX(sy)), y: PY(sy) } }));
    }
    for (const [, sx, sy] of CORNERS) kids.push(hole(P.stackScrew, { x: sg(sx, 'Stack/2'), y: YS ? `${YS} ${sy < 0 ? '-' : '+'} Stack/2` : sg(sy, 'Stack/2'), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Stack-Loch'));
    if (!speed) for (const [, sx, sy] of CORNERS) kids.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Bolzen-Loch'));
    // Speed-Rumpf: der Akkugurt läuft durch zwei Schlitze neben dem Akku
    else if (YB) for (const s of [1, -1]) kids.push(item('box', { w: 3, d: 14, h: 'Armdicke + 2' }, { name: 'Gurtschlitz', role: 'hole', t: { x: sg(s, 'Plattenbreite/2 - 3.5'), y: YB, z: -1 } }));
    if (speed) for (const [n, sx, sy] of CORNERS) kids.push(...tiltHoles(n, sx, sy));
    else for (const [n, sx, sy] of CORNERS) {
      // vier Motorschrauben als Kreismuster um die Motormitte (Lochkreis = Motorlochkreis)
      const g = Model.newItem('group', {}, { name: 'Motorlöcher ' + n, role: 'hole' });
      g.p = { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx: sg(sx, MX(sy)), cy: PY(sy) };
      g.children = [hole(P.motorScrew, { x: `${sg(sx, MX(sy))} + Motorlochkreis/2`, y: PY(sy), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Motorschraube')];
      kids.push(g);
      kids.push(item('cylinder', { d: 7, h: 'Armdicke + 2' }, { name: 'Wellenloch ' + n, role: 'hole', t: { x: sg(sx, MX(sy)), y: PY(sy), z: -1 } }));
    }
    const out = [group('Unterteil', kids, { color: CF })];
    if (!speed) {
      // Abstandsbolzen mit Gewinde
      const bk = [];
      for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 5, h: 'Bolzenhöhe' }, { name: 'Bolzen', color: '#9aa3ad', t: { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke' } }));
      for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 2.5, h: 'Bolzenhöhe + 2' }, { name: 'Gewinde', role: 'hole', t: { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke - 1' } }));
      out.push(group('Abstandsbolzen', bk, { color: '#9aa3ad', mat: 'Alu 7075' }));
      // Oberplatte mit Schlitzen für den Akkugurt
      const ok = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Plattendicke' }, { name: 'Platte', color: CF, t: { z: 'Armdicke + Bolzenhöhe' } })];
      for (const [, sx, sy] of CORNERS) ok.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY(sy)), z: 'Armdicke + Bolzenhöhe + Plattendicke + 1' }, 'Plattendicke + 2', 'Bolzen-Loch'));
      for (const s of [1, -1]) ok.push(item('box', { w: 3, d: 21, h: 'Plattendicke + 2' }, { name: 'Gurtschlitz', role: 'hole', t: { x: sg(s, 'Plattenbreite/2 - 6'), z: 'Armdicke + Bolzenhöhe - 1' } }));
      out.push(group('Oberplatte', ok, { color: CF }));
      // Kamerahalter: zwei Seitenwangen mit M2-Loch auf Kamerahöhe
      const kh = [];
      for (const s of [1, -1]) kh.push(item('box', { w: 2, d: 12, h: 'Bolzenhöhe' }, { name: 'Wange', color: '#5b6470', t: { x: sg(s, 'Kamerabreite/2 + 1.2'), y: '-(Plattenlänge/2 - 8)', z: 'Armdicke' } }));
      kh.push(item('cylinder', { d: 2.2, h: 'Kamerabreite + 10' }, { name: 'Kameraschraube M2', role: 'hole', t: { x: '-(Kamerabreite/2 + 5)', y: '-(Plattenlänge/2 - 8)', z: 'Armdicke + Bolzenhöhe/2', ry: 90 } }));
      out.push(group('Kamerahalter', kh, { color: '#5b6470', mat: 'TPU 95A' }));
    } else {
      // Stromlinien-Rumpf (gedruckt): hohl, Nase und Heck offen; unten offen nur über der Mittelplatte
      const rk = [
        item('part', { lib: 'aeroBody', d: 'Rumpfdurchmesser', ln: 'Nasenlänge', lc: 'Rumpflänge', lt: 'Hecklänge', dn: 'Nasenöffnung', dt: 'Hecköffnung', wall: 'Haubenwand' }, { name: 'Haube', t: { y: 'Rumpfmitte', z: 'Armdicke + Rumpfachse' } }),
        item('box', { w: 'Rumpfdurchmesser + 2', d: 'Plattenlänge + 1', h: 'Rumpfdurchmesser' }, { name: 'Auflage auf der Mittelplatte', role: 'hole', t: { z: 'Armdicke - Rumpfdurchmesser' } }),
      ];
      out.push(group('Rumpf', rk, { color: '#d0533f', mat: 'PETG' }));
      // Keile unter den Motoren: oben schräg (Motorneigung), vorne 1 mm dick
      const kk = [];
      for (const [n, sx, sy] of CORNERS) {
        const x0 = sg(sx, MX(sy)), y0 = PY(sy);
        kk.push(item('cylinder', { d: 'Motorlochkreis + 9', h: '2*Keilhöhe' }, { name: 'Keil ' + n, color: '#5b6470', t: { x: x0, y: y0, z: 'Armdicke' } }));
        kk.push(item('box', { w: 'Motorlochkreis + 24', d: 'Motorlochkreis + 24', h: 40 }, { name: 'Schräge ' + n, role: 'hole', t: { x: x0, y: y0, z: KZ, rx: TILT } }));
        kk.push(...tiltHoles(n, sx, sy));
      }
      out.push(group('Motorkeile', kk, { color: '#5b6470', mat: 'PETG' }));
    }
    if (cine) {
      // Ducts: Ringe um die Propeller, unten auf den Armen
      const dk = CORNERS.map(([n, sx, sy]) => item('tube', { d: 'Propeller*25.4 + 2*(Ductspalt + Ductwand)', wall: 'Ductwand', h: 'Ducthöhe' }, { name: 'Duct ' + n, color: '#7a8794', t: { x: sg(sx, MX(sy)), y: PY(sy), z: 'Armdicke' } }));
      out.push(group('Ducts (4×)', dk, { color: '#7a8794', mat: 'PC' }));
    }
    // Kaufteile in ihrer echten Form (Kern: buildBuy) mit festem Gewicht aus dem Datenblatt
    const buyItem = (lib, p, o) => item('part', { lib, ...p }, o);
    out.push(buyItem('buyStack', { a: 'Stack', h: 12, size: P.stackScrew }, { name: 'Stack (FC + ESC)', color: '#3a8f6a', t: { ...(YS ? { y: YS } : {}), z: 'Armdicke + 4' }, massG: P.stackG }));
    if (P.vtx) {
      const vs = DroneLib.videoShape({ name: P.vtx.src, lochbild: P.vtx.lochbild });
      const vt = { ...(YS ? { y: YS } : {}), z: 'Armdicke + 16' };
      out.push(vs.lib === 'buyVtx' ? buyItem('buyVtx', { w: P.vtx.b, d: P.vtx.l, h: P.vtx.h, a: vs.a }, { name: P.vtx.name, color: '#16202b', t: vt, massG: P.vtx.g })
        : buyItem('buyPcb', { w: P.vtx.b, d: P.vtx.l, h: P.vtx.h }, { name: P.vtx.name, color: '#16202b', t: vt, massG: P.vtx.g }));
    }
    const camD = P.cam.l || 18, camH = P.cam.h || 'Kamerabreite';
    const camT = speed ? { y: `Rumpfmitte - Rumpflänge/2 - Nasenlänge + ${camD / 2 + 0.5}`, z: `Armdicke + Rumpfachse - (${camH})/2` } : { y: '-(Plattenlänge/2 - 8)', z: `Armdicke + Bolzenhöhe/2 - (${camH})/2` };
    out.push(buyItem('buyCamera', { w: P.cam.b || 'Kamerabreite', d: camD, h: camH }, { name: P.cam.name, color: '#16202b', t: camT, massG: P.cam.g }));
    const mk = [], pk = [];
    for (const [n, sx, sy] of CORNERS) {
      const mh = P.motor.h;
      const mt = speed ? { x: sg(sx, MX(sy)), y: PY(sy), z: KZ, rx: TILT } : { x: sg(sx, MX(sy)), y: PY(sy), z: 'Armdicke' };
      const pt = speed ? { x: sg(sx, MX(sy)), y: `${PY(sy)} - ${mh}*sin(${TILT})`, z: `${KZ} + ${mh}*cos(${TILT})`, rx: TILT } : { x: sg(sx, MX(sy)), y: PY(sy), z: `Armdicke + ${mh}` };
      mk.push(buyItem('buyMotor', { d: P.motor.d, h: mh, lk: 'Motorlochkreis', size: P.motorScrew }, { name: 'Motor ' + n, color: '#b9c2cb', t: mt }));
      // hinten rechts und vorne links drehen andersherum: gespiegelte Blätter
      pk.push(buyItem('buyProp', { zoll: 'Propeller', blades: 3, pitch: sx * sy < 0 ? 13 : -13 }, { name: 'Propeller ' + n, color: '#e8833a', t: pt }));
    }
    out.push(group(P.motor.name + ' (4×)', mk, { color: '#b9c2cb', massG: P.motor.g === '' ? '' : `4*${P.motor.g}` }));
    out.push(group(`Propeller ${String(P.zoll).replace('.', ',')}" (4×)`, pk, { color: '#e8833a', massG: `4*${P.prop}` }));
    // Akku oben auf der Oberplatte – beim Speed-Rumpf im Rumpf hinter dem Stack
    if (P.akku) out.push(buyItem('buyBattery', { w: P.akku.w, d: P.akku.l, h: P.akku.h }, { name: P.akku.name, color: '#e2b53a', t: speed ? { y: YB, z: 'Armdicke + 0.5' } : { z: 'Armdicke + Bolzenhöhe + Plattendicke' }, massG: P.akku.g }));
    d.items = out;
    return d;
  }
  // Vorschaubild: Rahmen schräg von oben (Ellipsen = Propellerkreise); form wie in FORMS
  function svg(big, form) {
    const r = big ? 21 : 19, k = form === 'stretch' ? 0.82 : 0.62, w = form === 'stretch' ? 0.8 : 1;
    const pts = [[55 + r * w, 28 - r * k], [55 - r * w, 28 - r * k], [55 + r * w, 28 + r * k], [55 - r * w, 28 + r * k]];
    const arms = pts.map(([x, y]) => `<path d="M55 28L${x} ${y}" class="line" stroke-width="5" stroke-linecap="round"/>`).join('');
    const props = (rx, ry, attr) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" class="a2"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${attr}/>`).join('');
    const disc = 'class="b1" fill-opacity=".15"';
    if (form === 'cine') return arms + '<rect x="47" y="18" width="16" height="20" rx="2" class="a3"/>' + props(13, 7, 'class="line" fill="none" stroke-width="2.5"');
    if (form === 'speed') return arms + '<path d="M55 6L62 16V40L58 50H52L48 40V16Z" class="a1"/><circle cx="55" cy="9" r="2.4" class="a3"/>' + props(11, 6, disc);
    return arms + '<rect x="47" y="16" width="16" height="24" rx="2" class="a3"/>' + props(big ? 13 : 11, big ? 7 : 6, disc);
  }
  const LIST = Object.entries(PRESETS).map(([k, P]) => ({ id: 'drone-' + k, name: P.name, desc: P.desc, build: () => build(k), svg: svg(k === 'f7', P.form), drone: true }));
  const frames = () => DroneLib.frames();
  return { build, config, fromFrame, frames, maxTilt, wheelbase, tipGap, bodyGap, PRESETS, LIST, SIZES, FORMS, VIDEO, ZOLL };
})();

// ================= Frame-Assistent und Drohnen-Bibliothek in der Oberfläche =================
const DroneUI = (() => {
  // Frame-Assistent: Größe, Form, Stack, Motor, Video, Akku wählen – mit Vorschau der wichtigsten Werte
  // Vorlage: ein Rahmen eines Herstellers füllt Größe, Form und feste Maße; Ändern von Größe, Form oder Achsabstand löst ihn wieder
  const FRAME_KEYS = ['frame', 'Armdicke', 'Plattendicke', 'bolzen', 'ductGap'];
  function assistant() {
    const o = { zoll: 5, form: 'x', stack: 30.5, motor: '2207', video: 'analog', akku: '6S 1300 mAh', A: null };
    const body = h('div', { class: 'frame-assist' });
    const out = h('div', { class: 'fa-out', id: 'fa-out' });
    const sel = (id, label, val, opts, fn) => UI.selectField({ id, label, value: String(val), options: opts, onChange: fn });
    const motors = DroneLib.motors(), akkus = DroneLib.akkus(), frames = DroneLib.frames();
    const free = () => { for (const k of FRAME_KEYS) delete o[k]; };
    const zs = (z) => String(z).replace('.', ',');
    const draw = () => {
      body.innerHTML = '';
      const F = DroneTpl.FORMS[o.form];
      const cfg = DroneTpl.config(o), A = cfg.params.Achsabstand;
      const f = h('div', { class: 'fields' });
      f.append(
        sel('fa-vorlage', 'Vorlage', o.frame ? o.frame.id : '', [['', 'Eigener Rahmen'], ...frames.map((x) => [x.id, `${x.hersteller} ${x.name} (${zs(x.zoll)}")`])], (v) => {
          const fr = frames.find((x) => x.id === v);
          free();
          if (fr) Object.assign(o, DroneTpl.fromFrame(fr)); else o.A = null;
          draw();
        }),
        sel('fa-zoll', 'Propeller', o.zoll, DroneTpl.ZOLL.map((z) => [String(z), `${zs(z)} Zoll (${fmt(z * 25.4, 1)} mm)`]), (v) => { free(); o.zoll = +v; const s = DroneTpl.SIZES[o.zoll]; o.stack = s.stack; o.motor = s.motor; o.akku = s.akku; o.A = null; draw(); }),
        sel('fa-form', 'Rahmenform', o.form, Object.entries(DroneTpl.FORMS).map(([k, v]) => [k, `${v[0]} (${v[1]}°${v[1] !== v[2] ? ' / ' + v[2] + '°' : ''})`]), (v) => { free(); o.form = v; o.A = null; draw(); }),
        sel('fa-stack', 'Stack', o.stack, DroneLib.stacks().map((s) => [String(s.a), `${s.name} · ${s.screw}`]), (v) => { o.stack = +v; draw(); }),
        sel('fa-motor', 'Motor', o.motor, motors.map((m) => [m.stator, `${m.stator} · Lochkreis ${fmt(m.circle, 1)} · ${m.g !== '' ? fmt(m.g, 1) + ' g' : 'Gewicht eintragen'}`]), (v) => { o.motor = v; draw(); }),
        sel('fa-video', 'Videosystem', o.video, Object.entries(DroneTpl.VIDEO).map(([k, v]) => [k, v[0]]), (v) => { o.video = v; draw(); }),
        sel('fa-akku', 'Akku', o.akku || '', [['', 'Keiner'], ...akkus.map((a) => [a.name.replace(/^Akku /, ''), `${a.name.replace(/^Akku /, '')} · ca. ${a.g} g`])], (v) => { o.akku = v || null; draw(); }),
        UI.numField({ id: 'fa-a', label: 'Achsabstand', value: A, onCommit: (v) => { const n = parseFloat(String(v).replace(',', '.')); free(); o.A = isFinite(n) && n > 0 ? n : null; draw(); } }),
      );
      if (o.form === 'speed') f.append(UI.numField({ id: 'fa-tilt', label: 'Motorneigung (so schräg fliegt sie schnell)', value: cfg.params.Motorneigung, unit: '°', onCommit: (v) => { const n = parseFloat(String(v).replace(',', '.')); o.tilt = isFinite(n) ? Math.max(0, Math.min(45, n)) : null; draw(); } }));
      body.append(f);
      // Vorschau der wichtigsten Werte
      const gap = DroneTpl.tipGap(A, o.zoll, F[1], F[2]);
      const m = motors.find((x) => x.stator === o.motor);
      const warn = [];
      if (gap < 0) warn.push('Die Propeller überlappen sich – größerer Achsabstand nötig.');
      else if (gap < o.zoll * 25.4 * 0.08) warn.push('Sehr wenig Luft zwischen den Propellern.');
      if (m && m.props && (o.zoll < m.props[0] - 0.01 || o.zoll > m.props[1] + 0.01)) warn.push(`Motor ${m.stator} passt eher zu ${fmt(m.props[0], 1)}–${fmt(m.props[1], 1)}"-Propellern.`);
      if (o.form === 'speed') { const mt = DroneTpl.maxTilt(cfg); if (cfg.params.Motorneigung > mt) warn.push(`Bei ${fmt(cfg.params.Motorneigung, 0)}° Motorneigung streifen die hinteren Propeller ihre Arme – höchstens ${mt}° passen.`); }
      const P = cfg.params, extra = [];
      if (o.form === 'speed') extra.push(['Rumpf', `Ø ${fmt(P.Rumpfdurchmesser, 0)} mm · ${fmt(P.Rumpflänge + P.Nasenlänge + P.Hecklänge, 0)} mm lang · Akku innen`]);
      if (o.form === 'cine') extra.push(['Ducts', `innen Ø ${fmt(o.zoll * 25.4 + 2 * P.Ductspalt, 1)} mm · ${fmt(P.Bolzenhöhe - 1, 0)} mm hoch`]);
      const fr = o.frame, grown = fr && A !== fr.achsabstand_mm;
      out.innerHTML = `<div class="mini-list">
        <div class="mini-row"><span class="grow">Achsabstand</span><b class="mono">${fmt(A, 0)} mm${o.A ? (fr ? (A === fr.achsabstand_mm ? ' (Hersteller)' : ' (angepasst)') : '') : ' (berechnet)'}</b></div>
        <div class="mini-row"><span class="grow">Luft zwischen den Propellerspitzen</span><b class="mono" id="fa-gap">${fmt(gap, 1)} mm</b></div>
        <div class="mini-row"><span class="grow">Motorlochkreis</span><b class="mono">${m ? fmt(m.circle, 1) + ' mm · ' + m.screw : '–'}</b></div>
        ${extra.map(([a, b]) => `<div class="mini-row"><span class="grow">${a}</span><b class="mono">${b}</b></div>`).join('')}</div>` +
        (grown ? `<div class="hint-box warn" id="fa-grown">Der Hersteller hat ${fmt(fr.achsabstand_mm, 0)} mm Achsabstand. Tracerys einfacher Rumpf braucht ${fmt(A, 0)} mm, damit Kamera und Bolzen nicht in die Propeller${o.form === 'cine' ? '-Ducts' : 'kreise'} ragen – das Original baut dort enger.</div>` : '') +
        (fr ? `<div class="hint-box" id="fa-frame"><b>Nachbau nach Herstellermaßen</b> – Achsabstand ${fmt(fr.achsabstand_mm, 0)} mm, Arme ${fmt(fr.armdicke_mm, 1)} mm${fr.stack_mm ? `, Stack ${fmt(fr.stack_mm, 1)} mm` : ''}. Die Umrisse sind vereinfacht. Original-Rahmen: ${fmt(fr.gewicht_g, 1)} g · <a href="${esc(fr.quelle)}" target="_blank" rel="noopener">Quelle</a>${fr.notiz ? `<br><span class="muted">${esc(fr.notiz)}</span>` : ''}</div>` : '') +
        (warn.length ? `<div class="hint-box warn" id="fa-warn">${warn.join('<br>')}</div>` : grown ? '' : '<div class="hint-box">Alles passt. Nach dem Bauen änderst du jedes Maß links unter „Maße“.</div>');
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
