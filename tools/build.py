"""Baut app/index.html aus den Quelldateien in app/src/.

    python3 tools/build.py          # index.html neu bauen
    python3 tools/build.py --check  # nur prüfen, ob index.html aktuell ist
    python3 tools/build.py --artifact ORDNER  # Fassung für die Claude-Seite: kleine Seite + tracery.css + tracery.js

Die Teile werden in genau dieser Reihenfolge zusammengesetzt. Sie teilen sich einen
gemeinsamen Gültigkeitsbereich (ein einziges <script type="module">), deshalb zählt
die Reihenfolge: Was weiter unten steht, darf alles von weiter oben benutzen.
Eine neue Datei muss hier in JS eingetragen werden.
Daten aus app/data werden über /*JSON:name.json*/null beim Bauen eingesetzt.
"""
import hashlib, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
SRC = os.path.join(ROOT, 'src')

JS = [
    '00-util.js', '01-i18n.js', '05-storage.js', '10-model.js', '14-ttf.js', '15-sketchcore.js', '16-solver.js', '17-sketchops.js', '20-kernel.js', '25-app.js',
    '30-viewer.js', '35-handles.js', '40-library.js', '41-dronelib.js', '42-userlib.js', '45-actions.js', '45-clipboard.js', '46-features.js', '46-datums.js', '46-pointclouds.js', '46-reffix.js', '47-mass.js', '48-joints.js',
    '48-viewprefs.js', '48-refine.js', '49-timeline.js', '49-components.js', '49-assembly.js', '49-draginput.js', '49-log.js', '49-notices.js', '49-pwa.js',
    '50-ui-core.js', '51-toolbar.js', '51-ui-panels.js', '52-snap.js', '52-place.js', '53-views.js', '54-select.js', '55-sketch.js', '56-notes.js', '57-measure.js',
    '58-commands.js', '59-versions.js', '60-print.js', '70-drawing.js', '80-ai.js', '84-drone.js', '85-start.js', '86-dronecheck.js', '87-geomcheck.js', '87-clashcheck.js', '87-inspectcheck.js', '88-aihelp.js', '90-main.js',
]


def part(name):
    p = os.path.join(SRC, name)
    txt = open(p, encoding='utf-8').read()
    if txt.endswith('\n'):
        txt = txt[:-1]
    return txt.split('\n')


DATA = os.path.join(ROOT, 'data')


def inline_json(line):
    # /*JSON:datei.json*/null  →  Inhalt der Datei aus app/data (kompakt), damit die Seite ohne Nachladen läuft
    def rep(m):
        with open(os.path.join(DATA, m.group(1)), encoding='utf-8') as f:
            return json.dumps(json.load(f), ensure_ascii=False, separators=(',', ':'))
    return re.sub(r'/\*JSON:([\w.-]+\.json)\*/null', rep, line)


def script_lines():
    out = part('js/imports.js')
    for name in JS:
        if not os.path.exists(os.path.join(SRC, 'js', name)):
            continue  # noch nicht angelegt
        out += ['// ---- ' + name + ' ----'] + [inline_json(l) for l in part('js/' + name)]
    return out


def build():
    out = part('head.html') + ['<style>'] + part('styles.css') + ['</style></head><body>'] + part('body.html')
    out += ['<script type="module">'] + script_lines() + ['</script>'] + part('tail.html')
    return '\n'.join(out)


def build_artifact(folder):
    # Die Claude-Seite bekommt nur ein kleines Gerüst; Programm und Aussehen liegen daneben.
    # So bleibt die Seite selbst zwischen den Sitzungen fast gleich und lässt sich günstig aktualisieren.
    os.makedirs(folder, exist_ok=True)
    page = part('head.html') + ['<link rel="stylesheet" href="tracery.css"></head><body>'] + part('body.html') + ['<script type="module" src="tracery.js"></script>'] + part('tail.html')
    for name, lines in (('index.html', page), ('tracery.css', part('styles.css')), ('tracery.js', script_lines())):
        with open(os.path.join(folder, name), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + ('' if name == 'index.html' else '\n'))
    print(f'Claude-Seite gebaut in {folder}: index.html, tracery.css, tracery.js')


def collect_runtime_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir == 'src' or rel_dir.startswith('src' + os.sep):
            dirnames[:] = []
            continue
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.') and d != '__pycache__')
        for fn in sorted(filenames):
            if fn.startswith('.') or fn in ('sw.js', 'index.html'):
                continue
            full = os.path.join(dirpath, fn)
            files.append(os.path.relpath(full, ROOT).replace(os.sep, '/'))
    files.append('index.html')
    files.sort()
    return files


def build_sw(html):
    files = collect_runtime_files()
    h = hashlib.sha256()
    html_bytes = html.encode('utf-8')
    for rel in files:
        h.update(rel.encode('utf-8'))
        h.update(b'\0')
        if rel == 'index.html':
            h.update(html_bytes)
        else:
            with open(os.path.join(ROOT, rel), 'rb') as f:
                h.update(f.read())
        h.update(b'\0')
    cache_name = 'tracery-offline-' + h.hexdigest()[:12]
    tpl = '\n'.join(part('sw.js')) + '\n'
    tpl = tpl.replace('__CACHE_NAME__', json.dumps(cache_name))
    tpl = tpl.replace('__PRECACHE_FILES__', json.dumps(files, ensure_ascii=False, indent=2))
    return tpl, cache_name, len(files)


def main():
    missing = [f for f in os.listdir(os.path.join(SRC, 'js')) if f.endswith('.js') and f != 'imports.js' and f not in JS]
    if missing:
        sys.exit('Nicht in tools/build.py eingetragen: ' + ', '.join(missing))
    if '--artifact' in sys.argv:
        build_artifact(sys.argv[sys.argv.index('--artifact') + 1])
        return
    html = build()
    sw, _cache_name, sw_count = build_sw(html)
    target = os.path.join(ROOT, 'index.html')
    sw_target = os.path.join(ROOT, 'sw.js')
    if '--check' in sys.argv:
        cur = open(target, encoding='utf-8').read() if os.path.exists(target) else ''
        cur_sw = open(sw_target, encoding='utf-8').read() if os.path.exists(sw_target) else ''
        if cur != html or cur_sw != sw:
            sys.exit('app/index.html oder app/sw.js ist nicht aktuell – bitte python3 tools/build.py ausführen.')
        print('app/index.html ist aktuell (inkl. app/sw.js).')
        return
    open(target, 'w', encoding='utf-8').write(html)
    open(sw_target, 'w', encoding='utf-8').write(sw)
    print(f'app/index.html gebaut: {html.count(chr(10)) + 1} Zeilen aus {len(JS)} Teilen; app/sw.js aktualisiert ({sw_count} Dateien).')


if __name__ == '__main__':
    main()
