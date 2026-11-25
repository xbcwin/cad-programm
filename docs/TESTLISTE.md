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

## Drohnen-Bereich unsichtbar (Auto [A-001])

- [x] **Startseite**: kein Abschnitt „Drohnen“ und kein Frame-Assistent, Untertitel „CAD im Browser – kostenlos, ohne Konto“, allgemeine Vorlagen („Box mit Deckel“, „Schild mit Loch“ …) bleiben da.
- [x] **Menüs, Werkzeugleiste und Bibliothek**: kein Knopf „Drohne“ oben, kein „Fahrtwind“ im Ansicht-Menü, keine Drohnen-Teile in „Bauteile“ (Motorverkleidung, Armverkleidung, Stromlinien-Rumpf, GoPro, XT60, Antennenhalter, Lochbild); allgemeine Bauteile (Schraubenloch, Normteile, Gewinde, Zahnrad, Scharnier, Schnapphaken …) bleiben da.
- [x] **Befehlssuche & Über-Dialog**: Suche nach „drohne“, „frame“, „propeller“, „fahrtwind“ … findet nichts; im Dialog „Über Tracery“ steht keine Drohnen-Sprache.
- [x] **Alte Projekte**: Projektdatei mit einem `buyMotor`-Teil öffnet und rechnet ohne Fehler, ohne Drohnen-Panel rechts.
- [ ] **Von Hand**: Ein echtes altes Drohnen-Projekt aus der Datei öffnen, ansehen, ein Maß ändern und prüfen, ob alles sauber rechnet und nirgends störende Drohnen-Texte auftauchen.

## KI-Kollege allgemein (Auto [A-002])

- [x] **Systemtext ohne Drohne/FPV**: `AI.RULES` und `AI.ACTIONS` enthalten keine Drohnen-/FPV-Begriffe und bieten weder `drohne` noch `pruefen` oder Drohnen-Bausteine an; allgemeine CAD-Beispiele und Normteile (`stdScrew`, `stdNut`, `stdWasher`) sind enthalten.
- [x] **Vorschläge**: `AI.SUGGESTIONS` und das Intro-Panel (`AI.open()`) zeigen allgemeine CAD-Vorschläge (Gehäuse, Halterung, Schild, Zahnrad, Schwachstellen) ohne Drohnen-Bezug.
- [x] **Auftrag „Baue ein Gehäuse 60×40×30 mit Deckel“**: Wird über `window.__aiQueue` fehlerfrei mit benannten Maßen (`Breite`, `Tiefe`, `Hoehe`, `Wand`), hohlem Gehäuse (60 × 40 × 30 mm) und passendem Deckel umgesetzt; der gesendete Prompt ist frei von Drohnen-/FPV-Texten und Rückgängig nimmt alles auf einmal zurück.
- [x] **Abwärtskompatibilität**: Die Aktion `drohne` bleibt technisch erhalten und baut bestehende Drohnen-Aufträge weiter ohne Fehler.
- [ ] **Von Hand**: In Claude einen echten freien CAD-Auftrag (z. B. „Baue ein Gehäuse 60×40×30 mit Deckel“ oder „Bau eine Wandhalterung für ein Kabel mit zwei M4-Löchern“) eintippen und prüfen, ob Antwort und Ergebnis stimmig und frei von Drohnen-Sprache sind.

## Skizzen-Prüfer (Auto [A-003])

- [x] **Lücke und doppelte Linie erkennen**: Skizze 30 × 20 mm aus vier Linien mit 0,01-mm-Lücke am Ursprung und einer doppelten Linie → „Skizze prüfen“ meldet beides in der Ergebnisliste und bietet „Alles reparieren“ an.
- [x] **Stelle hervorheben**: Klick auf einen Treffer in der Ergebnisliste markiert die Zeile aktiv und hebt Lücke bzw. doppelte Linie im Bild mit Ring und Schildchen hervor.
- [x] **Alles reparieren**: Schließt die 0,01-mm-Lücke mit der Regel „Deckungsgleich“ und löscht die doppelte Linie → geschlossene Fläche (600 mm²), keine Doppelung, Prüfer meldet „Alles in Ordnung“.
- [x] **Rückgängig und 3D-Körper**: Ein Rückgängig holt Lücke und doppelte Linie komplett zurück; erneutes Reparieren und „Fertig“ erzeugt fehlerfrei den 3D-Körper (1800 mm³).
- [x] **Offene Enden**: Eine offene Linie meldet zwei „Offenes Ende“-Einträge (ohne „Alles reparieren“) und hebt das angeklickte Ende im Bild hervor.
- [ ] **Von Hand**: Bei einer größeren importierten DXF/SVG mit mehreren kleinen Lücken und überlappenden Linien „Skizze prüfen“ klicken, die Treffer der Reihe nach anklicken (prüfen, ob Ringe und Schildchen gut lesbar sind) und „Alles reparieren“ testen.

## Rahmen-Auswahl in der Skizze (Auto [A-004])

- [x] **Fenster-Rahmen (links → rechts)**: Im Auswahl-Werkzeug im Leeren von links nach rechts ziehen wählt nur Elemente, die komplett im Rahmen liegen (durchgezogener Rahmen, Mehrfach-Anzeige rechts).
- [x] **Kreuz-Rahmen (rechts → links) mit Umschalt**: Von rechts nach links (gestrichelter grüner Rahmen) wählt alles, was berührt wird; mit gedrückter Umschalt-Taste wird die Auswahl erweitert.
- [x] **Weiterbearbeiten mit H („Verschieben“)**: Taste H übernimmt die gewählten Elemente direkt in `S.patSel` und verschiebt sie gemeinsam.
- [x] **Löschen mit Entf und Rückgängig**: Entf löscht alle gewählten Elemente auf einmal; ein Rückgängig (Strg/Cmd+Z) holt alle zusammen zurück.
- [ ] **Von Hand**: In einer gemischten Skizze mit Linien, Kreisen, Bögen und Splines beide Rahmen-Richtungen, Umschalt + Klick und das Umschalten zu Verschieben (H) und Hilfslinie (X) testen und prüfen, ob der Rahmen flüssig folgt und die Hervorhebung gut erkennbar ist.

## Linie und Bogen im Wechsel (Auto [A-005])

- [x] **Hinweistext unten**: Im Linien-Werkzeug erklärt die Hinweiszeile, dass Taste A zwischen Linie und tangentialem Bogen wechselt; im Bogen-Modus wechselt der Hinweis auf „Tangentialer Bogen … A schaltet zurück auf Linie“.
- [x] **Wechsel Linie → A → Bogen → A → Linie**: Erzeugt `line`, `arc`, `line` mit korrektem Radius/Mittelpunkt, tangentialen Übergängen (`tangent` an beiden Übergängen) und deckungsgleichen Enden (`coincident`), Löser ohne Konflikt.
- [x] **Geschlossene Bahn**: Linie → A → 180°-Bogen → A → Linie → A → 180°-Bogen zurück zum Startpunkt schließt sauber zu einer Fläche mit richtiger Flächengröße.
- [x] **Taste A ohne aktiven Linienzug**: Schaltet weiterhin normal auf das Bogen-Werkzeug um.
- [ ] **Von Hand**: Freie geschwungene Umrisse (S-Kurven aus zwei Bögen hintereinander, geschlossene Langloch-Umrisse, Wechsel mit Zahleneingabe) zeichnen und prüfen, ob Vorschau, Tangenten-Fang am Bogenende und die Hinweiszeile angenehm wirken.

## Volltest-Reparatur (Auto [F-11232113])

- [x] **Kontextleiste sofort aktuell**: Beim Wechsel der Auswahl von zwei Gruppenteilen auf Gruppe + Kind verschwindet der Gelenk-Knopf sofort und es startet keine unnötige Abstandsmessung gegen sich selbst.
- [x] **Skizzen-Auswahl synchron**: `S.sel` und `S.sels` bleiben beim einzelnen und mehrfachen Setzen und Leeren konsistent.
- [x] **Vorige Ansicht ohne Nachdrehen**: `Umschalt Z` nach schnellem Maus-Drehen bleibt stabil auf dem vorherigen Blick, ohne durch OrbitControls-Restdämpfung abzudriften.
- [x] **Maus-Koordinaten am Zielpunkt**: Schnelle Mausbewegungen über dem Modell zeigen am Ende exakt die Koordinaten unter dem Mauszeiger.
- [ ] **Von Hand**: Bei schnellem Drehen mit sofortigem `Umschalt Z` und beim schnellen Überfahren kleiner Flächen prüfen, ob Ansichtssprung und Koordinatenanzeige ruhig wirken.

## Versatz mehrfach und beidseitig (Auto [A-006])

- [x] **Anzahl mehrfach**: Rechteck 20 × 10 mm mit Anzahl 3 und Abstand 2 mm nach außen → drei neue Rechtecke (24 × 14, 28 × 18, 32 × 22 mm) mit passenden Versatz-Regeln, Rückgängig nimmt alle zusammen zurück.
- [x] **Beidseitig**: Rechteck mit „Beidseitig“ → je ein Umriss außen und innen (bzw. bei Anzahl 2 zwei außen und zwei innen).
- [x] **Ecken rund**: Rechteck mit „Ecken: Rund“ und 2 mm Abstand → vier gerade Seiten und vier Ecken-Bögen (R = 2 mm), geschlossene Fläche, wächst beim Ändern des Originals mit.
- [x] **Kette mit runden Ecken & Rückgängig**: L-Kette mit „Beidseitig“ und „Ecken: Rund“ → äußere Ecke gerundet (Bogen R = 4 mm), innere Ecke spitz; ein Rückgängig räumt alles auf.
- [ ] **Von Hand**: Bei Vieleck, gemischten Ketten (Linie + Bogen) und gedrücktem Rückgängig prüfen, ob Vorschau-Schildchen, Eckenbögen und Hinweistexte klar wirken.

## Schräge- und Hinterschnitt-Analyse (Auto [A-105])

- [x] **Quader mit 3° Schräge, Grenze 1°**: Über Prüfen → „Schräge & Hinterschnitte“ zeigen alle vier Seitenflächen grün (`ok`, Schrägewinkel ~3°) ohne Warnung oder Hinterschnitt.
- [x] **Grenzwinkel einstellbar**: Grenze von 1° auf 5° stellen färbt die 3°-Seitenflächen gelb (`warn`); zurück auf 1° wieder grün.
- [x] **Quader mit seitlicher Nut → Hinterschnitt rot**: Nut-Decke, Nut-Boden und Nut-Rückwand werden rot als Hinterschnitt markiert (~720 mm²), senkrechte Außenwände gelb, Ober-/Unterseite grün.
- [x] **Entformungsrichtung & Ein-/Zweiteilige Form**: Wechsel auf `+X` löst den Hinterschnitt der Nut auf; Abschalten von „Zweiteilige Form“ markiert auch die Unterseite als Hinterschnitt.
- [x] **Befehlssuche, Hilfe & Schließen**: `Commands.search('hinterschnitt')` findet die Analyse, `HELP.draftAnalysis` ist vorhanden und Schließen räumt Overlay und Leiste auf.
- [ ] **Von Hand**: Bei einem geschwungenen Gehäuse mit Rippen, Bohrungen und gewählter schräger Bezugsfläche Entformungsrichtung per „Fläche“ anklicken und prüfen, ob Farben, Richtungspfeil und Flächenwerte klar lesbar sind.

## Bohrungs-Arten (Auto [A-008])

- [x] **Sackloch Ø 5 × 10 mit 118°-Bohrspitze**: Volumen des abgezogenen Teils stimmt bis auf < 0,05 mm³ mit Zylinder + 118°-Kegel überein, das Loch bleibt im Körper blind, Querschnitts-Vorschau zeigt `118°` und Gesamttiefe.
- [x] **Passbohrung H7**: Genaues Nennmaß im 3D-Körper (Volumen = exakter Zylinder), Toleranz-Hinweis nach ISO 286 H7 (z. B. `+0,012 / 0 mm` für Ø 6 H7) sowohl in der Vorschau des Assistenten als auch rechts beim Bauteil.
- [x] **Zentrierbohrung (DIN 332 Form A)**: A2,5 mit 60°-Kegel, Führungsbohrung und 118°-Spitze – Querschnitts-Vorschau zeigt `60°` und DIN-332-Maße, Volumen stimmt mit Kegelstumpf + Zylinder + Spitze überein.
- [x] **Hilfetexte**: `holeWizard`, `blindHole`, `fitHole` und `centerHole` sind in `werkzeug-hilfen.json` und `HELP` gepflegt und im Assistenten per `data-help` angebunden.
- [ ] **Von Hand**: Im Bohrungs-Assistenten auf einer Platte und auf einem runden Rohr zwischen allen Bohrungs-Arten wechseln und prüfen, ob Querschnitts-Vorschau, 3D-Drahtvorschau beim Fangen und die Bedienung am Dialog rund wirken.

## 3MF einlesen (Auto [A-011])

- [x] **Export-Roundtrip**: Zwei benannte und gefärbte Teile („Sockel“ rot, „Turm“ blau) über `Print.build3MF` exportieren und als `.3mf` wieder einlesen → gleiche Anzahl Teile, Namen, Farben (`colorSet`) und Hüllmaße (< 0,2 mm).
- [x] **Einheit, Farben & Transform**: Komprimierte (Deflate) 3MF-Datei mit `unit="inch"`, `colorgroup` und verschobenem `build`-Eintrag einlesen → korrekte Umrechnung in Millimeter, Farbe übernommen, Rückgängig räumt sauber auf.
- [x] **Komponenten & Fehler**: 3MF mit `<components>` (inkl. gespiegelter Transform mit negativer Determinante) erzeugt getrennte Teile mit richtiger Lage und Orientierung; beschädigte `.3mf` zeigt eine verständliche Fehlermeldung.
- [x] **Befehlssuche & Hilfe**: `Commands.search('3mf')` findet den Import und `werkzeug-hilfen.json` / `HELP.importCad` dokumentieren `.3mf`.
- [ ] **Von Hand**: Eine echte mehrteilige, bunte `.3mf`-Datei aus PrusaSlicer oder Bambu Studio per Drag & Drop ins Tracery-Fenster ziehen und Namen, Farben, Größe und Ausrichtung prüfen.

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

## Profi-Stufe und eigene Tastenkürzel (Auto [A-021])

- [x] **Erster Start & Stufenwahl**
  Schritte: 1. Mit leerem Browser-Speicher starten. 2. „Profi“ auf der Karte wählen. 3. Auf das Schild „Profi“ oben rechts klicken, dann in den Einstellungen zurück auf „Profi“.
  Erwartet: Zwei Karten „Einfach“ und „Profi“ erscheinen beim ersten Start; das Schild oben zeigt die aktuelle Stufe und wechselt per Klick.
- [x] **Eigene Tastenkürzel (Profi)**
  Schritte: 1. Einstellungen → „Tastenkürzel“. 2. Kürzel für „Orthografisch / Perspektive“ von `O` auf `J` ändern. 3. `O` und dann `J` drücken. 4. Dasselbe Kürzel `J` einem anderen Befehl zuweisen. 5. „Zurücksetzen“ klicken.
  Erwartet: `O` löst nicht mehr aus, `J` sofort; doppeltes Kürzel wird gemeldet und nicht überschrieben; „Zurücksetzen“ stellt `O` wieder her.
- [ ] **Kürzel im Alltag prüfen**
  Bitte von Hand kurz prüfen, ob die zwei Stufen-Karten und die Tastenkürzel-Liste auf schmalem Bildschirm sauber umbrechen.

## Kosmetisches Gewinde (Auto [A-009])

- [x] **Zylinder Ø 6 als M6 × 10 markieren**
  Schritte: 1. Zylinder Ø 6 × 20 anlegen, Mantelfläche wählen, „Gewinde markieren“. 2. Vorgeschlagene Größe M6 und Länge 10 bestätigen.
  Erwartet: Kein neuer Körper, Markierung im Projekt gespeichert, gestreiftes 3D-Overlay sichtbar.
- [x] **Stückliste, Technische Zeichnung & Rückgängig**
  Schritte: 1. Stückliste öffnen und Zeichnung ansehen. 2. Rückgängig und Wiederholen. 3. Projekt speichern/laden.
  Erwartet: Gewinde „M6 × 10“ steht in Stückliste und Zeichnung (mit dünnen Gewindelinien); Rückgängig entfernt Markierung und Overlay; Speichern/Laden erhält sie.
- [x] **Echt machen (Außen- und Innengewinde)**
  Schritte: 1. Im Panel „Echt machen“ klicken (Zylinder außen sowie Kernloch Ø 5 innen).
  Erwartet: Wandelt in echtes 3D-Gewinde (`threadRod` bzw. `threadHole` als Schnitt) ohne Fehler um.
- [ ] **Optik der Gewindestreifen prüfen**
  Bitte von Hand kurz prüfen, ob die schrägen Gewindestreifen bei Außen- (Messing) und Innengewinde (Blau) sowie in der technischen Zeichnung (3/4-Kreis und Linien) gut lesbar sind.

## Hochziehen als dünne Wand (Auto [A-007])

- [x] **Offener L-Linienzug**: Skizze mit offenem L-Linienzug (30 + 20 = 50 mm) beenden → Dialog bietet „Dünne Wand“ und „Entlang Pfad“; mit Wand 2 mm, Höhe 10 mm, mittig entsteht ein Körper mit 1000 mm³ und exakten Maßen.
- [x] **Wand-Lage & Wandstärke**: Rechts im Panel auf „Nach innen“ (960 mm³), „Nach außen“ (1040 mm³) und mittig mit Wand 3 mm (1500 mm³) umschalten sowie Skizze bearbeiten funktioniert ohne Fehler.
- [x] **Geschlossener Umriss als Rohr-Profil**: Rechteck (20 × 20) und Kreis (r = 10) mit „Dünne Wand“ werden zum hohlen Rohr-Profil (innen/außen/mittig), „Dünne Wand“ abschalten + Rückgängig funktionieren; zu große Wandstärke meldet sauber einen Fehler und erholt sich.
- [ ] **Von Hand**: Offenen Bogen oder offene Spline als dünne Wand auf einer Körperfläche (innen/außen/mittig) hochziehen und den Ziehgriff prüfen.

## OBJ und GLB speichern (Auto [A-010])

- [x] Export-Dialog bietet „OBJ (+ MTL)“ und „GLB (glTF)“ mit Hilfetext `exportObjGlb`; ZIP enthält `.obj`, `.mtl`, `.glb` sowie bei „Jeder Körper als eigene Datei“ alle Formate unter `Einzeln/`.
- [x] `.obj` verweist auf die `.mtl`-Datei, enthält `o <Name>` je Körper, Normalen und unterschiedliche `Kd`-Farben in der `.mtl`.
- [x] `.glb` beginnt mit `glTF`, Version 2, hat gültige `JSON`- und `BIN`-Chunks, einen Knoten/Mesh mit Namen je Körper sowie Studio-Look-Materialien (Metall, Rauheit, Klarlack, lineare Farbe).
- [ ] Exportiertes `.obj`/`.mtl` und `.glb` von Hand in Blender oder einer 3D-Vorschau öffnen und Ausrichtung, Größe (mm bzw. m) und Oberflächen-Aussehen prüfen.

## Messungen bleiben stehen (Auto [A-012])

- [x] **Messung behalten**: Abstand zwischen zwei parallelen Flächen messen → Knopf „Messung behalten“ in `#measure-bar` legt die Messung unter „Messungen“ im Verlauf (`#measure-tree`) und als Schild (`.dimlabel.mpin`) im Bild ab.
- [x] **Automatisch neu berechnen**: Quader erhöhen → gespeicherter Abstand aktualisiert sich von `15 mm` auf `30 mm` im Verlauf und im Bild.
- [x] **Ein-/ausblenden, umbenennen, löschen & verloren**: Auge blendet Schild und 3D-Linien aus/ein; Umbennen im rechten Panel wirkt sofort; Löschen eines bezogenen Körpers zeigt „verloren“, Rückgängig stellt den Bezug wieder her; Löschen und Rückgängig sowie Hilfetext `measureKeep` funktionieren.
- [ ] **Von Hand**: Nach Projekt-Speichern und Neuladen (auch mit Punkt–Punkt-, Winkel- und Durchmesser-Messungen) prüfen, ob alle Schilder sauber positioniert bleiben.

## Schnitt mit Kappe und mehreren Ebenen (Auto [A-013])

- [x] **Würfel 20×20×20 mit Durchgangsloch Ø 8**: Schnitt (C) zeigt eine echte, schraffierte Kappe im Overlay (`sectionCap`) mit `240 mm²` Schnittfläche (Loch ausgespart).
- [x] **Mehrere Schnittebenen gleichzeitig**: X und Y sowie alle drei Ebenen (X, Y, Z) lassen sich einzeln an-/ausschalten (`Viewer.clips`); jede Kappe wird gegen die jeweils anderen aktiven Ebenen beschnitten; Z allein zeigt das Kreisloch im Quadrat (`≈ 349,7 mm²`).
- [x] **Kappe ein/aus & Aufräumen**: „Kappe füllen“ (`#cut-cap`) blendet Kappen ein/aus; Schließen räumt alle Clipping-Ebenen und Overlay-Meshes ohne Undo-Schritt auf.
- [ ] **Von Hand**: An einem mehrteiligen Bauteil (z. B. Gehäuse mit Deckel) X- und Y-Schnitt gemeinsam verschieben, umdrehen und die gegenläufige Schraffur der Körper prüfen.

## Speicher für große Projekte (Auto [A-016])

- [x] **15+ MB Import binär sichern & neu laden**: Eine über 15 MB große STEP-Datei wird über `Store.putBlob` binär (`Uint8Array`) in IndexedDB (`tracery-db` → `blobs`) gespeichert (`p.blobId`, kein Base64 im Dokument, kein `localStorage`-Eintrag) und nach dem Neuladen der Seite vollständig mit exakter Geometrie wiederhergestellt.
- [x] **Versionen in IndexedDB**: Versionen samt Referenzen auf binäre Importe werden im `versions`-Store der IndexedDB abgelegt, überstehen ein Neuladen und lassen sich wieder zurückholen.
- [x] **Migration aus `localStorage` & Aufräumen**: Vorhandene Projekte, Base64-Importe und Versionen aus `localStorage` werden beim ersten Start automatisch in IndexedDB übernommen und aus `localStorage` bereinigt; das Löschen eines Projekts entfernt auch nicht mehr genutzte Blobs.
- [ ] **Von Hand**: Ein großes Projekt (> 15 MB STEP/STL) als `.tracery.json` speichern, das Projekt aus dem Browser löschen und die gespeicherte Datei wieder hineinziehen.

## Projekt in einen Ordner speichern (Auto [A-015])

- [x] **Ohne API ausgeblendet**: Fehlt `window.showDirectoryPicker`, erscheinen weder „In Ordner speichern …“ im Projektmenü noch der Befehl in der Suche noch das Status-Schild oben.
- [x] **Ordner wählen & Anzeige**: Über den `showDirectoryPicker`-Stub wird `<Projektname>.tracery.json` mit gültigem Projektinhalt geschrieben; oben erscheint `#btn-folder-status` mit „gespeichert in …“.
- [x] **Gebündelt alle 10 s mitschreiben**: Mehrere Änderungen kurz hintereinander bleiben zunächst als „speichert gleich …“ vorgemerkt und werden nach 10 s gebündelt in einem Schreibvorgang geschrieben.
- [x] **Trennen & Projektwechsel**: Über das Menü an `#btn-folder-status` („Ordner-Verbindung trennen“) sowie beim Start eines neuen Projekts wird die Verbindung sauber beendet.
- [ ] **Von Hand**: In Chrome oder Edge einen echten Ordner wählen, Änderungen machen, 10 s warten und prüfen, ob die `.tracery.json`-Datei auf der Festplatte aktuell ist.

## Körper verschieben/drehen/kopieren als Schritt (Auto [A-018])

- [x] **Schritt anlegen & Werte ändern**: „Verschieben/Drehen“ legt `transform`-Schritt an, ohne `t` des Originals zu verändern; X/Y/Z-Werte und Drehung (um Mitte) versetzen den Körper exakt.
- [x] **Unterdrücken & Zeitleisten-Marker**: Unterdrücken im Verlauf sowie Zurückrollen des Markers vor den Schritt setzen den Körper wieder exakt an seinen alten Platz; Wiederaktivieren versetzt ihn erneut.
- [x] **Als Kopie, Formeln & Rückgängig**: „Als Kopie“ behält das Original und erzeugt einen mitwachsenden versetzten Körper; Formeln wie `Hub * 2` und Rückgängig funktionieren; Hilfetext `moveStep` vorhanden.
- [ ] **Von Hand**: Drehpunkt „Ursprung“ und „Eigener Punkt“ zusammen mit einem späteren Vereinigen-Schritt und anschließendem Umbenennen/Verschieben im Verlauf prüfen.

## Ebene im Winkel und Achsen (Auto [A-017])

- [x] **Ebene 30° an einer Quaderkante (BZ-02)**: Ebene liegt auf der gewählten Kante, bildet exakt 30° zur Bezugsfläche, wandert beim Ändern der Quaderhöhe mit, lässt sich rechts auf 60° ändern und direkt als Skizzenebene hochziehen.
- [x] **Achse durch Mitte eines Zylinders → Kreismuster (BZ-06)**: `Datums.addAxisFromFace` erzeugt die Zylinderachse im Verlauf (`#axis-tree`); im Kreismuster lässt sie sich direkt wählen (`#op-axis`) und verschiebt das Muster mit, wenn der Zylinder wandert.
- [x] **Achse durch 2 Punkte & senkrecht auf Fläche (BZ-06, BZ-07)**: Zwei-Punkte-Achse dient als Drehachse beim Drehen (Revolve, exaktes Volumen); Flächen-Normale an Punkt wandert beim Ändern der Körperhöhe mit.
- [x] **Verwaltung & Hilfetexte**: Umbenennen, Ein-/Ausblenden, Anzeige „Bezug fehlt“ samt Rückgängig, Löschen, Befehle und Hilfetexte (`datumEdgeAngle`, `datumAxis`) geprüft.
- [ ] **Von Hand**: Interaktives Wählen im 3D-Bild über Kontextleiste („Ebene im Winkel“ an einer Kante, „Achse“ an einem Zylinder) und beim Klick auf die Bezugsachse im Werkzeug „Achse im Bild wählen“ prüfen.

## Einheiten je Projekt (Auto [A-014])

- [x] **Zoll-Projekt**: `#proj-unit` auf `in` (Zoll) umstellen; ein Quader `25,4 × 25,4 × 25,4 mm` zeigt `1` im Eingabefeld, `Maße (in)`, `1 in` am 3D-Schildchen und `1 × 1 × 1 in` in der Ampel; Eingabe `2` ohne Einheit ergibt exakt `50,8 mm` intern.
- [x] **Explizite Einheiten & Umschalten**: `25,4 mm`, `2 cm` und `1 in` rechnen weiter exakt um; Umschalten auf `cm` (`2,54`, Eingabe `3` → `30 mm`) und `m` (`0,03`, Eingabe `0,05` → `50 mm`) sowie Rückgängig und Befehle funktionieren.
- [x] **Kontextleiste, Messen, Stückliste & Hilfe**: Kantenlänge `#sel-val` (`1 in`), Messen (`1 in²`, `Wand 1 in`), Stückliste (`1 × 1 × 1 in`) und Hilfetext `projectUnit` geprüft.
- [ ] **Von Hand**: In der Skizze (Maße eintippen, `.skdim`-Schildchen, Skizzen-Tabelle) und in der technischen Zeichnung prüfen, ob alle Angaben in Zoll/cm/m sauber umgerechnet sind und mit `STEP`/`STL` zusammenpassen.

## Volltest-Reparatur (Auto [F-11240028])

- [x] **Kamera-Animation bei blockiertem `requestAnimationFrame`**: `Viewer.lookAtFace` erreicht trotz pausierter `rAF`-Frames per Timer-Fallback (`finishCamAnim`) exakt das Ziel senkrecht auf der Fläche.
- [x] **Abbruch bei Nutzer-Eingriff**: Löst während einer laufenden Kamera-Animation das `start`-Event der `OrbitControls` aus, wird sowohl `camAnim` als auch der Fallback-Timer sauber abgebrochen.
- [x] **Übergangs-Vorschau ohne Debounce-Stau**: Wiederholte Mausbewegungen ohne Änderung der Führungskurve setzen den 250-ms-Debounce von `loftPreview` nicht mehr zurück; die bauchige `__preview`-Vorschau wird berechnet.
- [ ] **Von Hand**: Bei „Blick senkrecht auf die Fläche“ per Rechtsklick und beim Ziehen einer Übergangs-Führungskurve im Browser kurz prüfen, ob die Kamera-Fahrt flüssig wirkt und die Vorschau zügig nachzieht.

## Übersetzbare Oberfläche, Schritt 1 (Auto [A-019])

- [x] **Sammlung & `T()`**: `app/data/texte-de.json` enthält alle Oberflächentexte; `T(key, vars)` liefert deutsche Texte, ersetzt Platzhalter (`{n}`) und fällt bei unbekannten Schlüsseln auf den Schlüssel zurück.
- [x] **Werkzeugleiste & Kopfzeile**: Überschreiben von `I18n.texts['tool.body']` sowie `I18n.set(...)` ändert die sichtbaren Beschriftungen an Werkzeugleiste und Arbeitsbereich-Reitern sofort.
- [x] **Startseite, Menüs & Kontextleiste**: Geänderte Texte erscheinen direkt auf Startseite-Knöpfen/Karten, im Haupt- und Ansichtsmenü sowie in der 3D-Kontextleiste; Zurücksetzen stellt alle deutschen Originaltexte wieder her.
- [ ] **Von Hand**: Einmal Startseite, Werkzeugleiste, alle Menüs (Projekt, Hauptmenü, Ansicht, Rechtsklick, Zeichnung) und Kontextleiste auf fehlende oder abgeschnittene Beschriftungen durchsehen.

## Winkelfang und runde Längen beim Zeichnen (Auto [A-024])

- [x] **15°-Winkelfang & runde Längen**: Linie und Linienzug bei ~44,3° und ~30,8° rasten mit Hilfslinie und Winkel-Schild (`45°`, `30°`) exakt auf 45° bzw. 30° und auf volle 1-mm-Längen ein.
- [x] **Umschalt frei**: Mit gedrückter Umschalttaste bleiben Winkel und Länge beim Ziehen/Klicken ungerundet (kein `45°`-Schild).
- [x] **Zoom-abhängige Längenschritte**: `Sketch.lengthSnapStep()` schaltet je nach Zoom von 1 mm auf 0,5 mm (`5,5 mm`) und 0,1 mm (`1,3 mm`) um.
- [x] **Skizzen-Menü, Speicherung & Hilfe**: Schalter `#sk-angle-snap` schaltet den Winkelfang ab/an, bleibt nach dem Neuladen erhalten (`tracery.angleSnap`) und besitzt den Hilfetext `angleSnap`.
- [ ] **Von Hand**: Im Browser beim schnellen Bewegen und Zoomen prüfen, ob die gestrichelte Hilfslinie und das Winkel-Schild ruhig lesbar bleiben und beim Übergang von einem tangentialen Bogen auf die nächste Linie sauber zusammenspielen.

## Skizze fertig bestimmen (Auto [A-022])

- [x] **Rechteck & Kreis gestrichelt vorschlagen und abbrechen**: Skizze ohne Maße und Regeln → „Fertig bestimmen“ zeigt die gestrichelte Vorschau (`.skdim.prop`, `#sk-autodef-box`), ohne den Skizzen-Zustand zu verändern; „Abbrechen“ verwirft die Vorschläge sauber.
- [x] **Übernehmen → voll bestimmt & ein Rückgängig**: „Übernehmen“ legt alle vorgeschlagenen Maße in einem einzigen Rückgängig-Schritt an (`dof === 0`, Panel meldet „Voll bestimmt“); ein Strg/Cmd+Z stellt den alten Zustand ohne Maße/Regeln wieder her.
- [x] **Fehlende Regeln (< 2° und < 0,05 mm) & gemischte Geometrie**: Linien unter 2° Neigung erhalten Waagerecht/Senkrecht, eine 5°-Linie Winkel + Länge, eine 0,028-mm-Lücke wird mit Deckungsgleich zur geschlossenen Fläche verbunden, ein Bogen erhält seinen Radius.
- [x] **Einfach & Profi, Hilfe und Befehlssuche**: Knopf „Fertig bestimmen“ ist in beiden Stufen sichtbar; Hilfetext `sketchAutoDefine` und Befehl `sketch-autodef` sind vorhanden.
- [ ] **Von Hand**: In einer größeren Freihand-Skizze mit leicht schiefen Linien, Bögen und einem Kreis „Fertig bestimmen“ klicken, die gestrichelte Vorschau auf Lesbarkeit prüfen und anschließend einzelne Maße im Bild anpassen.

## Ganze Fläche in die Skizze, mit Versatz (Auto [A-025])

- [x] **Umschalt + Klick auf ebene Fläche**: Quader 40×30×10 mit Loch Ø10 → alle 5 Randkanten (4 Linien als Rechteck 40×30 + 1 Kreis Ø10) werden in einem Schritt verbunden und fixiert als geschlossene Fläche mit Loch übernommen; Rückgängig entfernt alle auf einmal.
- [x] **Versatz nach außen (+2 mm) & innen (−2 mm)**: Feld `#proj-off` = `2` ergibt 44×34-Rechteck und Ø6-Kreis (verbunden); `-2` ergibt 36×26-Rechteck und Ø14-Kreis.
- [x] **Verbundene Nachführung mit Versatz**: Nach dem Hochziehen und Verbreitern des Quaders auf 50 mm wächst die mit +2 mm Versatz übernommene Kontur automatisch auf 54×34 mit (Loch bleibt Ø6).
- [ ] **Von Hand**: Bei gedrückter Umschalt-Taste die Flächen-Hervorhebung vor dem Klick sowie die Übernahme einer komplexeren ebenen Fläche mit mehreren Bögen und Langlöchern bei positivem und negativem Versatz prüfen.

## Weitere Bezugsebenen (Auto [A-027])

- [x] **Tangential an Zylinder und Kegel (BZ-03)**: Tangentiale Bezugsebene berührt den Zylindermantel (Abstand Achse–Ebene = Radius, Punkt auf Ebene) sowie den Kegelmantel samt Spitze und Neigung; nach Durchmesser-/Lageänderung wandert sie exakt mit und lässt sich über `#datum-angle` um die Achse drehen.
- [x] **Senkrecht zu Kante oder Kurve (BZ-04)**: Senkrechte Ebene an einer Quaderkante (Mitte, Anfang, Ende, Prozentwert `#datum-pos-mode` / `#datum-percent`) und an einer Kreiskante; Normale liegt entlang der Kante/Tangente, wandert bei Größenänderung mit und erlaubt direktes Skizzieren und Hochziehen.
- [x] **Durch Kante und Punkt / durch zwei Kanten (BZ-05)**: Ebene durch Kante + Punkt und durch zwei parallele oder sich schneidende Kanten enthält alle Bezüge, folgt Höhenänderungen und weist kollineare Punkte sowie windschiefe Kanten ab.
- [x] **Dialog, Abhängigkeiten, Fehlerzustand & Hilfetexte**: Alle vier Knöpfe im Bezugsebenen-Dialog (`#dp-tangent`, `#dp-normal-curve`, `#dp-edge-point`, `#dp-two-edges`), `Model.dependencies`, Anzeige „Bezug fehlt“ samt Rückgängig, Befehle und Hilfetexte (`datumTangent`, `datumNormalCurve`, `datumEdgePoint`, `datumTwoEdges`) geprüft.
- [ ] **Von Hand**: Interaktives Anklicken im 3D-Bild für alle vier Arten (Kontextleiste „Ebene tangential“ / „Ebene senkrecht“ / „Ebene durch 2 Kanten“ sowie Punkt-Einrasten bei „Durch Kante & Punkt“).

## Freie Stellen & Widerspruch erklären (Auto [A-023])

- [x] **Linie nur mit Länge**: Knopf „Freie Stellen“ (`#sk-free`) markiert beide Endpunkte als orange Punkte (`.skfree-pt`), zeigt die Zahl der fehlenden Angaben (`3`) in Knopf und Schild (`.sk-free-badge`) und hebt die Linie pulsierend orange hervor.
- [x] **Wackeln & Tastenkürzel**: Klick auf einen freien Punkt löst das Wackeln entlang der freien Richtungen aus (`S.lastWiggle`), ohne die Geometrie dauerhaft zu verändern; `Umschalt F` schaltet die Anzeige um, während `F` weiterhin „Versatz“ wählt.
- [x] **Widersprüchliches drittes Maß & Hervorheben**: Ein drittes Maß am bereits mit Breite + Höhe bestimmten Rechteck zeigt `#sk-conflict` mit allen drei beteiligten Maßen; Klick auf einen Eintrag hebt das Maß und seine Geometrie im Bild rot hervor (`.conf-focus`).
- [x] **„Entfernen“ löst Widerspruch (Maße, Regeln & Live-Konflikt)**: „Entfernen“ bei der Höhe übernimmt die neue Diagonale und löst die Skizze fehlerfrei; ebenso bei einem Regel-Widerspruch (`Gleich` + zwei Längenmaße) sowie bei einem bereits bestehenden Widerspruch in der Skizze. Hilfetext `sketchFreeSpots` vorhanden.
- [ ] **Von Hand**: Im Browser bei einer größeren Skizze mit gemischten Regeln das orange Pulsieren, das Wackeln beim Klick auf verschiedene freie Punkte/Radien sowie die Lesbarkeit der Konflikt-Hervorhebung prüfen.

## Eigene Schrift laden (Auto [A-026])

- [x] **TrueType-Schrift (OFL) laden & 3D-Körper**: Über „Schrift laden …“ (`#tx-load-font`) wird `tests/daten/Balthazar-Regular.ttf` eingelesen, in der Schriftliste (`#tx-font`) und `doc.fonts` (Base64) abgelegt und als Text „Tracery“ ohne Fehler zu einem 3D-Körper mit Fläche > 0 hochgezogen.
- [x] **Speichern & Neu-Laden**: Nach dem Speichern (`.tracery.json`) und Neu-Öffnen bleiben die geladene Schrift in `doc.fonts` und `SK.FONTNAMES` sowie das Text-Element samt 3D-Körper erhalten.
- [x] **Unterschneidung (`kern`) & Laufweite**: Paare aus der `kern`-Tabelle verringern/erhöhen den Zeichenabstand automatisch; der eingestellte Zeichenabstand (`sp`) wirkt weiterhin zusätzlich.
- [x] **CFF/OTF-Hinweis & Hilfe**: Eine CFF/OTF-Datei meldet „noch nicht unterstützt“ ohne das Projekt zu verändern; Hilfetext `loadFont` vorhanden.
- [ ] **Von Hand**: Im Browser eine dekorative TrueType-Schrift vom eigenen Rechner auf einem Schild im Bogen und entlang einer Kurve testen sowie die lesbare Schrift-Auswahl nach „In Kurven umwandeln“ prüfen.

## Hochziehen bis Fläche (Auto [A-029])

- [x] **Bis zur nächsten Fläche (15 → 20 mm)**: Kreis-Skizze auf Platte mit „Bis zur nächsten Fläche“ zieht exakt 15 mm bis zum darüberliegenden Quader hoch (`App.resolvedDist` = 15); Verschieben des Quaders um 5 mm lässt die Höhe automatisch auf 20 mm mitwachsen.
- [x] **Verschieben als Schritt (`transform`)**: Ein `transform`-Schritt (`dz: 5`) am Zielkörper führt die Höhe sofort auf 25 mm nach.
- [x] **Bis zu gewählter Fläche (Klick im 3D & Größenänderung)**: „Bis zu gewählter Fläche“ per Klick auf die Oberseite des Quaders zieht exakt bis dorthin hoch und wächst mit, wenn sich die Höhe des Quaders ändert; Bezug erscheint unter `Model.dependencies`.
- [x] **Formschritt mit Modus, schräge Fläche, Rückgängig & Hilfe**: Vereinigen (`join`) und Abziehen (`cut`) mit `toNext`, schräge Zielfläche (gedrehter Quader), Wechsel zurück zu fester Höhe mit Rückgängig sowie Hilfetext `extrudeToFace` geprüft.
- [ ] **Von Hand**: Interaktives Überfahren und Anklicken einer gekrümmten Fläche (Zylinder/Kugel) und einer Bezugsebene beim „Bis zu gewählter Fläche“-Hochziehen prüfen.

## Volltest-Reparatur (Auto [F-11240211])

- [x] **Schildchen ohne Re-Entranz bei überfälliger Kamera-Animation**: Bei überfälligem `camAnim` während `Sketch.render()`/`Sketch.setTool()` entstehen genau zwei sichtbare, nicht überlappende `.skdim`-Schildchen (sofort und nach dem verzögerten `camera`-Event).
- [x] **Eigenschaften-Panel sofort bei Auswahl**: Nach `App.select(...)` auf ein 3D-Rohr sind `#p3-ax-0`/`#p3-ax-1` sofort ohne Wartezeit im DOM und schalten zuverlässig auf `perp` um.
- [ ] **Von Hand**: In einer Skizze mit mehreren Maßen am selben Punkt zügig drehen/zoomen und prüfen, dass sich keine Maß-Schildchen doppeln oder überdecken.

## Bezugspunkte und eigenes Koordinatensystem (Auto [A-028])

- [x] **Bezugspunkt Kantenmitte (BZ-08)**: Auf einer 40-mm-Kante liegt der Bezugspunkt bei 20 mm (Abstand 20 mm zu beiden Enden), erscheint in `#point-tree`, wandert bei Verbreiterung auf 60 mm auf 30 mm mit und lässt sich ausblenden, löschen und per Rückgängig wiederherstellen.
- [x] **Flächenmitte & auf Kurve bei x % (BZ-08)**: Flächenmitte der Oberseite stimmt exakt; Prozent-Punkt (25 % → 10 mm, über `#point-percent` auf 75 % → 30 mm) und Punkt auf einer Kreiskante bei 50 % liegen exakt auf der Kante.
- [x] **Schnittpunkt Kante / Ebene (BZ-08)**: Schnittpunkt einer senkrechten Kante mit Bezugsebene (`z = 12` → `z = 16` nach Änderung) sowie mit der ebenen Fläche eines zweiten Körpers stimmt; parallele Kanten werden abgelehnt.
- [x] **Eigenes Koordinatensystem (BZ-09)**: Rechtshändiges Koordinatensystem (`det = +1`) an Ecke mit X/Y-Achsen an Kanten (inkl. gedrehtem KS), wandert beim Verschieben des Körpers mit, kehrt Achsen über `#csys-flip-x` rechtshändig um und steht in `Model.dependencies`.
- [x] **Export ab eigenem Nullpunkt (STEP, STL, 3MF)**: Auswahl im Export-Dialog (`#ex-csys`) liefert STL-, 3MF- und wieder eingelesene STEP-Dateien mit Hüllmaßen ab `(0 | 0 | 0)` bis `(40 | 30 | 10)` bzw. `(30 | 40 | 10)` im gedrehten Koordinatensystem; Hilfetexte (`datumPoint`, `datumCsys`) und Befehle sind vorhanden.
- [ ] **Von Hand**: Interaktives Setzen von Bezugspunkten und Koordinatensystem im 3D-Bild über die Skizzen-/Bezugsdialoge und Kontextleiste testen sowie die exportierte STEP-/3MF-Datei in einem Slicer oder CAD-Programm öffnen.

## Rippe (Auto [A-031])

- [x] **Offene Schale mit diagonaler Rippe**: In einer 40×40×20-mm-Schale (2 mm Wandstärke) wird eine kürzere diagonale Skizzenlinie (`[-10,-10]` bis `[10,10]`) mit 2 mm Dicke ohne Lücke bis zu den Seitenwänden und zum Boden verlängert und zu einem einzigen Körper vereinigt (`count == 1`, Hüllmaße unverändert).
- [x] **Einseitig & Formel für Dicke**: Umschalten zwischen „Mittig“, „Einseitig (Seite 1)“ und „Einseitig (Seite 2)“ sowie Steuern der Dicke über ein benanntes Maß (`Rippe`) aktualisieren den Körper exakt.
- [x] **Optionale Schräge**: Eine Entformungsschräge (5°) verbreitert die Rippe zum Boden hin ohne Überstand über die Außenwände.
- [x] **Zeitleiste, Skizze bearbeiten, Stützrippe & Hilfe**: Unterdrücken, Marker zurückrollen, Skizze bearbeiten (`Sketch.editItem`), Stützrippe in der Skizzenebene (`dir: 'parallel'`) am L-Winkel, Bezüge (`Model.dependencies`), Erklärung (`Explain.local`), Befehl `rib` und Hilfetext `werkzeug-hilfen.json` geprüft.
- [ ] **Von Hand**: Rippe an einer runden Dose (zylindrische Außenwand) und über mehrere gebogene Linien/Splines im Browser zeichnen und die Live-Vorschau im 3D-Bild prüfen.

## Drehen mit Winkel und bis Fläche (Auto [A-030])

- [x] **90°-Drehung**: Rechteck neben der Y-Achse um 90° gedreht ergibt exakt ein Viertel des vollen 360°-Volumens (±1 %).
- [x] **Symmetrisch 2×45°**: Modus `both` mit 90° Gesamtwinkel ergibt dasselbe Viertel-Volumen (±1 %) symmetrisch zu beiden Seiten der Skizze.
- [x] **Beidseitig verschieden & Umgekehrt**: Modus `two` (`45°/45°` und `60°/30°`) sowie `reverse` (`90°`) erzeugen das erwartete Volumen und die erwartete Lage.
- [x] **Bis zu gewählter Fläche & Nachführen**: Drehen bis zu einer ebenen Körperfläche (radial und versetzt) sowie bis zu einer 60°-Bezugsebene trifft exakt; Richtungsumkehr und automatisches Nachführen beim Verschieben des Zielkörpers funktionieren.
- [x] **Ziehgriff für den Winkel & Hilfe**: Teil-Umdrehungen zeigen den Ziehgriff `revAngle` (bei 360° ausgeblendet), Ziehen mit der Maus ändert den Winkel (mit Rückgängig), Hilfetext `revolveOptions` ist vorhanden.
- [ ] **Von Hand**: Im Browser beim Drehen einer Skizze direkt am orangefarbenen Winkel-Pfeil ziehen, Zahleneingabe beim Ziehen testen und das Anklicken einer Fläche im Skizzen-Abschlussdialog ausprobieren.

## Verlauf umsortieren, Ordner, duplizieren (Auto [A-034])

- [x] **Unabhängige Schritte umsortieren**: Zwei unabhängige Löcher sowie zwei unabhängige Schnitt-Formschritte lassen sich im Verlauf per Ziehen vertauschen; das 3D-Volumen bleibt identisch und es entstehen keine Fehler.
- [x] **Abhängige Reihenfolge rot markiert und abgelehnt**: Das Ziehen eines Lochs vor seinen Körper, eines Körpers hinter sein Loch oder eines Schnitt-Schritts vor seinen Zielkörper markiert die Zielzeile rot (`.drop-bad`), lehnt das Ablegen ab und meldet den Grund.
- [x] **Ordner anlegen, auf-/zuklappen & auflösen**: Mehrere gewählte Schritte lassen sich über „In Ordner“ (`#btn-tree-folder`) in einen Ordner (`doc.folders`) legen, ohne das 3D-Modell zu verändern; Zuklappen blendet die enthaltenen Schritte im Baum ein/aus, Auflösen und Rückgängig funktionieren.
- [x] **Duplizieren & Hilfetexte**: „Duplizieren“ im Rechtsklick-Menü des Verlaufs legt eine gleiche Kopie direkt hinter dem Schritt (auch innerhalb eines Ordners) mit Rückgängig an; Hilfetexte (`treeReorder`, `treeFolder`, `treeDuplicate`) sind vorhanden.
- [ ] **Von Hand**: Im Browser Schritte mit der Maus direkt in einen Ordner hinein- und herausziehen, einen ganzen Ordner verschieben sowie per Doppelklick umbenennen.

## Körper-Liste im Teil (Auto [A-033])

- [x] **Körper (n) im Verlauf**: Ein einfacher Quader zeigt keine Liste; ein Teil mit zwei getrennten Körpern zeigt unter seinem Schritt „Körper (2)“ mit beiden Einträgen.
- [x] **Umbenennen und Färben**: Beide Körper lassen sich per Stift-Knopf und Doppelklick umbenennen sowie über das Farbfeld einfärben (`vertexColors`, getrennte Farben im 3D-Bild).
- [x] **Ein- und Ausblenden im 3D-Bild**: Ausblenden entfernt die Dreiecke und Kanten des Körpers aus Ansicht und Picking (`Viewer.pick` trifft nur noch den sichtbaren Körper), mit Rückgängig/Wiederholen.
- [x] **Projektdatei und Export**: Namen, Farben und Sichtbarkeit bleiben in der Projektdatei und nach Neuladen erhalten; ausgeblendete Körper fehlen im Export, und „Jeder Körper als eigene Datei“ übernimmt die Körpernamen und Farben in STL und 3MF (`bodyList`-Hilfe vorhanden).
- [ ] **Von Hand**: Im Browser bei einem geteilten Körper oder einer mehrteiligen Skizze per Maus über die Körper-Zeilen fahren (Vorschau-Markierung prüfen) und Rechtsklick-Menü („Nur diesen Körper zeigen“, „Alle Körper einblenden“) testen.

## Volltest-Reparatur (Auto [F-11240339])

- [x] **Kontextleiste nach Ghost-Auswertung**: Beim Auswählen eines Loch-Kindes innerhalb einer Gruppe über `App.select` erscheint `.ctxbar` automatisch nach dem `App.on('ghosts')`-Ereignis, sodass der Knopf „Muster“ (→ „Kreismuster“) klickbar ist.
- [x] **Gelenk-Abspielen bei rAF-Stau**: Auch bei blockiertem `requestAnimationFrame` bewegt `Joints.play()` das bewegliche Teil über den Timer-Fallback und stellt am Ende Ausgangslage, `Joints.playing` und den `#jt-play`-Knopf selbst nach zwischenzeitlichem `Panels.renderRight()` sauber zurück (`App.revision` unverändert).
- [ ] **Von Hand**: Im Bauteil-Bearbeiten-Modus auf eine Bohrung klicken und direkt „Muster → Kreismuster“ wählen sowie bei einem Gelenk unter Last „Bewegung abspielen“ ansehen.

## Muster von Schritten (Auto [A-036])

- [x] **Tasche 6× im Kreis im selben Körper**: Skizzen-Tasche mit `op: cut` per „Muster → Kreismuster“ (Anzahl 6) gemustert; alle 6 Taschen landen im Zielkörper (`Viewer.nodes.size === 1`, `App.mergedInto`, Volumenabzug `6 × Taschenvolumen`).
- [x] **Kopie per Klick auslassen & durchgestrichen**: Klick auf `.pat-dot[data-idx="2"]` im 3D-Bild lässt Kopie 3 aus (`p.skip = [2]`), markiert 3D-Punkt und Chip durchgestrichen (`.skipped`, `line-through`) und erhöht das Volumen exakt um eine Tasche (`5` Taschen, Anzeige `5/6× 360°`).
- [x] **Wieder aktivieren, Undo/Redo & Speichern**: Klick auf `.pat-chip[data-idx="2"]` stellt 6 Taschen wieder her; `App.undo()` / `App.redo()` sowie Speichern und Neuladen der Projektdatei erhalten `G.op`, `p.skip` und das Volumen; Hilfetext `patternSkip` ist vorhanden.
- [x] **Rechteckmuster & Auflösen**: Tasche als 3×2-Rechteckmuster ergibt 6 Taschen im Zielkörper, Auslassen einer Kopie ergibt 5 Taschen, „Auflösen“ behält nur 1 Tasche mit wiederhergestelltem `op: cut`.
- [ ] **Von Hand**: Im Browser bei einer schräg stehenden Tasche und bei einer Rippe (`rib`) ein Muster anlegen, Kopien per Klick im 3D-Bild durchgestrichen auslassen und mit „Alle aktivieren“ zurücksetzen.

## Fläche aufdicken & Körper skalieren (Auto [A-032])

- [x] **Skalieren gleichmäßig (×2)**: Würfel 10×10×10 über Kontextleiste skaliert (`#sc-s = 2`) ergibt das 8-fache Volumen (8000 mm³) und 20×20×20 mm als Schritt `scale` im Verlauf.
- [x] **Skalieren je Achse (1/1/3) & Bezugspunkt**: Ungleichmäßiges Skalieren (`#sc-sx/sy/sz`) um Schwerpunkt (`[-5..5, -5..5, -10..20]`) und Ursprung (`[-5..5, -5..5, 0..30]`) ergibt exakt Höhe 30 mm.
- [x] **Oberseite aufdicken (+3 mm)**: Fläche über Kontextleiste um 3 mm nach außen aufgedickt (`#th-t = 3`) erhöht den Körper exakt auf 33 mm (Volumen 3300 mm³).
- [x] **Richtungen & Modi sowie gewölbte Fläche**: Eigene Platte (`mode='new'`) außen/innen/mittig, Abzug (`mode='cut'`) nach innen (27 mm), Unterdrücken/Zeitleisten-Marker sowie Aufdicken einer gewölbten Zylinderfläche (Ø 20 → Ø 24 mm) funktionieren ohne Fehler.
- [x] **Hilfetexte & Befehle**: `scaleBody` und `thickenFace` in `werkzeug-hilfen.json` sowie Befehle `scale-body` und `thicken-face` vorhanden.
- [ ] **Von Hand**: Im Browser einen Körper mit Rundungen ungleichmäßig skalieren sowie an einer gekrümmten Freiformfläche „Aufdicken“ mit „Andere Fläche wählen“ und „Eigene Platte“ prüfen.

## Kaputter Bezug: neu wählen (Auto [A-035], KP-12)

- [x] **Verlorene Kante bei Rundung & Fase**: Ändert sich ein Maß so, dass die Kante einer Rundung oder Fase verschwindet, zeigen Verlauf (`.node .warn-ref`), Zeitleiste (`.tl-chip.warn`) und Eigenschaften-Panel (`.warn-box`) ein gelbes Warnzeichen samt „Neu wählen“.
- [x] **Gestrichelte Alt-Lage & Kante neu wählen**: Der Assistent (`RefFix`) blendet die alte Lage gelb gestrichelt im 3D-Bild ein (`Viewer.hasRefGhost()`), übernimmt per Klick eine neue Kante am Körper und rechnet danach fehlerfrei weiter.
- [x] **Verlorene Skizzen-Bezugsebene & Hilfetext**: Wird die Bezugsebene einer Skizze gelöscht, erscheint das gelbe Warnzeichen; „Neu wählen“ setzt die Skizze wieder auf eine Ebene/Fläche, alles rechnet fehlerfrei weiter und der Hilfetext `refFix` ist vorhanden.
- [ ] **Von Hand**: Im Browser beim geöffneten „Neu wählen“-Assistenten prüfen, dass sich die Ansicht per linker Maustaste weiterhin drehen lässt und die gestrichelte Alt-Lage beim Überfahren von Ersatzkanten bzw. -flächen gut sichtbar bleibt.

## Gewinde direkt auf runde Fläche (Auto [A-039], KP-19)

- [x] **Bolzen Ø 10 → Vorschlag M10, echtes Gewinde 15 mm**: Rechtsklick auf die Mantelfläche eines Ø 10 × 25-mm-Bolzens → „Gewinde …“ schlägt M10 (Steigung 1,5 mm) als echtes 3D-Gewinde vor; Übernehmen mit Länge 15 mm erzeugt `threadRod` (`M10`) und verringert das Körpervolumen deutlich ohne Fehler (inkl. Rückgängig).
- [x] **Bohrung Ø 8,5 → Vorschlag M10 innen**: Rechtsklick in die Bohrung Ø 8,5 mm eines Blocks → „Gewinde …“ erkennt „Innengewinde“, schlägt M10 (Steigung 1,5 mm, mit Druckspiel) vor und schneidet ein echtes 3D-Innengewinde (`threadHole`, `op: cut`), sodass sich das Volumen verringert.
- [x] **Eigene Steigung & wahlweise kosmetisch**: Umschalten auf „Kosmetisch (nur Markierung)“ sowie abweichende Steigung (z. B. M10 × 1 mm Feingewinde) funktionieren sowohl für die 3D-Markierung als auch für echte 3D-Gewinde (kleinere Steigung ergibt sichtbar anderes Volumen).
- [x] **Hilfetext & Befehlssuche**: `threadFace` in `werkzeug-hilfen.json` und Befehl `thread-face` („Gewinde auf runde Fläche …“) vorhanden.
- [ ] **Von Hand**: Im Browser auf einer schräg liegenden Welle und in einer gestuften Bohrung „Gewinde …“ mit verschiedenen Enden („Ende 1“ / „Ende 2“) testen und die gedruckten Gewindegänge aus der Nähe prüfen.

## Bohrungs-Assistent: mehr Gewinde (Auto [A-038], KP-18)

- [x] **Feingewinde (DIN 13 / DIN 336)**: Norm `metric_fine` bietet M4×0,5 bis M20×1,5 (inkl. M8×1 und M10×1,25); M10×1,25 bohrt exakt Kernloch Ø 8,8 mm (Volumenabzug und Zylinder-Ø geprüft).
- [x] **Zoll-Gewinde UNC & UNF (ASME B1.1 / B18.3)**: Normen `unc` und `unf` von #4 bis 1/2" wählbar; 1/4"-20 UNC bohrt exakt Kernloch Ø 5,1 mm, Durchgang mit 82°-Senkkopf erzeugt passende Kegelfläche.
- [x] **Rohrgewinde G (ISO 228-1 / DIN 3852-2)**: Norm `pipe_g` bietet G1/8 bis G1; G1/4 bohrt Kernloch Ø 11,8 mm, Durchgang bietet statt 90°-Senkkopf die Flachsenkung nach DIN 3852-2.
- [x] **Datentabelle & Hilfetext**: `app/data/gewinde.json` enthält alle Kernloch- und Senkungsmaße mit Norm-Quellenangaben (`_quellen`, `quelle`), und `threadStandards` steht in `app/data/werkzeug-hilfen.json` samt `data-help` an `#hw-norm`.
- [ ] **Von Hand**: Im Browser den Bohrungs-Assistenten auf einer Fläche öffnen, zwischen den fünf Normen wechseln und Querschnittsvorschau sowie Hinweise im Eigenschaften-Panel prüfen.

## Schritt spiegeln (Auto [A-037], KP-14)

- [x] **Tasche links an Mittelebene spiegeln**: Quader 60 × 40 × 10 mm mit Tasche links (−20..−10 mm, 5 mm tief) über „Schritt spiegeln“ an der YZ-Ebene gespiegelt ergibt einen Körper mit zwei Taschen und um exakt 500 mm³ kleinerem Volumen (23.000 mm³).
- [x] **Bezugsebene & ebene Körperfläche**: Spiegeln an einer Bezugsebene sowie an einer ebenen Körperfläche (`plane = 'FACE'`) erzeugt die gespiegelte Tasche auf der jeweiligen Gegenseite im selben Körper.
- [x] **Änderung zieht mit & Erhöhung spiegeln**: Ändern der Taschentiefe (5 → 8 mm) passt auch die gespiegelte Tasche automatisch an; Spiegeln einer Erhöhung (`join`) vergrößert den Körper symmetrisch um beide Seiten.
- [x] **Unterdrücken, Marker, Gruppe & Hilfe**: Unterdrücken und Zurückrollen des `mirrorStep` entfernen die gespiegelte Tasche sauber, Spiegeln eines Loch-Schritts innerhalb einer Gruppe funktioniert ohne Fehler und `werkzeug-hilfen.json` enthält `mirrorStep`.
- [ ] **Von Hand**: Im Browser bei „Schritt spiegeln“ auf „Ebene oder Fläche im Bild wählen“ klicken und nacheinander eine schräge Körperfläche und eine Bezugsebene direkt in der 3D-Ansicht anklicken.

## Varianten schalten Schritte (Auto [A-040], KP-21)

- [x] **Ohne Loch schalten**: In der Variante „ohne Loch“ einen Loch-Schritt per Häkchen unter `#var-steps` unterdrücken (`suppressed: [holeId]`); der Loch-Schritt wird unterdrückt und das Volumen steigt von `11214,6 mm³` auf `12000,0 mm³`.
- [x] **Umschalten & Rückgängig**: Wechsel zwischen „mit Loch“ und „ohne Loch“ schaltet das Loch samt Volumen hin und her; gleichzeitige Abweichungen bei Maßen und unterdrückten Schritten werden gemeldet, lassen sich überschreiben und mit `App.undo()` zurücknehmen; Projektmigration erhält `v.suppressed`.
- [x] **Varianten vergleichen & Hilfe**: `#vtable` zeigt unterschiedliche Schritte („aktiv“ / „unterdrückt“) sowie die geänderten Gewichte; Hilfetext `variants` in `app/data/werkzeug-hilfen.json` beschreibt Maße und Schritte.
- [ ] **Von Hand**: In einem Projekt mit mehreren Schritten und Untergruppen im Reiter „Maße“ zwei Varianten mit verschiedenen aktiven Schritten anlegen, Häkchen ein-/ausklappen und umschalten, um Zeitleiste und 3D-Ansicht gemeinsam springen zu sehen.

## Formeln: wenn, runden, Tabelle (Auto [A-041], KP-22)

- [x] **wenn(Bedingung; dann; sonst) & Vergleiche**: `wenn(b > 50; 3; 2)` liefert bei `b = 60` den Wert `3` und bei `b = 40` den Wert `2`; `<`, `<=`, `>=`, `==`, `!=`, verschachteltes `wenn` und verzögerte Zweig-Auswertung (`wenn(b == 0; 0; 100 / b)`) arbeiten exakt.
- [x] **runden, aufrunden & abrunden**: `runden(2,345; 1)` → `2,3`, `runden(2,35; 1)` → `2,4`, `runden(2,6)` → `3`, `aufrunden(2,31; 1)` → `2,4`, `abrunden(2,39; 1)` → `2,3` und `abrunden(2,9)` → `2`.
- [x] **Nachschlagetabellen unter „Maße“**: Zweispaltige Tabelle `Schraube` mit `M3` / `M5` / `M6` im UI anlegen, umbenennen und ändern; `tabelle(Schraube; M5)` steuert Maße und 3D-Quader-Abmessungen live nach (samt Undo/Redo und Speichern/Laden).
- [x] **Fehlermeldungen in Klartext**: Fehlende Tabellen, fehlende Schlüssel, falsche Argumentanzahl, `=` statt `==`, Division durch 0 und ungültige Nachkommastellen werden in Klartext im Feld, unter „Maße“ und als Meldung angezeigt; Hilfetext `formulaTable` vorhanden.
- [ ] **Von Hand**: Im Browser unter „Maße“ eine neue Tabelle anlegen, in „Formel-Beispiele“ den Hinweistext lesen und in einer offenen Skizze ein Maß direkt mit `tabelle(…)` und `wenn(…)` bemaßen.

## Prägen auf gewölbter Fläche (Auto [A-042], KP-33)

- [x] **Text auf Zylindermantel vertieft**: Zylindermantel wählen → „Prägen“ öffnet Skizze mit Text-Werkzeug vor dem Mantel; Text 1 mm vertieft (`deboss`) verringert das Volumen messbar und hält den Zylinder als ein Stück.
- [x] **Erhaben auf Zylindermantel**: Umschalten auf `emboss` („Erhaben“) vergrößert das Volumen messbar, steht radial über den Mantel hinaus und der Körper bleibt ein Stück.
- [x] **Höhe, Unterdrücken & Zeitleiste**: Ändern der Prägehöhe (1 → 2 mm) vergrößert den Auftrag weiter; Unterdrücken und Zurückrollen des Zeitleisten-Markers stellen das Ausgangsvolumen exakt wieder her.
- [x] **Kugel & Hilfetext**: Kreis auf Kugel 1 mm vertieft und erhaben prägen funktioniert ohne Fehler als ein Stück; `emboss` steht mit `tip`/`hilfe`/`tipp` in `werkzeug-hilfen.json` und `Explain.local` erklärt den Schritt.
- [ ] **Von Hand**: Im Browser auf einer Kugel oder einem Zylindermantel „Prägen“ starten, eigenen Text tippen und platzieren, zwischen „Erhaben“ und „Vertieft“ wechseln und prüfen, dass die Vorschau nur die Vorderseite prägt.

## Volltest-Reparatur (Auto [F-11240521])

- [x] **Drehteller-Video bei rAF-Stau**: Auch bei blockiertem `requestAnimationFrame` zeichnet `Print.turntable()` alle Zwischenbilder synchron über `Viewer.renderNow()` samt `track.requestFrame()` und Timer-Fallback, erzeugt ein gültiges Video (`> 1000` Bytes) und stellt die Ausgangskamera exakt wieder her.
- [x] **Einführung „Erste Skizze“ ereignisgesteuert**: `Tour` reagiert sofort auf `mode`, `sketch` (`addEnt`, `putDimSpec`, `extrudeStep`) und `pop` (`UI.pop`), sodass die Schritte nach Skizzenstart, Ebenenwahl und Rechteck-Zeichnen zuverlässig innerhalb von 500 ms weiterschalten.
- [x] **Abbruch laufender Übergänge**: `Tour.stop()` und `show()` löschen laufende Weiterschalt-Timer (`advTimer`) sauber ohne Zustandsreste auf den Schritt-Definitionen.
- [ ] **Von Hand**: Im Browser ein Drehteller-Video über „Ansicht → Drehteller-Video …“ herunterladen und abspielen sowie die Einführung „Erste Skizze (5 Minuten)“ einmal komplett durchklicken.

## STEP mit Farben und Namen (Auto [A-045], IO-04)

- [x] **XCAF-STEP-Export mit Gruppe, Namen & Farben**: Gruppe „Gehäuse“ mit „Deckel“ (rot `#d6574c`) und „Boden“ (blau `#3f7fd6`) exportiert als `PRODUCT`-Hierarchie mit `NEXT_ASSEMBLY_USAGE_OCCURRENCE`, `STYLED_ITEM` und exakten `COLOUR_RGB`-Werten.
- [x] **Import stellt Struktur, Namen, Farben & Volumen wieder her**: Erneutes Laden über `Start.importCAD` erzeugt die Gruppe „Gehäuse“ samt den Kindern „Deckel“ (rot) und „Boden“ (blau) ohne Fehler und mit exaktem Gesamtvolumen (`6000 mm³`) auch bei sich berührenden Flächen.
- [x] **3D-Farben & Verlauf**: Der 3D-Viewer färbt die Einzelkörper der Baugruppe per Vertex-Farben rot und blau; der Verlauf links zeigt Gruppe und Kinder aufgeklappt mit ihren Farbkacheln.
- [x] **Roundtrip, Ordner & Parser-Sonderfälle**: Zweiter Export/Import-Roundtrip sowie Export eines Ordners (`doc.folders`) als Baugruppe erhalten Namen, Farben und Struktur; `Start.parseSTEP` dekodiert zudem `DRAUGHTING_PRE_DEFINED_COLOUR` und `\X2\…\X0\`-Umlaute.
- [x] **Hilfe & Dialog**: Export-Dialog verweist auf `exportStep`; Eintrag in `werkzeug-hilfen.json` ist vollständig (`tip`, `hilfe`, `tipp`).
- [ ] **Von Hand**: Eine mehrfarbige Baugruppe aus Tracery als STEP exportieren und in FreeCAD oder Fusion öffnen sowie umgekehrt eine fremde STEP-Baugruppe ins Tracery-Fenster ziehen und Namen, Farben und Lage prüfen.

## Wickeln um Zylinder (Auto [A-043], KP-34)

- [x] **Verzerrungsfreies Wickeln (180° ± 2°)**: Rechteck `31,4 × 8 mm` auf einem Zylinder Ø20 (`emboss`, `+2 mm`) umschließt exakt `179,9°` (`180° ± 2°`) mit Volumen `6835,8 mm³` und `0` Fehlern.
- [x] **Vertieft, Startwinkel & Ø40**: Umschalten auf `deboss` (`−2 mm`) schneidet den 180°-Bogen (`5831,0 mm³`), Startwinkel `90°` dreht die Prägung um `90°`, und Vergrößern auf Ø40 halbiert den Umfangswinkel derselben 31,4-mm-Skizze auf `90° ± 2°`.
- [x] **Linie & Entlang Pfad**: Modus `line` prägt den Umriss bzw. eine offene Helix auf die Zylinderoberfläche (`BRepAlgoAPI_Splitter`, Kantenlänge `31,4 mm`); „Entlang Pfad ziehen“ (`#wrap-to-sweep`) erzeugt einen `sweep`-Körper entlang der gewickelten 3D-Kurve.
- [x] **Verlauf, Zeitleiste & Hilfe**: Unterdrücken, Marker zurückrollen, `Sketch.editItem`, `Model.dependencies`, `Explain.local`, `Commands.search('Wickeln')` und Hilfetext `wrapCyl` funktionieren fehlerfrei.
- [ ] **Von Hand**: Im Browser eine Zylinderfläche anklicken, auf „Wickeln“ klicken, ein Rechteck und eine geschwungene Linie zeichnen und zwischen erhaben, vertieft und Linie mit „Entlang Pfad“ umschalten.

## IGES und BREP (Auto [A-044], IO-01)

- [x] **BREP-Roundtrip (Quader 30×20×15)**: `exportBREP` liefert eine gültige OpenCascade-BREP-Datei (`CASCADE`), Re-Import über `.brep` erzeugt fehlerfrei ein `import`-Teil mit exakt gleichem Volumen (`±0,1 %`) und passenden Hüllmaßen.
- [x] **IGES-Roundtrip (Quader `.igs` & `.iges`)**: `exportIGES` erzeugt eine gültige IGES-5.3-Datei (`S/G/D/P/T`, Type 144/128/142/126), Re-Import über `.igs` und `.iges` liefert `fmt='iges'` mit gleichem Volumen (`±0,1 %`).
- [x] **Gekrümmter Körper mit Bohrung (IGES & BREP)**: Quader `30×20×15` mit Durchgangsbohrung `Ø 8 mm` behält nach IGES- und BREP-Roundtrip das exakte Volumen (`±0,1 %`) ohne Fehler.
- [x] **Export-Dialog, ZIP, Skalierung, Hilfe & Fehler**: `#ex-iges` und `#ex-brep` mit `exportIgesBrep`-Hilfe schreiben `.igs` und `.brep` ins ZIP; `#p-scale` skaliert Einheiten (cm = 10×); defekte `.brep`/`.igs`-Dateien melden einen Fehler ohne Absturz.
- [ ] **Von Hand**: Exportierte `.igs`- und `.brep`-Dateien in FreeCAD öffnen und die Kanten-/Flächenqualität prüfen.

## Dateien ins Fenster ziehen (Auto [A-046], IO-09)

- [x] **Hinweis-Rahmen & Schutz gegen internes Ziehen**: `dragenter`/`dragover` mit Dateien blendet den gestrichelten Hinweis-Rahmen `#drop-overlay` ein (`dragleave` blendet ihn aus); internes Ziehen mit `text/plain` löst ihn nicht aus.
- [x] **STL per Drop importieren**: Drop-Ereignis mit `spitze.stl` erzeugt einen neuen `import`-Körper (`fmt='stl'`, passendes Tetraeder-Volumen) ohne Fehler und schließt den Rahmen.
- [x] **Projektdatei per Drop öffnen**: Drop-Ereignis mit einer `.tracery.json`-Datei öffnet das Projekt (`App.doc.name` und `#btn-project` zeigen „Gezogenes Projekt“) samt Maßen und berechnetem Körper.
- [x] **OBJ per Drop importieren**: Drop-Ereignis mit `Wuerfel.obj` importiert den Würfel mit Objektnamen und exakten Hüllmaßen (`10 × 20 × 5 mm`) ohne Fehler.
- [x] **DXF/SVG per Drop & unbekannte Datei**: Drop einer SVG im Modellmodus legt einen Skizzenkörper an; in einer offenen Skizze zeigt der Rahmen den Skizzen-Hinweis und ein DXF-Drop fügt den Kreis direkt in die Skizze ein; eine unbekannte `.txt`-Datei meldet einen Fehler ohne Änderung am Modell.
- [ ] **Von Hand**: Im Finder/Explorer echte Projekt-, STEP-, OBJ-, 3MF- und SVG-Dateien direkt über die Startseite, über den 3D-Bereich und über eine offene Skizze ziehen und prüfen, ob der Rahmen flüssig ein- und ausblendet.

## Geometrie-Prüfung (Auto [A-048], PF-08)

- [x] **Gesunder Quader über Prüfen-Menü**: Klick auf „Prüfen“ (`#t-check`) → „Geometrie prüfen“ (`#check-geom`) prüft den Quader im Kern (`checkGeometry`) und zeigt „Keine Probleme“ (`#geom-check-ok`) ohne Fundstellen.
- [x] **Kugel & Zylinder ohne Fehlalarme**: Entartete Polkanten und Nahtkanten werden übersprungen; gesunde Kugel und Zylinder melden gemeinsam `0` Probleme.
- [x] **Winzige Kante erkannt**: Vereinigen zweier Quader mit zwei fast gleichen Maßen (`20` mm und `20,005` mm) liefert in der Liste Einträge mit `kind === 'tinyEdge'` (`length < 0,01 mm`), die Kante samt Länge in mm nennen.
- [x] **Anklickbare Liste & 3D-Hervorhebung**: Klick auf einen Eintrag in `#geom-check-list` setzt `.active`, erzeugt die rote Hervorhebung im 3D-Bild (`GeomCheck.hasHighlight === true`) und schließt sauber über `#gc-close`.
- [x] **Befehlssuche & Hilfetext**: `Commands.search('Geometrie prüfen')` findet `geom-check`, `HELP.geomCheck` besitzt `tip`, `hilfe` und `tipp`.
- [ ] **Von Hand**: Im Browser ein importiertes/komplexes Teil über „Prüfen → Geometrie prüfen“ prüfen, verschiedene Einträge anklicken und kontrollieren, ob Kamerafokus und roter Ring/Kante gut sichtbar sind.

## Import prüfen und heilen (Auto [A-047], IO-10)

- [x] **Offenes STEP erkennen & Hinweis zeigen**: Absichtlich offenes STEP (eine Fläche fehlt, `OPEN_SHELL` mit 4 offenen Kanten) wird nach dem Import automatisch per `BRepCheck_Analyzer`/`BRepBuilderAPI_Sewing` geprüft (`hasIssues=true`, `openEdges=4`, `solids=0`) und blendet die Hinweis-Leiste `#import-check-bar` samt „Heilen“-Knopf sowie den Bereich `#import-check-panel` ein.
- [x] **Heilen mit Vorher/Nachher-Ergebnis & Rückgängig**: Klick auf „Heilen“ schließt die fehlende Fläche, näht zum geschlossenen Volumenkörper (`8000 mm³`), entfernt die Hinweis-Leiste, meldet Vorher/Nachher-Zahlen (`4 → 0`) in Toast und `#import-heal-diff` ohne Fehler und lässt sich mit `App.undo()` wieder zurückrollen.
- [x] **Lücken & falsch herum liegende Flächen**: `checkImport` und `healImport` erkennen sowohl falsch herum orientierte Einzelflächen bzw. umgestülpte Volumenkörper als auch 0,05-mm-Lücken zwischen Flächen und reparieren sie per `ShapeFix_Face`, `BRepBuilderAPI_Sewing(0.1)` und `ShapeFix_Solid`/`OrientClosedSolid` fehlerfrei.
- [x] **Gültiger Import & Hilfetexte**: Ein gültiges STEP zeigt keinen Fehler-Hinweis, meldet im Panel „Alles in Ordnung“, und `importCheck`/`importHeal` stehen vollständig in `werkzeug-hilfen.json`.
- [ ] **Von Hand**: Echte fehlerhafte STEP-/IGES-Dateien aus dem Internet oder anderen CAD-Programmen importieren, unterschiedliche Näh-Toleranzen rechts testen und die geheilte Geometrie per Ansicht/Messen kontrollieren.

## Werkzeugleiste anpassen und Favoriten (Auto [A-049], BE-04)

- [x] **Rechtsklick & Anpassen-Dialog**: Rechtsklick auf die Werkzeugleiste öffnet das Kontextmenü mit „Anpassen …“; Klick öffnet den Dialog `#tb-dialog` mit aktiver Leiste links und verfügbaren Werkzeugen rechts.
- [x] **Entfernen, Hinzufügen & Sortieren per Ziehen**: Ziehen eines Werkzeugs aus der aktiven Liste nach rechts entfernt es aus `#tools`; Ziehen aus „Verfügbare Werkzeuge“ fügt z. B. „Abrunden“ hinzu; Ziehen innerhalb der aktiven Liste ändert die Reihenfolge in `#tools`.
- [x] **Favoriten ganz links & Speichern über Neuladen**: Markieren mit Stern (`★`) setzt das Werkzeug als Favorit mit `.fav` und Trennlinie ganz nach links; nach Neuladen der Seite bleiben Auswahl, Sortierung und Favoriten erhalten.
- [x] **Zurücksetzen & Hilfe**: „Zurücksetzen“ stellt die Ausgangs-Leiste samt Reihenfolge ohne Favoriten und ohne gespeicherte Anpassung wieder her; Hilfetext `toolbarCustomize` liegt in `werkzeug-hilfen.json`.
- [ ] **Von Hand**: Werkzeugleiste in beiden Stufen („Einfach“ und „Profi“), bei schmalem Fenster sowie mit Suchfilter im Anpassen-Dialog testen und alle hinzugefügten Werkzeuge einmal anklicken.

## Genauigkeit und Nachkommastellen (Auto [A-050], BE-11)

- [x] **Anzeige 0–4 überall gleich**: Nachkommastellen 3 zeigt `12,3456` als `12,346`, 0 als `12` – in `#p-w`, `.dimlabel`, Ampel, Verlauf, Hüllmaßen und Kontextleiste; gespeichertes Maß und CAD-Volumen bleiben exakt.
- [x] **Winkel getrennt einstellbar**: `#set-angle-dec` (0–4) steuert Drehung, Winkel-Maße und Drehkörper getrennt von Längen (`#set-dec`), gespeicherte Winkel bleiben exakt.
- [x] **Skizze, Maße & Messungen**: Maße-Panel, `.skdim`, Eigenschaftsfelder, `#dim-table` und dauerhafte Messungen (`.mpin`, `#measure-tree`) übernehmen Änderungen sofort ohne Verlust der Genauigkeit.
- [x] **Eingabe, Persistenz & Hilfe**: Exakte Eingaben bei 0 Stellen bleiben exakt gespeichert; Einstellungen bleiben nach Neuladen erhalten; Befehl `settings-precision` und Hilfetext `precision` sind vorhanden.
- [ ] **Von Hand**: In den Einstellungen zwischen 0 und 4 Stellen für Anzeige und Winkel wechseln und prüfen, ob beim Messen und Zeichnen in Zoll und Millimeter alle Schilder ruhig und übersichtlich wirken.

## Volltest-Reparatur (Auto [F-11240651])

- [x] **Übergang-Vorschau im Auswahl-Werkzeug**: `Sketch.onMove` löst `loftPreview()` auch bei `S.tool === 'select'` aus (`loftpath`, `loftrail`, `loftrail2`), ohne das `render()`-Aussetzen für normale Auswahl-Mausbewegungen aufzugeben; die Vorschau biegt und wölbt sich sofort.
- [x] **Explosion in Gruppen bei rAF-Stau**: `Views.animateTo()` nutzt neben `requestAnimationFrame` einen `setTimeout`-Fallback (`st.exTimer`), sodass Auseinanderrücken, `#ex-groups` und Zusammensetzen samt `setGroups(false)` auch bei blockiertem `requestAnimationFrame` innerhalb der Animationszeit abschließen.
- [x] **Sauberer Abbruch über Regler & `Views.reset()`**: `stopExAnim()` bricht sowohl `st.exAnim` als auch `st.exTimer` ab, sodass manuelles Ziehen an `#ex-range` den Zustand exakt beibehält.
- [ ] **Von Hand**: Im Browser bei einem Übergang eine Führungs- oder Mittellinie ziehen und prüfen, dass die Vorschau mitgeht, sowie bei einer Baugruppe „Explosion“ mit „Gruppen auch zerlegen“ öffnen, am Regler schieben und wieder zusammensetzen.

## Statusleiste vollständig (Auto [A-052], BE-17)

- [x] **Auswahl-Info (`#status-sel`)**: Zwei gewählte Kanten zeigen „2 Kanten“ samt aufsummierter Länge (inkl. „37,7 mm“ bei `17,7 + 20 mm`), Klick kopiert den Wert; eine ebene Fläche zeigt „Fläche“ samt Flächeninhalt (`1200 mm²`), eine runde Fläche Fläche + Durchmesser, ein Körper seine Hüllmaße; bei leerer Auswahl wird das Schild ausgeblendet.
- [x] **Einheit & Einstellungen (`#status-unit`)**: Zeigt die aktuelle Projekt-Einheit (`mm`/`cm`/…); Klick öffnet das Einstellungsfenster mit Fokus auf `#set-proj-unit`; Umstellen auf `cm` aktualisiert Einheit und Auswahl-Anzeige (`12 cm²`) sofort.
- [x] **Rechenzustand (`#status-calc`)**: Wechselt zwischen „Bereit“ (`ready`), „Rechnet …“ (`busy`) und Fehleranzahl („1 Fehler“, `error`) samt Rückkehr nach `App.undo()`.
- [x] **Layout & Hilfetexte**: `#coords`, `#status-sel`, `#status-unit`, `#status-calc` und `#ampel` liegen sauber nebeneinander im Bildbereich; `statusSel`, `statusUnit` und `statusCalc` sind in `werkzeug-hilfen.json` und `HELP` vorhanden.
- [ ] **Von Hand**: Im Browser bei engem Fenster (< 1100 px), im Skizzen-Modus (Linien, Rechtecke, Mehrfach-Auswahl) und bei langen Neuberechnungen prüfen, dass sich die Felder in der Statusleiste nicht überdecken oder abschneiden.

## Vorlagen für neue Projekte (Auto [A-053], BE-18)

- [x] **Vorlagen-Auswahl bei „Neues Projekt“**: Startseite („Neues Projekt“), Projektmenü (`#pm-new-project`) und Befehlssuche öffnen `#new-proj-dialog` mit allen fünf Vorlagen (`empty-mm`, `empty-in`, `print3d`, `laser`, `enclosure`).
- [x] **3D-Druck, Zoll, Laser & Gehäuse**: „3D-Druck“ aktiviert `doc.settings.printBed` (`220 × 220 × 250 mm`, Düse `0,4 mm`, Material `PLA`), zeigt den Bauraum-Rahmen im Viewer (`Viewer.groups.printBed`) und die Druckbett-Felder im Projekt-Panel; „Leer (Zoll)“ setzt Einheit `in`; „Laser (Platte 3 mm)“ erzeugt eine 3-mm-Platte; „Gehäuse“ legt Gehäuse und Deckel fehlerfrei an.
- [x] **Eigene Vorlage speichern & wieder öffnen**: „Als Vorlage speichern …“ (`#pm-save-template`) sichert das aktuelle Projekt lokal unter `tracery-vorlagen`; nach Neuladen der Seite steht die Vorlage weiterhin im Dialog und auf der Startseite und öffnet sich als neues Projekt mit neuer ID, Maßen und Druckbett-Einstellung.
- [x] **Löschen & Hilfetexte**: Eigene Vorlagen lassen sich über das Papierkorb-Symbol (`.tpl-del`) mit Bestätigung wieder entfernen; `projectTemplates`, `saveTemplate` und `printBed` liegen in `werkzeug-hilfen.json` und `HELP`.
- [ ] **Von Hand**: Im Browser alle fünf eingebauten Vorlagen einmal durchklicken und prüfen, ob der 3D-Druckbett-Rahmen im hellen und dunklen Design gut sichtbar ist, ohne beim Klicken auf Modelle zu stören.

## Wiederherstellen nach Absturz (Auto [A-051], BE-15)

- [x] **Meldung nach Absturz / Neuladen ohne Speichern**: Projekt ändern und die Seite ohne Speichern neu laden zeigt `#recovery-bar` mit „Tracery wurde nicht richtig beendet – letzten Stand wiederherstellen?“, Projektname und Uhrzeit.
- [x] **Wiederherstellen & sauberes Neuladen**: Klick auf „Wiederherstellen“ lädt alle ungesicherten Änderungen fehlerfrei ins Modell; ein erneutes Neuladen ohne weitere Änderung startet direkt ohne Meldung.
- [x] **Verwerfen**: Klick auf „Verwerfen“ kehrt zum letzten gespeicherten Stand zurück und löscht den Wiederherstellungs-Eintrag dauerhaft.
- [x] **Große Projekte aus IndexedDB & Hilfetext**: Projekte > 400 KB samt 15-MB-STEP-Import (`blobId`) werden rein über IndexedDB (`meta.recovery` + `blobs`) wiederhergestellt; Hilfetext `crashRecovery` ist vollständig.
- [ ] **Von Hand**: Im Browser ein Projekt bearbeiten, den Tab hart schließen oder aktualisieren und die Meldung auf Startseite und 3D-Ansicht prüfen.

## Schneller Start (Auto [A-054], PL-03)

- [x] **Sofortiger Start ohne Kern & Schriften**: Beim Öffnen und in einem leeren Projekt ist die Oberfläche ohne Ladebildschirm sofort bedienbar (`Kernel.state === 'idle'`, weder `occ-kernel.wasm` noch `schrift-inter*.json` werden vorab geladen).
- [x] **Skizzieren ohne Kern**: 2D-Skizze starten und ein bemaßtes Rechteck zeichnen funktioniert vollständig ohne den CAD-Kern zu laden.
- [x] **Schrift beim ersten Gebrauch laden**: Erst das Text-Werkzeug (`B`) lädt `schrift-inter.json` nach; Wechsel auf `Inter Fett` lädt `schrift-inter-fett.json`.
- [x] **Kern bei erstem 3D-Schritt & Startzeiten im Protokoll**: Beim Hochziehen (und beim Neuladen eines Projekts mit 3D-Körpern) startet der Kern automatisch, `Log.startup.uiReadyMs < Log.startup.kernelReadyMs`, das Protokoll zeigt `#startup-times` samt Hilfetext `startupTimes`.
- [ ] **Von Hand**: Im Browser mit gedrosseltem Netzwerk (DevTools „Fast 3G“) laden und prüfen, dass Startseite und Skizzieren sofort reagieren, während der Kern erst beim ersten 3D-Körper im Hintergrund lädt.

## Sparsames Rückgängig (Auto [A-055], PL-07)

- [x] **200 Änderungen als Patches & Speichervergleich**: Bei einem großen Projekt (> 200 KB) legen 200 gemischte Änderungen (Maße, Verschieben, Skizzenelemente, Schlüssel löschen/hinzufügen, ID-Listen einfügen/löschen/umsortieren, `pushUndo`, `merge`, `amend`, `squash`) ausschließlich kompakte `ops`-Patches ab und verbrauchen deutlich unter 5 % des Speichers von 200 Vollkopien.
- [x] **200× Rückgängig & Wiederholen exakt**: 200× `App.undo(true)` stellt Byte-für-Byte den exakten Ausgangszustand (`App.snapshot() === snap0`) wieder her; 200× `App.redo(true)` stellt den Endzustand exakt wieder her; `App.undoTo(0)` springt in einem Zug zum Anfang zurück.
- [x] **Speicherbegrenzung statt 300-Schritte-Limit**: Über 300 kleine Änderungen (320) bleiben im Standardlimit erhalten; bei kleinem Speicherlimit (`20 KB`) werden älteste Schritte sauber abgeworfen, ohne das verbleibende Rückgängig zu beschädigen.
- [x] **UI-Knöpfe**: `#btn-undo` und `#btn-redo` machen Änderungen am 3D-Modell sauber rückgängig und wiederholen sie.
- [ ] **Von Hand**: In einem größeren Projekt viele Skizzen- und Formänderungen machen, mit Strg+Z / Strg+Y sowie „Bis hierher zurück“ im Protokoll vor- und zurückspringen und prüfen, dass sich alles flüssig anfühlt.

## Normteile: Passstifte, Passfedern, Lager (Auto [A-056], BI-04, BI-05)

- [x] **Kugellager 608, 6000er & 6200er Reihe**: Lager 608 hat exakt Außen-Ø 22 mm, Innen-Ø 8 mm (`r = 4`) und Breite 7 mm (geschlossen und offen mit Kugeln); Stichproben 6000 (Ø 10 × 26 × 8) und 6204 (Ø 20 × 47 × 14) stimmen ebenfalls.
- [x] **Passfeder 6×6×20 & passende Nut**: `stdKey` liefert exakte Hüllmaße 20 × 6 × 6 mm mit rundstirniger Form A; „Passende Nut anlegen“ erzeugt die zugehörige `stdKeyway`, die Wellennut (`t₁ = 3,5 mm`) und Nabennut (`t₂ = 2,8 mm`) maßgenau aus einem Körper schneidet.
- [x] **Zylinderstift (ISO 2338) & Gleitlager (ISO 3547 / DIN 1850)**: `stdPin` Ø 6 × 20 mm hat exakte Hüllmaße samt 15°-Endfasen; `stdSleeve` 8 × 10 × 12 mm stimmt als zylindrische Buchse (Außen-Ø 10, Innen-Ø 8) und als Bundbuchse (Bund-Ø 15 mm).
- [x] **Bibliothek, Suche, Hilfen & Geometrie-Prüfung**: Alle fünf Normteile erscheinen im Bauteile-Flyout unter „Normteile“, sind über die Befehlssuche auffindbar, besitzen vollständige Hilfetexte (`stdPin`, `stdKey`, `stdKeyway`, `stdBearing`, `stdSleeve`) und bestehen `GeomCheck` ohne Geometriefehler.
- [ ] **Von Hand**: Im Browser ein Kugellager (offen und geschlossen), einen Zylinderstift sowie Passfeder samt Nut auf eine Welle setzen und im Schnitt sowie bei der Stückliste prüfen.

## Schrauben M10–M24 & mehr Werkstoffe (Auto [A-057], BI-06, BI-07)

- [x] **Sechskantschraube M16×60 (ISO 4017)**: Schlüsselweite 24 mm (`ySpan = 24 mm`), Kopfhöhe 10 mm, Schaftlänge 60 mm sowie Normhinweis im Panel.
- [x] **Schrauben, Muttern & Scheiben bis M24**: Zylinderschraube M10×30, Senkschraube M24×50 (DIN 7991) inkl. kurzer Länge, Sechskantmuttern M16 (SW 24) & M24 (SW 36) sowie Unterlegscheiben M12 & M24 bauen maßgenau ohne Fehler und bestehen `GeomCheck`.
- [x] **Werkstoff „Messing“**: Dichte liegt bei 8,47 g/cm³ (8,4–8,7 g/cm³), 1 cm³ Quader wiegt 8,47 g, Quellenangabe und metallischer Studio-Look stimmen.
- [x] **Erweiterte Werkstoff-Sammlung & Kategorien**: Alle 26 Werkstoffe (Stähle, Edelstahl, Messing, Kupfer, POM, PA6, PC, ABS, PETG, TPU, Sperrholz, MDF …) haben Dichte, Studio-Aussehen, Quelle und erscheinen gruppiert in der Auswahl; Suche und Hilfetexte sind aktuell.
- [ ] **Von Hand**: Im Browser eine Sechskantschraube M16×60 samt M16-Scheibe und -Mutter zusammensetzen sowie verschiedene Werkstoffe (z. B. Kupfer, MDF, V4A Edelstahl) im Studio-Look betrachten.

## 3D-Druck: Drucker und Loch-Ausgleich (Auto [A-059], DR-01, DR-02)

- [x] **Drucker-Liste & Bauraum**: Alle geforderten Drucker (Bambu A1 / A1 mini / P1S / X1C, Prusa MK4 / Mini, Ender 3, Voron 2.4) lassen sich im Projekt-Panel (`#proj-printer`) und über die Befehlssuche wählen; Bauraum und Düse werden übernommen und im 3D-Rahmen angezeigt.
- [x] **Warnung & Drehvorschlag**: Bei Bambu A1 mini (180³) und einem 200-mm-Teil warnen `#proj-bed-status`, `#ampel` und der Export-Dialog samt diagonalem 45°-Drehvorschlag; Klick auf `#proj-bed-rotate` dreht das Modell passend auf das Druckbett; ein 200×200×200-Teil meldet korrekt „passt auch gedreht nicht“.
- [x] **Loch-Ausgleich im STL & 3MF**: Bei Loch-Ausgleich `+0,20 mm` hat ein Loch Ø 5 mm im exportierten STL und 3MF exakt Ø 5,20 mm, während ein Außenzapfen Ø 5 mm bei Ø 5,00 mm bleibt und das CAD-Modell unverändert Ø 5,00 mm behält.
- [x] **Hilfetexte**: `printerSelect` und `holeComp` sind in `werkzeug-hilfen.json` und `HELP` vollständig gepflegt.
- [ ] **Von Hand**: Im Browser ein Druckteil mit Bohrung und Senkung auf „Bambu Lab A1 mini“ prüfen, per „So drehen“ ausrichten und die exportierte 3MF/STL-Datei im Slicer (z. B. Bambu Studio oder PrusaSlicer) nachmessen.

## Eigene Teile in die Bibliothek (Auto [A-058], BI-08)

- [x] **In meine Bibliothek speichern**: Rechtsklick im 3D-Bild (`#cm-userlib`) und im Verlauf (`#tm-userlib`) öffnen `#userlib-save-dialog` mit gerendertem PNG-Vorschaubild und erkannten Maßen (z. B. `Breite` aus Parametern oder direkte Zahlenmaße).
- [x] **In neuem Projekt einsetzen & Maße ändern**: Unter „Bauteile → Meine Teile“ (`#my-parts-grid`) erscheint das Teil mit Vorschaubild und lässt sich in ein leeres Projekt einsetzen, ohne `doc.params` zu füllen; Ändern des Eingabefelds `Breite` im Eigenschaften-Panel (`#userpart-sec`) passt den 3D-Körper direkt an.
- [x] **Unabhängige Kopien, Neuladen, Löschen & Hilfe**: Eine zweite eingesetzte Kopie behält ihr eigenes Maß unabhängig von der ersten; gespeicherte Teile bleiben nach Neuladen erhalten, lassen sich über den Papierkorb entfernen und haben den Hilfetext `userLibrary`.
- [ ] **Von Hand**: Ein selbst konstruiertes Teil mit mehreren Körpern und Formeln speichern, in ein anderes Projekt auf eine Körperfläche ziehen und dort die Maße variieren.

## Zeichnung: mehrere Blätter, A4 bis A0 (Auto [A-062], ZE-01)

- [x] **Blatt-Tabs unten**: Im Bereich „Zeichnung“ lassen sich über `#sheet-tabs` und `#dw-add-sheet` neue Blätter anlegen, per Klick wechseln, umbenennen (`.st-ren`) und (ab dem zweiten Blatt) wieder löschen (`.st-del`) – jeweils rückgängig machbar und in der Projektdatei gespeichert.
- [x] **Formate A4 bis A0 (hoch & quer)**: Jedes Blatt lässt sich einzeln auf A4, A3, A2, A1 oder A0 im Hoch- oder Querformat umstellen; Rahmen (20 mm Heftrand, 10/20 mm Außenrand) und Schriftfeld (mit Format-Feld und automatischer Zählung `i/N`) passen sich an.
- [x] **Mehrseitiger PDF-Export**: Der PDF-Export erzeugt ohne externes Nachladen eine mehrseitige PDF-Datei (`%PDF-1.4`) mit allen Blättern in ihren exakten Seitengrößen (z. B. Seite 1 A4 hoch `210 × 297 mm`, Seite 2 A3 quer `420 × 297 mm`).
- [x] **Rückwärtskompatibilität & Hilfen**: Alte Ein-Blatt-Projekte werden beim Öffnen nahtlos übernommen; `drawingSheets` und `drawingFormat` sind in `werkzeug-hilfen.json` und `HELP` gepflegt.
- [ ] **Von Hand**: Im Browser eine Zeichnung mit drei Blättern (z. B. A4 hoch, A3 quer, A1 quer) anlegen, unterschiedlich bemaßen, als PDF exportieren und die Seitengrößen im PDF-Betrachter prüfen.

## Stabile Bezüge, Schritt 1 (Auto [A-061], PL-05)

- [x] **Rundung bleibt nach Tasche und Längenänderung 40 → 60**: Vordere obere Kante eines Quaders abrunden (`tid` mit `E:ny&top`), danach Tasche schneiden (neue Kanten) und Quader von 40 auf 60 vergrößern → Rundung sitzt weiter fehlerfrei mit Radius 2 mm an der verschobenen vorderen oberen Kante.
- [x] **Geteilte Kante über OpenCascade-Verlauf (`Modified`)**: Kante vor dem Abrunden durch eine Tasche teilen und Quader auf 60 ändern → beide Kantenstücke bleiben sauber gerundet.
- [x] **Skizzenkörper-Fase über Skizzen-Linien-Herkunft (`F:sk:`)**: Rechteck-Umriss von 40 auf 60 verbreitern → Fase an der vorderen oberen Kante wandert mit.
- [x] **Skizze auf Fläche (`planeRef` mit `tid`) & Lage-Ersatz**: Skizze auf oberer Quaderfläche (`F:top`) samt Aufbau wandert bei Höhenänderung 15 → 25 mit auf Z = 33; alte Bezüge ohne `tid` greifen weiter über die Lage.
- [ ] **Von Hand**: Im Browser einen Quader mit Tasche und Rundungen sowie einer Skizze auf der Deckfläche versehen, frühe Maße per Ziehgriff und Feld stark ändern und prüfen, dass Rundungen und Skizzenfläche ohne Warnung mitwandern.

## Zeichnung: Detailansicht (Auto [A-064], ZE-03)

- [x] **Detailansicht anlegen (Detail Z, 4:1)**: In der Draufsicht einen Kreis (`r = 9 mm`) aufziehen und als `Detail Z (4:1)` auf dem Blatt platzieren; Kreis und Kennbuchstabe `Z` erscheinen an der Quellansicht, Rahmenkreis und `Detail Z (4:1)` an der Detailansicht.
- [x] **Vergrößerung & kreisförmiges Beschneiden**: Eine Ø-4-mm-Bohrung und eine 6-mm-Kante sind in Detail Z exakt 4-mal größer (`r = 8 mm`, Länge `24 mm`), alle Konturen liegen sauber innerhalb des Detailkreises.
- [x] **Wahre Maße in der Detailansicht**: Lineares Maß und Durchmesser-Maß direkt in Detail Z zeigen die wahren Modellwerte (`6` und `Ø4`) statt `24` oder `Ø16` und behalten sie auch nach Maßstabsänderung (`5:1`).
- [x] **Ändern, PDF-Export, Speichern/Laden & Rückgängig**: Buchstabe, Maßstab, Löschen, Rückgängig/Wiederholen, Projekt-Speicherung, mehrseitiger PDF-Export und Hilfetext `drawingDetail` funktionieren fehlerfrei.
- [ ] **Von Hand**: Im Browser eine Detailansicht auf der Vorderansicht anlegen, auf dem Blatt verschieben und als PDF/DXF exportieren.

## 3D-Druck: Passungen, Düsen-Wand und Ausrichten (Auto [A-060], DR-03, DR-04, DR-05)

- [x] **Passungs-Vorgaben (`lose`, `gleitend`, `fest`, `Presssitz`)**: Im Projekt-Panel (`#proj-print-fit`), im Bohrungs-Assistenten (`#hw-print-fit`) sowie an `stdPin` und `threadRod` vergrößert die Vorgabe Bohrungen um `+0,4 / +0,2 / +0,1 / 0 mm` und verkleinert Bolzen/Stifte um `−0,4 / −0,2 / −0,1 / 0 mm` exakt im CAD-Kern.
- [x] **Düsen-Wandstärken-Check (`< 2 × Düse`)**: Eine `0,6`-mm-Wand meldet bei `0,4`-mm-Düse Warnungen in `#proj-nozzle-wall`, `#ampel`, `Weak.analyze()` (`nozzle-wall`) und `#thin-nozzle-warn`; ab `1,0` mm ist sie grün, bei `0,6`-mm-Düse warnt `1,0` mm wieder.
- [x] **Für den Druck ausrichten**: Ein L-Winkel mit ≥ 300 mm² Überhang sowie ein schräg gedrehter L-Winkel werden über `#ov-orient` bzw. `#proj-orient-print` mit einem Klick auf `< 1 mm²` Überhang und Unterseite `Z = 0` ausgerichtet (samt Rückgängig).
- [x] **Hilfetexte**: `printFit`, `nozzleWall` und `orientPrint` sind in `werkzeug-hilfen.json`, `HELP` und als `data-help`-Attribute im DOM vorhanden.
- [ ] **Von Hand**: Im Browser ein zweiteiliges Steckteil (Bolzen + Bohrung mit Passung „Gleitend“) und ein Bauteil mit dünner Rippe sowie Überhang prüfen und mit „Für den Druck ausrichten“ ausrichten.

## Zeichnung: Schnittansicht (Auto [A-063], ZE-02)

- [x] **Schnittlinie A–A & Bohrungs-Lücke**: Beim Ziehen der Schnittlinie durch die Mitte einer Bohrung (Ø 10 mm im Quader 40 × 30 × 20 mm) entstehen Schnittlinie (`.cutline`, `.cutend`), Richtungspfeile (`.arrow`) mit Buchstaben (`A`) sowie „Schnitt A–A“ mit exakt 2 schraffierten Flächen und einer un-schraffierten Lücke in Bohrungsbreite (10 mm).
- [x] **45°-Schraffur & Maßstab**: Alle Schraffurlinien (`.hatch`) verlaufen unter 45°; beim Wechsel des Blattmaßstabs (z. B. `2:1` auf `1:2`) passt sich der Schraffurabstand (`hatchStepSheet` und Linienabstand im SVG) sauber an.
- [x] **Richtung umkehren & weitere Schnitte**: Blickrichtung lässt sich per `.sec-flip` umkehren; ein zweiter Schnitt erzeugt automatisch „Schnitt B–B“.
- [x] **Export, Rückgängig, Speichern & Hilfe**: PDF-, SVG- und DXF-Export (`SCHRAFFUR`, `SCHNITTLINIE`), Löschen samt `App.undo`/`redo`, Speichern/Laden, Befehlssuche (`schnittansicht`) und Hilfetext `drawingSection` funktionieren vollständig.
- [ ] **Von Hand**: Im Browser ein Werkstück mit Stufenbohrung und Sackloch in der Zeichnung waagerecht und schräg schneiden, die Schnittansicht nachbemaßen und das erzeugte PDF prüfen.

## Volltest-Reparatur (Auto [F-11241014])

- [x] **Skizze-Fertig wartet auf verzögert geladene Schrift (`Sketch.done()` / `SK.needsEntsFonts`)**: Beim Prägen auf einem Zylindermantel mit noch blockierter Schrift (`schrift-inter.json`) bleibt der Skizzenmodus beim Klick auf „Fertig“ ohne Fehler-Toast offen und wechselt automatisch in die Präge-Vorschau (`.stepbox`), sobald die Schrift geladen ist; ein fokussiertes Feld (`#tx-h`) verliert beim Laden einer Schrift (`schrift-inter-fett.json`) weder Fokus noch Eingabe.
- [x] **Rechtes Panel schützt fokussiertes Eingabefeld bei `results`**: Während `#sc-sx` im Skalieren-Panel fokussiert mit `'1'` gefüllt ist, zerstört ein eintreffendes `App.emit('results')` das Feld nicht; Fokus und Wert bleiben erhalten, und nach `Enter` sowie Verlassen des Feldes aktualisiert das Panel sauber.
- [ ] **Von Hand**: Im Browser mit gedrosseltem Netzwerk („Slow 3G“) eine Prägung auf einem Zylinder sofort mit „Fertig“ abschließen sowie im Skalieren-Panel schnell hintereinander Werte in `#sc-sx`/`#sc-sy`/`#sc-sz` eintippen und prüfen, dass nichts verloren geht.

## Zeichnung: Maß-Arten (Auto [A-067], ZE-07)

- [x] **Durchmesser (Ø) & Radius (R)**: Eine Ø-8-mm-Bohrung wird per `#dw-dm-dia` als `Ø8` (mit Doppelfeilen durch die Mitte) bemaßt, eine 5-mm-Rundung per `#dw-dm-rad` als `R5`.
- [x] **Fasenmaß (`1×45°`)**: Eine 1-mm-Fase an einer Quaderkante wird per `#dw-dm-chamfer` automatisch mit Abstand und Winkel als `1×45°` bemaßt.
- [x] **Winkelmaß (`90°`) & Gegenwinkel**: Zwei Kanten der Vorderansicht per `#dw-dm-ang` anklicken erzeugt ein Winkelmaß `90°` mit Bogen und Pfeilen; „Gegenwinkel (180° − α)“ klappt sauber um.
- [x] **Kettenmaß & Bezugsmaß**: `#dw-dm-chain` legt mehrere Maße (`20`, `20`, `20`) hintereinander auf eine gemeinsame Maßlinie; `#dw-dm-base` staffelt alle Maße (`20`, `40`, `60`) von einer Kante aus sauber um jeweils 8 mm.
- [x] **Export, Speichern/Laden, Rückgängig, Menü & Hilfe**: PDF-Export (`Ø8`, `R5`, `1×45°`, `90°`), Projekt-Neuladen, `App.undo`/`redo`, `#t-dim-kind`-Menü, Befehlssuche und Hilfetext `drawingDimTypes` funktionieren vollständig.
- [ ] **Von Hand**: Im Browser ein Werkstück mit schräger Kante (z. B. 30°), einer Fase, Bohrungen und Rundungen über das „Maß-Arten“-Menü bemaßen, Ketten- und Bezugsmaße auch senkrecht anlegen und die erzeugte DXF/PDF-Datei prüfen.

## Zeichnung: Mittellinien automatisch (Auto [A-066], ZE-06)

- [x] **4 Bohrungen → 4 Mittelkreuze & 4 Mittellinien**: Platte mit 4 Durchgangsbohrungen zeigt in der Draufsicht exakt 4 strichpunktierte Mittelkreuze (`data-ctr="cross"`), in der Seiten- und Vorderansicht jeweils exakt 4 strichpunktierte Mittellinien (`data-ctr="line"`) und in der Isometrie 0 Mittellinien.
- [x] **Zylinder, konzentrische Bohrungen & keine Eckenrundungen**: Liegender Zylinder (Achse entlang X) erhält ein Mittelkreuz in der Seitenansicht und Mittellinien in Drauf- und Vorderansicht; konzentrisches Rohr verschmilzt ohne Doppellinien zu einer gemeinsamen Achse; 90°-Kantenrundungen am Quader erzeugen keine Mittellinien.
- [x] **Einzeln aus- und einblenden (Blatt, Panel & Rückgängig)**: Einzelne Mittelkreuze lassen sich per Klick im SVG + `Entf` und einzelne Mittellinien über `.ctr-toggle` in `#dw-centers-list` ausblenden, per `App.undo()`/`App.redo()` schalten, über `#dw-centers-show-all` wiederholen und über `#dw-panel-centers` gesamt schalten.
- [x] **Speichern/Neuladen, Schnittansicht, PDF-Export & Hilfe**: Ausgeblendete Mittellinien (`hiddenCenters`) bleiben nach Speichern und Neuladen erhalten; Schnittansicht durch eine Bohrung zeigt eine Mittellinie; PDF enthält das Strichpunkt-Muster `[14.173 3.402 1.701 3.402] 0 d`; Befehlssuche und Hilfetext `drawingCenters` sind vorhanden.
- [ ] **Von Hand**: Im Browser eine Platte mit Bohrungen und einem quer liegenden Bolzen in der Zeichnung öffnen, einzelne Mittelkreuze per Rechtsklick ausblenden und die erzeugte PDF- und DXF-Datei prüfen.

## Zeichnung: Maß-Stil und Hinweislinie (Auto [A-069], ZE-10, ZE-11)

- [x] **Schriftgröße 5 & Maß-Stil je Blatt**: Umstellen von `#dw-style-size` auf `5` vergrößert alle Maßtexte (`text.dimtext`) im SVG von `3.5` auf `5`; ein zweites Blatt behält seinen eigenen Stil (`2.5`), während Blatt 1 bei `5` bleibt.
- [x] **Pfeilarten & Nachkommastellen**: Alle 4 Pfeilarten (`filled`, `open`, `slash`, `dot`) über `#dw-style-arrow` erzeugen die passenden SVG-Elemente (`polygon.arrow`, `polyline.arrow-open`, `polyline.arrow-slash`, `circle.arrow-dot`); `#dw-style-dec` schaltet zwischen `0`, `1` und `3` Nachkommastellen um (`42`, `42,3`, `42,345`).
- [x] **Notiz mit Hinweislinie an Kante & Fläche**: `#t-note` heftet eine Notiz an eine Kante automatisch mit Pfeilspitze (`polygon.leader-arrow`, `tip === 'arrow'`) und auf eine Fläche automatisch mit Punkt (`circle.leader-dot`, `tip === 'dot'`); Text und Spitze lassen sich über `#dw-note-text` und `#dw-note-tip` ändern.
- [x] **Ansicht verschieben → Pfeil zeigt weiter auf die Kante**: Nach Verschieben der Vorderansicht (Mausziehen, `Drawing.moveView('front', 20, -10)` und Blattwechsel auf A3) wandern beide Hinweislinien exakt mit; die Pfeilspitze liegt weiterhin `< 0,05 mm` auf der oberen Kante der Vorderansicht.
- [x] **Rückgängig, Speichern/Laden, PDF & Hilfe**: Löschen/Undo/Redo, JSON-Roundtrip, PDF-Export (`%PDF-1.4` mit Notiztext), Befehlssuche und Hilfetexte (`drawingDimStyle`, `drawingLeader`) funktionieren vollständig.
- [ ] **Von Hand**: Im Browser mehrere Blätter mit unterschiedlichen Maß-Stilen (z. B. Schrägstrich und Punkt) anlegen, eine mehrzeilige Notiz an eine Rundung setzen, die Ansicht verschieben und die exportierte PDF-/DXF-Datei prüfen.

## Zeichnung: Toleranzen und Passungen (Auto [A-068], ZE-08, ZE-09)

- [x] **ISO-286-Passungen (`Ø20 H7`, `Ø20 g6`)**: Nach Auswahl von `Ø20` auf dem Zeichnungsblatt berechnet Tracery aus `app/data/iso286.json` (DIN EN ISO 286-2:2010) für `H7` exakt `+0,021 / 0` (`20,000 – 20,021 mm`) und für `g6` exakt `−0,007 / −0,020` (`19,980 – 19,993 mm`); Anzeige-Modi („Kurzzeichen + Abmaße“, „Nur Kurzzeichen“, „Grenzmaße“) schalten sauber um.
- [x] **Toleranzarten (± symmetrisch, Abmaße, Grenzmaße)**: Längenmaße (horizontal und um `−90°` gedreht senkrecht) unterstützen symmetrische Toleranz (`50 ±0,1`), obere/untere Abmaße (`+0,05 / −0,02`, `+0,10 / −0,05`) und Grenzmaße (`50,2 / 49,9`).
- [x] **Rückgängig, Speichern/Neuladen, PDF-Export & Hilfe**: Toleranzen bleiben nach `App.undo()`/`App.redo()` und JSON-Roundtrip erhalten, erscheinen im PDF ohne `?`-Ersatzzeichen und sind über die Befehlssuche (`drawingTolerance`) sowie die Hilfetexte `drawingTolerance` und `drawingFit` dokumentiert.
- [ ] **Von Hand**: Im Browser ein Bauteil mit Passbohrung `Ø20 H7` und Passwelle `Ø20 g6` in die Zeichnung übernehmen, Passungen setzen und die erzeugte PDF- und DXF-Datei im Betrachter prüfen.

## Zeichnung: Ansichten einstellen (Auto [A-065], ZE-04, ZE-05)

- [x] **Verdeckte Kanten je Ansicht (ZE-04)**: Im Panel unter „Ansichten“ (`#dw-view-list`, `#dw-v-hidden`) lassen sich verdeckte Kanten pro Ansicht unabhängig ein- und ausschalten; aktivierte Ansichten zeigen zusätzliche gestrichelte `.hid`-Linien (`stroke-dasharray`).
- [x] **Tangentiale Kanten & Maßstab je Ansicht (ZE-04)**: Übergangskanten von Rundungen (`.tan` aus `Rg1LineVCompound`/`Rg1LineHCompound`) sowie der Maßstab (`#dw-v-scale`, „Wie Blatt“ oder Normmaßstab z. B. `2:1`) lassen sich je Ansicht einzeln schalten.
- [x] **Isometrische Ansicht, Schattierung & PDF-Export (ZE-05)**: `#dw-add-iso` legt eine isometrische Ansicht auf dem Blatt an; `#dw-v-shaded` legt ein orthografisch gerendertes 3D-Schattierungsbild (`image.shade-img`) hinter die Kanten, und der PDF-Export enthält die Isometrie samt gestrichelter Linien und eingebettetem Schattierungsbild (`/Subtype /Image`, `/Filter /DCTDecode`).
- [x] **Freie 3D-Ansicht aus Kamera, Rückgängig, Speichern & Hilfen (ZE-05)**: `#dw-add-free` übernimmt die aktuelle 3D-Kamera als neue Zeichnungsansicht (`extraViews`), arbeitet mit Rückgängig/Wiederholen, Speichern/Laden, Befehlen und den Hilfetexten `drawingViews` / `drawingViewProps`.
- [ ] **Von Hand**: Im Browser eine gerundete Baugruppe mit mehreren Farben und Werkstoffen als schattierte Isometrie und freie 3D-Ansicht anlegen, in der freien Ansicht den Blickwinkel per „Aktuelle 3D-Ansicht übernehmen“ aktualisieren und das exportierte PDF im PDF-Betrachter auf Schattierung, Linienstärken und Beschriftung prüfen.

## Volltest-Reparatur (Auto [F-11241146])

- [x] **Adaptive Auflösung bei geringer Bildrate / `rAF`-Stau (`Viewer.adaptRes` / `scheduleAdaptRestore`)**: Nach Ziehen im 3D-Fenster bei `Viewer.setAdaptive(true, 0)` kehrt `Viewer.lowRes` auch bei blockiertem `requestAnimationFrame` über zeitkompensierte Dämpfung und Timer-Fallback auf `false` und `Viewer.pixelRatio === window.devicePixelRatio` zurück.
- [x] **`askDim` verliert keine Ziffern bei verzögertem `rAF(grab)` (`Sketch.askDim` / `onKey`)**: Wird die erste Ziffer über `Sketch.onKey()` an `dimBox._inp` weitergereicht und feuert danach das verzögerte `requestAnimationFrame(grab)`, bleibt `dimBox._typed` erhalten; die nächste Ziffer wird angehängt (`60` statt `0`), löst den erwarteten Konflikt (`#sk-conflict`) aus und lässt sich per „Entfernen“ sauber auflösen.
- [ ] **Von Hand**: Im Browser bei hoher Szenenlast die Ansicht zügig drehen und loslassen (Schärfe springt nach ~0,2 s zurück) sowie beim Bemaßen (`D`) direkt nach dem Klick schnell eine zweistellige Zahl eintippen.

## Zeichnung merkt Modelländerungen (Auto [A-072], ZE-14)

- [x] **Gelöschte Bohrung → rotes Maß & Liste „Verlorene Maße“**: Wird nach dem Bemaßen einer Ø-8-Bohrung die Bohrung im Modell gelöscht, rechnet sich die Zeichnung automatisch neu; das Maß erhält die SVG-Klasse `.lost` (`rgb(201, 55, 46)` rot) samt `data-lost="1"` und erscheint in `#dw-lost-sec` / `#dw-lost-list` samt „Neu zuordnen“ und „Löschen“; `App.undo()` macht es wieder gültig, `App.redo()` wieder rot.
- [x] **Längenänderung → Längenmaß zeigt neuen Wert**: Wird die Plattenbreite von `60 mm` auf `85 mm` (und bei geöffneter Zeichnung auf `95 mm`) geändert, aktualisieren sich sowohl das manuelle Längenmaß als auch das automatische Gesamtmaß auf `85` bzw. `95` ohne `.lost`-Markierung, während das Maß der gelöschten Bohrung in „Verlorene Maße“ bleibt.
- [x] **Neu zuordnen, Löschen, Speichern/Laden, PDF & Hilfe**: „Neu zuordnen“ hängt das verlorene Maß per Klick auf eine zweite Bohrung (`Ø10`) wieder an (Rückgängig stellt den verlorenen Zustand wieder her), „Löschen“ entfernt es sauber; JSON-Roundtrip, PDF-Export, Befehlssuche (`drawingLostDims`) und Hilfetext `drawingLostDims` funktionieren vollständig.
- [ ] **Von Hand**: Im Browser ein Werkstück mit Fase, Rundung, Bohrung und Längenmaß in der Zeichnung bemaßen, anschließend die Bohrung und Fase im Modell löschen sowie Abmessungen ändern, und die rote Markierung, die Liste „Verlorene Maße“ sowie „Neu zuordnen“ visuell prüfen.

## Zeichnung als DXF und PNG (Auto [A-071], ZE-13)

- [x] **DXF-Export (`LINE`, `CIRCLE`, `ARC`, Layer & Schriftfeld)**: Export über `#t-dexport` → `#dw-exp-dxf` liefert eine gültige `.dxf`-Datei (`$INSUNITS = 4`, Layer `SICHTBAR`, `VERDECKT`, `MITTELLINIE`, `BEMASSUNG`, `RAHMEN` mit `CONTINUOUS`/`DASHED`/`CENTER`), enthält `LINE`-, `CIRCLE`-, `ARC`- und `TEXT`-Einträge auf den passenden Layern sowie alle Schriftfeld-Texte (`Benennung`, `Zeichnungsnummer`, `Gezeichnet`, `Werkstoff`, `ISO 2768-m`); bei mehreren Blättern steht zusätzlich der Mehrblatt-ZIP-Export (`#dw-exp-dxf-all`) bereit.
- [x] **PNG-Export mit wählbarer Auflösung**: Dialog (`#dw-exp-png`) übernimmt eigene Pixelbreiten (`1800 px` → `1800 × 1273 px`), 300-DPI-Vorgabe (`3508 × 2480 px` bei A4 quer), rendert das komplette Blatt sichtbar (nicht leer) und unterstützt durchsichtigen Hintergrund (`3200 × 2263 px`, RGBA mit transparentem Rand).
- [x] **Befehlssuche & Hilfetexte**: Befehle `drawingExportDxf` und `drawingExportPng` sowie Hilfetexte `drawingExportDxf` und `drawingExportPng` in `werkzeug-hilfen.json` und `00-util.js` sind vorhanden.
- [ ] **Von Hand**: Im Browser eine bemaßte Zeichnung mit Schnittansicht, Mittellinien und Schriftfeld als `.dxf` in einem DXF-Betrachter (z. B. LibreCAD / QCAD) auf Layer und Linientypen sowie das exportierte `.png` auf Schärfe und Lesbarkeit prüfen.

## Zeichnung: Positionsnummern und Stückliste (Auto [A-070], ZE-12)

- [x] **3 verschiedene Teile, eines zweimal → Tabelle & 3 Positionsnummern**: `#t-balloons` → „Positionsnummern automatisch setzen“ erzeugt auf dem Blatt die Stückliste (`Pos.`, `Menge`, `Name`, `Werkstoff`) mit exakt 3 Datenzeilen passend zu `Mass.bom()` (Menge `2` beim doppelten Teil) und exakt 3 überschneidungsfreien Positionskreisen (`1`, `2`, `3`) im Blattrahmen.
- [x] **Ansicht verschieben, Werkstoff-Update & Gruppen**: Beim Verschieben der Ansicht wandern die Positionsnummern exakt mit; Werkstoffänderungen am Modell aktualisieren die Tabelle automatisch; Baugruppen/Gruppen werden samt Einzelteilen korrekt gruppiert und nummeriert.
- [x] **Einzeln setzen (`B`), Spitze wechseln, Löschen & Tabelle schalten**: Einzelne Positionsnummern lassen sich per Taste `B` setzen, zwischen Punkt und Pfeil umschalten, per `Entf` löschen und die Stückliste auf dem Blatt über `#dw-bom-show` ein-/ausblenden.
- [x] **Rückgängig, Speichern/Neuladen, PDF, DXF & Hilfen**: Undo/Redo, JSON-Roundtrip, PDF-Export (`%PDF-1.4` mit Spalten und Teilenamen), DXF-Export (Kreise auf `BEMASSUNG`, Tabellentexte auf `RAHMEN`), Befehlssuche und Hilfetexte (`drawingBalloons`, `drawingBom`) funktionieren vollständig.
- [ ] **Von Hand**: Im Browser eine kleine Baugruppe aus mehreren Teilen und einer Gruppe in der Zeichnung mit Positionsnummern versehen, Kreise und Stückliste auf dem Blatt zurechtschieben und die exportierte PDF- und DXF-Datei prüfen.

## Bauteil und Baugruppe als eigene Dokumente, Schritt 1 (Auto [A-082], BG-01)

- [x] **Startseite, Tabs & Dokument-Art**: „Neue Baugruppe“ (`#start-new-asm-btn`, `#start-card-new-asm`, `#tab-add-asm`) legt ein Baugruppen-Dokument (`docType: 'assembly'`) mit Baugruppen-Leiste (`#t-insert-part`) an; bestehende und migrierte Projekte bleiben Bauteile (`docType: 'part'`).
- [x] **Bauteile als Verweise speichern**: Zwei gespeicherte Bauteile über `#asm-insert-dialog` in eine Baugruppe eingesetzt; in `App.doc` und roh in IndexedDB liegen ausschließlich `kind: 'ref'`-Verweise mit `p.docId` und Lage `t` ohne kopierte Geometrie.
- [x] **Live-Aktualisierung & Neuladen**: Änderung an einem Bauteil (über `#btn-ref-open` in seinem Tab) aktualisiert nach Rückwechsel die angezeigte Form und Hüllmaße in der Baugruppe und bleibt nach `reload()` aus IndexedDB erhalten; Hilfetexte (`assemblyDoc`, `insertPart`) und Rückgängig funktionieren.
- [ ] **Von Hand**: Im Browser eine Baugruppe anlegen, mehrere eigene Bauteile mit verschiedenen Werkstoffen und Farben einsetzen, eins davon im eigenen Tab umbauen und das Mitwandern visuell prüfen.

## Kopieren zwischen Projekten / Tabs (Auto [A-076], BE-13)

- [x] **Quader mit Bohrung in Tab 1 → Tab 2 (`Strg/Cmd+C` / `Strg/Cmd+V`)**: Eine Gruppe aus Quader (`40 × 30 × 20 mm`) und durchgehender Bohrung (`Ø 10 mm`) mit Farbe `#d6574c` und Werkstoff `PLA` wird in Tab 1 kopiert und in einem zweiten Browser-Tab exakt mit gleichem Volumen, gleicher Farbe, gleichem Werkstoff und allen Schritten eingefügt; Rückgängig/Wiederholen arbeitet als ein Schritt.
- [x] **Formschritte, lose Löcher & Formel-Maße**: Abzugs-Formschritte (`op: 'cut'`), verwendete Parameter (`breite = 50`) und lose oberste Löcher wandern mit; im Ziel-Tab schneiden mitgebrachte Löcher nur den kopierten Körper und keine bereits vorhandenen Körper.
- [x] **Feste Form (BREP-Fallback), Kontextmenü & Hilfe**: Teile mit nicht mitkopierten externen Bezügen (z. B. isolierte `transform`-Kopie) werden automatisch als BREP gebacken und behalten Volumen, Farbe und Werkstoff; `#cm-copy`, `#cm-paste`, Befehlssuche und Hilfetext `copyBetweenTabs` sind vorhanden.
- [ ] **Von Hand**: Im Browser zwei Tracery-Tabs öffnen, einen aufwendigeren Körper mit Rundungen, Bohrung, eigenem Werkstoff und Farbe per `Strg/Cmd+C` kopieren, im zweiten Tab mit `Strg/Cmd+V` einfügen und Lage, Farbe und Material visuell prüfen.

## Mehrere Projekte in Tabs (Auto [A-075], BE-13)

- [x] **Zwei Projekte in Tabs öffnen & wechseln**: Über „+“ → „Neues leeres Projekt“ bzw. gespeichertes Projekt ein zweites Projekt in einem neuen Tab öffnen; Klick auf die Tabs zeigt jeweils nur den zugehörigen Körper in 3D-Ansicht und Verlauf.
- [x] **Eigenes Rückgängig je Tab**: Eine Änderung in Tab 2 per „Rückgängig“ zurücknehmen lässt Tab 1 samt seinem Verlauf und Rückgängig-Stapel unverändert.
- [x] **Schließen mit Nachfrage, Einfach/Profi, Neuladen & Hilfe**: „×“ auf einem Tab mit ungespeicherten Änderungen öffnet den Bestätigungsdialog („Abbrechen“ / „Trotzdem schließen“), ein unberührter leerer Tab schließt sofort; Tab-Leiste funktioniert in „Einfach“ und „Profi“, offene Tabs werden beim Neuladen wiederhergestellt und der `+`-Knopf trägt `data-help="projectTabs"`.
- [ ] **Von Hand**: Im Browser mehrere Projekte per „+“ (inkl. Vorlage und `.json`-Datei) öffnen, mit Doppelklick umbenennen, per Rechtsklick „Andere Tabs schließen“ prüfen und das Design in „Einfach“ und „Profi“ sowie bei schmalem Fenster ansehen.

## Große Modelle, Schritt 1: nur neu rechnen, was sich geändert hat (Auto [A-077], PL-04)

- [x] **3 unabhängige Körper → Maßänderung rechnet nur Körper 3 neu**: Nach dem Anlegen von Quader, Zylinder und Skizzenkörper zeigt `Kernel.stats()` für alle drei je `1` Neuberechnung; nach dem Ändern der Höhe an Körper 3 (direkt und per Parameter-Formel `Hoehe3`) bleiben die Zähler für Körper 1 und 2 bei `1`, nur Körper 3 wird neu gerechnet (`data-cache="hit"` bzw. `"rebuilt"` und Tooltip „aus Speicher“ / „neu gerechnet“ in der Zeitleiste).
- [x] **Abhängiger Boolesch-Abzug, Rückgängig & Marker-Sprung**: Ein von Körper 3 abhängiger Schnitt rechnet bei Höhenänderung mit Körper 3 zusammen neu, während Körper 1 und 2 im Speicher bleiben; `App.undo()` sowie Zurück- und Vorrollen des Zeitleisten-Markers bedienen alle Schritte mit `0` Neuberechnungen aus dem Cache.
- [ ] **Von Hand**: Im Browser bei einem größeren Modell mit mehreren Körpern und Verrundungen ein Maß am letzten Schritt ändern und im Protokoll („Rechenzeit je Schritt“) sowie an den Tooltips der Zeitleiste prüfen, dass frühere Schritte aus dem Speicher kommen.

## Übersetzbare Oberfläche, Schritt 2 (Auto [A-074], PL-01)

- [x] **Test-Modus (`I18n.setTestMode`)**: `I18n.setTestMode(true)` versieht bekannte Sammlungstexte (inkl. HTML-Inhalte) mit Markierungen (`⟦…⟧`), lässt unbekannte Schlüssel unverändert und stellt per `I18n.setTestMode(false)` alle Originaltexte wieder her.
- [x] **Startseite & 3D-Ansicht (Profi & Einfach)**: Im markierten Test-Modus enthält der sichtbare DOM auf Startseite sowie mit gewähltem Quader in Profi und Einfach (Werkzeugleiste, linkes/rechtes Panel, Kontextleiste, ViewCube, Zeitleiste, Statusleiste) höchstens 5 unmarkierte Ausnahmen.
- [x] **Offene Skizze & Zeichnung**: Bei offener Skizze (Profi & Einfach inkl. Skizzen-Panel, Fang-/Regel-Leiste und Hinweiszeile) sowie im Zeichnungsmodus (`Commands.setMode('drawing')`) bleiben unmarkierte sichtbare Texte jeweils bei höchstens 5 Ausnahmen.
- [x] **Dialoge**: Die Dialoge Einstellungen (`ViewPrefs.dialog()`), Export (`Print.exportDialog()`) und Tastenkürzel (`Commands.showKeys()`) kommen vollständig über `T()` mit höchstens 5 Ausnahmen im DOM.
- [ ] **Von Hand**: Test-Modus (`I18n.setTestMode(true)`) im Browser über alle Arbeitsschritte (Skizzen-Assistent, Bohrungs-Assistent, Werkzeugleiste anpassen, Stückliste, Versionen) durchklicken und prüfen, ob alle Hinweise und Tooltips sauber markiert sind.

## Läuft in Firefox und Safari (Auto [A-079], PL-09)

- [x] **Schalter `--browser firefox|webkit` & Grundtests**: `tests/klicktest.py` startet je nach Schalter Chromium (Standard), Firefox oder WebKit; Grundtests, Vorführ-Modus (`Esc` über `fullscreenchange`/`webkitfullscreenchange`) und Zeichnungs-DXF/-PNG (`[A-071]`) laufen in Firefox und WebKit fehlerfrei.
- [x] **Quader mit Bohrung in WebKit & Firefox**: Startseite, leeres Projekt, Quader `40 × 30 × 20 mm` mit Durchgangsbohrung `Ø 10 mm` bauen in beiden Engines ohne Seitenfehler und ohne `App.errors` mit passendem Volumen (`≈ 22429,2 mm³`).
- [x] **Tastenkürzel, fehlende API & Datei-Dialoge**: `O` (Orthografisch), `Strg+Z`/`Strg+Y`, `Start.folderSupported() === false`, Speichern (`.tracery.json`) und Datei-Dialog (`Start.openFile()`) funktionieren in Firefox und WebKit ohne Fehler.
- [ ] **Von Hand**: In echtem Safari auf macOS, Firefox und auf einem iPad ein Modell bauen, Datei öffnen/speichern, Bild/PDF/DXF exportieren und Vorführ-Modus per `Esc` beenden.

## Volltest-Reparatur (Auto [F-11241334])

- [x] **Veraltete `mergedInto`-Bezüge beim Löschen**: Nach dem Löschen des Zielkörpers (`Block`) eines Formschritts (`Bolzen`) liefert `App.mergedInto()` sofort `null`; synchrones Neuzeichnen von Verlauf (`Panels.renderLeft()`) und Eigenschaften (`Panels.renderRight()`) noch vor Abschluss von `rebuild()` wirft keinen Seitenfehler und zeigt im rechten Panel den Hinweis für das fehlende Ziel.
- [x] **Rückgängig & Lösch-Hinweis (`Actions.remove`)**: `App.undo()` stellt den `mergedInto`-Bezug wieder her und `Actions.remove()` zeigt beim Löschen mit abhängigem Teil ohne Seitenfehler den Toast „Daran hingen …“.
- [ ] **Von Hand**: Im Browser zwei Körper mit Boolesch-Abzug anlegen, den Zielkörper über Verlauf oder Entfernen-Taste löschen und prüfen, dass Verlauf und Eigenschaften sofort sauber ohne Fehlermeldung aktualisieren.

## Mehrere Rechen-Helfer (Auto [A-078], PL-04)

- [x] **4 unabhängige Körper mit Bohrungsmustern verteilt**: Vier unabhängige Platten mit Rechteck- bzw. Kreis-Bohrmustern werden auf mehr als einen Rechen-Helfer (bis zu 4, passend zu `navigator.hardwareConcurrency`) verteilt; `remesh` und `faceLoops` funktionieren auch auf Neben-Helfern, und `occ-kernel.wasm` wird nur genau einmal abgerufen (kein Nachladen aus dem Netz).
- [x] **Gleiches Ergebnis wie mit einem Helfer**: Nach Abschalten in den Profi-Einstellungen (`#set-multiWorker`) berechnet nur noch 1 Helfer alle Körper mit identischen Keys, Hüllkästen, Dreieckszahlen und Volumina.
- [x] **Einstellung (Profi), Abhängigkeiten & Hilfe**: Das Häkchen `#set-multiWorker` ist nur in „Profi“ sichtbar (in „Einfach“ ausgeblendet); abhängige Körper (`op.target`) bleiben auf demselben Helfer und der Hilfetext `multiWorker` ist vorhanden.
- [ ] **Von Hand**: Im Browser auf einem Mehrkern-Rechner eine große Baugruppe mit mehreren unabhängigen Körpern öffnen, in den Profi-Einstellungen „Mehrere Rechen-Helfer nutzen“ aus- und einschalten und im Task-Manager / Entwicklerwerkzeug die parallele Auslastung der Worker beobachten.

## Englische Oberfläche (Auto [A-081], BE-16)

- [x] **Schlüsselgleichheit `texte-en.json` ↔ `texte-de.json`**: Alle Schlüssel und `{Platzhalter}` stimmen in Dateien und eingebetteten Sprachpaketen überein; jeder Eintrag ist gefüllt und `"tool.sketch"` ist `"Sketch"`.
- [x] **Sprach-Umschalter in den Einstellungen**: Umschalten auf `English` (`#set-lang`) ändert die Oberfläche sofort (Knopf „Skizze“ heißt „Sketch“, „Modell“/„Zeichnung“ werden „Model“/„Drawing“, `html[lang="en"]`), bleibt beim Neuladen erhalten und schaltet sauber auf `Deutsch` zurück.
- [x] **Fallback & Browser-Sprache**: Fehlende Schlüssel in `I18n.packs.en` fallen automatisch auf den deutschen Text zurück; ohne gesetzte Einstellung startet ein englischer Browser (`en-US`) auf Englisch und ein nicht unterstützter Browser (`fr-FR`) auf Deutsch.
- [ ] **Von Hand**: Im Browser in den Einstellungen zwischen „Wie der Browser“, „Deutsch“ und „English“ umschalten und stichprobenartig Skizze, Zeichnung, Export-Dialog und Tooltips auf verständliche englische Texte prüfen.

## Am Tablet bedienbar (Auto [A-080], PL-09)

- [x] **44-px-Knöpfe am Tablet (Profi & Einfach)**: Im Playwright-Gerät „iPad Pro 11“ (`834 × 1194`) und bei `1024 × 768` Breite mit Touch sind alle sichtbaren Werkzeugleisten-, Kopfzeilen- und Kontextleisten-Knöpfe in „Profi“ und „Einfach“ mindestens `44 px` hoch.
- [x] **Panels einklappbar**: Verlauf (`#left`) und Eigenschaften (`#right`) starten bei `< 1100 px` Breite und Touch eingeklappt und lassen sich über `#btn-left` / `#btn-right` öffnen sowie über `#btn-left-close` / `#btn-right-close` oder Antippen der 3D-Ansicht wieder einklappen.
- [x] **Antippen & Zwei-Finger-Bedienung**: Antippen eines Quaders wählt ihn (Antippen im Leeren hebt die Auswahl auf); eine Zwei-Finger-Geste (Verschieben + Spreizen) dreht und zoomt die 3D-Kamera ohne die Auswahl zu verändern.
- [ ] **Von Hand**: Auf einem echten iPad in Safari hochkant und quer die Bedienung mit Finger und Stift (Panels klappen, Körper antippen, Ziehgriffe bewegen, zwei Finger drehen/zoomen, Skizze und langes Tippen für das Kontextmenü) testen.

## Bauteil im Tab öffnen (Auto [A-083], BG-01)

- [x] **Bauteil in Baugruppe per Doppelklick im Tab öffnen**: Eine Baugruppe mit zwei eingesetzten Instanzen eines Bauteils (`Leiste`, `40 × 20 × 10 mm`) zeigt für beide `40 mm` Hüllmaß; Doppelklick im 3D-Bild auf das Teil öffnet `Leiste` in einem eigenen Tab samt Banner `#asm-part-banner` („Speichern“ / „Zurück zur Baugruppe“).
- [x] **Speichern aktualisiert Baugruppe (Länge 40 → 60 & Tab-Wechsel 60 → 75)**: Nach Änderung der Quaderbreite auf `60 mm`, Klick auf `#asm-save-btn` und `#asm-back-btn` zeigen beide Instanzen in der Baugruppe das neue Hüllmaß `60 mm` (bei erhaltener Position); ein Doppelklick im Verlauf wechselt ohne Duplikat in denselben Bauteil-Tab und übernimmt `75 mm` beim direkten Klick auf den Baugruppen-Tab.
- [x] **Einstiegspunkte, Suche & Hilfe**: Rechtes Panel (`#partref-sec` / `#btn-open-part-tab`), Rechtsklick-Menü (`#cm-open-part-tab`), Befehlssuche („Bauteil im Tab öffnen“, „Neue Baugruppe anlegen“) und Hilfetext `assemblyPartTab` sind vorhanden.
- [ ] **Von Hand**: Im Browser über „+“ → „Neue Baugruppe“ eine Baugruppe anlegen, ein gespeichertes Bauteil über „Bauteil in Baugruppe einfügen …“ zweimal platzieren, per Doppelklick im Tab ändern, über das Banner speichern/zurückspringen und die aktualisierte Darstellung prüfen.

## Verbindungen Kugel und Stift im Langloch (Auto [A-087], BG-06)

- [x] **Stift im Langloch (20 mm) mit Endanschlägen**: Ein gekippter Stift wird per `Joints.addSlot` auf die automatisch erkannte 20-mm-Mittellinie eines Langlochs (`slotHole` `26 × 6 mm`) ausgerichtet; beim Ziehen weit über beide Enden hinaus (`+35 mm` / `-45 mm`) sowie beim Ändern der Lage-Felder (`#t-x`/`#t-y`) bleibt der Stift exakt auf der Mittellinie und stoppt am Anschlag (`+10 mm` / `-10 mm`).
- [x] **Kugel (Drehen frei)**: `Joints.addBall` legt zwei gewählte Punkte deckungsgleich aufeinander (`< 0,01 mm`); freies Drehen um X/Y/Z (`#jt-rx`/`#jt-ry`/`#jt-ang`), 3D-Ziehen mit der Maus und Verschiebe-Eingaben (`#t-x`/`#t-z`) halten den Gelenkpunkt exakt zusammen.
- [x] **Abspielen, Suche & Hilfetexte**: „Bewegung abspielen“, Rückgängig, Befehlssuche (`mate-ball`, `mate-slot`) und Hilfetexte (`mateBall`, `mateSlot`) arbeiten ohne Fehler.
- [ ] **Von Hand**: Im Browser zwei Teile über Kontextleiste → „Verbindung“ → „Kugel“ bzw. „Stift im Langloch“ durch Anklicken im 3D-Bild verbinden, über das Langloch-Ende hinausziehen und das Kugelgelenk drehen.

## Verbindungen zylindrisch und eben (Auto [A-086], BG-06)

- [x] **Zylindrisch (Welle in Bohrung)**: Ein gekippter, versetzter Bolzen wird per `Joints.addCylindrical` auf eine Bohrung ausgerichtet; beide Zylinderachsen fallen deckungsgleich zusammen (`|d1 · d2| > 0,99999`, Achsabstand `< 0,01 mm`). Drehen (`#jt-ang`), Schieben (`#jt-pos`), seitliche Lage-Eingabe (`#t-x` wird auf die Achse zurückgeführt) und „Richtung umkehren“ (`#jt-flip`) erhalten die Achsen-Deckung; „Bewegung abspielen“ bewegt Bolzen im Bild ohne `App.revision` zu ändern.
- [x] **Eben (Fläche auf Fläche)**: Ein versetzter Block wird auf eine um `20°` geneigte Platte per `Joints.addPlanar` bündig gelegt (Abstand `< 0,01 mm`, entgegengesetzte Normalen). Verschieben in `U`/`V` (`#jt-u`/`#jt-v`), Drehen (`#jt-ang`), Ändern von `#t-z`/`#t-x` sowie Ziehen mit der Maus im 3D-Bild halten den Flächenabstand exakt bei `0`; „Bewegung abspielen“ gleitet und dreht in der Ebene, Rückgängig, Befehlssuche und Hilfetexte (`mateCyl`, `matePlanar`) funktionieren ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser zwei Teile über Kontextleiste → „Verbindung“ → „Zylindrisch“ bzw. „Eben“ durch Anklicken zweier Flächen im 3D-Bild verbinden und mit der Maus im Bild verschieben sowie abspielen.

## Verbindung „fest“ (Auto [A-085], BG-05)

- [x] **Zwei Flächen bündig verbinden**: Zwei Quader wählen → „Verbinden: fest“ → obere Fläche von A und untere Fläche von B anklicken legt B mittig und mit Abstand `0 mm` genau auf A.
- [x] **Gesperrt & Mitwandern**: Das verbundene Teil B lässt sich weder per Maus, Ziehgriffen, Pfeiltasten noch über die Lage-Felder oder `dropToPlate` verschieben; beim Verschieben von A wandert B exakt mit.
- [x] **Verlauf, Bearbeiten & Umdrehen**: Die Verbindung erscheint unter „Verbindungen“ im Verlauf, öffnet rechts das Bearbeitungs-Panel und dreht Teil B per „Umdrehen“ sauber auf die Gegenseite und zurück.
- [x] **Punkt-an-Punkt, Löschen & Rückgängig**: Zwei gewählte Punkte fallen deckungsgleich zusammen; Löschen im Verlauf gibt Teil B wieder frei, `Strg+Z` stellt die Verbindung wieder her; Befehlssuche und Hilfetext `fixedJoint` sind vorhanden.
- [ ] **Von Hand**: Im Browser zwei Teile über „Verbinden: fest“ (Modus Auto / Fläche / Punkt) verbinden, während der Auswahl die Ansicht mit der rechten Maustaste drehen, Drehwinkel/Abstand rechts testen und das Ergebnis mit mehreren verketteten Teilen prüfen.

## Volltest-Reparatur (Auto [F-11241523])

- [x] **Griff-Schilder bei Frontansicht & Alt-/Rechtsklick**: In der Frontansicht zweier hintereinander liegender Quader weicht das Tiefenschildchen seitlich aus, sodass die Körpermitte frei für `Alt + Klick` bleibt; Alt-Klick und Rechtsklick auf Griff-Schilder wechseln zum Teil dahinter bzw. öffnen das Kontextmenü ohne Zahleneingabe (`t_dahinter`, `[F-11241523]`).
- [x] **Skizze ohne 3D-Ansichtsknöpfe**: Im Skizzen-Modus ist `.view-btns` per CSS ausgeblendet (`body.sketching .view-btns`), sodass rechts liegende Linien im Verschieben-Werkzeug (`H`) frei anklickbar sind (`t_skizze_verschieben`, `[F-11241523]`).
- [x] **Zeitleiste sofort bei Bauteil-Wechsel**: `Timeline` reagiert auf `App.on('ctx')` und `App.on('peek')` synchron ohne 30-ms-Entprell-Verzug (`t_bauteil`, `[F-11241523]`).
- [ ] **Von Hand**: In der Frontansicht auf einem Quader `Alt + Klick` und Rechtsklick auf ein Maßschild prüfen, in eine Skizze wechseln (Ansichtsknöpfe rechts unten bleiben ausgeblendet) und über „Neues Bauteil“ die leere Bauteil-Zeitleiste prüfen.

## Verbindungen parallel, tangential, mit Abstand (Auto [A-088], BG-07)

- [x] **Abstand zwischen zwei Flächen (`5 → 12 mm` & Formeln)**: Zwei Quader mit `addDistance(..., 5)` liefern gemessen `5,0 mm` (`Measure.minDistance` und Flächenabstand); Änderung über `#jt-dist` auf `12` ergibt `12,0 mm`; Formel `spalt + 2` mit Maß `spalt = 8` → `10,0 mm`, nach Maßänderung `spalt = 15` automatisch `17,0 mm`.
- [x] **Parallel (`addParallel`)**: Zwei ebene Flächen werden parallel ausgerichtet (`|nA · nB| > 0,99999`), ohne die Lage zu verschieben; freies Verschieben in X/Y/Z bleibt erhalten, Kippen wird zurückgeführt und „Richtung umkehren“ (`#jt-flip`) dreht die Normale um `180°`.
- [x] **Tangential (`addTangent`)**: Ebene Fläche an Zylinder (`d = 16`, `r = 8`) berührt in beiden Reihenfolgen (`Ebene→Zylinder` und `Zylinder→Ebene`) mit `minDist < 0,02 mm`; „Seite umkehren“ spiegelt auf `-8,0 mm`, Durchmesseränderung auf `24` führt automatisch auf `12,0 mm` nach.
- [x] **Kombinierbar & Konfliktschutz**: `planar` (`Z = 0`) + `distance` (`6 mm` in X) gelten gleichzeitig (Verschieben in Y frei, X/Z gehalten, Änderung auf `11 mm` wirkt); ein widersprüchlicher zweiter Abstand wird sauber abgelehnt (`ok: false`).
- [x] **Verlauf, Rückgängig, Befehle & Hilfetexte**: Verbindungen erscheinen in `#joint-tree`, lassen sich per `Strg+Z` rückgängig machen und löschen; Befehlssuche (`mate-parallel`, `mate-tangent`, `mate-distance`) und Hilfetexte (`mateParallel`, `mateTangent`, `mateDistance`) sind ohne Seitenfehler vorhanden.
- [ ] **Von Hand**: Im Browser zwei Teile über Kontextleiste → „Verbindung“ → „Parallel“, „Tangential“ und „Abstand“ (inkl. Eingabefeld `#jp-dist` in der oberen Leiste) verbinden, im 3D-Bild ziehen und die orange Abstandslinie im Verlauf prüfen.

## Unterbaugruppen und Teil festsetzen (Auto [A-084], BG-03, BG-04)

- [x] **Unterbaugruppe einsetzen & verschieben**: Eine gespeicherte Unterbaugruppe mit 2 Bauteilen lässt sich über „Bauteil einsetzen“ in eine Hauptbaugruppe einfügen, im Verlauf aufklappen, gegen Zyklen absichern, beim Verschieben gemeinsam mit beiden Teilen bewegen und übersteht Neuladen aus IndexedDB.
- [x] **Teil festsetzen & Schloss im Verlauf**: Rechtsklick → „Festsetzen“ (`#cm-ground` / `#tm-ground`) setzt `locked`, zeigt ein Schloss-Symbol (`.lock-mark`) im Verlauf, deaktiviert Lage-Felder und schützt das Teil vor Mausziehen, Pfeiltasten, Dreh-/Ausrichte-Aktionen sowie Verbindungen/Gelenken.
- [x] **Lösen, Rückgängig, Suche & Hilfe**: „Festsetzen lösen“ gibt das Teil wieder frei, `Strg+Z` stellt den Zustand wieder her, und Befehlssuche sowie Hilfetexte (`subAssembly`, `groundPart`) sind vorhanden.
- [ ] **Von Hand**: Im Browser eine Unterbaugruppe mit mehreren Teilen einsetzen, im 3D-Bild mit der Maus verschieben, ein Grundteil per Rechtsklick festsetzen und danach mit einem weiteren Teil per „Verbinden: fest“ verknüpfen.

## Andock-Punkte und Einrasten beim Ziehen (Auto [A-090], BG-08)

- [x] **Andock-Punkte sichtbar & Schraube in Bohrung (Einfach)**: Beim Ziehen einer geneigten M3-Schraube zeigen sich Loch-, Flächen- und Kantenmitten an der gelochten Platte; über der Bohrung rastet die Schraubenachse deckungsgleich in der Bohrungsachse ein (`z = 6 mm`), legt im Modus „Einfach“ automatisch eine feste Verbindung an und wandert beim Verschieben der Platte mit.
- [x] **Verbindungs-Auswahl im Profi-Modus**: Beim Loslassen einer Schraube auf der zweiten Bohrung erscheint `#dock-joint-pop` mit „Fest“, „Zylindrisch“, „Drehen“ und „Nur einrasten“; Wahl von „Zylindrisch“ legt die zylindrische Verbindung deckungsgleich auf der Bohrungsachse an.
- [x] **Flächenmitte, „Nur einrasten“ & Strg**: Ein Quader rastet auf der Flächenmitte der Platte ein, bietet „Eben“ und „Nur einrasten“ an, legt bei „Nur einrasten“ keine Verbindung an und ignoriert bei gedrücktem `Strg` die Andock-Punkte; Hilfetext `dockSnap` ist vorhanden und es treten keine Seitenfehler auf.
- [ ] **Von Hand**: Im Browser eine Baugruppe mit gelochter Platte und Normschraube öffnen, die Schraube per Maus über verschiedene Löcher und Kanten ziehen, die farbigen Andock-Punkte und das Einrasten prüfen und im Modus „Profi“ verschiedene Verbindungsarten ausprobieren.

## Verbindungen mit Winkel und mittig (Auto [A-089], BG-07)

- [x] **Winkel 30° zwischen zwei Flächen & Messen**: Zwei Quader über Kontextleiste → „Verbindung“ → „Winkel“ auf `30°` ausrichten; `Joints.measureAngle`, Normalen-Winkel und das Werkzeug „Messen“ zwischen beiden Flächen liefern exakt `30°`. Ändern über `#jt-angle` auf `45°` und „Winkel umkehren“ (`#jt-flip`) richten den zweiten Quader nach.
- [x] **Formel-Winkel & Kante-an-Kante**: Ein Maß `Neigung = 30` in `#jt-angle` legt die Formel ab (`.fx`-Vorschau `30`), und das Ändern des Maßes auf `60` dreht das verbundene Teil automatisch auf `60°`; zwei gerade Kanten richten sich auf `30°` aus.
- [x] **Quader mittig in 20-mm-Nut**: Ein schmaler Quader (`8 mm`) wird mittig zwischen die beiden Seitenwände einer `20 mm` breiten Nut gesetzt; links und rechts ergibt sich exakt derselbe Abstand (`6,00 mm`), der auch beim Verschieben entlang/quer zur Nut, beim Verschieben des Nut-Blocks und im 2-Flächen-Modus (`bMode: 'faces'`) erhalten bleibt.
- [x] **Verlauf, Löschen, Rückgängig, Suche & Hilfe**: Verbindungen erscheinen im Verlauf unter `#joint-tree`, lassen sich rechts bearbeiten, per `#jt-del` lösen und per `Strg+Z` wiederherstellen; Befehlssuche (`mate-angle`, `mate-center`) und Hilfetexte (`mateAngle`, `mateCenter`) sind ohne Seitenfehler vorhanden.
- [ ] **Von Hand**: Im Browser zwei Körper über „Verbindung“ → „Winkel“ (Fläche/Kante) bzw. „Mittig“ (Nutwand 1, Nutwand 2, Teil) durch Anklicken im 3D-Bild verbinden und im Panel rechts Winkel/Formel sowie die angezeigten Nutabstände prüfen.

## Durchdringungen der ganzen Baugruppe als Liste (Auto [A-092], BG-10)

- [x] **3 Teile, 2 überlappen um 1000 mm³**: Klick auf „Durchdringungen suchen“ (`#proj-clashes`) liefert genau einen Eintrag (`Teil A – Teil B`) mit Volumen `≈ 1000 mm³` und berechnetem Schnittnetz.
- [x] **Anspringen & rote 3D-Hervorhebung**: Klick auf den Eintrag fährt die Kamera direkt zum Überschneidungskörper (`[5, 5, 5]`), wählt beide Teile aus und zeigt die Schnittform rot im Overlay (`#0xe5484d`).
- [x] **Berührende Flächen & „Noch mal“**: Nach Verschieben auf bündiges Berühren (`Abstand = 0`) erscheint der Hinweis auf Modelländerung; „Noch mal“ meldet „Keine Durchdringungen“.
- [x] **Echte Baugruppe mit Verweisen (`ref`), Suche & Hilfe**: In einer Baugruppe (`docType: 'assembly'`) mit 3 eingesetzten `ref`-Instanzen findet `#t-clashes` exakt das überlappende Paar (`≈ 1000 mm³`); Prüfen-Menü, Befehlssuche (`clash-check`) und Hilfetext (`clashCheck`) arbeiten ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser eine Baugruppe mit mehreren leicht überlappenden und berührenden Teilen öffnen, auf „Durchdringungen suchen“ klicken, einen Listeneintrag anklicken und prüfen, ob die Kamera zur Stelle springt und die Überschneidung rot durchschimmert.

## Volltest-Reparatur (Auto [F-11241729])

- [x] **Meldungen überleben Rechenphasen**: `UI.toast()` wird während aktiver `UI.busy()`/`App.busy`-Berechnungen (sowohl davor als auch währenddessen ausgelöst) nicht vorzeitig ausgeblendet und läuft erst nach `UI.busy(false)` ab (`t_verbund_ohne_ki`, `[F-11241729]`).
- [x] **Startseiten-Karte neben Baugruppe**: `.start .card.new:not(.asm) b` wählt neben `#start-card-new-asm` eindeutig die Leerprojekt-Karte und reagiert auf `I18n.set` (`t_a019_uebersetzbare_oberflaeche`, `[F-11241729]`).
- [x] **Tablet-Kontext auf Deutsch**: Ein Touch-Kontext mit `locale='de-DE'` startet im `tablet`-Modus mit `I18n.lang === 'de'` und „Leeres Projekt“ (`t_a080_tablet`, `[F-11241729]`).
- [ ] **Von Hand**: Bei einem schweren „Mach alles als Verbund“-Auftrag prüfen, ob die Toast-Meldung nach Abschluss der Berechnung noch sichtbar bleibt und sich danach sauber ausblendet.

## Teil ersetzen und aus Datei einfügen (Auto [A-094], BG-13)

- [x] **Teil mit fester Verbindung ersetzen (`Kurz` → `Lang`)**: Rechtsklick im 3D-Bild (`#cm-replace-part`) tauscht das fest verbundene Teil (`12×12×10`) gegen ein längeres (`12×12×35`); die feste Verbindung bleibt erhalten, beide Flächen sitzen weiter bündig aufeinander (`dz < 0,05 mm`), das neue Hüllmaß stimmt und beim Verschieben des Basisteils wandert das ersetzte Teil mit.
- [x] **Durch STEP-Datei ersetzen & Rückgängig**: Tausch gegen eine STEP-Datei (`50×15×12`) übernimmt das neue Hüllmaß samt bestehender fester Verbindung (`kind: 'import'`); unpassende Verbindungen (z. B. beim Tausch gegen eine Kugel ohne ebene Flächen) werden sauber entfernt, und ein `Strg+Z` stellt das vorige Teil samt Verbindung wieder her.
- [x] **Aus Datei einfügen (STEP & Tracery-Projekt)**: `#t-insert-file` / `#asm-insert-file-input` fügen sowohl eine STEP-Datei (`50×15×12`) als auch eine `.tracery.json`-Projektdatei (`24×18×14`, als verknüpfter `ref`) ins laufende Modell ein; Hilfetexte (`replacePart`, `insertFromFile`), DE/EN-Schlüsselgleichheit und Befehlssuche (`replace-part`, `insert-from-file`) sind ohne Seitenfehler vorhanden.
- [ ] **Von Hand**: Im Browser eine eigene STEP-Datei per „Aus Datei einfügen …“ in eine Baugruppe laden, mit einem anderen Teil fest verbinden und anschließend über Rechtsklick → „Teil ersetzen …“ gegen ein anderes Bauteil austauschen.

## Teile mit der Maus bewegen, Verbindungen rechnen mit (Auto [A-091], BG-09)

- [x] **Drehgelenk beim Ziehen mit der Maus**: Zwei Arme über ein Drehgelenk verbunden (`Arm A` festgesetzt, `Arm B` frei); Ziehen am freien Ende von `Arm B` dreht den Arm um die Gelenkachse, der Gelenkpunkt bleibt exakt an seiner Stelle (`< 0,01 mm`), der festgesetzte Arm bewegt sich nicht.
- [x] **Anschlag, Lage-Felder & Rückgängig**: Ziehen über den Anschlag (`+120°`) stoppt exakt am Anschlag; Änderungen über `#t-x` projizieren zurück auf das Gelenk, und `Strg+Z` stellt die vorige Stellung wieder her.
- [x] **3er-Kette & Schiebegelenk**: Ziehen am mittleren Arm nimmt den dritten Arm samt zweiter Gelenkachse exakt mit; Ziehen am dritten Arm lässt den mittleren Arm stehen. Ein Teil am Schiebegelenk gleitet beim schrägen Ziehen nur entlang der Führungsachse, während Ziehen der ungesperrten Schiene das verbundene Teil mitnimmt.
- [x] **Festgesetztes Kind (umgekehrtes Ziehen)**: Ist das Kind-Teil (`Arm B`) festgesetzt und wird das Elternteil (`Arm A`) gezogen, bleibt `Arm B` exakt stehen, während `Arm A` um das Gelenk dreht.
- [ ] **Von Hand**: Im Browser zwei oder drei Teile über Dreh-, Schiebe- und Kugelgelenke verketten, am freien Ende mit der Maus ziehen (inkl. sichtbarem Gelenk-Overlay während des Ziehens) und prüfen, dass sich alles flüssig ohne Ruckeln mitbewegt.

## Eigenschaften je Teil (Auto [A-093], BG-12)

- [x] **Teileigenschaften im Panel rechts**: Für Teile oberster Ebene erscheinen Teilenummer (`#p-partno`), Preis (`#p-price`), Lieferant (`#p-supplier`) und Beschreibung (`#p-desc`) unter `#part-props-sec` und werden rückgängig machbar in `it.props` gespeichert; ungültige Preiseingaben markieren das Feld als `.invalid`.
- [x] **Stückliste mit Spalten & Gesamtpreis**: Zwei Teile mit Preis `2,50 €` (zweimal vorhanden) und `4,00 €` (einmal vorhanden) zeigen in `Mass.bom()` und im Stücklisten-Dialog (`#bom`) alle Spalten sowie den Gesamtpreis `9,00 €` in `#bom-total-price` und `#bom-price-sum`.
- [x] **CSV-Export, Rückgängig, Speichern/Laden & Hilfe**: `Mass.bomCSV()` enthält die Spalten `Teilenummer`, `Beschreibung`, `Lieferant`, `Preis je Stück (€)`, `Preis gesamt (€)` samt `9,00` in der Summenzeile bei einheitlicher Spaltenzahl; Undo/Redo, JSON-Roundtrip und Hilfetext `partProps` arbeiten ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser zwei Teile mit Teilenummer, Beschreibung, Lieferant und Preis versehen, die Stückliste öffnen, eine Zeile zum Auswählen anklicken und die gespeicherte `.csv`-Datei in Excel oder Numbers prüfen.

## Koordinatenmaße, Bogenlänge & Winkel über drei Punkte (Auto [A-095], SK-27, SK-28)

- [x] **Bogenlänge (`arcLen`)**: Im Maß-Werkzeug (D → „Bogenlänge“) einen Kreisbogen auf Länge `30` bemaßen → `SK.measure(…, 'arcLen')` ist `30`, Schild zeigt `⌒ 30`; Änderung über `#se-arcLen` auf `25` und Rückgängig zurück auf `30`.
- [x] **Winkel über drei Punkte (`ang3`)**: Drei Punkte (Endpunkt, Scheitelpunkt, Endpunkt) auf `60°` bemaßen → gemessener Winkel `60°`, Schild zeigt `60°`, nachträgliches Ändern auf `120°` zieht den Winkel nach.
- [x] **Koordinatenmaße (Profi, `ord`)**: Nullkante wählen, drei Punkte fortlaufend mit `15`, `25` und `-10` bemaßen → X-Werte folgen samt `0`-Markierung an der Nullkante; im Modus „Einfach“ ausgeblendet, Rückgängig (`Strg+Z`) und Hilfetexte (`dimModes`, `ordinateDim`) ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser im Profi-Modus beim Werkzeug „Maß“ (D) zwischen „Bogenlänge“, „Winkel über 3 Punkte“ und „Koordinatenmaße“ umschalten und die ausgerichteten Hilfslinien sowie den Umschalter `⌒`/`R` am Bogen prüfen.

## Maß zwischen Kreisrändern, Skizze sperren & Drehachse markieren (Auto [A-096], SK-29, SK-54, SK-55)

- [x] **Maß zwischen Kreisrändern (`distCC`)**: Zwei Kreise (`r = 5`, Mittenabstand `30`) mit Modus „Kleinster Abstand“ bemaßt → Maßfeld zeigt `20`, Schild `min 20`; Änderung auf `15` zieht die Kreismitte nach (`25`), Umschalten auf `max` (`40`) und `center` (`30`) sowie `Strg+Z` arbeiten exakt.
- [x] **Skizze sperren (`sketch.locked`)**: Schloss `#sk-lock` sperrt die Skizze (`#sk-lock-badge` sichtbar); Ziehen am Kreisrand ändert die Lage nicht, `Entf` löscht nichts; nach Entsperren lässt sich der Kreis wieder ziehen; gespeicherte Sperre bleibt nach Fertigstellen und erneutem Öffnen erhalten.
- [x] **Drehachse markieren (`e.revAxis`)**: Linie mit `#se-rev-axis` als Drehachse markiert (ohne Warnung zu offenen Enden); „Fertig“ öffnet „Drehen“ direkt mit dieser Linie (`axisEnt`), der entstandene Drehkörper dreht um `x = 5` mit dem exakten Volumen.
- [ ] **Von Hand**: Im Browser zwei Kreise zwischen Mitte, kleinstem und größtem Abstand umschalten, die gesperrte Skizze am Schloss sperren/entsperren und eine markierte Drehachse beim Drehen optisch prüfen.

## Volltest-Reparatur (Auto [F-11241932])

- [x] **Fokussiertes Toleranzfeld überlebt verzögerten doc-Refresh**: Quader `50×40×12` in der Zeichnung, Maß `50` gewählt, auf `dev` umgeschaltet und während `350 ms` Wartezeit in `#dw-tol-upper` (`'0,25'`) fokussiert geblieben → Eingabefeld-DOM-Knoten und Wert `'0,25'` bleiben über den 150-ms-`refreshSoonDoc`-Timer erhalten (`t_f11241932`).
- [x] **Eingabe übernehmen & Undo-Refresh ohne Fokus**: `Enter` übernimmt `+0,25` exakt ins SVG und Datenmodell (`Drawing.getDimTol`), `App.undo()` nach Fokusverlust aktualisiert SVG (`+0,05`) und Panel (`'0,05'`) ohne Fehler (`t_f11241932`, `t_a068_toleranzen_passungen`).
- [ ] **Von Hand**: In der Zeichnung an einem Maß zwischen verschiedenen Toleranzarten wechseln und direkt zügig Werte in oberes/unteres Abmaß eintippen, ohne dass beim Tippen der Fokus oder Text verloren geht.

## Teil-Ellipse und Formen-Sammlung (Auto [A-097], SK-37, SK-41)

- [x] **Formen-Sammlung (Stern mit 5 Zacken → geschlossener Körper)**: Im Modus „Einfach“ im Skizzen-Panel über `#sk-shapes` einen Stern mit `n = 5`, `ro = 20`, `ri = 8` über `#sh-insert` eingefügt (`10` Linien, `1` geschlossene Region, `0` offene Enden) und hochgezogen → `1` geschlossener Körper mit exakt passendem Volumen (`5 * ro * ri * sin(π/5) * 3`).
- [x] **Elliptischer Bogen (`ellarc`) mit Halbachsen**: Werkzeug `ellarc` per Leiste gewählt, Mittelpunkt geklickt und Halbachsen `25 Tab 12` eingetippt → `rx === 25`, `ry === 12` mit festen Maßen; Änderung über `#se-rx` (`30`) und `#se-ry` (`15`), mit Linie geschlossen und hochgezogen → geschlossener Körper mit Halb-Ellipsen-Volumen.
- [x] **Elliptischer Bogen per 5 Mausklicks, Richtung umkehren & alle weiteren Formen**: Gedrehter elliptischer Bogen per 5 Klicks samt `#se-ellarc-flip` und Rückgängig; Pfeil, Herz, Zahnrad-Umriss (mit Bohrung) und Schlüsselloch mit geänderten Maßen erzeugen jeweils `1` geschlossene Region ohne offene Enden und lassen sich gemeinsam zu `4` Körpern hochziehen; Hilfetexte `ellipseArc` und `sketchShapes` vorhanden.
- [ ] **Von Hand**: Im Browser eine gedrehte Teil-Ellipse mit 5 Klicks aufziehen, Enden schließen und alle 5 Formen aus „Formen-Sammlung“ über „Im Bild platzieren“ frei absetzen und hochziehen.

## Kurve aus Formel und aus Tabelle (Auto [A-098], SK-38, SK-39)

- [x] **Nur im Profi-Modus sichtbar**: In „Einfach“ sind `#sk-formula` und `#sk-csv` ausgeblendet, nach Umschalten auf „Profi“ erscheinen beide Abschnitte im Skizzen-Panel.
- [x] **Kurve aus Formel (`y = sin(x)`, Evolvente & geschlossener Körper)**: `y = sin(x)` von `0` bis `2π` (`41` Punkte, Spline) geht exakt durch `(π/2, 1)`, `(0, 0)` und `(2π, 0)` und lässt sich mit `Strg+Z` zurücknehmen; Vorlage „Evolvente“ füllt `x(t), y(t)` aus und erzeugt die Zahnradflanke; ungültige Formeln melden den Fehler und sperren `#fc-insert`; geschlossener parametrischer Kreis (`10*cos(t)`, `10*sin(t)`) zieht sauber zum 3D-Körper hoch.
- [x] **CSV mit 5 Punkten → Spline durch alle 5 & geschlossener Linienzug**: Hochgeladene `.csv` mit 5 Punkten erzeugt eine `spline` genau durch alle 5 Punkte; eingefügter Semikolon/Dezimalkomma-Text als geschlossener Linienzug ergibt `5` Linien, `1` Region ohne offene Enden und den exakten 3D-Körper; Hilfetexte (`formulaCurve`, `csvCurve`), DE/EN-Schlüsselgleichheit und Befehlssuche sind ohne Fehler vorhanden.
- [ ] **Von Hand**: Im Browser eine eigene Formel eintippen (z. B. Parabel mit Projektmaß) und die gestrichelte Live-Vorschau beim Ändern von Bereich und Punktzahl sowie das Ziehen einer `.csv`-Datei direkt in die offene Skizze prüfen.

## Schwerpunkt als Bezugspunkt, Ebenen ziehen & einfärben, Ebenen-Schar (Auto [A-099], BZ-11, BZ-12, BZ-13)

- [x] **Schwerpunkt als Bezugspunkt (BZ-11)**: Bezugspunkt „Im Schwerpunkt“ eines Quaders `40×20×10` liegt exakt in der Mitte (`[20, 10, 5]`), wandert bei Größen-/Lageänderung auf `[30, 10, 10]` und bei asymmetrischem Körper mit exzentrischer Bohrung exakt in den Volumenschwerpunkt mit, meldet fehlenden Körper und übersteht Rückgängig.
- [x] **Bezugsebene größer ziehen & einfärben (BZ-12)**: Gewählte Bezugsebene zeigt 4 Ecken-Griffe (`handlePositions()`), Ziehen eines Griffs mit der Maus vergrößert `d.size` rückgängig machbar; Breiten-/Höhenfelder, „Auto-Größe“, Farb-Knöpfe und „Standardfarbe“ aktualisieren 3D-Fläche und Verlaufssymbol.
- [x] **Ebenen-Schar (BZ-13)**: Im Dialog „Ebenen-Schar“ (`#dp-series`) erzeugen `4` Ebenen mit Abstand `10` exakt `4` Ebenen bei `10, 20, 30, 40` in einem Rückgängig-Schritt; Schar ab Körperfläche wandert beim Wachsen mit, und `flip: true` erzeugt negative Abstände (`-10, -20, -30`).
- [x] **Befehlssuche, Hilfetexte & Seitenfehler**: `datum-series` und `datum-point-com` sind suchbar; Hilfetexte `datumPointCom`, `datumStyle` und `datumSeries` sind vollständig ohne JavaScript-Fehler vorhanden.
- [ ] **Von Hand**: Im Browser eine Bezugsebene schräg im 3D-Bild an einer Ecke größer ziehen, einfärben, danach eine Ebenen-Schar ab einer Körperfläche anlegen und den Schwerpunkt-Punkt an einem zusammengesetzten Teil prüfen.

## Körper als Schritt löschen & Messwert als Maß (Auto [A-100], KP-51, KP-53)

- [x] **Körper als Schritt löschen (KP-51)**: Klick auf „Als Schritt löschen“ entfernt den Zielkörper aus Szene und Volumen (`8000` statt `16000`); `#db-suppress` schaltet den Schritt ab und holt den Körper wieder zurück; Marker vor dem Schritt stellt ihn ebenfalls wieder her; frühere versetzte Kopien vor dem Löschen bleiben sichtbar und Reihenfolge-Validierung lehnt das Verschieben vor den Zielkörper ab.
- [x] **Messwert als Maß & Mitwandern (KP-53)**: Knopf `#p-h-meas` („aus Messung“) und Klick auf eine 40-mm-Kante eines anderen Quaders legt einen verknüpften Messwert-Parameter an und setzt die Höhe auf `40`; Änderung der Quader-Breite auf `50` führt Parameter und abhängige Höhe automatisch auf `50` (Volumen `11250`) mit; Formeln (`Messung_1 / 2`) und ein gemeinsames `App.undo()` funktionieren.
- [x] **Maße-Panel, verlorener Bezug & Lösen**: Tab „Maße“ zeigt `.meas-param-info`; Löschen der Quellkante markiert den Parameter als verloren (`lost`), nach Wiederherstellung erholt er sich und „Lösen“ entfernt die Verknüpfung; Hilfetexte (`deleteBody`, `measureParam`), DE/EN-Schlüsselgleichheit, Befehlssuche und Erklärtext sind vorhanden.
- [ ] **Von Hand**: Im Browser an einem beliebigen Maßfeld auf das Lineal-Symbol klicken, eine schräge oder runde Kante im 3D-Bild anfahren (Vorschau-Linie prüfen), anklicken und anschließend über „Neu wählen“ eine andere Kante zuweisen.

## Feder und Spirale (Auto [A-101], KP-32)

- [x] **Zylinder-Feder Ø20, Draht 2, 5 Windungen, Steigung 5**: Über `#t-body` → `#add-helix` angelegt → Höhe `≈ 27 mm` (`25 + 2`), Durchmesser `≈ 22 mm` (`20 + 2`), exaktes Volumen innerhalb `±2 %` von `π·1²·5·√((20π)²+5²)` ohne Kernfehler.
- [x] **Höhe/Windungen, Höhe/Steigung & Formel**: Umschalten zwischen `heightTurns` (Höhe `40` → `≈ 42 mm`), `heightPitch` (Steigung `4` → `10` Windungen) und Projektmaß `D_Feder = 24` als Formel in `#hx-d` zieht Durchmesser (`≈ 26 mm`) und Volumen exakt nach.
- [x] **Kegel-Feder & flache Spirale**: Kegel-Feder (`r1 = 12`, `r2 = 6`, `4` Windungen, Steigung `5`, Draht `2`) baut mit Höhe `≈ 22 mm` und Volumen innerhalb `±2 %`; flache Spirale (`r1 = 5`, `r2 = 20`, `3` Windungen, Draht `2`) baut flach (`dz ≈ 2 mm`) mit Volumen innerhalb `±2 %`.
- [x] **Rechteck-Profil, Linksgängig & Einfach-Modus**: Rechteck-Querschnitt (`3 × 1,5 mm`), linksgängige Richtung und `App.undo()` arbeiten fehlerfrei; im Modus „Einfach“ bleibt `#t-body` bei `6` Kacheln, `#add-helix` legt eine fertige Feder mit schlankem Panel an.
- [x] **Hilfen, Befehle, Erklärtext & DE/EN-Schlüssel**: `HELP.helix`, `werkzeug-hilfen.json`, `Explain.local`, `Commands.search('feder')` und `texte-de.json`/`texte-en.json` sind vollständig ohne JavaScript-Fehler.
- [ ] **Von Hand**: Im Browser eine Kegel-Feder und eine flache Spirale mit eigener Skizze als Querschnitt ausprobieren sowie im Modus „Einfach“ eine fertige Feder über das Körper-Menü einfügen und per Zahleneingabe anpassen.

## Entlang Pfad mit Verdrehung und als Schnitt (Auto [A-102], KP-28, KP-29)

- [x] **Quadrat 10×10 entlang 100-mm-Linie mit 90° Verdrehung**: Direkt über Skizze + `.stepbox` (`#st-mode-sweep`, `#st-sweep-shape='rect'`, `10 × 10`, `#st-sweep-twist=90`) angelegt → Volumen `10000 mm³` (±2 %), Mittelquerschnitt `14,14 × 14,14 mm` und alle 4 Längskanten drehen exakt um `+90°` um den Pfad.
- [x] **Rechteck 10×4, Gegendrehung (−90°), Zurück auf 0° & gekrümmte Kurve**: Startfläche `10 × 4`, Endfläche um `90°` gedreht `4 × 10`; `#p-twist = -90°` dreht um `−90°`, `0°` stellt `10 × 4` wieder her; gekrümmter Spline-Pfad mit `90°` Verdrehung baut fehlerfrei.
- [x] **Nut entlang Kurve als Schnitt & Modus-Umschaltung**: Offener Spline-Pfad auf Oberseite eines `60 × 40 × 20`-Quaders mit `#st-sweep-op='cut'` (`6 × 6`) schneidet sofort eine Nut und verringert das Volumen deutlich (`< 47600 mm³`); Umschalten über `#op-type` (`new`/`cut`), Kombination mit `#p-twist = 45°` und `App.undo()` arbeiten fehlerfrei.
- [x] **Hilfen, Befehle, Erklärtext & DE/EN-Schlüssel**: `sweep`, `sweepTwist`, `sweepCut` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit, `Commands.search('nut')` / `Commands.search('verdrehung')` und `Explain.local` sind vollständig ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser eine gebogene Kurve als Pfad mit eigener Skizzenform und Verdrehung sowie eine verdrehte Nut auf einer Körperfläche samt Live-Vorschau ausprobieren.

## Rechnen abbrechen und Meldungs-Zentrale (Auto [A-107], BE-27, BE-25)

- [x] **Abbrechen ab > 2 s & letzter guter Stand bleibt**: Künstlich langsamer Schritt (`_testDelayMs: 6000`) zeigt unter 2 s noch kein `#status-cancel`, blendet ab > 2 s „Abbrechen“ ein, stoppt die Berechnung nach Klick sofort (`< 2,5 s`) und hält Dokument, Rückgängig-Stand und 3D-Ansicht beim letzten guten Quader; ein neuer Zylinder danach rechnet fehlerfrei.
- [x] **Meldungs-Zentrale (Glocke `#status-bell`)**: Sammelt Rechenfehler, Abbruch-Hinweis und Info-Meldungen mit `HH:MM:SS`-Uhrzeit, zeigt Ungelesen-/Fehler-Badge, filtert nach „Alle“ / „Fehler“ / „Hinweise“, springt per „Hinspringen“ direkt zum fehlerhaften Schritt, setzt Ungelesen beim Öffnen zurück und leert über „Leeren“.
- [x] **Einfach-Modus, Hilfen, DE/EN & Befehle**: Glocke bleibt in „Einfach“ sichtbar; `calcCancel` und `noticeCenter` sind in `werkzeug-hilfen.json`/`HELP` vollständig; DE/EN-Schlüssel sind gleich und `Commands.search` findet `notices` und `cancel-calc`.
- [ ] **Von Hand**: Im Browser eine sehr rechenintensive Rundung oder große Muster-Kopie auslösen, nach 2 s „Abbrechen“ klicken und in der Glocke bei einem fehlerhaften Schritt auf „Hinspringen“ klicken.

## Vollrundung und Fase an einer Ecke (Auto [A-103], KP-38, KP-41)

- [x] **Vollrundung auf 10-mm-Steg**: Über `#btn-full-fillet` und drei 3D-Flächenklicks angelegt → Stirnfläche wird genau ein Zylinder mit Radius `5 mm`, Volumen `≈ 7785,4 mm³`, keine Mini-Kanten oder Kernfehler; bei Änderung der Stegdicke (`10 → 14 mm`) wächst der Radius automatisch auf `7 mm` mit; verjüngter Steg baut ebenfalls fehlerfrei.
- [x] **Ecken-Fase 2 / 3 / 4**: Über `#btn-corner-chamfer` und Ecken-Klick am `20×20×20`-Quader angelegt, Abstände `2 / 3 / 4 mm` gesetzt → neue dreieckige Ebene mit exakten Kantenlängen (`√13`, `√20`, `5 mm`) und Volumen `7996 mm³`.
- [x] **Reihenfolge drehen, Formeln, Fehler & Rückgängig**: `#fin-rot-*` tauscht `d1/d2/d3` reihum, Formeln (`F`, `F*2`, `F+1`) rechnen exakt (`7988 mm³`), zu großer Abstand (`25 mm`) meldet `toobig` ohne Absturz und `App.undo()` stellt den gültigen Zustand wieder her.
- [x] **Hilfen, Befehle, Erklärtext & DE/EN-Schlüssel**: `fullFillet` und `cornerChamfer` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit, `Commands.search('vollrundung')` / `Commands.search('ecken-fase')` und `Explain.local` sind vollständig ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser eine Vollrundung an einem gebogenen Steg oder über das Kontextmenü anlegen und eine Ecken-Fase an einer schrägen Körper-Ecke prüfen.

## AMF, PLY und Punkte-Dateien (Auto [A-106], IO-12, IO-14)

- [x] **PLY-Export und -Import (binär & ASCII)**: Würfel `25 × 25 × 25` als PLY exportiert (`#ex-ply`, `#ex-each`) und per `Start.openBlob` wieder geöffnet → `0` Fehler, exakt gleiche Dreieckszahl (`12`), gleiche Hüllmaße und gleiche Farbe (`#3f7fd6`); ASCII-PLY-Roundtrip über `Print.buildPLY(..., { ascii: true })` und `Start.parsePLY` konsistent.
- [x] **AMF-Export und -Import (XML & ZIP-AMF mit Zoll)**: Export (`#ex-amf`) und Re-Import liefert exakt `12` Dreiecke, gleiche Hüllmaße, Namen und Farbe; komprimierte AMF-Datei mit `unit="inch"` rechnet sauber auf `25,4 × 25,4 × 25,4 mm` um.
- [x] **CSV und XYZ als Punktwolke oder Skizzenpunkte**: 10-Punkte-CSV über `#points-import-dialog` als 3D-Punktwolke (`PointClouds` mit Verlauf, 3D-Anzeige und Rückgängig/Wiederholen) sowie als `10` Skizzenpunkte auf `XY` geladen; `#sk-csv` (`#csv-kind = 'points'`) fügt `10` Skizzenpunkte ein; 10-Punkte-`.xyz`-Datei importiert fehlerfrei als Punktwolke.
- [x] **Hilfen, Befehle & DE/EN-Schlüssel**: `exportAmfPly`, `pointCloudImport` und `importCad` in `werkzeug-hilfen.json`, DE/EN-Schlüsselgleichheit und Befehlssuche (`ply`, `amf`, `xyz`) vollständig ohne JavaScript-Fehler.
- [ ] **Von Hand**: Im Browser eine farbige PLY-Punktwolke oder ein Mesh aus MeshLab/Blender sowie eine eigene CSV-/XYZ-Messdatei per Ziehen ins Fenster öffnen, Punktgröße und Farbe rechts anpassen und „Als Skizzenpunkte übernehmen“ prüfen.

## Lizenz „Alle Rechte vorbehalten“ und fremde Bausteine (Auto [A-109], PL-02)

- [x] **`LICENSE` & `docs/FREMDE-BAUSTEINE.md`**: `LICENSE` im Hauptordner enthält `© 2026 Nils Kriege`, `Alle Rechte vorbehalten` sowie das Verbot zum Nutzen, Kopieren und Verändern ohne schriftliche Erlaubnis; `docs/FREMDE-BAUSTEINE.md` führt `three.js` (`MIT`), Schrift `Inter` (`SIL Open Font License 1.1`), `replicad` (`MIT`) und `Open CASCADE Technology` (`LGPL-2.1`) samt Abschnitt „Bitte prüfen“ vollständig auf.
- [x] **„Über Tracery“ in Profi & Einfach**: Zeigt in beiden Stufen die Zeile `© 2026 Nils Kriege – alle Rechte vorbehalten` (ohne Drohnen-/FPV-Begriffe) und den Knopf „Fremde Bausteine“ (`#about-third-party` mit `data-help="thirdPartyLibs"`).
- [x] **Dialog „Fremde Bausteine“ & Lizenztexte**: Zeigt alle mitgelieferten fremden Bausteine inkl. `three.js` und `Inter` mit Lizenz, Dateien, aufklappbarem Lizenztext (`<details class="tp-text">`) und „Zurück“-Knopf zu „Über Tracery“.
- [x] **Übersetzung & Hilfetexte**: DE/EN-Schlüsselgleichheit (`texte-de.json` / `texte-en.json`) sowie Hilfeeintrag `thirdPartyLibs` (`werkzeug-hilfen.json` und `HELP`) sind vollständig und ohne JavaScript-Fehler vorhanden.
- [ ] **Von Hand**: Im Browser Menü `⋯` → „Über Tracery“ im hellen und dunklen Design sowie in „Einfach“ und „Profi“ öffnen, über „Fremde Bausteine“ alle Lizenztexte aufklappen und die englische Übersetzung in den Einstellungen prüfen.

## Einstellungen speichern & Oberflächen-Größe (Auto [A-108], BE-30, BE-31)

- [x] **Einstellungen speichern, zurücksetzen & laden**: Geändertes Tastenkürzel (`ortho` → `J`), Werkzeugleisten-Favorit (`fillet`), Maus-Steuerung (`fusion`), Nachkommastellen (`3` / `2`) und Oberflächen-Größe (`125 %`) als `tracery-einstellungen.json` exportiert, komplett zurückgesetzt (`#set-reset-all`) und wieder importiert (`#set-import-input` sowie `Start.openBlob`) → alle Einstellungen und Kürzel (`J` wirkt, `O` nicht) sind wiederhergestellt; ungültige JSON-Dateien werden abgewiesen.
- [x] **Oberflächen-Größe 80–150 % (Profi & Einfach)**: Schieberegler und Schnellwahl (`80 %`, `100 %`, `125 %`, `150 %`) skalieren die Werkzeugleisten-Schrift exakt (`0,8×`, `1,25×`, `1,5×` in Profi und `1,25×` in Einfach), begrenzen Ausreißer auf `80`–`150` und bleiben beim Neuladen erhalten.
- [x] **Hilfen, Befehle & Übersetzung**: `settingsFile` und `uiScale` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit, Befehlssuche (`settings-export`, `settings-import`, `settings-scale`) und i18n-Testmodus im Einstellungsfenster ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser auf einem großen Monitor die Oberflächen-Größe auf 125 % und 150 % stellen, Modell, Skizze und Zeichnung auf saubere Lesbarkeit ohne Überlappung prüfen und eine gesicherte `.json`-Einstellungsdatei ins Fenster ziehen.

## Spline mit Kontrollpunkten und Tangenten-Griffen (Auto [A-111], SK-32, SK-33)

- [x] **Kontrollpunkt-Spline (Profi, offen & geschlossen)**: 4-Punkte- und 5-Punkte-Kontrollpunkt-Spline über `#sp-mode = 'cv'` gezeichnet → startet exakt im ersten und endet im letzten Punkt, innere Punkte ziehen weich an ohne durchlaufen zu werden, `C1`-Stetigkeit am Übergang, geschlossene Variante lässt sich fehlerfrei zu einem Volumenkörper hochziehen.
- [x] **Tangenten-Griffe an Durchgangs-Splines (Richtung, Stärke, Maß)**: Griff am Startpunkt per `#se-hAng0` auf `45°` gesetzt → `SK.splineTangentAt`, `SK.splineBez` und Kurvenanfang zeigen exakt `45°`, Durchgangspunkte bleiben erhalten; Griff per Maus auf `45°` gezogen, per Maß-Werkzeug (`D`) auf `30°` bemaßt, mit `#se-sh-reset` zurückgesetzt und mit `Strg+Z` wiederhergestellt.
- [x] **Einfach-Modus, Hilfetexte & Übersetzung**: Im Modus „Einfach“ sind Kontrollpunkt-Spline und Tangenten-Griffe ausgeblendet; `splineControl` und `splineHandles` in `HELP` sowie alle neuen DE/EN-Texte vorhanden, ohne JavaScript-Fehler.
- [ ] **Von Hand**: Im Browser im Profi-Modus eine geschwungene Kontrollpunkt-Spline und eine Durchgangs-Spline mit mehreren angepassten Tangenten-Griffen zeichnen, per Ziehen und Formel-Maß formen und als Körper hochziehen.

## Krümmungskamm und Regel „krümmungsglatt“ (Auto [A-112], SK-34, SK-35)

- [x] **Nur im Profi-Modus sichtbar**: In „Einfach“ sind `#sk-curv-comb` und `.consbar [data-tool="c:curvature"]` ausgeblendet, nach Umschalten auf „Profi“ werden beide sichtbar.
- [x] **Krümmungskamm an/aus & Maßstab**: „Krümmung zeigen“ blendet für Spline und Bogen Kamm-Zähne und Hüllkurve in `Viewer.groups.sketch` ein (`curvCombCount > 0`), `#sk-curv-scale = 2` verdoppelt die Zahnlänge, Ausschalten entfernt alle Kamm-Linien rückstandslos (`0` Linien).
- [x] **Regel „Krümmungsglatt (G2)“ am Bogen (R = 10 → R = 20) & an Linie**: 4-Punkt-Spline an Bogen `r = 10` per Regel-Leiste verbunden → Endpunkte deckungsgleich, Tangenten glatt (`dot > 0,9999`), Krümmung am Übergang gleich `0,1` (Abweichung unter `1 %`, zusätzlich unabhängig an `SK.splineBez` geprüft); Änderung auf `r = 20` führt die Krümmung exakt auf `0,05` (`< 1 %`) mit; G2 an Gerade ergibt `|κ| < 1e-4`; 2-Punkt-Spline wird mit Hinweis abgewiesen.
- [x] **Hilfetexte, Befehle & DE/EN-Schlüssel**: `curvatureComb` und `cCurvature` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit und Befehlssuche (`sketch-curvature`, `sketch-g2`) ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser eine geschwungene Spline an einen Bogen und eine Gerade zeichnen, „Krümmung zeigen“ einschalten, „Krümmungsglatt (G2)“ setzen und beim Ziehen der mittleren Spline-Punkte beobachten, wie die Krümmungskämme am Übergang gleich hoch bleiben.

## Kleinster Innenradius und Symmetrie prüfen (Auto [A-104], PF-11, PF-16)

- [x] **Kleinster Innenradius (Tasche R 2, Fräser R 3 → 1,5)**: Prüfen-Menü → „Kleinster Innenradius“ erkennt alle 4 Taschen-Ecken (`R 2`) als zu klein für Fräser `R 3` (rot markiert, `tooSmallCount == 4`, `minRadius == 2`), schaltet bei Fräser `R 1,5` auf grün um und zählt äußere Rundungen (`R 2` an der Außenecke) nicht mit; Klick in der Liste hebt die Fläche im Modell hervor.
- [x] **Symmetrie prüfen (Quader & seitliche Bohrung)**: Symmetrischer Quader `30 × 20 × 15` ergibt an der YZ-Ebene „Symmetrisch“ (`100 %`, keine Abweichung). Eine seitliche Bohrung (`Ø 8` bei `X = 8, Y = 0`) meldet „Nicht symmetrisch“ mit roter/blauer Abweichungs-Überlagerung an YZ, bleibt an XZ weiterhin symmetrisch.
- [x] **Hilfen, Befehle & Übersetzung**: `innerRadius` und `symmetryCheck` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit sowie Befehlssuche (`innenradius`, `symmetrie`) ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser bei einem Bauteil mit Freiform-Rundungen, Bohrungen und Versatz-Symmetrieebene („Fläche“ und „Mitte“) die rote/blaue Hervorhebung und das Anspringen der Liste im 3D-Fenster prüfen.

## Strecken und Live-Spiegeln (Auto [A-110], SK-30, SK-46)
- [x] **Profi-Modus**: Werkzeug „Strecken“ (`[data-tool="stretch"]`), Schalter `#sk-live-mir-btn` und Panel-Bereich `#sk-live-mir-box` sind im Modus „Einfach“ ausgeblendet und im Modus „Profi“ sichtbar.
- [x] **Strecken am Rechteck und geregeltem Linienzug**: Auswahlrahmen per Maus aufziehen, Richtung X + Weg 5 mm anwenden → nur die rechte Kante wandert um 5 mm (Breite 25, linke Kante unverändert), vorhandene Regeln (`horizontal`, `vertical`, `coincident`, `fix`) bleiben gültig, `Strg+Z` macht rückgängig.
- [x] **Live-Spiegeln an Y-Achse und eigener Linie**: Gezeichnete Linie wird sofort an der Y-Achse gespiegelt samt `symmetric`-Regeln erzeugt (und mit `Strg+Z` gemeinsam entfernt); gezeichneter Kreis an gewählter Linie erhält `symmetric`- und `equal`-Regeln; nach `#lm-off` wird nicht mehr gespiegelt.
- [x] **Hilfen, Befehle & DE/EN-Schlüssel**: `stretch2d` und `liveMirror` in `werkzeug-hilfen.json`, DE/EN-Schlüsselgleichheit und Befehlssuche (`strecken`, `live-spiegeln`) ohne Fehler.
- [ ] **Von Hand**: In einer Skizze mit gemischtem Profil einen Rahmen schräg mit Winkel/Weg strecken und Live-Spiegeln an einer schrägen Hilfslinie beim freien Zeichnen testen.

## Muster entlang Kurve und Füllmuster in der Skizze (Auto [A-115], SK-44, SK-45)
- [x] **Einfach & Profi**: Werkzeuge „Kurvenmuster“ (`[data-tool="patcurve"]`) und „Füllmuster“ (`[data-tool="patfill"]`) sind in Einfach und Profi sichtbar und bleiben in der zweizeiligen Skizzen-Leiste.
- [x] **Kurvenmuster (SK-44)**: 5 Kreise entlang eines Bogens (`R = 20`) mit fester Anzahl (`5`) sowie mit festem Abstand (`15 mm`) → exakte Abstände, Löser gültig, „An Kurve ausrichten“ dreht Kopien mit und `Strg+Z` macht das Muster in einem Schritt rückgängig.
- [x] **Füllmuster (SK-45)**: Wabenfüllung (`6 mm`, Abstand `8 mm`, Randabstand `3 mm`) in Rechteck `50 × 30` → genau `14` Sechsecke ohne Randschnitt und mit vollem Rand- und Lochabstand; Raster (`8` Kreise) und versetzt (`11` Kreise) sowie Ablehnung bei `Abstand ≤ Lochgröße` geprüft.
- [x] **Hilfen, Befehle & DE/EN-Schlüssel**: `patternCurve2d` und `patternFill2d` in `werkzeug-hilfen.json`/`HELP`, DE/EN-Schlüsselgleichheit und Befehlssuche (`kurve`, `füllmuster`) ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser eine geschwungene Spline als Leitkurve mit Ausrichten/Richtungsumkehr sowie ein Füllmuster auf einer Fläche mit Innenloch ausprobieren und danach hochziehen.

## Kegelschnitt und Brückenkurve (Auto [A-113], SK-36, SK-40)
- [x] **Profi-Modus**: Werkzeuge `conic` („Kegelschnitt“) und `bridge` („Brücke“) sind im Modus „Einfach“ ausgeblendet und im Modus „Profi“ sichtbar.
- [x] **Kegelschnitt mit Rho = 0,5 (Parabel), Ellipse & Hyperbel**: Start `(0, 0)`, Ende `(40, 0)`, Schulterpunkt `(20, 20)` und Rho `0,5` per Maus/Tastatur erzeugt `conic`, dessen Mittelpunkt exakt mit der Parabel `(20, 10)` übereinstimmt; Umschalten auf `0,3` (Ellipsenstück) und `0,75` (Hyperbel) über `#se-rho` passt die Kurvenmitte exakt an; geschlossen mit Linie und hochgezogen ergibt einen fehlerfreien 3D-Körper mit Parabel-Volumen.
- [x] **Brückenkurve zwischen zwei Linien (G1 tangential) & Mitwandern**: Verbindet zwei Linienenden knickfrei; Winkelfehler an beiden Enden liegt unter `0,1°`; bei Änderung einer Anschlusslinie wandert die Brücke per `SK.syncBridges` mit und bleibt unter `0,1°` tangential; `Strg+Z` macht rückgängig.
- [x] **Brückenkurve krümmungsglatt (G2) & 3D-Hochziehen**: Verbindet Kreisbogen (`R = 20`) und Linie mit `pts.length === 6`, Winkelfehler `< 0,1°` sowie passender Krümmung (`1/20` bzw. `0`) an beiden Enden, schließt zum Profil und lässt sich ohne Fehler hochziehen; Hilfetexte `conic2d` / `bridge2d`, DE/EN-Schlüsselgleichheit und Befehlssuche (`kegelschnitt`, `brückenkurve`) vollständig.
- [ ] **Von Hand**: In einer Skizze einen Kegelschnitt frei mit der Maus aufziehen (Ellipsenstück, Parabel und Hyperbel am Schulterpunkt beobachten) und zwei schräge Splines bzw. Bögen mit „Brücke“ (G1 und G2) sowie Stärke 1/2 verbinden.

## Skizzen-Blöcke (Auto [A-118], SK-31)
- [x] **Profi-Modus**: Block-Werkzeug (`[data-tool="block"]`) und „Als Block speichern“ (`#sk-make-block`) sind im Modus „Einfach“ ausgeblendet und im Modus „Profi“ sichtbar.
- [x] **Block speichern & mehrfach einsetzen**: Zwei Kreise in der Skizze als Block speichern, 3 Einsätze platzieren, verschieben (`#bi-x`/`#bi-y`) und drehen (`#bi-rot`) → alle 3 Einsätze liegen exakt am Zielort.
- [x] **Zentrale Block-Änderung & Rückgängig**: Block im eigenen Koordinatensystem bearbeiten (`#blk-inst-edit`), Kreisradius von `4 mm` auf `7 mm` ändern und speichern → alle 3 Einsätze in `S.ents` wechseln geschlossen auf `R = 7`; `Strg+Z` stellt den alten Radius `4 mm` über alle 3 Einsätze exakt wieder her.
- [x] **Auflösen, 3D-Hochziehen & Dokument-Rückgängig**: Aufgelöster Einsatz bleibt bei späteren Block-Änderungen eigenständig; Hochziehen über alle Block-Konturen und `App.undo()` stellen Ausgangszustand sauber wieder her; `sketchBlocks` in `werkzeug-hilfen.json`/`HELP`, DE/EN-Schlüsselgleichheit und Befehlssuche (`block`) geprüft.
- [ ] **Von Hand**: In einer komplexen Skizze einen Block aus Rechteck + Bohrungen mit internen Regeln speichern, mehrfach gedreht einsetzen, durch Ziehen an einer Kontur direkt verschieben und mit „Block auflösen“ einzeln nachbearbeiten.

## Polares Raster und Hilfslinien (Auto [A-117], SK-52)
- [x] **Profi-Modus**: Abschnitt `#sk-grid-sec` sowie die Skizzen-Lineale `#sk-ruler-t`, `#sk-ruler-l` und `#sk-ruler-c` sind im Modus „Einfach“ ausgeblendet (und `Sketch.setGridMode('polar')` gesperrt) und im Modus „Profi“ sichtbar.
- [x] **Polares Raster & Fang**: Umschalten über `#sk-grid-polar` zeichnet konzentrische Ringe und Strahlen (`sketchGrid === 'polar'`); Punkt bei `r = 10, 30°` sowie nach Umstellen auf `10 mm / 45°` bei `r = 20, 45°` fangen exakt auf den Polarkoordinaten.
- [x] **Hilfslinien vom Lineal & Schnittpunkt-Fang**: Ziehen aus `#sk-ruler-l` erzeugt X-Hilfslinie bei `x = 15`, an der Punkte sowohl bei polarem als auch rechteckigem Raster exakt fangen; Ziehen aus `#sk-ruler-t` erzeugt Y-Hilfslinie bei `y = -10` mit Schnittpunkt-Fang `(15, -10)`; Zurückziehen aufs Lineal löscht mit `Strg+Z`-Wiederherstellung; Panel-Anlage, `#sk-guides-clear`, Hilfetexte (`polarGrid`, `rulerGuides`), DE/EN-Schlüsselgleichheit und Befehlssuche (`polar`, `hilfslinien`) ohne Seitenfehler.
- [ ] **Von Hand**: In einer Skizze per Ziehen aus beiden Linealen mehrere X-/Y-Hilfslinien anlegen, bei verschiedenen Zoomstufen verschieben und das Fangen mit Rechteck, Linie und Kreis auf dem polaren Raster prüfen.

## Silhouette und Schnittkurve in die Skizze (Auto [A-114], SK-42, SK-43)
- [x] **Profi-Sichtbarkeit**: „Umriss holen“ (`#sk-silhouette`) und „Schnittkurve“ (`#sk-intersect`) sind im Modus „Einfach“ ausgeblendet und im Modus „Profi“ sichtbar.
- [x] **Umriss holen (SK-42)**: Liegender Zylinder (`d = 20`, `h = 40`) in der `XZ`-Skizze per Klick übernommen → exakt 4 Rechteck-Linien `40 × 20` (Fläche `800`), `Strg+Z` nimmt alles zurück; beim Ändern des Zylinders auf `60 × 30` wächst der Umriss automatisch mit.
- [x] **Schnittkurve holen (SK-43)**: Zwei sich kreuzende Zylinder (`d = 20` und `d = 16`) per Flächenklick übernommen → Schnittkurve mit `link.kind === 'faceIntersect'` in der Skizze, `Strg+Z` nimmt sauber zurück; bei Verkleinern (`d = 16 → 10`) wandert die Kurve mit.
- [x] **Kaputte Bezüge (`RefFix`)**: Unterdrücken des Zylinders bzw. Auseinanderschieben der Zylinder meldet `sketch-silhouette` / `sketch-intersect`, zeigt gestrichelte Alt-Lage und löst die Verbindung über `#reffix-unlink` sauber.
- [x] **Hilfen, Befehle & DE/EN-Schlüssel**: `silhouette2d` und `intersectCurve2d` in `werkzeug-hilfen.json`, DE/EN-Schlüsselgleichheit und Befehlssuche (`umriss`, `schnittkurve`) ohne Fehler.
- [ ] **Von Hand**: Im Browser die Silhouette eines gedrehten Körpers mit Bohrung sowie die Schnittkurve zweier schräger Freiform-/Zylinderflächen auf einer geneigten Skizzenebene prüfen und mit `RefFix` auf eine neue Fläche umhängen.

## 3D-Skizze: Linien und Bögen im Raum (Auto [A-119], SK-51)
- [x] **Profi-Modus**: Knopf `#sk-3d` („3D-Skizze“) im Skizzen-Startmenü sowie Werkzeug `#t-sketch3d` sind im Modus „Einfach“ ausgeblendet und im Modus „Profi“ sichtbar.
- [x] **Linienzug & Längenmaße**: Linienzug `(0,0,0) → (20,0,0) → (20,20,10)` über Punkt-Eingabe `#sk3-in-x/y/z` + `#sk3-pt-add` ergibt zwei Linien mit exakten Längen `20` und `≈ 22,36` samt Längen-Schildchen `.sk3-dim`; festes Längenmaß (`25`) zieht den verbundenen Folgepunkt mit, `Strg+Z` stellt den Ausgangszustand wieder her.
- [x] **Entlang Pfad (Kreis-Profil)**: Nach Fertigstellen (`#sk3-done`) liegt `sketch3d` im Verlauf und wird in `Viewer.groups.sketch3d` angezeigt; Klick auf `#sk3-to-sweep` erzeugt einen geschlossenen, geometrisch gültigen 3D-Körper ohne Rechenfehler.
- [x] **Fangen an Körperecke & 3D-Bogen**: `Sketch.snap3dAt` fängt exakt an der Ecke eines Quaders samt Bindung; 3-Punkt-3D-Bogen `(0,0,0) → (10,10,10) → (20,0,0)` ergibt exakte Bogenlänge und lässt sich fehlerfrei entlang des Pfads ziehen; Hilfetext `sketch3d`, DE/EN-Schlüsselgleichheit und Befehlssuche (`3d-skizze`) vollständig.
- [ ] **Von Hand**: Im Browser eine 3D-Skizze aus mehreren Linien und Bögen frei an Körperecken eines Modells fangen, dabei die Kamera drehen, ein Längenmaß über das 3D-Schildchen ändern und danach den Körper entlang des Pfads verschieben (prüfen, dass die gefangenen Punkte mitwandern).

## Volltest-Reparatur (Auto [F-11250121])

- [x] **Fokus-Vorschau bei rAF-Stau**: Bei blockiertem `requestAnimationFrame` zeichnet `Views.focus()` über den `60 ms`-Timer-Fallback (`requestFocusDraw` → `Viewer.renderNow()`) das gewählte Teil (`Views.focusDrawn === true`) und setzt `focusDrawn` beim Leeren der Auswahl sauber auf `false` zurück (`t_fokus`, `t_f11250121`).
- [x] **Meldung überlebt Hauptthread-Hänger**: `UI.toast()` (`scheduleToast`) zählt die Restlaufzeit in `500 ms`-Scheiben herunter, sodass ein einzelner `900 ms`-Hänger eine `600 ms`-Meldung nicht vorzeitig löscht und sie danach sauber nach Ablauf der Restzeit verschwindet (`t_explosion_regeln`, `t_f11250121`).
- [ ] **Von Hand**: Im Browser bei langsamer Darstellung die Fokus-Vorschau öffnen, ein Teil wählen und drehen sowie mit einem einzelnen Teil die Explosions-Meldung auslösen und prüfen, dass Vorschau und Hinweis zuverlässig sichtbar bleiben.

## Schraubdom, Lippe und Nut (Auto [A-120], KP-24, KP-25)
- [x] **Einfach & Profi**: `#add-boss` und `#add-lip-groove` sind im Körper-Flyout in beiden Stufen sichtbar; an einer ebenen Fläche erscheint `#ctx-boss` in der Kontextleiste.
- [x] **Schraubdom (KP-24)**: Dom `d = 8/3`, Höhe `10`, `4` Rippen auf Platte `40×40×4` (`6400` mm³) vereinigt sauber ohne Fehler (`> 6850` mm³), Bohrung `Ø 3,0 mm`, Rippenzahl `0 / 4 / 6` ändert das Volumen, Unterdrücken und Rückgängig stellen `6400` mm³ wieder her.
- [x] **Lippe und Nut (KP-25)**: Zwei ausgehöhlte Gehäusehälften (`60×40×15`, Wand `3` mm) mit Lippe (`2,5` mm hoch, `1,2` mm breit) und `0,2` mm Spiel (innen, außen und getauscht) erzeugen Lippe und Nut fehlerfrei mit `0` Durchdringung (`clashes`); Rückgängig stellt Ausgangsvolumen wieder her.
- [x] **Hilfetexte, DE/EN-Schlüssel & Befehlssuche**: `HELP.boss` und `HELP.lipGroove` samt `texte-de`/`texte-en`-Schlüsselgleichheit und Suche nach `schraubdom` / `lippe` grün.
- [ ] **Von Hand**: Im Browser an einer runden und einer geschrägten Gehäuseschale eine Trennkante per Klick wählen und das Spiel der Lippe im Schnitt (Taste C) prüfen.

## Lüftungsgitter, Kühlrippen und Steg-Netz (Auto [A-121], KP-26, KP-27)
- [x] **Lüftungsgitter (`vent`)**: 6 Schlitze (3 mm breit, 4 mm Rahmen, 0°) in einer 60×40×4-Platte erzeugen exakt 6 Durchbrüche (7 Schleifen oben und unten) bei sauberem Restvolumen; Winkel 45° mit 4 eckigen Schlitzen sowie Unterdrücken/Reaktivieren über die Zeitleiste funktionieren fehlerfrei.
- [x] **Kühlrippen (`fins`)**: 6 Rippen (1,5 mm dick, 10 mm hoch, 2 mm Randabstand) auf einer 50×30×4-Platte verschmelzen zu 1 Körper mit exaktem Volumen (10140 mm³) und lassen Höhe sowie Schräge (2°) sauber nachstellen.
- [x] **Steg-Netz (`web`)**: Offenes Kreuz und verzweigte 4-Linien-Kreuzung auf einer 40×40×20-Schale (2 mm Wand) verbinden alle vier Wände als 1 Körper bei fester Tiefe (10 mm) und bis zum Schalenboden (Tiefe 0), inkl. Skizzen-Bearbeitung, Zeitleisten-Marker, Bezügen, Erklärungen, Befehlen und Hilfetexten.
- [ ] **Von Hand**: Auf der Oberseite eines ausgehöhlten Gehäuses mit Deckel und Boden ein Lüftungsgitter (Tiefe 0) schneiden und prüfen, dass die Rückwand geschlossen bleibt, sowie ein gekreuztes Steg-Netz mit Schräge im 3D-Bild optisch kontrollieren.

## Übergang als Schnitt und als Ring (Auto [A-122], KP-30)

- [x] **Geschlossener Ring durch 4 Kreise im Quadrat**: 4 runde Umrisse im Quadrat per `#ctx-loft-closed` im Profi-Modus verbunden → geschlossener Ring (`p.closed = true`) ohne Lücke und ohne Geometrie-Fehler (`GeomCheck` 0 Funde, offenes Zentrum, alle 4 Seiten und Quadranten voll geschlossen).
- [x] **Umschalten Weich/Gerade, Offen/Geschlossen & Einfach/Profi**: Wechsel zwischen weichem Ring und geraden Flächen (`#p-ruled = 'ruled'`), Öffnen/Schließen über `#p-closed` mit Rückgängig sowie Ausblenden der Profi-Option im Modus „Einfach“ funktionieren ohne Fehler.
- [x] **Übergang als Schnitt in Quader & Ring-Schnitt**: Offener Übergang und geschlossener Ring über `#ctx-loft-cut` bzw. `#op-type = 'cut'` direkt von einem Quader abgezogen → Volumen sinkt deutlich, `GeomCheck` 0 Funde, Wechsel zwischen `new` und `cut` samt Rückgängig/Wiederholen fehlerfrei.
- [x] **Hilfen, Befehle, Erklärtext & DE/EN-Schlüssel**: `loftClosed` und `loftCut` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit, Befehlssuche (`übergang ring`, `übergang schnitt`) und `Explain.local` vollständig ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser 4 leicht unterschiedlich große Kreise im Kreis zeichnen, auf „Übergang (Ring)“ klicken, das nahtlose Schließen rundherum drehen und prüfen sowie den Ring mit „Körper → Abziehen von“ als umlaufende Nut aus einer Platte schneiden.

## Übergang mit weichem Anschluss (Auto [A-123], KP-31)

- [x] **Tangentialer Anschluss an Zylinder-Stirnfläche (< 1°)**: Übergang von Zylinder-Stirnfläche (Ø 20 × 20) zu Kreis (Ø 40) über `#loft-start-mode = 'tangent'` → Normalenwinkel an der Anschlusskante sinkt von > 18° auf unter 1°, Nachbarfläche automatisch erkannt, `GeomCheck` 0 Funde.
- [x] **Stärke-Regler, G2, schräger Kegel & Kreis→Rechteck**: Stärke-Regler `#loft-start-weight` (0,3 vs. 2,5) hält den knickfreien Anschluss (< 1°) und steuert sichtbar die Bauchigkeit; krümmungsglatt (`curvature`, G2), beidseitiges `G2` + `G1`, Vereinigen mit dem Zylinder, Anschluss an einen schrägen Kegelstumpf (< 1° zur Kegelwand) sowie Kreis→Rechteck tangential samt Rückgängig/Wiederholen und Einfach/Profi-Umschaltung laufen ohne Fehler.
- [x] **Hilfen, Befehle, Erklärtext & DE/EN-Schlüssel**: `loftContinuity` in `werkzeug-hilfen.json` und `HELP`, DE/EN-Schlüsselgleichheit, Befehlssuche (`übergang tangential`, `krümmungsglatt`) und `Explain.local` vollständig ohne Seitenfehler.
- [ ] **Von Hand**: Im Browser auf der Stirnfläche eines Zylinders oder Kegelstumpfs skizzieren, einen Übergang zu einer größeren versetzten Ebene anlegen, rechts zwischen „Frei“, „Tangential (G1)“ und „Krümmungsglatt (G2)“ wechseln, den Stärke-Regler ziehen und im Lichtglanz den nahtlosen Verlauf prüfen.

## Volltest-Reparatur (Auto [F-11250227])

- [x] **Gelenk lösen aktualisiert Panels sofort**: `Joints.remove()` merkt `selJoint` vor `App.change()` und baut rechtes und linkes Panel sofort neu auf – auch bei fokussiertem `#jt-ang` oder direkt im Verlauf ausgewähltem Gelenk (`t_gelenk`, `t_f11250227`).
- [x] **Zeichnung wartet auf Erstprojektion**: Während `ensureProjections()` erstmals für ein nicht-leeres Modell läuft (`loadingProjPromise && !proj`), unterdrückt `Drawing.render()` das Einhängen eines vorzeitigen leeren `<svg>`, und erst nach Projektionsabschluss erscheint das vollständige Blatt samt Ansichtsgeometrie (`t_a064_zeichnung_detailansicht`, `t_f11250227`).
- [ ] **Von Hand**: Im Browser bei einem Drehgelenk zuerst den Winkel ändern, im Feld bleiben und direkt „Gelenk lösen“ klicken sowie bei einem größeren Modell beim Wechsel auf „Zeichnung“ ein Werkzeug wählen und prüfen, dass kein leeres Blatt aufblitzt.

## Wandstärke je Fläche & nach außen/mittig (Auto [A-127], KP-43)

- [x] **Eigene Wandstärke je Fläche (Quader innen)**: Quader 20×20×20 von oben mit Standard 1,5 mm schalen, über „Fläche mit eigener Stärke“ den Boden auf 3 mm setzen → `Viewer.wallAt` misst Boden 3,0 mm und alle 4 Seiten 1,5 mm bei unveränderten Hüllmaßen `[-10,-10,0,10,10,20]`, Volumen ≈ 3087 mm³, `GeomCheck` 0 Fehler.
- [x] **Richtung nach außen & mittig**: Umschalten über `#fin-dir-...` auf „Nach außen“ (`out`) vergrößert Hüllmaße auf `[-11.5,-11.5,-3,11.5,11.5,20]` (Volumen ≈ 4167 mm³, Boden 3,0 mm, Seiten 1,5 mm); „Mittig“ (`mid`) ergibt `[-10.75,-10.75,-1.5,10.75,10.75,20]` (Volumen ≈ 3606,75 mm³), jeweils ohne Geometriefehler.
- [x] **Mehrere abweichende Wände, Formeln, Löschen & Zylinder**: Zweite Seitenwand per Formel auf 4 mm setzen, über Löschknopf entfernen + Rückgängig, sowie Zylinder (Boden 3 mm, Mantel 1,5 mm) innen und außen mit `GeomCheck` 0 Fehlern geprüft.
- [x] **Hilfetexte, Erklärung & DE/EN-Schlüssel**: `shell` und `shellFaceWall` in `werkzeug-hilfen.json` / `HELP`, Tooltip auf `#fin-addfw-...`, `Explain.local` und DE/EN-Schlüsselgleichheit geprüft.
- [ ] **Von Hand**: Im Browser ein gerundetes Gehäuse mit Deckelöffnung schalen, zwischen „Nach innen“, „Nach außen“ und „Mittig“ umschalten und prüfen, ob mehrere Seitenwände mit verschiedenen Dicken im 3D-Schnitt sauber abschließen.

## Verformen: Biegen, Verdrehen, Verjüngen (Auto [A-125], KP-37)

- [x] **Biegen (90° & 180°)**: Quader `100×10×10` im Profi-Modus per `#ctx-deform` um 90° biegen → Volumen ≈ 10 000 mm³, 0 Geometrie-Fehler, die beiden Endflächen stehen senkrecht zueinander (`|n1 · n2| < 0,02`); bei 180° zeigen beide Endflächen parallel in dieselbe Richtung (`n1 · n2 > 0,98`).
- [x] **Verdrehen (90°)**: Quader `20×10×40` entlang Z um 90° verdrehen → Volumen ≈ 8 000 mm³, 0 Geometrie-Fehler, obere Fläche gegenüber unten um 90° gedreht (Spanne X/Y von 20×10 auf 10×20).
- [x] **Verjüngen (Faktor 0,5 & Umkehren)**: Quader `20×20×40` entlang Z mit Faktor 0,5 verjüngen → Volumen ≈ 9 333 mm³, 0 Geometrie-Fehler, oben halb so breit wie unten (10 mm statt 20 mm); „Richtung umkehren“ dreht unten/oben sauber um.
- [x] **Profi-Modus, Zeitleiste, Formeln, Bezüge & Hilfe**: `#ctx-deform` und `#add-deform` nur im Profi-Modus sichtbar; Unterdrücken/Reaktivieren, Rückgängig/Wiederholen, Formel im Winkel, `Model.dependencies`, `Explain.local` und `HELP.deform` geprüft.
- [ ] **Von Hand**: Einen Körper mit Durchgangsbohrung im 3D-Bild um 90° biegen und visuell prüfen, dass die Flächen und Bohrungskanten glatt ohne sichtbare Lücken dargestellt werden.

## Kurve auf Fläche projizieren, Fläche teilen & Kuppel (Auto [A-124], KP-35, KP-36)

- [x] **Kreis auf Zylindermantel projizieren & teilen (`splitFace`)**: Kreis (r = 5 mm) auf Zylindermantel (Ø30 × 40) projiziert → Flächenzahl steigt exakt von 3 auf 4 (1 Solid, Volumen unverändert, `GeomCheck` 0 Funde), beide Teilflächen sind über `faceColors`/`Viewer.faceIndexOf` getrennt färbbar; Umschalten auf „Beide Seiten“ teilt Vorder- und Rückseite (5 Flächen); im Modus „Einfach“ bleibt `#ctx-split-face` verborgen; Unterdrücken und Zeitleisten-Marker funktionieren sauber.
- [x] **Kuppel auf ebener Fläche (`dome`)**: 5 mm Kuppel auf Quader-Oberseite (20×20×20) erhöht die Gesamthöhe exakt auf 25 mm (`+5 mm`) als gültiger Einzelkörper (`GeomCheck` 0 Funde); Ändern der Höhe (8 mm), Umschalten auf Kugelkappe (`spherical`) und „Nach innen“ (`flip`), Unterdrücken sowie 5 mm Kuppel auf Zylinder-Oberseite (Ø20 × 20 → Höhe 25 mm) funktionieren; Hilfetexte (`werkzeug-hilfen.json`) und Schritt-Erklärungen (`Explain.local`) sind vollständig.
- [ ] **Von Hand**: Im Browser auf einer Kugel oder einem Zylindermantel eine geschwungene Kurve mit „Fläche teilen“ projizieren, die abgetrennte Teilfläche farbig markieren und eine nach außen sowie eine nach innen gewölbte Kuppel im 3D-Bild optisch prüfen.

## Flächen-Rundung und Schräge an Trennlinie (Auto [A-126], KP-39, KP-42)

- [x] **Flächen-Rundung 90° (benachbart & nicht benachbart)**: Zwei Flächen am Quader `40×40×20` (benachbart per 3D-Klick sowie nicht benachbart über 2-mm-Fase hinweg) mit `r = 5` abrunden → neue `CYLINDRE`-Fläche mit `r = 5,0 mm`, exaktes Volumen, `GeomCheck` 0 Funde, Formel & Rückgängig funktionieren; konkave Innenrundung am L-Winkel mit Innenstufe rundet mit `r = 5,0 mm` ohne Geometriefehler.
- [x] **Schräge an Trennlinie (3° nach oben & unten)**: Quader `20×20×20` über `#btn-parting-draft` ab der Mitte neigen → 10 Flächen, alle vier oberen Seitenflächen geneigt mit `nz ≈ +sin(3°)` und alle vier unteren mit `nz ≈ -sin(3°)` bei unveränderten Hüllmaßen, `GeomCheck` 0 Funde; getrennte Winkel (3°/5°), „Nach außen neigen“, feste Lage, X-Richtung sowie Zylinder Ø20×20 geprüft.
- [x] **Profi-Modus, Hilfetexte, DE/EN & Befehle**: `#btn-face-fillet` und `#btn-parting-draft` nur im Profi-Modus sichtbar; `werkzeug-hilfen.json`, DE/EN-Schlüsselgleichheit, `Commands.search` und `Explain.local` geprüft.
- [ ] **Von Hand**: Im Browser zwei nicht benachbarte Flächen über eine größere Fase und an einem geschwungenen Formteil eine Trennlinien-Schräge mit Bezugsebene optisch auf glatte Übergänge prüfen.

## Freistich, Einstich, Passfeder-Nut & Keilwellen-Profil (Auto [A-130], KP-48, KP-49)

- [x] **Sicherungsring-Einstich DIN 471 (Welle) & DIN 472 (Bohrung)**: Welle `d=20` über Kontextleiste `#ctx-circlip` → `norm: 'din471'`, Nutbreite `1,3 mm`, Nutgrund `d=19,0 mm` (`r=9,5 mm`), Volumenabnahme `≈ π·(10² − 9,5²)·1,3`, `GeomCheck` 0 Fehler, Unterdrücken und Rückgängig geprüft; Bohrung `d=20` (`tube d=32, wall=6`) → `norm: 'din472'`, Nutbreite `1,1 mm`, Nutgrund `d=21,0 mm`, `GeomCheck` 0 Fehler (`t_a130_wellen_features`).
- [x] **Passfeder-Nut DIN 6885 direkt auf Zylinderfläche**: Welle `d=20` → automatisch Größe `6x6` mit exakt `6,0 mm` Abstand zwischen beiden Seitenwänden und `3,5 mm` Tiefe (`r=6,5 mm`); Welle `d=30` → automatisch Größe `8x7` (`8,0 mm` breit, `4,0 mm` tief), `Model.dependencies` & `GeomCheck` 0 Fehler (`t_a130_wellen_features`).
- [x] **Gewinde-Freistich DIN 76-1**: Bolzen `d=10` (M10, Steigung `1,5 mm`) → Form A (`grooveD=7,3 mm`, `width=5,2 mm`) mit zylindrischem Nutgrund und 30°-Auslaufkegel sowie Umschalten auf Form B (`width=3,8 mm`) über `#uc-form`, `GeomCheck` 0 Fehler (`t_a130_wellen_features`).
- [x] **Keilwellen-Profil DIN ISO 14 (Normteil & Formschritt)**: Normteil `splineShaft` (`6x16x20`, Länge `40 mm`) und Formschritt `splineProfile` auf Welle `d=20` erzeugen 6 Außenbögen (`r=10`), 6 Fußbögen (`r=8`) und 12 Flankenflächen ohne Geometriefehler; Hilfetexte (`werkzeug-hilfen.json`/`HELP`), `Explain.local` und DE/EN-Schlüsselgleichheit geprüft (`t_a130_wellen_features`).
- [ ] **Von Hand**: Im Browser auf einer abgesetzten Welle (z. B. `d=20` mit Absatz `d=25`) nacheinander Gewinde-Freistich, Sicherungsring-Einstich und Passfeder-Nut über Kontextleiste/Rechtsklick anlegen und prüfen, ob alle Nuten optisch sauber auf den Zylinderflächen sitzen.

## Muster mit wachsender Größe & Teilen mit Fläche oder Skizze (Auto [A-129], KP-46, KP-47)

- [x] **5 Zylinder mit +10 % je Kopie**: Rechteckmuster (`nx = 5, dx = 25`) auf Zylinder (`Ø10 × 10`) mit `#op-scaleStep = 10` (`%`) → 5 Körper ohne Fehler (`GeomCheck` 0 Funde), letzter Zylinder ist `1,464`-mal so groß (`Ø ≈ 14,64 mm`, `h ≈ 14,64 mm`).
- [x] **Wachsender Abstand & mm-Schritte (Profi)**: `#op-distStep = 5` (`mm`) vergrößert die Abstände zwischen aufeinanderfolgenden Kopien um +5 mm (`25, 30, 35, 40 mm`); `#op-scaleUnit = 'mm'`, `#op-scaleStep = 2` lässt den letzten Zylinder auf `18 mm` (1,8×) wachsen; Kreismuster mit wachsender Größe sowie Ausblenden von `#op-grow-wrap` im Einfach-Modus geprüft.
- [x] **Quader mit gebogener Skizze teilen**: Quader `20×20×20` mit einem Skizzen-Bogen (`plane: 'SKETCH'`) geteilt → 2 gültige Körper ohne Fehler (`GeomCheck` 0 Funde), Gesamtvolumen bleibt `8 000 mm³`, gekrümmte Trennfläche vorhanden; „Behalten“ und „Spalt“ (`4 mm`) funktionieren.
- [x] **Quader an Fläche & Bezugsebene teilen + Hilfen**: Teilen an schräger Bezugsebene sowie an gekrümmter Zylindermantelfläche (`plane: 'FACE'`) erzeugt jeweils 2 gültige Körper mit erhaltenem Gesamtvolumen; Profi-Schaltflächen im Einfach-Modus verborgen; `HELP.patternGrowth`, `HELP.splitAdvanced` und Rückgängig geprüft.
- [ ] **Von Hand**: Im Browser beim Teilen „Mit Skizze teilen“ anklicken, einen freien S-Spline quer durch einen Quader zeichnen, „Fertig“ klicken und beide Hälften mit „Spalt“ auseinanderrücken.

## Füllmuster auf Fläche, Muster an Skizzenpunkten und aus Tabelle (Auto [A-128], KP-44, KP-45)

- [x] **Waben-Füllmuster in Platte 60×40×5 (`fillPattern`)**: Im Profi-Modus über `#ctx-fill-pattern` (in „Einfach“ ausgeblendet) angelegt → Waben (`SW 6`, Abstand `8`, Randabstand `4`) erzeugen gültige Durchbrüche ohne Rand-Schnitt (`outerSides == 4`, alle Lochwände strikt innerhalb des Randabstands, `GeomCheck` 0 Funde); Umschalten auf Raster/Versetzt, Randabstand `8`, Sackloch-Tiefe `2 mm` und Unterdrücken funktionieren fehlerfrei.
- [x] **Muster an 4 Skizzenpunkten (`pt: 'points'`)**: Bohrung über `Features.patternPoints` mit 4 Punkten im Punkt-Skizzenmodus → exakt 4 zylindrische Bohrungen exakt an den 4 Skizzenpunkten (`GeomCheck` 0 Funde), Skip-Chips lassen einzelne Punkte aus, und `#op-points-source` übernimmt Punkte einer bestehenden Skizze.
- [x] **Muster aus CSV-Tabelle (`pt: 'table'`)**: Quader `6×6×6` über `Features.patternTable` mit 3 CSV-Zeilen (`x;y;z`) → exakt 3 getrennte Kopien mit Gesamtvolumen `648 mm³` (`GeomCheck` 0 Funde), Relativ-Modus (`dX/dY/dZ/rot`), Hilfetexte (`werkzeug-hilfen.json`/`HELP`), DE/EN-Schlüsselgleichheit und Befehlssuche ohne Fehler.
- [ ] **Von Hand**: Im Browser auf eine beliebige Fläche mit Durchbruch ein gedrehtes Waben-Füllmuster setzen, eine Schraube an eigenen Skizzenpunkten vervielfachen und eine `.csv`-Datei über „CSV laden …“ einlesen.

## Volltest-Reparatur (Auto [F-11250536])

- [x] **Skizzen-Koordinaten ohne Timer-Verzögerung**: `Measure` aktualisiert `#coords` im Skizzenmodus direkt bei `pointermove`, sodass die Skizzen-Lage selbst bei blockiertem `setTimeout` sofort erscheint (`t_koordinaten`, `t_f11250536`).
- [x] **Befehlssuche „Fläche auf Fläche“**: `Commands.score()` wertet Wortanfänge nach Satzzeichen wie `(` und exakte zusammenhängende Phrasen im Befehlsnamen höher, sodass `mate-planar` bei „fläche auf fläche“ trotz vieler neuer Flächen-Befehle auf Platz 1 steht (`t_a086_verbindungen_zyl_eben`, `t_f11250536`).
- [x] **Drehteller-Video über 2D-Puffer**: `Print.turntable()` bevorzugt `vp8` und kopiert jedes Einzelbild über einen 2D-Puffer-Canvas mit `captureStream(0)` + `requestFrame()`, sodass die Aufnahme auch bei hoher Systemlast oder blockiertem `requestAnimationFrame` stabil ein echtes Video liefert (`t_drehteller`, `t_f11240521`, `t_f11250536`).
- [ ] **Von Hand**: Im Browser in der Skizze über die Zeichenfläche fahren, über die Eingabezeile „fläche auf fläche“ suchen und ein 6-Sekunden-Drehteller-Video herunterladen und abspielen.

## Varianten-Tabelle zum Ausfüllen (Auto [A-132], KP-52)

- [x] **Profi-Sichtbarkeit & 3-Zeilen-Tabelle**: `#var-table` ist im Einfach-Modus verborgen und öffnet im Profi-Modus den Dialog `#var-table-dlg`; über „Zeile hinzufügen“ angelegte 3 Zeilen („Klein“ 10/20/`PLA`, „Mittel“ 20/25/`Alu 6061`, „Groß“ 30/30/`CFK`) werden direkt in `App.doc.variants` gespeichert.
- [x] **Zeilenklick schaltet Variante & Werkstoff**: Klick auf Zeile 3 und anschließend auf Zeile 2 schaltet Breite, Tiefe, 3D-Hüllmaße (`20×25×10`) sowie den Projekt-Werkstoff (`Alu 6061`) um und markiert die aktive Zeile (`.vt-row.on`).
- [x] **CSV-Export & -Reimport**: `Variants.toCSV()` exportiert `Variante;Breite;Tiefe;Werkstoff`, nach Leeren stellt `Variants.importCSV()` alle 3 Zeilen mit gleichen Maßen und Werkstoffen wieder her (ohne Duplikate bei erneutem Import), und ein Klick auf Zeile 2 setzt wieder Breite `20` und `Alu 6061`.
- [x] **Varianten-Vergleich, Rückgängig, Migration & Hilfe**: `#vt-cmp` zeigt die Werkstoff-Spalte mit korrektem Gewichts-Unterschied (`Alu 6061` > `PLA`), `App.undo()` macht den Varianten-Wechsel rückgängig, `Model.migrate` erhält `v.material`, `HELP.variantTable` und Befehl `variants-table` sind vorhanden.
- [ ] **Von Hand**: Im Browser im Profi-Modus eine Varianten-Tabelle mit 4 Zeilen und Formeln ausfüllen, über „CSV exportieren“ speichern, in Excel/Numbers bearbeiten, wieder über „CSV importieren“ laden und beim Umschalten prüfen, ob Werkstoff-Optik (z. B. Alu vs. PLA) und Maße im 3D-Bild sofort wechseln.

## Vergleich zweier Versionen/Körper & Schattenriss-Fläche (Auto [A-133], PF-12, PF-15)

- [x] **Profi-Menü & Befehlssuche**: `#t-check` bleibt im Modus „Einfach“ ausgeblendet; im Profi-Modus öffnet das Prüfen-Menü `#check-compare` und `#check-silhouette` (`t_a133_vergleich_schattenriss`).
- [x] **Versionen-Vergleich (Quader vs Quader mit Bohrung)**: Quader `20×20×20` als Version gespeichert, anschließend Bohrung `Ø6` (`V = π·9·20 ≈ 565,49 mm³`) ergänzt → `Versions.compare` zeigt entfernte Bohrung rot (`removedVolume ≈ 565,49 mm³`), unveränderten Rest grau (`sameVolume ≈ 7434,51 mm³`), `addedVolume < 0,1` sowie funktionierendes Ausblenden über `#cmp-show` (`t_a133_vergleich_schattenriss`).
- [x] **Körper-Vergleich & Zwei gespeicherte Versionen**: Quader `20×20×20` und Quader `20×20×20` mit Bohrung `Ø8` (`V ≈ 1005,31 mm³`) im selben Projekt verglichen (automatische Mitten-Ausrichtung, Tauschen über `#cmp-swap` kehrt rot/grün sauber um) sowie zwei gespeicherte Versionen mit `Versions.compareVersions` verglichen (`t_a133_vergleich_schattenriss`).
- [x] **Schattenriss-Fläche in Blickrichtung (`mm²`)**: Würfel `10×10×10` von vorn (`camera` / `front`) misst `≈ 100 mm²` (`99,88 mm²` bei `1024×1024`), schräge Ansicht (`iso`) steigt auf `> 130 mm²`, Würfel mit Durchgangsbohrung `Ø4` sinkt auf `≈ 100 − 4π mm²`; Hilfetexte (`werkzeug-hilfen.json`/`HELP`) und DE/EN-Schlüsselgleichheit geprüft (`t_a133_vergleich_schattenriss`).
- [ ] **Von Hand**: Im Browser zwei leicht unterschiedliche Bauteile übereinanderlegen, einzelne Farb-Chips (`Neu` / `Weg` / `Gleich`) ein- und ausblenden sowie die Schattenriss-Fläche auf einer schräg angeklickten Fläche prüfen.

## Aufkleber, Logos und Texturen (Auto [A-136], AN-15, AN-16)

- [x] **Aufkleber auf Fläche (PNG, JPG, SVG)**: Auf der Oberseite eines Quaders werden `#decal-sec`, `#btn-add-decal` und `#ctx-decal` angezeigt; SVG und PNG werden über `Actions.parseDecalFile` ohne Verlust der Transparenz geladen und auf die Fläche gelegt (`decalGroup` im 3D-Bild, `t_a136_aufkleber_texturen`).
- [x] **Verschieben, Drehen, Skalieren & Löschen**: `#dc-u-*`, `#dc-v-*`, `#dc-rot-*` und `#dc-scale-*` verschieben, drehen und skalieren den Aufkleber im Modell und am Three.js-Mesh synchron; Entfernen über `#dc-del-*` und `App.undo()` stellen ihn wieder her (`t_a136_aufkleber_texturen`).
- [x] **Körper-Texturen (Holz, Metall gebürstet, Karbon)**: `#item-texture` lädt die lokalen Dateien `holz.png`, `metall-gebuerstet.png` und `karbon.png` aus `app/assets/textures/`, erzeugt automatische UV-Koordinaten (`ensureMeshUVs`) und übernimmt Skalierung und Drehung (`t_a136_aufkleber_texturen`).
- [x] **Speichern, Laden, Hilfe & Übersetzung**: Nach Speichern über `Start.projectPayload()` und Laden über `Start.openBlob()` bleiben Aufkleber samt Lage/Drehung/Skalierung sowie Holz-Textur samt geladener `THREE.Texture` vollständig erhalten; `HELP.decal`, `HELP.bodyTexture`, Befehle und DE/EN-Texte sind vorhanden (`t_a136_aufkleber_texturen`).
- [ ] **Von Hand**: Im Browser ein eigenes PNG-Logo mit durchsichtigem Hintergrund auf eine Quader-Fläche legen, verschieben/drehen, anschließend auf Karbon-Textur umschalten und per Auge die Nahtlosigkeit an den Kanten prüfen.

## Rändel und Griffmuster (Auto [A-131], KP-50)

- [x] **Gekreuztes Rändel auf Zylinder `d=20` mit Teilung `1`**: Über Kontextleiste `#ctx-knurl` (im Einfach-Modus verborgen) angelegt → Oberfläche steigt deutlich (`> 1,05×`), maximaler Durchmesser bleibt `≤ 20,0 mm`, `GeomCheck` 0 Funde, `Model.dependencies`, Unterdrücken und Rückgängig geprüft (`t_a131_raendel_griffmuster`).
- [x] **Gerades, schräges & Teil-Rändel**: Umschalten auf `straight` und `angled` sowie Teil-Rändel (`length: 12`, `margin: 2`) auf abgesetzter Welle erzeugen gültige Geometrie mit größerer Oberfläche ohne Überschreitung des Außendurchmessers (`t_a131_raendel_griffmuster`).
- [x] **Griffmuster Rillen & Noppen (Fläche & Zylinder)**: Rillen (`v`/`round`, vertieft & erhaben auf Quader und Ringrillen auf Zylinder) sowie versetzte Halbkugel-Noppen (`bumps` auf Quader-Oberseite und Zylindermantel) verändern Volumen und Oberfläche erwartungsgemäß ohne Geometriefehler; Erklärungen (`Explain.local`), Befehle (`Commands.search`), Hilfetexte (`werkzeug-hilfen.json`) und DE/EN-Schlüsselgleichheit geprüft (`t_a131_raendel_griffmuster`).
- [ ] **Von Hand**: Im Browser ein schräges Rändel auf einem abgestuften Drehknopf und ein Noppen-Griffmuster auf einer gekrümmten Griffhülse im 3D-Bild optisch prüfen.

## Boden mit Spiegelung und Licht von Hand (Auto [A-135], AN-11, AN-12)

- [x] **Einfach & Profi Zugang**: `#look-panel` öffnet in „Einfach“ über `#proj-look-open` und `#t-more` (`#more-look-panel`) sowie in „Profi“ über `#t-views` (`#look-studio-panel`) und Befehlssuche (`t_a135_boden_licht`).
- [x] **Studio-Boden mit Spiegelung (`AN-11`)**: `#look-floor-reflect` schaltet den Studio-Boden sichtbar (`reflectivity > 0`, `clearcoat > 0`), `#look-floor-strength` auf `85` steigert `reflectivity > 0,8`, Ausschalten setzt `visible = false` und `reflectivity = 0` (`t_a135_boden_licht`).
- [x] **Eigenes Umgebungsbild (`AN-11`)**: Laden eines PNG- und eines Radiance-`.hdr`-Umgebungsbildes über `#look-env-input` aktiviert `Viewer.hasCustomEnv` samt Dateiname in `#look-env-status`; `#look-env-clear` kehrt sauber zur Standard-Umgebung zurück (`t_a135_boden_licht`).
- [x] **Lichter von Hand (`AN-12`)**: `#look-manual-lights` wechselt auf 1 Richtungslicht, `#look-light-add` ergänzt ein 2. und 3. Licht (ab 3 deaktiviert); Farbe `#ff6600`, Azimut `-90°`, Höhe `40°` und Stärke `3,2` erscheinen exakt am 2. Licht in `Viewer.scene`; Entfernen und „Standard-Lichter“ funktionieren (`t_a135_boden_licht`).
- [x] **Persistenz, Hilfen, DE/EN & Befehle**: `ViewPrefs.exportData()` / `importData()` sichert Boden und Lichter; `werkzeug-hilfen.json`/`HELP` und DE/EN-Schlüssel sind vollständig (`t_a135_boden_licht`).
- [ ] **Von Hand**: Im Browser ein hochglänzendes Metallteil (z. B. Alu oder Chrom) auf den spiegelnden Studio-Boden stellen, ein echtes 360°-HDR-Panorama laden und die drei Lichter farbig um das Modell drehen.

## Druck-Kosten und Prüfbericht als PDF (Auto [A-134], PF-17, PF-18)

- [x] **3D-Druck-Schätzung (Würfel 20 mm, 20 % Füllung, 25 €/kg)**: `#proj-print-cost` öffnet `#print-cost-dlg`, schätzt Filamentmenge (g & m), Materialkosten (`costEur > 0`, plausibel ca. 0,10 €) und Druckzeit aus Volumen, Oberfläche, Füllung und Drucker-Profil (`Print.estimatePrint`), reagiert live auf Füllung (100 % > 20 %), Kilopreis (50 €/kg = 2× Kosten) und Drucker-Profil (`ender-3` langsamer als `bambu-a1`) (`t_a134_druckkosten_pruefbericht`).
- [x] **Prüfbericht als PDF (lokal erzeugt)**: `#proj-report-pdf` öffnet `#report-pdf-dlg` mit 3D-Vorschaubild, Maßen, Volumen, Masse und Wandstärke; `#rep-download` lädt eine gültige `%PDF-1.4`-Datei mit eingebettetem JPEG (`/Subtype /Image`, `/Filter /DCTDecode`) sowie `Volumen`, `Masse` und `Wandst` (`t_a134_druckkosten_pruefbericht`).
- [x] **Einfach & Profi, Hilfen, Übersetzung & Befehlssuche**: Knöpfe im Projekt-Panel, im Mehr-Menü (`#t-more` in „Einfach“) und im Prüfen-Menü (`#t-check` in „Profi“), Hilfetexte (`printCost`, `reportPdf` in JSON/`HELP`), DE/EN-Schlüsselgleichheit und Befehle `print-cost` / `report-pdf` geprüft (`t_a134_druckkosten_pruefbericht`).
- [ ] **Von Hand**: Im Browser bei einem komplexen Modell mit dünner Wand und mehreren Teilen den Dialog „Druckkosten & Zeit“ anpassen und den erzeugten PDF-Prüfbericht in einem PDF-Viewer öffnen, um Layout, Umlaute, €-Zeichen, Bildqualität und Teileliste visuell zu prüfen.

## „Was ist das?“-Modus (Auto [A-140], BE-32)

- [x] **Einfach & Profi in der Kopfleiste**: Knopf `#btn-whatis` ist in „Profi“ und „Einfach“ sichtbar, die Kopfleiste läuft in „Einfach“ nicht um oder über (`t_a140_was_ist_das`).
- [x] **Erklärung statt Ausführung**: Bei aktivem Modus (`body.whatis-mode`, `UI.whatIsActive`) bleibt ein offenes Körper-Flyout beim Klick auf `?` offen; ein Klick auf „Quader“ öffnet `#whatis-pop` mit Du-Form-Erklärung ohne einen Quader anzulegen (`App.doc.items.length === 0`); Klicks auf „Skizze“, „Profi“ und „Maße“ zeigen passende Erklärungen ohne Seiteneffekte (`t_a140_was_ist_das`).
- [x] **Esc & Beenden, Schritte, DE/EN & Hilfen**: `Esc` beendet den Modus sauber, danach legt ein Klick auf „Quader“ den Körper normal an; Zeitleisten- und Verlaufs-Schritte werden über `Explain.describeElement` erklärt; DE/EN-Schlüsselgleichheit, `HELP.whatIsThis` und Befehlssuche (`what-is-this`) sind geprüft (`t_a140_was_ist_das`).
- [ ] **Von Hand**: Im Browser den „Was ist das?“-Modus einschalten, den Mauszeiger über verschiedene Werkzeugleisten-Knöpfe, Skizzen-Werkzeuge und einen 3D-Körper fahren und optisch prüfen, dass Fragezeichen-Cursor, gestrichelte Vorschau-Markierung und die Position des Erklär-Popovers stimmen.

## Kommentar-Pins und Arbeitsflächen-Anordnung (Auto [A-139], BE-28, BE-29)

- [x] **Kommentar-Pins am Modell setzen (`BE-28`)**: Über `#t-notes` → `[data-ntool="pin"]` direkt auf eine Modellfläche geklickt und Text `'Wand hier verstärken'` eingegeben → `.note-pin` erscheint an der 3D-Stelle, im Verlauf `#pin-tree`, ohne Eintrag im CAD-Kern oder der Zeitleiste (`t_a139_pins_arbeitsflaechen`).
- [x] **Erledigt-Haken, Pin-Liste & Rückgängig**: Zweiten Pin gesetzt, Pin 1 über `[data-pin-done]` als erledigt abgehakt (`.note-pin.done`, `(1/2)` in `#pin-tree`), Filter in `#pins-dialog` (`Alle` / `Offen`) und `App.undo()`/`App.redo()` geprüft (`t_a139_pins_arbeitsflaechen`).
- [x] **Speichern & Laden der Projektdatei**: Projekt über `Start.projectPayload()` gesichert, geleert und über `Start.openBlob()` wieder geladen → beide Pins mit Text und Erledigt-Status sind im Modell, im Bild und in `#pin-tree` wieder da (`t_a139_pins_arbeitsflaechen`).
- [x] **Arbeitsflächen-Anordnung speichern & wechseln (`BE-29`)**: Breite des Verlaufs auf `310 px` gesetzt, als Arbeitsfläche `'Zeichnen'` über `#btn-workspace` → `#ws-menu-save` gespeichert, linkes Panel über `#btn-left-close` geschlossen und Seiten über `#ws-menu-swap` getauscht; beim Laden von `'Zeichnen'` öffnet das linke Panel wieder mit `310 px` Breite auf der linken Seite (`t_a139_pins_arbeitsflaechen`).
- [x] **Hilfetexte, DE/EN & Befehle**: `commentPins` und `workspaceLayout` in `werkzeug-hilfen.json`/`HELP`, Tooltip auf `#btn-workspace`, DE/EN-Schlüsselgleichheit und Befehlssuche (`comment-pin`, `workspace-manage`) geprüft (`t_a139_pins_arbeitsflaechen`).
- [ ] **Von Hand**: Im Browser mehrere Kommentar-Pins an verschiedenen Seiten eines komplexen Modells setzen, per Klick in der Pin-Liste anspringen, die Panel-Breiten per Ziehen an der Trennlinie anpassen und zwischen zwei eigenen Arbeitsflächen hin- und herschalten.

## Kreis-Menü und Malen-Auswahl (Auto [A-138], BE-19, BE-20)

- [x] **Kreis-Menü per Taste `Q` & Befehl ausführen (`BE-19`)**: `Q` öffnet `#radial-menu` mit 8 Einträgen am Mauszeiger; Klick auf „Quader“ schließt das Menü und legt einen Quader an (`t_kreis_malen`).
- [x] **Kreis-Menü anpassen & Rechtsklick-Halten (`BE-19`)**: Über `#radial-config-btn` lassen sich alle 8 Plätze frei belegen und in `tracery-kreismenue` speichern; rechte Maustaste > 320 ms halten öffnet das Kreis-Menü mit der geänderten Belegung, kurzer Rechtsklick öffnet weiterhin das Kontextmenü (`t_kreis_malen`).
- [x] **Malen-Auswahl über mehrere Flächen & Kanten (`BE-20`)**: Überstreichen von 3 Quader-Flächen mit gedrückter linker Maustaste wählt alle 3 Flächen (`App.faces.length == 3`, Statusleiste und Kontextleiste zeigen „3 Flächen“); im Kanten-Modus wählt Streichen mehrere Kanten, `Alt`-Streichen wählt wieder ab, `Esc` / „Fertig“ beendet den Modus (`t_kreis_malen`).
- [x] **Hilfen, DE/EN-Texte & Befehle**: `werkzeug-hilfen.json`/`HELP` enthalten `radialMenu` und `paintSelect`, DE/EN-Schlüssel sind gleich, Befehlssuche findet Kreis-Menü und Malen-Auswahl (`t_kreis_malen`).
- [ ] **Von Hand**: Im Browser mit rechter Maustaste kurz gedrückt halten, direkt auf ein Feld ziehen und loslassen (flüssige Geste ohne zweiten Klick) sowie auf einem abgerundeten Bauteil mit Malen-Auswahl mehrere Flächen einfärben und Kantenketten abrunden.

## Als App installieren & ohne Internet nutzbar (Auto [A-142], BE-23)

- [x] **Manifest & lokale Symbole ohne Fremd-Anfragen**: `<link rel="manifest" href="manifest.webmanifest">` liegt in `<head>`, `manifest.webmanifest` liefert `short_name: "Tracery"`, `display: "standalone"` und gültige lokale Symbole (`app-icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`); auf der Seite und beim Laden entstehen null externe HTTP-Anfragen (`t_a142_pwa_offline`).
- [x] **Service Worker & lokaler Voll-Cache**: `app/sw.js` ist registriert und aktiv (`PWA.status().offlineReady === true`), und der Cache `tracery-offline-*` enthält alle Programmdateien inklusive `index.html`, `./`, `occ-kernel.wasm`, `kernel/worker.js`, `kernel/core.js`, Three.js-Modulen, Schriften und Symbolen (`t_a142_pwa_offline`).
- [x] **Start & CAD-Berechnung ohne Internet**: Mit abgeschaltetem Netz (`set_offline(True)`) lädt ein Neuladen der Seite Tracery fehlerfrei auf die Startseite und ein Quader wird samt Web Worker und `occ-kernel.wasm` komplett offline berechnet (`V = 8000 mm³`, `t_a142_pwa_offline`).
- [x] **Einstellungen, Anleitung, Hilfe & DE/EN**: `#set-pwa-box` („Als App installieren & ohne Internet nutzen“) erscheint in Einfach und Profi mit Statuspunkt, öffnet die Chrome/Edge/Safari-Anleitung (`#pwa-guide-dlg`) bzw. bei `beforeinstallprompt` `#set-pwa-install`, und `installApp`-Hilfe, Befehl `install-app` sowie DE/EN-Schlüsselgleichheit sind geprüft (`t_a142_pwa_offline`).
- [ ] **Von Hand**: Tracery über HTTPS oder `localhost` in Chrome/Edge („App installieren“) bzw. Safari auf Mac/iPad („Zum Dock hinzufügen“ / „Zum Home-Bildschirm“) als eigenständige App installieren, das Symbol im Dock/Startbildschirm prüfen und anschließend bei getrenntem WLAN starten.

## Tastaturbedienung, hoher Kontrast und Vorlese-Texte (Auto [A-141], BE-24)

- [x] **Nur mit Tastatur bis zum Quader (`BE-24`)**: In einem leeren Projekt per `Tab` bis `#t-body` (sichtbarer Fokusrahmen), `Enter` öffnet das Körper-Flyout, `Tab` zur Quader-Kachel (`data-kind="box"`), `Esc` schließt wieder mit Fokus zurück auf `#t-body`, erneutes `Enter` + `Tab` + `Enter` legt den Quader an (`t_a141_barrierefreiheit`).
- [x] **Esc & Tab-Erreichbarkeit**: `Esc` schließt Menüs, Einstellungen und Werkzeuge-Dialog; linkes/rechtes Panel, Verlaufseinträge, Zeitleiste, Eingabezeile und ViewCube-Flächen (`tabindex="0"`) sind per Tab erreichbar (`t_a141_barrierefreiheit`).
- [x] **Vorlese-Texte (`aria-label`)**: Kein sichtbarer Knopf oder `role="button"` in Modellansicht, Flyout, Einstellungen, Werkzeugleisten-Dialog, Skizze und Zeichnung bleibt ohne Beschriftung oder Fokusierbarkeit (`t_a141_barrierefreiheit`).
- [x] **Hoher Kontrast, Hilfe & DE/EN**: Einstellung `#set-highContrast` setzt `body.high-contrast` und speichert `highContrast` dauerhaft in `masswerk.view`; `HELP.highContrast`, DE/EN-Schlüsselgleichheit und Befehlssuche (`high-contrast`) geprüft (`t_a141_barrierefreiheit`).
- [ ] **Von Hand**: Im Browser ein komplettes Teil nur per Tastatur (Tab, Pfeiltasten, Enter, Esc) im Modus „Hoher Kontrast“ (hell & dunkel) erstellen und mit VoiceOver (macOS) oder NVDA (Windows) prüfen, ob alle Symbolknöpfe verständlich vorgelesen werden.

## Volltest-Reparatur (Auto [F-11250803])

- [x] **Schraubenlöcher bei kaltem CAD-Kern**: Nach „Leeres Projekt“ (Kern noch im Zustand `idle` durch A-054) wartet `t_schrauben` per `warte_rechnen()` zuverlässig auf den ersten Kern-Start und jede `#lp-fit`/`#lp-size`-Änderung, sodass M3 `3,4 / 3,2 / 2,5 mm` und M1.6 ohne Fehler gelingen (`Schraubenlöcher`, `t_f11250803`).
- [x] **Befehlssuche „Fläche auf Fläche“ (`[A-086]`)**: `Commands.search('fläche auf fläche')` liefert `mate-planar` auf Platz 1 und `Commands.search('zylindrisch')` findet `mate-cyl` (bereits durch `[F-11250536]` repariert, im Volltest-Nachlauf bestätigt: `t_a086_verbindungen_zyl_eben`, `t_f11250803`).
- [ ] **Von Hand**: Im Browser über „Leeres Projekt“ (ohne vorher geladenen Kern) ein Schraubenloch M3 anlegen, Passung von Mittel auf Eng und Kernloch umschalten und in der Eingabezeile „fläche auf fläche“ suchen.

## Krümmungsglatte Rundung, Schritt 1 (Auto [A-145], KP-40)

- [x] **Form-Wahl (Profi vs. Einfach) & Quader-Volumen**: Quader (`40 × 30 × 20`) an einer Kante mit `r = 5 mm` rundet normal (`V ≈ 23892,7 mm³`), bietet im Profi-Modus `#fin-shape-…` (`Rund` / `Krümmungsglatt (G2)`), rechnet nach Umschalten auf `g2` ohne Fehler mit Volumen sauber zwischen ungerundet und normal rund (`23892,7 < V_g2 ≈ 23931,8 < 24000`) und blendet die Wahl in „Einfach“ aus (`t_a145_rundung_g2`).
- [x] **Speichern & Laden erhält Wahl**: Nach Projekt-Export und erneutem Laden über `Model.migrate` / `App.load` bleibt `fin.shape === 'g2'`, die Auswahl im Panel zeigt `Krümmungsglatt (G2)` und das Volumen bleibt identisch ohne Fehler (`t_a145_rundung_g2`).
- [x] **Konkave Kante, Zylinder-Kreiskante, variabler Radius, Hilfen & DE/EN**: Innere Kante an L-Winkel (`r = 4`), Zylinder-Oberkante (`r = 3`) und veränderliche G2-Rundung rechnen fehlerfrei; zu großer Radius meldet `toobig`; `HELP.filletG2` und `werkzeug-hilfen.json` sind gleich, DE/EN-Schlüssel komplett gleich, Befehl `fillet-g2` und `Explain.local` geprüft (`t_a145_rundung_g2`).
- [ ] **Von Hand**: Im Browser einen Quader mit „Studio-Look“ und einer krümmungsglatten Rundung (`G2`) neben einer normalen runden Kante vergleichen und die weicher einlaufenden Lichtreflexe auf der G2-Fläche prüfen.

## Alles als Paket (ZIP) und Sicherheit beim Einlesen (Auto [A-143], IO-18, PL-16)

- [x] **Einfach & Profi, Hilfe und Befehlssuche**: Knopf `#ex-bundle-btn` („Alles als Paket speichern“) ist sowohl in „Einfach“ als auch in „Profi“ im Export-Dialog sichtbar; Hilfetext `exportBundle` und Befehl `export-bundle` sind vorhanden (`t_paket_und_sicherheit`).
- [x] **Alles als Paket (ZIP) mit 2 Körpern (`IO-18`)**: Exportiert über `#ex-bundle-btn` ein `<Name>-Paket.zip` mit der Projektdatei (`.tracery.json`, 2 Körper), den technischen Zeichnungen (`Zeichnungen/<Name>.pdf` als gültiges `%PDF-`), exakt einer `.step`-Datei, genau zwei STL-Dateien (`STL/Deckel.stl`, `STL/Boden.stl`) sowie `LIESMICH.txt` (`t_paket_und_sicherheit`).
- [x] **SVG-Schutz ohne Ausführung (`PL-16`)**: SVG mit `<script>`, `onclick`-Handler, `<style>@import …</style>` und externen `href`-Links wird ohne Skriptausführung eingelesen (`window.__a143_xss === 0`), die Skripte/Handler/Links werden entfernt (`Start.lastSvgSanitize`), das Rechteck (40 × 20 mm) sauber importiert und ein Hinweis-Toast angezeigt; SVG-Aufkleber (`Actions.parseDecalFile`) und `Model.normalizeDecal` bereinigen unsichere Inhalte ebenso (`t_paket_und_sicherheit`).
- [x] **Größenlimits, Dateiformat, Prototype-Pollution & ZIP-Schutz**: Übergroße Dateien (`Store.checkFileSize`), nicht unterstützte Endungen (`virus.exe`), `__proto__`-Schlüssel in JSON (`Store.safeParseJSON`) und `..`-Pfade in ZIPs (`Zip.read`) werden mit klaren deutschen Meldungen abgewiesen (`t_paket_und_sicherheit`).
- [ ] **Von Hand**: Im Browser ein Projekt mit mehreren Körpern und einer bemaßten Zeichnung sowohl in „Einfach“ als auch in „Profi“ über Projekt-Menü und Export-Dialog als Paket herunterladen, entpacken und die erzeugte PDF-Zeichnung, STEP und STLs in einem externen Viewer öffnen sowie eine große (> 8 MB) oder fremde Datei per Drag-and-Drop ins Fenster ziehen.

## Technische Illustration und vier Ansichten (Auto [A-137], AN-17, AN-18)

- [x] **Profi-Sichtbarkeit**: `#disp-illustration` und `#view-quad` sind im Einfach-Modus ausgeblendet und im Profi-Ansichtsmenü (`#t-views`) verfügbar (`t_a137_illustration_vierfach`).
- [x] **Technische Illustration (`AN-17`)**: `#disp-illustration` schaltet `body.tech-illustration` mit rein weißem Hintergrund (`rgb(255, 255, 255)`), weißen Flächen ohne Werkstoff-/Flächenfarben oder Boden-Schatten sowie dunklen Kanten (`#11161c`) und Silhouetten-Umriss (`n.outline`) ein; Zurückschalten auf `#disp-edges` stellt die normale Darstellung wieder her (`t_a137_illustration_vierfach`).
- [x] **Vierfach-Ansicht (`AN-18`)**: `#view-quad` teilt das 3D-Fenster in vier Bereiche (Vorn, Oben, Rechts, Schräg) mit eigenen Kameras und `OrbitControls`; Ziehen in einem Bereich dreht nur diesen Bereich, `.quad-reset` und `.quad-proj` (Ortho/Persp) steuern ihn gezielt, `#quad-close` kehrt sauber zur Einzelansicht zurück (`t_a137_illustration_vierfach`).
- [x] **Hilfen, DE/EN & Befehle**: `HELP.illustration`/`HELP.quadView`, DE/EN-Schlüsselgleichheit und Befehlssuche (`disp-illustration`, `quad-view`) geprüft (`t_a137_illustration_vierfach`).
- [ ] **Von Hand**: Im Browser einen abgerundeten Körper mit Bohrungen in „Technische Illustration“ drehen, die Kanten- und Umrissqualität (auch per „Bild speichern“) prüfen und in der Vierfach-Ansicht gleichzeitig aus allen vier Blickrichtungen modellieren.

## Trackpad-, Touch- und Stift-Gesten (Auto [A-148], BE-21)

- [x] **Einstellung in Einfach & Profi**: `#set-gestures` ist in den Einstellungen in „Einfach“ und „Profi“ sichtbar, standardmäßig aktiv (`ViewPrefs.gestures === true`, `Viewer.gestures === true`) und trägt `data-help="touchGestures"`.
- [x] **Zwei-Finger-Zoom & Trackpad-Gesten**: Simulierte Zwei-Finger-Touch-Geste (Zusammenziehen/Aufziehen via CDP `dispatchTouchEvent`) verändert den Kamera-Abstand deutlich; Trackpad-Pinch (`WheelEvent` mit `ctrlKey`), Zwei-Finger-Wischen (Drehen in 3D, mit `Shift` oder in der Skizze Verschieben) funktionieren erwartungsgemäß.
- [x] **Langes Drücken öffnet Rechtsklick-Menü**: Langes Berühren (`500 ms`) auf einem Körper öffnet `.menu[role="menu"]` mit `#cm-dup` und bleibt nach `touchEnd` ohne Kamerasprung geöffnet.
- [x] **Stift in der Skizze & Zahleneingabe**: Stift-Strich (`pointerType: 'pen'`) zeichnet in der Skizze exakt mit feinerer Toleranz und schließt beim Abheben ab; anschließender Einzel-Touch (Handballen) wird ignoriert; `DragInput` lässt sich per `#drag-input-ok` bestätigen.
- [x] **Einstellung aus → Gesten ohne Wirkung**: Bei `#set-gestures` aus bleiben Zwei-Finger-Touch, Trackpad-Pinch/Wischen und langes Drücken ohne Wirkung, während das klassische Mausrad weiter zoomt; `HELP.touchGestures`, `toggle-gestures` und DE/EN-Schlüsselgleichheit geprüft (`t_a148_gesten`).
- [ ] **Von Hand**: Auf einem Notebook-Trackpad (macOS/Windows) sowie am Tablet (iPad mit Finger & Apple Pencil) zwei Finger zum Drehen, Schieben und Zoomen, langes Drücken fürs Menü sowie das Zeichnen per Stift in der Skizze ausprobieren.

## Verlauf abschalten: freies Bearbeiten, Schritt 1 (Auto [A-147], KP-54)

- [x] **Profi-Schalter & Verlauf abschalten**: `#chk-no-history` ist in „Einfach“ ausgeblendet und in „Profi“ sichtbar; ein 3-Schritte-Teil (Quader vereinigt mit Zylinder minus Aussparung) wird beim Einschalten sauber als BREP eingefroren, Verlauf-Liste (`#left-body .node`, `.tree`) und Zeitleiste (`#timeline .tl-chip`) sind leer bei unverändertem Volumen und Hüllmaßen (`t_verlauf_abschalten`).
- [x] **Direkte Bearbeitung & Rückgängig**: Bohrung setzen (`Place.holeWizard`), Kantenrundung (`Actions.addFinish`) und Verschieben wirken direkt am eingefrorenen Körper ohne neue Schritte; 3× `App.undo()` und `App.redo()` stellen jeden Zwischenstand exakt wieder her (`t_verlauf_abschalten`).
- [x] **Zurückschalten & Metadaten**: Zurückschalten fragt per Bestätigungs-Dialog (`#nh-resume-cancel` / `#nh-resume-ok`) nach und legt den eingefrorenen Stand als ersten Schritt im neuen Verlauf an; `HELP.noHistory`, Befehl `toggle-no-history` und DE/EN-Schlüsselgleichheit geprüft (`t_verlauf_abschalten`).
- [ ] **Von Hand**: Im Browser in „Profi“ ein Teil mit mehreren Schritten anlegen, „Ohne Verlauf arbeiten“ aktivieren, den Körper per Ziehgriff im Bild verschieben, per Rechtsklick-/Kontextleiste eine Bohrung setzen und abrunden, mit `Strg Z` zurückgehen und über „Verlauf einschalten“ wieder mit einzelnen Schritten weiterbauen.

## Krümmungsglatte Rundung, Schritt 2: Ecken-Übergänge (Auto [A-146], KP-40)

- [x] **3-Kanten-Ecke mit Kugel-Ecke & Weichem Übergang (G2 & Rund)**: Quader (`30 × 30 × 30`), drei Kanten an einer Ecke mit `r = 5 mm` gerundet, liefert im Profi-Modus `#fin-corner-…` (`Kugel-Ecke` / `Weicher Übergang`), baut für `G2 + Kugel-Ecke`, `G2 + Weicher Übergang`, `Rund + Weicher Übergang` und `Rund + Kugel-Ecke` jeweils einen geschlossenen 10-Flächen-Körper mit 0 Fehlern und grüner Geometrie-Prüfung (`GeomCheck.run` ohne Lücke/Selbstschnitt/winzige Kante) sowie deutlich unterschiedenen Eck-Volumina (`t_a146_ecken_uebergaenge`).
- [x] **Einfach/Profi, Speichern/Laden & alle 12 Kanten**: Im Modus „Einfach“ ist `#fin-corner-…` ausgeblendet, in „Profi“ wieder sichtbar; Export/Neu-Laden über `Model.migrate` erhält `shape: 'g2'` und `corner: 'smooth'` mit identischem Volumen; alle 12 Kanten eines Würfels (8 Ecken) mit `G2 + Weicher Übergang` erzeugen einen gültigen 26-Flächen-Körper mit grüner Geometrie-Prüfung (`t_a146_ecken_uebergaenge`).
- [x] **Hilfe, DE/EN, Befehlssuche & Erklärung**: `HELP.filletCorner` stimmt mit `werkzeug-hilfen.json` überein, `texte-de.json` und `texte-en.json` sind schlüsselgleich, `Commands.search('eckübergang')` findet `fillet-corner-smooth` und `Explain.local` nennt `weichem Eckübergang` (`t_a146_ecken_uebergaenge`).
- [ ] **Von Hand**: Im Browser einen Würfel an drei zusammenlaufenden Kanten einer Ecke mit `r = 5 mm` und „Krümmungsglatt (G2)“ abrunden, zwischen „Kugel-Ecke“ und „Weicher Übergang“ umschalten und die Lichtreflexe an der Ecke im „Studio-Look“ vergleichen.

## Beispiel-Galerie, Schritt 1 (Auto [A-149], BE-34)

- [x] **8 lokale Beispiele mit Vorschaubildern in Einfach & Profi**: Auf der Startseite ist `#start-examples` sowohl in „Profi“ als auch in „Einfach“ sichtbar und listet mindestens 8 fertige Projekte (`app/data/beispiele/index.json`) mit geladenen lokalen SVG-Vorschaubildern (`data/beispiele/*.svg`), lokalisiert auf Deutsch und Englisch (`t_a149_beispiel_galerie`).
- [x] **Klick öffnet eigene Kopie mit berechneten Körpern**: Klick auf „Handyhalter“ und Laden aller 8 Beispiele (`handyhalter`, `kiste-mit-deckel`, `zahnrad-paar`, `halterung`, `vase`, `schild`, `baugruppe-scharnier` als Baugruppe mit Gelenk, `zeichnung` mit DIN-A4-Zeichnung) erzeugen jeweils fehlerfreie 3D-Körper; Umbenennen/Ändern der Kopie lässt Originaldatei und nächste geöffnete Kopie unverändert (`t_a149_beispiel_galerie`).
- [x] **Hilfe & DE/EN-Schlüssel**: `HELP.exampleGallery` und identische Schlüssel in `texte-de.json`/`texte-en.json` geprüft (`t_a149_beispiel_galerie`).
- [ ] **Von Hand**: Im Browser in „Einfach“ und „Profi“ alle 8 Beispiele auf der Startseite durchsehen, „Vase“, „Baugruppe Scharnier“ (Gelenk bewegen) und „Lagerbock mit Zeichnung“ (Reiter „Zeichnung“ öffnen) anklicken und umbauen.

## Dateiformat offen beschreiben (Auto [A-150], PL-12)

- [x] **`docs/DATEIFORMAT.md` vollständig**: Beschreibt `.tracery.json`-Aufbau (`format: "masswerk"`, `version: 1`, `id`, `name`, `items`, `params`, `settings`, `sketch`, `docType`), Einheiten/Formeln, Versionen sowie `Store.validateProject` samt drei vollständigen JSON-Beispielen (`t_a150_dateiformat`).
- [x] **Beispiele & echte Projekte gültig**: Alle drei Beispiel-Projekte aus `docs/DATEIFORMAT.md` (als JSON-Text und Objekt) sowie Vorlagen (`Templates.LIST[0].build()`) und `Start.projectPayload()` bestehen `Store.validateProject()` fehler- und warnungsfrei; Beispiel 1 („Schild mit Loch“) öffnet über `Start.openBlob` und rechnet fehlerfrei (`t_a150_dateiformat`).
- [x] **Kaputte Dateien & Vorwärtskompatibilität**: Fehlendes oder falsches `format`, fehlendes `version`/`items`/`id`/`name`, fehlendes `kind`, doppelte Schritt-IDs und kaputtes JSON liefern klare deutsche Fehlermeldungen (`ok: false`), während eine neuere `version` oder unbekannte Schritt-Art nur Warnungen auslöst (`t_a150_dateiformat`).
- [ ] **Von Hand**: `docs/DATEIFORMAT.md` einmal durchlesen, eines der Beispiele als `.tracery.json` speichern und per Drag-and-Drop in Tracery öffnen sowie in der Browser-Konsole `Store.validateProject(...)` mit einer eigenen leicht veränderten Datei ausprobieren.

## Volltest-Reparatur (Auto [F-11251012])

- [x] **Automatisches Raster bei `requestAnimationFrame`-Stau (`Raster automatisch`)**: `Viewer.moveCamera(..., false)`, `finishCamAnim()` und `get gridStep()` halten das automatische Raster (`autoStep()`/`buildGrid()`) auch ohne laufende Animations-Frames aktuell (`0,1 mm` nah / `10 mm` fern, `t_raster_auto`, `t_f11251012`).
- [x] **Kamera-Schutz beim kalten Neubau**: Wird die Kamera während eines laufenden Neubaus (z. B. beim ersten Öffnen von „Schild mit Loch“ mit kaltem Kern) bewegt, überschreibt das abschließende `Viewer.fit(null, false)` in `activateTab()` den eingestellten Blick nicht (`t_f11251012`).
- [x] **Automatisches Einpassen ohne Nutzer-Eingriff**: Lädt `App.setDoc()` ein Projekt ohne zwischenzeitliche Kamerabewegung (`Viewer.camMoveSeq` unverändert), passt `Viewer.fit()` die Ansicht nach dem Neubau weiter automatisch ein (`t_f11251012`).
- [ ] **Von Hand**: Im Browser bei gedrosseltem Hauptthread direkt nach dem Öffnen von „Schild mit Loch“ mit dem Mausrad oder `Viewer.moveCamera` nah an eine Kante heranzoomen und prüfen, dass das Raster auf `0,1 mm` wechselt und nach Abschluss des Kern-Starts nicht zurückspringt.

## Kopplungen Schraube, Riemen, linear (Auto [A-152], BG-14)

- [x] **Schraube (Steigung 2 mm → 2 mm/U)**: Zylindrische Schraube (`addScrew(cylId, { pitch: 2 })`) und Zwei-Gelenk-Spindel (`rot` + `slide`) verschieben nach `360°` Drehung exakt um `2,0 mm` (`720° → 4,0 mm`), unterstützen Linksgewinde (`reverse: true` → `-4,0 mm`) und wirken auch rückwärts vom Weg auf den Winkel (`t_a152_kopplungen_schraube_riemen_linear`).
- [x] **Riemen (20 / 40 Zähne & Durchmesser)**: Zwei über `#coupling-dialog` gekoppelte Zahnräder (`20` / `40` Zähne) drehen Rad 2 bei `360°` an Rad 1 genau halb so schnell (`+180°`, real im 3D-Raum geprüft); gekreuzter Riemen kehrt die Richtung um (`-60°` bei `120°`), Durchmessermodus (`30 / 15 mm`) verdoppelt die Drehzahl (`180°` bei `90°`), und Drehen von Rad 2 treibt Rad 1 entsprechend zurück (`t_a152_kopplungen_schraube_riemen_linear`).
- [x] **Linear (Verhältnis & Gegenlauf)**: Zwei Schiebegelenke mit Verhältnis `2×` verschieben bei `10 mm` am ersten Schieber den zweiten um `20 mm`; Umstellen auf `0,5×` gegenläufig ergibt `-5 mm` und wirkt ebenso rückwärts (`t_a152_kopplungen_schraube_riemen_linear`).
- [x] **Abspielen, Rückgängig, Validierung, Profi-Sichtbarkeit & Hilfen**: `#cp-play` animiert beide gekoppelten Teile live ohne `App.revision` zu ändern; `Store.validateProject`, `Strg+Z`, Lösen (`#cp-del`), Ausblenden im Einfach-Modus, DE/EN-Schlüsselgleichheit, Befehlssuche (`couple-screw`, `couple-belt`, `couple-linear`) und Hilfetexte (`coupleScrew`, `coupleBelt`, `coupleLinear`) laufen fehlerfrei (`t_a152_kopplungen_schraube_riemen_linear`).
- [ ] **Von Hand**: Im Browser im Profi-Modus ein zylindrisches Bolzen-Gelenk mit Steigung `2 mm` sowie zwei Zahnräder (`20` und `40` Zähne) per Kontextleiste → „Verbindung“ → „Kopplung“ verbinden, direkt im 3D-Bild mit der Maus ziehen und das gleichzeitige Mitdrehen bzw. Verschieben optisch prüfen.

## Geschlossene Mechanismen lösen (Auto [A-154], BG-16)

- [x] **Viergelenk über volle 360°**: Ein Grashof-Viergelenk aus vier Stäben und vier Drehgelenken dreht bei `30°`, `90°`, `180°`, `270°` und `360°` geschlossen mit (`< 0,01 mm` Spalt an allen vier Gelenken und starren Stablängen, `t_a154_geschlossene_mechanismen`).
- [x] **Kurbeltrieb (R-R-R-P)**: Bei `90°` und `180°` Kurbelwinkel landet der Kolben exakt auf `√2100 mm` bzw. `30,0 mm` ohne Versatz quer zur Führung (`< 0,01 mm`, `t_a154_geschlossene_mechanismen`).
- [x] **Unmögliche Stellung & Meldung**: Sowohl an der Schwinge des Grashof-Viergelenks, am Nicht-Grashof-Viergelenk als auch hinter dem Totpunkt des Kurbeltriebs wird die unmögliche Stellung abgelehnt, `#toasts` zeigt „Dieser Mechanismus klemmt hier“, alle Gelenke bleiben `< 0,01 mm` geschlossen und `Strg+Z` geht sauber zurück (`t_a154_geschlossene_mechanismen`).
- [x] **Profi-Schutz, Live-Ziehen & Abspielen**: Im Einfach-Modus werden geschlossene Gelenkketten abgelehnt; im Profi-Modus bewegen `applyDrag` und `play` alle Glieder gemeinsam (`t_a154_geschlossene_mechanismen`).
- [ ] **Von Hand**: Im Browser im Profi-Modus vier Stäbe als Viergelenk über „Gelenk“ im Kreis verbinden, die Kurbel mit der Maus im 3D-Bild ziehen und mit dem Schieberegler über einen Totpunkt fahren, bis die Meldung „Dieser Mechanismus klemmt hier“ erscheint.

## Kurvenscheibe / Nocken (Auto [A-153], BG-15)

- [x] **Exzentrische Scheibe (5 mm Versatz → 10 mm Hub)**: Dreht eine um `5 mm` versetzte Scheibe über 0°–360°, folgt der Stößel der echten Außenkontur (Anlage über `#coupling-dialog` mit Vorschau-Kurve `#cp-cam-chart`), erreicht im Gelenk und real im 3D-Raum exakt `10,0 mm` Hub und kehrt bei `360°` an den Ausgangspunkt zurück (`t_a153_kurvenscheibe_nocken`).
- [x] **Weg-Kurve als Diagramm, Flachstößel & „An Kontur anlegen“**: Das rechte Panel zeigt das SVG-Diagramm `#cam-chart` mit geschwungener Weg-Kurve (`path.cam-curve`), Hub-Anzeige (`#cam-stroke`), beweglichem Winkelfaden (`circle.cam-dot`) über `#cam-ang`, Flachstößel-Modus (`flat` vs. `point` bei 90°) und `snapCamContact` zum Anlegen eines abgerückten Stößels (`t_a153_kurvenscheibe_nocken`).
- [x] **Beliebige Außenkontur (Ellipse)**: Eine aus einer Skizze extrudierte unrunde Ellipse (`rx = 18 mm`, `ry = 12 mm`) treibt den Stößel exakt mit `6,0 mm` Hub (`t_a153_kurvenscheibe_nocken`).
- [x] **Abspielen, Rückgängig, Validierung, Profi-Sichtbarkeit & Baugruppen-Sync**: `#cp-play` animiert Scheibe und Stößel live ohne `App.revision` zu ändern; `Store.validateProject`, `Strg+Z`, Lösen (`#cp-del`), Ausblenden im Einfach-Modus und `Joints.invalidateCamCache` laufen fehlerfrei (`t_a153_kurvenscheibe_nocken`).
- [x] **Hilfe, DE/EN-Schlüssel & Befehlssuche**: `HELP.coupleCam`, gleiche Schlüssel in `texte-de.json`/`texte-en.json` sowie Befehlssuche (`couple-cam` für „kurvenscheibe“ / „nocken“) geprüft (`t_a153_kurvenscheibe_nocken`).
- [ ] **Von Hand**: Im Browser im Profi-Modus eine unrunde Nockenscheibe (Skizze + Hochziehen) mit einem Stößel verbinden, im Diagramm „Weg-Kurve“ über verschiedene Winkel ziehen und „An Kontur anlegen“ sowie „Bewegung abspielen“ optisch prüfen.

## Kopplungen Zahnrad und Zahnstange (Auto [A-151], BG-14)

- [x] **Zahnrad – Zahnrad 1:2 (Zähnezahlen & Verhältnis)**: Zwei Drehgelenke an Zahnrädern (`20` / `40` Zähne, automatisch aus `#coupling-dialog` übernommen) drehen Zahnrad 2 bei `90°` an Zahnrad 1 exakt auf `+45,0°` (auch im 3D-Raum geprüft); Gegenlauf kehrt auf `-45,0°` um, im Verhältnis-Modus (`0,5` und `'1:2'`) wirkt die Kopplung bidirektional (`30° → 60°`) (`t_a151_kopplungen_zahnrad_zahnstange`).
- [x] **Zahnrad – Zahnstange (`π·d·Winkel/360`)**: Ritzel (`20` Zähne, Modul `1,5` → Teilkreis-Ø `30 mm`) und Schieber werden über `#coupling-dialog` automatisch erkannt; bei `90°` verschiebt sich die Zahnstange um `π·30·90/360 ≈ 23,5619 mm`, im Durchmesser-Modus (`d = 20 mm`) bei `180°` um `10π ≈ 31,4159 mm` (Gegenrichtung `-10π`) sowie rückwärts vom Weg zurück auf `90,0°` (`t_a151_kopplungen_zahnrad_zahnstange`).
- [x] **Abspielen, Rückgängig, Validierung, Profi-Sichtbarkeit & Hilfen**: `#cp-play` animiert Ritzel und Zahnstange live ohne `App.revision` zu ändern; `Store.validateProject`, `Strg+Z`, Lösen (`#cp-del`), Ausblenden im Einfach-Modus, DE/EN-Schlüsselgleichheit, Befehlssuche (`couple-gear`, `couple-rack`) und Hilfetexte (`coupleGear`, `coupleRack`) laufen ohne JS-Fehler (`t_a151_kopplungen_zahnrad_zahnstange`).
- [ ] **Von Hand**: Im Browser im Profi-Modus das Beispiel „Zahnrad-Paar“ mit zwei Drehgelenken sowie ein Ritzel mit Zahnstange per „Verbindung“ → „Kopplung“ verbinden, direkt im 3D-Bild ziehen und das gleichzeitige Mitdrehen bzw. Verschieben prüfen.

## Explosion in Schritten mit Wegen-Linien und Video (Auto [A-156], BG-19)

- [x] **Schritte anlegen, Reihenfolge & Rückgängig (Einfach & Profi)**: Im Einfach- und Profi-Modus lassen sich im Modus „Schritte“ mehrere Explosions-Schritte (`#ex-step-part`, `#ex-step-dir`, `#ex-step-dist`, `#ex-step-add`, `doc.explodeSteps`) mit eigener Richtung und Weite anlegen, per ↑/↓ umsortieren, per `Strg+Z` rückgängig machen und mit `Store.validateProject` prüfen, ohne die echte Lage (`t`) der Teile zu verändern (`t_a156_explosion_schritte_video`).
- [x] **Nacheinander abspielen & gestrichelte Wegen-Linien**: `#ex-play` (`Views.playExplode`) bewegt die Teile strikt nacheinander gemäß der Schritt-Reihenfolge; im 3D-Bild erscheinen gestrichelte Wegen-Linien (`THREE.LineDashedMaterial` mit `lineDistance` in `Viewer.groups.overlay`), die sich über `#ex-trails` ein- und ausblenden lassen (`t_a156_explosion_schritte_video`).
- [x] **Video-Export, Zusammensetzen, i18n & Hilfen**: `Views.explodeVideo` liefert lokal eine abspielbare Video-Datei (`video/*`, > 1 KB), `#ex-video` öffnet den Video-Dialog, `#ex-back` setzt alles zusammen, und alle DE/EN-Texte, Befehlssuche-Einträge (`explode-steps`, `explode-video`) und Hilfetexte (`explodeSteps`, `explodeVideo`) sind vollständig (`t_a156_explosion_schritte_video`).
- [ ] **Von Hand**: Im Browser eine mehrteilige Baugruppe (z. B. das Beispiel „Baugruppe Scharnier“) öffnen, 3 Explosions-Schritte in verschiedenen Richtungen anlegen, auf „Abspielen“ und „Video“ klicken und die gespeicherte `.webm`-Datei lokal im Browser oder VLC abspielen.

## Benannte Stellungen (Auto [A-157], BG-20)

- [x] **Einfach-Modus: Speichern, Einnehmen & Rückgängig**: Scharnier auf `90°` über `#proj-pose-name` / `#proj-pose-save` als „auf“ und bei `0°` über `#btn-pose-save` als „zu“ gespeichert; Klick auf `.pose-row[data-pose-name="auf"]` fährt Gelenk und 3D-Bauteil exakt zurück auf `90°`, `.pose-chip[data-pose-name="zu"]` auf `0°` und `Strg+Z` macht den Wechsel in einem Schritt rückgängig (`t_a157_benannte_stellungen`).
- [x] **Profi-Modus: Gelenk-Kette, Überschreiben, Umbenennen & Löschen**: Eine Kette aus zwei Drehgelenken (`60°` / `30°` als „halb“) stellt beim Klick auf die gespeicherte Stellung beide Gelenke sowie die 3D-Lage des Endglieds auf `< 0,01 mm` exakt wieder her; `updatePose`, `renamePose` und `removePose` funktionieren fehlerfrei (`t_a157_benannte_stellungen`).
- [x] **Speichern & Laden, Validierung & Hilfen**: `doc.poses` besteht `Store.validateProject`, bleibt nach `Store.saveProject`/`loadProject` sowie `.tracery.json`-Export und erneutem Laden erhalten und fährt „auf“ wieder auf `90°`; `HELP.namedPoses`, DE/EN-Texte und Befehlssuche (`save-pose`) sind vollständig (`t_a157_benannte_stellungen`).
- [ ] **Von Hand**: Im Browser das Beispiel „Baugruppe Scharnier“ im Modus „Einfach“ und „Profi“ öffnen, Stellungen wie „auf“ (90°) und „zu“ (0°) über den Verlauf „Stellungen“ und die Eigenschaften speichern, per Klick umschalten und nach „Projekt als Datei speichern“ und erneutem Öffnen prüfen.

## Volltest-Reparatur (Auto [F-11251236])

- [x] **Skizzen-Lineal frei von Verlaufs-Kopfzeile (`[A-117]`)**: `.panel-head`/`.tabs` in `#left` bleiben innerhalb `--col-l` (auch bei `180 px` schmaler Leiste) und verdecken `#sk-ruler-c` nicht mehr; der Klick auf `#sk-ruler-c` schaltet das polare Raster um (`t_a117_polares_raster_hilfslinien`, `t_f11251236`).
- [x] **Beispiel-Galerie im I18n-Testmodus (`[A-074]`)**: Alle 8 Beispiel-Karten nutzen `start.ex.*`-Texte bzw. `I18n.mark()`, werden mit `I18n.setTestMode(true)` vollständig mit `⟦…⟧` markiert und halten DE/EN-Schlüsselgleichheit (`t_a074_uebersetzbare_oberflaeche_2`, `t_a149_beispiel_galerie`, `t_f11251236`).
- [x] **Gelenk-Anschlag, Körper-Zeilen-Auswahl, Mittellinien-Vorschau & Tooltip-Timer**: `Joints.setStops()` aktualisiert das rechte Panel auch bei fokussiertem Eingabefeld sofort (`t_gelenk_anschlag`, `t_f11251236`); `Panels.syncLeftSelection()` erhält `.body-row`-Knoten bei Auswahlwechsel per Klick (`t_koerper_liste`, `t_f11251236`); `loftPreview()` im `select`-Werkzeug läuft auch über Fenster-`pointermove`/ohne `mouseUV` (`t_uebergang_mittellinie`); `UI.initTips()` bricht laufende Tooltip-Timer bei Kindelement-Wechseln innerhalb desselben `[data-help]`-Ziels nicht ab (`t_a081_englische_oberflaeche`, `t_f11251236`).
- [ ] **Von Hand**: Im Browser im Profi-Modus eine Skizze öffnen, die linke Leiste schmal ziehen und das Lineal-Ecksymbol `#sk-ruler-c` anklicken; außerdem in den Einstellungen über den Sprache-Eintrag fahren und die schnelle Tooltip-Anzeige prüfen.

## Bezüge zwischen Teilen verwalten (Auto [A-159], BG-22)

- [x] **Messwert-Bezug Liste, Einfrieren, Auftauen, Lösen & Rückgängig**: Teil B übernimmt eine Kantenlänge von Teil A über `#p-h-meas`; bei Änderung von A (`40 → 55 mm`) folgt B, `#part-refs-sec` zeigt den Bezug zu Teil A (`kind: 'measure'`); nach „Einfrieren“ bleibt B bei Änderung von A (`55 → 75 mm`) unverändert, nach „Auftauen“ folgt B sofort auf `75 mm`, nach „Lösen“ bleibt B unabhängig (`90 mm`) und `App.undo()` stellt den Bezug wieder her (`t_a159_bezuege_verwalten`).
- [x] **Bauteil im Kontext (Skizzen-Fläche & „bis Fläche“)**: Bauteil-Gruppe (`comp: true`) mit Skizze auf Fläche von „Basis“ und Extrusion `extent: 'toFace'` erscheinen in `Comp.partRefs`, folgen von `12 → 20 mm`, bleiben nach dem Einfrieren selbst beim Unterdrücken von „Basis“ ohne `RefFix`-Warnung und beim Ändern (`20 → 30 mm`) fest, folgen nach dem Auftauen auf `30 mm` und bleiben nach dem Lösen (`extent: 'dist'`) unabhängig (`t_a159_bezuege_verwalten`).
- [x] **Dialog, Kontext-Banner, Profi-Trennung, Validierung & Hilfen**: `#ctx-part-refs-btn`, `Comp.refsDialog` (`#part-refs-dialog`), `#proj-part-refs-sec`, Ausblenden im Einfach-Modus, `Store.validateProject`, `HELP.partRefs`, DE/EN-Schlüsselgleichheit und Befehlssuche (`part-refs` für „bezüge“ / „einfrieren“) laufen ohne JS-Fehler (`t_a159_bezuege_verwalten`).
- [ ] **Von Hand**: Im Browser im Profi-Modus eine Skizze auf die Fläche eines anderen Teils legen oder ein Maß per Pipette übernehmen, im rechten Panel unter „Bezüge auf andere Teile“ sowie im Dialog „Bezüge zwischen Teilen verwalten“ einzelne Bezüge einfrieren, das Ausgangsteil ändern, danach auftauen und dauerhaft lösen.

## Bewegungs-Studie mit Motoren und Zeitachse (Auto [A-158], BG-21)

- [x] **Motor `60°/s` & Zeitachse**: Im Profi-Modus öffnet `#btn-motion-tree` das Panel „Bewegung“ (`#motion-panel`); ein Motor mit `60°/s` am Drehgelenk fährt das Gelenk bei `1,5 s` (`#mot-time-inp`) exakt auf `90°` (3D-Armspitze `< 0,05 mm` am Ziel) und bei `2,5 s` auf `150°`; `#mot-reset` setzt auf `0°` zurück und `#mot-play` animiert live vorwärts (`t_a158_bewegungs_studie`).
- [x] **Weg über Zeit (Stützpunkte)**: Ein Profil-Motor `[{t:0,v:0},{t:1,v:20},{t:2,v:5}]` an einem Schiebegelenk fährt bei `0,5 s` auf `10 mm`, bei `1,5 s` auf `12,5 mm` und bei `2,0 s` auf `5 mm` (`t_a158_bewegungs_studie`).
- [x] **Punkt-Kurven in 3D & SVG-Diagramm**: Ein Verfolgungspunkt an der Armspitze (`R = 40 mm`) zeichnet den Viertelkreis über `1,5 s` als 3D-Bahnkurve in `Viewer.groups.overlay` und als `#motion-chart path.mot-curve` mit Bogenlänge `≈ 62,83 mm` (`t_a158_bewegungs_studie`).
- [x] **Profi-Schutz, Speichern/Laden, Rückgängig & Hilfen**: Im Einfach-Modus ausgeblendet und gesperrt; `doc.motion` besteht `Store.validateProject`, bleibt nach JSON-Reload erhalten; `App.undo()`, `HELP.motionStudy`, DE/EN-Schlüsselgleichheit und Befehlssuche (`motion-study`) funktionieren ohne JS-Fehler (`t_a158_bewegungs_studie`).
- [ ] **Von Hand**: Im Browser im Profi-Modus eine Baugruppe mit mehreren Gelenken öffnen, einen Punkt über „Im Bild wählen“ direkt am 3D-Teil anklicken, die Zeitachse über „Abspielen“ und durch Ziehen im Weg-Zeit-Diagramm prüfen.

## Fehler melden

```
Was ich gemacht habe: …
Was passieren sollte: …
Was passiert ist: …
Browser: …
```
