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
  const label = (id) => { const f = Model.find(App.doc, id); return f ? Model.label(f.item) : 'ein Teil'; };
  const thrustOf = (doc = App.doc) => (doc.drone && doc.drone.thrustG != null && doc.drone.thrustG !== '' ? Model.num(doc.drone.thrustG, Model.vars(doc).v, 0) : null);
  async function run() {
    const doc = App.doc, g = geometryAny(doc);
    if (!g) return null;
    const rev = App.revision, out = [];
    if (g.free) out.push({ id: 'free', title: 'Selbst gebauter Rahmen', s: 'info', text: `${g.n} Motoren aus deinen Kaufteilen erkannt` + (g.zoll ? `, Propeller ${fmt(g.zoll, 1)}" (${g.zoll_from === 'props' ? 'aus den Propellern im Modell' : 'eingetragen'}).` : '. Für die Propeller-Prüfungen fehlt noch die Größe – leg Propeller aus „Kaufteile“ auf die Motoren oder trag sie unten ein.') });
    // 1. Abstand der Propeller untereinander
    const gap = g.gap;
    if (gap != null) out.push({ id: 'gap', title: 'Propeller untereinander', s: gap < 0 ? 'bad' : gap < 5 ? 'warn' : 'ok', text: gap < 0 ? `Die Propeller überlappen sich um ${fmt(-gap, 1)} mm – ${g.free ? 'Motoren weiter auseinander setzen' : 'Achsabstand vergrößern'}.` : `${fmt(gap, 1)} mm Luft zwischen den Propellerspitzen.` });
    // 2./3. Kollisionen aus dem CAD-Kern
    let cl = null;
    try { cl = await Kernel.call('clashes', { scene: Model.kernelScene(doc), probes: g.probes, skipPairs: g.skipPairs }); } catch (_) {}
    if (cl && !g.probes.length) cl.hits = [];
    if (cl) {
      const bad = [];
      cl.hits.forEach((hs, i) => { if (hs.length) bad.push(`Propeller ${g.motors[i][0]} trifft ${hs.map((x) => label(x.id)).join(', ')}`); });
      const ids = [...new Set(cl.hits.flat().map((x) => x.id))];
      if (g.probes.length) out.push({ id: 'props', title: 'Propellerkreise frei', s: bad.length ? 'bad' : 'ok', text: bad.length ? bad.join('. ') + '.' : 'Kein Teil ragt in die Propellerkreise (1 mm Sicherheitsabstand).', ids });
      const pairs = cl.pairs.map((p) => `${label(p.a)} und ${label(p.b)} (${fmt(p.v / 1000, 2)} cm³)`);
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
        out.push({ id: 'frame', title: 'Rahmen gegen Original', s: 'info', text: `Rahmen im Modell ca. ${Mass.gText(own)}, ${fr.hersteller} ${fr.name} laut Hersteller ${Mass.gText(fr.g)} (${d >= 0 ? '+' : '−'}${Mass.gText(Math.abs(d))}). Der Nachbau hat vereinfachte Umrisse – Löcher, Fasen und Aussparungen des Originals fehlen.` + (fr.a && Math.abs(fr.a - g.A) > 0.5 ? ` Achsabstand hier ${fmt(g.A, 0)} mm, beim Original ${fmt(fr.a, 0)} mm.` : '') });
      }
      // 5. Schwerpunkt gegenüber der Mitte zwischen den Motoren
      if (m.com) {
        const cx = g.motors.reduce((s, x) => s + x[1], 0) / g.motors.length, cy = g.motors.reduce((s, x) => s + x[2], 0) / g.motors.length;
        const dx = m.com[0] - cx, dy = m.com[1] - cy, d = Math.hypot(dx, dy);
        const dir = [Math.abs(dy) > 0.5 ? (dy < 0 ? 'nach vorne' : 'nach hinten') : '', Math.abs(dx) > 0.5 ? (dx > 0 ? 'nach rechts' : 'nach links') : ''].filter(Boolean).join(' und ');
        const akku = doc.items.some((i) => /akku/i.test(i.name || '') && !i.hidden);
        const sc = d <= 0.03 * g.A ? 'ok' : !akku ? 'info' : d <= 0.08 * g.A ? 'warn' : 'bad';
        out.push({ id: 'cog', title: 'Schwerpunkt', s: sc, text: (d < 0.5 ? 'Genau in der Mitte zwischen den Motoren.' : `${fmt(d, 1)} mm ${dir} verschoben` + (d <= 0.03 * g.A ? ' – passt.' : akku ? ' – Akku oder schwere Teile verschieben.' : '.')) + (akku ? '' : ' Noch ohne Akku – leg einen auf die Oberplatte und prüf noch mal.') });
      }
      // 6. Schub zu Gewicht
      const t = thrustOf(doc);
      if (t) {
        const tw = (g.n * t) / m.mass;
        const src = doc.drone && doc.drone.thrustSrc ? ` (Richtwert ${fmt(t, 0)} g pro Motor: ${doc.drone.thrustSrc})` : '';
        out.push({ id: 'tw', title: 'Schub zu Gewicht', s: tw < 2 ? 'bad' : tw < 4 ? 'warn' : 'ok', text: `${fmt(tw, 1)} : 1 – ` + (tw < 2 ? 'zu schwach, hebt kaum ab.' : tw < 4 ? 'reicht für ruhiges Fliegen und Long Range.' : tw < 8 ? 'gut für Freestyle.' : 'genug für Rennen.') + src });
      } else out.push({ id: 'tw', title: 'Schub zu Gewicht', s: 'info', text: 'Trag unten den Schub pro Motor aus der Schubtabelle ein.' });
    }
    // 7. Speed-Rumpf: Form und Fluglage
    const V = g.V;
    if (!g.free && typeof V.Rumpfdurchmesser === 'number' && typeof V.Nasenlänge === 'number') {
      const L = V.Nasenlänge + V.Rumpflänge + V.Hecklänge, D = V.Rumpfdurchmesser;
      let fa = null; try { if (typeof Views !== 'undefined' && Viewer.nodes.size) fa = Views.windArea(0); } catch (_) {}
      out.push({ id: 'aero', title: 'Stromlinie', s: 'info', text: `Rumpf ${fmt(L, 0)} mm lang und ${fmt(D, 0)} mm dick (${fmt(L / D, 1)} : 1), Akku und Elektronik liegen innen.` + (fa ? ` Stirnfläche von vorne ohne Propeller: ${fmt(fa / 100, 1)} cm² (Ansicht „Fahrtwind“).` : '') + (g.tilt ? ` Motoren ${fmt(g.tilt, 0)}° geneigt: Fliegt die Drohne mit ${fmt(g.tilt, 0)}° Schräglage, liegt der Rumpf genau im Fahrtwind.` : ' Mit geneigten Motoren (Maß „Motorneigung“) läge der Rumpf im schnellen Flug flach im Wind.') });
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
  return { geometry: geometryAny, isDrone, run, dialog, rows, summary, thrustOf, on: ev.on };
})();

// ---------- Platten als DXF für die Fräse ----------
const Plates = (() => {
  // flache Teile der obersten Ebene: höchstens 12 mm dick, kein Kaufteil, kein Loch, nichts Gedrucktes (z. B. Motorkeile)
  const PRINTED = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU 95A', 'PA12', 'PC', 'POM'];
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
    return { name: `${Print.safeName(Model.label(it))} – ${fmt(t, 2).replace('.', ',')} mm.dxf`, data: bytes, count, t, edges: v.visible };
  }
  return { candidates, file, dxf };
})();

// ---------- Varianten: benannte Sätze von Maßen, zum Umschalten und Vergleichen ----------
const Variants = (() => {
  const list = () => App.doc.variants || [];
  const snap = (doc = App.doc) => Object.fromEntries((doc.params || []).map((p) => [p.name, p.expr]));
  function active() { return list().find((v) => v.id === App.doc.variant) || null; }
  function changed() { const a = active(); if (!a) return false; const s = snap(); return Object.keys({ ...a.values, ...s }).some((k) => String(a.values[k]) !== String(s[k])); }
  function save(name) {
    const v = { id: uid('va'), name: (name || '').trim() || 'Variante ' + (list().length + 1), values: snap() };
    App.change(`Variante „${v.name}“ gespeichert`, (doc) => { doc.variants = doc.variants || []; doc.variants.push(v); doc.variant = v.id; });
    return v;
  }
  function update() { const a = active(); if (!a) return; App.change(`Variante „${a.name}“ aktualisiert`, (doc) => { const v = doc.variants.find((x) => x.id === a.id); v.values = snap(doc); }); }
  function apply(id) {
    const v = list().find((x) => x.id === id); if (!v) return;
    App.change(`Variante „${v.name}“`, (doc) => {
      for (const p of doc.params) if (Object.prototype.hasOwnProperty.call(v.values, p.name)) p.expr = v.values[p.name];
      doc.variant = v.id;
    });
  }
  function remove(id) { App.change('Variante gelöscht', (doc) => { doc.variants = (doc.variants || []).filter((x) => x.id !== id); if (doc.variant === id) doc.variant = null; }); }
  // Vergleich: Maße, die sich unterscheiden, dazu Gewicht und (bei Drohnen) Schub/Gewicht
  async function compareData() {
    const vs = list(); if (!vs.length) return null;
    const names = [...new Set(vs.flatMap((v) => Object.keys(v.values)))].filter((k) => new Set(vs.map((v) => String(v.values[k]))).size > 1);
    const rowsOut = [];
    for (const v of vs) {
      const d = JSON.parse(App.snapshot());
      for (const p of d.params) if (Object.prototype.hasOwnProperty.call(v.values, p.name)) p.expr = v.values[p.name];
      const m = await Mass.measureDoc(d);
      const t = DroneCheck.thrustOf(d);
      const g = DroneCheck.geometry(d);
      rowsOut.push({ v, mass: m ? m.mass : null, tw: t && m && g ? (g.n * t) / m.mass : null, gap: g ? g.gap : null });
    }
    return { names, rows: rowsOut };
  }
  async function compareDialog() {
    const body = h('div', { class: 'vcmp', style: { overflowX: 'auto' } }, h('div', { class: 'hint-box' }, 'Rechne alle Varianten …'));
    UI.modal({ title: 'Varianten vergleichen', body, wide: true, actions: [{ label: 'Schließen', primary: true }] });
    const c = await compareData(); body.innerHTML = '';
    if (!c) { body.append(h('div', { class: 'hint-box' }, 'Noch keine Varianten.')); return; }
    const tbl = h('table', { class: 'vtable', id: 'vtable' });
    const head = h('tr', null, h('th', null, 'Variante'), ...c.names.map((n) => h('th', null, n)), h('th', null, 'Gewicht'), h('th', null, 'Schub/Gewicht'), h('th', null, 'Luft Propeller'));
    tbl.append(head);
    for (const r of c.rows) {
      tbl.append(h('tr', { class: r.v.id === App.doc.variant ? 'on' : '' }, h('td', null, h('b', null, r.v.name)), ...c.names.map((n) => h('td', { class: 'mono' }, r.v.values[n] == null ? '–' : String(r.v.values[n]).replace('.', ','))), h('td', { class: 'mono' }, r.mass == null ? '–' : Mass.gText(r.mass)), h('td', { class: 'mono' }, r.tw == null ? '–' : fmt(r.tw, 1) + ' : 1'), h('td', { class: 'mono' }, r.gap == null ? '–' : fmt(r.gap, 1) + ' mm')));
    }
    body.append(tbl);
  }
  // Abschnitt oben im Reiter „Maße“
  function section() {
    const sec = h('div', { class: 'section variants' }, h('div', { class: 'section-h' }, 'Varianten'));
    const vs = list();
    if (vs.length) {
      const a = active();
      sec.append(UI.selectField({ id: 'var-sel', label: 'Aktive Variante', value: a ? a.id : '', options: [...(a ? [] : [['', '– keine –']]), ...vs.map((v) => [v.id, v.name])], onChange: (id) => id && apply(id) }));
      if (a && changed()) sec.append(h('div', { class: 'hint-box warn' }, `Die Maße weichen von „${a.name}“ ab.`));
    } else sec.append(h('div', { class: 'hint-box', html: 'Speichere die Maße als Variante – z. B. „5 Zoll“ und „6 Zoll“ oder „leicht“ und „robust“ – und schalte mit einem Klick um.' }));
    const row = h('div', { class: 'btn-row' });
    const a = active();
    if (a && changed()) { const up = h('button', { type: 'button', class: 'btn small', id: 'var-update', 'data-tip': `„${a.name}“ mit den jetzigen Maßen überschreiben` }); up.innerHTML = icon('save') + 'Überschreiben'; up.onclick = () => update(); row.append(up); }
    const nb = h('button', { type: 'button', class: 'btn small', id: 'var-new' }); nb.innerHTML = icon('plus') + 'Neue Variante';
    nb.onclick = async () => { const n = await UI.prompt('Variante speichern', 'Name der Variante', 'Variante ' + (vs.length + 1), 'Speichern'); if (n != null) save(n); };
    row.append(nb);
    if (vs.length > 1) { const cb = h('button', { type: 'button', class: 'btn small', id: 'var-cmp' }); cb.innerHTML = icon('list') + 'Vergleichen'; cb.onclick = () => compareDialog(); row.append(cb); }
    if (a) { const db = h('button', { type: 'button', class: 'btn ghost small danger', id: 'var-del', 'aria-label': 'Variante löschen', 'data-tip': 'Aktive Variante löschen' }); db.innerHTML = icon('trash'); db.onclick = async () => { if (await UI.confirm('Variante löschen?', `„${a.name}“ wird gelöscht. Die Maße bleiben, wie sie sind.`, 'Löschen', true)) remove(a.id); }; row.append(db); }
    sec.append(row);
    return sec;
  }
  return { list, active, changed, save, update, apply, remove, compareData, compareDialog, section };
})();
