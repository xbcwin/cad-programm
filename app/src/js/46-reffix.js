// ================= Kaputte Bezüge erkennen und neu wählen (KP-12) =================
const RefFix = (() => {
  let state = null;
  let barEl = null;

  const isRefError = (e) => !!(e && (e.code === 'edges' || e.code === 'ref'));
  const hardErrorsFor = (itemId) => App.errorsFor(itemId).filter((e) => !isRefError(e));

  function planeRefLost(pr, itemId) {
    if (!pr) return false;
    if (pr.kind === 'datum') {
      if (typeof Datums === 'undefined') return false;
      const d = Datums.find(pr.datumId);
      return !d || Datums.lost.includes(d.id);
    }
    if (pr.kind === 'face') {
      const resInfo = itemId ? App.resolvedOf(itemId) : null;
      if (resInfo && resInfo.planeRefOk === true) return false;
      if (resInfo && resInfo.planeRefOk === false) return true;
      const rf = Model.find(App.doc, pr.id);
      if (!rf || rf.item.suppressed) return true;
      const res = App.results.get(pr.id);
      if (res && res.data && Array.isArray(res.data.faces)) {
        if (pr.tid) {
          const wantBase = pr.tid.split('|')[0];
          const tidOk = res.data.faces.some((fc) => fc && fc.t === 'PLANE' && fc.tid && (fc.tid === pr.tid || fc.tid.split('|')[0] === wantBase));
          if (tidOk) return false;
        }
        const pn = pr.n || [0, 0, 1], pc = pr.c || [0, 0, 0];
        const ok = res.data.faces.some((fc) => {
          if (!fc || fc.t !== 'PLANE' || !fc.n || !fc.c) return false;
          if (fc.n[0] * pn[0] + fc.n[1] * pn[1] + fc.n[2] * pn[2] < 0.995) return false;
          const dist = Math.abs((fc.c[0] - pc[0]) * pn[0] + (fc.c[1] - pc[1]) * pn[1] + (fc.c[2] - pc[2]) * pn[2]);
          return dist < 0.08;
        });
        return !ok;
      }
      // Kindkörper innerhalb einer Gruppe: bei Grundkörpern die ebene Seite gegen primitiveBox prüfen
      const pb = Model.primitiveBox(rf.item.kind, Model.resolveP(rf.item.p, Model.vars(App.doc).v));
      if (pb && Array.isArray(pr.n) && Array.isArray(pr.c)) {
        for (let k = 0; k < 3; k++) {
          if (Math.abs(pr.n[k]) > 0.995) {
            const want = pr.n[k] > 0 ? pb[k + 3] : pb[k];
            return Math.abs(want - pr.c[k]) >= 0.08;
          }
        }
      }
    }
    return false;
  }

  function issuesOf(itemId) {
    if (!App.doc || !Model.isActive(App.doc, itemId)) return [];
    const f = Model.find(App.doc, itemId);
    if (!f) return [];
    const it = f.item;
    const out = [];
    const errs = App.errorsFor(itemId);

    for (const e of errs) {
      if (e.code !== 'edges') continue;
      const fin = (it.finishes || []).find((x) => x.id === e.finishId);
      if (!fin) continue;
      if (fin.type === 'shell' || fin.type === 'fullFillet') {
        out.push({
          key: `${it.id}:fin:${fin.id}`,
          kind: 'finish-face',
          itemId: it.id,
          finishId: fin.id,
          finishType: fin.type,
          missing: Array.isArray(e.missing) ? e.missing.slice() : null,
          title: fin.type === 'fullFillet' ? 'Vollrundung' : 'Wandstärke',
          message: e.message,
          needCount: Math.max(1, (e.missing || fin.faces || [0]).length),
        });
      } else {
        out.push({
          key: `${it.id}:fin:${fin.id}`,
          kind: 'finish-edge',
          itemId: it.id,
          finishId: fin.id,
          finishType: fin.type,
          missing: Array.isArray(e.missing) ? e.missing.slice() : null,
          title: fin.type === 'cornerChamfer' ? 'Ecken-Fase' : fin.type === 'chamfer' ? 'Fase' : 'Rundung',
          message: e.message,
          needCount: Array.isArray(fin.edges) ? Math.max(1, (e.missing || fin.edges).length) : 1,
        });
      }
    }

    if (it.p && it.p.sketch && it.p.sketch.planeRef && planeRefLost(it.p.sketch.planeRef, it.id)) {
      out.push({
        key: `${it.id}:skplane`,
        kind: 'sketch-plane',
        itemId: it.id,
        title: 'Skizzen-Fläche',
        message: 'Die Fläche oder Bezugsebene dieser Skizze gibt es nicht mehr.',
        needCount: 1,
      });
    }

    if (it.p && it.p.sketch && typeof Sketch !== 'undefined' && Sketch.isLinkLost) {
      const seenGrp = new Set();
      for (const e of it.p.sketch.ents || []) {
        if (e.link && Sketch.isLinkLost(it, e)) {
          if (e.link.kind === 'silhouette' && e.link.grp) {
            if (seenGrp.has('sil:' + e.link.grp)) continue;
            seenGrp.add('sil:' + e.link.grp);
            out.push({
              key: `${it.id}:sksil:${e.link.grp}`,
              kind: 'sketch-silhouette',
              itemId: it.id,
              entId: e.id,
              grp: e.link.grp,
              title: 'Übernommener Umriss',
              message: 'Der Körper für diesen übernommenen Umriss (Silhouette) fehlt oder ist unterdrückt.',
              needCount: 1,
            });
            continue;
          }
          if (e.link.kind === 'faceIntersect' && e.link.grp) {
            if (seenGrp.has('ic:' + e.link.grp)) continue;
            seenGrp.add('ic:' + e.link.grp);
            out.push({
              key: `${it.id}:skic:${e.link.grp}`,
              kind: 'sketch-intersect',
              itemId: it.id,
              entId: e.id,
              grp: e.link.grp,
              title: 'Übernommene Schnittkurve',
              message: 'Mindestens eine Fläche dieser Schnittkurve fehlt oder die Flächen schneiden sich nicht mehr.',
              needCount: 2,
            });
            continue;
          }
          out.push({
            key: `${it.id}:sklink:${e.id}`,
            kind: 'sketch-link',
            itemId: it.id,
            entId: e.id,
            title: 'Übernommene Kante',
            message: 'Eine verbundene Körperkante der Skizze gibt es nicht mehr.',
            needCount: 1,
          });
        }
      }
    }

    if (it.kind === 'extrude' && it.p && it.p.extent === 'toFace') {
      const refErr = errs.find((e) => e.code === 'ref');
      if (refErr) {
        out.push({
          key: `${it.id}:extface`,
          kind: 'extrude-toFace',
          itemId: it.id,
          title: 'Zielfläche (Hochziehen)',
          message: refErr.message,
          needCount: 1,
        });
      }
    }

    if (it.kind === 'revolve' && it.p && it.p.dir === 'toFace' && it.p.toFace && it.p.toFace.lost) {
      out.push({
        key: `${it.id}:revface`,
        kind: 'revolve-toFace',
        itemId: it.id,
        title: 'Zielfläche (Drehen)',
        message: `Die Zielfläche „${it.p.toFace.name || '?'}“ gibt es nicht mehr.`,
        needCount: 1,
      });
    }

    return out;
  }

  function firstDescendantIssue(it) {
    if (!it || !it.children) return null;
    for (const c of it.children) {
      const own = issuesOf(c.id);
      if (own.length) return own[0];
      const sub = firstDescendantIssue(c);
      if (sub) return sub;
    }
    return null;
  }

  function hasBrokenRef(itemId) {
    if (issuesOf(itemId).length) return true;
    const f = Model.find(App.doc, itemId);
    return !!(f && f.item.kind === 'group' && firstDescendantIssue(f.item));
  }

  function allIssues() {
    if (!App.doc) return [];
    const out = [];
    Model.walk(App.doc.items, (it) => { out.push(...issuesOf(it.id)); });
    return out;
  }

  function boxEdgesPositions(bb, M) {
    if (!bb) return [];
    const [x0, y0, z0, x1, y1, z1] = bb;
    const pt = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M).toArray();
    const c = [
      pt(x0, y0, z0), pt(x1, y0, z0), pt(x1, y1, z0), pt(x0, y1, z0),
      pt(x0, y0, z1), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z1),
    ];
    const idx = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const pos = [];
    for (const [i, j] of idx) pos.push(...c[i], ...c[j]);
    return pos;
  }

  function circlePointsWorld(c, n, r, M) {
    const cv = new THREE.Vector3(...c), nv = new THREE.Vector3(...n).normalize();
    let u = Math.abs(nv.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(nv);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(nv, u).normalize();
    const pos = [], N = 36;
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
      const p1 = cv.clone().addScaledVector(u, Math.cos(a1) * r).addScaledVector(v, Math.sin(a1) * r).applyMatrix4(M);
      const p2 = cv.clone().addScaledVector(u, Math.cos(a2) * r).addScaledVector(v, Math.sin(a2) * r).applyMatrix4(M);
      pos.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
    return pos;
  }

  function buildGhostSpecs(issue) {
    const f = Model.find(App.doc, issue.itemId);
    if (!f) return [];
    const it = f.item;
    const W = Model.worldMatrix(App.doc, issue.itemId);
    const ptW = (a) => new THREE.Vector3(...a).applyMatrix4(W).toArray();
    const dirW = (d) => new THREE.Vector3(...d).transformDirection(W).normalize().toArray();
    const specs = [];

    if (issue.kind === 'finish-edge') {
      const fin = (it.finishes || []).find((x) => x.id === issue.finishId);
      if (!fin) return specs;
      if (typeof fin.edges === 'string') {
        const res = App.results.get(issue.itemId);
        const bb = res && res.data && res.data.bbox ? res.data.bbox : App.localBox(issue.itemId);
        const pos = boxEdgesPositions(bb, W);
        if (pos.length >= 6) specs.push({ kind: 'segments', positions: pos });
        return specs;
      }
      const list = Array.isArray(fin.edges) ? fin.edges : [];
      const idxs = Array.isArray(issue.missing) && issue.missing.length ? issue.missing : list.map((_, i) => i);
      for (const idx of idxs) {
        const s = list[idx];
        if (!s) continue;
        if (Array.isArray(s.pts) && s.pts.length >= 2) {
          const wp = s.pts.map(ptW), pos = [];
          for (let i = 0; i + 1 < wp.length; i++) pos.push(...wp[i], ...wp[i + 1]);
          specs.push({ kind: 'segments', positions: pos, dots: [wp[0], wp[wp.length - 1]] });
        } else if (s.t === 'CIRCLE' && Array.isArray(s.c) && Array.isArray(s.n) && s.r > 0) {
          specs.push({ kind: 'segments', positions: circlePointsWorld(s.c, s.n, s.r, W) });
        } else if (Array.isArray(s.a) && Array.isArray(s.b)) {
          const a = ptW(s.a), b = ptW(s.b);
          specs.push({ kind: 'segments', positions: [...a, ...b], dots: [a, b] });
        } else if (Array.isArray(s.m)) {
          specs.push({ kind: 'marker', p: ptW(s.m), r: clamp((s.l || 10) * 0.25, 2.5, 12) });
        }
      }
      return specs;
    }

    if (issue.kind === 'finish-face') {
      const fin = (it.finishes || []).find((x) => x.id === issue.finishId);
      if (!fin) return specs;
      const list = Array.isArray(fin.faces) ? fin.faces : [];
      const idxs = Array.isArray(issue.missing) && issue.missing.length ? issue.missing : list.map((_, i) => i);
      for (const idx of idxs) {
        const s = list[idx];
        if (!s || !Array.isArray(s.c)) continue;
        specs.push({ kind: 'plane', o: ptW(s.c), n: dirW(s.n || [0, 0, 1]), size: clamp(s.size || 20, 8, 60) });
      }
      return specs;
    }

    if (issue.kind === 'sketch-plane') {
      const sk = it.p && it.p.sketch;
      if (!sk || !sk.plane) return specs;
      const b = SK.bounds(sk.ents || []);
      const bSize = b ? Math.max(b[2] - b[0], b[3] - b[1]) * 1.25 : 0;
      const prSize = sk.planeRef && sk.planeRef.size ? sk.planeRef.size : 24;
      specs.push({
        kind: 'plane',
        o: ptW(sk.plane.o),
        x: dirW(sk.plane.x || [1, 0, 0]),
        n: dirW(sk.plane.n || [0, 0, 1]),
        size: clamp(Math.max(bSize, prSize), 14, 80),
      });
      const xo = new THREE.Vector3(...sk.plane.x).normalize(), no = new THREE.Vector3(...sk.plane.n).normalize();
      const yo = new THREE.Vector3().crossVectors(no, xo).normalize();
      const pos = [];
      for (const e of sk.ents || []) {
        if (e.con) continue;
        const pts = SK.segPoints(e);
        for (let i = 0; i + 1 < pts.length; i++) {
          const p1 = new THREE.Vector3(...sk.plane.o).addScaledVector(xo, pts[i][0]).addScaledVector(yo, pts[i][1]).applyMatrix4(W);
          const p2 = new THREE.Vector3(...sk.plane.o).addScaledVector(xo, pts[i + 1][0]).addScaledVector(yo, pts[i + 1][1]).applyMatrix4(W);
          pos.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }
      if (pos.length >= 6) specs.push({ kind: 'segments', positions: pos });
      return specs;
    }

    if (issue.kind === 'sketch-silhouette' || issue.kind === 'sketch-intersect') {
      const sk = it.p && it.p.sketch;
      const ents = (sk && sk.ents || []).filter((x) => x.link && x.link.grp === issue.grp);
      const pos = [];
      for (const e of ents) {
        const wp = typeof Sketch !== 'undefined' && Sketch.linkPointsWorld ? Sketch.linkPointsWorld(it, e) : [];
        for (let i = 0; i + 1 < wp.length; i++) pos.push(...wp[i], ...wp[i + 1]);
      }
      if (pos.length >= 6) specs.push({ kind: 'segments', positions: pos });
      return specs;
    }

    if (issue.kind === 'sketch-link') {
      const sk = it.p && it.p.sketch;
      const e = sk && (sk.ents || []).find((x) => x.id === issue.entId);
      if (!e) return specs;
      const wp = typeof Sketch !== 'undefined' && Sketch.linkPointsWorld ? Sketch.linkPointsWorld(it, e) : [];
      if (wp.length >= 2) {
        const pos = [];
        for (let i = 0; i + 1 < wp.length; i++) pos.push(...wp[i], ...wp[i + 1]);
        specs.push({ kind: 'segments', positions: pos, dots: [wp[0], wp[wp.length - 1]] });
      } else if (e.link && Array.isArray(e.link.m)) {
        specs.push({ kind: 'marker', p: e.link.m.slice(), r: clamp((e.link.l || 10) * 0.25, 2.5, 12) });
      }
      return specs;
    }

    if (issue.kind === 'extrude-toFace') {
      const tf = it.p && it.p.toFace;
      if (!tf) return specs;
      if (Array.isArray(tf.wc) && Array.isArray(tf.wn)) specs.push({ kind: 'plane', o: tf.wc.slice(), n: tf.wn.slice(), size: 28 });
      else if (Array.isArray(tf.c) && Array.isArray(tf.n)) specs.push({ kind: 'plane', o: tf.c.slice(), n: tf.n.slice(), size: 28 });
      return specs;
    }

    if (issue.kind === 'revolve-toFace') {
      const tf = it.p && it.p.toFace;
      if (!tf) return specs;
      if (Array.isArray(tf.o) && Array.isArray(tf.fn)) specs.push({ kind: 'plane', o: ptW(tf.o), n: dirW(tf.fn), size: 28 });
      return specs;
    }

    return specs;
  }

  function applyFinishEdge(issue, picked) {
    if (!picked || !picked.length) return false;
    const sigs = picked.map((e) => Actions.edgeSigOf(e.id, e.edgeIdx)).filter(Boolean);
    if (!sigs.length) return false;
    App.change('Kante neu gewählt', (doc) => {
      const f = Model.find(doc, issue.itemId);
      if (!f) return false;
      const fin = (f.item.finishes || []).find((x) => x.id === issue.finishId);
      if (!fin) return false;
      const miss = Array.isArray(issue.missing) ? new Set(issue.missing) : null;
      const kept = Array.isArray(fin.edges) && miss && miss.size < fin.edges.length
        ? fin.edges.filter((_, i) => !miss.has(i))
        : [];
      const merged = [...kept];
      for (const s of sigs) {
        const dup = merged.some((k) => k && ((k.tid && s.tid && k.tid === s.tid) || (k.m && Math.hypot(k.m[0] - s.m[0], k.m[1] - s.m[1], k.m[2] - s.m[2]) < 1e-3)));
        if (!dup) merged.push(s);
      }
      fin.edges = merged;
    });
    return true;
  }

  function applyFinishFace(issue, hit) {
    const r = App.results.get(hit.id);
    const fi = r && r.data && r.data.faces && r.data.faces[hit.faceIdx];
    if (!fi || !fi.c) return false;
    const bb = r.data.bbox;
    const size = bb ? round(clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6, 8, 60), 2) : 20;
    const sig = { c: fi.c.map((v) => round(v, 4)), n: fi.n ? fi.n.map((v) => round(v, 5)) : null, size, ...(fi.tid ? { tid: fi.tid } : {}) };
    App.change('Fläche neu gewählt', (doc) => {
      const f = Model.find(doc, issue.itemId);
      if (!f) return false;
      const fin = (f.item.finishes || []).find((x) => x.id === issue.finishId);
      if (!fin) return false;
      const miss = Array.isArray(issue.missing) ? new Set(issue.missing) : null;
      if (fin.type === 'fullFillet' && Array.isArray(fin.faces) && fin.faces.length === 3 && miss && miss.size === 1) {
        const missIdx = [...miss][0];
        fin.faces[missIdx] = sig;
        return;
      }
      const kept = Array.isArray(fin.faces) && miss && miss.size < fin.faces.length
        ? fin.faces.filter((_, i) => !miss.has(i))
        : [];
      const dup = kept.some((k) => k && ((k.tid && sig.tid && k.tid === sig.tid) || (k.c && Math.hypot(k.c[0] - sig.c[0], k.c[1] - sig.c[1], k.c[2] - sig.c[2]) < 1e-3)));
      if (!dup) kept.push(sig);
      fin.faces = kept;
    });
    return true;
  }

  function applySketchPlane(issue, planeSpec) {
    const r6 = (v) => round(v, 6);
    App.change('Skizzen-Fläche neu gewählt', (doc) => {
      const f = Model.find(doc, issue.itemId);
      if (!f || !f.item.p || !f.item.p.sketch) return false;
      const it = f.item;
      const PWInv = Model.parentWorld(doc, it.id).invert();
      const oL = new THREE.Vector3(...planeSpec.oW).applyMatrix4(PWInv).toArray().map(r6);
      const xL = new THREE.Vector3(...planeSpec.xW).transformDirection(PWInv).normalize().toArray().map(r6);
      const nL = new THREE.Vector3(...planeSpec.nW).transformDirection(PWInv).normalize().toArray().map(r6);
      it.t = Model.T0();
      it.p.sketch.plane = { o: oL, x: xL, n: nL };
      if (planeSpec.planeRef) it.p.sketch.planeRef = deepClone(planeSpec.planeRef);
      else delete it.p.sketch.planeRef;
    });
    return true;
  }

  function removeBar() {
    if (barEl) { barEl.remove(); barEl = null; }
  }

  function updateBar() {
    if (!barEl || !state) return;
    const cnt = barEl.querySelector('#reffix-count');
    const applyBtn = barEl.querySelector('#reffix-apply');
    if (state.issue.kind === 'sketch-intersect') {
      if (cnt) cnt.textContent = `${state.pickedFaces.length}/2 Flächen gewählt`;
      return;
    }
    if (cnt) cnt.textContent = `${state.pickedEdges.length} gewählt`;
    if (applyBtn) applyBtn.disabled = state.pickedEdges.length === 0;
  }

  function renderBar(issue) {
    removeBar();
    const vp = $('#viewport');
    if (!vp) return;
    const desc = {
      'finish-edge': issue.needCount > 1
        ? `Alte Lage ist gestrichelt. Klick neue Kanten am Körper an und bestätige mit „Übernehmen“.`
        : 'Alte Lage ist gestrichelt. Klick eine neue Kante am Körper an.',
      'finish-face': 'Alte Lage ist gestrichelt. Klick eine neue Öffnungsfläche am Körper an.',
      'sketch-plane': 'Alte Lage ist gestrichelt. Klick eine ebene Körperfläche oder Bezugsebene an.',
      'sketch-link': 'Alte Lage ist gestrichelt. Klick eine neue Kante eines anderen Körpers an.',
      'sketch-silhouette': 'Alte Lage ist gestrichelt. Klick einen neuen Körper an oder löse die Verbindung.',
      'sketch-intersect': 'Alte Lage ist gestrichelt. Klick nacheinander zwei sich schneidende Flächen an oder löse die Verbindung.',
      'extrude-toFace': 'Alte Lage ist gestrichelt. Klick eine neue Zielfläche oder Bezugsebene an.',
      'revolve-toFace': 'Alte Lage ist gestrichelt. Klick eine neue Zielfläche oder Bezugsebene an.',
    }[issue.kind] || 'Alte Lage ist gestrichelt. Klick einen neuen Bezug an.';

    barEl = h('div', { class: 'reffix-bar', id: 'reffix-bar', role: 'dialog', 'aria-label': 'Bezug neu wählen' });
    const ic = h('span', { class: 'rf-ic' }); ic.innerHTML = icon('warn');
    const txt = h('div', { class: 'rf-txt' }, h('b', null, `Neu wählen: ${issue.title}`), h('span', null, desc));
    const acts = h('div', { class: 'btn-row' });

    if (issue.kind === 'finish-edge' && issue.needCount > 1) {
      acts.append(h('span', { class: 'kbd', id: 'reffix-count' }, '0 gewählt'));
      const ap = h('button', { type: 'button', class: 'btn small warn-act', id: 'reffix-apply', disabled: true });
      ap.innerHTML = icon('check') + 'Übernehmen';
      ap.onclick = () => applyMulti();
      acts.append(ap);
    }

    if (issue.kind === 'sketch-plane') {
      const planes = [
        ['XY', { oW: [0, 0, 0], xW: [1, 0, 0], nW: [0, 0, 1], planeRef: null }],
        ['XZ', { oW: [0, 0, 0], xW: [1, 0, 0], nW: [0, -1, 0], planeRef: null }],
        ['YZ', { oW: [0, 0, 0], xW: [0, 1, 0], nW: [1, 0, 0], planeRef: null }],
      ];
      for (const [lbl, spec] of planes) {
        const qb = h('button', { type: 'button', class: 'btn small', dataset: { reffixPlane: lbl } }, lbl);
        qb.onclick = () => {
          applySketchPlane(issue, spec);
          stop({ keepToast: true });
          UI.toast(`Skizzen-Fläche auf ${lbl} gesetzt.`, { icon: 'check' });
        };
        acts.append(qb);
      }
    }

    if (issue.kind === 'sketch-intersect') {
      acts.append(h('span', { class: 'kbd', id: 'reffix-count' }, '0/2 Flächen gewählt'));
    }

    if (issue.kind === 'sketch-link' || issue.kind === 'sketch-silhouette' || issue.kind === 'sketch-intersect') {
      const ub = h('button', { type: 'button', class: 'btn small', id: 'reffix-unlink' });
      ub.innerHTML = icon('ungroup') + 'Verbindung lösen';
      ub.onclick = () => {
        App.change('Verbindung gelöst', (doc) => {
          const f = Model.find(doc, issue.itemId);
          const ents = f && f.item.p && f.item.p.sketch && (f.item.p.sketch.ents || []);
          if (!ents) return false;
          if (issue.grp) {
            let hit = false;
            for (const x of ents) if (x.link && x.link.grp === issue.grp) { delete x.link; hit = true; }
            if (!hit) return false;
          } else {
            const e = ents.find((x) => x.id === issue.entId);
            if (!e) return false;
            delete e.link;
          }
        });
        stop({ keepToast: true });
        UI.toast(
          issue.kind === 'sketch-silhouette'
            ? 'Verbindung zum Umriss gelöst.'
            : issue.kind === 'sketch-intersect'
              ? 'Verbindung zur Schnittkurve gelöst.'
              : 'Verbindung zur Körperkante gelöst.',
          { icon: 'check' }
        );
      };
      acts.append(ub);
    }

    const cb = h('button', { type: 'button', class: 'btn small ghost', id: 'reffix-cancel' });
    cb.innerHTML = icon('close') + 'Abbrechen';
    cb.onclick = () => stop();
    acts.append(cb);

    barEl.append(ic, txt, acts);
    vp.append(barEl);
  }

  function applyMulti() {
    if (!state || state.issue.kind !== 'finish-edge' || !state.pickedEdges.length) return false;
    const ok = applyFinishEdge(state.issue, state.pickedEdges);
    if (!ok) return false;
    stop({ keepToast: true });
    UI.toast('Bezug neu gewählt – Modell wird neu berechnet.', { icon: 'check' });
    return true;
  }

  function stop(opts = {}) {
    if (!state) return;
    const st = state;
    state = null;
    Viewer.canvas.removeEventListener('pointerdown', st.down);
    Viewer.canvas.removeEventListener('pointermove', st.move);
    window.removeEventListener('pointerup', st.up, true);
    window.removeEventListener('keydown', st.key, true);
    Viewer.canvas.style.cursor = '';
    Viewer.clearHover();
    Viewer.highlightFace('sel', null, null);
    Viewer.setSelectedEdges([]);
    Viewer.clearRefGhost();
    removeBar();
    UI.hint('');
    if (!opts.keepToast) Panels.renderRight();
  }

  function start(issueOrItemId) {
    const issue = typeof issueOrItemId === 'string' ? issuesOf(issueOrItemId)[0] : issueOrItemId;
    if (!issue) { UI.toast('Kein kaputter Bezug gefunden.', { icon: 'info' }); return false; }

    stop({ keepToast: true });
    if (typeof Features !== 'undefined' && Features.picking && Features.stopPick) Features.stopPick();
    if (typeof Datums !== 'undefined' && Datums.picking && Datums.stopPick) Datums.stopPick();
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Place !== 'undefined' && Place.active) Place.cancel();

    const top = Model.topOf(App.doc, issue.itemId);
    const selId = top ? top.id : issue.itemId;
    if (!App.sel.includes(selId) && !App.sel.includes(issue.itemId)) App.select([issue.itemId]);

    Viewer.setRefGhost(buildGhostSpecs(issue));

    const ownExclude = new Set(['__preview']);
    if (issue.kind === 'sketch-plane' || issue.kind === 'extrude-toFace' || issue.kind === 'revolve-toFace' || issue.kind === 'sketch-silhouette' || issue.kind === 'sketch-intersect') {
      if (top && top.id === issue.itemId) ownExclude.add(issue.itemId);
    }

    let downPos = null;
    const down = (e) => {
      if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
    };
    const move = (e) => {
      if (!state) return;
      if (issue.kind === 'finish-edge') {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 10 });
        if (hit && hit.id === issue.itemId && hit.edgeIdx >= 0) Viewer.highlightEdge(hit.id, hit.edgeIdx);
        else Viewer.highlightEdge(null, null);
      } else if (issue.kind === 'sketch-link') {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 10 });
        if (hit && hit.edgeIdx >= 0 && (!top || hit.id !== top.id)) Viewer.highlightEdge(hit.id, hit.edgeIdx);
        else Viewer.highlightEdge(null, null);
      } else if (issue.kind === 'finish-face') {
        const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
        if (hit && hit.id === issue.itemId && hit.faceIdx >= 0) Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        else Viewer.highlightFace('hover', null, null);
      } else {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: ownExclude });
        if (hit && hit.faceIdx >= 0 && (!hit.node || hit.node.role !== 'hole')) Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        else Viewer.highlightFace('hover', null, null);
      }
    };
    const up = async (e) => {
      if (e.button !== 0 || !state || !downPos) return;
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (dist > 6) return;
      if (e.target !== Viewer.canvas) return;
      e.preventDefault(); e.stopPropagation();

      if (issue.kind === 'finish-edge') {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 10 });
        if (!hit || hit.id !== issue.itemId || !(hit.edgeIdx >= 0)) {
          UI.toast('Klick eine Kante dieses Körpers an.', { icon: 'info' });
          return;
        }
        if (issue.needCount <= 1) {
          applyFinishEdge(issue, [{ id: hit.id, edgeIdx: hit.edgeIdx }]);
          stop({ keepToast: true });
          UI.toast('Bezug neu gewählt – Modell wird neu berechnet.', { icon: 'check' });
          return;
        }
        const idx = state.pickedEdges.findIndex((x) => x.id === hit.id && x.edgeIdx === hit.edgeIdx);
        if (idx >= 0) state.pickedEdges.splice(idx, 1);
        else state.pickedEdges.push({ id: hit.id, edgeIdx: hit.edgeIdx });
        Viewer.setSelectedEdges(state.pickedEdges);
        updateBar();
        return;
      }

      if (issue.kind === 'finish-face') {
        const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
        if (!hit || hit.id !== issue.itemId || !(hit.faceIdx >= 0)) {
          UI.toast('Klick eine Fläche dieses Körpers an.', { icon: 'info' });
          return;
        }
        applyFinishFace(issue, hit);
        stop({ keepToast: true });
        UI.toast('Öffnungsfläche neu gewählt – Modell wird neu berechnet.', { icon: 'check' });
        return;
      }

      if (issue.kind === 'sketch-plane') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: ownExclude });
        if (hit && hit.faceIdx >= 0) {
          const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
          if (fi && fi.t === 'PLANE' && fi.n && fi.c) {
            const fr = Actions.faceFrame(fi);
            const W = Model.worldMatrix(App.doc, hit.id);
            const oW = new THREE.Vector3(...fr.o).applyMatrix4(W).toArray();
            const xW = new THREE.Vector3(...fr.x).transformDirection(W).normalize().toArray();
            const nW = new THREE.Vector3(...fr.n).transformDirection(W).normalize().toArray();
            const bb = App.results.get(hit.id)?.data?.bbox;
            const size = bb ? round(clamp(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6, 10, 80), 2) : 24;
            const planeRef = { kind: 'face', id: hit.id, c: fi.c.map((v) => round(v, 5)), n: fi.n.map((v) => round(v, 5)), size, ...(fi.tid ? { tid: fi.tid } : {}) };
            applySketchPlane(issue, { oW, xW, nW, planeRef });
            stop({ keepToast: true });
            UI.toast('Skizzen-Fläche neu gewählt – Modell wird neu berechnet.', { icon: 'check' });
            return;
          }
        }
        const dp = typeof Features !== 'undefined' && Features.pickDatumPlaneAt ? Features.pickDatumPlaneAt(e.clientX, e.clientY) : null;
        if (dp && dp.datum && dp.datum.plane) {
          const pl = dp.datum.plane;
          applySketchPlane(issue, {
            oW: pl.o, xW: pl.x, nW: pl.n,
            planeRef: { kind: 'datum', datumId: dp.datum.id, name: dp.datum.name },
          });
          stop({ keepToast: true });
          UI.toast(`Skizze auf Bezugsebene „${dp.datum.name}“ gelegt.`, { icon: 'check' });
          return;
        }
        UI.toast('Bitte wähle eine ebene Körperfläche oder Bezugsebene.', { icon: 'info' });
        return;
      }

      if (issue.kind === 'sketch-link') {
        const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 10 });
        if (!hit || !(hit.edgeIdx >= 0) || (top && hit.id === top.id)) {
          UI.toast('Klick eine Kante eines anderen Körpers an.', { icon: 'info' });
          return;
        }
        const res = Sketch.rebindLink(issue.itemId, issue.entId, hit.id, hit.edgeIdx);
        if (!res.ok) { UI.toast(res.why || 'Kante konnte nicht übernommen werden.', { kind: 'bad' }); return; }
        stop({ keepToast: true });
        UI.toast('Verbundene Kante neu gewählt.', { icon: 'check' });
        return;
      }

      if (issue.kind === 'sketch-silhouette') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: ownExclude });
        if (!hit || !hit.id || !hit.node || hit.node.role === 'hole') {
          UI.toast('Klick einen anderen Körper an.', { icon: 'info' });
          return;
        }
        const res = await Sketch.rebindSilhouette(issue.itemId, issue.grp, hit.id);
        if (!state) return;
        if (!res.ok) { UI.toast(res.why || 'Umriss konnte nicht übernommen werden.', { kind: 'bad' }); return; }
        stop({ keepToast: true });
        UI.toast('Verbundenen Umriss neu gewählt.', { icon: 'check' });
        return;
      }

      if (issue.kind === 'sketch-intersect') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: ownExclude });
        if (!hit || !hit.id || !(hit.faceIdx >= 0) || !hit.node || hit.node.role === 'hole') {
          UI.toast('Klick eine Körperfläche an.', { icon: 'info' });
          return;
        }
        if (!state.pickedFaces.length) {
          state.pickedFaces.push({ id: hit.id, faceIdx: hit.faceIdx });
          Viewer.highlightFace('sel', hit.id, hit.faceIdx);
          updateBar();
          return;
        }
        const first = state.pickedFaces[0];
        if (first.id === hit.id && first.faceIdx === hit.faceIdx) {
          UI.toast('Klick jetzt eine zweite, schneidende Fläche an.', { icon: 'info' });
          return;
        }
        const res = await Sketch.rebindFaceIntersect(issue.itemId, issue.grp, first, { id: hit.id, faceIdx: hit.faceIdx });
        if (!state) return;
        if (!res.ok) {
          state.pickedFaces = [];
          Viewer.highlightFace('sel', null, null);
          updateBar();
          UI.toast(res.why || 'Schnittkurve konnte nicht übernommen werden.', { kind: 'bad' });
          return;
        }
        stop({ keepToast: true });
        UI.toast('Verbundene Schnittkurve neu gewählt.', { icon: 'check' });
        return;
      }

      if (issue.kind === 'extrude-toFace') {
        const ref = Features.pickTargetFaceAt(e.clientX, e.clientY, ownExclude);
        if (!ref) { UI.toast('Klick auf eine Körperfläche oder Bezugsebene.', { icon: 'info' }); return; }
        Features.setExtrudeToFace(issue.itemId, ref);
        stop({ keepToast: true });
        UI.toast('Zielfläche neu gewählt: ' + (ref.label || 'Fläche') + '.', { icon: 'check' });
        return;
      }

      if (issue.kind === 'revolve-toFace') {
        const hit = Viewer.pick(e.clientX, e.clientY, { solidsOnly: true, noEdges: true, exclude: ownExclude });
        if (hit && hit.faceIdx >= 0) {
          const fi = App.results.get(hit.id)?.data?.faces?.[hit.faceIdx];
          if (fi && fi.t === 'PLANE' && fi.n) {
            Features.setRevolveToFace(issue.itemId, { id: hit.id, idx: hit.faceIdx, info: fi, point: hit.point ? hit.point.toArray() : null });
            stop({ keepToast: true });
            UI.toast('Zielfläche neu gewählt.', { icon: 'check' });
            return;
          }
        }
        const dp = Features.pickDatumPlaneAt(e.clientX, e.clientY);
        if (dp && dp.datum) {
          Features.setRevolveToFace(issue.itemId, { datumId: dp.datum.id });
          stop({ keepToast: true });
          UI.toast(`Bezugsebene „${dp.datum.name}“ als Ziel gesetzt.`, { icon: 'check' });
          return;
        }
        UI.toast('Bitte wähle eine ebene Körperfläche oder Bezugsebene.', { icon: 'info' });
      }
    };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); }
      else if (e.key === 'Enter' && state && state.issue.kind === 'finish-edge' && state.pickedEdges.length) { e.preventDefault(); e.stopPropagation(); applyMulti(); }
    };

    state = { issue, pickedEdges: [], pickedFaces: [], down, move, up, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('keydown', key, true);
    renderBar(issue);
    UI.hint(`<b>Neu wählen (${esc(issue.title)}):</b> Die alte Lage ist gelb gestrichelt. Klick einen neuen Bezug an · <b>Esc</b> bricht ab.`);
    return true;
  }

  function init() {
    App.on('mode', () => { if (state && App.mode !== 'model') stop({ keepToast: true }); });
    App.on('doc', () => {
      if (state && !Model.find(App.doc, state.issue.itemId)) stop({ keepToast: true });
    });
  }

  return {
    init, isRefError, hardErrorsFor, issuesOf, firstDescendantIssue, hasBrokenRef, allIssues,
    buildGhostSpecs, start, stop, applyMulti,
    get active() { return !!state; },
    get picking() { return !!state; },
  };
})();
