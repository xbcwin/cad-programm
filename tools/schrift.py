"""Schrift für das Text-Werkzeug der Skizze vorbereiten.

Liest eine OTF/TTF-Schrift (z. B. Inter, Lizenz SIL OFL 1.1) und schreibt die Umrisse der
benötigten Zeichen als kleine JSON-Datei nach app/data/. Tracery braucht dadurch keine
Schrift-Bibliothek im Browser.

    python3 tools/schrift.py /usr/share/fonts/opentype/inter/Inter-Regular.otf app/data/schrift-inter.json "Inter"
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen

ZEICHEN = ''.join(chr(c) for c in range(32, 127)) + 'ÄÖÜäöüß€°±Øø×µ²³½¼¾·–—„“”‘’…©®™§'


def num(v):
    r = round(v, 1)
    return str(int(r)) if r == int(r) else str(r)


def glyph_path(gs, name):
    pen = RecordingPen()
    gs[name].draw(pen)
    out = []
    cur = None
    for op, args in pen.value:
        if op == 'moveTo':
            out.append('M ' + ' '.join(num(v) for v in args[0])); cur = args[0]
        elif op == 'lineTo':
            out.append('L ' + ' '.join(num(v) for v in args[0])); cur = args[0]
        elif op == 'curveTo':
            # mehrere Kontrollpunkte (selten) in einzelne Kubiken zerlegen
            pts = list(args)
            while len(pts) > 3:
                c1, c2 = pts[0], pts[1]; m = ((c2[0] + pts[2][0]) / 2, (c2[1] + pts[2][1]) / 2)
                out.append('C ' + ' '.join(num(v) for p in (c1, c2, m) for v in p)); pts = pts[2:]; cur = m
            out.append('C ' + ' '.join(num(v) for p in pts for v in p)); cur = pts[-1]
        elif op == 'qCurveTo':
            pts = list(args)
            # TrueType: implizite Mittelpunkte, in Kubiken umrechnen
            for i in range(len(pts) - 1):
                q = pts[i]
                e = pts[i + 1] if i == len(pts) - 2 else ((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
                c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]))
                c2 = (e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]))
                out.append('C ' + ' '.join(num(v) for p in (c1, c2, e) for v in p)); cur = e
        elif op in ('closePath', 'endPath'):
            out.append('Z')
    return ' '.join(out)


def main(src, dst, name):
    f = TTFont(src)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f['head'].unitsPerEm
    os2 = f['OS/2']
    glyphs = {}
    for ch in ZEICHEN:
        g = cmap.get(ord(ch))
        if not g:
            continue
        glyphs[ch] = {'w': f['hmtx'][g][0], 'p': glyph_path(gs, g)}
    # einfache Unterschneidung aus GPOS ist aufwendig – Tracery nutzt die Laufweite
    data = {
        'name': name,
        'lizenz': 'SIL Open Font License 1.1 – Copyright 2016-2023 The Inter Project Authors (https://github.com/rsms/inter). Umrisse unverändert übernommen.',
        'em': upm, 'cap': getattr(os2, 'sCapHeight', 0) or upm * 0.7, 'asc': os2.sTypoAscender, 'desc': os2.sTypoDescender,
        'glyphs': glyphs,
    }
    with open(dst, 'w') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print(dst, len(glyphs), 'Zeichen')


if __name__ == '__main__':
    main(*sys.argv[1:4])
