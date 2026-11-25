// ================= Messen =================
const Measure = (() => {
  let on = false, pts = [], objs = [], els = [];
  let sel = null, current = null, bar = null, pinObjs = [], pinEls = [];
  const live = new Map();
  const V3 = (a) => new THREE.Vector3(...a);
  const r6 = (v) => v.map((x) => round(x, 6));
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const list = (doc = App.doc) => doc.measures || [];
  const find = (id, doc = App.doc) => list(doc).find((m) => m.id === id) || null;
  function fracOf(p, b) {
    if (!p || !b) return null;
    const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
    return [dx > 1e-6 ? round((p[0] - b[0]) / dx, 6) : 0.5, dy > 1e-6 ? round((p[1] - b[1]) / dy, 6) : 0.5, dz > 1e-6 ? round((p[2] - b[2]) / dz, 6) : 0.5];
  }
  function toggle() { on ? stop() : start(); }
  function start() {
    Views.collapse();
    if (Sketch.active) return;
    if (Notes.active) Notes.stop();
    stopDraftFacePick();
    on = true; pts = []; current = null; last = null; clearVis();
    App.clearSelection(); Handles.clear();
    $('#t-measure') && $('#t-measure').classList.add('active');
    UI.hint(T('measure.hint'));
    Viewer.canvas.style.cursor = 'crosshair';
    showBar();
  }
  function stop() {
    on = false; pts = []; current = null; last = null; clearVis(); hideBar();
    $('#t-measure') && $('#t-measure').classList.remove('active');
    UI.hint(null); Viewer.canvas.style.cursor = '';
    Handles.rebuild();
  }
  // ---------- Messwert als Maß (KP-53): Kante im Bild wählen & automatisch nachführen ----------
  let fieldPick = null, hoverLine = null, syncParamRounds = 0;
  function edgeDirOf(e) {
    if (!e || e.t !== 'LINE' || !e.a || !e.b) return null;
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], dz = e.b[2] - e.a[2];
    const l = Math.hypot(dx, dy, dz);
    return l > 1e-9 ? [dx / l, dy / l, dz / l] : null;
  }
  function edgeLenOf(e) {
    if (!e) return null;
    if (typeof e.l === 'number' && isFinite(e.l) && e.l > 0) return round(e.l, 6);
    if (e.a && e.b) { const d = dist3(e.a, e.b); return d > 0 ? round(d, 6) : null; }
    return null;
  }
  function buildEdgeMeasureRef(itemId, edgeIdx) {
    const r = App.results.get(itemId);
    const e = r && r.data && Array.isArray(r.data.edges) ? r.data.edges[edgeIdx] : null;
    if (!e) return null;
    const len = edgeLenOf(e);
    if (!(len > 0)) return null;
    const bbox = r.data.bbox;
    const f = Model.find(App.doc, itemId);
    const dir = edgeDirOf(e);
    return {
      len,
      ref: {
        kind: 'edgeLen',
        id: itemId,
        tid: e.tid || null,
        t: e.t || 'LINE',
        a: r6(e.a),
        b: r6(e.b),
        m: r6(e.m),
        dir: dir ? r6(dir) : null,
        c: e.c ? r6(e.c) : null,
        n: e.n ? r6(e.n) : null,
        r: e.r != null ? round(e.r, 6) : null,
        mFrac: fracOf(e.m, bbox),
        label: (f ? Model.label(f.item) : 'Körper') + ' · Kante',
      },
    };
  }
  function resolveMeasuredEdge(mRef) {
    if (!mRef || !mRef.id) return null;
    let rid = mRef.id;
    while (rid && App.mergedInto && App.mergedInto(rid)) rid = App.mergedInto(rid);
    const r = App.results.get(rid) || App.results.get(mRef.id);
    if (!r || !r.data || !Array.isArray(r.data.edges) || !r.data.edges.length) return null;
    const bbox = r.data.bbox;
    const all = r.data.edges.map((e, idx) => ({ e, idx, c: e.m }));
    const mk = (x) => {
      if (!x) return null;
      const len = edgeLenOf(x.e);
      return len > 0 ? { len, edge: x.e, idx: x.idx, rid, bbox } : null;
    };
    if (mRef.tid) {
      const byTid = all.filter((x) => x.e.tid === mRef.tid && (!mRef.t || x.e.t === mRef.t));
      if (byTid.length === 1) return mk(byTid[0]);
      if (byTid.length > 1) {
        const sub = mRef.dir && mRef.t === 'LINE'
          ? byTid.filter((x) => { const d = edgeDirOf(x.e); return d && Math.abs(V3(d).dot(V3(mRef.dir))) >= 0.99; })
          : byTid;
        const b = pickBest(sub.length ? sub : byTid, mRef.m, mRef.mFrac, bbox);
        if (b) return mk(b);
      }
    }
    const cands = [];
    for (const x of all) {
      if (mRef.t && x.e.t !== mRef.t) continue;
      if (mRef.t === 'LINE' && mRef.dir) {
        const d = edgeDirOf(x.e);
        if (!d || Math.abs(V3(d).dot(V3(mRef.dir))) < 0.99) continue;
      } else if (mRef.t === 'CIRCLE' && mRef.n && x.e.n) {
        if (Math.abs(V3(x.e.n).normalize().dot(V3(mRef.n).normalize())) < 0.99) continue;
      }
      cands.push(x);
    }
    if (cands.length) return mk(pickBest(cands, mRef.m, mRef.mFrac, bbox));
    const sameType = mRef.t ? all.filter((x) => x.e.t === mRef.t) : all;
    return mk(pickBest(sameType.length ? sameType : all, mRef.m, mRef.mFrac, bbox));
  }
  function sameEdgeRef(a, b) {
    if (!a || !b || a.kind !== 'edgeLen' || b.kind !== 'edgeLen' || a.id !== b.id) return false;
    if (a.tid && b.tid && a.tid === b.tid && a.t === b.t) return true;
    if (a.t !== b.t || !a.m || !b.m || dist3(a.m, b.m) >= 0.05) return false;
    if (a.dir && b.dir && Math.abs(V3(a.dir).dot(V3(b.dir))) < 0.995) return false;
    return true;
  }
  function ensureMeasuredParam(spec, len, opts = {}) {
    const existing = !opts.forceNew ? (App.doc.params || []).find((p) => p && p.measure && sameEdgeRef(p.measure, spec)) : null;
    if (existing) {
      if (Math.abs(Number(existing.expr) - len) > 1e-5 || existing.measure.lost) {
        App.change('Messwert aktualisiert', (doc) => {
          const p = (doc.params || []).find((x) => x.id === existing.id);
          if (!p) return false;
          p.expr = len;
          p.measure = deepClone(spec);
        });
      }
      return existing.name;
    }
    let n = 1;
    const used = new Set((App.doc.params || []).map((x) => String(x.name || '').toLowerCase()));
    while (used.has(('messung_' + n))) n++;
    const name = 'Messung_' + n;
    App.change(`Messwert „${name}“ angelegt`, (doc) => {
      doc.params = doc.params || [];
      doc.params.push({ id: uid('m'), name, expr: len, measure: deepClone(spec) });
    });
    return name;
  }
  function syncMeasuredParams() {
    if (!App.doc || !Array.isArray(App.doc.params) || !App.doc.params.length) { syncParamRounds = 0; return; }
    const jobs = [];
    for (const p of App.doc.params) {
      if (!p || !p.measure || p.measure.kind !== 'edgeLen') continue;
      const res = resolveMeasuredEdge(p.measure);
      if (!res) {
        if (!p.measure.lost) jobs.push({ id: p.id, lost: true });
        continue;
      }
      if (p.measure.lost || typeof p.expr !== 'number' || Math.abs(p.expr - res.len) > 1e-5) {
        jobs.push({ id: p.id, lost: false, len: res.len, edge: res.edge, bbox: res.bbox });
      }
    }
    if (!jobs.length) { syncParamRounds = 0; return; }
    if (++syncParamRounds > 4) {
      syncParamRounds = 0;
      UI.toast(T('measure.cycleWarn'), { icon: 'warn' });
      return;
    }
    App.change('Messwert nachgeführt', (doc) => {
      for (const j of jobs) {
        const p = (doc.params || []).find((x) => x.id === j.id);
        if (!p || !p.measure) continue;
        if (j.lost) {
          p.measure.lost = true;
        } else {
          p.expr = j.len;
          delete p.measure.lost;
          if (j.edge) {
            const e = j.edge;
            p.measure.t = e.t || p.measure.t;
            p.measure.a = r6(e.a);
            p.measure.b = r6(e.b);
            p.measure.m = r6(e.m);
            const dir = edgeDirOf(e);
            p.measure.dir = dir ? r6(dir) : null;
            if (e.c) p.measure.c = r6(e.c);
            if (e.n) p.measure.n = r6(e.n);
            if (e.r != null) p.measure.r = round(e.r, 6);
            if (e.tid) p.measure.tid = e.tid;
            if (j.bbox) p.measure.mFrac = fracOf(e.m, j.bbox);
          }
        }
      }
    }, { amend: true });
  }
  function unlinkMeasuredParam(paramId) {
    App.change('Messwert-Verknüpfung gelöst', (doc) => {
      const p = (doc.params || []).find((x) => x.id === paramId);
      if (!p || !p.measure) return false;
      delete p.measure;
    });
  }
  function clearHoverEdge() {
    if (hoverLine) {
      Viewer.groups.overlay.remove(hoverLine);
      Viewer.disposeFat(hoverLine);
      hoverLine = null;
      Viewer.requestRender();
    }
  }
  function stopFieldPick() {
    if (!fieldPick) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', fieldPick.down, true);
    cv.removeEventListener('pointermove', fieldPick.move);
    window.removeEventListener('keydown', fieldPick.key, true);
    if (fieldPick.btn) fieldPick.btn.classList.remove('active');
    clearHoverEdge();
    cv.style.cursor = '';
    UI.hint(null);
    fieldPick = null;
  }
  function pickEdgeForField(opts = {}) {
    const fieldId = opts.fieldId || null;
    if (fieldPick && fieldPick.fieldId === fieldId && !opts.repickParamId) {
      stopFieldPick();
      return false;
    }
    stopFieldPick();
    if (on) stop();
    const btn = opts.btn || (fieldId ? document.getElementById(fieldId + '-meas') : null);
    if (btn) btn.classList.add('active');
    const cv = Viewer.canvas;
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
      clearHoverEdge();
      if (hit && hit.edgeIdx != null) {
        const g = hit.node.data.edgeGroups && hit.node.data.edgeGroups.find((x) => x[2] === hit.edgeIdx);
        const edge = hit.node.data.edges && hit.node.data.edges[hit.edgeIdx];
        if (g) {
          hoverLine = Viewer.makeFat(hit.node.data.lines.slice(g[0] * 3, (g[0] + g[1]) * 3), Viewer.theme.accent, 4.5, { depthTest: false, order: 36 });
          hoverLine.matrixAutoUpdate = false;
          hoverLine.matrix.copy(hit.node.obj.matrixWorld);
          Viewer.groups.overlay.add(hoverLine);
          Viewer.requestRender();
        }
        const len = edgeLenOf(edge);
        if (len > 0) UI.hint(`${T('measure.pickFieldHint')} · <b>${Units.fmtLenU(len, 2)}</b>`);
        else UI.hint(T('measure.pickFieldHint'));
      } else {
        UI.hint(T('measure.pickFieldHint'));
      }
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
      if (!hit || hit.edgeIdx == null) {
        UI.toast(T('measure.pickEdgeNeedEdge'), { icon: 'info' });
        return;
      }
      const info = buildEdgeMeasureRef(hit.id, hit.edgeIdx);
      if (!info) {
        UI.toast(T('measure.pickEdgeNeedEdge'), { icon: 'info' });
        return;
      }
      stopFieldPick();
      if (opts.repickParamId) {
        App.change('Messwert neu verknüpft', (doc) => {
          const p = (doc.params || []).find((x) => x.id === opts.repickParamId);
          if (!p) return false;
          p.expr = info.len;
          p.measure = deepClone(info.ref);
        });
        UI.toast(T('measure.linkedToast', { name: ((App.doc.params || []).find((x) => x.id === opts.repickParamId) || {}).name || '', val: Units.fmtLenU(info.len, 2) }), { icon: 'check' });
        return;
      }
      const depth = App.undoStack.length;
      const name = ensureMeasuredParam(info.ref, info.len);
      if (typeof opts.onPick === 'function') opts.onPick(name, info.len);
      if (App.undoStack.length > depth + 1) App.squash(depth, `Maß aus Messung (${name})`);
      UI.toast(T('measure.linkedToast', { name, val: Units.fmtLenU(info.len, 2) }), { icon: 'check' });
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stopFieldPick();
        if (typeof opts.onCancel === 'function') opts.onCancel();
      }
    };
    fieldPick = { fieldId, btn, move, down, key };
    cv.addEventListener('pointerdown', down, true);
    cv.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(T('measure.pickFieldHint'));
    return true;
  }
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar measurebar', id: 'measure-bar' });
    const cur = h('span', { class: 'm-cur mono', id: 'measure-cur' });
    const keepBtn = h('button', { type: 'button', class: 'tool primary', id: 'measure-keep', 'data-help': 'measureKeep', disabled: true });
    keepBtn.innerHTML = icon('plus') + `<span>${esc(T('measure.keep'))}</span>`;
    keepBtn.onclick = () => keep();
    const doneBtn = h('button', { type: 'button', class: 'tool', id: 'measure-done', 'data-tip': T('measure.doneTip'), 'data-kbd': 'Esc' });
    doneBtn.innerHTML = icon('check') + `<span>${esc(T('common.done'))}</span>`;
    doneBtn.onclick = () => stop();
    bar.append(cur, keepBtn, doneBtn);
    $('#overlay').append(bar);
    updateBar();
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function updateBar() {
    if (!bar) return;
    const cur = $('#measure-cur'), kb = $('#measure-keep');
    if (cur) cur.textContent = current ? current.eval.text : T('measure.barEmpty');
    if (kb) kb.disabled = !current;
  }
  function clearVis() { for (const o of objs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); } objs = []; for (const e of els) e.remove(); els = []; lastLabel = null; Viewer.requestRender(); }
  function snapPoint(hit, cx, cy) {
    const n = hit.node; const M = n.obj.matrixWorld;
    if (hit.edgeIdx != null) {
      const g = n.data.edges[hit.edgeIdx];
      if (g) {
        const cand = [['a', g.a], ['b', g.b], ['m', g.m]]; if (g.c) cand.push(['c', g.c]);
        let best = null, bestW = null, bd = 12;
        const r = Viewer.canvas.getBoundingClientRect();
        for (const [k, p] of cand) { const w = new THREE.Vector3(...p).applyMatrix4(M); const s = Viewer.toScreen(w); const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top)); if (d < bd) { bd = d; best = w; bestW = k; } }
        if (best) return { p: best, edge: g, which: bestW };
        return { p: hit.point.clone(), edge: g, which: null };
      }
    }
    return { p: hit.point.clone(), which: null };
  }
  // Was liegt unter der Maus? Punkt (an einer Kante gefangen) oder ebene Fläche
  function entityAt(hit, cx, cy) {
    const M = hit.node.obj.matrixWorld, invW = M.clone().invert(), bbox = hit.node.data.bbox;
    if (hit.edgeIdx != null) {
      const sp = snapPoint(hit, cx, cy), g = sp.edge;
      const lp = sp.p.clone().applyMatrix4(invW).toArray();
      const ref = { kind: 'pt', id: hit.id, lp: r6(lp), frac: fracOf(lp, bbox), edge: g ? { t: g.t, a: r6(g.a), b: r6(g.b), m: r6(g.m), c: g.c ? r6(g.c) : null, n: g.n ? r6(g.n) : null, which: sp.which || null, mFrac: fracOf(g.m, bbox) } : null };
      return { kind: 'pt', id: hit.id, edgeIdx: hit.edgeIdx, p: sp.p, edge: g, W: M, ref };
    }
    const f = hit.faceIdx >= 0 ? hit.node.data.faces[hit.faceIdx] : null;
    if (f && (f.t === 'CYLINDRE' || f.t === 'SPHERE') && f.r) {
      const lp = hit.point.clone().applyMatrix4(invW).toArray();
      const ln = hit.normal ? hit.normal.clone().transformDirection(invW).normalize().toArray() : null;
      const ref = { kind: 'round', id: hit.id, t: f.t, c: r6(f.c), axis: f.axis ? r6(f.axis) : null, sc: f.sc ? r6(f.sc) : null, r: round(f.r, 6), lp: r6(lp), ln: ln ? r6(ln) : null, frac: fracOf(f.c, bbox) };
      return { kind: 'round', id: hit.id, faceIdx: hit.faceIdx, f, area: Viewer.faceArea(hit.id, hit.faceIdx), hitP: hit.point.clone(), normal: hit.normal ? hit.normal.clone() : null, p: hit.point.clone(), ref };
    }
    if (f && f.t === 'PLANE' && f.n) {
      const lp = hit.point.clone().applyMatrix4(invW).toArray();
      const ref = { kind: 'face', id: hit.id, n: r6(f.n), c: r6(f.c), lp: r6(lp), frac: fracOf(f.c, bbox) };
      return { kind: 'face', id: hit.id, faceIdx: hit.faceIdx, c: new THREE.Vector3(...f.c).applyMatrix4(M), n: new THREE.Vector3(...f.n).transformDirection(M).normalize(), area: Viewer.faceArea(hit.id, hit.faceIdx), hitP: hit.point.clone(), ref };
    }
    const lp = hit.point.clone().applyMatrix4(invW).toArray();
    const ref = { kind: 'pt', id: hit.id, lp: r6(lp), frac: fracOf(lp, bbox), face: f && f.t === 'PLANE' && f.n ? { n: r6(f.n), c: r6(f.c), frac: fracOf(f.c, bbox) } : null };
    return { kind: 'pt', id: hit.id, p: hit.point.clone(), ref };
  }
  function dot(p) { const d = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], Viewer.theme.accent, 10, { depthTest: false }); Viewer.groups.overlay.add(d); objs.push(d); }
  function dash(a, b) { const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], Viewer.theme.accent, 3, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2 }); Viewer.groups.overlay.add(l); objs.push(l); }
  function onDown(e) {
    if (!on || e.button !== 0) return false;
    const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 11 });
    if (!hit) return true;
    let ent = entityAt(hit, e.clientX, e.clientY);
    if (pts.length === 0 && ent.edge && ent.edge.t === 'CIRCLE' && ent.edge.r && hit.edgeIdx != null) {
      clearVis();
      const W = hit.node.obj.matrixWorld;
      const c = new THREE.Vector3(...ent.edge.c).applyMatrix4(W);
      const circleEnt = { kind: 'circle', id: hit.id, edgeIdx: hit.edgeIdx, edge: ent.edge, c, W };
      const ev = evalEntities('circle', [circleEnt]);
      showLabel(ev.text, ev.p);
      const g = hit.node.data.edgeGroups.find((x) => x[2] === hit.edgeIdx);
      if (g) {
        const pos = Viewer.makeFat(hit.node.data.lines.slice(g[0] * 3, (g[0] + g[1]) * 3), Viewer.theme.accent, 4, { depthTest: false });
        pos.matrixAutoUpdate = false; pos.matrix.copy(W); Viewer.groups.overlay.add(pos); objs.push(pos);
      }
      last = { text: ev.text };
      const bbox = hit.node.data.bbox;
      current = { kind: 'circle', refs: [{ kind: 'circle', id: hit.id, c: r6(ent.edge.c), n: ent.edge.n ? r6(ent.edge.n) : null, r: round(ent.edge.r, 6), frac: fracOf(ent.edge.c, bbox) }], ents: [circleEnt], eval: ev };
      updateBar();
      return true;
    }
    // runde Fläche allein: Durchmesser und Radius (Zylinder oder Kugel)
    if (pts.length === 0 && ent.kind === 'round') {
      clearVis();
      const m = Viewer.faceOverlay(ent.id, ent.faceIdx, Viewer.theme.accent, 0.32); if (m) { Viewer.groups.overlay.add(m); objs.push(m); }
      const ev = evalEntities('round', [ent]);
      showLabel(ev.text, ev.p);
      last = { text: ev.text };
      current = { kind: 'round', refs: [ent.ref], ents: [ent], eval: ev };
      updateBar();
      Viewer.requestRender();
      return true;
    }
    if (ent.kind === 'round') ent = { ...ent, kind: 'pt', ref: { kind: 'pt', id: ent.id, lp: ent.ref.lp, frac: ent.ref.frac } };
    if (pts.length >= 2) { pts = []; clearVis(); }
    if (!pts.length) { last = null; current = null; }
    pts.push(ent);
    if (ent.kind === 'face') { const m = Viewer.faceOverlay(ent.id, ent.faceIdx, Viewer.theme.accent, 0.32); if (m) { Viewer.groups.overlay.add(m); objs.push(m); } }
    else dot(ent.p);
    if (pts.length === 1 && ent.kind === 'face') {
      const ev = evalEntities('face', [ent]);
      for (const [a, b] of ev.lines) dash(a, b);
      showLabel(ev.text, ev.p); last = { text: ev.text };
      current = { kind: 'face', refs: [ent.ref], ents: [ent], eval: ev };
      updateBar();
    } else if (pts.length === 1) {
      updateBar();
    }
    if (pts.length === 2) result(pts[0], pts[1]);
    Viewer.requestRender();
    return true;
  }
  let last = null;
  function evalEntities(kind, ents) {
    if (kind === 'circle') {
      const ent = ents[0];
      const d = ent.edge.r * 2;
      const short = `Ø ${Units.fmtLenU(d, 2)}`;
      const text = `Ø ${Units.fmtLenU(d, 2)}   (R ${Units.fmtLen(ent.edge.r, 2)})`;
      return { lost: false, kind, typeLabel: T('measure.circleType'), value: round(d, 6), unit: 'mm', short, text, p: ent.c.clone(), lines: [], dots: [], faces: [], circle: { id: ent.id, edgeIdx: ent.edgeIdx, W: ent.W } };
    }
    if (kind === 'round') {
      const ent = ents[0];
      const wr = ent.normal ? Viewer.wallAt(ent.id, ent.hitP, ent.normal) : null;
      const d = ent.f.r * 2;
      const short = `Ø ${Units.fmtLenU(d, 2)}`;
      const lbl = ent.f.t === 'SPHERE' ? T('measure.sphere') : T('measure.cylinder');
      const text = `${lbl} Ø ${Units.fmtLenU(d, 2)}   (R ${Units.fmtLen(ent.f.r, 2)})   ${T('measure.face')} ${Units.fmtAreaU(ent.area, 1)}${wr ? `   ${T('measure.wall')} ${Units.fmtLenU(wr, 2)}` : ''}`;
      return { lost: false, kind, typeLabel: lbl, value: round(d, 6), unit: 'mm', short, text, p: ent.hitP.clone(), lines: [], dots: [ent.hitP.clone()], faces: [{ id: ent.id, faceIdx: ent.faceIdx }], circle: null };
    }
    if (kind === 'face') {
      const ent = ents[0];
      const wt = Viewer.wallAt(ent.id, ent.hitP, ent.n);
      const short = Units.fmtAreaU(ent.area, ent.area < 100 ? 2 : 1);
      const text = `${T('measure.face')} ${short}${wt ? `   ${T('measure.wall')} ${Units.fmtLenU(wt, 2)}` : ''}`;
      const lines = wt ? [[ent.hitP.clone(), ent.hitP.clone().addScaledVector(ent.n, -wt)]] : [];
      return { lost: false, kind, typeLabel: T('measure.face'), value: round(ent.area, 6), unit: 'mm²', short, text, p: ent.hitP.clone(), lines, dots: [], faces: [{ id: ent.id, faceIdx: ent.faceIdx }], circle: null };
    }
    const [a, b] = ents;
    if (a.kind !== 'face' && b.kind !== 'face') {
      const pa = a.p || a.hitP, pb = b.p || b.hitP;
      const d = pa.distanceTo(pb);
      const short = Units.fmtLenU(d, 2);
      const text = `${short}   ΔX ${Units.fmtLen(Math.abs(pb.x - pa.x), 2)}  ΔY ${Units.fmtLen(Math.abs(pb.y - pa.y), 2)}  ΔZ ${Units.fmtLen(Math.abs(pb.z - pa.z), 2)}`;
      return { lost: false, kind: 'pair', typeLabel: T('measure.distPP'), value: round(d, 6), unit: 'mm', short, text, p: pa.clone().lerp(pb, 0.5), lines: [[pa.clone(), pb.clone()]], dots: [pa.clone(), pb.clone()], faces: [], circle: null };
    }
    if (a.kind === 'face' && b.kind === 'face') {
      const cs = Math.abs(a.n.dot(b.n));
      if (cs > 0.99995) {
        const d = Math.abs(b.c.clone().sub(a.c).dot(a.n));
        const from = a.hitP.clone(), to = from.clone().addScaledVector(a.n, b.c.clone().sub(from).dot(a.n));
        const short = d < 1e-6 ? `0 ${Units.label()}` : Units.fmtLenU(d, 2);
        const text = d < 1e-6 ? T('measure.coplanar') : T('measure.distParallel', { d: Units.fmtLenU(d, 2) });
        return { lost: false, kind: 'pair', typeLabel: T('measure.distFF'), value: round(d, 6), unit: 'mm', short, text, p: from.clone().lerp(to, 0.5), lines: d < 1e-6 ? [] : [[from, to]], dots: [from, to], faces: [{ id: a.id, faceIdx: a.faceIdx }, { id: b.id, faceIdx: b.faceIdx }], circle: null };
      }
      const ang = (Math.acos(clamp(cs, -1, 1)) * 180) / Math.PI;
      const short = fmtAngleU(ang);
      const text = T('measure.angleBetween', { a: short });
      return { lost: false, kind: 'pair', typeLabel: T('measure.angFF'), value: round(ang, 6), unit: '°', short, text, p: a.hitP.clone().lerp(b.hitP, 0.5), lines: [[a.hitP.clone(), b.hitP.clone()]], dots: [a.hitP.clone(), b.hitP.clone()], faces: [{ id: a.id, faceIdx: a.faceIdx }, { id: b.id, faceIdx: b.faceIdx }], circle: null };
    }
    const f = a.kind === 'face' ? a : b, q = a.kind === 'face' ? b : a, qp = q.p || q.hitP;
    const s = qp.clone().sub(f.c).dot(f.n); const foot = qp.clone().addScaledVector(f.n, -s);
    const d = Math.abs(s);
    const short = Units.fmtLenU(d, 2);
    const text = T('measure.distPtFace', { d: short });
    return { lost: false, kind: 'pair', typeLabel: T('measure.distPF'), value: round(d, 6), unit: 'mm', short, text, p: qp.clone().lerp(foot, 0.5), lines: [[qp.clone(), foot]], dots: [qp.clone(), foot], faces: [{ id: f.id, faceIdx: f.faceIdx }], circle: null };
  }
  function result(a, b) {
    for (const e of els) e.remove(); els = [];
    const ev = evalEntities('pair', [a, b]);
    for (const [p1, p2] of ev.lines) dash(p1, p2);
    showLabel(ev.text, ev.p);
    last = { text: ev.text };
    current = { kind: 'pair', refs: [a.ref, b.ref], ents: [a, b], eval: ev };
    updateBar();
  }
  function pickBest(cands, refC, refFrac, bbox) {
    if (!cands.length) return null;
    if (refC) {
      let exact = null, bd = 0.05;
      for (const x of cands) { const d = dist3(x.c, refC); if (d < bd) { bd = d; exact = x; } }
      if (exact) return exact;
    }
    if (refFrac && bbox) {
      let best = null, bf = Infinity, bd = Infinity;
      for (const x of cands) {
        const f = fracOf(x.c, bbox);
        const df = f ? dist3(f, refFrac) : Infinity;
        const dc = refC ? dist3(x.c, refC) : 0;
        if (df < bf - 1e-6 || (Math.abs(df - bf) <= 1e-6 && dc < bd)) { bf = df; bd = dc; best = x; }
      }
      if (best) return best;
    }
    if (refC) {
      let best = null, bd = Infinity;
      for (const x of cands) { const d = dist3(x.c, refC); if (d < bd) { bd = d; best = x; } }
      return best;
    }
    return cands[0];
  }
  function resolveRef(ref) {
    if (!ref || !ref.id) return null;
    const r = App.results.get(ref.id), found = Model.find(App.doc, ref.id);
    if (!r || !r.data || !found) return null;
    const W = Model.worldMatrix(App.doc, ref.id), bbox = r.data.bbox;
    if (ref.kind === 'face') {
      const cands = [];
      (r.data.faces || []).forEach((f, idx) => {
        if (f.t !== 'PLANE' || !f.n) return;
        if (V3(f.n).dot(V3(ref.n)) >= 0.999) cands.push({ f, idx, c: f.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      const f = best.f, fn = V3(f.n).normalize(), fc = V3(f.c);
      let lp = ref.lp ? V3(ref.lp) : fc.clone();
      lp = lp.clone().addScaledVector(fn, fc.clone().sub(lp).dot(fn));
      if (bbox && (lp.x < bbox[0] - 1 || lp.x > bbox[3] + 1 || lp.y < bbox[1] - 1 || lp.y > bbox[4] + 1 || lp.z < bbox[2] - 1 || lp.z > bbox[5] + 1)) lp = fc.clone();
      return { kind: 'face', id: ref.id, faceIdx: best.idx, c: fc.clone().applyMatrix4(W), n: fn.clone().transformDirection(W).normalize(), area: Viewer.faceArea(ref.id, best.idx), hitP: lp.applyMatrix4(W), f };
    }
    if (ref.kind === 'round') {
      const cands = [];
      (r.data.faces || []).forEach((f, idx) => {
        if (f.t !== ref.t || !f.r) return;
        if (ref.t === 'CYLINDRE' && ref.axis && f.axis) {
          const d = Math.abs(V3(f.axis.slice(3)).normalize().dot(V3(ref.axis.slice(3)).normalize()));
          if (d < 0.995) return;
        }
        cands.push({ f, idx, c: f.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      const f = best.f;
      let ln = null;
      if (f.t === 'CYLINDRE' && f.axis) {
        const ax = V3(f.axis.slice(3)).normalize(), o = V3(f.axis.slice(0, 3)), dc = V3(f.c).sub(o);
        const rad = dc.sub(ax.clone().multiplyScalar(dc.dot(ax)));
        if (rad.lengthSq() > 1e-8) ln = rad.normalize();
      } else if (f.t === 'SPHERE') {
        const rad = V3(f.c).sub(V3(f.sc || [0, 0, 0]));
        if (rad.lengthSq() > 1e-8) ln = rad.normalize();
      }
      if (!ln && ref.ln) ln = V3(ref.ln).normalize();
      else if (ln && ref.ln && ln.dot(V3(ref.ln)) < 0) ln.negate();
      return { kind: 'round', id: ref.id, faceIdx: best.idx, f, area: Viewer.faceArea(ref.id, best.idx), hitP: V3(f.c).applyMatrix4(W), normal: ln ? ln.transformDirection(W).normalize() : null };
    }
    if (ref.kind === 'circle') {
      const cands = [];
      (r.data.edges || []).forEach((e, idx) => {
        if (e.t !== 'CIRCLE' || !e.r || !e.c) return;
        if (ref.n && e.n && Math.abs(V3(e.n).normalize().dot(V3(ref.n).normalize())) < 0.995) return;
        cands.push({ e, idx, c: e.c });
      });
      const best = pickBest(cands, ref.c, ref.frac, bbox);
      if (!best) return null;
      return { kind: 'circle', id: ref.id, edgeIdx: best.idx, edge: best.e, c: V3(best.e.c).applyMatrix4(W), W };
    }
    if (ref.kind === 'pt') {
      if (ref.edge) {
        const re = ref.edge;
        const refDir = re.t === 'LINE' ? V3(re.b).sub(V3(re.a)).normalize() : null;
        const cands = [];
        (r.data.edges || []).forEach((e, idx) => {
          if (e.t !== re.t) return;
          if (e.t === 'LINE' && refDir) {
            const d = V3(e.b).sub(V3(e.a)); if (d.lengthSq() < 1e-10) return;
            if (Math.abs(d.normalize().dot(refDir)) < 0.995) return;
          } else if (e.t === 'CIRCLE' && re.n && e.n) {
            if (Math.abs(V3(e.n).normalize().dot(V3(re.n).normalize())) < 0.995) return;
          }
          cands.push({ e, idx, c: e.m });
        });
        const best = pickBest(cands, re.m, re.mFrac, bbox);
        if (!best) return null;
        const e = best.e;
        let lp = null;
        if (re.which === 'm') lp = V3(e.m);
        else if (re.which === 'c' && e.c) lp = V3(e.c);
        else if (re.which === 'a' || re.which === 'b') {
          const orig = V3(re[re.which]);
          if (e.t === 'LINE') {
            const d = V3(e.b).sub(V3(e.a));
            const s = d.dot(V3(re.b).sub(V3(re.a))) >= 0;
            lp = V3(re.which === 'a' ? (s ? e.a : e.b) : (s ? e.b : e.a));
          } else {
            lp = V3(e.a).distanceToSquared(orig) <= V3(e.b).distanceToSquared(orig) ? V3(e.a) : V3(e.b);
          }
        } else if (e.t === 'LINE') {
          const a = V3(e.a), b = V3(e.b), ab = b.clone().sub(a), l2 = ab.lengthSq();
          const t = l2 > 1e-10 ? clamp(V3(ref.lp).sub(a).dot(ab) / l2, 0, 1) : 0;
          lp = a.addScaledVector(ab, t);
        } else {
          lp = V3(e.m);
        }
        return { kind: 'pt', id: ref.id, p: lp.applyMatrix4(W) };
      }
      let lp = V3(ref.lp);
      if (ref.face) {
        const cands = [];
        (r.data.faces || []).forEach((f, idx) => {
          if (f.t !== 'PLANE' || !f.n) return;
          if (V3(f.n).dot(V3(ref.face.n)) >= 0.999) cands.push({ f, idx, c: f.c });
        });
        const best = pickBest(cands, ref.face.c, ref.face.frac, bbox);
        if (!best) return null;
        const fn = V3(best.f.n).normalize(), fc = V3(best.f.c);
        lp = lp.clone().addScaledVector(fn, fc.clone().sub(lp).dot(fn));
        if (bbox && (lp.x < bbox[0] - 1 || lp.x > bbox[3] + 1 || lp.y < bbox[1] - 1 || lp.y > bbox[4] + 1 || lp.z < bbox[2] - 1 || lp.z > bbox[5] + 1)) lp = fc.clone();
      }
      return { kind: 'pt', id: ref.id, p: lp.applyMatrix4(W) };
    }
    return null;
  }
  function solveMeasure(m) {
    const refs = m.refs || [];
    if (!refs.length) return { lost: true, short: T('measure.lost'), text: T('measure.lost'), value: null, unit: m.unit || '', typeLabel: T('measure.typeFallback'), p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
    const resolved = [];
    for (const ref of refs) {
      const x = resolveRef(ref);
      if (!x) return { lost: true, short: T('measure.lost'), text: T('measure.lost'), value: null, unit: m.unit || '', typeLabel: T('measure.typeFallback'), p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
      resolved.push(x);
    }
    return evalEntities(m.kind, resolved);
  }
  function evalOf(m) {
    if (live.has(m.id)) return live.get(m.id);
    if (m.lost) return { lost: true, short: T('measure.lost'), text: T('measure.lost'), value: null, unit: m.unit || '', typeLabel: T('measure.typeFallback'), p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
    return { lost: false, short: m.short || '', text: m.text || '', value: m.value, unit: m.unit || '', typeLabel: T('measure.typeFallback'), p: m.lastP ? V3(m.lastP) : null, lines: [], dots: [], faces: [], circle: null };
  }
  function defaultName(cur) {
    const n = list().length + 1;
    const t = cur.eval.typeLabel || T('measure.typeFallback');
    if (cur.kind === 'face') return T('measure.defArea', { n });
    if (cur.kind === 'circle') return T('measure.defDia', { n });
    if (t === T('measure.angFF')) return T('measure.defAngle', { n });
    if (cur.kind === 'pair') return T('measure.defDist', { n });
    return T('measure.defOther', { type: t, n });
  }
  function keep() {
    if (!current) return null;
    const m = {
      id: uid('ms'), name: defaultName(current), kind: current.kind, refs: deepClone(current.refs),
      value: current.eval.value, unit: current.eval.unit, short: current.eval.short, text: current.eval.text,
      lost: false, lastP: current.eval.p ? r6(current.eval.p.toArray()) : null,
    };
    live.set(m.id, current.eval);
    App.change(`Messung „${m.name}“ behalten`, (doc) => { (doc.measures = doc.measures || []).push(m); });
    pts = []; current = null; last = null; clearVis(); updateBar(); drawSaved();
    UI.toast(T('measure.keptToast', { name: m.name }), { icon: 'check', ms: 2000 });
    return m;
  }
  function relink() {
    const ms = list(), seen = new Set();
    for (const m of ms) {
      seen.add(m.id);
      const ev = solveMeasure(m);
      live.set(m.id, ev);
      m.lost = !!ev.lost;
      if (!ev.lost) {
        m.value = ev.value; m.unit = ev.unit; m.short = ev.short; m.text = ev.text;
        if (ev.p) m.lastP = r6(ev.p.toArray());
      }
    }
    for (const k of [...live.keys()]) if (!seen.has(k)) live.delete(k);
    drawSaved();
    Panels.renderLeft();
    if (sel) Panels.renderRight();
  }
  function setHidden(id, hidden) {
    App.change(hidden ? 'Messung ausgeblendet' : 'Messung eingeblendet', (doc) => {
      const m = find(id, doc); if (!m) return false;
      if (hidden) m.hidden = true; else delete m.hidden;
    });
  }
  function rename(id, name) {
    const v = String(name || '').trim(); if (!v) return;
    App.change('Messung umbenannt', (doc) => { const m = find(id, doc); if (!m) return false; m.name = v; });
  }
  function remove(id) {
    App.change('Messung gelöscht', (doc) => { doc.measures = list(doc).filter((x) => x.id !== id); });
    if (sel === id) select(null);
  }
  function select(id) {
    sel = id || null;
    if (sel) {
      App.clearSelection();
      if (typeof Datums !== 'undefined' && Datums.selected) Datums.select(null);
      if (typeof Datums !== 'undefined' && Datums.selectedAxis) Datums.selectAxis(null);
      if (typeof Datums !== 'undefined' && Datums.selectedPoint) Datums.selectPoint(null);
      if (typeof Datums !== 'undefined' && Datums.selectedCsys) Datums.selectCsys(null);
      if (typeof Joints !== 'undefined' && Joints.selected) Joints.select(null);
    }
    drawSaved(); Panels.renderLeft(); Panels.renderRight();
    updateStatus();
  }
  function clearPins() {
    const g = Viewer.groups.measures;
    if (g) for (const o of pinObjs) { g.remove(o); Viewer.disposeFat(o); }
    pinObjs = [];
    for (const x of pinEls) x.el.remove();
    pinEls = [];
  }
  function drawSaved() {
    clearPins();
    const g = Viewer.groups.measures;
    if (!g || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) { Viewer.requestRender(); return; }
    for (const m of list()) {
      if (m.hidden) continue;
      const ev = evalOf(m);
      const col = ev.lost ? '#e03131' : m.id === sel ? '#f08c00' : '#0ca678';
      if (!ev.lost) {
        for (const [a, b] of ev.lines || []) {
          const l = Viewer.makeFat([a.x, a.y, a.z, b.x, b.y, b.z], col, m.id === sel ? 3.5 : 2.5, { depthTest: false, dashed: true, dashSize: 2, gapSize: 1.2, order: 35 });
          g.add(l); pinObjs.push(l);
        }
        for (const q of ev.dots || []) {
          const d = Viewer.makeFat([q.x, q.y, q.z, q.x, q.y, q.z + 0.001], col, m.id === sel ? 9 : 7, { depthTest: false, order: 36 });
          g.add(d); pinObjs.push(d);
        }
        if (ev.circle) {
          const n = Viewer.nodes.get(ev.circle.id);
          const eg = n && n.data && n.data.edgeGroups && n.data.edgeGroups.find((x) => x[2] === ev.circle.edgeIdx);
          if (eg) {
            const pos = Viewer.makeFat(n.data.lines.slice(eg[0] * 3, (eg[0] + eg[1]) * 3), col, m.id === sel ? 4 : 3, { depthTest: false, order: 35 });
            pos.matrixAutoUpdate = false; pos.matrix.copy(ev.circle.W); g.add(pos); pinObjs.push(pos);
          }
        }
        if (m.id === sel) {
          for (const fc of ev.faces || []) {
            const fo = Viewer.faceOverlay(fc.id, fc.faceIdx, col, 0.22);
            if (fo) { g.add(fo); pinObjs.push(fo); }
          }
        }
      }
      if (ev.p) {
        const el = h('div', {
          class: 'dimlabel mpin' + (m.id === sel ? ' sel' : '') + (ev.lost ? ' lost' : ''),
          dataset: { measure: m.id },
          'data-tip': ev.lost ? 'Bezug fehlt – klicken für Details' : `${ev.text} · Klick wählt, Doppelklick kopiert`,
        }, ev.lost ? 'verloren' : ev.short);
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        el.addEventListener('click', (e) => { e.stopPropagation(); select(m.id === sel ? null : m.id); });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (!ev.lost) copyValue(ev.text); });
        $('#overlay').append(el);
        pinEls.push({ el, p: ev.p, id: m.id });
      }
    }
    place();
    Viewer.requestRender();
  }
  function treeSection() {
    const ms = list(); if (!ms.length) return null;
    const sec = h('div', { class: 'datum-tree measure-tree', id: 'measure-tree', 'data-help': 'measureKeep' }, h('div', { class: 'section-h' }, T('measure.treeHeading')));
    for (const m of ms) {
      const ev = evalOf(m);
      const row = h('div', { class: 'tree-row measure-row' + (m.id === sel ? ' sel' : '') + (m.hidden ? ' dim' : '') + (ev.lost ? ' lost' : ''), 'data-measure': m.id });
      const ic = h('span', { class: 'swatch measure' }); ic.innerHTML = icon('measure');
      const val = h('span', { class: 'sub mono' + (ev.lost ? ' lost' : '') }, ev.lost ? T('measure.lost') : ev.short);
      const acts = h('span', { class: 'm-acts' });
      const eye = h('button', { type: 'button', class: 'm-eye', 'aria-label': m.hidden ? T('common.show') : T('common.hide'), 'data-tip': m.hidden ? T('common.show') : T('common.hide') });
      eye.innerHTML = icon(m.hidden ? 'eyeOff' : 'eye');
      eye.onclick = (e) => { e.stopPropagation(); setHidden(m.id, !m.hidden); };
      const del = h('button', { type: 'button', class: 'm-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); remove(m.id); };
      acts.append(eye, del);
      row.append(ic, h('span', { class: 'nm' }, m.name), val, acts);
      row.onclick = () => select(m.id === sel ? null : m.id);
      sec.append(row);
    }
    return sec;
  }
  function renderPanel(body) {
    const m = find(sel); if (!m) return false;
    const ev = evalOf(m);
    const w = h('div', { class: 'props' });
    const nm = h('input', { id: 'measure-name', value: m.name, 'aria-label': T('common.name') });
    nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) rename(m.id, v); });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    w.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('common.kind')), h('b', null, ev.typeLabel || T('measure.typeFallback'))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('measure.valueLabel')), h('b', { class: 'mono' + (ev.lost ? ' bad' : ''), id: 'measure-val' }, ev.lost ? T('measure.lost') : ev.text))));
    if (ev.lost) w.append(h('div', { class: 'err-box' }, T('measure.lostDesc')));
    else w.append(h('div', { class: 'hint-box' }, T('measure.autoUpdateDesc')));
    const row = h('div', { class: 'btn-row' });
    const bc = h('button', { type: 'button', class: 'btn primary', id: 'measure-copy', disabled: ev.lost }); bc.innerHTML = icon('copy') + esc(T('measure.copyBtn')); bc.onclick = () => copyValue(ev.text);
    const bh = h('button', { type: 'button', class: 'btn', id: 'measure-hide' }); bh.innerHTML = icon(m.hidden ? 'eye' : 'eyeOff') + esc(m.hidden ? T('common.show') : T('common.hide')); bh.onclick = () => setHidden(m.id, !m.hidden);
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'measure-del' }); bd.innerHTML = icon('trash') + esc(T('common.delete')); bd.onclick = () => remove(m.id);
    row.append(bc, bh, bd); w.append(row);
    body.append(w);
    return true;
  }
  let lastLabel = null;
  function showLabel(text, p) {
    const el = h('div', { class: 'dimlabel mlabel', style: { fontSize: '13px', padding: '5px 8px' }, 'data-tip': T('measure.copyTip') }, text); $('#overlay').append(el); els.push(el);
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); copyValue(text); });
    lastLabel = { el, p }; place();
  }
  function place() {
    for (const e of els) { if (!lastLabel) continue; const s = Viewer.toScreen(lastLabel.p); lastLabel.el.style.left = s.x + 'px'; lastLabel.el.style.top = s.y - 22 + 'px'; }
    for (const x of pinEls) {
      if (!x.p) continue;
      const s = Viewer.toScreen(x.p);
      x.el.style.display = s.behind ? 'none' : '';
      x.el.style.left = s.x + 'px'; x.el.style.top = s.y - 16 + 'px';
    }
  }
  // erste Zahl eines Messwerts in die Zwischenablage (BE-35)
  let copied = null;
  function firstNumber(text) { const m = String(text).match(/-?\d+(?:[.,]\d+)?/); return m ? m[0] : null; }
  async function copyText(t, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (_) {
      try { const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = t; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) { ok = false; }
    }
    copied = t;
    UI.toast(ok ? T('measure.copiedToast', { what: what || T('measure.valueLabel'), val: t }) : T('measure.copyFailedToast', { val: t }), { icon: ok ? 'copy' : 'info' });
    return ok;
  }
  function copyValue(text) { const n = firstNumber(text); if (n) return copyText(n, T('measure.valueLabel')); return false; }
  function refreshDisplay() {
    if (list().length) relink();
    if (on && current && current.ents) {
      const ev = evalEntities(current.kind, current.ents);
      current.eval = ev;
      last = { text: ev.text };
      if (lastLabel && lastLabel.el) lastLabel.el.textContent = ev.text;
      updateBar();
    }
    updateStatus();
  }
  let calcBusy = false, uiBusy = false, selCopyVal = null, selCopyWhat = null;
  const statusState = { selText: '', unit: 'mm', calcState: 'loading', calcText: 'Lädt …' };
  function sketchEntLen(e) {
    if (!e) return 0;
    if (e.type === 'line') return Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (e.type === 'circle') return 2 * Math.PI * (e.r || 0);
    if (e.type === 'arc') {
      const info = typeof SK !== 'undefined' && SK.arcInfo ? SK.arcInfo(e.a, e.m, e.b) : null;
      return info ? Math.abs(info.sweep) * info.r : Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    }
    if (e.type === 'rect') return 2 * (Math.abs(e.b[0] - e.a[0]) + Math.abs(e.b[1] - e.a[1]));
    if (typeof SK !== 'undefined' && SK.segsOf) {
      let len = 0;
      for (const s of SK.segsOf([e])) {
        if (s.t === 'line') len += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        else if (s.t === 'arc') {
          const info = SK.arcInfo(s.a, s.m, s.b);
          len += info ? Math.abs(info.sweep) * info.r : Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        } else if (s.t === 'bez' && SK.bezPoints) {
          const pts = SK.bezPoints(s);
          for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
      }
      return len;
    }
    return 0;
  }
  function computeSelectionStatus() {
    if (typeof Sketch !== 'undefined' && Sketch.active && Sketch.state) {
      const S = Sketch.state;
      const els = [...new Set(S.sels || [])].map((id) => S.ents.find((e) => e.id === id)).filter(Boolean);
      if (!els.length) return null;
      if (els.length === 1) {
        const e = els[0];
        if (e.type === 'circle' && e.r > 0) {
          return { text: T('status.skCircle', { v: Units.fmtLenU(e.r * 2, 2) }), tip: T('status.skCircleTip'), copyVal: Units.fmtLen(e.r * 2, 2), copyWhat: T('common.diameter') };
        }
        if (e.type === 'rect') {
          const a = Math.abs(e.b[0] - e.a[0]) * Math.abs(e.b[1] - e.a[1]);
          const d = a < 100 ? 2 : 1;
          return { text: T('status.skRect', { v: Units.fmtAreaU(a, d) }), tip: T('status.skRectTip'), copyVal: Units.fmtArea(a, d), copyWhat: T('status.copyArea') };
        }
        if (e.type === 'point') {
          return { text: T('status.skPoint', { x: Units.fmtLen(e.a[0], 1), y: Units.fmtLen(e.a[1], 1), u: Units.label() }), tip: T('status.skPointTip') };
        }
        const len = sketchEntLen(e);
        if (len > 0) return { text: T('status.skOneElLen', { v: Units.fmtLenU(len, 2) }), tip: T('status.skLenTip'), copyVal: Units.fmtLen(len, 2), copyWhat: T('common.length') };
        return { text: T('status.skOneEl'), tip: T('status.skSelTip') };
      }
      const total = els.reduce((s, e) => s + sketchEntLen(e), 0);
      if (total > 0) return { text: T('status.skManyElLen', { n: els.length, v: Units.fmtLenU(total, 2) }), tip: T('status.skTotalLenTip'), copyVal: Units.fmtLen(total, 2), copyWhat: T('status.copyTotalLen') };
      return { text: T('status.skManyEl', { n: els.length }), tip: T('status.skSelTip') };
    }
    if (App.edges.length) {
      const eds = App.edges.map((x) => { const r = App.results.get(x.id); return r && r.data && r.data.edges ? r.data.edges[x.edgeIdx] : null; }).filter(Boolean);
      const total = eds.reduce((s, e) => s + (e.l || 0), 0);
      const one = App.edges.length === 1 && eds.length === 1 ? eds[0] : null;
      const full = one && one.t === 'CIRCLE' && one.r && Math.hypot(one.a[0] - one.b[0], one.a[1] - one.b[1], one.a[2] - one.b[2]) < 1e-6;
      if (full) {
        const d = one.r * 2;
        return { text: T('status.edgeCircle', { v: Units.fmtLenU(d, 2) }), tip: T('status.edgeCircleTip', { r: Units.fmtLenU(one.r, 2), total: Units.fmtLenU(total, 2) }), copyVal: Units.fmtLen(d, 2), copyWhat: T('common.diameter') };
      }
      if (App.edges.length === 1) {
        if (total > 0) return { text: T('status.edgeOneLen', { v: Units.fmtLenU(total, 2) }), tip: T('ctx.edgeLenTip'), copyVal: Units.fmtLen(total, 2), copyWhat: T('common.length') };
        return { text: T('status.edgeOne'), tip: T('status.edgeOneTip') };
      }
      if (total > 0) return { text: T('status.edgeManyLen', { n: App.edges.length, v: Units.fmtLenU(total, 2) }), tip: T('status.edgesTotalTip'), copyVal: Units.fmtLen(total, 2), copyWhat: T('status.copyTotalLen') };
      return { text: T('status.edgeMany', { n: App.edges.length }), tip: T('status.edgeManyTip') };
    }
    if (App.faces && App.faces.length > 1) {
      let totalArea = 0;
      for (const f of App.faces) {
        const a = Viewer.faceArea(f.id, f.faceIdx);
        if (a > 0) totalArea += a;
      }
      if (totalArea > 0) {
        const dec = totalArea < 100 ? 2 : 1;
        return { text: T('status.faceManyArea', { n: App.faces.length, area: Units.fmtAreaU(totalArea, dec) }), tip: T('status.faceManyTip'), copyVal: Units.fmtArea(totalArea, dec), copyWhat: T('status.copyArea') };
      }
      return { text: T('status.faceMany', { n: App.faces.length }), tip: T('status.faceManyTip') };
    }
    if (App.face) {
      const face = typeof Actions !== 'undefined' && Actions.selectedFace ? Actions.selectedFace() : null;
      if (face) {
        const area = Viewer.faceArea(face.id, face.idx);
        const fi = face.info;
        const isRound = fi && (fi.t === 'CYLINDRE' || fi.t === 'SPHERE') && fi.r;
        const dec = area < 100 ? 2 : 1;
        const areaStr = area > 0 ? Units.fmtAreaU(area, dec) : '';
        if (isRound && area > 0) {
          return { text: T('status.faceRoundArea', { area: areaStr, dia: Units.fmtLenU(fi.r * 2, 2) }), tip: T('status.faceRoundAreaTip', { r: Units.fmtLenU(fi.r, 2) }), copyVal: Units.fmtArea(area, dec), copyWhat: T('status.copyArea') };
        }
        if (isRound) {
          return { text: T('status.faceRound', { dia: Units.fmtLenU(fi.r * 2, 2) }), tip: T('status.faceRoundTip', { r: Units.fmtLenU(fi.r, 2) }), copyVal: Units.fmtLen(fi.r * 2, 2), copyWhat: T('common.diameter') };
        }
        if (area > 0) {
          return { text: T('status.faceArea', { area: areaStr }), tip: T('status.faceAreaTip'), copyVal: Units.fmtArea(area, dec), copyWhat: T('status.copyArea') };
        }
        return { text: T('status.face'), tip: T('status.faceTip') };
      }
    }
    if (App.sel.length) {
      const items = App.selectedItems();
      if (items.length === 1) {
        const it = items[0].item;
        const r = App.results.get(it.id);
        const b = (r && r.data && r.data.bbox) || App.localBox(it.id);
        const kindLbl = it.role === 'hole' ? T('status.oneHole') : T('status.oneBody');
        if (b) {
          const dx = Math.abs(b[3] - b[0]), dy = Math.abs(b[4] - b[1]), dz = Math.abs(b[5] - b[2]);
          const sz = `${Units.fmtLen(dx, 1)} × ${Units.fmtLen(dy, 1)} × ${Units.fmtLen(dz, 1)} ${Units.label()}`;
          return { text: `${kindLbl} · ${sz}`, tip: `${Model.label(it)} (${sz})` };
        }
        return { text: kindLbl, tip: Model.label(it) };
      }
      if (items.length > 1) {
        const allHoles = items.every((x) => x.item.role === 'hole');
        const allSolids = items.every((x) => x.item.role !== 'hole');
        const lbl = allHoles ? T('status.manyHoles', { n: items.length }) : allSolids ? T('status.manyBodies', { n: items.length }) : T('status.manyObjects', { n: items.length });
        return { text: lbl, tip: items.map((x) => Model.label(x.item)).join(', ') };
      }
    }
    const m = sel ? find(sel) : null;
    if (m) {
      const ev = evalOf(m);
      return { text: T('status.measureSel', { val: ev.lost ? T('measure.lost') : ev.short }), tip: `${m.name}: ${ev.text}`, copyVal: ev.lost ? null : firstNumber(ev.text), copyWhat: T('status.copyMeasure') };
    }
    return null;
  }
  function updateCalc() {
    const kState = typeof Kernel !== 'undefined' ? (Kernel.state || (Kernel.ready ? 'ready' : 'idle')) : 'idle';
    let state = 'ready', cls = 'st-chip st-calc ok', text = T('status.ready'), tip = T('status.kernelReadyTip');
    if (kState === 'error') {
      state = 'error'; cls = 'st-chip st-calc warn'; text = T('status.kernelError');
      tip = (Kernel.error && Kernel.error.message) || T('status.kernelErrorTip');
    } else if (kState === 'loading') {
      const pct = Math.round((Kernel.progress || 0) * 100);
      state = 'loading'; cls = 'st-chip st-calc busy';
      text = pct > 5 && pct < 99 ? T('status.kernelLoadingPct', { pct }) : T('status.kernelLoading');
      tip = T('status.kernelLoadingTip');
    } else if (calcBusy || uiBusy || App.busy) {
      state = 'busy'; cls = 'st-chip st-calc busy'; text = T('status.calcBusy'); tip = T('status.calcBusyTip');
    } else if (App.errors && App.errors.length) {
      state = 'error'; cls = 'st-chip st-calc warn';
      text = App.errors.length === 1 ? T('status.errOne') : T('status.errMany', { n: App.errors.length });
      tip = App.errors[0].message || T('status.errTip');
    } else if (kState === 'idle') {
      state = 'idle'; cls = 'st-chip st-calc ok'; text = T('status.ready');
      tip = T('status.idleTip');
    }
    statusState.calcState = state; statusState.calcText = text;
    const el = $('#status-calc');
    if (el) {
      el.className = cls; el.dataset.state = state; el.dataset.tip = tip;
      const t = el.querySelector('.t'); if (t) t.textContent = text;
    }
    const cBtn = $('#status-cancel');
    if (cBtn) {
      const showCancel = !!(typeof App !== 'undefined' && App.canCancel && App.busy && kState !== 'loading');
      cBtn.hidden = !showCancel;
      if (showCancel) {
        cBtn.innerHTML = icon('stop') + '<span>' + esc(T('status.cancelCalc')) + '</span>';
        cBtn.dataset.tip = T('status.cancelCalcTip');
      }
    }
  }
  function updateStatus() {
    const selEl = $('#status-sel');
    const info = computeSelectionStatus();
    if (info) {
      selCopyVal = info.copyVal || null; selCopyWhat = info.copyWhat || null;
      statusState.selText = info.text;
      if (selEl) { selEl.hidden = false; selEl.textContent = info.text; selEl.dataset.tip = info.tip; }
    } else {
      selCopyVal = null; selCopyWhat = null; statusState.selText = '';
      if (selEl) { selEl.hidden = true; selEl.textContent = ''; }
    }
    const u = Units.def();
    statusState.unit = u.k;
    const unitEl = $('#status-unit');
    if (unitEl) { unitEl.textContent = u.label; unitEl.dataset.tip = T('status.unitTip', { name: u.name }); }
    updateCalc();
  }
  function setCalcBusy(on) { uiBusy = !!on; updateCalc(); }
  function init() {
    App.on('selection', () => {
      if (App.sel.length !== 2) clearDist();
      if (sel && App.sel.length) { sel = null; drawSaved(); }
      updateStatus();
      if (silSt && silSt.onlySel) drawSilhouette();
    });
    App.on('results', () => { relink(); syncMeasuredParams(); updateStatus(); if (draftSt) drawDraft(); if (silSt) drawSilhouette(); });
    App.on('remeshed', relink);
    App.on('rebuilt', updateCalc);
    App.on('docLoaded', stopFieldPick);
    let lastUnit = Units.key();
    let lastFmt = `${FMT.dec}:${FMT.angle}`;
    if (typeof ViewPrefs !== 'undefined' && ViewPrefs.on) {
      ViewPrefs.on('change', () => {
        const curFmt = `${FMT.dec}:${FMT.angle}`;
        if (curFmt !== lastFmt) { lastFmt = curFmt; refreshDisplay(); if (silSt) updateSilUI(); }
      });
    }
    if (typeof I18n !== 'undefined' && I18n.on) {
      I18n.on('change', () => { if (draftSt) { buildDraftBar(); updateDraftUI(); } if (silSt) { buildSilBar(); updateSilUI(); } });
    }
    App.on('doc', () => {
      if (sel && !find(sel)) sel = null;
      const ids = new Set(list().map((m) => m.id));
      for (const k of [...live.keys()]) if (!ids.has(k)) live.delete(k);
      if (Units.key() !== lastUnit) { lastUnit = Units.key(); if (list().length) relink(); if (draftSt) updateDraftUI(); if (silSt) updateSilUI(); }
      drawSaved();
      updateStatus();
    });
    App.on('mode', () => { if (App.mode !== 'model') { if (on) stop(); if (draftSt) draft(false); if (silSt) silhouette(false); stopFieldPick(); } drawSaved(); updateStatus(); });
    App.on('sketch', updateStatus);
    App.on('sketchSel', updateStatus);
    App.on('calc', (b) => { calcBusy = !!b; updateCalc(); });
    App.on('calcCancelable', updateCalc);
    App.on('busy', (b) => { uiBusy = !!b; updateCalc(); });
    if (typeof Kernel !== 'undefined' && Kernel.on) Kernel.on('state', updateCalc);
    if (typeof Kernel !== 'undefined' && Kernel.whenReady) Kernel.whenReady().then(updateStatus).catch(() => {});
    const selBtn = $('#status-sel');
    if (selBtn) selBtn.addEventListener('click', () => { if (selCopyVal) copyText(selCopyVal, selCopyWhat || 'Wert'); });
    const unitBtn = $('#status-unit');
    if (unitBtn) unitBtn.addEventListener('click', () => ViewPrefs.dialog('general', { focus: 'set-proj-unit' }));
    const cancelBtn = $('#status-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => App.cancelRebuild && App.cancelRebuild());
    const calcEl = $('#status-calc');
    if (calcEl) calcEl.addEventListener('click', () => { if (statusState.calcState === 'error' && typeof Notices !== 'undefined') Notices.open($('#status-bell')); });
    updateStatus();
    let d0 = null;
    Viewer.canvas.addEventListener('pointerdown', (e) => { if (on) d0 = { x: e.clientX, y: e.clientY }; }, true);
    Viewer.canvas.addEventListener('pointerup', (e) => { if (on && d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 5) onDown(e); d0 = null; });
    Viewer.on('camera', place);
    Viewer.on('camera', onSilCamera);
    // Lage unter der Maus in der Statusleiste (BE-17): im Modell X/Y/Z auf dem Körper oder dem Boden, in der Skizze X/Y der Skizze
    let timer = null, lastT = 0, lastPos = null;
    const flushCoords = () => {
      timer = null;
      if (!lastPos) return;
      const p = lastPos; lastPos = null;
      lastT = performance.now();
      showCoords(p[0], p[1]);
    };
    Viewer.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) { lastPos = null; return; }
      if (Sketch.active && Sketch.state && Sketch.state.F) {
        if (timer) { clearTimeout(timer); timer = null; }
        lastPos = null;
        lastT = performance.now();
        showCoords(e.clientX, e.clientY);
        return;
      }
      lastPos = [e.clientX, e.clientY];
      if (timer) return;
      const wait = Math.max(0, 50 - (performance.now() - lastT));
      if (wait === 0) { flushCoords(); return; }
      timer = setTimeout(flushCoords, wait);
    });
    Viewer.canvas.addEventListener('pointerleave', () => {
      lastPos = null;
      if (timer) { clearTimeout(timer); timer = null; }
      const el = $('#coords'); if (el) el.textContent = '';
    });
  }
  let coordsNow = null;
  function showCoords(cx, cy) {
    const el = $('#coords'); if (!el) return;
    const f = (v) => Units.fmtLen(Math.abs(v) < 5e-5 ? 0 : v, 1);
    const u = Units.label();
    if (Sketch.active && Sketch.state && Sketch.state.F) {
      const S = Sketch.state, F = S.F;
      let uv = S.cursor && S.cursor.p;
      if (!uv) { const w = Viewer.rayPlane(cx, cy, F.o, F.n); if (!w) return; const d = w.clone().sub(F.o); uv = [d.dot(F.x), d.dot(F.y)]; }
      coordsNow = { sketch: true, x: uv[0], y: uv[1] };
      el.textContent = T('status.coordsSketch', { x: f(uv[0]), y: f(uv[1]), u }); return;
    }
    const hit = Viewer.pick(cx, cy, { noEdges: true });
    const p = hit ? hit.point : Viewer.pickPlane(cx, cy, 0);
    if (!p) { el.textContent = ''; coordsNow = null; return; }
    coordsNow = { x: p.x, y: p.y, z: p.z, on: hit ? hit.id : null };
    el.textContent = `X ${f(p.x)}  Y ${f(p.y)}  Z ${f(p.z)} ${u}${hit ? '' : T('status.coordsGround')}`;
  }
  // kleinster Abstand zweier Teile (exakt aus dem CAD-Kern); zeigt die Verbindung als Linie im Bild
  let distLine = null;
  function clearDist() { if (distLine) { Viewer.groups.overlay.remove(distLine); distLine.geometry.dispose(); distLine.material.dispose(); distLine = null; Viewer.requestRender(); } }
  async function minDistance(ids, show = true) {
    if (!ids || ids.length !== 2) return null;
    let r = null;
    try { r = await Kernel.call('distance', { scene: Model.kernelScene(App.doc), ids }); } catch (e) { console.warn(e); return null; }
    clearDist();
    if (r && show && r.d > 1e-6) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)]);
      distLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: new THREE.Color('#e0457b'), dashSize: 1.5, gapSize: 1, depthTest: false, transparent: true }));
      distLine.computeLineDistances(); distLine.renderOrder = 40; Viewer.groups.overlay.add(distLine); Viewer.requestRender();
    }
    return r;
  }
  // ---------- Schräge- und Hinterschnitt-Analyse (PF-09, PF-10) ----------
  const DRAFT_DIRS = { '+Z': [0, 0, 1], '-Z': [0, 0, -1], '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0] };
  let draftSt = null;
  function normalizeDraftDir(val) {
    if (typeof val === 'string' && DRAFT_DIRS[val]) return { dirKey: val, dir: DRAFT_DIRS[val].slice() };
    if (Array.isArray(val) && val.length >= 3) {
      const x = Number(val[0]) || 0, y = Number(val[1]) || 0, z = Number(val[2]) || 0;
      const l = Math.hypot(x, y, z);
      if (l > 1e-9) {
        const u = [x / l, y / l, z / l];
        for (const [k, d] of Object.entries(DRAFT_DIRS)) {
          if (u[0] * d[0] + u[1] * d[1] + u[2] * d[2] > 0.9999) return { dirKey: k, dir: d.slice() };
        }
        return { dirKey: 'face', dir: u };
      }
    }
    return { dirKey: '+Z', dir: [0, 0, 1] };
  }
  function syncDraftButtons() {
    if (typeof GeomCheck !== 'undefined' && GeomCheck.sync) GeomCheck.sync();
    if (typeof Views !== 'undefined' && Views.sync) Views.sync();
  }
  function disposeDraftVisuals() {
    if (!draftSt) return;
    if (draftSt.mesh) {
      Viewer.groups.overlay.remove(draftSt.mesh);
      draftSt.mesh.geometry.dispose();
      draftSt.mesh.material.dispose();
      draftSt.mesh = null;
    }
    if (draftSt.arrow) {
      Viewer.groups.overlay.remove(draftSt.arrow);
      draftSt.arrow.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      draftSt.arrow = null;
    }
  }
  function stopDraftFacePick() {
    if (!draftSt || !draftSt.picking) return;
    const pk = draftSt.picking;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', pk.down, true);
    window.removeEventListener('keydown', pk.key, true);
    cv.style.cursor = '';
    UI.hint(null);
    draftSt.picking = null;
    const btn = draftSt.bar && draftSt.bar.querySelector('#draft-pick-face');
    if (btn) btn.classList.remove('active');
  }
  function startDraftFacePick() {
    if (!draftSt) return;
    if (draftSt.picking) { stopDraftFacePick(); return; }
    if (on) stop();
    stopFieldPick();
    const cv = Viewer.canvas;
    const btn = draftSt.bar && draftSt.bar.querySelector('#draft-pick-face');
    if (btn) btn.classList.add('active');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const f = hit && hit.faceIdx >= 0 && hit.node && hit.node.data && hit.node.data.faces ? hit.node.data.faces[hit.faceIdx] : null;
      if (!f || f.t !== 'PLANE' || !f.n) {
        UI.toast(T('draft.pickFaceNeedPlane'), { icon: 'info' });
        return;
      }
      const wn = new THREE.Vector3(...f.n).transformDirection(hit.node.obj.matrixWorld).normalize().toArray();
      const norm = normalizeDraftDir(wn);
      stopDraftFacePick();
      if (!draftSt) return;
      draftSt.dirKey = norm.dirKey;
      draftSt.dir = norm.dir;
      syncDraftBarInputs();
      drawDraft();
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        stopDraftFacePick();
      }
    };
    draftSt.picking = { down, key };
    cv.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(T('draft.pickFaceHint'));
  }
  function makeDraftArrow(box, dir, twoSided) {
    if (!box || box.isEmpty()) return null;
    const grp = new THREE.Group();
    const d = new THREE.Vector3(...dir).normalize();
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const span = Math.abs(d.x) * sz.x + Math.abs(d.y) * sz.y + Math.abs(d.z) * sz.z;
    const diag = Math.max(10, sz.length());
    const len = clamp(diag * 0.28, 8, 28);
    const rad = clamp(len * 0.055, 0.35, 1.3);
    const buildOne = (vec, distOff, opacity, scale) => {
      const L = len * scale, R = rad * scale;
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x2b7de9, transparent: opacity < 1, opacity, depthTest: false });
      const shaftL = L * 0.62, headL = L * 0.38;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R, R, shaftL, 12), mat);
      shaft.position.y = shaftL / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(R * 2.3, headL, 14), mat);
      head.position.y = shaftL + headL / 2;
      g.add(shaft, head);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec);
      g.position.copy(c).addScaledVector(vec, distOff);
      g.renderOrder = 22;
      shaft.renderOrder = head.renderOrder = 22;
      return g;
    };
    const off = span * 0.5 + clamp(diag * 0.08, 3, 12);
    grp.add(buildOne(d, off, 0.95, 1));
    if (twoSided) grp.add(buildOne(d.clone().negate(), off, 0.55, 0.78));
    grp.userData.noPick = true;
    return grp;
  }
  function updateDraftUI() {
    if (!draftSt || !draftSt.bar) return;
    const r = draftSt.info;
    const fmtA = (a) => Units.fmtAreaU(a || 0, a > 0 && a < 100 ? 1 : 0);
    const okEl = draftSt.bar.querySelector('#draft-ok-val');
    const warnEl = draftSt.bar.querySelector('#draft-warn-val');
    const badEl = draftSt.bar.querySelector('#draft-bad-val');
    const sumEl = draftSt.bar.querySelector('#draft-summary');
    if (okEl) okEl.textContent = r ? fmtA(r.areas.ok) : '0';
    if (warnEl) warnEl.textContent = r ? fmtA(r.areas.warn) : '0';
    if (badEl) badEl.textContent = r ? fmtA(r.areas.undercut) : '0';
    if (sumEl) {
      if (!r || !(r.areas.total > 0)) sumEl.textContent = T('draft.empty');
      else if (r.areas.undercut > 0.05) sumEl.textContent = T('draft.hasUndercut', { area: fmtA(r.areas.undercut) });
      else if (r.areas.warn > 0.05) sumEl.textContent = T('draft.hasWarn', { area: fmtA(r.areas.warn), ang: fmtAngleU(draftSt.minAngle) });
      else sumEl.textContent = T('draft.allOk', { ang: fmtAngleU(draftSt.minAngle) });
    }
  }
  function syncDraftBarInputs() {
    if (!draftSt || !draftSt.bar) return;
    const selEl = draftSt.bar.querySelector('#draft-dir');
    if (selEl) {
      let faceOpt = selEl.querySelector('option[value="face"]');
      if (draftSt.dirKey === 'face') {
        if (!faceOpt) { faceOpt = h('option', { value: 'face' }, T('draft.dirFace')); selEl.append(faceOpt); }
        selEl.value = 'face';
      } else {
        if (faceOpt) faceOpt.remove();
        selEl.value = draftSt.dirKey;
      }
    }
    const rng = draftSt.bar.querySelector('#draft-angle-range');
    const num = draftSt.bar.querySelector('#draft-angle');
    if (rng && document.activeElement !== rng) rng.value = String(clamp(draftSt.minAngle, 0, 15));
    if (num && document.activeElement !== num) num.value = String(round(draftSt.minAngle, 2));
    const two = draftSt.bar.querySelector('#draft-two-sided');
    if (two) two.checked = !!draftSt.twoSided;
  }
  function drawDraft() {
    if (!draftSt) return;
    disposeDraftVisuals();
    const res = Viewer.draftAnalysis({ dir: draftSt.dir, minAngle: draftSt.minAngle, twoSided: draftSt.twoSided });
    draftSt.info = res;
    if (res.pos && res.pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(res.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(res.norms, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(res.colors, 3));
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.55, metalness: 0.04,
        transparent: true, opacity: 0.88, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 18;
      mesh.userData.noPick = true;
      Viewer.groups.overlay.add(mesh);
      draftSt.mesh = mesh;
    }
    const arrow = makeDraftArrow(res.box, draftSt.dir, draftSt.twoSided);
    if (arrow) { Viewer.groups.overlay.add(arrow); draftSt.arrow = arrow; }
    updateDraftUI();
    Viewer.requestRender();
  }
  function buildDraftBar() {
    if (!draftSt) return;
    if (draftSt.bar) draftSt.bar.remove();
    const barEl = h('div', { class: 'viewbar draft-bar', id: 'draft-bar', role: 'toolbar', 'aria-label': T('draft.title'), 'data-help': 'draftAnalysis' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('draft.title')));
    const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'draft-close', 'aria-label': T('draft.closeAria'), 'data-tip': T('common.close') });
    closeBtn.innerHTML = icon('close');
    closeBtn.onclick = () => draft(false);
    head.append(closeBtn);

    const dirSel = h('select', { id: 'draft-dir', class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': T('draft.dirAria') },
      h('option', { value: '+Z' }, T('draft.dirPosZ')),
      h('option', { value: '-Z' }, T('draft.dirNegZ')),
      h('option', { value: '+X' }, T('draft.dirPosX')),
      h('option', { value: '-X' }, T('draft.dirNegX')),
      h('option', { value: '+Y' }, T('draft.dirPosY')),
      h('option', { value: '-Y' }, T('draft.dirNegY')));
    dirSel.onchange = () => {
      if (dirSel.value === 'face') return;
      const norm = normalizeDraftDir(dirSel.value);
      draftSt.dirKey = norm.dirKey;
      draftSt.dir = norm.dir;
      syncDraftBarInputs();
      drawDraft();
    };
    const flipBtn = h('button', { type: 'button', class: 'btn small', id: 'draft-flip', 'aria-label': T('draft.flipTip'), 'data-tip': T('draft.flipTip') });
    flipBtn.innerHTML = icon('mirror');
    flipBtn.onclick = () => {
      const neg = [-draftSt.dir[0], -draftSt.dir[1], -draftSt.dir[2]];
      const norm = normalizeDraftDir(neg);
      draftSt.dirKey = norm.dirKey;
      draftSt.dir = norm.dir;
      syncDraftBarInputs();
      drawDraft();
    };
    const pickBtn = h('button', { type: 'button', class: 'btn small', id: 'draft-pick-face', 'data-tip': T('draft.pickFaceTip') }, T('draft.pickFace'));
    pickBtn.onclick = () => startDraftFacePick();

    const rng = h('input', { type: 'range', id: 'draft-angle-range', min: 0, max: 15, step: 0.5, value: clamp(draftSt.minAngle, 0, 15), 'aria-label': T('draft.angleAria') });
    const num = h('input', { type: 'number', id: 'draft-angle', class: 'vb-num', min: 0, max: 45, step: 0.5, value: round(draftSt.minAngle, 2), 'aria-label': T('draft.angleAria') });
    const setAngle = (raw) => {
      const v = parseFloat(String(raw).replace(',', '.'));
      if (!isFinite(v)) return;
      draftSt.minAngle = clamp(v, 0, 45);
      syncDraftBarInputs();
      drawDraft();
    };
    rng.oninput = () => setAngle(rng.value);
    num.oninput = () => setAngle(num.value);
    num.onchange = () => setAngle(num.value);
    num.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { setAngle(num.value); num.blur(); }
    };

    const twoCb = h('input', { type: 'checkbox', id: 'draft-two-sided' });
    twoCb.checked = !!draftSt.twoSided;
    twoCb.onchange = () => { draftSt.twoSided = twoCb.checked; drawDraft(); };

    const legend = h('div', { class: 'draft-legend' },
      h('div', { class: 'draft-chip', id: 'draft-ok' }, h('span', { class: 'draft-dot ok' }), h('span', { class: 'draft-lbl' }, T('draft.okLabel')), h('b', { class: 'mono', id: 'draft-ok-val' }, '0')),
      h('div', { class: 'draft-chip', id: 'draft-warn' }, h('span', { class: 'draft-dot warn' }), h('span', { class: 'draft-lbl' }, T('draft.warnLabel')), h('b', { class: 'mono', id: 'draft-warn-val' }, '0')),
      h('div', { class: 'draft-chip', id: 'draft-bad' }, h('span', { class: 'draft-dot bad' }), h('span', { class: 'draft-lbl' }, T('draft.badLabel')), h('b', { class: 'mono', id: 'draft-bad-val' }, '0')));

    barEl.append(
      head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('draft.dirLabel')), dirSel, flipBtn, pickBtn),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('draft.angleLabel')), rng, num, h('span', { class: 'vb-u' }, '°')),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint', 'data-tip': T('draft.twoSidedTip') }, twoCb, ' ', T('draft.twoSided'))),
      legend,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'draft-summary' }, '')));
    Views.bars().append(barEl);
    draftSt.bar = barEl;
    syncDraftBarInputs();
    updateDraftUI();
  }
  function draft(onArg = !draftSt, opts = {}) {
    if (!onArg) {
      if (!draftSt) return false;
      stopDraftFacePick();
      disposeDraftVisuals();
      if (draftSt.bar) draftSt.bar.remove();
      draftSt = null;
      syncDraftButtons();
      Viewer.requestRender();
      return false;
    }
    const norm = opts.dir !== undefined ? normalizeDraftDir(opts.dir) : (draftSt ? { dirKey: draftSt.dirKey, dir: draftSt.dir } : { dirKey: '+Z', dir: [0, 0, 1] });
    const angRaw = opts.minAngle !== undefined ? opts.minAngle : (opts.angle !== undefined ? opts.angle : (draftSt ? draftSt.minAngle : 1));
    const minAngle = clamp(Number(angRaw), 0, 45);
    const twoSided = opts.twoSided !== undefined ? !!opts.twoSided : (draftSt ? draftSt.twoSided : true);
    if (draftSt) {
      draftSt.dirKey = norm.dirKey;
      draftSt.dir = norm.dir;
      draftSt.minAngle = isFinite(minAngle) ? minAngle : 1;
      draftSt.twoSided = twoSided;
      syncDraftBarInputs();
      drawDraft();
      syncDraftButtons();
      return true;
    }
    draftSt = { dirKey: norm.dirKey, dir: norm.dir, minAngle: isFinite(minAngle) ? minAngle : 1, twoSided, bar: null, mesh: null, arrow: null, info: null, picking: null };
    buildDraftBar();
    drawDraft();
    syncDraftButtons();
    return true;
  }
  // ---------- PF-18: Prüfbericht als PDF (lokal erzeugt, mit Bild, Maßen, Volumen, Masse & Wandstärke) ----------
  let lastReport = null;
  function pdfWinAnsi(s) {
    return String(s ?? '')
      .replace(/[–—−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[„“”]/g, '"')
      .replace(/[‚‘’]/g, "'")
      .replace(/≈/g, 'ca. ')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=')
      .replace(/€/g, '\x80')
      .replace(/[^\x20-\x7e\x80\xa0-\xff]/g, '?');
  }
  function pdfEsc(s) {
    return pdfWinAnsi(s).replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  function toPdfBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }
  function dataUrlToBytes(url) {
    if (!url || typeof url !== 'string') return null;
    const idx = url.indexOf(';base64,');
    if (idx < 0) return null;
    const bin = atob(url.slice(idx + 8));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function pdfClip(s, maxChars) {
    const t = String(s ?? '');
    return t.length <= maxChars ? t : t.slice(0, Math.max(1, maxChars - 3)) + '...';
  }
  async function captureReportImage() {
    const ids = [...Viewer.nodes.values()]
      .filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.id !== '__dragprev' && n.mesh)
      .map((n) => n.id);
    if (!ids.length) return null;
    const w = 840, hgt = 500;
    let pngUrl = null;
    try {
      if (Viewer.renderPartThumb) pngUrl = Viewer.renderPartThumb(ids, w, hgt);
      if (!pngUrl && Viewer.renderImage) pngUrl = Viewer.renderImage(w, hgt, { bg: '#f8fafc', transparent: false });
    } catch (_) {
      pngUrl = null;
    }
    if (!pngUrl) return null;
    try {
      const jpg = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = hgt;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, w, hgt);
            ctx.drawImage(img, 0, 0, w, hgt);
            resolve(cv.toDataURL('image/jpeg', 0.9));
          } catch (_) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = pngUrl;
      });
      return jpg ? { jpg, w, h: hgt } : null;
    } catch (_) {
      return null;
    }
  }
  async function reportData(opts = {}) {
    const mRes = await Mass.measure();
    const st = typeof Print !== 'undefined' && Print.stats ? Print.stats() : null;
    const bbox = (mRes && mRes.bbox) || (st && st.box ? [st.box.min.x, st.box.min.y, st.box.min.z, st.box.max.x, st.box.max.y, st.box.max.z] : null);
    const dimsMm = bbox ? [Math.abs(bbox[3] - bbox[0]), Math.abs(bbox[4] - bbox[1]), Math.abs(bbox[5] - bbox[2])] : null;
    const mat = Mass.projectMaterial();
    const stab = mRes && mRes.parts && mRes.parts.length === 1 && mRes.parts[0].com ? Mass.stability(mRes.parts[0].id, mRes.parts[0].com) : null;
    const nozzleWall = typeof Print !== 'undefined' && Print.nozzleWallCheck ? Print.nozzleWallCheck() : null;
    let minWallMm = nozzleWall && nozzleWall.minT != null ? nozzleWall.minT : null;
    if (minWallMm == null && dimsMm) {
      const nodes = [...Viewer.nodes.values()].filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.id !== '__dragprev' && n.mesh && n.data && n.data.triangles);
      const totalTris = nodes.reduce((s, n) => s + ((n.data.triangles.length || 0) / 3), 0);
      if (nodes.length && totalTris <= 15000) {
        const scanLimit = Math.min(200, Math.max(5, Math.max(...dimsMm) + 1));
        const tw = Viewer.thinWalls(scanLimit, nodes.map((n) => n.id));
        if (tw && tw.minT != null) minWallMm = round(tw.minT + 1e-4, 2);
      }
    }
    const fit = typeof Print !== 'undefined' && Print.fitCheck ? Print.fitCheck() : null;
    const orient = typeof Print !== 'undefined' && Print.bestPrintOrientation ? Print.bestPrintOrientation() : null;
    const overhangArea = orient && orient.cur ? orient.cur.overhangArea : null;
    const overhangAngle = orient ? orient.angle : 45;
    const printEst = opts.includePrint === false
      ? null
      : (typeof Print !== 'undefined' && Print.computePrintEstimate ? Print.computePrintEstimate(mRes, opts.printOpts || {}) : null);
    const errors = (App.errors || []).map((e) => e.message);
    const geomIssues = (typeof GeomCheck !== 'undefined' && GeomCheck.last && GeomCheck.last.rev === App.revision) ? GeomCheck.last.issues.length : null;
    const parts = ((mRes && mRes.parts) || []).map((p) => {
      const f = Model.find(App.doc, p.id);
      const pb = Array.isArray(p.bbox) && p.bbox.length >= 6 ? p.bbox : null;
      return {
        id: p.id,
        name: f ? Model.label(f.item) : 'Körper',
        material: p.fixed ? 'Kaufteil' : (p.mat || (mat && mat.k) || '–'),
        dimsMm: pb ? [Math.abs(pb[3] - pb[0]), Math.abs(pb[4] - pb[1]), Math.abs(pb[5] - pb[2])] : null,
        volumeMm3: p.fixed ? null : (p.volume || 0),
        areaMm2: p.area || 0,
        massG: p.mass || 0,
        fixed: !!p.fixed,
        missing: !!p.missing,
      };
    });
    const image = opts.includeImage !== false ? await captureReportImage() : null;
    const docName = (App.doc && App.doc.name) || 'Neues Projekt';
    const isAsm = typeof Model !== 'undefined' && Model.isAssembly ? Model.isAssembly(App.doc) : false;
    return {
      name: docName,
      docKind: isAsm ? 'Baugruppe' : 'Bauteil',
      createdAt: new Date().toLocaleString('de-DE'),
      unit: Units.label(),
      dimsMm,
      volumeMm3: mRes ? (mRes.volume || 0) : 0,
      areaMm2: mRes ? (mRes.area || 0) : 0,
      massG: mRes ? (mRes.mass || 0) : 0,
      comMm: mRes && mRes.com ? mRes.com.slice(0, 3) : null,
      materialName: mat ? (mat.name || mat.k) : '–',
      materialKey: mat ? mat.k : '–',
      stability: stab,
      minWallMm,
      nozzleWall,
      fit,
      overhangArea,
      overhangAngle,
      printEst,
      errors,
      geomIssues,
      parts,
      partCount: parts.length,
      image,
    };
  }
  function buildReportPDF(data) {
    const W = 210, H = 297, PT = 72 / 25.4;
    const M = 15, CW = W - 2 * M;
    const pf = (n) => (Math.round(n * 1000) / 1000).toString();
    const pf2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
    const px = (x) => pf(x * PT);
    const py = (y) => pf((H - y) * PT);

    const fmtDims = (d) => d ? `${Units.fmtLen(d[0], 1)} x ${Units.fmtLen(d[1], 1)} x ${Units.fmtLen(d[2], 1)} ${Units.label()}` : '-';
    const fmtCom = (c) => c ? `${c.map((v) => Units.fmtLen(v, 1)).join(' / ')} ${Units.label()}` : '-';
    const fmtStab = (s) => !s ? 'nur bei Einzelteil' : (s.ok ? `Ja (kippt ab ${fmtAngleU(s.angle)})` : 'Nein (kippt um)');

    const pages = [];
    const newPage = () => { const pg = { cmds: [], hasImg: false }; pages.push(pg); return pg; };
    const rect = (pg, x, y, w, hgt, fill, stroke, lw = 0.25) => {
      if (fill) pg.cmds.push(`${fill} rg ${px(x)} ${py(y + hgt)} ${pf(w * PT)} ${pf(hgt * PT)} re f`);
      if (stroke) pg.cmds.push(`${stroke} RG ${pf(lw * PT)} w ${px(x)} ${py(y + hgt)} ${pf(w * PT)} ${pf(hgt * PT)} re S`);
    };
    const line = (pg, x1, y1, x2, y2, stroke = '0.82 0.85 0.89', lw = 0.25) => {
      pg.cmds.push(`${stroke} RG ${pf(lw * PT)} w ${px(x1)} ${py(y1)} m ${px(x2)} ${py(y2)} l S`);
    };
    const txt = (pg, x, y, textStr, sizePt = 9.5, bold = false, color = '0.09 0.11 0.14', align = 'left') => {
      const s = pdfEsc(textStr);
      const font = bold ? '/F2' : '/F1';
      let dx = 0;
      if (align !== 'left') {
        const approxW = pdfWinAnsi(textStr).length * sizePt * 0.52;
        dx = align === 'right' ? -approxW : -approxW / 2;
      }
      pg.cmds.push(`${color} rg BT ${font} ${pf(sizePt)} Tf ${px(x)} ${py(y)} Td ${pf(dx)} 0 Td (${s}) Tj ET`);
    };
    const kv = (pg, x, y, w, label, val, valBold = true) => {
      txt(pg, x, y, label, 8.8, false, '0.35 0.40 0.47', 'left');
      txt(pg, x + w, y, val, 8.8, valBold, '0.09 0.11 0.14', 'right');
    };

    const pg1 = newPage();
    // Kopfzeile
    rect(pg1, 0, 0, W, 24, '0.07 0.11 0.16', null);
    txt(pg1, M, 10.5, 'Prüfbericht', 16, true, '1 1 1');
    txt(pg1, M, 17.5, pdfClip(data.name, 56), 10.5, false, '0.82 0.89 0.95');
    txt(pg1, W - M, 10.5, `Erstellt: ${data.createdAt}`, 8.5, false, '0.82 0.89 0.95', 'right');
    txt(pg1, W - M, 17.5, `${data.docKind} | ${data.partCount} ${data.partCount === 1 ? 'Körper' : 'Körper'} | Einheit: ${data.unit}`, 8.5, false, '0.70 0.78 0.85', 'right');

    let y = 30;
    // 3D-Vorschaubild
    if (data.image && data.image.jpg) {
      const boxH = 68;
      rect(pg1, M, y, CW, boxH, '0.97 0.98 0.99', '0.82 0.85 0.89', 0.3);
      const pad = 2;
      const maxW = CW - 2 * pad, maxH = boxH - 2 * pad;
      const ratio = (data.image.w || 840) / (data.image.h || 500);
      let iw = maxW, ih = iw / ratio;
      if (ih > maxH) { ih = maxH; iw = ih * ratio; }
      const ix = M + (CW - iw) / 2, iy = y + (boxH - ih) / 2;
      pg1.cmds.push(`q ${pf(iw * PT)} 0 0 ${pf(ih * PT)} ${px(ix)} ${py(iy + ih)} cm /Im1 Do Q`);
      pg1.hasImg = true;
      y += boxH + 6;
    }

    // Zwei-Spalten-Kennzahlen: Maße & Geometrie | Masse & Werkstoff
    const colW = (CW - 6) / 2;
    const cardH = 34;
    rect(pg1, M, y, colW, cardH, '0.98 0.985 0.99', '0.84 0.87 0.91', 0.25);
    rect(pg1, M + colW + 6, y, colW, cardH, '0.98 0.985 0.99', '0.84 0.87 0.91', 0.25);
    txt(pg1, M + 4, y + 6, 'Maße & Geometrie', 10, true, '0.07 0.42 0.39');
    line(pg1, M + 4, y + 8.5, M + colW - 4, y + 8.5);
    kv(pg1, M + 4, y + 13.5, colW - 8, 'Hüllmaße (B x T x H)', fmtDims(data.dimsMm));
    kv(pg1, M + 4, y + 19.5, colW - 8, 'Volumen', data.volumeMm3 > 0 ? Units.fmtVolU(data.volumeMm3, 3) : '-');
    kv(pg1, M + 4, y + 25.5, colW - 8, 'Oberfläche', data.areaMm2 > 0 ? Units.fmtAreaU(data.areaMm2, 2) : '-');
    kv(pg1, M + 4, y + 31.2, colW - 8, 'Sichtbare Teile', String(data.partCount));

    const rx = M + colW + 6;
    txt(pg1, rx + 4, y + 6, 'Masse & Werkstoff', 10, true, '0.07 0.42 0.39');
    line(pg1, rx + 4, y + 8.5, rx + colW - 4, y + 8.5);
    kv(pg1, rx + 4, y + 13.5, colW - 8, 'Werkstoff', pdfClip(data.materialKey || '-', 28));
    kv(pg1, rx + 4, y + 19.5, colW - 8, 'Masse (gesamt)', Mass.gText(data.massG || 0));
    kv(pg1, rx + 4, y + 25.5, colW - 8, 'Schwerpunkt', fmtCom(data.comMm));
    kv(pg1, rx + 4, y + 31.2, colW - 8, 'Standfestigkeit', fmtStab(data.stability));
    y += cardH + 6;

    // Wandstärke & Prüfungen
    const chkH = 40;
    rect(pg1, M, y, CW, chkH, '1 1 1', '0.84 0.87 0.91', 0.25);
    txt(pg1, M + 4, y + 6, 'Wandstärke & Prüfungen', 10, true, '0.07 0.42 0.39');
    line(pg1, M + 4, y + 8.5, M + CW - 4, y + 8.5);
    const wallTxt = data.minWallMm != null ? Units.fmtLenU(data.minWallMm, 2) : 'nicht ermittelt';
    const nwTxt = data.nozzleWall
      ? (data.nozzleWall.warn
        ? `Warnung: duennste Stelle ${Units.fmtLenU(data.nozzleWall.minT, 2)} (< ${Units.fmtLenU(data.nozzleWall.minWall, 2)})`
        : `OK (Düse ${fmtFixed(data.nozzleWall.nozzle, 2)} mm, mind. ${Units.fmtLenU(data.nozzleWall.minWall, 2)})`)
      : '-';
    const fitTxt = !data.fit ? '-' : (!data.fit.active ? 'Druckbett aus' : (data.fit.fits ? `Passt in ${data.fit.printerName}` : `Zu groß für ${data.fit.printerName}`));
    const ovTxt = data.overhangArea != null
      ? (data.overhangArea < 0.5 ? `Keine nennenswerten Überhänge (${fmtAngleU(data.overhangAngle)})` : `${Units.fmtAreaU(data.overhangArea, 1)} (Grenzwinkel ${fmtAngleU(data.overhangAngle)})`)
      : '-';
    const stTxt = data.errors && data.errors.length
      ? `${data.errors.length} Rechenfehler`
      : (data.geomIssues != null ? (data.geomIssues === 0 ? 'Modell OK (Geometrie-Prüfung 0 Funde)' : `${data.geomIssues} Geometrie-Funde`) : 'Keine Rechenfehler');

    kv(pg1, M + 4, y + 13.5, CW - 8, 'Kleinste Wandstärke (gemessen)', wallTxt);
    kv(pg1, M + 4, y + 19.5, CW - 8, 'Düsen-Wandprüfung (2 x Düse)', nwTxt, false);
    kv(pg1, M + 4, y + 25.5, CW - 8, 'Bauraum / Druckbett', fitTxt, false);
    kv(pg1, M + 4, y + 31.5, CW - 8, 'Überhänge (Ist-Lage)', ovTxt, false);
    kv(pg1, M + 4, y + 37.2, CW - 8, 'Modell-Status', stTxt, false);
    y += chkH + 6;

    // 3D-Druck (Schätzung)
    if (data.printEst) {
      const pe = data.printEst;
      const prH = 38;
      rect(pg1, M, y, CW, prH, '0.98 0.985 0.99', '0.84 0.87 0.91', 0.25);
      txt(pg1, M + 4, y + 6, '3D-Druck (Schätzung)', 10, true, '0.07 0.42 0.39');
      line(pg1, M + 4, y + 8.5, M + CW - 4, y + 8.5);
      if (pe.ok) {
        kv(pg1, M + 4, y + 13.5, CW - 8, 'Drucker & Material', `${pe.printerName} | ${pe.material} (Düse ${fmtFixed(pe.nozzle, 2)} mm)`, false);
        kv(pg1, M + 4, y + 19.5, CW - 8, 'Einstellungen', `${pe.infill} % Füllung, ${fmtFixed(pe.layerHeight, 2)} mm Schicht, ${pe.walls} Wände, ${pe.layers} Schichten`, false);
        kv(pg1, M + 4, y + 25.5, CW - 8, 'Filament & Druckzeit (Schätzung)', `${Mass.gText(pe.filamentG)} (${fmtFixed(pe.filamentM, 2)} m) | ca. ${pe.timeText}`);
        kv(pg1, M + 4, y + 31.5, CW - 8, `Materialkosten (bei ${Mass.priceText(pe.pricePerKg)}/kg)`, `ca. ${Mass.priceText(pe.costEur)}`);
        txt(pg1, M + 4, y + 36.2, 'Hinweis: Schätzung ohne Stützen - tatsächliche Werte hängen vom Slicer ab.', 7.5, false, '0.42 0.47 0.54');
      } else {
        txt(pg1, M + 4, y + 15, 'Keine druckbaren Teile mit Volumen vorhanden.', 8.8, false, '0.42 0.47 0.54');
      }
      y += prH + 6;
    }

    // Teileübersicht (ggf. mit automatischem Seitenumbruch auf Seite 2)
    if (data.parts && data.parts.length) {
      let curPg = pg1;
      const drawTableHead = (pg, yy) => {
        txt(pg, M, yy + 4.5, 'Teileübersicht', 10, true, '0.07 0.42 0.39');
        const ty = yy + 7;
        rect(pg, M, ty, CW, 6.5, '0.92 0.94 0.96', '0.82 0.85 0.89', 0.25);
        txt(pg, M + 2.5, ty + 4.5, 'Teil', 8.2, true);
        txt(pg, M + 52, ty + 4.5, 'Werkstoff', 8.2, true);
        txt(pg, M + 82, ty + 4.5, `Maße (${data.unit})`, 8.2, true);
        txt(pg, M + 150, ty + 4.5, 'Volumen', 8.2, true, '0.09 0.11 0.14', 'right');
        txt(pg, M + CW - 2.5, ty + 4.5, 'Masse', 8.2, true, '0.09 0.11 0.14', 'right');
        return ty + 6.5;
      };
      if (y > H - 36) { curPg = newPage(); y = 20; }
      y = drawTableHead(curPg, y);
      for (const p of data.parts) {
        if (y + 6 > H - 18) {
          curPg = newPage();
          y = drawTableHead(curPg, 20);
        }
        rect(curPg, M, y, CW, 5.8, '1 1 1', '0.88 0.90 0.93', 0.2);
        const dimStr = p.dimsMm ? `${Units.fmtLen(p.dimsMm[0], 1)} x ${Units.fmtLen(p.dimsMm[1], 1)} x ${Units.fmtLen(p.dimsMm[2], 1)}` : '-';
        const volStr = p.volumeMm3 != null ? Units.fmtVolU(p.volumeMm3, 2) : '-';
        const massStr = p.missing ? 'fehlt' : Mass.gText(p.massG);
        txt(curPg, M + 2.5, y + 4.1, pdfClip(p.name, 26), 8.2, false);
        txt(curPg, M + 52, y + 4.1, pdfClip(p.material, 16), 8.2, false);
        txt(curPg, M + 82, y + 4.1, pdfClip(dimStr, 26), 8.2, false);
        txt(curPg, M + 150, y + 4.1, volStr, 8.2, false, '0.09 0.11 0.14', 'right');
        txt(curPg, M + CW - 2.5, y + 4.1, massStr, 8.2, false, '0.09 0.11 0.14', 'right');
        y += 5.8;
      }
    }

    // Fußzeile auf jeder Seite
    pages.forEach((pg, idx) => {
      line(pg, M, H - 13, W - M, H - 13, '0.84 0.87 0.91', 0.25);
      txt(pg, M, H - 8.5, 'Tracery Prüfbericht - lokal im Browser erzeugt', 8, false, '0.45 0.50 0.57');
      txt(pg, W - M, H - 8.5, `Seite ${idx + 1} / ${pages.length}`, 8, false, '0.45 0.50 0.57', 'right');
    });

    // PDF-1.4-Datei zusammensetzen
    const objs = [];
    const addObj = (bodyBytes) => { objs.push(bodyBytes); return objs.length; };
    const addStr = (s) => addObj(toPdfBytes(s));
    addStr(''); // 1: Catalog
    addStr(''); // 2: Pages
    const f1 = addStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = addStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const infoId = addStr(`<< /Title (${pdfEsc('Prüfbericht - ' + data.name)}) /Creator (Tracery) >>`);

    let imId = null;
    if (data.image && data.image.jpg) {
      const imgBytes = dataUrlToBytes(data.image.jpg);
      if (imgBytes && imgBytes.length >= 4 && imgBytes[0] === 0xff && imgBytes[1] === 0xd8) {
        const ih = toPdfBytes(`<< /Type /XObject /Subtype /Image /Width ${data.image.w || 840} /Height ${data.image.h || 500} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
        const it = toPdfBytes('\nendstream');
        const imObj = new Uint8Array(ih.length + imgBytes.length + it.length);
        imObj.set(ih, 0); imObj.set(imgBytes, ih.length); imObj.set(it, ih.length + imgBytes.length);
        imId = addObj(imObj);
      }
    }

    const kids = [];
    for (const pg of pages) {
      const sBytes = toPdfBytes(pg.cmds.join('\n') + '\n');
      const head = toPdfBytes(`<< /Length ${sBytes.length} >>\nstream\n`);
      const tail = toPdfBytes('\nendstream');
      const cObj = new Uint8Array(head.length + sBytes.length + tail.length);
      cObj.set(head, 0); cObj.set(sBytes, head.length); cObj.set(tail, head.length + sBytes.length);
      const cId = addObj(cObj);
      const xobj = pg.hasImg && imId ? ` /XObject << /Im1 ${imId} 0 R >>` : '';
      const pId = addStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pf2(W * PT)} ${pf2(H * PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> /Contents ${cId} 0 R >>`);
      kids.push(pId);
    }
    objs[0] = toPdfBytes('<< /Type /Catalog /Pages 2 0 R >>');
    objs[1] = toPdfBytes(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);

    const chunks = [];
    const hdr = toPdfBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    chunks.push(hdr);
    let pos = hdr.length;
    const offsets = [0];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(pos);
      const pre = toPdfBytes(`${i + 1} 0 obj\n`);
      const post = toPdfBytes('\nendobj\n');
      chunks.push(pre, objs[i], post);
      pos += pre.length + objs[i].length + post.length;
    }
    const xrefPos = pos;
    const xrefLines = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`];
    for (let i = 1; i <= objs.length; i++) {
      xrefLines.push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    xrefLines.push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    const tailBytes = toPdfBytes(xrefLines.join(''));
    chunks.push(tailBytes);
    pos += tailBytes.length;
    const out = new Uint8Array(pos);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  async function exportReportPDF(opts = {}) {
    if (!App.doc || !App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) {
      UI.toast(T('report.empty'), { icon: 'info' });
      return null;
    }
    const tst = UI.toast(T('report.building'), { icon: 'file', ms: 15000 });
    try {
      const data = opts.data || await reportData(opts);
      const bytes = buildReportPDF(data);
      const filename = `${Print.safeName(data.name)} Prüfbericht.pdf`;
      lastReport = { filename, bytes: bytes.length, data, pdfBytes: bytes };
      tst.remove();
      await Print.save(filename, new Blob([bytes], { type: 'application/pdf' }));
      return lastReport;
    } catch (e) {
      tst.remove();
      UI.toast('Prüfbericht hat nicht geklappt: ' + e.message, { kind: 'bad' });
      return null;
    }
  }
  async function reportDialog() {
    if (!App.doc || !App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) {
      UI.toast(T('report.empty'), { icon: 'info' });
      return null;
    }
    let incImg = true, incPrint = true, curData = null;
    const body = h('div', { class: 'rep-dlg', id: 'report-pdf-dlg' },
      h('div', { class: 'hint-box', id: 'rep-loading' }, T('report.loading')));
    UI.modal({
      title: T('report.title'),
      body,
      wide: true,
      actions: [
        { id: 'rep-open-cost', label: T('report.costBtn'), run: () => { setTimeout(() => Print.costDialog(), 0); } },
        { label: T('common.cancel') },
        {
          id: 'rep-download', label: T('report.savePdf'), primary: true,
          run: () => {
            const d = curData ? { ...curData, image: incImg ? curData.image : null, printEst: incPrint ? curData.printEst : null } : null;
            exportReportPDF({ includeImage: incImg, includePrint: incPrint, data: d });
          },
        },
      ],
    });

    curData = await reportData({ includeImage: true, includePrint: true });
    if (!body.isConnected) return null;
    body.innerHTML = '';

    const imgWrap = h('div', { class: 'rep-preview' });
    if (curData.image && curData.image.jpg) {
      imgWrap.append(h('img', { id: 'rep-preview-img', src: curData.image.jpg, alt: T('report.previewAlt') }));
    }
    const fmtDims = curData.dimsMm
      ? `${Units.fmtLen(curData.dimsMm[0], 1)} × ${Units.fmtLen(curData.dimsMm[1], 1)} × ${Units.fmtLen(curData.dimsMm[2], 1)} ${Units.label()}`
      : '–';
    const wallTxt = curData.minWallMm != null
      ? Units.fmtLenU(curData.minWallMm, 2) + (curData.nozzleWall ? (curData.nozzleWall.warn ? ` (${T('report.wallWarn')})` : ` (${T('report.wallOk')})`) : '')
      : '–';
    const pe = curData.printEst;
    const printTxt = pe && pe.ok
      ? `${Mass.gText(pe.filamentG)} · ca. ${pe.timeText} · ${Mass.priceText(pe.costEur)}`
      : '–';

    const sum = h('div', { class: 'mini-list rep-summary', id: 'rep-summary' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.dims')), h('b', { class: 'mono', id: 'rep-val-dims' }, fmtDims)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.volume')), h('b', { class: 'mono', id: 'rep-val-vol' }, curData.volumeMm3 > 0 ? Units.fmtVolU(curData.volumeMm3, 3) : '–')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.area')), h('b', { class: 'mono', id: 'rep-val-area' }, curData.areaMm2 > 0 ? Units.fmtAreaU(curData.areaMm2, 2) : '–')),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.mass')), h('b', { class: 'mono', id: 'rep-val-mass' }, `${Mass.gText(curData.massG || 0)} (${curData.materialKey})`)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.wall')), h('b', { class: 'mono', id: 'rep-val-wall' }, wallTxt)),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('report.printEst')), h('b', { class: 'mono', id: 'rep-val-cost' }, printTxt))
    );

    const cbImg = h('input', { type: 'checkbox', id: 'rep-inc-img', checked: true });
    cbImg.onchange = () => { incImg = cbImg.checked; imgWrap.hidden = !incImg; };
    const cbPrint = h('input', { type: 'checkbox', id: 'rep-inc-print', checked: true });
    cbPrint.onchange = () => { incPrint = cbPrint.checked; };

    const grid = h('div', { class: 'rep-grid' });
    if (curData.image && curData.image.jpg) grid.append(imgWrap);
    grid.append(sum);
    body.append(
      grid,
      h('div', { class: 'rep-opts' },
        h('label', { class: 'check' }, cbImg, T('report.incImg')),
        h('label', { class: 'check' }, cbPrint, T('report.incPrint'))),
      h('div', { class: 'hint-box' }, T('report.hint'))
    );
    return body;
  }

  // ---------- Schattenriss-Fläche in Blickrichtung (PF-15) ----------
  const SIL_DIRS = { front: [0, 1, 0], back: [0, -1, 0], right: [-1, 0, 0], left: [1, 0, 0], top: [0, 0, -1], bottom: [0, 0, 1] };
  let silSt = null, silCamTimer = null, silLastCamT = 0;

  function cameraViewDir() {
    if (!Viewer.activeCamera || !Viewer.controls) return [0, 1, 0];
    const d = Viewer.controls.target.clone().sub(Viewer.activeCamera.position);
    if (d.lengthSq() < 1e-9) return [0, 1, 0];
    return d.normalize().toArray();
  }
  function normalizeSilDir(val) {
    if (!val || val === 'camera') return { dirKey: 'camera', dir: cameraViewDir() };
    if (typeof val === 'string' && SIL_DIRS[val]) return { dirKey: val, dir: SIL_DIRS[val].slice() };
    if (Array.isArray(val) && val.length >= 3) {
      const x = Number(val[0]) || 0, y = Number(val[1]) || 0, z = Number(val[2]) || 0;
      const l = Math.hypot(x, y, z);
      if (l > 1e-9) {
        const u = [x / l, y / l, z / l];
        for (const [k, d] of Object.entries(SIL_DIRS)) {
          if (u[0] * d[0] + u[1] * d[1] + u[2] * d[2] > 0.9999) return { dirKey: k, dir: d.slice() };
        }
        return { dirKey: 'face', dir: u };
      }
    }
    return { dirKey: 'camera', dir: cameraViewDir() };
  }
  function silTargetIds(onlySel) {
    const visibleSolids = [...Viewer.nodes.entries()].filter(([, n]) => n && n.obj.visible && n.role !== 'hole' && n.mesh && !n.allBodiesHidden);
    if (onlySel && App.sel && App.sel.length) {
      const wanted = new Set();
      for (const sid of App.sel) {
        let cur = sid, guard = 0;
        while (cur && App.mergedInto && App.mergedInto(cur) && guard++ < 12) cur = App.mergedInto(cur);
        const top = Model.topOf(App.doc, cur);
        if (top) wanted.add(top.id);
      }
      const sub = visibleSolids.filter(([id]) => wanted.has(id)).map(([id]) => id);
      if (sub.length) return sub;
    }
    return visibleSolids.map(([id]) => id);
  }
  function silhouetteArea(opts = {}) {
    const dirArg = opts.dir !== undefined ? opts.dir : (silSt ? silSt.dirKey : 'camera');
    const norm = normalizeSilDir(dirArg);
    const onlySel = opts.onlySel !== undefined ? !!opts.onlySel : !!(silSt && silSt.onlySel);
    const ids = Array.isArray(opts.ids) && opts.ids.length ? opts.ids : silTargetIds(onlySel);
    if (!ids.length) {
      return { area: 0, areaMm2: 0, width: 0, height: 0, px: 0, dirKey: norm.dirKey, dir: norm.dir, count: 0, onlySel };
    }
    const r = Viewer.silhouette(ids, norm.dir, opts.res || 1024);
    const area = round(r.area || 0, 3);
    return {
      area,
      areaMm2: area,
      width: round(r.width || 0, 2),
      height: round(r.height || 0, 2),
      px: r.px || 0,
      dirKey: norm.dirKey,
      dir: norm.dir,
      count: ids.length,
      onlySel,
      c: r.c || null,
      R: r.R || 20,
    };
  }
  function stopSilFacePick() {
    if (!silSt || !silSt.picking) return;
    const pk = silSt.picking;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', pk.down, true);
    window.removeEventListener('keydown', pk.key, true);
    cv.style.cursor = '';
    UI.hint(null);
    silSt.picking = null;
    const btn = silSt.bar && silSt.bar.querySelector('#sil-pick-face');
    if (btn) btn.classList.remove('active');
  }
  function startSilFacePick() {
    if (!silSt) return;
    if (silSt.picking) { stopSilFacePick(); return; }
    if (on) stop();
    stopFieldPick();
    stopDraftFacePick();
    const cv = Viewer.canvas;
    const btn = silSt.bar && silSt.bar.querySelector('#sil-pick-face');
    if (btn) btn.classList.add('active');
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const f = hit && hit.faceIdx >= 0 && hit.node && hit.node.data && hit.node.data.faces ? hit.node.data.faces[hit.faceIdx] : null;
      if (!f || f.t !== 'PLANE' || !f.n) {
        UI.toast(T('sil.pickFaceNeedPlane'), { icon: 'info' });
        return;
      }
      const wn = new THREE.Vector3(...f.n).transformDirection(hit.node.obj.matrixWorld).normalize().negate().toArray();
      const norm = normalizeSilDir(wn);
      stopSilFacePick();
      if (!silSt) return;
      silSt.dirKey = norm.dirKey;
      silSt.dir = norm.dir;
      syncSilBarInputs();
      drawSilhouette();
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        stopSilFacePick();
      }
    };
    silSt.picking = { down, key };
    cv.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(T('sil.pickFaceHint'));
  }
  function alignCamToSil() {
    if (!silSt) return;
    const k = silSt.dirKey;
    if (SIL_DIRS[k]) {
      Viewer.setView(k, false);
      return;
    }
    const r = silSt.info;
    const d = silSt.dir || [0, 1, 0];
    const c = r && r.c ? r.c : [0, 0, 0];
    const span = Math.max(20, (r && r.R ? r.R : 20) * 1.4);
    const nVec = new THREE.Vector3(-d[0], -d[1], -d[2]).normalize();
    const refUp = Math.abs(nVec.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const xVec = new THREE.Vector3().crossVectors(refUp, nVec).normalize();
    Viewer.lookAtPlane(c, nVec.toArray(), xVec.toArray(), span, false);
  }
  function updateSilUI() {
    if (!silSt || !silSt.bar) return;
    const r = silSt.info;
    const valEl = silSt.bar.querySelector('#sil-area-val');
    const dimsEl = silSt.bar.querySelector('#sil-dims');
    const copyBtn = silSt.bar.querySelector('#sil-copy');
    const alignBtn = silSt.bar.querySelector('#sil-align-cam');
    if (alignBtn) alignBtn.disabled = silSt.dirKey === 'camera';
    if (!r || !r.count) {
      if (valEl) valEl.textContent = '0 mm²';
      if (dimsEl) dimsEl.textContent = T('sil.empty');
      if (copyBtn) copyBtn.disabled = true;
      return;
    }
    const dec = r.area < 100 ? 2 : 1;
    const mm2Str = fmt(r.area, dec) + ' mm²';
    const extraUnit = typeof Units !== 'undefined' && Units.key() !== 'mm' ? ` (${Units.fmtAreaU(r.area, 2)})` : '';
    if (valEl) valEl.textContent = mm2Str + extraUnit;
    if (copyBtn) copyBtn.disabled = !(r.area > 0);
    if (dimsEl) {
      const szStr = `${Units.fmtLen(r.width, 1)} × ${Units.fmtLen(r.height, 1)} ${Units.label()}`;
      const scope = r.onlySel ? T('sil.scopeSel', { n: r.count }) : T('sil.scopeAll', { n: r.count });
      dimsEl.textContent = T('sil.dimsInfo', { size: szStr, scope });
    }
  }
  function syncSilBarInputs() {
    if (!silSt || !silSt.bar) return;
    const selEl = silSt.bar.querySelector('#sil-dir');
    if (selEl) {
      let faceOpt = selEl.querySelector('option[value="face"]');
      if (silSt.dirKey === 'face') {
        if (!faceOpt) { faceOpt = h('option', { value: 'face' }, T('sil.dirFace')); selEl.append(faceOpt); }
        selEl.value = 'face';
      } else {
        if (faceOpt) faceOpt.remove();
        selEl.value = silSt.dirKey;
      }
    }
    const cb = silSt.bar.querySelector('#sil-only-sel');
    if (cb) cb.checked = !!silSt.onlySel;
  }
  function drawSilhouette() {
    if (!silSt) return;
    silSt.info = silhouetteArea({ dir: silSt.dirKey === 'camera' ? 'camera' : silSt.dir, onlySel: silSt.onlySel });
    silSt.dir = silSt.info.dir.slice();
    updateSilUI();
  }
  function onSilCamera() {
    if (!silSt || silSt.dirKey !== 'camera') return;
    const now = performance.now();
    if (now - silLastCamT >= 90) {
      if (silCamTimer) { clearTimeout(silCamTimer); silCamTimer = null; }
      silLastCamT = now;
      drawSilhouette();
    } else if (!silCamTimer) {
      silCamTimer = setTimeout(() => {
        silCamTimer = null;
        silLastCamT = performance.now();
        if (silSt && silSt.dirKey === 'camera') drawSilhouette();
      }, 90);
    }
  }
  function buildSilBar() {
    if (!silSt) return;
    if (silSt.bar) silSt.bar.remove();
    const barEl = h('div', { class: 'viewbar sil-bar', id: 'silhouette-bar', role: 'toolbar', 'aria-label': T('sil.title'), 'data-help': 'silhouetteArea' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('sil.title')));
    const closeBtn = h('button', { type: 'button', class: 'vb-x', id: 'sil-close', 'aria-label': T('sil.closeAria'), 'data-tip': T('common.close') });
    closeBtn.innerHTML = icon('close');
    closeBtn.onclick = () => silhouette(false);
    head.append(closeBtn);

    const dirSel = h('select', { id: 'sil-dir', class: 'vb-sel', style: { flex: '1', minWidth: '0' }, 'aria-label': T('sil.dirAria') },
      h('option', { value: 'camera' }, T('sil.dirCamera')),
      h('option', { value: 'front' }, T('sil.dirFront')),
      h('option', { value: 'back' }, T('sil.dirBack')),
      h('option', { value: 'right' }, T('sil.dirRight')),
      h('option', { value: 'left' }, T('sil.dirLeft')),
      h('option', { value: 'top' }, T('sil.dirTop')),
      h('option', { value: 'bottom' }, T('sil.dirBottom')));
    dirSel.onchange = () => {
      if (dirSel.value === 'face') return;
      const norm = normalizeSilDir(dirSel.value);
      silSt.dirKey = norm.dirKey;
      silSt.dir = norm.dir;
      syncSilBarInputs();
      drawSilhouette();
    };
    const pickBtn = h('button', { type: 'button', class: 'btn small', id: 'sil-pick-face', 'data-tip': T('sil.pickFaceTip') }, T('sil.pickFace'));
    pickBtn.onclick = () => startSilFacePick();
    const alignBtn = h('button', { type: 'button', class: 'btn small', id: 'sil-align-cam', 'data-tip': T('sil.alignCamTip') }, T('sil.alignCam'));
    alignBtn.onclick = () => alignCamToSil();

    const onlyCb = h('input', { type: 'checkbox', id: 'sil-only-sel' });
    onlyCb.checked = !!silSt.onlySel;
    onlyCb.onchange = () => { silSt.onlySel = onlyCb.checked; drawSilhouette(); };

    const copyBtn = h('button', { type: 'button', class: 'btn small', id: 'sil-copy', 'aria-label': T('measure.copyBtn'), 'data-tip': T('measure.copyTip') });
    copyBtn.innerHTML = icon('copy');
    copyBtn.onclick = () => { if (silSt && silSt.info) copyText(fmt(silSt.info.area, silSt.info.area < 100 ? 2 : 1), T('sil.title')); };

    const resBox = h('div', { class: 'sil-result' },
      h('div', { class: 'sil-res-main' },
        h('span', { class: 'sil-lbl' }, T('sil.areaLabel')),
        h('b', { class: 'mono', id: 'sil-area-val' }, '–')),
      copyBtn);

    barEl.append(
      head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, T('sil.dirLabel')), dirSel, pickBtn, alignBtn),
      h('div', { class: 'vb-row' }, h('label', { class: 'vb-hint', 'data-tip': T('sil.onlySelTip') }, onlyCb, ' ', T('sil.onlySel'))),
      resBox,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint', id: 'sil-dims' }, '')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, T('sil.hint'))));
    Views.bars().append(barEl);
    silSt.bar = barEl;
    syncSilBarInputs();
    updateSilUI();
  }
  function silhouette(onArg = !silSt, opts = {}) {
    if (!onArg) {
      if (!silSt) return false;
      stopSilFacePick();
      if (silCamTimer) { clearTimeout(silCamTimer); silCamTimer = null; }
      if (silSt.bar) silSt.bar.remove();
      silSt = null;
      syncDraftButtons();
      return false;
    }
    const norm = opts.dir !== undefined ? normalizeSilDir(opts.dir) : (silSt ? normalizeSilDir(silSt.dirKey === 'camera' ? 'camera' : silSt.dir) : normalizeSilDir('camera'));
    const onlySel = opts.onlySel !== undefined ? !!opts.onlySel : (silSt ? silSt.onlySel : false);
    if (silSt) {
      silSt.dirKey = norm.dirKey;
      silSt.dir = norm.dir;
      silSt.onlySel = onlySel;
      syncSilBarInputs();
      drawSilhouette();
      syncDraftButtons();
      return true;
    }
    silSt = { dirKey: norm.dirKey, dir: norm.dir, onlySel, bar: null, info: null, picking: null };
    buildSilBar();
    drawSilhouette();
    syncDraftButtons();
    return true;
  }
  return {
    showCoords, get coords() { return coordsNow; }, updateStatus, setCalcBusy, get statusInfo() { return { ...statusState }; }, copyText, copyValue, get copied() { return copied; }, minDistance, clearDist, init, toggle, start, stop, refreshDisplay,
    get active() { return on; }, get result() { return last ? last.text : (els[0] ? els[0].textContent : null); },
    list, find, keep, relink, setHidden, rename, remove, select, drawSaved, treeSection, renderPanel, get selected() { return sel; },
    pickEdgeForField, stopFieldPick, syncMeasuredParams, unlinkMeasuredParam, buildEdgeMeasureRef, resolveMeasuredEdge, get pickingField() { return !!fieldPick; },
    draft, get draftActive() { return !!draftSt; },
    get draftInfo() {
      if (!draftSt) return null;
      const r = draftSt.info;
      return {
        active: true, dirKey: draftSt.dirKey, dir: draftSt.dir.slice(), minAngle: draftSt.minAngle, twoSided: draftSt.twoSided,
        areas: r ? { ...r.areas } : { ok: 0, warn: 0, undercut: 0, total: 0 },
        counts: r ? { ...r.counts } : { ok: 0, warn: 0, undercut: 0 },
        faces: r ? r.faces.map((f) => ({ ...f })) : [],
        hasMesh: !!draftSt.mesh,
      };
    },
    reportData, buildReportPDF, exportReportPDF, reportDialog, get lastReport() { return lastReport; },
    silhouette, silhouetteArea, get silhouetteActive() { return !!silSt; },
    get silhouetteInfo() {
      if (!silSt) return null;
      const r = silSt.info;
      return {
        active: true,
        dirKey: silSt.dirKey,
        dir: silSt.dir.slice(),
        onlySel: silSt.onlySel,
        area: r ? r.area : 0,
        areaMm2: r ? r.areaMm2 : 0,
        width: r ? r.width : 0,
        height: r ? r.height : 0,
        px: r ? r.px : 0,
        count: r ? r.count : 0,
      };
    },
  };
})();

