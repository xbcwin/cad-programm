# Tracery – CAD für Speed-Drohnen

*Tracery* ist das englische Wort für Maßwerk: die exakt konstruierten Ornamente gotischer Kirchenfenster. Bis Oktober 2026 hieß das Programm „Maßwerk“.

Parametrisches CAD im Browser, spezialisiert auf FPV-/Speed-Drohnen. Exakte Geometrie mit OpenCascade (über replicad, als WebAssembly), Anzeige mit Three.js.

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
| `app/index.html` | Oberfläche und Programmlogik |
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

replicad (MIT), OpenCascade (LGPL 2.1 mit Ausnahme), Three.js (MIT).
