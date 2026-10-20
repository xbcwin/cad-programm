// ================= KI-Helfer (baut und ändert Modelle aus einer Beschreibung) =================
const AI = (() => {
  let panel = null, ctl = null, history = [], off = false;
  const ACTIONS = `Aktionen:
{"op":"hinzufuegen","objekt":OBJEKT,"in":"<id einer Gruppe, optional>"}
{"op":"aendern","id":"<id>","setze":{"name":"…","rolle":"koerper"|"loch","p":{…},"t":{…},"farbe":"#RRGGBB"}}
{"op":"loeschen","id":"<id>"}
{"op":"gruppieren","ids":["<id>","<id>"],"name":"…"}
{"op":"mass","name":"Breite","wert":"75"}   (legt ein benanntes Maß an oder ändert es)
{"op":"rundung","id":"<id>","typ":"fillet"|"chamfer","r":2,"kanten":"all"|"top"|"bottom"|"vertical"|"horizontal"}
{"op":"muster","id":"<id>","art":"kreis","n":4,"winkel":360,"mitte":[0,0]}   (Kreismuster um die senkrechte Achse durch „mitte“, Anzahl zählt das Original mit)
{"op":"muster","id":"<id>","art":"rechteck","nx":3,"ny":1,"dx":20,"dy":0}   (Rechteckmuster, Abstände von Mitte zu Mitte)
{"op":"spiegeln","id":"<id>","ebene":"YZ"|"XZ"|"XY","lage":0}   (Original plus Spiegelbild; YZ = links↔rechts, XZ = vorne↔hinten, XY = oben↔unten)
{"op":"material","id":"<id>","material":"<Kürzel aus MATERIALIEN>"}
{"op":"gewicht","id":"<id>","g":33.8}   (Kaufteil mit festem Gewicht aus dem Datenblatt)
{"op":"kaufteil","name":"<Name aus KAUFTEILE>","t":{"x":0,"y":0,"z":0}}   (Kaufteil in echter Form mit Maßen und Gewicht aus der Bibliothek)
{"op":"drohne","zoll":5,"form":"x"|"stretch"|"wide"|"deadcat","video":"analog"|"o3"|"o4"|"o4pro"|"walksnail"|"hdzero"|"none","motor":"2207","akku":"6S 1300 mAh"}   (baut mit dem Frame-Assistenten einen kompletten Rahmen als NEUES Projekt; nur wenn ausdrücklich ein neuer Rahmen gewünscht ist)
{"op":"pruefen"}   (führt danach den Drohnen-Check aus: Propeller, Teile, Gewicht, Schwerpunkt, Schub)

OBJEKT:
{"art":"box|cylinder|tube|sphere|hemisphere|cone|pyramid|torus|prism|wedge|extrude|part|group","name":"…","rolle":"koerper"|"loch","p":{…},"t":{"x":0,"y":0,"z":0,"rx":0,"ry":0,"rz":0},"farbe":"#RRGGBB","kinder":[OBJEKT…],"rundungen":[{"typ":"fillet","r":2,"kanten":"vertical"}]}

Parameter p (alle Grundkörper stehen mit der Unterseite auf z=0 ihres eigenen Systems und sind in X/Y zentriert; t verschiebt/dreht, Drehung in Grad um X, dann Y, dann Z):
- box: w (Breite X), d (Tiefe Y), h (Höhe Z)
- cylinder: d, h · tube: d (außen), wall, h · sphere: d · hemisphere: d · cone: d1 (unten), d2 (oben, 0 = Spitze), h
- pyramid: w, d, h · torus: d (außen), t (Ringdicke) · prism: n (Ecken), d (Umkreis), h · wedge: w, d, h (die Schräge fällt zur +X-Seite ab)
- extrude: {"ebene":"XY"|"XZ"|"YZ","versatz":0,"hoehe":10,"richtung":"normal"|"reverse"|"both","form":[ELEMENT…]}
  ELEMENT (2D in mm): {"rect":[x1,y1,x2,y2]} · {"circle":[cx,cy,r]} · {"poly":[[x,y],[x,y],…]} (geschlossener Linienzug) · {"slot":[x1,y1,x2,y2,r]}
  Ebene XY: u=X, v=Y, hoch in +Z. Ebene XZ: u=X, v=Z, hoch in −Y. Ebene YZ: u=Y, v=Z, hoch in +X. „versatz“ verschiebt die Ebene entlang dieser Richtung. Formen, die ganz in einer anderen liegen, werden zu Löchern darin.
- part (Bauteile, Öffnung zeigt nach +Z, Tiefe geht nach −Z; setze z auf die Oberfläche):
  {"lib":"screwHole","size":"M2|M2.5|M3|M4|M5|M6|M8","head":"countersunk|counterbore|none","length":10} (rolle loch)
  {"lib":"nutTrap","size":"M3","length":12} (loch) · {"lib":"insert","size":"M3"} (loch, Gewindeeinsatz) · {"lib":"slotHole","len":20,"w":4.5,"depth":10} (loch)
  {"lib":"holePattern","pat":"stack305|stack255|stack20|stack16|motor19|motor16|motor12|motor9","size":"M3","depth":10} (loch, vier Löcher für Stack oder Motor um die Mitte) · {"lib":"zipTie","w":3,"gap":6,"depth":10} (loch, zwei Kabelbinder-Schlitze)
  {"lib":"snapHook","length":12,"w":8,"t":1.6,"hook":1.2} (koerper) · {"lib":"hinge","len":40,"w":15,"t":2.4,"gap":0.4} (koerper) · {"lib":"gear","teeth":20,"module":1.5,"h":6,"bore":5} (koerper)
- group: {"kinder":[…]} – Kinder mit rolle "loch" werden aus den Kindern mit rolle "koerper" geschnitten. t der Kinder ist relativ zur Gruppe.

Regeln:
- Löcher auf oberster Ebene schneiden automatisch alle Körper, die sie berühren. Ein Teil mit Löchern baust du am saubersten als group.
- Löcher sollen 0,5 mm über die Oberfläche hinausragen, damit sie sauber schneiden.
- Lege Teile auf z=0, sofern nichts anderes gewünscht ist. Maße exakt übernehmen, nicht runden. Für Schrauben nimm part screwHole.
- Zahlenwerte dürfen Formeln mit Maß-Namen sein, z. B. "Breite/2+3". Lege bei neuen Teilen für die 2–4 wichtigsten Größen Maße an (op "mass") und nutze sie.
- Neue Teile nicht in bestehende hineinsetzen: stelle sie daneben, außer der Wunsch ist ausdrücklich eine Änderung am Bestehenden.
- Bei einer reinen Frage: "aktionen": [].
- Jede Aktion wird ein eigener, markierter Schritt in der Zeitleiste – baue lieber wenige saubere Schritte als viele kleine.
- Bei Drohnen (siehe "drohne" im Modell) änderst du Größen am besten über die Maße (op "mass"), z. B. Achsabstand, Armdicke, Bolzenhöhe – dann wandert alles mit. Vorne ist −Y.
- Beziehe dich mit "id" nur auf ids, die im aktuellen Modell stehen. „das“, „es“, „hier“ meint die Auswahl.
`;
  const RULES = `Du bist der CAD-Helfer in der Web-App „Tracery“. Du baust präzise technische 3D-Modelle, vor allem für FPV-/Speed-Drohnen, aus Grundkörpern, Skizzen und Bauteilen. Einheiten: Millimeter. Z zeigt nach oben, die XY-Ebene bei z=0 ist die Grundebene.

Antworte NUR mit einem JSON-Objekt:
{"antwort": "kurze Antwort auf Deutsch, 1–3 Sätze, per du", "aktionen": [ ... ]}

` + ACTIONS + `
Beispiel – Wunsch „Platte 60 × 40 × 4 mit einem Loch in der Mitte“:
{"antwort":"Ich habe dir eine Platte mit einem 5-mm-Loch gebaut. Die Breite kannst du links bei den Maßen ändern.","aktionen":[{"op":"mass","name":"Breite","wert":"60"},{"op":"hinzufuegen","objekt":{"art":"group","name":"Platte","kinder":[{"art":"box","name":"Platte","p":{"w":"Breite","d":40,"h":4}},{"art":"cylinder","name":"Loch","rolle":"loch","p":{"d":5,"h":5},"t":{"z":-0.5}}],"rundungen":[{"typ":"fillet","r":3,"kanten":"vertical"}]}}]}`;
  const KMAP = { box: 1, cylinder: 1, tube: 1, sphere: 1, hemisphere: 1, cone: 1, pyramid: 1, torus: 1, prism: 1, wedge: 1, extrude: 1, part: 1, group: 1 };
  function compactItem(it) {
    const o = { id: it.id, art: it.kind, name: it.name, rolle: it.role === 'hole' ? 'loch' : 'koerper' };
    if (it.kind === 'extrude' || it.kind === 'revolve') { o.p = { hoehe: it.p.dist, richtung: it.p.dir || 'normal', skizze: (it.p.sketch && it.p.sketch.ents.length) + ' Elemente' }; }
    else if (it.kind !== 'group') o.p = it.p;
    const t = it.t; if (t && (t.x || t.y || t.z || t.rx || t.ry || t.rz)) o.t = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
    if (it.finishes && it.finishes.length) o.rundungen = it.finishes.map((f) => ({ typ: f.type, r: f.r, kanten: typeof f.edges === 'string' ? f.edges : (f.edges || []).length + ' einzelne' }));
    if (it.children) o.kinder = it.children.map(compactItem);
    if (it.hidden) o.ausgeblendet = true;
    return o;
  }
  function modelText() {
    const st = Print.stats();
    const obj = {
      projekt: App.doc.name,
      masse: (App.doc.params || []).map((p) => ({ name: p.name, wert: p.expr })),
      objekte: App.doc.items.map(compactItem),
      gesamtgroesse: st ? { x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2), min: st.box.min.toArray().map((v) => +v.toFixed(2)), max: st.box.max.toArray().map((v) => +v.toFixed(2)) } : null,
      auswahl: App.sel,
    };
    if (App.doc.drone) {
      const chk = DroneCheck.summary();
      obj.drohne = { ...App.doc.drone, check: chk ? chk.map((c) => `${c.title}: ${c.s} – ${c.text}`) : 'noch nicht geprüft' };
    }
    obj.materialien = MATERIALS.map((m) => m.k);
    obj.kaufteile = buyNames();
    let s = JSON.stringify(obj);
    if (s.length > 40000) s = s.slice(0, 40000) + '…';
    return s;
  }
  function buyNames() { try { return DroneLib.CATS.filter((c) => c[0] !== 'loch').flatMap((c) => DroneLib.buyParts(c[0]).map((b) => b.name)); } catch (_) { return []; } }
  function buySpec(name) {
    const n = String(name || '').toLowerCase();
    for (const c of DroneLib.CATS) { if (c[0] === 'loch') continue; const b = DroneLib.buyParts(c[0]).find((x) => x.name.toLowerCase() === n) || DroneLib.buyParts(c[0]).find((x) => x.name.toLowerCase().includes(n)); if (b) return b; }
    return null;
  }
  // Zugang zur KI (nur in Claude). Liefert null, wenn sie hier nicht geht.
  const idle = () => new Promise((res) => { const t0 = Date.now(); const w = () => (!App.busy || Date.now() - t0 > 60000 ? res() : setTimeout(w, 200)); setTimeout(w, 300); });
  async function sampler() { if (off) return null; try { return (await window.claude?.use('sample')) || null; } catch (_) { return null; } }
  function errText(e) {
    const code = e && e.code;
    const HIDE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
    if (HIDE.includes(code)) { off = true; const ci = $('#cmd-input'); if (ci) ci.placeholder = 'Werkzeug suchen …'; }
    return {
      cancelled: 'Abgebrochen.',
      not_granted: 'Die KI ist für diese Seite nicht erlaubt. Beim nächsten Öffnen kannst du sie erlauben – alles andere funktioniert wie gewohnt.',
      sampling_disabled: 'Die KI ist für dein Konto nicht verfügbar. Alles andere funktioniert wie gewohnt.',
      rate_limited: 'Gerade sind zu viele Anfragen unterwegs oder dein Kontingent ist aufgebraucht. Versuch es später noch einmal.',
      invalid_json: 'Die Antwort war nicht lesbar. Versuch es noch einmal, gern etwas kürzer beschrieben.',
      prompt_too_large: 'Das Modell ist zu groß für eine Anfrage. Beschreib nur den Teil, um den es geht.',
      session_expired: 'Bitte melde dich neu bei Claude an und versuch es dann noch einmal.',
      refused: 'Dazu kann die KI nichts bauen. Beschreib es bitte anders.',
      empty_completion: 'Die KI hat nichts geantwortet. Beschreib es bitte einfacher.',
      upstream_error: 'Die Verbindung ist abgebrochen. Versuch es gleich noch einmal.',
    }[code] || (HIDE.includes(code) ? 'Die KI ist hier gerade nicht verfügbar. Alles andere funktioniert wie gewohnt.' : 'Das hat nicht geklappt. Versuch es noch einmal.');
  }
  function ensurePanel() {
    if (panel) return panel;
    panel = h('div', { class: 'ai-panel', role: 'log', 'aria-live': 'polite' });
    const head = h('div', { class: 'ai-head' });
    const t = h('b'); t.innerHTML = icon('spark') + 'KI-Helfer';
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen' }); close.innerHTML = icon('close');
    close.onclick = () => { if (ctl) ctl.abort(); if (ro) ro.disconnect(); panel.remove(); panel = null; document.documentElement.style.removeProperty('--ai-h'); };
    head.append(t, close); panel.append(head);
    $('#overlay').append(panel);
    // Meldungen erscheinen über dem Helfer statt darauf
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (panel) document.documentElement.style.setProperty('--ai-h', panel.offsetHeight + 'px'); }) : null;
    if (ro) ro.observe(panel);
    return panel;
  }
  function addMsg(who, text) {
    const p = ensurePanel();
    const m = h('div', { class: 'ai-msg ' + who }, h('span', { class: 'who' }, who === 'me' ? 'Du' : 'KI'), h('div', { class: 'txt' }, text));
    p.append(m); p.scrollTop = p.scrollHeight;
    return m;
  }
  async function ask(text) {
    const sample = await sampler();
    if (!sample) { UI.modal({ title: 'KI-Helfer nicht verfügbar', body: 'Der KI-Helfer funktioniert, wenn Tracery in Claude geöffnet ist. Hier kannst du alles andere wie gewohnt nutzen.', actions: [{ label: 'OK', primary: true }] }); return; }
    if (ctl) ctl.abort();
    addMsg('me', text);
    const m = addMsg('ai', 'Denkt nach …');
    const txt = m.querySelector('.txt');
    const stop = h('button', { type: 'button', class: 'btn small ghost', style: { justifySelf: 'start' } }); stop.innerHTML = icon('stop') + 'Stopp';
    m.append(stop);
    ctl = new AbortController(); const myCtl = ctl;
    stop.onclick = () => myCtl.abort();
    const recent = history.slice(-4).map((h2, i) => `${i + 1}. „${h2.q}“ → ${h2.a}`).join('\n');
    const prompt = `${RULES}\n\nAKTUELLES MODELL (JSON):\n${modelText()}\n${recent ? '\nLETZTE ANFRAGEN:\n' + recent + '\n' : ''}\nWUNSCH DES NUTZERS:\n${text}`;
    let res;
    try {
      // cache: false – wer dieselbe Bitte nach „Rückgängig“ noch einmal schickt, will einen neuen Versuch
      res = await sample.json(prompt, { signal: myCtl.signal, modelTier: 'default', cache: false, onText: () => { txt.textContent = 'Baut …'; } });
    } catch (e) {
      stop.remove();
      txt.textContent = errText(e); ctl = null; return;
    }
    stop.remove(); ctl = null;
    if (!res || typeof res !== 'object') { txt.textContent = 'Die Antwort war nicht lesbar.'; return; }
    const answer = String(res.antwort || res.answer || '').slice(0, 800) || 'Erledigt.';
    let acts = Array.isArray(res.aktionen) ? res.aktionen : Array.isArray(res.actions) ? res.actions : [];
    let report = { added: [], changed: [], notes: [] };
    // ein neuer Rahmen aus dem Frame-Assistenten ersetzt das Projekt – danach gelten die übrigen Aktionen für den Rahmen
    const dr = acts.find((a) => String(a.op || '').toLowerCase() === 'drohne');
    const wantCheck = acts.some((a) => String(a.op || '').toLowerCase() === 'pruefen') || !!dr;
    if (dr) {
      try {
        const o = { zoll: [3, 4, 5, 6, 7].includes(+dr.zoll) ? +dr.zoll : 5, form: DroneTpl.FORMS[dr.form] ? dr.form : 'x', video: DroneTpl.VIDEO[dr.video] ? dr.video : 'analog' };
        if (dr.motor && DroneLib.motors().some((m) => m.stator === String(dr.motor))) o.motor = String(dr.motor);
        if (dr.akku && DroneLib.akku(dr.akku)) o.akku = dr.akku;
        const cfg = DroneTpl.config(o), d = DroneTpl.build(cfg);
        for (const it of d.items) it.ai = { q: text.slice(0, 160) };
        App.setDoc(d); Start.hide(); report.newDoc = cfg.name;
        report.notes.push(`Neues Projekt „${d.name}“ – dein bisheriges Projekt findest du auf der Startseite unter „Weiterarbeiten“.`);
      } catch (e) { report.notes.push('Den Rahmen konnte ich nicht bauen.'); }
      acts = acts.filter((a) => a !== dr);
    }
    if (acts.some((a) => !['pruefen', 'drohne'].includes(String(a.op || '').toLowerCase()))) {
      try { const r2 = applyActions(acts, text); report.added.push(...r2.added); report.changed.push(...r2.changed); report.notes.push(...r2.notes); }
      catch (e) { console.error(e); txt.textContent = answer + '\n\n(Beim Umsetzen ist etwas schiefgegangen: ' + e.message + ')'; return; }
    }
    txt.textContent = answer + (report.notes.length ? '\n\nHinweis: ' + report.notes.join(' ') : '');
    if (wantCheck && DroneCheck.isDrone()) {
      const box = h('div', { class: 'ai-check' }, h('small', null, 'Drohnen-Check läuft …')); m.append(box);
      idle().then(() => DroneCheck.run()).then((l) => { box.innerHTML = ''; if (!l) return; const bad = l.filter((c) => c.s === 'bad' || c.s === 'warn'); box.append(DroneCheck.rows(bad.length ? bad : l.filter((c) => c.id === 'tw' || c.id === 'weight'), (ids) => App.select(ids))); if (!bad.length) box.append(h('small', null, 'Propeller, Teile und Schwerpunkt: alles in Ordnung.')); });
    }
    history.push({ q: text.slice(0, 160), a: answer.slice(0, 160) });
    if (report.newDoc && !report.added.length && !report.changed.length) setTimeout(() => Viewer.fit(), 800);
    else if (report.added.length || report.changed.length) {
      const row = h('div', { class: 'btn-row' });
      const u = h('button', { type: 'button', class: 'btn small' }); u.innerHTML = icon('undo') + 'Rückgängig';
      u.onclick = () => { App.undo(); u.disabled = true; };
      row.append(u); m.append(row);
      if (report.added.length) setTimeout(() => Viewer.fit(), 500);
    }
  }
  // ---------- Umsetzen ----------
  function num(v, d) {
    if (typeof v === 'number' && isFinite(v)) return Math.max(-5000, Math.min(5000, v));
    if (typeof v === 'string' && v.trim()) { const n = parseNum(v); if (!isNaN(n)) return n; return v.trim().slice(0, 80); }
    return d;
  }
  function cleanP(kind, p) {
    const out = {};
    for (const k in p || {}) { if (typeof p[k] === 'object') continue; out[k] = typeof p[k] === 'string' && ['lib', 'size', 'head'].includes(k) ? p[k] : num(p[k], undefined); if (out[k] === undefined) delete out[k]; }
    return out;
  }
  function cleanT(t) { const o = {}; for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) if (t && t[k] != null) o[k] = num(t[k], 0); return o; }
  const PLANEDEF = { XY: { x: [1, 0, 0], n: [0, 0, 1] }, XZ: { x: [1, 0, 0], n: [0, -1, 0] }, YZ: { x: [0, 1, 0], n: [1, 0, 0] } };
  function buildItem(o, notes) {
    const kind = String(o.art || o.kind || '').toLowerCase();
    if (!KMAP[kind]) { notes.push(`„${o.art}“ kenne ich nicht.`); return null; }
    const role = o.rolle === 'loch' || o.role === 'hole' ? 'hole' : 'solid';
    let it;
    if (kind === 'extrude') {
      const pl = PLANEDEF[String(o.p && o.p.ebene || 'XY').toUpperCase()] || PLANEDEF.XY;
      const off = num(o.p && o.p.versatz, 0);
      const plane = { o: pl.n.map((v) => v * (typeof off === 'number' ? off : 0)), x: pl.x, n: pl.n };
      const ents = [];
      for (const el of (o.p && o.p.form) || []) {
        if (el.rect && el.rect.length === 4) ents.push({ id: uid('e'), type: 'rect', a: [num(el.rect[0], 0), num(el.rect[1], 0)], b: [num(el.rect[2], 10), num(el.rect[3], 10)] });
        else if (el.circle && el.circle.length === 3) ents.push({ id: uid('e'), type: 'circle', c: [num(el.circle[0], 0), num(el.circle[1], 0)], r: Math.abs(num(el.circle[2], 5)) });
        else if (el.slot && el.slot.length === 5) ents.push({ id: uid('e'), type: 'slot', a: [num(el.slot[0], 0), num(el.slot[1], 0)], b: [num(el.slot[2], 10), num(el.slot[3], 0)], r: Math.abs(num(el.slot[4], 2)) });
        else if (Array.isArray(el.poly) && el.poly.length >= 3) { const pts = el.poly.map((q) => [num(q[0], 0), num(q[1], 0)]); for (let i = 0; i < pts.length; i++) ents.push({ id: uid('e'), type: 'line', a: pts[i], b: pts[(i + 1) % pts.length] }); }
      }
      if (!ents.length) { notes.push('Eine Skizze war leer.'); return null; }
      it = Model.newItem('extrude', {}, { name: o.name || 'Skizzenkörper', role });
      it.p = { sketch: { plane, ents }, dist: num(o.p.hoehe ?? o.p.dist, 10), dir: ['normal', 'reverse', 'both'].includes(o.p.richtung) ? o.p.richtung : 'normal' };
    } else if (kind === 'part') {
      const lib = o.p && o.p.lib; const def = LIBMAP[lib];
      if (!def) { notes.push(`Das Bauteil „${lib}“ gibt es nicht.`); return null; }
      it = Model.newItem('part', { ...libDefaults(def), ...cleanP('part', o.p) }, { name: o.name || def.label, role: def.role });
    } else if (kind === 'group') {
      it = Model.newItem('group', {}, { name: o.name || 'Gruppe', role });
      for (const c of o.kinder || o.children || []) { const ci = buildItem(c, notes); if (ci) it.children.push(ci); }
      if (!it.children.length) return null;
      it.color = (it.children.find((c) => c.role !== 'hole') || it.children[0]).color;
    } else {
      it = Model.newItem(kind, cleanP(kind, o.p), { name: o.name || KINDS[kind].label, role });
    }
    Object.assign(it.t, cleanT(o.t));
    if (o.farbe && /^#[0-9a-f]{6}$/i.test(o.farbe)) it.color = o.farbe;
    for (const r of o.rundungen || []) if (r && (r.r || r.r === 0)) it.finishes.push({ id: uid('f'), type: r.typ === 'chamfer' ? 'chamfer' : 'fillet', r: num(r.r, 1), edges: ['all', 'top', 'bottom', 'vertical', 'horizontal'].includes(r.kanten) ? r.kanten : 'all' });
    return it;
  }
  // Feature-Gruppe (Muster, Spiegelung) um ein Objekt legen – wie Features.pattern, aber innerhalb einer Änderung
  function wrapIn(doc, id, name, p) {
    const f = Model.find(doc, id); if (!f) return null;
    const G = Model.newItem('group', {}, { name, color: f.item.color, role: f.item.role === 'hole' ? 'hole' : 'solid' });
    G.p = p; G.children = [f.item];
    f.list.splice(f.list.indexOf(f.item), 1, G);
    return G;
  }
  function applyActions(acts, text) {
    const report = { added: [], changed: [], notes: [] };
    const q = String(text || '').slice(0, 160);
    App.change('KI: ' + String(text || '').slice(0, 40), (doc) => {
      for (const a of acts.slice(0, 60)) {
        const op = String(a.op || '').toLowerCase();
        if (op === 'mass') {
          const name = String(a.name || '').trim().replace(/\s+/g, '_');
          if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(name)) continue;
          const ex = doc.params.find((p) => p.name.toLowerCase() === name.toLowerCase());
          const val = num(a.wert ?? a.value, 10);
          if (ex) ex.expr = val; else doc.params.push({ id: uid('m'), name, expr: val });
        } else if (op === 'hinzufuegen' || op === 'add') {
          const it = buildItem(a.objekt || a.object || {}, report.notes); if (!it) continue;
          const tgt = a.in ? Model.find(doc, a.in) : null;
          if (tgt && tgt.item.kind === 'group') tgt.item.children.push(it); else doc.items.push(it);
          report.added.push(it.id);
        } else if (op === 'aendern' || op === 'change') {
          const f = Model.find(doc, a.id); if (!f) { report.notes.push('Ein Objekt zum Ändern gab es nicht.'); continue; }
          const s = a.setze || a.set || {};
          if (s.name) f.item.name = String(s.name).slice(0, 60);
          if (s.rolle) f.item.role = s.rolle === 'loch' ? 'hole' : 'solid';
          if (s.p && typeof s.p === 'object') {
            if (f.item.kind === 'extrude') { if (s.p.hoehe != null) f.item.p.dist = num(s.p.hoehe, f.item.p.dist); if (s.p.richtung) f.item.p.dir = s.p.richtung; }
            else Object.assign(f.item.p, cleanP(f.item.kind, s.p));
          }
          if (s.t) Object.assign(f.item.t, cleanT(s.t));
          if (s.farbe && /^#[0-9a-f]{6}$/i.test(s.farbe)) f.item.color = s.farbe;
          report.changed.push(f.item.id);
        } else if (op === 'loeschen' || op === 'delete') {
          const f = Model.find(doc, a.id); if (f) { f.list.splice(f.list.indexOf(f.item), 1); report.changed.push(a.id); }
        } else if (op === 'gruppieren' || op === 'group') {
          const ids = (a.ids || []).filter((id) => doc.items.find((x) => x.id === id));
          if (ids.length < 2) continue;
          const G = Model.newItem('group', {}, { name: a.name || 'Gruppe' });
          const at = Math.min(...ids.map((id) => doc.items.findIndex((x) => x.id === id)));
          for (const id of ids) { const i = doc.items.findIndex((x) => x.id === id); G.children.push(doc.items.splice(i, 1)[0]); }
          G.color = (G.children.find((c) => c.role !== 'hole') || G.children[0]).color;
          doc.items.splice(at, 0, G); report.added.push(G.id);
        } else if (op === 'rundung' || op === 'fillet') {
          const f = Model.find(doc, a.id); if (!f) continue;
          f.item.finishes = f.item.finishes || [];
          f.item.finishes.push({ id: uid('f'), type: a.typ === 'chamfer' ? 'chamfer' : 'fillet', r: num(a.r, 1), edges: ['all', 'top', 'bottom', 'vertical', 'horizontal'].includes(a.kanten) ? a.kanten : 'all' });
          report.changed.push(f.item.id);
        } else if (op === 'muster' || op === 'pattern') {
          if (!Model.find(doc, a.id)) { report.notes.push('Das Objekt für das Muster gab es nicht.'); continue; }
          const circ = /kreis|circ/i.test(a.art || '');
          const mitte = Array.isArray(a.mitte) ? a.mitte : [0, 0];
          const G = circ ? wrapIn(doc, a.id, Features.NAMES.circ, { op: 'pattern', pt: 'circ', n: Math.max(1, Math.round(num(a.n, 4))), ang: num(a.winkel, 360), cx: num(mitte[0], 0), cy: num(mitte[1], 0) })
            : wrapIn(doc, a.id, Features.NAMES.rect, { op: 'pattern', pt: 'rect', nx: Math.max(1, Math.round(num(a.nx, 2))), ny: Math.max(1, Math.round(num(a.ny, 1))), dx: num(a.dx, 20), dy: num(a.dy, 20) });
          if (G) report.added.push(G.id);
        } else if (op === 'spiegeln' || op === 'mirror') {
          if (!Model.find(doc, a.id)) { report.notes.push('Das Objekt zum Spiegeln gab es nicht.'); continue; }
          const G = wrapIn(doc, a.id, Features.NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: ['YZ', 'XZ', 'XY'].includes(String(a.ebene).toUpperCase()) ? String(a.ebene).toUpperCase() : 'YZ', off: num(a.lage, 0) });
          if (G) report.added.push(G.id);
        } else if (op === 'material') {
          const f = doc.items.find((x) => x.id === a.id); const m = MATERIALS.find((x) => x.k.toLowerCase() === String(a.material || '').toLowerCase());
          if (!f || !m) { report.notes.push(!f ? 'Material geht nur für Teile der obersten Ebene.' : `Das Material „${a.material}“ kenne ich nicht.`); continue; }
          f.mat = m.k; delete f.massG; report.changed.push(f.id);
        } else if (op === 'gewicht' || op === 'mass_g') {
          const f = doc.items.find((x) => x.id === a.id); if (!f) { report.notes.push('Ein festes Gewicht geht nur für Teile der obersten Ebene.'); continue; }
          delete f.mat; f.massG = num(a.g, ''); report.changed.push(f.id);
        } else if (op === 'kaufteil' || op === 'buy') {
          const b = buySpec(a.name); if (!b) { report.notes.push(`Das Kaufteil „${a.name}“ steht nicht in der Bibliothek.`); continue; }
          const it = Model.newItem(b.kind, { ...b.p }, { name: b.name, color: b.color });
          it.massG = b.massG; Object.assign(it.t, cleanT(a.t));
          doc.items.push(it); report.added.push(it.id);
        }
      }
      // jeder neue oder geänderte Schritt merkt sich, dass er von der KI kommt – und auf welche Bitte
      for (const id of report.added) { const f = Model.find(doc, id); if (f) f.item.ai = { q }; }
      for (const id of report.changed) { const f = Model.find(doc, id); if (f && !f.item.ai) f.item.ai = { q, edit: true }; }
      if (!report.added.length && !report.changed.length && !acts.some((a) => a.op === 'mass')) return false;
    });
    const sel = report.added.length ? report.added : report.changed.filter((id) => Model.find(App.doc, id));
    if (sel.length) App.select(sel.slice(0, 20));
    return report;
  }
  // für Erklären und Schwachstellen: eine Frage mit JSON-Antwort
  async function json(prompt, opts = {}) {
    const sample = await sampler(); if (!sample) return { error: 'Die KI gibt es nur, wenn Tracery in Claude geöffnet ist.' };
    try { return { res: await sample.json(prompt, { modelTier: 'default', cache: false, ...opts }) }; } catch (e) { return { error: errText(e) }; }
  }
  return { ask, json, apply: applyActions, compactItem, modelText, ACTIONS, get available() { return !off; } };
})();

