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
  // ---------- Kanten nach Regel wählen (KP-16): alle äußeren, alle inneren, alle ----------
  function edgesByRule(id, rule) {
    const r = App.results.get(id); if (!r) return 0;
    const kinds = rule === 'all' ? null : Viewer.edgeKinds(id);
    const list = [];
    r.data.edges.forEach((e, i) => { if (!e) return; if (rule === 'all' || kinds[i] === rule) list.push({ id, edgeIdx: i }); });
    if (!list.length) { UI.toast(rule === 'concave' ? 'Dieses Teil hat keine inneren Kanten.' : 'Keine passenden Kanten gefunden.', { icon: 'info' }); return 0; }
    App.select([id], { edges: list });
    UI.toast(`${list.length} ${rule === 'convex' ? 'äußere' : rule === 'concave' ? 'innere' : ''} Kanten gewählt – zum Beispiel alle zusammen abrunden.`.replace('  ', ' '), { icon: 'check' });
    return list.length;
  }
  // ---------- Kantenkette: alle Kanten, die ohne Knick weiterlaufen ----------
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-3;
  // Richtung der Kante an ihrem Ende p (zeigt von p in die Kante hinein)
  function tangentAt(e, p) {
    const atA = near(p, e.a);
    if (e.t === 'LINE') return nrm3(atA ? sub3(e.b, e.a) : sub3(e.a, e.b));
    if (e.t === 'CIRCLE' && e.c && e.n) {
      let t = nrm3(crs3(e.n, sub3(p, e.c)));
      // Richtung zum Kantenmittelpunkt prüfen
      const toM = sub3(e.m, p); if (t[0] * toM[0] + t[1] * toM[1] + t[2] * toM[2] < 0) t = t.map((x) => -x);
      return t;
    }
    if (e.pts && e.pts.length > 1) { const P = e.pts; return nrm3(atA ? sub3(P[1], P[0]) : sub3(P[P.length - 2], P[P.length - 1])); }
    return null;
  }
  function chain() {
    if (!App.edges.length) { UI.toast('Klick zuerst eine Kante an.', { icon: 'info' }); return 0; }
    const id = App.edges[0].id; const r = App.results.get(id); if (!r) return 0;
    const E = r.data.edges, done = new Set(App.edges.filter((x) => x.id === id).map((x) => x.edgeIdx)), queue = [...done];
    while (queue.length) {
      const i = queue.pop(), e = E[i]; if (!e || !e.a || !e.b) continue;
      for (const p of [e.a, e.b]) {
        if (near(e.a, e.b) && p === e.b) continue;
        const t0 = tangentAt(e, p); if (!t0) continue;
        E.forEach((f, j) => {
          if (done.has(j) || !f || !f.a || !f.b) return;
          const q = near(f.a, p) ? f.a : near(f.b, p) ? f.b : null; if (!q) return;
          const t1 = tangentAt(f, q); if (!t1) return;
          // ohne Knick: die eine Kante läuft genau entgegengesetzt weiter
          if (t0[0] * t1[0] + t0[1] * t1[1] + t0[2] * t1[2] < -0.996) { done.add(j); queue.push(j); }
        });
      }
    }
    const list = [...done].map((i) => ({ id, edgeIdx: i }));
    App.select([id], { edges: list });
    UI.toast(`${list.length} Kanten in der Kette gewählt – z. B. alle zusammen abrunden.`, { icon: 'check' });
    return list.length;
  }
  return { edgesByRule,  chain, setFilter, pickOpts, adjust, menu, similar, on: ev.on, get filter() { return filter; }, NAMES };
})();
