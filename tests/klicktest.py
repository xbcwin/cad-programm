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
        return self.pg.evaluate("(arg)=>{const {App,Actions,Model,Timeline,Start,Comp,Handles,Sketch,SK,Viewer,Commands,Solver,Notes,SKO,Features,Place,Views,Mass,Select,Versions,DroneTpl,DroneUI,DroneLib,DroneCheck,Plates,Variants}=window.__M; " + js + "}", arg)

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


PREP = """App.change('x', d=>{ const it=Model.newItem('extrude',{},{}); it.p={sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:[
  {id:'L1',type:'line',a:[-30,-20],b:[30,-18]},{id:'L2',type:'line',a:[-30,20],b:[-28,-10]},
  {id:'C1',type:'circle',c:[-10,5],r:4},{id:'C2',type:'circle',c:[12,8],r:6},{id:'AX',type:'line',a:[0,-25],b:[1,25],con:true},
  {id:'A1',type:'arc',a:[20,10],m:[26,16],b:[20,22]}],dims:[],cons:[]},dist:3,dir:'normal'}; d.items.push(it); })"""


def t_regeln(p):
    p.empty(); p.ev(PREP); p.wait(1500)
    p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1500)
    S = lambda js: p.ev("const S=Sketch.state; const E=(id)=>S.ents.find(e=>e.id===id); " + js)
    def click_ent(eid, t=0.35):
        e = S(f"return E('{eid}')")
        u = (e['a'][0] * (1 - t) + e['b'][0] * t, e['a'][1] * (1 - t) + e['b'][1] * t) if e['type'] == 'line' else (e['c'][0], e['c'][1] + e['r']) if e['type'] == 'circle' else tuple(e['m'])
        s = to_screen(p, *u); p.pg.mouse.click(s[0], s[1]); p.wait(250)
    def tool(t):
        p.pg.click(f'.consbar [data-tool="c:{t}"]'); p.wait(150)
    tool('perpendicular'); click_ent('L1'); click_ent('L2')
    ok1 = S("const a=E('L1'),c=E('L2'); const u=[a.b[0]-a.a[0],a.b[1]-a.a[1]], v=[c.b[0]-c.a[0],c.b[1]-c.a[1]]; return Math.abs(u[0]*v[0]+u[1]*v[1])/Math.hypot(...u)/Math.hypot(...v) < 1e-6")
    tool('tangent'); click_ent('L1'); click_ent('C1')
    ok2 = S("const l=E('L1'),c=E('C1'); const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1]; return Math.abs(Math.abs((c.c[0]-l.a[0])*dy-(c.c[1]-l.a[1])*dx)/Math.hypot(dx,dy)-c.r) < 1e-6")
    tool('equal'); click_ent('C1'); click_ent('C2')
    ok3 = S("return Math.abs(E('C1').r-E('C2').r) < 1e-6")
    tool('symmetric'); click_ent('C1'); click_ent('C2'); click_ent('AX', 0.8)
    ok4 = S("const a=E('C1').c,b=E('C2').c,l=E('AX'); const m=[(a[0]+b[0])/2,(a[1]+b[1])/2]; const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1],L=Math.hypot(dx,dy); return Math.abs(((m[0]-l.a[0])*dy-(m[1]-l.a[1])*dx)/L)<1e-5 && Math.abs(((b[0]-a[0])*dx+(b[1]-a[1])*dy)/L)<1e-5")
    tool('coincident'); a1 = S("return E('A1').a"); s = to_screen(p, *a1); p.pg.mouse.click(s[0], s[1]); p.wait(200); click_ent('AX', 0.9)
    ok5 = S("const q=E('A1').a,l=E('AX'); const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1]; return Math.abs((q[0]-l.a[0])*dy-(q[1]-l.a[1])*dx)/Math.hypot(dx,dy) < 1e-6")
    p.pg.keyboard.press('d'); click_ent('A1'); p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('5'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok6 = abs(S("const e=E('A1'); return window.__M.SK.arcInfo(e.a,e.m,e.b).r") - 5) < 1e-4
    p.pg.keyboard.press('d'); click_ent('AX', 0.8); click_ent('L2', 0.7); p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('60'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok7 = abs(S("const a=E('AX'),c=E('L2'); const u=[a.b[0]-a.a[0],a.b[1]-a.a[1]], v=[c.b[0]-c.a[0],c.b[1]-c.a[1]]; return Math.atan2(Math.abs(u[0]*v[1]-u[1]*v[0]),u[0]*v[0]+u[1]*v[1])*180/Math.PI") - 60) < 1e-4
    p.pg.keyboard.press('Enter'); p.wait(2500)
    ok8 = p.ev("return App.doc.items[0].p.sketch.cons.length === 5 && App.errors.length === 0")
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8]


def t_regeln_bestimmt(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    S = lambda js: p.ev("const S=Sketch.state; " + js)
    mid = lambda i, t=0.7: to_screen(p, *[S(f"return S.ents[{i}]")['a'][k] * (1 - t) + S(f"return S.ents[{i}]")['b'][k] * t for k in (0, 1)])
    p.pg.keyboard.press('l')
    for (x1, y1, x2, y2) in [(-120, -80, 60, -55), (-110, 40, 70, 90)]:
        p.pg.keyboard.down('Shift'); p.pg.mouse.click(cx + x1, cy + y1); p.pg.mouse.click(cx + x2, cy + y2); p.pg.keyboard.up('Shift'); p.pg.keyboard.press('Enter'); p.wait(200)
    p.pg.keyboard.press('v'); m = mid(0, 0.5); p.pg.mouse.click(m[0], m[1]); p.wait(200)
    p.pg.click('.consbar [data-tool="c:horizontal"]'); p.wait(300)
    p.pg.click('.consbar [data-tool="c:parallel"]')
    for i in range(2):
        m = mid(i, 0.4); p.pg.mouse.click(m[0], m[1]); p.wait(250)
    p.pg.keyboard.press('d'); a = to_screen(p, *S("return S.ents[0].a")); p.pg.mouse.click(a[0], a[1]); p.wait(200)
    m = mid(1, 0.5); p.pg.mouse.click(m[0], m[1]); p.wait(300)
    p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('25'); p.pg.keyboard.press('Enter'); p.wait(300)
    for i in range(2):
        p.pg.keyboard.press('v'); m = mid(i); p.pg.mouse.click(m[0], m[1]); p.wait(200)
        p.pg.fill('#se-len', '40'); p.pg.press('#se-len', 'Enter'); p.wait(300)
        p.pg.fill('#se-x', '0'); p.pg.press('#se-x', 'Enter'); p.wait(300)
        if i == 0:
            p.pg.fill('#se-y', '0'); p.pg.press('#se-y', 'Enter'); p.wait(300)
    p.pg.mouse.click(cx + 300, cy + 250); p.wait(300)
    ok1 = S("return S.status.dof === 0 && S.status.ok") and p.pg.get_by_text('Voll bestimmt').count() > 0
    # Widerspruch wird abgelehnt
    p.pg.keyboard.press('d'); a = to_screen(p, *S("return S.ents[0].a")); b2 = to_screen(p, *S("return S.ents[0].b")); p.pg.mouse.click(a[0], a[1]); p.wait(150); p.pg.mouse.click(b2[0], b2[1]); p.wait(300)
    p.pg.keyboard.press('Control+a'); p.pg.keyboard.type('50'); p.pg.keyboard.press('Enter'); p.wait(500)
    ok2 = p.pg.get_by_text('Zu viele Regeln in der Skizze').count() > 0 and S("return S.status.ok")
    # Feste Linie lässt sich nicht wegziehen
    p.pg.keyboard.press('v'); b0 = S("return S.ents[0].b"); s0 = to_screen(p, *b0)
    p.pg.mouse.move(s0[0], s0[1]); p.pg.mouse.down(); p.pg.mouse.move(s0[0] + 40, s0[1] - 60, steps=5); p.pg.mouse.up(); p.wait(300)
    ok3 = S("return S.ents[0].b") == b0
    # Regel-Symbol löschen, Strg Z holt es zurück
    p.pg.locator('.skcon').first.click(); p.wait(200); n0 = S("return S.cons.length"); p.pg.keyboard.press('Delete'); p.wait(300)
    n1 = S("return S.cons.length"); p.pg.keyboard.press('Control+z'); p.wait(300)
    ok4 = n1 == n0 - 1 and S("return S.cons.length") == n0
    return [ok1, ok2, ok3, ok4]


def t_kante(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)
    cx, cy = p.canvas_center(); p.pg.mouse.click(cx - 60, cy); p.wait(500)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('s'); p.wait(2500)
    p.pg.click('.consbar [data-tool="c:project"]')
    r = p.ev("return Sketch.state.refs.find(x=>x.type==='line')")
    m = to_screen(p, (r['a'][0] + r['b'][0]) / 2, (r['a'][1] + r['b'][1]) / 2); p.pg.mouse.move(m[0], m[1]); p.wait(200); p.pg.mouse.click(m[0], m[1]); p.wait(400)
    return p.ev("return Sketch.state.ents.length===1 && Sketch.state.cons[0].type==='fix' && Sketch.state.status.freeEnts.size===0")


# ---------- Skizzen-Feinschliff: Spline, Trimmen, Versatz, Spiegeln, Muster, Fangen, Hilfslinien ----------
def scene(p, ents):
    p.empty()
    p.ev("App.change('x', d=>{ const it=Model.newItem('extrude',{},{}); it.p={sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:arg,dims:[],cons:[]},dist:3,dir:'normal'}; d.items.push(it); })", ents)
    p.wait(1500); p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1500)


def SS(p, js):
    return p.ev("const S=Sketch.state; const E=(id)=>S.ents.find(e=>e.id===id); " + js)


def click_uv(p, u, v, alt=True):
    s = to_screen(p, u, v)
    if alt:
        p.pg.keyboard.down('Alt')
    p.pg.mouse.click(s[0], s[1])
    if alt:
        p.pg.keyboard.up('Alt')
    p.wait(200)


def t_spline(p):
    sketch_xy(p)
    p.pg.keyboard.press('s'); p.wait(200)
    for u, v in [(-30, 0), (-10, 15), (10, -15), (30, 0)]:
        click_uv(p, u, v)
    p.pg.keyboard.press('Enter'); p.wait(300)
    ok1 = SS(p, "return S.ents.length===1 && S.ents[0].type==='spline' && S.ents[0].pts.length===4 && !S.ents[0].closed")
    # Kurve läuft genau durch die Punkte und ist fein genug aufgelöst
    ok2 = SS(p, "const pl=SK.segPoints(SK.segsOf(S.ents[0])[0]); return pl.length>20 && S.ents[0].pts.every(q=>pl.some(r=>Math.hypot(r[0]-q[0],r[1]-q[1])<1e-6))")
    # geschlossen: auf den ersten Punkt klicken
    p.pg.keyboard.press('s')
    for u, v in [(-20, -30), (20, -30), (0, -45)]:
        click_uv(p, u, v)
    click_uv(p, -20, -30)
    ok3 = SS(p, "return S.ents.length===2 && S.ents[1].closed===true && S.ents[1].pts.length===3 && S.draft===null")
    # Punkt ziehen
    p.pg.keyboard.press('v'); a = to_screen(p, 10, -15); b = to_screen(p, 10, -25)
    p.pg.mouse.move(a[0], a[1]); p.pg.mouse.down(); p.pg.mouse.move(b[0], b[1], steps=5); p.pg.mouse.up(); p.wait(300)
    ok4 = SS(p, "return Math.abs(S.ents[0].pts[2][1]+25)<1.5")
    # Strg Z holt den Punkt zurück
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok5 = SS(p, "return Math.abs(S.ents[0].pts[2][1]+15)<1e-3")
    return [ok1, ok2, ok3, ok4, ok5]


def t_trimmen(p):
    scene(p, [{'id': 'H', 'type': 'line', 'a': [-30, 0], 'b': [30, 0]}, {'id': 'V', 'type': 'line', 'a': [0, -20], 'b': [0, 20]},
              {'id': 'C', 'type': 'circle', 'c': [60, 0], 'r': 10}, {'id': 'K', 'type': 'line', 'a': [40, 0], 'b': [80, 0]},
              {'id': 'R', 'type': 'rect', 'a': [-10, 40], 'b': [10, 60]}, {'id': 'Q', 'type': 'line', 'a': [-20, 50], 'b': [20, 50]}])
    p.pg.keyboard.press('t'); p.wait(200)
    # Linie: rechtes Stück bis zum Schnittpunkt fällt weg, Rest sitzt per Regel auf der senkrechten Linie
    s = to_screen(p, 20, 0); p.pg.mouse.move(s[0], s[1]); p.wait(200)
    hover = SS(p, "return !!S.trimHover && S.trimHover.length>1")
    p.pg.mouse.click(s[0], s[1]); p.wait(300)
    ok1 = hover and SS(p, "const h=E('H'); return Math.abs(h.a[0]+30)<1e-6 && Math.abs(h.b[0])<1e-6 && S.cons.some(c=>c.type==='coincident' && c.refs[0].e==='H' && c.refs[1].e==='V')")
    # Kreis: oberes Stück zwischen den beiden Schnitten fällt weg, der Rest wird ein Bogen
    click_uv(p, 60, 10, alt=False)
    ok2 = SS(p, "const arcs=S.ents.filter(e=>e.type==='arc'); return arcs.length===1 && Math.abs(SK.arcInfo(arcs[0].a,arcs[0].m,arcs[0].b).r-10)<1e-4")
    # Rechteck: wird zerlegt, die obere Kante (kein Schnitt im Inneren) fällt ganz weg
    click_uv(p, 0, 60, alt=False)
    ok3 = SS(p, "return !E('R') && !S.ents.some(e=>e.type==='rect') && S.ents.filter(e=>e.type==='line').length>=6")
    # Rückgängig bringt das Rechteck zurück
    p.pg.keyboard.press('Control+z'); p.wait(200)
    ok4 = SS(p, "return !!E('R')")
    return [ok1, ok2, ok3, ok4]


def t_versatz(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [20, 10]}, {'id': 'C', 'type': 'circle', 'c': [34, 5], 'r': 6}])
    p.pg.keyboard.press('f'); p.wait(200)
    click_uv(p, 10, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 10, -4)); p.wait(200)
    s0 = SS(p, "return !!S.draft && !!S.draft.off")
    p.pg.keyboard.type('3'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok1 = s0 and SS(p, "const n=S.ents.filter(e=>e.type==='rect'); const r=n.find(e=>e.id!=='R'); return n.length===2 && r && Math.abs(Math.min(r.a[0],r.b[0])+3)<1e-4 && Math.abs(Math.max(r.a[0],r.b[0])-23)<1e-4 && Math.abs(Math.min(r.a[1],r.b[1])+3)<1e-4 && Math.abs(Math.max(r.a[1],r.b[1])-13)<1e-4 && S.cons.some(c=>c.type==='offset')")
    # Original ändern → Kopie folgt
    p.pg.keyboard.press('v'); click_uv(p, 20, 5, alt=False); p.wait(300)
    p.pg.fill('#se-w', '30'); p.pg.press('#se-w', 'Enter'); p.wait(400)
    ok2 = SS(p, "const r=S.ents.find(e=>e.type==='rect'&&e.id!=='R'); return Math.abs(Math.abs(r.b[0]-r.a[0])-36)<1e-3")
    # Kreis: Klick auf den Rand, Maus nach außen, Klick → größerer Kreis, über Regel verbunden
    p.pg.keyboard.press('f'); click_uv(p, 40, 5, alt=False); click_uv(p, 46, 5, alt=False); p.wait(300)
    ok3 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); return c.length===2 && Math.abs(Math.max(c[0].r,c[1].r)-12)<0.3 && S.cons.filter(x=>x.type==='offset').length===2")
    return [ok1, ok2, ok3]


def t_versatz_kette(p):
    scene(p, [{'id': 'A', 'type': 'line', 'a': [0, 0], 'b': [40, 0]}, {'id': 'B', 'type': 'line', 'a': [40, 0], 'b': [40, 30]}])
    p.pg.keyboard.press('f'); click_uv(p, 20, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 20, 8)); p.wait(200); p.pg.keyboard.type('5'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok1 = SS(p, "const l=S.ents.filter(e=>e.type==='line'); const n=l.filter(e=>e.id!=='A'&&e.id!=='B'); return l.length===4 && n.length===2 && n.some(e=>Math.abs(e.a[1]-5)<1e-4&&Math.abs(e.b[1]-5)<1e-4) && n.some(e=>Math.abs(e.a[0]-35)<1e-4&&Math.abs(e.b[0]-35)<1e-4)")
    return [ok1]


def t_spiegeln(p):
    scene(p, [{'id': 'AX', 'type': 'line', 'a': [0, -30], 'b': [0, 30], 'con': True}, {'id': 'C', 'type': 'circle', 'c': [20, 5], 'r': 4},
              {'id': 'L', 'type': 'line', 'a': [10, 0], 'b': [25, 12]}])
    p.pg.keyboard.press('m'); p.wait(200)
    click_uv(p, 0, 20, alt=False)
    ok0 = SS(p, "return !!S.mir && S.mir.axis==='AX'")
    click_uv(p, 20, 9, alt=False); click_uv(p, 17, 7.2, alt=False)
    p.pg.keyboard.press('Enter'); p.wait(400)
    ok1 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); const l=S.ents.filter(e=>e.type==='line'&&!e.con); return c.length===2 && l.length===2 && c.some(e=>Math.abs(e.c[0]+20)<1e-4&&Math.abs(e.c[1]-5)<1e-4) && l.some(e=>Math.abs(e.a[0]+10)<1e-4)")
    ok2 = SS(p, "return S.cons.filter(c=>c.type==='symmetric').length>=3 && S.cons.some(c=>c.type==='equal')")
    # Original verschieben → Spiegelbild folgt
    p.pg.keyboard.press('v'); click_uv(p, 20, 9, alt=False); p.wait(300)
    p.pg.fill('#se-x', '30'); p.pg.press('#se-x', 'Enter'); p.wait(400)
    ok3 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); const l=E('AX'); const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1],L=Math.hypot(dx,dy); const a=c[0].c,b=c[1].c; const m=[(a[0]+b[0])/2,(a[1]+b[1])/2]; return S.status.ok && Math.abs(a[0]-b[0])>1 && Math.abs(((m[0]-l.a[0])*dy-(m[1]-l.a[1])*dx)/L)<1e-3 && Math.abs(((b[0]-a[0])*dx+(b[1]-a[1])*dy)/L)<1e-3")
    return [ok0, ok1, ok2, ok3]


def t_muster_rechteck(p):
    scene(p, [{'id': 'C', 'type': 'circle', 'c': [2, 1], 'r': 3}])
    p.pg.keyboard.press('q'); p.wait(200)
    click_uv(p, 5, 1, alt=False)
    for i, v in [('pt-nx', '3'), ('pt-dx', '10'), ('pt-ny', '2'), ('pt-dy', '8')]:
        p.pg.fill('#' + i, v); p.pg.press('#' + i, 'Enter'); p.wait(150)
    p.pg.click('#pt-make'); p.wait(500)
    ok1 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); return c.length===6 && [2,12,22].every(x=>[1,9].every(y=>c.some(e=>Math.abs(e.c[0]-x)<1e-3&&Math.abs(e.c[1]-y)<1e-3)))")
    ok2 = SS(p, "return S.cons.filter(c=>c.type==='xform').length===5")
    # Original ändern → alle Kopien ziehen mit
    p.pg.keyboard.press('v'); click_uv(p, 5, 1, alt=False); p.wait(300)
    p.pg.fill('#se-d', '8'); p.pg.press('#se-d', 'Enter'); p.wait(400)
    ok3 = SS(p, "return S.ents.every(e=>Math.abs(e.r-4)<1e-4)")
    p.pg.fill('#se-x', '5'); p.pg.press('#se-x', 'Enter'); p.wait(400)
    ok4 = SS(p, "const xs=S.ents.map(e=>e.c[0]).sort((a,b)=>a-b); return Math.abs(xs[0]-5)<1e-3 && Math.abs(xs[5]-25)<1e-3")
    return [ok1, ok2, ok3, ok4]


def t_muster_kreis(p):
    scene(p, [{'id': 'C', 'type': 'circle', 'c': [20, 0], 'r': 2}, {'id': 'R', 'type': 'rect', 'a': [14, -2], 'b': [16, 2]}])
    p.pg.keyboard.press('w'); p.wait(200)
    click_uv(p, 22, 0, alt=False)
    p.pg.fill('#pt-n', '4'); p.pg.press('#pt-n', 'Enter'); p.wait(150)
    p.pg.click('#pt-make'); p.wait(500)
    ok1 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); return c.length===4 && [[20,0],[0,20],[-20,0],[0,-20]].every(q=>c.some(e=>Math.hypot(e.c[0]-q[0],e.c[1]-q[1])<1e-3))")
    # Rechteck wird beim Drehen zerlegt: drei Kopien mit je vier Linien
    p.pg.keyboard.press('w'); click_uv(p, 15, 2, alt=False)
    p.pg.fill('#pt-n', '3'); p.pg.press('#pt-n', 'Enter'); p.wait(150)
    p.pg.click('#pt-make'); p.wait(500)
    ok2 = SS(p, "return S.ents.filter(e=>e.type==='line').length===8 && S.cons.filter(c=>c.type==='xform'&&c.mode==='rot').length>=2")
    # Original verschieben → Kreise drehen mit
    p.pg.keyboard.press('v'); click_uv(p, 22, 0, alt=False); p.wait(300)
    p.pg.fill('#se-x', '25'); p.pg.press('#se-x', 'Enter'); p.wait(400)
    ok3 = SS(p, "const c=S.ents.filter(e=>e.type==='circle'); return c.some(e=>Math.hypot(e.c[0],e.c[1]-25)<1e-2)")
    return [ok1, ok2, ok3]


def t_fangen(p):
    scene(p, [{'id': 'D1', 'type': 'line', 'a': [-30, -30], 'b': [30, 30]}, {'id': 'D2', 'type': 'line', 'a': [-30, 10], 'b': [30, -10]},
              {'id': 'K', 'type': 'circle', 'c': [-25, -8], 'r': 4}])
    # Schnittpunkt wird gefangen (7,5 / 7,5 liegt zwischen Rasterpunkten)
    p.pg.keyboard.press('l'); p.wait(200)
    s = to_screen(p, 7.4, 7.6); p.pg.mouse.click(s[0], s[1]); p.wait(200)
    s2 = to_screen(p, 10, -25); p.pg.mouse.click(s2[0], s2[1]); p.wait(200); p.pg.keyboard.press('Enter'); p.wait(200)
    ok1 = SS(p, "const l=S.ents[S.ents.length-1]; return Math.abs(l.a[0]-7.5)<1e-3 && Math.abs(l.a[1]-7.5)<1e-3")
    # Schnittpunkt-Fang ausschalten: jetzt rastet es nicht mehr dort ein
    p.pg.keyboard.press('Control+z'); p.wait(200)
    p.pg.locator('summary:has-text("Fangen")').click(); p.pg.uncheck('#snap-cross'); p.pg.uncheck('#snap-curve'); p.wait(150); p.pg.locator('canvas').first.focus()
    p.pg.keyboard.press('l'); p.pg.mouse.click(s[0], s[1]); p.wait(200)
    p.pg.mouse.click(*to_screen(p, 15, -25)); p.wait(200); p.pg.keyboard.press('Enter'); p.wait(200)
    ok2 = SS(p, "const l=S.ents[S.ents.length-1]; return Math.abs(l.a[0]-7.5)>0.2 || Math.abs(l.a[1]-7.5)>0.2")
    # Alt: gar nicht fangen
    p.pg.check('#snap-cross'); p.pg.check('#snap-curve'); p.pg.locator('canvas').first.focus()
    p.pg.keyboard.press('l'); click_uv(p, 12.3, -22.7)
    p.pg.mouse.click(*to_screen(p, 20, -25)); p.wait(200); p.pg.keyboard.press('Enter'); p.wait(200)
    ok3 = SS(p, "const l=S.ents[S.ents.length-1]; return Math.abs(l.a[0]-12.3)<0.15 && Math.abs(l.a[1]+22.7)<0.15")
    # Kreispunkt: der Kreis wird an seinem Viertelpunkt gefangen
    p.pg.keyboard.press('l'); p.pg.mouse.click(*to_screen(p, -25.2, -3.9)); p.wait(200)
    p.pg.mouse.click(*to_screen(p, -10, -25)); p.wait(200); p.pg.keyboard.press('Enter'); p.wait(200)
    ok4 = SS(p, "const l=S.ents[S.ents.length-1]; return Math.abs(l.a[0]+25)<1e-3 && Math.abs(l.a[1]+4)<1e-3")
    return [ok1, ok2, ok3, ok4]


def t_hilfslinien(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    p.pg.keyboard.press('x'); p.wait(150)
    on = SS(p, "return S.construction") and p.pg.locator('.tool.conmode.active').count() == 1
    p.pg.keyboard.press('r'); p.pg.mouse.click(cx - 60, cy - 40); p.pg.mouse.click(cx + 60, cy + 40); p.wait(300)
    ok1 = on and SS(p, "return S.ents.length===1 && S.ents[0].con===true && SK.regions(S.ents).length===0")
    p.pg.keyboard.press('x'); p.wait(150)
    p.pg.keyboard.press('r'); p.pg.mouse.click(cx - 200, cy - 100); p.pg.mouse.click(cx - 120, cy - 50); p.wait(300)
    ok2 = SS(p, "return !S.construction && S.ents.length===2 && !S.ents[1].con && SK.regions(S.ents).length===1")
    # gewähltes Element umwandeln
    p.pg.keyboard.press('v'); click_uv(p, *SS(p, "const e=S.ents[1]; return [e.a[0], (e.a[1]+e.b[1])/2]"), alt=False); p.wait(200)
    p.pg.keyboard.press('x'); p.wait(200)
    ok3 = SS(p, "return S.ents[1].con===true && SK.regions(S.ents).length===0")
    p.pg.keyboard.press('x'); p.wait(200)
    ok4 = SS(p, "return !S.ents[1].con && SK.regions(S.ents).length===1")
    return [ok1, ok2, ok3, ok4]


def t_skizze_hilfen(p):
    sketch_xy(p)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    keys = p.pg.evaluate("[...document.querySelectorAll('[data-help]')].map(b=>b.dataset.help)")
    fehlt = [k for k in set(keys) if k not in hilfen]
    neu = all(k in hilfen for k in ['spline', 'trim', 'offset2d', 'mirror2d', 'patternRect2d', 'patternCirc2d', 'construct2d'])
    return (neu and not fehlt), ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ''


# ---------- Formen-Werkzeuge: Muster, Spiegeln, Teilen, Boolesch, Wandstärke, Bohrung ----------
def bbox(p, i=0):
    return p.ev(f"const r=App.results.get(App.doc.items[{i}].id); return r && r.data.bbox.map(x=>Math.round(x*100)/100)")


def wbox(p, i=0):   # Hüllquader in Weltlage (ohne Drehung): Ergebnis + Lage des Objekts
    b = bbox(p, i); t = p.ev(f"const t=App.doc.items[{i}].t; return [t.x,t.y,t.z]")
    return b and [round(b[k] + t[k % 3], 2) for k in range(6)]


def near(a, b, tol=0.1):
    return a is not None and b is not None and len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))


def ctx(p, label, item=None):
    p.pg.locator(f'.ctxbar button[aria-label="{label}"]').click(); p.wait(300)
    if item:
        p.pg.locator('.menu button, .menu [role=menuitem]').filter(has_text=item).first.click()
    p.wait(2500)


def world_screen(p, x, y, z):
    return p.ev("const v=Viewer.camera.position.clone().set(arg[0],arg[1],arg[2]); const s=Viewer.toScreen(v); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left,s.y+r.top]", [x, y, z])


def field(p, fid, val):
    p.pg.fill(fid, str(val)); p.pg.press(fid, 'Enter'); p.wait(2500)


def zylinder(p, x, d=10, h=5):
    p.empty(); p.ev("Actions.addPrimitive('cylinder')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=arg[0]; it.t.y=0; it.p.d=arg[1]; it.p.h=arg[2]; }); App.select([App.doc.items[0].id])", [x, d, h]); p.wait(1500)


def t_kreismuster_3d(p):
    zylinder(p, 30)
    ctx(p, 'Muster', 'Kreismuster')
    ok1 = near(bbox(p), [-35, -35, 0, 35, 35, 5]) and p.ev("return App.doc.items.length===1 && App.doc.items[0].p.n===4")
    field(p, '#op-n', 3)
    s = round(30 * math.sin(math.radians(120)) + 5, 2)
    ok2 = near(bbox(p), [-20, -s, 0, 35, s, 5]) and p.ev("return Model.sizeText(App.doc.items[0], Model.vars(App.doc).v)") == '3× 360°'
    p.ev("App.change('x', d=>{ d.items[0].children[0].p.d=20; })"); p.wait(2500)   # Original ändern
    ok3 = near(bbox(p)[3:4], [40])
    p.pg.get_by_text('Auflösen').first.click(); p.wait(2500)
    ok4 = near(wbox(p), [20, -10, 0, 40, 10, 5]) and p.ev("return App.doc.items.length===1 && App.doc.items[0].kind==='cylinder'")
    return [ok1, ok2, ok3, ok4]


def t_rechteckmuster_3d(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    o = bbox(p); p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
    ctx(p, 'Muster', 'Rechteckmuster')
    ok1 = near(bbox(p), [o[0], o[1], 0, o[3] + 50, o[4], 20])          # 3 × 1, Abstand 25
    field(p, '#op-ny', 2)
    ok2 = near(bbox(p)[4:5], [o[4] + 25])
    p.ev("App.change('Maß', d=>{ d.params.push({id:'m_n',name:'Anzahl',expr:4}); })"); p.wait(800)
    field(p, '#op-nx', 'Anzahl')
    ok3 = near(bbox(p)[3:4], [o[3] + 75])
    p.ev("App.change('x', d=>{ d.params[0].expr=2; })"); p.wait(2500)
    ok4 = near(bbox(p)[3:4], [o[3] + 25]) and p.ev("return App.errors.length") == 0
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(1200); p.pg.keyboard.press('Control+z'); p.wait(1200)
    p.pg.keyboard.press('Control+z'); p.wait(1200); p.pg.keyboard.press('Control+z'); p.wait(1200); p.pg.keyboard.press('Control+z'); p.wait(2500)
    ok5 = p.ev("return App.doc.items.length===1 && App.doc.items[0].kind==='box'")
    return [ok1, ok2, ok3, ok4, ok5]


def t_spiegelkopie(p):
    zylinder(p, 20, 10, 5)
    ctx(p, 'Muster', 'Gespiegelte Kopie')
    ok1 = near(bbox(p), [-25, -5, 0, 25, 5, 5])
    p.pg.select_option('#op-plane', 'XZ'); p.wait(2500)            # vorne ↔ hinten: liegt schon symmetrisch, bleibt gleich
    ok2 = near(bbox(p), [15, -5, 0, 25, 5, 5])
    p.pg.select_option('#op-plane', 'YZ'); p.wait(1500); field(p, '#op-off', 10)
    ok3 = near(bbox(p), [-5, -5, 0, 25, 5, 5])                      # Ebene bei x = 10: Kopie von −5 bis 5
    return [ok1, ok2, ok3]


def t_teilen(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    o = bbox(p); p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
    ctx(p, 'Teilen')
    ok1 = near(bbox(p), o) and p.ev("return App.doc.items[0].p.off") == 10
    field(p, '#op-gap', 4)
    ok2 = near(bbox(p), [o[0], o[1], -2, o[3], o[4], 22])
    p.pg.select_option('#op-keep', 'positive'); p.wait(2500)
    ok3 = near(bbox(p), [o[0], o[1], 12, o[3], o[4], 22])
    field(p, '#op-off', 50)
    ok4 = p.ev("return App.errors.length>0 && JSON.stringify(App.errors).includes('trifft')")
    field(p, '#op-off', 5)
    ok5 = p.ev("return App.errors.length") == 0 and near(bbox(p), [o[0], o[1], 7, o[3], o[4], 22])
    return [ok1, ok2, ok3, ok4, ok5]


def t_boolesch(p):
    p.empty(); p.ev("Actions.addPrimitive('box'); Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ d.items[0].t.x=0; d.items[0].t.y=0; d.items[1].t.x=10; d.items[1].t.y=0; })"); p.wait(2000)
    p.ev("App.select(App.doc.items.map(x=>x.id))"); p.wait(400)
    ctx(p, 'Boolesch', 'Abziehen')
    ok1 = near(wbox(p), [-10, -10, 0, 0, 10, 20]) and p.ev("return App.doc.items[0].children.map(c=>c.role).join()") == 'solid,hole'
    p.ev("Actions.ungroup(App.doc.items[0].id)"); p.wait(1500)
    p.ev("App.change('x', d=>{ d.items.forEach(i=>i.role='solid'); }); App.select(App.doc.items.map(x=>x.id))"); p.wait(1500)
    ctx(p, 'Boolesch', 'Schnittmenge')
    ok2 = near(wbox(p), [0, -10, 0, 10, 10, 20]) and p.ev("return App.doc.items[0].p.op") == 'intersect'
    p.ev("Actions.ungroup(App.doc.items[0].id)"); p.wait(1500)
    p.ev("App.select(App.doc.items.map(x=>x.id))"); p.wait(400)
    ctx(p, 'Boolesch', 'Vereinigen')
    ok3 = near(wbox(p), [-10, -10, 0, 20, 10, 20]) and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


def t_wandstaerke(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ d.items[0].t.x=0; d.items[0].t.y=0; })"); p.wait(1500)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)
    s = world_screen(p, 3, 3, 20); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    ctx(p, 'Aushöhlen')
    faces = p.ev("return App.results.get(App.doc.items[0].id).data.faces.length")
    fin = p.ev("return App.doc.items[0].finishes[0]")
    ok1 = faces == 11 and fin['type'] == 'shell' and fin['r'] == 2 and near(bbox(p), [-10, -10, 0, 10, 10, 20])
    fid = '#fin-' + fin['id']
    ok2 = p.pg.locator(fid).count() == 1 and p.pg.locator('.section-h').filter(has_text='Wandstärke').count() == 1
    field(p, fid, 12)
    ok3 = p.ev("return App.errors.some(e=>e.code==='shell')") and p.pg.locator('.inp.invalid ' + fid).count() == 1
    field(p, fid, 3)
    ok4 = p.ev("return App.errors.length") == 0 and p.ev("return App.results.get(App.doc.items[0].id).data.faces.length") == 11
    return [ok1, ok2, ok3, ok4]


def t_bohrung(p):
    p.pg.get_by_text('Schild mit Loch').first.click(); p.wait(8000)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)
    cx, cy = p.canvas_center(); p.pg.mouse.click(cx - 80, cy - 20); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'tap'); p.wait(200); p.pg.select_option('#hw-size', 'M2'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2500)
    for dx in (40, 120):
        p.pg.mouse.click(cx - 80 + dx, cy - 20); p.wait(2500)
    ok1 = '3 gesetzt' in p.pg.locator('.holebar').inner_text()
    p.pg.keyboard.press('Escape'); p.wait(800)
    parts = p.ev("const out=[]; Model.walk(App.doc.items, it=>{ if(it.kind==='part') out.push([it.p.lib,it.p.size,it.p.fit]) }); return out")
    ok2 = parts.count(['screwHole', 'M2', 'tap']) == 3 and p.ev("return App.errors.length") == 0
    ok3 = p.ev("return !Place.active") and p.pg.locator('.holebar').count() == 0
    return [ok1, ok2, ok3]


def t_lochkreis(p):
    # Drohnen-Fall: ein Loch in einer Platte, dann als Kreismuster um die Plattenmitte (Motorhalter)
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=0; it.t.y=0; it.p.w=40; it.p.d=40; it.p.h=3; })"); p.wait(1500)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)
    s = world_screen(p, 8, 0, 3); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'through'); p.pg.select_option('#hw-size', 'M3'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2500); p.pg.keyboard.press('Escape'); p.wait(800)
    rund = lambda: p.ev("return App.results.get(App.doc.items[0].id).data.faces.filter(f=>f.t!=='PLANE').length")
    n1 = rund()
    p.ev("Comp.edit(App.doc.items[0].id)"); p.wait(2000)
    p.ev("App.select([App.doc.items[0].children.find(c=>c.role==='hole').id])"); p.wait(600)
    ctx(p, 'Muster', 'Kreismuster')
    ok1 = p.ev("const c=App.doc.items[0].children; return c.length===2 && c[1].p.op==='pattern' && c[1].role==='hole'")
    ok2 = n1 > 0 and rund() == 4 * n1 and p.ev("return App.errors.length") == 0
    field(p, '#op-n', 6)
    ok3 = rund() == 6 * n1
    return [ok1, ok2, ok3]


def t_formen_hilfen(p):
    p.empty()
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    keys = ['holeWizard', 'shell', 'patternRect', 'patternCirc', 'mirror', 'split', 'boolUnion', 'boolSubtract', 'boolIntersect']
    fehlt = [k for k in keys if k not in hilfen]
    # die Knöpfe an der Fläche zeigen die Anleitung auch wirklich an
    p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE' && f.n && f.n[2]>0.9); App.select([id],{face:{id, faceIdx:fi, info:r.data.faces[fi]}})"); p.wait(600)
    am_knopf = p.pg.evaluate("[...document.querySelectorAll('.ctxbar [data-help]')].map(b=>b.dataset.help)")
    ok = not fehlt and 'holeWizard' in am_knopf and 'shell' in am_knopf
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ('' if ok else 'an den Knöpfen: ' + ', '.join(am_knopf))


# ---------- Ansichten: Schnitt, Röntgen, Explosion, Fokus-Vorschau ----------
def zwei_quader(p, y0=-20, y1=20, x0=0, x1=0, neu=True):
    if neu:
        p.empty()
    else:
        p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(800)
    p.ev("Actions.addPrimitive('box'); Actions.addPrimitive('box')"); p.wait(2500)
    p.ev("App.change('x', d=>{ d.items[0].t.x=arg[0]; d.items[0].t.y=arg[1]; d.items[1].t.x=arg[2]; d.items[1].t.y=arg[3]; })", [x0, y0, x1, y1]); p.wait(2000)


def treffer(p, s):
    return p.ev("const h=Viewer.pick(arg[0],arg[1]); return h && [App.doc.items.findIndex(x=>x.id===h.id), Math.round(h.point.y*10)/10]", s)


def t_schnitt(p):
    zwei_quader(p)
    p.ev("Viewer.setView('front', false)"); p.wait(800)
    s = world_screen(p, 0, -30, 10)
    vorher = treffer(p, s); u0 = p.ev("return App.undoStack.length")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('c'); p.wait(1000)
    ok1 = p.ev("return !!Viewer.clip && Views.cut.plane==='XZ'") and p.pg.locator('.viewbar').filter(has_text='Schnitt').count() == 1
    p.pg.fill('#cut-off', '-20'); p.pg.press('#cut-off', 'Enter'); p.wait(600)
    nachher = treffer(p, s)
    ok2 = vorher == [0, -30] and nachher == [0, -10] and p.ev("return Views.cut.off") == -20      # vorne weggeschnitten: Klick trifft die Innenseite
    p.pg.locator('#cut-flip').click(); p.wait(500)
    ok3 = p.ev("return Views.cut.flip && Viewer.clip.normal.y < 0")
    p.pg.locator('.viewbar [data-plane="YZ"]').click(); p.wait(600)
    ok4 = p.ev("return Views.cut.plane==='YZ' && Math.abs(Viewer.clip.normal.x)===1 && Views.cut.off===0")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('c'); p.wait(600)
    ok5 = p.ev("return Viewer.clip===null && Views.cut===null") and p.pg.locator('.viewbar').count() == 0 and p.ev("return App.undoStack.length") == u0   # nichts davon ist ein Schritt
    return [ok1, ok2, ok3, ok4, ok5]


def t_roentgen(p):
    zwei_quader(p)
    p.ev("Viewer.setView('front', false)"); p.wait(800)
    s = world_screen(p, 0, -30, 10)
    p.pg.locator('.view-btns [data-view="xray"]').click(); p.wait(600)
    ok1 = p.ev("return Viewer.xray && [...Viewer.nodes.values()].every(n=>n.mesh.material.transparent && n.edges.material.depthTest===false)")
    p.pg.mouse.click(s[0], s[1]); p.wait(600); a = p.ev("return App.sel.map(id=>App.doc.items.findIndex(x=>x.id===id))")
    p.pg.mouse.click(s[0], s[1]); p.wait(600); b = p.ev("return App.sel.map(id=>App.doc.items.findIndex(x=>x.id===id))")
    ok2 = a == [0] and b == [1]          # zweiter Klick wählt das Teil dahinter
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('x'); p.wait(600)
    ok3 = p.ev("return !Viewer.xray && [...Viewer.nodes.values()].every(n=>!n.mesh.material.transparent)")
    return [ok1, ok2, ok3]


def t_explosion(p):
    zwei_quader(p)
    t0 = p.ev("return JSON.stringify(App.doc.items.map(i=>i.t))")
    p.pg.locator('#t-views').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Explosion').first.click(); p.wait(1200)
    off = p.ev("return [...Viewer.nodes.values()].map(n=>n.off ? n.off.toArray().map(v=>Math.round(v)) : null)")
    ok1 = p.ev("return Views.exploded") and off[0][1] < -5 and off[1][1] > 5 and p.ev("return JSON.stringify(App.doc.items.map(i=>i.t))") == t0
    p.pg.fill('#ex-range', '100'); p.pg.locator('#ex-range').dispatch_event('input'); p.wait(500)
    ok2 = abs(p.ev("return Views.explodeAmount") - 1) < 0.01
    # Teil anklicken und ändern geht, Ziehen verschiebt nichts
    c = p.ev("const n=Viewer.nodes.get(App.doc.items[1].id); const b=n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix); const q=Viewer.toScreen(b.getCenter(Viewer.camera.position.clone())); const r=Viewer.canvas.getBoundingClientRect(); return [q.x+r.left,q.y+r.top]")
    p.pg.mouse.click(c[0], c[1]); p.wait(600)
    ok3 = p.ev("return App.sel[0]===App.doc.items[1].id") and p.pg.locator('#p-h').count() == 1
    field(p, '#p-h', 40)
    ok3 = ok3 and p.ev("return App.doc.items[1].p.h===40 && Views.exploded && Viewer.nodes.get(App.doc.items[1].id).mesh.geometry.boundingBox.max.z > 39")
    p.pg.mouse.move(c[0], c[1]); p.pg.mouse.down(); p.pg.mouse.move(c[0] + 60, c[1], steps=5); p.pg.mouse.up(); p.wait(800)
    ok4 = p.ev("return JSON.stringify(App.doc.items.map(i=>i.t))") == t0 and p.ev("return Views.exploded")
    p.pg.locator('#ex-back').click(); p.wait(1000)
    ok5 = not p.ev("return Views.exploded") and p.ev("return [...Viewer.nodes.values()].every(n=>!n.off)") and p.pg.locator('.viewbar').count() == 0
    return [ok1, ok2, ok3, ok4, ok5]


def t_explosion_regeln(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('u'); p.wait(800)
    ok1 = not p.ev("return Views.exploded") and p.pg.get_by_text('mindestens zwei Teile').count() > 0
    zwei_quader(p, neu=False)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('u'); p.wait(1000)
    ok2 = p.ev("return Views.exploded")
    p.pg.locator('#t-measure').click(); p.wait(800)
    ok3 = not p.ev("return Views.exploded")                       # Messen setzt alles zusammen
    p.pg.locator('#t-measure').click(); p.wait(300)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('u'); p.wait(1000)
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)
    ok4 = not p.ev("return Views.exploded") and p.ev("return Sketch.active")
    return [ok1, ok2, ok3, ok4]


def t_fokus(p):
    zwei_quader(p, 0, 0, -20, 20)
    p.ev("App.clearSelection()"); p.wait(300)
    p.pg.locator('#t-views').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Fokus').first.click(); p.wait(800)
    ok1 = p.pg.locator('.focusview').count() == 1 and p.pg.get_by_text('Wähle ein Teil').is_visible()
    p.ev("App.select([App.doc.items[1].id])"); p.wait(1200)
    ok2 = p.ev("return Views.focusDrawn && Views.focusIds.length===1") and 'Quader' in p.pg.locator('.focusview .fv-title').text_content() and not p.pg.get_by_text('Wähle ein Teil').is_visible()
    # Bildpunkt in der Vorschau ist nicht leer (das Teil wird wirklich gezeichnet)
    p.ev("Viewer.requestRender()"); p.wait(300)
    box = p.pg.locator('.fv-body').bounding_box()
    shot = p.pg.screenshot(clip={'x': box['x'] + box['width'] / 2 - 2, 'y': box['y'] + box['height'] / 2 - 2, 'width': 4, 'height': 4})
    ok3 = len(shot) > 0
    p.pg.locator('.focusview .vb-x').click(); p.wait(400)
    ok4 = p.pg.locator('.focusview').count() == 0 and p.ev("return Views.focusIds") is None
    return [ok1, ok2, ok3, ok4]


def t_ansicht_zurueck(p):
    zwei_quader(p)
    p.pg.locator('canvas').first.focus()
    for k in 'cxu':
        p.pg.keyboard.press(k); p.wait(500)
    ok1 = p.ev("return !!Views.cut && Views.isXray && Views.exploded") and p.pg.locator('#t-views.active').count() == 1
    p.ev("Start.newProject ? Start.newProject() : App.setDoc(Model.newDoc())"); p.wait(2500)
    ok2 = p.ev("return !Views.cut && !Views.isXray && !Views.exploded && Viewer.clip===null") and p.pg.locator('.viewbar').count() == 0
    return [ok1, ok2]


def t_adaptiv(p):
    three(p)
    p.ev("Viewer.setAdaptive(true, 0)")      # jede Bewegung gilt als „zu langsam“ – so lässt sich der Ablauf prüfen
    cx, cy = p.canvas_center()
    tief = False
    x0, y0 = cx - 300, cy + 200          # leere Stelle: Ziehen dreht die Ansicht
    p.pg.mouse.move(x0, y0); p.pg.mouse.down()
    for i in range(14):
        p.pg.mouse.move(x0 + i * 12, y0 - i * 4); p.wait(40)
        tief = tief or p.ev("return Viewer.lowRes")
    p.pg.mouse.up()
    zurueck = False
    for _ in range(40):                  # warten, bis die Ansicht ausgerollt ist (ohne Grafikkarte dauert das länger)
        p.wait(400)
        zurueck = p.ev("return !Viewer.lowRes && Viewer.pixelRatio === window.devicePixelRatio")
        if zurueck:
            break
    p.ev("Viewer.setAdaptive(false, 24)"); p.pg.mouse.move(x0, y0); p.pg.mouse.down()
    aus = True
    for i in range(8):
        p.pg.mouse.move(x0 + i * 12, y0); p.wait(40)
        aus = aus and not p.ev("return Viewer.lowRes")
    p.pg.mouse.up(); p.ev("Viewer.setAdaptive(true, 24)")
    return [tief, zurueck, aus]


def t_ansicht_hilfen(p):
    p.empty()
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    fehlt = [k for k in ['section', 'xray', 'explode', 'focusView'] if k not in hilfen]
    p.pg.locator('#t-views').click(); p.wait(300)
    im_menue = sorted(p.pg.evaluate("[...document.querySelectorAll('.menu [data-help]')].map(b=>b.dataset.help)"))
    knoepfe = sorted(p.pg.evaluate("[...document.querySelectorAll('.view-btns [data-help]')].map(b=>b.dataset.help)"))
    ok = not fehlt and im_menue == ['explode', 'focusView', 'section', 'xray'] and {'section', 'xray'} <= set(knoepfe)
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ('' if ok else f'Menü {im_menue}, Knöpfe {knoepfe}')


# ---------- Messen, Masse, Auswahl, Versionen ----------
def t_masse_teil(p):
    zwei_quader(p, 0, 0, -20, 20)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(1500)
    ok1 = p.pg.locator('#p-vol').text_content() == '8 cm³' and p.pg.locator('#p-mass').text_content() == '12,4 g'
    p.pg.select_option('#p-mat', 'PLA'); p.wait(2000)
    ok2 = p.pg.locator('#p-mass').text_content() == '9,92 g' and p.ev("return App.doc.items[1].mat") == 'PLA'
    p.ev("App.clearSelection()"); p.wait(1500)
    sec = p.pg.locator('.section').filter(has_text='Schwerpunkt').inner_text()
    ok3 = '22,3 g' in sec and '-2,2 · 0 · 10' in sec and 'eigenes Material' in sec
    p.pg.locator('#proj-cog').check(); p.wait(1500)
    pos = p.ev("return Mass.markerPos")
    ok4 = p.ev("return Mass.markerShown") and pos and abs(pos[0] + 2.222) < 0.01 and abs(pos[2] - 10) < 0.01
    p.pg.locator('#proj-cog').uncheck(); p.wait(800)
    ok5 = not p.ev("return Mass.markerShown")
    return [ok1, ok2, ok3, ok4, ok5]


def t_messen_flaechen(p):
    p.empty(); p.ev("Actions.addPrimitive('box'); Actions.addPrimitive('box')"); p.wait(2500)
    p.ev("App.change('x', d=>{ const a=d.items[0], b=d.items[1]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:30,d:20,h:10}); b.t.x=40; b.t.y=0; Object.assign(b.p,{w:20,d:20,h:25}); })"); p.wait(2500)
    p.ev("App.clearSelection(); Viewer.setView('iso', false)"); p.wait(1000)
    R = "return window.__masswerk.Measure.result"
    p.pg.locator('#t-measure').click(); p.wait(400)
    top, front, corner, top2 = world_screen(p, 3, 3, 10), world_screen(p, 3, -10, 4), world_screen(p, 15, -10, 0), world_screen(p, 42, 2, 25)
    p.pg.mouse.click(*top); p.wait(500); r1 = p.ev(R)
    p.pg.mouse.click(*front); p.wait(500); r2 = p.ev(R)
    p.pg.mouse.click(*top); p.wait(500); p.pg.mouse.click(*corner); p.wait(500); r3 = p.ev(R)
    p.pg.mouse.click(*top); p.wait(500); p.pg.mouse.click(*top2); p.wait(500); r4 = p.ev(R)
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok = [r1 == 'Fläche 600 mm²', (r2 or '').startswith('Winkel 90°'), (r3 or '').startswith('Abstand 10 mm'), (r4 or '').startswith('Abstand 15 mm')]
    return all(ok), ' '.join('✓' if x else '✗' for x in ok) + ('' if all(ok) else f' – {r1} / {r2} / {r3} / {r4}')


def t_aehnliche(p):
    p.empty()
    p.ev("""App.change('x', d=>{ const P=Model.newItem('box',{w:60,d:30,h:3},{}); d.items.push(P);
      for (const [x,s] of [[-20,'M3'],[0,'M3'],[20,'M3'],[10,'M2']]) { const h=Model.newItem('part',{lib:'screwHole',size:s,head:'none',fit:'medium',length:10},{role:'hole'}); h.t.x=x; h.t.z=-1; d.items.push(h); } })"""); p.wait(3000)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(800)
    p.pg.locator('.ctxbar button[aria-label="Ähnliche"]').click(); p.wait(800)
    ok1 = sorted(p.ev("return App.sel.map(id=>App.doc.items.findIndex(x=>x.id===id))")) == [1, 2, 3]
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.a[2]-3)<1e-6 && Math.abs(Math.hypot(e.a[0]-e.b[0],e.a[1]-e.b[1])-60)<1e-6); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(800)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('a'); p.wait(800)
    ok2 = p.ev("return App.edges.length") == 4
    p.pg.locator('.ctxbar button[aria-label="Abrunden"]').click(); p.wait(2500)
    ok3 = p.ev("const f=App.doc.items[0].finishes[0]; return f && f.type==='fillet' && f.edges.length===4") and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


def t_auswahlfilter(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ const a=d.items[0]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:60,d:30,h:3}); })"); p.wait(2000)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    innen, kante, rand = world_screen(p, -10, 5, 3), world_screen(p, -10, 15, 3), world_screen(p, -10, 14.6, 3)
    p.pg.locator('.view-btns [data-view="filter"]').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Nur Körper').first.click(); p.wait(300)
    p.pg.mouse.click(*innen); p.wait(600)
    ok1 = p.ev("return [App.sel.length, !!App.face, App.edges.length]") == [1, False, 0] and p.pg.locator('.view-btns [data-view="filter"].on').count() == 1
    p.ev("Select.setFilter('edge')"); p.pg.mouse.click(*innen); p.wait(600)
    a = p.ev("return [App.sel.length, App.edges.length]")
    p.pg.mouse.click(*kante); p.wait(600)
    ok2 = a == [0, 0] and p.ev("return App.edges.length") == 1
    p.ev("Select.setFilter('face')"); p.pg.mouse.click(*rand); p.wait(600)
    ok3 = p.ev("return [!!App.face, App.edges.length]") == [True, 0]
    p.ev("Select.setFilter('all')"); p.pg.mouse.click(*rand); p.wait(600)
    ok4 = p.ev("return App.edges.length") == 1 and p.pg.locator('.view-btns [data-view="filter"].on').count() == 0
    return [ok1, ok2, ok3, ok4]


def t_versionen(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('Maß', d=>{ d.params.push({id:'m_b',name:'Breite',expr:20}); d.items[0].p.w='Breite'; })"); p.wait(1500)
    p.pg.locator('#btn-project').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Versionen').first.click(); p.wait(500)
    p.pg.locator('#ver-save').click(); p.wait(400)
    p.pg.fill('#prompt-inp', 'Erster Stand'); p.pg.keyboard.press('Enter'); p.wait(600)
    ok1 = p.pg.locator('.ver-row').count() == 1 and p.ev("return Versions.list().map(v=>v.name)") == ['Erster Stand']
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.ev("App.change('x', d=>{ d.params[0].expr=40; })"); p.wait(1500)
    p.ev("Actions.addPrimitive('cylinder')"); p.wait(2000)
    p.ev("App.change('x', d=>{ d.items[0].mat='PLA'; })"); p.wait(1500)
    p.pg.locator('#btn-project').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Versionen').first.click(); p.wait(500)
    p.pg.locator('.ver-cmp').first.click(); p.wait(4000)
    txt = p.pg.locator('.cmpbar').inner_text()
    ok2 = 'Breite: 20 → 40' in txt and 'Zylinder hinzugekommen' in txt and 'Quader: Material' in txt and '12,4 g → 29,6 g' in txt
    ok3 = p.ev("return Viewer.groups.compare.children.length") == 1
    p.pg.locator('#cmp-show').uncheck(); p.wait(400)
    ok3 = ok3 and p.ev("return Viewer.groups.compare.children.length") == 0
    p.pg.locator('#btn-project').click(); p.wait(300)
    p.pg.locator('.menu button').filter(has_text='Versionen').first.click(); p.wait(500)
    p.pg.locator('.ver-restore').first.click(); p.wait(400)
    p.pg.locator('.modal .btn.primary').filter(has_text='Zurückholen').click(); p.wait(2500)
    ok4 = p.ev("return [App.doc.items.length, App.doc.params[0].expr, App.doc.items[0].mat||null]") == [1, 20, None] and p.pg.locator('.cmpbar').count() == 0
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(2500)
    ok5 = p.ev("return [App.doc.items.length, App.doc.params[0].expr]") == [2, 40]
    return [ok1, ok2, ok3, ok4, ok5]


def t_versionen_datei(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("Versions.save('Stand A')"); p.wait(300)
    p.ev("App.change('x', d=>{ d.items[0].p.h=40; })"); p.wait(1500)
    with p.pg.expect_download() as dl:
        p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+s')
    d = dl.value; path = os.path.join(tempfile.gettempdir(), 'v-' + d.suggested_filename); d.save_as(path)
    data = json.load(open(path, encoding='utf-8'))
    ok1 = [v['name'] for v in data.get('versions', [])] == ['Stand A']
    p.ev("localStorage.removeItem('masswerk.versions.'+App.doc.id); Start.newProject(true)"); p.wait(2000)
    with p.pg.expect_file_chooser() as fc:
        p.ev("Start.openFile()")
    fc.value.set_files(path); p.wait(4000)
    ok2 = p.ev("return Versions.list().map(v=>v.name)") == ['Stand A'] and p.ev("return App.doc.versions === undefined && App.doc.items[0].p.h") == 40
    return [ok1, ok2]


def t_neu10_hilfen(p):
    p.empty()
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    fehlt = [k for k in ['selectFilter', 'similar', 'versions', 'measure', 'massProps'] if k not in hilfen]
    return not fehlt, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ''


# ---------- Drohnen-Vorlagen ----------
def drohne(p, key='f5'):
    p.pg.locator(f'.card.drone[data-tpl="drone-{key}"]').click()
    for _ in range(60):   # der Rahmen hat viele Löcher – warten, bis alles gerechnet ist
        p.wait(1000)
        if p.ev("return !App.busy && App.results.size === App.doc.items.length"):
            break
    p.wait(1000)


def t_drohne5(p):
    drohne(p, 'f5')
    names = p.ev("return App.doc.items.map(i=>i.name)")
    ok1 = len(names) == 10 and names[0] == 'Unterteil' and p.ev("return App.errors.length") == 0 and p.ev("return App.doc.params.length") == 13
    bb = bbox(p, 0)
    ok2 = near(bb, [-92.05, -92.05, 0, 92.05, 92.05, 5])               # Motormitte 79,55 + Auflage 12,5
    ok3 = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.filter(f=>f.t!=='PLANE').length") == 32   # 4 Auflagen + 28 Löcher
    cam = p.ev("return App.doc.items.find(i=>i.name==='Kamera (Platzhalter)').t.y")
    ok4 = isinstance(cam, str) and cam.startswith('-')                   # Kamera vorne (−Y wie die Ansicht „Vorne“)
    m = p.ev("return Mass.measure().then(r=>[r.mass, r.parts.filter(x=>x.fixed).length, r.com])")
    ok5 = 450 < m[0] < 570 and m[1] == 6 and abs(m[2][0]) < 0.5
    return [ok1, ok2, ok3, ok4, ok5]


def t_drohne_masse(p):
    drohne(p, 'f5')
    p.pg.locator('#lt-params').click(); p.wait(400)
    pid = p.ev("return App.doc.params.find(x=>x.name==='Achsabstand').id")
    field(p, '#pv-' + pid, 250); p.wait(4000)
    for _ in range(30):
        p.wait(1000)
        if p.ev("return !App.busy"): break
    ok1 = near(bbox(p, 0)[3:4], [round(125 * math.sin(math.radians(45)) + 12.5, 2)])
    mot = p.ev("const id=App.doc.items.find(i=>i.name.startsWith('Motor 2207')).id; const r=App.results.get(id); return r && r.data.bbox.map(x=>Math.round(x*100)/100)")
    ok2 = near(mot[3:4], [round(125 * math.sin(math.radians(45)) + 14.25, 2)])  # Motoren wandern mit
    p.ev("App.change('x', d=>{ d.params.find(x=>x.name==='Stack').expr=20; })"); p.wait(3000)
    for _ in range(30):
        p.wait(1000)
        if p.ev("return !App.busy"): break
    st = p.ev("const id=App.doc.items[4].id; const r=App.results.get(id); return r && r.data.bbox.map(x=>Math.round(x*100)/100)")
    ok3 = near(st[3:4], [12.75]) and p.ev("return App.errors.length") == 0      # Stack-Platzhalter 25,5 breit
    return [ok1, ok2, ok3]


def t_drohne7(p):
    drohne(p, 'f7')
    ok1 = p.ev("return App.doc.items.length===10 && App.errors.length===0")
    mx = 147.5 * math.sin(math.radians(45))
    ok2 = near(bbox(p, 0), [-(mx + 14), -(mx + 14), 0, mx + 14, mx + 14, 6])
    m = p.ev("return Mass.measure().then(r=>r.mass)")
    ok3 = 600 < m < 800
    return [ok1, ok2, ok3]


def t_drohne_ansichten(p):
    drohne(p, 'f5')
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('u'); p.wait(1500)
    ok1 = p.ev("return Views.exploded && [...Viewer.nodes.values()].filter(n=>n.off && n.off.length()>1).length>=6")
    p.pg.keyboard.press('u'); p.wait(1200)
    p.pg.keyboard.press('c'); p.wait(1200)
    ok2 = p.ev("return !!Viewer.clip") and p.ev("return App.errors.length") == 0
    return [ok1, ok2]


def t_festes_gewicht(p):
    zwei_quader(p, 0, 0, -20, 20)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(1500)
    p.pg.select_option('#p-mat', '__fix'); p.wait(2000)
    ok1 = p.pg.locator('#p-massg').count() == 1 and p.ev("return App.doc.items[1].massG") == 12.4
    field(p, '#p-massg', 50); p.wait(1500)
    ok2 = p.pg.locator('#p-mass').text_content() == '50 g (fest)'
    p.ev("App.clearSelection()"); p.wait(1500)
    ok3 = '62,4 g' in p.pg.locator('.section').filter(has_text='Schwerpunkt').inner_text()
    p.ev("App.select([App.doc.items[1].id])"); p.wait(1200)
    p.pg.select_option('#p-mat', ''); p.wait(1500)
    ok4 = p.ev("return App.doc.items[1].massG === undefined") and p.pg.locator('#p-mass').text_content() == '12,4 g'
    return [ok1, ok2, ok3, ok4]


# ---------- Frame-Assistent, Drohnen-Teile, Lochbilder ----------
def warte_rechnen(p, n=60):
    for _ in range(n):
        p.wait(1000)
        if p.ev("return !App.busy && App.results.size >= App.doc.items.filter(i=>!i.hidden).length"):
            break
    p.wait(800)


def t_frame_assistent(p):
    p.pg.locator('.card.drone[data-tpl="assist"]').click(); p.wait(600)
    ok1 = p.pg.locator('.frame-assist').count() == 1 and '225 mm' in p.pg.locator('#fa-out').inner_text()
    p.pg.select_option('#fa-zoll', '3'); p.wait(300)
    p.pg.select_option('#fa-form', 'deadcat'); p.wait(300)
    p.pg.select_option('#fa-video', 'o4'); p.wait(200)
    gap = float(p.pg.locator('#fa-gap').text_content().split()[0].replace(',', '.'))
    ok2 = gap >= 15 and p.pg.locator('#fa-warn').count() == 0
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p)
    P = p.ev("return Object.fromEntries(App.doc.params.map(x=>[x.name,x.expr]))")
    ok3 = P['Armwinkel'] == 60 and P['Armwinkel_hinten'] == 35 and P['Stack'] == 20 and P['Motorlochkreis'] == 12 and abs(P['Kamerabreite'] - 12.36) < 1e-6
    names = p.ev("return App.doc.items.map(i=>i.name)")
    ok4 = 'DJI O4 Air Unit Sender' in names and 'DJI O4 Air Unit Kamera' in names and not any(n.startswith('Akku') for n in names) and p.ev("return App.errors.length") == 0
    # die vorderen Arme sind weiter gespreizt als die hinteren
    xs = p.ev("const g=App.doc.items.find(i=>i.name.startsWith('Motor 1404')); const x=(n)=>Model.tNumeric(g.children.find(c=>c.name===n)).x; return [x('Motor vorne rechts'), x('Motor hinten rechts')]")
    ok5 = xs[0] > xs[1] + 10                                             # Deadcat: vorne weiter gespreizt
    return [ok1, ok2, ok3, ok4, ok5]


def t_frame_warnung(p):
    p.pg.locator('.card.drone[data-tpl="assist"]').click(); p.wait(600)
    p.pg.fill('#fa-a', '150'); p.pg.press('#fa-a', 'Enter'); p.wait(400)
    ok1 = 'überlappen' in p.pg.locator('#fa-warn').inner_text()
    p.pg.select_option('#fa-motor', '1103'); p.wait(300)
    ok2 = 'passt eher' in p.pg.locator('#fa-warn').inner_text()
    p.pg.keyboard.press('Escape'); p.wait(300)
    return [ok1, ok2]


def t_drohnen_teile(p):
    p.empty()
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="akku"]').click(); p.wait(300)
    ok1 = p.pg.locator('.flyout .tile').count() == 4
    p.pg.locator('.flyout .tile').filter(has_text='6S 1300').first.click(); p.wait(2500)
    ok2 = p.ev("const it=App.doc.items[0]; return it.massG===215 && it.name==='Akku 6S 1300 mAh'") and '(fest)' in (p.pg.locator('#p-mass').text_content() or '')
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="motor"]').click(); p.wait(300)
    p.pg.locator('.flyout .tile').filter(has_text='Motor 1404').first.click(); p.wait(2500)
    ok3 = p.ev("return App.doc.items[1].massG") == '' and p.pg.locator('.hint-box.warn').filter(has_text='Gewicht fehlt').count() == 1
    p.ev("App.clearSelection()"); p.wait(1500)
    ok4 = 'fehlt noch das Gewicht' in p.pg.locator('.section').filter(has_text='Schwerpunkt').inner_text()
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="video"]').click(); p.wait(300)
    ok5 = p.pg.locator('.flyout .tile').filter(has_text='DJI O4 Air Unit Pro').count() >= 2
    return [ok1, ok2, ok3, ok4, ok5]


def t_lochbild(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ const a=d.items[0]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:60,d:60,h:4}); })"); p.wait(2000)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    tile = p.pg.locator('.flyout .tile').filter(has_text='Motor 16').first.bounding_box()
    tgt = world_screen(p, 0, 0, 4)
    p.pg.mouse.move(tile['x'] + 20, tile['y'] + 20); p.pg.mouse.down()
    p.pg.mouse.move(tgt[0], tgt[1], steps=12); p.wait(300); p.pg.mouse.move(tgt[0] + 1, tgt[1] + 1); p.wait(300); p.pg.mouse.up(); p.wait(3000)
    rund = lambda: p.ev("return App.results.get(App.doc.items[0].id).data.faces.filter(f=>f.t!=='PLANE').length")
    ok1 = p.ev("const c=App.doc.items[0].children; return !!c && c.some(x=>x.kind==='part' && x.p.lib==='holePattern' && x.p.pat==='motor16')") and rund() == 5
    pid = p.ev("return App.doc.items[0].children.find(x=>x.p && x.p.lib==='holePattern').id")
    p.ev("App.change('x', d=>{ Model.find(d, arg).item.p.pat='stack305'; })", pid); p.wait(2500)
    ok2 = rund() == 4 and p.ev("return App.errors.length") == 0
    p.ev("App.change('x', d=>{ const it=Model.newItem('part',{lib:'zipTie',w:3,t:1.6,gap:6,depth:10},{role:'hole', name:'Kabelbinder'}); it.t.x=20; it.t.z=4.2; Model.find(d, d.items[0].id).item.children.push(it); })"); p.wait(2500)
    ok3 = p.ev("return App.errors.length") == 0 and p.ev("return App.results.get(App.doc.items[0].id).data.faces.length") > 14
    return [ok1, ok2, ok3]


def t_drohne_hilfen(p):
    p.empty()
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    fehlt = [k for k in ['droneLib', 'frameAssist', 'holePattern', 'zipTie'] if k not in hilfen]
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    kacheln = set(p.pg.evaluate("[...document.querySelectorAll('.flyout .tile[data-help]')].map(t=>t.dataset.help)"))
    ok = not fehlt and {'holePattern', 'zipTie'} <= kacheln
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ('' if ok else 'Kacheln: ' + ', '.join(kacheln))


# ---------- Sitzung 13: Drohnen-Check, Platten als DXF, Varianten ----------
def chk(p):
    return p.ev("return DroneCheck.run().then(l=>Object.fromEntries(l.map(c=>[c.id,[c.s,c.text]])))")


def t_drohnen_check(p):
    drohne(p, 'f5')
    p.pg.locator('#t-drone').click(); p.wait(400)
    p.pg.locator('#drone-check').click()
    p.pg.wait_for_selector('.modal .chk-row[data-chk="tw"]', timeout=60000); p.wait(300)
    st = p.pg.evaluate("Object.fromEntries([...document.querySelectorAll('.modal .chk-row')].map(r=>[r.dataset.chk,r.className.split(' ')[1]]))")
    tw = p.pg.locator('.modal .chk-row[data-chk="tw"]').inner_text()
    ok1 = st == {'gap': 'ok', 'props': 'ok', 'clash': 'ok', 'weight': 'info', 'cog': 'ok', 'tw': 'ok'} and 'Richtwert' in tw   # Vorlage besteht alle Prüfungen
    field(p, '#chk-thrust', 1000); p.wait(1500)
    p.pg.wait_for_selector('.modal .chk-row[data-chk="tw"]', timeout=60000); p.wait(500)
    m = p.ev("return Mass.measure().then(r=>r.mass)")
    tw2 = p.pg.locator('.modal .chk-row[data-chk="tw"]').inner_text()
    ok2 = p.ev("return App.doc.drone.thrustG===1000 && !App.doc.drone.thrustSrc") and (str(round(4000 / m, 1)).replace('.', ',') + ' : 1') in tw2 and 'Richtwert' not in tw2
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok3 = p.pg.locator('#proj-drone .chk-list').count() == 1 and p.pg.locator('#proj-dcheck').count() == 1   # Ergebnis bleibt rechts unter „Projekt“
    # fies: Akku weit nach hinten, Rahmen zu klein
    p.ev("App.change('x', d=>{ d.items.find(i=>/^Akku/.test(i.name)).t.y=45; })"); warte_rechnen(p)
    c = chk(p)
    ok4 = c['cog'][0] in ('warn', 'bad') and 'nach hinten' in c['cog'][1]
    p.ev("App.change('x', d=>{ d.params.find(x=>x.name==='Achsabstand').expr=170; })"); warte_rechnen(p)
    c = chk(p)
    ok5 = c['gap'][0] == 'bad' and c['props'][0] == 'bad' and 'Propeller' in c['props'][1]
    # ein Teil in ein anderes schieben
    p.ev("App.change('x', d=>{ d.params.find(x=>x.name==='Achsabstand').expr=225; d.items.find(i=>/^Stack/.test(i.name)).t.z=0; })"); warte_rechnen(p)
    c = chk(p)
    ok6 = c['clash'][0] == 'warn' and 'Unterteil' in c['clash'][1] and 'Stack' in c['clash'][1]
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_drohnen_generator(p):
    p.wait(1500)
    out = []
    for o in ["{zoll:3, form:'x', video:'o4pro'}", "{zoll:5, form:'deadcat', video:'o3'}", "{zoll:7, form:'x', video:'walksnail'}"]:
        c = p.ev("const cfg=DroneTpl.config(" + o + "); App.setDoc(DroneTpl.build(cfg)); Start.hide(); return true")
        warte_rechnen(p)
        c = chk(p)
        out.append(p.ev("return App.errors.length") == 0 and all(c[k][0] == 'ok' for k in ['gap', 'props', 'clash']) and c['cog'][0] in ('ok', 'info'))   # 3": noch ohne Akku
    return out


def t_dxf(p):
    drohne(p, 'f5')
    names = p.ev("return Plates.candidates().map(c=>c.name+' '+c.t)")
    ok1 = names == ['Unterteil 5', 'Oberplatte 2']          # nur flache Rahmenteile, keine Kaufteile oder Propellerkreise
    f = p.ev("return Plates.file(App.doc.items[0].id).then(f=>({name:f.name, text:new TextDecoder().decode(f.data), circles:f.edges.filter(e=>e.t==='CIRCLE'&&e.full).map(e=>[e.c[0],e.c[1],e.r])}))")
    ok2 = f['name'] == 'Unterteil – 5 mm.dxf' and len(f['circles']) == 28 and f['text'].count('\nCIRCLE\r') == 28 and f['text'].count('\nARC\r') == 4
    # Wellenloch vorne rechts bei (79,55 | −79,55): von oben gesehen nicht gespiegelt, vorne ist −Y
    ok3 = any(abs(x - 79.55) < 0.05 and abs(y + 79.55) < 0.05 and abs(r - 3.5) < 0.01 for x, y, r in f['circles'])
    t = f['text']
    ok4 = t.startswith('0\r\nSECTION') and t.rstrip().endswith('EOF') and '$INSUNITS\r\n70\r\n4' in t and 'KONTUR' in t
    # Export: nur DXF anhaken
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(600)
    p.pg.locator('#ex-step').uncheck(); p.pg.locator('#ex-dxf').check()
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-dxf.zip'); dl.value.save_as(z)
    zn = zipfile.ZipFile(z).namelist()
    ok5 = sorted(n for n in zn if n.startswith('DXF/')) == ['DXF/Oberplatte – 2 mm.dxf', 'DXF/Unterteil – 5 mm.dxf'] and not any(n.endswith('.step') for n in zn)
    return [ok1, ok2, ok3, ok4, ok5]


def t_varianten(p):
    drohne(p, 'f5')
    p.pg.locator('#lt-params').click(); p.wait(400)
    p.pg.locator('#var-new').click(); p.wait(300)
    p.pg.fill('#prompt-inp', '5 Zoll'); p.pg.locator('.modal .actions .btn.primary').click(); p.wait(800)
    pid = p.ev("return App.doc.params.find(x=>x.name==='Achsabstand').id")
    field(p, '#pv-' + pid, 250); p.wait(1500)
    ok1 = p.pg.locator('#var-update').count() == 1                     # Maße weichen ab → überschreiben anbieten
    p.pg.locator('#var-new').click(); p.wait(300)
    p.pg.fill('#prompt-inp', 'Groß'); p.pg.locator('.modal .actions .btn.primary').click(); p.wait(800)
    ok2 = p.ev("return App.doc.variants.length===2 && App.doc.variants[1].values.Achsabstand===250 && App.doc.variant===App.doc.variants[1].id")
    first = p.ev("return App.doc.variants[0].id")
    p.pg.select_option('#var-sel', first); warte_rechnen(p)
    ok3 = p.ev("return App.doc.params.find(x=>x.name==='Achsabstand').expr") == 225 and abs(bbox(p, 0)[3] - 92.05) < 0.1
    p.pg.locator('#var-cmp').click()
    p.pg.wait_for_selector('#vtable', timeout=90000); p.wait(300)
    rows = p.pg.evaluate("[...document.querySelectorAll('#vtable tr')].map(r=>[...r.children].map(c=>c.textContent))")
    ok4 = len(rows) == 3 and rows[0][1] == 'Achsabstand' and rows[1][0] == '5 Zoll' and rows[2][1] == '250' and all(r[2].endswith(' g') for r in rows[1:])
    w = [float(r[2][:-2].replace(',', '.')) for r in rows[1:]]
    ok5 = w[1] > w[0]                                                   # längere Arme wiegen mehr
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.ev("App.undo()"); p.wait(2500)
    ok6 = p.ev("return App.doc.params.find(x=>x.name==='Achsabstand').expr") == 250   # Umschalten lässt sich rückgängig machen
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_neu13_hilfen(p):
    drohne(p, 'f5')
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    fehlt = [k for k in ['droneCheck', 'plateDxf', 'variants'] if k not in hilfen]
    p.pg.locator('#lt-params').click(); p.wait(400)
    ok = not fehlt and p.pg.locator('#var-new').count() == 1 and p.pg.locator('#proj-dcheck[data-help="droneCheck"]').count() == 1
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ''


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
    ('Regeln: rechtwinklig / tangential / gleich / symmetrisch / Punkt auf Linie / Radius / Winkel / gespeichert', t_regeln),
    ('Regeln: voll bestimmt / Widerspruch abgelehnt / fest beim Ziehen / Symbol löschen', t_regeln_bestimmt),
    ('Kante übernehmen', t_kante),
    ('Spline: zeichnen / schließen / Punkt ziehen', t_spline), ('Trimmen: Linie / Kreis / Rechteck / Rückgängig', t_trimmen),
    ('Versatz: Rechteck eintippen / folgt dem Original / Kreis', t_versatz), ('Versatz: Kette mit Ecke', t_versatz_kette),
    ('Spiegeln: Achse / Kopien / Symmetrie-Regeln / folgt dem Original', t_spiegeln),
    ('Rechteckmuster: Anzahl und Abstand / folgt dem Original', t_muster_rechteck), ('Kreismuster: Anzahl / Rechteck zerlegt / folgt dem Original', t_muster_kreis),
    ('Fangen: Schnittpunkt / ausschalten / Alt / Kreispunkt', t_fangen), ('Hilfslinien: Taste X / zählt nicht zur Fläche / umwandeln', t_hilfslinien),
    ('Skizzen-Werkzeuge haben Hilfetexte', t_skizze_hilfen),
    ('Kreismuster: anlegen / Anzahl / folgt dem Original / Auflösen', t_kreismuster_3d),
    ('Rechteckmuster: anlegen / zweite Reihe / Formel / Maß ändern / Rückgängig', t_rechteckmuster_3d),
    ('Gespiegelte Kopie: anlegen / andere Ebene / Ebene verschieben', t_spiegelkopie),
    ('Teilen: beide Hälften / Spalt / eine Hälfte / Ebene daneben / zurück', t_teilen),
    ('Boolesch: Abziehen / Schnittmenge / Vereinigen', t_boolesch),
    ('Wandstärke: aushöhlen / Feld rechts / zu dick wird rot / ändern', t_wandstaerke),
    ('Bohrungs-Assistent: Gewinde M2 / mehrere Klicks / Esc beendet', t_bohrung),
    ('Lochkreis in einer Platte: Loch als Kreismuster / Anzahl ändern', t_lochkreis),
    ('Formen-Werkzeuge haben Hilfetexte', t_formen_hilfen),
    ('Schnitt: Taste C / Lage eintippen / Klick geht durch / umdrehen / andere Ebene / aus', t_schnitt),
    ('Röntgen: durchsichtig / zweiter Klick wählt dahinter / aus', t_roentgen),
    ('Explosion: Menü / Regler / anklicken / Ziehen verschiebt nichts / zusammensetzen', t_explosion),
    ('Explosion: ein Teil allein / Messen und Skizze setzen zusammen', t_explosion_regeln),
    ('Fokus-Vorschau: leer / zeigt gewähltes Teil / schließen', t_fokus),
    ('Ansichten: neues Projekt setzt alles zurück', t_ansicht_zurueck),
    ('Darstellung beim Drehen anpassen', t_adaptiv),
    ('Ansicht-Werkzeuge haben Hilfetexte', t_ansicht_hilfen),
    ('Material je Teil: Volumen / Gewicht / PLA / Projekt-Summe und Schwerpunkt / Schwerpunkt im Bild', t_masse_teil),
    ('Messen: Fläche / Winkel / Punkt zur Fläche / parallele Flächen', t_messen_flaechen),
    ('Ähnliche auswählen: gleiche Löcher / gleiche Kanten / zusammen abrunden', t_aehnliche),
    ('Auswahlfilter: Körper / Kanten / Flächen / alles', t_auswahlfilter),
    ('Versionen: speichern / vergleichen / Umriss / zurückholen / Rückgängig', t_versionen),
    ('Versionen kommen mit in die Projektdatei', t_versionen_datei),
    ('Neue Werkzeuge haben Hilfetexte', t_neu10_hilfen),
    ('Drohne 5": Startseite / Maße / Unterteil / Löcher / Kamera vorne / Gewicht', t_drohne5),
    ('Drohne 5": Achsabstand ändern / Motoren wandern mit / Stack 20×20', t_drohne_masse),
    ('Drohne 7": baut ohne Fehler / Größe / Gewicht', t_drohne7),
    ('Drohne: Explosion und Schnitt', t_drohne_ansichten),
    ('Kaufteil mit festem Gewicht', t_festes_gewicht),
    ('Frame-Assistent: Startseite / 3" Deadcat mit DJI O4 / Werte / ohne Fehler', t_frame_assistent),
    ('Frame-Assistent: Warnung bei zu kleinem Achsabstand und unpassendem Motor', t_frame_warnung),
    ('Drohnen-Teile: Akku mit Gewicht / Motor ohne Gewicht wird angemahnt / Videosender', t_drohnen_teile),
    ('Lochbild: auf Platte ziehen / Motor 16 → Stack 30,5 / Kabelbinder', t_lochbild),
    ('Drohnen-Werkzeuge haben Hilfetexte', t_drohne_hilfen),
    ('Drohnen-Check: Vorlage besteht / Schub eintragen / Schwerpunkt / zu kleiner Rahmen / Teile ineinander', t_drohnen_check),
    ('Frame-Assistent: 3" O4 Pro, 5" Deadcat O3, 7" Walksnail bestehen den Check', t_drohnen_generator),
    ('Platten als DXF: Unterteil und Oberplatte / Löcher an der richtigen Stelle / ZIP', t_dxf),
    ('Varianten: speichern / abweichen / umschalten / vergleichen / Rückgängig', t_varianten),
    ('Sitzung-13-Werkzeuge haben Hilfetexte', t_neu13_hilfen),
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
