// ================= Gelenke & Verbindungen: Drehen, Schieben, Zylindrisch, Eben =================
// Ein Gelenk ist kein Schritt der Zeitleiste: Es setzt nur die Lage des beweglichen Teils (doc.joints).
// Mehrere Gelenke bilden eine Kette: Bewegt sich ein vorderes Gelenk, wandern alle Teile und Gelenkachsen dahinter mit.
// home = Lage des beweglichen Teils in der Nullstellung; ao/ad (und au bei eben) in Weltkoordinaten.
const Joints = (() => {
  const list = (doc = App.doc) => (doc && doc.joints) || [];
  const allOf = (id, doc = App.doc) => list(doc).filter((j) => j.a === id || j.b === id);
  const of = (id, doc = App.doc) => list(doc).find((j) => j.b === id) || list(doc).find((j) => j.a === id) || null;
  const drivingOf = (id, doc = App.doc) => list(doc).find((j) => j.b === id) || null;
  const kindOf = (j) => (j && (j.kind === 'slide' || j.kind === 'cyl' || j.kind === 'planar') ? j.kind : 'rot');
  const slide = (j) => kindOf(j) === 'slide';
  const isCyl = (j) => kindOf(j) === 'cyl';
  const isPlanar = (j) => kindOf(j) === 'planar';
  const r6 = (arr) => arr.map((v) => round(v, 6));
  const r9 = (arr) => arr.map((v) => round(v, 9));

  // Teil suchen – auch innerhalb von Gruppen (seit Sitzung 52)
  const top = (id, doc = App.doc) => { if (!doc || !doc.items) return null; const f = Model.find(doc, id); return f ? f.item : null; };
  const isTop = (id, doc = App.doc) => !!(doc && doc.items && doc.items.some((x) => x.id === id));
  // Bewegung M (in Weltkoordinaten) für ein Teil in einer Gruppe: im Koordinatensystem der Gruppe ausdrücken
  const conj = (doc, id, M) => { const P = Model.parentWorld(doc, id); return P.clone().invert().multiply(M).multiply(P); };
  const related = (doc, a, b) => Model.parentsOf(doc, a).some((p) => p.id === b) || Model.parentsOf(doc, b).some((p) => p.id === a);
  const inOp = (doc, id) => Model.parentsOf(doc, id).some((p) => p.p && p.p.op);
  function refuse(doc, A, B) {
    if (related(doc, A.id, B.id)) return 'Ein Teil kann keine Verbindung mit der eigenen Gruppe bekommen – wähl zwei Teile nebeneinander.';
    if (inOp(doc, A.id) || inOp(doc, B.id)) return 'Teile in einem Muster oder einer Rechen-Gruppe (Teilen, Schnittmenge) können keine Verbindung bekommen.';
    return null;
  }

  // ---------- 3D-Geometrie-Helfer für Achsen und Ebenen ----------
  function rotBetween(from, to) {
    const a = from.clone().normalize(), b = to.clone().normalize();
    const dot = a.dot(b);
    if (dot > 1 - 1e-10) return new THREE.Quaternion();
    if (dot < -1 + 1e-10) {
      const ref = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const ax = new THREE.Vector3().crossVectors(a, ref).normalize();
      return new THREE.Quaternion().setFromAxisAngle(ax, Math.PI);
    }
    return new THREE.Quaternion().setFromUnitVectors(a, b);
  }
  function planeBasis(nVec, hintU = null) {
    const n = nVec.clone().normalize();
    let u = hintU ? hintU.clone().addScaledVector(n, -hintU.dot(n)) : null;
    if (!u || u.lengthSq() < 1e-10) {
      const ref = Math.abs(n.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      u = new THREE.Vector3().crossVectors(ref, n);
    }
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    return { n, u, v };
  }
  function planeFrame(j) {
    const o = new THREE.Vector3(...(j.ao || [0, 0, 0]));
    const n = new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize();
    const hint = Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null;
    const { u, v } = planeBasis(n, hint);
    return { o, n, u, v };
  }
  function frameOf(j) {
    if (isPlanar(j)) return planeFrame(j);
    return { o: new THREE.Vector3(...(j.ao || [0, 0, 0])), d: new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize() };
  }
  function cylPointOnAxis(fi) {
    const l = new THREE.Vector3(fi.axis[0], fi.axis[1], fi.axis[2]);
    const d = new THREE.Vector3(fi.axis[3], fi.axis[4], fi.axis[5]).normalize();
    if (Array.isArray(fi.c)) {
      const c = new THREE.Vector3(...fi.c);
      l.addScaledVector(d, c.sub(l).dot(d));
    }
    return { l, d };
  }
  function cylAxisOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    if (Array.isArray(ref.o) && Array.isArray(ref.d)) {
      const dv = new THREE.Vector3(...ref.d);
      if (dv.lengthSq() < 1e-12) return null;
      return { id: ref.id, o: new THREE.Vector3(...ref.o), d: dv.normalize(), what: ref.what || 'Zylinderachse' };
    }
    const r = App.results.get(ref.id);
    const faces = (r && r.data && r.data.faces) || [];
    let fi = ref.faceIdx != null && ref.faceIdx >= 0 ? faces[ref.faceIdx] : null;
    if (!fi || fi.t !== 'CYLINDRE' || !fi.axis) fi = faces.find((f) => f && f.t === 'CYLINDRE' && Array.isArray(f.axis));
    if (!fi || !Array.isArray(fi.axis)) return null;
    const { l, d } = cylPointOnAxis(fi);
    const M = Model.worldMatrix(doc, ref.id);
    return { id: ref.id, o: l.applyMatrix4(M), d: d.transformDirection(M).normalize(), what: 'Zylinderfläche' };
  }
  function planarFaceOf(ref, doc = App.doc) {
    if (!ref) return null;
    if (typeof ref === 'string') ref = { id: ref };
    if (!ref.id) return null;
    if (Array.isArray(ref.p) && Array.isArray(ref.n)) {
      const nv = new THREE.Vector3(...ref.n);
      if (nv.lengthSq() < 1e-12) return null;
      return { id: ref.id, p: new THREE.Vector3(...ref.p), n: nv.normalize(), what: ref.what || 'ebene Fläche' };
    }
    const r = App.results.get(ref.id);
    const faces = (r && r.data && r.data.faces) || [];
    let fi = ref.faceIdx != null && ref.faceIdx >= 0 ? faces[ref.faceIdx] : null;
    if (!fi || fi.t !== 'PLANE' || !fi.n) fi = faces.find((f) => f && f.t === 'PLANE' && Array.isArray(f.n) && Array.isArray(f.c));
    if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.n) || !Array.isArray(fi.c)) return null;
    const M = Model.worldMatrix(doc, ref.id);
    return {
      id: ref.id,
      p: new THREE.Vector3(...fi.c).applyMatrix4(M),
      n: new THREE.Vector3(...fi.n).transformDirection(M).normalize(),
      what: 'ebene Fläche',
    };
  }
  function cylHitOf(hit) {
    const n = hit && hit.node;
    if (!n) return null;
    const M = n.obj.matrixWorld;
    if (hit.faceIdx != null && hit.faceIdx >= 0) {
      const fi = n.data && n.data.faces && n.data.faces[hit.faceIdx];
      if (fi && fi.t === 'CYLINDRE' && Array.isArray(fi.axis)) {
        const { l, d } = cylPointOnAxis(fi);
        return { id: hit.id, faceIdx: hit.faceIdx, o: l.applyMatrix4(M), d: d.transformDirection(M).normalize(), what: 'Zylinderfläche' };
      }
    }
    if (hit.edgeIdx != null) {
      const g = n.data && n.data.edges && n.data.edges[hit.edgeIdx];
      const pos = Viewer.edgePositions(n, hit.edgeIdx);
      if (g && g.t === 'CIRCLE' && pos && pos.length >= 9) {
        const P = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(M);
        const k = pos.length / 3;
        const a = P(0), b = P(Math.floor(k / 3)), c = P(Math.floor((2 * k) / 3));
        const ab = b.clone().sub(a), ac = c.clone().sub(a), nn = new THREE.Vector3().crossVectors(ab, ac), l2 = nn.lengthSq();
        if (l2 > 1e-12) {
          const cc = new THREE.Vector3().crossVectors(nn, ab).multiplyScalar(ac.lengthSq()).add(new THREE.Vector3().crossVectors(ac, nn).multiplyScalar(ab.lengthSq())).divideScalar(2 * l2).add(a);
          return { id: hit.id, edgeIdx: hit.edgeIdx, o: cc, d: nn.normalize(), what: 'runder Rand' };
        }
      }
    }
    return null;
  }
  function planarHitOf(hit) {
    const n = hit && hit.node;
    if (!n || hit.faceIdx == null || hit.faceIdx < 0) return null;
    const fi = n.data && n.data.faces && n.data.faces[hit.faceIdx];
    if (!fi || fi.t !== 'PLANE' || !Array.isArray(fi.n) || !Array.isArray(fi.c)) return null;
    const M = n.obj.matrixWorld;
    return {
      id: hit.id,
      faceIdx: hit.faceIdx,
      p: new THREE.Vector3(...fi.c).applyMatrix4(M),
      n: new THREE.Vector3(...fi.n).transformDirection(M).normalize(),
      what: 'ebene Fläche',
    };
  }

  // ---------- Kinematik: Zustand, Matrix, Kette ----------
  const unit = (j) => (slide(j) ? 'mm' : '°');
  function stateOf(j) {
    return {
      ang: Number(j && j.ang) || 0,
      pos: Number(j && j.pos) || 0,
      u: Number(j && j.u) || 0,
      v: Number(j && j.v) || 0,
    };
  }
  function rotAbout(o, d, deg) {
    const R = new THREE.Matrix4().makeRotationAxis(d, (deg * Math.PI) / 180);
    return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  function stateMatrix(j, st) {
    const k = kindOf(j);
    const s = { ...stateOf(j), ...(typeof st === 'number' ? { ang: st } : st || {}) };
    if (k === 'slide') {
      const d = new THREE.Vector3(...j.ad).normalize();
      return new THREE.Matrix4().makeTranslation(d.x * s.ang, d.y * s.ang, d.z * s.ang);
    }
    if (k === 'cyl') {
      const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
      return new THREE.Matrix4().makeTranslation(d.x * s.pos, d.y * s.pos, d.z * s.pos).multiply(rotAbout(o, d, s.ang));
    }
    if (k === 'planar') {
      const { o, n, u, v } = planeFrame(j);
      return new THREE.Matrix4().makeTranslation(
        u.x * s.u + v.x * s.v,
        u.y * s.u + v.y * s.v,
        u.z * s.u + v.z * s.v
      ).multiply(rotAbout(o, n, s.ang));
    }
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    return rotAbout(o, d, s.ang);
  }
  function deltaMatrix(j, fromSt, toSt) {
    return stateMatrix(j, toSt).multiply(stateMatrix(j, fromSt).invert());
  }
  function stepMatrix(j, ang) {
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    if (slide(j)) return new THREE.Matrix4().makeTranslation(d.x * ang, d.y * ang, d.z * ang);
    return rotAbout(o, d, ang);
  }
  function pose(j, angOrSt, home, doc = App.doc) {
    const st = typeof angOrSt === 'number' ? { ...stateOf(j), ang: angOrSt } : { ...stateOf(j), ...(angOrSt || {}) };
    return conj(doc, j.b, stateMatrix(j, st)).multiply(new THREE.Matrix4().fromArray(home || j.home));
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
    const cur = Model.localMatrix(b), exp = pose(j, stateOf(j), null, doc);
    if (cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)) {
      const inv = conj(doc, j.b, stateMatrix(j, stateOf(j))).invert();
      j.home = r9(inv.multiply(cur).toArray());
    }
  }
  // Hintere Glieder der Kette samt ihren Gelenkachsen um die Bewegung D mitnehmen
  function moveChain(doc, rootId, D) {
    const ks = downstream(doc, rootId), moved = new Set([rootId, ...ks.map((k) => k.b)]);
    for (const k of ks) {
      const kb = top(k.b, doc);
      // Steckt das Teil in einer Gruppe, die selbst mitwandert, fährt es schon mit – nur die Achse nachführen
      const carried = Model.parentsOf(doc, k.b).some((p) => moved.has(p.id));
      if (kb && !carried) syncHome(kb, k, doc);
      k.ao = r6(new THREE.Vector3(...k.ao).applyMatrix4(D).toArray());
      k.ad = r9(new THREE.Vector3(...k.ad).transformDirection(D).normalize().toArray());
      if (Array.isArray(k.au)) k.au = r9(new THREE.Vector3(...k.au).transformDirection(D).normalize().toArray());
      if (carried) continue;
      k.home = r9(conj(doc, k.b, D).multiply(new THREE.Matrix4().fromArray(k.home)).toArray());
      if (kb) Model.setFromMatrix(kb, pose(k, stateOf(k), null, doc));
    }
  }

  // ---------- Verbindungen & Gelenke anlegen ----------
  // Gelenk ohne Klicken anlegen (für den KI-Kollegen): Achse o/d in Weltkoordinaten; liefert die Kennung oder eine Meldung
  function add(aId, bId, o, d, opts = {}) {
    const A = top(aId), B = top(bId);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Eine Verbindung braucht zwei verschiedene Teile.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: `„${Model.label(A)}“ und „${Model.label(B)}“ sind schon über Verbindungen gekoppelt – eine weitere ergäbe einen Kreis.` };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einem Gelenk oder einer Verbindung bewegt.` };
    const dv = new THREE.Vector3(...d); if (dv.lengthSq() < 1e-12) return { ok: false, msg: 'Die Achse braucht eine Richtung.' };
    dv.normalize();
    const k = opts.kind === 'slide' || opts.kind === 'cyl' || opts.kind === 'planar' ? opts.kind : 'rot';
    const lo = Number.isFinite(+opts.min) ? +opts.min : k === 'slide' ? -20 : k === 'rot' ? -90 : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : k === 'slide' ? 20 : k === 'rot' ? 90 : 180;
    let jid = null;
    App.change('Gelenk angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      doc.joints = doc.joints || [];
      jid = uid('j');
      const entry = {
        id: jid, a: A.id, b: B.id,
        ao: r6(o.map((v) => +v)),
        ad: r9(dv.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0,
        min: round(Math.min(lo, hi), 2),
        max: round(Math.max(lo, hi), 2),
      };
      if (k !== 'rot') entry.kind = k;
      if (k === 'cyl') {
        const plo = Number.isFinite(+opts.minPos) ? +opts.minPos : -20;
        const phi = Number.isFinite(+opts.maxPos) ? +opts.maxPos : 20;
        Object.assign(entry, { pos: 0, minPos: round(Math.min(plo, phi), 2), maxPos: round(Math.max(plo, phi), 2), flip: !!opts.flip });
      } else if (k === 'planar') {
        const basis = planeBasis(dv);
        Object.assign(entry, {
          au: r9(basis.u.toArray()),
          u: 0, minU: -20, maxU: 20,
          v: 0, minV: -20, maxV: 20,
          flip: !!opts.flip,
        });
      }
      doc.joints.push(entry);
    });
    if (jid) {
      const patch = {};
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (opts.u != null && Number.isFinite(+opts.u)) patch.u = +opts.u;
      if (opts.v != null && Number.isFinite(+opts.v)) patch.v = +opts.v;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die Verbindung ließ sich nicht anlegen.' };
  }

  function addCylindrical(aRef, bRef, opts = {}) {
    const axA = cylAxisOf(aRef), axB = cylAxisOf(bRef);
    if (!axA || !axB) return { ok: false, msg: 'Für „Zylindrisch“ werden zwei runde Flächen oder Kreiskanten benötigt.' };
    const A = top(axA.id), B = top(axB.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

    const baseD = axA.d.dot(axB.d) >= 0 ? axA.d.clone() : axA.d.clone().negate();
    const dTarget = opts.flip ? baseD.clone().negate() : baseD;
    const Q = rotBetween(axB.d, dTarget);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
    const M_align = new THREE.Matrix4()
      .makeTranslation(axA.o.x, axA.o.y, axA.o.z)
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-axB.o.x, -axB.o.y, -axB.o.z));

    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    const plo = Number.isFinite(+opts.minPos) ? +opts.minPos : -20;
    const phi = Number.isFinite(+opts.maxPos) ? +opts.maxPos : 20;
    let jid = null;
    App.change('Zylindrische Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      if (connected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id)) return false;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'cyl',
        ao: r6(axA.o.toArray()),
        ad: r9(axA.d.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        pos: 0, minPos: round(Math.min(plo, phi), 2), maxPos: round(Math.max(plo, phi), 2),
        flip: !!opts.flip,
      });
    });
    if (jid) {
      const patch = {};
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (opts.pos != null && Number.isFinite(+opts.pos)) patch.pos = +opts.pos;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die zylindrische Verbindung ließ sich nicht anlegen.' };
  }

  function addPlanar(aRef, bRef, opts = {}) {
    const plA = planarFaceOf(aRef), plB = planarFaceOf(bRef);
    if (!plA || !plB) return { ok: false, msg: 'Für „Eben“ werden zwei ebene Flächen benötigt.' };
    const A = top(plA.id), B = top(plB.id);
    if (!A || !B || A.id === B.id) return { ok: false, msg: 'Wähle zwei verschiedene Teile.' };
    const why = refuse(App.doc, A, B); if (why) return { ok: false, msg: why };
    if (connected(App.doc, A.id, B.id)) return { ok: false, msg: 'Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.' };
    if (list().some((j) => j.b === B.id)) return { ok: false, msg: `„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur eine bewegende Verbindung haben.` };

    // Standard: Flächen zeigen aufeinander zu (Normalen entgegengesetzt), damit die Teile bündig aufeinander liegen
    const nTarget = opts.flip ? plA.n.clone() : plA.n.clone().negate();
    const pBOnA = plB.p.clone().addScaledVector(plA.n, -plB.p.clone().sub(plA.p).dot(plA.n));
    const Q = rotBetween(plB.n, nTarget);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(Q);
    const M_align = new THREE.Matrix4()
      .makeTranslation(pBOnA.x, pBOnA.y, pBOnA.z)
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-plB.p.x, -plB.p.y, -plB.p.z));
    const basis = planeBasis(plA.n);

    const lo = Number.isFinite(+opts.min) ? +opts.min : -180;
    const hi = Number.isFinite(+opts.max) ? +opts.max : 180;
    const ulo = Number.isFinite(+opts.minU) ? +opts.minU : -20;
    const uhi = Number.isFinite(+opts.maxU) ? +opts.maxU : 20;
    const vlo = Number.isFinite(+opts.minV) ? +opts.minV : -20;
    const vhi = Number.isFinite(+opts.maxV) ? +opts.maxV : 20;
    let jid = null;
    App.change('Ebene Verbindung angelegt', (doc) => {
      const b = top(B.id, doc); if (!b) return false;
      if (connected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id)) return false;
      const newLocal = conj(doc, B.id, M_align).multiply(Model.localMatrix(b));
      Model.setFromMatrix(b, newLocal);
      moveChain(doc, B.id, M_align);
      doc.joints = doc.joints || [];
      jid = uid('j');
      doc.joints.push({
        id: jid, a: A.id, b: B.id, kind: 'planar',
        ao: r6(pBOnA.toArray()),
        ad: r9(plA.n.toArray()),
        au: r9(basis.u.toArray()),
        home: r9(Model.localMatrix(b).toArray()),
        u: 0, minU: round(Math.min(ulo, uhi), 2), maxU: round(Math.max(ulo, uhi), 2),
        v: 0, minV: round(Math.min(vlo, vhi), 2), maxV: round(Math.max(vlo, vhi), 2),
        ang: 0, min: round(Math.min(lo, hi), 2), max: round(Math.max(lo, hi), 2),
        flip: !!opts.flip,
      });
    });
    if (jid) {
      const patch = {};
      if (opts.u != null && Number.isFinite(+opts.u)) patch.u = +opts.u;
      if (opts.v != null && Number.isFinite(+opts.v)) patch.v = +opts.v;
      if (opts.ang != null && Number.isFinite(+opts.ang)) patch.ang = +opts.ang;
      if (Object.keys(patch).length) setState(jid, patch);
    }
    return jid ? { ok: true, id: jid } : { ok: false, msg: 'Die ebene Verbindung ließ sich nicht anlegen.' };
  }

  // ---------- Interaktives Wählen im Bild ----------
  let pickState = null;
  function stopPick() {
    if (!pickState) return;
    const cv = Viewer.canvas;
    cv.removeEventListener('pointerdown', pickState.down, true);
    if (pickState.move) cv.removeEventListener('pointermove', pickState.move);
    window.removeEventListener('keydown', pickState.key, true);
    Viewer.highlightFace('hover', null, null);
    Viewer.highlightEdge(null, null);
    cv.style.cursor = '';
    UI.hint(null);
    pickState = null;
  }

  // Gelenk anlegen: zwei Teile gewählt, das zuletzt gewählte bewegt sich; dann die Achse im Bild wählen
  function start(kind = 'rot') {
    stopPick();
    const sel = App.sel.map((id) => top(id)).filter(Boolean);
    if (sel.length !== 2) { UI.toast('Wähle genau zwei Teile (mit Umschalt klicken – Teile in einer Gruppe links im Verlauf).', { icon: 'info' }); return false; }
    const [A, B] = sel;
    const why = refuse(App.doc, A, B); if (why) { UI.toast(why, { icon: 'info' }); return false; }
    if (connected(App.doc, A.id, B.id)) { UI.toast('Das ergäbe einen Kreis – die beiden Teile sind schon über Verbindungen miteinander gekoppelt.', { icon: 'info' }); return false; }
    if (list().some((j) => j.b === B.id)) { UI.toast(`„${Model.label(B)}“ wird schon von einer Verbindung bewegt – jedes Teil darf nur von einem Gelenk bewegt werden.`, { icon: 'info' }); return false; }
    const isSlide = kind === 'slide';
    Features.pickAxisThen((ax) => {
      let jid = null;
      App.change('Gelenk angelegt', (doc) => {
        const b = top(B.id, doc); if (!b) return false;
        if (connected(doc, A.id, B.id) || list(doc).some((j) => j.b === B.id)) return false;
        doc.joints = doc.joints || [];
        jid = uid('j');
        const entry = {
          id: jid, a: A.id, b: B.id,
          ao: r6(ax.o.toArray()), ad: r9(ax.d.toArray()),
          home: r9(Model.localMatrix(b).toArray()),
          ang: 0, min: isSlide ? -20 : -90, max: isSlide ? 20 : 90,
        };
        if (isSlide) entry.kind = 'slide';
        doc.joints.push(entry);
      });
      App.select([B.id]);
      UI.toast(`${isSlide ? 'Schiebegelenk' : 'Gelenk'} angelegt: „${Model.label(B)}“ ${isSlide ? 'gleitet entlang' : 'dreht sich um'} ${ax.what}, „${Model.label(A)}“ bleibt stehen.`, { icon: 'check', ms: 3600 });
    }, '<b>Gelenkachse wählen:</b> Klick auf eine gerade Kante, einen runden Rand oder eine runde Fläche (Stift, Loch). <b>Esc</b> bricht ab.');
    return true;
  }

  function startCylindrical(firstRef = null) {
    stopPick();
    let step1 = firstRef ? cylAxisOf(firstRef) : null;
    const setHint = () => {
      UI.hint(step1
        ? `<b>Zylindrisch (2/2):</b> Klick auf die runde Fläche oder den Kreisrand am <b>beweglichen Teil</b> (Welle/Bolzen). <b>Esc</b> bricht ab.`
        : `<b>Zylindrisch (1/2):</b> Klick auf die runde Fläche oder den Kreisrand am <b>festen Teil</b> (z. B. Bohrung). <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9 });
      const ax = cylHitOf(hit);
      if (!ax) { UI.toast('Klick auf eine runde Zylinderfläche oder einen Kreisrand.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(ax.id)) return;
        step1 = ax;
        Viewer.highlightFace('hover', hit.faceIdx >= 0 ? hit.id : null, hit.faceIdx >= 0 ? hit.faceIdx : null);
        setHint();
        return;
      }
      if (ax.id === step1.id) { UI.toast('Wähle jetzt eine runde Fläche am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addCylindrical(step1, ax);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([ax.id]);
      const A = top(step1.id), B = top(ax.id);
      UI.toast(`Zylindrische Verbindung angelegt: „${Model.label(B)}“ dreht und gleitet in „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { edgePx: 9 });
      const ok = !!cylHitOf(hit) && (!step1 || hit.id !== step1.id);
      if (ok && hit.edgeIdx != null) { Viewer.highlightEdge(hit.id, hit.edgeIdx); Viewer.highlightFace('hover', null, null); }
      else if (ok && hit.faceIdx >= 0) { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', hit.id, hit.faceIdx); }
      else { Viewer.highlightEdge(null, null); Viewer.highlightFace('hover', null, null); }
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    setHint();
    return true;
  }

  function startPlanar(firstRef = null) {
    stopPick();
    let step1 = firstRef ? planarFaceOf(firstRef) : null;
    const setHint = () => {
      UI.hint(step1
        ? `<b>Eben (2/2):</b> Klick auf die ebene Fläche am <b>beweglichen Teil</b>. <b>Esc</b> bricht ab.`
        : `<b>Eben (1/2):</b> Klick auf die ebene Fläche am <b>festen Teil</b>. <b>Esc</b> bricht ab.`);
    };
    const down = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const pl = planarHitOf(hit);
      if (!pl) { UI.toast('Klick auf eine ebene Fläche eines Körpers.', { icon: 'info' }); return; }
      if (!step1) {
        if (!top(pl.id)) return;
        step1 = pl;
        Viewer.highlightFace('hover', hit.id, hit.faceIdx);
        setHint();
        return;
      }
      if (pl.id === step1.id) { UI.toast('Wähle jetzt eine ebene Fläche am zweiten (beweglichen) Teil.', { icon: 'info' }); return; }
      const r = addPlanar(step1, pl);
      if (!r.ok) { UI.toast(r.msg, { icon: 'info', ms: 4000 }); return; }
      stopPick();
      App.select([pl.id]);
      const A = top(step1.id), B = top(pl.id);
      UI.toast(`Ebene Verbindung angelegt: „${Model.label(B)}“ gleitet und dreht auf „${Model.label(A)}“.`, { icon: 'check', ms: 3600 });
    };
    const move = (e) => {
      const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
      const ok = !!planarHitOf(hit) && (!step1 || hit.id !== step1.id);
      Viewer.highlightFace('hover', ok ? hit.id : null, ok ? hit.faceIdx : null);
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopPick(); Panels.renderRight(); } };
    pickState = { down, move, key };
    Viewer.canvas.style.cursor = 'crosshair';
    Viewer.canvas.addEventListener('pointerdown', down, true);
    Viewer.canvas.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    setHint();
    return true;
  }

  // ---------- Freiheitsgrade setzen, Umkehren, Lage einhalten ----------
  function clampState(j, st) {
    const k = kindOf(j);
    const next = { ...stateOf(j), ...st };
    next.ang = round(clamp(Number(next.ang) || 0, j.min ?? -180, j.max ?? 180), 4);
    if (k === 'cyl') {
      next.pos = round(clamp(Number(next.pos) || 0, j.minPos ?? -20, j.maxPos ?? 20), 4);
    } else if (k === 'planar') {
      next.u = round(clamp(Number(next.u) || 0, j.minU ?? -20, j.maxU ?? 20), 4);
      next.v = round(clamp(Number(next.v) || 0, j.minV ?? -20, j.maxV ?? 20), 4);
    }
    return next;
  }
  function writeState(j, st) {
    const k = kindOf(j);
    j.ang = st.ang;
    if (k === 'cyl') j.pos = st.pos;
    else if (k === 'planar') { j.u = st.u; j.v = st.v; }
  }
  function stateChanged(a, b, k) {
    if (Math.abs(a.ang - b.ang) > 1e-9) return true;
    if (k === 'cyl' && Math.abs(a.pos - b.pos) > 1e-9) return true;
    if (k === 'planar' && (Math.abs(a.u - b.u) > 1e-9 || Math.abs(a.v - b.v) > 1e-9)) return true;
    return false;
  }

  function setState(jid, patch) {
    const label = patch && Object.keys(patch).length === 1 && 'ang' in patch ? 'Gelenk bewegt' : 'Verbindung bewegt';
    App.change(label, (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = top(j.b, doc); if (!b) return false;
      syncHome(b, j, doc);
      const prev = stateOf(j);
      const next = clampState(j, patch);
      writeState(j, next);
      Model.setFromMatrix(b, pose(j, next, null, doc));
      if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next));
    }, { merge: 'joint:' + jid });
  }
  // Winkel/Weg setzen (Abwärtskompatibilität)
  function setAngle(jid, ang) { setState(jid, { ang }); }

  // Art wechseln (Drehen / Schieben / Zylindrisch / Eben): das Teil geht zurück in die Ausgangslage
  function setKind(jid, kind) {
    const k = kind === 'slide' || kind === 'cyl' || kind === 'planar' ? kind : 'rot';
    App.change('Verbindungs-Art', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = top(j.b, doc); if (!b) return false;
      syncHome(b, j, doc);
      const prev = stateOf(j);
      const zero = { ang: 0, pos: 0, u: 0, v: 0 };
      if (stateChanged(prev, zero, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, zero));
      if (k === 'rot') delete j.kind; else j.kind = k;
      j.ang = 0;
      if (k === 'slide') {
        j.min = -20; j.max = 20;
      } else if (k === 'cyl') {
        j.min = -180; j.max = 180;
        j.pos = 0;
        if (!Number.isFinite(j.minPos)) j.minPos = -20;
        if (!Number.isFinite(j.maxPos)) j.maxPos = 20;
      } else if (k === 'planar') {
        j.min = -180; j.max = 180;
        const n = new THREE.Vector3(...(j.ad || [0, 0, 1])).normalize();
        const basis = planeBasis(n, Array.isArray(j.au) ? new THREE.Vector3(...j.au) : null);
        j.au = r9(basis.u.toArray());
        j.u = 0; j.v = 0;
        if (!Number.isFinite(j.minU)) j.minU = -20;
        if (!Number.isFinite(j.maxU)) j.maxU = 20;
        if (!Number.isFinite(j.minV)) j.minV = -20;
        if (!Number.isFinite(j.maxV)) j.maxV = 20;
      } else {
        j.min = -90; j.max = 90;
      }
      Model.setFromMatrix(b, pose(j, zero, null, doc));
    });
  }

  function setRange(jid, k, v) {
    const pair = { min: ['min', 'max', 360], max: ['min', 'max', 360], minPos: ['minPos', 'maxPos', 10000], maxPos: ['minPos', 'maxPos', 10000], minU: ['minU', 'maxU', 10000], maxU: ['minU', 'maxU', 10000], minV: ['minV', 'maxV', 10000], maxV: ['minV', 'maxV', 10000] }[k];
    if (!pair) return;
    App.change('Verbindungs-Bereich', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const lim = pair[2];
      j[k] = round(clamp(Number(v) || 0, -lim, lim), 2);
      if (j[pair[0]] > j[pair[1]]) [j[pair[0]], j[pair[1]]] = [j[pair[1]], j[pair[0]]];
    });
  }

  function flip(jid) {
    App.change('Verbindung umkehren', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = top(j.b, doc); if (!b) return false;
      const k = kindOf(j);
      if (k !== 'cyl' && k !== 'planar') return false;
      syncHome(b, j, doc);
      const st = stateOf(j);
      let pivot, ax;
      if (k === 'cyl') {
        const d = new THREE.Vector3(...j.ad).normalize();
        const o = new THREE.Vector3(...j.ao);
        pivot = o.clone().addScaledVector(d, st.pos);
        const ref = Math.abs(d.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        ax = new THREE.Vector3().crossVectors(d, ref).normalize();
      } else {
        const pf = planeFrame(j);
        pivot = pf.o.clone().addScaledVector(pf.u, st.u).addScaledVector(pf.v, st.v);
        ax = pf.u.clone();
      }
      const F = rotAbout(pivot, ax, 180);
      j.flip = !j.flip;
      j.home = r9(conj(doc, j.b, F).multiply(new THREE.Matrix4().fromArray(j.home)).toArray());
      Model.setFromMatrix(b, pose(j, st, null, doc));
      moveChain(doc, j.b, F);
    });
  }

  // Twist-Winkel um eine normierte Weltachse aus einer Transformationsmatrix extrahieren
  function twistDegAround(D, axis) {
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    D.decompose(pos, q, sc);
    const dot = q.x * axis.x + q.y * axis.y + q.z * axis.z;
    let w = q.w, p = dot;
    if (w < 0) { w = -w; p = -p; }
    let deg = (2 * Math.atan2(p, w) * 180) / Math.PI;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    return deg;
  }

  // Verschieben/Drehen eines verbundenen Teils auf die erlaubten Freiheitsgrade von 'cyl'/'planar' projizieren
  function constrain(doc, itemId) {
    const j = drivingOf(itemId, doc);
    if (!j || (j.kind !== 'cyl' && j.kind !== 'planar')) return false;
    const b = top(j.b, doc);
    if (!b) return false;
    const prev = stateOf(j);
    const W_cur = Model.worldMatrix(doc, j.b);
    const W_home = Model.parentWorld(doc, j.b).multiply(new THREE.Matrix4().fromArray(j.home));
    const D_want = W_cur.clone().multiply(W_home.clone().invert());
    const o = new THREE.Vector3(...j.ao);
    const oCur = o.clone().applyMatrix4(D_want);
    const dp = oCur.sub(o);

    if (j.kind === 'cyl') {
      const d = new THREE.Vector3(...j.ad).normalize();
      let posNew = round(dp.dot(d), 4);
      let angNew = round(twistDegAround(D_want, d), 4);
      if (j.stopsLocked) {
        posNew = clamp(posNew, j.minPos ?? -20, j.maxPos ?? 20);
        angNew = clamp(angNew, j.min ?? -180, j.max ?? 180);
      } else {
        if (posNew < (j.minPos ?? -20)) j.minPos = round(Math.floor(posNew), 2);
        if (posNew > (j.maxPos ?? 20)) j.maxPos = round(Math.ceil(posNew), 2);
        if (angNew < (j.min ?? -180)) j.min = round(Math.floor(angNew), 2);
        if (angNew > (j.max ?? 180)) j.max = round(Math.ceil(angNew), 2);
      }
      j.pos = posNew;
      j.ang = angNew;
    } else {
      const pf = planeFrame(j);
      let uNew = round(dp.dot(pf.u), 4);
      let vNew = round(dp.dot(pf.v), 4);
      let angNew = round(twistDegAround(D_want, pf.n), 4);
      if (j.stopsLocked) {
        uNew = clamp(uNew, j.minU ?? -20, j.maxU ?? 20);
        vNew = clamp(vNew, j.minV ?? -20, j.maxV ?? 20);
        angNew = clamp(angNew, j.min ?? -180, j.max ?? 180);
      } else {
        if (uNew < (j.minU ?? -20)) j.minU = round(Math.floor(uNew), 2);
        if (uNew > (j.maxU ?? 20)) j.maxU = round(Math.ceil(uNew), 2);
        if (vNew < (j.minV ?? -20)) j.minV = round(Math.floor(vNew), 2);
        if (vNew > (j.maxV ?? 20)) j.maxV = round(Math.ceil(vNew), 2);
        if (angNew < (j.min ?? -180)) j.min = round(Math.floor(angNew), 2);
        if (angNew > (j.max ?? 180)) j.max = round(Math.ceil(angNew), 2);
      }
      j.u = uNew;
      j.v = vNew;
      j.ang = angNew;
    }
    const next = stateOf(j);
    Model.setFromMatrix(b, pose(j, next, null, doc));
    if (stateChanged(prev, next, kindOf(j))) moveChain(doc, j.b, deltaMatrix(j, prev, next));
    return true;
  }

  // Live-Ziehen in der 3D-Ansicht (ohne eigenes App.change – Interact.onUp speichert den Rückgängig-Schritt)
  function applyDrag(jid, patch) {
    const j = list(App.doc).find((x) => x.id === jid); if (!j) return null;
    const b = top(j.b, App.doc); if (!b) return null;
    const prev = stateOf(j);
    const k = kindOf(j);
    if (k === 'cyl' && patch.pos != null) {
      let p = round(Number(patch.pos) || 0, 4);
      if (j.stopsLocked) p = clamp(p, j.minPos ?? -20, j.maxPos ?? 20);
      else {
        if (p < (j.minPos ?? -20)) j.minPos = round(Math.floor(p), 2);
        if (p > (j.maxPos ?? 20)) j.maxPos = round(Math.ceil(p), 2);
      }
      j.pos = p;
    }
    if (k === 'planar') {
      if (patch.u != null) {
        let u = round(Number(patch.u) || 0, 4);
        if (j.stopsLocked) u = clamp(u, j.minU ?? -20, j.maxU ?? 20);
        else {
          if (u < (j.minU ?? -20)) j.minU = round(Math.floor(u), 2);
          if (u > (j.maxU ?? 20)) j.maxU = round(Math.ceil(u), 2);
        }
        j.u = u;
      }
      if (patch.v != null) {
        let v = round(Number(patch.v) || 0, 4);
        if (j.stopsLocked) v = clamp(v, j.minV ?? -20, j.maxV ?? 20);
        else {
          if (v < (j.minV ?? -20)) j.minV = round(Math.floor(v), 2);
          if (v > (j.maxV ?? 20)) j.maxV = round(Math.ceil(v), 2);
        }
        j.v = v;
      }
    }
    if (patch.ang != null) {
      j.ang = round(clamp(Number(patch.ang) || 0, j.min ?? -180, j.max ?? 180), 4);
    }
    const next = stateOf(j);
    Model.setFromMatrix(b, pose(j, next, null, App.doc));
    if (stateChanged(prev, next, k)) moveChain(App.doc, j.b, deltaMatrix(j, prev, next));
    Viewer.updateNode(b.id, { matrix: Model.localMatrix(b) });
    for (const d of downstream(App.doc, j.b)) {
      const db = top(d.b, App.doc);
      if (db) Viewer.updateNode(db.id, { matrix: Model.localMatrix(db) });
    }
    return next;
  }

  function projectAxisRay(o, d, ray) {
    const dir = d.clone().normalize();
    const w0 = o.clone().sub(ray.origin);
    const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction);
    const dd = dir.dot(w0), e = ray.direction.dot(w0);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return 0;
    return (b * e - c * dd) / den;
  }

  function remove(jid) {
    App.change('Verbindung gelöst', (doc) => { doc.joints = list(doc).filter((x) => x.id !== jid); });
    UI.toast('Verbindung gelöst – das Teil bleibt, wo es gerade ist.', { icon: 'check' });
  }

  // ---------- Bewegung prüfen (Durchdringung) ----------
  function sweepMeta(j) {
    const k = kindOf(j);
    if (k === 'slide') return { key: 'ang', lo: j.min, hi: j.max, len: true };
    if (k === 'cyl') {
      const plo = j.minPos ?? -20, phi = j.maxPos ?? 20;
      if (Math.abs(phi - plo) > 1e-6) return { key: 'pos', lo: plo, hi: phi, len: true };
      return { key: 'ang', lo: j.min ?? -180, hi: j.max ?? 180, len: false };
    }
    if (k === 'planar') {
      const ulo = j.minU ?? -20, uhi = j.maxU ?? 20;
      if (Math.abs(uhi - ulo) > 1e-6) return { key: 'u', lo: ulo, hi: uhi, len: true };
      const vlo = j.minV ?? -20, vhi = j.maxV ?? 20;
      if (Math.abs(vhi - vlo) > 1e-6) return { key: 'v', lo: vlo, hi: vhi, len: true };
      return { key: 'ang', lo: j.min ?? -180, hi: j.max ?? 180, len: false };
    }
    return { key: 'ang', lo: j.min, hi: j.max, len: false };
  }
  async function check(jid, step) {
    const j = list().find((x) => x.id === jid); if (!j) return null;
    const sw = sweepMeta(j);
    step = step || (sw.len ? Math.max(0.5, round((sw.hi - sw.lo) / 40, 1)) : 5);
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
    const curSt = stateOf(j);
    for (let a = sw.lo; a <= sw.hi + 1e-9; a += step) {
      const D = deltaMatrix(j, curSt, { ...curSt, [sw.key]: a });
      const movK = [kw(B, D.clone().multiply(Bw))];
      for (const d of downCur) movK.push(kw(d.it, D.clone().multiply(d.m)));
      let cl = null; try { cl = await Kernel.call('clashes', { scene: { items: [...statK, ...movK] } }); } catch (_) {}
      const v = cl ? cl.pairs.filter((p) => movSet.has(p.a) !== movSet.has(p.b)).reduce((s, p) => s + p.v, 0) : 0;
      out.push({ a: round(a, 4), v });
    }
    return out;
  }
  function describe(j, res) {
    const sw = sweepMeta(j);
    const cur = stateOf(j)[sw.key];
    const hit = res.filter((r) => r.v > 0.05);
    const u = sw.len ? Units.label() : '°';
    const fv = (x) => (sw.len ? Units.fmtLen(x, 1) : fmtAngle(x));
    if (!hit.length) return { ok: true, text: `Frei im ganzen Bereich von ${fv(sw.lo)} ${u} bis ${fv(sw.hi)} ${u} – nichts stößt an.` };
    const free = res.filter((r) => r.v <= 0.05).map((r) => r.a);
    const lo = res.filter((r) => r.a <= cur && r.v > 0.05).map((r) => r.a), hi = res.filter((r) => r.a >= cur && r.v > 0.05).map((r) => r.a);
    const from = lo.length ? Math.max(...lo) : null, to = hi.length ? Math.min(...hi) : null;
    const parts = [];
    if (to != null) parts.push(`stößt in Plus-Richtung bei ${fv(to)} ${u} an`);
    if (from != null) parts.push(`in Minus-Richtung bei ${fv(from)} ${u}`);
    const atNow = res.find((r) => Math.abs(r.a - cur) < 1e-6);
    return { ok: false, text: (atNow && atNow.v > 0.05 ? 'Schon in dieser Stellung stecken die Teile ineinander. ' : '') + `Das Teil ${parts.join(', ')}.` + (free.length ? ` Frei: ${fv(Math.min(...free))} … ${fv(Math.max(...free))} ${u} (nicht unbedingt am Stück).` : '') };
  }
  // Freier Bereich um die jetzige Stellung aus dem Ergebnis von „Bewegung prüfen“ – wird zum Anschlag (Von/Bis)
  function freeRange(j, res) {
    const s = (res || []).slice().sort((a, b) => a.a - b.a); if (!s.length) return null;
    const cur = stateOf(j)[sweepMeta(j).key];
    let i0 = 0, best = Infinity; s.forEach((r, i) => { const d = Math.abs(r.a - cur); if (d < best) { best = d; i0 = i; } });
    if (s[i0].v > 0.05) return null;
    let lo = i0, hi = i0; while (lo > 0 && s[lo - 1].v <= 0.05) lo--; while (hi < s.length - 1 && s[hi + 1].v <= 0.05) hi++;
    return [s[lo].a, s[hi].a];
  }
  function setStops(jid, lo, hi) {
    App.change('Gelenk-Anschlag', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const a = round(Math.min(lo, hi), 2), b = round(Math.max(lo, hi), 2);
      const sw = sweepMeta(j);
      if (sw.key === 'pos') { j.minPos = a; j.maxPos = b; j.stopsLocked = true; }
      else if (sw.key === 'u') { j.minU = a; j.maxU = b; j.stopsLocked = true; }
      else if (sw.key === 'v') { j.minV = a; j.maxV = b; j.stopsLocked = true; }
      else { j.min = a; j.max = b; }
    });
    UI.toast('Anschlag gesetzt – weiter lässt sich die Verbindung nicht bewegen.', { icon: 'check' });
  }

  // ---------- Bewegung abspielen: nur im Bild (das Projekt ändert sich nicht) ----------
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
  function buildPlayLegs(j) {
    const k = kindOf(j), s0 = stateOf(j);
    if (k === 'cyl') {
      const p0 = s0.pos, a0 = s0.ang;
      const pHi = j.maxPos ?? 20, pLo = j.minPos ?? -20;
      const aHi = j.max ?? 180, aLo = j.min ?? -180;
      const pts = [
        { ang: a0, pos: p0 },
        { ang: aHi, pos: pHi },
        { ang: aLo, pos: pLo },
        { ang: a0, pos: p0 },
      ];
      const legs = []; let T = 0;
      for (let i = 1; i < pts.length; i++) {
        const dp = Math.abs(pts[i].pos - pts[i - 1].pos) / Math.max(8, (pHi - pLo) / 0.9);
        const da = Math.abs(pts[i].ang - pts[i - 1].ang) / 240;
        const d = Math.max(400, Math.max(dp, da) * 1000);
        legs.push({ s0: pts[i - 1], s1: pts[i], t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    if (k === 'planar') {
      const uHi = j.maxU ?? 20, uLo = j.minU ?? -20;
      const vHi = j.maxV ?? 20, vLo = j.minV ?? -20;
      const aHi = j.max ?? 180, aLo = j.min ?? -180;
      const pts = [
        { u: s0.u, v: s0.v, ang: s0.ang },
        { u: uHi, v: vHi, ang: aHi },
        { u: uLo, v: vHi, ang: 0 },
        { u: uLo, v: vLo, ang: aLo },
        { u: s0.u, v: s0.v, ang: s0.ang },
      ];
      const legs = []; let T = 0;
      for (let i = 1; i < pts.length; i++) {
        const du = Math.abs(pts[i].u - pts[i - 1].u) / Math.max(10, (uHi - uLo) / 0.7);
        const dv = Math.abs(pts[i].v - pts[i - 1].v) / Math.max(10, (vHi - vLo) / 0.7);
        const da = Math.abs(pts[i].ang - pts[i - 1].ang) / 240;
        const d = Math.max(350, Math.max(du, dv, da) * 1000);
        legs.push({ s0: pts[i - 1], s1: pts[i], t0: T, t1: T + d });
        T += d;
      }
      return { legs, T };
    }
    const seq = [j.ang, j.max, j.min, j.ang], speed = slide(j) ? Math.max(5, (j.max - j.min) / 1.4) : 120;
    const legs = []; let T = 0;
    for (let i = 1; i < seq.length; i++) {
      const d = Math.abs(seq[i] - seq[i - 1]) / speed * 1000;
      legs.push({ s0: { ang: seq[i - 1] }, s1: { ang: seq[i] }, t0: T, t1: T + d });
      T += d;
    }
    return { legs, T };
  }
  function play(jid, btn) {
    if (anim) { const same = anim.jid === jid; stopPlay(); if (same) return; }
    const j = list().find((x) => x.id === jid); if (!j) return;
    const B = top(j.b); if (!B) return;
    if (!isTop(B.id) || downstream(App.doc, j.b).some((k) => !isTop(k.b))) { UI.toast('Abspielen geht nur, wenn die bewegten Teile ganz oben im Verlauf liegen – in einer Gruppe zeigt das Bild sie als einen Körper. Mit dem Regler kannst du trotzdem jede Stellung ansehen.', { icon: 'info', ms: 5000 }); return; }
    const cur = Model.localMatrix(B), st0 = stateOf(j), exp = pose(j, st0);
    const home = cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)
      ? conj(App.doc, j.b, stateMatrix(j, st0)).invert().multiply(cur).toArray()
      : j.home;
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter(Boolean).map((it) => ({ it, m: Model.localMatrix(it) }));
    const { legs, T } = buildPlayLegs(j);
    if (T < 1) return;
    const t0 = performance.now();
    const applyPose = (st) => {
      Viewer.updateNode(B.id, { matrix: pose(j, st, home) });
      const D = deltaMatrix(j, st0, st);
      for (const d of down) Viewer.updateNode(d.it.id, { matrix: D.clone().multiply(d.m) });
    };
    anim = { jid, ids: [B.id, ...down.map((d) => d.it.id)], btn, raf: 0, timer: 0, st: st0, get a() { return this.st.ang; }, applyPose };
    if (btn) btn.innerHTML = icon('close') + 'Stopp';
    const step = () => {
      if (!anim) return;
      cancelAnimationFrame(anim.raf);
      clearTimeout(anim.timer);
      const t = performance.now() - t0;
      if (t >= T) { stopPlay(); return; }
      const L = legs.find((l) => t < l.t1) || legs[legs.length - 1];
      const u = (t - L.t0) / Math.max(1, L.t1 - L.t0);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const st = { ...st0 };
      for (const key of Object.keys(L.s0)) st[key] = L.s0[key] + (L.s1[key] - L.s0[key]) * e;
      anim.st = st;
      applyPose(st);
      anim.raf = requestAnimationFrame(step);
      anim.timer = setTimeout(step, 50);
    };
    step();
  }

  // ---------- Abschnitt „Gelenk / Verbindung“ im rechten Panel ----------
  function makeDofControl(j, sfx, { label, aria, val, min, max, step, unitStr, isLen, sliderId, valId, minId, maxId, key, minKey, maxKey }) {
    const frag = document.createDocumentFragment();
    const range = h('input', {
      type: 'range', id: sliderId + sfx, min, max, step, value: val,
      'aria-label': aria || label, style: { width: '100%' },
    });
    range.oninput = () => setState(j.id, { [key]: +range.value });
    frag.append(range);
    const f = h('div', { class: 'fields three' });
    const nfOpts = (id, lbl, v, onCommit) => (isLen
      ? UI.numField({ id, label: lbl, value: v, unit: 'mm', len: true, expr: false, onCommit })
      : UI.numField({ id, label: lbl, value: v, unit: unitStr, expr: false, onCommit }));
    f.append(
      nfOpts(valId + sfx, label, val, (v) => setState(j.id, { [key]: v })),
      nfOpts(minId + sfx, 'Von', min, (v) => setRange(j.id, minKey, v)),
      nfOpts(maxId + sfx, 'Bis', max, (v) => setRange(j.id, maxKey, v))
    );
    frag.append(f);
    return frag;
  }

  function panel(it) {
    const js = allOf(it.id).filter((j) => top(j.a) && top(j.b));
    if (!js.length) return null;
    const anyMate = js.some((j) => isCyl(j) || isPlanar(j));
    const title = js.length > 1 ? (anyMate ? `Verbindungen (${js.length})` : `Gelenke (${js.length})`) : (anyMate ? 'Verbindung' : 'Gelenk');
    const sec = h('div', { class: 'section', id: 'joint-sec' }, h('div', { class: 'section-h' }, title));
    js.forEach((j, idx) => {
      if (idx > 0) sec.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '6px 0', width: '100%' } }));
      const sfx = idx ? '-' + idx : '';
      const k = kindOf(j);
      const A = top(j.a), B = top(j.b);
      const down = downstream(App.doc, j.b).map((d) => top(d.b)).filter(Boolean);
      const moveTxt = down.length ? ` (${down.map((x) => '„' + esc(Model.label(x)) + '“').join(', ')} ${down.length === 1 ? 'bewegt sich' : 'bewegen sich'} mit)` : '';
      const verb = k === 'slide' ? 'gleitet entlang' : k === 'cyl' ? 'dreht und gleitet in' : k === 'planar' ? 'gleitet und dreht auf' : 'dreht sich gegenüber';
      const box = h('div', { class: 'joint-item', dataset: { jid: j.id } });
      box.append(h('div', { class: 'hint-box', html: `<b>${esc(Model.label(B))}</b> ${verb} <b>${esc(Model.label(A))}</b>${moveTxt}.` }));
      box.append(UI.selectField({
        id: 'jt-kind' + sfx,
        label: 'Art',
        value: k,
        options: [
          ['rot', 'Drehen um die Achse'],
          ['slide', 'Schieben entlang der Achse'],
          ['cyl', 'Zylindrisch (Drehen + Schieben)'],
          ['planar', 'Eben (Fläche auf Fläche)'],
        ],
        onChange: (v) => setKind(j.id, v),
      }));

      if (k === 'cyl') {
        box.append(makeDofControl(j, sfx, {
          label: 'Winkel', aria: 'Gelenkwinkel', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Weg', aria: 'Verschiebung entlang der Achse', val: j.pos ?? 0, min: j.minPos ?? -20, max: j.maxPos ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-pos-range', valId: 'jt-pos', minId: 'jt-min-pos', maxId: 'jt-max-pos',
          key: 'pos', minKey: 'minPos', maxKey: 'maxPos',
        }));
      } else if (k === 'planar') {
        box.append(makeDofControl(j, sfx, {
          label: 'Quer (U)', aria: 'Verschiebung U', val: j.u ?? 0, min: j.minU ?? -20, max: j.maxU ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-u-range', valId: 'jt-u', minId: 'jt-min-u', maxId: 'jt-max-u',
          key: 'u', minKey: 'minU', maxKey: 'maxU',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Längs (V)', aria: 'Verschiebung V', val: j.v ?? 0, min: j.minV ?? -20, max: j.maxV ?? 20, step: 0.5,
          unitStr: 'mm', isLen: true, sliderId: 'jt-v-range', valId: 'jt-v', minId: 'jt-min-v', maxId: 'jt-max-v',
          key: 'v', minKey: 'minV', maxKey: 'maxV',
        }));
        box.append(makeDofControl(j, sfx, {
          label: 'Drehen', aria: 'Drehwinkel in der Ebene', val: j.ang, min: j.min, max: j.max, step: 1,
          unitStr: '°', isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      } else {
        box.append(makeDofControl(j, sfx, {
          label: slide(j) ? 'Weg' : 'Winkel', aria: slide(j) ? 'Weg' : 'Gelenkwinkel',
          val: j.ang, min: j.min, max: j.max, step: slide(j) ? 0.5 : 1,
          unitStr: unit(j), isLen: false, sliderId: 'jt-range', valId: 'jt-ang', minId: 'jt-min', maxId: 'jt-max',
          key: 'ang', minKey: 'min', maxKey: 'max',
        }));
      }

      const sw = sweepMeta(j);
      const res = h('div', { class: 'hint-box', id: 'jt-result' + sfx, hidden: true });
      const cb = h('button', { type: 'button', class: 'btn', id: 'jt-check' + sfx }); cb.innerHTML = icon('hinge') + 'Bewegung prüfen';
      cb.onclick = async () => {
        cb.disabled = true; res.hidden = false; res.className = 'hint-box'; res.textContent = sw.len ? 'Prüfe Schritt für Schritt …' : 'Prüfe in 5°-Schritten …';
        const r = await check(j.id); cb.disabled = false;
        if (!r) { res.textContent = 'Das ging nicht.'; return; }
        const d = describe(j, r); res.className = d.ok ? 'ok-box' : 'err-box'; res.textContent = d.text; res.dataset.hits = String(r.filter((x) => x.v > 0.05).length);
        const fr = d.ok ? null : freeRange(j, r);
        const old = box.querySelector('.jt-stop'); if (old) old.remove();
        if (fr && fr[1] - fr[0] > 1e-9 && (fr[0] > sw.lo + 1e-9 || fr[1] < sw.hi - 1e-9)) {
          const fVal = (x) => (sw.len ? Units.fmtLen(x, 1) : fmtAngle(x));
          const uLbl = sw.len ? Units.label() : '°';
          const sb = h('button', { type: 'button', class: 'btn small jt-stop', id: 'jt-stop' + sfx }); sb.innerHTML = icon('check') + `Als Anschlag übernehmen: ${fVal(fr[0])} … ${fVal(fr[1])} ${uLbl}`;
          sb.onclick = () => setStops(j.id, fr[0], fr[1]);
          res.after(sb);
        }
      };
      const pb = h('button', { type: 'button', class: 'btn', id: 'jt-play' + sfx }); pb.innerHTML = icon(anim && anim.jid === j.id ? 'close' : 'play') + (anim && anim.jid === j.id ? 'Stopp' : 'Bewegung abspielen');
      pb.onclick = () => play(j.id, pb);
      const del = h('button', { type: 'button', class: 'btn', id: 'jt-del' + sfx }); del.innerHTML = icon('ungroup') + (anyMate ? 'Verbindung lösen' : 'Gelenk lösen');
      del.onclick = () => remove(j.id);
      const row1 = h('div', { class: 'btn-row' }, pb);
      if (k === 'cyl' || k === 'planar') {
        const fb = h('button', { type: 'button', class: 'btn', id: 'jt-flip' + sfx });
        fb.innerHTML = icon('mirror') + (k === 'cyl' ? 'Richtung umkehren' : 'Seite umkehren');
        fb.onclick = () => flip(j.id);
        row1.append(fb);
      }
      box.append(row1, h('div', { class: 'btn-row' }, cb, del), res);
      sec.append(box);
    });
    return sec;
  }

  // Gelöschte Teile: Gelenke, die an ihnen hängen, fallen weg
  function init() {
    App.on('doc', () => {
      stopPlay();
      const js = list(); if (!js.length) return;
      const ids = new Set(); Model.walk(App.doc.items, (x) => { ids.add(x.id); });
      if (js.some((j) => !ids.has(j.a) || !ids.has(j.b))) App.doc.joints = js.filter((j) => ids.has(j.a) && ids.has(j.b));
    });
    App.on('docLoaded', stopPick);
    App.on('mode', stopPick);
    App.on('results', () => { if (anim && anim.applyPose) anim.applyPose(anim.st); });
  }

  return {
    init,
    start,
    startCylindrical,
    startPlanar,
    stopPick,
    add,
    addCylindrical,
    addPlanar,
    setAngle,
    setState,
    setKind,
    setRange,
    flip,
    constrain,
    applyDrag,
    projectAxisRay,
    frameOf,
    stateOf,
    drivingOf,
    cylAxisOf,
    planarFaceOf,
    setStops,
    freeRange,
    play,
    stopPlay,
    remove,
    check,
    describe,
    panel,
    of,
    allOf,
    downstream,
    pose,
    get picking() { return !!pickState; },
    get list() { return list(); },
    get playing() { return anim ? { jid: anim.jid, a: anim.a, st: anim.st } : null; },
  };
})();
