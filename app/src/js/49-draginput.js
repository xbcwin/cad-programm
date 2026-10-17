// ================= Zahleneingabe beim Ziehen =================
// Während man zieht, einfach eine Zahl tippen: Eingabefeld erscheint, Enter übernimmt den exakten Wert.
const DragInput = (() => {
  let el = null, spec = null;
  function open(sp, firstChar, at) {
    close(); spec = sp;
    el = h('div', { class: 'drag-input', role: 'dialog', 'aria-label': 'Wert eingeben' });
    const inputs = sp.fields.map((f, i) => {
      const inp = h('input', { type: 'text', value: i === 0 && firstChar != null ? firstChar : fmt(f.value, 3), 'aria-label': f.label, inputmode: 'decimal' });
      el.append(h('span', null, f.label), inp); if (f.unit) el.append(h('small', null, f.unit));
      return inp;
    });
    el.append(h('small', null, '↵ übernehmen · Tab wechseln · Esc'));
    const r = $('#overlay').getBoundingClientRect();
    el.style.left = clamp(at.x - r.left + 14, 8, r.width - 340) + 'px'; el.style.top = clamp(at.y - r.top - 54, 8, r.height - 40) + 'px';
    $('#overlay').append(el);
    const first = inputs[0]; first.focus(); if (firstChar == null) first.select(); else first.setSelectionRange(first.value.length, first.value.length);
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const V = Model.vars(App.doc).v;
        const vals = inputs.map((inp, i) => { const t = inp.value.trim(); const n = parseNum(t); return isNaN(n) ? Model.num(t, V, sp.fields[i].value) : n; });
        const s2 = spec; close(); s2.apply(vals);
      }
    });
  }
  function close() { if (el) { el.remove(); el = null; } spec = null; }
  return { open, close, get open_() { return !!el; } };
})();

