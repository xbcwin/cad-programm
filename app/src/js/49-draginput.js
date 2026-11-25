// ================= Zahleneingabe beim Ziehen =================
// Während man zieht, einfach eine Zahl tippen (oder per Touch/Stift über die Schaltflächen bestätigen).
const DragInput = (() => {
  let el = null, spec = null, outsideHandler = null;
  function open(sp, firstChar, at) {
    close(); spec = sp;
    el = h('div', { class: 'drag-input', role: 'dialog', 'aria-label': 'Wert eingeben' });
    const inputs = sp.fields.map((f, i) => {
      const isLen = f.unit === 'mm';
      const inp = h('input', { type: 'text', value: i === 0 && firstChar != null ? firstChar : (isLen ? Units.fmtInput(f.value) : f.unit === '°' ? fmtFixed(f.value, Math.max(4, FMT.angle)) : fmtFixed(f.value, Math.max(4, FMT.dec))), 'aria-label': f.label, inputmode: 'decimal' });
      el.append(h('span', null, f.label), inp);
      const u = isLen ? Units.label() : f.unit;
      if (u) el.append(h('small', null, u));
      return inp;
    });
    const submit = () => {
      if (!spec) return;
      const V = Model.vars(App.doc).v;
      const vals = inputs.map((inp, i) => {
        const t = inp.value.trim();
        if (sp.fields[i].unit === 'mm') { const p = Units.parseLen(t, V, { expr: true }); return p.ok ? p.num : sp.fields[i].value; }
        const n = parseNum(t); return isNaN(n) ? Model.num(t, V, sp.fields[i].value) : n;
      });
      const s2 = spec; close(); s2.apply(vals);
    };
    const okBtn = h('button', { type: 'button', id: 'drag-input-ok', class: 'di-btn ok', 'aria-label': 'Übernehmen', title: 'Übernehmen' }, '✓');
    okBtn.onclick = () => submit();
    const cancelBtn = h('button', { type: 'button', id: 'drag-input-cancel', class: 'di-btn cancel', 'aria-label': 'Abbrechen', title: 'Abbrechen' }, '×');
    cancelBtn.onclick = () => close();
    el.append(okBtn, cancelBtn, h('small', null, '↵ übernehmen · Tab wechseln · Esc'));
    if (sp.hint) el.append(h('small', { class: 'di-hint' }, sp.hint));
    const r = $('#overlay').getBoundingClientRect();
    const px = at && Number.isFinite(at.x) ? at.x : r.left + r.width / 2;
    const py = at && Number.isFinite(at.y) ? at.y : r.top + r.height / 2;
    el.style.left = clamp(px - r.left + 14, 8, Math.max(8, r.width - 360)) + 'px';
    el.style.top = clamp(py - r.top - 54, 8, Math.max(8, r.height - 44)) + 'px';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    $('#overlay').append(el);
    const first = inputs[0]; first.focus(); if (firstChar == null) first.select(); else first.setSelectionRange(first.value.length, first.value.length);
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    outsideHandler = (e) => { if (el && !el.contains(e.target)) close(); };
    setTimeout(() => { if (el && outsideHandler) document.addEventListener('pointerdown', outsideHandler, true); }, 0);
  }
  function close() {
    if (outsideHandler) { document.removeEventListener('pointerdown', outsideHandler, true); outsideHandler = null; }
    if (el) { el.remove(); el = null; }
    spec = null;
  }
  return { open, close, get open_() { return !!el; } };
})();

