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

  // ---------- Vergleich im Bild (PF-12: Versionen & Körper in Farben: neu = grün, weg = rot, gleich = grau) ----------
  const CURRENT_ID = '__current__';
  let cmp = null;   // { mode, bar, idA, idB, labelA, labelB, diff, geom, nodes, align, showAdded, showRemoved, showSame, visible, busy, seq }
  let cmpSeq = 0;

  function syncCheckBtn() {
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
  }
  function solidBodies(doc = App.doc) {
    if (!doc || !Array.isArray(doc.items)) return [];
    return doc.items.filter((it) => it && !it.hidden && !it.suppressed && it.role !== 'hole' && !(typeof App !== 'undefined' && App.mergedInto && doc === App.doc && App.mergedInto(it.id)));
  }
  function resolveBodyId(id, doc = App.doc) {
    if (!id || !doc) return null;
    let cur = id;
    if (doc === App.doc && typeof App !== 'undefined' && App.mergedInto) {
      let guard = 0;
      while (cur && App.mergedInto(cur) && guard++ < 12) cur = App.mergedInto(cur);
    }
    const top = Model.topOf(doc, cur);
    if (top && !top.hidden && !top.suppressed && top.role !== 'hole') return top.id;
    return null;
  }
  function fmtVol(mm3) {
    const v = Math.max(0, Number(mm3) || 0);
    if (v <= 1e-3) return Units.fmtVolU(0, 1);
    if (typeof Units !== 'undefined' && Units.fmtVolU) return Units.fmtVolU(v, v < 100 ? 2 : 1);
    return fmt(v, v < 100 ? 2 : 1) + ' mm³';
  }
  function applyCompareVis() {
    if (!cmp) return;
    if (!cmp.visible) {
      Viewer.setCompareDiff(null);
      return;
    }
    if (cmp.geom) {
      const shown = Viewer.setCompareDiff({
        addedMesh: cmp.geom.addedMesh,
        removedMesh: cmp.geom.removedMesh,
        sameMesh: cmp.geom.sameMesh,
        showAdded: cmp.showAdded,
        showRemoved: cmp.showRemoved,
        showSame: cmp.showSame,
      });
      if (shown) return;
    }
    if (cmp.nodes && cmp.nodes.length) Viewer.setCompare(cmp.nodes);
    else Viewer.setCompareDiff(null);
  }
  function updateCompareLegend() {
    if (!cmp || !cmp.bar) return;
    const g = cmp.geom;
    const setChip = (id, vol, active) => {
      const chip = cmp.bar.querySelector('#' + id);
      if (!chip) return;
      chip.classList.toggle('off', !active);
      chip.setAttribute('aria-pressed', String(!!active));
      const val = chip.querySelector('b');
      if (val) val.textContent = cmp.busy ? '…' : g ? fmtVol(vol) : '–';
    };
    setChip('cmp-chip-added', g ? g.addedVolume : 0, cmp.showAdded);
    setChip('cmp-chip-removed', g ? g.removedVolume : 0, cmp.showRemoved);
    setChip('cmp-chip-same', g ? g.sameVolume : 0, cmp.showSame);
    const sum = cmp.bar.querySelector('#cmp-geom-summary');
    if (sum) {
      if (cmp.busy) sum.textContent = T('cmp.calculating');
      else if (!g) sum.textContent = '';
      else if (g.identical) sum.textContent = T('cmp.identical');
      else {
        const pct = fmt(g.similarity, g.similarity > 99 ? 2 : 1);
        sum.textContent = T('cmp.similarity', { pct }) + (g.aligned ? ' · ' + T('cmp.alignedNote') : '');
      }
    }
    const alCb = cmp.bar.querySelector('#cmp-align');
    if (alCb && !cmp.busy && cmp.align === 'auto' && g) alCb.checked = !!g.aligned;
  }
  function buildLegendEl() {
    const mkChip = (id, cls, lblKey, tipKey, prop) => {
      const btn = h('button', { type: 'button', class: 'cmp-chip', id, 'aria-pressed': 'true', 'data-tip': T(tipKey) },
        h('span', { class: 'cmp-dot ' + cls }),
        h('span', { class: 'cmp-lbl' }, T(lblKey)),
        h('b', { class: 'mono' }, '…'));
      btn.onclick = () => {
        if (!cmp) return;
        cmp[prop] = !cmp[prop];
        updateCompareLegend();
        applyCompareVis();
      };
      return btn;
    };
    return h('div', { class: 'cmp-legend', id: 'cmp-legend' },
      mkChip('cmp-chip-added', 'added', 'cmp.addedLabel', 'cmp.addedTip', 'showAdded'),
      mkChip('cmp-chip-removed', 'removed', 'cmp.removedLabel', 'cmp.removedTip', 'showRemoved'),
      mkChip('cmp-chip-same', 'same', 'cmp.sameLabel', 'cmp.sameTip', 'showSame'));
  }
  function renderDiffList(listEl, d) {
    listEl.innerHTML = '';
    const li = (t) => listEl.append(h('li', { html: t }));
    for (const p of d.params) li(p.from == null ? `Maß <b>${esc(p.name)}</b> neu: ${esc(String(p.to))}` : p.to == null ? `Maß <b>${esc(p.name)}</b> entfernt` : `Maß <b>${esc(p.name)}</b>: ${esc(String(p.from))} → ${esc(String(p.to))}`);
    for (const n of d.added) li(`<b>${esc(n)}</b> hinzugekommen`);
    for (const n of d.removed) li(`<b>${esc(n)}</b> entfernt`);
    for (const c of d.changed) li(`<b>${esc(c.name)}</b>: ${c.what.join(', ')}`);
    if (!listEl.children.length) li('Keine Unterschiede.');
  }
  async function hydrateVersionSide(vid) {
    if (vid === CURRENT_ID) return { doc: App.doc, label: T('cmp.currentState'), time: null, isCurrent: true };
    const v = list().find((x) => x.id === vid);
    if (!v) return null;
    const d = JSON.parse(JSON.stringify(v.doc));
    Model.migrate(d);
    await Store.hydrateDoc(d);
    return { doc: d, label: v.name, time: v.t, isCurrent: false, v };
  }
  async function runCompareVersions(idA, idB, opts = {}) {
    const mySeq = ++cmpSeq;
    const sideA = await hydrateVersionSide(idA);
    const sideB = await hydrateVersionSide(idB);
    if (!sideA || !sideB) return null;
    if (mySeq !== cmpSeq) return null;

    const d = diff(sideA.doc, sideB.doc);
    const preserveBar = !!(opts.reuseBar && cmp && cmp.mode === 'versions' && cmp.bar);
    if (!preserveBar) compareOff(true);

    const vers = list();
    const mkOpts = (selId, selectedVal) => {
      const sel = h('select', { id: selId, class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': selId === 'cmp-sel-a' ? T('cmp.baseA') : T('cmp.targetB') });
      for (const v of vers) {
        const op = h('option', { value: v.id }, v.name);
        if (v.id === selectedVal) op.selected = true;
        sel.append(op);
      }
      const curOp = h('option', { value: CURRENT_ID }, T('cmp.currentState'));
      if (selectedVal === CURRENT_ID) curOp.selected = true;
      sel.append(curOp);
      return sel;
    };

    let bar = preserveBar ? cmp.bar : null;
    if (!bar) {
      bar = h('div', { class: 'viewbar cmpbar', id: 'compare-bar', role: 'region', 'aria-label': T('cmp.title'), 'data-help': 'compareBodies' });
      const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('cmp.title')));
      const bodies = solidBodies();
      if (bodies.length >= 2) {
        const swMode = h('button', { type: 'button', class: 'btn small', id: 'cmp-mode-bodies', 'data-tip': T('cmp.switchBodiesTip') }, T('cmp.modeBodies'));
        swMode.onclick = () => compareBodies(bodies[0].id, bodies[1].id);
        head.append(swMode);
      }
      const close = h('button', { type: 'button', class: 'vb-x', id: 'cmp-close', 'aria-label': T('cmp.closeAria'), 'data-tip': T('common.close') });
      close.innerHTML = icon('close'); close.onclick = () => compareOff();
      head.append(close);

      const selA = mkOpts('cmp-sel-a', idA);
      const selB = mkOpts('cmp-sel-b', idB);
      const swapBtn = h('button', { type: 'button', class: 'btn small', id: 'cmp-swap', 'aria-label': T('cmp.swapTip'), 'data-tip': T('cmp.swapTip') });
      swapBtn.innerHTML = icon('mirror');
      const onPickChange = () => { if (selA.value && selB.value && selA.value !== selB.value) runCompareVersions(selA.value, selB.value, { reuseBar: true }); };
      selA.onchange = onPickChange;
      selB.onchange = onPickChange;
      swapBtn.onclick = () => { const a = selA.value, b = selB.value; if (a && b && a !== b) runCompareVersions(b, a, { reuseBar: true }); };

      const leg = h('div', { class: 'vb-hint', id: 'cmp-desc' });
      const list2 = h('ul', { class: 'cmp-list', id: 'cmp-diff-list' });
      const wt = h('div', { class: 'vb-hint', id: 'cmp-weight' }, 'Gewicht wird berechnet …');
      const legend = buildLegendEl();
      const sumEl = h('div', { class: 'vb-hint', id: 'cmp-geom-summary' }, T('cmp.calculating'));
      const show = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'cmp-show', checked: true }), T('cmp.showInView'));
      show.querySelector('input').onchange = (e) => { if (!cmp) return; cmp.visible = e.target.checked; applyCompareVis(); ev.emit('compare'); };
      bar.append(
        head,
        h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('cmp.labelA')), selA, swapBtn),
        h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('cmp.labelB')), selB),
        leg, list2, wt, legend, sumEl, show
      );
      Views.bars().append(bar);
    } else {
      const sA = bar.querySelector('#cmp-sel-a'), sB = bar.querySelector('#cmp-sel-b');
      if (sA) sA.value = idA;
      if (sB) sB.value = idB;
    }

    const legEl = bar.querySelector('#cmp-desc');
    if (legEl) {
      if (sideB.isCurrent && !sideA.isCurrent) {
        legEl.innerHTML = `Rot: <b>${esc(sideA.label)}</b> (${new Date(sideA.time).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}) → Grün: <b>${esc(sideB.label)}</b>.`;
      } else {
        legEl.innerHTML = `Alt (A, rot): <b>${esc(sideA.label)}</b> → Neu (B, grün): <b>${esc(sideB.label)}</b>.`;
      }
    }
    const listEl = bar.querySelector('#cmp-diff-list');
    if (listEl) renderDiffList(listEl, d);
    const wtEl = bar.querySelector('#cmp-weight');
    if (wtEl) wtEl.textContent = 'Gewicht wird berechnet …';

    const prev = cmp && preserveBar ? cmp : null;
    cmp = {
      mode: 'versions',
      v: sideA.v || sideB.v || null,
      idA, idB,
      labelA: sideA.label,
      labelB: sideB.label,
      bar,
      diff: d,
      geom: null,
      nodes: null,
      align: 'world',
      showAdded: prev ? prev.showAdded : true,
      showRemoved: prev ? prev.showRemoved : true,
      showSame: prev ? prev.showSame : true,
      visible: prev ? prev.visible : true,
      busy: true,
      seq: mySeq,
    };
    updateCompareLegend();
    syncCheckBtn();
    ev.emit('compare');

    const measA = sideA.isCurrent ? Mass.measure() : Mass.measureDoc(sideA.doc);
    const measB = sideB.isCurrent ? Mass.measure() : Mass.measureDoc(sideB.doc);
    Promise.all([measA, measB]).then(([a, b]) => {
      if (!cmp || cmp.seq !== mySeq) return;
      if (!wtEl) return;
      if (!a || !b) { wtEl.textContent = ''; return; }
      const dg = b.mass - a.mass;
      wtEl.innerHTML = `Gewicht: ${Mass.gText(a.mass)} → <b>${Mass.gText(b.mass)}</b> (${dg >= 0 ? '+' : '−'}${Mass.gText(Math.abs(dg))})`;
    }).catch(() => {});

    const sceneA = Model.kernelScene(sideA.doc);
    const sceneB = Model.kernelScene(sideB.doc);
    try {
      const geom = await Kernel.call('compareSolids', { sceneA, sceneB, align: 'world' });
      if (!cmp || cmp.seq !== mySeq) return null;
      cmp.geom = geom;
      cmp.busy = false;
      updateCompareLegend();
      applyCompareVis();
      ev.emit('compare');
      return getComparingInfo();
    } catch (_) {
      if (!cmp || cmp.seq !== mySeq) return null;
      try {
        const res = await Kernel.call('evaluate', { scene: sceneA, known: {} });
        if (!cmp || cmp.seq !== mySeq) return null;
        const tops = new Map(sideA.doc.items.map((it) => [it.id, it]));
        cmp.nodes = res.nodes.filter((n) => !n.empty && tops.has(n.id) && tops.get(n.id).role !== 'hole').map((n) => ({ id: n.id, data: n, matrix: Model.localMatrix(tops.get(n.id)) }));
      } catch (_) {}
      cmp.busy = false;
      updateCompareLegend();
      applyCompareVis();
      ev.emit('compare');
      return getComparingInfo();
    }
  }

  async function compare(vid) { return runCompareVersions(vid, CURRENT_ID); }
  async function compareVersions(vidA, vidB = CURRENT_ID) { return runCompareVersions(vidA, vidB); }

  async function compareBodies(rawIdA, rawIdB, opts = {}) {
    const bodies = solidBodies();
    const idA = resolveBodyId(rawIdA) || (bodies[0] && bodies[0].id) || null;
    let idB = resolveBodyId(rawIdB);
    if (!idB || idB === idA) {
      const alt = bodies.find((b) => b.id !== idA);
      idB = alt ? alt.id : null;
    }
    if (!idA || !idB || idA === idB) {
      UI.toast(T('cmp.needTwoBodies'), { icon: 'info' });
      return null;
    }
    const itemA = Model.find(App.doc, idA)?.item;
    const itemB = Model.find(App.doc, idB)?.item;
    if (!itemA || !itemB) return null;

    const mySeq = ++cmpSeq;
    const preserveBar = !!(opts.reuseBar && cmp && cmp.mode === 'bodies' && cmp.bar);
    if (!preserveBar) compareOff(true);

    const align = opts.align || (preserveBar && cmp ? cmp.align : 'auto');
    const buildSelect = (selId, selected) => {
      const sel = h('select', { id: selId, class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': selId === 'cmp-sel-a' ? T('cmp.baseA') : T('cmp.targetB') });
      for (const b of bodies) {
        const op = h('option', { value: b.id }, Model.label(b));
        if (b.id === selected) op.selected = true;
        sel.append(op);
      }
      return sel;
    };

    let bar = preserveBar ? cmp.bar : null;
    if (!bar) {
      bar = h('div', { class: 'viewbar cmpbar', id: 'compare-bar', role: 'region', 'aria-label': T('cmp.title'), 'data-help': 'compareBodies' });
      const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('cmp.bodiesTitle')));
      const vers = list();
      if (vers.length) {
        const swMode = h('button', { type: 'button', class: 'btn small', id: 'cmp-mode-versions', 'data-tip': T('cmp.switchVersionsTip') }, T('cmp.modeVersions'));
        swMode.onclick = () => runCompareVersions(vers[vers.length - 1].id, CURRENT_ID);
        head.append(swMode);
      }
      const close = h('button', { type: 'button', class: 'vb-x', id: 'cmp-close', 'aria-label': T('cmp.closeAria'), 'data-tip': T('common.close') });
      close.innerHTML = icon('close'); close.onclick = () => compareOff();
      head.append(close);

      const selA = buildSelect('cmp-sel-a', idA);
      const selB = buildSelect('cmp-sel-b', idB);
      const swapBtn = h('button', { type: 'button', class: 'btn small', id: 'cmp-swap', 'aria-label': T('cmp.swapTip'), 'data-tip': T('cmp.swapTip') });
      swapBtn.innerHTML = icon('mirror');
      const onPick = () => {
        if (selA.value && selB.value && selA.value !== selB.value) {
          compareBodies(selA.value, selB.value, { reuseBar: true, align: cmp ? cmp.align : 'auto' });
        }
      };
      selA.onchange = onPick;
      selB.onchange = onPick;
      swapBtn.onclick = () => {
        const a = selA.value, b = selB.value;
        if (a && b && a !== b) compareBodies(b, a, { reuseBar: true, align: cmp ? cmp.align : 'auto' });
      };

      const alignCb = h('input', { type: 'checkbox', id: 'cmp-align' });
      alignCb.checked = align === 'center';
      alignCb.onchange = () => {
        if (!cmp) return;
        const nextAlign = alignCb.checked ? 'center' : 'world';
        compareBodies(cmp.idA, cmp.idB, { reuseBar: true, align: nextAlign });
      };

      const legend = buildLegendEl();
      const sumEl = h('div', { class: 'vb-hint', id: 'cmp-geom-summary' }, T('cmp.calculating'));
      const show = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'cmp-show', checked: true }), T('cmp.showInView'));
      show.querySelector('input').onchange = (e) => { if (!cmp) return; cmp.visible = e.target.checked; applyCompareVis(); ev.emit('compare'); };

      bar.append(
        head,
        h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('cmp.labelA')), selA, swapBtn),
        h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('cmp.labelB')), selB),
        h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint', 'data-tip': T('cmp.alignTip') }, alignCb, ' ', T('cmp.alignLabel'))),
        legend,
        sumEl,
        show
      );
      Views.bars().append(bar);
    } else {
      const rebuildOpts = (selId, selected) => {
        const sel = bar.querySelector('#' + selId);
        if (!sel) return;
        sel.innerHTML = '';
        for (const b of bodies) {
          const op = h('option', { value: b.id }, Model.label(b));
          if (b.id === selected) op.selected = true;
          sel.append(op);
        }
      };
      rebuildOpts('cmp-sel-a', idA);
      rebuildOpts('cmp-sel-b', idB);
      const alCb = bar.querySelector('#cmp-align');
      if (alCb) alCb.checked = align === 'center';
    }

    const prev = cmp && preserveBar ? cmp : null;
    cmp = {
      mode: 'bodies',
      v: null,
      idA, idB,
      labelA: Model.label(itemA),
      labelB: Model.label(itemB),
      bar,
      diff: null,
      geom: null,
      nodes: null,
      align,
      showAdded: prev ? prev.showAdded : true,
      showRemoved: prev ? prev.showRemoved : true,
      showSame: prev ? prev.showSame : true,
      visible: prev ? prev.visible : true,
      busy: true,
      seq: mySeq,
    };
    updateCompareLegend();
    syncCheckBtn();
    ev.emit('compare');

    const scene = Model.kernelScene(App.doc);
    try {
      const geom = await Kernel.call('compareSolids', { sceneA: scene, sceneB: scene, onlyA: [idA], onlyB: [idB], align });
      if (!cmp || cmp.seq !== mySeq) return null;
      cmp.geom = geom;
      cmp.busy = false;
      updateCompareLegend();
      applyCompareVis();
      ev.emit('compare');
      return getComparingInfo();
    } catch (err) {
      if (!cmp || cmp.seq !== mySeq) return null;
      cmp.busy = false;
      updateCompareLegend();
      UI.toast(String((err && err.message) || T('cmp.error')), { kind: 'bad' });
      ev.emit('compare');
      return getComparingInfo();
    }
  }

  function openCompare(opts = {}) {
    const bodies = solidBodies();
    const vers = list();
    if (opts.mode === 'versions' || (bodies.length < 2 && vers.length >= 1)) {
      if (!vers.length) { UI.toast(T('cmp.needTwoOrVersion'), { icon: 'info' }); return null; }
      return compare(vers[vers.length - 1].id);
    }
    const selIds = [];
    for (const sid of App.sel || []) {
      const bid = resolveBodyId(sid);
      if (bid && !selIds.includes(bid)) selIds.push(bid);
    }
    if (selIds.length >= 2) return compareBodies(selIds[0], selIds[1], opts);
    if (bodies.length >= 2) return compareBodies(bodies[0].id, bodies[1].id, opts);
    UI.toast(T('cmp.needTwoOrVersion'), { icon: 'info' });
    return null;
  }

  function setCompareLayers(opts = {}) {
    if (!cmp) return false;
    if (opts.added !== undefined) cmp.showAdded = !!opts.added;
    if (opts.removed !== undefined) cmp.showRemoved = !!opts.removed;
    if (opts.same !== undefined) cmp.showSame = !!opts.same;
    updateCompareLegend();
    applyCompareVis();
    ev.emit('compare');
    return true;
  }

  function getComparingInfo() {
    if (!cmp) return null;
    const g = cmp.geom;
    return {
      mode: cmp.mode,
      name: cmp.v ? cmp.v.name : cmp.labelA,
      labelA: cmp.labelA,
      labelB: cmp.labelB,
      idA: cmp.idA || null,
      idB: cmp.idB || null,
      diff: cmp.diff,
      shown: !!(cmp.visible && ((g && (g.addedMesh || g.removedMesh || g.sameMesh)) || (cmp.nodes && cmp.nodes.length))),
      busy: !!cmp.busy,
      align: cmp.align,
      aligned: g ? !!g.aligned : false,
      showAdded: !!cmp.showAdded,
      showRemoved: !!cmp.showRemoved,
      showSame: !!cmp.showSame,
      volA: g ? g.volA : 0,
      volB: g ? g.volB : 0,
      addedVolume: g ? g.addedVolume : 0,
      removedVolume: g ? g.removedVolume : 0,
      sameVolume: g ? g.sameVolume : 0,
      identical: g ? !!g.identical : false,
      similarity: g ? g.similarity : 100,
      hasAddedMesh: !!(g && g.addedMesh),
      hasRemovedMesh: !!(g && g.removedMesh),
      hasSameMesh: !!(g && g.sameMesh),
    };
  }

  function compareOff(silent = false) {
    cmpSeq++;
    if (!cmp) return;
    cmp.bar.remove();
    cmp = null;
    Viewer.setCompareDiff(null);
    if (!silent) {
      syncCheckBtn();
      ev.emit('compare');
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Fenster ----------
  function dialog() {
    const body = h('div', { class: 'versions', style: { display: 'grid', gap: '12px', minWidth: 'min(460px, 82vw)' } });
    const draw = () => {
      body.innerHTML = '';
      const row = h('div', { class: 'btn-row' });
      const sv = h('button', { type: 'button', class: 'btn primary', id: 'ver-save' }); sv.innerHTML = icon('save') + esc(T('dlg.ver.saveBtn'));
      sv.onclick = async () => { const n = await UI.prompt(T('dlg.ver.saveTitle'), T('dlg.ver.saveLabel'), T('dlg.ver.defName', { n: list().length + 1 }), T('common.save')); if (n != null) { save(n); draw(); } };
      row.append(sv);
      const arr = list().slice().reverse();
      if (arr.length >= 2) {
        const cmpTwo = h('button', { type: 'button', class: 'btn', id: 'ver-cmp-two' });
        cmpTwo.innerHTML = icon('compare') + esc(T('cmp.compareTwoBtn'));
        cmpTwo.onclick = () => { m.close(); compareVersions(arr[1].id, arr[0].id); };
        row.append(cmpTwo);
      }
      body.append(row);
      if (!arr.length) { body.append(h('div', { class: 'hint-box', html: T('dlg.ver.emptyHtml') })); return; }
      const ul = h('div', { class: 'mini-list' });
      for (const v of arr) {
        const r = h('div', { class: 'mini-row ver-row', 'data-vid': v.id });
        const nm = h('span', { class: 'grow' }, h('b', null, v.name), h('small', { style: { display: 'block', color: 'var(--muted)' } }, new Date(v.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })));
        const bc = h('button', { type: 'button', class: 'btn small ver-cmp' }, T('dlg.ver.compare')); bc.onclick = () => { m.close(); compare(v.id); };
        const br = h('button', { type: 'button', class: 'btn small ver-restore' }, T('dlg.ver.restore')); br.onclick = async () => { if (await UI.confirm(T('dlg.ver.restoreTitle'), T('dlg.ver.restoreBody', { name: v.name }), T('dlg.ver.restore'))) { m.close(); restore(v.id); } };
        const bd = h('button', { type: 'button', class: 'btn ghost small ver-del', 'aria-label': T('dlg.ver.delAria'), 'data-tip': T('dlg.ver.delAria') }); bd.innerHTML = icon('trash'); bd.onclick = async () => { if (await UI.confirm(T('dlg.ver.delTitle'), T('dlg.ver.delBody', { name: v.name }), T('common.delete'), true)) { remove(v.id); draw(); } };
        r.append(nm, bc, br, bd); ul.append(r);
      }
      body.append(ul);
    };
    draw();
    const m = UI.modal({ title: T('dlg.ver.title'), body, actions: [{ label: T('common.close'), primary: true }] });
  }
  function init() {
    App.on('doc', () => { if (cmp && !App.doc) compareOff(); if (App.doc && App.doc.id) Store.loadVersions(App.doc.id).then(() => ev.emit('change')).catch(() => {}); });
    App.on('mode', () => { if (App.mode !== 'model' && cmp) compareOff(); });
    App.on('results', () => {
      if (cmp && cmp.mode === 'bodies' && !cmp.busy) compareBodies(cmp.idA, cmp.idB, { reuseBar: true, align: cmp.align });
    });
    if (typeof I18n !== 'undefined' && I18n.on) {
      I18n.on('change', () => {
        if (!cmp) return;
        if (cmp.mode === 'bodies') compareBodies(cmp.idA, cmp.idB, { reuseBar: false, align: cmp.align });
        else runCompareVersions(cmp.idA, cmp.idB, { reuseBar: false });
      });
    }
  }
  return { init, list, save, remove, rename, restore, compare, compareVersions, compareBodies, openCompare, setCompareLayers, compareOff, diff, dialog, exportList, importList, on: ev.on, get comparing() { return getComparingInfo(); } };
})();
