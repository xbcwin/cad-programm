# Testliste

Nach jedem Update in 15–20 Minuten durchklicken. Stand: nach Sitzung 6 (17.10.2026).

**[x]** = automatisch geprüft mit `tests/klicktest.py` (echter Browser, echte Klicks) · **[ ]** = noch von Hand ansehen

| Bereich | Punkte | automatisch OK | von Hand offen |
| --- | --- | --- | --- |
| Start und Ansicht | 8 | 7 | Flimmern beim Hineinzoomen, weiche Animation |
| Zeitleiste | 6 | 6 | – |
| Bauteile | 7 | 6 | Stift-Symbol im Verlauf |
| Skizzen-Maße | 11 | 11 | – |
| Schraubenlöcher | 2 | 2 | – |
| Zahleneingabe beim Ziehen | 4 | 4 | – |
| Protokoll und Rückgängig | 4 | 4 | – |
| Einstellungen | 4 | 4 | – |
| Dateien | 3 | 3 | – |
| Fiese Tests | 6 | 5 | „Sehr fein“ flüssig? |
| Notizstift | 6 | 3 | Kleben beim Drehen, Farbe/Dicke, Doppelklick auf Textnotiz |
| Regeln in der Skizze | 11 | 9 | Blau/dunkel gut erkennbar? Ziehen flüssig? |
| **Gesamt** | **72** | **64** | **8 Punkte, dazu ein Blick auf Animationen** |

Wichtig: Automatisch geprüft heißt „funktioniert in Chromium unter Linux“. Safari auf dem Mac, Touch auf dem iPad und echte Grafikkarten sieht nur ein Test von Hand.

Vorbereitung: `app/` über einen lokalen Server öffnen (siehe README), Seite neu laden.

## Start und Ansicht

- [x] **Startet ohne Fehler**
  Schritte: 1. Seite neu laden.
  Erwartet: Startseite mit Logo und Vorlagen, keine rote Fehlermeldung.
- [x] **Vorlage öffnen**
  Schritte: 1. „Schild mit Loch“ anklicken.
  Erwartet: Platte mit Loch erscheint, unten rechts steht „80 × 30 × 3 mm“.
- [x] **Ansichten per Taste**
  Schritte: 1. In den 3D-Bereich klicken. 2. Nacheinander 1, 3, 7, 0 drücken.
  Erwartet: Ansicht vorne, rechts, oben, schräg – jeweils weich animiert.
  Automatisch geprüft: die Richtungen stimmen. Ob es weich animiert ist, bitte kurz von Hand ansehen.
- [x] **Orthografisch**
  Schritte: 1. O drücken. 2. Ansicht drehen.
  Erwartet: Rasterlinien bleiben parallel (keine Fluchtpunkte). Nochmal O: Perspektive zurück.
- [x] **Raster**
  Schritte: 1. G drücken. 2. Nochmal G. 3. Rechts unter „Ansicht“ Rasterweite auf 1 mm stellen.
  Erwartet: Raster aus, wieder an, dann dichter.
- [x] **Raster automatisch**
  Schritte: 1. Rasterweite „Automatisch“. 2. Weit hineinzoomen.
  Erwartet: Das Raster wird in Zehnerschritten feiner, auch nah an der Kamera sind Linien zu sehen.
- [x] **Ursprungsebenen und Achsen**
  Schritte: 1. Häkchen „Ursprungsebenen zeigen“ und „Achsen zeigen“ aus- und wieder einschalten.
  Erwartet: Die drei farbigen Ebenen bzw. die roten/grünen/blauen Achsen verschwinden und erscheinen wieder.
- [ ] **Tief hineinzoomen**
  Schritte: 1. Ganz nah an den Lochrand zoomen und 1 Sekunde warten.
  Erwartet: Kein Flimmern, der Lochrand wird glatt nachgeschärft.
  Automatisch geprüft: das Nachschärfen klappt. Ob es flimmert, sieht nur ein Mensch.

## Zeitleiste

- [x] **Schritte erscheinen**
  Schritte: 1. Neues leeres Projekt. 2. Über „Körper“ Quader, Zylinder und Kugel hinzufügen.
  Erwartet: Drei Symbole in der Zeitleiste, rechts „3 Schritte“.
- [x] **Marker ziehen**
  Schritte: 1. Den farbigen Balken nach links vor das zweite Symbol ziehen.
  Erwartet: Nur der Quader ist zu sehen, Zylinder und Kugel sind blass gestrichelt, rechts „1 / 3“.
- [x] **Einfügen am Marker**
  Schritte: 1. Bei zurückgezogenem Marker einen Kegel hinzufügen.
  Erwartet: Der Kegel erscheint direkt hinter dem Quader, nicht am Ende.
- [x] **Doppelklick**
  Schritte: 1. Doppelklick auf das letzte Symbol.
  Erwartet: Marker springt ans Ende, alles ist wieder sichtbar.
- [x] **Unterdrücken**
  Schritte: 1. Rechtsklick auf ein Symbol → „Unterdrücken“.
  Erwartet: Teil verschwindet, Symbol ist durchgestrichen, im Verlauf links ist der Name durchgestrichen. Nochmal → „Wieder aktivieren“.
- [x] **Fehler wird rot**
  Schritte: 1. Quader anklicken. 2. Rechts unter „Kanten“ „Alle runden“. 3. Radius auf 50 setzen.
  Erwartet: Symbol in der Zeitleiste rot mit Punkt, Status unten rechts „Ein Schritt hat ein Problem“.

## Bauteile

- [x] **Neues Bauteil**
  Schritte: 1. Leeres Projekt, einen Quader hinzufügen. 2. Unten in die Suchzeile „Neues Bauteil“ tippen und Enter.
  Erwartet: Oben grüner Balken „Bauteil bearbeiten: Bauteil 1“, der Quader ist durchsichtig, die Zeitleiste ist leer und grün umrandet.
- [x] **Teile landen im Bauteil**
  Schritte: 1. Zylinder und Kugel hinzufügen.
  Erwartet: Beide erscheinen in der Zeitleiste des Bauteils; im Verlauf links stehen sie unter „Bauteil 1“.
- [x] **Zeitleiste im Bauteil**
  Schritte: 1. Marker vor die Kugel ziehen.
  Erwartet: Die Kugel verschwindet, der Quader außerhalb bleibt unverändert.
- [x] **Fertig**
  Schritte: 1. Oben auf „Fertig“ (oder Esc, wenn nichts gewählt ist).
  Erwartet: Alles wieder normal sichtbar, Zeitleiste zeigt Quader und Bauteil als zwei Schritte.
- [ ] **Vorlage als Bauteil bearbeiten**
  Schritte: 1. Vorlage „Winkel zum Anschrauben“. 2. Im Verlauf beim Winkel auf das Stift-Symbol.
  Erwartet: Die Zeitleiste zeigt die einzelnen Teile des Winkels.
  Automatisch geprüft: das Ergebnis stimmt. Das Stift-Symbol selbst bitte einmal von Hand klicken.
- [x] **Unterteil anklicken**
  Schritte: 1. Im Bauteil-Modus (grüner Balken) direkt im Bild auf ein Teil klicken.
  Erwartet: Nur dieses Teil wird gewählt (Umriss leuchtet), nicht das ganze Bauteil. Ziehen auf dem Bauteil dreht die Ansicht.
- [x] **Isolieren**
  Schritte: 1. Im Verlauf beim Quader auf das Fokus-Symbol.
  Erwartet: Nur der Quader ist zu sehen, oben dunkler Balken „Isoliert“. „Alle zeigen“ holt alles zurück.

## Skizzen-Maße (neu in Sitzung 5)

- [x] **Einführung „Erste Skizze“**
  Schritte: 1. Startseite → „Erste Skizze (5 Minuten)“. 2. Einfach den Hinweisen folgen.
  Erwartet: Jeder Schritt springt von selbst weiter, sobald er erledigt ist. Am Ende wächst das Teil auf 60 mm.
- [x] **Neuer Name**
  Schritte: 1. In einer Skizze auf ein Maß-Schildchen klicken und einen neuen Namen wie `laenge` eintippen.
  Erwartet: Hinweis „Neuer Name … unter „Maße““, das Maß behält seine Zahl und heißt jetzt so.

- [x] **Maß beim Zeichnen**
  Schritte: 1. Unter „Maße“ ein Maß `breite = 40` anlegen. 2. Skizze → Arbeitsfläche. 3. Erste Ecke klicken, `breite` tippen, Tab, `20`, Enter.
  Erwartet: Rechteck 40 × 20, darunter Schildchen „breite = 40“, rechts „20“.
- [x] **Maß-Werkzeug**
  Schritte: 1. Kreis zeichnen. 2. D drücken, auf den Kreis klicken, `6` tippen, Enter.
  Erwartet: Schildchen „Ø 6“, der Kreis hat genau 6 mm.
- [x] **Teil wächst mit**
  Schritte: 1. Fertig, 3 mm hochziehen. 2. Unter „Maße“ `breite` auf 60 ändern.
  Erwartet: Das Teil wird 60 mm breit, unten rechts steht „60 × 20 × 3 mm“.
- [x] **Doppelklick bearbeitet**
  Schritte: 1. Doppelklick auf das Teil.
  Erwartet: Die Skizze geht auf, mit allen Schildchen. Auswahl-Werkzeug ist aktiv.
- [x] **Schildchen ändern**
  Schritte: 1. Auf „breite = 60“ klicken, `breite/2` eintippen, Enter. 2. Fertig.
  Erwartet: Teil ist 30 mm breit.
- [x] **Maß hält beim Ziehen**
  Schritte: 1. Linie zeichnen, anklicken, rechts Länge 25 eintippen. 2. Mit „Auswahl“ den Endpunkt woanders hinziehen.
  Erwartet: Die Linie dreht sich, bleibt aber 25 mm lang.
- [x] **Maß lösen**
  Schritte: 1. Rechts beim Feld „Länge“ aufs Schloss klicken.
  Erwartet: Schildchen verschwindet, die Linie lässt sich wieder frei ziehen. Strg/Cmd+Z holt das Maß zurück.
- [x] **Formel-Beispiele**
  Schritte: 1. Reiter „Maße“ → „Formel-Beispiele“. 2. „Beispiel-Maße anlegen“.
  Erwartet: 12 Beispiele mit Ergebnis und Erklärung; danach stehen breite, hoehe, wand, schraube und anzahl in der Liste.
- [x] **Kaputte Formel**
  Schritte: 1. Auf ein Schildchen klicken und `breite/` eintippen.
  Erwartet: Hinweis „Das kann ich nicht ausrechnen“, nichts geht kaputt.

## Regeln in der Skizze (neu in Sitzung 6)

- [x] **Waagerecht per Schnellweg**
  Schritte: 1. In einer Skizze eine schräge Linie zeichnen. 2. Anklicken. 3. In der Leiste „Regeln“ auf Waagerecht.
  Erwartet: Die Linie liegt sofort waagerecht, daneben erscheint ein kleines Regel-Symbol.
- [x] **Parallel, rechtwinklig, tangential, gleich, symmetrisch**
  Schritte: 1. Regel-Knopf wählen. 2. Die Elemente nacheinander anklicken (siehe Hinweis unten links).
  Erwartet: Die Elemente richten sich aus, ohne dass sich der Rest unnötig bewegt.
- [x] **Punkt auf Linie (deckungsgleich)**
  Schritte: 1. „Deckungsgleich“. 2. Erst einen Endpunkt, dann eine Linie anklicken.
  Erwartet: Der Punkt springt auf die Linie (oder deren Verlängerung).
- [x] **Abstand und Winkel zwischen zwei Elementen**
  Schritte: 1. Maß-Werkzeug (D). 2. Punkt und Linie anklicken → Abstand. 3. Zwei Linien anklicken → Winkel.
  Erwartet: Feld „Abstand“ bzw. „Winkel“; nach Enter stimmt der Wert genau.
- [x] **Bogen-Radius**
  Schritte: 1. Maß-Werkzeug, auf einen Bogen klicken, Zahl eintippen.
  Erwartet: Schildchen „R …“, der Bogen hat genau diesen Radius.
- [ ] **Blau und dunkel**
  Schritte: 1. Zwei Linien zeichnen, Längen und Lage festlegen, bis rechts „Voll bestimmt“ steht.
  Erwartet: Bewegliche Linien sind blau, feste Linien dunkel. Bitte von Hand ansehen, ob man den Unterschied gut erkennt.
- [x] **Widerspruch wird abgelehnt**
  Schritte: 1. In einer voll bestimmten Skizze noch ein Maß setzen, das nicht passt.
  Erwartet: Roter Hinweis „Zu viele Regeln in der Skizze“, die Zeichnung bleibt, wie sie war.
- [x] **Feste Teile bleiben beim Ziehen**
  Schritte: 1. Eine feste (dunkle) Linie am Endpunkt ziehen.
  Erwartet: Sie bewegt sich nicht. Blaue Linien folgen der Maus, Maße und Regeln bleiben erfüllt.
- [x] **Regel löschen**
  Schritte: 1. Ein Regel-Symbol anklicken, Entf. 2. Strg/Cmd+Z.
  Erwartet: Regel weg, dann wieder da.
- [x] **Kante übernehmen**
  Schritte: 1. Auf eine Körperfläche klicken, S drücken. 2. In „Regeln“ das letzte Symbol, dann eine gestrichelte Kante anklicken.
  Erwartet: Die Kante wird eine feste, dunkle Linie der Skizze.
- [ ] **Ziehen fühlt sich flüssig an**
  Schritte: 1. In einer Skizze mit vielen Regeln Punkte ziehen.
  Erwartet: Kein Ruckeln. (Automatisch gemessen: Löser braucht etwa 3 ms – das Gefühl prüft nur ein Mensch.)

## Notizstift (neu)

- [ ] **Malen**
  Schritte: 1. Oben „Notizen“ (oder Taste N). 2. Mit gedrückter Maus über ein Teil malen.
  Erwartet: Roter Strich auf der Fläche; beim Drehen (rechte Maustaste) klebt er am Teil.
- [ ] **Farbe und Dicke**
  Schritte: 1. Blau und „Dick“ wählen, daneben ins Leere malen.
  Erwartet: Dicker blauer Strich in der Luft neben dem Teil.
- [ ] **Textnotiz**
  Schritte: 1. Sprechblase wählen, ins Bild klicken, Text eintippen, Enter. 2. Doppelklick auf die Notiz.
  Erwartet: Notiz steht im Bild; der Doppelklick lässt den Text ändern.
- [x] **Radierer**
  Schritte: 1. Radierer wählen, über einen Strich fahren. 2. Strg/Cmd+Z.
  Erwartet: Strich weg, dann wieder da.
- [x] **Ein- und ausblenden**
  Schritte: 1. „Fertig“. 2. Rechts „Notizen zeigen“ abhaken.
  Erwartet: Alle Notizen verschwinden und kommen mit dem Häkchen zurück.
- [x] **Keine Technik**
  Schritte: 1. Exportieren als STEP.
  Erwartet: Die Notizen sind nicht in der Datei, die Zeitleiste zeigt keine Notiz-Schritte.

## Schraubenlöcher

- [x] **Passung wählen**
  Schritte: 1. „Bauteile“ → Schraubenloch. 2. Rechts „Loch“ auf „Eng“, dann „Kernloch für Gewinde“ stellen.
  Erwartet: Bei M3 wird das Loch 3,2 mm bzw. 2,5 mm groß (mit „Messen“ prüfen).
- [x] **Neue Größe**
  Schritte: 1. Schraube auf M1.6 stellen.
  Erwartet: Kleines Loch mit Senkung, kein Fehler.

## Zahleneingabe beim Ziehen

- [x] **Verschieben**
  Schritte: 1. Quader anklicken und mit gedrückter Maus ziehen. 2. Währenddessen 25 tippen, Enter.
  Erwartet: Feld mit X und Y erscheint; der Quader liegt danach genau 25 mm weiter in X.
- [x] **Größe**
  Schritte: 1. Am weißen Anfasser für die Breite ziehen. 2. Währenddessen 42,5 tippen, Enter.
  Erwartet: Breite ist genau 42,5 mm.
- [x] **Drehen**
  Schritte: 1. Am grünen Punkt auf dem gestrichelten Kreis ziehen. 2. 30 tippen, Enter.
  Erwartet: Drehung Z genau 30°.
- [x] **Formeln**
  Schritte: 1. Unter „Maße“ ein Maß `breite = 30` anlegen. 2. Beim Ziehen eines Anfassers `breite/2` tippen, Enter.
  Erwartet: 15 mm.

## Protokoll und Rückgängig

- [x] **Protokoll füllt sich**
  Schritte: 1. Tab „Protokoll“ links öffnen.
  Erwartet: Alle Änderungen mit Uhrzeit, der Fehler aus dem letzten Test rot mit Tipp.
- [x] **Filter**
  Schritte: 1. „Fehler“ anklicken. 2. „Änderungen“ anklicken.
  Erwartet: Jeweils nur die passenden Einträge.
- [x] **Bis hierher zurück**
  Schritte: 1. Bei einem älteren Eintrag „Bis hierher zurück“ klicken.
  Erwartet: Alle späteren Änderungen sind rückgängig gemacht, Hinweis „… Schritte rückgängig gemacht“.
- [x] **Strg/Cmd + Z und Y**
  Schritte: 1. Etwas ändern. 2. Cmd+Z. 3. Cmd+Y.
  Erwartet: Änderung weg, dann wieder da.

## Einstellungen

- [x] **Design**
  Schritte: 1. ⋯ → Einstellungen → Design „Dunkel“, dann „Hell“, dann „Wie das System“.
  Erwartet: Oberfläche und 3D-Bereich wechseln sofort.
- [x] **Darstellungsqualität**
  Schritte: 1. Qualität „Grob“, dann „Sehr fein“.
  Erwartet: Rundungen werden sichtbar kantiger bzw. glatter.
- [x] **Hilfe-Tooltips**
  Schritte: 1. Maus auf „Messen“ legen und 2 Sekunden warten.
  Erwartet: Erst kurzer Text, dann ausführliche Anleitung mit „Tipp:“.

- [x] **Tastenkürzel**
  Schritte: 1. `?` drücken.
  Erwartet: Fenster mit allen Tasten, nach Bereichen sortiert.

## Dateien

- [x] **Projekt speichern**
  Schritte: 1. Cmd+S.
  Erwartet: Datei `<Projektname>.tracery.json` wird heruntergeladen.
- [x] **Projekt öffnen**
  Schritte: 1. Neues Projekt. 2. Die gespeicherte Datei ins Fenster ziehen.
  Erwartet: Projekt ist wieder da – inklusive Marker-Position und unterdrückter Schritte.
- [x] **Export**
  Schritte: 1. „Exportieren“ → STEP angehakt → „Als ZIP speichern“.
  Erwartet: ZIP mit `.step`-Datei und LIESMICH.txt.

## Fiese Tests

- [x] Marker zurückziehen, dann einen Schritt **hinter** dem Marker löschen, dann Cmd+Z – der Schritt ist wieder da, Marker an derselben Stelle.
- [x] Alle Schritte unterdrücken – Status unten rechts zeigt „Noch leer“, kein Fehler.
- [x] Marker ganz an den Anfang, Projekt speichern, Seite neu laden – Zeitleiste steht immer noch am Anfang.
- [x] Während das Modell noch rechnet (direkt nach dem Öffnen einer Vorlage), schnell O, G und 7 drücken – keine Fehlermeldung.
- [x] Skizze mit Maß `breite` bauen, unter „Maße“ `breite` in `laenge` umbenennen – das Schildchen heißt jetzt `laenge`. Dann entfernen – das Teil bleibt gleich groß, im Schildchen steht die Zahl.
- [ ] Qualität „Sehr fein“, dann ganz nah an eine Rundung zoomen und herauszoomen – flüssig, kein Einfrieren.
  Automatisch geprüft: kein Einfrieren. Ob es flüssig wirkt, bitte von Hand ansehen.

## Fehler melden

```
Was ich gemacht habe: …
Was passieren sollte: …
Was passiert ist: …
Browser: …
```
