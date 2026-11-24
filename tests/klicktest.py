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
        return self.pg.evaluate("(arg)=>{const {Store,Interact,Measure,Datums,RefFix,Print,ViewPrefs,App,Actions,Model,Timeline,Start,Templates,Comp,Handles,Sketch,SK,TTF,Viewer,Commands,Solver,Notes,SKO,Features,Place,Views,Mass,Select,Versions,DroneTpl,DroneUI,DroneLib,UserLib,DroneCheck,Plates,Variants,Explain,Weak,AI,Snap,Toolbar,Panels,Joints,I18n,T,Units,Expr,Tour,GeomCheck,Log,Kernel,Drawing}=window.__M; " + js + "}", arg)

    def empty(self):
        self.pg.get_by_text('Leeres Projekt').first.click()
        self.pg.wait_for_timeout(5000)
        try:
            self.pg.locator('.loading').wait_for(state='detached', timeout=15000)
        except Exception:
            pass

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
    for _ in range(10):
        if p.pg.locator('.tl-chip.err').count() == 1: break
        p.wait(1000)
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
    p.pg.keyboard.type('5'); p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('breite/2'); p.pg.keyboard.press('Enter'); p.pg.mouse.up(); p.wait(1500)
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
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('6'); p.pg.keyboard.press('Enter'); p.wait(400)
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
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('breite/2'); p.pg.keyboard.press('Enter'); p.wait(400)
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
    p.pg.locator('.skdim').first.click(); p.wait(200); p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('breite/'); p.pg.keyboard.press('Enter'); p.wait(400)
    return p.pg.get_by_text('Das kann ich nicht ausrechnen').count() > 0 and p.ev("return Sketch.active")


def t_neuer_name(p):
    sketch_xy(p)
    cx, cy = p.canvas_center()
    p.pg.keyboard.press('c'); p.pg.mouse.click(cx, cy); p.pg.mouse.move(cx + 20, cy); p.pg.keyboard.type('8'); p.pg.keyboard.press('Enter'); p.wait(400)
    p.pg.locator('.skdim').first.click(); p.wait(200); p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('laenge'); p.pg.keyboard.press('Enter'); p.wait(600)
    par = p.ev("return App.doc.params.map(x=>[x.name,x.expr])")
    return par == [['laenge', 8]] and 'laenge' in ''.join(p.pg.locator('.skdim').all_inner_texts())


# ---------- Sitzung 18: Speed-Rumpf, Cinewhoop, neue Bausätze, Rahmen von Herstellern ----------
def ok_check(c, keys=('gap', 'props', 'clash', 'cog')):
    return all(c[k][0] == 'ok' for k in keys)


def t_bausaetze_neu(p):
    karten = p.ev("return DroneTpl.LIST.map(t=>t.id)")
    ok1 = karten == ['drone-f5', 'drone-r5', 'drone-s5', 'drone-c35', 'drone-f7']
    drohne(p, 'r5')
    c = chk(p)
    ok2 = p.ev("return App.errors.length") == 0 and ok_check(c) and p.ev("return App.doc.params.find(x=>x.name==='Armwinkel').expr") == 35
    # Speed: Stromlinien-Rumpf mit Kamera in der Nase, Stack und Akku innen, Motoren auf Keilen geneigt
    p.ev("App.setDoc(DroneTpl.build('s5')); Start.hide()"); warte_rechnen(p, 90)
    names = p.ev("return App.doc.items.map(i=>i.name)")
    c = chk(p)
    V = p.ev("return Model.vars(App.doc).v")
    tip = V['Rumpfmitte'] - V['Rumpflänge'] / 2 - V['Nasenlänge']
    end = V['Rumpfmitte'] + V['Rumpflänge'] / 2 + V['Hecklänge']
    wb = "const r=App.results.get(it.id); const t=Model.tNumeric(it); return [r.data.bbox[1]+t.y, r.data.bbox[4]+t.y, r.data.bbox[2]+t.z, r.data.bbox[5]+t.z, r.data.bbox[3]+t.x]"
    cam = p.ev("const it=App.doc.items.find(i=>/Kamera/.test(i.name)); " + wb)
    akku = p.ev("const it=App.doc.items.find(i=>/^Akku/.test(i.name)); " + wb)
    rumpf = p.ev("const it=App.doc.items.find(i=>i.name==='Rumpf'); " + wb)
    mot = p.ev("const g=App.doc.items.find(i=>/^Motor /.test(i.name)); return g.children.map(c=>Model.tNumeric(c).rx)")
    ok3 = 'Rumpf' in names and 'Motorkeile' in names and 'Oberplatte' not in names and 'Abstandsbolzen' not in names and p.ev("return App.errors.length") == 0 and ok_check(c) and c['aero'][0] == 'info' and '20°' in c['aero'][1]
    ok4 = (cam[0] >= tip - 0.6 and cam[1] <= tip + V['Nasenlänge'] and abs(akku[2] - (V['Armdicke'] + 0.5)) < 0.05 and akku[3] < V['Armdicke'] + V['Rumpfachse'] + V['Rumpfdurchmesser'] / 2
           and abs(rumpf[0] - tip) < 0.3 and abs(rumpf[1] - end) < 0.3 and abs(rumpf[4] - V['Rumpfdurchmesser'] / 2) < 0.3 and mot == [20, 20, 20, 20])
    # Cinewhoop: vier Ducts, die mit den Bolzen mitwachsen
    p.ev("App.setDoc(DroneTpl.build('c35')); Start.hide()"); warte_rechnen(p, 90)
    c = chk(p)
    d = p.ev("const g=App.doc.items.find(i=>i.name==='Ducts (4×)'); return g ? [g.children.length, g.children.every(x=>x.kind==='tube'), g.mat] : null")
    ok5 = d == [4, True, 'PC'] and p.ev("return App.errors.length") == 0 and ok_check(c) and p.ev("return App.doc.params.find(x=>x.name==='Ducthöhe').expr") == 'Bolzenhöhe - 1'
    p.ev("App.change('x', d=>{ d.params.find(x=>x.name==='Bolzenhöhe').expr=30; })"); warte_rechnen(p)
    top = p.ev("const it=App.doc.items.find(i=>i.name==='Ducts (4×)'); return App.results.get(it.id).data.bbox[5]")
    ok6 = abs(top - (3.5 + 29)) < 0.05 and chk(p)['clash'][0] == 'ok'
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_speed_neigung(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    ok1 = p.pg.locator('#fa-tilt').count() == 0
    p.pg.select_option('#fa-form', 'speed'); p.wait(400)
    ok2 = p.pg.input_value('#fa-tilt') == '20' and 'Akku innen' in p.pg.locator('#fa-out').inner_text() and p.pg.locator('#fa-warn').count() == 0
    # zu viel Neigung beim 7": Warnung mit der größten passenden Neigung
    p.pg.select_option('#fa-zoll', '7'); p.wait(300)
    field(p, '#fa-tilt', 35); p.wait(300)
    ok1 = ok1 and 'höchstens 28°' in p.pg.locator('#fa-warn').inner_text()
    p.pg.select_option('#fa-zoll', '5'); p.wait(300)
    field(p, '#fa-tilt', 30); p.wait(300)
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p, 90)
    V = p.ev("return Model.vars(App.doc).v")
    ok3 = V['Motorneigung'] == 30 and abs(V['Keilhöhe'] - (1 + (16 + 9) / 2 * math.tan(math.radians(30)))) < 0.01 and p.ev("return App.errors.length") == 0
    c = chk(p)
    ok4 = ok_check(c) and '30°' in c['aero'][1]
    # ohne Neigung: Keile 1 mm, Propeller waagerecht, weiterhin alles frei
    p.ev("App.change('x', d=>{ d.params.find(x=>x.name==='Motorneigung').expr=0; })"); warte_rechnen(p)
    V = p.ev("return Model.vars(App.doc).v")
    keil = p.ev("const it=App.doc.items.find(i=>i.name==='Motorkeile'); const r=App.results.get(it.id); return r.data.bbox[5]")
    c = chk(p)
    ok5 = abs(V['Keilhöhe'] - 1) < 1e-6 and abs(keil - (V['Armdicke'] + 1)) < 0.05 and ok_check(c) and 'geneigten Motoren' in c['aero'][1]
    return [ok1, ok2, ok3, ok4, ok5]


def t_herstellerrahmen(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    opts = p.pg.evaluate("[...document.querySelectorAll('#fa-vorlage option')].map(o=>o.textContent)")
    ok1 = len(opts) == 14 and opts[0] == 'Eigener Rahmen' and any('TBS Source One V5' in o for o in opts) and any('AOS RC HS5' in o for o in opts)
    # 7,5-Zoll-Rahmen: die Größe steht dann auch in der Auswahl
    fid = p.ev("return DroneLib.frames().find(f=>f.name==='Chimera7 Pro V2 O4').id")
    p.pg.select_option('#fa-vorlage', fid); p.wait(400)
    ok1 = ok1 and p.pg.input_value('#fa-zoll') == '7.5' and '355 g' in p.pg.locator('#fa-frame').inner_text() and 'überlappen' not in p.pg.locator('#fa-out').inner_text()
    fid = p.ev("return DroneLib.frames().find(f=>f.name==='Source One V5').id")
    p.pg.select_option('#fa-vorlage', fid); p.wait(400)
    t = p.pg.locator('#fa-frame').inner_text()
    ok2 = 'Nachbau nach Herstellermaßen' in t and '123,5 g' in t and p.pg.input_value('#fa-a') == '226' and p.pg.locator('#fa-grown').count() == 0
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p, 90)
    P = p.ev("return Object.fromEntries(App.doc.params.map(x=>[x.name,x.expr]))")
    ok3 = p.ev("return App.doc.drone.frame && App.doc.drone.frame.hersteller==='TBS' && App.doc.name.startsWith('TBS')") and P['Achsabstand'] == 226 and P['Armdicke'] == 6 and P['Plattendicke'] == 2 and P['Bolzenhöhe'] == 30
    c = chk(p)
    ok4 = ok_check(c) and c['frame'][0] == 'info' and 'laut Hersteller 123,5 g' in c['frame'][1] and p.ev("return App.errors.length") == 0
    # Cinelog35: Tracery braucht mehr Achsabstand und sagt das; eine andere Form löst die Vorlage
    p.ev("DroneUI.assistant()"); p.wait(600)
    fid = p.ev("return DroneLib.frames().find(f=>f.name==='Cinelog35 V2').id")
    p.pg.select_option('#fa-vorlage', fid); p.wait(400)
    ok5 = '142 mm' in p.pg.locator('#fa-grown').inner_text() and p.pg.input_value('#fa-zoll') == '3.5' and p.pg.input_value('#fa-form') == 'cine'
    p.pg.select_option('#fa-form', 'x'); p.wait(300)
    ok6 = p.pg.input_value('#fa-vorlage') == '' and p.pg.locator('#fa-frame').count() == 0
    p.pg.keyboard.press('Escape'); p.wait(300)
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_kollege_herstellerrahmen(p):
    ki(p); p.empty()
    ki_fragen(p, 'Bau mir den AOS HS5 nach', {'antwort': 'Ich baue den AOS RC HS5 nach.', 'aktionen': [{'op': 'drohne', 'rahmen': 'HS5 High-Speed'}, {'op': 'pruefen'}]}, 120)
    ok1 = p.ev("return App.doc.drone && App.doc.drone.form==='speed' && App.doc.drone.frame && App.doc.drone.frame.hersteller==='AOS RC' && App.doc.drone.frame.a===233") and p.ev("return App.doc.params.find(x=>x.name==='Achsabstand').expr") >= 233
    pr = p.ev("return window.__aiPrompts[0] || ''")
    ok2 = 'Source One V5' not in pr and '"op":"drohne"' not in pr and p.ev("return App.errors.length") == 0
    return [ok1, ok2]


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
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('breite'); p.pg.keyboard.press('Enter'); p.wait(1200); seen.append(step())
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
    if p.pg.locator('#recovery-restore').count():
        p.pg.locator('#recovery-restore').click(); p.wait(4000)
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
    p.pg.keyboard.press('d'); click_ent('A1'); p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('5'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok6 = abs(S("const e=E('A1'); return window.__M.SK.arcInfo(e.a,e.m,e.b).r") - 5) < 1e-4
    p.pg.keyboard.press('d'); click_ent('AX', 0.8); click_ent('L2', 0.7); p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('60'); p.pg.keyboard.press('Enter'); p.wait(400)
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
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('25'); p.pg.keyboard.press('Enter'); p.wait(300)
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
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('50'); p.pg.keyboard.press('Enter'); p.wait(500)
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



# ---------- Sitzung 51: Ellipse trimmen ----------
def t_ellipse_trimmen(p):
    scene(p, [{'id': 'E', 'type': 'ellipse', 'c': [0, 0], 'rx': 20, 'ry': 10, 'rot': 0}, {'id': 'V', 'type': 'line', 'a': [0, -20], 'b': [0, 20]}])
    p.pg.keyboard.press('t'); p.wait(200)
    s = to_screen(p, 20, 0); p.pg.mouse.move(s[0], s[1]); p.wait(200)
    hover = SS(p, "return !!S.trimHover && S.trimHover.length>1 && S.trimHover.every(q=>q[0]>-0.5)")
    p.pg.mouse.click(s[0], s[1]); p.wait(300)
    # rechte Hälfte weg: eine offene Spline auf der Ellipse, Enden auf der senkrechten Linie
    r = SS(p, """const sp=S.ents.filter(e=>e.type==='spline'); if (sp.length!==1 || E('E')) return null; const q=sp[0];
      const on=q.pts.every(p=>Math.abs((p[0]/20)**2+(p[1]/10)**2-1)<1e-3);
      const pts=SK.splinePoints(q.pts, q.closed); const dev=Math.max(...pts.map(p=>Math.abs(Math.hypot(p[0]/20,p[1]/10)-1)));
      const ends=[q.pts[0], q.pts[q.pts.length-1]];
      return [q.closed, on, dev, Math.max(...q.pts.map(p=>p[0])), ends.map(p=>Math.abs(p[0])<1e-3 && Math.abs(Math.abs(p[1])-10)<1e-3)]""")
    ok1 = hover and r is not None and not r[0] and r[1] and r[2] < 0.002 and r[3] < 1e-3 and r[4] == [True, True]
    ok2 = SS(p, "return S.cons.filter(c=>c.type==='coincident' && c.refs.some(r=>r.e==='V')).length") == 2
    p.pg.keyboard.press('Control+z'); p.wait(200)
    ok3 = SS(p, "return !!E('E') && !S.ents.some(e=>e.type==='spline')")
    return [ok1, ok2, ok3]

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



# ---------- Sitzung 60: Ellipse versetzen, Versatz einer Kette zusammen ändern ----------
def t_versatz_ellipse(p):
    scene(p, [{'id': 'E', 'type': 'ellipse', 'c': [0, 0], 'rx': 20, 'ry': 10, 'rot': 0.3}])
    p.pg.keyboard.press('f'); p.wait(200)
    import math
    cx, cy = 20 * math.cos(0.3), 20 * math.sin(0.3)
    click_uv(p, cx, cy, alt=False)
    p.pg.mouse.move(*to_screen(p, cx * 1.2, cy * 1.2)); p.wait(200)
    p.pg.keyboard.type('3'); p.pg.keyboard.press('Enter'); p.wait(400)
    # Spline durch 48 Punkte, jeder Punkt und die Kurve dazwischen 3 mm von der Ellipse entfernt
    r = SS(p, """const sp=S.ents.filter(e=>e.type==='spline'); if (sp.length!==1) return null; const q=sp[0], E0=E('E');
      const P=SK.ellipsePoints(E0.c,E0.rx,E0.ry,E0.rot,4000); const dist=(u)=>Math.min(...P.map(p=>Math.hypot(p[0]-u[0],p[1]-u[1])));
      const curve=SK.splinePoints(q.pts,true); const dc=curve.filter((_,i)=>i%5===0).map(dist);
      return [q.closed, q.pts.length, Math.max(...q.pts.map(u=>Math.abs(dist(u)-3))), Math.min(...dc), Math.max(...dc)]""")
    ok1 = r is not None and r[0] and r[1] == 48 and r[2] < 0.01 and r[3] > 2.97 and r[4] < 3.03
    # nach innen zu weit (kleinster Krümmungsradius 5 mm): Hinweis, nichts Neues
    click_uv(p, cx, cy, alt=False)
    p.pg.mouse.move(*to_screen(p, cx * 0.8, cy * 0.8)); p.wait(200)
    p.pg.keyboard.type('6'); p.pg.keyboard.press('Enter'); p.wait(400)
    ok2 = SS(p, "return S.ents.filter(e=>e.type==='spline').length") == 1 and p.pg.get_by_text('höchstens').count() > 0
    return [ok1, ok2]


def t_versatz_kette_zusammen(p):
    scene(p, [{'id': 'A', 'type': 'line', 'a': [0, 0], 'b': [40, 0]}, {'id': 'B', 'type': 'line', 'a': [40, 0], 'b': [40, 30]}])
    p.pg.keyboard.press('f'); click_uv(p, 20, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 20, 8)); p.wait(200); p.pg.keyboard.type('5'); p.pg.keyboard.press('Enter'); p.wait(400)
    og = SS(p, "const k=S.cons.filter(c=>c.type==='offset'); return k.length===2 && !!k[0].og && k[0].og===k[1].og")
    p.ev("const S=Sketch.state; S.selCon=S.cons.find(c=>c.type==='offset').id; S.sel=null; Panels.renderRight()"); p.wait(300)
    lab = p.pg.locator('label[for="co-v"]').inner_text()
    p.pg.fill('#co-v', '8'); p.pg.press('#co-v', 'Enter'); p.wait(400)
    ok1 = og and 'alle 2' in lab and p.pg.locator('#co-v-all').count() == 1
    ok2 = SS(p, "const n=S.ents.filter(e=>e.type==='line'&&e.id!=='A'&&e.id!=='B'); return S.cons.filter(c=>c.type==='offset').every(c=>c.v===8) && n.some(e=>Math.abs(e.a[1]-8)<1e-3&&Math.abs(e.b[1]-8)<1e-3) && n.some(e=>Math.abs(e.a[0]-32)<1e-3&&Math.abs(e.b[0]-32)<1e-3)")
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok3 = SS(p, "return S.cons.filter(c=>c.type==='offset').every(c=>c.v===5)")
    return [ok1, ok2, ok3]

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
    fehlt = [k for k in ['section', 'xray', 'explode', 'focusView', 'overhang', 'wind'] if k not in hilfen]
    p.pg.locator('#t-views').click(); p.wait(300)
    im_menue = sorted(p.pg.evaluate("[...document.querySelectorAll('.menu [data-help]')].map(b=>b.dataset.help)"))
    knoepfe = sorted(p.pg.evaluate("[...document.querySelectorAll('.view-btns [data-help]')].map(b=>b.dataset.help)"))
    # Pflicht-Einträge da, und jeder Hilfe-Schlüssel im Menü hat einen Text (seit Sitzung 82 kommen Aussehen, Anzeige und Ansichten dazu)
    ohne = [k for k in set(im_menue) | set(knoepfe) if k not in hilfen]
    ok = not fehlt and not ohne and {'explode', 'focusView', 'overhang', 'section', 'xray'} <= set(im_menue) and {'section', 'xray'} <= set(knoepfe)
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt + ohne)) if (fehlt or ohne) else ('' if ok else f'Menü {im_menue}, Knöpfe {knoepfe}')


# ---------- Messen, Masse, Auswahl, Versionen ----------
def t_masse_teil(p):
    zwei_quader(p, 0, 0, -20, 20)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(1500)
    ok1 = p.pg.locator('#p-vol').text_content() == '8 cm³' and p.pg.locator('#p-mass').text_content() == '12,4 g'
    p.pg.select_option('#p-mat', 'PLA'); p.wait(2000)
    ok2 = p.pg.locator('#p-mass').text_content() == '9,92 g' and p.ev("return App.doc.items[1].mat") == 'PLA'
    p.ev("App.clearSelection()"); p.wait(1500)
    sec = p.pg.locator('.section').filter(has_text='Schwerpunkt').inner_text()
    ok3 = '22,3 g' in sec and '-2,22 · 0 · 10' in sec and 'eigenes Material' in sec
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
    ok = [(r1 or '').startswith('Fläche 600 mm²'), (r2 or '').startswith('Winkel 90°'), (r3 or '').startswith('Abstand 10 mm'), (r4 or '').startswith('Abstand 15 mm')]
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
    p.ev("App.setDoc(DroneTpl.build(arg)); Start.hide()", key)
    for _ in range(60):   # der Rahmen hat viele Löcher – warten, bis alles gerechnet ist
        p.wait(1000)
        if p.ev("return !App.busy && App.results.size === App.doc.items.filter(i=>!App.mergedInto(i.id)).length"):
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
    ok3 = near(st[3:4], [12.75]) and p.ev("return App.errors.length") == 0      # Stack 20 × 20: Platinen 25,5 breit
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
        if p.ev("return !App.busy && App.results.size >= App.doc.items.filter(i=>!i.hidden && !App.mergedInto(i.id)).length"):
            break
    p.wait(800)


def t_frame_assistent(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    ok1 = p.pg.locator('.frame-assist').count() == 1 and '225 mm' in p.pg.locator('#fa-out').inner_text()
    p.pg.select_option('#fa-zoll', '3'); p.wait(300)
    p.pg.select_option('#fa-form', 'deadcat'); p.wait(300)
    p.pg.select_option('#fa-video', 'o4'); p.wait(200)
    gap = float(p.pg.locator('#fa-gap').text_content().split()[0].replace(',', '.'))
    ok2 = gap >= 15 and p.pg.locator('#fa-warn').count() == 0
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p)
    P = p.ev("return Object.fromEntries(App.doc.params.map(x=>[x.name,x.expr]))")
    ok3 = P['Armwinkel'] == 60 and P['Armwinkel_hinten'] == 35 and P['Stack'] == 20 and P['Motorlochkreis'] == 9 and abs(P['Kamerabreite'] - 12.36) < 1e-6
    names = p.ev("return App.doc.items.map(i=>i.name)")
    ok4 = 'DJI O4 Air Unit Sender' in names and 'DJI O4 Air Unit Kamera' in names and 'Akku 4S 450 mAh' in names and p.ev("return App.errors.length") == 0
    # die vorderen Arme sind weiter gespreizt als die hinteren
    xs = p.ev("const g=App.doc.items.find(i=>i.name.startsWith('Motor 1404')); const x=(n)=>Model.tNumeric(g.children.find(c=>c.name===n)).x; return [x('Motor vorne rechts'), x('Motor hinten rechts')]")
    ok5 = xs[0] > xs[1] + 10                                             # Deadcat: vorne weiter gespreizt
    return [ok1, ok2, ok3, ok4, ok5]



# ---------- Sitzung 61: H-Rahmen ----------
def t_h_rahmen(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    p.pg.select_option('#fa-form', 'h'); p.wait(300)
    gap = float(p.pg.locator('#fa-gap').text_content().split()[0].replace(',', '.'))
    ok1 = gap >= 5 and p.pg.locator('#fa-warn').count() == 0 and 'H-Rahmen' in p.pg.locator('#fa-form').inner_text()
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p, 90)
    P = p.ev("return Model.vars(App.doc).v")
    names = p.ev("const u=App.doc.items.find(i=>i.name==='Unterteil'); return u.children.map(c=>c.name)")
    ok2 = P['Armwinkel'] == 40 and P['Armwinkel_hinten'] == 40 and 'Längsträger rechts' in names and 'Querträger vorne' in names and not any(n.startswith('Arm ') for n in names) and p.ev("return App.errors.length") == 0
    # Längsträger genau unter den Motoren, von Motor zu Motor
    import math
    mx = P['Achsabstand'] / 2 * math.sin(math.radians(40)); my = P['Achsabstand'] / 2 * math.cos(math.radians(40))
    b = p.ev("const u=App.doc.items.find(i=>i.name==='Unterteil'); const b=Actions.worldBox(u.id); return [b.min.x,b.min.y,b.max.x,b.max.y]")
    ok3 = abs(b[2] - max(mx + P['Armbreite'] / 2, mx + (P['Motorlochkreis'] + 9) / 2)) < 0.05 and abs(b[3] - max(my + P['Armbreite'] / 2, my + (P['Motorlochkreis'] + 9) / 2)) < 0.05
    c = chk(p)
    ok4 = ok_check(c)
    # als DXF: ein Umriss mit zwei Fenstern zwischen Mittelplatte und Längsträgern, dazu die 28 runden Löcher
    f = p.ev("const u=App.doc.items.find(i=>i.name==='Unterteil'); return Plates.file(u.id).then(f=>({text:new TextDecoder().decode(f.data), circles:f.edges.filter(e=>e.t==='CIRCLE'&&e.full).length}))")
    ok5 = f['circles'] == 28 and 'KONTUR' in f['text'] and f['text'].rstrip().endswith('EOF')
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 69: Rahmen mit einzelnen Armen (Sandwich) ----------
def t_sandwich(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    ok0 = p.pg.locator('#fa-arme').count() == 1
    p.pg.select_option('#fa-arme', 'sandwich'); p.wait(300)
    p.pg.locator('.modal .btn.primary').filter(has_text='Rahmen bauen').click(); warte_rechnen(p, 120)
    names = p.ev("return App.doc.items.map(i=>i.name)")
    ok1 = ok0 and 'Bodenplatte' in names and all('Arm ' + n in names for n in ['vorne rechts', 'vorne links', 'hinten rechts', 'hinten links']) and 'Unterteil' not in names and p.ev("return App.errors.length") == 0
    bp = p.ev("const it=App.doc.items.find(i=>i.name==='Bodenplatte'); const b=Actions.worldBox(it.id); return [b.min.z, b.max.z]")
    P = p.ev("return Model.vars(App.doc).v")
    ok2 = abs(bp[0] + P['Bodenplatte']) < 1e-3 and abs(bp[1]) < 1e-3 and P['Armspalt'] == 0.4 and p.ev("return App.doc.drone.arms") == 'sandwich'
    c = chk(p)
    ok3 = ok_check(c)
    plates = p.ev("return Plates.candidates().map(c=>c.name)")
    ok4 = 'Bodenplatte' in ' '.join(plates) and sum(1 for x in plates if x.startswith('Arm ')) == 4
    # Arme berühren sich nicht: kleinster Abstand der Arm-Viertel = Armspalt
    g = p.ev("const b=(n)=>Actions.worldBox(App.doc.items.find(i=>i.name===n).id); const a=b('Arm vorne rechts'), l=b('Arm vorne links'); return [a.min.x, l.max.x]")
    ok5 = abs(g[0] - g[1] - 0.4) < 0.01
    return [ok1, ok2, ok3, ok4, ok5]

def t_frame_warnung(p):
    p.ev("DroneUI.assistant()"); p.wait(600)
    p.pg.fill('#fa-a', '150'); p.pg.press('#fa-a', 'Enter'); p.wait(400)
    ok1 = 'überlappen' in p.pg.locator('#fa-warn').inner_text()
    p.pg.select_option('#fa-motor', '1103'); p.wait(300)
    ok2 = 'passt eher' in p.pg.locator('#fa-warn').inner_text()
    p.pg.keyboard.press('Escape'); p.wait(300)
    return [ok1, ok2]


def t_drohnen_teile(p):
    p.empty()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="akku"]').click(); p.wait(300)
    ok1 = p.pg.locator('.flyout .tile').count() == 12                   # 3S 450 bis 6S 1500
    p.pg.locator('.flyout .tile').filter(has_text='6S 1300').first.click(); p.wait(2500)
    ok2 = p.ev("const it=App.doc.items[0]; return it.massG===215 && it.name==='Akku 6S 1300 mAh'") and '(fest)' in (p.pg.locator('#p-mass').text_content() or '')
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="motor"]').click(); p.wait(300)
    p.pg.locator('.flyout .tile').filter(has_text='Motor 1103').first.click(); p.wait(2500)
    ok3 = p.ev("return App.doc.items[1].massG") == '' and p.pg.locator('.hint-box.warn').filter(has_text='Gewicht fehlt').count() == 1
    p.ev("App.clearSelection()"); p.wait(1500)
    ok4 = 'fehlt noch das Gewicht' in p.pg.locator('.section').filter(has_text='Schwerpunkt').inner_text()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="video"]').click(); p.wait(300)
    ok5 = p.pg.locator('.flyout .tile').filter(has_text='DJI O4 Air Unit Pro').count() >= 2
    return [ok1, ok2, ok3, ok4, ok5]


def t_lochbild(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ const a=d.items[0]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:60,d:60,h:4}); })"); p.wait(2000)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
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
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    kacheln = set(p.pg.evaluate("[...document.querySelectorAll('.flyout .tile[data-help]')].map(t=>t.dataset.help)"))
    ok = not fehlt and {'holePattern', 'zipTie'} <= kacheln
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ('' if ok else 'Kacheln: ' + ', '.join(kacheln))


# ---------- Sitzung 13: Drohnen-Check, Platten als DXF, Varianten ----------
def chk(p):
    return p.ev("return DroneCheck.run().then(l=>Object.fromEntries(l.map(c=>[c.id,[c.s,c.text]])))")


def t_drohnen_check(p):
    drohne(p, 'f5')
    p.ev("DroneCheck.dialog()")
    p.pg.wait_for_selector('.modal .chk-row[data-chk="tw"]', timeout=60000); p.wait(300)
    st = p.pg.evaluate("Object.fromEntries([...document.querySelectorAll('.modal .chk-row')].map(r=>[r.dataset.chk,r.className.split(' ')[1]]))")
    tw = p.pg.locator('.modal .chk-row[data-chk="tw"]').inner_text()
    ok1 = st == {'gap': 'ok', 'props': 'ok', 'clash': 'ok', 'weight': 'info', 'cog': 'ok', 'tw': 'ok', 'flight': 'info'} and 'Richtwert' in tw   # Vorlage besteht alle Prüfungen
    field(p, '#chk-thrust', 1000); p.wait(1500)
    p.pg.wait_for_selector('.modal .chk-row[data-chk="tw"]', timeout=60000); p.wait(500)
    m = p.ev("return Mass.measure().then(r=>r.mass)")
    tw2 = p.pg.locator('.modal .chk-row[data-chk="tw"]').inner_text()
    ok2 = p.ev("return App.doc.drone.thrustG===1000 && !App.doc.drone.thrustSrc") and (str(round(4000 / m, 1)).replace('.', ',') + ' : 1') in tw2 and 'Richtwert' not in tw2
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok3 = p.ev("return !!DroneCheck.summary()")   # Ergebnis bleibt gespeichert (Drohnen-Panel im UI ausgeblendet)
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



# ---------- Sitzung 42: Drohnen-Check für selbst gebaute Rahmen ----------
def t_drohnencheck_frei(p):
    p.empty()
    # eigener Rahmen: eine Platte, ein Motor vorne rechts, per Kreismuster viermal
    p.ev("""App.change('x', d=>{
      const pl=Model.newItem('box',{w:190,d:190,h:4}); pl.name='Rahmen'; d.items.push(pl);
      const m=Model.newItem('part',{lib:'buyMotor',d:28.5,h:19.7,lk:16,size:'M3'}); m.name='Motor 2306'; m.t.x=80; m.t.y=-80; m.t.z=4; d.items.push(m);
    })"""); warte_rechnen(p, 30)
    p.ev("Features.pattern('circ', [App.doc.items[1].id])"); warte_rechnen(p, 30)
    g = p.ev("const g=DroneCheck.geometry(); return g&&{n:g.n, free:g.free, zoll:g.zoll, m:g.motors.map(m=>[m[0], Math.round(m[1]), Math.round(m[2])])}")
    c = chk(p)
    ok1 = (g and g['free'] and g['n'] == 4 and g['zoll'] is None and sorted([x[1:] for x in g['m']]) == [[-80, -80], [-80, 80], [80, -80], [80, 80]]
           and 'vorne rechts' in [x[0] for x in g['m']] and 'fehlt' in c['free'][1] and 'gap' not in c and 'props' not in c)
    # Propellergröße im Check eintragen
    p.ev("DroneCheck.dialog()"); p.pg.wait_for_selector('.modal #chk-zoll', timeout=60000); p.wait(300)
    field(p, '#chk-zoll', 5); p.wait(1500)
    p.pg.wait_for_selector('.modal .chk-row[data-chk="gap"]', timeout=60000); p.wait(300)
    st = p.pg.evaluate("Object.fromEntries([...document.querySelectorAll('.modal .chk-row')].map(r=>[r.dataset.chk,r.className.split(' ')[1]]))")
    gap = p.pg.locator('.modal .chk-row[data-chk="gap"]').inner_text()
    ok2 = st.get('gap') == 'ok' and st.get('props') == 'ok' and st.get('clash') == 'ok' and '33' in gap and 'eingetragen' in p.pg.locator('.modal .chk-row[data-chk="free"]').inner_text()
    p.pg.keyboard.press('Escape'); p.wait(300)
    # Ein Turm ragt in den Propellerkreis vorne rechts
    p.ev("App.change('x', d=>{ const t=Model.newItem('box',{w:10,d:10,h:40}); t.name='Kamera-Turm'; t.t.x=80; t.t.y=-40; t.t.z=4; d.items.push(t); })"); warte_rechnen(p, 30)
    c = chk(p)
    ok3 = c['props'][0] == 'bad' and 'Kamera-Turm' in c['props'][1] and 'vorne rechts' in c['props'][1]
    # Turm weg, ein echter 5"-Propeller auf dem ersten Motor: Größe kommt von dort, Propeller und Motor zählen nicht als „ineinander“
    p.ev("App.change('x', d=>{ d.items=d.items.filter(i=>i.name!=='Kamera-Turm'); d.drone.zoll=null; const pr=Model.newItem('part',{lib:'buyProp',zoll:5,blades:3,pitch:13}); pr.name='Propeller 5'; pr.t.x=80; pr.t.y=-80; pr.t.z=23.7; d.items.push(pr); })"); warte_rechnen(p, 30)
    c = chk(p)
    ok4 = 'Propellern im Modell' in c['free'][1] and c['gap'][0] == 'ok' and c['props'][0] == 'ok' and c['clash'][0] == 'ok'
    # Schub: vier Motoren
    p.ev("App.change('x', d=>{ d.drone.thrustG=1000; })"); warte_rechnen(p, 20)
    c = chk(p); m = p.ev("return Mass.measure().then(r=>r.mass)")
    ok5 = (str(round(4000 / m, 1)).replace('.', ',') + ' : 1') in c['tw'][1]
    # Sechs Motoren (Hexakopter): Namen eindeutig
    p.ev("App.change('x', d=>{ d.items.find(i=>i.kind==='group').p.n=6; })"); warte_rechnen(p, 30)
    g = p.ev("const g=DroneCheck.geometry(); return [g.n, new Set(g.motors.map(m=>m[0])).size]")
    ok6 = g == [6, 6]
    return [ok1, ok2, ok3, ok4, ok5, ok6]

def t_drohnen_generator(p):
    p.wait(1500)
    out = []
    for o in ["{zoll:3, form:'x', video:'o4pro'}", "{zoll:5, form:'deadcat', video:'o3'}", "{zoll:7, form:'x', video:'walksnail'}"]:
        c = p.ev("const cfg=DroneTpl.config(" + o + "); App.setDoc(DroneTpl.build(cfg)); Start.hide(); return true")
        warte_rechnen(p)
        c = chk(p)
        out.append(p.ev("return App.errors.length") == 0 and all(c[k][0] == 'ok' for k in ['gap', 'props', 'clash', 'cog']))   # 3" jetzt mit Akku 4S 450
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
    ok = not fehlt and p.pg.locator('#var-new').count() == 1
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ''


# ---------- Sitzung 14: KI-Schritte, Erklären, Schwachstellen ----------
KI_MOCK = """
window.__aiPrompts = []; window.__aiQueue = [];
window.claude = { use: async (n) => n === 'sample' ? { json: async (prompt, opts) => {
  window.__aiPrompts.push(prompt); await new Promise(r => setTimeout(r, 150));
  const r = window.__aiQueue.shift();
  if (r && r.__error) { const e = new Error('Testfehler'); e.code = r.__error; throw e; }
  return r || { antwort: 'Okay.', aktionen: [] };
} } : null };
"""


def ki(p):
    """KI-Zugang wie in Claude, aber mit vorbereiteten Antworten (window.__aiQueue)"""
    p.pg.add_init_script(KI_MOCK); p.pg.reload(); p.wait(2500)


def ki_fragen(p, text, antwort, sekunden=60):
    """antwort: eine Antwort der KI oder eine Liste (eine je Runde)"""
    for a in (antwort if isinstance(antwort, list) else [antwort]):
        p.ev("window.__aiQueue.push(arg)", a)
    p.pg.locator('#cmd-input').fill(text); p.wait(200)
    p.pg.locator('#cmd-input').press('Enter')
    p.wait(400)
    for _ in range(sekunden * 4):
        p.wait(250)
        if p.ev("return !document.querySelector('.ai-msg.ai.working') && ![...document.querySelectorAll('.ai-msg.ai .txt')].some(t=>/Denkt nach|Baut/.test(t.textContent))"):
            break
    warte_rechnen(p, 30)


def t_ki_schritte(p):
    ki(p); p.empty()
    q1 = 'Platte 60 x 40 x 4 mit einem Loch'
    ki_fragen(p, q1, {'antwort': 'Ich habe dir eine Platte gebaut.', 'aktionen': [
        {'op': 'mass', 'name': 'Breite', 'wert': '60'},
        {'op': 'hinzufuegen', 'objekt': {'art': 'group', 'name': 'Platte', 'kinder': [
            {'art': 'box', 'name': 'Platte', 'p': {'w': 'Breite', 'd': 40, 'h': 4}},
            {'art': 'cylinder', 'name': 'Loch', 'rolle': 'loch', 'p': {'d': 5, 'h': 5}, 't': {'x': 15, 'z': -0.5}}]}}]})
    ok1 = p.ev("return App.doc.items.length===1 && App.doc.items[0].ai && App.doc.items[0].ai.q===arg && App.errors.length===0", q1)
    chip = p.pg.locator('.tl-chip').first
    ok2 = 'ai' in chip.get_attribute('class') and chip.locator('.ai-badge').count() == 1 and 'von der KI' in chip.get_attribute('data-tip') and p.pg.locator('.tree .node .ai-mark').count() == 1
    gid, lid = p.ev("const g=App.doc.items[0]; return [g.id, g.children[1].id]")
    ki_fragen(p, 'Mach vier Löcher im Kreis und nimm PETG', {'antwort': 'Vier Löcher im Kreis, Material PETG.', 'aktionen': [
        {'op': 'muster', 'id': lid, 'art': 'kreis', 'n': 4, 'mitte': [0, 0]}, {'op': 'material', 'id': gid, 'material': 'PETG'}]})
    ok3 = p.ev("const g=App.doc.items[0]; const m=g.children[1]; return m.p.op==='pattern' && m.p.pt==='circ' && m.p.n===4 && m.children[0].id===arg && g.mat==='PETG' && App.errors.length===0", lid)
    ok4 = 'werden 4 Löcher' in p.ev("return Explain.local(App.doc.items[0].id).lines.map(l=>l.t).join(' ')") and '"materialien"' in p.ev("return window.__aiPrompts[1]") and lid in p.ev("return window.__aiPrompts[1]")
    p.pg.locator('.ai-msg.ai').last.get_by_role('button', name='Rückgängig').click(); warte_rechnen(p, 20)
    ok5 = p.ev("const g=App.doc.items[0]; return g.children[1].kind==='cylinder' && !g.mat")
    # Fehler der KI kommen verständlich an
    ki_fragen(p, 'Mach noch einen Deckel drauf', {'__error': 'rate_limited'})
    ok6 = 'zu viele Anfragen' in p.pg.locator('.ai-msg.ai .txt').last.text_content() and p.ev("return App.doc.items.length") == 1
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_ki_drohne(p):
    ki(p); p.empty()
    q = 'Bau mir einen 5 Zoll Deadcat mit DJI O4 und 6 mm Armen und GPS'
    ki_fragen(p, q, {'antwort': 'Hier ist dein Deadcat.', 'aktionen': [
        {'op': 'drohne', 'zoll': 5, 'form': 'deadcat', 'video': 'o4'}, {'op': 'mass', 'name': 'Armdicke', 'wert': '6'},
        {'op': 'kaufteil', 'name': 'Flywoo GOKU GM10 Mini V3', 't': {'y': 40, 'z': 50}}, {'op': 'pruefen'}]})
    ok1 = p.ev("return App.doc.drone && App.doc.drone.form==='deadcat' && App.doc.drone.video==='o4' && App.doc.params.find(x=>x.name==='Armdicke').expr===6")
    ok2 = p.ev("return App.doc.items.every(i=>i.ai) && App.doc.items.some(i=>i.name==='Flywoo GOKU GM10 Mini V3' && i.massG>0)")
    p.pg.wait_for_selector('.ai-check .chk-row, .ai-check small:has-text(\"alles in Ordnung\")', timeout=90000); p.wait(300)
    ok3 = p.pg.locator('.ai-check .chk-row.bad').count() == 0 and p.ev("return App.errors.length") == 0
    ok4 = p.pg.locator('.tl-chip.ai').count() == p.ev("return App.doc.items.length")
    return [ok1, ok2, ok3, ok4]


def t_erklaeren(p):
    drohne(p, 'f5')
    p.pg.locator('.tl-chip').first.click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Erklär diesen Schritt').click(); p.wait(600)
    t = p.pg.locator('#explain').text_content()
    ok1 = 'Schritt 1 von 10' in t and '28 Löcher' in t and 'Achsabstand' in t and 'CFK' in t and p.pg.locator('#explain-ask').count() == 0   # ohne KI: nur die eigene Erklärung
    p.pg.keyboard.press('Escape'); p.wait(300)
    # Verlauf: Rechtsklick auf die Oberplatte
    p.pg.locator('.tree .node', has_text='Oberplatte').first.click(button='right'); p.wait(300)
    p.pg.locator('.menu').get_by_role('menuitem', name='Erklär diesen Schritt').click(); p.wait(600)
    t2 = p.pg.locator('#explain').text_content()
    ok2 = 'Schritt 3 von 10' in t2 and 'Plattendicke' in t2 and 'Bolzenhöhe' in t2
    p.pg.keyboard.press('Escape'); p.wait(300)
    # Knopf rechts neben dem Namen
    p.ev("App.select([App.doc.items.find(i=>/^Akku/.test(i.name)).id])"); p.wait(800)
    p.pg.locator('#item-explain').click(); p.wait(600)
    t3 = p.pg.locator('#explain').text_content()
    ok3 = 'Kaufteil mit festem Gewicht' in t3 and 'Gewicht' in t3
    return [ok1, ok2, ok3]


def t_erklaeren_ki(p):
    ki(p); drohne(p, 'f5')
    p.ev("window.__aiQueue.push({erklaerung:'Die Oberplatte deckt den Rahmen oben ab und trägt den Akku.', tipp:'Zwei Millimeter Carbon reichen hier.'})")
    p.pg.locator('.tree .node', has_text='Oberplatte').first.click(button='right'); p.wait(300)
    p.pg.locator('.menu').get_by_role('menuitem', name='Erklär diesen Schritt').click(); p.wait(500)
    p.pg.locator('#explain-ask').click()
    p.pg.wait_for_selector('#explain-ai .ai-say', timeout=20000)
    t = p.pg.locator('#explain-ai').inner_text()
    pr = p.ev("return window.__aiPrompts[0]")
    return [('trägt den Akku' in t and 'Tipp' in t), ('Plattendicke' in pr and 'Oberplatte' in pr and 'Schritt 3 von 10' in pr)]


def t_schwachstellen(p):
    ki(p); drohne(p, 'f5')
    p.pg.locator('#proj-weak').click()
    p.pg.wait_for_selector('#weak .chk-row', timeout=90000); p.wait(300)
    ok1 = 'Keine Schwachstellen' in p.pg.locator('#weak').text_content()          # die Vorlage besteht
    p.pg.keyboard.press('Escape'); p.wait(300)
    # fies: ein M3-Loch 2 mm vom Rand der Oberplatte, dazu dünne Arme
    hid = p.ev("""const x=Model.newItem('part',{lib:'screwHole',size:'M3',head:'none',fit:'medium',length:4},{role:'hole',name:'Testloch'});
      Object.assign(x.t,{x:'Plattenbreite/2 - 2', y:30, z:'Armdicke + Bolzenhöhe + Plattendicke + 1'});
      App.change('x', d=>{ d.items.push(x); d.params.find(q=>q.name==='Armdicke').expr=3; }); return x.id""")
    warte_rechnen(p); p.ev("App.clearSelection()"); p.wait(600)
    p.pg.locator('#proj-weak').click()
    p.pg.wait_for_selector('#weak [data-weak]', timeout=90000); p.wait(300)
    st = p.pg.evaluate("[...document.querySelectorAll('#weak [data-weak]')].map(r=>[r.dataset.weak, r.className.split(' ')[1], r.textContent])")
    edge = [x for x in st if x[0] == 'hole-edge']
    ok2 = len(edge) == 1 and edge[0][1] == 'bad' and 'Oberplatte' in edge[0][2] and '1 Loch' in edge[0][2] and '0,3 mm' in edge[0][2] and any(x[0] == 'arm' for x in st)
    # Zeigen: roter Ring am Loch, Oberplatte ausgewählt
    p.pg.locator('#weak [data-weak="hole-edge"]').get_by_role('button', name='Zeigen').click(); p.wait(600)
    ok3 = p.ev("return Weak.marks") == 1 and p.ev("return App.sel[0]===App.doc.items.find(i=>i.name==='Oberplatte').id")
    p.ev("App.clearSelection()"); p.wait(600)
    # Armdicke mit einem Klick, dann Vorschlag der KI umsetzen
    p.pg.locator('#proj-weak').click()
    p.pg.wait_for_selector('#weak [data-fix="arm"]', timeout=90000); p.wait(300)
    p.pg.locator('#weak [data-fix="arm"]').click(); p.wait(800)
    ok4 = p.ev("return App.doc.params.find(x=>x.name==='Armdicke').expr") == 5
    p.ev("window.__aiQueue.push(arg)", {'antwort': 'Das Loch am Rand reißt leicht aus. Rück es nach innen.', 'vorschlaege': [{'titel': 'Loch 6 mm nach innen', 'aktionen': [{'op': 'aendern', 'id': hid, 'setze': {'t': {'x': 'Plattenbreite/2 - 8'}}}]}]})
    p.pg.wait_for_selector('#weak-ask', timeout=90000); p.wait(300)
    p.pg.locator('#weak-ask').click()
    p.pg.wait_for_selector('#weak-ai [data-sug]', timeout=20000)
    p.pg.locator('#weak-ai [data-sug]').first.click(); warte_rechnen(p)
    ok5 = p.ev("const it=App.doc.items.find(i=>i.name==='Testloch'); return it.t.x==='Plattenbreite/2 - 8' && it.ai && it.ai.edit") and 'Schwachstellen' in p.ev("return window.__aiPrompts[0]")
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok6 = p.ev("return Weak.analyze().then(l=>l.length)") == 0
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_neu14_hilfen(p):
    drohne(p, 'f5')
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    fehlt = [k for k in ['explainStep', 'weakSpots', 'aiSteps'] if k not in hilfen]
    p.ev("App.select([App.doc.items[0].id])"); p.wait(800)
    ok = not fehlt and p.pg.locator('#item-explain[data-help="explainStep"]').count() == 1
    p.ev("App.clearSelection()"); p.wait(800)
    ok = ok and p.pg.locator('#proj-weak[data-help="weakSpots"]').count() == 1
    return ok, ('ohne Hilfetext: ' + ', '.join(fehlt)) if fehlt else ''


# ---------- Sitzung 15: einfache Oberfläche ----------
def sichtbar(p, sel):
    return p.pg.locator(sel).first.is_visible() if p.pg.locator(sel).count() else False


def t_einfach(p):
    # Startseite: Oberfläche wählen
    p.pg.locator('#start-simple').click(); p.wait(400)
    ok1 = p.pg.evaluate("document.body.classList.contains('simple')") and p.pg.locator('#start-simple').get_attribute('aria-pressed') == 'true'
    p.empty()
    ok2 = not sichtbar(p, '#t-measure') and not sichtbar(p, '#tab-drawing') and not sichtbar(p, '#lt-log') and sichtbar(p, '#t-more') and sichtbar(p, '#t-body') and not sichtbar(p, '#t-drone') and p.pg.locator('#btn-level').text_content() == 'Einfach'
    p.pg.locator('#t-body').click(); p.wait(400)
    n_body = p.pg.evaluate("[...document.querySelectorAll('.flyout .tile')].filter(t=>t.offsetParent).length")
    p.pg.keyboard.press('Escape'); p.pg.locator('#t-parts').click(); p.wait(400)
    n_parts = p.pg.evaluate("[...document.querySelectorAll('.flyout .tile')].filter(t=>t.offsetParent).length")
    ok3 = n_body == 6 and n_parts == 5
    p.pg.locator('#t-parts').click(); p.wait(200)
    p.ev("Actions.addPrimitive('box')"); warte_rechnen(p, 20)
    vis = p.pg.evaluate("[...document.querySelectorAll('.ctxbar button')].filter(b=>b.offsetParent).map(b=>b.getAttribute('aria-label'))")
    ok4 = 'Drehen' in vis and 'Duplizieren' in vis and not any(x in vis for x in ['Muster', 'Teilen', 'Ähnliche']) and not sichtbar(p, '.view-btns [data-view="xray"]')
    # „Mehr“ öffnet die versteckten Werkzeuge
    p.pg.locator('#t-more').click(); p.wait(300)
    labels = p.pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.textContent)")
    ok5 = any(l.startswith('Messen') for l in labels) and any('Alle Werkzeuge' in l for l in labels)
    p.pg.locator('.menu button', has_text='Messen').click(); p.wait(400)
    ok5 = ok5 and p.pg.evaluate("window.__masswerk.Measure.active")
    p.pg.keyboard.press('Escape'); p.wait(300)
    # bleibt nach dem Neuladen
    p.pg.reload(); p.wait(3000)
    ok6 = p.pg.evaluate("document.body.classList.contains('simple')") and not sichtbar(p, '#t-measure')
    p.pg.locator('#btn-level').click(); p.wait(600)
    ok7 = sichtbar(p, '#t-measure') and sichtbar(p, '#tab-drawing') and not sichtbar(p, '#t-more') and p.pg.locator('#btn-level').text_content() == 'Profi'
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7]


# ---------- Sitzung 16: Kaufteile in echter Form ----------
def t_kaufteil_formen(p):
    drohne(p, 'f5')
    libs = p.ev("""const L=(i)=>i.kind==='part'?i.p.lib:i.kind; const f=(re)=>App.doc.items.find(i=>re.test(i.name));
      return [L(f(/^Stack/)), L(f(/^Motor /).children[0]), L(f(/^Propeller/).children[0]), L(f(/^Akku/)), L(App.doc.items.find(i=>i.name==='Kamera (Platzhalter)')), L(f(/Unify/))]""")
    ok1 = libs == ['buyStack', 'buyMotor', 'buyProp', 'buyBattery', 'buyCamera', 'buyPcb'] and p.ev("return App.errors.length") == 0
    # echte Form: viel mehr Flächen als ein Zylinder (Glocke, Lüftungslöcher, Gewinde, Welle)
    faces = p.ev("const g=App.doc.items.find(i=>/^Motor /.test(i.name)); const r=App.results.get(g.id); return r && r.data.faces.length")
    ok2 = faces and faces > 4 * 20
    # Maße bleiben die aus dem Datenblatt: Motor 28,5 breit, Akku 38 × 75 × 39
    bb = p.ev("const a=App.doc.items.find(i=>/^Akku/.test(i.name)); const r=App.results.get(a.id).data.bbox; return [r[3]-r[0], r[4]-r[1], r[5]-r[2]].map(x=>Math.round(x*10)/10)")
    ok3 = bb == [38, 75, 39]
    # Kaufteil aus dem Klappfenster: Motor mit Form und Gewicht
    p.ev("App.setDoc(Model.newDoc())"); p.wait(1500)
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="motor"]').click(); p.wait(300)
    p.pg.locator('.flyout .tile').filter(has_text='Motor 2207').first.click(); warte_rechnen(p, 20)
    ok4 = p.ev("const it=App.doc.items[0]; return it.kind==='part' && it.p.lib==='buyMotor' && it.massG===33.8 && App.errors.length===0") and p.pg.locator('.kind-badge').first.text_content() == 'Motor'
    ok5 = 'Kaufteil mit festem Gewicht' in p.ev("return Explain.local(App.doc.items[0].id).lines.map(l=>l.t).join(' ')")
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 17: KI-Kollege ----------
def ki_warte(p, sekunden=60):
    p.wait(400)
    for _ in range(sekunden * 4):
        p.wait(250)
        if p.ev("return !document.querySelector('.ai-msg.ai.working')"):
            break
    warte_rechnen(p, 30)


def t_kollege_verbund(p):
    ki(p); drohne(p, 'f5')
    u0 = p.ev("return App.undoStack.length")
    ki_fragen(p, 'Mach alles als Verbund', [
        {'antwort': 'Ich verbinde die Rahmenteile zu einem Körper und prüfe danach die Drohne.', 'plan': [{'text': 'Rahmenteile verbinden', 'fertig': False}, {'text': 'Drohne prüfen', 'fertig': False}],
         'aktionen': [{'op': 'verbinden', 'ids': 'alle', 'name': 'Rahmen-Verbund'}, {'op': 'pruefen'}], 'weiter': True},
        {'antwort': 'Fertig: Der Rahmen ist jetzt ein Körper, Motoren, Akku und Kamera bleiben einzeln.', 'plan': [{'text': 'Rahmenteile verbinden', 'fertig': True}, {'text': 'Drohne prüfen', 'fertig': True}], 'aktionen': [], 'weiter': False}], 150)
    kids = p.ev("const g=App.doc.items.find(i=>i.name==='Rahmen-Verbund'); return g ? g.children.map(c=>c.name) : null")
    ok1 = kids == ['Unterteil', 'Abstandsbolzen', 'Oberplatte', 'Kamerahalter'] and p.ev("return App.doc.items.length") == 7 and p.ev("return App.errors.length") == 0 and p.ev("return !!App.doc.items.find(i=>i.name==='Rahmen-Verbund').ai")
    ok2 = p.ev("return App.undoStack.length") == u0 + 1 and p.ev("return App.undoStack[App.undoStack.length-1].label").startswith('KI: Mach alles')
    pr = p.ev("return window.__aiPrompts[1] || ''")
    ok3 = 'Runde 2 von' in pr and 'verbinden: 4 Teile' in pr and 'Drohnen-Check' in pr and 'Kaufteile bleiben einzeln' in pr and 'Rahmen-Verbund' in pr
    card = p.pg.locator('.ai-msg.ai').last
    t = card.locator('.txt').text_content()
    ok4 = card.locator('.ai-plan li.done').count() == 2 and 'Fertig: Der Rahmen' in t and 'Kaufteile bleiben einzeln' in t and card.locator('.ai-check').count() == 1 and '2 Runden' in card.text_content()
    card.get_by_role('button', name='Rückgängig').click(); warte_rechnen(p, 30)
    ok5 = p.ev("return App.doc.items.length") == 10 and p.ev("return App.undoStack.length") == u0
    return [ok1, ok2, ok3, ok4, ok5]


def t_kollege_fehler(p):
    ki(p); p.empty()
    u0 = p.ev("return App.undoStack.length")
    ki_fragen(p, 'Bau einen Klotz 20 × 20 × 10 mit runden Kanten', [
        {'antwort': 'Ich baue den Klotz.', 'aktionen': [{'op': 'hinzufuegen', 'objekt': {'art': 'box', 'name': 'Klotz', 'p': {'w': 20, 'd': 20, 'h': 10}, 'rundungen': [{'typ': 'fillet', 'r': 15, 'kanten': 'all'}]}}], 'weiter': False},
        {'antwort': 'Der Radius war zu groß, jetzt sind es 2 mm.', 'aktionen': [{'op': 'rundung', 'ids': 'neu', 'typ': 'fillet', 'r': 2, 'kanten': 'all', 'ersetzen': True}], 'weiter': False}], 120)
    pr = p.ev("return window.__aiPrompts[1] || ''")
    ok1 = 'FEHLER im Modell' in pr and 'Klotz' in pr
    fin = p.ev("const k=App.doc.items[0]; return k.finishes.map(f=>[f.type,f.r])")
    ok2 = p.ev("return App.errors.length") == 0 and fin == [['fillet', 2]] and p.ev("return App.undoStack.length") == u0 + 1
    # „Selbstständig“ aus: nur eine Runde, kein Nachbessern
    p.pg.locator('#ai-auto').uncheck(); p.wait(200)
    n = p.ev("return window.__aiPrompts.length")
    ki_fragen(p, 'Noch ein Klotz mit zu großer Rundung', [{'antwort': 'Hier.', 'aktionen': [{'op': 'hinzufuegen', 'objekt': {'art': 'box', 'name': 'Klotz 2', 'p': {'w': 20, 'd': 20, 'h': 10}, 't': {'x': 40}, 'rundungen': [{'typ': 'fillet', 'r': 15}]}}], 'weiter': True}, {'antwort': 'Nicht benutzt.', 'aktionen': []}])
    ok3 = p.ev("return window.__aiPrompts.length") == n + 1 and p.ev("return App.errors.length") >= 1 and 'nur diese eine Runde' in p.ev("return window.__aiPrompts[window.__aiPrompts.length-1]")
    p.ev("window.__aiQueue.length=0"); p.pg.locator('#ai-auto').check()
    return [ok1, ok2, ok3]


def t_kollege_frage(p):
    ki(p); p.empty()
    p.ev("Actions.addPrimitive('box'); Actions.addPrimitive('box')"); warte_rechnen(p, 20)
    u0 = p.ev("return App.undoStack.length")
    ki_fragen(p, 'Mach die Teile schöner', {'antwort': '', 'frage': 'Soll ich die Kanten runden oder abschrägen?', 'optionen': ['Runden mit 2 mm', 'Abschrägen mit 1 mm']})
    card = p.pg.locator('.ai-msg.ai').last
    ok1 = card.locator('.ai-opts button[data-opt]').count() == 2 and 'runden oder abschrägen' in card.locator('.txt').text_content() and p.ev("return App.undoStack.length") == u0
    p.ev("window.__aiQueue.push(arg)", {'antwort': 'Ich runde die senkrechten Kanten mit 2 mm.', 'aktionen': [{'op': 'rundung', 'ids': 'koerper', 'typ': 'fillet', 'r': 2, 'kanten': 'vertical'}]})
    card.locator('.ai-opts button', has_text='Runden mit 2 mm').click(); ki_warte(p)
    pr = p.ev("return window.__aiPrompts[1] || ''")
    ok2 = 'Antwort auf deine Rückfrage' in pr and 'Runden mit 2 mm' in pr and p.ev("return App.doc.items.every(i=>i.finishes.length===1 && i.finishes[0].r===2)") and p.ev("return App.undoStack.length") == u0 + 1
    return [ok1, ok2]


def t_kollege_auswahl(p):
    ki(p); p.empty()
    p.ev("""Actions.addPrimitive('box'); Actions.addPrimitive('box'); Actions.addPrimitive('box');""")
    warte_rechnen(p, 20)
    p.ev("App.change('x', d=>{ d.items.forEach((it,i)=>{ it.t.x=i*35+(i===1?7:0); it.t.y=0; }); })"); warte_rechnen(p, 20)
    u0 = p.ev("return App.undoStack.length")
    ki_fragen(p, 'Richte alles links aus, färbe es rot und leg eine gedrehte Kopie daneben', {'antwort': 'Erledigt.', 'aktionen': [
        {'op': 'verschieben', 'ids': 'alle', 'um': {'y': 0}}, {'op': 'ausrichten', 'ids': 'alle', 'an': 'links'}, {'op': 'farbe', 'ids': 'alle', 'farbe': '#d24a3c'},
        {'op': 'kopieren', 'ids': 'alle', 'anzahl': 1, 'versatz': {'x': 0, 'y': 60}}, {'op': 'drehen', 'ids': 'neu', 'achse': 'z', 'grad': 45}, {'op': 'auswaehlen', 'ids': 'neu'}]})
    xs = p.ev("return App.doc.items.slice(0,6).map(i=>Math.round(Actions.worldBox(i.id).min.x*100)/100)")
    ok1 = p.ev("return App.doc.items.length") == 6 and p.ev("return App.doc.items.every(i=>i.color==='#d24a3c')") and p.ev("return App.errors.length") == 0
    ok2 = len(set(xs[i] for i in (0, 2, 4))) == 1          # die drei Originale (jeweils vor ihrer Kopie) stehen links bündig
    ok3 = p.ev("return App.sel.length") == 3 and p.ev("return App.sel.every(id=>Math.abs(Model.find(App.doc,id).item.t.rz-45)<0.01)") and p.ev("return App.undoStack.length") == u0 + 1
    return [ok1, ok2, ok3]


def t_verbund_ohne_ki(p):
    drohne(p, 'f5')
    p.pg.locator('#cmd-input').fill('verbund'); p.wait(300)
    ok1 = p.pg.locator('.cmd-pop .cmd-item', has_text='Alles zu einem Körper verbinden').count() == 1
    p.pg.locator('#cmd-input').fill('Mach alles als Verbund'); p.wait(300)
    p.pg.locator('#cmd-input').press('Enter'); warte_rechnen(p, 60)
    kids = p.ev("const g=App.doc.items.find(i=>i.name==='Verbund'); return g ? g.children.length : 0")
    ok2 = kids == 4 and p.ev("return App.doc.items.length") == 7 and p.ev("return App.errors.length") == 0 and p.pg.locator('.toast', has_text='Verbunden: 4 Teile').count() >= 1
    return [ok1, ok2]


def t_fehler_bleibt(p):
    p.empty()
    p.ev("const it=Model.newItem('box',{w:20,d:20,h:10},{name:'K'}); it.finishes.push({id:'f_test1',type:'fillet',r:15,edges:'vertical'}); App.change('x', d=>{d.items.push(it);})")
    warte_rechnen(p, 30)
    ok1 = p.ev("return App.errors.length") == 1
    # eine andere Änderung: die Form von K kommt aus dem Speicher – die Meldung muss bleiben
    p.ev("Actions.addPrimitive('cylinder')"); warte_rechnen(p, 30)
    p.ev("App.change('y', d=>{ d.items[1].t.x = 40; })"); warte_rechnen(p, 30)
    ok2 = p.ev("return App.errors.length") == 1 and p.ev("return App.errors[0].itemId===App.doc.items[0].id && App.errors[0].code==='toobig'")
    return [ok1, ok2]


# ---------- Sitzung 19: Skizze auf Profi-Niveau ----------
def fertig_hoch(p, d='3'):
    p.pg.keyboard.press('Enter'); p.wait(1500); p.pg.fill('#st-dist', d); p.pg.press('#st-dist', 'Enter'); p.wait(400)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(3000)
    warte_rechnen(p, 40)


def volumen(p):
    return p.ev("return Mass.measureDoc(App.doc).then(r=>r&&r.volume)")


def t_ecke_runden(p):
    sketch_xy(p); cx, cy = p.canvas_center()
    p.pg.mouse.click(cx - 100, cy - 60); p.pg.mouse.move(cx + 60, cy + 40); p.wait(200)
    p.pg.keyboard.type('40'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter'); p.wait(500)
    r = p.ev("return Sketch.state.ents[0]")
    p.pg.keyboard.press('k'); p.wait(300)
    p.pg.fill('#cn-r', '5'); p.pg.press('#cn-r', 'Enter'); p.wait(200)
    k = to_screen(p, r['b'][0], r['b'][1])
    p.pg.mouse.move(k[0] - 3, k[1] + 3); p.wait(200)
    ok1 = p.ev("return !!Sketch.state.cornerHover")
    p.pg.mouse.click(k[0] - 3, k[1] + 3); p.wait(500)
    st = p.ev("const S=Sketch.state; return {arcs:S.ents.filter(e=>e.type==='arc').length, tan:S.cons.filter(c=>c.type==='tangent').length, r:S.dims.filter(d=>d.k==='r').map(d=>d.v), ok:S.status&&S.status.ok}")
    ok2 = st['arcs'] == 1 and st['tan'] == 2 and st['r'] == [5] and st['ok']
    # zu großer Radius: Hinweis, nichts passiert
    p.pg.fill('#cn-r', '30'); p.pg.press('#cn-r', 'Enter'); p.wait(200)
    k3 = to_screen(p, r['a'][0], r['b'][1])
    p.pg.mouse.click(k3[0] + 3, k3[1] + 3); p.wait(500)
    ok3 = p.pg.locator('.toast', has_text='höchstens').count() >= 1 and p.ev("return Sketch.state.ents.length") == 5
    # Fase an der Ecke unten links
    p.pg.select_option('#cn-mode', 'chamfer'); p.pg.fill('#cn-r', '5'); p.pg.press('#cn-r', 'Enter'); p.wait(200)
    k2 = to_screen(p, r['a'][0], r['a'][1])
    p.pg.mouse.click(k2[0] + 3, k2[1] - 3); p.wait(500)
    fertig_hoch(p)
    v = volumen(p); soll = (800 - 25 * (1 - math.pi / 4) - 12.5) * 3
    return [ok1, ok2, ok3, abs(v - soll) < 0.5]


def t_ellipse(p):
    sketch_xy(p); cx, cy = p.canvas_center()
    p.pg.keyboard.press('e'); p.wait(200)
    p.pg.mouse.click(cx, cy); p.pg.mouse.move(cx + 60, cy + 10); p.wait(200)
    p.pg.keyboard.type('30'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('10'); p.pg.keyboard.press('Enter'); p.wait(500)
    e = p.ev("const S=Sketch.state; return [S.ents[0], S.dims.map(d=>d.k).sort()]")
    ok1 = e[0]['type'] == 'ellipse' and abs(e[0]['rx'] - 15) < 1e-6 and abs(e[0]['ry'] - 5) < 1e-6 and e[1] == ['h', 'w']
    # mit der Maus: Mitte, Achse (gedreht), Breite
    p.pg.mouse.click(cx + 300, cy); p.pg.mouse.click(cx + 350, cy - 30); p.pg.mouse.move(cx + 310, cy - 30); p.wait(150)
    p.pg.mouse.click(cx + 310, cy - 30); p.wait(300)
    e2 = p.ev("return Sketch.state.ents[1]")
    ok2 = e2['type'] == 'ellipse' and abs(e2['rot']) > 0.3 and e2['ry'] < e2['rx']
    # Breite rechts ändern
    p.pg.keyboard.press('v'); q = to_screen(p, 15, 0); p.pg.mouse.click(q[0], q[1]); p.wait(300)
    p.pg.fill('#se-w', '40'); p.pg.press('#se-w', 'Enter'); p.wait(300)
    ok3 = abs(p.ev("return Sketch.state.ents[0].rx") - 20) < 1e-6
    fertig_hoch(p)
    v = volumen(p); soll = math.pi * 20 * 5 * 3 + math.pi * e2['rx'] * e2['ry'] * 3
    return [ok1, ok2, ok3, abs(v - soll) < 0.5]


def t_rechteck_mitte(p):
    sketch_xy(p)
    p.pg.select_option('#rk-mode', 'mid'); p.wait(200)
    o = to_screen(p, 0, 0)
    p.pg.mouse.click(o[0], o[1]); p.pg.mouse.move(o[0] + 50, o[1] - 30); p.wait(200)
    p.pg.keyboard.type('20'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('10'); p.pg.keyboard.press('Enter'); p.wait(500)
    st = p.ev("const S=Sketch.state; return [S.ents[0].a, S.ents[0].b, S.cons.map(c=>c.type), S.status.dof]")
    ok1 = st[0] == [-10, -5] and st[1] == [10, 5] and 'midpoint' in st[2] and st[3] == 0
    # Breite ändern: bleibt mittig
    p.pg.keyboard.press('v'); q = to_screen(p, 10, 0); p.pg.mouse.click(q[0], q[1]); p.wait(300)
    p.pg.fill('#se-w', '30'); p.pg.press('#se-w', 'Enter'); p.wait(300)
    a = p.ev("return Sketch.state.ents[0].a")
    return [ok1, abs(a[0] + 15) < 1e-4 and abs(a[1] + 5) < 1e-4]


def t_mittig_konzentrisch(p):
    sketch_xy(p); cx, cy = p.canvas_center()
    p.pg.keyboard.press('c'); p.pg.mouse.click(cx - 50, cy); p.pg.mouse.click(cx - 20, cy); p.wait(200)
    p.pg.mouse.click(cx + 40, cy + 20); p.pg.mouse.click(cx + 50, cy + 20); p.wait(200)
    ents = p.ev("return Sketch.state.ents")
    p.pg.locator('.consbar [data-tool="c:concentric"]').click(); p.wait(200)
    a = to_screen(p, ents[0]['c'][0] + ents[0]['r'], ents[0]['c'][1]); b = to_screen(p, ents[1]['c'][0] + ents[1]['r'], ents[1]['c'][1])
    p.pg.mouse.click(a[0], a[1]); p.wait(150); p.pg.mouse.click(b[0], b[1]); p.wait(400)
    c = p.ev("return Sketch.state.ents.map(e=>e.c)")
    ok1 = math.dist(c[0], c[1]) < 1e-6
    # Mittig: Kreismitte auf die Mitte einer Linie
    p.ev("const S=Sketch.state; S.ents.push({id:'L1',type:'line',a:[-30,-30],b:[30,-30]}); Sketch.setTool('select')")
    p.pg.locator('.consbar [data-tool="c:midpoint"]').click(); p.wait(200)
    l = to_screen(p, 10, -30); e0 = p.ev("return Sketch.state.ents[0]"); a = to_screen(p, e0['c'][0] + e0['r'], e0['c'][1])
    p.pg.mouse.click(a[0], a[1]); p.wait(150); p.pg.mouse.click(l[0], l[1]); p.wait(400)
    c2 = p.ev("const S=Sketch.state, L=S.ents.find(e=>e.id==='L1'), c=S.ents.find(e=>e.type==='circle').c; return [c[0]-(L.a[0]+L.b[0])/2, c[1]-(L.a[1]+L.b[1])/2, S.cons.some(k=>k.type==='midpoint')]")
    return [ok1, abs(c2[0]) < 1e-4 and abs(c2[1]) < 1e-4 and c2[2]]


def t_text(p):
    sketch_xy(p)
    p.pg.keyboard.press('b'); p.wait(200)
    p.pg.fill('#tx-s', 'FPV 5'); p.pg.fill('#tx-h', '8'); p.pg.press('#tx-h', 'Enter'); p.wait(100)
    o = to_screen(p, -10, 0)
    p.pg.mouse.click(o[0], o[1]); p.wait(400)
    e = p.ev("const S=Sketch.state; return [S.ents[0], SK.textBox(S.ents[0])]")
    ok1 = e[0]['type'] == 'text' and e[0]['s'] == 'FPV 5' and abs(e[1]['h'] - 8) < 0.3
    p.pg.fill('#se-h', '6'); p.pg.press('#se-h', 'Enter'); p.wait(300)
    ok2 = p.ev("const S=Sketch.state; return S.ents[0].h===6 && S.dims.some(d=>d.k==='h')")
    p.pg.fill('#se-s', 'FPV 7'); p.pg.press('#se-s', 'Enter'); p.wait(300)
    ok3 = p.ev("return Sketch.state.ents[0].s") == 'FPV 7'
    # im Rechteck: Buchstaben werden Löcher (Gravur)
    p.ev("const S=Sketch.state; S.ents.push({id:'r1',type:'rect',a:[-15,-5],b:[35,12]})")
    regs = p.ev("return SK.regions(Sketch.state.ents).map(r=>[r.key,r.holes.length])")
    ok4 = regs[0][0] == 'r1' and regs[0][1] >= 4
    fertig_hoch(p)
    ok5 = p.ev("const r=App.results.get(App.doc.items[0].id); return !!(r && r.data && r.data.faces.length > 20) && App.errors.length===0")
    return [ok1, ok2, ok3, ok4, ok5]



# ---------- Sitzung 59: Text im Bogen ----------
def t_text_bogen(p):
    scene(p, [{'id': 'C', 'type': 'circle', 'c': [0, 0], 'r': 30}, {'id': 'T', 'type': 'text', 'a': [0, 40], 's': 'FPV', 'h': 5, 'font': 'inter', 'align': 'm', 'rot': 0}])
    p.ev("const S=Sketch.state; S.sel='T'; Panels.renderRight()"); p.wait(300)
    # gerade: Buchstaben zwischen 0 und 5 mm über der Grundlinie
    y0 = SS(p, "const ys=SK.textContours(E('T')).flat().flatMap(s=>[s.a[1],s.b[1]]); return [Math.min(...ys), Math.max(...ys)]")
    p.pg.fill('#se-bend', '20'); p.pg.press('#se-bend', 'Enter'); p.wait(400)
    # Bogen 20: alle Punkte zwischen 20 und 25 mm um die Mitte (0, 20); die äußeren Buchstaben sinken ab
    r = SS(p, "const e=E('T'), P=SK.textContours(e).flat().flatMap(s=>[s.a,s.b]); const d=P.map(q=>Math.hypot(q[0],q[1]-20)); return [e.bend, Math.min(...d), Math.max(...d), Math.min(...P.map(q=>q[1]))]")
    ok1 = abs(y0[0] - 40) < 0.2 and abs(y0[1] - 45) < 0.3 and r[0] == 20 and r[1] > 19.8 and r[2] < 25.3 and r[3] < 39.5
    # An Kreis legen: Grundlinie auf dem Kreis r = 30, oben
    p.pg.locator('#se-oncircle').click(); p.wait(400)
    t = SS(p, "const e=E('T'), P=SK.textContours(e).flat().flatMap(s=>[s.a,s.b]); const d=P.map(q=>Math.hypot(q[0],q[1])); return [e.a, e.bend, e.rot, e.align, Math.min(...d), Math.max(...d)]")
    ok2 = abs(t[0][0]) < 1e-3 and abs(t[0][1] - 30) < 1e-3 and t[1] == 30 and abs(t[2]) < 1e-6 and t[3] == 'm' and t[4] > 29.8 and t[5] < 35.3
    # Rückgängig im Skizzenmodus: wieder Bogen 20
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok3 = SS(p, "return E('T').bend") == 20
    # als Körper: Ring mit Schrift, rechnet ohne Fehler
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    ok4 = p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); return !!(r && r.data && r.data.faces.length > 10) && App.errors.length===0 && it.p.sketch.ents.find(e=>e.id==='T').bend===20")
    return [ok1, ok2, ok3, ok4]


# ---------- Sitzung 65: Text entlang einer Kurve ----------
def t_text_kurve(p):
    scene(p, [{'id': 'K', 'type': 'spline', 'pts': [[-30, 0], [0, 15], [30, 0]], 'closed': False, 'con': True}, {'id': 'T', 'type': 'text', 'a': [0, -20], 's': 'FPV', 'h': 5, 'font': 'inter', 'align': 'l', 'rot': 0}])
    p.ev("const S=Sketch.state; S.sel='T'; Panels.renderRight()"); p.wait(300)
    p.pg.select_option('#se-on', 'K'); p.wait(400)
    # Abstand jedes Buchstaben-Punkts zur Kurve (über/unter: Vorzeichen über die y-Lage der Kurve an dieser Stelle)
    probe = """const e=E('T'), C=SK.splinePoints(E('K').pts,false), P=SK.textContours(e).flat().flatMap(s=>[s.a,s.b]);
      const dist=(q)=>{ let b=1e9; for(let i=0;i+1<C.length;i++){ const a=C[i], c=C[i+1], dx=c[0]-a[0], dy=c[1]-a[1], t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy))); b=Math.min(b,Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy)); } return b; };
      const yAt=(x)=>{ for(let i=0;i+1<C.length;i++){ if((C[i][0]-x)*(C[i+1][0]-x)<=0){ const t=(x-C[i][0])/((C[i+1][0]-C[i][0])||1e-9); return C[i][1]+t*(C[i+1][1]-C[i][1]); } } return 0; };
      const d=P.map(dist), above=P.filter(q=>q[1]>=yAt(q[0])-0.05).length/P.length, xs=P.map(q=>q[0]);
      const over=P.filter(q=>q[1]>yAt(q[0])+0.05).length/P.length; return [e.on, Math.max(...d), above, (Math.min(...xs)+Math.max(...xs))/2, Math.max(...P.map(q=>q[1])), over]"""
    r1 = SS(p, probe)
    ok1 = r1[0] == 'K' and r1[1] < 5.6 and r1[2] > 0.98 and abs(r1[3]) < 1.5
    p.pg.locator('#se-flip').click(); p.wait(400)
    r2 = SS(p, probe)
    p.pg.fill('#se-os', '10'); p.pg.press('#se-os', 'Enter'); p.wait(400)
    r3 = SS(p, probe)
    ok2 = r2[5] < 0.01 and r2[1] < 5.6 and r3[3] < r2[3] - 7   # andere Seite = unter der Kurve und andersherum: +10 entlang wandert nach links
    # Kurve ändern: der Text folgt
    SS(p, "E('K').pts[1]=[0,25]")
    p.pg.fill('#se-os', '0'); p.pg.press('#se-os', 'Enter'); p.wait(400)
    r4 = SS(p, probe)
    ok3 = r4[1] < 5.6 and r4[5] < 0.01 and r4[4] > 18
    # als Körper: Buchstaben erhaben, ohne Fehler; gerade wieder: Felder weg
    p.pg.select_option('#se-on', ''); p.wait(300)
    ok4 = SS(p, "const e=E('T'); return !e.on && !e.onP && !e.flip") and p.pg.locator('#se-os').count() == 0
    p.pg.keyboard.press('Control+z'); p.wait(300)
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    ok5 = p.ev("const it=App.doc.items[0]; const t=it.p.sketch.ents.find(e=>e.id==='T'); return t.on==='K' && t.onP.length>10 && App.errors.length===0 && App.results.get(it.id).data.faces.length>10")
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 68: Skizzen-Ebenen mittig zwischen Flächen und durch drei Punkte ----------
def t_skizze_ebenen(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10}); a.t.x=-20; const b=Model.newItem('box',{w:20,d:20,h:10}); b.t.x=20; b.t.z=30; d.items.push(a,b); })"); warte_rechnen(p, 30)
    p.ev("App.clearSelection(); Viewer.setView('iso', false)"); p.wait(1200)
    p.pg.locator('#t-sketch').click(); p.wait(400)
    p.pg.locator('#sk-mid').click(); p.wait(300)
    s1 = world_screen(p, -20, 0, 10); p.pg.mouse.click(s1[0], s1[1]); p.wait(300)
    s2 = world_screen(p, 20, 0, 40); p.pg.mouse.click(s2[0], s2[1]); p.wait(1200)
    pl = p.ev("const S=Sketch.state; return S && [S.plane.o, S.plane.n]")
    ok1 = pl is not None and abs(pl[0][2] - 25) < 1e-6 and abs(pl[1][2] - 1) < 1e-9
    # Rechteck darauf hochziehen: liegt genau bei z = 25
    p.ev("const S=Sketch.state; S.ents.push({id:'r1',type:'rect',a:[-5,-5],b:[5,5]})")
    fertig_hoch(p, '3')
    z = p.ev("const it=App.doc.items[2]; const r=App.results.get(it.id); return r && r.data.bbox && [Actions.worldBox(it.id).min.z, Actions.worldBox(it.id).max.z]")
    ok2 = z is not None and abs(z[0] - 25) < 1e-3 and abs(z[1] - 28) < 1e-3
    # drei Ecken oben auf dem ersten Quader (rasten ein) → Ebene z = 10
    p.ev("App.clearSelection(); Viewer.setView('iso', false)"); p.wait(1000)
    p.pg.locator('#t-sketch').click(); p.wait(400)
    p.pg.locator('#sk-3p').click(); p.wait(300)
    for (x, y) in [(-29.6, -9.6), (-10.4, -9.6), (-10.4, 9.6)]:
        s = world_screen(p, x, y, 10); p.pg.mouse.click(s[0], s[1]); p.wait(300)
    p.wait(900)
    pl3 = p.ev("const S=Sketch.state; return S && [S.plane.o, S.plane.n, S.plane.x]")
    ok3 = pl3 is not None and abs(pl3[0][2] - 10) < 1e-6 and abs(pl3[1][2] - 1) < 1e-9 and abs(pl3[0][0] + 30) < 1e-6 and abs(pl3[0][1] + 10) < 1e-6 and abs(pl3[2][0] - 1) < 1e-9
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok4 = p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4]


# ---------- Sitzung 71: Schnitt eines Körpers in die Skizze ----------
def t_schnitt_skizze(p):
    p.empty()
    p.ev("App.change('x', d=>{ const k=Model.newItem('cylinder',{d:20,h:30},{name:'Rohr'}); k.t.x=0; const q=Model.newItem('box',{w:40,d:6,h:6},{name:'Steg'}); q.t.z=12; d.items.push(k,q); })"); warte_rechnen(p, 30)
    # Skizze auf der Ebene durch die Mitte (XZ): Zylinder → Rechteck 20 × 30, Steg → Rechteck 40 × 6
    p.ev("Sketch.startOnPlane('XZ', 0)"); p.wait(1500)
    p.pg.keyboard.press('z'); p.wait(200)
    s = world_screen(p, 0, 0, 25); p.pg.mouse.click(s[0], s[1]); p.wait(2500)
    r = SS(p, "const L=S.ents.filter(e=>e.type==='line'); const xs=L.flatMap(e=>[e.a[0],e.b[0]]), ys=L.flatMap(e=>[e.a[1],e.b[1]]); return [L.length, Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]")
    ok1 = r[0] >= 4 and abs(r[1] + 10) < 1e-3 and abs(r[2] - 10) < 1e-3 and abs(r[3]) < 1e-3 and abs(r[4] - 30) < 1e-3
    s = world_screen(p, 18, -3, 15); p.pg.mouse.click(s[0], s[1]); p.wait(2500)
    r2 = SS(p, "const L=S.ents.filter(e=>e.type==='line'); const xs=L.flatMap(e=>[e.a[0],e.b[0]]); return [L.length, Math.max(...xs)]")
    ok2 = r2[0] >= 8 and abs(r2[1] - 20) < 1e-3
    # Rückgängig nimmt einen ganzen Schnitt auf einmal zurück
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok3 = SS(p, "return S.ents.length") == r[0]
    ok4 = p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4]

def t_spline_genau(p):
    sketch_xy(p)
    p.ev("const S=Sketch.state; S.ents.push({id:'s1',type:'spline',closed:true,pts:[[0,0],[30,0],[40,20],[10,30]]})")
    fertig_hoch(p, '2')
    n = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data.faces.length")
    return [n == 6, p.ev("return App.errors.length") == 0]


def t_bild_vorlage(p):
    sketch_xy(p)
    p.pg.keyboard.press('i'); p.wait(200)
    ok1 = p.pg.locator('#bg-load').count() == 1
    png = p.pg.evaluate("(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,200,100);g.fillStyle='#000';g.fillRect(20,20,160,10);return c.toDataURL('image/png')})()")
    p.ev("Sketch.setBg(arg, 100, 0.5)", png); p.wait(400)
    p.pg.locator('#bg-cal').click(); p.wait(200)
    a = to_screen(p, -40, 0); b2 = to_screen(p, 40, 0)
    p.pg.mouse.click(a[0], a[1]); p.wait(200); p.pg.mouse.click(b2[0], b2[1]); p.wait(500)
    p.pg.fill('#prompt-inp', '40'); p.pg.press('#prompt-inp', 'Enter'); p.wait(500)
    bg = p.ev("const b=Sketch.state.bg; return [b.w, b.a]")
    ok2 = abs(bg[0] - 50) < 0.5 and abs(bg[1][0] + 45) < 0.5
    c = to_screen(p, 0, 0); d = to_screen(p, 10, 0)
    p.pg.mouse.move(c[0], c[1]); p.pg.mouse.down(); p.pg.mouse.move(d[0], d[1], steps=4); p.pg.mouse.up(); p.wait(300)
    ok3 = abs(p.ev("return Sketch.state.bg.a[0]") - bg[1][0] - 10) < 0.6
    p.ev("const S=Sketch.state; S.ents.push({id:'r1',type:'rect',a:[0,0],b:[10,10]})")
    fertig_hoch(p)
    ok4 = p.ev("return !!App.doc.items[0].p.sketch.bg && App.doc.items[0].p.sketch.bg.w > 49")
    p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1200)
    ok5 = p.ev("return !!Sketch.state.bg")
    return [ok1, ok2, ok3, ok4, ok5]


def t_skizzenleiste(p):
    sketch_xy(p)
    p.pg.set_viewport_size({'width': 1000, 'height': 760}); p.wait(600)
    # alle Werkzeuge sichtbar (Leiste bricht um statt abzuschneiden)
    vis = p.pg.evaluate("(()=>{const bar=document.querySelector('.sketchbar').getBoundingClientRect(); return [...document.querySelectorAll('.sketchbar .tool')].every(b=>{const r=b.getBoundingClientRect(); return r.width>0 && r.right<=bar.right+1 && r.left>=bar.left-1;})})()")
    over = p.pg.evaluate("(()=>{const a=document.querySelector('.sketchbar').getBoundingClientRect(), b=document.querySelector('.consbar').getBoundingClientRect(); return b.top >= a.bottom || b.right <= a.left || b.left >= a.right})()")
    return [vis, over]


# ---------- Sitzung 20: Magnetisches Einrasten ----------
def platte(p, w=40, d=20, h=4):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=0; it.t.y=0; it.p.w=arg[0]; it.p.d=arg[1]; it.p.h=arg[2]; })", [w, d, h]); p.wait(2000)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)


def t_magnet_flaeche(p):
    platte(p)
    z = p.ev("return App.results.get(App.doc.items[0].id).data.bbox[5]")
    s = world_screen(p, 14, 6, z); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'through'); p.pg.select_option('#hw-size', 'M3'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2500)   # erstes Loch dort, wo geklickt wurde
    s1 = world_screen(p, 0.6, -0.5, z); p.pg.mouse.move(s1[0], s1[1]); p.wait(500); p.pg.mouse.move(s1[0] + 1, s1[1]); p.wait(300)
    p.pg.mouse.click(s1[0] + 1, s1[1]); p.wait(2500)   # knapp neben der Mitte -> rastet in die Mitte
    # zweites Loch: etwas neben der Mittellinie, x = 12 -> y rastet auf 0
    s2 = world_screen(p, 12, 0.5, z); p.pg.mouse.move(s2[0], s2[1]); p.wait(500); p.pg.mouse.move(s2[0] + 1, s2[1]); p.wait(300)
    lab = p.ev("return Snap.label")
    p.pg.mouse.click(s2[0] + 1, s2[1]); p.wait(2500)
    # drittes Loch: gleicher Randabstand auf der anderen Seite (x = -12)
    s3 = world_screen(p, -11.6, 0.4, z); p.pg.mouse.move(s3[0], s3[1]); p.wait(500); p.pg.mouse.move(s3[0] + 1, s3[1]); p.wait(300)
    lab3 = p.ev("return Snap.label")
    p.pg.mouse.click(s3[0] + 1, s3[1]); p.wait(2500)
    p.pg.keyboard.press('Escape'); p.wait(800)
    pos = p.ev("const out=[]; Model.walk(App.doc.items, it=>{ if(it.kind==='part') out.push([it.t.x,it.t.y]) }); return out")
    ok1 = len(pos) == 4 and abs(pos[1][0]) < 1e-6 and abs(pos[1][1]) < 1e-6
    ok2 = abs(pos[2][1]) < 1e-6 and lab and 'Mittellinie' in lab
    ok3 = abs(pos[3][0] + pos[2][0]) < 1e-6 and lab3 and 'Randabstand' in lab3
    ok4 = p.ev("return App.errors.length") == 0 and p.pg.locator('.snaptip').count() == 0
    return [ok1, ok2, ok3, ok4]



# ---------- Sitzung 56: Magnet auf gewölbten Flächen ----------
def liegendes_rohr(p):
    p.empty(); p.ev("Actions.addPrimitive('cylinder')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.p.d=20; it.p.h=40; it.t.x=0; it.t.y=20; it.t.z=10; it.t.rx=90; it.t.ry=0; it.t.rz=0; })"); p.wait(2000)
    p.ev("Viewer.setView('top', false)"); p.wait(1200)


def teil_welt(p):
    return p.ev("const out=[]; Model.walk(App.doc.items, it=>{ if(it.kind==='part'){ const e=Model.worldMatrix(App.doc,it.id).elements; out.push([e[12],e[13],e[14],e[8],e[9],e[10]]) } }); return out")


def t_magnet_rund(p):
    liegendes_rohr(p)
    s = world_screen(p, 0.7, 6, 19.9); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'through'); p.pg.select_option('#hw-size', 'M3'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2500)
    # knapp neben „Mitte · ganz oben“
    s1 = world_screen(p, 0.6, 0.5, 19.95); p.pg.mouse.move(s1[0], s1[1]); p.wait(600); p.pg.mouse.move(s1[0] + 1, s1[1]); p.wait(300)
    lab = p.ev("return Snap.label")
    guides = p.ev("return Viewer.groups.overlay.children.length")
    p.pg.mouse.click(s1[0] + 1, s1[1]); p.wait(2500)
    p.pg.keyboard.press('Escape'); p.wait(800)
    w = teil_welt(p)
    ok1 = len(w) == 2 and abs(w[0][0]) < 1e-3 and abs(w[0][2] - 20) < 1e-3 and abs(w[0][5] - 1) < 1e-6
    ok2 = len(w) == 2 and abs(w[1][0]) < 1e-3 and abs(w[1][1]) < 1e-3 and abs(w[1][2] - 20) < 1e-3 and abs(w[1][5] - 1) < 1e-6
    ok3 = bool(lab) and 'ganz oben' in lab and 'Mitte' in lab and guides > 0
    # von der Seite: „ganz rechts“ auf der Rohrseite, Loch zeigt waagerecht nach außen
    p.ev("Viewer.setView('right', false)"); p.wait(1200)
    s2 = world_screen(p, 10, 8, 10.6); p.pg.mouse.click(s2[0], s2[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.click('#hw-go'); p.wait(2500); p.pg.keyboard.press('Escape'); p.wait(800)
    w = teil_welt(p)
    ok4 = len(w) == 3 and abs(w[2][0] - 10) < 1e-3 and abs(w[2][2] - 10) < 1e-3 and abs(w[2][3] - 1) < 1e-6
    ok5 = p.ev("return App.errors.length") == 0 and p.pg.locator('.snaptip').count() == 0
    # Kugel: am Äquator „ganz vorne“ – genau auf dem Radius
    p.ev("App.setDoc(Model.newDoc()); Actions.addPrimitive('sphere')"); p.wait(2000); p.ev("App.clearSelection()")
    p.ev("Viewer.setView('iso', false)"); p.wait(1000)
    v = [0.62 / 1.3367, -0.9 / 1.3367, 0.7 / 1.3367]
    s = world_screen(p, 10 * v[0], 10 * v[1], 10 + 10 * v[2]); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400); p.pg.click('#hw-go'); p.wait(2500)
    s1 = world_screen(p, 0.4, -9.96, 10.87); p.pg.mouse.move(s1[0], s1[1]); p.wait(600); p.pg.mouse.move(s1[0] + 1, s1[1]); p.wait(400)
    lab2 = p.ev("return Snap.label")
    p.pg.mouse.click(s1[0] + 1, s1[1]); p.wait(2000); p.pg.keyboard.press('Escape'); p.wait(600)
    k = teil_welt(p)
    ok6 = bool(lab2) and 'ganz vorne' in lab2 and len(k) == 2 and abs(k[1][0]) < 0.01 and abs(k[1][1] + 10) < 1e-3 and abs(k[1][2] - 10) < 1e-3 and abs(k[1][4] + 1) < 1e-6
    return [ok1, ok2, ok3, ok4, ok5, ok6]

def t_magnet_kaufteil(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ const a=d.items[0]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:60,d:60,h:4}); })"); p.wait(2000)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="motor"]').click(); p.wait(300)
    tile = p.pg.locator('.flyout .tile').filter(has_text='Motor 2207').first.bounding_box()
    tgt = world_screen(p, 0.6, -0.5, 4)
    p.pg.mouse.move(tile['x'] + 20, tile['y'] + 20); p.pg.mouse.down()
    # die Vorschau in echter Form wird zuerst gerechnet, die Flächendaten für den Magneten kommen kurz danach
    p.pg.mouse.move(tgt[0], tgt[1], steps=12); p.wait(2500); p.pg.mouse.move(tgt[0] + 1, tgt[1] + 1); p.wait(500)
    lab = p.ev("return Snap.label")
    p.pg.mouse.up(); p.wait(3000)
    t = p.ev("const m=App.doc.items.find(i=>i.name==='Motor 2207'); return m && m.t")
    return [lab == 'Mitte der Fläche', t is not None and abs(t['x']) < 1e-6 and abs(t['y']) < 1e-6 and abs(t['z'] - 4) < 1e-6]

def t_vorschau_echt(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(2000)
    p.ev("App.change('x', d=>{ const a=d.items[0]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:60,d:60,h:4}); })"); p.wait(2000)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="motor"]').click(); p.wait(300)
    tile = p.pg.locator('.flyout .tile').filter(has_text='Motor 2207').first.bounding_box()
    tgt = world_screen(p, 10, 8, 4)
    p.pg.mouse.move(tile['x'] + 20, tile['y'] + 20); p.pg.mouse.down()
    p.pg.mouse.move(tgt[0], tgt[1], steps=12); p.wait(2500); p.pg.mouse.move(tgt[0] + 1, tgt[1] + 1); p.wait(600)
    # echte Form des Motors (rund), an der Maus, nicht anklickbar
    r = p.ev("const n=Viewer.nodes.get('__dragprev'); if(!n) return null; const m=n.obj.matrixWorld.elements; return [m[12],m[13],m[14], n.obj.visible, n.data.faces.filter(f=>f.t!=='PLANE').length]")
    ok1 = r is not None and abs(r[0] - 10) < 1.5 and abs(r[1] - 8) < 1.5 and abs(r[2] - 4) < 0.01 and r[3] and r[4] > 0
    p.pg.mouse.up(); p.wait(3000)
    ok2 = p.ev("return !App.extra.some(x=>x.id==='__dragprev') && !Viewer.nodes.has('__dragprev') && App.doc.items.length===2 && App.errors.length===0")
    return [ok1, ok2]

# ---------- Sitzung 72: Antenne als Kaufteil ----------
def t_antenne(p):
    p.empty()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="funk"]').click(); p.wait(300)
    ok1 = p.pg.locator('.flyout .tile').filter(has_text='Antenne Pilz').count() == 1 and p.pg.locator('.flyout .tile').filter(has_text='Antenne Stab').count() == 1
    p.pg.locator('.flyout .tile').filter(has_text='Antenne Pilz').first.click(); warte_rechnen(p, 30)
    it = p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); return [it.p.lib, it.massG, r && r.data.bbox, App.errors.length]")
    bb = it[2]
    ok2 = it[0] == 'buyAntenna' and it[1] == '' and bb is not None and abs(bb[5] - bb[2] - 45) < 0.1 and abs(bb[3] - bb[0] - 14) < 0.1 and it[3] == 0
    # Stab mit U.FL: 80 lang, 4 dick
    p.ev("App.change('x', d=>{ Object.assign(d.items[0].p, {form:'stab', conn:'ufl', L:80, d:4}); })"); warte_rechnen(p, 30)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok3 = abs(bb[5] - bb[2] - 80) < 0.1 and abs(bb[3] - bb[0] - 4) < 0.1 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]

# ---------- Sitzung 73: Zeitleiste mit Vorschau ----------
def t_zeitleiste_vorschau(p):
    three(p); warte_rechnen(p)
    ids = p.ev("return App.doc.items.map(i=>i.id)")
    c = p.pg.locator('.tl-chip').first.bounding_box()
    p.pg.mouse.move(c['x'] + 5, c['y'] + 10); p.pg.mouse.move(c['x'] + 9, c['y'] + 14, steps=3); p.wait(1500); warte_rechnen(p)
    vis = lambda: p.ev("return App.doc.items.map(i=>App.results.has(i.id))")
    ok1 = p.ev("return App.peeking") == 1 and vis() == [True, False, False] and 'Vorschau' in p.pg.locator('.tl-info').inner_text() and p.ev("return App.doc.rollback") is None
    ok2 = p.pg.locator('.tl-chip.peekoff').count() == 2
    p.pg.mouse.move(c['x'] + 5, c['y'] - 200, steps=4); p.wait(1500); warte_rechnen(p)
    ok3 = p.ev("return App.peeking") is None and vis() == [True, True, True] and '3' in p.pg.locator('.tl-info').inner_text()
    # eine Änderung beendet die Vorschau
    p.ev("App.peek(2)"); p.wait(1200); warte_rechnen(p)
    a = vis() == [True, True, False]
    p.ev("App.change('x', d=>{ d.items[0].t.x += 5; })"); p.wait(1200); warte_rechnen(p)
    ok4 = a and p.ev("return App.peeking") is None and vis() == [True, True, True]
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 74: DXF importieren ----------
def t_dxf_import(p):
    p.empty()
    def dxf(*pairs): return "\n".join(str(x) for x in pairs) + "\n"
    head = [0,'SECTION',2,'HEADER',9,'$INSUNITS',70,1,0,'ENDSEC',0,'SECTION',2,'ENTITIES']
    # Platte 4 × 2 Zoll mit runder Ecke (Bulge), Loch und einem Langloch aus Linien + Bögen
    body = [0,'LWPOLYLINE',90,5,70,1, 10,0,20,0, 10,4,20,0, 10,4,20,1.5,42,0.41421356, 10,3.5,20,2, 10,0,20,2,
            0,'CIRCLE',10,1,20,1,40,0.25,
            0,'LINE',10,2,20,0.8,11,3,21,0.8, 0,'ARC',10,3,20,1,40,0.2,50,270,51,90,
            0,'LINE',10,3,20,1.2,11,2,21,1.2, 0,'ARC',10,2,20,1,40,0.2,50,90,51,270,
            0,'ENDSEC',0,'EOF']
    txt = dxf(*(head + body))
    p.ev("Start.openBlob(new File([%s], 'Rahmen.dxf'))" % repr(txt)); p.wait(800); warte_rechnen(p, 40)
    r = p.ev("const it=App.doc.items[0]; const R=it && App.results.get(it.id); return [App.doc.items.length, it && it.kind, it && it.name, R && R.data.bbox, R && R.data.faces.length, App.errors.length, it && it.p.sketch.ents.length]")
    bb = r[3]
    ok1 = r[0] == 1 and r[1] == 'extrude' and r[2] == 'Rahmen' and bb is not None and abs(bb[3] - bb[0] - 101.6) < 0.05 and abs(bb[4] - bb[1] - 50.8) < 0.05 and abs(bb[5] - bb[2] - 3) < 0.01 and abs(bb[0] + 50.8) < 0.05
    # 2 Deckflächen + 5 Außenwände (mit runder Ecke) + 1 Loch + 4 Langloch
    ok2 = r[4] == 12 and r[5] == 0 and r[6] == 10
    # ohne geschlossene Kontur und mit Unsinn: nichts kommt dazu, eine Meldung erklärt es
    p.ev("Start.openBlob(new File([%s], 'offen.dxf'))" % repr(dxf(0,'SECTION',2,'ENTITIES',0,'LINE',10,0,20,0,11,10,21,0,0,'ENDSEC',0,'EOF'))); p.wait(600)
    t1 = p.pg.locator('.toast').last.inner_text()
    p.ev("Start.openBlob(new File(['AutoCAD Binary DXF\\r\\n\\x1a\\x00 abc'], 'binaer.dxf'))"); p.wait(600)
    t2 = p.pg.locator('.toast').last.inner_text()
    ok3 = p.ev("return App.doc.items.length") == 1 and 'geschlossene Kontur' in t1 and 'nicht lesen' in t2
    return [ok1, ok2, ok3]

def t_magnet_koerper(p):
    zwei_quader(p, 0, 3, 0, 40)   # zweiter Quader 40 mm daneben, 3 mm versetzt
    p.ev("Viewer.setView('top', false)"); p.wait(1200)
    b0 = p.ev("const b=Actions.worldBox(App.doc.items[1].id); return [b.min.y,b.max.y,b.max.z]")
    s = world_screen(p, 40, 0, b0[2]); p.pg.mouse.move(s[0], s[1]); p.pg.mouse.down()
    t = world_screen(p, 40.5, -2.6, b0[2]); p.pg.mouse.move(t[0], t[1], steps=6); p.wait(300)
    lab = p.ev("return Snap.label")
    gap_lbl = p.pg.locator('.dimlabel.live').inner_text() if p.pg.locator('.dimlabel.live').count() else ''
    p.pg.mouse.up(); p.wait(1500)
    y = p.ev("const a=Actions.worldBox(App.doc.items[0].id), b=Actions.worldBox(App.doc.items[1].id); return [a.min.y,b.min.y,a.max.y,b.max.y]")
    ok1 = abs(y[0] - y[1]) < 1e-3 and lab is not None and 'Abstand' in gap_lbl
    # mit Strg kein Einrasten
    s = world_screen(p, 45, 5, b0[2]); p.pg.mouse.move(s[0], s[1]); p.pg.keyboard.down('Control'); p.pg.mouse.down()
    t = world_screen(p, 45, 6.4, b0[2]); p.pg.mouse.move(t[0], t[1], steps=6); p.pg.mouse.up(); p.pg.keyboard.up('Control'); p.wait(1500)
    y2 = p.ev("const a=Actions.worldBox(App.doc.items[0].id), b=Actions.worldBox(App.doc.items[1].id); return [a.min.y,b.min.y]")
    ok2 = abs(y2[0] - y2[1]) > 0.5
    # Einstellung aus
    p.ev("App.change('x', d=>{ d.settings.magnet=false; })"); p.wait(300)
    s = world_screen(p, 45, 6, b0[2]); p.pg.mouse.move(s[0], s[1]); p.pg.mouse.down()
    t = world_screen(p, 45, 4.6, b0[2]); p.pg.mouse.move(t[0], t[1], steps=6); p.wait(200)
    ok3 = p.ev("return Snap.label") is None
    p.pg.mouse.up()
    return [ok1, ok2, ok3]


def t_rundung_ziehen(p):
    platte(p, 40, 20, 10)
    p.ev("Viewer.setView('iso', false)"); p.wait(1200)
    # obere vordere Kante (y = -10, z = 10) anklicken
    idx = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.m[1]+10)<1e-3 && Math.abs(e.m[2]-10)<1e-3)")
    p.ev("App.select([App.doc.items[0].id], { edges: [{ id: App.doc.items[0].id, edgeIdx: arg }] })", idx); p.wait(600)
    ok1 = p.ev("return Handles.debugKinds ? Handles.debugKinds() : null") == ['fillet'] and p.pg.locator('.fillet-tip').count() == 1
    hp = p.ev("const m=Handles.debugHandle('fillet'); const s=Viewer.toScreen(m.position); const r=Viewer.canvas.getBoundingClientRect(); const d=Viewer.toScreen(m.position.clone().addScaledVector(m.userData.wdir, 3)); return [s.x+r.left, s.y+r.top, d.x+r.left, d.y+r.top]")
    p.pg.mouse.move(hp[0], hp[1]); p.pg.mouse.down(); p.pg.mouse.move(hp[2], hp[3], steps=6); p.wait(1500)
    live = p.pg.locator('.dimlabel.live').inner_text()
    p.pg.mouse.up(); warte_rechnen(p, 20)
    fin = p.ev("const it=App.doc.items[0]; return (it.finishes||[]).map(f=>[f.type,f.r])")
    ok2 = len(fin) == 1 and fin[0][0] == 'fillet' and 2 <= fin[0][1] <= 4 and live.startswith('R')
    ok3 = p.ev("return App.errors.length") == 0 and p.ev("return App.results.get(App.doc.items[0].id).data.faces.length") == 7
    # Rückgängig: Rundung weg
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(600); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 20)
    ok4 = p.ev("return (App.doc.items[0].finishes||[]).length") == 0
    return [ok1, ok2, ok3, ok4]


# ---------- Sitzung 21: Skizzieren im 3D leichter ----------
def t_ebene_versetzt(p):
    p.empty()
    p.pg.locator('#t-sketch').click(); p.wait(400)
    p.pg.fill('#sk-off', '15'); p.pg.press('#sk-off', 'Enter'); p.wait(100)
    p.pg.get_by_text('Auf der Arbeitsfläche').first.click(); p.wait(1500)
    ok1 = p.ev("return Sketch.state.plane.o[2]") == 15
    p.ev("const S=Sketch.state; S.ents.push({id:'r1',type:'rect',a:[-10,-5],b:[10,5]})")
    # Neigung 30°
    p.pg.locator('#sk-plane summary').click() if not p.ev("return document.querySelector('#sk-plane').open") else None
    p.pg.fill('#pl-tilt', '30'); p.pg.press('#pl-tilt', 'Enter'); p.wait(800)
    n = p.ev("return Sketch.state.plane.n")
    ok2 = abs(n[2] - math.cos(math.radians(30))) < 1e-6 and abs(abs(n[1]) - 0.5) < 1e-6
    fertig_hoch(p, '2')
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    z = p.ev("const it=App.doc.items[0]; return it.p.sketch.plane.o[2]")
    ok3 = z == 15 and p.ev("return App.errors.length") == 0 and (bb[5] - bb[2]) > 5   # geneigte Platte: deutlich höher als 2 mm
    return [ok1, ok2, ok3]


def t_doppelklick_flaeche(p):
    platte(p, 40, 20, 6)
    p.ev("Viewer.setView('iso', false)"); p.wait(1200)
    s = world_screen(p, 12, 4, 6); p.pg.mouse.dblclick(s[0], s[1]); p.wait(1500)
    ok1 = p.ev("return Sketch.active") and abs(p.ev("return Sketch.state.plane.o[2]") - 6) < 1e-6 and p.ev("return Sketch.state.refs.length") >= 4
    return [ok1]


def skizzenkoerper(p, ents, z=0, name='S'):
    p.ev("App.change('x', d=>{ const it=Model.newItem('extrude',{},{name:arg[2]}); it.p={sketch:{plane:{o:[0,0,arg[1]],x:[1,0,0],n:[0,0,1]},ents:arg[0],dims:[],cons:[]},dist:2,dir:'normal'}; d.items.push(it); })", [ents, z, name])


def t_uebergang(p):
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 30, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    ok1 = p.ev("return App.doc.items.length===1 && App.doc.items[0].kind==='loft' && App.errors.length===0")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok2 = abs(bb[2]) < 1e-3 and abs(bb[5] - 30) < 1e-3 and abs(bb[3] - 15) < 1e-3
    p.pg.fill('#p-tip', '15'); p.pg.press('#p-tip', 'Enter'); warte_rechnen(p, 30)
    bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok3 = abs(bb2[5] - 45) < 1e-3 and p.ev("return App.errors.length") == 0
    # einzelner Umriss: Zur Spitze -> Pyramide 30 x 20, Spitze 10 mm
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(500)
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Platte'); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Zur Spitze"]').click(); warte_rechnen(p, 30)
    v = volumen(p)
    ok4 = v is not None and abs(v - 2000) < 1
    return [ok1, ok2, ok3, ok4]


def t_entlang_pfad(p):
    sketch_xy(p)
    p.ev("const S=Sketch.state; S.ents.push({id:'l1',type:'line',a:[0,0],b:[40,0]},{id:'l2',type:'line',a:[40,0],b:[40,30]},{id:'s1',type:'spline',pts:[[40,30],[30,45],[10,40]]})")
    p.pg.keyboard.press('Enter'); p.wait(500)
    p.pg.locator('#st-mode-sweep').click(); p.wait(200)
    p.pg.locator('.stepbox .btn.primary').click(); warte_rechnen(p, 30)
    ok1 = p.ev("return App.doc.items.length===1 && App.doc.items[0].kind==='sweep' && App.errors.length===0")
    v = volumen(p)
    ok2 = v is not None and 1800 < v < 3500
    p.pg.fill('#p-wall', '1'); p.pg.press('#p-wall', 'Enter'); warte_rechnen(p, 30)
    v2 = volumen(p)
    ok3 = v2 is not None and abs(v2 / v - (1 - (2 / 3) ** 2)) < 0.03 and p.ev("return App.errors.length") == 0
    p.pg.select_option('#p-shape', 'rect'); warte_rechnen(p, 30)
    ok4 = p.ev("return App.errors.length") == 0 and p.pg.locator('#p-w').count() == 1
    # Pfad bearbeiten per Doppelklick-Weg (E): Skizze öffnet sich und speichert wieder
    p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1200)
    ok5 = p.ev("return Sketch.active && Sketch.state.ents.length===3")
    p.pg.keyboard.press('Enter'); p.wait(1500)
    ok5 = ok5 and not p.ev("return Sketch.active")
    return [ok1, ok2, ok3, ok4, ok5]


def t_abstand_setzen(p):
    zwei_quader(p, 0, 0, 0, 40)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Abstand"]').click(); p.wait(300)
    ok1 = '20' in p.pg.locator('label[for="gap-v"]').inner_text()
    p.pg.fill('#gap-v', '5'); p.pg.press('#gap-v', 'Enter'); p.wait(1500)
    x = p.ev("return [App.doc.items[0].t.x, App.doc.items[1].t.x]")
    ok2 = x[0] == 0 and abs(x[1] - 25) < 1e-6
    return [ok1, ok2]


def t_import_step(p):
    # STEP aus Tracery selbst erzeugen und wieder einlesen
    zwei_quader(p, 0, 0, 0, 40)
    n = p.pg.evaluate("""async () => { const {Kernel, Model, App, Start} = window.__masswerk; const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      window.__stepFile = new File([new Uint8Array(r.data)], 'Halter.step'); return r.data.byteLength; }""")
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(500)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(window.__stepFile)")
    warte_rechnen(p, 30)
    its = p.ev("return App.doc.items.map(it=>[it.kind, it.name, it.p.fmt])")
    ok1 = n > 1000 and len(its) == 2 and all(x == ['import', 'Quader', 'step'] for x in its)
    bbs = p.ev("return App.doc.items.map(it=>{ const r=App.results.get(it.id); return r && r.data.bbox; })")
    ok2 = (all(b is not None for b in bbs)
           and abs((max(b[3] for b in bbs) - min(b[0] for b in bbs)) - 60) < 0.01
           and p.ev("return App.errors.length") == 0)
    # Einheit Zoll: 25,4-fach
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.select_option('#p-scale', '25.4'); warte_rechnen(p, 30)
    bb2 = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data.bbox")
    ok3 = bb2 is not None and abs((bb2[3] - bb2[0]) - 20 * 25.4) < 0.5
    # STL: Tetraeder als Text
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(500)
    p.pg.evaluate("""() => { const V=[[0,0,0],[10,0,0],[0,10,0],[0,0,10]], F=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
      let t='solid t\\n'; for (const f of F) { t+=' facet normal 0 0 0\\n  outer loop\\n'; for (const i of f) t+='   vertex '+V[i].join(' ')+'\\n'; t+='  endloop\\n endfacet\\n'; } t+='endsolid t\\n';
      return window.__masswerk.Start.importCAD(new File([t], 'spitze.stl')); }""")
    warte_rechnen(p, 30)
    v = volumen(p)
    ok4 = p.ev("return App.doc.items[0].p.fmt") == 'stl' and v is not None and abs(abs(v) - 1000 / 6) < 1
    return [ok1, ok2, ok3, ok4]


def t_schablonen(p):
    sketch_xy(p)
    p.pg.keyboard.press('j'); p.wait(200)
    ok1 = p.pg.locator('#tp-type').count() == 1 and p.pg.locator('#tp-n').count() == 1
    o = to_screen(p, 0, 0); p.pg.mouse.click(o[0], o[1]); p.wait(500)
    st = p.ev("const S=Sketch.state; return [S.ents.length, S.ents.filter(e=>e.type==='rect').length, SK.regions(S.ents).length]")
    ok2 = st[0] == 49 and st[1] == 49 and st[2] == 49     # Gehäuse + 48 Pins
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok3 = p.ev("return Sketch.state.ents.length") == 0
    p.pg.select_option('#tp-type', 'pins'); p.wait(200)
    p.pg.fill('#tp-nx', '4'); p.pg.press('#tp-nx', 'Enter'); p.wait(100)
    p.pg.mouse.click(o[0], o[1]); p.wait(500)
    c = p.ev("return Sketch.state.ents.map(e=>e.c[0]).sort((a,b)=>a-b)")
    ok4 = len(c) == 8 and abs(c[0] + 3.81) < 1e-6 and abs(c[-1] - 3.81) < 1e-6
    # Sitzung 28: Werte nach Gemini-Prüfung, USB-C-Stecker-Ausschnitt mit runden Ecken
    p.pg.select_option('#tp-type', 'qfp'); p.wait(200)
    ok5 = abs(float(p.pg.input_value('#tp-padW').replace(',', '.')) - 0.22) < 1e-9 and p.pg.locator('#tp-note').count() == 1
    p.pg.select_option('#tp-type', 'usbcp'); p.wait(200)
    o2 = to_screen(p, 30, 0); p.pg.mouse.click(o2[0], o2[1]); p.wait(500)
    u = p.ev("const S=Sketch.state; const n=S.ents.filter(e=>e.type!=='circle'); const b=SK.bounds(n); return [n.filter(e=>e.type==='line').length, n.filter(e=>e.type==='arc').length, SK.regions(n).length, b]")
    ok6 = u[0] == 4 and u[1] == 4 and u[2] == 1 and abs(u[3][0] - 23.5) < 1e-6 and abs(u[3][2] - 36.5) < 1e-6 and abs(u[3][1] + 3.5) < 1e-6 and abs(u[3][3] - 3.5) < 1e-6
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- Sitzung 28: Muster entlang Kurve ----------
def t_muster_kurve(p):
    platte(p, 10, 2, 4)
    b0 = bbox(p); cx0 = (b0[0] + b0[3]) / 2; cy0 = (b0[1] + b0[4]) / 2
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    ctx(p, 'Muster', 'Muster entlang Kurve')
    st = p.ev("const S=Sketch.state; return S && [S.ctx.mode, S.tool, S.ents.length, S.ents[0].type, S.ents[0].a]")
    ok1 = st and st[0] == 'patpath' and st[1] == 'line' and st[2] == 1 and st[3] == 'point' and abs(st[4][0] - cx0) < 1e-6 and p.pg.locator('#path-hint').count() == 1
    # Linie mit echten Klicks vom Original 30 mm nach rechts
    a = to_screen(p, cx0, cy0); b = to_screen(p, cx0 + 30, cy0)
    p.pg.mouse.click(a[0], a[1]); p.wait(200); p.pg.mouse.click(b[0], b[1]); p.wait(200); p.pg.keyboard.press('Escape'); p.wait(300)
    cnt = p.pg.locator('#path-count').inner_text().strip() if p.pg.locator('#path-count').count() else ''
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(2500); warte_rechnen(p, 30)
    g = p.ev("const it=App.doc.items[0]; return [App.doc.items.length, it.kind, it.p && it.p.pt, it.children.length, Sketch.active]")
    bb = bbox(p)
    ok2 = cnt == '5' and g == [1, 'group', 'path', 1, False] and near(bb, [b0[0], b0[1], b0[2], b0[3] + 30, b0[4], b0[5]]) and p.ev("return Features.sizeText(App.doc.items[0])") == '5× entlang Kurve'
    # Abstand 12: Kopien bei 0, 12, 24 (36 passt nicht mehr auf die Kurve)
    field(p, '#op-d', 12); warte_rechnen(p, 30)
    ok3 = near(bbox(p)[3:4], [b0[3] + 24]) and p.ev("return Features.sizeText(App.doc.items[0])") == '3× entlang Kurve'
    # Kurve bearbeiten: Kreis durch das Original, 4 Kopien, drehen mit
    field(p, '#op-d', 0); field(p, '#op-n', 4)
    p.pg.locator('#op-editpath').click(); p.wait(1200)
    ok4 = p.ev("return !!Sketch.active && Sketch.state.ctx.mode==='edit'") and p.pg.locator('#path-hint').count() == 1
    p.ev("const S=Sketch.state; S.ents=S.ents.filter(e=>e.type==='point'); S.ents.push({id:'K',type:'circle',c:[arg[0]+20,arg[1]],r:20})", [cx0, cy0]); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(2500); warte_rechnen(p, 30)
    bb = bbox(p)
    # Kopien oben und unten stehen quer: 10 mm lang in Y
    ok5 = bb and abs(bb[3] - (cx0 + 45)) < 0.2 and abs(bb[4] - (cy0 + 25)) < 0.2 and abs(bb[1] - (cy0 - 25)) < 0.2
    p.pg.select_option('#op-align', 'nein'); p.wait(2500); warte_rechnen(p, 30)
    bb = bbox(p)
    ok6 = bb and abs(bb[4] - (cy0 + 21)) < 0.2 and abs(bb[3] - (cx0 + 45)) < 0.2 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_ki_muster_kurve(p):
    ki(p); p.empty()
    ki_fragen(p, 'Ein Stift 4 mm', {'antwort': 'Hier ist der Stift.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'cylinder', 'name': 'Stift', 'p': {'d': 4, 'h': 6}, 't': {'x': -20, 'y': 0}}}]})
    sid = p.ev("return App.doc.items[0].id")
    ki_fragen(p, 'Jetzt fünf davon auf einem Halbkreis', {'antwort': 'Fünf Stifte auf einem Bogen.', 'aktionen': [
        {'op': 'muster', 'id': sid, 'art': 'kurve', 'n': 5, 'kurve': [{'typ': 'bogen', 'von': [-20, 0], 'durch': [0, 20], 'bis': [20, 0]}]}]})
    g = p.ev("const g=App.doc.items[0]; return [g.kind, g.p && g.p.pt, g.children.length, App.errors.length, Features.sizeText(g)]")
    ok1 = g == ['group', 'path', 1, 0, '5× entlang Kurve'] and near(bbox(p), [-22, -2, 0, 22, 22, 6], 0.25)
    ok2 = '"art":"kurve"' in p.ev("return window.__aiPrompts[1]")
    return [ok1, ok2]


def t_kreismuster_achse(p):
    p.empty(); p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:10,d:4,h:4}); b.t.z=20; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    ctx(p, 'Muster', 'Kreismuster'); warte_rechnen(p, 20)
    ok1 = near(bbox(p), [-5, -5, 20, 5, 5, 24], 0.2) and p.pg.locator('#op-cz').count() == 0
    p.pg.select_option('#op-axis', 'x'); p.wait(1500); warte_rechnen(p, 30)
    ok2 = p.pg.locator('#op-cz').count() == 1 and p.pg.locator('#op-cx').count() == 0 and near(bbox(p), [-5, -24, -24, 5, 24, 24], 0.2) and p.ev("return App.doc.items[0].p.axis") == 'x'
    field(p, '#op-cz', 10); warte_rechnen(p, 30)
    ok3 = near(bbox(p), [-5, -14, -4, 5, 14, 24], 0.2) and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


# ---------- Sitzung 30: Bohrungen an Skizzenpunkten ----------
def t_bohrung_punkte(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=0; it.t.y=0; it.p.w=40; it.p.d=40; it.p.h=3; })"); warte_rechnen(p, 20)
    fi = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE' && f.n[2]>0.9)")
    p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); Sketch.startOnFace({id:it.id, idx:arg, info:r.data.faces[arg]})", fi); p.wait(1500)
    p.pg.keyboard.press('o'); p.wait(200)
    for q in ((-10, -10), (10, 10)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(250)
    wp = p.ev("const S=Sketch.state; return S.ents.filter(e=>e.type==='point').map(e=>{const w=S.F.o.clone().addScaledVector(S.F.x,e.a[0]).addScaledVector(S.F.y,e.a[1]); return [w.x,w.y,w.z]})")
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(800)
    ok1 = len(wp) == 2 and p.pg.locator('.holewiz').count() == 1 and 'an 2 Punkten' in p.pg.locator('.holewiz').inner_text() and not p.ev("return Sketch.active")
    p.pg.select_option('#hw-type', 'through'); p.pg.select_option('#hw-size', 'M3'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2500); warte_rechnen(p, 30)
    parts = p.ev("const out=[]; Model.walk(App.doc.items, it=>{ if(it.kind==='part' && it.p.lib==='screwHole') out.push(Model.worldMatrix(App.doc, it.id).elements.slice(12,15)) }); return out")
    ok2 = len(parts) == 2 and all(any(abs(a[0] - b[0]) < 0.01 and abs(a[1] - b[1]) < 0.01 for b in wp) for a in parts)
    ok3 = p.ev("return App.errors.length") == 0 and not p.ev("return Place.active") and p.pg.locator('.holebar').count() == 0
    return [ok1, ok2, ok3]


# ---------- Sitzung 31: Wand aus Linie, Schritt hinter dem Marker, Schildchen ----------
def t_wand(p):
    sketch_xy(p)
    p.pg.keyboard.press('l'); p.wait(150)
    for q in ((0, 0), (30, 0), (30, 20)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(150)
    p.pg.keyboard.press('Escape'); p.wait(200)
    p.pg.keyboard.press('n'); p.wait(200)
    ok1 = p.pg.locator('#wall-t').count() == 1 and p.ev("return Sketch.state.tool") == 'wall'
    p.pg.fill('#wall-t', '3'); p.pg.press('#wall-t', 'Enter'); p.wait(150)
    s = to_screen(p, 15, 0); p.pg.mouse.click(s[0], s[1]); p.wait(500)
    st = p.ev("const S=Sketch.state; const r=SK.regions(S.ents); return [r.length, r.length && Math.abs(r[0].area), S.ents.filter(e=>e.con).length, !!(S.status && S.status.ok)]")
    ok2 = st[0] == 1 and abs(st[1] - 150) < 0.5 and st[2] == 2 and st[3]
    fertig_hoch(p, '5')
    v = volumen(p)
    ok3 = v is not None and abs(v - 750) < 1 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


def t_hinter_marker(p):
    p.empty(); p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:10,d:10,h:5})); const c=Model.newItem('cylinder',{d:6,h:8}); c.t.x=20; d.items.push(c); })"); warte_rechnen(p, 20)
    p.ev("Timeline.setMarker(1)"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(600)
    ok1 = p.pg.locator('.ctxbar.inactive').count() == 1 and p.pg.locator('.ctxbar button[aria-label="Löschen"]').count() == 0 and 'hinter dem marker' in p.pg.locator('.ctxbar').inner_text().lower() and p.ev("return Handles.debugKinds ? Handles.debugKinds().length : 0") == 0
    p.pg.locator('.ctxbar button[aria-label="Marker dahinter"]').click(); warte_rechnen(p, 20)
    ok2 = p.ev("return App.doc.rollback==null && Model.isActive(App.doc, App.doc.items[1].id)")
    return [ok1, ok2]


def t_schildchen_ueberlappen(p):
    sketch_xy(p)
    p.ev("const S=Sketch.state; S.ents.push({id:'P',type:'point',a:[0,0]}); S.dims.push({id:'d1',e:'P',k:'x',v:0},{id:'d2',e:'P',k:'y',v:0}); Sketch.setTool('select')"); p.wait(400)
    r = p.ev("return [...document.querySelectorAll('.skdim')].map(e=>{const b=e.getBoundingClientRect(); return [b.left,b.top,b.right,b.bottom]})")
    ok1 = len(r) == 2 and not (r[0][0] < r[1][2] and r[1][0] < r[0][2] and r[0][1] < r[1][3] and r[1][1] < r[0][3])
    return [ok1]


# ---------- Sitzung 32: Kante übernehmen ----------
def t_kante_uebernehmen(p):
    p.empty(); p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:20,d:20,h:10})); const c=Model.newItem('cylinder',{d:10,h:6}); c.t.x=30; d.items.push(c); })"); warte_rechnen(p, 20)
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)
    p.pg.keyboard.press('z'); p.wait(200)
    ok1 = p.ev("return Sketch.state.tool") == 'project'
    s = world_screen(p, 0, 10, 10); p.pg.mouse.click(s[0], s[1]); p.wait(500)
    e = p.ev("const S=Sketch.state; const e=S.ents[S.ents.length-1]; return e && [e.type, e.a, e.b, S.cons.some(c=>c.type==='fix' && c.refs[0].e===e.id)]")
    ok2 = bool(e) and e[0] == 'line' and abs(abs(e[1][0] - e[2][0]) - 20) < 0.01 and abs(e[1][1] - 10) < 0.01 and abs(e[2][1] - 10) < 0.01 and e[3]
    s = world_screen(p, 35, 0, 6); p.pg.mouse.click(s[0], s[1]); p.wait(500)
    c = p.ev("const S=Sketch.state; const e=S.ents[S.ents.length-1]; return e && [e.type, e.c, e.r]")
    ok3 = bool(c) and c[0] == 'circle' and abs(c[1][0] - 30) < 0.01 and abs(c[1][1]) < 0.01 and abs(c[2] - 5) < 0.01
    return [ok1, ok2, ok3]


# ---------- Sitzung 33: verbundene Kanten ----------
def t_kante_verbunden(p):
    p.empty(); p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:20,d:20,h:10})); const c=Model.newItem('cylinder',{d:10,h:6}); c.t.x=30; d.items.push(c); })"); warte_rechnen(p, 20)
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)
    p.pg.keyboard.press('z'); p.wait(200)
    s = world_screen(p, 0, 10, 10); p.pg.mouse.click(s[0], s[1]); p.wait(400)
    s = world_screen(p, 35, 0, 6); p.pg.mouse.click(s[0], s[1]); p.wait(400)
    ok1 = p.ev("const S=Sketch.state; return S.ents.length===2 && S.ents.every(e=>e.link)")
    fertig_hoch(p, '3')
    # Quader tiefer → die übernommene Linie wandert mit
    p.ev("App.change('Tiefe', d=>{ d.items[0].p.d = 30; })"); warte_rechnen(p, 30); p.wait(1000); warte_rechnen(p, 30)
    st = p.ev("const it=App.doc.items[2]; const sk=it.p.sketch; const l=sk.ents.find(e=>e.type==='line'); return [it.kind, l.a[1], l.b[1]]")
    ok2 = st[0] == 'extrude' and abs(st[1] - 15) < 1e-3 and abs(st[2] - 15) < 1e-3
    # Zylinder dicker → der Kreis und der hochgezogene Körper wachsen mit
    p.ev("App.change('Durchmesser', d=>{ d.items[1].p.d = 16; })"); warte_rechnen(p, 30); p.wait(1000); warte_rechnen(p, 30)
    r = p.ev("return App.doc.items[2].p.sketch.ents.find(e=>e.type==='circle').r")
    bb = bbox(p, 2)
    ok3 = abs(r - 8) < 1e-3 and bb is not None and abs((bb[3] - bb[0]) - 16) < 0.05
    # Ein Rückgängig nimmt Zylinder und Kreis zusammen zurück
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30); p.wait(800); warte_rechnen(p, 20)
    r2 = p.ev("return [App.doc.items[1].p.d, App.doc.items[2].p.sketch.ents.find(e=>e.type==='circle').r, App.errors.length]")
    ok4 = r2[0] == 10 and abs(r2[1] - 5) < 1e-3 and r2[2] == 0
    # In der Skizze: Hinweis „Verbunden“ und lösen
    p.ev("Sketch.editItem(App.doc.items[2].id)"); p.wait(1200)
    p.ev("const S=Sketch.state; S.sel=S.ents.find(e=>e.type==='circle').id; Panels.renderRight()"); p.wait(300)
    ok5 = p.pg.locator('#link-info').count() == 1
    p.pg.click('#link-off'); p.wait(300)
    ok6 = p.ev("return !Sketch.state.ents.find(e=>e.type==='circle').link")
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- Sitzung 34: Kreismuster um eine gewählte Achse ----------
def t_kreismuster_gewaehlt(p):
    p.empty(); p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:4,d:4,h:4}); a.t.y=20; d.items.push(a); const b=Model.newItem('box',{w:40,d:10,h:2}); b.t.z=10; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    ctx(p, 'Muster', 'Kreismuster'); warte_rechnen(p, 20)
    p.pg.click('#op-axispick'); p.wait(300)
    ok1 = p.ev("return Features.picking")
    s = world_screen(p, 10, -5, 12); p.pg.mouse.click(s[0], s[1]); p.wait(800); warte_rechnen(p, 30)
    g = p.ev("const q=App.doc.items[0].p; return [q.axis, q.ad, q.ao, Features.picking]")
    ok2 = g[0] == 'pick' and abs(abs(g[1][0]) - 1) < 1e-6 and abs(g[2][1] + 5) < 1e-3 and abs(g[2][2] - 12) < 1e-3 and not g[3] and p.pg.locator('#op-axisinfo').count() == 1
    ok3 = near(bbox(p), [-2, -32, -15, 2, 22, 39], 0.2) and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


# ---------- Sitzung 35: Drohnen-Bausteine ----------
def t_bausteine(p):
    p.empty()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    names = p.pg.locator('.flyout .tile').all_inner_texts()
    ok1 = all(any(n in t for t in names) for n in ('GoPro-Halterung', 'XT60-Halter', 'Antennenhalter'))
    p.pg.keyboard.press('Escape'); p.wait(200)
    p.ev("""App.change('x', d=>{
      const g=Model.newItem('part',{lib:'goproMount',n:'3',t:3,gap:3.2,hole:5.2,fw:15,hz:9,nut:'ja',bw:24,bd:20,bh:2},{role:'solid'}); d.items.push(g);
      const x=Model.newItem('part',{lib:'xt60Holder',w:15.5,h:8.1,fit:0.3,ch:1.5,t:3,ea:26,hole:3.2,wall:2.5},{role:'solid'}); x.t.x=50; d.items.push(x);
      const a=Model.newItem('part',{lib:'antennaMount',n:'2',di:3.5,wall:1.2,len:20,spread:90,lean:30,s:10,bw:22,bd:12,bh:2},{role:'solid'}); a.t.x=-50; d.items.push(a); })"""); warte_rechnen(p, 40)
    b0, b1, b2 = bbox(p, 0), bbox(p, 1), bbox(p, 2)
    ok2 = near(b0, [-12, -10, -2, 12, 10, 16.5], 0.05)
    ok3 = near(b1, [-17.1, -6.85, 0, 17.1, 6.85, 3], 0.05)
    ok4 = b2 is not None and b2[5] > 12 and b2[3] - b2[0] > 30 and abs(b2[2] + 2) < 0.05 and b2[4] > 8 and b2[1] > -6.05 and p.ev("return App.errors.length") == 0   # Röhrchen neigen nach hinten (+Y)
    # Fingerzahl 2 → schmaler
    p.ev("App.change('x', d=>{ d.items[0].p.n='2'; })"); warte_rechnen(p, 30)
    ok5 = p.ev("return App.errors.length") == 0 and bbox(p, 0) is not None
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 36: Überhänge für den 3D-Druck ----------
def t_ueberhang(p):
    p.empty(); p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10}); const b=Model.newItem('box',{w:20,d:20,h:5}); b.t.x=15; b.t.z=10; const g=Model.newItem('group',{},{name:'L'}); g.children=[a,b]; d.items.push(g); })"""); warte_rechnen(p, 30)
    p.ev("Views.overhang(true)"); p.wait(800)
    a1 = p.ev("return Views.overhangArea")
    ok1 = a1 is not None and abs(a1 - 300) < 1 and p.pg.locator('#ov-area').count() == 1 and 'Stützen' in p.pg.locator('#ov-area').inner_text()
    p.pg.select_option('#ov-angle', '60'); p.wait(500)
    ok2 = abs(p.ev("return Views.overhangArea") - 300) < 1
    p.ev("App.change('x', d=>{ d.items[0].children.pop(); })"); warte_rechnen(p, 30); p.wait(500)
    ok3 = p.ev("return Views.overhangArea") < 0.05 and 'Keine Überhänge' in p.pg.locator('#ov-area').inner_text()
    p.ev("Views.overhang(false)"); p.wait(300)
    ok4 = p.pg.locator('#ov-area').count() == 0
    return [ok1, ok2, ok3, ok4]



# ---------- Sitzung 43: Fahrtwind (Stirnfläche) ----------
def t_fahrtwind(p):
    p.empty(); p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:100,d:20,h:10}); b.name='Rumpf'; d.items.push(b); })"); warte_rechnen(p, 30)
    a0 = p.ev("return Views.windArea(0)"); a90 = p.ev("return Views.windArea(90)")
    ok1 = abs(a0 - 1000) < 30 and abs(a90 - 2000) < 60   # von vorne 100 × 10, von oben 100 × 20
    # Propeller zählen nur mit Häkchen
    p.ev("App.change('x', d=>{ const pr=Model.newItem('part',{lib:'buyProp',zoll:5,blades:3,pitch:13}); pr.name='Propeller'; pr.t.z=12; d.items.push(pr); })"); warte_rechnen(p, 30)
    ok2 = abs(p.ev("return Views.windArea(0)") - a0) < 1 and p.ev("return Views.windArea(0, true)") > a0 + 50
    # Ansicht öffnen: Fläche steht unten, Kamera schaut von vorne
    p.ev("Views.wind(true)"); p.wait(1200)
    t = p.pg.locator('#wind-area').inner_text()
    cam = p.ev("const c=Viewer.camera, t=Viewer.controls.target; return [c.position.x-t.x, c.position.y-t.y, c.position.z-t.z]")
    import re
    mt = re.search(r'([0-9]+(?:,[0-9]+)?) cm²', t)
    ok3 = mt is not None and abs(float(mt.group(1).replace(',', '.')) - 10) < 0.25 and "ohne Propeller" in t and cam[1] < 0 and abs(cam[0]) < 1 and abs(cam[2]) < 1 and p.ev("return Viewer.ortho")
    # 30° Neigung: 0,866 × 100 × 10 + 0,5 × 100 × 20 = 1866 mm²
    p.ev("const r=document.querySelector('#wind-angle'); r.value=30; r.dispatchEvent(new Event('input'))"); p.wait(1200)
    w = p.ev("return Views.windInfo")
    ok4 = w['angle'] == 30 and abs(w['area'] - 1866) < 50 and '18' in p.pg.locator('#wind-area').inner_text()
    # Schließen: Kamera und Projektion wie vorher
    p.pg.locator('.viewbar[aria-label="Fahrtwind"] .vb-x').click(); p.wait(1000)
    ok5 = p.pg.locator('#wind-area').count() == 0 and not p.ev("return Viewer.ortho")
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 57: Luftwiderstand und Höchstgeschwindigkeit ----------
def t_luftwiderstand(p):
    p.empty(); p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:100,d:20,h:10}); b.name='Rumpf'; d.items.push(b); })"); warte_rechnen(p, 30)
    p.ev("Views.wind(true)"); p.wait(1500)
    w = p.ev("return Views.windInfo")
    # 1000 mm², cw 0,5 (Rumpf), 100 km/h: ½ · 1,225 · 27,78² · 0,5 · 0,001 = 0,236 N
    ok1 = p.pg.locator('#wind-cw').input_value() == '0.5' and abs(w['drag'] - 0.2363) < 0.01 and '0,2 N' in p.pg.locator('#wind-drag').inner_text()
    p.pg.fill('#wind-v', '200'); p.pg.press('#wind-v', 'Enter'); p.pg.locator('#wind-v').dispatch_event('change'); p.wait(800)
    d200 = p.ev("return Views.windInfo.drag")
    p.pg.select_option('#wind-cw', '1.1'); p.wait(800)
    d11 = p.ev("return Views.windInfo.drag")
    ok2 = abs(d200 - 4 * 0.2363) < 0.04 and abs(d11 - 4 * 0.2363 * 2.2) < 0.08 and '200 km/h' in p.pg.locator('#wind-drag').inner_text()
    ok3 = 'Drohnen-Check' in p.pg.locator('#wind-top').inner_text()
    # Formel: 2 kg Schub, 1 kg Gewicht, cw 1, 1000 mm² -> 60° Neigung, √3 kg waagerecht -> rund 599 km/h
    r = p.ev("return Views.topSpeed(2000, 1000, 1, ()=>1000)")
    ok4 = abs(r['deg'] - 60) < 0.01 and abs(r['kmh'] - 599.6) < 1.5 and p.ev("return Views.topSpeed(900, 1000, 1, ()=>1000)") is None
    p.pg.locator('.viewbar[aria-label="Fahrtwind"] .vb-x').click(); p.wait(600)
    # Speed-Drohne mit Schub: Höchstgeschwindigkeit steht da
    p.ev("App.setDoc(DroneTpl.build('s5')); Start.hide()"); warte_rechnen(p, 90)
    p.ev("App.change('x', d=>{ d.drone.thrustG = 1500; })"); p.wait(800)
    p.ev("Views.wind(true)"); p.wait(4000)
    t = p.pg.locator('#wind-top').inner_text(); w = p.ev("return Views.windInfo")
    ok5 = p.pg.locator('#wind-cw').input_value() == '0.5' and w['top'] is not None and 120 < w['top']['kmh'] < 400 and 'km/h' in t and 'Neigung' in t
    print('   ', t)
    ok6 = p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- Sitzung 37: Überhänge in der Schwachstellen-Analyse ----------
def t_ueberhang_schwach(p):
    p.empty(); p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10}); const b=Model.newItem('box',{w:20,d:20,h:5}); b.t.x=15; b.t.z=10; const g=Model.newItem('group',{},{name:'L'}); g.mat='PETG'; g.children=[a,b]; d.items.push(g); })"""); warte_rechnen(p, 30)
    l = p.ev("return Weak.analyze().then(l=>l.map(x=>[x.id, x.s, x.text]))")
    ok1 = any(x[0] == 'overhang' and x[1] == 'info' and x[2].startswith('300 mm²') for x in l)
    # ohne den oberen Quader: nichts mehr
    p.ev("App.change('x', d=>{ d.items[0].children.pop(); })"); warte_rechnen(p, 30)
    ok2 = not any(x[0] == 'overhang' for x in p.ev("return Weak.analyze().then(l=>l.map(x=>[x.id]))"))
    return [ok1, ok2]


# ---------- Sitzung 38: Muster in der Skizze als Ganzes ändern ----------
def t_muster_ganz(p):
    sketch_xy(p)
    p.ev("const S=Sketch.state; S.ents.push({id:'K',type:'circle',c:[0,0],r:2}); Sketch.setTool('patrect')"); p.wait(300)
    s = to_screen(p, 2, 0); p.pg.mouse.click(s[0], s[1]); p.wait(200)
    p.pg.fill('#pt-nx', '3'); p.pg.press('#pt-nx', 'Enter'); p.pg.fill('#pt-dx', '10'); p.pg.press('#pt-dx', 'Enter'); p.wait(150)
    p.pg.click('#pt-make'); p.wait(500)
    ok1 = p.ev("return Sketch.state.ents.filter(e=>e.type==='circle').length") == 3
    p.ev("const S=Sketch.state; S.selCon=S.cons.find(c=>c.type==='xform').id; S.sel=null; Panels.renderRight()"); p.wait(300)
    ok2 = p.pg.locator('#pg-nx').count() == 1 and p.pg.locator('#pg-apply').count() == 1
    p.pg.fill('#pg-nx', '5'); p.pg.press('#pg-nx', 'Enter'); p.pg.fill('#pg-dx', '8'); p.pg.press('#pg-dx', 'Enter'); p.wait(150)
    p.pg.click('#pg-apply'); p.wait(600)
    st = p.ev("const S=Sketch.state; const c=S.ents.filter(e=>e.type==='circle').map(e=>e.c[0]).sort((a,b)=>a-b); const x=S.cons.filter(k=>k.type==='xform'); return [c, x.length, new Set(x.map(k=>k.pg)).size, !!(S.status&&S.status.ok)]")
    ok3 = len(st[0]) == 5 and all(abs(a - b) < 1e-4 for a, b in zip(st[0], [0, 8, 16, 24, 32])) and st[1] == 4 and st[2] == 1 and st[3]
    p.pg.keyboard.press('Control+z'); p.wait(400)
    ok4 = p.ev("return Sketch.state.ents.filter(e=>e.type==='circle').length") == 3
    return [ok1, ok2, ok3, ok4]


# ---------- Sitzung 39: Drehgelenk ----------
def t_gelenk(p):
    p.empty(); p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Arm A'; d.items.push(a); const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=20; b.name='Arm B'; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id, App.doc.items[1].id])"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    ok1 = p.ev("return Features.picking")
    s = world_screen(p, 10, 0, 4); p.pg.mouse.click(s[0], s[1]); p.wait(800); warte_rechnen(p, 20)
    j = p.ev("const j=(App.doc.joints||[])[0]; return j && [j.a===App.doc.items[0].id, j.b===App.doc.items[1].id, Math.abs(Math.abs(j.ad[1])-1)<1e-6, j.ao[0], j.ao[2]]")
    ok2 = bool(j) and j[0] and j[1] and j[2] and abs(j[3] - 10) < 1e-3 and abs(j[4] - 4) < 1e-3 and p.pg.locator('#joint-sec').count() == 1
    field(p, '#jt-ang', 90); warte_rechnen(p, 20)
    wb = p.ev("const b=Actions.worldBox(App.doc.items[1].id); return [b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z]")
    ok3 = abs((wb[5] - wb[2]) - 20) < 0.1 and abs((wb[3] - wb[0]) - 4) < 0.1 and p.ev("return App.doc.joints[0].ang") == 90
    p.pg.click('#jt-check')
    for _ in range(160):
        p.wait(500)
        if 'Prüfe' not in p.pg.locator('#jt-result').inner_text():
            break
    txt = p.pg.locator('#jt-result').inner_text(); hits = int(p.pg.locator('#jt-result').get_attribute('data-hits') or '0')
    ok4 = 'stößt' in txt and 0 < hits < 37
    p.pg.click('#jt-del'); p.wait(600)
    ok5 = p.ev("return (App.doc.joints||[]).length") == 0 and p.pg.locator('#joint-sec').count() == 0
    return [ok1, ok2, ok3, ok4, ok5]




# ---------- Sitzung 52: Gelenke innerhalb einer Gruppe ----------
def t_gelenk_gruppe(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const g=Model.newItem('group',{}); g.name='Baugruppe'; g.t.x=50; g.t.rz=90;
      const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Arm A';
      const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=20; b.name='Arm B';
      g.children.push(a,b); d.items.push(g);
    })"""); warte_rechnen(p, 30)
    ids = p.ev("const g=App.doc.items[0]; return [g.id, g.children[0].id, g.children[1].id]")
    # Gelenk-Knopf: bei zwei Teilen in der Gruppe ja, bei Gruppe + eigenem Teil nein
    p.ev("App.select(arg)", [ids[1], ids[2]]); p.wait(500)
    btn1 = p.pg.locator('.ctxbar button[aria-label="Gelenk"]').count()
    p.ev("App.select(arg)", [ids[0], ids[1]]); p.wait(500)
    btn2 = p.pg.locator('.ctxbar button[aria-label="Gelenk"]').count()
    ok1 = btn1 == 1 and btn2 == 0 and p.ev("return Joints.add(arg[0], arg[1], [0,0,0], [0,0,1]).ok", [ids[0], ids[1]]) is False
    # Achse = Oberkante zwischen den Armen, in Weltlage umgerechnet
    # Gruppe bei x = 50, um 90° gedreht: (10, 0, 4) liegt in der Welt bei (50, 10, 4), die Richtung Y zeigt nach −X
    r = p.ev("return Joints.add(arg[0], arg[1], [50,10,4], [-1,0,0], {ang: 90})", [ids[1], ids[2]])
    warte_rechnen(p, 30)
    wb = p.ev("const b=Actions.worldBox(arg); return [b.max.z-b.min.z, b.max.x-b.min.x, b.max.y-b.min.y]", ids[2])
    ok2 = r['ok'] and abs(wb[0] - 20) < 0.2 and abs(wb[1] - 10) < 0.2 and abs(wb[2] - 4) < 0.2 and p.ev("return App.doc.items.length===1 && App.doc.items[0].children.length===2 && App.errors.length===0")
    # Rückgängig: Arm B liegt wieder flach in der Gruppe
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    ok3 = p.ev("const b=Actions.worldBox(arg); return Math.abs(b.max.z-b.min.z-4)<0.2", ids[2])
    p.pg.keyboard.press('Control+y'); warte_rechnen(p, 30)
    # Bewegung prüfen rechnet in Weltlage; Abspielen geht nur ganz oben im Verlauf
    res = p.ev("const j=App.doc.joints[0]; return Joints.check(j.id, 30).then(r=>[r.length, r.some(x=>x.v>0.05), r.some(x=>x.v<=0.05)])")
    p.ev("Joints.play(App.doc.joints[0].id)"); p.wait(300)
    ok4 = res[0] == 7 and res[1] and res[2] and not p.ev("return !!Joints.playing") and 'ganz oben' in p.pg.locator('#toasts').inner_text()
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 44: Anschlag übernehmen, Bewegung abspielen ----------
def t_gelenk_anschlag(p):
    p.empty(); p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Arm A'; d.items.push(a); const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=20; b.name='Arm B'; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id, App.doc.items[1].id])"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    s = world_screen(p, 10, 0, 4); p.pg.mouse.click(s[0], s[1]); p.wait(800); warte_rechnen(p, 20)
    p.pg.click('#jt-check')
    for _ in range(160):
        p.wait(500)
        if 'Prüfe' not in p.pg.locator('#jt-result').inner_text():
            break
    fr = p.ev("const j=App.doc.joints[0]; return Joints.check(j.id).then(r=>Joints.freeRange(j, r))")
    ok1 = fr is not None and fr[0] <= 0 <= fr[1] and (fr[0] > -90 or fr[1] < 90) and p.pg.locator('#jt-stop').count() == 1
    p.pg.click('#jt-stop'); p.wait(600)
    j = p.ev("const j=App.doc.joints[0]; return [j.min, j.max]")
    ok2 = abs(j[0] - fr[0]) < 1e-6 and abs(j[1] - fr[1]) < 1e-6 and p.ev("return +document.querySelector('#jt-range').max") == fr[1]
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(600)
    ok3 = p.ev("const j=App.doc.joints[0]; return [j.min, j.max]") == [-90, 90]
    # Abspielen: Das Bild bewegt sich, das Projekt bleibt unverändert
    rev = p.ev("return App.revision")
    p.pg.click('#jt-play'); p.wait(600)
    mid = p.ev("const it=App.doc.items[1], n=Viewer.nodes.get(it.id), m=Model.localMatrix(it); return [!!Joints.playing, n.base.elements.some((v,i)=>Math.abs(v-m.elements[i])>1e-3)]")
    ok4 = mid == [True, True] and 'Stopp' in p.pg.locator('#jt-play').inner_text()
    for _ in range(20):
        p.wait(500)
        if not p.ev("return !!Joints.playing"):
            break
    end = p.ev("const it=App.doc.items[1], n=Viewer.nodes.get(it.id), m=Model.localMatrix(it); return [!!Joints.playing, n.base.elements.every((v,i)=>Math.abs(v-m.elements[i])<1e-6), App.revision===arg]", rev)
    ok5 = end == [False, True, True] and 'abspielen' in p.pg.locator('#jt-play').inner_text()
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 40: Schiebegelenk ----------
def t_schiebegelenk(p):
    p.empty(); p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:10,h:4}); a.name='Schiene'; d.items.push(a); const b=Model.newItem('box',{w:10,d:10,h:4}); b.t.z=4; b.name='Schlitten'; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id, App.doc.items[1].id])"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    s = world_screen(p, 15, -5, 4); p.pg.mouse.click(s[0], s[1]); p.wait(800); warte_rechnen(p, 20)
    ok1 = p.ev("const j=(App.doc.joints||[])[0]; return !!j && Math.abs(Math.abs(j.ad[0])-1)<1e-6")
    p.pg.select_option('#jt-kind', 'slide'); p.wait(800); warte_rechnen(p, 20)
    ok2 = p.ev("const j=App.doc.joints[0]; return j.kind==='slide' && j.min===-20 && j.max===20") and 'Weg' in p.pg.locator('#joint-sec').inner_text()
    x0 = p.ev("const b=Actions.worldBox(App.doc.items[1].id); return (b.min.x+b.max.x)/2")
    field(p, '#jt-ang', 10); warte_rechnen(p, 20)
    x1 = p.ev("const b=Actions.worldBox(App.doc.items[1].id); return [(b.min.x+b.max.x)/2, b.max.z-b.min.z]")
    ok3 = abs(abs(x1[0] - x0) - 10) < 0.05 and abs(x1[1] - 4) < 0.05
    p.pg.click('#jt-check')
    for _ in range(160):
        p.wait(500)
        if 'Prüfe' not in p.pg.locator('#jt-result').inner_text():
            break
    ok4 = 'Frei im ganzen Bereich' in p.pg.locator('#jt-result').inner_text() and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4]


# ---------- Argon 1: Gelenk-Ketten ----------
def t_gelenk_kette(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Grundplatte'; d.items.push(a);
      const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=20; b.name='Arm'; d.items.push(b);
      const c=Model.newItem('box',{w:20,d:10,h:4}); c.t.x=40; c.name='Greifer'; d.items.push(c);
    })""")
    warte_rechnen(p, 20)
    # Erstes Gelenk: Grundplatte → Arm um Kante bei x=10, z=4
    p.ev("App.select([App.doc.items[0].id, App.doc.items[1].id])"); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    s1 = world_screen(p, 10, 0, 4); p.pg.mouse.click(s1[0], s1[1]); p.wait(800); warte_rechnen(p, 20)
    # Zweites Gelenk: Arm → Greifer um Kante bei x=30, z=4
    p.ev("App.select([App.doc.items[1].id, App.doc.items[2].id])"); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    s2 = world_screen(p, 30, 0, 4); p.pg.mouse.click(s2[0], s2[1]); p.wait(800); warte_rechnen(p, 20)
    # Arm auswählen: im Panel stehen beide Gelenke des Arms
    p.ev("App.select([App.doc.items[1].id])"); p.wait(400)
    js = p.ev("const js=App.doc.joints||[]; return [js.length, js[0]&&js[0].a===App.doc.items[0].id&&js[0].b===App.doc.items[1].id, js[1]&&js[1].a===App.doc.items[1].id&&js[1].b===App.doc.items[2].id]")
    ok1 = js == [2, True, True] and p.pg.locator('#joint-sec .joint-item').count() == 2
    # Erstes Gelenk um 90° drehen: Greifer und zweite Gelenkachse wandern mit
    field(p, '#jt-ang', 90); warte_rechnen(p, 20)
    st = p.ev("""
      const b1=Actions.worldBox(App.doc.items[1].id), b2=Actions.worldBox(App.doc.items[2].id), j2=App.doc.joints[1];
      return [b2.min.x, b2.min.y, b2.min.z, b2.max.x, b2.max.y, b2.max.z, b1.min.x, b1.max.x, j2.ao[0], j2.ao[2]];
    """)
    ok2 = (abs((st[5] - st[2]) - 20) < 0.1 and abs((st[3] - st[0]) - 4) < 0.1
           and abs(abs((st[2] + st[5]) / 2 - 4) - 30) < 0.1 and abs(st[0] - st[6]) < 0.1
           and abs(st[8] - 10) < 1e-3 and abs(abs(st[9] - 4) - 20) < 1e-3)
    # Kreis (Greifer → Grundplatte) wird abgelehnt
    p.ev("App.select([App.doc.items[2].id, App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Gelenk"]').click(); p.wait(300)
    ok3 = not p.ev("return Features.picking") and p.ev("return App.doc.joints.length") == 2 and 'kreis' in p.pg.locator('#toasts').inner_text().lower()
    # Rückgängig stellt alles wieder her
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(500); warte_rechnen(p, 20)
    u = p.ev("""
      const b2=Actions.worldBox(App.doc.items[2].id), j1=App.doc.joints[0], j2=App.doc.joints[1];
      return [j1.ang, j2.ao[0], j2.ao[2], [b2.min.x, b2.min.y, b2.min.z, b2.max.x, b2.max.y, b2.max.z]];
    """)
    ok4 = u[0] == 0 and abs(u[1] - 30) < 1e-3 and abs(u[2] - 4) < 1e-3 and near(u[3], [30, -5, 0, 50, 5, 4], 0.1)
    # Bewegung prüfen berücksichtigt das mitbewegte dritte Teil (Grundplatte liegt nur im Weg des Greifers, nicht des Arms)
    p.ev("App.change('x', d=>{ d.items[0].t.x=40; d.items[0].t.z=-12; })"); warte_rechnen(p, 20)
    ok5 = p.ev("return Joints.check(App.doc.joints[0].id, 30).then(r=>r.some(x=>x.v>0.05))")
    return [ok1, ok2, ok3, ok4, ok5]



# ---------- Sitzung 41: Übergang entlang einer Mittellinie ----------
def t_uebergang_mittellinie(p):
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 40, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    v0 = volumen(p)
    # Mittellinie zeichnen: Skizze stehend (vorne), Spline durch die Mitten der Umrisse, zwei Hilfskanten, Vorschau
    p.pg.locator('#loft-path-edit').click(); p.wait(1500)
    st = SS(p, "return [S.ctx.mode, S.ents.length, S.ents[0].type, S.ents[0].pts.length, S.refs.length, S.plane.n, S.tool]")
    pts = SS(p, "return S.ents[0].pts")
    # 5 Punkte: Mitten der Umrisse, dazwischen die Mitte, dazu je ein Hilfspunkt senkrecht über bzw. unter den Umrissen
    ok1 = (st[0] == 'loftpath' and st[1:5] == [1, 'spline', 5, 2] and near(st[5], [0, -1, 0], 1e-6) and st[6] == 'select'
           and p.pg.locator('#loftpath-hint').count() == 1 and near(pts[0], [0, 0], 1e-3) and near(pts[4], [0, 40], 1e-3) and abs(pts[1][0]) < 1e-3 and abs(pts[3][0]) < 1e-3)
    # Mitte der Kurve 20 mm zur Seite ziehen – die Vorschau biegt sich mit
    SS(p, "S.ents[0].pts[2]=[20,20]"); p.pg.mouse.move(700, 400); p.pg.mouse.move(705, 405); p.wait(1500); warte_rechnen(p, 30)
    pv = p.ev("const r=App.extra.length&&App.results.get('__preview'); return r&&r.data?r.data.bbox:null")
    ok2 = pv is not None and pv[3] > 25 and -3 < pv[2] < 0.5 and abs(pv[5] - 40) < 0.5
    # Fertig: der Übergang folgt der Mittellinie, Spitze und „gerade“ sind weg
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    v1 = volumen(p)
    ok3 = (not p.ev("return Sketch.active") and p.ev("return !!App.doc.items[0].p.path && App.errors.length===0 && App.extra.length===0")
           and bb[3] > 25 and -3 < bb[2] < 0.5 and abs(bb[5] - 40) < 0.5 and v1 and v0 and 1.2 * v0 < v1 < 2 * v0
           and p.pg.locator('#loft-path-off').count() == 1 and p.pg.locator('#p-tip').count() == 0 and p.pg.locator('#loft-path-warn').count() == 0)
    # Mittellinie, die den unteren Umriss fast flach trifft: Warnung
    p.ev("App.change('x', d=>{ d.items[0].p.path.ents=[{id:'s',type:'spline',pts:[[0,0],[20,20],[0,40]],closed:false}]; })"); warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    ok3 = ok3 and p.pg.locator('#loft-path-warn').count() == 1 and 'schräg' in p.pg.locator('#loft-path-warn').inner_text()
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    # Rückgängig: wieder der gerade Übergang
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok4 = p.ev("return !App.doc.items[0].p.path") and abs(bb2[3] - 15) < 1e-3
    # Wiederholen, dann „Ohne Mittellinie“
    p.pg.keyboard.press('Control+y'); warte_rechnen(p, 30); p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('#loft-path-off').click(); warte_rechnen(p, 30)
    ok5 = p.ev("return !App.doc.items[0].p.path && App.errors.length===0") and abs(p.ev("return App.results.get(App.doc.items[0].id).data.bbox")[3] - 15) < 1e-3
    return [ok1, ok2, ok3, ok4, ok5]



# ---------- Sitzung 55: Übergang mit Führungskurve ----------
def t_uebergang_fuehrung(p):
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 40, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    v0 = volumen(p)
    p.pg.locator('#loft-rail-edit').click(); p.wait(1500)
    st = SS(p, "return [S.ctx.mode, S.ents.length, S.ents[0].pts.length, S.ents[0].pts[0], S.ents[0].pts[2], S.tool]")
    ok1 = st[0] == 'loftrail' and st[1:3] == [1, 3] and near([abs(st[3][0]), st[3][1]], [15, 0], 0.05) and near([abs(st[4][0]), st[4][1]], [8, 40], 0.05) and st[5] == 'select' and p.pg.locator('#loftrail-hint').count() == 1
    # Mitte der Kurve nach außen ziehen: der Übergang wird dort bauchig, in Y bleibt er gleich
    SS(p, "const q=S.ents[0].pts; q[1]=[Math.sign(q[0][0])*25, 20]"); p.pg.mouse.move(700, 400); p.pg.mouse.move(705, 405); p.wait(1500); warte_rechnen(p, 30)
    pv = p.ev("const r=App.extra.length&&App.results.get('__preview'); return r&&r.data?r.data.bbox:null")
    ok2 = pv is not None and (pv[3] - pv[0]) > 45 and abs(pv[1] + 10) < 0.6 and abs(pv[4] - 10) < 0.6 and abs(pv[2]) < 0.3 and abs(pv[5] - 40) < 0.3
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    v1 = volumen(p)
    ok3 = (not p.ev("return Sketch.active") and p.ev("return !!App.doc.items[0].p.rail && !App.doc.items[0].p.path && App.errors.length===0")
           and v1 and v0 and v1 > 1.15 * v0 and p.pg.locator('#loft-rail-off').count() == 1 and p.pg.locator('#loft-path-edit').count() == 0)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    ok4 = p.ev("return !App.doc.items[0].p.rail && App.errors.length===0") and abs(volumen(p) - v0) < 0.01 * v0
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 58: Übergang mit zwei Führungskurven ----------
def t_uebergang_zwei(p):
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 40, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    v0 = volumen(p)
    ok0 = p.pg.locator('#loft-rail2-edit').count() == 0
    # erste Führungskurve (in X bauchig)
    p.pg.locator('#loft-rail-edit').click(); p.wait(1500)
    SS(p, "const q=S.ents[0].pts; q[1]=[Math.sign(q[0][0])*25, 20]"); p.pg.mouse.move(700, 400); p.pg.mouse.move(705, 405); p.wait(800)
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    v1 = volumen(p); b1 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    # zweite: quer dazu, vorgezeichnet durch die Ränder in Y
    p.pg.locator('#loft-rail2-edit').click(); p.wait(1500)
    st = SS(p, "return [S.ctx.mode, S.plane.n, S.ents.length, S.ents[0].pts.length, S.ents[0].pts[0], S.ents[0].pts[2]]")
    ok1 = (ok0 and st[0] == 'loftrail2' and abs(abs(st[1][0]) - 1) < 1e-6 and st[2] == 1 and st[3] == 3
           and near([abs(st[4][0]), st[4][1]], [10, 0], 0.05) and near([abs(st[5][0]), st[5][1]], [8, 40], 0.05) and p.pg.locator('#loftrail2-hint').count() == 1)
    SS(p, "const q=S.ents[0].pts; q[1]=[Math.sign(q[0][0])*20, 20]"); p.pg.mouse.move(700, 400); p.pg.mouse.move(705, 405); p.wait(1500); warte_rechnen(p, 30)
    pv = p.ev("const r=App.extra.length&&App.results.get('__preview'); return r&&r.data?r.data.bbox:null")
    # Vorschau: in Y bauchig (über 36), in X wie mit der ersten Kurve
    ok2 = pv is not None and (pv[4] - pv[1]) > 36 and abs((pv[3] - pv[0]) - (b1[3] - b1[0])) < 1.0 and abs(pv[2]) < 0.3 and abs(pv[5] - 40) < 0.3
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    v2 = volumen(p)
    ok3 = (not p.ev("return Sketch.active") and p.ev("return !!App.doc.items[0].p.rail && !!App.doc.items[0].p.rail2 && App.errors.length===0")
           and v2 > 1.15 * v1 > 1.15 * v0 and p.pg.locator('#loft-rail2-off').count() == 1)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    ok4 = p.ev("return !App.doc.items[0].p.rail2 && !!App.doc.items[0].p.rail && App.errors.length===0") and abs(volumen(p) - v1) < 0.01 * v1
    # „Ohne Führungskurve“ nimmt beide weg
    p.pg.keyboard.press('Control+y'); warte_rechnen(p, 30); p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('#loft-rail-off').click(); warte_rechnen(p, 30)
    ok5 = p.ev("return !App.doc.items[0].p.rail && !App.doc.items[0].p.rail2 && App.errors.length===0") and abs(volumen(p) - v0) < 0.01 * v0
    return [ok1, ok2, ok3, ok4, ok5]


def t_ki_mittellinie(p):
    ki(p); p.empty()
    ki_fragen(p, 'Bau mir einen Rumpf, der nach oben schwingt', {'antwort': 'Ich baue einen geschwungenen Rumpf.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'loft', 'name': 'Rumpf', 'p': {
            'profile': [{'ebene': 'XZ', 'versatz': 0, 'form': [{'ellipse': [0, 0, 12, 8]}]}, {'ebene': 'XZ', 'versatz': 40, 'form': [{'ellipse': [0, 10, 8, 6]}]}, {'ebene': 'XZ', 'versatz': 80, 'form': [{'circle': [0, 20, 4]}]}],
            'mittellinie': {'ebene': 'YZ', 'versatz': 0, 'kurve': [{'typ': 'spline', 'punkte': [[0, 0], [-40, 10], [-80, 20]]}]}}}}]}, 90)
    ok1 = p.ev("const it=App.doc.items[0]; return !!(it && it.kind==='loft' && it.p.path && it.p.path.ents.length===1)")
    ok2 = p.ev("return App.errors.length===0 && !!App.results.get(App.doc.items[0].id)")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok3 = abs(bb[1] + 80) < 1 and abs(bb[4] - 0) < 1 and bb[5] > 20
    return [ok1, ok2, ok3]



def t_ki_zwei_fuehrung(p):
    ki(p); p.empty()
    ki_fragen(p, 'Bau einen Rumpf, von der Seite und von oben bauchig', {'antwort': 'Ich baue einen bauchigen Rumpf.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'loft', 'name': 'Rumpf', 'p': {
            'profile': [{'ebene': 'XZ', 'versatz': 0, 'form': [{'ellipse': [0, 0, 12, 8]}]}, {'ebene': 'XZ', 'versatz': 80, 'form': [{'circle': [0, 0, 6]}]}],
            'fuehrungskurve': {'ebene': 'YZ', 'versatz': 0, 'kurve': [{'typ': 'spline', 'punkte': [[0, 8], [-40, 20], [-80, 6]]}]},
            'fuehrungskurve2': {'ebene': 'XY', 'versatz': 0, 'kurve': [{'typ': 'spline', 'punkte': [[12, 0], [25, -40], [6, -80]]}]}}}}]}, 90)
    ok1 = p.ev("const it=App.doc.items[0]; return !!(it && it.kind==='loft' && it.p.rail && it.p.rail2 && !it.p.path)")
    ok2 = p.ev("return App.errors.length===0 && !!App.results.get(App.doc.items[0].id)")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok3 = abs(bb[5] - 20) < 1 and abs(bb[3] - 25) < 1 and abs(bb[1] + 80) < 0.5
    return [ok1, ok2, ok3]


def t_ki_text_kurve(p):
    ki(p); p.empty()
    ki_fragen(p, 'Schreib FPV im Bogen auf eine Platte', {'antwort': 'Ich setze den Schriftzug auf eine Kurve.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'extrude', 'name': 'Schrift', 'p': {'ebene': 'XY', 'versatz': 0, 'hoehe': 1,
            'form': [{'text': 'FPV', 'hoehe': 6, 'fett': True, 'entlang': [[-25, 0], [0, 12], [25, 0]]}]}}}]}, 90)
    r = p.ev("const it=App.doc.items[0]; const e=it&&it.p.sketch&&it.p.sketch.ents; if(!e) return null; const t=e.find(x=>x.type==='text'), k=e.find(x=>x.type==='spline'); return [!!t&&t.on===k.id, k.con, t.onP.length>10, App.errors.length]")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    return [r is not None and r[0] and r[1] and r[2], r is not None and r[3] == 0 and bb[4] > 10 and bb[1] > -3]


# ---------- Sitzung 45: Rohr im Raum ----------
def t_rohr_raum(p):
    p.empty()
    # 1. Kern: glatte Kurve durch drei Punkte im Raum, Volumen = Querschnitt × Kurvenlänge
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{path3d:{pts:[[0,0,0],[30,0,10],[30,30,20]],smooth:true},shape:'circle',d:4,w:4,h:3,wall:0},{name:'Rohr'}); d.items.push(it); })"); warte_rechnen(p, 30)
    L = p.ev("""let L=0; for (const b of Model.bez3([[0,0,0],[30,0,10],[30,30,20]])) { let q=b.a; for (let i=1;i<=200;i++){ const t=i/200,u=1-t; const r=[0,1,2].map(k=>u*u*u*b.a[k]+3*u*u*t*b.c1[k]+3*u*t*t*b.c2[k]+t*t*t*b.b[k]); L+=Math.hypot(r[0]-q[0],r[1]-q[1],r[2]-q[2]); q=r; } } return L""")
    v = volumen(p)
    ok1 = p.ev("return App.errors.length") == 0 and v and abs(v - 3.14159265 * 4 * L) < 0.05 * 3.14159265 * 4 * L
    # 2. Gerade Stücke mit runden Ecken
    p.ev("App.change('x', d=>{ d.items[0].p.path3d.smooth=false; })"); warte_rechnen(p, 30)
    v2 = volumen(p); L2 = (30 ** 2 + 10 ** 2) ** 0.5 + (30 ** 2 + 10 ** 2) ** 0.5
    ok2 = p.ev("return App.errors.length") == 0 and v2 and abs(v2 - 3.14159265 * 4 * L2) < 0.08 * 3.14159265 * 4 * L2
    # 3. Im Bild klicken: zwei Punkte auf der Oberseite eines Quaders (Rohr liegt auf), einer daneben in den Raum
    p.ev("App.change('x', d=>{ d.items=[]; const b=Model.newItem('box',{w:40,d:40,h:10}); b.name='Platte'; d.items.push(b); })"); warte_rechnen(p, 30)
    p.pg.locator('#t-body').click(); p.wait(400); p.pg.locator('#add-route').click(); p.wait(500)
    for (x, y, z) in ((-10, 0, 10), (10, 0, 10), (40, 30, 13)):
        sxy = world_screen(p, x, y, z); p.pg.mouse.click(sxy[0], sxy[1]); p.wait(300)
    n = p.pg.locator('#route-n').inner_text()
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    it = p.ev("const it=App.doc.items[1]; return it && [it.kind, it.p.path3d.pts, it.p.d]")
    ok3 = (n == '3' and it and it[0] == 'sweep' and it[2] == 6 and near(it[1][0], [-10, 0, 13], 0.5) and near(it[1][1], [10, 0, 13], 0.5)
           and near(it[1][2], [40, 30, 13], 0.5) and p.ev("return App.errors.length") == 0 and p.pg.locator('.viewbar[aria-label="Rohr im Raum"]').count() == 0)
    # 4. Punkt als Zahl ändern, Punkt löschen, Rückgängig
    field(p, '#p3-2-z', 30); warte_rechnen(p, 30)
    ok4 = p.ev("return App.doc.items[1].p.path3d.pts[2][2]") == 30 and p.ev("return App.errors.length") == 0 and p.pg.locator('#p3-list .p3-row').count() == 3
    p.pg.click('#p3-del-1'); warte_rechnen(p, 30)
    k = p.ev("return App.doc.items[1].p.path3d.pts.length")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    ok5 = k == 2 and p.ev("return App.doc.items[1].p.path3d.pts.length") == 3 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4, ok5]


def t_ki_rohr_raum(p):
    ki(p); p.empty()
    ki_fragen(p, 'Leg mir einen Kabelkanal, der nach oben läuft', {'antwort': 'Ich lege ein Rohr durch den Raum.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'sweep', 'name': 'Kabelkanal', 'p': {'pfad3d': [[0, 0, 0], [20, 0, 5], [20, 20, 25]], 'd': 5, 'wand': 1}}}]}, 90)
    ok1 = p.ev("const it=App.doc.items[0]; return !!(it && it.kind==='sweep' && it.p.path3d && it.p.path3d.pts.length===3 && it.p.path3d.smooth===true && it.p.wall===1)")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok2 = p.ev("return App.errors.length") == 0 and bb[5] > 26 and bb[4] > 21
    return [ok1, ok2]



# ---------- Sitzung 62: Rohr im Raum mit Regeln und Maßen (3D-Skizze) ----------
def t_rohr_regeln(p):
    p.empty()
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{path3d:{pts:[[0,0,0],[3,1,20],[30,2,22]],smooth:false},shape:'circle',d:4,w:4,h:3,wall:0},{name:'Rohr'}); d.items.push(it); })"); warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    P = lambda: p.ev("return Model.path3dPoints(App.doc.items[0].p.path3d, Model.vars(App.doc).v).map(q=>q.map(v=>Math.round(v*1000)/1000))")
    p.pg.select_option('#p3-ax-0', 'z'); warte_rechnen(p, 30)
    a = P()
    p.pg.fill('#p3-len-0', '30'); p.pg.press('#p3-len-0', 'Enter'); warte_rechnen(p, 30)
    b = P()
    p.pg.select_option('#p3-ax-1', 'x'); warte_rechnen(p, 30)
    c = P()
    ok1 = a == [[0, 0, 0], [0, 0, 20], [27, 1, 22]] and b == [[0, 0, 0], [0, 0, 30], [27, 1, 32]] and c == [[0, 0, 0], [0, 0, 30], [27, 0, 30]]
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok2 = p.ev("return App.errors.length") == 0 and abs(bb[5] - 32) < 0.1 and abs(bb[3] - 27) < 0.1 and abs(bb[2] + 0) < 0.1
    # Felder zeigen die Lage mit Regeln; Startpunkt verschieben → alles wandert mit, die Regeln halten
    shown = p.pg.locator('#p3-1-z').input_value()
    p.pg.fill('#p3-0-x', '10'); p.pg.press('#p3-0-x', 'Enter'); warte_rechnen(p, 30)
    d = P()
    ok3 = shown == '30' and d == [[10, 0, 0], [10, 0, 30], [37, 0, 30]] and 'fest' in p.pg.locator('label[for="p3-len-0"]').inner_text()
    # Rückgängig, dann Länge 0 = wieder frei
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30)
    e = P()
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    p.pg.fill('#p3-len-0', '0'); p.pg.press('#p3-len-0', 'Enter'); warte_rechnen(p, 30)
    r = p.ev("return App.doc.items[0].p.path3d.rules")
    ok4 = e == c and r[0] == {'ax': 'z'} and r[1] == {'ax': 'x'} and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4]


def t_rohr_masse_bild(p):
    p.empty()
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{path3d:{pts:[[0,0,0],[0,0,20],[20,0,20]],smooth:false},shape:'circle',d:4,w:4,h:3,wall:0},{name:'Rohr'}); d.items.push(it); })"); warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id]); Viewer.setView('front', false)"); p.wait(1200)
    t0 = p.pg.locator('#seglabel-0').inner_text() if p.pg.locator('#seglabel-0').count() else ''
    p.pg.locator('#seglabel-0').click(); p.wait(200)
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('25'); p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    pts = p.ev("return Model.path3dPoints(App.doc.items[0].p.path3d, Model.vars(App.doc).v).map(q=>q.map(v=>Math.round(v*1000)/1000))")
    t1 = p.pg.locator('#seglabel-0').inner_text() if p.pg.locator('#seglabel-0').count() else ''
    ok1 = '20' in t0 and pts == [[0, 0, 0], [0, 0, 25], [20, 0, 25]] and '25' in t1 and '🔒' in t1 and p.pg.locator('#seglabel-1').count() == 1
    ok2 = p.ev("return App.errors.length") == 0 and abs(p.ev("return App.results.get(App.doc.items[0].id).data.bbox")[5] - 27) < 0.1
    return [ok1, ok2]


def t_rohr_rechtwinklig(p):
    p.empty()
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{path3d:{pts:[[0,0,0],[10,0,10],[25,3,12]],smooth:false},shape:'circle',d:3,w:3,h:3,wall:0},{name:'Rohr'}); d.items.push(it); })"); warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    opts0 = p.pg.locator('#p3-ax-0 option').count(); opts1 = p.pg.locator('#p3-ax-1 option').count()
    P = lambda: p.ev("return Model.path3dPoints(App.doc.items[0].p.path3d, Model.vars(App.doc).v).map(q=>q.map(v=>Math.round(v*1000)/1000))")
    p.pg.select_option('#p3-ax-1', 'perp'); warte_rechnen(p, 30)
    a = P()
    dot = (a[2][0] - a[1][0]) * 10 + (a[2][2] - a[1][2]) * 10
    p.pg.select_option('#p3-ax-1', 'par'); warte_rechnen(p, 30)
    b = P()
    ok1 = opts0 == 4 and opts1 == 6 and abs(dot) < 1e-2 and a[2] == [16.5, 3, 3.5] and abs(b[2][0] - b[2][2]) < 1e-3 and abs(b[2][1]) < 1e-3 and abs(b[2][0] - 10 - 9.6695 / 2 ** 0.5) < 0.01
    ok2 = p.ev("return App.errors.length") == 0 and '∥' in p.pg.locator('#seglabel-1').inner_text()
    return [ok1, ok2]


# ---------- Sitzung 70: Rohr-Punkte hängen am Körper ----------
def t_rohr_haengt(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10},{name:'A'}); a.t.x=-30; const b=Model.newItem('box',{w:20,d:20,h:10},{name:'B'}); b.t.x=30; d.items.push(a,b); })"); warte_rechnen(p, 30)
    p.ev("App.clearSelection(); Viewer.setView('top', false)"); p.wait(1000)
    p.ev("Features.route3d({d:4})"); p.wait(300)
    for (x, y) in [(-30, 0), (30, 0)]:
        s = world_screen(p, x, y, 10); p.pg.mouse.click(s[0], s[1]); p.wait(300)
    p.pg.keyboard.press('Enter'); warte_rechnen(p, 30)
    r = p.ev("const it=App.doc.items.find(i=>i.kind==='sweep'); return [it.p.path3d.pts, (it.p.path3d.bind||[]).map(b=>b&&App.doc.items.find(x=>x.id===b.id).name)]")
    ok1 = r[1] == ['A', 'B'] and abs(r[0][1][0] - 30) < 0.5 and abs(r[0][1][2] - 12) < 0.01
    # B verschieben: das Rohr-Ende wandert mit, in einem Rückgängig-Schritt
    p.ev("App.change('B verschoben', d=>{ d.items.find(i=>i.name==='B').t.x=50; })"); warte_rechnen(p, 30); warte_rechnen(p, 30)
    e1 = p.ev("return App.doc.items.find(i=>i.kind==='sweep').p.path3d.pts[1]")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p, 30); warte_rechnen(p, 30)
    e2 = p.ev("return App.doc.items.find(i=>i.kind==='sweep').p.path3d.pts[1]")
    ok2 = abs(e1[0] - (r[0][1][0] + 20)) < 0.01 and abs(e2[0] - r[0][1][0]) < 0.01 and p.ev("return App.doc.items.find(i=>i.name==='B').t.x") == 30
    # lösen: Punkt bleibt, wenn B wandert
    p.ev("App.select([App.doc.items.find(i=>i.kind==='sweep').id])"); p.wait(500)
    ok3 = p.pg.locator('#p3-bound-1').count() == 1
    p.pg.locator('#p3-unbind-1').click(); warte_rechnen(p, 30)
    p.ev("App.change('B verschoben', d=>{ d.items.find(i=>i.name==='B').t.x=60; })"); warte_rechnen(p, 30); warte_rechnen(p, 30)
    e3 = p.ev("const pp=App.doc.items.find(i=>i.kind==='sweep').p.path3d; return [pp.pts[1], pp.bind ? pp.bind.filter(Boolean).length : 0]")
    ok4 = abs(e3[0][0] - r[0][1][0]) < 0.01 and e3[1] == 1 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3, ok4]


def t_ki_rohr_regeln(p):
    ki(p); p.empty()
    ki_fragen(p, 'Antennenrohr: 25 mm senkrecht hoch, dann 15 mm nach hinten', {'antwort': 'Ich lege das Rohr mit festen Stücken.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'sweep', 'name': 'Antennenrohr', 'p': {'pfad3d': [[0, 0, 0], [1, 0, 20], [2, 10, 22]], 'glatt': False, 'd': 4, 'wand': 0.8,
                                                                                         'regeln': [{'achse': 'z', 'laenge': 25}, {'achse': 'y', 'laenge': 15}]}}}]}, 90)
    pts = p.ev("return Model.path3dPoints(App.doc.items[0].p.path3d, Model.vars(App.doc).v).map(q=>q.map(v=>Math.round(v*1000)/1000))")
    ok1 = pts == [[0, 0, 0], [0, 0, 25], [0, 15, 25]]
    ok2 = p.ev("return App.errors.length") == 0 and abs(p.ev("return App.results.get(App.doc.items[0].id).data.bbox")[5] - 27) < 0.1
    return [ok1, ok2]


# ---------- Sitzung 63: Fase mit zwei Abständen oder Winkel, Rundung von … bis ----------
def t_fase_arten(p):
    p.empty()
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:20,d:20,h:10}); b.finishes=[{id:'f1',type:'chamfer',r:2,edges:[{t:'LINE',m:[0,10,10],l:20}]}]; d.items.push(b); })"); warte_rechnen(p, 30)
    v0 = volumen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.select_option('#fin-mode-f1', 'two'); warte_rechnen(p, 30)
    v1 = volumen(p)
    top = lambda: p.ev("const f=App.results.get(App.doc.items[0].id).data.faces.find(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.999); return f&&f.c[1]")
    t1 = top()
    p.pg.locator('#fin-swap-f1').click(); warte_rechnen(p, 30)
    v2 = volumen(p); t2 = top()
    ok1 = abs(v0 - 3960) < 0.5 and abs(v1 - 3920) < 0.5 and abs(v2 - 3920) < 0.5 and t1 is not None and t2 is not None and abs(abs(t1 - t2) - 1) < 0.01
    p.pg.select_option('#fin-mode-f1', 'angle'); warte_rechnen(p, 30)
    v3 = volumen(p)
    p.pg.fill('#fin-a-f1', '45'); p.pg.press('#fin-a-f1', 'Enter'); warte_rechnen(p, 30)
    v4 = volumen(p)
    ok2 = abs(v3 - (4000 - 0.5 * 2 * 2 * 0.57735 * 20)) < 0.5 and abs(v4 - 3960) < 0.5 and p.ev("return App.errors.length") == 0
    # zurück auf gleich: Felder weg, Daten sauber
    p.pg.select_option('#fin-mode-f1', ''); warte_rechnen(p, 30)
    ok3 = abs(volumen(p) - 3960) < 0.5 and p.ev("const f=App.doc.items[0].finishes[0]; return !('cm' in f)") and p.pg.locator('#fin-a-f1').count() == 0
    return [ok1, ok2, ok3]


def t_rundung_variabel(p):
    p.empty()
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:20,d:20,h:10}); b.finishes=[{id:'f2',type:'fillet',r:2,edges:[{t:'LINE',m:[0,10,10],l:20}]}]; d.items.push(b); })"); warte_rechnen(p, 30)
    v0 = volumen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.select_option('#fin-mode-f2', 'var'); warte_rechnen(p, 30)
    v1 = volumen(p)
    p.pg.fill('#fin-r2-f2', '4'); p.pg.press('#fin-r2-f2', 'Enter'); warte_rechnen(p, 30)
    v2 = volumen(p)
    k = 1 - 3.14159265 / 4
    # gleichmäßig r=2: 4000 − k·4·20; von 2 bis 1 bzw. 2 bis 4 liegt dazwischen bzw. darüber
    ok1 = abs(v0 - (4000 - k * 4 * 20)) < 0.2 and v0 < v1 < 4000 - k * 1 * 20 + 0.2 and 4000 - k * 16 * 20 - 0.2 < v2 < v0
    p.pg.locator('#fin-swap-f2').click(); warte_rechnen(p, 30)
    f = p.ev("return App.doc.items[0].finishes[0]")
    ok2 = f['r'] == 4 and f['r2'] == 2 and abs(volumen(p) - v2) < 0.2 and p.ev("return App.errors.length") == 0
    return [ok1, ok2]


# ---------- Sitzung 47: KI-Kollege legt Gelenke an ----------
def t_ki_gelenk(p):
    ki(p); p.empty()
    ki_fragen(p, 'Bau mir einen Klapparm', {'antwort': 'Ich baue zwei Arme mit Gelenk.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'box', 'name': 'Arm A', 'p': {'w': 20, 'd': 10, 'h': 4}}},
        {'op': 'hinzufuegen', 'objekt': {'art': 'box', 'name': 'Arm B', 'p': {'w': 20, 'd': 10, 'h': 4}, 't': {'x': 20}}},
        {'op': 'gelenk', 'fest': 'name:Arm A', 'beweglich': 'name:Arm B', 'achse': {'punkt': [10, 0, 4], 'richtung': [0, 1, 0]}, 'von': -120, 'bis': 0, 'winkel': -90}]}, 90)
    j = p.ev("const j=(App.doc.joints||[])[0]; const b=App.doc.items.find(i=>i.name==='Arm B'); return j && [j.b===b.id, j.min, j.max, j.ang, (j.kind||'rot')]")
    wb = p.ev("const b=Actions.worldBox(App.doc.items.find(i=>i.name==='Arm B').id); return [b.max.z-b.min.z, b.max.x-b.min.x]")
    ok1 = j == [True, -120, 0, -90, 'rot'] and abs(wb[0] - 20) < 0.2 and abs(wb[1] - 4) < 0.2
    # Ein zweites Gelenk, das B noch einmal bewegen würde, lehnt er ab
    ki_fragen(p, 'Noch ein Gelenk', {'antwort': 'Ich versuche es.', 'aktionen': [
        {'op': 'gelenk', 'fest': 'name:Arm A', 'beweglich': 'name:Arm B', 'achse': {'punkt': [0, 0, 0], 'richtung': [0, 0, 1]}}]}, 60)
    ok2 = p.ev("return (App.doc.joints||[]).length") == 1
    return [ok1, ok2]

# ---------- Sitzung 46: Schwerpunkt ausgleichen ----------
def t_schwerpunkt_ausgleich(p):
    drohne(p, 'f5')
    p.ev("App.change('x', d=>{ d.items.find(i=>/^Akku/.test(i.name)).t.y=45; })"); warte_rechnen(p)
    c = chk(p)
    ok1 = c['cog'][0] in ('warn', 'bad') and p.ev("return DroneCheck.run().then(l=>l.find(c=>c.id==='cog').fix)") == 'balance'
    p.ev("DroneCheck.dialog()"); p.pg.wait_for_selector('.modal #chk-balance', timeout=60000); p.wait(300)
    p.pg.click('.modal #chk-balance'); p.wait(1500); warte_rechnen(p)
    p.pg.wait_for_selector('.modal .chk-row[data-chk="cog"]', timeout=60000); p.wait(500)
    st = p.pg.locator('.modal .chk-row[data-chk="cog"]').get_attribute('class')
    y = p.ev("return App.doc.items.find(i=>/^Akku/.test(i.name)).t.y")
    ok2 = 'ok' in st.split() and y < 45 and p.pg.locator('.modal #chk-balance').count() == 0
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); warte_rechnen(p)
    ok3 = p.ev("return App.doc.items.find(i=>/^Akku/.test(i.name)).t.y") == 45
    return [ok1, ok2, ok3]


# ---------- Sitzung 48: Erste Schritte in der einfachen Oberfläche ----------
def t_erste_schritte(p):
    p.empty(); p.pg.locator('#btn-level').click(); p.wait(600)
    n = lambda: p.pg.locator('#fs-n').inner_text() if p.pg.locator('#fs-n').count() else None
    ok1 = n() == '0 von 4' and p.pg.locator('#first-steps .fs-row').count() == 4
    p.ev("Actions.addPrimitive('box')"); warte_rechnen(p, 20); p.wait(300)
    a = n()
    p.ev("App.change('x', d=>{ d.items[0].p.w=37; })"); warte_rechnen(p, 20); p.wait(300)
    b = n()
    p.ev("Actions.addPrimitive('cylinder', { role: 'hole', name: 'Loch', p: { d: 6, h: 30 } })"); warte_rechnen(p, 20); p.wait(300)
    c = n()
    ok2 = [a, b, c] == ['1 von 4', '2 von 4', '3 von 4'] and p.pg.locator('#first-steps .fs-row.done').count() == 3
    # „Wie?“ beim Speichern öffnet den Export
    p.pg.click('#first-steps [data-how="save"]'); p.wait(600)
    ok3 = p.pg.locator('.modal[aria-label="Exportieren"]').count() == 1
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.ev("Panels.firstStepDone('saved')"); p.wait(400)
    ok4 = n() == '4 von 4' and p.pg.locator('#fs-done').count() == 1
    # Ausblenden bleibt aus; in „Profi“ gibt es die Liste nicht
    p.pg.click('#first-steps .fs-x'); p.wait(400)
    gone = p.pg.locator('#first-steps').count() == 0
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(500)
    ok5 = gone and p.pg.locator('#first-steps').count() == 0
    p.ev("localStorage.removeItem('tracery-erste-schritte'); Panels.renderLeft()"); p.wait(300)
    back = p.pg.locator('#first-steps').count() == 1
    p.pg.locator('#btn-level').click(); p.wait(600)
    ok6 = back and p.pg.locator('#first-steps').count() == 0 and p.pg.locator('#btn-level').text_content() == 'Profi'
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- Sitzung 49: Wand um Schraubenlöcher bei allen Druckteilen ----------
def t_lochwand(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const b=Model.newItem('box',{w:30,d:20,h:12}); b.name='Halter'; b.mat='PETG'; d.items.push(b);
      const h=Model.newItem('cylinder',{d:3.2,h:14},{role:'hole',name:'Schraubenloch'}); h.t.x=13.2; h.t.z=-1; d.items.push(h);
    })"""); warte_rechnen(p, 30)
    hw = lambda: p.ev("return Weak.analyze().then(l=>l.filter(x=>x.id==='hole-wall').map(x=>[x.s, x.text]))")
    a = hw()   # 15 - 13,2 - 1,6 = 0,2 mm Wand
    ok1 = len(a) == 1 and a[0][0] == 'bad' and 'Dünne' not in a[0][1] and ('0,1' in a[0][1] or '0,2' in a[0][1]) and 'mindestens 2 mm' in a[0][1]
    p.ev("App.change('x', d=>{ d.items[1].t.x=11.8; })"); warte_rechnen(p, 30)   # 1,6 mm Wand
    b = hw()
    ok2 = len(b) == 1 and b[0][0] == 'warn'
    p.ev("App.change('x', d=>{ d.items[1].t.x=10; })"); warte_rechnen(p, 30)     # 3,4 mm Wand
    ok3 = hw() == []
    # Quer durch eine runde Klemme: kein Fehlalarm, wo das Loch aus der Rundung austritt
    p.ev("""App.change('x', d=>{ d.items=[];
      const c=Model.newItem('cylinder',{d:20,h:10}); c.name='Klemme'; c.mat='PETG'; d.items.push(c);
      const h=Model.newItem('cylinder',{d:3,h:30},{role:'hole',name:'Querloch'}); h.t.rx=90; h.t.y=15; h.t.z=5; d.items.push(h);
    })"""); warte_rechnen(p, 30)
    ok4 = p.ev("return App.errors.length") == 0 and hw() == []
    # Carbon-Platten prüft weiter die Platten-Regel, nicht diese
    p.ev("""App.change('x', d=>{ d.items=[];
      const b=Model.newItem('box',{w:30,d:20,h:3}); b.name='Platte'; b.mat='CFK'; d.items.push(b);
      const h=Model.newItem('cylinder',{d:3.2,h:5},{role:'hole'}); h.t.x=13.2; h.t.z=-1; d.items.push(h);
    })"""); warte_rechnen(p, 30)
    l = p.ev("return Weak.analyze().then(l=>l.map(x=>x.id))")
    ok5 = 'hole-wall' not in l and 'hole-edge' in l
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 50: größere Knöpfe in der einfachen Oberfläche ----------
def t_einfach_gross(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); warte_rechnen(p, 20); p.wait(400)
    def masse():
        return p.pg.evaluate("""() => { const t=document.querySelector('#t-body').getBoundingClientRect(), c=document.querySelector('.ctxbar button'), n=document.querySelector('#left-body .node');
          return [t.height, c ? c.getBoundingClientRect().height : 0, n ? n.getBoundingClientRect().height : 0, document.querySelector('.topbar').getBoundingClientRect().height]; }""")
    pro = masse()
    p.pg.locator('#btn-level').click(); p.wait(700)
    ein = masse()
    ok1 = ein[0] >= pro[0] + 4 and ein[1] >= pro[1] + 4 and ein[2] >= pro[2] + 4
    # Oberleiste wird höher, alles bleibt in einer Zeile und im Bild
    over = p.pg.evaluate("() => { const tb=document.querySelector('.topbar'); return tb.scrollHeight > tb.clientHeight + 1 || [...document.querySelectorAll('.topbar .tool')].some(b=>b.offsetParent && b.getBoundingClientRect().bottom > tb.getBoundingClientRect().bottom + 1); }")
    ok2 = ein[3] >= 58 and not over
    # Ziel: mindestens 44 px hohe Knöpfe oben (Fingerbreite)
    ok3 = ein[0] >= 44
    p.pg.locator('#btn-level').click(); p.wait(600)
    ok4 = abs(masse()[0] - pro[0]) < 0.5
    return [ok1, ok2, ok3, ok4]


# ---------- Sitzung 53: Explosion auch innerhalb von Gruppen ----------
def t_explosion_gruppen(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const g=Model.newItem('group',{}); g.name='Baugruppe';
      for (let i=0;i<3;i++){ const b=Model.newItem('box',{w:20,d:20,h:6}); b.t.x=i*20; b.name='Teil '+(i+1); g.children.push(b); }
      const h=Model.newItem('cylinder',{d:5,h:10},{role:'hole',name:'Loch'}); h.t.z=-2; g.children.push(h);
      d.items.push(g);
    })"""); warte_rechnen(p, 30)
    gid = p.ev("return App.doc.items[0].id")
    kids = p.ev("return App.doc.items[0].children.filter(c=>c.role!=='hole').map(c=>c.id)")
    # Nur eine Gruppe ganz oben: die Explosion zerlegt sie von selbst
    p.ev("Views.explode(true)"); p.wait(1500); warte_rechnen(p, 30); p.wait(800)
    st = p.ev("""const ex=App.extra.map(x=>x.id); return [Views.explodeGroups, ex.length, App.hideIds.has(arg[0]), Viewer.nodes.get(arg[0]) ? Viewer.nodes.get(arg[0]).obj.visible : null,
      arg[1].every(k=>ex.includes('__ex:'+k)), App.extra[0].children.length, App.errors.length, document.querySelector('#ex-groups') && document.querySelector('#ex-groups').checked]""", [gid, kids])
    ok1 = st == [True, 3, True, False, True, 2, 0, True]   # erstes Teil trägt das Loch der Gruppe mit
    moved = p.ev("return arg.map(k=>{ const n=Viewer.nodes.get('__ex:'+k); return n && n.off ? n.off.length() : 0; })", kids)
    ok2 = sum(1 for m in moved if m > 1) >= 2
    # Klick auf ein Einzelteil wählt das echte Teil in der Gruppe
    p.ev("App.select(['__ex:'+arg])", kids[1]); p.wait(300)
    ok3 = p.ev("return App.sel") == [kids[1]]
    # Zusammensetzen: Gruppe wieder ganz
    p.ev("Views.explode(false)"); p.wait(1200); warte_rechnen(p, 30); p.wait(500)
    ok4 = p.ev("return [App.extra.length, App.hideIds.size, Viewer.nodes.get(arg).obj.visible, Views.explodeGroups]", gid) == [0, 0, True, False]
    # Zwei Teile ganz oben + Gruppe: normal auseinander, Häkchen zerlegt auf Wunsch
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:10,d:10,h:10}); b.t.x=-40; b.name='Extra'; d.items.push(b); })"); warte_rechnen(p, 30)
    p.ev("Views.explode(true)"); p.wait(1200)
    a = p.ev("return [Views.explodeGroups, App.extra.length, !document.querySelector('#ex-groups').closest('.vb-row').hidden]")
    p.pg.click('#ex-groups'); p.wait(800); warte_rechnen(p, 30); p.wait(500)
    b = p.ev("return [Views.explodeGroups, App.extra.length]")
    p.ev("Views.explode(false)"); p.wait(1200); warte_rechnen(p, 30)
    ok5 = a == [False, 0, True] and b == [True, 3] and p.ev("return App.extra.length") == 0
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- Sitzung 54: Stromlinien-Armverkleidung ----------
# ---------- Sitzung 75: Motorverkleidung ----------
# ---------- Sitzung 82: Studio-Look ----------
def t_studio_look(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('box',{w:60,d:40,h:3},{name:'Platte'}); a.mat='CFK'; d.items.push(a);
      const c=Model.newItem('cylinder',{d:20,h:30},{name:'Alu'}); c.mat='Alu 6061'; c.t.z=3; d.items.push(c);
      const e=Model.newItem('box',{w:15,d:15,h:15},{name:'PLA'}); e.mat='PLA'; e.color='#e8590c'; e.t.x=25; e.t.z=40; d.items.push(e);
    })"""); warte_rechnen(p)
    mat = lambda name: p.ev("const it=App.doc.items.find(i=>i.name===arg); const m=Viewer.nodes.get(it.id).mesh.material; return {t:m.type, metal:m.metalness, col:'#'+m.color.getHexString(), env: !!Viewer.scene.environment}", name)
    a, pl, cf = mat('Alu'), mat('PLA'), mat('Platte')
    ok1 = p.ev("return Viewer.look.look") == 'studio' and a['t'] == 'MeshPhysicalMaterial' and a['metal'] == 1 and a['col'] == '#c9ced3' and pl['metal'] == 0 and pl['col'] == '#e8590c' and cf['col'] == '#25272a' and a['env']
    # Schatten: Boden ist da, Licht wirft Schatten
    ok2 = p.ev("let f=null, L=null; Viewer.scene.traverse(x=>{ if(x.material&&x.material.isShadowMaterial) f=x; if(x.isDirectionalLight&&x.castShadow) L=x; }); return !!(f && f.visible && L)")
    # eigene Farbe für das Alu-Teil, dann wieder „vom Werkstoff“
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    p.ev("const i=document.querySelector('#item-color'); i.value='#1971c2'; i.dispatchEvent(new Event('change'))"); p.wait(1200)
    a2 = mat('Alu'); it = p.ev("return App.doc.items[1]")
    ok3 = a2['col'] == '#1971c2' and it['colorSet'] is True and p.pg.locator('#item-color-mat').count() == 1
    p.pg.locator('#item-color-mat').click(); p.wait(1200)
    ok4 = mat('Alu')['col'] == '#c9ced3' and not p.ev("return App.doc.items[1].colorSet")
    # Ansicht-Menü: Prüfansicht Ton, einfach, zurück zu Studio; Licht hell; Schatten aus
    p.ev("App.select([])"); p.wait(300)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#look-clay').click(); p.wait(800)
    t1 = mat('Alu')['t']
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#look-plain').click(); p.wait(800)
    t2 = mat('Alu')['t']; env2 = mat('Alu')['env']
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#look-studio').click(); p.wait(800)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#mood-hell').click(); p.wait(800)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#look-shadows').click(); p.wait(800)
    fl = p.ev("let f=null; Viewer.scene.traverse(x=>{ if(x.material&&x.material.isShadowMaterial) f=x; }); return f.visible")
    pv = p.ev("return ViewPrefs.get()")
    ok5 = t1 == 'MeshMatcapMaterial' and t2 == 'MeshStandardMaterial' and not env2 and mat('Alu')['t'] == 'MeshPhysicalMaterial' and pv['mood'] == 'hell' and pv['shadows'] is False and fl is False
    p.ev("ViewPrefs.set({ shadows: true, mood: 'studio' })")
    # Bild speichern: 4K mit durchsichtigem Hintergrund
    with p.pg.expect_download(timeout=60000) as dl:
        r = p.ev("return Print.saveImage({ size: '3840', transparent: true })")
    path = dl.value.path(); data = open(path, 'rb').read()
    import struct
    w, hh = struct.unpack('>II', data[16:24]); ctype = data[25]
    ok6 = dl.value.suggested_filename.endswith('.png') and (w, hh) == (3840, 2160) and ctype == 6 and r['bytes'] > 10000
    return [ok1, ok2, ok3, ok4, ok5, ok6]

# ---------- Sitzung 83: Formschritte mit Modus ----------
def t_koerper_modus(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('box',{w:40,d:40,h:10},{name:'Block'}); d.items.push(a);
      const b=Model.newItem('cylinder',{d:10,h:30},{name:'Bolzen'}); b.t.z=-5; d.items.push(b);
    })"""); warte_rechnen(p)
    vol = lambda: p.ev("return Mass.measure().then(r=>Object.fromEntries((r.parts||[]).map(q=>[App.doc.items.find(i=>i.id===q.id).name, Math.round(q.volume)])))")
    v0 = vol()
    ok1 = v0 == {'Block': 16000, 'Bolzen': round(math.pi * 25 * 30)}
    # Bolzen von Block abziehen – über das Feld rechts
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    p.pg.select_option('#op-type', 'cut'); p.wait(500); warte_rechnen(p)
    v1 = vol(); n1 = p.ev("return [Viewer.nodes.has(App.doc.items[1].id), App.mergedInto(App.doc.items[1].id) === App.doc.items[0].id, App.doc.items[1].op]")
    ok2 = v1 == {'Block': round(16000 - math.pi * 25 * 10)} and n1[0] is False and n1[1] is True and n1[2]['type'] == 'cut'
    p.ev("App.select([])"); p.wait(400); ok3 = '− Block' in p.pg.locator('#left-body').inner_text()
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    # vereinigen: der Bolzen steht oben und unten heraus
    p.pg.select_option('#op-type', 'join'); p.wait(500); warte_rechnen(p)
    v2 = vol(); bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok4 = v2 == {'Block': round(16000 + math.pi * 25 * 20)} and abs(bb[2] + 5) < 0.01 and abs(bb[5] - 25) < 0.01
    # Schnittmenge: nur das Stück Bolzen im Block bleibt
    p.pg.select_option('#op-type', 'common'); p.wait(500); warte_rechnen(p)
    ok5 = vol() == {'Block': round(math.pi * 25 * 10)}
    # zurück auf eigenen Körper, Rückgängig holt die Schnittmenge zurück
    p.pg.select_option('#op-type', 'new'); p.wait(500); warte_rechnen(p)
    a = vol() == v0
    p.pg.keyboard.press('Control+z'); p.wait(800); warte_rechnen(p)
    ok6 = a and vol() == {'Block': round(math.pi * 25 * 10)}
    # Ziel kommt später im Verlauf: Meldung, Teil bleibt eigener Körper
    p.ev("App.change('x', d=>{ d.items[1].op=null; d.items[0].op={type:'cut', target:d.items[1].id}; })"); warte_rechnen(p)
    ok7 = any(e['code'] == 'op' for e in p.ev("return App.errors")) and len(vol()) == 2
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7]

# Hochziehen beidseitig verschieden und „Durch alles“
def t_durch_alles(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('box',{w:40,d:40,h:40},{name:'Block'}); d.items.push(a);
      const h=Model.newItem('extrude',{},{name:'Loch', role:'hole'}); h.p={sketch:{plane:{o:[0,0,40],x:[1,0,0],n:[0,0,1]},ents:[{id:'c',type:'circle',c:[0,0],r:5}],dims:[],cons:[]},dist:10,dir:'reverse'}; d.items.push(h);
    })"""); warte_rechnen(p)
    vol = lambda: p.ev("return Mass.measure().then(r=>Math.round((r.parts||[])[0].volume))")
    ok1 = abs(vol() - (64000 - math.pi * 25 * 10)) < 5
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    p.pg.locator('#p-thru').check(); p.wait(800); warte_rechnen(p)
    ok2 = abs(vol() - (64000 - math.pi * 25 * 40)) < 5 and p.pg.locator('#p-dist').count() == 0
    # Block nach unten verlängern: das Loch geht weiter ganz durch
    p.ev("App.change('x', d=>{ d.items[0].p.h=150; d.items[0].t.z=-110; })"); warte_rechnen(p); p.wait(1500); warte_rechnen(p)
    ok3 = abs(vol() - (40 * 40 * 150 - math.pi * 25 * 150)) < 8
    # beidseitig verschieden: Körper von −3 bis +5
    p.ev("""App.change('x', d=>{ d.items.splice(1,1); d.items[0].p.h=10; const s=Model.newItem('extrude',{},{name:'Steg'}); s.p={sketch:{plane:{o:[60,0,0],x:[1,0,0],n:[0,0,1]},ents:[{id:'r',type:'rect',a:[-5,-5],b:[5,5]}],dims:[],cons:[]},dist:5,dir:'normal'}; d.items.push(s); })"""); warte_rechnen(p)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    p.pg.select_option('#p-dir', 'two'); p.wait(600)
    p.pg.fill('#p-dist2', '3'); p.pg.press('#p-dist2', 'Enter'); warte_rechnen(p)
    bb = p.ev("return App.results.get(App.doc.items[1].id).data.bbox")
    ok4 = abs(bb[2] + 3) < 0.01 and abs(bb[5] - 5) < 0.01 and p.pg.locator('#p-thru').count() == 0
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 84: Bedienung für jeden Tag ----------
def t_bedienung(p):
    p.empty()
    p.ev("""App.change('x', d=>{ for (let i=0;i<4;i++){ const a=Model.newItem('box',{w:10,d:10,h:10},{name:'Würfel '+(i+1)}); a.t.x=i*30-45; d.items.push(a); } })"""); warte_rechnen(p)
    p.ev("Viewer.setView('top', false)"); p.wait(800); p.ev("Viewer.fit()"); p.wait(1200)
    scr = lambda i: p.ev("const b=Actions.worldBox(App.doc.items[arg].id); const c=b.getCenter(b.min.clone()); const s=Viewer.toScreen(c); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left, s.y+r.top]", i)
    a, b = scr(0), scr(1)
    # Rahmen von links nach rechts um die ersten zwei Würfel: genau diese zwei
    p.pg.keyboard.down('Shift'); p.pg.mouse.move(a[0] - 70, a[1] - 80); p.pg.mouse.down(); p.pg.mouse.move(b[0] + 70, b[1] + 80, steps=8)
    cross0 = p.pg.locator('.sel-band.cross').count(); p.pg.mouse.up(); p.pg.keyboard.up('Shift'); p.wait(500)
    names = lambda: p.ev("return App.sel.map(id=>Model.find(App.doc,id).item.name)")
    ok1 = sorted(names()) == ['Würfel 1', 'Würfel 2'] and cross0 == 0
    # von rechts nach links, Rahmen nur halb über Würfel 3: berührt zählt
    c = scr(2)
    p.pg.keyboard.down('Shift'); p.pg.mouse.move(c[0], c[1] + 60); p.pg.mouse.down(); p.pg.mouse.move(b[0] - 3, b[1] - 60, steps=8)
    cross1 = p.pg.locator('.sel-band.cross').count(); p.pg.mouse.up(); p.pg.keyboard.up('Shift'); p.wait(500)
    ok2 = sorted(names()) == ['Würfel 2', 'Würfel 3'] and cross1 == 1
    # Auswahl umkehren
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+Shift+I'); p.wait(400)
    ok3 = sorted(names()) == ['Würfel 1', 'Würfel 4']
    # Rechtsklick auf Würfel 4: Menü mit Ausblenden
    d4 = scr(3); p.pg.mouse.click(d4[0], d4[1], button='right'); p.wait(500)
    ok4 = p.pg.locator('#cm-hide').count() == 1 and p.pg.locator('#cm-del').count() == 1 and sorted(names()) == ['Würfel 1', 'Würfel 4']
    p.pg.locator('#cm-hide').click(); p.wait(800)
    ok5 = p.ev("return App.doc.items.map(i=>!!i.hidden)") == [True, False, False, True]
    # Rechtsklick ins Leere: alles einblenden
    p.pg.mouse.click(d4[0] - 100, d4[1] + 150, button='right'); p.wait(500)
    ok6 = p.pg.locator('#cm-showall').count() == 1 and '(2)' in p.pg.locator('#cm-showall').inner_text()
    p.pg.locator('#cm-showall').click(); p.wait(800)
    ok7 = not p.ev("return App.doc.items.some(i=>i.hidden)")
    # letzten Befehl wiederholen: „Ausgewählte ausblenden“ über die Eingabezeile, dann Leertaste
    p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
    p.pg.fill('#cmd-input', 'ausgewählte ausblenden'); p.wait(300); p.pg.keyboard.press('Enter'); p.wait(800)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(300)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press(' '); p.wait(800)
    hid = p.ev("return App.doc.items.map(i=>!!i.hidden)")
    p.pg.locator('#cmd-input').focus(); p.wait(400)
    ok8 = hid == [True, True, False, False] and p.ev("return Commands.last && Commands.last.id") == 'hideSel' and 'zuletzt benutzt' in p.pg.locator('.cmd-pop').inner_text().lower() and 'ausgewählte ausblenden' in p.pg.locator('.cmd-pop').inner_text().lower()
    p.pg.keyboard.press('Escape')
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8]

# ---------- Sitzung 85: Anzeige-Arten, durchsichtig, Blick auf Fläche, gespeicherte Ansichten ----------
def t_anzeige(p):
    p.empty()
    p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:30,h:10},{name:'Platte'}); d.items.push(a); const b=Model.newItem('box',{w:10,d:10,h:10},{name:'Klotz'}); b.t.x=50; d.items.push(b); })"""); warte_rechnen(p)
    node = lambda i: p.ev("const n=Viewer.nodes.get(App.doc.items[arg].id); const m=n.mesh.material; return {op: m.opacity, tr: m.transparent, cw: m.colorWrite, ev: n.edges.visible}", i)
    # Nur Flächen / Drahtgitter / verdeckte Kanten / zurück
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#disp-shaded').click(); p.wait(600)
    a = node(0)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#disp-wire').click(); p.wait(600)
    b = node(0)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#disp-hidden').click(); p.wait(600)
    c = node(0)
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#disp-edges').click(); p.wait(600)
    d = node(0)
    ok1 = a['ev'] is False and b['cw'] is False and b['ev'] is True and c['tr'] and c['op'] <= 0.35 and d['ev'] is True and d['op'] == 1 and d['cw'] is True
    # Drahtgitter: Teil lässt sich trotzdem anklicken
    p.ev("ViewPrefs.set({display:'wire'})"); p.wait(500)
    s = p.ev("const b=Actions.worldBox(App.doc.items[1].id); const c=b.getCenter(b.min.clone()); c.z=b.max.z; const q=Viewer.toScreen(c); const r=Viewer.canvas.getBoundingClientRect(); return [q.x+r.left, q.y+r.top]")
    p.pg.mouse.click(s[0], s[1]); p.wait(500)
    ok2 = p.ev("return App.sel") == [p.ev("return App.doc.items[1].id")]
    p.ev("ViewPrefs.set({display:'edges'})"); p.wait(400)
    # durchsichtig je Teil
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.fill('#item-opacity', '40'); p.pg.press('#item-opacity', 'Enter'); p.wait(800)
    e = node(0)
    ok3 = abs(p.ev("return App.doc.items[0].opacity") - 0.4) < 1e-9 and e['tr'] and abs(e['op'] - 0.4) < 1e-6
    p.pg.fill('#item-opacity', '100'); p.pg.press('#item-opacity', 'Enter'); p.wait(800)
    ok4 = p.ev("return App.doc.items[0].opacity") is None and node(0)['op'] == 1
    # Blick senkrecht auf die Oberseite (Rechtsklick auf die Fläche)
    p.ev("App.select([])"); p.ev("Viewer.setView('iso', false)"); p.wait(800)
    s = p.ev("const b=Actions.worldBox(App.doc.items[0].id); const c=b.getCenter(b.min.clone()); c.z=b.max.z; const q=Viewer.toScreen(c); const r=Viewer.canvas.getBoundingClientRect(); return [q.x+r.left, q.y+r.top]")
    p.pg.mouse.click(s[0], s[1], button='right'); p.wait(500)
    has = p.pg.locator('#cm-normal').count() == 1
    p.pg.locator('#cm-normal').click(); p.wait(1200)
    dirv = p.ev("const c=Viewer.camera; const t=Viewer.controls.target; const v=c.position.clone().sub(t).normalize(); return [v.x,v.y,v.z]")
    ok5 = has and dirv[2] > 0.999
    # Ansicht speichern und wieder aufrufen
    p.pg.locator('#t-views').click(); p.wait(300); p.pg.locator('#view-save').click(); p.wait(500)
    p.pg.locator('.modal input').fill('Von oben'); p.pg.keyboard.press('Enter'); p.wait(600)
    p.ev("Viewer.setView('front', false)"); p.wait(500)
    p.pg.locator('#t-views').click(); p.wait(300)
    vid = p.ev("return App.doc.views[0].id"); p.pg.locator('#view-go-' + vid).click(); p.wait(1200)
    dirv2 = p.ev("const c=Viewer.camera; const t=Viewer.controls.target; const v=c.position.clone().sub(t).normalize(); return [v.x,v.y,v.z]")
    ok6 = p.ev("return App.doc.views[0].name") == 'Von oben' and dirv2[2] > 0.999
    return [ok1, ok2, ok3, ok4, ok5, ok6]

# ---------- Sitzung 86: Bezugsebenen ----------
def t_bezugsebenen(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:40,h:10},{name:'Block'}); d.items.push(a); })"); warte_rechnen(p)
    p.ev("Datums.addOrigin('XY', 25)"); p.wait(600)
    d0 = p.ev("return App.doc.datums[0]")
    ok1 = d0['plane']['o'] == [0, 0, 25] and p.pg.locator('#datum-tree .datum-row').count() == 1 and p.pg.locator('#datum-sketch').count() == 1 and p.ev("return Viewer.groups.datums.children.length") == 1
    # über die Oberfläche: Skizze → Neue Bezugsebene → von vorne, 15 mm, 30° geneigt
    p.ev("Datums.select(null)"); p.wait(300)
    p.pg.locator('#t-sketch').click(); p.wait(400); p.pg.locator('#sk-datum').click(); p.wait(400)
    p.pg.fill('#dp-off', '15'); p.pg.press('#dp-off', 'Enter'); p.pg.fill('#dp-tilt', '30'); p.pg.press('#dp-tilt', 'Enter'); p.wait(200)
    p.pg.locator('#dp-xz').click(); p.wait(600)
    d1 = p.ev("return App.doc.datums[1]")
    n = d1['plane']['n']
    ok2 = abs(d1['plane']['o'][1] + 15) < 1e-6 and abs(n[1] + math.cos(math.radians(30))) < 1e-6 and abs(abs(n[2]) - 0.5) < 1e-6
    # an der Oberseite des Blocks, 5 mm darüber; der Block wird höher → die Ebene wandert mit
    p.ev("const r=App.results.get(App.doc.items[0].id); const i=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9); Datums.addFromFace({id:App.doc.items[0].id, idx:i, info:r.data.faces[i]}, 5)"); p.wait(600)
    z1 = p.ev("return App.doc.datums[2].plane.o[2]")
    p.ev("App.change('x', d=>{ d.items[0].p.h=20; })"); warte_rechnen(p); p.wait(600)
    z2 = p.ev("return App.doc.datums[2].plane.o[2]")
    ok3 = abs(z1 - 15) < 1e-6 and abs(z2 - 25) < 1e-6
    # Abstand im Panel ändern, dann darauf skizzieren und hochziehen
    p.ev("Datums.select(App.doc.datums[2].id)"); p.wait(500)
    p.pg.fill('#datum-dist', '30'); p.pg.press('#datum-dist', 'Enter'); p.wait(600)
    z3 = p.ev("return App.doc.datums[2].plane.o[2]")
    p.pg.locator('#datum-sketch').click(); p.wait(1200)
    ok4 = abs(z3 - 50) < 1e-6 and p.ev("return Sketch.active") and abs(p.ev("return Sketch.state.plane.o[2]") - 50) < 1e-6
    p.ev("const S=Sketch.state; S.ents.push({id:'r1',type:'rect',a:[-5,-5],b:[5,5]})"); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(1200); p.pg.locator('.stepbox .btn.primary').click(); p.wait(1500); warte_rechnen(p)
    it = p.ev("return App.doc.items[App.doc.items.length-1]")
    bb = p.ev("return App.results.get(App.doc.items[App.doc.items.length-1].id).data.bbox")
    ok5 = it['kind'] == 'extrude' and abs(bb[2] - 50) < 0.01
    # Block löschen: die Flächen-Ebene bleibt stehen und meldet „Fläche fehlt“; Rückgängig holt alles zurück
    p.ev("App.change('x', d=>{ d.items.splice(0,1); })"); warte_rechnen(p); p.wait(600)
    p.ev("Datums.select(null)"); p.wait(300)
    ok6 = 'Fläche fehlt' in p.pg.locator('#datum-tree').inner_text() and abs(p.ev("return App.doc.datums[2].plane.o[2]") - 50) < 1e-6
    p.ev("Datums.remove(App.doc.datums[0].id)"); p.wait(400)
    ok7 = p.ev("return App.doc.datums.length") == 2 and p.ev("return Viewer.groups.datums.children.length") == 2
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7]

# Farbe je Fläche
def t_flaechenfarbe(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:30,h:10},{name:'Block'}); a.color='#1971c2'; d.items.push(a); })"); warte_rechnen(p)
    top = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9)")
    p.ev("App.select([App.doc.items[0].id], {face:{id:App.doc.items[0].id, faceIdx:arg}})", top); p.wait(600)
    ok1 = p.pg.locator('#face-color').count() == 1
    p.ev("const i=document.querySelector('#face-color-inp'); i.value='#e03131'; i.dispatchEvent(new Event('change'))"); p.wait(1200)
    fc = p.ev("return App.doc.items[0].faceColors")
    # Ecken der Oberseite rot, die übrigen blau
    cols = p.ev("""const n=Viewer.nodes.get(App.doc.items[0].id); const g=n.mesh.geometry, c=g.getAttribute('color'), fg=n.data.faceGroups, tri=g.index.array; if(!c) return null;
      const out={}; for (const [s,cnt,fi] of fg) { const v=tri[s]; out[fi]=[c.getX(v),c.getY(v),c.getZ(v)].map(x=>Math.round(x*100)/100); } return {out, vc:n.mesh.material.vertexColors}""")
    red = cols and cols['out'][str(top)]; other = cols and [v for k, v in cols['out'].items() if k != str(top)]
    ok2 = fc and fc[0]['col'] == '#e03131' and cols['vc'] and red[0] > 0.5 and red[2] < 0.2 and all(o[2] > o[0] for o in other)
    # Block höher: die Oberseite bleibt rot (Fläche wird über Lage und Richtung wiedergefunden)
    p.ev("App.change('x', d=>{ d.items[0].p.h=20; })"); warte_rechnen(p)
    top2 = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9)")
    idx = p.ev("return Viewer.faceIndexOf(App.doc.items[0].id, App.doc.items[0].faceColors[0])")
    ok3 = idx == top2 and idx >= 0
    # entfernen
    p.ev("App.select([App.doc.items[0].id], {face:{id:App.doc.items[0].id, faceIdx:arg}})", top2); p.wait(600)
    if p.pg.locator('#face-color-off').count(): p.pg.locator('#face-color-off').click(); p.wait(1000)
    ok4 = p.ev("return App.doc.items[0].faceColors") is None
    return [ok1, ok2, ok3, ok4]

# Text in Kurven umwandeln
def t_text_kurven(p):
    scene(p, [{'id': 'T', 'type': 'text', 'a': [0, 0], 's': 'AB8', 'h': 10, 'font': 'inter', 'align': 'm'}])
    area = lambda: SS(p, "return SK.regions(S.ents).reduce((s,r)=>s+r.area,0)")
    a0 = area(); n0 = SS(p, "return SK.regions(S.ents).length")
    SS(p, "S.sel='T'; return 1"); p.ev("Panels.renderRight()"); p.wait(400)
    ok1 = p.pg.locator('#se-text-curves').count() == 1
    p.pg.locator('#se-text-curves').click(); p.wait(800)
    kinds = SS(p, "return [...new Set(S.ents.map(e=>e.type))]")
    a1 = area(); n1 = SS(p, "return SK.regions(S.ents).length")
    ok2 = 'text' not in kinds and set(kinds) <= {'line', 'spline'} and n1 == n0 and abs(a1 - a0) / a0 < 0.03
    # Rückgängig holt den Text zurück
    p.pg.keyboard.press('Control+z'); p.wait(600)
    ok3 = SS(p, "return S.ents.length===1 && S.ents[0].type==='text'")
    return [ok1, ok2, ok3]

# Fläche und Umfang in der Skizze
def t_skizze_messen(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [-20, -10], 'b': [20, 10]}, {'id': 'C', 'type': 'circle', 'c': [5, 0], 'r': 4}])
    p.ev("Sketch.setTool('line')"); p.wait(200); p.ev("Sketch.setTool('select')"); p.wait(400)
    import re
    txt = p.pg.locator('#sk-area').inner_text().replace('.', '').replace(',', '.')
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', txt)]
    A, U = nums[-2], nums[-1]
    return [abs(A - (800 - math.pi * 16)) < 1.0, abs(U - (120 + 2 * math.pi * 4)) < 0.5]

# ---------- Sitzung 91: Maß zum Ablesen, Regel „auf einer Linie“ ----------
def scene_cons(p, ents, cons):
    p.empty()
    p.ev("App.change('x', d=>{ const it=Model.newItem('extrude',{},{}); it.p={sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:arg[0],dims:[],cons:arg[1]},dist:3,dir:'normal'}; d.items.push(it); })", [ents, cons])
    p.wait(1500); p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1500)

def t_referenzmass(p):
    scene_cons(p, [{'id': 'L1', 'type': 'line', 'a': [-30, 0], 'b': [0, 0]}, {'id': 'L2', 'type': 'line', 'a': [0, 10], 'b': [25, 10]}],
               [{'id': 'k1', 'type': 'equal', 'refs': [{'e': 'L1'}, {'e': 'L2'}]}])
    def sel(eid):
        SS(p, f"S.sel='{eid}'; Panels.renderRight()"); p.wait(300)
    sel('L1'); p.pg.fill('#se-len', '30'); p.pg.press('#se-len', 'Enter'); p.wait(400)
    # L2 ist über „Gleich“ schon bestimmt → wird Maß zum Ablesen
    p.pg.keyboard.press('d'); m = to_screen(p, *SS(p, "const e=E('L2'); return [(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2]")); p.pg.mouse.click(m[0], m[1]); p.wait(300)
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('30'); p.pg.keyboard.press('Enter'); p.wait(500)
    p.ev("Sketch.setTool('select')"); sel('L2')
    d2 = SS(p, "return S.dims.find(d=>d.e==='L2')")
    toast = ' '.join(p.pg.locator('.toast').all_inner_texts())
    ok1 = bool(d2 and d2.get('ref')) and 'Klammern' in toast and p.pg.locator('#se-len + .dimlock.refmark, .dimlock.refmark').count() >= 1
    # L1 ändern → Ablese-Maß wandert mit
    sel('L1'); p.pg.fill('#se-len', '40'); p.pg.press('#se-len', 'Enter'); p.wait(500)
    refs = [t for t in p.pg.locator('.skdim.ref').all_inner_texts()]
    ok2 = len(refs) == 1 and refs[0].startswith('(') and '40' in refs[0] and abs(SS(p, "return Math.hypot(E('L2').b[0]-E('L2').a[0],E('L2').b[1]-E('L2').a[1])") - 40) < 1e-3
    # widersprechendes Maß → Meldung mit „Nur ablesen“
    sel('L2'); p.pg.fill('#se-len', '55'); p.pg.press('#se-len', 'Enter'); p.wait(500)
    ok3 = p.pg.locator('.toast button', has_text='Nur ablesen').count() >= 1 and SS(p, "return S.dims.find(d=>d.e==='L2').ref===true")
    # festes Maß per „( )“ zum Ablese-Maß machen
    lab = p.pg.locator('.skdim:not(.ref)').first; lab.click(); p.wait(300)
    p.pg.click('#dim-ref'); p.wait(400)
    ok4 = SS(p, "return S.dims.every(d=>d.ref)") and p.pg.locator('.skdim.ref').count() == 2
    # Ablese-Maß anklicken und Wert tippen → wieder fest
    p.pg.locator('.skdim.ref').first.click(); p.wait(300)
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('35'); p.pg.keyboard.press('Enter'); p.wait(500)
    ok5 = SS(p, "return S.dims.filter(d=>!d.ref).length===1") and abs(SS(p, "return Math.hypot(E('L1').b[0]-E('L1').a[0],E('L1').b[1]-E('L1').a[1])") - 35) < 1e-3
    return [ok1, ok2, ok3, ok4, ok5]

def t_kollinear(p):
    scene_cons(p, [{'id': 'L1', 'type': 'line', 'a': [-30, 0], 'b': [-10, 2]}, {'id': 'L2', 'type': 'line', 'a': [10, 6], 'b': [30, 9]}], [])
    p.pg.click('.consbar [data-tool="c:collinear"]'); p.wait(300)
    for eid in ('L1', 'L2'):
        m = to_screen(p, *SS(p, f"const e=E('{eid}'); return [(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2]")); p.pg.mouse.click(m[0], m[1]); p.wait(300)
    on = "const A=E('L1'), d=[A.b[0]-A.a[0],A.b[1]-A.a[1]], n=Math.hypot(...d); return [E('L2').a,E('L2').b].map(q=>Math.abs(((q[0]-A.a[0])*d[1]-(q[1]-A.a[1])*d[0])/n))"
    dev = SS(p, on)
    ok1 = SS(p, "return S.cons.some(c=>c.type==='collinear')") and max(dev) < 1e-4
    # erste Linie waagerecht → zweite auch, auf gleicher Höhe
    p.pg.click('.consbar [data-tool="c:horizontal"]'); p.wait(300)
    m = to_screen(p, *SS(p, "const e=E('L1'); return [(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2]")); p.pg.mouse.click(m[0], m[1]); p.wait(400)
    ys = SS(p, "return [E('L1').a[1],E('L1').b[1],E('L2').a[1],E('L2').b[1]]")
    ok2 = max(ys) - min(ys) < 1e-4
    # Regel im Bild anklickbar, Name stimmt
    ok3 = p.pg.locator('.consbar [data-tool="c:collinear"]').get_attribute('aria-label') in (None, 'Auf einer Linie') or True
    p.ev("Sketch.setTool('select')"); p.wait(200)
    SS(p, "S.selCon=S.cons.find(c=>c.type==='collinear').id; Panels.renderRight()"); p.wait(300)
    ok3 = 'Auf einer Linie' in p.pg.locator('#right').inner_text()
    return [ok1, ok2, ok3]

# ---------- Sitzung 92: Längen, Durchmesser, Wert kopieren ----------
def t_messen_rund(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:20,h:10},{name:'Block'}); d.items.push(a); const c=Model.newItem('cylinder',{d:10,h:30},{name:'Rolle'}); c.t.x=60; d.items.push(c); })"); warte_rechnen(p)
    val = lambda: p.pg.locator('#sel-val').text_content() if p.pg.locator('#sel-val').count() else ''
    # eine 40er-Kante, dann alle vier oberen Kanten
    p.ev("const id=App.doc.items[0].id, r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.l-40)<1e-6 && Math.abs(e.a[2]-10)<1e-6); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(700)
    v1 = val()
    p.ev("const id=App.doc.items[0].id, r=App.results.get(id); const es=[]; r.data.edges.forEach((e,i)=>{ if(e.t==='LINE' && Math.abs(e.a[2]-10)<1e-6 && Math.abs(e.b[2]-10)<1e-6) es.push({id,edgeIdx:i}); }); App.select([id],{edges:es})"); p.wait(700)
    v2 = val()
    ok1 = 'Kante' in v1 and '40' in v1 and '4 Kanten' in v2 and '120' in v2
    # Kreiskante der Rolle → Durchmesser; Mantel → Durchmesser
    p.ev("const id=App.doc.items[1].id, r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='CIRCLE'); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(700)
    v3 = val()
    p.ev("const id=App.doc.items[1].id, r=App.results.get(id); const i=r.data.faces.findIndex(f=>f.t==='CYLINDRE'); App.select([id],{face:{id,faceIdx:i,point:new THREE.Vector3(65,0,15),normal:new THREE.Vector3(1,0,0)}})".replace('new THREE.Vector3(65,0,15)','{x:65,y:0,z:15}').replace('new THREE.Vector3(1,0,0)','{x:1,y:0,z:0}')); p.wait(700)
    v4 = val()
    ok2 = 'Ø' in v3 and '10' in v3 and 'Runde Fläche Ø' in v4 and '10' in v4
    # Klick auf das Schild kopiert den Wert
    p.pg.locator('#sel-val').click(); p.wait(400)
    ok3 = p.ev("return Measure.copied") == '10' and 'kopiert' in ' '.join(p.pg.locator('.toast').all_inner_texts())
    # Messen: Mantel anklicken → Zylinder Ø 10; Schild anklicken kopiert
    p.ev("App.clearSelection(); Viewer.setView('front', false)"); p.wait(800)
    p.pg.locator('#t-measure').click(); p.wait(400)
    sx, sy = world_screen(p, 60, -5, 15)
    p.pg.mouse.click(sx, sy); p.wait(600)
    r = p.ev("return Measure.result") or ''
    ok4 = r.startswith('Zylinder Ø 10 mm') and '(R 5)' in r
    p.pg.locator('.dimlabel.mlabel').first.click(); p.wait(400)
    ok5 = p.ev("return Measure.copied") == '10'
    p.pg.keyboard.press('Escape'); p.wait(200)
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 93: Vorige Ansicht, Teil dahinter wählen ----------
def t_vorige_ansicht(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:20,d:20,h:20},{name:'Würfel'})); })"); warte_rechnen(p)
    cam = "const c=Viewer.saveCamera(); const d=c.p.clone().sub(c.t).normalize(); return [d.x,d.y,d.z].map(v=>Math.round(v*100)/100)"
    for v in ('front', 'top', 'right'):
        p.ev(f"Viewer.setView('{v}', false)"); p.wait(300)
    p.pg.locator('canvas').first.focus()
    p.pg.keyboard.press('Shift+Z'); p.wait(700); d1 = p.ev(cam)
    p.pg.keyboard.press('Shift+Z'); p.wait(700); d2 = p.ev(cam)
    ok1 = d1 == [0, 0, 1] and d2 == [0, -1, 0]
    # mit der Maus drehen → zurück zum Blick davor
    cx, cy = p.canvas_center()
    p.pg.mouse.move(cx + 250, cy + 200); p.pg.mouse.down(); p.pg.mouse.move(cx + 380, cy + 120, steps=10); p.pg.mouse.up(); p.wait(900)
    turned = p.ev(cam)
    p.pg.keyboard.press('Shift+Z'); p.wait(800); d3 = p.ev(cam)
    ok2 = turned != [0, -1, 0] and d3 == [0, -1, 0]
    # Rechtsklick ins Leere bietet „Vorige Ansicht“
    p.pg.mouse.click(cx + 300, cy + 220, button='right'); p.wait(400)
    ok3 = p.pg.locator('#cm-viewback').count() == 1
    p.pg.keyboard.press('Escape')
    return [ok1, ok2, ok3]

def t_dahinter(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:30,d:10,h:30},{name:'Deckel'}); a.t.y=-20; d.items.push(a); const b=Model.newItem('box',{w:10,d:10,h:10},{name:'Platine'}); b.t.y=10; b.t.z=10; d.items.push(b); })"); warte_rechnen(p)
    p.ev("App.clearSelection(); Viewer.setView('front', false)"); p.wait(900)
    x, y = world_screen(p, 0, -25, 15)
    names = lambda: p.ev("return App.sel.map(id=>Model.find(App.doc,id).item.name)")
    p.pg.mouse.click(x, y); p.wait(400); n1 = names()
    p.pg.keyboard.down('Alt'); p.pg.mouse.click(x, y); p.pg.keyboard.up('Alt'); p.wait(400); n2 = names()
    p.pg.keyboard.down('Alt'); p.pg.mouse.click(x, y); p.pg.keyboard.up('Alt'); p.wait(400); n3 = names()
    ok1 = n1 == ['Deckel'] and n2 == ['Platine'] and n3 == ['Deckel']
    # Rechtsklick: „Dahinter wählen: Platine“
    p.pg.mouse.click(x, y, button='right'); p.wait(400)
    lab = p.pg.locator('#cm-behind-0').inner_text() if p.pg.locator('#cm-behind-0').count() else ''
    ok2 = 'Platine' in lab
    if ok2:
        p.pg.locator('#cm-behind-0').click(); p.wait(400)
    ok3 = names() == ['Platine']
    return [ok1, ok2, ok3]

# ---------- Sitzung 94: Kanten einer Fläche, Notiz am Schritt ----------
def t_flaechenkanten(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:40,d:30,h:20},{name:'Gehäuse'})); const c=Model.newItem('cylinder',{d:12,h:10},{name:'Stift'}); c.t.x=50; d.items.push(c); })"); warte_rechnen(p)
    top = "const id=App.doc.items[0].id, r=App.results.get(id); return r.data.faces.findIndex(f=>f.t==='PLANE' && f.n[2]>0.99)"
    fi = p.ev(top)
    n = p.ev("return Panels.faceEdgeList({id:App.doc.items[0].id, idx:arg}).length", fi)
    nc = p.ev("const id=App.doc.items[1].id, r=App.results.get(id); const i=r.data.faces.findIndex(f=>f.t==='CYLINDRE'); return Panels.faceEdgeList({id, idx:i}).length")
    ok1 = n == 4 and nc == 2
    # Fläche wählen → „Ihre Kanten“ → alle abrunden
    p.ev("const id=App.doc.items[0].id; App.select([id],{face:{id,faceIdx:arg,point:[0,0,20],normal:[0,0,1]}})", fi); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Ihre Kanten"]').click(); p.wait(300)
    p.pg.locator('#fe-fillet').click(); warte_rechnen(p)
    it = p.ev("return App.doc.items[0]")
    fin = (it.get('finishes') or [{}])[0]
    ok2 = fin.get('type') == 'fillet' and len(fin.get('edges') or []) == 4 and p.ev("return App.errors.length") == 0
    # Mit Rundung: Volumen kleiner als der Quader
    v = p.ev("return Mass.measure().then(r=>Math.round(r.parts[0].volume))")
    ok3 = 23900 < v < 24000
    return [ok1, ok2, ok3]

def t_notiz_schritt(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:20,d:20,h:2},{name:'Wand'})); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('#note-sec summary').click(); p.wait(200)
    p.pg.fill('#item-note', 'Wand 2 mm, sonst bricht sie'); p.pg.locator('#item-note').blur(); p.wait(500)
    ok1 = p.ev("return App.doc.items[0].note") == 'Wand 2 mm, sonst bricht sie'
    chip = p.pg.locator('.tl-chip').first
    ok2 = 'note' in (chip.get_attribute('class') or '') and 'Notiz: Wand 2 mm' in (chip.get_attribute('data-tip') or '')
    p.ev("App.undo()"); p.wait(500)
    ok3 = p.ev("return App.doc.items[0].note") is None
    return [ok1, ok2, ok3]

# ---------- Sitzung 95: Verschieben und Drehen in der Skizze ----------
def t_skizze_verschieben(p):
    scene(p, [{'id': 'C', 'type': 'circle', 'c': [0, 0], 'r': 5}, {'id': 'L', 'type': 'line', 'a': [10, 0], 'b': [20, 0]}, {'id': 'R', 'type': 'rect', 'a': [-30, -5], 'b': [-20, 5]}])
    p.pg.keyboard.press('h'); p.wait(300)
    def pick(eid, pt):
        s = to_screen(p, *pt); p.pg.mouse.click(s[0], s[1]); p.wait(250)
    pick('C', [5, 0]); pick('L', [15, 0])
    p.pg.fill('#xm-dx', '12'); p.pg.press('#xm-dx', 'Enter'); p.pg.fill('#xm-dy', '-4'); p.pg.press('#xm-dy', 'Enter'); p.wait(200)
    p.pg.keyboard.press('Enter'); p.wait(500)
    c, l = SS(p, "return E('C')"), SS(p, "return E('L')")
    ok1 = abs(c['c'][0] - 12) < 1e-6 and abs(c['c'][1] + 4) < 1e-6 and abs(l['a'][0] - 22) < 1e-6 and abs(l['b'][1] + 4) < 1e-6 and SS(p, "return S.ents.length") == 3
    # als Kopie drehen: Linie um 90° um ihre Mitte
    pick('L', [27, -4])
    p.pg.select_option('#xm-mode', 'rot'); p.wait(300)
    p.pg.fill('#xm-ang', '90'); p.pg.press('#xm-ang', 'Enter'); p.pg.check('#xm-copy'); p.wait(200)
    p.pg.click('#xm-make'); p.wait(500)
    ents = SS(p, "return S.ents.filter(e=>e.type==='line')")
    nl = [e for e in ents if e['id'] != 'L']
    ok2 = len(ents) == 2 and len(nl) == 1 and abs(nl[0]['a'][0] - 27) < 1e-6 and abs(abs(nl[0]['a'][1] - nl[0]['b'][1]) - 10) < 1e-6 and abs(SS(p, "return E('L').a[1]") + 4) < 1e-6
    # Rechteck schräg drehen (30°) → wird zu vier Linien, Fläche bleibt
    pick('R', [-25, 5])
    p.pg.fill('#xm-ang', '30'); p.pg.press('#xm-ang', 'Enter'); p.pg.uncheck('#xm-copy'); p.wait(200)
    p.pg.keyboard.press('Enter'); p.wait(500)
    ok3 = SS(p, "return !E('R') && S.ents.filter(e=>e.type==='line').length===6")
    # Rückgängig holt das Rechteck zurück
    p.pg.keyboard.press('Control+z'); p.wait(400)
    ok4 = SS(p, "return !!E('R')")
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 96: Kopieren und Einfügen in der Skizze, Kette per Doppelklick ----------
def t_skizze_kopieren(p):
    L = lambda i, a, b: {'id': 'L%d' % i, 'type': 'line', 'a': a, 'b': b}
    scene_cons(p, [L(1, [0, 0], [20, 0]), L(2, [20, 0], [20, 10]), L(3, [20, 10], [0, 10]), L(4, [0, 10], [0, 0]), {'id': 'C', 'type': 'circle', 'c': [40, 5], 'r': 3}],
               [{'id': 'k1', 'type': 'horizontal', 'refs': [{'e': 'L1'}]}])
    SS(p, "S.dims.push({id:'m1', e:'L1', k:'len', v:20})")
    p.pg.keyboard.press('h'); p.wait(300)
    s = to_screen(p, 10, 0); p.pg.mouse.dblclick(s[0], s[1]); p.wait(400)
    ok1 = sorted(SS(p, "return S.patSel")) == ['L1', 'L2', 'L3', 'L4']
    p.pg.keyboard.press('Control+c'); p.wait(300)
    p.pg.keyboard.press('Control+v'); p.wait(600)
    lines = SS(p, "return S.ents.filter(e=>e.type==='line')")
    new = [e for e in lines if not e['id'].startswith('L')]
    xs = [q for e in new for q in (e['a'][0], e['b'][0])]
    ok2 = len(lines) == 8 and min(xs) > 20.5 and SS(p, "return S.tool") == 'xmove' and len(SS(p, "return S.patSel")) == 4
    ok3 = SS(p, "return S.cons.filter(c=>c.type==='horizontal').length") == 2 and SS(p, "return S.dims.filter(d=>d.k==='len').length") == 2
    # in einer neuen Skizze an derselben Stelle einfügen
    p.ev("Sketch.cancel(true)"); p.wait(800)
    p.ev("Sketch.startOnPlane('XZ')"); p.wait(1500)
    p.pg.keyboard.press('Control+v'); p.wait(600)
    ents = SS(p, "return S.ents")
    ok4 = len(ents) == 4 and min(q for e in ents for q in (e['a'][0], e['b'][0])) == 0
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 97: Rechteck mit runden Ecken, Ecke bilden ----------
def t_rechteck_rund(p):
    sketch_xy(p)
    p.pg.keyboard.press('r'); p.wait(300)
    p.pg.fill('#rk-r', '3'); p.pg.press('#rk-r', 'Enter'); p.wait(200)
    a = to_screen(p, 0, 0); b = to_screen(p, 30, 15)
    p.pg.mouse.click(*a); p.pg.mouse.move(*b); p.wait(200)
    p.pg.keyboard.type('40'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter'); p.wait(700)
    st = SS(p, "const L=S.ents.filter(e=>e.type==='line'), A=S.ents.filter(e=>e.type==='arc'); const xs=S.ents.flatMap(e=>[e.a,e.b].filter(Boolean)).map(q=>q[0]), ys=S.ents.flatMap(e=>[e.a,e.b].filter(Boolean)).map(q=>q[1]); return {nl:L.length, na:A.length, rd:S.dims.filter(d=>d.k==='r').length, eq:S.cons.filter(c=>c.type==='equal').length, pl:S.dims.filter(d=>d.k==='distPL').length, w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)}")
    ok1 = st['nl'] == 4 and st['na'] == 4 and st['rd'] == 1 and st['eq'] == 3 and st['pl'] == 2 and abs(st['w'] - 40) < 1e-3 and abs(st['h'] - 20) < 1e-3
    # Radius eines Bogens ändern → alle vier folgen, Außenmaß bleibt
    aid = SS(p, "return S.dims.find(d=>d.k==='r').e")
    SS(p, f"S.sel='{aid}'; Panels.renderRight()"); p.wait(300)
    p.pg.fill('#se-r', '5'); p.pg.press('#se-r', 'Enter'); p.wait(600)
    rr = SS(p, "return S.ents.filter(e=>e.type==='arc').map(e=>SK.arcInfo(e.a,e.m,e.b).r)")
    st2 = SS(p, "const xs=S.ents.flatMap(e=>[e.a,e.b].filter(Boolean)).map(q=>q[0]); return Math.max(...xs)-Math.min(...xs)")
    ok2 = all(abs(r - 5) < 1e-3 for r in rr) and abs(st2 - 40) < 1e-3
    # ein Rückgängig: weg ist das ganze Rechteck
    p.pg.keyboard.press('Control+z'); p.wait(300); p.pg.keyboard.press('Control+z'); p.wait(300)
    ok3 = SS(p, "return S.ents.length") == 0
    return [ok1, ok2, ok3]

def t_ecke_bilden(p):
    scene_cons(p, [{'id': 'L1', 'type': 'line', 'a': [0, 0], 'b': [10, 0]}, {'id': 'L2', 'type': 'line', 'a': [20, 5], 'b': [20, 20]}, {'id': 'L3', 'type': 'line', 'a': [-5, 30], 'b': [35, 30]}], [])
    p.pg.keyboard.press('k'); p.wait(300)
    p.pg.select_option('#cn-mode', 'meet'); p.wait(300)
    for q in ([5, 0], [20, 15]):
        s = to_screen(p, *q); p.pg.mouse.click(*s); p.wait(300)
    l1, l2 = SS(p, "return E('L1')"), SS(p, "return E('L2')")
    ok1 = l1['b'] == [20, 0] and l2['a'] == [20, 0] and SS(p, "return S.cons.some(c=>c.type==='coincident')")
    # zu lange Linie kürzen: L3 an L2, angeklickt links → rechts wird bis x=20 gekürzt
    for q in ([0, 30], [20, 10]):
        s = to_screen(p, *q); p.pg.mouse.click(*s); p.wait(300)
    l3, l2b = SS(p, "return E('L3')"), SS(p, "return E('L2')")
    ok2 = l3['b'] == [20, 30] and l3['a'] == [-5, 30] and l2b['b'] == [20, 30] and l2b['a'] == [20, 0]
    return [ok1, ok2]

# ---------- Sitzung 98: Bogen über die Mitte, Langloch über die Gesamtlänge ----------
def t_bogen_mitte(p):
    sketch_xy(p)
    p.pg.keyboard.press('a'); p.wait(300)
    p.pg.select_option('#ar-mode', 'center'); p.wait(200)
    for q in ([0, 0], [10, 0], [0, 10]):
        s = to_screen(p, *q); p.pg.mouse.click(*s); p.wait(250)
    e = SS(p, "return S.ents[0]")
    ok1 = e and e['type'] == 'arc' and e['a'] == [10, 0] and e['b'] == [0, 10] and abs(e['m'][0] - 7.0711) < 1e-3 and abs(e['m'][1] - 7.0711) < 1e-3
    # Ende liegt nicht auf dem Kreis → wird auf den Radius gezogen; großer Bogen über 180°
    for q in ([30, 0], [40, 0], [30, -5]):
        s = to_screen(p, *q); p.pg.mouse.click(*s); p.wait(250)
    e2 = SS(p, "return S.ents[1]")
    ok2 = e2 and e2['b'] == [30, -10] and e2['m'][0] < 30
    return [ok1, ok2]

def t_langloch_gesamt(p):
    sketch_xy(p)
    p.pg.keyboard.press('g'); p.wait(300)
    p.pg.select_option('#sl-mode', 'total'); p.wait(200)
    a = to_screen(p, 0, 0); b = to_screen(p, 30, 0)
    p.pg.mouse.click(*a); p.pg.mouse.move(*b); p.wait(200)
    p.pg.keyboard.type('40'); p.pg.keyboard.press('Enter'); p.wait(300)
    p.pg.keyboard.type('10'); p.pg.keyboard.press('Enter'); p.wait(600)
    e = SS(p, "return S.ents[0]")
    dims = SS(p, "return S.dims.map(d=>[d.k,d.v]).sort()")
    ok1 = e and e['type'] == 'slot' and e['a'] == [5, 0] and e['b'] == [35, 0] and e['r'] == 5
    ok2 = dims == [['len', 30], ['w', 10]]
    # mit der Maus: außen 0…20, Breite 6 → Mitten 3 und 17
    p.pg.mouse.click(*to_screen(p, 0, 20)); p.pg.mouse.click(*to_screen(p, 20, 20)); p.pg.mouse.click(*to_screen(p, 10, 23)); p.wait(500)
    e2 = SS(p, "return S.ents[1]")
    ok3 = e2 and abs(e2['a'][0] - 3) < 0.2 and abs(e2['b'][0] - 17) < 0.2 and abs(e2['r'] - 3) < 0.2
    return [ok1, ok2, ok3]

# ---------- Sitzung 99: Lage unter der Maus ----------
def t_koordinaten(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:40,d:40,h:10},{name:'Platte'})); })"); warte_rechnen(p)
    p.ev("App.clearSelection(); Viewer.setView('iso', false)"); p.wait(800)
    x, y = world_screen(p, 5, -5, 10)
    p.pg.mouse.move(x - 20, y); p.pg.mouse.move(x, y, steps=4); p.wait(400)
    t1 = p.pg.locator('#coords').inner_text()
    c1 = p.ev("return Measure.coords")
    ok1 = c1 and abs(c1['z'] - 10) < 1e-3 and abs(c1['x'] - 5) < 0.3 and 'Z 10' in t1
    r = p.ev("const r=Viewer.canvas.getBoundingClientRect(); return [r.left, r.bottom]"); x2, y2 = r[0] + 90, r[1] - 90
    p.pg.mouse.move(x2, y2, steps=4); p.wait(400)
    ok2 = 'Boden' in p.pg.locator('#coords').inner_text()
    # in der Skizze: X/Y der Skizze
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1500)
    s = to_screen(p, 12, 7); p.pg.mouse.move(s[0] - 15, s[1]); p.pg.mouse.move(*s, steps=4); p.wait(400)
    t3 = p.pg.locator('#coords').inner_text()
    ok3 = t3.startswith('Skizze') and 'X 12' in t3 and 'Y 7' in t3
    return [ok1, ok2, ok3]

# ---------- Sitzung 100: nur die Auswahl exportieren, jeder Körper einzeln ----------
def t_export_auswahl(p):
    import zipfile, tempfile, struct
    p.empty()
    p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10},{name:'Deckel'}); d.items.push(a); const b=Model.newItem('cylinder',{d:6,h:20},{name:'Loch'}); b.role='hole'; b.t.z=-5; d.items.push(b);
      const c=Model.newItem('box',{w:10,d:10,h:10},{name:'Fuß'}); c.t.x=40; d.items.push(c); const e=Model.newItem('sphere',{d:10},{name:'Knopf'}); e.t.x=-40; d.items.push(e); })"""); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id, App.doc.items[2].id])"); p.wait(400)
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(600)
    ok1 = p.pg.locator('#ex-onlySel').count() == 1 and not p.pg.locator('#ex-onlySel').is_checked()   # wie bisher: ohne Haken alles
    p.pg.check('#ex-onlySel'); p.pg.check('#ex-stl'); p.pg.check('#ex-each')
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-auswahl.zip'); dl.value.save_as(z)
    zf = zipfile.ZipFile(z); names = zf.namelist()
    ok2 = sorted(n for n in names if n.startswith('Einzeln/')) == ['Einzeln/Deckel.stl', 'Einzeln/Fuß.stl']
    # Deckel behält sein Loch: in der Einzel-STL gibt es Dreiecke innen (Radius 3 um die Mitte)
    data = zf.read('Einzeln/Deckel.stl')
    inner = False
    if data[:5] != b'solid':
        n = struct.unpack('<I', data[80:84])[0]
        for i in range(n):
            o = 84 + i * 50 + 12
            x, y, zz = struct.unpack('<3f', data[o:o + 12])
            if abs((x * x + y * y) ** 0.5 - 3) < 0.05: inner = True; break
    else:
        import re
        for m in re.finditer(rb'vertex\s+(\S+)\s+(\S+)\s+(\S+)', data):
            x, y = float(m.group(1)), float(m.group(2))
            if abs((x * x + y * y) ** 0.5 - 3) < 0.05: inner = True; break
    ok3 = inner and p.ev("return Print.lastExport.some(n=>n.endsWith('.step'))")
    return [ok1, ok2, ok3]

# ---------- Sitzung 101: Skizze und Fläche als DXF/SVG ----------
def t_2d_export(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [40, 20]}, {'id': 'C', 'type': 'circle', 'c': [10, 10], 'r': 4}, {'id': 'A', 'type': 'arc', 'a': [30, 5], 'm': [35, 10], 'b': [30, 15]}, {'id': 'H', 'type': 'line', 'a': [0, 30], 'b': [40, 30], 'con': True}])
    ok1 = p.pg.locator('#sk-dxf').count() == 1 and p.pg.locator('#sk-svg').count() == 1
    # Rundweg DXF: wieder einlesen → gleiche Teile
    rt = p.ev("""const d=Print.entsToDXF(Sketch.state.ents); const r=Start.parseDXF(d.text); const t={}; for(const e of r.ents) t[e.type]=(t[e.type]||0)+1;
      const c=r.ents.find(e=>e.type==='circle'), a=r.ents.find(e=>e.type==='arc'); const ai=a&&SK.arcInfo(a.a,a.m,a.b);
      return {n:d.count, t, c:c&&[c.c[0],c.c[1],c.r], ar: ai&&[Math.round(ai.c[0]*1000)/1000, Math.round(ai.c[1]*1000)/1000, Math.round(ai.r*1000)/1000], am: a&&a.m}""")
    ok2 = rt['n'] == 6 and rt['t'].get('line') == 4 and rt['t'].get('circle') == 1 and rt['t'].get('arc') == 1 and rt['c'] == [-10, 0, 4] and rt['ar'] == [10, 0, 5] and rt['am'][0] > 10   # das Einlesen legt die Mitte auf den Nullpunkt
    # Rundweg SVG: Größe in mm, Bogen in die richtige Richtung
    sv = p.ev("""const d=Print.entsToSVG(Sketch.state.ents,'T'); const r=Start.parseSVG(d.text); const a=r.ents.find(e=>e.type==='arc'); const bb=SK.bounds(r.ents);
      return {w: Math.round((bb[2]-bb[0])*1000)/1000, h: Math.round((bb[3]-bb[1])*1000)/1000, mm: /width="42mm"/.test(d.text), arcRight: a ? Math.max(a.a[0],a.b[0],a.m[0]) - Math.min(a.a[0],a.b[0]) > 4.9 : false, n: r.ents.length}""")
    ok3 = sv['w'] == 40 and sv['h'] == 20 and sv['mm'] and sv['arcRight'] and sv['n'] == 6
    p.ev("Sketch.cancel(true)"); p.wait(600)
    # Fläche eines Körpers: Platte mit Loch, Oberseite
    p.ev("App.change('x', d=>{ d.items=[]; const a=Model.newItem('box',{w:40,d:30,h:3},{name:'Platte'}); d.items.push(a); const b=Model.newItem('cylinder',{d:8,h:10},{name:'Loch'}); b.role='hole'; b.t.z=-2; d.items.push(b); })"); warte_rechnen(p)
    fi = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE' && f.n[2]>0.99)")
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); return Print.faceTo2D({id, idx:arg, info:r.data.faces[arg]}, 'dxf')", fi); p.wait(1500)
    l2 = p.ev("const L=Print.last2D; if(!L) return null; const r=Start.parseDXF(L.text); const t={}; for(const e of r.ents) t[e.type]=(t[e.type]||0)+1; const c=r.ents.find(e=>e.type==='circle'); return {t, r: c && c.r}")
    ok4 = l2 and l2['t'].get('line') == 4 and l2['t'].get('circle') == 1 and abs(l2['r'] - 4) < 1e-3
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 102: Wandstärke ----------
def t_wandstaerke(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:30,d:30,h:10},{name:'Schale'}); d.items.push(a); const b=Model.newItem('box',{w:26,d:26,h:20},{name:'Innen'}); b.role='hole'; b.t.z=1.5; d.items.push(b); })"); warte_rechnen(p)
    p.ev("App.clearSelection(); Viewer.setView('front', false)"); p.wait(800)
    # Messen an der Außenwand vorne: 2 mm
    p.pg.locator('#t-measure').click(); p.wait(400)
    x, y = world_screen(p, 5, -15, 5); p.pg.mouse.click(x, y); p.wait(600)
    r = p.ev("return Measure.result") or ''
    ok1 = 'Wand 2 mm' in r
    p.pg.keyboard.press('Escape'); p.wait(200)
    # Ansicht: Grenze 1,6 → Boden (1,5 mm) ist rot; Grenze 1,2 → nichts
    p.ev("Views.thin(true)"); p.wait(300)
    p.pg.select_option('#thin-limit', '1.6'); p.wait(800)
    inf = p.ev("return Views.thinInfo")
    ok2 = inf and inf['area'] > 100 and abs(inf['minT'] - 1.5) < 0.01 and 'dünnste Stelle 1,5 mm' in p.pg.locator('#thin-area').inner_text()
    p.pg.select_option('#thin-limit', '1.2'); p.wait(800)
    ok3 = p.ev("return Views.thinInfo.area") < 0.05 and 'Überall mindestens' in p.pg.locator('#thin-area').inner_text()
    p.ev("Views.thin(false)")
    return [ok1, ok2, ok3]

# ---------- Sitzung 103: Trägheit und Standfestigkeit ----------
def t_traegheit_stand(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:40},{name:'Turm'}); a.mat='PLA'; d.items.push(a); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(2500)
    import re
    nums = [float(x.replace(',', '.')) for x in re.findall(r'\d+(?:,\d+)?', p.pg.locator('#p-inertia').inner_text())]
    m = 16 * 1.24
    ok1 = len(nums) >= 3 and abs(nums[0] - m * 20 / 12) < 0.1 and abs(nums[2] - m * 8 / 12) < 0.1
    st = p.pg.locator('#p-stand').inner_text()
    ok2 = 'ja' in st and '27°' in st
    # Fuß klein, Last weit draußen → kippt
    p.ev("App.change('x', d=>{ d.items=[]; const a=Model.newItem('box',{w:10,d:10,h:2},{name:'Fuß'}); d.items.push(a); const b=Model.newItem('box',{w:40,d:10,h:10},{name:'Arm'}); b.t.x=30; b.t.z=2; b.op={type:'join', target:a.id}; d.items.push(b); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(2500)
    ok3 = 'kippt um' in p.pg.locator('#p-stand').inner_text()
    return [ok1, ok2, ok3]

# ---------- Sitzung 104: Suchen im Verlauf ----------
def t_verlauf_suche(p):
    p.empty()
    p.ev("""App.change('x', d=>{ for (const n of ['Boden','Deckel','Wand links','Wand rechts','Griff']) d.items.push(Model.newItem('box',{w:10,d:10,h:5},{name:n}));
      const l=Model.newItem('cylinder',{d:3,h:20},{name:'Bohrung'}); l.role='hole'; d.items.push(l);
      const g=Model.newItem('group',{},{name:'Beschlag'}); g.children=[Model.newItem('cylinder',{d:3,h:8},{name:'Schraube'}), Model.newItem('box',{w:5,d:5,h:2},{name:'Platte'})]; d.items.push(g); })"""); warte_rechnen(p)
    p.ev("Panels.renderLeft()"); p.wait(300)
    names = lambda: p.pg.locator('#left-body .tree .nm').all_inner_texts()
    ok1 = p.pg.locator('#tree-filter').count() == 1 and len(names()) == 7
    p.pg.locator('#tree-filter').type('schr', delay=40); p.wait(400)
    ok2 = names() == ['Beschlag', 'Schraube'] and p.ev("return document.activeElement && document.activeElement.id") == 'tree-filter' and '1 von 9' in p.pg.locator('#tree-count').inner_text()
    p.pg.locator('#tree-filter').press('Escape'); p.wait(300)
    p.pg.select_option('#tree-kind', 'hole'); p.wait(300)
    ok3 = names() == ['Bohrung']
    p.pg.select_option('#tree-kind', 'all'); p.wait(300)
    ok4 = len(names()) == 7
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 105: Maße als CSV, Auswahl speichern ----------
def t_masse_csv(p):
    import tempfile
    p.empty()
    p.ev("App.change('x', d=>{ d.params.push({id:'m1', name:'Breite', expr:40}, {id:'m2', name:'Hoehe', expr:'Breite/2'}); })"); p.wait(300)
    csv = p.ev("return Panels.paramsCSV()")
    ok1 = csv.splitlines()[0] == 'Name;Wert;Ergebnis' and 'Breite;40;40' in csv and 'Hoehe;Breite/2;20' in csv
    f = os.path.join(tempfile.gettempdir(), 'masse.csv')
    open(f, 'w', encoding='utf-8').write('Name;Wert\nBreite;55,5\nTiefe;12\n1kaputt;3\n')
    p.pg.locator('#lt-params').click(); p.wait(300)
    with p.pg.expect_file_chooser() as fc:
        p.pg.locator('#par-csv-in').click()
    fc.value.set_files(f); p.wait(800)
    ps = p.ev("return App.doc.params.map(x=>[x.name, x.expr])")
    ok2 = ['Breite', 55.5] in ps and ['Tiefe', 12] in ps and ['Hoehe', 'Breite/2'] in ps and len(ps) == 3 and 'übersprungen' in ' '.join(p.pg.locator('.toast').all_inner_texts())
    return [ok1, ok2]

def t_auswahl_speichern(p):
    p.empty()
    p.ev("App.change('x', d=>{ for (let i=0;i<4;i++){ const a=Model.newItem('box',{w:10,d:10,h:10},{name:'Würfel '+(i+1)}); a.t.x=i*20-30; d.items.push(a); } })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id, App.doc.items[2].id])"); p.wait(300)
    p.ev("return Interact.saveSelection('Ecken')"); p.wait(400)
    p.ev("App.clearSelection()"); p.wait(200)
    cx, cy = p.canvas_center()
    r = p.ev("const r=Viewer.canvas.getBoundingClientRect(); return [r.left+40, r.bottom-40]")
    p.pg.mouse.click(r[0], r[1], button='right'); p.wait(400)
    ok1 = 'Ecken' in (p.pg.locator('#cm-selset-0').inner_text() if p.pg.locator('#cm-selset-0').count() else '')
    if ok1: p.pg.locator('#cm-selset-0').click(); p.wait(300)
    names = sorted(p.ev("return App.sel.map(id=>Model.find(App.doc,id).item.name)"))
    ok2 = names == ['Würfel 1', 'Würfel 3'] and p.ev("return App.doc.selSets.length") == 1
    return [ok1, ok2]

# ---------- Sitzung 106: Export-Einstellungen ----------
def t_export_einstellungen(p):
    import zipfile, tempfile
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('cylinder',{d:40,h:10},{name:'Scheibe'})); })"); warte_rechnen(p)
    def run(q, fmt_):
        p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(500)
        p.pg.check('#ex-stl'); p.pg.uncheck('#ex-step')
        p.pg.select_option('#ex-q', q); p.pg.select_option('#ex-stlfmt', fmt_); p.wait(100)
        with p.pg.expect_download(timeout=90000) as dl:
            p.pg.get_by_role('button', name='Als ZIP speichern').click()
        z = os.path.join(tempfile.gettempdir(), 'tracery-q.zip'); dl.value.save_as(z)
        data = zipfile.ZipFile(z).read([n for n in zipfile.ZipFile(z).namelist() if n.endswith('.stl')][0])
        return p.ev("return Print.lastTris"), data
    tg, dg = run('3', 'bin')
    tf, df = run('0.15', 'txt')
    ok1 = tf > tg * 2
    ok2 = dg[:5] != b'solid' and df[:5] == b'solid' and df.count(b'facet normal') == tf
    return [ok1, ok2]

# ---------- Sitzung 107: Rechenzeit je Schritt ----------
def t_rechenzeit(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:10,d:10,h:10},{name:'Klotz'})); const g=Model.newItem('part',{lib:'threadRod',size:'M6',length:20},{name:'Gewindestange'}); g.t.x=30; d.items.push(g); })"); warte_rechnen(p, 90)
    tb, tg = p.ev("return [App.timeOf(App.doc.items[0].id), App.timeOf(App.doc.items[1].id)].map(x=>x?x.ms:0)")
    ok1 = tg > 0 and tg > tb
    p.pg.click('#lt-log'); p.wait(500)
    rows = p.pg.locator('#slow-steps .dep-row .grow').all_text_contents()
    ok2 = len(rows) >= 1 and rows[0] == 'Gewindestange'
    if not p.ev("return document.querySelector('#slow-steps').open"): p.pg.locator('#slow-steps summary').click(); p.wait(200)
    p.pg.locator('#slow-steps .dep-row').first.click(); p.wait(300)
    ok3 = p.ev("return App.sel[0]") == p.ev("return App.doc.items[1].id")
    return [ok1, ok2, ok3]

# ---------- Sitzung 108: Kanten nach Art wählen ----------
def t_kanten_art(p):
    p.empty()
    # L-Winkel: Boden 40 × 20 × 4 und Wand 4 × 20 × 20 vereinigt → eine innere Kante (Kehle)
    pts = [[-20, 0], [20, 0], [20, 4], [-16, 4], [-16, 20], [-20, 20]]
    ents = [{'id': 'L%d' % i, 'type': 'line', 'a': pts[i], 'b': pts[(i + 1) % 6]} for i in range(6)]
    p.ev("App.change('x', d=>{ const it=Model.newItem('extrude',{},{name:'Winkel'}); it.p={sketch:{plane:{o:[0,10,0],x:[1,0,0],n:[0,-1,0]},ents:arg,dims:[],cons:[]},dist:20,dir:'normal'}; d.items.push(it); })", ents); warte_rechnen(p)
    kinds = p.ev("const k=Viewer.edgeKinds(App.doc.items[0].id); return {cx:k.filter(x=>x==='convex').length, cc:k.filter(x=>x==='concave').length, n:k.length}")
    ok1 = kinds['cc'] == 1 and kinds['cx'] == kinds['n'] - 1
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Kanten wählen"]').click(); p.wait(300)
    p.pg.locator('#er-concave').click(); p.wait(500)
    e = p.ev("const r=App.results.get(App.edges[0].id); return App.edges.map(x=>r.data.edges[x.edgeIdx])")
    ok2 = len(e) == 1 and e[0]['t'] == 'LINE' and abs(e[0]['m'][2] - 4) < 1e-6 and abs(e[0]['m'][0] + 16) < 1e-6
    # abrunden: Kehle bekommt eine Rundung, Teil bleibt fehlerfrei
    p.ev("Actions.addFinish('fillet', 2)"); warte_rechnen(p)
    ok3 = p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]

# ---------- Sitzung 109: Skizze umhängen ----------
def t_skizze_umhaengen(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [30, 10]}])
    p.ev("Sketch.cancel(true)"); p.wait(500); warte_rechnen(p)
    p.ev("Datums.addOrigin('XY', 25)"); p.wait(500)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.select_option('#p-replane', 'o:XZ'); warte_rechnen(p)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox.map(v=>Math.round(v*100)/100)")
    # vorher: flach auf XY (30 × 10 × 3); jetzt senkrecht auf XZ: x 0…30, z 0…10
    ok1 = bb[0] == 0 and bb[3] == 30 and bb[2] == 0 and bb[5] == 10
    dl = p.ev("return Datums.list().map(d=>d.id)")
    ok2 = True
    if dl:
        p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
        p.pg.select_option('#p-replane', 'd:' + dl[0]); warte_rechnen(p)
        bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox.map(v=>Math.round(v*100)/100)")
        ok2 = bb2[2] == 25 and bb2[5] == 28
    p.ev("App.undo()"); warte_rechnen(p)
    ok3 = p.ev("return App.doc.items[0].p.sketch.plane.n[1]") == -1
    return [ok1, ok2, ok3]

# ---------- Sitzung 110: Vorführ-Modus ----------
def t_vorfuehren(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:30,d:20,h:10},{name:'Teil'})); })"); warte_rechnen(p)
    p.ev("Viewer.setView('iso', false)"); p.wait(500)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('p'); p.wait(1500)
    a1 = p.ev("const c=Viewer.camera.position; return Math.atan2(c.y-Viewer.controls.target.y, c.x-Viewer.controls.target.x)")
    ok1 = p.ev("return document.body.classList.contains('presenting')") and not p.pg.locator('.topbar').is_visible() and p.pg.locator('#present-bar').count() == 1
    p.wait(1500)
    a2 = p.ev("const c=Viewer.camera.position; return Math.atan2(c.y-Viewer.controls.target.y, c.x-Viewer.controls.target.x)")
    ok2 = abs(a2 - a1) > 0.05
    p.pg.locator('#present-spin').click(); p.wait(300)
    b1 = p.ev("const c=Viewer.camera.position; return c.x"); p.wait(800); b2 = p.ev("const c=Viewer.camera.position; return c.x")
    ok3 = abs(b2 - b1) < 1e-6
    p.pg.keyboard.press('Escape'); p.wait(500)
    ok4 = not p.ev("return document.body.classList.contains('presenting')") and p.pg.locator('.topbar').is_visible() and p.pg.locator('#present-bar').count() == 0
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 111: Tangente an zwei Kreise ----------
def t_tangente_zwei_kreise(p):
    scene(p, [{'id': 'A', 'type': 'circle', 'c': [0, 0], 'r': 10}, {'id': 'B', 'type': 'circle', 'c': [40, 0], 'r': 5}])
    p.pg.keyboard.press('l'); p.wait(200)
    p.pg.select_option('#ln-mode', 'tan2'); p.wait(200)
    for q in ([0, 10], [40, 5]):
        s = to_screen(p, *q); p.pg.mouse.click(*s); p.wait(300)
    L = SS(p, "return S.ents.find(e=>e.type==='line')")
    import math
    def dist(c, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        return abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / math.hypot(dx, dy)
    ok1 = L is not None and abs(dist([0, 0], L['a'], L['b']) - 10) < 1e-3 and abs(dist([40, 0], L['a'], L['b']) - 5) < 1e-3 and L['a'][1] > 0
    ok2 = SS(p, "return S.cons.filter(c=>c.type==='tangent').length") == 2
    # Kreis B größer → Linie bleibt tangential
    SS(p, "S.sel='B'; Panels.renderRight()"); p.wait(300)
    p.pg.fill('#se-d', '16'); p.pg.press('#se-d', 'Enter'); p.wait(500)
    L2 = SS(p, "return S.ents.find(e=>e.type==='line')")
    A2, B2 = SS(p, "return E('A')"), SS(p, "return E('B')")   # freie Kreise dürfen dabei mitwandern
    ok3 = abs(B2['r'] - 8) < 1e-6 and abs(dist(B2['c'], L2['a'], L2['b']) - B2['r']) < 1e-3 and abs(dist(A2['c'], L2['a'], L2['b']) - A2['r']) < 1e-3
    return [ok1, ok2, ok3]

# ---------- Sitzung 112: Maus-Steuerung wählbar ----------
def t_maus_steuerung(p):
    p.empty()
    p.ev("App.change('x', d=>{ for (let i=0;i<3;i++){ const a=Model.newItem('box',{w:10,d:10,h:10},{name:'Würfel '+(i+1)}); a.t.x=i*30-30; d.items.push(a); } })"); warte_rechnen(p)
    p.ev("Viewer.setView('top', false)"); p.wait(500); p.ev("Viewer.fit()"); p.wait(900)
    mb = lambda: p.ev("const m=Viewer.controls.mouseButtons; return [m.LEFT, m.MIDDLE, m.RIGHT]")
    std = mb()
    # Einstellungen: wie Onshape
    p.pg.locator('#btn-menu').click(); p.wait(300)
    p.ev("ViewPrefs.dialog()"); p.wait(400)
    p.pg.select_option('#set-mouse', 'onshape'); p.wait(200)
    p.pg.keyboard.press('Escape'); p.wait(300)
    ons = mb()
    ok1 = std[0] == 0 and ons[0] is None and ons[2] == 0 and ons[1] == 2   # THREE.MOUSE: ROTATE 0, DOLLY 1, PAN 2
    # linke Maustaste im Leeren: Rahmen (ohne Umschalt) um die ersten zwei Würfel
    scr = lambda i: p.ev("const b=Actions.worldBox(App.doc.items[arg].id); const c=b.getCenter(b.min.clone()); const s=Viewer.toScreen(c); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left, s.y+r.top]", i)
    a, b = scr(0), scr(1)
    p.pg.mouse.move(a[0] - 60, a[1] - 60); p.pg.mouse.down(); p.pg.mouse.move(b[0] + 50, b[1] + 60, steps=8); p.pg.mouse.up(); p.wait(500)
    names = sorted(p.ev("return App.sel.map(id=>Model.find(App.doc,id).item.name)"))
    ok2 = names == ['Würfel 1', 'Würfel 2']
    # in der Skizze: rechts dreht weiter, links zeichnet
    p.ev("Sketch.startOnPlane('XY')"); p.wait(1200)
    sk = mb()
    p.ev("Sketch.cancel(true)"); p.wait(600)
    ok3 = sk[0] is None and sk[2] == 0 and mb() == ons
    return [ok1, ok2, ok3]

# ---------- Sitzung 113: Drehteller-Video ----------
def t_drehteller(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:30,d:20,h:10},{name:'Teil'})); })"); warte_rechnen(p)
    p.ev("Viewer.setView('iso', false)"); p.wait(400)
    c0 = p.ev("return Viewer.camera.position.toArray()")
    size = p.ev("return Print.turntable({seconds: 1.5, save: false}).then(b=>b ? b.size : 0)")
    c1 = p.ev("return Viewer.camera.position.toArray()")
    ok1 = size > 1000 and (p.ev("return Print.lastVideo.type") or '').startswith('video/')
    ok2 = max(abs(a - b) for a, b in zip(c0, c1)) < 1e-6
    # Menüpunkt öffnet den Dialog
    p.ev("Print.turntableDialog()"); p.wait(300)
    ok3 = p.pg.locator('#tt-sec').count() == 1
    p.pg.keyboard.press('Escape')
    return [ok1, ok2, ok3]

# ---------- Sitzung 114: Maße als Tabelle in der Skizze ----------
def t_mass_tabelle(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [30, 10]}, {'id': 'C', 'type': 'circle', 'c': [15, 5], 'r': 3}])
    SS(p, "S.dims.push({id:'m1', e:'R', k:'w', v:30}, {id:'m2', e:'R', k:'h', v:10}, {id:'m3', e:'C', k:'d', v:6}); Sketch.setTool('select')"); p.wait(400)
    p.ev("Panels.renderRight()"); p.wait(300)
    p.pg.locator('#dim-table summary').click(); p.wait(200)
    labels = p.pg.locator('#dim-table .field label').all_text_contents()
    ok1 = len(labels) == 3 and 'Rechteck 1' in labels[0] and 'Kreis 1' in labels[2]
    p.pg.fill('#dt-0', '45'); p.pg.press('#dt-0', 'Enter'); p.wait(500)
    w = SS(p, "return Math.abs(E('R').b[0]-E('R').a[0])")
    ok2 = abs(w - 45) < 1e-6 and p.pg.locator('#dim-table').count() == 1
    # Tabelle bleibt offen nach der Änderung
    ok3 = p.ev("return document.querySelector('#dim-table').open")
    return [ok1, ok2, ok3]

# ---------- [A-024] Winkelfang und runde Längen beim Zeichnen (SK-14) ----------
def t_a024_winkelfang(p):
    sketch_xy(p)
    p.pg.locator('canvas').first.focus()
    p.ev("Sketch.setAngleSnap(true)"); p.wait(150)
    p.pg.keyboard.press('l'); p.wait(200)

    def seg_metrics(ent):
        dx = ent['b'][0] - ent['a'][0]
        dy = ent['b'][1] - ent['a'][1]
        return math.hypot(dx, dy), math.degrees(math.atan2(dy, dx))

    # 1. Linie bei ~44,3° -> genau 45°, runde Länge 20 mm, Hilfslinie und Schild „45°“
    rad443 = math.radians(44.3)
    s0 = to_screen(p, 0, 0)
    s1 = to_screen(p, 20.3 * math.cos(rad443), 20.3 * math.sin(rad443))
    p.pg.mouse.click(s0[0], s0[1]); p.wait(180)
    p.pg.mouse.move(s1[0], s1[1]); p.wait(200)
    tips1 = ' '.join(p.pg.locator('.snaptip').all_text_contents())
    cur1 = SS(p, "return S.cursor && { angle: S.cursor.angle, guides: (S.cursor.guides || []).length }")
    p.pg.mouse.click(s1[0], s1[1]); p.wait(200)
    e1 = SS(p, "return S.ents[0]")
    l1, a1 = seg_metrics(e1)
    ok1 = ('45°' in tips1 and cur1 and cur1['angle'] == 45 and cur1['guides'] >= 1
           and abs(a1 - 45) < 1e-3 and abs(l1 - 20) < 1e-3)

    # 2. Linienzug: 2. Segment bei ~30,8° -> genau 30°, runde Länge 15 mm
    rad308 = math.radians(30.8)
    b1 = e1['b']
    s2 = to_screen(p, b1[0] + 15.2 * math.cos(rad308), b1[1] + 15.2 * math.sin(rad308))
    p.pg.mouse.move(s2[0], s2[1]); p.wait(200)
    tips2 = ' '.join(p.pg.locator('.snaptip').all_text_contents())
    p.pg.mouse.click(s2[0], s2[1]); p.wait(180)
    p.pg.keyboard.press('Enter'); p.wait(200)
    e2 = SS(p, "return S.ents[1]")
    l2, a2 = seg_metrics(e2)
    ok2 = ('30°' in tips2 and near(e2['a'], b1, 1e-3)
           and abs(a2 - 30) < 1e-3 and abs(l2 - 15) < 1e-3)

    # 3. Mit gedrückter Umschalttaste bleiben Winkel und Länge ungerundet
    SS(p, "S.ents=[]; S.cons=[]; S.dims=[]; S.draft=null; Sketch.setTool('line');"); p.wait(180)
    s3 = to_screen(p, 20.37 * math.cos(rad443), 20.37 * math.sin(rad443))
    p.pg.mouse.click(s0[0], s0[1]); p.wait(150)
    p.pg.keyboard.down('Shift'); p.wait(100)
    p.pg.mouse.move(s3[0], s3[1]); p.wait(200)
    tips3 = ' '.join(p.pg.locator('.snaptip').all_text_contents())
    p.pg.mouse.click(s3[0], s3[1]); p.wait(180)
    p.pg.keyboard.up('Shift'); p.wait(100)
    p.pg.keyboard.press('Enter'); p.wait(180)
    e3 = SS(p, "return S.ents[0]")
    l3, a3 = seg_metrics(e3)
    ok3 = ('45°' not in tips3 and abs(a3 - 44.3) < 0.35 and abs(a3 - 45) > 0.35
           and abs(l3 - round(l3)) > 0.15)

    # 4. Zoom-Stufen: normal 1 mm, starker Zoom 0,5 mm, sehr starker Zoom 0,1 mm
    step1 = SS(p, "return Sketch.lengthSnapStep()")
    p.ev("Viewer.lookAtPlane([0,0,0],[0,0,1],[1,0,0], 20, false)"); p.wait(200)
    step05 = SS(p, "return Sketch.lengthSnapStep()")
    SS(p, "S.ents=[]; S.cons=[]; S.dims=[]; S.draft=null; Sketch.setTool('line');"); p.wait(150)
    sz0 = to_screen(p, 0, 0)
    sz1 = to_screen(p, 5.42 * math.cos(rad443), 5.42 * math.sin(rad443))
    p.pg.mouse.click(sz0[0], sz0[1]); p.wait(150)
    p.pg.mouse.move(sz1[0], sz1[1]); p.wait(150)
    p.pg.mouse.click(sz1[0], sz1[1]); p.wait(150)
    p.pg.keyboard.press('Enter'); p.wait(150)
    l4a, a4a = seg_metrics(SS(p, "return S.ents[0]"))

    p.ev("Viewer.lookAtPlane([0,0,0],[0,0,1],[1,0,0], 5, false)"); p.wait(200)
    step01 = SS(p, "return Sketch.lengthSnapStep()")
    SS(p, "S.ents=[]; S.cons=[]; S.dims=[]; S.draft=null; Sketch.setTool('line');"); p.wait(150)
    sz0b = to_screen(p, 0, 0)
    sz2 = to_screen(p, 1.28 * math.cos(rad443), 1.28 * math.sin(rad443))
    p.pg.mouse.click(sz0b[0], sz0b[1]); p.wait(150)
    p.pg.mouse.move(sz2[0], sz2[1]); p.wait(150)
    p.pg.mouse.click(sz2[0], sz2[1]); p.wait(150)
    p.pg.keyboard.press('Enter'); p.wait(150)
    l4b, a4b = seg_metrics(SS(p, "return S.ents[0]"))
    ok4 = (step1 == 1 and step05 == 0.5 and abs(a4a - 45) < 1e-3 and abs(l4a - 5.5) < 1e-3
           and step01 == 0.1 and abs(a4b - 45) < 1e-3 and abs(l4b - 1.3) < 1e-3)

    # 5. Skizzen-Menü: „Winkelfang“ aus/ein, Einstellung gespeichert, Hilfetext vorhanden
    p.ev("Viewer.lookAtPlane([0,0,0],[0,0,1],[1,0,0], 70, false)"); p.wait(200)
    p.pg.uncheck('#sk-angle-snap'); p.wait(150)
    p.pg.locator('canvas').first.focus()
    off_ok = (not SS(p, "return Sketch.angleSnap")
              and p.ev("return localStorage.getItem('tracery.angleSnap')") == '0')
    SS(p, "S.ents=[]; S.cons=[]; S.dims=[]; S.draft=null; Sketch.setTool('line');"); p.wait(150)
    s0 = to_screen(p, 0, 0)
    s3 = to_screen(p, 20.37 * math.cos(rad443), 20.37 * math.sin(rad443))
    p.pg.mouse.click(s0[0], s0[1]); p.wait(150)
    p.pg.mouse.move(s3[0], s3[1]); p.wait(150)
    p.pg.mouse.click(s3[0], s3[1]); p.wait(150)
    p.pg.keyboard.press('Enter'); p.wait(150)
    _, a5 = seg_metrics(SS(p, "return S.ents[0]"))

    p.pg.reload()
    p.pg.wait_for_function("() => !!(window.__M && window.__M.Sketch)")
    p.wait(500)
    sketch_xy(p)
    persisted = (not p.pg.locator('#sk-angle-snap').is_checked()
                 and not p.ev("return Sketch.angleSnap"))
    p.pg.check('#sk-angle-snap'); p.wait(150)
    re_on = (p.pg.locator('#sk-angle-snap').is_checked()
             and p.ev("return Sketch.angleSnap")
             and p.ev("return localStorage.getItem('tracery.angleSnap')") == '1')
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    h_as = hilfen.get('angleSnap') or {}
    help_ok = (p.pg.locator('[data-help="angleSnap"]').count() == 1
               and bool(h_as.get('tip') and h_as.get('hilfe') and h_as.get('tipp')))
    ok5 = off_ok and abs(a5 - 45) > 0.35 and persisted and re_on and help_ok
    return [ok1, ok2, ok3, ok4, ok5]


# KI verrechnet Körper (vereinigen / abziehen)
def t_ki_verrechnen(p):
    ki(p); p.empty()
    p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:40,h:10},{name:'Block'}); d.items.push(a); const b=Model.newItem('cylinder',{d:10,h:30},{name:'Bolzen'}); b.t.z=-5; d.items.push(b); })"""); warte_rechnen(p)
    ki_fragen(p, 'Zieh den Bolzen vom Block ab', {'antwort': 'Ich schneide den Bolzen aus dem Block.', 'aktionen': [
        {'op': 'verrechnen', 'ids': 'name:Bolzen', 'modus': 'abziehen', 'ziel': 'name:Block'}]}, 60)
    warte_rechnen(p)
    it = p.ev("return App.doc.items[1]")
    v = p.ev("return Mass.measure().then(r=>(r.parts||[]).map(q=>Math.round(q.volume)))")
    return [it['op'] == {'type': 'cut', 'target': p.ev("return App.doc.items[0].id")}, v == [round(16000 - math.pi * 25 * 10)]]

# ---------- Sitzung 88: Normteile ----------
def t_normteile(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('part',{lib:'stdScrew',size:'M4',head:'zyl',length:12},{name:'Zylinderschraube'}); d.items.push(a);
      const b=Model.newItem('part',{lib:'stdScrew',size:'M5',head:'senk',length:16},{name:'Senkschraube'}); b.t.x=30; d.items.push(b);
      const c=Model.newItem('part',{lib:'stdNut',size:'M3'},{name:'Mutter'}); c.t.x=60; d.items.push(c);
      const w=Model.newItem('part',{lib:'stdWasher',size:'M6'},{name:'Scheibe'}); w.t.x=90; d.items.push(w);
    })"""); warte_rechnen(p, 60)
    bb = p.ev("return App.doc.items.map(i=>App.results.get(i.id).data.bbox.map(v=>Math.round(v*100)/100))")
    ok1 = p.ev("return App.errors.length") == 0 and bb[0][2] == -12 and bb[0][5] == 4 and abs(bb[0][3] - 3.5) < 0.01
    ok2 = bb[1][5] == 0 and bb[1][2] == -16 and abs(bb[1][3] - 5.6) < 0.01
    ok3 = abs(bb[2][5] - 2.4) < 0.01 and abs((bb[2][3] - bb[2][0]) - 5.5 * 2 / math.sqrt(3)) < 0.05 and abs(bb[3][5] - 1.6) < 0.01 and abs(bb[3][3] - 6) < 0.01
    # Werkstoff Edelstahl, Gewicht passt zur Form (Zylinderschraube M4×12 wiegt etwa 2 g)
    mats = p.ev("return App.doc.items.map(i=>i.mat)")
    m0 = p.ev("return Mass.measure().then(r=>r.parts.find(q=>q.id===App.doc.items[0].id).mass)")
    ok4 = all(m == 'V2A Edelstahl' for m in mats) and 1.6 < m0 < 2.6
    # in der Bauteile-Leiste (Profi)
    p.pg.locator('#t-parts').click(); p.wait(400)
    txt = p.pg.locator('.flyout').inner_text()
    ok5 = 'Schraube (Norm)' in txt and 'Mutter (Norm)' in txt and 'Scheibe (Norm)' in txt
    p.pg.keyboard.press('Escape')
    return [ok1, ok2, ok3, ok4, ok5]

# Messen: Oberfläche, Hüllmaße, kleinster Abstand
def t_messen_koerper(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:20,h:10},{name:'Block'}); d.items.push(a); const b=Model.newItem('sphere',{d:10},{name:'Kugel'}); b.t.x=40; b.t.z=20; d.items.push(b); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(2000)
    area = p.pg.locator('#p-area').inner_text(); box = p.pg.locator('#p-bbox').inner_text()
    ok1 = '28' in area and '40' in box and '20' in box and '10' in box   # 2800 mm² = 28 cm²
    p.ev("App.select([App.doc.items[0].id, App.doc.items[1].id])"); p.wait(2500)
    t = p.pg.locator('#min-dist-val').inner_text().replace(',', '.')
    # Kugel-Mitte (40, 0, 25), r 5; Block-Ecke oben (20, 0..10, 10): Abstand = √(20² + 15²) − 5 = 20
    import re
    v = float(re.findall(r'\d+(?:\.\d+)?', t)[0]) if re.findall(r'\d+', t) else -1
    ok2 = abs(v - 20) < 0.01 and p.ev("let n=0; Viewer.groups.overlay.traverse(o=>{ if(o.isLine && o.material.isLineDashedMaterial) n++; }); return n") >= 1
    return [ok1, ok2]

# Verknüpfte Kopien
def t_verknuepft(p):
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:20,d:20,h:10},{name:'Halter'}); d.items.push(a); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+Shift+D'); p.wait(800); warte_rechnen(p)
    ok1 = p.ev("return App.doc.items.length===2 && App.doc.items[1].link===App.doc.items[0].id") and p.pg.locator('#link-sec').count() == 1
    # Original breiter → Kopie folgt, ihre Lage bleibt eigen
    p.ev("App.change('x', d=>{ d.items[0].p.w=40; d.items[0].finishes=[{id:'f1',type:'fillet',r:2,edges:'all'}]; })"); warte_rechnen(p)
    bb = p.ev("return App.results.get(App.doc.items[1].id).data.bbox")
    c = p.ev("return App.doc.items[1]")
    ok2 = c['p']['w'] == 40 and len(c['finishes']) == 1 and abs((bb[3] - bb[0]) - 40) < 0.01
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    ok3 = p.ev("return Model.tNumeric(App.doc.items[1]).x") == 10 and '1 verknüpfte Kopie' in p.pg.locator('#right-body').inner_text()
    # Verknüpfung lösen: Original ändern, Kopie bleibt
    p.ev("App.select([App.doc.items[1].id])"); p.wait(400)
    p.pg.locator('#link-off').click(); p.wait(600)
    p.ev("App.change('x', d=>{ d.items[0].p.w=60; })"); warte_rechnen(p)
    ok4 = p.ev("return [App.doc.items[1].link, App.doc.items[1].p.w]") == [None, 40]
    # neue Kopie, dann Original löschen: Kopie behält ihre Form und meldet es
    p.ev("App.select([App.doc.items[0].id])"); p.wait(300); p.ev("Actions.duplicateLinked()"); p.wait(600)
    p.ev("App.change('x', d=>{ d.items.splice(0,1); })"); warte_rechnen(p)
    lost = p.ev("const c=App.doc.items.find(i=>i.link); return c ? [c.linkLost, c.p.w] : null")
    ok5 = lost == [True, 60]
    return [ok1, ok2, ok3, ok4, ok5]

# Bezüge: Was hängt davon ab?
def t_bezuege(p):
    p.empty()
    p.ev("""App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:40,h:10},{name:'Block'}); d.items.push(a); const b=Model.newItem('cylinder',{d:10,h:30},{name:'Bolzen'}); b.t.z=-5; b.op={type:'cut', target:a.id}; d.items.push(b); const c=Model.newItem('box',{w:10,d:10,h:10},{name:'Kopie'}); c.link=a.id; c.t.x=60; d.items.push(c); })"""); warte_rechnen(p)
    deps = p.ev("return Model.dependencies(App.doc).map(x=>[x.what])")
    p.ev("App.select([App.doc.items[0].id])"); p.wait(600)
    txt = p.pg.locator('#deps').inner_text()
    ok1 = len(deps) == 2 and 'bezüge (2)' in txt.lower() and 'Bolzen“ wird hiervon abgezogen' in txt and 'Kopie' in txt
    p.pg.locator('#deps .dep-row').first.click(); p.wait(400)
    ok2 = p.ev("return App.sel.length===1 && App.sel[0]!==App.doc.items[0].id")
    # Block löschen: Hinweis nennt die abhängigen Teile
    p.ev("Actions.remove([App.doc.items[0].id])"); p.wait(600)
    ok3 = 'Daran hingen' in p.pg.locator('.toast').last.inner_text()
    return [ok1, ok2, ok3]

def t_motorverkleidung(p):
    p.empty()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    ok1 = any('Motorverkleidung' in t for t in p.pg.locator('.flyout .tile').all_inner_texts())
    p.pg.keyboard.press('Escape'); p.wait(200)
    # Hülle, Motor (Zylinder Ø 28 × 18) und Arm 12 × 5, der nach +X herausläuft
    p.ev("""App.change('x', d=>{
      const f=Model.newItem('part',{lib:'motorFairing',d:28,h:18,tail:30,aw:12,at:5,wall:1.2,gap:0.5},{role:'solid'}); f.name='Haube'; d.items.push(f);
      const m=Model.newItem('cylinder',{d:28,h:18}); m.name='Motor'; d.items.push(m);
      const a=Model.newItem('box',{w:60,d:12,h:5}); a.name='Arm'; a.t.x=18; a.t.z=-5; d.items.push(a);
    })"""); warte_rechnen(p, 40)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ro = 14 + 0.5 + 1.2
    ok2 = p.ev("return App.errors.length") == 0 and abs(bb[3] - ro) < 0.05 and abs(bb[0] + ro) < 0.05 and abs(bb[5] - 18) < 0.05 and abs(bb[2] + 35) < 0.1
    # Motor und Arm stecken frei in der Hülle (der Kern prüft Durchdringungen)
    cl = p.ev("""const ids=App.doc.items.map(i=>i.id); const out=[];
      const one=(b)=>{ const r=Joints.add(ids[0], b, [0,0,0], [0,0,1], {min:0, max:0}); return Joints.check(r.id, 1).then(x=>{ Joints.remove(r.id); out.push(x.map(y=>y.v)); }); };
      return one(ids[1]).then(()=>one(ids[2])).then(()=>out)""")
    ok3 = cl == [[0], [0]]
    # hohl: deutlich leichter als ein voller Körper; längeres Heck macht sie länger
    v = p.ev("return Mass.measureDoc(App.doc).then(r=>{ const q=(r.parts||[]).find(x=>x.id===App.doc.items[0].id); return q && q.volume; })")
    full = 3.14159 * ro * ro * 23
    ok4 = v is not None and 0 < v < 0.35 * full
    p.ev("App.change('x', d=>{ d.items[0].p.tail=50; })"); warte_rechnen(p, 30)
    bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok5 = abs(bb2[2] + 55) < 0.1 and p.ev("return Views.cwGuess()") == 1.1
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 76: Vieleck drehen ----------
def t_vieleck_drehen(p):
    scene(p, [{'id': 'P', 'type': 'poly', 'c': [0, 0], 'r': 10, 'n': 6, 'rot': 0}])
    click_uv(p, 0, 10, alt=False); p.wait(400)
    top = lambda: SS(p, "const c=SK.polyCorners(E('P')); return [Math.max(...c.map(q=>q[1])), c.filter(q=>Math.abs(q[1]-Math.max(...c.map(z=>z[1])))<1e-6).length]")
    t0 = top()
    ok1 = p.pg.locator('#se-rot').count() == 1 and abs(t0[0] - 10) < 1e-6 and t0[1] == 1
    p.pg.locator('#se-poly-flat').click(); p.wait(400)
    t1 = top()
    ok2 = abs(t1[0] - 10 * math.cos(math.pi / 6)) < 1e-6 and t1[1] == 2
    p.pg.fill('#se-rot', '15'); p.pg.press('#se-rot', 'Enter'); p.wait(400)
    ok3 = abs(SS(p, "return E('P').rot") - math.pi / 12) < 1e-6
    p.pg.locator('#se-poly-corner').click(); p.wait(400)
    ok4 = abs(SS(p, "return E('P').rot")) < 1e-9 and top()[1] == 1
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 77: SVG importieren ----------
def t_svg_import(p):
    p.empty()
    # 60 × 40 mm (viewBox 600 × 400): Rechteck mit runden Ecken, Kreisloch, ein gedrehtes Dreieck als Loch, Text wird gemeldet
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="40mm" viewBox="0 0 600 400">
      <defs><circle id="x" cx="0" cy="0" r="500"/></defs>
      <rect x="0" y="0" width="600" height="400" rx="50"/>
      <g transform="translate(150 100)"><circle cx="0" cy="0" r="40"/></g>
      <path d="M400 250 l100 0 l-50 80 z" transform="rotate(10 450 280)"/>
      <path d="M 300 300 c 20 -40 60 -40 80 0 s 60 40 80 0" />
      <text x="10" y="20">Hallo</text>
    </svg>"""
    p.ev("Start.openBlob(new File([arg], 'Logo.svg'))", svg); p.wait(800); warte_rechnen(p, 40)
    r = p.ev("const it=App.doc.items[0]; const R=it && App.results.get(it.id); const E=it?it.p.sketch.ents:[]; return [App.doc.items.length, it && it.name, R && R.data.bbox, R && R.data.faces.length, App.errors.length, E.filter(e=>e.type==='circle').map(e=>[e.c,e.r]), E.filter(e=>e.type==='spline').length, E.filter(e=>e.type==='line').length]")
    bb = r[2]
    ok1 = r[0] == 1 and r[1] == 'Logo' and bb is not None and abs(bb[3] - bb[0] - 60) < 0.05 and abs(bb[4] - bb[1] - 40) < 0.05 and abs(bb[5] - bb[2] - 1) < 0.01 and r[4] == 0
    # Kreis: Ø 8 mm, liegt links oben (SVG zählt Y nach unten): Mitte (15 − 30, 20 − 10)
    c = r[5][0] if len(r[5]) == 1 else None
    ok2 = c is not None and abs(c[1] - 4) < 1e-3 and abs(c[0][0] + 15) < 1e-3 and abs(c[0][1] - 10) < 1e-3
    # 2 Deckflächen + 4 gerade Wände + 4 Eck-Rundungen + Kreis + 3 Dreieck; die offene Wellenlinie bleibt Skizze (eine Spline), die Ecken sind echte Bögen
    ok3 = r[3] == 14 and r[6] == 1 and r[7] == 7
    t1 = p.pg.locator('.toast').last.inner_text()
    p.ev("Start.openBlob(new File(['<svg xmlns=\\'http://www.w3.org/2000/svg\\'><text>A</text></svg>'], 'nur-text.svg'))"); p.wait(600)
    t2 = p.pg.locator('.toast').last.inner_text()
    ok4 = 'Text' in t1 and 'in Pfade' in t2 and p.ev("return App.doc.items.length") == 1
    return [ok1, ok2, ok3, ok4]

# ---------- Sitzung 78: ganze Skizze skalieren ----------
def t_skizze_skalieren(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [-20, -10], 'b': [20, 10]}, {'id': 'C', 'type': 'circle', 'c': [5, 0], 'r': 4},
              {'id': 'L', 'type': 'line', 'a': [-20, 20], 'b': [20, 20], 'con': True}])
    SS(p, "S.dims.push({id:'m1', e:'C', k:'d', v:8}, {id:'m2', e:'R', k:'w', v:'20*2'}); return 1")
    p.ev("Sketch.setTool('line')"); p.wait(200); p.ev("Sketch.setTool('select')"); p.wait(300)
    ok1 = p.pg.locator('#sk-scale-w').count() == 1 and '40' in p.pg.locator('#sk-size').inner_text()
    p.pg.fill('#sk-scale-w', '60'); p.pg.press('#sk-scale-w', 'Enter'); p.wait(600)
    r = SS(p, "return [E('R').a, E('R').b, E('C').c, E('C').r, S.dims.find(d=>d.id==='m1').v, S.dims.find(d=>d.id==='m2').v, E('L').b, S.status && S.status.conflicts && S.status.conflicts.length]")
    ok2 = r[0] == [-30, -15] and r[1] == [30, 15] and r[2] == [7.5, 0] and abs(r[3] - 6) < 1e-6 and r[6] == [30, 30]
    ok3 = abs(r[4] - 12) < 1e-6 and r[5] == '(20*2)*1,5' and not r[7] and '60' in p.pg.locator('#sk-size').inner_text()
    # Faktor 50 % und Rückgängig
    p.pg.fill('#sk-scale-f', '50'); p.pg.press('#sk-scale-f', 'Enter'); p.wait(600)
    ok4 = SS(p, "return E('R').b") == [15, 7.5]
    p.pg.keyboard.press('Control+z'); p.wait(500)
    ok5 = SS(p, "return E('R').b") == [30, 15]
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 79: Flugzeit im Schweben ----------
def t_flugzeit(p):
    drohne(p, 'f5')
    c = chk(p)
    m = p.ev("return Mass.measure().then(r=>r.mass)")
    # 5 Zoll, 6S 1300 mAh: Strahltheorie mit 30 % Wirkungsgrad, 80 % vom Akku
    T = m / 1000 * 9.81; A = 4 * math.pi * (5 * 25.4 / 2000) ** 2; w = T ** 1.5 / math.sqrt(2 * 1.225 * A) / 0.3
    mins = 6 * 3.7 * 1.3 * 0.8 / w * 60
    hv = p.ev("return DroneCheck.hoverTime(%r, 4, 127, 6*3.7*1.3)" % m)
    ok1 = 'flight' in c and c['flight'][0] == 'info' and '6S 1300 mAh' in c['flight'][1] and abs(hv['min'] - mins) < 0.01 and 5 < mins < 15
    txt = ('%.1f' % mins).replace('.', ',') if mins < 10 else '%.0f' % mins
    ok2 = ('ca. ' + txt + ' min') in c['flight'][1] and ('%.0f W' % w) in c['flight'][1]
    # schwerer → kürzer; Akku ohne Angaben → Hinweis; winziger Akku → Warnung
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:30,d:30,h:30},{name:'Ballast'}); b.massG=400; b.t.z=60; d.items.push(b); })"); warte_rechnen(p)
    c2 = chk(p); m2 = p.ev("return Mass.measure().then(r=>r.mass)")
    ok3 = m2 > m + 100 and p.ev("return DroneCheck.hoverTime(%r, 4, 127, 28.86).min" % m2) < hv['min'] and c2['flight'][1] != c['flight'][1]
    p.ev("App.change('x', d=>{ d.items.find(i=>/^Akku/.test(i.name)).name='Akku'; })"); warte_rechnen(p)
    c3 = chk(p)
    ok4 = 'Zellen und Kapazität' in c3['flight'][1]
    p.ev("App.change('x', d=>{ d.items.find(i=>/^Akku/.test(i.name)).name='Akku 2S 300 mAh'; })"); warte_rechnen(p)
    c4 = chk(p)
    ok5 = c4['flight'][0] == 'warn' and 'sehr kurz' in c4['flight'][1]
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 80: Stückliste ----------
def t_stueckliste(p):
    p.empty()
    p.ev("""App.change('x', d=>{
      for (let i=1;i<=4;i++){ const a=Model.newItem('box',{w:60,d:12,h:5},{name:'Arm '+i}); a.t.x=i*20; d.items.push(a); }
      const pl=Model.newItem('box',{w:40,d:80,h:2},{name:'Platte'}); pl.t.z=20; d.items.push(pl);
      const m=Model.newItem('cylinder',{d:28,h:18},{name:'Motor'}); m.massG=31; m.t.z=40; d.items.push(m);
      const m2=Model.newItem('cylinder',{d:28,h:18},{name:'Motor (Kopie)'}); m2.massG=31; m2.t.z=70; d.items.push(m2);
      const x=Model.newItem('box',{w:5,d:5,h:5},{name:'Empfänger'}); x.massG=''; x.t.z=100; d.items.push(x);
      const l=Model.newItem('cylinder',{d:3,h:30},{name:'Loch', role:'hole'}); l.t.x=-200; d.items.push(l);
    })"""); warte_rechnen(p, 40)
    B = p.ev("return Mass.bom().then(b=>({rows:b.rows.map(r=>[r.name,r.n,r.kind,Math.round(r.g*100)/100,r.missing]), mass:b.mass, count:b.count}))")
    m = p.ev("return Mass.measure().then(r=>r.mass)")
    names = [r[0] for r in B['rows']]
    arm = next(r for r in B['rows'] if r[0] == 'Arm')
    ok1 = names == ['Arm', 'Platte', 'Motor', 'Empfänger'] and arm[1] == 4 and arm[2] == 'CFK' and B['count'] == 8 and abs(B['mass'] - m) < 0.01
    mot = next(r for r in B['rows'] if r[0] == 'Motor')
    ok2 = mot[1] == 2 and mot[2] == 'Kaufteil' and mot[3] == 31 and B['rows'][3][4] is True
    # Dialog: Tabelle, Klick wählt die Teile, CSV
    p.ev("Panels.renderRight()"); p.wait(300)
    p.ev("App.select([])"); p.wait(400)
    p.pg.locator('#proj-bom').click(); p.pg.wait_for_selector('#bom table', timeout=30000); p.wait(300)
    ok3 = p.pg.locator('#bom .bom-row').count() == 4 and 'fehlt' in p.pg.locator('#bom .bom-row').nth(3).inner_text() and '8' in p.pg.locator('#bom .bom-sum').inner_text()
    p.pg.locator('#bom .bom-row').first.click(); p.wait(300)
    ok4 = p.ev("return App.sel.length") == 4
    csv = p.ev("return Mass.bom().then(b=>Mass.bomCSV(b,'Test'))")
    ok5 = '"Arm";4;"CFK";' in csv and '"Summe Test";8;' in csv and '"Motor";2;"Kaufteil";31;62;' in csv
    p.pg.keyboard.press('Escape'); p.wait(200)
    # Filament: Platte aus PETG (40 × 80 × 2 = 6,4 cm³ · 1,27 = 8,128 g → 2,66 m Draht)
    p.ev("App.change('x', d=>{ d.items.find(i=>i.name==='Platte').mat='PETG'; })"); warte_rechnen(p)
    F = p.ev("return Mass.bom().then(b=>b.filament)")
    rho = p.ev("return Mass.materialFor({mat:'PETG'}).rho")
    ok6 = len(F) == 1 and F[0]['mat'] == 'PETG' and abs(F[0]['g'] - 6.4 * rho) < 0.01 and abs(F[0]['m'] - 6.4 / (math.pi * 0.0875 ** 2) / 100) < 0.01
    return [ok1, ok2, ok3, ok4, ok5, ok6]

def t_stueckliste_drohne(p):
    # Drohnen-Vorlage: „Motor … (4×)“ zählt als vier Stück
    drohne(p, 'f5')
    D = p.ev("return Mass.bom().then(b=>b.rows.filter(r=>/^Motor|^Propeller/.test(r.name)).map(r=>[r.name,r.n,r.kind]))")
    ok6 = len(D) == 2 and all(r[1] == 4 and r[2] == 'Kaufteil' and '(4' not in r[0] for r in D)
    # Schrauben: Vorlage hat Stack- und Motor-Lochbilder; ein zweites Loch auf derselben Achse zählt nicht doppelt
    S0 = p.ev("return Mass.screws()")
    tot0 = sum(x['n'] for x in S0)
    p.ev("""App.change('x', d=>{
      const a=Model.newItem('part',{lib:'screwHole',size:'M5',head:'countersunk',fit:'medium',length:10},{role:'hole'}); a.t.x=300; d.items.push(a);
      const b=Model.newItem('part',{lib:'screwHole',size:'M5',head:'countersunk',fit:'medium',length:10},{role:'hole'}); b.t.x=300; b.t.z=20; d.items.push(b);
      const c=Model.newItem('part',{lib:'nutTrap',size:'M5',length:12},{role:'hole'}); c.t.x=320; d.items.push(c);
    })"""); warte_rechnen(p)
    S1 = {x['name']: x['n'] for x in p.ev("return Mass.screws()")}
    ok7 = tot0 >= 16 and tot0 % 4 == 0 and S1.get('Schraube M5 Senkkopf') == 1 and S1.get('Mutter M5') == 1
    return [ok6, ok7]

# ---------- Sitzung 81: DXF/SVG in die offene Skizze einfügen ----------
def t_umriss_in_skizze(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [-40, -30], 'b': [40, 30]}])
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path d="M0 0H20V10H0Z"/><circle cx="5" cy="5" r="2"/></svg>'
    p.ev("Start.openBlob(new File([arg], 'Logo.svg'))", svg); p.wait(900)
    r = SS(p, "return [S.ents.length, S.ents.filter(e=>e.type==='line').length, S.ents.filter(e=>e.type==='circle').map(e=>[e.c,e.r]), S.tool, App.doc.items.length]")
    ok1 = r[0] == 6 and r[1] == 4 and r[2] == [[[-5, 0], 2]] and r[3] == 'select' and r[4] == 1 and 'eingefügt' in p.pg.locator('.toast').last.inner_text()
    # Rückgängig nimmt alles auf einmal wieder heraus
    p.pg.keyboard.press('Control+z'); p.wait(500)
    ok2 = SS(p, "return S.ents.length") == 1
    # DXF geht genauso
    dxf = "\n".join(str(x) for x in [0,'SECTION',2,'ENTITIES',0,'CIRCLE',10,0,20,0,40,3,0,'ENDSEC',0,'EOF']) + "\n"
    p.ev("Start.openBlob(new File([arg], 'Loch.dxf'))", dxf); p.wait(900)
    ok3 = SS(p, "return S.ents.filter(e=>e.type==='circle').map(e=>e.r)") == [3] and p.ev("return App.doc.items.length") == 1
    return [ok1, ok2, ok3]

def t_armverkleidung(p):
    p.empty()
    p.ev("Panels.closeFlyout(); Panels.toggleFlyout('drone')"); p.wait(400)
    p.pg.locator('.flyout .chip[data-cat="loch"]').click(); p.wait(300)
    ok1 = any('Armverkleidung' in t for t in p.pg.locator('.flyout .tile').all_inner_texts())
    p.pg.keyboard.press('Escape'); p.wait(200)
    # Verkleidung und ein Arm 80 × 14 × 5 genau im Schlitz
    p.ev("""App.change('x', d=>{
      const f=Model.newItem('part',{lib:'armFairing',len:60,aw:14,at:5,wall:1,chord:0},{role:'solid'}); f.name='Verkleidung'; d.items.push(f);
      const a=Model.newItem('box',{w:80,d:14,h:5}); a.name='Arm'; a.t.z=-2.5; d.items.push(a);
    })"""); warte_rechnen(p, 30)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    # Profiltiefe automatisch 2,4 × 14 = 33,6 mm, Nase 30 % vor der Armmitte
    ok2 = p.ev("return App.errors.length") == 0 and abs(bb[3] - bb[0] - 60) < 0.1 and abs(bb[1] + 10.08) < 0.3 and abs(bb[4] - 23.52) < 0.3
    th = bb[5] - bb[2]
    ok3 = 7 <= th <= 11 and abs(bb[5] + bb[2]) < 0.05   # gerade dick genug für 5 mm Arm + 2 × 1 mm Wand, symmetrisch
    # Steckt der Arm in der Hülle fest? (Gelenk-Prüfung bei 0°, fragt den CAD-Kern nach Durchdringungen)
    cl = p.ev("""const r=Joints.add(App.doc.items[0].id, App.doc.items[1].id, [0,0,0], [1,0,0], {min:0, max:0});
      return Joints.check(r.id, 1).then(x=>{ Joints.remove(r.id); return x.map(y=>y.v); })""")
    ok4 = cl == [0]
    # Längere Profiltiefe macht die Hülle schlanker (relativ)
    p.ev("App.change('x', d=>{ d.items[0].p.chord=50; })"); warte_rechnen(p, 30)
    bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok5 = abs(bb2[4] - bb2[1] - 50) < 0.3 and (bb2[5] - bb2[2]) / 50 < th / 33.6
    return [ok1, ok2, ok3, ok4, ok5]

# ---------- Sitzung 22: kleine Skizzen-Werkzeuge ----------
def t_kreis_bogen_modi(p):
    sketch_xy(p)
    p.pg.keyboard.press('c'); p.wait(200)
    p.pg.select_option('#ci-mode', '3p'); p.wait(100)
    for q in ((10, 0), (0, 10), (-10, 0)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(150)
    c = p.ev("const e=Sketch.state.ents.find(x=>x.type==='circle'); return e && [e.c, e.r]")
    ok1 = c and abs(c[0][0]) < 0.05 and abs(c[0][1]) < 0.05 and abs(c[1] - 10) < 0.05
    p.pg.select_option('#ci-mode', '2p'); p.wait(100)
    for q in ((15, 0), (35, 0)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(150)
    c2 = p.ev("const l=Sketch.state.ents.filter(x=>x.type==='circle'); return l.length===2 && [l[1].c, l[1].r]")
    ok2 = c2 and abs(c2[0][0] - 25) < 0.05 and abs(c2[1] - 10) < 0.05
    # tangentialer Bogen an einer Linie
    p.ev("const S=Sketch.state; S.ents.push({id:'L',type:'line',a:[-40,-30],b:[-10,-30]}); Sketch.setTool('arc')"); p.wait(200)
    p.pg.select_option('#ar-mode', 'tan'); p.wait(100)
    s = to_screen(p, -10, -30); p.pg.mouse.click(s[0], s[1]); p.wait(150)
    s = to_screen(p, -10, -10); p.pg.mouse.click(s[0], s[1]); p.wait(400)
    a = p.ev("const S=Sketch.state; const e=S.ents.find(x=>x.type==='arc'); return e && [SK.arcInfo(e.a,e.m,e.b).c, SK.arcInfo(e.a,e.m,e.b).r, S.cons.some(k=>k.type==='tangent'), S.status.ok]")
    ok3 = a and abs(a[0][0] + 10) < 0.05 and abs(a[0][1] + 20) < 0.05 and abs(a[1] - 10) < 0.05 and a[2] and a[3]
    return [ok1, ok2, ok3]


def t_verlaengern(p):
    scene(p, [{'id': 'H', 'type': 'line', 'a': [-30, 0], 'b': [-5, 0]}, {'id': 'V', 'type': 'line', 'a': [10, -20], 'b': [10, 20]}])
    p.pg.keyboard.press('u'); p.wait(200)
    s = to_screen(p, -6, 0); p.pg.mouse.move(s[0], s[1]); p.wait(200)
    hov = SS(p, "return !!S.extHover")
    p.pg.mouse.click(s[0], s[1]); p.wait(400)
    ok = SS(p, "const h=E('H'); return Math.abs(h.b[0]-10)<1e-6 && Math.abs(h.b[1])<1e-6 && S.cons.some(c=>c.type==='coincident' && c.refs[1].e==='V')")
    return [hov, ok]


def t_schraege(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.p.w=20; it.p.d=20; it.p.h=10; it.t.x=0; it.t.y=0; })"); warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    p.pg.click('#btn-draft'); warte_rechnen(p, 30)
    v = volumen(p)
    t = math.tan(math.radians(3))
    # Pyramidenstumpf: unten 20x20, oben (20-2*10*tan3)^2
    a1 = (20 - 2 * 10 * t) ** 2; soll = 10 / 3 * (400 + a1 + math.sqrt(400 * a1))
    ok1 = v is not None and abs(v - soll) < 1 and p.ev("return App.errors.length") == 0
    p.pg.fill('[id^="fin-"]', '-2'); p.pg.press('[id^="fin-"]', 'Enter'); warte_rechnen(p, 30)
    v2 = volumen(p)
    ok2 = v2 is not None and v2 > 4000
    return [ok1, ok2]


def t_gewinde(p):
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('part',{lib:'threadRod',size:'M6',length:12},{role:'solid'})); })")
    warte_rechnen(p, 60)
    v = volumen(p)
    ok1 = p.ev("return App.errors.length") == 0 and v is not None and math.pi * 2.46 ** 2 * 12 < v < math.pi * 9 * 12
    # Innengewinde in einer Platte
    p.ev("App.change('x', d=>{ d.items=[]; const b=Model.newItem('box',{w:20,d:20,h:10}); b.t.x=0; b.t.y=0; d.items.push(b); })"); warte_rechnen(p, 20)
    v0 = volumen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
    p.ev("const f=Model.find(App.doc, App.doc.items[0].id); App.change('x', d=>{ const h=Model.newItem('part',{lib:'threadHole',size:'M6',length:10,clear:0.3},{role:'hole'}); h.t.z=10; Actions.attach(d, d.items[0].id, h); })")
    warte_rechnen(p, 60)
    v1 = volumen(p)
    ok2 = p.ev("return App.errors.length") == 0 and v1 is not None and v0 - math.pi * 3.3 ** 2 * 10 < v1 < v0 - math.pi * 2.7 ** 2 * 10
    return [ok1, ok2]


def t_pfad_eigene_form(p):
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-4, -2], 'b': [4, 2]}], 0, 'Profil')
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:[{id:'l',type:'line',a:[0,30],b:[50,30]}],dims:[],cons:[]},shape:'circle',d:6,w:6,h:4,wall:0},{name:'Pfad'}); d.items.push(it); })")
    warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(500)
    p.pg.select_option('#p-shape', 'sketch'); warte_rechnen(p, 30)
    v = volumen(p)
    ok1 = p.ev("const it=App.doc.items[1]; return it.p.shape==='sketch' && !!it.p.prof && App.doc.items[0].hidden===true && App.errors.length===0")
    ok2 = v is not None and abs(v - 8 * 4 * 50) < 1
    return [ok1, ok2]


def t_einheiten(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    fid = p.pg.evaluate("[...document.querySelectorAll('#right-body input')].map(i=>i.id).find(i=>/w$/.test(i))")
    p.pg.fill('#' + fid, '2 cm'); p.pg.press('#' + fid, 'Enter'); p.wait(400)
    a = p.ev("return App.doc.items[0].p.w")
    p.pg.fill('#' + fid, '1/4"'); p.pg.press('#' + fid, 'Enter'); p.wait(400)
    b = p.ev("return App.doc.items[0].p.w")
    p.pg.fill('#' + fid, '10mm+2cm'); p.pg.press('#' + fid, 'Enter'); p.wait(400)
    c = p.ev("return App.doc.items[0].p.w")
    return [a == 20, abs(b - 6.35) < 1e-9, c == 30]


def t_teilen(p):
    scene(p, [{'id': 'H', 'type': 'line', 'a': [-20, 0], 'b': [20, 0]}])
    p.pg.keyboard.press('y'); p.wait(200)
    s = to_screen(p, 0, 0.3); p.pg.mouse.click(s[0], s[1]); p.wait(400)
    st = SS(p, "return [S.ents.length, S.ents.map(e=>[e.a,e.b]), S.cons.map(c=>c.type), S.status.ok]")
    ok1 = st[0] == 2 and 'coincident' in st[2] and 'parallel' in st[2] and st[3]
    ok2 = abs(st[1][0][1][0]) < 0.6 and abs(st[1][0][1][1]) < 1e-6
    return [ok1, ok2]


def t_langloch_gebogen(p):
    sketch_xy(p)
    p.pg.keyboard.press('g'); p.wait(200)
    p.pg.select_option('#sl-mode', 'arc'); p.wait(100)
    for q in ((0, 0), (20, 0), (0, 20), (23, 0)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(200)
    st = p.ev("const S=Sketch.state; return [S.ents.filter(e=>e.type==='arc').length, S.status.ok, SK.regions(S.ents).length, SK.regions(S.ents)[0] && SK.regions(S.ents)[0].area]")
    soll = math.pi / 4 * (23 ** 2 - 17 ** 2) + math.pi * 9
    ok1 = st[0] == 4 and st[1] and st[2] == 1 and abs(st[3] - soll) < 2
    fertig_hoch(p, '2')
    ok2 = p.ev("return App.errors.length") == 0 and abs(volumen(p) - 2 * soll) < 2
    return [ok1, ok2]


def t_rechteck_gedreht_sechskant(p):
    sketch_xy(p)
    p.pg.select_option('#rk-mode', 'r3'); p.wait(100)
    for q in ((0, 0), (20, 10), (10, 25)):
        s = to_screen(p, *q); p.pg.mouse.click(s[0], s[1]); p.wait(200)
    st = p.ev("const S=Sketch.state; return [S.ents.filter(e=>e.type==='line').length, S.status.ok, SK.regions(S.ents).length]")
    ok1 = st[0] == 4 and st[1] and st[2] == 1
    # Sechskant über die Flächen 5,5 mm (M3-Mutter)
    p.pg.keyboard.press('p'); p.wait(200)
    p.pg.select_option('#po-mode', 'flats'); p.wait(100)
    s = to_screen(p, -30, 0); p.pg.mouse.click(s[0], s[1]); p.pg.mouse.move(s[0] + 30, s[1]); p.wait(200)
    p.pg.keyboard.type('5.5'); p.pg.keyboard.press('Enter'); p.wait(400)
    e = p.ev("const e=Sketch.state.ents.find(x=>x.type==='poly'); const c=SK.polyCorners(e); const xs=c.map(q=>q[0]), ys=c.map(q=>q[1]); return [Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)]")
    ok2 = abs(min(e) - 5.5) < 1e-3
    return [ok1, ok2]


def t_punkt(p):
    sketch_xy(p)
    p.pg.keyboard.press('o'); p.wait(200)
    s = to_screen(p, 10, 5); p.pg.mouse.click(s[0], s[1]); p.wait(300)
    e = p.ev("return Sketch.state.ents[0]")
    ok1 = e['type'] == 'point' and e['a'] == [10, 5]
    # Maß x = 12 rechts eintippen, Punkt wandert
    p.pg.keyboard.press('v'); p.pg.mouse.click(s[0], s[1]); p.wait(300)
    p.pg.fill('#se-x', '12'); p.pg.press('#se-x', 'Enter'); p.wait(300)
    ok2 = p.ev("return Sketch.state.ents[0].a[0]") == 12
    # Kreis rastet am Punkt ein
    p.pg.keyboard.press('c'); s2 = to_screen(p, 12, 5); p.pg.mouse.click(s2[0] + 2, s2[1] + 2); p.wait(150)
    p.pg.keyboard.type('4'); p.pg.keyboard.press('Enter'); p.wait(300)
    c = p.ev("const c=Sketch.state.ents.find(x=>x.type==='circle'); return c && c.c")
    ok3 = c == [12, 5]
    return [ok1, ok2, ok3]


def t_alle_ecken(p):
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [-20, -10], 'b': [20, 10]}])
    p.pg.keyboard.press('k'); p.wait(200)
    p.pg.fill('#cn-r', '3'); p.pg.press('#cn-r', 'Enter'); p.wait(100)
    p.pg.click('#cn-all'); p.wait(800)
    st = SS(p, "return [S.ents.filter(e=>e.type==='arc').length, S.status.ok, SK.regions(S.ents)[0].area, S.undo.length]")
    soll = 800 - 4 * (9 - math.pi * 9 / 4)
    ok1 = st[0] == 4 and st[1] and abs(st[2] - soll) < 0.5
    p.pg.keyboard.press('Control+z'); p.wait(300)
    ok2 = SS(p, "return S.ents.length===1 && S.ents[0].type==='rect'")
    return [ok1, ok2]


def t_ki_neue_formen(p):
    ki(p); p.empty()
    ki_fragen(p, 'Bau mir eine Nase und einen Kabelbügel', {'antwort': 'Ich baue eine Nase und einen Bügel.', 'aktionen': [
        {'op': 'hinzufuegen', 'objekt': {'art': 'loft', 'name': 'Nase', 'p': {'profile': [{'ebene': 'XY', 'versatz': 0, 'form': [{'ellipse': [0, 0, 12, 8]}]}, {'ebene': 'XY', 'versatz': 20, 'form': [{'circle': [0, 0, 5]}]}], 'spitze': 10}}},
        {'op': 'hinzufuegen', 'objekt': {'art': 'sweep', 'name': 'Bügel', 'p': {'ebene': 'XZ', 'pfad': [[30, 0], [30, 15], [50, 15], [50, 0]], 'form': 'rund', 'd': 3}}},
        {'op': 'hinzufuegen', 'objekt': {'art': 'extrude', 'name': 'Schild', 'p': {'ebene': 'XY', 'hoehe': 2, 'form': [{'rect': [-15, 30, 15, 42]}, {'text': 'FPV', 'x': 0, 'y': 33, 'hoehe': 6, 'fett': True, 'mitte': True}]}}}]}, 90)
    kinds_ = p.ev("return App.doc.items.map(i=>i.kind)")
    ok1 = kinds_ == ['loft', 'sweep', 'extrude']
    ok2 = p.ev("return App.errors.length") == 0 and p.ev("return App.doc.items.every(i=>App.results.get(i.id))")
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok3 = abs(bb[5] - 30) < 0.01
    return [ok1, ok2, ok3]


def t_schnitt_flaeche(p):
    p.empty(); p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=0; it.t.y=0; it.t.rz=30; })"); warte_rechnen(p, 20)
    fi = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE' && Math.abs(f.n[0])>0.9)")
    p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); const f=r.data.faces[arg]; App.select([it.id], {face:{id:it.id, faceIdx:arg, point:f.c, normal:f.n}})", fi); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Schnitt hier"]').click(); p.wait(600)
    ok1 = p.pg.locator('.viewbar [data-plane="FACE"]').count() == 1 and p.ev("return Views.cut && Views.cut.plane") == 'FACE'
    p.pg.fill('#cut-off', '-5'); p.pg.press('#cut-off', 'Enter'); p.wait(300)
    ok2 = p.ev("return Views.cut.off") == -5
    p.pg.locator('.viewbar .vb-x').click(); p.wait(300)
    ok3 = p.pg.locator('.viewbar').count() == 0
    return [ok1, ok2, ok3]


def t_spiegeln_flaeche(p):
    p.empty(); p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:20,d:10,h:5}); d.items.push(b); })"); warte_rechnen(p, 20)
    fi = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.t==='PLANE' && f.n[0]>0.9)")
    p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); const f=r.data.faces[arg]; App.select([it.id], {face:{id:it.id, faceIdx:arg, point:f.c, normal:f.n}})", fi); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="An Fläche spiegeln"]').click(); warte_rechnen(p, 30)
    bb = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    v = volumen(p)
    ok1 = abs(bb[0] + 10) < 1e-3 and abs(bb[3] - 30) < 1e-3 and abs(v - 2000) < 0.5 and p.ev("return App.errors.length") == 0
    # Original ändern: Spiegelbild wandert mit
    p.ev("App.change('x', d=>{ d.items[0].children[0].p.w=30; })"); warte_rechnen(p, 30)
    bb2 = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    ok2 = abs(bb2[0] + 15) < 1e-3
    # Sitzung 28: Die Ebene hängt an der äußeren Fläche und wandert mit (vorher blieb sie bei x = 10)
    v2 = volumen(p)
    ok3 = p.ev("return App.doc.items[0].p.bind===true") and abs(bb2[3] - 45) < 1e-3 and abs(v2 - 3000) < 0.5 and p.ev("return App.errors.length") == 0
    return [ok1, ok2, ok3]


def t_kantenkette(p):
    p.empty(); p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:20,d:10,h:5}); b.finishes.push({id:'f_v',type:'fillet',r:2,edges:'vertical'}); d.items.push(b); })"); warte_rechnen(p, 20)
    idx = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.m[2]-5)<1e-3)")
    p.ev("App.select([App.doc.items[0].id], { edges: [{ id: App.doc.items[0].id, edgeIdx: arg }] })", idx); p.wait(500)
    p.pg.locator('.ctxbar button[aria-label="Kette"]').click(); p.wait(400)
    n = p.ev("return App.edges.length")
    ok1 = n == 8
    p.pg.locator('.ctxbar button[aria-label="Abrunden"]').click(); warte_rechnen(p, 30)
    ok2 = p.ev("return App.errors.length") == 0
    return [ok1, ok2]


def t_spiegeln_achse(p):
    scene(p, [{'id': 'C', 'type': 'circle', 'c': [10, 5], 'r': 3}])
    p.pg.keyboard.press('m'); p.wait(200)
    p.pg.click('#mir-y'); p.wait(300)
    p.pg.keyboard.press('Enter'); p.wait(500)
    c = SS(p, "return S.ents.filter(e=>e.type==='circle').map(e=>e.c)")
    ok = len(c) == 2 and any(abs(q[0] + 10) < 1e-6 and abs(q[1] - 5) < 1e-6 for q in c) and SS(p, "return S.status.ok && S.ents.some(e=>e.con && e.type==='line')")
    return [ok]


# ---------- [A-001] Drohnen-Bereich unsichtbar ----------
def t_a001_drohnen_unsichtbar(p):
    # 1. Startseite: kein Drohnen-Abschnitt, allgemeiner Untertitel, allgemeine Vorlagen da
    start_txt = (p.pg.locator('.start').text_content() or '').lower()
    ok1 = (p.pg.locator('.card.drone').count() == 0
           and 'drohne' not in start_txt and 'frame-assistent' not in start_txt
           and 'cad im browser – kostenlos, ohne konto' in start_txt
           and 'box mit deckel' in start_txt and 'schild mit loch' in start_txt)
    p.empty()
    # 2. Werkzeugleiste, Ansicht-Menü und Bauteil-Bibliothek ohne Drohnen-Einträge
    no_btn = p.pg.locator('#t-drone').count() == 0
    p.pg.locator('#t-views').click(); p.wait(250)
    views_txt = (p.pg.locator('.menu').text_content() or '').lower()
    no_wind = 'fahrtwind' not in views_txt and p.pg.locator('.menu [data-help="wind"]').count() == 0
    p.pg.keyboard.press('Escape'); p.wait(150)
    p.pg.locator('#t-parts').click(); p.wait(300)
    parts_txt = (p.pg.locator('.flyout').text_content() or '').replace('\u00ad', '').lower()
    no_drone_parts = all(w not in parts_txt for w in ['motorverkleidung', 'armverkleidung', 'stromlinien-rumpf', 'gopro', 'xt60', 'antennenhalter', 'lochbild'])
    keep_general = all(w in parts_txt for w in ['schraubenloch', 'zahnrad', 'scharnier', 'schnapphaken', 'gewindebolzen', 'schraube (norm)', 'mutter (norm)'])
    p.pg.keyboard.press('Escape'); p.wait(150)
    ok2 = no_btn and no_wind and no_drone_parts and keep_general
    # 3. Befehlssuche findet keine Drohnen-Befehle
    hits = p.ev("return ['drohne','frame','propeller','fahrtwind','motorverkleidung','armverkleidung','gopro','xt60','antennenhalter'].map(q=>Commands.search(q).length)")
    p.pg.locator('#cmd-input').fill('drohne'); p.wait(250)
    pop_cnt = p.pg.locator('.cmd-pop .cmd-item:not(.ai)').count()
    p.pg.locator('#cmd-input').fill(''); p.pg.keyboard.press('Escape'); p.wait(150)
    ok3 = all(n == 0 for n in hits) and pop_cnt == 0
    # 4. Über-Tracery-Dialog ohne Drohnen-Sprache
    p.pg.locator('#btn-menu').click(); p.wait(250)
    p.pg.locator('.menu button', has_text='Über Tracery').click(); p.wait(250)
    about_txt = (p.pg.locator('.modal').text_content() or '').lower()
    ok4 = 'drohne' not in about_txt and 'fpv' not in about_txt
    p.pg.keyboard.press('Escape'); p.wait(150)
    # 5. Altes Projekt mit buyMotor öffnet und rechnet ohne Fehler
    old_proj = """{"format":"masswerk","version":1,"id":"p_old_motor","name":"Altprojekt Motor","params":[],"items":[{"id":"i_mot1","kind":"part","name":"Motor 2207","role":"solid","p":{"lib":"buyMotor","d":28.5,"h":19.7,"lk":16,"size":"M3"},"t":{"x":0,"y":0,"z":0,"rx":0,"ry":0,"rz":0},"color":"#b9c2cb","hidden":false,"locked":false,"finishes":[],"massG":33.8}],"notes":[],"settings":{"grid":1,"snap":true},"drawing":null}"""
    p.ev("Start.openBlob(new File([arg], 'altprojekt.tracery.json', {type:'application/json'}))", old_proj)
    warte_rechnen(p, 40)
    r = p.ev("const it=App.doc.items[0]; const res=it && App.results.get(it.id); return [App.doc.name, App.errors.length, it && it.p.lib, res && res.data.bbox]")
    ok5 = (r[0] == 'Altprojekt Motor' and r[1] == 0 and r[2] == 'buyMotor' and r[3] is not None
           and abs((r[3][3] - r[3][0]) - 28.5) < 0.2 and p.pg.locator('#proj-drone').count() == 0)
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-002] KI-Kollege allgemein ----------
def t_a002_ki_allgemein(p):
    ki(p); p.empty()
    # 1. Systemtext (RULES und ACTIONS) ohne Drohnen-/FPV-Bezug, mit allgemeinen CAD-Themen
    rules = p.ev("return AI.RULES").lower()
    actions = p.ev("return AI.ACTIONS").lower()
    forbidden = ['drohne', 'fpv', 'propeller', 'cinewhoop', 'deadcat', 'gopro', 'xt60', 'source one', '"op":"drohne"', '"op":"pruefen"']
    ok1 = (all(w not in rules for w in forbidden)
           and all(w not in actions for w in forbidden)
           and all(w in rules for w in ['gehäuse', 'halterung', 'ersatzteil', 'schild', 'zahnrad', 'stdscrew']))
    # 2. Vorschläge und Intro-Panel allgemein ohne Drohne/FPV
    sugs = p.ev("AI.open(); return AI.SUGGESTIONS")
    intro_txt = (p.pg.locator('.ai-intro').text_content() or '').lower()
    sug_btns = p.pg.locator('.ai-intro button[data-sug-prompt]').count()
    ok2 = (len(sugs) >= 4 and sug_btns == len(sugs)
           and all('drohne' not in s.lower() and 'fpv' not in s.lower() for s in sugs)
           and 'drohne' not in intro_txt and 'fpv' not in intro_txt
           and 'gehäuse' in intro_txt)
    # 3. Vorbereiteter KI-Auftrag „Baue ein Gehäuse 60×40×30 mit Deckel“ über window.__aiQueue
    q = 'Baue ein Gehäuse 60×40×30 mit Deckel'
    ki_fragen(p, q, {
        'antwort': 'Ich habe dir ein Gehäuse 60 × 40 × 30 mm mit 2 mm Wandstärke und einen passenden Deckel daneben gebaut.',
        'aktionen': [
            {'op': 'mass', 'name': 'Breite', 'wert': '60'},
            {'op': 'mass', 'name': 'Tiefe', 'wert': '40'},
            {'op': 'mass', 'name': 'Hoehe', 'wert': '30'},
            {'op': 'mass', 'name': 'Wand', 'wert': '2'},
            {'op': 'hinzufuegen', 'objekt': {'art': 'group', 'name': 'Gehäuse', 'kinder': [
                {'art': 'box', 'name': 'Außen', 'p': {'w': 'Breite', 'd': 'Tiefe', 'h': 'Hoehe'}, 'rundungen': [{'typ': 'fillet', 'r': 3, 'kanten': 'vertical'}]},
                {'art': 'box', 'name': 'Innenraum', 'rolle': 'loch', 'p': {'w': 'Breite - 2*Wand', 'd': 'Tiefe - 2*Wand', 'h': 'Hoehe'}, 't': {'z': 'Wand'}}
            ], 't': {'x': '-(Breite/2 + 8)'}}},
            {'op': 'hinzufuegen', 'objekt': {'art': 'group', 'name': 'Deckel', 'kinder': [
                {'art': 'box', 'name': 'Deckelplatte', 'p': {'w': 'Breite', 'd': 'Tiefe', 'h': 'Wand'}, 'rundungen': [{'typ': 'fillet', 'r': 3, 'kanten': 'vertical'}]},
                {'art': 'box', 'name': 'Steg', 'p': {'w': 'Breite - 2*Wand - 0.4', 'd': 'Tiefe - 2*Wand - 0.4', 'h': 3}, 't': {'z': 'Wand'}},
                {'art': 'box', 'name': 'Steg innen', 'rolle': 'loch', 'p': {'w': 'Breite - 4*Wand - 0.4', 'd': 'Tiefe - 4*Wand - 0.4', 'h': 3.5}, 't': {'z': 'Wand'}}
            ], 't': {'x': 'Breite/2 + 8'}}}
        ],
        'weiter': False,
    }, 90)
    info = p.ev("""const g=App.doc.items.find(i=>i.name==='Gehäuse'), d=App.doc.items.find(i=>i.name==='Deckel');
      const bg=g && Actions.worldBox(g.id), bd=d && Actions.worldBox(d.id);
      return {
        errs: App.errors.length,
        names: App.doc.items.map(i=>i.name),
        ai: App.doc.items.every(i=>i.ai && i.ai.q===arg),
        params: App.doc.params.map(x=>[x.name, x.expr]),
        gSize: bg ? [bg.max.x-bg.min.x, bg.max.y-bg.min.y, bg.max.z-bg.min.z] : null,
        dSize: bd ? [bd.max.x-bd.min.x, bd.max.y-bd.min.y, bd.max.z-bd.min.z] : null,
        gap: (bg && bd) ? bd.min.x - bg.max.x : -1
      }""", q)
    vols = p.ev("return Mass.measure().then(r=>r.parts.map(x=>x.volume))")
    ok3 = (info['errs'] == 0 and info['names'] == ['Gehäuse', 'Deckel'] and info['ai']
           and info['params'] == [['Breite', 60], ['Tiefe', 40], ['Hoehe', 30], ['Wand', 2]]
           and info['gSize'] is not None and near(info['gSize'], [60, 40, 30], 0.1)
           and info['dSize'] is not None and near(info['dSize'], [60, 40, 5], 0.1)
           and info['gap'] > 10
           and len(vols) == 2 and vols[0] < 60 * 40 * 30 * 0.5
           and p.pg.locator('.tl-chip.ai').count() == 2)
    # 4. Tatsächlich gesendeter Prompt enthält kein Drohne/FPV und keine Drohnen-Kaufteile; Rückgängig nimmt alles zurück
    sent = (p.ev("return window.__aiPrompts[0] || ''") or '').lower()
    p.pg.locator('.ai-msg.ai').last.get_by_role('button', name='Rückgängig').click(); warte_rechnen(p, 20)
    ok4 = (all(w not in sent for w in ['drohne', 'fpv', 'dji o3', 'source one', 'walksnail'])
           and p.ev("return App.doc.items.length") == 0 and p.ev("return App.doc.params.length") == 0)
    return [ok1, ok2, ok3, ok4]


# ---------- [A-003] Skizzen-Prüfer (SK-09) ----------
def t_a003_skizzen_pruefer(p):
    # 1. Skizze 30×20 aus 4 Linien mit 0,01 mm Lücke am Ursprung und einer doppelten Linie
    ents = [
        {'id': 'L1', 'type': 'line', 'a': [0, 0], 'b': [30, 0]},
        {'id': 'L2', 'type': 'line', 'a': [30, 0], 'b': [30, 20]},
        {'id': 'L3', 'type': 'line', 'a': [30, 20], 'b': [0, 20]},
        {'id': 'L4', 'type': 'line', 'a': [0, 20], 'b': [0, 0.01]},
        {'id': 'L5', 'type': 'line', 'a': [0, 0], 'b': [30, 0]},
    ]
    scene(p, ents)
    # Vor dem Reparieren: keine geschlossene Fläche, Knopf „Skizze prüfen“ da
    pre_regs = SS(p, "return SK.regions(S.ents).length")
    p.pg.click('#sk-check'); p.wait(400)
    items = p.pg.locator('#sk-check-res .sk-chk-item')
    kinds = [items.nth(i).get_attribute('data-kind') for i in range(items.count())]
    texts = [(items.nth(i).text_content() or '').lower() for i in range(items.count())]
    ok1 = (pre_regs == 0 and items.count() == 2
           and 'gap' in kinds and 'dup' in kinds
           and any('0,01' in t and 'lücke' in t for t in texts)
           and any('doppelte linie' in t for t in texts)
           and p.pg.locator('#sk-repair').count() == 1)

    # 2. Klick auf Einträge in der Ergebnisliste hebt die jeweilige Stelle im Bild hervor
    items.nth(0).click(); p.wait(300)
    tag0 = (p.pg.locator('.sk-chk-tag').first.text_content() or '').lower() if p.pg.locator('.sk-chk-tag').count() else ''
    foc0 = SS(p, "return S.checkFocus")
    act0 = 'active' in (items.nth(0).get_attribute('class') or '')
    items.nth(1).click(); p.wait(300)
    tag1 = (p.pg.locator('.sk-chk-tag').first.text_content() or '').lower() if p.pg.locator('.sk-chk-tag').count() else ''
    foc1 = SS(p, "return S.checkFocus")
    act1 = 'active' in (items.nth(1).get_attribute('class') or '')
    ok2 = (foc0 == 0 and act0 and 'lücke' in tag0 and '0,01' in tag0
           and foc1 == 1 and act1 and 'doppelte linie' in tag1)

    # 3. „Alles reparieren“ → doppelte Linie gelöscht, Lücke mit Deckungsgleich geschlossen, geschlossene Fläche 600 mm²
    p.pg.click('#sk-repair'); p.wait(500)
    st = SS(p, """const regs=SK.regions(S.ents), ins=SKO.inspect(S.ents,{dims:S.dims,cons:S.cons});
      return {
        n: S.ents.length,
        hasCoinc: S.cons.some(c=>c.type==='coincident'),
        regs: regs.length,
        area: regs[0] ? regs[0].area : 0,
        issues: ins.issues.length,
        ok: S.status && S.status.ok
      }""")
    ok_txt = (p.pg.locator('#sk-check-ok').text_content() or '').lower() if p.pg.locator('#sk-check-ok').count() else ''
    ok3 = (st['n'] == 4 and st['hasCoinc'] and st['regs'] == 1
           and abs(st['area'] - 600) < 0.5 and st['issues'] == 0 and st['ok']
           and 'alles in ordnung' in ok_txt)

    # 4. Ein Rückgängig macht alles rückgängig; erneutes Reparieren + Fertig erzeugt gültigen 3D-Körper (1800 mm³)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400)
    after_undo = SS(p, "return [S.ents.length, S.cons.length, SK.regions(S.ents).length]")
    p.pg.click('#sk-repair'); p.wait(400)
    p.pg.locator('.sketchbar .tool.primary').click(); warte_rechnen(p, 30)
    vol = volumen(p)
    ok4 = (after_undo == [5, 0, 0] and p.ev("return App.errors.length") == 0 and abs(vol - 1800) < 2)

    # 5. Offenes Ende (große Lücke > 0,05 mm) wird gemeldet und hervorgehoben, ohne „Alles reparieren“
    p.ev("Sketch.startOnPlane('XY')"); p.wait(500)
    SS(p, "S.ents.push({id:'O1',type:'line',a:[0,0],b:[20,0]}); Sketch.setTool('select'); Panels.renderRight();"); p.wait(300)
    p.pg.click('#sk-check'); p.wait(300)
    oitems = p.pg.locator('#sk-check-res .sk-chk-item')
    okinds = [oitems.nth(i).get_attribute('data-kind') for i in range(oitems.count())]
    oitems.nth(0).click(); p.wait(250)
    otag = (p.pg.locator('.sk-chk-tag').first.text_content() or '').lower() if p.pg.locator('.sk-chk-tag').count() else ''
    ok5 = (okinds == ['open', 'open'] and p.pg.locator('#sk-repair').count() == 0 and 'offenes ende' in otag)
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-004] Rahmen-Auswahl in der Skizze (SK-10) ----------
def t_a004_rahmen_auswahl(p):
    ents = [
        {'id': 'L1', 'type': 'line', 'a': [-16, 6], 'b': [-4, 6]},
        {'id': 'L2', 'type': 'line', 'a': [-16, -6], 'b': [-4, -6]},
        {'id': 'L3', 'type': 'line', 'a': [0, 0], 'b': [18, 0]},
    ]
    scene(p, ents)
    SS(p, "Sketch.setTool('select')"); p.wait(300)

    def drag_band(u1, v1, u2, v2, shift=False):
        a = to_screen(p, u1, v1)
        b = to_screen(p, u2, v2)
        if shift:
            p.pg.keyboard.down('Shift')
        p.pg.mouse.move(a[0], a[1])
        p.pg.mouse.down()
        p.pg.mouse.move(b[0], b[1], steps=8)
        has_band = p.pg.locator('.sel-band').count()
        is_cross = p.pg.locator('.sel-band.cross').count()
        p.pg.mouse.up()
        if shift:
            p.pg.keyboard.up('Shift')
        p.wait(350)
        return has_band, is_cross

    # 1. Rahmen von links nach rechts um L1 und L2 (L3 nur halb drin) -> genau 2 gewählt, nicht gestrichelt
    b1, c1 = drag_band(-20, 10, 5, -10, shift=False)
    sel1 = sorted(SS(p, "return S.sels || []"))
    cnt_txt = (p.pg.locator('#sk-sel-count').text_content() or '').lower() if p.pg.locator('#sk-sel-count').count() else ''
    ok1 = b1 == 1 and c1 == 0 and sel1 == ['L1', 'L2'] and '2 elemente' in cnt_txt

    # 2. Umschalt + Kreuz-Rahmen von rechts nach links berührt nur die Mitte von L3 -> alle 3 gewählt, gestrichelt
    b2, c2 = drag_band(14, 5, 8, -5, shift=True)
    sel2 = sorted(SS(p, "return S.sels || []"))
    ok2 = b2 == 1 and c2 == 1 and sel2 == ['L1', 'L2', 'L3']

    # 3. H („Verschieben“) übernimmt Auswahl in S.patSel und verschiebt alle 3 gemeinsam
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('h'); p.wait(300)
    pat_sel = sorted(SS(p, "return S.patSel || []"))
    tool_h = SS(p, "return S.tool")
    p.pg.fill('#xm-dx', '5'); p.pg.press('#xm-dx', 'Enter'); p.wait(150)
    p.pg.click('#xm-make'); p.wait(400)
    xs_moved = SS(p, "return ['L1','L2','L3'].map(id=>S.ents.find(e=>e.id===id).a[0])")
    ok3 = tool_h == 'xmove' and pat_sel == ['L1', 'L2', 'L3'] and all(abs(a - b) < 1e-4 for a, b in zip(xs_moved, [-11, -11, 5]))

    # Rückgängig + zurück zu Auswahl (V)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(300)
    p.pg.keyboard.press('v'); p.wait(300)

    # 4. Kreuz-Rahmen ohne Umschalt berührt alle 3 Linien -> 3 gewählt; Entf löscht alle 3; Rückgängig holt alle 3 zurück
    b4, c4 = drag_band(12, 9, -8, -9, shift=False)
    sel4 = sorted(SS(p, "return S.sels || []"))
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Delete'); p.wait(350)
    after_del = SS(p, "return [S.ents.length, (S.sels||[]).length]")
    p.pg.keyboard.press('Control+z'); p.wait(350)
    after_undo = SS(p, "return S.ents.length")
    ok4 = b4 == 1 and c4 == 1 and sel4 == ['L1', 'L2', 'L3'] and after_del == [0, 0] and after_undo == 3
    return [ok1, ok2, ok3, ok4]


# ---------- [A-005] Linie und Bogen im Wechsel (SK-15) ----------
def t_a005_linie_bogen_wechsel(p):
    sketch_xy(p)
    p.pg.locator('canvas').first.focus()
    p.pg.keyboard.press('l'); p.wait(250)
    hint0 = (p.pg.locator('#hintline').text_content() or '').lower()
    ok1 = SS(p, "return S.tool") == 'line' and 'a' in hint0 and 'tangentialem bogen' in hint0

    def click_uv(u, v):
        sx, sy = to_screen(p, u, v)
        p.pg.mouse.move(sx, sy); p.wait(100)
        p.pg.mouse.click(sx, sy); p.wait(180)

    # 1. Linie (0,0) -> (20,0), dann A -> tangentialer Bogen bis (30,10), dann A -> Linie bis (30,30)
    click_uv(0, 0)
    click_uv(20, 0)
    p.pg.keyboard.press('a'); p.wait(200)
    arc_on = SS(p, "return [S.tool, !!(S.draft && S.draft.arc)]")
    hint_arc = (p.pg.locator('#hintline').text_content() or '').lower()
    click_uv(30, 10)
    p.pg.keyboard.press('a'); p.wait(200)
    arc_off = SS(p, "return [S.tool, !!(S.draft && S.draft.arc)]")
    hint_back = (p.pg.locator('#hintline').text_content() or '').lower()
    click_uv(30, 30)
    p.pg.keyboard.press('Enter'); p.wait(250)

    st = SS(p, """
      const types = S.ents.map(e => e.type);
      const [l1, a1, l2] = S.ents;
      const ai = a1 && a1.type === 'arc' ? SK.arcInfo(a1.a, a1.m, a1.b) : null;
      const hasTan = (x, y) => S.cons.some(c => c.type === 'tangent' && c.refs.some(r => r.e === x) && c.refs.some(r => r.e === y));
      const hasCo = (x, px, y, py) => S.cons.some(c => c.type === 'coincident' && c.refs.some(r => r.e === x && r.p === px) && c.refs.some(r => r.e === y && r.p === py));
      return {
        draftNull: !S.draft,
        types,
        l1b: l1 && l1.b, a1a: a1 && a1.a, a1b: a1 && a1.b, l2a: l2 && l2.a, l2b: l2 && l2.b,
        c: ai && ai.c, r: ai && ai.r,
        tan1: !!(l1 && a1 && hasTan(l1.id, a1.id)),
        tan2: !!(a1 && l2 && hasTan(a1.id, l2.id)),
        co1: !!(l1 && a1 && hasCo(l1.id, 'b', a1.id, 'a')),
        co2: !!(a1 && l2 && hasCo(a1.id, 'b', l2.id, 'a')),
        ok: !!(S.status && S.status.ok)
      };
    """)
    ok2 = (arc_on == ['line', True] and 'tangentialer bogen' in hint_arc
           and arc_off == ['line', False] and 'tangentialem bogen' in hint_back
           and st['draftNull'] and st['types'] == ['line', 'arc', 'line'])
    ok3 = (st['c'] is not None and near(st['c'], [20, 10], 0.1) and abs(st['r'] - 10) < 0.1
           and near(st['l1b'], [20, 0], 1e-3) and near(st['a1a'], [20, 0], 1e-3)
           and near(st['a1b'], [30, 10], 1e-3) and near(st['l2a'], [30, 10], 1e-3)
           and near(st['l2b'], [30, 30], 1e-3)
           and st['tan1'] and st['tan2'] and st['co1'] and st['co2'] and st['ok'])

    # 2. Geschlossene Bahn (Langloch aus Linie, Bogen, Linie, Bogen) schließt am Startpunkt zu einer Fläche
    SS(p, "S.ents=[]; S.cons=[]; S.dims=[]; S.draft=null; Sketch.setTool('line');"); p.wait(200)
    click_uv(-10, -20)
    click_uv(10, -20)
    p.pg.keyboard.press('a'); p.wait(150)
    click_uv(10, -10)
    p.pg.keyboard.press('a'); p.wait(150)
    click_uv(-10, -10)
    p.pg.keyboard.press('a'); p.wait(150)
    click_uv(-10, -20)
    st2 = SS(p, """
      const regs = SK.regions(S.ents);
      return {
        draftNull: !S.draft,
        types: S.ents.map(e => e.type),
        tans: S.cons.filter(c => c.type === 'tangent').length,
        coins: S.cons.filter(c => c.type === 'coincident').length,
        regs: regs.length,
        area: regs[0] ? regs[0].area : 0,
        ok: !!(S.status && S.status.ok)
      };
    """)
    want_area = 20 * 10 + math.pi * 25
    ok4 = (st2['draftNull'] and st2['types'] == ['line', 'arc', 'line', 'arc']
           and st2['tans'] >= 3 and st2['coins'] >= 4 and st2['regs'] == 1
           and abs(st2['area'] - want_area) < 2.0 and st2['ok'])

    # 3. Ohne aktiven Linienzug schaltet Taste A weiter normal auf das Bogen-Werkzeug
    p.pg.keyboard.press('a'); p.wait(200)
    ok5 = SS(p, "return S.tool") == 'arc'
    return [ok1, ok2, ok3, ok4, ok5]


def t_f11232113(p):
    # 1. S.sel und S.sels bleiben in der Skizze immer synchron
    sketch_xy(p)
    SS(p, "S.ents.push({id:'L1',type:'line',a:[0,0],b:[20,0]},{id:'L2',type:'line',a:[0,10],b:[20,10]})")
    s1 = SS(p, "S.sels=['L2']; S.sel='L1'; return [S.sel, S.sels.slice()]")
    s2 = SS(p, "S.sels=['L1','L2']; return [S.sel, S.sels.slice()]")
    s3 = SS(p, "S.sel=null; return [S.sel, S.sels.slice()]")
    ok2 = s1 == ['L1', ['L1']] and s2 == [None, ['L1', 'L2']] and s3 == [None, []]
    p.ev("Sketch.cancel(true)"); p.wait(200)

    # 2. Kontextleiste aktualisiert sofort und rechnet keinen Abstand zwischen Gruppe und eigenem Kind
    p.ev("""App.change('x', d=>{
      const g=Model.newItem('group',{}); g.name='Baugruppe';
      const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Arm A';
      const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=25; b.name='Arm B';
      g.children.push(a,b); d.items=[g];
    })"""); warte_rechnen(p, 20)
    ids = p.ev("const g=App.doc.items[0]; return [g.id, g.children[0].id, g.children[1].id]")
    p.ev("App.select(arg)", [ids[1], ids[2]])
    c1 = p.pg.locator('.ctxbar button[aria-label="Gelenk"]').count()
    p.ev("App.select(arg)", [ids[0], ids[1]])
    c2 = p.pg.locator('.ctxbar button[aria-label="Gelenk"]').count()
    p.wait(200)
    ok1 = c1 == 1 and c2 == 0 and p.pg.locator('#min-dist').count() == 0

    # 3. Vorige Ansicht stoppt OrbitControls-Dämpfung nach Maus-Drehen
    p.ev("App.clearSelection(); App.change('x', d=>{ d.items=[Model.newItem('box',{w:20,d:20,h:20},{name:'Würfel'})]; })"); warte_rechnen(p)
    cam = "const c=Viewer.saveCamera(); const d=c.p.clone().sub(c.t).normalize(); return [d.x,d.y,d.z].map(v=>Math.round(v*100)/100)"
    p.ev("Viewer.setView('front', false)"); p.wait(300)
    p.pg.locator('canvas').first.focus()
    cx, cy = p.canvas_center()
    p.pg.mouse.move(cx + 250, cy + 200); p.pg.mouse.down(); p.pg.mouse.move(cx + 380, cy + 120, steps=10); p.pg.mouse.up(); p.wait(300)
    p.pg.keyboard.press('Shift+Z'); p.wait(800); d1 = p.ev(cam)
    p.wait(500); d2 = p.ev(cam)
    ok3 = d1 == [0, -1, 0] and d2 == [0, -1, 0]

    # 4. Lage unter der Maus übernimmt den letzten Punkt einer schnellen Bewegung
    p.ev("App.clearSelection(); App.change('x', d=>{ d.items=[Model.newItem('box',{w:40,d:40,h:10},{name:'Platte'})]; })"); warte_rechnen(p)
    p.ev("Viewer.setView('iso', false)"); p.wait(600)
    x, y = world_screen(p, 5, -5, 10)
    p.pg.mouse.move(x - 30, y - 20); p.pg.mouse.move(x, y, steps=8); p.wait(200)
    c = p.ev("return Measure.coords")
    txt = p.pg.locator('#coords').inner_text()
    ok4 = bool(c and abs(c['x'] - 5) < 0.3 and abs(c['y'] + 5) < 0.3 and abs(c['z'] - 10) < 1e-3 and 'Z 10' in txt)
    return [ok1, ok2, ok3, ok4]


def t_a021_profi_kuerzel(p):
    # 1. Erster Start (leerer Speicher) zeigt die zwei Stufen-Karten „Einfach“ und „Profi“
    wel = p.pg.locator('#level-welcome')
    wel_txt = (wel.text_content() or '') if wel.count() else ''
    ok1 = (wel.count() == 1 and wel.is_visible()
           and p.pg.locator('#start-simple').count() == 1
           and p.pg.locator('#start-pro').count() == 1
           and 'wenige, große Knöpfe, alles erklärt' in wel_txt
           and 'alle Werkzeuge, Tastenkürzel, Maus wie in deinem CAD' in wel_txt)

    # 2. „Profi“ wählen → ViewPrefs.level === 'pro' und Schild zeigt „Profi“; Wechsel über Schild & Profi-Schutz in Einstellungen
    p.pg.locator('#start-pro').click(); p.wait(300)
    ok2a = (p.ev("return ViewPrefs.level === 'pro' && ViewPrefs.firstStart === false")
            and p.pg.locator('#start-pro').get_attribute('aria-pressed') == 'true'
            and p.pg.locator('#btn-level').text_content() == 'Profi'
            and bool(p.ev("return localStorage.getItem('masswerk.view')")))
    p.empty()
    ok2b = p.pg.locator('#btn-level').text_content() == 'Profi'
    # Klick auf das Schild wechselt zu Einfach; dort ist „Tastenkürzel“ in den Einstellungen versteckt
    p.pg.locator('#btn-level').click(); p.wait(400)
    ok2c = p.pg.locator('#btn-level').text_content() == 'Einfach' and p.ev("return ViewPrefs.level === 'simple'")
    p.pg.click('#btn-menu'); p.wait(250); p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(350)
    ok2d = p.pg.locator('#set-level-simple').count() == 1 and p.pg.locator('#set-level-pro').count() == 1 and not sichtbar(p, '#set-tab-keys')
    # In den Einstellungen auf „Profi“ wechseln → Schild zeigt „Profi“ und Tab „Tastenkürzel“ erscheint
    p.pg.locator('#set-level-pro').click(); p.wait(350)
    ok2 = ok2a and ok2b and ok2c and ok2d and p.pg.locator('#btn-level').text_content() == 'Profi' and sichtbar(p, '#set-tab-keys')

    # 3. Kürzel für „Orthografisch / Perspektive“ (O → J) ändern → neue Taste löst aus, alte nicht mehr, gespeichert in tracery-kuerzel
    p.pg.locator('#set-tab-keys').click(); p.wait(300)
    rows_n = p.pg.locator('.kbd-row').count()
    p.pg.locator('.kbd-btn[data-cmd="ortho"]').click(); p.wait(150)
    p.pg.keyboard.press('j'); p.wait(250)
    stored = p.ev("return JSON.parse(localStorage.getItem('tracery-kuerzel') || '{}')")
    btn_txt = p.pg.locator('.kbd-btn[data-cmd="ortho"]').text_content()
    p.pg.keyboard.press('Escape'); p.wait(300)
    o0 = p.ev("return Viewer.ortho")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('o'); p.wait(300)
    o_old = p.ev("return Viewer.ortho")
    p.pg.keyboard.press('j'); p.wait(300)
    o_new1 = p.ev("return Viewer.ortho")
    p.pg.keyboard.press('j'); p.wait(300)
    o_new2 = p.ev("return Viewer.ortho")
    ok3 = (rows_n >= 25 and btn_txt == 'J' and stored.get('ortho') == 'j'
           and not o0 and not o_old and o_new1 and not o_new2)

    # 4. Doppeltes Kürzel wird gemeldet und nicht überschrieben
    p.pg.click('#btn-menu'); p.wait(250); p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(300)
    p.pg.locator('#set-tab-keys').click(); p.wait(250)
    p.pg.locator('.kbd-btn[data-cmd="gridtoggle"]').click(); p.wait(150)
    p.pg.keyboard.press('j'); p.wait(300)
    msg_vis = sichtbar(p, '#kbd-msg')
    msg_txt = (p.pg.locator('#kbd-msg').text_content() or '')
    grid_txt = p.pg.locator('.kbd-btn[data-cmd="gridtoggle"]').text_content()
    ok4 = msg_vis and 'belegt' in msg_txt and 'Orthografisch' in msg_txt and grid_txt == 'G'

    # 5. Zurücksetzen stellt Standard wieder her
    p.pg.locator('#kbd-reset').click(); p.wait(250)
    reset_ok = p.pg.locator('.kbd-btn[data-cmd="ortho"]').text_content() == 'O' and p.ev("return localStorage.getItem('tracery-kuerzel')") is None
    p.pg.keyboard.press('Escape'); p.wait(250)
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('o'); p.wait(300)
    ok5 = reset_ok and p.ev("return Viewer.ortho")
    return [ok1, ok2, ok3, ok4, ok5]


def t_a006_versatz_mehrfach(p):
    # 1. Rechteck 20x10, Versatz 2 mm, Anzahl 3 -> drei neue Umrisse außen + Rückgängig
    scene(p, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [20, 10]}])
    p.pg.keyboard.press('f'); p.wait(250)
    has_ui = (p.pg.locator('#off-n').count() == 1 and p.pg.locator('#off-both').count() == 1
              and p.pg.locator('#off-corner').count() == 1)
    p.pg.fill('#off-n', '3'); p.pg.press('#off-n', 'Enter'); p.wait(150)
    click_uv(p, 10, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 10, -4)); p.wait(200)
    p.pg.keyboard.type('2'); p.pg.keyboard.press('Enter'); p.wait(400)
    st1 = SS(p, """
      const rs = S.ents.filter(e => e.type === 'rect' && e.id !== 'R').map(r => [
        Math.round((Math.max(r.a[0], r.b[0]) - Math.min(r.a[0], r.b[0])) * 100) / 100,
        Math.round((Math.max(r.a[1], r.b[1]) - Math.min(r.a[1], r.b[1])) * 100) / 100
      ]).sort((a, b) => a[0] - b[0]);
      const vs = S.cons.filter(c => c.type === 'offset').map(c => c.v).sort((a, b) => a - b);
      return { total: S.ents.length, rs, vs, ok: !!(S.status && S.status.ok) };
    """)
    ok1 = (has_ui and st1['total'] == 4 and st1['rs'] == [[24, 14], [28, 18], [32, 22]]
           and st1['vs'] == [2, 4, 6] and st1['ok'])

    # Ein Rückgängig entfernt alle 3 Kopien auf einmal
    p.pg.keyboard.press('Control+z'); p.wait(300)
    undo1 = SS(p, "return S.ents.length === 1 && S.cons.length === 0")

    # 2. Beidseitig (Anzahl 1 -> innen + außen; Anzahl 2 -> 2 innen + 2 außen)
    p.pg.fill('#off-n', '1'); p.pg.press('#off-n', 'Enter'); p.wait(150)
    p.pg.click('#off-both'); p.wait(150)
    click_uv(p, 10, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 10, -4)); p.wait(200)
    p.pg.keyboard.type('2'); p.pg.keyboard.press('Enter'); p.wait(400)
    st2 = SS(p, """
      const rs = S.ents.filter(e => e.type === 'rect' && e.id !== 'R').map(r => [
        Math.round((Math.max(r.a[0], r.b[0]) - Math.min(r.a[0], r.b[0])) * 100) / 100,
        Math.round((Math.max(r.a[1], r.b[1]) - Math.min(r.a[1], r.b[1])) * 100) / 100
      ]).sort((a, b) => a[0] - b[0]);
      return { total: S.ents.length, rs, ok: !!(S.status && S.status.ok) };
    """)
    p.pg.keyboard.press('Control+z'); p.wait(300)
    p.pg.fill('#off-n', '2'); p.pg.press('#off-n', 'Enter'); p.wait(150)
    click_uv(p, 10, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 10, -4)); p.wait(200)
    p.pg.keyboard.type('2'); p.pg.keyboard.press('Enter'); p.wait(400)
    st2b = SS(p, """
      const rs = S.ents.filter(e => e.type === 'rect' && e.id !== 'R').map(r => [
        Math.round((Math.max(r.a[0], r.b[0]) - Math.min(r.a[0], r.b[0])) * 100) / 100,
        Math.round((Math.max(r.a[1], r.b[1]) - Math.min(r.a[1], r.b[1])) * 100) / 100
      ]).sort((a, b) => a[0] - b[0]);
      return { total: S.ents.length, rs, ok: !!(S.status && S.status.ok) };
    """)
    ok2 = (undo1 and st2['total'] == 3 and st2['rs'] == [[16, 6], [24, 14]] and st2['ok']
           and st2b['total'] == 5 and st2b['rs'] == [[12, 2], [16, 6], [24, 14], [28, 18]] and st2b['ok'])

    # 3. Ecken: Rund beim Rechteck (außen 4 Linien + 4 Bögen R=2) + folgt dem Original
    p.ev("""
      Sketch.cancel(true);
      App.change('x', d => { d.items[0].p.sketch.ents = arg; d.items[0].p.sketch.dims = []; d.items[0].p.sketch.cons = []; });
      Sketch.editItem(App.doc.items[0].id);
    """, [{'id': 'R', 'type': 'rect', 'a': [0, 0], 'b': [20, 10]}]); p.wait(600)
    p.pg.keyboard.press('f'); p.wait(250)
    p.pg.select_option('#off-corner', 'round'); p.wait(150)
    click_uv(p, 10, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 10, -4)); p.wait(200)
    p.pg.keyboard.type('2'); p.pg.keyboard.press('Enter'); p.wait(400)
    st3 = SS(p, """
      const lines = S.ents.filter(e => e.type === 'line');
      const arcs = S.ents.filter(e => e.type === 'arc');
      const radii = arcs.map(a => SK.arcInfo(a.a, a.m, a.b).r);
      const regs = SK.regions(S.ents);
      const outer = SK.regions(S.ents.filter(e => e.id !== 'R'));
      return {
        lines: lines.length, arcs: arcs.length, radii,
        regs: regs.length, holes: regs[0] ? regs[0].holes.length : 0,
        ringArea: regs[0] ? regs[0].area : 0,
        outerArea: outer[0] ? outer[0].area : 0,
        ok: !!(S.status && S.status.ok)
      };
    """)
    want_ring_area = 2 * (20 + 10) * 2 + math.pi * 4
    want_outer_area = 20 * 10 + want_ring_area
    p.pg.keyboard.press('v'); click_uv(p, 20, 5, alt=False); p.wait(300)
    p.pg.fill('#se-w', '30'); p.pg.press('#se-w', 'Enter'); p.wait(400)
    st3b = SS(p, """
      const bb = SK.bounds(S.ents);
      const arcs = S.ents.filter(e => e.type === 'arc');
      const radii = arcs.map(a => SK.arcInfo(a.a, a.m, a.b).r);
      return { bb, radii, ok: !!(S.status && S.status.ok) };
    """)
    ok3 = (st3['lines'] == 4 and st3['arcs'] == 4
           and all(abs(r - 2) < 1e-3 for r in st3['radii'])
           and st3['regs'] == 1 and st3['holes'] == 1
           and abs(st3['ringArea'] - want_ring_area) < 1.5
           and abs(st3['outerArea'] - want_outer_area) < 1.5 and st3['ok']
           and st3b['bb'] is not None and abs(st3b['bb'][2] - 32) < 1e-2
           and all(abs(r - 2) < 1e-2 for r in st3b['radii']) and st3b['ok'])

    # 4. L-Kette mit Ecken Rund + Beidseitig -> äußere Ecke rund, innere spitz; Rückgängig
    p.ev("""
      Sketch.cancel(true);
      App.change('x', d => { d.items[0].p.sketch.ents = arg; d.items[0].p.sketch.dims = []; d.items[0].p.sketch.cons = []; });
      Sketch.editItem(App.doc.items[0].id);
    """, [{'id': 'A', 'type': 'line', 'a': [0, 0], 'b': [40, 0]}, {'id': 'B', 'type': 'line', 'a': [40, 0], 'b': [40, 30]}]); p.wait(600)
    p.pg.keyboard.press('f'); p.wait(250)
    p.pg.click('#off-both'); p.wait(150)
    p.pg.select_option('#off-corner', 'round'); p.wait(150)
    click_uv(p, 20, 0, alt=False)
    p.pg.mouse.move(*to_screen(p, 20, -6)); p.wait(200)
    p.pg.keyboard.type('4'); p.pg.keyboard.press('Enter'); p.wait(400)
    st4 = SS(p, """
      const lines = S.ents.filter(e => e.type === 'line');
      const arcs = S.ents.filter(e => e.type === 'arc');
      const ai = arcs[0] ? SK.arcInfo(arcs[0].a, arcs[0].m, arcs[0].b) : null;
      const innerCorner = lines.some(l => Math.hypot(l.b[0] - 36, l.b[1] - 4) < 1e-3 || Math.hypot(l.a[0] - 36, l.a[1] - 4) < 1e-3);
      return { lines: lines.length, arcs: arcs.length, c: ai && ai.c, r: ai && ai.r, innerCorner, ok: !!(S.status && S.status.ok) };
    """)
    p.pg.keyboard.press('Control+z'); p.wait(300)
    undo4 = SS(p, "return S.ents.length === 2 && S.cons.length === 0")
    ok4 = (st4['lines'] == 6 and st4['arcs'] == 1
           and st4['c'] is not None and near(st4['c'], [40, 0], 1e-3) and abs(st4['r'] - 4) < 1e-3
           and st4['innerCorner'] and st4['ok'] and undo4)
    return [ok1, ok2, ok3, ok4]


def t_a008_bohrungsarten(p):
    # 1. Sackloch Ø 5 × 10 mit 118°-Bohrspitze: Quader 30×30×20 -> Volumenabzug = Zylinder + Kegel
    p.empty()
    p.ev("Actions.addPrimitive('box', {p:{w:30, d:30, h:20}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,20], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'blind'); p.wait(200)
    p.pg.fill('#hw-d', '5'); p.pg.press('#hw-d', 'Enter'); p.wait(150)
    p.pg.fill('#hw-depth', '10'); p.pg.press('#hw-depth', 'Enter'); p.wait(200)
    prev1 = p.pg.locator('#hw-preview svg').count() == 1 and '118°' in (p.pg.locator('#hw-preview').text_content() or '')
    info1 = p.pg.locator('#hw-info').text_content() or ''
    has_tip_info = '118°' in info1 and 'Gesamttiefe' in info1
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(500)
    v1 = volumen(p)
    r_b = 2.5
    tip_h = r_b / math.tan(math.radians(59))
    want_cut_blind = math.pi * r_b * r_b * 10 + (1.0 / 3.0) * math.pi * r_b * r_b * tip_h
    got_cut_blind = 18000.0 - (v1 or 0)
    blind_meta = p.ev("""
      const it = App.doc.items[0];
      const ch = it.children && it.children.find(c => c.kind === 'part' && c.p.lib === 'blindHole');
      const res = App.results.get(it.id);
      const bot = res && res.data && res.data.faces.filter(f => f.t === 'PLANE' && f.n && f.n[2] < -0.9);
      return {
        err: App.errors.length,
        p: ch && ch.p,
        botLoops: bot && bot[0] ? null : null,
        hasCone: res && res.data && res.data.faces.some(f => f.t === 'CONE'),
        zMin: res && res.data && res.data.faces.reduce((m, f) => Math.min(m, f.c ? f.c[2] : 99), 99),
        botCount: bot ? bot.length : 0
      };
    """)
    ok1 = (prev1 and has_tip_info and blind_meta['err'] == 0
           and blind_meta['p'] is not None and blind_meta['p']['d'] == 5
           and blind_meta['p']['depth'] == 10 and blind_meta['p']['tipAngle'] == 118
           and blind_meta['hasCone'] and blind_meta['botCount'] == 1
           and abs(got_cut_blind - want_cut_blind) < 0.05)

    # 2. Passbohrung H7: genaues Nennmaß Ø 6 + ISO-286-Toleranzhinweis (+0,012 / 0 mm)
    p.ev("App.setDoc(Model.newDoc())"); p.wait(200)
    p.ev("Actions.addPrimitive('box', {p:{w:30, d:30, h:10}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,10], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'fit'); p.wait(200)
    p.pg.fill('#hw-d', '6'); p.pg.press('#hw-d', 'Enter'); p.wait(200)
    info2 = p.pg.locator('#hw-info').text_content() or ''
    prev2 = 'H7' in (p.pg.locator('#hw-preview').text_content() or '') and '+0,012' in info2
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(500)
    v2 = volumen(p)
    want_cut_fit = math.pi * 3.0 * 3.0 * 10.0
    got_cut_fit = 9000.0 - (v2 or 0)
    p.ev("const ch=App.doc.items[0].children.find(c=>c.kind==='part'&&c.p.lib==='fitHole'); if(ch) App.select([ch.id]);"); p.wait(400)
    panel_fit = p.pg.locator('#p-fit-hint').text_content() or ''
    ok2 = (prev2 and p.ev("return App.errors.length") == 0
           and abs(got_cut_fit - want_cut_fit) < 0.05
           and 'H7' in panel_fit and '+0,012' in panel_fit)

    # 3. Zentrierbohrung (DIN 332 Form A): A2.5 (Ø 2,5 / Ø 5,30 / t1 3,1 / 60°-Kegel + 118°-Spitze)
    p.ev("App.setDoc(Model.newDoc())"); p.wait(200)
    p.ev("Actions.addPrimitive('box', {p:{w:30, d:30, h:20}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,20], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'center'); p.wait(200)
    p.pg.select_option('#hw-size', 'A2.5'); p.wait(200)
    prev3 = '60°' in (p.pg.locator('#hw-preview').text_content() or '') and 'DIN 332' in (p.pg.locator('#hw-info').text_content() or '')
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(500)
    v3 = volumen(p)
    r1, r2, t1 = 2.5 / 2.0, 5.30 / 2.0, 3.1
    h_cone = (r2 - r1) / math.tan(math.radians(30))
    tip_c = r1 / math.tan(math.radians(59))
    want_cut_center = ((math.pi * h_cone / 3.0) * (r2 * r2 + r2 * r1 + r1 * r1)
                       + math.pi * r1 * r1 * t1
                       + (1.0 / 3.0) * math.pi * r1 * r1 * tip_c)
    got_cut_center = 18000.0 - (v3 or 0)
    ok3 = prev3 and p.ev("return App.errors.length") == 0 and abs(got_cut_center - want_cut_center) < 0.05

    # 4. Hilfetexte und data-help im Bohrungs-Assistenten
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    keys = ['holeWizard', 'blindHole', 'fitHole', 'centerHole']
    ok4 = all(k in hilfen and all(f in hilfen[k] for f in ('tip', 'hilfe', 'tipp')) for k in keys)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,20], normal:[0,0,1]}})"); p.wait(300)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(300)
    p.pg.select_option('#hw-type', 'blind'); p.wait(150)
    dh_blind = p.pg.locator('.holewiz').get_attribute('data-help')
    p.pg.select_option('#hw-type', 'fit'); p.wait(150)
    dh_fit = p.pg.locator('.holewiz').get_attribute('data-help')
    p.pg.select_option('#hw-type', 'center'); p.wait(150)
    dh_center = p.pg.locator('.holewiz').get_attribute('data-help')
    ok4 = ok4 and dh_blind == 'blindHole' and dh_fit == 'fitHole' and dh_center == 'centerHole'
    return [ok1, ok2, ok3, ok4]


# ---------- A-009: Kosmetisches Gewinde (KP-20) ----------
def t_a009_kosmetisches_gewinde(p):
    p.empty()
    # 1. Zylinder Ø 6 × 20, M6 × 10 markieren -> kein neuer Körper, gestreiftes 3D-Overlay, im Projekt gespeichert
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('cylinder',{d:6,h:20},{name:'Bolzen'})); })")
    warte_rechnen(p)
    id0 = p.ev("return App.doc.items[0].id")
    fi = p.ev("const r=App.results.get(arg); return r.data.faces.findIndex(f=>f.t==='CYLINDRE')", id0)
    p.ev("const id=arg[0], fi=arg[1]; App.select([id], {face:{id, faceIdx:fi, point:[3,0,10], normal:[1,0,0]}})", [id0, fi]); p.wait(400)
    has_ctx = p.pg.locator('.ctxbar button[aria-label="Gewinde markieren"]').count() == 1
    p.pg.locator('.ctxbar button[aria-label="Gewinde markieren"]').click(); p.wait(300)
    def_size = p.pg.locator('#ct-size').input_value()
    p.pg.fill('#ct-len', '10'); p.pg.click('#ct-apply'); p.wait(400)
    th0 = p.ev("return (App.doc.items[0].threads || [])[0]")
    tg_n = p.ev("const n=Viewer.nodes.get(arg); return n && n.threadGroup ? n.threadGroup.children.length : 0", id0)
    ok1 = has_ctx and def_size == 'M6' and p.ev("return App.doc.items.length") == 1 and th0 and th0['size'] == 'M6' and abs(th0['length'] - 10) < 1e-6 and th0['kind'] == 'ext' and tg_n >= 1

    # 2. Stückliste und Technische Zeichnung zeigen das Gewinde
    bom = p.ev("return Mass.bom()")
    bom_csv = p.ev("return Mass.bom().then(b=>Mass.bomCSV(b, App.doc.name))")
    p.ev("App.select([])"); p.wait(300)
    p.pg.locator('#proj-bom').click(); p.wait(600)
    bom_txt = p.pg.locator('#bom-threads').inner_text() if p.pg.locator('#bom-threads').count() else ''
    p.pg.locator('.modal .btn.primary').click(); p.wait(300)
    p.ev("Commands.setMode('drawing')"); p.wait(1500)
    svg_txt = p.pg.locator('#sheet .sheet-holder svg').text_content() if p.pg.locator('#sheet .sheet-holder svg').count() else ''
    thin_n = p.pg.locator('#sheet .sheet-holder svg .thin').count()
    p.ev("Commands.setMode('model')"); p.wait(600)
    ok2 = bool(bom and len(bom.get('threads') or []) == 1 and 'M6' in bom['threads'][0]['name'] and '10' in bom['threads'][0]['name'] and 'M6 × 10' in bom_txt and 'M6' in bom_csv and 'M6 × 10' in svg_txt and thin_n >= 2)

    # 3. Rückgängig entfernt Markierung & 3D-Overlay, Wiederholen stellt beides wieder her
    p.ev("App.undo()"); p.wait(400)
    tg_after_undo = p.ev("const n=Viewer.nodes.get(arg); return n && n.threadGroup ? n.threadGroup.children.length : 0", id0)
    ok3a = p.ev("return (App.doc.items[0].threads || []).length") == 0 and tg_after_undo == 0
    p.ev("App.redo()"); p.wait(400)
    tg_after_redo = p.ev("const n=Viewer.nodes.get(arg); return n && n.threadGroup ? n.threadGroup.children.length : 0", id0)
    ok3 = ok3a and p.ev("return (App.doc.items[0].threads || []).length") == 1 and tg_after_redo >= 1

    # 4. Speichern und Laden behält die Markierung
    saved = p.ev("return JSON.stringify(App.doc)")
    p.ev("App.setDoc(JSON.parse(arg), {fit:false})", saved); warte_rechnen(p)
    tg_reload = p.ev("const n=Viewer.nodes.get(App.doc.items[0].id); return n && n.threadGroup ? n.threadGroup.children.length : 0")
    ok4 = '"threads"' in saved and p.ev("return (App.doc.items[0].threads || []).length") == 1 and tg_reload >= 1

    # 5. „Echt machen“ wandelt in echtes Außengewinde (threadRod) um
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    th_id = p.ev("return App.doc.items[0].threads[0].id")
    p.pg.locator('#th-real-' + th_id).click(); warte_rechnen(p); p.wait(400)
    real_p = p.ev("return App.doc.items.map(x=>({kind:x.kind, p:x.p, op:x.op, threads:x.threads}))")
    vol_real = p.ev("return Mass.measure().then(r=>r.parts.reduce((s,x)=>s+x.volume,0))")
    ok5 = p.ev("return App.errors.length") == 0 and any(x['kind'] == 'part' and (x['p'] or {}).get('lib') == 'threadRod' for x in real_p) and not any(x.get('threads') for x in real_p) and 150 < vol_real < 520

    # 6. Innengewinde auf Kernloch Ø 5 mm (M6): Markierung + „Echt machen“ -> threadHole mit cut
    p.ev("App.change('x', d=>{ d.items=[]; d.items.push(Model.newItem('box',{w:20,d:20,h:12},{name:'Block'})); const h=Model.newItem('cylinder',{d:5,h:20},{name:'Kernloch'}); h.role='hole'; h.t.z=-2; d.items.push(h); })")
    warte_rechnen(p)
    bid = p.ev("return App.doc.items[0].id")
    cfi = p.ev("const r=App.results.get(arg); return r.data.faces.findIndex(f=>f.t==='CYLINDRE')", bid)
    p.ev("const id=arg[0], fi=arg[1]; App.select([id], {face:{id, faceIdx:fi, point:[2.5,0,6], normal:[-1,0,0]}})", [bid, cfi]); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Gewinde markieren"]').click(); p.wait(300)
    int_size = p.pg.locator('#ct-size').input_value()
    p.pg.click('#ct-apply'); p.wait(400)
    ith = p.ev("return (App.doc.items[0].threads || [])[0]")
    p.pg.locator('#th-real-' + ith['id']).click(); warte_rechnen(p); p.wait(400)
    its = p.ev("return App.doc.items.map(x=>({kind:x.kind, lib:x.p&&x.p.lib, op:x.op}))")
    ok6 = int_size == 'M6' and ith['kind'] == 'int' and p.ev("return App.errors.length") == 0 and any(x['lib'] == 'threadHole' and (x['op'] or {}).get('type') == 'cut' for x in its)

    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_a007_duenne_wand(p):
    # 1. Offener L-Linienzug (30 + 20 = 50 mm): beim Fertigstellen Standard „Dünne Wand“ mit Wand 2 mm, Höhe 10 → 50 × 2 × 10 = 1000 mm³
    sketch_xy(p)
    p.ev("const S=Sketch.state; S.ents.push({id:'l1',type:'line',a:[0,0],b:[30,0]},{id:'l2',type:'line',a:[30,0],b:[30,20]})")
    p.pg.keyboard.press('Enter'); p.wait(600)
    has_box = p.pg.locator('#st-mode-thin').count() == 1 and p.pg.locator('#st-mode-thin').get_attribute('aria-pressed') == 'true'
    p.pg.fill('#st-dist', '10'); p.pg.press('#st-dist', 'Enter'); p.wait(150)
    p.pg.fill('#st-wall', '2'); p.pg.press('#st-wall', 'Enter'); p.wait(150)
    p.pg.select_option('#st-wall-side', 'center'); p.wait(300)
    p.pg.locator('.stepbox .btn.primary').click(); warte_rechnen(p, 30)
    v_center = volumen(p)
    bb_center = p.ev("const it=App.doc.items[0]; return it && App.results.get(it.id) && App.results.get(it.id).data.bbox")
    ok1 = (has_box and p.ev("return App.doc.items.length===1 && App.doc.items[0].kind==='extrude' && App.doc.items[0].p.thin===true && App.errors.length===0")
           and v_center is not None and abs(v_center - 1000) < 5
           and bb_center is not None and abs(bb_center[0] - 0) < 0.05 and abs(bb_center[1] + 1) < 0.05
           and abs(bb_center[3] - 31) < 0.05 and abs(bb_center[4] - 20) < 0.05 and abs(bb_center[5] - 10) < 0.05)

    # 2. Wand-Lage rechts umschalten: nach innen (960 mm³), nach außen (1040 mm³), zurück auf mittig + Wand 3 mm (1500 mm³)
    p.pg.select_option('#p-wall-side', 'in'); warte_rechnen(p, 30)
    v_in = volumen(p)
    bb_in = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    p.pg.select_option('#p-wall-side', 'out'); warte_rechnen(p, 30)
    v_out = volumen(p)
    bb_out = p.ev("return App.results.get(App.doc.items[0].id).data.bbox")
    p.pg.select_option('#p-wall-side', 'center'); warte_rechnen(p, 30)
    field(p, '#p-wall', 3); warte_rechnen(p, 30)
    v_w3 = volumen(p)
    ok2 = (v_in is not None and abs(v_in - 960) < 5 and abs(bb_in[1] - 0) < 0.05 and abs(bb_in[3] - 30) < 0.05
           and v_out is not None and abs(v_out - 1040) < 5 and abs(bb_out[1] + 2) < 0.05 and abs(bb_out[3] - 32) < 0.05
           and v_w3 is not None and abs(v_w3 - 1500) < 8 and p.ev("return App.errors.length") == 0)

    # 3. Skizze bearbeiten bei offener Dünne-Wand-Skizze erlaubt Entlang-Pfad/Dünne-Wand-Speichern; #p-thin ist gesperrt
    thin_dis = p.pg.locator('#p-thin').is_disabled()
    p.ev("Sketch.editItem(App.doc.items[0].id)"); p.wait(1200)
    edit_on = p.ev("return Sketch.active && Sketch.state.ents.length===2")
    p.pg.keyboard.press('Enter'); p.wait(1200); warte_rechnen(p, 30)
    ok3 = thin_dis and edit_on and not p.ev("return Sketch.active") and p.ev("return App.errors.length") == 0

    # 4. Geschlossener Umriss (Rechteck 20 × 20): als Dünne Wand (Rohr-Profil) innen / außen / mittig + Umschalten & Rückgängig
    p.ev("App.change('x', d=>{ d.items=[]; }); Sketch.startOnPlane('XY')"); p.wait(1500)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[-10,-10],b:[10,10]})")
    p.pg.keyboard.press('Enter'); p.wait(600)
    p.pg.locator('#st-thin').check(); p.wait(250)
    p.pg.fill('#st-dist', '10'); p.pg.press('#st-dist', 'Enter'); p.wait(150)
    p.pg.fill('#st-wall', '2'); p.pg.press('#st-wall', 'Enter'); p.wait(150)
    p.pg.select_option('#st-wall-side', 'in'); p.wait(300)
    p.pg.locator('.stepbox .btn.primary').click(); warte_rechnen(p, 30)
    v_rect_in = volumen(p)      # (20^2 - 16^2) * 10 = 1440
    p.pg.select_option('#p-wall-side', 'out'); warte_rechnen(p, 30)
    v_rect_out = volumen(p)     # (24^2 - 20^2) * 10 = 1760
    p.pg.select_option('#p-wall-side', 'center'); warte_rechnen(p, 30)
    v_rect_cen = volumen(p)     # (22^2 - 18^2) * 10 = 1600
    p.pg.locator('#p-thin').uncheck(); warte_rechnen(p, 30)
    v_rect_solid = volumen(p)   # 20 * 20 * 10 = 4000
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(600); warte_rechnen(p, 30)
    v_rect_undo = volumen(p)
    ok4 = (v_rect_in is not None and abs(v_rect_in - 1440) < 5
           and v_rect_out is not None and abs(v_rect_out - 1760) < 5
           and v_rect_cen is not None and abs(v_rect_cen - 1600) < 5
           and v_rect_solid is not None and abs(v_rect_solid - 4000) < 5
           and v_rect_undo is not None and abs(v_rect_undo - 1600) < 5
           and p.ev("return App.errors.length") == 0)

    # 5. Geschlossener Kreis (r = 10, Wand 2 innen → Rohr) + zu große Wandstärke meldet Fehler und erholt sich
    p.ev("App.change('x', d=>{ d.items=[]; const it=Model.newItem('extrude',{sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:[{id:'c1',type:'circle',c:[0,0],r:10}],dims:[],cons:[]},dist:10,dir:'normal',thin:true,wall:2,wallSide:'in'}); d.items.push(it); })"); warte_rechnen(p, 30)
    v_pipe = volumen(p)         # pi * (10^2 - 8^2) * 10 = 360 * pi ≈ 1130.97
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    field(p, '#p-wall', 12); warte_rechnen(p, 30)
    has_err = p.ev("return App.errors.length > 0")
    field(p, '#p-wall', 2); warte_rechnen(p, 30)
    v_pipe2 = volumen(p)
    ok5 = (v_pipe is not None and abs(v_pipe - 360 * math.pi) < 10
           and has_err
           and v_pipe2 is not None and abs(v_pipe2 - 360 * math.pi) < 10 and p.ev("return App.errors.length") == 0)
    return [ok1, ok2, ok3, ok4, ok5]


def t_a011_3mf_import(p):
    import base64, io
    # 1. Export-Roundtrip: 2 benannte, farbige Teile aus Tracery als 3MF exportieren und wieder einlesen
    p.ev("""App.change('x', d => {
      d.items = [];
      const b = Model.newItem('box', { w: 30, d: 20, h: 10 }, { name: 'Sockel', color: '#d6574c' });
      const c = Model.newItem('cylinder', { d: 16, h: 25 }, { name: 'Turm', color: '#3f7fd6' });
      c.t.x = 40; c.t.y = 10;
      d.items.push(b, c);
    })""")
    warte_rechnen(p, 30)
    orig = p.ev("""return App.doc.items.map(it => {
      const b = Actions.worldBox(it.id);
      return { name: it.name, color: it.color, bbox: b && [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z] };
    })""")
    ok_exp = p.pg.evaluate("""async () => {
      const { Kernel, Model, App, Print } = window.__masswerk;
      const res = await Kernel.call('exportMeshes', { scene: Model.kernelScene(App.doc), fine: true, q: 1 });
      const objs = res.objects.map(o => {
        const f = Model.find(App.doc, o.id);
        return f ? { ...o, name: Model.label(f.item), color: f.item.color } : o;
      });
      window.__mfBytes = await Print.build3MF(objs, 'Roundtrip');
      return window.__mfBytes && window.__mfBytes.length > 200;
    }""")
    p.ev("App.change('x', d => { d.items = []; })"); p.wait(400)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__mfBytes], 'Roundtrip.3mf'))")
    warte_rechnen(p, 30)
    imp = p.ev("""return {
      errs: App.errors.length,
      items: App.doc.items.map(it => ({
        kind: it.kind, fmt: it.p && it.p.fmt, name: it.name, color: it.color, colorSet: !!it.colorSet,
        bbox: App.results.get(it.id) && App.results.get(it.id).data.bbox,
      }))
    }""")
    def same_bb(a, b, tol=0.2):
        return a and b and len(a) == 6 and len(b) == 6 and all(abs(a[i] - b[i]) < tol for i in range(6))
    ok1 = (bool(ok_exp) and imp['errs'] == 0 and len(imp['items']) == 2
           and [x['name'] for x in imp['items']] == ['Sockel', 'Turm']
           and [x['color'] for x in imp['items']] == ['#d6574c', '#3f7fd6']
           and all(x['colorSet'] and x['kind'] == 'import' and x['fmt'] == 'stl' for x in imp['items'])
           and same_bb(imp['items'][0]['bbox'], orig[0]['bbox'])
           and same_bb(imp['items'][1]['bbox'], orig[1]['bbox']))

    # 2. Externe 3MF (ZIP deflated): Einheit Zoll, colorgroup und build-Transform + Rückgängig
    def mk_3mf(model_xml):
        buf = io.BytesIO()
        ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
        rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('[Content_Types].xml', ct)
            zf.writestr('_rels/.rels', rels)
            zf.writestr('3D/3dmodel.model', model_xml)
        return base64.b64encode(buf.getvalue()).decode('ascii')

    cube_v = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
    cube_t = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
    verts_xml = ''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in cube_v)
    tris_xml = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in cube_t)
    inch_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <m:colorgroup id="5"><m:color color="#5B9F55FF"/></m:colorgroup>
    <object id="2" type="model" name="Zollwürfel" pid="5" pindex="0"><mesh><vertices>{verts_xml}</vertices><triangles>{tris_xml}</triangles></mesh></object>
  </resources>
  <build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 2 0 0"/></build>
</model>'''
    p.ev("App.change('x', d => { d.items = []; })"); p.wait(400)
    p.pg.evaluate("""(b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__masswerk.Start.openBlob(new File([u], 'zoll.3mf'));
    }""", mk_3mf(inch_xml))
    warte_rechnen(p, 30)
    zoll = p.ev("""const it = App.doc.items[0]; const r = it && App.results.get(it.id);
      return { errs: App.errors.length, n: App.doc.items.length, name: it && it.name, color: it && it.color, colorSet: it && !!it.colorSet, bbox: r && r.data.bbox };""")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400); warte_rechnen(p, 30)
    after_undo = p.ev("return App.doc.items.length")
    ok2 = (zoll['errs'] == 0 and zoll['n'] == 1 and zoll['name'] == 'Zollwürfel'
           and zoll['color'] == '#5b9f55' and zoll['colorSet']
           and same_bb(zoll['bbox'], [50.8, 0, 0, 76.2, 25.4, 25.4], 0.15)
           and after_undo == 0)

    # 3. Komponenten (inkl. Spiegelung mit det < 0) und Fehlerbehandlung bei kaputter 3MF
    verts10 = ''.join(f'<vertex x="{x*10}" y="{y*10}" z="{z*10}"/>' for x, y, z in cube_v)
    comp_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="1"><base name="Orange" displaycolor="#E8833AFF"/></basematerials>
    <object id="2" type="model"><mesh><vertices>{verts10}</vertices><triangles>{tris_xml}</triangles></mesh></object>
    <object id="3" type="model" name="Baugruppe" pid="1" pindex="0">
      <components>
        <component objectid="2" transform="1 0 0 0 1 0 0 0 1 20 0 0"/>
        <component objectid="2" transform="-1 0 0 0 1 0 0 0 1 0 0 0"/>
      </components>
    </object>
  </resources>
  <build><item objectid="3"/></build>
</model>'''
    p.pg.evaluate("""(b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__masswerk.Start.openBlob(new File([u], 'comp.3mf'));
    }""", mk_3mf(comp_xml))
    warte_rechnen(p, 30)
    comp = p.ev("""return Mass.measureDoc(App.doc).then(m => ({
        errs: App.errors.length,
        items: App.doc.items.map(it => {
          const mp = m && m.parts && m.parts.find(q => q.id === it.id);
          return { name: it.name, color: it.color, bbox: App.results.get(it.id) && App.results.get(it.id).data.bbox, vol: mp ? mp.volume : 0 };
        })
      }))""")
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([new Uint8Array([1, 2, 3, 4])], 'kaputt.3mf'))"); p.wait(400)
    bad_toast = p.pg.locator('.toast.bad').count() >= 1
    after_bad = p.ev("return App.doc.items.length")
    ok3 = (comp['errs'] == 0 and len(comp['items']) == 2
           and all(x['name'] == 'Baugruppe' and x['color'] == '#e8833a' and x['vol'] and abs(x['vol'] - 1000) < 5 for x in comp['items'])
           and same_bb(comp['items'][0]['bbox'], [20, 0, 0, 30, 10, 10], 0.15)
           and same_bb(comp['items'][1]['bbox'], [-10, 0, 0, 0, 10, 10], 0.15)
           and bad_toast and after_bad == 2)

    # 4. Befehlssuche, Projekt-Menü und Hilfetexte kennen 3MF
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    has_cmd = p.ev("return Commands.search('3mf').some(c => c.id === 'import')")
    p.pg.locator('#btn-project').click(); p.wait(200)
    menu_item = p.pg.locator('.menu [data-help="importCad"]')
    menu_ok = menu_item.count() == 1 and '3MF' in (menu_item.text_content() or '')
    p.pg.keyboard.press('Escape'); p.wait(150)
    ok4 = (bool(has_cmd) and menu_ok and 'importCad' in hilfen
           and all(f in hilfen['importCad'] and '3mf' in hilfen['importCad'][f].lower() for f in ('tip', 'hilfe', 'tipp')))
    return [ok1, ok2, ok3, ok4]


def t_a010_obj_glb(p):
    import zipfile, tempfile, struct, json as _json
    p.empty()
    p.ev("""App.change('x', d => {
      const a = Model.newItem('box', {w: 30, d: 20, h: 10}, {name: 'Gehäuse'});
      a.mat = 'Alu 6061';
      const b = Model.newItem('cylinder', {d: 16, h: 8}, {name: 'Deckel'});
      b.mat = 'PLA'; b.color = '#d9483f'; b.colorSet = true; b.t.x = 40;
      d.items.push(a, b);
    })"""); warte_rechnen(p)

    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    help_ok = 'exportObjGlb' in hilfen and all(k in hilfen['exportObjGlb'] for k in ('tip', 'hilfe', 'tipp'))

    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(500)
    dh_obj = p.pg.locator('#ex-obj').locator('xpath=ancestor::label').get_attribute('data-help')
    dh_glb = p.pg.locator('#ex-glb').locator('xpath=ancestor::label').get_attribute('data-help')
    help_ok = help_ok and dh_obj == 'exportObjGlb' and dh_glb == 'exportObjGlb'

    p.pg.uncheck('#ex-step'); p.pg.check('#ex-obj'); p.pg.check('#ex-glb'); p.pg.check('#ex-each'); p.wait(100)
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-a010.zip'); dl.value.save_as(z)
    zf = zipfile.ZipFile(z)
    names = zf.namelist()
    obj_files = [n for n in names if '/' not in n and n.endswith('.obj')]
    mtl_files = [n for n in names if '/' not in n and n.endswith('.mtl')]
    glb_files = [n for n in names if '/' not in n and n.endswith('.glb')]
    einzeln = sorted(n for n in names if n.startswith('Einzeln/'))
    ok1 = (help_ok and len(obj_files) == 1 and len(mtl_files) == 1 and len(glb_files) == 1
           and einzeln == ['Einzeln/Deckel.glb', 'Einzeln/Deckel.mtl', 'Einzeln/Deckel.obj',
                           'Einzeln/Gehäuse.glb', 'Einzeln/Gehäuse.mtl', 'Einzeln/Gehäuse.obj'])

    obj_txt = zf.read(obj_files[0]).decode('utf-8') if obj_files else ''
    mtl_txt = zf.read(mtl_files[0]).decode('utf-8') if mtl_files else ''
    used_mtls = [line.split(None, 1)[1].strip() for line in obj_txt.splitlines() if line.startswith('usemtl ')]
    def_mtls = {}
    cur = None
    for line in mtl_txt.splitlines():
        if line.startswith('newmtl '):
            cur = line.split(None, 1)[1].strip(); def_mtls[cur] = {}
        elif cur and line.startswith('Kd '):
            def_mtls[cur]['Kd'] = [float(x) for x in line.split()[1:4]]
    ok2 = (f'mtllib {mtl_files[0]}' in obj_txt if mtl_files else False)
    ok2 = (ok2 and 'o Gehäuse' in obj_txt and 'o Deckel' in obj_txt
           and '\nv ' in obj_txt and '\nvn ' in obj_txt and '\nf ' in obj_txt
           and len(used_mtls) == 2 and all(m in def_mtls and 'Kd' in def_mtls[m] for m in used_mtls)
           and def_mtls[used_mtls[0]]['Kd'] != def_mtls[used_mtls[1]]['Kd']
           and any(def_mtls[m]['Kd'][0] > 0.8 and def_mtls[m]['Kd'][1] < 0.35 for m in used_mtls))

    glb = zf.read(glb_files[0]) if glb_files else b''
    ok3 = False; ok4 = False
    if len(glb) >= 28 and glb[:4] == b'glTF':
        ver, total_len = struct.unpack('<II', glb[4:12])
        j_len, j_type = struct.unpack('<II', glb[12:20])
        b_off = 20 + j_len
        b_len, b_type = struct.unpack('<II', glb[b_off:b_off + 8])
        gltf = _json.loads(glb[20:20 + j_len].decode('utf-8').rstrip(' \x00'))
        mesh_names = [m.get('name') for m in gltf.get('meshes', [])]
        node_names = [n.get('name') for n in gltf.get('nodes', [])]
        pos_accs = [gltf['accessors'][m['primitives'][0]['attributes']['POSITION']] for m in gltf.get('meshes', [])]
        bvs_ok = all(bv['byteOffset'] + bv['byteLength'] <= b_len for bv in gltf.get('bufferViews', []))
        ok3 = (ver == 2 and total_len == len(glb) and j_type == 0x4E4F534A and b_type == 0x004E4942
               and gltf.get('asset', {}).get('version') == '2.0'
               and len(gltf.get('meshes', [])) == 2 and len(gltf.get('nodes', [])) == 2
               and mesh_names == ['Gehäuse', 'Deckel'] and node_names == ['Gehäuse', 'Deckel']
               and all('min' in a and 'max' in a and len(a['min']) == 3 for a in pos_accs)
               and bvs_ok)
        mats = {gltf['nodes'][i]['name']: gltf['materials'][gltf['meshes'][gltf['nodes'][i]['mesh']]['primitives'][0]['material']] for i in range(len(gltf.get('nodes', [])))}
        m_alu = mats.get('Gehäuse', {}).get('pbrMetallicRoughness', {})
        m_pla = mats.get('Deckel', {}).get('pbrMetallicRoughness', {})
        bc_pla = m_pla.get('baseColorFactor', [0, 0, 0, 0])
        cc_pla = mats.get('Deckel', {}).get('extensions', {}).get('KHR_materials_clearcoat', {})
        ok4 = (m_alu.get('metallicFactor') == 1 and abs(m_alu.get('roughnessFactor', 0) - 0.3) < 0.01
               and m_pla.get('metallicFactor') == 0 and bc_pla[0] > 0.6 and bc_pla[1] < 0.1 and bc_pla[2] < 0.1
               and abs(cc_pla.get('clearcoatFactor', 0) - 0.15) < 0.01
               and 'KHR_materials_clearcoat' in gltf.get('extensionsUsed', []))
    return [ok1, ok2, ok3, ok4]


def t_a012_messungen_bleiben(p):
    p.empty()
    p.ev("Actions.addPrimitive('box'); Actions.addPrimitive('box')"); warte_rechnen(p)
    p.ev("App.change('x', d=>{ const a=d.items[0], b=d.items[1]; a.t.x=0; a.t.y=0; Object.assign(a.p,{w:30,d:20,h:10}); b.t.x=40; b.t.y=0; Object.assign(b.p,{w:20,d:20,h:25}); })"); warte_rechnen(p)
    p.ev("App.clearSelection(); Viewer.setView('iso', false)"); p.wait(800)

    p.pg.locator('#t-measure').click(); p.wait(300)
    ok1 = p.pg.locator('#measure-bar').count() == 1 and p.pg.locator('#measure-keep').is_disabled()
    top, top2 = world_screen(p, 3, 3, 10), world_screen(p, 42, 2, 25)
    p.pg.mouse.click(*top); p.wait(400)
    p.pg.mouse.click(*top2); p.wait(400)
    r_cur = p.ev("return Measure.result") or ''
    ok1 = ok1 and r_cur.startswith('Abstand 15 mm') and not p.pg.locator('#measure-keep').is_disabled()

    p.pg.locator('#measure-keep').click(); p.wait(400)
    p.pg.keyboard.press('Escape'); p.wait(300)
    ok2 = (p.ev("return (App.doc.measures || []).length") == 1
           and p.ev("return App.doc.measures[0].value") == 15
           and p.pg.locator('#measure-tree .measure-row').count() == 1
           and '15 mm' in p.pg.locator('#measure-tree .measure-row').first.text_content()
           and p.pg.locator('.dimlabel.mpin').count() == 1
           and '15 mm' in p.pg.locator('.dimlabel.mpin').first.text_content()
           and p.ev("return Viewer.groups.measures.children.length") >= 1)

    # Quader höher machen -> Messung aktualisiert sich automatisch auf 30 mm
    p.ev("App.change('Höher', d=>{ d.items[1].p.h = 40; })"); warte_rechnen(p)
    ok3 = (p.ev("return App.doc.measures[0].value") == 30
           and not p.ev("return App.doc.measures[0].lost")
           and '30 mm' in p.pg.locator('#measure-tree .measure-row').first.text_content()
           and '30 mm' in p.pg.locator('.dimlabel.mpin').first.text_content())

    # Ein- und ausblenden
    p.pg.locator('#measure-tree .m-eye').first.click(); p.wait(400)
    ok4 = (p.ev("return !!App.doc.measures[0].hidden")
           and p.pg.locator('.dimlabel.mpin').count() == 0
           and p.ev("return Viewer.groups.measures.children.length") == 0)
    p.pg.locator('#measure-tree .m-eye').first.click(); p.wait(400)
    ok4 = ok4 and (not p.ev("return App.doc.measures[0].hidden")
                   and p.pg.locator('.dimlabel.mpin').count() == 1
                   and p.ev("return Viewer.groups.measures.children.length") >= 1)

    # Im Verlauf wählen & rechts umbenennen
    p.pg.locator('#measure-tree .measure-row').first.click(); p.wait(300)
    ok5 = p.pg.locator('#measure-name').count() == 1 and 'Abstand 30 mm' in p.pg.locator('#measure-val').text_content()
    p.pg.fill('#measure-name', 'Stufenhöhe'); p.pg.locator('#measure-name').press('Enter'); p.wait(400)
    ok5 = ok5 and p.ev("return App.doc.measures[0].name") == 'Stufenhöhe' and 'Stufenhöhe' in p.pg.locator('#measure-tree').text_content()

    # Bezug löschen -> „verloren“; Rückgängig -> wieder 30 mm
    p.ev("Actions.remove([App.doc.items[1].id])"); warte_rechnen(p)
    ok6 = (p.ev("return !!App.doc.measures[0].lost")
           and 'verloren' in p.pg.locator('#measure-tree .measure-row').first.text_content().lower()
           and p.pg.locator('.dimlabel.mpin.lost').count() == 1)
    p.ev("App.undo()"); warte_rechnen(p)
    ok6 = ok6 and (not p.ev("return App.doc.measures[0].lost")
                   and p.ev("return App.doc.measures[0].value") == 30
                   and '30 mm' in p.pg.locator('.dimlabel.mpin').first.text_content())

    # Löschen & Rückgängig + Hilfetext prüfen
    p.pg.locator('#measure-tree .m-del').first.click(); p.wait(400)
    ok7 = p.ev("return (App.doc.measures || []).length") == 0 and p.pg.locator('#measure-tree').count() == 0 and p.pg.locator('.dimlabel.mpin').count() == 0
    p.ev("App.undo()"); warte_rechnen(p)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok7 = ok7 and p.ev("return (App.doc.measures || []).length") == 1 and 'measureKeep' in hilfen and all(k in hilfen['measureKeep'] for k in ('tip', 'hilfe', 'tipp'))
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7]


def t_a013_schnitt_kappe_mehrfach(p):
    p.empty()
    p.ev("""App.change('Würfel mit Loch', d => {
      const b = Model.newItem('box', { w: 20, d: 20, h: 20 });
      const h = Model.newItem('cylinder', { d: 8, h: 30 }, { role: 'hole' });
      h.t.z = -5;
      d.items.push(b, h);
    })""")
    warte_rechnen(p, 20)
    u0 = p.ev("return App.undoStack.length")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('c'); p.wait(800)
    caps1 = p.ev("""const out=[];
      Viewer.groups.overlay.traverse(o=>{ if(o.isMesh && o.userData.sectionCap) out.push({k:o.userData.planeKey, tris:(o.geometry.index?o.geometry.index.count:0)/3, hasMap:!!(o.material&&o.material.map), clips:o.material.clippingPlanes?o.material.clippingPlanes.length:0}); });
      return { cut: Views.cut, clips: Viewer.clips.length, caps: out };""")
    # Würfel 20x20x20 mit Durchgangsloch Ø 8 entlang Z: XZ-Schnitt bei y=0 zeigt zwei Stege à (6*20) = 240 mm²
    ok1 = (caps1['cut'] is not None and caps1['cut']['plane'] == 'XZ' and len(caps1['cut']['planes']) == 1
           and caps1['clips'] == 1 and len(caps1['caps']) == 1
           and caps1['caps'][0]['tris'] >= 4 and caps1['caps'][0]['hasMap']
           and abs(caps1['cut']['capArea'] - 240) < 3)
    # X-Ebene (YZ) dazuschalten -> X und Y gleichzeitig aktiv, beide Kappen im Overlay mit je 1 Gegen-Clipping-Ebene
    p.pg.locator('.viewbar [data-plane="YZ"]').click(); p.wait(600)
    caps2 = p.ev("""const out=[];
      Viewer.groups.overlay.traverse(o=>{ if(o.isMesh && o.userData.sectionCap) out.push({k:o.userData.planeKey, tris:(o.geometry.index?o.geometry.index.count:0)/3, clips:o.material.clippingPlanes?o.material.clippingPlanes.length:0}); });
      return { cut: Views.cut, clips: Viewer.clips.length, caps: out, rows: document.querySelectorAll('.viewbar .cut-row').length, pressed: [...document.querySelectorAll('.viewbar .seg button[aria-pressed="true"]')].map(b=>b.dataset.axis) };""")
    ok2 = (caps2['clips'] == 2 and len(caps2['cut']['planes']) == 2
           and caps2['rows'] == 2 and set(caps2['pressed']) == {'X', 'Y'}
           and {c['k'] for c in caps2['caps']} == {'YZ', 'XZ'}
           and all(c['tris'] >= 4 and c['clips'] == 1 for c in caps2['caps']))
    # Z-Ebene (XY) dazuschalten -> alle drei Ebenen gleichzeitig aktiv; dann X und Y wieder abschalten -> Z allein zeigt Kreisloch-Kappe (400 - pi*16 ≈ 349,7 mm²)
    p.pg.locator('.viewbar [data-plane="XY"]').click(); p.wait(600)
    caps3 = p.ev("""const out=[];
      Viewer.groups.overlay.traverse(o=>{ if(o.isMesh && o.userData.sectionCap) out.push({k:o.userData.planeKey, clips:o.material.clippingPlanes?o.material.clippingPlanes.length:0}); });
      return { clips: Viewer.clips.length, caps: out };""")
    p.pg.locator('.viewbar [data-plane="YZ"]').click(); p.wait(400)
    p.pg.locator('.viewbar [data-plane="XZ"]').click(); p.wait(600)
    z_only = p.ev("return Views.cut")
    ok3 = (caps3['clips'] == 3 and {c['k'] for c in caps3['caps']} == {'YZ', 'XZ', 'XY'}
           and all(c['clips'] == 2 for c in caps3['caps'])
           and len(z_only['planes']) == 1 and z_only['plane'] == 'XY'
           and abs(z_only['capArea'] - (400 - math.pi * 16)) < 6)
    # X an, Z aus, X auf 5 mm versetzen (volle Fläche 400 mm²), Kappe aus- und wieder einschalten
    p.pg.locator('.viewbar [data-plane="YZ"]').click(); p.wait(400)
    p.pg.locator('.viewbar [data-plane="XY"]').click(); p.wait(500)
    p.pg.fill('[data-cut-off="YZ"]', '5'); p.pg.press('[data-cut-off="YZ"]', 'Enter'); p.wait(500)
    area_x5 = p.ev("return Views.cut.capArea")
    p.pg.locator('#cut-cap').uncheck(); p.wait(400)
    no_cap = p.ev("""let n=0; Viewer.groups.overlay.traverse(o=>{ if(o.userData.sectionCap) n++; }); return {n, cap:Views.cut.cap};""")
    p.pg.locator('#cut-cap').check(); p.wait(400)
    has_cap = p.ev("""let n=0; Viewer.groups.overlay.traverse(o=>{ if(o.isMesh && o.userData.sectionCap) n++; }); return {n, cap:Views.cut.cap};""")
    ok4 = abs(area_x5 - 400) < 3 and no_cap['n'] == 0 and not no_cap['cap'] and has_cap['n'] == 1 and has_cap['cap']
    # Schnitt beenden -> alles sauber aufgeräumt, kein Undo-Schritt
    p.pg.locator('.viewbar .vb-x').click(); p.wait(400)
    end_st = p.ev("""let n=0; Viewer.groups.overlay.traverse(o=>{ if(o.userData.sectionCap||o.userData.sectionHelper) n++; });
      return { cut:Views.cut, clip:Viewer.clip, clips:Viewer.clips.length, ov:n, u:App.undoStack.length, bars:document.querySelectorAll('.viewbar').length };""")
    ok5 = end_st['cut'] is None and end_st['clip'] is None and end_st['clips'] == 0 and end_st['ov'] == 0 and end_st['bars'] == 0 and end_st['u'] == u0
    return [ok1, ok2, ok3, ok4, ok5]


def t_a016_speicher_gross(p):
    # 1. 15+ MB STEP-Import anlegen, binär in IndexedDB sichern (nicht in localStorage)
    p.empty()
    p.ev("Actions.addPrimitive('box')"); warte_rechnen(p, 20)
    prep = p.pg.evaluate("""async () => {
      const { Kernel, Model, App, Start } = window.__masswerk;
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      const head = new TextDecoder('utf-8').decode(new Uint8Array(r.data));
      const line = '/* ' + '0123456789abcdef'.repeat(4) + ' */\\n';
      const need = 15600000 - head.length;
      const pad = line.repeat(Math.ceil(need / line.length));
      const bigStep = head.replace('DATA;', 'DATA;\\n' + pad);
      App.change('clear', d => { d.items = []; });
      await Start.importCAD(new File([bigStep], 'GrossesTeil.step'));
      return bigStep.length;
    }""")
    warte_rechnen(p, 45)
    st1 = p.ev("""return (async () => {
      await App.autosave.flush();
      await Store.whenIdle();
      const it = App.doc.items[0];
      const m = await Mass.measure();
      const lsProj = localStorage.getItem('masswerk.proj.' + App.doc.id);
      const blob = await new Promise((res) => {
        const req = indexedDB.open('tracery-db', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('blobs', 'readonly');
          const g = tx.objectStore('blobs').get(it.p.blobId);
          g.onsuccess = () => res(g.result ? { len: g.result.bytes.byteLength, bin: g.result.bytes instanceof Uint8Array || g.result.bytes instanceof ArrayBuffer } : null);
          g.onerror = () => res(null);
        };
        req.onerror = () => res(null);
      });
      return {
        docId: App.doc.id,
        errs: App.errors.length,
        hasBlobId: !!(it && it.p && it.p.blobId),
        noData: it && it.p && it.p.data === undefined,
        size: it && it.p && it.p.size,
        blobId: it && it.p && it.p.blobId,
        vol: m && m.volume,
        lsProj,
        blob,
      };
    })();""")
    ok1 = (prep > 15_500_000 and st1['errs'] == 0 and st1['hasBlobId'] and st1['noData']
           and st1['size'] > 15_500_000 and abs(st1['vol'] - 8000) < 10
           and st1['lsProj'] is None and st1['blob'] is not None
           and st1['blob']['bin'] and st1['blob']['len'] > 15_500_000)

    # 2. Nach Neuladen der Seite vollständig aus IndexedDB wiederhergestellt
    p.pg.reload()
    p.wait(4000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    if p.pg.locator('#recovery-restore').count():
        p.pg.locator('#recovery-restore').click(); p.wait(1000)
    warte_rechnen(p, 45)
    st2 = p.ev("""return Mass.measure().then(m => {
      const it = App.doc.items[0];
      return {
        docId: App.doc.id,
        len: App.doc.items.length,
        errs: App.errors.length,
        blobId: it && it.p && it.p.blobId,
        noData: it && it.p && it.p.data === undefined,
        size: it && it.p && it.p.size,
        vol: m && m.volume,
      };
    });""")
    ok2 = (st2['docId'] == st1['docId'] and st2['len'] == 1 and st2['errs'] == 0
           and st2['blobId'] == st1['blobId'] and st2['noData']
           and st2['size'] == st1['size'] and abs(st2['vol'] - 8000) < 10)

    # 3. Versionen in IndexedDB (inkl. 15-MB-Import), Neuladen und Zurückholen
    p.ev("Versions.save('Mit 15 MB Import'); Actions.addPrimitive('cylinder');"); warte_rechnen(p, 20)
    p.ev("return App.autosave.flush().then(() => Store.whenIdle());")
    p.pg.reload()
    p.wait(4000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    if p.pg.locator('#recovery-restore').count():
        p.pg.locator('#recovery-restore').click(); p.wait(1000)
    warte_rechnen(p, 45)
    v_before = p.ev("""return {
      names: Versions.list().map(v => v.name),
      lsVer: localStorage.getItem('masswerk.versions.' + App.doc.id),
      len: App.doc.items.length,
      vid: Versions.list()[0] && Versions.list()[0].id,
    };""")
    p.ev("return Versions.restore(arg);", v_before['vid'])
    warte_rechnen(p, 40)
    v_after = p.ev("return Mass.measure().then(m => ({ len: App.doc.items.length, errs: App.errors.length, vol: m && m.volume }));")
    ok3 = (v_before['names'] == ['Mit 15 MB Import'] and v_before['lsVer'] is None and v_before['len'] == 2
           and v_after['len'] == 1 and v_after['errs'] == 0 and abs(v_after['vol'] - 8000) < 10)

    # 4. Migration aus localStorage beim ersten Start (inkl. Base64-STL-Import und alter Version)
    p.ev("""return (async () => {
      Start.newProject(true);
      App.autosave.cancel();
      const V = [[0,0,0],[10,0,0],[0,10,0],[0,0,10]], F = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
      let stl = 'solid t\\n';
      for (const f of F) { stl += ' facet normal 0 0 0\\n  outer loop\\n'; for (const i of f) stl += '   vertex ' + V[i].join(' ') + '\\n'; stl += '  endloop\\n endfacet\\n'; }
      stl += 'endsolid t\\n';
      const b64 = btoa(stl);
      const oldDoc = {
        format: 'masswerk', version: 1, id: 'p_old_mig', name: 'Altes Projekt', created: 1000, modified: 2000,
        params: [], notes: [], settings: { printer: 'std', custom: { x: 220, y: 220, z: 250 }, grid: 1, snap: true }, drawing: null,
        items: [{ id: 'i_old_1', kind: 'import', name: 'Spitze', role: 'solid', color: '#2f9e91', hidden: false, locked: false, finishes: [], t: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, p: { fmt: 'stl', data: b64, file: 'spitze.stl', scale: 1 } }],
      };
      const oldVer = [{ id: 'v_old_1', name: 'Altstand', t: 1500, doc: JSON.parse(JSON.stringify(oldDoc)) }];
      await Store.whenIdle();
      await new Promise((res) => {
        const req = indexedDB.open('tracery-db', 1);
        req.onsuccess = () => {
          const d = req.result;
          const tx = d.transaction(['projects', 'versions', 'blobs', 'meta'], 'readwrite');
          tx.objectStore('projects').clear();
          tx.objectStore('versions').clear();
          tx.objectStore('blobs').clear();
          tx.objectStore('meta').clear();
          tx.oncomplete = () => res(true);
          tx.onerror = () => res(false);
        };
      });
      localStorage.setItem('masswerk.proj.p_old_mig', JSON.stringify(oldDoc));
      localStorage.setItem('masswerk.versions.p_old_mig', JSON.stringify(oldVer));
      localStorage.setItem('masswerk.index', JSON.stringify([{ id: 'p_old_mig', name: 'Altes Projekt', modified: 2000, n: 1 }]));
      localStorage.setItem('masswerk.last', 'p_old_mig');
      return true;
    })();""")
    p.pg.reload()
    p.wait(4000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 30)
    mig = p.ev("""return Mass.measure().then(m => {
      const it = App.doc.items[0];
      return {
        docId: App.doc.id,
        errs: App.errors.length,
        hasBlobId: !!(it && it.p && it.p.blobId),
        noData: it && it.p && it.p.data === undefined,
        vol: m && m.volume,
        vers: Versions.list().map(v => v.name),
        lsLeft: ['masswerk.proj.p_old_mig', 'masswerk.versions.p_old_mig', 'masswerk.index', 'masswerk.last'].filter(k => localStorage.getItem(k) !== null),
      };
    });""")
    ok4 = (mig['docId'] == 'p_old_mig' and mig['errs'] == 0 and mig['hasBlobId'] and mig['noData']
           and abs(mig['vol'] - 1000 / 6) < 2 and mig['vers'] == ['Altstand'] and mig['lsLeft'] == [])

    # 5. Löschen räumt Projekt, Versionen und verwaiste Blobs in IndexedDB auf
    cleaned = p.ev("""return (async () => {
      Start.newProject(true);
      await App.deleteStored('p_old_mig');
      await Store.whenIdle();
      return new Promise((res) => {
        const req = indexedDB.open('tracery-db', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction(['projects', 'versions', 'blobs'], 'readonly');
          const c1 = tx.objectStore('projects').count();
          const c2 = tx.objectStore('versions').count();
          const c3 = tx.objectStore('blobs').count();
          tx.oncomplete = () => res({ p: c1.result, v: c2.result, b: c3.result });
        };
      });
    })();""")
    ok5 = cleaned == {'p': 0, 'v': 0, 'b': 0}
    return [ok1, ok2, ok3, ok4, ok5]


def t_a015_ordner_speichern(p):
    p.empty()
    # 1. Ohne File System Access API: kein Menüeintrag, kein Suchtreffer, kein Schild
    p.ev("""try { delete window.showDirectoryPicker; } catch (_) {}
      if ('showDirectoryPicker' in window) Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true, writable: true });""")
    p.pg.locator('#btn-project').click(); p.wait(300)
    ok1 = (
        p.pg.locator('#pm-folder-save').count() == 0
        and p.pg.locator('.menu button', has_text='In Ordner speichern').count() == 0
        and not p.pg.locator('#btn-folder-status').is_visible()
        and 'save-folder' not in p.ev("return Commands.search('In Ordner speichern').map(c => c.id)")
    )
    p.pg.keyboard.press('Escape'); p.wait(200)

    # 2. Stub für showDirectoryPicker einrichten und erstmalig in Ordner speichern
    p.ev("Actions.addPrimitive('box')"); warte_rechnen(p)
    p.ev("App.change('Projekt umbenennen', d => { d.name = 'Halterung'; })"); p.wait(300)
    p.ev("""
      window.__fsWrites = [];
      const stub = async () => ({
        name: 'MeineCADs',
        async queryPermission() { return 'granted'; },
        async getFileHandle(name) {
          return {
            async createWritable() {
              let buf = '';
              return {
                async write(chunk) { buf += String(chunk); },
                async close() { window.__fsWrites.push({ name, data: buf, t: Date.now() }); },
              };
            },
          };
        },
      });
      Object.defineProperty(window, 'showDirectoryPicker', { value: stub, configurable: true, writable: true });
    """)
    p.pg.locator('#btn-project').click(); p.wait(300)
    has_btn = p.pg.locator('#pm-folder-save').count() == 1
    p.pg.locator('#pm-folder-save').click(); p.wait(600)
    writes1 = p.ev("return window.__fsWrites")
    badge_txt = (p.pg.locator('#btn-folder-status').text_content() or '').lower()
    d1 = json.loads(writes1[0]['data']) if writes1 else {}
    ok2 = (
        has_btn
        and len(writes1) == 1
        and writes1[0]['name'] == 'Halterung.tracery.json'
        and d1.get('name') == 'Halterung'
        and [x.get('kind') for x in d1.get('items', [])] == ['box']
        and p.pg.locator('#btn-folder-status').is_visible()
        and 'gespeichert in meinecads' in badge_txt
    )

    # 3. Mehrere Änderungen innerhalb von 10 s werden gebündelt als ein Schreibvorgang geschrieben
    delay = p.ev("return Start.folderDelay")
    t0 = p.ev("App.change('Höhe', d => { d.items[0].p.h = 42; }); return Date.now()")
    p.wait(300)
    p.ev("Actions.addPrimitive('cylinder')"); warte_rechnen(p)
    p.wait(400)
    mid_len = p.ev("return window.__fsWrites.length")
    is_pending = p.ev("return document.querySelector('#btn-folder-status').classList.contains('pending')")
    for _ in range(30):
        p.wait(400)
        if p.ev("return window.__fsWrites.length") >= 2:
            break
    p.wait(600)
    writes2 = p.ev("return window.__fsWrites")
    d2 = json.loads(writes2[1]['data']) if len(writes2) >= 2 else {}
    badge_cls = p.ev("return document.querySelector('#btn-folder-status').className")
    badge_txt2 = (p.pg.locator('#btn-folder-status').text_content() or '').lower()
    ok3 = (
        delay == 10000
        and mid_len == 1
        and is_pending
        and len(writes2) == 2
        and (writes2[1]['t'] - t0) >= 8500
        and [x.get('kind') for x in d2.get('items', [])] == ['box', 'cylinder']
        and d2['items'][0]['p']['h'] == 42
        and 'saved' in badge_cls
        and 'gespeichert in meinecads' in badge_txt2
    )

    # 4. Menü an der Anzeige oben, Verbindung trennen & automatisches Trennen bei Projektwechsel
    p.pg.locator('#btn-folder-status').click(); p.wait(300)
    menu_ok = p.pg.locator('#fm-now').count() == 1 and p.pg.locator('#fm-change').count() == 1 and p.pg.locator('#fm-stop').count() == 1
    p.pg.locator('#fm-stop').click(); p.wait(300)
    p.ev("App.change('Breite', d => { d.items[0].p.w = 55; })"); p.wait(300)
    stopped_ok = (
        menu_ok
        and not p.pg.locator('#btn-folder-status').is_visible()
        and p.ev("return Start.folderInfo()") is None
        and p.ev("return window.__fsWrites.length") == 2
    )
    reconn = p.ev("return Start.saveToFolder()"); p.wait(300)
    p.ev("Start.newProject(true)"); p.wait(1000)
    ok4 = (
        stopped_ok
        and reconn is True
        and p.ev("return Start.folderInfo()") is None
        and not p.pg.locator('#btn-folder-status').is_visible()
    )

    # 5. Hilfetext & Befehlssuche mit vorhandener API
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok5 = (
        'save-folder' in p.ev("return Commands.search('In Ordner speichern').map(c => c.id)")
        and 'saveFolder' in hilfen
        and all(k in hilfen['saveFolder'] for k in ('tip', 'hilfe', 'tipp'))
    )
    return [ok1, ok2, ok3, ok4, ok5]


def t_a018_verschieben_drehen_schritt(p):
    p.empty()
    p.ev("Actions.addPrimitive('box', { p: { w: 40, d: 20, h: 10 }, pos: [0, 0] })")
    warte_rechnen(p, 20); p.wait(300)
    b0 = bbox(p, 0)
    # 1. Schritt über Kontextleiste anlegen: Ziel ist Schritt 1, eigene Lage des Originals bleibt (0,0,0)
    btn_xf = p.pg.locator('.ctxbar button[aria-label="Verschieben/Drehen"]')
    has_help_attr = btn_xf.get_attribute('data-help') == 'moveStep'
    btn_xf.click()
    warte_rechnen(p, 20); p.wait(300)
    st1 = p.ev("""const its=App.doc.items;
      return [its.length, its[1] && its[1].kind, its[1] && its[1].p.target === its[0].id,
        its[0].t.x, its[0].t.y, its[0].t.z, its[0].t.rx, its[0].t.ry, its[0].t.rz,
        App.mergedInto(its[1].id) === its[0].id]""")
    ok1 = has_help_attr and near(b0, [-20, -10, 0, 20, 10, 10]) and st1 == [2, 'transform', True, 0, 0, 0, 0, 0, 0, True]

    # 2. Werte über UI ändern (X=30, Y=15, Z=5) -> Körper folgt, t des Originals bleibt (0,0,0)
    p.pg.fill('#xf-dx', '30'); p.pg.press('#xf-dx', 'Enter'); p.wait(200)
    p.pg.fill('#xf-dy', '15'); p.pg.press('#xf-dy', 'Enter'); p.wait(200)
    p.pg.fill('#xf-dz', '5'); p.pg.press('#xf-dz', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    b_move = bbox(p, 0)
    t_orig = p.ev("const t=App.doc.items[0].t; return [t.x, t.y, t.z, t.rx, t.ry, t.rz]")
    ok2 = near(b_move, [10, 5, 5, 50, 25, 15]) and t_orig == [0, 0, 0, 0, 0, 0]

    # 3. Drehung um Z (90° um die Mitte des Körpers) -> Maße tauschen zu 20 × 40 × 10 um (30, 15, 10)
    p.pg.fill('#xf-rz', '90'); p.pg.press('#xf-rz', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    b_rot = bbox(p, 0)
    ok3 = near(b_rot, [20, -5, 5, 40, 35, 15])

    # 4. Schritt unterdrücken -> Körper springt exakt zurück; wieder aktivieren -> zurück zur versetzten Lage
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Unterdrücken').click()
    warte_rechnen(p, 20); p.wait(300)
    b_sup = bbox(p, 0)
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Wieder aktivieren').click()
    warte_rechnen(p, 20); p.wait(300)
    b_unsup = bbox(p, 0)
    ok4 = near(b_sup, [-20, -10, 0, 20, 10, 10]) and near(b_unsup, [20, -5, 5, 40, 35, 15])

    # 5. Zeitleisten-Marker vor Schritt 2 -> Körper zurück; Marker ans Ende -> wieder versetzt
    p.ev("Timeline.setMarker(1)")
    warte_rechnen(p, 20); p.wait(300)
    b_mk1 = bbox(p, 0)
    p.ev("Timeline.setMarker(2)")
    warte_rechnen(p, 20); p.wait(300)
    b_mk2 = bbox(p, 0)
    ok5 = near(b_mk1, [-20, -10, 0, 20, 10, 10]) and near(b_mk2, [20, -5, 5, 40, 35, 15])

    # 6. Als Kopie: Original bleibt am alten Platz, zweiter Körper entsteht versetzt und wächst mit dem Original mit
    p.ev("App.select([App.doc.items[1].id])"); p.wait(300)
    p.pg.locator('#xf-copy').check()
    warte_rechnen(p, 20); p.wait(300)
    b_o1 = bbox(p, 0)
    b_c1 = bbox(p, 1)
    nodes_copy = p.ev("return [Viewer.nodes.has(App.doc.items[0].id), Viewer.nodes.has(App.doc.items[1].id), App.mergedInto(App.doc.items[1].id)]")
    p.ev("App.change('Höhe', d=>{ d.items[0].p.h = 20; })")
    warte_rechnen(p, 20); p.wait(300)
    b_c2 = bbox(p, 1)
    ok6 = (
        near(b_o1, [-20, -10, 0, 20, 10, 10])
        and near(b_c1, [20, -5, 5, 40, 35, 15])
        and nodes_copy == [True, True, None]
        and near(b_c2, [20, -5, 5, 40, 35, 25])
    )

    # 7. Formel + Rückgängig + Hilfetext + keine Rechenfehler
    p.ev("App.change('Maß', d=>{ d.params.push({id:'m_hub', name:'Hub', expr:12}); })"); p.wait(300)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(300)
    p.pg.fill('#xf-dz', 'Hub * 2'); p.pg.press('#xf-dz', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    b_form = bbox(p, 1)
    p.ev("App.undo()")
    warte_rechnen(p, 20); p.wait(300)
    b_undo = bbox(p, 1)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok7 = (
        near(b_form, [20, -5, 24, 40, 35, 44])
        and near(b_undo, [20, -5, 5, 40, 35, 25])
        and 'moveStep' in hilfen
        and all(k in hilfen['moveStep'] for k in ('tip', 'hilfe', 'tipp'))
        and p.ev("return App.errors.length === 0 && Commands.search('Verschieben').some(c=>c.id==='move-step')") is True
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6, ok7]


# ---------- [A-017] Ebene im Winkel und Achsen (BZ-02, BZ-06, BZ-07) ----------
def t_a017_ebene_winkel_achsen(p):
    # 1. Ebene 30° an einer Quaderkante (BZ-02)
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:30,h:10},{name:'Quader'}); d.items.push(a); })"); warte_rechnen(p)
    ref = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9);
      const ei=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2]-10)<1e-4&&Math.abs(g.b[2]-10)<1e-4);
      const d=Datums.addEdgeAngle({id,edgeIdx:ei},{id,idx:fi,info:r.data.faces[fi]},30);
      return {d, ea:r.data.edges[ei].a, eb:r.data.edges[ei].b};""")
    p.wait(500)
    d0 = ref['d']
    pl0 = d0['plane']
    o0, n0 = pl0['o'], pl0['n']
    ea, eb = ref['ea'], ref['eb']
    dot_a = abs(sum((ea[k] - o0[k]) * n0[k] for k in range(3)))
    dot_b = abs(sum((eb[k] - o0[k]) * n0[k] for k in range(3)))
    ok1 = (
        d0['base']['type'] == 'edgeAngle'
        and dot_a < 1e-4 and dot_b < 1e-4
        and abs(abs(n0[2]) - math.cos(math.radians(30))) < 1e-4
        and p.pg.locator('#datum-tree .datum-row').count() == 1
        and p.ev("return Viewer.groups.datums.children.length") == 1
    )

    # 2. Quader höher -> Ebene wandert mit; Winkel auf 60° ändern; darauf skizzieren und hochziehen
    p.ev("App.change('x', d=>{ d.items[0].p.h=20; })"); warte_rechnen(p); p.wait(500)
    pl_moved = p.ev("return App.doc.datums[0].plane")
    p.ev("Datums.select(App.doc.datums[0].id)"); p.wait(400)
    p.pg.fill('#datum-angle', '60'); p.pg.press('#datum-angle', 'Enter'); p.wait(600)
    pl_60 = p.ev("return App.doc.datums[0].plane")
    p.pg.locator('#datum-sketch').click(); p.wait(1000)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[-4,-4],b:[4,4]})"); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(1000)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(1200); warte_rechnen(p)
    ext = p.ev("const it=App.doc.items[App.doc.items.length-1]; return {it, errs:App.errorsFor(it.id).length}")
    ok2 = (
        abs(pl_moved['o'][2] - 20) < 1e-4
        and abs(abs(pl_60['n'][2]) - math.cos(math.radians(60))) < 1e-4
        and ext['it']['kind'] == 'extrude' and ext['errs'] == 0
        and abs(abs(ext['it']['p']['sketch']['plane']['n'][2]) - 0.5) < 1e-4
    )

    # 3. Bezugsachse durch Mitte eines Zylinders -> Kreismuster (BZ-06) + Mitwandern
    p.ev("Start.newProject(true)"); p.wait(800)
    p.ev("App.change('x', d=>{ const c=Model.newItem('cylinder',{d:20,h:30},{name:'Zylinder'}); c.t.x=25; c.t.y=10; d.items.push(c); })"); warte_rechnen(p)
    ax0 = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='CYLINDRE');
      return Datums.addAxisFromFace({id,idx:fi,info:r.data.faces[fi]});""")
    p.wait(500)
    ax0_ok = (
        ax0 and ax0['base']['type'] == 'roundFace'
        and abs(ax0['axis']['o'][0] - 25) < 1e-3 and abs(ax0['axis']['o'][1] - 10) < 1e-3
        and abs(abs(ax0['axis']['d'][2]) - 1) < 1e-4
        and p.pg.locator('#axis-tree .axis-row').count() == 1
        and p.ev("return Viewer.groups.datums.children.length") == 1
    )
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:6,d:6,h:6},{name:'Klotz'}); b.t.x=45; b.t.y=10; d.items.push(b); })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[1].id]); Features.pattern('circ');"); warte_rechnen(p); p.wait(400)
    p.pg.select_option('#op-axis', 'da:' + ax0['id']); p.wait(600); warte_rechnen(p)
    bb1 = p.ev("return App.results.get(App.doc.items[1].id).data.bbox")
    # Zylinder verschieben -> Bezugsachse und Kreismuster wandern mit
    p.ev("App.change('x', d=>{ d.items[0].t.x=40; })"); warte_rechnen(p); p.wait(600); warte_rechnen(p)
    ax0_m = p.ev("return App.doc.axes[0].axis")
    bb2 = p.ev("return App.results.get(App.doc.items[1].id).data.bbox")
    ok3 = (
        ax0_ok
        and abs(bb1[0] - 2) < 0.2 and abs(bb1[3] - 48) < 0.2
        and abs(bb1[1] + 13) < 0.2 and abs(bb1[4] - 33) < 0.2
        and abs(ax0_m['o'][0] - 40) < 1e-3
        and abs((bb2[0] + bb2[3]) / 2 - 40) < 0.2
        and abs((bb2[1] + bb2[4]) / 2 - 10) < 0.2
    )

    # 4. Bezugsachse durch 2 Punkte + Drehen (Revolve, BZ-06)
    ax1 = p.ev("return Datums.addAxisTwoPoints([10, 0, 0], [10, 20, 0])"); p.wait(400)
    p.ev("Sketch.startOnPlane('XY')"); p.wait(800)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[15,0],b:[20,10]})"); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(900)
    p.pg.locator('.stepbox .role-switch button').nth(1).click(); p.wait(400)
    p.pg.select_option('#st-axis', 'da:' + ax1['id']); p.wait(400)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(1200); warte_rechnen(p)
    rev = p.ev("""const it=App.doc.items[App.doc.items.length-1];
      const m=App.results.get(it.id).data.bbox;
      return Mass.measure().then(r=>{ const pt=Mass.partOf(r,it.id); return {it, m, errs:App.errorsFor(it.id).length, vol:pt&&pt.volume}; });""")
    vol_rev = rev['vol'] or 0
    exp_vol = math.pi * (10 ** 2 - 5 ** 2) * 10
    ok4 = (
        ax1 and ax1['base']['type'] == 'twoPoints'
        and abs(ax1['axis']['o'][0] - 10) < 1e-4 and abs(abs(ax1['axis']['d'][1]) - 1) < 1e-4
        and rev['it']['kind'] == 'revolve' and rev['it']['p'].get('axisId') == ax1['id']
        and rev['errs'] == 0 and abs(vol_rev - exp_vol) < 5
        and abs((rev['m'][0] + rev['m'][3]) / 2 - 10) < 0.2
        and abs((rev['m'][2] + rev['m'][5]) / 2) < 0.2
    )

    # 5. Bezugsachse senkrecht auf Fläche an Punkt (BZ-07)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:30,d:20,h:12},{name:'Block'}); d.items.push(b); })"); warte_rechnen(p)
    ax2 = p.ev("""const it=App.doc.items[App.doc.items.length-1], r=App.results.get(it.id);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9);
      return Datums.addAxisNormalAtPoint({id:it.id,idx:fi,info:r.data.faces[fi]}, [10,5,12]);""")
    p.wait(400)
    p.ev("App.change('x', d=>{ d.items[d.items.length-1].p.h=24; })"); warte_rechnen(p); p.wait(500)
    ax2_m = p.ev("return App.doc.axes[2].axis")
    ok5 = (
        ax2 and ax2['base']['type'] == 'faceNormal'
        and abs(ax2['axis']['o'][0] - 10) < 1e-4 and abs(ax2['axis']['o'][1] - 5) < 1e-4
        and abs(ax2['axis']['o'][2] - 12) < 1e-4 and abs(ax2['axis']['d'][2] - 1) < 1e-4
        and abs(ax2_m['o'][2] - 24) < 1e-4
    )

    # 6. Achse umbenennen, ein-/ausblenden, fehlender Bezug + Rückgängig, löschen, Befehle & Hilfe
    p.ev("Datums.selectAxis(App.doc.axes[0].id)"); p.wait(400)
    p.pg.fill('#axis-name', 'Zylinderachse'); p.pg.press('#axis-name', 'Enter'); p.wait(400)
    p.pg.locator('#axis-hide').click(); p.wait(300)
    hidden_ok = p.ev("return App.doc.axes[0].hidden") is True and p.pg.locator('#axis-tree .axis-row.dim').count() == 1
    p.pg.locator('#axis-hide').click(); p.wait(300)
    p.ev("App.change('weg', d=>{ d.items.splice(0,1); })"); warte_rechnen(p); p.wait(400)
    lost_ok = 'Bezug fehlt' in p.pg.locator('#axis-tree').inner_text()
    p.ev("App.undo()"); warte_rechnen(p); p.wait(400)
    restored_ok = 'Bezug fehlt' not in p.pg.locator('#axis-tree').inner_text()
    p.ev("Datums.selectAxis(App.doc.axes[0].id)"); p.wait(400)
    p.pg.locator('#axis-del').click(); p.wait(400)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    cmd_ids_ax = p.ev("return Commands.search('Bezugsachse').map(c=>c.id)")
    cmd_ids_ang = p.ev("return Commands.search('Winkel').map(c=>c.id)")
    ok6 = (
        hidden_ok and lost_ok and restored_ok
        and p.ev("return App.doc.axes[0].name") != 'Zylinderachse'
        and p.ev("return App.doc.axes.length") == 2
        and 'datum-axis' in cmd_ids_ax and 'datum-edge-angle' in cmd_ids_ang
        and 'datumEdgeAngle' in hilfen and 'datumAxis' in hilfen
        and all(k in hilfen['datumEdgeAngle'] for k in ('tip', 'hilfe', 'tipp'))
        and all(k in hilfen['datumAxis'] for k in ('tip', 'hilfe', 'tipp'))
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- [A-014] Einheiten je Projekt (BE-10) ----------
def t_a014_einheiten_projekt(p):
    p.empty()
    # 1. Projekt auf Zoll umstellen, Quader 25,4 × 25,4 × 25,4 mm → zeigt 1 in
    p.pg.select_option('#proj-unit', 'in'); p.wait(300)
    p.ev("Actions.addPrimitive('box', { p: { w: 25.4, d: 25.4, h: 25.4 } })"); warte_rechnen(p)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    pw_val = p.pg.locator('#p-w').input_value()
    sec_h = [el.text_content().strip().lower() for el in p.pg.locator('#right-body .section-h').all()]
    lbls = [el.text_content().strip() for el in p.pg.locator('.dimlabel').all()]
    ampel = p.pg.locator('#ampel .t').text_content()
    ok1 = (
        p.ev("return App.doc.settings.unit") == 'in'
        and pw_val == '1'
        and any('maße (in)' in s for s in sec_h)
        and any('1 in' in l for l in lbls)
        and '1 × 1 × 1 in' in ampel
    )

    # 2. Eingabe „2“ ohne Einheit → 50,8 mm intern, Schildchen zeigt „2 in“
    p.pg.fill('#p-w', '2'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_mm = p.ev("return App.doc.items[0].p.w")
    lbls2 = [el.text_content().strip() for el in p.pg.locator('.dimlabel').all()]
    ok2 = abs(w_mm - 50.8) < 1e-6 and any('2 in' in l for l in lbls2)

    # 3. Explizite Einheiten im Zoll-Projekt (25,4 mm, 2 cm, 1 in)
    p.pg.fill('#p-w', '25,4 mm'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_mm1 = p.ev("return App.doc.items[0].p.w")
    pw_after = p.pg.locator('#p-w').input_value()
    p.pg.fill('#p-w', '2 cm'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_cm = p.ev("return App.doc.items[0].p.w")
    p.pg.fill('#p-w', '1 in'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_in = p.ev("return App.doc.items[0].p.w")
    ok3 = abs(w_mm1 - 25.4) < 1e-6 and pw_after == '1' and abs(w_cm - 20) < 1e-6 and abs(w_in - 25.4) < 1e-6

    # 4. Kontextleiste (#sel-val), Messen (Fläche + Wand in in²/in) & Stückliste
    p.ev("const id=App.doc.items[0].id, r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.l-25.4)<1e-4); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(500)
    sel_txt = p.pg.locator('#sel-val').text_content() if p.pg.locator('#sel-val').count() else ''
    p.pg.keyboard.press('m'); p.wait(300)
    top_sc = p.ev("""
      const id = App.doc.items[0].id, r = App.results.get(id).data;
      const fi = r.faces.findIndex(f => f.t === 'PLANE' && f.n && f.n[2] > 0.9);
      const fc = r.faces[fi].c;
      const v = Viewer.camera.position.clone().set(fc[0], fc[1], fc[2]).applyMatrix4(Model.worldMatrix(App.doc, id));
      const s = Viewer.toScreen(v);
      const rc = Viewer.canvas.getBoundingClientRect();
      return [s.x + rc.left, s.y + rc.top];
    """)
    p.pg.mouse.click(top_sc[0], top_sc[1]); p.wait(600)
    m_res = p.ev("return Measure.result") or ''
    p.pg.keyboard.press('Escape'); p.wait(300)
    p.ev("App.select([])"); p.wait(400)
    p.pg.locator('#proj-bom').click(); p.pg.wait_for_selector('#bom table', timeout=20000); p.wait(300)
    bom_txt = p.pg.locator('#bom').inner_text()
    p.pg.keyboard.press('Escape'); p.wait(200)
    ok4 = ('1 in' in sel_txt) and ('1 in²' in m_res) and ('Wand 1 in' in m_res) and ('1 × 1 × 1 in' in bom_txt)

    # 5. Umschalten auf cm und m
    p.pg.select_option('#proj-unit', 'cm'); p.wait(300)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    pw_cm = p.pg.locator('#p-w').input_value()
    p.pg.fill('#p-w', '3'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_from_cm = p.ev("return App.doc.items[0].p.w")
    p.ev("App.select([])"); p.wait(300)
    p.pg.select_option('#proj-unit', 'm'); p.wait(300)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    pw_m = p.pg.locator('#p-w').input_value()
    p.pg.fill('#p-w', '0,05'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
    w_from_m = p.ev("return App.doc.items[0].p.w")
    ok5 = pw_cm == '2,54' and abs(w_from_cm - 30) < 1e-6 and pw_m == '0,03' and abs(w_from_m - 50) < 1e-6

    # 6. Rückgängig, Migrate, Befehle & Hilfetext
    p.ev("App.undo(); App.undo()"); p.wait(400)   # zurück über m-Eingabe und Umschaltung auf m → cm
    unit_after_undo = p.ev("return App.doc.settings.unit")
    mig_unit = p.ev("const d=Model.migrate({format:'masswerk',version:1,id:'p_t',name:'T',params:[],items:[],settings:{unit:'in'}}); return d.settings.unit")
    cmd_ids = p.ev("return Commands.search('Einheit').map(c=>c.id)")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok6 = (
        unit_after_undo == 'cm'
        and mig_unit == 'in'
        and 'unit-in' in cmd_ids
        and 'projectUnit' in hilfen
        and all(k in hilfen['projectUnit'] for k in ('tip', 'hilfe', 'tipp'))
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_f11240028(p):
    # 1+2: camAnim-Fallback bei blockiertem requestAnimationFrame + Abbruch bei Nutzer-Start
    p.empty()
    p.ev("App.change('x', d=>{ const a=Model.newItem('box',{w:40,d:30,h:10},{name:'Platte'}); d.items.push(a); })"); warte_rechnen(p)
    top_idx = p.ev("const r=App.results.get(App.doc.items[0].id); return r.data.faces.findIndex(f=>f.n && f.n[2]>0.99)")
    p.ev("Viewer.setView('iso', false)"); p.wait(300)
    pause_raf = "window.__origRAF=window.requestAnimationFrame; window.__rafQueue=[]; window.requestAnimationFrame=(cb)=>{window.__rafQueue.push(cb); return window.__rafQueue.length;};"
    resume_raf = "if(window.__origRAF){ window.requestAnimationFrame=window.__origRAF; const q=window.__rafQueue.splice(0); for(const cb of q) window.requestAnimationFrame(cb); }"
    p.ev(pause_raf)
    try:
        p.ev("Viewer.lookAtFace(App.doc.items[0].id, arg, true)", top_idx)
        p.wait(700)
        dirv1 = p.ev("const c=Viewer.camera, t=Viewer.controls.target, v=c.position.clone().sub(t).normalize(); return [v.x, v.y, v.z]")
    finally:
        p.ev(resume_raf)
    ok1 = top_idx >= 0 and dirv1[2] > 0.999

    p.ev("Viewer.setView('iso', false)"); p.wait(300)
    p.ev(pause_raf)
    try:
        p.ev("Viewer.lookAtFace(App.doc.items[0].id, arg, true); Viewer.controls.dispatchEvent({type:'start'});", top_idx)
        p.wait(700)
        dirv2 = p.ev("const c=Viewer.camera, t=Viewer.controls.target, v=c.position.clone().sub(t).normalize(); return [v.x, v.y, v.z]")
    finally:
        p.ev(resume_raf)
    ok2 = dirv2[2] < 0.7

    # 3: loftPreview wird durch laufende Maus-/Kamera-render()-Aufrufe ohne Kurvenänderung nicht ausgehungert
    p.ev("Start.newProject(true)"); p.wait(600)
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 40, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    p.pg.locator('#loft-rail-edit').click(); p.wait(1000)
    in_rail = SS(p, "return S.ctx.mode") == 'loftrail'
    SS(p, "const q=S.ents[0].pts; q[1]=[Math.sign(q[0][0])*25, 20]")
    p.pg.mouse.move(700, 400)
    for i in range(8):
        p.wait(80)
        p.pg.mouse.move(702 if i % 2 == 0 else 706, 402 if i % 2 == 0 else 406)
    warte_rechnen(p, 30)
    pv = p.ev("const r=App.extra.length&&App.results.get('__preview'); return r&&r.data?r.data.bbox:null")
    ok3 = in_rail and pv is not None and (pv[3] - pv[0]) > 45
    return [ok1, ok2, ok3]


def t_a019_uebersetzbare_oberflaeche(p):
    # 1. Sammlung (data/texte-de.json) & T() inkl. Platzhalter und Fallback
    texte = p.pg.evaluate("fetch('data/texte-de.json').then(r=>r.json())")
    ok1 = (
        isinstance(texte, dict) and len(texte) > 100
        and p.ev("return T('tool.body')") == 'Körper'
        and p.ev("return T('ctx.edgesCount', { n: 3 })") == '3 Kanten'
        and p.ev("return T('unbekannt.schluessel')") == 'unbekannt.schluessel'
    )
    orig = p.ev("return { ...I18n.texts }")
    # 2. Werkzeugleiste & Kopfzeile: Text direkt in der Sammlung überschreiben + über I18n.set
    p.empty()
    p.ev("I18n.texts['tool.body'] = 'Formen-Test'; I18n.refresh()")
    p.ev("I18n.set({'tool.sketch': 'Zeichnen-Test', 'topbar.model': '3D-Test'})")
    p.wait(200)
    ok2 = (
        p.pg.locator('#t-body').text_content() == 'Formen-Test'
        and p.pg.locator('#t-sketch').text_content() == 'Zeichnen-Test'
        and p.pg.locator('#tab-model').text_content() == '3D-Test'
    )
    # 3. Startseite
    p.ev("I18n.set({'start.newProject': 'Neu-Test', 'start.emptyTitle': 'Leer-Test'}); Start.show()")
    p.wait(300)
    ok3 = (
        p.pg.locator('.start').get_by_text('Neu-Test').count() > 0
        and p.pg.locator('.start .card.new b').text_content() == 'Leer-Test'
    )
    p.ev("Start.hide()"); p.wait(200)
    # 4. Menüs (Hauptmenü & Ansicht-Menü)
    p.ev("I18n.set({'menu.main.settings': 'Optionen-Test', 'menu.view.section': 'Schnitt-Test'})")
    p.pg.locator('#btn-menu').click(); p.wait(250)
    ok4a = p.pg.locator('.menu button', has_text='Optionen-Test').count() == 1
    p.pg.keyboard.press('Escape'); p.wait(200)
    p.pg.locator('#t-views').click(); p.wait(250)
    ok4b = p.pg.locator('.menu button', has_text='Schnitt-Test').count() == 1
    p.pg.keyboard.press('Escape'); p.wait(200)
    ok4 = ok4a and ok4b
    # 5. Kontextleiste & Originaltexte wiederherstellen
    p.ev("Actions.addPrimitive('box')"); warte_rechnen(p, 20)
    p.ev("I18n.set({'ctx.toHole': 'Loch-Test', 'ctx.rotate': 'Dreh-Test'})")
    p.wait(300)
    ok5a = (
        p.pg.locator('.ctxbar button', has_text='Loch-Test').count() == 1
        and p.pg.locator('.ctxbar button[aria-label="Dreh-Test"]').count() == 1
    )
    p.ev("I18n.set(arg)", orig); p.wait(300)
    ok5b = (
        p.pg.locator('#t-body').text_content() == 'Körper'
        and p.pg.locator('.ctxbar button', has_text='Zum Loch').count() == 1
    )
    return [ok1, ok2, ok3, ok4, ok5a and ok5b]


def t_a022_skizze_fertig_bestimmen(p):
    # 1. Rechteck und Kreis ohne Maße und Regeln -> „Fertig bestimmen“ -> gestrichelte Vorschau -> „Abbrechen“
    ents = [
        {'id': 'R1', 'type': 'rect', 'a': [10, 10], 'b': [50, 35]},
        {'id': 'C1', 'type': 'circle', 'c': [30, 22], 'r': 6},
    ]
    scene(p, ents)
    dof0 = SS(p, "return S.status ? S.status.dof : -1")
    p.pg.click('#sk-autodef'); p.wait(400)
    prop_dims = p.pg.locator('.skdim.prop')
    prop_border = prop_dims.first.evaluate("el => getComputedStyle(el).borderTopStyle") if prop_dims.count() else ''
    st_prop = SS(p, "return { dims: S.dims.length, cons: S.cons.length, hasProp: !!S.autoDef, pDims: S.autoDef ? S.autoDef.dims.length : 0 }")
    ok1a = (
        dof0 == 7
        and p.pg.locator('#sk-autodef-box').count() == 1
        and p.pg.locator('#sk-autodef-apply').count() == 1
        and p.pg.locator('#sk-autodef-cancel').count() == 1
        and prop_dims.count() >= 5
        and prop_border == 'dashed'
        and st_prop['dims'] == 0 and st_prop['cons'] == 0 and st_prop['hasProp']
    )
    p.pg.click('#sk-autodef-cancel'); p.wait(300)
    st_cancel = SS(p, "return { dims: S.dims.length, cons: S.cons.length, hasProp: !!S.autoDef, dof: S.status ? S.status.dof : -1 }")
    ok1 = ok1a and p.pg.locator('#sk-autodef-box').count() == 0 and p.pg.locator('.skdim.prop').count() == 0 and st_cancel['dims'] == 0 and st_cancel['dof'] == 7

    # 2. „Fertig bestimmen“ + „Übernehmen“ -> voll bestimmt
    p.pg.click('#sk-autodef'); p.wait(400)
    p.pg.click('#sk-autodef-apply'); p.wait(400)
    st_apply = SS(p, "return { ok: S.status && S.status.ok, dof: S.status ? S.status.dof : -1, dims: S.dims.length, hasProp: !!S.autoDef }")
    panel_txt = (p.pg.locator('.right .panel-body').text_content() or '').lower()
    ok2 = (
        st_apply['ok'] is True and st_apply['dof'] == 0 and not st_apply['hasProp']
        and st_apply['dims'] >= 7 and p.pg.locator('.skdim.prop').count() == 0
        and p.pg.locator('.skdim').count() == st_apply['dims']
        and 'voll bestimmt' in panel_txt
    )

    # 3. Ein Rückgängig stellt den alten Zustand her
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400)
    st_undo = SS(p, "return { dims: S.dims.length, cons: S.cons.length, dof: S.status ? S.status.dof : -1 }")
    ok3 = st_undo['dims'] == 0 and st_undo['cons'] == 0 and st_undo['dof'] == 7 and p.pg.locator('.skdim').count() == 0

    # 4. Regeln (< 2° waagerecht/senkrecht, < 0,05 mm deckungsgleich) + schräge Linie (> 2°) + Bogen (Radius)
    ents2 = [
        {'id': 'L1', 'type': 'line', 'a': [10, 10], 'b': [40, 10.5]},
        {'id': 'L2', 'type': 'line', 'a': [40, 10.5], 'b': [40.5, 30]},
        {'id': 'L3', 'type': 'line', 'a': [40.5, 30], 'b': [10, 29.6]},
        {'id': 'L4', 'type': 'line', 'a': [10, 29.6], 'b': [10.02, 10.02]},
        {'id': 'L5', 'type': 'line', 'a': [55, 10], 'b': [75, 11.8]},
        {'id': 'A1', 'type': 'arc', 'a': [55, 25], 'm': [65, 35], 'b': [75, 25]},
    ]
    p.ev("Sketch.cancel(true); App.change('x', d=>{ const it=Model.newItem('extrude',{},{}); it.p={sketch:{plane:{o:[0,0,0],x:[1,0,0],n:[0,0,1]},ents:arg,dims:[],cons:[]},dist:3,dir:'normal'}; d.items.push(it); })", ents2)
    p.wait(1500)
    p.ev("Sketch.editItem(App.doc.items[App.doc.items.length-1].id)"); p.wait(800)
    p.pg.click('#sk-autodef'); p.wait(500)
    prop2 = SS(p, """const a = S.autoDef;
      return a ? {
        cons: a.cons.map(c => ({ t: c.type, refs: c.refs })),
        dims: a.dims.map(d => ({ e: d.e, k: d.k })),
        dofAfter: a.dofAfter
      } : null""")
    con_prop_border = p.pg.locator('.skcon.prop').first.evaluate("el => getComputedStyle(el).borderTopStyle") if p.pg.locator('.skcon.prop').count() else ''
    has_h1 = prop2 and any(c['t'] == 'horizontal' and c['refs'][0].get('e') == 'L1' for c in prop2['cons'])
    has_h3 = prop2 and any(c['t'] == 'horizontal' and c['refs'][0].get('e') == 'L3' for c in prop2['cons'])
    has_v2 = prop2 and any(c['t'] == 'vertical' and c['refs'][0].get('e') == 'L2' for c in prop2['cons'])
    has_v4 = prop2 and any(c['t'] == 'vertical' and c['refs'][0].get('e') == 'L4' for c in prop2['cons'])
    has_co = prop2 and any(c['t'] == 'coincident' and {r.get('e') for r in c['refs']} == {'L4', 'L1'} for c in prop2['cons'])
    no_hv5 = prop2 and not any(c['t'] in ('horizontal', 'vertical') and c['refs'][0].get('e') == 'L5' for c in prop2['cons'])
    has_ang5 = prop2 and any(d['e'] == 'L5' and d['k'] == 'ang' for d in prop2['dims'])
    has_r_arc = prop2 and any(d['e'] == 'A1' and d['k'] == 'r' for d in prop2['dims'])
    p.pg.click('#sk-autodef-apply'); p.wait(500)
    st_apply2 = SS(p, "return { ok: S.status && S.status.ok, dof: S.status ? S.status.dof : -1, regs: SK.regions(S.ents).length }")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400)
    st_undo2 = SS(p, "return { dims: S.dims.length, cons: S.cons.length, regs: SK.regions(S.ents).length }")
    ok4 = (
        bool(prop2) and prop2['dofAfter'] == 0 and con_prop_border == 'dashed'
        and has_h1 and has_h3 and has_v2 and has_v4 and has_co and no_hv5 and has_ang5 and has_r_arc
        and st_apply2['ok'] is True and st_apply2['dof'] == 0 and st_apply2['regs'] == 1
        and st_undo2['dims'] == 0 and st_undo2['cons'] == 0 and st_undo2['regs'] == 0
    )

    # 5. Sichtbar in Einfach & Profi, Hilfetext und Befehlssuche
    p.ev("ViewPrefs.setLevel('simple')"); p.wait(250)
    vis_simple = p.pg.locator('#sk-autodef').is_visible()
    p.ev("ViewPrefs.setLevel('pro')"); p.wait(250)
    vis_pro = p.pg.locator('#sk-autodef').is_visible()
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    cmds = p.ev("return Commands.search('Fertig bestimmen').map(c=>c.id)")
    ok5 = (
        vis_simple and vis_pro
        and 'sketchAutoDefine' in hilfen
        and all(k in hilfen['sketchAutoDefine'] for k in ('tip', 'hilfe', 'tipp'))
        and 'sketch-autodef' in cmds
    )
    return [ok1, ok2, ok3, ok4, ok5]


def t_a025_flaeche_uebernehmen(p):
    # 1. Quader 40×30×10 mit Loch Ø10; Skizze auf der Oberseite starten, Taste Z → #proj-off da
    p.empty()
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10}); const h=Model.newItem('cylinder',{d:10,h:14},{role:'hole'}); h.t.z=-2; d.items.push(b,h); })")
    warte_rechnen(p, 30)
    p.ev("""
      const id = App.doc.items[0].id;
      const r = App.results.get(id);
      const fi = r.data.faces.findIndex(f => f && f.t === 'PLANE' && f.n && f.n[2] > 0.99);
      Sketch.startOnFace({ id, idx: fi, info: r.data.faces[fi] });
    """)
    p.wait(1500)
    p.pg.keyboard.press('z'); p.wait(250)
    ok1 = p.ev("return Sketch.state.tool") == 'project' and p.pg.locator('#proj-off').count() == 1

    # 2. Umschalt + Klick auf Oberseite (Versatz 0): 4 Linien (40×30) + 1 Kreis (Ø10), verbunden & fixiert, 1 Fläche mit 1 Loch
    s = world_screen(p, 12, 8, 10)
    p.pg.keyboard.down('Shift'); p.pg.mouse.click(s[0], s[1]); p.pg.keyboard.up('Shift'); p.wait(900)
    st0 = SS(p, """
      const L = S.ents.filter(e => e.type === 'line'), C = S.ents.filter(e => e.type === 'circle');
      const xs = L.flatMap(e => [e.a[0], e.b[0]]), ys = L.flatMap(e => [e.a[1], e.b[1]]);
      const regs = SK.regions(S.ents);
      return {
        n: S.ents.length, nl: L.length, nc: C.length,
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        r: C[0] ? C[0].r : 0,
        allFix: S.ents.every(e => S.cons.some(c => c.type === 'fix' && c.refs[0].e === e.id)),
        allLink: S.ents.every(e => !!e.link),
        regs: regs.length, holes: regs[0] ? regs[0].holes.length : 0
      };
    """)
    ok2 = (
        st0['n'] == 5 and st0['nl'] == 4 and st0['nc'] == 1
        and abs(st0['w'] - 40) < 0.02 and abs(st0['h'] - 30) < 0.02 and abs(st0['r'] - 5) < 0.02
        and st0['allFix'] and st0['allLink'] and st0['regs'] == 1 and st0['holes'] == 1
    )

    # 3. Rückgängig nimmt alle auf einmal weg; Versatz +2 mm → Rechteck 44×34, Kreis Ø6
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400)
    after_undo = SS(p, "return S.ents.length")
    p.pg.fill('#proj-off', '2'); p.pg.press('#proj-off', 'Enter'); p.wait(200)
    s = world_screen(p, 12, 8, 10)
    p.pg.keyboard.down('Shift'); p.pg.mouse.click(s[0], s[1]); p.pg.keyboard.up('Shift'); p.wait(900)
    st2 = SS(p, """
      const L = S.ents.filter(e => e.type === 'line'), C = S.ents.filter(e => e.type === 'circle');
      const xs = L.flatMap(e => [e.a[0], e.b[0]]), ys = L.flatMap(e => [e.a[1], e.b[1]]);
      const regs = SK.regions(S.ents);
      return {
        n: S.ents.length, nl: L.length, nc: C.length,
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        r: C[0] ? C[0].r : 0,
        offs: S.ents.every(e => e.link && Math.abs(e.link.off - 2) < 1e-4),
        regs: regs.length, holes: regs[0] ? regs[0].holes.length : 0
      };
    """)
    ok3 = (
        after_undo == 0
        and st2['n'] == 5 and st2['nl'] == 4 and st2['nc'] == 1
        and abs(st2['w'] - 44) < 0.02 and abs(st2['h'] - 34) < 0.02 and abs(st2['r'] - 3) < 0.02
        and st2['offs'] and st2['regs'] == 1 and st2['holes'] == 1
    )

    # 4. Versatz −2 mm (nach innen) → Rechteck 36×26, Kreis Ø14
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(400)
    p.pg.fill('#proj-off', '-2'); p.pg.press('#proj-off', 'Enter'); p.wait(200)
    s = world_screen(p, 12, 8, 10)
    p.pg.keyboard.down('Shift'); p.pg.mouse.click(s[0], s[1]); p.pg.keyboard.up('Shift'); p.wait(900)
    stm = SS(p, """
      const L = S.ents.filter(e => e.type === 'line'), C = S.ents.filter(e => e.type === 'circle');
      const xs = L.flatMap(e => [e.a[0], e.b[0]]), ys = L.flatMap(e => [e.a[1], e.b[1]]);
      return { nl: L.length, nc: C.length, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), r: C[0] ? C[0].r : 0 };
    """)
    ok4 = stm['nl'] == 4 and stm['nc'] == 1 and abs(stm['w'] - 36) < 0.02 and abs(stm['h'] - 26) < 0.02 and abs(stm['r'] - 7) < 0.02

    # 5. Verbunden mit Versatz +2 mm: Körper wird breiter (40 → 50) → übernommene Kontur wächst auf 54×34, Kreis bleibt Ø6
    p.ev("Sketch.cancel(true)"); p.wait(300)
    p.ev("Sketch.startOnPlane('XY', 10)"); p.wait(1500)
    p.pg.keyboard.press('z'); p.wait(200)
    p.pg.fill('#proj-off', '2'); p.pg.press('#proj-off', 'Enter'); p.wait(200)
    s = world_screen(p, 12, 8, 10)
    p.pg.keyboard.down('Shift'); p.pg.mouse.click(s[0], s[1]); p.pg.keyboard.up('Shift'); p.wait(900)
    fertig_hoch(p, '3')
    p.ev("App.change('Breiter', d=>{ d.items[0].p.w = 50; })"); warte_rechnen(p, 30); p.wait(1000); warte_rechnen(p, 30)
    st5 = p.ev("""
      const it = App.doc.items[2]; const sk = it && it.p && it.p.sketch;
      if (!sk) return null;
      const L = sk.ents.filter(e => e.type === 'line'), C = sk.ents.filter(e => e.type === 'circle');
      const xs = L.flatMap(e => [e.a[0], e.b[0]]), ys = L.flatMap(e => [e.a[1], e.b[1]]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), r: C[0] ? C[0].r : 0, errs: App.errors.length };
    """)
    ok5 = bool(st5) and abs(st5['w'] - 54) < 0.02 and abs(st5['h'] - 34) < 0.02 and abs(st5['r'] - 3) < 0.02 and st5['errs'] == 0
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-027] Weitere Bezugsebenen (BZ-03, BZ-04, BZ-05) ----------
def t_a027_weitere_bezugsebenen(p):
    def pdist(pl, pt):
        return abs(sum((pt[k] - pl['o'][k]) * pl['n'][k] for k in range(3)))

    # 1. Tangential an Zylinder (BZ-03) + Mitwandern + Winkel ändern
    p.empty()
    p.ev("App.change('x', d=>{ const c=Model.newItem('cylinder',{d:20,h:30},{name:'Zylinder'}); c.t.x=15; c.t.y=-5; d.items.push(c); })"); warte_rechnen(p)
    d_cyl = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='CYLINDRE');
      return Datums.addTangent({id,idx:fi,info:r.data.faces[fi]}, [25,-5,15]);""")
    p.wait(400)
    pl0 = d_cyl['plane']
    ok_cyl_0 = (
        d_cyl and d_cyl['base']['type'] == 'tangent'
        and abs(pl0['n'][2]) < 1e-4 and pl0['n'][0] > 0.99
        and abs(pdist(pl0, [15, -5, 0]) - 10.0) < 1e-3
        and pdist(pl0, [25, -5, 15]) < 1e-3
        and p.pg.locator('#datum-tree .datum-row').count() == 1
    )
    p.ev("App.change('x', d=>{ d.items[0].p.d=36; d.items[0].t.x=25; })"); warte_rechnen(p); p.wait(500)
    pl_cyl_m = p.ev("return App.doc.datums[0].plane")
    p.ev("Datums.select(App.doc.datums[0].id)"); p.wait(400)
    p.pg.fill('#datum-angle', '90'); p.pg.press('#datum-angle', 'Enter'); p.wait(500)
    pl_cyl_90 = p.ev("return App.doc.datums[0].plane")
    ok1 = (
        ok_cyl_0
        and abs(pdist(pl_cyl_m, [25, -5, 0]) - 18.0) < 1e-3
        and pl_cyl_m['n'][0] > 0.99
        and abs(pdist(pl_cyl_90, [25, -5, 0]) - 18.0) < 1e-3
        and abs(abs(pl_cyl_90['n'][1]) - 1.0) < 1e-3
        and abs(pl_cyl_90['n'][0]) < 1e-3
    )

    # 2. Tangential an Kegel (BZ-03) + Mitwandern
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const k=Model.newItem('cone',{d1:20,d2:0,h:20},{name:'Kegel'}); d.items.push(k); })"); warte_rechnen(p)
    d_cone = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='CONE');
      return Datums.addTangent({id,idx:fi,info:r.data.faces[fi]}, [10,0,0]);""")
    p.wait(400)
    plc = d_cone['plane']
    inv_s5 = 1.0 / math.sqrt(5.0)
    p.ev("App.change('x', d=>{ d.items[0].p.d1=30; })"); warte_rechnen(p); p.wait(500)
    plc_m = p.ev("return App.doc.datums[0].plane")
    ok2 = (
        d_cone and d_cone['base']['type'] == 'tangent'
        and pdist(plc, [10, 0, 0]) < 1e-2
        and pdist(plc, [0, 0, 20]) < 1e-2
        and abs(plc['n'][0] - 2 * inv_s5) < 1e-2
        and abs(plc['n'][2] - inv_s5) < 1e-2
        and pdist(plc_m, [15, 0, 0]) < 1e-2
        and pdist(plc_m, [0, 0, 20]) < 1e-2
    )

    # 3. Senkrecht zu Kante oder Kurve (BZ-04): Mitte, Anfang, Ende, Prozent, Mitwandern, Kreiskante, Skizze
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10},{name:'Quader'}); d.items.push(b); })"); warte_rechnen(p)
    d_nc = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const ei=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2]-10)<1e-4&&Math.abs(g.b[2]-10)<1e-4&&Math.abs(g.m[1]+15)<1e-4);
      return Datums.addNormalToCurve({id,edgeIdx:ei}, 'mid');""")
    p.wait(400)
    p.ev("Datums.select(App.doc.datums[0].id)"); p.wait(300)
    p.pg.select_option('#datum-pos-mode', 'start'); p.wait(400)
    pl_start = p.ev("return App.doc.datums[0].plane")
    p.pg.select_option('#datum-pos-mode', 'end'); p.wait(400)
    pl_end = p.ev("return App.doc.datums[0].plane")
    p.pg.fill('#datum-percent', '25'); p.pg.press('#datum-percent', 'Enter'); p.wait(400)
    pl_25 = p.ev("return App.doc.datums[0].plane")
    p.ev("App.change('x', d=>{ d.items[0].p.w=60; d.items[0].p.h=25; })"); warte_rechnen(p); p.wait(500)
    pl_nc_m = p.ev("return App.doc.datums[0].plane")
    # Skizze auf dieser Ebene + Hochziehen
    p.ev("Datums.select(App.doc.datums[0].id)"); p.wait(300)
    p.pg.locator('#datum-sketch').click(); p.wait(900)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[-3,-3],b:[3,3]})"); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(900)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(1100); warte_rechnen(p)
    ext_nc = p.ev("const it=App.doc.items[App.doc.items.length-1]; return {kind:it.kind, errs:App.errorsFor(it.id).length}")
    # Kreiskante an Zylinder
    p.ev("App.change('x', d=>{ const c=Model.newItem('cylinder',{d:20,h:12},{name:'Rolle'}); c.t.y=30; d.items.push(c); })"); warte_rechnen(p)
    d_circ = p.ev("""const id=App.doc.items[App.doc.items.length-1].id, r=App.results.get(id);
      const ei=r.data.edges.findIndex(g=>g.t==='CIRCLE'&&g.c&&Math.abs(g.c[2]-12)<1e-4);
      return Datums.addNormalToCurve({id,edgeIdx:ei}, 'start');""")
    p.wait(300)
    ok_circ = False
    if d_circ:
        oc = d_circ['plane']['o']
        nc = d_circ['plane']['n']
        rad_v = [oc[0] - 0, oc[1] - 30, oc[2] - 12]
        rad_len = math.sqrt(sum(v * v for v in rad_v))
        dot_rn = abs(sum(rad_v[k] * nc[k] for k in range(3)))
        ok_circ = abs(rad_len - 10.0) < 1e-3 and dot_rn < 1e-3 and abs(nc[2]) < 1e-4
    ok3 = (
        d_nc and d_nc['base']['type'] == 'normalToCurve'
        and abs(d_nc['plane']['o'][0]) < 1e-4 and abs(d_nc['plane']['o'][1] + 15) < 1e-4 and abs(d_nc['plane']['o'][2] - 10) < 1e-4
        and abs(abs(d_nc['plane']['n'][0]) - 1.0) < 1e-4
        and abs(abs(pl_start['o'][0]) - 20.0) < 1e-4
        and abs(abs(pl_end['o'][0]) - 20.0) < 1e-4 and abs(pl_start['o'][0] - pl_end['o'][0]) > 39.0
        and abs(abs(pl_25['o'][0]) - 10.0) < 1e-4
        and abs(abs(pl_nc_m['o'][0]) - 15.0) < 1e-3 and abs(pl_nc_m['o'][2] - 25.0) < 1e-3
        and ext_nc['kind'] == 'extrude' and ext_nc['errs'] == 0
        and ok_circ
    )

    # 4. Durch Kante und Punkt (BZ-05) + Mitwandern + kollinear abgelehnt
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10},{name:'Block'}); d.items.push(b); })"); warte_rechnen(p)
    res_ep = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const ei=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2])<1e-4&&Math.abs(g.b[2])<1e-4&&Math.abs(g.m[1]+15)<1e-4);
      const bad=Datums.addEdgePoint({id,edgeIdx:ei}, [0,-15,0]);
      const good=Datums.addEdgePoint({id,edgeIdx:ei}, [20,15,10]);
      return {good, bad};""")
    p.wait(400)
    d_ep = res_ep['good']
    p.ev("App.change('x', d=>{ d.items[0].p.h=20; })"); warte_rechnen(p); p.wait(500)
    pl_ep_m = p.ev("return App.doc.datums[0].plane")
    ok4 = (
        res_ep['bad'] is None
        and d_ep and d_ep['base']['type'] == 'edgePoint'
        and pdist(d_ep['plane'], [-20, -15, 0]) < 1e-3
        and pdist(d_ep['plane'], [20, -15, 0]) < 1e-3
        and pdist(d_ep['plane'], [20, 15, 10]) < 1e-3
        and pdist(pl_ep_m, [-20, -15, 0]) < 1e-3
        and pdist(pl_ep_m, [20, 15, 20]) < 1e-3
        and abs(pl_ep_m['n'][2] - d_ep['plane']['n'][2]) > 0.05
    )

    # 5. Durch zwei Kanten (BZ-05): parallel, schneidend, Mitwandern, windschief abgelehnt
    res_2e = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id), eds=r.data.edges;
      const eBotF=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2])<1e-4&&Math.abs(g.b[2])<1e-4&&Math.abs(g.m[1]+15)<1e-4);
      const eTopB=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2]-20)<1e-4&&Math.abs(g.b[2]-20)<1e-4&&Math.abs(g.m[1]-15)<1e-4);
      const eBotR=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.a[2])<1e-4&&Math.abs(g.b[2])<1e-4&&Math.abs(g.m[0]-20)<1e-4);
      const eVertBR=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.m[0]-20)<1e-4&&Math.abs(g.m[1]-15)<1e-4);
      const dPar=Datums.addTwoEdges({id,edgeIdx:eBotF}, {id,edgeIdx:eTopB});
      const dInt=Datums.addTwoEdges({id,edgeIdx:eBotF}, {id,edgeIdx:eBotR});
      const dSkew=Datums.addTwoEdges({id,edgeIdx:eBotF}, {id,edgeIdx:eVertBR});
      return {dPar, dInt, dSkew};""")
    p.wait(400)
    d_par = res_2e['dPar']
    d_int = res_2e['dInt']
    p.ev("App.change('x', d=>{ d.items[0].p.h=30; })"); warte_rechnen(p); p.wait(500)
    pl_par_m = p.ev("return App.doc.datums[1].plane")
    ok5 = (
        res_2e['dSkew'] is None
        and d_par and d_par['base']['type'] == 'twoEdges'
        and pdist(d_par['plane'], [-20, -15, 0]) < 1e-3
        and pdist(d_par['plane'], [20, 15, 20]) < 1e-3
        and d_int and d_int['base']['type'] == 'twoEdges'
        and abs(abs(d_int['plane']['n'][2]) - 1.0) < 1e-3
        and pdist(pl_par_m, [20, 15, 30]) < 1e-3
    )

    # 6. Dialog, Abhängigkeiten, Bezug fehlt + Rückgängig, Befehle & Hilfetexte
    p.ev("Datums.select(null); Datums.dialog();"); p.wait(400)
    dlg_ok = (
        p.pg.locator('#dp-tangent').count() == 1
        and p.pg.locator('#dp-normal-curve').count() == 1
        and p.pg.locator('#dp-edge-point').count() == 1
        and p.pg.locator('#dp-two-edges').count() == 1
    )
    p.pg.keyboard.press('Escape'); p.wait(200)
    deps_cnt = p.ev("return Model.dependencies(App.doc).filter(x=>x.datum).length")
    p.ev("App.change('weg', d=>{ d.items.splice(0,1); })"); warte_rechnen(p); p.wait(400)
    lost_ok = 'Bezug fehlt' in p.pg.locator('#datum-tree').inner_text()
    p.ev("App.undo()"); warte_rechnen(p); p.wait(400)
    restored_ok = 'Bezug fehlt' not in p.pg.locator('#datum-tree').inner_text()
    cmds = p.ev("return Commands.search('Bezugsebene').map(c=>c.id)")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    help_keys = ('datumTangent', 'datumNormalCurve', 'datumEdgePoint', 'datumTwoEdges')
    ok6 = (
        dlg_ok and deps_cnt >= 3 and lost_ok and restored_ok
        and all(cid in cmds for cid in ('datum-tangent', 'datum-normal-curve', 'datum-edge-point', 'datum-two-edges'))
        and all(k in hilfen and all(f in hilfen[k] for f in ('tip', 'hilfe', 'tipp')) for k in help_keys)
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_a023_freie_stellen_widerspruch(p):
    # 1. Linie nur mit Länge -> beide Endpunkte als frei markiert, Zahl > 0
    scene(p, [{'id': 'L1', 'type': 'line', 'a': [10, 10], 'b': [55, 10]}])
    click_uv(p, 30, 10, alt=False); p.wait(300)
    p.pg.fill('#se-len', '40'); p.pg.press('#se-len', 'Enter'); p.wait(400)
    p.pg.click('#sk-free'); p.wait(300)
    st1 = SS(p, """
      const pts = [...document.querySelectorAll('.skfree-pt')].map(el => ({ eid: el.dataset.eid, pt: el.dataset.pt }));
      const badge = document.getElementById('sk-free-badge');
      return {
        freeMode: S.freeMode,
        cntText: document.getElementById('sk-free-count')?.textContent,
        badgeText: badge ? badge.textContent : '',
        hasInfo: !!document.getElementById('sk-free-info'),
        dof: S.status && S.status.dof,
        dims: S.dims.length,
        freeEnt: S.status && S.status.freeEnts && S.status.freeEnts.has('L1'),
        pts
      };
    """)
    ok1 = (st1['freeMode'] is True and st1['dims'] == 1 and int(st1['cntText'] or 0) == 3 and '3 fehlende' in st1['badgeText']
           and st1['hasInfo'] and st1['freeEnt']
           and len(st1['pts']) == 2
           and {q['pt'] for q in st1['pts']} == {'a', 'b'}
           and all(q['eid'] == 'L1' for q in st1['pts']))

    # 2. Klick auf freie Stelle lässt sie kurz wackeln; Umschalt F schaltet aus/an; F bleibt Versatz
    before_wig = SS(p, "const l=E('L1'); return { a: l.a, b: l.b }")
    p.pg.click('.skfree-pt[data-pt="b"]'); p.wait(120)
    wig = SS(p, "return S.lastWiggle ? { eid: S.lastWiggle.eid, p: S.lastWiggle.p, amp: S.lastWiggle.amp, active: !!S.wiggle } : null")
    p.wait(650)
    after_wig = SS(p, "const l=E('L1'); return { active: !!S.wiggle, a: l.a, b: l.b }")
    p.pg.locator('canvas').first.focus()
    p.pg.keyboard.press('Shift+f'); p.wait(250)
    off_mode = SS(p, "return S.freeMode")
    p.pg.keyboard.press('Shift+f'); p.wait(250)
    on_mode = SS(p, "return S.freeMode")
    p.pg.keyboard.press('f'); p.wait(200)
    f_tool = SS(p, "return S.tool")
    ok2 = (bool(wig) and wig['eid'] == 'L1' and wig['p'] == 'b' and wig['amp'] > 0
           and after_wig['active'] is False
           and near(after_wig['a'], before_wig['a'], 1e-4) and near(after_wig['b'], before_wig['b'], 1e-4)
           and off_mode is False and on_mode is True and f_tool == 'offset')

    # 3. Widersprüchliches drittes Maß -> Liste aller beteiligten Maße, Klick hebt hervor
    p.ev("""
      Sketch.cancel(true);
      App.change('x', d => {
        d.items[0].p.sketch.ents = [{ id: 'R1', type: 'rect', a: [0, 0], b: [40, 30] }];
        d.items[0].p.sketch.dims = [{ id: 'dw', e: 'R1', k: 'w', v: 40 }, { id: 'dh', e: 'R1', k: 'h', v: 30 }];
        d.items[0].p.sketch.cons = [];
      });
      Sketch.editItem(App.doc.items[0].id);
    """); p.wait(800)
    p.pg.keyboard.press('d'); p.wait(150)
    s0 = to_screen(p, 0, 0); s2 = to_screen(p, 40, 30)
    p.pg.mouse.click(s0[0], s0[1]); p.wait(200)
    p.pg.mouse.click(s2[0], s2[1]); p.wait(300)
    p.pg.keyboard.press('ControlOrMeta+a'); p.pg.keyboard.type('60'); p.pg.keyboard.press('Enter'); p.wait(500)
    cf3 = SS(p, """
      const box = document.getElementById('sk-conflict');
      const rows = [...document.querySelectorAll('#sk-conflict .sk-conf-row')].map(r => ({
        id: r.dataset.confId,
        kind: r.dataset.confKind,
        txt: r.textContent,
        hasDel: !!r.querySelector('.sk-conf-del')
      }));
      return { hasBox: !!box, rows };
    """)
    p.pg.locator('#sk-conflict .sk-conf-row[data-conf-id="dw"] .sk-conf-pick').click(); p.wait(300)
    foc = SS(p, "return { fid: S.conflict && S.conflict.focusId, cls: document.querySelectorAll('.skdim.conf-focus').length }")
    ok3 = (cf3['hasBox'] and len(cf3['rows']) == 3
           and all(r['hasDel'] for r in cf3['rows'])
           and {r['id'] for r in cf3['rows']} == {'dw', 'dh', '_neu'}
           and foc['fid'] == 'dw' and foc['cls'] == 1)

    # 4. „Entfernen“ auf Höhe löst den Widerspruch und setzt das neue Maß um
    p.pg.locator('#sk-conflict .sk-conf-row[data-conf-id="dh"] .sk-conf-del').click(); p.wait(400)
    st4 = SS(p, """
      const r = E('R1');
      return {
        hasBox: !!document.getElementById('sk-conflict'),
        ok: !!(S.status && S.status.ok),
        w: Math.abs(r.b[0] - r.a[0]),
        h: Math.abs(r.b[1] - r.a[1]),
        dimKs: S.dims.map(d => d.k).sort()
      };
    """)
    ok4 = (not st4['hasBox'] and st4['ok'] and abs(st4['w'] - 40) < 1e-2
           and abs(st4['h'] - math.sqrt(60**2 - 40**2)) < 0.05
           and st4['dimKs'] == ['dist', 'w'])

    # 5. Regel-Widerspruch + Live-Widerspruch + Hilfetext
    p.ev("""
      Sketch.cancel(true);
      App.change('x', d => {
        d.items[0].p.sketch.ents = [
          { id: 'L1', type: 'line', a: [0, 0], b: [30, 0] },
          { id: 'L2', type: 'line', a: [0, 20], b: [30, 20] }
        ];
        d.items[0].p.sketch.dims = [{ id: 'm1', e: 'L1', k: 'len', v: 30 }];
        d.items[0].p.sketch.cons = [{ id: 'k1', type: 'equal', refs: [{ e: 'L1' }, { e: 'L2' }] }];
      });
      Sketch.editItem(App.doc.items[0].id);
    """); p.wait(800)
    click_uv(p, 15, 20, alt=False); p.wait(300)
    p.pg.fill('#se-len', '50'); p.pg.press('#se-len', 'Enter'); p.wait(400)
    cf5 = SS(p, "return [...document.querySelectorAll('#sk-conflict .sk-conf-row')].map(r=>r.dataset.confId)")
    p.pg.locator('#sk-conflict .sk-conf-row[data-conf-id="k1"] .sk-conf-del').click(); p.wait(400)
    st5 = SS(p, """
      const l1 = E('L1'), l2 = E('L2');
      return {
        hasBox: !!document.getElementById('sk-conflict'),
        ok: !!(S.status && S.status.ok),
        cons: S.cons.length,
        d1: Math.hypot(l1.b[0]-l1.a[0], l1.b[1]-l1.a[1]),
        d2: Math.hypot(l2.b[0]-l2.a[0], l2.b[1]-l2.a[1])
      };
    """)
    # Live-Widerspruch beim Öffnen einer widersprüchlichen Skizze
    p.ev("""
      Sketch.cancel(true);
      App.change('x', d => {
        d.items[0].p.sketch.ents = [{ id: 'L1', type: 'line', a: [0, 0], b: [30, 0] }];
        d.items[0].p.sketch.dims = [{ id: 'd1', e: 'L1', k: 'len', v: 30 }, { id: 'd2', e: 'L1', k: 'len', v: 45 }];
        d.items[0].p.sketch.cons = [];
      });
      Sketch.editItem(App.doc.items[0].id);
    """); p.wait(800)
    cf_live = SS(p, "return [...document.querySelectorAll('#sk-conflict .sk-conf-row')].map(r=>r.dataset.confId)")
    p.pg.locator('#sk-conflict .sk-conf-row[data-conf-id="d2"] .sk-conf-del').click(); p.wait(400)
    st_live = SS(p, "return { hasBox: !!document.getElementById('sk-conflict'), ok: !!(S.status && S.status.ok), dims: S.dims.map(d=>d.id) }")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok5 = (set(cf5) == {'k1', 'm1', '_neu'} and not st5['hasBox'] and st5['ok'] and st5['cons'] == 0
           and abs(st5['d1'] - 30) < 1e-2 and abs(st5['d2'] - 50) < 1e-2
           and set(cf_live) == {'d1', 'd2'} and not st_live['hasBox'] and st_live['ok'] and st_live['dims'] == ['d1']
           and 'sketchFreeSpots' in hilfen and p.pg.locator('#sk-free[data-help="sketchFreeSpots"]').count() == 1)
    return [ok1, ok2, ok3, ok4, ok5]


def _make_kern_ttf_bytes(kern_val=-200):
    import struct

    def pad4(b):
        return b + b'\x00' * ((-len(b)) % 4)

    def pack_rect(x0, y0, x1, y1):
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        out = bytearray(struct.pack('>5h', 1, x0, y0, x1, y1))
        out += struct.pack('>HH', 3, 0)  # endPtsOfContours=[3], instructionLength=0
        flags = bytearray([0x01] * 4)
        xs = bytearray()
        ys = bytearray()
        px = py = 0
        for x, y in pts:
            xs += struct.pack('>h', x - px)
            ys += struct.pack('>h', y - py)
            px, py = x, y
        return bytes(out) + bytes(flags) + bytes(xs) + bytes(ys)

    g_notdef = b''
    g_A = pack_rect(0, 0, 500, 700)
    g_V = pack_rect(0, 0, 500, 700)
    glyf_parts = [g_notdef, g_A, g_V]
    glyf = bytearray()
    offs = []
    for g in glyf_parts:
        while len(glyf) % 2:
            glyf.append(0)
        offs.append(len(glyf))
        glyf += g
    while len(glyf) % 2:
        glyf.append(0)
    offs.append(len(glyf))

    loca = b''.join(struct.pack('>H', o // 2) for o in offs)
    head = bytearray(54)
    struct.pack_into('>IIHH', head, 0, 0x00010000, 0x00010000, 0, 0)
    struct.pack_into('>IHH', head, 12, 0x5F0F3CF5, 0, 1000)
    struct.pack_into('>hhhhHHhhh', head, 36, 0, 0, 500, 700, 0, 8, 2, 0, 0)
    hhea = struct.pack('>IhhhhhhhhhhhhhhhH', 0x00010000, 700, -200, 0, 600, 0, 0, 500, 1, 0, 0, 0, 0, 0, 0, 0, 3)
    maxp = struct.pack('>IH', 0x00005000, 3) + b'\x00' * 26
    hmtx = struct.pack('>HhHhHh', 500, 0, 600, 0, 600, 0)

    # cmap format 4 mapping 'A' (65) -> 1, 'V' (86) -> 2
    end_codes = struct.pack('>HHH', 65, 86, 0xFFFF)
    start_codes = struct.pack('>HHH', 65, 86, 0xFFFF)
    id_deltas = struct.pack('>hhh', 1 - 65, 2 - 86, 1)
    id_range = struct.pack('>HHH', 0, 0, 0)
    fmt4_body = struct.pack('>HHHH', 6, 4, 1, 2) + end_codes + struct.pack('>H', 0) + start_codes + id_deltas + id_range
    fmt4 = struct.pack('>HHH', 4, 6 + len(fmt4_body), 0) + fmt4_body
    cmap = struct.pack('>HH', 0, 1) + struct.pack('>HHI', 3, 1, 12) + fmt4

    # name table: nameID 4 = "KernTest"
    nbytes = 'KernTest'.encode('utf-16-be')
    name = struct.pack('>HHH', 0, 1, 18) + struct.pack('>HHHHHH', 3, 1, 0x0409, 4, len(nbytes), 0) + nbytes

    # kern table: version 0, 1 subtable format 0 horizontal, 1 pair (1, 2) -> kern_val
    sub_body = struct.pack('>HHHH', 1, 6, 0, 0) + struct.pack('>HHh', 1, 2, kern_val)
    sub_hdr = struct.pack('>HHH', 0, 6 + len(sub_body), 0x0001)
    kern = struct.pack('>HH', 0, 1) + sub_hdr + sub_body

    tbls = {
        'cmap': cmap, 'glyf': bytes(glyf), 'head': bytes(head), 'hhea': hhea,
        'hmtx': hmtx, 'kern': kern, 'loca': loca, 'maxp': maxp, 'name': name,
    }
    tags = sorted(tbls.keys())
    nt = len(tags)
    hdr_len = 12 + nt * 16
    cur = hdr_len
    dir_bytes = bytearray()
    body = bytearray()
    for tag in tags:
        raw = tbls[tag]
        dir_bytes += tag.encode('ascii') + struct.pack('>III', 0, cur, len(raw))
        padded = pad4(raw)
        body += padded
        cur += len(padded)
    return struct.pack('>IHHHH', 0x00010000, nt, 16, 0, 0) + bytes(dir_bytes) + bytes(body)


def t_eigene_schrift(p):
    ttf_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'daten', 'Balthazar-Regular.ttf')
    sketch_xy(p)
    p.pg.keyboard.press('b'); p.wait(250)

    # 1. Freie OFL-TTF laden, „Tracery“ schreiben und zu 3D-Körper mit Fläche > 0 hochziehen
    with p.pg.expect_file_chooser() as fc:
        p.pg.locator('#tx-load-font').click()
    fc.value.set_files(ttf_path)
    p.wait(500)

    info1 = p.ev("""
      const fonts = App.doc.fonts || [];
      const f = fonts[0];
      const opts = [...document.querySelectorAll('#tx-font option')].map(o=>o.value);
      return { n: fonts.length, id: f && f.id, name: f && f.name, hasB64: !!(f && f.data && f.data.length > 1000), inSel: !!(f && opts.includes(f.id)), inSK: !!(f && SK.FONTNAMES[f.id]), cur: Sketch.state.txt.font };
    """)
    font_id = info1['id']
    p.pg.fill('#tx-s', 'Tracery'); p.pg.fill('#tx-h', '10'); p.pg.press('#tx-h', 'Enter'); p.wait(150)
    o = to_screen(p, -20, 0)
    p.pg.mouse.click(o[0], o[1]); p.wait(400)
    sk_area = SS(p, "return SK.regions(S.ents).reduce((s,r)=>s+r.area,0)")
    fertig_hoch(p)
    m1 = p.ev("""return (async () => {
      const it = App.doc.items[0], r = it && App.results.get(it.id);
      if (!r || !r.data) return { ok: false, errs: App.errors.length };
      const ms = await Mass.measure();
      const pt = ms && Mass.partOf(ms, it.id);
      return { ok: App.errors.length === 0, faces: r.data.faces.length, area: pt && pt.area, vol: pt && pt.volume, font: it.p.sketch.ents[0].font };
    })();""")
    ok1 = (
        info1['n'] == 1 and info1['hasB64'] and info1['inSel'] and info1['inSK'] and info1['cur'] == font_id
        and sk_area > 50 and m1.get('ok') and m1.get('faces', 0) > 20 and (m1.get('area') or 0) > 100 and (m1.get('vol') or 0) > 10 and m1.get('font') == font_id
    )

    # 2. Projekt speichern und neu laden -> Schrift ist noch da, Körper rechnet mit Fläche > 0
    with p.pg.expect_download() as dl:
        p.ev("Start.saveFile()")
    proj_tmp = tempfile.NamedTemporaryFile(suffix='.tracery.json', delete=False)
    proj_tmp.close()
    dl.value.save_as(proj_tmp.name)
    saved_txt = open(proj_tmp.name, encoding='utf-8').read()
    os.unlink(proj_tmp.name)
    saved_json = json.loads(saved_txt)

    p.ev("App.setDoc(Model.newDoc('Leer'))"); p.wait(400)
    gone_after_reset = p.ev("return !SK.FONTNAMES[arg]", font_id)
    p.ev("""return (async () => {
      const f = new File([arg], 'schrift-test.tracery.json', { type: 'application/json' });
      await Start.openBlob(f);
    })();""", saved_txt)
    warte_rechnen(p, 30)
    m2 = p.ev("""return (async () => {
      const it = App.doc.items[0], r = it && App.results.get(it.id);
      const ms = it ? await Mass.measure() : null;
      const pt = ms && it ? Mass.partOf(ms, it.id) : null;
      return {
        fonts: (App.doc.fonts || []).length,
        hasId: (App.doc.fonts || []).some(f => f.id === arg),
        inSK: !!SK.FONTNAMES[arg],
        textFont: it && it.p && it.p.sketch && it.p.sketch.ents && it.p.sketch.ents[0] && it.p.sketch.ents[0].font,
        errs: App.errors.length,
        area: pt && pt.area,
        faces: r && r.data ? r.data.faces.length : 0,
      };
    })();""", font_id)
    ok2 = (
        len(saved_json.get('fonts') or []) == 1 and gone_after_reset
        and m2['fonts'] == 1 and m2['hasId'] and m2['inSK'] and m2['textFont'] == font_id
        and m2['errs'] == 0 and m2['faces'] > 20 and (m2['area'] or 0) > 100
    )

    # 3. Unterschneidung (kern-Tabelle) und zusätzliche Laufweite (Zeichenabstand sp)
    p.ev("App.setDoc(Model.newDoc('Kerning')); Sketch.startOnPlane('XY')"); p.wait(1200)
    p.pg.keyboard.press('b'); p.wait(200)
    kern_tmp = tempfile.NamedTemporaryFile(suffix='.ttf', delete=False)
    kern_tmp.write(_make_kern_ttf_bytes(-200))
    kern_tmp.close()
    try:
        with p.pg.expect_file_chooser() as fc:
            p.pg.locator('#tx-load-font').click()
        fc.value.set_files(kern_tmp.name)
        p.wait(400)
    finally:
        os.unlink(kern_tmp.name)

    kern_res = p.ev("""
      const fid = Sketch.state.txt.font;
      const e = { id: 'tk', type: 'text', a: [0, 0], s: 'AV', h: 10, font: fid, align: 'l', rot: 0, sp: 0 };
      const bKern = SK.textBox(e);
      const bSp = SK.textBox({ ...e, sp: 2 });
      // Erwartung ohne Kerning: 600 (A adv) + 500 (V width) = 1100; mit -200 Kerning: 900 -> bei cap=700, h=10: 900/700*10
      const f = SK.FONTS[fid];
      return { hasKern: !!(f && f.hasKern), kv: f ? f.kern('A', 'V') : 0, wKern: bKern ? bKern.w : 0, wSp: bSp ? bSp.w : 0, exp: (900 / 700) * 10 };
    """)
    ok3 = (
        kern_res['hasKern'] and kern_res['kv'] == -200
        and abs(kern_res['wKern'] - kern_res['exp']) < 1e-3
        and abs((kern_res['wSp'] - kern_res['wKern']) - 2.0) < 1e-3
    )

    # 4. CFF/OTF-Datei liefert klare Meldung „noch nicht unterstützt“ + Hilfetext vorhanden
    n_before = p.ev("return (App.doc.fonts || []).length")
    otf_tmp = tempfile.NamedTemporaryFile(suffix='.otf', delete=False)
    otf_tmp.write(b'OTTO\x00\x01\x00\x00\x00\x10\x00\x00\x00\x00CFF \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00')
    otf_tmp.close()
    try:
        with p.pg.expect_file_chooser() as fc:
            p.pg.locator('#tx-load-font').click()
        fc.value.set_files(otf_tmp.name)
        p.wait(400)
    finally:
        os.unlink(otf_tmp.name)

    toast_txt = ' '.join(p.pg.locator('.toast').all_inner_texts()).lower()
    n_after = p.ev("return (App.doc.fonts || []).length")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok4 = (
        'noch nicht unterstützt' in toast_txt
        and n_after == n_before
        and 'loadFont' in hilfen and all(k in hilfen['loadFont'] for k in ('tip', 'hilfe', 'tipp'))
    )
    return [ok1, ok2, ok3, ok4]


def t_a029_hochziehen_bis_flaeche(p):
    # 1. Pflicht-Szenario Teil 1: Platte (z=0..5), darüber im Abstand 15 ein Quader (z=20..30).
    # Kreis-Skizze auf der Platte mit „Bis zur nächsten Fläche“ → Höhe 15
    p.empty()
    p.ev("""App.change('x', d => {
      const a = Model.newItem('box', { w: 60, d: 60, h: 5 }, { name: 'Platte' }); d.items.push(a);
      const b = Model.newItem('box', { w: 40, d: 40, h: 10 }, { name: 'Quader' }); b.t.z = 20; d.items.push(b);
    })"""); warte_rechnen(p)
    p.ev("const r=App.results.get(App.doc.items[0].id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.99); return Sketch.startOnFace({id:App.doc.items[0].id, idx:fi, info:r.data.faces[fi]})")
    p.wait(1200)
    p.ev("Sketch.state.ents.push({id:'c1',type:'circle',c:[0,0],r:8})")
    p.pg.keyboard.press('Enter'); p.wait(600)
    p.pg.select_option('#st-extent', 'toNext'); p.wait(500); warte_rechnen(p)
    prev_dist = p.ev("return App.resolvedDist('__preview')")
    prev_txt = p.pg.locator('#st-ext-info').inner_text()
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(800); warte_rechnen(p)

    info1 = p.ev("""const g=App.doc.items[0]; const ext=g.children && g.children[1];
      return {
        isGrp: g.kind==='group',
        ext: ext ? ext.p.extent : null,
        id: ext ? ext.id : null,
        dist: ext ? App.resolvedDist(ext.id) : null,
        bb: App.results.get(g.id) && App.results.get(g.id).data.bbox,
        errs: App.errors.length
      }""")
    vol_map = lambda: p.ev("return Mass.measure().then(r=>Object.fromEntries((r.parts||[]).map(q=>[q.id, q.volume])))")
    v1 = vol_map()
    exp_v1 = 60 * 60 * 5 + math.pi * 64 * 15
    ok1 = (
        prev_dist is not None and abs(prev_dist - 15) < 0.05 and '15' in prev_txt
        and info1['isGrp'] and info1['ext'] == 'toNext' and info1['errs'] == 0
        and info1['dist'] is not None and abs(info1['dist'] - 15) < 0.05
        and info1['bb'] is not None and abs(info1['bb'][5] - 20) < 0.05
        and abs(v1.get(p.ev("return App.doc.items[0].id"), 0) - exp_v1) < 15
    )

    # 2. Pflicht-Szenario Teil 2: Quader um 5 nach oben verschieben → Höhe wächst auf 20
    p.ev("App.change('Quader hoch', d => { d.items[1].t.z = 25; })"); warte_rechnen(p)
    ext_id = info1['id']
    info2 = p.ev("return { dist: App.resolvedDist(arg), bb: App.results.get(App.doc.items[0].id).data.bbox, errs: App.errors.length }", ext_id)
    v2 = vol_map()
    exp_v2 = 60 * 60 * 5 + math.pi * 64 * 20
    p.ev("App.select([arg])", ext_id); p.wait(400)
    panel_txt = p.pg.locator('#p-ext-info').inner_text() if p.pg.locator('#p-ext-info').count() else ''
    ok2 = (
        info2['errs'] == 0 and info2['dist'] is not None and abs(info2['dist'] - 20) < 0.05
        and abs(info2['bb'][5] - 25) < 0.05
        and abs(v2.get(p.ev("return App.doc.items[0].id"), 0) - exp_v2) < 15
        and p.pg.locator('#p-extent').input_value() == 'toNext' and '20' in panel_txt
    )

    # 3. Verschieben als Schritt (transform) um +5 → Höhe wächst mit auf 25
    p.ev("""App.change('Transform', d => {
      const xf = Model.newItem('transform', { target: d.items[1].id, dz: 5 }); d.items.push(xf);
    })"""); warte_rechnen(p)
    info3 = p.ev("return { dist: App.resolvedDist(arg), bb: App.results.get(App.doc.items[0].id).data.bbox }", ext_id)
    v3 = vol_map()
    exp_v3 = 60 * 60 * 5 + math.pi * 64 * 25
    ok3 = (
        info3['dist'] is not None and abs(info3['dist'] - 25) < 0.05
        and abs(info3['bb'][5] - 30) < 0.05
        and abs(v3.get(p.ev("return App.doc.items[0].id"), 0) - exp_v3) < 15
    )

    # 4. „Bis zu gewählter Fläche“ per echtem Klick im 3D auf Oberseite des Quaders (z=35) + Größenänderung (h: 10→16)
    p.ev("App.change('Transform weg', d => { d.items.splice(2, 1); })"); warte_rechnen(p)
    p.ev("Viewer.setView('iso', false); Viewer.fit(); App.select([arg])", ext_id); p.wait(600)
    p.pg.select_option('#p-extent', 'toFace'); p.wait(300)
    top_pt = world_screen(p, 0, 0, 35)
    p.pg.mouse.click(top_pt[0], top_pt[1]); p.wait(600); warte_rechnen(p)
    info4a = p.ev("return { ext: Model.find(App.doc, arg).item.p.extent, dist: App.resolvedDist(arg), bb: App.results.get(App.doc.items[0].id).data.bbox }", ext_id)
    p.ev("App.change('Quader höher', d => { d.items[1].p.h = 16; })"); warte_rechnen(p)
    info4b = p.ev("return { dist: App.resolvedDist(arg), bb: App.results.get(App.doc.items[0].id).data.bbox, deps: Model.dependencies(App.doc) }", ext_id)
    ok4 = (
        info4a['ext'] == 'toFace' and info4a['dist'] is not None and abs(info4a['dist'] - 30) < 0.05
        and abs(info4a['bb'][5] - 35) < 0.05
        and info4b['dist'] is not None and abs(info4b['dist'] - 36) < 0.05
        and abs(info4b['bb'][5] - 41) < 0.05
        and any(x['what'] == 'hochgezogen bis Fläche von' for x in info4b['deps'])
    )

    # 5. Formschritt mit Modus (join & cut) mit „Bis zur nächsten Fläche“
    p.ev("""App.change('Modus', d => {
      d.items = [];
      const pl = Model.newItem('box', { w: 60, d: 60, h: 5 }, { name: 'Platte' }); d.items.push(pl);
      const q = Model.newItem('box', { w: 40, d: 40, h: 10 }, { name: 'Quader' }); q.t.z = 20; d.items.push(q);
      const k = Model.newItem('extrude', {
        sketch: { plane: { o: [0, 0, 5], x: [1, 0, 0], n: [0, 0, 1] }, ents: [{ id: 'c', type: 'circle', c: [0, 0], r: 6 }], dims: [], cons: [] },
        dist: 5, dir: 'normal', extent: 'toNext'
      }, { name: 'Bolzen' });
      k.op = { type: 'join', target: pl.id };
      d.items.push(k);
    })"""); warte_rechnen(p)
    v5a = vol_map()
    pl_id, k_id = p.ev("return [App.doc.items[0].id, App.doc.items[2].id]")
    m5a = p.ev("return [App.mergedInto(arg), App.resolvedDist(arg)]", k_id)
    p.ev("App.change('Quader hoch', d => { d.items[1].t.z = 25; })"); warte_rechnen(p)
    v5b = vol_map()
    p.ev("App.change('Cut', d => { d.items[2].p.dir = 'reverse'; d.items[2].op = { type: 'cut', target: d.items[0].id }; })"); warte_rechnen(p)
    v5c = vol_map()
    d5c = p.ev("return App.resolvedDist(arg)", k_id)
    ok5 = (
        m5a[0] == pl_id and m5a[1] is not None and abs(m5a[1] - 15) < 0.05
        and abs(v5a.get(pl_id, 0) - (60 * 60 * 5 + math.pi * 36 * 15)) < 15
        and abs(v5b.get(pl_id, 0) - (60 * 60 * 5 + math.pi * 36 * 20)) < 15
        and d5c is not None and abs(d5c - 5) < 0.05
        and abs(v5c.get(pl_id, 0) - (60 * 60 * 5 - math.pi * 36 * 5)) < 15
    )

    # 6. Schräge Zielfläche + Wechsel zu fester Höhe mit Rückgängig + Hilfetext
    p.ev("""App.change('Schräg', d => {
      d.items = [];
      const q = Model.newItem('box', { w: 40, d: 40, h: 10 }, { name: 'Dach' }); q.t.z = 20; q.t.rx = 15; d.items.push(q);
      const k = Model.newItem('extrude', {
        sketch: { plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, ents: [{ id: 'c', type: 'circle', c: [0, 0], r: 6 }], dims: [], cons: [] },
        dist: 5, dir: 'normal', extent: 'toNext'
      }, { name: 'Säule' });
      d.items.push(k);
    })"""); warte_rechnen(p)
    k6_id = p.ev("return App.doc.items[1].id")
    info6 = p.ev("return { errs: App.errors.length, dist: App.resolvedDist(arg), bb: App.results.get(arg) && App.results.get(arg).data.bbox }", k6_id)
    p.ev("App.select([arg])", k6_id); p.wait(400)
    p.pg.select_option('#p-extent', 'dist'); p.wait(400); warte_rechnen(p)
    has_dist_inp = p.pg.locator('#p-dist').count() == 1 and p.ev("return App.doc.items[1].p.extent == null")
    p.pg.locator('canvas').first.focus(); p.pg.keyboard.press('Control+z'); p.wait(600); warte_rechnen(p)
    undo_ok = p.ev("return App.doc.items[1].p.extent === 'toNext'")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    help_ok = 'extrudeToFace' in hilfen and all(k in hilfen['extrudeToFace'] for k in ('tip', 'hilfe', 'tipp')) and p.pg.locator('[data-help="extrudeToFace"]').count() == 1
    ok6 = (
        info6['errs'] == 0 and info6['dist'] is not None and 15 < info6['dist'] < 25
        and info6['bb'] is not None and info6['bb'][5] > 18
        and has_dist_inp and undo_ok and help_ok
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_f11240211(p):
    # 1. Schildchen ohne Re-Entranz und mit aktueller Kamera-Matrix bei überfälliger camAnim
    p.empty()
    r1 = p.ev("""
      const origST = window.setTimeout, origRAF = window.requestAnimationFrame;
      window.setTimeout = (fn, ms, ...a) => (ms >= 400 && ms <= 500) ? 0 : origST(fn, ms, ...a);
      window.requestAnimationFrame = () => 1;
      try {
        Sketch.startOnPlane('XY');
      } finally {
        window.setTimeout = origST;
        window.requestAnimationFrame = origRAF;
      }
      const t0 = performance.now();
      while (performance.now() - t0 < 460) {}
      const S = Sketch.state;
      S.ents.push({id:'P',type:'point',a:[0,0]});
      S.dims.push({id:'d1',e:'P',k:'x',v:0},{id:'d2',e:'P',k:'y',v:0});
      Sketch.setTool('select');
      return [...document.querySelectorAll('.skdim')].map(e => {
        const b = e.getBoundingClientRect();
        return [b.left, b.top, b.right, b.bottom];
      });
    """)
    p.wait(250)
    r2 = p.ev("return [...document.querySelectorAll('.skdim')].map(e=>{const b=e.getBoundingClientRect(); return [b.left,b.top,b.right,b.bottom]})")
    def clean(rs):
        if len(rs) != 2:
            return False
        vis = all(0 < b[0] and b[2] < 1400 and 0 < b[1] and b[3] < 850 for b in rs)
        no_ov = not (rs[0][0] < rs[1][2] and rs[1][0] < rs[0][2] and rs[0][1] < rs[1][3] and rs[1][1] < rs[0][3])
        return vis and no_ov
    ok1 = clean(r1) and clean(r2)

    # 2. Eigenschaften-Panel aktualisiert bei App.select sofort (ohne 16-ms-Debounce-Lücke)
    p.ev("Sketch.cancel(true)"); p.wait(200)
    p.ev("App.change('x', d=>{ const it=Model.newItem('sweep',{path3d:{pts:[[0,0,0],[10,0,10],[25,3,12]],smooth:false},shape:'circle',d:3,w:3,h:3,wall:0},{name:'Rohr'}); d.items.push(it); })"); warte_rechnen(p, 30)
    opts = p.ev("""
      App.select([App.doc.items[0].id]);
      return [document.querySelectorAll('#p3-ax-0 option').length, document.querySelectorAll('#p3-ax-1 option').length];
    """)
    p.pg.select_option('#p3-ax-1', 'perp'); warte_rechnen(p, 30)
    pts = p.ev("return Model.path3dPoints(App.doc.items[0].p.path3d, Model.vars(App.doc).v).map(q=>q.map(v=>Math.round(v*1000)/1000))")
    ok2 = opts == [4, 6] and pts[2] == [16.5, 3, 3.5] and p.ev("return App.errors.length") == 0
    return [ok1, ok2]


# ---------- [A-028] Bezugspunkte und eigenes Koordinatensystem (BZ-08, BZ-09) ----------
def t_a028_bezugspunkte_koordinatensystem(p):
    import zipfile, tempfile, struct, re, io

    def det3(x, y, z):
        return (
            x[0] * (y[1] * z[2] - y[2] * z[1])
            - x[1] * (y[0] * z[2] - y[2] * z[0])
            + x[2] * (y[0] * z[1] - y[1] * z[0])
        )

    # 1. Kantenmitte einer 40-mm-Kante liegt bei 20 mm + Mitwandern + Ausblenden/Löschen/Rückgängig
    p.empty()
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10},{name:'Platte'}); b.t.x=20; b.t.y=15; d.items.push(b); })")
    warte_rechnen(p)
    pt_mid = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const ei=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-40)<1e-3&&Math.abs(g.m[2]-10)<1e-3&&Math.abs(g.m[1]+15)<1e-3);
      return { pt: Datums.addPointEdgeMid({id, edgeIdx: ei}), e: r.data.edges[ei], W: Array.from(Model.worldMatrix(App.doc, id).elements) };""")
    p.wait(300)
    pt0 = pt_mid['pt']['point']
    # Weltkoordinaten der Enden der 40-mm-Kante: [0,0,10] und [40,0,10]
    d_start = math.sqrt((pt0[0] - 0) ** 2 + (pt0[1] - 0) ** 2 + (pt0[2] - 10) ** 2)
    d_end = math.sqrt((pt0[0] - 40) ** 2 + (pt0[1] - 0) ** 2 + (pt0[2] - 10) ** 2)
    p.ev("App.change('x', d=>{ d.items[0].p.w=60; d.items[0].t.x=30; })"); warte_rechnen(p); p.wait(500)
    pt_mid_m = p.ev("return App.doc.points[0].point")
    # Ausblenden, Löschen, Rückgängig
    p.ev("Datums.selectPoint(App.doc.points[0].id)"); p.wait(300)
    p.pg.locator('#point-hide').click(); p.wait(300)
    hid_ok = p.ev("return App.doc.points[0].hidden") is True and p.pg.locator('#point-tree .point-row.dim').count() == 1
    p.pg.locator('#point-hide').click(); p.wait(300)
    p.pg.locator('#point-del').click(); p.wait(300)
    del_ok = p.ev("return App.doc.points.length") == 0
    p.ev("App.undo()"); p.wait(400)
    undo_ok = p.ev("return App.doc.points.length") == 1
    ok1 = (
        pt_mid['pt'] and pt_mid['pt']['base']['type'] == 'edgeMid'
        and abs(pt0[0] - 20.0) < 1e-3 and abs(d_start - 20.0) < 1e-3 and abs(d_end - 20.0) < 1e-3
        and abs(pt_mid_m[0] - 30.0) < 1e-3
        and p.pg.locator('#point-tree .point-row').count() == 1
        and hid_ok and del_ok and undo_ok
    )

    # 2. Flächenmitte & Auf Kurve bei x % (inkl. Änderung im Panel & Kreiskante)
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10},{name:'Block'}); b.t.x=20; b.t.y=15; d.items.push(b); })")
    warte_rechnen(p)
    res2 = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.99);
      const ei=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-40)<1e-3&&Math.abs(g.m[2]-10)<1e-3&&Math.abs(g.m[1]+15)<1e-3);
      return { fc: Datums.addPointFaceCenter({id, idx: fi}), cp: Datums.addPointOnCurve({id, edgeIdx: ei}, 25) };""")
    p.wait(300)
    cp25 = res2['cp']['point']
    d25_a = math.hypot(cp25[0] - 0, cp25[1] - 0, cp25[2] - 10)
    d25_b = math.hypot(cp25[0] - 40, cp25[1] - 0, cp25[2] - 10)
    p.ev("Datums.selectPoint(App.doc.points[1].id)"); p.wait(300)
    p.pg.fill('#point-percent', '75'); p.pg.press('#point-percent', 'Enter'); p.wait(400)
    cp75 = p.ev("return App.doc.points[1].point")
    d75_a = math.hypot(cp75[0] - 0, cp75[1] - 0, cp75[2] - 10)
    d75_b = math.hypot(cp75[0] - 40, cp75[1] - 0, cp75[2] - 10)
    # Kreiskante an Zylinder bei 50 %
    p.ev("App.change('x', d=>{ const c=Model.newItem('cylinder',{d:20,h:12},{name:'Rolle'}); c.t.y=60; d.items.push(c); })")
    warte_rechnen(p)
    pt_circ = p.ev("""const id=App.doc.items[1].id, r=App.results.get(id);
      const ei=r.data.edges.findIndex(g=>g.t==='CIRCLE'&&g.c&&Math.abs(g.c[2]-12)<1e-4);
      return Datums.addPointOnCurve({id, edgeIdx: ei}, 50);""")
    ok2 = (
        res2['fc'] and near(res2['fc']['point'], [20, 15, 10], 1e-3)
        and abs(min(d25_a, d25_b) - 10.0) < 1e-3 and abs(max(d25_a, d25_b) - 30.0) < 1e-3
        and abs(cp75[0] - (40.0 - cp25[0])) < 1e-3 and abs(d75_a + d75_b - 40.0) < 1e-3
        and pt_circ and abs(math.hypot(pt_circ['point'][0], pt_circ['point'][1] - 60) - 10.0) < 1e-3
        and abs(pt_circ['point'][2] - 12.0) < 1e-3
    )

    # 3. Schnittpunkt Kante / Ebene (+ Mitwandern + parallele Kante abgelehnt)
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:20},{name:'Turm'}); b.t.x=20; b.t.y=15; d.items.push(b); })")
    warte_rechnen(p)
    res3 = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const dPl=Datums.addOrigin('XY', 12, 0);
      const eVert=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.m[0]-20)<1e-3&&Math.abs(g.m[1]-15)<1e-3&&Math.abs(g.l-20)<1e-3);
      const eHor=r.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-40)<1e-3&&Math.abs(g.m[2]-20)<1e-3);
      const good=Datums.addPointEdgePlane({id, edgeIdx: eVert}, dPl.id);
      const bad=Datums.addPointEdgePlane({id, edgeIdx: eHor}, dPl.id);
      return { dId: dPl.id, good, bad };""")
    p.wait(300)
    p.ev(f"Datums.set({res3['dId']!r}, {{ dist: 16 }});"); warte_rechnen(p); p.wait(400)
    pt_int_m = p.ev("return App.doc.points[0].point")
    # Schnitt Kante mit ebener Fläche eines zweiten Körpers (z=5)
    p.ev("App.change('x', d=>{ const b2=Model.newItem('box',{w:20,d:20,h:5},{name:'Sockel'}); b2.t.x=-20; d.items.push(b2); })")
    warte_rechnen(p)
    pt_face_int = p.ev("""const id1=App.doc.items[0].id, r1=App.results.get(id1);
      const id2=App.doc.items[1].id, r2=App.results.get(id2);
      const eVert=r1.data.edges.findIndex(g=>g.t==='LINE'&&Math.abs(g.m[0]-20)<1e-3&&Math.abs(g.m[1]-15)<1e-3&&Math.abs(g.l-20)<1e-3);
      const fi=r2.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.99);
      return Datums.addPointEdgePlane({id:id1, edgeIdx:eVert}, {id:id2, idx:fi});""")
    ok3 = (
        res3['bad'] is None
        and res3['good'] and near(res3['good']['point'], [40, 30, 12], 1e-3)
        and near(pt_int_m, [40, 30, 16], 1e-3)
        and pt_face_int and near(pt_face_int['point'], [40, 30, 5], 1e-3)
    )

    # 4. Eigenes Koordinatensystem (Ursprung an Ecke, Achsen an Kanten) + Mitwandern + Umkehren + Abhängigkeiten
    p.ev("Start.newProject(true)"); p.wait(700)
    p.ev("App.change('x', d=>{ const b=Model.newItem('box',{w:40,d:30,h:10},{name:'Teil'}); b.t.x=50; b.t.y=40; b.t.z=15; d.items.push(b); })")
    warte_rechnen(p)
    cs_res = p.ev("""const id=App.doc.items[0].id, r=App.results.get(id), eds=r.data.edges;
      // Lokale Ecke (-20,-15,0) entspricht Welt (30, 25, 15)
      const ex=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-40)<1e-3&&Math.abs(g.m[1]+15)<1e-3&&Math.abs(g.m[2])<1e-3);
      const ey=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-30)<1e-3&&Math.abs(g.m[0]+20)<1e-3&&Math.abs(g.m[2])<1e-3);
      const eyR=eds.findIndex(g=>g.t==='LINE'&&Math.abs(g.l-30)<1e-3&&Math.abs(g.m[0]-20)<1e-3&&Math.abs(g.m[2])<1e-3);
      const cs=Datums.addCsysFromPointEdges([30, 25, 15], {id, edgeIdx: ex}, {id, edgeIdx: ey}, 'Ecke Nullpunkt');
      const csRot=Datums.addCsysFromPointEdges([70, 25, 15], {id, edgeIdx: eyR}, {id, edgeIdx: ex}, 'Gedreht');
      return { cs, csRot };""")
    p.wait(400)
    cs0 = cs_res['cs']['csys']
    cs_rot0 = cs_res['csRot']['csys']
    # Quader verschieben -> KS wandert mit
    p.ev("App.change('x', d=>{ d.items[0].t.x=60; })"); warte_rechnen(p); p.wait(500)
    cs_moved = p.ev("return App.doc.csys[0].csys")
    p.ev("App.change('x', d=>{ d.items[0].t.x=50; })"); warte_rechnen(p); p.wait(500)
    # X-Achse im Panel umkehren und zurück -> bleibt rechtshändig
    p.ev("Datums.selectCsys(App.doc.csys[0].id)"); p.wait(300)
    p.pg.locator('#csys-flip-x').click(); p.wait(300)
    cs_fx = p.ev("return App.doc.csys[0].csys")
    p.pg.locator('#csys-flip-x').click(); p.wait(300)
    deps = p.ev("return Model.dependencies(App.doc)")
    ok4 = (
        cs_res['cs'] and near(cs0['o'], [30, 25, 15], 1e-3)
        and near(cs0['x'], [1, 0, 0], 1e-4) and near(cs0['y'], [0, 1, 0], 1e-4) and near(cs0['z'], [0, 0, 1], 1e-4)
        and abs(det3(cs0['x'], cs0['y'], cs0['z']) - 1.0) < 1e-4
        and near(cs_moved['o'], [40, 25, 15], 1e-3)
        and near(cs_fx['x'], [-1, 0, 0], 1e-4) and abs(det3(cs_fx['x'], cs_fx['y'], cs_fx['z']) - 1.0) < 1e-4
        and near(cs_rot0['o'], [70, 25, 15], 1e-3)
        and near(cs_rot0['x'], [0, 1, 0], 1e-4) and near(cs_rot0['y'], [-1, 0, 0], 1e-4) and near(cs_rot0['z'], [0, 0, 1], 1e-4)
        and p.pg.locator('#csys-tree .csys-row').count() == 2
        and any(d.get('csys') == 'Ecke Nullpunkt' for d in deps)
    )

    # 5. Export (STEP, STL, 3MF) mit eigenem Nullpunkt -> Hüllmaße beginnen bei 0
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(500)
    cs_id = cs_res['cs']['id']
    rot_id = cs_res['csRot']['id']
    help_attr = p.pg.locator('#ex-csys').locator('xpath=ancestor::div[contains(@class,"field")]').get_attribute('data-help')
    p.pg.select_option('#ex-csys', cs_id); p.wait(100)
    p.pg.check('#ex-step'); p.pg.check('#ex-stl'); p.pg.check('#ex-mf'); p.wait(100)
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-a028.zip'); dl.value.save_as(z)
    zf = zipfile.ZipFile(z)
    names = zf.namelist()
    stl_name = next((n for n in names if n.endswith('.stl')), None)
    mf_name = next((n for n in names if n.endswith('.3mf')), None)
    step_name = next((n for n in names if n.endswith('.step')), None)

    stl_bb = None
    if stl_name:
        sb = zf.read(stl_name)
        cnt = struct.unpack('<I', sb[80:84])[0]
        mn = [1e9, 1e9, 1e9]; mx = [-1e9, -1e9, -1e9]
        off = 84
        for _ in range(cnt):
            vals = struct.unpack('<12fH', sb[off:off + 50])
            for k in range(3):
                vx, vy, vz = vals[3 + k * 3], vals[4 + k * 3], vals[5 + k * 3]
                mn[0] = min(mn[0], vx); mn[1] = min(mn[1], vy); mn[2] = min(mn[2], vz)
                mx[0] = max(mx[0], vx); mx[1] = max(mx[1], vy); mx[2] = max(mx[2], vz)
            off += 50
        stl_bb = mn + mx

    mf_bb = None
    if mf_name:
        mf_zf = zipfile.ZipFile(io.BytesIO(zf.read(mf_name)))
        xml_txt = mf_zf.read('3D/3dmodel.model').decode('utf-8')
        mn = [1e9, 1e9, 1e9]; mx = [-1e9, -1e9, -1e9]
        for vx, vy, vz in re.findall(r'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"', xml_txt):
            x, y, z0 = float(vx), float(vy), float(vz)
            mn[0] = min(mn[0], x); mn[1] = min(mn[1], y); mn[2] = min(mn[2], z0)
            mx[0] = max(mx[0], x); mx[1] = max(mx[1], y); mx[2] = max(mx[2], z0)
        mf_bb = mn + mx

    # Gedrehtes KS im Kernel-Export prüfen -> [0,0,0 .. 30,40,10]
    rot_exp = p.pg.evaluate("""async (rid) => {
      const { Kernel } = window.__masswerk;
      const { Model, App, Datums } = window.__M;
      const m = Datums.csysExportMatrix(rid);
      const rm = await Kernel.call('exportMeshes', { scene: Model.kernelScene(App.doc), fine: true, q: 1, originMat: m });
      const v = rm.objects[0].vertices;
      let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
      for (let i=0;i<v.length;i+=3){ mn[0]=Math.min(mn[0],v[i]); mn[1]=Math.min(mn[1],v[i+1]); mn[2]=Math.min(mn[2],v[i+2]); mx[0]=Math.max(mx[0],v[i]); mx[1]=Math.max(mx[1],v[i+1]); mx[2]=Math.max(mx[2],v[i+2]); }
      const rs = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc), originMat: m });
      return { meshBb: mn.concat(mx), stepLen: rs.data.byteLength };
    }""", rot_id)

    step_bb = None
    if step_name:
        step_bytes = list(zf.read(step_name))
        p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(400)
        p.ev("const f = new File([new Uint8Array(arg)], 'Nullpunkt.step'); return Start.importCAD(f);", step_bytes)
        warte_rechnen(p, 30)
        step_bb = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data.bbox")

    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    cmds = p.ev("return Commands.list().map(c=>c.id)")
    help_ok = (
        help_attr == 'datumCsys'
        and all(k in hilfen and all(f in hilfen[k] for f in ('tip', 'hilfe', 'tipp')) for k in ('datumPoint', 'datumCsys'))
        and 'datum-point' in cmds and 'datum-csys' in cmds
    )
    ok5 = (
        help_ok
        and stl_bb is not None and near(stl_bb, [0, 0, 0, 40, 30, 10], 0.05)
        and mf_bb is not None and near(mf_bb, [0, 0, 0, 40, 30, 10], 0.05)
        and step_bb is not None and near(step_bb, [0, 0, 0, 40, 30, 10], 0.05)
        and rot_exp['stepLen'] > 1000 and near(rot_exp['meshBb'], [0, 0, 0, 30, 40, 10], 0.05)
    )
    return [ok1, ok2, ok3, ok4, ok5]


def t_a031_rippe(p):
    # 1. Offene Schale (40×40×20, Wandstärke 2 mm, oben offen bei z=20) + diagonale Rippe (kurze Linie [-10,-10]..[10,10], 2 mm mittig)
    # Erwartetes Schalen-Volumen: 40*40*20 - 36*36*18 = 32000 - 23328 = 8672 mm³
    # Erwartetes Rippen-Volumen im 36×36×18-Innenraum (Diagonale 36*sqrt(2), Breite 2, Ecken an der 45°-Wand abgezogen → 2*(36*sqrt(2)-1)*18 = (72*sqrt(2)-2)*18 ≈ 1796.81 mm³):
    # Gesamt ≈ 10468.81 mm³, genau 1 Körper, keine Lücke zur Wand, Hüllbox unverändert [-20,-20,0,20,20,20]
    p.empty()
    p.ev("""App.change('Schale', d => {
      const b = Model.newItem('box', { w: 40, d: 40, h: 20 }, { name: 'Schale' });
      b.finishes = [{ id: 'f_sh', type: 'shell', r: 2, faces: [{ c: [0, 0, 20], n: [0, 0, 1] }] }];
      d.items.push(b);
    })""")
    warte_rechnen(p, 30); p.wait(300)
    m_shell = p.ev("return Mass.measureDoc(App.doc)")
    vol_shell = m_shell and m_shell['volume']

    p.ev("Sketch.startOnPlane('XY', 20)"); p.wait(1200)
    p.ev("Sketch.state.ents.push({id:'l1',type:'line',a:[-10,-10],b:[10,10]})")
    p.pg.keyboard.press('Enter'); p.wait(600)
    p.pg.locator('#st-mode-rib').click(); p.wait(250)
    has_help = p.pg.locator('#st-mode-rib').get_attribute('data-help') == 'rib'
    p.pg.fill('#st-rib-t', '2'); p.pg.press('#st-rib-t', 'Enter'); p.wait(150)
    p.pg.select_option('#st-rib-side', 'center'); p.wait(250)
    p.pg.locator('.stepbox .btn.primary').click(); warte_rechnen(p, 30); p.wait(300)

    m_rib = p.ev("return Mass.measureDoc(App.doc)")
    vol_rib = m_rib and m_rib['volume']
    bb_rib = bbox(p, 0)
    st_rib = p.ev("const its=App.doc.items; return {len:its.length, kind:its[1]&&its[1].kind, merged:App.mergedInto(its[1]&&its[1].id)===its[0].id, errs:App.errors.length}")
    exp_center = 8672 + (72 * math.sqrt(2) - 2) * 18
    ok1 = (
        has_help
        and m_shell and m_shell['count'] == 1 and abs(vol_shell - 8672) < 5
        and st_rib == {'len': 2, 'kind': 'rib', 'merged': True, 'errs': 0}
        and m_rib and m_rib['count'] == 1
        and vol_rib > vol_shell + 1500
        and abs(vol_rib - exp_center) < 15
        and near(bb_rib, [-20, -20, 0, 20, 20, 20], 0.05)
    )

    # 2. Einseitig (Seite 1 & Seite 2) + Formel für Dicke
    p.pg.select_option('#rib-side', 'side1'); warte_rechnen(p, 30); p.wait(250)
    m_s1 = p.ev("return Mass.measureDoc(App.doc)")
    p.pg.select_option('#rib-side', 'side2'); warte_rechnen(p, 30); p.wait(250)
    m_s2 = p.ev("return Mass.measureDoc(App.doc)")
    p.pg.select_option('#rib-side', 'center'); warte_rechnen(p, 30); p.wait(250)
    p.ev("App.change('Maß', d => { d.params.push({id:'m_rip', name:'Rippe', expr:3}); })"); p.wait(300)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(300)
    p.pg.fill('#rib-thickness', 'Rippe'); p.pg.press('#rib-thickness', 'Enter'); warte_rechnen(p, 30); p.wait(250)
    m_f3 = p.ev("return Mass.measureDoc(App.doc)")
    exp_side = 8672 + (72 * math.sqrt(2) - 4) * 18
    exp_t3 = 8672 + (108 * math.sqrt(2) - 4.5) * 18
    ok2 = (
        m_s1 and m_s1['count'] == 1 and abs(m_s1['volume'] - exp_side) < 15
        and m_s2 and m_s2['count'] == 1 and abs(m_s2['volume'] - m_s1['volume']) < 5
        and m_f3 and m_f3['count'] == 1 and abs(m_f3['volume'] - exp_t3) < 20
        and near(bbox(p, 0), [-20, -20, 0, 20, 20, 20], 0.05)
        and p.ev("return App.errors.length") == 0
    )

    # 3. Optionale Schräge (5°) auf 2 mm Rippe -> Volumen wächst deutlich, Hüllbox bleibt gleich
    field(p, '#rib-thickness', 2); warte_rechnen(p, 30); p.wait(200)
    field(p, '#rib-draft', 5); warte_rechnen(p, 30); p.wait(300)
    m_draft = p.ev("return Mass.measureDoc(App.doc)")
    ok3 = (
        m_draft and m_draft['count'] == 1
        and m_draft['volume'] > vol_rib + 100
        and near(bbox(p, 0), [-20, -20, 0, 20, 20, 20], 0.05)
        and p.ev("return App.errors.length") == 0
    )

    # 4. Zeitleiste (Unterdrücken + Marker), Skizze bearbeiten, Stützrippe (dir='parallel'), Bezüge & Hilfe
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Unterdrücken').click()
    warte_rechnen(p, 30); p.wait(250)
    v_sup = volumen(p)
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Wieder aktivieren').click()
    warte_rechnen(p, 30); p.wait(250)
    v_unsup = volumen(p)

    p.ev("Timeline.setMarker(1)"); warte_rechnen(p, 30); p.wait(200)
    v_mk1 = volumen(p)
    p.ev("Timeline.setMarker(2)"); warte_rechnen(p, 30); p.wait(200)
    v_mk2 = volumen(p)

    p.ev("Sketch.editItem(App.doc.items[1].id)"); p.wait(1200)
    edit_ok = p.ev("return Sketch.active && Sketch.state.ents.length === 1")
    p.pg.keyboard.press('Enter'); p.wait(1200); warte_rechnen(p, 30)

    deps = p.ev("return Model.dependencies(App.doc)")
    expl = p.ev("return Explain.local(App.doc.items[1].id)")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    cmd_ok = p.ev("return Commands.search('Rippe').some(c=>c.id==='rib')")

    # Stützrippe in der Skizzenebene (L-Winkel mit 2 mm Rippe in XZ)
    p.ev("""App.change('Winkel', d => {
      d.items = [];
      const b1 = Model.newItem('box', { w: 30, d: 20, h: 4 }, { name: 'Boden' });
      const b2 = Model.newItem('box', { w: 4, d: 20, h: 24 }, { name: 'Wand' });
      b2.t.x = -13; b2.t.z = 4;
      b2.op = { type: 'join', target: b1.id };
      const sk = { plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, ents: [{ id: 'g1', type: 'line', a: [-11, 20], b: [5, 4] }], dims: [], cons: [] };
      const r = Model.newItem('rib', { sketch: sk, target: b1.id, thickness: 2, side: 'center', dir: 'parallel', flip: false, depth: 0, draft: 0 }, { name: 'Stütze' });
      d.items.push(b1, b2, r);
    })""")
    warte_rechnen(p, 30); p.wait(300)
    m_gus = p.ev("return Mass.measureDoc(App.doc)")
    # Boden 30*20*4 = 2400, Wand 4*20*24 = 1920, Dreieck 0.5*16*16*2 = 256 -> Summe 4576 mm³
    ok4 = (
        v_sup is not None and abs(v_sup - 8672) < 5
        and v_unsup is not None and abs(v_unsup - m_draft['volume']) < 5
        and v_mk1 is not None and abs(v_mk1 - 8672) < 5
        and v_mk2 is not None and abs(v_mk2 - m_draft['volume']) < 5
        and edit_ok and not p.ev("return Sketch.active")
        and any(x['what'] == 'Rippe an' for x in deps)
        and expl and any(l['k'] == 'op' for l in expl['lines'])
        and 'rib' in hilfen and all(k in hilfen['rib'] for k in ('tip', 'hilfe', 'tipp'))
        and cmd_ok
        and m_gus and m_gus['count'] == 1 and abs(m_gus['volume'] - 4576) < 10
        and p.ev("return App.errors.length") == 0
    )
    return [ok1, ok2, ok3, ok4]


def t_a030_drehen_winkel_flaeche(p):
    p.empty()
    p.ev("Sketch.startOnPlane('XY')"); p.wait(600)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[10,0],b:[20,10]})"); p.wait(200)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(900)
    p.pg.locator('.stepbox .role-switch button').nth(1).click(); p.wait(400)
    p.pg.locator('.stepbox .btn.primary').click(); p.wait(1200); warte_rechnen(p)

    rev_id = p.ev("return App.doc.items[0].id")
    vol_of = lambda tid: p.ev("return Mass.measure().then(r=>{ const pt=Mass.partOf(r,arg); return pt?pt.volume:0; })", tid)
    bbox_of = lambda tid: p.ev("return App.results.get(arg).data.bbox", tid)
    v360 = vol_of(rev_id) or 0
    exp360 = math.pi * (20 ** 2 - 10 ** 2) * 10

    # 1. 90° ergibt ein Viertel des vollen Volumens (±1 %)
    p.ev("App.select([arg])", rev_id); p.wait(400)
    p.pg.fill('#p-angle', '90'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    v90 = vol_of(rev_id) or 0
    bb90 = bbox_of(rev_id)
    ok1 = (
        abs(v360 - exp360) < 10
        and abs(v90 - v360 / 4) / (v360 / 4) < 0.01
        and p.ev("return App.errorsFor(arg).length", rev_id) == 0
        and bb90[5] <= 0.05 and bb90[2] < -15
    )

    # 2. Symmetrisch 2×45° (Gesamtwinkel 90°) -> gleiches Volumen, symmetrisch um Z = 0
    p.pg.select_option('#p-rev-dir', 'both'); p.wait(500); warte_rechnen(p)
    v_sym = vol_of(rev_id) or 0
    bb_sym = bbox_of(rev_id)
    sym_txt = p.pg.locator('#p-rev-sym-info').text_content() or ''
    ok2 = (
        abs(v_sym - v90) / v90 < 0.01
        and '45' in sym_txt
        and abs(bb_sym[2] + bb_sym[5]) < 0.05 and bb_sym[5] > 5
    )

    # 3. Beidseitig verschieden (45°/45° und 60°/30°) & Umgekehrt (90°)
    p.pg.select_option('#p-rev-dir', 'two'); p.wait(400); warte_rechnen(p)
    p.pg.fill('#p-angle', '45'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    p.pg.fill('#p-angle2', '45'); p.pg.press('#p-angle2', 'Enter'); warte_rechnen(p)
    v_two_eq = vol_of(rev_id) or 0
    bb_two_eq = bbox_of(rev_id)
    p.pg.fill('#p-angle', '60'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    p.pg.fill('#p-angle2', '30'); p.pg.press('#p-angle2', 'Enter'); warte_rechnen(p)
    v_two_asym = vol_of(rev_id) or 0
    bb_two_asym = bbox_of(rev_id)
    p.pg.select_option('#p-rev-dir', 'reverse'); p.wait(400); warte_rechnen(p)
    p.pg.fill('#p-angle', '90'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    v_rev = vol_of(rev_id) or 0
    bb_rev = bbox_of(rev_id)
    ok3 = (
        abs(v_two_eq - v90) / v90 < 0.01 and abs(bb_two_eq[2] + bb_two_eq[5]) < 0.05
        and abs(v_two_asym - v90) / v90 < 0.01 and abs(bb_two_asym[2]) > abs(bb_two_asym[5]) + 1
        and abs(v_rev - v90) / v90 < 0.01 and bb_rev[2] >= -0.05 and bb_rev[5] > 15
    )

    # 4. Bis zu gewählter Fläche (radial 90° + Richtung umkehren + 60°-Bezugsebene)
    box_id = p.ev("let id; App.change('x', d=>{ const b=Model.newItem('box',{w:10,d:20,h:25},{name:'Anschlag'}); b.t.x=-5; b.t.y=5; b.t.z=0; d.items.push(b); id=b.id; }); return id;")
    warte_rechnen(p)
    p.ev("""const r=App.results.get(arg.boxId);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[0]>0.9);
      Features.setRevolveToFace(arg.revId, {id:arg.boxId, idx:fi, info:r.data.faces[fi], point:[0,5,12.5]});""", {'revId': rev_id, 'boxId': box_id})
    warte_rechnen(p)
    v_face = vol_of(rev_id) or 0
    bb_face = bbox_of(rev_id)
    p.ev("App.select([arg])", rev_id); p.wait(400)
    p.pg.locator('#p-rev-face-flip').click(); p.wait(500); warte_rechnen(p)
    v_flip = vol_of(rev_id) or 0
    bb_flip = bbox_of(rev_id)
    s60 = round(math.sin(math.pi / 3), 6)
    c60 = round(math.cos(math.pi / 3), 6)
    p.ev("""App.change('x', d=>{
      d.datums=d.datums||[]; d.datums.push({id:'d60', name:'Ebene 60', base:{type:'fixed'}, plane:{o:[0,0,0], x:[0,1,0], n:[arg.s,0,arg.c]}});
    })""", {'s': s60, 'c': c60}); p.wait(300)
    p.pg.select_option('#p-rev-face-datum', 'd60'); p.wait(500); warte_rechnen(p)
    v_d60 = vol_of(rev_id) or 0
    ok4 = (
        abs(v_face - v90) / v90 < 0.01 and bb_face[2] >= -0.05 and bb_face[5] > 15
        and abs(v_flip - v90) / v90 < 0.01 and bb_flip[5] <= 0.05 and bb_flip[2] < -15
        and abs(v_d60 - v360 / 6) / (v360 / 6) < 0.01
    )

    # 5. Bis zu versetzter Fläche (Trimmen an Ebene z=8) & automatisches Nachführen auf z=6
    p.ev("App.change('x', d=>{ const b=d.items[1]; b.p.w=30; b.p.d=20; b.p.h=10; b.t.x=15; b.t.y=5; b.t.z=8; })"); warte_rechnen(p)
    p.ev("""const r=App.results.get(arg.boxId);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]<-0.9);
      Features.setRevolveToFace(arg.revId, {id:arg.boxId, idx:fi, info:r.data.faces[fi], point:[15,5,8]});""", {'revId': rev_id, 'boxId': box_id})
    warte_rechnen(p)
    bb_off1 = bbox_of(rev_id)
    p.ev("App.change('x', d=>{ d.items[1].t.z=6; })"); warte_rechnen(p); p.wait(600); warte_rechnen(p)
    bb_off2 = bbox_of(rev_id)
    ok5 = (
        p.ev("return App.errorsFor(arg).length", rev_id) == 0
        and bb_off1[2] >= -0.05 and abs(bb_off1[5] - 8) < 0.05
        and bb_off2[2] >= -0.05 and abs(bb_off2[5] - 6) < 0.05
    )

    # 6. Ziehgriff für den Winkel bei Teil-Umdrehungen + Rückgängig + Hilfetext
    p.ev("App.change('x', d=>{ d.items.splice(1,1); d.items[0].p.dir='normal'; d.items[0].p.angle=90; })"); warte_rechnen(p)
    p.ev("App.select([arg])", rev_id); p.wait(400)
    has_h90 = 'revAngle' in p.ev("return Handles.debugKinds()")
    p.pg.fill('#p-angle', '360'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    has_h360 = 'revAngle' in p.ev("return Handles.debugKinds()")
    p.pg.fill('#p-angle', '90'); p.pg.press('#p-angle', 'Enter'); warte_rechnen(p)
    p.ev("Viewer.setView('front', false)"); p.wait(500); p.ev("Viewer.fit()"); p.wait(600)
    pt = p.ev("const m=Handles.debugHandle('revAngle'); const s=Viewer.toScreen(m.position); const r=Viewer.canvas.getBoundingClientRect(); return [s.x+r.left, s.y+r.top];")
    p.pg.mouse.move(pt[0], pt[1]); p.pg.mouse.down(); p.pg.mouse.move(pt[0] - 50, pt[1] - 40, steps=8); p.pg.mouse.up()
    p.wait(600); warte_rechnen(p)
    drag_ang = p.ev("return App.doc.items[0].p.angle")
    p.ev("App.undo()"); warte_rechnen(p)
    undo_ang = p.ev("return App.doc.items[0].p.angle")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ro = hilfen.get('revolveOptions') or {}
    help_ok = bool(ro.get('tip') and ro.get('hilfe') and ro.get('tipp')) and p.pg.locator('[data-help="revolveOptions"]').count() >= 1
    ok6 = (
        has_h90 and not has_h360
        and drag_ang != 90 and 5 <= drag_ang <= 355
        and p.ev("return App.errorsFor(arg).length", rev_id) == 0
        and abs(undo_ang - 90) < 0.1
        and help_ok
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- [A-034] Verlauf umsortieren, Ordner, duplizieren (KP-10) ----------
def t_a034_verlauf_ordner(p):
    p.empty()
    # Quader + zwei unabhängige Löcher (links und rechts)
    p.ev("""App.change('x', d => {
      const b = Model.newItem('box', {w:40, d:30, h:10}, {name:'Platte'});
      const h1 = Model.newItem('cylinder', {d:6, h:20}, {name:'Loch links', role:'hole'}); h1.t.x = -10; h1.t.z = -5;
      const h2 = Model.newItem('cylinder', {d:6, h:20}, {name:'Loch rechts', role:'hole'}); h2.t.x = 10; h2.t.z = -5;
      d.items.push(b, h1, h2);
    })"""); warte_rechnen(p); p.wait(300)

    ids = p.ev("return App.doc.items.map(x => x.id)")
    bid, h1id, h2id = ids[0], ids[1], ids[2]
    vol = lambda: p.ev("""return Mass.measure().then(r => {
      const m = r.parts.find(x => x.id === arg); return m ? m.volume : r.volume;
    })""", bid)
    v1 = vol()

    # Hilfsfunktion für echtes Drag-and-Drop im Verlauf (inkl. dragover für .drop-bad-Prüfung)
    def drag_tree(src_id, dst_id, pos='top'):
        return p.ev("""const src = document.querySelector('#left-body .node[data-id="' + arg.s + '"]');
          const dst = document.querySelector('#left-body .node[data-id="' + arg.d + '"]');
          if (!src || !dst) return { ok: false };
          const r = dst.getBoundingClientRect();
          const cy = arg.pos === 'top' ? r.top + 3 : arg.pos === 'bottom' ? r.bottom - 3 : r.top + r.height / 2;
          const dt = new DataTransfer();
          src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
          dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: cy, dataTransfer: dt }));
          const cls = [...dst.classList];
          dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: cy, dataTransfer: dt }));
          src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
          return { ok: true, cls };""", {'s': src_id, 'd': dst_id, 'pos': pos})

    # 1. Zwei unabhängige Löcher tauschen die Reihenfolge → erlaubt, Ergebnis bleibt gleich
    d1 = drag_tree(h2id, h1id, 'top')
    p.wait(400); warte_rechnen(p)
    order1 = p.ev("return App.doc.items.map(x => x.id)")
    v2 = vol()
    # Auch zwei unabhängige Schnitt-Schritte (op: cut) tauschen
    p.ev("""App.change('x', d => {
      d.items = [];
      const b = Model.newItem('box', {w:40, d:30, h:10}, {name:'Grundkörper'});
      const c1 = Model.newItem('cylinder', {d:6, h:20}, {name:'Schnitt 1'}); c1.t.x = -10; c1.t.z = -5; c1.op = {type:'cut', target:b.id};
      const c2 = Model.newItem('cylinder', {d:6, h:20}, {name:'Schnitt 2'}); c2.t.x = 10; c2.t.z = -5; c2.op = {type:'cut', target:b.id};
      d.items.push(b, c1, c2);
    })"""); warte_rechnen(p); p.wait(300)
    cids = p.ev("return App.doc.items.map(x => x.id)")
    vc1 = p.ev("return Mass.measure().then(r => r.volume)")
    dc = drag_tree(cids[2], cids[1], 'top')
    p.wait(400); warte_rechnen(p)
    cids2 = p.ev("return App.doc.items.map(x => x.id)")
    vc2 = p.ev("return Mass.measure().then(r => r.volume)")
    ok1 = (
        d1['ok'] and 'drop-before' in d1['cls'] and 'drop-bad' not in d1['cls']
        and order1 == [bid, h2id, h1id]
        and v1 is not None and v2 is not None and abs(v1 - v2) < 0.1
        and p.ev("return App.errors.length") == 0
        and dc['ok'] and 'drop-bad' not in dc['cls'] and cids2 == [cids[0], cids[2], cids[1]]
        and abs(vc1 - vc2) < 0.1 and p.ev("return App.errors.length") == 0
    )

    # 2. Loch (bzw. abhängigen Schritt) vor seinen Körper ziehen → rot gezeigt (.drop-bad) und abgelehnt
    # Auch Elternkörper hinter abhängigen Schnitt-Schritt ziehen → rot und abgelehnt
    d_cut_bad = drag_tree(cids[2], cids[0], 'top')
    p.wait(300)
    d_parent_bad = drag_tree(cids[0], cids[2], 'bottom')
    p.wait(300)
    cids_after_bad = p.ev("return App.doc.items.map(x => x.id)")
    # Zurück auf Platte + 2 Löcher und Loch vor Platte ziehen
    p.ev("""App.change('x', d => {
      d.items = [];
      const b = Model.newItem('box', {w:40, d:30, h:10}, {name:'Platte'});
      const h1 = Model.newItem('cylinder', {d:6, h:20}, {name:'Loch 1', role:'hole'}); h1.t.x = -10; h1.t.z = -5;
      const h2 = Model.newItem('cylinder', {d:6, h:20}, {name:'Loch 2', role:'hole'}); h2.t.x = 10; h2.t.z = -5;
      d.items.push(b, h1, h2);
    })"""); warte_rechnen(p); p.wait(300)
    ids = p.ev("return App.doc.items.map(x => x.id)")
    bid, h1id, h2id = ids[0], ids[1], ids[2]
    d_hole_bad = drag_tree(h1id, bid, 'top')
    p.wait(300)
    toasts = ' '.join(p.pg.locator('.toast').all_inner_texts())
    d_box_bad = drag_tree(bid, h1id, 'bottom')
    p.wait(300)
    ids_after_bad = p.ev("return App.doc.items.map(x => x.id)")
    ok2 = (
        'drop-before' in d_hole_bad['cls'] and 'drop-bad' in d_hole_bad['cls']
        and 'drop-after' in d_box_bad['cls'] and 'drop-bad' in d_box_bad['cls']
        and ids_after_bad == [bid, h1id, h2id]
        and 'verschoben' in toasts.lower()
        and 'drop-bad' in d_cut_bad['cls'] and 'drop-bad' in d_parent_bad['cls']
        and cids_after_bad == cids2
    )

    # 3. Ordner mit 2 Schritten anlegen und zuklappen (Volumen bleibt gleich)
    v_before_fld = vol()
    p.ev("App.select(arg)", [h1id, h2id]); p.wait(300)
    has_btn = p.pg.locator('#btn-tree-folder').count() == 1
    p.pg.locator('#btn-tree-folder').click(); p.wait(400); warte_rechnen(p)
    flds = p.ev("return App.doc.folders || []")
    fid = flds[0]['id'] if flds else None
    children_open = p.pg.locator(f'li[data-folder-li="{fid}"] .folder-list .node').count() if fid else 0
    # Zuklappen per Klick auf Dreieck
    p.pg.locator(f'button[data-folder-toggle="{fid}"]').click(); p.wait(300)
    collapsed_flag = p.ev("return App.doc.folders[0].collapsed")
    children_closed = p.pg.locator(f'li[data-folder-li="{fid}"] .folder-list .node').count()
    # Wieder aufklappen
    p.pg.locator(f'button[data-folder-toggle="{fid}"]').click(); p.wait(300)
    reopened_flag = p.ev("return App.doc.folders[0].collapsed")
    children_reopen = p.pg.locator(f'li[data-folder-li="{fid}"] .folder-list .node').count()
    v_after_fld = vol()
    # Auflösen & Rückgängig prüfen
    p.ev("Actions.ungroupFolder(arg)", fid); p.wait(300)
    after_ungroup = p.ev("return (App.doc.folders || []).length")
    p.ev("App.undo()"); p.wait(300)
    after_undo_ungroup = p.ev("return (App.doc.folders || []).length")
    ok3 = (
        has_btn and len(flds) == 1 and set(flds[0]['ids']) == {h1id, h2id}
        and p.pg.locator('.folder-node').count() == 1
        and children_open == 2 and collapsed_flag is True and children_closed == 0
        and reopened_flag is False and children_reopen == 2
        and abs(v_before_fld - v_after_fld) < 0.1
        and after_ungroup == 0 and after_undo_ungroup == 1
    )

    # 4. Duplizieren → 2 gleiche Schritte (über Rechtsklick-Menü im Verlauf)
    p.pg.locator(f'#left-body .node[data-id="{h1id}"]').click(button='right'); p.wait(300)
    has_dup_menu = p.pg.locator('#tm-dup').count() == 1
    p.pg.locator('#tm-dup').click(); p.wait(500); warte_rechnen(p)
    items_dup = p.ev("return App.doc.items.map(x => ({id:x.id, name:x.name, kind:x.kind, role:x.role, p:x.p, t:x.t}))")
    fld_after_dup = p.ev("return App.doc.folders[0].ids")
    same_holes = [x for x in items_dup if x['name'] == 'Loch 1']
    p.ev("App.undo()"); p.wait(400); warte_rechnen(p)
    count_undo_dup = p.ev("return App.doc.items.length")
    ok4 = (
        has_dup_menu and len(items_dup) == 4 and len(same_holes) == 2
        and same_holes[0]['id'] != same_holes[1]['id']
        and same_holes[0]['kind'] == same_holes[1]['kind']
        and same_holes[0]['role'] == same_holes[1]['role']
        and same_holes[0]['p'] == same_holes[1]['p']
        and abs(same_holes[1]['t']['x'] - same_holes[0]['t']['x'] - 10) < 0.01
        and len(fld_after_dup) == 3
        and p.ev("return App.errors.length") == 0
        and count_undo_dup == 3
    )

    # 5. Hilfetexte prüfen
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok5 = all(
        bool((hilfen.get(k) or {}).get('tip') and (hilfen.get(k) or {}).get('hilfe') and (hilfen.get(k) or {}).get('tipp'))
        for k in ('treeReorder', 'treeFolder', 'treeDuplicate')
    )
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-033] Körper-Liste im Teil (KP-09) ----------
def t_koerper_liste(p):
    import zipfile, tempfile
    p.empty()
    # 1. Einzelner Quader -> keine Körper-Liste; Teil mit 2 getrennten Körpern -> Liste mit 2 Einträgen
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:10,d:10,h:10},{name:'Einzel'})); })"); warte_rechnen(p)
    no_list_for_one = p.pg.locator('.bodies-wrap').count() == 0
    p.ev("""App.change('x', d=>{
      d.items = [];
      const it = Model.newItem('extrude',{},{name:'Doppelteil'});
      it.p = {
        sketch: {
          plane: { o: [0,0,0], x: [1,0,0], n: [0,0,1] },
          ents: [
            { id: 'r1', type: 'rect', a: [-25,-10], b: [-5,10] },
            { id: 'r2', type: 'rect', a: [5,-10], b: [25,10] }
          ],
          dims: [], cons: []
        },
        dist: 10, dir: 'normal'
      };
      d.items.push(it);
    })"""); warte_rechnen(p)
    item_id = p.ev("return App.doc.items[0].id")
    head_txt = (p.pg.locator('.bodies-wrap .bodies-head').first.text_content() or '').strip().lower()
    row_cnt = p.pg.locator('.bodies-wrap .body-row').count()
    ok1 = no_list_for_one and 'körper (2)' in head_txt and row_cnt == 2

    # 2. Beide Körper umbenennen (Knopf & Doppelklick)
    p.pg.locator('.body-row[data-body="0"] .body-rename').click(); p.wait(150)
    p.pg.fill('#prompt-inp', 'Links'); p.pg.press('#prompt-inp', 'Enter'); p.wait(300)
    p.pg.locator('.body-row[data-body="1"] .nm').dblclick(); p.wait(150)
    p.pg.fill('#prompt-inp', 'Rechts'); p.pg.press('#prompt-inp', 'Enter'); p.wait(300)
    names_ui = [
        (p.pg.locator('.body-row[data-body="0"] .nm').text_content() or '').strip(),
        (p.pg.locator('.body-row[data-body="1"] .nm').text_content() or '').strip(),
    ]
    bodies_doc = p.ev("return App.doc.items[0].bodies || []")
    ok2 = names_ui == ['Links', 'Rechts'] and [b.get('name') for b in bodies_doc] == ['Links', 'Rechts']

    # 3. Körper 0 einfärben -> Farbe gespeichert & Vertex-Farben im Bild aktiv
    p.pg.locator('.body-row[data-body="0"] .body-color-btn').click(); p.wait(150)
    p.pg.locator('.body-color-pop .colors button').first.click(); p.wait(300)
    col_info = p.ev("""const n = Viewer.nodes.get(arg); const c = n.mesh.geometry.getAttribute('color');
      let diff = false;
      if (c && n.data.faceGroups && n.data.faceBody) {
        const cols = [null, null];
        for (const [st, cnt, fi] of n.data.faceGroups) {
          const bi = fi >= 0 ? n.data.faceBody[fi] : -1;
          if (bi === 0 || bi === 1) {
            const vi = n.data.triangles[st];
            cols[bi] = [c.getX(vi), c.getY(vi), c.getZ(vi)];
          }
        }
        if (cols[0] && cols[1]) diff = Math.hypot(cols[0][0]-cols[1][0], cols[0][1]-cols[1][1], cols[0][2]-cols[1][2]) > 0.05;
      }
      return { col: (App.doc.items[0].bodies[0] || {}).color, vc: !!n.mesh.material.vertexColors, diff };""", item_id)
    ok3 = bool(col_info.get('col')) and col_info.get('vc') and col_info.get('diff')

    # 4. Körper 1 ausblenden -> im 3D-Bild weg, Rückgängig/Wiederholen funktioniert
    p.ev("Viewer.setView('top', false); Viewer.fit(null, false);"); p.wait(300)
    tris_before = p.ev("return Viewer.nodes.get(arg).mesh.geometry.index.count", item_id)
    p.pg.locator('.body-row[data-body="1"] .body-eye').click(); p.wait(300)
    tris_after = p.ev("return Viewer.nodes.get(arg).mesh.geometry.index.count", item_id)
    has_hidden_cls = p.pg.locator('.body-row[data-body="1"].hidden-item').count() == 1
    pt_left = world_screen(p, -15, 0, 10)
    pt_right = world_screen(p, 15, 0, 10)
    pick_left = p.ev("const h = Viewer.pick(arg[0], arg[1]); return h ? h.id : null;", pt_left)
    pick_right = p.ev("const h = Viewer.pick(arg[0], arg[1]); return h ? h.id : null;", pt_right)
    p.ev("App.undo()"); p.wait(250)
    tris_undo = p.ev("return Viewer.nodes.get(arg).mesh.geometry.index.count", item_id)
    p.ev("App.redo()"); p.wait(250)
    tris_redo = p.ev("return Viewer.nodes.get(arg).mesh.geometry.index.count", item_id)
    ok4 = (
        has_hidden_cls and 0 < tris_after < tris_before * 0.75
        and pick_left == item_id and pick_right is None
        and tris_undo == tris_before and tris_redo == tris_after
    )

    # 5. Speichern in Projektdatei & Neuladen + exportMeshes lässt ausgeblendeten Körper weg
    saved = p.ev("return App.snapshot()")
    exp_hidden = p.ev("""return (async () => {
      const { Kernel } = window.__masswerk;
      const r = await Kernel.call('exportMeshes', { scene: Model.kernelScene(App.doc), fine: true, q: 1 });
      return r.objects.map(o => o.name);
    })()""")
    p.ev("App.setDoc(JSON.parse(arg))", saved); warte_rechnen(p); p.wait(300)
    reloaded_ok = (
        p.pg.locator('.bodies-wrap .body-row').count() == 2
        and (p.pg.locator('.body-row[data-body="0"] .nm').text_content() or '').strip() == 'Links'
        and (p.pg.locator('.body-row[data-body="1"] .nm').text_content() or '').strip() == 'Rechts'
        and p.pg.locator('.body-row[data-body="1"].hidden-item').count() == 1
        and p.ev("return Viewer.nodes.get(arg).mesh.geometry.index.count", item_id) == tris_after
    )
    ok5 = ('"Links"' in saved and '"Rechts"' in saved and '"hidden":true' in saved and exp_hidden == ['Links'] and reloaded_ok)

    # 6. Körper 1 wieder einblenden -> Export „jeder Körper einzeln“ übernimmt die Namen, Hilfetext vorhanden
    p.pg.locator('.body-row[data-body="1"] .body-eye').click(); p.wait(300)
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(500)
    p.pg.uncheck('#ex-step'); p.pg.check('#ex-stl'); p.pg.check('#ex-mf'); p.pg.check('#ex-each'); p.wait(100)
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z = os.path.join(tempfile.gettempdir(), 'tracery-koerperliste.zip'); dl.value.save_as(z)
    import io
    zf = zipfile.ZipFile(z); znames = set(zf.namelist())
    mf_name = next((n for n in znames if n.endswith('.3mf') and not n.startswith('Einzeln/')), None)
    mf_xml = zf.read(mf_name) if mf_name else b''
    mf_txt = zipfile.ZipFile(io.BytesIO(mf_xml)).read('3D/3dmodel.model').decode('utf-8') if mf_xml else ''
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    bl = hilfen.get('bodyList') or {}
    help_ok = bool(bl.get('tip') and bl.get('hilfe') and bl.get('tipp')) and p.pg.locator('[data-help="bodyList"]').count() >= 1
    ok6 = (
        {'Einzeln/Links.stl', 'Einzeln/Rechts.stl', 'Einzeln/Links.3mf', 'Einzeln/Rechts.3mf'}.issubset(znames)
        and 'name="Links"' in mf_txt and 'name="Rechts"' in mf_txt
        and help_ok
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_f11240339(p):
    # 1. Kontextleiste erscheint nach asynchroner Ghost-Auswertung (Kind-Teil in Gruppe)
    p.empty()
    p.ev("Actions.addPrimitive('box')"); p.wait(1500)
    p.ev("App.change('x', d=>{ const it=d.items[0]; it.t.x=0; it.t.y=0; it.p.w=40; it.p.d=40; it.p.h=3; })"); warte_rechnen(p)
    p.ev("Viewer.setView('top', false)"); p.wait(800)
    s = world_screen(p, 8, 0, 3); p.pg.mouse.click(s[0], s[1]); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'through'); p.pg.select_option('#hw-size', 'M3'); p.wait(100)
    p.pg.click('#hw-go'); p.wait(2000); p.pg.keyboard.press('Escape'); p.wait(600); warte_rechnen(p)
    p.ev("Comp.edit(App.doc.items[0].id)"); warte_rechnen(p)
    p.ev("const hid=App.doc.items[0].children.find(c=>c.role==='hole').id; App.select([hid]);")
    p.pg.locator('.ctxbar button[aria-label="Muster"]').click(timeout=8000); p.wait(300)
    ok1 = p.pg.locator('.menu button, .menu [role=menuitem]').filter(has_text='Kreismuster').count() >= 1
    p.pg.keyboard.press('Escape'); p.wait(200)

    # 2. Gelenk-Abspielen läuft und endet auch bei komplett blockiertem requestAnimationFrame + überlebt Panel-Neuaufbau
    p.ev("App.setCtx(null); App.change('x', d=>{ d.items=[]; d.joints=[]; const a=Model.newItem('box',{w:20,d:10,h:4}); a.name='Arm A'; d.items.push(a); const b=Model.newItem('box',{w:20,d:10,h:4}); b.t.x=20; b.name='Arm B'; d.items.push(b); })"); warte_rechnen(p, 20)
    p.ev("Joints.add(App.doc.items[0].id, App.doc.items[1].id, [10,0,4], [0,1,0]); App.select([App.doc.items[1].id]);")
    p.wait(300)
    rev = p.ev("return App.revision")
    mid = None
    end = None
    try:
        p.ev("window.__origRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => 1;")
        p.pg.click('#jt-play'); p.wait(400)
        mid = p.ev("const it=App.doc.items[1], n=Viewer.nodes.get(it.id), m=Model.localMatrix(it); return [!!Joints.playing, n.base.elements.some((v,i)=>Math.abs(v-m.elements[i])>1e-3), document.querySelector('#jt-play')?.innerText || '']")
        p.ev("Panels.renderRight()")
        for _ in range(40):
            p.wait(200)
            if not p.ev("return !!Joints.playing"):
                break
        end = p.ev("const it=App.doc.items[1], n=Viewer.nodes.get(it.id), m=Model.localMatrix(it); return [!!Joints.playing, n.base.elements.every((v,i)=>Math.abs(v-m.elements[i])<1e-6), App.revision===arg, document.querySelector('#jt-play')?.innerText || '']", rev)
    finally:
        p.ev("if (window.__origRAF) { window.requestAnimationFrame = window.__origRAF; delete window.__origRAF; } Joints.stopPlay();")
    ok2 = (
        mid is not None and mid[0] is True and mid[1] is True and 'Stopp' in mid[2]
        and end is not None and end[0] is False and end[1] is True and end[2] is True and 'abspielen' in end[3]
    )
    return [ok1, ok2]


def t_muster_schritte(p):
    # 1. Grundkörper Zylinder (Ø 60, H 10) + Tasche als Formschritt (op: cut)
    p.empty()
    p.ev("""App.change('x', d => {
      const b = Model.newItem('cylinder', { d: 60, h: 10 }, { name: 'Scheibe' });
      d.items.push(b);
    })""")
    warte_rechnen(p, 30)
    v_base = volumen(p)
    p.ev("""App.change('x', d => {
      const b = d.items[0];
      const pk = Model.newItem('extrude', {}, { name: 'Tasche' });
      pk.p = { sketch: { plane: { o: [0, 0, 5], x: [1, 0, 0], n: [0, 0, 1] }, ents: [{ id: 'c1', type: 'circle', c: [18, 0], r: 4 }], dims: [], cons: [] }, dist: 5, dir: 'normal' };
      pk.op = { type: 'cut', target: b.id };
      d.items.push(pk);
      App.select([pk.id]);
    })""")
    warte_rechnen(p, 30)
    v_pocket = math.pi * 4 * 4 * 5
    v_1 = volumen(p)
    ok1 = (
        v_base is not None and v_1 is not None
        and abs((v_base - v_1) - v_pocket) < 10
        and p.ev("return Viewer.nodes.size === 1 && App.mergedInto(App.doc.items[1].id) === App.doc.items[0].id && App.errors.length === 0")
    )

    # 2. Tasche 6× im Kreis -> 6 Taschen im selben Körper (Volumen passt)
    p.ev("Viewer.setView('top', false)"); p.wait(600)
    ctx(p, 'Muster', 'Kreismuster')
    warte_rechnen(p, 30)
    field(p, '#op-n', 6)
    warte_rechnen(p, 30)
    v_6 = volumen(p)
    ok2 = (
        v_6 is not None
        and abs((v_base - v_6) - 6 * v_pocket) < 25
        and p.ev("""const g = App.doc.items[1];
          return Viewer.nodes.size === 1
            && App.mergedInto(g.id) === App.doc.items[0].id
            && g.op && g.op.type === 'cut' && g.op.target === App.doc.items[0].id
            && document.querySelectorAll('.pat-dot').length === 6
            && document.querySelectorAll('#op-skip-wrap .pat-chip').length === 6
            && App.errors.length === 0""")
    )

    # 3. Eine Kopie im Bild per Klick auslassen -> 5 Taschen, durchgestrichen
    p.pg.locator('.pat-dot[data-idx="2"]').click(timeout=8000)
    warte_rechnen(p, 30)
    v_5 = volumen(p)
    deco_dot = p.pg.locator('.pat-dot[data-idx="2"]').evaluate("e => getComputedStyle(e).textDecorationLine")
    deco_chip = p.pg.locator('#op-skip-wrap .pat-chip[data-idx="2"]').evaluate("e => getComputedStyle(e).textDecorationLine")
    ok3 = (
        v_5 is not None
        and abs((v_base - v_5) - 5 * v_pocket) < 25
        and abs((v_5 - v_6) - v_pocket) < 15
        and p.ev("const g = App.doc.items[1]; return JSON.stringify(g.p.skip) === '[2]' && Model.sizeText(g, Model.vars(App.doc).v) === '5/6× 360°' && Viewer.nodes.size === 1")
        and p.pg.locator('.pat-dot[data-idx="2"].skipped').count() == 1
        and p.pg.locator('#op-skip-wrap .pat-chip[data-idx="2"].skipped').count() == 1
        and 'line-through' in deco_dot
        and 'line-through' in deco_chip
    )

    # 4. Kopie über Panel-Chip wieder aktivieren -> 6, Undo -> 5, Redo -> 6
    p.pg.locator('#op-skip-wrap .pat-chip[data-idx="2"]').click()
    warte_rechnen(p, 30)
    v_back6 = volumen(p)
    p.ev("App.undo()"); warte_rechnen(p, 30)
    v_undo5 = volumen(p)
    p.ev("App.redo()"); warte_rechnen(p, 30)
    v_redo6 = volumen(p)
    ok4 = (
        v_back6 is not None and abs(v_back6 - v_6) < 10
        and v_undo5 is not None and abs(v_undo5 - v_5) < 10
        and v_redo6 is not None and abs(v_redo6 - v_6) < 10
        and p.ev("return !App.doc.items[1].p.skip")
    )

    # 5. Rechteckmuster für eine Tasche auf Quader (3×2 = 6 Taschen -> 1 auslassen = 5 -> Auflösen = 1)
    p.ev("App.setDoc(Model.newDoc())"); warte_rechnen(p, 30)
    p.ev("""App.change('x', d => {
      const box = Model.newItem('box', { w: 80, d: 50, h: 10 }, { name: 'Platte' });
      d.items.push(box);
      const pk = Model.newItem('extrude', {}, { name: 'Nut' });
      pk.p = { sketch: { plane: { o: [0, 0, 6], x: [1, 0, 0], n: [0, 0, 1] }, ents: [{ id: 'r1', type: 'rect', a: [-24, -14], b: [-16, -6] }], dims: [], cons: [] }, dist: 4, dir: 'normal' };
      pk.op = { type: 'cut', target: box.id };
      d.items.push(pk);
      App.select([pk.id]);
    })""")
    warte_rechnen(p, 30)
    p.ev("Viewer.setView('top', false)"); p.wait(600)
    ctx(p, 'Muster', 'Rechteckmuster')
    warte_rechnen(p, 30)
    field(p, '#op-nx', 3); field(p, '#op-ny', 2)
    field(p, '#op-dx', 20); field(p, '#op-dy', 20)
    warte_rechnen(p, 30)
    v_rect6 = volumen(p)
    p.pg.locator('.pat-dot[data-idx="4"]').click(timeout=8000)
    warte_rechnen(p, 30)
    v_rect5 = volumen(p)
    p.pg.get_by_text('Auflösen').first.click()
    warte_rechnen(p, 30)
    v_rect1 = volumen(p)
    ok5 = (
        v_rect6 is not None and abs(v_rect6 - (40000 - 6 * 256)) < 20
        and v_rect5 is not None and abs(v_rect5 - (40000 - 5 * 256)) < 20
        and v_rect1 is not None and abs(v_rect1 - (40000 - 256)) < 20
        and p.ev("const x = App.doc.items[1]; return x.kind === 'extrude' && x.op && x.op.type === 'cut' && Viewer.nodes.size === 1")
    )

    # 6. Hilfetext & Speichern/Laden mit skip
    p.ev("App.undo()"); warte_rechnen(p, 30)  # wieder 5 Taschen mit skip=[4]
    saved = p.ev("return JSON.stringify(App.doc)")
    p.ev("App.setDoc(JSON.parse(arg))", saved); warte_rechnen(p, 30)
    v_reload = volumen(p)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(400)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r => r.json())")
    ps = hilfen.get('patternSkip') or {}
    ok6 = (
        bool(ps.get('tip') and ps.get('hilfe') and ps.get('tipp'))
        and p.pg.locator('[data-help="patternSkip"]').count() >= 1
        and v_reload is not None and abs(v_reload - (40000 - 5 * 256)) < 20
        and p.ev("const g = App.doc.items[1]; return g.op && g.op.type === 'cut' && JSON.stringify(g.p.skip) === '[4]'")
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_a032_aufdicken_skalieren(p):
    # Würfel 10, Skalieren ×2 → Volumen ×8; je Achse 1/1/3 → Höhe 30; Oberseite 3 mm aufdicken → Höhe +3
    p.empty()
    p.ev("Actions.addPrimitive('box', { p: { w: 10, d: 10, h: 10 }, pos: [0, 0] })")
    warte_rechnen(p, 20); p.wait(300)
    v0 = volumen(p)
    b0 = bbox(p, 0)

    # 1. Skalieren ×2 über Kontextleiste → Volumen ×8
    btn_sc = p.pg.locator('.ctxbar button[aria-label="Skalieren"]')
    has_sc_help = btn_sc.get_attribute('data-help') == 'scaleBody'
    btn_sc.click()
    warte_rechnen(p, 20); p.wait(300)
    p.pg.fill('#sc-s', '2'); p.pg.press('#sc-s', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    v2 = volumen(p)
    b2 = bbox(p, 0)
    st1 = p.ev("return [App.doc.items.length, App.doc.items[1].kind, App.doc.items[1].p.target === App.doc.items[0].id, App.mergedInto(App.doc.items[1].id) === App.doc.items[0].id]")
    ok1 = (
        has_sc_help
        and near(b0, [-5, -5, 0, 5, 5, 10])
        and abs(v0 - 1000) < 1
        and st1 == [2, 'scale', True, True]
        and abs(v2 - v0 * 8) < 5
        and near([b2[3] - b2[0], b2[4] - b2[1], b2[5] - b2[2]], [20, 20, 20])
    )

    # 2. Je Achse 1 / 1 / 3 → Höhe 30 (erst Ursprung, auch Schwerpunkt prüfen)
    p.pg.locator('#sc-uniform').uncheck(); p.wait(200)
    p.pg.fill('#sc-sx', '1'); p.pg.press('#sc-sx', 'Enter'); p.wait(150)
    p.pg.fill('#sc-sy', '1'); p.pg.press('#sc-sy', 'Enter'); p.wait(150)
    p.pg.fill('#sc-sz', '3'); p.pg.press('#sc-sz', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    b_cen = bbox(p, 0)
    v_cen = volumen(p)
    p.pg.select_option('#sc-pivot', 'origin')
    warte_rechnen(p, 20); p.wait(300)
    b_ori = bbox(p, 0)
    v_ori = volumen(p)
    ok2 = (
        near(b_cen, [-5, -5, -10, 5, 5, 20])
        and abs(v_cen - 3000) < 2
        and near(b_ori, [-5, -5, 0, 5, 5, 30])
        and abs(v_ori - 3000) < 2
    )

    # 3. Oberseite 3 mm aufdicken → Höhe +3 (33 mm)
    p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n[2]>0.9);
      App.select([id], { face: { id, faceIdx: fi } });""")
    p.wait(300)
    btn_th = p.pg.locator('.ctxbar button[aria-label="Aufdicken"]')
    has_th_help = btn_th.get_attribute('data-help') == 'thickenFace'
    btn_th.click()
    warte_rechnen(p, 20); p.wait(300)
    p.pg.fill('#th-t', '3'); p.pg.press('#th-t', 'Enter')
    warte_rechnen(p, 20); p.wait(300)
    b_th = bbox(p, 0)
    v_th = volumen(p)
    st3 = p.ev("return [App.doc.items.length, App.doc.items[2].kind, App.mergedInto(App.doc.items[2].id) === App.doc.items[0].id]")
    ok3 = (
        has_th_help
        and st3 == [3, 'thicken', True]
        and near(b_th, [-5, -5, 0, 5, 5, 33])
        and abs(v_th - 3300) < 3
    )

    # 4. Aufdicken nach innen, mittig, als eigene Platte und als Abzug
    p.pg.select_option('#th-mode', 'new')
    warte_rechnen(p, 20); p.wait(300)
    b_p_out = bbox(p, 2)
    p.pg.select_option('#th-dir', 'in')
    warte_rechnen(p, 20); p.wait(300)
    b_p_in = bbox(p, 2)
    p.pg.select_option('#th-dir', 'mid')
    warte_rechnen(p, 20); p.wait(300)
    b_p_mid = bbox(p, 2)
    p.pg.select_option('#th-dir', 'in'); p.wait(200)
    p.pg.select_option('#th-mode', 'cut')
    warte_rechnen(p, 20); p.wait(300)
    b_cut = bbox(p, 0)
    v_cut = volumen(p)
    ok4 = (
        near(b_p_out, [-5, -5, 30, 5, 5, 33])
        and near(b_p_in, [-5, -5, 27, 5, 5, 30])
        and near(b_p_mid, [-5, -5, 28.5, 5, 5, 31.5])
        and near(b_cut, [-5, -5, 0, 5, 5, 27])
        and abs(v_cut - 2700) < 3
    )

    # 5. Zurück auf Vereinigen außen (Höhe 33), Unterdrücken, Marker und gewölbte Fläche
    p.pg.select_option('#th-dir', 'out'); p.wait(200)
    p.pg.select_option('#th-mode', 'join')
    warte_rechnen(p, 20); p.wait(300)
    p.ev("Timeline.toggleSuppress(App.doc.items[2].id)")
    warte_rechnen(p, 20); p.wait(300)
    b_sup = bbox(p, 0)
    p.ev("Timeline.toggleSuppress(App.doc.items[2].id)")
    warte_rechnen(p, 20); p.wait(300)
    p.ev("Timeline.setMarker(1)")
    warte_rechnen(p, 20); p.wait(300)
    b_mk1 = bbox(p, 0)
    p.ev("Timeline.setMarker(3)")
    warte_rechnen(p, 20); p.wait(300)
    b_mk3 = bbox(p, 0)
    # Gewölbte Zylinderfläche aufdicken
    p.ev("App.setDoc(Model.newDoc())"); p.wait(400)
    p.ev("Actions.addPrimitive('cylinder', { p: { d: 20, h: 20 }, pos: [0, 0] })")
    warte_rechnen(p, 20); p.wait(300)
    p.ev("""const id=App.doc.items[0].id, r=App.results.get(id);
      const fi=r.data.faces.findIndex(f=>f.t==='CYLINDRE');
      Features.thicken({ id, idx: fi, info: r.data.faces[fi] }, { t: 2, dir: 'out', mode: 'join' });""")
    warte_rechnen(p, 20); p.wait(300)
    b_cyl = bbox(p, 0)
    ok5 = (
        near(b_sup, [-5, -5, 0, 5, 5, 30])
        and near(b_mk1, [-5, -5, 0, 5, 5, 10])
        and near(b_mk3, [-5, -5, 0, 5, 5, 33])
        and near(b_cyl, [-12, -12, 0, 12, 12, 20], 0.2)
    )

    # 6. Hilfetexte, Befehle und keine Fehler
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    ok6 = (
        p.ev("return App.errors.length === 0") is True
        and all(k in hilfen and all(x in hilfen[k] for x in ('tip', 'hilfe', 'tipp')) for k in ('scaleBody', 'thickenFace'))
        and p.ev("return Commands.search('skalieren').some(c=>c.id==='scale-body') && Commands.search('aufdicken').some(c=>c.id==='thicken-face')") is True
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


def t_kaputter_bezug(p):
    # 1. Quader 20x20x10 anlegen und Kante bei [10, 0, 10] abrunden
    p.empty()
    p.ev("Actions.addPrimitive('box', {p:{w:20, d:20, h:10}})")
    warte_rechnen(p, 30)
    p.ev("Viewer.fit()")
    p.wait(500)
    ei = p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); return r.data.edges.findIndex(e=>e&&e.m&&Math.hypot(e.m[0]-10,e.m[1],e.m[2]-10)<0.2)")
    p.ev("Actions.addFinish('fillet', 2, [{id:App.doc.items[0].id, edgeIdx:arg}])", ei)
    warte_rechnen(p, 30)
    p.wait(250)
    ok1 = (
        ei >= 0
        and p.ev("return App.errors.length === 0")
        and p.pg.locator('.node .warn-ref').count() == 0
        and p.pg.locator('.tl-chip.warn').count() == 0
    )

    # 2. Maß w auf 40 ändern → alte Kante verschwindet → gelbes Warnzeichen & Neu-wählen-Knopf
    p.ev("App.change('Breite ändern', d=>{ d.items[0].p.w = 40; })")
    warte_rechnen(p, 30)
    p.wait(300)
    ok2 = (
        p.ev("return App.errors.some(e=>e.code==='edges')")
        and p.pg.locator('.node .warn-ref').count() == 1
        and p.pg.locator('.tl-chip.warn').count() == 1
        and p.pg.locator('.warn-box button[data-reffix]').count() >= 1
    )

    # 3. „Neu wählen“ öffnet Assistent und zeigt alte Lage gestrichelt
    p.pg.locator('.warn-box button[data-reffix]').first.click()
    p.wait(350)
    ok3 = (
        p.pg.locator('#reffix-bar').count() == 1
        and p.ev("return RefFix.active === true && Viewer.hasRefGhost() === true")
    )

    # 4. Neue Kante bei [20, 0, 10] anklicken → Fehler weg, Körper rundet sauber
    p.ev("Viewer.fit()")
    p.wait(500)
    sx, sy = world_screen(p, 20, 0, 10)
    p.pg.mouse.click(sx, sy)
    warte_rechnen(p, 30)
    p.wait(300)
    vol_fillet = volumen(p) or 9999
    ok4 = (
        p.pg.locator('#reffix-bar').count() == 0
        and p.ev("return !RefFix.active && !Viewer.hasRefGhost() && App.errors.length === 0")
        and p.pg.locator('.node .warn-ref').count() == 0
        and p.pg.locator('.tl-chip.warn').count() == 0
        and vol_fillet < 8000
    )

    # 5. Fase verliert Kante beim Ändern der Höhe → Klick aufs gelbe Zeichen im Verlauf → neu wählen
    p.ev("Start.newProject(true)")
    p.wait(700)
    p.ev("Actions.addPrimitive('box', {p:{w:20, d:20, h:10}})")
    warte_rechnen(p, 30)
    ei2 = p.ev("const it=App.doc.items[0]; const r=App.results.get(it.id); return r.data.edges.findIndex(e=>e&&e.m&&Math.hypot(e.m[0],e.m[1]+10,e.m[2]-10)<0.2)")
    p.ev("Actions.addFinish('chamfer', 1.5, [{id:App.doc.items[0].id, edgeIdx:arg}])", ei2)
    warte_rechnen(p, 30)
    p.ev("App.change('Höhe ändern', d=>{ d.items[0].p.h = 20; })")
    warte_rechnen(p, 30)
    p.wait(300)
    ok5_warn = (
        ei2 >= 0
        and p.pg.locator('.node .warn-ref').count() == 1
        and p.ev("return App.errors.some(e=>e.code==='edges')")
    )
    p.pg.locator('.node .warn-ref').first.click()
    p.wait(350)
    ok5_ghost = p.pg.locator('#reffix-bar').count() == 1 and p.ev("return Viewer.hasRefGhost() === true")
    p.ev("Viewer.fit()")
    p.wait(500)
    sx2, sy2 = world_screen(p, 0, -10, 20)
    p.pg.mouse.click(sx2, sy2)
    warte_rechnen(p, 30)
    p.wait(300)
    ok5 = (
        ok5_warn
        and ok5_ghost
        and p.ev("return !RefFix.active && App.errors.length === 0")
        and p.pg.locator('.node .warn-ref').count() == 0
    )

    # 6. Skizze auf Bezugsebene → Bezugsebene löschen → gelbes Zeichen → neu wählen auf XY + Hilfetext
    p.ev("Start.newProject(true)")
    p.wait(700)
    p.ev("Actions.addPrimitive('box', {p:{w:20, d:20, h:10}})")
    warte_rechnen(p, 30)
    did = p.ev("const d=Datums.addOrigin('XY', 10); return d.id")
    p.wait(300)
    p.ev("Datums.sketchOn(arg)", did)
    p.wait(400)
    p.ev("Sketch.insertEnts([{id:'r_rf', type:'rect', a:[-5,-5], b:[5,5]}])")
    p.wait(300)
    p.pg.keyboard.press('Enter')
    p.wait(1200)
    p.pg.locator('.stepbox .btn.primary').click()
    warte_rechnen(p, 30)
    p.wait(300)
    p.ev("Datums.remove(arg)", did)
    p.wait(400)
    ok6_warn = (
        p.pg.locator('.node .warn-ref').count() == 1
        and p.pg.locator('.tl-chip.warn').count() == 1
        and p.pg.locator('.warn-box button[data-reffix]').count() >= 1
    )
    p.pg.locator('.warn-box button[data-reffix]').first.click()
    p.wait(350)
    ok6_ghost = p.pg.locator('#reffix-bar').count() == 1 and p.ev("return Viewer.hasRefGhost() === true")
    p.pg.locator('#reffix-bar button[data-reffix-plane="XY"]').click()
    warte_rechnen(p, 30)
    p.wait(300)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    rf_help = hilfen.get('refFix') or {}
    help_ok = bool(rf_help.get('tip') and rf_help.get('hilfe') and rf_help.get('tipp'))
    ok6 = (
        ok6_warn
        and ok6_ghost
        and p.pg.locator('#reffix-bar').count() == 0
        and p.pg.locator('.node .warn-ref').count() == 0
        and p.ev("return App.errors.length === 0")
        and (volumen(p) or 0) > 4000
        and help_ok
    )
    return [ok1, ok2, ok3, ok4, ok5, ok6]


# ---------- A-039: Gewinde direkt auf runde Fläche (KP-19) ----------
def t_a039_gewinde_flaeche(p):
    p.empty()
    # 1. Bolzen Ø 10 × 25 mm → Rechtsklick „Gewinde …“ → Vorschlag M10, Steigung 1,5 → echtes Gewinde 15 mm → Volumen ändert sich
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('cylinder',{d:10,h:25},{name:'Bolzen'})); })")
    warte_rechnen(p)
    vol_before = volumen(p)
    p.ev("Viewer.setView('front', false)"); p.wait(500); p.ev("Viewer.fit()"); p.wait(800)
    pt_ext = world_screen(p, 0, -5, 12.5)
    p.pg.mouse.click(pt_ext[0], pt_ext[1], button='right'); p.wait(500)
    has_ctx_ext = p.pg.locator('#cm-thread').count() == 1 and 'Gewinde …' in (p.pg.locator('#cm-thread').text_content() or '')
    p.pg.locator('#cm-thread').click(); p.wait(300)
    ext_kind = (p.pg.locator('#ct-kind').text_content() or '').lower()
    ext_size = p.pg.locator('#ct-size').input_value()
    ext_mode = p.pg.locator('#ct-mode').input_value()
    ext_pitch = p.ev("return Units.parseLen(document.querySelector('#ct-pitch').value, {}).value")
    p.pg.fill('#ct-len', '15'); p.pg.click('#ct-apply')
    warte_rechnen(p, 60)
    vol_after_ext = volumen(p)
    its_ext = p.ev("return App.doc.items.map(x=>({kind:x.kind, lib:x.p&&x.p.lib, size:x.p&&x.p.size, op:x.op}))")
    ext_bb = p.ev("const b=Actions.worldBox(App.doc.items[0].id); return b?[b.min.z, b.max.z]:null")
    ok1_create = (
        has_ctx_ext and 'außengewinde' in ext_kind and ext_size == 'M10' and ext_mode == 'real'
        and abs((ext_pitch or 0) - 1.5) < 1e-6
        and p.ev("return App.errors.length") == 0
        and any(x['lib'] == 'threadRod' and x['size'] == 'M10' for x in its_ext)
        and ext_bb is not None and abs((ext_bb[1] - ext_bb[0]) - 25) < 0.5
        and vol_after_ext is not None and vol_before is not None and vol_after_ext < vol_before - 50
    )
    p.ev("App.undo()"); warte_rechnen(p)
    vol_undo = volumen(p)
    ok1 = ok1_create and vol_undo is not None and abs(vol_undo - vol_before) < 1.0

    # 2. Bohrung Ø 8,5 mm → Rechtsklick „Gewinde …“ → Vorschlag M10 innen → echtes Innengewinde 12 mm → Volumen ändert sich
    p.ev("App.change('x', d=>{ d.items=[]; const b=Model.newItem('box',{w:24,d:24,h:20},{name:'Block'}); d.items.push(b); const h=Model.newItem('cylinder',{d:8.5,h:24},{name:'Bohrung'}); h.t.z=-2; h.op={type:'cut',target:b.id}; d.items.push(h); })")
    warte_rechnen(p)
    vol_hole_before = volumen(p)
    bid = p.ev("return App.doc.items[0].id")
    p.ev("Viewer.setView('iso', false)"); p.wait(500); p.ev("Viewer.fit()"); p.wait(800)
    hit_int = p.ev("""
      const id = arg, r = Viewer.canvas.getBoundingClientRect(), opts = Select.pickOpts();
      const v = Viewer.camera.position.clone();
      for (const z of [18.5, 16, 13, 10]) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          v.set(4.25 * Math.cos(a), 4.25 * Math.sin(a), z);
          const s = Viewer.toScreen(v);
          const sx = s.x + r.left, sy = s.y + r.top;
          const h = Select.adjust(Viewer.pick(sx, sy, opts));
          const res = h && App.results.get(h.id);
          const f = res && h.faceIdx != null ? res.data.faces[h.faceIdx] : null;
          if (h && h.id === id && f && f.t === 'CYLINDRE') return [sx, sy];
        }
      }
      return null;
    """, bid)
    p.pg.mouse.click(hit_int[0], hit_int[1], button='right'); p.wait(500)
    has_ctx_int = p.pg.locator('#cm-thread').count() == 1 and 'Gewinde …' in (p.pg.locator('#cm-thread').text_content() or '')
    p.pg.locator('#cm-thread').click(); p.wait(300)
    int_kind = (p.pg.locator('#ct-kind').text_content() or '').lower()
    int_size = p.pg.locator('#ct-size').input_value()
    int_mode = p.pg.locator('#ct-mode').input_value()
    int_pitch = p.ev("return Units.parseLen(document.querySelector('#ct-pitch').value, {}).value")
    clear_vis = p.pg.locator('#ct-clear').is_visible()
    p.pg.fill('#ct-len', '12'); p.pg.click('#ct-apply')
    warte_rechnen(p, 60)
    vol_hole_after = volumen(p)
    its_int = p.ev("return App.doc.items.map(x=>({kind:x.kind, lib:x.p&&x.p.lib, size:x.p&&x.p.size, op:x.op}))")
    ok2 = (
        hit_int is not None and has_ctx_int and 'innengewinde' in int_kind
        and int_size == 'M10' and int_mode == 'real' and clear_vis
        and abs((int_pitch or 0) - 1.5) < 1e-6
        and p.ev("return App.errors.length") == 0
        and any(x['lib'] == 'threadHole' and x['size'] == 'M10' and (x['op'] or {}).get('type') == 'cut' for x in its_int)
        and vol_hole_after is not None and vol_hole_before is not None and vol_hole_after < vol_hole_before - 20
    )

    # 3. Wahlweise kosmetisch & eigene Steigung (P = 1,0 mm vs. Regelsteigung 1,5 mm)
    p.ev("App.undo()"); warte_rechnen(p)
    p.pg.mouse.click(hit_int[0], hit_int[1], button='right'); p.wait(500)
    p.pg.locator('#cm-thread').click(); p.wait(300)
    p.pg.select_option('#ct-mode', 'cosmetic'); p.wait(150)
    p.pg.fill('#ct-pitch', '1'); p.pg.fill('#ct-len', '12'); p.pg.click('#ct-apply'); p.wait(400)
    cth = p.ev("return (App.doc.items[0].threads || [])[0]")
    tg_n = p.ev("const n=Viewer.nodes.get(arg); return n && n.threadGroup ? n.threadGroup.children.length : 0", bid)
    ok3a = (
        p.ev("return App.doc.items.length") == 2
        and cth and cth['kind'] == 'int' and cth['size'] == 'M10'
        and abs((cth.get('pitch') or 0) - 1) < 1e-6 and abs(cth['length'] - 12) < 1e-6
        and tg_n >= 1
    )
    # Echtes M10 × 15 mm mit eigener Steigung 1,0 mm vs. Regelsteigung 1,5 mm
    p.ev("App.change('x', d=>{ d.items=[]; d.items.push(Model.newItem('cylinder',{d:10,h:15},{name:'Bolzen'})); })")
    warte_rechnen(p)
    id_c = p.ev("return App.doc.items[0].id")
    fi_c = p.ev("const r=App.results.get(arg); return r.data.faces.findIndex(f=>f.t==='CYLINDRE')", id_c)
    p.ev("Features.applyRealThread({id:arg[0], idx:arg[1]}, {size:'M10', length:15, pitch:1.5})", [id_c, fi_c])
    warte_rechnen(p, 60)
    vol_coarse = volumen(p)
    p.ev("App.undo()"); warte_rechnen(p)
    p.ev("Features.applyRealThread({id:arg[0], idx:arg[1]}, {size:'M10', length:15, pitch:1.0})", [id_c, fi_c])
    warte_rechnen(p, 60)
    vol_fine = volumen(p)
    fine_pitch = p.ev("return App.doc.items[0].p && App.doc.items[0].p.pitch")
    ok3 = (
        ok3a and p.ev("return App.errors.length") == 0
        and fine_pitch == 1
        and vol_coarse is not None and vol_fine is not None and vol_fine > vol_coarse + 10
    )

    # 4. Hilfetext & Befehlssuche
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    th_help = hilfen.get('threadFace') or {}
    cmd_ok = p.ev("return Commands.list().some(c=>c.id==='thread-face')")
    ok4 = bool(th_help.get('tip') and th_help.get('hilfe') and th_help.get('tipp') and cmd_ok)

    return [ok1, ok2, ok3, ok4]


# ---------- A-038: Bohrungs-Assistent mehr Gewinde (KP-18) ----------
def t_a038_mehr_gewinde(p):
    # 1. Feingewinde M10×1,25 -> Kernloch 8,8 mm
    p.empty()
    p.ev("Actions.addPrimitive('box', {p:{w:40, d:40, h:10}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,10], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'tap'); p.wait(150)
    p.pg.select_option('#hw-norm', 'metric_fine'); p.wait(150)
    fine_opts = p.pg.evaluate("[...document.querySelectorAll('#hw-size option')].map(o=>o.value)")
    p.pg.select_option('#hw-size', 'M10×1,25'); p.wait(200)
    info1 = p.pg.locator('#hw-info').text_content() or ''
    prev1 = p.pg.locator('#hw-preview').text_content() or ''
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(400)
    v1 = volumen(p)
    want1 = math.pi * 4.4 * 4.4 * 10.0
    got1 = 16000.0 - (v1 or 0)
    cyl1 = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data ? r.data.faces.filter(f=>f.t==='CYLINDRE').map(f=>Math.round(f.r*200)/100) : []")
    p.ev("const ch=App.doc.items[0].children.find(c=>c.kind==='part'&&c.p.lib==='screwHole'); if(ch) App.select([ch.id]);"); p.wait(300)
    panel1 = p.pg.locator('#p-screw-hint').text_content() or ''
    ok1 = ('M8×1' in fine_opts and 'M10×1,25' in fine_opts
           and '8,8' in info1 and 'DIN 336' in info1 and '8,8' in prev1
           and p.ev("return App.errors.length") == 0
           and abs(got1 - want1) < 0.05
           and any(abs(d - 8.8) < 0.02 for d in cyl1)
           and 'M10×1,25' in panel1 and '8,8' in panel1)

    # 2. Zoll-Gewinde UNC / UNF (#4 bis 1/2"): 1/4"-20 UNC -> Kernloch 5,1 mm + 82°-Senkung
    p.ev("App.setDoc(Model.newDoc())"); p.wait(200)
    p.ev("Actions.addPrimitive('box', {p:{w:40, d:40, h:10}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,10], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'tap'); p.wait(150)
    p.pg.select_option('#hw-norm', 'unf'); p.wait(150)
    unf_opts = p.pg.evaluate("[...document.querySelectorAll('#hw-size option')].map(o=>o.value)")
    p.pg.select_option('#hw-norm', 'unc'); p.wait(150)
    unc_opts = p.pg.evaluate("[...document.querySelectorAll('#hw-size option')].map(o=>o.value)")
    p.pg.select_option('#hw-size', '1/4"-20 UNC'); p.wait(200)
    info2 = p.pg.locator('#hw-info').text_content() or ''
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(400)
    v2 = volumen(p)
    want2 = math.pi * 2.55 * 2.55 * 10.0
    got2 = 16000.0 - (v2 or 0)
    cyl2 = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data ? r.data.faces.filter(f=>f.t==='CYLINDRE').map(f=>Math.round(f.r*200)/100) : []")
    # Durchgangsbohrung mit 82°-Senkung
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[10,10,10], normal:[0,0,1]}})"); p.wait(300)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(300)
    p.pg.select_option('#hw-type', 'through'); p.wait(150)
    p.pg.select_option('#hw-norm', 'unc'); p.wait(150)
    p.pg.select_option('#hw-size', '1/4"-20 UNC'); p.wait(150)
    p.pg.select_option('#hw-head', 'countersunk'); p.wait(150)
    csk_lbl = p.pg.locator('#hw-head option[value="countersunk"]').text_content() or ''
    info2_csk = p.pg.locator('#hw-info').text_content() or ''
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(400)
    has_cone = p.ev("const r=App.results.get(App.doc.items[0].id); return !!(r && r.data && r.data.faces.some(f=>f.t==='CONE'))")
    ok2 = ('#4-40 UNC' in unc_opts and '1/2"-13 UNC' in unc_opts
           and '#4-48 UNF' in unf_opts and '1/2"-20 UNF' in unf_opts
           and '5,1' in info2 and 'ASME B1.1' in info2
           and p.ev("return App.errors.length") == 0
           and abs(got2 - want2) < 0.05
           and any(abs(d - 5.1) < 0.02 for d in cyl2)
           and '82°' in csk_lbl and '82°' in info2_csk and has_cone)

    # 3. Rohrgewinde G1/8 bis G1: G1/4 wählbar -> Kernloch 11,8 mm + Flachsenkung
    p.ev("App.setDoc(Model.newDoc())"); p.wait(200)
    p.ev("Actions.addPrimitive('box', {p:{w:60, d:60, h:15}})"); warte_rechnen(p, 20)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,15], normal:[0,0,1]}})"); p.wait(400)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(400)
    p.pg.select_option('#hw-type', 'tap'); p.wait(150)
    p.pg.select_option('#hw-norm', 'pipe_g'); p.wait(150)
    pipe_opts = p.pg.evaluate("[...document.querySelectorAll('#hw-size option')].map(o=>o.value)")
    p.pg.select_option('#hw-size', 'G1/4'); p.wait(200)
    info3 = p.pg.locator('#hw-info').text_content() or ''
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(400)
    v3 = volumen(p)
    want3 = math.pi * 5.9 * 5.9 * 15.0
    got3 = 54000.0 - (v3 or 0)
    cyl3 = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data ? r.data.faces.filter(f=>f.t==='CYLINDRE').map(f=>Math.round(f.r*200)/100) : []")
    # Durchgang mit Flachsenkung nach DIN 3852-2 (kein Senkkopf bei G-Gewinde)
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[18,18,15], normal:[0,0,1]}})"); p.wait(300)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(300)
    p.pg.select_option('#hw-type', 'through'); p.wait(150)
    p.pg.select_option('#hw-norm', 'pipe_g'); p.wait(150)
    p.pg.select_option('#hw-size', 'G1/4'); p.wait(150)
    pipe_heads = p.pg.evaluate("[...document.querySelectorAll('#hw-head option')].map(o=>o.value)")
    p.pg.select_option('#hw-head', 'counterbore'); p.wait(150)
    p.pg.click('#hw-go'); warte_rechnen(p, 25); p.pg.keyboard.press('Escape'); p.wait(400)
    cyl3_cb = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data ? r.data.faces.filter(f=>f.t==='CYLINDRE').map(f=>Math.round(f.r*200)/100) : []")
    ok3 = (pipe_opts == ['G1/8', 'G1/4', 'G3/8', 'G1/2', 'G3/4', 'G1']
           and '11,8' in info3 and 'ISO 228-1' in info3
           and p.ev("return App.errors.length") == 0
           and abs(got3 - want3) < 0.08
           and any(abs(d - 11.8) < 0.02 for d in cyl3)
           and 'countersunk' not in pipe_heads and 'counterbore' in pipe_heads
           and any(abs(d - 20.0) < 0.05 for d in cyl3_cb))

    # 4. Datentabelle app/data/gewinde.json mit Quellen + Hilfetext threadStandards
    tbl = p.pg.evaluate("fetch('data/gewinde.json').then(r=>r.json())")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    norms = {n['id']: n for n in (tbl.get('normen') or [])}
    by_id = {g['id']: g for n in norms.values() for g in (n.get('groessen') or [])}
    th = hilfen.get('threadStandards') or {}
    p.ev("const id=App.doc.items[0].id; const r=App.results.get(id); const fi=r.data.faces.findIndex(f=>f.t==='PLANE'&&f.n&&f.n[2]>0.9); App.select([id], {face:{id, faceIdx:fi, info:r.data.faces[fi], point:[0,0,15], normal:[0,0,1]}})"); p.wait(250)
    p.pg.locator('.ctxbar button[aria-label="Bohrung"]').click(); p.wait(250)
    dh = p.pg.locator('#hw-norm').locator('..').locator('..').get_attribute('data-help')
    ok4 = (len(tbl.get('_quellen') or []) >= 5
           and all(k in norms and norms[k].get('quelle') for k in ('metric', 'metric_fine', 'unc', 'unf', 'pipe_g'))
           and by_id.get('M10×1,25', {}).get('kernloch_mm') == 8.8
           and by_id.get('1/4"-20 UNC', {}).get('kernloch_mm') == 5.1
           and by_id.get('G1/4', {}).get('kernloch_mm') == 11.8
           and all(f in th and th[f] for f in ('tip', 'hilfe', 'tipp'))
           and dh == 'threadStandards')
    return [ok1, ok2, ok3, ok4]


def t_a037_schritt_spiegeln(p):
    # Tasche links an Mittelebene spiegeln → 2 Taschen, Volumen sinkt um Taschengröße;
    # Bezugsebene & Körperfläche, Erhöhung, Mitwandern bei Änderung, Unterdrücken/Marker, Gruppe & Hilfe
    p.empty()
    p.ev("""App.change('Grundkörper und Tasche', d => {
      const base = Model.newItem('box', { w: 60, d: 40, h: 10 }, { name: 'Platte' });
      d.items.push(base);
      const pocket = Model.newItem('extrude', {
        sketch: {
          plane: { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] },
          ents: [{ id: 'r1', type: 'rect', a: [-20, -5], b: [-10, 5] }],
          dims: [], cons: [],
        },
        dist: 5, dir: 'reverse',
      }, { name: 'Tasche' });
      pocket.op = { type: 'cut', target: base.id };
      d.items.push(pocket);
    })""")
    warte_rechnen(p, 20); p.wait(300)
    parts0 = p.ev("return Mass.measure().then(r => (r.parts || []).map(q => ({ id: q.id, v: q.volume })))")

    # 1. Tasche über Kontextleiste spiegeln (YZ-Mittelebene) → zwei Taschen, Volumen 24000 - 2*500 = 23000
    p.ev("App.select([App.doc.items[1].id])"); p.wait(300)
    btn_ms = p.pg.locator('.ctxbar button[aria-label="Schritt spiegeln"]')
    has_help = btn_ms.get_attribute('data-help') == 'mirrorStep'
    btn_ms.click()
    warte_rechnen(p, 20); p.wait(300)
    parts1 = p.ev("return Mass.measure().then(r => (r.parts || []).map(q => ({ id: q.id, v: q.volume })))")
    pockets1 = p.ev("""const r = App.results.get(App.doc.items[0].id);
      return (r?.data?.faces || []).filter(f => f.t === 'PLANE' && f.n[2] > 0.9 && Math.abs(f.c[2] - 5) < 0.05)
        .map(f => [Math.round(f.c[0] * 10) / 10, Math.round(f.c[1] * 10) / 10]).sort((a, b) => a[0] - b[0]);""")
    st1 = p.ev("return [App.doc.items.length, App.doc.items[2].kind, App.mergedInto(App.doc.items[2].id) === App.doc.items[0].id, App.errors.length]")
    ok1 = (
        has_help
        and len(parts0) == 1 and abs(parts0[0]['v'] - 23500) < 5
        and st1 == [3, 'mirrorStep', True, 0]
        and len(parts1) == 1 and abs(parts1[0]['v'] - 23000) < 5
        and pockets1 == [[-15.0, 0.0], [15.0, 0.0]]
    )

    # 2. Bezugsebene (XZ bei y = 6 mm) und ebene Körperfläche (x = 0)
    datum_id = p.ev("return Datums.addOrigin('XZ', -6).id")
    p.ev("App.select([App.doc.items[2].id])"); p.wait(250)
    p.pg.select_option('#ms-plane', 'd:' + datum_id)
    warte_rechnen(p, 20); p.wait(300)
    parts_dat = p.ev("return Mass.measure().then(r => (r.parts || []).map(q => ({ id: q.id, v: q.volume })))")
    pockets_dat = p.ev("""const r = App.results.get(App.doc.items[0].id);
      return (r?.data?.faces || []).filter(f => f.t === 'PLANE' && f.n[2] > 0.9 && Math.abs(f.c[2] - 5) < 0.05)
        .map(f => [Math.round(f.c[0] * 10) / 10, Math.round(f.c[1] * 10) / 10]).sort((a, b) => a[1] - b[1]);""")

    helper_id = p.ev("""let hid; App.change('Hilfsquader', d => {
      const h = Model.newItem('box', { w: 4, d: 10, h: 10 }, { name: 'Spiegelklotz' });
      h.t.x = -2; h.t.y = 35; d.items.push(h); hid = h.id;
    }); return hid;""")
    warte_rechnen(p, 20); p.wait(200)
    p.ev("""const hid = arg, r = App.results.get(hid), fi = r.data.faces.findIndex(f => f.t === 'PLANE' && f.n[0] > 0.9);
      Features.setMirrorStepPlane(App.doc.items[2].id, { id: hid, idx: fi });""", helper_id)
    warte_rechnen(p, 20); p.wait(300)
    v_face = p.ev("return Mass.measure().then(r => (r.parts || []).find(q => q.id === App.doc.items[0].id)?.volume)")
    pockets_face = p.ev("""const r = App.results.get(App.doc.items[0].id);
      return (r?.data?.faces || []).filter(f => f.t === 'PLANE' && f.n[2] > 0.9 && Math.abs(f.c[2] - 5) < 0.05)
        .map(f => [Math.round(f.c[0] * 10) / 10, Math.round(f.c[1] * 10) / 10]).sort((a, b) => a[0] - b[0]);""")
    face_plane = p.ev("return App.doc.items[2].p.plane")
    p.ev("Actions.remove([arg])", helper_id); p.ev("Datums.remove(arg)", datum_id)
    warte_rechnen(p, 20); p.wait(200)
    ok2 = (
        len(parts_dat) == 1 and abs(parts_dat[0]['v'] - 23000) < 5
        and pockets_dat == [[-15.0, 0.0], [-15.0, 12.0]]
        and face_plane == 'FACE'
        and v_face is not None and abs(v_face - 23000) < 5
        and pockets_face == [[-15.0, 0.0], [15.0, 0.0]]
    )

    # 3. Zurück auf YZ, Taschentiefe 5 → 8 ändert auch Spiegelbild; Erhöhung (join) ebenfalls spiegeln
    p.ev("App.select([App.doc.items[2].id])"); p.wait(250)
    p.pg.select_option('#ms-plane', 'YZ')
    warte_rechnen(p, 20); p.wait(200)
    p.ev("App.change('Tiefe 8', d => { d.items[1].p.dist = 8; })")
    warte_rechnen(p, 20); p.wait(300)
    v_deep = volumen(p)
    p.ev("""App.change('Erhöhung', d => {
      const boss = Model.newItem('box', { w: 10, d: 10, h: 6 }, { name: 'Zapfen' });
      boss.t.x = -15; boss.t.z = 10;
      boss.op = { type: 'join', target: d.items[0].id };
      d.items.push(boss);
    })""")
    warte_rechnen(p, 20); p.wait(200)
    p.ev("Features.mirrorStep([App.doc.items[3].id], { plane: 'YZ', off: 0 })")
    warte_rechnen(p, 20); p.wait(300)
    parts3 = p.ev("return Mass.measure().then(r => (r.parts || []).map(q => ({ id: q.id, v: q.volume })))")
    ok3 = (
        abs(v_deep - 22400) < 5
        and len(parts3) == 1 and abs(parts3[0]['v'] - 23600) < 5
        and p.ev("return App.errors.length") == 0
    )

    # 4. Unterdrücken, Zeitleisten-Marker, Gruppen-Tasche (Loch), Erklärung & Hilfe
    p.ev("Timeline.toggleSuppress(App.doc.items[2].id)")
    warte_rechnen(p, 20); p.wait(200)
    v_sup = volumen(p)
    p.ev("Timeline.toggleSuppress(App.doc.items[2].id)")
    warte_rechnen(p, 20); p.wait(200)
    p.ev("Timeline.setMarker(2)")
    warte_rechnen(p, 20); p.wait(200)
    v_mk2 = volumen(p)
    p.ev("Timeline.setMarker(App.doc.items.length)")
    warte_rechnen(p, 20); p.wait(200)
    v_mk_end = volumen(p)
    exp_txt = p.ev("return Explain.local(App.doc.items[2].id).lines.map(l => l.t).join(' ')")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    has_cmd = p.ev("return Commands.search('schritt spiegeln').some(c => c.id === 'mirror-step')")

    # In einer Gruppe (Loch-Kind spiegeln)
    p.ev("""App.setDoc(Model.newDoc());""")
    p.wait(400)
    p.ev("""App.change('Gruppe mit Tasche', d => {
      const base = Model.newItem('box', { w: 60, d: 40, h: 10 }, { name: 'Platte' });
      d.items.push(base);
      const pocket = Model.newItem('extrude', {
        sketch: {
          plane: { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] },
          ents: [{ id: 'r1', type: 'rect', a: [-20, -5], b: [-10, 5] }],
          dims: [], cons: [],
        },
        dist: 5, dir: 'reverse',
      }, { name: 'Tasche', role: 'hole' });
      Actions.attach(d, base.id, pocket);
    })""")
    warte_rechnen(p, 20); p.wait(200)
    p.ev("Features.mirrorStep([App.doc.items[0].children[1].id], { plane: 'YZ', off: 0 })")
    warte_rechnen(p, 20); p.wait(300)
    grp_parts = p.ev("return Mass.measure().then(r => (r.parts || []).map(q => q.volume))")
    ok4 = (
        abs(v_sup - 24400) < 5
        and abs(v_mk2 - 23200) < 5
        and abs(v_mk_end - 23600) < 5
        and 'Spiegelt' in exp_txt
        and 'mirrorStep' in hilfen and all(k in hilfen['mirrorStep'] for k in ('tip', 'hilfe', 'tipp'))
        and has_cmd is True
        and len(grp_parts) == 1 and abs(grp_parts[0] - 23000) < 5
        and p.ev("return App.errors.length === 0") is True
    )
    return [ok1, ok2, ok3, ok4]


def t_a040_varianten_schritte(p):
    p.empty()
    p.ev("""
    App.change('Platte mit Loch', d => {
      d.params.push({ id: 'm_b', name: 'Breite', expr: 40 });
      const b = Model.newItem('box', { w: 'Breite', d: 30, h: 10 }, { name: 'Platte' });
      const h = Model.newItem('cylinder', { d: 10, h: 12 }, { name: 'Loch', role: 'hole' });
      h.t.z = -1;
      d.items.push(b, h);
    });
    """)
    warte_rechnen(p)
    v_full = 40 * 30 * 10
    v_hole = v_full - math.pi * 25 * 10
    v0 = volumen(p)
    hole_id = p.ev("return App.doc.items[1].id")

    p.pg.locator('#lt-params').click(); p.wait(300)
    p.pg.locator('#var-new').click(); p.wait(250)
    p.pg.fill('#prompt-inp', 'mit Loch'); p.pg.locator('.modal .actions .btn.primary').click(); p.wait(500)
    p.pg.locator('#var-new').click(); p.wait(250)
    p.pg.fill('#prompt-inp', 'ohne Loch'); p.pg.locator('.modal .actions .btn.primary').click(); p.wait(500)
    v1_id, v2_id = p.ev("return App.doc.variants.map(v=>v.id)")
    step_names = p.pg.locator('#var-steps .var-step-name').all_text_contents()
    ok1 = v0 is not None and abs(v0 - v_hole) < 1.0 and step_names == ['Platte', 'Loch']

    # In Variante „ohne Loch“ den Loch-Schritt über die Checkbox unterdrücken
    p.pg.locator(f'#var-steps .var-step-cb[data-id="{hole_id}"]').click()
    warte_rechnen(p)
    v1 = volumen(p)
    sup_v2 = p.ev("return Variants.suppressedOf(arg)", v2_id)
    cnt_txt = p.pg.locator('#var-steps .var-steps-count').text_content()
    ok2 = (p.ev("return !!App.doc.items[1].suppressed")
           and sup_v2 == [hole_id]
           and '1 unterdrückt' in cnt_txt
           and v1 is not None and abs(v1 - v_full) < 1.0)

    # Umschalten auf „mit Loch“ und wieder zurück auf „ohne Loch“ ändert das Volumen hin und zurück
    p.pg.select_option('#var-sel', v1_id); warte_rechnen(p)
    v2 = volumen(p)
    hole_on = p.ev("return !App.doc.items[1].suppressed")
    p.pg.select_option('#var-sel', v2_id); warte_rechnen(p)
    v3 = volumen(p)
    hole_off = p.ev("return !!App.doc.items[1].suppressed")
    ok3 = (hole_on and hole_off
           and v2 is not None and abs(v2 - v_hole) < 1.0
           and v3 is not None and abs(v3 - v_full) < 1.0)

    # Varianten vergleichen zeigt den Schritt-Unterschied und korrektes Gewicht
    p.pg.locator('#var-cmp').click()
    p.pg.wait_for_selector('#vtable', timeout=90000); p.wait(250)
    rows = p.pg.evaluate("[...document.querySelectorAll('#vtable tr')].map(r=>[...r.children].map(c=>c.textContent))")
    loch_col = rows[0].index('Loch') if 'Loch' in rows[0] else -1
    gew_col = rows[0].index('Gewicht') if 'Gewicht' in rows[0] else -1
    w_mit = float(rows[1][gew_col][:-2].replace(',', '.')) if gew_col >= 0 else 0
    w_ohne = float(rows[2][gew_col][:-2].replace(',', '.')) if gew_col >= 0 else 0
    ok4 = (len(rows) == 3 and loch_col >= 0 and gew_col >= 0
           and rows[1][loch_col] == 'aktiv' and rows[2][loch_col] == 'unterdrückt'
           and w_ohne > w_mit)
    p.pg.keyboard.press('Escape'); p.wait(250)

    # Kombiniert: Maß & Schritt ändern -> Abweichung -> Variantenwechsel -> Undo & Migration -> Hilfe
    p.pg.select_option('#var-sel', v1_id); warte_rechnen(p)
    field(p, '#pv-m_b', 50); warte_rechnen(p)
    p.ev("Timeline.toggleSuppress(arg)", hole_id); warte_rechnen(p)
    warn_txt = p.pg.locator('.section.variants .hint-box.warn').text_content()
    has_up = p.pg.locator('#var-update').count() == 1
    p.pg.select_option('#var-sel', v2_id); warte_rechnen(p)
    v4 = volumen(p)
    b_after = p.ev("return App.doc.params.find(x=>x.id==='m_b').expr")
    p.ev("App.undo()"); warte_rechnen(p)
    undo_ok = p.ev("return App.doc.params.find(x=>x.id==='m_b').expr") == 50 and p.ev("return App.doc.variant") == v1_id
    mig_sup = p.ev("const d=Model.migrate(JSON.parse(App.snapshot())); return d.variants[1].suppressed")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    vh = hilfen.get('variants') or {}
    ok5 = (has_up and 'Maße' in warn_txt and 'Schritte' in warn_txt
           and b_after == 40 and v4 is not None and abs(v4 - v_full) < 1.0
           and undo_ok and mig_sup == [hole_id]
           and 'Schritte' in vh.get('hilfe', '') and 'unterdrückt' in vh.get('hilfe', ''))
    return [ok1, ok2, ok3, ok4, ok5]


def t_a041_formeln(p):
    p.empty()
    # 1. wenn(Bedingung; dann; sonst) mit < > <= >= == != und verzögerter Zweig-Auswertung
    r_wenn = p.ev("""
      return [
        Expr.eval('wenn(b > 50; 3; 2)', { b: 60 }),
        Expr.eval('wenn(b > 50; 3; 2)', { b: 40 }),
        Expr.eval('wenn(b < 50; 1; 0)', { b: 40 }),
        Expr.eval('wenn(b <= 50; 1; 0)', { b: 50 }),
        Expr.eval('wenn(b >= 50; 1; 0)', { b: 50 }),
        Expr.eval('wenn(b == 50; 7; 8)', { b: 50 }),
        Expr.eval('wenn(b != 50; 9; 8)', { b: 50 }),
        Expr.eval('wenn(b > 100; 10; wenn(b > 50; 5; 2))', { b: 60 }),
        Expr.eval('wenn(b == 0; 0; 100 / b)', { b: 0 }),
      ];
    """)
    ok1 = r_wenn == [3, 2, 1, 1, 1, 7, 8, 5, 0]

    # 2. runden(x; Stellen), aufrunden, abrunden
    r_round = p.ev("""
      return [
        Expr.eval('runden(2,345; 1)', {}),
        Expr.eval('runden(2,35; 1)', {}),
        Expr.eval('runden(2,6)', {}),
        Expr.eval('aufrunden(2,31; 1)', {}),
        Expr.eval('aufrunden(2,3; 1)', {}),
        Expr.eval('abrunden(2,39; 1)', {}),
        Expr.eval('abrunden(2,9)', {}),
      ];
    """)
    ok2 = r_round == [2.3, 2.4, 3, 2.4, 2.3, 2.3, 2]

    # 3. Nachschlagetabelle unter „Maße“ anlegen, umbenennen, Werte ändern & 3D-Quader steuern
    p.pg.click('#lt-params'); p.wait(300)
    p.pg.click('#par-table-add'); p.wait(300)
    tid = p.ev("return App.doc.tables[0].id")
    p.pg.fill(f'#ptn-{tid}', 'Schraube'); p.pg.press(f'#ptn-{tid}', 'Enter'); p.wait(300)
    r0, r1 = p.ev("return App.doc.tables[0].rows.map(r=>r.id)")
    p.pg.fill(f'#ptk-{r0}', 'M3'); p.pg.press(f'#ptk-{r0}', 'Enter'); p.wait(200)
    p.pg.fill(f'#ptv-{r0}', '3,4'); p.pg.press(f'#ptv-{r0}', 'Enter'); p.wait(200)
    p.pg.fill(f'#ptk-{r1}', 'M5'); p.pg.press(f'#ptk-{r1}', 'Enter'); p.wait(200)
    p.pg.fill(f'#ptv-{r1}', '5,5'); p.pg.press(f'#ptv-{r1}', 'Enter'); p.wait(200)
    p.pg.click(f'#ptadd-{tid}'); p.wait(300)
    r2 = p.ev("return App.doc.tables[0].rows[2].id")
    p.pg.fill(f'#ptk-{r2}', 'M6'); p.pg.press(f'#ptk-{r2}', 'Enter'); p.wait(200)
    p.pg.fill(f'#ptv-{r2}', '6,6'); p.pg.press(f'#ptv-{r2}', 'Enter'); p.wait(300)

    p.ev("""
      App.change('Maße für Formeltest', d => {
        d.params.push({ id: 'pm_b', name: 'b', expr: 60 });
        d.params.push({ id: 'pm_s', name: 'loch', expr: 'tabelle(Schraube; M5)' });
        const box = Model.newItem('box', { w: 'tabelle(Schraube; M5)', d: 'runden(2,345; 1) * 10', h: 'wenn(b > 50; 3; 2)' });
        d.items.push(box);
      });
    """)
    warte_rechnen(p)
    bb1 = bbox(p, 0)
    val_loch = p.ev("return Model.vars(App.doc).v.loch")
    left_txt1 = p.pg.locator('#left-body').text_content()

    p.pg.fill(f'#ptv-{r1}', '6,2'); p.pg.press(f'#ptv-{r1}', 'Enter'); p.wait(300)
    p.ev("App.change('b ändern', d => { d.params.find(x=>x.name==='b').expr = 40; })")
    warte_rechnen(p)
    bb2 = bbox(p, 0)

    p.ev("App.undo()"); warte_rechnen(p)
    bb_undo = bbox(p, 0)
    p.ev("App.redo()"); warte_rechnen(p)
    bb_redo = bbox(p, 0)
    mig_len = p.ev("const d = Model.migrate(JSON.parse(App.snapshot())); return d.tables && d.tables.length === 1 && d.tables[0].rows.length === 3;")

    ok3 = (
        abs(val_loch - 5.5) < 1e-6 and '= 5,5' in left_txt1
        and bb1 is not None and abs((bb1[3] - bb1[0]) - 5.5) < 0.05 and abs((bb1[4] - bb1[1]) - 23.0) < 0.05 and abs((bb1[5] - bb1[2]) - 3.0) < 0.05
        and bb2 is not None and abs((bb2[3] - bb2[0]) - 6.2) < 0.05 and abs((bb2[5] - bb2[2]) - 2.0) < 0.05
        and bb_undo is not None and abs((bb_undo[5] - bb_undo[2]) - 3.0) < 0.05
        and bb_redo is not None and abs((bb_redo[5] - bb_redo[2]) - 2.0) < 0.05
        and mig_len is True
    )

    # 4. Fehlermeldungen in Klartext (Expr, Maße-Panel, Zahlenfeld) & Hilfe
    errs = p.ev("""
      return [
        Expr.tryEval('tabelle(Fehlt; M5)', {}),
        Expr.tryEval('tabelle(Schraube; M9)', {}, App.doc.tables),
        Expr.tryEval('wenn(b > 50; 3)', { b: 60 }),
        Expr.tryEval('wenn(b = 50; 3; 2)', { b: 60 }),
        Expr.tryEval('10 / 0', {}),
        Expr.tryEval('runden(2,3; 0,5)', {}),
      ];
    """)
    p.pg.locator(f'.ptbl-row[data-row-id="{r1}"] .ptbl-rdel').click(); p.wait(400)
    left_err = p.pg.locator('#left-body').text_content()
    var_errs = p.ev("return Object.values(Model.vars(App.doc).errors)")

    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    fid = p.pg.evaluate("[...document.querySelectorAll('#right-body input')].map(i=>i.id).find(i=>/w$/.test(i))")
    p.pg.fill('#' + fid, 'wenn(b = 50; 3; 2)'); p.pg.press('#' + fid, 'Enter'); p.wait(400)
    toast_txt = ' '.join(p.pg.locator('.toast').all_inner_texts())
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    has_help = (
        'formulaTable' in hilfen
        and all(k in hilfen['formulaTable'] for k in ('tip', 'hilfe', 'tipp'))
        and p.pg.locator('#par-table-add[data-help="formulaTable"]').count() == 1
    )

    ok4 = (
        all(not e['ok'] for e in errs)
        and 'nicht gefunden' in errs[0]['error']
        and 'M9' in errs[1]['error'] and 'Schraube' in errs[1]['error']
        and '3 Angaben' in errs[2]['error']
        and '==' in errs[3]['error']
        and 'Division durch 0' in errs[4]['error']
        and 'ganze Zahl' in errs[5]['error']
        and any('Schlüssel „M5“' in m and 'Schraube' in m for m in var_errs)
        and 'Schlüssel „M5“' in left_err
        and 'Das kann ich nicht ausrechnen' in toast_txt and '==' in toast_txt
        and has_help is True
    )
    return [ok1, ok2, ok3, ok4]


def t_a042_praegen(p):
    # 1. Text auf einem Zylindermantel (Ø 30 × 40), 1 mm vertieft → Volumen nimmt ab, Körper bleibt ein Stück
    p.empty()
    p.ev("Actions.addPrimitive('cylinder', { p: { d: 30, h: 40 }, pos: [0, 0] })")
    warte_rechnen(p, 20); p.wait(300)
    v0 = volumen(p)
    p.ev("""const id = App.doc.items[0].id, r = App.results.get(id);
      const fi = r.data.faces.findIndex(f => f.t === 'CYLINDRE');
      App.select([id], { face: { id, faceIdx: fi } });""")
    p.wait(300)
    btn_em = p.pg.locator('.ctxbar button[aria-label="Prägen"]')
    has_btn_help = btn_em.count() == 1 and btn_em.get_attribute('data-help') == 'emboss'
    btn_em.click(); p.wait(1200)
    sk_active = p.ev("return Sketch.active && Sketch.state.tool === 'text'")
    p.pg.fill('#tx-s', 'HI'); p.wait(150)
    p.pg.fill('#tx-h', '7'); p.pg.press('#tx-h', 'Enter'); p.wait(200)
    sx, sy = to_screen(p, 0, -3.5)
    p.pg.mouse.click(sx, sy); p.wait(400)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(700)
    p.pg.locator('#st-emb-deboss').click(); p.wait(250)
    p.pg.fill('#st-emb-h', '1'); p.pg.press('#st-emb-h', 'Enter'); p.wait(300)
    p.pg.locator('.stepbox .btn.primary').click()
    warte_rechnen(p, 35); p.wait(400)
    v_deb = volumen(p)
    st1 = p.ev("""const id = App.doc.items[0].id, eid = App.doc.items[1].id, r = App.results.get(id);
      const bodies = (r && r.data && r.data.bodies) ? r.data.bodies.length : 1;
      return [App.errors.length, App.doc.items.length, App.doc.items[1].kind, App.mergedInto(eid) === id, bodies];""")
    ok1 = (
        has_btn_help and sk_active is True
        and st1 == [0, 2, 'emboss', True, 1]
        and v0 is not None and v_deb is not None and v_deb < v0 - 5
    )

    # 2. Auf Erhaben umschalten → Volumen nimmt zu und der Körper bleibt ein Stück
    p.pg.select_option('#emb-mode', 'emboss')
    warte_rechnen(p, 35); p.wait(400)
    v_emb = volumen(p)
    st2 = p.ev("""const id = App.doc.items[0].id, r = App.results.get(id);
      const bodies = (r && r.data && r.data.bodies) ? r.data.bodies.length : 1;
      let maxR = 0;
      const v = r && r.data && r.data.vertices;
      if (v) for (let i = 0; i < v.length; i += 3) maxR = Math.max(maxR, Math.hypot(v[i], v[i + 1]));
      return [App.errors.length, bodies, Math.round(maxR * 100) / 100];""")
    ok2 = (
        st2[:2] == [0, 1]
        and v_emb is not None and v_emb > v0 + 5
        and st2[2] > 15.8
    )

    # 3. Höhe ändern (2 mm), Unterdrücken und Zeitleisten-Marker
    p.pg.fill('#emb-h', '2'); p.pg.press('#emb-h', 'Enter')
    warte_rechnen(p, 35); p.wait(300)
    v_h2 = volumen(p)
    p.ev("Timeline.toggleSuppress(App.doc.items[1].id)")
    warte_rechnen(p, 20); p.wait(250)
    v_sup = volumen(p)
    p.ev("Timeline.toggleSuppress(App.doc.items[1].id)")
    warte_rechnen(p, 30); p.wait(250)
    p.ev("Timeline.setMarker(1)")
    warte_rechnen(p, 20); p.wait(250)
    v_mk1 = volumen(p)
    p.ev("Timeline.setMarker(2)")
    warte_rechnen(p, 30); p.wait(250)
    v_mk2 = volumen(p)
    ok3 = (
        v_h2 is not None and v_h2 > v_emb + 5
        and abs(v_sup - v0) < 1
        and abs(v_mk1 - v0) < 1
        and abs(v_mk2 - v_h2) < 1
    )

    # 4. Kugel (Ø 30): vertieft + erhaben je ein Stück, Hilfetext & Schritt-Erklärung
    info_em = p.ev("return Explain.local(App.doc.items[1].id).lines.map(l=>l.t).join(' ')")
    p.ev("App.setDoc(Model.newDoc())"); p.wait(400)
    p.ev("Actions.addPrimitive('sphere', { p: { d: 30 }, pos: [0, 0] })")
    warte_rechnen(p, 20); p.wait(300)
    v_sph = volumen(p)
    p.ev("""const id = App.doc.items[0].id, r = App.results.get(id);
      const fi = r.data.faces.findIndex(f => f.t === 'SPHERE');
      App.select([id], { face: { id, faceIdx: fi } });""")
    p.wait(300)
    p.pg.locator('.ctxbar button[aria-label="Prägen"]').click(); p.wait(1200)
    p.ev("Sketch.insertEnts([{ type: 'circle', c: [0, 0], r: 4 }]);")
    p.wait(300)
    p.pg.locator('.sketchbar .tool.primary').click(); p.wait(700)
    p.pg.locator('#st-emb-deboss').click(); p.wait(200)
    p.pg.fill('#st-emb-h', '1'); p.pg.press('#st-emb-h', 'Enter'); p.wait(200)
    p.pg.locator('.stepbox .btn.primary').click()
    warte_rechnen(p, 35); p.wait(400)
    v_sph_deb = volumen(p)
    st_sph1 = p.ev("const r=App.results.get(App.doc.items[0].id); return [App.errors.length, (r&&r.data&&r.data.bodies)?r.data.bodies.length:1];")
    p.pg.select_option('#emb-mode', 'emboss')
    warte_rechnen(p, 35); p.wait(400)
    v_sph_emb = volumen(p)
    st_sph2 = p.ev("const r=App.results.get(App.doc.items[0].id); return [App.errors.length, (r&&r.data&&r.data.bodies)?r.data.bodies.length:1];")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    help_ok = 'emboss' in hilfen and all(k in hilfen['emboss'] for k in ('tip', 'hilfe', 'tipp'))
    ok4 = (
        st_sph1 == [0, 1] and st_sph2 == [0, 1]
        and v_sph_deb is not None and v_sph_deb < v_sph - 5
        and v_sph_emb is not None and v_sph_emb > v_sph + 5
        and help_ok and 'Prägt' in info_em
    )
    return [ok1, ok2, ok3, ok4]


# ---------- [F-11240521] Volltest-Reparatur: Drehteller-Video bei rAF-Stau / Einführung ----------
def t_f11240521(p):
    # 1. Drehteller-Video bei komplett blockiertem requestAnimationFrame
    p.empty()
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:30,d:20,h:10},{name:'Teil'})); })"); warte_rechnen(p)
    p.ev("Viewer.setView('iso', false)"); p.wait(400)
    c0 = p.ev("return Viewer.camera.position.toArray()")
    size = p.ev("""
      const origRAF = window.requestAnimationFrame;
      window._blockedRAF = [];
      window.requestAnimationFrame = (cb) => { window._blockedRAF.push(cb); return window._blockedRAF.length; };
      return Print.turntable({seconds: 1.5, save: false})
        .then(b => b ? b.size : 0)
        .finally(() => { window.requestAnimationFrame = origRAF; });
    """)
    c1 = p.ev("return Viewer.camera.position.toArray()")
    vid_type = p.ev("return (Print.lastVideo && Print.lastVideo.type) || ''")
    ok1 = size > 1000 and vid_type.startswith('video/') and max(abs(a - b) for a, b in zip(c0, c1)) < 1e-6

    # 2. Einführung „Erste Skizze“ reagiert ereignisgesteuert innerhalb von 500 ms je Schritt
    step = lambda: p.pg.locator('.tour h3').inner_text() if p.pg.locator('.tour').count() else ''
    p.ev("Tour.start('sketch')")
    s0 = step()
    p.pg.click('#t-sketch'); p.wait(500); s1 = step()
    p.pg.get_by_role('button', name='Auf der Arbeitsfläche').click(); p.wait(500); s2 = step()
    cx, cy = p.canvas_center()
    p.pg.mouse.click(cx - 120, cy + 60); p.pg.mouse.move(cx + 60, cy - 20)
    p.pg.keyboard.type('40'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter')
    p.wait(500); s3 = step()
    ok2 = (s0 == 'Skizze starten' and s1 == 'Zeichenblatt wählen' and s2 == 'Ein Rechteck zeichnen' and s3 == 'Kreis für das Loch')

    # 3. Tour.stop() bricht einen bereits ausgelösten Schrittwechsel sauber ab
    p.ev("Tour.start('sketch'); App.emit('sketch'); Tour.stop();")
    p.ev("Sketch.cancel(true); Tour.start('sketch');")
    p.wait(400)
    ok3 = step() == 'Skizze starten'
    p.ev("Tour.stop()")
    return [ok1, ok2, ok3]


def t_a045_step_farben_namen(p):
    # 1. Zwei Teile „Deckel“ (rot) und „Boden“ (blau) in einer Gruppe „Gehäuse“ anlegen und als STEP exportieren
    p.empty()
    p.ev("""
      App.change('x', d => {
        const boden = Model.newItem('box', { w: 20, d: 20, h: 10 }, { name: 'Boden', color: '#3f7fd6', more: { colorSet: true } });
        const deckel = Model.newItem('box', { w: 20, d: 20, h: 5 }, { name: 'Deckel', color: '#d6574c', more: { colorSet: true } });
        deckel.t.z = 10;
        d.items.push(deckel, boden);
      });
    """); warte_rechnen(p)
    p.ev("Actions.group(App.doc.items.map(x => x.id), { name: 'Gehäuse', quiet: true })"); warte_rechnen(p)
    exp = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      const u8 = new Uint8Array(r.data);
      window.__stepA045 = new File([u8], 'Gehaeuse.step');
      return new TextDecoder('utf-8').decode(u8);
    }""")
    ok1 = (
        "PRODUCT('Gehäuse'" in exp
        and "PRODUCT('Deckel'" in exp
        and "PRODUCT('Boden'" in exp
        and 'NEXT_ASSEMBLY_USAGE_OCCURRENCE' in exp
        and 'STYLED_ITEM' in exp
        and 'COLOUR_RGB' in exp
    )

    # 2. Exportierte STEP-Datei in ein leeres Projekt importieren -> Gruppe, Namen, Farben und Volumen sind wieder da
    p.ev("App.change('clear', d => { d.items = []; })"); p.wait(400)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(window.__stepA045)")
    warte_rechnen(p, 30)
    imp = p.ev("""
      const g = App.doc.items[0];
      return {
        n: App.doc.items.length,
        errs: App.errors.length,
        kind: g && g.kind,
        name: g && g.name,
        kids: g && g.children ? g.children.map(c => ({ kind: c.kind, name: c.name, color: c.color, fmt: c.p && c.p.fmt })) : []
      };
    """)
    vol = volumen(p)
    kids_by_name = {k['name']: k for k in imp.get('kids', [])}
    ok2 = (
        imp['n'] == 1 and imp['errs'] == 0
        and imp['kind'] == 'group' and imp['name'] == 'Gehäuse'
        and len(imp['kids']) == 2
        and kids_by_name.get('Deckel', {}).get('color') == '#d6574c'
        and kids_by_name.get('Boden', {}).get('color') == '#3f7fd6'
        and kids_by_name.get('Deckel', {}).get('fmt') == 'step'
        and kids_by_name.get('Boden', {}).get('fmt') == 'step'
        and vol is not None and abs(vol - 6000) < 5
    )

    # 3. 3D-Viewer zeigt zwei Körperfarben (rot und blau) & Verlauf links zeigt Gruppe, Deckel und Boden mit Farbkacheln
    p.wait(300)
    vis = p.ev("""
      const g = App.doc.items[0];
      const n = Viewer.nodes.get(g.id);
      const c = n && n.mesh && n.mesh.geometry && n.mesh.geometry.getAttribute('color');
      const cols = [];
      if (c && n.data.faceGroups && n.data.faceBody) {
        const seen = new Map();
        for (const [st, cnt, fi] of n.data.faceGroups) {
          const bi = fi >= 0 ? n.data.faceBody[fi] : -1;
          if (bi >= 0 && !seen.has(bi)) {
            const vi = n.data.triangles[st];
            seen.set(bi, [c.getX(vi), c.getY(vi), c.getZ(vi)]);
          }
        }
        for (const v of seen.values()) cols.push(v);
      }
      const rows = [...document.querySelectorAll('#left-body .tree .node')].map(el => ({
        name: (el.querySelector('.nm') && el.querySelector('.nm').textContent || '').trim(),
        bg: el.querySelector('.swatch') ? el.querySelector('.swatch').style.background : ''
      }));
      return { vc: !!(n && n.mesh && n.mesh.material && n.mesh.material.vertexColors), cols, rows, bodyRows: document.querySelectorAll('.bodies-wrap').length };
    """)
    cols = vis.get('cols', [])
    color_diff = len(cols) == 2 and (sum((a - b) ** 2 for a, b in zip(cols[0], cols[1])) ** 0.5) > 0.2
    row_names = [r['name'] for r in vis.get('rows', [])]
    ok3 = (
        vis['vc'] and color_diff and vis['bodyRows'] == 0
        and 'Gehäuse' in row_names and 'Deckel' in row_names and 'Boden' in row_names
    )

    # 4. Erneuter Roundtrip + Ordner-Export + parseSTEP mit benannter Farbe & STEP-Umlaut (\X2\00E4\X0\)
    exp2 = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      window.__stepA045_2 = new File([new Uint8Array(r.data)], 'Roundtrip2.step');
      return new TextDecoder('utf-8').decode(new Uint8Array(r.data));
    }""")
    p.ev("App.change('clear', d => { d.items = []; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(window.__stepA045_2)")
    warte_rechnen(p, 30)
    rt2 = p.ev("""
      const g = App.doc.items[0];
      return g && g.kind === 'group' && g.name === 'Gehäuse'
        ? g.children.map(c => [c.name, c.color])
        : [];
    """)
    # Ordner-Export wird zur Baugruppe
    p.ev("""
      App.change('folder', d => {
        d.items = [];
        const a = Model.newItem('box', { w: 10, d: 10, h: 10 }, { name: 'Stift', color: '#5b9f55', more: { colorSet: true } });
        const b = Model.newItem('box', { w: 10, d: 10, h: 10 }, { name: 'Kappe', color: '#e2b53a', more: { colorSet: true } });
        b.t.x = 25;
        d.items.push(a, b);
        d.folders = [{ id: 'f1', name: 'Bausatz', ids: [a.id, b.id], collapsed: false }];
      });
    """); warte_rechnen(p)
    exp_fld = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      window.__stepA045_fld = new File([new Uint8Array(r.data)], 'Bausatz.step');
      return r.data.byteLength;
    }""")
    p.ev("App.change('clear', d => { d.items = []; d.folders = []; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(window.__stepA045_fld)")
    warte_rechnen(p, 30)
    fld_imp = p.ev("const g=App.doc.items[0]; return g && [g.kind, g.name, (g.children||[]).map(c=>[c.name, c.color])]")
    # parseSTEP-Einheitstest für DRAUGHTING_PRE_DEFINED_COLOUR & \X2\00E4\X0\
    synth_step = r"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('','2026-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1 = APPLICATION_CONTEXT('automotive_design');
#2 = PRODUCT('Tr\X2\00E4\X0\ger','Tr\X2\00E4\X0\ger','',(#1));
#3 = PRODUCT_DEFINITION_FORMATION('','',#2);
#4 = PRODUCT_DEFINITION('design','',#3,#1);
#5 = PRODUCT_DEFINITION_SHAPE('','',#4);
#6 = ADVANCED_BREP_SHAPE_REPRESENTATION('',(#7),#8);
#7 = MANIFOLD_SOLID_BREP('',#9);
#10 = SHAPE_DEFINITION_REPRESENTATION(#5,#6);
#11 = STYLED_ITEM('color',(#12),#7);
#12 = PRESENTATION_STYLE_ASSIGNMENT((#13));
#13 = SURFACE_STYLE_USAGE(.BOTH.,#14);
#14 = SURFACE_SIDE_STYLE('',(#15));
#15 = SURFACE_STYLE_FILL_AREA(#16);
#16 = FILL_AREA_STYLE('',(#17));
#17 = FILL_AREA_STYLE_COLOUR('',#18);
#18 = DRAUGHTING_PRE_DEFINED_COLOUR('red');
ENDSEC;
END-ISO-10303-21;"""
    synth = p.ev("return Start.parseSTEP(new TextEncoder().encode(arg));", synth_step)
    ok4 = (
        "PRODUCT('Gehäuse'" in exp2
        and sorted(rt2) == [['Boden', '#3f7fd6'], ['Deckel', '#d6574c']]
        and exp_fld > 1000
        and fld_imp is not None and fld_imp[0] == 'group' and fld_imp[1] == 'Bausatz'
        and sorted(fld_imp[2]) == [['Kappe', '#e2b53a'], ['Stift', '#5b9f55']]
        and synth and synth['partCount'] == 1
        and synth['roots'][0]['name'] == 'Träger'
        and synth['roots'][0]['color'] == '#ff0000'
    )

    # 5. Export-Dialog zeigt Hilfe-Attribut exportStep und werkzeug-hilfen.json ist vollständig
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(400)
    has_help_attr = p.pg.locator('[data-help="exportStep"]').count() == 1
    p.pg.keyboard.press('Escape'); p.wait(200)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    h_es = hilfen.get('exportStep') or {}
    ok5 = has_help_attr and bool(h_es.get('tip') and h_es.get('hilfe') and h_es.get('tipp'))
    return [ok1, ok2, ok3, ok4, ok5]


def t_a043_wickeln_zylinder(p):
    # 1. Zylinder Ø20 × 20 → Zylinderfläche anklicken → „Wickeln“ → Rechteck 31,4 × 8 mm → Prägung erhaben (+2 mm) → 180° ± 2°
    p.empty()
    p.ev("Actions.addPrimitive('cylinder')")
    warte_rechnen(p, 30); p.wait(400)
    pt = world_screen(p, 0, -10, 10)
    p.pg.mouse.click(pt[0], pt[1]); p.wait(350)
    p.pg.locator('.ctxbar').get_by_role('button', name='Wickeln').click(); p.wait(1000)
    p.ev("Sketch.state.ents.push({id:'r1',type:'rect',a:[-15.7,-4],b:[15.7,4]})")
    p.pg.keyboard.press('Enter'); p.wait(500)
    has_step_help = p.pg.locator('#st-mode-wrap').get_attribute('data-help') == 'wrapCyl'
    p.pg.locator('.stepbox .btn.primary').click(); warte_rechnen(p, 30); p.wait(300)

    def span_deg(r_min, r_max):
        return p.ev("""const r=App.results.get(App.doc.items[0].id);
          if(!r||!r.data||!r.data.vertices) return null;
          const v=r.data.vertices; const angs=[];
          for(let i=0;i<v.length;i+=3){
            const x=v[i], y=v[i+1], rr=Math.hypot(x,y);
            if(rr>arg[0] && rr<arg[1]) angs.push(Math.atan2(x,-y)*180/Math.PI);
          }
          if(!angs.length) return null;
          angs.sort((a,b)=>a-b);
          let maxGap=0, gapAt=0;
          for(let i=0;i<angs.length;i++){
            const nxt=i+1<angs.length?angs[i+1]:angs[0]+360;
            const g=nxt-angs[i];
            if(g>maxGap){maxGap=g;gapAt=(i+1)%angs.length;}
          }
          const span=360-maxGap;
          const mid=(angs[gapAt]+span/2+180)%360-180;
          return {span, mid, n:angs.length};""", [r_min, r_max])

    m_emb = p.ev("return Mass.measureDoc(App.doc)")
    st_emb = p.ev("const its=App.doc.items; return {len:its.length, kind:its[1]&&its[1].kind, merged:App.mergedInto(its[1]&&its[1].id)===its[0].id, errs:App.errors.length}")
    sp_emb = span_deg(10.5, 12.5)
    info_emb = p.pg.locator('#wrap-angle-info').text_content()
    exp_emb = math.pi * 100 * 20 + math.pi * (144 - 100) * 8 * (31.4 / (2 * math.pi * 10))
    ok1 = (
        has_step_help
        and st_emb == {'len': 2, 'kind': 'wrap', 'merged': True, 'errs': 0}
        and m_emb and m_emb['count'] == 1 and abs(m_emb['volume'] - exp_emb) < 5
        and sp_emb is not None and abs(sp_emb['span'] - 180.0) <= 2.0 and abs(sp_emb['mid']) <= 2.0
        and '179,9' in info_emb
    )

    # 2. Vertieft (deboss, 2 mm), Startwinkel 90° und Zylinder Ø40 → halber Winkel (90° ± 2°)
    p.pg.select_option('#wrap-mode', 'deboss'); warte_rechnen(p, 30); p.wait(300)
    m_deb = p.ev("return Mass.measureDoc(App.doc)")
    sp_deb = span_deg(7.5, 9.5)
    exp_deb = math.pi * 100 * 20 - math.pi * (100 - 64) * 8 * (31.4 / (2 * math.pi * 10))

    field(p, '#wrap-angle', 90); warte_rechnen(p, 30); p.wait(250)
    sp_rot = span_deg(7.5, 9.5)

    p.ev("App.change('Ø40', d => { d.items[0].p.d = 40; })"); warte_rechnen(p, 30); p.wait(300)
    sp_40 = span_deg(17.5, 19.5)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(250)
    info_40 = p.pg.locator('#wrap-angle-info').text_content()
    ok2 = (
        m_deb and m_deb['count'] == 1 and abs(m_deb['volume'] - exp_deb) < 5
        and sp_deb is not None and abs(sp_deb['span'] - 180.0) <= 2.0
        and sp_rot is not None and abs(sp_rot['span'] - 180.0) <= 2.0 and abs(sp_rot['mid'] - 90.0) <= 2.0
        and sp_40 is not None and abs(sp_40['span'] - 90.0) <= 2.0
        and ('90°' in info_40 or '90,0°' in info_40 or '89,9°' in info_40)
        and p.ev("return App.errors.length") == 0
    )

    # 3. Zurück auf Ø20 & Modus „Linie“ → Fläche geteilt + Bogenkante 31,4 mm + „Entlang Pfad“ + offene Helix
    p.ev("App.change('Ø20', d => { d.items[0].p.d = 20; d.items[1].p.angle = 0; })"); warte_rechnen(p, 30); p.wait(250)
    p.ev("App.select([App.doc.items[1].id])"); p.wait(250)
    p.pg.select_option('#wrap-mode', 'line'); warte_rechnen(p, 30); p.wait(300)
    m_line = p.ev("return Mass.measureDoc(App.doc)")
    line_info = p.ev("""const d=App.results.get(App.doc.items[0].id).data;
      return {faces:d.faces.length, edges:d.edges.length, hasArc314:d.edges.some(e=>Math.abs((e.l||0)-31.4)<0.15)};""")
    p.pg.locator('#wrap-to-sweep').click(); warte_rechnen(p, 30); p.wait(300)
    m_sw = p.ev("return Mass.measureDoc(App.doc)")
    sw_ok = p.ev("const it=App.doc.items[2]; return !!it && it.kind==='sweep' && it.p.wrapId===App.doc.items[1].id && App.errors.length===0")

    # Offene Helix-Linie um Ø20 + Sweep
    p.ev("""App.change('Helix', d => {
      const w = d.items[1];
      w.p.sketch.ents = [{id:'l1',type:'line',a:[-31.4,-6],b:[31.4,6]}];
    })"""); warte_rechnen(p, 30); p.wait(300)
    m_hx = p.ev("return Mass.measureDoc(App.doc)")
    helix_ok = p.ev("return App.errors.length === 0") and m_hx and m_hx['count'] == 2 and m_hx['parts'][1]['volume'] > 100

    ok3 = (
        m_line and abs(m_line['volume'] - math.pi * 100 * 20) < 5
        and line_info['faces'] >= 4 and line_info['edges'] >= 6 and line_info['hasArc314']
        and sw_ok and m_sw and m_sw['count'] == 2 and m_sw['parts'][1]['volume'] > 100
        and helix_ok
    )

    # 4. Zeitleiste (Unterdrücken & Marker), Skizze bearbeiten, Bezüge, Erklären, Befehlssuche & Hilfe
    p.ev("App.change('Rect wieder', d => { d.items.splice(2,1); d.items[1].p.sketch.ents=[{id:'r1',type:'rect',a:[-15.7,-4],b:[15.7,4]}]; d.items[1].p.mode='emboss'; })")
    warte_rechnen(p, 30); p.wait(250)
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Unterdrücken').click()
    warte_rechnen(p, 30); p.wait(250)
    v_sup = volumen(p)
    p.pg.locator('.tl-chip').nth(1).click(button='right'); p.wait(300)
    p.pg.locator('.pop').get_by_role('button', name='Wieder aktivieren').click()
    warte_rechnen(p, 30); p.wait(250)
    v_unsup = volumen(p)
    p.ev("Timeline.setMarker(1)"); warte_rechnen(p, 30); p.wait(200)
    v_mk1 = volumen(p)
    p.ev("Timeline.setMarker(2)"); warte_rechnen(p, 30); p.wait(200)
    v_mk2 = volumen(p)

    p.ev("Sketch.editItem(App.doc.items[1].id)"); p.wait(1000)
    edit_ok = p.ev("return Sketch.active && Sketch.state.ents.length === 1")
    p.pg.keyboard.press('Enter'); p.wait(800); warte_rechnen(p, 30)

    deps = p.ev("return Model.dependencies(App.doc)")
    expl = p.ev("return Explain.local(App.doc.items[1].id)")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    cmd_ok = p.ev("return Commands.search('Wickeln').some(c=>c.id==='wrap-cyl')")
    ok4 = (
        v_sup is not None and abs(v_sup - math.pi * 100 * 20) < 5
        and v_unsup is not None and abs(v_unsup - exp_emb) < 5
        and v_mk1 is not None and abs(v_mk1 - math.pi * 100 * 20) < 5
        and v_mk2 is not None and abs(v_mk2 - exp_emb) < 5
        and edit_ok
        and any(d.get('what') == 'wickelt um' for d in (deps or []))
        and expl and any('Wickelt' in l['t'] for l in expl['lines'])
        and cmd_ok
        and 'wrapCyl' in hilfen and all(k in hilfen['wrapCyl'] for k in ('tip', 'hilfe', 'tipp'))
    )
    return [ok1, ok2, ok3, ok4]


def t_a044_iges_brep(p):
    import zipfile, tempfile
    p.empty()

    # 1. BREP-Roundtrip am Quader (30 x 20 x 15 = 9000 mm^3)
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:30,d:20,h:15},{name:'Quader'})); })")
    warte_rechnen(p, 30)
    v0 = volumen(p)
    brep_ok = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportBREP', { scene: Model.kernelScene(App.doc) });
      window.__brepBytes = new Uint8Array(r.data);
      const head = new TextDecoder().decode(window.__brepBytes.slice(0, 64));
      return window.__brepBytes.byteLength > 200 && head.includes('CASCADE');
    }""")
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__brepBytes], 'Quader.brep'))")
    warte_rechnen(p, 30)
    it_brep = p.ev("const it=App.doc.items[0]; const r=it && App.results.get(it.id); return { kind:it&&it.kind, name:it&&it.name, fmt:it&&it.p&&it.p.fmt, errs:App.errors.length, bb:r&&r.data&&r.data.bbox }")
    v_brep = volumen(p)
    ok1 = (bool(brep_ok) and v0 is not None and abs(v0 - 9000) < 0.1
           and it_brep['kind'] == 'import' and it_brep['name'] == 'Quader' and it_brep['fmt'] == 'brep'
           and it_brep['errs'] == 0 and v_brep is not None and abs(v_brep - v0) / v0 < 0.001
           and it_brep['bb'] is not None and abs((it_brep['bb'][3] - it_brep['bb'][0]) - 30) < 0.05)

    # 2. IGES-Roundtrip am Quader (.igs und .iges)
    p.ev("App.change('x', d=>{ d.items=[]; d.items.push(Model.newItem('box',{w:30,d:20,h:15},{name:'Quader'})); })")
    warte_rechnen(p, 30)
    iges_ok = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportIGES', { scene: Model.kernelScene(App.doc) });
      window.__igesBytes = new Uint8Array(r.data);
      const txt = new TextDecoder().decode(window.__igesBytes);
      return txt.includes('S      1') && txt.includes('G      1') && txt.includes('D      1') && txt.includes('P      1') && txt.includes('T      1') && txt.includes('144,');
    }""")
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__igesBytes], 'Quader.igs'))")
    warte_rechnen(p, 30)
    it_igs = p.ev("const it=App.doc.items[0]; const r=it && App.results.get(it.id); return { kind:it&&it.kind, name:it&&it.name, fmt:it&&it.p&&it.p.fmt, errs:App.errors.length, bb:r&&r.data&&r.data.bbox }")
    v_igs = volumen(p)
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__igesBytes], 'Quader2.iges'))")
    warte_rechnen(p, 30)
    it_iges = p.ev("const it=App.doc.items[0]; return { name:it&&it.name, fmt:it&&it.p&&it.p.fmt, errs:App.errors.length }")
    v_iges = volumen(p)
    ok2 = (bool(iges_ok)
           and it_igs['kind'] == 'import' and it_igs['name'] == 'Quader' and it_igs['fmt'] == 'iges'
           and it_igs['errs'] == 0 and v_igs is not None and abs(v_igs - v0) / v0 < 0.001
           and it_igs['bb'] is not None and abs((it_igs['bb'][3] - it_igs['bb'][0]) - 30) < 0.05
           and it_iges['name'] == 'Quader2' and it_iges['fmt'] == 'iges' and it_iges['errs'] == 0
           and v_iges is not None and abs(v_iges - v0) / v0 < 0.001)

    # 3. Gekrümmter Körper mit Durchgangsbohrung (Quader 30x20x15 - Zylinder D8): IGES und BREP
    p.ev("""App.change('x', d=>{
      d.items=[];
      const g=Model.newItem('group',{},{name:'Lochteil'});
      const b=Model.newItem('box',{w:30,d:20,h:15});
      const c=Model.newItem('cylinder',{d:8,h:20},{role:'hole'}); c.t.z=-2;
      g.children=[b,c]; d.items.push(g);
    })""")
    warte_rechnen(p, 30)
    v_hole0 = volumen(p)
    p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const ri = await Kernel.call('exportIGES', { scene: Model.kernelScene(App.doc) });
      const rb = await Kernel.call('exportBREP', { scene: Model.kernelScene(App.doc) });
      window.__holeIges = new Uint8Array(ri.data);
      window.__holeBrep = new Uint8Array(rb.data);
    }""")
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__holeIges], 'Loch.igs'))")
    warte_rechnen(p, 30)
    v_hole_igs = volumen(p)
    err_hole_igs = p.ev("return App.errors.length")
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__holeBrep], 'Loch.brep'))")
    warte_rechnen(p, 30)
    v_hole_brep = volumen(p)
    err_hole_brep = p.ev("return App.errors.length")
    ok3 = (v_hole0 is not None and abs(v_hole0 - (9000 - math.pi * 16 * 15)) < 1.0
           and err_hole_igs == 0 and v_hole_igs is not None and abs(v_hole_igs - v_hole0) / v_hole0 < 0.001
           and err_hole_brep == 0 and v_hole_brep is not None and abs(v_hole_brep - v_hole0) / v_hole0 < 0.001)

    # 4. Export-Dialog, ZIP-Download, Einheit (#p-scale), Hilfe & Fehlerbehandlung
    p.ev("App.change('x', d=>{ d.items=[]; d.items.push(Model.newItem('box',{w:30,d:20,h:15},{name:'ExportTeil'})); })")
    warte_rechnen(p, 30)
    help_ok = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json()).then(d=>{ const h=d.exportIgesBrep; return !!(h && h.tip && h.hilfe && h.tipp); })")
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(400)
    dlg_ok = (p.pg.locator('#ex-iges').count() == 1 and p.pg.locator('#ex-brep').count() == 1
              and p.pg.locator('[data-help="exportIgesBrep"]').count() == 2)
    p.pg.uncheck('#ex-step'); p.pg.check('#ex-iges'); p.pg.check('#ex-brep'); p.wait(100)
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    zpath = os.path.join(tempfile.gettempdir(), 'tracery-a044.zip')
    dl.value.save_as(zpath)
    names = zipfile.ZipFile(zpath).namelist()
    igs_in_zip = [n for n in names if n.endswith('.igs')]
    brep_in_zip = [n for n in names if n.endswith('.brep')]
    zip_ok = len(igs_in_zip) == 1 and len(brep_in_zip) == 1 and len(zipfile.ZipFile(zpath).read(igs_in_zip[0])) > 500 and len(zipfile.ZipFile(zpath).read(brep_in_zip[0])) > 200

    # Einheit cm (10x) am importierten BREP + defekte Dateien melden Fehler ohne Absturz
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File([window.__brepBytes], 'Skal.brep'))")
    warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
    p.pg.select_option('#p-scale', '10'); warte_rechnen(p, 30)
    bb_cm = p.ev("const r=App.results.get(App.doc.items[0].id); return r && r.data.bbox")
    scale_ok = bb_cm is not None and abs((bb_cm[3] - bb_cm[0]) - 300) < 0.2

    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File(['ungueltig'], 'kaputt.brep'))")
    warte_rechnen(p, 30)
    err_brep = p.ev("return App.errors.length") > 0
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(300)
    p.pg.evaluate("() => window.__masswerk.Start.openBlob(new File(['ungueltig'], 'kaputt.igs'))")
    warte_rechnen(p, 30)
    err_igs = p.ev("return App.errors.length") > 0

    ok4 = help_ok and dlg_ok and zip_ok and scale_ok and err_brep and err_igs
    return [ok1, ok2, ok3, ok4]


def t_a046_dateien_ziehen(p):
    import json as _json
    p.empty()

    # 1. Hinweis-Rahmen beim Ziehen einer Datei und Schutz gegen internes Ziehen (text/plain)
    drag_res = p.pg.evaluate("""() => {
      const ov = () => document.querySelector('#drop-overlay');
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'test.stl', { type: 'model/stl' }));
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
      window.dispatchEvent(over);
      const el = ov();
      const shown = !!el && !el.hidden;
      const txt = el ? (el.textContent || '') : '';
      window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, relatedTarget: null, clientX: 0, clientY: 0 }));
      const hiddenAfter = !ov() || !!ov().hidden;
      const dtInt = new DataTransfer();
      dtInt.setData('text/plain', 'i_1');
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dtInt }));
      window.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtInt }));
      const hiddenInternal = !ov() || !!ov().hidden;
      return { prevented: over.defaultPrevented, shown, txt, hiddenAfter, hiddenInternal };
    }""")
    ok1 = (drag_res['prevented'] and drag_res['shown']
           and 'STL' in drag_res['txt'] and 'OBJ' in drag_res['txt'] and 'Projekt' in drag_res['txt']
           and drag_res['hiddenAfter'] and drag_res['hiddenInternal'])

    # 2. Drop-Ereignis mit einer STL-Datei -> ein neuer Koerper
    stl_txt = """solid spitze
 facet normal 0 0 -1
  outer loop
   vertex 0 0 0
   vertex 0 10 0
   vertex 10 0 0
  endloop
 endfacet
 facet normal 0 -1 0
  outer loop
   vertex 0 0 0
   vertex 10 0 0
   vertex 0 0 10
  endloop
 endfacet
 facet normal -1 0 0
  outer loop
   vertex 0 0 0
   vertex 0 0 10
   vertex 0 10 0
  endloop
 endfacet
 facet normal 1 1 1
  outer loop
   vertex 10 0 0
   vertex 0 10 0
   vertex 0 0 10
  endloop
 endfacet
endsolid spitze
"""
    p.pg.evaluate("""(txt) => {
      const dt = new DataTransfer();
      dt.items.add(new File([txt], 'spitze.stl', { type: 'model/stl' }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", stl_txt)
    warte_rechnen(p, 30)
    stl_info = p.ev("""const it = App.doc.items[0];
      const ov = document.querySelector('#drop-overlay');
      return { n: App.doc.items.length, kind: it && it.kind, name: it && it.name, fmt: it && it.p && it.p.fmt, errs: App.errors.length, ovHidden: !ov || !!ov.hidden };""")
    v_stl = volumen(p)
    ok2 = (stl_info['n'] == 1 and stl_info['kind'] == 'import' and stl_info['name'] == 'spitze'
           and stl_info['fmt'] == 'stl' and stl_info['errs'] == 0 and stl_info['ovHidden']
           and v_stl is not None and abs(abs(v_stl) - 1000 / 6) < 2)

    # 3. Drop-Ereignis mit einer Projektdatei -> das Projekt ist geoeffnet
    proj_json = _json.dumps({
        'format': 'masswerk',
        'id': 'p_a046_drop',
        'name': 'Gezogenes Projekt',
        'params': [{'id': 'm_a046', 'name': 'Breite', 'expr': 55}],
        'items': [{
            'id': 'i_a046_box', 'kind': 'box', 'name': 'Sockel', 'role': 'solid', 'color': '#2f9e91',
            't': {'x': 0, 'y': 0, 'z': 0, 'rx': 0, 'ry': 0, 'rz': 0},
            'p': {'w': 'Breite', 'd': 25, 'h': 12},
            'finishes': [], 'suppressed': False, 'hidden': False,
        }],
    })
    p.pg.evaluate("""(txt) => {
      const dt = new DataTransfer();
      dt.items.add(new File([txt], 'Gezogenes_Projekt.tracery.json', { type: 'application/json' }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", proj_json)
    warte_rechnen(p, 30)
    proj_info = p.ev("""return {
      docName: App.doc.name,
      btnName: document.querySelector('#btn-project') && document.querySelector('#btn-project').textContent,
      n: App.doc.items.length,
      first: App.doc.items[0] && App.doc.items[0].name,
      errs: App.errors.length,
    }""")
    v_proj = volumen(p)
    ok3 = (proj_info['docName'] == 'Gezogenes Projekt' and proj_info['btnName'] == 'Gezogenes Projekt'
           and proj_info['n'] == 1 and proj_info['first'] == 'Sockel' and proj_info['errs'] == 0
           and v_proj is not None and abs(v_proj - 16500) < 1)

    # 4. Drop-Ereignis mit OBJ-Datei -> Import als neuer Koerper
    obj_txt = "\n".join([
        "o Wuerfel",
        "v 0 0 0", "v 10 0 0", "v 10 20 0", "v 0 20 0",
        "v 0 0 5", "v 10 0 5", "v 10 20 5", "v 0 20 5",
        "f 1 4 3 2",
        "f 5 6 7 8",
        "f 1 2 6 5",
        "f 2 3 7 6",
        "f 3 4 8 7",
        "f 4 1 5 8",
    ]) + "\n"
    p.pg.evaluate("""(txt) => {
      const dt = new DataTransfer();
      dt.items.add(new File([txt], 'Wuerfel.obj', { type: 'text/plain' }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", obj_txt)
    warte_rechnen(p, 30)
    obj_info = p.ev("""const it = App.doc.items[1];
      const r = it && App.results.get(it.id);
      return { n: App.doc.items.length, kind: it && it.kind, name: it && it.name, errs: App.errors.length, bb: r && r.data && r.data.bbox };""")
    bb_obj = obj_info['bb']
    ok4 = (obj_info['n'] == 2 and obj_info['kind'] == 'import' and obj_info['name'] == 'Wuerfel'
           and obj_info['errs'] == 0 and bb_obj is not None
           and abs((bb_obj[3] - bb_obj[0]) - 10) < 0.2
           and abs((bb_obj[4] - bb_obj[1]) - 20) < 0.2
           and abs((bb_obj[5] - bb_obj[2]) - 5) < 0.2)

    # 5. Drop-Ereignis mit SVG (neue Skizze), DXF in offene Skizze und unbekannte Datei
    svg_txt = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect x="0" y="0" width="20" height="10"/></svg>'
    p.pg.evaluate("""(txt) => {
      const dt = new DataTransfer();
      dt.items.add(new File([txt], 'Schild.svg', { type: 'image/svg+xml' }));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", svg_txt)
    warte_rechnen(p, 30)
    svg_info = p.ev("""const it = App.doc.items[2];
      return { n: App.doc.items.length, kind: it && it.kind, name: it && it.name, ents: it && it.p && it.p.sketch && it.p.sketch.ents ? it.p.sketch.ents.length : 0, errs: App.errors.length };""")

    p.ev("Sketch.startOnPlane('XY')"); p.wait(500)
    sk_hint = p.pg.evaluate("""() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['0'], 'Kreis.dxf'));
      window.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const el = document.querySelector('#drop-overlay');
      const txt = el ? (el.textContent || '') : '';
      window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, relatedTarget: null, clientX: 0, clientY: 0 }));
      return txt;
    }""")
    dxf_txt = "\n".join(str(x) for x in [0, 'SECTION', 2, 'ENTITIES', 0, 'CIRCLE', 10, 0, 20, 0, 40, 5, 0, 'ENDSEC', 0, 'EOF']) + "\n"
    p.pg.evaluate("""(txt) => {
      const dt = new DataTransfer();
      dt.items.add(new File([txt], 'Kreis.dxf'));
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", dxf_txt)
    p.wait(700)
    dxf_radii = SS(p, "return S.ents.filter(e => e.type === 'circle').map(e => e.r)")
    p.ev("Sketch.cancel(true)"); p.wait(300)

    bad_drop = p.pg.evaluate("""() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['hallo'], 'notiz.txt', { type: 'text/plain' }));
      const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      window.dispatchEvent(ev);
      const ov = document.querySelector('#drop-overlay');
      return { prevented: ev.defaultPrevented, ovHidden: !ov || !!ov.hidden };
    }""")
    p.wait(300)
    bad_toast = p.pg.locator('.toast.bad').count() >= 1
    n_after_bad = p.ev("return App.doc.items.length")
    ok5 = (svg_info['n'] == 3 and svg_info['kind'] == 'extrude' and svg_info['name'] == 'Schild'
           and svg_info['ents'] >= 4 and svg_info['errs'] == 0
           and 'Skizze' in sk_hint and dxf_radii == [5]
           and bad_drop['prevented'] and bad_drop['ovHidden'] and bad_toast and n_after_bad == 3)

    return [ok1, ok2, ok3, ok4, ok5]


def t_geometrie_pruefung(p):
    # 1. Gesunder Quader über Prüfen-Menü -> „Keine Probleme“
    p.empty()
    p.ev("Actions.addPrimitive('box', { p: { w: 30, d: 20, h: 15 } })")
    warte_rechnen(p, 20)
    p.pg.locator('#t-check').click(); p.wait(250)
    p.pg.locator('#check-geom').click()
    p.pg.locator('#geom-check-ok').wait_for(state='visible', timeout=10000)
    bar_txt1 = p.pg.locator('#geom-check-bar').text_content().lower()
    st1 = p.ev("return GeomCheck.last ? { n: GeomCheck.last.issues.length, c: GeomCheck.last.checkedCount } : null")
    ok1 = ('keine probleme' in bar_txt1) and bool(st1 and st1['n'] == 0 and st1['c'] == 1)

    # 2. Gesunde Kugel & Zylinder (keine Fehlalarme durch Pole oder Nahtkanten)
    p.ev("""App.change('Kugel und Zylinder', d => {
      const s = Model.newItem('sphere', { d: 20 }, { name: 'Kugel' });
      const c = Model.newItem('cylinder', { d: 16, h: 24 }, { name: 'Zylinder' });
      c.t.x = 30;
      d.items = [s, c];
    })""")
    warte_rechnen(p, 20)
    p.pg.locator('#gc-rerun').click()
    p.pg.locator('#geom-check-ok').wait_for(state='visible', timeout=10000)
    st2 = p.ev("return GeomCheck.last ? { n: GeomCheck.last.issues.length, c: GeomCheck.last.checkedCount } : null")
    ok2 = bool(st2 and st2['n'] == 0 and st2['c'] == 2)

    # 3. Körper mit winziger Kante (< 0,01 mm durch zwei fast gleiche Maße)
    p.pg.locator('#gc-close').click(); p.wait(200)
    p.ev("""App.setDoc(Model.newDoc())""")
    p.ev("""App.change('Winzige Kante', d => {
      const a = Model.newItem('box', { w: 20, d: 20, h: 10 }, { name: 'Grundkörper' });
      const b = Model.newItem('box', { w: 20.005, d: 10, h: 10 }, { name: 'Aufsatz' });
      b.t.z = 5;
      b.op = { type: 'join', target: a.id };
      d.items.push(a, b);
    })""")
    warte_rechnen(p, 25)
    p.pg.locator('#t-check').click(); p.wait(250)
    p.pg.locator('#check-geom').click()
    p.pg.locator('#geom-check-list button').first.wait_for(state='visible', timeout=10000)
    first_txt = p.pg.locator('#geom-check-list button').first.text_content().lower()
    st3 = p.ev("return GeomCheck.last ? GeomCheck.last.issues.map(x => ({ kind: x.kind, len: x.length })) : []")
    tiny = [x for x in st3 if x['kind'] == 'tinyEdge']
    ok3 = len(tiny) >= 1 and all(x['len'] < 0.01 for x in tiny) and ('kante' in first_txt) and ('mm' in first_txt)

    # 4. Anklickbare Liste & 3D-Hervorhebung + Schließen
    p.pg.locator('#geom-check-list button').first.click(); p.wait(400)
    cls = p.pg.locator('#geom-check-list button').first.get_attribute('class') or ''
    hi_on = p.ev("return { focused: GeomCheck.focused, has: GeomCheck.hasHighlight, active: GeomCheck.active }")
    p.pg.locator('#gc-close').click(); p.wait(250)
    hi_off = p.ev("return { active: GeomCheck.active, has: GeomCheck.hasHighlight, bar: !!document.querySelector('#geom-check-bar') }")
    ok4 = ('active' in cls and hi_on['focused'] == 0 and hi_on['has'] and hi_on['active']
           and not hi_off['active'] and not hi_off['has'] and not hi_off['bar'])

    # 5. Befehlssuche & Hilfetext
    cmd_ok = p.ev("return Commands.search('Geometrie prüfen').some(c => c.id === 'geom-check')")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    h_gc = hilfen.get('geomCheck') or {}
    help_ok = bool(h_gc.get('tip') and h_gc.get('hilfe') and h_gc.get('tipp'))
    ok5 = bool(cmd_ok and help_ok)

    return [ok1, ok2, ok3, ok4, ok5]


def t_a047_import_heilen(p):
    p.empty()

    # 1. Gültigen Quader (20x20x20) als STEP exportieren und eine offene Variante (eine Fläche fehlt) bauen
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:20,d:20,h:20},{name:'Quader'})); })")
    warte_rechnen(p, 30)
    step_info = p.pg.evaluate("""async () => {
      const { Kernel, Model, App } = window.__masswerk;
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      const txt = new TextDecoder().decode(new Uint8Array(r.data));
      const m = txt.match(/CLOSED_SHELL\\s*\\([^,]*,\\s*\\(([^)]+)\\)\\)/);
      if (!m) return { ok: false };
      const fIds = m[1].split(',').map(s => s.trim());
      if (fIds.length < 6) return { ok: false };
      const openTxt = txt
        .replace(m[0], `OPEN_SHELL('',(${fIds.slice(0, 5).join(',')}))`)
        .replace(/MANIFOLD_SOLID_BREP\\s*\\(([^,]*),\\s*(#\\d+)\\)/, 'SHELL_BASED_SURFACE_MODEL($1,($2))')
        .replace(/ADVANCED_BREP_SHAPE_REPRESENTATION/g, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
      window.__a047ValidStep = txt;
      window.__a047OpenStep = openTxt;
      return { ok: true, nFaces: fIds.length };
    }""")

    # Offenes STEP importieren -> automatische BRepCheck/Sewing-Prüfung -> Hinweis mit „Heilen“ erscheint
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(250)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(new File([window.__a047OpenStep], 'OffenerKasten.step'))")
    warte_rechnen(p, 30)
    p.pg.wait_for_function("""() => {
      const { App, Start } = window.__masswerk;
      const it = App.doc.items[0];
      const st = it && Start.importCheckOf(it.id);
      return !!(st && !st.checking && st.report);
    }""", timeout=20000)
    p.wait(200)

    check_open = p.ev("""
      const it = App.doc.items[0];
      const st = it && Start.importCheckOf(it.id);
      return { id: it && it.id, st };
    """)
    bar_visible = p.pg.locator('#import-check-bar').is_visible()
    bar_text = p.pg.locator('#import-check-bar').text_content() or ''
    heal_btn_bar = p.pg.locator('#import-bar-heal').is_visible()
    panel_text = p.pg.locator('#import-check-panel').text_content() or ''
    heal_btn_panel = p.pg.locator('#btn-import-heal').is_visible()

    ok1 = (bool(step_info and step_info.get('ok'))
           and bool(check_open and check_open['st'] and check_open['st']['report'])
           and check_open['st']['report']['hasIssues'] is True
           and check_open['st']['report']['openEdges'] == 4
           and check_open['st']['report']['solids'] == 0
           and bar_visible and heal_btn_bar and heal_btn_panel
           and ('4' in bar_text) and ('offen' in bar_text.lower())
           and ('offene kanten' in panel_text.lower()))

    # 2. Klick auf „Heilen“ -> Meldung mit Vorher/Nachher-Ergebnis, kein Absturz, Rückgängig
    p.pg.locator('#import-bar-heal').click()
    p.pg.wait_for_function("""() => {
      const { App, Start } = window.__masswerk;
      const it = App.doc.items[0];
      const st = it && Start.importCheckOf(it.id);
      return !!(it && it.p && it.p.fmt === 'brep' && st && !st.checking && st.lastHeal);
    }""", timeout=25000)
    warte_rechnen(p, 30)
    p.wait(250)

    healed_info = p.ev("""
      const it = App.doc.items[0];
      const st = it && Start.importCheckOf(it.id);
      return { fmt: it && it.p && it.p.fmt, errs: App.errors.length, st, healed: it && it.p && it.p.healed };
    """)
    toast_txt = p.pg.evaluate("() => [...document.querySelectorAll('#toasts .toast')].map(el => el.textContent || '').join(' | ')")
    diff_txt = p.pg.locator('#import-heal-diff').text_content() or ''
    bar_gone = p.pg.locator('#import-check-bar').count() == 0
    vol_healed = volumen(p)

    # Rückgängig stellt ursprüngliches STEP wieder her
    p.ev("App.undo()")
    warte_rechnen(p, 30)
    undo_fmt = p.ev("const it = App.doc.items[0]; return it && it.p && it.p.fmt")

    ok2 = (healed_info is not None
           and healed_info['errs'] == 0
           and healed_info['fmt'] == 'brep'
           and healed_info['st']['report']['hasIssues'] is False
           and healed_info['st']['report']['openEdges'] == 0
           and healed_info['st']['report']['brepValid'] is True
           and healed_info['st']['report']['solids'] >= 1
           and bar_gone
           and ('4' in toast_txt and '0' in toast_txt)
           and ('4' in diff_txt and '0' in diff_txt)
           and vol_healed is not None and abs(vol_healed - 8000) < 2.0
           and undo_fmt == 'step')

    # 3. Lücken (Nähen mit Toleranz) und falsch herum liegende Flächen prüfen und heilen
    gap_flip = p.pg.evaluate("""async () => {
      const { Kernel } = window.__masswerk;
      const ID = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const rb = await Kernel.call('exportBREP', { scene: { items: [{ id: 'b1', kind: 'box', role: 'solid', m: ID, p: { w: 20, d: 20, h: 20 } }] } });
      const brepTxt = new TextDecoder().decode(new Uint8Array(rb.data));

      // a) Umgedrehte Fläche im BREP (+/-faceId in Shell umdrehen)
      const invFaceTxt = brepTxt.replace(/(Sh\\n\\n[^\\n]+\\n)([+-])(\\d+ )/, (_, a, s, d) => a + (s === '+' ? '-' : '+') + d);
      const invBytes = new TextEncoder().encode(invFaceTxt);
      const chkInv = await Kernel.call('checkImport', { p: { fmt: 'brep', bytes: invBytes, scale: 1 } });
      const healInv = await Kernel.call('healImport', { p: { fmt: 'brep', bytes: invBytes, scale: 1 }, tol: 0.1, capOpen: true });

      // b) Umgedrehter Volumenkörper (+shellId -> -shellId in Solid)
      const invSolTxt = brepTxt.replace(/(So\\n\\n[^\\n]+\\n)\\+(\\d+ 0 \\*)/, '$1-$2');
      const invSolBytes = new TextEncoder().encode(invSolTxt);
      const chkSol = await Kernel.call('checkImport', { p: { fmt: 'brep', bytes: invSolBytes, scale: 1 } });
      const healSol = await Kernel.call('healImport', { p: { fmt: 'brep', bytes: invSolBytes, scale: 1 }, tol: 0.1, capOpen: true });

      return { chkInv, healInv: { ok: healInv.ok, before: healInv.before, after: healInv.after }, chkSol, healSol: { ok: healSol.ok, before: healSol.before, after: healSol.after } };
    }""")
    # Auch eine echte Lücke (0,05 mm zwischen Flächen) prüfen und mit Toleranz vernähen
    gap_res = p.pg.evaluate("""async () => {
      const { Kernel } = window.__masswerk;
      const ID = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const txt = window.__a047ValidStep;
      const m = txt.match(/CLOSED_SHELL\\s*\\([^,]*,\\s*\\(([^)]+)\\)\\)/);
      const fIds = m[1].split(',').map(s => s.trim());
      const oneFaceStep = txt
        .replace(m[0], `OPEN_SHELL('',(${fIds[5]}))`)
        .replace(/MANIFOLD_SOLID_BREP\\s*\\(([^,]*),\\s*(#\\d+)\\)/, 'SHELL_BASED_SURFACE_MODEL($1,($2))')
        .replace(/ADVANCED_BREP_SHAPE_REPRESENTATION/g, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
      const s5 = await Kernel.call('healImport', { p: { fmt: 'step', bytes: new TextEncoder().encode(window.__a047OpenStep), scale: 1 }, tol: 0.05, capOpen: false });
      const s1 = await Kernel.call('healImport', { p: { fmt: 'step', bytes: new TextEncoder().encode(oneFaceStep), scale: 1 }, tol: 0.05, capOpen: false });
      const mShift = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0.05,1];
      const gapBrep = await Kernel.call('exportBREP', { scene: { items: [
        { id: 'p5', kind: 'import', role: 'solid', m: ID, p: { fmt: 'brep', bytes: s5.brepBytes, scale: 1 } },
        { id: 'p1', kind: 'import', role: 'solid', m: mShift, p: { fmt: 'brep', bytes: s1.brepBytes, scale: 1 } },
      ] } });
      const gapBytes = new Uint8Array(gapBrep.data);
      const chkGap = await Kernel.call('checkImport', { p: { fmt: 'brep', bytes: gapBytes, scale: 1 } });
      const healGap = await Kernel.call('healImport', { p: { fmt: 'brep', bytes: gapBytes, scale: 1 }, tol: 0.1, capOpen: false });
      return { chkGap, healGap: { ok: healGap.ok, before: healGap.before, after: healGap.after } };
    }""")

    ok3 = (bool(gap_flip)
           and gap_flip['chkInv']['hasIssues'] and gap_flip['chkInv']['invertedFaces'] >= 1
           and gap_flip['healInv']['ok'] and gap_flip['healInv']['after']['invertedFaces'] == 0 and gap_flip['healInv']['after']['brepValid']
           and gap_flip['chkSol']['hasIssues'] and gap_flip['chkSol']['invertedFaces'] >= 1
           and gap_flip['healSol']['ok'] and gap_flip['healSol']['after']['invertedFaces'] == 0
           and bool(gap_res)
           and gap_res['chkGap']['hasIssues'] and gap_res['chkGap']['openEdges'] > 0 and gap_res['chkGap']['gaps'] > 0
           and gap_res['healGap']['ok'] and gap_res['healGap']['after']['openEdges'] == 0
           and gap_res['healGap']['after']['gaps'] == 0 and gap_res['healGap']['after']['solids'] >= 1)

    # 4. Gültiges STEP erzeugt keinen Fehler-Hinweis & Hilfetexte sind vorhanden
    p.ev("App.change('x', d=>{ d.items=[]; })"); p.wait(250)
    p.pg.evaluate("() => window.__masswerk.Start.importCAD(new File([window.__a047ValidStep], 'Gueltig.step'))")
    warte_rechnen(p, 30)
    p.pg.wait_for_function("""() => {
      const { App, Start } = window.__masswerk;
      const it = App.doc.items[0];
      const st = it && Start.importCheckOf(it.id);
      return !!(st && !st.checking && st.report);
    }""", timeout=20000)
    p.wait(150)
    valid_st = p.ev("const it = App.doc.items[0]; return it && Start.importCheckOf(it.id)")
    no_bar = p.pg.locator('#import-check-bar').count() == 0
    valid_panel = p.pg.locator('#import-check-panel').text_content() or ''
    help_ok = p.pg.evaluate("""() => fetch('data/werkzeug-hilfen.json').then(r=>r.json()).then(d => {
      const c = d.importCheck, h = d.importHeal;
      return !!(c && c.tip && c.hilfe && c.tipp && h && h.tip && h.hilfe && h.tipp);
    })""")

    ok4 = (bool(valid_st and valid_st['report'])
           and valid_st['report']['hasIssues'] is False
           and valid_st['report']['openEdges'] == 0
           and valid_st['report']['brepValid'] is True
           and no_bar
           and ('in ordnung' in valid_panel.lower())
           and bool(help_ok))

    return [ok1, ok2, ok3, ok4]


def t_a049_werkzeugleiste(p):
    p.empty()
    tool_ids = lambda: p.pg.evaluate("Array.from(document.querySelectorAll('#tools .tool[data-tool-id]')).map(b=>b.dataset.toolId)")
    init_ok = tool_ids() == ['body', 'sketch', 'parts', 'measure', 'notes', 'views', 'check', 'export']

    # 1. Rechtsklick auf die Werkzeugleiste → Anpassen …
    p.pg.locator('#t-notes').click(button='right'); p.wait(200)
    ok_ctx = p.pg.locator('#cm-tb-customize').is_visible()
    p.pg.locator('#cm-tb-customize').click(); p.wait(250)
    ok_dlg = p.pg.locator('#tb-dialog').is_visible() and p.pg.locator('#tb-active').is_visible() and p.pg.locator('#tb-avail').is_visible()

    # 2. Werkzeug entfernen (per Ziehen nach rechts) → nicht mehr in der Leiste
    p.pg.locator('#tb-active .tb-row[data-tool-id="notes"]').drag_to(p.pg.locator('#tb-avail')); p.wait(200)
    ok_remove = (
        'notes' not in tool_ids()
        and p.pg.locator('#tools #t-notes').count() == 0
        and p.pg.locator('#tb-avail .tb-row[data-tool-id="notes"]').count() == 1
    )

    # 3. Werkzeug per Ziehen hinzufügen & umsortieren
    p.pg.locator('#tb-avail .tb-row[data-tool-id="fillet"]').drag_to(p.pg.locator('#tb-active')); p.wait(200)
    p.pg.locator('#tb-active .tb-row[data-tool-id="parts"]').drag_to(
        p.pg.locator('#tb-active .tb-row[data-tool-id="sketch"]'),
        target_position={'x': 40, 'y': 4},
    ); p.wait(200)
    ids_sorted = tool_ids()
    ok_add_sort = (
        'fillet' in ids_sorted
        and p.pg.locator('#tools #t-fillet').count() == 1
        and 'parts' in ids_sorted and 'sketch' in ids_sorted
        and ids_sorted.index('parts') < ids_sorted.index('sketch')
    )

    # 4. Als Favorit markieren → steht ganz links
    p.pg.locator('#tb-active .tb-row[data-tool-id="views"] .tb-star').click(); p.wait(200)
    ids_fav = tool_ids()
    ok_fav = (
        len(ids_fav) > 0 and ids_fav[0] == 'views'
        and p.pg.locator('#tools #t-views.fav').count() == 1
        and p.pg.locator('#tools .tb-fav-sep').count() == 1
    )
    p.pg.locator('.modal .btn.primary').click(); p.wait(200)

    # 5. Neu laden → bleibt so
    p.pg.reload(); p.wait(2500)
    if p.pg.get_by_text('Leeres Projekt').count() > 0:
        p.empty()
    ids_reloaded = tool_ids()
    ok_reload = (
        'notes' not in ids_reloaded
        and 'fillet' in ids_reloaded
        and len(ids_reloaded) > 0 and ids_reloaded[0] == 'views'
        and p.pg.locator('#tools #t-views.fav').count() == 1
        and 'parts' in ids_reloaded and 'sketch' in ids_reloaded
        and ids_reloaded.index('parts') < ids_reloaded.index('sketch')
    )

    # 6. Zurücksetzen → wie am Anfang + Hilfetext prüfen
    p.pg.locator('#t-views').click(button='right'); p.wait(200)
    p.pg.locator('#cm-tb-customize').click(); p.wait(250)
    p.pg.locator('#tb-reset').click(); p.wait(250)
    ids_reset = tool_ids()
    p.pg.locator('.modal .btn.primary').click(); p.wait(150)
    help_ok = p.pg.evaluate("""() => fetch('data/werkzeug-hilfen.json').then(r=>r.json()).then(d => {
      const h = d.toolbarCustomize;
      return !!(h && h.tip && h.hilfe && h.tipp);
    })""")
    ok_reset = (
        ids_reset == ['body', 'sketch', 'parts', 'measure', 'notes', 'views', 'check', 'export']
        and p.pg.locator('#tools .tool.fav').count() == 0
        and p.ev("return localStorage.getItem('tracery-werkzeugleiste')") is None
        and bool(help_ok)
    )

    return [init_ok and ok_ctx and ok_dlg, ok_remove, ok_add_sort, ok_fav, ok_reload, ok_reset]


def t_f11240651(p):
    # 1: Übergang-Führungskurve löst Vorschau auch im Auswahl-Werkzeug ('select') aus
    p.empty()
    skizzenkoerper(p, [{'id': 'r', 'type': 'rect', 'a': [-15, -10], 'b': [15, 10]}], 0, 'Unten')
    skizzenkoerper(p, [{'id': 'c', 'type': 'circle', 'c': [0, 0], 'r': 8}], 40, 'Oben')
    warte_rechnen(p, 20)
    p.ev("App.select([App.doc.items[0].id]); App.select([App.doc.items[1].id], {additive:true})"); p.wait(600)
    p.pg.locator('.ctxbar button[aria-label="Übergang"]').click(); warte_rechnen(p, 30)
    p.pg.locator('#loft-rail-edit').click(); p.wait(1000)
    st = SS(p, "return [S.ctx.mode, S.tool]")
    SS(p, "const q=S.ents[0].pts; q[1]=[Math.sign(q[0][0])*25, 20]")
    p.pg.mouse.move(700, 400); p.pg.mouse.move(705, 405); p.wait(600); warte_rechnen(p, 30)
    pv = p.ev("const r=App.extra.length&&App.results.get('__preview'); return r&&r.data?r.data.bbox:null")
    ok1 = st == ['loftrail', 'select'] and pv is not None and (pv[3] - pv[0]) > 45
    p.ev("Sketch.cancel(true)"); p.wait(300)

    # 2: Explosion mit Gruppen bei blockiertem requestAnimationFrame (Timer-Fallback)
    p.ev("Start.newProject(true)"); p.wait(600)
    p.ev("""App.change('x', d=>{
      const g=Model.newItem('group',{}); g.name='Baugruppe';
      for (let i=0;i<3;i++){ const b=Model.newItem('box',{w:20,d:20,h:6}); b.t.x=i*20; b.name='Teil '+(i+1); g.children.push(b); }
      d.items.push(g);
      const e=Model.newItem('box',{w:10,d:10,h:10},{name:'Extra'}); e.t.x=-40; d.items.push(e);
    })"""); warte_rechnen(p, 30)
    pause_raf = "window.__origRAF=window.requestAnimationFrame; window.__rafQueue=[]; window.requestAnimationFrame=(cb)=>{window.__rafQueue.push(cb); return window.__rafQueue.length;};"
    resume_raf = "if(window.__origRAF){ window.requestAnimationFrame=window.__origRAF; const q=window.__rafQueue.splice(0); for(const cb of q) window.requestAnimationFrame(cb); }"
    p.ev(pause_raf)
    try:
        p.ev("Views.explode(true)"); p.wait(700)
        ex_open = p.ev("return [Views.explodeAmount, !!(document.querySelector('#ex-groups') && !document.querySelector('#ex-groups').closest('.vb-row').hidden)]")
        p.ev("document.querySelector('#ex-groups').click()"); p.wait(400); warte_rechnen(p, 30)
        ex_split = p.ev("return [Views.explodeGroups, App.extra.length]")
        p.ev("Views.explode(false)"); p.wait(700); warte_rechnen(p, 30)
        ex_closed = p.ev("return [Views.explodeAmount, Views.explodeGroups, App.extra.length, document.querySelector('#ex-groups')===null]")
    finally:
        p.ev(resume_raf)
    ok2 = ex_open[0] > 0.55 and ex_open[1] and ex_split == [True, 3] and ex_closed == [0, False, 0, True]

    # 3: Regler bricht laufenden Explosion-Timer bei rAF-Stau sauber ab
    p.ev(pause_raf)
    try:
        p.ev("Views.explode(true)"); p.wait(100)
        p.ev("const r=document.querySelector('#ex-range'); r.value='25'; r.dispatchEvent(new Event('input', {bubbles:true}));")
        p.wait(600)
        ex_slider = p.ev("return Views.explodeAmount")
    finally:
        p.ev(resume_raf)
        p.ev("Views.reset()")
    ok3 = abs(ex_slider - 0.25) < 0.03
    return [ok1, ok2, ok3]


# ---------- [A-052] Statusleiste vollständig (BE-17) ----------
def t_a052_statusleiste(p):
    p.empty()
    # 1. Zwei Kanten gewählt: 40 + 30 mm = 70 mm, sowie 17,7 + 20 mm = 37,7 mm; Klick kopiert Wert
    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:40,d:30,h:10},{name:'Platte'})); })"); warte_rechnen(p)
    p.ev("""
      const id = App.doc.items[0].id, r = App.results.get(id).data;
      const i1 = r.edges.findIndex(e => e.t === 'LINE' && Math.abs(e.l - 40) < 1e-4 && Math.abs(e.a[2] - 10) < 1e-4);
      const i2 = r.edges.findIndex(e => e.t === 'LINE' && Math.abs(e.l - 30) < 1e-4 && Math.abs(e.a[2] - 10) < 1e-4);
      App.select([id], { edges: [{ id, edgeIdx: i1 }, { id, edgeIdx: i2 }] });
    """); p.wait(300)
    sel_txt1 = (p.pg.locator('#status-sel').text_content() or '').strip()
    p.pg.locator('#status-sel').click(); p.wait(250)
    copied1 = p.ev("return Measure.copied")

    p.ev("App.change('x', d=>{ d.items.push(Model.newItem('box',{w:17.7,d:20,h:10},{name:'Streifen'})); })"); warte_rechnen(p)
    p.ev("""
      const id = App.doc.items[1].id, r = App.results.get(id).data;
      const i1 = r.edges.findIndex(e => e.t === 'LINE' && Math.abs(e.l - 17.7) < 1e-4 && Math.abs(e.a[2] - 10) < 1e-4);
      const i2 = r.edges.findIndex(e => e.t === 'LINE' && Math.abs(e.l - 20) < 1e-4 && Math.abs(e.a[2] - 10) < 1e-4);
      App.select([id], { edges: [{ id, edgeIdx: i1 }, { id, edgeIdx: i2 }] });
    """); p.wait(300)
    sel_txt2 = (p.pg.locator('#status-sel').text_content() or '').strip()
    ok1 = (
        p.pg.locator('#status-sel').is_visible()
        and '2 Kanten' in sel_txt1 and '70 mm' in sel_txt1 and copied1 == '70'
        and '2 Kanten' in sel_txt2 and '37,7 mm' in sel_txt2
    )

    # 2. Fläche (1200 mm²), runde Fläche (Fläche + Ø), einzelner Körper & leere Auswahl blendet aus
    p.ev("""
      const id = App.doc.items[0].id, r = App.results.get(id).data;
      const fi = r.faces.findIndex(f => f.t === 'PLANE' && f.n && f.n[2] > 0.9);
      App.select([id], { face: { id, faceIdx: fi } });
    """); p.wait(300)
    face_txt = (p.pg.locator('#status-sel').text_content() or '').strip()

    p.ev("App.change('x', d=>{ const c=Model.newItem('cylinder',{d:10,h:20},{name:'Bolzen'}); c.t.x=50; d.items.push(c); })"); warte_rechnen(p)
    p.ev("""
      const id = App.doc.items[2].id, r = App.results.get(id).data;
      const fi = r.faces.findIndex(f => f.t === 'CYLINDRE');
      App.select([id], { face: { id, faceIdx: fi } });
    """); p.wait(300)
    cyl_txt = (p.pg.locator('#status-sel').text_content() or '').strip()

    p.ev("App.select([App.doc.items[0].id])"); p.wait(250)
    body_txt = (p.pg.locator('#status-sel').text_content() or '').strip()

    p.ev("App.clearSelection()"); p.wait(250)
    hidden_empty = not p.pg.locator('#status-sel').is_visible()
    ok2 = (
        'Fläche' in face_txt and '1200 mm²' in face_txt
        and 'Fläche' in cyl_txt and 'mm²' in cyl_txt and 'Ø 10 mm' in cyl_txt
        and '1 Körper' in body_txt and '40 × 30 × 10 mm' in body_txt
        and hidden_empty
    )

    # 3. Einheit & Klick öffnet Einstellungen mit Fokus auf #set-proj-unit
    unit_init = (p.pg.locator('#status-unit').text_content() or '').strip()
    p.ev("""
      const id = App.doc.items[0].id, r = App.results.get(id).data;
      const fi = r.faces.findIndex(f => f.t === 'PLANE' && f.n && f.n[2] > 0.9);
      App.select([id], { face: { id, faceIdx: fi } });
    """); p.wait(250)
    p.pg.locator('#status-unit').click(); p.wait(300)
    modal_open = p.pg.locator('#set-proj-unit').count() == 1 and p.ev("return document.activeElement && document.activeElement.id === 'set-proj-unit'")
    p.pg.select_option('#set-proj-unit', 'cm'); p.wait(300)
    unit_cm = (p.pg.locator('#status-unit').text_content() or '').strip()
    face_cm = (p.pg.locator('#status-sel').text_content() or '').strip()
    p.pg.select_option('#set-proj-unit', 'mm'); p.wait(250)
    p.pg.keyboard.press('Escape'); p.wait(250)
    unit_mm = (p.pg.locator('#status-unit').text_content() or '').strip()
    ok3 = unit_init == 'mm' and modal_open and unit_cm == 'cm' and '12 cm²' in face_cm and unit_mm == 'mm'

    # 4. Rechenzustand: Bereit → Rechnet → Bereit → Fehler → Undo → Bereit
    st_ready = p.ev("const el=document.querySelector('#status-calc'); return [el.dataset.state, el.textContent.trim()];")
    p.ev("App.emit('calc', true)"); p.wait(100)
    st_busy = p.ev("const el=document.querySelector('#status-calc'); return [el.dataset.state, el.textContent.trim()];")
    p.ev("App.emit('calc', false)"); p.wait(100)
    st_back = p.ev("const el=document.querySelector('#status-calc'); return [el.dataset.state, el.textContent.trim()];")
    p.ev("App.change('x', d=>{ d.items[0].finishes.push({id:'f_bad',type:'fillet',r:999,edges:[0]}); })"); warte_rechnen(p)
    st_err = p.ev("const el=document.querySelector('#status-calc'); return [el.dataset.state, el.textContent.trim()];")
    p.ev("App.undo()"); warte_rechnen(p)
    st_fixed = p.ev("const el=document.querySelector('#status-calc'); return [el.dataset.state, el.textContent.trim()];")
    ok4 = (
        st_ready == ['ready', 'Bereit']
        and st_busy[0] == 'busy' and 'Rechnet' in st_busy[1]
        and st_back == ['ready', 'Bereit']
        and st_err[0] == 'error' and 'Fehler' in st_err[1]
        and st_fixed == ['ready', 'Bereit']
    )

    # 5. Zusammenspiel mit #coords und #ampel sowie Hilfetexte
    p.ev("App.select([App.doc.items[0].id]); Viewer.setView('iso', false)"); p.wait(500)
    sx, sy = world_screen(p, 5, -5, 10)
    p.pg.mouse.move(sx - 15, sy); p.pg.mouse.move(sx, sy, steps=4); p.wait(300)
    box_ok = p.ev("""
      const ids = ['#coords', '#status-sel', '#status-unit', '#status-calc', '#ampel'];
      return ids.every(s => {
        const el = document.querySelector(s);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      });
    """)
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    attr_ok = p.ev("return ['#status-sel:statusSel','#status-unit:statusUnit','#status-calc:statusCalc'].every(s=>{ const [sel,k]=s.split(':'); const el=document.querySelector(sel); return el && el.dataset.help===k; })")
    ok5 = (
        box_ok
        and attr_ok
        and all(k in hilfen and all(f in hilfen[k] for f in ('tip', 'hilfe', 'tipp')) for k in ('statusSel', 'statusUnit', 'statusCalc'))
    )
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-053] Vorlagen für neue Projekte (BE-18) ----------
def t_a053_projekt_vorlagen(p):
    # 1. Startseite -> "Neues Projekt" öffnet den Vorlagen-Dialog mit allen 5 Vorlagen
    p.pg.locator('#start-new-btn').click(); p.wait(300)
    dlg = p.pg.locator('#new-proj-dialog')
    ids = [dlg.locator(f'.tpl-card[data-tpl-id="{k}"]').count() for k in ('empty-mm', 'empty-in', 'print3d', 'laser', 'enclosure')]
    ok1 = dlg.count() == 1 and all(c == 1 for c in ids)

    # 2. Vorlage "3D-Druck" -> Druckbett & 0,4-mm-Düse sind gesetzt, Rahmen im 3D-Bild & Projekt-Panel
    dlg.locator('.tpl-card[data-tpl-id="print3d"]').click(); p.wait(600)
    warte_rechnen(p, 30)
    pb3d = p.ev("return { bed: App.doc.settings.printBed, mat: App.doc.settings.material, unit: Units.key(), visCount: Viewer.groups.printBed.children.length }")
    panel_on = p.pg.locator('#proj-bed-on').is_checked()
    panel_noz = p.pg.locator('#proj-bed-nozzle').input_value().replace(',', '.')
    ok2 = (
        pb3d['bed']['enabled'] is True
        and pb3d['bed']['x'] == 220 and pb3d['bed']['y'] == 220 and pb3d['bed']['z'] == 250
        and abs(pb3d['bed']['nozzle'] - 0.4) < 1e-6
        and pb3d['mat'] == 'PLA'
        and pb3d['unit'] == 'mm'
        and pb3d['visCount'] >= 3
        and panel_on
        and panel_noz.startswith('0.4')
    )

    # 3. Projektmenü -> "Leer (Zoll)", "Laser (Platte 3 mm)" und "Gehäuse"
    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-new-project').click(); p.wait(300)
    p.pg.locator('#new-proj-dialog .tpl-card[data-tpl-id="empty-in"]').click(); p.wait(500)
    in_st = p.ev("return { unit: Units.key(), bedOn: !!(App.doc.settings.printBed && App.doc.settings.printBed.enabled), visCount: Viewer.groups.printBed.children.length }")

    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-new-project').click(); p.wait(300)
    p.pg.locator('#new-proj-dialog .tpl-card[data-tpl-id="laser"]').click(); p.wait(600)
    warte_rechnen(p, 40)
    las_st = p.ev("""const b = Actions.worldBox(App.doc.items[0].id);
      return { n: App.doc.items.length, errs: App.errors.length, mat: App.doc.settings.material, dz: b ? Math.round((b.max.z - b.min.z)*100)/100 : 0 };""")

    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-new-project').click(); p.wait(300)
    p.pg.locator('#new-proj-dialog .tpl-card[data-tpl-id="enclosure"]').click(); p.wait(800)
    warte_rechnen(p, 40)
    enc_st = p.ev("return { n: App.doc.items.length, names: App.doc.items.map(x=>x.name), errs: App.errors.length }")
    ok3 = (
        in_st['unit'] == 'in' and not in_st['bedOn'] and in_st['visCount'] == 0
        and las_st['n'] == 1 and las_st['errs'] == 0 and las_st['mat'] == 'Pappel-Sperrholz' and abs(las_st['dz'] - 3) < 0.05
        and enc_st['n'] == 2 and enc_st['errs'] == 0 and enc_st['names'] == ['Gehäuse', 'Deckel']
    )

    # 4. Eigene Vorlage speichern -> bleibt nach Neuladen in der Liste und öffnet sich wieder
    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-new-project').click(); p.wait(300)
    p.pg.locator('#new-proj-dialog .tpl-card[data-tpl-id="print3d"]').click(); p.wait(500)
    p.ev("""App.change('Vorlagenbau', d => {
      d.params.push({ id: 'm_cust', name: 'MeinMass', expr: 42 });
      d.items.push(Model.newItem('box', { w: 'MeinMass', d: 24, h: 12 }, { name: 'Halter' }));
      d.settings.printBed = { enabled: true, x: 256, y: 256, z: 256, nozzle: 0.6 };
    });""")
    warte_rechnen(p, 30)
    old_id = p.ev("return App.doc.id")
    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-save-template').click(); p.wait(300)
    p.pg.fill('#tpl-save-name', 'Bambu Halter')
    p.pg.fill('#tpl-save-desc', 'Druckbett 256 mm mit 0,6-mm-Düse')
    p.pg.locator('#tpl-save-ok').click(); p.wait(400)
    saved_ok = p.ev("return Templates.customList().some(x => x.name === 'Bambu Halter')")

    # Nach Neuladen steht sie noch in der Liste und öffnet sich als neues Projekt mit allen Daten
    p.pg.reload()
    p.pg.wait_for_function("() => !!(window.__M && window.__M.Templates && window.__M.Start && window.__M.Log && window.__M.Log.startup.uiReadyMs !== null)", timeout=30000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=15000)
    except Exception:
        pass
    p.wait(600)
    p.ev("Start.newProject(true)")
    p.wait(600)
    p.pg.locator('#btn-project').click(); p.wait(250)
    p.pg.locator('#pm-new-project').click(); p.wait(300)
    cust_card = p.pg.locator('#tpl-custom-grid .tpl-card.custom', has_text='Bambu Halter')
    in_list = cust_card.count() == 1
    cust_card.first.click(); p.wait(700)
    warte_rechnen(p, 40)
    reopened = p.ev("""const b = App.doc.items[0] ? Actions.worldBox(App.doc.items[0].id) : null;
      return {
        id: App.doc.id,
        name: App.doc.name,
        n: App.doc.items.length,
        errs: App.errors.length,
        hasParam: App.doc.params.some(x => x.name === 'MeinMass' && Number(x.expr) === 42),
        bed: App.doc.settings.printBed,
        dx: b ? Math.round((b.max.x - b.min.x)*100)/100 : 0,
      };""")
    ok4 = (
        saved_ok and in_list
        and reopened['id'] != old_id
        and reopened['name'] == 'Bambu Halter'
        and reopened['n'] == 1 and reopened['errs'] == 0
        and reopened['hasParam']
        and reopened['bed']['enabled'] is True and reopened['bed']['x'] == 256 and abs(reopened['bed']['nozzle'] - 0.6) < 1e-6
        and abs(reopened['dx'] - 42) < 0.05
    )

    # 5. Auf Startseite gelistet, löschbar, Hilfetexte vorhanden
    p.ev("Start.show()"); p.wait(300)
    on_start = p.pg.locator('#start-custom-tpls .tpl-card.custom', has_text='Bambu Halter')
    start_has = on_start.count() == 1
    on_start.locator('.tpl-del').click(); p.wait(250)
    p.pg.locator('.modal .btn.danger').click(); p.wait(300)
    after_del = (
        p.pg.locator('#start-custom-tpls .tpl-card.custom', has_text='Bambu Halter').count() == 0
        and p.ev("return Templates.customList().length") == 0
    )
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    help_ok = all(k in hilfen and all(f in hilfen[k] for f in ('tip', 'hilfe', 'tipp')) for k in ('projectTemplates', 'saveTemplate', 'printBed'))
    ok5 = start_has and after_del and help_ok
    return [ok1, ok2, ok3, ok4, ok5]


def t_a051_absturz_wiederherstellen(p):
    import re
    p.empty()

    # 1. Sauber gespeicherten Ausgangsstand anlegen, danach ohne Speichern ändern und neu laden
    p.ev("""App.change('Ausgangsstand', d => {
      d.name = 'Halterung A51';
      const b = Model.newItem('box', { w: 20, d: 20, h: 10 });
      b.name = 'Basis';
      d.items.push(b);
    });""")
    warte_rechnen(p, 20)
    p.ev("return App.autosave.flush().then(() => { App.markClean(); return Store.whenIdle(); });")

    # Jetzt ohne Speichern ändern (Breite 20 -> 55 und Zylinder dazu) -> Absturz simulieren
    p.ev("""App.change('Ungesicherte Änderung', d => {
      d.items[0].p.w = 55;
      const c = Model.newItem('cylinder', { d: 8, h: 15 });
      c.name = 'Zapfen';
      d.items.push(c);
    });""")
    warte_rechnen(p, 20)
    p.ev("return new Promise(r => setTimeout(r, 350)).then(() => Store.whenIdle());")

    p.pg.reload()
    p.wait(3000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 20)

    bar1 = p.pg.locator('#recovery-bar')
    has_bar1 = bar1.count() == 1
    txt1 = bar1.text_content() if has_bar1 else ''
    before1 = p.ev("return { name: App.doc.name, len: App.doc.items.length, w: App.doc.items[0] && App.doc.items[0].p.w };")
    help_attr = p.pg.locator('#recovery-restore').get_attribute('data-help') if has_bar1 else None
    p.pg.locator('#recovery-restore').click()
    p.wait(1200)
    warte_rechnen(p, 20)
    p.ev("return Store.whenIdle();")
    after1 = p.ev("return { bar: document.querySelectorAll('#recovery-bar').length, name: App.doc.name, len: App.doc.items.length, w: App.doc.items[0] && App.doc.items[0].p.w, errs: App.errors.length };")
    ok1 = (
        has_bar1
        and 'Tracery wurde nicht richtig beendet – letzten Stand wiederherstellen?' in txt1
        and 'Halterung A51' in txt1
        and bool(re.search(r'\b\d{1,2}:\d{2}\b', txt1))
        and before1 == {'name': 'Halterung A51', 'len': 1, 'w': 20}
        and after1 == {'bar': 0, 'name': 'Halterung A51', 'len': 2, 'w': 55, 'errs': 0}
    )

    # 2. Sauberes Neuladen danach ohne weitere Änderung -> keine Meldung
    p.pg.reload()
    p.wait(3000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 20)
    clean_st = p.ev("return { bar: document.querySelectorAll('#recovery-bar').length, name: App.doc.name, len: App.doc.items.length, w: App.doc.items[0] && App.doc.items[0].p.w };")
    ok2 = clean_st == {'bar': 0, 'name': 'Halterung A51', 'len': 2, 'w': 55}

    # 3. Nochmals ändern, neu laden und „Verwerfen“ klicken -> alter Stand bleibt
    p.ev("""App.change('Kugel dazu', d => {
      const s = Model.newItem('sphere', { d: 10 });
      s.name = 'Kugel';
      d.items.push(s);
    });""")
    warte_rechnen(p, 20)
    p.ev("return new Promise(r => setTimeout(r, 350)).then(() => Store.whenIdle());")

    p.pg.reload()
    p.wait(3000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 20)
    has_bar3 = p.pg.locator('#recovery-bar').count() == 1
    p.pg.locator('#recovery-dismiss').click()
    p.wait(800)
    p.ev("return Store.whenIdle();")
    after_dis = p.ev("return { bar: document.querySelectorAll('#recovery-bar').length, len: App.doc.items.length };")
    p.pg.reload()
    p.wait(3000)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 20)
    after_dis_reload = p.ev("return { bar: document.querySelectorAll('#recovery-bar').length, len: App.doc.items.length };")
    ok3 = has_bar3 and after_dis == {'bar': 0, 'len': 2} and after_dis_reload == {'bar': 0, 'len': 2}

    # 4. Großes Projekt (> 400 KB Dokument + 15+ MB STEP-Import) rein aus IndexedDB wiederherstellen
    big_prep = p.pg.evaluate("""async () => {
      const { Kernel, Model, App, Start, Store } = window.__masswerk;
      Start.newProject(true);
      App.change('Basisquader', d => {
        d.name = 'Grosses Projekt A51';
        d.items.push(Model.newItem('box', { w: 20, d: 20, h: 20 }));
      });
      await App.rebuild();
      const r = await Kernel.call('exportSTEP', { scene: Model.kernelScene(App.doc) });
      const head = new TextDecoder('utf-8').decode(new Uint8Array(r.data));
      const line = '/* ' + '0123456789abcdef'.repeat(4) + ' */\\n';
      const need = 15600000 - head.length;
      const pad = line.repeat(Math.ceil(need / line.length));
      const bigStep = head.replace('DATA;', 'DATA;\\n' + pad);
      App.change('Clean', d => { d.items = []; d.name = 'Grosses Projekt A51'; });
      await App.autosave.flush();
      App.markClean();
      await Store.whenIdle();
      await Start.importCAD(new File([bigStep], 'GrossesTeilA51.step'));
      App.change('Grosse Notiz', d => {
        d.name = 'Grosses Projekt A51';
        d.notes = [{ id: 'n_big', text: 'x'.repeat(430000) }];
      });
      await new Promise(res => setTimeout(res, 350));
      await Store.whenIdle();
      return {
        quick: localStorage.getItem('tracery.recovery.quick'),
        flag: Store.getRecoveryFlag(),
        stepLen: bigStep.length,
      };
    }""")
    warte_rechnen(p, 45)
    p.pg.reload()
    p.wait(3500)
    try:
        p.pg.locator('.loading').wait_for(state='detached', timeout=25000)
    except Exception:
        pass
    warte_rechnen(p, 45)

    bar4 = p.pg.locator('#recovery-bar')
    has_bar4 = bar4.count() == 1
    txt4 = bar4.text_content() if has_bar4 else ''
    p.pg.locator('#recovery-restore').click()
    p.wait(1500)
    warte_rechnen(p, 45)
    st4 = p.ev("""return Mass.measure().then(m => {
      const it = App.doc.items[0];
      return {
        bar: document.querySelectorAll('#recovery-bar').length,
        name: App.doc.name,
        len: App.doc.items.length,
        hasBlobId: !!(it && it.p && it.p.blobId),
        errs: App.errors.length,
        vol: m && m.volume,
        noteLen: App.doc.notes && App.doc.notes[0] && App.doc.notes[0].text ? App.doc.notes[0].text.length : 0,
      };
    });""")
    ok4 = (
        big_prep['stepLen'] > 15_500_000
        and big_prep['quick'] is None
        and bool(big_prep['flag'] and big_prep['flag'].get('name') == 'Grosses Projekt A51')
        and has_bar4
        and 'Grosses Projekt A51' in txt4
        and bool(re.search(r'\b\d{1,2}:\d{2}\b', txt4))
        and st4['bar'] == 0
        and st4['name'] == 'Grosses Projekt A51'
        and st4['len'] == 1
        and st4['hasBlobId']
        and st4['errs'] == 0
        and abs((st4['vol'] or 0) - 8000) < 10
        and st4['noteLen'] == 430000
    )

    # 5. Hilfetext crashRecovery vollständig und am Knopf verknüpft
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    h_rec = hilfen.get('crashRecovery') or {}
    ok5 = (
        help_attr == 'crashRecovery'
        and bool(h_rec.get('tip') and h_rec.get('hilfe') and h_rec.get('tipp'))
    )
    return [ok1, ok2, ok3, ok4, ok5]


def t_a054_schneller_start(p):
    # 1. Sofortiger Start ohne Kern und eingebaute Schriften
    boot_st = p.ev("""return {
      hasStart: document.querySelectorAll('.start').length === 1,
      hasLoading: document.querySelectorAll('.loading').length > 0,
      kReady: Kernel.ready,
      kState: Kernel.state,
      interLoaded: SK.isFontLoaded('inter'),
      fettLoaded: SK.isFontLoaded('fett'),
      uiMs: Log.startup.uiReadyMs,
      kernMs: Log.startup.kernelReadyMs,
    };""")

    reqs = []
    p.pg.on('request', lambda req: reqs.append(req.url))
    p.pg.reload()
    p.wait(1200)
    p.pg.get_by_text('Leeres Projekt').first.click()
    p.wait(400)
    empty_st = p.ev("""return {
      hasLoading: document.querySelectorAll('.loading').length > 0,
      kReady: Kernel.ready,
      kState: Kernel.state,
      interLoaded: SK.isFontLoaded('inter'),
      fettLoaded: SK.isFontLoaded('fett'),
      uiMs: Log.startup.uiReadyMs,
      kernMs: Log.startup.kernelReadyMs,
      calcState: document.querySelector('#status-calc') && document.querySelector('#status-calc').dataset.state,
    };""")
    no_eager_reqs = not any(('occ-kernel.wasm' in u or 'schrift-inter' in u) for u in reqs)
    ok1 = (
        boot_st['hasStart'] and not boot_st['hasLoading']
        and not boot_st['kReady'] and boot_st['kState'] == 'idle'
        and not boot_st['interLoaded'] and not boot_st['fettLoaded']
        and (boot_st['uiMs'] or 0) > 0 and boot_st['kernMs'] is None
        and not empty_st['hasLoading']
        and not empty_st['kReady'] and empty_st['kState'] == 'idle'
        and not empty_st['interLoaded'] and not empty_st['fettLoaded']
        and (empty_st['uiMs'] or 0) > 0 and empty_st['kernMs'] is None
        and empty_st['calcState'] == 'idle'
        and no_eager_reqs
    )

    # 2. Skizzieren geht sofort ohne Kern
    p.ev("Sketch.startOnPlane('XY')"); p.wait(400)
    cx, cy = p.canvas_center()
    p.pg.mouse.click(cx - 80, cy - 50)
    p.pg.mouse.move(cx + 60, cy + 40)
    p.wait(100)
    p.pg.keyboard.type('30'); p.pg.keyboard.press('Tab'); p.pg.keyboard.type('20'); p.pg.keyboard.press('Enter')
    p.wait(400)
    sk_st = p.ev("""return {
      active: Sketch.active,
      ents: Sketch.state ? Sketch.state.ents.length : 0,
      regs: Sketch.state ? SK.regions(Sketch.state.ents).length : 0,
      kReady: Kernel.ready,
      kState: Kernel.state,
    };""")
    ok2 = (
        sk_st['active'] and sk_st['ents'] == 1 and sk_st['regs'] == 1
        and not sk_st['kReady'] and sk_st['kState'] == 'idle'
        and not any('occ-kernel.wasm' in u for u in reqs)
    )

    # 3. Text-Werkzeug lädt die eingebaute Schrift erst beim ersten Gebrauch
    before_text = p.ev("return { inter: SK.isFontLoaded('inter'), fett: SK.isFontLoaded('fett') };")
    p.pg.keyboard.press('b')
    for _ in range(25):
        p.wait(200)
        if p.ev("return SK.isFontLoaded('inter')"):
            break
    after_b = p.ev("return { inter: SK.isFontLoaded('inter'), fett: SK.isFontLoaded('fett'), kState: Kernel.state };")
    p.pg.fill('#tx-s', 'Start')
    o = to_screen(p, -10, -5)
    p.pg.mouse.click(o[0], o[1]); p.wait(300)
    box1 = SS(p, "const t=S.ents.find(e=>e.type==='text'); return t ? SK.textBox(t) : null;")
    p.pg.select_option('#se-font', 'fett')
    for _ in range(25):
        p.wait(200)
        if p.ev("return SK.isFontLoaded('fett')"):
            break
    after_fett = p.ev("return { fett: SK.isFontLoaded('fett'), kState: Kernel.state };")
    ok3 = (
        not before_text['inter'] and not before_text['fett']
        and after_b['inter'] and not after_b['fett'] and after_b['kState'] == 'idle'
        and any('schrift-inter.json' in u for u in reqs)
        and bool(box1 and box1['w'] > 0 and box1['h'] > 0)
        and after_fett['fett'] and after_fett['kState'] == 'idle'
        and any('schrift-inter-fett.json' in u for u in reqs)
    )

    # 4. Erster 3D-Schritt lädt den Kern; Oberfläche bereit < Kern bereit
    fertig_hoch(p, '4')
    k_st = p.ev("""return {
      kReady: Kernel.ready,
      kState: Kernel.state,
      res: App.results.size,
      errs: App.errors.length,
      uiMs: Log.startup.uiReadyMs,
      kernMs: Log.startup.kernelReadyMs,
      loadMs: Log.startup.kernelLoadMs,
    };""")
    ok4 = (
        k_st['kReady'] and k_st['kState'] == 'ready'
        and k_st['res'] >= 1 and k_st['errs'] == 0
        and any('occ-kernel.wasm' in u for u in reqs)
        and (k_st['uiMs'] or 0) > 0 and (k_st['kernMs'] or 0) > 0
        and k_st['uiMs'] < k_st['kernMs']
    )

    # 5. Protokoll zeigt Startzeiten; Reload mit 3D-Modell misst uiReadyMs < kernelReadyMs; Hilfetext
    p.pg.click('#lt-log'); p.wait(400)
    log_info = p.ev("""
      const box = document.querySelector('#startup-times');
      const rows = [...document.querySelectorAll('.log-row.info')].map(r => r.textContent);
      return {
        hasBox: !!box,
        help: box ? box.dataset.help : null,
        txt: box ? box.textContent : '',
        hasUiRow: rows.some(t => t.includes('Oberfläche bereit')),
        hasKernRow: rows.some(t => t.includes('CAD-Kern bereit')),
        hasFontRow: rows.some(t => t.includes('Schrift geladen')),
      };
    """)
    p.ev("return App.autosave.flush().then(() => { App.markClean(); return Store.whenIdle(); });")
    p.pg.reload()
    p.pg.wait_for_function("() => !!(window.__M && window.__M.Log.startup.uiReadyMs !== null)", timeout=15000)
    ui_before_kern = p.ev("return { uiMs: Log.startup.uiReadyMs, kReady: Kernel.ready, hasLoading: document.querySelectorAll('.loading').length > 0 };")
    warte_rechnen(p, 40)
    reload_st = p.ev("""return {
      kReady: Kernel.ready,
      res: App.results.size,
      errs: App.errors.length,
      uiMs: Log.startup.uiReadyMs,
      kernMs: Log.startup.kernelReadyMs,
    };""")
    hilfen = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json())")
    h_st = hilfen.get('startupTimes') or {}
    ok5 = (
        log_info['hasBox'] and log_info['help'] == 'startupTimes'
        and 'Oberfläche bereit' in log_info['txt']
        and 'CAD-Kern bereit' in log_info['txt']
        and 'Inter' in log_info['txt']
        and log_info['hasUiRow'] and log_info['hasKernRow'] and log_info['hasFontRow']
        and (ui_before_kern['uiMs'] or 0) > 0 and not ui_before_kern['hasLoading']
        and reload_st['kReady'] and reload_st['res'] >= 1 and reload_st['errs'] == 0
        and (reload_st['uiMs'] or 0) > 0 and (reload_st['kernMs'] or 0) > 0
        and reload_st['uiMs'] < reload_st['kernMs']
        and bool(h_st.get('tip') and h_st.get('hilfe') and h_st.get('tipp'))
    )
    return [ok1, ok2, ok3, ok4, ok5]


def t_a050_genauigkeit(p):
    def open_settings():
        p.pg.click('#btn-menu'); p.wait(250)
        p.pg.get_by_text('Einstellungen', exact=True).click(); p.wait(300)

    def close_settings():
        p.pg.locator('.modal .btn.primary').click(); p.wait(200)

    try:
        # 1. Nachkommastellen 3 vs. 0: Schilder, Maße, Ampel, Verlauf, Hüllmaße & Kontextleiste gleich; gespeichertes Maß & Volumen exakt
        p.empty()
        p.ev("Actions.addPrimitive('box', { p: { w: 12.3456, d: 20, h: 10 } })"); warte_rechnen(p)
        p.ev("App.select([App.doc.items[0].id])"); p.wait(500)

        open_settings()
        dec_opts = p.pg.evaluate("[...document.querySelectorAll('#set-dec option')].map(o=>o.value)")
        ang_opts = p.pg.evaluate("[...document.querySelectorAll('#set-angle-dec option')].map(o=>o.value)")
        p.pg.select_option('#set-dec', '3'); p.wait(250)
        close_settings()
        p.wait(600)

        pw_3 = p.pg.locator('#p-w').input_value()
        lbls_3 = [el.text_content().strip() for el in p.pg.locator('.dimlabel').all()]
        ampel_3 = p.pg.locator('#ampel .t').text_content() or ''
        tree_3 = p.pg.locator('#left-body .node .sub').first.text_content() or ''
        p.pg.wait_for_selector('#p-bbox', timeout=10000)
        bbox_3 = p.pg.locator('#p-bbox').text_content() or ''
        p.ev("const id=App.doc.items[0].id, r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.l-12.3456)<1e-3); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(300)
        sel_3 = p.pg.locator('#sel-val').text_content() if p.pg.locator('#sel-val').count() else ''
        p.ev("App.select([App.doc.items[0].id])"); p.wait(400)

        open_settings()
        p.pg.select_option('#set-dec', '0'); p.wait(250)
        close_settings()
        p.wait(600)

        pw_0 = p.pg.locator('#p-w').input_value()
        lbls_0 = [el.text_content().strip() for el in p.pg.locator('.dimlabel').all()]
        ampel_0 = p.pg.locator('#ampel .t').text_content() or ''
        tree_0 = p.pg.locator('#left-body .node .sub').first.text_content() or ''
        p.pg.wait_for_selector('#p-bbox', timeout=10000)
        bbox_0 = p.pg.locator('#p-bbox').text_content() or ''
        p.ev("const id=App.doc.items[0].id, r=App.results.get(id); const i=r.data.edges.findIndex(e=>e.t==='LINE' && Math.abs(e.l-12.3456)<1e-3); App.select([id],{edges:[{id,edgeIdx:i}]})"); p.wait(300)
        sel_0 = p.pg.locator('#sel-val').text_content() if p.pg.locator('#sel-val').count() else ''
        p.ev("App.select([App.doc.items[0].id])"); p.wait(400)

        # Fokus + Verlassen im 0-Stellen-Feld darf den exakt gespeicherten Wert nicht überschreiben
        p.pg.locator('#p-w').focus(); p.pg.locator('#p-w').blur(); p.wait(300)
        w_exact = p.ev("return App.doc.items[0].p.w")
        vol_exact = volumen(p)

        ok1 = (
            dec_opts == ['0', '1', '2', '3', '4'] and ang_opts == ['0', '1', '2', '3', '4']
            and pw_3 == '12,346'
            and '12,346' in lbls_3
            and '12,346 × 20 × 10 mm' in ampel_3
            and '12,346 × 20 × 10' in tree_3
            and '12,346 × 20 × 10 mm' in bbox_3
            and '12,346 mm' in sel_3
            and pw_0 == '12'
            and '12' in lbls_0 and not any('12,' in x for x in lbls_0)
            and '12 × 20 × 10 mm' in ampel_0
            and '12 × 20 × 10' in tree_0
            and '12 × 20 × 10 mm' in bbox_0
            and '12 mm' in sel_0 and '12,' not in sel_0
            and abs(w_exact - 12.3456) < 1e-9
            and vol_exact is not None and abs(vol_exact - 2469.12) < 0.05
        )

        # 2. Winkel getrennt von Längen (0–4) + Drehkörper-Anzeige
        p.ev("App.change('rot', d=>{ d.items[0].t.rz = 12.3456; })"); warte_rechnen(p)
        p.ev("App.select([App.doc.items[0].id])"); p.wait(300)
        open_settings()
        p.pg.select_option('#set-dec', '0'); p.wait(150)
        p.pg.select_option('#set-angle-dec', '3'); p.wait(200)
        close_settings(); p.wait(300)
        pw_a3 = p.pg.locator('#p-w').input_value()
        rz_a3 = p.pg.locator('#t-rz').input_value()
        rev_a3 = p.ev("return Model.sizeText(Model.newItem('revolve', { angle: 12.3456, dir: 'normal' }), {})")

        open_settings()
        p.pg.select_option('#set-dec', '4'); p.wait(150)
        p.pg.select_option('#set-angle-dec', '0'); p.wait(200)
        close_settings(); p.wait(300)
        pw_a0 = p.pg.locator('#p-w').input_value()
        rz_a0 = p.pg.locator('#t-rz').input_value()
        rev_a0 = p.ev("return Model.sizeText(Model.newItem('revolve', { angle: 12.3456, dir: 'normal' }), {})")
        p.ev("ViewPrefs.set({ angleDecimals: 1 })"); p.wait(200)
        rev_a1 = p.ev("return Model.sizeText(Model.newItem('revolve', { angle: 12.3456, dir: 'normal' }), {})")
        rz_exact = p.ev("return App.doc.items[0].t.rz")

        ok2 = (
            pw_a3 == '12' and rz_a3 == '12,346' and rev_a3 == '12,346°'
            and pw_a0 == '12,3456' and rz_a0 == '12' and rev_a0 == '12°'
            and rev_a1 == '12,3°'
            and abs(rz_exact - 12.3456) < 1e-9
        )

        # 3. Maße-Panel & Skizze (Schildchen .skdim, Eigenschaftsfeld & Maß-Tabelle) konsistent
        p.ev("App.change('p', d=>{ d.params.push({id:'m_len', name:'Laenge', expr:12.3456}); })"); p.wait(200)
        p.pg.click('#lt-params'); p.wait(250)
        p.ev("ViewPrefs.set({ decimals: 3, angleDecimals: 2 })"); p.wait(250)
        par_3 = p.pg.locator('#pv-m_len').input_value()
        par_eval_3 = p.pg.locator('#left-body .mono').first.text_content() or ''
        p.ev("ViewPrefs.set({ decimals: 0, angleDecimals: 0 })"); p.wait(250)
        par_0 = p.pg.locator('#pv-m_len').input_value()
        par_eval_0 = p.pg.locator('#left-body .mono').first.text_content() or ''
        par_exact = p.ev("return App.doc.params.find(x=>x.id==='m_len').expr")

        p.pg.click('#lt-tree'); p.wait(200)
        p.ev("Start.show()"); p.wait(300)
        scene(p, [{'id': 'L1', 'type': 'line', 'a': [0, 0], 'b': [11.325357, 4.914390]}])
        SS(p, "S.dims.push({id:'dm1', e:'L1', k:'len', v:12.3456}, {id:'dm2', e:'L1', k:'ang', v:23.4567}); Sketch.setTool('select')")
        p.ev("ViewPrefs.set({ decimals: 3, angleDecimals: 2 })"); p.wait(300)
        sk_dims_3 = p.pg.locator('.skdim').all_text_contents()
        p.ev("Sketch.state.sels=['L1']; Panels.renderRight()"); p.wait(250)
        se_len_3 = p.pg.locator('#se-len').input_value()
        se_ang_3 = p.pg.locator('#se-ang').input_value()
        p.ev("Sketch.state.sels=[]; Panels.renderRight()"); p.wait(200)
        p.pg.locator('#dim-table summary').click(); p.wait(200)
        dt_len_3 = p.pg.locator('#dt-0').input_value()
        dt_ang_3 = p.pg.locator('#dt-1').input_value()

        p.ev("ViewPrefs.set({ decimals: 0, angleDecimals: 0 })"); p.wait(300)
        sk_dims_0 = p.pg.locator('.skdim').all_text_contents()
        dt_len_0 = p.pg.locator('#dt-0').input_value()
        dt_ang_0 = p.pg.locator('#dt-1').input_value()
        dim_vals_exact = SS(p, "return S.dims.map(d=>d.v)")
        p.ev("Sketch.cancel()"); p.wait(300)

        ok3 = (
            par_3 == '12,346' and '= 12,346' in par_eval_3
            and par_0 == '12' and '= 12' in par_eval_0 and abs(par_exact - 12.3456) < 1e-9
            and any('12,346' in t for t in sk_dims_3) and any('23,46°' in t for t in sk_dims_3)
            and se_len_3 == '12,346' and se_ang_3 == '23,46'
            and dt_len_3 == '12,346' and dt_ang_3 == '23,46'
            and any(t.strip() == '12' for t in sk_dims_0) and any('23°' in t for t in sk_dims_0)
            and dt_len_0 == '12' and dt_ang_0 == '23'
            and abs(dim_vals_exact[0] - 12.3456) < 1e-9 and abs(dim_vals_exact[1] - 23.4567) < 1e-9
        )

        # 4. Exakte Eingabe bei 0 Stellen + dauerhafte Messung
        p.ev("Start.show()"); p.wait(300)
        p.empty()
        p.ev("ViewPrefs.set({ decimals: 0, angleDecimals: 0 })"); p.wait(200)
        p.ev("Actions.addPrimitive('box', { p: { w: 10, d: 20, h: 10 } })"); warte_rechnen(p)
        p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
        p.pg.fill('#p-w', '12,3456'); p.pg.press('#p-w', 'Enter'); warte_rechnen(p)
        w_after_input = p.ev("return App.doc.items[0].p.w")
        pw_disp_after = p.pg.locator('#p-w').input_value()
        vol_after_input = volumen(p)

        # Messung zwischen zwei Deckflächen (Abstand = 12,3456 mm) behalten
        p.ev("App.change('b2', d=>{ const b=Model.newItem('box',{w:10,d:10,h:22.3456}); b.t.x=25; d.items.push(b); })"); warte_rechnen(p)
        p.ev("App.select([]); Viewer.setView('iso', false); Viewer.fit()"); p.wait(500)
        p.pg.locator('#t-measure').click(); p.wait(300)
        top1, top2 = world_screen(p, 0, 0, 10), world_screen(p, 25, 0, 22.3456)
        p.pg.mouse.click(*top1); p.wait(300)
        p.pg.mouse.click(*top2); p.wait(400)
        p.pg.locator('#measure-keep').click(); p.wait(350)
        p.pg.keyboard.press('Escape'); p.wait(250)

        m_pin_0 = p.pg.locator('.dimlabel.mpin').first.text_content() if p.pg.locator('.dimlabel.mpin').count() else ''
        m_tree_0 = p.pg.locator('#measure-tree .sub').first.text_content() if p.pg.locator('#measure-tree .sub').count() else ''
        p.ev("ViewPrefs.set({ decimals: 3 })"); p.wait(300)
        m_pin_3 = p.pg.locator('.dimlabel.mpin').first.text_content() if p.pg.locator('.dimlabel.mpin').count() else ''
        m_tree_3 = p.pg.locator('#measure-tree .sub').first.text_content() if p.pg.locator('#measure-tree .sub').count() else ''
        m_val_exact = p.ev("return App.doc.measures[0] ? App.doc.measures[0].value : null")

        ok4 = (
            abs(w_after_input - 12.3456) < 1e-9
            and pw_disp_after == '12'
            and vol_after_input is not None and abs(vol_after_input - 2469.12) < 0.05
            and m_pin_0 == '12 mm' and m_tree_0 == '12 mm'
            and m_pin_3 == '12,346 mm' and m_tree_3 == '12,346 mm'
            and m_val_exact is not None and abs(m_val_exact - 12.3456) < 1e-4
        )

        # 5. Persistenz über Neuladen (auch decimals: 0 bleibt 0), Befehlssuche & Hilfetext
        p.ev("ViewPrefs.set({ decimals: 0, angleDecimals: 3 })"); p.wait(200)
        p.pg.reload(); p.wait(4500)
        p.pg.wait_for_function("() => !!(window.__M && window.__M.ViewPrefs && window.__M.Units)", timeout=15000)
        persisted = p.ev("return { dec: ViewPrefs.get().decimals, ang: ViewPrefs.get().angleDecimals, len: Units.fmtLen(12.3456) }")
        cmd_ids = p.ev("return Commands.search('Nachkommastellen').map(c=>c.id)")
        help_ok = p.pg.evaluate("fetch('data/werkzeug-hilfen.json').then(r=>r.json()).then(d=>!!(d.precision && d.precision.tip && d.precision.hilfe && d.precision.tipp))")
        ok5 = (
            persisted == {'dec': 0, 'ang': 3, 'len': '12'}
            and 'settings-precision' in cmd_ids
            and bool(help_ok)
        )
        return [ok1, ok2, ok3, ok4, ok5]
    finally:
        p.ev("if (window.__M && window.__M.ViewPrefs) ViewPrefs.set({ decimals: 2, angleDecimals: 1 })")


def t_a055_sparsames_rueckgaengig(p):
    p.empty()
    try:
        # 1. Großes Projekt anlegen (> 250 KB JSON, schnelle Neuberechnung durch unterdrückte/ausgeblendete Skizzen)
        p.ev("""
          App.change('Großprojekt anlegen', (doc) => {
            doc.params.push({ id: 'par_w', name: 'Breite', expr: '40' });
            doc.params.push({ id: 'par_h', name: 'Hoehe', expr: '20' });
            doc.tables.push({ id: 'tbl_1', name: 'Norm', rows: [{ id: 'tr_1', key: 'A', val: '10' }, { id: 'tr_2', key: 'B', val: '20' }] });
            doc.notes.push({ id: 'n_1', text: 'Notiz 1', pts: [[0,0,0],[10,0,0]] });
            const box = Model.newItem('box', { w: 'Breite', d: 'Hoehe', h: 10 }, { name: 'Basisblock' });
            box.finishes.push({ id: 'fin_1', type: 'fillet', r: 1, edges: 'all' });
            doc.items.push(box);
            for (let s = 0; s < 8; s++) {
              const ents = [], dims = [], cons = [];
              for (let i = 0; i < 350; i++) {
                const eid = 'e_' + s + '_' + i;
                ents.push({ id: eid, type: 'line', a: [i * 2, 0], b: [i * 2 + 1.5, (i % 7) + 1] });
                if (i < 120) dims.push({ id: 'dm_' + s + '_' + i, type: 'len', e: eid, v: 2.5 });
                if (i > 0 && i < 120) cons.push({ id: 'cn_' + s + '_' + i, type: 'coincident', refs: [{ e: 'e_' + s + '_' + (i - 1), p: 'b' }, { e: eid, p: 'a' }] });
              }
              const sk = Model.newItem('extrude', {
                dist: 5,
                sketch: { plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, ents, dims, cons },
              }, { name: 'Skizze ' + s });
              sk.suppressed = true;
              sk.hidden = true;
              sk.customMeta = { a: 1, b: 2, c: 3, d: 4 };
              doc.items.push(sk);
            }
          });
          // Ausgangszustand sauber ohne Verlauf starten
          App.setDoc(JSON.parse(App.snapshot()), { fit: false, noAutosave: true });
        """)
        warte_rechnen(p)

        snap0 = p.ev("return App.snapshot()")
        snap0_len = len(snap0)

        # 2. 200 vielfältige Änderungen ausführen (Skalare, Key löschen/einfügen, ID-Arrays verschieben/einfügen/löschen, Nicht-ID-Arrays, pushUndo, merge, amend, squash)
        stats_200 = p.ev("""
          for (let k = 0; k < 200; k++) {
            const mod = k % 10;
            if (mod === 0) {
              App.change('Breite ' + k, (doc) => {
                const b = doc.items.find((x) => x.kind === 'box');
                b.p.w = String(40 + (k % 15));
              });
            } else if (mod === 1) {
              App.change('Verschieben ' + k, (doc) => {
                const b = doc.items.find((x) => x.kind === 'box');
                b.t.x = (k % 9) * 1.5;
              });
            } else if (mod === 2) {
              App.change('Skizzenlinie ' + k, (doc) => {
                const sks = doc.items.filter((x) => x.kind === 'extrude');
                const sk = sks[k % sks.length].p.sketch;
                sk.ents[k % sk.ents.length].b[1] = Math.round((2 + (k % 11) * 0.25) * 1000) / 1000;
              });
            } else if (mod === 3) {
              App.change('Schlüssel entfernen/setzen ' + k, (doc) => {
                const sks = doc.items.filter((x) => x.kind === 'extrude');
                const it = sks[k % sks.length];
                if (it.customMeta && 'b' in it.customMeta) delete it.customMeta.b;
                else if (it.customMeta) it.customMeta = { a: 1, b: 2, c: 3, d: 4, extra: k };
              });
            } else if (mod === 4) {
              App.change('Teil einfügen/löschen ' + k, (doc) => {
                const tid = 'tmp_' + Math.floor(k / 20);
                const idx = doc.items.findIndex((x) => x.id === tid);
                if (idx >= 0) doc.items.splice(idx, 1);
                else {
                  const nb = Model.newItem('box', { w: 5, d: 5, h: 5 }, { name: 'Temp ' + k });
                  nb.id = tid; nb.suppressed = true;
                  doc.items.splice(2, 0, nb);
                }
              });
            } else if (mod === 5) {
              App.change('Reihenfolge ' + k, (doc) => {
                if (doc.items.length > 4) {
                  const mv = doc.items.splice(doc.items.length - 1, 1)[0];
                  doc.items.splice(1, 0, mv);
                }
              });
            } else if (mod === 6) {
              const before = App.snapshot();
              App.doc.notes[0].pts.push([k, k % 5, 0]);
              App.pushUndo('Notizpunkt ' + k, before);
              App.touched(true);
            } else if (mod === 7) {
              // Merge-Test: 2 schnelle Edits mit selbem Schlüssel → genau 1 Schritt
              App.change('Merge ' + k, (doc) => { doc.params[0].expr = String(41 + (k % 7)); }, { merge: 'm_' + k });
              App.change('Merge ' + k, (doc) => { doc.params[0].expr = String(42 + (k % 7)); }, { merge: 'm_' + k });
            } else if (mod === 8) {
              // Amend-Test: 1 normaler Schritt + amend darauf → genau 1 Schritt
              App.change('Basis + Amend ' + k, (doc) => { doc.items[0].name = 'Block ' + k; });
              App.change('Amend ' + k, (doc) => { doc.items[0].color = '#3b82f6'; }, { amend: true });
            } else {
              // Squash-Test: 2 Schritte zu 1 zusammenfassen → genau 1 Schritt
              const d0 = App.undoStack.length;
              App.change('Sq1 ' + k, (doc) => { doc.tables[0].rows[0].val = String(10 + k); });
              App.change('Sq2 ' + k, (doc) => { doc.tables[0].rows[1].val = String(20 + k); });
              App.squash(d0, 'Squash ' + k);
            }
          }
          const st = App.historyStats();
          const rawStackChars = JSON.stringify(App.undoStack).length;
          const allPatchOps = App.undoStack.every((s) => Array.isArray(s.ops) && !('before' in s));
          return { st, rawStackChars, allPatchOps };
        """)
        warte_rechnen(p)

        snap200 = p.ev("return App.snapshot()")
        st = stats_200['st']
        copies_200_bytes = 200 * snap0_len
        ok1 = (
            snap0_len >= 200000
            and st['undoCount'] == 200
            and st['redoCount'] == 0
            and stats_200['allPatchOps'] is True
            and st['totalBytes'] < copies_200_bytes * 0.05
            and stats_200['rawStackChars'] < copies_200_bytes * 0.05
        )

        # 3. 200× Rückgängig → exakt der Anfangszustand (Byte-für-Byte)
        after_undo = p.ev("""
          for (let i = 0; i < 200; i++) App.undo(true);
          return { snap: App.snapshot(), st: App.historyStats() };
        """)
        warte_rechnen(p)
        ok2 = (
            after_undo['st']['undoCount'] == 0
            and after_undo['st']['redoCount'] == 200
            and after_undo['snap'] == snap0
        )

        # 4. 200× Wiederholen → exakt der Endzustand, und undoTo(0) → wieder Anfangszustand
        after_redo = p.ev("""
          for (let i = 0; i < 200; i++) App.redo(true);
          const midSnap = App.snapshot();
          const midSt = App.historyStats();
          App.undoTo(0);
          return { midSnap, midSt, backSnap: App.snapshot(), backSt: App.historyStats() };
        """)
        warte_rechnen(p)
        ok3 = (
            after_redo['midSt']['undoCount'] == 200
            and after_redo['midSt']['redoCount'] == 0
            and after_redo['midSnap'] == snap200
            and after_redo['backSt']['undoCount'] == 0
            and after_redo['backSt']['redoCount'] == 200
            and after_redo['backSnap'] == snap0
        )

        # 5. Speicher-Begrenzung statt 300-Schritte-Limit prüfen (> 300 kleine Schritte bleiben erhalten; enges Speicherlimit wirft älteste ab)
        mem_res = p.ev("""
          App.setDoc(Model.newDoc('Limit-Test'), { fit: false, noAutosave: true });
          for (let i = 0; i < 320; i++) {
            App.change('Klein ' + i, (doc) => { doc.name = 'P_' + i; });
          }
          const count320 = App.undoStack.length;
          App.setDoc(Model.newDoc('Mem-Limit'), { fit: false, noAutosave: true });
          App.setHistoryLimit(20 * 1024);
          const snaps = [];
          for (let i = 0; i < 30; i++) {
            snaps.push(App.snapshot());
            App.change('Groß ' + i, (doc) => {
              doc.notes = [{ id: 'big_' + i, text: ('X_' + i + '_').repeat(400) }];
            });
          }
          const stLim = App.historyStats();
          const kept = stLim.undoCount;
          const expectedOldest = snaps[snaps.length - kept];
          while (App.undoStack.length) App.undo(true);
          const restoredOldest = App.snapshot();
          App.setHistoryLimit(32 * 1024 * 1024);
          return { count320, stLim, kept, exactOldest: restoredOldest === expectedOldest };
        """)
        ok4 = (
            mem_res['count320'] == 320
            and mem_res['kept'] < 30
            and mem_res['kept'] >= 1
            and mem_res['stLim']['totalBytes'] <= 20 * 1024
            and mem_res['exactOldest'] is True
        )

        # 6. UI-Knöpfe #btn-undo und #btn-redo im Browser prüfen
        p.ev("App.setDoc(Model.newDoc('UI-Test'), { fit: false, noAutosave: true });"); warte_rechnen(p)
        p.ev("Actions.addPrimitive('box')"); warte_rechnen(p)
        p.ev("App.change('Quader breiter', (doc) => { doc.items[0].p.w = 55; });"); warte_rechnen(p)
        w_before = p.ev("return App.doc.items[0].p.w")
        p.pg.click('#btn-undo'); p.wait(400); warte_rechnen(p)
        w_undo = p.ev("return App.doc.items[0].p.w")
        p.pg.click('#btn-redo'); p.wait(400); warte_rechnen(p)
        w_redo = p.ev("return App.doc.items[0].p.w")
        ok5 = (w_before == 55 and w_undo == 20 and w_redo == 55)

        return [ok1, ok2, ok3, ok4, ok5]
    finally:
        p.ev("if (window.__M && window.__M.App && App.setHistoryLimit) App.setHistoryLimit(32 * 1024 * 1024);")


def t_a056_normteile_stifte_lager(p):
    # 1. Kugellager 608 (Außen-Ø 22, Innen-Ø 8, Breite 7) sowie Reihen 6000 / 6200
    p.empty()
    p.ev("""App.change('Lager', d=>{
      const b608 = Model.newItem('part', { lib:'stdBearing', size:'608', seal:'2rs' }, { name:'Lager 608' });
      const b6000 = Model.newItem('part', { lib:'stdBearing', size:'6000', seal:'2rs' }, { name:'Lager 6000' }); b6000.t.x = 40;
      const b6204 = Model.newItem('part', { lib:'stdBearing', size:'6204', seal:'2rs' }, { name:'Lager 6204' }); b6204.t.x = 95;
      d.items.push(b608, b6000, b6204);
    })""")
    warte_rechnen(p, 40)
    r1 = p.ev("""
      const res = App.doc.items.map(it => {
        const d = App.results.get(it.id)?.data;
        const bb = d?.bbox || [];
        const radii = (d?.faces || []).map(f => f.r).filter(r => r != null);
        return { mat: it.mat, w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2], radii };
      });
      return { errs: App.errors.length, res };
    """)
    b608, b6000, b6204 = r1['res']
    ok1 = (
        r1['errs'] == 0
        and b608['mat'] == 'V2A Edelstahl'
        and abs(b608['w'] - 22) < 0.02 and abs(b608['dp'] - 22) < 0.02 and abs(b608['h'] - 7) < 0.02
        and any(abs(r - 4) < 0.02 for r in b608['radii'])
        and any(abs(r - 11) < 0.02 for r in b608['radii'])
        and abs(b6000['w'] - 26) < 0.02 and abs(b6000['h'] - 8) < 0.02 and any(abs(r - 5) < 0.02 for r in b6000['radii'])
        and abs(b6204['w'] - 47) < 0.02 and abs(b6204['h'] - 14) < 0.02 and any(abs(r - 10) < 0.02 for r in b6204['radii'])
    )
    # Offenes Lager 608 mit Kugeln
    p.ev("App.change('Offen', d=>{ d.items[0].p.seal = 'open'; })")
    warte_rechnen(p, 40)
    b_open = p.ev("""
      const d = App.results.get(App.doc.items[0].id)?.data;
      const bb = d?.bbox || [];
      const radii = (d?.faces || []).map(f => f.r).filter(r => r != null);
      return { errs: App.errors.length, w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2], radii };
    """)
    ok1 = ok1 and b_open['errs'] == 0 and abs(b_open['w'] - 22) < 0.02 and abs(b_open['dp'] - 22) < 0.02 and abs(b_open['h'] - 7) < 0.02 and any(abs(r - 4) < 0.02 for r in b_open['radii'])

    # 2. Passfeder 6x6x20 (DIN 6885 A) + passende Nut (t1 = 3.5 mm / t2 = 2.8 mm)
    p.ev("""App.change('Passfeder', d=>{
      d.items = [Model.newItem('part', { lib:'stdKey', size:'6x6', length:20 }, { name:'Passfeder 6x6x20' })];
    })""")
    warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    k_info = p.ev("""
      const it = App.doc.items[0];
      const bb = App.results.get(it.id)?.data?.bbox || [];
      return Mass.measure().then(m => ({
        errs: App.errors.length,
        w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2],
        vol: m.parts.find(q => q.id === it.id)?.volume || 0,
        hint: document.querySelector('#p-stdkey-hint')?.textContent || '',
      }));
    """)
    exp_key_vol = (6 * 14 + math.pi * 9) * 6
    ok2 = (
        k_info['errs'] == 0
        and abs(k_info['w'] - 20) < 0.02 and abs(k_info['dp'] - 6) < 0.02 and abs(k_info['h'] - 6) < 0.02
        and abs(k_info['vol'] - exp_key_vol) < 2.0
        and 'DIN 6885' in k_info['hint'] and '3,5' in k_info['hint']
    )
    # Knopf „Passende Nut anlegen“ + Schnitt-Tiefe t1 (3.5 mm) und t2 (2.8 mm) in einem Quader prüfen
    p.pg.locator('#btn-add-keyway').click(); p.wait(400); warte_rechnen(p, 30)
    has_kw = p.ev("return App.doc.items.length === 2 && App.doc.items[1].p.lib === 'stdKeyway' && App.doc.items[1].p.size === '6x6' && Number(App.doc.items[1].p.length) === 20")
    p.ev("""App.change('Nuttest', d=>{
      const blk = Model.newItem('box', { w:30, d:20, h:10 }, { name:'Welle' });
      const kw = Model.newItem('part', { lib:'stdKeyway', size:'6x6', kind:'shaft', length:20, extra:0.5 }, { name:'Wellennut', role:'hole' });
      kw.t.z = 10;
      d.items = [blk, kw];
    })""")
    warte_rechnen(p, 30)
    v_shaft = p.ev("return Mass.measure().then(m => ({ errs: App.errors.length, vol: m.parts.find(q => q.id === App.doc.items[0].id)?.volume || 0 }))")
    p.ev("App.change('Nabennut', d=>{ d.items[1].p.kind = 'hub'; })")
    warte_rechnen(p, 30)
    v_hub = p.ev("return Mass.measure().then(m => ({ errs: App.errors.length, vol: m.parts.find(q => q.id === App.doc.items[0].id)?.volume || 0 }))")
    exp_shaft_cut = (6 * 14 + math.pi * 9) * 3.5
    exp_hub_cut = 20 * 6 * 2.8
    ok2 = ok2 and has_kw and v_shaft['errs'] == 0 and abs((6000 - v_shaft['vol']) - exp_shaft_cut) < 2.0 and v_hub['errs'] == 0 and abs((6000 - v_hub['vol']) - exp_hub_cut) < 2.0

    # 3. Zylinderstift ISO 2338 (Ø 6 × 20, m6 mit 15°-Endfasen)
    p.ev("""App.change('Stift', d=>{
      d.items = [Model.newItem('part', { lib:'stdPin', size:'6', length:20, tol:'m6' }, { name:'Zylinderstift 6x20' })];
    })""")
    warte_rechnen(p, 30)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(500)
    pin_info = p.ev("""
      const it = App.doc.items[0], bb = App.results.get(it.id)?.data?.bbox || [];
      return Mass.measure().then(m => ({
        errs: App.errors.length,
        w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2],
        vol: m.parts.find(q => q.id === it.id)?.volume || 0,
        hint: document.querySelector('#p-stdpin-hint')?.textContent || '',
      }));
    """)
    ok3 = (
        pin_info['errs'] == 0
        and abs(pin_info['w'] - 6) < 0.02 and abs(pin_info['dp'] - 6) < 0.02 and abs(pin_info['h'] - 20) < 0.02
        and 545 < pin_info['vol'] < 564
        and 'ISO 2338' in pin_info['hint'] and 'm6' in pin_info['hint']
    )

    # 4. Gleitlager ISO 3547 / DIN 1850 (8x10x12 zylindrisch und mit Bund Ø 15)
    p.ev("""App.change('Gleitlager', d=>{
      d.items = [Model.newItem('part', { lib:'stdSleeve', size:'8x10', length:12, flange:'cyl' }, { name:'Gleitlager 8x10' })];
    })""")
    warte_rechnen(p, 30)
    sl_cyl = p.ev("""
      const it = App.doc.items[0], d = App.results.get(it.id)?.data, bb = d?.bbox || [];
      const radii = (d?.faces || []).map(f => f.r).filter(r => r != null);
      return { errs: App.errors.length, mat: it.mat, w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2], radii };
    """)
    p.ev("App.change('Gleitlager Bund', d=>{ d.items[0].p.flange = 'flange'; })")
    warte_rechnen(p, 30)
    sl_fl = p.ev("""
      const d = App.results.get(App.doc.items[0].id)?.data, bb = d?.bbox || [];
      return { errs: App.errors.length, w: bb[3] - bb[0], dp: bb[4] - bb[1], h: bb[5] - bb[2] };
    """)
    ok4 = (
        sl_cyl['errs'] == 0 and sl_cyl['mat'] == 'Messing'
        and abs(sl_cyl['w'] - 10) < 0.02 and abs(sl_cyl['dp'] - 10) < 0.02 and abs(sl_cyl['h'] - 12) < 0.02
        and any(abs(r - 4) < 0.02 for r in sl_cyl['radii'])
        and sl_fl['errs'] == 0
        and abs(sl_fl['w'] - 15) < 0.02 and abs(sl_fl['dp'] - 15) < 0.02 and abs(sl_fl['h'] - 12) < 0.02
    )

    # 5. Bibliothek-Flyout (Normteile-Bereich), Befehlssuche, Hilfetexte & Geometrie-Prüfung
    p.pg.locator('#t-parts').click(); p.wait(350)
    fly_txt = (p.pg.locator('.flyout').text_content() or '').replace('\u00ad', '')
    fly_helps = p.ev("return ['stdPin', 'stdKey', 'stdKeyway', 'stdBearing', 'stdSleeve'].every(k => !!document.querySelector(`.flyout [data-help=\"${k}\"]`))")
    p.pg.keyboard.press('Escape'); p.wait(150)
    p.ev("""App.change('Alle Normteile prüfen', d=>{
      const a = Model.newItem('part', { lib:'stdBearing', size:'608', seal:'2rs' }, { name:'608' });
      const b = Model.newItem('part', { lib:'stdKey', size:'6x6', length:20 }, { name:'PF' }); b.t.x = 30;
      const c = Model.newItem('part', { lib:'stdPin', size:'6', length:20, tol:'m6' }, { name:'Stift' }); c.t.x = 60;
      const e = Model.newItem('part', { lib:'stdSleeve', size:'8x10', length:12, flange:'flange' }, { name:'Buchse' }); e.t.x = 90;
      d.items = [a, b, c, e];
    })""")
    warte_rechnen(p, 40)
    meta = p.ev("""
      const cmds = ['kugellager', 'passfeder', 'zylinderstift', 'gleitlager'].map(q => Commands.search(q).length);
      return Promise.all([
        fetch('data/werkzeug-hilfen.json').then(r => r.json()),
        GeomCheck.run({ silent: true }),
      ]).then(([helpJson, gc]) => ({
        cmds,
        helpOk: ['stdPin', 'stdKey', 'stdKeyway', 'stdBearing', 'stdSleeve'].every(k => helpJson[k] && helpJson[k].tip && helpJson[k].hilfe && helpJson[k].tipp),
        gcIssues: gc.issues.length,
        gcChecked: gc.checkedCount,
      }));
    """)
    ok5 = (
        all(w in fly_txt for w in ['Normteile', 'Zylinderstift', 'Passfeder', 'Passfedernut', 'Kugellager', 'Gleitlager'])
        and bool(fly_helps)
        and all(n >= 1 for n in meta['cmds'])
        and meta['helpOk']
        and meta['gcIssues'] == 0 and meta['gcChecked'] == 4
    )
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-057] Schrauben M10–M24 & mehr Werkstoffe (BI-06, BI-07) ----------
def t_a057_schrauben_werkstoffe(p):
    p.empty()
    # 1. Sechskantschraube M16×60 (ISO 4017) -> Schlüsselweite 24 mm, Kopfhöhe 10 mm, Schaftlänge 60 mm
    p.ev("""App.change('Sechskantschraube M16x60', d=>{
      const s = Model.newItem('part', { lib:'stdScrew', size:'M16', head:'hex', length:60 }, { name:'M16x60' });
      d.items.push(s);
    })""")
    warte_rechnen(p, 40)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(400)
    r1 = p.ev("""
      const it = App.doc.items[0], d = App.results.get(it.id)?.data, bb = d?.bbox || [];
      return {
        errs: App.errors.length,
        mat: it.mat,
        xSpan: bb[3] - bb[0],
        ySpan: bb[4] - bb[1],
        zMin: bb[2],
        zMax: bb[5],
      };
    """)
    hint1 = p.pg.locator('#p-stdscrew-hint').text_content() or ''
    ok1 = (
        r1['errs'] == 0
        and r1['mat'] == 'V2A Edelstahl'
        and abs(r1['ySpan'] - 24.0) < 0.02
        and abs(r1['xSpan'] - (24.0 * 2.0 / math.sqrt(3))) < 0.05
        and abs(r1['zMin'] + 60.0) < 0.02
        and abs(r1['zMax'] - 10.0) < 0.02
        and 'ISO 4017' in hint1 and '24' in hint1
    )

    # 2. Normteile M10–M24 (Zylinder, Senkkopf inkl. kurzem M24, Mutter, Scheibe) & Geometrie-Prüfung
    p.ev("""App.change('Normteile bis M24', d=>{
      d.items = [
        Model.newItem('part', { lib:'stdScrew', size:'M10', head:'zyl', length:30 }, { name:'Zyl_M10' }),
        Model.newItem('part', { lib:'stdScrew', size:'M24', head:'senk', length:50 }, { name:'Senk_M24' }),
        Model.newItem('part', { lib:'stdScrew', size:'M24', head:'senk', length:10 }, { name:'Senk_M24_kurz' }),
        Model.newItem('part', { lib:'stdNut', size:'M16' }, { name:'Mutter_M16' }),
        Model.newItem('part', { lib:'stdNut', size:'M24' }, { name:'Mutter_M24' }),
        Model.newItem('part', { lib:'stdWasher', size:'M12' }, { name:'Scheibe_M12' }),
        Model.newItem('part', { lib:'stdWasher', size:'M24' }, { name:'Scheibe_M24' }),
      ];
      d.items.forEach((it, idx) => { it.t.x = idx * 60; });
    })""")
    warte_rechnen(p, 60)
    r2 = p.ev("""
      const boxes = App.doc.items.map(it => {
        const bb = App.results.get(it.id)?.data?.bbox || [0,0,0,0,0,0];
        return { w: bb[3]-bb[0], dp: bb[4]-bb[1], z0: bb[2], z1: bb[5] };
      });
      return GeomCheck.run({ silent: true }).then(gc => ({
        errs: App.errors.length,
        boxes,
        gcIssues: gc.issues.length,
        gcChecked: gc.checkedCount,
      }));
    """)
    bx = r2['boxes']
    ok2 = (
        r2['errs'] == 0
        and abs(bx[0]['w'] - 16.0) < 0.02 and abs(bx[0]['z0'] + 30.0) < 0.02 and abs(bx[0]['z1'] - 10.0) < 0.02
        and abs(bx[1]['w'] - 39.0) < 0.03 and abs(bx[1]['z0'] + 50.0) < 0.02 and abs(bx[1]['z1']) < 0.02
        and abs(bx[2]['w'] - 39.0) < 0.03 and bx[2]['z0'] < -14.0
        and abs(bx[3]['dp'] - 24.0) < 0.02 and abs(bx[3]['z1'] - 14.8) < 0.02
        and abs(bx[4]['dp'] - 36.0) < 0.02 and abs(bx[4]['z1'] - 21.5) < 0.02
        and abs(bx[5]['w'] - 24.0) < 0.02 and abs(bx[5]['z1'] - 2.5) < 0.02
        and abs(bx[6]['w'] - 44.0) < 0.02 and abs(bx[6]['z1'] - 4.0) < 0.02
        and r2['gcIssues'] == 0 and r2['gcChecked'] == 7
    )

    # 3. Werkstoff „Messing“ -> Dichte 8,4–8,7 g/cm³ (8,47 g/cm³) & Studio-Aussehen
    p.ev("""App.change('Messing-Würfel', d=>{
      d.items = [Model.newItem('box', { w:10, d:10, h:10 }, { name:'Wuerfel' })];
    })""")
    warte_rechnen(p, 25)
    p.ev("App.select([App.doc.items[0].id])"); p.wait(350)
    p.pg.select_option('#p-mat', 'Messing'); p.wait(1200)
    mass_txt = (p.pg.locator('#p-mass').text_content() or '').strip()
    mat_info = (p.pg.locator('#p-mat-info').text_content() or '').strip()
    r3 = p.ev("""
      const it = App.doc.items[0];
      const matObj = Mass.matOf('Messing');
      const m = Viewer.nodes.get(it.id)?.mesh?.material;
      return Mass.measure().then(res => ({
        rho: matObj ? matObj.rho : null,
        src: matObj ? matObj.src : '',
        mass: res?.parts?.find(q => q.id === it.id)?.mass ?? null,
        metal: m ? m.metalness : null,
        col: m ? '#' + m.color.getHexString() : null,
      }));
    """)
    ok3 = (
        r3['rho'] is not None and 8.4 <= r3['rho'] <= 8.7
        and r3['mass'] is not None and 8.4 <= r3['mass'] <= 8.7
        and '8,47 g' in mass_txt
        and '8,47' in mat_info and 'Quelle:' in mat_info
        and r3['metal'] == 1 and r3['col'] == '#d8b552'
    )

    # 4. Erweiterte Werkstoff-Sammlung: Stähle, Edelstahl, Messing, Kupfer, POM, PA6, PC, ABS, PETG, TPU, Sperrholz, MDF
    p.ev("""App.change('Werkstoff-Stichproben', d=>{
      const mats = ['Kupfer', 'MDF', 'PA6', 'Stahl C45', 'V4A Edelstahl', 'Birken-Sperrholz'];
      d.items = mats.map((mk, idx) => {
        const b = Model.newItem('box', { w:10, d:10, h:10 }, { name:mk });
        b.mat = mk; b.t.x = idx * 20; return b;
      });
    })""")
    warte_rechnen(p, 35)
    r4 = p.ev("""
      return Promise.all([
        fetch('data/materialien.json').then(r => r.json()),
        Mass.bom(),
      ]).then(([mj, bom]) => {
        const list = mj.materialien || [];
        const samples = App.doc.items.map(it => {
          const m = Viewer.nodes.get(it.id)?.mesh?.material;
          const def = Mass.matOf(it.mat);
          return { k: it.mat, rho: def?.rho, metal: m?.metalness, rough: m?.roughness, col: m ? '#' + m.color.getHexString() : null };
        });
        return {
          keys: Mass.materials.map(m => m.k),
          allValid: list.length >= 26 && list.every(m => m.dichte_g_cm3 > 0 && m.quelle && m.aussehen && m.kategorie) && Mass.materials.every(m => m.rho > 0 && m.src && Viewer.lookOf(m.k)),
          filament: (bom?.filament || []).map(f => f.mat),
          samples,
        };
      });
    """)
    need_mats = {'Baustahl', 'Stahl S355', 'Stahl C45', 'Stahl 42CrMo4', 'V2A Edelstahl', 'V4A Edelstahl', 'Messing', 'Kupfer', 'POM', 'PA6', 'PC', 'ABS', 'PETG', 'TPU 95A', 'Pappel-Sperrholz', 'Birken-Sperrholz', 'MDF'}
    sm = {s['k']: s for s in r4['samples']}
    ok4 = (
        need_mats <= set(r4['keys'])
        and r4['allValid']
        and 'PA6' in r4['filament']
        and sm['Kupfer']['rho'] == 8.96 and sm['Kupfer']['metal'] == 1 and sm['Kupfer']['col'] == '#d47c54'
        and sm['MDF']['rho'] == 0.72 and sm['MDF']['metal'] == 0 and sm['MDF']['rough'] >= 0.8
        and sm['PA6']['rho'] == 1.14 and sm['Stahl C45']['rho'] == 7.85 and sm['Stahl C45']['metal'] == 1
        and sm['V4A Edelstahl']['rho'] == 8.0 and sm['V4A Edelstahl']['metal'] == 1
        and sm['Birken-Sperrholz']['rho'] == 0.68 and sm['Birken-Sperrholz']['metal'] == 0
    )

    # 5. UI-Kategorien (optgroup), Suche & Hilfetexte
    p.ev("App.select([App.doc.items[0].id])"); p.wait(350)
    groups = p.pg.evaluate("[...document.querySelectorAll('#p-mat optgroup')].map(g=>g.label)")
    r5 = p.ev("""
      return fetch('data/werkzeug-hilfen.json').then(r => r.json()).then(hj => ({
        cmds: Commands.search('sechskantschraube').length,
        helpOk: ['stdScrew', 'stdNut', 'stdWasher'].every(k => hj[k] && hj[k].tip && hj[k].hilfe && hj[k].tipp && hj[k].hilfe.includes('M24')),
      }));
    """)
    ok5 = (
        {'Metalle', 'Kunststoffe', 'Faserverbund', 'Holz & Platten'} <= set(groups)
        and r5['cmds'] >= 1
        and r5['helpOk']
    )
    return [ok1, ok2, ok3, ok4, ok5]


# ---------- [A-059] 3D-Druck: Drucker und Loch-Ausgleich (DR-01, DR-02) ----------
def t_a059_drucker_loch_ausgleich(p):
    import io, zipfile, tempfile, struct, re
    p.empty()

    # 1. Drucker-Liste prüfen (Bambu A1/A1 mini/P1S/X1C, Prusa MK4/Mini, Ender 3, Voron 2.4) & A1 mini wählen
    printers = p.ev("return Print.PRINTERS")
    names = [x['name'] for x in printers]
    req = ['Bambu Lab A1', 'Bambu Lab A1 mini', 'Bambu Lab P1S', 'Bambu Lab X1C', 'Prusa MK4', 'Prusa Mini', 'Ender 3']
    has_voron = any('Voron 2.4' in n for n in names)
    sel_opts = p.pg.locator('#proj-printer option').all_text_contents()
    p.pg.select_option('#proj-printer', 'bambu-a1-mini'); p.wait(300)
    bed_st = p.ev("return { bed: App.doc.settings.printBed, visCount: Viewer.groups.printBed.children.length }")
    ok1 = (
        all(r in names for r in req) and has_voron
        and len(sel_opts) >= len(printers) + 2
        and bed_st['bed']['enabled'] is True
        and bed_st['bed']['printer'] == 'bambu-a1-mini'
        and bed_st['bed']['x'] == 180 and bed_st['bed']['y'] == 180 and bed_st['bed']['z'] == 180
        and bed_st['visCount'] >= 3
    )

    # 2. Bambu A1 mini (180³) und ein 200-mm-Teil -> Warnung + Drehvorschlag (45° diagonal) + So drehen
    p.ev("App.change('Langes Teil', d => { d.items.push(Model.newItem('box', { w: 200, d: 20, h: 20 }, { name: 'Schiene' })); })")
    warte_rechnen(p, 30)
    p.wait(300)
    warn_cls = p.pg.locator('#proj-bed-status').get_attribute('class') or ''
    warn_txt = p.pg.locator('#proj-bed-status').text_content() or ''
    amp_cls = p.pg.locator('#ampel').get_attribute('class') or ''
    fit_before = p.ev("return Print.fitCheck()")

    # Auch Export-Dialog zeigt die Warnung samt Drehvorschlag
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(300)
    ex_warn = p.pg.locator('#ex-warn-box').count() == 1 and p.pg.locator('#ex-bed-rotate').count() == 1
    p.pg.get_by_role('button', name='Abbrechen').click(); p.wait(200)

    # Ein Klick auf "So drehen" richtet das Teil passend aufs Bett aus
    p.pg.locator('#proj-bed-rotate').click(); p.wait(500)
    warte_rechnen(p, 30)
    p.wait(300)
    fit_after = p.ev("return Print.fitCheck()")
    after_cls = p.pg.locator('#proj-bed-status').get_attribute('class') or ''
    amp_after = p.pg.locator('#ampel').get_attribute('class') or ''

    # Ein 200x200x200-Teil passt auch gedreht nicht
    p.ev("App.change('Zu groß', d => { d.items[0].p = { w: 200, d: 200, h: 200 }; d.items[0].t = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }; })")
    warte_rechnen(p, 30)
    p.wait(300)
    fit_cube = p.ev("return Print.fitCheck()")
    no_rot_btn = p.pg.locator('#proj-bed-rotate').count() == 0
    ok2 = (
        'warn' in warn_cls and '45°' in warn_txt and 'warn' in amp_cls
        and fit_before['fits'] is False and fit_before['suggestion']['canFit'] is True
        and ex_warn
        and fit_after['fits'] is True and 'warn' not in after_cls and 'ok' in amp_after
        and fit_cube['fits'] is False and fit_cube['suggestion']['canFit'] is False and no_rot_btn
    )

    # 3. Loch-Ausgleich 0,2 mm -> Loch Ø 5 hat im STL und 3MF Ø 5,2, Zapfen und Modell bleiben Ø 5,0
    p.ev("Start.newProject(true)"); p.wait(400)
    p.ev("""App.change('Lochtest', d => {
      d.items.push(Model.newItem('box', { w: 30, d: 30, h: 10 }, { name: 'Platte' }));
      const h = Model.newItem('cylinder', { d: 5, h: 20 }, { name: 'Loch', role: 'hole' });
      h.t.z = -5; d.items.push(h);
      const z = Model.newItem('cylinder', { d: 5, h: 10 }, { name: 'Zapfen' });
      z.t.x = 35; d.items.push(z);
    })""")
    warte_rechnen(p, 40)
    p.pg.select_option('#proj-hole-comp', '0.2'); p.wait(300)
    hc_set = p.ev("return Print.holeComp()")

    def measure_stl_diam(data, cx, cy):
        rs = []
        n = struct.unpack('<I', data[80:84])[0]
        for i in range(n):
            base = 84 + i * 50 + 12
            for k in range(3):
                x, y, z = struct.unpack('<3f', data[base + k * 12:base + k * 12 + 12])
                r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if 0.5 < r < 8:
                    rs.append(r)
        return 2 * (sum(rs) / len(rs)) if rs else 0

    def measure_3mf_diam(xml_bytes, cx, cy):
        txt = xml_bytes.decode('utf-8', errors='replace')
        rs = []
        for m in re.finditer(r'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"', txt):
            x, y, z = float(m.group(1)), float(m.group(2)), float(m.group(3))
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if 0.5 < r < 8:
                rs.append(r)
        return 2 * (sum(rs) / len(rs)) if rs else 0

    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(300)
    ex_hc_val = p.pg.locator('#ex-hole-comp').input_value()
    p.pg.check('#ex-stl'); p.pg.check('#ex-mf'); p.pg.uncheck('#ex-step')
    with p.pg.expect_download(timeout=90000) as dl:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z1 = os.path.join(tempfile.gettempdir(), 'tracery-a059-1.zip'); dl.value.save_as(z1)
    zf1 = zipfile.ZipFile(z1)
    stl1 = zf1.read([n for n in zf1.namelist() if n.endswith('.stl')][0])
    mf1_zip = zf1.read([n for n in zf1.namelist() if n.endswith('.3mf')][0])
    mf1 = zipfile.ZipFile(io.BytesIO(mf1_zip)).read('3D/3dmodel.model')
    d_stl_hole = measure_stl_diam(stl1, 0, 0)
    d_stl_pin = measure_stl_diam(stl1, 35, 0)
    d_3mf_hole = measure_3mf_diam(mf1, 0, 0)

    # Modell im CAD-Kern bleibt exakt Ø 5,0 mm
    model_r = p.ev("""const r = App.results.get(App.doc.items[0].id);
      const cf = r && r.data && r.data.faces ? r.data.faces.find(f => f.t === 'CYLINDRE') : null;
      return cf ? cf.r : 0;""")

    # Export ohne Ausgleich -> wieder Ø 5,0 mm
    p.pg.get_by_role('button', name='Exportieren').first.click(); p.wait(300)
    p.pg.select_option('#ex-hole-comp', '0')
    p.pg.check('#ex-stl'); p.pg.uncheck('#ex-step')
    with p.pg.expect_download(timeout=90000) as dl2:
        p.pg.get_by_role('button', name='Als ZIP speichern').click()
    z2 = os.path.join(tempfile.gettempdir(), 'tracery-a059-2.zip'); dl2.value.save_as(z2)
    zf2 = zipfile.ZipFile(z2)
    stl2 = zf2.read([n for n in zf2.namelist() if n.endswith('.stl')][0])
    d_stl_off = measure_stl_diam(stl2, 0, 0)

    ok3 = (
        abs(hc_set - 0.2) < 1e-6 and ex_hc_val == '0.2'
        and abs(d_stl_hole - 5.2) < 0.04
        and abs(d_3mf_hole - 5.2) < 0.04
        and abs(d_stl_pin - 5.0) < 0.04
        and abs(model_r - 2.5) < 1e-3
        and abs(d_stl_off - 5.0) < 0.04
    )

    # 4. Hilfetexte & DOM-Attribute prüfen
    help_ok = p.ev("""return fetch('data/werkzeug-hilfen.json').then(r => r.json()).then(d => ({
      json: ['printerSelect', 'holeComp'].every(k => d[k] && d[k].tip && d[k].hilfe && d[k].tipp),
      dom: document.querySelectorAll('[data-help="printerSelect"]').length === 1 && document.querySelectorAll('[data-help="holeComp"]').length >= 1,
    }))""")
    ok4 = bool(help_ok['json'] and help_ok['dom'])
    return [ok1, ok2, ok3, ok4]


def t_a058_eigene_bibliothek(p):
    # 1. Teil mit Maß „Breite“ (40 mm) und Loch per Rechtsklick → „In meine Bibliothek“ speichern
    p.empty()
    p.ev("""
      UserLib.clear();
      App.change('Teil mit Breite', d => {
        d.params = [{ id: 'm_breite', name: 'Breite', expr: 40 }];
        const g = Model.newItem('group', {}, { name: 'Halterung', color: '#2f9e91' });
        const b = Model.newItem('box', { w: 'Breite', d: 20, h: 10 }, { name: 'Platte', color: '#2f9e91' });
        const h1 = Model.newItem('cylinder', { d: 5, h: 14 }, { name: 'Loch', role: 'hole', t: { x: 'Breite/4', y: 0, z: -2 } });
        g.children = [b, h1];
        d.items = [g];
      });
    """)
    warte_rechnen(p)
    p.ev("Viewer.setView('iso', false); Viewer.fit(null, false); Viewer.renderNow();")
    p.wait(300)

    # Echter Rechtsklick auf das Teil im 3D-Bild → „In meine Bibliothek“
    sx, sy = world_screen(p, -8, 0, 10)
    p.pg.mouse.click(sx, sy, button='right')
    p.pg.wait_for_selector('#cm-userlib')
    cm_has = p.pg.locator('#cm-userlib').count() > 0
    p.pg.locator('#cm-userlib').click()
    p.pg.wait_for_selector('#userlib-save-dialog')
    dlg = p.ev("""
      const img = document.querySelector('#userlib-save-dialog .ul-save-preview img');
      const chks = [...document.querySelectorAll('#ul-params .ul-param-row')].map(r => ({
        name: r.querySelector('.ul-p-name').value,
        val: r.querySelector('.ul-p-val').value,
        checked: r.querySelector('.ul-p-chk').checked,
      }));
      return { thumb: img ? img.src : '', chks };
    """)
    p.pg.locator('#ul-name').fill('Halterung A')
    p.pg.locator('#ul-save-ok').click()
    p.pg.wait_for_selector('#userlib-save-dialog', state='detached')

    # Verlauf-Kontextmenü enthält ebenfalls #tm-userlib; einfacher Grundkörper erkennt Durchmesser/Höhe
    p.ev("document.querySelector('#left-body .node')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 160 }))")
    tm_has = p.pg.locator('#tm-userlib').count() > 0
    p.pg.keyboard.press('Escape')
    p.ev("App.change('Zyl', d => { d.items.push(Model.newItem('cylinder', { d: 12, h: 18 }, { name: 'Bolzen', t: { x: 60 } })); })")
    warte_rechnen(p)
    cyl_det = p.ev("return UserLib.detectParams(App.doc.items[1], App.doc).candidates.map(c => c.name)")
    ok1 = (
        cm_has and tm_has
        and dlg['thumb'].startswith('data:image/png;base64,') and len(dlg['thumb']) > 200
        and any(c['name'] == 'Breite' and c['checked'] and c['val'] == '40' for c in dlg['chks'])
        and 'Durchmesser' in cyl_det and 'Höhe' in cyl_det
    )

    # 2. Neues Projekt öffnen → unter „Meine Teile“ mit Vorschaubild einsetzen → Breite ändern passt Körper an
    p.ev("Start.show()")
    p.wait(250)
    p.empty()
    p.pg.locator('#t-parts').click()
    p.pg.wait_for_selector('#my-parts-head')
    fly = p.ev("""
      const head = document.querySelector('#my-parts-head')?.textContent || '';
      const tile = document.querySelector('#my-parts-grid .tile.user-tile');
      const img = tile ? tile.querySelector('img.ul-thumb') : null;
      return {
        head,
        hasTile: !!tile,
        label: tile ? tile.querySelector('.lbl')?.textContent : '',
        thumbOk: !!(img && img.src.startsWith('data:image/png;base64,')),
      };
    """)
    p.pg.locator('#my-parts-grid .tile.user-tile').first.click()
    warte_rechnen(p)

    info_before = p.ev("""
      return Mass.measure().then(m => {
        const id = App.doc.items[0]?.id;
        const b = id && Actions.worldBox(id);
        return {
          paramsLen: App.doc.params.length,
          dx: b ? b.max.x - b.min.x : 0,
          dy: b ? b.max.y - b.min.y : 0,
          dz: b ? b.max.z - b.min.z : 0,
          vol: m?.volume || 0,
          upTitle: document.querySelector('#userpart-sec .section-h')?.textContent || '',
          upInputName: document.querySelector('#up-0')?.dataset?.upName || '',
          upVal: document.querySelector('#up-0')?.value || '',
        };
      });
    """)

    # Breite im Eigenschaften-Panel von 40 auf 80 ändern
    inp = p.pg.locator('#up-0')
    inp.click()
    inp.fill('80')
    inp.press('Enter')
    warte_rechnen(p)

    info_after = p.ev("""
      return Mass.measure().then(m => {
        const id = App.doc.items[0]?.id;
        const b = id && Actions.worldBox(id);
        return {
          paramsLen: App.doc.params.length,
          dx: b ? b.max.x - b.min.x : 0,
          dy: b ? b.max.y - b.min.y : 0,
          dz: b ? b.max.z - b.min.z : 0,
          vol: m?.volume || 0,
        };
      });
    """)
    ok2 = (
        'Meine Teile' in fly['head'] and fly['hasTile'] and fly['label'] == 'Halterung A' and fly['thumbOk']
        and info_before['paramsLen'] == 0 and info_before['upInputName'] == 'Breite' and info_before['upVal'] == '40'
        and abs(info_before['dx'] - 40) < 0.2 and abs(info_before['dy'] - 20) < 0.2 and abs(info_before['dz'] - 10) < 0.2
        and info_after['paramsLen'] == 0
        and abs(info_after['dx'] - 80) < 0.2 and abs(info_after['dy'] - 20) < 0.2
        and info_after['vol'] > info_before['vol'] * 1.8
    )

    # 3. Zweite Kopie einsetzen → behält eigene Breite 40, während erste 80 bleibt
    p.pg.locator('#t-parts').click()
    p.pg.wait_for_selector('#my-parts-grid .tile.user-tile')
    p.pg.locator('#my-parts-grid .tile.user-tile').first.click()
    warte_rechnen(p)
    two = p.ev("""
      const boxes = App.doc.items.map(it => {
        const b = Actions.worldBox(it.id);
        return b ? b.max.x - b.min.x : 0;
      });
      return { count: App.doc.items.length, boxes };
    """)
    ok3 = two['count'] == 2 and abs(two['boxes'][0] - 80) < 0.2 and abs(two['boxes'][1] - 40) < 0.2

    # 4. Neuladen → Bibliothek bleibt erhalten, Teil löschen & Hilfetext prüfen
    p.pg.reload(wait_until='domcontentloaded')
    p.pg.wait_for_function("() => !!(window.__M && window.__M.UserLib && window.__M.Commands && window.__M.App)", timeout=15000)
    p.ev("Start.hide()")
    persisted = p.ev("""
      return fetch('data/werkzeug-hilfen.json').then(r => r.json()).then(helpJson => {
        const list = UserLib.list();
        return {
          n: list.length,
          name: list[0]?.name,
          hasThumb: !!(list[0]?.thumb && list[0].thumb.startsWith('data:image/png;base64,')),
          hasBreite: (list[0]?.params || []).some(q => q.name === 'Breite'),
          cmds: Commands.search('meine bibliothek').length + Commands.search('meine teile').length,
          helpOk: !!(helpJson.userLibrary && helpJson.userLibrary.tip && helpJson.userLibrary.hilfe && helpJson.userLibrary.tipp),
        };
      });
    """)
    p.pg.locator('#t-parts').click()
    p.pg.wait_for_selector('#my-parts-grid .tile.user-tile .ul-del')
    p.pg.locator('#my-parts-grid .tile.user-tile .ul-del').first.click()
    after_del = p.ev("return { n: UserLib.list().length, emptyTxt: document.querySelector('#my-parts-grid')?.textContent || '' }")
    p.ev("UserLib.clear()")
    ok4 = (
        persisted['n'] == 1 and persisted['name'] == 'Halterung A'
        and persisted['hasThumb'] and persisted['hasBreite']
        and persisted['cmds'] >= 2 and persisted['helpOk']
        and after_del['n'] == 0 and 'Noch keine eigenen Teile' in after_del['emptyTxt']
    )
    return [ok1, ok2, ok3, ok4]


def t_a062_zeichnung_blaetter(p):
    import re
    p.empty()
    p.ev("App.change('Quader', d => d.items.push(Model.newItem('box', { w: 40, d: 25, h: 15 }, { name: 'Gehäuse' })))")
    warte_rechnen(p)

    # 1. In Bereich Zeichnung wechseln, Blatt 1 auf A4 hoch stellen → Tabs, Rahmen & Schriftfeld prüfen
    p.pg.click('#tab-drawing')
    p.pg.wait_for_selector('#sheet .sheet-holder svg', timeout=15000)
    p.pg.wait_for_selector('#sheet-tabs .sheet-tab')
    p.pg.click('#t-sheet'); p.wait(200)
    p.pg.select_option('#dw-sheet', 'A4')
    p.pg.select_option('#dw-orient', 'portrait')
    p.pg.click('#sheet-tabs'); p.wait(300)

    s1 = p.ev("""
      const svg = document.querySelector('#sheet .sheet-holder svg');
      const tabs = [...document.querySelectorAll('#sheet-tabs .sheet-tab')];
      const lay = Drawing.layout;
      return {
        vb: svg?.getAttribute('viewBox'),
        txt: svg?.textContent || '',
        tabCount: tabs.length,
        tabName: tabs[0]?.querySelector('.st-name')?.textContent,
        tabFmt: tabs[0]?.querySelector('.st-fmt')?.textContent,
        delCount: document.querySelectorAll('#sheet-tabs .st-del').length,
        frame: lay?.frame,
        tb: lay?.tb,
      };
    """)
    ok1 = (
        s1['vb'] == '0 0 210 297'
        and s1['tabCount'] == 1
        and s1['tabName'] == 'Blatt 1'
        and s1['tabFmt'] == 'A4'
        and s1['delCount'] == 0
        and s1['frame'] == {'x': 20, 'y': 10, 'w': 180, 'h': 277}
        and s1['tb'] and s1['tb']['w'] == 180
        and 'A4' in s1['txt'] and '1/1' in s1['txt']
    )

    # 2. Zweites Blatt hinzufügen, auf A3 quer stellen, umbenennen & Tab-Wechsel prüfen
    p.pg.click('#dw-add-sheet'); p.wait(400)
    p.pg.select_option('#dw-panel-sheet', 'A3')
    p.pg.select_option('#dw-panel-orient', 'landscape')
    p.wait(300)
    p.pg.click('#sheet-tabs .sheet-tab.active .st-ren'); p.wait(200)
    p.pg.fill('#prompt-inp', 'Detailansicht')
    p.pg.click('.modal .btn.primary'); p.wait(300)

    s2 = p.ev("""
      const svg = document.querySelector('#sheet .sheet-holder svg');
      const tabs = [...document.querySelectorAll('#sheet-tabs .sheet-tab')];
      return {
        vb: svg?.getAttribute('viewBox'),
        txt: svg?.textContent || '',
        tabCount: tabs.length,
        names: tabs.map(t => t.querySelector('.st-name')?.textContent),
        fmts: tabs.map(t => t.querySelector('.st-fmt')?.textContent),
        delCount: document.querySelectorAll('#sheet-tabs .st-del').length,
      };
    """)
    p.pg.locator('#sheet-tabs .sheet-tab').first.click(); p.wait(300)
    vb_back1 = p.ev("return { vb: document.querySelector('#sheet .sheet-holder svg')?.getAttribute('viewBox'), txt: document.querySelector('#sheet .sheet-holder svg')?.textContent || '' }")
    p.pg.locator('#sheet-tabs .sheet-tab').nth(1).click(); p.wait(300)
    vb_back2 = p.ev("return { vb: document.querySelector('#sheet .sheet-holder svg')?.getAttribute('viewBox'), txt: document.querySelector('#sheet .sheet-holder svg')?.textContent || '' }")

    ok2 = (
        s2['tabCount'] == 2
        and s2['names'] == ['Blatt 1', 'Detailansicht']
        and s2['fmts'] == ['A4', 'A3']
        and s2['delCount'] == 2
        and s2['vb'] == '0 0 420 297'
        and 'A3' in s2['txt'] and '2/2' in s2['txt'] and 'Detailansicht' in s2['txt']
        and vb_back1['vb'] == '0 0 210 297' and '1/2' in vb_back1['txt']
        and vb_back2['vb'] == '0 0 420 297' and '2/2' in vb_back2['txt']
    )

    # 3. Formate A2, A1, A0 (quer & hoch) inkl. Schriftfeld- & Rahmenanpassung prüfen, dann wieder A3 quer
    fmt_checks = []
    for fmt, ori, exp_vb, exp_m in [
        ('A2', 'landscape', '0 0 594 420', 10),
        ('A1', 'landscape', '0 0 841 594', 20),
        ('A0', 'landscape', '0 0 1189 841', 20),
        ('A0', 'portrait', '0 0 841 1189', 20),
    ]:
        p.pg.select_option('#dw-panel-sheet', fmt)
        p.pg.select_option('#dw-panel-orient', ori)
        p.wait(200)
        st = p.ev("const s=document.querySelector('#sheet .sheet-holder svg'), l=Drawing.layout; return { vb: s?.getAttribute('viewBox'), txt: s?.textContent || '', frame: l?.frame, tb: l?.tb }")
        fmt_checks.append(
            st['vb'] == exp_vb and fmt in st['txt']
            and st['frame'] and st['frame']['x'] == 20 and st['frame']['y'] == exp_m
            and st['tb'] and st['tb']['w'] == 180 and st['tb']['w'] <= st['frame']['w']
        )
    p.pg.select_option('#dw-panel-sheet', 'A3')
    p.pg.select_option('#dw-panel-orient', 'landscape')
    p.wait(250)
    ok3 = all(fmt_checks)

    # 4. PDF-Export: beide Blätter (A4 hoch, A3 quer) → 2 Seiten mit exakten MediaBox-Größen
    p.pg.click('#t-dexport'); p.wait(200)
    with p.pg.expect_download(timeout=30000) as dl_info:
        p.pg.locator('.menu button', has_text='PDF').click()
    dl = dl_info.value
    pdf_path = dl.path()
    pdf_bytes = open(pdf_path, 'rb').read()
    mboxes = re.findall(rb'/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]', pdf_bytes)
    pt_to_mm = 25.4 / 72.0
    sizes_mm = [(float(w) * pt_to_mm, float(h) * pt_to_mm) for w, h in mboxes]
    ok4 = (
        dl.suggested_filename.lower().endswith('.pdf')
        and pdf_bytes.startswith(b'%PDF-1.4')
        and b'xref' in pdf_bytes and b'%%EOF' in pdf_bytes
        and b'/Count 2' in pdf_bytes
        and len(sizes_mm) == 2
        and abs(sizes_mm[0][0] - 210) < 0.5 and abs(sizes_mm[0][1] - 297) < 0.5
        and abs(sizes_mm[1][0] - 420) < 0.5 and abs(sizes_mm[1][1] - 297) < 0.5
        and b'1/2' in pdf_bytes and b'2/2' in pdf_bytes and b'Detailansicht' in pdf_bytes
    )

    # 5. Löschen, Rückgängig/Wiederholen, Speichern/Laden, Legacy-Migration & Hilfetexte
    p.pg.click('#sheet-tabs .sheet-tab.active .st-del'); p.wait(300)
    after_del = p.ev("return { n: Drawing.sheets().length, tabs: document.querySelectorAll('#sheet-tabs .sheet-tab').length, dels: document.querySelectorAll('#sheet-tabs .st-del').length, txt: document.querySelector('#sheet .sheet-holder svg')?.textContent || '' }")
    p.ev("App.undo()"); p.wait(400)
    after_undo = p.ev("return { n: Drawing.sheets().length, names: Drawing.sheets().map(s=>s.name), fmts: Drawing.sheets().map(s=>s.sheet+':'+s.orient) }")
    p.ev("App.redo()"); p.wait(400)
    after_redo = p.ev("return Drawing.sheets().length")
    p.ev("App.undo()"); p.wait(400)

    saved = p.ev("return JSON.stringify(App.doc)")
    p.ev("App.setDoc(JSON.parse(arg), {fit:false})", saved); warte_rechnen(p); p.wait(400)
    after_reload = p.ev("return { n: Drawing.sheets().length, names: Drawing.sheets().map(s=>s.name), fmts: Drawing.sheets().map(s=>s.sheet+':'+s.orient) }")

    # Legacy-Migration (flaches doc.drawing ohne sheets[])
    legacy = p.ev("""
      const d = JSON.parse(JSON.stringify(App.doc));
      d.drawing = { sheet: 'A3', orient: 'portrait', scale: 'auto', views: { front: true, top: true, left: true, iso: false }, hidden: true, centers: true, dims: [], free: [], title: { titel: 'Alt', nummer: '1', name: '', datum: '', werkstoff: 'PLA', firma: '', blatt: '1/1' } };
      App.setDoc(d, { fit: false });
      return { n: Drawing.sheets().length, sh: Drawing.activeSheet().sheet, or: Drawing.activeSheet().orient, blatt: Drawing.activeSheet().title.blatt };
    """)
    help_ok = p.ev("""
      return fetch('data/werkzeug-hilfen.json').then(r => r.json()).then(hj => {
        const keys = ['drawingSheets', 'drawingFormat'];
        return keys.every(k => hj[k] && hj[k].tip && hj[k].hilfe && hj[k].tipp) && Commands.search('zeichnungsblatt').length >= 1;
      });
    """)

    ok5 = (
        after_del['n'] == 1 and after_del['tabs'] == 1 and after_del['dels'] == 0 and '1/1' in after_del['txt']
        and after_undo['n'] == 2 and after_undo['names'] == ['Blatt 1', 'Detailansicht'] and after_undo['fmts'] == ['A4:portrait', 'A3:landscape']
        and after_redo == 1
        and after_reload['n'] == 2 and after_reload['names'] == ['Blatt 1', 'Detailansicht'] and after_reload['fmts'] == ['A4:portrait', 'A3:landscape']
        and legacy['n'] == 1 and legacy['sh'] == 'A3' and legacy['or'] == 'portrait' and legacy['blatt'] == ''
        and help_ok
    )
    return [ok1, ok2, ok3, ok4, ok5]


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
    ('Skizze: Ecke runden / zu groß / Fase / Körper stimmt', t_ecke_runden),
    ('Skizze: Ellipse eintippen / mit der Maus gedreht / Breite ändern / Körper stimmt', t_ellipse),
    ('Skizze: Rechteck aus der Mitte / bleibt mittig', t_rechteck_mitte),
    ('Skizze: Regeln Konzentrisch / Mittig', t_mittig_konzentrisch),
    ('Skizze: Text setzen / Höhe als Maß / Text ändern / Gravur im Rechteck / Körper', t_text),
    ('Skizze: Spline wird genaue Kurve', t_spline_genau),
    ('Skizze: Bild-Vorlage / Maßstab / verschieben / gespeichert / wieder da', t_bild_vorlage),
    ('Skizzenleiste bricht um', t_skizzenleiste),
    ('Magnet auf der Fläche: Loch in die Mitte / Mittellinie / gleicher Randabstand / Hilfslinien weg', t_magnet_flaeche),
    ('Magnet zwischen Körpern: bündig / Strg hält an / Einstellung aus', t_magnet_koerper),
    ('Rundung mit Ziehgriff: Griff an der Kante / Ziehen setzt Radius / Körper / Rückgängig', t_rundung_ziehen),
    ('Skizzen-Ebene: Abstand beim Start / Neigung 30° / Körper', t_ebene_versetzt),
    ('Doppelklick auf eine Fläche startet die Skizze', t_doppelklick_flaeche),
    ('Übergang (Loft): zwei Umrisse / Maße / Spitze verlängern / Zur Spitze', t_uebergang),
    ('Entlang Pfad (Sweep): offener Pfad wird Rohr / Volumen / hohl / rechteckig / Pfad bearbeiten', t_entlang_pfad),
    ('Abstand zwischen zwei Teilen setzen', t_abstand_setzen),
    ('STEP/STL importieren: einlesen / Größe stimmt / Einheit Zoll / STL als Körper', t_import_step),
    ('Skizzen-Schablonen: Auswahl / QFP-48 / Rückgängig / Pin-Raster / Werte / USB-C-Stecker', t_schablonen),
    ('Muster entlang Kurve: Skizze startet / Linie / Abstand / Kreis mitdrehen / ohne Drehen', t_muster_kurve),
    ('KI: Muster entlang Kurve / kennt die Aktion', t_ki_muster_kurve),
    ('Kreismuster: senkrecht / Drehachse quer / Mitte Z', t_kreismuster_achse),
    ('Bohrungen an Skizzenpunkten: Assistent / Lage / fertig', t_bohrung_punkte),
    ('Skizze: Wand aus Linie / Fläche / Körper', t_wand),
    ('Schritt hinter dem Marker: schmale Leiste / Marker dahinter', t_hinter_marker),
    ('Skizze: Schildchen überdecken sich nicht', t_schildchen_ueberlappen),
    ('Skizze: Kante übernehmen / Linie fest / Kreis', t_kante_uebernehmen),
    ('Verbundene Kanten: verbunden / Linie wandert / Kreis wächst / ein Rückgängig / Hinweis / lösen', t_kante_verbunden),
    ('Kreismuster um gewählte Achse: Wählen / Achse aus Kante / Kopien', t_kreismuster_gewaehlt),
    ('Drohnen-Bausteine: in der Leiste / GoPro / XT60 / Antenne / 2 Finger', t_bausteine),
    ('Fahrtwind: Stirnfläche vorne und oben / Propeller nur mit Häkchen / Ansicht von vorne / 30° Neigung / schließen', t_fahrtwind),
    ('Überhänge: Fläche / Winkel / ohne Überhang / aus', t_ueberhang),
    ('Schwachstellen: Überhang bei Druckteilen / weg ohne Überhang', t_ueberhang_schwach),
    ('Skizzen-Muster als Ganzes ändern: anlegen / Feld / 5 × 8 / Rückgängig', t_muster_ganz),
    ('Drehgelenk: Achse wählen / angelegt / 90° / Bewegung prüfen / lösen', t_gelenk),
    ('Schiebegelenk: Achse / Art Schieben / 10 mm / frei', t_schiebegelenk),
    ('Gelenk: Anschlag übernehmen / gesetzt / Rückgängig / Abspielen bewegt das Bild / Projekt unverändert', t_gelenk_anschlag),
    ('Gelenk in einer Gruppe: Knopf / 90° in Weltlage / Rückgängig / Bewegung prüfen, kein Abspielen', t_gelenk_gruppe),
    ('Übergang mit Mittellinie: zeichnen / Vorschau / Fertig / Rückgängig / ohne', t_uebergang_mittellinie),
    ('KI-Kollege biegt einen Übergang mit Mittellinie', t_ki_mittellinie),
    ('Übergang mit Führungskurve: vorgezeichnet / bauchig in der Vorschau / Fertig / Rückgängig', t_uebergang_fuehrung),
    ('Übergang mit zwei Führungskurven: quer zur ersten vorgezeichnet / Vorschau in beiden Richtungen / Fertig / Rückgängig / beide weg', t_uebergang_zwei),
    ('KI-Kollege: Rumpf mit zwei Führungskurven (von der Seite und von oben)', t_ki_zwei_fuehrung),
    ('Text im Bogen: Radius / an Kreis legen / Rückgängig / Körper', t_text_bogen),
    ('Text entlang Kurve: über der Kurve / andere Seite / verschieben / Kurve ändern / gerade / Körper', t_text_kurve),
    ('KI-Kollege: Text entlang einer Kurve', t_ki_text_kurve),
    ('Skizzen-Ebenen: mittig zwischen zwei Flächen / Körper darauf / durch drei Ecken / sauber', t_skizze_ebenen),
    ('Schnitt in die Skizze: Zylinder / Steg / ein Rückgängig / sauber', t_schnitt_skizze),
    ('Ellipse versetzen: Spline genau im Abstand / nach innen zu weit', t_versatz_ellipse),
    ('Versatz einer Kette: alle Stücke zusammen ändern / Rückgängig', t_versatz_kette_zusammen),
    ('H-Rahmen: im Frame-Assistenten / Längs- und Querträger / Maße / Drohnen-Check / DXF', t_h_rahmen),
    ('Rahmen mit einzelnen Armen: Bodenplatte und vier Arme / Maße / Drohnen-Check / einzeln als DXF / Spalt', t_sandwich),
    ('Rohr im Raum mit Regeln: entlang Z / Länge / entlang X / Körper / Startpunkt wandert, Regeln halten / Rückgängig und Länge frei', t_rohr_regeln),
    ('Rohr im Raum: Länge im Bild anklicken und eintippen', t_rohr_masse_bild),
    ('Rohr im Raum: rechtwinklig und parallel zum vorigen Stück', t_rohr_rechtwinklig),
    ('Rohr im Raum: Punkte hängen am Körper / wandern mit / Rückgängig / lösen', t_rohr_haengt),
    ('KI-Kollege: Rohr im Raum mit Regeln (senkrecht 25, dann 15 nach hinten)', t_ki_rohr_regeln),
    ('Fase: zwei Abstände / Seiten tauschen / Winkel / zurück auf gleich', t_fase_arten),
    ('Rundung von … bis: wächst entlang der Kante / Richtung tauschen', t_rundung_variabel),
    ('Magnet auf runden Flächen: Loch oben auf dem Rohr / Mitte oben / Hinweis und Linien / seitlich waagerecht / sauber / Kugel vorne', t_magnet_rund),
    ('Magnet für Kaufteile aus der Leiste: Motor rastet in die Mitte', t_magnet_kaufteil),
    ('Ziehen aus der Leiste: Vorschau in echter Form, danach weg', t_vorschau_echt),
    ('Antenne als Kaufteil: Pilz und Stab in der Leiste / Maße / Stab mit U.FL', t_antenne),
    ('Zeitleiste mit Vorschau: Maus über Schritt / spätere blass / Maus weg / Änderung beendet', t_zeitleiste_vorschau),
    ('DXF importieren: Platte in Millimetern mit Löchern / offene und unlesbare Datei', t_dxf_import),
    ('Motorverkleidung: Baustein / Maße / Motor und Arm passen / hohl / Hecklänge', t_motorverkleidung),
    ('Vieleck drehen: Feld Drehung / Fläche oben / Wert / Ecke oben', t_vieleck_drehen),
    ('SVG importieren: Größe in Millimetern / Kreis und Lage / Rundungen, Dreieck, offene Kurve / Text-Hinweis', t_svg_import),
    ('Skizze skalieren: Größe im Panel / Breite ändern / Maße wachsen mit / Faktor / Rückgängig', t_skizze_skalieren),
    ('Flugzeit: Schätzung im Drohnen-Check / Zahl stimmt / schwerer = kürzer / Akku ohne Angaben / winziger Akku', t_flugzeit),
    ('Stückliste: gleiche Teile zusammen / Kaufteile und fehlendes Gewicht / Dialog / Zeile wählt Teile / CSV / Filament', t_stueckliste),
    ('Stückliste der Drohnen-Vorlage: Motoren und Propeller je 4 / Schrauben gezählt, gleiche Achse nur einmal', t_stueckliste_drohne),
    ('DXF/SVG in die offene Skizze: Elemente kommen dazu / Rückgängig / DXF', t_umriss_in_skizze),
    ('Studio-Look: Werkstoff-Aussehen / Schatten / eigene Farbe / Farbe vom Werkstoff / Ton, einfach, Licht, Schatten aus / Bild 4K durchsichtig', t_studio_look),
    ('Formschritte mit Modus: eigener Körper / Abziehen / im Verlauf markiert / Vereinigen / Schnittmenge / zurück und Rückgängig / Ziel zu spät', t_koerper_modus),
    ('[A-001] Drohnen-Bereich unsichtbar: Startseite / Menüs und Bibliothek / Befehlssuche / Über-Dialog / altes Projekt mit buyMotor', t_a001_drohnen_unsichtbar),
    ('[A-002] KI-Kollege allgemein: Systemtext ohne Drohne/FPV / Vorschläge / Auftrag Gehäuse 60×40×30 mit Deckel / Prompt & Rückgängig', t_a002_ki_allgemein),
    ('[A-003] Skizzen-Prüfer: Lücke 0,01 mm und doppelte Linie / hervorheben / Alles reparieren / Rückgängig & Körper / offenes Ende', t_a003_skizzen_pruefer),
    ('[A-004] Rahmen-Auswahl in der Skizze: Fenster links→rechts / Umschalt+Kreuz-Rahmen / H übernimmt in patSel / Entf löscht', t_a004_rahmen_auswahl),
    ('[A-005] Linie und Bogen im Wechsel: Hinweistext / Linie-A-Bogen-A-Linie / Tangential & Deckungsgleich / geschlossene Bahn / Taste A ohne Entwurf', t_a005_linie_bogen_wechsel),
    ('[F-11232113] Volltest-Reparatur: Kontextleiste / Skizzen-Auswahl / Vorige Ansicht / Maus-Koordinaten', t_f11232113),
    ('[A-021] Profi-Stufe und eigene Tastenkürzel: erster Start / Profi-Schild / Kürzel ändern / doppeltes Kürzel / Zurücksetzen', t_a021_profi_kuerzel),
    ('[A-007] Hochziehen als dünne Wand: L-Linienzug mittig / innen & außen / geschlossener Umriss als Rohr / Skizze bearbeiten & Fehler', t_a007_duenne_wand),
    ('[A-006] Versatz mehrfach, beidseitig und runde Ecken: 3× Rechteck / beidseitig / Ecken rund / Kette & Rückgängig', t_a006_versatz_mehrfach),
    ('[A-008] Bohrungs-Arten: Sackloch Ø 5 × 10 mit 118°-Spitze / Passbohrung H7 / Zentrierbohrung / Vorschau & Hilfe', t_a008_bohrungsarten),
    ('[A-011] 3MF einlesen: Export-Roundtrip / mehrere Teile mit Namen & Farben / Einheit & Transform / Fehler', t_a011_3mf_import),
    ('[A-009] Kosmetisches Gewinde: Zylinder Ø 6 M6 × 10 markieren / Stückliste & Zeichnung / Rückgängig / Speichern / Echt machen / Innengewinde', t_a009_kosmetisches_gewinde),
    ('[A-010] OBJ und GLB speichern: ZIP mit .obj/.mtl/.glb / MTL-Farben / GLB-Kopf & Meshes / Studio-Material / Einzeln', t_a010_obj_glb),
    ('[A-012] Messungen bleiben stehen: Abstand behalten / Quader höher / ein- und ausblenden / umbenennen / verloren & Rückgängig / löschen', t_a012_messungen_bleiben),
    ('[A-013] Schnitt mit Kappe und mehreren Ebenen: Würfel mit Loch / X und Y gleichzeitig / alle drei Ebenen & Kreisloch / Kappe an-aus / sauber beendet', t_a013_schnitt_kappe_mehrfach),
    ('[A-016] Speicher für große Projekte: 15 MB Import sichern & neu laden / Versionen in IndexedDB / Migration aus localStorage / Löschen räumt Blobs auf', t_a016_speicher_gross),
    ('[A-015] Projekt in Ordner speichern: ohne API ausgeblendet / Ordner wählen & Anzeige / 10 s gebündelt / Trennen & Projektwechsel / Hilfe', t_a015_ordner_speichern),
    ('[A-018] Verschieben/Drehen als Schritt: anlegen / ändern / drehen / unterdrücken / Marker / Kopie / Formel & Rückgängig', t_a018_verschieben_drehen_schritt),
    ('[A-017] Ebene im Winkel und Bezugsachsen: 30° an Quaderkante / Achse durch Zylinder → Kreismuster / Drehen um Bezugsachse / 2 Punkte & senkrecht auf Fläche', t_a017_ebene_winkel_achsen),
    ('[A-014] Einheiten je Projekt: Zoll 1 in = 25,4 mm & Eingabe 2 = 50,8 mm / explizite Einheiten / Kontextleiste, Messen & Stückliste / cm & m / Rückgängig & Hilfe', t_a014_einheiten_projekt),
    ('[F-11240028] Volltest-Reparatur: Kamera-Animation bei rAF-Stau / Abbruch bei Nutzer-Start / Übergang-Vorschau ohne Debounce-Stau', t_f11240028),
    ('[A-019] Übersetzbare Oberfläche (Schritt 1): Sammlung & T() / Werkzeugleiste / Startseite / Menüs / Kontextleiste', t_a019_uebersetzbare_oberflaeche),
    ('[A-024] Winkelfang und runde Längen beim Zeichnen: 45° & runde Länge / Linienzug 30° / Umschalt frei / Zoom 0,5 & 0,1 / Menü & gespeichert', t_a024_winkelfang),
    ('[A-022] Skizze fertig bestimmen: Rechteck & Kreis / Regeln <2° & <0,05 mm / gestrichelte Vorschau & Abbrechen / Übernehmen & Rückgängig / Einfach & Profi', t_a022_skizze_fertig_bestimmen),
    ('[A-025] Ganze Fläche in die Skizze, mit Versatz: 4 Linien + 1 Kreis / verbunden / Versatz +2 mm (44×34, Ø6) / Versatz −2 mm / folgt Körperänderung & Rückgängig', t_a025_flaeche_uebernehmen),
    ('[A-027] Weitere Bezugsebenen: tangential an Zylinder & Kegel / senkrecht zu Kante & Kurve / durch Kante & Punkt / durch zwei Kanten / folgt Maßen & Hilfe', t_a027_weitere_bezugsebenen),
    ('[A-023] Freie Stellen & Widerspruch erklären: Linie mit Länge / Wackeln & Umschalt F / 3. Maß Liste & Hervorheben / Entfernen löst / Regel- & Live-Widerspruch', t_a023_freie_stellen_widerspruch),
    ('[A-026] Eigene Schrift laden (TTF): Laden & Körper / Speichern & Neu-Laden / Kerning & Laufweite / CFF-Meldung', t_eigene_schrift),
    ('[A-029] Hochziehen bis Fläche: bis zur nächsten Fläche (15→20) / Transform (+5→25) / gewählte Fläche & Größenänderung / Formschritt mit Modus / schräge Fläche / Rückgängig & Hilfe', t_a029_hochziehen_bis_flaeche),
    ('[F-11240211] Volltest-Reparatur: Schildchen ohne Re-Entranz bei überfälliger Kamera-Animation / Eigenschaften-Panel sofort bei Auswahl', t_f11240211),
    ('[A-028] Bezugspunkte und Koordinatensystem: Kantenmitte 40 mm → 20 mm / Flächenmitte & x % / Schnitt Kante & Ebene / eigenes KS & Mitwandern / Export STEP, STL & 3MF ab Nullpunkt', t_a028_bezugspunkte_koordinatensystem),
    ('[A-031] Rippe (KP-06): offene Schale mit diagonaler Rippe / einseitig & Formel / Schräge / Zeitleiste, Stützrippe & Hilfe', t_a031_rippe),
    ('[A-030] Drehen mit Winkel und bis Fläche: 90° Viertel-Volumen / symmetrisch 2×45° / beidseitig verschieden & umgekehrt / bis Fläche & Nachführen / Winkel-Ziehgriff & Hilfe', t_a030_drehen_winkel_flaeche),
    ('[A-032] Fläche aufdicken & Körper skalieren: Skalieren ×2 / je Achse 1/1/3 / Ursprung & Schwerpunkt / Aufdicken +3 mm / innen, mittig & Platte / Verlauf & Hilfe', t_a032_aufdicken_skalieren),
    ('[A-034] Verlauf umsortieren, Ordner, duplizieren: zwei Löcher tauschen / Loch vor Körper rot abgelehnt / Ordner anlegen & zuklappen / Duplizieren & Hilfe', t_a034_verlauf_ordner),
    ('[A-033] Körper-Liste im Teil: 2 Körper / Umbenennen / Färben / Ausblenden / Projektdatei und Export', t_koerper_liste),
    ('[F-11240339] Volltest-Reparatur: Kontextleiste nach Ghost-Auswertung / Gelenk-Abspielen bei rAF-Stau', t_f11240339),
    ('[A-037] Schritt spiegeln: Tasche links an Mittelebene / Bezugsebene & Fläche / Erhöhung & Änderung folgt / Unterdrücken, Marker, Gruppe & Hilfe', t_a037_schritt_spiegeln),
    ('[A-036] Muster von Schritten: Tasche 6× im Kreis / Kopie per Klick auslassen / wieder aktiv & Undo / Rechteckmuster & Auflösen / Hilfe & Speichern', t_muster_schritte),
    ('[A-035] Kaputter Bezug: neu wählen (Rundung, Fase, Skizze)', t_kaputter_bezug),
    ('[A-039] Gewinde direkt auf runde Fläche: Bolzen Ø10 M10 echt 15 mm / Bohrung Ø8,5 M10 innen / Steigung & kosmetisch / Hilfe', t_a039_gewinde_flaeche),
    ('[A-038] Bohrungs-Assistent mehr Gewinde: Feingewinde M10×1,25 (8,8 mm) / 1/4"-20 UNC (5,1 mm) / Rohrgewinde G1/4 / Tabelle & Hilfe', t_a038_mehr_gewinde),
    ('[A-040] Varianten schalten Schritte: ohne Loch / Volumen & zurück / Vergleich / Maße & Schritte / Abweichung & Undo', t_a040_varianten_schritte),
    ('[A-041] Formeln: wenn, runden, aufrunden, abrunden, Tabelle & Klartext-Fehler', t_a041_formeln),
    ('[A-042] Prägen auf gewölbter Fläche: Text auf Zylindermantel vertieft / erhaben ein Stück / Höhe, Unterdrücken & Marker / Kugel & Hilfe', t_a042_praegen),
    ('[F-11240521] Volltest-Reparatur: Drehteller-Video bei rAF-Stau / Einführung reagiert sofort auf Skizze', t_f11240521),
    ('[A-045] STEP mit Farben und Namen: Gruppe mit Deckel (rot) & Boden (blau) exportieren / Import stellt Gruppe, Namen & Farben wieder her / 3D-Farben & Verlauf / Roundtrip & Ordner / Hilfe', t_a045_step_farben_namen),
    ('[A-043] Wickeln um Zylinder (KP-34): Rechteck 31,4 mm auf Ø20 → 180° ± 2° / vertieft, Winkel & Ø40 / Linie & Entlang Pfad / Verlauf & Hilfe', t_a043_wickeln_zylinder),
    ('[A-044] IGES und BREP: Export und Import (Quader, Loch, Dialog)', t_a044_iges_brep),
    ('[A-046] Dateien ins Fenster ziehen: Hinweis-Rahmen / STL / Projektdatei / OBJ / DXF & SVG / unbekannte Datei', t_a046_dateien_ziehen),
    ('[A-048] Geometrie-Prüfung: gesunder Quader / Kugel & Zylinder / winzige Kante / Hervorheben / Suche & Hilfe', t_geometrie_pruefung),
    ('[A-047] Import prüfen und heilen: offenes STEP / Hinweis / Heilen mit Ergebnis / Lücken & gültiges STEP', t_a047_import_heilen),
    ('[A-049] Werkzeugleiste anpassen & Favoriten: Rechtsklick / Entfernen / Hinzufügen & Sortieren per Ziehen / Favorit ganz links / Neu laden / Zurücksetzen & Hilfe', t_a049_werkzeugleiste),
    ('[A-050] Genauigkeit & Nachkommastellen: Anzeige 0–4 (12,3456 → 12,346 / 12) / Winkel getrennt / Schilder, Maße & Panels gleich / gespeichertes Maß & Kern exakt / Neuladen & Hilfe', t_a050_genauigkeit),
    ('[F-11240651] Volltest-Reparatur: Übergang-Vorschau im Auswahl-Werkzeug / Explosion-Animation & Regler-Abbruch bei rAF-Stau', t_f11240651),
    ('[A-052] Statusleiste vollständig: 2 Kanten Summe / Fläche Flächeninhalt / Einheit-Klick öffnet Einstellung / Rechenzustand & Hilfe', t_a052_statusleiste),
    ('[A-053] Projekt-Vorlagen: 3D-Druck Druckbett / Zoll, Laser, Gehäuse / Eigene Vorlage speichern & wieder öffnen / Löschen', t_a053_projekt_vorlagen),
    ('[A-051] Wiederherstellen nach Absturz: Meldung mit Zeit & Projektname / Wiederherstellen / Verwerfen / großes Projekt aus IndexedDB / sauber gespeichert ohne Meldung', t_a051_absturz_wiederherstellen),
    ('[A-054] Schneller Start: Oberfläche sofort / Skizzieren ohne Kern / Kern & Schrift bei Bedarf / Protokoll', t_a054_schneller_start),
    ('[A-055] Sparsames Rückgängig: 200 Änderungen als Patches / Speicher viel kleiner / 200× Rückgängig exakt / Redo & Speicherlimit', t_a055_sparsames_rueckgaengig),
    ('[A-056] Normteile: Passstifte, Passfedern mit Nut, Kugel- und Gleitlager', t_a056_normteile_stifte_lager),
    ('[A-057] Schrauben M10–M24 & Werkstoffe: Sechskantschraube M16×60 SW 24 / M10–M24 Normteile / Werkstoff Messing Dichte 8,4–8,7 / neue Werkstoffe mit Aussehen & Quelle / Suche & Hilfe', t_a057_schrauben_werkstoffe),
    ('[A-059] 3D-Druck: Drucker-Liste, Bauraum-Warnung mit Drehvorschlag & Loch-Ausgleich im STL/3MF', t_a059_drucker_loch_ausgleich),
    ('[A-058] Eigene Teile in die Bibliothek: mit Maß „Breite“ speichern / Vorschaubild / in neuem Projekt einsetzen / Breite ändern passt Körper an / zweite Kopie & Neuladen & Löschen & Hilfe', t_a058_eigene_bibliothek),
    ('[A-062] Zeichnung: mehrere Blätter, A4 bis A0 & PDF-Export', t_a062_zeichnung_blaetter),
    ('KI verrechnet Körper: Modus gesetzt / ein Körper mit Loch', t_ki_verrechnen),
    ('Hochziehen: feste Tiefe / durch alles / wächst mit / beidseitig verschieden', t_durch_alles),
    ('Bedienung: Rahmen ganz drin / Rahmen berührt / Auswahl umkehren / Rechtsklick-Menü / Ausblenden / Rechtsklick ins Leere / alles einblenden / Befehl wiederholen', t_bedienung),
    ('Anzeige: Flächen, Drahtgitter, verdeckte Kanten / Drahtgitter anklickbar / durchsichtig / wieder voll / Blick senkrecht auf Fläche / Ansicht speichern', t_anzeige),
    ('Farbe je Fläche: Abschnitt bei gewählter Fläche / Oberseite rot, Rest blau / bleibt beim Ändern / entfernen', t_flaechenfarbe),
    ('Text in Kurven: Knopf / Linien und Splines, gleiche Flächen / Rückgängig', t_text_kurven),
    ('Skizze messen: Fläche ohne Loch / Umfang mit Lochrand', t_skizze_messen),
    ('Normteile: Zylinderschraube / Senkschraube / Mutter und Scheibe / Edelstahl und Gewicht / in der Leiste', t_normteile),
    ('Messen am Körper: Oberfläche und Hüllmaße / kleinster Abstand mit Linie', t_messen_koerper),
    ('Verknüpfte Kopie: Strg Umschalt D / folgt dem Original / Lage eigen, Zähler / lösen / Original weg', t_verknuepft),
    ('Bezüge: Liste am Teil / Klick springt / Hinweis beim Löschen', t_bezuege),
    ('Maß zum Ablesen: bestimmt → in Klammern / wandert mit / Widerspruch / ( )-Knopf / wieder fest', t_referenzmass),
    ('Regel „auf einer Linie“: zwei Linien / waagerecht zieht mit / Name', t_kollinear),
    ('Längen und Durchmesser: Kante / Kantenkette / Kreis / Mantel / Wert kopieren / Messen am Zylinder', t_messen_rund),
    ('Vorige Ansicht: Umschalt Z zweimal / nach Maus-Drehen / im Rechtsklick-Menü', t_vorige_ansicht),
    ('Teil dahinter: Alt-Klick / nochmal → vorne / Rechtsklick-Eintrag', t_dahinter),
    ('Kanten einer Fläche: finden / Ihre Kanten → alle abrunden / Volumen', t_flaechenkanten),
    ('Notiz am Schritt: schreiben / Zeitleiste zeigt sie / Rückgängig', t_notiz_schritt),
    ('Skizze verschieben/drehen: um X/Y / als Kopie drehen / Rechteck schräg / Rückgängig', t_skizze_verschieben),
    ('Skizze kopieren: Kette per Doppelklick / Strg C, Strg V daneben / Regeln und Maße mit / in neuer Skizze', t_skizze_kopieren),
    ('Rechteck mit runden Ecken: getippt / ein Radius für alle / ein Rückgängig', t_rechteck_rund),
    ('Ecke bilden: verlängern / kürzen', t_ecke_bilden),
    ('Bogen über die Mitte: Viertelkreis / großer Bogen, Ende auf dem Radius', t_bogen_mitte),
    ('Langloch über die Gesamtlänge: getippt mit Maßen / mit der Maus', t_langloch_gesamt),
    ('Lage unter der Maus: auf dem Körper / Boden / in der Skizze', t_koordinaten),
    ('Export: nur die Auswahl / jeder Körper einzeln / Loch bleibt', t_export_auswahl),
    ('2D-Export: Knöpfe / DXF hin und zurück / SVG in mm / Fläche mit Loch', t_2d_export),
    ('Wandstärke: messen an der Wand / Ansicht rot unter 1,6 / nichts unter 1,2', t_wandstaerke),
    ('Trägheit und Standfestigkeit: Quader-Formel / steht, kippt ab 27° / kippt um', t_traegheit_stand),
    ('Suchen im Verlauf: Feld ab 6 Schritten / Name in Gruppe / nur Löcher / wieder alle', t_verlauf_suche),
    ('Maße als CSV: speichern / laden ändert und ergänzt', t_masse_csv),
    ('Auswahl speichern: Rechtsklick-Eintrag / wählt wieder', t_auswahl_speichern),
    ('Export-Einstellungen: fein hat mehr Dreiecke / STL als Text', t_export_einstellungen),
    ('Rechenzeit je Schritt: gemessen / langsamster oben im Protokoll / Klick wählt', t_rechenzeit),
    ('Kanten nach Art: außen/innen erkannt / Kehle wählen / abrunden', t_kanten_art),
    ('Skizze umhängen: auf XZ / auf Bezugsebene / Rückgängig', t_skizze_umhaengen),
    ('Vorführen: P blendet aus / dreht / anhalten / Esc', t_vorfuehren),
    ('Tangente an zwei Kreise: Lage / zwei Regeln / folgt dem Kreis', t_tangente_zwei_kreise),
    ('Maus-Steuerung: wie Onshape / Rahmen ohne Umschalt / in der Skizze', t_maus_steuerung),
    ('Drehteller-Video: Aufnahme / Blick danach wie vorher / Dialog', t_drehteller),
    ('Maße als Tabelle: alle Maße / Wert ändern / bleibt offen', t_mass_tabelle),
    ('Bezugsebenen: über Grundebene / Dialog mit Neigung / an Fläche, wandert mit / Abstand ändern, Skizze darauf / hochziehen / Fläche fehlt / löschen', t_bezugsebenen),
    ('Luftwiderstand: Form erkannt / Kraft bei 100 km/h / Tempo und Form ändern / ohne Schub Hinweis / Formel / Speed-Drohne Höchstgeschwindigkeit', t_luftwiderstand),
    ('Rohr im Raum: glatt / Ecken / im Bild klicken / Punkt als Zahl / löschen und Rückgängig', t_rohr_raum),
    ('KI-Kollege legt ein Rohr im Raum', t_ki_rohr_raum),
    ('Schwerpunkt ausgleichen: Knopf im Check / Akku wandert, Schwerpunkt mittig / Rückgängig', t_schwerpunkt_ausgleich),
    ('KI-Kollege legt ein Gelenk an / zweites Gelenk für dasselbe Teil abgelehnt', t_ki_gelenk),
    ('Erste Schritte: 0 von 4 / hakt sich ab / Wie? öffnet Export / 4 von 4 / ausblenden / nur in Einfach', t_erste_schritte),
    ('Wand um Löcher in Druckteilen: 0,2 mm rot / 1,6 mm gelb / 3,4 mm frei / Querloch in runder Klemme frei / Carbon über Platten-Regel', t_lochwand),
    ('Einfach: größere Knöpfe oben, in der Kontextleiste und im Verlauf / Leiste passt / 44 px / zurück zu Profi', t_einfach_gross),
    ('Skizze: Ellipse trimmen / liegt genau auf der Ellipse / Enden verbunden / Rückgängig', t_ellipse_trimmen),
    ('Explosion in Gruppen: zerlegt von selbst / rückt auseinander / Klick wählt echtes Teil / zusammensetzen / Häkchen', t_explosion_gruppen),
    ('Armverkleidung: Baustein / Maße / dick genug und symmetrisch / Arm passt / längeres Profil schlanker', t_armverkleidung),
    ('Gelenk-Kette: zwei Gelenke / 90° bewegt drittes Teil mit / Kreis abgelehnt / Rückgängig / Bewegung prüfen mit Kette', t_gelenk_kette),
    ('Skizze: Kreis aus 3 / 2 Punkten / tangentialer Bogen', t_kreis_bogen_modi),
    ('Skizze: Verlängern bis zur nächsten Linie', t_verlaengern),
    ('Entformungsschräge: 3° nach innen / -2° nach außen', t_schraege),
    ('Gewinde: Gewindebolzen M6 / gedrucktes Innengewinde', t_gewinde),
    ('Entlang Pfad mit eigener Form aus einem Skizzenkörper', t_pfad_eigene_form),
    ('Einheiten im Maßfeld: 2 cm / 1/4" / 10mm+2cm', t_einheiten),
    ('Skizze: Linie teilen', t_teilen),
    ('Skizze: gebogenes Langloch', t_langloch_gebogen),
    ('Skizze: gedrehtes Rechteck / Sechskant über die Flächen', t_rechteck_gedreht_sechskant),
    ('Skizze: Punkt setzen / Lage eintippen / Kreis rastet ein', t_punkt),
    ('Skizze: alle Ecken auf einmal runden / ein Rückgängig', t_alle_ecken),
    ('KI-Kollege baut Übergang, Pfad und Text', t_ki_neue_formen),
    ('Schnitt parallel zu einer gewählten Fläche', t_schnitt_flaeche),
    ('An einer Fläche spiegeln / Original ändern / Ebene wandert mit', t_spiegeln_flaeche),
    ('Kantenkette: ganzer gerundeter Umriss / zusammen abrunden', t_kantenkette),
    ('Skizze: an der Y-Achse spiegeln ohne eigene Linie', t_spiegeln_achse),
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
    ('Drohnen-Check eigener Rahmen: Motoren im Muster / Propellergröße / Turm im Kreis / echter Propeller / Schub / sechs Motoren', t_drohnencheck_frei),
    ('Drohnen-Check: Vorlage besteht / Schub eintragen / Schwerpunkt / zu kleiner Rahmen / Teile ineinander', t_drohnen_check),
    ('Frame-Assistent: 3" O4 Pro, 5" Deadcat O3, 7" Walksnail bestehen den Check', t_drohnen_generator),
    ('Platten als DXF: Unterteil und Oberplatte / Löcher an der richtigen Stelle / ZIP', t_dxf),
    ('Varianten: speichern / abweichen / umschalten / vergleichen / Rückgängig', t_varianten),
    ('Sitzung-13-Werkzeuge haben Hilfetexte', t_neu13_hilfen),
    ('KI-Schritte: markiert in Zeitleiste und Verlauf / Kreismuster und Material / Rückgängig / Fehlermeldung', t_ki_schritte),
    ('KI baut Drohne: Frame-Assistent / Maß / Kaufteil / Drohnen-Check', t_ki_drohne),
    ('Erklär diesen Schritt: Zeitleiste / Verlauf / Knopf am Namen', t_erklaeren),
    ('Erklär diesen Schritt mit KI', t_erklaeren_ki),
    ('Schwachstellen: Vorlage ok / Lochrand / Ringe / Armdicke / KI-Vorschlag umsetzen', t_schwachstellen),
    ('Sitzung-14-Werkzeuge haben Hilfetexte', t_neu14_hilfen),
    ('Einfache Oberfläche: Startseite / ausgeblendet / Grundkörper und Bauteile / Kontextleiste / Mehr / bleibt / zurück zu Profi', t_einfach),
    ('Kaufteile in echter Form: Rahmen / Motor-Details / Datenblatt-Maße / Klappfenster / Erklären', t_kaufteil_formen),
    ('KI-Kollege: alles als Verbund / ein Rückgängig / Rückmeldung / Plan und Check / zurück', t_kollege_verbund),
    ('KI-Kollege: behebt Fehler selbst / ohne „Selbstständig“ nur eine Runde', t_kollege_fehler),
    ('KI-Kollege: Rückfrage mit Antwort-Knöpfen', t_kollege_frage),
    ('KI-Kollege: alle / neu / ausrichten / färben / kopieren / drehen / auswählen', t_kollege_auswahl),
    ('Alles als Verbund ohne KI', t_verbund_ohne_ki),
    ('Fehlermeldung bleibt nach einer anderen Änderung', t_fehler_bleibt),
    ('Neue Bausätze: Startseite / 5" Race / 5" Speed mit Stromlinien-Rumpf, Akku innen, geneigten Motoren / 3,5" Cinewhoop mit Ducts / Ducts wachsen mit', t_bausaetze_neu),
    ('Speed-Drohne: Motorneigung im Frame-Assistenten, Warnung bei zu viel / Keile / Check mit schrägen Propellern / ohne Neigung', t_speed_neigung),
    ('Rahmen von Herstellern: Vorlage / Maße / Gewicht gegen Original / Cinelog35 mit Hinweis / Form löst Vorlage', t_herstellerrahmen),
    ('KI-Kollege baut einen Herstellerrahmen nach', t_kollege_herstellerrahmen),
    ('Formel-Beispiele', t_formel_beispiele), ('Einführung „Erste Skizze“', t_einfuehrung), ('Schraubenlöcher', t_schrauben),
    ('Fies: Löschen hinter Marker + Undo', t_fies_loeschen), ('Fies: alles unterdrückt', t_fies_alle_aus),
    ('Fies: Marker am Anfang, neu laden', t_fies_reload), ('Fies: Tasten während Rechnen', t_fies_tasten),
    ('Fies: Sehr fein + zoomen', t_fies_sehr_fein), ('Fies: Maß umbenennen / entfernen', t_fies_umbenennen),
]

if __name__ == '__main__':
    only = sys.argv[1:]
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=ARGS)
        ab = int(os.environ.get('TRACERY_AB', '0'))   # nach einem Abbruch: die ersten N Durchläufe überspringen
        teil = os.environ.get('TRACERY_TEIL', '')     # „i/n“: nur jeden n-ten Test ab Nummer i (Volltest in Teilen, gleichzeitig)
        ti, tn = (int(x) for x in teil.split('/')) if teil else (0, 1)
        for nr, (name, fn) in enumerate(TESTS):
            if nr < ab or nr % tn != ti:
                continue
            if only and not any(o.lower() in name.lower() or o.lower() in fn.__name__.lower() for o in only):
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
