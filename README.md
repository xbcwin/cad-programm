# Tracery – kostenloses CAD im Browser

*Tracery* ist das englische Wort für Maßwerk: die exakt konstruierten Ornamente gotischer Kirchenfenster.

Parametrisches 3D-CAD direkt im Browser – kostenlos, ohne Konto und ohne Installation. Deine Dateien bleiben auf deinem Rechner. Exakte Geometrie mit OpenCascade (über replicad, als WebAssembly), Anzeige mit Three.js.

- Skizzen mit Regeln und Maßen, Formschritte (hochziehen, drehen, entlang Pfad, Übergang), Rundungen, Fasen, Gewinde, Bohrungen
- Baugruppen mit Verbindungen und Stückliste, technische Zeichnungen mit Schnitt, Detail und Toleranzen
- Import und Export: STEP, STL, DXF, SVG, OBJ, GLB, 3MF
- Oberfläche „Einfach“ für Einsteiger und „Profi“ für Umsteiger aus anderen CAD-Programmen, auf Deutsch und Englisch
- Als App installierbar und ohne Internet nutzbar

## Starten

Der Kern lädt WebAssembly und einen Web Worker, deshalb muss die Seite über einen Webserver laufen, nicht per Doppelklick:

```
cd app
python3 -m http.server 8000
```

Dann im Browser `http://localhost:8000` öffnen.

Online geht es über **GitHub Pages**: Repository → Settings → Pages → Branch `main`, Ordner `/ (root)`. Die Startseite leitet auf `app/` weiter.

Projektdateien heißen `*.tracery.json`; ältere `*.masswerk.json` lassen sich weiterhin öffnen.

## Ordner

| Pfad | Inhalt |
| --- | --- |
| `app/index.html` | Fertig gebautes Programm (nicht von Hand ändern) |
| `app/src/` | Quelldateien: `styles.css`, HTML-Gerüst, `js/` mit einem Teil pro Bereich |
| `tools/build.py` | Baut `app/index.html` aus `app/src/` |
| `app/kernel/` | CAD-Kern: Worker, replicad, OpenCascade-Anbindung |
| `app/occ-kernel.wasm` | OpenCascade als WebAssembly |
| `app/lib/three/` | Three.js für die 3D-Ansicht |
| `docs/BAUPLAN.md` | Sitzungsplan mit Prompts |
| `docs/IDEEN.md` | Gesammelte Ideen und Anforderungen |

## Regeln für die Zusammenarbeit

- Jede Bau-Sitzung endet mit einem lauffähigen Stand und einem Commit.
- Nur eine KI schreibt gleichzeitig Code.
- Nichts entfernen, was funktioniert, außer es ist ausdrücklich gewollt.

## Lizenzen

replicad (MIT), OpenCascade (LGPL 2.1 mit Ausnahme), Three.js (MIT). Schrift Inter für das Text-Werkzeug (SIL Open Font License 1.1, siehe `app/data/schrift-LIZENZ.txt`; die Umrisse erzeugt `tools/schrift.py`).

## Ändern und bauen

Geändert wird in `app/src/`, danach `python3 tools/build.py`. Die Teile in `app/src/js/` teilen sich einen gemeinsamen Gültigkeitsbereich; ihre Reihenfolge steht in `tools/build.py`. `python3 tools/build.py --check` prüft, ob `app/index.html` zum Quelltext passt. `python3 tools/build.py --artifact ORDNER` baut die Fassung für die Claude-Seite: ein kleines Seitengerüst plus `tracery.css` und `tracery.js` (dazu `kernel/`, `lib/` und `occ-kernel.wasm` mit veröffentlichen).

## Tests

`tests/klicktest.py` klickt die Punkte aus `docs/TESTLISTE.md` automatisch in einem echten Browser durch (Playwright mit Chromium):

```
cd app && python3 -m http.server 8765 &
cd .. && python3 tests/klicktest.py            # alles
python3 tests/klicktest.py Skizze Zeitleiste   # nur passende Tests
```
