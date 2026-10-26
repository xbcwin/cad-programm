# Fortschritt

Stand: 26.10.2026 · nach Sitzung 36 (19: Skizze auf Profi-Niveau · 20: Magnet, Rundungs-Griff · 21: Skizzieren im 3D, Übergang, Entlang Pfad, Import · 22: Kreis/Bogen-Arten, Verlängern, Entformungsschräge, Gewinde · 23: Einheiten, eigener Querschnitt, Langloch gebogen, gedrehtes Rechteck, Teilen · 24: Punkt, alle Ecken · 25: Schnitt und Spiegeln an Fläche · 26: Kantenkette, Abstände beim Verschieben · 27: Spiegeln an der Achse · 28: Muster entlang Kurve, Schablonen-Maße geprüft, USB-C-Stecker · 29: Spiegelebene wandert mit, Kreismuster quer und längs, KI kennt Muster entlang Kurve · 30: Bohrungen an Skizzenpunkten · 31: Wand aus Linie, Schritt hinter dem Marker, Schildchen · 32: Kante übernehmen · 33: verbundene Kanten · 34: Kreismuster um gewählte Achse · 35: GoPro-, XT60- und Antennenhalter · 36: Überhänge für den 3D-Druck)

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
- [x] Automatischer Klicktest `tests/klicktest.py`: 106 Durchläufe (alle grün), 146 von 180 Punkten der Testliste automatisch geprüft
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
- [x] Material je Teil: rechts „Material und Gewicht“ mit Volumen und Gewicht des Teils; ohne Auswahl Gewicht des ganzen Projekts und Schwerpunkt (nach Gewicht gemittelt), „Schwerpunkt im Bild zeigen“
- [x] Messen erweitert: Fläche allein → Größe in mm²; zwei Flächen → Abstand (parallel) oder Winkel; Punkt und Fläche → senkrechter Abstand; wie bisher Punkt–Punkt und Durchmesser
- [x] Ähnliche auswählen (Taste A, Knopf „Ähnliche“): alle Teile gleicher Art und Größe (z. B. alle M3-Bohrungen) oder alle gleich langen Kanten – danach zusammen abrunden
- [x] Auswahlfilter (Pfeil-Knopf rechts im Bild): Alles / nur Körper / nur Flächen / nur Kanten
- [x] Versionen (Projektmenü → „Versionen …“): Stand mit Namen speichern, vergleichen (Liste der Änderungen, Gewicht vorher/nachher, alter Stand als roter Umriss), zurückholen (mit Rückgängig); Versionen kommen mit in die Projektdatei
- [x] Push/Pull war schon da („Hochziehen“ an einer Fläche) und bleibt so
- [x] Neue Bauteile `app/src/js/47-mass.js`, `54-select.js`, `59-versions.js`
- [x] Drohnen-Vorlagen auf der Startseite (eigener Abschnitt „Drohnen“, auch in der Eingabezeile): 5" Freestyle und 7" Long Range
- [x] Der Rahmen ist ein echter Rohbau aus Einzelteilen: Unterteil mit Armen und Motorauflagen, Abstandsbolzen, Oberplatte mit Gurtschlitzen, Kamerahalter mit M2-Loch; Löcher für Stack (30,5 × 30,5), Bolzen, Motoren (Lochkreis 16 bzw. 19 als Kreismuster) und Motorwellen
- [x] 12 Maße steuern alles: Achsabstand, Armwinkel, Armbreite, Armdicke, Plattenbreite, -länge, -dicke, Bolzenhöhe, Stack, Motorlochkreis, Kamerabreite, Propeller
- [x] Platzhalter für Stack, Kamera, Motoren, Propellerkreise und Akku – mit Gewicht aus Datenblättern (z. B. iFlight XING-E 2207: 33,8 g, Akku aus den FPV-Maßen)
- [x] Kaufteil mit festem Gewicht: bei „Material“ „Kaufteil: festes Gewicht“ wählen, Gewicht eintippen (auch Formeln wie 4*33,8)
- [x] Vorne ist bei den Drohnen −Y, passend zur Ansicht „Vorne“
- [x] Neues Bauteil `app/src/js/84-drone.js`
- [x] Kaufteil-Daten für die Bauteil-Bibliothek (Gemini, Prompt F): 22 Teile in `app/data/bauteile.json` – Videosender, Empfänger, GPS, Action-Kameras, Stecker, Kondensator; 11 mit Hersteller- oder Händlerangaben verglichen, 2 korrigiert (DJI O4: Sendeeinheit 5,1 g statt 8,2 g; Walksnail 33,5 mm)
- [x] Frame-Assistent (Startseite, Knopf „Drohne“ oder Eingabezeile): Propeller 3–7", Rahmenform, Stack, Motor, Videosystem, Akku; rechnet den Achsabstand (ein Viertel Propeller Luft zwischen den Spitzen) und warnt bei überlappenden Propellern oder unpassendem Motor
- [x] Rahmenformen über zwei Maße: „Armwinkel“ (vorne) und „Armwinkel_hinten“ – beim Deadcat vorne weiter gespreizt
- [x] Knopf „Drohne“ oben: Kaufteile nach Gruppen (Motoren, Akkus, Video, Empfang und GPS, Action-Kameras, Kleinteile) – anklicken oder auf eine Fläche ziehen; sie bleiben eigene Teile mit festem Gewicht
- [x] Kaufteil ohne bekanntes Gewicht: zählt mit 0 g und wird rechts und im Projekt-Gewicht angemahnt
- [x] Lochbild als Bauteil: Stack 30,5 / 25,5 / 20 / 16, Motor-Lochkreis 19 / 16 / 12 / 9 oder eigenes Maß, mit Mittelloch und Drehung; Kabelbinder-Schlitze; Gurtschlitz
- [x] Die Daten aus `app/data` (FPV-Maße, Kaufteile) baut `tools/build.py` direkt in die Seite ein
- [x] Kopfzeile: Messen, Notizen und Ansicht zeigen bei weniger Platz nur ihr Symbol; Dialoge erscheinen jetzt auch über der Startseite
- [x] Neues Bauteil `app/src/js/41-dronelib.js`
- [x] Drohnen-Check (Knopf „Drohne“ → „Drohnen-Check“, rechts unter „Projekt“ oder Eingabezeile): Luft zwischen den Propellerspitzen, Propellerkreise frei (der CAD-Kern schneidet jeden Propellerkreis mit allen Teilen, 1 mm Sicherheitsabstand), Teile stecken nicht ineinander, Abfluggewicht mit fehlenden Gewichten und 250-g-Hinweis, Schwerpunkt gegenüber der Mitte der Motoren (vorne/hinten/links/rechts), Schub zu Gewicht; „Zeigen“ wählt die betroffenen Teile aus
- [x] Schub pro Motor: Vorgabe aus geprüften Herstellerwerten (Gemini Prompt G, `app/data/schub.json`: 1404 → 431,5 g, 2004 → 768 g, 2207 → 2136 g), eigener Wert im Check eintragbar; 2306 und 2806.5 ohne belegbaren Wert
- [x] Der Check hat Fehler im Rahmen-Generator gefunden, die jetzt behoben sind: Oberplatte lag in der Propellerebene (Bolzen jetzt Motorhöhe + 7 mm), hintere Bolzen im Propellerkreis, HD-Sender stieß an die Oberplatte, lange HD-Kameras an die vorderen Bolzen, Kamera/Propeller beim 3"-True-X, Schwerpunkt beim Deadcat 15–24 mm zu weit vorne (der Körper rückt jetzt über die Motormitte). Alle 40 Kombinationen aus 3–7", vier Rahmenformen, Analog und DJI O3 bestehen den Check
- [x] Platten als DXF (Exportieren → „Platten als DXF (für die Fräse)“): jede flache Platte bis 12 mm als eigene Datei in Originalgröße, Außenkontur mit Linien und Bögen, Löcher als Kreise, Ebene KONTUR, Millimeter; Dicke im Dateinamen (z. B. „Unterteil – 5 mm.dxf“); Kaufteile und Propellerkreise kommen nicht mit
- [x] Varianten (oben unter „Maße“): alle Maße unter einem Namen speichern, umschalten (mit Rückgängig), Abweichung wird angezeigt und lässt sich überschreiben; „Vergleichen“ zeigt die Maße, die sich unterscheiden, mit Gewicht, Schub/Gewicht und Luft zwischen den Propellern
- [x] Behoben: Versionen-Vergleich und Varianten rechneten Lagen mit Formeln (z. B. Motorposition) mit den Maßen des aktuellen Stands statt des verglichenen
- [x] Neues Bauteil `app/src/js/86-dronecheck.js`, Kern-Befehl `clashes`
- [x] KI-Schritte: Was der KI-Helfer baut oder ändert, ist ein normaler Schritt in Zeitleiste und Verlauf mit Funken-Symbol; beim Überfahren steht die Bitte dabei, „Rückgängig“ im KI-Fenster oder Strg Z nimmt die ganze Antwort zurück
- [x] Der KI-Helfer kann jetzt auch: Kreis- und Rechteckmuster, Spiegeln, Material, festes Gewicht, Kaufteile aus der Bibliothek, Lochbilder und Kabelbinder-Schlitze, einen kompletten Rahmen über den Frame-Assistenten („Bau mir einen 5-Zoll-Deadcat mit DJI O4“) und danach den Drohnen-Check; er kennt die Drohnen-Maße und das letzte Check-Ergebnis
- [x] „Erklär diesen Schritt“ (Rechtsklick in Zeitleiste oder Verlauf, ?-Knopf am Namen, Eingabezeile): Art, Größe, wie viele Löcher geschnitten werden (Muster zählen mit), an welchen Maßen der Schritt hängt, Material und Gewicht, Rundungen, ob er unterdrückt ist oder hinter dem Marker liegt und ob er von der KI kommt – ohne KI; in Claude erklärt die KI zusätzlich mit Tipp
- [x] Schwachstellen-Analyse (rechts unter „Projekt“ oder Eingabezeile): Löcher zu nah am Rand oder aneinander (von oben gesehen, je Platte), zu dünne Stellen je Material (Druck, Carbon, Metall, Holz), zu dünne Arme je Propellergröße, dazu die roten und gelben Punkte des Drohnen-Checks; „Zeigen“ markiert die Stelle mit roten Ringen und fährt heran; feste Verbesserungen mit einem Klick (Armdicke); in Claude erklärt die KI die Funde und schlägt bis zu drei Verbesserungen vor, die „Umsetzen“ als markierte Schritte übernimmt
- [x] Faustregeln mit Quellen (Gemini Prompt I, 21 Angaben, an den Quellen geprüft, `app/data/faustregeln.json`): Armdicke je Größe – Freestyle 3″ 3 mm, 4″ 4 mm, 5″ 5 mm, 7″ 6 mm, Race eine Stufe dünner (fpvdroneframe.com, 6″ geschätzt); tragende Druckteile ab 1,5 mm, TPU ab 1,5 mm (3D-Demand); Wand um Gewindeeinsätze M2 1,5 mm, M3 2 mm (3Dbite); Lochrand: Hersteller empfehlen für Carbon 2,5 × Durchmesser und 4 × von Mitte zu Mitte (Yongxian) – FPV-Motorauflagen liegen darunter, deshalb meldet Tracery erst unter 1,2 × (Untergrenze aus dem Stahlbau) und nennt den Richtwert im Text; Quellen stehen im Schwachstellen-Fenster
- [x] Arme zwischen Race-Untergrenze und Freestyle-Empfehlung erscheinen als Hinweis (blau), darunter gelb oder rot
- [x] Kleine Akkus (Gemini Prompt J, 5 Typen an Shopseiten geprüft): 4S 450 / 550 / 650 / 850 mAh und 6S 850 mAh mit Maßen und Gewicht; 3″ bekommt jetzt 4S 450, 4″ 4S 650 – damit prüft der Schwerpunkt-Check auch dort mit Akku
- [x] Schub 2806.5: T-Motor F90 1300 KV, 2360 g mit HQ 7040-3 (Testtabelle, Prompt J geprüft); für 2306, 1103 und 1202.5 fand sich keine belegbare Schubtabelle
- [x] Rahmen-Generator: Abstandsbolzen 4,5 statt 4 mm vom Plattenrand (sonst knapp unter 1,2 × Lochdurchmesser); alle 40 Kombinationen bestehen Check und Schwachstellen-Analyse
- [x] KI-Fenster liegt jetzt über der Zeitleiste statt darauf
- [x] Erklärtexte je Schritt-Art (Gemini Prompt H, `app/data/schritt-erklaerungen.json`): was, wozu bei Drohnen, worauf achten – 32 Arten, gegen Tracery geprüft, 19 Sätze berichtigt (u. a. schneiden Löcher auf oberster Ebene ohne Gruppe, Kabelbinder sind zwei Schlitze, Prisma-Durchmesser von Ecke zu Ecke)
- [x] Neues Bauteil `app/src/js/88-aihelp.js`
- [x] Kaufteile nachgeprüft (Gemini Prompt K): 20 von 22 jetzt mit Hersteller- oder Händlerangabe verglichen; berichtigt: HGLRC M100 Mini 2,6 g, GEPRC GEP-M10 Nano 7,5 mm hoch und 4,1 g; Geminis GoPro-Maße waren falsch, die bisherigen (71,8 × 50,8 × 33,6 mm, 154 g) stimmen mit dem GoPro-Datenblatt; XT60H und XT30U ohne vollständige Herstellerangaben
- [x] Schub 2306: iFlight XING2 2306 1755 KV, 1651 g mit Gemfan 51466 bei 24 V (Testtabelle beim Händler) – damit hat auch der 6"-Rahmen einen Richtwert
- [x] Einfache Oberfläche für Einsteiger (Sitzung 15): Umschalter „Einfach / Profi“ oben rechts, auf der Startseite und in den Einstellungen; gilt für diesen Browser und bleibt nach dem Neuladen
- [x] Einfach zeigt: Körper (Quader, Zylinder, Kugel, Kegel, Rohr, Halbkugel), Skizze, Bauteile (Schraubenloch, Mutternfalle, Langloch, Lochbild, Kabelbinder), Drohne, Exportieren; ausgeblendet sind Messen, Notizen, Ansicht, Zeichnung, Protokoll, Varianten, Material je Teil, Fangen, Ansichts-Einstellungen, Muster, Teilen, Boolesch, Ausrichten, Ähnliche, Aushöhlen, Röntgen, Schnitt und Auswahlfilter
- [x] „Mehr“ in der einfachen Oberfläche: Messen, Notizstift, Ansicht, Schwachstellen und „Alle Werkzeuge zeigen“ – die Eingabezeile findet weiterhin jedes Werkzeug
- [x] Kaufteile in echter Form (Sitzung 16): Motoren mit Fuß, Gewindelöchern im Lochkreis, Stator-Spalt, Glocke mit Lüftungslöchern und Welle; Propeller mit Nabe, drei angestellten Blättern (gegenläufig gespiegelt) und dünnem Ring für den Propellerkreis; Stack aus zwei Platinen auf Dämpfern mit Bauteilen und Löchern; FPV-Kamera mit Objektiv nach vorne und seitlichen M2-Gewinden; digitaler Sender mit Kühlrippen und Lochbild; analoger Sender und Empfänger als Platine mit Abschirmung; GPS mit Keramik-Antenne; Akku mit abgerundeten Kanten; Action-Kamera mit Objektiv; Akkustecker; Elko
- [x] Alle Formen bleiben in den Datenblatt-Maßen; Maße lassen sich rechts ändern (z. B. Glocke Ø, Lochkreis), das Gewicht kommt weiter aus dem Datenblatt; der Frame-Assistent baut mit den echten Formen, alle 40 Kombinationen bestehen Check und Schwachstellen-Analyse
- [x] KI-Kollege (Sitzung 17): nimmt große Aufträge an („Mach alles als Verbund“, „Richte alles mittig aus“, „Prüf die Drohne und behebe, was nicht passt“), schreibt einen Plan mit Haken, arbeitet in bis zu 5 Runden und sieht nach jeder Runde das neu gerechnete Modell mit Rückmeldung (was geklappt hat, Meldungen, neue Fehler, Drohnen-Check, Schwachstellen)
- [x] Neue Fehler behebt der Kollege selbst (höchstens zwei Nachbesserungen); „Selbstständig“ oben im Fenster schaltet das Arbeiten in Runden ab
- [x] Rückfragen nur bei echten Unklarheiten – mit Antwort-Knöpfen; das Gespräch (letzte 6 Aufträge) bleibt im Kopf, Antworten auf Rückfragen werden erkannt
- [x] Neue Aktionen: verbinden (Verbund = ein Körper; Kaufteile bleiben automatisch einzeln, damit ihr Gewicht stimmt), lösen, abziehen, Schnittmenge, ausrichten, zentrieren, verschieben (um/nach, auch bei Formeln), drehen (beliebiger Winkel), umklappen, kopieren (mit Anzahl und Versatz), auf die Platte legen, Rolle, Farbe, umbenennen, aus-/einblenden, unterdrücken/aktivieren, Schwachstellen, auswählen; Rundung mit „ersetzen“
- [x] Teile ansprechen mit „alle“, „auswahl“, „koerper“, „loecher“, „kaufteile“, „neu“, „name:…“ oder Listen; die KI sieht die Lage (min/max) jedes Teils und die aktuellen Fehler
- [x] Ein ganzer Auftrag ist danach EIN Rückgängig-Schritt (auch „Umsetzen“ bei Schwachstellen-Vorschlägen); Meldungen während der Arbeit landen in der Rückmeldung statt als Einblendung
- [x] „Alles als Verbund“ geht auch ohne KI: Eingabezeile „verbund“ oder „Mach alles als Verbund“ außerhalb von Claude
- [x] Behoben: Meldungen wie „Rundung zu groß“ verschwanden, sobald eine andere Änderung neu rechnen ließ (der CAD-Kern merkt sich die Meldungen jetzt zur gespeicherten Form)
- [x] Speed-Drohne (Sitzung 18): Stromlinien-Rumpf (PETG, hohl, glatte Flächen) mit runder Nase, Mittelteil und langem, spitz auslaufendem Heck – Kamera in der Nase, Stack mit Sender und dahinter der Akku liegen innen, unten geschlossen bis auf die Auflage auf der Mittelplatte; Durchmesser, Achshöhe, Längen und Lage (Schwerpunkt über der Motormitte) rechnet Tracery aus den Teilen, alles als Maße veränderbar
- [x] Geneigte Motoren: Maß „Motorneigung“ (Standard 20°) mit gedruckten Keilen, schrägen Motorschrauben und Wellenlöchern; bei dieser Schräglage liegt der Rumpf im schnellen Flug genau im Fahrtwind; der Frame-Assistent warnt, ab welcher Neigung die hinteren Propeller ihre Arme streifen
- [x] Neues Bauteil „Stromlinien-Rumpf“ (Bauteile, Profi) für eigene Rümpfe
- [x] Drohnen-Check prüft geneigte Propeller entlang der Motorachse und zeigt beim Speed-Rumpf Schlankheit und Fluglage
- [x] Cinewhoop: Ducts (PC) um die Propeller, 3 mm Spalt, enden knapp unter der Oberplatte und wachsen mit der Bolzenhöhe mit; kurze Platte, Achsabstand so, dass Kamera und Bolzen außerhalb der Ducts bleiben
- [x] Neue Größe 3,5 Zoll (Motor 2004, 25,5er Stack, 4S 850)
- [x] Neue Bausätze auf der Startseite: 5" Race (Stretched-X), 5" Speed (Rumpf), 3,5" Cinewhoop (DJI O4) – alle bestehen Drohnen-Check und Schwachstellen-Analyse
- [x] Rahmen von Herstellern nachbauen (Frame-Assistent → „Vorlage“): TBS Source One V5, GEPRC Mark5 O4 Pro Wide X, SpeedyBee Master 5 V2, iFlight Nazgul Evoque F5 V3 (Deadcat und True X), GEPRC Cinelog35 V2, AOS RC HS5 High-Speed – Achsabstand, Armdicke, Plattendicke, Stack und Lochbild von der Hersteller- oder Händlerseite (`app/data/rahmen.json`, mit Quelle); die Umrisse sind vereinfacht
- [x] Fester Achsabstand: Platten werden kürzer und schmaler, bis Kamera und Bolzen frei sind; passt Tracerys Rumpf nicht (Cinelog35: 142 mm), nimmt der Nachbau so viel mehr wie nötig und sagt das
- [x] Drohnen-Check vergleicht beim Nachbau das Rahmengewicht im Modell mit dem Original
- [x] KI-Kollege kennt die neuen Formen, 3,5 Zoll und die Herstellerrahmen („Bau mir den AOS HS5 nach“)
- [x] 6 weitere Herstellerrahmen aus Gemini Prompt L, jeder auf einer Händlerseite nachgeprüft: iFlight AOS 5 V5.1, iFlight Cidora SL5 V2.1 HD, iFlight Chimera7 Pro V2 O4 (7,5 Zoll), Foxeer Caesar 5", HGLRC Rekon7 Pro V2, Sub250 OasisFly35 DC – zusammen 13 Vorlagen. 14 von Geminis 20 Vorschlägen verworfen: 3 gibt es nicht (alle drei „Speed-Rahmen“), bei mehreren stimmten Achsabstand oder Gewicht nicht, einige ohne Quelle, 5 kleiner als 3 Zoll
- [x] Herstellerrahmen: Würden sich mit Tracerys Richtwinkeln die Propeller berühren, passen sich die Armwinkel an (Deadcat hinten weiter, Wide-X Richtung 45°)
- [x] Kaufteile aus Gemini Prompt M nachgeprüft: Motoren 1404 (iFlight XING2, 9,1 g, Lochkreis 9), 2004 (T-Motor F2004, 16,4 g), 2306 (iFlight XING2, 32,5 g) mit Datenblatt-Maßen; Stack-Gewicht je Lochbild (SpeedyBee: 20 × 20 16,8 g, 25,5 AIO 10,1 g, 30,5 34 g); Propeller 3" 3 g, 5" 4,2 g, 7" 9,7 g; Akkus 3S 450, 4S 1100, 6S 1100; Kameras Caddx Ratel 2 und RunCam Phoenix 2 Nano. Nicht übernommen: Happymodel 1103 (anderes Lochbild), Crossfire Nano RX und Razer Mini/Ant (Maße fehlen), Auline-Li-Ion und HQProp 5.1 (widersprüchliche Angaben), Antennen (brauchen erst eine eigene Form)

## Offen

### Stufe 1 – Fundament
Fertig.

### Stufe 2 – Skizzen
- [x] Skizze auf Körperflächen (war schon da, in Sitzung 5 geprüft)
- [x] Bemaßung mit Formeln, nachträglich bearbeiten (Sitzung 5)
- [x] Bedingungen mit Solver (Sitzung 6)
- [x] Trimmen, Versatz, Spiegeln, Muster in der Skizze (Sitzung 7)
- [x] Spline, Fangen, Hilfslinien (Sitzung 7)
- [x] Spline als glatte Kurve im Kern: genaue Bézier-Stücke statt kurzer Linien (Sitzung 19)
- [x] Ecke runden / fasen in der Skizze, Ellipse, Rechteck aus der Mitte, Text (Schrift Inter), Bild-Vorlage mit Maßstab, Regeln Mittig und Konzentrisch (Sitzung 19)
- [x] Kreis aus 2 / 3 Punkten, tangentialer Bogen, Verlängern (Sitzung 22); Pin-Raster als Schablone (Sitzung 21)
- [x] Einheiten im Maßfeld und in Formeln: 2 cm, 1/4", 0,5 m, 10mm+2cm (Sitzung 23)
- [x] Entlang Pfad mit eigener Form aus einem Skizzenkörper (Sitzung 23)
- [x] Linie oder Bogen teilen (Sitzung 23); KI-Kollege kennt Gewinde und Entformungsschräge
- [x] Gebogenes Langloch, gedrehtes Rechteck (3 Punkte), Vieleck über die Flächen (Schlüsselweite) (Sitzung 23)
- [x] Punkt als eigenes Element, alle Ecken auf einmal runden/fasen (Sitzung 24)
- [x] KI-Kollege baut Übergang, Entlang Pfad, Ellipse und Text (Sitzung 24)
- [x] Kantenkette wählen (Kette), Abstand zu den Nachbarn live beim Verschieben (Sitzung 26)
- [x] An einer Fläche spiegeln (gespiegelte Kopie, ein Körper); Schnitt parallel zu einer gewählten Fläche; neue Werkzeuge in der Suchzeile (Übergang, Zur Spitze, Schräge, Abstand, Rohr entlang Pfad) (Sitzung 25)
- [x] Schritt hinter dem Marker oder unterdrückt: statt der Werkzeugleiste nur „Marker dahinter“ bzw. „Wieder einschalten“, keine Griffe (Sitzung 31)
- [x] Spiegelebene hängt an der Fläche: Wird das Original größer, wandert sie mit (äußerste Fläche in Achsrichtung) (Sitzung 29)
- [ ] Ellipse und Text trimmen und versetzen; Text entlang einer Kurve
- [ ] Muster und Versatz: Anzahl/Abstand nachträglich für das ganze Muster ändern (heute je Kopie über das Regel-Symbol)
- [x] Spiegeln an der X- oder Y-Achse ohne eigene Linie (Sitzung 27)
- [x] Werkzeug „Wand“ (N): offene Linie, Linienzug, Bogen oder Spline wird zur geschlossenen Wand mit einstellbarer Dicke (beide Seiten halb, Enden zu, per Regeln verbunden; die Linie bleibt Hilfslinie) – für Rippen, Stege, Antennenhalter (Sitzung 31)
- [x] Skizzen-Leiste etwas kompakter, damit sie trotz neuer Werkzeuge bei zwei Zeilen bleibt (Sitzung 32)
- [x] Verbundene Kanten: übernommene Kanten merken sich Körper und Kante und wandern mit, wenn sich der Körper ändert (Linie, Bogen, Kreis, Spline); die Nachführung gehört zum selben Rückgängig-Schritt; Ketten-Symbol in der Skizze, „Verbindung lösen“ (Sitzung 33)
- [x] Werkzeug „Kante übernehmen“ (Z): Klick auf eine Körperkante holt sie in die Skizze – gerade als feste Linie, rund als Bogen oder Kreis, sonst als Spline (Sitzung 32)
- [x] Maß-Schildchen, die übereinander lägen, rücken untereinander (z. B. „X 0“ und „Y 0“ am Ursprung) (Sitzung 31)

### Stufe 3 – Features und Ansichten
- [x] Magnetisches Einrasten wie bei Canva: auf Flächen (Mitte, Mittellinien, Lochmitten, Kantenmitten, gleicher Randabstand) und zwischen Körpern (bündig, mittig, gleiche Abstände), mit Hilfslinien; Strg hält es an, abschaltbar in den Einstellungen (Sitzung 20)
- [x] Rundung mit Ziehgriff an der gewählten Kante, Radius live, Zahl tippen geht auch (Sitzung 20)
- [ ] Magnet auch auf gewölbten Flächen und für Kaufteile beim Ziehen aus der Leiste mit eigener Form
- [x] Bohrungs-Assistent, Wandstärke, Muster, Spiegeln, Boolesch, Teilen (Sitzung 8)
- [x] Muster entlang Kurve: Körper oder Loch wählen → „Muster“ → „Muster entlang Kurve“, Kurve zeichnen (Linie, Bogen, Spline, Kreis oder geschlossener Umriss); Anzahl, Abstand (0 = gleichmäßig verteilt) und Ausrichtung (mit der Kurve drehen oder nicht), „Kurve bearbeiten“; beim Zeichnen zeigen Ringe, wo die Kopien landen (Sitzung 28)
- [x] Kreismuster auch um eine Achse quer (X) oder längs (Y), mit Mitte Z – z. B. Löcher rund um ein liegendes Rohr; KI-Kollege kennt „Muster entlang Kurve“ und die Drehachse (Sitzung 29)
- [x] Muster entlang einer Körperkante: beim Zeichnen der Kurve „Kante übernehmen“ (Sitzung 32)
- [x] Kreismuster um eine im Bild gewählte Achse: gerade Kante, runder Rand (Achse durch die Mitte) oder runde Fläche wie Welle oder Loch – auch schräg; der KI-Kollege kann eine Achsrichtung angeben (Sitzung 34)
- [x] Bohrungen an Skizzenpunkten: Skizze auf einer Körperfläche nur mit Punkten → „Fertig“ öffnet den Bohrungs-Assistenten und setzt an jedem Punkt ein Loch, genau an der bemaßten Stelle (Sitzung 30)
- [x] Explosionsansicht, Fokus-Vorschau, Schnitt, Röntgen (Sitzung 9)
- [ ] Explosion auch für die Teile innerhalb einer Gruppe (heute nur oberste Ebene)
- [x] Schnitt an einer beliebigen Fläche („Schnitt hier“, Sitzung 25)
- [x] Messen, Material pro Teil, Push/Pull, „ähnliche auswählen“, Versionen (Sitzung 10)
- [ ] Versionen in der Cloud (mit Stufe 6 – Konten)

### Stufe 4 – Drohnen-Modul
- [x] 5"-Vorlage (Sitzung 11), dazu 7" Long Range
- [x] Frame-Assistent mit 3" bis 7" und Rahmenformen True-X, Stretched-X, Wide-X, Deadcat (Sitzung 12)
- [x] Lochbilder, Bauteil-Bibliothek, erste Detail-Bausteine (Kabelbinder, Gurtschlitz) (Sitzung 12)
- [x] Speed-Drohne mit Stromlinien-Rumpf und geneigten Motoren, Cinewhoop mit Ducts, 3,5 Zoll, Rahmen von Herstellern (Sitzung 18)
- [ ] Speed-Drohne: Verkleidungen für Arme und Motoren, Luftwiderstand ausrechnen
- [ ] Antennen als Kaufteile (Daten von Lumenier AXII 2, TrueRC Singularity, Foxeer Lollipop 4 liegen vor) – brauchen eine eigene Form
- [ ] Größen 2 und 2,5 Zoll für kleine Cinewhoops (BetaFPV Pavo25 V2 ist schon nachgeprüft)
- [ ] Herstellerrahmen mit Original-Umriss (heute: Tracerys Grundform mit den Herstellermaßen)
- [ ] H-Rahmen und Rahmen mit getrennten Armen (Sandwich)
- [x] Detail-Bausteine (Drohne → „Lochbilder und Bausteine“ und Bauteile): GoPro-Halterung (2 oder 3 Finger, M5-Loch, Mutter-Nabe), Stecker-Halter XT60 (Ausschnitt mit Spiel und zwei Schraubenlöchern), Antennenhalter (1 oder 2 Röhrchen, Spreizung und Neigung) – alle Maße einstellbar (Sitzung 35)
- [x] Prüfungen, DXF-Export, Varianten (Sitzung 13)
- [ ] Drohnen-Check auch für Rahmen, die nicht aus dem Assistenten kommen (heute braucht er die Maße Achsabstand, Armwinkel, Propeller)

### Stufe 5 – KI und Feinschliff
- [x] KI-Helfer auf der Zeitleiste, „Erklär diesen Schritt“, Schwachstellen-Analyse (Sitzung 14)
- [x] Ansicht „Überhänge (3D-Druck)“: rot, was steiler als der Grenzwinkel (35–60°, Standard 45°) nach unten zeigt und nicht auf dem Druckbett liegt, dazu die Fläche, die Stützen braucht (Sitzung 36)
- [ ] Schwachstellen auch für gedruckte Teile genauer: Wand um Schraubenlöcher
- [x] Einsteiger-Oberfläche (Sitzung 15)
- [x] Übergang (Loft) durch mehrere Umrisse, „Zur Spitze“ / Spitze verlängern (Sitzung 21)
- [x] Entlang Pfad (Sweep): offener Pfad wird Rohr oder rechteckiger Kanal, auch hohl (Sitzung 21)
- [x] Skizzen-Ebene verschieben und neigen (Konstruktionsebene), Doppelklick auf ebene Fläche startet die Skizze, rechtes Panel heißt „Eigenschaften“ (Sitzung 21)
- [x] STEP und STL importieren (Datei öffnen oder ins Fenster ziehen), Einheit wählbar; Abstand zwischen zwei Teilen genau setzen (Sitzung 21)
- [x] Skizzen-Schablonen: Pin-Raster, Lüftungsgitter, Chip-Gehäuse QFP, QFN, BGA, SOIC, DIP mit einstellbaren Maßen (Sitzung 21)
- [x] Entformungsschräge (Seitenwände neigen), echte metrische Gewinde: Gewindebolzen und gedrucktes Innengewinde; Schablonen USB-C-Ausschnitt und Befestigungslöcher (Sitzung 22)
- [x] Schablonen-Maße mit Gemini Prompt N gegen JEDEC-Normen und Datenblätter geprüft und von Hand nachgesehen: 3 Werte korrigiert (QFP-Pin-Breite 0,27 → 0,22 mm Nennmaß, BGA-Gehäuse 9 → 10 mm, DIP-8-Gehäuse 9,8 → 9,27 mm), die übrigen 17 stimmten. Jede Chip-Schablone zeigt ihre Quelle und den Toleranzbereich. USB-C: Für den Ausschnitt gibt es keinen genormten Wert – darum zwei Schablonen: „Buchse“ (9,5 × 3,8, Buchse bündig mit der Wand) und neu „Stecker“ (13 × 7 mit Eckradius, für eine Buchse hinter der Wand; die Norm erlaubt Stecker bis 12,35 × 6,5 mm) (Sitzung 28)
- [ ] 3D-Skizzen, Übergang mit Führungskurven, Sweep mit eigenem Querschnitt aus einer Skizze, Gelenke
- [ ] Einsteiger-Oberfläche weiter vereinfachen: größere Knöpfe, geführte erste Schritte im leeren Projekt

### Stufe 6 – Konten und Zusammenarbeit (Idee, nach dem Drohnen-Modul)
- [ ] A: Konto mit Name und Passwort, Projekte in der Cloud
- [ ] B: Gruppen und Teilen
- [ ] C: Gleichzeitig arbeiten

## Bekannte Punkte

- „An Fläche spiegeln“ hängt nur an der äußersten Fläche in Achsrichtung; bei einer inneren oder schrägen Fläche bleibt die Ebene, wo sie beim Spiegeln war

- Text kennt keine Unterschneidung (Kerning) – die Buchstaben stehen nach ihrer Laufweite
- Ellipse und Text lassen sich nicht trimmen; Ellipsen-Drehung ist keine Regel (nur ein Wert)

- Vorlagen bestehen aus einer Gruppe: Über „Bearbeiten“ im Verlauf sieht man ihre einzelnen Schritte in der Zeitleiste
- Verbundene Kanten finden ihre Kante über Lage, Art und Länge wieder: Springt eine Kante sehr weit oder verschwindet sie, bleibt die übernommene Kante stehen; die Kanten aus „Skizze auf einer Fläche“ (Fangpunkte) sind noch nicht verbunden
- Vielecke lassen sich noch nicht drehen per Regel (nur über die Lage)
- Teilen ergibt zwei Hälften in einem Schritt; einzeln verschieben geht erst nach „Auflösen“ (dann ist der Schnitt weg)
- Feature-Gruppen (mehrere Schritte als einen benannten Block zusammenfassen) aus dem Bauplan sind noch nicht gebaut – Bauteile decken das heute teilweise ab
