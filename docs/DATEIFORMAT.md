# Tracery-Dateiformat (`.tracery.json`)

Dieses Dokument beschreibt das offene Projektformat von **Tracery**. Jede Projektdatei ist eine gewöhnliche UTF-8-kodierte JSON-Datei – lesbar für Menschen, Programme und Skripte, ohne Konto oder Cloud.

---

## 1. Überblick

- **Dateiendung:** `.tracery.json` (ebenfalls akzeptiert: `.json`).
- **Zeichenkodierung:** UTF-8 (optional mit BOM am Anfang, wird beim Einlesen entfernt).
- **Grundeinheiten in der Datei:**
  - Alle gespeicherten Zahlen für Längen und Positionen gelten in **Millimetern (`mm`)**.
  - Alle Winkel gelten in **Grad (`°`)**.
  - `settings.unit` bestimmt nur die Anzeige-Einheit in der Oberfläche (`mm`, `cm`, `m` oder `in`).
- **Koordinatensystem:** Rechtshändiges 3D-System (`X` rechts, `Y` nach hinten, `Z` nach oben).
- **Dateigrößenlimit & Sicherheit:** Beim Einlesen prüft `Store.checkFileSize` eine Obergrenze von **50 MB** (`Store.LIMITS.project`). `Store.safeParseJSON` verwirft gefährliche Schlüssel wie `__proto__`, `constructor` und `prototype`.

---

## 2. Aufbau eines Projekts (`doc`)

Die oberste Ebene der Datei ist ein JSON-Objekt (`doc`).

### Pflichtfelder

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `format` | `string` | Fester Kennwert: immer `"masswerk"`. |
| `version` | `number` | Positive ganze Zahl der Format-Version. Aktuell: `1`. |
| `id` | `string` | Eindeutige Projekt-Kennung (nicht leer, z. B. `"p_1a2b3c"`). |
| `name` | `string` | Projektname (nicht leer, z. B. `"Gehäuse"`). |
| `items` | `Array` | Geordnete Liste der Schritte und Körper in der Zeitleiste (kann bei einem leeren Projekt `[]` sein). |

### Optionale Felder

| Feld | Typ | Standard / Bedeutung |
| --- | --- | --- |
| `docType` | `string` | `"part"` (Bauteil, Standard wenn weggelassen) oder `"assembly"` (Baugruppe). |
| `created` | `number` | Erstellzeitpunkt als Unix-Zeitstempel in Millisekunden. |
| `modified` | `number` | Zeitpunkt der letzten Änderung in Millisekunden. |
| `params` | `Array` | Benannte Maße und Formeln: `[{ id, name, expr, label?, measure?, refId? }]`. |
| `tables` | `Array` | Wertetabellen für `tabelle(...)`: `[{ id, name, rows: [{ id, key, val }] }]`. |
| `settings` | `object` | Projekteinstellungen (`unit`, `grid`, `snap`, `printer`, `custom`, `printBed`, `material`, …). |
| `rollback` | `number \| null` | Index (ab `0`) des Zeitleisten-Markers; `null` oder fehlend = am Ende. |
| `noHistory` | `boolean` | `true`, wenn der Verlauf abgeschaltet ist (direktes Bearbeiten). |
| `folders` | `Array` | Ordner im Verlauf: `[{ id, name, ids: [...] }]`. |
| `blocks` | `Array` | Wiederverwendbare Skizzen-Blöcke: `[{ id, name, ents, dims, cons }]`. |
| `fonts` | `Array` | Eingebettete TrueType-Schriften (`.ttf`): `[{ id, name, file, data }]`. |
| `datums` | `Array` | Bezugsebenen (`[{ id, name, base, plane, size, color, hidden }]`). |
| `axes` | `Array` | Bezugsachsen (`[{ id, name, base, axis: { o, d }, hidden }]`). |
| `points` | `Array` | Bezugspunkte (`[{ id, name, base, point: [x, y, z], hidden }]`). |
| `csys` | `Array` | Eigene Koordinatensysteme (`[{ id, name, base, csys: { o, x, y, z }, hidden }]`). |
| `joints` | `Array` | Gelenke und Verbindungen (`rot`, `slide`, `cyl`, `planar`, `ball`, `slot`, `fixed`, `angle`, `center`, `parallel`, `tangent`, `distance`). |
| `measures` | `Array` | Dauerhafte Messungen im 3D-Bild. |
| `notes` | `Array` | Notizstift-Striche, Textnotizen und Kommentar-Pins (`kind: "stroke" \| "text" \| "pin"`). |
| `pointClouds` | `Array` | Eingelesene Punktwolken (`CSV`/`XYZ`/`PLY`). |
| `views` | `Array` | Gespeicherte Kamerablickwinkel (`[{ id, name, p, t, up, ortho }]`). |
| `selSets` | `Array` | Gespeicherte Auswahlen (`[{ id, name, ids }]`). |
| `variants` | `Array` | Benannte Varianten (`[{ id, name, values, suppressed, material }]`) samt aktiver `variant`-Kennung. |
| `drawing` | `object \| null` | Technische Zeichnungen mit Blättern (`sheets`), Ansichten, Schnitt-/Detailansichten, Maßen, Toleranzen, Mittellinien, Hinweislinien und Stückliste. |
| `versions` | `Array` | Gespeicherte Projekt-Versionen (`[{ id, name, t, doc }]`), beim Datei-Export mit eingebettet. |

> **Hinweis zu `settings`:** Gültige Werte für `settings.unit` sind `"mm"`, `"cm"`, `"m"` und `"in"`. Fehlt `settings`, ergänzt Tracery beim Laden automatisch Standardwerte (`unit: "mm"`, `grid: 1`, `snap: true`).

---

## 3. Schritte und Körper (`items`)

Jeder Eintrag in `items` beschreibt entweder einen Körper, einen Formschritt, eine Gruppe oder einen Baugruppen-Verweis.

### Felder eines Eintrags

| Feld | Pflicht | Typ | Bedeutung |
| --- | --- | --- | --- |
| `id` | ja | `string` | Eindeutige Schritt-Kennung im gesamten Projekt (z. B. `"i_1"`). |
| `kind` | ja | `string` | Art des Schritts (siehe Tabelle unten). |
| `name` | nein | `string` | Angezeigter Name im Verlauf. |
| `role` | nein | `string` | `"solid"` (Körper, Standard) oder `"hole"` (Loch, schneidet aus Vorgängern). |
| `color` | nein | `string` | Hex-Farbe wie `"#3f7fd6"`; optional `colorSet: true` (eigene Farbe schlägt Werkstoff). |
| `opacity` | nein | `number` | Durchsichtigkeit zwischen `0` und `1` (nur Anzeige). |
| `t` | nein | `object` | Lage und Drehung `{ x, y, z, rx, ry, rz }`. Jeder Wert darf Zahl oder Formel sein. |
| `p` | nein | `object` | Parameter des Schritts (je nach `kind`). |
| `op` | nein | `object` | Formschritt-Modus an oberster Ebene: `{ type: "join" \| "cut" \| "common", target }`. |
| `finishes` | nein | `Array` | Kanten- und Flächen-Nachbearbeitungen am Schritt (`fillet`, `chamfer`, `fullFillet`, `faceFillet`, `cornerChamfer`, `draft`, `partingDraft`, `shell`). |
| `children` | nein | `Array` | Unterelemente bei `kind: "group"`. |
| `suppressed` | nein | `boolean` | `true` blendet den Schritt in der Berechnung aus. |
| `hidden` | nein | `boolean` | `true` blendet den Körper nur im 3D-Bild aus. |
| `locked` | nein | `boolean` | Sperrt das Element gegen versehentliches Bearbeiten. |
| `grounded` | nein | `boolean` | Hält ein Teil in Baugruppen fest. |
| `mat` | nein | `string` | Werkstoffname aus `materialien.json` (oder `"Kaufteil: festes Gewicht"`). |
| `massG` | nein | `number \| string` | Festes Gewicht in Gramm bei Kaufteilen. |
| `faceColors` | nein | `Array` | Eigene Farben je Fläche (`[{ n, c, col }]`). |
| `texture` | nein | `object` | Körper-Textur `{ kind: "wood" \| "brushed" \| "carbon", scale, rot }`. |
| `decals` | nein | `Array` | Aufkleber und Logos auf ebenen Flächen (`[{ id, name, src, aspect, face, u, v, w, scale, rot, opacity, flipX }]`). |
| `bodies` | nein | `Array` | Mehrere Teilkörper in einem Schritt (`[{ idx, c, name, color, hidden }]`). |
| `props` | nein | `object` | Stücklisten-Felder `{ partNo, desc, supplier, price }`. |
| `note` | nein | `string` | Freie Notiz am Schritt. |
| `link` | nein | `string` | Verweis-Kennung einer verknüpften Kopie. |

### Schritt-Arten (`kind`)

- **Grundkörper:** `box` (`w`, `d`, `h`), `cylinder` (`d`, `h`), `tube` (`d`, `wall`, `h`), `sphere` (`d`), `hemisphere` (`d`), `cone` (`d1`, `d2`, `h`), `pyramid` (`w`, `d`, `h`), `torus` (`d`, `t`), `prism` (`n`, `d`, `h`), `wedge` (`w`, `d`, `h`).
- **Skizzenbasiert & räumlich:** `extrude` (`p.sketch`, `dist`, `dir`, `extent`, `thru`, `thin`, `wall`), `revolve` (`p.sketch`, `angle`, `dir`, `axis`, `axisId`, `axis3d`, `toFace`), `loft` (`p.sketches`, `ruled`, `tip`, `closed`, `path`, `rail`, `rail2`), `sweep` (`p.sketch`, `p.path3d`, `p.sketch3dId`, `p.wrapId`, `shape`, `twist`), `helix` (`form`, `by`, `d`, `pitch`, `turns`, `height`, `dir`), `sketch3d` (`p.sketch3d = { ents, dims }`).
- **Formschritte & Bearbeitung:** `transform`, `scale`, `deform`, `thicken`, `rib`, `vent`, `fins`, `fillPattern`, `web`, `wrap`, `emboss`, `splitFace`, `dome`, `mirrorStep`, `deleteBody`, `boss`, `lipGroove`, `undercut`, `circlipGroove`, `keyway`, `splineProfile`, `knurl`, `gripPattern`.
- **Gruppen & Rechen-Gruppen (`group`):**
  - Normale Gruppe ohne `p.op`: fasst Körper und Löcher zusammen (Löcher schneiden aus den Körpern der Gruppe).
  - Muster (`p.op = "pattern"`): `pt` ist `"rect"`, `"circ"`, `"path"`, `"points"`, `"table"` oder `"mirror"`.
  - Teilen (`p.op = "split"`): teilt an Ebene, Fläche oder Skizze (`plane`, `off`, `keep`, `gap`).
  - Schnittmenge (`p.op = "intersect"`): behält nur die gemeinsame Überschneidung.
- **Bibliothek (`part`):** Parametrische Bauteile und Normteile über `p.lib` (z. B. `screwHole`, `gear`, `stdScrew`, `stdNut`, `stdBearing`).
- **Import (`import`):** Eingelesene Geometrie (`STEP`, `IGES`, `BREP`, `STL`, `3MF`, `OBJ`, `AMF`, `PLY`) über `p.fmt`, `p.data` (Base64 in Exportdateien) oder `p.blobId` (im Browser-Speicher).
- **Baugruppen-Verweis (`ref`):** Verweist über `p.docId` auf ein gespeichertes Bauteil oder eine Unterbaugruppe (`p.docType`).

---

## 4. Skizzen (`p.sketch` und `p.sketch3d`)

Eine 2D-Skizze unter `p.sketch` enthält:

- `plane`: `{ o: [x, y, z], x: [ux, uy, uz], n: [nx, ny, nz] }` (Ursprung, X-Richtung und Normale in lokalen Koordinaten).
- `ents`: Liste der Zeichenelemente:
  - `line` (`a`, `b`), `arc` (`a`, `m`, `b`), `circle` (`c`, `r`), `ellipse` (`c`, `rx`, `ry`, `rot`), `ellarc` (`c`, `rx`, `ry`, `rot`, `a0`, `a1`, `ccw`), `conic` (`a`, `m`, `b`, `rho`), `bridge` (`a`, `b`, `mode`, `s1`, `s2`), `rect` (`a`, `b`), `poly` (`c`, `r`, `n`, `rot`), `slot` (`a`, `b`, `r`), `spline` (`pts`, `closed`, `mode`, `handles`), `point` (`a`), `text` (`a`, `s`, `h`, `font`, `align`, `rot`, `mir`, `bend`, `on`), `blk` (Block-Instanz).
  - Optionale Elementfelder: `con: true` (Hilfslinie), `link` (verbundene Körperkante), `revAxis: true` (Drehachse).
- `dims`: Liste der Bemaßungen (`w`, `h`, `len`, `d`, `r`, `arcLen`, `x`, `y`, `ang`, `dist`, `distPL`, `distCC`, `angLL`, `ang3`, `ord`), wahlweise mit Zahl, Formel und `ref: true` (reines Ablesemaß).
- `cons`: Liste der geometrischen Regeln (`horizontal`, `vertical`, `parallel`, `perpendicular`, `collinear`, `tangent`, `equal`, `symmetric`, `coincident`, `fix`, `midpoint`, `concentric`, `curvature`, `offset`, `xform`).
- `blockInsts`: Einsätze benannter Blöcke aus `doc.blocks` (`[{ id, blockId, x, y, rot }]`).
- `bg`: Optionale Bild-Vorlage (`{ src, w, h, x, y, rot, opacity }`).
- `locked`: `true` sperrt die gesamte Skizze.

---

## 5. Formeln und Einheiten

In `params[i].expr`, `t.x`/`y`/`z`/`rx`/`ry`/`rz`, `p`-Maßen, `dims[i].v` und `joints[i].dist` dürfen neben Zahlen auch **Formeln** als Text stehen:

- **Grundrechenarten & Klammern:** `+`, `-`, `*`, `/`, `^`, `( )`
- **Vergleiche & Logik:** `<`, `<=`, `>`, `>=`, `==`, `!=`
- **Funktionen:** `wenn(bed, dann, sonst)`, `runden(x, stellen?)`, `aufrunden(x, stellen?)`, `abrunden(x, stellen?)`, `tabelle(name, schluessel)` sowie `sin`, `cos`, `tan`, `sqrt`, `abs`, `min`, `max`, `pi`
- **Explizite Einheiten:** `mm`, `cm`, `m`, `in`, `zoll`, `"`, `°` (z. B. `"1 in + 2 mm"`). Zahlen ohne Einheit gelten in der Projekteinheit (`settings.unit`).

---

## 6. Versionen, Kompatibilität und Speicherort

- **Aktuelle Format-Version:** `version: 1` mit `format: "masswerk"`.
- **Rückwärtskompatibilität:** Ältere Dateien ohne optionale Felder (z. B. fehlendes `docType`, `tables`, `blocks` oder `settings.printBed`) ergänzt `Model.migrate(doc)` beim Öffnen automatisch mit sicheren Standardwerten.
- **Vorwärtskompatibilität:**
  - Ist `version` höher als `1`, meldet `Store.validateProject` eine deutsche **Warnung**, lehnt die Datei aber nicht hart ab, solange Grundstruktur und Pflichtfelder stimmen.
  - Unbekannte Schritt-Arten (`kind`) erzeugen ebenfalls eine **Warnung** statt eines Abbruchs; unbekannte Zusatzfelder bleiben zulässig.
- **Browser-Datenbank vs. Exportdatei:**
  - Im Browser (`IndexedDB` `tracery-db`) speichert Tracery binäre Importe platzsparend über `p.blobId` im `blobs`-Store und Versionen getrennt im `versions`-Store.
  - Beim Export als `.tracery.json` (`Start.projectPayload`) bettet `Store.inlineBlobs` alle Binärdateien als Base64 in `p.data` ein und hängt gespeicherte Versionen als `versions`-Liste an.

---

## 7. Vollständige Beispiele

Alle drei Beispiele sind vollständige, direkt ladbare `.tracery.json`-Dateien.

### Beispiel 1: Bauteil „Schild mit Loch“ (Parameter, Gruppe, Bohrung, Rundung)

```json
{
  "format": "masswerk",
  "version": 1,
  "docType": "part",
  "id": "p_beispiel_schild",
  "name": "Schild mit Loch",
  "created": 1764000000000,
  "modified": 1764000000000,
  "params": [
    { "id": "m_laenge", "name": "Laenge", "expr": 80 },
    { "id": "m_breite", "name": "Breite", "expr": 30 },
    { "id": "m_dicke", "name": "Dicke", "expr": 3 }
  ],
  "tables": [],
  "items": [
    {
      "id": "i_schild_grp",
      "kind": "group",
      "name": "Schild",
      "role": "solid",
      "color": "#3f7fd6",
      "hidden": false,
      "locked": false,
      "t": { "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0 },
      "p": {},
      "finishes": [
        { "id": "f_rund", "type": "fillet", "r": 5, "edges": "vertical" }
      ],
      "children": [
        {
          "id": "i_platte",
          "kind": "box",
          "name": "Platte",
          "role": "solid",
          "color": "#3f7fd6",
          "hidden": false,
          "locked": false,
          "t": { "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0 },
          "p": { "w": "Laenge", "d": "Breite", "h": "Dicke" },
          "finishes": []
        },
        {
          "id": "i_loch",
          "kind": "cylinder",
          "name": "Bohrung",
          "role": "hole",
          "color": "#d6574c",
          "hidden": false,
          "locked": false,
          "t": { "x": "Laenge/2 - 7", "y": 0, "z": -1, "rx": 0, "ry": 0, "rz": 0 },
          "p": { "d": 5, "h": 10 },
          "finishes": []
        }
      ]
    }
  ],
  "notes": [],
  "blocks": [],
  "settings": {
    "printer": "std",
    "custom": { "x": 220, "y": 220, "z": 250 },
    "printBed": {
      "enabled": false,
      "printer": "custom",
      "x": 220,
      "y": 220,
      "z": 250,
      "nozzle": 0.4,
      "holeComp": 0,
      "printFit": ""
    },
    "grid": 1,
    "snap": true,
    "unit": "mm"
  },
  "drawing": null
}
```

### Beispiel 2: Skizzen-Körper (`extrude` mit Maßen und Regeln)

```json
{
  "format": "masswerk",
  "version": 1,
  "docType": "part",
  "id": "p_beispiel_skizze",
  "name": "Flansch mit Bohrung",
  "params": [],
  "tables": [],
  "items": [
    {
      "id": "i_flansch",
      "kind": "extrude",
      "name": "Flansch",
      "role": "solid",
      "color": "#2f9e91",
      "t": { "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0 },
      "p": {
        "dist": 6,
        "dir": "normal",
        "sketch": {
          "plane": { "o": [0, 0, 0], "x": [1, 0, 0], "n": [0, 0, 1] },
          "ents": [
            { "id": "e_recht", "type": "rect", "a": [-25, -15], "b": [25, 15] },
            { "id": "e_kreis", "type": "circle", "c": [0, 0], "r": 6 }
          ],
          "dims": [
            { "id": "d_b", "type": "w", "ent": "e_recht", "v": 50 },
            { "id": "d_h", "type": "h", "ent": "e_recht", "v": 30 },
            { "id": "d_d", "type": "d", "ent": "e_kreis", "v": 12 }
          ],
          "cons": [
            { "id": "c_mitte", "type": "concentric", "a": "e_kreis", "b": "e_recht" }
          ]
        }
      },
      "finishes": []
    }
  ],
  "settings": { "unit": "mm", "grid": 1, "snap": true },
  "drawing": null
}
```

### Beispiel 3: Baugruppe (`docType: "assembly"` mit Verweisen und Verbindung)

```json
{
  "format": "masswerk",
  "version": 1,
  "docType": "assembly",
  "id": "p_beispiel_baugruppe",
  "name": "Gehäuse-Baugruppe",
  "params": [],
  "tables": [],
  "items": [
    {
      "id": "i_ref_boden",
      "kind": "ref",
      "name": "Gehäuseboden",
      "role": "solid",
      "color": "#2f9e91",
      "grounded": true,
      "t": { "x": 0, "y": 0, "z": 0, "rx": 0, "ry": 0, "rz": 0 },
      "p": { "docId": "p_teil_boden", "docType": "part" },
      "finishes": []
    },
    {
      "id": "i_ref_deckel",
      "kind": "ref",
      "name": "Gehäusedeckel",
      "role": "solid",
      "color": "#e8833a",
      "t": { "x": 0, "y": 0, "z": 30, "rx": 0, "ry": 0, "rz": 0 },
      "p": { "docId": "p_teil_deckel", "docType": "part" },
      "finishes": []
    }
  ],
  "joints": [
    {
      "id": "j_fest",
      "kind": "fixed",
      "a": "i_ref_boden",
      "b": "i_ref_deckel",
      "ao": [0, 0, 30],
      "ad": [0, 0, 1]
    }
  ],
  "settings": { "unit": "mm", "grid": 1, "snap": true },
  "drawing": null
}
```

---

## 8. Datei prüfen (`Store.validateProject`)

Tracery bringt in `app/src/js/05-storage.js` die Prüf-Funktion `Store.validateProject(input, opts)` mit. Sie akzeptiert sowohl einen JSON-Text (`string`) als auch ein bereits geparstes Projekt-Objekt (`object`) und prüft alle Pflichtfelder, Typen, Einheiten, Schritt-Strukturen, doppelte Kennungen und eingebettete Versionen.

### Rückgabewert

```text
{
  ok: boolean,        // true, wenn keine Fehler (errors) vorliegen
  errors: string[],   // deutsche Fehlermeldungen (leer bei ok === true)
  warnings: string[], // deutsche Hinweise (z. B. neuere Version oder unbekannte Schritt-Art)
  message: string,    // erste Fehlermeldung oder ""
  version: number | null,
  docType: "part" | "assembly" | null,
  itemCount: number   // Gesamtzahl geprüfter Schritte (inkl. Gruppen-Kinder)
}
```

### Beispiel-Aufruf

```js
const ergebnis = Store.validateProject(jsonText);
if (!ergebnis.ok) {
  console.error('Ungültige Projektdatei:', ergebnis.message, ergebnis.errors);
} else {
  console.log('Gültig! Schritte:', ergebnis.itemCount, 'Hinweise:', ergebnis.warnings);
}
```
