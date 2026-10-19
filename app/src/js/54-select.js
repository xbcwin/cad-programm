// ================= Auswahl: Filter und „Ähnliche auswählen“ =================
const Select = (() => {
  let filter = 'all';   // all · body · face · edge
  const NAMES = { all: 'Alles', body: 'Nur Körper', face: 'Nur Flächen', edge: 'Nur Kanten' };
  const ev = makeEmitter();
  function setFilter(f) {
    filter = NAMES[f] ? f : 'all';
    const b = document.querySelector('.view-btns [data-view="filter"]');
    if (b) { b.classList.toggle('on', filter !== 'all'); b.dataset.tip = 'Wählen: ' + NAMES[filter]; }
    if (filter === 'body' && (App.face || App.edges.length)) App.select(App.sel);
    if (filter === 'edge' && App.face) App.select(App.sel);
    if (filter === 'face' && App.edges.length) App.select(App.sel);
    ev.emit('change', filter);
  }
  // Optionen für Viewer.pick je nach Filter
  function pickOpts() { return filter === 'body' || filter === 'face' ? { noEdges: true } : filter === 'edge' ? { edgePx: 9 } : {}; }
  // Treffer passend zum Filter umbauen; null = Klick ignorieren
  function adjust(hit) {
    if (!hit) return hit;
    if (filter === 'body') return { ...hit, edgeIdx: null, faceIdx: -1, bodyOnly: true };
    if (filter === 'face') return { ...hit, edgeIdx: null };
    if (filter === 'edge') return hit.edgeIdx != null ? hit : null;
    return hit;
  }
  function menu(anchor) {
    UI.menu(anchor, Object.keys(NAMES).map((k) => ({ label: (filter === k ? '✓ ' : '') + NAMES[k], icon: { all: 'pointer', body: 'cube', face: 'planeXY', edge: 'line' }[k], run: () => setFilter(k) })));
  }

  // ---------- Ähnliche auswählen ----------
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function edgeSig(e) {
    if (!e) return null;
    if (e.t === 'CIRCLE') return 'C' + r3(e.r || 0) + (e.a && e.b && Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1], e.a[2] - e.b[2]) < 1e-6 ? 'o' : 'a');
    const L = e.a && e.b ? Math.hypot(e.a[0] - e.b[0], e.a[1] - e.b[1], e.a[2] - e.b[2]) : 0;
    return (e.t || '?') + r3(L);
  }
  function itemSig(it, V) {
    const p = Model.resolveP(it.p || {}, V);
    const keep = {};
    for (const k of Object.keys(p).sort()) if (k !== 'sketch') keep[k] = typeof p[k] === 'number' ? r3(p[k]) : p[k];
    if (p.sketch) keep.sketch = JSON.stringify(p.sketch.ents);
    return JSON.stringify([it.kind, it.role, keep, (it.finishes || []).map((f) => [f.type, f.r])]);
  }
  function similar() {
    // Kanten: gleiche Art und Länge (bzw. gleicher Radius) im selben Körper
    if (App.edges.length) {
      const id = App.edges[0].id; const r = App.results.get(id); if (!r) return 0;
      const want = new Set(App.edges.filter((x) => x.id === id).map((x) => edgeSig(r.data.edges[x.edgeIdx])));
      const list = [];
      r.data.edges.forEach((e, i) => { if (want.has(edgeSig(e))) list.push({ id, edgeIdx: i }); });
      App.select([id], { edges: list });
      UI.toast(`${list.length} gleiche Kanten gewählt – zum Beispiel alle zusammen abrunden.`, { icon: 'check' });
      return list.length;
    }
    // Objekte: gleiche Art, gleiche Maße, gleiche Rolle – überall im Projekt (auch in Gruppen)
    const items = App.selectedItems().map((f) => f.item); if (!items.length) { UI.toast('Wähle zuerst ein Teil oder eine Kante.', { icon: 'info' }); return 0; }
    const V = Model.vars(App.doc).v;
    const want = new Set(items.map((it) => itemSig(it, V)));
    const ids = [];
    Model.walk(Model.activeItems(App.doc), (it) => { if (!it.hidden && want.has(itemSig(it, V))) ids.push(it.id); });
    App.select(ids);
    const what = items[0].kind === 'part' && LIBMAP[items[0].p.lib] ? LIBMAP[items[0].p.lib].label : (KINDS[items[0].kind] || {}).label || 'Teile';
    UI.toast(ids.length > 1 ? `${ids.length}× ${what} mit gleichen Maßen gewählt.` : 'Kein weiteres gleiches Teil gefunden.', { icon: ids.length > 1 ? 'check' : 'info' });
    return ids.length;
  }
  return { setFilter, pickOpts, adjust, menu, similar, on: ev.on, get filter() { return filter; }, NAMES };
})();
