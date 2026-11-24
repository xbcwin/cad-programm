// ================= KI-Kollege: baut, ändert und prüft Modelle – auch große Aufträge in mehreren Runden =================
// Ein Auftrag („Baue ein Gehäuse 60×40×30 mit Deckel“, „Mach alles als Verbund“, „Prüf das Modell auf Schwachstellen und behebe sie“) läuft so:
// 1. Die KI plant und schickt Aktionen. 2. Tracery setzt sie um, rechnet und sammelt die Rückmeldung (Fehler, Schwachstellen).
// 3. Die KI sieht das neue Modell und macht weiter – bis sie fertig ist (höchstens MAX_ROUNDS Runden).
// Der ganze Auftrag ist danach EIN Rückgängig-Schritt. Rückfragen der KI erscheinen mit Antwort-Knöpfen.
const AI = (() => {
  let panel = null, ctl = null, history = [], off = false, current = null;
  const MAX_ROUNDS = 5, AUTO_KEY = 'tracery.ai.auto';
  const auto = () => storageGet(AUTO_KEY) !== '0';
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const SUGGESTIONS = [
    'Baue ein Gehäuse 60×40×30 mit Deckel',
    'Bau eine Winkel-Halterung mit M4-Schraubenlöchern',
    'Erstelle ein Schild 80×30 mit graviertem Text „WERKSTATT“',
    'Bau ein Zahnrad mit 24 Zähnen und 6 mm Bohrung',
    'Prüf das Modell auf Schwachstellen und behebe sie',
  ];
  const ACTIONS = `Aktionen:
{"op":"hinzufuegen","objekt":OBJEKT,"in":"<id einer Gruppe, optional>"}
{"op":"aendern","id":"<id>","setze":{"name":"…","rolle":"koerper"|"loch","p":{…},"t":{…},"farbe":"#RRGGBB"}}
{"op":"loeschen","id":"<id>"}
{"op":"mass","name":"Breite","wert":"75"}   (legt ein benanntes Maß an oder ändert es)
{"op":"rundung","id":"<id>","typ":"fillet"|"chamfer","r":2,"kanten":"all"|"top"|"bottom"|"vertical"|"horizontal","ersetzen":false}   (ersetzen:true ersetzt vorhandene Rundungen und Fasen)
{"op":"muster","id":"<id>","art":"kreis","n":4,"winkel":360,"mitte":[0,0],"achse":"z"}   (Kreismuster um eine Achse durch „mitte“: "z" senkrecht (Standard), "x" quer, "y" längs – dann „mitte“ mit drei Werten [x,y,z]; schräge Achse als Richtung "achse":[dx,dy,dz] mit "mitte":[x,y,z]; Anzahl zählt das Original mit)
{"op":"muster","id":"<id>","art":"rechteck","nx":3,"ny":1,"dx":20,"dy":0}   (Rechteckmuster, Abstände von Mitte zu Mitte)
{"op":"muster","id":"<id>","art":"kurve","n":5,"abstand":0,"drehen":true,"hoehe":0,"kurve":[{"typ":"bogen","von":[x,y],"durch":[x,y],"bis":[x,y]}]}   (Muster entlang Kurve in der Ebene auf Höhe „hoehe“. Kurvenstücke: {"typ":"linie","von","bis"}, {"typ":"bogen","von","durch","bis"}, {"typ":"spline","punkte":[[x,y],…]} – aneinander gehängt –, oder ein {"typ":"kreis","mitte":[x,y],"r":20}. Die Kurve beginnt an der Mitte des Originals; abstand 0 = gleichmäßig verteilt; drehen:true dreht die Kopien mit der Kurve)
{"op":"gelenk","fest":"<id>","beweglich":"<id>","achse":{"punkt":[x,y,z],"richtung":[dx,dy,dz]},"art":"drehen"|"schieben","von":-90,"bis":90,"winkel":0}   (Gelenk zwischen zwei Teilen ganz oben im Verlauf, nicht in einer Gruppe: „beweglich“ dreht sich um die Achse durch „punkt“ bzw. gleitet entlang „richtung“ – „von“/„bis“ in Grad bzw. mm, „winkel“ = Startstellung. Ketten gehen: Ein Teil darf an mehreren Gelenken hängen, wird aber nur von einem bewegt.)
{"op":"spiegeln","id":"<id>","ebene":"YZ"|"XZ"|"XY","lage":0}   (Original plus Spiegelbild; YZ = links↔rechts, XZ = vorne↔hinten, XY = oben↔unten)
{"op":"verbinden","ids":"alle","name":"Verbund"}   (macht die Teile zu EINEM Körper – für „Verbund“, „verbinden“, „zusammenfügen“, „ein Teil daraus machen“; Löcher darin schneiden fest. Kaufteile mit festem Gewicht bleiben automatisch einzeln, außer "mit_kaufteilen":true)
{"op":"loesen","ids":"<id>"}   (Gruppe oder Verbund wieder in Einzelteile lösen)
{"op":"abziehen","von":"<id>","werkzeuge":["<id>"]}   (schneidet die Werkzeuge aus dem Körper „von“ aus)
{"op":"schnittmenge","ids":["<id>","<id>"]}   (übrig bleibt, was in allen zugleich liegt)
{"op":"ausrichten","ids":"alle","an":"links"|"rechts"|"vorne"|"hinten"|"unten"|"oben"|"mitte_x"|"mitte_y"}   (an der gemeinsamen Hülle der Teile)
{"op":"zentrieren","ids":"alle"}   (schiebt die Teile gemeinsam, bis ihre Mitte über dem Ursprung liegt)
{"op":"verschieben","ids":"…","um":{"x":0,"y":0,"z":0}}   oder   {"op":"verschieben","id":"…","nach":{"x":0,"y":0,"z":0}}
{"op":"drehen","ids":"…","achse":"x"|"y"|"z","grad":90}   (um die Mitte der Teile)
{"op":"umklappen","ids":"…","achse":"x"|"y"|"z"}   (spiegelt am Ort, ohne Kopie)
{"op":"kopieren","ids":"…","anzahl":1,"versatz":{"x":30,"y":0,"z":0}}
{"op":"auf_platte","ids":"alle"}   (legt die Teile auf z = 0)
{"op":"rolle","ids":"…","rolle":"koerper"|"loch"} · {"op":"farbe","ids":"…","farbe":"#RRGGBB"} · {"op":"umbenennen","id":"…","name":"…"}
{"op":"ausblenden","ids":"…"} · {"op":"einblenden","ids":"…"} · {"op":"unterdruecken","ids":"…"} · {"op":"aktivieren","ids":"…"}
{"op":"material","id":"<id>","material":"<Kürzel aus MATERIALIEN>"}
{"op":"verrechnen","ids":"…","modus":"vereinigen"|"abziehen"|"schnittmenge"|"eigener","ziel":"<id oder name:…>"}   (Teile ganz oben; das Ziel muss im Verlauf vorher kommen; abziehen schneidet nur aus dem Ziel, anders als rolle loch)
{"op":"gewicht","id":"<id>","g":33.8}   (Teil mit festem Gewicht, z. B. Kaufteil aus einem Datenblatt)
{"op":"schwachstellen"}   (sucht Schwachstellen: Lochrand, dünne Wände, Überhänge – das Ergebnis bekommst du als Rückmeldung)
{"op":"auswaehlen","ids":"…"}   (wählt am Ende diese Teile aus, damit der Nutzer sie gleich sieht)

TEILE ANSPRECHEN – überall, wo "id" oder "ids" steht, geht auch:
"alle" (alle sichtbaren Teile der obersten Ebene) · "auswahl" (was der Nutzer beim Auftrag ausgewählt hatte) · "koerper" · "loecher" · "kaufteile" · "neu" (was du in diesem Auftrag gebaut hast) · "name:Deckel" (Name enthält „Deckel“) · oder eine Liste, z. B. ["name:Platte","<id>"].

OBJEKT:
{"art":"box|cylinder|tube|sphere|hemisphere|cone|pyramid|torus|prism|wedge|extrude|loft|sweep|part|group","name":"…","rolle":"koerper"|"loch","p":{…},"t":{"x":0,"y":0,"z":0,"rx":0,"ry":0,"rz":0},"farbe":"#RRGGBB","kinder":[OBJEKT…],"rundungen":[{"typ":"fillet","r":2,"kanten":"vertical"}]}

Parameter p (alle Grundkörper stehen mit der Unterseite auf z=0 ihres eigenen Systems und sind in X/Y zentriert; t verschiebt/dreht, Drehung in Grad um X, dann Y, dann Z):
- box: w (Breite X), d (Tiefe Y), h (Höhe Z)
- cylinder: d, h · tube: d (außen), wall, h · sphere: d · hemisphere: d · cone: d1 (unten), d2 (oben, 0 = Spitze), h
- pyramid: w, d, h · torus: d (außen), t (Ringdicke) · prism: n (Ecken), d (Umkreis), h · wedge: w, d, h (die Schräge fällt zur +X-Seite ab)
- extrude: {"ebene":"XY"|"XZ"|"YZ","versatz":0,"hoehe":10,"richtung":"normal"|"reverse"|"both","form":[ELEMENT…]}
  ELEMENT (2D in mm): {"rect":[x1,y1,x2,y2]} · {"circle":[cx,cy,r]} · {"ellipse":[cx,cy,rx,ry]} · {"poly":[[x,y],[x,y],…]} (geschlossener Linienzug) · {"slot":[x1,y1,x2,y2,r]} · {"text":"TRACERY","x":0,"y":0,"hoehe":5,"fett":true,"mitte":true,"drehung":0,"bogen":0} (Schrift als Umriss, z. B. für Schilder; in einem Rechteck = Gravur; "bogen" = Radius in mm, die Grundlinie läuft dann auf einem Kreis – positiv wölbt sich der Text nach oben, Mitte des Kreises bei (x, y − bogen); so läuft Schrift am Rand einer runden Platte entlang; "entlang":[[x,y],…] legt den Text mittig auf eine Kurve durch diese Punkte (als Hilfslinie), "andereSeite": true auf ihre andere Seite)
  Ebene XY: u=X, v=Y, hoch in +Z. Ebene XZ: u=X, v=Z, hoch in −Y. Ebene YZ: u=Y, v=Z, hoch in +X. „versatz“ verschiebt die Ebene entlang dieser Richtung. Formen, die ganz in einer anderen liegen, werden zu Löchern darin.
- loft (Übergang durch Umrisse): {"profile":[{"ebene":"XY","versatz":0,"form":[ELEMENT]},{"ebene":"XY","versatz":30,"form":[ELEMENT]}],"spitze":0,"gerade":false,"mittellinie":{"ebene":"XZ","versatz":0,"kurve":[KURVENSTÜCK…]}} – mit "spitze" > 0 läuft der Körper hinter dem letzten Profil zu einer Spitze zusammen (auch mit nur einem Profil). "mittellinie" (optional, ab zwei Profilen) biegt den Übergang: eine offene Kurve in einer Ebene (Kurvenstücke wie bei „muster kurve“: linie/bogen/spline), die vom ersten Profil durch alle bis zum letzten läuft – die Profile bleiben, wo sie sind. In der Ebene XZ ist die 2. Koordinate z, in YZ ist die 1. y und die 2. z. Statt "mittellinie" geht "fuehrungskurve" (gleicher Aufbau): eine Seitenlinie neben den Profilen, vom ersten bis zum letzten – der Übergang wird dazwischen so weit, dass er sie berührt (z. B. ein bauchiger Griff oder ein Übergang). Dazu passt "fuehrungskurve2" (gleicher Aufbau) in einer Ebene quer zur ersten (erste in YZ → zweite in XY): sie gibt die Breite in der anderen Richtung vor – so formst du einen Körper von der Seite und von oben.
- sweep (Querschnitt entlang Pfad): {"ebene":"XY","versatz":0,"pfad":[[x,y],…],"glatt":false,"form":"rund"|"rechteck","d":6,"w":6,"h":4,"wand":0,"verdrehung":0} – Rohr, Kabelkanal, Bügel oder mit op "abziehen" eine Nut entlang einer Kurve; "glatt": true macht aus den Punkten eine Spline; "verdrehung" dreht das Profil in Grad über die Pfadlänge. Statt "ebene"/"pfad" geht auch "pfad3d":[[x,y,z],…] – ein Rohr durch Punkte im Raum (glatt, außer "glatt": false), z. B. ein Kabelkanal oder Bügel, der um Teile herum und nach oben läuft. Dazu optional "regeln":[{"achse":"z","laenge":20},null,…] – je Stück (von Punkt i zu i+1): genau entlang einer Achse ("achse": "x"|"y"|"z", ab dem zweiten Stück auch "rechtwinklig" oder "parallel" zum vorigen) und/oder mit fester Länge (auch eine Formel); die Punkte dahinter wandern mit.
- part (Bauteile, Öffnung zeigt nach +Z, Tiefe geht nach −Z; setze z auf die Oberfläche):
  {"lib":"screwHole","size":"M1.6|M2|M2.5|M3|M4|M5|M6|M8","head":"countersunk|counterbore|none","length":10} (rolle loch)
  {"lib":"nutTrap","size":"M3","length":12} (loch) · {"lib":"insert","size":"M3"} (loch, Gewindeeinsatz) · {"lib":"slotHole","len":20,"w":4.5,"depth":10} (loch) · {"lib":"zipTie","w":3,"gap":6,"depth":10} (loch, zwei Kabelbinder-Schlitze)
  {"lib":"threadRod","size":"M3…M16","length":12} (koerper, echtes Außengewinde) · {"lib":"threadHole","size":"M4…M16","length":10,"clear":0.3} (loch, gedrucktes Innengewinde)
  {"lib":"stdScrew","size":"M1.6…M24","head":"zyl|hex|senk","length":10} (koerper, Normschraube) · {"lib":"stdNut","size":"M1.6…M24"} (koerper, Mutter) · {"lib":"stdWasher","size":"M1.6…M24"} (koerper, Scheibe)
  {"lib":"stdPin","size":"1…20","length":20,"tol":"m6|h8"} (koerper, Zylinderstift ISO 2338) · {"lib":"stdKey","size":"2x2…20x12","length":20} (koerper, Passfeder DIN 6885 A) · {"lib":"stdKeyway","size":"6x6","kind":"shaft|hub","length":20} (loch, Passfedernut) · {"lib":"stdBearing","size":"608|6000…6010|6200…6210","seal":"2rs|open"} (koerper, Kugellager) · {"lib":"stdSleeve","size":"3x5…40x44","length":10,"flange":"cyl|flange"} (koerper, Gleitlager)
  {"lib":"snapHook","length":12,"w":8,"t":1.6,"hook":1.2} (koerper) · {"lib":"hinge","len":40,"w":15,"t":2.4,"gap":0.4} (koerper) · {"lib":"gear","teeth":20,"module":1.5,"h":6,"bore":5} (koerper, Zahnrad)
- rundungen: typ "fillet" (Rundung), "chamfer" (Fase) oder "draft" (Entformungsschräge, r = Winkel in Grad, neigt alle senkrechten Seitenwände)
- group: {"kinder":[…]} – Kinder mit rolle "loch" werden aus den Kindern mit rolle "koerper" geschnitten. t der Kinder ist relativ zur Gruppe.

Regeln:
- Löcher auf oberster Ebene schneiden automatisch alle Körper, die sie berühren. Ein Teil mit Löchern baust du am saubersten als group.
- Löcher sollen 0,5 mm über die Oberfläche hinausragen, damit sie sauber schneiden.
- Lege Teile auf z=0, sofern nichts anderes gewünscht ist. Maße exakt übernehmen, nicht runden. Für Schrauben nimm part screwHole.
- Zahlenwerte dürfen Formeln mit Maß-Namen sein, z. B. "Breite/2+3". Lege bei neuen Teilen für die 2–4 wichtigsten Größen Maße an (op "mass") und nutze sie.
- Neue Teile nicht in bestehende hineinsetzen: stelle sie daneben – "lage" im Modell sagt dir, wo jedes Teil liegt (min/max in mm). Ausnahme: der Wunsch ist ausdrücklich eine Änderung am Bestehenden.
- Hat das Projekt benannte Maße ("masse" im Modell), änderst du Größen am besten über op "mass" (z. B. Breite, Wand, Höhe) – dann passen sich abhängige Teile automatisch an.
- Teile mit festem Gewicht ("kaufteil_g") verschmilzt du nie mit anderen Teilen, außer der Nutzer will das ausdrücklich: sonst stimmt ihr Gewicht nicht mehr.
- Beziehe dich mit "id" nur auf ids, die im aktuellen Modell stehen. „das“, „es“, „hier“ meint die Auswahl.
`;
  const RULES = `Du bist der KI-Kollege in der Web-App „Tracery“, einem allgemeinen CAD-Programm im Browser für präzise technische Teile – zum Beispiel Gehäuse, Halterungen, Ersatzteile, Schilder, Zahnräder und Vorrichtungen für 3D-Druck, Laser oder Fräse. Einheiten: Millimeter. Z zeigt nach oben, die XY-Ebene bei z=0 ist die Grundebene.

So arbeitest du – wie ein Kollege, der mit am Modell sitzt:
- Du baust neue Teile von Grund auf (Gehäuse mit Deckel, Halterungen, Ersatzteile, Schilder mit Schrift, Zahnräder …) und nimmst auch große Aufträge an („Mach alles als Verbund“, „Richte alles mittig aus“, „Prüf das Modell auf Schwachstellen und behebe sie“).
- Bei mehr als einem Arbeitsschritt schreibst du einen kurzen Plan (2–6 Punkte) und hakst ab, was erledigt ist.
- Du arbeitest in Runden: Nach jeder Runde setzt Tracery deine Aktionen um, rechnet das Modell neu und schickt dir eine Rückmeldung (was geklappt hat, Fehler, Prüfergebnisse) und das neue Modell. Setze "weiter": true, wenn danach noch etwas zu tun ist oder du ein Ergebnis (z. B. schwachstellen) ansehen willst; sonst "weiter": false.
- Meldet die Rückmeldung FEHLER, behebst du sie in der nächsten Runde (z. B. Radius kleiner, Loch verschieben) oder erklärst, warum es nicht geht.
- Frag nur zurück, wenn der Auftrag wirklich mehrdeutig ist oder dabei etwas Wichtiges verloren ginge: dann "frage" (ein Satz) und 2–4 kurze "optionen", aber keine "aktionen". Sonst entscheide selbst und sag in der "antwort", was du entschieden hast.
- Die "antwort" spricht den Nutzer per du an, 1–3 Sätze, auf Deutsch. In der letzten Runde fasst sie zusammen, was du gemacht hast.

Antworte NUR mit einem JSON-Objekt:
{"antwort":"…","plan":[{"text":"…","fertig":false}],"aktionen":[…],"weiter":false,"frage":"","optionen":[]}

` + ACTIONS + `
Beispiel – Wunsch „Platte 60 × 40 × 4 mit einem Loch in der Mitte“:
{"antwort":"Ich habe dir eine Platte mit einem 5-mm-Loch gebaut. Die Breite kannst du links bei den Maßen ändern.","aktionen":[{"op":"mass","name":"Breite","wert":"60"},{"op":"hinzufuegen","objekt":{"art":"group","name":"Platte","kinder":[{"art":"box","name":"Platte","p":{"w":"Breite","d":40,"h":4}},{"art":"cylinder","name":"Loch","rolle":"loch","p":{"d":5,"h":5},"t":{"z":-0.5}}],"rundungen":[{"typ":"fillet","r":3,"kanten":"vertical"}]}}],"weiter":false}

Beispiel – Wunsch „Baue ein Gehäuse 60×40×30 mit Deckel“:
{"antwort":"Ich habe dir ein Gehäuse 60 × 40 × 30 mm mit 2 mm Wandstärke und einen passenden Deckel daneben gebaut. Breite, Tiefe, Höhe und Wand findest du links unter „Maße“.","aktionen":[{"op":"mass","name":"Breite","wert":"60"},{"op":"mass","name":"Tiefe","wert":"40"},{"op":"mass","name":"Hoehe","wert":"30"},{"op":"mass","name":"Wand","wert":"2"},{"op":"hinzufuegen","objekt":{"art":"group","name":"Gehäuse","kinder":[{"art":"box","name":"Außen","p":{"w":"Breite","d":"Tiefe","h":"Hoehe"},"rundungen":[{"typ":"fillet","r":3,"kanten":"vertical"}]},{"art":"box","name":"Innenraum","rolle":"loch","p":{"w":"Breite - 2*Wand","d":"Tiefe - 2*Wand","h":"Hoehe"},"t":{"z":"Wand"}}],"t":{"x":"-(Breite/2 + 8)"}}},{"op":"hinzufuegen","objekt":{"art":"group","name":"Deckel","kinder":[{"art":"box","name":"Deckelplatte","p":{"w":"Breite","d":"Tiefe","h":"Wand"},"rundungen":[{"typ":"fillet","r":3,"kanten":"vertical"}]},{"art":"box","name":"Steg","p":{"w":"Breite - 2*Wand - 0.4","d":"Tiefe - 2*Wand - 0.4","h":3},"t":{"z":"Wand"}},{"art":"box","name":"Steg innen","rolle":"loch","p":{"w":"Breite - 4*Wand - 0.4","d":"Tiefe - 4*Wand - 0.4","h":3.5},"t":{"z":"Wand"}}],"t":{"x":"Breite/2 + 8"}}}],"weiter":false}

Beispiel – Wunsch „Mach alles als Verbund“ (Runde 1):
{"antwort":"Ich verbinde alle Teile zu einem Körper und prüfe danach, ob alles sauber gerechnet wird.","plan":[{"text":"Alle Teile zu einem Verbund verbinden","fertig":false},{"text":"Ergebnis prüfen","fertig":false}],"aktionen":[{"op":"verbinden","ids":"alle","name":"Verbund"}],"weiter":true}`;
  const KMAP = { box: 1, cylinder: 1, tube: 1, sphere: 1, hemisphere: 1, cone: 1, pyramid: 1, torus: 1, prism: 1, wedge: 1, extrude: 1, loft: 1, sweep: 1, part: 1, group: 1 };
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
  function topInfo(it) {
    const o = compactItem(it);
    if (Mass.fixedOf(it)) o.kaufteil_g = it.massG === '' ? 'fehlt' : it.massG;
    if (it.suppressed) o.unterdrueckt = true;
    try { const b = Actions.worldBox(it.id); if (b && !b.isEmpty()) o.lage = { min: b.min.toArray().map((v) => +v.toFixed(1)), max: b.max.toArray().map((v) => +v.toFixed(1)) }; } catch (_) {}
    return o;
  }
  function modelText(run) {
    const st = Print.stats();
    const obj = {
      projekt: App.doc.name,
      masse: (App.doc.params || []).map((p) => ({ name: p.name, wert: p.expr })),
      objekte: App.doc.items.map(topInfo),
      gesamtgroesse: st ? { x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2), min: st.box.min.toArray().map((v) => +v.toFixed(2)), max: st.box.max.toArray().map((v) => +v.toFixed(2)) } : null,
      auswahl: App.sel,
      ...(run ? { auswahl_beim_auftrag: run.sel0 } : {}),
      fehler: App.errors.slice(0, 12).map(errLine),
    };
    if (App.doc.drone) {
      const chk = DroneCheck.summary();
      obj.drohne = { ...App.doc.drone, check: chk ? chk.map((c) => `${c.title}: ${c.s} – ${c.text}`) : 'noch nicht geprüft' };
      obj.kaufteile = buyNames();
    }
    obj.materialien = MATERIALS.map((m) => m.k);
    let s = JSON.stringify(obj);
    if (s.length > 60000) s = s.slice(0, 60000) + '…';
    return s;
  }

  function buyNames() { try { return DroneLib.CATS.filter((c) => c[0] !== 'loch').flatMap((c) => DroneLib.buyParts(c[0]).map((b) => b.name)); } catch (_) { return []; } }
  function buySpec(name) {
    const n = String(name || '').toLowerCase();
    for (const c of DroneLib.CATS) { if (c[0] === 'loch') continue; const b = DroneLib.buyParts(c[0]).find((x) => x.name.toLowerCase() === n) || DroneLib.buyParts(c[0]).find((x) => x.name.toLowerCase().includes(n)); if (b) return b; }
    return null;
  }
  const labelOf = (id) => { const f = id && Model.find(App.doc, id); return f ? Model.label(f.item) : 'Modell'; };
  function errLine(e) { return `${labelOf(e.itemId)}: ${e.message || e.code || 'Fehler'}`; }
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
  // ---------- Fenster ----------
  function ensurePanel() {
    if (panel) return panel;
    panel = h('div', { class: 'ai-panel', role: 'log', 'aria-live': 'polite' });
    const head = h('div', { class: 'ai-head' });
    const t = h('b'); t.innerHTML = icon('spark') + 'KI-Kollege';
    const tg = h('label', { class: 'ai-auto', 'data-tip': 'Große Aufträge selbstständig in mehreren Runden abarbeiten und Fehler selbst beheben', 'data-help': 'aiCoworker' }, h('input', { type: 'checkbox', id: 'ai-auto', checked: auto() }), h('span', null, 'Selbstständig'));
    tg.querySelector('input').onchange = (e) => storageSet(AUTO_KEY, e.target.checked ? '1' : '0');
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen' }); close.innerHTML = icon('close');
    close.onclick = () => { if (current) current.stopped = true; if (ctl) ctl.abort(); if (ro) ro.disconnect(); panel.remove(); panel = null; document.documentElement.style.removeProperty('--ai-h'); };
    head.append(t, h('div', { class: 'ai-head-r' }, tg, close)); panel.append(head);
    const intro = h('div', { class: 'ai-intro' },
      'Beschreib, was ich bauen oder ändern soll – z. B. Gehäuse, Halterungen, Ersatzteile, Schilder oder Zahnräder. Auch große Aufträge arbeite ich Schritt für Schritt ab – „Rückgängig“ nimmt danach alles auf einmal zurück.');
    const sugRow = h('div', { class: 'ai-opts' });
    for (const s of SUGGESTIONS) {
      const b = h('button', { type: 'button', class: 'btn small', 'data-sug-prompt': '1' }, s);
      b.onclick = () => ask(s);
      sugRow.append(b);
    }
    intro.append(sugRow);
    panel.append(intro);
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
  function renderPlan(el, plan) {
    if (!Array.isArray(plan) || !plan.length) return;
    el.innerHTML = '';
    for (const p of plan.slice(0, 8)) {
      const t = typeof p === 'string' ? p : p && (p.text || p.schritt);
      if (!t) continue;
      const done = !!(p && typeof p === 'object' && (p.fertig || p.done));
      const li = h('li', { class: done ? 'done' : '' }); li.innerHTML = done ? icon('check') : '<i></i>';
      li.append(h('span', null, String(t).slice(0, 140)));
      el.append(li);
    }
    el.hidden = !el.children.length;
  }
  // ---------- Ohne KI: ein paar Aufträge kennt Tracery auch selbst ----------
  const LOCAL = [
    { re: /\b(alles|alle|komplett|ganze)\b.*\b(verbund|verbinde|verbinden|zusammen\w*|vereinig\w*|ein(en)? (teil|körper|koerper)|gruppier\w*)/i, run: () => Actions.groupAll() },
    { re: /\b(verbund|verbinde|verbinden)\b.*\b(alles|alle)\b/i, run: () => Actions.groupAll() },
  ];
  function local(text) { const L = LOCAL.find((x) => x.re.test(text)); if (!L) return false; L.run(); return true; }

  // ---------- Ein Auftrag ----------
  function newRun(text) { return { text, q: String(text || '').slice(0, 160), depth: App.undoStack.length, sel0: App.sel.slice(), added: [], changed: [], notes: [], rounds: [], stopped: false, newDoc: false }; }
  function buildPrompt(run, round, max) {
    const hist = history.slice(-6).map((x, i) => `${i + 1}. Nutzer: „${x.q}“ → ${x.frage ? 'Du hast zurückgefragt: ' : 'Du: '}${x.a}${x.ops ? ' [' + x.ops + ']' : ''}`).join('\n');
    const last = history[history.length - 1];
    let s = `${RULES}\n\nAKTUELLES MODELL (JSON):\n${modelText(run)}\n`;
    if (hist) s += `\nBISHERIGES GESPRÄCH (das Neueste zuletzt):\n${hist}\n`;
    s += `\nAUFTRAG DES NUTZERS:\n${run.text}\n`;
    if (last && last.frage) s += `(Das ist die Antwort auf deine Rückfrage „${last.a}“ zum Auftrag „${last.q}“.)\n`;
    if (run.rounds.length) {
      s += `\nDEINE BISHERIGEN RUNDEN ZU DIESEM AUFTRAG:\n` + run.rounds.map((r, i) => `Runde ${i + 1}: ${r.answer || '–'}\nAktionen: ${r.acts.join('; ') || 'keine'}\nRückmeldung:\n${r.feedback || '(alles umgesetzt, keine Fehler)'}`).join('\n\n');
      s += `\n\nJetzt ist Runde ${round} von höchstens ${max}. Das Modell oben ist schon auf dem neuen Stand. Mach weiter oder behebe Fehler – oder beende mit "weiter": false und einer "antwort", die zusammenfasst, was du gemacht hast.`;
    } else if (max > 1) s += `\nDu hast bis zu ${max} Runden.`;
    else s += `\nDu hast nur diese eine Runde: Setze alles direkt um.`;
    return s;
  }
  function actSummary(a) { let s = ''; try { s = JSON.stringify(a); } catch (_) {} return s.length > 220 ? s.slice(0, 220) + '…' : s; }
  async function feedback(rep, run, errBefore) {
    await idle();
    const parts = [];
    if (rep.done.length) parts.push('Umgesetzt:\n- ' + rep.done.join('\n- '));
    const msgs = [...rep.notes, ...(rep.toasts || [])].filter(Boolean);
    if (msgs.length) parts.push('Meldungen von Tracery:\n- ' + msgs.join('\n- '));
    const newErrs = App.errors.map(errLine).filter((e) => !errBefore.has(e));
    if (newErrs.length) parts.push('FEHLER im Modell (bitte beheben oder erklären):\n- ' + newErrs.join('\n- '));
    if (rep.check) {
      if (DroneCheck.isDrone()) { const l = await DroneCheck.run(); if (l) { run.checkList = l; parts.push('Drohnen-Check:\n- ' + l.map((c) => `${c.title}: ${c.s} – ${c.text}`).join('\n- ')); } }
      else parts.push('Drohnen-Check: geht nur bei einem Rahmen mit Achsabstand, Armwinkel und Propeller unter „Maße“.');
    }
    if (rep.weak) { const l = await Weak.analyze(); run.weakList = l; parts.push('Schwachstellen:\n- ' + (l.length ? l.map((c) => `[${c.s}] ${c.title}: ${c.text}`).join('\n- ') : 'keine gefunden')); }
    run.notes.push(...rep.notes); run.added.push(...rep.added); run.changed.push(...rep.changed);
    if (rep.select) run.select = rep.select;
    return { text: parts.join('\n\n'), newErrs };
  }
  async function ask(text) {
    const sample = await sampler();
    if (!sample) {
      if (local(text)) return;
      UI.modal({ title: 'KI-Kollege nicht verfügbar', body: 'Der KI-Kollege funktioniert, wenn Tracery in Claude geöffnet ist. Hier kannst du alles andere wie gewohnt nutzen – „Alles als Verbund“ findest du auch unten in der Eingabezeile.', actions: [{ label: 'OK', primary: true }] });
      return;
    }
    if (current) current.stopped = true;
    if (ctl) ctl.abort();
    const p = ensurePanel(); const intro = p.querySelector('.ai-intro'); if (intro) intro.remove();
    addMsg('me', text);
    const m = addMsg('ai', 'Denkt nach …'); m.classList.add('working');
    const txt = m.querySelector('.txt');
    const planEl = h('ul', { class: 'ai-plan', hidden: true }), status = h('div', { class: 'ai-status' });
    const stop = h('button', { type: 'button', class: 'btn small ghost', style: { justifySelf: 'start' } }); stop.innerHTML = icon('stop') + 'Stopp';
    m.append(planEl, status, stop);
    const run = newRun(text); current = run;
    stop.onclick = () => { run.stopped = true; if (ctl) ctl.abort(); };
    const errBefore = new Set(App.errors.map(errLine));
    const maxRounds = auto() ? MAX_ROUNDS : 1;
    let answer = '', question = null, fixes = 0, failed = null;
    for (let round = 1; round <= maxRounds && !run.stopped; round++) {
      if (round > 1) status.textContent = `Runde ${round} · denkt nach …`;
      const myCtl = (ctl = new AbortController());
      let res;
      try { res = await sample.json(buildPrompt(run, round, maxRounds), { signal: myCtl.signal, modelTier: 'default', cache: false, onText: () => { if (round === 1 && !answer) txt.textContent = 'Baut …'; } }); }
      catch (e) { if (run.stopped || (e && e.code === 'cancelled')) run.stopped = true; else failed = errText(e); break; }
      finally { if (ctl === myCtl) ctl = null; }
      if (!res || typeof res !== 'object') { failed = 'Die Antwort war nicht lesbar.'; break; }
      answer = String(res.antwort || res.answer || '').slice(0, 900) || answer;
      if (answer) txt.textContent = answer;
      renderPlan(planEl, res.plan);
      const acts = Array.isArray(res.aktionen) ? res.aktionen : Array.isArray(res.actions) ? res.actions : [];
      if (res.frage && !acts.length) { question = { text: String(res.frage).slice(0, 300), options: (Array.isArray(res.optionen) ? res.optionen : []).map((o) => String(o).slice(0, 60)).filter(Boolean).slice(0, 4) }; break; }
      let fb = { text: '', newErrs: [] };
      if (acts.length) {
        status.textContent = `Runde ${round} · setzt ${acts.length} ${acts.length === 1 ? 'Schritt' : 'Schritte'} um …`;
        UI.mute(true); let rep = null;
        try { rep = await execute(acts, run, (s) => { status.textContent = `Runde ${round} · ${s} …`; }); }
        catch (e) { console.error(e); run.notes.push('Beim Umsetzen ist etwas schiefgegangen: ' + e.message); }
        finally { const t = UI.mute(false); if (rep) rep.toasts = t; }
        if (rep) { status.textContent = `Runde ${round} · rechnet und prüft …`; fb = await feedback(rep, run, errBefore); }
      }
      run.rounds.push({ answer, acts: acts.map(actSummary), feedback: fb.text });
      const mustFix = fb.newErrs.length > 0 && fixes < 2 && maxRounds > 1;
      if (mustFix) fixes++;
      if (!((res.weiter && acts.length) || mustFix)) break;
      if (round === maxRounds) run.notes.push(`Ich habe nach ${maxRounds} Runden aufgehört. Schreib „mach weiter“, wenn noch etwas fehlt.`);
    }
    finish(run, m, { answer, question, failed, txt, planEl, status, stop });
  }
  function finish(run, m, o) {
    const { answer, question, failed, txt, planEl, status, stop } = o;
    if (current === run) current = null;
    stop.remove(); status.remove(); m.classList.remove('working');
    const did = App.undoStack.length > run.depth;
    const step = did ? App.squash(run.depth, 'KI: ' + run.text.slice(0, 40)) : null;
    // Text
    let t = answer || (did ? 'Erledigt.' : '');
    if (failed) t = did ? (t + '\n\n' + failed) : failed;
    if (run.stopped) t = (t ? t + '\n\n' : '') + (did ? 'Gestoppt – was bis hierhin fertig war, bleibt stehen.' : 'Gestoppt.');
    if (question) t = (answer && answer !== question.text ? answer + '\n\n' : '') + question.text;
    const notes = [...new Set(run.notes)];
    txt.textContent = t + (notes.length ? '\n\nHinweis: ' + notes.join(' ') : '');
    if (planEl.hidden) planEl.remove();
    // Rückfrage: Antwort-Knöpfe
    if (question) {
      const row = h('div', { class: 'ai-opts' });
      for (const opt of question.options) { const b = h('button', { type: 'button', class: 'btn small', 'data-opt': '1' }, opt); b.onclick = () => { for (const x of row.querySelectorAll('button')) x.disabled = true; b.classList.add('on'); ask(opt); }; row.append(b); }
      row.append(h('small', null, question.options.length ? 'oder schreib unten deine Antwort' : 'Schreib unten deine Antwort.'));
      m.append(row);
    }
    // Drohnen-Check als Liste
    if (run.checkList) {
      const l = run.checkList, bad = l.filter((c) => c.s === 'bad' || c.s === 'warn');
      const box = h('div', { class: 'ai-check' });
      box.append(DroneCheck.rows(bad.length ? bad : l.filter((c) => c.id === 'tw' || c.id === 'weight'), (ids) => App.select(ids)));
      if (!bad.length) box.append(h('small', null, 'Propeller, Teile und Schwerpunkt: alles in Ordnung.'));
      m.append(box);
    }
    // Gespräch merken
    const ops = run.rounds.flatMap((r) => r.acts.map((a) => { try { return JSON.parse(a).op; } catch (_) { return null; } })).filter(Boolean);
    history.push({ q: run.q, a: (question ? question.text : t).slice(0, 220), ops: [...new Set(ops)].join(', '), frage: !!question });
    if (history.length > 20) history = history.slice(-20);
    // Auswahl und Ansicht
    const sel = (run.select || (run.added.length ? run.added : run.changed)).filter((id) => Model.find(App.doc, id));
    if (did && sel.length) App.select([...new Set(sel)].slice(0, 30));
    if (run.newDoc) setTimeout(() => Viewer.fit(), 800);
    else if (run.added.length) setTimeout(() => Viewer.fit(), 500);
    if (step) {
      const row = h('div', { class: 'btn-row' });
      const u = h('button', { type: 'button', class: 'btn small' }); u.innerHTML = icon('undo') + 'Rückgängig';
      u.onclick = () => {
        if (App.undoStack[App.undoStack.length - 1] !== step) { UI.toast('Danach hast du weitergearbeitet. Nimm die Schritte oben mit Rückgängig oder im Protokoll zurück.', { icon: 'info', ms: 4500 }); return; }
        App.undo(); u.disabled = true;
      };
      row.append(u);
      if (run.rounds.length > 1) row.append(h('small', { class: 'ai-rounds' }, `${run.rounds.length} Runden`));
      m.append(row);
    }
    if (panel) panel.scrollTop = panel.scrollHeight;
  }

  // ---------- Umsetzen ----------
  // Teile ansprechen: ids, "alle", "auswahl", "koerper", "loecher", "kaufteile", "neu", "name:…" oder eine Liste davon
  function pick(spec, doc, run, rep) {
    const out = [], tops = Model.activeItems(doc).filter((x) => !x.hidden);
    const add = (id) => { if (id && !out.includes(id) && Model.find(doc, id)) out.push(id); };
    const one = (s) => {
      if (s == null || s === '') return;
      if (Array.isArray(s)) { s.forEach(one); return; }
      if (typeof s === 'object') { if (s.name) one('name:' + s.name); if (s.id) one(s.id); return; }
      const k = String(s).trim(), kl = k.toLowerCase();
      if (['alle', 'alles', 'all', '*'].includes(kl)) tops.forEach((x) => add(x.id));
      else if (['auswahl', 'ausgewählt', 'ausgewaehlt', 'selection', 'das', 'es', 'hier'].includes(kl)) (run ? run.sel0 : App.sel).forEach(add);
      else if (['koerper', 'körper', 'solids'].includes(kl)) tops.filter((x) => x.role !== 'hole').forEach((x) => add(x.id));
      else if (['loecher', 'löcher', 'holes'].includes(kl)) tops.filter((x) => x.role === 'hole').forEach((x) => add(x.id));
      else if (kl === 'kaufteile') tops.filter((x) => Mass.fixedOf(x)).forEach((x) => add(x.id));
      else if (kl === 'neu') [...(run ? run.added : []), ...(rep ? rep.added : [])].forEach(add);
      else if (kl.startsWith('name:')) {
        const n = kl.slice(5).trim(); if (!n) return;
        let hits = tops.filter((x) => (x.name || '').toLowerCase().includes(n));
        if (!hits.length) Model.walk(doc.items, (x) => { if ((x.name || '').toLowerCase().includes(n)) hits.push(x); });
        hits.forEach((x) => add(x.id));
      } else add(k);
    };
    one(spec);
    return out;
  }
  const opOf = (a) => String((a && a.op) || '').toLowerCase().replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c]));
  const ALIAS = { add: 'hinzufuegen', change: 'aendern', delete: 'loeschen', group: 'verbinden', gruppieren: 'verbinden', verbund: 'verbinden', union: 'verbinden', fillet: 'rundung', pattern: 'muster', mirror: 'spiegeln', ungroup: 'loesen', subtract: 'abziehen', intersect: 'schnittmenge', align: 'ausrichten', move: 'verschieben', rotate: 'drehen', flip: 'umklappen', copy: 'kopieren', duplizieren: 'kopieren', hinlegen: 'auf_platte', drop: 'auf_platte', mass_g: 'gewicht', buy: 'kaufteil', check: 'pruefen', select: 'auswaehlen', role: 'rolle', color: 'farbe', hide: 'ausblenden', show: 'einblenden', suppress: 'unterdruecken', rename: 'umbenennen', center: 'zentrieren' };
  const TOOL = new Set(['gelenk', 'verbinden', 'loesen', 'abziehen', 'schnittmenge', 'ausrichten', 'zentrieren', 'drehen', 'umklappen', 'auf_platte', 'drohne', 'pruefen', 'schwachstellen', 'auswaehlen']);
  const STEP = { gelenk: 'legt ein Gelenk an', verbinden: 'verbindet Teile', loesen: 'löst Gruppen', abziehen: 'schneidet aus', schnittmenge: 'bildet die Schnittmenge', ausrichten: 'richtet aus', zentrieren: 'zentriert', drehen: 'dreht', umklappen: 'klappt um', auf_platte: 'legt auf die Platte', drohne: 'baut den Rahmen', pruefen: 'merkt den Check vor', schwachstellen: 'merkt die Suche vor' };
  // Aktionen der Reihe nach umsetzen: reine Änderungen am Modell gesammelt, Werkzeuge (Verbinden, Ausrichten …) einzeln mit dem fertig gerechneten Modell
  async function execute(acts, run, onStep) {
    const rep = { added: [], changed: [], notes: [], done: [], check: false, weak: false, select: null };
    let batch = [];
    const flush = () => { if (batch.length) { docOps(batch, run, rep); batch = []; } };
    for (const a of acts.slice(0, 60)) {
      if (run.stopped) break;
      if (!a || typeof a !== 'object') continue;
      let op = opOf(a); op = ALIAS[op] || op;
      const tool = TOOL.has(op) || (op === 'spiegeln' && a.kopie === false);
      if (!tool) { batch.push({ ...a, op }); continue; }
      flush();
      if (!['pruefen', 'schwachstellen', 'auswaehlen'].includes(op)) { await idle(); if (onStep) onStep(STEP[op] || op); }
      await toolOp(op === 'spiegeln' ? 'umklappen' : op, a, run, rep);
    }
    flush();
    // neue und geänderte Schritte merken sich, dass sie von der KI kommen – und auf welche Bitte
    const add = rep.added.filter((id) => Model.find(App.doc, id)), chg = rep.changed.filter((id) => Model.find(App.doc, id));
    if (add.length || chg.some((id) => !Model.find(App.doc, id).item.ai)) {
      App.change('KI-Schritte markiert', (doc) => {
        for (const id of add) { const f = Model.find(doc, id); if (f) f.item.ai = { q: run.q }; }
        for (const id of chg) { const f = Model.find(doc, id); if (f && !f.item.ai) f.item.ai = { q: run.q, edit: true }; }
      });
    }
    return rep;
  }
  const AXIS = (v) => { const s = String(v || 'z').toLowerCase(); return s === 'x' || s === 'yz' ? 'x' : s === 'y' || s === 'xz' ? 'y' : 'z'; };
  const ALIGN = { links: 'left', left: 'left', rechts: 'right', right: 'right', vorne: 'front', front: 'front', hinten: 'back', back: 'back', unten: 'bottom', bottom: 'bottom', oben: 'top', top: 'top', mitte_x: 'cx', cx: 'cx', mitte_y: 'cy', cy: 'cy' };
  async function toolOp(op, a, run, rep) {
    const ids = () => pick(a.ids ?? a.id ?? a.ziel, App.doc, run, rep);
    const name = (v) => String(v || '').trim().slice(0, 60);
    if (op === 'verbinden') {
      let list = ids(); const skipped = [];
      if (!a.mit_kaufteilen) list = list.filter((id) => { const f = Model.find(App.doc, id); if (f && Mass.fixedOf(f.item)) { skipped.push(Model.label(f.item)); return false; } return true; });
      if (skipped.length) rep.notes.push(`Kaufteile bleiben einzeln, damit ihr Gewicht stimmt: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ` und ${skipped.length - 3} weitere` : ''}.`);
      const par = list.length ? Model.find(App.doc, list[0]).parent : null;
      const other = list.filter((id) => Model.find(App.doc, id).parent !== par);
      list = list.filter((id) => !other.includes(id));
      if (list.length < 2) { rep.notes.push('Zum Verbinden braucht es mindestens zwei Teile auf derselben Ebene.'); return; }
      const nm = name(a.name) || 'Verbund';
      const gid = Actions.group(list, { name: nm, quiet: true });
      if (gid) { rep.added.push(gid); rep.done.push(`verbinden: ${list.length} Teile → „${nm}“ (id ${gid})`); }
    } else if (op === 'loesen') {
      for (const id of ids()) { const f = Model.find(App.doc, id); if (!f || f.item.kind !== 'group') continue; const nm = Model.label(f.item); Actions.ungroup(id); rep.changed.push(...App.sel); rep.done.push(`loesen: „${nm}“ → ${App.sel.length} Teile`); }
    } else if (op === 'abziehen') {
      const body = pick(a.von ?? a.koerper ?? a.id, App.doc, run, rep)[0];
      const tools = pick(a.werkzeuge ?? a.mit ?? a.ids, App.doc, run, rep).filter((id) => id !== body);
      if (!body || !tools.length) { rep.notes.push('Zum Abziehen braucht es einen Körper und mindestens ein Werkzeug.'); return; }
      Features.boolean('subtract', [body, ...tools]);
      if (App.sel[0] && App.sel[0] !== body) rep.added.push(App.sel[0]);
      rep.done.push(`abziehen: ${tools.length} aus „${labelOf(body)}“`);
    } else if (op === 'schnittmenge') {
      const list = ids(); if (list.length < 2) { rep.notes.push('Für eine Schnittmenge braucht es mindestens zwei Körper.'); return; }
      Features.boolean('intersect', list); rep.changed.push(...list); rep.done.push(`schnittmenge: ${list.length} Körper`);
    } else if (op === 'ausrichten') {
      const list = ids(); const modes = (Array.isArray(a.an) ? a.an : [a.an]).flatMap((x) => (String(x).toLowerCase() === 'mitte' ? ['cx', 'cy'] : [ALIGN[String(x).toLowerCase()]])).filter(Boolean);
      if (list.length < 2 || !modes.length) { rep.notes.push('Zum Ausrichten braucht es mindestens zwei Teile und eine Richtung.'); return; }
      for (const md of modes) { Actions.align(list, md); await idle(); }
      rep.changed.push(...list); rep.done.push(`ausrichten: ${list.length} Teile an ${modes.join(', ')}`);
    } else if (op === 'zentrieren') {
      const list = ids(); Actions.center(list); rep.changed.push(...list); rep.done.push(`zentrieren: ${list.length} Teile`);
    } else if (op === 'drehen') {
      const list = ids(); const deg = num(a.grad ?? a.winkel, 90);
      if (!list.length || typeof deg !== 'number') { rep.notes.push('Zum Drehen braucht es Teile und einen Winkel in Grad.'); return; }
      Actions.rotate(list, AXIS(a.achse), deg, false); rep.changed.push(...list); rep.done.push(`drehen: ${list.length} Teile um ${deg}° (${AXIS(a.achse)})`);
    } else if (op === 'umklappen') {
      const list = ids(); if (!list.length) return;
      Actions.mirror(list, AXIS(a.achse || ({ YZ: 'x', XZ: 'y', XY: 'z' }[String(a.ebene || '').toUpperCase()]))); rep.changed.push(...list); rep.done.push(`umklappen: ${list.length} Teile`);
    } else if (op === 'auf_platte') {
      const list = ids().filter((id) => App.doc.items.some((x) => x.id === id)); Actions.dropToPlate(list.length ? list : null, true); rep.changed.push(...list); rep.done.push(`auf_platte: ${list.length || 'alle'} Teile`);
    } else if (op === 'drohne') {
      try {
        const fr = a.rahmen && DroneLib.frames().find((f) => norm(`${f.hersteller} ${f.name}`).includes(norm(a.rahmen)) || norm(a.rahmen).includes(norm(f.name)));
        const o = fr ? DroneTpl.fromFrame(fr) : { zoll: DroneTpl.ZOLL.includes(+a.zoll) ? +a.zoll : 5, form: DroneTpl.FORMS[a.form] ? a.form : 'x' };
        o.video = DroneTpl.VIDEO[a.video] ? a.video : 'analog';
        if (a.neigung != null && isFinite(+a.neigung)) o.tilt = Math.max(0, Math.min(45, +a.neigung));
        if (a.rahmen && !fr) rep.notes.push(`Den Rahmen „${a.rahmen}“ kenne ich nicht – ich baue einen eigenen.`);
        if (a.motor && DroneLib.motors().some((m) => m.stator === String(a.motor))) o.motor = String(a.motor);
        if (a.akku && DroneLib.akku(a.akku)) o.akku = a.akku;
        if (a.arme === 'einzeln' || a.arme === 'sandwich') o.arms = 'sandwich';
        const cfg = DroneTpl.config(o), d = DroneTpl.build(cfg);
        for (const it of d.items) it.ai = { q: run.q };
        App.setDoc(d); Start.hide(); run.newDoc = true; run.depth = App.undoStack.length; run.sel0 = [];
        rep.done.push(`drohne: neues Projekt „${d.name}“ mit ${d.items.length} Teilen`);
        rep.notes.push(`Neues Projekt „${d.name}“ – dein bisheriges Projekt findest du auf der Startseite unter „Weiterarbeiten“.`);
        await idle();
      } catch (e) { rep.notes.push('Den Rahmen konnte ich nicht bauen.'); }
    } else if (op === 'gelenk') {
      const fa = pick(a.fest ?? a.a, App.doc, run, rep)[0], fb = pick(a.beweglich ?? a.b, App.doc, run, rep)[0];
      const ax = a.achse && typeof a.achse === 'object' ? a.achse : {};
      const dir = Array.isArray(ax.richtung) ? ax.richtung.map(Number) : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[String(a.achse || 'z').toLowerCase()] || [0, 0, 1];
      const pt = Array.isArray(ax.punkt) ? ax.punkt.map(Number) : Array.isArray(a.punkt) ? a.punkt.map(Number) : [0, 0, 0];
      if (!fa || !fb || ![...dir, ...pt].every((v) => Number.isFinite(v))) { rep.notes.push('Für ein Gelenk braucht es ein festes und ein bewegliches Teil und eine Achse (Punkt und Richtung).'); return; }
      const artStr = String(a.art || '');
      const jKind = /zyl|cyl/i.test(artStr) ? 'cyl' : /eben|planar/i.test(artStr) ? 'planar' : /kugel|ball/i.test(artStr) ? 'ball' : /langloch|slot|stift/i.test(artStr) ? 'slot' : /schieb|slide/i.test(artStr) ? 'slide' : 'rot';
      const r = Joints.add(fa, fb, pt, dir, { kind: jKind, min: a.von, max: a.bis, ang: a.winkel ?? a.weg, pos: a.weg, len: a.laenge });
      if (!r.ok) { rep.notes.push(r.msg); return; }
      const verb = jKind === 'slide' ? 'gleitet' : jKind === 'cyl' ? 'dreht und gleitet' : jKind === 'planar' ? 'gleitet in der Ebene' : jKind === 'ball' ? 'dreht sich frei um den Punkt' : jKind === 'slot' ? 'gleitet im Langloch' : 'dreht sich';
      rep.changed.push(fb); rep.done.push(`gelenk: „${labelOf(fb)}“ ${verb} gegenüber „${labelOf(fa)}“ (Gelenk ${r.id})`);
    } else if (op === 'pruefen') rep.check = true;
    else if (op === 'schwachstellen') rep.weak = true;
    else if (op === 'auswaehlen') rep.select = ids();
  }
  function addTo(v, d) {
    if (!d) return v;
    if (typeof v === 'number' || v == null || v === '') return round((typeof v === 'number' ? v : 0) + d, 4);
    return `(${v}) ${d < 0 ? '-' : '+'} ${Math.abs(round(d, 4))}`;
  }
  // Änderungen am Modell, die nichts Gerechnetes brauchen – alle in einem Schritt
  function docOps(batch, run, rep) {
    App.change('KI: ' + run.text.slice(0, 40), (doc) => {
      let any = false;
      const sel = (a) => pick(a.ids ?? a.id ?? a.ziel, doc, run, rep);
      for (const a of batch) {
        const op = a.op;
        if (op === 'mass') {
          const nm = String(a.name || '').trim().replace(/\s+/g, '_');
          if (!/^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/.test(nm)) continue;
          const ex = doc.params.find((p) => p.name.toLowerCase() === nm.toLowerCase());
          const val = num(a.wert ?? a.value, 10);
          if (ex) ex.expr = val; else doc.params.push({ id: uid('m'), name: nm, expr: val });
          rep.done.push(`mass: ${nm} = ${val}`); any = true;
        } else if (op === 'hinzufuegen') {
          const it = buildItem(a.objekt || a.object || {}, rep.notes); if (!it) continue;
          const tgt = a.in ? Model.find(doc, a.in) : null;
          if (tgt && tgt.item.kind === 'group') tgt.item.children.push(it); else doc.items.push(it);
          rep.added.push(it.id); rep.done.push(`hinzufuegen: „${Model.label(it)}“ (id ${it.id})`); any = true;
        } else if (op === 'aendern') {
          const list = sel(a); if (!list.length) { rep.notes.push('Ein Objekt zum Ändern gab es nicht.'); continue; }
          const s = a.setze || a.set || {};
          for (const id of list) {
            const f = Model.find(doc, id); if (!f) continue;
            if (s.name && list.length === 1) f.item.name = String(s.name).slice(0, 60);
            if (s.rolle) f.item.role = s.rolle === 'loch' ? 'hole' : 'solid';
            if (s.p && typeof s.p === 'object') {
              if (f.item.kind === 'extrude') { if (s.p.hoehe != null) f.item.p.dist = num(s.p.hoehe, f.item.p.dist); if (s.p.richtung) f.item.p.dir = s.p.richtung; }
              else Object.assign(f.item.p, cleanP(f.item.kind, s.p));
            }
            if (s.t) Object.assign(f.item.t, cleanT(s.t));
            if (s.farbe && /^#[0-9a-f]{6}$/i.test(s.farbe)) f.item.color = s.farbe;
            rep.changed.push(id);
          }
          rep.done.push(`aendern: ${list.length} Teile`); any = true;
        } else if (op === 'loeschen') {
          const list = sel(a); let n = 0;
          for (const id of list) { const f = Model.find(doc, id); if (f) { f.list.splice(f.list.indexOf(f.item), 1); n++; } }
          if (n) { rep.done.push(`loeschen: ${n} Teile`); any = true; }
        } else if (op === 'rundung') {
          const list = sel(a);
          for (const id of list) {
            const f = Model.find(doc, id); if (!f) continue;
            f.item.finishes = f.item.finishes || [];
            if (a.ersetzen) f.item.finishes = f.item.finishes.filter((x) => x.type === 'shell');
            f.item.finishes.push({ id: uid('f'), type: a.typ === 'chamfer' ? 'chamfer' : a.typ === 'draft' ? 'draft' : 'fillet', r: num(a.r, a.typ === 'draft' ? 3 : 1), edges: ['all', 'top', 'bottom', 'vertical', 'horizontal'].includes(a.kanten) ? a.kanten : 'all' });
            rep.changed.push(id);
          }
          if (list.length) { rep.done.push(`rundung: ${list.length} Teile, r ${a.r}`); any = true; }
        } else if (op === 'muster' && /kurve|pfad|path|curve/i.test(a.art || '')) {
          const id = sel(a)[0]; if (!id) { rep.notes.push('Das Objekt für das Muster gab es nicht.'); continue; }
          const ents = curveEnts(a.kurve);
          if (!ents.length) { rep.notes.push('Für das Muster entlang Kurve fehlte die Kurve.'); continue; }
          { // Startpunkt markieren: die Lage des Originals, sonst der Anfang des ersten Stücks
            const t = (Model.find(doc, id) || { item: {} }).item.t || {}, tx = Number(t.x), ty = Number(t.y);
            const e0 = ents[0], start = isFinite(tx) && isFinite(ty) ? [tx, ty] : e0.type === 'spline' ? e0.pts[0] : e0.type === 'circle' ? [e0.c[0] - e0.r, e0.c[1]] : e0.a;
            ents.unshift({ id: uid('e'), type: 'point', a: start });
          }
          const sketch = { plane: { o: [0, 0, num(a.hoehe, 0)], x: [1, 0, 0], n: [0, 0, 1] }, ents, dims: [], cons: [] };
          const G = wrapIn(doc, id, Features.NAMES.path, { op: 'pattern', pt: 'path', n: Math.max(1, Math.round(num(a.n, 5))), d: Math.max(0, num(a.abstand, 0)), align: a.drehen !== false, sketch });
          if (G) { rep.added.push(G.id); rep.done.push(`muster: entlang Kurve mit „${labelOf(id)}“ (id ${G.id})`); any = true; }
        } else if (op === 'muster') {
          const id = sel(a)[0]; if (!id) { rep.notes.push('Das Objekt für das Muster gab es nicht.'); continue; }
          const circ = /kreis|circ/i.test(a.art || '');
          const mitte = Array.isArray(a.mitte) ? a.mitte : [0, 0];
          const axis = ['x', 'y'].includes(String(a.achse || '').toLowerCase()) ? String(a.achse).toLowerCase() : null;
          // beliebige Achse: "achse":[dx,dy,dz] und "mitte":[x,y,z]
          const av = Array.isArray(a.achse) && a.achse.length === 3 ? a.achse.map((v) => num(v, 0)) : null, al = av ? Math.hypot(...av) : 0;
          const free = av && al > 1e-9 ? { axis: 'pick', ad: av.map((v) => Math.round((v / al) * 1e9) / 1e9), ao: [num(mitte[0], 0), num(mitte[1], 0), num(mitte[2], 0)] } : null;
          const G = circ ? wrapIn(doc, id, Features.NAMES.circ, { op: 'pattern', pt: 'circ', n: Math.max(1, Math.round(num(a.n, 4))), ang: num(a.winkel, 360), cx: num(mitte[0], 0), cy: num(mitte[1], 0), ...(free || (axis ? { axis, cz: num(mitte[2], 0) } : {})) })
            : wrapIn(doc, id, Features.NAMES.rect, { op: 'pattern', pt: 'rect', nx: Math.max(1, Math.round(num(a.nx, 2))), ny: Math.max(1, Math.round(num(a.ny, 1))), dx: num(a.dx, 20), dy: num(a.dy, 20) });
          if (G) { rep.added.push(G.id); rep.done.push(`muster: ${circ ? 'Kreis' : 'Rechteck'} um „${labelOf(id)}“ (id ${G.id})`); any = true; }
        } else if (op === 'spiegeln') {
          const id = sel(a)[0]; if (!id) { rep.notes.push('Das Objekt zum Spiegeln gab es nicht.'); continue; }
          const G = wrapIn(doc, id, Features.NAMES.mirror, { op: 'pattern', pt: 'mirror', plane: ['YZ', 'XZ', 'XY'].includes(String(a.ebene).toUpperCase()) ? String(a.ebene).toUpperCase() : 'YZ', off: num(a.lage, 0) });
          if (G) { rep.added.push(G.id); rep.done.push(`spiegeln: „${labelOf(id)}“ mit Kopie (id ${G.id})`); any = true; }
        } else if (op === 'verschieben') {
          const list = sel(a);
          for (const id of list) {
            const f = Model.find(doc, id); if (!f) continue;
            if (a.nach && list.length === 1) Object.assign(f.item.t, cleanT(a.nach));
            else if (a.um) for (const k of ['x', 'y', 'z']) { const d = num(a.um[k], 0); if (typeof d === 'number') f.item.t[k] = addTo(f.item.t[k], d); }
            rep.changed.push(id);
          }
          if (list.length) { rep.done.push(`verschieben: ${list.length} Teile`); any = true; }
        } else if (op === 'kopieren') {
          const list = sel(a), n = Math.max(1, Math.min(20, Math.round(num(a.anzahl, 1)) || 1)), v = a.versatz || { x: 10, y: 10 };
          for (const id of list) {
            const f = Model.find(doc, id); if (!f) continue;
            let at = f.list.indexOf(f.item);
            for (let k = 1; k <= n; k++) {
              const c = Model.reId(deepClone(f.item)); delete c.ai;
              for (const ax of ['x', 'y', 'z']) { const d = num(v[ax], 0); if (typeof d === 'number' && d) c.t[ax] = addTo(c.t[ax], d * k); }
              f.list.splice(++at, 0, c); rep.added.push(c.id);
            }
          }
          if (list.length) { rep.done.push(`kopieren: ${list.length} Teile × ${n}`); any = true; }
        } else if (['rolle', 'farbe', 'ausblenden', 'einblenden', 'unterdruecken', 'aktivieren', 'umbenennen'].includes(op)) {
          const list = sel(a); let n = 0;
          for (const id of list) {
            const f = Model.find(doc, id); if (!f) continue; const it = f.item;
            if (op === 'rolle') it.role = /loch|hole/i.test(a.rolle || '') ? 'hole' : 'solid';
            else if (op === 'farbe') { if (!/^#[0-9a-f]{6}$/i.test(a.farbe || '')) continue; it.color = a.farbe; }
            else if (op === 'ausblenden') it.hidden = true;
            else if (op === 'einblenden') delete it.hidden;
            else if (op === 'unterdruecken' || op === 'aktivieren') { if (!doc.items.includes(it)) continue; if (op === 'unterdruecken') it.suppressed = true; else delete it.suppressed; }
            else if (op === 'umbenennen') { if (!a.name) continue; it.name = String(a.name).slice(0, 60); }
            rep.changed.push(id); n++;
          }
          if (n) { rep.done.push(`${op}: ${n} Teile`); any = true; }
        } else if (op === 'verrechnen') {
          const MODE = { vereinigen: 'join', join: 'join', abziehen: 'cut', cut: 'cut', schnittmenge: 'common', common: 'common', eigener: null, neu: null };
          const mode = String(a.modus || '').toLowerCase();
          if (!(mode in MODE)) { rep.notes.push(`Den Modus „${a.modus}“ kenne ich nicht (vereinigen, abziehen, schnittmenge, eigener).`); continue; }
          const tg = MODE[mode] ? sel({ ids: a.ziel }) : [];
          const tid = tg.find((id) => doc.items.some((x) => x.id === id));
          if (MODE[mode] && !tid) { rep.notes.push('Für „verrechnen“ fehlt ein Zielkörper ganz oben im Verlauf.'); continue; }
          let n = 0;
          for (const id of sel(a)) {
            const it = doc.items.find((x) => x.id === id); if (!it || id === tid) continue;
            if (!MODE[mode]) { delete it.op; n++; continue; }
            if (doc.items.indexOf(it) < doc.items.findIndex((x) => x.id === tid)) { rep.notes.push(`„${it.name}“ kommt im Verlauf vor dem Ziel – verrechnen geht nur mit früheren Körpern.`); continue; }
            it.op = { type: MODE[mode], target: tid }; if (it.role === 'hole') it.role = 'solid'; rep.changed.push(id); n++;
          }
          if (n) { rep.done.push(`verrechnen (${mode}): ${n} Teile`); any = true; }
        } else if (op === 'material') {
          const m = MATERIALS.find((x) => x.k.toLowerCase() === String(a.material || '').toLowerCase());
          if (!m) { rep.notes.push(`Das Material „${a.material}“ kenne ich nicht.`); continue; }
          const list = sel(a).filter((id) => doc.items.some((x) => x.id === id));
          if (!list.length) { rep.notes.push('Material geht nur für Teile der obersten Ebene.'); continue; }
          for (const id of list) { const f = doc.items.find((x) => x.id === id); f.mat = m.k; delete f.massG; rep.changed.push(id); }
          rep.done.push(`material: ${m.k} für ${list.length} Teile`); any = true;
        } else if (op === 'gewicht') {
          const list = sel(a).filter((id) => doc.items.some((x) => x.id === id));
          if (!list.length) { rep.notes.push('Ein festes Gewicht geht nur für Teile der obersten Ebene.'); continue; }
          for (const id of list) { const f = doc.items.find((x) => x.id === id); delete f.mat; f.massG = num(a.g, ''); rep.changed.push(id); }
          rep.done.push(`gewicht: ${a.g} g`); any = true;
        } else if (op === 'kaufteil') {
          const b = buySpec(a.name); if (!b) { rep.notes.push(`Das Kaufteil „${a.name}“ steht nicht in der Bibliothek.`); continue; }
          const it = Model.newItem(b.kind, { ...b.p }, { name: b.name, color: b.color });
          it.massG = b.massG; Object.assign(it.t, cleanT(a.t));
          doc.items.push(it); rep.added.push(it.id); rep.done.push(`kaufteil: „${b.name}“ (id ${it.id})`); any = true;
        } else if (op) rep.notes.push(`Die Aktion „${op}“ kenne ich nicht.`);
      }
      return any ? undefined : false;
    });
  }
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
  function formEnts(form) {
    const ents = [];
    for (const el of form || []) {
      if (el.rect && el.rect.length === 4) ents.push({ id: uid('e'), type: 'rect', a: [num(el.rect[0], 0), num(el.rect[1], 0)], b: [num(el.rect[2], 10), num(el.rect[3], 10)] });
      else if (el.circle && el.circle.length === 3) ents.push({ id: uid('e'), type: 'circle', c: [num(el.circle[0], 0), num(el.circle[1], 0)], r: Math.abs(num(el.circle[2], 5)) });
      else if (el.ellipse && el.ellipse.length >= 4) ents.push({ id: uid('e'), type: 'ellipse', c: [num(el.ellipse[0], 0), num(el.ellipse[1], 0)], rx: Math.abs(num(el.ellipse[2], 5)), ry: Math.abs(num(el.ellipse[3], 3)), rot: 0 });
      else if (el.slot && el.slot.length === 5) ents.push({ id: uid('e'), type: 'slot', a: [num(el.slot[0], 0), num(el.slot[1], 0)], b: [num(el.slot[2], 10), num(el.slot[3], 0)], r: Math.abs(num(el.slot[4], 2)) });
      else if (Array.isArray(el.poly) && el.poly.length >= 3) { const pts = el.poly.map((q) => [num(q[0], 0), num(q[1], 0)]); for (let i = 0; i < pts.length; i++) ents.push({ id: uid('e'), type: 'line', a: pts[i], b: pts[(i + 1) % pts.length] }); }
      else if (typeof el.text === 'string' && el.text) {
        const te = { id: uid('e'), type: 'text', a: [num(el.x, 0), num(el.y, 0)], s: el.text, h: Math.abs(num(el.hoehe, 5)), font: el.fett ? 'fett' : 'inter', align: el.mitte ? 'm' : 'l', rot: (num(el.drehung, 0) * Math.PI) / 180 };
        const bg = num(el.bogen, 0); if (Math.abs(bg) > 1e-6) te.bend = bg;
        // entlang einer Kurve: Hilfslinie (Spline durch die Punkte), der Text folgt ihr
        const ep = Array.isArray(el.entlang) ? el.entlang.filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [num(q[0], 0), num(q[1], 0)]) : [];
        if (ep.length >= 2) { const sp = { id: uid('e'), type: 'spline', pts: ep, closed: false, con: true }; const pts = SK.textPathPts(sp, !!el.andereSeite); if (pts) { ents.push(sp); te.on = sp.id; te.onP = pts; te.align = 'm'; delete te.bend; if (el.andereSeite) te.flip = true; } }
        ents.push(te);
      }
    }
    return ents;
  }
  function buildItem(o, notes) {
    const kind = String(o.art || o.kind || '').toLowerCase();
    if (!KMAP[kind]) { notes.push(`„${o.art}“ kenne ich nicht.`); return null; }
    const role = o.rolle === 'loch' || o.role === 'hole' ? 'hole' : 'solid';
    let it;
    if (kind === 'extrude') {
      const pl = PLANEDEF[String(o.p && o.p.ebene || 'XY').toUpperCase()] || PLANEDEF.XY;
      const off = num(o.p && o.p.versatz, 0);
      const plane = { o: pl.n.map((v) => v * (typeof off === 'number' ? off : 0)), x: pl.x, n: pl.n };
      const ents = formEnts(o.p && o.p.form);
      if (!ents.length) { notes.push('Eine Skizze war leer.'); return null; }
      it = Model.newItem('extrude', {}, { name: o.name || 'Skizzenkörper', role });
      it.p = { sketch: { plane, ents }, dist: num(o.p.hoehe ?? o.p.dist, 10), dir: ['normal', 'reverse', 'both'].includes(o.p.richtung) ? o.p.richtung : 'normal' };
    } else if (kind === 'loft') {
      const sketches = [];
      for (const pr of (o.p && o.p.profile) || []) {
        const pl = PLANEDEF[String(pr.ebene || 'XY').toUpperCase()] || PLANEDEF.XY, off = num(pr.versatz, 0);
        const ents = formEnts(pr.form || []); if (!ents.length) continue;
        sketches.push({ plane: { o: pl.n.map((v) => v * off), x: pl.x, n: pl.n }, ents, dims: [], cons: [] });
      }
      const tip = num(o.p && o.p.spitze, 0);
      if (sketches.length < (tip > 0 ? 1 : 2)) { notes.push('Ein Übergang braucht mindestens zwei Profile (oder ein Profil mit Spitze).'); return null; }
      it = Model.newItem('loft', { sketches, ruled: !!(o.p && o.p.gerade), tip }, { name: o.name || 'Übergang', role });
      const ml = o.p && o.p.mittellinie;
      if (ml && sketches.length >= 2) {
        const pl = PLANEDEF[String(ml.ebene || 'XZ').toUpperCase()] || PLANEDEF.XZ, off = num(ml.versatz, 0);
        const ents = curveEnts(ml.kurve).filter((e) => e.type !== 'circle');
        if (ents.length && SK.chains(ents).length) { it.p.path = { plane: { o: pl.n.map((v) => v * off), x: pl.x, n: pl.n }, ents, dims: [], cons: [] }; it.p.tip = 0; }
        else notes.push('Die Mittellinie war keine offene Kurve – der Übergang nimmt den kürzesten Weg.');
      }
      const fk = o.p && o.p.fuehrungskurve;
      if (fk && !it.p.path && sketches.length >= 2) {
        const pl = PLANEDEF[String(fk.ebene || 'XZ').toUpperCase()] || PLANEDEF.XZ, off = num(fk.versatz, 0);
        const ents = curveEnts(fk.kurve).filter((e) => e.type !== 'circle');
        if (ents.length && SK.chains(ents).length) { it.p.rail = { plane: { o: pl.n.map((v) => v * off), x: pl.x, n: pl.n }, ents, dims: [], cons: [] }; it.p.tip = 0; }
        else notes.push('Die Führungskurve war keine offene Kurve – der Übergang nimmt den kürzesten Weg.');
      }
      const fk2 = o.p && o.p.fuehrungskurve2;
      if (fk2 && it.p.rail && sketches.length >= 2) {
        const pl = PLANEDEF[String(fk2.ebene || 'YZ').toUpperCase()] || PLANEDEF.YZ, off = num(fk2.versatz, 0);
        const ents = curveEnts(fk2.kurve).filter((e) => e.type !== 'circle');
        if (Math.abs(pl.n[0] * it.p.rail.plane.n[0] + pl.n[1] * it.p.rail.plane.n[1] + pl.n[2] * it.p.rail.plane.n[2]) > 0.9) notes.push('Die zweite Führungskurve muss in einer anderen Ebene liegen als die erste – sie wurde weggelassen.');
        else if (ents.length && SK.chains(ents).length) it.p.rail2 = { plane: { o: pl.n.map((v) => v * off), x: pl.x, n: pl.n }, ents, dims: [], cons: [] };
        else notes.push('Die zweite Führungskurve war keine offene Kurve – sie wurde weggelassen.');
      }
    } else if (kind === 'sweep') {
      const pl = PLANEDEF[String(o.p && o.p.ebene || 'XY').toUpperCase()] || PLANEDEF.XY, off = num(o.p && o.p.versatz, 0);
      const p3 = ((o.p && o.p.pfad3d) || []).filter((q) => Array.isArray(q) && q.length >= 3).map((q) => [num(q[0], 0), num(q[1], 0), num(q[2], 0)]);
      if (p3.length >= 2) {
        it = Model.newItem('sweep', { path3d: { pts: p3, smooth: o.p.glatt !== false }, shape: o.p.form === 'rechteck' ? 'rect' : 'circle', d: num(o.p.d, 6), w: num(o.p.w, 6), h: num(o.p.h, 4), wall: num(o.p.wand, 0), twist: num(o.p.verdrehung, 0) }, { name: o.name || 'Rohr im Raum', role });
        const rg = Array.isArray(o.p.regeln) ? o.p.regeln.slice(0, p3.length - 1).map((r) => { if (!r || typeof r !== 'object') return null; const x = {}; const ax = String(r.achse || '').toLowerCase(); if (['x', 'y', 'z'].includes(ax)) x.ax = ax; else if (ax === 'rechtwinklig') x.ax = 'perp'; else if (ax === 'parallel') x.ax = 'par'; if (r.laenge != null && r.laenge !== '' && r.laenge !== 0) x.len = typeof r.laenge === 'string' ? r.laenge : num(r.laenge, 0); return Object.keys(x).length ? x : null; }) : [];
        if (rg.some(Boolean)) it.p.path3d.rules = rg;
      } else {
      const pts = ((o.p && o.p.pfad) || []).map((q) => [num(q[0], 0), num(q[1], 0)]);
      if (pts.length < 2) { notes.push('Ein Pfad braucht mindestens zwei Punkte.'); return null; }
      const ents = o.p.glatt ? [{ id: uid('e'), type: 'spline', pts, closed: false }] : pts.slice(1).map((q, i) => ({ id: uid('e'), type: 'line', a: pts[i], b: q }));
      it = Model.newItem('sweep', { sketch: { plane: { o: pl.n.map((v) => v * off), x: pl.x, n: pl.n }, ents, dims: [], cons: [] }, shape: o.p.form === 'rechteck' ? 'rect' : 'circle', d: num(o.p.d, 6), w: num(o.p.w, 6), h: num(o.p.h, 4), wall: num(o.p.wand, 0), twist: num(o.p.verdrehung, 0) }, { name: o.name || 'Entlang Pfad', role });
      }
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
    for (const r of o.rundungen || []) if (r && (r.r || r.r === 0)) it.finishes.push({ id: uid('f'), type: r.typ === 'chamfer' ? 'chamfer' : r.typ === 'draft' ? 'draft' : 'fillet', r: num(r.r, r.typ === 'draft' ? 3 : 1), edges: ['all', 'top', 'bottom', 'vertical', 'horizontal'].includes(r.kanten) ? r.kanten : 'all' });
    return it;
  }
  // Kurve für „Muster entlang Kurve“ aus einer kurzen Beschreibung: Linien, Bögen, Splines oder ein Kreis
  function curveEnts(list) {
    const P = (q) => (Array.isArray(q) && q.length >= 2 && q.every((v) => isFinite(Number(v))) ? [Number(q[0]), Number(q[1])] : null);
    const out = [];
    for (const k of Array.isArray(list) ? list.slice(0, 40) : list ? [list] : []) {
      const t = String((k && k.typ) || '').toLowerCase();
      if (t === 'kreis') { const c = P(k.mitte), r = Number(k.r); if (c && r > 0) out.push({ id: uid('e'), type: 'circle', c, r }); }
      else if (t === 'bogen') { const a = P(k.von), m = P(k.durch), b = P(k.bis); if (a && m && b && SK.arcInfo(a, m, b)) out.push({ id: uid('e'), type: 'arc', a, m, b }); }
      else if (t === 'spline') { const pts = (k.punkte || []).map(P).filter(Boolean); if (pts.length >= 2) out.push({ id: uid('e'), type: 'spline', pts }); }
      else { const a = P(k.von), b = P(k.bis); if (a && b && SK.d2(a, b) > 1e-6) out.push({ id: uid('e'), type: 'line', a, b }); }
    }
    return out;
  }
  // Feature-Gruppe (Muster, Spiegelung) um ein Objekt legen – wie Features.pattern, aber innerhalb einer Änderung
  function wrapIn(doc, id, name, p) {
    const f = Model.find(doc, id); if (!f) return null;
    const G = Model.newItem('group', {}, { name, color: f.item.color, role: f.item.role === 'hole' ? 'hole' : 'solid' });
    G.p = p; G.children = [f.item];
    f.list.splice(f.list.indexOf(f.item), 1, G);
    return G;
  }
  // Aktionen ohne Gespräch umsetzen (z. B. „Umsetzen“ bei einem Vorschlag) – auch das ist danach ein Rückgängig-Schritt
  async function apply(acts, text) {
    const run = newRun(text); UI.mute(true); let rep = null;
    try { rep = await execute(acts, run); } finally { const t = UI.mute(false); if (rep) rep.toasts = t; }
    if (App.undoStack.length > run.depth) App.squash(run.depth, 'KI: ' + String(text || '').slice(0, 40));
    const sel = (rep.select || (rep.added.length ? rep.added : rep.changed)).filter((id) => Model.find(App.doc, id));
    if (sel.length) App.select([...new Set(sel)].slice(0, 30));
    return rep;
  }
  // für Erklären und Schwachstellen: eine Frage mit JSON-Antwort
  async function json(prompt, opts = {}) {
    const sample = await sampler(); if (!sample) return { error: 'Die KI gibt es nur, wenn Tracery in Claude geöffnet ist.' };
    try { return { res: await sample.json(prompt, { modelTier: 'default', cache: false, ...opts }) }; } catch (e) { return { error: errText(e) }; }
  }
  return { ask, json, apply, pick, local, compactItem, modelText, open: ensurePanel, ACTIONS, RULES, SUGGESTIONS, get available() { return !off; }, get working() { return !!current; } };
})();
