# Fortschritt

Stand: 17.10.2026 · nach Sitzung 6 von 14

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
- [x] Automatischer Klicktest `tests/klicktest.py`: 35 Durchläufe, 52 von 55 Punkten der Testliste automatisch geprüft
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

## Offen

### Stufe 1 – Fundament
Fertig.

### Stufe 2 – Skizzen
- [x] Skizze auf Körperflächen (war schon da, in Sitzung 5 geprüft)
- [x] Bemaßung mit Formeln, nachträglich bearbeiten (Sitzung 5)
- [x] Bedingungen mit Solver (Sitzung 6)
- [ ] Trimmen, Versatz, Spiegeln, Muster in der Skizze (aus Sitzung 6 verschoben → Sitzung 7)
- [ ] Spline, Fangen, Hilfslinien (Sitzung 7)

### Stufe 3 – Features und Ansichten
- [ ] Bohrungs-Assistent, Wandstärke, Muster, Spiegeln, Boolesch, Teilen (Sitzung 8)
- [ ] Explosionsansicht, Fokus-Vorschau, Schnitt, Röntgen (Sitzung 9)
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
