# Bauplan CAD-Drohnen-Programm

Stand: 17.10.2026 · Live-Version: https://claude.ai/code/artifact/115f4267-5b81-4cea-9a20-be366757c0b5

## Überblick

Gebaut wird in **5 Stufen und 14 Bau-Sitzungen**, verteilt auf **etwa 5 Wochen** bei 3 Sitzungen pro Woche. Eine Sitzung ist so geschnitten, dass sie in ein Nutzungsfenster passt (rund 1 bis 2 Stunden aktive Arbeit mit Claude). Nach jeder Sitzung ist das Programm lauffähig und testbar.

| Stufe | Inhalt | Sitzungen | Woche |
| --- | --- | --- | --- |
| 1 Fundament | exakter Geometrie-Kern, Zeitleiste, Protokoll, Undo, Parameter, Baugruppe, Speichern/Laden, Druckplatte raus | 1–4 | 1–2 |
| 2 Skizzen | Skizzen auf Ebenen und Flächen, Bemaßung, Bedingungen, nachträglich bearbeiten | 5–7 | 2–3 |
| 3 Features und Ansichten | Bohrungs-Assistent, Fase, Verrundung, Muster, Spiegeln, Boolesch, Messen, Schnitt, Röntgen, Explosion, Fokus-Vorschau | 8–10 | 3–4 |
| 4 Drohnen-Modul | 5"-Vorlage, Frame-Assistent, Lochbilder, Bauteil-Bibliothek, Prüfungen, DXF/STEP | 11–13 | 4–5 |
| 5 KI und Feinschliff | KI-Helfer auf der Zeitleiste, 3D-Skizzen, Sweep/Loft, Bedienung für Anfänger | 14+ | 5+ |

Die Zeiten sind Schätzungen. Wenn eine Sitzung länger braucht, rutscht der Plan einfach eine Sitzung nach hinten, die Reihenfolge bleibt.

## Welches Modell wofür

Faustregel: **Opus für die schweren Grundlagen, Sonnet für das meiste Bauen, Haiku für Kleinkram.** Opus verbraucht pro Nachricht deutlich mehr von deinem Limit, deshalb nur dort, wo es wirklich zählt.

| Modell | Wofür | Sitzungen |
| --- | --- | --- |
| Claude Opus 5.5 | Architektur, Geometrie-Kern, Skizzen-Solver, Benennungsproblem, schwere Fehler, die Sonnet zweimal nicht lösen konnte | 1, 2, 5, 6 |
| Claude Sonnet 5.5 | Oberfläche, Werkzeuge, Features, Vorlagen, Drohnen-Modul, die meisten Änderungen | alle anderen |
| Claude Haiku 5.5 | Fragen zur Bedienung, Texte ändern, kleine Farb- oder Layout-Korrekturen, Planen der nächsten Sitzung | zwischendurch |

### Limits sparen

- **Pro Sitzung ein neuer Chat.** Lange Chats kosten bei jeder Nachricht mehr.
- **Eine Sitzung, eine Aufgabe.**
- **Fehler gesammelt melden.**
- **Erweitertes Denken nur bei Opus-Sitzungen anlassen.**
- **Websuche und unnötige Connectors ausschalten,** wenn du nur baust.
- **Opus-Sitzungen auf frische Fenster legen.**

## Arbeitsweise mit GitHub

- Der Code liegt in diesem Repository unter `app/`. Jede Sitzung endet mit einem Commit.
- Zu Beginn einer Sitzung: „Aktueller Stand ist das Repository. Heute ist Sitzung [Nr] aus `docs/BAUPLAN.md`.“
- Nur einer schreibt gleichzeitig Code (Claude **oder** Gemini), nie parallel.
- Gemini darf prüfen, recherchieren (Bauteil-Maße) und gestalten (Icons, Logo).

## Tagesplan mit Prompts

Vorschlag: **Montag, Mittwoch, Samstag** bauen, dazwischen testen.

### Woche 1

**Sitzung 1 · Opus · Fundament Teil 1**
```
Baue das bisherige Programm zum CAD-Programm aus unserem Plan um, ohne Druckplatte und ohne Slicer-Teile. Gerüst: OpenCascade über replicad im Web Worker, Three.js-Ansicht mit Ursprungsebenen XY/XZ/YZ, Ansichtswürfel, orthografisch/perspektivisch, Raster mit einstellbarer Weite. Test: Quader 20×20×5 mm mit runder Bohrung, exakt berechnet. Dateistruktur so, dass Zeitleiste, Baugruppe und Skizzen sauber dazukommen.
```

**Sitzung 2 · Opus · Fundament Teil 2**
```
Bau die Feature-Zeitleiste: jeder Schritt ein Eintrag, anklicken und Werte ändern, alles danach rechnet neu. Zurückrollen per Marker, Schritte unterdrücken, Undo/Redo, Protokoll-Fenster mit Zeitstempel und Fehlermeldungen in normaler Sprache. Referenzen robust, kaputte Schritte rot mit Hinweis.
```

**Sitzung 3 · Sonnet · Parameter und Speichern**
```
Parameter-Tabelle (Name, Wert, Einheit, Formel), Speichern/Laden als .json, Autosave. Einstellungen: Einheiten, Nachkommastellen, Fangtoleranz, Darstellungsqualität, hell/dunkel.
```

### Woche 2

**Sitzung 4 · Sonnet · Baugruppe**
```
Baugruppe: mehrere Bauteile mit eigener Zeitleiste, Teile-Baum mit Ausblenden/Isolieren, Bearbeiten im Kontext. Parameter für die ganze Baugruppe. Gizmo mit Zahleneingabe beim Ziehen.
```

**Sitzung 5 · Opus · Skizzen Teil 1**
```
Skizzen-Modus auf Ebene oder Fläche, Kamera dreht sich darauf. Linie, Rechteck, Kreis, Bogen, Langloch, Polygon. Bemaßung mit Formeln. Extrudieren und Schnitt-Extrusion. Skizze per Doppelklick nachträglich bearbeiten.
```

**Sitzung 6 · Opus · Skizzen Teil 2**
```
Skizzen-Bedingungen mit Solver: horizontal, vertikal, parallel, senkrecht, tangential, gleich, symmetrisch, fixiert, deckungsgleich. Blau = beweglich, schwarz = voll bestimmt. Trimmen, Versatz, Spiegeln, Muster, Kanten projizieren.
```

### Woche 3

**Sitzung 7 · Sonnet · Skizzen Feinschliff** – gesammelte Fehler beheben, Trimmen, Versatz, Spiegeln, Muster (aus Sitzung 6), Spline, Fangen, Hilfslinien.

**Sitzung 8 · Sonnet · Features** – Bohrungs-Assistent (M2/M2.5/M3, Senkung), Fase, Verrundung, Wandstärke, Muster, Spiegeln, Boolesch, Körper teilen, Feature-Gruppen.

**Sitzung 9 · Sonnet · Ansichten** – animierte Explosionsansicht, Fokus-Vorschau, Schnittebene, Röntgen-Modus, adaptive Darstellungsqualität.

### Woche 4

**Sitzung 10 · Sonnet · Messen und Direktbearbeitung** – Messwerkzeug inkl. Masse, Push/Pull, Auswahlfilter, „ähnliche auswählen“, Versionen mit Vergleich.

**Sitzung 11 · Sonnet · Drohnen-Vorlage** – parametrische 5"-Freestyle-Baugruppe (Platten, Arme, Bolzen, Kamerahalter, 16×16, 30,5×30,5), Vorlagen-Auswahl.

**Sitzung 12 · Sonnet · Frame-Assistent und Bibliothek** – Frame-Assistent, Lochbild-Werkzeug, Bauteil-Bibliothek, Detail-Bausteine.

### Woche 5

**Sitzung 13 · Sonnet · Prüfungen und Export** – Propellerabstände, Gewicht, Schwerpunkt, Schub/Gewicht, DXF/STEP/STL/3MF, Varianten.

**Sitzung 14 · Sonnet · KI-Helfer** – Textbefehle erzeugen echte Zeitleisten-Schritte, „Erklär diesen Schritt“, Schwachstellen-Analyse.

**Ab Sitzung 15** – 3D-Skizzen, Sweep/Loft, Gelenke, Einsteiger-Oberfläche.

## Nach jedem Update testen

- [ ] Seite neu laden: startet ohne Fehler?
- [ ] Alles Neue einmal ausprobieren
- [ ] Älteres Projekt laden: geht alles noch?
- [ ] Maß vorne in der Zeitleiste ändern: rechnet alles richtig neu?
- [ ] Undo/Redo durchklicken
- [ ] Drehen und Zoomen flüssig?
- [ ] Projekt speichern und sichern

Fehler so notieren:
```
Was ich gemacht habe: …
Was passieren sollte: …
Was passiert ist: …
Fehlermeldung im Protokoll: …
```

## Wenn etwas schiefgeht

| Problem | Was du tust |
| --- | --- |
| Limit mitten in der Sitzung voll | Warten bis zum Reset, dann „Mach weiter, wo du aufgehört hast.“ |
| Chat wird sehr lang | Neuer Chat, Verweis aufs Repository |
| Update hat etwas kaputtgemacht | Auf den letzten funktionierenden Commit zurückgehen lassen |
| Sonnet löst einen Fehler zweimal nicht | Nächste Sitzung mit Opus |
| Programm lädt langsam | Normal beim ersten Start (Geometrie-Kern) |

**Nie zwei Sitzungen parallel** am selben Stand bauen lassen.
