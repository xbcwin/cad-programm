// ================= Bauteile: im Kontext bearbeiten, isolieren, neu anlegen =================
const Comp = (() => {
  let banner = null;
  function render() {
    if (banner) { banner.remove(); banner = null; }
    if (App.mode !== 'model') return;
    const ctx = App.ctx ? App.doc.items.find((x) => x.id === App.ctx) : null;
    const iso = App.iso ? App.doc.items.find((x) => x.id === App.iso) : null;
    if (!ctx && !iso) return;
    banner = h('div', { class: 'ctx-banner' + (ctx ? '' : ' iso'), role: 'status' });
    const ic = h('span'); ic.innerHTML = icon(ctx ? 'edit' : 'focusView');
    banner.append(ic, h('span', null, ctx ? `Bauteil bearbeiten: ${Model.label(ctx)}` : `Isoliert: ${Model.label(iso)}`));
    const b = h('button', { type: 'button' }, ctx ? 'Fertig' : 'Alle zeigen');
    b.onclick = () => (ctx ? App.setCtx(null) : App.setIso(null));
    banner.append(b);
    $('#overlay').append(banner);
  }
  function newComponent() {
    const n = App.doc.items.filter((x) => x.comp).length + 1;
    const it = Model.newItem('group', {}, { name: `Bauteil ${n}` }); it.comp = true; it.children = [];
    App.change(`Neues Bauteil: ${it.name}`, (doc) => { doc.items.push(it); });
    App.setCtx(it.id);
    UI.toast('Neues Bauteil angelegt. Alles, was du jetzt hinzufügst, landet darin.', { icon: 'parts', ms: 3200 });
  }
  function edit(id) { const it = App.doc.items.find((x) => x.id === id); if (it && it.kind === 'group') { App.setIso(null); App.setCtx(id); App.select([]); } }
  function toggleIso(id) { App.setIso(App.iso === id ? null : id); if (App.iso) Viewer.fit([id]); }
  function init() { App.on('ctx', render); App.on('mode', render); App.on('doc', debounce(render, 30)); }
  return { init, newComponent, edit, toggleIso, render };
})();

