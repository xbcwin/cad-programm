// ================= Auswahl: Filter und „Ähnliche auswählen“ =================
const Select = (() => {
  let filter = 'all';   // all · body · face · edge
  const FILTER_KEYS = ['all', 'body', 'face', 'edge'];
  const nameOf = (k) => T('menu.select.' + k);
  const NAMES = {
    get all() { return nameOf('all'); },
    get body() { return nameOf('body'); },
    get face() { return nameOf('face'); },
    get edge() { return nameOf('edge'); },
  };
  const ev = makeEmitter();
  function setFilter(f) {
    filter = FILTER_KEYS.includes(f) ? f : 'all';
    const b = document.querySelector('.view-btns [data-view="filter"]');
    if (b) { b.classList.toggle('on', filter !== 'all'); b.dataset.tip = T('menu.select.tip', { name: nameOf(filter) }); }
    if (filter === 'body' && (App.face || App.faces.length || App.edges.length)) App.select(App.sel);
    if (filter === 'edge' && (App.face || App.faces.length)) App.select(App.sel);
    if (filter === 'face' && App.edges.length) App.select(App.sel);
    if (paintActive && (filter === 'face' || filter === 'edge')) setPaintTarget(filter);
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
    UI.menu(anchor, [
      ...FILTER_KEYS.map((k) => ({ label: (filter === k ? '✓ ' : '') + nameOf(k), icon: { all: 'pointer', body: 'cube', face: 'planeXY', edge: 'line' }[k], run: () => setFilter(k) })),
      '-',
      { label: (paintActive ? '✓ ' : '') + T('paint.title'), icon: 'noteDraw', kbd: typeof Commands !== 'undefined' ? Commands.keyLabel('paintSelect') : 'V', help: 'paintSelect', run: () => togglePaint() },
    ]);
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
  // ---------- Malen-Auswahl: mit gedrückter Maus über Flächen oder Kanten streichen (BE-20) ----------
  let paintActive = false, paintTarget = 'auto', stroke = null, paintBar = null, paintCursor = null, paintSelHooked = false;
  function updatePaintBtn() {
    const b = document.querySelector('.view-btns [data-view="paint"]');
    if (b) b.classList.toggle('on', paintActive);
  }
  function updatePaintBar() {
    if (!paintBar) return;
    const modes = { auto: $('#paint-mode-auto'), face: $('#paint-mode-face'), edge: $('#paint-mode-edge') };
    for (const [k, btn] of Object.entries(modes)) {
      if (!btn) continue;
      const on = paintTarget === k;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('on', on);
    }
    const cnt = $('#paint-count');
    if (cnt) {
      if (App.edges.length) cnt.textContent = T('paint.countEdges', { n: App.edges.length });
      else if (App.faces.length) cnt.textContent = T('paint.countFaces', { n: App.faces.length });
      else cnt.textContent = T('paint.ready');
    }
  }
  function samplePoint(px, py) {
    if (!stroke) return false;
    let changed = false;
    const applyFace = (hit) => {
      if (!hit || hit.faceIdx == null || hit.faceIdx < 0) return;
      stroke.kind = 'face';
      const k = hit.id + ':' + hit.faceIdx;
      if (stroke.remove) {
        if (stroke.faceKeys.has(k)) {
          stroke.faceKeys.delete(k);
          stroke.faces = stroke.faces.filter((x) => x.id + ':' + x.faceIdx !== k);
          changed = true;
        }
      } else if (!stroke.faceKeys.has(k)) {
        stroke.faceKeys.add(k);
        stroke.faces.push({
          id: hit.id,
          faceIdx: hit.faceIdx,
          point: hit.point ? hit.point.toArray() : null,
          normal: hit.normal ? hit.normal.toArray() : null,
        });
        changed = true;
      }
    };
    const applyEdge = (hit) => {
      if (!hit || hit.edgeIdx == null) return;
      stroke.kind = 'edge';
      const k = hit.id + ':' + hit.edgeIdx;
      if (stroke.remove) {
        if (stroke.edgeKeys.has(k)) {
          stroke.edgeKeys.delete(k);
          stroke.edges = stroke.edges.filter((x) => x.id + ':' + x.edgeIdx !== k);
          changed = true;
        }
      } else if (!stroke.edgeKeys.has(k)) {
        stroke.edgeKeys.add(k);
        stroke.edges.push({ id: hit.id, edgeIdx: hit.edgeIdx });
        changed = true;
      }
    };
    if (stroke.kind === 'face' || (!stroke.kind && paintTarget === 'face')) {
      applyFace(Viewer.pick(px, py, { noEdges: true }));
    } else if (stroke.kind === 'edge' || (!stroke.kind && paintTarget === 'edge')) {
      applyEdge(Viewer.pick(px, py, { edgePx: 9 }));
    } else {
      const hit = Viewer.pick(px, py, { edgePx: 7 });
      if (hit && hit.edgeIdx != null) applyEdge(hit);
      else if (hit && hit.faceIdx != null && hit.faceIdx >= 0) applyFace(hit);
    }
    return changed;
  }
  function commitStroke() {
    if (!stroke) return;
    if (stroke.kind === 'edge') {
      const ids = [...new Set(stroke.edges.map((x) => x.id))];
      App.select(ids, { edges: stroke.edges.slice() });
    } else if (stroke.kind === 'face') {
      const ids = [...new Set(stroke.faces.map((x) => x.id))];
      App.select(ids, { faces: stroke.faces.slice() });
    } else {
      App.clearSelection();
    }
    updatePaintBar();
  }
  function placePaintCursor(x, y, show, e) {
    if (!paintCursor) return;
    paintCursor.style.display = show ? 'block' : 'none';
    if (show) {
      paintCursor.style.left = x + 'px';
      paintCursor.style.top = y + 'px';
      paintCursor.classList.toggle('down', !!stroke);
      paintCursor.classList.toggle('erase', !!(e && e.altKey));
    }
  }
  function onPaintDown(e) {
    if (!paintActive || e.button !== 0 || e.target !== Viewer.canvas) return;
    e.preventDefault();
    e.stopPropagation();
    const remove = !!e.altKey;
    const additive = !!e.shiftKey || remove;
    let kind = paintTarget === 'face' ? 'face' : paintTarget === 'edge' ? 'edge' : null;
    let faces = [], edges = [];
    if (additive) {
      if (App.edges.length && (!kind || kind === 'edge')) {
        kind = 'edge';
        edges = App.edges.slice();
      } else if (App.faces.length && (!kind || kind === 'face')) {
        kind = 'face';
        faces = App.faces.slice();
      }
    }
    stroke = {
      kind,
      remove,
      lastX: e.clientX,
      lastY: e.clientY,
      faces,
      edges,
      faceKeys: new Set(faces.map((x) => x.id + ':' + x.faceIdx)),
      edgeKeys: new Set(edges.map((x) => x.id + ':' + x.edgeIdx)),
    };
    const changed = samplePoint(e.clientX, e.clientY);
    if (changed || !additive) commitStroke();
    placePaintCursor(e.clientX, e.clientY, true, e);
    try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPaintMove(e) {
    if (!paintActive) return;
    const overCanvas = e.target === Viewer.canvas || !!stroke;
    placePaintCursor(e.clientX, e.clientY, overCanvas, e);
    if (stroke) {
      const dist = Math.hypot(e.clientX - stroke.lastX, e.clientY - stroke.lastY);
      const steps = clamp(Math.ceil(dist / 6), 1, 40);
      let changed = false;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = stroke.lastX + (e.clientX - stroke.lastX) * t;
        const py = stroke.lastY + (e.clientY - stroke.lastY) * t;
        if (samplePoint(px, py)) changed = true;
      }
      stroke.lastX = e.clientX;
      stroke.lastY = e.clientY;
      if (changed) commitStroke();
      return;
    }
    if (e.target === Viewer.canvas) {
      const opts = paintTarget === 'face' ? { noEdges: true } : paintTarget === 'edge' ? { edgePx: 9 } : { edgePx: 7 };
      const hit = Viewer.pick(e.clientX, e.clientY, opts);
      if (hit && hit.edgeIdx != null) {
        Viewer.highlightEdge(hit.id, hit.edgeIdx);
        Viewer.highlightFace('hover', null, null);
      } else if (hit && hit.faceIdx != null && hit.faceIdx >= 0) {
        Viewer.highlightEdge(null, null);
        Viewer.highlightFace('hover', hit.id, hit.faceIdx);
      } else {
        Viewer.clearHover();
      }
    }
  }
  function onPaintUp(e) {
    if (!paintActive) return;
    if (stroke) {
      stroke = null;
      placePaintCursor(e.clientX, e.clientY, e.target === Viewer.canvas, e);
      updatePaintBar();
    }
  }
  function onPaintLeave() {
    if (!paintActive || stroke) return;
    Viewer.clearHover();
    if (paintCursor) paintCursor.style.display = 'none';
  }
  function setPaintTarget(t) {
    paintTarget = t === 'face' || t === 'edge' ? t : 'auto';
    updatePaintBar();
  }
  function startPaint(target) {
    if (App.mode !== 'model') return false;
    if (typeof Sketch !== 'undefined' && Sketch.active) return false;
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    if (typeof Place !== 'undefined' && Place.active) Place.cancel();
    if (typeof UI !== 'undefined' && UI.closeRadial) UI.closeRadial();
    const nextTarget = (target === 'auto' || target === 'face' || target === 'edge')
      ? target
      : (filter === 'edge' ? 'edge' : filter === 'face' ? 'face' : 'auto');
    if (paintActive) {
      setPaintTarget(nextTarget);
      return true;
    }
    paintTarget = nextTarget;
    paintActive = true;
    Viewer.useButtons('place');
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.clearHover();

    const bar = h('div', { id: 'paint-select-bar', class: 'viewbar paintbar', 'data-help': 'paintSelect' },
      h('span', { class: 'vb-t' }, T('paint.title')),
      h('div', { class: 'seg', role: 'group', 'aria-label': T('paint.title') },
        h('button', { type: 'button', id: 'paint-mode-auto', onclick: () => setPaintTarget('auto') }, T('paint.modeAuto')),
        h('button', { type: 'button', id: 'paint-mode-face', onclick: () => setPaintTarget('face') }, T('paint.modeFace')),
        h('button', { type: 'button', id: 'paint-mode-edge', onclick: () => setPaintTarget('edge') }, T('paint.modeEdge'))),
      h('span', { class: 'paint-count', id: 'paint-count' }),
      h('button', { type: 'button', class: 'btn small', id: 'paint-clear', onclick: () => App.clearSelection() }, T('paint.clear')),
      h('button', { type: 'button', class: 'btn small primary', id: 'paint-done', onclick: () => stopPaint() }, T('paint.done')));
    $('#overlay').append(bar);
    paintBar = bar;

    paintCursor = h('div', { class: 'paint-cursor', 'aria-hidden': 'true' });
    paintCursor.style.display = 'none';
    document.body.append(paintCursor);

    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', onPaintDown, true);
    cv.addEventListener('pointerleave', onPaintLeave);
    window.addEventListener('pointermove', onPaintMove);
    window.addEventListener('pointerup', onPaintUp);
    window.addEventListener('pointercancel', onPaintUp);
    if (!paintSelHooked) {
      paintSelHooked = true;
      App.on('selection', () => { if (paintActive) updatePaintBar(); });
    }
    updatePaintBtn();
    updatePaintBar();
    UI.renderHint();
    ev.emit('paint', true);
    return true;
  }
  function stopPaint() {
    if (!paintActive) return false;
    paintActive = false;
    stroke = null;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', onPaintDown, true);
    cv.removeEventListener('pointerleave', onPaintLeave);
    window.removeEventListener('pointermove', onPaintMove);
    window.removeEventListener('pointerup', onPaintUp);
    window.removeEventListener('pointercancel', onPaintUp);
    if (paintBar) { paintBar.remove(); paintBar = null; }
    if (paintCursor) { paintCursor.remove(); paintCursor = null; }
    Viewer.useButtons('model');
    Viewer.canvas.style.cursor = '';
    Viewer.clearHover();
    updatePaintBtn();
    UI.renderHint();
    ev.emit('paint', false);
    return true;
  }
  function togglePaint(target) {
    if (paintActive && (!target || target === paintTarget)) return stopPaint();
    return startPaint(target);
  }
  return {
    edgesByRule, chain, setFilter, pickOpts, adjust, menu, similar,
    startPaint, stopPaint, togglePaint, setPaintTarget,
    on: ev.on, get filter() { return filter; }, get paintActive() { return paintActive; }, get paintTarget() { return paintTarget; }, NAMES,
  };
})();
