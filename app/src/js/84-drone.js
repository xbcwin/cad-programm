// ================= Drohnen-Vorlagen: parametrischer Freestyle-Rahmen =================
// Ein vollständiger, veränderbarer Rohbau: Unterteil mit Armen, Abstandsbolzen, Oberplatte,
// Kamerahalter und Platzhalter für Stack, Kamera, Motoren, Propeller und Akku.
// Vorne ist −Y wie in der Ansicht „Vorne“ (Kamera), Motoren sitzen auf einem Kreis mit dem Achsabstand als Durchmesser.
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
    if (o.fin) x.finishes = o.fin.map((f) => ({ id: uid('f'), ...f }));
    return x;
  };
  const group = (name, children, o = {}) => {
    const g = item('group', {}, { ...o, name, color: o.color || (children.find((c) => c.role !== 'hole') || children[0]).color });
    g.children = children;
    return g;
  };
  const hole = (size, t, len = 'Armdicke + 2', name) => {
    const x = Model.newItem('part', { lib: 'screwHole', size, head: 'none', fit: 'medium', length: len }, { name: name || 'Loch ' + size, role: 'hole' });
    Object.assign(x.t, t); return x;
  };
  // vier Ecken: vorne rechts, vorne links, hinten rechts, hinten links
  const CORNERS = [['vorne rechts', 1, -1], ['vorne links', -1, -1], ['hinten rechts', 1, 1], ['hinten links', -1, 1]];
  const sg = (s, e) => (s > 0 ? `(${e})` : `-(${e})`);
  const MX = 'Achsabstand/2*sin(Armwinkel)', MY = 'Achsabstand/2*cos(Armwinkel)';
  const SX = 'Plattenbreite/2 - 4', SY = 'Plattenlänge/2 - 8';   // Abstandsbolzen

  const PRESETS = {
    f5: {
      name: '5" Freestyle', doc: '5-Zoll-Freestyle',
      desc: 'True-X mit 225 mm Achsabstand, 30,5er Stack, Micro-Kamera, 6S-Akku. Alles über Maße veränderbar.',
      params: { Achsabstand: 225, Armwinkel: 45, Armbreite: 13, Armdicke: 5, Plattenbreite: 42, Plattenlänge: 130, Plattendicke: 2, Bolzenhöhe: 25, Stack: 30.5, Motorlochkreis: 16, Kamerabreite: 19, Propeller: 5 },
      motorScrew: 'M3', motor: { name: 'Motor 2207', d: 28.5, h: 19.7, g: 33.8 }, prop: 4.5,
      akku: { name: 'Akku 6S 1300', w: 38, l: 75, h: 39, g: 215 }, cam: 6, stack: 20,
    },
    f7: {
      name: '7" Long Range', doc: '7-Zoll-Long-Range',
      desc: 'Größerer True-X mit 295 mm Achsabstand und 19er Motoren für lange Flüge mit 6S 1500.',
      params: { Achsabstand: 295, Armwinkel: 45, Armbreite: 15, Armdicke: 6, Plattenbreite: 45, Plattenlänge: 150, Plattendicke: 2.5, Bolzenhöhe: 30, Stack: 30.5, Motorlochkreis: 19, Kamerabreite: 19, Propeller: 7 },
      motorScrew: 'M3', motor: { name: 'Motor 2806.5', d: 35.1, h: 21.3, g: 54 }, prop: 7,
      akku: { name: 'Akku 6S 1500', w: 39, l: 78, h: 43, g: 250 }, cam: 6, stack: 20,
    },
  };

  function build(key) {
    const P = PRESETS[key] || PRESETS.f5;
    const d = Model.newDoc(P.doc);
    d.params = Object.entries(P.params).map(([k, v]) => param(k, v));
    d.settings.material = 'CFK';
    const CF = '#3b4148';
    // Unterteil: Mittelplatte, vier Arme, Motorauflagen, Löcher
    const kids = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Armdicke' }, { name: 'Mittelplatte', color: CF })];
    for (const [n, sx, sy] of CORNERS) {
      kids.push(item('box', { w: 'Armbreite', d: 'Achsabstand/2', h: 'Armdicke' }, { name: 'Arm ' + n, color: CF, t: { x: sg(sx, MX + '/2'), y: sg(sy, MY + '/2'), rz: sx * sy > 0 ? '-Armwinkel' : 'Armwinkel' } }));
      kids.push(item('cylinder', { d: 'Motorlochkreis + 9', h: 'Armdicke' }, { name: 'Motorauflage ' + n, color: CF, t: { x: sg(sx, MX), y: sg(sy, MY) } }));
    }
    for (const [, sx, sy] of CORNERS) kids.push(hole('M3', { x: sg(sx, 'Stack/2'), y: sg(sy, 'Stack/2'), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Stack-Loch'));
    for (const [, sx, sy] of CORNERS) kids.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Bolzen-Loch'));
    for (const [n, sx, sy] of CORNERS) {
      // vier Motorschrauben als Kreismuster um die Motormitte (Lochkreis = Motorlochkreis)
      const g = Model.newItem('group', {}, { name: 'Motorlöcher ' + n, role: 'hole' });
      g.p = { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx: sg(sx, MX), cy: sg(sy, MY) };
      g.children = [hole(P.motorScrew, { x: `${sg(sx, MX)} + Motorlochkreis/2`, y: sg(sy, MY), z: 'Armdicke + 1' }, 'Armdicke + 2', 'Motorschraube')];
      kids.push(g);
      kids.push(item('cylinder', { d: 7, h: 'Armdicke + 2' }, { name: 'Wellenloch ' + n, role: 'hole', t: { x: sg(sx, MX), y: sg(sy, MY), z: -1 } }));
    }
    const unten = group('Unterteil', kids, { color: CF });
    // Abstandsbolzen mit Gewinde
    const bk = [];
    for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 5, h: 'Bolzenhöhe' }, { name: 'Bolzen', color: '#9aa3ad', t: { x: sg(sx, SX), y: sg(sy, SY), z: 'Armdicke' } }));
    for (const [, sx, sy] of CORNERS) bk.push(item('cylinder', { d: 2.5, h: 'Bolzenhöhe + 2' }, { name: 'Gewinde', role: 'hole', t: { x: sg(sx, SX), y: sg(sy, SY), z: 'Armdicke - 1' } }));
    const bolzen = group('Abstandsbolzen', bk, { color: '#9aa3ad', mat: 'Alu 7075' });
    // Oberplatte mit Schlitzen für den Akkugurt
    const ok = [item('box', { w: 'Plattenbreite', d: 'Plattenlänge', h: 'Plattendicke' }, { name: 'Platte', color: CF, t: { z: 'Armdicke + Bolzenhöhe' } })];
    for (const [, sx, sy] of CORNERS) ok.push(hole('M3', { x: sg(sx, SX), y: sg(sy, SY), z: 'Armdicke + Bolzenhöhe + Plattendicke + 1' }, 'Plattendicke + 2', 'Bolzen-Loch'));
    for (const s of [1, -1]) ok.push(item('box', { w: 3, d: 21, h: 'Plattendicke + 2' }, { name: 'Gurtschlitz', role: 'hole', t: { x: sg(s, 'Plattenbreite/2 - 6'), z: 'Armdicke + Bolzenhöhe - 1' } }));
    const oben = group('Oberplatte', ok, { color: CF });
    // Kamerahalter: zwei Seitenwangen mit M2-Loch auf Kamerahöhe
    const kh = [];
    for (const s of [1, -1]) kh.push(item('box', { w: 2, d: 12, h: 'Bolzenhöhe' }, { name: 'Wange', color: '#5b6470', t: { x: sg(s, 'Kamerabreite/2 + 1.2'), y: '-(Plattenlänge/2 - 8)', z: 'Armdicke' } }));
    kh.push(item('cylinder', { d: 2.2, h: 'Kamerabreite + 10' }, { name: 'Kameraschraube M2', role: 'hole', t: { x: '-(Kamerabreite/2 + 5)', y: '-(Plattenlänge/2 - 8)', z: 'Armdicke + Bolzenhöhe/2', ry: 90 } }));
    const halter = group('Kamerahalter', kh, { color: '#5b6470', mat: 'TPU 95A' });
    // Platzhalter für Kaufteile (festes Gewicht, ca.-Werte)
    const stack = item('box', { w: 'Stack + 5.5', d: 'Stack + 5.5', h: 12 }, { name: 'Stack (Platzhalter)', color: '#3a8f6a', t: { z: 'Armdicke + 4' }, massG: P.stack });
    const cam = item('box', { w: 'Kamerabreite', d: 18, h: 'Kamerabreite' }, { name: 'Kamera (Platzhalter)', color: '#16202b', t: { y: '-(Plattenlänge/2 - 8)', z: 'Armdicke + Bolzenhöhe/2 - Kamerabreite/2' }, massG: P.cam });
    const mk = [], pk = [];
    for (const [n, sx, sy] of CORNERS) {
      mk.push(item('cylinder', { d: P.motor.d, h: P.motor.h }, { name: 'Motor ' + n, color: '#b9c2cb', t: { x: sg(sx, MX), y: sg(sy, MY), z: 'Armdicke' } }));
      pk.push(item('tube', { d: 'Propeller*25.4', wall: 1.2, h: 1 }, { name: 'Propellerkreis ' + n, color: '#e8833a', t: { x: sg(sx, MX), y: sg(sy, MY), z: `Armdicke + ${P.motor.h + 3}` } }));
    }
    const motoren = group(P.motor.name + ' (4×, Platzhalter)', mk, { color: '#b9c2cb', massG: `4*${P.motor.g}` });
    const props = group(`Propeller ${P.params.Propeller}" (Kreise)`, pk, { color: '#e8833a', massG: `4*${P.prop}` });
    const akku = item('box', { w: P.akku.w, d: P.akku.l, h: P.akku.h }, { name: P.akku.name + ' (Platzhalter)', color: '#e2b53a', t: { z: 'Armdicke + Bolzenhöhe + Plattendicke' }, massG: P.akku.g });
    d.items = [unten, bolzen, oben, halter, stack, cam, motoren, props, akku];
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
  return { build, PRESETS, LIST };
})();
