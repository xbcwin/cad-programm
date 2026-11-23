# Testliste

Nach jedem Update in 15–20 Minuten durchklicken. Stand: nach Sitzung 18 (21.10.2026).

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
| Skizzen-Feinschliff | 11 | 10 | Fangmarkierungen gut erkennbar? |
| Formen-Werkzeuge | 12 | 9 | Bohrungs-Ring gut sichtbar? Muster-Kreis verständlich? Wand von innen |
| Ansichten | 12 | 8 | Schraffur erkennbar? Explosion weich? Fokus drehen, Röntgen-Kanten |
| Messen, Masse, Auswahl, Versionen | 11 | 8 | Schwerpunkt-Symbol gut sichtbar? Vergleichs-Umriss verständlich? |
| Drohnen-Vorlagen | 8 | 5 | Sieht es wie eine Drohne aus? Propellerkreise, STEP im anderen Programm |
| Frame-Assistent und Drohnen-Teile | 8 | 5 | Klappfenster übersichtlich? Deadcat richtig? Kopfzeile mit Symbolen |
| Drohnen-Check, DXF, Varianten | 11 | 9 | DXF in der Fräs-Software, Check-Fenster und Varianten-Tabelle bei schmalem Fenster |
| KI-Schritte, Erklären, Schwachstellen | 12 | 9 | Echte KI in Claude, Ringe und KI-Fenster, Quellen-Links |
| Einfache Oberfläche | 4 | 3 | Mit einem Kind ausprobieren |
| Kaufteile in echter Form | 3 | 2 | Sehen die Teile echt aus? |
| KI-Kollege | 9 | 8 | Echter KI-Kollege in Claude |
| **Gesamt** | **173** | **140** | **33 Punkte, dazu ein Blick auf Animationen** |

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

## Skizzen-Feinschliff (neu in Sitzung 7)

- [x] **Spline**
  Schritte: 1. In der Skizze S drücken. 2. Vier Punkte klicken, Enter. 3. Neu: drei Punkte klicken, dann den ersten nochmal. 4. V, einen Punkt ziehen.
  Erwartet: Weiche Kurve genau durch die Punkte; die zweite Kurve ist geschlossen und zählt als Fläche; beim Ziehen folgt die Kurve, Strg/Cmd+Z holt den Punkt zurück.
- [x] **Trimmen**
  Schritte: 1. Zwei sich kreuzende Linien, T drücken. 2. Über ein Stück fahren (rot), klicken. 3. Dasselbe an einem Kreis und an einem Rechteck.
  Erwartet: Nur das Stück bis zum Schnittpunkt verschwindet; der Rest sitzt per Regel auf der anderen Linie. Ein Kreis wird zum Bogen. Das Rechteck wird in Linien zerlegt. Strg/Cmd+Z bringt alles zurück.
- [x] **Versatz**
  Schritte: 1. F drücken, Rechteckkante anklicken, Maus nach außen, `3` tippen, Enter. 2. Das Original auf 30 mm Breite stellen. 3. Einen Kreis anklicken und die Maus nach außen klicken.
  Erwartet: Das neue Rechteck liegt genau 3 mm außen, wächst mit dem Original mit. Beim Kreis entsteht ein größerer, konzentrischer Kreis.
- [x] **Versatz einer Kette**
  Schritte: 1. Zwei Linien mit gemeinsamer Ecke. 2. F, eine Linie anklicken, Abstand 5 tippen.
  Erwartet: Beide Linien werden versetzt, die Ecke bleibt sauber geschlossen.
- [x] **Spiegeln**
  Schritte: 1. Senkrechte Hilfslinie (X) als Achse, rechts ein Kreis und eine Linie. 2. M, Achse anklicken, Kreis und Linie anklicken, Enter. 3. Den Kreis im Original verschieben.
  Erwartet: Spiegelbild auf der anderen Seite mit Symmetrie-Symbolen; wandert das Original, folgt das Spiegelbild.
- [x] **Rechteckmuster**
  Schritte: 1. Kreis zeichnen. 2. Q, Kreis anklicken, rechts 3 × 2 mit Abstand 10 / 8 einstellen, „Muster anlegen“. 3. Kreis-Durchmesser ändern.
  Erwartet: Sechs Kreise im Raster; alle werden gleich groß, wenn man das Original ändert.
- [x] **Kreismuster**
  Schritte: 1. Kreis bei X = 20. 2. W, Kreis anklicken, Anzahl 4, „Muster anlegen“.
  Erwartet: Vier Kreise rund um den Nullpunkt (Mitte wählbar über „Mittelpunkt wählen“). Rechtecke werden dabei in Linien zerlegt.
- [x] **Fangen**
  Schritte: 1. Zwei sich kreuzende Linien. 2. Neue Linie am Schnittpunkt beginnen. 3. Rechts bei „Fangen“ „Schnittpunkte“ abhaken und wiederholen. 4. Mit gedrückter Alt-Taste klicken.
  Erwartet: Mit Fang liegt der Startpunkt genau im Schnittpunkt, ohne Fang nicht. Mit Alt wird gar nicht gefangen. Kreise werden an ihren Viertelpunkten gefangen.
- [x] **Hilfslinien**
  Schritte: 1. X drücken, Rechteck zeichnen. 2. X nochmal, zweites Rechteck. 3. Rechteck wählen, X.
  Erwartet: Das erste Rechteck ist gestrichelt und zählt nicht zur Fläche; X auf einem gewählten Element wandelt es um.
- [x] **Hilfetexte der neuen Werkzeuge**
  Schritte: 1. Maus auf Spline, Trimmen, Versatz, Spiegeln, Muster oder die Hilfslinien-Taste legen.
  Erwartet: Kurzer Text, dann Anleitung mit Tipp.
- [ ] **Fangmarkierungen**
  Schritte: 1. Mit dem Linienwerkzeug über Endpunkt, Mitte, Schnittpunkt, Kreis-Viertelpunkt fahren.
  Erwartet: Jede Art hat ihre eigene Form (Quadrat, Dreieck, Kreuz, Raute …) und einen Hinweis. Ob man sie gut erkennt, sieht nur ein Mensch.

## Formen-Werkzeuge (neu in Sitzung 8)

- [x] **Bohrungs-Assistent**
  Schritte: 1. Vorlage „Schild mit Loch“, von oben (Taste 7). 2. Auf die Platte klicken, oben „Bohrung“. 3. Art „Gewinde schneiden“, Größe M2, „Löcher setzen“. 4. Noch zweimal auf die Platte klicken. 5. „Fertig“ oder Esc.
  Erwartet: Drei kleine Kernlöcher, so tief wie die Platte dick ist; oben zählt die Leiste „3 gesetzt“; nach Esc ist der Modus aus.
- [x] **Lochkreis in einer Platte (Motorhalter)**
  Schritte: 1. Quader 40 × 40 × 3. 2. Bei X = 8 eine M3-Bohrung setzen. 3. Doppelklick auf die Platte (Bauteil bearbeiten), das Loch anklicken. 4. „Muster“ → „Kreismuster“. 5. Rechts Anzahl 6.
  Erwartet: Erst vier, dann sechs Löcher rund um die Plattenmitte; alle schneiden durch die Platte.
- [x] **Kreismuster**
  Schritte: 1. Zylinder bei X = 30. 2. Anklicken, „Muster“ → „Kreismuster“. 3. Rechts Anzahl 3. 4. Den Zylinder im Muster dicker machen. 5. „Auflösen“.
  Erwartet: Vier, dann drei Zylinder rundherum; alle werden dicker; nach „Auflösen“ bleibt nur das Original. Im Verlauf steht „3× 360°“.
- [x] **Rechteckmuster mit Formel**
  Schritte: 1. Quader, „Muster“ → „Rechteckmuster“. 2. Anzahl Y = 2. 3. Unter „Maße“ ein Maß `Anzahl = 4` anlegen und bei Anzahl X `Anzahl` eintippen. 4. Das Maß auf 2 stellen. 5. Strg/Cmd+Z bis zum Anfang.
  Erwartet: Erst 3 × 1, dann 3 × 2, dann 4 × 2, dann 2 × 2 Quader; am Ende wieder nur einer.
- [x] **Gespiegelte Kopie**
  Schritte: 1. Zylinder bei X = 20. 2. „Muster“ → „Gespiegelte Kopie“. 3. Rechts „Vorne ↔ hinten“, dann wieder „Links ↔ rechts“ und Lage 10.
  Erwartet: Kopie bei X = −20; vorne/hinten fällt die Kopie mit dem Original zusammen; mit Lage 10 liegt die Kopie bei X = 0.
- [x] **Teilen**
  Schritte: 1. Quader, „Teilen“. 2. Spalt 4. 3. Behalten „Oben“. 4. Lage der Ebene 50. 5. Lage 5.
  Erwartet: Zwei Hälften, mit Spalt 4 mm auseinander; dann nur die obere; bei 50 eine rote Meldung „Die Schnittebene trifft den Körper nicht“; bei 5 wieder in Ordnung.
- [x] **Boolesch**
  Schritte: 1. Zwei Quader, die sich halb überlappen, beide mit Umschalt anklicken. 2. „Boolesch“ → „Abziehen“. 3. Rückgängig, dann „Schnittmenge“. 4. Rückgängig, dann „Vereinigen“.
  Erwartet: Vom ersten Quader bleibt die Hälfte; dann nur das Überlappungsstück; dann ein langer Körper.
- [x] **Wandstärke**
  Schritte: 1. Quader, von oben auf die Deckfläche klicken, „Aushöhlen“. 2. Rechts unter „Wandstärke“ 12 eintippen. 3. Dann 3.
  Erwartet: Offene Schachtel mit 2 mm Wand; bei 12 wird das Feld rot mit „möglich sind weniger als 10 mm“; bei 3 wieder in Ordnung.
- [x] **Hilfetexte der Formen-Werkzeuge**
  Schritte: 1. Maus auf „Bohrung“, „Aushöhlen“, „Muster“, „Teilen“, „Boolesch“ legen.
  Erwartet: Kurzer Text, dann Anleitung mit Tipp, passend zu dem, was der Knopf wirklich tut.
- [ ] **Bohrungs-Vorschau**
  Schritte: 1. Bohrungs-Assistent starten, Maus über schräge und senkrechte Flächen bewegen.
  Erwartet: Der Ring liegt flach auf der Fläche unter der Maus und ist gut zu sehen.
- [ ] **Muster-Kreis**
  Schritte: 1. Ein Kreismuster anklicken.
  Erwartet: Der gestrichelte Kreis und der Punkt in der Mitte machen klar, worum gedreht wird.
- [ ] **Wand von innen**
  Schritte: 1. Ausgehöhlten Quader schräg von oben ansehen.
  Erwartet: Innenwände sind sauber, keine Löcher oder Flackern. (Schnittansicht kommt in Sitzung 9.)

## Ansichten (neu in Sitzung 9)

Nichts hiervon ändert das Modell – kein Schritt in der Zeitleiste, nichts in der Projektdatei.

- [x] **Schnitt**
  Schritte: 1. Zwei Quader hintereinander, Ansicht von vorne (Taste 1). 2. Taste C. 3. Lage −20 eintippen, Enter. 4. „Umdrehen“. 5. „Von der Seite“. 6. Nochmal C.
  Erwartet: Vorne fehlt ein Stück, die Schnittfläche ist schraffiert; ein Klick dort trifft das Innere; „Umdrehen“ zeigt die andere Hälfte; nach C ist alles wieder ganz und es gibt keinen neuen Schritt.
- [x] **Röntgen**
  Schritte: 1. Rechts im Bild den Röntgen-Knopf (oder Taste X). 2. Zweimal auf dieselbe Stelle klicken, wo zwei Teile hintereinander liegen. 3. Nochmal X.
  Erwartet: Körper wie Milchglas, alle Kanten sichtbar; erster Klick wählt das vordere, zweiter das hintere Teil; danach wieder normal.
- [x] **Explosion**
  Schritte: 1. Oben „Ansicht“ → „Explosion“. 2. Regler ganz nach rechts. 3. Ein Teil anklicken, rechts die Höhe ändern. 4. Versuchen, ein Teil zu ziehen. 5. „Zusammensetzen“.
  Erwartet: Teile schweben auseinander, übereinanderliegende Teile nach oben; die Änderung wirkt sofort; Ziehen verschiebt nichts; danach sitzt alles wieder am alten Platz.
- [x] **Explosion: Regeln**
  Schritte: 1. Nur ein Körper, Taste U. 2. Mit zwei Körpern U, dann „Messen“. 3. U, dann eine Skizze anfangen.
  Erwartet: Bei einem Körper ein Hinweis statt Explosion; Messen und Skizze setzen die Teile vorher wieder zusammen.
- [x] **Fokus-Vorschau**
  Schritte: 1. Nichts wählen, „Ansicht“ → „Fokus-Vorschau“. 2. Ein Teil anklicken. 3. Fenster schließen.
  Erwartet: Erst der Hinweis „Wähle ein Teil“, dann links das gewählte Teil allein und groß, mit seinem Namen im Kopf.
- [x] **Neues Projekt setzt zurück**
  Schritte: 1. C, X und U drücken. 2. Neues Projekt.
  Erwartet: Schnitt, Röntgen und Explosion sind aus.
- [x] **Darstellung beim Drehen**
  Schritte: 1. Großes Modell, schnell mit der Maus drehen.
  Erwartet: Bleibt flüssig; während des Drehens darf es kurz etwas unschärfer sein, danach sofort wieder scharf. Abschaltbar unter „Darstellung anpassen“.
- [x] **Hilfetexte der Ansichten**
  Schritte: 1. Maus auf die Menüpunkte unter „Ansicht“ und die Knöpfe Röntgen und Schnitt rechts legen.
  Erwartet: Kurzer Text, dann Anleitung mit Tipp. Auch „Bohrung“, „Aushöhlen“ und „Muster“ an einer Fläche zeigen jetzt ihre Anleitung.
- [ ] **Schraffur**
  Schritte: 1. Ausgehöhlten Quader schneiden.
  Erwartet: Die Wände im Schnitt sind deutlich schraffiert und heben sich vom Rest ab.
- [ ] **Explosion weich**
  Schritte: 1. Explosion ein und aus.
  Erwartet: Teile gleiten weich auseinander und zurück, nichts springt.
- [ ] **Fokus drehen**
  Schritte: 1. Im kleinen Fokus-Fenster ziehen. 2. Doppelklick hinein.
  Erwartet: Nur die Vorschau dreht sich; der Doppelklick schaut wieder wie die große Ansicht.
- [ ] **Röntgen-Kanten**
  Schritte: 1. Röntgen bei einem Teil mit vielen Kanten.
  Erwartet: Verdeckte Kanten sind zu sehen, das Bild bleibt trotzdem übersichtlich.

## Messen, Masse, Auswahl, Versionen (neu in Sitzung 10)

- [x] **Material je Teil**
  Schritte: 1. Zwei Quader (20 mm). 2. Den zweiten anklicken, rechts unter „Material und Gewicht“ PLA wählen. 3. Auswahl aufheben. 4. „Schwerpunkt im Bild zeigen“.
  Erwartet: Erst 8 cm³ und 12,4 g, mit PLA 9,92 g; das Projekt wiegt 22,3 g, der Schwerpunkt rückt zum schwereren Quader; ein schwarz-weißes Schwerpunkt-Symbol erscheint.
- [x] **Messen: Flächen**
  Schritte: 1. „Messen“. 2. Deckfläche eines Quaders 30 × 20 × 10 anklicken. 3. Dann eine Seitenfläche. 4. Deckfläche und eine untere Ecke. 5. Deckfläche und Deckfläche eines höheren Quaders.
  Erwartet: „Fläche 600 mm²“, dann „Winkel 90°“, dann „Abstand 10 mm“, dann der Höhenunterschied als Abstand.
- [x] **Ähnliche auswählen**
  Schritte: 1. Platte mit drei M3- und einem M2-Loch. 2. Ein M3-Loch anklicken, „Ähnliche“. 3. Eine lange Kante anklicken, Taste A, „Abrunden“.
  Erwartet: Alle drei M3-Löcher sind gewählt, das M2 nicht; alle vier langen Kanten werden zusammen abgerundet.
- [x] **Auswahlfilter**
  Schritte: 1. Pfeil-Knopf rechts im Bild → „Nur Körper“, auf eine Fläche klicken. 2. „Nur Kanten“: auf die Fläche, dann auf eine Kante klicken. 3. „Nur Flächen“: dicht neben eine Kante klicken. 4. „Alles“.
  Erwartet: Nur der ganze Körper; nichts, dann die Kante; die Fläche statt der Kante; der Knopf leuchtet nur, solange ein Filter an ist.
- [x] **Versionen**
  Schritte: 1. Projektmenü → „Versionen …“ → speichern als „Erster Stand“. 2. Maß ändern, Teil dazu, Material ändern. 3. „Vergleichen“. 4. Häkchen „Alten Stand im Bild zeigen“ weg. 5. „Zurückholen“. 6. Strg/Cmd+Z.
  Erwartet: Liste mit allen drei Änderungen und dem Gewicht vorher/nachher, alter Stand rot gestrichelt; nach dem Zurückholen ist alles wie vorher, Rückgängig bringt den neuen Stand wieder.
- [x] **Versionen in der Datei**
  Schritte: 1. Version speichern, als Datei speichern. 2. Datei auf einem anderen Rechner (oder nach dem Löschen der Browserdaten) öffnen.
  Erwartet: Die Versionen sind wieder da.
- [x] **Hilfetexte**
  Schritte: 1. Maus auf „Messen“, „Ähnliche“, den Filter-Knopf und „Gewicht“ legen.
  Erwartet: Anleitung mit Tipp.
- [ ] **Schwerpunkt-Symbol**
  Schritte: 1. Schwerpunkt anzeigen, Modell drehen und zoomen.
  Erwartet: Das Symbol bleibt gleich groß, ist immer zu sehen und sitzt an der richtigen Stelle.
- [ ] **Vergleichs-Umriss**
  Schritte: 1. Eine Version vergleichen, bei der ein Teil verschoben wurde.
  Erwartet: Alter und neuer Ort sind klar zu unterscheiden.
- [x] **Gewicht im Projekt** (in „Material je Teil“ mitgeprüft)
  Schritte: 1. Ohne Auswahl rechts „Material und Gewicht“ ansehen.
  Erwartet: Volumen, Gewicht, Schwerpunkt; Hinweis, wenn Teile ein eigenes Material haben.
- [ ] **Push/Pull**
  Schritte: 1. Fläche anklicken, „Hochziehen“, Maus ziehen oder Zahl tippen.
  Erwartet: Die Fläche wächst heraus oder drückt sich hinein.

## Drohnen-Vorlagen (neu in Sitzung 11)

- [x] **5" Freestyle**
  Schritte: 1. Startseite → „Drohnen“ → „5" Freestyle“.
  Erwartet: Neun Teile (Unterteil, Bolzen, Oberplatte, Kamerahalter, Stack, Kamera, Motoren, Propeller, Akku), keine Fehler, 12 Maße links; das Unterteil ist 184 mm breit, hat 28 Löcher, die Kamera sitzt vorne; das Ganze wiegt etwa ein halbes Kilo, der Schwerpunkt liegt in der Mitte.
- [x] **Maße ändern**
  Schritte: 1. Links „Maße“ → Achsabstand 250. 2. Stack 20.
  Erwartet: Arme und Motoren rücken nach außen; die Stack-Löcher und der Stack werden kleiner (20 × 20).
- [x] **7" Long Range**
  Schritte: 1. Startseite → „7" Long Range“.
  Erwartet: Größerer Rahmen (Achsabstand 295, Motorlochkreis 19), keine Fehler, etwa 600–800 g.
- [x] **Explosion und Schnitt an der Drohne**
  Schritte: 1. Taste U. 2. Nochmal U, dann C.
  Erwartet: Die Teile schweben in Schichten auseinander; der Schnitt zeigt das Innere ohne Fehler.
- [x] **Kaufteil mit festem Gewicht**
  Schritte: 1. Einen Quader anklicken, Material → „Kaufteil: festes Gewicht“. 2. 50 eintippen. 3. Zurück auf „Wie das Projekt“.
  Erwartet: Das Feld zeigt erst das berechnete Gewicht, dann „50 g (fest)“; das Projekt rechnet mit 50 g; danach wieder das Materialgewicht.
- [ ] **Sieht aus wie eine Drohne**
  Schritte: 1. 5"-Vorlage von schräg oben, von vorne (1) und von oben (7) ansehen.
  Erwartet: Arme, Motoren, Stack, Kamera vorne, Akku oben – alles an einer sinnvollen Stelle.
- [ ] **Propellerkreise**
  Schritte: 1. Von oben ansehen.
  Erwartet: Die orangefarbenen Kreise berühren sich nicht und ragen nicht in die Kamera.
- [ ] **STEP in einem anderen Programm**
  Schritte: 1. Exportieren, die STEP-Datei z. B. in Fusion oder FreeCAD öffnen.
  Erwartet: Alle Teile kommen an, mit richtigen Maßen.

## Frame-Assistent und Drohnen-Teile (neu in Sitzung 12)

- [x] **Frame-Assistent**
  Schritte: 1. Startseite → „Frame-Assistent“. 2. 3 Zoll, Deadcat, Videosystem DJI O4. 3. „Rahmen bauen“.
  Erwartet: Erst 225 mm für 5"; dann mindestens 15 mm Luft zwischen den Propellern; der Rahmen hat Armwinkel 60° vorne und 35° hinten, Stack 20, Motorlochkreis 12, Kamerabreite 12,36 und Platzhalter für DJI-O4-Sender und -Kamera sowie einen Akku 4S 450 mAh, keine Fehler.
- [x] **Warnungen**
  Schritte: 1. Im Assistenten Achsabstand 150 eintippen. 2. Motor 1103 wählen.
  Erwartet: Erst „Die Propeller überlappen sich …“, dann „Motor 1103 passt eher zu …“.
- [x] **Drohnen-Teile**
  Schritte: 1. Oben „Drohne“ → „Akkus“ → „6S 1300“. 2. „Motoren“ → „Motor 1404“. 3. Auswahl aufheben. 4. „Video“.
  Erwartet: Akku mit 215 g (fest); beim Motor ohne Datenblatt-Gewicht eine gelbe Mahnung, im Projekt „fehlt noch das Gewicht“; unter Video die DJI-, Walksnail- und HDZero-Teile.
- [x] **Lochbild**
  Schritte: 1. Platte 60 × 60 × 4, von oben. 2. „Drohne“ → „Lochbilder und Bausteine“ → „Motor 16“ auf die Platte ziehen. 3. Rechts auf „Stack 30,5“ stellen. 4. Kabelbinder dazu.
  Erwartet: Vier Löcher auf einem 16er-Kreis plus Mittelloch; dann vier Löcher im 30,5er-Quadrat ohne Mittelloch; Kabelbinder-Schlitze ohne Fehler.
- [x] **Hilfetexte**
  Schritte: 1. Maus auf „Drohne“, „Frame-Assistent“ und die Lochbild-Kacheln.
  Erwartet: Anleitung mit Tipp.
- [ ] **Klappfenster „Drohne“**
  Schritte: 1. Alle Gruppen durchklicken.
  Erwartet: Namen gut lesbar, Zusatz klein darunter, nichts abgeschnitten.
- [ ] **Deadcat sieht richtig aus**
  Schritte: 1. Deadcat bauen, von oben ansehen.
  Erwartet: Vorne (unten im Bild) sind die Arme weiter auseinander, die Propellerkreise berühren sich nicht.
- [ ] **Kopfzeile mit Symbolen**
  Schritte: 1. Fenster schmaler ziehen.
  Erwartet: Erst zeigen Messen, Notizen, Ansicht nur ihr Symbol, dann alle außer „Exportieren“; nichts wird abgeschnitten.

## Drohnen-Check, Platten als DXF, Varianten (neu in Sitzung 13)

- [x] **Drohnen-Check an der Vorlage**
  Schritte: 1. Startseite → „5" Freestyle“. 2. Oben „Drohne“ → „Drohnen-Check“.
  Erwartet: Sechs Zeilen; Propeller, Propellerkreise, Teile und Schwerpunkt grün, Gewicht etwa 510 g, Schub zu Gewicht etwa 16,8 : 1 mit „Richtwert … T-Motor F50“.
- [x] **Eigenen Schub eintragen**
  Schritte: 1. Im Check bei „Schub pro Motor“ 1000 eintippen, Enter. 2. Fenster schließen.
  Erwartet: Der Check rechnet neu (4 × 1000 g geteilt durch das Gewicht), ohne „Richtwert“; rechts unter „Projekt“ → „Drohne“ steht das Ergebnis.
- [x] **Fies: Akku nach hinten**
  Schritte: 1. Akku anklicken, Y auf 45 stellen. 2. Check.
  Erwartet: Schwerpunkt gelb oder rot, „… nach hinten verschoben“.
- [x] **Fies: Rahmen zu klein**
  Schritte: 1. Unter „Maße“ Achsabstand 170. 2. Check.
  Erwartet: „Die Propeller überlappen sich …“ und „Propeller … trifft …“ rot.
- [x] **Fies: Teile ineinander**
  Schritte: 1. Stack-Platzhalter auf Z 0 setzen. 2. Check.
  Erwartet: „Ineinander: Unterteil und Stack …“ gelb; „Zeigen“ wählt die beiden Teile aus.
- [x] **Frame-Assistent besteht den Check**
  Schritte: 1. Frame-Assistent: 3" mit DJI O4 Pro, dann 5" Deadcat mit DJI O3, dann 7" mit Walksnail bauen. 2. Jeweils Check.
  Erwartet: Keine roten oder gelben Zeilen bei Propellern, Teilen und Schwerpunkt (3" jetzt mit Akku 4S 450 mAh).
- [x] **Platten als DXF**
  Schritte: 1. 5"-Vorlage → „Exportieren“. 2. STEP abhaken, „Platten als DXF“ anhaken. 3. „Als ZIP speichern“.
  Erwartet: Im ZIP der Ordner DXF mit „Unterteil – 5 mm.dxf“ und „Oberplatte – 2 mm.dxf“; das Unterteil hat 28 Löcher, das Wellenloch vorne rechts liegt bei X 79,55 / Y −79,55.
- [ ] **DXF in der Fräs-Software**
  Schritte: 1. Die DXF-Dateien in LibreCAD, Fusion (Skizze einfügen) oder beim Fräsdienst hochladen.
  Erwartet: Umriss und Löcher in Originalgröße (Millimeter), keine doppelten Linien, Bögen an den Motorauflagen rund.
- [x] **Varianten**
  Schritte: 1. Links „Maße“ → „Neue Variante“ → „5 Zoll“. 2. Achsabstand 250. 3. „Neue Variante“ → „Groß“. 4. Oben „5 Zoll“ wählen. 5. „Vergleichen“. 6. Cmd+Z.
  Erwartet: Nach 2. gelber Hinweis und „Überschreiben“; nach 4. wieder 225; die Tabelle zeigt Achsabstand 225 und 250 mit Gewicht (Groß ist schwerer); Cmd+Z schaltet zurück auf 250.
- [x] **Hilfetexte**
  Schritte: 1. Maus auf „Drohnen-Check“, „Neue Variante“ und „Platten als DXF“.
  Erwartet: Anleitung mit Tipp.
- [ ] **Check-Fenster und Varianten sehen gut aus**
  Schritte: 1. Check bei schmalem Fenster öffnen. 2. Varianten mit langem Namen anlegen.
  Erwartet: Nichts abgeschnitten, Knöpfe in einer Reihe, Tabelle scrollt seitlich, wenn sie zu breit ist.

## KI-Schritte, Erklären, Schwachstellen (neu in Sitzung 14)

Die KI-Punkte gehen nur, wenn Tracery in Claude geöffnet ist. Der automatische Test spielt die KI mit vorbereiteten Antworten nach.

- [x] **KI-Schritte sind markiert**
  Schritte: 1. Leeres Projekt. 2. Unten eintippen: „Bau eine Platte 60 × 40 × 4 mit einem Loch“, Enter.
  Erwartet: Ein Schritt in der Zeitleiste mit kleinem Funken; beim Überfahren steht „von der KI: …“ mit deiner Bitte; im Verlauf ebenfalls ein Funke.
- [x] **KI: Muster und Material**
  Schritte: 1. „Mach vier Löcher im Kreis und nimm PETG“. 2. Im KI-Fenster „Rückgängig“.
  Erwartet: Vier Löcher im Kreis, Material PETG; nach „Rückgängig“ wieder ein Loch und das Projekt-Material.
- [x] **KI baut einen Rahmen**
  Schritte: 1. „Bau mir einen 5-Zoll-Deadcat mit DJI O4 und 6-mm-Armen und GPS“.
  Erwartet: Neues Projekt mit Deadcat, Armdicke 6, GPS als Kaufteil; im KI-Fenster das Ergebnis des Drohnen-Checks ohne Rot.
- [x] **KI-Fehler verständlich**
  Schritte: 1. Viele Anfragen schnell hintereinander (oder Kontingent leer).
  Erwartet: „Gerade sind zu viele Anfragen unterwegs …“, am Modell ändert sich nichts.
- [x] **Erklär diesen Schritt**
  Schritte: 1. 5"-Vorlage. 2. Rechtsklick auf den ersten Schritt der Zeitleiste → „Erklär diesen Schritt“. 3. Rechtsklick im Verlauf auf „Oberplatte“. 4. Akku anklicken, rechts das ?-Symbol.
  Erwartet: „Schritt 1 von 10“, „Aus 9 Körpern werden 28 Löcher geschnitten“, die Maße (Achsabstand …), Material und Gewicht; beim Akku „Kaufteil mit festem Gewicht“.
- [x] **Erklären mit KI**
  Schritte: 1. Im Erklär-Fenster „Genauer von der KI erklären“.
  Erwartet: Grüner Kasten mit Erklärung und Tipp.
- [x] **Schwachstellen: Vorlage und fieses Loch**
  Schritte: 1. 5"-Vorlage → rechts „Schwachstellen suchen“. 2. Ein M3-Loch 2 mm vom Rand der Oberplatte setzen, Armdicke 3. 3. Noch mal suchen, beim Loch „Zeigen“.
  Erwartet: Erst „Keine Schwachstellen gefunden“; dann rot „Löcher nah am Rand – Oberplatte“ (0,3 mm Material) und gelb „Dünne Arme“; „Zeigen“ fährt heran und zeigt einen roten Ring.
- [ ] **Quellen im Schwachstellen-Fenster**
  Schritte: 1. Schwachstellen-Fenster öffnen, unten auf eine Quelle klicken.
  Erwartet: Die Seite öffnet sich in einem neuen Tab.
- [x] **Schwachstellen beheben**
  Schritte: 1. „Armdicke auf 5 mm“. 2. „Von der KI erklären und verbessern lassen“ → „Umsetzen“.
  Erwartet: Armdicke 5; der Vorschlag wird ein markierter KI-Schritt; danach keine Schwachstellen mehr.
- [x] **Hilfetexte**
  Schritte: 1. Maus länger auf das ?-Symbol am Namen, auf „Schwachstellen suchen“ und auf einen KI-Schritt.
  Erwartet: Anleitung mit Tipp.
- [ ] **Echte KI in Claude**
  Schritte: 1. Tracery in Claude öffnen. 2. „Mach die Arme 6 mm dick und prüf die Drohne“. 3. „Erklär diesen Schritt“ mit KI. 4. Schwachstellen mit KI.
  Erwartet: Sinnvolle Antworten auf Deutsch, Änderungen als markierte Schritte, nichts Erfundenes in der Erklärung.
- [ ] **Ringe und Fenster sehen gut aus**
  Schritte: 1. Schwachstelle „Zeigen“ bei dunklem und hellem Design. 2. KI-Fenster offen lassen und die Zeitleiste bedienen.
  Erwartet: Ring gut sichtbar, KI-Fenster verdeckt die Zeitleiste nicht.

## Einfache Oberfläche (neu in Sitzung 15)

- [x] **Umschalten auf der Startseite**
  Schritte: 1. Startseite → „Oberfläche: Einfach – für Einsteiger“. 2. Leeres Projekt.
  Erwartet: Oben nur Körper, Skizze, Bauteile, Drohne, Mehr und Exportieren; kein „Zeichnung“, links kein „Protokoll“; oben rechts steht „Einfach“.
- [x] **Weniger Auswahl**
  Schritte: 1. „Körper“ öffnen. 2. „Bauteile“ öffnen. 3. Einen Quader einfügen und anklicken.
  Erwartet: 6 Grundkörper, 5 Bauteile; in der Leiste am Körper Drehen, Spiegeln, Duplizieren, aber kein Muster, Teilen oder Ähnliche.
- [x] **„Mehr“ und zurück zu Profi**
  Schritte: 1. „Mehr“ → „Messen“. 2. Seite neu laden. 3. Oben rechts auf „Einfach“ klicken.
  Erwartet: Messen startet; nach dem Neuladen ist die einfache Oberfläche noch da; danach steht „Profi“ da und alle Werkzeuge sind zurück.
- [ ] **Mit einem Kind ausprobieren**
  Schritte: 1. Ein Kind (ab 10) mit „Einfach“ eine Platte mit vier Löchern bauen lassen, ohne zu helfen.
  Erwartet: Es findet Körper, Löcher und Exportieren allein; notieren, wo es hängen bleibt.

## Maße als Tabelle (neu in Sitzung 114)

- [x] **Tabelle**: Rechteck und Kreis mit drei Maßen → drei Zeilen („Rechteck 1“, „Kreis 1“); Breite 45 eintippen → Rechteck 45 mm breit, Tabelle bleibt offen.

## Drehteller-Video (neu in Sitzung 113)

- [x] **Aufnahme**: 1,5 s Video → Datei mit Inhalt (video/webm), der Blick ist danach wie vorher; der Dialog öffnet sich.
- [ ] **Abspielen**: Ein 6-s-Video in VLC, PowerPoint und auf dem Handy abspielen – ruckelt es?

## Maus-Steuerung (neu in Sitzung 112)

- [x] **Onshape**: Einstellung wählen → links nichts, Mitte verschieben, rechts drehen; links im Leeren zieht einen Rahmen um zwei Würfel; in der Skizze dreht rechts weiter.
- [ ] **Gewohnheit**: Jemand, der SolidWorks oder Fusion gewohnt ist, probiert seine Einstellung – fühlt es sich richtig an (Trackpad am Mac?)

## Tangente an zwei Kreise (neu in Sitzung 111)

- [x] **Tangente**: Kreise r 10 und r 5, oben angeklickt → Linie berührt beide oben, zwei Tangential-Regeln; Kreis B auf Ø 16 → Linie folgt.
- [ ] **Riemen**: Zwei Riemenscheiben mit beiden Tangenten zeichnen und hochziehen – sauberer Umriss?

## Vorführ-Modus (neu in Sitzung 110)

- [x] **Vorführen**: P → Leisten weg, Modell dreht sich; „Drehen anhalten“ → steht; Esc → alles wieder da.
- [ ] **Beamer**: Auf einem zweiten Bildschirm oder Beamer vorführen – Vollbild und Tempo angenehm?

## Skizze umhängen (neu in Sitzung 109)

- [x] **Grundebene**: Rechteck 30 × 10 auf XY → auf „Vorne (XZ)“: steht senkrecht, x 0…30, z 0…10.
- [x] **Bezugsebene**: auf „Arbeitsfläche 25 mm“ → z 25…28; Rückgängig holt die vorige Ebene.
- [ ] **Auf Fläche**: Eine Skizze auf eine Körperfläche umhängen geht noch nicht – braucht es das?

## Kanten nach Art wählen (neu in Sitzung 108)

- [x] **Erkennen**: L-Profil (Skizze) → genau eine innere Kante (die Kehle), alle anderen außen.
- [x] **Wählen und runden**: „Kanten wählen“ → „Alle inneren Kanten“ → die Kehle bei x = −16, z = 4; Rundung 2 mm ohne Fehler.
- [ ] **Vereinigte Körper**: Bei zwei vereinigten Quadern die neue Kehle runden – geht noch nicht (die Rundung hängt am Ziel-Körper vor dem Vereinigen).

## Rechenzeit je Schritt (neu in Sitzung 107)

- [x] **Messen**: Klotz und M6-Gewindestange → die Gewindestange braucht länger (rund 7 s im Test) und steht oben im Protokoll; Klick wählt sie.
- [ ] **Großes Projekt**: Bei einem trägen Projekt nachsehen – nennt die Liste den richtigen Übeltäter?

## Export-Einstellungen (neu in Sitzung 106)

- [x] **Feinheit**: Scheibe Ø 40 – „Sehr fein“ hat mehr als doppelt so viele Dreiecke wie „Grob“.
- [x] **Format**: „Binär“ beginnt nicht mit „solid“, „Text“ schon und hat so viele „facet normal“ wie Dreiecke.
- [ ] **Slicer**: Eine „Sehr fein“-STL im Slicer öffnen – Größe und Ladezeit in Ordnung?

## Maße als CSV, Auswahl speichern (neu in Sitzung 105)

- [x] **CSV**: Breite 40 und Hoehe = Breite/2 → „Breite;40;40“, „Hoehe;Breite/2;20“; CSV mit Breite 55,5, Tiefe 12 und einer kaputten Zeile laden → Breite geändert, Tiefe neu, eine Zeile übersprungen.
- [x] **Auswahl**: Würfel 1 und 3 als „Ecken“ speichern → Rechtsklick ins Leere „Auswahl: Ecken“ wählt genau diese zwei.
- [ ] **Excel**: Die CSV in Excel öffnen, ändern, speichern und wieder laden – bleiben Umlaute und Kommas richtig?

## Suchen im Verlauf (neu in Sitzung 104)

- [x] **Suchen**: 7 Schritte, „schr“ tippen → nur die Gruppe „Beschlag“ mit „Schraube“, der Cursor bleibt im Feld; Esc leert.
- [x] **Filtern**: „Löcher“ → nur „Bohrung“; „Alle“ → wieder alle 7.
- [ ] **Großes Projekt**: In einem Projekt mit 50 Schritten suchen – geht das flüssig?

## Trägheit und Standfestigkeit (neu in Sitzung 103)

- [x] **Trägheit**: PLA-Quader 20 × 20 × 40 → X und Y = m·(2² + 4²)/12, Z = m·(2² + 2²)/12 (m = 19,84 g).
- [x] **Standfest**: derselbe Quader → „ja – kippt ab 27°“ (atan 10/20); kleiner Fuß mit langem Arm daneben → „nein – kippt um“.
- [ ] **Echtes Teil**: Ein Teil mit bekanntem Trägheitsmoment (z. B. aus Fusion) vergleichen.

## Wandstärke (neu in Sitzung 102)

- [x] **Messen**: Schale 30 × 30 × 10 mit 2-mm-Wänden und 1,5-mm-Boden → Klick auf die Außenwand zeigt „Wand 2 mm“.
- [x] **Ansicht**: Grenze 1,6 mm → Boden rot, „dünnste Stelle 1,5 mm“; Grenze 1,2 mm → „Überall mindestens 1,2 mm“.
- [x] **Tempo**: Drohne mit 49 000 Dreiecken in 0,3 s.
- [ ] **Echtes Gehäuse**: Ein gedrucktes Gehäuse prüfen – stimmen die roten Stellen mit den Stellen überein, die beim Druck Probleme machen?

## Skizze und Fläche als DXF/SVG (neu in Sitzung 101)

- [x] **Skizze**: Rechteck, Kreis, Bogen und eine Hilfslinie → DXF mit 6 Elementen; wieder eingelesen: Kreis r 4, Bogen r 5 in der richtigen Richtung; SVG 42 × 22 mm (mit 1 mm Rand).
- [x] **Fläche**: Oberseite einer Platte mit Loch Ø 8 → 4 Linien und ein Kreis r 4.
- [ ] **Laser/Plotter**: Eine gespeicherte DXF in LightBurn oder Inkscape öffnen – stimmt die Größe?

## Export der Auswahl (neu in Sitzung 100)

- [x] **Auswahl**: Deckel (mit Loch) und Fuß gewählt, Knopf nicht → „Nur die Auswahl (2 Teile)“ erscheint (ohne Haken, wie bisher wird sonst alles exportiert), angehakt: im ZIP „Einzeln/Deckel.stl“ und „Einzeln/Fuß.stl“, das Loch ist im Deckel.
- [ ] **Slicer**: Die Einzel-Dateien in PrusaSlicer oder Bambu Studio öffnen – liegen sie richtig?

## Lage unter der Maus (neu in Sitzung 99)

- [x] **Körper**: Maus auf der Oberseite einer 10 mm hohen Platte bei (5, −5) → „X 5 Y −5 Z 10 mm“.
- [x] **Boden**: Maus neben der Platte → „… · Boden“.
- [x] **Skizze**: in einer Skizze bei (12, 7) → „Skizze X 12 Y 7 mm“.
- [ ] **Großes Modell**: Bei einem Modell mit vielen Teilen die Maus bewegen – ruckelt etwas?

## Bogen über die Mitte, Langloch über die Gesamtlänge (neu in Sitzung 98)

- [x] **Bogen**: Mitte (0, 0), Start (10, 0), Ende (0, 10) → Viertelkreis; Ende neben dem Kreis wird auf den Radius gezogen, ein Bogen über 180° geht auch.
- [x] **Langloch**: Gesamtlänge 40 getippt, Breite 10 → Mitten bei 5 und 35, Maße Breite 10 und Mittenabstand 30; mit der Maus außen 0 bis 20, Breite 6 → Mitten 3 und 17.
- [ ] **Bemaßen**: Ein Langloch über die Gesamtlänge im fertigen Teil nachmessen (Messen-Werkzeug) – stimmt die Länge?

## Rechteck mit runden Ecken, Ecke bilden (neu in Sitzung 97)

- [x] **Rund**: Ecken-Radius 3, Rechteck 40 × 20 getippt → 4 Linien, 4 Bögen, ein Radius-Maß, 3× „Gleich“, Breite und Höhe als Maße.
- [x] **Radius ändern**: Bogen wählen, Radius 5 → alle vier Bögen 5 mm, außen bleibt 40 mm; Strg Z zweimal → leer.
- [x] **Ecke bilden**: kurze waagerechte und senkrechte Linie → treffen sich bei (20, 0); zu lange Linie wird bis zur senkrechten gekürzt.
- [ ] **Gefühl**: Rechteck mit runden Ecken mit der Maus aufziehen und hochziehen – sieht das Teil aus wie erwartet?

## Kopieren und Einfügen in der Skizze (neu in Sitzung 96)

- [x] **Kette**: Doppelklick auf eine Seite eines Linien-Rechtecks wählt alle vier.
- [x] **Einfügen**: Strg C, Strg V → vier neue Linien rechts daneben, „Waagerecht“ und das Längenmaß sind mitgekommen, Verschieben ist aktiv.
- [x] **Andere Skizze**: In einer neuen Skizze Strg V → an derselben Stelle.
- [ ] **Anderes Projekt**: In einem zweiten Tab mit anderem Projekt einfügen – kommt die Kopie an?

## Verschieben und Drehen in der Skizze (neu in Sitzung 95)

- [x] **Verschieben**: Kreis und Linie wählen, X 12 / Y −4 → beide sind genau dort, nichts doppelt.
- [x] **Drehen als Kopie**: Linie um 90° um ihre Mitte → Original bleibt, Kopie steht senkrecht.
- [x] **Rechteck schräg**: 30° → vier Linien; Strg Z holt das Rechteck zurück.
- [ ] **Mit Regeln**: Ein Teil der Skizze, der über „Deckungsgleich“ an anderem hängt, verschieben – ist klar, warum es zurückspringt?

## Kanten einer Fläche, Notiz am Schritt (neu in Sitzung 94)

- [x] **Kanten finden**: Oberseite eines Quaders → 4 Kanten; Mantel eines Zylinders → 2 Kreiskanten (ohne Naht).
- [x] **Alle abrunden**: Oberseite wählen → „Ihre Kanten“ → „Alle abrunden“ → eine Rundung mit 4 Kanten, kein Fehler, Volumen kleiner.
- [x] **Notiz**: „Wand 2 mm, sonst bricht sie“ eintragen → steht am Teil und in der Zeitleiste; Rückgängig nimmt sie weg.
- [ ] **Gehäuse**: An einem echten Gehäuse mit Löchern in der Oberseite „Ihre Kanten“ – werden die Lochkanten mitgenommen, und will man das?

## Vorige Ansicht, Teil dahinter (neu in Sitzung 93)

- [x] **Zurück**: Vorne → oben → rechts, dann zweimal Umschalt Z → oben, dann vorne; mit der Maus drehen und Umschalt Z → wieder vorne; Rechtsklick ins Leere zeigt „Vorige Ansicht“.
- [x] **Dahinter**: Deckel vor Platine – Klick wählt den Deckel, Alt + Klick die Platine, nochmal Alt + Klick wieder den Deckel; Rechtsklick „Dahinter wählen: Platine“.
- [ ] **Mausrad**: Mehrmals zoomen, dann Umschalt Z – geht es in einem Schritt zum Blick vor dem Zoomen?
- [ ] **Mac**: Alt + Klick (Wahltaste) auf dem Mac – kommt der Klick an?

## Längen und Durchmesser (neu in Sitzung 92)

- [x] **Kanten**: Block 40 × 20 × 10 → obere 40er-Kante „Kante 40 mm“, alle vier oberen Kanten „4 Kanten 120 mm“.
- [x] **Rund**: Kreiskante einer Rolle Ø 10 → „Kante Ø 10 mm“; Mantel → „Runde Fläche Ø 10 mm“; Messen am Mantel → „Zylinder Ø 10 mm (R 5)“.
- [x] **Kopieren**: Klick aufs Schild → „10“ in der Zwischenablage, Meldung „kopiert“.
- [ ] **Einfügen**: Den kopierten Wert mit Strg V in ein Maß-Feld einfügen – klappt das in Safari und Firefox?

## Maß zum Ablesen, auf einer Linie (neu in Sitzung 91)

- [x] **Ablesen**: Zwei Linien mit „Gleich“, die erste 30 mm fest → Maß an der zweiten wird „(30)“ in Klammern; erste auf 40 → „(40)“; 55 an der zweiten → Meldung mit „Nur ablesen“.
- [x] **Umschalten**: festes Maß anklicken → „( )“ macht es zum Ablese-Maß; Ablese-Maß anklicken und 35 tippen → wieder fest.
- [x] **Auf einer Linie**: zwei schräge Linien mit Lücke → danach auf einer Geraden; die erste waagerecht → beide auf gleicher Höhe.
- [ ] **Gefühl**: In einer echten Skizze eine Gesamtlänge als Ablese-Maß setzen – ist es klar, dass es nur anzeigt?

## Bezüge (neu in Sitzung 90)

- [x] **Liste**: Block, davon ein Bolzen abgezogen, dazu eine verknüpfte Kopie → am Block „Bezüge (2)“ mit „Bolzen wird hiervon abgezogen“ und der Kopie; Klick wählt das Teil.
- [x] **Löschen**: Block löschen → Hinweis „Daran hingen …“; Rückgängig holt alles zurück.
- [ ] **Großes Modell**: An einem echten Rahmen schauen, ob die Bezüge stimmen und nichts fehlt.

## Verknüpfte Kopien (neu in Sitzung 89)

- [x] **Kopie**: Strg Umschalt D legt eine verknüpfte Kopie an; Original 40 mm breit und gerundet → Kopie auch, ihre Lage bleibt.
- [x] **Lösen**: „Verknüpfung lösen“ → Original ändern, Kopie bleibt; Original gelöscht → Kopie behält ihre Form und meldet es.
- [ ] **Vier Motorhalter**: Einen Halter bauen, drei verknüpfte Kopien verteilen, dann das Original ändern – ändern sich alle vier?

## Normteile (neu in Sitzung 88)

- [x] **Formen**: Zylinderschraube M4 × 12 (Kopf 7 × 4 auf z = 0), Senkschraube M5 × 16 bündig, Mutter M3 (SW 5,5 × 2,4), Scheibe M6 (Ø 12 × 1,6).
- [x] **Gewicht**: Edelstahl, M4 × 12 wiegt etwa 2 g; alle drei stehen in der Bauteile-Leiste.
- [x] **Messen**: Block 40 × 20 × 10 → Oberfläche 28 cm², Hüllmaße; Block und Kugel gewählt → kleinster Abstand 20 mm mit Linie.
- [ ] **Nachwiegen**: Eine echte M3 × 10 Zylinderschraube wiegen und mit Tracery vergleichen.

## Farbe je Fläche, Text in Kurven (neu in Sitzung 87)

- [x] **Flächenfarbe**: Oberseite eines blauen Blocks rot; Block höher → Oberseite bleibt rot; „Flächenfarbe entfernen“.
- [x] **Text in Kurven**: „AB8“ → nur noch Linien und Splines mit gleich vielen Flächen und gleicher Fläche; Rückgängig holt den Text zurück.
- [x] **Messen**: Rechteck 40 × 20 mit Kreisloch → Fläche ohne Loch, Umfang mit Lochrand.
- [ ] **Gravur**: Umgewandelten Text versetzen (0,3 mm) und als Loch in eine Platte setzen.

## Bezugsebenen (neu in Sitzung 86)

- [x] **Grundebene**: Ebene 25 mm über der Arbeitsfläche steht im Verlauf und im Bild.
- [x] **Dialog**: Skizze → „Neue Bezugsebene …“ → 15 mm, 30° → „Von vorne“ legt eine geneigte Ebene an.
- [x] **An Fläche**: 5 mm über der Oberseite; Block höher → Ebene wandert mit; Abstand 30 im Panel; „Skizze hierauf“ und hochziehen.
- [x] **Fläche fehlt**: Block gelöscht → Ebene bleibt und meldet „Fläche fehlt“.
- [ ] **Im Alltag**: Eine schräge Ebene für eine Halterung anlegen, darauf skizzieren – fühlt sich das einfacher an als Ebene verschieben/neigen in der Skizze?

## Anzeige (neu in Sitzung 85)

- [x] **Anzeige-Arten**: Nur Flächen ohne Kanten, Drahtgitter (Flächen unsichtbar, Teil trotzdem anklickbar), verdeckte Kanten (Körper halb durchsichtig), zurück zu Flächen mit Kanten.
- [x] **Durchsichtig**: Sichtbarkeit 40 % macht die Platte durchsichtig, 100 % wieder voll.
- [x] **Blick auf Fläche**: Rechtsklick auf die Oberseite → „Blick senkrecht auf die Fläche“ schaut genau von oben.
- [x] **Ansicht speichern**: „Von oben“ speichern, Ansicht wechseln, im Menü wieder aufrufen.

## Bedienung für jeden Tag (neu in Sitzung 84)

- [x] **Rahmen**: Umschalt + Ziehen von links nach rechts wählt nur Würfel ganz im Rahmen, von rechts nach links alles, was er berührt (gestrichelt).
- [x] **Umkehren**: Strg Umschalt I wählt die anderen Teile.
- [x] **Rechtsklick**: auf einem Teil Menü mit Ausblenden und Löschen; im Leeren „Alles einblenden (2)“.
- [x] **Wiederholen**: „Ausgewählte ausblenden“ über die Eingabezeile, dann Leertaste → nächstes Teil auch ausgeblendet; leere Eingabezeile zeigt „Zuletzt benutzt“.
- [ ] **Am Trackpad**: Rechtsklick (zwei Finger) öffnet das Menü, Ziehen mit zwei Fingern verschiebt weiter die Ansicht?

## Formschritte mit Modus (neu in Sitzung 83)

- [x] **Modus**: Bolzen in einem Block → „Abziehen von …“ macht ein Loch nur in den Block, „Vereinigen“ einen Körper, „Schnittmenge“ nur das gemeinsame Stück; im Verlauf steht „− Block“.
- [x] **Zurück und Rückgängig**: „Eigener Körper“ trennt wieder, Strg Z holt den Modus zurück; Ziel später im Verlauf → Meldung.
- [x] **Durch alles**: Loch-Skizze mit Haken „Durch alles“ geht ganz durch, auch wenn der Block länger wird; „Beidseitig verschieden“ mit 5 und 3 mm.
- [x] **KI**: „Zieh den Bolzen vom Block ab“ → Aktion „verrechnen“, ein Körper mit Loch.
- [ ] **Gefühl**: Ein Gehäuse nur mit Vereinigen und Abziehen bauen (ohne Loch-Körper) – ist das klarer als Körper und Loch?

## Studio-Look und Bild speichern (neu in Sitzung 82)

- [x] **Werkstoff**: Alu-Zylinder ist Metall in Alu-Farbe, CFK-Platte dunkel, PLA behält seine Farbe; Spiegel-Umgebung und Schatten sind an.
- [x] **Farbe**: Eigene Farbe (bunter Kreis) färbt auch ein Alu-Teil, „Farbe vom Werkstoff“ nimmt das zurück.
- [x] **Ansicht-Menü**: Ton → Prüfansicht, Einfach → matt ohne Spiegelung, Studio zurück, Licht „Hell“, Schatten aus.
- [x] **Bild**: 4K mit durchsichtigem Hintergrund → PNG 3840 × 2160 mit Alpha-Kanal.
- [ ] **Am Mac ansehen**: Sieht das Alu wie Alu aus, die Kohlefaser wie Kohlefaser? Sind die Schatten weich und ruckelt nichts beim Drehen?
- [ ] **Bild**: Ein Bild in 4K speichern und in einer Präsentation auf dunklem Hintergrund benutzen.

## DXF/SVG in die Skizze (neu in Sitzung 81)

- [x] **Einfügen**: Skizze offen, SVG öffnen → Linien und Kreis liegen in der Skizze (kein neuer Körper), Mitte auf dem Nullpunkt; Rückgängig nimmt alles heraus; DXF genauso.
- [ ] **Gravur**: Fläche anklicken → „Skizze hierauf“ → Logo hineinziehen → Breite anpassen → als Loch 0,6 mm tief.

## Stückliste (neu in Sitzung 80)

- [x] **Liste**: Vier Arme, Platte, zwei Motoren, ein Teil ohne Gewicht → „Arm × 4“ in einer Zeile, Kaufteile mit festem Gewicht, „fehlt“ beim Teil ohne Gewicht, Summe = Projektgewicht.
- [x] **Dialog**: Klick auf eine Zeile wählt die Teile; CSV enthält alle Zeilen und die Summe.
- [x] **Schrauben**: Lochbilder zählen je vier Schrauben, zwei Löcher übereinander nur eine, Mutternfalle = eine Mutter.
- [x] **Filament**: Platte aus PETG → Gramm und Meter Draht (1,75 mm) stehen unter der Liste.
- [ ] **CSV öffnen**: Datei in Excel, Numbers oder Google Tabellen öffnen – Umlaute und Kommazahlen richtig?

## Flugzeit-Schätzung (neu in Sitzung 79)

- [x] **Drohnen-Check**: 5-Zoll-Vorlage mit 6S 1300 mAh → Zeile „Flugzeit (Schätzung)“ mit Minuten und Watt; die Zahl folgt der Formel.
- [x] **Schwerer = kürzer**, Akku ohne Angaben → Hinweis, winziger Akku → Warnung.
- [ ] **Echt**: Mit der gebauten Drohne schweben und die Zeit stoppen – passt die Schätzung ungefähr?

## Ganze Skizze skalieren (neu in Sitzung 78)

- [x] **Breite ändern**: Rechteck 40 × 20 mit Kreis → Breite 60 tippen → alles ist 1,5-mal so groß, Maße (auch Formeln) sind mitgewachsen, kein Widerspruch.
- [x] **Faktor** 50 % und **Rückgängig**.
- [ ] **Logo**: Importiertes SVG-Logo auf die gewünschte Breite bringen und als Loch 0,6 mm tief in eine Platte setzen.

## SVG importieren (neu in Sitzung 77)

- [x] **Logo**: SVG mit 60 mm Breite öffnen → Platte 60 × 40 × 1 mm; Kreis, gedrehtes Dreieck und runde Ecken stimmen, Y steht richtig herum.
- [x] **Text**: Text in der SVG wird gemeldet („in Pfade umwandeln“); eine SVG nur mit Text legt nichts an.
- [ ] **Echtes Logo**: Ein Logo aus Inkscape oder dem Internet ins Fenster ziehen – stimmt die Form, lässt es sich als Loch in eine Platte setzen (Gravur)?

## Vieleck drehen (neu in Sitzung 76)

- [x] **Drehung**: Sechseck anklicken → Feld „Drehung“; „Fläche oben“ legt eine Seite waagerecht nach oben, „Ecke oben“ dreht zurück.

## Motorverkleidung (neu in Sitzung 75)

- [x] **Baustein**: Drohne → Lochbilder und Bausteine → „Motorverkleidung“ ist da.
- [x] **Passt**: Motor Ø 28 × 18 und Arm 12 × 5 stecken ohne Durchdringung in der Hülle; sie ist hohl.
- [x] **Hecklänge** ändern → das Heck wird länger.
- [ ] **Drucken**: Hülle mit der Spitze nach oben drucken – ohne Stützen? Lässt sie sich über Motor und Arm schieben?

## DXF importieren (neu in Sitzung 74)

- [x] **Platte**: DXF in Zoll mit runder Ecke, Loch und Langloch öffnen → 3 mm dicke Platte in Millimetern, mittig, mit allen Löchern.
- [x] **Offen / unlesbar**: DXF ohne geschlossenen Umriss oder binäre DXF → Meldung, nichts wird angelegt.
- [ ] **Echte Datei**: Eine Rahmenplatte vom Hersteller ins Fenster ziehen – stimmt die Größe, sind alle Löcher da?
- [ ] **Bearbeiten**: Platte anklicken → „Skizze bearbeiten“ → der Umriss lässt sich ändern.

## Zeitleiste mit Vorschau (neu in Sitzung 73)

- [x] **Vorschau**: Drei Körper, Maus über den ersten Schritt halten → nur der erste ist zu sehen, rechts „Vorschau: Stand nach Schritt 1“, der Marker bleibt.
- [x] **Zurück**: Maus aus der Zeitleiste → wieder alle drei; eine Änderung beendet die Vorschau auch.
- [ ] **Gefühl**: Bei einem großen Projekt über die Schritte fahren – kommt die Vorschau schnell genug, stört sie nicht?

## Antenne als Kaufteil (neu in Sitzung 72)

- [x] **Leiste**: Drohne → Empfang und GPS → „Antenne Pilz (eigene Maße)“ und „Antenne Stab (eigene Maße)“.
- [x] **Pilz**: 45 mm lang, Kopf Ø 14, Gewicht leer (zum Eintragen), ohne Fehler.
- [x] **Stab mit U.FL**: 80 mm lang, 4 mm dick.
- [ ] **Im Antennenhalter**: Pilz-Antenne in den Antennenhalter stecken – passt der Röhrchen-Durchmesser?

## Schnitt eines Körpers in die Skizze (neu in Sitzung 71)

- [x] **Zylinder**: Zylinder Ø 20 × 30, Skizze „Stehend (vorne)“ durch die Mitte → „Kante“ (Z) → Klick auf die Mantelfläche → Rechteck von x −10 bis 10, Höhe 0 bis 30.
- [x] **Steg**: Klick auf den Quader 40 × 6 × 6 → seine Kontur kommt dazu (bis x = 20).
- [x] **Rückgängig** nimmt den ganzen Schnitt auf einmal zurück.
- [ ] **Rumpf**: Querschnitt des Speed-Rumpfs als Skizze holen und daran eine Halterung zeichnen – passt sie?

## Rohr-Punkte hängen am Körper (neu in Sitzung 70)

- [x] **Anklicken**: Quader A und B, Rohr im Raum von A oben nach B oben → beide Punkte hängen an ihrem Quader.
- [x] **Mitwandern**: B um 20 mm verschieben → das Rohr-Ende wandert mit; Strg Z → beides zurück.
- [x] **Lösen**: rechts „P2 hängt an „B““ → „lösen“ → B verschieben, der Punkt bleibt stehen.
- [ ] **Kabelkanal am echten Modell**: Stack verschieben – folgt der Kanal sinnvoll?

## Rahmen mit einzelnen Armen (neu in Sitzung 69)

- [x] **Frame-Assistent**: „Arme: Einzeln (Sandwich mit Bodenplatte)“ → Bodenplatte und vier Arm-Teile statt „Unterteil“, ohne Fehler.
- [x] **Maße**: Bodenplatte von −Bodenplatte bis 0, Armspalt 0,4 mm; die beiden vorderen Arme liegen genau 0,4 mm auseinander.
- [x] **Drohnen-Check**: alles ok, keine Teile ineinander.
- [x] **DXF**: Bodenplatte und vier Arme als eigene Platten.
- [ ] **Fräsen und Schrauben**: Halten die Bolzen-Schrauben die Arme fest genug, oder braucht jeder Arm noch eine zweite Schraube?

## Skizzen-Ebenen mittig und durch drei Punkte (neu in Sitzung 68)

- [x] **Mittig**: Quader oben bei z = 10 und z = 40 → Skizze → „Mittig zwischen zwei Flächen“ → beide Deckflächen anklicken → Skizze bei z = 25; Rechteck 3 mm hochziehen → Körper von 25 bis 28.
- [x] **Durch drei Punkte**: knapp neben drei Ecken der Deckfläche klicken → rasten ein, Ebene z = 10, Ursprung in der ersten Ecke, X-Achse zur zweiten Ecke.
- [x] Während des Anklickens wird nichts ausgewählt (keine Kontextleiste im Weg).
- [ ] **Schräge Ebene**: drei Punkte an einem schrägen Teil – liegt die Skizze so, wie man es erwartet?

## Rohr im Raum: rechtwinklig und parallel (neu in Sitzung 67)

- [x] **Auswahl**: erstes Stück 4 Richtungen (frei, X, Y, Z), ab dem zweiten zusätzlich „rechtwinklig zum vorigen“ und „parallel zum vorigen“.
- [x] **Rechtwinklig**: Rohr (0,0,0) → (10,0,10) → (25,3,12): zweites Stück rechtwinklig → (16,5 | 3 | 3,5), Skalarprodukt 0.
- [x] **Parallel** danach: läuft in Richtung des ersten Stücks weiter und behält seine Länge; Schild im Bild zeigt ∥.

## Längen im Bild beim Rohr im Raum (neu in Sitzung 66)

- [x] **Anklicken und tippen**: Rohr durch (0,0,0), (0,0,20), (20,0,20) wählen → am ersten Stück steht „20“; anklicken, 25, Enter → Punkte (0,0,25) und (20,0,25), Schild zeigt „25 🔒“; Körper 27 hoch, ohne Fehler.
- [ ] **Gefühl**: Stören die Schilder bei vielen Punkten?

## Text entlang einer Kurve (neu in Sitzung 65)

- [x] **Entlang**: Spline (Hilfslinie) von (−30, 0) über (0, 15) nach (30, 0), Text „FPV“ → „Entlang: Spline 1“ → alle Buchstaben höchstens 5,6 mm von der Kurve und darüber, mittig.
- [x] **Andere Seite** → unter der Kurve; „Verschieben entlang“ 10 → wandert auf der Kurve.
- [x] **Kurve ändern**: mittlerer Punkt auf 25 → der Text folgt.
- [x] **Gerade**: „Entlang: Gerade“ → Felder weg; Rückgängig, Fertig → Körper mit Schrift ohne Fehler.
- [x] **KI-Kollege**: Schrift „FPV“ mit „entlang“ → Hilfslinie (Spline) und Text darauf, Körper ohne Fehler.
- [ ] **Schrift auf einem gebogenen Arm**: Name entlang der Armkante drucken – lesbar?

## Vorschau in echter Form beim Ziehen (neu in Sitzung 64)

- [x] **Motor ziehen**: Drohne → Motoren → „Motor 2207“ auf eine Platte ziehen → während des Ziehens der echte runde Motor an der Maus (nicht anklickbar, die Größe unten rechts ändert sich nicht); nach dem Loslassen ist die Vorschau weg, der Motor liegt auf der Platte.
- [x] **Magnet** wie vorher: rastet in die Mitte der Fläche.
- [ ] **Gefühl**: Ruckelt die Vorschau bei großen Teilen (Rahmen-Bausteine) auf langsamen Rechnern?

## Fase mit zwei Abständen oder Winkel, Rundung von … bis (neu in Sitzung 63)

- [x] **Zwei Abstände**: Quader 20 × 20 × 10, Fase 2 an einer oberen Kante (Volumen 3960) → „Zwei Abstände“ (2 und 4) → 3920; „Seiten tauschen“ → gleiches Volumen, die Deckfläche ist 1 mm weiter/kürzer.
- [x] **Mit Winkel**: 2 mm und 30° → 4000 − ½ · 2 · 2 · tan 30° · 20; 45° → wieder 3960; zurück auf „Gleich“ → Daten sauber.
- [x] **Rundung von … bis**: Rundung 2 → „Von … bis“ (2 bis 1) liegt zwischen gleichmäßig 2 und 1; bis 4 → mehr weg; „Richtung tauschen“ tauscht die Werte, gleiches Volumen.
- [ ] **Aussehen**: Sieht die wachsende Rundung an einem Arm gut aus (dünn am Motor, dick an der Mitte)?

## Rohr im Raum mit Regeln und Maßen (neu in Sitzung 62)

- [x] **Entlang Z**: Rohr durch (0,0,0), (3,1,20), (30,2,22) → erstes Stück „entlang Z“ → zweiter Punkt (0,0,20), der dritte wandert mit (27,1,22).
- [x] **Länge**: erstes Stück Länge 30 → (0,0,30) und (27,1,32); zweites Stück „entlang X“ → (27,0,30); Körper bis Höhe 32, ohne Fehler.
- [x] **Startpunkt** auf X = 10 → alle Punkte wandern mit, die Regeln halten; Feld der Länge heißt „Länge (fest)“.
- [x] **Rückgängig** und Länge 0 → Stück wieder ohne feste Länge, Richtung bleibt.
- [x] **KI-Kollege**: Antennenrohr mit „regeln“ (senkrecht 25, dann 15 nach hinten) → Punkte genau (0,0,25) und (0,15,25).
- [ ] **Antennenrohr drucken**: senkrecht hoch und nach hinten geknickt – steht es gerade?

## H-Rahmen (neu in Sitzung 61)

- [x] **Frame-Assistent**: Rahmenform „H-Rahmen (40°)“ → genug Luft zwischen den Propellern, keine Warnung.
- [x] **Aufbau**: Unterteil mit Längsträger links/rechts und Querträger vorne/hinten, keine schrägen Arme; Armwinkel vorne und hinten 40°.
- [x] **Maße**: Unterteil reicht genau bis zu den Motorauflagen (Achsabstand/2 · sin 40° bzw. cos 40° plus Auflage).
- [x] **Drohnen-Check**: Propellerabstand, Propeller frei, keine Teile ineinander, Schwerpunkt – alles ok.
- [x] **DXF**: Unterteil als DXF mit Umriss und 28 runden Löchern.
- [ ] **Fräsen**: DXF im Fräsprogramm öffnen – Träger und Mittelplatte ein zusammenhängender Umriss mit zwei Fenstern?

## Ellipse versetzen, Ketten-Versatz zusammen ändern (neu in Sitzung 60)

- [x] **Ellipse**: Ellipse 40 × 20, 0,3 rad gedreht → Versatz 3 nach außen → geschlossene Spline durch 48 Punkte, jeder Punkt und die Kurve dazwischen 3 mm (± 0,03) von der Ellipse.
- [x] **Zu weit nach innen**: 6 mm nach innen (kleinster Krümmungsradius 5 mm) → Hinweis „höchstens …“, nichts Neues.
- [x] **Kette zusammen**: zwei Linien mit Ecke, Versatz 5 → beide Regeln gehören zusammen; am Regel-Symbol „Abstand (alle 2 Stücke)“ auf 8 → beide Kopien 8 mm weg, die Originale bleiben stehen; Strg Z → wieder 5.
- [ ] **Ellipse als Rand**: Ellipse versetzen und als Wand hochziehen – gleichmäßig dick?

## Text im Bogen (neu in Sitzung 59)

- [x] **Bogen-Radius**: Text „FPV“ (Mitte, 5 mm) bei (0, 40), Bogen-Radius 20 → alle Buchstaben liegen zwischen 20 und 25 mm um (0, 20), die äußeren sinken ab.
- [x] **An Kreis legen**: Kreis r = 30 in der Skizze → „An Kreis legen“ → Grundlinie genau auf dem Kreis, oben, Bogen 30.
- [x] **Rückgängig** im Skizzenmodus: wieder Bogen 20; Fertig → Körper ohne Fehler.
- [ ] **Ring mit Schrift drucken**: oben „TRACERY FPV“ nach außen, unten „5 ZOLL“ nach innen gewölbt – lesbar und sauber gedruckt?

## Übergang mit zwei Führungskurven (neu in Sitzung 58)

- [x] **Erst eine**: Rechteck 30 × 20 unten, Kreis Ø 16 40 mm darüber → Übergang → noch keine „Zweite Führungskurve“; Führungskurve zeichnen, in X bauchig, Fertig.
- [x] **Zweite vorgezeichnet**: „Zweite zeichnen“ → Ebene quer zur ersten, Spline von der Rechteckkante in Y (10) zur Kreiskante (8), Hinweis rechts.
- [x] **Beide Richtungen**: Mitte der zweiten auf 20 → Vorschau in Y über 36 mm breit, in X so breit wie mit der ersten; Fertig → mehr Volumen; Strg Z → nur die erste.
- [x] **Ohne Führungskurve** nimmt beide weg, Volumen wie am Anfang.
- [x] **KI-Kollege**: Rumpf aus Ellipse und Kreis mit „fuehrungskurve“ (YZ, Höhe 20) und „fuehrungskurve2“ (XY, Breite 25) → Körper 20 hoch und 25 breit.
- [ ] **Speed-Rumpf von Hand**: drei Ellipsen, erste Kurve von der Seite, zweite von oben – sieht der Rumpf glatt aus und lässt er sich drucken?

## Luftwiderstand und Höchstgeschwindigkeit (neu in Sitzung 57)

- [x] **Form erkannt**: Quader 100 × 20 × 10 namens „Rumpf“ → Ansicht → Fahrtwind → Form „Stromlinien-Rumpf · cw 0,5“, bei 100 km/h etwa 0,2 N (1000 mm² Stirnfläche).
- [x] **Tempo und Form**: 200 km/h → viermal so viel; „Offener Rahmen · cw 1,1“ → 2,2-mal so viel.
- [x] **Ohne Schub**: Hinweis, im Drohnen-Check den Schub pro Motor einzutragen.
- [x] **Formel**: 2 kg Schub, 1 kg Gewicht, cw 1, 10 cm² → 60° Neigung, rund 600 km/h.
- [x] **Speed-Drohne**: Bausatz 5" Speed, Schub 1500 g pro Motor → „Höchstens etwa … km/h“ mit Neigung, Rumpf-Neigung und Motorneigung.
- [ ] **Vergleich mit echten Flügen**: Wie nah liegt die Schätzung an der GPS-Höchstgeschwindigkeit einer echten Speed-Drohne?

## Magnet auf runden Flächen (neu in Sitzung 56)

- [x] **Rohr oben**: Zylinder Ø 20 × 40 liegend (um X gekippt, unten auf dem Boden) → Mantel anklicken → „Bohrung“ → „Löcher setzen“ knapp neben der höchsten Linie → Loch genau oben (Höhe 20), senkrecht.
- [x] **Mitte oben**: knapp neben der Mitte der Länge oben fahren → Hinweis „Mitte · ganz oben“, rosa Ring um das Rohr und Linie längs; Klick → Loch genau bei (0, 0, 20).
- [x] **Seitlich**: Ansicht von rechts, Mantel knapp neben der Seite anklicken → Loch genau bei x = 10, zeigt waagerecht nach außen.
- [x] **Kugel**: Kugel Ø 20, vorne am Äquator fahren → „Mitte · ganz vorne“, Loch genau auf dem Radius.
- [x] **Ebene Flächen** wie bisher (Mitte, Mittellinie, gleicher Randabstand); Strg hält den Magneten an.
- [ ] **Speed-Rumpf**: Kamera-Halter oder Antennenhalter aus der Leiste oben auf den Rumpf ziehen – steht er gerade und mittig?

## Übergang mit Führungskurve (neu in Sitzung 55)

- [x] **Vorgezeichnet**: Rechteck 30 × 20 unten, Kreis Ø 16 40 mm darüber → Übergang → „Führungskurve zeichnen“ → Spline von der Rechteckkante (15) zur Kreiskante (8), Hinweis rechts.
- [x] **Bauchig**: mittleren Punkt auf 25 ziehen → Vorschau in X über 45 mm breit, in Y und in der Höhe gleich; „Fertig“ → mehr Volumen; Strg Z → wie vorher.
- [ ] **Speed-Rumpf**: drei Ellipsen hintereinander und eine Führungskurve von oben – sieht der Rumpf glatt aus?

## Armverkleidung (neu in Sitzung 54)

- [x] **Baustein**: Drohne → Lochbilder und Bausteine → „Armverkleidung“ ist da.
- [x] **Maße**: Arm 14 × 5, Wand 1 → Profiltiefe 33,6 mm (2,4 × Armbreite), Nase 10,1 mm vor der Armmitte, etwa 10,8 mm dick, symmetrisch; ein Arm 14 × 5 steckt ohne Durchdringung im Schlitz.
- [x] **Profiltiefe 50**: Hülle wird im Verhältnis schlanker.
- [ ] **Drucken**: Hülle aus PETG drucken und über einen echten Arm schieben – passt das Spiel?

## Explosion in Gruppen (neu in Sitzung 53)

- [x] **Von selbst**: nur eine Gruppe aus drei Quadern (mit Loch) → Explosion → die Quader rücken einzeln auseinander, das Loch bleibt im ersten; Klick auf einen wählt den echten Quader in der Gruppe; Zusammensetzen → Gruppe wieder ganz.
- [x] **Häkchen**: ein Teil plus Gruppe → normal auseinander, „Gruppen auch zerlegen“ zerlegt die Gruppe dazu.
- [ ] **Bauanleitung**: 5"-Bausatz zerlegen und als Bild für eine Bauanleitung nutzen.

## Gelenke in Gruppen (neu in Sitzung 52)

- [x] **Gelenk in der Gruppe**: Gruppe (bei x 50, um 90° gedreht) mit zwei Armen → beide Arme links im Verlauf wählen → Knopf „Gelenk“ da; Gruppe + eigener Arm → kein Knopf.
- [x] **90°**: Arm B steht senkrecht, bleibt aber in der Gruppe; Strg Z legt ihn wieder hin.
- [x] **Bewegung prüfen** findet die Stellen, an denen die Arme ineinanderstecken; „Abspielen“ erklärt, dass es nur ganz oben im Verlauf geht.
- [ ] **Von Hand**: Klappe an einem Gehäuse (beides in einer Gruppe) auf- und zuklappen.

## Ellipse trimmen (neu in Sitzung 51)

- [x] **Halbe Ellipse**: Ellipse 40 × 20 und senkrechte Linie durch die Mitte → Trimmen auf die rechte Hälfte → links bleibt eine Spline, die genau auf der Ellipse liegt, ihre Enden sitzen auf der Linie; Strg Z bringt die Ellipse zurück.
- [ ] **Von Hand**: halbe Ellipse hochziehen und die Fläche mit dem Original vergleichen.

## Größere Knöpfe für Einsteiger (neu in Sitzung 50)

- [x] **Einfach**: Quader anlegen, „Profi“ → „Einfach“ → Knöpfe oben, in der Kontextleiste und Zeilen im Verlauf werden größer, die Oberleiste bleibt einzeilig; zurück zu „Profi“ wie vorher.
- [ ] **Auf dem Tablet**: Lassen sich alle Knöpfe gut mit dem Finger treffen?

## Wand um Löcher in Druckteilen (neu in Sitzung 49)

- [x] **Zu dünn**: Quader 30 × 20 × 12 aus PETG, Loch Ø 3,2 senkrecht 0,2 mm vom Rand → Schwachstellen: „Dünne Wand um ein Loch“ (rot); 1,6 mm vom Rand → gelb; 3,4 mm → nichts.
- [x] **Kein Fehlalarm**: Querloch Ø 3 durch eine runde Klemme Ø 20 → nichts.
- [x] **Carbon-Platten**: prüft weiter die Platten-Regel („Löcher nah am Rand“).
- [ ] **Von Hand**: eigenes Druckteil mit vielen Löchern – stimmen die markierten Stellen?

## Erste Schritte (neu in Sitzung 48)

- [x] **Liste erscheint**: Oberfläche „Einfach“, leeres Projekt → links „Erste Schritte 0 von 4“.
- [x] **Hakt sich ab**: Quader hinzufügen (1 von 4), Breite ändern (2 von 4), Zylinder als Loch (3 von 4), exportieren (4 von 4, „Geschafft“).
- [x] **Wie?**: beim Speichern öffnet sich der Export.
- [x] **Ausblenden**: Kreuz → bleibt aus, auch bei neuem Projekt; in „Profi“ gibt es die Liste nicht.
- [ ] **Mit einem Kind ausprobieren**: Findet es alle vier Schritte allein?

## KI-Kollege legt Gelenke an (neu in Sitzung 47)

- [x] **Klapparm**: „Bau mir einen Klapparm“ → zwei Arme, Gelenk an der Oberkante, Bereich −120 … 0°, Stellung −90° → Arm B steht senkrecht.
- [x] **Doppelt abgelehnt**: Ein zweites Gelenk, das Arm B noch einmal bewegen würde, legt er nicht an und sagt warum.
- [ ] **In Claude von Hand**: „Bau mir einen Greifer mit zwei Gelenken“ – stimmt die Kette?

## Schwerpunkt ausgleichen (neu in Sitzung 46)

- [x] **Akku verschieben**: 5"-Bausatz, Akku auf Y 45 → Drohnen-Check → beim Schwerpunkt „Akku verschieben“.
  Erwartet: Der Akku wandert nach vorne, der Check zeigt den Schwerpunkt grün; Strg Z stellt ihn zurück.
- [ ] **Mit echter Waage vergleichen**: fertige Drohne am Schwerpunkt-Punkt auf zwei Fingern balancieren.

## Rohr im Raum (neu in Sitzung 45)

- [x] **Glatte Kurve**: Rohr Ø 4 durch (0,0,0), (30,0,10), (30,30,20) → Volumen = Querschnitt × Länge der Kurve.
- [x] **Gerade Stücke**: „Verlauf: Gerade Stücke, runde Ecken“ → Volumen passt zu den zwei geraden Stücken.
- [x] **Im Bild klicken**: Platte 40 × 40 × 10 → Körper → „Rohr im Raum“ → zwei Punkte auf die Oberseite, einer daneben → Enter.
  Erwartet: drei Punkte; die auf der Platte liegen 3 mm über der Oberseite (Rohr Ø 6 liegt auf), der dritte auf gleicher Höhe.
- [x] **Punkte ändern**: Z von Punkt 3 auf 30 → Rohr steigt an; „Punkt 2 löschen“ → zwei Punkte; Strg Z → wieder drei.
- [x] **KI-Kollege**: „Leg mir einen Kabelkanal, der nach oben läuft“ → Rohr durch drei Punkte im Raum, hohl.
- [ ] **Kabelkanal von Hand**: um einen Stack herum ein Rohr Ø 5 mit Wand 1 legen und drucken.

## Gelenk: Anschlag und Abspielen (neu in Sitzung 44)

- [x] **Anschlag übernehmen**: zwei Arme mit Drehgelenk → „Bewegung prüfen“ → „Als Anschlag übernehmen“ setzt Von/Bis auf den freien Bereich; Strg Z → wieder −90 … 90.
- [x] **Abspielen**: „Bewegung abspielen“ → der Arm bewegt sich im Bild zu beiden Anschlägen und zurück; danach steht alles wie vorher, das Projekt ist unverändert.
- [ ] **Klapparm von Hand**: Kette Platte → Arm → Greifer abspielen – bewegt sich der Greifer mit?

## Fahrtwind (neu in Sitzung 43)

- [x] **Stirnfläche messen**: Quader 100 × 20 × 10 → Ansicht → „Fahrtwind (Stirnfläche)“.
  Erwartet: Blick von vorne, orthografisch; unten „Stirnfläche 10 cm² ohne Propeller“. Bei Neigung 30° etwa 18,7 cm².
- [x] **Propeller nur mit Häkchen**: Propeller 5" dazu → Fläche bleibt gleich; mit „Propeller mitzählen“ wird sie größer.
- [x] **Schließen**: Kamera und Perspektive wie vorher.
- [ ] **Speed-Rumpf von Hand**: 5"-Speed-Drohne aus dem Frame-Assistenten → Fahrtwind; Nase dicker machen (Rumpfdurchmesser) und vergleichen.

## Drohnen-Check für eigene Rahmen (neu in Sitzung 42)

- [x] **Motoren im Muster**: Platte 190 × 190 × 4, ein Motor (Kaufteile) bei 80/−80 auf der Platte, Kreismuster ×4 → Drohnen-Check.
  Erwartet: „Selbst gebauter Rahmen: 4 Motoren erkannt“, Propellergröße fehlt noch; Feld „Propeller-Durchmesser“ → 5 → Propeller-Abstand 33 mm, Kreise frei.
- [x] **Turm im Propellerkreis**: Quader 10 × 10 × 40 bei 80/−40 → „Propeller vorne rechts trifft Kamera-Turm“.
- [x] **Echter Propeller**: Propeller 5" aus „Kaufteile“ auf einen Motor → Größe kommt von dort; Propeller und Motor gelten nicht als „ineinander“.
- [x] **Schub und sechs Motoren**: Schub 1000 g → Verhältnis mit vier Motoren; Kreismuster auf 6 → sechs Motoren mit eigenen Namen.
- [ ] **Eigener Rahmen von Hand**: einen Rahmen frei zeichnen, Motoren und Propeller aus „Kaufteile“ aufsetzen, Akku drauf – passt der Schwerpunkt?

## Übergang mit Mittellinie (neu in Sitzung 41)

- [x] **Mittellinie zeichnen**: Rechteck 30 × 20 unten, Kreis Ø 16 40 mm darüber → beide wählen → „Übergang“. Rechts „Mittellinie zeichnen“.
  Erwartet: Skizze „Stehend (vorne)“, eine Spline durch die Mitten der beiden Umrisse, zwei dünne Hilfskanten zeigen, wo die Umrisse stehen; grüner Hinweis rechts; keine roten „offenen Enden“.
- [x] **Biegen mit Vorschau**: mittleren Punkt der Spline 20 mm zur Seite ziehen.
  Erwartet: Der Körper biegt sich schon in der Skizze mit (S-Form); unten und oben bleiben Rechteck und Kreis, wo sie waren.
- [x] **Fertig / Rückgängig / Ohne Mittellinie**: „Fertig“ → der Übergang folgt der Linie, „Spitze verlängern“ ist weg. Strg Z → wieder gerade. Strg Y, dann „Ohne Mittellinie“ → gerade.
- [x] **Warnung bei schräger Linie**: Mittellinie so ziehen, dass sie den unteren Umriss fast flach trifft → gelber Hinweis „trifft … schräg“.
- [x] **KI-Kollege**: „Bau mir einen Rumpf, der nach oben schwingt“ mit drei Profilen und „mittellinie“ → ein Übergang entlang der Linie, ohne Fehler.
- [ ] **Speed-Rumpf von Hand**: drei Ellipsen hintereinander (vorne −Y), Mittellinie nach oben geschwungen, dann Kanten runden und als STL drucken.

## Gelenk-Ketten (neu in Argon 1)

- [x] **Zwei Gelenke in einer Kette**
  Schritte: Drei Quader 20 × 10 × 4 nebeneinander (Grundplatte, Arm, Greifer). Erst Grundplatte + Arm → „Gelenk“ → Kante bei X 10. Dann Arm + Greifer → „Gelenk“ → Kante bei X 30. Arm anklicken, erstes Gelenk auf 90° stellen.
  Erwartet: Rechts beim Arm stehen beide Gelenke; bei 90° steht der Arm senkrecht und der Greifer samt seiner Gelenkachse ist an die Spitze des Arms mitgewandert.
- [x] **Kreis wird abgelehnt**: Greifer + Grundplatte wählen → „Gelenk“ – Hinweis, dass das einen Kreis ergäbe; es wird kein drittes Gelenk angelegt.
- [x] **Rückgängig**: Strg Z stellt Arm, Greifer und die zweite Gelenkachse in einem Schritt wieder waagerecht her.

## Schiebegelenk (neu in Sitzung 40)

- [x] **Schlitten auf Schiene**: Schiene 40 × 10 × 4, Schlitten 10 × 10 × 4 obendrauf, beide wählen → „Gelenk“ → vordere obere Kante der Schiene. Rechts „Art: Schieben“, Weg 10.
  Erwartet: Der Schlitten rutscht 10 mm entlang der Schiene; „Bewegung prüfen“ meldet „Frei im ganzen Bereich“.

## Drehgelenk (neu in Sitzung 39)

- [x] **Gelenk anlegen und drehen**
  Schritte: Zwei Quader 20 × 10 × 4 nebeneinander, beide wählen → „Gelenk“ → die gemeinsame obere Kante anklicken. Winkel 90.
  Erwartet: Der zweite Quader steht senkrecht; rechts gibt es den Abschnitt „Gelenk“ mit Regler, Winkel, Von und Bis.
- [x] **Bewegung prüfen**: „Bewegung prüfen“ meldet, ab welchem Winkel der bewegte Quader in den anderen stößt.
- [ ] **Klapparm drucken**: Arm mit Loch, Stift im Rahmen, Gelenk um den Stift – stimmt der Anschlag, den Tracery meldet, mit dem echten Teil?

## Skizzen-Muster als Ganzes ändern (neu in Sitzung 38)

- [x] **Anzahl und Abstand nachträglich**
  Schritte: Kreis zeichnen, „Rechteckmuster“ (Q), Kreis anklicken, 3 × 10 mm, „Muster anlegen“. Dann das Regel-Symbol einer Kopie anklicken, unter „Ganzes Muster“ 5 und 8 mm eintragen, „Muster ändern“.
  Erwartet: Fünf Kreise im Abstand 8 mm; ein Rückgängig bringt die drei zurück.

## Überhänge in der Schwachstellen-Analyse (neu in Sitzung 37)

- [x] **Überhang wird gemeldet**: L-förmige Gruppe wie oben, „Schwachstellen suchen“ – Hinweis „Überhang beim Drucken – L“ mit 300 mm²; ohne den oberen Quader verschwindet er.

## Überhänge für den 3D-Druck (neu in Sitzung 36)

- [x] **Überhang wird rot**
  Schritte: Gruppe aus einem Quader 20 × 20 × 10 und einem zweiten 20 × 20 × 5 obendrauf, 15 mm zur Seite versetzt. Ansichten → „Überhänge (3D-Druck)“.
  Erwartet: Die freie Unterseite des oberen Quaders (15 × 20 = 300 mm²) ist rot, unten steht „300 mm² brauchen Stützen“. Ohne den oberen Quader: „Keine Überhänge“.
- [ ] **Echtes Teil**: Kamerahalter oder Rumpf anschauen – stimmt das Rot mit dem überein, was der Slicer stützen will?

## Drohnen-Bausteine (neu in Sitzung 35)

- [x] **Bausteine in der Leiste**: „Drohne“ → „Lochbilder und Bausteine“ zeigt GoPro-Halterung, XT60-Halter und Antennenhalter.
- [x] **Maße stimmen**: GoPro-Halterung 24 × 20 mm Platte, Finger bis 16,5 mm hoch; XT60-Halter 34,2 × 13,7 × 3 mm; Antennenhalter mit zwei Röhrchen im V.
- [ ] **GoPro-Halterung drucken** (TPU): passt die Kamera mit der Rändelschraube, hält die Mutter?
- [ ] **XT60-Halter drucken**: sitzt der Stecker stramm?

## Kreismuster um gewählte Achse (neu in Sitzung 34)

- [x] **Achse aus einer Kante**
  Schritte: Kleiner Quader auf Y 20 und ein langer flacher Quader auf Höhe 10. Den kleinen wählen → „Muster“ → „Kreismuster“ → „Achse im Bild wählen“ → vordere obere Kante des langen Quaders anklicken.
  Erwartet: Vier Quader drehen sich um diese Kante (oben, hinten, unten); rechts steht „Richtung 1 · 0 · 0 durch …“.
- [ ] **Achse aus einer Welle**: Zylinder schräg legen, ein Loch daneben, Kreismuster um die Zylinderfläche – sitzen die Löcher rundherum?

## Verbundene Kanten (neu in Sitzung 33)

- [x] **Kante wandert mit**
  Schritte: Quader 20 × 20 × 10 und Zylinder Ø 10. Skizze auf XY, „Kante übernehmen“: obere Quaderkante und Zylinderrand, „Fertig“, 3 hoch. Dann den Quader 30 tief und den Zylinder Ø 16 machen.
  Erwartet: Die Linie liegt jetzt auf Y 15, der Kreis hat Ø 16 und der hochgezogene Körper ist 16 breit. Ein Rückgängig nimmt Zylinder und Kreis zusammen zurück.
- [x] **Hinweis und lösen**: Skizze bearbeiten, den Kreis anklicken – „Verbunden mit einer Kante von „Zylinder““, Knopf „Verbindung lösen“.
- [ ] **Deckel wächst mit**: Gehäuse, Deckel-Skizze mit übernommenen Außenkanten, dann das Gehäuse breiter machen – der Deckel wächst mit.

## Kante übernehmen (neu in Sitzung 32)

- [x] **Kante als Linie und Kreis**
  Schritte: Quader 20 × 20 × 10 und daneben ein Zylinder Ø 10. Skizze auf XY, Werkzeug „Kante übernehmen“ (Z), obere Kante des Quaders anklicken, dann den oberen Rand des Zylinders.
  Erwartet: Eine feste Linie (20 lang, auf Y 10) und ein Kreis Ø 10 um die Zylindermitte.
- [ ] **Deckel aufs Gehäuse**: Skizze auf die Oberseite eines Gehäuses, Außenkanten übernehmen, Versatz 1,5 nach innen, hochziehen – passt der Rand?

## Wand aus Linie, Schritt hinter dem Marker (neu in Sitzung 31)

- [x] **Wand aus einem Linienzug**
  Schritte: Skizze, Linienzug 30 nach rechts und 20 nach oben, Esc, Werkzeug „Wand“ (N), Wandstärke 3, auf die Linie klicken, „Fertig“, 5 hoch.
  Erwartet: Eine geschlossene Fläche (3 × 50 = 150 mm²), die Linie wird gestrichelt; Körper 750 mm³.
- [ ] **Wand aus einem Bogen**: Bogen zeichnen, Wand 2 mm, 8 hoch – sieht aus wie ein gebogener Steg (Antennenhalter).
- [x] **Schritt hinter dem Marker**
  Schritte: Zwei Körper, Marker hinter den ersten, den zweiten im Verlauf anklicken.
  Erwartet: Nur eine schmale Leiste „Hinter dem Marker · Marker dahinter“, keine Griffe; der Knopf holt den Schritt zurück.
- [x] **Schildchen am Ursprung**: Punkt im Ursprung mit Maß X 0 und Y 0 – die Schildchen stehen untereinander, nicht übereinander.

## Bohrungen an Skizzenpunkten (neu in Sitzung 30)

- [x] **Zwei Punkte werden zwei Löcher**
  Schritte: Platte 40 × 40 × 3, Doppelklick auf die Oberseite, Werkzeug „Punkt“ (O), zwei Punkte setzen, „Fertig“.
  Erwartet: Der Bohrungs-Assistent heißt „Bohrungen an 2 Punkten“; nach „Löcher setzen“ sitzen zwei M3-Löcher genau an den Punkten.
- [ ] **Stack-Lochbild**: Vier Punkte 30,5 × 30,5 bemaßen, „Fertig“, M3 durch – passt ein echter Flugcontroller?

## Spiegelebene, Kreismuster-Achse, KI (neu in Sitzung 29)

- [x] **Spiegelebene wandert mit**
  Schritte: Quader 20 breit, rechte Seitenfläche anklicken → „An Fläche spiegeln“, dann den Quader auf 30 verbreitern.
  Erwartet: Das Spiegelbild hängt weiter an der rechten Fläche; zusammen 60 breit, ein Körper.
- [x] **Kreismuster quer**
  Schritte: Quader 10 × 4 × 4 auf Höhe 20, „Muster“ → „Kreismuster“, rechts „Drehachse: Quer (X)“.
  Erwartet: 4 Quader rund um die X-Achse (oben, unten, vorne, hinten); statt „Mitte X“ gibt es „Mitte Z“.
- [x] **KI: Muster entlang Kurve**
  Schritte: KI-Kollege: „Fünf Stifte auf einem Halbkreis“.
  Erwartet: Ein „Muster entlang Kurve“ mit 5 Stiften auf dem Bogen.

## Muster entlang Kurve (neu in Sitzung 28)

- [x] **Linie als Kurve**
  Schritte: Quader 10 × 2 wählen → „Muster“ → „Muster entlang Kurve“. Vom Punkt in der Mitte eine 30-mm-Linie nach rechts zeichnen, Esc, „Fertig“.
  Erwartet: Beim Zeichnen 5 Ringe auf der Linie. Danach 5 Quader von 0 bis 30 mm, im Verlauf „5× entlang Kurve“.
- [x] **Abstand**
  Schritte: Rechts „Abstand“ 12.
  Erwartet: Nur noch 3 Quader (0, 12, 24) – der vierte passt nicht mehr auf die Kurve.
- [x] **Kreis, mitdrehen**
  Schritte: „Kurve bearbeiten“, Linie durch einen Kreis ersetzen, der durch das Original geht, „Fertig“, Anzahl 4.
  Erwartet: 4 Quader rundherum; oben und unten stehen sie quer. Mit „Ausrichtung: Wie das Original“ liegen alle gleich.
- [ ] **Löcher entlang eines Bogens**
  Schritte: Platte, ein Loch darin, das Loch wählen → „Muster entlang Kurve“ → Bogen zeichnen → „Fertig“ → Platte und Lochmuster gruppieren.
  Erwartet: Alle Löcher sitzen auf dem Bogen und gehen durch die Platte.

## Schablonen-Maße, USB-C-Stecker (neu in Sitzung 28)

- [x] **Geprüfte Chip-Maße**
  Schritte: Skizze, J, Schablone „Chip QFP / LQFP“.
  Erwartet: Pin-Breite 0,22 mm, darunter ein Hinweis mit Norm und Toleranzbereich.
- [x] **USB-C-Stecker-Ausschnitt**
  Schritte: Schablone „Ausschnitt USB-C-Stecker“, in die Mitte klicken.
  Erwartet: Ein Rechteck 13 × 7 mm mit vier runden Ecken (4 Linien, 4 Bögen), eine geschlossene Fläche.
- [ ] **Passt der Stecker?** Wand mit beiden USB-C-Ausschnitten drucken, Kabel mit dickem und mit dünnem Stecker einstecken.

## Spiegeln an der Achse (neu in Sitzung 27)

- [x] **Skizze an der Y-Achse spiegeln**
  Schritte: Kreis bei X 10, Werkzeug „Spiegeln“, „An der Y-Achse“, Enter.
  Erwartet: Eine feste Hilfslinie auf der Y-Achse und der gespiegelte Kreis bei X −10.

## Kantenkette, Abstände beim Verschieben (neu in Sitzung 26)

- [x] **Kantenkette**
  Schritte: Quader mit gerundeten senkrechten Kanten; eine obere gerade Kante anklicken → „Kette“ → „Abrunden“.
  Erwartet: Alle 8 Kanten des oberen Umrisses sind gewählt und werden zusammen gerundet.
- [x] **Abstand beim Verschieben**
  Schritte: Zwei Quader, einen neben den anderen ziehen.
  Erwartet: Das Schildchen zeigt neben X/Y auch „Abstand ↔ … ↕ …“ zum nächsten Nachbarn.

## Schnitt an Fläche (neu in Sitzung 25)

- [x] **Schnitt parallel zu einer Fläche**
  Schritte: Seitenfläche eines gedrehten Quaders anklicken → „Schnitt hier“; Abstand −15.
  Erwartet: Schnitt-Leiste mit „An Fläche“; der Körper ist parallel zur Fläche aufgeschnitten, Schnittfläche schraffiert; × beendet.

- [x] **An einer Fläche spiegeln**
  Schritte: Quader 20 × 10 × 5, rechte Seitenfläche anklicken → „An Fläche spiegeln“.
  Erwartet: Ein Körper von −10 bis 30 mm, doppeltes Volumen, keine Fehler. (Die Spiegelebene bleibt dort, wo die Fläche beim Spiegeln war.)

## Punkt und alle Ecken (neu in Sitzung 24)

- [x] **Punkt**
  Schritte: Werkzeug „Punkt“ (O), ins Bild klicken; mit „Auswahl“ anklicken und rechts X = 12 eintippen; Kreis auf den Punkt setzen.
  Erwartet: Kreuz an der Stelle; wandert auf X 12; der Kreis rastet genau am Punkt ein.
- [x] **Alle Ecken auf einmal**
  Schritte: Rechteck, Werkzeug „Ecke runden“, Radius 3, „Alle Ecken auf einmal“; dann Rückgängig.
  Erwartet: Vier Rundungen; ein Rückgängig bringt das Rechteck zurück.

- [x] **KI-Kollege mit neuen Formen**
  Schritte: Den KI-Kollegen um eine Nase (Übergang mit Spitze), einen Kabelbügel (Pfad) und ein Schild mit Schrift bitten.
  Erwartet: Drei Teile ohne Fehler; die Nase läuft zu einer Spitze zusammen, die Schrift ist ins Schild graviert.

## Einheiten und eigener Querschnitt (neu in Sitzung 23)

- [x] **Einheiten im Maßfeld**
  Schritte: Quader wählen, Breite „2 cm“, dann „1/4\"“, dann „10mm+2cm“ eintippen.
  Erwartet: 20 mm, 6,35 mm, 30 mm – als Zahl gespeichert, nicht als Formel.
- [x] **Entlang Pfad mit eigener Form**
  Schritte: Einen Umriss (z. B. Rechteck 8 × 4) hochziehen, einen offenen Pfad zeichnen; beim Pfad-Körper „Querschnitt: Eigene Form aus einem Skizzenkörper“.
  Erwartet: Der Umriss läuft am Pfad entlang, der Skizzenkörper wird ausgeblendet.

- [x] **Linie teilen**
  Schritte: Werkzeug „Teilen“ (Y), auf die Mitte einer Linie klicken.
  Erwartet: Zwei Linien, verbunden und in einer Flucht.
- [x] **Gebogenes Langloch**
  Schritte: Langloch, rechts „Gebogen“; Mitte, Anfang, Ende, Breite klicken; hochziehen.
  Erwartet: Ein Bogen-Langloch aus vier tangentialen Bögen, eine Fläche, Körper ohne Fehler.
- [x] **Gedrehtes Rechteck, Sechskant über die Flächen**
  Schritte: Rechteck „Gedreht“: zwei Punkte für die Kante, dann die Höhe. Vieleck „Über die Flächen“, 5,5 eintippen.
  Erwartet: Schräges Rechteck mit rechten Winkeln; Sechskant mit 5,5 mm Schlüsselweite.

## Kleine Werkzeuge, Schräge, Gewinde (neu in Sitzung 22)

- [x] **Kreis- und Bogen-Arten**
  Schritte: Kreis-Werkzeug, rechts „Drei Punkte“, drei Punkte klicken; „Zwei Punkte“; Bogen-Werkzeug „Tangential“, auf ein Linienende klicken, dann den Endpunkt.
  Erwartet: Kreis genau durch die Punkte; Kreis mit den zwei Punkten als Durchmesser; Bogen schließt ohne Knick an (Regeln tangential und deckungsgleich).
- [x] **Verlängern**
  Schritte: Werkzeug „Verlängern“ (U), nahe an das Ende einer Linie fahren und klicken.
  Erwartet: Gestrichelte Vorschau bis zur nächsten Linie; danach endet die Linie genau dort und hängt per Regel daran.
- [x] **Entformungsschräge**
  Schritte: Quader wählen, unter „Kanten“ auf „Schräge“; Winkel auf −2 ändern.
  Erwartet: Seitenwände 3° nach innen geneigt (oben kleiner); mit −2° nach außen.
- [x] **Gewinde**
  Schritte: Bauteile → „Gewindebolzen“ M6; „Gewindeloch (gedruckt)“ auf eine Platte setzen.
  Erwartet: Bolzen mit sichtbarem Gewindegang; in der Platte ein Innengewinde, keine Fehler.
- [ ] **Passt das gedruckte Gewinde?**
  Schritte: Platte mit M8-Gewindeloch und M8-Bolzen drucken.
  Erwartet: Lässt sich verschrauben; sonst „Spiel“ anpassen und den Wert notieren.

## Skizzieren im 3D, Übergang, Entlang Pfad (neu in Sitzung 21)

- [x] **Ebene verschieben und neigen**
  Schritte: 1. „Skizze“ → Abstand 15 → „Auf der Arbeitsfläche“. 2. Rechteck, rechts „Ebene verschieben / neigen“ → Neigung 30°. 3. Fertig, 2 mm hoch.
  Erwartet: Die Skizze liegt 15 mm über dem Boden; nach dem Neigen schaut man schräg auf die Ebene; die Platte steht 30° geneigt.
- [x] **Doppelklick auf eine Fläche**
  Schritte: Quader, Doppelklick auf seine Oberseite.
  Erwartet: Die Skizze startet direkt auf der Fläche, ihre Kanten sind gestrichelt als Bezug da.
- [x] **Übergang (Loft)**
  Schritte: 1. Rechteck 30 × 20 auf der Arbeitsfläche hochziehen, Kreis Ø 16 auf einer 30 mm verschobenen Ebene hochziehen. 2. Beide nacheinander wählen → „Übergang“. 3. „Spitze verlängern“ 15. 4. Einen einzelnen Skizzenkörper wählen → „Zur Spitze“.
  Erwartet: Ein weicher Körper vom Rechteck zum Kreis; mit Spitze 45 mm hoch; „Zur Spitze“ macht aus einem Rechteck 30 × 20 eine 10 mm hohe Pyramide.
- [x] **Entlang Pfad (Sweep)**
  Schritte: 1. In einer Skizze einen offenen Pfad aus zwei Linien und einer Spline zeichnen, „Fertig“. 2. Rechts Wand 1. 3. Querschnitt „Rechteckig“. 4. „Pfad bearbeiten“, wieder „Fertig“.
  Erwartet: Ein Rohr Ø 6 läuft am Pfad entlang, Ecken rund; mit Wand hohl; rechteckig als Kanal; der Pfad lässt sich wieder bearbeiten.
- [x] **Abstand zwischen zwei Teilen**
  Schritte: Zwei Quader wählen → „Abstand“ → Richtung X, Lücke 5.
  Erwartet: Im Feld steht vorher die echte Lücke (20 mm); danach liegt der zweite Quader genau 5 mm neben dem ersten.
- [x] **STEP und STL importieren**
  Schritte: Eine .step-Datei (z. B. einen Motor vom Hersteller) ins Fenster ziehen; rechts die Einheit umstellen; eine .stl-Datei ebenso.
  Erwartet: Das Teil erscheint mit richtiger Größe, ohne Fehler; Einheit Zoll macht es 25,4-mal größer; STL wird ein Körper.
- [x] **Skizzen-Schablonen**
  Schritte: In der Skizze „Schablone“ (J), QFP 48 Pins, auf den Nullpunkt klicken; Rückgängig; Pin-Raster 4 × 2 setzen.
  Erwartet: Gehäuse mit 48 Pins mittig am Nullpunkt (49 Flächen); Rückgängig nimmt alles auf einmal weg; 8 Löcher im 2,54-mm-Raster.
- [ ] **Speed-Nase mit Übergang**
  Schritte: Mehrere Umrisse (Rechteck, Ellipse, kleiner Kreis) hintereinander, Übergang, Spitze verlängern, Kanten runden.
  Erwartet: Eine glatte Nase; notieren, was beim Bauen umständlich war.

## Magnet und Rundungs-Griff (neu in Sitzung 20)

- [x] **Magnet auf der Fläche**
  Schritte: 1. Quader 40 × 20 × 4, von oben. 2. Fläche anklicken, Bohrung M3. 3. Mit der Maus nahe an die Mitte, an die Mittellinie und spiegelbildlich zu einem Loch fahren und klicken.
  Erwartet: Rosa gestrichelte Hilfslinien und ein Schildchen („Mitte der Fläche“, „Mittellinie“, „gleicher Randabstand“); das Loch sitzt genau dort. Mit Strg kein Einrasten.
- [x] **Magnet zwischen Körpern**
  Schritte: Zwei Quader, einen am anderen vorbeiziehen.
  Erwartet: Kanten und Mitten rasten bündig ein (Hilfslinie, Schildchen „bündig“ oder „mittig“); mit Strg oder in den Einstellungen abgeschaltet nicht.
- [x] **Rundung mit Ziehgriff**
  Schritte: Kante anklicken, am rosa Pfeil nach innen ziehen (oder während des Ziehens eine Zahl tippen), loslassen. Dann zweimal Rückgängig.
  Erwartet: Die Kante rundet sich beim Ziehen sichtbar mit, Schildchen „R … mm“; rechts unter „Kanten“ steht die Rundung mit dem Radius; Rückgängig nimmt sie wieder weg.
- [ ] **Fühlt sich das Einrasten gut an?**
  Schritte: Kamerahalter mit M2-Löchern bauen und Löcher setzen; Teile aneinander ausrichten.
  Erwartet: Rastet dort ein, wo man es erwartet, und stört nicht beim freien Platzieren. Notieren, was fehlt.

## Skizze auf Profi-Niveau (neu in Sitzung 19)

- [x] **Ecke runden**
  Schritte: 1. Skizze auf XY, Rechteck 40 × 20. 2. Werkzeug „Ecke runden“ (K), Radius 5, mit der Maus über eine Ecke fahren, klicken. 3. Radius 30 an einer anderen Ecke. 4. Art „Fase“, 5 mm, dritte Ecke. 5. Fertig, 3 mm hoch.
  Erwartet: Beim Überfahren orange Vorschau; Bogen tangential mit Maß R 5; bei 30 der Hinweis „höchstens … mm“; Fase als schräge Linie; Körper mit Rundung und Fase, Volumen stimmt.
- [x] **Ellipse**
  Schritte: 1. Werkzeug „Ellipse“ (E), Mitte klicken, 30 Tab 10 Enter. 2. Zweite Ellipse mit der Maus: Mitte, schräges Achsenende, Breite. 3. Erste Ellipse anklicken, Breite 40. 4. Hochziehen.
  Erwartet: 30 × 10 mit festen Maßen; die zweite ist gedreht; Breite folgt; Körper glatt (echte Ellipse, keine Ecken).
- [x] **Rechteck aus der Mitte**
  Schritte: 1. Rechteck-Werkzeug, rechts „Von der Mitte aus“. 2. Auf den Nullpunkt klicken, 20 Tab 10 Enter. 3. Breite auf 30.
  Erwartet: Rechteck mittig um den Nullpunkt, voll bestimmt; nach dem Ändern immer noch mittig.
- [x] **Regeln Konzentrisch und Mittig**
  Schritte: 1. Zwei Kreise, Regel „Konzentrisch“, beide anklicken. 2. Eine Linie, Regel „Mittig“, Kreis und Linie anklicken.
  Erwartet: Beide Kreise haben dieselbe Mitte; die Mitte sitzt auf der Linienmitte.
- [x] **Text**
  Schritte: 1. Werkzeug „Text“ (B), Text „FPV 5“, Höhe 8, ins Bild klicken. 2. Höhe auf 6, Text auf „FPV 7“. 3. Rechteck um den Text, hochziehen.
  Erwartet: Großbuchstaben 8 mm hoch; Höhe wird ein festes Maß; der Text ist im Rechteck ausgeschnitten (Gravur), Löcher in a, e, 9 usw. stimmen.
- [x] **Spline als genaue Kurve**
  Schritte: Geschlossene Spline mit 4 Punkten hochziehen.
  Erwartet: Der Körper hat nur 6 Flächen (4 glatte Seiten, oben, unten) statt vieler kleiner Streifen.
- [x] **Bild als Vorlage**
  Schritte: 1. Werkzeug „Bild-Vorlage“ (I), Bild laden. 2. „Maßstab festlegen“, zwei Punkte anklicken, echten Abstand eintippen. 3. Bild ziehen. 4. Etwas zeichnen, hochziehen, Skizze wieder bearbeiten.
  Erwartet: Das Bild bekommt die richtige Größe; es lässt sich verschieben; beim erneuten Bearbeiten ist es wieder da, im Körper und Export nicht.
- [x] **Skizzenleiste bricht um**
  Schritte: Fenster schmal (1000 px), Skizze starten.
  Erwartet: Alle Werkzeuge sind sichtbar (Leiste in mehreren Reihen), die Regel-Leiste liegt darunter.
- [ ] **Fühlt sich das Zeichnen jetzt profimäßig an?**
  Schritte: Eine Platine nachzeichnen: Foto laden, Maßstab setzen, Umriss mit Ecken-Rundungen, Löcher konzentrisch, Beschriftung als Text.
  Erwartet: Geht ohne Umwege; was fehlt oder hakt, bitte notieren.

## Neue Rahmen und Bausätze (neu in Sitzung 18)

- [x] **Neue Bausätze**
  Schritte: 1. Startseite → „5" Race“, dann „5" Speed“, dann „3,5" Cinewhoop“. 2. Jeweils „Drohne“ → „Drohnen-Check“.
  Erwartet: Race mit Armen 35° zur Flugrichtung; Speed mit rotem Stromlinien-Rumpf, Kamera in der Nase, Stack und Akku innen, Motoren schräg auf Keilen, ohne Oberplatte; Cinewhoop mit vier grauen Ducts; alle Prüfungen grün, keine Fehler.
- [x] **Motorneigung**
  Schritte: 1. Frame-Assistent → Rahmenform „Speed-Rumpf“. 2. Motorneigung 30°, „Rahmen bauen“. 3. Drohnen-Check. 4. Unter „Maße“ Motorneigung auf 0.
  Erwartet: Feld „Motorneigung“ nur beim Speed-Rumpf; Keile und Propeller 30° schräg, Check grün mit „Stromlinie … 30°“; bei 0° flache 1-mm-Keile, Propeller waagerecht, Check weiter grün.
- [x] **Zu viel Neigung**
  Schritte: 1. Frame-Assistent, 7", Speed-Rumpf, Motorneigung 35°.
  Erwartet: Warnung „streifen die hinteren Propeller ihre Arme – höchstens 28° passen“; gebaut zeigt der Drohnen-Check die hinteren Propeller rot.
- [x] **Ducts wachsen mit**
  Schritte: 1. 3,5" Cinewhoop. 2. Unter „Maße“ Bolzenhöhe auf 30.
  Erwartet: Die Ducts werden höher und enden 1 mm unter der Oberplatte; nichts steckt ineinander.
- [x] **Rahmen von Herstellern**
  Schritte: 1. Frame-Assistent → „Vorlage“: TBS Source One V5. 2. „Rahmen bauen“. 3. Drohnen-Check.
  Erwartet: 13 Vorlagen; Achsabstand 226 mm (Hersteller), Hinweis „Nachbau nach Herstellermaßen“ mit 123,5 g und Quelle; Arme 6 mm, Oberplatte 2 mm, Bolzen 30 mm; im Check die Zeile „Rahmen gegen Original“. Bei „iFlight Chimera7 Pro V2 O4“ steht 7,5 Zoll in der Auswahl, die Propeller überlappen nicht.
- [x] **Cinelog35 mit Hinweis**
  Schritte: 1. Frame-Assistent → „Vorlage“: GEPRC Cinelog35 V2. 2. Danach die Rahmenform auf True-X stellen.
  Erwartet: Gelber Hinweis: Hersteller 142 mm, Tracery braucht mehr; nach dem Umstellen steht die Vorlage wieder auf „Eigener Rahmen“.
- [ ] **Sieht der Speed-Rumpf gut aus?**
  Schritte: 1. 5" Speed von allen Seiten ansehen, auch mit „Röntgen“ und Schnitt.
  Erwartet: Glatter, hohler Rumpf mit Wand, nur über der Mittelplatte unten offen, Kamera schaut vorne aus der Nase, Heck hinten offen; Rumpf als STEP druckbar (in zwei Hälften teilen).

## KI-Kollege (neu in Sitzung 17)

Die KI-Punkte gehen nur, wenn Tracery in Claude geöffnet ist. Der automatische Test spielt die KI mit vorbereiteten Antworten nach.

- [x] **Alles als Verbund**
  Schritte: 1. 5"-Vorlage. 2. Unten eintippen: „Mach alles als Verbund“.
  Erwartet: Plan mit Haken, „Runde 2“ während der Arbeit; danach ist der Rahmen ein Körper, Motoren, Akku, Kamera, Stack, Sender und Propeller bleiben einzeln; Hinweis dazu; Drohnen-Check grün; „2 Runden“.
- [x] **Ein Rückgängig für alles**
  Schritte: 1. Nach dem Verbund im KI-Fenster „Rückgängig“.
  Erwartet: Alle 10 Teile wieder einzeln – ein einziger Schritt.
- [x] **Fehler selbst beheben**
  Schritte: 1. „Bau einen Klotz 20 × 20 × 10 mit runden Kanten“ (die KI nimmt zuerst einen zu großen Radius).
  Erwartet: Die zweite Runde sieht „FEHLER im Modell“ und verkleinert den Radius; am Ende keine Fehler.
- [x] **Selbstständig aus**
  Schritte: 1. Oben im Fenster „Selbstständig“ abhaken. 2. Wieder einen Auftrag mit Fehler.
  Erwartet: Nur eine Runde, kein Nachbessern.
- [x] **Rückfrage**
  Schritte: 1. Zwei Quader. 2. „Mach die Teile schöner“. 3. Einen Antwort-Knopf drücken.
  Erwartet: Frage mit Knöpfen, am Modell ändert sich erst etwas nach der Antwort; die KI weiß, dass es die Antwort auf ihre Frage ist.
- [x] **Viele Teile auf einmal**
  Schritte: 1. Drei Quader nebeneinander. 2. „Richte alles links aus, färbe es rot und leg eine gedrehte Kopie daneben“.
  Erwartet: Links bündig, alles rot, drei gedrehte Kopien, die am Ende ausgewählt sind; ein Rückgängig-Schritt.
- [x] **Verbund ohne KI**
  Schritte: 1. Tracery im Browser (nicht in Claude), 5"-Vorlage. 2. Unten „verbund“ tippen bzw. „Mach alles als Verbund“ + Enter.
  Erwartet: Befehl „Alles zu einem Körper verbinden (Verbund)“; danach ein Verbund aus 4 Rahmenteilen, Meldung „Verbunden: 4 Teile …“.
- [x] **Fehlermeldung bleibt**
  Schritte: 1. Quader mit zu großer Rundung. 2. Einen anderen Körper einfügen und verschieben.
  Erwartet: Die Meldung „Die Rundung ist zu groß“ bleibt stehen.
- [ ] **Echter KI-Kollege in Claude**
  Schritte: 1. Tracery in Claude öffnen, 5"-Vorlage. 2. „Mach alles als Verbund“, „Mach die Arme 6 mm dick und prüf die Drohne“, „Richte alle Kaufteile mittig aus“.
  Erwartet: Sinnvoller Plan, Runden laufen durch, Ergebnis stimmt; nichts Erfundenes.

## Kaufteile in echter Form (neu in Sitzung 16)

- [x] **Rahmen mit echten Teilen**
  Schritte: 1. Startseite → „5" Freestyle“.
  Erwartet: Motoren mit Glocke und Welle, Propeller mit drei Blättern und Ring, Stack aus zwei Platinen, Kamera mit Objektiv nach vorne, Akku mit runden Kanten; keine Fehler; Akku 38 × 75 × 39 mm.
- [x] **Kaufteil aus dem Klappfenster**
  Schritte: 1. Leeres Projekt → „Drohne“ → „Motoren“ → „Motor 2207“. 2. Rechts das ?-Symbol.
  Erwartet: Motor in echter Form mit 33,8 g; rechts „Glocke Ø“, „Höhe“, „Lochkreis“, „Schrauben“; die Erklärung nennt „Kaufteil mit festem Gewicht“.
- [ ] **Sehen die Teile echt aus?**
  Schritte: 1. Nah an Motor, Kamera, Stack und Propeller heranzoomen, auch mit „Röntgen“.
  Erwartet: Erkennbar wie die echten Teile; Propeller drehen vorne links und hinten rechts andersherum.

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
