# Ideensammlung

Gesammelt im Chat vom 12.–16.10.2026.

## Ziel

Ein ernsthaftes, hochauflösendes, parametrisches CAD im Browser, spezialisiert auf **Speed-/FPV-Drohnen**. Die Tiefe von Fusion, die Zugänglichkeit von Tinkercad. Kein Slicer, keine Druckplatte.

## Kern

- Exakte Geometrie mit OpenCascade (replicad), Three.js nur zur Anzeige, Rechnen im Web Worker
- STEP-Export für Fusion, Fräsen und Fertiger

## Verlauf und Bearbeitung

- Feature-Zeitleiste, jeder Schritt nachträglich änderbar, Zurückrollen, Unterdrücken
- Parameter-Tabelle mit Formeln, gilt für die ganze Baugruppe
- Protokoll mit Zeitstempel, Undo/Redo
- Reparatur-Hilfe bei kaputten Referenzen
- Versionen mit Vorher-Nachher-Vergleich, Varianten in einer Datei

## Skizzen

- 2D-Skizzen auf jeder Ebene und Fläche, Bedingungen mit Solver, Bemaßung
- 3D-Skizzen für Pfade (Sweep)
- Nachträglich per Doppelklick bearbeitbar

## Features

- Extrudieren, Drehen, Sweep, Loft, Rippe
- Bohrungs-Assistent, Taschen, Fase, Verrundung, Wandstärke, Muster, Spiegeln, Boolesch
- Direktbearbeitung (Push/Pull), Detail-Bibliothek, Feature-Gruppen
- Auswahl- und Suchwerkzeuge („alle 3-mm-Bohrungen“)

## Ansichten

- Animierte Explosionsansicht, Teile bleiben bearbeitbar
- Fokus-Vorschau als zweites Fenster
- Schnittebene, Röntgen-Modus, tiefes Hineinzoomen

## Drohnen-Modul

- Vorlagen als Rohbau (5" Freestyle, 3" Cinewhoop, 7" Long Range, Racer) – wie ein Lego-Set
- Frame-Assistent (Propellergröße, Achsabstand, True-X / Stretched-X / Deadcat / H)
- Lochbilder: Motoren 9×9 bis 19×19, Stacks 20×20 / 25,5 / 30,5
- Bauteil-Bibliothek: Motoren, Propeller, Stack, Akku, Kamera, VTX, Antenne
- Prüfungen: Propellerabstände, Gewicht, Schwerpunkt, Schub/Gewicht
- DXF für Carbon-Fräsen, STEP für alles

## KI

- KI-Helfer schreibt echte, bearbeitbare Zeitleisten-Schritte, markiert und rückgängig machbar
- Gemini (z. B. Gemini 4 Argon) als zweiter Prüfer, für Recherche und Grafiken – schreibt nicht parallel Code

## Bedienung

- Einfache Oberfläche, Profi-Werkzeuge aufklappbar
- Erklär-Animationen beim Überfahren, Fehlermeldungen in normaler Sprache
- Desktop zuerst

## Bekannte Grenzen

- Geometrie-Kern ist mehrere MB groß, erster Start dauert
- Benennungsproblem: nach Änderungen vorne können spätere Features neu zugewiesen werden müssen
- Volle Fusion-Breite (Simulation, CAM, Blech) ist kein Ziel; stark im Spezialgebiet Drohnen
