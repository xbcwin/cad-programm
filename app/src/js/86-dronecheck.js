// ================= Drohnen-Check, Platten als DXF, Varianten =================
// Prüft einen Rahmen aus dem Frame-Assistenten (oder jedes Projekt mit den gleichen Maßen):
// Propellerabstand, freie Propellerkreise, Teile ineinander, Gewicht, Schwerpunkt, Schub/Gewicht.
const DroneCheck = (() => {
  const R = (d) => (d * Math.PI) / 180;
  let last = null;   // { rev, list }
  // Motoren und Propeller aus den Maßen – wie im Rahmen-Generator
  function geometry(doc = App.doc) {
    const V = Model.vars(doc).v;
    if (['Achsabstand', 'Armwinkel', 'Armdicke', 'Propeller'].some((k) => typeof V[k] !== 'number')) return null;
    const A = V.Achsabstand, wv = V.Armwinkel, wh = typeof V.Armwinkel_hinten === 'number' ? V.Armwinkel_hinten : wv, L = A / 2;
    const s = (A / 4) * (Math.cos(R(wv)) - Math.cos(R(wh)));   // wie im Rahmen-Generator: Motormitte über der Plattenmitte
    const motors = [['vorne rechts', L * Math.sin(R(wv)), -L * Math.cos(R(wv)) + s], ['vorne links', -L * Math.sin(R(wv)), -L * Math.cos(R(wv)) + s], ['hinten rechts', L * Math.sin(R(wh)), L * Math.cos(R(wh)) + s], ['hinten links', -L * Math.sin(R(wh)), L * Math.cos(R(wh)) + s]];
    const motorGroup = doc.items.find((i) => /^Motor /.test(i.name || ''));
    const propGroup = doc.items.find((i) => /^Propeller/.test(i.name || ''));
    const mh = (doc.drone && doc.drone.motorH) || (motorGroup && motorGroup.children && motorGroup.children[0] ? Model.num(motorGroup.children[0].p.h, V, 20) : 20);
    // geneigte Motoren (Speed-Rumpf): Propellerebene steht schräg, der Prüfkörper liegt entlang der Motorachse
    const tilt = typeof V.Motorneigung === 'number' ? V.Motorneigung : 0, keil = typeof V.Keilhöhe === 'number' ? V.Keilhöhe : 0;
    const zProp = V.Armdicke + keil + (mh + 1) * Math.cos(R(tilt)), dy = -(mh + 1) * Math.sin(R(tilt));
    const D = V.Propeller * 25.4, skip = [motorGroup && motorGroup.id, propGroup && propGroup.id].filter(Boolean);
    const pdir = tilt ? [0, -Math.sin(R(tilt)), Math.cos(R(tilt))] : null;
    const probes = motors.map(([, x, y]) => ({ c: [x, y + dy, zProp], r: D / 2 + 1, h: 6, skip, ...(pdir ? { dir: pdir } : {}) }));   // Propellerebene: 1 bis 7 mm über dem Motor
    return { A, wv, wh, zoll: V.Propeller, D, zProp, dy, tilt, motors, motorGroup, propGroup, V, probes, skipPairs: propGroup ? [propGroup.id] : [], gap: DroneTpl.tipGap(A, V.Propeller, wv, wh), n: 4 };
  }
  // Selbst gebauter Rahmen: Motoren und Propeller aus den Kaufteilen (auch in Muster-Gruppen) – ab drei Motoren
  function freeGeometry(doc, V) {
    const mot = [], props = [];
    Model.walk(doc.items, (it) => { if (it.kind === 'part' && it.p && !it.suppressed && !it.hidden) { if (it.p.lib === 'buyMotor') mot.push(it); else if (it.p.lib === 'buyProp') props.push(it); } });
    const act = (it) => Model.isActive(doc, it.id) && !Model.parentsOf(doc, it.id).some((g) => g.suppressed);
    const M = [];
    for (const it of mot.filter(act)) for (const W of Model.instanceMatrices(doc, it.id, V)) {
      const b = new THREE.Vector3().applyMatrix4(W), ax = new THREE.Vector3(0, 0, 1).transformDirection(W).normalize();
      M.push({ id: it.id, b, ax, h: Model.num(it.p.h, V, 19.7), d: Model.num(it.p.d, V, 28.5) });
      if (M.length > 16) break;
    }
    if (M.length < 3) return null;
    const pz = props.filter(act).map((it) => Model.num(it.p.zoll, V, 5));
    const zoll = pz.length ? Math.max(...pz) : doc.drone && Number(doc.drone.zoll) > 0 ? Number(doc.drone.zoll) : typeof V.Propeller === 'number' ? V.Propeller : null;
    const D = zoll ? zoll * 25.4 : null;
    // Namen nach der Lage um die Mitte (vorne = −Y)
    const c = M.reduce((a, m) => a.add(m.b), new THREE.Vector3()).divideScalar(M.length);
    const rr = Math.max(...M.map((m) => Math.hypot(m.b.x - c.x, m.b.y - c.y))) || 1;
    const where = (m) => [Math.abs(m.b.y - c.y) > 0.38 * rr ? (m.b.y < c.y ? 'vorne' : 'hinten') : '', Math.abs(m.b.x - c.x) > 0.38 * rr ? (m.b.x > c.x ? 'rechts' : 'links') : ''].filter(Boolean).join(' ') || 'Mitte';
    const names = M.map(where), dup = (n) => names.filter((x) => x === n).length > 1;
    const motors = M.map((m, i) => [dup(names[i]) ? `${names[i]} (${i + 1})` : names[i], m.b.x, m.b.y, m]);
    // Prüfkörper: Ring in der Propellerebene (1 bis 7 mm über der Glocke), innen frei für Welle und Mutter
    const tops = (list) => [...new Set(list.map((it) => Model.topOf(doc, it.id)).filter((t) => t && (t.kind === 'part' ? !!(t.p && String(t.p.lib || '').startsWith('buy')) : (() => { let pure = true; Model.walk(t.children || [], (k) => { if (k.kind !== 'group' && !(k.kind === 'part' && k.p && String(k.p.lib || '').startsWith('buy'))) { pure = false; return false; } }); return pure; })())).map((t) => t.id))];
    const skip = tops([...mot, ...props]), propTops = tops(props);
    const probes = D ? M.map((m) => ({ c: m.b.clone().addScaledVector(m.ax, m.h + 1).toArray(), r: D / 2 + 1, h: 6, ri: Math.max(4.5, m.d * 0.25), dir: m.ax.toArray(), skip })) : [];
    let A = 0, gap = Infinity;
    const pc = M.map((m) => m.b.clone().addScaledVector(m.ax, m.h + 1));
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) { const d = pc[i].distanceTo(pc[j]); A = Math.max(A, d); if (D) gap = Math.min(gap, d - D); }
    return { free: true, A, zoll, D, motors, V, probes, skipPairs: propTops, gap: D ? gap : null, n: M.length, tilt: 0, zoll_from: pz.length ? 'props' : zoll ? 'eingetragen' : null };
  }
  function geometryAny(doc = App.doc) {
    return geometry(doc) || freeGeometry(doc, Model.vars(doc).v);
  }
  const isDrone = (doc = App.doc) => !!geometryAny(doc);
  // Akkus: Teile ganz oben im Verlauf, die „Akku“ heißen oder ein Akku aus „Kaufteile“ sind
  const batteries = (doc = App.doc) => doc.items.filter((i) => !i.hidden && !i.suppressed && Model.isActive(doc, i.id) && (/akku/i.test(i.name || '') || (i.kind === 'part' && i.p && i.p.lib === 'buyBattery')));
  // Energie der Akkus aus ihren Namen („6S 1300 mAh“): Zellen × 3,7 V × Kapazität
  function batteryEnergy(doc = App.doc) {
    let wh = 0; const names = [];
    for (const b of batteries(doc)) {
      const c = /(\d+)\s*S\b/i.exec(b.name || ''), q = /(\d+(?:[.,]\d+)?)\s*mAh/i.exec(b.name || '');
      if (!c || !q) continue;
      wh += (+c[1] * 3.7 * parseFloat(q[1].replace(',', '.'))) / 1000; names.push(`${c[1]}S ${q[1]} mAh`);
    }
    return { wh, text: names.join(' + ') };
  }
  // Schweben: Leistung nach der Strahltheorie (P = T^1,5 / √(2·ρ·A)), geteilt durch den Wirkungsgrad von Propeller, Motor und Regler
  // (zusammen etwa 30 % bei kleinen FPV-Propellern – das entspricht rund 4 g Schub pro Watt bei einem 5-Zoll-Copter). Vom Akku zählen 80 %.
  function hoverTime(massG, n, Dmm, wh) {
    const T = (massG / 1000) * 9.81, A = n * Math.PI * (Dmm / 2000) ** 2;
    const w = Math.pow(T, 1.5) / Math.sqrt(2 * 1.225 * A) / 0.3;
    return { w, min: ((wh * 0.8) / w) * 60 };
  }
  // Wie weit muss der schwerste Akku wandern, damit der Schwerpunkt über der Mitte zwischen den Motoren liegt?
  async function balanceInfo() {
    const g = geometryAny(); if (!g) return null;
    const m = await Mass.measure(); if (!m || !m.com) return null;
    const bt = batteries().map((it) => ({ it, p: Mass.partOf(m, it.id) })).filter((x) => x.p && x.p.mass > 0).sort((a, b) => b.p.mass - a.p.mass)[0];
    if (!bt) return null;
    const cx = g.motors.reduce((s, x) => s + x[1], 0) / g.motors.length, cy = g.motors.reduce((s, x) => s + x[2], 0) / g.motors.length;
    const dx = m.com[0] - cx, dy = m.com[1] - cy, k = m.mass / bt.p.mass;
    return { id: bt.it.id, name: Model.label(bt.it), sx: Math.abs(dx) > 0.3 ? -dx * k : 0, sy: Math.abs(dy) > 0.3 ? -dy * k : 0, A: g.A };
  }
  async function balance() {
    const b = await balanceInfo();
    if (!b) { UI.toast('Dafür braucht es einen Akku im Modell (ein Teil namens „Akku“ oder einen Akku aus „Kaufteile“, ganz oben im Verlauf).', { icon: 'info', ms: 4500 }); return false; }
    const L = Math.hypot(b.sx, b.sy);
    if (L < 0.05) { UI.toast('Der Schwerpunkt liegt schon in der Mitte.', { icon: 'check' }); return false; }
    if (L > b.A * 0.6) { UI.toast(`„${b.name}“ müsste ${fmtFixed(L, 0)} mm wandern – das ist zu weit. Setz schwere Teile wie Kamera oder Sender um.`, { icon: 'info', ms: 5000 }); return false; }
    App.change('Schwerpunkt ausgeglichen', (doc) => {
      const it = doc.items.find((x) => x.id === b.id); if (!it) return false;
      Model.useVars(Model.vars(doc).v);
      it.t = it.t || Model.T0();
      it.t.x = round(Model.tnum(it, 'x') + b.sx, 2); it.t.y = round(Model.tnum(it, 'y') + b.sy, 2);
    });
    UI.toast(`„${b.name}“ ${b.sy ? (b.sy < 0 ? 'nach vorne' : 'nach hinten') : 'zur Seite'} geschoben (${fmtFixed(L, 1)} mm) – der Schwerpunkt liegt jetzt in der Mitte.`, { icon: 'check', ms: 4200 });
    return true;
  }
  const label = (id) => { const f = Model.find(App.doc, id); return f ? Model.label(f.item) : 'ein Teil'; };
  const thrustOf = (doc = App.doc) => (doc.drone && doc.drone.thrustG != null && doc.drone.thrustG !== '' ? Model.num(doc.drone.thrustG, Model.vars(doc).v, 0) : null);
  async function run() {
    const doc = App.doc, g = geometryAny(doc);
    if (!g) return null;
    const rev = App.revision, out = [];
    if (g.free) out.push({ id: 'free', title: 'Selbst gebauter Rahmen', s: 'info', text: `${g.n} Motoren aus deinen Kaufteilen erkannt` + (g.zoll ? `, Propeller ${fmtFixed(g.zoll, 1)}" (${g.zoll_from === 'props' ? 'aus den Propellern im Modell' : 'eingetragen'}).` : '. Für die Propeller-Prüfungen fehlt noch die Größe – leg Propeller aus „Kaufteile“ auf die Motoren oder trag sie unten ein.') });
    // 1. Abstand der Propeller untereinander
    const gap = g.gap;
    if (gap != null) out.push({ id: 'gap', title: 'Propeller untereinander', s: gap < 0 ? 'bad' : gap < 5 ? 'warn' : 'ok', text: gap < 0 ? `Die Propeller überlappen sich um ${fmtFixed(-gap, 1)} mm – ${g.free ? 'Motoren weiter auseinander setzen' : 'Achsabstand vergrößern'}.` : `${fmtFixed(gap, 1)} mm Luft zwischen den Propellerspitzen.` });
    // 2./3. Kollisionen aus dem CAD-Kern
    let cl = null;
    try { cl = await Kernel.call('clashes', { scene: Model.kernelScene(doc), probes: g.probes, skipPairs: g.skipPairs }); } catch (_) {}
    if (cl && !g.probes.length) cl.hits = [];
    if (cl) {
      const bad = [];
      cl.hits.forEach((hs, i) => { if (hs.length) bad.push(`Propeller ${g.motors[i][0]} trifft ${hs.map((x) => label(x.id)).join(', ')}`); });
      const ids = [...new Set(cl.hits.flat().map((x) => x.id))];
      if (g.probes.length) out.push({ id: 'props', title: 'Propellerkreise frei', s: bad.length ? 'bad' : 'ok', text: bad.length ? bad.join('. ') + '.' : 'Kein Teil ragt in die Propellerkreise (1 mm Sicherheitsabstand).', ids });
      const pairs = cl.pairs.map((p) => `${label(p.a)} und ${label(p.b)} (${fmtFixed(p.v / 1000, 2)} cm³)`);
      out.push({ id: 'clash', title: 'Teile stecken nicht ineinander', s: pairs.length ? 'warn' : 'ok', text: pairs.length ? 'Ineinander: ' + pairs.join('; ') + '.' : 'Alle Teile haben ihren eigenen Platz.', ids: [...new Set(cl.pairs.flatMap((p) => [p.a, p.b]))] });
    }
    // 4. Gewicht
    const m = await Mass.measure();
    if (m) {
      const miss = (m.parts || []).filter((p) => p.missing).map((p) => label(p.id));
      out.push({ id: 'weight', title: 'Abfluggewicht', s: miss.length ? 'warn' : 'info', text: `ca. ${Mass.gText(m.mass)}` + (miss.length ? ` – bei ${miss.join(', ')} fehlt noch das Gewicht.` : '.') + (m.mass < 250 ? ' Unter 250 g gelten in der EU einfachere Regeln.' : ''), ids: (m.parts || []).filter((p) => p.missing).map((p) => p.id) });
      // Nachbau eines Herstellerrahmens: Rahmen im Modell (alles ohne Kaufteile) gegen das Gewicht laut Hersteller
      const fr = doc.drone && doc.drone.frame;
      if (fr && fr.g) {
        const own = (m.parts || []).filter((p) => !p.fixed).reduce((s, p) => s + p.mass, 0), d = own - fr.g;
        out.push({ id: 'frame', title: 'Rahmen gegen Original', s: 'info', text: `Rahmen im Modell ca. ${Mass.gText(own)}, ${fr.hersteller} ${fr.name} laut Hersteller ${Mass.gText(fr.g)} (${d >= 0 ? '+' : '−'}${Mass.gText(Math.abs(d))}). Der Nachbau hat vereinfachte Umrisse – Löcher, Fasen und Aussparungen des Originals fehlen.` + (fr.a && Math.abs(fr.a - g.A) > 0.5 ? ` Achsabstand hier ${fmtFixed(g.A, 0)} mm, beim Original ${fmtFixed(fr.a, 0)} mm.` : '') });
      }
      // 5. Schwerpunkt gegenüber der Mitte zwischen den Motoren
      if (m.com) {
        const cx = g.motors.reduce((s, x) => s + x[1], 0) / g.motors.length, cy = g.motors.reduce((s, x) => s + x[2], 0) / g.motors.length;
        const dx = m.com[0] - cx, dy = m.com[1] - cy, d = Math.hypot(dx, dy);
        const dir = [Math.abs(dy) > 0.5 ? (dy < 0 ? 'nach vorne' : 'nach hinten') : '', Math.abs(dx) > 0.5 ? (dx > 0 ? 'nach rechts' : 'nach links') : ''].filter(Boolean).join(' und ');
        const akku = batteries(doc).length > 0;
        const sc = d <= 0.03 * g.A ? 'ok' : !akku ? 'info' : d <= 0.08 * g.A ? 'warn' : 'bad';
        out.push({ id: 'cog', title: 'Schwerpunkt', s: sc, ...(akku && d > 0.03 * g.A ? { fix: 'balance' } : {}), text: (d < 0.5 ? 'Genau in der Mitte zwischen den Motoren.' : `${fmtFixed(d, 1)} mm ${dir} verschoben` + (d <= 0.03 * g.A ? ' – passt.' : akku ? ' – Akku oder schwere Teile verschieben.' : '.')) + (akku ? '' : ' Noch ohne Akku – leg einen auf die Oberplatte und prüf noch mal.') });
      }
      // 6. Schub zu Gewicht
      const t = thrustOf(doc);
      if (t) {
        const tw = (g.n * t) / m.mass;
        const src = doc.drone && doc.drone.thrustSrc ? ` (Richtwert ${fmtFixed(t, 0)} g pro Motor: ${doc.drone.thrustSrc})` : '';
        out.push({ id: 'tw', title: 'Schub zu Gewicht', s: tw < 2 ? 'bad' : tw < 4 ? 'warn' : 'ok', text: `${fmtFixed(tw, 1)} : 1 – ` + (tw < 2 ? 'zu schwach, hebt kaum ab.' : tw < 4 ? 'reicht für ruhiges Fliegen und Long Range.' : tw < 8 ? 'gut für Freestyle.' : 'genug für Rennen.') + src });
      } else out.push({ id: 'tw', title: 'Schub zu Gewicht', s: 'info', text: 'Trag unten den Schub pro Motor aus der Schubtabelle ein.' });
      // 6b. Flugzeit im Schweben – Schätzung aus Gewicht, Propellerfläche und Akku
      const ak = batteryEnergy(doc);
      if (g.D && ak.wh > 0) {
        const hv = hoverTime(m.mass, g.n, g.D, ak.wh);
        out.push({ id: 'flight', title: 'Flugzeit (Schätzung)', s: hv.min < 3 ? 'warn' : 'info', text: `ca. ${fmtFixed(hv.min, hv.min < 10 ? 1 : 0)} min ruhiges Schweben mit ${ak.text} (rund ${fmtFixed(hv.w, 0)} W). Beim schnellen Fliegen ist es meist nur ein Drittel bis die Hälfte davon.` + (hv.min < 3 ? ' Das ist sehr kurz – ein größerer Akku oder weniger Gewicht hilft.' : '') });
      } else if (g.D && batteries(doc).length) out.push({ id: 'flight', title: 'Flugzeit (Schätzung)', s: 'info', text: 'Nenn den Akku mit Zellen und Kapazität, zum Beispiel „Akku 6S 1300 mAh“ – dann schätze ich die Flugzeit.' });
    }
    // 7. Speed-Rumpf: Form und Fluglage
    const V = g.V;
    if (!g.free && typeof V.Rumpfdurchmesser === 'number' && typeof V.Nasenlänge === 'number') {
      const L = V.Nasenlänge + V.Rumpflänge + V.Hecklänge, D = V.Rumpfdurchmesser;
      let fa = null; try { if (typeof Views !== 'undefined' && Viewer.nodes.size) fa = Views.windArea(0); } catch (_) {}
      out.push({ id: 'aero', title: 'Stromlinie', s: 'info', text: `Rumpf ${fmtFixed(L, 0)} mm lang und ${fmtFixed(D, 0)} mm dick (${fmtFixed(L / D, 1)} : 1), Akku und Elektronik liegen innen.` + (fa ? ` Stirnfläche von vorne ohne Propeller: ${fmtFixed(fa / 100, 1)} cm² (Ansicht „Fahrtwind“).` : '') + (g.tilt ? ` Motoren ${fmtFixed(g.tilt, 0)}° geneigt: Fliegt die Drohne mit ${fmtFixed(g.tilt, 0)}° Schräglage, liegt der Rumpf genau im Fahrtwind.` : ' Mit geneigten Motoren (Maß „Motorneigung“) läge der Rumpf im schnellen Flug flach im Wind.') });
    }
    last = { rev, list: out };
    return out;
  }
  const DOT = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
  function rows(list, onShow) {
    const box = h('div', { class: 'chk-list' });
    for (const c of list) {
      const r = h('div', { class: 'chk-row ' + c.s, 'data-chk': c.id }, h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, DOT[c.s]), h('div', { class: 'grow' }, h('b', null, c.title), h('span', null, c.text)));
      if (c.ids && c.ids.length && c.s !== 'ok' && onShow) { const b = h('button', { type: 'button', class: 'btn small ghost' }, 'Zeigen'); b.onclick = () => onShow(c.ids); r.append(b); }
      if (c.fix === 'balance') { const b = h('button', { type: 'button', class: 'btn small', id: 'chk-balance', 'data-tip': 'Akku so verschieben, dass der Schwerpunkt mittig zwischen den Motoren liegt' }, 'Akku verschieben'); b.onclick = async () => { b.disabled = true; const ok = await balance(); const md = b.closest('.modal'); if (ok && md) { const x = [...md.querySelectorAll('.actions button')].find((y) => y.textContent.trim() === 'Schließen'); if (x) x.click(); else (md.closest('.modal-back') || md).remove(); setTimeout(dialog, 80); } else b.disabled = false; }; r.append(b); }
      box.append(r);
    }
    return box;
  }
  async function dialog() {
    if (!isDrone()) { UI.toast('Der Drohnen-Check braucht einen Rahmen aus dem Frame-Assistenten – oder mindestens drei Motoren aus „Kaufteile“ an deinem eigenen Rahmen.', { icon: 'info', ms: 5000 }); return; }
    const body = h('div', { class: 'chk' }, h('div', { class: 'hint-box', id: 'chk-wait' }, 'Prüfe … (der CAD-Kern rechnet die Kollisionen genau aus)'));
    const m = UI.modal({ title: 'Drohnen-Check', body, wide: true, actions: [{ label: 'Schließen', primary: true }] });
    const list = await run();
    body.innerHTML = '';
    body.append(rows(list || [], (ids) => { m.close(); App.select(ids); Viewer.fit(ids.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean)); }));
    const f = UI.numField({ id: 'chk-thrust', label: 'Schub deines Motors (Höchstwert aus der Schubtabelle)', value: App.doc.drone && App.doc.drone.thrustG != null ? App.doc.drone.thrustG : '', unit: 'g', onCommit: (v) => { App.change('Schub eingetragen', (doc) => { doc.drone = doc.drone || {}; doc.drone.thrustG = v; doc.drone.thrustSrc = null; }); m.close(); setTimeout(dialog, 50); } });
    const fs = h('div', { class: 'fields', style: { marginTop: '10px' } }, f);
    const g = geometryAny();
    if (g && g.free && g.zoll_from !== 'props') fs.append(UI.numField({ id: 'chk-zoll', label: 'Propeller-Durchmesser', value: App.doc.drone && App.doc.drone.zoll ? App.doc.drone.zoll : '', unit: '"', onCommit: (v) => { App.change('Propellergröße eingetragen', (doc) => { doc.drone = doc.drone || {}; doc.drone.zoll = v; }); m.close(); setTimeout(dialog, 50); } }));
    body.append(fs);
    ev.emit('checked', list);
  }
  function summary() { return last && last.rev === App.revision ? last.list : null; }
  const ev = makeEmitter();
  return { geometry: geometryAny, isDrone, run, dialog, rows, summary, thrustOf, balance, balanceInfo, hoverTime, batteryEnergy, on: ev.on };
})();

// ---------- Platten als DXF für die Fräse ----------
const Plates = (() => {
  // flache Teile der obersten Ebene: höchstens 12 mm dick, kein Kaufteil, kein Loch, nichts Gedrucktes (z. B. Motorkeile)
  const PRINTED = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU 95A', 'PA6', 'PA12', 'PC', 'POM'];
  function candidates() {
    const out = [];
    for (const it of App.doc.items) {
      if (it.hidden || it.role === 'hole' || Mass.fixedOf(it) || PRINTED.includes(Mass.materialFor(it).k)) continue;
      const b = Viewer.baseBox(it.id); if (!b) continue;
      const t = b.max.z - b.min.z; if (t > 12) continue;
      out.push({ id: it.id, name: Model.label(it), t });
    }
    return out;
  }
  function dxf(edges) {
    const out = [];
    const P = (...a) => out.push(...a.map(String));
    const n = (v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);
    P(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 1, 0, 'LAYER', 2, 'KONTUR', 70, 0, 62, 7, 6, 'CONTINUOUS', 0, 'ENDTAB', 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'ENTITIES');
    const deg = (a) => ((((a * 180) / Math.PI) % 360) + 360) % 360;
    let count = 0;
    for (const e of edges) {
      if (e.t === 'LINE') { P(0, 'LINE', 8, 'KONTUR', 10, n(e.a[0]), 20, n(e.a[1]), 30, 0, 11, n(e.b[0]), 21, n(e.b[1]), 31, 0); count++; continue; }
      if (e.t === 'CIRCLE' && e.c && e.full) { P(0, 'CIRCLE', 8, 'KONTUR', 10, n(e.c[0]), 20, n(e.c[1]), 30, 0, 40, n(e.r)); count++; continue; }
      if (e.t === 'CIRCLE' && e.c && e.pts && e.pts.length > 2) {
        const p0 = e.pts[0], p1 = e.pts[e.pts.length - 1], pm = e.pts[Math.floor(e.pts.length / 2)];
        const ang = (p) => Math.atan2(p[1] - e.c[1], p[0] - e.c[0]);
        const ccw = (pm[0] - p0[0]) * (p1[1] - p0[1]) - (pm[1] - p0[1]) * (p1[0] - p0[0]) < 0;   // Mitte links vom Weg Anfang→Ende
        const [a0, a1] = ccw ? [ang(p0), ang(p1)] : [ang(p1), ang(p0)];
        P(0, 'ARC', 8, 'KONTUR', 10, n(e.c[0]), 20, n(e.c[1]), 30, 0, 40, n(e.r), 50, deg(a0).toFixed(4), 51, deg(a1).toFixed(4)); count++; continue;
      }
      if (e.pts && e.pts.length > 1) { for (let i = 0; i < e.pts.length - 1; i++) P(0, 'LINE', 8, 'KONTUR', 10, n(e.pts[i][0]), 20, n(e.pts[i][1]), 30, 0, 11, n(e.pts[i + 1][0]), 21, n(e.pts[i + 1][1]), 31, 0); count++; }
    }
    P(0, 'ENDSEC', 0, 'EOF');
    const text = out.join('\r\n') + '\r\n';
    return { bytes: new TextEncoder().encode(text), count };
  }
  // Draufsicht eines Teils (mit den Löchern der obersten Ebene, die es schneiden) als DXF in Originalgröße
  async function file(id) {
    const it = App.doc.items.find((x) => x.id === id); if (!it) return null;
    const V = Model.vars(App.doc).v;
    const holes = Model.activeItems(App.doc).filter((x) => x.role === 'hole' && !x.hidden);
    const scene = { items: [it, ...holes].map((x) => Model.kernelItem(x, V)) };
    const res = await Kernel.call('project', { scene, views: ['top'] });
    const v = res.views && res.views.top; if (!v) return null;
    const { bytes, count } = dxf(v.visible);
    const b = Viewer.baseBox(id); const t = b ? b.max.z - b.min.z : 0;
    return { name: `${Print.safeName(Model.label(it))} – ${fmtFixed(t, 2).replace('.', ',')} mm.dxf`, data: bytes, count, t, edges: v.visible };
  }
  return { candidates, file, dxf };
})();

// ---------- Varianten: benannte Sätze von Maßen, Werkstoff und unterdrückten Schritten, zum Umschalten und Vergleichen ----------
const Variants = (() => {
  let stepsOpen = true;
  const list = () => App.doc.variants || [];
  const snap = (doc = App.doc) => Object.fromEntries((doc.params || []).map((p) => [p.name, p.expr]));
  const MAT_CATS = ['Metalle', 'Kunststoffe', 'Faserverbund', 'Holz & Platten'];
  function currentMaterialKey(doc = App.doc) {
    const k = doc && doc.settings && doc.settings.material;
    if (k && typeof Mass !== 'undefined' && Mass.matOf && Mass.matOf(k)) return k;
    return (typeof Mass !== 'undefined' && Mass.projectMaterial) ? Mass.projectMaterial(doc).k : (k || 'CFK');
  }
  function resolveMaterial(raw) {
    if (raw == null) return '';
    const s = String(raw).trim();
    if (!s || s === '–' || s === '-') return '';
    const low = s.toLowerCase();
    const exact = MATERIALS.find((m) => m.k.toLowerCase() === low || (m.name && m.name.toLowerCase() === low));
    if (exact) return exact.k;
    const pref = MATERIALS.find((m) => m.name && m.name.toLowerCase().startsWith(low));
    return pref ? pref.k : null;
  }
  function collectSteps(doc = App.doc) {
    const out = [];
    const rec = (items, depth) => {
      for (const it of items || []) {
        out.push({ item: it, depth, label: Model.label(it) });
        if (it.kind === 'group' && !(it.p && it.p.op) && (it.children || []).length) rec(it.children, depth + 1);
      }
    };
    rec(doc && doc.items, 0);
    return out;
  }
  function existingIds(doc = App.doc) {
    const ids = new Set();
    Model.walk((doc && doc.items) || [], (it) => { ids.add(it.id); });
    return ids;
  }
  function snapSuppressed(doc = App.doc) {
    const out = [];
    Model.walk((doc && doc.items) || [], (it) => { if (it.suppressed) out.push(it.id); });
    return out;
  }
  function suppressedIds(v, doc = App.doc) {
    if (!v || !Array.isArray(v.suppressed)) return [];
    const ids = existingIds(doc), seen = new Set(), out = [];
    for (const id of v.suppressed) if (ids.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
    return out;
  }
  function isSuppressedIn(v, itemId) { return Array.isArray(v && v.suppressed) && v.suppressed.includes(itemId); }
  function applyToDoc(doc, v) {
    const vals = (v && v.values) || {};
    for (const p of doc.params || []) if (Object.prototype.hasOwnProperty.call(vals, p.name)) p.expr = vals[p.name];
    const sup = new Set(Array.isArray(v && v.suppressed) ? v.suppressed : []);
    Model.walk(doc.items || [], (it) => { if (sup.has(it.id)) it.suppressed = true; else if (it.suppressed) delete it.suppressed; });
    if (v && v.material && typeof Mass !== 'undefined' && Mass.matOf && Mass.matOf(v.material)) {
      doc.settings = doc.settings || {};
      doc.settings.material = v.material;
    }
  }
  function active() { return list().find((v) => v.id === App.doc.variant) || null; }
  function changedParts(a = active(), doc = App.doc) {
    if (!a) return { params: false, steps: false, material: false };
    const s = snap(doc), av = a.values || {};
    const params = Object.keys({ ...av, ...s }).some((k) => String(av[k]) !== String(s[k]));
    const sa = new Set(suppressedIds(a, doc)), sb = new Set(snapSuppressed(doc));
    const steps = sa.size !== sb.size || [...sa].some((id) => !sb.has(id));
    const material = !!(a.material && typeof Mass !== 'undefined' && Mass.matOf && Mass.matOf(a.material) && a.material !== currentMaterialKey(doc));
    return { params, steps, material };
  }
  function changed() { const c = changedParts(); return c.params || c.steps || c.material; }
  function columns(doc = App.doc) {
    const cols = [];
    const seen = new Set();
    for (const p of (doc && doc.params) || []) {
      if (p && p.name && !seen.has(p.name)) { seen.add(p.name); cols.push(p.name); }
    }
    for (const v of (doc && doc.variants) || []) {
      for (const k of Object.keys((v && v.values) || {})) {
        if (k && !seen.has(k)) { seen.add(k); cols.push(k); }
      }
    }
    return cols;
  }
  function uniqueName(base, doc = App.doc, ignoreId = null) {
    const clean = (base || '').trim() || 'Variante 1';
    const used = new Set(((doc && doc.variants) || []).filter((x) => x.id !== ignoreId).map((x) => String(x.name || '').trim().toLowerCase()));
    if (!used.has(clean.toLowerCase())) return clean;
    let n = 2;
    while (used.has(`${clean} ${n}`.toLowerCase())) n++;
    return `${clean} ${n}`;
  }
  function save(name, opts = {}) {
    const sup = Array.isArray(opts.suppressed) ? [...new Set(opts.suppressed)] : snapSuppressed();
    const vals = opts.values && typeof opts.values === 'object' ? { ...snap(), ...opts.values } : snap();
    const mat = opts.material !== undefined ? resolveMaterial(opts.material) : currentMaterialKey();
    const v = { id: uid('va'), name: (name || '').trim() || 'Variante ' + (list().length + 1), values: vals, suppressed: sup };
    if (mat) v.material = mat;
    App.change(`Variante „${v.name}“ gespeichert`, (doc) => {
      doc.variants = doc.variants || [];
      doc.variants.push(v);
      if (opts.activate !== false) {
        doc.variant = v.id;
        if (opts.values || opts.material !== undefined) applyToDoc(doc, v);
      }
    });
    return v;
  }
  function addRow(opts = {}) {
    const sup = Array.isArray(opts.suppressed) ? [...new Set(opts.suppressed)] : snapSuppressed();
    const vals = opts.values && typeof opts.values === 'object' ? { ...snap(), ...opts.values } : snap();
    const mat = opts.material !== undefined ? resolveMaterial(opts.material) : currentMaterialKey();
    const baseName = (opts.name || '').trim() || ('Variante ' + (list().length + 1));
    const v = { id: uid('va'), name: uniqueName(baseName), values: vals, suppressed: sup };
    if (mat) v.material = mat;
    App.change('Variante hinzugefügt', (doc) => {
      doc.variants = doc.variants || [];
      doc.variants.push(v);
      if (opts.activate === true || (!doc.variant && doc.variants.length === 1)) {
        doc.variant = v.id;
        applyToDoc(doc, v);
      }
    });
    return v;
  }
  function duplicateRow(variantId) {
    const vs = list();
    const idx = vs.findIndex((x) => x.id === variantId);
    if (idx < 0) return null;
    const src = vs[idx];
    const copy = {
      id: uid('va'),
      name: uniqueName((src.name || 'Variante') + ' Kopie'),
      values: { ...(src.values || {}) },
      suppressed: Array.isArray(src.suppressed) ? [...src.suppressed] : [],
    };
    if (src.material) copy.material = src.material;
    App.change(`Variante „${copy.name}“ dupliziert`, (doc) => {
      doc.variants = doc.variants || [];
      const at = doc.variants.findIndex((x) => x.id === variantId);
      doc.variants.splice(at >= 0 ? at + 1 : doc.variants.length, 0, copy);
    });
    return copy;
  }
  function setName(variantId, name) {
    const clean = String(name == null ? '' : name).trim();
    if (!clean) return false;
    const v = list().find((x) => x.id === variantId);
    if (!v) return false;
    if (v.name === clean) return true;
    App.change('Variante umbenannt', (doc) => {
      const vv = (doc.variants || []).find((x) => x.id === variantId);
      if (!vv) return false;
      vv.name = clean;
    });
    return true;
  }
  function setValue(variantId, paramName, rawVal) {
    const v = list().find((x) => x.id === variantId);
    if (!v || !paramName) return { ok: false, error: 'Variante nicht gefunden.' };
    let nextVal;
    if (typeof rawVal === 'number' && isFinite(rawVal)) {
      nextVal = rawVal;
    } else {
      const raw = String(rawVal == null ? '' : rawVal).trim();
      if (!raw) return { ok: false, error: 'Bitte eine Zahl oder Formel eingeben.' };
      const n = parseNum(raw);
      if (!isNaN(n)) {
        nextVal = n;
      } else {
        const tmp = { ...App.doc, params: (App.doc.params || []).map((p) => ({ ...p })), tables: App.doc.tables || [] };
        const vals = (v && v.values) || {};
        for (const p of tmp.params) if (Object.prototype.hasOwnProperty.call(vals, p.name)) p.expr = vals[p.name];
        for (const [k, val] of Object.entries(vals)) {
          if (!tmp.params.some((p) => p.name === k)) tmp.params.push({ id: uid('m'), name: k, expr: val });
        }
        const evalVars = Model.vars(tmp).v;
        for (const k of Object.keys(evalVars)) if (k.toLowerCase() === paramName.toLowerCase()) delete evalVars[k];
        const res = Expr.tryEval(raw, evalVars, App.doc.tables || []);
        if (!res.ok) return { ok: false, error: res.error };
        nextVal = raw;
      }
    }
    const curVal = (v.values || {})[paramName];
    const activeMismatch = App.doc.variant === v.id && (App.doc.params || []).some((p) => p.name === paramName && String(p.expr) !== String(nextVal));
    if (String(curVal) === String(nextVal) && !activeMismatch) return { ok: true, value: nextVal };
    App.change('Variantenwert geändert', (doc) => {
      const vv = (doc.variants || []).find((x) => x.id === variantId);
      if (!vv) return false;
      vv.values = vv.values || {};
      vv.values[paramName] = nextVal;
      if (doc.variant === vv.id) {
        const p = (doc.params || []).find((x) => x.name === paramName);
        if (p) {
          p.expr = nextVal;
          if (p.measure) delete p.measure;
        }
      }
    }, { merge: 'vartbl:' + variantId + ':' + paramName });
    return { ok: true, value: nextVal };
  }
  function setMaterial(variantId, matKey) {
    const v = list().find((x) => x.id === variantId);
    if (!v) return false;
    const norm = resolveMaterial(matKey);
    if (norm === null) return false;
    if ((v.material || '') === norm && (App.doc.variant !== v.id || !norm || currentMaterialKey() === norm)) return true;
    App.change('Varianten-Werkstoff geändert', (doc) => {
      const vv = (doc.variants || []).find((x) => x.id === variantId);
      if (!vv) return false;
      if (norm) vv.material = norm;
      else delete vv.material;
      if (doc.variant === vv.id && norm) {
        doc.settings = doc.settings || {};
        doc.settings.material = norm;
      }
    });
    return true;
  }
  function update() {
    const a = active(); if (!a) return;
    App.change(`Variante „${a.name}“ aktualisiert`, (doc) => {
      const v = (doc.variants || []).find((x) => x.id === a.id);
      if (v) { v.values = snap(doc); v.suppressed = snapSuppressed(doc); v.material = currentMaterialKey(doc); }
    });
  }
  function apply(id) {
    const v = list().find((x) => x.id === id); if (!v) return;
    App.change(`Variante „${v.name}“`, (doc) => {
      applyToDoc(doc, v);
      doc.variant = v.id;
    });
  }
  function setStepSuppressed(variantId, itemId, sup) {
    const v = list().find((x) => x.id === variantId);
    const f = Model.find(App.doc, itemId);
    if (!v || !f) return;
    const want = !!sup;
    App.change(`Variante „${v.name}“: ${Model.label(f.item)} ${want ? 'unterdrückt' : 'aktiv'}`, (doc) => {
      const vv = (doc.variants || []).find((x) => x.id === variantId); if (!vv) return;
      const cur = suppressedIds(vv, doc).filter((id) => id !== itemId);
      if (want) cur.push(itemId);
      vv.suppressed = cur;
      if (doc.variant === vv.id) {
        const t = Model.find(doc, itemId);
        if (t) { if (want) t.item.suppressed = true; else delete t.item.suppressed; }
      }
    });
  }
  function toggleStep(variantId, itemId) {
    const v = list().find((x) => x.id === variantId); if (!v) return;
    setStepSuppressed(variantId, itemId, !isSuppressedIn(v, itemId));
  }
  function suppressedOf(variantId) {
    const v = list().find((x) => x.id === variantId);
    return suppressedIds(v, App.doc);
  }
  function remove(id) { App.change('Variante gelöscht', (doc) => { doc.variants = (doc.variants || []).filter((x) => x.id !== id); if (doc.variant === id) doc.variant = null; }); }
  function toCSV(doc = App.doc) {
    const cols = columns(doc);
    const q = (s) => (/[;"\r\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    const rows = [['Variante', ...cols, 'Werkstoff']];
    for (const v of (doc && doc.variants) || []) {
      rows.push([
        v.name || '',
        ...cols.map((c) => {
          const x = (v.values || {})[c];
          return x == null ? '' : typeof x === 'number' ? fmtFixed(x, 6) : String(x);
        }),
        v.material || '',
      ]);
    }
    return rows.map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
  }
  function importCSV(txt) {
    const lines = String(txt || '').replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { UI.toast('Die CSV-Datei ist leer.', { icon: 'info' }); return { ok: false, count: 0 }; }
    const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const parseLine = (l) => {
      const out = []; let cur = '', qq = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (qq) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') qq = false; else cur += c; }
        else if (c === '"') qq = true;
        else if (c === sep) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out.map((x) => x.trim());
    };
    const head = parseLine(lines[0]);
    let nameIdx = head.findIndex((c) => /^(variante|name|bezeichnung|variant)$/i.test(c));
    if (nameIdx < 0) nameIdx = 0;
    const matIdx = head.findIndex((c, i) => i !== nameIdx && /^(werkstoff|material|mat)$/i.test(c));
    const paramCols = [];
    const seenCols = new Set();
    for (let i = 0; i < head.length; i++) {
      if (i === nameIdx || i === matIdx) continue;
      const pName = head[i].replace(/\s+/g, '_');
      if (!pName || !/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(pName) || seenCols.has(pName)) continue;
      seenCols.add(pName);
      paramCols.push({ idx: i, name: pName });
    }
    if (lines.length < 2 || (!paramCols.length && matIdx < 0)) {
      UI.toast('In der CSV-Datei wurden keine Varianten gefunden (Kopfzeile z. B.: Variante;Breite;Werkstoff).', { icon: 'info' });
      return { ok: false, count: 0 };
    }
    const parsed = [];
    const unknownMats = [];
    const usedNames = new Set();
    for (let r = 1; r < lines.length; r++) {
      const cells = parseLine(lines[r]);
      if (!cells.some((x) => x !== '')) continue;
      let name = (cells[nameIdx] || '').trim() || ('Variante ' + (parsed.length + 1));
      if (usedNames.has(name.toLowerCase())) {
        let k = 2;
        while (usedNames.has(`${name} ${k}`.toLowerCase())) k++;
        name = `${name} ${k}`;
      }
      usedNames.add(name.toLowerCase());
      const values = {};
      for (const pc of paramCols) {
        const raw = cells[pc.idx] != null ? cells[pc.idx] : '';
        if (raw === '') continue;
        const n = parseNum(raw);
        values[pc.name] = isNaN(n) ? raw : n;
      }
      let material = '';
      if (matIdx >= 0 && cells[matIdx]) {
        const res = resolveMaterial(cells[matIdx]);
        if (res === null) unknownMats.push(cells[matIdx]);
        else material = res;
      }
      parsed.push({ name, values, material });
    }
    if (!parsed.length) {
      UI.toast('In der CSV-Datei wurden keine Varianten-Zeilen gefunden.', { icon: 'info' });
      return { ok: false, count: 0 };
    }
    App.change('Varianten aus CSV geladen', (doc) => {
      doc.params = doc.params || [];
      for (const pc of paramCols) {
        if (!doc.params.some((p) => p.name === pc.name)) {
          const first = parsed.find((x) => Object.prototype.hasOwnProperty.call(x.values, pc.name));
          doc.params.push({ id: uid('m'), name: pc.name, expr: first ? first.values[pc.name] : 10 });
        }
      }
      const oldList = Array.isArray(doc.variants) ? doc.variants : [];
      const matched = new Set();
      const nextList = [];
      for (const row of parsed) {
        const old = oldList.find((x) => !matched.has(x.id) && String(x.name || '').trim().toLowerCase() === row.name.toLowerCase());
        if (old) matched.add(old.id);
        const baseVals = old && old.values ? { ...old.values } : snap(doc);
        const nextVar = {
          id: old ? old.id : uid('va'),
          name: row.name,
          values: { ...baseVals, ...row.values },
          suppressed: old && Array.isArray(old.suppressed) ? [...old.suppressed] : snapSuppressed(doc),
        };
        if (row.material) nextVar.material = row.material;
        nextList.push(nextVar);
      }
      doc.variants = nextList;
      const keepActive = nextList.find((x) => x.id === doc.variant) || nextList[0];
      doc.variant = keepActive ? keepActive.id : null;
      if (keepActive) applyToDoc(doc, keepActive);
    });
    const note = unknownMats.length ? ` (Unbekannter Werkstoff ignoriert: ${[...new Set(unknownMats)].join(', ')})` : '';
    UI.toast(`${parsed.length} ${parsed.length === 1 ? 'Variante' : 'Varianten'} aus CSV geladen.${note}`, { icon: 'check' });
    return { ok: true, count: parsed.length, unknownMaterials: unknownMats };
  }
  // Vergleich: Maße und unterdrückte Schritte, die sich unterscheiden, dazu Gewicht und (bei Drohnen) Schub/Gewicht
  async function compareData() {
    const vs = list(); if (!vs.length) return null;
    const names = [...new Set(vs.flatMap((v) => Object.keys(v.values || {})))].filter((k) => new Set(vs.map((v) => String((v.values || {})[k]))).size > 1);
    const steps = collectSteps(App.doc).filter(({ item }) => new Set(vs.map((v) => isSuppressedIn(v, item.id))).size > 1);
    const materialDiff = new Set(vs.map((v) => v.material || '')).size > 1;
    const rowsOut = [];
    for (const v of vs) {
      const d = JSON.parse(App.snapshot());
      applyToDoc(d, v);
      const m = await Mass.measureDoc(d);
      const t = DroneCheck.thrustOf(d);
      const g = DroneCheck.geometry(d);
      const volume = m && m.parts ? m.parts.reduce((s, p) => s + (p.volume || 0), 0) : null;
      rowsOut.push({ v, volume, mass: m ? m.mass : null, tw: t && m && g ? (g.n * t) / m.mass : null, gap: g ? g.gap : null });
    }
    return { names, steps, materialDiff, rows: rowsOut };
  }
  async function compareDialog() {
    const body = h('div', { class: 'vcmp', style: { overflowX: 'auto' } }, h('div', { class: 'hint-box' }, 'Rechne alle Varianten …'));
    UI.modal({ title: 'Varianten vergleichen', body, wide: true, actions: [{ label: 'Schließen', primary: true }] });
    const c = await compareData(); body.innerHTML = '';
    if (!c) { body.append(h('div', { class: 'hint-box' }, 'Noch keine Varianten.')); return; }
    const tbl = h('table', { class: 'vtable', id: 'vtable' });
    const head = h('tr', null, h('th', null, 'Variante'), ...c.names.map((n) => h('th', null, n)), ...(c.materialDiff ? [h('th', null, 'Werkstoff')] : []), ...c.steps.map((s) => h('th', null, s.label)), h('th', null, 'Gewicht'), h('th', null, 'Schub/Gewicht'), h('th', null, 'Luft Propeller'));
    tbl.append(head);
    for (const r of c.rows) {
      tbl.append(h('tr', { class: r.v.id === App.doc.variant ? 'on' : '' },
        h('td', null, h('b', null, r.v.name)),
        ...c.names.map((n) => h('td', { class: 'mono' }, (r.v.values || {})[n] == null ? '–' : String(r.v.values[n]).replace('.', ','))),
        ...(c.materialDiff ? [h('td', null, r.v.material || '–')] : []),
        ...c.steps.map((s) => { const sup = isSuppressedIn(r.v, s.item.id); return h('td', { class: sup ? 'var-cmp-sup' : 'var-cmp-on' }, sup ? 'unterdrückt' : 'aktiv'); }),
        h('td', { class: 'mono' }, r.mass == null ? '–' : Mass.gText(r.mass)),
        h('td', { class: 'mono' }, r.tw == null ? '–' : fmtFixed(r.tw, 1) + ' : 1'),
        h('td', { class: 'mono' }, r.gap == null ? '–' : fmtFixed(r.gap, 1) + ' mm')));
    }
    body.append(tbl);
  }
  function buildMaterialSelect(value, vid) {
    const sel = h('select', { class: 'vt-sel', 'data-vid': vid, 'data-col': '__mat', 'aria-label': 'Werkstoff' });
    sel.append(h('option', { value: '' }, '– unverändert –'));
    for (const cat of MAT_CATS) {
      const items = MATERIALS.filter((m) => m.cat === cat);
      if (!items.length) continue;
      const og = h('optgroup', { label: cat });
      for (const m of items) og.append(h('option', { value: m.k }, `${m.k} · ${fmtFixed(m.rho, 2)} g/cm³`));
      sel.append(og);
    }
    const rest = MATERIALS.filter((m) => !MAT_CATS.includes(m.cat));
    if (rest.length) {
      const og = h('optgroup', { label: 'Sonstige' });
      for (const m of rest) og.append(h('option', { value: m.k }, `${m.k} · ${fmtFixed(m.rho, 2)} g/cm³`));
      sel.append(og);
    }
    sel.value = value || '';
    return sel;
  }
  function formatCellVal(x) {
    if (x == null || x === '') return '';
    return typeof x === 'number' ? fmtFixed(x, 6) : String(x);
  }
  function tableDialog() {
    const existing = document.getElementById('var-table-dlg');
    if (existing) {
      const f = existing.querySelector('input,select,button');
      if (f) f.focus();
      return;
    }
    const body = h('div', { class: 'var-tbl-dlg', id: 'var-table-dlg' });
    body.append(h('div', { class: 'hint-box' }, 'Fülle Maße und Werkstoff Zeile für Zeile aus wie in einer Tabelle. Klick auf eine Zeile schaltet die Variante direkt im 3D-Modell um.'));

    const addRowBtn = h('button', { type: 'button', class: 'btn small', id: 'vt-add-row' });
    addRowBtn.innerHTML = icon('plus') + 'Zeile hinzufügen';
    const addParamBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'vt-add-param' });
    addParamBtn.innerHTML = icon('plus') + 'Maß-Spalte';
    const csvOutBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'vt-csv-out', 'data-help': 'variantTable' });
    csvOutBtn.innerHTML = icon('export') + 'CSV exportieren';
    const csvInBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'vt-csv-in', 'data-help': 'variantTable' });
    csvInBtn.innerHTML = icon('folder') + 'CSV importieren';
    const cmpBtn = h('button', { type: 'button', class: 'btn ghost small', id: 'vt-cmp' });
    cmpBtn.innerHTML = icon('list') + 'Vergleichen';

    const bar = h('div', { class: 'var-tbl-bar' },
      h('div', { class: 'var-tbl-bar-grp' }, addRowBtn, addParamBtn),
      h('div', { class: 'var-tbl-bar-grp' }, csvOutBtn, csvInBtn, cmpBtn));
    const sheetWrap = h('div', { class: 'var-sheet-wrap' });
    body.append(bar, sheetWrap);

    let lastSig = null;
    let pendingFocus = null;
    let unsub = null;

    const focusCell = (vid, col, selectAll = false) => {
      const inp = sheetWrap.querySelector(`[data-vid="${CSS.escape(vid)}"][data-col="${CSS.escape(col)}"]`);
      if (inp) {
        inp.focus();
        if (selectAll && typeof inp.select === 'function') inp.select();
      }
    };
    const moveVertical = (inp, delta) => {
      const tr = inp.closest('tr.vt-row');
      if (!tr) return;
      const rows = [...sheetWrap.querySelectorAll('tbody tr.vt-row')];
      const next = rows[rows.indexOf(tr) + delta];
      if (!next) return;
      const col = inp.dataset.col;
      const tgt = next.querySelector(`[data-col="${CSS.escape(col)}"]`);
      if (tgt) { tgt.focus(); if (typeof tgt.select === 'function') tgt.select(); }
    };
    const updateToolbar = () => {
      const vs = list();
      csvOutBtn.disabled = !vs.length;
      cmpBtn.disabled = vs.length < 2;
    };
    const syncInPlace = () => {
      const vs = list();
      const cols = columns();
      const activeId = App.doc.variant;
      const activeEl = document.activeElement;
      const trs = [...sheetWrap.querySelectorAll('#var-sheet tbody tr.vt-row')];
      if (trs.length !== vs.length) return false;
      vs.forEach((v, i) => {
        const tr = trs[i];
        const isOn = v.id === activeId;
        tr.classList.toggle('on', isOn);
        const radio = tr.querySelector('.vt-radio');
        if (radio) radio.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        const nameInp = tr.querySelector('.vt-name');
        if (nameInp && activeEl !== nameInp) {
          nameInp.value = v.name || '';
          nameInp._orig = nameInp.value;
          nameInp.classList.remove('invalid');
        }
        for (const col of cols) {
          const pInp = tr.querySelector(`[data-col="${CSS.escape('p:' + col)}"]`);
          if (pInp && activeEl !== pInp) {
            pInp.value = formatCellVal((v.values || {})[col]);
            pInp._orig = pInp.value;
            pInp.classList.remove('invalid');
          }
        }
        const matSel = tr.querySelector('.vt-sel');
        if (matSel && activeEl !== matSel) matSel.value = v.material || '';
      });
      updateToolbar();
      return true;
    };
    const rebuild = () => {
      const vs = list();
      const cols = columns();
      const sig = vs.map((v) => v.id).join(',') + '|' + cols.join(',');
      if (sig === lastSig && sheetWrap.querySelector('#var-sheet') && !pendingFocus) {
        if (syncInPlace()) return;
      }
      const ae = document.activeElement;
      let restore = pendingFocus;
      pendingFocus = null;
      if (!restore && ae && sheetWrap.contains(ae) && ae.dataset && ae.dataset.vid && ae.dataset.col) {
        restore = { vid: ae.dataset.vid, col: ae.dataset.col, selectAll: false };
      }
      lastSig = sig;
      sheetWrap.innerHTML = '';
      updateToolbar();
      if (!vs.length) {
        sheetWrap.append(h('div', { class: 'hint-box' }, 'Noch keine Varianten. Klicke auf „Zeile hinzufügen“ oder lade eine CSV-Datei.'));
        return;
      }
      const tbl = h('table', { class: 'vtable var-sheet', id: 'var-sheet' });
      const thead = h('thead', null, h('tr', null,
        h('th', { class: 'vt-col-pick' }, 'Aktiv'),
        h('th', null, 'Variante'),
        ...cols.map((c) => h('th', { class: 'mono' }, c)),
        h('th', null, 'Werkstoff'),
        h('th', { class: 'vt-col-act' }, '')));
      const tbody = h('tbody');
      vs.forEach((v, rowIdx) => {
        const isActive = v.id === App.doc.variant;
        const tr = h('tr', { class: 'vt-row' + (isActive ? ' on' : ''), 'data-vid': v.id, 'data-row': String(rowIdx) });
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.vt-act, select')) return;
          const isPick = !!e.target.closest('.vt-pick');
          if (App.doc.variant !== v.id || (isPick && changed())) apply(v.id);
        });

        const radio = h('button', { type: 'button', class: 'vt-radio', 'aria-pressed': isActive ? 'true' : 'false', 'aria-label': `Variante „${v.name}“ aktivieren`, title: `Variante „${v.name}“ aktivieren` });
        const pickTd = h('td', { class: 'vt-pick' }, radio);

        const nameInp = h('input', { type: 'text', class: 'vt-inp vt-name', 'data-vid': v.id, 'data-col': '__name', value: v.name || '', 'aria-label': 'Variantenname', spellcheck: 'false' });
        nameInp._orig = nameInp.value;
        nameInp.addEventListener('change', () => {
          const val = nameInp.value.trim();
          if (!val) { nameInp.classList.add('invalid'); nameInp.value = nameInp._orig; UI.toast('Bitte einen Namen eingeben.', { kind: 'bad' }); return; }
          nameInp.classList.remove('invalid');
          nameInp._orig = val;
          setName(v.id, val);
        });
        nameInp.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); nameInp.blur(); moveVertical(nameInp, 1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); nameInp.blur(); moveVertical(nameInp, 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); nameInp.blur(); moveVertical(nameInp, -1); }
        });

        const paramCells = cols.map((c) => {
          const valStr = formatCellVal((v.values || {})[c]);
          const pInp = h('input', { type: 'text', class: 'vt-inp vt-num mono', 'data-vid': v.id, 'data-col': 'p:' + c, 'data-param': c, value: valStr, placeholder: '–', 'aria-label': `${v.name}: ${c}`, spellcheck: 'false' });
          pInp._orig = valStr;
          pInp.addEventListener('change', () => {
            const raw = pInp.value.trim();
            if (raw === pInp._orig) { pInp.classList.remove('invalid'); return; }
            const res = setValue(v.id, c, raw);
            if (!res.ok) {
              pInp.classList.add('invalid');
              UI.toast(res.error || 'Ungültiger Wert.', { kind: 'bad' });
              return;
            }
            pInp.classList.remove('invalid');
            pInp._orig = formatCellVal(res.value);
            pInp.value = pInp._orig;
          });
          pInp.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); pInp.blur(); moveVertical(pInp, 1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); pInp.blur(); moveVertical(pInp, 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); pInp.blur(); moveVertical(pInp, -1); }
          });
          return h('td', null, pInp);
        });

        const matSel = buildMaterialSelect(v.material || '', v.id);
        matSel.addEventListener('change', () => { setMaterial(v.id, matSel.value); });
        matSel.addEventListener('keydown', (e) => { e.stopPropagation(); });

        const dupBtn = h('button', { type: 'button', class: 'vt-icon-btn vt-dup', 'aria-label': `Variante „${v.name}“ duplizieren`, title: 'Zeile duplizieren' });
        dupBtn.innerHTML = icon('copy');
        dupBtn.onclick = (e) => {
          e.stopPropagation();
          const c = duplicateRow(v.id);
          if (c) pendingFocus = { vid: c.id, col: '__name', selectAll: true };
        };
        const delBtn = h('button', { type: 'button', class: 'vt-icon-btn vt-del danger', 'aria-label': `Variante „${v.name}“ löschen`, title: 'Zeile löschen' });
        delBtn.innerHTML = icon('trash');
        delBtn.onclick = (e) => {
          e.stopPropagation();
          remove(v.id);
        };

        tr.append(pickTd, h('td', null, nameInp), ...paramCells, h('td', null, matSel), h('td', { class: 'vt-act' }, dupBtn, delBtn));
        tbody.append(tr);
      });
      tbl.append(thead, tbody);
      sheetWrap.append(tbl);
      if (restore) focusCell(restore.vid, restore.col, restore.selectAll);
    };

    addRowBtn.onclick = () => {
      const v = addRow();
      if (v) focusCell(v.id, '__name', true);
    };
    addParamBtn.onclick = async () => {
      let n = 1;
      while ((App.doc.params || []).some((x) => x.name === 'Maß' + n)) n++;
      const raw = await UI.prompt('Neues Maß als Spalte', 'Name des Maßes', 'Maß' + n, 'Hinzufügen');
      if (raw == null) return;
      const nv = raw.trim().replace(/\s+/g, '_');
      if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(nv)) {
        UI.toast('Namen dürfen nur Buchstaben, Ziffern und _ enthalten und nicht mit einer Ziffer beginnen.', { kind: 'bad' });
        return;
      }
      if ((App.doc.params || []).some((x) => x.name.toLowerCase() === nv.toLowerCase())) {
        UI.toast('Diesen Namen gibt es schon.', { kind: 'bad' });
        return;
      }
      App.change('Maß-Spalte hinzugefügt', (doc) => {
        doc.params = doc.params || [];
        doc.params.push({ id: uid('m'), name: nv, expr: 10 });
        for (const v of doc.variants || []) {
          v.values = v.values || {};
          if (!Object.prototype.hasOwnProperty.call(v.values, nv)) v.values[nv] = 10;
        }
      });
    };
    csvOutBtn.onclick = () => {
      Print.save(Print.safeName(App.doc.name) + ' – Varianten.csv', new Blob(['\ufeff' + toCSV()], { type: 'text/csv;charset=utf-8' }));
      UI.toast('Varianten als CSV gespeichert.', { icon: 'check' });
    };
    csvInBtn.onclick = () => {
      const inp = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' } });
      inp.onchange = async () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) importCSV(await f.text()); };
      document.body.append(inp); inp.click();
      setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
    };
    cmpBtn.onclick = () => compareDialog();

    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      const backs = document.querySelectorAll('.modal-back');
      const myBack = body.closest('.modal-back');
      if (!myBack || backs[backs.length - 1] !== myBack) return;
      const ae = document.activeElement;
      if (ae && sheetWrap.contains(ae) && ae.classList.contains('vt-inp') && (ae.value !== ae._orig || ae.classList.contains('invalid'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        ae.value = ae._orig ?? '';
        ae.classList.remove('invalid');
        ae.blur();
      }
    };
    window.addEventListener('keydown', onEsc, true);

    unsub = App.on('doc', rebuild);
    UI.modal({
      title: 'Varianten-Tabelle',
      body,
      wide: true,
      actions: [{ label: 'Schließen', primary: true }],
      onClose: () => {
        if (unsub) { unsub(); unsub = null; }
        window.removeEventListener('keydown', onEsc, true);
      },
    });
    rebuild();
  }
  // Abschnitt oben im Reiter „Maße“
  function section() {
    const sec = h('div', { class: 'section variants' }, h('div', { class: 'section-h' }, 'Varianten'));
    const vs = list();
    const a = active();
    if (vs.length) {
      sec.append(UI.selectField({ id: 'var-sel', label: 'Aktive Variante', value: a ? a.id : '', options: [...(a ? [] : [['', '– keine –']]), ...vs.map((v) => [v.id, v.name])], onChange: (id) => id && apply(id) }));
      const cp = a ? changedParts(a) : { params: false, steps: false, material: false };
      if (a && (cp.params || cp.steps || cp.material)) {
        const diffNames = [];
        if (cp.params) diffNames.push('Maße');
        if (cp.steps) diffNames.push('unterdrückte Schritte');
        if (cp.material) diffNames.push('Werkstoff');
        let msg;
        if (!cp.material && cp.params && cp.steps) msg = `Maße und unterdrückte Schritte weichen von „${a.name}“ ab.`;
        else if (!cp.material && cp.steps) msg = `Die unterdrückten Schritte weichen von „${a.name}“ ab.`;
        else if (!cp.material && cp.params) msg = `Die Maße weichen von „${a.name}“ ab.`;
        else if (diffNames.length === 1) msg = `Der Werkstoff weicht von „${a.name}“ ab.`;
        else msg = `${diffNames.slice(0, -1).join(', ')} und ${diffNames[diffNames.length - 1]} weichen von „${a.name}“ ab.`;
        sec.append(h('div', { class: 'hint-box warn' }, msg));
      }
    } else sec.append(h('div', { class: 'hint-box', html: 'Speichere Maße und unterdrückte Schritte als Variante – z. B. „mit Loch“ und „ohne Loch“ oder „klein“ und „groß“ – und schalte mit einem Klick um.' }));
    const row = h('div', { class: 'btn-row' });
    const cp = a ? changedParts(a) : { params: false, steps: false, material: false };
    if (a && (cp.params || cp.steps || cp.material)) { const up = h('button', { type: 'button', class: 'btn small', id: 'var-update', 'data-help': 'variants', 'data-tip': `„${a.name}“ mit den jetzigen Maßen, Werkstoff und Schritten überschreiben` }); up.innerHTML = icon('save') + 'Überschreiben'; up.onclick = () => update(); row.append(up); }
    const nb = h('button', { type: 'button', class: 'btn small', id: 'var-new', 'data-help': 'variants' }); nb.innerHTML = icon('plus') + 'Neue Variante';
    nb.onclick = async () => { const n = await UI.prompt('Variante speichern', 'Name der Variante', 'Variante ' + (vs.length + 1), 'Speichern'); if (n != null) save(n); };
    row.append(nb);
    const tb = h('button', { type: 'button', class: 'btn small', id: 'var-table', 'data-help': 'variantTable' }); tb.innerHTML = icon('grid') + 'Tabelle';
    tb.onclick = () => tableDialog();
    row.append(tb);
    if (vs.length > 1) { const cb = h('button', { type: 'button', class: 'btn small', id: 'var-cmp', 'data-help': 'variants' }); cb.innerHTML = icon('list') + 'Vergleichen'; cb.onclick = () => compareDialog(); row.append(cb); }
    if (a) { const db = h('button', { type: 'button', class: 'btn ghost small danger', id: 'var-del', 'aria-label': 'Variante löschen', 'data-tip': 'Aktive Variante löschen' }); db.innerHTML = icon('trash'); db.onclick = async () => { if (await UI.confirm('Variante löschen?', `„${a.name}“ wird gelöscht. Maße und Schritte bleiben, wie sie sind.`, 'Löschen', true)) remove(a.id); }; row.append(db); }
    sec.append(row);
    const steps = a ? collectSteps(App.doc) : [];
    if (a && steps.length) {
      const supCount = steps.filter(({ item }) => isSuppressedIn(a, item.id)).length;
      const det = h('details', { class: 'var-steps', id: 'var-steps' });
      det.open = stepsOpen;
      det.ontoggle = () => { stepsOpen = det.open; };
      const sum = h('summary', { 'data-help': 'variants' },
        h('span', null, 'Schritte in dieser Variante'),
        h('span', { class: 'var-steps-count' + (supCount ? ' has-sup' : '') }, supCount ? `${supCount} unterdrückt` : 'alle aktiv'));
      const sl = h('div', { class: 'var-step-list' });
      for (const { item, depth, label } of steps) {
        const isSup = isSuppressedIn(a, item.id);
        const liveDiff = !!item.suppressed !== isSup;
        const lbl = h('label', {
          class: 'var-step-row' + (isSup ? ' sup' : '') + (liveDiff ? ' diff' : ''),
          'data-id': item.id,
          style: { paddingLeft: (6 + depth * 14) + 'px' },
          title: isSup ? `${label} ist in „${a.name}“ unterdrückt – anklicken zum Aktivieren` : `${label} ist in „${a.name}“ aktiv – anklicken zum Unterdrücken`
        });
        const cb = h('input', { type: 'checkbox', class: 'var-step-cb', 'data-id': item.id, 'aria-label': `${label} in Variante „${a.name}“ aktiv` });
        cb.checked = !isSup;
        cb.onchange = () => setStepSuppressed(a.id, item.id, !cb.checked);
        const dot = h('span', { class: 'var-step-dot' + (item.role === 'hole' ? ' hole' : ''), style: item.role === 'hole' ? {} : { background: item.color || 'var(--accent)' } });
        lbl.append(cb, dot, h('span', { class: 'var-step-name' }, label));
        if (isSup) lbl.append(h('span', { class: 'var-step-tag' }, 'unterdrückt'));
        sl.append(lbl);
      }
      det.append(sum, sl);
      sec.append(det);
    }
    return sec;
  }
  return { list, active, changed, save, update, apply, remove, setStepSuppressed, toggleStep, suppressedOf, columns, addRow, duplicateRow, setName, setValue, setMaterial, toCSV, importCSV, tableDialog, compareData, compareDialog, section };
})();
