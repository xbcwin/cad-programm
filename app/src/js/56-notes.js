// ================= Notizstift & Kommentar-Pins (BE-28) =================
// Notizen stehen in doc.notes, nicht in der Zeitleiste. Der CAD-Kern, der Export und die
// technische Zeichnung ignorieren sie. Striche und Kommentar-Pins kleben am Modell: auf einer
// Fläche gesetzt, drehen sie sich mit; im leeren Raum landen sie auf einer Folie quer zur Blickrichtung.
const Notes = (() => {
  const COLORS = [['#e03131', 'Rot'], ['#1c7ed6', 'Blau'], ['#2b8a3e', 'Grün'], ['#f08c00', 'Orange'], ['#212529', 'Schwarz'], ['#ffffff', 'Weiß']];
  const WIDTHS = [[2.5, 'Dünn'], [5, 'Mittel'], [9, 'Dick']];
  let on = false, tool = 'draw', color = COLORS[0][0], width = 5;
  let grp = null, labels = [], bar = null, cur = null;
  let selPin = null, pinFilter = 'all', listModal = null, listRenderFn = null;
  const notes = () => App.doc.notes || [];
  const pins = () => notes().filter((n) => n && n.kind === 'pin');
  const findPin = (id) => pins().find((n) => n.id === id) || null;
  const visible = () => ViewPrefs.get().notes !== false;

  // ---------- Anzeige ----------
  function ensureGroup() { if (!grp) { grp = new THREE.Group(); grp.name = 'notes'; Viewer.scene.add(grp); } }
  function clear() {
    if (grp) for (const o of [...grp.children]) { grp.remove(o); Viewer.disposeFat(o); }
    for (const l of labels) l.remove(); labels = [];
  }
  function segs(pts) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) pos.push(...pts[i], ...pts[i + 1]);
    return pos;
  }
  function render() {
    ensureGroup(); clear();
    const show = visible() && App.mode === 'model';
    grp.visible = show;
    if (!show) { Viewer.requestRender(); return; }
    let pinIdx = 0;
    for (const n of notes()) {
      if (n.kind === 'stroke' && n.pts.length > 1) {
        const l = Viewer.makeFat(segs(n.pts), n.color, n.w, { order: 30 });
        l.userData.noteId = n.id; grp.add(l);
      } else if (n.kind === 'text') {
        const el = h('div', { class: 'note-label', dataset: { note: n.id } }, n.text); el.style.setProperty('--nc', n.color);
        el.addEventListener('pointerdown', (e) => { if (on && tool === 'erase') { e.stopPropagation(); e.preventDefault(); remove([n.id]); } });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); editText(n.id); });
        $('#overlay').append(el); labels.push(el);
      } else if (n.kind === 'pin') {
        pinIdx++;
        const col = n.color && n.color !== '#ffffff' ? n.color : '#f08c00';
        const el = h('button', {
          type: 'button',
          class: 'note-pin' + (n.done ? ' done' : '') + (n.id === selPin ? ' sel' : ''),
          dataset: { pin: n.id },
          'data-help': 'commentPins',
          'aria-label': `${T('panel.title.commentPin')} ${pinIdx}: ${n.text}`,
        });
        el.style.setProperty('--nc', col);
        el.append(
          h('span', { class: 'note-pin-dot' }, n.done ? '✓' : String(pinIdx)),
          h('span', { class: 'note-pin-text' }, n.text)
        );
        el.addEventListener('pointerdown', (e) => {
          if (on && tool === 'erase') { e.stopPropagation(); e.preventDefault(); remove([n.id]); }
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (on && tool === 'erase') return;
          selectPin(n.id);
          if (typeof Panels !== 'undefined' && Panels.getLayout && !Panels.getLayout().right.open) {
            openPinPop(el, n.id);
          }
        });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); editPin(n.id); });
        $('#overlay').append(el); labels.push(el);
      }
    }
    if (cur && cur.pts.length > 1) { const l = Viewer.makeFat(segs(cur.pts), cur.color, cur.w, { order: 31 }); grp.add(l); }
    place();
    Viewer.requestRender();
  }
  function place() {
    for (const el of labels) {
      const id = el.dataset.note || el.dataset.pin;
      const n = notes().find((x) => x.id === id); if (!n || !n.p) continue;
      const s = Viewer.toScreen(new THREE.Vector3(...n.p));
      el.style.display = s.behind ? 'none' : '';
      el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    }
  }

  // ---------- Punkt unter der Maus: auf einer Fläche oder auf der Folie ----------
  function pointAt(e, plane) {
    const hit = Viewer.pick(e.clientX, e.clientY, { noEdges: true });
    if (hit && hit.normal) {
      const off = Viewer.pixelSizeAt(hit.point) * 1.5;   // ein Hauch über der Fläche, damit nichts flackert
      return {
        p: hit.point.clone().addScaledVector(hit.normal, off),
        onSurface: true,
        n: hit.normal.toArray().map((x) => round(x, 4)),
      };
    }
    if (!plane) return null;
    const p = Viewer.rayPlane(e.clientX, e.clientY, plane.o, plane.n);
    return p ? { p, onSurface: false, n: null } : null;
  }
  function viewPlane(through) {
    const cam = Viewer.activeCamera;
    const n = new THREE.Vector3(); cam.getWorldDirection(n);
    return { o: (through || Viewer.controls.target).clone(), n: n.negate() };
  }

  // ---------- Zeichnen, Radieren, Text, Kommentar-Pins ----------
  function onDown(e) {
    if (!on || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (tool === 'erase') { cur = { erase: true }; eraseAt(e); return; }
    if (tool === 'text') { addText(e); return; }
    if (tool === 'pin') { promptAddPin(e); return; }
    const first = pointAt(e, viewPlane());
    if (!first) return;
    // Die Folie liegt dort, wo der Strich anfängt – so bleibt er auch neben dem Teil in passender Tiefe
    cur = { pts: [first.p.toArray().map((x) => round(x, 3))], color, w: width, plane: viewPlane(first.p), last: { x: e.clientX, y: e.clientY } };
    try { Viewer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    if (!on || !cur) return;
    if (cur.erase) { eraseAt(e); return; }
    if (Math.hypot(e.clientX - cur.last.x, e.clientY - cur.last.y) < 3) return;
    cur.last = { x: e.clientX, y: e.clientY };
    const q = pointAt(e, cur.plane); if (!q) return;
    cur.pts.push(q.p.toArray().map((x) => round(x, 3)));
    drawLive();
  }
  const drawLive = throttle(() => render(), 30);
  function onUp() {
    if (!on || !cur) return;
    const c = cur; cur = null;
    if (c.erase) { if (c.removed && c.removed.size) remove([...c.removed]); return; }
    if (c.pts.length < 2) { render(); return; }
    const n = { id: uid('n'), kind: 'stroke', color: c.color, w: c.w, pts: simplify(c.pts) };
    App.change('Notiz gezeichnet', (doc) => { doc.notes = doc.notes || []; doc.notes.push(n); });
  }
  // Punkte ausdünnen: fast gerade Stücke brauchen keine Zwischenpunkte
  function simplify(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], bc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const la = Math.hypot(...ab), lb = Math.hypot(...bc);
      if (la < 1e-6) continue;
      const cos = (ab[0] * bc[0] + ab[1] * bc[1] + ab[2] * bc[2]) / (la * lb || 1);
      if (cos < 0.995) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function eraseAt(e) {
    const r = Viewer.canvas.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    cur.removed = cur.removed || new Set();
    for (const n of notes()) {
      if (n.kind !== 'stroke' || cur.removed.has(n.id)) continue;
      const sp = n.pts.map((p) => Viewer.toScreen(new THREE.Vector3(...p)));
      for (let i = 0; i < sp.length - 1; i++) {
        if (sp[i].behind || sp[i + 1].behind) continue;
        if (distSeg2(mx, my, sp[i], sp[i + 1]) < 10 + n.w / 2) { cur.removed.add(n.id); break; }
      }
    }
    // sofort sichtbar machen, gespeichert wird beim Loslassen
    if (grp) for (const o of grp.children) if (o.userData.noteId && cur.removed.has(o.userData.noteId)) o.visible = false;
    Viewer.requestRender();
  }
  function distSeg2(x, y, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
    return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
  }
  async function addText(e) {
    const q = pointAt(e, viewPlane()); if (!q) return;
    const text = await UI.prompt('Textnotiz', 'Was soll hier stehen?', '', 'Hinzufügen');
    if (!text || !text.trim()) return;
    const n = { id: uid('n'), kind: 'text', color, text: text.trim().slice(0, 200), p: q.p.toArray().map((x) => round(x, 3)) };
    App.change('Textnotiz hinzugefügt', (doc) => { doc.notes = doc.notes || []; doc.notes.push(n); });
  }
  async function editText(id) {
    const n = notes().find((x) => x.id === id); if (!n) return;
    const text = await UI.prompt('Textnotiz ändern', 'Text', n.text, 'Übernehmen');
    if (text == null) return;
    if (!text.trim()) { remove([id]); return; }
    App.change('Textnotiz geändert', (doc) => { doc.notes.find((x) => x.id === id).text = text.trim().slice(0, 200); });
  }
  function remove(ids) {
    if (!ids.length) return;
    if (selPin && ids.includes(selPin)) selPin = null;
    App.change(ids.length === 1 ? 'Notiz radiert' : ids.length + ' Notizen radiert', (doc) => { doc.notes = (doc.notes || []).filter((n) => !ids.includes(n.id)); });
  }
  async function clearAll() {
    if (!notes().length) return;
    const ok = await UI.confirm('Alle Notizen löschen?', 'Alle Striche, Textnotizen und Kommentar-Pins in diesem Projekt werden entfernt. Mit Rückgängig holst du sie zurück.', 'Alle löschen');
    if (ok) { selPin = null; App.change('Alle Notizen gelöscht', (doc) => { doc.notes = []; }); }
  }

  // ---------- Kommentar-Pins (BE-28) ----------
  function addPin({ p, n = null, text, color: col, done = false }) {
    const clean = String(text || '').trim().slice(0, 400);
    if (!clean || !Array.isArray(p) || p.length < 3) return null;
    const pin = {
      id: uid('pin'),
      kind: 'pin',
      p: [round(p[0], 3), round(p[1], 3), round(p[2], 3)],
      n: Array.isArray(n) && n.length >= 3 ? [round(n[0], 4), round(n[1], 4), round(n[2], 4)] : null,
      text: clean,
      done: !!done,
      color: col && col !== '#ffffff' ? col : '#f08c00',
      createdAt: Date.now(),
    };
    selPin = pin.id;
    App.change(T('notes.pinAddedLog'), (doc) => {
      doc.notes = doc.notes || [];
      doc.notes.push(pin);
    });
    if (typeof Panels !== 'undefined') {
      Panels.renderLeft();
      Panels.renderRight();
    }
    return pin;
  }
  async function promptAddPin(e) {
    const q = pointAt(e, viewPlane()); if (!q) return null;
    const text = await UI.prompt(T('notes.pinAddTitle'), T('notes.pinTextLabel'), '', T('common.add'));
    if (!text || !text.trim()) return null;
    return addPin({ p: q.p.toArray(), n: q.n || null, text, color });
  }
  function updatePin(id, patch) {
    const curPin = findPin(id); if (!curPin) return false;
    const nextPatch = { ...(patch || {}) };
    if (typeof nextPatch.text === 'string') {
      nextPatch.text = nextPatch.text.trim().slice(0, 400);
      if (!nextPatch.text) { removePin(id); return true; }
    }
    App.change(T('notes.pinUpdatedLog'), (doc) => {
      const target = (doc.notes || []).find((x) => x.id === id && x.kind === 'pin');
      if (target) Object.assign(target, nextPatch);
    });
    return true;
  }
  function setPinDone(id, done) {
    const curPin = findPin(id); if (!curPin) return false;
    const nextDone = !!done;
    App.change(nextDone ? T('notes.pinDoneLog') : T('notes.pinReopenLog'), (doc) => {
      const target = (doc.notes || []).find((x) => x.id === id && x.kind === 'pin');
      if (target) target.done = nextDone;
    });
    return true;
  }
  async function editPin(id) {
    const curPin = findPin(id); if (!curPin) return;
    const text = await UI.prompt(T('notes.pinEditTitle'), T('notes.pinTextLabel'), curPin.text, T('common.save'));
    if (text == null) return;
    if (!text.trim()) { removePin(id); return; }
    updatePin(id, { text });
  }
  function removePin(id) {
    if (!findPin(id)) return false;
    if (selPin === id) selPin = null;
    App.change(T('notes.pinRemovedLog'), (doc) => {
      doc.notes = (doc.notes || []).filter((x) => x.id !== id);
    });
    return true;
  }
  function focusPin(id) {
    const pin = findPin(id); if (!pin || !pin.p) return false;
    if (!visible()) ViewPrefs.set({ notes: true });
    const t = new THREE.Vector3(...pin.p);
    const curDist = Viewer.camera.position.distanceTo(Viewer.controls.target);
    const d = clamp(isFinite(curDist) && curDist > 1 ? curDist : 90, 40, 180);
    let dir;
    if (Array.isArray(pin.n) && pin.n.length >= 3) {
      dir = new THREE.Vector3(...pin.n).add(new THREE.Vector3(0, 0, 0.28)).normalize();
    } else {
      dir = Viewer.camera.position.clone().sub(Viewer.controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(1, -1, 1);
      dir.normalize();
    }
    Viewer.moveCamera(t.clone().addScaledVector(dir, d), t);
    return true;
  }
  function selectPin(id) {
    selPin = id && findPin(id) ? id : null;
    if (selPin && App.sel.length) App.clearSelection();
    render();
    if (typeof Panels !== 'undefined') {
      Panels.renderLeft();
      Panels.renderRight();
    }
  }
  function openPinPop(anchor, id) {
    const pin = findPin(id); if (!pin || !anchor) return;
    const box = h('div', { class: 'pin-pop' });
    const chk = h('input', { type: 'checkbox', checked: !!pin.done });
    chk.onchange = () => { setPinDone(pin.id, chk.checked); UI.closePop(); };
    const head = h('label', { class: 'check pin-pop-head' }, chk, h('span', null, T('notes.pinDone')));
    const txt = h('div', { class: 'pin-pop-text' }, pin.text);
    const acts = h('div', { class: 'btn-row' });
    const bf = h('button', { type: 'button', class: 'btn small' }, T('notes.pinFocus'));
    bf.onclick = () => { UI.closePop(); focusPin(pin.id); };
    const be = h('button', { type: 'button', class: 'btn small' }, T('common.edit'));
    be.onclick = () => { UI.closePop(); editPin(pin.id); };
    const bd = h('button', { type: 'button', class: 'btn small ghost' });
    bd.innerHTML = icon('trash');
    bd.onclick = () => { UI.closePop(); removePin(pin.id); };
    acts.append(bf, be, bd);
    box.append(head, txt, acts);
    UI.pop(anchor, box);
  }
  function treeSection() {
    const list = pins(); if (!list.length) return null;
    const openCount = list.filter((p) => !p.done).length;
    const sec = h('div', { class: 'datum-tree pin-tree', id: 'pin-tree', 'data-help': 'commentPins' });
    const head = h('div', { class: 'section-h pin-sec-h' }, h('span', { class: 'grow' }, T('notes.pinTreeHead', { open: openCount, total: list.length })));
    const addB = h('button', { type: 'button', class: 'pin-sec-btn', id: 'pin-tree-add', 'data-tip': T('notes.pinAddBtn'), 'aria-label': T('notes.pinAddBtn') });
    addB.innerHTML = icon('plus');
    addB.onclick = (e) => { e.stopPropagation(); startPin(); };
    const listB = h('button', { type: 'button', class: 'pin-sec-btn', id: 'pin-tree-all', 'data-tip': T('notes.pinListBtn'), 'aria-label': T('notes.pinListBtn') });
    listB.innerHTML = icon('list');
    listB.onclick = (e) => { e.stopPropagation(); pinsDialog(); };
    head.append(addB, listB);
    sec.append(head);
    list.forEach((pin, idx) => {
      const col = pin.color && pin.color !== '#ffffff' ? pin.color : '#f08c00';
      const row = h('div', {
        class: 'tree-row pin-row' + (pin.id === selPin ? ' sel' : '') + (pin.done ? ' done' : ''),
        dataset: { pinRow: pin.id },
      });
      const cb = h('input', { type: 'checkbox', class: 'pin-check', checked: !!pin.done, dataset: { pinDone: pin.id }, 'aria-label': T('notes.pinDone') });
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => setPinDone(pin.id, cb.checked));
      const badge = h('span', { class: 'pin-num', style: { background: col } }, pin.done ? '✓' : String(idx + 1));
      const nm = h('span', { class: 'nm', title: pin.text }, pin.text);
      const acts = h('span', { class: 'm-acts' });
      const bf = h('button', { type: 'button', 'aria-label': T('notes.pinFocus'), 'data-tip': T('notes.pinFocus') });
      bf.innerHTML = icon('target');
      bf.onclick = (e) => { e.stopPropagation(); selectPin(pin.id); focusPin(pin.id); };
      const be = h('button', { type: 'button', 'aria-label': T('common.edit'), 'data-tip': T('common.edit') });
      be.innerHTML = icon('edit');
      be.onclick = (e) => { e.stopPropagation(); editPin(pin.id); };
      const bd = h('button', { type: 'button', 'aria-label': T('common.delete'), 'data-tip': T('common.delete') });
      bd.innerHTML = icon('trash');
      bd.onclick = (e) => { e.stopPropagation(); removePin(pin.id); };
      acts.append(bf, be, bd);
      row.append(cb, badge, nm, acts);
      row.onclick = () => { selectPin(pin.id); focusPin(pin.id); };
      sec.append(row);
    });
    return sec;
  }
  function renderPanel(body) {
    const pin = findPin(selPin); if (!pin) return false;
    const idx = pins().findIndex((x) => x.id === pin.id) + 1;
    const w = h('div', { class: 'props', id: 'pin-inspector' });
    const ta = h('textarea', {
      id: 'pin-edit-text',
      rows: 3,
      class: 'pin-textarea',
      'aria-label': T('notes.pinTextLabel'),
      value: pin.text,
    });
    ta.value = pin.text;
    let orig = pin.text;
    const commit = () => {
      const next = ta.value.trim();
      if (!next || next === orig) { ta.value = orig; return; }
      orig = next;
      updatePin(pin.id, { text: next });
    };
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { commit(); ta.blur(); }
      if (e.key === 'Escape') { ta.value = orig; ta.blur(); }
    });
    ta.addEventListener('change', commit);
    ta.addEventListener('blur', commit);
    w.append(
      h('div', { class: 'mini-row' },
        h('span', { class: 'pin-num', style: { background: pin.color || '#f08c00' } }, pin.done ? '✓' : String(idx)),
        h('span', { class: 'grow', style: { fontWeight: '600' } }, `${T('panel.title.commentPin')} #${idx}`)),
      h('div', { class: 'field' }, h('label', { for: 'pin-edit-text' }, T('notes.pinTextLabel')), ta)
    );
    const doneChk = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'pin-edit-done', checked: !!pin.done }), T('notes.pinDone'));
    doneChk.querySelector('input').onchange = (e) => setPinDone(pin.id, e.target.checked);
    w.append(doneChk);
    const colRow = h('div', { class: 'pin-colors' });
    for (const [c, name] of COLORS) {
      if (c === '#ffffff') continue;
      const b = h('button', {
        type: 'button',
        class: 'pin-col-btn' + (c === (pin.color || '#f08c00') ? ' active' : ''),
        style: { background: c },
        'data-tip': name,
        'aria-label': name,
      });
      b.onclick = () => updatePin(pin.id, { color: c });
      colRow.append(b);
    }
    w.append(colRow);
    const coordTxt = pin.p.map((v) => Units.fmtLen(v, 1)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '');
    w.append(h('div', { class: 'mini-list' },
      h('div', { class: 'mini-row' }, h('span', { class: 'grow' }, T('notes.pinCoords')), h('b', { class: 'mono' }, coordTxt))));
    const row = h('div', { class: 'btn-row' });
    const bf = h('button', { type: 'button', class: 'btn primary', id: 'pin-focus' });
    bf.innerHTML = icon('target') + esc(T('notes.pinFocus'));
    bf.onclick = () => focusPin(pin.id);
    const bl = h('button', { type: 'button', class: 'btn', id: 'pin-open-list' });
    bl.innerHTML = icon('list') + esc(T('notes.pinListBtn'));
    bl.onclick = () => pinsDialog();
    const bd = h('button', { type: 'button', class: 'btn ghost', id: 'pin-delete' });
    bd.innerHTML = icon('trash') + esc(T('common.delete'));
    bd.onclick = () => removePin(pin.id);
    row.append(bf, bl, bd);
    w.append(row);
    body.append(w);
    return true;
  }
  function pinsDialog() {
    if (listModal) { try { listModal.close(); } catch (_) {} }
    const wrap = h('div', { class: 'pins-dlg', id: 'pins-dialog' });
    const drawList = () => {
      wrap.innerHTML = '';
      const all = pins();
      const openCnt = all.filter((p) => !p.done).length;
      const doneCnt = all.length - openCnt;
      const barRow = h('div', { class: 'pins-dlg-bar' });
      const seg = h('div', { class: 'seg', role: 'group' });
      for (const [k, lbl] of [['all', `${T('notes.pinAll')} (${all.length})`], ['open', `${T('notes.pinOpen')} (${openCnt})`], ['done', `${T('notes.pinDone')} (${doneCnt})`]]) {
        const b = h('button', { type: 'button', dataset: { pinFilter: k }, 'aria-pressed': String(pinFilter === k) }, lbl);
        b.onclick = () => { pinFilter = k; drawList(); };
        seg.append(b);
      }
      const addBtn = h('button', { type: 'button', class: 'btn small primary', id: 'pins-dlg-add' });
      addBtn.innerHTML = icon('commentPin') + esc(T('notes.pinAddBtn'));
      addBtn.onclick = () => { listModal && listModal.close(); startPin(); };
      barRow.append(seg, addBtn);
      wrap.append(barRow);

      const shown = all.filter((p) => pinFilter === 'all' ? true : pinFilter === 'open' ? !p.done : !!p.done);
      if (!shown.length) {
        wrap.append(h('div', { class: 'hint-box' }, T('notes.pinEmpty')));
        return;
      }
      const listEl = h('div', { class: 'pins-dlg-list' });
      for (const pin of shown) {
        const idx = all.findIndex((x) => x.id === pin.id) + 1;
        const col = pin.color && pin.color !== '#ffffff' ? pin.color : '#f08c00';
        const card = h('div', { class: 'pin-card' + (pin.done ? ' done' : '') + (pin.id === selPin ? ' sel' : ''), dataset: { pinCard: pin.id } });
        const cb = h('input', { type: 'checkbox', checked: !!pin.done, dataset: { pinDlgDone: pin.id }, 'aria-label': T('notes.pinDone') });
        cb.onchange = () => setPinDone(pin.id, cb.checked);
        const badge = h('span', { class: 'pin-num', style: { background: col } }, pin.done ? '✓' : String(idx));
        const coordTxt = pin.p.map((v) => Units.fmtLen(v, 1)).join(' · ') + (Units.key() !== 'mm' ? ' ' + Units.label() : '');
        const main = h('div', { class: 'pin-card-main' },
          h('div', { class: 'pin-card-text' }, pin.text),
          h('div', { class: 'pin-card-meta mono' }, coordTxt));
        const acts = h('div', { class: 'pin-card-acts' });
        const bf = h('button', { type: 'button', class: 'btn small', dataset: { pinFocus: pin.id } }, T('notes.pinFocus'));
        bf.onclick = () => { listModal && listModal.close(); selectPin(pin.id); focusPin(pin.id); };
        const be = h('button', { type: 'button', class: 'btn small', dataset: { pinEdit: pin.id } });
        be.innerHTML = icon('edit');
        be.onclick = () => editPin(pin.id);
        const bd = h('button', { type: 'button', class: 'btn small ghost', dataset: { pinDel: pin.id } });
        bd.innerHTML = icon('trash');
        bd.onclick = () => removePin(pin.id);
        acts.append(bf, be, bd);
        card.append(cb, badge, main, acts);
        listEl.append(card);
      }
      wrap.append(listEl);
    };
    listRenderFn = drawList;
    drawList();
    listModal = UI.modal({
      title: T('notes.pinListTitle'),
      body: wrap,
      wide: true,
      actions: [{ label: T('common.close'), primary: true }],
      onClose: () => { listModal = null; listRenderFn = null; },
    });
    return listModal;
  }

  // ---------- Leiste ----------
  const HINTS = {
    draw: '<b>Notizstift:</b> Einfach losmalen – auf einem Teil klebt der Strich an der Fläche. Ansicht drehen: <b>rechte Maustaste</b>. <b>Esc</b> beendet.',
    text: '<b>Textnotiz:</b> Klick dorthin, wo der Text stehen soll. Doppelklick auf eine Notiz ändert sie.',
    pin: () => T('notes.pinHint'),
    erase: '<b>Radierer:</b> Über Striche fahren oder Textnotizen bzw. Pins anklicken.',
  };
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar notesbar', role: 'toolbar', 'aria-label': 'Notizstift' });
    bar.append(h('span', { class: 'title' }, 'Notizen'));
    const tb = (id, ic, label, key, help) => { const b = h('button', { type: 'button', class: 'tool' + (tool === id ? ' active' : ''), 'data-tip': label, 'data-kbd': key, 'data-help': help || null, 'aria-label': label, dataset: { ntool: id } }); b.innerHTML = icon(ic); b.onclick = () => setTool(id); return b; };
    bar.append(tb('draw', 'noteDraw', 'Stift', 'P'), tb('text', 'noteText', 'Textnotiz', 'T'), tb('pin', 'commentPin', T('notes.pinTool'), 'C', 'commentPins'), tb('erase', 'noteErase', 'Radierer', 'E'));
    bar.append(h('span', { class: 'vsep' }));
    for (const [c, name] of COLORS) {
      const b = h('button', { type: 'button', class: 'swatch' + (c === color ? ' active' : ''), 'data-tip': name, 'aria-label': 'Farbe ' + name }); b.style.setProperty('--sw', c);
      b.onclick = () => { color = c; if (tool === 'erase') setTool('draw'); else showBar(); };
      bar.append(b);
    }
    bar.append(h('span', { class: 'vsep' }));
    for (const [wd, name] of WIDTHS) {
      const b = h('button', { type: 'button', class: 'tool widthbtn' + (wd === width ? ' active' : ''), 'data-tip': name, 'aria-label': 'Strichstärke ' + name });
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="${wd * 0.55 + 0.6}" stroke-linecap="round"/></svg>`;
      b.onclick = () => { width = wd; showBar(); };
      bar.append(b);
    }
    bar.append(h('span', { class: 'vsep' }));
    const pinListBtn = h('button', { type: 'button', class: 'tool', id: 'nt-pin-list', 'data-tip': T('notes.pinListBtn'), 'data-help': 'commentPins', 'aria-label': T('notes.pinListBtn') });
    const pinCnt = pins().length;
    pinListBtn.innerHTML = icon('list') + (pinCnt ? `<span>${pinCnt}</span>` : '');
    pinListBtn.onclick = () => pinsDialog();
    const del = h('button', { type: 'button', class: 'tool', 'data-tip': 'Alle Notizen löschen', 'aria-label': 'Alle Notizen löschen' }); del.innerHTML = icon('trash'); del.onclick = clearAll;
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-tip': 'Notizstift beenden', 'data-kbd': 'Esc' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = stop;
    bar.append(pinListBtn, del, ok);
    $('#overlay').append(bar);
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function setTool(t) {
    tool = t; showBar();
    const hintVal = typeof HINTS[t] === 'function' ? HINTS[t]() : HINTS[t];
    UI.hint(hintVal);
    Viewer.canvas.style.cursor = t === 'text' ? 'text' : t === 'erase' ? 'cell' : 'crosshair';
  }

  // ---------- Ein / Aus ----------
  function start() {
    Views.collapse();
    if (on) return;
    if (Sketch.active) Sketch.cancel(true);
    if (Measure.active) Measure.stop();
    if (App.mode !== 'model') Commands.setMode('model');
    on = true;
    if (!visible()) ViewPrefs.set({ notes: true });
    App.clearSelection(); Handles.clear(); Panels.closeFlyout();
    Viewer.useButtons('place');
    $('#t-notes') && $('#t-notes').classList.add('active');
    setTool(tool); render();
  }
  function startPin() {
    tool = 'pin';
    if (on) setTool('pin');
    else start();
  }
  function stop() {
    if (!on) return;
    on = false; cur = null; hideBar();
    Viewer.useButtons('model');
    $('#t-notes') && $('#t-notes').classList.remove('active');
    Viewer.canvas.style.cursor = ''; UI.hint(null); Handles.rebuild(); render();
  }
  function toggle() { on ? stop() : start(); }
  function onKey(e) {
    if (!on) return false;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    if ((e.ctrlKey || e.metaKey)) return false;   // Rückgängig usw. normal weiter
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' || k === 'n') { stop(); return true; }
    if (k === 'p') { setTool('draw'); return true; }
    if (k === 't') { setTool('text'); return true; }
    if (k === 'c') { setTool('pin'); return true; }
    if (k === 'e') { setTool('erase'); return true; }
    return true;   // andere Tasten nicht ans Modell weitergeben
  }
  function init() {
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', (e) => { if (on) onDown(e); }, true);
    cv.addEventListener('pointermove', (e) => { if (on) onMove(e); });
    window.addEventListener('pointerup', () => { if (on) onUp(); });
    Viewer.on('camera', place);
    App.on('selection', () => { if (App.sel.length && selPin) { selPin = null; render(); } });
    App.on('docLoaded', () => { selPin = null; render(); });
    App.on('doc', debounce(() => { render(); if (listRenderFn) listRenderFn(); if (on && bar) showBar(); }, 20));
    App.on('mode', () => { if (App.mode !== 'model' && on) stop(); render(); });
    ViewPrefs.on('change', () => render());
    render();
  }
  return {
    init, start, startPin, stop, toggle, onKey, render, place,
    pins, findPin, addPin, updatePin, setPinDone, editPin, removePin, selectPin, focusPin, pinsDialog, treeSection, renderPanel,
    get selectedPin() { return selPin; },
    get active() { return on; },
    get count() { return notes().length; },
  };
})();
