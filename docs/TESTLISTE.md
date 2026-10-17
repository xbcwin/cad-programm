# Testliste

Nach jedem Update in 15–20 Minuten durchklicken. Stand: nach Sitzung 5.

Vorbereitung: `app/` über einen lokalen Server öffnen (siehe README), Seite neu laden.

## Start und Ansicht

- [ ] **Startet ohne Fehler**
  Schritte: 1. Seite neu laden.
  Erwartet: Startseite mit Logo und Vorlagen, keine rote Fehlermeldung.
- [ ] **Vorlage öffnen**
  Schritte: 1. „Schild mit Loch“ anklicken.
  Erwartet: Platte mit Loch erscheint, unten rechts steht „80 × 30 × 3 mm“.
- [ ] **Ansichten per Taste**
  Schritte: 1. In den 3D-Bereich klicken. 2. Nacheinander 1, 3, 7, 0 drücken.
  Erwartet: Ansicht vorne, rechts, oben, schräg – jeweils weich animiert.
- [ ] **Orthografisch**
  Schritte: 1. O drücken. 2. Ansicht drehen.
  Erwartet: Rasterlinien bleiben parallel (keine Fluchtpunkte). Nochmal O: Perspektive zurück.
- [ ] **Raster**
  Schritte: 1. G drücken. 2. Nochmal G. 3. Rechts unter „Ansicht“ Rasterweite auf 1 mm stellen.
  Erwartet: Raster aus, wieder an, dann dichter.
- [ ] **Raster automatisch**
  Schritte: 1. Rasterweite „Automatisch“. 2. Weit hineinzoomen.
  Erwartet: Das Raster wird in Zehnerschritten feiner, auch nah an der Kamera sind Linien zu sehen.
- [ ] **Ursprungsebenen und Achsen**
  Schritte: 1. Häkchen „Ursprungsebenen zeigen“ und „Achsen zeigen“ aus- und wieder einschalten.
  Erwartet: Die drei farbigen Ebenen bzw. die roten/grünen/blauen Achsen verschwinden und erscheinen wieder.
- [ ] **Tief hineinzoomen**
  Schritte: 1. Ganz nah an den Lochrand zoomen und 1 Sekunde warten.
  Erwartet: Kein Flimmern, der Lochrand wird glatt nachgeschärft.

## Zeitleiste

- [ ] **Schritte erscheinen**
  Schritte: 1. Neues leeres Projekt. 2. Über „Körper“ Quader, Zylinder und Kugel hinzufügen.
  Erwartet: Drei Symbole in der Zeitleiste, rechts „3 Schritte“.
- [ ] **Marker ziehen**
  Schritte: 1. Den farbigen Balken nach links vor das zweite Symbol ziehen.
  Erwartet: Nur der Quader ist zu sehen, Zylinder und Kugel sind blass gestrichelt, rechts „1 / 3“.
- [ ] **Einfügen am Marker**
  Schritte: 1. Bei zurückgezogenem Marker einen Kegel hinzufügen.
  Erwartet: Der Kegel erscheint direkt hinter dem Quader, nicht am Ende.
- [ ] **Doppelklick**
  Schritte: 1. Doppelklick auf das letzte Symbol.
  Erwartet: Marker springt ans Ende, alles ist wieder sichtbar.
- [ ] **Unterdrücken**
  Schritte: 1. Rechtsklick auf ein Symbol → „Unterdrücken“.
  Erwartet: Teil verschwindet, Symbol ist durchgestrichen, im Verlauf links ist der Name durchgestrichen. Nochmal → „Wieder aktivieren“.
- [ ] **Fehler wird rot**
  Schritte: 1. Quader anklicken. 2. Rechts unter „Kanten“ „Alle runden“. 3. Radius auf 50 setzen.
  Erwartet: Symbol in der Zeitleiste rot mit Punkt, Status unten rechts „Ein Schritt hat ein Problem“.

## Bauteile

- [ ] **Neues Bauteil**
  Schritte: 1. Leeres Projekt, einen Quader hinzufügen. 2. Unten in die Suchzeile „Neues Bauteil“ tippen und Enter.
  Erwartet: Oben grüner Balken „Bauteil bearbeiten: Bauteil 1“, der Quader ist durchsichtig, die Zeitleiste ist leer und grün umrandet.
- [ ] **Teile landen im Bauteil**
  Schritte: 1. Zylinder und Kugel hinzufügen.
  Erwartet: Beide erscheinen in der Zeitleiste des Bauteils; im Verlauf links stehen sie unter „Bauteil 1“.
- [ ] **Zeitleiste im Bauteil**
  Schritte: 1. Marker vor die Kugel ziehen.
  Erwartet: Die Kugel verschwindet, der Quader außerhalb bleibt unverändert.
- [ ] **Fertig**
  Schritte: 1. Oben auf „Fertig“ (oder Esc, wenn nichts gewählt ist).
  Erwartet: Alles wieder normal sichtbar, Zeitleiste zeigt Quader und Bauteil als zwei Schritte.
- [ ] **Vorlage als Bauteil bearbeiten**
  Schritte: 1. Vorlage „Winkel zum Anschrauben“. 2. Im Verlauf beim Winkel auf das Stift-Symbol.
  Erwartet: Die Zeitleiste zeigt die einzelnen Teile des Winkels.
- [ ] **Unterteil anklicken**
  Schritte: 1. Im Bauteil-Modus (grüner Balken) direkt im Bild auf ein Teil klicken.
  Erwartet: Nur dieses Teil wird gewählt (Umriss leuchtet), nicht das ganze Bauteil. Ziehen auf dem Bauteil dreht die Ansicht.
- [ ] **Isolieren**
  Schritte: 1. Im Verlauf beim Quader auf das Fokus-Symbol.
  Erwartet: Nur der Quader ist zu sehen, oben dunkler Balken „Isoliert“. „Alle zeigen“ holt alles zurück.

## Skizzen-Maße (neu in Sitzung 5)

- [ ] **Maß beim Zeichnen**
  Schritte: 1. Unter „Maße“ ein Maß `breite = 40` anlegen. 2. Skizze → Arbeitsfläche. 3. Erste Ecke klicken, `breite` tippen, Tab, `20`, Enter.
  Erwartet: Rechteck 40 × 20, darunter Schildchen „breite = 40“, rechts „20“.
- [ ] **Maß-Werkzeug**
  Schritte: 1. Kreis zeichnen. 2. D drücken, auf den Kreis klicken, `6` tippen, Enter.
  Erwartet: Schildchen „Ø 6“, der Kreis hat genau 6 mm.
- [ ] **Teil wächst mit**
  Schritte: 1. Fertig, 3 mm hochziehen. 2. Unter „Maße“ `breite` auf 60 ändern.
  Erwartet: Das Teil wird 60 mm breit, unten rechts steht „60 × 20 × 3 mm“.
- [ ] **Doppelklick bearbeitet**
  Schritte: 1. Doppelklick auf das Teil.
  Erwartet: Die Skizze geht auf, mit allen Schildchen. Auswahl-Werkzeug ist aktiv.
- [ ] **Schildchen ändern**
  Schritte: 1. Auf „breite = 60“ klicken, `breite/2` eintippen, Enter. 2. Fertig.
  Erwartet: Teil ist 30 mm breit.
- [ ] **Maß hält beim Ziehen**
  Schritte: 1. Linie zeichnen, anklicken, rechts Länge 25 eintippen. 2. Mit „Auswahl“ den Endpunkt woanders hinziehen.
  Erwartet: Die Linie dreht sich, bleibt aber 25 mm lang.
- [ ] **Maß lösen**
  Schritte: 1. Rechts beim Feld „Länge“ aufs Schloss klicken.
  Erwartet: Schildchen verschwindet, die Linie lässt sich wieder frei ziehen. Strg/Cmd+Z holt das Maß zurück.
- [ ] **Falscher Name**
  Schritte: 1. Auf ein Schildchen klicken und `hallo` eintippen.
  Erwartet: Hinweis „Das kann ich nicht ausrechnen“, nichts geht kaputt.

## Schraubenlöcher

- [ ] **Passung wählen**
  Schritte: 1. „Bauteile“ → Schraubenloch. 2. Rechts „Loch“ auf „Eng“, dann „Kernloch für Gewinde“ stellen.
  Erwartet: Bei M3 wird das Loch 3,2 mm bzw. 2,5 mm groß (mit „Messen“ prüfen).
- [ ] **Neue Größe**
  Schritte: 1. Schraube auf M1.6 stellen.
  Erwartet: Kleines Loch mit Senkung, kein Fehler.

## Zahleneingabe beim Ziehen

- [ ] **Verschieben**
  Schritte: 1. Quader anklicken und mit gedrückter Maus ziehen. 2. Währenddessen 25 tippen, Enter.
  Erwartet: Feld mit X und Y erscheint; der Quader liegt danach genau 25 mm weiter in X.
- [ ] **Größe**
  Schritte: 1. Am weißen Anfasser für die Breite ziehen. 2. Währenddessen 42,5 tippen, Enter.
  Erwartet: Breite ist genau 42,5 mm.
- [ ] **Drehen**
  Schritte: 1. Am grünen Punkt auf dem gestrichelten Kreis ziehen. 2. 30 tippen, Enter.
  Erwartet: Drehung Z genau 30°.
- [ ] **Formeln**
  Schritte: 1. Unter „Maße“ ein Maß `breite = 30` anlegen. 2. Beim Ziehen eines Anfassers `breite/2` tippen, Enter.
  Erwartet: 15 mm.

## Protokoll und Rückgängig

- [ ] **Protokoll füllt sich**
  Schritte: 1. Tab „Protokoll“ links öffnen.
  Erwartet: Alle Änderungen mit Uhrzeit, der Fehler aus dem letzten Test rot mit Tipp.
- [ ] **Filter**
  Schritte: 1. „Fehler“ anklicken. 2. „Änderungen“ anklicken.
  Erwartet: Jeweils nur die passenden Einträge.
- [ ] **Bis hierher zurück**
  Schritte: 1. Bei einem älteren Eintrag „Bis hierher zurück“ klicken.
  Erwartet: Alle späteren Änderungen sind rückgängig gemacht, Hinweis „… Schritte rückgängig gemacht“.
- [ ] **Strg/Cmd + Z und Y**
  Schritte: 1. Etwas ändern. 2. Cmd+Z. 3. Cmd+Y.
  Erwartet: Änderung weg, dann wieder da.

## Einstellungen

- [ ] **Design**
  Schritte: 1. ⋯ → Einstellungen → Design „Dunkel“, dann „Hell“, dann „Wie das System“.
  Erwartet: Oberfläche und 3D-Bereich wechseln sofort.
- [ ] **Darstellungsqualität**
  Schritte: 1. Qualität „Grob“, dann „Sehr fein“.
  Erwartet: Rundungen werden sichtbar kantiger bzw. glatter.
- [ ] **Hilfe-Tooltips**
  Schritte: 1. Maus auf „Messen“ legen und 2 Sekunden warten.
  Erwartet: Erst kurzer Text, dann ausführliche Anleitung mit „Tipp:“.

- [ ] **Tastenkürzel**
  Schritte: 1. `?` drücken.
  Erwartet: Fenster mit allen Tasten, nach Bereichen sortiert.

## Dateien

- [ ] **Projekt speichern**
  Schritte: 1. Cmd+S.
  Erwartet: Datei `<Projektname>.tracery.json` wird heruntergeladen.
- [ ] **Projekt öffnen**
  Schritte: 1. Neues Projekt. 2. Die gespeicherte Datei ins Fenster ziehen.
  Erwartet: Projekt ist wieder da – inklusive Marker-Position und unterdrückter Schritte.
- [ ] **Export**
  Schritte: 1. „Exportieren“ → STEP angehakt → „Als ZIP speichern“.
  Erwartet: ZIP mit `.step`-Datei und LIESMICH.txt.

## Fiese Tests

- [ ] Marker zurückziehen, dann einen Schritt **hinter** dem Marker löschen, dann Cmd+Z – der Schritt ist wieder da, Marker an derselben Stelle.
- [ ] Alle Schritte unterdrücken – Status unten rechts zeigt „Noch leer“, kein Fehler.
- [ ] Marker ganz an den Anfang, Projekt speichern, Seite neu laden – Zeitleiste steht immer noch am Anfang.
- [ ] Während das Modell noch rechnet (direkt nach dem Öffnen einer Vorlage), schnell O, G und 7 drücken – keine Fehlermeldung.
- [ ] Skizze mit Maß `breite` bauen, unter „Maße“ `breite` löschen – der Schritt wird in der Zeitleiste rot mit Hinweis, in der Skizze ist das Schildchen rot; Maß wieder anlegen, alles stimmt wieder.
- [ ] Qualität „Sehr fein“, dann ganz nah an eine Rundung zoomen und herauszoomen – flüssig, kein Einfrieren.

## Fehler melden

```
Was ich gemacht habe: …
Was passieren sollte: …
Was passiert ist: …
Browser: …
```
