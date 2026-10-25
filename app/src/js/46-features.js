// ================= Features: Muster, Spiegeln mit Kopie, Teilen, Schnittmenge, Wandstärke =================
// Muster, Spiegelung, Teilen und Schnittmenge sind Gruppen mit einer Rechenvorschrift (p.op).
// Die Gruppe sitzt im Ursprung ihrer Ebene (oberste Ebene oder die umgebende Gruppe), ihre Teile behalten
// ihre Lage. Der CAD-Kern rechnet die Vorschrift nach jeder Änderung neu – ändert man das Original,
// ziehen alle Kopien mit. So lässt sich auch ein Loch in einer Platte im Kreis vervielfachen.
const Features = (() => {
  const NAMES = { rect: 'Rechteckmuster', circ: 'Kreismuster', mirror: 'Spiegelung', split: 'Geteilt', intersect: 'Schnittmenge' };
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
  function wrap(items, name, p) {
    let G;
    App.change(name + ' angelegt', (doc) => {
      const list = Model.find(doc, items[0].id).list; const its = items.map((x) => list.find((y) => y.id === x.id)).filter(Boolean);
      const first = its.find((x) => x.role !== 'hole') || its[0];
      G = Model.newItem('group', {}, { name, color: first.color, role: its.every((x) => x.role === 'hole') ? 'hole' : 'solid' });
      G.p = { ...p };
      const at = Math.min(...its.map((x) => list.indexOf(x)));
      for (const it of its) { list.splice(list.indexOf(it), 1); G.children.push(it); }
      list.splice(at, 0, G);
    });
    App.select([G.id]);
    return G;
  }
  function pattern(type, ids) {
    const items = need(ids); if (!items.length) return null;
    const b = Actions.selBox(items.map((x) => x.id));
    const size = b.isEmpty() ? new THREE.Vector3(10, 10, 10) : b.getSize(new THREE.Vector3());
    let G;
    if (type === 'rect') G = wrap(items, NAMES.rect, { op: 'pattern', pt: 'rect', nx: 3, ny: 1, dx: round(size.x + 5, 1), dy: round(size.y + 5, 1) });
    else if (type === 'circ') G = wrap(items, NAMES.circ, { op: 'pattern', pt: 'circ', n: 4, ang: 360, cx: 0, cy: 0 });
    else G = wrap(items, NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'YZ', off: 0 });
    UI.toast(type === 'mirror' ? 'Gespiegelte Kopie angelegt. Rechts wählst du die Spiegelebene.' : 'Muster angelegt. Rechts stellst du Anzahl und Abstand ein – auch mit Formeln.', { icon: 'check' });
    return G;
  }
  // Gespiegelte Kopie an einer gewählten ebenen Fläche (z. B. zweiter Arm an der Mittelfläche)
  function mirrorAtFace(face) {
    const top = Model.topOf(App.doc, face.id); if (!top) return null;
    const W = Model.worldMatrix(App.doc, face.id);
    const o = new THREE.Vector3(...face.info.c).applyMatrix4(W), n = new THREE.Vector3(...face.info.n).transformDirection(W).normalize();
    const G = wrap([top], NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: 'FACE', mo: o.toArray().map((v) => round(v, 6)), mn: n.toArray().map((v) => round(v, 9)) });
    UI.toast('Gespiegelt an der Fläche – Original und Spiegelbild sind jetzt ein Körper.', { icon: 'check' });
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
  // Wandstärke: Körper aushöhlen, die gewählte Fläche wird zur Öffnung
  function shell(face) {
    const it = face && App.doc.items.find((x) => x.id === face.id);
    if (!it || it.role === 'hole') { UI.toast('Klick auf eine Fläche eines Körpers.', { icon: 'info' }); return; }
    const sig = { c: face.info.c.map((v) => round(v, 4)), n: face.info.n ? face.info.n.map((v) => round(v, 5)) : null };
    const ex = (it.finishes || []).find((f) => f.type === 'shell');
    App.change(ex ? 'Öffnung geändert' : 'Ausgehöhlt', (doc) => {
      const T = Model.find(doc, it.id).item; T.finishes = T.finishes || [];
      const s = T.finishes.find((f) => f.type === 'shell');
      if (!s) { T.finishes.push({ id: uid('f'), type: 'shell', r: 2, faces: [sig] }); return; }
      const i = s.faces.findIndex((f) => Math.hypot(f.c[0] - sig.c[0], f.c[1] - sig.c[1], f.c[2] - sig.c[2]) < 1e-3);
      if (i >= 0) { if (s.faces.length > 1) s.faces.splice(i, 1); } else s.faces.push(sig);
    });
    App.select([it.id]);
    UI.toast(ex ? 'Öffnung umgeschaltet. Jede Fläche, die du so anklickst, wird offen oder wieder zu.' : 'Ausgehöhlt mit 2 mm Wand. Rechts änderst du die Wandstärke.', { icon: 'check' });
  }
  // ---------- Rechte Leiste ----------
  function renderOp(it, sec, setP) {
    const p = it.p || {};
    const f = h('div', { class: 'fields' });
    const num = (k, label, unit = 'mm', o = {}) => UI.numField({ id: 'op-' + k, label, value: p[k], unit, int: o.int, min: o.min, onCommit: (v) => setP(k, v) });
    const sel = (k, label, opts) => UI.selectField({ id: 'op-' + k, label, value: p[k], options: opts, onChange: (v) => setP(k, v) });
    let hint = '';
    if (p.op === 'pattern' && p.pt === 'rect') { f.append(num('nx', 'Anzahl X', '', { int: true, min: 1 }), num('ny', 'Anzahl Y', '', { int: true, min: 1 }), num('dx', 'Abstand X'), num('dy', 'Abstand Y')); hint = 'Die Anzahl zählt das Original mit. Abstände gehen von Mitte zu Mitte.'; }
    else if (p.op === 'pattern' && p.pt === 'circ') { f.append(num('n', 'Anzahl', '', { int: true, min: 1 }), num('ang', 'Winkel', '°'), num('cx', 'Mitte X'), num('cy', 'Mitte Y')); hint = 'Gedreht wird um die senkrechte Achse durch die Mitte. 360° verteilt die Kopien rundherum.'; }
    else if (p.op === 'pattern' && p.pt === 'mirror' && p.plane === 'FACE') { hint = 'Gespiegelt an einer gewählten Fläche. Original und Spiegelbild sind ein Körper. Für eine andere Ebene: Rückgängig und neu spiegeln.'; }
    else if (p.op === 'pattern' && p.pt === 'mirror') { f.append(sel('plane', 'Spiegeln', [['YZ', 'Links ↔ rechts'], ['XZ', 'Vorne ↔ hinten'], ['XY', 'Oben ↔ unten']]), num('off', 'Lage der Ebene')); hint = 'Original und Spiegelbild werden ein Körper. Die Ebene geht durch den Nullpunkt, „Lage“ verschiebt sie.'; }
    else if (p.op === 'split') {
      const pl = p.plane || 'XY';
      const sides = { XY: ['Oben', 'Unten'], XZ: ['Hinten', 'Vorne'], YZ: ['Rechts', 'Links'] }[pl];
      f.append(sel('plane', 'Schnitt', [['XY', 'Waagerecht (XY)'], ['XZ', 'Von vorne (XZ)'], ['YZ', 'Von der Seite (YZ)']]), num('off', 'Lage der Ebene'), sel('keep', 'Behalten', [['both', 'Beide Hälften'], ['positive', sides[0]], ['negative', sides[1]]]), num('gap', 'Spalt'));
      hint = 'Mit „Spalt“ rücken die Hälften auseinander – praktisch zum Drucken in zwei Teilen.';
    } else if (p.op === 'intersect') hint = 'Übrig bleibt nur, was in allen Körpern dieser Gruppe zugleich liegt.';
    sec.append(f);
    if (hint) sec.append(h('div', { class: 'hint-box', html: hint }));
    const ub = h('button', { type: 'button', class: 'btn' }); ub.innerHTML = icon('ungroup') + (p.op === 'pattern' ? 'Auflösen (nur Original behalten)' : 'Auflösen');
    ub.onclick = () => Actions.ungroup(it.id);
    sec.append(h('div', { class: 'btn-row' }, ub));
  }
  // Text für Verlauf und Statuszeile
  function sizeText(it, V) {
    const p = Model.resolveP(it.p || {}, V || {});
    if (p.op === 'pattern' && p.pt === 'rect') return `${Math.max(1, Math.round(p.nx || 1))} × ${Math.max(1, Math.round(p.ny || 1))}`;
    if (p.op === 'pattern' && p.pt === 'circ') return `${Math.max(1, Math.round(p.n || 1))}× ${fmt(p.ang ?? 360, 0)}°`;
    if (p.op === 'pattern' && p.pt === 'mirror') return 'gespiegelt';
    if (p.op === 'split') return { both: 'beide Hälften', positive: 'eine Hälfte', negative: 'eine Hälfte' }[p.keep] || '';
    if (p.op === 'intersect') return 'Schnittmenge';
    return null;
  }
  const isOp = (it) => !!(it && it.kind === 'group' && it.p && it.p.op);
  return { mirrorAtFace, pattern, split, boolean, shell, renderOp, sizeText, isOp, NAMES };
})();
