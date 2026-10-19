"""Baut app/index.html aus den Quelldateien in app/src/.

    python3 tools/build.py          # index.html neu bauen
    python3 tools/build.py --check  # nur prüfen, ob index.html aktuell ist

Die Teile werden in genau dieser Reihenfolge zusammengesetzt. Sie teilen sich einen
gemeinsamen Gültigkeitsbereich (ein einziges <script type="module">), deshalb zählt
die Reihenfolge: Was weiter unten steht, darf alles von weiter oben benutzen.
Eine neue Datei muss hier in JS eingetragen werden.
"""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
SRC = os.path.join(ROOT, 'src')

JS = [
    '00-util.js', '10-model.js', '15-sketchcore.js', '16-solver.js', '17-sketchops.js', '20-kernel.js', '25-app.js',
    '30-viewer.js', '35-handles.js', '40-library.js', '45-actions.js', '46-features.js', '47-mass.js',
    '48-viewprefs.js', '48-refine.js', '49-timeline.js', '49-components.js', '49-draginput.js', '49-log.js',
    '50-ui-core.js', '51-ui-panels.js', '52-place.js', '53-views.js', '54-select.js', '55-sketch.js', '56-notes.js', '57-measure.js',
    '58-commands.js', '59-versions.js', '60-print.js', '70-drawing.js', '80-ai.js', '84-drone.js', '85-start.js', '90-main.js',
]


def part(name):
    p = os.path.join(SRC, name)
    txt = open(p, encoding='utf-8').read()
    if txt.endswith('\n'):
        txt = txt[:-1]
    return txt.split('\n')


def build():
    out = part('head.html') + ['<style>'] + part('styles.css') + ['</style>'] + part('body.html')
    out += ['<script type="module">'] + part('js/imports.js')
    for name in JS:
        if not os.path.exists(os.path.join(SRC, 'js', name)):
            continue  # noch nicht angelegt
        out += ['// ---- ' + name + ' ----'] + part('js/' + name)
    out += ['</script>'] + part('tail.html')
    return '\n'.join(out)


def main():
    missing = [f for f in os.listdir(os.path.join(SRC, 'js')) if f.endswith('.js') and f != 'imports.js' and f not in JS]
    if missing:
        sys.exit('Nicht in tools/build.py eingetragen: ' + ', '.join(missing))
    html = build()
    target = os.path.join(ROOT, 'index.html')
    if '--check' in sys.argv:
        cur = open(target, encoding='utf-8').read()
        if cur != html:
            sys.exit('app/index.html ist nicht aktuell – bitte python3 tools/build.py ausführen.')
        print('app/index.html ist aktuell.')
        return
    open(target, 'w', encoding='utf-8').write(html)
    print(f'app/index.html gebaut: {html.count(chr(10)) + 1} Zeilen aus {len(JS)} Teilen.')


if __name__ == '__main__':
    main()
