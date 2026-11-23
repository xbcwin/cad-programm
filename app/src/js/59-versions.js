// ================= Versionen: Stände speichern, vergleichen, zurückholen =================
// Versionen liegen außerhalb des Projekts in der Browser-Datenbank (sonst würde jeder Rückgängig-Schritt
// alle Versionen mitschleppen). Beim Speichern als Datei kommen sie mit in die Datei.
const Versions = (() => {
  function list(id = App.doc.id) { return Store.getVersionsSync(id); }
  function store(arr, id = App.doc.id) { return Store.setVersions(id, arr); }
  function snapshotDoc() { Store.extractBlobs(App.doc); const d = JSON.parse(App.snapshot()); delete d.versions; return d; }
  function save(name) {
    const arr = list();
    const v = { id: uid('v'), name: (name || '').trim() || 'Version ' + (arr.length + 1), t: Date.now(), doc: snapshotDoc() };
    arr.push(v);
    const p = store(arr);
    if (p && typeof p.then === 'function') {
      p.then((ok) => {
        if (!ok) {
          store(list().filter((x) => x.id !== v.id));
          UI.toast('Die Version konnte nicht im Browser-Speicher gesichert werden.', { kind: 'bad', ms: 6000 });
          ev.emit('change');
        }
      });
    } else if (!p) {
      UI.toast('Die Version passt nicht mehr in den Browser-Speicher. Lösche ältere Versionen oder speichere das Projekt als Datei.', { kind: 'bad', ms: 6000 });
      arr.pop();
      return null;
    }
    UI.toast(`„${v.name}“ gespeichert.`, { icon: 'check' });
    ev.emit('change');
    return v;
  }
  function remove(vid) { store(list().filter((v) => v.id !== vid)); ev.emit('change'); }
  function rename(vid, name) { const arr = list(); const v = arr.find((x) => x.id === vid); if (v && name.trim()) { v.name = name.trim(); store(arr); ev.emit('change'); } }
  // Zurückholen ist ein normaler Schritt – Rückgängig bringt den Stand von eben zurück
  async function restore(vid) {
    const v = list().find((x) => x.id === vid); if (!v) return;
    compareOff();
    await Store.hydrateDoc(v.doc);
    App.change(`Version „${v.name}“ zurückgeholt`, (doc) => {
      const keep = { id: doc.id, name: doc.name, created: doc.created };
      const src = JSON.parse(JSON.stringify(v.doc));
      for (const k of Object.keys(doc)) delete doc[k];
      Object.assign(doc, src, keep);
      Model.migrate(doc);
    });
    App.clearSelection();
    UI.toast(`„${v.name}“ zurückgeholt. Strg/Cmd+Z macht das wieder rückgängig.`, { icon: 'rollback', ms: 4500 });
  }
  // Dateien: Versionen mitnehmen und wieder einlesen
  function exportList() { return list(); }
  function importList(id, arr) { if (Array.isArray(arr) && arr.length) return store(arr.filter((v) => v && v.doc && v.doc.format === 'masswerk'), id); return Promise.resolve(true); }

  // ---------- Unterschiede ----------
  const ev = makeEmitter();
  function allItems(doc) { const m = new Map(); Model.walk(doc.items, (it) => { m.set(it.id, it); }); return m; }
  function diff(oldDoc, newDoc) {
    const out = { params: [], added: [], removed: [], changed: [] };
    const po = new Map((oldDoc.params || []).map((p) => [p.name, p])), pn = new Map((newDoc.params || []).map((p) => [p.name, p]));
    for (const [n, p] of pn) { const o = po.get(n); if (!o) out.params.push({ name: n, from: null, to: p.expr }); else if (String(o.expr) !== String(p.expr)) out.params.push({ name: n, from: o.expr, to: p.expr }); }
    for (const [n, o] of po) if (!pn.has(n)) out.params.push({ name: n, from: o.expr, to: null });
    const io = allItems(oldDoc), inew = allItems(newDoc);
    for (const [id, it] of inew) {
      const o = io.get(id);
      if (!o) { out.added.push(Model.label(it)); continue; }
      const what = [];
      if (JSON.stringify(o.p) !== JSON.stringify(it.p)) what.push('Maße');
      if (JSON.stringify(o.t) !== JSON.stringify(it.t)) what.push('Lage');
      if (o.role !== it.role) what.push(it.role === 'hole' ? 'jetzt Loch' : 'jetzt Körper');
      if (JSON.stringify(o.finishes || []) !== JSON.stringify(it.finishes || [])) what.push('Kanten');
      if ((o.mat || '') !== (it.mat || '')) what.push('Material');
      if (!!o.suppressed !== !!it.suppressed) what.push(it.suppressed ? 'unterdrückt' : 'wieder aktiv');
      if (!!o.hidden !== !!it.hidden) what.push(it.hidden ? 'ausgeblendet' : 'eingeblendet');
      if (o.color !== it.color) what.push('Farbe');
      if ((o.name || '') !== (it.name || '')) what.push('Name');
      if (what.length) out.changed.push({ name: Model.label(it), what });
    }
    for (const [id, o] of io) if (!inew.has(id)) out.removed.push(Model.label(o));
    return out;
  }

  // ---------- Vergleich im Bild ----------
  let cmp = null;   // { v, bar }
  async function compare(vid) {
    const v = list().find((x) => x.id === vid); if (!v) return;
    compareOff();
    const old = JSON.parse(JSON.stringify(v.doc)); Model.migrate(old);
    await Store.hydrateDoc(old);
    const d = diff(old, App.doc);
    const bar = h('div', { class: 'viewbar cmpbar', role: 'region', 'aria-label': 'Vergleich' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, 'Vergleich'));
    const close = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Vergleich beenden' }); close.innerHTML = icon('close'); close.onclick = () => compareOff();
    head.append(close);
    const leg = h('div', { class: 'vb-hint', html: `Rot gestrichelt: <b>${esc(v.name)}</b> (${new Date(v.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}). Farbig: jetzt.` });
    const list2 = h('ul', { class: 'cmp-list' });
    const li = (t) => list2.append(h('li', { html: t }));
    for (const p of d.params) li(p.from == null ? `Maß <b>${esc(p.name)}</b> neu: ${esc(String(p.to))}` : p.to == null ? `Maß <b>${esc(p.name)}</b> entfernt` : `Maß <b>${esc(p.name)}</b>: ${esc(String(p.from))} → ${esc(String(p.to))}`);
    for (const n of d.added) li(`<b>${esc(n)}</b> hinzugekommen`);
    for (const n of d.removed) li(`<b>${esc(n)}</b> entfernt`);
    for (const c of d.changed) li(`<b>${esc(c.name)}</b>: ${c.what.join(', ')}`);
    if (!list2.children.length) li('Keine Unterschiede.');
    const wt = h('div', { class: 'vb-hint', id: 'cmp-weight' }, 'Gewicht wird berechnet …');
    const show = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'cmp-show', checked: true }), 'Alten Stand im Bild zeigen');
    show.querySelector('input').onchange = (e) => Viewer.setCompare(e.target.checked && cmp ? cmp.nodes : null);
    bar.append(head, leg, list2, wt, show);
    Views.bars().append(bar);
    cmp = { v, bar, diff: d, nodes: null };
    // Gewicht vorher / nachher
    Promise.all([Mass.measureDoc(old), Mass.measure()]).then(([a, b]) => {
      if (!cmp || cmp.bar !== bar) return;
      if (!a || !b) { wt.textContent = ''; return; }
      const dg = b.mass - a.mass;
      wt.innerHTML = `Gewicht: ${Mass.gText(a.mass)} → <b>${Mass.gText(b.mass)}</b> (${dg >= 0 ? '+' : '−'}${Mass.gText(Math.abs(dg))})`;
    });
    // Form des alten Stands als Umriss
    try {
      const res = await Kernel.call('evaluate', { scene: Model.kernelScene(old), known: {} });
      if (!cmp || cmp.bar !== bar) return;
      const tops = new Map(old.items.map((it) => [it.id, it]));
      cmp.nodes = res.nodes.filter((n) => !n.empty && tops.has(n.id) && tops.get(n.id).role !== 'hole').map((n) => ({ id: n.id, data: n, matrix: Model.localMatrix(tops.get(n.id)) }));
      Viewer.setCompare(cmp.nodes);
    } catch (_) {}
    ev.emit('compare');
  }
  function compareOff() { if (!cmp) return; cmp.bar.remove(); cmp = null; Viewer.setCompare(null); ev.emit('compare'); }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Fenster ----------
  function dialog() {
    const body = h('div', { class: 'versions', style: { display: 'grid', gap: '12px', minWidth: 'min(460px, 82vw)' } });
    const draw = () => {
      body.innerHTML = '';
      const row = h('div', { class: 'btn-row' });
      const sv = h('button', { type: 'button', class: 'btn primary', id: 'ver-save' }); sv.innerHTML = icon('save') + 'Jetzigen Stand als Version speichern';
      sv.onclick = async () => { const n = await UI.prompt('Version speichern', 'Name der Version', 'Version ' + (list().length + 1), 'Speichern'); if (n != null) { save(n); draw(); } };
      row.append(sv); body.append(row);
      const arr = list().slice().reverse();
      if (!arr.length) { body.append(h('div', { class: 'hint-box', html: 'Noch keine Versionen. Speichere einen Stand, bevor du etwas ausprobierst – dann kannst du später vergleichen oder zurück.' })); return; }
      const ul = h('div', { class: 'mini-list' });
      for (const v of arr) {
        const r = h('div', { class: 'mini-row ver-row', 'data-vid': v.id });
        const nm = h('span', { class: 'grow' }, h('b', null, v.name), h('small', { style: { display: 'block', color: 'var(--muted)' } }, new Date(v.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })));
        const bc = h('button', { type: 'button', class: 'btn small ver-cmp' }, 'Vergleichen'); bc.onclick = () => { m.close(); compare(v.id); };
        const br = h('button', { type: 'button', class: 'btn small ver-restore' }, 'Zurückholen'); br.onclick = async () => { if (await UI.confirm('Version zurückholen?', `Das Projekt wird auf „${v.name}“ gesetzt. Mit Rückgängig kommst du wieder hierher.`, 'Zurückholen')) { m.close(); restore(v.id); } };
        const bd = h('button', { type: 'button', class: 'btn ghost small ver-del', 'aria-label': 'Version löschen', 'data-tip': 'Version löschen' }); bd.innerHTML = icon('trash'); bd.onclick = async () => { if (await UI.confirm('Version löschen?', `„${v.name}“ wird gelöscht.`, 'Löschen', true)) { remove(v.id); draw(); } };
        r.append(nm, bc, br, bd); ul.append(r);
      }
      body.append(ul);
    };
    draw();
    const m = UI.modal({ title: 'Versionen', body, actions: [{ label: 'Schließen', primary: true }] });
  }
  function init() { App.on('doc', () => { if (cmp && !App.doc) compareOff(); if (App.doc && App.doc.id) Store.loadVersions(App.doc.id).then(() => ev.emit('change')).catch(() => {}); }); }
  return { init, list, save, remove, rename, restore, compare, compareOff, diff, dialog, exportList, importList, on: ev.on, get comparing() { return cmp ? { name: cmp.v.name, diff: cmp.diff, shown: !!(cmp.nodes && cmp.nodes.length) } : null; } };
})();
