// ================= „Erklär diesen Schritt“ und Schwachstellen-Analyse =================
// Beides funktioniert ohne KI: Tracery erklärt jeden Schritt aus seinen Daten (Art, Größe, Maße, Löcher …)
// und sucht Schwachstellen mit festen Faustregeln (Lochrand, dünne Wände, Armdicke, Drohnen-Check).
// Ist Tracery in Claude geöffnet, kann die KI die Erklärung vertiefen und Verbesserungen vorschlagen,
// die sich mit einem Klick als markierte Schritte umsetzen lassen.

// Kurztexte je Schritt-Art: was, wozu (bei Drohnen), achtung (Entwurf Gemini, Prompt H; gegen Tracery geprüft)
const STEP_TEXT = /*JSON:schritt-erklaerungen.json*/null;

const Explain = (() => {
  function keyOf(it) {
    if (Features.isOp(it)) { const p = it.p; return p.op === 'pattern' ? ({ rect: 'pattern_rect', circ: 'pattern_circ', path: 'pattern_path', points: 'pattern_points', table: 'pattern_table', mirror: 'mirror' }[p.pt] || 'group') : p.op; }
    if (Mass.fixedOf(it) || String((it.p || {}).lib || '').startsWith('buy')) return 'buy';
    if (it.kind === 'part') return (it.p || {}).lib;
    if (it.kind === 'group') return 'group';
    if (it.role === 'hole') return 'hole';
    return it.kind;
  }
  // Maß-Namen, die in einem Schritt (mit allen Kindern) vorkommen
  function paramsUsed(it, doc = App.doc) {
    const names = new Set((doc.params || []).map((p) => p.name)), out = new Set();
    const scan = (o) => { for (const k in o || {}) { const v = o[k]; if (typeof v === 'string') for (const n of Expr.names(v)) if (names.has(n)) out.add(n); } };
    Model.walk([it], (x) => { scan(x.p); scan(x.t); for (const f of x.finishes || []) scan(f); if (typeof x.massG === 'string') scan({ m: x.massG }); });
    return [...out];
  }
  // Körper und Löcher zählen – Muster zählen mit ihrer Anzahl (4 Motorschrauben im Kreismuster = 4 Löcher)
  function counts(it, V) {
    let solids = 0, holes = 0;
    const mult = (g) => { const p = Model.resolveP(g.p || {}, V); if (p.op !== 'pattern') return 1; if (p.pt === 'mirror') return 2; return Math.max(1, Model.patternMatrices(g, V).length); };
    const rec = (list, k, hole) => { for (const c of list || []) { if (c.suppressed) continue; const isH = hole || c.role === 'hole'; if (c.kind === 'group') rec(c.children, k * mult(c), isH); else if (isH) holes += k; else solids += k; } };
    rec(it.children, 1, false);
    return { solids, holes };
  }
  // Erklärung aus den Daten des Schritts – geht immer, auch ohne KI
  function local(id, doc = App.doc) {
    const f = Model.find(doc, id); if (!f) return null;
    const it = f.item, V = Model.vars(doc).v, key = keyOf(it), txt = STEP_TEXT[key] || STEP_TEXT[it.kind] || { was: 'Ein Schritt in deinem Modell.' };
    const lines = [];
    const top = doc.items.indexOf(it);
    const where = top >= 0 ? `Schritt ${top + 1} von ${doc.items.length}` : `Teil von „${Model.label(f.parent)}“`;
    lines.push({ k: 'was', t: txt.was });
    const bb = top >= 0 && doc === App.doc ? Viewer.baseBox(id) : null;
    const size = bb && !bb.isEmpty() ? `${Units.fmtLen(bb.max.x - bb.min.x, 1, doc)} × ${Units.fmtLen(bb.max.y - bb.min.y, 1, doc)} × ${Units.fmtLen(bb.max.z - bb.min.z, 1, doc)} ${Units.label(doc)}` : it.kind !== 'group' ? Model.sizeText(it, V) : '';
    if (size) lines.push({ k: 'groesse', t: `Größe: ${size}.` });
    if (it.kind === 'group') {
      const c = counts(it, V);
      if (Features.isOp(it)) lines.push({ k: 'op', t: `${Features.NAMES[it.p.pt] || Features.NAMES[it.p.op] || 'Rechenschritt'}: ${Features.sizeText(it, V) || ''}`.trim() + '.' });
      else if (c.holes && c.solids) lines.push({ k: 'kinder', t: `Aus ${c.solids} ${c.solids === 1 ? 'Körper' : 'Körpern'} ${c.holes === 1 ? 'wird 1 Loch' : `werden ${c.holes} Löcher`} geschnitten.` });
      else if (c.solids) lines.push({ k: 'kinder', t: `Besteht aus ${c.solids} ${c.solids === 1 ? 'Körper' : 'Körpern'}.` });
    }
    if (it.kind === 'transform') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `${p.copy ? 'Erzeugt eine versetzte Kopie von' : 'Versetzt'} „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“${size ? ' (' + size + ')' : ''}.` });
    }
    if (it.kind === 'scale') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Skaliert „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“${size ? ' (' + size + ')' : ''}.` });
    }
    if (it.kind === 'deform') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const what = p.mode === 'twist' ? 'Verdreht' : p.mode === 'taper' ? 'Verjüngt' : 'Biegt';
      lines.push({ k: 'op', t: `${what} „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ entlang ${(p.axis || 'z').toUpperCase()}${size ? ' (' + size + ')' : ''}.` });
    }
    if (it.kind === 'deleteBody') {
      const p = it.p || {};
      const tgs = Array.isArray(p.targets) ? p.targets : (p.target ? [p.target] : []);
      const names = tgs.map((tid) => Model.find(doc, tid)).filter(Boolean).map((x) => `„${Model.label(x.item)}“`);
      lines.push({ k: 'op', t: `Löscht ${names.length ? names.join(', ') : 'den gewählten Körper'} ab diesem Schritt im Verlauf (abschaltbar).` });
    }
    if (it.kind === 'thicken') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `${p.mode === 'new' ? 'Erzeugt eine Platte von einer Fläche von' : p.mode === 'cut' ? 'Trägt eine aufgedickte Fläche ab von' : 'Dickt eine Fläche auf von'} „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“${size ? ' (' + size + ')' : ''}.` });
    }
    if (it.kind === 'directFace') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const modeTxt = p.mode === 'rotate' ? 'Dreht eine Fläche von' : p.mode === 'offset' ? 'Versetzt eine Fläche von' : 'Verschiebt eine Fläche von';
      lines.push({ k: 'op', t: `${modeTxt} „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“${size ? ' (' + size + ')' : ''}.` });
    }
    if (it.kind === 'rib') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const sideTxt = p.side === 'side1' || p.side === 'side2' ? 'einseitig' : 'mittig';
      const dirTxt = p.dir === 'parallel' ? 'in der Skizzenebene' : 'senkrecht zur Skizze';
      lines.push({ k: 'op', t: `Verstärkt „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ als Rippe (${Units.fmtLenU(Model.num(p.thickness, V, 2), 2, doc)} dick, ${sideTxt}, ${dirTxt}${Math.abs(Model.num(p.draft, V, 0)) > 1e-6 ? `, ${fmtAngleU(Model.num(p.draft, V, 0))} Schräge` : ''}).` });
    }
    if (it.kind === 'vent') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const cnt = Math.max(1, Math.round(Model.num(p.count, V, 6)));
      const dep = Model.num(p.depth, V, 0);
      lines.push({ k: 'op', t: `Schneidet ${cnt} Lüftungsschlitze (${Units.fmtLenU(Model.num(p.slotW, V, 3), 2, doc)} breit, Rahmen ${Units.fmtLenU(Model.num(p.frame, V, 4), 2, doc)}, ${fmtAngleU(Model.num(p.angle, V, 0))}, ${dep > 1e-4 ? Units.fmtLenU(dep, 2, doc) + ' tief' : 'durch die Wand'}) in „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'fins') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const cnt = Math.max(1, Math.round(Model.num(p.count, V, 6)));
      lines.push({ k: 'op', t: `Setzt ${cnt} Kühlrippen (${Units.fmtLenU(Model.num(p.finW, V, 1.5), 2, doc)} dick, ${Units.fmtLenU(Model.num(p.height, V, 10), 2, doc)} hoch, Randabstand ${Units.fmtLenU(Model.num(p.margin, V, 2), 2, doc)}) auf „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'fillPattern') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const kn = p.kind === 'hex' ? 'Waben' : p.kind === 'staggered' ? 'versetzte Löcher' : 'Raster-Löcher';
      const dep = Model.num(p.depth, V, 0);
      lines.push({ k: 'op', t: `Füllt eine Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ mit ${kn} (${Units.fmtLenU(Model.num(p.size, V, 5), 2, doc)}, Abstand ${Units.fmtLenU(Model.num(p.pitch, V, 8), 2, doc)}, Randabstand ${Units.fmtLenU(Model.num(p.margin, V, 4), 2, doc)}, ${dep > 1e-4 ? Units.fmtLenU(dep, 2, doc) + ' tief' : 'durch die Wand'}).` });
    }
    if (it.kind === 'mountPattern') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const mp = Model.mountPatternParams(it, V);
      const e = typeof mountPatternEntry === 'function' ? mountPatternEntry(mp.preset) : null;
      const dep = mp.depth > 1e-4 ? Units.fmtLenU(mp.depth, 2, doc) + ' tief' : 'durch die Wand';
      const ctr = mp.includeCenter && mp.centerKind !== 'none' ? (mp.centerKind === 'circle' ? `, Mittelloch ${Units.fmtLenU(mp.centerD, 2, doc)}` : `, Ausschnitt ${Units.fmtLenU(mp.cutW, 2, doc)} × ${Units.fmtLenU(mp.cutH, 2, doc)}`) : '';
      lines.push({ k: 'op', t: `Schneidet das Lochbild „${e ? e.label : mp.preset}“ (${mp.holes.length}× Ø ${Units.fmtLenU(mp.holeD, 2, doc)}${ctr}, ${dep}) in eine ebene Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'portCutout') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const pc = Model.portCutoutParams(it, V);
      const e = typeof portCutoutEntry === 'function' ? portCutoutEntry(pc.preset) : null;
      const dep = pc.depth > 1e-4 ? Units.fmtLenU(pc.depth, 2, doc) + ' tief' : 'durch die Wand';
      const dim = pc.shape === 'circle' ? `Ø ${Units.fmtLenU(pc.d, 2, doc)}` : `${Units.fmtLenU(pc.w, 2, doc)} × ${Units.fmtLenU(pc.h, 2, doc)}`;
      const hTxt = pc.includeHoles && pc.holes.length ? `, ${pc.holes.length}× Ø ${Units.fmtLenU(pc.holeD, 2, doc)}` : '';
      lines.push({ k: 'op', t: `Schneidet den Ausschnitt „${e ? e.label : pc.preset}“ (${dim}${hTxt}, ${dep}) in eine ebene Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'magnetPocket') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const mp = Model.magnetPocketParams(it, V);
      const e = typeof magnetPresetEntry === 'function' ? magnetPresetEntry(mp.preset) : null;
      const dim = mp.shape === 'round' ? `Ø ${Units.fmtLenU(mp.d, 2, doc)}` : `${Units.fmtLenU(mp.w, 2, doc)} × ${Units.fmtLenU(mp.l, 2, doc)}`;
      const emb = mp.embed > 1e-4 ? `, eingebettet unter ${Units.fmtLenU(mp.embed, 2, doc)}` : '';
      lines.push({ k: 'op', t: `Schneidet die Magnet-Tasche „${e ? e.label : mp.preset}“ (${dim}, ${Units.fmtLenU(mp.depth, 2, doc)} tief${emb}) in eine ebene Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'web') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const dep = Model.num(p.depth, V, 0);
      lines.push({ k: 'op', t: `Verstärkt „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ mit einem Steg-Netz aus der Skizze (${Units.fmtLenU(Model.num(p.thickness, V, 2), 2, doc)} dick, ${dep > 1e-4 ? Units.fmtLenU(dep, 2, doc) + ' tief' : 'bis zur Wand'}).` });
    }
    if (it.kind === 'wrap') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const info = Model.wrapAngleInfo ? Model.wrapAngleInfo(it, V, doc) : null;
      const modeTxt = p.mode === 'deboss' ? `vertieft um ${Units.fmtLenU(Model.num(p.depth, V, 2), 2, doc)}` : p.mode === 'line' ? 'als Linie auf der Oberfläche' : `erhaben um ${Units.fmtLenU(Model.num(p.depth, V, 2), 2, doc)}`;
      lines.push({ k: 'op', t: `Wickelt eine Skizze ${modeTxt} um „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“${info ? ` (${fmtAngleU(info.deg)} des Umfangs)` : ''}.` });
    }
    if (it.kind === 'emboss') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Prägt die Skizze ${p.mode === 'deboss' ? 'vertieft' : 'erhaben'} (${Units.fmtLenU(Model.num(p.height, V, 1), 2, doc)}) auf eine Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'splitFace') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const sideTxt = p.side === 'both' ? 'auf beiden Seiten' : p.side === 'back' ? 'auf der Rückseite' : 'auf der Vorderseite';
      lines.push({ k: 'op', t: `Projiziert die Skizze ${sideTxt} auf eine Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ und teilt die Fläche an der Kurve.` });
    }
    if (it.kind === 'dome') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const hTxt = Units.fmtLenU(Model.num(p.height, V, 5), 2, doc);
      lines.push({ k: 'op', t: `Setzt eine ${p.flip ? 'nach innen vertiefte ' : ''}${p.shape === 'spherical' ? 'flache Kugelkappe' : 'gewölbte Kuppel'} (${hTxt} hoch) auf eine ebene Fläche von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'deleteFace') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const n = Array.isArray(p.faces) ? p.faces.length : 0;
      lines.push({ k: 'op', t: `Löscht ${n === 1 ? '1 gewählte Fläche' : `${n} gewählte Flächen`} an „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ und schließt die Lücke durch Verlängern der Nachbarflächen.` });
    }
    if (it.kind === 'replaceFace') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const rep = p.replace || {};
      const tgtTxt = rep.datumId ? `Bezugsebene „${(typeof Datums !== 'undefined' && Datums.find(rep.datumId, doc)?.name) || rep.label || 'Ebene'}“` : rep.label ? `„${rep.label}“` : 'der gewählten Zielfläche';
      lines.push({ k: 'op', t: `Ersetzt eine Fläche an „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ durch ${tgtTxt} und verlängert die Nachbarflächen passend.` });
    }
    if (it.kind === 'moveEdge') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Verschiebt eine Kante an „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ und kippt die beiden Nachbarflächen entsprechend mit.` });
    }
    if (it.kind === 'simplify') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const szTxt = Units.fmtLenU(Model.num(p.maxSize, V, 3), 2, doc);
      const cats = [];
      if (p.fillets !== false) cats.push('Rundungen');
      if (p.chamfers !== false) cats.push('Fasen');
      if (p.holes !== false) cats.push('Löcher');
      lines.push({ k: 'op', t: `Vereinfacht „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“ und entfernt ${cats.length ? cats.join(', ') : 'kleine Details'} bis ${szTxt} automatisch.` });
    }
    if (it.kind === 'recognizedFeature') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const tName = tf ? Model.label(tf.item) : 'fehlendes Ziel';
      if (p.featType === 'hole') {
        const dTxt = Units.fmtLenU(Model.num(p.d, V, p.origD ?? 6), 2, doc);
        const dpTxt = p.through ? 'Durchgangsbohrung' : `Sackloch mit Tiefe ${Units.fmtLenU(Model.num(p.depth, V, p.origDepth ?? 5), 2, doc)}`;
        lines.push({ k: 'op', t: `Erkannte Bohrung (Ø ${dTxt}, ${dpTxt}) im Importteil „${tName}“.` });
      } else if (p.featType === 'fillet') {
        const rTxt = Units.fmtLenU(Model.num(p.r, V, p.origR ?? 1), 2, doc);
        lines.push({ k: 'op', t: `Erkannte Kantenrundung (Radius ${rTxt}) im Importteil „${tName}“.` });
      } else if (p.featType === 'pocket') {
        const dpTxt = p.through ? 'Durchbruch' : `Tiefe ${Units.fmtLenU(Model.num(p.depth, V, p.origDepth ?? 4), 2, doc)}`;
        lines.push({ k: 'op', t: `Erkannte Tasche (${Units.fmtLenU(p.length ?? 0, 2, doc)} × ${Units.fmtLenU(p.width ?? 0, 2, doc)}, ${dpTxt}) im Importteil „${tName}“.` });
      }
    }
    if (it.kind === 'boss') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const ribs = Math.max(0, Math.min(6, Math.round(Model.num(p.ribs, V, 4))));
      lines.push({ k: 'op', t: `Setzt einen Schraubdom (Ø ${Units.fmtLenU(Model.num(p.outerD, V, 8), 2, doc)}, Loch Ø ${Units.fmtLenU(Model.num(p.holeD, V, 3), 2, doc)}, Höhe ${Units.fmtLenU(Model.num(p.height, V, 10), 2, doc)}, ${ribs} Rippen) auf „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'lipGroove') {
      const p = it.p || {}, lf = p.lipTarget ? Model.find(doc, p.lipTarget) : null, gf = p.grooveTarget ? Model.find(doc, p.grooveTarget) : null;
      lines.push({ k: 'op', t: `Erzeugt Lippe (${p.side === 'outer' ? 'außen' : 'innen'}, Höhe ${Units.fmtLenU(Model.num(p.height, V, 2), 2, doc)}, Breite ${Units.fmtLenU(Model.num(p.width, V, 1.2), 2, doc)}) an „${lf ? Model.label(lf.item) : 'fehlendes Ziel'}“ und Nut mit ${Units.fmtLenU(Model.num(p.clearance, V, 0.2), 2, doc)} Spiel in „${gf ? Model.label(gf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'undercut') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Schneidet einen Gewinde-Freistich nach DIN 76-${p.form === 'B' ? 'B' : 'A'} (Ø ${Units.fmtLenU(Model.num(p.grooveD, V, 7.3), 2, doc)}, Breite ${Units.fmtLenU(Model.num(p.width, V, 5.2), 2, doc)}, Steigung ${fmt(Model.num(p.pitch, V, 1.5), 2)} mm) an „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'circlipGroove') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Schneidet einen Sicherungsring-Einstich nach ${p.norm === 'din472' ? 'DIN 472 (Bohrung)' : 'DIN 471 (Welle)'} (Nut-Ø ${Units.fmtLenU(Model.num(p.grooveD, V, 19), 2, doc)}, Breite ${Units.fmtLenU(Model.num(p.width, V, 1.3), 2, doc)}) an „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'keyway') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Fräst eine Passfeder-Nut nach DIN 6885 (${Units.fmtLenU(Model.num(p.width, V, 6), 2, doc)} breit, ${Units.fmtLenU(Model.num(p.depth, V, 3.5), 2, doc)} tief, ${Units.fmtLenU(Model.num(p.length, V, 20), 2, doc)} lang) in „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'splineProfile') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      lines.push({ k: 'op', t: `Schneidet ein Keilwellen-Profil nach DIN ISO 14 (${Math.round(Model.num(p.teeth, V, 6))} Keile, Grund-Ø ${Units.fmtLenU(Model.num(p.rootD, V, 16), 2, doc)}, Keilbreite ${Units.fmtLenU(Model.num(p.b, V, 4), 2, doc)}) in „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'knurl') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const st = p.style === 'straight' ? 'gerades' : p.style === 'angled' ? 'schräges' : 'gekreuztes';
      lines.push({ k: 'op', t: `Schneidet ein ${st} Rändel (Teilung ${Units.fmtLenU(Model.num(p.pitch, V, 1), 2, doc)}, Tiefe ${Units.fmtLenU(Model.num(p.depth, V, 0.38), 2, doc)}) auf den Zylindermantel von „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'gripPattern') {
      const p = it.p || {}, tf = p.target ? Model.find(doc, p.target) : null;
      const isBumps = p.kind === 'bumps';
      const detail = isBumps
        ? `Noppen (Ø ${Units.fmtLenU(Model.num(p.size, V, 2), 2, doc)}, Abstand ${Units.fmtLenU(Model.num(p.pitch, V, 3.5), 2, doc)})`
        : `Rillen (Breite ${Units.fmtLenU(Model.num(p.width, V, 1.2), 2, doc)}, Teilung ${Units.fmtLenU(Model.num(p.pitch, V, 2.5), 2, doc)})`;
      lines.push({ k: 'op', t: `Erzeugt ein ${p.mode === 'join' ? 'erhabenes' : 'vertieftes'} Griffmuster mit ${detail} auf „${tf ? Model.label(tf.item) : 'fehlendes Ziel'}“.` });
    }
    if (it.kind === 'stackHole') {
      const p = it.p || {};
      const ht = p.holeType === 'through' ? `${p.size || 'M4'} Durchgang` : p.holeType === 'blind' ? `Sackloch Ø ${Units.fmtLenU(Model.num(p.d, V, 6), 2, doc)}` : p.holeType === 'fit' ? `Passung Ø ${Units.fmtLenU(Model.num(p.d, V, 6), 2, doc)} H7` : `Ø ${Units.fmtLenU(Model.num(p.d, V, 6), 2, doc)}`;
      const res = typeof App !== 'undefined' && App.resolvedOf ? App.resolvedOf(it.id) : null;
      const cnt = res && Array.isArray(res.cutIds) ? res.cutIds.length : 0;
      lines.push({ k: 'op', t: `Bohrt als Baugruppen-Schritt (${ht}, ${p.thru !== false && p.holeType !== 'blind' ? 'durch alle getroffenen Teile' : `Tiefe ${Units.fmtLenU(Model.num(p.depth, V, 20), 2, doc)}`}) gleichzeitig durch ${cnt} ${cnt === 1 ? 'Teil' : 'Teile'}, ohne die Einzelteile zu verschmelzen.` });
    }
    if (it.kind === 'asmCut') {
      const p = it.p || {};
      const res = typeof App !== 'undefined' && App.resolvedOf ? App.resolvedOf(it.id) : null;
      const cnt = res && Array.isArray(res.cutIds) ? res.cutIds.length : 0;
      lines.push({ k: 'op', t: `Schneidet einen gemeinsamen Skizzen-Umriss (${p.thru !== false ? 'durch alle Zielteile' : `Tiefe ${Units.fmtLenU(Model.num(p.dist, V, 20), 2, doc)}`}) gleichzeitig aus ${cnt} ${cnt === 1 ? 'Teil' : 'Teilen'} der Baugruppe.` });
    }
    if (it.kind === 'sketch3d') {
      const res = Model.sketch3dResolve(it.p && it.p.sketch3d, V);
      const ents = (res.ents || []).filter((e) => !e.con);
      lines.push({ k: 'op', t: `3D-Skizze im Raum mit ${ents.length} Elementen (Gesamtlänge ${Units.fmtLenU(res.totalLength, 2, doc)}), nutzbar als Pfad für „Entlang Pfad“.` });
    }
    if (it.kind === 'loft') {
      const p = it.p || {}, n = (p.sketches || []).length;
      const condName = (c) => (c === 'curvature' ? 'krümmungsglatt (G2)' : c === 'tangent' ? 'tangential (G1)' : '');
      const cParts = [];
      if (!p.closed && !p.path && !p.rail && !p.rail2) {
        if (p.startCond === 'tangent' || p.startCond === 'curvature') cParts.push(`Start ${condName(p.startCond)}, Stärke ${fmt(Model.num(p.startWeight, V, 1), 2)}`);
        if (p.endCond === 'tangent' || p.endCond === 'curvature') cParts.push(`Ende ${condName(p.endCond)}, Stärke ${fmt(Model.num(p.endWeight, V, 1), 2)}`);
      }
      const contInfo = cParts.length ? ` mit weichem Anschluss (${cParts.join('; ')})` : '';
      const style = p.closed ? 'geschlossen als Ring' : p.path ? 'entlang einer Mittellinie' : (p.rail || p.rail2) ? 'mit Führungskurve' : Model.num(p.tip, V, 0) > 0 ? `zur Spitze (${Units.fmtLenU(Model.num(p.tip, V, 0), 2, doc)})` : (p.ruled ? 'mit geraden Flächen' : 'weich');
      const tf = it.op && it.op.target ? Model.find(doc, it.op.target) : null;
      const opTxt = it.op && it.op.type === 'cut' ? ` – wird von „${tf ? Model.label(tf.item) : 'Zielkörper'}“ als Schnitt abgezogen` : it.op && it.op.type === 'join' ? ` – wird mit „${tf ? Model.label(tf.item) : 'Zielkörper'}“ vereinigt` : it.op && it.op.type === 'common' ? ` – bildet mit „${tf ? Model.label(tf.item) : 'Zielkörper'}“ die Schnittmenge` : '';
      lines.push({ k: 'op', t: `Verbindet ${n} Umrisse ${style}${contInfo}${opTxt}.` });
    }
    if (it.kind === 'sweep') {
      const p = it.p || {};
      const shpTxt = p.shape === 'rect' ? `Rechteck ${Units.fmtLenU(Model.num(p.w, V, 6), 2, doc)} × ${Units.fmtLenU(Model.num(p.h, V, 4), 2, doc)}` : p.shape === 'sketch' ? `eigener Umriss${p.profName ? ` („${p.profName}“)` : ''}` : `Kreis Ø ${Units.fmtLenU(Model.num(p.d, V, 6), 2, doc)}`;
      const tw = Model.num(p.twist, V, 0);
      const twTxt = Math.abs(tw) > 1e-6 ? ` mit ${fmtAngleU(tw)} Verdrehung über die Länge` : '';
      const wall = p.shape !== 'sketch' ? Model.num(p.wall, V, 0) : 0;
      const wTxt = wall > 0 ? `, hohl (Wand ${Units.fmtLenU(wall, 2, doc)})` : '';
      const tf = it.op && it.op.target ? Model.find(doc, it.op.target) : null;
      const opTxt = it.op && it.op.type === 'cut' ? ` – wird von „${tf ? Model.label(tf.item) : 'Zielkörper'}“ als Schnitt/Nut abgezogen` : it.op && it.op.type === 'join' ? ` – wird mit „${tf ? Model.label(tf.item) : 'Zielkörper'}“ vereinigt` : it.op && it.op.type === 'common' ? ` – bildet mit „${tf ? Model.label(tf.item) : 'Zielkörper'}“ die Schnittmenge` : '';
      lines.push({ k: 'op', t: `Zieht ${shpTxt}${wTxt} entlang des Pfads${twTxt}${opTxt}.` });
    }
    if (it.kind === 'helix') {
      const m = Model.helixMetrics(it.p || {}, V);
      const formTxt = m.form === 'cone' ? `Kegel-Feder (Radius ${Units.fmtLenU(m.r1, 2, doc)} bis ${Units.fmtLenU(m.r2, 2, doc)})` : m.form === 'spiral' ? `Flache Spirale (Radius ${Units.fmtLenU(m.r1, 2, doc)} bis ${Units.fmtLenU(m.r2, 2, doc)})` : `Zylinder-Feder (Ø ${Units.fmtLenU(m.d, 2, doc)})`;
      const profTxt = m.shape === 'rect' ? `Rechteck ${Units.fmtLenU(m.profW, 2, doc)} × ${Units.fmtLenU(m.profH, 2, doc)}` : m.shape === 'sketch' ? 'eigene Skizze' : `Draht-Ø ${Units.fmtLenU(m.wireD, 2, doc)}`;
      const spanTxt = m.form === 'spiral' ? `${fmt(m.turns, 2)} Windungen` : `${fmt(m.turns, 2)} Windungen, Steigung ${Units.fmtLenU(m.pitch, 2, doc)}, Höhe ${Units.fmtLenU(m.height, 2, doc)}`;
      lines.push({ k: 'op', t: `${formTxt} mit ${spanTxt} (${m.dir === 'left' ? 'linksgängig' : 'rechtsgängig'}), Querschnitt ${profTxt}.` });
    }
    if (it.kind === 'mirrorStep') {
      const p = it.p || {};
      const fNames = (Array.isArray(p.features) ? p.features : []).map((fid) => Model.find(doc, fid)).filter(Boolean).map((x) => `„${Model.label(x.item)}“`);
      let plTxt = ({ YZ: 'YZ-Ebene (links ↔ rechts)', XZ: 'XZ-Ebene (vorne ↔ hinten)', XY: 'XY-Ebene (oben ↔ unten)' })[p.plane || 'YZ'] || 'YZ-Ebene';
      if (p.plane === 'DATUM') {
        const dm = typeof Datums !== 'undefined' ? Datums.find(p.datumId, doc) : null;
        plTxt = dm ? `Bezugsebene „${dm.name}“` : 'fehlende Bezugsebene';
      } else if (p.plane === 'FACE') {
        plTxt = p.faceRef && p.faceRef.name ? `Fläche an „${p.faceRef.name}“` : 'gewählte Körperfläche';
      }
      lines.push({ k: 'op', t: `Spiegelt ${fNames.length ? fNames.join(', ') : 'einen fehlenden Schritt'} an ${plTxt} direkt im selben Körper.` });
    }
    if (it.role === 'hole' && top >= 0) lines.push({ k: 'loch', t: 'Als Loch auf oberster Ebene schneidet es jeden Körper, den es berührt.' });
    for (const fin of it.finishes || []) {
      let ft;
      if (fin.type === 'shell') {
        const dirTxt = fin.dir === 'out' ? ' nach außen' : fin.dir === 'mid' ? ' mittig' : ' nach innen';
        const fwCnt = Array.isArray(fin.faceWalls) ? fin.faceWalls.length : 0;
        const extraTxt = fwCnt ? ` (${fwCnt} ${fwCnt === 1 ? 'Fläche' : 'Flächen'} mit eigener Wandstärke)` : '';
        ft = `Ausgehöhlt${dirTxt} mit ${Units.fmtLenU(Model.num(fin.r, V, 2), 2, doc)} Wand${extraTxt}.`;
      }
      else if (fin.type === 'fullFillet') ft = 'Vollrundung über drei gewählte Flächen (mittlere Fläche ganz abgerundet).';
      else if (fin.type === 'faceFillet') ft = `Flächen-Rundung mit Radius ${Units.fmtLenU(Model.num(fin.r, V, 5), 2, doc)} zwischen zwei gewählten Flächen.`;
      else if (fin.type === 'partingDraft') ft = `Schräge an Trennlinie mit ${fin.sym === false ? `${fmtAngleU(Model.num(fin.r, V, 3))} / ${fmtAngleU(Model.num(fin.r2, V, 3))}` : fmtAngleU(Model.num(fin.r, V, 3))} nach oben und unten.`;
      else if (fin.type === 'draft') ft = `Entformungsschräge mit ${fmtAngleU(Model.num(fin.r, V, 3))}.`;
      else if (fin.type === 'cornerChamfer') ft = `Ecken-Fase mit den drei Abständen ${[fin.d1, fin.d2, fin.d3].map((x) => Units.fmtLenU(Model.num(x, V, 2), 2, doc)).join(' / ')}.`;
      else ft = `${fin.type === 'chamfer' ? 'Fase' : 'Rundung'} ${Units.fmtLenU(Model.num(fin.r, V, 1), 2, doc)}${fin.type === 'fillet' && fin.shape === 'g2' ? ' (krümmungsglatt, G2)' : ''}${fin.type === 'fillet' && fin.corner === 'smooth' ? ' mit weichem Eckübergang' : ''} an den Kanten.`;
      lines.push({ k: 'fin', t: ft });
    }
    const used = paramsUsed(it, doc);
    if (used.length) lines.push({ k: 'masse', t: `Hängt an ${used.length === 1 ? 'dem Maß' : 'den Maßen'} ${used.slice(0, 6).join(', ')}${used.length > 6 ? ` und ${used.length - 6} weiteren` : ''}. Änderst du ${used.length === 1 ? 'es' : 'eines'} unter „Maße“, rechnet Tracery diesen Schritt neu.` });
    if (top >= 0 && Mass.fixedOf(it)) lines.push({ k: 'gewicht', t: it.massG === '' ? 'Kaufteil: Das Gewicht fehlt noch – trag es rechts ein.' : `Kaufteil mit festem Gewicht ${fmtFixed(Model.num(it.massG, V, 0), 1)} g.` });
    else if (top >= 0 && it.role !== 'hole' && it.kind !== 'rib' && it.kind !== 'vent' && it.kind !== 'fins' && it.kind !== 'fillPattern' && it.kind !== 'mountPattern' && it.kind !== 'portCutout' && it.kind !== 'magnetPocket' && it.kind !== 'web' && it.kind !== 'wrap' && it.kind !== 'emboss' && it.kind !== 'splitFace' && it.kind !== 'dome' && it.kind !== 'deleteFace' && it.kind !== 'replaceFace' && it.kind !== 'moveEdge' && it.kind !== 'simplify' && it.kind !== 'recognizedFeature' && it.kind !== 'mirrorStep' && it.kind !== 'boss' && it.kind !== 'lipGroove' && it.kind !== 'undercut' && it.kind !== 'circlipGroove' && it.kind !== 'keyway' && it.kind !== 'splineProfile' && it.kind !== 'knurl' && it.kind !== 'gripPattern' && it.kind !== 'stackHole' && it.kind !== 'asmCut' && !(it.kind === 'transform' && !(it.p && it.p.copy)) && it.kind !== 'scale' && it.kind !== 'deform' && it.kind !== 'directFace' && it.kind !== 'deleteBody' && it.kind !== 'sketch3d' && !(it.kind === 'thicken' && !(it.p && it.p.mode === 'new'))) lines.push({ k: 'material', t: `Material: ${Mass.materialFor(it, doc).k}.` });
    if (it.suppressed) lines.push({ k: 'status', t: 'Dieser Schritt ist unterdrückt und zählt gerade nicht mit.' });
    else if (top >= 0 && doc === App.doc && top >= Timeline.markerPos()) lines.push({ k: 'status', t: 'Dieser Schritt liegt hinter dem Marker der Zeitleiste und wird gerade nicht gerechnet.' });
    if (it.ai) lines.push({ k: 'ki', t: (it.ai.edit ? 'Zuletzt von der KI geändert' : 'Von der KI gebaut') + ` – auf die Bitte „${it.ai.q}“.` });
    if (txt.wozu) lines.push({ k: 'wozu', t: txt.wozu });
    if (txt.achtung) lines.push({ k: 'achtung', t: 'Pass auf: ' + txt.achtung });
    return { id, title: Model.label(it), where, key, lines, used };
  }
  async function askAI(info) {
    const f = Model.find(App.doc, info.id); if (!f) return { error: 'Den Schritt gibt es nicht mehr.' };
    const V = Model.vars(App.doc).v;
    const masse = (App.doc.params || []).filter((p) => info.used.includes(p.name)).map((p) => `${p.name} = ${p.expr}${typeof p.expr === 'string' ? ' (= ' + fmt(V[p.name], 2) + ')' : ''}`).join('; ');
    const prompt = `Du erklärst in Tracery, einem allgemeinen CAD-Programm im Browser, einen Schritt aus dem Modell. Erkläre einfach und verständlich.
Erkläre auf Deutsch in der Du-Form in 3–5 kurzen Sätzen: was dieser Schritt baut, wofür er in diesem Projekt vermutlich da ist und welche Maße ihn steuern. Erfinde nichts, was nicht in den Daten steht. Gib danach höchstens einen kurzen Tipp, wie man ihn verbessern könnte (oder einen leeren Tipp).
Antworte NUR mit JSON: {"erklaerung":"…","tipp":"…"}

PROJEKT: ${App.doc.name}${App.doc.drone ? ` (Drohne ${App.doc.drone.zoll}" ${App.doc.drone.form || ''})` : ''}
STELLE: ${info.where}
SCHRITT (JSON): ${JSON.stringify(AI.compactItem(f.item)).slice(0, 12000)}
MASSE: ${masse || 'keine'}
WAS TRACERY SCHON WEISS: ${info.lines.map((l) => l.t).join(' ')}`;
    const r = await AI.json(prompt);
    if (r.error) return r;
    const e = String((r.res && (r.res.erklaerung || r.res.antwort)) || '').slice(0, 900), t = String((r.res && r.res.tipp) || '').slice(0, 300);
    return e ? { text: e, tip: t } : { error: 'Die KI hat nichts geantwortet.' };
  }
  function dialog(id) {
    id = id || App.sel[0];
    const info = id && local(id);
    if (!info) { UI.toast('Wähle zuerst einen Schritt – in der Zeitleiste, im Verlauf oder im Bild.', { icon: 'info' }); return; }
    const body = h('div', { class: 'explain', id: 'explain' });
    body.append(h('div', { class: 'explain-where' }, info.where));
    const ul = h('ul', { class: 'explain-list' });
    for (const l of info.lines) ul.append(h('li', { class: 'ex-' + l.k }, l.t));
    body.append(ul);
    const aiBox = h('div', { class: 'explain-ai', id: 'explain-ai' });
    if (AI.available && window.claude) {
      const b = h('button', { type: 'button', class: 'btn small', id: 'explain-ask' }); b.innerHTML = icon('spark') + 'Genauer von der KI erklären';
      b.onclick = async () => {
        b.disabled = true; aiBox.innerHTML = ''; aiBox.append(h('div', { class: 'hint-box' }, 'Die KI denkt nach …'));
        const r = await askAI(info); aiBox.innerHTML = '';
        if (r.error) { aiBox.append(h('div', { class: 'hint-box warn' }, r.error)); b.disabled = false; return; }
        const w = h('div', { class: 'ai-say' }); w.innerHTML = icon('spark'); w.append(h('div', null, h('p', null, r.text), r.tip ? h('p', { class: 'tip' }, h('b', null, 'Tipp: '), r.tip) : ''));
        aiBox.append(w); b.remove();
      };
      body.append(h('div', { class: 'btn-row' }, b));
    }
    body.append(aiBox);
    UI.modal({ title: info.title, body, actions: [{ label: 'Auswählen', run: () => { App.select([id]); } }, { label: 'Schließen', primary: true }] });
    // Gewicht nachtragen, sobald es gerechnet ist
    const f = Model.find(App.doc, id);
    if (f && App.doc.items.includes(f.item) && f.item.role !== 'hole') Mass.measure().then((r) => { const p = Mass.partOf(r, id); const li = body.querySelector('.ex-material, .ex-gewicht'); if (p && li && !p.fixed) li.textContent += ` Wiegt ca. ${Mass.gText(p.mass)}.`; });
  }

  // ---------- „Was ist das?“-Erklärung für jedes UI-Element (BE-32) ----------
  const WHATIS_ID_MAP = [
    ['#brand', 'whatis.el.brand', 'Tracery', null],
    ['#tab-model', 'whatis.el.tabModel', 'topbar.model', null],
    ['#tab-drawing', 'whatis.el.tabDrawing', 'topbar.drawing', null],
    ['#btn-undo', 'whatis.el.undo', 'topbar.undo', null],
    ['#btn-redo', 'whatis.el.redo', 'topbar.redo', null],
    ['#btn-project', 'whatis.el.project', 'topbar.project', null],
    ['#btn-menu', 'whatis.el.menu', 'topbar.menu', null],
    ['#btn-level', 'whatis.el.level', null, 'levelSwitch'],
    ['#btn-whatis', 'whatis.el.whatis', 'whatis.btnAria', 'whatIsThis'],
    ['#btn-left', 'whatis.el.btnLeft', 'topbar.tree', 'tabletPanels'],
    ['#btn-right', 'whatis.el.btnRight', 'topbar.props', 'tabletPanels'],
    ['#t-body', 'whatis.el.tBody', 'tool.body', null],
    ['#t-parts', 'whatis.el.tParts', 'tool.parts', null],
    ['#t-export', 'whatis.el.tExport', 'tool.export', null],
    ['#t-more', 'whatis.el.tMore', 'tool.more', null],
    ['#t-views', 'whatis.el.tViews', 'tool.views', null],
    ['#t-check', 'whatis.el.tCheck', 'tool.check', null],
    ['#t-notes', 'whatis.el.tNotes', 'tool.notes', null],
    ['#lt-tree', 'whatis.el.ltTree', 'topbar.tree', null],
    ['#lt-params', 'whatis.el.ltParams', 'topbar.params', 'params'],
    ['#lt-log', 'whatis.el.ltLog', 'topbar.log', null],
    ['#cmd', 'whatis.el.cmd', 'topbar.cmdAria', null],
    ['#hintline', 'whatis.el.hintline', 'Hinweiszeile', null],
    ['#ampel', 'whatis.el.ampel', 'Status', null],
    ['#proj-tabs', 'whatis.el.tabs', null, 'projectTabs'],
    ['.viewcube', 'whatis.el.viewcube', 'ViewCube', null],
    ['.view-btns', 'whatis.el.viewBtns', 'Ansichts-Knöpfe', null],
    ['#timeline', 'whatis.el.timeline', null, 'timeline'],
    ['#sheet', 'whatis.el.sheet', 'topbar.drawing', null],
  ];
  function cleanLabel(node) {
    if (!node) return '';
    const lbl = node.querySelector && node.querySelector('.lbl, .l-full, .nm, .section-h');
    if (lbl && lbl.textContent && lbl.textContent.trim()) return lbl.textContent.replace(/\u00AD/g, '').trim();
    const aria = node.getAttribute && node.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const ttl = node.getAttribute && node.getAttribute('title');
    if (ttl && ttl.trim()) return ttl.trim();
    if (node.cloneNode) {
      const cl = node.cloneNode(true);
      cl.querySelectorAll && cl.querySelectorAll('.kbd,.k,.role,.sub,.acts,.more').forEach((x) => x.remove());
      const txt = (cl.textContent || '').replace(/\u00AD/g, '').replace(/\s+/g, ' ').trim();
      if (txt) return txt.slice(0, 64);
    }
    return '';
  }
  function describeStep(id, anchor) {
    const f = Model.find(App.doc, id);
    if (!f) return null;
    if (I18n.lang === 'de') {
      const info = local(id, App.doc);
      if (!info) return null;
      const bodyTxt = info.lines.slice(0, 2).map((l) => l.t).join(' ');
      return {
        title: info.title,
        text: T('whatis.stepPrefix', { where: info.where }) + (bodyTxt ? ' ' + bodyTxt : ''),
        tip: (info.lines.find((l) => l.k === 'achtung') || {}).t || '',
        kbd: '',
        anchor,
      };
    }
    const top = App.doc.items.indexOf(f.item);
    const where = top >= 0 ? `${top + 1} / ${App.doc.items.length}` : Model.label(f.parent);
    const kindLbl = T('kind.' + f.item.kind);
    return {
      title: Model.label(f.item),
      text: `${T('whatis.stepPrefix', { where })} (${kindLbl})`,
      tip: '',
      kbd: '',
      anchor,
    };
  }
  function describeElement(rawEl, clientX, clientY) {
    const el = rawEl && rawEl.nodeType === 1 ? rawEl : (rawEl && rawEl.parentElement);
    if (!el) return { title: T('whatis.genericTitle'), text: T('whatis.genericFallback'), tip: '', kbd: '', anchor: null };
    const de = I18n.lang === 'de';

    // 1. Grundkörper-Kachel
    const kindTile = el.closest('[data-kind]');
    if (kindTile) {
      const k = kindTile.dataset.kind;
      const title = KINDS[k] ? T('kind.' + k) : (cleanLabel(kindTile) || k);
      const text = I18n.t('whatis.kind.' + k);
      const tip = de && STEP_TEXT && STEP_TEXT[k] && STEP_TEXT[k].achtung ? STEP_TEXT[k].achtung : T('whatis.tileTip');
      return { title, text: text.startsWith('whatis.') ? T('whatis.tileTip') : text, tip, kbd: '', anchor: kindTile };
    }

    // 2. Explizites data-whatis (z. B. Zylinder-/Quader-Loch)
    const wiEl = el.closest('[data-whatis]');
    if (wiEl) {
      const k = wiEl.dataset.whatis;
      const text = T('whatis.kind.' + k);
      return { title: cleanLabel(wiEl) || T('whatis.genericTitle'), text: text.startsWith('whatis.') ? T('whatis.genericFallback') : text, tip: T('whatis.tileTip'), kbd: '', anchor: wiEl };
    }

    // 3. Eigene Teile-Bibliothek & fertige Bauteile
    const userTile = el.closest('[data-user-lib-id]');
    if (userTile) {
      const name = cleanLabel(userTile) || T('fly.myParts');
      return { title: name, text: T('whatis.userLibPart', { name }), tip: T('whatis.tileTip'), kbd: '', anchor: userTile };
    }
    const libTile = el.closest('[data-lib]');
    if (libTile) {
      const lib = libTile.dataset.lib, d = typeof LIBMAP !== 'undefined' ? LIBMAP[lib] : null;
      const name = (d && d.label) || cleanLabel(libTile) || lib;
      const H = de && typeof HELP !== 'undefined' ? HELP[lib] : null;
      return {
        title: name,
        text: (H && H.hilfe) || (!de && T(d && d.role === 'hole' ? 'whatis.libPartHole' : 'whatis.libPartSolid', { name })) || (d && d.desc) || T('whatis.libPartSolid', { name }),
        tip: (H && H.tipp) || T('whatis.tileTip'),
        kbd: '',
        anchor: libTile,
      };
    }

    // 4. Zeitleisten-Schritt & Verlaufs-Eintrag
    const tlChip = el.closest('.tl-chip[data-idx]');
    if (tlChip) {
      const own = App.ctx ? (App.doc.items.find((x) => x.id === App.ctx) || App.doc) : App.doc;
      const step = (own.items || own.children || [])[Number(tlChip.dataset.idx)];
      const res = step && describeStep(step.id, tlChip);
      if (res) return res;
    }
    const treeNode = el.closest('.node[data-id]');
    if (treeNode && !el.closest('.acts, .tw')) {
      const res = describeStep(treeNode.dataset.id, treeNode);
      if (res) return res;
    }

    // 5. Bekannte Bereiche & Knöpfe
    for (const [sel, key, titleRef, helpFallback] of WHATIS_ID_MAP) {
      const match = el.closest(sel);
      if (!match) continue;
      // Innerhalb der Zeitleiste nur fangen, wenn kein spezifischeres Kind mit data-help/data-tip getroffen wurde
      if ((sel === '#timeline' || sel === '.view-btns' || sel === '#ampel') && el !== match && el.closest('[data-help],[data-tip],button')) break;
      const hk = helpFallback || (typeof UI !== 'undefined' && UI.helpKey ? UI.helpKey(match) : null);
      const H = hk && typeof HELP !== 'undefined' ? HELP[hk] : null;
      const title = cleanLabel(match) || (titleRef ? (titleRef.includes('.') ? T(titleRef) : titleRef) : (H && H.tip)) || T('whatis.genericTitle');
      return {
        title,
        text: T(key),
        tip: de && H && H.tipp ? H.tipp : '',
        kbd: match.dataset ? (match.dataset.kbd || '') : '',
        anchor: match,
      };
    }

    // 6. 3D-Ansicht: getroffener Körper oder allgemeiner Viewport-Hinweis
    const vp = el.closest('#viewport');
    if (vp) {
      if (typeof Viewer !== 'undefined' && Viewer.pick && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const hit = Viewer.pick(clientX, clientY, { noEdges: true });
        if (hit && hit.id) {
          const f = Model.find(App.doc, hit.id);
          if (f) {
            const name = Model.label(f.item);
            const sz = Model.sizeText(f.item, Model.vars(App.doc).v);
            return {
              title: name,
              text: T('whatis.bodyInViewport', { name }) + (sz ? ` (${sz})` : ''),
              tip: '',
              kbd: '',
              anchor: vp,
            };
          }
        }
      }
      return { title: de ? '3D-Ansicht' : '3D viewport', text: T('whatis.el.viewport'), tip: '', kbd: '', anchor: vp };
    }

    // 7. Elemente mit data-help / HELP
    const target = el.closest('[data-help],[data-tip],button,a,[role="button"],[role="menuitem"],[role="tab"],.st-chip,.section') || el;
    const hk = typeof UI !== 'undefined' && UI.helpKey ? UI.helpKey(target) : null;
    if (hk && typeof HELP !== 'undefined' && HELP[hk]) {
      const H = HELP[hk];
      const title = cleanLabel(target) || H.tip || T('whatis.genericTitle');
      if (de) {
        return { title, text: H.hilfe || H.tip, tip: H.tipp || '', kbd: target.dataset ? (target.dataset.kbd || '') : '', anchor: target };
      }
      const tip = target.dataset && target.dataset.tip;
      return { title, text: tip ? T('whatis.tipFallback', { tip }) : T('whatis.genericFallback'), tip: '', kbd: target.dataset ? (target.dataset.kbd || '') : '', anchor: target };
    }

    // 8. Eingabefelder (.field) mit <label>
    const field = el.closest('.field');
    if (field) {
      const lblEl = field.querySelector('label');
      const name = (lblEl && lblEl.textContent && lblEl.textContent.trim()) || cleanLabel(target) || T('whatis.genericTitle');
      return { title: name, text: T('whatis.fieldFallback', { name }), tip: '', kbd: '', anchor: field };
    }

    // 9. Elemente mit data-tip / aria-label
    const tip = (target.dataset && target.dataset.tip) || (el.dataset && el.dataset.tip) || '';
    if (tip) {
      const title = cleanLabel(target) || tip;
      return { title, text: T('whatis.tipFallback', { tip }), tip: '', kbd: target.dataset ? (target.dataset.kbd || '') : '', anchor: target };
    }

    // 10. Bereichs-Fallbacks
    const areas = [
      ['.flyout', 'whatis.area.flyout'],
      ['.menu', 'whatis.area.menu'],
      ['.ctxbar', 'whatis.area.ctxbar'],
      ['#left', 'whatis.area.left'],
      ['#right', 'whatis.area.right'],
      ['.topbar', 'whatis.area.topbar'],
      ['.bottombar', 'whatis.area.bottombar'],
    ];
    for (const [sel, key] of areas) {
      const area = el.closest(sel);
      if (area) return { title: cleanLabel(target) || T('whatis.genericTitle'), text: T(key), tip: '', kbd: '', anchor: target };
    }
    return { title: cleanLabel(target) || T('whatis.genericTitle'), text: T('whatis.genericFallback'), tip: '', kbd: '', anchor: target };
  }
  return { local, dialog, keyOf, paramsUsed, askAI, describeElement };
})();

// ---------- Schwachstellen ----------
const Weak = (() => {
  // Faustregeln (Gemini Prompt I, Quellen geprüft – siehe app/data/faustregeln.json)
  const RULES = {
    // Lochmitte bis Rand als Vielfaches des Lochdurchmessers. Für belastete Carbon-Verschraubungen empfiehlt Yongxian 2,5 × (bis 4 ×);
    // FPV-Rahmen liegen an Motorauflagen meist darunter. Tracery meldet deshalb erst unter der Untergrenze aus dem Stahlbau (1,2 ×, EN 1993-1-8).
    edge: { warn: 1.2, bad: 1.0, rec: 2.5 },
    pitch: { warn: 0.5, bad: 0.25, rec: 4 },        // Steg zwischen zwei Löchern (× kleinerer Durchmesser); empfohlen: Mitte zu Mitte 4 × D (Yongxian)
    wall: { print: [0.8, 1.5], tpu: [1.2, 1.5], fiber: [1.0, 1.5], metal: [0.5, 0.8], wood: [2, 3] },   // [rot unter, gelb unter] in mm (Druck: 3D-Demand)
    printHole: { small: 1.5, big: 2.0 },             // Wand um Schraubenlöcher in Druckteilen: M2 1,5 mm, ab M3 2 mm (3Dbite)
    arm: { 3: [3, 3], 4: [3, 4], 5: [4, 5], 6: [4.5, 5.5], 7: [5, 6] },   // [Race-Untergrenze, Freestyle-Empfehlung] in mm (fpvdroneframe.com; 6" geschätzt)
  };
  const SOURCES = [
    ['Yongxian: Carbon-Platten verschrauben', 'https://www.yongxian.co/en/blog/carbon-fiber-plate-metal-fasteners'],
    ['fpvdroneframe.com: Armdicke', 'https://fpvdroneframe.com/how-to-choose-the-right-fpv-drone-frame/'],
    ['3D-Demand: Wandstärke beim FDM-Druck', 'https://www.3d-demand.com/blog/design-guidelines-for-fdm-3d-printing-wall-thickness-tolerances-file-prep'],
    ['3Dbite: Gewindeeinsätze', 'https://3dbite.com/brass-heat-set-inserts-3d-printing-guide/'],
  ];
  const CLASS = { PLA: 'print', PETG: 'print', ABS: 'print', ASA: 'print', 'TPU 95A': 'tpu', PA6: 'print', PA12: 'print', PC: 'print', POM: 'print', CFK: 'fiber', GFK: 'fiber', 'Alu 6061': 'metal', 'Alu 7075': 'metal', 'Titan Gr. 5': 'metal', Baustahl: 'metal', 'Stahl S355': 'metal', 'Stahl C45': 'metal', 'Stahl 42CrMo4': 'metal', 'V2A Edelstahl': 'metal', 'V4A Edelstahl': 'metal', Messing: 'metal', Kupfer: 'metal', Buche: 'wood', 'Pappel-Sperrholz': 'wood', 'Birken-Sperrholz': 'wood', MDF: 'wood' };
  let last = null, marks = [], markTimer = null;
  const ev = makeEmitter();
  // Abstand Punkt – Strecke
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function edgeDist(p, e) {
    if (e.t === 'LINE') return segDist(p, e.a, e.b);
    if (e.t === 'CIRCLE' && e.full && e.c) return Math.abs(Math.hypot(p[0] - e.c[0], p[1] - e.c[1]) - e.r);
    let d = Infinity; const q = e.pts || []; for (let i = 0; i < q.length - 1; i++) d = Math.min(d, segDist(p, q[i], q[i + 1]));
    return d;
  }
  // Löcher in einer flachen Platte: Rand und Steg zwischen den Löchern (von oben gesehen)
  async function plateHoles(plate) {
    const it = App.doc.items.find((x) => x.id === plate.id); if (!it) return [];
    const V = Model.vars(App.doc).v;
    const holes = Model.activeItems(App.doc).filter((x) => x.role === 'hole' && !x.hidden);
    let res; try { res = await Kernel.call('project', { scene: { items: [it, ...holes].map((x) => Model.kernelItem(x, V)) }, views: ['top'] }); } catch (_) { return []; }
    const edges = (res.views && res.views.top && res.views.top.visible) || [];
    const isHole = (e) => e.t === 'CIRCLE' && e.full && e.c && e.r <= 8;
    const H = edges.filter(isHole);
    const b = Viewer.baseBox(it.id), z = b ? b.max.z : 0;
    const cls = CLASS[Mass.materialFor(it).k] || 'print', printed = cls === 'print' || cls === 'tpu';
    const groups = new Map();
    const add = (kind, s, hole, val, ratio, dn) => {
      const key = `${kind}|${s}|${fmtFixed(hole.r * 2, 1)}|${fmtFixed(val, 1)}`;
      if (!groups.has(key)) groups.set(key, { kind, s, d: hole.r * 2, val, ratio, dn, at: [] });
      const g = groups.get(key); if (!g.at.some((q) => Math.hypot(q[0] - hole.c[0], q[1] - hole.c[1]) < 0.05)) g.at.push([hole.c[0], hole.c[1], z]);
    };
    for (const hl of H) {
      const D = hl.r * 2;
      let edge = Infinity, lig = Infinity, dn = D;
      for (const e of edges) {
        if (e === hl) continue;
        if (isHole(e)) {
          const dc = Math.hypot(e.c[0] - hl.c[0], e.c[1] - hl.c[1]); if (dc < 0.05) continue;   // gleiche Mitte: Senkung
          const l = dc - hl.r - e.r; if (l < lig) { lig = l; dn = Math.min(D, e.r * 2); }
          continue;
        }
        edge = Math.min(edge, edgeDist(hl.c, e));
      }
      if (isFinite(edge)) {
        const ratio = edge / D, wall = edge - hl.r;
        let s = ratio < RULES.edge.bad ? 'bad' : ratio < RULES.edge.warn ? 'warn' : null;
        if (printed) { const need = D < 2.8 ? RULES.printHole.small : RULES.printHole.big; const s2 = wall < need / 2 ? 'bad' : wall < need ? 'warn' : null; if (s2 === 'bad' || (s2 && !s)) s = s2; }
        if (s) add(printed ? 'pedge' : 'edge', s, hl, wall, ratio);
      }
      if (isFinite(lig) && lig > -0.01) { const ratio = lig / dn; const s = ratio < RULES.pitch.bad ? 'bad' : ratio < RULES.pitch.warn ? 'warn' : null; if (s) add('pitch', s, hl, lig, ratio, dn); }
    }
    return [...groups.values()].map((g) => ({
      id: g.kind === 'pitch' ? 'hole-pitch' : 'hole-edge', s: g.s, title: g.kind === 'pitch' ? `Löcher nah beieinander – ${plate.name}` : `Löcher nah am Rand – ${plate.name}`,
      text: (g.kind === 'pitch'
        ? `${g.at.length} ${g.at.length === 1 ? 'Loch' : 'Löcher'} (Ø ${fmtFixed(g.d, 1)} mm) mit nur ${fmtFixed(g.val, 1)} mm Steg zum nächsten Loch. Tracery meldet unter ${fmtFixed(RULES.pitch.warn * g.dn, 1)} mm (halber Durchmesser); für belastete Carbon-Verschraubungen empfehlen Hersteller sogar ${fmtFixed(RULES.pitch.rec, 0)} × Durchmesser von Mitte zu Mitte.`
        : `${g.at.length} ${g.at.length === 1 ? 'Loch' : 'Löcher'} (Ø ${fmtFixed(g.d, 1)} mm) ${g.at.length === 1 ? 'hat' : 'haben'} nur ${fmtFixed(g.val, 1)} mm Material bis zum Rand – da reißt das Material bei Belastung zuerst aus. ` +
          (g.kind === 'pedge'
            ? `Bei Druckteilen gehören um ein Schraubenloch mindestens ${fmtFixed(g.d < 2.8 ? RULES.printHole.small : RULES.printHole.big, 1)} mm Material.`
            : `Tracery meldet, wenn die Lochmitte näher als ${fmtFixed(RULES.edge.warn, 1)} × Durchmesser am Rand liegt (hier ${fmtFixed(RULES.edge.warn * g.d, 1)} mm); für belastete Carbon-Verschraubungen empfehlen Hersteller ${fmtFixed(RULES.edge.rec, 1)} ×.`)),
      ids: [plate.id], at: g.at, r: g.d / 2,
    }));
  }
  // Druckteile, die keine flache Platte sind: Wand um jede runde Bohrung (der Kern legt einen Ring mit der Mindestwand herum)
  async function solidHoles() {
    const plates = new Set(Plates.candidates().map((p) => p.id));
    const parts = Model.activeItems(App.doc).filter((it) => !it.hidden && it.role !== 'hole' && !Mass.fixedOf(it) && !plates.has(it.id) && ['print', 'tpu'].includes(CLASS[Mass.materialFor(it).k] || 'print'));
    if (!parts.length) return [];
    let res = null;
    try { res = await Kernel.call('holeWalls', { scene: Model.kernelScene(App.doc), ids: parts.map((x) => x.id), small: RULES.printHole.small, big: RULES.printHole.big }); } catch (_) { return []; }
    const groups = new Map();
    for (const hl of (res && res.holes) || []) {
      const s = hl.wall < hl.need / 2 ? 'bad' : 'warn';
      const key = `${hl.id}|${s}|${fmtFixed(hl.d, 1)}|${fmtFixed(hl.wall, 1)}`;
      if (!groups.has(key)) groups.set(key, { id: hl.id, s, d: hl.d, wall: hl.wall, need: hl.need, at: [] });
      groups.get(key).at.push(hl.c);
    }
    return [...groups.values()].map((g) => {
      const it = App.doc.items.find((x) => x.id === g.id), name = it ? Model.label(it) : 'Teil';
      return {
        id: 'hole-wall', s: g.s, title: `Dünne Wand um ein Loch – ${name}`,
        text: `${g.at.length} ${g.at.length === 1 ? 'Loch' : 'Löcher'} (Ø ${fmtFixed(g.d, 1)} mm) ${g.at.length === 1 ? 'hat' : 'haben'} an einer Stelle nur etwa ${fmtFixed(g.wall, 1)} mm Material drumherum. Bei Druckteilen gehören um ein Schraubenloch mindestens ${fmtFixed(g.need, 1)} mm – sonst reißt die Schraube beim Anziehen oder bei Belastung aus. Loch weiter nach innen setzen oder dort mehr Material anbauen.`,
        ids: [g.id], at: g.at, r: g.d / 2 + 1,
      };
    });
  }
  // dünnste Stelle eines Teils aus seinen Grundkörpern
  function thinnest(it, V) {
    let best = null;
    const P = (x) => Model.resolveP(x.p || {}, V);
    const rec = (x) => {
      if (x.role === 'hole' || x.hidden || x.suppressed) return;   // Löcher (auch Loch-Gruppen) zählen nicht
      if (x.kind === 'group') { for (const c of x.children || []) rec(c); }
      const p = P(x); let t = null, what = '';
      if (x.kind === 'box') { t = Math.min(p.w, p.d, p.h); what = 'Dicke'; }
      else if (x.kind === 'cylinder') { t = Math.min(p.d, p.h); what = p.h < p.d ? 'Dicke' : 'Durchmesser'; }
      else if (x.kind === 'tube') { t = Math.min(p.wall, p.h); what = 'Wand'; }
      else if (x.kind === 'prism') { t = Math.min(p.d, p.h); what = 'Dicke'; }
      else if (x.kind === 'extrude') { t = Math.abs(p.dist); what = 'Dicke'; }
      for (const f of x.finishes || []) if (f.type === 'shell') {
        const vals = [Model.num(f.r, V, 2), ...((f.faceWalls || []).map((fw) => Model.num(fw.r, V, 2)))];
        for (const r of vals) if (typeof r === 'number' && isFinite(r) && r > 0 && (t == null || r < t)) { t = r; what = 'Wand'; }
      }
      if (typeof t === 'number' && isFinite(t) && t > 0 && (!best || t < best.t)) best = { t, what, name: Model.label(x) };
    };
    rec(it);
    return best;
  }
  function walls() {
    const out = [], V = Model.vars(App.doc).v;
    for (const it of Model.activeItems(App.doc)) {
      if (it.hidden || it.role === 'hole' || Mass.fixedOf(it)) continue;
      const m = Mass.materialFor(it), cls = CLASS[m.k] || 'print', [bad, warn] = RULES.wall[cls];
      const th = thinnest(it, V); if (!th) continue;
      const s = th.t < bad ? 'bad' : th.t < warn ? 'warn' : null; if (!s) continue;
      const b = Viewer.baseBox(it.id); const c = b ? b.getCenter(new THREE.Vector3()) : null;
      out.push({ id: 'wall', s, title: `Dünne Stelle – ${Model.label(it)}`, text: `„${th.name}“ ist nur ${fmtFixed(th.t, 2)} mm ${th.what === 'Durchmesser' ? 'dick' : th.what === 'Wand' ? 'Wand' : 'dick'} (${m.k}). Faustregel für ${({ print: 'tragende Druckteile', tpu: 'TPU', fiber: 'Carbon und GFK', metal: 'Metall', wood: 'Holz' })[cls]}: mindestens ${fmtFixed(warn, 1)} mm.`, ids: [it.id], at: c ? [[c.x, c.y, b.max.z]] : [], r: 6 });
    }
    return out;
  }
  function arms() {
    if (!DroneCheck.isDrone()) return [];
    const V = Model.vars(App.doc).v, z = Math.round(V.Propeller), r = RULES.arm[z]; if (!r || typeof V.Armdicke !== 'number') return [];
    const [min, rec] = r; const t = V.Armdicke;
    if (t >= rec) return [];
    const s = t < min - 1 ? 'bad' : t < min ? 'warn' : 'info';
    return [{ id: 'arm', s, title: s === 'info' ? 'Arme für Freestyle eher dünn' : 'Dünne Arme', text: s === 'info'
      ? `Die Arme sind ${fmtFixed(t, 1)} mm dick – für einen ${z}"-Racer in Ordnung, für Freestyle sind ${fmtFixed(rec, 1)} mm üblich.`
      : `Die Arme sind ${fmtFixed(t, 1)} mm dick. Für ${z}"-Rahmen nehmen Racer mindestens ${fmtFixed(min, 1)} mm, Freestyle-Rahmen ${fmtFixed(rec, 1)} mm – dünnere Arme brechen beim Crash zuerst.`, ids: App.doc.items.filter((i) => i.name === 'Unterteil').map((i) => i.id), fix: { label: `Armdicke auf ${fmtFixed(rec, 1)} mm`, run: () => App.change('Armdicke erhöht', (doc) => { doc.params.find((p) => p.name === 'Armdicke').expr = rec; }) } }];
  }
  // Überhänge bei Druckteilen: was steiler als 45° nach unten zeigt und nicht auf dem Druckbett liegt
  function overhangs() {
    const out = [];
    for (const it of Model.activeItems(App.doc)) {
      if (it.hidden || it.role === 'hole' || Mass.fixedOf(it) || !Viewer.nodes.has(it.id)) continue;
      const cls = CLASS[Mass.materialFor(it).k] || 'print'; if (cls !== 'print' && cls !== 'tpu') continue;
      const o = Views.overhangOf(it.id, 45); if (!o || o.area < 100 || !o.c) continue;   // kleine Stellen (z. B. waagerechte Schraubenlöcher) überbrückt der Drucker
      out.push({ id: 'overhang', s: 'info', title: `Überhang beim Drucken – ${Model.label(it)}`, text: `${fmtFixed(o.area, 0)} mm² zeigen steiler als 45° nach unten und hängen beim Drucken in der Luft – der Slicer braucht dort Stützen. Anders hinlegen, eine Fase statt einer waagerechten Kante oder in zwei Teile teilen hilft. Ansichten → „Überhänge (3D-Druck)“ zeigt die Stellen rot.`, ids: [it.id], at: [o.c], r: 6, fix: { label: 'Für den Druck ausrichten', run: () => Print.orientForPrint([it.id]) } });
    }
    return out;
  }
  function nozzleWalls() {
    if (typeof Print === 'undefined' || !Print.nozzleWallCheck) return [];
    const pbOn = !!(App.doc.settings && App.doc.settings.printBed && App.doc.settings.printBed.enabled);
    const hasPrintMat = Model.activeItems(App.doc).some((it) => !it.hidden && it.role !== 'hole' && !Mass.fixedOf(it) && ['print', 'tpu'].includes(CLASS[Mass.materialFor(it).k] || 'print'));
    if (!pbOn && !hasPrintMat) return [];
    const nw = Print.nozzleWallCheck();
    if (!nw.warn) return [];
    return [{ id: 'nozzle-wall', s: 'warn', title: 'Wand zu dünn für die Düse', text: nw.summary, fix: { label: 'Stellen zeigen', run: () => Views.thin(true, { limit: nw.minWall }) } }];
  }
  async function analyze() {
    if (!App.doc.items.length) return [];
    const rev = App.revision, out = [];
    for (const pl of Plates.candidates()) out.push(...(await plateHoles(pl)));
    out.push(...(await solidHoles()));
    out.push(...walls(), ...nozzleWalls(), ...arms(), ...overhangs());
    if (DroneCheck.isDrone()) {
      const l = (await DroneCheck.run()) || [];
      for (const c of l) if ((c.s === 'bad' || c.s === 'warn') && c.id !== 'weight') out.push({ ...c, id: 'drone-' + c.id, title: c.title + ' (Drohnen-Check)' });
    }
    const order = { bad: 0, warn: 1, info: 2 };
    out.sort((a, b) => order[a.s] - order[b.s]);
    last = { rev, list: out };
    ev.emit('analyzed', out);
    return out;
  }
  function summary() { return last && last.rev === App.revision ? last.list : null; }
  // Fundstellen im Bild markieren (rote Ringe), bis sich die Auswahl ändert
  function clearMarks() { for (const m of marks) { Viewer.groups.overlay.remove(m); m.geometry.dispose(); m.material.dispose(); } marks = []; clearTimeout(markTimer); Viewer.requestRender(); }
  function mark(points, r = 3) {
    clearMarks();
    for (const p of points || []) {
      const R0 = Math.max(r * 1.6, 6), R1 = R0 + Math.max(1.2, R0 * 0.2);   // auch kleine Löcher gut sichtbar
      const ring = new THREE.Mesh(new THREE.RingGeometry(R0, R1, 48), new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
      ring.position.set(p[0], p[1], p[2] + 0.2); ring.renderOrder = 45;
      Viewer.groups.overlay.add(ring); marks.push(ring);
    }
    Viewer.requestRender();
    markTimer = setTimeout(clearMarks, 12000);
  }
  function show(c) {
    if (c.ids && c.ids.length) App.select(c.ids);
    if (c.at && c.at.length) {
      mark(c.at, c.r || 3);
      // nah heranfahren, damit auch ein kleines Loch gut zu sehen ist
      const bx = new THREE.Box3(); for (const p of c.at) bx.expandByPoint(new THREE.Vector3(...p)); bx.expandByScalar(28);
      const cam = Viewer.camera, ctr = Viewer.controls, cen = bx.getCenter(new THREE.Vector3()), r = bx.getSize(new THREE.Vector3()).length() / 2;
      const dir = cam.position.clone().sub(ctr.target).normalize();
      setTimeout(() => Viewer.moveCamera(cen.clone().add(dir.multiplyScalar((r / Math.sin((cam.fov * Math.PI) / 360)) * 1.05)), cen), 60);
    }
  }
  function rows(list, onShow, compact = false) {
    const box = h('div', { class: 'chk-list' + (compact ? ' compact' : '') });
    for (const c of list) {
      const r = h('div', { class: 'chk-row ' + c.s, 'data-weak': c.id }, h('span', { class: 'chk-dot', 'aria-hidden': 'true' }, { ok: '✓', warn: '!', bad: '✕', info: 'i' }[c.s]), h('div', { class: 'grow' }, h('b', null, c.title), h('span', null, c.text)));
      const btns = h('div', { class: 'chk-btns' });
      if (c.fix) { const b = h('button', { type: 'button', class: 'btn small', 'data-fix': c.id }); b.innerHTML = icon('check') + esc(c.fix.label); b.onclick = () => { c.fix.run(); onShow && onShow(null); }; btns.append(b); }
      if (((c.ids && c.ids.length) || (c.at && c.at.length)) && onShow) { const b = h('button', { type: 'button', class: 'btn small ghost' }, 'Zeigen'); b.onclick = () => onShow(c); btns.append(b); }
      if (btns.children.length) r.append(btns);
      box.append(r);
    }
    return box;
  }
  async function askAI(list) {
    const prompt = `Du bist der Konstruktions-Prüfer in Tracery, einem allgemeinen CAD-Programm im Browser. Erkläre einfach und verständlich.
Tracery hat mit Faustregeln diese Schwachstellen gefunden (kann auch leer sein):
${list.length ? list.map((c, i) => `${i + 1}. [${c.s}] ${c.title}: ${c.text}`).join('\n') : 'keine'}

Aufgabe: Erkläre in 2–4 kurzen Sätzen auf Deutsch (du-Form), was davon am wichtigsten ist und warum. Nenne auch eine weitere Schwachstelle, die du im Modell siehst, falls es eine gibt – erfinde aber keine Zahlen. Mach höchstens 3 konkrete Verbesserungsvorschläge, die sich mit den Aktionen unten umsetzen lassen (am besten über Maße mit op "mass", z. B. Wandstärke, Breite, Dicke).
Antworte NUR mit JSON: {"antwort":"…","vorschlaege":[{"titel":"kurz, was passiert","aktionen":[…]}]}

AKTIONEN (Format der "aktionen" in jedem Vorschlag):
${AI.ACTIONS}

AKTUELLES MODELL (JSON):
${AI.modelText()}`;
    const r = await AI.json(prompt);
    if (r.error) return r;
    const res = r.res || {};
    const sug = (Array.isArray(res.vorschlaege) ? res.vorschlaege : []).filter((v) => v && Array.isArray(v.aktionen) && v.aktionen.length).slice(0, 3).map((v) => ({ title: String(v.titel || 'Vorschlag').slice(0, 120), acts: v.aktionen }));
    return { text: String(res.antwort || '').slice(0, 900), sug };
  }
  async function dialog() {
    if (!App.doc.items.length) { UI.toast('Es gibt noch nichts zu prüfen. Bau zuerst etwas.', { icon: 'info' }); return; }
    const body = h('div', { class: 'chk weak', id: 'weak' }, h('div', { class: 'hint-box' }, 'Suche Schwachstellen … (Löcher, Wände, Überhänge' + (DroneCheck.isDrone() ? ', Arme, Drohnen-Check' : '') + ')'));
    const m = UI.modal({ title: 'Schwachstellen', body, wide: true, actions: [{ label: 'Schließen', primary: true }] });
    const list = await analyze();
    const draw = (l) => {
      body.innerHTML = '';
      if (!l.length) body.append(h('div', { class: 'chk-row ok' }, h('span', { class: 'chk-dot' }, '✓'), h('div', { class: 'grow' }, h('b', null, 'Keine Schwachstellen gefunden'), h('span', null, 'Löcher haben genug Rand und Wände sind dick genug.'))));
      else body.append(rows(l, (c) => { if (!c) { m.close(); setTimeout(dialog, 400); return; } m.close(); show(c); }));
      const srcs = DroneCheck.isDrone() ? SOURCES : SOURCES.filter(([, u]) => !/fpvdroneframe/i.test(u));
      body.append(h('div', { class: 'hint-box', html: 'Die Werte sind <b>Faustregeln</b>, keine Festigkeitsberechnung. Grün heißt: nichts Auffälliges – testen musst du trotzdem.<br><small>Quellen: ' + srcs.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join(' · ') + '</small>' }));
      if (AI.available && window.claude) {
        const aiBox = h('div', { class: 'explain-ai', id: 'weak-ai' });
        const b = h('button', { type: 'button', class: 'btn small', id: 'weak-ask' }); b.innerHTML = icon('spark') + (l.length ? 'Von der KI erklären und verbessern lassen' : 'Die KI nach weiteren Schwachstellen fragen');
        b.onclick = async () => {
          b.disabled = true; aiBox.innerHTML = ''; aiBox.append(h('div', { class: 'hint-box' }, 'Die KI schaut sich das Modell an …'));
          const r = await askAI(l); aiBox.innerHTML = '';
          if (r.error) { aiBox.append(h('div', { class: 'hint-box warn' }, r.error)); b.disabled = false; return; }
          const w = h('div', { class: 'ai-say' }); w.innerHTML = icon('spark'); w.append(h('div', null, h('p', null, r.text || 'Keine weiteren Hinweise.')));
          aiBox.append(w);
          for (const sg of r.sug) {
            const row = h('div', { class: 'ai-sug' }, h('span', { class: 'grow' }, sg.title));
            const ub = h('button', { type: 'button', class: 'btn small primary', 'data-sug': '1' }); ub.innerHTML = icon('check') + 'Umsetzen';
            ub.onclick = async () => { ub.disabled = true; const rep = await AI.apply(sg.acts, 'Verbesserung: ' + sg.title); ub.innerHTML = icon('check') + 'Umgesetzt'; if (rep && rep.notes.length) UI.toast(rep.notes.join(' '), { icon: 'info' }); };
            row.append(ub); aiBox.append(row);
          }
          b.remove();
        };
        body.append(h('div', { class: 'btn-row' }, b), aiBox);
      }
    };
    draw(list);
  }
  App.on('selection', () => { if (marks.length) setTimeout(() => { if (!App.sel.length) clearMarks(); }, 50); });
  return { analyze, dialog, summary, mark, clearMarks, rows, RULES, SOURCES, on: ev.on, get marks() { return marks.length; } };
})();
