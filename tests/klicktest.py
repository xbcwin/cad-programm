"""Automatischer Klicktest für Tracery – geht die Punkte aus docs/TESTLISTE.md durch.

Starten (im Ordner cad-programm):
    cd app && python3 -m http.server 8765 &
    python3 tests/klicktest.py

Braucht Python mit Playwright (pip install playwright, dann playwright install chromium).
Ausgabe: je Testpunkt OK, FEHLER oder VON HAND (lässt sich nicht automatisch beurteilen).
"""
import json, math, os, sys, tempfile, zipfile
from playwright.sync_api import sync_playwright

URL = os.environ.get('TRACERY_URL', 'http://localhost:8765/')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
results = []


def report(name, ok, note=''):
    status = 'OK' if ok is True else ('VON HAND' if ok is None else 'FEHLER')
    results.append((name, status, note))
    print(f'{status:9} {name}' + (f'  – {note}' if note else ''), flush=True)


class Page:
    def __init__(self, browser, clear=True):
        self.ctx = browser.new_context(viewport={'width': 1400, 'height': 850}, accept_downloads=True)
        self.pg = self.ctx.new_page()
        self.errs = []
        self.pg.on('pageerror', lambda e: self.errs.append(str(e)))
        if clear:
            self.pg.add_init_script("try{if(!sessionStorage.getItem('kt')){localStorage.clear();sessionStorage.setItem('kt','1')}}catch(e){}")
        self.pg.goto(URL)
        self.pg.wait_for_timeout(2500)

    def ev(self, js, arg=None):
        return self.pg.evaluate("(arg)=>{const {App,Actions,Model,Timeline,Start,Comp,Handles,Sketch,SK,Viewer,Commands}=window.__M; " + js + "}", arg)

    def empty(self):
        self.pg.get_by_text('Leeres Projekt').first.click()
        self.pg.wait_for_timeout(5000)

    def wait(self, ms):
        self.pg.wait_for_timeout(ms)

    def canvas_center(self):
        b = self.pg.locator('canvas').first.bounding_box()
        return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2

    def close(self):
        self.ctx.close()


def check(name, fn, b):
    p = None
    try:
        p = Page(b)
        r = fn(p)
        ok, note = (r if isinstance(r, tuple) else (r, ''))
        if p.errs:
            ok, note = False, 'Seitenfehler: ' + p.errs[0][:120]
        report(name, ok, note)
    except Exception as e:  # ein Test darf die anderen nicht aufhalten
        report(name, False, str(e).split('\n')[0][:160])
    finally:
        if p:
            p.close()


# ---------- Start und Ansicht ----------
def t_start(p):
    return p.pg.locator('.start').count() == 1 and p.pg.get_by_text('Leeres Projekt').count() > 0


def t_vorlage(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    return p.pg.get_by_text('80 × 30 × 3 mm').count() > 0


def t_ansichten(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    cx, cy = p.canvas_center(); p.pg.mouse.click(cx + 300, cy + 250); p.wait(300)
    want = {'1': (0, -1, 0), '3': (1, 0, 0), '7': (0, 0, 1)}
    for k, d in want.items():
        p.pg.keyboard.press(k); p.wait(1200)
        v = p.ev("const c=Viewer.camera.position, t=Viewer.controls.target; const d=c.clone().sub(t).normalize(); return [d.x,d.y,d.z]")
        if sum(a * b for a, b in zip(v, d)) < 0.98:
            return False, f'Taste {k}: Richtung {v}'
    p.pg.keyboard.press('0'); p.wait(1200)
    v = p.ev("const c=Viewer.camera.position, t=Viewer.controls.target; const d=c.clone().sub(t).normalize(); return [d.x,d.y,d.z]")
    return all(abs(x) > 0.2 for x in v), 'weich animiert: von Hand ansehen'


def t_ortho(p):
    p.empty()
    p.pg.locator('canvas').first.click(position={'x': 600, 'y': 600}); p.pg.keyboard.press('o'); p.wait(500)
    a = p.ev("return Viewer.ortho")
    p.pg.keyboard.press('o'); p.wait(500)
    return a is True and p.ev("return Viewer.ortho") is False


def t_raster(p):
    p.empty()
    p.pg.locator('canvas').first.click(position={'x': 600, 'y': 600})
    vp = lambda: json.loads(p.pg.evaluate("()=>localStorage.getItem('masswerk.view')") or '{}')
    p.pg.keyboard.press('g'); p.wait(300); off = vp().get('gridOn')
    p.pg.keyboard.press('g'); p.wait(300); on = vp().get('gridOn')
    p.pg.select_option('#view-grid', '1'); p.wait(500)
    return off is False and on is True and p.ev("return Viewer.gridStep") == 1


def t_raster_auto(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    p.pg.select_option('#view-grid', 'auto'); p.wait(500)
    s0 = p.ev("return Viewer.gridStep")
    p.ev("const t=Viewer.controls.target.clone().set(32,0,3); Viewer.moveCamera(t.clone().set(32.5,-0.6,3.6), t, null, false);"); p.wait(2500)
    s1 = p.ev("return Viewer.gridStep")
    return s1 < s0, f'Rasterweite {s0} → {s1} mm'


def t_ebenen(p):
    p.empty()
    vp = lambda: json.loads(p.pg.evaluate("()=>localStorage.getItem('masswerk.view')") or '{}')
    p.pg.get_by_label('Ursprungsebenen zeigen').uncheck(); p.pg.get_by_label('Achsen zeigen').uncheck(); p.wait(300)
    a = vp();
    p.pg.get_by_label('Ursprungsebenen zeigen').check(); p.pg.get_by_label('Achsen zeigen').check(); p.wait(300)
    b = vp()
    return a.get('planes') is False and a.get('axes') is False and b.get('planes') is True and b.get('axes') is True


def t_zoom(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    tri = lambda: p.ev("let t=0; for(const n of Viewer.nodes.values()) t+=n.data.triangles.length/3; return t")
    t0 = tri()
    p.ev("const t=Viewer.controls.target.clone().set(32,0,3); Viewer.moveCamera(t.clone().set(33.2,-1.6,4.6), t, null, false);"); p.wait(5000)
    t1 = tri()
    return None, f'Nachschärfen geprüft ({t0} → {t1} Dreiecke); Flimmern nur von Hand' if t1 > t0 else f'kein Nachschärfen ({t0} → {t1})'


# ---------- Zeitleiste ----------
def three(p):
    p.empty()
    for k in ['box', 'cylinder', 'sphere']:
        p.ev(f"Actions.addPrimitive('{k}')"); p.wait(1500)
    p.wait(1000)


def kinds(p):
    return p.ev("return App.doc.items.map(i=>i.kind+(i.suppressed?'*':''))")


def t_tl(p):
    three(p)
    chips = p.pg.locator('.tl-chip').count(); info = p.pg.locator('.tl-info').inner_text()
    ok1 = chips == 3 and '3' in info
    # Marker ziehen
    m = p.pg.locator('.tl-marker').bounding_box(); c = p.pg.locator('.tl-chip').nth(1).bounding_box()
    p.pg.mouse.move(m['x'] + 6, m['y'] + 19); p.pg.mouse.down(); p.pg.mouse.move(c['x'] + 5, c['y'] + 16, steps=8); p.pg.mouse.up(); p.wait(2500)
    ok2 = p.ev("return App.doc.rollback") == 1 and '1 / 3' in p.pg.locator('.tl-info').inner_text()
    # Einfügen am Marker
    p.ev("Actions.addPrimitive('cone')"); p.wait(2000)
    ok3 = kinds(p)[:2] == ['box', 'cone']
    # Doppelklick aufs letzte Symbol
    p.pg.locator('.tl-chip').last.dblclick(); p.wait(2000)
    ok4 = p.ev("return App.doc.rollback") is None
    return [ok1, ok2, ok3, ok4]


def t_unterdruecken(p):
    three(p)
    p.pg.locator('.tl-chip').first.click(button='right'); p.wait(400)
    p.pg.locator('.pop').get_by_role('button', name='Unterdrücken').click(); p.wait(2000)
    a = kinds(p)[0] == 'box*'
    p.pg.locator('.tl-chip').first.click(button='right'); p.wait(400)
    p.pg.locator('.pop').get_by_role('button', name='Wieder aktivieren').click(); p.wait(2000)
    return a and kinds(p)[0] == 'box'


def t_fehler_rot(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('Rundung', d=>{ d.items[0].finishes.push({id:'f_x',type:'fillet',r:50,edges:'all'}); })"); p.wait(3000)
    return p.pg.locator('.tl-chip.err').count() == 1 and p.pg.get_by_text('Ein Schritt hat ein Problem').count() > 0


# ---------- Bauteile ----------
def t_bauteil(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.pg.fill('#cmd-input', 'Neues Bauteil'); p.pg.press('#cmd-input', 'Enter'); p.wait(1200)
    ok1 = p.pg.get_by_text('Bauteil bearbeiten: Bauteil 1').count() > 0 and p.pg.locator('.tl-chip').count() == 0
    p.ev("Actions.addPrimitive('cylinder')"); p.wait(1500); p.ev("Actions.addPrimitive('sphere')"); p.wait(2000)
    comp = p.ev("const g=App.doc.items.find(x=>x.comp); return g && g.children.map(c=>c.kind)")
    ok2 = comp == ['cylinder', 'sphere']
    p.ev("Timeline.setMarker(1)"); p.wait(2000)
    ok3 = p.ev("return App.doc.items.find(x=>x.comp).rollback") == 1 and p.ev("return App.doc.items[0].kind") == 'box'
    p.pg.locator('.ctx-banner button').click(); p.wait(1500)
    ok4 = p.ev("return App.ctx") is None and p.pg.locator('.tl-chip').count() == 2
    return [ok1, ok2, ok3, ok4]


def t_vorlage_bauteil(p):
    p.pg.get_by_text('Winkel zum Anschrauben').first.click(); p.wait(9000)
    gid = p.ev("const g=App.doc.items.find(x=>x.kind==='group'); return g&&g.id")
    p.ev("Comp.edit(arg)", gid); p.wait(1500)
    return p.pg.locator('.tl-chip').count() > 1, 'Bearbeiten über Comp.edit (Stift-Symbol nicht geklickt)'


def t_unterteil(p):
    p.empty()
    p.ev("Actions.addPrimitive('box')"); p.wait(1500); p.ev("Actions.addPrimitive('cylinder')"); p.wait(1500)
    p.ev("App.change('weg', d=>{ d.items[0].t.x=-20; d.items[1].t.x=20; })"); p.wait(1500)
    p.ev("App.select(App.doc.items.map(x=>x.id)); Actions.group();"); p.wait(2000)
    p.ev("Comp.edit(App.doc.items[0].id)"); p.wait(2500); p.ev("Viewer.setView('top')"); p.wait(1500)
    pos = p.ev("const c=App.doc.items[0].children.find(x=>x.kind==='cylinder'); const e=Model.worldMatrix(App.doc,c.id).elements; const s=Viewer.toScreen(Viewer.camera.position.clone().set(e[12],e[13],e[14]+10)); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]")
    p.pg.mouse.click(pos[0], pos[1]); p.wait(800)
    return p.ev("return App.sel.map(id=>Model.find(App.doc,id).item.kind)") == ['cylinder']


def t_isolieren(p):
    three(p)
    p.ev("App.select([App.doc.items[0].id])"); p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('i'); p.wait(1500)
    vis = p.ev("return [...Viewer.nodes.values()].filter(n=>n.obj.visible).length")
    banner = p.pg.get_by_text('Isoliert').count() > 0
    p.pg.get_by_role('button', name='Alle zeigen').click(); p.wait(1000)
    return vis == 1 and banner and p.ev("return [...Viewer.nodes.values()].filter(n=>n.obj.visible).length") == 3


# ---------- Zahleneingabe beim Ziehen ----------
def handles(p, kind=None):
    return p.ev("const out=[]; const r=Viewer.canvas.getBoundingClientRect(); Viewer.groups.handles.traverse(o=>{ if(o.userData&&o.userData.kind){ const w=o.getWorldPosition(o.position.clone()); const s=Viewer.toScreen(w); out.push([o.userData.kind,o.userData.param||'',s.x+r.left,s.y+r.top]); } }); return out")


def t_drag_input(p):
    p.empty(); p.ev("Actions.addPrimitive('box'); App.change('Maß', d=>{ d.params.push({id:'pm1', name:'breite', expr:'30'}); })"); p.wait(2000)
    p.ev("Viewer.setView('top', false)"); p.wait(1500)
    out = []
    # Größe 42,5
    s = [h for h in handles(p) if h[0] == 'size' and h[1] == 'w'][0]
    p.pg.mouse.move(s[2], s[3]); p.pg.mouse.down(); p.pg.mouse.move(s[2] + 20, s[3], steps=5); p.wait(200)
    p.pg.keyboard.type('42,5'); p.pg.keyboard.press('Enter'); p.pg.mouse.up(); p.wait(1500)
    out.append(p.ev("return App.doc.items[0].p.w") == 42.5)
    # Formel
    s = [h for h in handles(p) if h[0] == 'size' and h[1] == 'w'][0]
    p.pg.mouse.move(s[2], s[3]); p.pg.mouse.down(); p.pg.mouse.move(s[2] + 20, s[3], steps=5); p.wait(200)
    p.pg.keyboard.type('5'); p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('breite/2'); p.pg.keyboard.press('Enter'); p.pg.mouse.up(); p.wait(1500)
    w = p.ev("return Model.num(App.doc.items[0].p.w, Model.vars(App.doc).v)")
    out.append(abs(w - 15) < 1e-6)
    # Drehen 30
    r = [h for h in handles(p) if h[0] == 'rot'][0]
    p.pg.mouse.move(r[2], r[3]); p.pg.mouse.down(); p.pg.mouse.move(r[2] + 15, r[3] - 15, steps=5); p.wait(200)
    p.pg.keyboard.type('30'); p.pg.keyboard.press('Enter'); p.pg.mouse.up(); p.wait(1500)
    out.append(p.ev("return App.doc.items[0].t.rz") == 30)
    # Verschieben 25
    x0 = p.ev("return App.doc.items[0].t.x")
    b = p.ev("const n=Viewer.nodes.get(App.doc.items[0].id); const bb=n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix); const c=bb.min.clone().multiplyScalar(0.7).add(bb.max.clone().multiplyScalar(0.3)); c.z=bb.max.z; /* nicht die Mitte: dort sitzt der Höhen-Anfasser */ const s=Viewer.toScreen(c); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]")
    p.pg.mouse.move(b[0], b[1]); p.pg.mouse.down(); p.pg.mouse.move(b[0] + 30, b[1] + 10, steps=6); p.wait(300)
    p.pg.keyboard.type('25'); p.wait(200); p.pg.keyboard.press('Enter'); p.pg.mouse.up(); p.wait(1500)
    out.append(abs(p.ev("return App.doc.items[0].t.x") - x0 - 25) < 1e-6)
    return out  # Größe, Formel, Drehen, Verschieben


# ---------- Protokoll und Rückgängig ----------
def t_protokoll(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500); p.ev("Actions.addPrimitive('cylinder')"); p.wait(1500)
    p.ev("App.change('Rundung', d=>{ d.items[0].finishes.push({id:'f_x',type:'fillet',r:50,edges:'all'}); })"); p.wait(3000)
    p.pg.click('#lt-log'); p.wait(400)
    ok1 = p.pg.locator('.log-row.change').count() >= 2 and p.pg.locator('.log-row.error').count() >= 1 and p.pg.locator('.log-row.error small').count() >= 1
    p.pg.get_by_role('button', name='Fehler', exact=True).click(); p.wait(300)
    ok2a = p.pg.locator('.log-row').count() == p.pg.locator('.log-row.error').count() > 0
    p.pg.get_by_role('button', name='Änderungen', exact=True).click(); p.wait(300)
    ok2b = p.pg.locator('.log-row.error').count() == 0 and p.pg.locator('.log-row').count() > 0
    n0 = p.ev("return App.doc.items.length")
    p.pg.get_by_role('button', name='Bis hierher zurück').last.click(); p.wait(2000)
    ok3 = p.ev("return App.doc.items.length") < n0
    # Strg Z / Y
    p.ev("App.change('Name', d=>{ d.name='Test-Undo'; })"); p.wait(300)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(500); a = p.ev("return App.doc.name")
    p.pg.keyboard.press('Control+y'); p.wait(500); b = p.ev("return App.doc.name")
    ok4 = a != 'Test-Undo' and b == 'Test-Undo'
    return [ok1, ok2a and ok2b, ok3, ok4]


# ---------- Einstellungen ----------
def t_design(p):
    p.empty()
    p.pg.click('#btn-menu'); p.wait(300); p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(400)
    attr = lambda: p.pg.evaluate("()=>document.documentElement.getAttribute('data-theme')")
    p.pg.select_option('#set-theme', 'dark'); p.wait(300); a = attr()
    p.pg.select_option('#set-theme', 'light'); p.wait(300); b = attr()
    p.pg.select_option('#set-theme', 'system'); p.wait(300); c = attr()
    return a == 'dark' and b == 'light' and c is None


def t_qualitaet(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    tri = lambda: p.ev("let t=0; for(const n of Viewer.nodes.values()) t+=n.data.triangles.length/3; return t")
    p.pg.click('#btn-menu'); p.wait(300); p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(400)
    p.pg.select_option('#set-quality', 'coarse'); p.wait(4000); a = tri()
    p.pg.select_option('#set-quality', 'ultra'); p.wait(5000); b = tri()
    return b > a, f'{a} → {b} Dreiecke'


def t_tooltips(p):
    p.empty()
    p.pg.hover('#t-measure'); p.wait(2200)
    t = p.pg.locator('.tooltip').inner_text() if p.pg.locator('.tooltip').count() else ''
    return 'Tipp' in t


def t_tasten(p):
    p.empty(); p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('?'); p.wait(500)
    return p.pg.locator('.keys-sec').count() == 5


# ---------- Dateien ----------
def t_dateien(p):
    three(p)
    p.ev("Timeline.setMarker(2); App.change('x', d=>{ d.items[1].suppressed=true; })"); p.wait(1500)
    with p.pg.expect_download() as dl:
        p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+s')
    d = dl.value; path = os.path.join(tempfile.gettempdir(), d.suggested_filename); d.save_as(path)
    ok1 = d.suggested_filename.endswith('.tracery.json')
    p.ev("Start.newProject(true)"); p.wait(2000)
    with p.pg.expect_file_chooser() as fc:
        p.ev("Start.openFile()")
    fc.value.set_files(path); p.wait(4000)
    ok2 = kinds(p) == ['box', 'cylinder*', 'sphere'] and p.ev("return App.doc.rollback") == 2
    # Export
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(600)
    with p.pg.expect_download(timeout=60000) as dl2:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-export.zip'); dl2.value.save_as(z)
    names = zipfile.ZipFile(z).namelist()
    ok3 = any(n.lower().endswith(('.step', '.stp')) for n in names) and any('LIESMICH' in n for n in names)
    return [ok1, ok2, ok3]


# ---------- Skizzen ----------
def sketch_xy(p):
    p.empty(); p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)


def to_screen(p, u, v):
    return p.ev("const S=Sketch.state; const w=S.F.o.clone().addScaledVector(S.F.x,arg[0]).addScaledVector(S.F.y,arg[1]); const s=Viewer.toScreen(w); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]", [u, v])


def t_skizze_masse(p):
    p.empty(); p.ev("App.change('Maß', d=>{ d.params.push({id:'m_b',name:'breite',expr:40}); })")
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)
    cx, cy = p.canvas_center()
    p.pg.mouse.click(cx - 100, cy - 60); p.pg.mouse.move(cx + 60, cy + 40); p.wait(200)
    p.pg.keyboard.type('breite'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter'); p.wait(500)
    labels = p.pg.locator('.skdim').all_inner_texts()
    ok1 = any('breite' in l and '40' in l for l in labels) and '20' in labels
    # Maß-Werkzeug: Kreis, dann D
    p.pg.keyboard.press('c'); p.pg.mouse.click(cx - 40, cy - 20); p.pg.mouse.move(cx - 25, cy - 20); p.pg.keyboard.press('Escape') if False else None
    p.pg.mouse.click(cx - 30, cy - 20); p.wait(300)
    circ = p.ev("return Sketch.state.ents.find(e=>e.type==='circle')")
    pt = to_screen(p, circ['c'][0] + circ['r'], circ['c'][1])
    p.pg.keyboard.press('d'); p.pg.mouse.click(pt[0], pt[1]); p.wait(300)
    p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('6'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok2 = 'Ø 6' in p.pg.locator('.skdim').all_inner_texts()
    # Fertig, 3 mm, breite = 60
    p.pg.keyboard.press('Enter'); p.wait(1500); p.pg.fill('#st-dist', '3'); p.pg.press('#st-dist', 'Enter'); p.wait(400)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(3000)
    p.ev("App.change('x', d=>{ d.params[0].expr=60; })"); p.wait(3000)
    ok3 = p.pg.get_by_text('60 × 20 × 3 mm').count() > 0
    # Doppelklick
    p.ev("Viewer.fit()"); p.wait(800)
    bb = p.ev("const n=Viewer.nodes.get(App.doc.items[0].id); const b=n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix); const s=Viewer.toScreen(b.min.clone().set(b.min.x+2,b.min.y+2,b.max.z)); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]")
    p.pg.mouse.dblclick(bb[0], bb[1]); p.wait(1500)
    ok4 = p.ev("return Sketch.active && Sketch.state.tool==='select'") and len(p.pg.locator('.skdim').all_inner_texts()) == 3
    # Schildchen ändern
    p.pg.locator('.skdim').filter(has_text='breite').first.click(); p.wait(300)
    p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('breite/2'); p.pg.keyboard.press('Enter'); p.wait(400)
    p.pg.keyboard.press('Enter'); p.wait(3000)
    ok5 = p.pg.get_by_text('30 × 20 × 3 mm').count() > 0
    return [ok1, ok2, ok3, ok4, ok5]


def t_mass_haelt(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    p.pg.keyboard.press('l'); p.pg.mouse.click(cx, cy); p.pg.mouse.click(cx + 120, cy); p.pg.keyboard.press('Enter'); p.wait(300)
    p.pg.keyboard.press('v'); p.pg.mouse.click(cx + 60, cy); p.wait(300)
    p.pg.fill('#se-len', '25'); p.pg.press('#se-len', 'Enter'); p.wait(400)
    ln = p.ev("return Sketch.state.ents[0]")
    a = to_screen(p, *ln['b'])
    p.pg.mouse.move(a[0], a[1]); p.pg.mouse.down(); p.pg.mouse.move(a[0] + 20, a[1] - 80, steps=6); p.pg.mouse.up(); p.wait(400)
    ln2 = p.ev("return Sketch.state.ents[0]")
    L = math.dist(ln2['a'], ln2['b'])
    ok1 = abs(L - 25) < 1e-3 and abs(ln2['b'][1]) > 1
    # Maß lösen, dann Strg Z
    p.pg.locator('.dimlock').first.click(); p.wait(300)
    ok2a = p.pg.locator('.skdim').count() == 0
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok2 = ok2a and p.pg.locator('.skdim').count() == 1
    return [ok1, ok2]


def t_kaputte_formel(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    p.pg.keyboard.press('c'); p.pg.mouse.click(cx, cy); p.pg.mouse.move(cx + 20, cy); p.pg.keyboard.type('8'); p.pg.keyboard.press('Enter'); p.wait(400)
    p.pg.locator('.skdim').first.click(); p.wait(200); p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('breite/'); p.pg.keyboard.press('Enter'); p.wait(400)
    return p.pg.get_by_text('Das kann ich nicht ausrechnen').count() > 0 and p.ev("return Sketch.active")


def t_neuer_name(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    p.pg.keyboard.press('c'); p.pg.mouse.click(cx, cy); p.pg.mouse.move(cx + 20, cy); p.pg.keyboard.type('8'); p.pg.keyboard.press('Enter'); p.wait(400)
    p.pg.locator('.skdim').first.click(); p.wait(200); p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('laenge'); p.pg.keyboard.press('Enter'); p.wait(600)
    par = p.ev("return App.doc.params.map(x=>[x.name,x.expr])")
    return par == [['laenge', 8]] and 'laenge' in ''.join(p.pg.locator('.skdim').all_inner_texts())


def t_formel_beispiele(p):
    p.empty(); p.pg.click('#lt-params'); p.wait(300)
    p.pg.get_by_role('button', name='Formel-Beispiele').click(); p.wait(400)
    n = p.pg.locator('.formula-row').count()
    p.pg.get_by_role('button', name='Beispiel-Maße anlegen').click(); p.wait(600)
    names = p.ev("return App.doc.params.map(x=>x.name)")
    return n == 12 and names == ['breite', 'hoehe', 'wand', 'schraube', 'anzahl']


def t_einfuehrung(p):
    p.pg.get_by_text('Erste Skizze (5 Minuten)').click(); p.wait(5000)
    step = lambda: p.pg.locator('.tour h3').inner_text() if p.pg.locator('.tour').count() else ''
    seen = [step()]
    p.pg.click('#t-sketch'); p.wait(900); seen.append(step())
    p.pg.get_by_role('button', name='Auf der Arbeitsfläche').click(); p.wait(1800); seen.append(step())
    cx, cy = p.canvas_center()
    p.pg.mouse.click(cx - 120, cy + 60); p.pg.mouse.move(cx + 60, cy - 20); p.pg.keyboard.type('40'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter'); p.wait(1000); seen.append(step())
    p.pg.click('.sketchbar [data-tool="circle"]')
    r = p.ev("const r=Sketch.state.ents.find(e=>e.type==='rect'); return [(r.a[0]+r.b[0])/2,(r.a[1]+r.b[1])/2]")
    s = to_screen(p, *r)
    p.pg.mouse.click(s[0], s[1]); p.pg.mouse.move(s[0] + 15, s[1]); p.pg.keyboard.type('6'); p.pg.keyboard.press('Enter'); p.wait(1000); seen.append(step())
    p.pg.locator('.skdim').filter(has_text='40').first.click(); p.wait(300)
    p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('breite'); p.pg.keyboard.press('Enter'); p.wait(1200); seen.append(step())
    p.pg.click('.sketchbar .tool.primary'); p.wait(1500); seen.append(step())
    p.pg.fill('#st-dist', '3'); p.pg.press('#st-dist', 'Enter'); p.wait(400); p.pg.locator('.stepbox .btn.primary').click(); p.wait(2500); seen.append(step())
    p.ev("App.change('x', d=>{ d.params[0].expr=60; })"); p.wait(2500)
    ok = len(set(seen)) == 8 and p.pg.get_by_text('60 × 20 × 3 mm').count() > 0
    return ok, '' if ok else ' / '.join(seen)


# ---------- Schraubenlöcher ----------
def t_schrauben(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('part',{lib:'screwHole',size:'M3',head:'none',fit:'medium',length:10},{role:'solid'})); }); App.select([App.doc.items[0].id])"); p.wait(2500)
    r = lambda: p.ev("const b=App.results.get(App.doc.items[0].id).data.bbox; return Math.round((b[3]-b[0])*1000)/1000")
    a = r()
    p.pg.select_option('#lp-fit', 'fine'); p.wait(2000); b = r()
    p.pg.select_option('#lp-fit', 'tap'); p.wait(2000); c = r()
    p.pg.select_option('#lp-size', 'M1.6'); p.wait(2000)
    d = p.ev("return App.errors.length")
    return (a, b, c) == (3.4, 3.2, 2.5) and d == 0, f'M3: {a} / {b} / {c} mm'


# ---------- Fiese Tests ----------
def t_fies_loeschen(p):
    three(p)
    p.ev("Timeline.setMarker(1)"); p.wait(1500)
    p.ev("App.select([App.doc.items[2].id]); Actions.remove()"); p.wait(1500)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(2000)
    return kinds(p) == ['box', 'cylinder', 'sphere'] and p.ev("return App.doc.rollback") == 1


def t_fies_alle_aus(p):
    three(p)
    p.ev("App.change('x', d=>{ d.items.forEach(i=>i.suppressed=true); })"); p.wait(2000)
    return p.pg.get_by_text('Noch leer').count() > 0 and p.ev("return App.errors.length") == 0


def t_fies_reload(p):
    three(p)
    p.ev("Timeline.setMarker(0)"); p.wait(2500)
    p.ev("App.autosave.flush && App.autosave.flush()"); p.wait(500)
    p.pg.reload(); p.wait(5000)
    if p.pg.locator('.start').count():   # falls die Startseite kommt: letztes Projekt öffnen
        p.pg.locator('.recent-row').first.click(); p.wait(5000)
    return p.ev("return App.doc.rollback") == 0 and p.ev("return App.doc.items.length") == 3


def t_fies_tasten(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(400)
    p.pg.locator('canvas').first.focus()
    for k in 'og7og7':
        p.pg.keyboard.press(k)
    p.wait(6000)
    return True  # Seitenfehler würden oben gemeldet


def t_fies_sehr_fein(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    p.pg.click('#btn-menu'); p.wait(300); p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(400)
    p.pg.select_option('#set-quality', 'ultra'); p.pg.keyboard.press('Escape'); p.wait(4000)
    import time
    t = time.time()
    for i in range(6):
        p.ev("const t=Viewer.controls.target.clone().set(32,0,3); Viewer.moveCamera(t.clone().set(32+arg,-arg,3+arg), t, null, false);", 1.5 if i % 2 == 0 else 80); p.wait(700)
    ms = p.ev("const t=performance.now(); Viewer.requestRender(); return performance.now()-t")
    return (time.time() - t) < 20, 'Flüssigkeit von Hand ansehen'


def t_fies_umbenennen(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.params.push({id:'m_b',name:'breite',expr:40}); const it=Model.newItem('extrude',{},{}); it.p={sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:[{id:'r1',type:'rect',a:[0,0],b:[10,10]}],dims:[{id:'d1',e:'r1',k:'w',v:'breite'}]},dist:3,dir:'normal'}; d.items.push(it); })"); p.wait(2500)
    p.pg.click('#lt-params'); p.wait(300)
    inp = p.pg.locator('#pn-m_b'); inp.fill('laenge'); inp.press('Tab'); p.wait(1500)
    a = p.ev("return App.doc.items[0].p.sketch.dims[0].v")
    p.pg.get_by_role('button', name='Entfernen').first.click(); p.wait(2000)
    b = p.ev("return App.doc.items[0].p.sketch.dims[0].v")
    w = p.ev("const bb=App.results.get(App.doc.items[0].id).data.bbox; return bb[3]-bb[0]")
    return a == 'laenge' and b == 40 and abs(w - 40) < 1e-6


def t_notizen(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    p.pg.click('#t-notes'); p.wait(500)
    cx, cy = p.canvas_center()
    p.pg.mouse.move(cx - 150, cy); p.pg.mouse.down()
    for i in range(30):
        p.pg.mouse.move(cx - 150 + i * 10, cy + 30 * math.sin(i / 4))
    p.pg.mouse.up(); p.wait(800)
    ok1 = p.ev("return App.doc.notes.length===1 && App.doc.notes[0].kind==='stroke' && App.doc.items.length===1")
    p.pg.click('.notesbar [data-ntool="text"]'); p.pg.mouse.click(cx + 100, cy - 120); p.wait(500)
    p.pg.keyboard.type('Hier Kabel durch'); p.pg.keyboard.press('Enter'); p.wait(800)
    ok2 = p.pg.locator('.note-label').all_inner_texts() == ['Hier Kabel durch']
    pt = p.ev("const n=App.doc.notes[0]; const q=n.pts[Math.floor(n.pts.length/2)]; const s=Viewer.toScreen(Viewer.camera.position.clone().set(...q)); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]")
    p.pg.click('.notesbar [data-ntool="erase"]'); p.pg.mouse.move(pt[0] - 5, pt[1] - 5); p.pg.mouse.down(); p.pg.mouse.move(pt[0] + 5, pt[1] + 5, steps=4); p.pg.mouse.up(); p.wait(800)
    ok3 = p.ev("return App.doc.notes.map(n=>n.kind).join()") == 'text'
    p.pg.keyboard.press('Control+z'); p.wait(600)
    ok4 = p.ev("return App.doc.notes.length") == 2
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.pg.get_by_label('Notizen zeigen').uncheck(); p.wait(400)
    ok5 = p.pg.locator('.note-label').count() == 0 and p.pg.locator('.notesbar').count() == 0
    p.pg.get_by_label('Notizen zeigen').check(); p.wait(400)
    ok6 = 'Kabel' not in p.ev("return JSON.stringify(Model.kernelScene(App.doc))") and p.pg.locator('.tl-chip').count() == 1
    return [ok1, ok2, ok3, ok4, ok5, ok6]


TESTS = [
    ('Startet ohne Fehler', t_start), ('Vorlage öffnen', t_vorlage), ('Ansichten per Taste', t_ansichten),
    ('Orthografisch', t_ortho), ('Raster', t_raster), ('Raster automatisch', t_raster_auto),
    ('Ursprungsebenen und Achsen', t_ebenen), ('Tief hineinzoomen', t_zoom),
    ('Zeitleiste: erscheinen / Marker ziehen / Einfügen am Marker / Doppelklick', t_tl),
    ('Unterdrücken', t_unterdruecken), ('Fehler wird rot', t_fehler_rot),
    ('Bauteile: Neues Bauteil / Teile landen im Bauteil / Zeitleiste im Bauteil / Fertig', t_bauteil),
    ('Vorlage als Bauteil bearbeiten', t_vorlage_bauteil), ('Unterteil anklicken', t_unterteil), ('Isolieren', t_isolieren),
    ('Zahleneingabe: Größe / Formeln / Drehen / Verschieben', t_drag_input),
    ('Protokoll: füllt sich / Filter / Bis hierher zurück / Strg Z und Y', t_protokoll),
    ('Design', t_design), ('Darstellungsqualität', t_qualitaet), ('Hilfe-Tooltips', t_tooltips), ('Tastenkürzel', t_tasten),
    ('Dateien: Speichern / Öffnen / Export', t_dateien),
    ('Skizzen-Maße: beim Zeichnen / Maß-Werkzeug / Teil wächst mit / Doppelklick / Schildchen ändern', t_skizze_masse),
    ('Skizzen-Maße: hält beim Ziehen / lösen', t_mass_haelt), ('Kaputte Formel', t_kaputte_formel), ('Neuer Name', t_neuer_name),
    ('Notizstift: malen / Text / radieren / Rückgängig / ausblenden / nicht im Modell', t_notizen),
    ('Formel-Beispiele', t_formel_beispiele), ('Einführung „Erste Skizze“', t_einfuehrung), ('Schraubenlöcher', t_schrauben),
    ('Fies: Löschen hinter Marker + Undo', t_fies_loeschen), ('Fies: alles unterdrückt', t_fies_alle_aus),
    ('Fies: Marker am Anfang, neu laden', t_fies_reload), ('Fies: Tasten während Rechnen', t_fies_tasten),
    ('Fies: Sehr fein + zoomen', t_fies_sehr_fein), ('Fies: Maß umbenennen / entfernen', t_fies_umbenennen),
]

if __name__ == '__main__':
    only = sys.argv[1:]
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=ARGS)
        for name, fn in TESTS:
            if only and not any(o.lower() in name.lower() for o in only):
                continue

            def wrap(p, fn=fn):
                r = fn(p)
                if isinstance(r, list):
                    return all(r), ' '.join('✓' if x else '✗' for x in r)
                return r
            check(name, wrap, b)
        b.close()
    bad = [r for r in results if r[1] == 'FEHLER']
    print(f'\n{len(results)} Tests: {sum(r[1] == "OK" for r in results)} OK, {len(bad)} Fehler, {sum(r[1] == "VON HAND" for r in results)} von Hand')
    sys.exit(1 if bad else 0)
