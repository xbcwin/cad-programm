// ================= Drohnen-Bibliothek: Standardmaße und Kaufteile =================
// Die Daten kommen beim Bauen aus app/data (fpv-masse.json, bauteile.json – Entwurf Gemini, geprüft).
const FPV_DATA = /*JSON:fpv-masse.json*/null;
const BUY_DATA = /*JSON:bauteile.json*/null;
const THRUST_DATA = /*JSON:schub.json*/null;
const DroneLib = (() => {
  // Motoren, deren Höhe und Gewicht aus einem Datenblatt stammen (sonst Schätzwerte, markiert)
  const MOTOR_SHEET = { '2207': { d: 28.5, h: 19.7, g: 33.8, src: 'iFlight XING-E 2207' }, '2806.5': { d: 35.1, h: 21.3, g: 54, src: 'iFlight XING 2806.5' } };
  function motors() {
    return (FPV_DATA.motoren || []).map((m) => {
      const s = MOTOR_SHEET[m.stator];
      const d = s ? s.d : m.glocke_d_mm;
      return { stator: m.stator, d, h: s ? s.h : round(d * 0.7, 1), g: s ? s.g : '', circle: m.lochkreis_d_mm[m.lochkreis_d_mm.length - 1], screw: m.schraube.split(' ')[0], props: m.propeller_zoll, sheet: !!s, src: s ? s.src : null };
    });
  }
  function motor(stator) { return motors().find((m) => m.stator === stator) || motors().find((m) => m.stator === '2207'); }
  function akkus() { return (FPV_DATA.akkus || []).map((a) => ({ name: 'Akku ' + a.typ, w: a.b_mm, l: a.l_mm, h: a.h_mm, g: a.gewicht_g, produkt: a.produkt || null })); }
  function akku(typ) { return akkus().find((a) => a.name === typ || a.name === 'Akku ' + typ) || null; }
  function stacks() { return (FPV_DATA.stack || []).map((s) => ({ name: s.name, a: s.quadrat_mm, screw: s.schraube.startsWith('M2') ? 'M2' : 'M3', board: s.platine_mm })); }
  function cams() { return (FPV_DATA.kameras || []).map((c) => ({ name: c.name, w: c.breite_mm })); }
  // Kaufteile als Platzhalter: Quader (oder Zylinder) mit festem Gewicht aus dem Datenblatt
  const CATS = [
    ['motor', 'Motoren', 'motor'], ['akku', 'Akkus', 'battery'], ['video', 'Video', 'fpvCam'], ['funk', 'Empfang und GPS', 'antenna'],
    ['action', 'Action-Kameras', 'cube'], ['klein', 'Kleinteile', 'bolt'], ['loch', 'Lochbilder und Bausteine', 'stack'],
  ];
  const COL = { motor: '#b9c2cb', akku: '#e2b53a', video: '#16202b', funk: '#5b6470', action: '#3f7fd6', klein: '#d24a3c' };
  function buyParts(cat) {
    const out = [];
    const box = (name, l, b, hgt, g, extra = {}) => ({ buy: true, kind: 'box', p: { w: b, d: l, h: hgt }, name, massG: g == null ? '' : g, color: COL[cat], ...extra });
    if (cat === 'motor') for (const m of motors()) out.push({ buy: true, kind: 'cylinder', p: { d: m.d, h: m.h }, name: 'Motor ' + m.stator, massG: m.g, color: COL.motor, info: m.sheet ? `${m.src}: ${fmt(m.g, 1)} g` : 'Höhe geschätzt, Gewicht bitte eintragen' });
    if (cat === 'akku') for (const a of akkus()) out.push(box(a.name, a.l, a.w, a.h, a.g, { info: a.produkt ? `${a.produkt}: ${fmt(a.g, 0)} g` : `ca. ${a.g} g` }));
    if (cat === 'video') {
      for (const v of BUY_DATA.videosender || []) out.push(box(v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: v.gewicht_g != null ? `${fmt(v.gewicht_g, 1)} g` + (v.unsicher ? ' (abgeleitet)' : '') : 'Gewicht bitte eintragen' }));
      for (const c of cams()) out.push(box(`Kamera ${c.name} (analog)`, c.w, c.w, c.w, '', { info: `${fmt(c.w, 1)} mm breit, Gewicht eintragen` }));
    }
    if (cat === 'funk') for (const v of [...(BUY_DATA.empfaenger || []), ...(BUY_DATA.gps || [])]) out.push(box(v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: `${fmt(v.gewicht_g, 1)} g` }));
    if (cat === 'action') for (const v of BUY_DATA.actioncam || []) out.push(box(v.name, v.b_mm, v.l_mm, v.h_mm, v.gewicht_g, { info: `${fmt(v.gewicht_g, 1)} g` }));
    if (cat === 'klein') {
      for (const v of BUY_DATA.stecker || []) out.push(box(v.name, v.l_mm, v.b_mm, v.h_mm, v.gewicht_g, { info: `ca. ${fmt(v.gewicht_g, 1)} g` }));
      for (const v of BUY_DATA.kondensator || []) out.push({ buy: true, kind: 'cylinder', p: { d: v.b_mm, h: v.l_mm }, name: 'Kondensator ' + v.name.replace(/^Panasonic /, ''), massG: '', color: COL.klein, info: 'Gewicht eintragen' });
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
    ];
  }
  // Schub pro Motor als Vorgabe – nur geprüfte Messungen aus Herstellerangaben (schub.json)
  function thrust(stator) {
    const m = (THRUST_DATA.motoren || []).find((x) => x.stator === stator && x.geprueft && x.max_schub_g);
    return m ? { g: m.max_schub_g, src: `${m.motor}${m.kv ? ' ' + m.kv + 'KV' : ''}, ${m.zellen}${m.propeller ? ', ' + m.propeller : ''}`, url: m.quelle } : null;
  }
  return { motors, motor, akkus, akku, stacks, cams, CATS, buyParts, holeParts, thrust };
})();
