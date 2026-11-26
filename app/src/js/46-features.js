// ================= Features: Muster, Spiegeln mit Kopie, Teilen, Schnittmenge, Wandstärke =================
// Muster, Spiegelung, Teilen und Schnittmenge sind Gruppen mit einer Rechenvorschrift (p.op).
// Die Gruppe sitzt im Ursprung ihrer Ebene (oberste Ebene oder die umgebende Gruppe), ihre Teile behalten
// ihre Lage. Der CAD-Kern rechnet die Vorschrift nach jeder Änderung neu – ändert man das Original,
// ziehen alle Kopien mit. So lässt sich auch ein Loch in einer Platte im Kreis vervielfachen.
const Features = (() => {
  const NAMES = { rect: 'Rechteckmuster', circ: 'Kreismuster', path: 'Muster entlang Kurve', points: 'Muster an Punkten', table: 'Muster aus Tabelle', mirror: 'Spiegelung', split: 'Geteilt', intersect: 'Schnittmenge' };
  // gewählte Objekte, die alle auf derselben Ebene liegen (sonst leer)
  function siblings(ids) {
    const fs = (ids || App.sel).map((id) => Model.find(App.doc, id)).filter(Boolean);
    if (!fs.length || fs.some((f) => f.list !== fs[0].list)) return [];
    return fs.map((f) => f.item);
  }
  function need(ids) {
    const items = siblings(ids);
    if (!items.length) UI.toast((ids || App.sel).length ? 'Die gewählten Objekte müssen auf derselben Ebene liegen.' : 'Wähle zuerst einen Körper oder ein Loch.', { icon: 'info' });
    return items;
  }
  // Objekte in eine Feature-Gruppe im Ursprung ihrer Ebene packen
  function sharedFeatureOp(items) {
    if (items.some((x) => (x.kind === 'transform' && !(x.p && x.p.copy)) || x.kind === 'scale' || x.kind === 'deform' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) || x.kind === 'directFace' || x.kind === 'vent' || x.kind === 'fins' || x.kind === 'fillPattern' || x.kind === 'mountPattern' || x.kind === 'portCutout' || x.kind === 'magnetPocket' || x.kind === 'web' || x.kind === 'wrap' || x.kind === 'emboss' || x.kind === 'splitFace' || x.kind === 'dome' || x.kind === 'deleteFace' || x.kind === 'replaceFace' || x.kind === 'moveEdge' || x.kind === 'deleteBody' || x.kind === 'sketch3d' || x.kind === 'boss' || x.kind === 'lipGroove' || x.kind === 'undercut' || x.kind === 'circlipGroove' || x.kind === 'keyway' || x.kind === 'splineProfile' || x.kind === 'knurl' || x.kind === 'gripPattern' || x.kind === 'stackHole' || x.kind === 'asmCut')) {
      UI.toast('Verschieben-, Skalieren-, Aufdicken-, Präge- und Wickel-Schritte lassen sich nicht als Muster anlegen.', { icon: 'info' });
      return { ok: false };
    }
    if (items.some((x) => x.kind === 'rib')) {
      if (items.length === 1 && items[0].p && items[0].p.target && App.doc.items.includes(items[0])) {
        return { ok: true, op: { type: 'join', target: items[0].p.target, rib: true } };
      }
      UI.toast('Eine Rippe lässt sich nur einzeln mit ihrem Zielkörper mustern.', { icon: 'info' });
      return { ok: false };
    }
    if (items.some((x) => x.op && x.op.target)) {
      const o0 = items[0].op;
      const same = o0 && o0.target && items.every((x) => App.doc.items.includes(x) && x.op && x.op.type === o0.type && x.op.target === o0.target);
      if (!same) {
        UI.toast('Wähle Formschritte mit demselben Modus und Zielkörper (oder ohne Verrechnung).', { icon: 'info' });
        return { ok: false };
      }
      return { ok: true, op: { type: o0.type, target: o0.target } };
    }
    return { ok: true, op: null };
  }
  function ownBoxOf(items) {
    const box = new THREE.Box3(), V = Model.vars(App.doc).v;
    for (const x of items) {
      const ob = App.ownBox(x.id);
      if (ob) { box.union(new THREE.Box3(new THREE.Vector3(ob[0], ob[1], ob[2]), new THREE.Vector3(ob[3], ob[4], ob[5]))); continue; }
      const lb = Model.itemLocalBox(x, V);
      if (lb) {
        box.union(new THREE.Box3(new THREE.Vector3(lb[0], lb[1], lb[2]), new THREE.Vector3(lb[3], lb[4], lb[5])).applyMatrix4(Model.worldMatrix(App.doc, x.id)));
        continue;
      }
      const wb = Actions.worldBox(x.id);
      if (wb) box.union(wb);
    }
    return box;
  }
  function wrap(items, name, p, sharedOp = null) {
    let G;
    App.change(name + ' angelegt', (doc) => {
      const list = Model.find(doc, items[0].id).list; const its = items.map((x) => list.find((y) => y.id === x.id)).filter(Boolean);
      const first = its.find((x) => x.role !== 'hole') || its[0];
      G = Model.newItem('group', {}, { name, color: first.color, role: sharedOp ? 'solid' : (its.every((x) => x.role === 'hole') ? 'hole' : 'solid') });
      G.p = { ...p };
      if (sharedOp) {
        G.op = { type: sharedOp.type, target: sharedOp.target };
        for (const it of its) if (it.kind !== 'rib') delete it.op;
      }
      const at = Math.min(...its.map((x) => list.indexOf(x)));
      for (const it of its) { list.splice(list.indexOf(it), 1); G.children.push(it); }
      list.splice(at, 0, G);
    });
    App.select([G.id]);
    return G;
  }
  function pattern(type, ids) {
    const items = need(ids); if (!items.length) return null;
    const sop = type === 'mirror' ? { ok: true, op: null } : sharedFeatureOp(items);
    if (!sop.ok) return null;
    const sharedOp = sop.op;
    const b = sharedOp ? ownBoxOf(items) : Actions.selBox(items.map((x) => x.id));
    const size = b.isEmpty() ? new THREE.Vector3(10, 10, 10) : b.getSize(new THREE.Vector3());
    let G;
    if (type === 'rect') G = wrap(items, NAMES.rect, { op: 'pattern', pt: 'rect', nx: 3, ny: 1, dx: round(size.x + 5, 1), dy: round(size.y + 5, 1) }, sharedOp);
    else if (type === 'circ') {
      let cx = 0, cy = 0;
      if (sharedOp && sharedOp.target) {
        const tid = App.mergedInto(sharedOp.target) || sharedOp.target;
        const tb = Actions.worldBox(tid);
        if (tb && !tb.isEmpty()) {
          const tc = tb.getCenter(new THREE.Vector3());
          cx = round(tc.x, 2) || 0;
          cy = round(tc.y, 2) || 0;
        }
      }
      G = wrap(items, NAMES.circ, { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx, cy }, sharedOp);
    }
    else G = wrap(items, NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'YZ', off: 0 });
    UI.toast(type === 'mirror' ? 'Gespiegelte Kopie angelegt. Rechts wählst du die Spiegelebene.' : 'Muster angelegt. Rechts stellst du Anzahl und Abstand ein – auch mit Formeln.', { icon: 'check' });
    return G;
  }
  // Muster entlang Kurve: erst die Kurve zeichnen (Skizze auf Höhe der Oberkante), dann legt pathFromSketch die Gruppe an
  function patternPath(ids) {
    const items = need(ids); if (!items.length) return null;
    const sop = sharedFeatureOp(items); if (!sop.ok) return null;
    const W = Model.parentWorld(App.doc, items[0].id), inv = W.clone().invert();
    const b = sop.op ? ownBoxOf(items) : Actions.selBox(items.map((x) => x.id));
    const c = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3()).applyMatrix4(inv);
    const top = b.isEmpty() ? 0 : new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.getCenter(new THREE.Vector3()).y, b.max.z).applyMatrix4(inv).z;
    Sketch.startPath({ plane: { o: [0, 0, round(top, 4)], x: [1, 0, 0], n: [0, 0, 1] }, W, ents: [{ id: uid('e'), type: 'point', a: [round(c.x, 4), round(c.y, 4)] }], ids: items.map((x) => x.id), viewSize: b.isEmpty() ? 100 : Math.max(100, 5 * Math.max(b.max.x - b.min.x, b.max.y - b.min.y)) });
    return true;
  }
  function pathFromSketch(ids, sketch) {
    const items = siblings(ids);
    if (!items.length) { UI.toast('Die gewählten Objekte gibt es nicht mehr.', { kind: 'bad' }); return null; }
    const sop = sharedFeatureOp(items);
    const G = wrap(items, NAMES.path, { op: 'pattern', pt: 'path', n: 5, d: 0, align: true, sketch }, sop.ok ? sop.op : null);
    UI.toast('Muster entlang der Kurve angelegt. Rechts stellst du Anzahl, Abstand und Mitdrehen ein.', { icon: 'check' });
    return G;
  }
  function refCenterOf(items) {
    const W = Model.parentWorld(App.doc, items[0].id), inv = W.clone().invert();
    const sop = sharedFeatureOp(items);
    const b = sop.ok && sop.op ? ownBoxOf(items) : Actions.selBox(items.map((x) => x.id));
    if (b.isEmpty()) return [0, 0, 0];
    const c = b.getCenter(new THREE.Vector3()).applyMatrix4(inv);
    return [round(c.x, 4), round(c.y, 4), round(c.z, 4)];
  }
  function patternPoints(ids, opts = {}) {
    const items = need(ids); if (!items.length) return null;
    const sop = sharedFeatureOp(items); if (!sop.ok) return null;
    if (opts.sketch) return pointsFromSketch(items.map((x) => x.id), opts.sketch, opts);
    if (opts.sourceId) {
      const ref = refCenterOf(items);
      const G = wrap(items, NAMES.points, { op: 'pattern', pt: 'points', sourceId: opts.sourceId, ref, ...(opts.keepOrigin ? { keepOrigin: true } : {}) }, sop.op);
      UI.toast('Muster an Skizzenpunkten angelegt.', { icon: 'check' });
      return G;
    }
    const W = Model.parentWorld(App.doc, items[0].id), inv = W.clone().invert();
    const b = sop.op ? ownBoxOf(items) : Actions.selBox(items.map((x) => x.id));
    const top = b.isEmpty() ? 0 : new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.getCenter(new THREE.Vector3()).y, b.max.z).applyMatrix4(inv).z;
    Sketch.startPoints({ plane: { o: [0, 0, round(top, 4)], x: [1, 0, 0], n: [0, 0, 1] }, W, ents: [], ids: items.map((x) => x.id), viewSize: b.isEmpty() ? 100 : Math.max(100, 5 * Math.max(b.max.x - b.min.x, b.max.y - b.min.y)) });
    return true;
  }
  function pointsFromSketch(ids, sketch, opts = {}) {
    const items = siblings(ids);
    if (!items.length) { UI.toast('Die gewählten Objekte gibt es nicht mehr.', { kind: 'bad' }); return null; }
    const sop = sharedFeatureOp(items);
    if (!sop.ok) return null;
    const ref = refCenterOf(items);
    const G = wrap(items, NAMES.points, { op: 'pattern', pt: 'points', sketch: deepClone(sketch), ref, ...(opts.keepOrigin ? { keepOrigin: true } : {}) }, sop.op);
    UI.toast('Muster an Skizzenpunkten angelegt. Rechts wählst du eine andere Skizze oder bearbeitest die Punkte.', { icon: 'check' });
    return G;
  }
  const DEFAULT_TABLE_CSV = 'x;y\n0;0\n20;0\n20;15';
  function patternTable(ids, opts = {}) {
    const items = need(ids); if (!items.length) return null;
    const sop = sharedFeatureOp(items); if (!sop.ok) return null;
    const ref = refCenterOf(items);
    const csv = opts.csv != null ? String(opts.csv) : DEFAULT_TABLE_CSV;
    const mode = opts.mode === 'rel' ? 'rel' : 'abs';
    const G = wrap(items, NAMES.table, { op: 'pattern', pt: 'table', csv, mode, ref }, sop.op);
    UI.toast('Muster aus Tabelle angelegt. Rechts fügst du Koordinaten ein oder lädst eine CSV-Datei.', { icon: 'check' });
    return G;
  }
  function setPatternTableCSV(id, csvText) {
    const f = Model.find(App.doc, id);
    if (!f || !isOp(f.item) || f.item.p.op !== 'pattern' || f.item.p.pt !== 'table') return false;
    const txt = String(csvText ?? '');
    const parsed = Model.parsePatternCSV(txt, Model.vars(App.doc).v);
    if (!parsed.ok) {
      UI.toast(parsed.error || 'Die CSV-Tabelle enthält keine gültigen Zeilen.', { kind: 'bad' });
      return false;
    }
    App.change('Muster-Tabelle geändert', (doc) => {
      const fn = Model.find(doc, id); if (!fn) return false;
      fn.item.p.csv = txt;
      if (Array.isArray(fn.item.p.skip)) {
        fn.item.p.skip = fn.item.p.skip.filter((k) => k >= 0 && k < parsed.rows.length);
        if (!fn.item.p.skip.length) delete fn.item.p.skip;
      }
    });
    return true;
  }
  // ---------- Drehachse im Bild wählen (Kreismuster) ----------
  // Gerade Kante → Achse entlang der Kante; runde Kante → Achse durch ihre Mitte, senkrecht dazu; Zylinderfläche → ihre Achse
  let picking = null;
  function axisOfHit(hit) {
    const n = hit && hit.node; if (!n) return null;
    const M = n.obj.matrixWorld;
    if (hit.edgeIdx != null) {
      const g = n.data.edges[hit.edgeIdx], pos = Viewer.edgePositions(n, hit.edgeIdx);
      if (g && pos && pos.length >= 6) {
        const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M), k = pos.length / 3;
        if (g.t === 'LINE') { const a = P(0), b = P(k - 1); if (a.distanceTo(b) > 1e-6) return { o: a, d: b.sub(a).normalize(), what: 'Kante' }; }
        if (g.t === 'CIRCLE' && k >= 3) {
          const a = P(0), b = P(Math.floor(k / 3)), c = P(Math.floor((2 * k) / 3));
          const ab = b.clone().sub(a), ac = c.clone().sub(a), nn = new THREE.Vector3().crossVectors(ab, ac), l2 = nn.lengthSq();
          if (l2 > 1e-12) {
            const cc = new THREE.Vector3().crossVectors(nn, ab).multiplyScalar(ac.lengthSq()).add(new THREE.Vector3().crossVectors(ac, nn).multiplyScalar(ab.lengthSq())).divideScalar(2 * l2).add(a);
            return { o: cc, d: nn.normalize(), what: 'Mitte des Kreises' };
          }
        }
      }
    }
    if (hit.faceIdx >= 0) {
      const fi = n.data.faces[hit.faceIdx];
      if (fi && fi.t === 'CYLINDRE' && fi.axis) return { o: new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]).applyMatrix4(M), d: new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]).transformDirection(M).normalize(), what: 'Achse der runden Fläche' };
    }
    return null;
  }
  function stopPick() {
    if (typeof stopCablePick === 'function') stopCablePick();
    if (!picking) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', picking.down, true);
    if (picking.move) cv.removeEventListener('pointermove', picking.move);
    window.removeEventListener('keydown', picking.key, true);
    Viewer.highlightFace('hover', null, null);
    Viewer.highlightEdge(null, null);
    if (picking.ghost) Viewer.clearRefGhost();
    cv.style.cursor = ''; UI.hint(null); picking = null;
  }
  // ---------- Rohr im Raum: Punkte auf Körper oder in den Raum klicken ----------
  // Auf einer Fläche liegt das Rohr auf (Mittelpunkt einen halben Durchmesser über der Fläche); daneben gilt die Höhe des letzten Punkts.
  let route = null;
  function routeDraw() {
    if (!route) return;
    if (route.obj) { Viewer.groups.overlay.remove(route.obj); route.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); route.obj = null; }
    const g = new THREE.Group(), col = new THREE.Color(Viewer.theme.accent), pts = route.pts;
    for (const q of pts) { const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.6, route.d * 0.35), 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 })); m.position.set(q[0], q[1], q[2]); m.renderOrder = 30; g.add(m); }
    if (pts.length >= 2) {
      const L = [];
      if (pts.length >= 3) for (const b of Model.bez3(pts)) for (let i = L.length ? 1 : 0; i <= 16; i++) { const t = i / 16, u = 1 - t; L.push(new THREE.Vector3(...[0, 1, 2].map((k) => u * u * u * b.a[k] + 3 * u * u * t * b.c1[k] + 3 * u * t * t * b.c2[k] + t * t * t * b.b[k]))); }
      else L.push(new THREE.Vector3(...pts[0]), new THREE.Vector3(...pts[1]));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(L), new THREE.LineBasicMaterial({ color: col, depthTest: false })); ln.renderOrder = 29; g.add(ln);
    }
    Viewer.groups.overlay.add(g); route.obj = g;
    const n = route.bar && route.bar.querySelector('#route-n'); if (n) n.textContent = String(pts.length);
    Viewer.requestRender();
  }
  function routePoint(cx, cy) {
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true });
    let P = null, bind = null;
    if (hit && hit.normal) {
      P = hit.point.clone().addScaledVector(hit.normal.clone().normalize(), route.d / 2);
      // Punkt hängt an diesem Körper: wandert er, wandert der Punkt mit (Lage im Körper merken)
      bind = { id: hit.id, lp: P.clone().applyMatrix4(Model.worldMatrix(App.doc, hit.id).invert()).toArray().map((v) => round(v, 4)) };
    } else { const z = route.pts.length ? route.pts[route.pts.length - 1][2] : 0; P = Viewer.pickPlane(cx, cy, z); }
    if (!P) return;
    const q = P.toArray().map((v) => round(v, 3)), last = route.pts[route.pts.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]) < 0.5) return;   // Doppelklick: kein doppelter Punkt
    route.pts.push(q); route.binds.push(bind); routeDraw();
  }
  function stopRoute() {
    if (!route) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', route.down, true); cv.removeEventListener('pointerup', route.up, true); cv.removeEventListener('dblclick', route.dbl, true); window.removeEventListener('keydown', route.key, true);
    if (route.obj) { Viewer.groups.overlay.remove(route.obj); route.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    if (route.bar) route.bar.remove();
    cv.style.cursor = ''; UI.hint(null); route = null; Viewer.requestRender();
  }
  function routeFinish() {
    if (!route) return null;
    if (route.pts.length < 2) { UI.toast('Klick mindestens zwei Punkte – auf einen Körper oder daneben in den Raum.', { icon: 'info' }); return null; }
    const pts = route.pts.map((q) => q.slice()), d = route.d, binds = route.binds.slice();
    stopRoute();
    let nid = null;
    App.change('Rohr im Raum', (doc) => { const it = Model.newItem('sweep', { path3d: { pts, smooth: true, ...(binds.some(Boolean) ? { bind: binds } : {}) }, shape: 'circle', d, w: d, h: round(d * 0.7, 2), wall: 0 }, { name: 'Rohr im Raum' }); doc.items.push(it); nid = it.id; });
    App.select([nid]);
    UI.toast('Rohr angelegt. Rechts änderst du Punkte, Durchmesser und Querschnitt.', { icon: 'check' });
    return nid;
  }
  // Punkte, die an einem Körper hängen, wandern mit, wenn der Körper verschoben oder gedreht wird (ohne eigenen Rückgängig-Schritt)
  let relinkRounds = 0;
  function relinkRoutes() {
    if (!App.doc || route || cablePick) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'sweep' || !it.p) return;
      const pp = it.p.path3d;
      if (pp && Array.isArray(pp.bind) && pp.bind.some(Boolean)) {
        const WI = Model.worldMatrix(App.doc, it.id).invert();
        pp.bind.forEach((b, i) => {
          if (!b || b.frozen || !pp.pts[i]) return;
          if (!Model.find(App.doc, b.id)) { jobs.push({ id: it.id, i, drop: true }); return; }
          const w = new THREE.Vector3(...b.lp).applyMatrix4(Model.worldMatrix(App.doc, b.id)).applyMatrix4(WI);
          if (pp.pts[i].some((v, k) => !(typeof v === 'number' && Math.abs(v - w.getComponent(k)) < 1e-3))) jobs.push({ id: it.id, i, p: w.toArray().map((v) => round(v, 4)) });
        });
      }
      const cb = it.p.cable;
      if (cb && (cb.bindA || cb.bindB)) {
        const WI = Model.worldMatrix(App.doc, it.id).invert();
        for (const [bindKey, ptKey, dirKey] of [['bindA', 'start', 'dirA'], ['bindB', 'end', 'dirB']]) {
          const b = cb[bindKey];
          if (!b || b.frozen || !b.id || !Array.isArray(b.lp)) continue;
          if (!Model.find(App.doc, b.id)) { jobs.push({ cable: true, id: it.id, bindKey, drop: true }); continue; }
          const Wb = Model.worldMatrix(App.doc, b.id);
          const w = new THREE.Vector3(...b.lp).applyMatrix4(Wb).applyMatrix4(WI);
          const ptCur = Array.isArray(cb[ptKey]) ? cb[ptKey] : [0, 0, 0];
          const ptChanged = [0, 1, 2].some((k) => !(typeof ptCur[k] === 'number' && Math.abs(ptCur[k] - w.getComponent(k)) < 1e-3));
          let nextDir = null;
          let dirChanged = false;
          if (Array.isArray(b.ln) && b.ln.length >= 3 && Array.isArray(cb[dirKey])) {
            const nW = new THREE.Vector3(...b.ln).transformDirection(Wb).transformDirection(WI).normalize();
            nextDir = nW.toArray().map((v) => round(v, 6));
            dirChanged = [0, 1, 2].some((k) => Math.abs((Number(cb[dirKey][k]) || 0) - nextDir[k]) > 1e-3);
          }
          if (ptChanged || dirChanged) {
            jobs.push({
              cable: true,
              id: it.id,
              ptKey,
              dirKey,
              p: w.toArray().map((v) => round(v, 4)),
              dir: dirChanged ? nextDir : null,
            });
          }
        }
      }
    });
    if (!jobs.length) { relinkRounds = 0; return; }
    if (++relinkRounds > 3) { relinkRounds = 0; return; }   // Schutz gegen Hin und Her
    App.change('Rohr folgt dem Körper', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item || !f.item.p) continue;
        if (j.cable) {
          const cb = f.item.p.cable;
          if (!cb) continue;
          if (j.drop) delete cb[j.bindKey];
          else {
            cb[j.ptKey] = j.p;
            if (j.dir) cb[j.dirKey] = j.dir;
          }
          continue;
        }
        if (!f.item.p.path3d) continue;
        const pp = f.item.p.path3d;
        if (j.drop) { pp.bind[j.i] = null; if (!pp.bind.some(Boolean)) delete pp.bind; } else pp.pts[j.i] = j.p;
      }
    }, { amend: true });
  }
  App.on('results', relinkRoutes);
  function route3d(opts = {}) {
    stopPick(); stopRoute();
    route = { pts: (opts.pts || []).map((q) => q.slice()), d: opts.d || 6, obj: null, at: null, append: opts.append || null };
    route.binds = route.pts.map((_, i) => (opts.binds && opts.binds[i]) || null);
    const cv = Viewer.canvas;
    route.down = (e) => { if (e.button === 0) route.at = [e.clientX, e.clientY]; };
    route.up = (e) => { if (e.button !== 0 || !route.at) return; const moved = Math.hypot(e.clientX - route.at[0], e.clientY - route.at[1]); route.at = null; if (moved < 5) routePoint(e.clientX, e.clientY); };
    route.dbl = (e) => { e.preventDefault(); e.stopPropagation(); finishRoute(); };
    route.key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopRoute(); Panels.renderRight(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finishRoute(); }
      else if (e.key === 'Backspace' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); e.stopPropagation(); route.pts.pop(); route.binds.pop(); routeDraw(); }
    };
    const bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': 'Rohr im Raum' });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, opts.append ? 'Punkte anhängen' : 'Rohr im Raum'));
    const x = h('button', { type: 'button', class: 'vb-x', 'aria-label': 'Abbrechen', 'data-tip': 'Abbrechen' }); x.innerHTML = icon('close'); x.onclick = () => { stopRoute(); Panels.renderRight(); };
    head.append(x);
    const din = h('input', { type: 'number', id: 'route-d', class: 'vb-sel', value: route.d, min: 0.5, step: 0.5, 'aria-label': 'Durchmesser', style: { width: '64px' } });
    din.onchange = () => { const v = parseFloat(String(din.value).replace(',', '.')); if (v > 0) { route.d = v; routeDraw(); } };
    const ok = h('button', { type: 'button', class: 'btn small primary', id: 'route-done' }); ok.innerHTML = icon('check') + 'Fertig'; ok.onclick = () => finishRoute();
    bar.append(head,
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-l' }, 'Punkte'), h('b', { class: 'mono', id: 'route-n' }, String(route.pts.length)), h('span', { class: 'vb-l' }, 'Ø'), din, h('span', { class: 'vb-hint' }, 'mm')),
      h('div', { class: 'vb-row' }, h('span', { class: 'vb-hint' }, 'Klick Punkte auf einen Körper (das Rohr liegt dann auf) oder daneben in den Raum. Ziehen dreht die Ansicht. Rückschritt nimmt den letzten Punkt weg.')),
      h('div', { class: 'vb-row' }, ok));
    if (opts.append) din.disabled = true;
    Views.bars().append(bar); route.bar = bar;
    cv.addEventListener('pointerdown', route.down, true); cv.addEventListener('pointerup', route.up, true); cv.addEventListener('dblclick', route.dbl, true); window.addEventListener('keydown', route.key, true);
    cv.style.cursor = 'crosshair';
    UI.hint('<b>Rohr im Raum:</b> Punkte klicken – <b>Enter</b> oder Doppelklick ist fertig, <b>Esc</b> bricht ab.');
    routeDraw();
    return true;
  }
  // Fertig: neues Rohr oder – beim Anhängen – die Punkte ans vorhandene Rohr
  function finishRoute() {
    if (!route) return null;
    if (!route.append) return routeFinish();
    const id = route.append, inv = route.inv || new THREE.Matrix4(), pts = route.pts.map((q) => new THREE.Vector3(...q).applyMatrix4(inv).toArray().map((v) => round(v, 3))), binds = route.binds.slice();
    stopRoute();
    App.change('Punkte angehängt', (doc) => { const f = Model.find(doc, id); if (!f || !f.item.p.path3d) return false; f.item.p.path3d.pts = pts; if (binds.some(Boolean)) f.item.p.path3d.bind = binds; else delete f.item.p.path3d.bind; });
    App.select([id]); return id;
  }
  // Punkte eines Rohrs im Raum weiter anklicken (in Weltlage; das Rohr selbst liegt ganz oben im Verlauf)
  function routeAppend(id) {
    const f = Model.find(App.doc, id); if (!f || !f.item.p.path3d) return false;
    const W = Model.worldMatrix(App.doc, id);
    const pts = Model.path3dPoints(f.item.p.path3d, Model.vars(App.doc).v).map((q) => new THREE.Vector3(...q).applyMatrix4(W).toArray());
    route3d({ pts, d: Model.num(f.item.p.d, Model.vars(App.doc).v, 6), append: id, binds: f.item.p.path3d.bind });
    route.inv = W.clone().invert();
    return true;
  }
  function pickDatumPlaneAt(cx, cy) {
    const g = Viewer.groups && Viewer.groups.datums;
    if (!g || !g.children.length || typeof Datums === 'undefined') return null;
    const rc = Viewer.setRay(cx, cy);
    const hits = rc.intersectObjects(g.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.datum && o !== g) o = o.parent;
      if (o && o.userData.datum) {
        const d = Datums.find(o.userData.datum);
        if (d && d.plane) return { datum: d, point: h.point ? h.point.clone() : null };
      }
    }
    return null;
  }
  function setRevolveToFace(itemId, target) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'revolve' || !target) return false;
    const r6 = (a) => a.map((v) => round(v, 6));
    let oW, nW, pickW = null, meta = null;
    if (target.datumId) {
      const d = typeof Datums !== 'undefined' ? Datums.find(target.datumId) : null;
      if (!d || !d.plane) return false;
      oW = new THREE.Vector3(...d.plane.o);
      nW = new THREE.Vector3(...d.plane.n).normalize();
      pickW = oW.clone();
      meta = { kind: 'datum', datumId: d.id, name: d.name };
    } else if (target.id) {
      const info = target.info || (target.idx != null && App.results.get(target.id)?.data?.faces?.[target.idx]);
      if (!info || info.t !== 'PLANE' || !info.n) return false;
      const W = Model.worldMatrix(App.doc, target.id);
      oW = new THREE.Vector3(...info.c).applyMatrix4(W);
      nW = new THREE.Vector3(...info.n).transformDirection(W).normalize();
      pickW = Array.isArray(target.point) ? new THREE.Vector3(...target.point) : oW.clone();
      const tgt = Model.find(App.doc, target.id);
      meta = { kind: 'face', targetId: target.id, c: r6(info.c), n: r6(info.n), name: tgt ? Model.label(tgt.item) : 'Fläche' };
    } else return false;
    const inv = Model.worldMatrix(App.doc, itemId).invert();
    const oL = oW.clone().applyMatrix4(inv).toArray();
    const nL = nW.clone().transformDirection(inv).normalize().toArray();
    const pickL = pickW.clone().applyMatrix4(inv).toArray();
    const frame = Model.revolveFrame(f.item.p, Model.vars(App.doc).v);
    const flip = Model.revolveAutoFlip(frame, oL, nL, pickL);
    App.change('Bis zu gewählter Fläche', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn || fn.item.kind !== 'revolve') return false;
      fn.item.p.dir = 'toFace';
      fn.item.p.toFace = { ...meta, o: r6(oL), fn: r6(nL) };
      fn.item.p.toFaceFlip = !!flip;
    });
    return true;
  }
  function pickRevolveFace(itemId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== itemId && hit.faceIdx >= 0) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE' && fi.n) {
          stopPick();
          setRevolveToFace(itemId, { id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null });
          UI.toast('Zielfläche gesetzt.', { icon: 'check' });
          return;
        }
      }
      const dp = pickDatumPlaneAt(e.clientX, e.clientY);
      if (dp) {
        stopPick();
        setRevolveToFace(itemId, { datumId: dp.datum.id });
        UI.toast(`Bezugsebene „${dp.datum.name}“ als Ziel gesetzt.`, { icon: 'check' });
        return;
      }
      UI.toast('Bitte wähle eine ebene Fläche eines anderen Körpers oder eine Bezugsebene.', { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Zielfläche wählen:</b> Klick auf eine ebene Fläche eines Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  let revRelinkRounds = 0;
  function relinkRevolveFaces() {
    if (!App.doc) return;
    const vDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const r6 = (a) => a.map((v) => round(v, 6));
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'revolve' || !it.p || it.p.dir !== 'toFace' || !it.p.toFace) return;
      const tf = it.p.toFace;
      if (tf.frozen) return;
      const inv = Model.worldMatrix(App.doc, it.id).invert();
      if (tf.kind === 'datum') {
        const d = typeof Datums !== 'undefined' ? Datums.find(tf.datumId) : null;
        if (!d || !d.plane) { if (!tf.lost) jobs.push({ id: it.id, lost: true }); return; }
        const oL = r6(new THREE.Vector3(...d.plane.o).applyMatrix4(inv).toArray());
        const nL = r6(new THREE.Vector3(...d.plane.n).transformDirection(inv).normalize().toArray());
        if (vDiff(oL, tf.o) > 1e-5 || vDiff(nL, tf.fn) > 1e-5 || tf.lost || tf.name !== d.name) {
          jobs.push({ id: it.id, o: oL, fn: nL, name: d.name, lost: false });
        }
      } else if (tf.kind === 'face' && tf.targetId) {
        const rId = App.results.has(tf.targetId) ? tf.targetId : (App.mergedInto(tf.targetId) || tf.targetId);
        const r = App.results.get(rId), tgt = Model.find(App.doc, tf.targetId);
        if (r && r.data && tgt) {
          const nRef = new THREE.Vector3(...(tf.n || [0, 0, 1])), cRef = new THREE.Vector3(...(tf.c || [0, 0, 0]));
          let best = null;
          for (const fc of r.data.faces || []) {
            if (fc.t !== 'PLANE' || !fc.n) continue;
            if (new THREE.Vector3(...fc.n).dot(nRef) < 0.999) continue;
            const dd = new THREE.Vector3(...fc.c).distanceTo(cRef);
            if (!best || dd < best.dd) best = { fc, dd };
          }
          if (best) {
            const W = Model.worldMatrix(App.doc, rId);
            const oW = new THREE.Vector3(...best.fc.c).applyMatrix4(W);
            const nW = new THREE.Vector3(...best.fc.n).transformDirection(W).normalize();
            const oL = r6(oW.applyMatrix4(inv).toArray());
            const nL = r6(nW.transformDirection(inv).normalize().toArray());
            const nm = Model.label(tgt.item);
            if (vDiff(oL, tf.o) > 1e-5 || vDiff(nL, tf.fn) > 1e-5 || tf.lost || tf.name !== nm) {
              jobs.push({ id: it.id, o: oL, fn: nL, c: r6(best.fc.c), n: r6(best.fc.n), name: nm, lost: false });
            }
          } else if (!tf.lost) jobs.push({ id: it.id, lost: true });
        } else if (!tgt && !tf.lost) jobs.push({ id: it.id, lost: true });
      }
    });
    if (!jobs.length) { revRelinkRounds = 0; return; }
    if (++revRelinkRounds > 3) { revRelinkRounds = 0; return; }
    App.change('Zielfläche nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item.p || !f.item.p.toFace) continue;
        const tf = f.item.p.toFace;
        if (j.lost) tf.lost = true;
        else {
          delete tf.lost;
          tf.o = j.o; tf.fn = j.fn;
          if (j.c) tf.c = j.c; if (j.n) tf.n = j.n;
          if (j.name) tf.name = j.name;
        }
      }
    }, { amend: true });
  }
  App.on('results', relinkRevolveFaces);
  // Achse im Bild wählen; cb bekommt { o, d, what, axisId? } in Weltkoordinaten
  function pickAxisThen(cb, hint) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const da = typeof Datums !== 'undefined' ? Datums.pickAxis(e.clientX, e.clientY) : null;
      const A = da ? { o: new THREE.Vector3(...da.ax.axis.o), d: new THREE.Vector3(...da.ax.axis.d), what: 'Bezugsachse „' + da.ax.name + '“', axisId: da.ax.id } : axisOfHit(Viewer.pick(e.clientX, e.clientY, { edgePx: 9 }));
      if (!A) { UI.toast('Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche oder eine Bezugsachse.', { icon: 'info' }); return; }
      stopPick();
      cb(A);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint(hint || '<b>Achse wählen:</b> Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche oder eine Bezugsachse. <b>Esc</b> bricht ab.');
  }
  function pickExtrudeFace(itemId) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'extrude') return false;
    const top = Model.topOf(App.doc, itemId);
    const exclude = top && top.id === itemId ? new Set([itemId, '__preview']) : new Set(['__preview']);
    pickFaceThen((ref) => {
      setExtrudeToFace(itemId, ref);
      UI.toast('Zielfläche gewählt: ' + (ref.label || 'Fläche') + '.', { icon: 'check' });
    }, { exclude });
    return true;
  }
  function makeFaceRef(hit) {
    if (!hit || !hit.node || hit.faceIdx == null || hit.faceIdx < 0) return null;
    const n = hit.node, data = n.data || {}, fi = (data.faces || [])[hit.faceIdx];
    if (!fi) return null;
    const bb = data.bbox;
    const rel = bb && fi.c ? [0, 1, 2].map((k) => { const sp = bb[k + 3] - bb[k]; return sp > 1e-6 ? round((fi.c[k] - bb[k]) / sp, 6) : 0.5; }) : null;
    const W = n.obj.matrixWorld;
    const wc = fi.c ? new THREE.Vector3(...fi.c).applyMatrix4(W).toArray().map((v) => round(v, 6)) : null;
    const wn = fi.n ? new THREE.Vector3(...fi.n).transformDirection(W).normalize().toArray().map((v) => round(v, 6)) : null;
    const f = Model.find(App.doc, hit.id);
    return {
      id: hit.id,
      idx: hit.faceIdx,
      t: fi.t,
      c: fi.c ? fi.c.map((v) => round(v, 6)) : null,
      n: fi.n ? fi.n.map((v) => round(v, 6)) : null,
      rel,
      wc,
      wn,
      label: f ? Model.label(f.item) : 'Körper',
    };
  }
  function pickTargetFaceAt(cx, cy, exclude) {
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true, exclude });
    if (hit && hit.faceIdx >= 0) {
      const ref = makeFaceRef(hit);
      if (ref) return ref;
    }
    if (Viewer.groups && Viewer.groups.datums && Viewer.groups.datums.children.length && typeof Datums !== 'undefined') {
      const rc = Viewer.setRay(cx, cy);
      const dh = rc.intersectObjects(Viewer.groups.datums.children, true);
      for (const x of dh) {
        let o = x.object;
        while (o && !o.userData.datum) o = o.parent;
        if (o && o.userData.datum) {
          const d = Datums.find(o.userData.datum);
          if (d && d.plane) return { datumId: d.id, label: 'Bezugsebene „' + d.name + '“' };
        }
      }
    }
    return null;
  }
  function pickFaceThen(cb, opts = {}) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const ref = pickTargetFaceAt(e.clientX, e.clientY, opts.exclude);
      if (!ref) { UI.toast('Klick auf eine Körperfläche oder Bezugsebene.', { icon: 'info' }); return; }
      stopPick();
      cb(ref);
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: opts.exclude });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(opts.hint || '<b>Zielfläche wählen:</b> Klick auf eine Fläche eines Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  function autoFlipDirForFace(plane, W, curDir, ref) {
    if (!plane || !ref || (curDir !== 'normal' && curDir !== 'reverse')) return curDir;
    const oW = new THREE.Vector3(...plane.o).applyMatrix4(W);
    const nW = new THREE.Vector3(...plane.n).transformDirection(W).normalize();
    let pW = null;
    if (ref.datumId && typeof Datums !== 'undefined') {
      const d = Datums.find(ref.datumId);
      if (d && d.plane) pW = new THREE.Vector3(...d.plane.o);
    } else if (Array.isArray(ref.wc)) {
      pW = new THREE.Vector3(...ref.wc);
    } else if (Array.isArray(ref.c) && ref.id && Model.find(App.doc, ref.id)) {
      pW = new THREE.Vector3(...ref.c).applyMatrix4(Model.worldMatrix(App.doc, ref.id));
    }
    if (!pW) return curDir;
    const d = pW.sub(oW).dot(nW);
    if (d > 1e-3) return 'normal';
    if (d < -1e-3) return 'reverse';
    return curDir;
  }
  function setExtrudeToFace(itemId, ref) {
    if (!ref) return false;
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'extrude') return false;
    App.change('Bis Fläche gewählt', (doc) => {
      const T = Model.find(doc, itemId).item;
      T.p.extent = 'toFace';
      T.p.toFace = ref;
      delete T.p.thru;
      if (T.p.dir === 'both') T.p.dir = 'normal';
      if (T.p.sketch && T.p.sketch.plane) {
        T.p.dir = autoFlipDirForFace(T.p.sketch.plane, Model.worldMatrix(doc, itemId), T.p.dir || 'normal', ref);
      }
    });
    App.select([itemId]);
    return true;
  }
  function setPatternAxis(gid, axisId) {
    const ax = typeof Datums !== 'undefined' ? Datums.findAxis(axisId) : null;
    if (!ax || !ax.axis) return false;
    const inv = Model.worldMatrix(App.doc, gid).invert();
    const o = new THREE.Vector3(...ax.axis.o).applyMatrix4(inv), d = new THREE.Vector3(...ax.axis.d).transformDirection(inv).normalize();
    App.change(`Drehachse „${ax.name}“`, (doc) => {
      const f = Model.find(doc, gid); if (!f) return false;
      f.item.p.axis = 'pick';
      f.item.p.axisId = ax.id;
      f.item.p.ao = o.toArray().map((v) => round(v, 6));
      f.item.p.ad = d.toArray().map((v) => round(v, 9));
    });
    App.select([gid]);
    UI.toast(`Drehachse gesetzt: Bezugsachse „${ax.name}“.`, { icon: 'check' });
    return true;
  }
  function pickAxis(gid) {
    pickAxisThen((A) => {
      const inv = Model.worldMatrix(App.doc, gid).invert();
      const o = A.o.clone().applyMatrix4(inv), d = A.d.clone().transformDirection(inv).normalize();
      App.change('Drehachse gewählt', (doc) => {
        const f = Model.find(doc, gid); if (!f) return false;
        f.item.p.axis = 'pick';
        if (A.axisId) f.item.p.axisId = A.axisId; else delete f.item.p.axisId;
        f.item.p.ao = o.toArray().map((v) => round(v, 6));
        f.item.p.ad = d.toArray().map((v) => round(v, 9));
      });
      App.select([gid]);
      UI.toast('Drehachse gesetzt: ' + A.what + '.', { icon: 'check' });
    }, '<b>Drehachse wählen:</b> Klick auf eine gerade Kante, einen runden Rand, eine runde Fläche (Welle, Loch) oder eine Bezugsachse. <b>Esc</b> bricht ab.');
  }
  // Gespiegelte Kopie an einer gewählten ebenen Fläche (z. B. zweiter Arm an der Mittelfläche)
  function mirrorAtFace(face) {
    const top = Model.topOf(App.doc, face.id); if (!top) return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const o = new THREE.Vector3(...face.info.c).applyMatrix4(W), n = new THREE.Vector3(...face.info.n).transformDirection(W).normalize();
    // Ist es die äußerste Fläche in ihrer Richtung (achsparallel), bleibt die Spiegelebene an ihr hängen, wenn das Original wächst
    const box = Actions.selBox([top.id]), ax = [0, 1, 2].find((i) => Math.abs(n.getComponent(i)) > 0.9999);
    let bind = false;
    if (ax != null && !box.isEmpty()) { const ext = n.getComponent(ax) > 0 ? box.max.getComponent(ax) : box.min.getComponent(ax); bind = Math.abs(ext - o.getComponent(ax)) < 1e-3 * Math.max(1, box.getSize(new THREE.Vector3()).length()); }
    const G = wrap([top], NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'FACE', mo: o.toArray().map((v) => round(v, 6)), mn: n.toArray().map((v) => round(v, 9)), ...(bind ? { bind: true } : {}) });
    UI.toast('Gespiegelt an der Fläche – Original und Spiegelbild sind jetzt ein Körper.' + (bind ? ' Wird das Original größer, wandert die Ebene mit.' : ''), { icon: 'check' });
    return G;
  }
  function split(ids) {
    const items = need(ids); if (!items.length) return null;
    const b = Actions.selBox(items.map((x) => x.id));
    const z = b.isEmpty() ? 0 : round((b.min.z + b.max.z) / 2, 2);
    const G = wrap(items, NAMES.split, { op: 'split', plane: 'XY', off: z, keep: 'both', gap: 0 });
    UI.toast('Geteilt. Rechts wählst du die Schnittebene, ihre Lage und welche Hälfte bleibt.', { icon: 'check' });
    return G;
  }
  function defaultSplitSketchPlane(items, planeOpt = null) {
    const W = Model.parentWorld(App.doc, items[0].id), inv = W.clone().invert();
    const b = Actions.selBox(items.map((x) => x.id));
    const bl = b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10)) : b.clone().applyMatrix4(inv);
    const sz = bl.getSize(new THREE.Vector3());
    const c = bl.getCenter(new THREE.Vector3());
    const viewSize = Math.max(80, 3 * Math.max(sz.x, sz.y, sz.z, 10));
    let plane;
    if (planeOpt === 'XZ') plane = { o: [0, round(c.y, 4), 0], x: [1, 0, 0], n: [0, 1, 0] };
    else if (planeOpt === 'YZ') plane = { o: [round(c.x, 4), 0, 0], x: [0, 1, 0], n: [1, 0, 0] };
    else plane = { o: [0, 0, round(c.z, 4)], x: [1, 0, 0], n: [0, 0, 1] };
    return { plane, W, viewSize };
  }
  function setSplitFace(gid, ref) {
    const f = Model.find(App.doc, gid);
    if (!f || !isOp(f.item) || f.item.p.op !== 'split' || !ref) return false;
    App.change('Schnittfläche gewählt', (doc) => {
      const fn = Model.find(doc, gid); if (!fn) return false;
      fn.item.p.plane = 'FACE';
      fn.item.p.faceRef = deepClone(ref);
    });
    App.select([gid]);
    return true;
  }
  function pickSplitToolFace(gid) {
    const f = Model.find(App.doc, gid);
    if (!f || !isOp(f.item) || f.item.p.op !== 'split') return false;
    pickFaceThen((ref) => {
      setSplitFace(gid, ref);
      UI.toast('Schnittfläche gesetzt: ' + (ref.label || 'Fläche') + '.', { icon: 'check' });
    }, { exclude: new Set([gid, '__preview']), hint: '<b>Schnittfläche wählen:</b> Klick auf eine ebene oder gekrümmte Fläche eines anderen Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.' });
    return true;
  }
  function splitWithFace(ids = null, faceRef = null) {
    const list = ids || App.sel;
    if (list.length === 1) {
      const f = Model.find(App.doc, list[0]);
      if (f && isOp(f.item) && f.item.p.op === 'split') {
        if (faceRef) return setSplitFace(f.item.id, faceRef);
        return pickSplitToolFace(f.item.id);
      }
    }
    const items = need(list); if (!items.length) return null;
    if (faceRef) {
      const G = wrap(items, NAMES.split, { op: 'split', plane: 'FACE', faceRef: deepClone(faceRef), keep: 'both', gap: 0 });
      UI.toast('Geteilt an der gewählten Fläche.', { icon: 'check' });
      return G;
    }
    pickFaceThen((ref) => {
      const still = siblings(items.map((x) => x.id));
      if (!still.length) return;
      wrap(still, NAMES.split, { op: 'split', plane: 'FACE', faceRef: deepClone(ref), keep: 'both', gap: 0 });
      UI.toast('Geteilt an der gewählten Fläche.', { icon: 'check' });
    }, { exclude: new Set([...items.map((x) => x.id), '__preview']), hint: '<b>Schnittfläche wählen:</b> Klick auf eine ebene oder gekrümmte Fläche eines anderen Körpers oder eine Bezugsebene. <b>Esc</b> bricht ab.' });
    return true;
  }
  function startSplitSketch(gidOrIds = null, planeOpt = null) {
    if (typeof gidOrIds === 'string') {
      const f = Model.find(App.doc, gidOrIds);
      if (!f || !isOp(f.item) || f.item.p.op !== 'split') return false;
      if (f.item.p.sketch && !planeOpt) { Sketch.editItem(gidOrIds); return true; }
      const kids = (f.item.children || []).filter((c) => !c.suppressed);
      const { plane, W, viewSize } = defaultSplitSketchPlane(kids.length ? kids : [f.item], planeOpt);
      Sketch.startSplitCurve({ plane, W, ents: [], gid: gidOrIds, viewSize });
      return true;
    }
    const list = gidOrIds || App.sel;
    if (list.length === 1) {
      const f = Model.find(App.doc, list[0]);
      if (f && isOp(f.item) && f.item.p.op === 'split') return startSplitSketch(f.item.id, planeOpt);
    }
    const items = need(list); if (!items.length) return false;
    const { plane, W, viewSize } = defaultSplitSketchPlane(items, planeOpt);
    Sketch.startSplitCurve({ plane, W, ents: [], ids: items.map((x) => x.id), viewSize });
    return true;
  }
  function splitFromSketch(target, sketch) {
    if (!sketch) return null;
    if (target && target.gid) {
      const gid = target.gid;
      App.change('Schnitt-Skizze gesetzt', (doc) => {
        const fn = Model.find(doc, gid); if (!fn || !fn.item.p) return false;
        fn.item.p.plane = 'SKETCH';
        fn.item.p.sketch = deepClone(sketch);
      });
      App.select([gid]);
      UI.toast('Körper mit Skizze geteilt. Rechts kannst du die Kurve bearbeiten, eine Hälfte wählen oder einen Spalt setzen.', { icon: 'check' });
      return Model.find(App.doc, gid)?.item || null;
    }
    const items = siblings(target && target.ids);
    if (!items.length) { UI.toast('Die gewählten Objekte gibt es nicht mehr.', { kind: 'bad' }); return null; }
    const G = wrap(items, NAMES.split, { op: 'split', plane: 'SKETCH', sketch: deepClone(sketch), keep: 'both', gap: 0 });
    UI.toast('Körper mit Skizze geteilt. Rechts kannst du die Kurve bearbeiten, eine Hälfte wählen oder einen Spalt setzen.', { icon: 'check' });
    return G;
  }
  function splitWithSketch(ids = null, sketch = null, opts = {}) {
    if (!sketch) return startSplitSketch(ids, opts.plane || null);
    const items = need(ids); if (!items.length) return null;
    const G = splitFromSketch({ ids: items.map((x) => x.id) }, sketch);
    if (G && (opts.keep || opts.gap != null)) {
      App.change('Schnitt-Einstellungen', (doc) => {
        const fn = Model.find(doc, G.id); if (!fn) return false;
        if (opts.keep) fn.item.p.keep = opts.keep;
        if (opts.gap != null) fn.item.p.gap = opts.gap;
      }, { amend: true });
    }
    return G;
  }
  // Boolesch: vereinigen, abziehen (der erste bleibt, die anderen schneiden), Schnittmenge
  function boolean(mode, ids) {
    ids = (ids || App.sel).slice();
    if (ids.length < 2) { UI.toast('Wähle mindestens zwei Körper (mit Umschalt klicken).', { icon: 'info' }); return; }
    const items = need(ids); if (items.length < 2) return;
    if (mode === 'union') { App.change('Rollen gesetzt', (doc) => { for (const it of items) Model.find(doc, it.id).item.role = 'solid'; }); Actions.group(ids); return; }
    if (mode === 'subtract') { App.change('Rollen gesetzt', (doc) => { items.forEach((it, i) => { Model.find(doc, it.id).item.role = i === 0 ? 'solid' : 'hole'; }); }); Actions.group(ids); return; }
    if (mode === 'intersect') {
      App.change('Rollen gesetzt', (doc) => { for (const it of items) Model.find(doc, it.id).item.role = 'solid'; });
      wrap(siblings(ids), NAMES.intersect, { op: 'intersect' });
      UI.toast('Schnittmenge: Übrig bleibt nur, was in allen Körpern zugleich liegt.', { icon: 'check' });
    }
  }
  // Wandstärke: Körper aushöhlen, die gewählte Fläche wird zur Öffnung; optional Richtung (in/out/mid) und Stärke je Fläche
  function shellFaceSig(itemId, fi) {
    if (!fi || !Array.isArray(fi.c)) return null;
    const bb = App.results.get(itemId)?.data?.bbox;
    const size = bb ? round(clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6, 8, 60), 2) : 20;
    return { c: fi.c.map((v) => round(v, 4)), n: fi.n ? fi.n.map((v) => round(v, 5)) : null, size, ...(fi.t ? { t: fi.t } : {}), ...(fi.tid ? { tid: fi.tid } : {}) };
  }
  function sameShellFace(a, b) {
    if (!a || !b) return false;
    if (a.tid && b.tid && a.tid === b.tid) return true;
    if (!a.c || !b.c) return false;
    const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]);
    if (d < 1e-3) return true;
    if (a.n && b.n) {
      const dp = a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2];
      if (Math.abs(dp) > 0.995) {
        const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], dz = b.c[2] - a.c[2];
        const nd = dx * a.n[0] + dy * a.n[1] + dz * a.n[2];
        const lat = Math.hypot(dx - nd * a.n[0], dy - nd * a.n[1], dz - nd * a.n[2]);
        if (lat < 1e-2 && d < Math.max(a.size || 20, b.size || 20)) return true;
      }
    }
    return false;
  }
  function shellFaceLabel(sig) {
    if (!sig) return T('panel.edges.shellFaceOther');
    if (sig.t === 'CYLINDRE' || sig.t === 'CONE') return T('panel.edges.shellFaceCyl');
    if (Array.isArray(sig.n)) {
      const [x, y, z] = sig.n;
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      if (az >= ax && az >= ay && az > 0.85) return T(z > 0 ? 'panel.edges.shellFaceTop' : 'panel.edges.shellFaceBottom');
      if (ax >= ay && ax >= az && ax > 0.85) return T(x > 0 ? 'panel.edges.shellFaceRight' : 'panel.edges.shellFaceLeft');
      if (ay >= ax && ay >= az && ay > 0.85) return T(y > 0 ? 'panel.edges.shellFaceBack' : 'panel.edges.shellFaceFront');
    }
    return T('panel.edges.shellFaceOther');
  }
  function shell(face) {
    const it = face && App.doc.items.find((x) => x.id === face.id);
    if (!it || it.role === 'hole') { UI.toast('Klick auf eine Fläche eines Körpers.', { icon: 'info' }); return; }
    const sig = shellFaceSig(face.id, face.info);
    if (!sig) return;
    const ex = (it.finishes || []).find((f) => f.type === 'shell');
    App.change(ex ? 'Öffnung geändert' : 'Ausgehöhlt', (doc) => {
      const T = Model.find(doc, it.id).item; T.finishes = T.finishes || [];
      const s = T.finishes.find((f) => f.type === 'shell');
      if (!s) { T.finishes.push({ id: uid('f'), type: 'shell', r: 2, dir: 'in', faces: [sig] }); return; }
      const i = s.faces.findIndex((f) => sameShellFace(f, sig));
      if (i >= 0) { if (s.faces.length > 1) s.faces.splice(i, 1); }
      else {
        s.faces.push(sig);
        if (Array.isArray(s.faceWalls)) {
          s.faceWalls = s.faceWalls.filter((fw) => !sameShellFace(fw.face, sig));
          if (!s.faceWalls.length) delete s.faceWalls;
        }
      }
    });
    App.select([it.id]);
    UI.toast(ex ? 'Öffnung umgeschaltet. Jede Fläche, die du so anklickst, wird offen oder wieder zu.' : 'Ausgehöhlt mit 2 mm Wand. Rechts änderst du Wandstärke, Richtung und einzelne Flächen.', { icon: 'check' });
  }
  function setShellDir(itemId, finId, dir) {
    const next = dir === 'out' || dir === 'mid' ? dir : 'in';
    App.change('Wandrichtung geändert', (doc) => {
      const f = Model.find(doc, itemId); if (!f) return false;
      const fin = (f.item.finishes || []).find((x) => x.id === finId); if (!fin || fin.type !== 'shell') return false;
      fin.dir = next;
    });
  }
  function addShellFaceWall(itemId, finId, face, thickness) {
    const f = Model.find(App.doc, itemId);
    const fin = f && (f.item.finishes || []).find((x) => x.id === finId);
    if (!fin || fin.type !== 'shell') return null;
    const sig = face && face.info ? shellFaceSig(face.id || itemId, face.info) : (face && face.c ? face : null);
    if (!sig) return null;
    if ((fin.faces || []).some((x) => sameShellFace(x, sig))) {
      UI.toast('Diese Fläche ist bereits als Öffnung gewählt.', { icon: 'info' });
      return null;
    }
    let wallId = null;
    App.change('Wandstärke je Fläche hinzugefügt', (doc) => {
      const fn = Model.find(doc, itemId); if (!fn) return false;
      const s = (fn.item.finishes || []).find((x) => x.id === finId); if (!s) return false;
      s.faceWalls = s.faceWalls || [];
      const ex = s.faceWalls.find((fw) => sameShellFace(fw.face, sig));
      if (ex) {
        wallId = ex.id;
        if (thickness != null) ex.r = thickness;
        return;
      }
      const baseLbl = shellFaceLabel(sig);
      let lbl = baseLbl;
      if (s.faceWalls.some((fw) => fw.label === lbl)) {
        let k = 2;
        while (s.faceWalls.some((fw) => fw.label === `${baseLbl} ${k}`)) k++;
        lbl = `${baseLbl} ${k}`;
      }
      wallId = uid('fw');
      s.faceWalls.push({ id: wallId, face: sig, r: thickness ?? s.r ?? 2, label: lbl });
    });
    if (typeof Panels !== 'undefined') Panels.renderRight();
    return wallId;
  }
  function setShellFaceWall(itemId, finId, wallId, r) {
    App.change('Wandstärke je Fläche geändert', (doc) => {
      const f = Model.find(doc, itemId); if (!f) return false;
      const fin = (f.item.finishes || []).find((x) => x.id === finId); if (!fin || !Array.isArray(fin.faceWalls)) return false;
      const fw = fin.faceWalls.find((x) => x.id === wallId); if (!fw) return false;
      fw.r = r;
    }, { merge: 'fin:' + finId + ':' + wallId });
  }
  function removeShellFaceWall(itemId, finId, wallId) {
    App.change('Flächen-Wandstärke entfernt', (doc) => {
      const f = Model.find(doc, itemId); if (!f) return false;
      const fin = (f.item.finishes || []).find((x) => x.id === finId); if (!fin || !Array.isArray(fin.faceWalls)) return false;
      fin.faceWalls = fin.faceWalls.filter((x) => x.id !== wallId);
      if (!fin.faceWalls.length) delete fin.faceWalls;
    });
    if (typeof Panels !== 'undefined') Panels.renderRight();
  }
  function pickShellFaceWall(itemId, finId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id === itemId && hit.faceIdx >= 0) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && Array.isArray(fi.c)) {
          stopPick();
          const wid = addShellFaceWall(itemId, finId, { id: hit.id, idx: hit.faceIdx, info: fi });
          Panels.renderRight();
          if (wid) {
            const inp = document.getElementById('fin-fw-' + wid);
            if (inp) { inp.focus(); inp.select && inp.select(); }
          }
          return;
        }
      }
      UI.toast('Klick eine geschlossene Fläche dieses Körpers an.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      Viewer.highlightFace('hover', hit && hit.id === itemId && hit.faceIdx >= 0 ? hit.id : null, hit && hit.id === itemId && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche für eigene Wandstärke wählen:</b> Klick auf eine geschlossene Fläche dieses Körpers. <b>Esc</b> bricht ab.');
  }
  function renderShell(it, fin, w, V, rightIssues) {
    const err = App.errorsFor(it.id).find((x) => x.finishId === fin.id);
    const isRef = !!(err && RefFix.isRefError(err));
    const sh = h('div', { class: 'section' }, h('div', { class: 'section-h' }, T('panel.edges.shellTitle')));
    const row = h('div', { class: 'fields', style: { gridTemplateColumns: isRef ? '1fr auto auto' : '1fr auto', alignItems: 'end' } });
    const fnCnt = (fin.faces || []).length;
    const nf = UI.numField({ id: 'fin-' + fin.id, label: fnCnt === 1 ? T('panel.edges.shellOne') : T('panel.edges.shellMany', { n: fnCnt }), value: fin.r, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r: v }) });
    if (err) nf.querySelector('.inp').classList.add(isRef ? 'warn' : 'invalid');
    row.append(nf);
    if (isRef) {
      const iss = rightIssues.find((x) => x.finishId === fin.id);
      if (iss) { const fb = h('button', { type: 'button', class: 'btn small warn-act', 'data-help': 'refFix' }, T('panel.item.pickAgain')); fb.onclick = () => RefFix.start(iss); row.append(fb); }
    }
    const del = h('button', { type: 'button', class: 'btn ghost small', 'aria-label': T('panel.item.removeShell'), 'data-tip': T('panel.item.removeShell') }); del.innerHTML = icon('trash');
    del.onclick = () => Actions.removeFinish(it.id, fin.id);
    row.append(del); sh.append(row);

    const dirVal = fin.dir === 'out' || fin.dir === 'mid' ? fin.dir : 'in';
    const dirRow = h('div', { class: 'fields one', style: { marginTop: '8px' } });
    dirRow.append(UI.selectField({
      id: 'fin-dir-' + fin.id,
      label: T('panel.edges.shellDir'),
      value: dirVal,
      options: [['in', T('panel.edges.shellDirIn')], ['out', T('panel.edges.shellDirOut')], ['mid', T('panel.edges.shellDirMid')]],
      onChange: (v) => setShellDir(it.id, fin.id, v),
    }));
    sh.append(dirRow);

    const fwWrap = h('div', { class: 'shell-fw-wrap' });
    const walls = Array.isArray(fin.faceWalls) ? fin.faceWalls : [];
    for (const fw of walls) {
      const fRow = h('div', { class: 'fields shell-fw-row', style: { gridTemplateColumns: '1fr auto', alignItems: 'end' } });
      const wf = UI.numField({ id: 'fin-fw-' + fw.id, label: fw.label || shellFaceLabel(fw.face), value: fw.r, vars: V, onCommit: (v) => setShellFaceWall(it.id, fin.id, fw.id, v) });
      if (err && !isRef) wf.querySelector('.inp').classList.add('invalid');
      const wDel = h('button', { type: 'button', class: 'btn ghost small', id: 'fin-fw-del-' + fw.id, 'aria-label': T('panel.edges.shellRemoveFace'), 'data-tip': T('panel.edges.shellRemoveFace') }); wDel.innerHTML = icon('trash');
      wDel.onclick = () => removeShellFaceWall(it.id, fin.id, fw.id);
      fRow.append(wf, wDel);
      fwWrap.append(fRow);
    }
    const addBtn = h('button', { type: 'button', class: 'btn small', id: 'fin-addfw-' + fin.id, 'data-help': 'shellFaceWall' });
    addBtn.innerHTML = icon('plus') + esc(T('panel.edges.shellAddFace'));
    addBtn.onclick = () => pickShellFaceWall(it.id, fin.id);
    fwWrap.append(h('div', { class: 'btn-row' }, addBtn));
    sh.append(fwWrap);

    sh.append(h('div', { class: 'hint-box', html: T('panel.edges.shellHint') }));
    w.append(sh);
  }
  function setFilletShape(itemId, finId, shape) {
    const f = Model.find(App.doc, itemId);
    const fin = f && (f.item.finishes || []).find((x) => x.id === finId);
    if (!fin || fin.type !== 'fillet') return false;
    Actions.setFinish(itemId, finId, { shape: shape === 'g2' ? 'g2' : null });
    return true;
  }
  function setFilletCorner(itemId, finId, corner) {
    const f = Model.find(App.doc, itemId);
    const fin = f && (f.item.finishes || []).find((x) => x.id === finId);
    if (!fin || fin.type !== 'fillet') return false;
    Actions.setFinish(itemId, finId, { corner: corner === 'smooth' ? 'smooth' : null });
    return true;
  }
  function filletG2() {
    if (App.edges.length) return Actions.addFinish('fillet', 1, App.edges, { shape: 'g2' });
    if (App.sel.length) return Actions.finishAll(App.sel[0], 'fillet', 'all', 1, { shape: 'g2' });
    UI.toast('Wähle zuerst einen Körper oder eine Kante.', { icon: 'info' });
    return null;
  }
  function renderFilletMore(it, fin, mo, V, r0) {
    const vr = !!fin.vr;
    mo.append(UI.selectField({
      id: 'fin-mode-' + fin.id,
      label: T('panel.edges.filletMode'),
      value: vr ? 'var' : '',
      options: [['', T('panel.edges.vrEqual')], ['var', T('panel.edges.vrVar')]],
      onChange: (v) => Actions.setFinish(it.id, fin.id, v === 'var' ? { vr: true, r2: fin.r2 != null ? fin.r2 : round(r0 / 2, 3) } : { vr: null }),
    }));
    const sf = UI.selectField({
      id: 'fin-shape-' + fin.id,
      label: T('panel.edges.filletShape'),
      value: fin.shape === 'g2' ? 'g2' : 'round',
      options: [['round', T('panel.edges.shapeRound')], ['g2', T('panel.edges.shapeG2')]],
      onChange: (v) => setFilletShape(it.id, fin.id, v),
    });
    sf.dataset.help = 'filletG2';
    mo.append(sf);
    if (!vr) {
      const cf = UI.selectField({
        id: 'fin-corner-' + fin.id,
        label: T('panel.edges.filletCorner'),
        value: fin.corner === 'smooth' ? 'smooth' : 'sphere',
        options: [['sphere', T('panel.edges.cornerSphere')], ['smooth', T('panel.edges.cornerSmooth')]],
        onChange: (v) => setFilletCorner(it.id, fin.id, v),
      });
      cf.dataset.help = 'filletCorner';
      mo.append(cf);
    }
    if (vr) mo.append(UI.numField({ id: 'fin-r2-' + fin.id, label: T('panel.edges.to'), value: fin.r2 != null ? fin.r2 : r0, vars: V, onCommit: (v) => Actions.setFinish(it.id, fin.id, { r2: v }) }));
  }
  // ---------- Vollrundung (KP-38) und Ecken-Fase mit drei Abständen (KP-41) ----------
  function finishFaceSigOf(itemId, faceIdx) {
    const r = App.results.get(itemId);
    const fi = r && r.data && r.data.faces && r.data.faces[faceIdx];
    if (!fi || !fi.c) return null;
    const bb = r.data.bbox;
    const size = bb ? round(clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6, 8, 60), 2) : 20;
    return { c: fi.c.map((v) => round(v, 4)), n: fi.n ? fi.n.map((v) => round(v, 5)) : null, size, ...(fi.tid ? { tid: fi.tid } : {}) };
  }
  function canonicalEdgeOrder(entries) {
    const dom = (d) => {
      const a = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
      return a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
    };
    return entries.slice().sort((a, b) => {
      const da = dom(a.dir), db = dom(b.dir);
      if (da !== db) return da - db;
      for (let i = 0; i < 3; i++) if (Math.abs(a.dir[i] - b.dir[i]) > 1e-4) return a.dir[i] - b.dir[i];
      return a.idx - b.idx;
    });
  }
  function incidentEdgesAt(itemId, localPt) {
    const r = App.results.get(itemId);
    const eds = (r && r.data && r.data.edges) || [];
    const p = localPt;
    const d3 = (u, q) => Math.hypot(u[0] - q[0], u[1] - q[1], u[2] - q[2]);
    const out = [];
    for (let idx = 0; idx < eds.length; idx++) {
      const g = eds[idx];
      if (!g || !g.a || !g.b) continue;
      const da = d3(g.a, p), db = d3(g.b, p);
      if (Math.min(da, db) > 1e-2) continue;
      const other = da < db ? g.b : g.a;
      const vx = other[0] - p[0], vy = other[1] - p[1], vz = other[2] - p[2];
      const vl = Math.hypot(vx, vy, vz) || 1;
      const dir = [round(vx / vl, 5), round(vy / vl, 5), round(vz / vl, 5)];
      const sig = Actions.edgeSigOf(itemId, idx);
      if (!sig) continue;
      sig.dir = dir;
      out.push({ idx, sig, dir, len: g.l || vl, a: g.a, b: g.b });
    }
    return canonicalEdgeOrder(out);
  }
  function pickCornerAt(cx, cy, filterItemId = null) {
    const rect = Viewer.canvas.getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    const camPos = Viewer.setRay(cx, cy).ray.origin.clone();
    const candidates = [];
    for (const [id, r] of App.results.entries()) {
      if (filterItemId && id !== filterItemId) continue;
      if (!r || !r.data || !Array.isArray(r.data.edges) || !r.data.edges.length) continue;
      const f = Model.find(App.doc, id);
      if (!f || f.item.hidden || f.item.role === 'hole' || App.mergedInto(id)) continue;
      const W = Model.worldMatrix(App.doc, id);
      const corners = [];
      for (let idx = 0; idx < r.data.edges.length; idx++) {
        const g = r.data.edges[idx];
        if (!g || !g.a || !g.b) continue;
        for (const pt of [g.a, g.b]) {
          let c = corners.find((q) => Math.hypot(q.local[0] - pt[0], q.local[1] - pt[1], q.local[2] - pt[2]) < 1e-3);
          if (!c) {
            const w = new THREE.Vector3(...pt).applyMatrix4(W);
            const sc = Viewer.toScreen(w);
            c = { local: pt, world: w, sc, d2: sc.behind ? Infinity : Math.hypot(sc.x - px, sc.y - py), camD: w.distanceTo(camPos), edgeIdxs: new Set() };
            corners.push(c);
          }
          c.edgeIdxs.add(idx);
        }
      }
      for (const c of corners) {
        if (c.d2 <= 22 && c.edgeIdxs.size >= 3) candidates.push({ id, ...c });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const a3 = a.edgeIdxs.size === 3 ? 0 : 1, b3 = b.edgeIdxs.size === 3 ? 0 : 1;
      if (a3 !== b3) return a3 - b3;
      if (Math.abs(a.d2 - b.d2) > 4) return a.d2 - b.d2;
      return a.camD - b.camD;
    });
    const best = candidates[0];
    const edges = incidentEdgesAt(best.id, best.local);
    return { id: best.id, localPt: best.local, worldPt: best.world, edges, minLen: Math.min(...edges.map((x) => x.len || 10)) };
  }
  function addFullFillet(itemId, faces, opts = {}) {
    const it = itemId && Model.find(App.doc, itemId)?.item;
    if (!it || it.role === 'hole') { UI.toast(T('fullFillet.needFace'), { icon: 'info' }); return null; }
    if (!Array.isArray(faces) || faces.length !== 3) return null;
    const sigs = faces.map((f) => (typeof f === 'number' ? finishFaceSigOf(itemId, f) : (f && f.idx != null ? finishFaceSigOf(f.id || itemId, f.idx) : f))).filter(Boolean);
    if (sigs.length !== 3) return null;
    let finId = opts.replaceFinId || uid('f');
    App.change(opts.replaceFinId ? 'Vollrundung geändert' : 'Vollrundung', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn) return false;
      fn.item.finishes = fn.item.finishes || [];
      if (opts.replaceFinId) {
        const ex = fn.item.finishes.find((x) => x.id === opts.replaceFinId);
        if (!ex) return false;
        ex.faces = sigs;
      } else {
        fn.item.finishes.push({ id: finId, type: 'fullFillet', faces: sigs });
      }
    });
    App.select([itemId]);
    UI.toast(T('fullFillet.added'), { icon: 'check' });
    return finId;
  }
  function startFullFillet(firstFace = null, opts = {}) {
    stopPick();
    let targetId = (firstFace && firstFace.id) || opts.itemId || null;
    const picked = [];
    if (firstFace && firstFace.id && firstFace.idx != null) picked.push({ id: firstFace.id, idx: firstFace.idx, info: firstFace.info || App.results.get(firstFace.id)?.data?.faces?.[firstFace.idx] });
    const updateOverlay = () => {
      const specs = [];
      for (const pf of picked) {
        if (!pf.info || !pf.info.c) continue;
        const W = Model.worldMatrix(App.doc, pf.id);
        const o = new THREE.Vector3(...pf.info.c).applyMatrix4(W).toArray();
        const n = new THREE.Vector3(...(pf.info.n || [0, 0, 1])).transformDirection(W).normalize().toArray();
        const bb = App.results.get(pf.id)?.data?.bbox;
        const size = bb ? clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.45, 6, 36) : 16;
        specs.push({ kind: 'plane', o, n, size });
      }
      Viewer.setRefGhost(specs);
      const step = picked.length;
      UI.hint(step === 0 ? T('fullFillet.hint1') : step === 1 ? T('fullFillet.hint2') : T('fullFillet.hint3'));
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (!hit || hit.faceIdx == null || hit.faceIdx < 0) { UI.toast(T('fullFillet.needFace'), { icon: 'info' }); return; }
      if (targetId && hit.id !== targetId) { UI.toast(T('fullFillet.needSameBody'), { icon: 'info' }); return; }
      if (picked.some((x) => x.idx === hit.faceIdx)) { UI.toast(T('fullFillet.alreadyPicked'), { icon: 'info' }); return; }
      if (!targetId) targetId = hit.id;
      const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
      picked.push({ id: hit.id, idx: hit.faceIdx, info: fi });
      if (picked.length >= 3) {
        stopPick();
        addFullFillet(targetId, picked, opts);
      } else {
        updateOverlay();
      }
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const ok = hit && hit.faceIdx >= 0 && (!targetId || hit.id === targetId) && !picked.some((x) => x.idx === hit.faceIdx);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key, ghost: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    updateOverlay();
  }
  function addCornerChamfer(itemId, v, dists = null, opts = {}) {
    const it = itemId && Model.find(App.doc, itemId)?.item;
    if (!it || it.role === 'hole') return null;
    const inc = incidentEdgesAt(itemId, v);
    if (inc.length !== 3) { UI.toast(T('cornerChamfer.needThreeEdges'), { icon: 'info' }); return null; }
    let ds = Array.isArray(dists) && dists.length === 3 ? dists : null;
    if (!ds) {
      const minL = Math.min(...inc.map((x) => x.len || 10));
      const def = Math.min(2, round(Math.max(0.2, minL * 0.35), 1));
      ds = [def, def, def];
    }
    const finId = opts.replaceFinId || uid('f');
    const vRounded = v.map((x) => round(x, 5));
    const edgeSigs = inc.map((x) => x.sig);
    App.change('Ecken-Fase', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn) return false;
      fn.item.finishes = fn.item.finishes || [];
      if (opts.replaceFinId) {
        const ex = fn.item.finishes.find((x) => x.id === opts.replaceFinId);
        if (!ex) return false;
        ex.v = vRounded; ex.d1 = ds[0]; ex.d2 = ds[1]; ex.d3 = ds[2]; ex.edges = edgeSigs;
      } else {
        fn.item.finishes.push({ id: finId, type: 'cornerChamfer', v: vRounded, d1: ds[0], d2: ds[1], d3: ds[2], edges: edgeSigs });
      }
    });
    App.select([itemId]);
    UI.toast(T('cornerChamfer.added'), { icon: 'check' });
    return finId;
  }
  function startCornerChamfer(itemId = null, opts = {}) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = pickCornerAt(e.clientX, e.clientY, itemId);
      if (!hit) { UI.toast(T('cornerChamfer.pickNeed'), { icon: 'info' }); return; }
      stopPick();
      addCornerChamfer(hit.id, hit.localPt, opts.dists || null, opts);
    };
    const move = (e) => {
      const hit = pickCornerAt(e.clientX, e.clientY, itemId);
      if (!hit) { Viewer.clearRefGhost(); return; }
      const W = Model.worldMatrix(App.doc, hit.id);
      const pos = [];
      for (const ed of hit.edges) {
        const p0 = hit.worldPt.toArray();
        const dL = Math.min(ed.len * 0.45, Math.max(2, hit.minLen * 0.4));
        const p1 = new THREE.Vector3(hit.localPt[0] + ed.dir[0] * dL, hit.localPt[1] + ed.dir[1] * dL, hit.localPt[2] + ed.dir[2] * dL).applyMatrix4(W).toArray();
        pos.push(...p0, ...p1);
      }
      Viewer.setRefGhost([{ kind: 'marker', p: hit.worldPt.toArray(), r: 2.2 }, { kind: 'segments', positions: pos, dots: [hit.worldPt.toArray()] }]);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key, ghost: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(T('cornerChamfer.hint'));
  }
  // ---------- Flächen-Rundung (KP-39) und Schräge an Trennlinie (KP-42) ----------
  function addFaceFillet(itemId, faces, r = 5, opts = {}) {
    const it = itemId && Model.find(App.doc, itemId)?.item;
    if (!it || it.role === 'hole') { UI.toast(T('faceFillet.needFace'), { icon: 'info' }); return null; }
    if (!Array.isArray(faces) || faces.length !== 2) return null;
    const sigs = faces.map((f) => (typeof f === 'number' ? finishFaceSigOf(itemId, f) : (f && f.idx != null ? finishFaceSigOf(f.id || itemId, f.idx) : f))).filter(Boolean);
    if (sigs.length !== 2) return null;
    const rad = r != null ? r : 5;
    const finId = opts.replaceFinId || uid('f');
    App.change(opts.replaceFinId ? 'Flächen-Rundung geändert' : 'Flächen-Rundung', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn) return false;
      fn.item.finishes = fn.item.finishes || [];
      if (opts.replaceFinId) {
        const ex = fn.item.finishes.find((x) => x.id === opts.replaceFinId);
        if (!ex) return false;
        ex.faces = sigs;
        if (opts.r != null) ex.r = rad;
      } else {
        fn.item.finishes.push({ id: finId, type: 'faceFillet', r: rad, faces: sigs });
      }
    });
    App.select([itemId]);
    UI.toast(T('faceFillet.added'), { icon: 'check' });
    return finId;
  }
  function startFaceFillet(firstFace = null, opts = {}) {
    stopPick();
    let targetId = (firstFace && firstFace.id) || opts.itemId || null;
    const picked = [];
    if (firstFace && firstFace.id && firstFace.idx != null) picked.push({ id: firstFace.id, idx: firstFace.idx, info: firstFace.info || App.results.get(firstFace.id)?.data?.faces?.[firstFace.idx] });
    const updateOverlay = () => {
      const specs = [];
      for (const pf of picked) {
        if (!pf.info || !pf.info.c) continue;
        const W = Model.worldMatrix(App.doc, pf.id);
        const o = new THREE.Vector3(...pf.info.c).applyMatrix4(W).toArray();
        const n = new THREE.Vector3(...(pf.info.n || [0, 0, 1])).transformDirection(W).normalize().toArray();
        const bb = App.results.get(pf.id)?.data?.bbox;
        const size = bb ? clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.45, 6, 36) : 16;
        specs.push({ kind: 'plane', o, n, size });
      }
      Viewer.setRefGhost(specs);
      UI.hint(picked.length === 0 ? T('faceFillet.hint1') : T('faceFillet.hint2'));
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (!hit || hit.faceIdx == null || hit.faceIdx < 0) { UI.toast(T('faceFillet.needFace'), { icon: 'info' }); return; }
      if (targetId && hit.id !== targetId) { UI.toast(T('faceFillet.needSameBody'), { icon: 'info' }); return; }
      if (picked.some((x) => x.idx === hit.faceIdx)) { UI.toast(T('faceFillet.alreadyPicked'), { icon: 'info' }); return; }
      if (!targetId) targetId = hit.id;
      const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
      picked.push({ id: hit.id, idx: hit.faceIdx, info: fi });
      if (picked.length >= 2) {
        stopPick();
        addFaceFillet(targetId, picked, opts.r != null ? opts.r : 5, opts);
      } else {
        updateOverlay();
      }
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const ok = hit && hit.faceIdx >= 0 && (!targetId || hit.id === targetId) && !picked.some((x) => x.idx === hit.faceIdx);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key, ghost: true };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    updateOverlay();
  }
  function addPartingDraft(itemId, opts = {}) {
    const it = itemId && Model.find(App.doc, itemId)?.item;
    if (!it || it.role === 'hole') return null;
    const axis = opts.axis === 'x' || opts.axis === 'y' ? opts.axis : 'z';
    const axIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const bb = App.results.get(itemId)?.data?.bbox;
    const midPos = bb ? round((bb[axIdx] + bb[axIdx + 3]) / 2, 2) : 0;
    let mode = opts.mode || 'mid';
    let edges = opts.edges || null;
    if (opts.edge && opts.edge.edgeIdx != null) {
      const sig = Actions.edgeSigOf(opts.edge.id || itemId, opts.edge.edgeIdx);
      if (sig) { mode = 'edge'; edges = [sig]; }
    }
    const r = opts.r != null ? opts.r : 3;
    const sym = opts.sym !== false;
    const r2 = sym ? r : (opts.r2 != null ? opts.r2 : r);
    const finId = uid('f');
    const fin = { id: finId, type: 'partingDraft', r, sym, r2, mode, axis };
    if (opts.pos != null) fin.pos = opts.pos;
    else if (mode === 'offset') fin.pos = midPos;
    if (edges) fin.edges = edges;
    if (opts.datumId) fin.datumId = opts.datumId;
    if (opts.flip) fin.flip = true;
    App.change('Schräge an Trennlinie', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn) return false;
      fn.item.finishes = fn.item.finishes || [];
      fn.item.finishes.push(fin);
    });
    App.select([itemId]);
    UI.toast(T('partingDraft.added'), { icon: 'check' });
    return finId;
  }
  function pickPartingDraftEdge(itemId, finId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      if (!hit || hit.id !== itemId || hit.edgeIdx == null || hit.edgeIdx < 0) {
        UI.toast(T('partingDraft.needEdge'), { icon: 'info' });
        return;
      }
      const sig = Actions.edgeSigOf(itemId, hit.edgeIdx);
      if (!sig) return;
      stopPick();
      App.change('Trennlinien-Kante gewählt', (doc) => {
        const fn = Model.find(doc, itemId);
        if (!fn) return false;
        const fin = (fn.item.finishes || []).find((x) => x.id === finId);
        if (!fin) return false;
        fin.mode = 'edge';
        fin.edges = [sig];
      });
      UI.toast(T('partingDraft.edgePicked'), { icon: 'check' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    UI.hint(T('partingDraft.pickEdgeHint'));
  }
  // ---------- Einzelne Kopien im Muster auslassen (KP-13) ----------
  let patDots = [];
  function togglePatternSkip(id, idx) {
    const f = Model.find(App.doc, id);
    if (!f || !isOp(f.item) || f.item.p.op !== 'pattern' || f.item.p.pt === 'mirror') return false;
    const V = Model.vars(App.doc).v, inst = Model.patternInstances(f.item, V);
    const k = Math.round(Number(idx));
    if (!inst.some((x) => x.idx === k)) return false;
    const valid = new Set(inst.map((x) => x.idx));
    const cur = new Set((Array.isArray(f.item.p.skip) ? f.item.p.skip : []).map((x) => Math.round(Number(x))).filter((x) => valid.has(x)));
    const wasSkipped = cur.has(k);
    if (wasSkipped) cur.delete(k);
    else {
      if (cur.size + 1 >= inst.length) { UI.toast('Mindestens eine Kopie muss aktiv bleiben.', { icon: 'info' }); return false; }
      cur.add(k);
    }
    const next = [...cur].sort((a, b) => a - b);
    App.change(wasSkipped ? `Kopie ${k + 1} wieder aktiv` : `Kopie ${k + 1} ausgelassen`, (doc) => {
      const fn = Model.find(doc, id); if (!fn) return false;
      if (next.length) fn.item.p.skip = next; else delete fn.item.p.skip;
    });
    return true;
  }
  function resetPatternSkip(id) {
    const f = Model.find(App.doc, id);
    if (!f || !f.item.p || !Array.isArray(f.item.p.skip) || !f.item.p.skip.length) return false;
    App.change('Alle Kopien aktiviert', (doc) => {
      const fn = Model.find(doc, id); if (!fn || !fn.item.p) return false;
      delete fn.item.p.skip;
    });
    return true;
  }
  function clearPatternMarkers() {
    for (const d of patDots) d.el.remove();
    patDots = [];
  }
  function placePatternMarkers() {
    if (!patDots.length) return;
    for (const d of patDots) {
      const s = Viewer.toScreen(d.world);
      if (s.behind) d.el.style.display = 'none';
      else { d.el.style.display = ''; d.el.style.left = s.x + 'px'; d.el.style.top = s.y + 'px'; }
    }
  }
  function syncPatternMarkers() {
    clearPatternMarkers();
    if (typeof Viewer === 'undefined' || !Viewer.container || App.mode !== 'model' || Sketch.active || Place.active || Handles.dragging || Views.exploded || App.sel.length !== 1) return;
    const f = Model.find(App.doc, App.sel[0]); if (!f) return;
    const it = f.item;
    if (!isOp(it) || it.p.op !== 'pattern' || it.p.pt === 'mirror') return;
    if (!App.ctx && !Model.isActive(App.doc, it.id)) return;
    const V = Model.vars(App.doc).v, inst = Model.patternInstances(it, V);
    if (inst.length < 2 || inst.length > 64) return;
    const ov = $('#overlay'); if (!ov) return;
    const bb = App.baseBox(it.id) || Model.itemLocalBox(it, V) || App.localBox(it.id);
    const c0 = bb ? new THREE.Vector3((bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2) : new THREE.Vector3();
    const W = Model.worldMatrix(App.doc, it.id);
    for (const x of inst) {
      const w = c0.clone().applyMatrix4(x.matrix).applyMatrix4(W);
      const b = h('button', {
        type: 'button',
        class: 'pat-dot' + (x.skipped ? ' skipped' : ''),
        'aria-pressed': x.skipped ? 'true' : 'false',
        dataset: { idx: x.idx },
        'data-tip': x.skipped ? `Kopie ${x.label} ausgelassen – klicken zum Aktivieren` : `Kopie ${x.label} – klicken zum Auslassen`,
      }, x.label);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); togglePatternSkip(it.id, x.idx); });
      ov.append(b);
      patDots.push({ el: b, world: w });
    }
    placePatternMarkers();
  }
  if (typeof Viewer !== 'undefined' && Viewer.on) Viewer.on('camera', placePatternMarkers);
  if (typeof window !== 'undefined') window.addEventListener('resize', placePatternMarkers);
  function renderSkipUI(it, sec) {
    const p = it.p || {};
    if (p.op !== 'pattern' || (p.pt !== 'rect' && p.pt !== 'circ' && p.pt !== 'path' && p.pt !== 'points' && p.pt !== 'table')) return;
    const V = Model.vars(App.doc).v, inst = Model.patternInstances(it, V);
    if (inst.length < 2) return;
    const active = inst.filter((x) => !x.skipped).length;
    const box = h('div', { class: 'pat-skip-box', id: 'op-skip-wrap', 'data-help': 'patternSkip' });
    const head = h('div', { class: 'pat-skip-head' }, h('span', null, `Kopien (${active} von ${inst.length} aktiv)`));
    if (active < inst.length) {
      const rb = h('button', { type: 'button', class: 'btn ghost small', id: 'op-skip-reset' }, 'Alle aktivieren');
      rb.onclick = () => resetPatternSkip(it.id);
      head.append(rb);
    }
    const chips = h('div', { class: 'pat-chips' });
    for (const x of inst) {
      const ch = h('button', {
        type: 'button',
        class: 'pat-chip' + (x.skipped ? ' skipped' : ''),
        'aria-pressed': x.skipped ? 'true' : 'false',
        dataset: { idx: x.idx },
        'data-tip': x.skipped ? `Kopie ${x.label} wieder aktivieren` : `Kopie ${x.label} auslassen`,
      }, x.label);
      ch.onclick = () => togglePatternSkip(it.id, x.idx);
      chips.append(ch);
    }
    box.append(head, chips);
    sec.append(box);
  }
  function renderPatternGrowthUI(it, sec, setP) {
    const p = it.p || {};
    if (p.op !== 'pattern' || (p.pt !== 'rect' && p.pt !== 'circ' && p.pt !== 'path')) return;
    const sUnit = p.scaleUnit === 'mm' ? 'mm' : 'pct';
    const dUnit = p.distUnit === 'mm' ? 'mm' : 'pct';
    const isCirc = p.pt === 'circ';
    const box = h('div', { class: 'pat-grow-box pro', id: 'op-grow-wrap', 'data-help': 'patternGrowth' });
    box.append(h('div', { class: 'pat-grow-head' }, 'Wachstum je Kopie'));
    const g1 = h('div', { class: 'pat-grow-grid' });
    g1.append(
      UI.numField({ id: 'op-scaleStep', label: 'Größe je Kopie', value: p.scaleStep ?? 0, unit: sUnit === 'mm' ? 'mm' : '%', len: sUnit === 'mm', onCommit: (v) => setP('scaleStep', v) }),
      UI.selectField({ id: 'op-scaleUnit', label: 'Einheit', value: sUnit, options: [['pct', '%'], ['mm', 'mm']], onChange: (v) => setP('scaleUnit', v) })
    );
    const g2 = h('div', { class: 'pat-grow-grid' });
    g2.append(
      UI.numField({ id: 'op-distStep', label: isCirc ? 'Winkel je Kopie' : 'Abstand je Kopie', value: p.distStep ?? 0, unit: dUnit === 'mm' ? (isCirc ? '°' : 'mm') : '%', len: dUnit === 'mm' && !isCirc, onCommit: (v) => setP('distStep', v) }),
      UI.selectField({ id: 'op-distUnit', label: 'Einheit', value: dUnit, options: [['pct', '%'], ['mm', isCirc ? '°' : 'mm']], onChange: (v) => setP('distUnit', v) })
    );
    box.append(g1, g2);
    const V = Model.vars(App.doc).v;
    const scaleVal = Model.num(p.scaleStep, V, 0);
    if (Math.abs(scaleVal) > 1e-9) {
      const inst = Model.patternInstances(it, V);
      const maxStep = Math.max(0, ...inst.filter((x) => !x.skipped).map((x) => x.stepIdx ?? x.idx ?? 0));
      const bb = App.baseBox(it.id) || Model.itemLocalBox(it, V) || App.localBox(it.id);
      const refSize = bb ? Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], 1e-3) : 10;
      const lastScale = Model.patternScaleFactor(maxStep, scaleVal, sUnit, refSize);
      box.append(h('div', { class: 'pat-grow-info', id: 'op-grow-info' }, `Letzte Kopie: ${fmt(lastScale, 2)}× so groß`));
    }
    sec.append(box);
  }
  // ---------- Rechte Leiste ----------
  function renderOp(it, sec, setP) {
    const p = it.p || {};
    const f = h('div', { class: 'fields' });
    const num = (k, label, unit = 'mm', o = {}) => UI.numField({ id: 'op-' + k, label, value: p[k], unit, int: o.int, min: o.min, onCommit: (v) => setP(k, v) });
    const sel = (k, label, opts) => UI.selectField({ id: 'op-' + k, label, value: p[k], options: opts, onChange: (v) => setP(k, v) });
    let hint = '';
    if (p.op === 'pattern' && p.pt === 'rect') { f.append(num('nx', 'Anzahl X', '', { int: true, min: 1 }), num('ny', 'Anzahl Y', '', { int: true, min: 1 }), num('dx', 'Abstand X'), num('dy', 'Abstand Y')); hint = 'Die Anzahl zählt das Original mit. Abstände gehen von Mitte zu Mitte. Klick im Bild oder rechts auf eine Kopie, um sie auszulassen (durchgestrichen).'; }
    else if (p.op === 'pattern' && p.pt === 'circ') {
      const axObj = p.axisId && typeof Datums !== 'undefined' ? Datums.findAxis(p.axisId) : null;
      const ax = p.axis === 'x' || p.axis === 'y' || (p.axis === 'pick' && Array.isArray(p.ad)) ? p.axis : 'z';
      const axisVal = axObj ? 'da:' + axObj.id : ax;
      const axisOpts = [['z', 'Senkrecht (Z)'], ['x', 'Quer (X)'], ['y', 'Längs (Y)'], ['pick', 'Im Bild gewählt'], ...(typeof Datums !== 'undefined' ? Datums.axes().filter((a) => a.axis).map((a) => ['da:' + a.id, 'Bezugsachse „' + a.name + '“']) : [])];
      f.append(num('n', 'Anzahl', '', { int: true, min: 1 }), num('ang', 'Winkel', '°'));
      f.append(UI.selectField({
        id: 'op-axis', label: 'Drehachse', value: axisVal, options: axisOpts,
        onChange: (v) => {
          if (v.startsWith('da:')) setPatternAxis(it.id, v.slice(3));
          else if (v === 'pick') pickAxis(it.id);
          else App.change('Drehachse geändert', (doc) => { const fn = Model.find(doc, it.id); if (!fn) return false; fn.item.p.axis = v; delete fn.item.p.axisId; });
        },
      }));
      let info = null;
      if (ax === 'pick' || p.axisId) {
        const d = (p.ad || [0, 0, 1]).map((v) => fmt(v, 2)).join(' · '), o = (p.ao || [0, 0, 0]).map((v) => fmt(v, 1)).join(' · ');
        const lbl = p.axisId ? (axObj ? `Bezugsachse „${axObj.name}“` : 'Bezugsachse fehlt') : 'Richtung ' + d;
        info = h('div', { class: 'mini-row', id: 'op-axisinfo' }, h('span', { class: 'grow' }, lbl), h('b', { class: 'mono' }, 'durch ' + o));
      } else {
        if (ax !== 'x') f.append(num('cx', 'Mitte X'));
        if (ax !== 'y') f.append(num('cy', 'Mitte Y'));
        if (ax !== 'z') f.append(num('cz', 'Mitte Z'));
      }
      const pb = h('button', { type: 'button', class: 'btn', id: 'op-axispick' }); pb.innerHTML = icon('cursor') + (ax === 'pick' ? 'Andere Achse wählen' : 'Achse im Bild wählen');
      pb.onclick = () => pickAxis(it.id);
      hint = { z: 'Gedreht wird um die senkrechte Achse durch die Mitte.', x: 'Gedreht wird um eine Achse quer (in X-Richtung) durch die Mitte – z. B. Löcher rund um ein liegendes Rohr.', y: 'Gedreht wird um eine Achse längs (in Y-Richtung) durch die Mitte – z. B. Rippen rund um ein liegendes Gehäuse.', pick: 'Gedreht wird um die gewählte Achse – eine gerade Kante, eine Welle oder ein Loch, auch schräg.' }[ax] + ' 360° verteilt die Kopien rundherum. Klick im Bild oder rechts auf eine Kopie, um sie auszulassen (durchgestrichen).';
      sec.append(f); if (info) sec.append(info);
      sec.append(h('div', { class: 'btn-row' }, pb));
      renderPatternGrowthUI(it, sec, setP);
      renderSkipUI(it, sec);
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'path') {
      f.append(num('n', 'Anzahl', '', { int: true, min: 1 }), num('d', 'Abstand', 'mm', { min: 0 }));
      f.append(UI.selectField({ id: 'op-align', label: 'Ausrichtung', value: p.align === false ? 'nein' : 'ja', options: [['ja', 'Mit der Kurve'], ['nein', 'Wie das Original']], onChange: (v) => setP('align', v === 'ja') }));
      hint = 'Die Anzahl zählt das Original mit. <b>Abstand 0</b> verteilt die Kopien gleichmäßig über die ganze Kurve, ein Wert setzt sie in diesem Abstand – bis die Kurve zu Ende ist. Ausrichtung „Mit der Kurve“ dreht jede Kopie so, wie die Kurve abbiegt – wie Zähne an einem Bogen. Klick im Bild oder rechts auf eine Kopie, um sie auszulassen (durchgestrichen).';
      const eb = h('button', { type: 'button', class: 'btn', id: 'op-editpath' }); eb.innerHTML = icon('sketch') + 'Kurve bearbeiten';
      eb.onclick = () => Sketch.editItem(it.id);
      sec.append(f, h('div', { class: 'btn-row' }, eb));
      renderPatternGrowthUI(it, sec, setP);
      renderSkipUI(it, sec);
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'points') {
      const ownIds = new Set([it.id]);
      Model.walk(it.children || [], (c) => ownIds.add(c.id));
      const srcOpts = [['', 'Eigene Punkt-Skizze']];
      Model.walk(App.doc.items || [], (x) => {
        if (ownIds.has(x.id)) return;
        const ents = x.p && x.p.sketch && x.p.sketch.ents;
        if (Array.isArray(ents) && ents.some((e) => e && e.type === 'point')) {
          srcOpts.push([x.id, Model.label(x)]);
        }
      });
      const curSrc = p.sourceId && srcOpts.some((o) => o[0] === p.sourceId) ? p.sourceId : '';
      f.append(UI.selectField({
        id: 'op-points-source', label: 'Punkt-Quelle', value: curSrc, options: srcOpts,
        onChange: (v) => App.change('Punkt-Quelle geändert', (doc) => {
          const fn = Model.find(doc, it.id); if (!fn) return false;
          if (v) fn.item.p.sourceId = v;
          else {
            delete fn.item.p.sourceId;
            if (!fn.item.p.sketch) {
              const ref = fn.item.p.ref || [0, 0, 0];
              fn.item.p.sketch = { plane: { o: [0, 0, ref[2] || 0], x: [1, 0, 0], n: [0, 0, 1] }, ents: [], dims: [], cons: [] };
            }
          }
          delete fn.item.p.skip;
        }),
      }));
      const V = Model.vars(App.doc).v;
      const inst = Model.patternInstances(it, V);
      const ptsCnt = (Model.pointsPatternParams(it, V).places || []).length;
      const eb = h('button', { type: 'button', class: 'btn', id: 'op-editpoints' });
      eb.innerHTML = icon('sketch') + 'Punkte bearbeiten';
      eb.onclick = () => {
        if (curSrc && Model.find(App.doc, curSrc)) { Sketch.editItem(curSrc); return; }
        if (!it.p.sketch) {
          App.change('Punkt-Skizze angelegt', (doc) => {
            const fn = Model.find(doc, it.id); if (!fn) return false;
            const ref = fn.item.p.ref || [0, 0, 0];
            fn.item.p.sketch = { plane: { o: [0, 0, ref[2] || 0], x: [1, 0, 0], n: [0, 0, 1] }, ents: [], dims: [], cons: [] };
          }, { amend: true });
        }
        Sketch.editItem(it.id);
      };
      const koL = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'op-keep-origin', checked: !!p.keepOrigin }), 'Original zusätzlich behalten');
      koL.querySelector('input').onchange = (e) => App.change('Original-Kopie umgeschaltet', (doc) => {
        const fn = Model.find(doc, it.id); if (!fn) return false;
        if (e.target.checked) fn.item.p.keepOrigin = true; else delete fn.item.p.keepOrigin;
      });
      hint = 'Setzt an jedem Punkt der gewählten Skizze eine Kopie (ohne zusätzliches Original). Klick im Bild oder rechts auf eine Kopie, um sie auszulassen.';
      sec.append(f, h('div', { class: 'mini-row', id: 'op-points-count' }, h('span', { class: 'grow' }, 'Kopien an Punkten'), h('b', { class: 'mono' }, String(ptsCnt || inst.length))), h('div', { class: 'btn-row' }, eb), koL);
      renderSkipUI(it, sec);
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'table') {
      f.append(UI.selectField({
        id: 'op-table-mode', label: 'Koordinaten', value: p.mode === 'rel' ? 'rel' : 'abs',
        options: [['abs', 'Zielposition (X, Y, Z)'], ['rel', 'Versatz zum Original (dX, dY, dZ)']],
        onChange: (v) => App.change('Tabellen-Modus geändert', (doc) => { Model.find(doc, it.id).item.p.mode = v; }),
      }));
      const ta = h('textarea', { id: 'op-table-csv', class: 'inp mono', rows: 5, placeholder: 'x;y;z;rot\n0;0;0;0\n20;0;0;0', style: { width: '100%', fontSize: '12px', resize: 'vertical', marginTop: '6px' } });
      ta.value = p.csv || '';
      const applyBtn = h('button', { type: 'button', class: 'btn small primary', id: 'op-table-apply' });
      applyBtn.innerHTML = icon('check') + 'Übernehmen';
      applyBtn.onclick = () => setPatternTableCSV(it.id, ta.value);
      const fileInp = h('input', { type: 'file', id: 'op-table-file', accept: '.csv,.txt', style: { display: 'none' } });
      fileInp.onchange = async () => {
        const fl = fileInp.files && fileInp.files[0];
        if (!fl) return;
        const txt = await fl.text();
        ta.value = txt;
        setPatternTableCSV(it.id, txt);
        fileInp.value = '';
      };
      const loadBtn = h('button', { type: 'button', class: 'btn small', id: 'op-table-load' });
      loadBtn.innerHTML = icon('folder') + 'CSV laden …';
      loadBtn.onclick = () => fileInp.click();
      const parsed = Model.parsePatternCSV(p.csv || '', Model.vars(App.doc).v);
      const stTxt = parsed.ok
        ? (parsed.rows.length === 1 ? '1 Zeile erkannt' : `${parsed.rows.length} Zeilen erkannt`) + (parsed.skipped ? ` (${parsed.skipped} übersprungen)` : '')
        : (parsed.error || 'Ungültige Tabelle');
      const stBox = h('div', { class: parsed.ok ? 'mini-row' : 'err-box', id: 'op-table-status' });
      if (parsed.ok) stBox.append(h('span', { class: 'grow' }, 'Gültige Einträge'), h('b', { class: 'mono' }, stTxt));
      else stBox.textContent = stTxt;
      hint = 'Jede Zeile erzeugt eine Kopie – Spalten: <b>X, Y</b> (optional <b>Z</b> und Drehung <b>rot</b> in °), getrennt durch Semikolon, Komma oder Tab. Auch Maßnamen und Formeln sind möglich.';
      sec.append(f, ta, h('div', { class: 'btn-row', style: { marginTop: '6px' } }, applyBtn, loadBtn), fileInp, stBox);
      renderSkipUI(it, sec);
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen (nur Original behalten)';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    }
    else if (p.op === 'pattern' && p.pt === 'mirror' && p.plane === 'FACE') { hint = 'Gespiegelt an einer gewählten Fläche. Original und Spiegelbild sind ein Körper. ' + (p.bind ? 'Die Ebene hängt an der äußeren Fläche: Wird das Original größer, wandert sie mit.' : 'Die Ebene bleibt, wo die Fläche beim Spiegeln war.') + ' Für eine andere Ebene: Rückgängig und neu spiegeln.'; }
    else if (p.op === 'pattern' && p.pt === 'mirror') { f.append(sel('plane', 'Spiegeln', [['YZ', 'Links ↔ rechts'], ['XZ', 'Vorne ↔ hinten'], ['XY', 'Oben ↔ unten']]), num('off', 'Lage der Ebene')); hint = 'Original und Spiegelbild werden ein Körper. Die Ebene geht durch den Nullpunkt, „Lage“ verschiebt sie.'; }
    else if (p.op === 'split') {
      const pl = p.plane || 'XY';
      const isSimple = typeof ViewPrefs !== 'undefined' && ViewPrefs.simple;
      const planeOpts = [['XY', 'Waagerecht (XY)'], ['XZ', 'Von vorne (XZ)'], ['YZ', 'Von der Seite (YZ)']];
      if (!isSimple || pl === 'FACE' || pl === 'SKETCH') {
        planeOpts.push(['FACE', 'Fläche (Profi)'], ['SKETCH', 'Skizze / Kurve (Profi)']);
      }
      f.append(UI.selectField({
        id: 'op-plane', label: 'Schnitt', value: pl, options: planeOpts,
        onChange: (v) => {
          if (v === 'FACE') { if (p.faceRef) setP('plane', 'FACE'); else pickSplitToolFace(it.id); }
          else if (v === 'SKETCH') { if (p.sketch) setP('plane', 'SKETCH'); else startSplitSketch(it.id); }
          else setP('plane', v);
        },
      }));
      if (pl === 'FACE') {
        const refLbl = p.faceRef && p.faceRef.label ? p.faceRef.label : 'Keine Fläche gewählt';
        const faceInfo = h('div', { class: 'mini-row', id: 'op-split-faceinfo' }, h('span', { class: 'grow' }, 'Schnittfläche'), h('b', { class: 'mono' }, refLbl));
        f.append(sel('keep', 'Behalten', [['both', 'Beide Hälften'], ['positive', 'Seite A'], ['negative', 'Seite B']]), num('gap', 'Spalt', 'mm', { min: 0 }));
        sec.append(f, faceInfo);
        const pb = h('button', { type: 'button', class: 'btn', id: 'op-split-face' });
        pb.innerHTML = icon('cursor') + (p.faceRef ? 'Andere Fläche wählen' : 'Fläche wählen');
        pb.onclick = () => pickSplitToolFace(it.id);
        sec.append(h('div', { class: 'btn-row', 'data-help': 'splitAdvanced' }, pb));
        hint = 'Teilt den Körper an einer ebenen oder gekrümmten Fläche eines anderen Körpers oder einer Bezugsebene.';
        sec.append(h('div', { class: 'hint-box', html: hint }));
        const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen';
        ub.onclick = () => Actions.ungroup(it.id);
        sec.append(h('div', { class: 'btn-row' }, ub));
        return;
      }
      if (pl === 'SKETCH') {
        f.append(sel('keep', 'Behalten', [['both', 'Beide Hälften'], ['positive', 'Seite A'], ['negative', 'Seite B']]), num('gap', 'Spalt', 'mm', { min: 0 }));
        sec.append(f);
        const sb = h('button', { type: 'button', class: 'btn', id: 'op-split-sketch' });
        sb.innerHTML = icon('sketch') + (p.sketch ? 'Schnitt-Skizze bearbeiten' : 'Schnitt-Skizze zeichnen');
        sb.onclick = () => startSplitSketch(it.id);
        sec.append(h('div', { class: 'btn-row', 'data-help': 'splitAdvanced' }, sb));
        hint = 'Zieht die gezeichnete Kurve (Linie, Bogen, Spline oder Umriss) als Schnittfläche durch den Körper.';
        sec.append(h('div', { class: 'hint-box', html: hint }));
        const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen';
        ub.onclick = () => Actions.ungroup(it.id);
        sec.append(h('div', { class: 'btn-row' }, ub));
        return;
      }
      const sides = { XY: ['Oben', 'Unten'], XZ: ['Hinten', 'Vorne'], YZ: ['Rechts', 'Links'] }[pl] || ['Seite A', 'Seite B'];
      f.append(num('off', 'Lage der Ebene'), sel('keep', 'Behalten', [['both', 'Beide Hälften'], ['positive', sides[0]], ['negative', sides[1]]]), num('gap', 'Spalt'));
      hint = 'Mit „Spalt“ rücken die Hälften auseinander – praktisch zum Drucken in zwei Teilen.';
      sec.append(f);
      const fb = h('button', { type: 'button', class: 'btn small', id: 'op-split-face' }); fb.innerHTML = icon('cursor') + 'An Fläche teilen';
      fb.onclick = () => pickSplitToolFace(it.id);
      const sb = h('button', { type: 'button', class: 'btn small', id: 'op-split-sketch' }); sb.innerHTML = icon('sketch') + 'Mit Skizze teilen';
      sb.onclick = () => startSplitSketch(it.id);
      sec.append(h('div', { class: 'btn-row pro', id: 'op-split-pro-row', 'data-help': 'splitAdvanced' }, fb, sb));
      sec.append(h('div', { class: 'hint-box', html: hint }));
      const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + 'Auflösen';
      ub.onclick = () => Actions.ungroup(it.id);
      sec.append(h('div', { class: 'btn-row' }, ub));
      return;
    } else if (p.op === 'intersect') hint = 'Übrig bleibt nur, was in allen Körpern dieser Gruppe zugleich liegt.';
    sec.append(f);
    renderPatternGrowthUI(it, sec, setP);
    renderSkipUI(it, sec);
    if (hint) sec.append(h('div', { class: 'hint-box', html: hint }));
    const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + (p.op === 'pattern' ? 'Auflösen (nur Original behalten)' : 'Auflösen');
    ub.onclick = () => Actions.ungroup(it.id);
    sec.append(h('div', { class: 'btn-row' }, ub));
  }
  // Text für Verlauf und Statuszeile
  function sizeText(it, V) {
    const p = Model.resolveP(it.p || {}, V || {});
    const inst = p.op === 'pattern' ? Model.patternInstances(it, V || {}) : null;
    const total = inst ? inst.length : 0, active = inst ? inst.filter((x) => !x.skipped).length : 0;
    const hasSkip = !!(inst && active < total);
    if (p.op === 'pattern' && p.pt === 'rect') {
      const base = `${Math.max(1, Math.round(p.nx || 1))} × ${Math.max(1, Math.round(p.ny || 1))}`;
      return hasSkip ? `${active}/${total} (${base})` : base;
    }
    if (p.op === 'pattern' && p.pt === 'circ') {
      const base = `${Math.max(1, Math.round(p.n || 1))}× ${fmtAngleU(p.ang ?? 360)}`;
      return hasSkip ? `${active}/${total}× ${fmtAngleU(p.ang ?? 360)}` : base;
    }
    if (p.op === 'pattern' && p.pt === 'path') {
      return total ? (hasSkip ? `${active}/${total}× entlang Kurve` : `${total}× entlang Kurve`) : 'Kurve fehlt';
    }
    if (p.op === 'pattern' && p.pt === 'points') {
      return total ? (hasSkip ? `${active}/${total}× an Punkten` : `${total}× an Punkten`) : 'Punkte fehlen';
    }
    if (p.op === 'pattern' && p.pt === 'table') {
      return total ? (hasSkip ? `${active}/${total}× aus Tabelle` : `${total}× aus Tabelle`) : 'Tabelle leer';
    }
    if (p.op === 'pattern' && p.pt === 'mirror') return 'gespiegelt';
    if (p.op === 'split') return { both: 'beide Hälften', positive: 'eine Hälfte', negative: 'eine Hälfte' }[p.keep] || '';
    if (p.op === 'intersect') return 'Schnittmenge';
    return null;
  }
  // ---------- Kosmetisches Gewinde (KP-20) ----------
  function guessThreadSize(r, kind = 'ext') {
    const d = 2 * (Number(r) || 3);
    let best = THREAD_SPECS[0], bd = Infinity;
    for (const s of THREAD_SPECS) {
      const diff = kind === 'int' ? Math.min(Math.abs(s.core - d), Math.abs(s.d - d) + 0.05) : Math.abs(s.d - d);
      if (diff < bd) { bd = diff; best = s; }
    }
    return best.size;
  }
  function threadOnFace(itemId, faceIdx) {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item.threads || !f.item.threads.length) return null;
    return f.item.threads.find((th) => Viewer.threadFaceIndex(itemId, th) === faceIdx) || null;
  }
  function markThread(face, opts = {}) {
    if (!face || !face.id) return null;
    const found = Model.find(App.doc, face.id);
    if (!found || found.item.role === 'hole') { UI.toast('Klick auf die runde Fläche eines Körpers.', { icon: 'info' }); return null; }
    const g = Viewer.cylinderFaceInfo(face.id, face.idx);
    if (!g) { UI.toast('Bitte wähle eine runde Zylinderfläche.', { icon: 'info' }); return null; }
    const kind = opts.kind === 'int' || opts.kind === 'ext' ? opts.kind : g.kind;
    const size = opts.size && THREAD_MAP[opts.size] ? opts.size : guessThreadSize(g.r, kind);
    const spec = THREAD_MAP[size] || { d: 6, pitch: 1 };
    const rawP = Number(opts.pitch);
    const pitch = isFinite(rawP) && rawP >= 0.25 ? round(clamp(rawP, 0.25, spec.d * 0.45), 3) : spec.pitch;
    const lenRaw = opts.length != null ? Number(opts.length) : round(g.faceLen, 2);
    const length = round(clamp(lenRaw > 0 ? lenRaw : g.faceLen, 0.5, g.faceLen), 3);
    const from = opts.from === 'bottom' ? 'bottom' : 'top';
    const entry = {
      id: opts.id || uid('th'),
      size,
      length,
      ...(Math.abs(pitch - spec.pitch) > 1e-4 ? { pitch } : {}),
      kind,
      from,
      c: g.c.map((v) => round(v, 4)),
      axis: [...g.o.map((v) => round(v, 4)), ...g.d.map((v) => round(v, 6))],
      r: round(g.r, 4),
      t0: round(g.t0, 4),
      t1: round(g.t1, 4),
    };
    App.change(`Gewinde markiert (${size} × ${fmt(length, 1)})`, (doc) => {
      const T = Model.find(doc, face.id).item;
      const list = (T.threads || []).filter((x) => x.id !== entry.id && Viewer.threadFaceIndex(face.id, x) !== face.idx);
      list.push(entry);
      T.threads = list;
    });
    UI.toast(`Gewinde ${size} × ${fmt(length, 1)} mm markiert (nur Anzeige – rechnet sofort).`, { icon: 'check' });
    return entry.id;
  }
  function updateThread(itemId, threadId, patch) {
    App.change('Gewinde geändert', (doc) => {
      const f = Model.find(doc, itemId); if (!f || !f.item.threads) return false;
      const th = f.item.threads.find((x) => x.id === threadId); if (!th) return false;
      if (patch.size && THREAD_MAP[patch.size]) {
        th.size = patch.size;
        if (patch.pitch == null) delete th.pitch;
      }
      if (patch.kind === 'int' || patch.kind === 'ext') th.kind = patch.kind;
      if (patch.from === 'top' || patch.from === 'bottom') th.from = patch.from;
      if (patch.pitch != null) {
        const spec = THREAD_MAP[th.size] || { d: 6, pitch: 1 };
        const n = Number(patch.pitch);
        if (isFinite(n) && n > 0) {
          const clamped = round(clamp(n, 0.25, spec.d * 0.45), 3);
          if (Math.abs(clamped - spec.pitch) > 1e-4) th.pitch = clamped;
          else delete th.pitch;
        }
      }
      if (patch.length != null) {
        const g = Viewer.threadFaceIndex(itemId, th) >= 0 ? Viewer.cylinderFaceInfo(itemId, Viewer.threadFaceIndex(itemId, th)) : null;
        const maxL = g ? g.faceLen : Math.max(0.5, Math.abs((th.t1 ?? 10) - (th.t0 ?? 0)));
        const n = Number(patch.length);
        if (n > 0) th.length = round(clamp(n, 0.5, maxL), 3);
      }
    });
  }
  function removeThread(itemId, threadId) {
    App.change('Gewinde-Markierung entfernt', (doc) => {
      const f = Model.find(doc, itemId); if (!f || !f.item.threads) return false;
      const list = f.item.threads.filter((x) => x.id !== threadId);
      if (list.length) f.item.threads = list; else delete f.item.threads;
    });
  }
  function poseFromOriginDir(o, zDir) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), zDir.clone().normalize());
    return new THREE.Matrix4().compose(o, q, new THREE.Vector3(1, 1, 1));
  }
  function insertAfterTarget(doc, top, newItems) {
    let idx = doc.items.indexOf(top);
    if (idx < 0) idx = doc.items.length - 1;
    for (let i = idx + 1; i < doc.items.length; i++) {
      const x = doc.items[i];
      if ((x.op && x.op.target === top.id) || (x.p && x.p.target === top.id)) idx = i;
    }
    const pos = doc.rollback != null ? Math.min(idx + 1, clamp(doc.rollback, 0, doc.items.length)) : idx + 1;
    if (doc.rollback != null) doc.rollback += newItems.length;
    doc.items.splice(pos, 0, ...newItems);
  }
  // Echtes 3D-Gewinde direkt auf einer Zylinderfläche (KP-19) oder aus Markierung (KP-20)
  function applyRealThread(face, opts = {}) {
    if (!face || !face.id) return null;
    const itemId = face.id;
    const f = Model.find(App.doc, itemId);
    const it = f && f.item;
    if (!it || it.role === 'hole') { UI.toast('Klick auf die runde Fläche eines Körpers.', { icon: 'info' }); return null; }
    const g = (face.idx != null ? Viewer.cylinderFaceInfo(itemId, face.idx) : null) || opts.geom || null;
    if (!g) { UI.toast('Die Zylinderfläche für das Gewinde wurde nicht gefunden.', { kind: 'bad' }); return null; }
    const kind = opts.kind === 'int' || opts.kind === 'ext' ? opts.kind : g.kind;
    const size = opts.size && THREAD_MAP[opts.size] ? opts.size : guessThreadSize(g.r, kind);
    const spec = THREAD_MAP[size] || { d: 6, pitch: 1 };
    const rawP = Number(opts.pitch);
    const pitch = isFinite(rawP) && rawP >= 0.25 ? round(clamp(rawP, 0.25, spec.d * 0.45), 3) : spec.pitch;
    const customPitch = Math.abs(pitch - spec.pitch) > 1e-4;
    const lenRaw = opts.length != null ? Number(opts.length) : g.faceLen;
    const L = round(clamp(lenRaw > 0 ? lenRaw : g.faceLen, 0.5, g.faceLen), 3);
    const fromBottom = opts.from === 'bottom';
    const clear = isFinite(Number(opts.clear)) && Number(opts.clear) >= 0 ? round(Number(opts.clear), 3) : 0.3;
    const s0 = fromBottom ? g.t0 : g.t1 - L;
    const s1 = fromBottom ? g.t0 + L : g.t1;
    const dL = new THREE.Vector3(...g.d).normalize();
    const W = Model.worldMatrix(App.doc, itemId);
    const pStartW = new THREE.Vector3(...g.o).addScaledVector(dL, s0).applyMatrix4(W);
    const pEndW = new THREE.Vector3(...g.o).addScaledVector(dL, s1).applyMatrix4(W);
    const dW = pEndW.clone().sub(pStartW).normalize();
    const topCur = Model.topOf(App.doc, itemId);
    let selId = topCur ? topCur.id : itemId;
    const pitchOpts = customPitch ? { pitch } : {};
    App.change(opts.fromCosmetic ? `Gewinde echt gemacht (${size} × ${fmt(L, 1)})` : `Gewinde ${size} × ${fmt(L, 1)}`, (doc) => {
      const T = Model.find(doc, itemId).item;
      const top = Model.topOf(doc, itemId);
      if (T.threads && T.threads.length) {
        const rest = T.threads.filter((x) => {
          if (opts.removeThreadId && x.id === opts.removeThreadId) return false;
          if (face.idx != null && Viewer.threadFaceIndex(itemId, x) === face.idx) return false;
          return true;
        });
        if (rest.length) T.threads = rest; else delete T.threads;
      }
      if (kind === 'int') {
        const entryPt = fromBottom ? pStartW : pEndW;
        const outDir = fromBottom ? dW.clone().negate() : dW;
        const hole = Model.newItem('part', { lib: 'threadHole', size, length: L, clear, ...pitchOpts }, { name: `Innengewinde ${size} × ${fmt(L, 1)}`, color: top.color, role: 'solid' });
        Model.setFromMatrix(hole, poseFromOriginDir(entryPt, outDir));
        hole.op = { type: 'cut', target: top.id };
        insertAfterTarget(doc, top, [hole]);
        selId = top.id;
        return;
      }
      const hasDependents = doc.items.some((x) => (x.op && x.op.target === T.id) || (x.p && x.p.target === T.id));
      const isPlainCyl = T === top && T.kind === 'cylinder' && !(T.finishes && T.finishes.length) && !T.op && !hasDependents;
      if (isPlainCyl && L >= g.faceLen - 0.05) {
        T.kind = 'part';
        T.p = { lib: 'threadRod', size, length: L, ...pitchOpts };
        Model.setFromMatrix(T, poseFromOriginDir(pStartW, dW));
        selId = T.id;
        return;
      }
      if (isPlainCyl) {
        const rem = round(Math.max(0.5, g.faceLen - L), 3);
        T.p.h = rem;
        if (fromBottom) Model.setFromMatrix(T, new THREE.Matrix4().makeTranslation(dW.x * L, dW.y * L, dW.z * L).multiply(Model.localMatrix(T)));
        const rodOrigin = fromBottom ? pStartW : pStartW.clone().addScaledVector(dW, -0.05);
        const rod = Model.newItem('part', { lib: 'threadRod', size, length: round(L + 0.05, 3), ...pitchOpts }, { name: `Gewinde ${size} × ${fmt(L, 1)}`, color: T.color, role: 'solid' });
        Model.setFromMatrix(rod, poseFromOriginDir(rodOrigin, dW));
        rod.op = { type: 'join', target: T.id };
        insertAfterTarget(doc, T, [rod]);
        selId = T.id;
        return;
      }
      // Beliebiger Körper: erst Überstand glatt abtragen, dann echtes Außengewinde vereinigen
      const cutD = round(Math.max(2 * g.r, spec.d) + 0.2, 3);
      const cutOrigin = fromBottom ? pStartW.clone().addScaledVector(dW, -0.05) : pStartW;
      const cut = Model.newItem('cylinder', { d: cutD, h: round(L + 0.05, 3) }, { name: `Gewinde-Freischnitt ${size}`, color: top.color, role: 'solid' });
      Model.setFromMatrix(cut, poseFromOriginDir(cutOrigin, dW));
      cut.op = { type: 'cut', target: top.id };
      const rodOrigin = fromBottom ? pStartW : pStartW.clone().addScaledVector(dW, -0.05);
      const rod = Model.newItem('part', { lib: 'threadRod', size, length: round(L + 0.05, 3), ...pitchOpts }, { name: `Gewinde ${size} × ${fmt(L, 1)}`, color: top.color, role: 'solid' });
      Model.setFromMatrix(rod, poseFromOriginDir(rodOrigin, dW));
      rod.op = { type: 'join', target: top.id };
      insertAfterTarget(doc, top, [cut, rod]);
      selId = top.id;
    });
    App.select([selId]);
    UI.toast(opts.fromCosmetic
      ? `Echtes Gewinde ${size} × ${fmt(L, 1)} mm erzeugt. Mit Rückgängig kommst du wieder zur Markierung.`
      : `Echtes ${kind === 'int' ? 'Innengewinde' : 'Außengewinde'} ${size} × ${fmt(L, 1)} mm erzeugt.`, { icon: 'check' });
    return selId;
  }
  function makeThreadReal(itemId, threadId) {
    const f = Model.find(App.doc, itemId);
    const it = f && f.item;
    const th = it && (it.threads || []).find((x) => x.id === threadId);
    if (!it || !th) return null;
    const fi = Viewer.threadFaceIndex(itemId, th);
    const geom = Array.isArray(th.axis) && th.axis.length >= 6 ? {
      o: th.axis.slice(0, 3), d: th.axis.slice(3, 6), r: th.r || 3, c: th.c || [0, 0, 0],
      t0: th.t0 ?? 0, t1: th.t1 ?? 10, faceLen: Math.max(0.1, (th.t1 ?? 10) - (th.t0 ?? 0)), kind: th.kind || 'ext',
    } : null;
    return applyRealThread({ id: itemId, idx: fi >= 0 ? fi : null }, {
      size: th.size, length: th.length, pitch: th.pitch, from: th.from, kind: th.kind,
      removeThreadId: threadId, fromCosmetic: true, geom,
    });
  }
  function threadPop(face, anchor, opts = {}) {
    if (!face || !face.id) return;
    const g = Viewer.cylinderFaceInfo(face.id, face.idx);
    if (!g) { UI.toast('Bitte wähle eine runde Zylinderfläche.', { icon: 'info' }); return; }
    const existing = threadOnFace(face.id, face.idx);
    let mode = opts.mode === 'real' ? 'real' : opts.mode === 'cosmetic' ? 'cosmetic' : opts.mode === 'auto' ? (existing ? 'cosmetic' : 'real') : 'cosmetic';
    let size = existing ? existing.size : guessThreadSize(g.r, g.kind);
    let spec = THREAD_MAP[size] || { d: 6, pitch: 1 };
    let pitch = existing && existing.pitch > 0 ? existing.pitch : spec.pitch;
    let len = existing ? existing.length : round(g.faceLen, 2);
    let from = existing ? (existing.from || 'top') : 'top';
    let clear = 0.3;
    const V = Model.vars(App.doc).v;
    const box = h('div', { style: { display: 'grid', gap: '10px', minWidth: '240px' }, 'data-help': 'threadFace' });
    box.append(h('div', { class: 'section-h', id: 'ct-kind' }, (g.kind === 'int' ? 'Innengewinde' : 'Außengewinde') + ` · Ø ${Units.fmtLenU(2 * g.r, 2)}`));
    const fields = h('div', { class: 'fields' });
    const modeRow = UI.selectField({ id: 'ct-mode', label: 'Ausführung', value: mode, options: [['real', 'Echt (3D-Gewinde)'], ['cosmetic', 'Kosmetisch (nur Markierung)']], onChange: (v) => { mode = v; syncMode(); } });
    fields.append(modeRow);
    fields.append(UI.selectField({ id: 'ct-size', label: 'M-Größe', value: size, options: THREAD_SPECS.map((s) => [s.size, `${s.size} (P ${fmtFixed(s.pitch, 2)})`]), onChange: (v) => {
      size = v;
      const sp = THREAD_MAP[v];
      if (sp) {
        pitch = sp.pitch;
        const pInp = $('#ct-pitch');
        if (pInp) pInp.value = Units.fmtInput(sp.pitch);
      }
    } }));
    fields.append(UI.numField({ id: 'ct-pitch', label: 'Steigung', value: pitch, min: 0.25, step: 0.05, unit: 'mm', expr: false, onCommit: (v) => { if (v > 0) pitch = v; } }));
    fields.append(UI.numField({ id: 'ct-len', label: 'Länge', value: len, min: 0.5, unit: 'mm', expr: false, onCommit: (v) => { len = v; } }));
    const clearWrap = h('div', { id: 'ct-clear-wrap' }, UI.numField({ id: 'ct-clear', label: 'Spiel (3D-Druck)', value: clear, min: 0, step: 0.05, unit: 'mm', expr: false, onCommit: (v) => { if (v >= 0) clear = v; } }));
    fields.append(clearWrap);
    box.append(fields);
    box.append(UI.selectField({ id: 'ct-from', label: 'Beginnt am', value: from, options: [['top', 'Ende 1 (oben)'], ['bottom', 'Ende 2 (unten)']], onChange: (v) => { from = v; } }));
    const row = h('div', { class: 'btn-row' });
    const applyB = h('button', { type: 'button', class: 'btn primary', id: 'ct-apply' }, '');
    const hintEl = h('div', { class: 'hint-box', id: 'ct-hint' }, '');
    let realB = null, delB = null;
    if (existing) {
      realB = h('button', { type: 'button', class: 'btn', id: 'ct-real' }, 'Echt machen');
      realB.onclick = () => { UI.closePop(); makeThreadReal(face.id, existing.id); };
      delB = h('button', { type: 'button', class: 'btn ghost danger', id: 'ct-del' }, 'Entfernen');
      delB.onclick = () => { UI.closePop(); removeThread(face.id, existing.id); };
    }
    const syncMode = () => {
      const isReal = mode === 'real';
      applyB.textContent = isReal ? 'Gewinde erzeugen' : (existing ? 'Ändern' : 'Gewinde markieren');
      clearWrap.style.display = isReal && g.kind === 'int' ? '' : 'none';
      if (realB) realB.style.display = isReal ? 'none' : '';
      hintEl.textContent = isReal
        ? 'Schneidet bzw. formt echte Gewindegänge in den 3D-Körper (z. B. für 3D-Druck).'
        : 'Nur Markierung – rechnet sofort und steht in Stückliste und Zeichnung.';
    };
    applyB.onclick = () => {
      const readLen = (sel, def) => {
        const inp = $(sel);
        if (!inp) return def;
        const parsed = Units.parseLen(inp.value, V, { expr: false });
        return parsed.ok && isFinite(parsed.value) ? parsed.value : def;
      };
      const vLen = readLen('#ct-len', len);
      if (vLen > 0) len = vLen;
      const vPitch = readLen('#ct-pitch', pitch);
      if (vPitch > 0) pitch = vPitch;
      const vClear = readLen('#ct-clear', clear);
      if (vClear >= 0) clear = vClear;
      const selMode = $('#ct-mode'); if (selMode) mode = selMode.value;
      const selSize = $('#ct-size'); if (selSize) size = selSize.value;
      const selFrom = $('#ct-from'); if (selFrom) from = selFrom.value;
      UI.closePop();
      if (mode === 'real') applyRealThread(face, { size, length: len, pitch, from, kind: g.kind, clear });
      else markThread(face, { id: existing ? existing.id : undefined, size, length: len, pitch, from, kind: g.kind });
    };
    row.append(applyB);
    if (existing) row.append(realB, delB);
    box.append(row, hintEl);
    syncMode();
    UI.pop(anchor || $('#center'), box);
  }
  // ---------- Verschieben / Drehen / Kopieren als Schritt (KP-08) ----------
  const isModifierStep = (x) => (x.kind === 'transform' && !(x.p && x.p.copy)) || x.kind === 'scale' || x.kind === 'deform' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new')) || x.kind === 'directFace' || x.kind === 'rib' || x.kind === 'vent' || x.kind === 'fins' || x.kind === 'fillPattern' || x.kind === 'mountPattern' || x.kind === 'portCutout' || x.kind === 'magnetPocket' || x.kind === 'web' || x.kind === 'wrap' || x.kind === 'emboss' || x.kind === 'splitFace' || x.kind === 'dome' || x.kind === 'deleteFace' || x.kind === 'replaceFace' || x.kind === 'moveEdge' || x.kind === 'mirrorStep' || x.kind === 'deleteBody' || x.kind === 'sketch3d' || x.kind === 'boss' || x.kind === 'lipGroove' || x.kind === 'undercut' || x.kind === 'circlipGroove' || x.kind === 'keyway' || x.kind === 'splineProfile' || x.kind === 'knurl' || x.kind === 'gripPattern' || x.kind === 'stackHole' || x.kind === 'asmCut';
  function insertAtMarker(doc, step) {
    const at = doc.rollback != null ? clamp(doc.rollback, 0, doc.items.length) : doc.items.length;
    doc.items.splice(at, 0, step);
    if (doc.rollback != null) doc.rollback = at + 1;
  }
  function resolveTopTarget(targetOrIds) {
    const raw = Array.isArray(targetOrIds) ? targetOrIds[0] : (targetOrIds || App.sel[0]);
    const top = raw ? Model.topOf(App.doc, raw) : null;
    const tid = top ? (App.mergedInto(top.id) || top.id) : null;
    return tid ? App.doc.items.find((x) => x.id === tid) || null : null;
  }
  function activeTargetsBefore(it) {
    const idx = App.doc.items.indexOf(it);
    const prev = idx >= 0 ? App.doc.items.slice(0, idx) : [];
    return prev.filter((x) => !x.suppressed && !(x.op && x.op.target) && !isModifierStep(x));
  }
  function transform(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Verschieben/Drehen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = resolveTopTarget(targetOrIds);
    if (!tgt) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    if (App.doc.noHistory && !opts.copy) {
      const dx = Number(opts.dx) || 0, dy = Number(opts.dy) || 0, dz = Number(opts.dz) || 0;
      const rx = Number(opts.rx) || 0, ry = Number(opts.ry) || 0, rz = Number(opts.rz) || 0;
      if (dx || dy || dz || rx || ry || rz) {
        App.change('Verschoben', (doc) => {
          const f = Model.find(doc, tgt.id); if (!f) return false;
          const tn = Model.tNumeric(f.item);
          f.item.t.x = round(tn.x + dx, 4); f.item.t.y = round(tn.y + dy, 4); f.item.t.z = round(tn.z + dz, 4);
          f.item.t.rx = round(tn.rx + rx, 4); f.item.t.ry = round(tn.ry + ry, 4); f.item.t.rz = round(tn.rz + rz, 4);
        });
      } else {
        App.select([tgt.id]);
        UI.toast(T('tl.noHistoryMoveHint'), { icon: 'info', ms: 3600 });
      }
      return tgt;
    }
    const p = {
      target: tgt.id,
      dx: opts.dx ?? 0, dy: opts.dy ?? 0, dz: opts.dz ?? 0,
      rx: opts.rx ?? 0, ry: opts.ry ?? 0, rz: opts.rz ?? 0,
      pivot: opts.pivot || 'center',
      px: opts.px ?? 0, py: opts.py ?? 0, pz: opts.pz ?? 0,
      copy: !!opts.copy,
    };
    let step;
    App.change('Verschieben/Drehen angelegt', (doc) => {
      step = Model.newItem('transform', p, { name: opts.name || 'Verschieben/Drehen', color: tgt.color, role: tgt.role, mat: tgt.mat });
      doc.items.push(step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Schritt „Verschieben/Drehen“ angelegt. Rechts stellst du Verschiebung, Drehung und „Als Kopie“ ein.', { icon: 'check' });
    }
    return step || null;
  }
  function renderTransform(it, sec, setP) {
    const p = it.p || {};
    const targets = activeTargetsBefore(it);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    if (opts.length) {
      sec.append(UI.selectField({ id: 'xf-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { const T = Model.find(doc, it.id).item; T.p.target = v; }) }));
    }
    const copyL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'xf-copy', checked: !!p.copy }), 'Als Kopie (Original bleibt an seinem Platz)');
    copyL.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Als Kopie' : 'Original versetzen', (doc) => { Model.find(doc, it.id).item.p.copy = e.target.checked; });
    sec.append(copyL);
    const ft = h('div', { class: 'fields three' });
    for (const k of ['dx', 'dy', 'dz']) ft.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '', onCommit: (v) => setP(k, v) }));
    const fr = h('div', { class: 'fields three' });
    for (const k of ['rx', 'ry', 'rz']) fr.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '°', onCommit: (v) => setP(k, v) }));
    sec.append(h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', null, 'Verschiebung (mm)'), ft), h('div', { class: 'field' }, h('label', null, 'Drehung (°)'), fr));
    const pv = p.pivot || 'center';
    sec.append(UI.selectField({ id: 'xf-pivot', label: 'Drehpunkt', value: pv, options: [['center', 'Mitte des Körpers'], ['origin', 'Ursprung (0 · 0 · 0)'], ['point', 'Eigener Punkt']], onChange: (v) => App.change('Drehpunkt geändert', (doc) => { Model.find(doc, it.id).item.p.pivot = v; }) }));
    if (pv === 'point') {
      const fp = h('div', { class: 'fields three' });
      for (const k of ['px', 'py', 'pz']) fp.append(UI.numField({ id: 'xf-' + k, value: p[k] ?? 0, axis: k[1], unit: '', onCommit: (v) => setP(k, v) }));
      sec.append(h('div', { class: 'field' }, h('label', null, 'Punkt (mm)'), fp));
    }
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'xf-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      sec.append(h('div', { class: 'btn-row' }, gb));
    }
    sec.append(h('div', { class: 'hint-box', html: p.copy ? 'Erzeugt eine versetzte oder gedrehte <b>Kopie</b>. Ändert sich der Zielkörper, wandert die Kopie mit.' : 'Versetzt den Zielkörper als Schritt im Verlauf. Unterdrückst du diesen Schritt oder rollst den Marker davor, springt der Körper zurück.' }));
  }
  // ---------- Körper skalieren (KP-07) ----------
  function scale(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Skalieren gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = resolveTopTarget(targetOrIds);
    if (!tgt) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    const uniform = opts.uniform !== undefined ? !!opts.uniform : (opts.sx == null && opts.sy == null && opts.sz == null);
    const s0 = opts.s ?? 1;
    const p = {
      target: tgt.id,
      uniform,
      s: s0,
      sx: opts.sx ?? s0, sy: opts.sy ?? s0, sz: opts.sz ?? s0,
      pivot: opts.pivot === 'origin' ? 'origin' : 'centroid',
    };
    let step;
    App.change('Skalieren angelegt', (doc) => {
      step = Model.newItem('scale', p, { name: opts.name || 'Skalieren', color: tgt.color, role: tgt.role, mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Schritt „Skalieren“ angelegt. Rechts stellst du Faktor, Achsen und Bezugspunkt ein.', { icon: 'check' });
    }
    return step || null;
  }
  function renderScale(it, sec, setP) {
    const p = it.p || {};
    const targets = activeTargetsBefore(it);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    if (opts.length) {
      sec.append(UI.selectField({ id: 'sc-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }) }));
    }
    const uni = p.uniform !== false;
    const uniL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'sc-uniform', checked: uni }), 'Gleichmäßig (alle Achsen gleich)');
    uniL.querySelector('input').onchange = (e) => App.change(e.target.checked ? 'Gleichmäßig skalieren' : 'Je Achse skalieren', (doc) => {
      const T = Model.find(doc, it.id).item;
      const u = e.target.checked;
      T.p.uniform = u;
      if (!u && (T.p.sx == null || (T.p.sx === 1 && T.p.sy === 1 && T.p.sz === 1 && T.p.s !== 1))) {
        const s0 = T.p.s ?? 1;
        T.p.sx = s0; T.p.sy = s0; T.p.sz = s0;
      }
    });
    sec.append(uniL);
    if (uni) {
      sec.append(h('div', { class: 'fields', style: { marginTop: '8px' } }, UI.numField({ id: 'sc-s', label: 'Faktor', value: p.s ?? 1, unit: '×', min: 0.01, step: 0.1, onCommit: (v) => setP('s', v) })));
    } else {
      const fa = h('div', { class: 'fields three' });
      for (const k of ['sx', 'sy', 'sz']) fa.append(UI.numField({ id: 'sc-' + k, value: p[k] ?? 1, axis: k[1], unit: '×', min: 0.01, step: 0.1, onCommit: (v) => setP(k, v) }));
      sec.append(h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', null, 'Faktor je Achse'), fa));
    }
    sec.append(UI.selectField({ id: 'sc-pivot', label: 'Bezugspunkt', value: p.pivot === 'origin' ? 'origin' : 'centroid', options: [['centroid', 'Schwerpunkt'], ['origin', 'Ursprung (0 · 0 · 0)']], onChange: (v) => App.change('Bezugspunkt geändert', (doc) => { Model.find(doc, it.id).item.p.pivot = v; }) }));
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'sc-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      sec.append(h('div', { class: 'btn-row' }, gb));
    }
    sec.append(h('div', { class: 'hint-box', html: 'Skaliert den Zielkörper um seinen <b>Schwerpunkt</b> oder den <b>Ursprung</b> – gleichmäßig oder je Achse getrennt. Im Verlauf jederzeit änderbar, unterdrückbar und rückrollbar.' }));
  }
  // ---------- Körper verformen: Biegen, Verdrehen, Verjüngen (KP-37) ----------
  function deform(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Verformen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = resolveTopTarget(targetOrIds);
    if (!tgt) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    const mode = opts.mode === 'twist' || opts.mode === 'taper' ? opts.mode : 'bend';
    let axis = opts.axis === 'x' || opts.axis === 'y' || opts.axis === 'z' ? opts.axis : null;
    if (!axis) {
      if (mode === 'bend') {
        const wb = Actions.worldBox(tgt.id);
        if (wb && !wb.isEmpty()) {
          const sx = wb.max.x - wb.min.x, sy = wb.max.y - wb.min.y, sz = wb.max.z - wb.min.z;
          axis = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';
        } else axis = 'x';
      } else {
        axis = 'z';
      }
    }
    const bendAxis = (opts.bendAxis === 'x' || opts.bendAxis === 'y' || opts.bendAxis === 'z') && opts.bendAxis !== axis
      ? opts.bendAxis
      : (axis === 'y' ? 'x' : 'y');
    const p = {
      target: tgt.id,
      mode,
      axis,
      bendAxis,
      angle: opts.angle ?? 90,
      factor: opts.factor ?? 0.5,
      anchor: opts.anchor === 'start' || opts.anchor === 'end' || opts.anchor === 'center' ? opts.anchor : null,
      flip: !!opts.flip,
    };
    let step;
    App.change('Verformen angelegt', (doc) => {
      step = Model.newItem('deform', p, { name: opts.name || T('kind.deform'), color: tgt.color, role: tgt.role, mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.deformAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function renderDeform(it, sec, setP) {
    const p = it.p || {};
    const mode = p.mode === 'twist' || p.mode === 'taper' ? p.mode : 'bend';
    const axis = p.axis === 'x' || p.axis === 'y' ? p.axis : 'z';
    const bendAxis = (p.bendAxis === 'x' || p.bendAxis === 'y' || p.bendAxis === 'z') && p.bendAxis !== axis
      ? p.bendAxis
      : (axis === 'y' ? 'x' : 'y');
    const targets = activeTargetsBefore(it);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    if (opts.length) {
      sec.append(UI.selectField({
        id: 'df-target', label: 'Zielkörper', value: p.target || '', options: opts,
        onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }),
      }));
    }
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'df-mode', label: T('panel.deform.mode'), value: mode,
      options: [['bend', T('panel.deform.bend')], ['twist', T('panel.deform.twist')], ['taper', T('panel.deform.taper')]],
      onChange: (v) => App.change('Verformungs-Art geändert', (doc) => {
        const T0 = Model.find(doc, it.id).item;
        T0.p.mode = v;
        if (v === 'bend' && (!T0.p.bendAxis || T0.p.bendAxis === T0.p.axis)) {
          T0.p.bendAxis = T0.p.axis === 'y' ? 'x' : 'y';
        }
      }),
    }));
    const axLbl = mode === 'bend' ? T('panel.deform.lenAxis') : mode === 'twist' ? T('panel.deform.twistAxis') : T('panel.deform.axis');
    fl.append(UI.selectField({
      id: 'df-axis', label: axLbl, value: axis,
      options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']],
      onChange: (v) => App.change('Achse geändert', (doc) => {
        const T0 = Model.find(doc, it.id).item;
        T0.p.axis = v;
        if (T0.p.bendAxis === v) T0.p.bendAxis = v === 'y' ? 'x' : 'y';
      }),
    }));
    if (mode === 'bend') {
      const perp = ['x', 'y', 'z'].filter((a) => a !== axis);
      const bOpts = perp.map((ba) => {
        const dirAx = ['x', 'y', 'z'].find((a) => a !== axis && a !== ba).toUpperCase();
        return [ba, `${ba.toUpperCase()}-Achse (biegt in ${dirAx})`];
      });
      fl.append(UI.selectField({
        id: 'df-bendAxis', label: T('panel.deform.bendAxis'), value: bendAxis, options: bOpts,
        onChange: (v) => App.change('Biegeachse geändert', (doc) => { Model.find(doc, it.id).item.p.bendAxis = v; }),
      }));
    }
    if (mode === 'taper') {
      fl.append(UI.numField({ id: 'df-factor', label: T('panel.deform.factor'), value: p.factor ?? 0.5, unit: '×', min: 0.02, step: 0.1, onCommit: (v) => setP('factor', v) }));
    } else {
      fl.append(UI.numField({
        id: 'df-angle',
        label: mode === 'bend' ? T('panel.deform.bendAngle') : T('panel.deform.twistAngle'),
        value: p.angle ?? 90, unit: '°', step: 5,
        onCommit: (v) => setP('angle', v),
      }));
      const defAnchor = mode === 'bend' ? 'center' : 'start';
      const anchorVal = p.anchor === 'start' || p.anchor === 'end' || p.anchor === 'center' ? p.anchor : defAnchor;
      fl.append(UI.selectField({
        id: 'df-anchor', label: T('panel.deform.anchor'), value: anchorVal,
        options: [['center', T('panel.deform.anchorCenter')], ['start', T('panel.deform.anchorStart')], ['end', T('panel.deform.anchorEnd')]],
        onChange: (v) => App.change('Haltepunkt geändert', (doc) => { Model.find(doc, it.id).item.p.anchor = v; }),
      }));
    }
    sec.append(fl);
    const flipL = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'df-flip', checked: !!p.flip }), T('panel.deform.flip'));
    flipL.querySelector('input').onchange = (e) => App.change('Richtung umgekehrt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flipL);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'df-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      sec.append(h('div', { class: 'btn-row' }, gb));
    }
    const hintKey = mode === 'taper' ? 'panel.deform.hintTaper' : mode === 'twist' ? 'panel.deform.hintTwist' : 'panel.deform.hintBend';
    sec.append(h('div', { class: 'hint-box', html: T(hintKey) }));
  }
  // ---------- Körper als Schritt löschen (KP-51) ----------
  function deleteBody(targetOrIds, opts = {}) {
    if (App.ctx) { UI.toast('Schritte zum Löschen eines Körpers gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const rawList = Array.isArray(targetOrIds) ? targetOrIds : (targetOrIds ? [targetOrIds] : App.sel);
    const tgts = [], seen = new Set();
    for (const id of rawList) {
      const t = resolveTopTarget(id);
      if (!t || seen.has(t.id) || isModifierStep(t) || (t.op && t.op.target)) continue;
      if (App.deletedBy && App.deletedBy(t.id)) continue;
      seen.add(t.id);
      tgts.push(t);
    }
    if (!tgts.length) { UI.toast('Wähle zuerst einen Körper aus.', { icon: 'info' }); return null; }
    const p = { targets: tgts.map((x) => x.id) };
    let step;
    App.change('Körper als Schritt löschen', (doc) => {
      step = Model.newItem('deleteBody', p, { name: opts.name || T('kind.deleteBody'), color: tgts[0].color, role: 'solid' });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.deleteBodyAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function renderDeleteBody(it, sec) {
    const p = it.p || {};
    const curIds = Array.isArray(p.targets) ? p.targets.slice() : (p.target ? [p.target] : []);
    const curSet = new Set(curIds);
    const cands = activeTargetsBefore(it);
    for (const cid of curIds) {
      if (!cands.some((x) => x.id === cid)) {
        const f = Model.find(App.doc, cid);
        if (f) cands.push(f.item);
      }
    }
    const listBox = h('div', { class: 'db-list', id: 'db-targets' });
    listBox.append(h('div', { class: 'section-h', style: { marginBottom: '4px' } }, T('panel.deleteBody.targetsTitle')));
    if (cands.length) {
      for (const c of cands) {
        const lbl = h('label', { class: 'check' }, h('input', { type: 'checkbox', value: c.id, checked: curSet.has(c.id) }), Model.label(c));
        lbl.querySelector('input').onchange = (e) => {
          const next = new Set(curSet);
          if (e.target.checked) next.add(c.id); else next.delete(c.id);
          App.change('Zu löschende Körper geändert', (doc) => {
            const fn = Model.find(doc, it.id); if (!fn) return false;
            fn.item.p.targets = [...next];
          });
        };
        listBox.append(lbl);
      }
    } else {
      listBox.append(h('div', { class: 'hint-box' }, 'Keine früheren Körper vorhanden.'));
    }
    sec.append(listBox);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const sb = h('button', { type: 'button', class: 'btn', id: 'db-suppress' });
    sb.innerHTML = icon(it.suppressed ? 'eye' : 'suppress') + esc(it.suppressed ? T('common.unsuppress') : T('panel.deleteBody.suppressRestore'));
    sb.onclick = () => Timeline.toggleSuppress(it.id);
    row.append(sb);
    if (curIds.length === 1 && Model.find(App.doc, curIds[0])) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'db-goto' });
      gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([curIds[0]]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.deleteBody.hint') }));
  }
  // ---------- Fläche aufdicken (KP-07) ----------
  function faceSigOf(face) {
    if (!face || !face.info || !Array.isArray(face.info.c)) return null;
    return {
      c: face.info.c.map((v) => round(v, 6)),
      n: Array.isArray(face.info.n) ? face.info.n.map((v) => round(v, 6)) : null,
      t: face.info.t || null,
      ...(face.info.tid ? { tid: face.info.tid } : {}),
    };
  }
  function thicken(face, opts = {}) {
    if (App.ctx) { UI.toast('Aufdicken als Schritt gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig) { UI.toast('Klick zuerst eine Fläche eines Körpers an.', { icon: 'info' }); return null; }
    const p = {
      target: tgt.id,
      face: sig,
      t: opts.t ?? 2,
      dir: opts.dir === 'in' || opts.dir === 'mid' ? opts.dir : 'out',
      mode: opts.mode === 'new' || opts.mode === 'cut' ? opts.mode : 'join',
    };
    let step;
    App.change('Aufdicken angelegt', (doc) => {
      step = Model.newItem('thicken', p, { name: opts.name || 'Aufdicken', color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Fläche aufgedickt. Rechts stellst du Dicke, Richtung und Modus ein.', { icon: 'check' });
    }
    return step || null;
  }
  function pickThickenFace(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          const sig = faceSigOf({ info: fi });
          App.change('Fläche für Aufdicken gewählt', (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = sig;
          });
          UI.toast('Fläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche eines Körpers.', { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche wählen:</b> Klick auf eine Fläche des Körpers. <b>Esc</b> bricht ab.');
  }
  function renderThicken(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.numField({ id: 'th-t', label: 'Dicke', value: p.t ?? 2, min: 0.1, unit: 'mm', onCommit: (v) => setP('t', v) }));
    fl.append(UI.selectField({ id: 'th-dir', label: 'Richtung', value: p.dir === 'in' || p.dir === 'mid' ? p.dir : 'out', options: [['out', 'Nach außen'], ['in', 'Nach innen'], ['mid', 'Mittig']], onChange: (v) => App.change('Aufdick-Richtung geändert', (doc) => { Model.find(doc, it.id).item.p.dir = v; }) }));
    fl.append(UI.selectField({ id: 'th-mode', label: 'Ergebnis', value: p.mode === 'new' || p.mode === 'cut' ? p.mode : 'join', options: [['join', 'Mit Körper vereinigen'], ['new', 'Eigene Platte (neuer Körper)'], ['cut', 'Vom Körper abziehen']], onChange: (v) => App.change('Aufdick-Modus geändert', (doc) => { Model.find(doc, it.id).item.p.mode = v; }) }));
    sec.append(fl);
    const row = h('div', { class: 'btn-row' });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'th-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickThickenFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'th-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    const inJoinHint = p.dir === 'in' && (p.mode || 'join') === 'join' ? ' Hinweis: „Nach innen“ mit „Vereinigen“ liegt im Körper – wähle „Eigene Platte“ oder „Vom Körper abziehen“, um es sichtbar zu machen.' : '';
    sec.append(h('div', { class: 'hint-box', html: 'Macht aus der gewählten Fläche (eben oder gebogen) eine Platte mit fester Dicke – nach außen, innen oder mittig.' + inJoinHint }));
  }
  // ---------- Direkt bearbeiten: Fläche verschieben, drehen, versetzen (DB-01, DB-02) ----------
  function directFaceHint(face, tgtId) {
    if (!face || !face.info) return null;
    const fi = face.info;
    const W = tgtId ? Model.worldMatrix(App.doc, tgtId) : new THREE.Matrix4();
    const inv = W.clone().invert();
    let pL = Array.isArray(fi.c) ? new THREE.Vector3(...fi.c) : new THREE.Vector3();
    if (Array.isArray(face.point) && face.point.length >= 3) {
      pL = new THREE.Vector3(...face.point).applyMatrix4(inv);
    }
    let nL = null;
    if (Array.isArray(fi.n) && fi.n.length >= 3) {
      nL = new THREE.Vector3(...fi.n).normalize();
    } else if (Array.isArray(face.normal) && face.normal.length >= 3) {
      nL = new THREE.Vector3(...face.normal).transformDirection(inv).normalize();
    } else if (fi.t === 'CYLINDRE' && Array.isArray(fi.axis)) {
      const o = new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]);
      const d = new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]).normalize();
      const rel = pL.clone().sub(o);
      const rad = rel.sub(d.multiplyScalar(rel.dot(d)));
      if (rad.lengthSq() > 1e-9) nL = rad.normalize();
    }
    if (!nL || nL.lengthSq() < 1e-9) nL = new THREE.Vector3(0, 0, 1);
    return {
      p: pL.toArray().map((v) => round(v, 6)),
      n: nL.toArray().map((v) => round(v, 6)),
    };
  }
  function directFace(face = null, opts = {}) {
    if (App.ctx) { UI.toast(T('toast.directFaceNoCtx'), { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig) {
      if (opts.noChange) return null;
      startDirectFace(opts);
      return null;
    }
    const isPlanar = !face.info || face.info.t === 'PLANE';
    let mode = opts.mode === 'rotate' || opts.mode === 'offset' ? opts.mode : (opts.mode === 'move' ? 'move' : (isPlanar ? 'move' : 'offset'));
    if (mode === 'rotate' && !isPlanar) {
      if (!opts.silent) UI.toast(T('toast.directFaceNoRotCurved'), { icon: 'info' });
      mode = 'offset';
    }
    const hint = !isPlanar ? directFaceHint(face, tgt.id) : null;
    const p = {
      target: tgt.id,
      face: sig,
      mode,
      axis: opts.axis === 'x' || opts.axis === 'y' || opts.axis === 'z' || opts.axis === 'free' ? opts.axis : 'normal',
      dist: opts.dist ?? (mode === 'move' ? 5 : 0),
      dx: opts.dx ?? 0,
      dy: opts.dy ?? 0,
      dz: opts.dz ?? 0,
      offset: opts.offset ?? (mode === 'offset' ? 2 : 0),
      angle: opts.angle ?? (mode === 'rotate' ? 15 : 0),
      rotAxis: opts.rotAxis === 'v' || opts.rotAxis === 'pick' ? opts.rotAxis : 'u',
      ...(Array.isArray(opts.rotDir) ? { rotDir: opts.rotDir.slice(0, 3) } : {}),
      pivot: opts.pivot === 'point' ? 'point' : 'center',
      ...(Array.isArray(opts.rotOrigin) ? { rotOrigin: opts.rotOrigin.slice(0, 3) } : {}),
      ...(hint ? { handleHint: hint } : {}),
    };
    const buildStep = (doc) => {
      const s = Model.newItem('directFace', p, { name: opts.name || T('kind.directFace'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, s);
      return s;
    };
    let step = null;
    if (opts.noChange) {
      step = buildStep(App.doc);
    } else {
      const undoLabel = mode === 'rotate' ? T('undo.directFaceRotate') : mode === 'offset' ? T('undo.directFaceOffset') : T('undo.directFaceMove');
      App.change(undoLabel, (doc) => { step = buildStep(doc); });
    }
    if (step && !opts.noSelect) App.select([step.id]);
    if (step && !opts.silent) {
      const msgKey = mode === 'rotate' ? 'toast.directFaceRotAdded' : mode === 'offset' ? 'toast.directFaceOffAdded' : 'toast.directFaceMoveAdded';
      UI.toast(T(msgKey), { icon: 'check' });
    }
    return step;
  }
  function startDirectFace(opts = {}) {
    if (App.ctx) { UI.toast(T('toast.directFaceNoCtx'), { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast(T('toast.directFaceNeedBody'), { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f) { directFace(f, opts); return true; }
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          directFace({
            id: hit.id,
            idx: hit.faceIdx,
            info: fi,
            point: hit.point ? hit.point.toArray() : null,
            normal: hit.normal ? hit.normal.toArray() : null,
          }, opts);
          return;
        }
      }
      UI.toast(T('toast.directFacePickPrompt'), { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const tgt = hit ? resolveTopTarget(hit.id) : null;
      const ok = !!(hit && hit.faceIdx >= 0 && tgt && tgt.role !== 'hole');
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche wählen:</b> Klick auf eine Fläche eines Körpers. <b>Esc</b> bricht ab.');
    return true;
  }
  function pickDirectFace(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          const fObj = { id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null, normal: hit.normal ? hit.normal.toArray() : null };
          const sig = faceSigOf(fObj);
          const isPlanar = fi.t === 'PLANE';
          const hint = !isPlanar ? directFaceHint(fObj, tgt.id) : null;
          App.change(T('undo.directFacePick'), (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = sig;
            if (!isPlanar && f.item.p.mode === 'rotate') f.item.p.mode = 'offset';
            if (hint) f.item.p.handleHint = hint; else delete f.item.p.handleHint;
          });
          UI.toast('Fläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast(T('toast.directFacePickPrompt'), { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche wählen:</b> Klick auf eine Fläche des Körpers. <b>Esc</b> bricht ab.');
  }
  function pickDirectFaceRotAxis(stepId) {
    pickAxisThen((A) => {
      const f = Model.find(App.doc, stepId);
      if (!f || !f.item || !f.item.p) return;
      const tid = f.item.p.target;
      const W = tid ? Model.worldMatrix(App.doc, tid) : new THREE.Matrix4();
      const inv = W.clone().invert();
      const oL = A.o.clone().applyMatrix4(inv).toArray().map((v) => round(v, 6));
      const dL = A.d.clone().transformDirection(inv).normalize().toArray().map((v) => round(v, 6));
      App.change(T('undo.directFaceAxis'), (doc) => {
        const fn = Model.find(doc, stepId); if (!fn) return false;
        fn.item.p.mode = 'rotate';
        fn.item.p.rotAxis = 'pick';
        fn.item.p.rotDir = dL;
        fn.item.p.pivot = 'point';
        fn.item.p.rotOrigin = oL;
      });
      App.select([stepId]);
      UI.toast('Drehachse gesetzt: ' + A.what + '.', { icon: 'check' });
    }, '<b>Drehachse wählen:</b> Klick auf eine gerade Kante oder Bezugsachse als Kippachse der Fläche. <b>Esc</b> bricht ab.');
  }
  function directFaceFrame(itOrId) {
    const it = typeof itOrId === 'string' ? (Model.find(App.doc, itOrId) || {}).item : itOrId;
    if (!it || it.kind !== 'directFace' || !it.p || !it.p.face) return null;
    const p = it.p;
    const sig = p.face;
    if (!Array.isArray(sig.c)) return null;
    const tgtId = p.target;
    const tgtFound = tgtId ? Model.find(App.doc, tgtId) : null;
    if (!tgtFound) return null;
    const W = Model.worldMatrix(App.doc, tgtId);
    const V = Model.vars(App.doc).v;
    const mode = p.mode === 'rotate' || p.mode === 'offset' ? p.mode : 'move';
    const axis = p.axis === 'x' || p.axis === 'y' || p.axis === 'z' || p.axis === 'free' ? p.axis : 'normal';
    const isPlanar = !sig.t || sig.t === 'PLANE';
    const c0 = new THREE.Vector3(...(p.handleHint && Array.isArray(p.handleHint.p) ? p.handleHint.p : sig.c));
    const n0 = new THREE.Vector3(...(Array.isArray(sig.n) ? sig.n : (p.handleHint && Array.isArray(p.handleHint.n) ? p.handleHint.n : [0, 0, 1]))).normalize();
    const dist = Model.num(p.dist, V, 0);
    const dx = Model.num(p.dx, V, 0), dy = Model.num(p.dy, V, 0), dz = Model.num(p.dz, V, 0);
    const offset = Model.num(p.offset, V, 0);
    const angle = Model.num(p.angle, V, 0);
    let shiftL = new THREE.Vector3();
    if (mode === 'offset') shiftL = n0.clone().multiplyScalar(offset);
    else if (mode === 'move') {
      if (axis === 'free') shiftL.set(dx, dy, dz);
      else if (axis === 'x') shiftL.set(dist, 0, 0);
      else if (axis === 'y') shiftL.set(0, dist, 0);
      else if (axis === 'z') shiftL.set(0, 0, dist);
      else shiftL = n0.clone().multiplyScalar(dist);
    }
    const origin = c0.clone().add(shiftL).applyMatrix4(W);
    const normal = n0.clone().transformDirection(W).normalize();
    let moveDir = normal.clone();
    if (mode === 'move' && isPlanar) {
      if (axis === 'x') moveDir = new THREE.Vector3(1, 0, 0).transformDirection(W).normalize();
      else if (axis === 'y') moveDir = new THREE.Vector3(0, 1, 0).transformDirection(W).normalize();
      else if (axis === 'z') moveDir = new THREE.Vector3(0, 0, 1).transformDirection(W).normalize();
    }
    const ref = Math.abs(n0.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const U = new THREE.Vector3().crossVectors(ref, n0).normalize();
    const Vb = new THREE.Vector3().crossVectors(n0, U).normalize();
    let rotAxL = U.clone();
    if (p.rotAxis === 'v') rotAxL = Vb.clone();
    else if (p.rotAxis === 'pick' && Array.isArray(p.rotDir) && p.rotDir.length >= 3) {
      const dRaw = new THREE.Vector3(...p.rotDir);
      const dProj = dRaw.clone().addScaledVector(n0, -dRaw.dot(n0));
      if (dProj.lengthSq() > 1e-9) rotAxL = dProj.normalize();
    }
    let rotPivL = c0.clone();
    if ((p.rotAxis === 'pick' || p.pivot === 'point') && Array.isArray(p.rotOrigin) && p.rotOrigin.length >= 3) {
      const oRaw = new THREE.Vector3(...p.rotOrigin);
      rotPivL = oRaw.clone().addScaledVector(n0, -oRaw.clone().sub(c0).dot(n0));
    }
    const rotAxisDir = rotAxL.clone().transformDirection(W).normalize();
    const rotPivot = rotPivL.clone().applyMatrix4(W);
    const u0 = normal.clone();
    const w0 = new THREE.Vector3().crossVectors(rotAxisDir, u0).normalize();
    const wb = Actions.worldBox(tgtId);
    const sz = wb && !wb.isEmpty() ? wb.getSize(new THREE.Vector3()).length() : 20;
    const radius = Math.max(10, Math.min(42, sz * 0.45));
    return {
      targetId: tgtId,
      mode,
      axis,
      isPlanar,
      origin,
      normal,
      moveDir,
      rotAxisDir,
      rotPivot,
      u0,
      w0,
      radius,
      dist,
      dx,
      dy,
      dz,
      offset,
      angle,
    };
  }
  function renderDirectFace(it, sec, setP) {
    const p = it.p || {};
    const isPlanar = !p.face || !p.face.t || p.face.t === 'PLANE';
    const mode = p.mode === 'rotate' || p.mode === 'offset' ? p.mode : 'move';
    const axis = p.axis === 'x' || p.axis === 'y' || p.axis === 'z' || p.axis === 'free' ? p.axis : 'normal';
    const fl = h('div', { class: 'fields' });
    const modeOpts = isPlanar
      ? [['move', T('panel.directFace.modeMove')], ['rotate', T('panel.directFace.modeRotate')], ['offset', T('panel.directFace.modeOffset')]]
      : [['offset', T('panel.directFace.modeOffset')], ['move', T('panel.directFace.modeMove')]];
    fl.append(UI.selectField({
      id: 'df-face-mode',
      label: T('panel.directFace.mode'),
      value: modeOpts.some((o) => o[0] === mode) ? mode : modeOpts[0][0],
      options: modeOpts,
      onChange: (v) => App.change(T('undo.directFaceMode'), (doc) => {
        const fn = Model.find(doc, it.id); if (!fn) return false;
        fn.item.p.mode = v;
      }),
    }));
    if (mode === 'move') {
      if (isPlanar) {
        fl.append(UI.selectField({
          id: 'df-face-axis',
          label: T('panel.directFace.axis'),
          value: axis,
          options: [['normal', T('panel.directFace.axisNormal')], ['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['free', T('panel.directFace.axisFree')]],
          onChange: (v) => App.change(T('undo.directFaceAxis'), (doc) => {
            const fn = Model.find(doc, it.id); if (!fn) return false;
            fn.item.p.axis = v;
          }),
        }));
      }
      if (axis === 'free' && isPlanar) {
        fl.append(
          UI.numField({ id: 'df-face-dx', label: 'X', value: p.dx ?? 0, unit: 'mm', onCommit: (v) => setP('dx', v) }),
          UI.numField({ id: 'df-face-dy', label: 'Y', value: p.dy ?? 0, unit: 'mm', onCommit: (v) => setP('dy', v) }),
          UI.numField({ id: 'df-face-dz', label: 'Z', value: p.dz ?? 0, unit: 'mm', onCommit: (v) => setP('dz', v) })
        );
      } else {
        fl.append(UI.numField({ id: 'df-face-dist', label: T('panel.directFace.dist'), value: p.dist ?? 0, unit: 'mm', onCommit: (v) => setP('dist', v) }));
      }
    } else if (mode === 'offset') {
      fl.append(UI.numField({ id: 'df-face-offset', label: T('panel.directFace.offset'), value: p.offset ?? 0, unit: 'mm', onCommit: (v) => setP('offset', v) }));
    } else {
      fl.append(UI.numField({ id: 'df-face-angle', label: T('panel.directFace.angle'), value: p.angle ?? 0, unit: '°', step: 5, onCommit: (v) => setP('angle', v) }));
      const rotOpts = [['u', T('panel.directFace.rotU')], ['v', T('panel.directFace.rotV')]];
      if (p.rotAxis === 'pick') rotOpts.push(['pick', T('panel.directFace.rotPick')]);
      fl.append(UI.selectField({
        id: 'df-face-rot-axis',
        label: T('panel.directFace.rotAxis'),
        value: p.rotAxis === 'v' || p.rotAxis === 'pick' ? p.rotAxis : 'u',
        options: rotOpts,
        onChange: (v) => App.change(T('undo.directFaceAxis'), (doc) => {
          const fn = Model.find(doc, it.id); if (!fn) return false;
          fn.item.p.rotAxis = v;
          if (v !== 'pick') fn.item.p.pivot = 'center';
        }),
      }));
    }
    sec.append(fl);
    const row = h('div', { class: 'btn-row' });
    if (mode === 'rotate') {
      const ab = h('button', { type: 'button', class: 'btn small', id: 'df-face-pick-axis' });
      ab.innerHTML = icon('axes') + esc(T('panel.directFace.pickAxisBtn'));
      ab.onclick = () => pickDirectFaceRotAxis(it.id);
      row.append(ab);
    }
    const pb = h('button', { type: 'button', class: 'btn small', id: 'df-face-pick' });
    pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickDirectFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'df-face-goto' });
      gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T(mode === 'rotate' ? 'panel.directFace.hintRotate' : mode === 'offset' ? 'panel.directFace.hintOffset' : 'panel.directFace.hintMove') }));
  }
  // ---------- Rippe (KP-06) ----------
  function ribTargets(idx = Infinity) {
    return App.doc.items.slice(0, idx).filter((x) => x.role !== 'hole' && !x.suppressed && !isModifierStep(x) && !(x.op && x.op.target));
  }
  function startRib(face) {
    if (App.ctx) { UI.toast('Rippen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für eine Rippe braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = face && face.info && face.info.t === 'PLANE' ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') {
      Sketch.startOnFace(f, { ribMode: true });
      UI.toast('Zeichne eine offene Linie oder Kurve für die Rippe und klick „Fertig“.', { icon: 'info', ms: 4200 });
    } else {
      Sketch.chooseAndStart({ ribMode: true });
      UI.toast('Wähl eine Ebene und zeichne eine offene Linie für die Rippe.', { icon: 'info', ms: 4200 });
    }
    return true;
  }
  function renderRib(it, sec, setP) {
    const p = it.p || {};
    const idx = App.doc.items.indexOf(it);
    const targets = ribTargets(idx >= 0 ? idx : App.doc.items.length);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    const fl = h('div', { class: 'fields' });
    if (opts.length) {
      fl.append(UI.selectField({ id: 'rib-target', label: 'Zielkörper', value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }) }));
    }
    fl.append(UI.numField({ id: 'rib-thickness', label: 'Dicke', value: p.thickness ?? 2, min: 0.1, onCommit: (v) => setP('thickness', v) }));
    fl.append(UI.selectField({ id: 'rib-side', label: 'Lage zur Linie', value: p.side || 'center', options: [['center', 'Mittig'], ['side1', 'Einseitig (Seite 1)'], ['side2', 'Einseitig (Seite 2)']], onChange: (v) => setP('side', v) }));
    fl.append(UI.selectField({ id: 'rib-dir', label: 'Richtung', value: p.dir || 'normal', options: [['normal', 'Senkrecht zur Skizze (Steg)'], ['parallel', 'In der Skizzenebene (Stütze)']], onChange: (v) => setP('dir', v) }));
    fl.append(UI.numField({ id: 'rib-draft', label: 'Schräge (optional)', value: p.draft ?? 0, unit: '°', min: 0, onCommit: (v) => setP('draft', v) }));
    fl.append(UI.numField({ id: 'rib-depth', label: 'Tiefe (0 = bis zur Wand)', value: p.depth ?? 0, min: 0, onCommit: (v) => setP('depth', v) }));
    sec.append(fl);
    const flipL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'rib-flip', checked: !!p.flip }), 'Richtung umkehren');
    flipL.querySelector('input').onchange = (e) => App.change('Rippenrichtung umgekehrt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flipL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'rib-edit-sketch' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
    eb.onclick = () => Sketch.editItem(it.id);
    row.append(eb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'rib-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Die offene Linie wird mit Dicke bis an die angrenzenden Wände verlängert und direkt mit dem Zielkörper vereinigt. Mit <b>Schräge</b> wird die Rippe zum Boden breiter.' }));
  }
  // ---------- Lüftungsgitter & Kühlrippen (KP-26) und Steg-Netz (KP-27) ----------
  function pickPlanarBodyFace(hintHtml, onPick) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const tgt = hit ? resolveTopTarget(hit.id) : null;
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      if (tgt && tgt.role !== 'hole' && fi && fi.t === 'PLANE' && Array.isArray(fi.c)) {
        stopPick();
        onPick({ id: tgt.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null }, tgt);
        return;
      }
      UI.toast('Bitte klick auf eine ebene Fläche eines Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(hintHtml);
  }
  function pickPlanarStepFace(stepId, changeLabel, toastMsg) {
    pickPlanarBodyFace('<b>Ebene Fläche wählen:</b> Klick auf eine ebene Fläche des Körpers. <b>Esc</b> bricht ab.', (face, tgt) => {
      const sig = faceSigOf(face);
      if (!sig) return;
      App.change(changeLabel, (doc) => {
        const f = Model.find(doc, stepId); if (!f) return false;
        f.item.p.target = tgt.id;
        f.item.p.face = sig;
      });
      UI.toast(toastMsg, { icon: 'check' });
    });
  }
  function vent(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Lüftungsgitter gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startVent(opts);
      return null;
    }
    const p = {
      target: tgt.id,
      face: sig,
      count: opts.count ?? 6,
      slotW: opts.slotW ?? 3,
      frame: opts.frame ?? 4,
      angle: opts.angle ?? 0,
      depth: opts.depth ?? 0,
      roundEnds: opts.roundEnds !== false,
    };
    let step;
    App.change('Lüftungsgitter angelegt', (doc) => {
      step = Model.newItem('vent', p, { name: opts.name || T('kind.vent'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.ventAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startVent(opts = {}) {
    if (App.ctx) { UI.toast('Lüftungsgitter gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für ein Lüftungsgitter braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { vent(f, opts); return true; }
    pickPlanarBodyFace('<b>Lüftungsgitter:</b> Klick auf eine ebene Fläche für die Schlitze. <b>Esc</b> bricht ab.', (picked) => { vent(picked, opts); });
    return true;
  }
  function pickVentFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Lüftungsgitter gewählt', 'Fläche aktualisiert.');
  }
  function renderVent(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.numField({ id: 'vent-count', label: T('panel.vent.count'), value: p.count ?? 6, unit: '', int: true, min: 1, max: 60, onCommit: (v) => setP('count', v) }));
    fl.append(UI.numField({ id: 'vent-slotW', label: T('panel.vent.slotW'), value: p.slotW ?? 3, min: 0.2, unit: 'mm', onCommit: (v) => setP('slotW', v) }));
    fl.append(UI.numField({ id: 'vent-frame', label: T('panel.vent.frame'), value: p.frame ?? 4, min: 0, unit: 'mm', onCommit: (v) => setP('frame', v) }));
    fl.append(UI.numField({ id: 'vent-angle', label: T('panel.vent.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }));
    fl.append(UI.numField({ id: 'vent-depth', label: T('panel.vent.depth'), value: p.depth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('depth', v) }));
    sec.append(fl);
    const rndL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'vent-round', checked: p.roundEnds !== false }), T('panel.vent.roundEnds'));
    rndL.querySelector('input').onchange = (e) => App.change('Schlitzenden geändert', (doc) => { Model.find(doc, it.id).item.p.roundEnds = e.target.checked; });
    sec.append(rndL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'vent-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickVentFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'vent-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.vent.hint') }));
  }
  function fins(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Kühlrippen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startFins(opts);
      return null;
    }
    const p = {
      target: tgt.id,
      face: sig,
      count: opts.count ?? 6,
      finW: opts.finW ?? 1.5,
      height: opts.height ?? 10,
      margin: opts.margin ?? 2,
      angle: opts.angle ?? 0,
      draft: opts.draft ?? 0,
    };
    let step;
    App.change('Kühlrippen angelegt', (doc) => {
      step = Model.newItem('fins', p, { name: opts.name || T('kind.fins'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.finsAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startFins(opts = {}) {
    if (App.ctx) { UI.toast('Kühlrippen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für Kühlrippen braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { fins(f, opts); return true; }
    pickPlanarBodyFace('<b>Kühlrippen:</b> Klick auf eine ebene Fläche, auf der die Rippen stehen sollen. <b>Esc</b> bricht ab.', (picked) => { fins(picked, opts); });
    return true;
  }
  function pickFinsFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Kühlrippen gewählt', 'Fläche aktualisiert.');
  }
  function renderFins(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.numField({ id: 'fins-count', label: T('panel.fins.count'), value: p.count ?? 6, unit: '', int: true, min: 1, max: 80, onCommit: (v) => setP('count', v) }));
    fl.append(UI.numField({ id: 'fins-finW', label: T('panel.fins.finW'), value: p.finW ?? 1.5, min: 0.2, unit: 'mm', onCommit: (v) => setP('finW', v) }));
    fl.append(UI.numField({ id: 'fins-height', label: T('panel.fins.height'), value: p.height ?? 10, min: 0.1, unit: 'mm', onCommit: (v) => setP('height', v) }));
    fl.append(UI.numField({ id: 'fins-margin', label: T('panel.fins.margin'), value: p.margin ?? 2, min: 0, unit: 'mm', onCommit: (v) => setP('margin', v) }));
    fl.append(UI.numField({ id: 'fins-angle', label: T('panel.fins.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }));
    fl.append(UI.numField({ id: 'fins-draft', label: T('panel.fins.draft'), value: p.draft ?? 0, unit: '°', min: 0, onCommit: (v) => setP('draft', v) }));
    sec.append(fl);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'fins-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickFinsFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'fins-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.fins.hint') }));
  }
  function fillPattern(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Füllmuster gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startFillPattern(opts);
      return null;
    }
    const p = {
      target: tgt.id,
      face: sig,
      kind: opts.kind === 'staggered' || opts.kind === 'hex' ? opts.kind : 'grid',
      size: opts.size ?? 5,
      pitch: opts.pitch ?? 8,
      margin: opts.margin ?? 4,
      angle: opts.angle ?? 0,
      depth: opts.depth ?? 0,
    };
    let step;
    App.change('Füllmuster angelegt', (doc) => {
      step = Model.newItem('fillPattern', p, { name: opts.name || T('kind.fillPattern'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.fillPatternAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startFillPattern(opts = {}) {
    if (App.ctx) { UI.toast('Füllmuster gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für ein Füllmuster braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { fillPattern(f, opts); return true; }
    pickPlanarBodyFace('<b>Füllmuster:</b> Klick auf eine ebene Fläche, die mit Löchern oder Waben gefüllt werden soll. <b>Esc</b> bricht ab.', (picked) => { fillPattern(picked, opts); });
    return true;
  }
  function pickFillPatternFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Füllmuster gewählt', 'Fläche aktualisiert.');
  }
  function renderFillPattern(it, sec, setP) {
    const p = it.p || {};
    const kind = p.kind === 'staggered' || p.kind === 'hex' ? p.kind : 'grid';
    const V = Model.vars(App.doc).v;
    const res = App.resolvedOf ? App.resolvedOf(it.id) : null;
    const sizeVal = Model.num(p.size, V, 5);
    const pitchVal = Model.num(p.pitch, V, 8);
    const wall = round(pitchVal - sizeVal, 3);
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'fp-kind', label: T('panel.fillPattern.kind'), value: kind,
      options: [['grid', T('panel.fillPattern.grid')], ['staggered', T('panel.fillPattern.staggered')], ['hex', T('panel.fillPattern.hex')]],
      onChange: (v) => App.change('Füllmuster-Art geändert', (doc) => { Model.find(doc, it.id).item.p.kind = v; }),
    }));
    fl.append(UI.numField({ id: 'fp-size', label: kind === 'hex' ? T('panel.fillPattern.sizeHex') : T('panel.fillPattern.size'), value: p.size ?? 5, min: 0.2, unit: 'mm', onCommit: (v) => setP('size', v) }));
    fl.append(UI.numField({ id: 'fp-pitch', label: T('panel.fillPattern.pitch'), value: p.pitch ?? 8, min: 0.3, unit: 'mm', onCommit: (v) => setP('pitch', v) }));
    fl.append(UI.numField({ id: 'fp-margin', label: T('panel.fillPattern.margin'), value: p.margin ?? 4, min: 0, unit: 'mm', onCommit: (v) => setP('margin', v) }));
    fl.append(UI.numField({ id: 'fp-angle', label: T('panel.fillPattern.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }));
    fl.append(UI.numField({ id: 'fp-depth', label: T('panel.fillPattern.depth'), value: p.depth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('depth', v) }));
    sec.append(fl);
    const cntTxt = (res && res.count != null ? `${res.count}×` : '–') + (isFinite(wall) ? ` · ${T('panel.fillPattern.wall')} ${Units.fmtLenU(Math.max(0, wall), 2)}` : '');
    sec.append(h('div', { class: 'mini-row', id: 'fp-count' }, h('span', { class: 'grow' }, T('panel.fillPattern.holes')), h('b', { class: 'mono' }, cntTxt)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'fp-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickFillPatternFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'fp-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.fillPattern.hint') }));
  }
  function mountPattern(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Lochbilder gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigWithTid(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startMountPattern(opts);
      return null;
    }
    const e = typeof mountPatternEntry === 'function' ? mountPatternEntry(opts.preset || 'nema17') : { id: 'nema17', label: 'NEMA 17 (42 mm)' };
    const p = {
      target: tgt.id,
      face: sig,
      preset: e.id,
      includeCenter: opts.includeCenter !== false,
      holeD: opts.holeD ?? null,
      centerD: opts.centerD ?? null,
      cutW: opts.cutW ?? null,
      cutH: opts.cutH ?? null,
      u: opts.u ?? 0,
      v: opts.v ?? 0,
      angle: opts.angle ?? 0,
      depth: opts.depth ?? 0,
      printFit: opts.printFit || '',
    };
    let step;
    App.change('Lochbild angelegt', (doc) => {
      step = Model.newItem('mountPattern', p, { name: opts.name || `${T('kind.mountPattern')} ${e.label.split(' (')[0]}`, color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.mountPatternAdded', { name: e.label }), { icon: 'check' });
    }
    return step || null;
  }
  function startMountPattern(opts = {}) {
    if (App.ctx) { UI.toast('Lochbilder gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für ein Lochbild braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { mountPattern(f, opts); return true; }
    pickPlanarBodyFace('<b>Lochbild setzen:</b> Klick auf eine ebene Fläche für Lüfter-, Motor-, Servo- oder Platinen-Löcher. <b>Esc</b> bricht ab.', (picked) => { mountPattern(picked, opts); });
    return true;
  }
  function pickMountPatternFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Lochbild gewählt', 'Fläche aktualisiert.');
  }
  function renderMountPattern(it, sec, setP) {
    const p = it.p || {};
    const V = Model.vars(App.doc).v;
    const optNum = (val) => (val == null || val === '' ? null : Model.num(val, V, null));
    const m = typeof mountPatternMetrics === 'function'
      ? mountPatternMetrics({
        ...p,
        holeD: optNum(p.holeD),
        centerD: optNum(p.centerD),
        cutW: optNum(p.cutW),
        cutH: optNum(p.cutH),
        u: Model.num(p.u, V, 0),
        v: Model.num(p.v, V, 0),
        angle: Model.num(p.angle, V, 0),
        depth: Math.max(0, Model.num(p.depth, V, 0)),
      })
      : null;
    if (!m) return;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'mp-preset', label: T('panel.mountPattern.preset'), value: m.id,
      options: typeof MOUNT_PATTERN_GROUPED_OPTIONS !== 'undefined' ? MOUNT_PATTERN_GROUPED_OPTIONS : [[m.id, m.label]],
      onChange: (v) => App.change('Lochbild-Vorlage geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const ne = typeof mountPatternEntry === 'function' ? mountPatternEntry(v) : null;
        item.p.preset = ne ? ne.id : v;
        item.p.holeD = null;
        item.p.centerD = null;
        item.p.cutW = null;
        item.p.cutH = null;
        if (ne && (!item.name || item.name.startsWith(T('kind.mountPattern')))) {
          item.name = `${T('kind.mountPattern')} ${ne.label.split(' (')[0]}`;
        }
      }),
    }));
    sec.append(fl);
    if (m.centerKind !== 'none') {
      const ctrLabel = m.centerKind === 'circle' ? T('panel.mountPattern.includeCircle') : T('panel.mountPattern.includeRect');
      const ctrCb = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'mp-center', checked: m.includeCenter }), ctrLabel);
      ctrCb.querySelector('input').onchange = (e) => setP('includeCenter', e.target.checked);
      sec.append(ctrCb);
    }
    const fl2 = h('div', { class: 'fields', style: { marginTop: '6px' } });
    fl2.append(UI.numField({
      id: 'mp-holeD', label: T('panel.mountPattern.holeD'),
      value: p.holeD != null && p.holeD !== '' ? p.holeD : m.holeD, min: 0.2, unit: 'mm',
      onCommit: (v) => setP('holeD', v),
    }));
    if (m.includeCenter && m.centerKind === 'circle') {
      fl2.append(UI.numField({
        id: 'mp-centerD', label: T('panel.mountPattern.centerD'),
        value: p.centerD != null && p.centerD !== '' ? p.centerD : m.centerD, min: 0, unit: 'mm',
        onCommit: (v) => setP('centerD', v),
      }));
    } else if (m.includeCenter && m.centerKind === 'rect') {
      fl2.append(
        UI.numField({ id: 'mp-cutW', label: T('panel.mountPattern.cutW'), value: p.cutW != null && p.cutW !== '' ? p.cutW : m.cutW, min: 0.5, unit: 'mm', onCommit: (v) => setP('cutW', v) }),
        UI.numField({ id: 'mp-cutH', label: T('panel.mountPattern.cutH'), value: p.cutH != null && p.cutH !== '' ? p.cutH : m.cutH, min: 0.5, unit: 'mm', onCommit: (v) => setP('cutH', v) }),
      );
    }
    fl2.append(
      UI.numField({ id: 'mp-u', label: T('panel.mountPattern.offsetX'), value: p.u ?? 0, unit: 'mm', onCommit: (v) => setP('u', v) }),
      UI.numField({ id: 'mp-v', label: T('panel.mountPattern.offsetY'), value: p.v ?? 0, unit: 'mm', onCommit: (v) => setP('v', v) }),
      UI.numField({ id: 'mp-angle', label: T('panel.mountPattern.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }),
      UI.numField({ id: 'mp-depth', label: T('panel.mountPattern.depth'), value: p.depth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('depth', v) }),
      UI.selectField({ id: 'mp-printFit', label: T('printFit.label'), value: p.printFit || '', options: printFitHoleOptions, onChange: (v) => setP('printFit', v) }),
    );
    sec.append(fl2);
    const pitchTxt = m.layout === 'points'
      ? `${Units.fmtLenU(m.spanX, 2)} × ${Units.fmtLenU(m.spanY, 2)} (asym.)`
      : m.layout === 'square'
        ? `${Units.fmtLenU(m.pitch, 2)} × ${Units.fmtLenU(m.pitch, 2)}`
        : m.layout === 'rect4'
          ? `${Units.fmtLenU(m.pitchX, 2)} × ${Units.fmtLenU(m.pitchY, 2)}`
          : `${Units.fmtLenU(m.pitchX, 2)}`;
    const ctrTxt = m.includeCenter && m.centerKind !== 'none'
      ? (m.centerKind === 'circle' ? ` · Mitte Ø ${Units.fmtLenU(m.centerDEff, 2)}` : ` · Ausschnitt ${Units.fmtLenU(m.cutWEff, 2)} × ${Units.fmtLenU(m.cutHEff, 2)}`)
      : '';
    sec.append(h('div', { class: 'mini-row', id: 'mp-info' },
      h('span', { class: 'grow' }, `${m.holes.length}× Ø ${Units.fmtLenU(m.holeDEff, 2)} (${m.screw}) · ${pitchTxt}${ctrTxt}`),
      h('b', { class: 'mono' }, m.source)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'mp-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickMountPatternFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'mp-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: T('panel.mountPattern.hint') }));
  }
  function portCutout(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Ausschnitte gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigWithTid(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startPortCutout(opts);
      return null;
    }
    const e = typeof portCutoutEntry === 'function' ? portCutoutEntry(opts.preset || 'usbc') : { id: 'usbc', label: 'USB-C (Buchse)' };
    const p = {
      target: tgt.id,
      face: sig,
      preset: e.id,
      w: opts.w ?? null,
      h: opts.h ?? null,
      d: opts.d ?? null,
      r: opts.r ?? null,
      chamfer: opts.chamfer ?? null,
      includeHoles: opts.includeHoles !== false,
      holeD: opts.holeD ?? null,
      u: opts.u ?? 0,
      v: opts.v ?? 0,
      angle: opts.angle ?? 0,
      depth: opts.depth ?? 0,
      printFit: opts.printFit || '',
    };
    let step;
    App.change('Ausschnitt angelegt', (doc) => {
      step = Model.newItem('portCutout', p, { name: opts.name || `${T('kind.portCutout')} ${e.label.split(' (')[0]}`, color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.portCutoutAdded', { name: e.label }), { icon: 'check' });
    }
    return step || null;
  }
  function startPortCutout(opts = {}) {
    if (App.ctx) { UI.toast('Ausschnitte gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für einen Ausschnitt braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { portCutout(f, opts); return true; }
    pickPlanarBodyFace('<b>Ausschnitt setzen:</b> Klick auf eine ebene Fläche (z. B. Gehäusewand) für Stecker, Schalter oder Display. <b>Esc</b> bricht ab.', (picked) => { portCutout(picked, opts); });
    return true;
  }
  function pickPortCutoutFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Ausschnitt gewählt', 'Fläche aktualisiert.');
  }
  function renderPortCutout(it, sec, setP) {
    const p = it.p || {};
    const V = Model.vars(App.doc).v;
    const optNum = (val) => (val == null || val === '' ? null : Model.num(val, V, null));
    const m = typeof portCutoutMetrics === 'function'
      ? portCutoutMetrics({
        ...p,
        w: optNum(p.w),
        h: optNum(p.h),
        d: optNum(p.d),
        r: optNum(p.r),
        chamfer: optNum(p.chamfer),
        holeD: optNum(p.holeD),
        u: Model.num(p.u, V, 0),
        v: Model.num(p.v, V, 0),
        angle: Model.num(p.angle, V, 0),
        depth: Math.max(0, Model.num(p.depth, V, 0)),
      })
      : null;
    if (!m) return;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'pc-preset', label: T('panel.portCutout.preset'), value: m.id,
      options: typeof PORT_CUTOUT_GROUPED_OPTIONS !== 'undefined' ? PORT_CUTOUT_GROUPED_OPTIONS : [[m.id, m.label]],
      onChange: (v) => App.change('Ausschnitt-Vorlage geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const ne = typeof portCutoutEntry === 'function' ? portCutoutEntry(v) : null;
        item.p.preset = ne ? ne.id : v;
        item.p.w = null;
        item.p.h = null;
        item.p.d = null;
        item.p.r = null;
        item.p.chamfer = null;
        item.p.holeD = null;
        if (ne && (!item.name || item.name.startsWith(T('kind.portCutout')))) {
          item.name = `${T('kind.portCutout')} ${ne.label.split(' (')[0]}`;
        }
      }),
    }));
    sec.append(fl);
    if (m.hasHoles) {
      const hCb = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'pc-holes', checked: m.includeHoles }), T('panel.portCutout.includeHoles'));
      hCb.querySelector('input').onchange = (e) => setP('includeHoles', e.target.checked);
      sec.append(hCb);
    }
    const fl2 = h('div', { class: 'fields', style: { marginTop: '6px' } });
    if (m.shape === 'circle') {
      fl2.append(UI.numField({
        id: 'pc-d', label: T('panel.portCutout.diameter'),
        value: p.d != null && p.d !== '' ? p.d : m.d, min: 0.2, unit: 'mm',
        onCommit: (v) => setP('d', v),
      }));
    } else {
      fl2.append(
        UI.numField({ id: 'pc-w', label: T('panel.portCutout.width'), value: p.w != null && p.w !== '' ? p.w : m.w, min: 0.2, unit: 'mm', onCommit: (v) => setP('w', v) }),
        UI.numField({ id: 'pc-h', label: T('panel.portCutout.height'), value: p.h != null && p.h !== '' ? p.h : m.h, min: 0.2, unit: 'mm', onCommit: (v) => setP('h', v) }),
      );
      if (m.shape === 'rect') {
        fl2.append(UI.numField({ id: 'pc-r', label: T('panel.portCutout.cornerR'), value: p.r != null && p.r !== '' ? p.r : m.r, min: 0, unit: 'mm', onCommit: (v) => setP('r', v) }));
      } else if (m.shape === 'hdmi') {
        fl2.append(UI.numField({ id: 'pc-chamfer', label: T('panel.portCutout.chamfer'), value: p.chamfer != null && p.chamfer !== '' ? p.chamfer : m.chamfer, min: 0, unit: 'mm', onCommit: (v) => setP('chamfer', v) }));
      }
    }
    if (m.hasHoles && m.includeHoles) {
      fl2.append(UI.numField({
        id: 'pc-holeD', label: T('panel.portCutout.holeD'),
        value: p.holeD != null && p.holeD !== '' ? p.holeD : m.holeD, min: 0.2, unit: 'mm',
        onCommit: (v) => setP('holeD', v),
      }));
    }
    fl2.append(
      UI.numField({ id: 'pc-u', label: T('panel.portCutout.offsetX'), value: p.u ?? 0, unit: 'mm', onCommit: (v) => setP('u', v) }),
      UI.numField({ id: 'pc-v', label: T('panel.portCutout.offsetY'), value: p.v ?? 0, unit: 'mm', onCommit: (v) => setP('v', v) }),
      UI.numField({ id: 'pc-angle', label: T('panel.portCutout.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }),
      UI.numField({ id: 'pc-depth', label: T('panel.portCutout.depth'), value: p.depth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('depth', v) }),
      UI.selectField({ id: 'pc-printFit', label: T('printFit.label'), value: p.printFit || '', options: printFitHoleOptions, onChange: (v) => setP('printFit', v) }),
    );
    sec.append(fl2);
    const shapeTxt = m.shape === 'circle'
      ? `Ø ${Units.fmtLenU(m.dEff, 2)}`
      : `${Units.fmtLenU(m.wEff, 2)} × ${Units.fmtLenU(m.hEff, 2)}${m.shape === 'slot' ? ' (runde Enden)' : m.shape === 'hdmi' && m.chamferEff > 0.05 ? ` (Fase ${Units.fmtLenU(m.chamferEff, 2)})` : m.shape === 'rect' && m.rEff > 0.05 ? ` (R ${Units.fmtLenU(m.rEff, 2)})` : ''}`;
    const holeTxt = m.hasHoles && m.includeHoles
      ? ` · ${m.holes.length}× Ø ${Units.fmtLenU(m.holeDEff, 2)} (${Units.fmtLenU(m.pitchX, 2)} × ${Units.fmtLenU(m.pitchY, 2)})`
      : '';
    sec.append(h('div', { class: 'mini-row', id: 'pc-info' },
      h('span', { class: 'grow' }, `${shapeTxt}${holeTxt}`),
      h('b', { class: 'mono' }, m.source)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'pc-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickPortCutoutFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'pc-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: T('panel.portCutout.hint') }));
  }
  function magnetPocket(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Magnet-Taschen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigWithTid(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startMagnetPocket(opts);
      return null;
    }
    const e = typeof magnetPresetEntry === 'function' ? magnetPresetEntry(opts.preset || 'd10x3') : { id: 'd10x3', label: 'Scheibe Ø 10 × 3 mm (Standard)' };
    const p = {
      target: tgt.id,
      face: sig,
      preset: e.id,
      d: opts.d ?? null,
      w: opts.w ?? null,
      l: opts.l ?? null,
      h: opts.h ?? null,
      r: opts.r ?? null,
      clear: opts.clear ?? 0.1,
      chamfer: opts.chamfer ?? 0,
      embed: opts.embed ?? 0,
      u: opts.u ?? 0,
      v: opts.v ?? 0,
      angle: opts.angle ?? 0,
      printFit: opts.printFit || '',
    };
    let step;
    App.change('Magnet-Tasche angelegt', (doc) => {
      step = Model.newItem('magnetPocket', p, { name: opts.name || `${T('kind.magnetPocket')} ${e.label.split(' (')[0]}`, color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.magnetPocketAdded', { name: e.label }), { icon: 'check' });
    }
    return step || null;
  }
  function startMagnetPocket(opts = {}) {
    if (App.ctx) { UI.toast('Magnet-Taschen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für eine Magnet-Tasche braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { magnetPocket(f, opts); return true; }
    pickPlanarBodyFace('<b>Magnet-Tasche setzen:</b> Klick auf eine ebene Fläche für die Magnet-Vertiefung. <b>Esc</b> bricht ab.', (picked) => { magnetPocket(picked, opts); });
    return true;
  }
  function pickMagnetPocketFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Magnet-Tasche gewählt', 'Fläche aktualisiert.');
  }
  function renderMagnetPocket(it, sec, setP) {
    const p = it.p || {};
    const V = Model.vars(App.doc).v;
    const optNum = (val) => (val == null || val === '' ? null : Model.num(val, V, null));
    const m = typeof magnetPocketMetrics === 'function'
      ? magnetPocketMetrics({
        ...p,
        d: optNum(p.d),
        w: optNum(p.w),
        l: optNum(p.l),
        h: optNum(p.h),
        r: optNum(p.r),
        clear: p.clear != null && p.clear !== '' ? Model.num(p.clear, V, 0.1) : 0.1,
        chamfer: Math.max(0, Model.num(p.chamfer, V, 0)),
        embed: Math.max(0, Model.num(p.embed, V, 0)),
        u: Model.num(p.u, V, 0),
        v: Model.num(p.v, V, 0),
        angle: Model.num(p.angle, V, 0),
      })
      : null;
    if (!m) return;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'mpk-preset', label: T('panel.magnetPocket.preset'), value: m.id,
      options: typeof MAGNET_PRESET_GROUPED_OPTIONS !== 'undefined' ? MAGNET_PRESET_GROUPED_OPTIONS : [[m.id, m.label]],
      onChange: (v) => App.change('Magnet-Vorlage geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const ne = typeof magnetPresetEntry === 'function' ? magnetPresetEntry(v) : null;
        item.p.preset = ne ? ne.id : v;
        item.p.d = null;
        item.p.w = null;
        item.p.l = null;
        item.p.h = null;
        item.p.r = null;
        if (ne && (!item.name || item.name.startsWith(T('kind.magnetPocket')))) {
          item.name = `${T('kind.magnetPocket')} ${ne.label.split(' (')[0]}`;
        }
      }),
    }));
    sec.append(fl);
    const fl2 = h('div', { class: 'fields', style: { marginTop: '6px' } });
    if (m.shape === 'round') {
      fl2.append(UI.numField({
        id: 'mpk-d', label: T('panel.magnetPocket.diameter'),
        value: p.d != null && p.d !== '' ? p.d : m.d, min: 1, unit: 'mm',
        onCommit: (v) => setP('d', v),
      }));
    } else {
      fl2.append(
        UI.numField({ id: 'mpk-w', label: T('panel.magnetPocket.width'), value: p.w != null && p.w !== '' ? p.w : m.w, min: 1, unit: 'mm', onCommit: (v) => setP('w', v) }),
        UI.numField({ id: 'mpk-l', label: T('panel.magnetPocket.length'), value: p.l != null && p.l !== '' ? p.l : m.l, min: 1, unit: 'mm', onCommit: (v) => setP('l', v) }),
      );
    }
    fl2.append(
      UI.numField({ id: 'mpk-h', label: T('panel.magnetPocket.height'), value: p.h != null && p.h !== '' ? p.h : m.h, min: 0.3, unit: 'mm', onCommit: (v) => setP('h', v) }),
      UI.numField({ id: 'mpk-clear', label: T('panel.magnetPocket.clearance'), value: p.clear ?? 0.1, min: 0, unit: 'mm', onCommit: (v) => setP('clear', v) }),
    );
    if (m.shape === 'round') {
      fl2.append(UI.numField({ id: 'mpk-chamfer', label: T('panel.magnetPocket.chamfer'), value: p.chamfer ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('chamfer', v) }));
    } else {
      fl2.append(
        UI.numField({ id: 'mpk-r', label: T('panel.magnetPocket.cornerR'), value: p.r ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('r', v) }),
        UI.numField({ id: 'mpk-angle', label: T('panel.magnetPocket.angle'), value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }),
      );
    }
    fl2.append(
      UI.numField({ id: 'mpk-embed', label: T('panel.magnetPocket.embed'), value: p.embed ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('embed', v) }),
      UI.numField({ id: 'mpk-u', label: T('panel.magnetPocket.offsetX'), value: p.u ?? 0, unit: 'mm', onCommit: (v) => setP('u', v) }),
      UI.numField({ id: 'mpk-v', label: T('panel.magnetPocket.offsetY'), value: p.v ?? 0, unit: 'mm', onCommit: (v) => setP('v', v) }),
      UI.selectField({ id: 'mpk-printFit', label: T('printFit.label'), value: p.printFit || '', options: printFitHoleOptions, onChange: (v) => setP('printFit', v) }),
    );
    sec.append(fl2);
    const dimTxt = m.shape === 'round'
      ? `Tasche Ø ${Units.fmtLenU(m.dEff, 2)} × ${Units.fmtLenU(m.depthEff, 2)} tief`
      : `Tasche ${Units.fmtLenU(m.wEff, 2)} × ${Units.fmtLenU(m.lEff, 2)} × ${Units.fmtLenU(m.depthEff, 2)} tief`;
    const embTxt = m.embed > 1e-4 ? ` · eingebettet (${Units.fmtLenU(m.embed, 2)} Wand)` : '';
    sec.append(h('div', { class: 'mini-row', id: 'mpk-info' },
      h('span', { class: 'grow' }, `${dimTxt}${embTxt}`),
      h('b', { class: 'mono' }, `Spiel ${Units.fmtLenU(m.clear, 2)}`)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'mpk-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickMagnetPocketFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'mpk-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: T('panel.magnetPocket.hint') }));
  }
  function startWeb(face) {
    if (App.ctx) { UI.toast('Steg-Netze gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für ein Steg-Netz braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = face && face.info && face.info.t === 'PLANE' ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') {
      Sketch.startOnFace(f, { webMode: true });
      UI.toast('Zeichne die Linien für das Steg-Netz (auch Kreuzungen oder Gitter) und klick „Fertig“.', { icon: 'info', ms: 4200 });
    } else {
      Sketch.chooseAndStart({ webMode: true });
      UI.toast('Wähl eine Ebene und zeichne die Linien für das Steg-Netz.', { icon: 'info', ms: 4200 });
    }
    return true;
  }
  function web(opts = {}) {
    if (App.ctx) { UI.toast('Steg-Netze gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = opts.target ? resolveTopTarget(opts.target) : (ribTargets().slice(-1)[0] || null);
    if (!tgt || tgt.role === 'hole' || !opts.sketch) return null;
    const p = {
      target: tgt.id,
      sketch: deepClone(opts.sketch),
      thickness: opts.thickness ?? 2,
      depth: opts.depth ?? 0,
      draft: opts.draft ?? 0,
      extend: opts.extend !== false,
      flip: !!opts.flip,
    };
    let step;
    App.change('Steg-Netz angelegt', (doc) => {
      step = Model.newItem('web', p, { name: opts.name || T('kind.web'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.webAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function renderWeb(it, sec, setP) {
    const p = it.p || {};
    const idx = App.doc.items.indexOf(it);
    const targets = ribTargets(idx >= 0 ? idx : App.doc.items.length);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    const fl = h('div', { class: 'fields' });
    if (opts.length) {
      fl.append(UI.selectField({ id: 'web-target', label: T('ctx.targetBody'), value: p.target || '', options: opts, onChange: (v) => App.change('Zielkörper gewählt', (doc) => { Model.find(doc, it.id).item.p.target = v; }) }));
    }
    fl.append(UI.numField({ id: 'web-thickness', label: T('common.thickness'), value: p.thickness ?? 2, min: 0.1, unit: 'mm', onCommit: (v) => setP('thickness', v) }));
    fl.append(UI.numField({ id: 'web-depth', label: T('panel.web.depth'), value: p.depth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('depth', v) }));
    fl.append(UI.numField({ id: 'web-draft', label: T('sk.step.ribDraft'), value: p.draft ?? 0, unit: '°', min: 0, onCommit: (v) => setP('draft', v) }));
    sec.append(fl);
    const extL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'web-extend', checked: p.extend !== false }), T('panel.web.extend'));
    extL.querySelector('input').onchange = (e) => App.change('Enden verlängern umgeschaltet', (doc) => { Model.find(doc, it.id).item.p.extend = e.target.checked; });
    const flipL = h('label', { class: 'check', style: { marginTop: '4px' } }, h('input', { type: 'checkbox', id: 'web-flip', checked: !!p.flip }), T('sk.step.ribFlip'));
    flipL.querySelector('input').onchange = (e) => App.change('Stegrichtung umgekehrt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(extL, flipL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'web-edit-sketch' }); eb.innerHTML = icon('edit') + esc(T('panel.item.editSketch'));
    eb.onclick = () => Sketch.editItem(it.id);
    row.append(eb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'web-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.web.hint') }));
  }
  // ---------- Prägen (KP-33) ----------
  function embossPlaneForFace(face, tgt) {
    const info = (face && face.info) || {};
    if (info.t === 'PLANE' && Array.isArray(info.n) && Array.isArray(info.c)) {
      const fr = Actions.faceFrame(info);
      return { o: fr.o, x: fr.x, n: fr.n };
    }
    const frameFromON = (oVec, nVec) => {
      const n = nVec.clone().normalize();
      const refUp = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      let x = new THREE.Vector3().crossVectors(refUp, n);
      if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
      x.normalize();
      return {
        o: oVec.toArray().map((v) => round(v, 6)),
        x: x.toArray().map((v) => round(v, 9)),
        n: n.toArray().map((v) => round(v, 9)),
      };
    };
    const camLocal = () => {
      const inv = Model.worldMatrix(App.doc, tgt.id).invert();
      return Viewer.camera.position.clone().applyMatrix4(inv);
    };
    const c = new THREE.Vector3(...(Array.isArray(info.c) ? info.c : [0, 0, 0]));
    if ((info.t === 'CYLINDRE' || info.t === 'CONE') && Array.isArray(info.axis) && info.axis.length >= 6) {
      const axO = new THREE.Vector3(info.axis[0], info.axis[1], info.axis[2]);
      const axD = new THREE.Vector3(info.axis[3], info.axis[4], info.axis[5]).normalize();
      const midOnAxis = axO.clone().addScaledVector(axD, c.clone().sub(axO).dot(axD));
      const cVec = c.clone().sub(midOnAxis);
      const r = info.r || info.coneR || cVec.length() || 5;
      let rad;
      if (cVec.length() > 0.15 * r) {
        rad = cVec.normalize();
      } else {
        const cl = camLocal().sub(midOnAxis);
        cl.addScaledVector(axD, -cl.dot(axD));
        if (cl.lengthSq() > 1e-6) rad = cl.normalize();
        else rad = Math.abs(axD.y) < 0.9 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(1, 0, 0);
        rad.addScaledVector(axD, -rad.dot(axD)).normalize();
      }
      return frameFromON(midOnAxis.clone().addScaledVector(rad, r), rad);
    }
    if (info.t === 'SPHERE' && Array.isArray(info.sc) && info.sc.length >= 3) {
      const sc = new THREE.Vector3(info.sc[0], info.sc[1], info.sc[2]);
      const r = info.r || 5;
      const cVec = c.clone().sub(sc);
      let rad;
      if (cVec.length() > 0.15 * r) {
        rad = cVec.normalize();
      } else {
        const cl = camLocal().sub(sc);
        rad = cl.lengthSq() > 1e-6 ? cl.normalize() : new THREE.Vector3(0, -1, 0);
      }
      return frameFromON(sc.clone().addScaledVector(rad, r), rad);
    }
    const n = Array.isArray(info.n) && info.n.length >= 3
      ? new THREE.Vector3(...info.n).normalize()
      : (() => { const cl = camLocal().sub(c); return cl.lengthSq() > 1e-6 ? cl.normalize() : new THREE.Vector3(0, -1, 0); })();
    return frameFromON(c, n);
  }
  function startEmboss(face, opts = {}) {
    if (App.ctx) { UI.toast('Prägen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig) {
      UI.toast('Klick zuerst eine Fläche eines Körpers an (z. B. einen Zylindermantel oder eine Kugel).', { icon: 'info' });
      return false;
    }
    const plane = embossPlaneForFace(face, tgt);
    Sketch.startEmboss(face, plane, { ...opts, targetId: tgt.id, faceSig: sig });
    UI.toast('Zeichne Text oder ein Logo für das Prägen und klick „Fertig“.', { icon: 'info', ms: 4200 });
    return true;
  }
  function emboss(face, sketch, opts = {}) {
    if (App.ctx) { UI.toast('Prägen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || !sketch) return null;
    const p = {
      target: tgt.id,
      face: sig,
      sketch: deepClone(sketch),
      height: opts.height ?? 1,
      mode: opts.mode === 'deboss' ? 'deboss' : 'emboss',
      flip: !!opts.flip,
    };
    let step;
    App.change('Prägen angelegt', (doc) => {
      step = Model.newItem('emboss', p, { name: opts.name || 'Prägen', color: tgt.color, role: 'solid', mat: tgt.mat });
      Model.setFromMatrix(step, Model.worldMatrix(doc, tgt.id));
      insertAtMarker(doc, step);
    });
    if (step) App.select([step.id]);
    return step || null;
  }
  function pickEmbossFace(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          const sig = faceSigOf({ info: fi });
          App.change('Zielfläche für Prägen gewählt', (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = sig;
          });
          UI.toast('Zielfläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche eines Körpers.', { icon: 'info' });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche wählen:</b> Klick auf eine Fläche des Körpers. <b>Esc</b> bricht ab.');
  }
  function renderEmboss(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({ id: 'emb-mode', label: 'Art', value: p.mode === 'deboss' ? 'deboss' : 'emboss', options: [['emboss', 'Erhaben (heraus)'], ['deboss', 'Vertieft (hinein)']], onChange: (v) => App.change('Präge-Art geändert', (doc) => { Model.find(doc, it.id).item.p.mode = v; }) }));
    fl.append(UI.numField({ id: 'emb-h', label: 'Höhe', value: p.height ?? 1, min: 0.1, unit: 'mm', onCommit: (v) => setP('height', v) }));
    sec.append(fl);
    const flipL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'emb-flip', checked: !!p.flip }), 'Andere Seite');
    flipL.querySelector('input').onchange = (e) => App.change('Präge-Seite umgekehrt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flipL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'emb-edit-sketch' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
    eb.onclick = () => Sketch.editItem(it.id);
    const pb = h('button', { type: 'button', class: 'btn small', id: 'emb-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickEmbossFace(it.id);
    row.append(eb, pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'emb-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Projiziert die Skizze (Text, Logo oder Form) auf die gewählte Fläche – auch auf Zylinder, Kugel oder Kegel – und überträgt sie erhaben oder vertieft.' }));
  }
  // ---------- Kurve auf Fläche projizieren & Fläche teilen (KP-35) ----------
  function pickAnyBodyFace(hintHtml, onPick) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const tgt = hit ? resolveTopTarget(hit.id) : null;
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
        stopPick();
        onPick({ id: tgt.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null }, tgt);
        return;
      }
      UI.toast('Bitte klick auf eine Fläche eines Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi ? hit.id : null, fi ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(hintHtml);
  }
  function startSplitFace(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Fläche teilen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig) {
      if (!ribTargets().length) { UI.toast('Für „Fläche teilen“ braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
      pickAnyBodyFace('<b>Fläche teilen:</b> Klick auf eine Fläche (z. B. Zylindermantel oder Kugel), die geteilt werden soll. <b>Esc</b> bricht ab.', (picked) => { startSplitFace(picked, opts); });
      return true;
    }
    const plane = embossPlaneForFace(face, tgt);
    Sketch.startSplitFace(face, plane, { ...opts, targetId: tgt.id, faceSig: sig });
    UI.toast('Zeichne die Kurve oder den Umriss zum Teilen und klick „Fertig“.', { icon: 'info', ms: 4200 });
    return true;
  }
  function splitFace(face, sketch, opts = {}) {
    if (App.ctx) { UI.toast('Fläche teilen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || !sketch) return null;
    const p = {
      target: tgt.id,
      face: sig,
      sketch: deepClone(sketch),
      side: opts.side === 'back' || opts.side === 'both' ? opts.side : 'front',
    };
    let step;
    App.change('Fläche geteilt', (doc) => {
      step = Model.newItem('splitFace', p, { name: opts.name || T('kind.splitFace'), color: tgt.color, role: 'solid', mat: tgt.mat });
      Model.setFromMatrix(step, Model.worldMatrix(doc, tgt.id));
      insertAtMarker(doc, step);
    });
    if (step) App.select([step.id]);
    return step || null;
  }
  function pickSplitFace(stepId) {
    pickAnyBodyFace('<b>Fläche wählen:</b> Klick auf die Fläche des Körpers, die geteilt werden soll. <b>Esc</b> bricht ab.', (face, tgt) => {
      const sig = faceSigOf(face);
      if (!sig) return;
      App.change('Zielfläche für Fläche teilen gewählt', (doc) => {
        const f = Model.find(doc, stepId); if (!f) return false;
        f.item.p.target = tgt.id;
        f.item.p.face = sig;
      });
      UI.toast('Zielfläche aktualisiert.', { icon: 'check' });
    });
  }
  function renderSplitFace(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'sf-side', label: T('panel.splitFace.side'), value: p.side === 'back' || p.side === 'both' ? p.side : 'front',
      options: [['front', T('panel.splitFace.front')], ['back', T('panel.splitFace.back')], ['both', T('panel.splitFace.both')]],
      onChange: (v) => App.change('Projektionsseite geändert', (doc) => { Model.find(doc, it.id).item.p.side = v; }),
    }));
    sec.append(fl);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'sf-edit-sketch' }); eb.innerHTML = icon('edit') + esc(T('panel.item.editSketch'));
    eb.onclick = () => Sketch.editItem(it.id);
    const pb = h('button', { type: 'button', class: 'btn small', id: 'sf-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickSplitFace(it.id);
    row.append(eb, pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'sf-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.splitFace.hint') }));
  }
  // ---------- Kuppel auf ebener Fläche (KP-36) ----------
  function dome(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Kuppeln gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = faceSigOf(face);
    if (!tgt || tgt.role === 'hole' || !sig || (face.info && face.info.t !== 'PLANE')) {
      startDome(opts);
      return null;
    }
    const p = {
      target: tgt.id,
      face: sig,
      height: opts.height ?? 5,
      shape: opts.shape === 'spherical' ? 'spherical' : 'elliptical',
      flip: !!opts.flip,
    };
    let step;
    App.change('Kuppel angelegt', (doc) => {
      step = Model.newItem('dome', p, { name: opts.name || T('kind.dome'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.domeAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startDome(opts = {}) {
    if (App.ctx) { UI.toast('Kuppeln gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für eine Kuppel braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const f = Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') { dome(f, opts); return true; }
    pickPlanarBodyFace('<b>Kuppel:</b> Klick auf eine ebene Fläche, auf der die Kuppel entstehen soll. <b>Esc</b> bricht ab.', (picked) => { dome(picked, opts); });
    return true;
  }
  function pickDomeFace(stepId) {
    pickPlanarStepFace(stepId, 'Fläche für Kuppel gewählt', 'Fläche aktualisiert.');
  }
  function renderDome(it, sec, setP) {
    const p = it.p || {};
    const fl = h('div', { class: 'fields' });
    fl.append(UI.numField({ id: 'dome-h', label: T('panel.dome.height'), value: p.height ?? 5, min: 0.1, unit: 'mm', onCommit: (v) => setP('height', v) }));
    fl.append(UI.selectField({
      id: 'dome-shape', label: T('panel.dome.shape'), value: p.shape === 'spherical' ? 'spherical' : 'elliptical',
      options: [['elliptical', T('panel.dome.elliptical')], ['spherical', T('panel.dome.spherical')]],
      onChange: (v) => App.change('Kuppelform geändert', (doc) => { Model.find(doc, it.id).item.p.shape = v; }),
    }));
    sec.append(fl);
    const flpL = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'dome-flip', checked: !!p.flip }), T('panel.dome.flip'));
    flpL.querySelector('input').onchange = (e) => App.change('Kuppel-Richtung geändert', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flpL);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'dome-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.ext.pickOtherFace'));
    pb.onclick = () => pickDomeFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'dome-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.dome.hint') }));
  }
  // ---------- Fläche löschen und Lücke heilen (DB-03) ----------
  function deleteFaceSig(face) {
    if (!face || !face.id) return null;
    const fidx = face.idx != null ? face.idx : face.faceIdx;
    const info = face.info || (fidx != null ? App.results.get(face.id)?.data?.faces?.[fidx] : null);
    if (!info || !Array.isArray(info.c)) return null;
    const sig = faceSigOf({ info });
    if (!sig) return null;
    if (info.tid) sig.tid = info.tid;
    return sig;
  }
  function sameDeleteFaceSig(a, b) {
    if (!a || !b) return false;
    if (a.tid && b.tid && a.tid === b.tid && (!Array.isArray(a.c) || !Array.isArray(b.c) || Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]) < 1e-2)) return true;
    return Array.isArray(a.c) && Array.isArray(b.c) && Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]) < 1e-3 && (a.t || '') === (b.t || '');
  }
  function faceTypeLabelDE(t) {
    return ({ PLANE: 'Ebene Fläche', CYLINDRE: 'Zylinderfläche', CONE: 'Kegelfläche', SPHERE: 'Kugelfläche', TORUS: 'Torusfläche (Rundung)', BSPLINE: 'Freiformfläche', EXTRUSION: 'Gekrümmte Fläche', REVOLUTION: 'Drehfläche' })[t] || 'Fläche';
  }
  function deleteFace(facesOrFace = null, opts = {}) {
    if (App.ctx) { UI.toast('Fläche löschen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    let list;
    if (Array.isArray(facesOrFace)) list = facesOrFace;
    else if (facesOrFace) list = [facesOrFace];
    else if (App.faces && App.faces.length) list = App.faces;
    else {
      const sf = Actions.selectedFace();
      list = sf ? [sf] : [];
    }
    const entries = [];
    let tgt = null;
    for (const f of list) {
      const t = f && f.id ? resolveTopTarget(f.id) : null;
      const sig = deleteFaceSig(f);
      if (!t || t.role === 'hole' || !sig) continue;
      if (!tgt) tgt = t;
      else if (tgt.id !== t.id) {
        UI.toast('Wähle bitte nur Flächen eines einzelnen Körpers.', { icon: 'info' });
        return null;
      }
      if (!entries.some((e) => sameDeleteFaceSig(e, sig))) entries.push(sig);
    }
    if (!tgt || !entries.length) {
      startDeleteFace(opts);
      return null;
    }
    let step;
    App.change('Fläche löschen angelegt', (doc) => {
      step = Model.newItem('deleteFace', { target: tgt.id, faces: entries }, { name: opts.name || T('kind.deleteFace'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.deleteFaceAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startDeleteFace(opts = {}) {
    if (App.ctx) { UI.toast('Fläche löschen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für „Fläche löschen“ braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    if (App.faces && App.faces.length) {
      const ok = deleteFace(App.faces, opts);
      if (ok) return true;
    }
    const f = Actions.selectedFace();
    if (f) { deleteFace(f, opts); return true; }
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
          stopPick();
          deleteFace({ id: hit.id, idx: hit.faceIdx, info: fi }, opts);
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche eines Körpers (z. B. Loch oder Rundung).', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche löschen:</b> Klick auf eine Fläche (z. B. Bohrung oder Rundung), um sie zu entfernen und die Lücke zu schließen. <b>Esc</b> bricht ab.');
    return true;
  }
  function pickDeleteFace(stepId, mode = 'replace') {
    stopPick();
    const fStep = Model.find(App.doc, stepId);
    if (!fStep || fStep.item.kind !== 'deleteFace') return false;
    const curTarget = fStep.item.p && fStep.item.p.target;
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        const sig = tgt && tgt.role !== 'hole' && fi ? deleteFaceSig({ id: hit.id, idx: hit.faceIdx, info: fi }) : null;
        if (sig) {
          if (mode === 'add' && curTarget && tgt.id !== curTarget) {
            UI.toast('Bitte wähle eine Fläche desselben Körpers.', { icon: 'info' });
            return;
          }
          stopPick();
          App.change(mode === 'add' ? 'Fläche zu „Fläche löschen“ hinzugefügt' : 'Fläche für „Fläche löschen“ neu gewählt', (doc) => {
            const fn = Model.find(doc, stepId); if (!fn) return false;
            fn.item.p = fn.item.p || {};
            if (mode === 'add') {
              const arr = Array.isArray(fn.item.p.faces) ? fn.item.p.faces.slice() : [];
              if (!arr.some((x) => sameDeleteFaceSig(x, sig))) arr.push(sig);
              fn.item.p.faces = arr;
            } else {
              fn.item.p.target = tgt.id;
              fn.item.p.faces = [sig];
            }
          });
          UI.toast(mode === 'add' ? 'Fläche hinzugefügt.' : 'Fläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche des Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(mode === 'add' ? '<b>Weitere Fläche löschen:</b> Klick auf eine weitere Fläche desselben Körpers. <b>Esc</b> bricht ab.' : '<b>Fläche neu wählen:</b> Klick auf die gewünschte Fläche. <b>Esc</b> bricht ab.');
    return true;
  }
  function removeDeleteFaceEntry(stepId, idx) {
    const fn = Model.find(App.doc, stepId);
    const arr = fn && fn.item && fn.item.p && Array.isArray(fn.item.p.faces) ? fn.item.p.faces : null;
    if (!arr || arr.length <= 1 || idx < 0 || idx >= arr.length) return false;
    App.change('Fläche aus „Fläche löschen“ entfernt', (doc) => {
      const f2 = Model.find(doc, stepId);
      if (!f2 || !f2.item.p || !Array.isArray(f2.item.p.faces) || f2.item.p.faces.length <= 1) return false;
      f2.item.p.faces.splice(idx, 1);
    });
    return true;
  }
  function renderDeleteFace(it, sec, setP) {
    const p = it.p || {};
    const list = Array.isArray(p.faces) ? p.faces : [];
    const box = h('div', { id: 'df-faces-list', style: { display: 'grid', gap: '4px', marginBottom: '8px' } });
    if (list.length) {
      box.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.deleteFace.facesTitle')), h('b', { class: 'mono' }, String(list.length))));
      list.forEach((fc, idx) => {
        const lbl = `${idx + 1}. ${faceTypeLabelDE(fc && fc.t)}`;
        const row = h('div', { class: 'mini-row', id: 'df-face-' + idx });
        row.append(h('span', { class: 'grow' }, lbl));
        if (list.length > 1) {
          const rm = h('button', { type: 'button', class: 'btn ghost small', id: 'df-rm-' + idx, 'aria-label': T('panel.deleteFace.removeFace'), 'data-tip': T('panel.deleteFace.removeFace') });
          rm.innerHTML = icon('trash');
          rm.onclick = () => removeDeleteFaceEntry(it.id, idx);
          row.append(rm);
        }
        box.append(row);
      });
    }
    sec.append(box);
    const row = h('div', { class: 'btn-row' });
    const ab = h('button', { type: 'button', class: 'btn small primary', id: 'df-add' }); ab.innerHTML = icon('plus') + esc(T('panel.deleteFace.addFace'));
    ab.onclick = () => pickDeleteFace(it.id, 'add');
    const pb = h('button', { type: 'button', class: 'btn small', id: 'df-pick' }); pb.innerHTML = icon('cursor') + esc(T('panel.deleteFace.pickFace'));
    pb.onclick = () => pickDeleteFace(it.id, 'replace');
    row.append(ab, pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'df-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.deleteFace.hint') }));
  }
  // ---------- Fläche ersetzen (DB-04) ----------
  function normalizeReplaceTarget(rep) {
    if (!rep) return null;
    if (rep.datumId) {
      const dm = typeof Datums !== 'undefined' ? Datums.find(rep.datumId) : null;
      if (!dm || !dm.plane) return null;
      return { kind: 'datum', datumId: dm.id, label: dm.name || rep.label || 'Bezugsebene' };
    }
    if (rep.plane && Array.isArray(rep.plane.o) && Array.isArray(rep.plane.n)) {
      return {
        kind: 'plane',
        plane: { o: rep.plane.o.slice(0, 3).map((v) => round(v, 6)), n: rep.plane.n.slice(0, 3).map((v) => round(v, 6)) },
        label: rep.label || 'Ebene',
      };
    }
    if (rep.id) {
      const fidx = rep.idx != null ? rep.idx : rep.faceIdx;
      const rId = App.mergedInto(rep.id) || rep.id;
      const fi = rep.info || (fidx != null ? App.results.get(rId)?.data?.faces?.[fidx] : null);
      if (!fi || !Array.isArray(fi.c)) return null;
      const topTgt = resolveTopTarget(rep.id);
      const tgtId = topTgt ? topTgt.id : rId;
      const resData = App.results.get(tgtId)?.data || App.results.get(rId)?.data || {};
      const bb = resData.bbox;
      const rel = bb && fi.c ? [0, 1, 2].map((k) => { const sp = bb[k + 3] - bb[k]; return sp > 1e-6 ? round((fi.c[k] - bb[k]) / sp, 6) : 0.5; }) : null;
      const W = Model.worldMatrix(App.doc, tgtId);
      const wc = new THREE.Vector3(...fi.c).applyMatrix4(W).toArray().map((v) => round(v, 6));
      const wn = Array.isArray(fi.n) ? new THREE.Vector3(...fi.n).transformDirection(W).normalize().toArray().map((v) => round(v, 6)) : null;
      return {
        kind: 'face',
        id: tgtId,
        idx: fidx != null ? fidx : 0,
        t: fi.t || null,
        c: fi.c.map((v) => round(v, 6)),
        n: Array.isArray(fi.n) ? fi.n.map((v) => round(v, 6)) : null,
        rel,
        wc,
        wn,
        ...(fi.tid ? { tid: fi.tid } : {}),
        label: rep.label || (topTgt ? Model.label(topTgt) : 'Fläche'),
      };
    }
    return null;
  }
  function pickReplaceRefAt(cx, cy, srcTgtId = null, srcSig = null) {
    const rc = Viewer.setRay(cx, cy);
    let datumCand = null;
    const g = Viewer.groups && Viewer.groups.datums;
    if (g && g.children.length && typeof Datums !== 'undefined') {
      const dh = rc.intersectObjects(g.children, true);
      for (const h of dh) {
        let o = h.object;
        while (o && !o.userData.datum && o !== g) o = o.parent;
        if (o && o.userData.datum) {
          const d = Datums.find(o.userData.datum);
          if (d && d.plane) {
            datumCand = { ref: { kind: 'datum', datumId: d.id, label: d.name }, dist: h.distance };
            break;
          }
        }
      }
    }
    let faceCand = null;
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true });
    if (hit && hit.faceIdx >= 0) {
      const tgt = resolveTopTarget(hit.id);
      const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
      if (tgt && tgt.role !== 'hole' && fi && Array.isArray(fi.c)) {
        const hitSig = deleteFaceSig({ id: hit.id, idx: hit.faceIdx, info: fi });
        const isSameSrc = srcTgtId && tgt.id === srcTgtId && srcSig && hitSig && sameDeleteFaceSig(srcSig, hitSig);
        if (!isSameSrc) {
          const ref = normalizeReplaceTarget({ id: hit.id, idx: hit.faceIdx, info: fi });
          if (ref) {
            const dist = hit.point ? rc.ray.origin.distanceTo(hit.point) : Infinity;
            faceCand = { ref, dist, hit };
          }
        }
      }
    }
    if (datumCand && (!faceCand || datumCand.dist <= faceCand.dist + 1e-3)) return datumCand.ref;
    return faceCand ? faceCand.ref : null;
  }
  function replaceFace(face = null, replaceTarget = null, opts = {}) {
    if (App.ctx) { UI.toast('Fläche ersetzen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = face ? resolveTopTarget(face.id) : null;
    const sig = deleteFaceSig(face);
    if (!tgt || tgt.role === 'hole' || !sig) {
      startReplaceFace(null, opts);
      return null;
    }
    const rep = normalizeReplaceTarget(replaceTarget);
    if (!rep) {
      startReplaceFace(face, opts);
      return null;
    }
    if (rep.kind === 'face' && rep.id === tgt.id && sameDeleteFaceSig(sig, rep)) {
      UI.toast('Bitte wähle eine andere Fläche oder eine Bezugsebene als Ziel.', { icon: 'info' });
      return null;
    }
    let step;
    App.change(T('undo.replaceFace'), (doc) => {
      step = Model.newItem('replaceFace', { target: tgt.id, face: sig, replace: rep, flip: !!opts.flip }, { name: opts.name || T('kind.replaceFace'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.replaceFaceAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startReplaceFace(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Fläche ersetzen gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für „Fläche ersetzen“ braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    let srcFace = face || Actions.selectedFace();
    let srcTgt = srcFace ? resolveTopTarget(srcFace.id) : null;
    let srcSig = srcFace ? deleteFaceSig(srcFace) : null;
    if (!srcTgt || srcTgt.role === 'hole' || !srcSig) {
      srcFace = null; srcTgt = null; srcSig = null;
    }
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!srcFace) {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
        if (hit && hit.faceIdx >= 0) {
          const tgt = resolveTopTarget(hit.id);
          const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
          const sig = tgt && tgt.role !== 'hole' && fi ? deleteFaceSig({ id: hit.id, idx: hit.faceIdx, info: fi }) : null;
          if (sig) {
            srcFace = { id: hit.id, idx: hit.faceIdx, info: fi };
            srcTgt = tgt;
            srcSig = sig;
            Viewer.highlightFace('hover', hit.id, hit.faceIdx);
            UI.hint('<b>Zielfläche oder Bezugsebene wählen:</b> Klick auf die neue Fläche oder eine Bezugsebene. <b>Esc</b> bricht ab.');
            return;
          }
        }
        UI.toast('Klick zuerst auf die Körperfläche, die ersetzt werden soll.', { icon: 'info' });
        return;
      }
      const ref = pickReplaceRefAt(e.clientX, e.clientY, srcTgt.id, srcSig);
      if (ref) {
        stopPick();
        replaceFace(srcFace, ref, opts);
        return;
      }
      UI.toast('Klick auf eine andere Körperfläche oder eine Bezugsebene als Ziel.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(srcFace
      ? '<b>Zielfläche oder Bezugsebene wählen:</b> Klick auf die neue Fläche oder eine Bezugsebene. <b>Esc</b> bricht ab.'
      : '<b>Fläche ersetzen:</b> Klick zuerst auf die Fläche, die ersetzt werden soll. <b>Esc</b> bricht ab.');
    return true;
  }
  function pickReplaceTarget(stepId) {
    stopPick();
    const fStep = Model.find(App.doc, stepId);
    if (!fStep || fStep.item.kind !== 'replaceFace') return false;
    const sp = fStep.item.p || {};
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const ref = pickReplaceRefAt(e.clientX, e.clientY, sp.target, sp.face);
      if (ref) {
        stopPick();
        App.change(T('undo.replaceFaceTarget'), (doc) => {
          const fn = Model.find(doc, stepId); if (!fn) return false;
          fn.item.p = fn.item.p || {};
          fn.item.p.replace = ref;
        });
        UI.toast('Ziel für „Fläche ersetzen“ aktualisiert.', { icon: 'check' });
        return;
      }
      UI.toast('Klick auf eine andere Körperfläche oder eine Bezugsebene.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Zielfläche oder Bezugsebene wählen:</b> Klick auf eine Fläche oder Bezugsebene. <b>Esc</b> bricht ab.');
    return true;
  }
  function pickReplaceSourceFace(stepId) {
    stopPick();
    const fStep = Model.find(App.doc, stepId);
    if (!fStep || fStep.item.kind !== 'replaceFace') return false;
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        const sig = tgt && tgt.role !== 'hole' && fi ? deleteFaceSig({ id: hit.id, idx: hit.faceIdx, info: fi }) : null;
        if (sig) {
          stopPick();
          App.change(T('undo.replaceFaceSource'), (doc) => {
            const fn = Model.find(doc, stepId); if (!fn) return false;
            fn.item.p = fn.item.p || {};
            fn.item.p.target = tgt.id;
            fn.item.p.face = sig;
          });
          UI.toast('Ausgangsfläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Fläche des Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      Viewer.highlightFace('hover', hit && hit.faceIdx >= 0 ? hit.id : null, hit && hit.faceIdx >= 0 ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Fläche neu wählen:</b> Klick auf die zu ersetzende Fläche. <b>Esc</b> bricht ab.');
    return true;
  }
  function setReplaceDatum(stepId, datumId) {
    const dm = typeof Datums !== 'undefined' && datumId ? Datums.find(datumId) : null;
    if (!dm || !dm.plane) return false;
    App.change(T('undo.replaceFaceTarget'), (doc) => {
      const fn = Model.find(doc, stepId); if (!fn) return false;
      fn.item.p = fn.item.p || {};
      fn.item.p.replace = { kind: 'datum', datumId: dm.id, label: dm.name };
    });
    return true;
  }
  function renderReplaceFace(it, sec, setP) {
    const p = it.p || {};
    const rep = p.replace || {};
    const infoBox = h('div', { style: { display: 'grid', gap: '4px', marginBottom: '8px' } });
    infoBox.append(
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.replaceFace.sourceTitle')), h('b', null, faceTypeLabelDE(p.face && p.face.t))),
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.replaceFace.targetTitle')), h('b', { id: 'rf-target-lbl' }, rep.datumId ? ((typeof Datums !== 'undefined' && Datums.find(rep.datumId)?.name) || rep.label || 'Ebene') : (rep.label || '—')))
    );
    sec.append(infoBox);
    const fl = h('div', { class: 'fields' });
    const dms = (App.doc.datums || []).filter((d) => d && d.plane);
    if (dms.length) {
      const opts = [['', T('panel.replaceFace.datumNone')], ...dms.map((d) => [d.id, d.name || d.id])];
      fl.append(UI.selectField({
        id: 'rf-datum',
        label: T('panel.replaceFace.datum'),
        value: rep.datumId || '',
        options: opts,
        onChange: (v) => { if (v) setReplaceDatum(it.id, v); },
      }));
    }
    const flipWrap = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'rf-flip', checked: !!p.flip }), T('panel.replaceFace.flip'));
    flipWrap.querySelector('input').onchange = (e) => App.change(T('undo.replaceFaceFlip'), (doc) => {
      const fn = Model.find(doc, it.id); if (fn && fn.item.p) fn.item.p.flip = e.target.checked;
    });
    fl.append(flipWrap);
    sec.append(fl);
    const row = h('div', { class: 'btn-row' });
    const tb = h('button', { type: 'button', class: 'btn small primary', id: 'rf-pick-target' });
    tb.innerHTML = icon('replaceFace') + esc(T('panel.replaceFace.pickTarget'));
    tb.onclick = () => pickReplaceTarget(it.id);
    const pb = h('button', { type: 'button', class: 'btn small', id: 'rf-pick-face' });
    pb.innerHTML = icon('cursor') + esc(T('panel.replaceFace.pickFace'));
    pb.onclick = () => pickReplaceSourceFace(it.id);
    row.append(tb, pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'rf-goto' });
      gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.replaceFace.hint') }));
  }

  // ---------- Kante verschieben (DB-07) ----------
  function moveEdgeSig(edge) {
    if (!edge) return null;
    if (Array.isArray(edge.a) && Array.isArray(edge.b)) {
      const m = Array.isArray(edge.m) ? edge.m : [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2, (edge.a[2] + edge.b[2]) / 2];
      const l = edge.l != null ? edge.l : Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1], edge.b[2] - edge.a[2]);
      return {
        t: edge.t || 'LINE',
        a: edge.a.slice(0, 3).map((v) => round(v, 5)),
        b: edge.b.slice(0, 3).map((v) => round(v, 5)),
        m: m.slice(0, 3).map((v) => round(v, 5)),
        l: round(l, 5),
        ...(edge.tid ? { tid: edge.tid } : {}),
      };
    }
    const eidx = edge.edgeIdx != null ? edge.edgeIdx : edge.idx;
    if (!edge.id || eidx == null) return null;
    const rId = App.mergedInto(edge.id) || edge.id;
    const eg = edge.info || App.results.get(rId)?.data?.edges?.[eidx];
    if (!eg || !Array.isArray(eg.a) || !Array.isArray(eg.b)) return null;
    const m = Array.isArray(eg.m) ? eg.m : [(eg.a[0] + eg.b[0]) / 2, (eg.a[1] + eg.b[1]) / 2, (eg.a[2] + eg.b[2]) / 2];
    const l = eg.l != null ? eg.l : Math.hypot(eg.b[0] - eg.a[0], eg.b[1] - eg.a[1], eg.b[2] - eg.a[2]);
    return {
      t: eg.t || 'LINE',
      a: eg.a.slice(0, 3).map((v) => round(v, 5)),
      b: eg.b.slice(0, 3).map((v) => round(v, 5)),
      m: m.slice(0, 3).map((v) => round(v, 5)),
      l: round(l, 5),
      ...(eg.tid ? { tid: eg.tid } : {}),
    };
  }
  function moveEdge(edge = null, opts = {}) {
    if (App.ctx) { UI.toast('Kante verschieben gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    edge = edge || (App.edges && App.edges.length === 1 ? App.edges[0] : null);
    const tgt = edge ? resolveTopTarget(edge.id) : null;
    const sig = moveEdgeSig(edge);
    if (!tgt || tgt.role === 'hole' || !sig) {
      startMoveEdge(opts);
      return null;
    }
    if (sig.t && sig.t !== 'LINE') {
      UI.toast('Kante verschieben unterstützt gerade Kanten zwischen ebenen Flächen.', { icon: 'info' });
      return null;
    }
    const axis = ['bisector', 'x', 'y', 'z', 'n1', 'n2', 'free'].includes(opts.axis) ? opts.axis : 'bisector';
    const p = {
      target: tgt.id,
      edge: sig,
      axis,
      dist: opts.dist ?? 5,
      dx: opts.dx ?? 0,
      dy: opts.dy ?? 0,
      dz: opts.dz ?? 0,
    };
    let step;
    App.change(T('undo.moveEdge'), (doc) => {
      step = Model.newItem('moveEdge', p, { name: opts.name || T('kind.moveEdge'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('toast.moveEdgeAdded'), { icon: 'check' });
    }
    return step || null;
  }
  function startMoveEdge(opts = {}) {
    if (App.ctx) { UI.toast('Kante verschieben gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für „Kante verschieben“ braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    if (App.edges && App.edges.length === 1) {
      const ok = moveEdge(App.edges[0], opts);
      if (ok) return true;
    }
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 10 });
      if (hit && hit.edgeIdx != null) {
        const tgt = resolveTopTarget(hit.id);
        const eg = App.results.get(hit.id)?.data?.edges?.[hit.edgeIdx];
        if (tgt && tgt.role !== 'hole' && eg && eg.t === 'LINE') {
          stopPick();
          moveEdge({ id: hit.id, edgeIdx: hit.edgeIdx, info: eg }, opts);
          return;
        }
      }
      UI.toast('Bitte klick auf eine gerade Kante eines Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 10 });
      const ok = !!(hit && hit.edgeIdx != null && App.results.get(hit.id)?.data?.edges?.[hit.edgeIdx]?.t === 'LINE');
      Viewer.highlightEdge(ok ? hit.id : null, ok ? hit.edgeIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Kante verschieben:</b> Klick auf eine gerade Körperkante. <b>Esc</b> bricht ab.');
    return true;
  }
  function pickMoveEdge(stepId) {
    stopPick();
    const fStep = Model.find(App.doc, stepId);
    if (!fStep || fStep.item.kind !== 'moveEdge') return false;
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 10 });
      if (hit && hit.edgeIdx != null) {
        const tgt = resolveTopTarget(hit.id);
        const eg = App.results.get(hit.id)?.data?.edges?.[hit.edgeIdx];
        const sig = tgt && tgt.role !== 'hole' && eg && eg.t === 'LINE' ? moveEdgeSig({ id: hit.id, edgeIdx: hit.edgeIdx, info: eg }) : null;
        if (sig) {
          stopPick();
          App.change(T('undo.moveEdgePick'), (doc) => {
            const fn = Model.find(doc, stepId); if (!fn) return false;
            fn.item.p = fn.item.p || {};
            fn.item.p.target = tgt.id;
            fn.item.p.edge = sig;
          });
          UI.toast('Kante aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine gerade Körperkante.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 10 });
      const ok = !!(hit && hit.edgeIdx != null && App.results.get(hit.id)?.data?.edges?.[hit.edgeIdx]?.t === 'LINE');
      Viewer.highlightEdge(ok ? hit.id : null, ok ? hit.edgeIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Kante neu wählen:</b> Klick auf eine gerade Körperkante. <b>Esc</b> bricht ab.');
    return true;
  }
  function renderMoveEdge(it, sec, setP) {
    const p = it.p || {};
    const axis = ['bisector', 'x', 'y', 'z', 'n1', 'n2', 'free'].includes(p.axis) ? p.axis : 'bisector';
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'me-axis',
      label: T('panel.moveEdge.axis'),
      value: axis,
      options: [
        ['bisector', T('panel.moveEdge.axisBisector')],
        ['x', 'X'],
        ['y', 'Y'],
        ['z', 'Z'],
        ['n1', T('panel.moveEdge.axisN1')],
        ['n2', T('panel.moveEdge.axisN2')],
        ['free', T('panel.moveEdge.axisFree')],
      ],
      onChange: (v) => App.change(T('undo.moveEdgeAxis'), (doc) => {
        const fn = Model.find(doc, it.id); if (fn && fn.item.p) fn.item.p.axis = v;
      }),
    }));
    if (axis === 'free') {
      fl.append(
        UI.numField({ id: 'me-dx', label: 'X', value: p.dx ?? 0, unit: 'mm', onCommit: (v) => setP('dx', v) }),
        UI.numField({ id: 'me-dy', label: 'Y', value: p.dy ?? 0, unit: 'mm', onCommit: (v) => setP('dy', v) }),
        UI.numField({ id: 'me-dz', label: 'Z', value: p.dz ?? 0, unit: 'mm', onCommit: (v) => setP('dz', v) })
      );
    } else {
      fl.append(UI.numField({ id: 'me-dist', label: T('panel.moveEdge.dist'), value: p.dist ?? 5, unit: 'mm', onCommit: (v) => setP('dist', v) }));
    }
    sec.append(fl);
    const row = h('div', { class: 'btn-row' });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'me-pick' });
    pb.innerHTML = icon('cursor') + esc(T('panel.moveEdge.pickEdge'));
    pb.onclick = () => pickMoveEdge(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'me-goto' });
      gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: T('panel.moveEdge.hint') }));
  }
  // ---------- Schritt spiegeln (KP-14) ----------
  function canMirrorStep(it, parent) {
    if (!it) return false;
    if (it.op && it.op.target) return true;
    if (it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'mountPattern' || it.kind === 'portCutout' || it.kind === 'magnetPocket' || it.kind === 'web' || it.kind === 'dome') return true;
    if (it.kind === 'wrap' && (!it.p || it.p.mode !== 'line')) return true;
    if (it.kind === 'emboss') return true;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return true;
    if (it.kind === 'mirrorStep') return true;
    if (it.role === 'hole') return true;
    if (parent && !isOp(parent) && it.kind !== 'group') return true;
    return false;
  }
  function mirrorCandidatesBefore(stepItem) {
    const f = Model.find(App.doc, stepItem.id);
    if (!f) return [];
    const idx = f.list.indexOf(f.item);
    if (idx < 0) return [];
    return f.list.slice(0, idx).filter((x) => !x.suppressed && canMirrorStep(x, f.parent));
  }
  function resolveMirrorFace(face) {
    if (!face || !face.id) return null;
    const idx = face.idx != null ? face.idx : face.faceIdx;
    const info = face.info || (idx != null && idx >= 0 ? App.results.get(face.id)?.data?.faces?.[idx] : null);
    if (!info || info.t !== 'PLANE' || !Array.isArray(info.n) || !Array.isArray(info.c)) return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const mo = new THREE.Vector3(...info.c).applyMatrix4(W).toArray().map((v) => round(v, 6));
    const mn = new THREE.Vector3(...info.n).transformDirection(W).normalize().toArray().map((v) => round(v, 9));
    const tgt = Model.find(App.doc, face.id);
    return {
      mo,
      mn,
      faceRef: {
        id: face.id,
        idx,
        c: info.c.map((v) => round(v, 6)),
        n: info.n.map((v) => round(v, 6)),
        name: tgt ? Model.label(tgt.item) : 'Fläche',
      },
    };
  }
  function mirrorStep(idsOrTarget, opts = {}) {
    const rawIds = Array.isArray(idsOrTarget) ? idsOrTarget : (idsOrTarget ? [idsOrTarget] : App.sel);
    const found = rawIds.map((id) => Model.find(App.doc, id)).filter(Boolean);
    let picked = found.length && found.every((f) => f.list === found[0].list)
      ? found.filter((f) => canMirrorStep(f.item, f.parent))
      : [];
    // Komfort-Fallback: Ist ein Zielkörper gewählt, seinen letzten aktiven Formschritt nehmen
    if (!picked.length && found.length === 1 && !found[0].parent && found[0].item.role !== 'hole') {
      const bid = found[0].item.id;
      const cand = App.doc.items.filter((x) => !x.suppressed && (
        (x.op && x.op.target === bid) ||
        ((x.kind === 'rib' || x.kind === 'vent' || x.kind === 'fins' || x.kind === 'fillPattern' || x.kind === 'mountPattern' || x.kind === 'portCutout' || x.kind === 'magnetPocket' || x.kind === 'web' || x.kind === 'dome' || (x.kind === 'wrap' && (!x.p || x.p.mode !== 'line')) || x.kind === 'emboss' || (x.kind === 'thicken' && !(x.p && x.p.mode === 'new'))) && x.p && x.p.target === bid)
      ));
      if (cand.length) picked = [{ item: cand[cand.length - 1], parent: null, list: App.doc.items }];
    }
    if (!picked.length) {
      UI.toast('Wähle zuerst einen Formschritt im Verlauf (z. B. eine Tasche, Erhöhung, Rippe oder ein Loch).', { icon: 'info' });
      return null;
    }
    const parent = picked[0].parent;
    const p = {
      features: picked.map((f) => f.item.id),
      plane: opts.plane || (opts.datumId ? 'DATUM' : opts.face ? 'FACE' : 'YZ'),
      off: opts.off ?? 0,
    };
    if (p.plane === 'DATUM') {
      p.datumId = opts.datumId || null;
    } else if (p.plane === 'FACE') {
      const rf = resolveMirrorFace(opts.face);
      if (!rf) { UI.toast('Bitte wähle eine ebene Körperfläche als Spiegelebene.', { icon: 'info' }); return null; }
      p.mo = rf.mo; p.mn = rf.mn; p.faceRef = rf.faceRef;
    }
    let step;
    App.change('Schritt spiegeln angelegt', (doc) => {
      const list = parent ? Model.find(doc, parent.id).item.children : doc.items;
      const lastIdx = Math.max(...p.features.map((fid) => list.findIndex((x) => x.id === fid)));
      step = Model.newItem('mirrorStep', p, {
        name: opts.name || 'Schritt spiegeln',
        color: picked[0].item.color,
        role: picked[0].item.role,
      });
      if (parent) {
        const par = Model.find(doc, parent.id).item;
        const at = clamp(lastIdx + 1, 0, list.length);
        list.splice(at, 0, step);
        if (par.rollback != null && at <= par.rollback) par.rollback++;
      } else {
        insertAtMarker(doc, step);
      }
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Formschritt gespiegelt. Rechts wählst du Spiegelebene, Fläche oder weitere Schritte.', { icon: 'check' });
    }
    return step || null;
  }
  function setMirrorStepPlane(stepId, spec) {
    const f = Model.find(App.doc, stepId);
    if (!f || f.item.kind !== 'mirrorStep' || !spec) return false;
    if (spec.datumId) {
      const dm = typeof Datums !== 'undefined' ? Datums.find(spec.datumId) : null;
      if (!dm || !dm.plane) return false;
      App.change(`Spiegelebene „${dm.name}“`, (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = 'DATUM';
        T.p.datumId = dm.id;
        delete T.p.faceRef; delete T.p.mo; delete T.p.mn;
      });
      return true;
    }
    if (spec.id) {
      const rf = resolveMirrorFace(spec);
      if (!rf) return false;
      App.change('Spiegelfläche gewählt', (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = 'FACE';
        T.p.mo = rf.mo; T.p.mn = rf.mn; T.p.faceRef = rf.faceRef;
        delete T.p.datumId;
      });
      return true;
    }
    if (['XY', 'XZ', 'YZ'].includes(spec.plane)) {
      App.change('Spiegelebene geändert', (doc) => {
        const T = Model.find(doc, stepId)?.item; if (!T) return false;
        T.p.plane = spec.plane;
        if (spec.off !== undefined) T.p.off = spec.off;
        delete T.p.datumId; delete T.p.faceRef; delete T.p.mo; delete T.p.mn;
      });
      return true;
    }
    return false;
  }
  function pickMirrorStepPlane(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE' && fi.n) {
          stopPick();
          setMirrorStepPlane(stepId, { id: hit.id, idx: hit.faceIdx, info: fi });
          UI.toast('Ebene Körperfläche als Spiegelebene gesetzt.', { icon: 'check' });
          return;
        }
      }
      const dp = pickDatumPlaneAt(e.clientX, e.clientY);
      if (dp) {
        stopPick();
        setMirrorStepPlane(stepId, { datumId: dp.datum.id });
        UI.toast(`Bezugsebene „${dp.datum.name}“ als Spiegelebene gesetzt.`, { icon: 'check' });
        return;
      }
      UI.toast('Bitte wähle eine ebene Körperfläche oder eine Bezugsebene.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Spiegelebene wählen:</b> Klick auf eine ebene Körperfläche oder eine Bezugsebene. <b>Esc</b> bricht ab.');
  }
  let mirrorRelinkRounds = 0;
  function relinkMirrorStepFaces() {
    if (!App.doc) return;
    const vDiff = (a, b) => (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const r6 = (a) => a.map((v) => round(v, 6));
    const r9 = (a) => a.map((v) => round(v, 9));
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'mirrorStep' || !it.p || it.p.plane !== 'FACE' || !it.p.faceRef) return;
      const fr = it.p.faceRef;
      if (fr.frozen) return;
      const rId = App.results.has(fr.id) ? fr.id : (App.mergedInto(fr.id) || fr.id);
      const r = App.results.get(rId), tgt = Model.find(App.doc, fr.id);
      if (r && r.data && tgt) {
        const nRef = new THREE.Vector3(...(fr.n || [0, 0, 1])), cRef = new THREE.Vector3(...(fr.c || [0, 0, 0]));
        let best = null;
        for (const fc of r.data.faces || []) {
          if (fc.t !== 'PLANE' || !fc.n) continue;
          if (new THREE.Vector3(...fc.n).dot(nRef) < 0.999) continue;
          const dd = new THREE.Vector3(...fc.c).distanceTo(cRef);
          if (!best || dd < best.dd) best = { fc, dd };
        }
        if (best) {
          const W = Model.worldMatrix(App.doc, rId);
          const moW = r6(new THREE.Vector3(...best.fc.c).applyMatrix4(W).toArray());
          const mnW = r9(new THREE.Vector3(...best.fc.n).transformDirection(W).normalize().toArray());
          const nm = Model.label(tgt.item);
          if (vDiff(moW, it.p.mo) > 1e-5 || vDiff(mnW, it.p.mn) > 1e-5 || fr.lost || fr.name !== nm) {
            jobs.push({ id: it.id, mo: moW, mn: mnW, c: r6(best.fc.c), n: r6(best.fc.n), name: nm, lost: false });
          }
        } else if (!fr.lost) jobs.push({ id: it.id, lost: true });
      } else if (!tgt && !fr.lost) jobs.push({ id: it.id, lost: true });
    });
    if (!jobs.length) { mirrorRelinkRounds = 0; return; }
    if (++mirrorRelinkRounds > 3) { mirrorRelinkRounds = 0; return; }
    App.change('Spiegelfläche nachgeführt', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id); if (!f || !f.item.p || !f.item.p.faceRef) continue;
        const p = f.item.p;
        if (j.lost) p.faceRef.lost = true;
        else {
          delete p.faceRef.lost;
          p.mo = j.mo; p.mn = j.mn;
          p.faceRef.c = j.c; p.faceRef.n = j.n;
          if (j.name) p.faceRef.name = j.name;
        }
      }
    }, { amend: true });
  }
  App.on('results', relinkMirrorStepFaces);
  function renderMirrorStep(it, sec, setP) {
    const p = it.p || {};
    const pl = p.plane || 'YZ';
    const datums = typeof Datums !== 'undefined' ? Datums.list().filter((d) => d.plane) : [];
    const curVal = pl === 'DATUM' ? ('d:' + (p.datumId || '')) : pl === 'FACE' ? 'FACE' : (['XY', 'XZ', 'YZ'].includes(pl) ? pl : 'YZ');
    const opts = [
      ['YZ', 'Links ↔ rechts (YZ)'],
      ['XZ', 'Vorne ↔ hinten (XZ)'],
      ['XY', 'Oben ↔ unten (XY)'],
      ...datums.map((d) => ['d:' + d.id, `Bezugsebene „${d.name}“`]),
    ];
    if (pl === 'DATUM' && p.datumId && !datums.some((d) => d.id === p.datumId)) {
      opts.push(['d:' + p.datumId, 'Bezugsebene (fehlt)']);
    }
    if (pl === 'FACE') {
      const fnm = p.faceRef && p.faceRef.name ? `Fläche an „${p.faceRef.name}“` : 'Gewählte Fläche';
      opts.push(['FACE', fnm]);
    }
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'ms-plane',
      label: 'Spiegelebene',
      value: curVal,
      options: opts,
      onChange: (v) => {
        if (v.startsWith('d:')) setMirrorStepPlane(it.id, { datumId: v.slice(2) });
        else if (v !== 'FACE') setMirrorStepPlane(it.id, { plane: v });
      },
    }));
    if (pl !== 'DATUM' && pl !== 'FACE') {
      fl.append(UI.numField({ id: 'ms-off', label: 'Lage der Ebene', value: p.off ?? 0, unit: 'mm', onCommit: (v) => setP('off', v) }));
    }
    sec.append(fl);
    if (pl === 'FACE') {
      const oTxt = Array.isArray(p.mo) ? p.mo.map((v) => fmt(v, 1)).join(' · ') : '–';
      const nTxt = Array.isArray(p.mn) ? p.mn.map((v) => fmt(v, 2)).join(' · ') : '–';
      const lbl = p.faceRef && p.faceRef.lost ? 'Spiegelfläche fehlt' : (p.faceRef && p.faceRef.name ? `Fläche an „${p.faceRef.name}“` : 'Gewählte Fläche');
      sec.append(h('div', { class: 'mini-row', id: 'ms-planeinfo' }, h('span', { class: 'grow' }, lbl), h('b', { class: 'mono' }, `${oTxt} (n ${nTxt})`)));
    }
    const pb = h('button', { type: 'button', class: 'btn small', id: 'ms-pick' });
    pb.innerHTML = icon('cursor') + 'Ebene oder Fläche im Bild wählen';
    pb.onclick = () => pickMirrorStepPlane(it.id);
    sec.append(h('div', { class: 'btn-row' }, pb));

    const cands = mirrorCandidatesBefore(it);
    const chosen = new Set(Array.isArray(p.features) ? p.features : []);
    const fsec = h('div', { class: 'field', id: 'ms-features', style: { marginTop: '8px' } }, h('label', null, 'Gespiegelte Schritte'));
    if (cands.length) {
      for (const c of cands) {
        const chk = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: chosen.has(c.id), dataset: { fid: c.id } }), Model.label(c));
        chk.querySelector('input').onchange = (e) => {
          const next = new Set(chosen);
          if (e.target.checked) next.add(c.id);
          else {
            if (next.size <= 1) {
              e.target.checked = true;
              UI.toast('Mindestens ein Schritt muss gewählt bleiben.', { icon: 'info' });
              return;
            }
            next.delete(c.id);
          }
          App.change('Gespiegelte Schritte geändert', (doc) => {
            const T = Model.find(doc, it.id)?.item; if (!T) return false;
            T.p.features = cands.filter((x) => next.has(x.id)).map((x) => x.id);
          });
        };
        fsec.append(chk);
      }
    } else {
      fsec.append(h('div', { class: 'hint-box warn' }, 'Vor diesem Schritt liegt kein spiegelbarer Formschritt.'));
    }
    sec.append(fsec);

    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const firstFid = (p.features || []).find((fid) => Model.find(App.doc, fid));
    if (firstFid) {
      const fb = h('button', { type: 'button', class: 'btn small', id: 'ms-goto-feat' });
      fb.innerHTML = icon('pointer') + 'Original-Schritt wählen';
      fb.onclick = () => App.select([firstFid]);
      row.append(fb);
    }
    const merged = App.mergedInto(it.id);
    if (merged && Model.find(App.doc, merged)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'ms-goto-body' });
      gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([merged]);
      row.append(gb);
    }
    if (row.children.length) sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Spiegelt nur die gewählten Formschritte (z. B. eine Tasche, Erhöhung oder Rippe) direkt im selben Körper. Änderst du das Original, wandert das Spiegelbild automatisch mit.' }));
  }
  // ---------- Wickeln um Zylinder (KP-34) ----------
  function findCylFaceOnItem(id, faceIdx = null) {
    const rId = App.mergedInto(id) || id;
    const faces = App.results.get(rId)?.data?.faces || [];
    if (faceIdx != null && faceIdx >= 0 && faces[faceIdx] && faces[faceIdx].t === 'CYLINDRE') {
      return { rId, faceIdx, info: faces[faceIdx] };
    }
    const idx = faces.findIndex((f) => f && f.t === 'CYLINDRE' && Array.isArray(f.axis) && f.axis.length >= 6);
    if (idx >= 0) return { rId, faceIdx: idx, info: faces[idx] };
    return null;
  }
  function cylTargets(idx = Infinity) {
    return App.doc.items.slice(0, idx).filter((x) => {
      if (x.role === 'hole' || x.suppressed || isModifierStep(x) || (x.op && x.op.target)) return false;
      return !!findCylFaceOnItem(x.id);
    });
  }
  function wrapTangentPlane(targetId, faceInfo, pickPointWorld = null) {
    const rId = App.mergedInto(targetId) || targetId;
    const W = Model.worldMatrix(App.doc, rId);
    const WInv = W.clone().invert();
    const ax = Array.isArray(faceInfo.axis) && faceInfo.axis.length >= 6 ? faceInfo.axis : [0, 0, 0, 0, 0, 1];
    const OLoc = new THREE.Vector3(ax[0], ax[1], ax[2]);
    const ALoc = new THREE.Vector3(ax[3], ax[4], ax[5]).normalize();
    if (Math.abs(ALoc.z) > 0.001 ? ALoc.z < 0 : Math.abs(ALoc.y) > 0.001 ? ALoc.y < 0 : ALoc.x < 0) ALoc.negate();
    let refLoc = null;
    if (pickPointWorld) {
      const pw = Array.isArray(pickPointWorld) ? new THREE.Vector3(...pickPointWorld) : new THREE.Vector3(pickPointWorld.x, pickPointWorld.y, pickPointWorld.z);
      const pLoc = pw.applyMatrix4(WInv).sub(OLoc);
      pLoc.addScaledVector(ALoc, -pLoc.dot(ALoc));
      if (pLoc.length() > 1e-4) refLoc = pLoc.normalize();
    }
    if (!refLoc) {
      const cand = Math.abs(ALoc.z) > 0.9 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
      cand.addScaledVector(ALoc, -cand.dot(ALoc));
      if (cand.length() < 1e-4) cand.set(Math.abs(ALoc.y) < 0.9 ? 0 : 1, Math.abs(ALoc.y) < 0.9 ? -1 : 0, 0).addScaledVector(ALoc, -ALoc.dot(cand));
      refLoc = cand.normalize();
    }
    const T0Loc = new THREE.Vector3().crossVectors(ALoc, refLoc).normalize();
    const cLoc = Array.isArray(faceInfo.c) ? new THREE.Vector3(...faceInfo.c) : OLoc.clone();
    const vMid = cLoc.clone().sub(OLoc).dot(ALoc);
    const r = typeof faceInfo.r === 'number' && faceInfo.r > 0 ? faceInfo.r : 10;
    const pSurfLoc = OLoc.clone().addScaledVector(ALoc, vMid).addScaledVector(refLoc, r);
    const oW = pSurfLoc.applyMatrix4(W);
    const xW = T0Loc.clone().transformDirection(W).normalize();
    const nW = refLoc.clone().transformDirection(W).normalize();
    const r6 = (a) => a.map((v) => round(v, 6));
    const faceSpec = {
      t: 'CYLINDRE',
      r: round(r, 6),
      c: r6(faceInfo.c || cLoc.toArray()),
      axis: ax.map((v) => round(v, 6)),
      refDir: r6(refLoc.toArray()),
    };
    const plane = { o: r6(oW.toArray()), x: r6(xW.toArray()), n: r6(nW.toArray()) };
    return { plane, faceSpec };
  }
  function startWrap(face = null) {
    if (App.ctx) { UI.toast('Wickeln gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    const f = face && face.info && face.info.t === 'CYLINDRE' ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'CYLINDRE') {
      const tgt = resolveTopTarget(f.id);
      if (!tgt || tgt.role === 'hole') { UI.toast('Klick eine äußere oder innere Zylinderfläche eines Körpers an.', { icon: 'info' }); return false; }
      const { plane, faceSpec } = wrapTangentPlane(tgt.id, f.info, f.point || null);
      Sketch.startOnPlaneObj(plane, { wrapCtx: { target: tgt.id, face: faceSpec, r: f.info.r } });
      UI.toast('Zeichne die Form zum Wickeln um den Zylinder und klick „Fertig“.', { icon: 'info', ms: 4200 });
      return true;
    }
    const selTgt = App.sel.length === 1 ? resolveTopTarget(App.sel[0]) : null;
    const cyls = cylTargets();
    if (!cyls.length) { UI.toast('Für „Wickeln“ braucht es zuerst einen Körper mit einer Zylinderfläche.', { icon: 'info' }); return false; }
    if (selTgt && selTgt.role !== 'hole') {
      const cf = findCylFaceOnItem(selTgt.id);
      if (cf) {
        const { plane, faceSpec } = wrapTangentPlane(selTgt.id, cf.info, null);
        Sketch.startOnPlaneObj(plane, { wrapCtx: { target: selTgt.id, face: faceSpec, r: cf.info.r } });
        UI.toast('Zeichne die Form zum Wickeln um den Zylinder und klick „Fertig“.', { icon: 'info', ms: 4200 });
        return true;
      }
    }
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      const tgt = hit ? resolveTopTarget(hit.id) : null;
      if (fi && fi.t === 'CYLINDRE' && tgt && tgt.role !== 'hole') {
        stopPick();
        const { plane, faceSpec } = wrapTangentPlane(tgt.id, fi, hit.point || null);
        Sketch.startOnPlaneObj(plane, { wrapCtx: { target: tgt.id, face: faceSpec, r: fi.r } });
        UI.toast('Zeichne die Form zum Wickeln um den Zylinder und klick „Fertig“.', { icon: 'info', ms: 4200 });
        return;
      }
      UI.toast('Bitte klick auf eine runde Zylinderfläche.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'CYLINDRE' ? hit.id : null, fi && fi.t === 'CYLINDRE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Zylinderfläche wählen:</b> Klick auf die runde Fläche, um die gewickelt werden soll. <b>Esc</b> bricht ab.');
    return true;
  }
  function createWrap(opts = {}) {
    if (App.ctx) { UI.toast('Wickeln gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const tgt = opts.target ? resolveTopTarget(opts.target) : (resolveTopTarget(App.sel[0]) || cylTargets()[0] || null);
    if (!tgt || tgt.role === 'hole') { UI.toast('Kein Zielkörper mit Zylinderfläche gefunden.', { icon: 'info' }); return null; }
    let faceSpec = opts.face || null;
    if (!faceSpec) {
      const cf = findCylFaceOnItem(tgt.id);
      if (!cf) { UI.toast('Der gewählte Körper hat keine Zylinderfläche.', { icon: 'info' }); return null; }
      faceSpec = wrapTangentPlane(tgt.id, cf.info, null).faceSpec;
    }
    const p = {
      target: tgt.id,
      face: faceSpec,
      sketch: opts.sketch,
      mode: opts.mode === 'deboss' || opts.mode === 'line' ? opts.mode : 'emboss',
      depth: opts.depth ?? 2,
      angle: opts.angle ?? 0,
      shiftY: opts.shiftY ?? 0,
      rot: opts.rot ?? 0,
      flip: !!opts.flip,
    };
    let step;
    App.change('Wickeln angelegt', (doc) => {
      step = Model.newItem('wrap', p, { name: opts.name || 'Wickeln', color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) App.select([step.id]);
    return step || null;
  }
  function pickWrapFace(stepId) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && fi.t === 'CYLINDRE') {
          stopPick();
          const { faceSpec } = wrapTangentPlane(tgt.id, fi, hit.point || null);
          App.change('Zylinderfläche für Wickeln gewählt', (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = faceSpec;
          });
          UI.toast('Zylinderfläche aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine Zylinderfläche eines Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'CYLINDRE' ? hit.id : null, fi && fi.t === 'CYLINDRE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Zylinderfläche wählen:</b> Klick auf die gewünschte Zylinderfläche. <b>Esc</b> bricht ab.');
  }
  function sweepFromWrap(wrapId, opts = {}) {
    const wf = Model.find(App.doc, wrapId);
    if (!wf || wf.item.kind !== 'wrap') { UI.toast('Wähle zuerst einen Wickel-Schritt im Modus „Linie“.', { icon: 'info' }); return null; }
    if (!wf.item.p || wf.item.p.mode !== 'line') { UI.toast('Für „Entlang Pfad“ muss der Wickel-Schritt im Modus „Linie für weitere Schritte“ stehen.', { icon: 'info' }); return null; }
    let step;
    App.change('Entlang gewickelter Linie gezogen', (doc) => {
      const idx = doc.items.findIndex((x) => x.id === wrapId);
      const tgt = Model.find(doc, wf.item.p.target);
      const p = {
        wrapId,
        shape: opts.shape || 'circle',
        d: opts.d ?? 2,
        w: opts.w ?? 3,
        h: opts.h ?? 2,
        wall: opts.wall ?? 0,
      };
      step = Model.newItem('sweep', p, { name: opts.name || 'Entlang Pfad (Wickeln)', color: tgt ? tgt.item.color : wf.item.color });
      if (opts.op) step.op = { ...opts.op };
      const at = idx >= 0 ? idx + 1 : doc.items.length;
      doc.items.splice(at, 0, step);
      if (doc.rollback != null && at <= doc.rollback) doc.rollback++;
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Querschnitt entlang der gewickelten Linie gezogen. Form und Größe stellst du rechts ein.', { icon: 'check' });
    }
    return step || null;
  }
  function sweepFromSketch3d(sketch3dId, opts = {}) {
    const sf = Model.find(App.doc, sketch3dId);
    if (!sf || sf.item.kind !== 'sketch3d') { UI.toast(T('sk3.toast.needSketch3d'), { icon: 'info' }); return null; }
    const V = Model.vars(App.doc).v;
    const ch = Model.sketch3dChains(sf.item.p && sf.item.p.sketch3d, V);
    if (!ch.length) { UI.toast(T('sk3.toast.needPath'), { icon: 'info' }); return null; }
    let step;
    App.change('Entlang 3D-Skizze gezogen', (doc) => {
      const idx = doc.items.findIndex((x) => x.id === sketch3dId);
      const p = {
        sketch3dId,
        shape: opts.shape || 'circle',
        d: opts.d ?? 6,
        w: opts.w ?? 6,
        h: opts.h ?? 4,
        wall: opts.wall ?? 0,
        twist: opts.twist ?? 0,
        ...(opts.prof ? { prof: deepClone(opts.prof), profName: opts.profName || '' } : {}),
      };
      step = Model.newItem('sweep', p, { name: opts.name || T('sk3.sweepName'), color: sf.item.color });
      if (opts.op) step.op = { ...opts.op };
      const at = idx >= 0 ? idx + 1 : doc.items.length;
      doc.items.splice(at, 0, step);
      if (doc.rollback != null && at <= doc.rollback) doc.rollback++;
    });
    if (step) {
      App.select([step.id]);
      UI.toast(T('sk3.toast.sweepOk'), { icon: 'check' });
    }
    return step || null;
  }
  function renderSketch3d(it, sec) {
    const V = Model.vars(App.doc).v;
    const res = Model.sketch3dResolve(it.p && it.p.sketch3d, V);
    const ents = res.ents || [];
    const nl = ents.filter((e) => !e.con && e.type === 'line').length;
    const na = ents.filter((e) => !e.con && e.type === 'arc').length;
    sec.append(h('div', { class: 'mini-row', id: 'sk3-prop-total' },
      h('span', { class: 'grow' }, `${nl} ${nl === 1 ? T('sk3.oneLine') : T('sk3.manyLines')} · ${na} ${na === 1 ? T('sk3.oneArc') : T('sk3.manyArcs')}`),
      h('b', { class: 'mono' }, Units.fmtLenU(res.totalLength, 2))));
    if (ents.length) {
      const lst = h('div', { class: 'mini-list', id: 'sk3-prop-list', style: { marginTop: '6px' } });
      ents.forEach((e, i) => {
        const hasDim = (res.dims || []).some((d) => d.e === e.id && d.k === 'len');
        lst.append(h('div', { class: 'mini-row' },
          h('span', { class: 'grow' }, `${i + 1}. ${e.type === 'arc' ? T('sk3.arc') : T('sk3.line')}${e.con ? ' (' + T('sk3.conShort') + ')' : ''}`),
          h('b', { class: 'mono' }, (hasDim ? '🔒 ' : '') + Units.fmtLenU(e.length || 0, 2))));
      });
      sec.append(lst);
    }
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'sk3-edit-btn' });
    eb.innerHTML = icon('edit') + esc(T('sk3.editBtn'));
    eb.onclick = () => Sketch.edit3d(it.id);
    const sb = h('button', { type: 'button', class: 'btn primary', id: 'sk3-to-sweep', disabled: !ents.some((e) => !e.con) });
    sb.innerHTML = icon('sweep') + esc(T('ctx.alongPath'));
    sb.onclick = () => sweepFromSketch3d(it.id);
    row.append(eb, sb);
    sec.append(row, h('div', { class: 'hint-box', html: T('sk3.propHint') }));
  }
  let relink3dRounds = 0;
  function relinkSketch3d() {
    if (!App.doc || (typeof Sketch !== 'undefined' && Sketch.active3d)) return;
    const jobs = [];
    Model.walk(App.doc.items, (it) => {
      if (it.kind !== 'sketch3d' || !it.p || !it.p.sketch3d || !Array.isArray(it.p.sketch3d.ents)) return;
      const WI = Model.worldMatrix(App.doc, it.id).invert();
      it.p.sketch3d.ents.forEach((e, i) => {
        for (const [bk, pk] of [['bindA', 'a'], ['bindM', 'm'], ['bindB', 'b']]) {
          const b = e[bk];
          if (!b || b.frozen || !b.id || !e[pk]) continue;
          if (!Model.find(App.doc, b.id)) { jobs.push({ id: it.id, i, bk, drop: true }); continue; }
          const w = new THREE.Vector3(...b.lp).applyMatrix4(Model.worldMatrix(App.doc, b.id)).applyMatrix4(WI);
          const cur = e[pk];
          if ([0, 1, 2].some((k) => !(typeof cur[k] === 'number' && Math.abs(cur[k] - w.getComponent(k)) < 1e-3))) {
            jobs.push({ id: it.id, i, pk, p: w.toArray().map((v) => round(v, 4)) });
          }
        }
      });
    });
    if (!jobs.length) { relink3dRounds = 0; return; }
    if (++relink3dRounds > 3) { relink3dRounds = 0; return; }
    App.change('3D-Skizze folgt Körper', (doc) => {
      for (const j of jobs) {
        const f = Model.find(doc, j.id);
        const ents = f && f.item.p && f.item.p.sketch3d && f.item.p.sketch3d.ents;
        if (!ents || !ents[j.i]) continue;
        if (j.drop) delete ents[j.i][j.bk];
        else ents[j.i][j.pk] = j.p;
      }
    }, { amend: true });
  }
  App.on('results', relinkSketch3d);
  function renderWrap(it, sec, setP) {
    const p = it.p || {};
    const V = Model.vars(App.doc).v;
    const idx = App.doc.items.indexOf(it);
    const targets = cylTargets(idx >= 0 ? idx : App.doc.items.length);
    const opts = targets.map((x) => [x.id, Model.label(x)]);
    if (p.target && !targets.some((x) => x.id === p.target)) {
      const f = Model.find(App.doc, p.target);
      opts.unshift([p.target, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
    }
    const mode = p.mode === 'deboss' || p.mode === 'line' ? p.mode : 'emboss';
    const fl = h('div', { class: 'fields' });
    if (opts.length) {
      fl.append(UI.selectField({
        id: 'wrap-target', label: 'Zielkörper', value: p.target || '', options: opts,
        onChange: (v) => App.change('Zielkörper gewählt', (doc) => {
          const item = Model.find(doc, it.id).item;
          item.p.target = v;
          const cf = findCylFaceOnItem(v);
          if (cf) item.p.face = wrapTangentPlane(v, cf.info, null).faceSpec;
        }),
      }));
    }
    fl.append(UI.selectField({
      id: 'wrap-mode', label: 'Art', value: mode,
      options: [['emboss', 'Prägung erhaben (+)'], ['deboss', 'Prägung vertieft (−)'], ['line', 'Linie für weitere Schritte']],
      onChange: (v) => App.change('Wickel-Art geändert', (doc) => { Model.find(doc, it.id).item.p.mode = v; }),
    }));
    if (mode !== 'line') {
      fl.append(UI.numField({ id: 'wrap-depth', label: mode === 'deboss' ? 'Tiefe' : 'Höhe', value: p.depth ?? 2, min: 0.05, unit: 'mm', onCommit: (v) => setP('depth', v) }));
    }
    fl.append(UI.numField({ id: 'wrap-angle', label: 'Startwinkel', value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }));
    fl.append(UI.numField({ id: 'wrap-shift', label: 'Axial verschieben', value: p.shiftY ?? 0, unit: 'mm', onCommit: (v) => setP('shiftY', v) }));
    fl.append(UI.numField({ id: 'wrap-rot', label: 'Skizze drehen', value: p.rot ?? 0, unit: '°', onCommit: (v) => setP('rot', v) }));
    sec.append(fl);
    const flp = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'wrap-flip', checked: !!p.flip }), 'Spiegeln');
    flp.querySelector('input').onchange = (e) => App.change('Wickeln gespiegelt', (doc) => { Model.find(doc, it.id).item.p.flip = e.target.checked; });
    sec.append(flp);

    const aInfo = Model.wrapAngleInfo ? Model.wrapAngleInfo(it, V) : null;
    if (aInfo) {
      sec.append(h('div', { class: 'mini-row', id: 'wrap-angle-info' },
        h('span', { class: 'grow' }, `Umfangswinkel (Ø ${Units.fmtLenU(aInfo.radius * 2, 1)})`),
        h('b', { class: 'mono' }, `${fmtAngleU(aInfo.deg)} (${fmtFixed(aInfo.pct, 1)} %)`)));
    }

    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const eb = h('button', { type: 'button', class: 'btn', id: 'wrap-edit-sketch' }); eb.innerHTML = icon('edit') + 'Skizze bearbeiten';
    eb.onclick = () => Sketch.editItem(it.id);
    row.append(eb);
    const pb = h('button', { type: 'button', class: 'btn small', id: 'wrap-pick-face' }); pb.innerHTML = icon('cursor') + 'Andere Zylinderfläche';
    pb.onclick = () => pickWrapFace(it.id);
    row.append(pb);
    if (mode === 'line') {
      const sb = h('button', { type: 'button', class: 'btn small primary', id: 'wrap-to-sweep' }); sb.innerHTML = icon('sweep') + 'Entlang Pfad ziehen';
      sb.onclick = () => sweepFromWrap(it.id);
      row.append(sb);
    }
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'wrap-goto' }); gb.innerHTML = icon('pointer') + 'Zielkörper wählen';
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row);
    sec.append(h('div', { class: 'hint-box', html: 'Legt die ebene Skizze exakt nach Bogenlänge (ohne Verzerrung) um den Zylinder – erhaben, vertieft oder als Linie für weitere Schritte.' }));
  }

  // ---------- Feder & Spirale (KP-32) ----------
  function helixSpot(halfR) {
    let [x, y] = Actions.viewCenter();
    const boxes = [];
    for (const n of Viewer.nodes.values()) {
      if (n.role !== 'hole' && n.obj.visible && n.mesh && n.mesh.geometry && n.mesh.geometry.boundingBox) {
        boxes.push(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
      }
    }
    if (!boxes.length) return [x, y];
    const hits = (px) => boxes.some((b) => px - halfR < b.max.x + 1 && px + halfR > b.min.x - 1 && y - halfR < b.max.y + 1 && y + halfR > b.min.y - 1);
    if (!hits(x)) return [x, y];
    let right = -Infinity;
    for (const b of boxes) if (y - halfR < b.max.y + 1 && y + halfR > b.min.y - 1) right = Math.max(right, b.max.x);
    return [Math.ceil((right + 6 + halfR) / 5) * 5, y];
  }
  function helix(opts = {}) {
    const form = opts.form === 'cone' || opts.form === 'spiral' ? opts.form : 'cyl';
    const base = form === 'cone'
      ? { form: 'cone', by: 'pitchTurns', d: 20, r1: 10, r2: 5, pitch: 5, turns: 5, height: 25, dir: 'right', startAngle: 0, shape: 'circle', wireD: 2, profW: 2, profH: 2, wall: 0 }
      : form === 'spiral'
        ? { form: 'spiral', by: 'pitchTurns', d: 20, r1: 5, r2: 25, pitch: 0, turns: 3, height: 0, dir: 'right', startAngle: 0, shape: 'circle', wireD: 2, profW: 2, profH: 2, wall: 0 }
        : { form: 'cyl', by: 'pitchTurns', d: 20, r1: 10, r2: 5, pitch: 5, turns: 5, height: 25, dir: 'right', startAngle: 0, shape: 'circle', wireD: 2, profW: 2, profH: 2, wall: 0 };
    const p = { ...base, ...(opts.p || {}) };
    const name = opts.name || (form === 'cone' ? T('helix.nameCone') : form === 'spiral' ? T('helix.nameSpiral') : T('helix.nameCyl'));
    if (!App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) App.fitAfterBuild();
    const m = Model.helixMetrics(p, Model.vars(App.doc).v);
    const halfR = Math.max(m.r1, m.r2) + m.radHalf;
    const spot = Array.isArray(opts.pos) ? opts.pos : helixSpot(halfR);
    let created = null;
    App.change(T('helix.changeAdd'), (doc) => {
      const it = Model.newItem('helix', p, { name });
      it.t.x = spot[0] || 0;
      it.t.y = spot[1] || 0;
      it.t.z = opts.z || 0;
      doc.items.push(it);
      created = it;
    });
    if (created) {
      App.select([created.id]);
      UI.toast(T(ViewPrefs.simple ? 'helix.toastAddedSimple' : 'helix.toastAdded'), { icon: 'check' });
    }
    return created;
  }
  function renderHelix(it, sec, setP) {
    sec.id = 'helix-sec';
    sec.setAttribute('data-help', 'helix');
    const V = Model.vars(App.doc).v;
    const p = it.p || {};
    const m = Model.helixMetrics(p, V);
    const simple = ViewPrefs.simple;
    const uLbl = Units.label();
    const fl = h('div', { class: 'fields' });
    const profs = App.doc.items.filter((x) => x.kind === 'extrude' && x.p && x.p.sketch && x.id !== it.id);

    if (simple) {
      if (m.form === 'cyl') {
        fl.append(UI.numField({ id: 'hx-d', label: T('helix.dia'), value: p.d ?? 20, min: 0.4, onCommit: (v) => setP('d', v) }));
      } else {
        fl.append(
          UI.numField({ id: 'hx-r1', label: T('helix.r1'), value: p.r1 ?? 10, min: 0.2, onCommit: (v) => setP('r1', v) }),
          UI.numField({ id: 'hx-r2', label: T('helix.r2'), value: p.r2 ?? 5, min: 0.2, onCommit: (v) => setP('r2', v) }),
        );
      }
      fl.append(
        UI.numField({ id: 'hx-wire', label: T('helix.wireD'), value: p.wireD ?? 2, min: 0.2, onCommit: (v) => setP('wireD', v) }),
        UI.numField({ id: 'hx-turns', label: T('helix.turns'), value: p.turns ?? 5, unit: '', min: 0.1, step: 0.5, onCommit: (v) => setP('turns', v) }),
      );
      if (m.form !== 'spiral') {
        if (m.by === 'heightTurns' || m.by === 'heightPitch') {
          fl.append(UI.numField({ id: 'hx-height', label: T('helix.height'), value: p.height ?? 25, min: 0.2, onCommit: (v) => setP('height', v) }));
        } else {
          fl.append(UI.numField({ id: 'hx-pitch', label: T('helix.pitch'), value: p.pitch ?? 5, min: 0.05, onCommit: (v) => setP('pitch', v) }));
        }
      }
      sec.append(fl);
      sec.append(h('div', { class: 'mini-row', id: 'hx-info' },
        h('span', { class: 'grow' }, m.form === 'spiral' ? T('helix.infoRadialPitch') : T('helix.infoTotalHeight')),
        h('b', { class: 'mono' }, m.form === 'spiral' ? Units.fmtLenU(m.radialPitch, 2) : Units.fmtLenU(m.totalHeight, 2))));
      sec.append(h('div', { class: 'hint-box', html: T('helix.simpleHint') }));
      return;
    }

    fl.append(UI.selectField({
      id: 'hx-form', label: T('helix.form'), value: m.form,
      options: [['cyl', T('helix.formCyl')], ['cone', T('helix.formCone')], ['spiral', T('helix.formSpiral')]],
      onChange: (v) => App.change(T('helix.changeForm'), (doc) => {
        const f = Model.find(doc, it.id); if (!f) return false;
        const q = f.item.p, cur = Model.helixMetrics(q, Model.vars(doc).v);
        if (v === 'cyl') {
          q.d = round(cur.r1 * 2, 3);
        } else if (v === 'cone') {
          if (cur.form === 'cyl') { q.r1 = round(cur.d / 2, 3); q.r2 = Math.max(1, round(cur.d / 4, 3)); }
          else if (Math.abs(cur.r1 - cur.r2) < 0.05) q.r2 = Math.max(1, round(cur.r1 / 2, 3));
        } else if (v === 'spiral') {
          if (cur.form === 'cyl') { q.r1 = Math.max(2, round(cur.radHalf * 2 + 2, 2)); q.r2 = round(q.r1 + cur.turns * (cur.radHalf * 2 + 2), 2); }
          else if (Math.abs(cur.r1 - cur.r2) < 0.1) q.r2 = round(cur.r1 + 15, 2);
        }
        q.form = v;
      }),
    }));

    if (m.form === 'cyl') {
      fl.append(UI.numField({ id: 'hx-d', label: T('helix.dia'), value: p.d ?? 20, min: 0.4, onCommit: (v) => setP('d', v) }));
    } else {
      fl.append(
        UI.numField({ id: 'hx-r1', label: T('helix.r1'), value: p.r1 ?? (m.form === 'spiral' ? 5 : 10), min: 0.2, onCommit: (v) => setP('r1', v) }),
        UI.numField({ id: 'hx-r2', label: T('helix.r2'), value: p.r2 ?? (m.form === 'spiral' ? 25 : 5), min: 0.2, onCommit: (v) => setP('r2', v) }),
      );
    }

    if (m.form !== 'spiral') {
      fl.append(UI.selectField({
        id: 'hx-by', label: T('helix.by'), value: m.by,
        options: [['pitchTurns', T('helix.byPitchTurns')], ['heightTurns', T('helix.byHeightTurns')], ['heightPitch', T('helix.byHeightPitch')]],
        onChange: (v) => App.change(T('helix.changeBy'), (doc) => {
          const f = Model.find(doc, it.id); if (!f) return false;
          const q = f.item.p, cur = Model.helixMetrics(q, Model.vars(doc).v);
          if (typeof q.pitch === 'number') q.pitch = round(cur.pitch, 4);
          if (typeof q.turns === 'number') q.turns = round(cur.turns, 4);
          if (typeof q.height === 'number') q.height = round(cur.height, 4);
          if (q.pitch == null) q.pitch = round(cur.pitch, 4);
          if (q.turns == null) q.turns = round(cur.turns, 4);
          if (q.height == null) q.height = round(cur.height, 4);
          q.by = v;
        }),
      }));
      if (m.by !== 'heightTurns') fl.append(UI.numField({ id: 'hx-pitch', label: T('helix.pitch'), value: p.pitch ?? round(m.pitch, 3), min: 0.05, onCommit: (v) => setP('pitch', v) }));
      if (m.by !== 'heightPitch') fl.append(UI.numField({ id: 'hx-turns', label: T('helix.turns'), value: p.turns ?? round(m.turns, 3), unit: '', min: 0.1, step: 0.5, onCommit: (v) => setP('turns', v) }));
      if (m.by !== 'pitchTurns') fl.append(UI.numField({ id: 'hx-height', label: T('helix.height'), value: p.height ?? round(m.height, 3), min: 0.2, onCommit: (v) => setP('height', v) }));
    } else {
      fl.append(UI.numField({ id: 'hx-turns', label: T('helix.turns'), value: p.turns ?? 3, unit: '', min: 0.1, step: 0.5, onCommit: (v) => setP('turns', v) }));
    }

    fl.append(
      UI.selectField({
        id: 'hx-dir', label: T('helix.dir'), value: m.dir,
        options: [['right', T('helix.dirRight')], ['left', T('helix.dirLeft')]],
        onChange: (v) => App.change(T('helix.changeDir'), (doc) => { Model.find(doc, it.id).item.p.dir = v; }),
      }),
      UI.numField({ id: 'hx-start', label: T('helix.startAngle'), value: p.startAngle ?? 0, unit: '°', onCommit: (v) => setP('startAngle', v) }),
      UI.selectField({
        id: 'hx-shape', label: T('helix.profile'), value: m.shape,
        options: [['circle', T('helix.profCircle')], ['rect', T('helix.profRect')], ...(profs.length || m.shape === 'sketch' ? [['sketch', T('panel.sweep.sketch')]] : [])],
        onChange: (v) => {
          if (v === 'sketch' && !it.p.prof) {
            const src = profs[0];
            if (src) App.change('Querschnitt übernommen', (doc) => {
              const f = Model.find(doc, it.id).item;
              f.p.shape = 'sketch'; f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name;
              const s2 = doc.items.find((x) => x.id === src.id);
              if (s2) s2.hidden = true;
            });
          } else {
            App.change(T('helix.changeProfile'), (doc) => { Model.find(doc, it.id).item.p.shape = v; });
          }
        },
      }),
    );

    if (m.shape === 'sketch') {
      fl.append(UI.selectField({
        id: 'hx-prof', label: T('panel.sweep.profFrom'), value: '',
        options: [['', it.p.profName || T('panel.sweep.adopted')], ...profs.map((x) => [x.id, x.name])],
        onChange: (v) => {
          const src = profs.find((x) => x.id === v);
          if (src) App.change('Querschnitt übernommen', (doc) => {
            const f = Model.find(doc, it.id).item;
            f.p.prof = deepClone(src.p.sketch); f.p.profName = src.name;
            const s2 = doc.items.find((x) => x.id === src.id);
            if (s2) s2.hidden = true;
          });
        },
      }));
    } else if (m.shape === 'rect') {
      fl.append(
        UI.numField({ id: 'hx-pw', label: T('helix.profW'), value: p.profW ?? 2, min: 0.2, onCommit: (v) => setP('profW', v) }),
        UI.numField({ id: 'hx-ph', label: T('helix.profH'), value: p.profH ?? 2, min: 0.2, onCommit: (v) => setP('profH', v) }),
      );
    } else {
      fl.append(UI.numField({ id: 'hx-wire', label: T('helix.wireD'), value: p.wireD ?? 2, min: 0.2, onCommit: (v) => setP('wireD', v) }));
    }
    if (m.shape !== 'sketch') {
      fl.append(UI.numField({ id: 'hx-wall', label: T('panel.sweep.wallOpt'), value: p.wall ?? 0, min: 0, onCommit: (v) => setP('wall', v) }));
    }
    sec.append(fl);

    let infoLabel = '', infoVal = '';
    if (m.form === 'spiral') {
      infoLabel = T('helix.infoRadialPitch');
      infoVal = Units.fmtLenU(m.radialPitch, 2);
    } else {
      const calcTxt = m.by === 'heightTurns'
        ? `${T('helix.pitch')}: ${Units.fmtLenU(m.pitch, 2)}`
        : m.by === 'heightPitch'
          ? `${T('helix.turns')}: ${fmt(m.turns, 2)}`
          : `${T('helix.height')}: ${Units.fmtLenU(m.height, 2)}`;
      infoLabel = `${calcTxt} · ${T('helix.infoTotalHeight')}`;
      infoVal = `${Units.fmtLen(m.totalHeight, 2)} ${uLbl}`;
    }
    sec.append(h('div', { class: 'mini-row', id: 'hx-info' }, h('span', { class: 'grow' }, infoLabel), h('b', { class: 'mono' }, infoVal)));
    sec.append(h('div', { class: 'hint-box', html: T('helix.hint') }));
  }

  // ---------- Schraubdom (KP-24) ----------
  function basisFromNormal(fnArr) {
    const fn = new THREE.Vector3(...fnArr).normalize();
    const ref = Math.abs(fn.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const bx = new THREE.Vector3().crossVectors(ref, fn).normalize();
    const by = new THREE.Vector3().crossVectors(fn, bx).normalize();
    return { bx, by, fn };
  }
  function faceSigWithTid(face) {
    if (!face || !face.info || !Array.isArray(face.info.c)) return null;
    return {
      c: face.info.c.map((v) => round(v, 6)),
      n: Array.isArray(face.info.n) ? face.info.n.map((v) => round(v, 6)) : null,
      t: face.info.t || null,
      ...(face.info.tid ? { tid: face.info.tid } : {}),
    };
  }
  function bossUVFromWorldPoint(targetId, faceInfo, worldPt) {
    if (!worldPt || !faceInfo || !Array.isArray(faceInfo.c) || !Array.isArray(faceInfo.n)) return { u: 0, v: 0 };
    const inv = Model.worldMatrix(App.doc, targetId).invert();
    const ptW = Array.isArray(worldPt) ? new THREE.Vector3(...worldPt) : new THREE.Vector3(worldPt.x, worldPt.y, worldPt.z);
    const ptL = ptW.applyMatrix4(inv);
    const fc = new THREE.Vector3(...faceInfo.c);
    const { bx, by } = basisFromNormal(faceInfo.n);
    const d = ptL.sub(fc);
    return { u: round(d.dot(bx), 2) || 0, v: round(d.dot(by), 2) || 0 };
  }
  function boss(face, opts = {}) {
    if (App.ctx) { UI.toast('Schraubdome gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    face = face || Actions.selectedFace();
    const tgt = opts.target ? resolveTopTarget(opts.target) : (face ? resolveTopTarget(face.id) : null);
    const sig = opts.face || faceSigWithTid(face);
    const faceType = (face && face.info && face.info.t) || (sig && sig.t);
    if (!tgt || tgt.role === 'hole' || !sig || (faceType && faceType !== 'PLANE')) {
      UI.toast('Klick zuerst eine ebene Fläche eines Körpers an.', { icon: 'info' });
      return null;
    }
    let u = opts.u, v = opts.v;
    if (u == null && v == null) {
      const pt = opts.point || (face && face.point) || null;
      if (pt && face && face.info) {
        const uv = bossUVFromWorldPoint(tgt.id, face.info, pt);
        u = uv.u; v = uv.v;
      } else {
        u = 0; v = 0;
      }
    }
    const p = {
      target: tgt.id,
      face: sig,
      outerD: opts.outerD ?? 8,
      holeD: opts.holeD ?? 3,
      height: opts.height ?? 10,
      holeDepth: opts.holeDepth ?? 0,
      ribs: opts.ribs ?? 4,
      ribT: opts.ribT ?? 1.5,
      ribL: opts.ribL ?? 4,
      ribH: opts.ribH ?? 0,
      ribAngle: opts.ribAngle ?? 0,
      u: u ?? 0,
      v: v ?? 0,
    };
    let step;
    App.change('Schraubdom angelegt', (doc) => {
      step = Model.newItem('boss', p, { name: opts.name || T('kind.boss'), color: tgt.color, role: 'solid', mat: tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Schraubdom angelegt. Rechts stellst du Durchmesser, Höhe, Loch und Rippen ein.', { icon: 'check' });
    }
    return step || null;
  }
  function pickBossFace(stepId = null, opts = {}) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && fi.t === 'PLANE' && Array.isArray(fi.c)) {
          stopPick();
          const faceObj = { id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point || null };
          if (!stepId) {
            boss(faceObj, opts);
            return;
          }
          const sig = faceSigWithTid(faceObj);
          const uv = hit.point ? bossUVFromWorldPoint(tgt.id, fi, hit.point) : { u: 0, v: 0 };
          App.change('Fläche für Schraubdom gewählt', (doc) => {
            const f = Model.find(doc, stepId); if (!f) return false;
            f.item.p.target = tgt.id;
            f.item.p.face = sig;
            f.item.p.u = uv.u;
            f.item.p.v = uv.v;
            f.item.p.origin = null;
          });
          UI.toast('Fläche für Schraubdom aktualisiert.', { icon: 'check' });
          return;
        }
      }
      UI.toast('Bitte klick auf eine ebene Fläche eines Körpers.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Schraubdom platzieren:</b> Klick auf eine ebene Fläche eines Körpers. <b>Esc</b> bricht ab.');
  }
  function startBoss(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Schraubdome gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const f = face && face.info ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'PLANE') return boss(f, opts);
    if (!App.doc.items.some((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !isModifierStep(x))) {
      UI.toast('Für einen Schraubdom braucht es zuerst einen Körper im Projekt.', { icon: 'info' });
      return null;
    }
    pickBossFace(null, opts);
    return true;
  }
  function renderBoss(it, sec, setP) {
    const p = it.p || {};
    const V = Model.vars(App.doc).v;
    const fl = h('div', { class: 'fields' });
    fl.append(
      UI.numField({ id: 'boss-outerD', label: 'Außendurchmesser', value: p.outerD ?? 8, min: 0.5, unit: 'mm', onCommit: (v) => setP('outerD', v) }),
      UI.numField({ id: 'boss-holeD', label: 'Lochdurchmesser', value: p.holeD ?? 3, min: 0, unit: 'mm', onCommit: (v) => setP('holeD', v) }),
      UI.numField({ id: 'boss-height', label: 'Höhe', value: p.height ?? 10, min: 0.2, unit: 'mm', onCommit: (v) => setP('height', v) }),
      UI.numField({ id: 'boss-ribs', label: 'Rippen (0–6)', value: p.ribs ?? 4, unit: '', int: true, min: 0, max: 6, step: 1, onCommit: (v) => setP('ribs', Math.max(0, Math.min(6, Math.round(Number(v) || 0)))) }),
    );
    const ribsVal = Model.num(p.ribs, V, 4);
    if (ribsVal > 0 || typeof p.ribs === 'string') {
      fl.append(
        UI.numField({ id: 'boss-ribT', label: 'Rippendicke', value: p.ribT ?? 1.5, min: 0.2, unit: 'mm', onCommit: (v) => setP('ribT', v) }),
        UI.numField({ id: 'boss-ribL', label: 'Rippenlänge', value: p.ribL ?? 4, min: 0.2, unit: 'mm', onCommit: (v) => setP('ribL', v) }),
        UI.numField({ id: 'boss-ribH', label: 'Rippenhöhe (0 = 75 %)', value: p.ribH ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('ribH', v) }),
        UI.numField({ id: 'boss-ribAngle', label: 'Rippenwinkel', value: p.ribAngle ?? 0, unit: '°', onCommit: (v) => setP('ribAngle', v) }),
      );
    }
    fl.append(
      UI.numField({ id: 'boss-u', label: 'Versatz U', value: p.u ?? 0, unit: 'mm', onCommit: (v) => setP('u', v) }),
      UI.numField({ id: 'boss-v', label: 'Versatz V', value: p.v ?? 0, unit: 'mm', onCommit: (v) => setP('v', v) }),
      UI.numField({ id: 'boss-holeDepth', label: 'Lochtiefe (0 = ganz durch)', value: p.holeDepth ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('holeDepth', v) }),
    );
    sec.append(fl);
    const outerV = Model.num(p.outerD, V, 8), holeV = Model.num(p.holeD, V, 3);
    const wall = Math.max(0, (outerV - holeV) / 2);
    sec.append(h('div', { class: 'mini-row', id: 'boss-info' },
      h('span', { class: 'grow' }, 'Wandstärke am Dom'),
      h('b', { class: 'mono' }, Units.fmtLenU(wall, 2))));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'boss-pick' }); pb.innerHTML = icon('cursor') + esc(T('ctx.bossPickFace'));
    pb.onclick = () => pickBossFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'boss-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Setzt einen zylindrischen Schraubdom mit 0–6 Stützrippen und optionaler Bohrung auf die gewählte Fläche und vereinigt ihn mit dem Körper.' }));
  }

  // ---------- Lippe und Nut (KP-25) ----------
  function findOpposingPartingFaces(idA, idB) {
    const rIdA = App.mergedInto(idA) || idA, rIdB = App.mergedInto(idB) || idB;
    const fA = App.results.get(rIdA)?.data?.faces || [];
    const fB = App.results.get(rIdB)?.data?.faces || [];
    const wA = Model.worldMatrix(App.doc, rIdA), wB = Model.worldMatrix(App.doc, rIdB);
    let best = null;
    for (let ia = 0; ia < fA.length; ia++) {
      const fa = fA[ia];
      if (!fa || fa.t !== 'PLANE' || !Array.isArray(fa.n) || !Array.isArray(fa.c)) continue;
      const nAW = new THREE.Vector3(...fa.n).transformDirection(wA).normalize();
      const cAW = new THREE.Vector3(...fa.c).applyMatrix4(wA);
      for (let ib = 0; ib < fB.length; ib++) {
        const fb = fB[ib];
        if (!fb || fb.t !== 'PLANE' || !Array.isArray(fb.n) || !Array.isArray(fb.c)) continue;
        const nBW = new THREE.Vector3(...fb.n).transformDirection(wB).normalize();
        if (nAW.dot(nBW) > -0.99) continue;
        const cBW = new THREE.Vector3(...fb.c).applyMatrix4(wB);
        const planeDist = Math.abs(cBW.clone().sub(cAW).dot(nAW));
        const centerDist = cBW.distanceTo(cAW);
        const score = planeDist * 100 + centerDist;
        if (!best || score < best.score) {
          best = {
            score,
            dist: planeDist,
            faceA: { id: idA, idx: ia, info: fa },
            faceB: { id: idB, idx: ib, info: fb },
          };
        }
      }
    }
    return best;
  }
  function findRimFaceForEdge(itemId, edgeIdx, partnerId = null) {
    const rId = App.mergedInto(itemId) || itemId;
    const data = App.results.get(rId)?.data;
    if (!data || !Array.isArray(data.edges) || !Array.isArray(data.faces)) return null;
    const eg = data.edges[edgeIdx];
    if (!eg || !Array.isArray(eg.a) || !Array.isArray(eg.b)) return null;
    const mPt = Array.isArray(eg.m) ? eg.m : [(eg.a[0] + eg.b[0]) / 2, (eg.a[1] + eg.b[1]) / 2, (eg.a[2] + eg.b[2]) / 2];
    const pts = [new THREE.Vector3(...eg.a), new THREE.Vector3(...eg.b), new THREE.Vector3(...mPt)];
    const cands = [];
    for (let i = 0; i < data.faces.length; i++) {
      const fi = data.faces[i];
      if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.c) || !Array.isArray(fi.n)) continue;
      const fc = new THREE.Vector3(...fi.c), fn = new THREE.Vector3(...fi.n).normalize();
      if (pts.every((q) => Math.abs(q.clone().sub(fc).dot(fn)) < 0.05)) cands.push({ idx: i, info: fi });
    }
    if (!cands.length) return null;
    if (cands.length === 1 || !partnerId) return { id: itemId, idx: cands[0].idx, info: cands[0].info };
    const W = Model.worldMatrix(App.doc, rId);
    const prId = App.mergedInto(partnerId) || partnerId;
    const pb = Actions.worldBox(prId);
    const pCenter = pb && !pb.isEmpty() ? pb.getCenter(new THREE.Vector3()) : null;
    const opp = findOpposingPartingFaces(itemId, partnerId);
    if (opp) {
      const matchOpp = cands.find((c) => c.idx === opp.faceA.idx);
      if (matchOpp) return { id: itemId, idx: matchOpp.idx, info: matchOpp.info };
    }
    let best = cands[0], bestDot = -Infinity;
    for (const c of cands) {
      const nW = new THREE.Vector3(...c.info.n).transformDirection(W).normalize();
      const cW = new THREE.Vector3(...c.info.c).applyMatrix4(W);
      const d = pCenter ? pCenter.clone().sub(cW).normalize().dot(nW) : 0;
      if (d > bestDot) { bestDot = d; best = c; }
    }
    return { id: itemId, idx: best.idx, info: best.info };
  }
  function findPartnerBody(lipId, faceInfo = null) {
    const cands = App.doc.items.filter((x) => x.id !== lipId && !x.hidden && !x.suppressed && x.role !== 'hole' && !isModifierStep(x) && !(x.op && x.op.target));
    if (!cands.length) return null;
    const W = Model.worldMatrix(App.doc, App.mergedInto(lipId) || lipId);
    const fcW = faceInfo && Array.isArray(faceInfo.c) ? new THREE.Vector3(...faceInfo.c).applyMatrix4(W) : null;
    const fnW = faceInfo && Array.isArray(faceInfo.n) ? new THREE.Vector3(...faceInfo.n).transformDirection(W).normalize() : null;
    let best = null;
    for (const c of cands) {
      const opp = findOpposingPartingFaces(lipId, c.id);
      if (opp) {
        let sc = opp.dist;
        if (fnW && new THREE.Vector3(...opp.faceA.info.n).transformDirection(W).dot(fnW) > 0.99) sc -= 1000;
        if (!best || sc < best.score) best = { item: c, score: sc };
      } else if (fcW && fnW) {
        const cb = Actions.worldBox(c.id);
        if (cb && !cb.isEmpty()) {
          const cc = cb.getCenter(new THREE.Vector3());
          const d = cc.clone().sub(fcW).dot(fnW);
          const sc = (d > 0 ? 100 : 500) + cc.distanceTo(fcW);
          if (!best || sc < best.score) best = { item: c, score: sc };
        }
      }
    }
    return best ? best.item : cands[0];
  }
  function edgeSigFor(itemId, edgeIdx) {
    const rId = App.mergedInto(itemId) || itemId;
    const eg = App.results.get(rId)?.data?.edges?.[edgeIdx];
    if (!eg || !Array.isArray(eg.a) || !Array.isArray(eg.b)) return null;
    return {
      a: eg.a.map((v) => round(v, 5)),
      b: eg.b.map((v) => round(v, 5)),
      m: (Array.isArray(eg.m) ? eg.m : [(eg.a[0] + eg.b[0]) / 2, (eg.a[1] + eg.b[1]) / 2, (eg.a[2] + eg.b[2]) / 2]).map((v) => round(v, 5)),
      ...(eg.tid ? { tid: eg.tid } : {}),
    };
  }
  function lipGroove(opts = {}) {
    if (App.ctx) { UI.toast('Lippe und Nut gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    let lipTgt = opts.lipTarget ? resolveTopTarget(opts.lipTarget) : null;
    let grvTgt = opts.grooveTarget ? resolveTopTarget(opts.grooveTarget) : null;
    if (!lipTgt && !grvTgt && Array.isArray(opts.targets) && opts.targets.length >= 2) {
      lipTgt = resolveTopTarget(opts.targets[0]);
      grvTgt = resolveTopTarget(opts.targets[1]);
    }
    let faceObj = opts.face && opts.face.info ? opts.face : null;
    let edgeSig = opts.edge && Array.isArray(opts.edge.a) ? opts.edge : null;

    if (opts.edge && opts.edge.id != null && opts.edge.edgeIdx != null) {
      if (!lipTgt) lipTgt = resolveTopTarget(opts.edge.id);
      if (!grvTgt && lipTgt) grvTgt = findPartnerBody(lipTgt.id, null);
      if (lipTgt && !faceObj) faceObj = findRimFaceForEdge(lipTgt.id, opts.edge.edgeIdx, grvTgt ? grvTgt.id : null);
      if (!edgeSig) edgeSig = edgeSigFor(opts.edge.id, opts.edge.edgeIdx);
    }
    if (faceObj && !lipTgt) lipTgt = resolveTopTarget(faceObj.id);
    if (lipTgt && !grvTgt) grvTgt = findPartnerBody(lipTgt.id, faceObj ? faceObj.info : null);
    if (lipTgt && grvTgt && !faceObj) {
      const opp = findOpposingPartingFaces(lipTgt.id, grvTgt.id);
      if (opp) faceObj = opp.faceA;
    }

    if (!lipTgt || !grvTgt || lipTgt.id === grvTgt.id || lipTgt.role === 'hole' || grvTgt.role === 'hole') {
      UI.toast('Für Lippe und Nut werden zwei verschiedene Gehäusehälften benötigt.', { icon: 'info' });
      return null;
    }
    const faceSig = faceObj ? faceSigWithTid(faceObj) : (opts.face && Array.isArray(opts.face.c) ? opts.face : null);
    if (!faceSig && !edgeSig) {
      UI.toast('Keine ebene Trennfläche zwischen den beiden Hälften gefunden.', { icon: 'info' });
      return null;
    }
    const p = {
      lipTarget: lipTgt.id,
      grooveTarget: grvTgt.id,
      face: faceSig,
      edge: edgeSig,
      side: opts.side === 'outer' ? 'outer' : 'inner',
      height: opts.height ?? 2,
      width: opts.width ?? 1.2,
      clearance: opts.clearance ?? 0.2,
    };
    let step;
    App.change('Lippe und Nut angelegt', (doc) => {
      step = Model.newItem('lipGroove', p, { name: opts.name || T('kind.lipGroove'), color: lipTgt.color, role: 'solid', mat: lipTgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast('Lippe und Nut angelegt. Rechts stellst du Seite, Höhe, Breite und Spiel ein.', { icon: 'check' });
    }
    return step || null;
  }
  function pickLipGrooveEdge(stepId = null, opts = {}) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      if (hit && hit.id !== stepId) {
        const tgt = resolveTopTarget(hit.id);
        if (tgt && tgt.role !== 'hole') {
          if (hit.edgeIdx != null) {
            stopPick();
            if (!stepId) {
              lipGroove({ ...opts, edge: { id: hit.id, edgeIdx: hit.edgeIdx } });
              return;
            }
            const cur = Model.find(App.doc, stepId)?.item;
            let grvId = cur && cur.p ? cur.p.grooveTarget : null;
            if (!grvId || grvId === tgt.id) {
              const partner = findPartnerBody(tgt.id, null);
              grvId = partner ? partner.id : grvId;
            }
            const faceObj = findRimFaceForEdge(tgt.id, hit.edgeIdx, grvId);
            const sig = faceObj ? faceSigWithTid(faceObj) : null;
            const esig = edgeSigFor(hit.id, hit.edgeIdx);
            App.change('Trennkante für Lippe und Nut gewählt', (doc) => {
              const f = Model.find(doc, stepId); if (!f) return false;
              f.item.p.lipTarget = tgt.id;
              if (grvId && grvId !== tgt.id) f.item.p.grooveTarget = grvId;
              f.item.p.face = sig;
              f.item.p.edge = esig;
            });
            UI.toast('Trennkante aktualisiert.', { icon: 'check' });
            return;
          }
          if (hit.faceIdx >= 0) {
            const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
            if (fi && fi.t === 'PLANE' && Array.isArray(fi.c)) {
              stopPick();
              const faceObj = { id: hit.id, idx: hit.faceIdx, info: fi };
              if (!stepId) {
                lipGroove({ ...opts, face: faceObj });
                return;
              }
              const sig = faceSigWithTid(faceObj);
              let grvId = Model.find(App.doc, stepId)?.item?.p?.grooveTarget;
              if (!grvId || grvId === tgt.id) {
                const partner = findPartnerBody(tgt.id, fi);
                grvId = partner ? partner.id : grvId;
              }
              App.change('Trennfläche für Lippe und Nut gewählt', (doc) => {
                const f = Model.find(doc, stepId); if (!f) return false;
                f.item.p.lipTarget = tgt.id;
                if (grvId && grvId !== tgt.id) f.item.p.grooveTarget = grvId;
                f.item.p.face = sig;
                f.item.p.edge = null;
              });
              UI.toast('Trennfläche aktualisiert.', { icon: 'check' });
              return;
            }
          }
        }
      }
      UI.toast('Bitte klick auf eine Trennkante oder ebene Trennfläche einer Gehäusehälfte.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, edgePx: 9 });
      if (hit && hit.edgeIdx != null) {
        Viewer.highlightEdge(hit.id, hit.edgeIdx);
        Viewer.highlightFace('hover', null, null);
      } else {
        Viewer.highlightEdge(null, null);
        const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
        Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
      }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint('<b>Trennkante wählen:</b> Klick auf die Randkante oder ebene Trennfläche der Lippen-Hälfte. <b>Esc</b> bricht ab.');
  }
  function startLipGroove(opts = {}) {
    if (App.ctx) { UI.toast('Lippe und Nut gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const solids = App.doc.items.filter((x) => !x.hidden && !x.suppressed && x.role !== 'hole' && !isModifierStep(x) && !(x.op && x.op.target));
    if (solids.length < 2) {
      UI.toast('Für Lippe und Nut braucht es mindestens zwei Gehäusehälften im Projekt.', { icon: 'info' });
      return null;
    }
    if (App.edges.length === 1) return lipGroove({ ...opts, edge: App.edges[0] });
    const face = Actions.selectedFace();
    if (face && face.info && face.info.t === 'PLANE') return lipGroove({ ...opts, face });
    if (App.sel.length === 2) return lipGroove({ ...opts, targets: App.sel.slice(0, 2) });
    pickLipGrooveEdge(null, opts);
    return true;
  }
  function swapLipGroove(stepId) {
    const f = Model.find(App.doc, stepId);
    if (!f || f.item.kind !== 'lipGroove') return false;
    const p = f.item.p || {};
    if (!p.lipTarget || !p.grooveTarget) return false;
    const newLip = p.grooveTarget, newGrv = p.lipTarget;
    const opp = findOpposingPartingFaces(newLip, newGrv);
    const newFace = opp ? faceSigWithTid(opp.faceA) : p.face;
    App.change('Lippe und Nut getauscht', (doc) => {
      const T = Model.find(doc, stepId)?.item; if (!T) return false;
      T.p.lipTarget = newLip;
      T.p.grooveTarget = newGrv;
      T.p.face = newFace;
      T.p.edge = null;
    });
    UI.toast('Lippe und Nut zwischen den beiden Hälften getauscht.', { icon: 'check' });
    return true;
  }
  function renderLipGroove(it, sec, setP) {
    const p = it.p || {};
    const idx = App.doc.items.indexOf(it);
    const targets = activeTargetsBefore(it).filter((x) => x.role !== 'hole');
    const makeOpts = (curId) => {
      const opts = targets.map((x) => [x.id, Model.label(x)]);
      if (curId && !targets.some((x) => x.id === curId)) {
        const f = Model.find(App.doc, curId);
        opts.unshift([curId, f ? Model.label(f.item) + ' (inaktiv)' : 'Fehlender Körper']);
      }
      return opts;
    };
    const fl = h('div', { class: 'fields' });
    const lipOpts = makeOpts(p.lipTarget);
    const grvOpts = makeOpts(p.grooveTarget);
    if (lipOpts.length) {
      fl.append(UI.selectField({
        id: 'lg-lip-target', label: 'Lippe an', value: p.lipTarget || '', options: lipOpts,
        onChange: (v) => App.change('Lippen-Körper gewählt', (doc) => {
          const T = Model.find(doc, it.id).item;
          T.p.lipTarget = v;
          if (T.p.grooveTarget && v !== T.p.grooveTarget) {
            const opp = findOpposingPartingFaces(v, T.p.grooveTarget);
            if (opp) { T.p.face = faceSigWithTid(opp.faceA); T.p.edge = null; }
          }
        }),
      }));
    }
    if (grvOpts.length) {
      fl.append(UI.selectField({
        id: 'lg-groove-target', label: 'Nut in', value: p.grooveTarget || '', options: grvOpts,
        onChange: (v) => App.change('Nut-Körper gewählt', (doc) => {
          const T = Model.find(doc, it.id).item;
          T.p.grooveTarget = v;
          if (T.p.lipTarget && v !== T.p.lipTarget) {
            const opp = findOpposingPartingFaces(T.p.lipTarget, v);
            if (opp) { T.p.face = faceSigWithTid(opp.faceA); T.p.edge = null; }
          }
        }),
      }));
    }
    fl.append(
      UI.selectField({ id: 'lg-side', label: 'Lage der Lippe', value: p.side === 'outer' ? 'outer' : 'inner', options: [['inner', 'Innen (Feder innen)'], ['outer', 'Außen (Feder außen)']], onChange: (v) => setP('side', v) }),
      UI.numField({ id: 'lg-height', label: 'Lippenhöhe', value: p.height ?? 2, min: 0.1, unit: 'mm', onCommit: (v) => setP('height', v) }),
      UI.numField({ id: 'lg-width', label: 'Lippenbreite', value: p.width ?? 1.2, min: 0.1, unit: 'mm', onCommit: (v) => setP('width', v) }),
      UI.numField({ id: 'lg-clearance', label: 'Spiel', value: p.clearance ?? 0.2, min: 0, step: 0.05, unit: 'mm', onCommit: (v) => setP('clearance', v) }),
    );
    sec.append(fl);
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'lg-pick' }); pb.innerHTML = icon('cursor') + esc(T('ctx.lipPickEdge'));
    pb.onclick = () => pickLipGrooveEdge(it.id);
    const sb = h('button', { type: 'button', class: 'btn small', id: 'lg-swap' }); sb.innerHTML = icon('replace') + esc(T('ctx.lipSwap'));
    sb.onclick = () => swapLipGroove(it.id);
    row.append(pb, sb);
    if (p.lipTarget && Model.find(App.doc, p.lipTarget)) {
      const gl = h('button', { type: 'button', class: 'btn small', id: 'lg-goto-lip' }); gl.innerHTML = icon('pointer') + 'Lippen-Hälfte';
      gl.onclick = () => App.select([p.lipTarget]);
      row.append(gl);
    }
    if (p.grooveTarget && Model.find(App.doc, p.grooveTarget)) {
      const gg = h('button', { type: 'button', class: 'btn small', id: 'lg-goto-groove' }); gg.innerHTML = icon('pointer') + 'Nut-Hälfte';
      gg.onclick = () => App.select([p.grooveTarget]);
      row.append(gg);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Erzeugt eine umlaufende Stecklippe an der ersten Hälfte und schneidet die passende Nut samt <b>Spiel</b> (Luft) in die zweite Gehäusehälfte.' }));
  }

  // ---------- Übergang (Loft): geschlossen (Ring) & als Schnitt (KP-30) ----------
  function loftTargets(doc = App.doc, excludeIds = []) {
    if (!doc || !Array.isArray(doc.items)) return [];
    const ex = new Set(excludeIds || []);
    return doc.items.filter((x) => (
      x && !ex.has(x.id) && x.role !== 'hole' && !x.suppressed
      && !(x.kind === 'group' && x.p && x.p.assembly)
      && x.kind !== 'ref' && x.kind !== 'rib' && x.kind !== 'wrap' && x.kind !== 'emboss' && x.kind !== 'mountPattern' && x.kind !== 'portCutout' && x.kind !== 'magnetPocket'
      && x.kind !== 'boss' && x.kind !== 'lipGroove' && x.kind !== 'undercut' && x.kind !== 'circlipGroove' && x.kind !== 'keyway' && x.kind !== 'splineProfile' && x.kind !== 'knurl' && x.kind !== 'gripPattern'
      && x.kind !== 'mirrorStep' && x.kind !== 'deleteBody' && x.kind !== 'sketch3d'
      && !(x.kind === 'transform' && !(x.p && x.p.copy)) && x.kind !== 'scale' && x.kind !== 'deform'
      && !(x.kind === 'thicken' && !(x.p && x.p.mode === 'new'))
    ));
  }
  function loftClosed(ids, opts = {}) {
    return Actions.loft(ids, { ...opts, closed: true });
  }
  function loftCut(ids, targetId = null, opts = {}) {
    return Actions.loft(ids, { ...opts, op: 'cut', target: targetId || undefined });
  }
  function setLoftClosed(itemId, closed) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'loft') return false;
    const n = (f.item.p && Array.isArray(f.item.p.sketches)) ? f.item.p.sketches.length : 0;
    if (closed && n < 3) {
      UI.toast(T('panel.loft.needThreeClosed'), { icon: 'info' });
      return false;
    }
    App.change(closed ? 'Übergang geschlossen (Ring)' : 'Übergang geöffnet', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn || fn.item.kind !== 'loft') return false;
      const p = fn.item.p || (fn.item.p = {});
      if (closed) {
        p.closed = true;
        p.tip = 0;
        delete p.path;
        delete p.rail;
        delete p.rail2;
        delete p.startCond;
        delete p.endCond;
        delete p.startFace;
        delete p.endFace;
      } else {
        delete p.closed;
      }
    });
    return true;
  }
  function setLoftContinuity(itemId, end = 'start', opts = {}) {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'loft') return false;
    const n = (f.item.p && Array.isArray(f.item.p.sketches)) ? f.item.p.sketches.length : 0;
    if (n < 2) {
      UI.toast(T('panel.loft.needTwoCont'), { icon: 'info' });
      return false;
    }
    const isEnd = end === 'end';
    const condKey = isEnd ? 'endCond' : 'startCond';
    const weightKey = isEnd ? 'endWeight' : 'startWeight';
    const faceKey = isEnd ? 'endFace' : 'startFace';
    const mode = opts.mode != null ? (opts.mode === 'tangent' || opts.mode === 'curvature' ? opts.mode : 'none') : null;
    const weight = opts.weight != null ? round(clamp(Number(opts.weight) || 1, 0.1, 3), 2) : null;
    App.change('Übergang-Anschluss geändert', (doc) => {
      const fn = Model.find(doc, itemId);
      if (!fn || fn.item.kind !== 'loft') return false;
      const p = fn.item.p || (fn.item.p = {});
      if (mode != null) {
        if (mode === 'none') delete p[condKey];
        else {
          p[condKey] = mode;
          p.ruled = false;
          delete p.closed;
          delete p.path;
          delete p.rail;
          delete p.rail2;
          if (isEnd) p.tip = 0;
          if (p[weightKey] == null) p[weightKey] = 1;
        }
      }
      if (weight != null && Number.isFinite(weight)) p[weightKey] = weight;
      if (opts.clearFace) delete p[faceKey];
      else if (opts.face) p[faceKey] = opts.face;
    }, opts.merge ? { merge: opts.merge } : undefined);
    return true;
  }
  function pickLoftFace(itemId, end = 'start') {
    const f = Model.find(App.doc, itemId);
    if (!f || f.item.kind !== 'loft') return false;
    const curMode = (f.item.p && f.item.p[end === 'end' ? 'endCond' : 'startCond']) || 'none';
    pickFaceThen((ref) => {
      if (!ref || ref.datumId) {
        UI.toast('Bitte wähle eine Fläche eines benachbarten Körpers.', { icon: 'info' });
        return;
      }
      setLoftContinuity(itemId, end, { face: ref, mode: curMode === 'none' ? 'tangent' : curMode });
      UI.toast('Anschlussfläche gewählt: ' + (ref.label || 'Fläche') + '.', { icon: 'check' });
    }, {
      exclude: new Set([itemId, '__preview']),
      hint: '<b>Anschlussfläche wählen:</b> Klick auf eine Fläche des benachbarten Körpers. <b>Esc</b> bricht ab.',
    });
    return true;
  }
  function renderLoft(it, sec, setP, w) {
    const n = (it.p.sketches || []).length;
    const hasPath = !!it.p.path, hasRail1 = !!it.p.rail, hasRail2 = !!it.p.rail2, hasRail = hasRail1 || hasRail2;
    const isClosed = !!it.p.closed && !hasPath && !hasRail;
    const sCond = (it.p.startCond === 'tangent' || it.p.startCond === 'curvature') ? it.p.startCond : 'none';
    const eCond = (it.p.endCond === 'tangent' || it.p.endCond === 'curvature') ? it.p.endCond : 'none';
    const hasCont = !isClosed && !hasPath && !hasRail && (sCond !== 'none' || eCond !== 'none');
    sec.append(h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('panel.loft.profiles')), h('b', { class: 'mono' }, String(n))));
    if (!hasPath && !hasRail) {
      const fl = h('div', { class: 'fields' });
      if (!isClosed && eCond === 'none') fl.append(UI.numField({ id: 'p-tip', label: T('panel.loft.extendTip'), value: it.p.tip || 0, min: 0, onCommit: (v) => setP('tip', v) }));
      const rf = UI.selectField({
        id: 'p-ruled',
        label: T('kind.loft'),
        value: it.p.ruled && !hasCont ? 'ruled' : 'smooth',
        options: [['smooth', T('panel.loft.smooth')], ['ruled', T('panel.loft.ruled')]],
        onChange: (v) => {
          if (v === 'ruled') {
            App.change('Übergang mit geraden Flächen', (doc) => {
              const fn = Model.find(doc, it.id);
              if (!fn) return false;
              fn.item.p.ruled = true;
              delete fn.item.p.startCond;
              delete fn.item.p.endCond;
            });
          } else setP('ruled', false);
        },
      });
      fl.append(rf);
      sec.append(fl);
      const chk = h('input', { type: 'checkbox', id: 'p-closed', checked: isClosed });
      if (n < 3 && !isClosed) chk.disabled = true;
      chk.onchange = () => { if (!setLoftClosed(it.id, chk.checked)) chk.checked = !!it.p.closed; };
      const cl = h('label', { class: 'check pro', 'data-help': 'loftClosed', title: n < 3 && !isClosed ? T('panel.loft.needThreeClosed') : '', style: { marginTop: '6px' } }, chk, T('panel.loft.closed'));
      sec.append(cl);
      sec.append(h('div', { class: 'hint-box', html: isClosed ? T('panel.loft.closedHint') : T('panel.loft.tipHint') }));
    }
    // Weicher Anschluss (KP-31): Start und Ende tangential (G1) oder krümmungsglatt (G2) mit Stärke
    const contSec = h('div', { class: 'section pro', id: 'loft-cont', 'data-help': 'loftContinuity' }, h('div', { class: 'section-h' }, T('panel.loft.continuity')));
    if (isClosed) {
      contSec.append(h('div', { class: 'hint-box', html: T('panel.loft.contBlockedClosed') }));
    } else if (hasPath) {
      contSec.append(h('div', { class: 'hint-box', html: T('panel.loft.contBlockedPath') }));
    } else if (hasRail) {
      contSec.append(h('div', { class: 'hint-box', html: T('panel.loft.contBlockedRail') }));
    } else if (n < 2) {
      contSec.append(h('div', { class: 'hint-box', html: T('panel.loft.needTwoCont') }));
    } else {
      const resInfo = App.resolvedOf ? App.resolvedOf(it.id) : null;
      const renderEndCard = (end, labelKey) => {
        const isEnd = end === 'end';
        const cond = isEnd ? eCond : sCond;
        const wRaw = isEnd ? it.p.endWeight : it.p.startWeight;
        const wVal = round(clamp(Number(wRaw != null ? wRaw : 1) || 1, 0.1, 3), 2);
        const faceRef = isEnd ? it.p.endFace : it.p.startFace;
        const card = h('div', { class: 'loft-cont-card', id: `loft-${end}-card` });
        card.append(UI.selectField({
          id: `loft-${end}-mode`,
          label: T(labelKey),
          value: cond,
          options: [
            ['none', T('panel.loft.condNone')],
            ['tangent', T('panel.loft.condTangent')],
            ['curvature', T('panel.loft.condCurvature')],
          ],
          onChange: (v) => setLoftContinuity(it.id, end, { mode: v }),
        }));
        if (cond !== 'none') {
          const valEl = h('span', { class: 'mono loft-weight-val', id: `loft-${end}-weight-val` }, fmt(wVal, 2));
          const rng = h('input', { type: 'range', id: `loft-${end}-weight`, min: '0.1', max: '3', step: '0.05', value: String(wVal), 'aria-label': `${T(labelKey)} ${T('panel.loft.strength')}` });
          let wTimer = null;
          rng.oninput = () => {
            const wv = round(clamp(parseFloat(rng.value) || 1, 0.1, 3), 2);
            valEl.textContent = fmt(wv, 2);
            clearTimeout(wTimer);
            wTimer = setTimeout(() => setLoftContinuity(it.id, end, { weight: wv, merge: 'loft-w-' + end }), 80);
          };
          rng.onchange = () => {
            clearTimeout(wTimer);
            const wv = round(clamp(parseFloat(rng.value) || 1, 0.1, 3), 2);
            valEl.textContent = fmt(wv, 2);
            setLoftContinuity(it.id, end, { weight: wv, merge: 'loft-w-' + end });
          };
          card.append(h('div', { class: 'loft-weight-row' }, h('span', null, T('panel.loft.strength')), rng, valEl));

          const endRes = resInfo && resInfo[end];
          let faceTxt = T('panel.loft.connNormal');
          if (faceRef && faceRef.id) {
            const bf = Model.find(App.doc, faceRef.id);
            faceTxt = T('panel.loft.connExplicit', { body: bf ? Model.label(bf.item) : (faceRef.label || 'Fläche') });
          } else if (endRes && endRes.source === 'face' && endRes.bodyId) {
            const bf = Model.find(App.doc, endRes.bodyId);
            faceTxt = T('panel.loft.connDetected', { body: bf ? Model.label(bf.item) : 'Körper' });
          }
          const pb = h('button', { type: 'button', class: 'btn small', id: `loft-${end}-pick` }, T('panel.loft.pickFace'));
          pb.onclick = () => pickLoftFace(it.id, end);
          const fRow = h('div', { class: 'loft-face-row' }, h('span', { class: 'grow', id: `loft-${end}-face-info` }, faceTxt), pb);
          if (faceRef && faceRef.id) {
            const cb = h('button', { type: 'button', class: 'btn small', id: `loft-${end}-clear` }, T('panel.loft.autoFace'));
            cb.onclick = () => setLoftContinuity(it.id, end, { clearFace: true });
            fRow.append(cb);
          }
          card.append(fRow);
        }
        return card;
      };
      contSec.append(renderEndCard('start', 'panel.loft.startEnd'), renderEndCard('end', 'panel.loft.endEnd'));
      contSec.append(h('div', { class: 'hint-box', html: T('panel.loft.contHint') }));
    }
    // Mittellinie: der Übergang folgt einer gebogenen Linie statt dem kürzesten Weg
    const ml = h('div', { class: 'section', id: 'loft-path' }, h('div', { class: 'section-h' }, T('panel.loft.centerline')));
    if (isClosed) {
      ml.append(h('div', { class: 'hint-box', html: T('panel.loft.pathBlockedClosed') }));
    } else if (n >= 2) {
      const eb = h('button', { type: 'button', class: 'btn', id: 'loft-path-edit' }); eb.innerHTML = icon(hasPath ? 'edit' : 'spline') + esc(hasPath ? T('panel.loft.editPath') : T('panel.loft.drawPath'));
      eb.onclick = () => Sketch.startLoftPath(it.id);
      const row = h('div', { class: 'btn-row' }, eb);
      if (hasPath) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'loft-path-off' }); rb.innerHTML = icon('close') + esc(T('panel.loft.noPath'));
        rb.onclick = () => App.change('Mittellinie entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.path; });
        row.append(rb);
      }
      const ang = hasPath ? Model.loftPathAngles(it, Model.vars(App.doc).v) : [];
      const bad = ang.map((a, i) => [a, i]).filter(([a]) => a > 30);
      if (bad.length) ml.append(h('div', { class: 'hint-box warn', id: 'loft-path-warn', html: T('panel.loft.pathAngleWarn', { which: bad.length === ang.length ? T('panel.loft.allProfiles') : bad.map(([, i]) => T('panel.loft.profileWord', { which: i === 0 ? T('panel.loft.firstProfile') : i === ang.length - 1 ? T('panel.loft.lastProfile') : T('panel.loft.nthProfile', { n: i + 1 }) })).join(T('panel.loft.andJoin')), angs: bad.map(([a]) => a + '°').join(', ') }) }));
      ml.append(row, h('div', { class: 'hint-box', html: hasPath ? T('panel.loft.pathActiveHint') : T('panel.loft.pathIdleHint') }));
    } else ml.append(h('div', { class: 'hint-box', html: T('panel.loft.needTwoPath') }));
    // Führungskurve: gibt die Seitenlinie vor – der Übergang wird zwischen den Umrissen so weit, dass er sie berührt
    const fk = h('div', { class: 'section', id: 'loft-rail' }, h('div', { class: 'section-h' }, T('panel.loft.rail')));
    if (isClosed) {
      fk.append(h('div', { class: 'hint-box', html: T('panel.loft.railBlockedClosed') }));
    } else if (n >= 2 && !hasPath) {
      const eb = h('button', { type: 'button', class: 'btn', id: 'loft-rail-edit' }); eb.innerHTML = icon(hasRail1 ? 'edit' : 'spline') + esc(hasRail1 ? T('panel.loft.editRail') : T('panel.loft.drawRail'));
      eb.onclick = () => Sketch.startLoftPath(it.id, 'rail');
      const row = h('div', { class: 'btn-row' }, eb);
      if (hasRail1) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'loft-rail-off' }); rb.innerHTML = icon('close') + esc(T('panel.loft.noRail'));
        rb.onclick = () => App.change('Führungskurve entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.rail; delete f.item.p.rail2; });
        row.append(rb);
      }
      fk.append(row, h('div', { class: 'hint-box', html: hasRail ? T('panel.loft.railActiveHint') : T('panel.loft.railIdleHint') }));
    } else fk.append(h('div', { class: 'hint-box', html: hasPath ? T('panel.loft.railBlockedPath') : T('panel.loft.needTwoRail') }));
    // zweite Führungskurve quer zur ersten (z. B. Gehäuse: erste von der Seite für die Höhe, zweite von oben für die Breite)
    const fk2 = !isClosed && hasRail1 && n >= 2 && !hasPath ? h('div', { class: 'section', id: 'loft-rail2' }, h('div', { class: 'section-h' }, T('panel.loft.rail2'))) : null;
    if (fk2) {
      const eb = h('button', { type: 'button', class: 'btn', id: 'loft-rail2-edit' }); eb.innerHTML = icon(hasRail2 ? 'edit' : 'spline') + esc(hasRail2 ? T('panel.loft.editRail2') : T('panel.loft.drawRail2'));
      eb.onclick = () => Sketch.startLoftPath(it.id, 'rail2');
      const row = h('div', { class: 'btn-row' }, eb);
      if (hasRail2) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'loft-rail2-off' }); rb.innerHTML = icon('close') + esc(T('panel.loft.noRail2'));
        rb.onclick = () => App.change('Zweite Führungskurve entfernt', (doc) => { const f = Model.find(doc, it.id); if (!f) return false; delete f.item.p.rail2; });
        row.append(rb);
      }
      fk2.append(row, h('div', { class: 'hint-box', html: hasRail2 ? T('panel.loft.rail2ActiveHint') : T('panel.loft.rail2IdleHint') }));
    }
    if (!isClosed && hasRail) { ml.innerHTML = ''; ml.append(h('div', { class: 'section-h' }, T('panel.loft.centerline')), h('div', { class: 'hint-box', html: T('panel.loft.pathBlockedRail') })); }
    w.append(sec, contSec, ml, fk); if (fk2) w.append(fk2);
  }

  // ---------- Wellen- & Bohrungs-Schritte (KP-48, KP-49): Freistich, Einstich, Passfeder-Nut, Keilwelle ----------
  function resolveCylForStep(face = null) {
    let f = face && face.id != null && face.idx != null ? face : Actions.selectedFace();
    if ((!f || !f.info || f.info.t !== 'CYLINDRE') && App.sel.length === 1) {
      const top = resolveTopTarget(App.sel[0]);
      if (top && top.role !== 'hole') {
        const cf = findCylFaceOnItem(top.id);
        if (cf) f = { id: cf.rId, idx: cf.faceIdx, info: cf.info };
      }
    }
    if (!f || f.id == null) return null;
    const tgt = resolveTopTarget(f.id);
    if (!tgt || tgt.role === 'hole') return null;
    const rId = App.mergedInto(f.id) || f.id;
    const g = (f.idx != null ? Viewer.cylinderFaceInfo(rId, f.idx) : null) || (f.info && f.info.t === 'CYLINDRE' && Array.isArray(f.info.axis) ? (() => {
      const ax = f.info.axis;
      return { o: ax.slice(0, 3), d: ax.slice(3, 6), r: f.info.r || 10, c: f.info.c || [0, 0, 0], t0: 0, t1: 20, faceLen: 20, kind: f.info.ori === -1 ? 'int' : 'ext' };
    })() : null);
    if (!g) return null;
    const r6 = (a) => a.map((v) => round(v, 6));
    const faceSpec = {
      t: 'CYLINDRE',
      r: round(g.r, 6),
      c: r6(g.c || g.o),
      axis: [...r6(g.o), ...r6(g.d)],
      ori: g.kind === 'int' ? -1 : 1,
      ...(f.info && f.info.tid ? { tid: f.info.tid } : {}),
    };
    return { face: f, tgt, g, faceSpec, d: round(2 * g.r, 3), isInner: g.kind === 'int' };
  }
  function pickCylStepFace(stepId, hintHtml, onPick) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && fi.t === 'CYLINDRE') {
          stopPick();
          const info = resolveCylForStep({ id: hit.id, idx: hit.faceIdx, info: fi });
          if (info) onPick(info);
          return;
        }
      }
      UI.toast('Bitte klick auf eine runde Zylinderfläche (Welle oder Bohrung).', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'CYLINDRE' ? hit.id : null, fi && fi.t === 'CYLINDRE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(hintHtml);
  }
  function pickStepCylFace(stepId, undoLabel) {
    pickCylStepFace(stepId, '<b>Zylinderfläche wählen:</b> Klick auf die gewünschte Welle oder Bohrung. <b>Esc</b> bricht ab.', (info) => {
      App.change(undoLabel, (doc) => {
        const f = Model.find(doc, stepId); if (!f) return false;
        f.item.p.target = info.tgt.id;
        f.item.p.face = info.faceSpec;
      });
      UI.toast('Zylinderfläche aktualisiert.', { icon: 'check' });
    });
  }
  function startCylStep(kindName, hintHtml, fn, face = null, opts = {}) {
    if (App.ctx) { UI.toast(`${kindName} gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.`, { icon: 'info' }); return null; }
    const f = face && face.info && face.info.t === 'CYLINDRE' ? face : Actions.selectedFace();
    if (f && f.info && f.info.t === 'CYLINDRE') return fn(f, opts);
    if (!cylTargets().length) {
      UI.toast(`Für „${kindName}“ braucht es zuerst einen Körper mit einer Zylinderfläche (Welle oder Bohrung).`, { icon: 'info' });
      return null;
    }
    pickCylStepFace(null, hintHtml, (info) => { fn(info.face, opts); });
    return true;
  }

  // Gewinde-Freistich (DIN 76-1)
  function undercut(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Gewinde-Freistich gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveCylForStep(face);
    if (!ctx) { startUndercut(opts); return null; }
    const th = ctx.face.idx != null ? threadOnFace(ctx.face.id, ctx.face.idx) : null;
    const defSize = th ? th.size : guessThreadSize(ctx.g.r, ctx.g.kind);
    const defPitch = th && th.pitch > 0 ? th.pitch : ((THREAD_MAP[defSize] && THREAD_MAP[defSize].pitch) || 1.5);
    const form = opts.form === 'B' ? 'B' : 'A';
    const din = undercutDimsForDia(ctx.d, opts.pitch ?? defPitch, form, ctx.isInner);
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      form: din.form,
      pitch: din.pitch,
      width: opts.width ?? din.width,
      grooveD: opts.grooveD ?? din.grooveD,
      end: opts.end === 'bottom' ? 'bottom' : 'top',
      offset: opts.offset ?? 0,
      rampAngle: opts.rampAngle ?? 30,
      autoNorm: opts.autoNorm ?? (opts.width == null && opts.grooveD == null),
    };
    let step;
    App.change('Gewinde-Freistich angelegt', (doc) => {
      step = Model.newItem('undercut', p, { name: opts.name || T('kind.undercut'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(`Freistich DIN 76-${din.form} (Ø ${fmt(p.grooveD, 2)} × ${fmt(p.width, 2)} mm) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startUndercut(opts = {}) {
    return startCylStep(T('kind.undercut'), '<b>Gewinde-Freistich:</b> Klick auf eine runde Welle oder Bohrung. <b>Esc</b> bricht ab.', undercut, null, opts);
  }
  function renderUndercut(it, sec, setP) {
    const p = it.p || {};
    const dFace = p.face && p.face.r ? round(2 * p.face.r, 3) : 10;
    const isInner = p.face && p.face.ori === -1;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'uc-form', label: 'DIN 76-1 Form', value: p.form === 'B' ? 'B' : 'A',
      options: [['A', 'Form A (Regelfall)'], ['B', 'Form B (kurz)']],
      onChange: (v) => App.change('Freistich-Form geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        item.p.form = v === 'B' ? 'B' : 'A';
        if (item.p.autoNorm !== false) {
          const din = undercutDimsForDia(dFace, item.p.pitch ?? 1.5, item.p.form, isInner);
          item.p.width = din.width;
          item.p.grooveD = din.grooveD;
        }
      }),
    }));
    fl.append(UI.selectField({
      id: 'uc-pitch', label: 'Steigung P', value: String(undercutEntry(p.pitch ?? 1.5).p),
      options: UNDERCUT_PITCH_OPTIONS,
      onChange: (v) => App.change('Steigung geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const pv = parseFloat(v) || 1.5;
        item.p.pitch = pv;
        const din = undercutDimsForDia(dFace, pv, item.p.form || 'A', isInner);
        item.p.width = din.width;
        item.p.grooveD = din.grooveD;
        item.p.autoNorm = true;
      }),
    }));
    fl.append(
      UI.numField({ id: 'uc-grooveD', label: 'Freistich-Ø (dg)', value: p.grooveD ?? 7.3, min: 0.2, unit: 'mm', onCommit: (v) => App.change('Freistich-Ø geändert', (doc) => { const f = Model.find(doc, it.id).item; f.p.grooveD = v; f.p.autoNorm = false; }) }),
      UI.numField({ id: 'uc-width', label: 'Breite (g₂)', value: p.width ?? 5.2, min: 0.2, unit: 'mm', onCommit: (v) => App.change('Freistich-Breite geändert', (doc) => { const f = Model.find(doc, it.id).item; f.p.width = v; f.p.autoNorm = false; }) }),
      UI.selectField({ id: 'uc-end', label: 'Gewindeende', value: p.end === 'bottom' ? 'bottom' : 'top', options: [['top', 'Ende 1 (oben)'], ['bottom', 'Ende 2 (unten)']], onChange: (v) => setP('end', v) }),
      UI.numField({ id: 'uc-offset', label: 'Abstand vom Ende', value: p.offset ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('offset', v) }),
      UI.numField({ id: 'uc-ramp', label: 'Auslaufwinkel', value: p.rampAngle ?? 30, min: 10, max: 89, unit: '°', onCommit: (v) => setP('rampAngle', v) }),
    );
    sec.append(fl);
    const din = undercutDimsForDia(dFace, p.pitch ?? 1.5, p.form || 'A', isInner);
    sec.append(h('div', { class: 'mini-row', id: 'uc-info' },
      h('span', { class: 'grow' }, `DIN 76-${din.form} (P ${fmt(din.pitch, 2)}) · r ${Units.fmtLenU(din.r, 2)}`),
      h('b', { class: 'mono' }, `g₁ ≥ ${Units.fmtLenU(din.g1, 2)}`)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'uc-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickStepCylFace(it.id, 'Zylinderfläche für Freistich gewählt');
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'uc-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Schneidet am Ende eines Gewindeabschnitts einen normgerechten DIN-76-1-Freistich mit 30°-Auslauf ein.' }));
  }

  // Einstich für Sicherungsring (DIN 471 / DIN 472)
  function circlipGroove(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Einstich gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveCylForStep(face);
    if (!ctx) { startCirclipGroove(opts); return null; }
    const norm = opts.norm === 'din471' || opts.norm === 'din472' ? opts.norm : (ctx.isInner ? 'din472' : 'din471');
    const ce = circlipEntry(opts.size ?? ctx.d, norm);
    const defOff = round(Math.min(5, Math.max(1.5, ctx.g.faceLen * 0.2)), 2);
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      norm,
      size: ce.d1,
      width: opts.width ?? ce.m,
      grooveD: opts.grooveD ?? ce.d2,
      from: opts.from === 'bottom' || opts.from === 'center' ? opts.from : 'top',
      offset: opts.offset ?? defOff,
      autoNorm: opts.autoNorm ?? (opts.width == null && opts.grooveD == null),
    };
    let step;
    App.change('Einstich für Sicherungsring angelegt', (doc) => {
      step = Model.newItem('circlipGroove', p, { name: opts.name || T('kind.circlipGroove'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(`Einstich ${norm === 'din472' ? 'DIN 472' : 'DIN 471'} (Nut ${fmt(p.width, 2)} mm, Grund Ø ${fmt(p.grooveD, 2)} mm) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startCirclipGroove(opts = {}) {
    return startCylStep(T('kind.circlipGroove'), '<b>Einstich für Sicherungsring:</b> Klick auf eine Welle (DIN 471) oder Bohrung (DIN 472). <b>Esc</b> bricht ab.', circlipGroove, null, opts);
  }
  function renderCirclipGroove(it, sec, setP) {
    const p = it.p || {};
    const norm = p.norm === 'din472' ? 'din472' : 'din471';
    const dFace = p.face && p.face.r ? round(2 * p.face.r, 3) : 20;
    const ce = circlipEntry(p.size ?? dFace, norm);
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'cg-norm', label: 'Norm', value: norm,
      options: [['din471', 'DIN 471 (Welle, außen)'], ['din472', 'DIN 472 (Bohrung, innen)']],
      onChange: (v) => App.change('Einstich-Norm geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        item.p.norm = v === 'din472' ? 'din472' : 'din471';
        const nextCe = circlipEntry(dFace, item.p.norm);
        item.p.size = nextCe.d1;
        item.p.width = nextCe.m;
        item.p.grooveD = nextCe.d2;
        item.p.autoNorm = true;
      }),
    }));
    fl.append(UI.selectField({
      id: 'cg-size', label: 'Nenngröße (d₁)', value: String(ce.d1),
      options: norm === 'din472' ? CIRCLIP_472_OPTIONS : CIRCLIP_471_OPTIONS,
      onChange: (v) => App.change('Sicherungsring-Größe geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const nCe = circlipEntry(parseFloat(v) || dFace, item.p.norm || norm);
        item.p.size = nCe.d1;
        item.p.width = nCe.m;
        item.p.grooveD = nCe.d2;
        item.p.autoNorm = true;
      }),
    }));
    fl.append(
      UI.numField({ id: 'cg-width', label: 'Nutbreite (m)', value: p.width ?? ce.m, min: 0.1, unit: 'mm', onCommit: (v) => App.change('Nutbreite geändert', (doc) => { const f = Model.find(doc, it.id).item; f.p.width = v; f.p.autoNorm = false; }) }),
      UI.numField({ id: 'cg-grooveD', label: 'Nutdurchmesser (d₂)', value: p.grooveD ?? ce.d2, min: 0.2, unit: 'mm', onCommit: (v) => App.change('Nutdurchmesser geändert', (doc) => { const f = Model.find(doc, it.id).item; f.p.grooveD = v; f.p.autoNorm = false; }) }),
      UI.selectField({ id: 'cg-from', label: 'Lage messen von', value: p.from === 'bottom' || p.from === 'center' ? p.from : 'top', options: [['top', 'Ende 1 (oben)'], ['bottom', 'Ende 2 (unten)'], ['center', 'Mitte']], onChange: (v) => setP('from', v) }),
      UI.numField({ id: 'cg-offset', label: 'Abstand', value: p.offset ?? 3, unit: 'mm', onCommit: (v) => setP('offset', v) }),
    );
    sec.append(fl);
    sec.append(h('div', { class: 'mini-row', id: 'cg-info' },
      h('span', { class: 'grow' }, `${norm === 'din472' ? 'DIN 472' : 'DIN 471'} · Ø ${ce.d1} mm`),
      h('b', { class: 'mono' }, `Ring s = ${Units.fmtLenU(ce.s, 2)}`)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'cg-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickStepCylFace(it.id, 'Zylinderfläche für Einstich gewählt');
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'cg-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Sticht eine rechteckige Nut nach DIN 471 (Welle) oder DIN 472 (Bohrung) passend zum Durchmesser ein.' }));
  }

  // Passfeder-Nut (DIN 6885) direkt auf einer Welle oder Bohrung
  function keyway(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Passfeder-Nut gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveCylForStep(face);
    if (!ctx) { startKeyway(opts); return null; }
    const ke = opts.size ? keyEntry(opts.size) : keyEntryForShaft(ctx.d);
    const defDepth = ctx.isInner ? ke.t2_mm : ke.t1_mm;
    const maxLen = Math.max(ke.b_mm + 2, ctx.g.faceLen * 0.72);
    const normLens = Array.isArray(ke.laengen_mm) ? ke.laengen_mm.filter((l) => l <= maxLen) : [];
    const defLen = normLens.length ? normLens[normLens.length - 1] : round(clamp(ctx.g.faceLen * 0.6, Math.max(ke.b_mm + 2, 6), Math.max(ke.b_mm + 2, ctx.g.faceLen - 2)), 1);
    const ends = opts.ends === 'straight' || opts.ends === 'round' ? opts.ends : (ctx.isInner ? 'straight' : 'round');
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      size: ke.id,
      width: opts.width ?? ke.b_mm,
      depth: opts.depth ?? defDepth,
      length: opts.length ?? defLen,
      ends,
      from: opts.from === 'top' || opts.from === 'bottom' ? opts.from : 'center',
      offset: opts.offset ?? 0,
      angle: opts.angle ?? 0,
    };
    let step;
    App.change('Passfeder-Nut angelegt', (doc) => {
      step = Model.newItem('keyway', p, { name: opts.name || T('kind.keyway'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(`Passfeder-Nut DIN 6885 (${ke.id}, Breite ${fmt(p.width, 1)} mm, Tiefe ${fmt(p.depth, 1)} mm) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startKeyway(opts = {}) {
    return startCylStep(T('kind.keyway'), '<b>Passfeder-Nut:</b> Klick auf eine Welle (t₁) oder Nabenbohrung (t₂). <b>Esc</b> bricht ab.', keyway, null, opts);
  }
  function renderKeyway(it, sec, setP) {
    const p = it.p || {};
    const isInner = p.face && p.face.ori === -1;
    const ke = keyEntry(p.size || '6x6');
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'kw-size', label: 'DIN 6885 Größe', value: ke ? ke.id : '6x6',
      options: KEY_OPTIONS,
      onChange: (v) => App.change('Passfeder-Größe geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        const nke = keyEntry(v);
        item.p.size = nke ? nke.id : v;
        if (nke) {
          item.p.width = nke.b_mm;
          item.p.depth = isInner ? nke.t2_mm : nke.t1_mm;
        }
      }),
    }));
    fl.append(
      UI.numField({ id: 'kw-width', label: 'Nutbreite (b)', value: p.width ?? (ke ? ke.b_mm : 6), min: 0.2, unit: 'mm', onCommit: (v) => setP('width', v) }),
      UI.numField({ id: 'kw-depth', label: isInner ? 'Nabentiefe (t₂)' : 'Wellentiefe (t₁)', value: p.depth ?? (ke ? (isInner ? ke.t2_mm : ke.t1_mm) : 3.5), min: 0.1, unit: 'mm', onCommit: (v) => setP('depth', v) }),
      UI.numField({ id: 'kw-length', label: 'Länge (l)', value: p.length ?? 20, min: 0.5, unit: 'mm', onCommit: (v) => setP('length', v) }),
      UI.selectField({ id: 'kw-ends', label: 'Nut-Enden', value: p.ends === 'straight' ? 'straight' : 'round', options: [['round', 'Rundstirnig (Form A)'], ['straight', 'Gerade (Form B / Nabe)']], onChange: (v) => setP('ends', v) }),
      UI.selectField({ id: 'kw-from', label: 'Lage längs', value: p.from === 'top' || p.from === 'bottom' ? p.from : 'center', options: [['center', 'Mittig'], ['top', 'Von Ende 1 (oben)'], ['bottom', 'Von Ende 2 (unten)']], onChange: (v) => setP('from', v) }),
      UI.numField({ id: 'kw-offset', label: 'Versatz längs', value: p.offset ?? 0, unit: 'mm', onCommit: (v) => setP('offset', v) }),
      UI.numField({ id: 'kw-angle', label: 'Winkel um Achse', value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }),
    );
    sec.append(fl);
    if (ke) {
      sec.append(h('div', { class: 'mini-row', id: 'kw-info' },
        h('span', { class: 'grow' }, `DIN 6885 ${ke.b_mm}×${ke.h_mm} (Welle Ø ${ke.welle_min_mm}–${ke.welle_max_mm})`),
        h('b', { class: 'mono' }, `t₁=${Units.fmtLenU(ke.t1_mm, 2)} / t₂=${Units.fmtLenU(ke.t2_mm, 2)}`)));
    }
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'kw-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickStepCylFace(it.id, 'Zylinderfläche für Passfeder-Nut gewählt');
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'kw-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Fräst eine normgerechte Passfeder-Nut nach DIN 6885 (Welle t₁ rundstirnig oder Nabe t₂ gerade) direkt in die gewählte Zylinderfläche.' }));
  }

  // Keilwellen-Profil (DIN ISO 14) auf bestehender Welle oder Bohrung
  function splineProfile(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Keilwellen-Profil gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveCylForStep(face);
    if (!ctx) { startSplineProfile(opts); return null; }
    const sp = opts.profile && opts.profile !== 'custom' ? splineEntry(opts.profile) : splineEntryForDia(ctx.d, ctx.isInner);
    const rootD = opts.rootD ?? (ctx.isInner
      ? (Math.abs(ctx.d - sp.d) < 0.25 ? sp.D : round(ctx.d + (sp.D - sp.d), 2))
      : (Math.abs(ctx.d - sp.D) < 0.25 ? sp.d : round(Math.max(1, ctx.d - (sp.D - sp.d)), 2)));
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      profile: opts.profile || sp.id,
      teeth: opts.teeth ?? sp.n,
      rootD,
      b: opts.b ?? sp.b,
      length: opts.length ?? 0,
      from: opts.from === 'bottom' ? 'bottom' : 'top',
      offset: opts.offset ?? 0,
      angle: opts.angle ?? 0,
    };
    let step;
    App.change('Keilwellen-Profil angelegt', (doc) => {
      step = Model.newItem('splineProfile', p, { name: opts.name || T('kind.splineProfile'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(`Keilwellen-Profil DIN ISO 14 (${p.teeth} Keile, Grund Ø ${fmt(p.rootD, 1)} mm) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startSplineProfile(opts = {}) {
    return startCylStep(T('kind.splineProfile'), '<b>Keilwellen-Profil:</b> Klick auf eine Welle oder Nabenbohrung. <b>Esc</b> bricht ab.', splineProfile, null, opts);
  }
  function renderSplineProfile(it, sec, setP) {
    const p = it.p || {};
    const isInner = p.face && p.face.ori === -1;
    const dFace = p.face && p.face.r ? round(2 * p.face.r, 3) : 20;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'sp-profile', label: 'DIN ISO 14 Profil', value: p.profile || '6x16x20',
      options: [...SPLINE_OPTIONS, ['custom', 'Eigene Maße']],
      onChange: (v) => App.change('Keilwellen-Profil geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        item.p.profile = v;
        if (v !== 'custom') {
          const sp = splineEntry(v);
          item.p.teeth = sp.n;
          item.p.b = sp.b;
          item.p.rootD = isInner
            ? (Math.abs(dFace - sp.d) < 0.25 ? sp.D : round(dFace + (sp.D - sp.d), 2))
            : (Math.abs(dFace - sp.D) < 0.25 ? sp.d : round(Math.max(1, dFace - (sp.D - sp.d)), 2));
        }
      }),
    }));
    const setCustom = (k, val) => App.change('Keilwellen-Maß geändert', (doc) => {
      const f = Model.find(doc, it.id).item;
      f.p[k] = val;
      f.p.profile = 'custom';
    });
    fl.append(
      UI.numField({ id: 'sp-teeth', label: 'Keile (N)', value: p.teeth ?? 6, min: 4, max: 24, step: 1, int: true, unit: '', onCommit: (v) => setCustom('teeth', Math.max(4, Math.min(24, Math.round(Number(v) || 6)))) }),
      UI.numField({ id: 'sp-rootD', label: isInner ? 'Außen-Ø (D)' : 'Innen-Ø (d)', value: p.rootD ?? 16, min: 0.5, unit: 'mm', onCommit: (v) => setCustom('rootD', v) }),
      UI.numField({ id: 'sp-b', label: 'Keilbreite (b)', value: p.b ?? 4, min: 0.2, unit: 'mm', onCommit: (v) => setCustom('b', v) }),
      UI.numField({ id: 'sp-length', label: 'Länge (0 = ganz)', value: p.length ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('length', v) }),
      UI.selectField({ id: 'sp-from', label: 'Von Ende', value: p.from === 'bottom' ? 'bottom' : 'top', options: [['top', 'Ende 1 (oben)'], ['bottom', 'Ende 2 (unten)']], onChange: (v) => setP('from', v) }),
      UI.numField({ id: 'sp-offset', label: 'Abstand vom Ende', value: p.offset ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('offset', v) }),
      UI.numField({ id: 'sp-angle', label: 'Winkel um Achse', value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }),
    );
    sec.append(fl);
    sec.append(h('div', { class: 'mini-row', id: 'sp-info' },
      h('span', { class: 'grow' }, `DIN ISO 14 · ${isInner ? 'Innenprofil' : 'Wellenprofil'}`),
      h('b', { class: 'mono' }, `${p.teeth ?? 6} × ${Units.fmtLenU(p.rootD ?? 16, 1)} × ${Units.fmtLenU(dFace, 1)}`)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'sp-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickStepCylFace(it.id, 'Zylinderfläche für Keilwellen-Profil gewählt');
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'sp-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Schneidet ein geradflankiges Keilwellen-Profil nach DIN ISO 14 in die gewählte Welle oder Nabenbohrung (Länge 0 = über die gesamte Zylinderlänge).' }));
  }

  // ---------- Rändel & Griffmuster (KP-50) ----------
  function knurl(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Rändel gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveCylForStep(face);
    if (!ctx) { startKnurl(opts); return null; }
    if (ctx.isInner) {
      UI.toast('Rändel funktioniert auf der Außenfläche (Mantel) eines Zylinders.', { icon: 'info' });
      return null;
    }
    const style = opts.style === 'straight' || opts.style === 'angled' ? opts.style : 'crossed';
    const pitch = opts.pitch ?? 1.0;
    const autoDepth = opts.autoDepth ?? (opts.depth == null);
    const depth = opts.depth ?? round(Math.max(0.1, (Number(pitch) || 1.0) * 0.38), 3);
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      style,
      pitch,
      depth,
      autoDepth,
      angle: opts.angle ?? 30,
      length: opts.length ?? 0,
      from: opts.from === 'top' || opts.from === 'bottom' ? opts.from : 'center',
      offset: opts.offset ?? 0,
      margin: opts.margin ?? 0,
    };
    let step;
    App.change('Rändel angelegt', (doc) => {
      step = Model.newItem('knurl', p, { name: opts.name || T('kind.knurl'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      const stTxt = style === 'straight' ? 'Gerade' : style === 'angled' ? 'Schräg' : 'Gekreuzt';
      UI.toast(`Rändel (${stTxt}, Teilung ${fmt(Number(pitch) || 1, 2)} mm) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startKnurl(opts = {}) {
    return startCylStep(T('kind.knurl'), '<b>Rändel:</b> Klick auf die Mantelfläche eines Zylinders. <b>Esc</b> bricht ab.', knurl, null, opts);
  }
  function renderKnurl(it, sec, setP) {
    const p = it.p || {};
    const style = p.style === 'straight' || p.style === 'angled' ? p.style : 'crossed';
    const res = App.resolvedOf ? App.resolvedOf(it.id) : null;
    const dFace = p.face && p.face.r ? round(2 * p.face.r, 3) : 20;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'kn-style', label: 'Rändel-Art', value: style,
      options: [['crossed', 'Gekreuzt (Diamant)'], ['straight', 'Gerade (achsparallel)'], ['angled', 'Schräg (geneigt)']],
      onChange: (v) => setP('style', v),
    }));
    fl.append(UI.numField({
      id: 'kn-pitch', label: 'Teilung (t)', value: p.pitch ?? 1.0, min: 0.3, unit: 'mm',
      onCommit: (v) => App.change('Rändel-Teilung geändert', (doc) => {
        const f = Model.find(doc, it.id).item;
        f.p.pitch = v;
        if (f.p.autoDepth !== false) {
          const pv = Model.num(v, Model.vars(doc).v, 1.0);
          if (pv > 0) f.p.depth = round(Math.max(0.08, pv * 0.38), 3);
        }
      }),
    }));
    fl.append(UI.numField({
      id: 'kn-depth', label: 'Rändeltiefe', value: p.depth ?? 0.38, min: 0.05, unit: 'mm',
      onCommit: (v) => App.change('Rändeltiefe geändert', (doc) => {
        const f = Model.find(doc, it.id).item;
        f.p.depth = v;
        f.p.autoDepth = false;
      }),
    }));
    if (style !== 'straight') {
      fl.append(UI.numField({ id: 'kn-angle', label: 'Schrägungswinkel', value: p.angle ?? 30, min: 10, max: 60, unit: '°', onCommit: (v) => setP('angle', v) }));
    }
    fl.append(
      UI.numField({ id: 'kn-length', label: 'Länge (0 = ganz)', value: p.length ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('length', v) }),
      UI.selectField({ id: 'kn-from', label: 'Lage längs', value: p.from === 'top' || p.from === 'bottom' ? p.from : 'center', options: [['center', 'Mittig'], ['top', 'Von Ende 1 (oben)'], ['bottom', 'Von Ende 2 (unten)']], onChange: (v) => setP('from', v) }),
      UI.numField({ id: 'kn-offset', label: 'Versatz längs', value: p.offset ?? 0, unit: 'mm', onCommit: (v) => setP('offset', v) }),
      UI.numField({ id: 'kn-margin', label: 'Randabstand', value: p.margin ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('margin', v) }),
    );
    sec.append(fl);
    const infoLeft = `DIN 82 · Ø ${Units.fmtLenU(dFace, 1)}`;
    const infoRight = res && res.teeth ? `${res.teeth} Zähne${res.rows > 1 ? ` × ${res.rows}` : ''}` : (style === 'straight' ? 'Gerade' : style === 'angled' ? 'Schräg' : 'Gekreuzt');
    sec.append(h('div', { class: 'mini-row', id: 'kn-info' }, h('span', { class: 'grow' }, infoLeft), h('b', { class: 'mono' }, infoRight)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'kn-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickStepCylFace(it.id, 'Zylinderfläche für Rändel gewählt');
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'kn-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Erzeugt ein griffiges Rändel direkt auf dem Zylindermantel (Außen-Ø bleibt exakt erhalten). Länge 0 = über die gesamte Mantellänge.' }));
  }

  function resolveGripFace(face = null) {
    const f = face && face.id != null && face.idx != null ? face : Actions.selectedFace();
    if (!f || !f.info) return null;
    if (f.info.t === 'PLANE') {
      const tgt = resolveTopTarget(f.id);
      const sig = faceSigOf(f);
      if (!tgt || tgt.role === 'hole' || !sig) return null;
      return { isCyl: false, face: f, tgt, faceSpec: sig, isInner: false };
    }
    if (f.info.t === 'CYLINDRE') {
      const ctx = resolveCylForStep(f);
      if (!ctx) return null;
      return { isCyl: true, face: ctx.face, tgt: ctx.tgt, faceSpec: ctx.faceSpec, isInner: ctx.isInner };
    }
    return null;
  }
  function pickGripFace(stepId, hintHtml, onPick) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.id !== stepId && hit.faceIdx >= 0) {
        const tgt = resolveTopTarget(hit.id);
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (tgt && tgt.role !== 'hole' && fi && (fi.t === 'PLANE' || fi.t === 'CYLINDRE')) {
          const info = resolveGripFace({ id: hit.id, idx: hit.faceIdx, info: fi });
          if (info) {
            if (info.isInner) {
              UI.toast('Griffmuster funktioniert auf ebenen Flächen und äußeren Zylindermänteln.', { icon: 'info' });
              return;
            }
            stopPick();
            onPick(info);
            return;
          }
        }
      }
      UI.toast('Bitte klick auf eine ebene Fläche oder einen Zylindermantel.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      const ok = fi && (fi.t === 'PLANE' || fi.t === 'CYLINDRE');
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(hintHtml);
  }
  function gripPattern(face = null, opts = {}) {
    if (App.ctx) { UI.toast('Griffmuster gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return null; }
    const ctx = resolveGripFace(face);
    if (!ctx) { startGripPattern(opts); return null; }
    if (ctx.isInner) {
      UI.toast('Griffmuster funktioniert auf ebenen Flächen und äußeren Zylindermänteln.', { icon: 'info' });
      return null;
    }
    const kind = opts.kind === 'bumps' ? 'bumps' : 'grooves';
    const mode = opts.mode === 'join' || opts.mode === 'cut' ? opts.mode : (kind === 'bumps' ? 'join' : 'cut');
    const p = {
      target: ctx.tgt.id,
      face: ctx.faceSpec,
      kind,
      mode,
      profile: opts.profile === 'round' || opts.profile === 'rect' ? opts.profile : 'v',
      dir: opts.dir === 'axial' ? 'axial' : 'ring',
      layout: opts.layout === 'grid' ? 'grid' : 'staggered',
      shape: opts.shape === 'cone' || opts.shape === 'cyl' ? opts.shape : 'dome',
      pitch: opts.pitch ?? (kind === 'bumps' ? (ctx.isCyl ? 4.0 : 3.5) : 2.5),
      width: opts.width ?? 1.2,
      size: opts.size ?? 2.0,
      depth: opts.depth ?? 0.8,
      margin: opts.margin ?? (ctx.isCyl && kind === 'bumps' ? 2.5 : 2),
      angle: opts.angle ?? 0,
      length: opts.length ?? 0,
      from: opts.from === 'top' || opts.from === 'bottom' ? opts.from : 'center',
      offset: opts.offset ?? 0,
    };
    let step;
    App.change('Griffmuster angelegt', (doc) => {
      step = Model.newItem('gripPattern', p, { name: opts.name || T('kind.gripPattern'), color: ctx.tgt.color, role: 'solid', mat: ctx.tgt.mat });
      insertAtMarker(doc, step);
    });
    if (step) {
      App.select([step.id]);
      UI.toast(`Griffmuster (${kind === 'bumps' ? 'Noppen' : 'Rillen'}) angelegt.`, { icon: 'check' });
    }
    return step || null;
  }
  function startGripPattern(opts = {}) {
    if (App.ctx) { UI.toast('Griffmuster gibt es auf der Hauptebene – beende zuerst die Bauteil-Bearbeitung.', { icon: 'info' }); return false; }
    if (!ribTargets().length) { UI.toast('Für ein Griffmuster braucht es zuerst einen Körper im Projekt.', { icon: 'info' }); return false; }
    const ctx = resolveGripFace();
    if (ctx && !ctx.isInner) { gripPattern(ctx.face, opts); return true; }
    pickGripFace(null, '<b>Griffmuster:</b> Klick auf eine ebene Fläche oder einen Zylindermantel. <b>Esc</b> bricht ab.', (info) => { gripPattern(info.face, opts); });
    return true;
  }
  function pickGripPatternFace(stepId) {
    pickGripFace(stepId, '<b>Fläche für Griffmuster wählen:</b> Klick auf eine ebene Fläche oder einen Zylindermantel. <b>Esc</b> bricht ab.', (info) => {
      App.change('Fläche für Griffmuster gewählt', (doc) => {
        const f = Model.find(doc, stepId); if (!f) return false;
        f.item.p.target = info.tgt.id;
        f.item.p.face = info.faceSpec;
      });
      UI.toast('Fläche aktualisiert.', { icon: 'check' });
    });
  }
  function renderGripPattern(it, sec, setP) {
    const p = it.p || {};
    const kind = p.kind === 'bumps' ? 'bumps' : 'grooves';
    const mode = p.mode === 'join' || p.mode === 'cut' ? p.mode : (kind === 'bumps' ? 'join' : 'cut');
    const isCyl = !!(p.face && p.face.t === 'CYLINDRE');
    const res = App.resolvedOf ? App.resolvedOf(it.id) : null;
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'gp-kind', label: 'Muster-Art', value: kind,
      options: [['grooves', 'Rillen'], ['bumps', 'Noppen']],
      onChange: (v) => App.change('Griffmuster-Art geändert', (doc) => {
        const item = Model.find(doc, it.id).item;
        item.p.kind = v === 'bumps' ? 'bumps' : 'grooves';
        item.p.mode = item.p.kind === 'bumps' ? 'join' : 'cut';
        if (item.p.kind === 'bumps' && (Number(item.p.pitch) || 0) <= 2.6) item.p.pitch = isCyl ? 4.0 : 3.5;
        if (item.p.kind === 'grooves' && (Number(item.p.pitch) || 0) >= 3.4) item.p.pitch = 2.5;
      }),
    }));
    fl.append(UI.selectField({
      id: 'gp-mode', label: 'Ausführung', value: mode,
      options: [['cut', 'Vertieft (eingeschnitten)'], ['join', 'Erhaben (aufgesetzt)']],
      onChange: (v) => setP('mode', v),
    }));
    if (kind === 'grooves') {
      if (isCyl) {
        fl.append(UI.selectField({
          id: 'gp-dir', label: 'Richtung', value: p.dir === 'axial' ? 'axial' : 'ring',
          options: [['ring', 'Ringrillen (umlaufend)'], ['axial', 'Längsrillen (achsparallel)']],
          onChange: (v) => setP('dir', v),
        }));
      }
      fl.append(UI.selectField({
        id: 'gp-profile', label: 'Profil', value: p.profile === 'round' || p.profile === 'rect' ? p.profile : 'v',
        options: [['v', 'V-Profil'], ['round', 'Rund'], ['rect', 'Rechteck']],
        onChange: (v) => setP('profile', v),
      }));
      fl.append(
        UI.numField({ id: 'gp-width', label: 'Rillenbreite', value: p.width ?? 1.2, min: 0.2, unit: 'mm', onCommit: (v) => setP('width', v) }),
        UI.numField({ id: 'gp-pitch', label: 'Teilung / Abstand', value: p.pitch ?? 2.5, min: 0.4, unit: 'mm', onCommit: (v) => setP('pitch', v) }),
        UI.numField({ id: 'gp-depth', label: mode === 'join' ? 'Höhe' : 'Tiefe', value: p.depth ?? 0.8, min: 0.1, unit: 'mm', onCommit: (v) => setP('depth', v) }),
      );
    } else {
      fl.append(UI.selectField({
        id: 'gp-shape', label: 'Noppenform', value: p.shape === 'cone' || p.shape === 'cyl' ? p.shape : 'dome',
        options: [['dome', 'Halbkugel (Kuppe)'], ['cone', 'Kegel'], ['cyl', 'Zylinder']],
        onChange: (v) => setP('shape', v),
      }));
      fl.append(UI.selectField({
        id: 'gp-layout', label: 'Anordnung', value: p.layout === 'grid' ? 'grid' : 'staggered',
        options: [['staggered', 'Versetzt'], ['grid', 'Raster']],
        onChange: (v) => setP('layout', v),
      }));
      fl.append(
        UI.numField({ id: 'gp-size', label: 'Noppen-Ø', value: p.size ?? 2.0, min: 0.4, unit: 'mm', onCommit: (v) => setP('size', v) }),
        UI.numField({ id: 'gp-pitch', label: 'Mittenabstand', value: p.pitch ?? (isCyl ? 4.0 : 3.5), min: 0.6, unit: 'mm', onCommit: (v) => setP('pitch', v) }),
        UI.numField({ id: 'gp-depth', label: mode === 'join' ? 'Höhe' : 'Tiefe', value: p.depth ?? 0.8, min: 0.1, unit: 'mm', onCommit: (v) => setP('depth', v) }),
      );
    }
    fl.append(UI.numField({ id: 'gp-margin', label: 'Randabstand', value: p.margin ?? 2, min: 0, unit: 'mm', onCommit: (v) => setP('margin', v) }));
    if (!isCyl) {
      fl.append(UI.numField({ id: 'gp-angle', label: 'Drehwinkel', value: p.angle ?? 0, unit: '°', onCommit: (v) => setP('angle', v) }));
    } else {
      fl.append(
        UI.numField({ id: 'gp-length', label: 'Länge (0 = ganz)', value: p.length ?? 0, min: 0, unit: 'mm', onCommit: (v) => setP('length', v) }),
        UI.selectField({ id: 'gp-from', label: 'Lage längs', value: p.from === 'top' || p.from === 'bottom' ? p.from : 'center', options: [['center', 'Mittig'], ['top', 'Von Ende 1 (oben)'], ['bottom', 'Von Ende 2 (unten)']], onChange: (v) => setP('from', v) }),
        UI.numField({ id: 'gp-offset', label: 'Versatz längs', value: p.offset ?? 0, unit: 'mm', onCommit: (v) => setP('offset', v) }),
      );
    }
    sec.append(fl);
    const cntTxt = res && res.count != null ? `${res.count}×` : '–';
    sec.append(h('div', { class: 'mini-row', id: 'gp-info' }, h('span', { class: 'grow' }, `${isCyl ? 'Zylinder' : 'Fläche'} · ${kind === 'bumps' ? 'Noppen' : 'Rillen'}`), h('b', { class: 'mono' }, cntTxt)));
    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'gp-pick' }); pb.innerHTML = icon('cursor') + 'Andere Fläche wählen';
    pb.onclick = () => pickGripPatternFace(it.id);
    row.append(pb);
    if (p.target && Model.find(App.doc, p.target)) {
      const gb = h('button', { type: 'button', class: 'btn small', id: 'gp-goto' }); gb.innerHTML = icon('pointer') + esc(T('ctx.targetBody'));
      gb.onclick = () => App.select([p.target]);
      row.append(gb);
    }
    sec.append(row, h('div', { class: 'hint-box', html: 'Legt rutschfeste Rillen oder Noppen (erhaben oder vertieft) auf ebenen Flächen oder Zylindermänteln an.' }));
  }

  // ---------- Bohrung durch Stapel & Baugruppen-Schnitt (BG-24, BG-25) ----------
  function pickStackHolePoint(stepId = null, cb = null) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0 && hit.normal) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE') {
          const sn = (e.ctrlKey || e.metaKey) ? null : Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal });
          const pt = sn ? sn.point : hit.point;
          const nn = ((sn && sn.normal) || hit.normal).clone().normalize();
          const dir = [-round(nn.x, 6), -round(nn.y, 6), -round(nn.z, 6)];
          const x = round(pt.x, 4), y = round(pt.y, 4), z = round(pt.z, 4);
          const face = { id: hit.id, idx: hit.faceIdx, info: fi, point: pt.toArray(), normal: nn.toArray() };
          stopPick();
          Snap.clear();
          if (cb) { cb({ face, x, y, z, dir }); return; }
          if (stepId) {
            App.change(T('asm.stackHoleMovedUndo'), (doc) => {
              const f = Model.find(doc, stepId);
              if (!f || f.item.kind !== 'stackHole') return false;
              f.item.p.x = x;
              f.item.p.y = y;
              f.item.p.z = z;
              f.item.p.dir = dir;
            });
            UI.toast('Bohrungsstelle aktualisiert.', { icon: 'check' });
          }
          return;
        }
      }
      UI.toast('Bitte klick auf eine ebene Fläche eines Teils.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(T('asm.stackHolePickHint'));
  }

  function pickAsmCutFace(cb) {
    stopPick();
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      if (hit && hit.faceIdx >= 0 && hit.normal) {
        const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
        if (fi && fi.t === 'PLANE') {
          stopPick();
          cb({ id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null, normal: hit.normal.toArray() });
          return;
        }
      }
      UI.toast('Bitte klick auf eine ebene Fläche eines Teils.', { icon: 'info' });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true });
      const fi = hit && hit.faceIdx >= 0 ? App.results.get(hit.id)?.data?.faces?.[hit.faceIdx] : null;
      Viewer.highlightFace('hover', fi && fi.t === 'PLANE' ? hit.id : null, fi && fi.t === 'PLANE' ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    picking = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    UI.hint(T('asm.cutPickFaceHint'));
  }

  function cutTargetsSummary(it) {
    const res = App.resolvedOf ? App.resolvedOf(it.id) : null;
    const ids = res && Array.isArray(res.cutIds) ? res.cutIds : [];
    if (!ids.length) return { cls: 'hint-box', text: T('asm.cutCountNone') };
    const names = ids.map((id) => {
      const f = Model.find(App.doc, id);
      return f ? Model.label(f.item) : id;
    });
    return { cls: 'mini-row', count: ids.length, names: names.join(', ') };
  }

  function renderCutTargetScope(it, sec, scopeId, attrKey, avail) {
    const p = it.p || {};
    const scope = p.scope === 'selected' ? 'selected' : 'auto';
    sec.append(UI.selectField({
      id: scopeId,
      label: T('asm.scopeLabel'),
      value: scope,
      options: [['auto', T('asm.scopeAuto')], ['selected', T('asm.scopeSelected')]],
      onChange: (v) => App.change('Ziel-Umfang geändert', (doc) => {
        const x = Model.find(doc, it.id);
        if (!x) return false;
        x.item.p.scope = v;
        if (v === 'selected' && (!Array.isArray(x.item.p.targets) || !x.item.p.targets.length)) {
          const res = App.resolvedOf ? App.resolvedOf(it.id) : null;
          const fromRes = res && Array.isArray(res.cutIds) && res.cutIds.length ? res.cutIds : null;
          x.item.p.targets = fromRes ? fromRes.slice() : avail.map((t) => t.id);
        }
      }),
    }));
    if (scope === 'selected') {
      const curTargets = Array.isArray(p.targets) ? p.targets : [];
      const box = h('div', { class: 'mini-list', style: { marginTop: '6px' } });
      if (!avail.length) {
        box.append(h('div', { class: 'hint-box' }, T('asm.needPart')));
      } else {
        for (const t of avail) {
          const chk = h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: curTargets.includes(t.id), dataset: { [attrKey]: t.id } }),
            Model.label(t));
          chk.querySelector('input').onchange = (e) => {
            App.change('Zielteile geändert', (doc) => {
              const x = Model.find(doc, it.id);
              if (!x) return false;
              const arr = Array.isArray(x.item.p.targets) ? x.item.p.targets.slice() : [];
              if (e.target.checked) { if (!arr.includes(t.id)) arr.push(t.id); }
              else { const idx = arr.indexOf(t.id); if (idx >= 0) arr.splice(idx, 1); }
              x.item.p.targets = arr;
            });
          };
          box.append(chk);
        }
      }
      sec.append(box);
    }
  }

  function renderStackHole(it, sec, setP) {
    const p = it.p || {};
    const V = Model.itemVars(App.doc, it.id);
    const ht = p.holeType === 'through' || p.holeType === 'blind' || p.holeType === 'fit' ? p.holeType : 'simple';
    const avail = typeof Assembly !== 'undefined' && Assembly.assemblyPartTargets ? Assembly.assemblyPartTargets(App.doc, it) : activeTargetsBefore(it).filter((x) => x.role !== 'hole');
    const sum = cutTargetsSummary(it);
    if (sum.count) {
      sec.append(h('div', { class: 'mini-row', id: 'sh-cut-info' }, h('span', { class: 'grow' }, T('asm.cutCountSome', { n: sum.count })), h('b', { class: 'mono' }, sum.names)));
    } else {
      sec.append(h('div', { class: 'hint-box', id: 'sh-cut-info' }, sum.text));
    }

    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'sh-type',
      label: T('asm.holeTypeLabel'),
      value: ht,
      options: [
        ['simple', T('asm.holeTypeSimple')],
        ['through', T('asm.holeTypeThrough')],
        ['blind', T('asm.holeTypeBlind')],
        ['fit', T('asm.holeTypeFit')],
      ],
      onChange: (v) => App.change('Bohrungsart geändert', (doc) => {
        const x = Model.find(doc, it.id);
        if (!x) return false;
        x.item.p.holeType = v;
        if (v === 'blind') x.item.p.thru = false;
      }),
    }));
    if (ht === 'through') {
      const sizes = typeof threadSizesForNorm === 'function' ? threadSizesForNorm('metric') : ['M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'];
      fl.append(
        UI.selectField({ id: 'sh-size', label: T('asm.holeSizeLabel'), value: sizes.includes(p.size) ? p.size : 'M4', options: sizes, onChange: (v) => setP('size', v) }),
        UI.selectField({ id: 'sh-head', label: T('asm.holeHeadLabel'), value: p.head || 'none', options: [['none', T('asm.holeHeadNone')], ['countersunk', T('asm.holeHeadCsk')], ['counterbore', T('asm.holeHeadCb')]], onChange: (v) => setP('head', v) }),
        UI.selectField({ id: 'sh-fit', label: T('asm.holeFitLabel'), value: p.fit || 'medium', options: [['medium', T('asm.holeFitMed')], ['fine', T('asm.holeFitFine')], ['coarse', T('asm.holeFitCoarse')]], onChange: (v) => setP('fit', v) }),
      );
    } else {
      fl.append(UI.numField({ id: 'sh-d', label: ht === 'fit' ? T('asm.holeFitDLabel') : T('asm.holeDLabel'), value: p.d ?? 6, min: 0.2, unit: 'mm', vars: V, onCommit: (v) => setP('d', v) }));
      if (ht === 'blind') {
        const tipOpts = typeof LIBMAP !== 'undefined' && LIBMAP.blindHole && LIBMAP.blindHole.params[2]
          ? LIBMAP.blindHole.params[2].options
          : [['118', '118° (Standardbohrer)'], ['180', '180° (flacher Boden)']];
        fl.append(UI.selectField({ id: 'sh-tip', label: T('asm.holeTipLabel'), value: String(p.tipAngle ?? 118), options: tipOpts, onChange: (v) => setP('tipAngle', Number(v)) }));
      }
    }
    sec.append(fl);

    if (ht !== 'blind') {
      const thru = h('label', { class: 'check', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', id: 'sh-thru', checked: p.thru !== false }), T('asm.holeThru'));
      thru.querySelector('input').onchange = (e) => setP('thru', e.target.checked);
      sec.append(thru);
    }
    if (p.thru === false || ht === 'blind') {
      sec.append(h('div', { style: { marginTop: '6px' } }, UI.numField({ id: 'sh-depth', label: T('asm.holeDepthLabel'), value: p.depth ?? 20, min: 0.2, unit: 'mm', vars: V, onCommit: (v) => setP('depth', v) })));
    }

    const posF = h('div', { class: 'fields three', style: { marginTop: '8px' } });
    posF.append(
      UI.numField({ id: 'sh-x', label: 'X', value: p.x ?? 0, unit: 'mm', vars: V, onCommit: (v) => setP('x', v) }),
      UI.numField({ id: 'sh-y', label: 'Y', value: p.y ?? 0, unit: 'mm', vars: V, onCommit: (v) => setP('y', v) }),
      UI.numField({ id: 'sh-z', label: 'Z', value: p.z ?? 0, unit: 'mm', vars: V, onCommit: (v) => setP('z', v) }),
    );
    sec.append(posF);

    const row = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
    const pb = h('button', { type: 'button', class: 'btn small', id: 'sh-pick-face' });
    pb.innerHTML = icon('cursor') + esc(T('asm.holePickBtn'));
    pb.onclick = () => pickStackHolePoint(it.id);
    const fb = h('button', { type: 'button', class: 'btn small', id: 'sh-flip' });
    fb.innerHTML = icon('replace') + esc(T('asm.holeFlipBtn'));
    fb.onclick = () => App.change('Bohrrichtung umgekehrt', (doc) => {
      const x = Model.find(doc, it.id);
      if (!x) return false;
      const d = Array.isArray(x.item.p.dir) ? x.item.p.dir : [0, 0, -1];
      x.item.p.dir = [-Number(d[0] || 0), -Number(d[1] || 0), -Number(d[2] || -1)];
    });
    row.append(pb, fb);
    sec.append(row);

    const scopeWrap = h('div', { style: { marginTop: '8px' } });
    renderCutTargetScope(it, scopeWrap, 'sh-scope', 'shTarget', avail);
    sec.append(scopeWrap);
    sec.append(h('div', { class: 'hint-box' }, T('asm.stackHoleHint')));
  }

  function renderAsmCut(it, sec, setP) {
    const p = it.p || {};
    const V = Model.itemVars(App.doc, it.id);
    const avail = typeof Assembly !== 'undefined' && Assembly.assemblyPartTargets ? Assembly.assemblyPartTargets(App.doc, it) : activeTargetsBefore(it).filter((x) => x.role !== 'hole');
    const sum = cutTargetsSummary(it);
    if (sum.count) {
      sec.append(h('div', { class: 'mini-row', id: 'ac-cut-info' }, h('span', { class: 'grow' }, T('asm.cutCountSome', { n: sum.count })), h('b', { class: 'mono' }, sum.names)));
    } else {
      sec.append(h('div', { class: 'hint-box', id: 'ac-cut-info' }, sum.text));
    }

    const row = h('div', { class: 'btn-row', style: { marginTop: '6px' } });
    const eb = h('button', { type: 'button', class: 'btn small primary', id: 'ac-edit-sketch' });
    eb.innerHTML = icon('edit') + esc(T('panel.item.editSketch'));
    eb.onclick = () => Sketch.editItem(it.id);
    row.append(eb);
    sec.append(row);

    const thru = h('label', { class: 'check', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', id: 'ac-thru', checked: p.thru !== false }), T('asm.holeThru'));
    thru.querySelector('input').onchange = (e) => setP('thru', e.target.checked);
    sec.append(thru);

    const fl = h('div', { class: 'fields', style: { marginTop: '6px' } });
    fl.append(UI.selectField({
      id: 'ac-dir',
      label: T('asm.cutDirLabel'),
      value: p.dir || 'reverse',
      options: [
        ['reverse', T('asm.cutDirReverse')],
        ['normal', T('asm.cutDirNormal')],
        ['both', T('asm.cutDirBoth')],
        ['two', T('asm.cutDirTwo')],
      ],
      onChange: (v) => setP('dir', v),
    }));
    if (p.thru === false) {
      fl.append(UI.numField({ id: 'ac-dist', label: T('asm.cutDistLabel'), value: p.dist ?? 20, min: 0.1, unit: 'mm', vars: V, onCommit: (v) => setP('dist', v) }));
      if (p.dir === 'two') {
        fl.append(UI.numField({ id: 'ac-dist2', label: T('asm.cutDist2Label'), value: p.dist2 ?? p.dist ?? 20, min: 0.1, unit: 'mm', vars: V, onCommit: (v) => setP('dist2', v) }));
      }
    }
    sec.append(fl);

    const scopeWrap = h('div', { style: { marginTop: '8px' } });
    renderCutTargetScope(it, scopeWrap, 'ac-scope', 'acTarget', avail);
    sec.append(scopeWrap);
    sec.append(h('div', { class: 'hint-box' }, T('asm.cutHint')));
  }

  // ---------- Kabel und Schläuche (BG-34): 3D-Anschlüsse klicken & Eigenschaften-Panel ----------
  let cablePick = null;
  function clearCableOverlay() {
    if (cablePick && cablePick.obj) {
      Viewer.groups.overlay.remove(cablePick.obj);
      cablePick.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      cablePick.obj = null;
    }
  }
  function stopCablePick() {
    if (!cablePick) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', cablePick.down, true);
    cv.removeEventListener('pointerup', cablePick.up, true);
    cv.removeEventListener('pointermove', cablePick.move);
    window.removeEventListener('keydown', cablePick.key, true);
    clearCableOverlay();
    if (cablePick.bar) cablePick.bar.remove();
    if (typeof Snap !== 'undefined' && Snap.clear) Snap.clear();
    cv.style.cursor = '';
    UI.hint(null);
    cablePick = null;
    Viewer.requestRender();
  }
  function cableHitAt(cx, cy, fallbackZ = 0, ignoreCtrl = false) {
    const hit = Viewer.pick(cx, cy, { solidsOnly: true, noEdges: true });
    if (hit && hit.normal) {
      const sn = (!ignoreCtrl && hit.faceIdx >= 0 && typeof Snap !== 'undefined' && Snap.onFace)
        ? Snap.onFace(hit.id, hit.faceIdx, hit.point, { normal: hit.normal })
        : null;
      const ptV = sn ? sn.point : hit.point;
      const nn = ((sn && sn.normal) || hit.normal).clone().normalize();
      const WI = Model.worldMatrix(App.doc, hit.id).invert();
      const lp = ptV.clone().applyMatrix4(WI).toArray().map((v) => round(v, 4));
      const ln = nn.clone().transformDirection(WI).normalize().toArray().map((v) => round(v, 6));
      return {
        pt: ptV.toArray().map((v) => round(v, 3)),
        dir: nn.toArray().map((v) => round(v, 6)),
        bind: { id: hit.id, lp, ln },
      };
    }
    const P = Viewer.pickPlane(cx, cy, fallbackZ);
    if (!P) return null;
    return {
      pt: P.toArray().map((v) => round(v, 3)),
      dir: 'auto',
      bind: null,
    };
  }
  function drawCablePreview(hover) {
    if (!cablePick) return;
    clearCableOverlay();
    const g = new THREE.Group();
    const accent = new THREE.Color(Viewer.theme.accent);
    const dotR = Math.max(0.9, (cablePick.d || 4) * 0.45);
    const addPt = (q, col) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(dotR, 14, 10),
        new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.92 })
      );
      m.position.set(q[0], q[1], q[2]);
      m.renderOrder = 32;
      g.add(m);
    };
    const addNorm = (q, dir, col) => {
      if (!Array.isArray(dir)) return;
      const lenN = Math.max(8, (cablePick.d || 4) * 2.2);
      const ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(q[0], q[1], q[2]),
          new THREE.Vector3(q[0] + dir[0] * lenN, q[1] + dir[1] * lenN, q[2] + dir[2] * lenN),
        ]),
        new THREE.LineBasicMaterial({ color: col, depthTest: false })
      );
      ln.renderOrder = 31;
      g.add(ln);
    };
    if (cablePick.start) {
      addPt(cablePick.start, accent);
      addNorm(cablePick.start, cablePick.dirA, accent);
    }
    if (hover && hover.pt) {
      addPt(hover.pt, accent);
      addNorm(hover.pt, hover.dir, accent);
    }
    const lenEl = cablePick.bar && cablePick.bar.querySelector('#cp-len');
    if (cablePick.start && hover && hover.pt && Math.hypot(hover.pt[0] - cablePick.start[0], hover.pt[1] - cablePick.start[1], hover.pt[2] - cablePick.start[2]) >= 0.5) {
      const cg = Model.cableGeometry({
        d: cablePick.d,
        wall: cablePick.type === 'hose' ? cablePick.wall : 0,
        cable: {
          type: cablePick.type,
          start: cablePick.start,
          end: hover.pt,
          dirA: cablePick.dirA,
          dirB: hover.dir,
          bendR: cablePick.bendR,
          sag: cablePick.sag || 0,
        },
      }, Model.vars(App.doc).v);
      const pts3 = [];
      if (cg.segs.length) {
        for (const s of cg.segs) {
          for (let i = pts3.length ? 1 : 0; i <= 24; i++) {
            const t = i / 24, u = 1 - t;
            pts3.push(new THREE.Vector3(...[0, 1, 2].map((k) => u * u * u * s.a[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.b[k])));
          }
        }
      } else if (cg.pts.length >= 2) {
        pts3.push(new THREE.Vector3(...cg.pts[0]), new THREE.Vector3(...cg.pts[1]));
      }
      if (pts3.length >= 2) {
        const lineCol = cg.bendOk ? accent : new THREE.Color('#e67e22');
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), new THREE.LineBasicMaterial({ color: lineCol, depthTest: false }));
        ln.renderOrder = 30;
        g.add(ln);
      }
      if (lenEl) lenEl.textContent = Units.fmtLenU(cg.length, 1);
    } else if (lenEl) {
      lenEl.textContent = '–';
    }
    Viewer.groups.overlay.add(g);
    cablePick.obj = g;
    Viewer.requestRender();
  }
  function startCablePick(opts = {}) {
    if (!App.doc) return false;
    stopPick(); stopRoute(); stopCablePick();
    const type = opts.type === 'hose' ? 'hose' : 'cable';
    const d = Number(opts.d) > 0 ? Number(opts.d) : (type === 'hose' ? 8 : 4);
    const wall = type === 'hose' ? (Number(opts.wall) >= 0 ? Number(opts.wall) : 1.5) : 0;
    const bendR = Number(opts.bendR) > 0 ? Number(opts.bendR) : Math.max(15, d * 3);
    cablePick = {
      mode: 'new',
      type,
      d,
      wall,
      bendR,
      sag: Number(opts.sag) || 0,
      name: opts.name || '',
      start: null,
      dirA: 'auto',
      bindA: null,
      obj: null,
      at: null,
      bar: null,
    };
    const cv = Viewer.canvas;
    cablePick.down = (e) => { if (e.button === 0) cablePick.at = [e.clientX, e.clientY]; };
    cablePick.move = (e) => {
      if (!cablePick) return;
      const z = cablePick.start ? cablePick.start[2] : 0;
      const h0 = cableHitAt(e.clientX, e.clientY, z, e.ctrlKey || e.metaKey);
      drawCablePreview(h0);
    };
    cablePick.up = (e) => {
      if (e.button !== 0 || !cablePick || !cablePick.at) return;
      const moved = Math.hypot(e.clientX - cablePick.at[0], e.clientY - cablePick.at[1]);
      cablePick.at = null;
      if (moved >= 5) return;
      const z = cablePick.start ? cablePick.start[2] : 0;
      const h0 = cableHitAt(e.clientX, e.clientY, z, e.ctrlKey || e.metaKey);
      if (!h0) return;
      if (!cablePick.start) {
        cablePick.start = h0.pt;
        cablePick.dirA = h0.dir;
        cablePick.bindA = h0.bind;
        UI.hint(T('asm.cablePickHint2'));
        drawCablePreview(h0);
        return;
      }
      const st = cablePick;
      const distAB = Math.hypot(h0.pt[0] - st.start[0], h0.pt[1] - st.start[1], h0.pt[2] - st.start[2]);
      if (distAB < 0.5) {
        UI.toast(T('asm.cableTooCloseErr'), { icon: 'info' });
        return;
      }
      stopCablePick();
      if (typeof Assembly !== 'undefined' && Assembly.createCable) {
        Assembly.createCable({
          type: st.type,
          name: st.name || undefined,
          d: st.d,
          wall: st.wall,
          bendR: st.bendR,
          sag: st.sag,
          start: st.start,
          dirA: st.dirA,
          bindA: st.bindA,
          end: h0.pt,
          dirB: h0.dir,
          bindB: h0.bind,
        });
      }
    };
    cablePick.key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopCablePick(); Panels.renderRight(); }
    };
    const bar = h('div', { class: 'viewbar', id: 'cable-pick-bar', role: 'toolbar', 'aria-label': T('asm.cableTitle') });
    const head = h('div', { class: 'vb-head' }, h('span', { class: 'title' }, T('asm.cableTitle')));
    const xBtn = h('button', { type: 'button', class: 'vb-x', 'aria-label': T('common.cancel'), 'data-tip': T('common.cancel') });
    xBtn.innerHTML = icon('close');
    xBtn.onclick = () => { stopCablePick(); Panels.renderRight(); };
    head.append(xBtn);
    const typeSel = h('select', { id: 'cp-type', class: 'vb-sel', 'aria-label': T('asm.cableTypeLabel') },
      h('option', { value: 'cable', selected: type === 'cable' }, T('asm.cableKindCable')),
      h('option', { value: 'hose', selected: type === 'hose' }, T('asm.cableKindHose')));
    typeSel.onchange = () => {
      cablePick.type = typeSel.value === 'hose' ? 'hose' : 'cable';
      if (cablePick.type === 'hose' && cablePick.wall <= 0) cablePick.wall = 1.5;
      drawCablePreview(null);
    };
    const din = h('input', { type: 'number', id: 'cp-d', class: 'vb-sel', value: cablePick.d, min: 0.4, step: 0.5, 'aria-label': T('param.dia'), style: { width: '58px' } });
    din.onchange = () => { const v = parseFloat(String(din.value).replace(',', '.')); if (v >= 0.4) { cablePick.d = v; drawCablePreview(null); } };
    const rin = h('input', { type: 'number', id: 'cp-r', class: 'vb-sel', value: cablePick.bendR, min: 0.5, step: 1, 'aria-label': T('asm.cableBendRLabel'), style: { width: '58px' } });
    rin.onchange = () => { const v = parseFloat(String(rin.value).replace(',', '.')); if (v >= 0.5) { cablePick.bendR = v; drawCablePreview(null); } };
    bar.append(
      head,
      h('div', { class: 'vb-row' }, typeSel, h('span', { class: 'vb-l' }, 'Ø'), din, h('span', { class: 'vb-l' }, 'R'), rin, h('span', { class: 'vb-l' }, 'L'), h('b', { class: 'mono', id: 'cp-len' }, '–'))
    );
    Views.bars().append(bar);
    cablePick.bar = bar;
    cv.addEventListener('pointerdown', cablePick.down, true);
    cv.addEventListener('pointerup', cablePick.up, true);
    cv.addEventListener('pointermove', cablePick.move);
    window.addEventListener('keydown', cablePick.key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(T('asm.cablePickHint1'));
    drawCablePreview(null);
    return true;
  }
  function pickCablePort(itemId, which = 'start') {
    const f = Model.find(App.doc, itemId);
    if (!f || !f.item || f.item.kind !== 'sweep' || !f.item.p || !f.item.p.cable) return false;
    stopPick(); stopRoute(); stopCablePick();
    const cv = Viewer.canvas;
    cablePick = { mode: 'port', itemId, which, d: Model.num(f.item.p.d, Model.vars(App.doc).v, 4), obj: null, at: null };
    cablePick.down = (e) => { if (e.button === 0) cablePick.at = [e.clientX, e.clientY]; };
    cablePick.move = (e) => {
      if (!cablePick) return;
      const h0 = cableHitAt(e.clientX, e.clientY, 0, e.ctrlKey || e.metaKey);
      drawCablePreview(h0);
    };
    cablePick.up = (e) => {
      if (e.button !== 0 || !cablePick || !cablePick.at) return;
      const moved = Math.hypot(e.clientX - cablePick.at[0], e.clientY - cablePick.at[1]);
      cablePick.at = null;
      if (moved >= 5) return;
      const h0 = cableHitAt(e.clientX, e.clientY, 0, e.ctrlKey || e.metaKey);
      if (!h0) return;
      stopCablePick();
      const WI = Model.worldMatrix(App.doc, itemId).invert();
      const ptL = new THREE.Vector3(...h0.pt).applyMatrix4(WI).toArray().map((v) => round(v, 3));
      const dirL = Array.isArray(h0.dir)
        ? new THREE.Vector3(...h0.dir).transformDirection(WI).normalize().toArray().map((v) => round(v, 6))
        : h0.dir;
      App.change(T('asm.cablePortUndo'), (doc) => {
        const cur = Model.find(doc, itemId);
        if (!cur || !cur.item || !cur.item.p || !cur.item.p.cable) return false;
        const cb = cur.item.p.cable;
        if (which === 'via') {
          cb.via = Array.isArray(cb.via) ? cb.via : [];
          cb.via.push(ptL);
        } else {
          const isA = which === 'start';
          cb[isA ? 'start' : 'end'] = ptL;
          cb[isA ? 'dirA' : 'dirB'] = dirL;
          const bKey = isA ? 'bindA' : 'bindB';
          if (h0.bind) cb[bKey] = h0.bind;
          else delete cb[bKey];
        }
      });
      UI.toast(T('asm.cablePortUpdated'), { icon: 'check' });
    };
    cablePick.key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopCablePick(); Panels.renderRight(); }
    };
    cv.addEventListener('pointerdown', cablePick.down, true);
    cv.addEventListener('pointerup', cablePick.up, true);
    cv.addEventListener('pointermove', cablePick.move);
    window.addEventListener('keydown', cablePick.key, true);
    cv.style.cursor = 'crosshair';
    UI.hint(which === 'via' ? T('asm.cablePickViaHint') : T('asm.cablePickPortHint'));
    return true;
  }
  function renderCable(it, sec, setP) {
    const p = it.p || {};
    const c = p.cable || {};
    const V = Model.itemVars(App.doc, it.id);
    const cm = Model.cableMetrics(p, V);
    const isHose = cm.type === 'hose';
    const minRTxt = isFinite(cm.minBendR) ? `R ${Units.fmtLenU(cm.minBendR, 1)}` : T('asm.cableStraight');
    sec.append(h('div', { class: 'mini-row', id: 'cable-len-info' },
      h('span', { class: 'grow' }, `${T('asm.cableLengthLabel')}: ${Units.fmtLenU(cm.length, 1)}`),
      h('b', { class: 'mono', id: 'cable-minr-val' }, minRTxt)));
    if (!cm.bendOk) {
      sec.append(h('div', { class: 'hint-box warn', id: 'cable-bend-warn' },
        T('asm.cableBendWarn', { minR: Units.fmtLenU(cm.minBendR, 1), req: Units.fmtLenU(cm.bendR, 1) })));
    }
    const fl = h('div', { class: 'fields' });
    fl.append(UI.selectField({
      id: 'cable-type',
      label: T('asm.cableTypeLabel'),
      value: isHose ? 'hose' : 'cable',
      options: [['cable', T('asm.cableKindCable')], ['hose', T('asm.cableKindHose')]],
      onChange: (v) => App.change(T('asm.cableEditUndo'), (doc) => {
        const cur = Model.find(doc, it.id);
        if (!cur || !cur.item || !cur.item.p || !cur.item.p.cable) return false;
        const nextType = v === 'hose' ? 'hose' : 'cable';
        cur.item.p.cable.type = nextType;
        if (nextType === 'hose' && !(Number(cur.item.p.wall) > 0)) {
          cur.item.p.wall = round(Math.min(1.5, Math.max(0.4, (Number(cur.item.p.d) || 8) * 0.2)), 2);
        } else if (nextType === 'cable') {
          cur.item.p.wall = 0;
        }
      }),
    }));
    fl.append(UI.numField({ id: 'cable-d', label: T('param.dia'), value: p.d ?? cm.d, min: 0.4, unit: 'mm', vars: V, onCommit: (v) => setP('d', v) }));
    if (isHose) {
      fl.append(UI.numField({ id: 'cable-wall', label: T('asm.cableWallLabel'), value: p.wall ?? cm.wall, min: 0.1, unit: 'mm', vars: V, onCommit: (v) => setP('wall', v) }));
    }
    const setC = (key, val, mergeKey = null) => App.change(T('asm.cableEditUndo'), (doc) => {
      const cur = Model.find(doc, it.id);
      if (!cur || !cur.item || !cur.item.p || !cur.item.p.cable) return false;
      cur.item.p.cable[key] = val;
    }, mergeKey ? { merge: mergeKey } : undefined);
    fl.append(
      UI.numField({ id: 'cable-bendr', label: T('asm.cableBendRLabel'), value: c.bendR ?? cm.bendR, min: 0.5, unit: 'mm', vars: V, onCommit: (v) => setC('bendR', v) }),
      UI.numField({ id: 'cable-sag', label: T('asm.cableSagLabel'), value: c.sag ?? 0, unit: 'mm', vars: V, onCommit: (v) => setC('sag', v) }),
    );
    sec.append(fl);

    const dirOptions = (curDir) => {
      const opts = [
        ['auto', T('asm.cableDirAuto')],
        ['+X', '+X'], ['-X', '−X'],
        ['+Y', '+Y'], ['-Y', '−Y'],
        ['+Z', '+Z'], ['-Z', '−Z'],
      ];
      if (Array.isArray(curDir)) opts.push(['__custom', T('asm.cableDirFace')]);
      return opts;
    };
    const renderPort = (which, title, ptKey, dirKey, bindKey, pfx) => {
      const pt = Array.isArray(c[ptKey]) ? c[ptKey] : (which === 'start' ? cm.start : cm.end);
      const rawDir = c[dirKey];
      const box = h('div', { class: 'p3-list', style: { marginTop: '8px' } });
      box.append(h('div', { class: 'mini-row' }, h('b', null, title)));
      const pr = h('div', { class: 'fields three p3-row' });
      ['x', 'y', 'z'].forEach((ax, k) => {
        pr.append(UI.numField({
          id: `cable-${pfx}${ax}`,
          label: ax.toUpperCase(),
          value: typeof pt[k] === 'string' ? pt[k] : round(cm[which][k], 3),
          vars: V,
          onCommit: (v) => App.change(T('asm.cableEditUndo'), (doc) => {
            const cur = Model.find(doc, it.id);
            if (!cur || !cur.item || !cur.item.p || !cur.item.p.cable) return false;
            const cb = cur.item.p.cable;
            cb[ptKey] = Array.isArray(cb[ptKey]) ? cb[ptKey].slice() : [0, 0, 0];
            cb[ptKey][k] = v;
            delete cb[bindKey];
          }, { merge: `cb:${it.id}:${ptKey}:${k}` }),
        }));
      });
      box.append(pr);
      const df = UI.selectField({
        id: `cable-dir${pfx}`,
        label: T('asm.cableDirLabel'),
        value: Array.isArray(rawDir) ? '__custom' : (rawDir || 'auto'),
        options: dirOptions(rawDir),
        onChange: (v) => {
          if (v === '__custom') return;
          setC(dirKey, v);
        },
      });
      box.append(h('div', { class: 'fields', style: { marginTop: '4px' } }, df));
      const row = h('div', { class: 'btn-row', style: { marginTop: '4px' } });
      const pb = h('button', { type: 'button', class: 'btn small', id: `cable-pick-${pfx}` });
      pb.innerHTML = icon('cursor') + esc(T('asm.cablePickPortBtn'));
      pb.onclick = () => pickCablePort(it.id, which);
      row.append(pb);
      if (c[bindKey]) {
        const bf = Model.find(App.doc, c[bindKey].id);
        const ub = h('button', { type: 'button', class: 'btn small ghost', id: `cable-unbind-${pfx}` });
        ub.innerHTML = icon('close') + esc(T('panel.sweep.unbind'));
        ub.onclick = () => App.change(T('asm.cableEditUndo'), (doc) => {
          const cur = Model.find(doc, it.id);
          if (!cur || !cur.item || !cur.item.p || !cur.item.p.cable) return false;
          delete cur.item.p.cable[bindKey];
        });
        row.append(ub);
        box.append(h('div', { class: 'mini-row', id: `cable-bound-${pfx}` }, h('span', { class: 'grow' }, T('asm.cableBoundInfo', { name: bf ? Model.label(bf.item) : '?' }))));
      }
      box.append(row);
      sec.append(box);
    };
    renderPort('start', T('asm.cablePortA'), 'start', 'dirA', 'bindA', 'a');
    renderPort('end', T('asm.cablePortB'), 'end', 'dirB', 'bindB', 'b');

    const via = Array.isArray(c.via) ? c.via : [];
    if (via.length) {
      const vBox = h('div', { class: 'p3-list', style: { marginTop: '8px' } });
      vBox.append(h('div', { class: 'mini-row' }, h('b', null, T('asm.cableViaList'))));
      via.forEach((q, i) => {
        const vr = h('div', { class: 'fields three p3-row' });
        ['x', 'y', 'z'].forEach((ax, k) => vr.append(UI.numField({
          id: `cable-via-${i}-${ax}`,
          label: `${i + 1} ${ax.toUpperCase()}`,
          value: typeof q[k] === 'string' ? q[k] : round(Number(q[k]) || 0, 3),
          vars: V,
          onCommit: (v) => App.change(T('asm.cableEditUndo'), (doc) => {
            const cur = Model.find(doc, it.id);
            const arr = cur && cur.item && cur.item.p && cur.item.p.cable && cur.item.p.cable.via;
            if (!arr || !arr[i]) return false;
            arr[i][k] = v;
          }),
        })));
        const del = h('button', { type: 'button', class: 'btn ghost small', id: `cable-via-del-${i}` });
        del.innerHTML = icon('trash') + esc(T('common.delete'));
        del.onclick = () => App.change(T('asm.cableEditUndo'), (doc) => {
          const cur = Model.find(doc, it.id);
          const cb = cur && cur.item && cur.item.p && cur.item.p.cable;
          if (!cb || !Array.isArray(cb.via)) return false;
          cb.via.splice(i, 1);
          if (!cb.via.length) delete cb.via;
        });
        vBox.append(vr, del);
      });
      sec.append(vBox);
    }
    const viaBtn = h('button', { type: 'button', class: 'btn small', id: 'cable-add-via', style: { marginTop: '8px' } });
    viaBtn.innerHTML = icon('plus') + esc(T('asm.cableAddViaBtn'));
    viaBtn.onclick = () => pickCablePort(it.id, 'via');
    sec.append(viaBtn, h('div', { class: 'hint-box', html: T('asm.cableHint') }));
  }

  const isOp = (it) => !!(it && it.kind === 'group' && it.p && it.p.op);
  return { togglePatternSkip, resetPatternSkip, syncPatternMarkers, placePatternMarkers, startRib, renderRib, ribTargets, vent, startVent, pickVentFace, renderVent, fins, startFins, pickFinsFace, renderFins, fillPattern, startFillPattern, pickFillPatternFace, renderFillPattern, mountPattern, startMountPattern, pickMountPatternFace, renderMountPattern, portCutout, startPortCutout, pickPortCutoutFace, renderPortCutout, magnetPocket, startMagnetPocket, pickMagnetPocketFace, renderMagnetPocket, startWeb, web, renderWeb, startWrap, createWrap, pickWrapFace, sweepFromWrap, sweepFromSketch3d, renderSketch3d, renderWrap, cylTargets, findCylFaceOnItem, wrapTangentPlane, startEmboss, emboss, renderEmboss, pickEmbossFace, embossPlaneForFace, startSplitFace, splitFace, pickSplitFace, renderSplitFace, dome, startDome, pickDomeFace, renderDome, deleteFace, startDeleteFace, pickDeleteFace, removeDeleteFaceEntry, renderDeleteFace, replaceFace, startReplaceFace, pickReplaceTarget, pickReplaceSourceFace, setReplaceDatum, renderReplaceFace, moveEdge, startMoveEdge, pickMoveEdge, renderMoveEdge, mirrorStep, setMirrorStepPlane, pickMirrorStepPlane, renderMirrorStep, canMirrorStep, pickDatumPlaneAt, setRevolveToFace, pickRevolveFace, transform, renderTransform, scale, renderScale, deform, renderDeform, deleteBody, renderDeleteBody, thicken, renderThicken, pickThickenFace, directFace, startDirectFace, pickDirectFace, pickDirectFaceRotAxis, directFaceFrame, renderDirectFace, guessThreadSize, threadOnFace, markThread, updateThread, removeThread, applyRealThread, makeThreadReal, threadPop, route3d, routeAppend, stopRoute, finishRoute, get routing() { return route ? { pts: route.pts.map((q) => q.slice()), d: route.d } : null; }, startCablePick, pickCablePort, stopCablePick, renderCable, setPatternAxis, pickAxis, pickAxisThen, makeFaceRef, pickTargetFaceAt, pickFaceThen, pickExtrudeFace, setExtrudeToFace, autoFlipDirForFace, get picking() { return !!picking || !!route || !!cablePick; }, mirrorAtFace, patternPath, pathFromSketch, patternPoints, pointsFromSketch, patternTable, setPatternTableCSV, pattern, split, pickSplitToolFace, setSplitFace, splitWithFace, startSplitSketch, splitFromSketch, splitWithSketch, boolean, shell, setShellDir, addShellFaceWall, setShellFaceWall, removeShellFaceWall, pickShellFaceWall, renderShell, setFilletShape, setFilletCorner, filletG2, renderFilletMore, startFullFillet, addFullFillet, startCornerChamfer, addCornerChamfer, startFaceFillet, addFaceFillet, addPartingDraft, pickPartingDraftEdge, renderOp, sizeText, isOp, NAMES, helix, renderHelix, boss, startBoss, pickBossFace, renderBoss, lipGroove, startLipGroove, pickLipGrooveEdge, swapLipGroove, renderLipGroove, loftTargets, loftClosed, loftCut, setLoftClosed, setLoftContinuity, pickLoftFace, renderLoft, undercut, startUndercut, renderUndercut, circlipGroove, startCirclipGroove, renderCirclipGroove, keyway, startKeyway, renderKeyway, splineProfile, startSplineProfile, renderSplineProfile, knurl, startKnurl, renderKnurl, gripPattern, startGripPattern, pickGripPatternFace, renderGripPattern, pickStepCylFace, pickStackHolePoint, pickAsmCutFace, renderStackHole, renderAsmCut };
})();
