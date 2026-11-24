// ================= Startseite, Vorlagen, Dateien, Einführung =================
const Templates = (() => {
  const T0 = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const it = (kind, p, o = {}) => { const x = Model.newItem(kind, p, { name: o.name, role: o.role, color: o.color }); Object.assign(x.t, o.t || {}); if (o.fin) x.finishes = o.fin.map((f) => ({ id: uid('f'), ...f })); return x; };
  const grp = (name, children, o = {}) => { const g = Model.newItem('group', {}, { name, color: o.color || (children.find((c) => c.role !== 'hole') || children[0]).color }); g.children = children; Object.assign(g.t, o.t || {}); if (o.fin) g.finishes = o.fin.map((f) => ({ id: uid('f'), ...f })); return g; };
  const part = (lib, p, o = {}) => { const d = LIBMAP[lib]; const x = Model.newItem('part', { lib, ...libDefaults(d), ...p }, { name: o.name || d.label, role: d.role, color: o.color }); Object.assign(x.t, o.t || {}); return x; };
  const param = (name, expr) => ({ id: uid('m'), name, expr });
  const LIST = [
    {
      id: 'box', get name() { return T('start.tpl.box.name'); }, get desc() { return T('start.tpl.box.desc'); },
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
      id: 'sign', get name() { return T('start.tpl.sign.name'); }, get desc() { return T('start.tpl.sign.desc'); },
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
      id: 'phone', get name() { return T('start.tpl.phone.name'); }, get desc() { return T('start.tpl.phone.desc'); },
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
      id: 'bracket', get name() { return T('start.tpl.bracket.name'); }, get desc() { return T('start.tpl.bracket.desc'); },
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
      id: 'gear', get name() { return T('start.tpl.gear.name'); }, get desc() { return T('start.tpl.gear.desc'); },
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
      id: 'hinge', get name() { return T('start.tpl.hinge.name'); }, get desc() { return T('start.tpl.hinge.desc'); },
      build() {
        const d = Model.newDoc('Scharnier');
        d.items = [part('hinge', { len: 40, w: 15, t: 2.4, gap: 0.4 }, { color: '#3f7fd6' })];
        return d;
      },
      svg: '<path d="M12 30 44 18l20 8-32 12z" class="a1"/><path d="M60 26 92 14l12 5-32 12z" class="b1"/><path d="M40 22l24 8" class="line"/>',
    },
  ];

  // Vorlagen für „Neues Projekt“ (BE-18)
  const PROJECT_LIST = [
    {
      id: 'empty-mm',
      get name() { return T('start.projTpl.emptyMm.name'); },
      get desc() { return T('start.projTpl.emptyMm.desc'); },
      get badge() { return 'mm'; },
      build() {
        const d = Model.newDoc('Neues Projekt');
        d.settings.unit = 'mm';
        d.settings.printBed = { enabled: false, x: 220, y: 220, z: 250, nozzle: 0.4 };
        return d;
      },
      svg: '<rect x="18" y="10" width="74" height="36" rx="4" class="a1"/><path d="M26 38h58M32 33v5M44 35v3M56 33v5M68 35v3M80 33v5" class="line"/>',
    },
    {
      id: 'empty-in',
      get name() { return T('start.projTpl.emptyIn.name'); },
      get desc() { return T('start.projTpl.emptyIn.desc'); },
      get badge() { return T('unit.inBadge'); },
      build() {
        const d = Model.newDoc('Neues Projekt');
        d.settings.unit = 'in';
        d.settings.printBed = { enabled: false, x: 220, y: 220, z: 250, nozzle: 0.4 };
        return d;
      },
      svg: '<rect x="18" y="10" width="74" height="36" rx="4" class="b1"/><path d="M26 38h58M32 32v6M46 35v3M60 32v6M74 35v3" class="line"/>',
    },
    {
      id: 'print3d',
      get name() { return T('start.projTpl.print3d.name'); },
      get desc() { return T('start.projTpl.print3d.desc'); },
      get badge() { return '220×220 · 0,4 mm'; },
      build() {
        const d = Model.newDoc('3D-Druck');
        d.settings.unit = 'mm';
        d.settings.material = 'PLA';
        d.settings.custom = { x: 220, y: 220, z: 250 };
        d.settings.printBed = { enabled: true, x: 220, y: 220, z: 250, nozzle: 0.4 };
        d.params = [param('Duese', 0.4), param('Wand', 1.6), param('Spiel', 0.2)];
        return d;
      },
      svg: '<path d="M16 40 55 28l39 12-39 12z" class="a1"/><path d="M28 40 55 31l27 9-27 9z" class="a2"/><path d="M55 8v16M49 24h12l-6 7z" class="b3"/>',
    },
    {
      id: 'laser',
      get name() { return T('start.projTpl.laser.name'); },
      get desc() { return T('start.projTpl.laser.desc'); },
      get badge() { return '3 mm · Holz'; },
      build() {
        const d = Model.newDoc('Laserplatte');
        d.settings.unit = 'mm';
        d.settings.material = 'Pappel-Sperrholz';
        d.params = [param('Breite', 120), param('Tiefe', 80), param('Dicke', 3), param('Schnittspalt', 0.15)];
        d.items = [it('box', { w: 'Breite', d: 'Tiefe', h: 'Dicke' }, { name: 'Platte', color: '#e6d2b5' })];
        return d;
      },
      svg: '<path d="M12 31 66 13l32 12-54 18z" class="b1"/><path d="M12 31v6l32 12v-6z" class="b2"/><path d="M98 25v6L44 49v-6z" class="b3"/><path d="M55 4v18" class="line"/>',
    },
    {
      id: 'enclosure',
      get name() { return T('start.projTpl.enclosure.name'); },
      get desc() { return T('start.projTpl.enclosure.desc'); },
      get badge() { return '80×50×30 mm'; },
      build() {
        const d = Model.newDoc('Gehäuse');
        d.settings.unit = 'mm';
        d.settings.material = 'PLA';
        d.params = [param('Breite', 80), param('Tiefe', 50), param('Höhe', 30), param('Wand', 2), param('Spiel', 0.2)];
        const box = grp('Gehäuse', [
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
  ];

  const CUSTOM_KEY = 'tracery-vorlagen';
  function customList() {
    try {
      const raw = storageGet(CUSTOM_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((x) => x && typeof x === 'object' && x.id && x.name && x.doc && x.doc.format === 'masswerk');
    } catch (_) {
      return [];
    }
  }
  function writeCustom(arr) {
    return storageSet(CUSTOM_KEY, JSON.stringify(arr));
  }
  function saveCustom(name, desc, doc) {
    const cleanName = String(name || '').trim();
    if (!cleanName || !doc) return null;
    const snap = deepClone(doc);
    delete snap.id;
    snap.name = cleanName;
    const entry = {
      id: uid('tpl'),
      name: cleanName,
      desc: String(desc || '').trim(),
      created: Date.now(),
      doc: snap,
    };
    const rest = customList().filter((x) => String(x.name || '').trim().toLowerCase() !== cleanName.toLowerCase());
    rest.unshift(entry);
    if (!writeCustom(rest)) return null;
    return entry;
  }
  function deleteCustom(id) {
    const next = customList().filter((x) => x.id !== id);
    writeCustom(next);
    return next;
  }
  function getCustom(id) {
    return customList().find((x) => x.id === id) || null;
  }
  function buildProject(id) {
    const bi = PROJECT_LIST.find((t) => t.id === id);
    if (bi) return bi.build();
    const cu = getCustom(id);
    if (!cu || !cu.doc) return null;
    const d = deepClone(cu.doc);
    d.id = uid('p');
    d.name = cu.name || d.name || 'Neues Projekt';
    d.created = Date.now();
    d.modified = Date.now();
    return Model.migrate(d);
  }
  return { LIST, PROJECT_LIST, CUSTOM_KEY, customList, saveCustom, deleteCustom, getCustom, buildProject };
})();

const Start = (() => {
  let el = null;
  let recBaseDoc = null, recPending = null, recBarEl = null, recTimer = null, recTracking = false, recBusy = false;
  function tplThumb(t) {
    return `<svg viewBox="0 0 110 56" aria-hidden="true"><style>.a1{fill:var(--accent);fill-opacity:.3;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.a2{fill:var(--accent);fill-opacity:.55;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.a3{fill:var(--accent);fill-opacity:.8;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b1{fill:#e8833a;fill-opacity:.35;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b2{fill:#e8833a;fill-opacity:.6;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.b3{fill:#e8833a;fill-opacity:.85;stroke:var(--ink);stroke-opacity:.5;stroke-width:1}.hole{fill:var(--surface);stroke:var(--ink);stroke-opacity:.6;stroke-width:1}.line{stroke:var(--ink);stroke-opacity:.6;stroke-width:1.4}</style>${t.svg}</svg>`;
  }
  function isEmptyDoc(doc) {
    if (!doc) return true;
    return Model.countItems(doc) === 0
      && !(doc.params && doc.params.length)
      && !(doc.tables && doc.tables.length)
      && !(doc.notes && doc.notes.length);
  }
  function formatRecoveryTime(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (_) { return ''; }
  }
  function hideRecoveryBanner() {
    if (recBarEl) { recBarEl.remove(); recBarEl = null; }
  }
  function renderRecoveryBanner() {
    hideRecoveryBanner();
    if (!recPending) return;
    const name = recPending.name || 'Neues Projekt';
    const time = formatRecoveryTime(recPending.savedAt);
    const n = recPending.itemCount || 0;
    const metaKey = n === 1 ? 'recovery.metaOne' : 'recovery.metaMany';
    const bar = h('div', {
      id: 'recovery-bar',
      class: 'recovery-bar',
      role: 'alert',
      'aria-live': 'polite',
      'data-project-name': name,
      'data-saved-at': String(recPending.savedAt || ''),
    });
    const ic = h('div', { class: 'rb-ic' });
    ic.innerHTML = icon('warn');
    const txt = h('div', { class: 'rb-txt' },
      h('b', null, T('recovery.title')),
      h('span', null, T(metaKey, { name, time, n })),
    );
    const restoreBtn = h('button', {
      type: 'button',
      id: 'recovery-restore',
      class: 'btn primary small',
      'data-help': 'crashRecovery',
      onclick: () => restoreRecovery(),
    }, T('recovery.restore'));
    const dismissBtn = h('button', {
      type: 'button',
      id: 'recovery-dismiss',
      class: 'btn ghost small',
      onclick: () => dismissRecovery(),
    }, T('recovery.dismiss'));
    const acts = h('div', { class: 'rb-acts' }, restoreBtn, dismissBtn);
    bar.append(ic, txt, acts);
    const startInner = el && el.querySelector('.start-inner');
    if (startInner) {
      const head = startInner.querySelector('.start-head');
      if (head && head.nextSibling) startInner.insertBefore(bar, head.nextSibling);
      else startInner.prepend(bar);
    } else {
      const host = $('#overlay') || $('#center') || document.body;
      host.append(bar);
    }
    recBarEl = bar;
  }
  function scheduleRecoverySave() {
    clearTimeout(recTimer);
    recTimer = null;
    if (!recTracking || !App.doc) return;
    if (isEmptyDoc(App.doc) && !recBaseDoc) {
      Store.clearRecovery();
      return;
    }
    const itemCount = Model.countItems(App.doc);
    try {
      storageSet('tracery.recovery.flag', JSON.stringify({
        active: true,
        docId: App.doc.id,
        name: App.doc.name || 'Neues Projekt',
        savedAt: Date.now(),
        itemCount,
      }));
    } catch (_) {}
    recTimer = setTimeout(() => {
      recTimer = null;
      if (!recTracking || !App.doc) return;
      Store.saveRecovery(App.doc, { baseDoc: recBaseDoc, itemCount: Model.countItems(App.doc) });
    }, 200);
  }
  function flushRecovery() {
    clearTimeout(recTimer);
    recTimer = null;
    if (!recTracking || recPending || !App.dirty || !App.doc) return Promise.resolve(false);
    if (isEmptyDoc(App.doc) && !recBaseDoc) return Store.clearRecovery();
    return Store.saveRecovery(App.doc, { baseDoc: recBaseDoc, itemCount: Model.countItems(App.doc) });
  }
  async function checkRecoveryOnBoot() {
    const rec = await Store.loadRecovery();
    if (rec && rec.doc && rec.doc.format === 'masswerk') {
      recPending = rec;
      return rec;
    }
    if (Store.getRecoveryFlag && Store.getRecoveryFlag()) await Store.clearRecovery();
    return null;
  }
  function startRecoveryTracking(baseDoc) {
    recBaseDoc = isEmptyDoc(baseDoc) ? null : deepClone(baseDoc);
    recTracking = true;
    if (recPending) renderRecoveryBanner();
  }
  async function restoreRecovery() {
    if (!recPending || recBusy) return false;
    recBusy = true;
    const btn = $('#recovery-restore');
    if (btn) btn.disabled = true;
    const rec = recPending;
    try {
      await Store.hydrateDoc(rec.doc);
      recPending = null;
      hideRecoveryBanner();
      hide();
      App.setDoc(rec.doc, { fit: true, fromRecovery: true });
      recBaseDoc = isEmptyDoc(App.doc) ? null : deepClone(App.doc);
      await Store.clearRecovery();
      await App.autosave.flush();
      await App.rebuild();
      Viewer.fit(null, false);
      UI.toast(T('recovery.restored', { name: rec.name || App.doc.name || 'Projekt' }), { icon: 'check', ms: 4500 });
      return true;
    } catch (e) {
      console.warn(e);
      UI.toast(T('recovery.failed'), { kind: 'bad', ms: 5000 });
      renderRecoveryBanner();
      return false;
    } finally {
      recBusy = false;
    }
  }
  async function dismissRecovery() {
    if (!recPending || recBusy) return false;
    recBusy = true;
    const rec = recPending;
    try {
      recPending = null;
      hideRecoveryBanner();
      await Store.clearRecovery();
      if (rec.baseDoc) {
        await Store.saveProject(rec.baseDoc, Model.countItems(rec.baseDoc));
      } else if (rec.docId) {
        await Store.deleteProject(rec.docId, App.doc && App.doc.id !== rec.docId ? App.doc : null);
      }
      UI.toast(T('recovery.discarded'), { icon: 'info', ms: 3500 });
      return true;
    } finally {
      recBusy = false;
    }
  }
  function show() {
    hide();
    // erst speichern, damit „Weiterarbeiten“ den aktuellen Stand und Namen zeigt
    if (!recPending) { try { App.autosave.flush(); } catch (_) {} }
    el = h('div', { class: 'start', role: 'dialog', 'aria-label': T('start.aria') });
    const inner = h('div', { class: 'start-inner' });
    const head = h('div', { class: 'start-head' });
    const brand = h('div', { class: 'start-brand' });
    brand.innerHTML = $('#brand svg').outerHTML;
    brand.append(h('div', null, h('h1', null, 'Tracery'), h('p', null, T('start.subtitle'))));
    const acts = h('div', { class: 'btn-row' });
    const nb = h('button', { type: 'button', id: 'start-new-btn', class: 'btn primary', 'data-help': 'projectTemplates' }); nb.innerHTML = icon('newfile') + esc(T('start.newProject')); nb.onclick = () => newProjectDialog();
    const ob = h('button', { type: 'button', class: 'btn' }); ob.innerHTML = icon('folder') + esc(T('start.openFile')); ob.onclick = () => openFile();
    const tb = h('button', { type: 'button', class: 'btn' }); tb.innerHTML = icon('play') + esc(T('start.tourBasics')); tb.onclick = () => { newProject(true); Tour.start(); };
    const ts = h('button', { type: 'button', class: 'btn' }); ts.innerHTML = icon('sketch') + esc(T('start.tourSketch')); ts.onclick = () => { newProject(true); Tour.start('sketch'); };
    acts.append(nb, ob, tb, ts);
    // Oberfläche wählen: beim allerersten Start als zwei Karten, sonst kompakt im Kopf
    if (ViewPrefs.firstStart) {
      head.append(brand, acts);
      inner.append(head);
      inner.append(h('section', { class: 'level-welcome', id: 'level-welcome', 'data-help': 'levelSwitch' },
        h('div', { class: 'level-welcome-head' },
          h('h2', null, T('start.welcomeTitle')),
          h('span', null, T('start.welcomeSub')),
        ),
        ViewPrefs.levelCards({ idPrefix: 'start', active: null }),
      ));
    } else {
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': T('start.surfaceAria') });
      const lv = (id, l, label) => { const b = h('button', { type: 'button', id, 'aria-pressed': (ViewPrefs.get().level === l) ? 'true' : 'false' }, label); b.onclick = () => { ViewPrefs.setLevel(l); for (const x of seg.children) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }; return b; };
      seg.append(lv('start-simple', 'simple', T('start.simpleOption')), lv('start-pro', 'pro', T('start.proOption')));
      const lvRow = h('div', { class: 'start-level', 'data-help': 'levelSwitch' }, h('span', null, T('start.surfaceLabel')), seg);
      head.append(brand, acts, lvRow);
      inner.append(head);
    }
    const recent = App.recentProjects().filter((r) => r.n > 0 || r.id === App.doc.id);
    if (recent.length) {
      const sec = h('section', null, h('h2', null, T('start.recentHeading')));
      const list = h('div', { class: 'recent' });
      for (const r of recent.slice(0, 8)) {
        const row = h('div', { class: 'recent-row', role: 'button', tabindex: '0' });
        row.innerHTML = icon('box3');
        row.querySelector('svg').style.cssText = 'width:26px;height:26px;color:var(--accent);flex:none';
        const dstr = new Date(r.modified).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
        row.append(h('div', { class: 'grow' }, h('b', null, r.name), h('span', null, T(r.n === 1 ? 'start.recentMetaOne' : 'start.recentMetaMany', { n: r.n, date: dstr }))));
        const del = h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('start.deleteFromBrowserAria'), 'data-tip': T('start.deleteFromBrowserTip') }); del.innerHTML = icon('trash');
        del.onclick = async (e) => { e.stopPropagation(); if (await UI.confirm(T('start.deleteConfirmTitle'), T('start.deleteConfirmBody', { name: r.name }), T('common.delete'), true)) { await App.deleteStored(r.id); show(); } };
        const newTabBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('tabs.openInNewTab'), 'data-tip': T('tabs.openInNewTab') }); newTabBtn.innerHTML = icon('plus');
        newTabBtn.onclick = (e) => { e.stopPropagation(); openStoredInTab(r.id); };
        row.append(newTabBtn, del);
        const openIt = async () => { if (r.id === App.doc.id) { hide(); return; } const d = await App.loadStored(r.id); if (d) { App.setDoc(d); hide(); } else UI.toast(T('start.projectMissing'), { kind: 'bad' }); };
        row.onclick = openIt; row.onkeydown = (e) => { if (e.key === 'Enter') openIt(); };
        list.append(row);
      }
      sec.append(list); inner.append(sec);
    }
    const customTpls = Templates.customList();
    if (customTpls.length) {
      const csec = h('section', { id: 'start-custom-tpls' }, h('h2', null, T('tpl.customHeading')));
      const ccards = h('div', { class: 'cards' });
      for (const ct of customTpls) ccards.append(customTplCard(ct, { onAfterDelete: () => show() }));
      csec.append(ccards);
      inner.append(csec);
    }
    const tsec = h('section', null, h('h2', null, T('start.templatesHeading')));
    const cards = h('div', { class: 'cards' });
    const empty = h('button', { type: 'button', class: 'card new' });
    const th0 = h('div', { class: 'thumb' }); th0.innerHTML = icon('plus'); empty.append(th0, h('b', null, T('start.emptyTitle')), h('span', null, T('start.emptyDesc')));
    empty.onclick = () => newProject();
    cards.append(empty);
    for (const t of Templates.LIST) {
      const c = h('button', { type: 'button', class: 'card' });
      const th = h('div', { class: 'thumb' }); th.innerHTML = tplThumb(t);
      c.append(th, h('b', null, t.name), h('span', null, t.desc));
      c.onclick = () => { App.setDoc(t.build()); hide(); UI.toast(T('start.templateLoaded'), { icon: 'check' }); };
      cards.append(c);
    }
    tsec.append(cards); inner.append(tsec);
    inner.append(h('div', { class: 'start-foot', html: T('start.footHtml') }));
    el.append(inner);
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('common.close'), style: { position: 'fixed', top: '12px', right: '12px' } }); close.innerHTML = icon('close'); close.onclick = hide;
    if (App.doc.items.length) el.append(close);
    document.body.append(el);
    if (recPending) renderRecoveryBanner();
    const onKey = (e) => { if (e.key === 'Escape' && el && App.doc.items.length) hide(); };
    document.addEventListener('keydown', onKey, { once: true });
  }
  function hide() { if (el) { el.remove(); el = null; if (recPending) renderRecoveryBanner(); } }
  function openDrone(t) {
    App.setDoc(t.build()); hide();
    UI.toast(T('start.droneToast', { name: t.name }), { icon: 'check', ms: 6000 });
  }
  function newProject(silent, opts = {}) {
    App.setDoc(Model.newDoc('Neues Projekt'), opts && opts.newTab ? { newTab: true } : {});
    hide();
    if (!silent) UI.toast(T('start.newProjToast'), { icon: 'newfile', ms: 4500 });
  }
  function openNewTab(doc) {
    App.openTab(doc || Model.newDoc('Neues Projekt'));
    hide();
    UI.toast(T('tabs.newOpened'), { icon: 'newfile', ms: 3500 });
  }
  async function openStoredInTab(id) {
    const open = (App.tabs || []).find((t) => t.docId === id);
    if (open) {
      App.switchTab(open.tabId);
      hide();
      return true;
    }
    const d = await App.loadStored(id);
    if (!d) { UI.toast(T('start.projectMissing'), { kind: 'bad' }); return false; }
    App.openTab(d, { saved: true });
    hide();
    return true;
  }
  function customTplMeta(ct) {
    const d = ct && ct.doc ? ct.doc : {};
    const u = d.settings && d.settings.unit ? d.settings.unit : 'mm';
    const n = Model.countItems(d);
    const bits = [u === 'in' ? T('unit.inShort') : u];
    if (n > 0) bits.push(`${n} ${n === 1 ? T('tpl.metaPartOne') : T('tpl.metaPartMany')}`);
    const pb = d.settings && d.settings.printBed;
    if (pb && pb.enabled) bits.push(T('tpl.metaBed', { x: Math.round(pb.x), y: Math.round(pb.y) }));
    return bits.join(' · ');
  }
  function customTplCard(ct, { onOpen, onAfterDelete, openOpts } = {}) {
    const card = h('div', { class: 'card tpl-card custom', role: 'button', tabindex: '0', dataset: { tplId: ct.id } });
    const del = h('button', {
      type: 'button',
      class: 'icon-btn tpl-del',
      'aria-label': T('tpl.deleteAria', { name: ct.name }),
      'data-tip': T('tpl.deleteTip'),
    });
    del.innerHTML = icon('trash');
    del.onclick = async (e) => {
      e.stopPropagation();
      if (await UI.confirm(T('tpl.deleteTitle'), T('tpl.deleteBody', { name: ct.name }), T('common.delete'), true)) {
        Templates.deleteCustom(ct.id);
        UI.toast(T('tpl.deleted', { name: ct.name }), { icon: 'trash' });
        if (onAfterDelete) onAfterDelete();
      }
    };
    const meta = customTplMeta(ct);
    card.append(
      del,
      h('span', { class: 'tpl-badge' }, meta),
      h('b', null, ct.name),
      h('span', null, ct.desc || T('tpl.customNoDesc')),
    );
    const open = () => { if (onOpen) onOpen(); openTemplate(ct.id, openOpts); };
    card.onclick = open;
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    return card;
  }
  function openTemplate(id, opts = {}) {
    const d = Templates.buildProject(id);
    if (!d) { UI.toast(T('tpl.missing'), { kind: 'bad' }); return false; }
    App.setDoc(d, opts && opts.newTab ? { newTab: true } : {});
    hide();
    if (id === 'print3d') {
      const pb = d.settings && d.settings.printBed;
      UI.toast(T('tpl.loadedPrint3d', { x: pb.x, y: pb.y, z: pb.z, nozzle: fmt(pb.nozzle, 1) }), { icon: 'check', ms: 5000 });
    } else if (id === 'empty-mm' || id === 'empty-in') {
      UI.toast(T('tpl.loadedEmpty', { unit: d.settings.unit === 'in' ? 'Zoll' : 'mm' }), { icon: 'newfile', ms: 4000 });
    } else {
      UI.toast(T('tpl.loadedNamed', { name: d.name }), { icon: 'check', ms: 4500 });
    }
    return true;
  }
  function newProjectDialog(opts = {}) {
    const wrap = h('div', { id: 'new-proj-dialog', class: 'tpl-dialog' });
    const builtSec = h('div', { class: 'tpl-sec' }, h('div', { class: 'section-h' }, T('tpl.builtinHeading')));
    const builtGrid = h('div', { class: 'tpl-grid', id: 'tpl-builtin-grid' });
    let modalRef = null;
    for (const t of Templates.PROJECT_LIST) {
      const c = h('button', { type: 'button', class: 'card tpl-card', dataset: { tplId: t.id } });
      const th = h('div', { class: 'thumb' }); th.innerHTML = tplThumb(t);
      c.append(th, h('span', { class: 'tpl-badge' }, t.badge), h('b', null, t.name), h('span', null, t.desc));
      c.onclick = () => { if (modalRef) modalRef.close(); openTemplate(t.id, opts); };
      builtGrid.append(c);
    }
    builtSec.append(builtGrid);

    const custSec = h('div', { class: 'tpl-sec', id: 'tpl-custom-sec' });
    const custHead = h('div', { class: 'tpl-sec-head' }, h('div', { class: 'section-h' }, T('tpl.customHeading')));
    const saveBtn = h('button', { type: 'button', class: 'btn small', id: 'tpl-save-current', 'data-help': 'saveTemplate' });
    saveBtn.innerHTML = icon('save') + esc(T('tpl.saveCurrent'));
    saveBtn.onclick = () => { if (modalRef) modalRef.close(); saveAsTemplate({ reopen: true }); };
    custHead.append(saveBtn);
    const custGrid = h('div', { class: 'tpl-grid', id: 'tpl-custom-grid' });
    const renderCustom = () => {
      custGrid.innerHTML = '';
      const list = Templates.customList();
      if (!list.length) {
        custGrid.append(h('div', { class: 'hint-box', style: { gridColumn: '1 / -1' } }, T('tpl.customEmpty')));
        return;
      }
      for (const ct of list) {
        custGrid.append(customTplCard(ct, {
          openOpts: opts,
          onOpen: () => { if (modalRef) modalRef.close(); },
          onAfterDelete: () => { renderCustom(); if (el) show(); },
        }));
      }
    };
    renderCustom();
    custSec.append(custHead, custGrid);

    wrap.append(builtSec, custSec);
    modalRef = UI.modal({
      title: T('tpl.newDialogTitle'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.close') }],
    });
    return modalRef;
  }
  function saveAsTemplate(opts = {}) {
    const defName = (App.doc && App.doc.name && App.doc.name !== 'Neues Projekt') ? App.doc.name : T('tpl.myTemplate');
    const nameF = h('div', { class: 'field' },
      h('label', { for: 'tpl-save-name' }, T('tpl.saveNameLabel')),
      h('div', { class: 'inp' }, h('input', { id: 'tpl-save-name', type: 'text', value: defName, autocomplete: 'off' })));
    const descF = h('div', { class: 'field' },
      h('label', { for: 'tpl-save-desc' }, T('tpl.saveDescLabel')),
      h('div', { class: 'inp' }, h('input', { id: 'tpl-save-desc', type: 'text', placeholder: T('tpl.saveDescPh'), autocomplete: 'off' })));
    const pb = App.doc && App.doc.settings && App.doc.settings.printBed;
    const nItems = Model.countItems(App.doc);
    const summaryBits = [
      T('tpl.saveSummaryUnit', { u: Units.key() === 'in' ? T('unit.inShort') : Units.label() }),
      T('tpl.saveSummaryCount', { n: nItems, unit: nItems === 1 ? T('common.object') : T('common.objects') }),
    ];
    if (App.doc && App.doc.settings && App.doc.settings.material) summaryBits.push(T('tpl.saveSummaryMat', { mat: App.doc.settings.material }));
    if (pb && pb.enabled) summaryBits.push(T('tpl.saveSummaryBed', { x: pb.x, y: pb.y, z: pb.z, nozzle: fmt(pb.nozzle, 2) }));
    const body = h('div', { id: 'save-tpl-dialog', style: { display: 'grid', gap: '12px' } },
      nameF, descF, h('div', { class: 'hint-box' }, summaryBits.join(' · ')));

    let modalRef = null;
    const doSave = () => {
      const nInp = nameF.querySelector('input');
      const dInp = descF.querySelector('input');
      const nm = (nInp.value || '').trim();
      if (!nm) {
        UI.toast(T('tpl.saveNameEmpty'), { kind: 'bad' });
        nInp.focus();
        return false;
      }
      const saved = Templates.saveCustom(nm, dInp.value, App.doc);
      if (!saved) {
        UI.toast(T('tpl.saveFailed'), { kind: 'bad' });
        return false;
      }
      UI.toast(T('tpl.saved', { name: saved.name }), { icon: 'check' });
      if (el) show();
      if (opts.reopen) setTimeout(() => newProjectDialog(), 30);
      return true;
    };
    modalRef = UI.modal({
      title: T('tpl.saveDialogTitle'),
      body,
      actions: [
        { label: T('common.cancel'), value: false },
        { label: T('common.save'), id: 'tpl-save-ok', primary: true, value: true, run: () => doSave() },
      ],
    });
    const nInp = nameF.querySelector('input');
    const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (doSave() !== false) modalRef.close(true); } };
    nInp.addEventListener('keydown', onEnter);
    descF.querySelector('input').addEventListener('keydown', onEnter);
    setTimeout(() => { nInp.focus(); nInp.select(); }, 40);
    return modalRef;
  }
  // ---------- STEP lesen: Produkt-Namen, Baugruppen-Struktur, Placements und Farben (Part 21) ----------
  function parseSTEP(buf) {
    const bytes = buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
    const txt = new TextDecoder('utf-8').decode(bytes);
    const dataM = /\bDATA\s*;/i.exec(txt);
    if (!dataM) return { roots: [], partCount: 0, groupCount: 0 };

    const decodeStepStr = (s) => {
      if (!s) return '';
      let out = s.replace(/''/g, "'");
      out = out.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
        let r = '';
        for (let i = 0; i + 3 < hex.length; i += 4) r += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
        return r;
      });
      out = out.replace(/\\X4\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
        let r = '';
        for (let i = 0; i + 7 < hex.length; i += 8) r += String.fromCodePoint(parseInt(hex.slice(i, i + 8), 16));
        return r;
      });
      out = out.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      out = out.replace(/\\S\\(.)/g, (_, ch) => String.fromCharCode(ch.charCodeAt(0) + 128));
      out = out.replace(/\\\\/g, '\\');
      return out;
    };

    const splitArgs = (str) => {
      const args = [];
      let i = 0;
      const n = str.length;
      const skipWs = () => { while (i < n && (str[i] === ' ' || str[i] === '\t' || str[i] === '\r' || str[i] === '\n')) i++; };
      while (i < n) {
        skipWs();
        if (i >= n) break;
        const ch = str[i];
        if (ch === ',') { i++; continue; }
        if (ch === "'") {
          i++;
          let s = '';
          while (i < n) {
            if (str[i] === "'") {
              if (str[i + 1] === "'") { s += "''"; i += 2; continue; }
              i++; break;
            }
            s += str[i++];
          }
          args.push({ str: decodeStepStr(s) });
        } else if (ch === '(') {
          let depth = 1, start = ++i;
          while (i < n && depth > 0) {
            if (str[i] === "'") {
              i++;
              while (i < n) {
                if (str[i] === "'" && str[i + 1] === "'") { i += 2; continue; }
                if (str[i] === "'") { i++; break; }
                i++;
              }
              continue;
            }
            if (str[i] === '(') depth++;
            else if (str[i] === ')') depth--;
            i++;
          }
          args.push({ list: splitArgs(str.slice(start, i - 1)) });
        } else if (ch === '#') {
          i++;
          let id = 0;
          while (i < n && str[i] >= '0' && str[i] <= '9') id = id * 10 + (str.charCodeAt(i++) - 48);
          args.push({ ref: id });
        } else {
          let start = i;
          while (i < n && str[i] !== ',' && str[i] !== ')') i++;
          const tok = str.slice(start, i).trim();
          if (!tok || tok === '$' || tok === '*') args.push(null);
          else {
            const numV = Number(tok);
            args.push(Number.isFinite(numV) && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(tok) ? numV : tok);
          }
        }
      }
      return args;
    };

    const parseSubEnts = (body) => {
      const res = [];
      let s = body.trim();
      if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
      let i = 0;
      const n = s.length;
      while (i < n) {
        while (i < n && (s[i] <= ' ')) i++;
        if (i >= n) break;
        const tStart = i;
        while (i < n && ((s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9') || s[i] === '_')) i++;
        const type = s.slice(tStart, i);
        while (i < n && s[i] <= ' ') i++;
        if (!type || s[i] !== '(') { i++; continue; }
        let depth = 1, aStart = ++i;
        while (i < n && depth > 0) {
          if (s[i] === "'") {
            i++;
            while (i < n) {
              if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
              if (s[i] === "'") { i++; break; }
              i++;
            }
            continue;
          }
          if (s[i] === '(') depth++;
          else if (s[i] === ')') depth--;
          i++;
        }
        res.push({ type, args: splitArgs(s.slice(aStart, i - 1)) });
      }
      return res;
    };

    const KEEP = new Set([
      'PRODUCT', 'PRODUCT_DEFINITION_FORMATION', 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE',
      'PRODUCT_DEFINITION', 'PRODUCT_DEFINITION_SHAPE', 'SHAPE_DEFINITION_REPRESENTATION',
      'SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION',
      'FACETED_BREP_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION',
      'NEXT_ASSEMBLY_USAGE_OCCURRENCE', 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION',
      'ITEM_DEFINED_TRANSFORMATION', 'MAPPED_ITEM', 'REPRESENTATION_MAP',
      'MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'SHELL_BASED_SURFACE_MODEL',
      'CLOSED_SHELL', 'OPEN_SHELL',
      'STYLED_ITEM', 'OVER_RIDING_STYLED_ITEM', 'PRESENTATION_STYLE_ASSIGNMENT',
      'SURFACE_STYLE_USAGE', 'SURFACE_SIDE_STYLE', 'SURFACE_STYLE_FILL_AREA',
      'SURFACE_STYLE_RENDERING_WITH_PROPERTIES', 'FILL_AREA_STYLE', 'FILL_AREA_STYLE_COLOUR',
      'COLOUR_RGB', 'DRAUGHTING_PRE_DEFINED_COLOUR',
      'SI_UNIT', 'CONVERSION_BASED_UNIT', 'LENGTH_MEASURE_WITH_UNIT',
    ]);
    const GEOM_TYPES = new Set(['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'SHELL_BASED_SURFACE_MODEL', 'CLOSED_SHELL', 'OPEN_SHELL']);
    const SHAPE_REP_TYPES = new Set(['ADVANCED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION', 'FACETED_BREP_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION', 'SHAPE_REPRESENTATION']);

    const ents = new Map();
    const posRaw = new Map();
    const byType = new Map();
    const addType = (t, id, ent) => {
      let arr = byType.get(t);
      if (!arr) { arr = []; byType.set(t, arr); }
      arr.push({ id, ent });
    };

    let i = dataM.index + dataM[0].length;
    const len = txt.length;
    while (i < len) {
      const ch = txt[i];
      if (ch <= ' ') { i++; continue; }
      if (ch === '/' && txt[i + 1] === '*') {
        const end = txt.indexOf('*/', i + 2);
        i = end >= 0 ? end + 2 : len;
        continue;
      }
      if (ch === '#') {
        i++;
        let id = 0;
        while (i < len && txt[i] >= '0' && txt[i] <= '9') id = id * 10 + (txt.charCodeAt(i++) - 48);
        while (i < len && txt[i] <= ' ') i++;
        if (txt[i] !== '=') { i++; continue; }
        i++;
        while (i < len && txt[i] <= ' ') i++;
        const bStart = i;
        while (i < len) {
          const c = txt[i];
          if (c === "'") {
            i++;
            while (i < len) {
              if (txt[i] === "'" && txt[i + 1] === "'") { i += 2; continue; }
              if (txt[i] === "'") { i++; break; }
              i++;
            }
            continue;
          }
          if (c === '/' && txt[i + 1] === '*') {
            const end = txt.indexOf('*/', i + 2);
            i = end >= 0 ? end + 2 : len;
            continue;
          }
          if (c === ';') break;
          i++;
        }
        const bEnd = i;
        if (txt[i] === ';') i++;
        const firstCh = txt[bStart];
        if (firstCh === '(') {
          if (txt.indexOf('REPRESENTATION_RELATIONSHIP', bStart) >= 0 && txt.indexOf('REPRESENTATION_RELATIONSHIP', bStart) < bEnd) {
            const subs = parseSubEnts(txt.slice(bStart, bEnd));
            ents.set(id, { id, type: 'COMPLEX', subs });
            for (const sub of subs) addType(sub.type, id, { id, subs });
          }
          continue;
        }
        let tEnd = bStart;
        while (tEnd < bEnd && ((txt[tEnd] >= 'A' && txt[tEnd] <= 'Z') || (txt[tEnd] >= '0' && txt[tEnd] <= '9') || txt[tEnd] === '_')) tEnd++;
        const tName = txt.slice(bStart, tEnd);
        if (tName === 'AXIS2_PLACEMENT_3D' || tName === 'CARTESIAN_POINT' || tName === 'DIRECTION') {
          posRaw.set(id, { tName, s: bStart, e: bEnd });
          continue;
        }
        if (!KEEP.has(tName)) continue;
        const pOpen = txt.indexOf('(', tEnd);
        const pClose = txt.lastIndexOf(')', bEnd - 1);
        if (pOpen < 0 || pClose <= pOpen) continue;
        const ent = { id, type: tName, args: splitArgs(txt.slice(pOpen + 1, pClose)) };
        ents.set(id, ent);
        addType(tName, id, ent);
      } else {
        i++;
      }
    }

    // Längeneinheit für Placement-Translationen
    let unitScale = 1;
    for (const { ent } of byType.get('CONVERSION_BASED_UNIT') || []) {
      const nm = ent.args[0] && ent.args[0].str ? ent.args[0].str.toUpperCase() : '';
      if (nm.includes('INCH')) { unitScale = 25.4; break; }
      if (nm.includes('FOOT') || nm.includes('FEET')) { unitScale = 304.8; break; }
    }
    if (unitScale === 1) {
      for (const { ent } of byType.get('SI_UNIT') || []) {
        if (ent.args[2] === '.METRE.') {
          if (ent.args[1] === '.MILLI.') unitScale = 1;
          else if (ent.args[1] === '.CENTI.') unitScale = 10;
          else if (ent.args[1] == null) unitScale = 1000;
        }
      }
    }

    // Farben auflösen
    const PREDEF_COLORS = {
      red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
      magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff', black: '#000000',
    };
    const toHex = (r, g, b) => {
      const h2 = (v) => clamp(Math.round((Number(v) || 0) * 255), 0, 255).toString(16).padStart(2, '0');
      return '#' + h2(r) + h2(g) + h2(b);
    };
    const resolveColour = (id, seen = new Set()) => {
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const e = ents.get(id);
      if (!e) return null;
      if (e.type === 'COLOUR_RGB') return toHex(e.args[1], e.args[2], e.args[3]);
      if (e.type === 'DRAUGHTING_PRE_DEFINED_COLOUR') {
        const k = e.args[0] && e.args[0].str ? e.args[0].str.toLowerCase().trim() : '';
        return PREDEF_COLORS[k] || null;
      }
      if (e.type === 'FILL_AREA_STYLE_COLOUR') return e.args[1] && e.args[1].ref ? resolveColour(e.args[1].ref, seen) : null;
      if (e.type === 'FILL_AREA_STYLE') {
        const lst = e.args[1] && e.args[1].list ? e.args[1].list : [];
        for (const a of lst) if (a && a.ref) { const c = resolveColour(a.ref, seen); if (c) return c; }
      }
      if (e.type === 'SURFACE_STYLE_FILL_AREA') return e.args[0] && e.args[0].ref ? resolveColour(e.args[0].ref, seen) : null;
      if (e.type === 'SURFACE_STYLE_RENDERING_WITH_PROPERTIES') return e.args[1] && e.args[1].ref ? resolveColour(e.args[1].ref, seen) : null;
      if (e.type === 'SURFACE_SIDE_STYLE') {
        const lst = e.args[1] && e.args[1].list ? e.args[1].list : [];
        for (const a of lst) if (a && a.ref) { const c = resolveColour(a.ref, seen); if (c) return c; }
      }
      if (e.type === 'SURFACE_STYLE_USAGE') return e.args[1] && e.args[1].ref ? resolveColour(e.args[1].ref, seen) : null;
      if (e.type === 'PRESENTATION_STYLE_ASSIGNMENT') {
        const lst = e.args[0] && e.args[0].list ? e.args[0].list : [];
        for (const a of lst) if (a && a.ref) { const c = resolveColour(a.ref, seen); if (c) return c; }
      }
      return null;
    };
    const itemColor = new Map();
    for (const type of ['STYLED_ITEM', 'OVER_RIDING_STYLED_ITEM']) {
      for (const { ent } of byType.get(type) || []) {
        const styles = ent.args[1] && ent.args[1].list ? ent.args[1].list : [];
        const targetRef = ent.args[2] && ent.args[2].ref ? ent.args[2].ref : null;
        if (!targetRef) continue;
        let col = null;
        for (const st of styles) if (st && st.ref) { col = resolveColour(st.ref); if (col) break; }
        if (col && (type === 'OVER_RIDING_STYLED_ITEM' || !itemColor.has(targetRef))) itemColor.set(targetRef, col);
      }
    }

    // Placements & Matrizen (4x4 column-major)
    const ID4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const isId4 = (m) => !m || m.every((v, k) => Math.abs(v - ID4[k]) < 1e-9);
    const mul4 = (a, b) => {
      const r = new Array(16);
      for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
        r[c * 4 + rr] = s;
      }
      return r;
    };
    const invRigid4 = (m) => {
      const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
      const tx = m[12], ty = m[13], tz = m[14];
      r[12] = -(r[0] * tx + r[4] * ty + r[8] * tz);
      r[13] = -(r[1] * tx + r[5] * ty + r[9] * tz);
      r[14] = -(r[2] * tx + r[6] * ty + r[10] * tz);
      return r;
    };
    const norm3 = (v, fb) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : fb; };
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const parsePosEnt = (id) => {
      const rec = posRaw.get(id);
      if (!rec) return null;
      const pOpen = txt.indexOf('(', rec.s);
      const pClose = txt.lastIndexOf(')', rec.e - 1);
      if (pOpen < 0 || pClose <= pOpen) return null;
      return { type: rec.tName, args: splitArgs(txt.slice(pOpen + 1, pClose)) };
    };
    const vecOf = (id, def) => {
      const e = parsePosEnt(id);
      const lst = e && e.args[1] && e.args[1].list ? e.args[1].list : null;
      if (!lst || lst.length < 2) return def;
      return [Number(lst[0]) || 0, Number(lst[1]) || 0, Number(lst[2]) || 0];
    };
    const axisMatrix = (axId) => {
      const e = parsePosEnt(axId);
      if (!e || e.type !== 'AXIS2_PLACEMENT_3D') return ID4;
      const o = e.args[1] && e.args[1].ref ? vecOf(e.args[1].ref, [0, 0, 0]).map((v) => v * unitScale) : [0, 0, 0];
      const z = e.args[2] && e.args[2].ref ? norm3(vecOf(e.args[2].ref, [0, 0, 1]), [0, 0, 1]) : [0, 0, 1];
      let x = e.args[3] && e.args[3].ref ? vecOf(e.args[3].ref, [1, 0, 0]) : null;
      if (!x) {
        const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        x = norm3(cross3(ref, z), [1, 0, 0]);
      } else {
        const d = dot3(x, z);
        x = norm3([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]], [1, 0, 0]);
      }
      const y = norm3(cross3(z, x), [0, 1, 0]);
      return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
    };

    // Produkt-Namen & Shape-Representations je PRODUCT_DEFINITION
    const pdName = new Map();
    const pdsToPd = new Map();
    for (const { ent } of byType.get('PRODUCT_DEFINITION_SHAPE') || []) {
      const pdRef = ent.args[2] && ent.args[2].ref ? ent.args[2].ref : null;
      if (pdRef) pdsToPd.set(ent.id, pdRef);
    }
    for (const { ent } of byType.get('PRODUCT_DEFINITION') || []) {
      const pdfRef = ent.args[2] && ent.args[2].ref ? ent.args[2].ref : null;
      const pdf = pdfRef ? ents.get(pdfRef) : null;
      const prodRef = pdf && pdf.args[2] && pdf.args[2].ref ? pdf.args[2].ref : null;
      const prod = prodRef ? ents.get(prodRef) : null;
      const nm = (prod && prod.args[0] && prod.args[0].str) || (prod && prod.args[1] && prod.args[1].str) || '';
      pdName.set(ent.id, nm.trim());
    }

    const repItems = (srId) => {
      const sr = ents.get(srId);
      if (!sr || !SHAPE_REP_TYPES.has(sr.type)) return [];
      const lst = sr.args[1] && sr.args[1].list ? sr.args[1].list : [];
      return lst.map((x) => x && x.ref).filter(Boolean);
    };
    const pdReps = new Map();
    for (const { ent } of byType.get('SHAPE_DEFINITION_REPRESENTATION') || []) {
      const pdsRef = ent.args[0] && ent.args[0].ref ? ent.args[0].ref : null;
      const srRef = ent.args[1] && ent.args[1].ref ? ent.args[1].ref : null;
      const pdRef = pdsRef ? pdsToPd.get(pdsRef) : null;
      if (pdRef && srRef) {
        if (!pdReps.has(pdRef)) pdReps.set(pdRef, []);
        pdReps.get(pdRef).push(srRef);
      }
    }
    // Indirekte Shape-Representation-Relationships (ohne Kontext-Bezug) verknüpfen
    const extraReps = new Map();
    for (const { ent } of byType.get('SHAPE_REPRESENTATION_RELATIONSHIP') || []) {
      if (ent.subs) {
        const rr = ent.subs.find((s) => s.type === 'REPRESENTATION_RELATIONSHIP');
        const hasTr = ent.subs.some((s) => s.type === 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION');
        if (rr && !hasTr) {
          const r1 = rr.args[2] && rr.args[2].ref, r2 = rr.args[3] && rr.args[3].ref;
          if (r1 && r2) {
            if (!extraReps.has(r1)) extraReps.set(r1, []);
            extraReps.get(r1).push(r2);
            if (!extraReps.has(r2)) extraReps.set(r2, []);
            extraReps.get(r2).push(r1);
          }
        }
      }
    }

    // NAUOs & Transformationen
    const nauoInfo = new Map();
    const childrenOfPd = new Map();
    const isChildPd = new Set();
    for (const { ent } of byType.get('NEXT_ASSEMBLY_USAGE_OCCURRENCE') || []) {
      const occName = ((ent.args[1] && ent.args[1].str) || (ent.args[0] && ent.args[0].str) || '').trim();
      const parentPd = ent.args[3] && ent.args[3].ref ? ent.args[3].ref : null;
      const childPd = ent.args[4] && ent.args[4].ref ? ent.args[4].ref : null;
      if (!parentPd || !childPd) continue;
      const edge = { id: ent.id, parentPd, childPd, occName, mat: null, rep1: null, rep2: null };
      nauoInfo.set(ent.id, edge);
      if (!childrenOfPd.has(parentPd)) childrenOfPd.set(parentPd, []);
      childrenOfPd.get(parentPd).push(edge);
      isChildPd.add(childPd);
    }

    for (const { ent } of byType.get('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION') || []) {
      const relRef = ent.args[0] && ent.args[0].ref ? ent.args[0].ref : null;
      const pdsRef = ent.args[1] && ent.args[1].ref ? ent.args[1].ref : null;
      const pds = pdsRef ? ents.get(pdsRef) : null;
      const nauoRef = pds && pds.type === 'PRODUCT_DEFINITION_SHAPE' && pds.args[2] && pds.args[2].ref ? pds.args[2].ref : null;
      const edge = nauoRef ? nauoInfo.get(nauoRef) : null;
      const relEnt = relRef ? ents.get(relRef) : null;
      if (!edge || !relEnt || !relEnt.subs) continue;
      const rr = relEnt.subs.find((s) => s.type === 'REPRESENTATION_RELATIONSHIP');
      const rrt = relEnt.subs.find((s) => s.type === 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION');
      if (!rr || !rrt) continue;
      const rep1 = rr.args[2] && rr.args[2].ref ? rr.args[2].ref : null;
      const rep2 = rr.args[3] && rr.args[3].ref ? rr.args[3].ref : null;
      const trRef = rrt.args[0] && rrt.args[0].ref ? rrt.args[0].ref : null;
      const trEnt = trRef ? ents.get(trRef) : null;
      if (!trEnt || trEnt.type !== 'ITEM_DEFINED_TRANSFORMATION') continue;
      const ax1 = trEnt.args[2] && trEnt.args[2].ref ? trEnt.args[2].ref : null;
      const ax2 = trEnt.args[3] && trEnt.args[3].ref ? trEnt.args[3].ref : null;
      if (!ax1 || !ax2) continue;
      const m1 = axisMatrix(ax1), m2 = axisMatrix(ax2);
      const childReps = new Set(pdReps.get(edge.childPd) || []);
      const parentReps = new Set(pdReps.get(edge.parentPd) || []);
      // rep1 -> rep2 transformiert lokal (ax1) in Elternsystem (ax2); falls umgekehrt, invertieren
      const reversed = parentReps.has(rep1) && childReps.has(rep2) && !childReps.has(rep1);
      edge.mat = reversed ? mul4(m1, invRigid4(m2)) : mul4(m2, invRigid4(m1));
    }

    const findLeafRep = (pdId) => {
      const queue = [...(pdReps.get(pdId) || [])];
      const visited = new Set();
      let fallback = queue[0] || null;
      while (queue.length) {
        const srId = queue.shift();
        if (!srId || visited.has(srId)) continue;
        visited.add(srId);
        const items = repItems(srId);
        const geoms = items.filter((id) => { const e = ents.get(id); return e && GEOM_TYPES.has(e.type); });
        if (geoms.length) return { srId, geoms };
        const sr = ents.get(srId);
        if (sr && sr.type === 'ADVANCED_BREP_SHAPE_REPRESENTATION') return { srId, geoms: items };
        for (const nx of extraReps.get(srId) || []) queue.push(nx);
      }
      return fallback ? { srId: fallback, geoms: repItems(fallback) } : null;
    };

    const isGenericName = (s) => !s || /^NONE$/i.test(s) || /^Open CASCADE STEP translator/i.test(s);
    const pickName = (a, b) => (!isGenericName(a) ? a : !isGenericName(b) ? b : '');
    let partCount = 0, groupCount = 0;

    const buildNode = (pdId, accMat, occName, seen) => {
      if (seen.has(pdId)) return null;
      const nextSeen = new Set(seen);
      nextSeen.add(pdId);
      const kids = childrenOfPd.get(pdId) || [];
      const myName = pdName.get(pdId) || '';
      if (kids.length) {
        const children = [];
        for (const edge of kids) {
          const nextMat = edge.mat ? mul4(accMat, edge.mat) : accMat;
          const childNode = buildNode(edge.childPd, nextMat, edge.occName, nextSeen);
          if (childNode) children.push(childNode);
        }
        if (!children.length) return null;
        groupCount++;
        return { type: 'assembly', name: pickName(myName, occName), children };
      }
      const rep = findLeafRep(pdId);
      if (!rep) return null;
      let color = itemColor.get(rep.srId) || null;
      if (!color) {
        for (const gid of rep.geoms) {
          color = itemColor.get(gid) || null;
          if (!color) {
            const ge = ents.get(gid);
            if (ge && ge.args) {
              for (const a of ge.args) {
                if (a && a.ref && itemColor.has(a.ref)) { color = itemColor.get(a.ref); break; }
              }
            }
          }
          if (color) break;
        }
      }
      partCount++;
      return {
        type: 'part',
        name: pickName(myName, occName),
        color,
        entityId: rep.srId,
        matrix: isId4(accMat) ? null : accMat,
      };
    };

    const rootPds = [...pdName.keys()].filter((pdId) => !isChildPd.has(pdId));
    let roots = [];
    for (const pdId of rootPds) {
      const node = buildNode(pdId, ID4, '', new Set());
      if (node) roots.push(node);
    }
    // Einzelne generische Wurzel-Baugruppe (z. B. STEP-Translator-Wrapper) bei einem einzigen Kind auspacken
    if (roots.length === 1 && roots[0].type === 'assembly' && roots[0].children.length === 1 && isGenericName(roots[0].name)) {
      roots = roots[0].children;
      groupCount = Math.max(0, groupCount - 1);
    }
    return { roots, partCount, groupCount };
  }

  function ensureModelMode() {
    if (Sketch.active) Sketch.cancel(true);
    if (App.mode !== 'model' && typeof Commands !== 'undefined' && Commands.setMode) Commands.setMode('model');
  }
  // STEP, IGES, BREP, STL, 3MF oder OBJ als neues Teil (oder mehrere Teile) ins Projekt holen
  async function importCAD(f) {
    if (/\.3mf$/i.test(f.name)) return import3MF(f);
    if (/\.obj$/i.test(f.name)) return importOBJ(f);
    const fmt = /\.stl$/i.test(f.name) ? 'stl'
      : /\.(igs|iges)$/i.test(f.name) ? 'iges'
      : /\.brep$/i.test(f.name) ? 'brep'
      : 'step';
    if (f.size > 100e6) { UI.toast('Die Datei ist zu groß (über 100 MB).', { kind: 'bad' }); return; }
    ensureModelMode();
    if (el) newProject(true);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const blobId = await Store.putBlob(bytes);
    const base = f.name.replace(/\.(step|stp|igs|iges|brep|stl)$/i, '');
    if (fmt === 'step') {
      let parsed = null;
      try { parsed = parseSTEP(bytes); } catch (e) { console.warn(e); }
      if (parsed && parsed.partCount > 0) {
        let partIdx = 0;
        const groupIds = [];
        const importIds = [];
        const buildItems = (nodes) => nodes.map((node) => {
          if (node.type === 'assembly') {
            const kids = buildItems(node.children);
            const firstSolid = kids.find((c) => c.role !== 'hole') || kids[0];
            const g = Model.newItem('group', { assembly: true }, { name: node.name || base, color: (firstSolid && firstSolid.color) || undefined });
            g.children = kids;
            groupIds.push(g.id);
            return g;
          }
          partIdx++;
          const p = { fmt: 'step', blobId, size: bytes.byteLength, file: f.name, scale: 1 };
          if (parsed.partCount > 1 && node.entityId) p.stepEntity = node.entityId;
          if (node.matrix) p.stepMat = node.matrix;
          const name = node.name || (parsed.partCount === 1 ? base : `${base} ${partIdx}`);
          const extra = { name };
          if (node.color) { extra.color = node.color; extra.more = { colorSet: true }; }
          const imp = Model.newItem('import', p, extra);
          importIds.push(imp.id);
          return imp;
        });
        const items = buildItems(parsed.roots);
        const label = parsed.partCount > 1 || parsed.groupCount > 0 ? 'STEP-Baugruppe importiert' : 'Importiert';
        App.change(label, (doc) => { doc.items.push(...items); });
        if (typeof Panels !== 'undefined' && Panels.expand) for (const gid of groupIds) Panels.expand(gid);
        App.select(items.map((x) => x.id));
        checkImportedList(importIds);
        if (parsed.partCount === 1 && !groupIds.length) {
          UI.toast(`„${f.name}“ importiert. Mit „Auf die XY-Ebene setzen“ legst du es auf den Boden.`, { icon: 'folder', ms: 5000 });
        } else {
          const grpTxt = groupIds.length ? ` in ${groupIds.length} ${groupIds.length === 1 ? 'Gruppe' : 'Gruppen'}` : '';
          UI.toast(`„${f.name}“ importiert: ${parsed.partCount} ${parsed.partCount === 1 ? 'Teil' : 'Teile'}${grpTxt}.`, { icon: 'folder', ms: 6000 });
        }
        setTimeout(() => {
          const box = new THREE.Box3();
          for (const it of items) { const b = Actions.worldBox(it.id); if (b && !b.isEmpty()) box.union(b); }
          if (!box.isEmpty()) Viewer.fit(items.map((x) => x.id));
        }, 1500);
        return;
      }
    }
    const it = Model.newItem('import', { fmt, blobId, size: bytes.byteLength, file: f.name, scale: 1 }, { name: base });
    App.change('Importiert', (doc) => { doc.items.push(it); });
    App.select([it.id]);
    UI.toast(`„${f.name}“ importiert. Mit „Auf die XY-Ebene setzen“ legst du es auf den Boden.`, { icon: 'folder', ms: 5000 });
    checkImport(it.id).catch(() => {});
    setTimeout(() => { const b = Actions.worldBox(it.id); if (b && !b.isEmpty()) Viewer.fit([it.id]); }, 1500);
  }
  // ---------- 3MF lesen: ZIP mit 3D/3dmodel.model, mehrere Teile mit Namen, Farben, Einheiten und Transform-Matrizen ----------
  async function parse3MF(buf) {
    const files = await Zip.read(buf, (n) => /\.rels$|\.model$/i.test(n));
    const normPath = (p) => {
      const segs = [];
      for (const s of String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
        if (!s || s === '.') continue;
        if (s === '..') segs.pop();
        else segs.push(s);
      }
      return segs.join('/');
    };
    const findEntry = (p) => {
      const np = normPath(p);
      if (files.has(np)) return { path: np, data: files.get(np) };
      const low = np.toLowerCase();
      for (const [k, v] of files) if (k.toLowerCase() === low) return { path: k, data: v };
      return null;
    };
    const resolvePath = (base, rel) => {
      if (!rel) return '';
      if (rel.startsWith('/')) return normPath(rel);
      const i = base.lastIndexOf('/');
      return normPath((i >= 0 ? base.slice(0, i + 1) : '') + rel);
    };
    const kids = (node, name) => [...((node && node.children) || [])].filter((c) => c.localName === name);
    const attr = (node, name) => {
      if (!node) return null;
      const v = node.getAttribute(name);
      if (v != null) return v;
      for (const a of node.attributes || []) if (a.localName === name) return a.value;
      return null;
    };
    const normHex = (s) => { const m = /^\s*#?([0-9a-f]{6})(?:[0-9a-f]{2})?\s*$/i.exec(s || ''); return m ? '#' + m[1].toLowerCase() : null; };
    const dec = new TextDecoder('utf-8'), parser = new DOMParser();
    const parseXml = (bytes) => parser.parseFromString(dec.decode(bytes).replace(/^\uFEFF/, ''), 'application/xml');
    let mainPath = null;
    const rels = findEntry('_rels/.rels');
    if (rels) {
      const rdoc = parseXml(rels.data);
      for (const r of kids(rdoc.documentElement, 'Relationship')) {
        if (/\/3dmodel$/i.test(r.getAttribute('Type') || '')) { mainPath = normPath(r.getAttribute('Target')); break; }
      }
    }
    if (!mainPath || !findEntry(mainPath)) mainPath = findEntry('3D/3dmodel.model') ? '3D/3dmodel.model' : [...files.keys()].find((k) => /\.model$/i.test(k));
    if (!mainPath || !findEntry(mainPath)) throw new Error('In der 3MF-Datei fehlt das 3D-Modell (3D/3dmodel.model).');

    const UNITS = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
    const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    const parseMat = (str, u) => {
      if (!str || !str.trim()) return ID;
      const a = str.trim().split(/\s+/).map(Number);
      if (a.length < 12 || a.some((x) => !Number.isFinite(x))) return ID;
      const m = a.slice(0, 12); m[9] *= u; m[10] *= u; m[11] *= u; return m;
    };
    const mulMat = (A, B) => {
      const R = new Array(12);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      for (let c = 0; c < 3; c++) R[9 + c] = A[9] * B[c] + A[10] * B[3 + c] + A[11] * B[6 + c] + B[9 + c];
      return R;
    };
    const det3 = (M) => M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);

    const modelCache = new Map();
    const loadModel = (path) => {
      const hit = findEntry(path); if (!hit) return null;
      if (modelCache.has(hit.path)) return modelCache.get(hit.path);
      const doc = parseXml(hit.data), root = doc.documentElement;
      if (!root || root.localName !== 'model' || doc.querySelector('parsererror')) throw new Error('Die 3MF-Modellbeschreibung (XML) ist beschädigt.');
      const unitName = (root.getAttribute('unit') || 'millimeter').trim().toLowerCase(), unitScale = UNITS[unitName] || 1;
      let title = '';
      for (const md of kids(root, 'metadata')) if ((md.getAttribute('name') || '').toLowerCase() === 'title') title = (md.textContent || '').trim();
      const palettes = new Map(), objects = new Map();
      for (const res of kids(root, 'resources')) {
        for (const bm of kids(res, 'basematerials')) palettes.set(bm.getAttribute('id'), kids(bm, 'base').map((b) => normHex(b.getAttribute('displaycolor'))));
        for (const cg of kids(res, 'colorgroup')) palettes.set(cg.getAttribute('id'), kids(cg, 'color').map((c) => normHex(c.getAttribute('color'))));
        for (const ob of kids(res, 'object')) {
          const id = ob.getAttribute('id'); if (!id) continue;
          const obj = {
            id,
            name: (ob.getAttribute('name') || '').trim(),
            type: (ob.getAttribute('type') || 'model').trim().toLowerCase(),
            pid: ob.getAttribute('pid'),
            pindex: ob.hasAttribute('pindex') ? parseInt(ob.getAttribute('pindex'), 10) : null,
            mesh: null,
            components: null,
          };
          const me = kids(ob, 'mesh')[0];
          if (me) {
            const vEls = kids(kids(me, 'vertices')[0], 'vertex'), tEls = kids(kids(me, 'triangles')[0], 'triangle');
            const verts = new Float64Array(vEls.length * 3), tris = new Uint32Array(tEls.length * 3);
            for (let i = 0; i < vEls.length; i++) {
              const ve = vEls[i];
              verts[i * 3] = (parseFloat(ve.getAttribute('x')) || 0) * unitScale;
              verts[i * 3 + 1] = (parseFloat(ve.getAttribute('y')) || 0) * unitScale;
              verts[i * 3 + 2] = (parseFloat(ve.getAttribute('z')) || 0) * unitScale;
            }
            for (let i = 0; i < tEls.length; i++) {
              const te = tEls[i];
              tris[i * 3] = parseInt(te.getAttribute('v1'), 10);
              tris[i * 3 + 1] = parseInt(te.getAttribute('v2'), 10);
              tris[i * 3 + 2] = parseInt(te.getAttribute('v3'), 10);
              if (i === 0 && (te.hasAttribute('pid') || te.hasAttribute('p1'))) {
                obj.triPid = te.getAttribute('pid');
                obj.triP1 = te.hasAttribute('p1') ? parseInt(te.getAttribute('p1'), 10) : null;
              }
            }
            obj.mesh = { verts, tris };
          }
          const ce = kids(ob, 'components')[0];
          if (ce) {
            obj.components = kids(ce, 'component').map((c) => ({
              objectid: c.getAttribute('objectid'),
              transform: parseMat(c.getAttribute('transform'), unitScale),
              path: attr(c, 'path'),
            })).filter((c) => c.objectid);
          }
          objects.set(id, obj);
        }
      }
      const buildItems = [];
      for (const b of kids(root, 'build')) {
        for (const it of kids(b, 'item')) {
          const oid = it.getAttribute('objectid');
          if (oid) buildItems.push({ objectid: oid, transform: parseMat(it.getAttribute('transform'), unitScale), partnumber: (it.getAttribute('partnumber') || '').trim() });
        }
      }
      const m = { path: hit.path, unitName, unitScale, title, palettes, objects, buildItems };
      modelCache.set(hit.path, m);
      return m;
    };
    const resolveColor = (model, obj) => {
      if (obj.pid && model.palettes.has(obj.pid)) {
        const pal = model.palettes.get(obj.pid), idx = Number.isFinite(obj.pindex) ? obj.pindex : 0;
        if (pal[idx]) return pal[idx];
      }
      const tPid = obj.triPid || obj.pid;
      if (tPid && Number.isFinite(obj.triP1) && model.palettes.has(tPid)) {
        const c = model.palettes.get(tPid)[obj.triP1];
        if (c) return c;
      }
      return null;
    };
    const parts = [];
    const collect = (modelPath, objId, mat, inheritName, inheritColor, seen) => {
      const m = loadModel(modelPath); if (!m) return;
      const obj = m.objects.get(objId); if (!obj || obj.type === 'support' || obj.type === 'other') return;
      const key = m.path + '#' + objId; if (seen.has(key)) return;
      const nextSeen = new Set(seen); nextSeen.add(key);
      const name = obj.name || inheritName, color = resolveColor(m, obj) || inheritColor;
      if (obj.mesh && obj.mesh.tris.length >= 3 && obj.mesh.verts.length >= 9) {
        const srcV = obj.mesh.verts, nVert = srcV.length / 3, vertices = new Float32Array(srcV.length);
        for (let i = 0; i < srcV.length; i += 3) {
          const x = srcV[i], y = srcV[i + 1], z = srcV[i + 2];
          vertices[i] = x * mat[0] + y * mat[3] + z * mat[6] + mat[9];
          vertices[i + 1] = x * mat[1] + y * mat[4] + z * mat[7] + mat[10];
          vertices[i + 2] = x * mat[2] + y * mat[5] + z * mat[8] + mat[11];
        }
        const flip = det3(mat) < 0, srcT = obj.mesh.tris, triOut = [];
        for (let i = 0; i < srcT.length; i += 3) {
          const a = srcT[i], b = flip ? srcT[i + 2] : srcT[i + 1], c = flip ? srcT[i + 1] : srcT[i + 2];
          if (a >= 0 && b >= 0 && c >= 0 && a < nVert && b < nVert && c < nVert && a !== b && b !== c && a !== c) triOut.push(a, b, c);
        }
        if (triOut.length >= 3) parts.push({ name, color, vertices, triangles: new Uint32Array(triOut) });
      }
      if (obj.components) {
        for (const c of obj.components) collect(c.path ? resolvePath(m.path, c.path) : m.path, c.objectid, mulMat(c.transform, mat), name, color, nextSeen);
      }
    };
    const rootModel = loadModel(mainPath);
    if (rootModel.buildItems.length) {
      for (const bi of rootModel.buildItems) collect(rootModel.path, bi.objectid, bi.transform, bi.partnumber, null, new Set());
    } else {
      for (const obj of rootModel.objects.values()) if (obj.mesh) collect(rootModel.path, obj.id, ID, '', null, new Set());
    }
    return { parts, unit: rootModel.unitName, unitScale: rootModel.unitScale, title: rootModel.title };
  }
  async function import3MF(f) {
    if (f.size > 100e6) { UI.toast('Die Datei ist zu groß (über 100 MB).', { kind: 'bad' }); return; }
    let parsed;
    try { parsed = await parse3MF(await f.arrayBuffer()); } catch (e) {
      UI.toast('Diese 3MF-Datei kann ich nicht lesen: ' + (e && e.message ? e.message : 'unbekannter Fehler'), { kind: 'bad', ms: 7000 });
      console.warn(e); return;
    }
    if (!parsed.parts.length) { UI.toast('In der 3MF-Datei habe ich keine 3D-Körper gefunden.', { kind: 'bad', ms: 6000 }); return; }
    ensureModelMode();
    if (el) newProject(true);
    const base = f.name.replace(/\.3mf$/i, '');
    const items = [];
    for (let i = 0; i < parsed.parts.length; i++) {
      const pt = parsed.parts[i];
      const name = pt.name || (parsed.parts.length === 1 ? base : `${base} ${i + 1}`);
      const stl = Print.buildSTL([{ vertices: pt.vertices, triangles: pt.triangles }], name);
      const blobId = await Store.putBlob(stl);
      const extra = pt.color ? { color: pt.color, more: { colorSet: true } } : {};
      items.push(Model.newItem('import', { fmt: 'stl', blobId, size: stl.byteLength, file: f.name, scale: 1 }, { name, ...extra }));
    }
    App.change('3MF importiert', (doc) => { doc.items.push(...items); });
    App.select(items.map((x) => x.id));
    checkImportedList(items.map((x) => x.id));
    const unitNote = parsed.unitScale !== 1 ? ` (von ${parsed.unit} in Millimeter umgerechnet)` : '';
    UI.toast(`„${f.name}“ importiert: ${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}${unitNote}. Mit „Auf die XY-Ebene setzen“ legst du sie auf den Boden.`, { icon: 'folder', ms: 6000 });
    setTimeout(() => {
      const box = new THREE.Box3();
      for (const it of items) { const b = Actions.worldBox(it.id); if (b && !b.isEmpty()) box.union(b); }
      if (!box.isEmpty()) Viewer.fit(items.map((x) => x.id));
    }, 1500);
  }
  // ---------- OBJ lesen: ASCII-Wavefront-OBJ (mehrere Objekte/Gruppen, Dreiecke und Polygone) ----------
  function parseOBJ(txt) {
    const rawVerts = [];
    const groups = [];
    let cur = { name: '', rawTris: [] };
    const pushCur = () => {
      if (cur.rawTris.length >= 3) groups.push(cur);
      cur = { name: '', rawTris: [] };
    };
    // Zeilenfortsetzungen (\) zusammenziehen und zeilenweise lesen
    const lines = String(txt || '').replace(/\\\r?\n/g, ' ').split(/\r\n|\r|\n/);
    for (const rawLine of lines) {
      const hash = rawLine.indexOf('#');
      const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
      if (!line) continue;
      const sp = line.search(/\s/);
      const tag = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
      const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      if (tag === 'v') {
        const c = rest.split(/\s+/);
        if (c.length >= 3) {
          const x = parseFloat(c[0]), y = parseFloat(c[1]), z = parseFloat(c[2]);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) rawVerts.push(x, y, z);
        }
      } else if (tag === 'o') {
        if (cur.rawTris.length) pushCur();
        cur.name = rest;
      } else if (tag === 'g') {
        if (cur.rawTris.length) pushCur();
        if (!cur.name && rest) cur.name = rest;
      } else if (tag === 'f' && rest) {
        const vCount = (rawVerts.length / 3) | 0;
        const poly = [];
        for (const tok of rest.split(/\s+/)) {
          const idx = parseInt(tok.split('/')[0], 10);
          if (!Number.isFinite(idx) || idx === 0) continue;
          const vi = idx < 0 ? vCount + idx : idx - 1;
          if (vi >= 0 && vi < vCount) poly.push(vi);
        }
        if (poly.length >= 3) {
          for (let k = 1; k + 1 < poly.length; k++) {
            const a = poly[0], b = poly[k], c = poly[k + 1];
            if (a !== b && b !== c && a !== c) cur.rawTris.push(a, b, c);
          }
        }
      }
    }
    if (cur.rawTris.length >= 3) groups.push(cur);
    const parts = [];
    for (const grp of groups) {
      const map = new Map();
      const verts = [];
      const tris = new Uint32Array(grp.rawTris.length);
      for (let i = 0; i < grp.rawTris.length; i++) {
        const gIdx = grp.rawTris[i];
        let lIdx = map.get(gIdx);
        if (lIdx === undefined) {
          lIdx = (verts.length / 3) | 0;
          map.set(gIdx, lIdx);
          verts.push(rawVerts[gIdx * 3], rawVerts[gIdx * 3 + 1], rawVerts[gIdx * 3 + 2]);
        }
        tris[i] = lIdx;
      }
      if (tris.length >= 3 && verts.length >= 9) {
        parts.push({ name: grp.name, vertices: new Float32Array(verts), triangles: tris });
      }
    }
    return { parts };
  }
  async function importOBJ(f) {
    if (f.size > 100e6) { UI.toast('Die Datei ist zu groß (über 100 MB).', { kind: 'bad' }); return; }
    let parsed;
    try { parsed = parseOBJ(await f.text()); } catch (e) {
      UI.toast('Diese OBJ-Datei kann ich nicht lesen: ' + (e && e.message ? e.message : 'unbekannter Fehler'), { kind: 'bad', ms: 7000 });
      console.warn(e); return;
    }
    if (!parsed.parts.length) { UI.toast('In der OBJ-Datei habe ich keine Dreiecke gefunden.', { kind: 'bad', ms: 6000 }); return; }
    ensureModelMode();
    if (el) newProject(true);
    const base = f.name.replace(/\.obj$/i, '');
    const items = [];
    for (let i = 0; i < parsed.parts.length; i++) {
      const pt = parsed.parts[i];
      const name = pt.name || (parsed.parts.length === 1 ? base : `${base} ${i + 1}`);
      const stl = Print.buildSTL([{ vertices: pt.vertices, triangles: pt.triangles }], name);
      const blobId = await Store.putBlob(stl);
      items.push(Model.newItem('import', { fmt: 'stl', blobId, size: stl.byteLength, file: f.name, scale: 1 }, { name }));
    }
    App.change('OBJ importiert', (doc) => { doc.items.push(...items); });
    App.select(items.map((x) => x.id));
    checkImportedList(items.map((x) => x.id));
    UI.toast(`„${f.name}“ importiert: ${items.length} ${items.length === 1 ? 'Teil' : 'Teile'}. Mit „Auf die XY-Ebene setzen“ legst du es auf den Boden.`, { icon: 'folder', ms: 6000 });
    setTimeout(() => {
      const box = new THREE.Box3();
      for (const it of items) { const b = Actions.worldBox(it.id); if (b && !b.isEmpty()) box.union(b); }
      if (!box.isEmpty()) Viewer.fit(items.map((x) => x.id));
    }, 1500);
  }
  // ---------- DXF lesen: Linien, Kreise, Bögen, Polylinien, Ellipsen und Splines werden eine Skizze ----------
  function parseDXF(txt) {
    const L = txt.split(/\r\n|\r|\n/), P = [];
    for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i], 10); if (Number.isNaN(c)) return null; P.push([c, L[i + 1].trim()]); }
    let unit = 1, sec = '', i = 0;
    const ents = [], f = (v) => parseFloat(v) || 0, R = (v) => round(v, 4);
    const U = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
    const line = (a, b) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) ents.push({ type: 'line', a: a.slice(), b: b.slice() }); };
    const bulgeSeg = (a, b, bg) => {
      if (Math.abs(bg) < 1e-9) return line(a, b);
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy); if (d < 1e-6) return;
      const s = (bg * d) / 2;
      ents.push({ type: 'arc', a: a.slice(), m: [(a[0] + b[0]) / 2 + (dy / d) * s, (a[1] + b[1]) / 2 - (dx / d) * s], b: b.slice() });
    };
    const polyOut = (V, closed) => { for (let k = 0; k + 1 < V.length; k++) bulgeSeg(V[k].p, V[k + 1].p, V[k].b); if (closed && V.length > 2) bulgeSeg(V[V.length - 1].p, V[0].p, V[V.length - 1].b); };
    // B-Spline an einer Stelle auswerten (de Boor)
    const deBoor = (deg, kn, cp, t) => {
      let k = deg; while (k < cp.length - 1 && t >= kn[k + 1]) k++;
      const d = []; for (let j = 0; j <= deg; j++) d.push(cp[j + k - deg].slice());
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
        const den = kn[j + 1 + k - r] - kn[j + k - deg], a = den > 1e-12 ? (t - kn[j + k - deg]) / den : 0;
        d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
      }
      return d[deg];
    };
    while (i < P.length) {
      const [c, v] = P[i];
      if (c === 0 && v === 'SECTION') { sec = (P[i + 1] || [])[1] || ''; i += 2; continue; }
      if (c === 0 && v === 'ENDSEC') { sec = ''; i++; continue; }
      if (sec === 'HEADER' && c === 9 && v === '$INSUNITS') { unit = U[parseInt((P[i + 1] || [])[1], 10)] || 1; i += 2; continue; }
      if (sec !== 'ENTITIES' || c !== 0) { i++; continue; }
      // alle Paare dieses Elements einsammeln
      let j = i + 1; const g = [];
      while (j < P.length && P[j][0] !== 0) { g.push(P[j]); j++; }
      const one = (code, def = 0) => { const q = g.find((x) => x[0] === code); return q ? f(q[1]) : def; };
      const all = (code) => g.filter((x) => x[0] === code).map((x) => f(x[1]));
      if (v === 'LINE') line([one(10), one(20)], [one(11), one(21)]);
      else if (v === 'CIRCLE') { if (one(40) > 1e-6) ents.push({ type: 'circle', c: [one(10), one(20)], r: one(40) }); }
      else if (v === 'ARC') {
        const cx = one(10), cy = one(20), r = one(40); let a0 = one(50), a1 = one(51, 360); if (a1 <= a0) a1 += 360;
        const at = (d) => [cx + r * Math.cos((d * Math.PI) / 180), cy + r * Math.sin((d * Math.PI) / 180)];
        if (r > 1e-6) ents.push({ type: 'arc', a: at(a0), m: at((a0 + a1) / 2), b: at(a1) });
      } else if (v === 'LWPOLYLINE') {
        const V = []; for (const [cc, vv] of g) { if (cc === 10) V.push({ p: [f(vv), 0], b: 0 }); else if (cc === 20 && V.length) V[V.length - 1].p[1] = f(vv); else if (cc === 42 && V.length) V[V.length - 1].b = f(vv); }
        polyOut(V, (one(70) & 1) === 1);
      } else if (v === 'POLYLINE') {
        const closed = (one(70) & 1) === 1, V = [];
        while (j < P.length && P[j][1] === 'VERTEX') { let k = j + 1; const q = { p: [0, 0], b: 0 }; while (k < P.length && P[k][0] !== 0) { if (P[k][0] === 10) q.p[0] = f(P[k][1]); else if (P[k][0] === 20) q.p[1] = f(P[k][1]); else if (P[k][0] === 42) q.b = f(P[k][1]); k++; } V.push(q); j = k; }
        polyOut(V, closed);
      } else if (v === 'ELLIPSE') {
        const c0 = [one(10), one(20)], mx = one(11), my = one(21), rx = Math.hypot(mx, my), ry = rx * one(40, 1), rot = Math.atan2(my, mx);
        const t0 = one(41, 0); let t1 = one(42, Math.PI * 2); if (t1 <= t0) t1 += Math.PI * 2;
        if (rx > 1e-6 && ry > 1e-6) {
          if (Math.abs(t1 - t0 - Math.PI * 2) < 1e-4) ents.push({ type: 'ellipse', c: c0, rx, ry, rot });
          else { const n = Math.max(6, Math.ceil(((t1 - t0) / Math.PI) * 12)), pts = []; for (let k = 0; k <= n; k++) { const t = t0 + ((t1 - t0) * k) / n, x = rx * Math.cos(t), y = ry * Math.sin(t); pts.push([c0[0] + x * Math.cos(rot) - y * Math.sin(rot), c0[1] + x * Math.sin(rot) + y * Math.cos(rot)]); } ents.push({ type: 'spline', pts, closed: false }); }
        }
      } else if (v === 'SPLINE') {
        const fx = all(11), fy = all(21), cx = all(10), cy = all(20), kn = all(40), deg = Math.max(1, Math.round(one(71, 3))), closed = (one(70) & 1) === 1;
        let pts = [];
        if (fx.length >= 2) pts = fx.map((x, k) => [x, fy[k] || 0]);
        else if (cx.length > deg && kn.length >= cx.length + deg + 1) {
          const cp = cx.map((x, k) => [x, cy[k] || 0]), a = kn[deg], b = kn[cp.length], n = Math.min(60, Math.max(8, cp.length * 4));
          for (let k = 0; k <= n; k++) pts.push(deBoor(deg, kn, cp, Math.min(a + ((b - a) * k) / n, b - 1e-9)));
          pts[pts.length - 1] = cp[cp.length - 1].slice();
        } else pts = cx.map((x, k) => [x, cy[k] || 0]);
        if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
        if (pts.length >= 2) ents.push({ type: 'spline', pts, closed: closed && pts.length > 2 });
      }
      i = j;
    }
    return tidyOutline(ents, unit);
  }
  // Maßeinheit, Mitte auf den Ursprung und Endpunkte verschweißen (kleine Lücken aus anderen Programmen)
  function tidyOutline(ents, unit) {
    const R = (v) => round(v, 4);
    if (!ents.length) return { ents, unit };
    const pk = (e) => (e.type === 'line' || e.type === 'arc' ? [e.a, e.b, ...(e.m ? [e.m] : [])] : e.type === 'spline' ? e.pts : [e.c]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of ents) for (const q of pk(e)) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    for (const e of ents) if (e.type === 'circle') { x0 = Math.min(x0, e.c[0] - e.r); x1 = Math.max(x1, e.c[0] + e.r); y0 = Math.min(y0, e.c[1] - e.r); y1 = Math.max(y1, e.c[1] + e.r); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const e of ents) {
      for (const q of pk(e)) { q[0] = R((q[0] - mx) * unit); q[1] = R((q[1] - my) * unit); }
      if (e.r != null) e.r = R(e.r * unit); if (e.rx != null) { e.rx = R(e.rx * unit); e.ry = R(e.ry * unit); }
      e.id = uid('e');
    }
    const ends = []; for (const e of ents) { if (e.type === 'line' || e.type === 'arc') ends.push(e.a, e.b); else if (e.type === 'spline' && !e.closed) ends.push(e.pts[0], e.pts[e.pts.length - 1]); }
    if (ends.length <= 6000) { const grid = new Map(), tol = 0.02; for (const q of ends) { const gx = Math.round(q[0] / tol), gy = Math.round(q[1] / tol); let hit = null; for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) { const o = grid.get((gx + a) + ':' + (gy + b)); if (o && Math.hypot(o[0] - q[0], o[1] - q[1]) <= tol) hit = o; } if (hit) { q[0] = hit[0]; q[1] = hit[1]; } else grid.set(gx + ':' + gy, q.slice()); } }
    return { ents: ents.filter((e) => !((e.type === 'line' || e.type === 'arc') && Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1]) < 1e-6)), unit, w: (x1 - x0) * unit, h: (y1 - y0) * unit };
  }
  // ---------- SVG lesen: Pfade, Rechtecke, Kreise, Ellipsen, Linien und Vielecke werden eine Skizze ----------
  function parseSVG(txt) {
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'), root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
    const ents = [], f = (v) => parseFloat(v) || 0, num = (el, k, d = 0) => (el.hasAttribute(k) ? f(el.getAttribute(k)) : d);
    // Einheit: Breite mit mm/cm/in und viewBox → Millimeter je Einheit, sonst 96 Punkte pro Zoll
    const MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(f), wm = /^\s*([\d.eE+-]+)\s*([a-z%]*)\s*$/.exec(root.getAttribute('width') || '');
    let unit = 25.4 / 96;
    if (wm && MM[wm[2]] != null) unit = vb.length === 4 && vb[2] > 0 ? (f(wm[1]) * MM[wm[2]]) / vb[2] : wm[2] && wm[2] !== 'px' ? MM[wm[2]] : unit;
    // Matrix [a b c d e f] aus dem transform-Attribut
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const tfOf = (str) => {
      let m = [1, 0, 0, 1, 0, 0];
      for (const q of (str || '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
        const a = q[2].trim().split(/[\s,]+/).map(f), rad = (a[0] * Math.PI) / 180;
        let n = [1, 0, 0, 1, 0, 0];
        if (q[1] === 'matrix' && a.length >= 6) n = a.slice(0, 6);
        else if (q[1] === 'translate') n = [1, 0, 0, 1, a[0], a[1] || 0];
        else if (q[1] === 'scale') n = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
        else if (q[1] === 'rotate') { n = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]; if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]); }
        else if (q[1] === 'skewX') n = [1, 0, Math.tan(rad), 1, 0, 0];
        else if (q[1] === 'skewY') n = [1, Math.tan(rad), 0, 1, 0, 0];
        m = mul(m, n);
      }
      return m;
    };
    const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], -(m[1] * p[0] + m[3] * p[1] + m[5])];   // SVG zählt Y nach unten
    // Kreisbogen (SVG-Schreibweise) als kubische Bézier-Stücke
    const arcToBez = (p0, rx, ry, phi, large, sweep, p1) => {
      rx = Math.abs(rx); ry = Math.abs(ry); if (rx < 1e-9 || ry < 1e-9) return { segs: [{ t: 'L', a: p0, b: p1 }] };
      const cp = Math.cos(phi), sp = Math.sin(phi), dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
      const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy, lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const q = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1))) * (large === sweep ? -1 : 1);
      const cx1 = (q * rx * y1) / ry, cy1 = (-q * ry * x1) / rx, cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2, cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry); let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), d = dt / n, k = (4 / 3) * Math.tan(d / 4), out = [];
      const P = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp], D = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
      for (let i = 0; i < n; i++) { const a = t0 + i * d, b = a + d, A = P(a), B = i === n - 1 ? p1 : P(b), da = D(a), db = D(b); out.push({ t: 'C', a: A, c1: [A[0] + k * da[0], A[1] + k * da[1]], c2: [B[0] - k * db[0], B[1] - k * db[1]], b: B }); }
      out[0].a = p0; return { segs: out, mid: P(t0 + dt / 2), circ: Math.abs(rx - ry) < 1e-9 * rx };
    };
    // Pfad-Text → Teilwege aus Linien (L) und Bézier-Stücken (C)
    const pathSubs = (dstr) => {
      const tk = (dstr || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [], subs = [];
      let i = 0, cmd = '', cur = [0, 0], st = [0, 0], sub = null, lc = null, lq = null;
      const n = () => f(tk[i++]), isNum = () => i < tk.length && !/^[A-Za-z]$/.test(tk[i]);
      const seg = (s) => { if (!sub) { sub = { segs: [], closed: false }; subs.push(sub); } sub.segs.push(s); };
      while (i < tk.length) {
        if (!isNum()) cmd = tk[i++]; else if (!cmd) return subs; else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
        const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), o = rel ? cur : [0, 0];
        if (C === 'Z') { if (sub) { if (Math.hypot(cur[0] - st[0], cur[1] - st[1]) > 1e-9) seg({ t: 'L', a: cur, b: st }); sub.closed = true; } cur = st; sub = null; lc = lq = null; continue; }
        if (!isNum()) continue;
        if (C === 'M') { cur = [o[0] + n(), o[1] + n()]; st = cur; sub = null; lc = lq = null; continue; }
        let nx = null, s = null, nc = null, nq = null;
        if (C === 'L') nx = [o[0] + n(), o[1] + n()];
        else if (C === 'H') nx = [(rel ? cur[0] : 0) + n(), cur[1]];
        else if (C === 'V') nx = [cur[0], (rel ? cur[1] : 0) + n()];
        else if (C === 'C') { const c1 = [o[0] + n(), o[1] + n()], c2 = [o[0] + n(), o[1] + n()]; nx = [o[0] + n(), o[1] + n()]; s = { t: 'C', a: cur, c1, c2, b: nx }; nc = c2; }
        else if (C === 'S') { const c1 = lc ? [2 * cur[0] - lc[0], 2 * cur[1] - lc[1]] : cur, c2 = [o[0] + n(), o[1] + n()]; nx = [o[0] + n(), o[1] + n()]; s = { t: 'C', a: cur, c1, c2, b: nx }; nc = c2; }
        else if (C === 'Q' || C === 'T') { const q = C === 'Q' ? [o[0] + n(), o[1] + n()] : lq ? [2 * cur[0] - lq[0], 2 * cur[1] - lq[1]] : cur; nx = [o[0] + n(), o[1] + n()]; s = { t: 'C', a: cur, c1: [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], c2: [nx[0] + (2 / 3) * (q[0] - nx[0]), nx[1] + (2 / 3) * (q[1] - nx[1])], b: nx }; nq = q; }
        else if (C === 'A') { const rx = n(), ry = n(), phi = (n() * Math.PI) / 180, la = n() !== 0, sw = n() !== 0; nx = [o[0] + n(), o[1] + n()]; if (Math.hypot(nx[0] - cur[0], nx[1] - cur[1]) > 1e-9) { const A = arcToBez(cur, rx, ry, phi, la, sw, nx); if (A.circ) seg({ t: 'A', a: cur, m: A.mid, b: nx, bz: A.segs }); else A.segs.forEach(seg); } cur = nx; lc = lq = null; continue; }
        else return subs;
        if (s) seg(s); else if (Math.hypot(nx[0] - cur[0], nx[1] - cur[1]) > 1e-9) seg({ t: 'L', a: cur, b: nx });
        cur = nx; lc = nc; lq = nq;
      }
      return subs;
    };
    const emit = (subs, m) => {
      const bez = (s, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k]); };
      for (const sub of subs) {
        // Stücke in die Zeichnung umrechnen; fast gerade Bézier-Stücke werden Linien
        const sim = Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 && Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-9 * Math.hypot(m[0], m[1]);
        const segs = sub.segs.flatMap((s) => (s.t === 'A' ? (sim ? [s] : s.bz) : [s])).map((s) => (s.t === 'A' ? { t: 'A', a: ap(m, s.a), m: ap(m, s.m), b: ap(m, s.b) } : s.t === 'L' ? { t: 'L', a: ap(m, s.a), b: ap(m, s.b) } : { t: 'C', a: ap(m, s.a), c1: ap(m, s.c1), c2: ap(m, s.c2), b: ap(m, s.b) })).map((s) => {
          if (s.t !== 'C') return s;
          const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy) || 1e-9, off = (q) => Math.abs((q[0] - s.a[0]) * dy - (q[1] - s.a[1]) * dx) / L;
          return off(s.c1) < 1e-4 * L && off(s.c2) < 1e-4 * L ? { t: 'L', a: s.a, b: s.b } : s;
        });
        // glatt aneinanderhängende Kurvenstücke werden eine Spline, Knicke und Linien trennen
        const dirOut = (s) => { const q = Math.hypot(s.b[0] - s.c2[0], s.b[1] - s.c2[1]) > 1e-9 ? s.c2 : s.c1; return Math.atan2(s.b[1] - q[1], s.b[0] - q[0]); };
        const dirIn = (s) => { const q = Math.hypot(s.c1[0] - s.a[0], s.c1[1] - s.a[1]) > 1e-9 ? s.c1 : s.c2; return Math.atan2(q[1] - s.a[1], q[0] - s.a[0]); };
        const smooth = (a, b) => a.t === 'C' && b.t === 'C' && Math.abs(Math.atan2(Math.sin(dirIn(b) - dirOut(a)), Math.cos(dirIn(b) - dirOut(a)))) < 0.05;
        let k = 0; const N = segs.length;
        // Start an einem Knick, damit ein rundum glatter Weg eine geschlossene Spline wird
        let start = 0, allSmooth = sub.closed && N > 1 && segs.every((s, j) => smooth(s, segs[(j + 1) % N]));
        if (sub.closed && !allSmooth) { for (let j = 0; j < N; j++) if (!smooth(segs[(j + N - 1) % N], segs[j])) { start = j; break; } }
        const ord = segs.map((_, j) => segs[(j + start) % N]);
        if (allSmooth) { const pts = []; for (const s of ord) for (let j = 0; j < 8; j++) pts.push(bez(s, j / 8)); ents.push({ type: 'spline', pts, closed: true }); continue; }
        while (k < N) {
          const s = ord[k];
          if (s.t === 'L') { ents.push({ type: 'line', a: s.a.slice(), b: s.b.slice() }); k++; continue; }
          if (s.t === 'A') { ents.push({ type: 'arc', a: s.a.slice(), m: s.m.slice(), b: s.b.slice() }); k++; continue; }
          const pts = [s.a.slice()];
          for (;;) { const c = ord[k]; for (let j = 1; j <= 8; j++) pts.push(bez(c, j / 8)); k++; if (k >= N || !smooth(c, ord[k])) break; }
          ents.push({ type: 'spline', pts, closed: false });
        }
      }
    };
    let texts = 0;
    const walk = (el, m) => {
      const tag = el.nodeName.toLowerCase().replace(/^svg:/, '');
      if (['defs', 'clippath', 'mask', 'pattern', 'symbol', 'marker', 'metadata', 'style', 'title', 'desc'].includes(tag)) return;
      if (el.getAttribute && (el.getAttribute('display') === 'none' || /display\s*:\s*none/.test(el.getAttribute('style') || ''))) return;
      if (el.getAttribute) m = mul(m, tfOf(el.getAttribute('transform')));
      if (tag === 'text') { texts++; return; }
      if (tag === 'path') emit(pathSubs(el.getAttribute('d')), m);
      else if (tag === 'line') emit([{ segs: [{ t: 'L', a: [num(el, 'x1'), num(el, 'y1')], b: [num(el, 'x2'), num(el, 'y2')] }], closed: false }], m);
      else if (tag === 'polyline' || tag === 'polygon') { const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(f); if (v.length >= 4) emit(pathSubs('M' + v.join(' ') + (tag === 'polygon' ? 'Z' : '')), m); }
      else if (tag === 'rect') {
        const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), hh = num(el, 'height');
        let rx = el.hasAttribute('rx') ? num(el, 'rx') : num(el, 'ry'), ry = el.hasAttribute('ry') ? num(el, 'ry') : rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, hh / 2);
        if (w > 0 && hh > 0) emit(pathSubs(rx > 0 && ry > 0 ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + hh - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + hh}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + hh - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + w}V${y + hh}H${x}Z`), m);
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = num(el, 'cx'), cy = num(el, 'cy'), rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx'), ry = tag === 'circle' ? rx : num(el, 'ry');
        const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), ortho = Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-6 * sx * sy;
        if (rx > 0 && ry > 0) {
          if (ortho && Math.abs(rx * sx - ry * sy) < 1e-6 * rx * sx) ents.push({ type: 'circle', c: ap(m, [cx, cy]), r: rx * sx });
          else if (ortho) ents.push({ type: 'ellipse', c: ap(m, [cx, cy]), rx: rx * sx, ry: ry * sy, rot: -Math.atan2(m[1], m[0]) });
          else emit(pathSubs(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`), m);
        }
      }
      for (const c of el.children || []) walk(c, m);
    };
    walk(root, [1, 0, 0, 1, 0, 0]);
    const r = tidyOutline(ents, unit); r.texts = texts; return r;
  }
  // Datei lesen und prüfen; Meldung, wenn nichts Brauchbares darin ist
  async function readOutline(f) {
    const svg = /\.svg$/i.test(f.name), K = svg ? 'SVG' : 'DXF';
    if (f.size > 8e6) { UI.toast(`Die ${K}-Datei ist zu groß (über 8 MB).`, { kind: 'bad' }); return null; }
    let r = null; try { const txt = await f.text(); r = svg ? parseSVG(txt) : parseDXF(txt); } catch (e) { console.warn(e); }
    if (!r) { UI.toast(svg ? 'Diese SVG kann ich nicht lesen – die Datei ist beschädigt oder kein SVG.' : 'Diese DXF kann ich nicht lesen. Speichere sie im anderen Programm als „DXF (ASCII / Text)“ – die binäre Fassung geht nicht.', { kind: 'bad', ms: 8000 }); return null; }
    if (!r.ents.length) { UI.toast(svg ? 'In der SVG habe ich keine Formen gefunden.' + (r.texts ? ' Text muss im Zeichenprogramm zuerst in Pfade umgewandelt werden („Objekt in Pfad“).' : ' Bilder (Fotos) in einer SVG kann ich nicht nachzeichnen.') : 'In der DXF habe ich keine Linien, Kreise oder Bögen gefunden. Liegt die Zeichnung in einem Block? Dann löse ihn im anderen Programm vorher auf („Explode“).', { kind: 'bad', ms: 9000 }); return null; }
    if (r.ents.length > 4000) { UI.toast(`Die ${K} hat ${r.ents.length} Elemente – das ist zu viel für eine Skizze (höchstens 4000).`, { kind: 'bad', ms: 7000 }); return null; }
    return r;
  }
  // Im Skizzen-Modus: Umriss in die offene Skizze legen (Mitte auf dem Nullpunkt der Skizze)
  async function insertOutline(f) {
    const r = await readOutline(f); if (!r) return;
    const n = Sketch.insertEnts(r.ents);
    if (n) UI.toast(`„${f.name}“ in die Skizze eingefügt: ${n} Elemente, ${fmt(r.w)} × ${fmt(r.h)} mm, Mitte auf dem Nullpunkt.` + (r.texts ? ' Text in der SVG fehlt – wandle ihn im Zeichenprogramm vorher in Pfade um.' : '') + ' Passt die Größe nicht? Werkzeug „Auswahl“ → rechts „Breite ändern“.', { icon: 'folder', ms: 8000 });
  }
  async function importDXF(f) {
    const svg = /\.svg$/i.test(f.name), K = svg ? 'SVG' : 'DXF';
    const r = await readOutline(f); if (!r) return;
    const closed = SK.regions(r.ents).length;
    if (!closed) { UI.toast(`Die ${K} hat keine geschlossene Kontur – daraus kann ich keine Platte machen. Prüfe im anderen Programm, ob der Umriss irgendwo eine Lücke hat.`, { kind: 'bad', ms: 9000 }); return; }
    ensureModelMode();
    if (el) newProject(true);
    const name = f.name.replace(/\.(dxf|svg)$/i, '');
    const it = Model.newItem('extrude', {}, { name });
    it.p = { sketch: { plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, ents: r.ents, dims: [], cons: [] }, dist: svg ? 1 : 3, dir: 'normal' };
    App.change(K + ' importiert', (doc) => { doc.items.push(it); });
    App.select([it.id]);
    UI.toast(`„${f.name}“ importiert: ${r.ents.length} Elemente, ${fmt(r.w)} × ${fmt(r.h)} mm` + (!svg && r.unit !== 1 ? ' (in Millimeter umgerechnet)' : '') + `. Die Platte ist ${svg ? 1 : 3} mm dick – die Dicke änderst du rechts unter „Höhe“, den Umriss mit „Skizze bearbeiten“.` + (svg ? ' Stimmt die Größe nicht? „Skizze bearbeiten“ → rechts „Breite ändern“.' : '') + (r.texts ? ' Text in der SVG fehlt – wandle ihn im Zeichenprogramm vorher in Pfade um.' : ''), { icon: 'folder', ms: 9000 });
    setTimeout(() => Viewer.fit([it.id]), 1500);
  }
  async function openBlob(f, opts = {}) {
    if (/\.(dxf|svg)$/i.test(f.name)) {
      if (Sketch.active) {
        if (Sketch.state && Sketch.state.step) {
          UI.toast('Klick zuerst „Zurück zur Skizze“, um die Datei in die Skizze einzufügen.', { icon: 'info', ms: 5000 });
          return;
        }
        return insertOutline(f);
      }
      return importDXF(f);
    }
    if (/\.(step|stp|igs|iges|brep|stl|3mf|obj)$/i.test(f.name)) return importCAD(f);
    try {
      const txt = await f.text(); const doc = JSON.parse(txt);
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || (!Array.isArray(doc.items) && doc.format !== 'masswerk')) {
        throw new Error('Keine Tracery-Projektdatei');
      }
      Model.migrate(doc);
      const vers = Array.isArray(doc.versions) ? doc.versions : null; delete doc.versions;
      const openDocIds = new Set((App.tabs || []).map((t) => t.docId).filter(Boolean));
      if (opts && opts.newTab) {
        if (openDocIds.has(doc.id)) doc.id = uid('p');
      } else if (Store.hasProject(doc.id) && doc.id !== App.doc.id) {
        doc.id = uid('p');
      }
      Store.extractBlobs(doc);
      if (vers) await Versions.importList(doc.id, vers);
      ensureModelMode();
      App.setDoc(doc, opts && opts.newTab ? { newTab: true } : {}); hide();
      App.markClean();
      UI.toast(`„${doc.name}“ geöffnet.`, { icon: 'folder' });
    } catch (e) { const E = ERRORS.importFailed; UI.toast(`${E.titel}. ${E.erklaerung} ${E.loesung}`, { kind: 'bad', ms: 7000 }); console.warn(e); }
  }
  function openFile(opts = {}) {
    const inp = h('input', { type: 'file', accept: '.json,application/json,.step,.stp,.igs,.iges,.brep,.stl,.3mf,.obj,.dxf,.svg', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) openBlob(f, opts); };
    document.body.append(inp); inp.click();
    setTimeout(() => { if (inp.isConnected) inp.remove(); }, 60000);
  }
  // Dateien einfach ins Fenster ziehen (Projektdatei, 3D-Import oder 2D-Skizze)
  const DROP_RE = /\.(json|step|stp|igs|iges|brep|stl|3mf|obj|dxf|svg)$/i;
  let dropEl = null, dragDepth = 0;
  function isFileDrag(e) {
    const dt = e && e.dataTransfer;
    if (!dt) return false;
    const types = dt.types ? [...dt.types] : [];
    if (types.includes('Files')) return true;
    if (dt.files && dt.files.length > 0) return true;
    if (dt.items && [...dt.items].some((it) => it.kind === 'file')) return true;
    return false;
  }
  function ensureDropOverlay() {
    if (dropEl) return dropEl;
    dropEl = h('div', { id: 'drop-overlay', class: 'drop-overlay', hidden: true, 'aria-hidden': 'true' },
      h('div', { class: 'drop-frame' },
        h('div', { class: 'drop-card' },
          h('div', { class: 'drop-ico', html: icon('folder') }),
          h('div', { class: 'drop-title' }),
          h('div', { class: 'drop-sub' }),
        ),
      ),
    );
    document.body.append(dropEl);
    return dropEl;
  }
  function showDropOverlay() {
    const ov = ensureDropOverlay();
    const inSketch = Sketch.active && !(Sketch.state && Sketch.state.step);
    const ico = ov.querySelector('.drop-ico');
    const title = ov.querySelector('.drop-title');
    const sub = ov.querySelector('.drop-sub');
    if (ico) ico.innerHTML = icon(inSketch ? 'sketch' : 'folder');
    if (title) title.textContent = inSketch ? 'DXF oder SVG in diese Skizze einfügen' : 'Datei hier ablegen';
    if (sub) sub.textContent = inSketch
      ? 'Projekt (.json) oder 3D-Import (STEP, IGES, BREP, STL, 3MF, OBJ) öffnet bzw. importiert ebenfalls.'
      : 'Projekt (.json) · 3D-Import (STEP, IGES, BREP, STL, 3MF, OBJ) · 2D-Skizze (DXF, SVG)';
    ov.hidden = false;
    ov.setAttribute('aria-hidden', 'false');
  }
  function hideDropOverlay() {
    dragDepth = 0;
    if (!dropEl) return;
    dropEl.hidden = true;
    dropEl.setAttribute('aria-hidden', 'true');
  }
  async function handleDroppedFiles(files) {
    const supported = [], unsupported = [];
    for (const f of files) {
      if (f && DROP_RE.test(f.name || '')) supported.push(f);
      else if (f && f.name) unsupported.push(f.name);
    }
    if (!supported.length) {
      UI.toast('Dieses Dateiformat kann ich nicht öffnen. Ziehe eine Projektdatei (.json), STEP, IGES, BREP, STL, 3MF, OBJ, DXF oder SVG ins Fenster.', { kind: 'bad', ms: 6000 });
      return;
    }
    const projects = supported.filter((f) => /\.json$/i.test(f.name));
    const others = supported.filter((f) => !/\.json$/i.test(f.name));
    const ordered = projects.length ? [projects[0], ...others] : others;
    for (const f of ordered) await openBlob(f);
    if (unsupported.length) {
      UI.toast(`Übersprungen (nicht unterstützt): ${unsupported.join(', ')}`, { icon: 'info', ms: 5000 });
    }
  }
  function projectFileName() {
    return Print.safeName(App.doc.name) + '.tracery.json';
  }
  async function projectPayload() {
    const vers = Versions.exportList();
    const docOut = await Store.inlineBlobs(App.doc);
    const versOut = [];
    for (const v of vers) versOut.push(v && v.doc ? { ...v, doc: await Store.inlineBlobs(v.doc) } : v);
    return JSON.stringify(versOut.length ? { ...docOut, versions: versOut } : docOut, null, 1);
  }
  async function saveFile() {
    const ok = await Print.save(projectFileName(), await projectPayload());
    if (ok) App.markClean();
  }

  // ---------- Projekt in Ordner speichern & automatisch mitschreiben (BE-14) ----------
  let folder = null;
  let folderDelay = 10000;
  let folderInited = false;
  function folderSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }
  function clearFolderTimer() {
    if (folder && folder.timer) { clearTimeout(folder.timer); folder.timer = null; }
  }
  function updateFolderUI() {
    const btn = $('#btn-folder-status');
    if (!btn) return;
    if (!folder || !folderSupported() || (App.doc && App.doc.id !== folder.docId)) {
      btn.hidden = true;
      btn.innerHTML = '';
      btn.className = 'folder-badge';
      btn.removeAttribute('data-tip');
      return;
    }
    btn.hidden = false;
    btn.className = 'folder-badge ' + folder.status;
    let ico = 'check', label = T('folder.savedLabel', { name: folder.name }), tip = T('folder.savedTip', { name: folder.name, file: folder.fileName });
    if (folder.status === 'saving') {
      ico = 'save';
      label = T('folder.savingLabel', { name: folder.name });
      tip = T('folder.savingTip', { name: folder.name, file: folder.fileName });
    } else if (folder.status === 'pending') {
      ico = 'folder';
      label = T('folder.pendingLabel', { name: folder.name });
      tip = T('folder.pendingTip', { name: folder.name, file: folder.fileName });
    } else if (folder.status === 'error') {
      ico = 'warn';
      label = T('folder.errorLabel', { name: folder.name });
      tip = T('folder.errorTip', { name: folder.name, err: folder.lastErr || T('common.unknown') });
    } else if (folder.lastSavedAt) {
      tip += ` (${new Date(folder.lastSavedAt).toLocaleTimeString('de-DE')})`;
    }
    btn.innerHTML = icon(ico);
    btn.append(h('span', null, label));
    btn.dataset.tip = tip;
  }
  async function writeFolderNow(opts = {}) {
    if (!folder || !folder.handle) return false;
    if (folder.writing) { folder.queued = true; return false; }
    clearFolderTimer();
    const target = folder;
    target.writing = true;
    target.dirty = false;
    target.status = 'saving';
    target.lastErr = null;
    updateFolderUI();
    const fileName = projectFileName();
    const rev = App.revision;
    try {
      const payload = await projectPayload();
      if (typeof target.handle.queryPermission === 'function') {
        const perm = await target.handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'denied') throw new Error('Schreibrecht für den Ordner fehlt.');
      }
      const fh = await target.handle.getFileHandle(fileName, { create: true });
      const wr = await fh.createWritable();
      await wr.write(payload);
      await wr.close();
      if (folder !== target) return true;
      target.fileName = fileName;
      target.lastSavedAt = Date.now();
      target.lastRev = rev;
      target.writing = false;
      target.status = target.queued ? 'pending' : 'saved';
      App.fileSavedRev = rev;
      if (App.revision === rev) App.markClean();
      updateFolderUI();
      if (opts.announce) {
        UI.toast(`Gespeichert in „${target.name}/${fileName}“. Änderungen werden alle 10 s automatisch mitgeschrieben.`, { icon: 'check', ms: 5000 });
      }
      if (target.queued) { target.queued = false; scheduleFolderSave(); }
      return true;
    } catch (e) {
      if (folder !== target) return false;
      target.writing = false;
      target.queued = false;
      target.status = 'error';
      target.lastErr = (e && e.message) || String(e || 'Schreibfehler');
      updateFolderUI();
      UI.toast(`Konnte nicht in „${target.name}“ speichern: ${target.lastErr}`, { kind: 'bad', ms: 6000 });
      return false;
    }
  }
  function scheduleFolderSave() {
    if (!folder) return;
    folder.dirty = true;
    if (folder.writing) { folder.queued = true; return; }
    folder.status = 'pending';
    updateFolderUI();
    if (!folder.timer) {
      folder.timer = setTimeout(() => {
        if (folder) folder.timer = null;
        writeFolderNow();
      }, folderDelay);
    }
  }
  async function saveToFolder() {
    if (!folderSupported()) {
      UI.toast('Dieser Browser kann noch nicht direkt in einen Ordner speichern. Nutze Chrome oder Edge, oder „Als Datei speichern“.', { icon: 'info', ms: 5000 });
      return false;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return false;
      UI.toast('Ordner konnte nicht gewählt werden: ' + ((e && e.message) || 'unbekannter Fehler'), { kind: 'bad' });
      return false;
    }
    if (!handle) return false;
    clearFolderTimer();
    const name = String(handle.name || 'Ordner').trim() || 'Ordner';
    folder = { handle, name, docId: App.doc.id, fileName: projectFileName(), lastSavedAt: 0, lastRev: App.revision, status: 'saving', writing: false, queued: false, dirty: false, timer: null, lastErr: null };
    updateFolderUI();
    const ok = await writeFolderNow({ announce: true });
    if (!ok) { folder = null; updateFolderUI(); return false; }
    try { Panels.firstStepDone('saved'); } catch (_) {}
    return true;
  }
  function saveToFolderNow() {
    if (!folder) return saveToFolder();
    return writeFolderNow({ announce: true });
  }
  function disconnectFolder(silent) {
    if (!folder) return;
    const name = folder.name;
    clearFolderTimer();
    folder = null;
    updateFolderUI();
    if (!silent) UI.toast(`Ordner-Verbindung zu „${name}“ getrennt.`, { icon: 'info' });
  }
  function openFolderMenu(anchor) {
    if (!folder) return;
    UI.menu(anchor, [
      { label: T('menu.folder.saveNow'), icon: 'save', id: 'fm-now', run: () => saveToFolderNow() },
      { label: T('menu.folder.changeFolder'), icon: 'folder', id: 'fm-change', run: () => saveToFolder() },
      '-',
      { label: T('menu.folder.disconnect'), icon: 'close', id: 'fm-stop', run: () => disconnectFolder() },
    ], { alignRight: true });
  }
  function folderInfo() {
    if (!folder) return null;
    return { name: folder.name, fileName: folder.fileName, status: folder.status, lastSavedAt: folder.lastSavedAt, dirty: folder.dirty, lastErr: folder.lastErr };
  }
  // ---------- Import prüfen & heilen (IO-10) ----------
  const importChecks = new Map();
  let checkBarEl = null, checkBarItemId = null;

  function importParamFor(it) {
    const V = Model.vars(App.doc).v;
    const scale = Model.num ? Model.num(it.p.scale, V, 1) : (Number(it.p.scale) || 1);
    const p = { fmt: it.p.fmt, scale };
    if (it.p.blobId) p.blobId = it.p.blobId;
    else if (it.p.data) p.data = it.p.data;
    if (it.p.stepEntity != null) p.stepEntity = it.p.stepEntity;
    if (Array.isArray(it.p.stepMat) && it.p.stepMat.length === 16) p.stepMat = it.p.stepMat;
    return p;
  }

  function issueSummaryText(rep) {
    if (!rep) return '';
    const parts = [];
    if (rep.openEdges > 0) parts.push(`${rep.openEdges} ${rep.openEdges === 1 ? 'offene Kante' : 'offene Kanten'}`);
    if (rep.gaps > 0) parts.push(`${rep.gaps} ${rep.gaps === 1 ? 'Lücke' : 'Lücken'}`);
    if (rep.invertedFaces > 0) parts.push(`${rep.invertedFaces} falsch herum liegende ${rep.invertedFaces === 1 ? 'Fläche' : 'Flächen'}`);
    if (!rep.brepValid || rep.invalidCount > 0) parts.push(`${Math.max(1, rep.invalidCount || 0)} Geometriefehler (BRepCheck)`);
    if (rep.multipleEdges > 0) parts.push(`${rep.multipleEdges} Mehrfachkanten`);
    if (rep.degenerated > 0) parts.push(`${rep.degenerated} entartete Kanten`);
    if (!parts.length && rep.openShell) parts.push('nicht geschlossene Hülle');
    return parts.join(' · ') || 'Geometrie prüfen';
  }

  function healDiffSummary(before, after, tol, cappedFaces) {
    const diffs = [];
    if (before.openEdges !== after.openEdges || before.openEdges > 0 || after.openEdges > 0) diffs.push(`Offene Kanten ${before.openEdges} → ${after.openEdges}`);
    if (before.gaps !== after.gaps || before.gaps > 0 || after.gaps > 0) diffs.push(`Lücken ${before.gaps} → ${after.gaps}`);
    if (before.invertedFaces !== after.invertedFaces || before.invertedFaces > 0 || after.invertedFaces > 0) diffs.push(`Falsche Flächen ${before.invertedFaces} → ${after.invertedFaces}`);
    if (before.invalidCount !== after.invalidCount || !before.brepValid || !after.brepValid) diffs.push(`BRepCheck-Fehler ${before.invalidCount} → ${after.invalidCount}`);
    const bodyTxt = before.solids === 0 && after.solids > 0 ? ' · geschlossener Körper' : '';
    const capTxt = cappedFaces > 0 ? ` (+${cappedFaces} ${cappedFaces === 1 ? 'Fläche' : 'Flächen'})` : '';
    const tolTxt = fmtFixed(tol, 3);
    if (!after.hasIssues) return `Geheilt (Toleranz ${tolTxt} mm): ${diffs.join(' · ')}${bodyTxt}${capTxt}.`;
    return `Heilen abgeschlossen (Toleranz ${tolTxt} mm): ${diffs.join(' · ')}${capTxt} – noch offen: ${issueSummaryText(after)}. Versuch eine größere Toleranz.`;
  }

  function dismissImportBanner() {
    if (checkBarEl) { checkBarEl.remove(); checkBarEl = null; }
    checkBarItemId = null;
  }

  function renderImportBanner() {
    if (checkBarEl) { checkBarEl.remove(); checkBarEl = null; }
    if (!checkBarItemId) return;
    const f = Model.find(App.doc, checkBarItemId);
    const st = importChecks.get(checkBarItemId);
    if (!f || !f.item || !st || !st.report || !st.report.hasIssues) { checkBarItemId = null; return; }
    const host = $('#overlay') || $('#center') || document.body;
    const bar = h('div', { id: 'import-check-bar', class: 'import-bar', role: 'status', 'aria-live': 'polite' });
    const ic = h('div', { class: 'ib-ic' }); ic.innerHTML = icon('warn');
    const txt = h('div', { class: 'ib-txt' },
      h('b', null, T('imp.bannerTitle', { name: Model.label(f.item) })),
      h('span', null, issueSummaryText(st.report)));
    const healBtn = h('button', { type: 'button', id: 'import-bar-heal', class: 'btn warn-act small', 'data-help': 'importHeal', disabled: !!st.checking, onclick: () => healImport(checkBarItemId) }, st.checking ? T('imp.bannerHealing') : T('panel.imp.heal'));
    const closeBtn = h('button', { type: 'button', id: 'import-bar-close', class: 'btn ghost small', 'aria-label': T('common.close'), onclick: () => dismissImportBanner() }, '×');
    bar.append(ic, txt, healBtn, closeBtn);
    host.append(bar);
    checkBarEl = bar;
  }

  function importCheckOf(id) {
    return importChecks.get(id) || null;
  }

  function setImportHealOpts(id, patch) {
    const prev = importChecks.get(id) || { checking: false, report: null, lastHeal: null, tol: 0.1, capOpen: true };
    const next = { ...prev };
    if (patch && patch.tol != null && Number.isFinite(Number(patch.tol))) next.tol = Math.max(0.001, Math.min(10, Number(patch.tol)));
    if (patch && patch.capOpen !== undefined) next.capOpen = !!patch.capOpen;
    importChecks.set(id, next);
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
  }

  async function checkImport(id, opts = {}) {
    const f0 = Model.find(App.doc, id);
    if (!f0 || !f0.item || f0.item.kind !== 'import') return null;
    const it0 = f0.item;
    const startBlobId = it0.p.blobId || null;
    const prev = importChecks.get(id) || {};
    importChecks.set(id, {
      blobId: startBlobId,
      checking: true,
      report: prev.report || null,
      error: null,
      lastHeal: prev.lastHeal || (it0.p && it0.p.healed) || null,
      tol: prev.tol != null ? prev.tol : 0.1,
      capOpen: prev.capOpen !== undefined ? prev.capOpen : true,
    });
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
    try {
      if (!Kernel.ready) await Kernel.ensure();
      if (startBlobId && !Store.getBlobSync(startBlobId)) await Store.getBlob(startBlobId);
      const fNow = Model.find(App.doc, id);
      if (!fNow || !fNow.item || fNow.item.kind !== 'import') return null;
      const res = await Kernel.call('checkImport', { p: importParamFor(fNow.item), gapTol: opts.gapTol || 0.5 });
      const fAfter = Model.find(App.doc, id);
      if (!fAfter || !fAfter.item || (fAfter.item.p.blobId || null) !== startBlobId) return null;
      const curPrev = importChecks.get(id) || {};
      importChecks.set(id, {
        blobId: startBlobId,
        checking: false,
        report: res && res.ok ? res : null,
        error: res && !res.ok ? res.error : null,
        lastHeal: curPrev.lastHeal || (fAfter.item.p && fAfter.item.p.healed) || null,
        tol: curPrev.tol != null ? curPrev.tol : 0.1,
        capOpen: curPrev.capOpen !== undefined ? curPrev.capOpen : true,
      });
      if (res && res.ok && res.hasIssues && !opts.silent) {
        checkBarItemId = id;
        renderImportBanner();
      } else if (res && res.ok && !res.hasIssues && checkBarItemId === id) {
        dismissImportBanner();
      }
      if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
      return res;
    } catch (e) {
      const curPrev = importChecks.get(id) || {};
      importChecks.set(id, { ...curPrev, checking: false, error: (e && e.message) || 'Prüfung fehlgeschlagen' });
      if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
      return null;
    }
  }

  async function checkImportedList(ids) {
    let shown = false;
    for (const id of ids) {
      const res = await checkImport(id, { silent: shown });
      if (res && res.ok && res.hasIssues) shown = true;
    }
  }

  async function healImport(id, opts = {}) {
    const f0 = Model.find(App.doc, id);
    if (!f0 || !f0.item || f0.item.kind !== 'import') return null;
    const prev = importChecks.get(id) || {};
    const tol = opts.tol != null ? Math.max(0.001, Math.min(10, Number(opts.tol))) : (prev.tol != null ? prev.tol : 0.1);
    const capOpen = opts.capOpen !== undefined ? !!opts.capOpen : (prev.capOpen !== undefined ? prev.capOpen : true);
    importChecks.set(id, { ...prev, checking: true, tol, capOpen });
    if (checkBarItemId === id) renderImportBanner();
    if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
    try {
      if (!Kernel.ready) await Kernel.ensure();
      if (f0.item.p.blobId && !Store.getBlobSync(f0.item.p.blobId)) await Store.getBlob(f0.item.p.blobId);
      const res = await Kernel.call('healImport', { p: importParamFor(f0.item), tol, capOpen });
      if (!res || !res.ok || !res.brepBytes || !res.brepBytes.byteLength) {
        importChecks.set(id, { ...prev, checking: false, tol, capOpen });
        if (checkBarItemId === id) renderImportBanner();
        if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
        UI.toast('Das Teil ließ sich nicht heilen: ' + ((res && res.error) || 'unbekannter Fehler'), { kind: 'bad', ms: 6000 });
        return res;
      }
      const newBlobId = await Store.putBlob(new Uint8Array(res.brepBytes));
      const healedMeta = {
        tol: res.tol,
        cappedFaces: res.cappedFaces || 0,
        before: { openEdges: res.before.openEdges, gaps: res.before.gaps, invertedFaces: res.before.invertedFaces, invalidCount: res.before.invalidCount, brepValid: res.before.brepValid, solids: res.before.solids, faces: res.before.faces },
        after: { openEdges: res.after.openEdges, gaps: res.after.gaps, invertedFaces: res.after.invertedFaces, invalidCount: res.after.invalidCount, brepValid: res.after.brepValid, solids: res.after.solids, faces: res.after.faces },
      };
      App.change('Import geheilt', (doc) => {
        const f = Model.find(doc, id);
        if (!f || !f.item || f.item.kind !== 'import') return false;
        f.item.p.fmt = 'brep';
        f.item.p.blobId = newBlobId;
        f.item.p.size = res.brepBytes.byteLength;
        f.item.p.scale = 1;
        delete f.item.p.data;
        delete f.item.p.stepEntity;
        delete f.item.p.stepMat;
        f.item.p.healed = healedMeta;
      });
      importChecks.set(id, {
        blobId: newBlobId,
        checking: false,
        report: res.after,
        error: null,
        lastHeal: { ...healedMeta, improved: res.improved },
        tol: res.tol,
        capOpen,
      });
      if (res.after && !res.after.hasIssues) dismissImportBanner();
      else { checkBarItemId = id; renderImportBanner(); }
      UI.toast(healDiffSummary(res.before, res.after, res.tol, res.cappedFaces || 0), { icon: res.after.hasIssues ? 'warn' : 'check', ms: 7000 });
      if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
      return res;
    } catch (e) {
      importChecks.set(id, { ...prev, checking: false, tol, capOpen });
      if (checkBarItemId === id) renderImportBanner();
      if (typeof Panels !== 'undefined' && Panels.renderRight) Panels.renderRight();
      UI.toast('Beim Heilen ist ein Fehler passiert: ' + ((e && e.message) || 'unbekannter Fehler'), { kind: 'bad', ms: 6000 });
      return null;
    }
  }

  function syncImportChecks() {
    for (const [id, st] of [...importChecks.entries()]) {
      const f = Model.find(App.doc, id);
      if (!f || !f.item || f.item.kind !== 'import' || (st.blobId && f.item.p.blobId !== st.blobId)) {
        importChecks.delete(id);
        if (checkBarItemId === id) dismissImportBanner();
      }
    }
    if (checkBarItemId && !importChecks.has(checkBarItemId)) dismissImportBanner();
  }

  function renderTabs() {
    const list = $('#proj-tabs-list');
    if (!list) return;
    list.innerHTML = '';
    const allTabs = App.tabs || [];
    for (const t of allTabs) {
      const tab = h('div', {
        class: 'proj-tab' + (t.active ? ' active' : '') + (t.dirty ? ' dirty' : ''),
        role: 'tab',
        tabindex: '0',
        'aria-selected': String(!!t.active),
        dataset: { tabId: t.tabId, docId: t.docId || '' },
      });
      const dot = h('span', { class: 'ptab-dot', 'aria-hidden': 'true' });
      const tip = t.name + (t.dirty ? ' (ungespeicherte Änderungen)' : '');
      const nameEl = h('span', { class: 'ptab-name', 'data-tip': tip }, t.name);
      const closeBtn = h('button', {
        type: 'button',
        class: 'ptab-close',
        'aria-label': T('tabs.closeAria', { name: t.name }),
        'data-tip': T('tabs.closeTip'),
      });
      closeBtn.innerHTML = icon('close');
      closeBtn.onclick = (e) => { e.stopPropagation(); App.closeTab(t.tabId); };
      tab.onclick = () => { App.switchTab(t.tabId); };
      tab.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); App.closeTab(t.tabId); } };
      tab.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.switchTab(t.tabId); } };
      nameEl.ondblclick = async (e) => {
        e.stopPropagation();
        if (!t.active) App.switchTab(t.tabId);
        const n = await UI.prompt(T('tabs.rename'), T('common.name'), App.doc.name, T('common.rename'));
        if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); });
      };
      tab.oncontextmenu = (e) => {
        e.preventDefault();
        const menuItems = [
          {
            label: T('tabs.rename'),
            icon: 'edit',
            run: async () => {
              if (!t.active) App.switchTab(t.tabId);
              const n = await UI.prompt(T('tabs.rename'), T('common.name'), App.doc.name, T('common.rename'));
              if (n && n.trim()) App.change('Projekt umbenannt', (doc) => { doc.name = n.trim(); });
            },
          },
          { label: T('tabs.closeTip'), icon: 'close', run: () => App.closeTab(t.tabId) },
        ];
        if ((App.tabs || []).length > 1) {
          menuItems.push({
            label: T('tabs.closeOthers'),
            icon: 'close',
            run: async () => {
              for (const ot of (App.tabs || [])) {
                if (ot.tabId !== t.tabId) await App.closeTab(ot.tabId);
              }
            },
          });
        }
        UI.menu(tab, menuItems);
      };
      tab.append(dot, nameEl, closeBtn);
      list.append(tab);
    }
    const act = list.querySelector('.proj-tab.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function openTabAddMenu(anchor) {
    const openIds = new Set((App.tabs || []).map((t) => t.docId).filter(Boolean));
    const items = [
      { id: 'tab-add-empty', label: T('tabs.newEmpty'), icon: 'newfile', run: () => openNewTab() },
      { id: 'tab-add-tpl', label: T('tabs.newTemplate'), icon: 'cube', run: () => newProjectDialog({ newTab: true }) },
      { id: 'tab-add-file', label: T('tabs.openFile'), icon: 'folder', run: () => openFile({ newTab: true }) },
    ];
    const recent = App.recentProjects().filter((r) => r.n > 0).slice(0, 8);
    if (recent.length) {
      items.push('-');
      recent.forEach((r, i) => {
        const suffix = openIds.has(r.id) ? ` (${T('tabs.alreadyOpen')})` : '';
        items.push({
          id: 'tab-add-recent-' + i,
          label: r.name + suffix,
          icon: 'box3',
          run: () => openStoredInTab(r.id),
        });
      });
    }
    UI.menu(anchor, items);
  }

  function init() {
    if (folderInited) return;
    folderInited = true;
    const addTabBtn = $('#proj-tab-add');
    if (addTabBtn) {
      addTabBtn.innerHTML = icon('plus');
      addTabBtn.onclick = (e) => openTabAddMenu(e.currentTarget);
    }
    App.on('tabs', renderTabs);
    App.on('doc', renderTabs);
    App.on('clean', renderTabs);
    App.on('dirty', renderTabs);
    renderTabs();
    App.on('docLoaded', ({ doc, opts }) => {
      if (!recTracking || (opts && opts.fromBoot)) return;
      clearTimeout(recTimer); recTimer = null;
      if (opts && opts.isSwitch) {
        if (App.dirty) scheduleRecoverySave();
        else {
          recBaseDoc = isEmptyDoc(doc) ? null : deepClone(doc);
          if (!App.anyDirty) Store.clearRecovery();
        }
        return;
      }
      recBaseDoc = isEmptyDoc(doc) ? null : deepClone(doc);
      if (opts && opts.fromRecovery) return;
      if (recPending) { recPending = null; hideRecoveryBanner(); }
      if (!App.anyDirty || (opts && opts.forceReplace)) Store.clearRecovery();
    });
    App.on('dirty', () => {
      if (!recTracking) return;
      if (recPending) { recPending = null; hideRecoveryBanner(); }
      scheduleRecoverySave();
    });
    App.on('clean', () => {
      if (!recTracking) return;
      clearTimeout(recTimer); recTimer = null;
      recBaseDoc = isEmptyDoc(App.doc) ? null : deepClone(App.doc);
      if (recPending) { recPending = null; hideRecoveryBanner(); }
      if (!App.anyDirty) Store.clearRecovery();
      try { App.autosave.flush(); } catch (_) {}
    });
    window.addEventListener('pagehide', () => { flushRecovery(); });
    App.on('doc', () => {
      syncImportChecks();
      if (!folder) return;
      const hasFolderTab = (App.tabs || []).some((t) => t.docId === folder.docId);
      if (!hasFolderTab) { disconnectFolder(true); return; }
      if (App.doc.id !== folder.docId) { updateFolderUI(); return; }
      if (App.revision === folder.lastRev) return;
      folder.lastRev = App.revision;
      scheduleFolderSave();
    });
    Versions.on('change', () => {
      if (folder && App.doc.id === folder.docId) scheduleFolderSave();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && folder && folder.dirty && !folder.writing) writeFolderNow();
    });
    const btn = $('#btn-folder-status');
    if (btn) btn.onclick = (e) => openFolderMenu(e.currentTarget);
    updateFolderUI();
    window.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      dragDepth++;
      showDropOverlay();
    });
    window.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {}
      if (dragDepth <= 0) dragDepth = 1;
      showDropOverlay();
    });
    window.addEventListener('dragleave', (e) => {
      if (dragDepth <= 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight))) {
        hideDropOverlay();
      }
    });
    window.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      hideDropOverlay();
      const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      if (files.length) handleDroppedFiles(files);
    });
    window.addEventListener('dragend', () => { if (dragDepth > 0 || (dropEl && !dropEl.hidden)) hideDropOverlay(); });
    window.addEventListener('blur', () => { if (dragDepth > 0 || (dropEl && !dropEl.hidden)) hideDropOverlay(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dropEl && !dropEl.hidden) hideDropOverlay(); });
  }
  return {
    init, importCAD, parseSTEP, import3MF, parse3MF, importOBJ, parseOBJ, importDXF, parseDXF, parseSVG, show, hide, newProject, openNewTab, openStoredInTab, renderTabs, openTabAddMenu, newProjectDialog, saveAsTemplate, openTemplate, openFile, openBlob, saveFile,
    checkImport, healImport, importCheckOf, setImportHealOpts, dismissImportBanner,
    folderSupported, folderInfo, saveToFolder, saveToFolderNow, disconnectFolder,
    checkRecoveryOnBoot, startRecoveryTracking, restoreRecovery, dismissRecovery, flushRecovery,
    get pendingRecovery() { return recPending; },
    get folderDelay() { return folderDelay; }, set folderDelay(ms) { folderDelay = Math.max(0, Number(ms) || 10000); },
    openDrone, get open() { return !!el; },
  };
})();

// ---------- Einführung ----------
const Tour = (() => {
  let box = null, ring = null, idx = 0, off = [];
  const BASICS = [
    { title: 'Willkommen bei Tracery', text: 'In drei Minuten baust du ein Teil mit Loch und exportierst es. Links siehst du den Verlauf, rechts die Eigenschaften, in der Mitte dein Modell.', target: null },
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
  let timer = null, advTimer = null, advFor = null;
  function start(name = 'basics') { stop(); STEPS = TOURS[name] || BASICS; idx = 0; show(); off.push(App.on('history', check), App.on('doc', check), App.on('mode', check), App.on('sketch', check), App.on('pop', check)); timer = setInterval(() => { place(); check(); }, 120); }
  function stop() { clearTimeout(advTimer); advTimer = null; advFor = null; if (box) box.remove(); if (ring) ring.remove(); box = ring = null; off.forEach((f) => f()); off = []; clearInterval(timer); timer = null; }
  function check() {
    const s = STEPS[idx]; if (!s || !s.until) return;
    const last = App.undoStack[App.undoStack.length - 1];
    const ev = last && /Größe|Maß/.test(last.label) ? 'size' : null;
    if (advFor === s) return;
    if (s.until(ev)) {
      advFor = s;
      advTimer = setTimeout(() => {
        advTimer = null; advFor = null;
        if (STEPS[idx] === s) { idx++; show(); }
      }, 220);
    }
  }
  function show() {
    clearTimeout(advTimer); advTimer = null; advFor = null;
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

