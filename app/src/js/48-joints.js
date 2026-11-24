// ================= Gelenke & Verbindungen: fest (starr), Drehen und Schieben =================
// Ein Gelenk / eine Verbindung ist kein Schritt der Zeitleiste: Es setzt die Lage des zweiten Teils (doc.joints).
// Mehrere Verbindungen und Gelenke bilden eine Kette: Bewegt sich ein vorderes Teil, wandern alle Teile dahinter mit.
// home = Lage des beweglichen Teils bei 0°; Achse ao/ad in Weltkoordinaten.
const Joints = (() => {
  const list = (doc = App.doc) => (doc && doc.joints) || [];
  const allOf = (id, doc = App.doc) => list(doc).filter((j) => j.a === id || j.b === id);
  const of = (id, doc = App.doc) => list(doc).find((j) => j.b === id) || list(doc).find((j) => j.a === id) || null;
  const fixed = (j) => !!(j && j.kind === 'fixed');
  const slide = (j) => !!(j && j.kind === 'slide');
  const isFixedPart = (id, doc = App.doc) => list(doc).some((j) => j.kind === 'fixed' && j.b === id);
  const fixedJointOf = (id, doc = App.doc) => list(doc).find((j) => j.kind === 'fixed' && j.b === id) || null;
  // Teil suchen – auch innerhalb von Gruppen (seit Sitzung 52)
  const top = (id, doc = App.doc) => { if (!doc || !doc.items) return null; const f = Model.find(doc, id); return f ? f.item : null; };
  const isTop = (id, doc = App.doc) => !!(doc && doc.items && doc.items.some((x) => x.id === id));
  // Bewegung M (in Weltkoordinaten) für ein Teil in einer Gruppe: im Koordinatensystem der Gruppe ausdrücken
  const conj = (doc, id, M) => { const P = Model.parentWorld(doc, id); return P.clone().invert().multiply(M).multiply(P); };
  const related = (doc, a, b) => Model.parentsOf(doc, a).some((p) => p.id === b) || Model.parentsOf(doc, b).some((p) => p.id === a);
  const inOp = (doc, id) => Model.parentsOf(doc, id).some((p) => p.p && p.p.op);
  function refuse(doc, A, B) {
    if (related(doc, A.id, B.id)) return 'Ein Teil kann keine Verbindung mit der eigenen Gruppe bekommen – wähl zwei Teile nebeneinander.';
    if (inOp(doc, A.id) || inOp(doc, B.id)) return 'Teile in einem Muster oder einer Rechen-Gruppe (Teilen, Schnittmenge) können nicht verbunden werden.';
    return null;
  }
  const unit = (j) => (slide(j) ? 'mm' : '°');
  const r6 = (arr) => arr.map((v) => round(v, 6));
  const r9 = (arr) => arr.map((v) => round(v, 9));
  function fracOf(p, b) {
    if (!p || !b) return null;
    const dx = b[3] - b[0], dy = b[4] - b[1], dz = b[5] - b[2];
    return [dx > 1e-6 ? round((p[0] - b[0]) / dx, 6) : 0.5, dy > 1e-6 ? round((p[1] - b[1]) / dy, 6) : 0.5, dz > 1e-6 ? round((p[2] - b[2]) / dz, 6) : 0.5];
  }

  // Deterministische Tangente senkrecht zur Normale (Projektion einer festen Achse vermeidet 180°-Sprünge)
  function canonicalX(n) {
    const nv = new THREE.Vector3(...n).normalize();
    let ref = Math.abs(nv.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    let x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    if (x.lengthSq() < 1e-9) {
      ref = new THREE.Vector3(0, 1, 0);
      x = ref.clone().addScaledVector(nv, -ref.dot(nv));
    }
    return x.normalize();
  }
  function orthoBasis(zDir, xHint) {
    const Z = zDir.clone().normalize();
    let X = xHint ? xHint.clone().addScaledVector(Z, -xHint.dot(Z)) : canonicalX(Z.toArray());
    if (X.lengthSq() < 1e-9) X = canonicalX(Z.toArray());
    X.normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  }
  function maxMatDiff(a, b) {
    let m = 0;
    for (let i = 0; i < 16; i++) m = Math.max(m, Math.abs(a.elements[i] - b.elements[i]));
    return m;
  }

  function stepMatrix(j, ang) {
    if (fixed(j)) return new THREE.Matrix4();
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    if (slide(j)) return new THREE.Matrix4().makeTranslation(d.x * ang, d.y * ang, d.z * ang);   // Schiebegelenk: Weg in mm entlang der Achse
    const R = new THREE.Matrix4().makeRotationAxis(d, (ang * Math.PI) / 180);
    return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  function pose(j, ang, home, doc = App.doc) {
    return conj(doc, j.b, stepMatrix(j, ang)).multiply(new THREE.Matrix4().fromArray(home || j.home));
  }
  // Alle Gelenke, die weiter hinten in der Kette an rootId hängen (in Reihenfolge von vorne nach hinten)
  function downstream(doc, rootId) {
    const js = list(doc), out = [], seen = new Set([rootId]);
    const q = [rootId];
    while (q.length) {
      const a = q.shift();
      for (const j of js) {
        if (j.a === a && !seen.has(j.b)) {
          seen.add(j.b);
          out.push(j);
          q.push(j.b);
        }
      }
    }
    return out;
  }
  // Prüfen, ob zwei Teile schon über Gelenke verbunden sind (ein weiteres Gelenk dazwischen ergäbe einen Kreis)
  function connected(doc, idA, idB) {
    const js = list(doc), seen = new Set([idA]), q = [idA];
    while (q.length) {
      const x = q.shift();
      if (x === idB) return true;
      for (const j of js) {
        if (j.a === x && !seen.has(j.b)) { seen.add(j.b); q.push(j.b); }
        if (j.b === x && !seen.has(j.a)) { seen.add(j.a); q.push(j.a); }
      }
    }
    return false;
  }
  function syncHome(b, j, doc = App.doc) {
    const cur = Model.localMatrix(b), exp = pose(j, j.ang, null, doc);
    if (cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)) j.home = pose(j, -j.ang, cur.toArray(), doc).toArray().map((v) => round(v, 9));
  }
  // Hintere Glieder der Kette samt ihren Gelenkachsen um die Bewegung D mitnehmen
  function moveChain(doc, rootId, D, opts = {}) {
    const ks = downstream(doc, rootId), moved = new Set([rootId, ...ks.map((k) => k.b)]);
    for (const k of ks) {
      const kb = top(k.b, doc);
      // Steckt das Teil in einer Gruppe, die selbst mitwandert, fährt es schon mit – nur die Achse nachführen
      const carried = Model.parentsOf(doc, k.b).some((p) => moved.has(p.id));
      if (kb && !carried && !fixed(k)) syncHome(kb, k, doc);
      k.ao = new THREE.Vector3(...k.ao).applyMatrix4(D).toArray().map((v) => round(v, 6));
      k.ad = new THREE.Vector3(...k.ad).transformDirection(D).toArray().map((v) => round(v, 9));
      if (carried) continue;
      if (fixed(k)) {
        const sol = solveFixedPose(doc, k);
        if (sol && kb) {
          const Lb = Model.parentWorld(doc, k.b).invert().multiply(sol.WbNew);
          Model.setFromMatrix(kb, Lb);
          k.home = r9(Model.localMatrix(kb).toArray());
          k.ao = r6(sol.ao.toArray());
          k.ad = r9(sol.ad.toArray());
          if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
        }
        continue;
      }
      k.home = conj(doc, k.b, D).multiply(new THREE.Matrix4().fromArray(k.home)).toArray().map((v) => round(v, 9));
      if (kb) {
        Model.setFromMatrix(kb, pose(k, k.ang, null, doc));
        if (opts.live && isTop(kb.id, doc)) Viewer.updateNode(kb.id, { matrix: Model.localMatrix(kb) });
      }
    }
  }

  // ---------- Feste Verbindung (BG-05) ----------
  function solveFixedPose(doc, j) {
    const A = top(j.a, doc), B = top(j.b, doc);
    if (!A || !B || !j.refA || !j.refB) return null;
    const Wa = Model.worldMatrix(doc, A.id);
    const cAw = new THREE.Vector3(...j.refA.c).applyMatrix4(Wa);
    if (j.mode === 'face') {
      const nAl = new THREE.Vector3(...j.refA.n).normalize();
      const xAl = j.refA.x ? new THREE.Vector3(...j.refA.x) : canonicalX(nAl.toArray());
      const nAw = nAl.clone().transformDirection(Wa).normalize();
      let xAw = xAl.clone().transformDirection(Wa);
      xAw.addScaledVector(nAw, -xAw.dot(nAw));
      if (xAw.lengthSq() < 1e-9) xAw = canonicalX(nAw.toArray());
      xAw.normalize();
      const zTarget = j.flip ? nAw.clone() : nAw.clone().negate();
      const rotRad = ((Number(j.rot) || 0) * Math.PI) / 180;
      if (Math.abs(rotRad) > 1e-12) xAw.applyAxisAngle(nAw, rotRad);
      const Mt = orthoBasis(zTarget, xAw);
      const nBl = new THREE.Vector3(...j.refB.n).normalize();
      const xBl = j.refB.x ? new THREE.Vector3(...j.refB.x) : canonicalX(nBl.toArray());
      const Mb = orthoBasis(nBl, xBl);
      const R = Mt.clone().multiply(Mb.clone().transpose());
      const Pt = cAw.clone().addScaledVector(nAw, Number(j.offset) || 0);
      const cBl = new THREE.Vector3(...j.refB.c);
      const t = Pt.clone().sub(cBl.clone().applyMatrix4(R));
      const WbNew = R.clone().setPosition(t);
      return { WbNew, ao: Pt, ad: nAw };
    }
    const qa = new THREE.Quaternion();
    Wa.decompose(new THREE.Vector3(), qa, new THREE.Vector3());
    const qRel = Array.isArray(j.relQ) && j.relQ.length === 4 ? new THREE.Quaternion(...j.relQ) : new THREE.Quaternion();
    const qTarget = qa.clone().multiply(qRel);
    if (j.flip) qTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    const rotRad = ((Number(j.rot) || 0) * Math.PI) / 180;
    if (Math.abs(rotRad) > 1e-12) qTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotRad));
    const R = new THREE.Matrix4().makeRotationFromQuaternion(qTarget);
    const cBl = new THREE.Vector3(...j.refB.c);
    const t = cAw.clone().sub(cBl.clone().applyMatrix4(R));
    const WbNew = R.clone().setPosition(t);
    return { WbNew, ao: cAw, ad: new THREE.Vector3(0, 0, 1) };
  }

  function fixedOrder(doc) {
    const fjs = list(doc).filter(fixed);
    if (!fjs.length) return [];
    const targets = new Set(fjs.map((j) => j.b));
    const byA = new Map();
    for (const j of fjs) {
      if (!byA.has(j.a)) byA.set(j.a, []);
      byA.get(j.a).push(j);
    }
    const out = [], seen = new Set(), q = [];
    for (const j of fjs) if (!targets.has(j.a)) q.push(j);
    while (q.length) {
      const j = q.shift();
      if (seen.has(j.id)) continue;
      seen.add(j.id); out.push(j);
      for (const nx of byA.get(j.b) || []) q.push(nx);
    }
    for (const j of fjs) if (!seen.has(j.id)) out.push(j);
    return out;
  }

  function syncFixed(doc = App.doc, opts = {}) {
    const ordered = fixedOrder(doc);
    if (!ordered.length) return false;
    let changed = false;
    for (const j of ordered) {
      const B = top(j.b, doc);
      if (!B) continue;
      const WbOld = Model.worldMatrix(doc, B.id);
      const sol = solveFixedPose(doc, j);
      if (!sol) continue;
      const Pb = Model.parentWorld(doc, B.id);
      const LbNew = Pb.clone().invert().multiply(sol.WbNew);
      const LbOld = Model.localMatrix(B);
      if (maxMatDiff(LbNew, LbOld) > 1e-5) {
        Model.setFromMatrix(B, LbNew);
        j.home = r9(Model.localMatrix(B).toArray());
        j.ao = r6(sol.ao.toArray());
        j.ad = r9(sol.ad.toArray());
        changed = true;
        if (opts.live && isTop(B.id, doc)) Viewer.updateNode(B.id, { matrix: Model.localMatrix(B) });
        const hasNonFixedChild = list(doc).some((k) => k.a === B.id && !fixed(k));
        if (hasNonFixedChild) {
          const D = sol.WbNew.clone().multiply(WbOld.clone().invert());
          moveChain(doc, B.id, D, opts);
        }
      }
    }
    return changed;
  }

  function resolveRef(spec, doc = App.doc) {
    if (!spec || !spec.id) return null;
    const res = App.results.get(spec.id);
    const data = res && res.data;
    const bbox = data && data.bbox;
    const isFace = spec.kind === 'face' || (spec.kind !== 'point' && (spec.faceIdx != null || spec.idx != null || (spec.info && spec.info.n)));
    if (isFace) {
      const idx = spec.faceIdx != null ? spec.faceIdx : (spec.idx != null ? spec.idx : null);
      const fi = (idx != null && data && data.faces && data.faces[idx]) || spec.info || null;
      const cRaw = (fi && fi.c) || spec.c;
      const nRaw = (fi && fi.n) || spec.n;
      if (!cRaw || !nRaw) return null;
      const cv = new THREE.Vector3(...cRaw);
      const nv = new THREE.Vector3(...nRaw);
      const xv = spec.x ? new THREE.Vector3(...spec.x) : null;
      if (spec.world) {
        const invW = Model.worldMatrix(doc, spec.id).invert();
        cv.applyMatrix4(invW);
        nv.transformDirection(invW);
        if (xv) xv.transformDirection(invW);
      }
      nv.normalize();
      let xOrtho = xv ? xv.clone().addScaledVector(nv, -xv.dot(nv)) : canonicalX(nv.toArray());
      if (xOrtho.lengthSq() < 1e-9) xOrtho = canonicalX(nv.toArray());
      xOrtho.normalize();
      const cArr = r6(cv.toArray());
      return {
        kind: 'face',
        c: cArr,
        n: r9(nv.toArray()),
        x: r9(xOrtho.toArray()),
        tid: (fi && fi.tid) || spec.tid || null,
        idx,
        frac: fracOf(cArr, bbox),
      };
    }
    const pt = spec.c || spec.p || spec.point;
    if (!pt) return null;
    const cv = new THREE.Vector3(...pt);
    if (spec.world) cv.applyMatrix4(Model.worldMatrix(doc, spec.id).invert());
    const cArr = r6(cv.toArray());
    return { kind: 'point', c: cArr, n: null, x: null, tid: null, idx: null, frac: fracOf(cArr, bbox) };
  }

  function matchFaceRef(itemId, ref) {
    if (!ref || ref.kind !== 'face') return null;
    const res = App.results.get(itemId);
    const data = res && res.data;
    const faces = data && data.faces;
    if (!faces || !faces.length) return null;
    const bbox = data.bbox;
    if (ref.tid) {
      const byTid = faces.findIndex((f) => f && f.t === 'PLANE' && f.tid === ref.tid && f.c && f.n);
      if (byTid >= 0) {
        const f = faces[byTid];
        return { idx: byTid, c: r6(f.c), n: r9(f.n), tid: f.tid, frac: fracOf(f.c, bbox) };
      }
    }
    const rn = new THREE.Vector3(...ref.n).normalize();
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (!f || f.t !== 'PLANE' || !f.c || !f.n) continue;
      const fn = new THREE.Vector3(...f.n).normalize();
      if (fn.dot(rn) < 0.995) continue;
      let score = Math.hypot(f.c[0] - ref.c[0], f.c[1] - ref.c[1], f.c[2] - ref.c[2]);
      if (ref.frac && bbox) {
        const ff = fracOf(f.c, bbox);
        const fDist = Math.hypot(ff[0] - ref.frac[0], ff[1] - ref.frac[1], ff[2] - ref.frac[2]);
        score = fDist * 100 + score * 1e-3;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return null;
    const f = faces[best];
    return { idx: best, c: r6(f.c), n: r9(f.n), tid: f.tid || ref.tid || null, frac: fracOf(f.c, bbox) };
  }

  let relinking = false;
  function relinkFixed() {
    if (relinking || !App.doc) return;
    const fjs = list().filter(fixed);
    if (!fjs.length) return;
    const refUpdates = [];
    let needSync = false;
    for (const j of fjs) {
      if (j.mode === 'face') {
        const mA = matchFaceRef(j.a, j.refA);
        if (mA) {
          const dc = Math.hypot(mA.c[0] - j.refA.c[0], mA.c[1] - j.refA.c[1], mA.c[2] - j.refA.c[2]);
          const dn = Math.hypot(mA.n[0] - j.refA.n[0], mA.n[1] - j.refA.n[1], mA.n[2] - j.refA.n[2]);
          if (dc > 1e-4 || dn > 1e-4 || (mA.tid && mA.tid !== j.refA.tid)) refUpdates.push({ jid: j.id, side: 'refA', m: mA });
        }
        const mB = matchFaceRef(j.b, j.refB);
        if (mB) {
          const dc = Math.hypot(mB.c[0] - j.refB.c[0], mB.c[1] - j.refB.c[1], mB.c[2] - j.refB.c[2]);
          const dn = Math.hypot(mB.n[0] - j.refB.n[0], mB.n[1] - j.refB.n[1], mB.n[2] - j.refB.n[2]);
          if (dc > 1e-4 || dn > 1e-4 || (mB.tid && mB.tid !== j.refB.tid)) refUpdates.push({ jid: j.id, side: 'refB', m: mB });
        }
      }
      const B = top(j.b);
      const sol = solveFixedPose(App.doc, j);
      if (B && sol) {
        const LbNew = Model.parentWorld(App.doc, B.id).invert().multiply(sol.WbNew);
        if (maxMatDiff(LbNew, Model.localMatrix(B)) > 1e-4) needSync = true;
      }
    }
    if (!refUpdates.length && !needSync) return;
    relinking = true;
    try {
      App.change('Verbindung nachgeführt', (doc) => {
        for (const u of refUpdates) {
          const j = list(doc).find((x) => x.id === u.jid);
          if (!j || !j[u.side]) continue;
          const prev = j[u.side];
          const nVec = new THREE.Vector3(...u.m.n).normalize();
          let xVec = prev.x ? new THREE.Vector3(...prev.x) : canonicalX(u.m.n);
          xVec.addScaledVector(nVec, -xVec.dot(nVec));
          if (xVec.lengthSq() < 1e-9) xVec = canonicalX(u.m.n);
          xVec.normalize();
          j[u.side] = { ...prev, c: u.m.c, n: u.m.n, x: r9(xVec.toArray()), tid: u.m.tid, idx: u.m.idx, frac: u.m.frac };
        }
        syncFixed(doc);
      }, { amend: true });
    } finally { relinking = false; }
  }

  function addFixed(aSpec, bSpec, opts = {}) {
    if (!aSpec || !bSpec) return { ok: false, msg: 'Bitte zwei verschiedene Teile wählen.' };
    const A = top(aSpec.id), B = top(bSpec.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile für die Verbindung.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (B.locked) return { ok: false, msg: `„${Model.label(B)}“ ist gesperrt.` };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon miteinander verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung gehalten.` };
    const refA = resolveRef(aSpec, App.doc), refB = resolveRef(bSpec, App.doc);
    if (!refA || !refB) return { ok: false, msg: 'Die gewählte Fläche oder der Punkt konnte nicht bestimmt werden.' };
    const mode = refA.kind === 'face' && refB.kind === 'face' ? 'face' : 'point';
    let relQ = null;
    if (mode === 'point') {
      const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
      Model.worldMatrix(App.doc, A.id).decompose(new THREE.Vector3(), qa, new THREE.Vector3());
      Model.worldMatrix(App.doc, B.id).decompose(new THREE.Vector3(), qb, new THREE.Vector3());
      relQ = r9(qa.clone().invert().multiply(qb).toArray());
    }
    let jid = null;
    App.change('Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const idx = doc.joints.length + 1;
      doc.joints.push({
        id: jid,
        kind: 'fixed',
        name: opts.name || `Verbindung ${idx}`,
        a: A.id,
        b: B.id,
        mode,
        refA,
        refB,
        flip: !!opts.flip,
        rot: Number.isFinite(+opts.rot) ? round(+opts.rot, 4) : 0,
        offset: mode === 'face' && Number.isFinite(+opts.offset) ? round(+opts.offset, 4) : 0,
        ...(relQ ? { relQ } : {}),
        ao: [0, 0, 0],
        ad: [0, 0, 1],
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: 0,
        max: 0,
      });
      syncFixed(doc);
    });
    if (jid) drawSelectedJoint();
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung ließ sich nicht anlegen.' };
  }

  function updateFixed(jid, patch, opts = {}) {
    const label = opts.label || ('flip' in patch ? 'Verbindung umgedreht' : 'name' in patch ? 'Verbindung umbenannt' : 'Verbindung geändert');
    const changeOpts = opts.merge ? { merge: opts.merge } : {};
    const ok = App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid);
      if (!j || !fixed(j)) return false;
      if ('name' in patch) j.name = String(patch.name || '').trim() || j.name;
      if ('flip' in patch) j.flip = !!patch.flip;
      if ('rot' in patch) j.rot = round(Number(patch.rot) || 0, 4);
      if ('offset' in patch) j.offset = round(Number(patch.offset) || 0, 4);
      if ('mode' in patch) j.mode = patch.mode;
      if ('refA' in patch) j.refA = patch.refA;
      if ('refB' in patch) j.refB = patch.refB;
      if ('relQ' in patch) { if (patch.relQ) j.relQ = patch.relQ; else delete j.relQ; }
      if ('a' in patch) j.a = patch.a;
      if ('b' in patch) j.b = patch.b;
      syncFixed(doc);
    }, changeOpts);
    drawSelectedJoint();
    return ok;
  }

  function flipFixed(jid) {
    const j = list().find((x) => x.id === jid);
    if (!j || !fixed(j)) return false;
    return updateFixed(jid, { flip: !j.flip }, { label: 'Verbindung umgedreht' });
  }

  // Gelenk ohne Klicken anlegen (für den KI-Kollegen): Achse o/d in Weltkoordinaten; liefert die Kennung oder eine Meldung
  function add(aId, bId, o, d, opts = {}) {
    if (opts && opts.kind === 'fixed') return addFixed(opts.aSpec || { id: aId, kind: 'point', c: o, world: true }, opts.bSpec || { id: bId, kind: 'point', c: o, world: true }, opts);
    const A = top(aId), B = top(bId);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Ein Gelenk braucht zwei verschiedene Teile.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon über Gelenke verbunden – ein weiteres ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einem Gelenk bewegt.` };
    const dv = new THREE.Vector3(...d); if (dv.lengthSq() < 1e-12) return { ok: false, msg: 'Die Gelenkachse braucht eine Richtung.' };
    dv.normalize();
    const kind = opts.kind === 'slide' ? 'slide' : 'rot';
    const lo = Number.isFinite(+opts.min) ? +opts.min : kind === 'slide' ? -20 : -90, hi = Number.isFinite(+opts.max) ? +opts.max : kind === 'slide' ? 20 : 90;
    let jid = null;
    App.change('Gelenk angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({ id: jid, a: A.id, b: B.id, ao: o.map((v) => round(+v, 6)), ad: dv.toArray().map((v) => round(v, 9)), home: Model.localMatrix(b).toArray().map((v) => round(v, 9)), ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2), ...(kind === 'slide' ? { kind } : {}) });
    });
    if (jid && opts.ang && Number.isFinite(+opts.ang)) setAngle(jid, +opts.ang);
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Das Gelenk ließ sich nicht anlegen.' };
  }
  // Gelenk anlegen: zwei Teile gewählt, das zuletzt gewählte bewegt sich; dann die Achse im Bild wählen
  function start() {
    const sel = App.sel.map((id) => top(id)).filter(Boolean);
    if (sel.length !== 2) { UI.toast('Wähle genau zwei Teile (mit Umschalt klicken – Teile in einer Gruppe links im Verlauf).', { icon: 'info' }); return false; }
    const [A, B] = sel;
    const why = refuse(App.doc, A, B); if (why) { UI.toast(why, { icon: 'info' }); return false; }
    if (connected(App.doc, A.id, B.id)) { UI.toast('Das ergäbe einen Kreis – die beiden Teile sind schon über Gelenke miteinander verbunden.', { icon: 'info' }); return false; }
    if (list().some((j) => j.b === B.id)) { UI.toast(`„${Model.label(B)}“ wird schon von einem Gelenk bewegt – jedes Teil darf nur von einem Gelenk bewegt werden.`, { icon: 'info' }); return false; }
    Features.pickAxisThen((ax) => {
      let jid = null;
      App.change('Gelenk angelegt', (doc) => {
        const b = top(B.id, doc); if (!b) return false;
        if (connected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id)) return false;
        doc.joints = doc.joints || [];
        jid = uid('j');
        doc.joints.push({ id: jid, a: A.id, b: B.id, ao: ax.o.toArray().map((v) => round(v, 6)), ad: ax.d.toArray().map((v) => round(v, 9)), home: Model.localMatrix(b).toArray().map((v) => round(v, 9)), ang: 0, min: -90, max: 90 });
      });
      App.select([B.id]);
      UI.toast(`Gelenk angelegt: „${Model.label(B)}“ dreht sich um die ${ax.what}, „${Model.label(A)}“ bleibt stehen.`, { icon: 'check', ms: 3600 });
    }, '<b>Gelenkachse wählen:</b> Klick auf eine gerade Kante, einen runden Rand oder eine runde Fläche (Stift, Loch). <b>Esc</b> bricht ab.');
    return true;
  }

  // ---------- Interaktive 2-Klick-Auswahl für „Verbinden: fest“ ----------
  let pickState = null, pickBar = null, pickObjs = [];
  let selJoint = null, visObjs = [];

  function clearPickVis() {
    for (const o of pickObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    pickObjs = [];
    Viewer.highlightFace('hover', null, null);
    Viewer.requestRender();
  }
  function clearSelVis() {
    for (const o of visObjs) { Viewer.groups.overlay.remove(o); Viewer.disposeFat(o); }
    visObjs = [];
    Viewer.requestRender();
  }
  function drawSelectedJoint() {
    clearSelVis();
    if (!selJoint || App.mode !== 'model' || (typeof Sketch !== 'undefined' && Sketch.active)) return;
    const j = list().find((x) => x.id === selJoint);
    if (!j || !Array.isArray(j.ao)) return;
    const p = new THREE.Vector3(...j.ao);
    const pt = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], '#f08c00', 11, { depthTest: false });
    Viewer.groups.overlay.add(pt); visObjs.push(pt);
    if (Array.isArray(j.ad)) {
      const d = new THREE.Vector3(...j.ad).normalize();
      const b = p.clone().addScaledVector(d, 10);
      const ln = Viewer.makeFat([p.x, p.y, p.z, b.x, b.y, b.z], '#f08c00', 3, { depthTest: false });
      Viewer.groups.overlay.add(ln); visObjs.push(ln);
    }
    Viewer.requestRender();
  }
  function addPickDot(p, color = '#0c7a70') {
    const d = Viewer.makeFat([p.x, p.y, p.z, p.x, p.y, p.z + 0.001], color, 10, { depthTest: false });
    Viewer.groups.overlay.add(d); pickObjs.push(d);
    return d;
  }
  function syncPickVis() {
    clearPickVis();
    if (!pickState) return;
    if (pickState.pick1) {
      if (pickState.pick1.worldP) addPickDot(new THREE.Vector3(...pickState.pick1.worldP), '#f08c00');
      if (pickState.pick1.kind === 'face' && pickState.pick1.faceIdx != null) {
        Viewer.highlightFace('sel', pickState.pick1.id, pickState.pick1.faceIdx);
      }
    }
    if (pickState.hover) {
      if (pickState.hover.kind === 'face' && pickState.hover.faceIdx != null) {
        Viewer.highlightFace('hover', pickState.hover.id, pickState.hover.faceIdx);
      } else if (pickState.hover.worldP) {
        addPickDot(new THREE.Vector3(...pickState.hover.worldP), Viewer.theme.accent);
      }
    }
    Viewer.requestRender();
  }
  function updatePickBar() {
    if (!pickBar || !pickState) return;
    const msg = pickBar.querySelector('#jp-msg');
    const name1 = pickState.pick1 ? Model.label(top(pickState.pick1.id) || { name: 'Teil 1' }) : '';
    if (msg) msg.textContent = pickState.pick1 ? T('joint.pickStep2', { name: name1 }) : T('joint.pickStep1');
    for (const m of ['auto', 'face', 'point']) {
      const b = pickBar.querySelector('#jp-mode-' + m);
      if (b) b.setAttribute('aria-pressed', String(pickState.mode === m));
    }
    UI.hint(pickState.pick1 ? `<b>${esc(T('joint.pickStep2', { name: name1 }))}</b> <b>Esc</b> bricht ab.` : `<b>${esc(T('joint.pickStep1'))}</b> <b>Esc</b> bricht ab.`);
  }
  function showPickBar() {
    hidePickBar();
    pickBar = h('div', { class: 'sketchbar measurebar', id: 'joint-pick-bar' });
    const msg = h('span', { class: 'm-cur', id: 'jp-msg' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Auswahlart' });
    for (const [m, lbl] of [['auto', 'Auto'], ['face', 'Fläche'], ['point', 'Punkt']]) {
      const b = h('button', { type: 'button', id: 'jp-mode-' + m, 'aria-pressed': String(pickState.mode === m) }, lbl);
      b.onclick = () => { if (!pickState) return; pickState.mode = m; updatePickBar(); };
      seg.append(b);
    }
    const cancelBtn = h('button', { type: 'button', class: 'tool', id: 'jp-cancel', 'data-kbd': 'Esc' });
    cancelBtn.innerHTML = icon('close') + `<span>${esc(T('common.cancel'))}</span>`;
    cancelBtn.onclick = () => stopPick();
    pickBar.append(msg, seg, cancelBtn);
    $('#overlay').append(pickBar);
    updatePickBar();
  }
  function hidePickBar() { if (pickBar) { pickBar.remove(); pickBar = null; } }

  function pickEntityAt(cx, cy, mode = 'auto') {
    const hit = Viewer.pick(cx, cy, { edgePx: mode === 'face' ? 0 : 9, noEdges: mode === 'face', solidsOnly: true });
    if (!hit || !hit.node) return null;
    const M = hit.node.obj.matrixWorld;
    const invW = M.clone().invert();
    const r = Viewer.canvas.getBoundingClientRect();
    const snapEdgePt = (maxPx) => {
      if (hit.edgeIdx == null) return null;
      const g = hit.node.data.edges && hit.node.data.edges[hit.edgeIdx];
      if (!g) return null;
      const cand = mode === 'point' ? [g.a, g.b, g.m, g.c].filter(Boolean) : [g.a, g.b, g.c].filter(Boolean);
      let best = null, bd = maxPx;
      for (const pt of cand) {
        const w = new THREE.Vector3(...pt).applyMatrix4(M);
        const s = Viewer.toScreen(w);
        const d = Math.hypot(s.x - (cx - r.left), s.y - (cy - r.top));
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    };
    if (mode === 'point') {
      const sp = snapEdgePt(12) || hit.point.clone();
      const lp = sp.clone().applyMatrix4(invW);
      return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(sp.toArray()) };
    }
    if (mode === 'auto') {
      const sp = snapEdgePt(8);
      if (sp) {
        const lp = sp.clone().applyMatrix4(invW);
        return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(sp.toArray()) };
      }
    }
    const f = hit.faceIdx >= 0 ? hit.node.data.faces[hit.faceIdx] : null;
    if (f && f.t === 'PLANE' && f.n && f.c) {
      return {
        kind: 'face',
        id: hit.id,
        faceIdx: hit.faceIdx,
        info: f,
        c: r6(f.c),
        n: r9(f.n),
        worldP: r6(new THREE.Vector3(...f.c).applyMatrix4(M).toArray()),
      };
    }
    if (mode === 'auto') {
      const lp = hit.point.clone().applyMatrix4(invW);
      return { kind: 'point', id: hit.id, c: r6(lp.toArray()), worldP: r6(hit.point.toArray()) };
    }
    return null;
  }

  function stopPick() {
    if (!pickState) return;
    Viewer.canvas.removeEventListener('pointerdown', pickState.down, true);
    Viewer.canvas.removeEventListener('pointermove', pickState.move, true);
    window.removeEventListener('keydown', pickState.key, true);
    pickState = null;
    hidePickBar();
    clearPickVis();
    Viewer.highlightFace('sel', null, null);
    Viewer.canvas.style.cursor = '';
    UI.hint(null);
    App.refreshSelectionVisuals();
    Handles.rebuild();
  }

  function startFixed(firstFace = null, replaceJid = null) {
    stopPlay();
    if (typeof Measure !== 'undefined' && Measure.active) Measure.stop();
    if (typeof Notes !== 'undefined' && Notes.active) Notes.stop();
    stopPick();
    const solids = Model.activeItems(App.doc).filter((x) => !x.hidden && x.role !== 'hole');
    if (solids.length < 2) {
      UI.toast('Für „Verbinden: fest“ brauchst du mindestens zwei sichtbare Körper.', { icon: 'info' });
      return false;
    }
    let pick1 = null;
    if (firstFace && firstFace.id && firstFace.info && firstFace.info.t === 'PLANE') {
      const n = Viewer.nodes.get(firstFace.id);
      const M = n ? n.obj.matrixWorld : Model.worldMatrix(App.doc, firstFace.id);
      pick1 = {
        kind: 'face',
        id: firstFace.id,
        faceIdx: firstFace.idx != null ? firstFace.idx : firstFace.faceIdx,
        info: firstFace.info,
        c: r6(firstFace.info.c),
        n: r9(firstFace.info.n),
        worldP: r6(new THREE.Vector3(...firstFace.info.c).applyMatrix4(M).toArray()),
      };
    }
    App.clearSelection();
    Handles.clear();
    const down = (e) => {
      if (e.button !== 0 || !pickState) return;
      e.preventDefault(); e.stopPropagation();
      const ent = pickEntityAt(e.clientX, e.clientY, pickState.mode);
      if (!ent) {
        UI.toast(pickState.mode === 'face' ? 'Klick auf eine ebene Fläche eines Körpers.' : 'Klick auf eine Fläche oder einen Punkt an einem Körper.', { icon: 'info' });
        return;
      }
      const part = top(ent.id);
      if (!part) return;
      if (!pickState.pick1) {
        pickState.pick1 = ent;
        pickState.hover = null;
        syncPickVis();
        updatePickBar();
        return;
      }
      const p1 = pickState.pick1;
      if (p1.id === ent.id) {
        UI.toast('Wähle eine Fläche oder einen Punkt auf einem anderen Teil.', { icon: 'info' });
        return;
      }
      const repId = pickState.replaceJid;
      if (repId) {
        const refA = resolveRef(p1, App.doc), refB = resolveRef(ent, App.doc);
        if (!refA || !refB) return;
        const mode = refA.kind === 'face' && refB.kind === 'face' ? 'face' : 'point';
        let relQ = null;
        if (mode === 'point') {
          const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
          Model.worldMatrix(App.doc, p1.id).decompose(new THREE.Vector3(), qa, new THREE.Vector3());
          Model.worldMatrix(App.doc, ent.id).decompose(new THREE.Vector3(), qb, new THREE.Vector3());
          relQ = r9(qa.clone().invert().multiply(qb).toArray());
        }
        stopPick();
        updateFixed(repId, { a: p1.id, b: ent.id, mode, refA, refB, relQ }, { label: 'Verbindungs-Bezüge geändert' });
        select(repId);
        UI.toast('Verbindung aktualisiert.', { icon: 'check' });
        return;
      }
      const res = addFixed(p1, ent);
      if (!res.ok) {
        UI.toast(res.msg || 'Verbindung konnte nicht angelegt werden.', { kind: 'bad' });
        return;
      }
      stopPick();
      select(res.id);
      UI.toast(`Verbunden: „${Model.label(top(ent.id))}“ liegt fest an „${Model.label(top(p1.id))}“.`, { icon: 'check', ms: 3400 });
    };
    const move = (e) => {
      if (!pickState) return;
      const ent = pickEntityAt(e.clientX, e.clientY, pickState.mode);
      pickState.hover = ent;
      syncPickVis();
    };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); }
    };
    pickState = { mode: 'auto', pick1, hover: null, replaceJid, down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    showPickBar();
    syncPickVis();
    return true;
  }

  // Winkel setzen – wurde das Teil inzwischen von Hand bewegt, gilt seine jetzige Lage als neue Ausgangslage
  function setAngle(jid, ang) {
    App.change('Gelenk gedreht', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || fixed(j)) return false;
      const b = top(j.b, doc); if (!b) return false;
      syncHome(b, j, doc);
      const prev = j.ang;
      j.ang = round(clamp(Number(ang) || 0, j.min, j.max), 4);
      Model.setFromMatrix(b, pose(j, j.ang, null, doc));
      if (Math.abs(j.ang - prev) > 1e-9) moveChain(doc, j.b, stepMatrix(j, j.ang - prev));
    }, { merge: 'joint:' + jid });
  }
  // Art wechseln (Drehen ↔ Schieben): das Teil geht zurück in die Ausgangslage
  function setKind(jid, kind) {
    App.change('Gelenk-Art', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || fixed(j)) return false;
      const b = top(j.b, doc); if (!b) return false;
      syncHome(b, j, doc);
      const prev = j.ang;
      if (Math.abs(prev) > 1e-9) moveChain(doc, j.b, stepMatrix(j, -prev));
      j.kind = kind === 'slide' ? 'slide' : 'rot'; j.ang = 0;
      if (j.kind === 'slide') { j.min = -20; j.max = 20; } else { j.min = -90; j.max = 90; }
      Model.setFromMatrix(b, pose(j, 0, null, doc));
    });
  }
  function setRange(jid, k, v) {
    App.change('Gelenk-Bereich', (doc) => { const j = list(doc).find((x) => x.id === jid); if (!j || fixed(j)) return false; j[k] = round(clamp(Number(v) || 0, -360, 360), 2); if (j.min > j.max) [j.min, j.max] = [j.max, j.min]; });
  }
  function remove(jid) {
    const cur = list().find((x) => x.id === jid);
    const wasFixed = fixed(cur);
    App.change(wasFixed ? 'Verbindung gelöst' : 'Gelenk gelöst', (doc) => { doc.joints = list(doc).filter((x) => x.id !== jid); });
    if (selJoint === jid) { selJoint = null; clearSelVis(); Panels.renderRight(); Panels.renderLeft(); }
    UI.toast(wasFixed ? 'Verbindung gelöst – das Teil lässt sich wieder frei bewegen.' : 'Gelenk gelöst – das Teil bleibt, wo es gerade ist.', { icon: 'check' });
  }
  // Bewegung prüfen: in Schritten von min bis max drehen und den CAD-Kern fragen, ob sich die Teile (samt mitbewegter Kette) durchdringen
  async function check(jid, step) {
    const j = list().find((x) => x.id === jid); if (!j || fixed(j)) return null;
    step = step || (slide(j) ? Math.max(0.5, round((j.max - j.min) / 40, 1)) : 5);
    const A = top(j.a), B = top(j.b); if (!A || !B) return null;
    const V = Model.vars(App.doc).v, out = [];
    // alles in Weltlage rechnen – so geht es auch mit Teilen in Gruppen
    const W = (it) => Model.worldMatrix(App.doc, it.id);
    const kw = (it, M) => { const c = deepClone(it); Model.setFromMatrix(c, M); return Model.kernelItem(c, V); };
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter((x) => x && !Model.parentsOf(App.doc, x.id).some((p) => p.id === j.b));
    const movSet = new Set([B.id, ...down.map((x) => x.id)]);
    const compIds = new Set([j.a, j.b]);
    let chg = true;
    while (chg) {
      chg = false;
      for (const k of list()) {
        if (compIds.has(k.a) && !compIds.has(k.b)) { compIds.add(k.b); chg = true; }
        if (compIds.has(k.b) && !compIds.has(k.a)) { compIds.add(k.a); chg = true; }
      }
    }
    const statK = [...compIds].filter((id) => !movSet.has(id)).map((id) => top(id)).filter((x) => x && x.role !== 'hole').map((it) => kw(it, W(it)));
    const Bw = W(B), downCur = down.map((it) => ({ it, m: W(it) }));
    for (let a = j.min; a <= j.max + 1e-9; a += step) {
      const D = stepMatrix(j, a - j.ang);
      const movK = [kw(B, D.clone().multiply(Bw))];
      for (const d of downCur) movK.push(kw(d.it, D.clone().multiply(d.m)));
      let cl = null; try { cl = await Kernel.call('clashes', { scene: { items: [...statK, ...movK] } }); } catch (_) {}
      const v = cl ? cl.pairs.filter((p) => movSet.has(p.a) !== movSet.has(p.b)).reduce((s, p) => s + p.v, 0) : 0;
      out.push({ a: round(a, 4), v });
    }
    return out;
  }
  function describe(j, res) {
    const hit = res.filter((r) => r.v > 0.05);
    const u = slide(j) ? Units.label() : '°';
    const fv = (x) => (slide(j) ? Units.fmtLen(x, 1) : fmtAngle(x));
    if (!hit.length) return { ok: true, text: `Frei im ganzen Bereich von ${fv(j.min)} ${u} bis ${fv(j.max)} ${u} – nichts stößt an.` };
    const free = res.filter((r) => r.v <= 0.05).map((r) => r.a);
    const lo = res.filter((r) => r.a <= j.ang && r.v > 0.05).map((r) => r.a), hi = res.filter((r) => r.a >= j.ang && r.v > 0.05).map((r) => r.a);
    const from = lo.length ? Math.max(...lo) : null, to = hi.length ? Math.min(...hi) : null;
    const parts = [];
    if (to != null) parts.push(`stößt in Plus-Richtung bei ${fv(to)} ${u} an`);
    if (from != null) parts.push(`in Minus-Richtung bei ${fv(from)} ${u}`);
    const atNow = res.find((r) => Math.abs(r.a - j.ang) < 1e-6);
    return { ok: false, text: (atNow && atNow.v > 0.05 ? 'Schon in dieser Stellung stecken die Teile ineinander. ' : '') + `Das Teil ${parts.join(', ')}.` + (free.length ? ` Frei: ${fv(Math.min(...free))} … ${fv(Math.max(...free))} ${u} (nicht unbedingt am Stück).` : '') };
  }
  // Freier Bereich um die jetzige Stellung aus dem Ergebnis von „Bewegung prüfen“ – wird zum Anschlag (Von/Bis)
  function freeRange(j, res) {
    const s = (res || []).slice().sort((a, b) => a.a - b.a); if (!s.length) return null;
    let i0 = 0, best = Infinity; s.forEach((r, i) => { const d = Math.abs(r.a - j.ang); if (d < best) { best = d; i0 = i; } });
    if (s[i0].v > 0.05) return null;
    let lo = i0, hi = i0; while (lo > 0 && s[lo - 1].v <= 0.05) lo--; while (hi < s.length - 1 && s[hi + 1].v <= 0.05) hi++;
    return [s[lo].a, s[hi].a];
  }
  function setStops(jid, lo, hi) {
    App.change('Gelenk-Anschlag', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j || fixed(j)) return false;
      j.min = round(Math.min(lo, hi), 2); j.max = round(Math.max(lo, hi), 2);
    });
    UI.toast('Anschlag gesetzt – weiter lässt sich das Gelenk nicht bewegen.', { icon: 'check' });
  }
  // Bewegung abspielen: nur im Bild (das Projekt ändert sich nicht) – bis zum einen Anschlag, zum anderen und zurück
  let anim = null;
  function stopPlay() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    clearTimeout(anim.timer);
    for (const id of anim.ids) { const it = top(id); if (it) Viewer.updateNode(id, { matrix: Model.localMatrix(it) }); }
    const b = anim.btn, jid = anim.jid; anim = null; Viewer.requestRender();
    const el = (b && b.isConnected) ? b : document.querySelector(`.joint-item[data-jid="${jid}"] [id^="jt-play"]`);
    if (el) el.innerHTML = icon('play') + 'Bewegung abspielen';
  }
  function play(jid, btn) {
    if (anim) { const same = anim.jid === jid; stopPlay(); if (same) return; }
    const j = list().find((x) => x.id === jid); if (!j || fixed(j)) return;
    const B = top(j.b); if (!B) return;
    if (!isTop(B.id) || downstream(App.doc, j.b).some((k) => !isTop(k.b))) { UI.toast('Abspielen geht nur, wenn die bewegten Teile ganz oben im Verlauf liegen – in einer Gruppe zeigt das Bild sie als einen Körper. Mit dem Regler kannst du trotzdem jede Stellung ansehen.', { icon: 'info', ms: 5000 }); return; }
    const cur = Model.localMatrix(B), exp = pose(j, j.ang);
    const home = cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4) ? pose(j, -j.ang, cur.toArray()).toArray() : j.home;
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter(Boolean).map((it) => ({ it, m: Model.localMatrix(it) }));
    const seq = [j.ang, j.max, j.min, j.ang], speed = slide(j) ? Math.max(5, (j.max - j.min) / 1.4) : 120;
    const legs = []; let T = 0; for (let i = 1; i < seq.length; i++) { const d = Math.abs(seq[i] - seq[i - 1]) / speed * 1000; legs.push({ a0: seq[i - 1], a1: seq[i], t0: T, t1: T + d }); T += d; }
    if (T < 1) return;
    const t0 = performance.now();
    const applyPose = (a) => {
      Viewer.updateNode(B.id, { matrix: pose(j, a, home) });
      const D = stepMatrix(j, a - j.ang); for (const d of down) Viewer.updateNode(d.it.id, { matrix: D.clone().multiply(d.m) });
    };
    anim = { jid, ids: [B.id, ...down.map((d) => d.it.id)], btn, raf: 0, timer: 0, a: j.ang, applyPose };
    if (btn) btn.innerHTML = icon('close') + 'Stopp';
    const step = () => {
      if (!anim) return;
      cancelAnimationFrame(anim.raf);
      clearTimeout(anim.timer);
      const t = performance.now() - t0;
      if (t >= T) { stopPlay(); return; }
      const L = legs.find((l) => t < l.t1) || legs[legs.length - 1], u = (t - L.t0) / Math.max(1, L.t1 - L.t0), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const a = L.a0 + (L.a1 - L.a0) * e; anim.a = a;
      applyPose(a);
      anim.raf = requestAnimationFrame(step);
      anim.timer = setTimeout(step, 50);
    };
    step();
  }

  // ---------- Verlauf links & Eigenschaften rechts ----------
  function jointLabel(j) {
    if (j.name) return j.name;
    const A = top(j.a), B = top(j.b);
    return (A ? Model.label(A) : 'Teil A') + ' ↔ ' + (B ? Model.label(B) : 'Teil B');
  }
  function select(jid) {
    selJoint = jid || null;
    if (selJoint) {
      App.clearSelection();
      if (typeof Datums !== 'undefined') {
        if (Datums.selected) Datums.select(null);
        if (Datums.selectedAxis) Datums.selectAxis(null);
        if (Datums.selectedPoint) Datums.selectPoint(null);
        if (Datums.selectedCsys) Datums.selectCsys(null);
      }
      if (typeof Measure !== 'undefined' && Measure.selected) Measure.select(null);
    }
    drawSelectedJoint();
    Panels.renderLeft();
    Panels.renderRight();
  }

  function renderJointControls(j, sfx = '', opts = {}) {
    const A = top(j.a), B = top(j.b);
    const box = h('div', { class: 'joint-item', dataset: { jid: j.id } });
    if (fixed(j)) {
      const modeLbl = j.mode === 'face' ? 'Fläche an Fläche' : 'Punkt an Punkt';
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ist fest mit <b>${esc(Model.label(A))}</b> verbunden (${modeLbl}).` }));
      const fl = h('div', { class: 'fields' });
      fl.append(UI.numField({ id: 'jt-rot' + sfx, label: 'Drehung', value: j.rot || 0, unit: '°', expr: false, onCommit: (v) => updateFixed(j.id, { rot: v }, { merge: 'jfix:rot:' + j.id }) }));
      if (j.mode === 'face') {
        fl.append(UI.numField({ id: 'jt-offset' + sfx, label: 'Abstand', value: j.offset || 0, len: true, expr: false, onCommit: (v) => updateFixed(j.id, { offset: v }, { merge: 'jfix:off:' + j.id }) }));
      }
      box.append(fl);
      const r1 = h('div', { class: 'btn-row' });
      const fb = h('button', { type: 'button', class: 'btn' + (j.flip ? ' primary' : ''), id: 'jt-flip' + sfx, 'aria-pressed': String(!!j.flip) });
      fb.innerHTML = icon('mirror') + esc(T('joint.fixedFlip'));
      fb.onclick = () => flipFixed(j.id);
      r1.append(fb);
      if (opts.full) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'jt-repick' + sfx });
        rb.innerHTML = icon('cursor') + esc(T('joint.repickBtn'));
        rb.onclick = () => startFixed(null, j.id);
        r1.append(rb);
      } else {
        const eb = h('button', { type: 'button', class: 'btn', id: 'jt-open' + sfx });
        eb.innerHTML = icon('edit') + 'Bearbeiten';
        eb.onclick = () => select(j.id);
        r1.append(eb);
      }
      const del = h('button', { type: 'button', class: 'btn danger', id: 'jt-del' + sfx });
      del.innerHTML = icon('ungroup') + esc(T('joint.removeBtn'));
      del.onclick = () => remove(j.id);
      box.append(r1, h('div', { class: 'btn-row' }, del));
      return box;
    }
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter(Boolean);
    const moveTxt = down.length ? ` (${down.map((x) => '„' + esc(Model.label(x)) + '“').join(', ')} ${down.length === 1 ? 'bewegt sich' : 'bewegen sich'} mit)` : '';
    box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ${slide(j) ? 'gleitet' : 'dreht sich'} gegenüber <b>${esc(Model.label(A))}</b>${moveTxt}.` }));
    box.append(UI.selectField({ id: 'jt-kind' + sfx, label: 'Art', value: slide(j) ? 'slide' : 'rot', options: [['rot', 'Drehen um die Achse'], ['slide', 'Schieben entlang der Achse']], onChange: (v) => setKind(j.id, v) }));
    const range = h('input', { type: 'range', id: 'jt-range' + sfx, min: j.min, max: j.max, step: slide(j) ? 0.5 : 1, value: j.ang, 'aria-label': slide(j) ? 'Weg' : 'Gelenkwinkel', style: { width: '100%' } });
    range.oninput = () => setAngle(j.id, +range.value);
    box.append(range);
    const f = h('div', { class: 'fields three' });
    f.append(UI.numField({ id: 'jt-ang' + sfx, label: slide(j) ? 'Weg' : 'Winkel', value: j.ang, unit: unit(j), expr: false, onCommit: (v) => setAngle(j.id, v) }));
    f.append(UI.numField({ id: 'jt-min' + sfx, label: 'Von', value: j.min, unit: unit(j), expr: false, onCommit: (v) => setRange(j.id, 'min', v) }));
    f.append(UI.numField({ id: 'jt-max' + sfx, label: 'Bis', value: j.max, unit: unit(j), expr: false, onCommit: (v) => setRange(j.id, 'max', v) }));
    box.append(f);
    const res = h('div', { class: 'hint-box', id: 'jt-result' + sfx, hidden: true });
    const cb = h('button', { type: 'button', class: 'btn', id: 'jt-check' + sfx }); cb.innerHTML = icon('hinge') + 'Bewegung prüfen';
    cb.onclick = async () => {
      cb.disabled = true; res.hidden = false; res.className = 'hint-box'; res.textContent = slide(j) ? 'Prüfe Schritt für Schritt …' : 'Prüfe in 5°-Schritten …';
      const r = await check(j.id); cb.disabled = false;
      if (!r) { res.textContent = 'Das ging nicht.'; return; }
      const d = describe(j, r); res.className = d.ok ? 'ok-box' : 'err-box'; res.textContent = d.text; res.dataset.hits = String(r.filter((x) => x.v > 0.05).length);
      const fr = d.ok ? null : freeRange(j, r);
      const old = box.querySelector('.jt-stop'); if (old) old.remove();
      if (fr && fr[1] - fr[0] > 1e-9 && (fr[0] > j.min + 1e-9 || fr[1] < j.max - 1e-9)) {
        const fVal = (x) => (slide(j) ? Units.fmtLen(x, 1) : fmtAngle(x));
        const uLbl = slide(j) ? Units.label() : unit(j);
        const sb = h('button', { type: 'button', class: 'btn small jt-stop', id: 'jt-stop' + sfx }); sb.innerHTML = icon('check') + `Als Anschlag übernehmen: ${fVal(fr[0])} … ${fVal(fr[1])} ${uLbl}`;
        sb.onclick = () => setStops(j.id, fr[0], fr[1]);
        res.after(sb);
      }
    };
    const pb = h('button', { type: 'button', class: 'btn', id: 'jt-play' + sfx }); pb.innerHTML = icon(anim && anim.jid === j.id ? 'close' : 'play') + (anim && anim.jid === j.id ? 'Stopp' : 'Bewegung abspielen');
    pb.onclick = () => play(j.id, pb);
    const del = h('button', { type: 'button', class: 'btn', id: 'jt-del' + sfx }); del.innerHTML = icon('ungroup') + 'Gelenk lösen';
    del.onclick = () => remove(j.id);
    box.append(h('div', { class: 'btn-row' }, pb), h('div', { class: 'btn-row' }, cb, del), res);
    return box;
  }

  function treeSection() {
    const js = list().filter((j) => top(j.a) && top(j.b));
    if (!js.length) return null;
    const sec = h('div', { class: 'datum-tree joint-tree', id: 'joint-tree', 'data-help': 'fixedJoint' }, h('div', { class: 'section-h' }, T('joint.treeHeading')));
    for (const j of js) {
      const row = h('div', { class: 'tree-row joint-row' + (j.id === selJoint ? ' sel' : ''), 'data-joint': j.id });
      const ic = h('span', { class: 'swatch joint' }); ic.innerHTML = icon(fixed(j) ? 'lock' : 'hinge');
      const subTxt = fixed(j) ? (j.flip ? `${T('joint.fixedKind')} · ↺` : T('joint.fixedKind')) : (slide(j) ? 'Schieben' : 'Drehen');
      const del = h('button', { type: 'button', class: 'j-del', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      del.innerHTML = icon('trash');
      del.onclick = (e) => { e.stopPropagation(); remove(j.id); };
      row.append(ic, h('span', { class: 'nm', title: jointLabel(j) }, jointLabel(j)), h('span', { class: 'sub mono' }, subTxt), h('span', { class: 'm-acts' }, del));
      row.onclick = () => select(j.id === selJoint ? null : j.id);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        UI.menu(row, [
          { icon: 'edit', label: 'Bearbeiten', run: () => select(j.id) },
          ...(fixed(j) ? [{ icon: 'mirror', label: T('joint.fixedFlip'), run: () => flipFixed(j.id) }] : []),
          { icon: 'edit', label: T('common.rename'), run: async () => { const n = await UI.prompt(T('common.rename'), T('common.name'), jointLabel(j), T('common.rename')); if (n && n.trim()) App.change('Verbindung umbenannt', (doc) => { const x = list(doc).find((y) => y.id === j.id); if (x) x.name = n.trim(); }); } },
          '-',
          { icon: 'trash', label: T('common.delete'), run: () => remove(j.id) },
        ]);
      });
      sec.append(row);
    }
    return sec;
  }

  function renderPanel(body) {
    const j = list().find((x) => x.id === selJoint);
    if (!j) return false;
    const A = top(j.a), B = top(j.b);
    if (!A || !B) return false;
    const w = h('div', { class: 'props', id: 'joint-edit-panel', 'data-help': fixed(j) ? 'fixedJoint' : null });
    const nm = h('input', { id: 'jt-name', value: jointLabel(j), 'aria-label': T('common.name') });
    nm.addEventListener('change', () => {
      const v = nm.value.trim();
      if (v) App.change('Verbindung umbenannt', (doc) => { const x = list(doc).find((y) => y.id === j.id); if (x) x.name = v; });
    });
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    w.append(h('div', { class: 'prop-title' }, nm));
    const parts = h('div', { class: 'mini-list' });
    const mkPartRow = (lbl, item) => {
      const r = h('div', { class: 'mini-row dep-row', style: { cursor: 'pointer' } }, h('span', { class: 'grow' }, lbl), h('b', null, Model.label(item)));
      r.onclick = () => App.select([item.id]);
      return r;
    };
    parts.append(mkPartRow('Teil 1 (fest)', A), mkPartRow('Teil 2 (angelegt)', B));
    w.append(parts, renderJointControls(j, '', { full: true }));
    body.append(w);
    return true;
  }

  // Abschnitt „Gelenk“ / „Verbindungen“ in den Eigenschaften – zeigt alle Verbindungen des gewählten Teils
  function panel(it) {
    const js = allOf(it.id).filter((j) => top(j.a) && top(j.b));
    if (!js.length) return null;
    const allFixed = js.every(fixed);
    const title = js.length > 1 ? (allFixed ? `Verbindungen (${js.length})` : `Gelenke (${js.length})`) : (allFixed ? 'Verbindung' : 'Gelenk');
    const sec = h('div', { class: 'section', id: 'joint-sec' }, h('div', { class: 'section-h' }, title));
    js.forEach((j, idx) => {
      if (idx > 0) sec.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '6px 0', width: '100%' } }));
      sec.append(renderJointControls(j, idx ? '-' + idx : ''));
    });
    return sec;
  }

  // Gelöschte Teile: Gelenke / Verbindungen, die an ihnen hängen, fallen weg
  function init() {
    App.on('doc', () => {
      stopPlay();
      const js = list();
      if (js.length) {
        const ids = new Set(); Model.walk(App.doc.items, (x) => { ids.add(x.id); });
        if (js.some((j) => !ids.has(j.a) || !ids.has(j.b))) App.doc.joints = js.filter((j) => ids.has(j.a) && ids.has(j.b));
      }
      if (selJoint && !list().some((j) => j.id === selJoint)) selJoint = null;
      drawSelectedJoint();
    });
    App.on('selection', () => {
      if (App.sel.length && selJoint) {
        selJoint = null;
        clearSelVis();
      }
    });
    App.on('results', () => {
      if (anim && anim.applyPose) anim.applyPose(anim.a);
      relinkFixed();
      drawSelectedJoint();
    });
  }

  return {
    init, start, startFixed, stopPick, add, addFixed, updateFixed, flipFixed, syncFixed,
    setAngle, setKind, setRange, setStops, freeRange, play, stopPlay, remove, check, describe,
    panel, treeSection, renderPanel, select, of, allOf, downstream, pose,
    isFixedPart, fixedJointOf,
    get list() { return list(); },
    get selected() { return selJoint; },
    get picking() { return !!pickState; },
    get playing() { return anim ? { jid: anim.jid, a: anim.a } : null; },
  };
})();
