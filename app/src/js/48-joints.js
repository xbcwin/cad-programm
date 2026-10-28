// ================= Gelenke: ein Teil dreht sich oder gleitet um eine Achse gegenüber einem anderen =================
// Ein Gelenk ist kein Schritt der Zeitleiste: Es setzt nur die Lage des beweglichen Teils (doc.joints).
// Mehrere Gelenke bilden eine Kette: Bewegt sich ein vorderes Gelenk, wandern alle Teile und Gelenkachsen dahinter mit.
// home = Lage des beweglichen Teils bei 0°; Achse ao/ad in Weltkoordinaten (alle Teile liegen ganz oben im Verlauf).
const Joints = (() => {
  const list = (doc = App.doc) => (doc && doc.joints) || [];
  const allOf = (id, doc = App.doc) => list(doc).filter((j) => j.a === id || j.b === id);
  const of = (id, doc = App.doc) => list(doc).find((j) => j.b === id) || list(doc).find((j) => j.a === id) || null;
  const top = (id, doc = App.doc) => (doc && doc.items && doc.items.find((x) => x.id === id)) || null;
  const slide = (j) => j.kind === 'slide';
  const unit = (j) => (slide(j) ? 'mm' : '°');
  function stepMatrix(j, ang) {
    const o = new THREE.Vector3(...j.ao), d = new THREE.Vector3(...j.ad).normalize();
    if (slide(j)) return new THREE.Matrix4().makeTranslation(d.x * ang, d.y * ang, d.z * ang);   // Schiebegelenk: Weg in mm entlang der Achse
    const R = new THREE.Matrix4().makeRotationAxis(d, (ang * Math.PI) / 180);
    return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  function pose(j, ang, home) {
    return stepMatrix(j, ang).multiply(new THREE.Matrix4().fromArray(home || j.home));
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
  function syncHome(b, j) {
    const cur = Model.localMatrix(b), exp = pose(j, j.ang);
    if (cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4)) j.home = pose(j, -j.ang, cur.toArray()).toArray().map((v) => round(v, 9));
  }
  // Hintere Glieder der Kette samt ihren Gelenkachsen um die Bewegung D mitnehmen
  function moveChain(doc, rootId, D) {
    for (const k of downstream(doc, rootId)) {
      const kb = doc.items.find((x) => x.id === k.b);
      if (kb) syncHome(kb, k);
      k.ao = new THREE.Vector3(...k.ao).applyMatrix4(D).toArray().map((v) => round(v, 6));
      k.ad = new THREE.Vector3(...k.ad).transformDirection(D).toArray().map((v) => round(v, 9));
      k.home = D.clone().multiply(new THREE.Matrix4().fromArray(k.home)).toArray().map((v) => round(v, 9));
      if (kb) Model.setFromMatrix(kb, pose(k, k.ang));
    }
  }
  // Gelenk anlegen: zwei Teile gewählt, das zuletzt gewählte bewegt sich; dann die Achse im Bild wählen
  function start() {
    const sel = App.sel.map((id) => top(id)).filter(Boolean);
    if (sel.length !== 2) { UI.toast('Wähle genau zwei Teile (mit Umschalt klicken) – ganz oben im Verlauf, nicht in einer Gruppe.', { icon: 'info' }); return false; }
    const [A, B] = sel;
    if (connected(App.doc, A.id, B.id)) { UI.toast('Das ergäbe einen Kreis – die beiden Teile sind schon über Gelenke miteinander verbunden.', { icon: 'info' }); return false; }
    if (list().some((j) => j.b === B.id)) { UI.toast(`„${Model.label(B)}“ wird schon von einem Gelenk bewegt – jedes Teil darf nur von einem Gelenk bewegt werden.`, { icon: 'info' }); return false; }
    Features.pickAxisThen((ax) => {
      let jid = null;
      App.change('Gelenk angelegt', (doc) => {
        const b = doc.items.find((x) => x.id === B.id); if (!b) return false;
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
  // Winkel setzen – wurde das Teil inzwischen von Hand bewegt, gilt seine jetzige Lage als neue Ausgangslage
  function setAngle(jid, ang) {
    App.change('Gelenk gedreht', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = doc.items.find((x) => x.id === j.b); if (!b) return false;
      syncHome(b, j);
      const prev = j.ang;
      j.ang = round(clamp(Number(ang) || 0, j.min, j.max), 4);
      Model.setFromMatrix(b, pose(j, j.ang));
      if (Math.abs(j.ang - prev) > 1e-9) moveChain(doc, j.b, stepMatrix(j, j.ang - prev));
    }, { merge: 'joint:' + jid });
  }
  // Art wechseln (Drehen ↔ Schieben): das Teil geht zurück in die Ausgangslage
  function setKind(jid, kind) {
    App.change('Gelenk-Art', (doc) => {
      const j = list(doc).find((x) => x.id === jid); if (!j) return false;
      const b = doc.items.find((x) => x.id === j.b); if (!b) return false;
      syncHome(b, j);
      const prev = j.ang;
      if (Math.abs(prev) > 1e-9) moveChain(doc, j.b, stepMatrix(j, -prev));
      j.kind = kind === 'slide' ? 'slide' : 'rot'; j.ang = 0;
      if (j.kind === 'slide') { j.min = -20; j.max = 20; } else { j.min = -90; j.max = 90; }
      Model.setFromMatrix(b, pose(j, 0));
    });
  }
  function setRange(jid, k, v) {
    App.change('Gelenk-Bereich', (doc) => { const j = list(doc).find((x) => x.id === jid); if (!j) return false; j[k] = round(clamp(Number(v) || 0, -360, 360), 2); if (j.min > j.max) [j.min, j.max] = [j.max, j.min]; });
  }
  function remove(jid) {
    App.change('Gelenk gelöst', (doc) => { doc.joints = list(doc).filter((x) => x.id !== jid); });
    UI.toast('Gelenk gelöst – das Teil bleibt, wo es gerade ist.', { icon: 'check' });
  }
  // Bewegung prüfen: in Schritten von min bis max drehen und den CAD-Kern fragen, ob sich die Teile (samt mitbewegter Kette) durchdringen
  async function check(jid, step) {
    const j = list().find((x) => x.id === jid); if (!j) return null;
    step = step || (slide(j) ? Math.max(0.5, round((j.max - j.min) / 40, 1)) : 5);
    const A = top(j.a), B = top(j.b); if (!A || !B) return null;
    const V = Model.vars(App.doc).v, out = [];
    const cur = Model.localMatrix(B), exp = pose(j, j.ang);
    const home = cur.elements.some((v, i) => Math.abs(v - exp.elements[i]) > 1e-4) ? pose(j, -j.ang, cur.toArray()).toArray() : j.home;
    const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter(Boolean);
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
    const statK = [...compIds].filter((id) => !movSet.has(id)).map((id) => top(id)).filter(Boolean).map((it) => Model.kernelItem(it, V));
    const downCur = down.map((it) => ({ it, m: Model.localMatrix(it) }));
    for (let a = j.min; a <= j.max + 1e-9; a += step) {
      const Bc = deepClone(B); Model.setFromMatrix(Bc, pose(j, a, home));
      const D = stepMatrix(j, a - j.ang);
      const movK = [Model.kernelItem(Bc, V)];
      for (const d of downCur) {
        const dc = deepClone(d.it); Model.setFromMatrix(dc, D.clone().multiply(d.m));
        movK.push(Model.kernelItem(dc, V));
      }
      let cl = null; try { cl = await Kernel.call('clashes', { scene: { items: [...statK, ...movK] } }); } catch (_) {}
      const v = cl ? cl.pairs.filter((p) => movSet.has(p.a) !== movSet.has(p.b)).reduce((s, p) => s + p.v, 0) : 0;
      out.push({ a: round(a, 4), v });
    }
    return out;
  }
  function describe(j, res) {
    const hit = res.filter((r) => r.v > 0.05);
    const u = unit(j);
    if (!hit.length) return { ok: true, text: `Frei im ganzen Bereich von ${fmt(j.min, 1)} ${u} bis ${fmt(j.max, 1)} ${u} – nichts stößt an.` };
    const free = res.filter((r) => r.v <= 0.05).map((r) => r.a);
    const lo = res.filter((r) => r.a <= j.ang && r.v > 0.05).map((r) => r.a), hi = res.filter((r) => r.a >= j.ang && r.v > 0.05).map((r) => r.a);
    const from = lo.length ? Math.max(...lo) : null, to = hi.length ? Math.min(...hi) : null;
    const parts = [];
    if (to != null) parts.push(`stößt in Plus-Richtung bei ${fmt(to, 1)} ${u} an`);
    if (from != null) parts.push(`in Minus-Richtung bei ${fmt(from, 1)} ${u}`);
    const atNow = res.find((r) => Math.abs(r.a - j.ang) < 1e-6);
    return { ok: false, text: (atNow && atNow.v > 0.05 ? 'Schon in dieser Stellung stecken die Teile ineinander. ' : '') + `Das Teil ${parts.join(', ')}.` + (free.length ? ` Frei: ${fmt(Math.min(...free), 1)} … ${fmt(Math.max(...free), 1)} ${u} (nicht unbedingt am Stück).` : '') };
  }
  // Abschnitt „Gelenk“ in den Eigenschaften – zeigt alle Gelenke des gewählten Teils
  function panel(it) {
    const js = allOf(it.id).filter((j) => top(j.a) && top(j.b));
    if (!js.length) return null;
    const sec = h('div', { class: 'section', id: 'joint-sec' }, h('div', { class: 'section-h' }, js.length > 1 ? `Gelenke (${js.length})` : 'Gelenk'));
    js.forEach((j, idx) => {
      if (idx > 0) sec.append(h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '6px 0', width: '100%' } }));
      const sfx = idx ? '-' + idx : '';
      const A = top(j.a), B = top(j.b);
      const down = downstream(App.doc, j.b).map((k) => top(k.b)).filter(Boolean);
      const moveTxt = down.length ? ` (${down.map((x) => '„' + esc(Model.label(x)) + '“').join(', ')} ${down.length === 1 ? 'bewegt sich' : 'bewegen sich'} mit)` : '';
      const box = h('div', { class: 'joint-item', dataset: { jid: j.id } });
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
      };
      const del = h('button', { type: 'button', class: 'btn', id: 'jt-del' + sfx }); del.innerHTML = icon('ungroup') + 'Gelenk lösen';
      del.onclick = () => remove(j.id);
      box.append(h('div', { class: 'btn-row' }, cb, del), res);
      sec.append(box);
    });
    return sec;
  }
  // Gelöschte Teile: Gelenke, die an ihnen hängen, fallen weg
  function init() {
    App.on('doc', () => {
      const js = list(); if (!js.length) return;
      const ids = new Set(App.doc.items.map((x) => x.id));
      if (js.some((j) => !ids.has(j.a) || !ids.has(j.b))) App.doc.joints = js.filter((j) => ids.has(j.a) && ids.has(j.b));
    });
  }
  return { init, start, setAngle, setKind, setRange, remove, check, describe, panel, of, allOf, downstream, pose, get list() { return list(); } };
})();
