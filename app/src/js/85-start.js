// ================= Startseite, Vorlagen, Dateien, Einführung =================
const Templates = (() => {
  const T0 = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const it = (kind, p, o = {}) => { const x = Model.newItem(kind, p, { name: o.name, role: o.role, color: o.color }); Object.assign(x.t, o.t || {}); if (o.fin) x.finishes = o.fin.map((f) => ({ id: uid('f'), ...f })); return x; };
  const grp = (name, children, o = {}) => { const g = Model.newItem('group', {}, { name, color: o.color || (children.find((c) => c.role !== 'hole') || children[0]).color }); g.children = children; Object.assign(g.t, o.t || {}); if (o.fin) g.finishes = o.fin.map((f) => ({ id: uid('f'), ...f })); return g; };
  const part = (lib, p, o = {}) => { const d = LIBMAP[lib]; const x = Model.newItem('part', { lib, ...libDefaults(d), ...p }, { name: o.name || d.label, role: d.role, color: o.color }); Object.assign(x.t, o.t || {}); return x; };
  const param = (name, expr) => ({ id: uid('m'), name, expr });
  const LIST = [
    {
      id: 'box', name: 'Box mit Deckel', desc: 'Mit Maßen wie Wandstärke und Spiel – änderst du sie, passt sich alles an.',
      build() {
        const d = Model.newDoc('Box mit Deckel');
        d.params = [param('Breite', 60), param('Tiefe', 40), param('Höhe', 30), param('Wand', 2), param('Spiel', 0.2)];
        // Nur die Außenecken runden: innen bleiben die Ecken scharf, damit der Steg des Deckels hineinpasst
        const box = grp('Box', [
          it('box', { w: 'Breite', d: 'Tiefe', h: 'Höhe' }, { name: 'Außen', color: '#2f9e91', fin: [{ type: 'fillet', r: 3, edges: 'vertical' }] }),
          it('box', { w: 'Breite - 2*Wand', d: 'Tiefe - 2*Wand', h: 'Höhe' }, { name: 'Innenraum', role: 'hole', t: { z: 'Wand' } }),
        ], { color: '#2f9e91', t: { x: '-(Breite/2 + 8)' } });
        const lid = grp('Deckel', [
          it('box', { w: 'Breite', d: 'Tiefe', h: 'Wand' }, { name: 'Platte', color: '#e8833a', fin: [{ type: 'fillet', r: 3, edges: 'vertical' }] }),
          it('box', { w: 'Breite - 2*Wand - 2*Spiel', d: 'Tiefe - 2*Wand - 2*Spiel', h: 3 }, { name: 'Steg', t: { z: 'Wand' }, color: '#e8833a' }),
          it('box', { w: 'Breite - 4*Wand - 2*Spiel', d: 'Tiefe - 4*Wand - 2*Spiel', h: 3.5 }, { name: 'Steg innen', role: 'hole', t: { z: 'Wand' } }),
        ], { color: '#e8833a', t: { x: 'Breite/2 + 8' } });
        d.items = [box, lid];
        return d;
      },
      svg: '<path d="M12 22 40 12l28 10-28 10z" class="a1"/><path d="M12 22v18l28 10V32z" class="a2"/><path d="M68 22v18L40 50V32z" class="a3"/><path d="M50 8 74 0l18 6-24 8z" class="b1"/><path d="M50 8v4l18 6v-4z" class="b2"/><path d="M92 6v4l-24 8v-4z" class="b3"/>',
    },
    {
      id: 'sign', name: 'Schild mit Loch', desc: 'Flache Platte mit runden Ecken und einem Loch zum Aufhängen.',
      build() {
        const d = Model.newDoc('Schild');
        d.params = [param('Länge', 80), param('Breite', 30), param('Dicke', 3)];
        d.items = [grp('Schild', [
          it('box', { w: 'Länge', d: 'Breite', h: 'Dicke' }, { name: 'Platte', color: '#3f7fd6' }),
          it('cylinder', { d: 5, h: 10 }, { name: 'Loch', role: 'hole', t: { x: 'Länge/2 - 7', z: -1 } }),
        ], { color: '#3f7fd6', fin: [{ type: 'fillet', r: 5, edges: 'vertical' }] })];
        return d;
      },
      svg: '<path d="M10 30 70 10l30 12-60 20z" class="a1"/><path d="M10 30v5l30 12v-5z" class="a2"/><path d="M100 22v5L40 47v-5z" class="a3"/><ellipse cx="84" cy="20" rx="4" ry="2.2" class="hole"/>',
    },
    {
      id: 'phone', name: 'Handyhalter', desc: 'Schräge Lehne, Ablage vorne und ein Schlitz fürs Kabel.',
      build() {
        const d = Model.newDoc('Handyhalter');
        d.params = [param('Breite', 75)];
        // Seitenprofil (Y nach hinten, Z nach oben): Fuß, Lippe vorne, Lehne 20° nach hinten geneigt, Stütze dahinter
        const T = 4, a = (20 * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a), L = 85;
        const P = [[-40, 0], [40, 0], [40, T], [28, T], [-8 + ((50 - T) / c) * s, 50], [-8 + L * s, T + L * c], [-12 + L * s, T + L * c], [-12, T], [-36, T], [-36, 16], [-40, 16]].map(([y, z]) => [round(y, 3), round(z, 3)]);
        const ents = P.map((p, i) => ({ id: uid('e'), type: 'line', a: p, b: P[(i + 1) % P.length] }));
        const body = Model.newItem('extrude', {}, { name: 'Halter', color: '#8a6ad1' });
        body.p = { sketch: { plane: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] }, ents }, dist: 'Breite', dir: 'normal' };
        body.t.x = '-Breite/2';
        d.items = [grp('Handyhalter', [
          body,
          it('box', { w: 14, d: 10, h: 20 }, { name: 'Kabelschlitz', role: 'hole', t: { y: -38, z: 7 } }),
        ], { color: '#8a6ad1' })];
        return d;
      },
      svg: '<path d="M14 40 60 26l30 10-46 14z" class="a1"/><path d="M58 30 64 2l8 3-6 28z" class="a3"/><path d="M20 38l2-8 6 2-2 8z" class="a2"/>',
    },
    {
      id: 'bracket', name: 'Winkel zum Anschrauben', desc: 'L-Winkel mit Senkkopf-Schraublöchern und Versteifung.',
      build() {
        const d = Model.newDoc('Winkel');
        d.params = [param('Länge', 40), param('Breite', 30), param('Dicke', 4)];
        const g = grp('Winkel', [
          it('box', { w: 'Länge', d: 'Breite', h: 'Dicke' }, { name: 'Boden', color: '#e8833a', t: { y: 'Breite/2' } }),
          it('box', { w: 'Länge', d: 'Dicke', h: 'Breite' }, { name: 'Wand', color: '#e8833a', t: { y: 'Dicke/2' } }),
          it('wedge', { w: 'Breite - Dicke', d: 'Dicke', h: 'Breite - Dicke' }, { name: 'Versteifung', color: '#e8833a', t: { y: 'Breite/2 + Dicke/2', z: 'Dicke', rz: 90 } }),
          part('screwHole', { size: 'M4', head: 'countersunk', length: 10 }, { t: { x: -12, y: 'Breite/2 + 4', z: 'Dicke' } }),
          part('screwHole', { size: 'M4', head: 'countersunk', length: 10 }, { t: { x: 12, y: 'Breite/2 + 4', z: 'Dicke' } }),
          part('screwHole', { size: 'M4', head: 'countersunk', length: 10 }, { t: { x: -12, y: 'Dicke', z: 'Breite/2 + 4', rx: -90 } }),
          part('screwHole', { size: 'M4', head: 'countersunk', length: 10 }, { t: { x: 12, y: 'Dicke', z: 'Breite/2 + 4', rx: -90 } }),
        ], { color: '#e8833a' });
        d.items = [g];
        return d;
      },
      svg: '<path d="M14 38 56 24l34 11-42 14z" class="a1"/><path d="M14 38V10l42-14v28z" class="a2"/><ellipse cx="44" cy="37" rx="4" ry="2" class="hole"/><ellipse cx="66" cy="31" rx="4" ry="2" class="hole"/><ellipse cx="30" cy="16" rx="2.4" ry="4" class="hole"/><ellipse cx="46" cy="11" rx="2.4" ry="4" class="hole"/>',
    },
    {
      id: 'gear', name: 'Zahnradpaar', desc: 'Zwei passende Zahnräder mit Bohrung.',
      build() {
        const d = Model.newDoc('Zahnräder');
        d.params = [param('Modul', 1.5)];
        const g1 = part('gear', { teeth: 24, module: 'Modul', h: 6, bore: 5 }, { color: '#5b9f55' });
        const g2 = part('gear', { teeth: 12, module: 'Modul', h: 6, bore: 5 }, { color: '#e2b53a', t: { x: '(24+12)/2*Modul + 2*Modul + 4' } });
        d.items = [g1, g2];
        return d;
      },
      svg: '<circle cx="42" cy="28" r="20" class="a2"/><circle cx="42" cy="28" r="4" class="hole"/><circle cx="78" cy="28" r="11" class="b2"/><circle cx="78" cy="28" r="3" class="hole"/>',
    },
    {
      id: 'hinge', name: 'Scharnier', desc: 'Aus einem Stück, mit Spiel zwischen den Teilen.',
      build() {
        const d = Model.newDoc('Scharnier');
        d.items = [part('hinge', { len: 40, w: 15, t: 2.4, gap: 0.4 }, { color: '#3f7fd6' })];
        return d;
      },
      svg: '<path d="M12 30 44 18l20 8-32 12z" class="a1"/><path d="M60 26 92 14l12 5-32 12z" class="b1"/><path d="M40 22l24 8" class="line"/>',
    },
  ];
  return { LIST };
})();

const Start = (() => {
  let el = null;
  function tplThumb(t) {
    return `<svg viewBox="0 0 110 56" aria-hidden="true"><style>.a1{fill:var(--accent);fill-opacity:.3;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.a2{fill:var(--accent);fill-opacity:.55;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.a3{fill:var(--accent);fill-opacity:.8;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b1{fill:#e8833a;fill-opacity:.35;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b2{fill:#e8833a;fill-opacity:.6;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b3{fill:#e8833a;fill-opacity:.85;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.hole{fill:var(--surface);stroke:var(--ink);stroke-opacity:.6;stroke-width:1}.line{stroke:var(--ink);stroke-opacity:.6;stroke-width:1.4}</style>${t.svg}</svg>`;
  }
  function show() {
    hide();
    // erst speichern, damit „Weiterarbeiten“ den aktuellen Stand und Namen zeigt
    try { App.autosave.flush(); } catch (_) {}
    el = h('div', { class: 'start', role: 'dialog', 'aria-label': 'Startseite' });
    const inner = h('div', { class: 'start-inner' });
    const head = h('div', { class: 'start-head' });
    const brand = h('div', { class: 'start-brand' });
    brand.innerHTML = $('#brand svg').outerHTML;
    brand.append(h('div', null, h('h1', null, 'Tracery'), h('p', null, 'Präzises CAD für Speed-Drohnen und technische Teile')));
    const acts = h('div', { class: 'btn-row' });
    const nb = h('button', { type: 'button', class: 'btn primary' }); nb.innerHTML = icon('newfile') + 'Neues Projekt'; nb.onclick = () => newProject();
    const ob = h('button', { type: 'button', class: 'btn' }); ob.innerHTML = icon('folder') + 'Datei öffnen'; ob.onclick = () => openFile();
    const tb = h('button', { type: 'button', class: 'btn' }); tb.innerHTML = icon('play') + 'Einführung (3 Minuten)'; tb.onclick = () => { newProject(true); Tour.start(); };
    const ts = h('button', { type: 'button', class: 'btn' }); ts.innerHTML = icon('sketch') + 'Erste Skizze (5 Minuten)'; ts.onclick = () => { newProject(true); Tour.start('sketch'); };
    acts.append(nb, ob, tb, ts);
    head.append(brand, acts);
    inner.append(head);
    const recent = App.recentProjects().filter((r) => r.n > 0 || r.id === App.doc.id);
    if (recent.length) {
      const sec = h('section', null, h('h2', null, 'Weiterarbeiten'));
      const list = h('div', { class: 'recent' });
      for (const r of recent.slice(0, 8)) {
        const row = h('div', { class: 'recent-row', role: 'button', tabindex: '0' });
        row.innerHTML = icon('box3');
        row.querySelector('svg').style.cssText = 'width:26px;height:26px;color:var(--accent);flex:none';
        row.append(h('div', { class: 'grow' }, h('b', null, r.name), h('span', null, `${r.n} Objekt${r.n === 1 ? '' : 'e'} · ${new Date(r.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`)));
        const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Aus dem Browser löschen', 'data-tip': 'Aus diesem Browser löschen' }); del.innerHTML = icon('trash');
        del.onclick = async (e) => { e.stopPropagation(); if (await UI.confirm('Projekt löschen?', `„${r.name}“ wird aus diesem Browser gelöscht. Gespeicherte Dateien bleiben erhalten.`, 'Löschen', true)) { App.deleteStored(r.id); show(); } };
        row.append(del);
        const openIt = () => { if (r.id === App.doc.id) { hide(); return; } const d = App.loadStored(r.id); if (d) { App.setDoc(d); hide(); } else UI.toast('Das Projekt ist nicht mehr da.', { kind: 'bad' }); };
        row.onclick = openIt; row.onkeydown = (e) => { if (e.key === 'Enter') openIt(); };
        list.append(row);
      }
      sec.append(list); inner.append(sec);
    }
    const tsec = h('section', null, h('h2', null, 'Vorlagen'));
    const cards = h('div', { class: 'cards' });
    const empty = h('button', { type: 'button', class: 'card new' });
    const th0 = h('div', { class: 'thumb' }); th0.innerHTML = icon('plus'); empty.append(th0, h('b', null, 'Leeres Projekt'), h('span', null, 'Von null anfangen.'));
    empty.onclick = () => newProject();
    cards.append(empty);
    for (const t of Templates.LIST) {
      const c = h('button', { type: 'button', class: 'card' });
      const th = h('div', { class: 'thumb' }); th.innerHTML = tplThumb(t);
      c.append(th, h('b', null, t.name), h('span', null, t.desc));
      c.onclick = () => { App.setDoc(t.build()); hide(); UI.toast('Vorlage geladen. Klick einen Teil an, um ihn zu ändern.', { icon: 'check' }); };
      cards.append(c);
    }
    tsec.append(cards); inner.append(tsec);
    inner.append(h('div', { class: 'start-foot', html: 'Projekte werden automatisch in diesem Browser gesichert. Zum sicheren Aufbewahren und Teilen: <b>Projekt als Datei speichern</b>.<br>Tracery rechnet mit OpenCascade (LGPL-2.1) über replicad (MIT) und zeigt 3D mit three.js (MIT).' }));
    el.append(inner);
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen', style: { position: 'fixed', top: '12px', right: '12px' } }); close.innerHTML = icon('close'); close.onclick = hide;
    if (App.doc.items.length) el.append(close);
    document.body.append(el);
    const onKey = (e) => { if (e.key === 'Escape' && el && App.doc.items.length) hide(); };
    document.addEventListener('keydown', onKey, { once: true });
  }
  function hide() { if (el) { el.remove(); el = null; } }
  function newProject(silent) {
    App.setDoc(Model.newDoc('Neues Projekt'));
    hide();
    if (!silent) UI.toast('Neues Projekt. Fang mit einem Körper an – oder beschreib unten, was du bauen willst.', { icon: 'newfile', ms: 4500 });
  }
  async function openBlob(f) {
    try {
      const txt = await f.text(); const doc = JSON.parse(txt);
      Model.migrate(doc);
      const vers = Array.isArray(doc.versions) ? doc.versions : null; delete doc.versions;
      if (App.loadStored(doc.id) && doc.id !== App.doc.id) doc.id = uid('p');
      if (vers) Versions.importList(doc.id, vers);
      App.setDoc(doc); hide();
      App.fileSavedRev = App.revision;
      UI.toast(`„${doc.name}“ geöffnet.`, { icon: 'folder' });
    } catch (e) { const E = ERRORS.importFailed; UI.toast(`${E.titel}. ${E.erklaerung} ${E.loesung}`, { kind: 'bad', ms: 7000 }); console.warn(e); }
  }
  function openFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) openBlob(f); };
    document.body.append(inp); inp.click();
  }
  // Projektdatei einfach ins Fenster ziehen
  addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/\.json$/i.test(f.name)) return;
    e.preventDefault(); openBlob(f);
  });
  async function saveFile() {
    const name = Print.safeName(App.doc.name);
    const vers = Versions.exportList();
    const ok = await Print.save(name + '.tracery.json', JSON.stringify(vers.length ? { ...App.doc, versions: vers } : App.doc, null, 1));
    if (ok) App.fileSavedRev = App.revision;
  }
  return { show, hide, newProject, openFile, openBlob, saveFile, get open() { return !!el; } };
})();

// ---------- Einführung ----------
const Tour = (() => {
  let box = null, ring = null, idx = 0, off = [];
  const BASICS = [
    { title: 'Willkommen bei Tracery', text: 'In drei Minuten baust du ein Teil mit Loch und exportierst es. Links siehst du den Verlauf, rechts die Einstellungen, in der Mitte dein Modell.', target: null },
    { title: 'Leg einen Quader hin', text: 'Klick oben auf „Körper“ und dann auf „Quader“. Du kannst ihn auch direkt auf die Fläche ziehen.', target: '#t-body', until: () => App.doc.items.some((x) => x.kind === 'box') },
    { title: 'Mach ihn größer', text: 'Zieh an einem weißen Anfasser – oder klick auf eine der Zahlen am Quader und tipp zum Beispiel 40 ein.', target: '#viewport', until: (ev) => ev === 'size' },
    { title: 'Ein Loch einbauen', text: 'Klick wieder auf „Körper“ und unten auf „Zylinder als Loch“ – schon geht ein Loch durch den Quader. Jeder Körper kann übrigens mit einem Klick rechts auf „Loch“ zum Loch werden.', target: '#t-body', until: () => App.doc.items.some((x) => x.role === 'hole') || App.doc.items.some((x) => x.kind === 'group') },
    { title: 'Prüfen und speichern', text: 'Unten rechts siehst du Größe und Status des Modells. Mit „Exportieren“ bekommst du STEP, STL oder 3MF. Viel Spaß beim Bauen!', target: '#t-export', last: true },
  ];
  // „Deine erste Skizze“ – Texte: Entwurf Gemini, an die Bedienung angepasst
  const sk = () => Sketch.state;
  const SKETCH = [
    { title: 'Skizze starten', text: 'Jedes 3D-Teil beginnt als flache Zeichnung, wie auf einem Blatt Papier. Klick oben auf „Skizze“, um loszulegen.', target: '#t-sketch', until: () => Sketch.active || !!$('.pop') },
    { title: 'Zeichenblatt wählen', text: 'Klick auf „Auf der Arbeitsfläche“. Die Ansicht dreht sich dann von oben auf dein Zeichenblatt.', target: '.pop', until: () => Sketch.active },
    { title: 'Ein Rechteck zeichnen', text: 'Das Rechteck-Werkzeug ist schon an. Klick für die erste Ecke, tipp 40, dann Tab, dann 20 und Enter – fertig ist ein Rechteck von 40 mal 20 Millimetern.', target: '.sketchbar [data-tool="rect"]', until: () => sk() && sk().ents.some((e) => e.type === 'rect') },
    { title: 'Kreis für das Loch', text: 'Nimm den Kreis, klick mitten in dein Rechteck und tipp 6 und Enter. Der Kreis ist dann genau 6 Millimeter breit.', target: '.sketchbar [data-tool="circle"]', until: () => sk() && sk().ents.some((e) => e.type === 'circle') },
    { title: 'Dem Maß einen Namen geben', text: 'Klick auf das Schildchen mit der 40 an der langen Seite, tipp das Wort breite ein und drück Enter. Tracery merkt sich die Zahl jetzt unter diesem Namen.', target: '.skdim', until: () => sk() && sk().dims.some((d) => typeof d.v === 'string' && /breite/i.test(d.v)) },
    { title: 'Zeichnung fertig', text: 'Super, deine flache Zeichnung ist komplett! Klick auf „Fertig“, um daraus ein echtes 3D-Teil zu machen.', target: '.sketchbar .tool.primary', until: () => !sk() || !!sk().step },
    { title: 'In 3D hochziehen', text: 'Zieh den Pfeil nach oben oder tipp im Feld „Höhe“ eine 3 ein. Dann „Fertig“ – der Kreis bleibt von selbst als Loch frei!', target: '.stepbox', until: () => !Sketch.active && App.doc.items.some((x) => x.kind === 'extrude') },
    { title: 'Zaubertrick mit „Maße“', text: 'Öffne links den Reiter „Maße“ und ändere die Zahl neben breite auf 60. Schau genau hin: Dein Teil wächst sofort mit!', target: '#lt-params', last: true },
  ];
  const TOURS = { basics: BASICS, sketch: SKETCH };
  let STEPS = BASICS;
  let timer = null;
  function start(name = 'basics') { stop(); STEPS = TOURS[name] || BASICS; idx = 0; show(); off.push(App.on('history', check), App.on('doc', check)); timer = setInterval(() => { place(); check(); }, 350); }
  function stop() { if (box) box.remove(); if (ring) ring.remove(); box = ring = null; off.forEach((f) => f()); off = []; clearInterval(timer); timer = null; }
  function check() {
    const s = STEPS[idx]; if (!s || !s.until) return;
    const last = App.undoStack[App.undoStack.length - 1];
    const ev = last && /Größe|Maß/.test(last.label) ? 'size' : null;
    if (s.done) return;
    if (s.until(ev)) { s.done = true; setTimeout(() => { s.done = false; if (STEPS[idx] === s) { idx++; show(); } }, 500); }
  }
  function show() {
    if (box) box.remove(); if (ring) ring.remove(); box = ring = null;
    const s = STEPS[idx]; if (!s) { stop(); return; }
    box = h('div', { class: 'tour', role: 'dialog', 'aria-label': 'Einführung' });
    box.append(h('div', { class: 'step' }, `Schritt ${idx + 1} von ${STEPS.length}`), h('h3', null, s.title), h('p', null, s.text));
    const row = h('div', { class: 'btn-row', style: { justifyContent: 'space-between' } });
    const skip = h('button', { type: 'button', class: 'btn ghost small' }, s.last ? 'Schließen' : 'Einführung beenden'); skip.onclick = stop;
    const next = h('button', { type: 'button', class: 'btn primary small' }, s.last ? 'Los geht’s' : 'Weiter'); next.onclick = () => { idx++; show(); };
    row.append(skip, next); box.append(row);
    document.body.append(box);
    if (s.target && $(s.target)) { ring = h('div', { class: 'tour-ring' }); document.body.append(ring); }
    place();
  }
  // Lage von Hinweis und Ring – läuft regelmäßig, damit der Hinweis offenen Menüs ausweicht
  function place() {
    if (!box) return;
    const s = STEPS[idx]; const t = s && s.target && $(s.target);
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x, y;
    if (t && ring) {
      const r = t.getBoundingClientRect();
      const big = r.width > 400;
      Object.assign(ring.style, big ? { left: r.left + 12 + 'px', top: r.top + 12 + 'px', width: r.width - 24 + 'px', height: r.height - 24 + 'px' } : { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      x = big ? r.left + 24 : r.left; y = big ? r.bottom - bh - 24 : r.bottom + 14;
    } else { x = (innerWidth - bw) / 2; y = innerHeight * 0.3; }
    const fit = (v, max) => clamp(v, 12, max - 12);
    x = fit(x, innerWidth - bw); y = fit(y, innerHeight - bh);
    const obst = $$('.flyout, .menu, .pop, .modal').map((e) => e.getBoundingClientRect());
    const hits = (px, py) => obst.some((q) => px < q.right + 8 && px + bw > q.left - 8 && py < q.bottom + 8 && py + bh > q.top - 8);
    if (hits(x, y)) {
      const c = $('#center').getBoundingClientRect();
      const cands = [[c.right - bw - 16, c.bottom - bh - 16], [c.left + 16, c.bottom - bh - 16], [c.right - bw - 16, c.top + 16]];
      for (const [cx, cy] of cands) { const X = fit(cx, innerWidth - bw), Y = fit(cy, innerHeight - bh); if (!hits(X, Y)) { x = X; y = Y; break; } }
    }
    box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
  }
  return { start, stop };
})();

