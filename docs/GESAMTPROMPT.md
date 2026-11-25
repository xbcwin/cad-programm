# Tracery – Gesamtprompt (Stand 21.11.2026, nach Sitzung 114)

> Diesen Text komplett in einen neuen Chat oder eine andere KI einfügen. Er beschreibt das ganze Projekt so genau, dass die KI ohne Rückfragen weiterarbeiten kann.

---

## 1. Deine Rolle und das Ziel

Du entwickelst **Tracery** weiter, ein CAD-Programm im Browser. Der Besitzer ist **Nils Kriege** aus Berlin. Tracery soll eines der besten CAD-Programme werden, auf dem Niveau von Fusion 360, Onshape und SolidWorks. Der Schwerpunkt liegt auf **FPV- und Speed-Drohnen** und auf technischen Teilen für den 3D-Druck und die CNC-Fräse.

Leitlinien:
- Die Oberfläche ist **komplett Deutsch, in Du-Form** und **kindgerecht erklärt**: kurze Sätze und Alltagswörter. Trotzdem ist es **ernsthaftes, präzises CAD** mit exaktem B-Rep-Kern, Maßen, Formeln und Zeitleiste.
- Nils hat sich ausdrücklich gewünscht:
  - leichteres Abrunden
  - leichteres Skizzieren direkt im 3D
  - magnetisches Einrasten wie bei Canva
  - sehr viele Werkzeuge
  - starke 2D-Skizzen, auch für Elektronik wie Prozessoren und Chips
- **Keine erfundenen Daten.** Maße von Kaufteilen und Normen kommen aus Datenblättern oder Händlerseiten mit Quelle. Werte, die nicht belegt sind, werden als Schätzung markiert.
- Antworten an Nils kommen auf Deutsch. Am Ende jeder Sitzung steht eine kurze Liste „Erledigt / Offen“. Ohne Fachchinesisch, Pfade nur, wenn nötig.

## 2. Zusammenarbeit und feste Regeln

- **Immer nur EIN Chat arbeitet am Code.**
- **Code-Ablage:** GitHub-Repository `xbcwin/cad-programm`, lokal auf Nils’ Mac unter `~/Documents/GitHub/cad-programm`.
  - Von Claude aus ist der Ordner über die Mac-Brücke erreichbar, mit den Werkzeugen `mcp__remote-devices__*`. Im Brücken-Shell heißt der Pfad `~/mnt/GitHub/cad-programm`.
- **Commits** macht die KI direkt im Mac-Ordner, immer als `Nils Kriege <nilskriege@icloud.com>`. „Push origin“ drückt **Nils selbst**.
  - Die Commit-Nachricht ist deutsch: „Sitzung N: …“, darunter Stichpunkte.
  - Sie endet mit:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: <Link zur Sitzung>
    ```
- **Ablauf beim Commit:**
  1. Die geänderten Dateien (Vergleich mit dem letzten committeten Stand) als Datei bereitstellen. Das ergibt eine `fileUuid`.
  2. `device_commit_files` schreibt sie an `/Users/nilskriege/Documents/GitHub/cad-programm/…`.
  3. Im Brücken-Shell:
     ```
     python3 tools/build.py --check && git add -A && git -c user.name="Nils Kriege" -c user.email="nilskriege@icloud.com" commit -q -F -
     ```
- **Git-Sperrdateien:** In einem verbundenen Ordner darf die Brücke ohne Freigabe nichts löschen. Die Freigabe (`device_request_delete_permission`) gilt nur für eine Sitzung.
  - Bleiben `.git/HEAD.lock`, `.git/index.lock` oder `.git/objects/maintenance.lock` liegen, scheitert der nächste Git-Befehl mit „File exists“.
  - Ohne Freigabe: Sperrdatei per `mv` direkt unter `.git/` umbenennen (z. B. `.git/stale-HEAD.lock-<zeit>`), nie löschen.
  - `tmp_obj_*`-Dateien stören nicht.
- **Ist der Mac offline:** Die geänderten Dateien als ZIP an Nils schicken und committen, sobald er wieder da ist.
- **Gemini 4 Argon** darf am Code arbeiten, aber nur auf dem Zweig „argon“ (Prompt `docs/PROMPT-ARGON.md`). Claude prüft dessen Arbeit mit den Klicktests und übernimmt sie auf main (Argon 1 = Gelenk-Ketten). Vor jeder Sitzung prüfen, auf welchem Zweig der Mac-Ordner steht.
- **Gemini als Helfer:** Nils gibt Recherche- und Datenaufgaben an Gemini, zum Beispiel Datenblatt-Werte, Texte und Symbole.
  - Die KI schreibt dafür einen genauen Prompt („Gemini Prompt A, B, C …“, zuletzt **O**). Er verlangt JSON-Antworten mit Quelle je Wert und null statt Schätzungen.
  - Jede Gemini-Antwort wird **nachgeprüft**: Stichproben an Hersteller- oder Händlerseiten, eigene Websuche. Falsche Werte werden verworfen und begründet.
  - **Offen:** Prompt O fragt nach Maßen für XT60H/XT30U, für die Antennen Lumenier AXII 2, TrueRC Singularity und Foxeer Lollipop 4 sowie nach Teilen für 2"- und 2,5"-Cinewhoops (Motoren 1103/1204/1303, Propeller, Pavo20/Pavo25 V2, 2S-Akkus). Die Antwort steht noch aus.
- **Fortschritt:** Jede Sitzung bekommt eine Nummer, zuletzt **72**. Gepflegt werden:
  - `docs/FORTSCHRITT.md` mit Stand-Zeile, Erledigt nach Stufen und „Bekannte Punkte“
  - `docs/TESTLISTE.md` mit Abschnitt „(neu in Sitzung N)“: `[x]` = automatisch geprüft, `[ ]` = von Hand
  - `docs/BAUPLAN.md`
- **Weitere Ablagen:**
  - Claude-Projekt „cad-program“ mit dem Dokument `claude/tracery-arbeitsweise.md` (Arbeitsweise für neue Chats)
  - Claude-Doc „Tracery im Vergleich“ mit Fahrplan: Abschnitt „Stand …“ und nummerierte Liste „Sitzung … (fertig)“, „Als Nächstes“, „Danach“
- **Online-Fassung:** Claude-Seite „Tracery“ (Artifact `XEPqXweoEvihS7rLJezNpS`), Version 14 = Sitzung 43, als Nächstes Sitzung 47.
  - Bauen: `python3 tools/build.py --artifact ORDNER` erzeugt `index.html`, `tracery.css` und `tracery.js`.
  - Veröffentlichen: mit `url` und nur den geänderten Dateien, `kernel/core.js` nur, wenn der Kern sich geändert hat.
  - Die Seite nutzt die Fähigkeiten `sample` (KI-Kollege) und `downloads` (Speichern).
  - Die alte Seite `M7fu7gjPBEk91rV5VAhvLG` nur löschen, wenn Nils es sagt.

## 3. Technischer Aufbau

**Eine Seite, viele Quelldateien.**
- `app/src/` enthält `styles.css`, das HTML-Gerüst und `js/` mit ca. 40 Teilen.
- `python3 tools/build.py` baut daraus `app/index.html`. **index.html nie direkt ändern.** `--check` prüft, ob sie aktuell ist.
- Die Reihenfolge der JS-Teile steht in `tools/build.py`: gemeinsamer Gültigkeitsbereich, neue Dateien dort eintragen.
- JSON aus `app/data/` wird über Platzhalter `/*JSON:name.json*/null` eingesetzt.

**CAD-Kern:**
- `app/kernel/core.js`: OpenCascade über **replicad** in einem Web Worker, `occ-kernel.wasm`.
- Wichtige Funktionen:
  - Grundkörper und `buildPart` (Bibliotheksteile)
  - `buildExtrude`/`buildRevolve`/`buildLoft`/`buildSweep`/`buildImport`
  - `patternShape` (Rechteck, Kreis mit Achse z/x/y/pick, Pfad, Spiegeln auch an Fläche mit `bind`)
  - `splitBody`, `applyFinishes` (Rundung, Fase, Vollrundung `fullFillet`, Flächen-Rundung `faceFillet`, Ecken-Fase `cornerChamfer`, Entformungsschräge `draft`, Schräge an Trennlinie `partingDraft`, Wandstärke `shell`), Topologie-Verlauf (`tid`, `sid`, OpenCascade `Generated`/`Modified`, Lage als Ersatz)
  - `evaluate`, `measure`, `project` (Zeichnung, DXF), `clashes` (Durchdringungen und Prüfkörper), `faceLoops`, `checkGeometry` (Geometrie-Prüfung PF-08), `checkSymmetry` (Symmetrie-Prüfung PF-16), `compareSolids` (3-Farben-Vergleich PF-12), `checkImport`/`healImport` (BRepCheck, ShapeFix, Nähen mit Toleranz)
- Gewinde über Helix-Sweep mit `PITCH`-Tabelle.

**JS-Module (Datei → Aufgabe):**

| Datei | Aufgabe |
| --- | --- |
| `00-util.js` | Hilfen, `Expr`-Rechner (`wenn`, `runden`/`aufrunden`/`abrunden`, `tabelle`, `< > <= >= == !=`, Klartext-Fehler) mit Einheiten (mm, cm, m, in, zoll, ", °), Projekt-Einheiten `Units` (`mm`, `cm`, `m`, `in`), Anzeige-Rundung `FMT`/`fmt`/`fmtFixed`/`fmtAngle`/`fmtAngleU`, Icon-Set `IC`, eingebettete Hilfetexte `HELP` (muss immer gleich `app/data/werkzeug-hilfen.json` sein, per Python neu erzeugen) |
| `01-i18n.js` | Übersetzbare Oberfläche (`I18n`, `T(key, vars)`, `I18n.detect`/`resolve`/`use`, `I18n.setTestMode()`, `data-i18n-html`/`data-i18n-title`, eingebettete `TEXTS_DE`/`TEXTS_EN` aus `app/data/texte-de.json` und `texte-en.json`) |
| `05-storage.js` | Browser-Datenbank (`Store`, IndexedDB `tracery-db` mit `projects`, `versions`, `blobs`, `meta`), binäre Import-Blobs, Projekt-Cache & Ereignisse (`getCachedProject`/`ensureDocsLoaded`/`on`), offene Tabs (`getOpenTabs`/`setOpenTabs`), Absturz-Sicherung (`saveRecovery`/`loadRecovery`/`clearRecovery`), Migration aus `localStorage`, Import-Sicherheit (`LIMITS`, `checkFileSize`, `stripXmlDoctype`, `sanitizeSVG`, `sanitizeImageDataUrl`, `safeParseJSON`), Dateiformat-Prüfung (`PROJECT_FORMAT`, `PROJECT_VERSION`, `validateProject`) |
| `10-model.js` | Projekt-Datenmodell, `KINDS` (inkl. `ref`-Verweis für Baugruppen), `docType`/`isAssembly`/`isSubAssemblyRef`/`newAssemblyDoc`/`setDocResolver`/`resolveDoc`, `newItem`, `find`/`walk`/`topOf`, Matrizen, `vars` (Maße), `kernelItem`, `sketchParams`/`loftParams`/`sweepParams`/`pathPatternParams`, `migrate` |
| `14-ttf.js` (`TTF`) | Kleiner TrueType-Leser im Browser (`parse`: `glyf`-Umrisse mit quadratischen Béziers und zusammengesetzten Glyphen, `cmap`, `hmtx`, `kern`, CFF/OTF-Abweisung) |
| `15-sketchcore.js` (`SK`) | Skizzen-Geometrie: `segsOf`, `regions`, `chains` (offene Pfade), `bounds`, Splines als exakte Bézier (`splineBez`/`cvSplineBez`, Durchgangs-Griffe `splineHandle`/`splineTangentAt`), Text-Umrisse (Inter OFL bei Bedarf über `loadFont`/`needsEntsFonts`/`ensureEntsFonts`/`ensureDocFonts` + eigene TTFs via `syncFonts`, `kern` + Laufweite), Ellipse, Fangpunkte, Maße |
| `16-solver.js` | Skizzen-Löser (Maße und Regeln gemeinsam, Freiheitsgrade, Konflikte, G2-Regel `curvature` mit `curveEndState`/`curvatureSamples`) |
| `17-sketchops.js` (`SKO`) | Schnittpunkte, Trimmen, Versatz (`offsetChain`), dünne Wand (`thinRegions`), Spiegeln, Muster (`mapEnt`, `curvePath`, `curvePatternJobs`, `transformEnt`, `fillPattern`), Schablonen `TEMPLATES`/`tplEnts`, Skizzen-Prüfer `inspect` |
| `20-kernel.js` | Brücke zum Worker-Pool (`Kernel.ensure`/`state`/`timings`/`setMultiWorker`/`maxWorkers`/`poolStats`, lädt WASM einmal bei Bedarf, verteilt unabhängige Körper auf bis zu 4 Worker, Zähler & Fingerabdrücke über `stats`/`resetStats`/`clearCache`/`lastStats`/`fingerprint`) |
| `25-app.js` | Zustand (`App.sel`/`face`/`faces`/`edges`), `App.change(label, fn, {merge, amend})` mit sparsamem Patch-Rückgängig (`App.Patch`, Speicherlimit 32 MB, `App.historyStats`, `App.setHistoryLimit`), Bereinigung/Prüfung von `mergedInto`, mehrere Projekt-Tabs (`openTab`/`switchTab`/`closeTab`/`restoreOpenTabs`, schützt zwischenzeitlich über `Viewer.camMoveSeq` bewegte Kamera vor spätem `fit()` nach Neubau), Neuberechnung, direktes Einfrieren ohne Verlauf (`App.setNoHistory`/`noHistory`), Ergebnisse & Schritt-Cache (`stepFingerprint`/`stepCacheStatus`/`evalStats`) |
| `30-viewer.js` | three.js-Ansicht, Picking (Flächen, Kanten), `setSelectedFaces`/`setSelectedEdges`, `edgePositions`, Raster (`updateViewAids` auch in `moveCamera`/`finishCamAnim`, `gridStep` ruft `syncCamAnim` auf), `renderNow` (synchrones Einzelbild), Kamera (`syncCamAnim`/`scheduleCamEmit`, `camera.updateMatrixWorld`, `camMoveSeq`), adaptive Auflösung mit zeitkompensierter Dämpfung und Timer-Fallback (`scheduleAdaptRestore`), Touch- und Trackpad-Steuerung (`touchesFor`, `bindGestures`, `setGestures`: zwei Finger drehen/schieben/zoomen, abschaltbar), `draftAnalysis` (Schräge-/Hinterschnitt-Analyse PF-09/PF-10), `innerRadiusAnalysis` (Kleinster Innenradius PF-11), Technische Illustration (`isIllust`/`applyOutline` AN-17), Vierfach-Ansicht (`setQuad`/`renderQuad`/`pickInPane` AN-18) |
| `35-handles.js` | Ziehgriffe (Größe, Lage, Rundungsgriff, Drehwinkel-Griff `revAngle`, am Tablet vergrößert; Schildchen `placeLabels()` weichen bei verkürztem Sehstrahl seitlich aus und reichen Alt-/Rechtsklick per `bindLabelPass` durch), Maus- und Touch-Bedienung (Antippen wählt, langes Tippen öffnet Kontextmenü wenn Gesten aktiv, Mehr-Finger-Passthrough) |
| `40-library.js` | Bibliotheksteile `LIB`/`LIBMAP` (Drohnen-Bausteine mit `drone: true` ausgeblendet, bleiben für alte Projekte in `LIBMAP`), lokale DIN-Tabellen `UNDERCUT_DIN76`, `CIRCLIP_DIN471`/`CIRCLIP_DIN472`, `SPLINE_DIN_ISO14`, `keyEntryForShaft`, Normteil `splineShaft` |
| `41-dronelib.js` | FPV-Daten, Kaufteile, Herstellerrahmen |
| `42-userlib.js` (`UserLib`) | Eigene Teile-Bibliothek (`tracery-bibliothek` in `localStorage`, Vorschaubild, lokale Maße) |
| `45-actions.js` | Aktionen wie Gruppieren, Ausrichten, Abstand, Teile festsetzen (`setGrounded`/`toggleGround`) |
| `45-clipboard.js` | Zwischenablage (`Clipboard`) zum Kopieren/Einfügen von Körpern samt Schritten, Werkstoff, Farbe und Maßen (oder als feste BREP-Form) zwischen Projekten und Browser-Tabs (BE-13) |
| `46-features.js` | Muster (inkl. „entlang Kurve“, an Skizzenpunkten `patternPoints`, aus CSV-Tabelle `patternTable`, Formschritt-Muster, wachsende Größe/Abstand `scaleStep`/`distStep` in `%`/`mm` und Kopien auslassen `togglePatternSkip`), Füllmuster auf Fläche (`fillPattern`), Spiegeln an Fläche, Teilen (Ebene, gewählte Fläche `FACE` oder Skizzen-Kurve `SKETCH`), Boolesch, Wandstärke (`shell`/`setShellDir`/`addShellFaceWall`/`setShellFaceWall`/`removeShellFaceWall`/`pickShellFaceWall`/`renderShell`), krümmungsglatte Rundung & Ecken-Übergänge (`setFilletShape`/`setFilletCorner`/`filletG2`/`renderFilletMore`), Achse im Bild wählen (`pickAxisThen`), Drehen bis Fläche (`pickRevolveFace`), Übergang als Ring/Schnitt & weicher Anschluss (`loftClosed`/`loftCut`/`setLoftClosed`/`setLoftContinuity`/`pickLoftFace`/`renderLoft`), Schraubdom (`boss`/`startBoss`), Lippe & Nut (`lipGroove`/`startLipGroove`), Verformen (`deform`/`renderDeform`), Wellen-Schritte (`undercut`, `circlipGroove`, `keyway`, `splineProfile`) sowie Rändel & Griffmuster (`knurl`, `gripPattern`) |
| `46-pointclouds.js` | Punktwolken (`PointClouds`, IO-12, IO-14): `doc.pointClouds` mit Anzeige in `Viewer.groups.pointClouds`, Verlauf `#pointcloud-tree`, Eigenschaften-Panel (Punktgröße, Farbe, Einheit, Hüllmaße) und Übernahme als Skizzenpunkte (`toSketchPoints`) |
| `46-reffix.js` | Kaputte Bezüge (`RefFix`): gelbe Warnung bei verlorener Kante/Fläche an Rundung, Fase, Wandstärke oder Skizze, gestrichelte Alt-Lage (`Viewer.setRefGhost`) und Assistent „Neu wählen“ |
| `47-mass.js` | Volumen, Gewicht, Schwerpunkt, Material, Teileigenschaften (`partProps`/`setPartProps`) & Stückliste mit Preisen (`bom`/`bomCSV`/`bomDialog`) |
| `48-joints.js` | Feste Verbindungen (`startFixed`/`addFixed`/`syncFixed`/`isFixedPart`, Fläche-an-Fläche mit Umdrehen/Drehung/Abstand und Punkt-an-Punkt), Winkel-Verbindung (`angle`, `startAngle`/`addAngle`/`measureAngle`, Zahl oder Formel zwischen Flächen/Kanten), Mittig-Verbindung (`center`, `startCenter`/`addCenter`/`centerMetrics`, zentriert zwischen zwei parallelen Flächen), Dreh-, Schiebe-, zylindrische (`cyl`), ebene (`planar`), Kugel- (`ball`, `startBall`/`addBall`/`ballPointOf`), Stift-im-Langloch- (`slot`, `startSlot`/`addSlot`/`slotCenterlineOf`) und lockere Verbindungen (`parallel`, `tangent`, `distance` mit Formeln via `startParallel`/`startTangent`/`startDistance`, `addParallel`/`addTangent`/`addDistance`, `syncAll` und iterativem Kombinations-Löser), Ketten, Zwangsführung & Kettenmitnahme beim Ziehen/Verschieben (`constrain`/`applyDrag`/`dragContext`/`captureChain`/`applyChainDelta`/`captureReverseDrag`/`showDragVis`), Andock-Auswahl beim Loslassen (`onDockDrop`/`applyDockJoint`/`dockOptions`), Verbindungspflege beim Teile-Tausch (`preparePartReplace`/`finalizePartReplace`), Anschlag übernehmen, Bewegung abspielen (mit Timer-Fallback und `results`-Nachführung), Verlauf „Verbindungen“ (`treeSection`/`renderPanel`), `remove` (aktualisiert Auswahl und Panels sofort), `add` für die KI |
| `49-*` | Bauteile im Kontext & Baugruppen-/Unterbaugruppen-Verweise (`49-components.js`, `Comp.insertPart`/`insertPartDialog`/`insertFromFile`/`insertFromBlob`/`replacePart`/`replacePartDialog`/`canReplace`/`openRef`/`ensureRefs`/`resolveDoc`), Baugruppen-Tabs (`49-assembly.js`, `Assembly`), Zeitleiste (`Timeline.refreshLabels`, `Timeline.setNoHistory`/`isNoHistory`, sofortiges Neuzeichnen bei `ctx`/`peek`, mit Speicher-Status je Schritt), Protokoll (`Log.startup` / `#startup-times`), Meldungs-Zentrale (`49-notices.js`, `Notices` mit Glocke `#status-bell`, Filter & „Hinspringen“), PWA-Installation & Offline-Cache (`49-pwa.js`, `PWA.init`/`status`/`promptInstall`/`guideDialog`, `app/manifest.webmanifest`, `app/sw.js` aus `app/src/sw.js`), Zahleneingabe beim Ziehen (`DragInput` mit Touch-/Stift-Schaltflächen `#drag-input-ok`/`#drag-input-cancel`) |
| `50-ui-core.js`/`51-ui-panels.js` | Oberfläche, Barrierefreiheit (`UI.initA11y`/`ensureA11yLabels`/`focusables`, Tastatursteuerung, Esc-Verwaltung, `ViewPrefs.highContrast`/`body.high-contrast`), Meldungen (`UI.toast()` hält die Ausblendzeit während `UI.busy()`/`App.busy` an und zählt die Restlaufzeit scheibenweise gegen Hauptthread-Hänger herunter), „Was ist das?“-Modus (`#btn-whatis`, `UI.setWhatIs`/`toggleWhatIs`/`whatIsActive`), Kreis-Menü an der Maus (`UI.openRadial`/`toggleRadial`/`finishRadialHold`/`radialDialog`/`radialItems`, Taste Q oder Rechtsklick halten, 8 einstellbare Plätze in `tracery-kreismenue`), Tablet-Erkennung (`UI.hasTouch`/`UI.isTablet`/`UI.syncTablet`/`UI.initTablet`, Klasse `body.tablet` unter 1100 px mit Touch, mindestens 44 px große Knöpfe, einklappbare Seitenleisten mit `#btn-left-close`/`#btn-right-close`), Arbeitsflächen-Anordnung (`Panels.getLayout`/`setPanel`/`swapSides`/`saveWorkspace`/`loadWorkspace`/`deleteWorkspace`/`workspaceMenu`/`workspaceDialog`, Ziehränder `#resizer-left`/`#resizer-right`, Speicher `tracery-arbeitsflaechen`), ViewCube (`Panels.refreshViewCube`), rechtes Panel „Eigenschaften“ (sofort bei Auswahl, `renderRight({ preserveFocus })` schützt fokussierte Eingabefelder bei asynchronen `results`-Updates), Null-Prüfung für `mergedInto` in `renderLeft`/`opSection`, Kontextleiste (aktualisiert auch auf `App.on('ghosts')`) |
| `51-toolbar.js` (`Toolbar`) | Anpassbare 3D-Werkzeugleiste (`tracery-werkzeugleiste`): Rechtsklick-Menü, Anpassen-Dialog per Ziehen, Favoriten ganz links, Zurücksetzen |
| `52-snap.js` | magnetisches Einrasten (Flächen, runde Flächen, Körper, Andock-Punkte beim Ziehen `dockPoints`/`beginDockDrag`/`updateDockDrag`/`endDockDrag`, sowie Polarraster-/Hilfslinien-Fang `polarSnap`/`guideSnap`/`hitGuide`) |
| `52-place.js` | Platzieren, Bohrungs-Assistent |
| `53-views.js` | Schnitt, Röntgen, Explosion (`animateTo` mit Timer-Fallback bei rAF-Stau), Fokus-Vorschau (`requestFocusDraw` mit Timer-Fallback bei rAF-Stau), Vierfach-Ansicht (`Views.quad` AN-18), Überhänge |
| `54-select.js` | Auswahlfilter, Ähnliche, Kantenkette, Malen-Auswahl (`Select.startPaint`/`stopPaint`/`togglePaint`/`setPaintTarget`, Streichen über Flächen und Kanten) |
| `55-sketch.js` | Skizzen-Modus: alle Werkzeuge, Panel, `refreshUI`, Fertig/Hochziehen (`done()` wartet auf ungeladene Text-Schriften), verbundene Kanten, Re-Entranz-Schutz in `render()`, synchronisiertes `dimBox._typed` in `askDim()`/`onKey()`, Stift-Präzision mit Strichzeichnen und Handballen-Schutz (`BE-21`) |
| `56-notes.js` | Notizstift & Kommentar-Pins am Modell (`Notes.startPin`/`addPin`/`setPinDone`/`focusPin`/`pinsDialog`/`treeSection`/`renderPanel`, gespeichert in `doc.notes` mit `kind: 'pin'`) |
| `57-measure.js` | Messen (inkl. direkter Skizzen-Koordinatenanzeige im `pointermove`, verknüpfter Messwert-Parameter `pickEdgeForField`/`syncMeasuredParams`/`unlinkMeasuredParam`, Schräge- und Hinterschnitt-Analyse `Measure.draft`/`draftActive`/`draftInfo`, Schattenriss-Fläche `Measure.silhouette`/`silhouetteArea`/`silhouetteInfo` PF-15 sowie lokaler PDF-Prüfbericht `reportData`/`buildReportPDF`/`exportReportPDF`/`reportDialog` PF-18) |
| `58-commands.js` | Eingabezeile, Befehlssuche (`score` mit Satzzeichen-Wortanfängen und Phrasen-Treffern im Befehlsnamen) |
| `59-versions.js` | Versionen & Körper-Vergleich in Farben (`Versions.compare`/`compareVersions`/`compareBodies`/`openCompare` PF-12) |
| `60-print.js` | Export (STEP mit XCAF-Farben/Namen/Baugruppen, IGES, BREP, STL, 3MF, OBJ/MTL, GLB, AMF, PLY, DXF, Komplett-Paket `exportBundle` mit Projekt, PDF, STEP & STL je Körper), Drehteller-Video (`turntable` über 2D-Puffer mit `captureStream(0)` und VP8-Vorrang), Drucker-Liste `PRINTERS`, Bauraum-Prüfung `fitCheck`/`applyRotationSuggestion`, Loch-Ausgleich `holeComp` für STL/3MF, Passungs-Vorgaben `PRINT_FITS`/`printFit`, Düsen-Wandcheck `nozzleWallCheck`, Ausrichten `orientForPrint`/`bestPrintOrientation`, 3D-Druck-Schätzung `printCostSettings`/`computePrintEstimate`/`estimatePrint`/`costDialog`, `Zip` (Packen/Entpacken mit Größen- & Pfadschutz) |
| `70-drawing.js` | technische Zeichnung (`Drawing`, `refreshUI`; `refreshSoonDoc` nutzt `refresh()` mit `Panels.renderRight({ preserveFocus: true })` gegen Fokusverlust, `render()` wartet während laufender Erstprojektion), mehrere Blätter mit Tabs (`#sheet-tabs`, `addSheet`/`renameSheet`/`removeSheet`), Formate A4–A0 hoch/quer, Ansichten-Einstellungen je Ansicht (`viewOpts`, `extraViews`, `addView`, `setViewOpt`, Maßstab, verdeckte & tangentiale Kanten, isometrische & freie 3D-Ansicht, schattiert via `Viewer.renderOrthoView`), Schnittansichten (`Schnitt A–A`, 45°-Schraffur nach Maßstab, Schnittlinie mit Pfeilen, `addSection`/`flipSection`/`removeSection`), Detailansichten (`details`, `addDetail`/`updateDetail`/`removeDetail`, `DETAIL_SCALES`, kreisförmiges Beschneiden mit wahren Maßen), automatische strichpunktierte Mittellinien/Mittelkreuze (`hiddenCenters`, `centers`/`allCenters`/`setCenters`/`hideCenter`/`showCenter`/`toggleCenter`/`showAllCenters`), Maß-Arten (`chain`, `base`, `ang`, `rad`, `dia`, `chamfer`, `setDimMode`, `dimMenu`, `flipAngleDim`), Toleranzen (`sym`/`dev`/`limits`) und ISO-286-Passungen (`iso286`, `setDimTol`/`getDimTol`), assoziative Maß-Nachführung bei Modelländerungen & „Verlorene Maße“ (`lostDims`, `startRebind`, `rebindDim`, `removeDim`, `removeLostDims`, rote `.lost`-Markierung), Maß-Stil je Blatt (`dimStyle`/`setDimStyle`: Pfeilart, Schriftgröße, Nachkommastellen), Notizen mit Hinweislinie (`notes`/`addNote`/`updateNote`/`removeNote`), Positionsnummern und Stückliste auf dem Blatt (`balloons`/`autoBalloons`/`addBalloon`/`updateBalloon`/`removeBalloon`, `bomTable`/`setBomTable`/`bomMenu`, synchron zu `Mass.bom()`) samt verschiebbaren Ansichten (`viewPos`/`moveView`/`resetViewPos`), eingebauter mehrseitiger PDF-Export (`buildPDFBytes`), SVG, DXF (`buildDXF`/`exportDXF` mit Layern je Linienart & Mehrblatt-ZIP) und PNG mit wählbarer Auflösung (`pngDialog`/`buildPNG`/`exportPNG`/`pngDimensions`) |
| `80-ai.js` | KI-Kollege (`AI.RULES`, `AI.ACTIONS`, `AI.SUGGESTIONS`, `AI.open` – allgemeines CAD ohne Drohnen-Bezug; `drohne`-Aktion technisch erhalten) |
| `84-drone.js` | Rahmen-Generator, Frame-Assistent, Bausätze |
| `85-start.js` | Startseite, Projekt-Tabs oben (`Start.renderTabs`/`openTabAddMenu`/`openNewTab`/`openStoredInTab`), Projekt-Vorlagen (`Templates.PROJECT_LIST`, eigene Vorlagen in `tracery-vorlagen`, `Start.newProjectDialog`/`saveAsTemplate`/`openTemplate`), Beispiel-Galerie (`Start.loadExamples`/`openExample`/`examples`, `#start-examples` aus `app/data/beispiele/`), Öffnen, Drag-and-Drop-Rahmen (`#drop-overlay`), Absturz-Wiederherstellung (`#recovery-bar`, `restoreRecovery`, `dismissRecovery`), Import (STEP mit `parseSTEP` für Namen/Farben/Baugruppen, IGES, BREP, STL, 3MF, OBJ, AMF, PLY, Punkte-Dateien CSV/XYZ, DXF, SVG mit `sanitizeSVG`/`lastSvgSanitize` & Größen-/Formatprüfung), Import-Prüfung & Heilen (`checkImport`, `healImport`, `#import-check-bar`) |
| `86-dronecheck.js` | Drohnen-Check |
| `87-geomcheck.js` | Geometrie-Prüfung (`GeomCheck`, Prüfen-Menü, kaputte Flächen, winzige Kanten, Selbstschnitte) |
| `87-clashcheck.js` | Durchdringungs-Prüfung der ganzen Baugruppe (`ClashCheck`, paarweise Überschneidungsliste mit Volumen, Anspringen & roter Schnittkörper-Hervorhebung) |
| `87-inspectcheck.js` | Kleinster Innenradius (`InnerRadius`, PF-11) & Symmetrie prüfen (`SymmetryCheck`, PF-16) im Prüfen-Menü |
| `88-aihelp.js` | „Erklär diesen Schritt“ (`Explain.local`/`dialog`/`describeElement` für den „Was ist das?“-Modus), Schwachstellen-Analyse `Weak` |
| `90-main.js` | Start, Fenster „Über Tracery“ / „Fremde Bausteine“ (`fremde-bausteine.json`); stellt `window.__M` für Tests bereit |

**Daten in `app/data/`** (alle von Gemini geliefert und von Claude geprüft):
- `werkzeug-hilfen.json`, `texte-de.json`, `texte-en.json`, `schritt-erklaerungen.json`, `fremde-bausteine.json` (mitgelieferte fremde Bausteine mit Lizenzen und Lizenztexten), `materialien.json` (26 Stück in 4 Kategorien mit Dichte, Aussehen und Quellen), `drucker.json` (10 3D-Drucker-Profile), `fehlermeldungen.json`, `schrauben.json` (M1.6–M24, Zylinder-, Sechskant- und Senkkopf normgerecht), `gewinde.json` (Regelgewinde M1.6–M24, Feingewinde, Zoll UNC/UNF, Rohrgewinde G1/8–G1 mit Quellen), `passstifte.json` (ISO 2338), `passfedern.json` (DIN 6885 Form A), `lager.json` (DIN 625-1 Kugellager 608/6000er/6200er & ISO 3547 Gleitlager), `iso286.json` (DIN EN ISO 286-2:2010 Passungstabelle bis 500 mm mit Quellen)
- `formel-beispiele.json`, `einfuehrung-skizze.json`, `fpv-masse.json` (Stack = Quadrat, Motor = Lochkreis)
- `bauteile.json` (Kaufteile mit Quelle, `geprueft`), `schub.json` (nur `geprueft: true` als Vorgabe), `faustregeln.json`, `rahmen.json` (13 Herstellerrahmen)
- `schrift-inter*.json`, erzeugt mit `tools/schrift.py`; `beispiele/` (8 lokale Beispielprojekte `.tracery.json`, SVG-Vorschaubilder und `index.json` für die Beispiel-Galerie)

**Lokal starten:** `cd app && python3 -m http.server 8000`. Ein Doppelklick auf `index.html` geht nicht, weil Worker und WASM einen Server brauchen.

## 4. Datenmodell (Projektdatei `.json`, `format: 'masswerk'`, ausführlich in `docs/DATEIFORMAT.md`)

- **`doc`:** `{ id, docType: 'part'|'assembly', name, params: [{id, name, expr}], tables: [{id, name, rows: [{id, key, val}]}], items: [...], blocks: [{id, name, ents, dims, cons}], fonts: [{id, name, file, data}], notes, settings{printer, grid, snap, magnet, unit}, drawing, rollback (Marker der Zeitleiste), noHistory (Verlauf abgeschaltet), variants, variant, drone{…}, joints: [...] }`
- **Item:** `{ id, kind, name, role: 'solid'|'hole', color, t: {x,y,z,rx,ry,rz}, p: {...}, finishes: [{id,type:'fillet'|'chamfer'|'fullFillet'|'faceFillet'|'cornerChamfer'|'draft'|'partingDraft'|'shell', r, edges|faces, shape ('g2' bei Rundung), corner ('smooth' bei Rundungs-Ecke), sym, r2, mode, axis, pos, datumId, flip, dir ('in'|'out'|'mid', Schale), faceWalls ([{id,face,r,label}], Schale), vr+r2 (Rundung von … bis), cm 'two'+r2 | 'angle'+a, side (Fase), v+d1+d2+d3 (Ecken-Fase)}], suppressed, hidden, mat, massG, texture: {kind:'wood'|'brushed'|'carbon', scale, rot}, decals: [{id, name, src, aspect, face:{n,c,t}, u, v, w, scale, rot, opacity, flipX}], props: {partNo, desc, supplier, price}, ai }`
  - Werte in `t` und `p` dürfen **Formeln** mit Maßnamen sein.
- **`kind`:**
  - Grundkörper: `box`, `cylinder`, `sphere`, `cone`, `tube`, `torus`, `wedge`, `prism`, `pyramid`, `hemisphere`
  - Skizzenbasiert: `extrude` (p.sketch, dist, dir, sel, thin, wall, wallSide), `revolve` (p.sketch, angle, dir, angle2, toFace, toFaceFlip, axis, axisId, axis3d), `loft` (p.sketches, ruled, tip, closed, optional `it.op` zum Schneiden/Vereinigen), `sweep` (p.sketch-Pfad oder `p.sketch3dId`, shape circle/rect/sketch, d, w, h, wall, prof, twist in °, optional `it.op` zum Schneiden/Vereinigen), `sketch3d` (3D-Skizze im Raum mit `p.sketch3d = {ents, dims}`: 3D-Linien, 3-Punkt-3D-Bögen, `bindA`/`bindM`/`bindB`, Längenmaße; `Sketch.start3d`/`edit3d`, `Features.sweepFromSketch3d`), `helix` (Schraubenlinie / Kegel-Feder / flache Spirale: form `'cyl'|'cone'|'spiral'`, by `'pitchTurns'|'heightTurns'|'heightPitch'`, d, r1, r2, pitch, turns, height, dir `'right'|'left'`, startAngle, shape `'circle'|'rect'|'sketch'`, wireD, profW, profH, wall, prof)
  - Sonstige: `import` (STEP/IGES/BREP/STL), `part` (Bibliothek, `p.lib`), `group` (children; mit `p.op` = Rechen-Gruppe), `transform` (Verschieben/Drehen/Kopieren als Schritt auf `p.target` mit `dx/dy/dz`, `rx/ry/rz`, `pivot`, `copy`), `scale` (Körper skalieren auf `p.target`, gleichmäßig `s` oder je Achse `sx/sy/sz`, um Schwerpunkt oder Ursprung `pivot`), `deform` (Körper verformen auf `p.target`: `mode` `'bend'|'twist'|'taper'`, `axis`, `bendAxis`, `angle`, `factor`, `anchor`, `flip`), `deleteBody` (Körper ab diesem Schritt abschaltbar aus dem Modell entfernen mit `p.targets`), `thicken` (Fläche aufdicken auf `p.target` mit `face`, Dicke `t`, Richtung `out`/`in`/`mid`, Modus `join`/`new`/`cut`), `rib` (Rippe aus offener Skizzenlinie auf `p.target` mit `thickness`, `side`, `dir`, `flip`, `depth`, `draft`), `vent` (Lüftungsgitter in ebener Fläche `p.face` von `p.target` mit `count`, `slotW`, `frame`, `angle`, `depth`, `roundEnds`), `fins` (Kühlrippen auf ebener Fläche `p.face` von `p.target` mit `count`, `finW`, `height`, `margin`, `angle`, `draft`), `fillPattern` (Füllmuster auf ebener Fläche `p.face` von `p.target` mit `kind` `'grid'|'staggered'|'hex'`, `size`, `pitch`, `margin`, `angle`, `depth`), `web` (Steg-Netz aus offener/verzweigter Skizze auf `p.target` mit `thickness`, `depth`, `draft`, `extend`, `flip`), `wrap` (ebene Skizze verzerrungsfrei um Zylinderfläche `p.target`/`p.face` wickeln mit `mode` `'emboss'|'deboss'|'line'`, `depth`, `angle`, `shiftY`, `rot`, `flip`; `sweep` mit `p.wrapId` folgt der gewickelten Linie), `emboss` (Prägen einer Skizze auf eine ebene/gewölbte Fläche `face` von `p.target` mit `height`, `mode` `'emboss'|'deboss'`, `flip`), `splitFace` (Skizzen-Kurve/Umriss auf Fläche `face` von `p.target` projizieren und Fläche daran teilen, `side` `'front'|'back'|'both'`), `dome` (glatte Kuppel mit `height`, `shape` `'elliptical'|'spherical'`, `flip` auf ebener Fläche `face` von `p.target`), `boss` (Schraubdom auf ebener Fläche `p.face` von `p.target` mit `outerD`, `holeD`, `height`, `holeDepth`, `ribs` 0–6, `ribT`/`ribL`/`ribH`/`ribAngle`, `u`/`v`), `lipGroove` (umlaufende Lippe an `p.lipTarget` und Nut in `p.grooveTarget` an `face`/`edge` mit `side` `'inner'|'outer'`, `height`, `width`, `clearance`), `undercut` (Gewinde-Freistich DIN 76-1 auf Zylinder `p.target`/`p.face`), `circlipGroove` (Sicherungsring-Einstich DIN 471/472 auf Zylinder `p.target`/`p.face`), `keyway` (Passfeder-Nut DIN 6885 direkt auf Zylinder `p.target`/`p.face`), `splineProfile` (Keilwellen-Profil DIN ISO 14 auf Zylinder `p.target`/`p.face`), `knurl` (Rändel gerade/gekreuzt/schräg auf Zylinder `p.target`/`p.face`), `gripPattern` (Griffmuster mit Rillen oder Noppen auf ebener Fläche oder Zylinder `p.target`/`p.face`), `mirrorStep` (einzelne Formschritte `features` an Grundebene, Bezugsebene `DATUM` oder Körperfläche `FACE` im selben Körper spiegeln)
- **Rechen-Gruppen (`p.op`):**
  - `pattern` mit `pt` (optional `skip` für ausgelassene Kopien, `scaleStep`/`scaleUnit` & `distStep`/`distUnit` für wachsende Größe/Abstand in `%`/`mm` und `G.op` für gemusterte Formschritte / Rippen; `Model.patternInstances`):
    - `rect` (nx, ny, dx, dy)
    - `circ` (n, ang, cx, cy, cz, `axis` 'z'|'x'|'y'|'pick' + `ao`/`ad`)
    - `path` (p.sketch-Kurve, n, d, align)
    - `points` (`p.sketch` mit Punkt-Elementen oder `p.sourceId` auf vorhandene Skizze, `keepOrigin`)
    - `table` (`p.csv` mit X/Y/Z/Drehung, `p.mode` `'abs'|'rel'`, `Model.parsePatternCSV`)
    - `mirror` (plane XY/XZ/YZ + off, oder `FACE` mit `mo`/`mn`/`bind`)
  - `split` (plane XY/XZ/YZ + off, oder `FACE` mit `faceRef`, oder `SKETCH` mit `sketch`, keep, gap)
  - `intersect`
  - Löcher in einer Gruppe werden aus den Körpern geschnitten.
- **Skizze `p.sketch`:** `{ plane:{o,x,n}, ents, dims, cons, blockInsts, bg }`
  - **Skizzen-Blöcke (SK-31):** `doc.blocks` speichert Block-Definitionen (`ents/dims/cons` um Einsetzpunkt `0|0`); `sketch.blockInsts` (`{id, blockId, x, y, rot}`) wird durch `Model.syncBlocks`/`Model.syncSketchBlocks` als `e.blk`-Elemente in `sketch.ents` synchronisiert (vom Solver übersprungen), samt `Sketch.createBlock`/`insertBlock`/`updateBlockInst`/`editBlock`/`finishBlockEdit`/`explodeBlockInst`
  - **Elemente:** line(a,b), arc(a,m,b), circle(c,r), ellipse(c,rx,ry,rot), ellarc(c,rx,ry,rot,a0,a1,ccw), conic(a,m,b,rho), bridge(a,b,mode,s1,s2,refA,refB,pts), rect(a,b), poly(c,r,n,rot), slot(a,b,r), spline(pts,closed, mode:'cv', handles), point(a), text(a,s,h,font,align,rot,mir, bend = Bogen-Radius, on = Kurve + onP = Punkte darauf, os, flip)
  - **Elementfelder:** `con` = Hilfslinie; `link` = verbundene Körperkante {id,t,m,l,d}
  - **Regeln:** horizontal, vertical, parallel, perpendicular, collinear (zwei Linien auf einer Geraden), tangent, equal, symmetric, coincident, fix (at), midpoint, concentric, offset (v, og = zusammen entstanden), xform (Muster; `pg` Kennung, `pm` Einstellungen)
  - **Maße:** w/h/len/d/r/arcLen/x/y/ang/n/hAngN/hLenN, dist, distPL, angLL, ang3, ord – auch als Formel; `ref: true` = Maß zum Ablesen (der Löser überspringt es, das Schildchen zeigt den gemessenen Wert in Klammern; `Sketch.setRefDim(spec)`)
- **Gelenk:** `{id, a (fest), b (beweglich), ao, ad (Achse/Normale, Welt), au (U-Richtung bei planar / Normale bei slot), bo (zweiter Endpunkt bei distance), home (Matrix bei 0), ang, min, max, pos/minPos/maxPos (cyl/slot), u/v/minU/maxU/minV/maxV (planar), rx/ry/minRx/maxRx/minRy/maxRy (ball), angle/axisA/alignSign (angle), bMode/refA1/refA2/refB1/refB2 (center), dist (distance, Zahl oder Formel), flip, kind: 'rot'|'slide'|'cyl'|'planar'|'ball'|'slot'|'fixed'|'angle'|'center'|'parallel'|'tangent'|'distance'}`
  - Nur für Teile ganz oben im Verlauf. Gelenke sind kein Schritt der Zeitleiste.
  - Ketten: Ein Teil darf an mehreren Gelenken hängen, wird aber nur von einem bewegt; Kreise werden abgelehnt.
- **Übergang mit Mittellinie:** `loft.p.path` = Skizze mit offenem Zug (Kern: Pipe-Shell mit mehreren Schnitten).
- **Übergang mit Führungskurven:** `loft.p.rail`, `loft.p.rail2` = Skizzen in Ebenen durch die Achse (die zweite quer zur ersten); `Model.railSections` mischt und streckt Zwischenschnitte, der Kern baut sie als `sections3`; `loftPreview` in `55-sketch.js` wird von `onMove` auch im Auswahl-Werkzeug (`select`) angestoßen und verzögert nur bei geänderter Kurve neu, damit Kamera-/Maus-`render()`-Aufrufe die Vorschau nicht aushungern.
- **Rohr im Raum:** `sweep.p.path3d = {pts: [[x,y,z],…], smooth, rules: [{ax:'x'|'y'|'z'|'perp'|'par', len}|null, …], bind: [{id, lp}|null, …] (Punkt hängt an Körper id, lp = Lage im Körper)}` statt `p.sketch`; `Model.path3dPoints` rechnet die Lage mit Regeln.
- **Drohnen:** vorne ist **−Y**. Die Maße `Achsabstand`, `Armwinkel`, `Armwinkel_hinten`, `Armbreite`, `Armdicke`, `Plattenbreite`/`-länge`/`-dicke`, `Bolzenhöhe`, Stack, Motorlochkreis, Kamerabreite, `Propeller` und `Motorneigung` steuern den Rahmen.

## 5. Was Tracery heute kann (vollständig, nach Bereichen)

**Grundlagen und Ansicht**
- Ursprungsebenen und Achsen; Raster fest oder automatisch
- Orthografisch/Perspektive (O), Ansichten 1/3/7/0, Ansichtswürfel
- Tiefes Zoomen ohne Flimmern mit automatischem Nachschärfen; Qualität grob bis sehr fein; Design hell/dunkel
- Aussehen (`ViewPrefs` look/mood/shadows/floorReflect/manualLights/openLookPanel/addLight/loadEnvImage, `Viewer.setLook`/`setEnvImage`/`floor`/`customLights`/`lookOf`): Studio-Look mit Werkstoff-Oberflächen (`LOOKS` in `30-viewer.js`, `App` gibt `look` je Teil mit; `it.colorSet` = eigene Farbe schlägt Werkstoff-Farbe), Spiegel-Umgebung aus einem kleinen Leuchtflächen-Raum (PMREM) oder eigenem Umgebungsbild (PNG/JPG/WebP/HDR), spiegelnder Studio-Boden (`reflectFloor`), bis zu 3 eigene Richtungslichter mit Richtung/Farbe/Stärke, weiche Schatten (PCF, Hauptlicht bzw. Licht 1), Prüfansichten Ton/Chrom (MatCap), Einfach (matt). Bild speichern: `Viewer.renderImage(w, h, {transparent})`, `Print.imageDialog`/`saveImage`
- Formschritte mit Modus: `it.op = {type: 'join' | 'cut' | 'common', target}` an Teilen ganz oben; der Kern (`resolveOps` in `core.js`) verrechnet sie in Reihenfolge mit dem Zielkörper (Ketten → erster Körper), das Teil liefert dann einen leeren Knoten mit `merged` (`App.mergedInto(id)`). UI: Abschnitt „Körper“ (`#op-type`, `#op-target`), `Actions.setOp`. Hochziehen `dir: 'two'` mit `dist2`, `p.thru` = durch alles (`Model.sceneSpan`, App rechnet nach), Hochziehen bis Fläche (`p.extent` `'toNext'|'toFace'`, `p.toFace`, `App.resolvedDist`, `Features.pickExtrudeFace`)
- Skizze umhängen: `Actions.replaneSketch(id, 'o:XY' | 'd:<Bezugsebene>')` setzt `p.sketch.plane` neu und die Lage `t` zurück, `link` an Elementen fällt weg; Feld `#p-replane`
- Kanten nach Art: `Viewer.edgeKinds(id)` → je Kante 'convex' | 'concave' | 'smooth' | null (Nachbarflächen am Kantenmittelpunkt), `Select.edgesByRule(id, rule)`; Leisten-Knöpfe „Kanten wählen“ / „Nach Art“, Menü `er-convex`/`er-concave`/`er-all`
- Kanten einer Fläche: `Viewer.faceEdges(id, faceIdx)` (Kanten, deren Anfang, Mitte und Ende auf den Dreiecken der Fläche liegen und die noch an eine zweite Fläche grenzen); Leisten-Knopf „Ihre Kanten“ → `Panels.faceEdgeList`, Menü `fe-select`/`fe-fillet`/`fe-chamfer`
- Notiz am Schritt: `it.note` (Text); Teil-Panel `details#note-sec` mit `#item-note`; Zeitleiste: Klasse `note` und „Notiz: …“ im Tooltip
- Maße als CSV: `Panels.paramsCSV()` / `Panels.importParamsCSV(text)` (Trenner ; , oder Tab, Anführungszeichen, BOM); Knöpfe `#par-csv-out`/`#par-csv-in`
- Gespeicherte Auswahl: `doc.selSets = [{id, name, ids}]`; `Interact.saveSelection(name)`, `Interact.useSelection(id)`; Rechtsklick `cm-selsave`, `cm-selset-N`
- Rechenzeit: Kern `evaluate` gibt `times` {id: ms} zurück (nur echtes Neurechnen: Bauen, Ops, Löcher, Netz); `App.timeOf(id)`, `App.times`; Protokoll-Bereich `details#slow-steps`
- Suchen im Verlauf: `treeFilter`/`treeKind` in `Panels` (`#tree-filter`, `#tree-kind`, `#tree-count`), Treffer samt ihrer Gruppen bleiben sichtbar
- Trägheit: Kern `measure` liefert je Teil `inertia` = [Ix, Iy, Iz] um den Schwerpunkt bei Dichte 1 (über `GProp_GProps.MomentOfInertia(gp_Ax1)`, `gp_Mat` ist in diesem OpenCascade nicht gebunden); `Mass` macht daraus `p.I` in g·mm² (`#p-inertia` zeigt g·cm²). Standfestigkeit: `Mass.stability(id, com)` (Hülle der untersten Punkte, Abstand zur Kippkante, Kippwinkel), Anzeige `#p-stand`
- Wandstärke: `Viewer.wallAt(id, point, normal)` (Strahl nach innen gegen die Dreiecke des Teils, ohne Rückseiten-Ausschluss), `Viewer.thinWalls(limit)` (Raster `triGrid`, je Dreieck ein Strahl von der Mitte, Ergebnis `{pos, area, minT}`); Ansicht `Views.thin()`, Leiste `#thin-limit`/`#thin-area`, `Views.thinInfo`
- 2D-Dateien: `Print.entsToDXF(ents)` / `Print.entsToSVG(ents)` (Skizzen-Elemente ohne Hilfslinien; Linie, Kreis, Bogen echt, alles andere als Linienzug; SVG in mm, y nach oben), `Print.save2D`, `Print.faceTo2D(face, kind)` über Kern `faceLoops` und `Actions.faceFrame`; Knöpfe `#sk-dxf`/`#sk-svg`, Rechtsklick `cm-facedxf`/`cm-facesvg`
- Export-Einstellungen: `opts.q` (Kern `exportMeshes(scene, fine, q)`, Toleranz × q), `opts.stlText` → `Print.buildSTLText`; Felder `#ex-q`, `#ex-stlfmt`; `Print.lastTris`
- Export: `Print.exportSelection()` (gewählte Teile oberster Ebene, verrechnete zählen zum Ziel) → Option `onlySel` filtert die Netze nach `id` und gibt `only` an den Kern (`exportSTEP(scene, only)`); Option `each` legt „Einzeln/<Name>.stl/.3mf/.obj/.mtl/.glb“ an; `Print.buildOBJ`, `Print.buildGLB`; `Print.lastExport` = Dateinamen des letzten ZIP
- Lage unter der Maus & Statusleiste: `#coords`, `#status-sel` (Auswahl-Info: Kanten/Summe, Fläche, Ø, Körper, Skizzen-Auswahl mit Klick-Kopieren), `#status-unit` (Projekt-Einheit, Klick öffnet Einstellungen), `#status-calc` (Rechenzustand `loading`/`busy`/`error`/`ready`), `#status-cancel` („Abbrechen“ nach 2 s über `App.cancelRebuild`/`Kernel.cancel`) und `#status-bell` (Meldungs-Zentrale `Notices`) in `.ampel-wrap` (`Measure.showCoords`/`updateStatus`/`setCalcBusy`/`statusInfo`, `Measure.coords`)
- Maus-Steuerung: `ViewPrefs` `mouse` ('tracery' | 'onshape' | 'solidworks' | 'fusion' | 'blender') → `Viewer.setMouseStyle`; Skizze, Setzen und Notizen rufen `Viewer.useButtons('sketch' | 'place' | 'model')` statt `mouseButtons` selbst zu setzen; `Viewer.leftOrbits` = false → links im Leeren zieht einen Rahmen
- Drehteller-Video: `Print.turntable({seconds, fps, save})` (MediaRecorder auf `canvas.captureStream`, Kamera dreht um die senkrechte Achse durch den Blickpunkt mit Timer-Fallback, synchronem `Viewer.renderNow()` und `track.requestFrame()`, danach zurück), Dialog `Print.turntableDialog` (`#tt-sec`), `Print.lastVideo`
- Vorführen: `Views.present(on)` (Taste P, Klasse `body.presenting`, Vollbild, Drehteller über `requestAnimationFrame`, Leiste `#present-bar`), `Views.presenting`
- Vorige Ansicht: `Viewer.viewBack()` (Umschalt Z), Verlauf `camHist` bis 40 – `moveCamera` (setzt über `stopDamping()` Restdämpfung der OrbitControls zurück, schließt `camAnim` per Timer-Fallback `finishCamAnim()` auch bei stockendem `rAF` ab und entdoppelt das `camera`-Event pro Frame) und der Beginn jeder Maus-Bewegung (`controls` 'start', schnelle Folgen zusammengefasst, bricht `camAnim` per `cancelCamAnim()` ab) legen den Blick davor ab; `Viewer.viewHistory`
- Teil dahinter: `Viewer.pickAll(cx, cy)` (alle Treffer, vorne zuerst); Alt + Klick → `Interact.selectBehind`; Rechtsklick-Einträge `cm-behind-N`
- Bedienung: Rechtsklick-Menü im Bild (`Interact.contextMenu`, Rechtsklick ohne Ziehen), Kreis-Menü an der Maus (`UI.openRadial`/`radialDialog`/`radialItems`, Taste `Q` oder Rechtsklick gedrückt halten, 8 einstellbare Befehle in `tracery-kreismenue`), Malen-Auswahl (`Select.startPaint`/`stopPaint`/`togglePaint`, Taste `V` oder Knopf rechts im Bild, Streichen mit gedrückter Maus über mehrere Flächen `App.faces` oder Kanten), Rahmen-Auswahl mit Umschalt + Ziehen im Leeren (`Interact.bandSelect`), `Commands.exec` merkt Befehle (`Commands.last`, `recent`, Leertaste = `Commands.repeat`), `Actions.hideSelected`/`showAll`/`invertSelection`
- Anzeige: `ViewPrefs.display` ('edges' | 'shaded' | 'wire' | 'hidden' | 'illustration'), `Views.quad` (Vierfach-Ansicht Vorn/Oben/Rechts/Schräg), `it.opacity` (nur Anzeige), `Viewer.lookAtFace(id, faceIdx)`, `doc.views = [{id, name, p, t, up, ortho}]` mit `Views.saveView`/`goView`
- Bezugsebenen, -achsen, -punkte & Koordinatensysteme (`46-datums.js`, `Datums`): `doc.datums = [{id, name, base, plane, size, color, hidden}]`, `base.type` 'origin' (plane, dist, tilt) | 'face' (id, n, c, dist; `relink` nach jedem Rechnen, `lost`) | 'edgeAngle' (edgeId, faceId, angle) | 'tangent' (id, u0, angle, flip) | 'normalToCurve' (edgeId, edge, posMode, percent, flip) | 'edgePoint' (edgeId, edge, p, pBind, flip) | 'twoEdges' (e1, e2, flip) | 'fixed', mit Ecken-Ziehgriffen (`planeSize`/`hitHandle`), freier Farbe und `addSeries`/`seriesDialog` (Ebenen-Schar); `doc.axes = [{id, name, base, axis:{o,d}, hidden}]` ('twoPoints' | 'roundFace' | 'roundEdge' | 'faceNormal' | 'fixed'); `doc.points = [{id, name, base, point:[x,y,z], hidden}]` ('edgeMid' | 'faceCenter' | 'edgePlaneIntersect' | 'curvePercent' | 'centerOfMass' via `addPointCenterOfMass` | 'fixed'); `doc.csys = [{id, name, base, csys:{o,x,y,z}, hidden}]` ('pointEdges' | 'fixed', `csysExportMatrix` als Nullpunkt im Export für STEP/STL/3MF/OBJ/GLB via `#ex-csys`); Bild in `Viewer.groups.datums`; `Sketch.startOnPlaneObj(plane)`, `Sketch.startPlanePick(kind, onPlane)`, nutzbar für Kreismuster (`axisId`) und Drehen (`axis3d`)
- Farbe je Fläche: `it.faceColors = [{n, c, col}]` (Flächen-Lage im Teil), im Bild als Vertex-Farben (`applyFaceColors`, `Viewer.faceIndexOf`). Aufkleber & Logos auf ebenen Flächen (`it.decals`, `Actions.addDecal`/`updateDecal`/`removeDecal`/`pickDecalFile`, `applyDecals` in `30-viewer.js`) und nahtlose Körper-Texturen (`it.texture` für `wood`/`brushed`/`carbon` aus `app/assets/textures/`, `Viewer.TEXTURES`, `Actions.setTexture`, `ensureMeshUVs`). Mehrere Körper in einem Teil (`it.bodies = [{idx, c, name, color, hidden}]`, `Model.matchBodies`, `Actions.setBody`, `Viewer.highlightBody`) erscheinen im Verlauf als „Körper (n)“, lassen sich benennen, färben, ausblenden und einzeln mit Namen exportieren. Text in Kurven: `Sketch.textToCurves(id)`
- Normteile: Bauteile `stdScrew` (M1.6–M24, head 'zyl'|'hex'|'senk', length), `stdNut` (M1.6–M24), `stdWasher` (M1.6–M24), `stdPin` (ISO 2338: size, length, tol 'm6'|'h8'), `stdKey` (DIN 6885 A: size, length), `stdKeyway` (size, kind 'shaft'|'hub', length), `stdBearing` (DIN 625-1: size 608/6000er/6200er, seal '2rs'|'open'), `stdSleeve` (ISO 3547: size, length, flange 'cyl'|'flange') mit Tabellen in `app/data/`; LIB-Einträge mit `mat` setzen den Werkstoff beim Anlegen (`Model.newItem`). KI-Aktion `verrechnen` (ids, modus, ziel)
- Längen: Leisten-Schild `#sel-val` (Kantenlänge aus `edges[i].l`, Summe bei mehreren, Ø bei Kreiskante und runder Fläche `faces[i].r`); `Measure.copyText`/`copyValue` kopieren den Wert; Mess-Schilder `.dimlabel.mlabel` sind anklickbar; Messen kennt `kind: 'round'` (CYLINDRE/SPHERE)
- Messen: Kern `minDistance(scene, ids)` (Worker `distance`, BRepExtrema_DistShapeShape) → `Measure.minDistance`; Teil-Panel zeigt Volumen, Oberfläche, Hüllmaße
- Dauerhafte Messungen (PF-05): `doc.measures` speichert Bezüge; `Measure.keep`/`relink`/`treeSection`/`renderPanel`, `#measure-keep` in `#measure-bar`, Liste `#measure-tree` im Verlauf, Schilder `.dimlabel.mpin`, `Viewer.groups.measures`, zeigt „verloren“ bei fehlenden Bezügen
- Verknüpfte Kopien: `it.link` = Kennung des Originals; `Model.syncLinks(doc)` läuft in jedem `App.change` und übernimmt Art, Maße, Kanten, Rolle (`linkLost`, wenn das Original fehlt); `Actions.duplicateLinked`, `Actions.unlink`
- Bezüge: `Model.dependencies(doc)` → Liste `{from, to, what, datum?}` auf oberster Ebene (Formschritt-Ziel, `link`, übernommene Skizzenkanten, Rohr-`bind`, Bezugsebenen an Flächen); Bereich `details#deps` im Teile-Panel; `Actions.remove` meldet abhängige Teile; `RefFix` (KP-12) erkennt verlorene Kanten/Flächen an Rundungen, Fasen, Wandstärken, Skizzen (`planeRef`, verbundene Kanten) und `toFace`, markiert sie gelb in Verlauf/Zeitleiste und lässt im Assistenten „Neu wählen“ bei gestrichelter Alt-Lage einen neuen Bezug anklicken
- Zeitleiste:
  - Schritte, Marker zurückrollen, Einfügen am Marker
  - Unterdrücken; Fehler rot mit Klartext und Lösungstipp
  - Ein Schritt hinter dem Marker zeigt nur „Marker dahinter“
  - Überfahren eines Schritts zeigt kurz den Stand nach diesem Schritt (`App.peek`)
  - Verlauf links: Umsortieren per Ziehen mit Abhängigkeitsprüfung (`Model.validateMove`/`validateTopOrder`, rote Markierung `.drop-bad` bei verletzter Reihenfolge), organisatorische Ordner (`doc.folders`, `Model.folderOf`/`cleanFolders`, `Actions.reorder`/`createFolder`/`toggleFolder`/`renameFolder`/`ungroupFolder`/`removeFromFolder`) und direktes Duplizieren je Schritt (`Actions.duplicate`)
- Protokoll; sparsames Rückgängig/Wiederholen mit Patches (Speicherlimit 32 MB)
- Maße-Tabelle mit Formeln, Varianten (`v.values`, `v.material` und `v.suppressed` mit Schritt-Schaltern `#var-steps`, `Variants.setStepSuppressed` sowie Profi-Varianten-Tabelle `Variants.tableDialog`/`toCSV`/`importCSV` samt Zeilenklick-Umschaltung) und Versionen (Vergleich mit Gewicht)
- Bauteile im Kontext bearbeiten; Isolieren
- Zahleneingabe beim Ziehen; Tastenkürzel-Übersicht (?)
- Einfache Oberfläche für Einsteiger („Einfach/Profi“): Zwei-Karten-Wahl beim ersten Start (`ViewPrefs.firstStart`, `levelCards`) und in den Einstellungen, `ViewPrefs.level` (`'simple'|'pro'`), Schild `#btn-level`; Einführung „Deine erste Skizze“ (`Tour`, ereignisgesteuert über `history`/`doc`/`mode`/`sketch`/`pop`)
- Genauigkeit und Nachkommastellen (BE-11): `ViewPrefs.decimals` (0–4) und `ViewPrefs.angleDecimals` (0–4) steuern `FMT.dec`/`FMT.angle` einheitlich für Schilder, Maße, Messungen und Panels ohne Änderung der Rechengenauigkeit
- Projekt in einen Ordner speichern (BE-14): `Start.saveToFolder`/`saveToFolderNow`/`disconnectFolder`/`folderSupported`/`folderInfo` (File System Access API, gebündelt alle 10 s, Anzeige `#btn-folder-status`)
- Wiederherstellen nach Absturz (BE-15): `Store.saveRecovery`/`loadRecovery`/`clearRecovery` (IndexedDB `meta.recovery` + kompakte Schnellkopie in `localStorage`), `App.dirty`/`markClean`, Banner `#recovery-bar` mit Projektname, Zeit, „Wiederherstellen“ und „Verwerfen“
- Eigene Tastenkürzel (nur „Profi“): `Commands.shortcuts`/`setShortcut`/`resetShortcuts`/`renderShortcutsEditor`, gespeichert in `localStorage` (`tracery-kuerzel`), Duplikat-Prüfung, Einstellungs-Tab `#set-tab-keys`
- Werkzeugleiste anpassen (BE-04): `Toolbar` in `51-toolbar.js`, Rechtsklick → „Anpassen …“, Werkzeuge per Ziehen hinzufügen/entfernen/sortieren, Favoriten mit Stern ganz links, gespeichert in `localStorage` (`tracery-werkzeugleiste`), „Zurücksetzen“
- Einstellungen sichern & Oberflächen-Größe (BE-30, BE-31): `ViewPrefs` in `48-viewprefs.js` (`exportData`/`importData`/`saveToFile`/`loadFromFile`/`openFilePicker`/`resetAll`, `uiScale`/`setUiScale` 80–150 % über `--ui-scale`), `Commands.exportShortcuts`/`importShortcuts`, `Toolbar.setState` sowie Erkennung von `format: 'tracery-settings'` in `Start.openBlob`
- Notizstift; Messen (Abstand, Winkel, Fläche); Material je Teil, Gewicht, Schwerpunkt
- Kaufteile mit festem Gewicht
- Auswahlfilter, „Ähnliche“, Kantenkette
- Magnetisches Einrasten wie bei Canva: auf Flächen (Mitte, Mittellinien, Lochmitten, Kantenmitten, gleiche Randabstände), **auf runden Flächen** (Rohr, Kugel, Rumpf: „ganz oben/unten/vorne/hinten/links/rechts“ und Mitte, das Teil steht senkrecht auf der Rundung) und zwischen Körpern (bündig, mittig, gleiche Abstände). Strg hält es an, abschaltbar. Beim Ziehen aus der Leiste zeigt die Vorschau die **echte Form**.
- Beim Verschieben zeigt das Schildchen den Abstand zum Nachbarn; „Abstand“ zwischen zwei Teilen lässt sich genau setzen.
- Ansichten:
  - Schnitt an bis zu drei Ebenen (X, Y, Z einzeln an/aus) oder an einer gewählten Fläche, mit farbig gefüllter, schraffierter Schnittkappe (`Views.section`, `Viewer.clips`)
  - Röntgen
  - Explosion (auch innerhalb von Gruppen)
  - Fokus-Vorschau
  - **Überhänge (3D-Druck)**: rot ab Grenzwinkel 35–60°, Druckbett = Unterseite, Fläche in mm²
  - **Fahrtwind**: Blick aus der Windrichtung mit Neigung 0–60°, Stirnfläche in cm² aus dem Schattenriss; Form mit cw-Wert und Tempo → **Luftwiderstand** in N und Leistung; mit dem Schub aus dem Drohnen-Check eine geschätzte **Höchstgeschwindigkeit** (geneigte Motoren eingerechnet)

**Skizze (Werkzeugtasten in Klammern)**
- **Zeichnen:**
  - Auswahl (V), Linie (L), Rechteck (R: Ecke/Mitte/gedreht über 3 Punkte), Kreis (C: Mitte/2P/3P), Ellipse (E), Teil-Ellipse (`ellarc`)
  - Bogen (A: 3 Punkte oder tangential), Langloch (G: auch gebogen), Vieleck (P: Umkreis oder Schlüsselweite), Punkt (O)
  - Schablone (J), Formen-Sammlung (`SKO.SHAPES`/`SKO.shapeEnts`/`Sketch.insertShape`: Stern, Pfeil, Herz, Zahnrad-Umriss, Schlüsselloch im Panel `#sk-shapes`), Text (B: Schrift Inter oder eigene TTF über `Sketch.loadFontFile`, fett, Ausrichtung, **Bogen-Radius**, „An Kreis legen“, **entlang einer Linie, eines Bogens oder einer Spline**, `kern`-Unterschneidung + Laufweite), Spline (S; im Profi-Modus auch **Mit Kontrollpunkten** `mode: 'cv'` und **Tangenten-Griffe** `handles` mit Winkel/Stärke an Durchgangs-Splines), Kegelschnitt (`conic`, nur Profi, Rho-Wert), Brückenkurve (`bridge`, nur Profi, G1/G2)
  - Kurve aus Formel (`#sk-formula`, `SKO.FORMULA_CURVES`/`SKO.evalFormulaCurve`/`Sketch.insertFormulaCurve` über `Expr.evalRad`, nur Profi: `y = f(x)` oder `x(t), y(t)`, Sinus, Evolvente) und Kurve aus Tabelle (`#sk-csv`, `SKO.parsePointsCSV`/`SKO.pointsToCurveEnts`/`Sketch.insertPointsCSV`, nur Profi: CSV-Datei oder Text als Spline oder Linienzug)
  - Krümmungskamm (`#sk-curv-comb`, `#sk-curv-scale`, `Sketch.setShowCurvature`/`toggleCurvature`/`setCurvatureScale`, nur Profi) und Regel „Krümmungsglatt (G2)“ (`curvature`, nur Profi) zwischen offener Spline (≥ 3 Punkte) und Nachbarkurve
- **Schablonen:** Pin-Raster, Lüftungsgitter, QFP, QFN, BGA, SOIC, DIP (Maße 2026 gegen JEDEC und Datenblätter geprüft), USB-C-Buchse 9,5 × 3,8, USB-C-Stecker 13 × 7 mit Eckradius, Befestigungslöcher
- **Bearbeiten:**
  - Ecke runden/fasen (K, auch „Alle Ecken auf einmal“), Trimmen (T, auch Ellipsen), Verlängern (U), Teilen (Y), Versatz (F, auch Ellipsen; der Abstand einer Kette lässt sich später für alle Stücke zusammen ändern)
  - **Wand (N):** eine offene Linie wird eine Wand mit Dicke
  - **Kante übernehmen (Z):** Körperkante als feste Linie, Bogen, Kreis oder Spline; **verbunden**, wandert also mit, wenn sich der Körper ändert (Ketten-Symbol, „Verbindung lösen“); Klick auf eine **Fläche** holt den ganzen **Schnitt** des Körpers mit der Skizzen-Ebene; **Umschalt + Klick** auf eine ebene Fläche übernimmt alle Randkanten (außen und Löcher) auf einmal (`projectFaceAt`), mit Feld **Versatz** (`S.projOff`, `#proj-off`, `offsetLoop2D` über `SKO.offsetChain`) direkt versetzt (+ außen / − innen); **Umriss holen (`silhouette`, SK-42, Profi)** projiziert die äußere Silhouette eines Körpers (`silhouetteOf` im Kern) und **Schnittkurve (`intersect`, SK-43, Profi)** übernimmt die 3D-Schnittlinie zweier Flächen (`faceIntersectOf` im Kern) jeweils verbunden (`relinkAsync`, `RefFix` in `46-reffix.js`)
  - Spiegeln (M, auch direkt an der X-/Y-Achse)
  - Rechteckmuster (Q), Kreismuster (W) – **nachträglich als Ganzes änderbar**; Kurvenmuster (`patcurve`, Anzahl oder Abstand entlang Linie/Bogen/Kreis/Spline samt Ausrichten) und Füllmuster (`patfill`, Raster/versetzt/Waben mit Lochgröße, Abstand, Randabstand) in Einfach und Profi
  - Maß (D, Formeln), Bild-Vorlage (I, mit Maßstab), Hilfslinie (X)
  - Maß-Arten (`S.dimMode`, `Sketch.setDimMode`): Automatisch, Bogenlänge (`arcLen` mit Umschalter `⌒`/`R`), Winkel über 3 Punkte (`ang3`), Koordinatenmaße (`ord` ab gewählter Nullkante, nur Profi), Kreisrand-Abstand (`distCC` mit `cm: 'center'|'min'|'max'`, `Sketch.setDimCircMode`)
  - Skizze sperren (`sketch.locked`, `Sketch.setLocked`/`toggleLocked`, Knopf `#sk-lock`, Plakette `#sk-lock-badge`) und Drehachse markieren (`e.revAxis`, `Sketch.setRevAxis`, Checkbox `#se-rev-axis`, assoziatives `p.axisEnt` beim Drehen)
  - Maße als Tabelle: `details#dim-table` (Felder `#dt-N`, Zustand `S.dimTableOpen`)
  - Skizzen-Prüfer (SK-09): `SKO.inspect(ents, {gapTol, dupTol, dims, cons})`, `Sketch.check`/`repair`/`focusCheckIssue`, Knöpfe `#sk-check`/`#sk-repair`, Liste `#sk-check-res` (findet offene Enden, doppelte/überlappende Linien und winzige Lücken < 0,05 mm, hebt per Klick hervor, repariert mit `coincident` und Löschen)
  - Skizze fertig bestimmen (SK-06): `SKO.autoDefine(sketch, V, {angleTol, gapTol})`, `Sketch.autoDefine`/`applyAutoDefine`/`cancelAutoDefine`, Knöpfe `#sk-autodef`/`#sk-autodef-apply`/`#sk-autodef-cancel` (schlägt fehlende Regeln < 2° / < 0,05 mm und Maße gestrichelt vor; Übernehmen in einem Rückgängig-Schritt)
  - Freie Stellen & Widerspruch erklären (SK-07, SK-08): `Solver.analyze` (`freePoints`, `nullBasis`) & `Solver.explainConflict`, `Sketch.toggleFreeSpots`/`setFreeMode`/`wiggleFree`/`focusConflictItem`/`removeConflictItem`, Knopf `#sk-free` (`Umschalt F`, orange pulsierend, Wackeln per Klick), Liste `#sk-conflict` mit Hervorheben und „Entfernen“
  - Rahmen-Auswahl in der Skizze (SK-10): `Sketch.bandSelect(x1, y1, x2, y2, additive)`, Mehrfach-Auswahl `S.sels` (`S.sel` als Getter/Setter auf `S.sels`; links→rechts ganz drin, rechts→links gestrichelt berührt, Umschalt fügt hinzu; Entf löscht zusammen, H/Q/W übernehmen in `S.patSel`, Strg C und X unterstützen Mehrfach-Auswahl; Panel `#sk-sel-count`/`#sk-sel-move`/`#sk-sel-con`/`#sk-sel-del`)
  - Linie und Bogen im Wechsel (SK-15): im Linienzug schaltet Taste A `S.draft.arc` über `toggleLineArc` zwischen Linie und tangentialem Bogen (`endTangent`/`draftTan`/`makeTanCon`/`tanLineSnap`/`updateLineHint`, mit `tangent`- und `coincident`-Regeln, Tangenten-Fang am Bogenende und angepasstem Hinweistext)
  - Versatz mehrfach und beidseitig (SK-21): `S.off` (`#off-n`, `#off-both`, `#off-corner`), `offsetPlan` und erweiterte `SKO.offsetChain`/`SKO.offsetShape` mit `corners: 'round'` (Eckbögen mit `offset`-Regel `corner: true`, `coincident` und `tangent`) sowie `poly`-Kanten im Solver (`line(ref)`)
  - Linie „Tangente an zwei Kreise“: `S.lineMode = 'tan2'` → `tan2Down`/`tan2Geom` (äußere Tangente, Seite nach den Klicks), zwei `tangent`-Regeln
  - Bogen „Mitte, Start, Ende“: `S.arcMode = 'center'` → `centerArc(d, p)`; Langloch „Gesamtlänge“: `S.slotTotal` → `slotInset(a, b, r)`, getippte Gesamtlänge wird zu `len` = Gesamtlänge − Breite
  - Rechteck mit runden Ecken: `S.rectR` (Feld `#rk-r`) → `roundRect(en, r, keepWH)` (Ecken über `cornerDo`, dann waagerecht/senkrecht, `equal` für die Radien, bei getippten Maßen zwei `distPL`); Ecke bilden: `S.corner.mode = 'meet'` → `meetDo` (zwei Klicks, `S.meetFirst`)
  - Kopieren/Einfügen: Strg C/V in der Skizze (`copySel`/`pasteClip`, Ablage auch in `localStorage` „tracery.sketchClip“; Regeln aus `CLIPCONS` und Maße ohne X/Y kommen mit); Doppelklick in Verschieben/Muster wählt die Kette (`SKO.chainOf`)
  - Verschieben (H): um X/Y oder Drehen um Punkt/Mitte, auch als Kopie (`S.xm`, `applyXmove`, Auswahl über `S.patSel` wie beim Muster)
  - Winkelfang und runde Längen (SK-14): 15°-Winkelfang und zoomabhängige Längensprünge (1 / 0,5 / 0,1 mm) beim Zeichnen von Linien (`linePoint`, `angleSnap`, `lengthSnapStep`), abschaltbar per Umschalt oder `#sk-angle-snap` (`Sketch.angleSnap`/`setAngleSnap`, `tracery.angleSnap`)
  - Strecken (SK-30) und Live-Spiegeln (SK-46) im Profi-Modus: Werkzeug `stretch` (`SKO.stretchSelect`/`stretchPreview`, `Sketch.stretchBox`/`applyStretch`) zieht nur Punkte im Auswahlrahmen unter Erhalt der Regeln; `#sk-live-mir-btn`/`#sk-live-mir-box` (`Sketch.setLiveMirror`/`toggleLiveMirror`) spiegelt neu Gezeichnetes direkt samt `symmetric`-Regel an der gewählten Linie oder Achse
  - Polares Raster & Lineal-Hilfslinien (SK-52) im Profi-Modus: umschaltbares polares Raster (`Sketch.setGridMode`/`togglePolarGrid`/`setPolarGrid`, Ringe und Strahlen mit `#sk-ruler-c`) und vom linken/oberen Lineal (`#sk-ruler-l`, `#sk-ruler-t`) herausziehbare Hilfslinien (`Sketch.addGuide`/`moveGuide`/`removeGuide`/`clearGuides`, `p.sketch.guides`, `Snap.polarSnap`/`guideSnap`/`hitGuide`) mit Fangen und Rückgängig
- **Regeln:** senkrechte Leiste links, 10 Grundregeln (mit „Auf einer Linie“) plus Mittig und Konzentrisch.
- **Maß zum Ablesen:** in Klammern, legt nichts fest; Knopf „( )“; wird automatisch so angelegt, wenn der Wert schon bestimmt ist.
- **Löser:** blau = beweglich, dunkel = voll bestimmt; Widersprüche werden abgelehnt.
- **Fangen:** Endpunkt, Mitte, Mittelpunkt, Kreispunkt, Schnitt, Lot, Tangente, auf Linie, Ausrichtung, Raster.
- **Skizzenebene:** frei verschieben und neigen, **mittig zwischen zwei parallelen Flächen** oder **durch drei Punkte** auf Körpern. Ein Doppelklick auf eine ebene Fläche startet die Skizze darauf, die Flächenkanten sind Fangpunkte.
- **Einheiten im Maßfeld**, z. B. „2 cm“, „1/4"“, „10mm+2cm“.
- **Skizze fertig:**
  - Geschlossene Flächen → Hochziehen oder Drehen
  - Nur offene Pfade → „Entlang Pfad“
  - Nur Punkte auf einer Körperfläche → **Bohrungen an jedem Punkt** (Bohrungs-Assistent)
- Die Skizzen-Leiste muss in **zwei Zeilen** passen, neue Werkzeuge bekommen kurze Namen. Der Test „Trimmen“ merkt eine dritte Zeile.

**3D-Features**
- Grundkörper mit Ziehgriffen; Hochziehen (Push/Pull an Flächen); Drehkörper
- Übergang (Loft) mit Spitze („Zur Spitze“) oder **entlang einer Mittellinie** (Punkte ziehen biegt den Körper, Warnung bei schrägem Auftreffen) oder mit **einer oder zwei Führungskurven** (Seitenlinie von der Seite und von oben, der Übergang wird dazwischen so breit, dass er sie berührt); Entlang Pfad (Rohr, Kanal, eigener Querschnitt); **Rohr im Raum** (Punkte auf Körper oder in den Raum klicken)
- STEP/IGES/BREP/STL/3MF/OBJ-Import (`Start.importCAD`, `Start.import3MF`, `Start.parse3MF` mit `Zip.read`, `Start.importOBJ`, `Start.parseOBJ`: mehrere Objekte/Komponenten mit Namen, Farben und Einheiten; binär als `blobId` in IndexedDB `tracery-db` über `Store` statt Base64 im Autosave); DXF- und SVG-Import als Platte mit Skizze (`Start.importDXF`, `parseDXF`, `parseSVG`, `tidyOutline` in `85-start.js`) und Drag-and-Drop mit Hinweis-Rahmen `#drop-overlay` (Projekt, 3D-Import oder DXF/SVG in die offene Skizze)
- Rundung und Fase per Knopf oder **Ziehgriff an der Kante**; Fase mit **zwei Abständen** oder **Abstand und Winkel**, Rundung **von … bis** (wächst entlang der Kante); Entformungsschräge; Wandstärke (Aushöhlen)
- Echte metrische Gewinde (Gewindebolzen, gedrucktes Innengewinde mit Spiel, `threadShape` M2–M24 auch mit eigener Steigung) und direktes Setzen auf runde Flächen (Rechtsklick „Gewinde …“ auf Bolzen oder Bohrung mit automatischem Durchmesser-Vorschlag, Länge, Steigung und Wahl zwischen echtem 3D-Gewinde `Features.applyRealThread` und **kosmetischem Gewinde** `it.threads` über `Features.threadPop`, gestreifte 3D-Markierung ohne Kern-Neubau, Stückliste, Zeichnung nach DIN ISO 6410-1, „Echt machen“ über `Features.makeThreadReal`)
- Bohrungs-Assistent: Durchgang mit Senk- oder Zylinderkopf (auch 82° bei Zoll und Flachsenkung bei G), Kernloch für metrische Regel- und Feingewinde, Zoll UNC/UNF (#4 bis 1/2") und Rohrgewinde (G1/8 bis G1) aus `gewinde.json`, Sackloch mit 118°-Bohrspitze (`blindHole`), Passbohrung H7 (`fitHole`, ISO 286), Zentrierbohrung (`centerHole`, DIN 332 A), Gewindeeinsatz, Mutternfalle – mit Querschnitts-Vorschau (`holePreviewSVG`)
- Rechteckmuster; Kreismuster um Z/X/Y oder eine **im Bild gewählte Achse** (Kante, runder Rand, Welle, Loch)
- **Muster entlang Kurve** (Kurve zeichnen, Ringe zeigen die Lage, Anzahl/Abstand/Ausrichtung)
- Spiegeln (Ebene oder **an Fläche**, die Ebene wandert mit der äußersten Fläche mit) sowie **Schritt spiegeln** (`mirrorStep`, `Features.mirrorStep`: einzelne Formschritte wie Taschen, Erhöhungen, Rippen oder Löcher an Ebene, Bezugsebene oder Fläche im selben Körper spiegeln)
- **Wickeln um Zylinder** (`wrap`, `Features.startWrap`/`createWrap`/`sweepFromWrap`): ebene Skizzen verzerrungsfrei um Zylinderflächen wickeln – als erhabene/vertiefte Prägung oder als Linie auf der Oberfläche samt „Entlang Pfad ziehen“
- Teilen mit Spalt; Boolesch (Vereinigen/Abziehen/Schnittmenge); Verschieben/Drehen/Kopieren als Schritt (`transform` im Verlauf mit Werten, Formeln und Drehpunkt); **Skalieren** (`scale`, gleichmäßig oder je Achse um Schwerpunkt oder Ursprung), **Fläche aufdicken** (`thicken`, eben oder gewölbt nach außen/innen/mittig als Anbau, eigene Platte oder Abzug) und **Prägen** (`emboss`, Text/Logo auf ebene oder gewölbte Flächen wie Zylinder/Kugel erhaben oder vertieft übertragen) im Verlauf (`Features.scale`/`Features.thicken`/`Features.startEmboss`)
- **Gelenke:** Drehgelenk und **Schiebegelenk** zwischen zwei Teilen, Regler mit Bereich, **Ketten** (Platte → Arm → Greifer). „Bewegung prüfen“ fragt den Kern in Schritten nach Durchdringungen; „Als Anschlag übernehmen“ und „Bewegung abspielen“.

**Bibliothek („Bauteile“ und Drohne → „Lochbilder und Bausteine“)**
- Löcher: Schraubenloch, Mutternfalle, Gewindeloch, Gewindebolzen, Gewindeeinsatz, Langloch
- Lochbild (Stack 30,5/25,5/20/16, Motor 19/16/12/9), Kabelbinder
- Schnapphaken, Scharnier, Zahnrad, Stromlinien-Rumpf, **Armverkleidung** (NACA-Tropfenprofil für Speed-Drohnen)
- **GoPro-Halterung:** 2 oder 3 Finger, 3,0/3,2/Loch 5,2, M5-Mutter-Nabe; Werte nach Messungen der Community
- **XT60-Halter** (Steckermaße noch geschätzt)
- **Antennenhalter:** 1 oder 2 Röhrchen, Spreizung, Neigung nach hinten = +Y
- Kaufteile in echter Form mit Datenblatt-Gewicht: Motoren, Propeller, Stacks, Kameras, Videosender, Empfänger, GPS, Akkus, Action-Kameras, Stecker, Kondensatoren, **Antennen** (Pilz oder Stab, eigene Maße)

**Drohnen-Modul**
- Rahmen-Generator (Rohbau aus Einzelteilen) und Frame-Assistent:
  - Propeller 3–7" inkl. 3,5"
  - Formen X, Stretched, Wide, Deadcat, **H-Rahmen** (Längs- und Querträger), Cinewhoop mit Ducts, bei X/Stretched/Wide wahlweise **einzelne Arme** (Sandwich mit Bodenplatte), **Speed** (Stromlinien-Rumpf, geneigte Motoren 20° mit Keilen)
- 13 Herstellerrahmen als Vorlage
- Bausätze auf der Startseite
- **Drohnen-Check:** Propellerkreise frei, Spitzenabstand, Durchdringungen, Gewicht, Schwerpunkt, Schub-Gewicht-Verhältnis – auch für **selbst gebaute Rahmen** (Motoren aus „Kaufteile“, gern im Muster); **„Akku verschieben“** gleicht den Schwerpunkt aus
- Platten als DXF für die Fräse

**KI**
- **KI-Kollege** (über `sample`): allgemeiner CAD-Helfer (Gehäuse, Halterungen, Ersatzteile, Schilder, Zahnräder, Normteile), arbeitet in Runden mit JSON-Aktionen (`hinzufuegen`, `aendern`, `muster` rechteck/kreis/kurve inkl. Achse, `spiegeln`, `verbinden`, `verrechnen`, `gelenk`, …), bessert Fehler selbst nach und fasst alles zu einem Rückgängig-Schritt zusammen.
- Er kennt alle Grundformen, allgemeinen Bauteile und Normteile (`stdScrew`, `stdNut`, `stdWasher`), dazu Übergang mit `mittellinie`, `fuehrungskurve` und `fuehrungskurve2`, Rohr mit `pfad3d` und `regeln` sowie Text mit `bogen` und `entlang`. Die Aktion `drohne` bleibt technisch erhalten, wird im Systemtext aber nicht mehr angeboten.
- „Erklär diesen Schritt“.
- **Schwachstellen-Analyse:**
  - Löcher zu nah am Rand oder aneinander
  - dünne Stellen je Material
  - Armdicke
  - Überhänge ab 100 mm² bei Druckteilen
  - mit Fundstellen-Ringen und KI-Vorschlägen

**Export:** STEP, IGES (`exportIGES`), BREP (`exportBREP`), STL, 3MF, OBJ/MTL (`Print.buildOBJ`), GLB (`Print.buildGLB`), DXF (Platten), Projektdatei, technische Zeichnung (PDF).

## 6. Tests – Pflicht vor jedem Commit

- `tests/klicktest.py` (Playwright, echter Browser, echte Klicks), ca. **190 Durchläufe** (mit `--browser chromium|firefox|webkit`, Standard `chromium`):
  ```
  cd app && python3 -m http.server 8765 &
  TRACERY_URL=http://localhost:8765/ python3 tests/klicktest.py [Stichwort …]
  ```
- **Dauer:** Der Volltest braucht ca. 45–110 Minuten auf 2 Kernen. **Keine anderen Tests gleichzeitig laufen lassen**, sonst gibt es Wackler.
- **Ergebnis heute:** alle OK bis auf 1 „von Hand“ (Flimmern beim Tiefzoomen). Den Server am besten im selben Hintergrund-Befehl wie den Volltest starten (Hintergrund-Befehle enden nach 2 Stunden).
- **Neue Funktion = neuer Test.** Er kommt in die Liste am Dateiende (Name mit Schrägstrichen je Prüfpunkt) und liefert `[ok1, ok2, …]`.
- **Hilfsfunktionen:**
  - `p.ev(js, arg)` mit allen Modulen aus `window.__M`, `p.empty()`
  - `sketch_xy`, `to_screen(u,v)`, `world_screen(x,y,z)`, `bbox(p,i)`, `wbox`, `near`
  - `ctx(p,'Muster','Kreismuster')`, `field(p,'#id',wert)`, `warte_rechnen`, `fertig_hoch`, `volumen`, `platte`, `zylinder`, `zwei_quader`, `drohne(p,'f5')`
  - `ki(p)` + `ki_fragen` (KI wird mit vorbereiteten Antworten nachgespielt)
- **Fallstricke:**
  - `LIBMAP` und `libDefaults` sind im Test nicht global, Teile also mit `Model.newItem('part', {lib, …})` anlegen.
  - Neue Gruppen haben das Standardmaterial **CFK**; für Druck-Regeln `mat='PETG'` setzen.
  - Text mit CSS-Großbuchstaben wird mit `.lower()` verglichen.
  - Einheiten in Feldern tauchen nicht in `inner_text` auf.
- **Arbeitsweise:** In einem Arbeitsordner bauen, für jede Sitzung eine Kopie anlegen und deren eigenen Server testen. Den Server mit einer Wächter-Schleife am Leben halten, weil Hintergrundprozesse sonst beendet werden. Erst committen, wenn der Volltest grün ist. Was ein Test findet, wird ehrlich in der Commit-Nachricht genannt.

## 7. Arbeitsablauf einer Sitzung

1. FORTSCHRITT, TESTLISTE und den Fahrplan lesen; den Mac-Stand prüfen (`git log --oneline -1`).
2. In `app/src/` bauen, dann `python3 tools/build.py`.
3. **Hilfetexte:** Neues Werkzeug → Eintrag in `werkzeug-hilfen.json` (tip, hilfe, tipp) und `HELP` in `00-util.js` neu erzeugen. Jede Skizzen-Taste und jeder Ansicht-Menüpunkt braucht Hilfe, Tests prüfen das.
4. Neuen Test schreiben, gezielt laufen lassen, Bild per Screenshot ansehen, dann den Volltest.
5. FORTSCHRITT, TESTLISTE und Bekannte Punkte nachführen.
6. Committen (Abschnitt 2); dann die Online-Seite, das Claude-Doc „Tracery im Vergleich“ und `claude/tracery-arbeitsweise.md` aktualisieren.
7. Zum Schluss Nils auf Deutsch berichten: **Erledigt / Offen**, Commit-Kürzel, Testergebnis, „Push origin“ drücken.

## 8. Bekannte Punkte und Grenzen

- Verbundene Kanten finden ihre Kante über Lage, Art, Länge und Richtung. Springt eine Kante sehr weit oder verschwindet sie, bleibt die übernommene Kante stehen. Die Fangkanten aus „Skizze auf Fläche“ sind nicht verbunden.
- Spiegeln an Fläche hängt nur an der äußersten Fläche in Achsrichtung.
- Die eingebaute Schrift „Inter“ hat keine Unterschneidung (eigene TTFs nutzen ihre `kern`-Tabelle); `GPOS`-Kerning und CFF/OTF fehlen noch. Ellipse und Text lassen sich nicht trimmen. Die Drehung von Ellipse und Vieleck ist keine Regel.
- Vorlagen bestehen aus einer Gruppe. Teilen ergibt zwei Hälften in einem Schritt.
- Der Magnet auf runden Flächen rastet an Scheitel- und Mittellinien ein, nicht an Lochmitten auf der Rundung.
- Ein Teil wird nur von einem Gelenk bewegt; „Bewegung abspielen“ nur für Teile ganz oben im Verlauf.
- Übergang mit Mittellinie: keine Spitze, keine „geraden Flächen“, die Linie liegt in einer Ebene.
- Rohr im Raum: Regeln je Stück (entlang X/Y/Z, rechtwinklig/parallel zum vorigen, Länge – auch im Bild eintippen); auf Körper geklickte Punkte hängen am Körper (wandern bei Verschieben/Drehen mit, nicht bei Formänderung).
- Drohnen-Check eigener Rahmen: Steckt ein Motor mit Rahmenteilen in einer Gruppe, zählt die ganze Gruppe als ein Teil.
- Luftwiderstand und Höchstgeschwindigkeit sind Schätzungen mit festen cw-Richtwerten; Propeller verlieren bei Tempo Schub.
- Steckermaße XT60H/XT30U sind geschätzt; die GoPro-Maße beruhen auf Messungen der Community.

## 9. Fahrplan (nächste Schritte)

1. Gemini Prompt O auswerten: Stecker, Antennen als Kaufteile mit eigener Form, 2"- und 2,5"-Cinewhoops im Frame-Assistenten.
2. Herstellerrahmen mit Original-Umriss (braucht Daten).
3. Speed-Drohne: Motorverkleidungen.
4. Text trimmen und versetzen.
5. Später (Stufe 6): Konten, Projekte in der Cloud, Teilen, gleichzeitig arbeiten.

## 10. Von Hand zu prüfen (Nils)

- Gedrucktes M8-Gewinde; Gefühl beim Einrasten; Speed-Nase mit „Übergang“
- Beide USB-C-Ausschnitte mit echten Steckern
- Stack-Lochbild an einem echten Flugcontroller
- GoPro-Halterung und XT60-Halter drucken
- Wand aus Bogen; Deckel mit übernommenen Kanten
- Anschlag beim Klapparm, Kette abspielen
- Speed-Rumpf mit Mittellinie und Fahrtwind
- Kabelkanal mit „Rohr im Raum“ drucken
- Schwerpunkt der echten Drohne nachwiegen
- Überhänge gegen den Slicer vergleichen
- DXF in einer Fräs-Software
- KI-Kollege in Claude
- Magnet auf Rohren und Rümpfen, Höchstgeschwindigkeit gegen echte Flüge, H-Rahmen als DXF fräsen, Text im Bogen und entlang einer Kurve drucken, Rundung „von … bis“ am Arm
