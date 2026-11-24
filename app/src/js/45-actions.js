// ================= Aktionen am Modell =================
const Actions = (() => {
  const V = () => Model.vars(App.doc).v;
  function viewCenter() {
    const t = Viewer.controls.target; const g = App.doc.settings.grid || 1;
    return [Math.round(t.x / 5) * 5, Math.round(t.y / 5) * 5];
  }
  function tops(ids) { return ids.map((id) => App.doc.items.find((x) => x.id === id)).filter(Boolean); }
  function findSel() { return App.selectedItems(); }
  function worldBox(id) {
    const n = Viewer.nodes.get(id) || (App.mergedInto(id) ? Viewer.nodes.get(App.mergedInto(id)) : null);
    if (n) return n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix);
    const b = App.localBox(id); if (!b) return null;
    const box = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
    return box.applyMatrix4(Model.worldMatrix(App.doc, id));
  }
  function selBox(ids) { const box = new THREE.Box3(); for (const id of ids) { const b = worldBox(id); if (b) box.union(b); } return box; }

  // Ein Objekt an einen Zielkörper anhängen: aus dem Ziel wird bei Bedarf eine Gruppe
  function attach(doc, targetId, item) {
    const idx = doc.items.findIndex((x) => x.id === targetId);
    const found = Model.find(doc, targetId);
    if (!found) { doc.items.push(item); return item; }
    const T = found.item;
    if (T.kind === 'group' && T.p && T.p.op) { Model.setFromMatrix(item, Model.worldMatrix(doc, targetId).multiply(Model.localMatrix(item))); doc.items.push(item); return item; }
    if (T.kind === 'group') { T.children.push(item); return T; }
    const G = Model.newItem('group', {}, { name: T.name, color: T.color, role: T.role });
    G.t = { ...T.t }; G.finishes = [];
    T.t = Model.T0(); T.role = 'solid';
    G.children = [T, item];
    found.list[found.index] = G;
    return G;
  }
  function placeFor(kind, p) {
    const pb = Model.primitiveBox(kind, Model.resolveP(p, V()));
    return pb;
  }
  const sceneEmpty = () => !App.doc.items.some((x) => x.role !== 'hole' && !x.hidden);
  // sichtbare Körper (ohne Löcher) als Weltkästen
  function solidBoxes() {
    const out = [];
    for (const n of Viewer.nodes.values()) if (n.role !== 'hole' && n.obj.visible) out.push(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix));
    return out;
  }
  // Neuer Körper per Klick: in der Bildmitte, aber nicht unsichtbar in einem vorhandenen Körper,
  // sondern rechts daneben, wenn die Mitte schon belegt ist
  function freeSpot(halfW, halfD) {
    let [x, y] = viewCenter();
    const boxes = solidBoxes(); if (!boxes.length) return [x, y];
    const hits = (px) => boxes.some((b) => px - halfW < b.max.x + 1 && px + halfW > b.min.x - 1 && y - halfD < b.max.y + 1 && y + halfD > b.min.y - 1);
    if (!hits(x)) return [x, y];
    let right = -Infinity; for (const b of boxes) if (y - halfD < b.max.y + 1 && y + halfD > b.min.y - 1) right = Math.max(right, b.max.x);
    x = Math.ceil((right + 6 + halfW) / 5) * 5;
    return [x, y];
  }
  // Höhe der Oberfläche unter einem Punkt – dort setzt ein Loch per Klick an
  function topZAt(x, y) {
    const meshes = [...Viewer.nodes.values()].filter((n) => n.role !== 'hole' && n.obj.visible).map((n) => n.mesh);
    if (!meshes.length) return null;
    Viewer.scene.updateMatrixWorld();
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y, 1e4), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObjects(meshes, false)[0];
    return hit ? round(hit.point.z, 3) : null;
  }
  function addPrimitive(kind, opts = {}) {
    if (sceneEmpty() && !opts.onFace && opts.role !== 'hole') App.fitAfterBuild();
    const it = Model.newItem(kind, opts.p || {}, { role: opts.role });
    if (opts.name) it.name = opts.name;
    let res;
    const pb = Model.primitiveBox(kind, Model.resolveP(it.p, V())) || [-10, -10, 0, 10, 10, 20];
    const spot = opts.pos || (opts.role === 'hole' ? viewCenter() : freeSpot(Math.max(-pb[0], pb[3]), Math.max(-pb[1], pb[4])));
    App.change(`${KINDS[kind].label} hinzugefügt`, (doc) => {
      if (opts.onFace) {
        Object.assign(it.t, opts.onFace.t);
        res = attach(doc, opts.onFace.targetId, it);
      } else {
        const [x, y] = spot;
        it.t.x = x; it.t.y = y; it.t.z = opts.z || 0;
        if (opts.rz) it.t.rz = opts.rz;
        doc.items.push(it); res = it;
      }
    });
    App.select([it.id]);
    return it;
  }
  function addPart(def, params, opts = {}) {
    if (sceneEmpty() && !opts.onFace && def.role !== 'hole') App.fitAfterBuild();
    const it = Model.newItem('part', { lib: def.lib, ...params }, { name: opts.name || def.label, role: def.role });
    const hole = def.role === 'hole';
    const spot = opts.pos || (hole ? viewCenter() : freeSpot(25, 25));
    // Loch per Klick: oben auf die Fläche unter der Bildmitte setzen, damit es gleich schneidet
    const topZ = hole && !opts.onFace && opts.z == null ? topZAt(spot[0], spot[1]) : null;
    App.change(`${def.label} hinzugefügt`, (doc) => {
      if (opts.onFace) { Object.assign(it.t, opts.onFace.t); attach(doc, opts.onFace.targetId, it); }
      else {
        const [x, y] = spot;
        it.t.x = x; it.t.y = y; it.t.z = hole ? (opts.z ?? topZ ?? 10) : 0;
        doc.items.push(it);
      }
    });
    App.select([it.id]);
    if (hole && !opts.onFace && topZ != null) UI.toast(`${def.label} sitzt oben auf der Fläche. Zieh es an die richtige Stelle – oder nimm „Loch hier“ auf einer Fläche.`, { icon: 'info', ms: 4200 });
    return it;
  }
  // Kaufteil (Motor, Akku …) in echter Form mit festem Gewicht – wird nie mit dem Körper darunter verschmolzen
  function addBuyPart(spec, opts = {}) {
    if (sceneEmpty() && !opts.onFace) App.fitAfterBuild();
    const it = Model.newItem(spec.kind, { ...Model.newItem(spec.kind).p, ...spec.p }, { name: spec.name, color: spec.color });
    it.massG = spec.massG == null ? '' : spec.massG;
    const pb = Model.primitiveBox(spec.kind, Model.resolveP(it.p, V())) || [-10, -10, 0, 10, 10, 20];
    App.change(`${spec.name} hinzugefügt`, (doc) => {
      if (opts.onFace) Model.setFromMatrix(it, Model.worldMatrix(doc, opts.onFace.targetId).multiply(Model.localMatrix({ t: { ...Model.T0(), ...opts.onFace.t } })));
      else { const [x, y] = opts.pos || freeSpot(Math.max(-pb[0], pb[3]), Math.max(-pb[1], pb[4])); it.t.x = x; it.t.y = y; }
      doc.items.push(it);
    });
    App.select([it.id]);
    UI.toast(it.massG === '' ? `${spec.name} eingefügt. Trag rechts das Gewicht aus dem Datenblatt ein.` : `${spec.name} eingefügt (${fmtFixed(Model.num(it.massG, V(), 0), 1)} g).`, { icon: 'check', ms: 3500 });
    return it;
  }
  // Eigenes Teil aus „Meine Teile“ einsetzen (mit lokalen Maßen in item.userPart)
  function addUserPart(item, entry, opts = {}) {
    const hole = item.role === 'hole';
    if (sceneEmpty() && !opts.onFace && !hole) App.fitAfterBuild();
    const ownV = item.userPart ? Model.scopeVars(V(), item.userPart) : V();
    const pb = Model.itemLocalBox(item, ownV) || [-15, -15, 0, 15, 15, 20];
    const spot = opts.pos || (hole ? viewCenter() : freeSpot(Math.max(-pb[0], pb[3]), Math.max(-pb[1], pb[4])));
    const topZ = hole && !opts.onFace && opts.z == null ? topZAt(spot[0], spot[1]) : null;
    App.change(`${entry.name} aus Bibliothek eingefügt`, (doc) => {
      if (opts.onFace) {
        Object.assign(item.t, opts.onFace.t);
        attach(doc, opts.onFace.targetId, item);
      } else {
        const [x, y] = spot;
        item.t.x = x; item.t.y = y;
        item.t.z = hole ? (opts.z ?? topZ ?? 10) : (opts.z ?? 0);
        doc.items.push(item);
      }
    });
    App.select([item.id]);
    const pCount = item.userPart && Array.isArray(item.userPart.params) ? item.userPart.params.length : 0;
    UI.toast(pCount ? `„${entry.name}“ eingesetzt – die Maße kannst du rechts direkt anpassen.` : `„${entry.name}“ eingesetzt.`, { icon: 'check', ms: 3500 });
    return item;
  }
  function remove(ids) {
    ids = ids || App.sel; if (!ids.length) return;
    const n = ids.length;
    // Hängen andere Teile daran? Dann nach dem Löschen sagen, welche
    const gone = new Set(ids.map((id) => (Model.topOf(App.doc, id) || {}).id));
    const hit = Model.dependencies(App.doc).filter((x) => gone.has(x.to) && !gone.has(x.from));
    App.change(n > 1 ? `${n} Objekte gelöscht` : 'Gelöscht', (doc) => {
      for (const id of ids) { const f = Model.find(doc, id); if (f) f.list.splice(f.list.indexOf(f.item), 1); }
      // leere oder einzelne Gruppen aufräumen
      cleanupGroups(doc);
    });
    App.select([]);
    if (hit.length) {
      const names = [...new Set(hit.map((x) => (x.datum ? `Bezugsebene „${x.datum}“` : x.axis ? `Bezugsachse „${x.axis}“` : x.point ? `Bezugspunkt „${x.point}“` : x.csys ? `Koordinatensystem „${x.csys}“` : `„${Model.label((Model.find(App.doc, x.from) || { item: {} }).item)}“`)))];
      UI.toast(`Daran hingen ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' …' : ''} – sie behalten ihre letzte Form. Rückgängig holt alles zurück.`, { icon: 'warn', ms: 6000 });
    }
  }
  function cleanupGroups(doc) {
    Model.walk(doc.items, (it, parent, depth, list, i) => {
      if (it.kind === 'group' && !it.comp && (!it.children || !it.children.length)) list.splice(i, 1);
    });
  }
  function duplicate(ids) {
    ids = ids || App.sel; if (!ids.length) return [];
    const newIds = [];
    App.change('Dupliziert', (doc) => {
      for (const id of ids) {
        const f = Model.find(doc, id); if (!f) continue;
        const c = Model.reId(deepClone(f.item));
        if (c.kind !== 'transform') {
          const tn = Model.tNumeric(c); c.t.x = round(tn.x + 10, 4); c.t.y = round(tn.y + 10, 4);
        }
        c.name = f.item.name;
        const idx = f.list.indexOf(f.item);
        f.list.splice(idx + 1, 0, c); newIds.push(c.id);
        if (!f.parent) {
          if (doc.rollback != null && idx < doc.rollback) {
            doc.rollback++;
            if (doc.rollback >= doc.items.length) doc.rollback = null;
          }
          const fld = Model.folderOf(doc, f.item.id);
          if (fld) fld.ids.splice(fld.ids.indexOf(f.item.id) + 1, 0, c.id);
        }
      }
      Model.cleanFolders(doc);
    });
    App.select(newIds);
    UI.toast(newIds.length > 1 ? `${newIds.length} Objekte dupliziert` : 'Dupliziert – die Kopie liegt 10 mm versetzt', { icon: 'copy' });
    return newIds;
  }
  // Verknüpft duplizieren: die Kopie folgt dem Original (Maße, Kanten), Lage und Farbe bleiben eigen
  function duplicateLinked(ids) {
    ids = (ids || App.sel).filter((id) => { const f = Model.find(App.doc, id); return f && f.item.kind !== 'group'; });
    if (!ids.length) { UI.toast('Verknüpfte Kopien gehen für einzelne Teile (nicht für Verbünde).', { icon: 'info' }); return []; }
    const newIds = [];
    App.change('Verknüpft dupliziert', (doc) => {
      for (const id of ids) {
        const f = Model.find(doc, id); if (!f) continue;
        const src = f.item.link ? Model.find(doc, f.item.link) : f; if (!src) continue;
        const c = Model.reId(deepClone(f.item)); delete c.ai; delete c.op;
        c.link = src.item.id;
        const tn = Model.tNumeric(c); c.t.x = round(tn.x + 10, 4); c.t.y = round(tn.y + 10, 4);
        c.name = src.item.name;
        f.list.splice(f.list.indexOf(f.item) + 1, 0, c); newIds.push(c.id);
      }
    });
    App.select(newIds);
    UI.toast('Verknüpfte Kopie – ändert sich das Original, ändert sich die Kopie mit.', { icon: 'copy' });
    return newIds;
  }
  function unlink(id) { App.change('Verknüpfung gelöst', (doc) => { const f = Model.find(doc, id); if (!f || !f.item.link) return false; delete f.item.link; delete f.item.linkLost; }); }
  // Formschritt-Modus setzen: type null = eigener Körper; sonst mit dem Zielkörper vereinigen, davon abziehen oder schneiden
  // Ausblenden und alles wieder einblenden (nur Anzeige, ein Rückgängig-Schritt)
  function hideSelected(ids = App.sel) {
    const tops = [...new Set(ids.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean))];
    if (!tops.length) return false;
    App.change(tops.length === 1 ? 'Ausgeblendet' : `${tops.length} Teile ausgeblendet`, (doc) => { for (const id of tops) { const f = Model.find(doc, id); if (f) f.item.hidden = true; } });
    App.clearSelection(); return true;
  }
  function showAll() {
    let any = false;
    Model.walk(App.doc.items, (x) => { if (x.hidden || (x.bodies && x.bodies.some((b) => b && b.hidden))) any = true; });
    if (!any) return false;
    App.change('Alles eingeblendet', (doc) => {
      Model.walk(doc.items, (x) => {
        if (x.hidden) delete x.hidden;
        if (x.bodies) {
          for (const b of x.bodies) if (b && b.hidden) delete b.hidden;
          x.bodies = x.bodies.filter((b) => b && (b.name || b.color || b.hidden));
          if (!x.bodies.length) delete x.bodies;
        }
      });
    });
    return true;
  }
  function setBody(itemId, bodyIdx, patch) {
    const res = App.results.get(itemId);
    const evalBodies = res && res.data && res.data.bodies;
    if (!evalBodies || !evalBodies[bodyIdx]) return false;
    const label = 'name' in patch ? 'Körper umbenannt' : 'color' in patch ? (patch.color ? 'Körper gefärbt' : 'Körperfarbe zurückgesetzt') : (patch.hidden ? 'Körper ausgeblendet' : 'Körper eingeblendet');
    return App.change(label, (doc) => {
      const f = Model.find(doc, itemId);
      if (!f) return false;
      const it = f.item;
      const matched = Model.matchBodies(it.bodies, evalBodies);
      const next = [];
      for (let i = 0; i < evalBodies.length; i++) {
        const cur = matched[i] ? { ...matched[i] } : {};
        if (i === bodyIdx) Object.assign(cur, patch);
        cur.idx = i;
        cur.c = evalBodies[i].c.slice();
        if (!cur.name) delete cur.name;
        if (!cur.color) delete cur.color;
        if (!cur.hidden) delete cur.hidden;
        if (cur.name || cur.color || cur.hidden) next.push(cur);
      }
      if (next.length) it.bodies = next; else delete it.bodies;
    });
  }
  function showOnlyBody(itemId, bodyIdx) {
    const res = App.results.get(itemId);
    const evalBodies = res && res.data && res.data.bodies;
    if (!evalBodies || !evalBodies[bodyIdx]) return false;
    return App.change('Nur diesen Körper zeigen', (doc) => {
      const f = Model.find(doc, itemId);
      if (!f) return false;
      const it = f.item;
      const matched = Model.matchBodies(it.bodies, evalBodies);
      const next = [];
      for (let i = 0; i < evalBodies.length; i++) {
        const cur = matched[i] ? { ...matched[i] } : {};
        cur.idx = i;
        cur.c = evalBodies[i].c.slice();
        if (i === bodyIdx) delete cur.hidden; else cur.hidden = true;
        if (!cur.name) delete cur.name;
        if (!cur.color) delete cur.color;
        if (cur.name || cur.color || cur.hidden) next.push(cur);
      }
      if (next.length) it.bodies = next; else delete it.bodies;
    });
  }
  function showAllBodies(itemId) {
    const f0 = Model.find(App.doc, itemId);
    if (!f0 || !f0.item.bodies || !f0.item.bodies.some((b) => b && b.hidden)) return false;
    return App.change('Alle Körper einblenden', (doc) => {
      const f = Model.find(doc, itemId);
      if (!f || !f.item.bodies) return false;
      for (const b of f.item.bodies) if (b && b.hidden) delete b.hidden;
      f.item.bodies = f.item.bodies.filter((b) => b && (b.name || b.color || b.hidden));
      if (!f.item.bodies.length) delete f.item.bodies;
    });
  }
  function invertSelection() {
    const cur = new Set(App.sel.map((id) => (Model.topOf(App.doc, id) || {}).id));
    App.select(App.doc.items.filter((x) => !x.hidden && !App.mergedInto(x.id) && !cur.has(x.id)).map((x) => x.id));
  }
  function setOp(id, type, target) {
    const f = Model.find(App.doc, id); if (!f) return false;
    if (type && !target) return false;
    const label = !type ? 'Eigener Körper' : `${Model.OPS[type]} „${Model.label(Model.find(App.doc, target).item)}“`;
    App.change(label, (doc) => { const T = Model.find(doc, id).item; if (!type) delete T.op; else { T.op = { type, target }; if (T.role === 'hole') T.role = 'solid'; } });
    return true;
  }
  function setRole(ids, role) {
    ids = ids || App.sel; if (!ids.length) return;
    App.change(role === 'hole' ? 'Zum Loch gemacht' : 'Zum Körper gemacht', (doc) => { for (const id of ids) { const f = Model.find(doc, id); if (f) f.item.role = role; } });
    App.refreshSelectionVisuals();
  }
  function toggleRole(ids) {
    ids = ids || App.sel; if (!ids.length) return;
    const first = Model.find(App.doc, ids[0]); if (!first) return;
    setRole(ids, first.item.role === 'hole' ? 'solid' : 'hole');
  }
  function group(ids, opts = {}) {
    ids = (ids || App.sel).slice();
    const found = ids.map((id) => Model.find(App.doc, id)).filter(Boolean);
    if (found.length < 2) { UI.toast('Wähle mindestens zwei Objekte zum Gruppieren (mit Umschalt klicken).', { icon: 'info' }); return; }
    const parent = found[0].parent;
    if (!found.every((f) => f.parent === parent)) { UI.toast('Nur Objekte auf derselben Ebene lassen sich gruppieren.', { kind: 'bad' }); return; }
    const box = selBox(ids);
    let G;
    App.change('Gruppiert', (doc) => {
      const list = parent ? Model.find(doc, parent.id).item.children : doc.items;
      const items = ids.map((id) => list.find((x) => x.id === id)).filter(Boolean);
      const firstSolid = items.find((x) => x.role !== 'hole') || items[0];
      G = Model.newItem('group', {}, { name: opts.name || 'Gruppe', color: firstSolid.color, role: 'solid' });
      // Ursprung der Gruppe: Mitte unten der Auswahl (im Elternsystem)
      const PW = parent ? Model.worldMatrix(doc, parent.id) : new THREE.Matrix4();
      const c = box.isEmpty() ? new THREE.Vector3() : new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
      const cl = c.clone().applyMatrix4(PW.clone().invert());
      G.t = { ...Model.T0(), x: round(cl.x, 4), y: round(cl.y, 4), z: round(cl.z, 4) };
      const GM = Model.localMatrix(G), GI = GM.clone().invert();
      const at = Math.min(...items.map((x) => list.indexOf(x)));
      for (const it of items) { list.splice(list.indexOf(it), 1); Model.setFromMatrix(it, GI.clone().multiply(Model.localMatrix(it))); G.children.push(it); }
      list.splice(at, 0, G);
    });
    App.select([G.id]);
    const holes = G.children.filter((c) => c.role === 'hole').length;
    if (!opts.quiet) UI.toast(holes ? 'Gruppiert – die Löcher sind jetzt fest aus dem Körper geschnitten.' : 'Gruppiert – die Teile sind jetzt ein Körper.', { icon: 'group' });
    return G.id;
  }
  // „Alles als Verbund“: alle sichtbaren Teile zu einem Körper – Kaufteile bleiben einzeln, damit ihr Gewicht stimmt
  function groupAll(name = 'Verbund') {
    const tops = Model.activeItems(App.doc).filter((x) => !x.hidden);
    const keep = tops.filter((x) => Mass.fixedOf(x)), ids = tops.filter((x) => !Mass.fixedOf(x)).map((x) => x.id);
    if (ids.length < 2) { UI.toast('Zum Verbinden braucht es mindestens zwei Teile.', { icon: 'info' }); return null; }
    const gid = group(ids, { name, quiet: true });
    if (gid) UI.toast(`Verbunden: ${ids.length} Teile sind jetzt ein Körper.` + (keep.length ? ` ${keep.length} Kaufteile bleiben einzeln, damit ihr Gewicht stimmt.` : ''), { icon: 'group', ms: 4500 });
    return gid;
  }
  function ungroup(id) {
    id = id || App.sel[0];
    const f = Model.find(App.doc, id); if (!f || f.item.kind !== 'group') return;
    const kids = [];
    App.change('Gruppe gelöst', (doc) => {
      const ff = Model.find(doc, id); const G = ff.item;
      const GM = Model.localMatrix(G);
      const at = ff.list.indexOf(G);
      ff.list.splice(at, 1);
      G.children.forEach((c, i) => { Model.setFromMatrix(c, GM.clone().multiply(Model.localMatrix(c))); if (G.userPart && !c.userPart) c.userPart = deepClone(G.userPart); if (G.op && !ff.parent && c.kind !== 'rib') c.op = { ...G.op }; ff.list.splice(at + i, 0, c); kids.push(c.id); });
    });
    App.select(kids);
    if ((f.item.finishes || []).length) UI.toast('Die Rundungen der Gruppe wurden entfernt, weil es die Gruppe nicht mehr gibt.', { icon: 'info' });
  }
  function rotate90(ids, axis) { rotate(ids, axis, 90, axis !== 'z'); }
  // um die Mitte der Teile drehen, beliebiger Winkel; drop: danach wieder auf die XY-Ebene legen
  function rotate(ids, axis, deg = 90, drop = false) {
    ids = ids || App.sel; if (!ids.length) return;
    const box = selBox(ids); const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const a = (deg * Math.PI) / 180;
    App.change(deg === 90 ? 'Um 90° gedreht' : `Um ${fmtAngleU(deg)} gedreht`, (doc) => {
      const R = new THREE.Matrix4();
      if (axis === 'x') R.makeRotationX(a); else if (axis === 'y') R.makeRotationY(a); else R.makeRotationZ(a);
      const T1 = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), T2 = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
      for (const id of ids) {
        const f = Model.find(doc, id); if (!f || f.item.locked) continue;
        const W = Model.worldMatrix(doc, id), PW = Model.parentWorld(doc, id);
        const Wn = T1.clone().multiply(R).multiply(T2).multiply(W);
        Model.setFromMatrix(f.item, PW.clone().invert().multiply(Wn));
      }
    });
    if (drop) setTimeout(() => dropToPlate(ids, true), 250);
  }
  // Teile gemeinsam so verschieben, dass ihre Mitte über dem Ursprung liegt (Höhe bleibt)
  function center(ids) {
    ids = (ids || App.sel).filter((id) => App.doc.items.find((x) => x.id === id)); if (!ids.length) return;
    const box = selBox(ids); if (box.isEmpty()) return;
    const dx = -(box.min.x + box.max.x) / 2, dy = -(box.min.y + box.max.y) / 2;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
    App.change('Mittig gesetzt', (doc) => { for (const id of ids) { const it = doc.items.find((x) => x.id === id); const tn = Model.tNumeric(it); it.t.x = round(tn.x + dx, 4); it.t.y = round(tn.y + dy, 4); } });
  }
  function mirror(ids, axis) {
    ids = ids || App.sel; if (!ids.length) return;
    const box = selBox(ids); const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    App.change('Gespiegelt', (doc) => {
      const S = new THREE.Matrix4().makeScale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1);
      const T1 = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), T2 = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
      const Mref = T1.multiply(S).multiply(T2);
      for (const id of ids) {
        const f = Model.find(doc, id); if (!f) continue;
        const W = Model.worldMatrix(doc, id), PW = Model.parentWorld(doc, id);
        const D = new THREE.Matrix4().makeScale(-1, 1, 1);
        const Wn = Mref.clone().multiply(W).multiply(D);
        Model.setFromMatrix(f.item, PW.clone().invert().multiply(Wn));
        const m = f.item.mir || [1, 1, 1]; f.item.mir = [-m[0], m[1], m[2]];
        if (f.item.mir.every((s) => s === 1)) delete f.item.mir;
      }
    });
  }
  function dropToPlate(ids, quiet) {
    ids = (ids || App.sel).filter((id) => App.doc.items.find((x) => x.id === id));
    if (!ids.length) ids = App.doc.items.filter((x) => x.role !== 'hole' && !x.hidden).map((x) => x.id);
    let changed = 0;
    const before = App.snapshot();
    for (const id of ids) {
      const b = worldBox(id); if (!b || b.isEmpty()) continue;
      const it = App.doc.items.find((x) => x.id === id);
      if (Math.abs(b.min.z) > 1e-4) { it.t.z = round(Model.tnum(it, 'z') - b.min.z, 4); changed++; }
    }
    if (changed) { App.pushUndo('Auf die XY-Ebene gesetzt', before); App.touched(); if (!quiet) UI.toast('Liegt jetzt auf der XY-Ebene.', { icon: 'check' }); }
    else if (!quiet) UI.toast('Liegt schon auf der XY-Ebene.', { icon: 'check' });
  }
  function align(ids, mode) {
    ids = ids || App.sel; if (ids.length < 2) return;
    const boxes = ids.map((id) => [id, worldBox(id)]).filter(([, b]) => b);
    const all = new THREE.Box3(); boxes.forEach(([, b]) => all.union(b));
    App.change('Ausgerichtet', (doc) => {
      for (const [id, b] of boxes) {
        const f = Model.find(doc, id); if (!f || f.item.locked) continue;
        let d = new THREE.Vector3();
        if (mode === 'left') d.x = all.min.x - b.min.x;
        if (mode === 'cx') d.x = (all.min.x + all.max.x) / 2 - (b.min.x + b.max.x) / 2;
        if (mode === 'right') d.x = all.max.x - b.max.x;
        if (mode === 'front') d.y = all.min.y - b.min.y;
        if (mode === 'cy') d.y = (all.min.y + all.max.y) / 2 - (b.min.y + b.max.y) / 2;
        if (mode === 'back') d.y = all.max.y - b.max.y;
        if (mode === 'bottom') d.z = all.min.z - b.min.z;
        if (mode === 'top') d.z = all.max.z - b.max.z;
        const PW = Model.parentWorld(doc, id);
        const q = new THREE.Quaternion(); PW.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        d.applyQuaternion(q.invert());
        const tn = Model.tNumeric(f.item); f.item.t.x = round(tn.x + d.x, 4); f.item.t.y = round(tn.y + d.y, 4); f.item.t.z = round(tn.z + d.z, 4);
      }
    });
  }
  // Abstand zwischen zwei Körpern (Lücke zwischen ihren Hüllen) entlang einer Achse; der zuletzt gewählte bewegt sich
  function gapOf(ids, ax) {
    ids = ids || App.sel; if (ids.length !== 2) return null;
    const a = worldBox(ids[0]), b = worldBox(ids[1]); if (!a || !b) return null;
    const k = ax === 'y' ? 'y' : ax === 'z' ? 'z' : 'x';
    const cb = (b.min[k] + b.max[k]) / 2, ca = (a.min[k] + a.max[k]) / 2;
    return cb >= ca ? { gap: b.min[k] - a.max[k], dir: 1 } : { gap: a.min[k] - b.max[k], dir: -1 };
  }
  function setGap(ids, ax, value) {
    ids = ids || App.sel.slice(); const g = gapOf(ids, ax); if (!g) return;
    const k = ax === 'y' ? 'y' : ax === 'z' ? 'z' : 'x';
    const d = new THREE.Vector3(); d[k] = (value - g.gap) * g.dir;
    App.change('Abstand gesetzt', (doc) => {
      const f = Model.find(doc, ids[1]); if (!f || f.item.locked) return false;
      const PW = Model.parentWorld(doc, ids[1]); const q = new THREE.Quaternion(); PW.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      d.applyQuaternion(q.invert());
      const tn = Model.tNumeric(f.item); f.item.t.x = round(tn.x + d.x, 4); f.item.t.y = round(tn.y + d.y, 4); f.item.t.z = round(tn.z + d.z, 4);
    });
  }
  // ---------- Kanten ----------
  function edgeSigOf(id, edgeIdx) {
    const r = App.results.get(id); if (!r || !r.data || !r.data.edges) return null;
    const g = r.data.edges[edgeIdx]; if (!g) return null;
    const r5 = (arr) => arr.map((v) => round(v, 5));
    const sig = { m: r5(g.m), l: round(g.l, 5), t: g.t };
    if (g.tid) sig.tid = g.tid;
    if (Array.isArray(g.a)) sig.a = r5(g.a);
    if (Array.isArray(g.b)) sig.b = r5(g.b);
    if (g.t === 'CIRCLE' && g.c && g.n && g.r != null) { sig.c = r5(g.c); sig.n = r5(g.n); sig.r = round(g.r, 5); }
    if (Array.isArray(g.pts) && g.pts.length >= 2) sig.pts = g.pts.map(r5);
    return sig;
  }
  function edgeSigs(edges) {
    const out = [];
    for (const e of edges) { const sig = edgeSigOf(e.id, e.edgeIdx); if (sig) out.push({ id: e.id, sig }); }
    return out;
  }
  function cuttersOf(id) {
    const it = App.doc.items.find((x) => x.id === id); if (!it || it.role === 'hole') return [];
    const b = worldBox(id); if (!b) return [];
    return App.doc.items.filter((x) => x.role === 'hole' && !x.hidden && x.id !== id).filter((x) => { const hb = worldBox(x.id); return hb && hb.intersectsBox(b); });
  }
  function addFinish(type, r = 1, edges) {
    edges = edges || App.edges;
    if (!edges.length) { UI.toast('Klick zuerst eine Kante an.', { icon: 'info' }); return; }
    const byItem = new Map();
    for (const e of edgeSigs(edges)) { if (!byItem.has(e.id)) byItem.set(e.id, []); byItem.get(e.id).push(e.sig); }
    let targetId = null, grouped = false;
    App.change(type === 'chamfer' ? 'Kanten abgeschrägt' : 'Kanten abgerundet', (doc) => {
      for (const [id, sigs] of byItem) {
        let it = doc.items.find((x) => x.id === id); if (!it) continue;
        const cut = cuttersOf(id);
        if (cut.length) {
          // Körper und Löcher erst zusammenfassen, damit die neuen Kanten existieren
          const G = Model.newItem('group', {}, { name: it.name, color: it.color, role: 'solid' });
          G.t = { ...it.t };
          const GI = Model.localMatrix(G).clone().invert();
          const idx = doc.items.indexOf(it);
          doc.items.splice(idx, 1);
          it.t = Model.T0(); G.children.push(it);
          for (const hl of cut) { const hi = doc.items.indexOf(hl); doc.items.splice(hi, 1); Model.setFromMatrix(hl, GI.clone().multiply(Model.localMatrix(hl))); G.children.push(hl); }
          doc.items.splice(Math.min(idx, doc.items.length), 0, G);
          it = G; grouped = true;
        }
        it.finishes = it.finishes || [];
        it.finishes.push({ id: uid('f'), type, r, edges: sigs });
        targetId = it.id;
      }
    });
    if (targetId) App.select([targetId]);
    if (grouped) UI.toast('Körper und Loch wurden zu einer Gruppe verbunden, damit die Kante gerundet werden kann.', { icon: 'group', ms: 5000 });
    return targetId;
  }
  function finishAll(id, type, sel, r = 1) {
    App.change(type === 'chamfer' ? 'Kanten abgeschrägt' : 'Kanten abgerundet', (doc) => { const f = Model.find(doc, id); if (!f) return false; f.item.finishes = f.item.finishes || []; f.item.finishes.push({ id: uid('f'), type, r, edges: sel }); });
  }
  function setFinish(itemId, finId, patch) {
    App.change('Rundung geändert', (doc) => { const f = Model.find(doc, itemId); if (!f) return false; const fin = f.item.finishes.find((x) => x.id === finId); if (!fin) return false; for (const k in patch) { if (patch[k] === null) delete fin[k]; else fin[k] = patch[k]; } }, { merge: 'fin:' + finId });
  }
  function removeFinish(itemId, finId) {
    App.change('Rundung entfernt', (doc) => { const f = Model.find(doc, itemId); if (!f) return false; f.item.finishes = f.item.finishes.filter((x) => x.id !== finId); });
  }
  // ---------- Flächen ----------
  function faceFrame(info) {
    const n = new THREE.Vector3(...info.n).normalize();
    let x = Math.abs(n.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(n).normalize();
    if (x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0);
    if (n.z < -0.9) x.set(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(n, x);
    return { o: info.c.slice(), x: x.toArray(), y: y.toArray(), n: n.toArray() };
  }
  // Skizze eines Körpers auf eine andere Ebene legen: Form und Maße bleiben, die Lage kommt von der neuen Ebene (SK-13)
  const BASE = { XY: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, XZ: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, YZ: { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] } };
  function replaneSketch(id, key) {
    let plane = null, name = '';
    if (key.startsWith('o:')) { plane = BASE[key.slice(2)]; name = { XY: 'Arbeitsfläche', XZ: 'Vorne', YZ: 'Seite' }[key.slice(2)]; }
    else if (key.startsWith('d:')) { const d = Datums.find(key.slice(2)); if (d && d.plane) { plane = d.plane; name = d.name; } }
    if (!plane) return false;
    let dropped = 0;
    App.change(`Skizze auf „${name}“`, (doc) => {
      const f = Model.find(doc, id); if (!f || !f.item.p || !f.item.p.sketch) return;
      const it = f.item; it.p.sketch.plane = deepClone(plane); it.t = Model.T0();
      if (key.startsWith('d:')) it.p.sketch.planeRef = { kind: 'datum', datumId: key.slice(2), name };
      else delete it.p.sketch.planeRef;
      for (const e of it.p.sketch.ents || []) if (e.link) { delete e.link; dropped++; }
    });
    UI.toast(`Die Skizze liegt jetzt auf „${name}“.` + (dropped ? ` ${dropped} übernommene Kanten hängen nicht mehr am Körper.` : ''), { icon: 'check' });
    return true;
  }
  function selectedFace() {
    const f = App.face; if (!f) return null;
    const r = App.results.get(f.id); if (!r) return null;
    const info = r.data.faces[f.faceIdx]; if (!info) return null;
    return { id: f.id, idx: f.faceIdx, info, point: f.point, normal: f.normal };
  }
  // Lage für ein Objekt, das auf eine Fläche gesetzt wird (lokale Z-Achse = Flächennormale)
  function onFaceTransform(targetId, pointWorld, normalWorld, opts = {}) {
    const W = Model.worldMatrix(App.doc, targetId), WI = W.clone().invert();
    const p = new THREE.Vector3(...pointWorld).applyMatrix4(WI);
    const n = new THREE.Vector3(...normalWorld).transformDirection(WI).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const g = App.doc.settings.snap === false || opts.exact ? 0 : (App.doc.settings.grid || 1);
    const sn = (v, k) => (!g || Math.abs(n.getComponent(k)) > 0.1 ? round(v, 4) : round(Math.round(v / g) * g, 4));
    const r = (a) => round((a * 180) / Math.PI, 4);
    return { targetId, t: { x: sn(p.x, 0), y: sn(p.y, 1), z: sn(p.z, 2), rx: r(e.x), ry: r(e.y), rz: r(e.z) } };
  }
  // Übergang (Loft) aus mehreren Skizzenkörpern: ihre Skizzen werden die Profile, in Auswahl-Reihenfolge
  function loft(ids, opts = {}) {
    ids = ids || App.sel.slice();
    const its = ids.map((id) => App.doc.items.find((x) => x.id === id)).filter(Boolean);
    const ok = its.filter((it) => it.kind === 'extrude' && it.p && it.p.sketch);
    if (ok.length < (opts.tip ? 1 : 2) || ok.length !== its.length) { UI.toast('Wähle mindestens zwei Skizzenkörper (z. B. zwei Umrisse auf verschiedenen Ebenen) – in der Reihenfolge, in der der Übergang laufen soll.', { icon: 'info', ms: 5000 }); return null; }
    const sketches = ok.map((it) => {
      const M = Model.localMatrix(it), sk = deepClone(it.p.sketch);
      const o = new THREE.Vector3(...sk.plane.o).applyMatrix4(M), x = new THREE.Vector3(...sk.plane.x).transformDirection(M), n = new THREE.Vector3(...sk.plane.n).transformDirection(M);
      sk.plane = { o: o.toArray().map((v) => round(v, 6)), x: x.toArray(), n: n.toArray() };
      return sk;
    });
    let nid = null;
    App.change('Übergang erstellt', (doc) => {
      const idx = Math.min(...ok.map((it) => doc.items.findIndex((x) => x.id === it.id)));
      const L = Model.newItem('loft', { sketches, ruled: false, tip: opts.tip || 0 }, { name: 'Übergang', color: ok[0].color });
      doc.items = doc.items.filter((x) => !ids.includes(x.id));
      doc.items.splice(Math.max(0, Math.min(idx, doc.items.length)), 0, L); nid = L.id;
    });
    if (nid) App.select([nid]);
    return nid;
  }
  // ---------- Verlauf umsortieren & Ordner (KP-10) ----------
  function reorder(srcIds, dstId, mode, opts = {}) {
    const ids = (Array.isArray(srcIds) ? srcIds : [srcIds]).filter(Boolean);
    if (!ids.length) return false;
    const v = Model.validateMove(App.doc, ids, dstId, mode, { boxOf: worldBox });
    if (!v.ok) {
      if (v.reason && !opts.quiet) UI.toast(v.reason, { kind: 'bad' });
      return false;
    }
    let changed = false;
    App.change('Verschoben im Verlauf', (doc) => {
      if (mode === 'into-folder') {
        const fld = (doc.folders || []).find((f) => f.id === dstId);
        if (!fld) return false;
        const rest = fld.ids.filter((id) => !ids.includes(id));
        const allAlready = ids.every((id) => fld.ids.includes(id));
        if (allAlready) return false;
        for (const f of doc.folders || []) f.ids = (f.ids || []).filter((id) => !ids.includes(id));
        if (rest.length) {
          const moving = ids.map((id) => doc.items.find((x) => x.id === id)).filter(Boolean);
          for (const it of moving) doc.items.splice(doc.items.indexOf(it), 1);
          const anchor = doc.items.findIndex((x) => x.id === rest[rest.length - 1]);
          doc.items.splice(anchor + 1, 0, ...moving);
        }
        fld.ids.push(...ids);
        Model.cleanFolders(doc);
        changed = true;
        return true;
      }
      const d = Model.find(doc, dstId);
      const srcs = ids.map((id) => Model.find(doc, id)).filter(Boolean);
      if (!d || !srcs.length) return false;
      const targetList = mode === 'into' ? d.item.children : d.list;
      const targetParent = mode === 'into' ? d.item : d.parent;
      const sameList = srcs.every((s) => s.list === targetList);
      const dstFld = !targetParent && !opts.outsideFolder && mode !== 'into' ? Model.folderOf(doc, dstId) : null;
      const srcFldSame = !targetParent && srcs.every((s) => Model.folderOf(doc, s.item.id) === dstFld);
      if (sameList && (opts.folderId || srcFldSame)) {
        const beforeOrder = targetList.map((x) => x.id).join(',');
        const sim = targetList.filter((x) => !ids.includes(x.id));
        const di = sim.findIndex((x) => x.id === dstId);
        const moving = targetList.filter((x) => ids.includes(x.id));
        sim.splice(mode === 'before' ? di : di + 1, 0, ...moving);
        if (sim.map((x) => x.id).join(',') === beforeOrder) return false;
      }
      const worlds = new Map(srcs.map((s) => [s.item.id, Model.worldMatrix(doc, s.item.id)]));
      const parentChanged = srcs.some((s) => s.parent !== targetParent);
      for (const s of srcs) {
        const i = s.list.indexOf(s.item);
        if (i >= 0) s.list.splice(i, 1);
      }
      if (mode === 'into') targetList.push(...srcs.map((s) => s.item));
      else {
        const di = targetList.indexOf(d.item);
        targetList.splice(mode === 'before' ? di : di + 1, 0, ...srcs.map((s) => s.item));
      }
      if (parentChanged) {
        const parentW = targetParent ? Model.worldMatrix(doc, targetParent.id) : new THREE.Matrix4();
        const inv = parentW.clone().invert();
        for (const s of srcs) Model.setFromMatrix(s.item, inv.clone().multiply(worlds.get(s.item.id)));
      }
      if (!opts.folderId) {
        for (const f of doc.folders || []) f.ids = (f.ids || []).filter((id) => !ids.includes(id));
        if (dstFld) dstFld.ids.push(...ids.filter((id) => doc.items.some((x) => x.id === id)));
      }
      cleanupGroups(doc);
      Model.cleanFolders(doc);
      changed = true;
      return true;
    });
    return changed;
  }
  function createFolder(ids, name) {
    const raw = ids || App.sel;
    const set = new Set(raw.map((id) => (Model.topOf(App.doc, id) || {}).id).filter(Boolean));
    const ordered = App.doc.items.filter((x) => set.has(x.id)).map((x) => x.id);
    if (ordered.length < 2) { UI.toast('Wähle mindestens zwei Schritte für einen Ordner (mit Umschalt klicken).', { icon: 'info' }); return null; }
    const idxs = ordered.map((id) => App.doc.items.findIndex((x) => x.id === id));
    const minIdx = Math.min(...idxs), maxIdx = Math.max(...idxs);
    let chosenOrder = null;
    if (maxIdx - minIdx + 1 !== ordered.length) {
      const rest = App.doc.items.map((x) => x.id).filter((id) => !set.has(id));
      const beforeTarget = App.doc.items[minIdx];
      const anchorA = App.doc.items.slice(minIdx).find((x) => !set.has(x.id));
      const candA = rest.slice();
      candA.splice(anchorA ? candA.indexOf(anchorA.id) : candA.length, 0, ...ordered);
      const anchorB = App.doc.items.slice(0, maxIdx).reverse().find((x) => !set.has(x.id));
      const candB = rest.slice();
      candB.splice(anchorB ? candB.indexOf(anchorB.id) + 1 : 0, 0, ...ordered);
      if (Model.validateTopOrder(App.doc, candA, { boxOf: worldBox }).ok) chosenOrder = candA;
      else if (Model.validateTopOrder(App.doc, candB, { boxOf: worldBox }).ok) chosenOrder = candB;
      else {
        UI.toast('Diese Schritte lassen sich nicht zusammen in einen Ordner legen – ein Schritt dazwischen hängt davon ab.', { kind: 'bad' });
        return null;
      }
    }
    const existingNames = new Set((App.doc.folders || []).map((f) => f.name));
    let n = 1; while (existingNames.has(`Ordner ${n}`)) n++;
    const fname = (name && name.trim()) || `Ordner ${n}`;
    let fid = null;
    App.change('In Ordner gelegt', (doc) => {
      if (chosenOrder) {
        const byId = new Map(doc.items.map((x) => [x.id, x]));
        doc.items = chosenOrder.map((id) => byId.get(id)).filter(Boolean);
      }
      doc.folders = doc.folders || [];
      for (const f of doc.folders) f.ids = (f.ids || []).filter((id) => !set.has(id));
      const fld = { id: uid('fld'), name: fname, ids: ordered.slice(), collapsed: false };
      doc.folders.push(fld);
      fid = fld.id;
      Model.cleanFolders(doc);
    });
    UI.toast(`Ordner „${fname}“ angelegt (${ordered.length} Schritte).`, { icon: 'folder' });
    return fid;
  }
  function toggleFolder(folderId, collapsed) {
    const fld = (App.doc.folders || []).find((f) => f.id === folderId);
    if (!fld) return null;
    fld.collapsed = collapsed != null ? !!collapsed : !fld.collapsed;
    if (typeof Panels !== 'undefined') Panels.renderLeft();
    App.autosave();
    return fld.collapsed;
  }
  function renameFolder(folderId, name) {
    if (!name || !name.trim()) return false;
    App.change('Ordner umbenannt', (doc) => {
      const f = (doc.folders || []).find((x) => x.id === folderId);
      if (!f) return false;
      f.name = name.trim();
    });
    return true;
  }
  function ungroupFolder(folderId) {
    const cur = (App.doc.folders || []).find((x) => x.id === folderId);
    if (!cur) return false;
    App.change('Ordner aufgelöst', (doc) => {
      doc.folders = (doc.folders || []).filter((x) => x.id !== folderId);
    });
    UI.toast('Ordner aufgelöst – alle Schritte bleiben erhalten.', { icon: 'folder' });
    return true;
  }
  function removeFromFolder(ids) {
    ids = (ids || App.sel).filter(Boolean);
    if (!ids.length) return false;
    const set = new Set(ids);
    App.change('Aus Ordner genommen', (doc) => {
      for (const f of doc.folders || []) {
        const hit = (f.ids || []).filter((id) => set.has(id));
        if (!hit.length) continue;
        const stay = f.ids.filter((id) => !set.has(id));
        f.ids = stay;
        if (stay.length) {
          const stayIdxs = stay.map((id) => doc.items.findIndex((x) => x.id === id)).filter((i) => i >= 0);
          const minS = Math.min(...stayIdxs), maxS = Math.max(...stayIdxs);
          const middle = hit.filter((id) => { const idx = doc.items.findIndex((x) => x.id === id); return idx > minS && idx < maxS; });
          if (middle.length) {
            const restIds = doc.items.map((x) => x.id).filter((id) => !middle.includes(id));
            const candAfter = restIds.slice();
            candAfter.splice(candAfter.indexOf(stay[stay.length - 1]) + 1, 0, ...middle);
            const candBefore = restIds.slice();
            candBefore.splice(candBefore.indexOf(stay[0]), 0, ...middle);
            const pick = Model.validateTopOrder(doc, candAfter, { boxOf: worldBox }).ok ? candAfter : Model.validateTopOrder(doc, candBefore, { boxOf: worldBox }).ok ? candBefore : null;
            if (pick) {
              const byId = new Map(doc.items.map((x) => [x.id, x]));
              doc.items = pick.map((id) => byId.get(id)).filter(Boolean);
            }
          }
        }
      }
      Model.cleanFolders(doc);
    });
    return true;
  }
  return { setBody, showOnlyBody, showAllBodies, reorder, createFolder, toggleFolder, renameFolder, ungroupFolder, removeFromFolder, replaneSketch, duplicateLinked, unlink, hideSelected, showAll, invertSelection, setOp, gapOf, setGap, loft, addPrimitive, addPart, addBuyPart, addUserPart, remove, duplicate, setRole, toggleRole, group, groupAll, ungroup, rotate90, rotate, center, mirror, dropToPlate, align, addFinish, finishAll, setFinish, removeFinish, edgeSigOf, faceFrame, selectedFace, onFaceTransform, attach, worldBox, selBox, cuttersOf, viewCenter };
})();

