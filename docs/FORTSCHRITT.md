# Fortschritt

Stand: 17.10.2026 · nach Sitzung 5 von 14

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

## Offen

### Stufe 1 – Fundament
Fertig.

### Stufe 2 – Skizzen
- [x] Skizze auf Körperflächen (war schon da, in Sitzung 5 geprüft)
- [x] Bemaßung mit Formeln, nachträglich bearbeiten (Sitzung 5)
- [ ] Bedingungen mit Solver (Sitzung 6)
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

## Bekannte Punkte

- Schritt hinter dem Marker auswählen zeigt noch die Werkzeugleiste im Modell
- Vorlagen bestehen aus einer Gruppe: Über „Bearbeiten“ im Verlauf sieht man ihre einzelnen Schritte in der Zeitleiste
- Ohne Bedingungen kann ein Maß an einem geschlossenen Linienzug die Form verziehen – der Löser für Bedingungen kommt in Sitzung 6
- Bögen haben noch kein eigenes Radius-Maß
- Maß zwischen zwei Elementen (Abstand, Winkel zwischen Linien) kommt mit Sitzung 6
