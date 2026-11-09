// ================= Drohnen-Bibliothek: Standardmaße und Kaufteile =================
// Die Daten kommen beim Bauen aus app/data (fpv-masse.json, bauteile.json – Entwurf Gemini, geprüft).
const FPV_DATA = /*JSON:fpv-masse.json*/null;
const BUY_DATA = /*JSON:bauteile.json*/null;
const THRUST_DATA = /*JSON:schub.json*/null;
const FRAME_DATA = /*JSON:rahmen.json*/null;
const DroneLib = (() => {
  // Motoren, deren Höhe und Gewicht aus einem Datenblatt stammen (sonst Schätzwerte, markiert)
  // Datenblätter (Händler- oder Herstellerseite, nachgeprüft); lk = Lochkreis dieses Motors, wenn er vom ersten Wert abweicht.
  // 1404, 2004, 2306 aus Gemini Prompt M am 22.10.2026 bestätigt; beim 1404 und 2004 sagt die Quelle nicht, ob die Höhe die Welle einschließt.
  const MOTOR_SHEET = {
    '1404': { d: 19.9, h: 13.5, g: 9.1, lk: 9, src: 'iFlight XING2 1404' },
    '2004': { d: 24.3, h: 17.25, g: 16.4, src: 'T-Motor F2004' },
    '2207': { d: 28.5, h: 19.7, g: 33.8, src: 'iFlight XING-E 2207' },
    '2306': { d: 30, h: 18.7, g: 32.5, src: 'iFlight XING2 2306' },
    '2806.5': { d: 35.1, h: 21.3, g: 54, src: 'iFlight XING 2806.5' },
  };
  function motors() {
    return (FPV_DATA.motoren || []).map((m) => {
      const s = MOTOR_SHEET[m.stator];
      const d = s && s.d ? s.d : m.glocke_d_mm;
      return { stator: m.stator, d, h: s && s.h ? s.h : round(d * 0.7, 1), g: s ? s.g : '', circle: s && s.lk ? s.lk : m.lochkreis_d_mm[m.lochkreis_d_mm.length - 1], screw: m.schraube.split(' ')[0], props: m.propeller_zoll, sheet: !!s, est: !(s && s.h), src: s ? s.src : null };
    });
  }
  function motor(stator) { return motors().find((m) => m.stator === stator) || motors().find((m) => m.stator === '2207'); }
  function akkus() { return (FPV_DATA.akkus || []).map((a) => ({ name: 'Akku ' + a.typ, w: a.b_mm, l: a.l_mm, h: a.h_mm, g: a.gewicht_g, produkt: a.produkt || null })); }
  function akku(typ) { return akkus().find((a) => a.name === typ || a.name === 'Akku ' + typ) || null; }
  function stacks() { return (FPV_DATA.stack || []).map((s) => ({ name: s.name, a: s.quadrat_mm, screw: s.schraube.startsWith('M2') ? 'M2' : 'M3', board: s.platine_mm })); }
  function cams() { return (FPV_DATA.kameras || []).map((c) => ({ name: c.name, w: c.breite_mm })); }
  // Kaufteile mit ihrer echten Form (Kern: buildBuy) und festem Gewicht aus dem Datenblatt
  const CATS = [
    ['motor', 'Motoren', 'motor'], ['akku', 'Akkus', 'battery'], ['video', 'Video', 'fpvCam'], ['funk', 'Empfang und GPS', 'antenna'],
    ['action', 'Action-Kameras', 'cube'], ['klein', 'Kleinteile', 'bolt'], ['loch', 'Lochbilder und Bausteine', 'stack'],
  ];
  const COL = { motor: '#b9c2cb', akku: '#e2b53a', video: '#16202b', funk: '#5b6470', action: '#3f7fd6', klein: '#d24a3c' };
  function buyParts(cat) {
    const out = [];
    const part = (lib, p, name, g, extra = {}) => ({ buy: true, kind: 'part', p: { lib, ...p }, name, massG: g == null ? '' : g, color: COL[cat], ...extra });
    const box = (lib, name, l, b, hgt, g, extra = {}) => part(lib, { w: b, d: l, h: hgt }, name, g, extra);
    if (cat === 'motor') for (const m of motors()) out.push(part('buyMotor', { d: m.d, h: m.h, lk: m.circle, size: motorScrew(m) }, 'Motor ' + m.stator, m.g, { color: COL.motor, info: m.sheet ? `${m.src}: ${fmt(m.g, 1)} g` + (m.est ? ' (Höhe geschätzt)' : '') : 'Höhe geschätzt, Gewicht bitte eintragen' }));
    if (cat === 'akku') for (const a of akkus()) out.push(box('buyBattery', a.name, a.l, a.w, a.h, a.g, { info: a.produkt ? `${a.produkt}: ${fmt(a.g, 0)} g` : `ca. ${a.g} g` }));
    if (cat === 'video') {
      for (const v of BUY_DATA.videosender || []) {
        const info = { info: v.gewicht_g != null ? `${fmt(v.gewicht_g, 1)} g` + (v.unsicher ? ' (abgeleitet)' : '') : 'Gewicht bitte eintragen' };
        const t = videoShape(v);
        out.push(t.lib === 'buyVtx' ? part('buyVtx', { w: v.b_mm, d: v.l_mm, h: v.h_mm, a: t.a }, v.name, v.gewicht_g, info) : box(t.lib, v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, info));
      }
      for (const c of cams()) out.push(part('buyCamera', { w: c.w, d: 20, h: c.w }, `Kamera ${c.name} (analog)`, '', { info: `${fmt(c.w, 1)} mm breit, Gewicht eintragen` }));
    }
    if (cat === 'funk') {
      for (const v of BUY_DATA.empfaenger || []) out.push(box('buyPcb', v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: `${fmt(v.gewicht_g, 1)} g` }));
      for (const v of BUY_DATA.gps || []) out.push(box('buyGps', v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: `${fmt(v.gewicht_g, 1)} g` }));
    }
    if (cat === 'action') for (const v of BUY_DATA.actioncam || []) out.push(box('buyActioncam', v.name, v.b_mm, v.l_mm, v.h_mm, v.gewicht_g, { info: `${fmt(v.gewicht_g, 1)} g` }));
    if (cat === 'klein') {
      for (const v of BUY_DATA.stecker || []) out.push(box('buyPlug', v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: `ca. ${fmt(v.gewicht_g, 1)} g` }));
      for (const v of BUY_DATA.kondensator || []) out.push(part('buyCap', { d: v.b_mm, h: v.l_mm }, 'Kondensator ' + v.name.replace(/^Panasonic /, ''), '', { info: 'Maße vom Hersteller, Gewicht eintragen' }));
    }
    return out;
  }
  // Lochbilder und Bausteine sind Bauteile aus der Bibliothek mit fertigen Einstellungen
  function holeParts() {
    const hp = LIBMAP.holePattern;
    const mk = (label, p) => ({ part: hp, params: { ...libDefaults(hp), ...p }, name: label });
    return [
      mk('Stack 30,5', { pat: 'stack305', size: 'M3' }), mk('Stack 25,5', { pat: 'stack255', size: 'M2' }), mk('Stack 20', { pat: 'stack20', size: 'M2' }), mk('Stack 16', { pat: 'stack16', size: 'M2' }),
      mk('Motor 19', { pat: 'motor19', size: 'M3' }), mk('Motor 16', { pat: 'motor16', size: 'M3' }), mk('Motor 12', { pat: 'motor12', size: 'M2' }), mk('Motor 9', { pat: 'motor9', size: 'M2' }),
      { part: LIBMAP.zipTie, params: libDefaults(LIBMAP.zipTie), name: 'Kabelbinder' },
      { part: LIBMAP.slotHole, params: { ...libDefaults(LIBMAP.slotHole), len: 21, w: 3 }, name: 'Gurtschlitz' },
      { part: LIBMAP.goproMount, params: libDefaults(LIBMAP.goproMount), name: 'GoPro-Halterung' },
      { part: LIBMAP.xt60Holder, params: libDefaults(LIBMAP.xt60Holder), name: 'XT60-Halter' },
      { part: LIBMAP.antennaMount, params: libDefaults(LIBMAP.antennaMount), name: 'Antennenhalter' },
      { part: LIBMAP.armFairing, params: libDefaults(LIBMAP.armFairing), name: 'Armverkleidung' },
    ];
  }
  // Schub pro Motor als Vorgabe – nur geprüfte Messungen aus Herstellerangaben (schub.json)
  function thrust(stator) {
    const m = (THRUST_DATA.motoren || []).find((x) => x.stator === stator && x.geprueft && x.max_schub_g);
    return m ? { g: m.max_schub_g, src: `${m.motor}${m.kv ? ' ' + m.kv + 'KV' : ''}, ${m.zellen}${m.propeller ? ', ' + m.propeller : ''}`, url: m.quelle } : null;
  }
  // welche Form ein Videoteil bekommt: Kamera, kleine Platine (analog) oder Sender mit Lochbild
  function videoShape(v) {
    if (/Kamera/i.test(v.name)) return { lib: 'buyCamera' };
    if (/Unify|analog/i.test(v.name)) return { lib: 'buyPcb' };
    const a = parseFloat(String(v.lochbild || '').replace(',', '.'));
    return { lib: 'buyVtx', a: isFinite(a) ? a : 0 };
  }
  const motorScrew = (m) => (String(m.screw || 'M3').startsWith('M1') ? 'M2' : m.screw || 'M3');
  // Rahmen von Herstellern (rahmen.json, Maße mit der Herstellerseite verglichen)
  function frames() { return ((FRAME_DATA && FRAME_DATA.rahmen) || []).map((f, i) => ({ id: 'fr' + i, ...f })); }
  return { motors, motor, akkus, akku, stacks, cams, CATS, buyParts, holeParts, thrust, videoShape, frames };
})();
