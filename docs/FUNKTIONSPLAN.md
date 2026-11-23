# Tracery – Analyse und Funktionsplan

Stand: 13.11.2026, ergänzt am 23.11.2026 (Abschnitt 9) · geschrieben nach Sitzung 72, zusammen mit dem Entfernen der Drohnen-Teile. Eingearbeitet ist der unabhängige Bericht „Wie Tracery vom leichten Modell zur kostenlosen Profi-Alternative wird“ (Abschnitt 5).

Neue Richtung: Tracery wird ein allgemeines CAD-Programm. Ziel ist das beste kostenlose CAD. Es soll auch Leuten reichen, die jeden Tag damit arbeiten, und Modelle sollen so gut aussehen, dass auch Gestalter damit arbeiten wollen.

## 1. Kurz gesagt

- Tracery hat einen starken Kern und eine gute Skizze. Für tägliches Arbeiten fehlen aber ganze Bereiche: echte Baugruppen, Zeichnungen nach Norm, Flächen, Blech, Fräsen, Simulation und viel Komfort bei der Bedienung.
- Auf den ersten Blick wirkt Tracery wie ein Baukasten: Alles sieht nach mattem Plastik aus, und man baut mit „Körper und Loch“ statt mit Schritten, die direkt schneiden oder vereinigen. Das schreckt Profis ab, obwohl der Kern mehr kann.
- Diese Liste enthält **536 neue Funktionen** in 25 Bereichen. **159 davon tragen einen Stern (★)**: Sie bringen am meisten und kommen zuerst.
- Tausende Funktionen haben Fusion oder SolidWorks, weil große Teams 20 bis 30 Jahre daran gebaut haben. Bei unserem Tempo (eine bis drei Funktionen je Sitzung) sind schon die Funktionen dieser Liste mehrere hundert Sitzungen. Deshalb zählt die Reihenfolge mehr als die Zahl.
- Über die Menge allein wird Tracery nicht das beste kostenlose CAD. Die Chance liegt woanders: Es läuft im Browser, ohne Konto und ohne Installation, die Dateien bleiben auf dem eigenen Rechner, es ist leicht zu lernen und hat einen KI-Kollegen. Genau dort haben die anderen kostenlosen Programme ihre Schwächen (Abschnitt 2).

## 2. Was die anderen kostenlos bieten

| Programm | Was kostenlos ist | Schwäche |
| --- | --- | --- |
| FreeCAD 1.1 (März 2026) | Alles, auch gewerblich, ohne Konto. Sehr viele Funktionen: Baugruppen, Zeichnung, Festigkeit, Fräsen. Neu in 1.1 unter anderem Ziehgriffe bei Rundung und Fase und Vorschauen. | Muss installiert werden, gilt als schwer zu lernen, neue Fassungen kommen langsam. |
| Onshape Free | Der volle Profi-Umfang im Browser. | Nur für nicht-gewerbliche Arbeit, und alle Dokumente sind öffentlich sichtbar. |
| Fusion für Privatnutzer | Für private, nicht-gewerbliche Projekte, unter 1.000 US-Dollar Einnahmen im Jahr, jeweils für ein Jahr. | Eingeschränkt bei Fräsen, Zeichnungen, Elektronik und Dateiformaten. |
| Tinkercad | Sehr leichter Einstieg im Browser. | Keine Regeln und Maße in der Skizze, kein Verlauf, kein STEP. |
| OpenSCAD | Teile per Code, auch gewerblich. | Letzte stabile Fassung von 2021, kein STEP-Export. |
| **Tracery heute** | Im Browser, ohne Konto, Dateien lokal. Echter CAD-Kern mit STEP, Skizze mit Löser, Verlauf, Zeichnung, KI-Kollege. | Sieht nach Plastik aus, „Körper und Loch“ statt Schnitt-Schritten, Baugruppen nur im Ansatz, Zeichnung einfach, keine Flächen, kein Blech, kein Fräsen, nur Deutsch, keine Lizenz festgelegt. |

Quellen stehen am Ende.

## 3. Wo Tracery heute steht

**Stark**
- Exakter Kern (OpenCascade) im Browser, Austausch über STEP.
- Skizze auf Profi-Niveau: über 20 Werkzeuge, Regeln, Löser, Maße mit Formeln und Einheiten.
- Verlauf mit Marker, Unterdrücken und Fehlern in Klartext.
- Rundung und Fase mit Ziehgriff, Übergang mit Führungskurven, Rohr im Raum, echte Gewinde, Bohrungs-Assistent.
- Magnetisches Einrasten, auch auf gewölbten Flächen.
- Gelenke mit Ketten, Schnitt, Röntgen, Explosion, Überhänge, Schwachstellen-Suche.
- KI-Kollege, einfache Oberfläche für Einsteiger, automatische Klicktests für jede Funktion.

**Was am meisten fehlt (wichtigstes zuerst)**
1. Der erste Eindruck: Jeder Körper sieht gleich aus (mattes Plastik), kein Glanz, keine Schatten, nur zehn Farben. Der Werkstoff ändert nur das Gewicht.
2. Arbeitsweise: Formschritte, die direkt schneiden, vereinigen oder bis zu einer Fläche gehen, statt Loch-Körper nebeneinander.
3. Verlässlichkeit: Bezüge auf Kanten und Flächen müssen halten, wenn man früher im Verlauf etwas ändert.
4. Bedienkomfort: eigene Tastenkürzel, Rechtsklick-Menü, Fenster-Auswahl, Tabs, Einheiten in Zoll, Speichern in einen Ordner.
5. Bezugsebenen, Achsen und Punkte als eigene Schritte.
6. Gestaltung: SVG-Logos einlesen, eigene Schriften, Prägen und Wickeln auf runden Flächen, Bilder und GLB zum Zeigen.
7. Echte Baugruppen: ein Teil mehrfach einsetzen, Verbindungen aller Art, Stückliste.
8. Zeichnungen nach Norm: Schnitt- und Detailansicht, Toleranzen, Passungen, mehrere Blätter.
9. Normteile: Schrauben, Muttern, Lager zum Einsetzen.
10. Flächen, Blech, Profile, direktes Bearbeiten von Importteilen.
11. Fertigung: Vorbereitung für 3D-Druck, Laser und Fräse.
12. Festigkeits-Rechnung, Skripte, Teilen per Link.
13. Andere Sprachen. Ein CAD nur auf Deutsch kann weltweit nicht das beste kostenlose werden.

## 4. Was wir ändern (nicht nur dazubauen)

1. **Drohnen-Teile raus.** Tracery wird allgemein: Startseite, Vorlagen, Texte und KI-Wissen.
2. **Schritte mit Modus statt „Körper und Loch“.** Hochziehen, Drehen, Entlang Pfad und Übergang bekommen die Wahl: neuer Körper, vereinigen, schneiden, Schnittmenge. Loch-Körper bleiben als einfache Möglichkeit für Einsteiger.
3. **Stabile Bezüge.** Heute findet Tracery eine Kante über ihre Lage im Raum. Ändert man ein frühes Maß, kann eine spätere Rundung ihre Kante verlieren. Der Kern soll sich merken, woraus jede Kante und Fläche entstanden ist.
4. **Aussehen.** Werkstoff bestimmt das Aussehen, dazu Studio-Licht, Schatten und freie Farben.
5. **Dokument-Arten.** Heute ist ein Projekt eine Liste von Teilen. Für Baugruppen, Stücklisten und Zeichnungen brauchen wir Bauteil, Baugruppe und Zeichnung als eigene Dinge, die aufeinander zeigen. Das ist der größte Umbau.
6. **Speicher.** Projekte liegen im kleinen Browser-Speicher (5 bis 10 MB), und Rückgängig hält bis zu 300 ganze Kopien. Für große Projekte kommt die Browser-Datenbank und ein Rückgängig, das nur Änderungen speichert.
7. **Übersetzbare Oberfläche.** Alle Texte an eine Stelle, Deutsch bleibt die erste Sprache, Englisch kommt dazu.
8. **Profi-Bedienung neben „Einfach“.** Die einfache Oberfläche bleibt. „Profi“ bekommt, was tägliche Nutzer aus anderen Programmen gewohnt sind.
9. **Lizenz festlegen.** Solange keine Lizenz im Projekt steht, ist nicht geregelt, wer Tracery wofür nutzen darf. Für „kostenlos, auch gewerblich“ muss das drinstehen. Die Entscheidung liegt bei dir.
10. **Qualität vor Menge.** Jede Funktion bekommt weiter einen automatischen Test. Lieber 300 Funktionen, die immer gehen, als 1.000, die manchmal gehen.
11. **Pakete statt Einzelteile.** Eine Sitzung baut ein Paket aus fünf bis zehn verwandten kleinen Funktionen. Große Brocken (Baugruppen, Blech, Fräsen, Festigkeit) sind eigene Projekte über viele Sitzungen.

## 5. Der unabhängige Bericht

Der Bericht hat denselben Code-Stand geprüft (Commit 2a751e8). Seine Aussagen über den Code habe ich nachgeprüft.

**Stimmt und ist übernommen**
- Alle Körper bekommen dasselbe matte Material, es gibt keine Umgebungs-Spiegelung, keine Schatten und nur zehn Farben. → Paket „Studio-Look“ steht jetzt ganz vorne (AN mit Stern).
- Der Werkstoff ändert nur das Gewicht. Elastizität und Festigkeit stehen in den Daten, werden aber nirgends benutzt. → Aussehen am Werkstoff; Festigkeits-Rechnung bleibt als großes Ziel (SI).
- „Körper und Loch“ statt Schritten mit Vereinigen und Schneiden. → Abschnitt 4 Punkt 2, KP mit Stern.
- Kanten werden über ihre Lage wiedergefunden. → Abschnitt 4 Punkt 3, PL mit Stern.
- Kein SVG-Import, nur zwei Schriften ohne Unterschneidung, kein Prägen und Wickeln auf runden Flächen. → SK und KP mit Stern.
- Kleiner Browser-Speicher, Rückgängig mit ganzen Kopien, Importdateien als Text im Projekt. → Abschnitt 4 Punkt 6, PL mit Stern.
- Der KI-Kollege läuft nur auf der Claude-Seite. → KI mit Stern („eigener Schlüssel“).
- Der Skizzen-Löser rechnet alles als volle Matrix. Für Logos mit Hunderten Kurven wird das langsam. → PL.
- Baugruppen mit echten Verbindungen, geschlossene Mechanismen, Stückliste, Blech, Flächen, Skript-Schnittstelle, Teilen per Link. → BG, BL, FL, AU, DA.

**Stimmt nicht oder nicht mehr**
- „Rundung mit veränderlichem Radius fehlt“: Die gibt es seit Sitzung 63 (von … bis).
- „Verknüpfte Kanten aus dem 3D fehlen“: Die gibt es seit Sitzung 33 (verbundene Kanten).
- DXF-Import in die Skizze ist in Sitzung 74 gebaut, aber noch nicht im Hauptstand.
- Die Grenze „zehn Dokumente“ bei Fusion konnte ich auf der Autodesk-Seite heute nicht bestätigen. Dort stehen die Einschränkungen aus Abschnitt 2.

**Wo ich anders gewichte**
- Der Bericht stellt Grafik an die erste Stelle. Das Studio-Look-Paket ist klein und wirkt sofort, deshalb kommt es zuerst. Danach zählt für tägliche Nutzer aber die Arbeitsweise mehr als das Aussehen.
- Mit Blender beim Rendern mithalten ist kein sinnvolles Ziel. Ziel ist: Modelle sehen gut aus und lassen sich als Bild und GLB weitergeben.
- Freiform-Kneten und krümmungsglatte Flächen sind sehr großer Aufwand. Sie bleiben in Welle 3.
- Der Umbau des Quelltexts auf Module und Typen hilft beim Bauen, bringt Nutzern aber nichts Sichtbares. Er läuft schrittweise mit, nicht als Erstes.
- Festigkeits-Rechnung im Browser geht in einfacher Form. Der schwere Teil ist, den Körper in kleine Rechen-Zellen zu zerlegen. Das ist ein eigenes Projekt über mehrere Sitzungen.
- Der Bericht nennt den Drohnen-Teil ein Alleinstellungsmerkmal. Er wird trotzdem entfernt, wie gewünscht. Er bleibt in Git erhalten und könnte später als Erweiterung zurückkommen, wenn es die Generator-Schnittstelle gibt (AU).

## 6. Reihenfolge

**Die ersten Pakete**
1. Studio-Look: Aussehen am Werkstoff, Studio-Licht, Schatten, freie Farben, Prüfansicht, Bild in hoher Auflösung, GLB.
2. Formschritte mit Modus (neuer Körper, vereinigen, schneiden, Schnittmenge), „bis Fläche“, „durch alles“.
3. Bedienung: eigene Tastenkürzel, Rechtsklick-Menü, Fenster- und Kreuz-Auswahl, letzten Befehl wiederholen.
4. Unterbau: stabile Bezüge, Browser-Datenbank, sparsames Rückgängig.
5. Bezugsebenen und Achsen als Schritte.
6. Gestaltung: SVG und DXF in die Skizze, eigene Schriften mit Unterschneidung, Prägen und Wickeln.
7. Zoll als Einheit, Farbe je Fläche, Anzeige-Arten, mehr Dateiformate.

**Die Wellen**

| Welle | Thema | Bereiche |
| --- | --- | --- |
| 1 | Alltag | Skizze, Bezugsebenen, Achsen, Punkte, Körper und Formschritte, Import und Export, Messen und Prüfen, Aussehen und Bilder, Bedienung für jeden Tag, Unterbau |
| 2 | Baugruppen, Zeichnung, Bibliothek | Baugruppen, Technische Zeichnung, Bibliothek und Generatoren |
| 3 | Formen | Direkt bearbeiten (auch an importierten Teilen), Flächen (Freiformen), Blech, Profile und Gestelle, Netze und Scans |
| 4 | Fertigung | 3D-Druck, Laser, Platten und 2D-Fräse, Fräsen (CAM), Elektronik und Gehäuse |
| 5 | Rechnen, Automatisieren, KI | Rechnen und Simulation, Automatisieren und Erweitern, KI-Kollege, Lernen |
| 6 | Zusammenarbeit | Projekte, Versionen, Zusammenarbeit |

Innerhalb jeder Welle kommen die Funktionen mit ★ zuerst. Sterne in späteren Bereichen sind kleine Dinge mit großem Nutzen und können vorgezogen werden.

**Besondere Stärken, die sonst niemand kostenlos im Browser hat** (vorziehen, sobald Welle 1 steht): Festigkeits-Rechnung auf Knopfdruck, KI mit eigenem Schlüssel, Teilen per Link, Generatoren zum Tauschen.

## 7. Die Funktionsliste

| Kürzel | Bereich | Welle | Neue Funktionen | davon ★ |
| --- | --- | --- | --- | --- |
| SK | Skizze | 1 | 55 | 28 |
| BZ | Bezugsebenen, Achsen, Punkte | 1 | 13 | 10 |
| KP | Körper und Formschritte | 1 | 55 | 25 |
| DB | Direkt bearbeiten (auch an importierten Teilen) | 3 | 10 | 0 |
| FL | Flächen (Freiformen) | 3 | 23 | 0 |
| BL | Blech | 3 | 18 | 0 |
| PR | Profile und Gestelle | 3 | 10 | 0 |
| BG | Baugruppen | 2 | 34 | 13 |
| ZE | Technische Zeichnung | 2 | 36 | 14 |
| IO | Import und Export | 1 | 20 | 10 |
| NE | Netze und Scans | 3 | 12 | 0 |
| PF | Messen und Prüfen | 1 | 18 | 8 |
| SI | Rechnen und Simulation | 5 | 17 | 0 |
| DR | 3D-Druck | 4 | 20 | 5 |
| LA | Laser, Platten und 2D-Fräse | 4 | 10 | 0 |
| CA | Fräsen (CAM) | 4 | 19 | 0 |
| AN | Aussehen und Bilder | 1 | 20 | 10 |
| BE | Bedienung für jeden Tag | 1 | 35 | 18 |
| DA | Projekte, Versionen, Zusammenarbeit | 6 | 18 | 0 |
| AU | Automatisieren und Erweitern | 5 | 14 | 0 |
| BI | Bibliothek und Generatoren | 2 | 29 | 8 |
| EL | Elektronik und Gehäuse | 4 | 10 | 0 |
| KI | KI-Kollege | 5 | 16 | 1 |
| LE | Lernen | 5 | 8 | 0 |
| PL | Unterbau | 1 | 16 | 9 |
| | **Summe** | | **536** | **159** |

Jede Funktion hat eine Nummer (zum Beispiel SK-03). So lässt sich in einer Sitzung genau sagen, was gebaut wird.

### SK · Skizze (Welle 1)

Schon da: Linie, Rechteck, Kreis, Ellipse, Bogen, Langloch, Vieleck, Punkt, Spline, Text, Schablonen, Trimmen, Verlängern, Teilen, Versatz, Wand, Kante übernehmen, Spiegeln, Muster, 11 Regeln, Maße mit Formeln und Einheiten, Fangen, Bild-Vorlage.

- SK-01 ★ Maß nur zum Ablesen (Referenzmaß): zeigt einen Wert, ohne ihn festzulegen
- SK-02 ★ Elemente verschieben und kopieren mit genauem Abstand
- SK-03 ★ Elemente drehen um einen Punkt mit Winkel
- SK-04 ★ Elemente skalieren (größer, kleiner) mit Faktor
- SK-05 ★ Regel „auf einer Linie“ (kollinear)
- SK-06 ★ Regeln automatisch vorschlagen und per Knopf „Skizze fertig bestimmen“ (Auto-Maße, Auto-Regeln)
- SK-07 ★ Anzeige „Wo fehlt noch ein Maß?“: freie Punkte wackeln beim Antippen
- SK-08 ★ Bei Widerspruch zeigen, welche Regel oder welches Maß weg kann
- SK-09 ★ Skizzen-Prüfer: findet offene Stellen, doppelte Linien und winzige Lücken und schließt sie
- SK-10 ★ Fenster-Auswahl und Kreuz-Auswahl (von links: ganz drin, von rechts: berührt)
- SK-11 ★ Kette wählen: alle zusammenhängenden Linien mit einem Doppelklick
- SK-12 ★ Skizze kopieren und einfügen, auch in ein anderes Projekt
- SK-13 ★ Skizze auf eine andere Ebene oder Fläche umhängen
- SK-14 ★ Winkelfang beim Zeichnen (15°-Schritte) und Längen in runden Schritten
- SK-15 ★ Linie und Bogen im Wechsel zeichnen (Taste A beim Linienzug)
- SK-16 ★ Bogen über Mitte, Start, Ende
- SK-17 ★ Rechteck mit runden Ecken in einem Zug
- SK-18 ★ Langloch über die Gesamtlänge
- SK-19 ★ Tangente an zwei Kreise, Lot auf eine Linie
- SK-20 ★ Ecke bilden: zwei Linien bis zur gemeinsamen Ecke verlängern oder kürzen
- SK-21 ★ Versatz mehrfach, nach beiden Seiten, mit runden oder spitzen Ecken
- SK-22 ★ Alle Kanten einer Fläche auf einmal übernehmen, auch gleich mit Versatz
- SK-23 ★ Skizze als DXF oder SVG speichern
- SK-24 ★ SVG und DXF in eine bestehende Skizze holen
- SK-25 ★ Text trimmen und versetzen, Text in Kurven umwandeln
- SK-26 ★ Messen in der Skizze: Abstand, Winkel, Fläche und Umfang einer Region
- SK-27 Koordinatenmaße (alle Maße von einer Nullkante aus)
- SK-28 Bogenlänge als Maß, Winkel über drei Punkte
- SK-29 Maß zwischen Kreisrändern (kleinster oder größter Abstand)
- SK-30 Strecken: ein Stück der Skizze in eine Richtung ziehen, Rest bleibt
- SK-31 Skizzen-Blöcke: Gruppen, die man mehrfach einsetzt und zentral ändert
- SK-32 Spline mit Kontrollpunkten (weiche Formkurve)
- SK-33 Spline-Griffe: Richtung und Stärke der Tangente an jedem Punkt
- SK-34 Krümmungskamm: zeigt, wie gleichmäßig eine Kurve läuft
- SK-35 Regel „krümmungsglatt“ (G2) zwischen Spline und Nachbar
- SK-36 Kegelschnitt mit Rho-Wert (Parabel, Hyperbel, Ellipsenstück)
- SK-37 Teil-Ellipse (elliptischer Bogen)
- SK-38 Kurve aus Formel, zum Beispiel y = sin(x) oder Evolvente
- SK-39 Kurve durch Punkte aus einer Tabelle (CSV)
- SK-40 Brückenkurve: weicher Übergang zwischen zwei Kurven
- SK-41 Formen-Sammlung: Stern, Pfeil, Herz, Zahnrad-Umriss, Schlüsselloch
- SK-42 Silhouette eines Körpers in die Skizze holen
- SK-43 Schnittkurve zweier Flächen in die Skizze holen
- SK-44 Muster entlang einer Kurve in der Skizze
- SK-45 Füllmuster: Fläche mit Löchern füllen (Raster, versetzt, Waben)
- SK-46 Live-Spiegeln: alles Gezeichnete entsteht sofort auch gespiegelt
- SK-47 ★ Weitere Schriften und eigene Schrift (TTF/OTF) laden
- SK-48 ★ Unterschneidung (Kerning) und Laufweite beim Text
- SK-49 Einlinien-Schrift zum Gravieren
- SK-50 Bild nachzeichnen: aus einem Bild werden Kurven
- SK-51 3D-Skizze: Linien, Bögen und Splines frei im Raum, mit Regeln und Maßen
- SK-52 Polares Raster und Hilfslinien zum Herausziehen wie im Grafikprogramm
- SK-53 Skizzen-Maße als Tabelle bearbeiten
- SK-54 Skizze komplett sperren (nichts verrutscht mehr)
- SK-55 Achse fürs Drehen direkt in der Skizze markieren

### BZ · Bezugsebenen, Achsen, Punkte (Welle 1)

Schon da: Ursprungsebenen und Achsen, Skizzen-Ebene mittig zwischen zwei Flächen, durch drei Punkte, verschieben und neigen.

- BZ-01 ★ Ebene mit Abstand zu einer Fläche oder Ebene, als eigener Schritt im Verlauf
- BZ-02 ★ Ebene im Winkel an einer Kante
- BZ-03 ★ Ebene tangential an einer runden Fläche
- BZ-04 ★ Ebene senkrecht zu einer Kurve an einem Punkt
- BZ-05 ★ Ebene durch Kante und Punkt, durch zwei Kanten
- BZ-06 ★ Achse durch zwei Punkte, durch die Mitte einer Rundung, als Schnitt zweier Ebenen
- BZ-07 ★ Achse senkrecht zu einer Fläche an einem Punkt
- BZ-08 ★ Bezugspunkt: Kantenmitte, Flächenmitte, Schnittpunkt, auf Kurve bei x Prozent
- BZ-09 ★ Eigenes Koordinatensystem (zweiter Nullpunkt), auch für den Export
- BZ-10 ★ Bezüge benennen, in der Liste ein- und ausblenden
- BZ-11 Schwerpunkt als Bezugspunkt
- BZ-12 Bezugsebenen in der Größe ziehen und einfärben
- BZ-13 Ebenen-Schar: mehrere Ebenen in gleichem Abstand auf einmal

### KP · Körper und Formschritte (Welle 1)

Schon da: Grundkörper, Hochziehen, Drehen, Übergang (auch mit Mittellinie und Führungskurven), Entlang Pfad, Rohr im Raum, Rundung, Fase, Schräge, Wandstärke, Gewinde, Bohrungs-Assistent, Muster, Spiegeln, Teilen, Boolesch.

- KP-01 ★ Hochziehen „bis zur nächsten Fläche“, „bis zu gewählter Fläche“, „durch alles“
- KP-02 ★ Hochziehen nach beiden Seiten mit verschiedenen Längen und mit Schräge
- KP-03 ★ Hochziehen als dünne Wand (aus offener Linie)
- KP-04 ★ Jeder Formschritt mit Modus: neuer Körper, vereinigen, schneiden oder Schnittmenge – mit Wahl des Zielkörpers (statt Körper und Loch nebeneinander)
- KP-05 ★ Drehen mit Winkel und bis Fläche
- KP-06 ★ Rippe (Versteifung aus einer Linie)
- KP-07 ★ Fläche aufdicken und Körper skalieren (auch je Achse verschieden)
- KP-08 ★ Körper verschieben, drehen und kopieren als Schritt im Verlauf
- KP-09 ★ Körper-Liste: mehrere Körper in einem Teil benennen, färben, ein- und ausblenden
- KP-10 ★ Schritte im Verlauf umsortieren (ziehen), in Ordner legen, duplizieren
- KP-11 ★ „Was hängt davon ab?“: Eltern und Kinder eines Schritts zeigen
- KP-12 ★ Kaputter Bezug: Assistent „Fläche oder Kante neu wählen“
- KP-13 ★ Muster von Schritten (nicht nur von Körpern), einzelne Kopien auslassen
- KP-14 ★ Schritt spiegeln (zum Beispiel nur eine Tasche)
- KP-15 ★ Rundung für alle Kanten einer Fläche oder eines Schritts auf einmal
- KP-16 ★ Auswahl-Regeln für Kanten: alle äußeren, alle inneren, alle mit gleichem Radius
- KP-17 ★ Bohrung: Sackloch mit Spitze, Passbohrung (H7), Zentrierbohrung
- KP-18 ★ Bohrungs-Assistent mit Feingewinde, Zoll-Gewinde (UNC/UNF) und Rohrgewinde (G)
- KP-19 ★ Gewinde direkt auf eine runde Fläche setzen (außen und innen)
- KP-20 ★ Kosmetisches Gewinde: nur Markierung, rechnet schnell
- KP-21 ★ Varianten, die auch Schritte ein- und ausschalten
- KP-22 ★ Wenn-Dann in Formeln, Runden, Tabellen-Nachschlagen
- KP-23 ★ Maße als CSV speichern und laden
- KP-24 Schraubdom (Boss) mit Rippen
- KP-25 Lippe und Nut für Gehäusehälften
- KP-26 Lüftungsgitter und Kühlrippen als Schritt
- KP-27 Steg-Netz (viele Rippen aus einer Skizze)
- KP-28 Entlang Pfad mit Verdrehung
- KP-29 Entlang Pfad als Schnitt (zum Beispiel Nut entlang einer Kurve)
- KP-30 Übergang als Schnitt, geschlossener Übergang (Ring)
- KP-31 Übergang mit weichem Anschluss an Nachbarflächen (tangential, krümmungsglatt)
- KP-32 Feder und Spirale (Helix mit Steigung, Kegel-Feder)
- KP-33 ★ Prägen: Text oder Logo erhaben oder vertieft auf gewölbter Fläche
- KP-34 ★ Wickeln: Skizze um einen Zylinder oder Kegel legen
- KP-35 Kurve auf eine Fläche projizieren und Fläche daran teilen
- KP-36 Kuppel auf einer Fläche
- KP-37 Biegen, Verdrehen, Verjüngen eines Körpers (Verformen)
- KP-38 Rundung über die ganze Fläche (Vollrundung)
- KP-39 Rundung zwischen zwei Flächen (Flächen-Rundung)
- KP-40 Krümmungsglatte Rundung (G2) und Ecken-Übergänge
- KP-41 Fase an einer Ecke (drei Abstände)
- KP-42 Schräge an einer Trennlinie
- KP-43 Wandstärke je Fläche verschieden, auch nach außen
- KP-44 Füllmuster auf einer Fläche (Löcher, Waben)
- KP-45 Muster an Skizzenpunkten und aus einer Tabelle
- KP-46 Muster mit wachsender Größe oder wachsendem Abstand
- KP-47 Teilen mit einer Fläche oder Skizze statt nur mit einer Ebene
- KP-48 Gewinde-Freistich und Einstich für Sicherungsring
- KP-49 Passfeder-Nut, Keilwellen-Profil
- KP-50 Rändel und Griffmuster
- KP-51 Körper als Schritt löschen
- KP-52 Varianten-Tabelle zum Ausfüllen (wie eine Tabellenkalkulation)
- KP-53 Messwert als Maß benutzen („so lang wie diese Kante“)
- KP-54 Verlauf abschalten: freies Bearbeiten ohne Schritte
- KP-55 Notiz an einem Schritt

### DB · Direkt bearbeiten (auch an importierten Teilen) (Welle 3)

Schon da: Flächen ziehen (Push/Pull).

- DB-01 Fläche verschieben und drehen
- DB-02 Fläche versetzen (Wand dicker oder dünner)
- DB-03 Fläche löschen und Lücke heilen (Loch oder Rundung entfernen)
- DB-04 Fläche ersetzen durch eine andere
- DB-05 Loch-Durchmesser an Importteilen direkt ändern
- DB-06 Rundungs-Radius an Importteilen direkt ändern
- DB-07 Kante verschieben
- DB-08 Löcher, Rundungen und Taschen in Importteilen erkennen
- DB-09 Vereinfachen: kleine Details automatisch entfernen
- DB-10 Körper an Körper ausrichten über Flächen

### FL · Flächen (Freiformen) (Welle 3)

Schon da: nichts – Tracery kennt bisher nur Volumenkörper.

- FL-01 Fläche hochziehen, drehen, entlang Pfad, als Übergang
- FL-02 Ebene Fläche aus einem Umriss
- FL-03 Füllfläche: Loch schließen, glatt an die Nachbarn
- FL-04 Begrenzungsfläche aus Kurven in zwei Richtungen
- FL-05 Fläche aus einem Kurvennetz
- FL-06 Regelfläche zwischen zwei Kurven
- FL-07 Fläche versetzen
- FL-08 Fläche trimmen mit Kurve oder Fläche
- FL-09 Fläche verlängern
- FL-10 Trimmung zurücknehmen
- FL-11 Flächen vernähen, bei geschlossener Haut wird ein Volumen daraus
- FL-12 Fläche aufdicken zum Körper
- FL-13 Übergangsfläche zwischen zwei Flächen (tangential oder krümmungsglatt)
- FL-14 Rundung zwischen Flächen
- FL-15 Fläche teilen, Fläche löschen, Fläche aus Körper kopieren
- FL-16 Schnittkurve zweier Flächen, Kurve auf Fläche, Kurven gleicher Richtung (Iso-Kurven)
- FL-17 Trennfläche für Formen
- FL-18 Mittelfläche zwischen zwei Wänden
- FL-19 Freiform-Kneten: Kasten, Zylinder, Kugel durch Ziehen an Punkten formen (SubD)
- FL-20 Freiform in exakten Körper umwandeln
- FL-21 3D-Spline durch Punkte, Schraubenlinie und Spirale als Kurve
- FL-22 Zebra-Streifen und Krümmungsfarben zum Prüfen
- FL-23 Anschluss prüfen (Lücke, Knick, Krümmungssprung)

### BL · Blech (Welle 3)

Schon da: nichts.

- BL-01 Blech-Regeln: Dicke, Biegeradius, K-Faktor, Tabellen je Material
- BL-02 Grundblech aus Umriss
- BL-03 Lasche an einer Kante, mit Winkel und Länge
- BL-04 Laschen rundum auf Gehrung
- BL-05 Saum und Umschlag
- BL-06 Absatz (Z-Biegung)
- BL-07 Biegung an einer gezeichneten Linie
- BL-08 Ecken schließen, Ecken-Freischnitt, Biege-Freischnitt
- BL-09 Abwicklung mit Biegelinien
- BL-10 Abwicklung als DXF mit Biegetabelle
- BL-11 Aufbiegen und Zurückbiegen für Schnitte über eine Biegung
- BL-12 Volumenkörper in Blech umwandeln, Kanten aufreißen
- BL-13 Sicke, Lüftungskieme, Durchzug
- BL-14 Bibliothek für Formwerkzeuge
- BL-15 Übergangsstück rund auf eckig, Kegel und Rohr abwickeln
- BL-16 Steck-Laschen und Schlitze zwischen zwei Blechen
- BL-17 Biege-Reihenfolge und Prüfung „lässt sich das kanten?“
- BL-18 Blech-Zeichnung mit Abwicklung und Biegemaßen

### PR · Profile und Gestelle (Welle 3)

Schon da: nichts.

- PR-01 Profil-Sammlung: Vierkant, Rundrohr, L, U, T, I, Flach
- PR-02 Alu-Nutprofile 20, 30, 40, 45 mit Zubehör
- PR-03 Gestell aus Linien: Profile entlang einer Skizze oder 3D-Skizze
- PR-04 Ecken auf Gehrung oder stumpf, Profile trimmen und verlängern
- PR-05 Endkappen, Fußplatten, Knotenbleche
- PR-06 Eigenes Profil aus einer Skizze
- PR-07 Rohr-Ausklinkung (Fischmaul) samt Papier-Schablone
- PR-08 Schweißnaht als Körper und als Symbol
- PR-09 Zuschnittliste mit Längen und Winkeln, als CSV
- PR-10 Bohrungen für Profil-Verbinder automatisch

### BG · Baugruppen (Welle 2)

Schon da: Gruppen, Bauteile im Kontext, Drehgelenk, Schiebegelenk, Ketten, Anschlag, Abspielen, Durchdringung prüfen, Explosion.

- BG-01 ★ Bauteil und Baugruppe als eigene Dokumente, in Tabs offen
- BG-02 ★ Teil mehrfach einsetzen: eine Vorlage, viele Kopien, Änderung gilt für alle
- BG-03 ★ Unterbaugruppen
- BG-04 ★ Teil festsetzen (fixieren)
- BG-05 ★ Verbindung „fest“ (zwei Flächen oder Punkte aneinander)
- BG-06 ★ Verbindungen zylindrisch, eben (planar), Kugel, Stift im Langloch
- BG-07 ★ Verbindungen parallel, tangential, mit Abstand, mit Winkel, mittig (Breite)
- BG-08 ★ Andock-Punkte an Teilen (Lochmitten, Flächenmitten) und Einrasten beim Ziehen
- BG-09 ★ Teile mit der Maus bewegen, Gelenke rechnen mit
- BG-10 ★ Durchdringungen in der ganzen Baugruppe als Liste, mit Anspringen
- BG-11 ★ Stückliste mit Menge, Material, Gewicht, als CSV
- BG-12 ★ Eigenschaften je Teil: Nummer, Beschreibung, Lieferant, Preis
- BG-13 ★ Teil ersetzen, Teil aus Datei einfügen (STEP, eigenes Projekt)
- BG-14 Kopplungen: Zahnrad, Zahnstange, Schraube, Riemen, linear
- BG-15 Kurvenscheibe (Nocken)
- BG-16 Geschlossene Mechanismen lösen (Viergelenk, Kurbeltrieb)
- BG-17 Kollision beim Ziehen erkennen und anhalten
- BG-18 Abstands-Prüfung (zu wenig Luft zwischen Teilen)
- BG-19 Explosion in Schritten mit Wegen-Linien, als Video
- BG-20 Benannte Stellungen (auf, zu, halb)
- BG-21 Bewegungs-Studie mit Motoren und Zeitachse
- BG-22 Bezüge zwischen Teilen verwalten, einfrieren, lösen
- BG-23 Schrauben automatisch einsetzen (passend zu den Löchern)
- BG-24 Bohrung durch einen Stapel von Teilen
- BG-25 Schritte in der Baugruppe (Schnitt durch mehrere Teile)
- BG-26 Spiegeln und Muster von Teilen in der Baugruppe
- BG-27 Anzeige-Zustände (was ist sichtbar, durchsichtig, farbig)
- BG-28 Varianten für Baugruppen
- BG-29 Leichtmodus für sehr große Baugruppen
- BG-30 Vereinfachte Hülle einer Baugruppe als ein Teil
- BG-31 Baugruppe als ein Körper speichern
- BG-32 Skelett-Skizze: eine Hauptskizze steuert alle Teile
- BG-33 Toleranzkette in einer Richtung nachrechnen
- BG-34 Kabel und Schläuche zwischen Anschlusspunkten

### ZE · Technische Zeichnung (Welle 2)

Schon da: Blatt mit Ansichten, Maße automatisch und von Hand, Schriftfeld, PDF und SVG.

- ZE-01 ★ Mehrere Blätter, Formate A4 bis A0
- ZE-02 ★ Schnittansicht (A–A) mit Schraffur
- ZE-03 ★ Detailansicht (Lupe)
- ZE-04 ★ Maßstab und verdeckte Kanten je Ansicht einstellen
- ZE-05 ★ Isometrische und freie Ansicht, auch schattiert
- ZE-06 ★ Mittellinien und Mittelkreuze automatisch
- ZE-07 ★ Kettenmaß, Bezugsmaß, Winkel, Radius, Durchmesser, Fase
- ZE-08 ★ Maß mit Toleranz (plus/minus, Grenzmaße)
- ZE-09 ★ Passungen (H7, g6) mit Abmaßen aus der Tabelle
- ZE-10 ★ Maß-Stil: Pfeile, Schriftgröße, Nachkommastellen
- ZE-11 ★ Notiz mit Hinweislinie
- ZE-12 ★ Positionsnummern und Stückliste auf dem Blatt
- ZE-13 ★ Zeichnung als DXF und PNG speichern
- ZE-14 ★ Zeichnung merkt, wenn sich das Modell ändert, und zeigt verlorene Maße
- ZE-15 Halbschnitt, abgesetzter Schnitt, Ausbruch
- ZE-16 Unterbrochene Ansicht für lange Teile
- ZE-17 Hilfsansicht schräg zu einer Kante
- ZE-18 Explosionsansicht auf dem Blatt
- ZE-19 Projektion umschalten (Europa/USA)
- ZE-20 Gewinde-Darstellung nach Norm
- ZE-21 Koordinatenmaße, Bogenlänge
- ZE-22 Doppelmaße (mm und Zoll)
- ZE-23 Maße aus dem Modell übernehmen und automatisch ordnen
- ZE-24 Form- und Lagetoleranzen (Rahmen, Bezüge)
- ZE-25 Oberflächenzeichen (Ra), Schweißsymbole, Kantenzustand
- ZE-26 Bohrungstabelle, Änderungstabelle, freie Tabelle
- ZE-27 Symbol-Sammlung
- ZE-28 Schraffur je Material
- ZE-29 Linienarten und Strichstärken nach Norm, Ebenen (Layer)
- ZE-30 Schriftfeld-Editor und Vorlagen (ISO, DIN, ANSI)
- ZE-31 Bild oder Logo auf dem Blatt
- ZE-32 Blech-Abwicklung und Zuschnittliste auf dem Blatt
- ZE-33 Prüfmaße mit Nummern und Prüftabelle
- ZE-34 „Zeichnung fertig machen“: Ansichten und Maße auf Knopfdruck
- ZE-35 Maße und Toleranzen direkt am 3D-Modell (PMI)
- ZE-36 Drucken im Maßstab 1:1 über mehrere Seiten (Schablone)

### IO · Import und Export (Welle 1)

Schon da: STEP und STL rein und raus, 3MF und DXF raus, Projektdatei.

- IO-01 ★ IGES und BREP rein und raus
- IO-02 ★ OBJ rein und raus, glTF/GLB raus – mit Material-Aussehen
- IO-03 ★ 3MF einlesen, 3MF mit Farben und mehreren Teilen
- IO-04 ★ STEP mit Farben, Namen und Baugruppen-Struktur
- IO-05 ★ Jede ebene Fläche als DXF oder SVG speichern
- IO-06 ★ Bild speichern (PNG, wählbare Größe, durchsichtiger Hintergrund)
- IO-07 ★ Nur Auswahl exportieren, alle Körper einzeln mit Namen (Stapel-Export)
- IO-08 ★ Export-Einstellungen: Einheit, Genauigkeit, STL binär oder Text
- IO-09 ★ Dateien per Ziehen ins Fenster öffnen
- IO-10 ★ Import-Prüfung: Fehler zeigen und Lücken heilen
- IO-11 FreeCAD-Datei (FCStd) einlesen
- IO-12 AMF und PLY
- IO-13 USDZ (Ansehen in der echten Umgebung am iPhone)
- IO-14 Punkte-Datei (CSV, XYZ) einlesen
- IO-15 Direkt an den Slicer übergeben (PrusaSlicer, Bambu, Cura)
- IO-16 G-Code speichern (mit dem Fräs-Teil)
- IO-17 Platinen-Daten (IDF) einlesen
- IO-18 Alles als Paket (ZIP): Projekt, Zeichnungen, STEP, STL
- IO-19 Projekt aus einem Link öffnen
- IO-20 DWG lesen und schreiben (schwierig, weil das Format nicht offen ist)

### NE · Netze und Scans (Welle 3)

Schon da: STL als Körper einlesen.

- NE-01 Netz reparieren: Löcher schließen, Flächen richtig herum drehen
- NE-02 Netz vereinfachen (weniger Dreiecke) und glätten
- NE-03 Netz mit einer Ebene schneiden
- NE-04 Netze vereinigen, abziehen, schneiden
- NE-05 Netz in exakten Körper umwandeln (ebene Bereiche zusammenfassen)
- NE-06 Querschnitt eines Netzes als Skizze nachzeichnen
- NE-07 Scan an den Achsen ausrichten
- NE-08 Am Netz messen
- NE-09 Netz aushöhlen und versetzen
- NE-10 Gitter-Füllungen (Waben, Gyroid) für leichte Teile
- NE-11 Oberflächen-Muster als Netz (Rändel, Leder, „Fuzzy“)
- NE-12 Körper in Scheiben schneiden (Schicht-Modell aus Platten)

### PF · Messen und Prüfen (Welle 1)

Schon da: Abstand, Winkel, Fläche, Gewicht, Schwerpunkt, Schnitt, Röntgen, Überhänge, Schwachstellen, Durchdringung.

- PF-01 ★ Kleinster Abstand zwischen zwei Körpern
- PF-02 ★ Wandstärke an einer Stelle messen
- PF-03 ★ Radius und Durchmesser einer runden Fläche, Länge einer Kantenkette
- PF-04 ★ Volumen, Oberfläche und Hüllmaße (Länge × Breite × Höhe) je Körper
- PF-05 ★ Messungen bleiben stehen und aktualisieren sich
- PF-06 ★ Mehrere Schnittebenen, Schnitt mit farbiger Kappe und Maßen
- PF-07 ★ Wandstärken-Analyse in Farben (zu dünn, zu dick)
- PF-08 ★ Geometrie-Prüfung: kaputte Flächen, winzige Kanten
- PF-09 Schräge-Analyse in Farben (kommt es aus der Form?)
- PF-10 Hinterschnitt-Analyse
- PF-11 Kleinster Innenradius (passt der Fräser?)
- PF-12 Vergleich zweier Körper oder Versionen in Farben (neu, weg, gleich)
- PF-13 Trägheitsmomente
- PF-14 Standfestigkeit: kippt das Teil?
- PF-15 Schattenriss-Fläche in Blickrichtung
- PF-16 Symmetrie prüfen
- PF-17 Kosten- und Zeit-Schätzung für den 3D-Druck
- PF-18 Prüfbericht als PDF

### SI · Rechnen und Simulation (Welle 5)

Schon da: Gewicht, Schwerpunkt, Bewegung der Gelenke prüfen.

- SI-01 Festigkeit (lineare Statik): Lasten und Lager setzen
- SI-02 Spannung als Farbbild, Verformung überhöht zeigen
- SI-03 Sicherheitsfaktor je Material
- SI-04 Netz-Feinheit einstellen, Rechnen im Hintergrund
- SI-05 Eigenschwingungen (Modal-Analyse)
- SI-06 Knicken schlanker Teile
- SI-07 Wärmeleitung und Wärmedehnung
- SI-08 „Wo kann Material weg?“ (Topologie-Optimierung)
- SI-09 Bewegung mit Kräften, Federn und Schwerkraft
- SI-10 Balken-Rechner
- SI-11 Schrauben-Rechner (Vorspannung, Anziehmoment)
- SI-12 Passungs-Rechner (ISO 286)
- SI-13 Feder-Rechner
- SI-14 Zahnrad-Rechner (Übersetzung, Achsabstand)
- SI-15 Riemen- und Ketten-Länge
- SI-16 Dichtungs-Rechner für O-Ringe
- SI-17 Einfache Strömung um ein Teil (viel später)

### DR · 3D-Druck (Welle 4)

Schon da: Überhänge, Druckbett-Größe, Gewinde mit Spiel, Gewindeeinsatz, Mutternfalle, Schnapphaken.

- DR-01 ★ Passt es auf den Drucker? Drucker-Liste und Warnung
- DR-02 ★ Loch-Ausgleich: Löcher automatisch etwas größer
- DR-03 ★ Passungs-Vorgaben für Druckteile (lose, fest, Presssitz)
- DR-04 ★ Wandstärken-Check für die Düse
- DR-05 ★ Teil automatisch so drehen, dass es wenig Stützen braucht
- DR-06 Stütz-Vorschau
- DR-07 Brücken erkennen
- DR-08 Teilen mit Steckzapfen, Schwalbenschwanz oder Stiftlöchern
- DR-09 Fase gegen den „Elefantenfuß“
- DR-10 Tropfen-Löcher für liegende Bohrungen
- DR-11 Eigene Stützen als Sollbruch-Körper
- DR-12 Mindestgröße für Schrift prüfen
- DR-13 Farben für Mehrfarben-Druck zuordnen
- DR-14 Teile auf dem Druckbett anordnen
- DR-15 Scharnier, das fertig aus dem Drucker kommt (Print-in-Place)
- DR-16 Bajonett- und Schnappverschluss-Generator
- DR-17 Schraubdeckel-Generator (Dose mit Gewinde)
- DR-18 O-Ring-Nut-Generator
- DR-19 Toleranz-Testteil-Generator für den eigenen Drucker
- DR-20 Gridfinity-Generator (Boxen und Grundplatten)

### LA · Laser, Platten und 2D-Fräse (Welle 4)

Schon da: Platten als DXF.

- LA-01 Schnittbreite (Kerf) ausgleichen
- LA-02 Kasten mit Fingerzinken (Generator)
- LA-03 Steck-Laschen und Schlitze zwischen Platten
- LA-04 Runde Ecken für den Fräser (Dogbone, T-Bone)
- LA-05 Teile platzsparend auf der Platte anordnen (Schachteln)
- LA-06 Haltestege
- LA-07 Ebenen als Farben: schneiden, gravieren, markieren
- LA-08 Biege-Schlitze (lebendes Scharnier)
- LA-09 Platten- und Materialliste
- LA-10 Schnitt-Reihenfolge (innen vor außen)

### CA · Fräsen (CAM) (Welle 4)

Schon da: nichts.

- CA-01 Rohteil und Nullpunkt festlegen
- CA-02 Werkzeug-Sammlung (Fräser, Bohrer) mit Schnittwerten
- CA-03 Planfräsen
- CA-04 Kontur fräsen (außen, innen), mit Haltestegen
- CA-05 Tasche fräsen
- CA-06 Bohren, Gewindefräsen
- CA-07 Nut und Gravur
- CA-08 Fase fräsen und Entgraten
- CA-09 Schruppen in 3D
- CA-10 Schlichten in 3D (parallel, entlang der Höhe)
- CA-11 Restmaterial bearbeiten
- CA-12 Abtrag als Film ansehen
- CA-13 Kollisions-Prüfung von Werkzeug und Halter
- CA-14 Ausgabe für GRBL, Marlin, LinuxCNC, Mach, Fanuc
- CA-15 G-Code-Vorschau
- CA-16 Mehrere Aufspannungen
- CA-17 Vorschub- und Drehzahl-Rechner
- CA-18 Laser- und Schleppmesser-Bahnen
- CA-19 Drehen (später)

### AN · Aussehen und Bilder (Welle 1)

Schon da: Farbe je Teil, hell/dunkel, Qualitätsstufen, Ansichtswürfel.

- AN-01 ★ Farbe je Fläche
- AN-02 ★ Anzeige-Arten: schattiert, mit Kanten, Drahtgitter, verdeckte Kanten
- AN-03 ★ Durchsichtig je Teil
- AN-04 ★ Ansichten speichern und benennen
- AN-05 ★ Blick senkrecht auf eine Fläche, Zoom auf die Auswahl, Ansicht zurück
- AN-06 ★ Aussehen hängt am Werkstoff: Alu und Titan glänzen, Kohlefaser ist dunkel, Glas ist durchsichtig, Holz hat Maserung
- AN-07 ★ Freie Farbwahl (jede Farbe statt zehn fester)
- AN-08 ★ Studio-Licht: eine Umgebung, die sich in Metall und Fasen spiegelt, mit drei bis vier Stimmungen
- AN-09 ★ Weiche Schatten auf dem Boden und in Ecken und Löchern
- AN-10 ★ Form-Prüfansicht (MatCap): glänzender Ton oder Chrom zeigt jede Delle
- AN-11 Boden mit Spiegelung, eigene Umgebungsbilder
- AN-12 Licht von Hand einstellen
- AN-13 Foto-Bild (Raytracing im Browser)
- AN-14 Drehteller als Video oder GIF
- AN-15 Aufkleber und Logos auf Flächen
- AN-16 Texturen
- AN-17 Technische Illustration (nur Umrisse)
- AN-18 Vier Ansichten gleichzeitig
- AN-19 Vorführ-Modus (Vollbild)
- AN-20 Ansehen in der echten Umgebung am Handy (AR)

### BE · Bedienung für jeden Tag (Welle 1)

Schon da: Suchzeile, Tastenkürzel-Übersicht, Auswahlfilter, Isolieren, Rückgängig mit Protokoll, Einfach/Profi, hell/dunkel, automatisches Zwischenspeichern.

- BE-01 ★ Eigene Tastenkürzel
- BE-02 ★ Rechtsklick-Menü überall, passend zur Auswahl
- BE-03 ★ Letzten Befehl wiederholen (Leertaste), Liste der letzten Befehle
- BE-04 ★ Werkzeugleiste anpassen, Favoriten
- BE-05 ★ Fenster-, Kreuz- und Lasso-Auswahl im 3D
- BE-06 ★ „Wähle das dahinter“ bei verdeckten Flächen
- BE-07 ★ Auswahl umkehren, Auswahl speichern
- BE-08 ★ Ausblenden und Zeigen mit einer Taste, „alles zeigen“
- BE-09 ★ Baum links: Ordner, suchen, filtern, per Ziehen sortieren
- BE-10 ★ Einheiten je Projekt: mm, cm, m, Zoll
- BE-11 ★ Genauigkeit und Nachkommastellen einstellen
- BE-12 ★ Maus-Steuerung wie in Fusion, SolidWorks, Onshape oder Blender wählbar
- BE-13 ★ Mehrere Projekte in Tabs, Kopieren und Einfügen dazwischen
- BE-14 ★ Projekt in einem Ordner auf dem Rechner speichern, automatisch mitschreiben
- BE-15 ★ Wiederherstellen nach einem Absturz, auch bei großen Projekten
- BE-16 ★ Englische Oberfläche (danach weitere Sprachen)
- BE-17 ★ Statusleiste: Koordinaten, Auswahl-Info, Einheit
- BE-18 ★ Vorlagen für neue Projekte
- BE-19 Kreis-Menü an der Maus
- BE-20 Malen-Auswahl
- BE-21 Trackpad- und Touch-Gesten, Bedienung mit Stift am Tablet
- BE-22 3D-Maus (SpaceMouse)
- BE-23 Als App installieren, auch ohne Internet nutzbar
- BE-24 Bedienung nur mit Tastatur, hoher Kontrast, Texte für Vorlese-Programme
- BE-25 Meldungs-Zentrale für Fehler und Hinweise
- BE-26 „Welcher Schritt ist langsam?“ mit Zeiten
- BE-27 Rechnen abbrechen
- BE-28 Kommentar-Pins am Modell
- BE-29 Arbeitsflächen-Anordnung speichern
- BE-30 Einstellungen speichern und laden
- BE-31 Oberfläche größer oder kleiner stellen
- BE-32 „Was ist das?“-Modus: Klick erklärt jedes Element
- BE-33 Kurze Bewegt-Bilder in den Hilfen
- BE-34 Beispiel-Galerie
- BE-35 Maß oder Wert in die Zwischenablage kopieren

### DA · Projekte, Versionen, Zusammenarbeit (Welle 6)

Schon da: Versionen speichern, vergleichen, zurückholen; Varianten; Notizstift.

- DA-01 Automatische Versionen mit Kommentar
- DA-02 Zweige: etwas ausprobieren und später zusammenführen
- DA-03 Zwei Versionen im Bild vergleichen
- DA-04 Teile zwischen Projekten verknüpfen, Hinweis „es gibt eine neuere Fassung“
- DA-05 Eigene Teile-Sammlung (Favoriten)
- DA-06 Suche über alle Projekte
- DA-07 Eigenschaften: Nummer, Autor, Beschreibung, Stand
- DA-08 Freigabe-Status: in Arbeit, geprüft, freigegeben
- DA-09 Schritte sperren
- DA-10 Teilen per Link zum Ansehen
- DA-11 Betrachter mit Messen und Schnitt
- DA-12 Einbetten in eine Webseite
- DA-13 Kommentare von anderen
- DA-14 Projekt in GitHub, Drive oder Dropbox ablegen
- DA-15 Konten (freiwillig)
- DA-16 Gleichzeitig am selben Modell arbeiten
- DA-17 Papierkorb
- DA-18 Erinnerung an die Sicherung

### AU · Automatisieren und Erweitern (Welle 5)

Schon da: Formeln, Maße-Tabelle, KI-Kollege.

- AU-01 Skript-Konsole (JavaScript) mit Zugriff aufs Modell
- AU-02 Makro-Aufnahme: Klicks werden ein Skript
- AU-03 Eigene Schritte als Skript, mit Eingabefeldern
- AU-04 Erweiterungen laden (Plugins)
- AU-05 Generatoren teilen (eine Datei, die ein Teil baut)
- AU-06 Teile aus einer Tabelle: jede Zeile eine Variante, Stapel-Export
- AU-07 Teil per Link mit Maßen öffnen (Konfigurator)
- AU-08 Konfigurator-Seite für Kunden
- AU-09 Export ohne Fenster (Kommandozeile) für Automatik
- AU-10 Prüf-Regeln am Modell („Wand mindestens 2 mm“), laufen bei jeder Änderung
- AU-11 Modell als Text (Code-Modus), in beide Richtungen
- AU-12 Python-Skripte
- AU-13 Beispiel-Skripte und Handbuch für Entwickler
- AU-14 Stapel-Umbenennen

### BI · Bibliothek und Generatoren (Welle 2)

Schon da: Schraubenloch, Mutternfalle, Gewindeloch, Gewindebolzen, Gewindeeinsatz, Langloch, Kabelbinder, Schnapphaken, Scharnier, Zahnrad, Chip- und USB-C-Schablonen, 18 Materialien.

- BI-01 ★ Zylinderschrauben, Sechskantschrauben, Senkschrauben, Linsenkopf, Gewindestifte
- BI-02 ★ Muttern (normal, flach, selbstsichernd), Vierkant, Nutensteine
- BI-03 ★ Scheiben, Federringe, Sicherungsringe
- BI-04 ★ Passstifte und Passfedern
- BI-05 ★ Kugellager, Gleitlager, Linearlager
- BI-06 ★ Schrauben M10 bis M24
- BI-07 ★ Material-Sammlung größer: Metalle, Kunststoffe, Holz
- BI-08 ★ Eigene Teile in die Bibliothek legen
- BI-09 O-Ringe mit Nut-Maßen, Wellendichtringe
- BI-10 Druck- und Zugfedern
- BI-11 Zahnräder: schräg, Kegel, Schnecke, innen, Zahnstange
- BI-12 Zahnriemenscheiben (GT2, HTD), Kettenräder
- BI-13 Wellen, Stellringe, Kupplungen
- BI-14 Griffe, Knöpfe, Rändelschrauben, Füße
- BI-15 Magnet-Taschen
- BI-16 Lochbilder: Lüfter 25–140 mm, Schrittmotoren NEMA 14/17/23, Servos
- BI-17 Lochbilder für Platinen: Raspberry Pi, Arduino, ESP32
- BI-18 Ausschnitte: HDMI, Klinke, RJ45, SD, Schalter, Taster, Displays
- BI-19 Batteriefächer (AA, AAA, 18650)
- BI-20 Gehäuse-Generator: Kasten mit Deckel, Schraubdomen, Schnapphaken, Lüftung
- BI-21 Kabel-Durchführung und Zugentlastung
- BI-22 Typenschild und Beschriftung
- BI-23 QR-Code und Barcode
- BI-24 Logo aus SVG
- BI-25 RAL-Farben
- BI-26 Toleranz-Tabellen (ISO 286)
- BI-27 Rohre, Fittings, Flansche
- BI-28 Riemen, Ketten
- BI-29 STEP-Teile aus Hersteller-Katalogen einsortieren

### EL · Elektronik und Gehäuse (Welle 4)

Schon da: Schablonen für QFP, QFN, BGA, SOIC, DIP, Pin-Raster, USB-C.

- EL-01 Platinen-Umriss mit Befestigungslöchern und Sperrflächen
- EL-02 Platine als 3D-Körper mit Bauteilen aus STEP
- EL-03 KiCad-Platine einlesen
- EL-04 Gehäuse automatisch um eine Platine, mit Ausschnitten für die Stecker
- EL-05 Frontplatten-Designer (Ausschnitte und Beschriftung)
- EL-06 Kühlkörper-Generator
- EL-07 Abstandsbolzen passend wählen
- EL-08 Steckverbinder-Sammlung (JST, Stiftleisten, Schraubklemmen)
- EL-09 Weitere Chip-Gehäuse (SOT, TSSOP, LGA) und Bauteil-Schablonen
- EL-10 Kabelbaum mit Längenliste

### KI · KI-Kollege (Welle 5)

Schon da: baut in Runden, bessert Fehler nach, erklärt Schritte, sucht Schwachstellen.

- KI-01 ★ KI ohne Claude-Seite: mit eigenem Schlüssel überall nutzbar
- KI-02 Skizze aus Foto oder Handzeichnung
- KI-03 Skizze automatisch bemaßen und bestimmen
- KI-04 „Mach das druckbar“: Wände, Überhänge, Löcher von selbst anpassen
- KI-05 Zeichnung automatisch erstellen
- KI-06 Teile in der Bibliothek per Beschreibung finden
- KI-07 Maße aus einem Datenblatt (PDF) lesen
- KI-08 Sprach-Eingabe
- KI-09 Vorschlag für den nächsten Schritt
- KI-10 Mehrere Entwürfe zur Auswahl
- KI-11 Gewicht sparen
- KI-12 „Warum geht das nicht?“ für jeden Fehler
- KI-13 Prüfbericht für Druck, Fräse, Laser
- KI-14 Schritte in Importteilen erkennen
- KI-15 Skripte schreiben lassen
- KI-16 Gespräch am Projekt speichern

### LE · Lernen (Welle 5)

Schon da: Einführung, „Deine erste Skizze“, erste Schritte, Hilfetexte, Erklär-Knopf.

- LE-01 Lern-Aufgaben mit automatischer Prüfung
- LE-02 Abzeichen
- LE-03 Lehrer-Modus: Aufgaben stellen, Abgaben ansehen
- LE-04 Glossar
- LE-05 Ein Modell Schritt für Schritt abspielen
- LE-06 Mehr Einführungen: Baugruppe, Zeichnung, 3D-Druck
- LE-07 Tastenkürzel-Trainer
- LE-08 Tipp des Tages

### PL · Unterbau (Welle 1)

Schon da: echter CAD-Kern im Browser, automatische Klicktests, Bezüge über Kanten-Merkmale.

- PL-01 ★ Übersetzbare Oberfläche (alle Texte an einer Stelle)
- PL-02 ★ Lizenz festlegen und ins Projekt schreiben
- PL-03 ★ Schneller Start: Kern und Schriften erst laden, wenn sie gebraucht werden
- PL-04 ★ Große Modelle: nur neu rechnen, was sich geändert hat, mehrere Rechen-Helfer
- PL-05 ★ Stabile Bezüge: Der Kern merkt sich, aus welcher Kante oder Fläche eine neue entstanden ist. Heute findet Tracery Kanten über ihre Lage – ändert man ein frühes Maß, können spätere Rundungen ihre Kante verlieren
- PL-06 ★ Speicher für große Projekte: Browser-Datenbank (IndexedDB) statt des kleinen Speichers mit 5 bis 10 MB, importierte Dateien binär ablegen
- PL-07 ★ Rückgängig merkt sich nur die Änderung statt bis zu 300 ganzer Projekt-Kopien
- PL-08 ★ Tests schneller (mehrere gleichzeitig)
- PL-09 ★ Läuft in Chrome, Firefox, Safari und am Tablet
- PL-10 Skizzen-Löser für Hunderte Kurven: genaue Ableitungen statt Probieren, dünn besetzte Matrizen
- PL-11 Quelltext schrittweise in echte Module aufteilen, mit Typ-Prüfung
- PL-12 Dateiformat offen beschreiben
- PL-13 Fehlerberichte freiwillig senden
- PL-14 Handbuch-Webseite
- PL-15 Gemeinschaft: Forum, Beispiel-Galerie
- PL-16 Sicherheit beim Einlesen fremder Dateien

## 8. Was ehrlich schwierig ist

- **Dateien von SolidWorks, Fusion, Inventor und DWG.** Diese Formate sind nicht offen. Der Weg bleibt STEP, DXF und IGES.
- **Festigkeit, Fräsen, Freiform-Kneten.** Jedes davon ist ein eigenes Großprojekt mit vielen Sitzungen.
- **Blech und Flächen.** Der Kern kann die Geometrie, die Werkzeuge dafür bauen wir selbst.
- **Stabile Bezüge.** Das ist das Problem, an dem FreeCAD viele Jahre gearbeitet hat. Es geht, braucht aber Sorgfalt und viele Tests.
- **Gleichzeitig arbeiten und Konten.** Das braucht einen Server, und der kostet im Betrieb Geld. Bis dahin bleibt alles lokal.
- **KI außerhalb der Claude-Seite.** Der KI-Kollege läuft heute nur dort. Für die freie Fassung braucht jeder Nutzer einen eigenen Schlüssel.


## 9. Stand 23.11.2026 (nach Sitzung 114)

Erledigt aus dieser Liste (ganz oder in einer ersten Fassung, jeweils mit Klicktest):

| Bereich | Erledigt | Sitzung |
| --- | --- | --- |
| SK | SK-01 Maß zum Ablesen · SK-02/03 Verschieben und Drehen mit Werten · SK-04 Skizze skalieren · SK-05 auf einer Linie · SK-11 Kette per Doppelklick · SK-12 Kopieren und Einfügen · SK-13 Skizze umhängen (Grund- und Bezugsebenen) · SK-16 Bogen über die Mitte · SK-17 Rechteck mit runden Ecken · SK-18 Langloch über die Gesamtlänge · SK-19 Tangente an zwei Kreise · SK-20 Ecke bilden · SK-23 Skizze als DXF/SVG · SK-24 DXF/SVG in die Skizze · SK-25 Text in Kurven · SK-26 Messen in der Skizze · SK-53 Maße als Tabelle | 78–98, 109, 111, 114 |
| BZ | BZ-01 Ebene mit Abstand (Grundebene, Fläche, fest), BZ-10 benennen und ausblenden | 86 |
| KP | KP-01 durch alles (teilweise) · KP-02 beidseitig verschieden · KP-04 Formschritte mit Modus · KP-11 Was hängt davon ab · KP-15 Kanten einer Fläche · KP-16 Kanten nach Art · KP-23 Maße als CSV · KP-55 Notiz am Schritt | 83, 90, 94, 105, 108 |
| BG | BG-02 verknüpfte Kopien (einzelne Teile) · BG-11 Stückliste | 80, 89 |
| IO | IO-05 Fläche als DXF/SVG · IO-06 Bild speichern · IO-07 nur Auswahl, jeder Körper einzeln · IO-08 Feinheit, STL als Text | 82, 100, 101, 106 |
| PF | PF-01 kleinster Abstand · PF-02 Wandstärke an einer Stelle · PF-03 Radius, Durchmesser, Kantenlänge · PF-04 Volumen, Oberfläche, Hüllmaße · PF-07 Wandstärken-Ansicht · PF-13 Trägheit · PF-14 Standfestigkeit | 88, 92, 102, 103 |
| AN | AN-01 Farbe je Fläche · AN-02 Anzeige-Arten · AN-03 durchsichtig · AN-04 Ansichten speichern · AN-05 vorige Ansicht (Blick senkrecht und Zoom gab es) · AN-06 bis AN-10 Studio-Look · AN-14 Drehteller-Video · AN-19 Vorführ-Modus | 82, 85, 87, 93, 110, 113 |
| BE | BE-02 Rechtsklick-Menü · BE-03 Befehl wiederholen · BE-05 Rahmen-Auswahl · BE-06 Teil dahinter · BE-07 Auswahl umkehren und speichern · BE-08 Ausblenden/alles zeigen · BE-09 Suchen im Verlauf · BE-12 Maus-Steuerung wählbar · BE-17 Lage unter der Maus (teilweise) · BE-26 Rechenzeit je Schritt · BE-35 Wert kopieren | 84, 92, 93, 99, 104, 105, 107, 112 |
| BI | BI-01 bis BI-03 Normteile (Zylinder- und Senkschraube, Mutter, Scheibe) | 88 |

Noch nicht gemacht aus Abschnitt 4: Drohnen-Teile entfernen (Punkt 1), stabile Bezüge (Punkt 3), Dokument-Arten (Punkt 5), Speicher (Punkt 6), übersetzbare Oberfläche (Punkt 7), Lizenz (Punkt 9).

Ab 23.11.2026 baut Antigravity die Aufgaben selbstständig (Automatik auf dem Mac, siehe `claude/tracery-arbeitsweise.md`). Die Warteschlange liegt in `~/tracery-auto/steuerung/AUFGABEN.md`.

## Quellen

- [Toolradar: 7 Best Free CAD Software Tools in 2026 (Stand 05.11.2026)](https://toolradar.com/blog/best-free-cad-software)
- [Onshape: Fragen zu den Tarifen](https://cad.onshape.com/help/Content/plansfaqs.htm)
- [Autodesk: Fusion for personal use](https://www.autodesk.com/products/fusion-360/personal)
- [Digital Production: FreeCAD 1.1 stacks workflow upgrades](https://digitalproduction.com/2026/04/01/freecad-1-1-stacks-workflow-upgrades/)
- Unabhängiger Bericht „Wie Tracery vom leichten Modell zur kostenlosen Profi-Alternative für CAD & Grafikdesign wird“ (von Nils am 13.11.2026 übergeben), gegen den Code geprüft.
