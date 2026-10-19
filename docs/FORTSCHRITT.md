# Fortschritt

Stand: 19.10.2026 · nach Sitzung 9 von 14

## Erledigt

- [x] Code auf GitHub / im Ordner `cad-programm`
- [x] Bauplan und Ideensammlung im Repository
- [x] Icon-Set mit 59 Werkzeug-Icons (Gemini + überarbeitet)
- [x] Exakter Geometrie-Kern (OpenCascade, war schon im Vorgänger)
- [x] Druckplatte und 3D-Druck-Teile entfernt
- [x] Ursprungsebenen XY / XZ / YZ und Achsen
- [x] Raster: fest oder automatisch passend zum Zoom
- [x] Orthografisch / Perspektive (Taste O), Ansichten 1 / 3 / 7 / 0
- [x] Tiefes Hineinzoomen ohne Flimmern
- [x] STEP-Export, Download auch außerhalb von Claude
- [x] Zeitleiste: Schritte, Marker zurückrollen, neue Schritte am Marker
- [x] Schritte unterdrücken
- [x] Fehlerhafte Schritte rot, Fehler in normaler Sprache mit Lösungstipp
- [x] Protokoll mit Uhrzeit, Filter, „Bis hierher zurück“
- [x] Undo / Redo (300 Schritte)
- [x] Parameter-Tabelle „Maße“ mit Formeln (war schon im Vorgänger)
- [x] Darstellungsqualität Grob / Normal / Fein / Sehr fein
- [x] Automatisches Nachschärfen beim Hineinzoomen (und Vergröbern beim Herauszoomen)
- [x] Einstellungen-Fenster: Design hell / dunkel / System, Nachkommastellen, Qualität
- [x] Projektdatei speichern / öffnen auch außerhalb von Claude, per Ziehen ins Fenster
- [x] Zeitleiste, Marker und Unterdrücken bleiben in der Projektdatei erhalten
- [x] Bauteile: Gruppe „im Kontext“ bearbeiten – eigene Zeitleiste, Rest durchsichtig, neue Teile landen im Bauteil
- [x] Neues (leeres) Bauteil anlegen
- [x] Isolieren: nur ein Teil zeigen
- [x] Zahleneingabe beim Ziehen: Verschieben, Größe, Höhe und Drehung exakt eintippen
- [x] Materialtabelle mit 18 Materialien (Gemini, geprüft); Gewicht des ganzen Projekts im Panel „Projekt“
- [x] Fehlermeldungen in Alltagssprache (Gemini, angepasst): 16 Fälle, 3 schon mit dem CAD-Kern verbunden
- [x] Neuer Name: Tracery (englisch für Maßwerk)
- [x] Logo (Variante 1 von Gemini, eingepasst) in Kopfzeile, Startseite und als Browser-Symbol
- [x] Hilfetexte für 47 Werkzeuge (Gemini, angepasst): kurz drauf bleiben zeigt Anleitung und Tipp
- [x] Skizzen-Maße: Werkzeug „Maß“ (D), eingetippte Werte werden feste Maße mit Schloss
- [x] Maße als Formel (z. B. `breite/2`) – ändert man `breite` unter „Maße“, wächst das Teil mit
- [x] Feste Maße bleiben beim Ziehen erhalten, verbundene Linien wandern mit
- [x] Doppelklick auf einen Skizzenkörper öffnet seine Skizze
- [x] Im Bauteil-Modus lassen sich Unterteile direkt im Bild anklicken
- [x] Tastenkürzel-Übersicht mit `?`, neue Tasten E (bearbeiten) und I (isolieren)
- [x] Schrauben-Tabelle M1.6–M8 (Gemini, geprüft und korrigiert): Senkungen jetzt normgerecht, Loch eng / mittel / weit / Kernloch wählbar
- [x] Einführung „Deine erste Skizze“ in 8 Schritten (Gemini, angepasst) – Startseite, Menü ⋯ und Eingabezeile
- [x] Neuer Name beim Maß (z. B. `breite`) wird automatisch unter „Maße“ angelegt
- [x] Formel-Beispiele unter „Maße“ (Gemini, alle 12 mit Tracerys Rechner nachgeprüft), Beispiel-Maße per Klick
- [x] Umbenennen / Entfernen eines Maßes wirkt jetzt auch auf Skizzen-Maße
- [x] Automatischer Klicktest `tests/klicktest.py`: 66 Durchläufe (alle grün), 90 von 106 Punkten der Testliste automatisch geprüft
- [x] Aufgeräumt: Programm liegt jetzt in 28 Quelldateien unter `app/src/`, `tools/build.py` baut daraus `app/index.html`
- [x] Notizstift (Taste N): freie Striche, die am Modell kleben, Textnotizen, 6 Farben, 3 Dicken, Radierer, ein-/ausblendbar – ohne technische Bedeutung
- [x] Symbole für den Notizstift (Gemini, geprüft); Augen-Knopf rechts im Bild blendet Notizen aus, sobald es welche gibt
- [x] Löser für Skizzen: Maße und Regeln werden gemeinsam erfüllt, verbundene Umrisse bleiben geschlossen
- [x] 9 Regeln: waagerecht, senkrecht, parallel, rechtwinklig, tangential, gleich, symmetrisch, deckungsgleich, fixiert – als zweite Leiste in der Skizze
- [x] Blau = noch beweglich, dunkel = voll bestimmt; rechts steht, wie viele Freiheiten noch fehlen
- [x] Widersprüche werden abgelehnt („Zu viele Regeln in der Skizze“), überflüssige Regeln auch
- [x] Neue Maße: Abstand Punkt–Punkt, Abstand Punkt–Linie, Winkel zwischen Linien, Radius von Bögen
- [x] Ziehen in der Skizze über den Löser: feste Teile bleiben, Regeln bleiben erfüllt
- [x] Kanten einer Körperfläche in die Skizze übernehmen
- [x] Spline (Taste S): weiche Kurve durch Punkte, offen oder geschlossen, Punkte einzeln ziehbar; zählt wie Linien zu Flächen
- [x] Trimmen (T): rote Vorschau, Klick oder Wischen; Rechteck, Vieleck und Langloch werden dafür in Linien zerlegt; Schnittstellen werden per Regel „Punkt auf Linie“ verbunden
- [x] Versatz (F): Linie, Kette mit Ecken, Bogen, Kreis, Rechteck, Vieleck, Langloch, Spline; Abstand per Maus oder eintippen (auch Formel); bleibt über die Regel „Versatz“ am Original, Abstand später änderbar
- [x] Spiegeln (M): Achse anklicken, Elemente wählen, Enter; legt Symmetrie-Regeln (und gleiche Radien) an – das Spiegelbild folgt dem Original
- [x] Rechteckmuster (Q) und Kreismuster (W): Anzahl, Abstand bzw. Winkel, Mittelpunkt wählbar; Kopien hängen über die Regel „Muster“ am Original
- [x] Besseres Fangen: Endpunkte, Mitten, Mittelpunkte, Kreispunkte, Schnittpunkte, Lot, Tangente, „auf Linie“, Ausrichtung, Raster – je Art abschaltbar (rechts „Fangen“), Alt = nicht fangen, eigene Markierungsform je Art
- [x] Hilfslinien (Taste X): neue Elemente als Hilfslinien zeichnen oder das gewählte umwandeln; zählen nicht zur Fläche
- [x] Hilfetexte für Spline, Trimmen, Versatz angepasst; neu: Spiegeln, Rechteck- und Kreismuster, Hilfslinien (Datei und eingebettete Fassung gleich)
- [x] Neues Bauteil `app/src/js/17-sketchops.js` (Schnittpunkte, Trimmen, Versatz, Spiegeln, Muster) – rechnet ohne Anzeige
- [x] Bohrungs-Assistent: Fläche anklicken → „Bohrung“ → Durchgangsloch, Gewinde (Kernloch), Gewindeeinsatz oder Mutternfalle, Größe, Kopf, Passung, Tiefe oder „durch“; danach setzt jeder Klick ein weiteres Loch, Ring-Vorschau auf der Fläche, Esc beendet
- [x] Rechteckmuster, Kreismuster und gespiegelte Kopie für Körper und Löcher (auch ein Loch innerhalb einer Platte → Lochkreis für Motoren); Anzahl, Abstand, Winkel, Mitte und Ebene rechts änderbar, auch mit Formeln; das Original bestimmt alle Kopien; „Auflösen“ behält nur das Original
- [x] Teilen an einer Ebene (waagerecht / von vorne / von der Seite), Lage, welche Hälfte bleibt, Spalt zum Auseinanderrücken
- [x] Boolesch für mehrere gewählte Körper: Vereinigen, Abziehen (der zuerst gewählte bleibt), Schnittmenge
- [x] Wandstärke (Aushöhlen): Fläche anklicken → „Aushöhlen“, Wand rechts einstellbar, weitere Flächen per Klick öffnen/schließen; zu dicke Wand wird rot mit Höchstwert
- [x] Hilfetexte für die Formen-Werkzeuge an das echte Verhalten angepasst
- [x] Neues Bauteil `app/src/js/46-features.js`; der CAD-Kern rechnet Muster, Teilen, Schnittmenge und Aushöhlen selbst
- [x] Schnitt (Taste C): Ebene von vorne / von der Seite / waagerecht, Lage per Regler oder eintippen, umdrehen; Schnittfläche schraffiert; Klicks gehen durch den weggeschnittenen Teil
- [x] Röntgen (Taste X, Knopf rechts im Bild): Körper durchsichtig, alle Kanten sichtbar, zweiter Klick wählt das Teil dahinter
- [x] Explosion (Taste U): Teile weich auseinander, Schichten nach oben, Regler für die Weite; anklicken und rechts ändern geht weiter; Ziehen, Skizze, Bohren, Messen und Notizen setzen vorher zusammen
- [x] Fokus-Vorschau: kleines zweites Fenster zeigt das gewählte Teil allein und groß, eigene Drehung per Ziehen
- [x] Darstellung beim Drehen: Braucht ein Bild zu lange, wird während der Bewegung kurz gröber gezeichnet, in Ruhe sofort wieder scharf
- [x] Neuer Knopf „Ansicht“ oben, neues Bauteil `app/src/js/53-views.js`; nichts davon ändert das Modell oder die Zeitleiste
- [x] Anleitungen (Hilfetexte) erscheinen jetzt auch an den Knöpfen an einer Fläche (Bohrung, Aushöhlen, Muster …) und im Ansicht-Menü
- [x] FPV-Standardmaße (Gemini Prompt E, geprüft und korrigiert: Motor-Lochkreis als eigene Zahl, 1103 mit M1.6, 2806.5-Glocke 35 mm, 20×20 mit M2 oder M3, 30,5er-Platine 36 mm, 3"-Nabe 1,5 oder 5 mm) in `app/data/fpv-masse.json` – für Sitzung 11 und 12

## Offen

### Stufe 1 – Fundament
Fertig.

### Stufe 2 – Skizzen
- [x] Skizze auf Körperflächen (war schon da, in Sitzung 5 geprüft)
- [x] Bemaßung mit Formeln, nachträglich bearbeiten (Sitzung 5)
- [x] Bedingungen mit Solver (Sitzung 6)
- [x] Trimmen, Versatz, Spiegeln, Muster in der Skizze (Sitzung 7)
- [x] Spline, Fangen, Hilfslinien (Sitzung 7)
- [ ] Spline als glatte Kurve im Kern (heute wird sie für das Hochziehen in kurze Linien zerlegt)
- [ ] Muster und Versatz: Anzahl/Abstand nachträglich für das ganze Muster ändern (heute je Kopie über das Regel-Symbol)
- [ ] Spiegeln an der X- oder Y-Achse ohne eigene Linie

### Stufe 3 – Features und Ansichten
- [x] Bohrungs-Assistent, Wandstärke, Muster, Spiegeln, Boolesch, Teilen (Sitzung 8)
- [ ] Muster entlang einer Kante oder Kurve; Kreismuster um eine schräge Achse (heute immer um die Senkrechte)
- [ ] Bohrung an einem Skizzenpunkt (heute per Klick auf eine Fläche)
- [x] Explosionsansicht, Fokus-Vorschau, Schnitt, Röntgen (Sitzung 9)
- [ ] Explosion auch für die Teile innerhalb einer Gruppe (heute nur oberste Ebene)
- [ ] Schnitt an einer beliebigen Fläche statt nur an den drei Grundebenen
- [ ] Messen, Material pro Teil, Push/Pull, „ähnliche auswählen“, Versionen (Sitzung 10)

### Stufe 4 – Drohnen-Modul
- [ ] 5"-Vorlage (Sitzung 11)
- [ ] Frame-Assistent, Lochbilder, Bauteil-Bibliothek (Sitzung 12)
- [ ] Prüfungen, DXF-Export, Varianten (Sitzung 13)

### Stufe 5 – KI und Feinschliff
- [ ] KI-Helfer auf der Zeitleiste (Sitzung 14)
- [ ] 3D-Skizzen, Sweep / Loft, Gelenke, Einsteiger-Oberfläche (ab Sitzung 15)

### Stufe 6 – Konten und Zusammenarbeit (Idee, nach dem Drohnen-Modul)
- [ ] A: Konto mit Name und Passwort, Projekte in der Cloud
- [ ] B: Gruppen und Teilen
- [ ] C: Gleichzeitig arbeiten

## Bekannte Punkte

- Schritt hinter dem Marker auswählen zeigt noch die Werkzeugleiste im Modell
- Vorlagen bestehen aus einer Gruppe: Über „Bearbeiten“ im Verlauf sieht man ihre einzelnen Schritte in der Zeitleiste
- Übernommene Körperkanten passen sich noch nicht an, wenn sich der Körper später ändert
- Vielecke lassen sich noch nicht drehen per Regel (nur über die Lage)
- Schildchen „X 0“ und „Y 0“ am Ursprung liegen übereinander
- Teilen ergibt zwei Hälften in einem Schritt; einzeln verschieben geht erst nach „Auflösen“ (dann ist der Schnitt weg)
- Feature-Gruppen (mehrere Schritte als einen benannten Block zusammenfassen) aus dem Bauplan sind noch nicht gebaut – Bauteile decken das heute teilweise ab
