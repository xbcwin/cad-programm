// ================= Modell-Status und Export =================
// (Der Name „Print“ ist historisch – hier gibt es keinen Drucker und keine Druckplatte mehr.)
const Print = (() => {
  function solidBox() {
    const box = new THREE.Box3();
    for (const n of Viewer.nodes.values()) { if (n.role === 'hole' || !n.obj.visible || n.id === '__dragprev') continue; box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix)); }
    return box;
  }
  function stats() {
    const b = solidBox(); if (b.isEmpty()) return null;
    const s = b.getSize(new THREE.Vector3());
    return { x: s.x, y: s.y, z: s.z, box: b };
  }
  function checks() {
    const out = [];
    const st = stats();
    if (!st) { out.push({ s: 'none', t: 'Noch leer', d: 'Füge einen Körper hinzu oder starte eine Skizze.' }); return out; }
    const errs = App.errors.length;
    if (errs) out.push({ s: 'warn', t: errs === 1 ? 'Ein Schritt hat ein Problem' : errs + ' Schritte haben Probleme', d: App.errors[0].message });
    const bodies = App.doc.items.filter((x) => x.role !== 'hole' && !x.hidden).length;
    if (!out.length) out.push({ s: 'ok', t: `${fmt(st.x, 2)} × ${fmt(st.y, 2)} × ${fmt(st.z, 2)} mm`, d: `${bodies} ${bodies === 1 ? 'Körper' : 'Körper'}, Ursprung bei (0 | 0 | 0). Abmessungen der Hüllbox.` });
    return out;
  }
  function updateAmpel() {
    const cs = checks();
    const worst = cs.some((c) => c.s === 'bad') ? 'bad' : cs.some((c) => c.s === 'warn') ? 'warn' : cs.some((c) => c.s === 'none') ? 'none' : 'ok';
    const el = $('#ampel'); el.className = 'ampel ' + worst;
    const main = cs.find((c) => c.s === worst) || cs[0];
    el.querySelector('.t').textContent = main ? main.t : '';
    el.setAttribute('data-tip', 'Modell-Status');
  }
  function openAmpel(anchor) {
    const cs = checks();
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    box.append(h('div', { class: 'section-h' }, 'Modell-Status'));
    const list = h('div', { class: 'check-list' });
    for (const c of cs) {
      const row = h('div', { class: 'check-row ' + c.s });
      const stI = h('span', { class: 'st' }); stI.innerHTML = icon(c.s === 'ok' ? 'check' : c.s === 'warn' ? 'warn' : c.s === 'none' ? 'info' : 'close');
      row.append(stI, h('div', { class: 'grow' }, h('b', null, c.t), h('small', null, c.d))); list.append(row);
    }
    box.append(list);
    const ex = h('button', { type: 'button', class: 'btn primary' }); ex.innerHTML = icon('export') + 'Exportieren';
    ex.onclick = () => { UI.closePop(); exportDialog(); };
    box.append(ex);
    UI.pop(anchor, box, { up: true, alignRight: true });
  }

  // ---------- Dateien bauen ----------
  function weld(vertices, triangles) {
    const map = new Map(); const pos = []; const remap = new Uint32Array(vertices.length / 3);
    for (let i = 0; i < vertices.length / 3; i++) {
      const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
      const k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
      let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(x, y, z); }
      remap[i] = j;
    }
    const tri = [];
    for (let i = 0; i < triangles.length; i += 3) { const a = remap[triangles[i]], b = remap[triangles[i + 1]], c = remap[triangles[i + 2]]; if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
    return { pos, tri };
  }
  function buildSTL(objects, name) {
    let count = 0; for (const o of objects) count += o.triangles.length / 3;
    const buf = new ArrayBuffer(84 + count * 50); const dv = new DataView(buf);
    const head = ('Tracery ' + name).slice(0, 79);
    for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
    dv.setUint32(80, count, true);
    let off = 84;
    for (const o of objects) {
      const v = o.vertices, t = o.triangles;
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true); off += 12;
        for (const k of [a, b, c]) { dv.setFloat32(off, v[k], true); dv.setFloat32(off + 4, v[k + 1], true); dv.setFloat32(off + 8, v[k + 2], true); off += 12; }
        dv.setUint16(off, 0, true); off += 2;
      }
    }
    return new Uint8Array(buf);
  }
  async function build3MF(objects, name) {
    const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const colors = [...new Set(objects.map((o) => (o.color || '#2f9e91').toUpperCase()))];
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
    parts.push(`<metadata name="Title">${xmlEsc(name)}</metadata>\n<metadata name="Application">Tracery</metadata>\n<resources>\n<basematerials id="1">\n`);
    for (const c of colors) parts.push(`<base name="${xmlEsc(c)}" displaycolor="${c}FF"/>\n`);
    parts.push('</basematerials>\n');
    let id = 2; const ids = [];
    for (const o of objects) {
      const w = weld(o.vertices, o.triangles);
      const s = [`<object id="${id}" type="model" pid="1" pindex="${colors.indexOf((o.color || '#2f9e91').toUpperCase())}" name="${xmlEsc(o.name || 'Teil')}"><mesh><vertices>`];
      for (let i = 0; i < w.pos.length; i += 3) s.push(`<vertex x="${+w.pos[i].toFixed(5)}" y="${+w.pos[i + 1].toFixed(5)}" z="${+w.pos[i + 2].toFixed(5)}"/>`);
      s.push('</vertices><triangles>');
      for (let i = 0; i < w.tri.length; i += 3) s.push(`<triangle v1="${w.tri[i]}" v2="${w.tri[i + 1]}" v3="${w.tri[i + 2]}"/>`);
      s.push('</triangles></mesh></object>\n');
      parts.push(s.join('')); ids.push(id); id++;
    }
    parts.push('</resources>\n<build>\n');
    for (const i of ids) parts.push(`<item objectid="${i}"/>\n`);
    parts.push('</build>\n</model>\n');
    const enc = new TextEncoder();
    const model = enc.encode(parts.join(''));
    const ct = enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
    const rels = enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
    return Zip.make([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: '3D/3dmodel.model', data: model }]);
  }
  function safeName(s) { return (String(s || 'Tracery').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Tracery').slice(0, 80); }
  async function save(filename, data) {
    let dl = null;
    try { dl = await window.claude?.use('downloads'); } catch (_) {}
    if (!dl) {
      // Außerhalb von Claude (lokal oder auf GitHub Pages): normaler Browser-Download
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = h('a', { href: URL.createObjectURL(blob), download: filename }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      UI.toast('Gespeichert: ' + filename, { icon: 'check' }); return true;
    }
    try { const r = await dl.save({ filename, data }); if (r && r.status === 'saved') UI.toast('Gespeichert: ' + filename, { icon: 'check' }); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return false;
      const msg = {
        rate_limited: 'Einen Moment – es ist schon ein Speichern-Fenster offen.',
        too_large: 'Die Datei ist zu groß zum Speichern.',
        rejected_extension: 'Dieses Dateiformat kann hier nicht gespeichert werden.',
        extension_not_enabled: 'Dieses Dateiformat kann hier nicht gespeichert werden.',
      }[code] || (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code) ? 'Speichern ist in dieser Ansicht nicht möglich.' : 'Speichern hat nicht geklappt. Versuch es noch einmal.');
      UI.toast(msg, { kind: 'bad' });
      return false;
    }
  }
  function exportDialog() {
    if (!App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) { UI.toast('Es gibt noch nichts zu exportieren. Füge zuerst einen Körper hinzu.', { icon: 'info' }); return; }
    const plates = Plates.candidates();
    const opts = { step: true, stl: false, mf: false, dxf: false, plates: plates.map((p) => p.id) };
    const body = h('div', { style: { display: 'grid', gap: '12px' } });
    body.append(h('p', null, 'Die Dateien kommen zusammen als ZIP.'));
    const mk = (k, label, sub) => { const l = h('label', { class: 'check', style: { alignItems: 'flex-start' } }, h('input', { type: 'checkbox', id: 'ex-' + k, checked: opts[k] }), h('span', null, h('b', null, label), h('br'), h('small', { style: { color: 'var(--muted)' } }, sub))); l.querySelector('input').onchange = (e) => { opts[k] = e.target.checked; }; return l; };
    body.append(mk('step', 'STEP', 'Exakte Geometrie – für Fusion, FreeCAD, SolidWorks und Fertiger'), mk('stl', 'STL', 'Dreiecksnetz, z. B. für Renderings oder 3D-Druck'), mk('mf', '3MF', 'Dreiecksnetz mit Farben und Maßeinheit'));
    // flache Teile (Carbon-Platten) als 2D-Kontur für die Fräse oder den Laser
    if (plates.length) {
      const d = mk('dxf', 'Platten als DXF (für die Fräse)', 'Draufsicht in Originalgröße, eine Datei pro Platte – die Dicke steht im Dateinamen');
      d.setAttribute('data-help', 'plateDxf');
      const pl = h('div', { class: 'dxf-plates', style: { display: 'grid', gap: '4px', margin: '-4px 0 0 28px' } });
      for (const p of plates) { const l = h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-plate': p.id, checked: true }), `${p.name} · ${fmt(p.t, 2)} mm`); l.querySelector('input').onchange = (e) => { opts.plates = e.target.checked ? [...new Set([...opts.plates, p.id])] : opts.plates.filter((x) => x !== p.id); }; pl.append(l); }
      pl.hidden = !opts.dxf; d.querySelector('input').addEventListener('change', (e) => { pl.hidden = !e.target.checked; });
      body.append(d, pl);
    }
    const cs = checks().filter((c) => c.s === 'warn' || c.s === 'bad');
    if (cs.length) body.append(h('div', { class: 'hint-box', html: '<b>Hinweis:</b> ' + esc(cs[0].t) + ' – ' + esc(cs[0].d) }));
    UI.modal({ title: 'Exportieren', body, actions: [{ label: 'Abbrechen' }, { label: 'Als ZIP speichern', primary: true, run: () => { runExport(opts); } }] });
  }
  // Bild speichern (PNG) – in Bildschirm- oder Druckgröße, auf Wunsch mit durchsichtigem Hintergrund
  function imageDialog() {
    const vp = $('#viewport').getBoundingClientRect();
    const sizes = [['screen', `Wie der Bildschirm (${Math.round(vp.width * 2)} × ${Math.round(vp.height * 2)})`], ['1920', 'Full HD (1920 × 1080)'], ['3840', '4K (3840 × 2160)'], ['sq', 'Quadrat (2000 × 2000)']];
    const st = { size: 'screen', transparent: false };
    const body = h('div', { style: { display: 'grid', gap: '12px', minWidth: 'min(380px, 80vw)' } });
    body.append(UI.selectField({ id: 'img-size', label: 'Größe', value: st.size, options: sizes, onChange: (v) => { st.size = v; } }));
    const t = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'img-transparent' }), 'Durchsichtiger Hintergrund (für Präsentationen und Webseiten)');
    t.querySelector('input').onchange = (e) => { st.transparent = e.target.checked; };
    body.append(t, h('div', { class: 'hint-box' }, 'Das Bild zeigt den aktuellen Blickwinkel ohne Raster und Achsen. Im Studio-Look mit Werkstoff, Licht und Schatten (Ansicht → unten im Menü).'));
    UI.modal({ title: 'Bild speichern', body, actions: [{ label: 'Abbrechen' }, { label: 'Als PNG speichern', primary: true, run: () => { saveImage(st); } }] });
  }
  function imageSize(size) {
    const vp = $('#viewport').getBoundingClientRect();
    if (size === '1920') return [1920, 1080]; if (size === '3840') return [3840, 2160]; if (size === 'sq') return [2000, 2000];
    return [Math.max(64, Math.round(vp.width * 2)), Math.max(64, Math.round(vp.height * 2))];
  }
  async function saveImage(st) {
    const [w, hh] = imageSize(st.size);
    const url = Viewer.renderImage(w, hh, { transparent: st.transparent });
    const blob = await (await fetch(url)).blob();
    await save(safeName(App.doc.name) + '.png', blob);
    return { w, h: hh, bytes: blob.size };
  }
  async function runExport(opts) {
    if (!opts.stl && !opts.mf && !opts.step && !(opts.dxf && opts.plates.length)) { UI.toast('Wähle mindestens ein Format.', { kind: 'bad' }); return; }
    const tst = UI.toast('Dateien werden erstellt …', { icon: 'export', ms: 20000 });
    try {
      const scene = Model.kernelScene(App.doc);
      const name = safeName(App.doc.name);
      const files = [];
      if (opts.stl || opts.mf) {
        const res = await Kernel.call('exportMeshes', { scene, fine: true });
        if (!res.objects.length) throw new Error('Es gibt keinen Körper zum Speichern.');
        if (opts.stl) files.push({ name: name + '.stl', data: buildSTL(res.objects, name) });
        if (opts.mf) files.push({ name: name + '.3mf', data: await build3MF(res.objects, name) });
      }
      if (opts.step) { const r = await Kernel.call('exportSTEP', { scene }); files.push({ name: name + '.step', data: new Uint8Array(r.data) }); }
      if (opts.dxf) for (const id of opts.plates) { const f = await Plates.file(id); if (f && f.count) files.push({ name: 'DXF/' + f.name, data: f.data }); }
      files.push({ name: 'LIESMICH.txt', data: new TextEncoder().encode(`${App.doc.name}\nErstellt mit Tracery am ${new Date().toLocaleString('de-DE')}\n\nSTEP: exakte Geometrie für andere CAD-Programme\nSTL / 3MF: Dreiecksnetz (Millimeter)\n` + (opts.dxf ? 'DXF: Draufsicht jeder Platte in Originalgröße (Millimeter, Ebene KONTUR) – Dicke steht im Dateinamen\n' : '')) });
      const zip = await Zip.make(files);
      tst.remove();
      await save(name + '.zip', new Blob([zip]));
      try { Panels.firstStepDone('saved'); } catch (_) {}
    } catch (e) { tst.remove(); UI.toast('Export hat nicht geklappt: ' + e.message, { kind: 'bad' }); }
  }
  function init() {
    App.on('results', updateAmpel); App.on('doc', debounce(updateAmpel, 200));
    $('#ampel').addEventListener('click', (e) => openAmpel(e.currentTarget));
  }
  return { init, stats, checks, exportDialog, imageDialog, saveImage, imageSize, save, safeName, updateAmpel };
})();

// ---------- ZIP (mit Kompression, wenn der Browser sie kann) ----------
const Zip = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function deflate(data) {
    if (typeof CompressionStream === 'undefined') return null;
    try { const cs = new CompressionStream('deflate-raw'); return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer()); } catch (_) { return null; }
  }
  async function make(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
    const now = new Date(); const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff; const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    for (const f of files) {
      const name = enc.encode(f.name); const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const crc = crc32(data);
      let comp = data.length > 256 ? await deflate(data) : null; let method = 8;
      if (!comp || comp.length >= data.length) { comp = data; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, comp);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + comp.length;
    }
    const cdLen = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const total = all.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(total); let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }
  return { make, crc32 };
})();

