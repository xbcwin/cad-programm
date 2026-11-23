// ================= Notizstift: freie Striche und Textnotizen ohne technische Bedeutung =================
// Notizen stehen in doc.notes, nicht in der Zeitleiste. Der CAD-Kern, der Export und die
// technische Zeichnung ignorieren sie. Striche kleben am Modell: auf einer Fläche gezeichnet,
// drehen sie sich mit; im leeren Raum landen sie auf einer unsichtbaren Folie quer zur Blickrichtung.
const Notes = (() => {
  const COLORS = [['#e03131', 'Rot'], ['#1c7ed6', 'Blau'], ['#2b8a3e', 'Grün'], ['#f08c00', 'Orange'], ['#212529', 'Schwarz'], ['#ffffff', 'Weiß']];
  const WIDTHS = [[2.5, 'Dünn'], [5, 'Mittel'], [9, 'Dick']];
  let on = false, tool = 'draw', color = COLORS[0][0], width = 5;
  let grp = null, labels = [], bar = null, cur = null;
  const notes = () => App.doc.notes || [];
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
    for (const n of notes()) {
      if (n.kind === 'stroke' && n.pts.length > 1) {
        const l = Viewer.makeFat(segs(n.pts), n.color, n.w, { order: 30 });
        l.userData.noteId = n.id; grp.add(l);
      } else if (n.kind === 'text') {
        const el = h('div', { class: 'note-label', dataset: { note: n.id } }, n.text); el.style.setProperty('--nc', n.color);
        el.addEventListener('pointerdown', (e) => { if (on && tool === 'erase') { e.stopPropagation(); e.preventDefault(); remove([n.id]); } });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); editText(n.id); });
        $('#overlay').append(el); labels.push(el);
      }
    }
    if (cur && cur.pts.length > 1) { const l = Viewer.makeFat(segs(cur.pts), cur.color, cur.w, { order: 31 }); grp.add(l); }
    place();
    Viewer.requestRender();
  }
  function place() {
    for (const el of labels) {
      const n = notes().find((x) => x.id === el.dataset.note); if (!n) continue;
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
      return { p: hit.point.clone().addScaledVector(hit.normal, off), onSurface: true };
    }
    if (!plane) return null;
    const p = Viewer.rayPlane(e.clientX, e.clientY, plane.o, plane.n);
    return p ? { p, onSurface: false } : null;
  }
  function viewPlane(through) {
    const cam = Viewer.activeCamera;
    const n = new THREE.Vector3(); cam.getWorldDirection(n);
    return { o: (through || Viewer.controls.target).clone(), n: n.negate() };
  }

  // ---------- Zeichnen, Radieren, Text ----------
  function onDown(e) {
    if (!on || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (tool === 'erase') { cur = { erase: true }; eraseAt(e); return; }
    if (tool === 'text') { addText(e); return; }
    const first = pointAt(e, viewPlane());
    if (!first) return;
    // Die Folie liegt dort, wo der Strich anfängt – so bleibt er auch neben dem Teil in passender Tiefe
    cur = { pts: [first.p.toArray().map((x) => round(x, 3))], color, w: width, plane: viewPlane(first.p), last: { x: e.clientX, y: e.clientY } };
    Viewer.canvas.setPointerCapture(e.pointerId);
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
    App.change(ids.length === 1 ? 'Notiz radiert' : ids.length + ' Notizen radiert', (doc) => { doc.notes = (doc.notes || []).filter((n) => !ids.includes(n.id)); });
  }
  async function clearAll() {
    if (!notes().length) return;
    const ok = await UI.confirm('Alle Notizen löschen?', 'Alle Striche und Textnotizen in diesem Projekt werden entfernt. Mit Rückgängig holst du sie zurück.', 'Alle löschen');
    if (ok) App.change('Alle Notizen gelöscht', (doc) => { doc.notes = []; });
  }

  // ---------- Leiste ----------
  const HINTS = {
    draw: '<b>Notizstift:</b> Einfach losmalen – auf einem Teil klebt der Strich an der Fläche. Ansicht drehen: <b>rechte Maustaste</b>. <b>Esc</b> beendet.',
    text: '<b>Textnotiz:</b> Klick dorthin, wo der Text stehen soll. Doppelklick auf eine Notiz ändert sie.',
    erase: '<b>Radierer:</b> Über Striche fahren oder Textnotizen anklicken.',
  };
  function showBar() {
    hideBar();
    bar = h('div', { class: 'sketchbar notesbar', role: 'toolbar', 'aria-label': 'Notizstift' });
    bar.append(h('span', { class: 'title' }, 'Notizen'));
    const tb = (id, ic, label, key) => { const b = h('button', { type: 'button', class: 'tool' + (tool === id ? ' active' : ''), 'data-tip': label, 'data-kbd': key, 'aria-label': label, dataset: { ntool: id } }); b.innerHTML = icon(ic); b.onclick = () => setTool(id); return b; };
    bar.append(tb('draw', 'noteDraw', 'Stift', 'P'), tb('text', 'noteText', 'Textnotiz', 'T'), tb('erase', 'noteErase', 'Radierer', 'E'));
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
    const del = h('button', { type: 'button', class: 'tool', 'data-tip': 'Alle Notizen löschen', 'aria-label': 'Alle Notizen löschen' }); del.innerHTML = icon('trash'); del.onclick = clearAll;
    const ok = h('button', { type: 'button', class: 'tool primary', 'data-tip': 'Notizstift beenden', 'data-kbd': 'Esc' }); ok.innerHTML = icon('check') + '<span>Fertig</span>'; ok.onclick = stop;
    bar.append(del, ok);
    $('#overlay').append(bar);
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function setTool(t) {
    tool = t; showBar(); UI.hint(HINTS[t]);
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
    if (k === 'e') { setTool('erase'); return true; }
    return true;   // andere Tasten nicht ans Modell weitergeben
  }
  function init() {
    const cv = Viewer.canvas;
    cv.addEventListener('pointerdown', (e) => { if (on) onDown(e); }, true);
    cv.addEventListener('pointermove', (e) => { if (on) onMove(e); });
    window.addEventListener('pointerup', () => { if (on) onUp(); });
    Viewer.on('camera', place);
    App.on('doc', debounce(render, 20));
    App.on('mode', () => { if (App.mode !== 'model' && on) stop(); render(); });
    ViewPrefs.on('change', () => render());
    render();
  }
  return { init, start, stop, toggle, onKey, render, get active() { return on; }, get count() { return notes().length; } };
})();
