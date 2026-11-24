// ================= Masse: Volumen, Gewicht und Schwerpunkt =================
// Der CAD-Kern rechnet je Teil der obersten Ebene das exakte Volumen und den Volumenschwerpunkt.
// Jedes Teil kann ein eigenes Material haben (it.mat), sonst gilt das Material des Projekts.
// Kaufteile (Motoren, Akku …) haben statt eines Materials ein festes Gewicht aus dem Datenblatt (it.massG, in g).
const Mass = (() => {
  let cache = { rev: -1, p: null };
  const ev = makeEmitter();
  const matOf = (k) => MATERIALS.find((m) => m.k === k) || null;
  function projectMaterial(doc = App.doc) { return matOf(doc.settings && doc.settings.material) || matOf('CFK') || MATERIALS[0]; }
  function materialFor(it, doc = App.doc) { return (it && matOf(it.mat)) || projectMaterial(doc); }
  function enrich(r, doc) {
    if (!r) return null;
    let mass = 0; const c = [0, 0, 0]; const V = Model.vars(doc).v;
    for (const p of r.parts || []) {
      const it = doc.items.find((x) => x.id === p.id);
      if (fixedOf(it)) { p.fixed = true; p.own = true; p.mat = null; p.missing = it.massG === ''; p.mass = Math.max(0, Model.num(it.massG, V, 0)); }
      else { const m = materialFor(it, doc); p.mat = m.k; p.rho = m.rho; p.own = !!(it && matOf(it.mat)); p.mass = (p.volume / 1000) * m.rho; if (p.inertia) p.I = p.inertia.map((x) => (x * m.rho) / 1000); }
      mass += p.mass;
      if (p.com) for (let i = 0; i < 3; i++) c[i] += p.com[i] * p.mass;
    }
    r.mass = mass; r.com = mass > 0 ? c.map((v) => v / mass) : null;
    return r;
  }
  // Messung eines beliebigen Projektstands (z. B. einer älteren Version)
  function measureDoc(doc) {
    if (!Kernel.ready || !doc.items.length) return Promise.resolve(null);
    return Kernel.call('measure', { scene: Model.kernelScene(doc) }).then((r) => enrich(r, doc)).catch(() => null);
  }
  // Messung des aktuellen Stands – pro Stand nur einmal
  function measure() {
    if (!Kernel.ready || !App.doc.items.length) return Promise.resolve(null);
    if (cache.rev === App.revision && cache.p) return cache.p;
    const rev = App.revision;
    cache = { rev, p: measureDoc(App.doc).then((r) => { if (cache.rev === rev) ev.emit('measured', r); return r; }) };
    return cache.p;
  }
  // festes Gewicht – auch wenn es noch fehlt (leer): dann zählt es mit 0 g und wird angemahnt
  function fixedOf(it) { return !!(it && it.massG != null); }
  function partOf(r, id) { return r && (r.parts || []).find((p) => p.id === id) || null; }
  const gText = (g) => `${fmtFixed(g, g < 10 ? 2 : 1)} g`;

  // ---------- Standfestigkeit (PF-14): Steht das Teil, so wie es liegt, oder kippt es? ----------
  // Aufstandsfläche = Hülle der untersten Punkte; der Schwerpunkt muss darüber liegen. Kippwinkel = atan(Abstand zur Kante / Höhe).
  function hull2(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function stability(id, com) {
    const n = Viewer.nodes.get(id); if (!n || !n.mesh || !com) return null;
    n.obj.updateMatrixWorld(true);
    const P = n.mesh.geometry.getAttribute('position').array, M = n.mesh.matrixWorld, v = new THREE.Vector3();
    let zmin = Infinity; const all = [];
    for (let i = 0; i < P.length; i += 3) { v.fromArray(P, i).applyMatrix4(M); all.push([v.x, v.y, v.z]); if (v.z < zmin) zmin = v.z; }
    const foot = all.filter((p) => p[2] < zmin + 0.05).map((p) => [p[0], p[1]]);
    const hull = hull2(foot), h = com[2] - zmin;
    if (hull.length < 3) return { ok: false, d: 0, angle: 0, h, hull };
    // kleinster Abstand des Schwerpunkts (von oben) zu einer Kante; negativ = außerhalb
    let inside = true, d = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const s = (ex * (com[1] - a[1]) - ey * (com[0] - a[0])) / L;   // links der Kante = innen (Hülle gegen den Uhrzeigersinn)
      if (s < 0) inside = false; d = Math.min(d, Math.abs(s));
    }
    const dd = inside ? d : -d;
    return { ok: dd > 1e-6, d: dd, angle: dd > 0 ? (Math.atan2(dd, Math.max(h, 1e-6)) * 180) / Math.PI : 0, h, hull };
  }
  // ---------- Schwerpunkt im Bild ----------
  let marker = null;
  function markerObj() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const r = 26;
    g.translate(32, 32);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16202b';
    for (const a of [0, Math.PI]) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a - Math.PI / 2, a); g.closePath(); g.fill(); }
    g.lineWidth = 3.5; g.strokeStyle = '#16202b'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.scale.set(0.034, 0.034, 1); sp.renderOrder = 40;
    return sp;
  }
  function showMarker(r) {
    const on = ViewPrefs.get().cog && App.mode === 'model' && r && r.com;
    if (!on) { if (marker) { Viewer.groups.overlay.remove(marker); marker.material.map.dispose(); marker.material.dispose(); marker = null; Viewer.requestRender(); } return; }
    if (!marker) { marker = markerObj(); Viewer.groups.overlay.add(marker); }
    marker.position.set(...r.com); Viewer.requestRender();
  }
  function refreshMarker() { if (!ViewPrefs.get().cog) { showMarker(null); return; } measure().then(showMarker); }
  function init() {
    App.on('results', refreshMarker); App.on('mode', refreshMarker);
    ViewPrefs.on('change', refreshMarker);
  }
  // ---------- Stückliste: alle Teile ganz oben im Verlauf, gleiche zusammengefasst ----------
  const PRINTMATS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU 95A', 'PA6', 'PA12', 'PC'];
  async function bom(doc = App.doc) {
    const r = doc === App.doc ? await measure() : await measureDoc(doc); if (!r) return null;
    const map = new Map();
    for (const it of doc.items) {
      if (it.role === 'hole' || it.suppressed || !Model.isActive(doc, it.id)) continue;
      const p = partOf(r, it.id); if (!p) continue;
      // „Arm 2“, „Arm (Kopie)“ und „Arm“ sind dasselbe Teil, wenn auch das Gewicht gleich ist
      // Gruppen wie „Motor 2207 (4×)“ zählen als vier Stück
      const mult = /\s*\((\d+)\s*[×x]\)\s*$/.exec(it.name || ''), k = mult ? Math.max(1, +mult[1]) : 1;
      const name = String(it.name || 'Teil').replace(/\s*\(\d+\s*[×x]\)\s*$/, '').replace(/\s*\(Kopie[^)]*\)\s*$/i, '').replace(/\s+\d+$/, '').trim() || 'Teil';
      const kind = p.fixed ? 'Kaufteil' : (p.mat || '–');
      const key = name + '|' + kind + '|' + round(p.mass / k, 2);
      const row = map.get(key) || { name, kind, n: 0, g: p.mass / k, cm3: p.fixed ? null : p.volume / 1000 / k, dims: p.bbox ? [p.bbox[3] - p.bbox[0], p.bbox[4] - p.bbox[1], p.bbox[5] - p.bbox[2]] : null, missing: !!p.missing, buy: !!p.fixed, ids: [] };
      row.n += k; row.ids.push(it.id); map.set(key, row);
    }
    const rows = [...map.values()].sort((a, b) => (a.buy === b.buy ? b.g * b.n - a.g * a.n : a.buy ? 1 : -1));
    // Filament für Druckteile: Gewicht je Druck-Material und Länge bei 1,75 mm Draht (massiv gerechnet)
    const fil = new Map();
    for (const x of rows) { const m = !x.buy && PRINTMATS.includes(x.kind) ? matOf(x.kind) : null; if (m) fil.set(m.k, (fil.get(m.k) || 0) + x.g * x.n); }
    const filament = [...fil.entries()].map(([k, g]) => ({ mat: k, g, m: g / matOf(k).rho / (Math.PI * 0.0875 * 0.0875) / 100 }));
    return { rows, mass: rows.reduce((s, x) => s + x.g * x.n, 0), count: rows.reduce((s, x) => s + x.n, 0), screws: screws(doc), threads: threads(doc), filament };
  }
  // Markierte kosmetische Gewinde (KP-20) je aktivem Körper mit Instanz-Anzahl
  function threads(doc = App.doc) {
    const V = Model.vars(doc).v, map = new Map();
    Model.walk(doc.items, (it) => {
      if (it.role === 'hole' || it.suppressed || !Model.isActive(doc, it.id) || !it.threads || !it.threads.length) return;
      const n = Math.max(1, Model.instanceMatrices(doc, it.id, V).length);
      const part = Model.label(it);
      for (const th of it.threads) {
        const L = round(Model.num(th.length, V, 10), 1);
        const kind = th.kind === 'int' ? 'int' : 'ext';
        const spec = THREAD_MAP[th.size];
        const sizeLabel = th.pitch > 0 && (!spec || Math.abs(th.pitch - spec.pitch) > 1e-4) ? `${th.size}×${fmtFixed(th.pitch, 2)}` : th.size;
        const label = `${kind === 'int' ? 'Innengewinde' : 'Außengewinde'} ${sizeLabel} × ${Units.fmtLenU(L, 1, doc)}`;
        const key = label + '|' + part;
        const row = map.get(key) || { name: label, size: th.size, length: L, kind, part, n: 0, ids: [] };
        row.n += n;
        if (!row.ids.includes(it.id)) row.ids.push(it.id);
        map.set(key, row);
      }
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  }
  // Schrauben, Muttern und Gewindeeinsätze aus den Loch-Bauteilen (auch in Gruppen und Mustern).
  // Löcher auf derselben Achse (gleiche Schraube durch zwei Platten) zählen nur einmal.
  function screws(doc = App.doc) {
    const V = Model.vars(doc).v, map = new Map(), seen = new Set();
    const HEAD = { countersunk: 'Senkkopf', counterbore: 'Zylinderkopf', none: '' };
    Model.walk(doc.items, (it) => {
      if (it.kind !== 'part' || !it.p || it.suppressed || !Model.isActive(doc, it.id)) return;
      const L = it.p.lib, size = String(it.p.size || '');
      let label = null, per = 1;
      if (L === 'screwHole') label = `Schraube ${size}` + (HEAD[it.p.head] ? ' ' + HEAD[it.p.head] : '');
      else if (L === 'holePattern') { label = `Schraube ${size}`; per = 4; }
      else if (L === 'nutTrap') label = `Mutter ${size}`;
      else if (L === 'insert') label = `Gewindeeinsatz ${size}`;
      if (!label) return;
      let n = 0;
      for (const m of Model.instanceMatrices(doc, it.id, V)) {
        const e = m.elements, d = new THREE.Vector3(e[8], e[9], e[10]).normalize(), o = new THREE.Vector3(e[12], e[13], e[14]);
        if (d.z < -1e-6 || (Math.abs(d.z) <= 1e-6 && (d.y < -1e-6 || (Math.abs(d.y) <= 1e-6 && d.x < 0)))) d.negate();
        o.addScaledVector(d, -o.dot(d));
        const key = [label, per, ...[d.x, d.y, d.z].map((v) => Math.round(v * 100)), ...[o.x, o.y, o.z].map((v) => Math.round(v / 0.3))].join('|');
        if (seen.has(key)) continue; seen.add(key); n += per;
      }
      if (n) map.set(label, (map.get(label) || 0) + n);
    });
    return [...map.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  }
  function bomCSV(B, name) {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"', z = (v, d = 1) => String(round(v, d)).replace('.', ',');
    const L = [['Teil', 'Anzahl', 'Art', 'Gewicht je Stück (g)', 'Gewicht gesamt (g)', `Volumen je Stück (${Units.volLabel()})`, `Größe (${Units.label()})`].map(q).join(';')];
    for (const x of B.rows) {
      const sz = x.dims ? x.dims.map((v) => Units.fmtLen(v, 1)).join(' × ') : '';
      const vol = x.cm3 == null ? '' : z(Units.volFromMM3(x.cm3 * 1000), Units.key() === 'm' ? 5 : 2);
      L.push([q(x.name), x.n, q(x.kind), x.missing ? '' : z(x.g), x.missing ? '' : z(x.g * x.n), vol, q(sz)].join(';'));
    }
    L.push([q('Summe ' + name), B.count, '', '', z(B.mass), '', ''].join(';'));
    for (const x of B.screws || []) L.push([q(x.name), x.n, q('Kleinteil'), '', '', '', ''].join(';'));
    for (const x of B.threads || []) L.push([q(x.name), x.n, q('Gewinde (' + x.part + ')'), '', '', '', ''].join(';'));
    return '\ufeff' + L.join('\r\n') + '\r\n';
  }
  async function bomDialog() {
    const body = h('div', { class: 'vcmp', id: 'bom', style: { overflowX: 'auto' } }, h('div', { class: 'hint-box' }, 'Rechne …'));
    let B = null;
    UI.modal({ title: 'Stückliste', body, wide: true, actions: [
      { label: 'Als Tabelle speichern (CSV)', run: () => { if (B) Print.save(Print.safeName(App.doc.name) + ' Stückliste.csv', bomCSV(B, App.doc.name)); return false; } },
      { label: 'Schließen', primary: true }] });
    B = await bom(); body.innerHTML = '';
    if (!B || !B.rows.length) { body.append(h('div', { class: 'hint-box' }, 'Noch keine Teile im Projekt.')); return; }
    const tb = h('table', { class: 'vtable' }, h('tr', null, ...['Teil', 'Anzahl', 'Art', 'Größe', 'je Stück', 'gesamt'].map((t) => h('th', null, t))));
    for (const x of B.rows) {
      const sz = x.dims ? `${Units.fmtLen(x.dims[0], 1)} × ${Units.fmtLen(x.dims[1], 1)} × ${Units.fmtLen(x.dims[2], 1)} ${Units.label()}` : '–';
      const tr = h('tr', { class: 'bom-row', style: { cursor: 'pointer' } }, h('td', null, x.name), h('td', { class: 'mono' }, String(x.n)), h('td', null, x.kind), h('td', { class: 'mono' }, sz), h('td', { class: 'mono' }, x.missing ? 'fehlt' : gText(x.g)), h('td', { class: 'mono' }, x.missing ? '–' : gText(x.g * x.n)));
      tr.onclick = () => App.select(x.ids);
      tb.append(tr);
    }
    tb.append(h('tr', { class: 'bom-sum' }, h('td', null, h('b', null, 'Summe')), h('td', { class: 'mono' }, h('b', null, String(B.count))), h('td', null, ''), h('td', null, ''), h('td', null, ''), h('td', { class: 'mono' }, h('b', null, gText(B.mass)))));
    body.append(tb);
    if (B.screws.length) {
      const ts = h('table', { class: 'vtable', id: 'bom-screws', style: { marginTop: '14px' } }, h('tr', null, h('th', null, 'Schrauben und Kleinteile'), h('th', null, 'Anzahl')));
      for (const x of B.screws) ts.append(h('tr', null, h('td', null, x.name), h('td', { class: 'mono' }, String(x.n))));
      body.append(ts, h('div', { class: 'hint-box' }, 'Gezählt aus Schraubenlöchern, Lochbildern (je vier), Mutternfallen und Gewindeeinsätzen – Löcher auf derselben Achse zählen als eine Schraube. Die Länge der Schrauben misst du am besten am Modell nach; ihr Gewicht ist in der Summe nicht enthalten.'));
    }
    if (B.threads && B.threads.length) {
      const tt = h('table', { class: 'vtable', id: 'bom-threads', style: { marginTop: '14px' } }, h('tr', null, h('th', null, 'Markierte Gewinde'), h('th', null, 'Teil'), h('th', null, 'Anzahl')));
      for (const x of B.threads) {
        const tr = h('tr', { style: { cursor: 'pointer' } }, h('td', null, x.name), h('td', null, x.part), h('td', { class: 'mono' }, String(x.n)));
        tr.onclick = () => App.select(x.ids);
        tt.append(tr);
      }
      body.append(tt);
    }
    const filLen = (m) => Units.key() === 'in' ? `${fmtFixed((m * 1000) / 25.4, 1)} in` : Units.key() === 'cm' ? `${fmtFixed(m * 100, 1)} cm` : `${fmtFixed(m, 1)} m`;
    if (B.filament.length) body.append(h('div', { class: 'ok-box', id: 'bom-filament', html: '<b>Filament für die Druckteile:</b> ' + B.filament.map((x) => `${x.mat} ${gText(x.g)} ≈ ${filLen(x.m)}`).join(' · ') + ' (Draht 1,75 mm, massiv gerechnet – mit weniger Füllung brauchst du weniger; Stützen und Rand kommen dazu).' }));
    body.append(h('div', { class: 'hint-box', html: 'Gleiche Teile (gleicher Name ohne Nummer, gleiches Gewicht) stehen in einer Zeile. Klick auf eine Zeile wählt die Teile im Bild aus. <b>Kaufteile</b> zählen mit dem Gewicht aus dem Datenblatt, alles andere mit Volumen × Material.' + (B.rows.some((x) => x.missing) ? ' Bei Teilen mit „fehlt“ ist noch kein Gewicht eingetragen.' : '') }));
  }
  return { stability, hull2, init, measure, measureDoc, bom, bomCSV, bomDialog, screws, threads, matOf, get materials() { return MATERIALS; }, materialFor, projectMaterial, partOf, gText, fixedOf, on: ev.on, get markerShown() { return !!marker; }, get markerPos() { return marker ? marker.position.toArray() : null; } };
})();
