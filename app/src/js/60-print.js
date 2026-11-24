// ================= Modell-Status und Export =================
// (Der Name „Print“ ist historisch – hier gibt es keinen Drucker und keine Druckplatte mehr.)
const PRINTERS = /*JSON:drucker.json*/null;

const Print = (() => {
  const findPrinter = (id) => (PRINTERS || []).find((p) => p.id === id) || null;
  function holeComp() {
    const hc = App.doc && App.doc.settings && App.doc.settings.printBed ? Number(App.doc.settings.printBed.holeComp) : 0;
    return Number.isFinite(hc) && hc > 0 ? clamp(Math.round(hc * 100) / 100, 0, 1) : 0;
  }
  function nozzle() {
    const nz = App.doc && App.doc.settings && App.doc.settings.printBed ? Number(App.doc.settings.printBed.nozzle) : 0.4;
    return Number.isFinite(nz) && nz > 0 ? clamp(Math.round(nz * 100) / 100, 0.1, 2.0) : 0.4;
  }
  function setNozzle(mm) {
    const v = Number.isFinite(Number(mm)) ? clamp(Math.round(Number(mm) * 100) / 100, 0.1, 2.0) : 0.4;
    App.change('Düse geändert', (doc) => {
      doc.settings = doc.settings || {};
      doc.settings.printBed = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0, printFit: '' }, doc.settings.printBed || {}, { nozzle: v });
    });
  }
  function printFit() {
    const pf = App.doc && App.doc.settings && App.doc.settings.printBed ? App.doc.settings.printBed.printFit : '';
    return ['loose', 'slide', 'snug', 'press'].includes(pf) ? pf : '';
  }
  function setPrintFit(id) {
    const pf = ['loose', 'slide', 'snug', 'press'].includes(id) ? id : '';
    const info = typeof printFitInfo === 'function' ? printFitInfo(pf) : null;
    App.change(info ? `Druck-Passung: ${info.label}` : 'Druck-Passung ausgeschaltet', (doc) => {
      doc.settings = doc.settings || {};
      doc.settings.printBed = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0, printFit: '' }, doc.settings.printBed || {}, { printFit: pf });
    });
  }
  function setPrinter(id) {
    const p = findPrinter(id);
    App.change(p ? `Drucker: ${p.name}` : id === 'custom' ? 'Eigene Druckergröße' : 'Druckbett deaktiviert', (doc) => {
      doc.settings = doc.settings || {};
      const cur = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0 }, doc.settings.printBed || {});
      if (!id) {
        doc.settings.printBed = { ...cur, enabled: false };
      } else if (p) {
        doc.settings.printer = p.id;
        doc.settings.printBed = { ...cur, enabled: true, printer: p.id, x: p.x, y: p.y, z: p.z, nozzle: p.nozzle || cur.nozzle || 0.4 };
      } else {
        doc.settings.printer = 'custom';
        doc.settings.printBed = { ...cur, enabled: true, printer: 'custom' };
      }
    });
  }
  function setHoleComp(mm) {
    const v = Number.isFinite(Number(mm)) ? clamp(Math.round(Number(mm) * 100) / 100, 0, 1) : 0;
    App.change('Loch-Ausgleich geändert', (doc) => {
      doc.settings = doc.settings || {};
      doc.settings.printBed = Object.assign({ enabled: false, printer: 'custom', x: 220, y: 220, z: 250, nozzle: 0.4, holeComp: 0 }, doc.settings.printBed || {}, { holeComp: v });
    });
  }
  function solidBox() {
    const box = new THREE.Box3();
    for (const n of Viewer.nodes.values()) { if (n.role === 'hole' || !n.obj.visible || n.id === '__dragprev') continue; box.union(n.mesh.geometry.boundingBox.clone().applyMatrix4(n.obj.matrix)); }
    return box;
  }
  function stats() {
    const b = solidBox(); if (b.isEmpty()) return null;
    const s = b.getSize(new THREE.Vector3());
    return { x: s.x, y: s.y, z: s.z, box: b };
  }
  function fitCheck(bed = App.doc && App.doc.settings && App.doc.settings.printBed, st = stats()) {
    const pr = bed && bed.printer ? findPrinter(bed.printer) : null;
    const printerName = pr ? pr.name : 'Druckbett';
    if (!bed || !bed.enabled || !st) return { active: !!(bed && bed.enabled), fits: true, printer: pr, printerName, overflow: [], suggestion: null, summary: '' };
    const EPS = 0.05;
    const bx = Number(bed.x) || 220, by = Number(bed.y) || 220, bz = Number(bed.z) || 250;
    const sx = st.x, sy = st.y, sz = st.z;
    const overflow = [];
    if (sx > bx + EPS) overflow.push({ axis: 'X', label: 'Breite', size: sx, limit: bx, excess: sx - bx });
    if (sy > by + EPS) overflow.push({ axis: 'Y', label: 'Tiefe', size: sy, limit: by, excess: sy - by });
    if (sz > bz + EPS) overflow.push({ axis: 'Z', label: 'Höhe', size: sz, limit: bz, excess: sz - bz });
    if (!overflow.length) return { active: true, fits: true, printer: pr, printerName, overflow: [], suggestion: null, summary: '' };
    // Drehvorschläge prüfen: zuerst 90°-Drehungen, danach diagonale Drehung auf dem Bett (z. B. 45°)
    let suggestion = null;
    const orthoCandidates = [
      { rx: 0, ry: 0, rz: 90, w: sy, d: sx, h: sz, desc: 'Um 90° um Z drehen' },
      { rx: 90, ry: 0, rz: 0, w: sx, d: sz, h: sy, desc: 'Um 90° um X kippen' },
      { rx: 0, ry: 90, rz: 0, w: sz, d: sy, h: sx, desc: 'Um 90° um Y kippen' },
      { rx: 90, ry: 0, rz: 90, w: sz, d: sx, h: sy, desc: 'Um 90° um X kippen und 90° um Z drehen' },
      { rx: 0, ry: 90, rz: 90, w: sy, d: sz, h: sx, desc: 'Um 90° um Y kippen und 90° um Z drehen' },
    ];
    for (const c of orthoCandidates) {
      if (c.w <= bx + EPS && c.d <= by + EPS && c.h <= bz + EPS) {
        suggestion = {
          canFit: true, rx: c.rx, ry: c.ry, rz: c.rz, w: c.w, d: c.d, h: c.h,
          text: `Vorschlag: ${c.desc} – dann passt es (${Units.fmtLen(c.w, 1)} × ${Units.fmtLen(c.d, 1)} × ${Units.fmtLen(c.h, 1)} ${Units.label()}).`,
        };
        break;
      }
    }
    if (!suggestion) {
      const bases = [
        { rx: 0, ry: 0, a: sx, b: sy, h: sz, prefix: '' },
        { rx: 90, ry: 0, a: sx, b: sz, h: sy, prefix: 'um 90° um X kippen und ' },
        { rx: 0, ry: 90, a: sz, b: sy, h: sx, prefix: 'um 90° um Y kippen und ' },
      ];
      const angles = [45, 30, 60, 15, 75];
      for (let ang = 5; ang <= 85; ang += 5) if (!angles.includes(ang)) angles.push(ang);
      for (let ang = 1; ang <= 89; ang++) if (!angles.includes(ang)) angles.push(ang);
      for (const base of bases) {
        if (base.h > bz + EPS) continue;
        for (const rz of angles) {
          const rad = (rz * Math.PI) / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
          const w = base.a * cs + base.b * sn, d = base.a * sn + base.b * cs;
          if (w <= bx + EPS && d <= by + EPS) {
            const diagNote = rz === 45 ? ' (diagonal aufs Bett)' : '';
            suggestion = {
              canFit: true, rx: base.rx, ry: base.ry, rz, w, d, h: base.h,
              text: `Vorschlag: ${base.prefix ? base.prefix[0].toUpperCase() + base.prefix.slice(1) : 'Um '}${rz}° um Z drehen${diagNote} – dann passt es (${Units.fmtLen(w, 1)} × ${Units.fmtLen(d, 1)} × ${Units.fmtLen(base.h, 1)} ${Units.label()}).`,
            };
            break;
          }
        }
        if (suggestion) break;
      }
    }
    if (!suggestion) {
      suggestion = {
        canFit: false,
        text: 'Passt auch gedreht nicht in den Bauraum – Teil verkleinern oder mit „Teilen“ in zwei Stücke zerlegen.',
      };
    }
    const overText = overflow.map((o) => `${o.axis} um +${Units.fmtLen(o.excess, 1)}`).join(', ');
    const summary = `${printerName} (${Units.fmtLen(bx, 0)} × ${Units.fmtLen(by, 0)} × ${Units.fmtLen(bz, 0)} ${Units.label()}): Modell (${Units.fmtLen(sx, 1)} × ${Units.fmtLen(sy, 1)} × ${Units.fmtLen(sz, 1)} ${Units.label()}) überschreitet ${overText} ${Units.label()}. ${suggestion.text}`;
    return { active: true, fits: false, printer: pr, printerName, overflow, suggestion, summary };
  }
  function applyRotationSuggestion(sug) {
    if (!sug || !sug.canFit) return false;
    const st = stats(); if (!st) return false;
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const piv = st.box.getCenter(new THREE.Vector3());
    const qAdd = new THREE.Quaternion().setFromEuler(new THREE.Euler((sug.rx || 0) * D2R, (sug.ry || 0) * D2R, (sug.rz || 0) * D2R, 'XYZ'));
    const mAdd = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qAdd))
      .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
    // gedrehte Hüllbox berechnen, um das Modell sauber auf (0, 0) und Z = 0 abzusetzen
    const bRot = new THREE.Box3(), tmpV = new THREE.Vector3();
    for (const n of Viewer.nodes.values()) {
      if (n.role === 'hole' || !n.obj.visible || n.id === '__dragprev') continue;
      const pos = n.mesh.geometry && n.mesh.geometry.attributes && n.mesh.geometry.attributes.position;
      if (!pos) continue;
      const mTotal = mAdd.clone().multiply(n.obj.matrix);
      for (let i = 0; i < pos.count; i++) {
        tmpV.fromBufferAttribute(pos, i).applyMatrix4(mTotal);
        bRot.expandByPoint(tmpV);
      }
    }
    const shift = bRot.isEmpty()
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(-(bRot.min.x + bRot.max.x) / 2, -(bRot.min.y + bRot.max.y) / 2, -bRot.min.z);
    const rnd = (v) => Math.round(v * 1e4) / 1e4;
    App.change('Für Drucker gedreht', (doc) => {
      const vars = Model.vars(doc);
      Model.useVars(vars);
      for (const it of doc.items) {
        if (!it || it.hidden) continue;
        it.t = it.t || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
        const tn = Model.tNumeric(it);
        const pNew = new THREE.Vector3(tn.x, tn.y, tn.z).applyMatrix4(mAdd).add(shift);
        const qOld = new THREE.Quaternion().setFromEuler(new THREE.Euler(tn.rx * D2R, tn.ry * D2R, tn.rz * D2R, 'XYZ'));
        const qNew = qAdd.clone().multiply(qOld);
        const eNew = new THREE.Euler().setFromQuaternion(qNew, 'XYZ');
        it.t.x = rnd(pNew.x); it.t.y = rnd(pNew.y); it.t.z = rnd(pNew.z);
        it.t.rx = rnd(eNew.x * R2D); it.t.ry = rnd(eNew.y * R2D); it.t.rz = rnd(eNew.z * R2D);
      }
    });
    UI.toast('Modell für den Drucker gedreht.', { icon: 'check' });
    return true;
  }
  // ---------- DR-04: Wandstärken-Check gegen die Düse (Wand < 2 × Düse = Warnung) ----------
  const NON_PRINT_LIBS = new Set(['stdScrew', 'stdNut', 'stdWasher', 'stdBearing', 'stdSleeve', 'stdPin', 'stdKey', 'threadRod']);
  let wallCache = null;
  function printableWallNodes(onlyIds = null) {
    const out = [];
    for (const n of Viewer.nodes.values()) {
      if (!n.obj.visible || n.allBodiesHidden || n.role === 'hole' || n.id === '__dragprev' || !n.mesh || !n.data || !n.data.triangles) continue;
      if (onlyIds && !onlyIds.includes(n.id)) continue;
      if (!onlyIds) {
        const f = Model.find(App.doc, n.id);
        const it = f ? f.item : null;
        if (it && (typeof Mass !== 'undefined' && Mass.fixedOf(it))) continue;
        if (it && it.kind === 'part' && it.p && NON_PRINT_LIBS.has(it.p.lib)) continue;
      }
      out.push(n);
    }
    return out;
  }
  function nozzleWallCheck(nozzleVal = nozzle(), onlyIds = null) {
    const noz = Number(nozzleVal) > 0 ? clamp(Math.round(Number(nozzleVal) * 100) / 100, 0.1, 2.0) : nozzle();
    const minWall = round(2 * noz, 4);
    const nodes = printableWallNodes(onlyIds);
    if (!nodes.length) return { ok: true, warn: false, nozzle: noz, minWall, area: 0, minT: null, summary: '' };
    const ids = nodes.map((n) => n.id);
    const geomSig = nodes.map((n) => `${n.id}:${(App.results.get(n.id) && App.results.get(n.id).key) || ''}`).join(',');
    const cacheKey = `${App.revision}|${noz}|${geomSig}`;
    if (!App.busy && wallCache && wallCache.key === cacheKey) return wallCache.res;
    const d = Viewer.thinWalls(Math.max(0.05, minWall - 0.01), ids);
    const minT = d.minT != null ? round(d.minT + 1e-4, 3) : null;
    const warn = d.area >= 0.5 && minT != null && minT < minWall - 0.01;
    const summary = warn
      ? `Wand zu dünn für ${fmt(noz, 2)}-mm-Düse: dünnste Stelle ${Units.fmtLenU(minT, 2)} (mindestens ${Units.fmtLenU(minWall, 2)} = 2 × Düse, ${Units.fmtAreaU(d.area, d.area < 100 ? 1 : 0)} betroffen).`
      : `Wandstärke passt zur ${fmt(noz, 2)}-mm-Düse (überall mindestens ${Units.fmtLenU(minWall, 2)} = 2 × Düse).`;
    const res = { ok: !warn, warn, nozzle: noz, minWall, area: d.area, minT, summary };
    if (!App.busy) wallCache = { key: cacheKey, res };
    return res;
  }

  // ---------- DR-05: Für den Druck ausrichten (minimale Überhangfläche, sichere Auflage auf Z = 0) ----------
  function orientTargetNodes(ids = null) {
    const all = [...Viewer.nodes.values()].filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.id !== '__dragprev' && n.mesh && n.data && n.data.triangles);
    if (Array.isArray(ids) && ids.length) {
      const want = new Set();
      for (const id of ids) {
        const t = Model.topOf(App.doc, id);
        if (t) want.add(App.mergedInto(t.id) || t.id);
        want.add(id);
      }
      const sub = all.filter((n) => want.has(n.id));
      if (sub.length) return sub;
    }
    if (App.sel && App.sel.length) {
      const want = new Set();
      for (const id of App.sel) {
        const t = Model.topOf(App.doc, id);
        if (t) want.add(App.mergedInto(t.id) || t.id);
      }
      const sub = all.filter((n) => want.has(n.id));
      if (sub.length) return sub;
    }
    return all;
  }
  function collectOrientTris(nodes) {
    const tris = [];
    const box = new THREE.Box3();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
    for (const n of nodes) {
      n.obj.updateMatrixWorld(true);
      const P = n.mesh.geometry.getAttribute('position').array;
      const T = n.data.triangles;
      const M = n.mesh.matrixWorld;
      for (let i = 0; i + 2 < T.length; i += 3) {
        va.fromArray(P, T[i] * 3).applyMatrix4(M);
        vb.fromArray(P, T[i + 1] * 3).applyMatrix4(M);
        vc.fromArray(P, T[i + 2] * 3).applyMatrix4(M);
        box.expandByPoint(va).expandByPoint(vb).expandByPoint(vc);
        nn.crossVectors(ab.subVectors(vb, va), ac.subVectors(vc, va));
        const L = nn.length();
        if (L < 1e-10) continue;
        tris.push({
          ax: va.x, ay: va.y, az: va.z,
          bx: vb.x, by: vb.y, bz: vb.z,
          cx: vc.x, cy: vc.y, cz: vc.z,
          nx: nn.x / L, ny: nn.y / L, nz: nn.z / L,
          area: L / 2,
        });
      }
    }
    return { tris, box };
  }
  function orientCandidates(tris) {
    const cands = [];
    const add = (dx, dy, dz, eulerHint = null, isCurrent = false) => {
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-9) return;
      const x = dx / l, y = dy / l, z = dz / l;
      if (cands.some((c) => c.x * x + c.y * y + c.z * z > 0.9994)) return;
      cands.push({ x, y, z, eulerHint, isCurrent });
    };
    add(0, 0, -1, [0, 0, 0], true);
    add(0, 0, 1, [180, 0, 0], false);
    add(1, 0, 0, [0, 90, 0], false);
    add(-1, 0, 0, [0, -90, 0], false);
    add(0, 1, 0, [-90, 0, 0], false);
    add(0, -1, 0, [90, 0, 0], false);
    // Häufige Flächen-Normalen aus dem Netz clustern
    const clusters = [];
    for (const t of tris) {
      let cl = null;
      for (const c of clusters) {
        if (c.x * t.nx + c.y * t.ny + c.z * t.nz > 0.9985) { cl = c; break; }
      }
      if (!cl) clusters.push({ x: t.nx, y: t.ny, z: t.nz, area: t.area });
      else cl.area += t.area;
    }
    clusters.sort((a, b) => b.area - a.area);
    for (const c of clusters.slice(0, 16)) add(c.x, c.y, c.z);
    for (const c of clusters.slice(0, 6)) add(-c.x, -c.y, -c.z);
    // 45°-Diagonalen als Ausweichrichtungen
    const s = Math.SQRT1_2;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      add(sx * s, 0, sy * s);
      add(0, sx * s, sy * s);
      add(sx * s, sy * s, 0);
    }
    return cands;
  }
  function evalOrientCandidate(tris, cand, lim) {
    const ux = -cand.x, uy = -cand.y, uz = -cand.z;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const ha = t.ax * ux + t.ay * uy + t.az * uz;
      const hb = t.bx * ux + t.by * uy + t.bz * uz;
      const hc = t.cx * ux + t.cy * uy + t.cz * uz;
      if (ha < minH) minH = ha; if (hb < minH) minH = hb; if (hc < minH) minH = hc;
      if (ha > maxH) maxH = ha; if (hb > maxH) maxH = hb; if (hc > maxH) maxH = hc;
    }
    let overhangArea = 0, supportVol = 0, bedArea = 0;
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const nz = t.nx * ux + t.ny * uy + t.nz * uz;
      const ha = t.ax * ux + t.ay * uy + t.az * uz - minH;
      const hb = t.bx * ux + t.by * uy + t.bz * uz - minH;
      const hc = t.cx * ux + t.cy * uy + t.cz * uz - minH;
      const topH = Math.max(ha, hb, hc);
      if (nz <= -0.996 && topH <= 0.15) bedArea += t.area;
      if (nz <= lim && topH >= 0.05) {
        overhangArea += t.area;
        supportVol += t.area * ((ha + hb + hc) / 3);
      }
    }
    return { ...cand, overhangArea, supportVol, bedArea, height: maxH - minH };
  }
  function betterOrient(A, B) {
    const ovTol = Math.max(0.5, 0.01 * Math.min(A.overhangArea, B.overhangArea));
    if (Math.abs(A.overhangArea - B.overhangArea) > ovTol) return A.overhangArea < B.overhangArea;
    if (A.overhangArea > 0.5 && B.overhangArea > 0.5) {
      const svTol = Math.max(5, 0.05 * Math.min(A.supportVol, B.supportVol));
      if (Math.abs(A.supportVol - B.supportVol) > svTol) return A.supportVol < B.supportVol;
    }
    const bedTol = Math.max(1, 0.05 * Math.max(A.bedArea, B.bedArea));
    if (Math.abs(A.bedArea - B.bedArea) > bedTol) return A.bedArea > B.bedArea;
    if (Math.abs(A.height - B.height) > 0.5) return A.height < B.height;
    if (A.isCurrent !== B.isCurrent) return A.isCurrent;
    return !!A.eulerHint && !B.eulerHint;
  }
  function bestPrintOrientation(ids = null, opts = {}) {
    const nodes = orientTargetNodes(ids);
    if (!nodes.length) return null;
    const { tris, box } = collectOrientTris(nodes);
    if (!tris.length || box.isEmpty()) return null;
    const angle = Number(opts.angle) > 0 ? Number(opts.angle) : (typeof Views !== 'undefined' && Views.overhangAngle ? Views.overhangAngle : 45);
    const lim = -Math.cos((angle * Math.PI) / 180);
    const cands = orientCandidates(tris);
    let cur = null, best = null;
    for (const c of cands) {
      const ev = evalOrientCandidate(tris, c, lim);
      if (c.isCurrent) cur = ev;
      if (!best || betterOrient(ev, best)) best = ev;
    }
    return { nodes, tris, box, cur, best, angle };
  }
  function orientForPrint(ids = null, opts = {}) {
    const plan = bestPrintOrientation(ids, opts);
    if (!plan) { UI.toast('Kein sichtbarer Körper zum Ausrichten.', { icon: 'info' }); return { ok: false, changed: false }; }
    const { nodes, tris, box, cur, best } = plan;
    if (best.isCurrent && Math.abs(box.min.z) < 0.05) {
      const msg = best.overhangArea < 0.5
        ? 'Liegt schon optimal ohne Überhänge auf dem Druckbett.'
        : `Schon optimal ausgerichtet (${Units.fmtAreaU(best.overhangArea, best.overhangArea < 100 ? 1 : 0)} Überhang).`;
      UI.toast(msg, { icon: 'check' });
      return { ok: true, changed: false, before: cur.overhangArea, after: best.overhangArea, bedArea: best.bedArea, beforeBed: cur.bedArea };
    }
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const piv = box.getCenter(new THREE.Vector3());
    let qAdd;
    if (best.eulerHint) {
      qAdd = new THREE.Quaternion().setFromEuler(new THREE.Euler(best.eulerHint[0] * D2R, best.eulerHint[1] * D2R, best.eulerHint[2] * D2R, 'XYZ'));
    } else {
      const dVec = new THREE.Vector3(best.x, best.y, best.z).normalize();
      qAdd = dVec.z > 0.9999
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0, 'XYZ'))
        : new THREE.Quaternion().setFromUnitVectors(dVec, new THREE.Vector3(0, 0, -1));
    }
    const mAdd = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qAdd))
      .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
    const bRot = new THREE.Box3(), tmpV = new THREE.Vector3();
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      bRot.expandByPoint(tmpV.set(t.ax, t.ay, t.az).applyMatrix4(mAdd));
      bRot.expandByPoint(tmpV.set(t.bx, t.by, t.bz).applyMatrix4(mAdd));
      bRot.expandByPoint(tmpV.set(t.cx, t.cy, t.cz).applyMatrix4(mAdd));
    }
    const shift = bRot.isEmpty()
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(piv.x - (bRot.min.x + bRot.max.x) / 2, piv.y - (bRot.min.y + bRot.max.y) / 2, -bRot.min.z);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const fullModel = nodeIds.size >= [...Viewer.nodes.values()].filter((n) => n.obj.visible && !n.allBodiesHidden && n.role !== 'hole' && n.id !== '__dragprev').length;
    const rnd = (v) => Math.round(v * 1e4) / 1e4;
    const snapDeg = (d) => {
      for (const a of [0, 90, -90, 180, -180]) if (Math.abs(d - a) < 1e-3) return a;
      return rnd(d);
    };
    App.change('Für den Druck ausgerichtet', (doc) => {
      const vars = Model.vars(doc);
      Model.useVars(vars);
      for (const it of doc.items) {
        if (!it || it.hidden) continue;
        if (!fullModel) {
          const targetMatch = nodeIds.has(it.id) || nodeIds.has(App.mergedInto(it.id));
          let holeMatch = false;
          if (!targetMatch && it.role === 'hole') {
            const hb = typeof Actions !== 'undefined' && Actions.worldBox ? Actions.worldBox(it.id) : null;
            if (hb && hb.intersectsBox(box)) holeMatch = true;
          }
          if (!targetMatch && !holeMatch) continue;
        }
        it.t = it.t || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
        const tn = Model.tNumeric(it);
        const pNew = new THREE.Vector3(tn.x, tn.y, tn.z).applyMatrix4(mAdd).add(shift);
        const qOld = new THREE.Quaternion().setFromEuler(new THREE.Euler(tn.rx * D2R, tn.ry * D2R, tn.rz * D2R, 'XYZ'));
        const qNew = qAdd.clone().multiply(qOld);
        const eNew = new THREE.Euler().setFromQuaternion(qNew, 'XYZ');
        it.t.x = rnd(pNew.x); it.t.y = rnd(pNew.y); it.t.z = rnd(pNew.z);
        it.t.rx = snapDeg(eNew.x * R2D); it.t.ry = snapDeg(eNew.y * R2D); it.t.rz = snapDeg(eNew.z * R2D);
      }
    });
    const beforeTxt = Units.fmtAreaU(cur.overhangArea, cur.overhangArea < 100 ? 1 : 0);
    const afterTxt = Units.fmtAreaU(best.overhangArea, best.overhangArea < 100 ? 1 : 0);
    UI.toast(
      best.overhangArea < 0.5
        ? `Für den Druck ausgerichtet – keine Überhänge mehr (vorher ${beforeTxt}).`
        : `Für den Druck ausgerichtet: Überhang von ${beforeTxt} auf ${afterTxt} verringert.`,
      { icon: 'check', ms: 4200 },
    );
    return { ok: true, changed: true, before: cur.overhangArea, after: best.overhangArea, bedArea: best.bedArea, beforeBed: cur.bedArea };
  }
  function checks() {
    const out = [];
    const st = stats();
    if (!st) { out.push({ s: 'none', t: T('ampel.emptyTitle'), d: T('ampel.emptyDesc') }); return out; }
    const errs = App.errors.length;
    if (errs) out.push({ s: 'warn', t: errs === 1 ? T('ampel.errOne') : T('ampel.errMany', { n: errs }), d: App.errors[0].message });
    const pb = App.doc.settings && App.doc.settings.printBed;
    const fit = fitCheck(pb, st);
    if (!fit.fits) {
      out.push({ s: 'warn', t: T('ampel.bedWarn'), d: fit.summary, fit });
    }
    const wallNodes = printableWallNodes();
    const totalTris = wallNodes.reduce((s, n) => s + ((n.data && n.data.triangles && n.data.triangles.length) || 0) / 3, 0);
    if (wallNodes.length && totalTris <= 25000) {
      const nw = nozzleWallCheck();
      if (nw.warn) out.push({ s: 'warn', t: T('ampel.wallWarn'), d: nw.summary, nozzleWall: nw });
    }
    const bodies = App.doc.items.filter((x) => x.role !== 'hole' && !x.hidden).length;
    if (!out.length) out.push({ s: 'ok', t: `${Units.fmtLen(st.x, 2)} × ${Units.fmtLen(st.y, 2)} × ${Units.fmtLen(st.z, 2)} ${Units.label()}`, d: T('ampel.okDesc', { n: bodies }) });
    return out;
  }
  function updateAmpel() {
    const cs = checks();
    const worst = cs.some((c) => c.s === 'bad') ? 'bad' : cs.some((c) => c.s === 'warn') ? 'warn' : cs.some((c) => c.s === 'none') ? 'none' : 'ok';
    const el = $('#ampel'); el.className = 'ampel ' + worst;
    const main = cs.find((c) => c.s === worst) || cs[0];
    el.querySelector('.t').textContent = main ? main.t : '';
    el.setAttribute('data-tip', T('ampel.title'));
    const pb = App.doc && App.doc.settings && App.doc.settings.printBed;
    if (pb && pb.enabled) Viewer.setPrintBed({ ...pb, warn: !fitCheck(pb).fits });
  }
  function openAmpel(anchor) {
    const cs = checks();
    const box = h('div', { style: { display: 'grid', gap: '12px' } });
    box.append(h('div', { class: 'section-h' }, T('ampel.title')));
    const list = h('div', { class: 'check-list' });
    for (const c of cs) {
      const row = h('div', { class: 'check-row ' + c.s });
      const stI = h('span', { class: 'st' }); stI.innerHTML = icon(c.s === 'ok' ? 'check' : c.s === 'warn' ? 'warn' : c.s === 'none' ? 'info' : 'close');
      const infoCol = h('div', { class: 'grow' }, h('b', null, c.t), h('small', null, c.d));
      if (c.fit && c.fit.suggestion && c.fit.suggestion.canFit) {
        const rb = h('button', { type: 'button', class: 'btn', style: { marginTop: '6px' } }, T('ampel.rotateBtn'));
        rb.onclick = () => { UI.closePop(); applyRotationSuggestion(c.fit.suggestion); };
        infoCol.append(rb);
      }
      if (c.nozzleWall) {
        const wb = h('button', { type: 'button', class: 'btn', style: { marginTop: '6px' } }, T('ampel.showSpotsBtn'));
        wb.onclick = () => { UI.closePop(); Views.thin(true, { limit: c.nozzleWall.minWall }); };
        infoCol.append(wb);
      }
      row.append(stI, infoCol); list.append(row);
    }
    box.append(list);
    const ex = h('button', { type: 'button', class: 'btn primary' }); ex.innerHTML = icon('export') + esc(T('tool.export'));
    ex.onclick = () => { UI.closePop(); exportDialog(); };
    box.append(ex);
    UI.pop(anchor, box, { up: true, alignRight: true });
  }

  // ---------- Dateien bauen ----------
  function weld(vertices, triangles) {
    const map = new Map(); const pos = []; const remap = new Uint32Array(vertices.length / 3);
    for (let i = 0; i < vertices.length / 3; i++) {
      const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
      const k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
      let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(x, y, z); }
      remap[i] = j;
    }
    const tri = [];
    for (let i = 0; i < triangles.length; i += 3) { const a = remap[triangles[i]], b = remap[triangles[i + 1]], c = remap[triangles[i + 2]]; if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
    return { pos, tri };
  }
  // STL als Text (für Programme, die kein binäres STL lesen, und zum Nachsehen)
  function buildSTLText(objects, name) {
    const n = (x) => (Math.abs(x) < 5e-7 ? 0 : x).toExponential(6), out = ['solid ' + (name || 'Tracery').replace(/\s+/g, '_')];
    for (const o of objects) {
      const v = o.vertices, t = o.triangles;
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1;
        out.push(` facet normal ${n(nx / l)} ${n(ny / l)} ${n(nz / l)}`, '  outer loop', ...[a, b, c].map((k) => `   vertex ${n(v[k])} ${n(v[k + 1])} ${n(v[k + 2])}`), '  endloop', ' endfacet');
      }
    }
    out.push('endsolid ' + (name || 'Tracery').replace(/\s+/g, '_'));
    return new TextEncoder().encode(out.join('\n') + '\n');
  }
  function buildSTL(objects, name) {
    let count = 0; for (const o of objects) count += o.triangles.length / 3;
    const buf = new ArrayBuffer(84 + count * 50); const dv = new DataView(buf);
    const head = ('Tracery ' + name).slice(0, 79);
    for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
    dv.setUint32(80, count, true);
    let off = 84;
    for (const o of objects) {
      const v = o.vertices, t = o.triangles;
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true); off += 12;
        for (const k of [a, b, c]) { dv.setFloat32(off, v[k], true); dv.setFloat32(off + 4, v[k + 1], true); dv.setFloat32(off + 8, v[k + 2], true); off += 12; }
        dv.setUint16(off, 0, true); off += 2;
      }
    }
    return new Uint8Array(buf);
  }
  async function build3MF(objects, name) {
    const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const colors = [...new Set(objects.map((o) => (o.color || '#2f9e91').toUpperCase()))];
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
    parts.push(`<metadata name="Title">${xmlEsc(name)}</metadata>\n<metadata name="Application">Tracery</metadata>\n<resources>\n<basematerials id="1">\n`);
    for (const c of colors) parts.push(`<base name="${xmlEsc(c)}" displaycolor="${c}FF"/>\n`);
    parts.push('</basematerials>\n');
    let id = 2; const ids = [];
    for (const o of objects) {
      const w = weld(o.vertices, o.triangles);
      const s = [`<object id="${id}" type="model" pid="1" pindex="${colors.indexOf((o.color || '#2f9e91').toUpperCase())}" name="${xmlEsc(o.name || 'Teil')}"><mesh><vertices>`];
      for (let i = 0; i < w.pos.length; i += 3) s.push(`<vertex x="${+w.pos[i].toFixed(5)}" y="${+w.pos[i + 1].toFixed(5)}" z="${+w.pos[i + 2].toFixed(5)}"/>`);
      s.push('</vertices><triangles>');
      for (let i = 0; i < w.tri.length; i += 3) s.push(`<triangle v1="${w.tri[i]}" v2="${w.tri[i + 1]}" v3="${w.tri[i + 2]}"/>`);
      s.push('</triangles></mesh></object>\n');
      parts.push(s.join('')); ids.push(id); id++;
    }
    parts.push('</resources>\n<build>\n');
    for (const i of ids) parts.push(`<item objectid="${i}"/>\n`);
    parts.push('</build>\n</model>\n');
    const enc = new TextEncoder();
    const model = enc.encode(parts.join(''));
    const ct = enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
    const rels = enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
    return Zip.make([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels }, { name: '3D/3dmodel.model', data: model }]);
  }
  function parseHexSrgb(hex) {
    const s = String(hex || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) { const a = m[1]; return [parseInt(a[0] + a[0], 16) / 255, parseInt(a[1] + a[1], 16) / 255, parseInt(a[2] + a[2], 16) / 255]; }
    try {
      const c = new THREE.Color(s);
      if (THREE.SRGBColorSpace && c.getRGB) { const o = { r: 0, g: 0, b: 0 }; c.getRGB(o, THREE.SRGBColorSpace); return [o.r, o.g, o.b]; }
      return [c.r, c.g, c.b];
    } catch (_) { return [0.184, 0.62, 0.569]; }
  }
  function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function ensureNormals(vertices, triangles, normals) {
    if (normals && normals.length === vertices.length) return normals;
    const out = new Float32Array(vertices.length);
    for (let i = 0; i < triangles.length; i += 3) {
      const i0 = triangles[i] * 3, i1 = triangles[i + 1] * 3, i2 = triangles[i + 2] * 3;
      const ux = vertices[i1] - vertices[i0], uy = vertices[i1 + 1] - vertices[i0 + 1], uz = vertices[i1 + 2] - vertices[i0 + 2];
      const wx = vertices[i2] - vertices[i0], wy = vertices[i2 + 1] - vertices[i0 + 1], wz = vertices[i2 + 2] - vertices[i0 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const k of [i0, i1, i2]) { out[k] += nx; out[k + 1] += ny; out[k + 2] += nz; }
    }
    for (let i = 0; i < out.length; i += 3) {
      const l = Math.hypot(out[i], out[i + 1], out[i + 2]);
      if (l > 1e-12) { out[i] /= l; out[i + 1] /= l; out[i + 2] /= l; }
      else { out[i] = 0; out[i + 1] = 0; out[i + 2] = 1; }
    }
    return out;
  }
  function partAppearance(o) {
    const f = o.id ? Model.find(App.doc, o.id) : null;
    const it = f ? f.item : null;
    const matName = (it && it.mat) || (App.doc.settings && App.doc.settings.material) || null;
    const L = Viewer.lookOf(matName);
    const matCol = L.nat && !(it && it.colorSet) ? L.col : null;
    const hex = o.bodyColor || matCol || (it && it.color) || o.color || '#2f9e91';
    const srgb = parseHexSrgb(hex);
    const opacity = it && it.opacity != null && it.opacity < 1 ? Math.max(0.05, it.opacity) : (L.glass || 1);
    return {
      name: o.name || (it ? Model.label(it) : 'Teil'),
      matName: matName || 'Standard',
      hex: String(hex).toLowerCase(),
      srgb,
      linear: srgb.map(srgbToLinear),
      metalness: L.metal || 0,
      roughness: L.rough != null ? L.rough : 0.45,
      clearcoat: L.clear || 0,
      clearcoatRoughness: L.clearRough != null ? L.clearRough : 0.2,
      opacity,
      transparent: opacity < 0.999,
    };
  }
  function buildOBJ(objects, name) {
    const mtlFile = (name || 'Tracery') + '.mtl';
    const f4 = (v) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(4);
    const f5 = (v) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(5);
    const mats = new Map();
    const mtl = ['# Tracery MTL'];
    const matFor = (ap) => {
      const k = [ap.matName, ap.hex, ap.metalness, ap.roughness, ap.clearcoat, ap.opacity.toFixed(3)].join('|');
      if (mats.has(k)) return mats.get(k);
      const token = ap.matName.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Standard';
      const id = `mat_${mats.size + 1}_${token}`;
      mats.set(k, id);
      const [r, g, b] = ap.srgb;
      const ks = ap.metalness > 0.5
        ? [r * (1 - ap.roughness * 0.5), g * (1 - ap.roughness * 0.5), b * (1 - ap.roughness * 0.5)]
        : (() => { const s = Math.min(1, 0.04 + 0.35 * (1 - ap.roughness) + 0.3 * ap.clearcoat); return [s, s, s]; })();
      const ns = Math.round(Math.pow(1 - Math.min(0.98, ap.roughness), 2) * 900 + 10);
      mtl.push(
        `newmtl ${id}`,
        `Ka ${f4(r * 0.15)} ${f4(g * 0.15)} ${f4(b * 0.15)}`,
        `Kd ${f4(r)} ${f4(g)} ${f4(b)}`,
        `Ks ${f4(ks[0])} ${f4(ks[1])} ${f4(ks[2])}`,
        `Ns ${ns}`,
        `Pr ${f4(ap.roughness)}`,
        `Pm ${f4(ap.metalness)}`,
        `d ${f4(ap.opacity)}`,
        `illum ${ap.transparent ? 4 : 2}`
      );
      return id;
    };
    const obj = ['# Tracery OBJ (Millimeter)', `mtllib ${mtlFile}`];
    let vOff = 0;
    for (const o of objects) {
      const ap = partAppearance(o);
      const matId = matFor(ap);
      const objName = String(ap.name || 'Teil').replace(/[\r\n]+/g, ' ').trim() || 'Teil';
      obj.push(`o ${objName}`, `usemtl ${matId}`);
      const v = o.vertices, t = o.triangles, nrm = ensureNormals(v, t, o.normals);
      const vCount = (v.length / 3) | 0;
      for (let i = 0; i < vCount * 3; i += 3) obj.push(`v ${f5(v[i])} ${f5(v[i + 1])} ${f5(v[i + 2])}`);
      for (let i = 0; i < vCount * 3; i += 3) {
        let nx = nrm[i], ny = nrm[i + 1], nz = nrm[i + 2];
        const l = Math.hypot(nx, ny, nz);
        if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 0; nz = 1; }
        obj.push(`vn ${f5(nx)} ${f5(ny)} ${f5(nz)}`);
      }
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b = t[i + 1], c = t[i + 2];
        if (a >= vCount || b >= vCount || c >= vCount || a === b || b === c || a === c) continue;
        const ia = a + 1 + vOff, ib = b + 1 + vOff, ic = c + 1 + vOff;
        obj.push(`f ${ia}//${ia} ${ib}//${ib} ${ic}//${ic}`);
      }
      vOff += vCount;
    }
    const enc = new TextEncoder();
    return { obj: enc.encode(obj.join('\n') + '\n'), mtl: enc.encode(mtl.join('\n') + '\n') };
  }
  function buildGLB(objects, name) {
    const mats = new Map(), materials = [];
    let usesClearcoat = false;
    const matFor = (ap) => {
      const k = [ap.matName, ap.hex, ap.metalness, ap.roughness, ap.clearcoat, ap.opacity.toFixed(3)].join('|');
      if (mats.has(k)) return mats.get(k);
      const idx = materials.length;
      mats.set(k, idx);
      const mat = {
        name: ap.matName,
        pbrMetallicRoughness: {
          baseColorFactor: [+ap.linear[0].toFixed(6), +ap.linear[1].toFixed(6), +ap.linear[2].toFixed(6), +ap.opacity.toFixed(4)],
          metallicFactor: +ap.metalness.toFixed(4),
          roughnessFactor: +ap.roughness.toFixed(4),
        },
      };
      if (ap.transparent) { mat.alphaMode = 'BLEND'; mat.doubleSided = true; }
      if (ap.clearcoat > 0) {
        usesClearcoat = true;
        mat.extensions = { KHR_materials_clearcoat: { clearcoatFactor: +ap.clearcoat.toFixed(4), clearcoatRoughnessFactor: +ap.clearcoatRoughness.toFixed(4) } };
      }
      materials.push(mat);
      return idx;
    };
    const binParts = [], bufferViews = [], accessors = [], meshes = [], nodes = [];
    let binLen = 0;
    const pushBin = (typed, target) => {
      const pad = (4 - (binLen % 4)) % 4;
      if (pad) { binParts.push(new Uint8Array(pad)); binLen += pad; }
      const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
      const byteOffset = binLen;
      binParts.push(bytes); binLen += bytes.byteLength;
      const bv = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
      return bv;
    };
    for (const o of objects) {
      const ap = partAppearance(o);
      const matIdx = matFor(ap);
      const partName = String(ap.name || 'Teil').replace(/[\r\n]+/g, ' ').trim() || 'Teil';
      const v = o.vertices, t = o.triangles, nrm = ensureNormals(v, t, o.normals);
      const vCount = (v.length / 3) | 0;
      const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3);
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < vCount * 3; i += 3) {
        // mm (Z-oben) → Meter (Y-oben, Determinante +1)
        const px = v[i] * 0.001, py = v[i + 2] * 0.001, pz = -v[i + 1] * 0.001;
        pos[i] = px; pos[i + 1] = py; pos[i + 2] = pz;
        if (px < minX) minX = px; if (py < minY) minY = py; if (pz < minZ) minZ = pz;
        if (px > maxX) maxX = px; if (py > maxY) maxY = py; if (pz > maxZ) maxZ = pz;
        let nx = nrm[i], ny = nrm[i + 2], nz = -nrm[i + 1];
        const l = Math.hypot(nx, ny, nz);
        if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
        nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
      }
      if (!vCount) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0; }
      const tris = [];
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b = t[i + 1], c = t[i + 2];
        if (a < vCount && b < vCount && c < vCount && a !== b && b !== c && a !== c) tris.push(a, b, c);
      }
      const useU16 = vCount < 65535;
      const idxArr = useU16 ? new Uint16Array(tris) : new Uint32Array(tris);
      const posBv = pushBin(pos, 34962), norBv = pushBin(nor, 34962), idxBv = pushBin(idxArr, 34963);
      const posAcc = accessors.length;
      accessors.push({ bufferView: posBv, componentType: 5126, count: vCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
      const norAcc = accessors.length;
      accessors.push({ bufferView: norBv, componentType: 5126, count: vCount, type: 'VEC3' });
      const idxAcc = accessors.length;
      accessors.push({ bufferView: idxBv, componentType: useU16 ? 5123 : 5125, count: tris.length, type: 'SCALAR' });
      const meshIdx = meshes.length;
      meshes.push({ name: partName, primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc }, indices: idxAcc, material: matIdx, mode: 4 }] });
      nodes.push({ name: partName, mesh: meshIdx });
    }
    const binPad = (4 - (binLen % 4)) % 4;
    if (binPad) { binParts.push(new Uint8Array(binPad)); binLen += binPad; }
    const gltf = {
      asset: { version: '2.0', generator: 'Tracery' },
      scene: 0,
      scenes: [{ name: name || 'Tracery', nodes: nodes.map((_, i) => i) }],
      nodes, meshes, materials, accessors, bufferViews,
      buffers: [{ byteLength: binLen }],
    };
    if (usesClearcoat) gltf.extensionsUsed = ['KHR_materials_clearcoat'];
    const jsonRaw = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
    const jsonLen = jsonRaw.length + jsonPad;
    const total = 12 + 8 + jsonLen + 8 + binLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
    out.set(jsonRaw, 20);
    for (let i = 0; i < jsonPad; i++) out[20 + jsonRaw.length + i] = 0x20;
    const binOff = 20 + jsonLen;
    dv.setUint32(binOff, binLen, true); dv.setUint32(binOff + 4, 0x004e4942, true);
    let p = binOff + 8;
    for (const part of binParts) { out.set(part, p); p += part.byteLength; }
    return out;
  }
  function safeName(s) { return (String(s || 'Tracery').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Tracery').slice(0, 80); }
  async function save(filename, data) {
    let dl = null;
    try { dl = await window.claude?.use('downloads'); } catch (_) {}
    if (!dl) {
      // Außerhalb von Claude (lokal oder auf GitHub Pages): normaler Browser-Download
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename }); document.body.append(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
      UI.toast('Gespeichert: ' + filename, { icon: 'check' }); return true;
    }
    try { const r = await dl.save({ filename, data }); if (r && r.status === 'saved') UI.toast('Gespeichert: ' + filename, { icon: 'check' }); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return false;
      const msg = {
        rate_limited: 'Einen Moment – es ist schon ein Speichern-Fenster offen.',
        too_large: 'Die Datei ist zu groß zum Speichern.',
        rejected_extension: 'Dieses Dateiformat kann hier nicht gespeichert werden.',
        extension_not_enabled: 'Dieses Dateiformat kann hier nicht gespeichert werden.',
      }[code] || (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code) ? 'Speichern ist in dieser Ansicht nicht möglich.' : 'Speichern hat nicht geklappt. Versuch es noch einmal.');
      UI.toast(msg, { kind: 'bad' });
      return false;
    }
  }
  function exportDialog(preset = {}) {
    if (!App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) { UI.toast(T('dlg.export.nothing'), { icon: 'info' }); return; }
    const plates = Plates.candidates();
    const csysAll = typeof Datums !== 'undefined' ? Datums.csysList().filter((c) => c.csys) : [];
    const initCsys = preset.csysId && csysAll.some((c) => c.id === preset.csysId) ? preset.csysId : '';
    const initHc = holeComp();
    const opts = { step: true, iges: false, brep: false, stl: false, mf: false, obj: false, glb: false, dxf: false, plates: plates.map((p) => p.id), csysId: initCsys, holeComp: initHc };
    const body = h('div', { style: { display: 'grid', gap: '12px' } });
    body.append(h('p', null, T('dlg.export.intro')));
    const mk = (k, label, sub) => { const l = h('label', { class: 'check', style: { alignItems: 'flex-start' } }, h('input', { type: 'checkbox', id: 'ex-' + k, checked: opts[k] }), h('span', null, h('b', null, label), h('br'), h('small', { style: { color: 'var(--muted)' } }, sub))); l.querySelector('input').onchange = (e) => { opts[k] = e.target.checked; }; return l; };
    const stepRow = mk('step', T('dlg.export.step'), T('dlg.export.stepSub')); stepRow.setAttribute('data-help', 'exportStep');
    const igesRow = mk('iges', T('dlg.export.iges'), T('dlg.export.igesSub')); igesRow.setAttribute('data-help', 'exportIgesBrep');
    const brepRow = mk('brep', T('dlg.export.brep'), T('dlg.export.brepSub')); brepRow.setAttribute('data-help', 'exportIgesBrep');
    const objRow = mk('obj', T('dlg.export.obj'), T('dlg.export.objSub')); objRow.setAttribute('data-help', 'exportObjGlb');
    const glbRow = mk('glb', T('dlg.export.glb'), T('dlg.export.glbSub')); glbRow.setAttribute('data-help', 'exportObjGlb');
    body.append(stepRow, igesRow, brepRow, mk('stl', T('dlg.export.stl'), T('dlg.export.stlSub')), mk('mf', T('dlg.export.mf'), T('dlg.export.mfSub')), objRow, glbRow);
    // Was kommt in die Dateien? (IO-07)
    const selTops = exportSelection();
    if (selTops.length) { opts.onlySel = false; const l = mk('onlySel', T('dlg.export.onlySel', { n: selTops.length, unit: selTops.length === 1 ? T('dlg.export.partOne') : T('dlg.export.partMany') }), T('dlg.export.onlySelSub')); l.setAttribute('data-help', 'exportSelection'); body.append(l); }
    // Netz-Einstellungen (IO-08)
    opts.q = 1; opts.stlText = false;
    const qs = UI.selectField({ id: 'ex-q', label: T('dlg.export.meshQuality'), value: '1', options: [['3', T('dlg.export.qCoarse')], ['1', T('dlg.export.qNormal')], ['0.4', T('dlg.export.qFine')], ['0.15', T('dlg.export.qUltra')]], onChange: (v) => { opts.q = +v; } });
    qs.setAttribute('data-help', 'exportSettings');
    const st = UI.selectField({ id: 'ex-stlfmt', label: T('dlg.export.stlFmt'), value: 'bin', options: [['bin', T('dlg.export.stlBin')], ['txt', T('dlg.export.stlTxt')]], onChange: (v) => { opts.stlText = v === 'txt'; } });
    st.setAttribute('data-help', 'exportSettings');
    body.append(h('div', { class: 'fields' }, qs, st));
    // Loch-Ausgleich für den 3D-Druck (DR-02, nur STL & 3MF)
    const hcChoices = [0, 0.1, 0.2, 0.3, 0.4];
    if (initHc > 0 && !hcChoices.some((v) => Math.abs(v - initHc) < 1e-4)) hcChoices.push(initHc);
    hcChoices.sort((a, b) => a - b);
    const hcWrap = h('div', { 'data-help': 'holeComp' },
      UI.selectField({ id: 'ex-hole-comp', label: T('dlg.export.holeComp'), value: String(initHc), options: hcChoices.map((v) => [String(v), v === 0 ? T('panel.proj.holeCompOff') : `+${fmt(v, 2)} mm`]), onChange: (v) => { opts.holeComp = +v; } }),
      h('small', { style: { display: 'block', color: 'var(--muted)', marginTop: '4px' } }, T('dlg.export.holeCompHint')),
    );
    body.append(hcWrap);
    if (csysAll.length) {
      const cf = UI.selectField({ id: 'ex-csys', label: T('dlg.export.csys'), value: opts.csysId, options: [['', T('dlg.export.worldOrigin')], ...csysAll.map((c) => [c.id, c.name])], onChange: (v) => { opts.csysId = v; } });
      cf.setAttribute('data-help', 'datumCsys');
      body.append(cf);
    }
    { const l = mk('each', T('dlg.export.each'), T('dlg.export.eachSub')); l.setAttribute('data-help', 'exportSelection'); body.append(l); }
    // flache Teile (Carbon-Platten) als 2D-Kontur für die Fräse oder den Laser
    if (plates.length) {
      const d = mk('dxf', T('dlg.export.dxf'), T('dlg.export.dxfSub'));
      d.setAttribute('data-help', 'plateDxf');
      const pl = h('div', { class: 'dxf-plates', style: { display: 'grid', gap: '4px', margin: '-4px 0 0 28px' } });
      for (const p of plates) { const l = h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-plate': p.id, checked: true }), `${p.name} · ${Units.fmtLenU(p.t)}`); l.querySelector('input').onchange = (e) => { opts.plates = e.target.checked ? [...new Set([...opts.plates, p.id])] : opts.plates.filter((x) => x !== p.id); }; pl.append(l); }
      pl.hidden = !opts.dxf; d.querySelector('input').addEventListener('change', (e) => { pl.hidden = !e.target.checked; });
      body.append(d, pl);
    }
    const cs = checks().filter((c) => c.s === 'warn' || c.s === 'bad');
    if (cs.length) {
      const warnBox = h('div', { class: 'hint-box warn', id: 'ex-warn-box' }, h('div', { html: T('dlg.export.warnHtml', { t: esc(cs[0].t), d: esc(cs[0].d) }) }));
      if (cs[0].fit && cs[0].fit.suggestion && cs[0].fit.suggestion.canFit) {
        const rb = h('button', { type: 'button', class: 'btn', id: 'ex-bed-rotate', style: { marginTop: '6px' } }, T('ampel.rotateBtn'));
        rb.onclick = () => { UI.closeModal(); applyRotationSuggestion(cs[0].fit.suggestion); };
        warnBox.append(rb);
      }
      if (cs[0].nozzleWall) {
        const wb = h('button', { type: 'button', class: 'btn', id: 'ex-nozzle-show', style: { marginTop: '6px' } }, T('ampel.showSpotsBtn'));
        wb.onclick = () => { UI.closeModal(); Views.thin(true, { limit: cs[0].nozzleWall.minWall }); };
        warnBox.append(wb);
      }
      body.append(warnBox);
    }
    UI.modal({ title: T('dlg.export.title'), body, actions: [{ label: T('common.cancel') }, { label: T('dlg.export.saveZip'), primary: true, run: () => { runExport(opts); } }] });
  }
  // Bild speichern (PNG) – in Bildschirm- oder Druckgröße, auf Wunsch mit durchsichtigem Hintergrund
  function imageDialog() {
    const vp = $('#viewport').getBoundingClientRect();
    const sizes = [['screen', T('dlg.image.screen', { w: Math.round(vp.width * 2), h: Math.round(vp.height * 2) })], ['1920', T('dlg.image.fhd')], ['3840', T('dlg.image.uhd')], ['sq', T('dlg.image.sq')]];
    const st = { size: 'screen', transparent: false };
    const body = h('div', { style: { display: 'grid', gap: '12px', minWidth: 'min(380px, 80vw)' } });
    body.append(UI.selectField({ id: 'img-size', label: T('common.size'), value: st.size, options: sizes, onChange: (v) => { st.size = v; } }));
    const t = h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'img-transparent' }), T('dlg.image.transparent'));
    t.querySelector('input').onchange = (e) => { st.transparent = e.target.checked; };
    body.append(t, h('div', { class: 'hint-box' }, T('dlg.image.hint')));
    UI.modal({ title: T('dlg.image.title'), body, actions: [{ label: T('common.cancel') }, { label: T('dlg.image.saveBtn'), primary: true, run: () => { saveImage(st); } }] });
  }
  function imageSize(size) {
    const vp = $('#viewport').getBoundingClientRect();
    if (size === '1920') return [1920, 1080]; if (size === '3840') return [3840, 2160]; if (size === 'sq') return [2000, 2000];
    return [Math.max(64, Math.round(vp.width * 2)), Math.max(64, Math.round(vp.height * 2))];
  }
  async function saveImage(st) {
    const [w, hh] = imageSize(st.size);
    const url = Viewer.renderImage(w, hh, { transparent: st.transparent });
    const blob = await (await fetch(url)).blob();
    await save(safeName(App.doc.name) + '.png', blob);
    return { w, h: hh, bytes: blob.size };
  }
  // gewählte Teile der obersten Ebene; verrechnete Teile zählen zu ihrem Ziel
  function exportSelection() {
    const out = new Set();
    for (const id of App.sel) { const t = Model.topOf(App.doc, id); if (!t || t.role === 'hole') continue; out.add(App.mergedInto(t.id) || t.id); }
    return [...out];
  }
  // ---------- 2D: Skizzen-Elemente als DXF oder SVG (SK-23, IO-05) ----------
  function segs2D(ents) {
    const out = [];
    for (const e of ents || []) { if (e.con || e.type === 'point') continue; for (const s of SK.segsOf(e)) out.push(s); }
    return out;
  }
  function arcGeom(s) {
    const ai = SK.arcInfo(s.a, s.m, s.b); if (!ai) return null;
    const ang = (p) => Math.atan2(p[1] - ai.c[1], p[0] - ai.c[0]);
    const ccw = (s.m[0] - s.a[0]) * (s.b[1] - s.a[1]) - (s.m[1] - s.a[1]) * (s.b[0] - s.a[0]) > 0;   // Mitte rechts vom Weg Anfang→Ende = gegen den Uhrzeigersinn
    return { c: ai.c, r: ai.r, a0: ccw ? ang(s.a) : ang(s.b), a1: ccw ? ang(s.b) : ang(s.a), ccw };
  }
  function entsToDXF(ents) {
    const out = [], P = (...a) => out.push(...a.map(String));
    const n = (v) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(4), deg = (a) => (((((a * 180) / Math.PI) % 360) + 360) % 360).toFixed(4);
    P(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 1, 0, 'LAYER', 2, 'KONTUR', 70, 0, 62, 7, 6, 'CONTINUOUS', 0, 'ENDTAB', 0, 'ENDSEC');
    P(0, 'SECTION', 2, 'ENTITIES');
    let count = 0;
    const line = (a, b) => { P(0, 'LINE', 8, 'KONTUR', 10, n(a[0]), 20, n(a[1]), 30, 0, 11, n(b[0]), 21, n(b[1]), 31, 0); };
    for (const s of segs2D(ents)) {
      count++;
      if (s.t === 'line') { line(s.a, s.b); continue; }
      if (s.t === 'circle') { P(0, 'CIRCLE', 8, 'KONTUR', 10, n(s.c[0]), 20, n(s.c[1]), 30, 0, 40, n(s.r)); continue; }
      if (s.t === 'arc') { const g = arcGeom(s); if (g) { P(0, 'ARC', 8, 'KONTUR', 10, n(g.c[0]), 20, n(g.c[1]), 30, 0, 40, n(g.r), 50, deg(g.a0), 51, deg(g.a1)); continue; } }
      const pts = SK.segPoints(s); for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1]);
    }
    P(0, 'ENDSEC', 0, 'EOF');
    return { text: out.join('\r\n') + '\r\n', count };
  }
  function entsToSVG(ents, title = 'Tracery') {
    const ss = segs2D(ents); if (!ss.length) return { text: '', count: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of ss) for (const p of SK.segPoints(s)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const m = 1, f = (v) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(4).replace(/\.?0+$/, '');
    const W = x1 - x0 + 2 * m, H = y1 - y0 + 2 * m;
    // y nach oben wie in der Skizze: Punkte gespiegelt eintragen
    const X = (v) => f(v - x0 + m), Y = (v) => f(y1 + m - v);
    const parts = [];
    for (const s of ss) {
      if (s.t === 'line') parts.push(`<path d="M${X(s.a[0])} ${Y(s.a[1])}L${X(s.b[0])} ${Y(s.b[1])}"/>`);
      else if (s.t === 'circle') parts.push(`<circle cx="${X(s.c[0])}" cy="${Y(s.c[1])}" r="${f(s.r)}"/>`);
      else if (s.t === 'arc' && arcGeom(s)) {
        const g = arcGeom(s); let sw = g.a1 - g.a0; while (sw < 0) sw += 2 * Math.PI;
        // gespiegelt: gegen den Uhrzeigersinn in der Skizze = im Uhrzeigersinn im SVG
        const [a, b] = g.ccw ? [s.a, s.b] : [s.b, s.a];
        parts.push(`<path d="M${X(a[0])} ${Y(a[1])}A${f(g.r)} ${f(g.r)} 0 ${sw > Math.PI ? 1 : 0} 0 ${X(b[0])} ${Y(b[1])}"/>`);
      } else { const pts = SK.segPoints(s); parts.push(`<path d="M${pts.map((p) => X(p[0]) + ' ' + Y(p[1])).join('L')}"/>`); }
    }
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">\n<title>${esc(title)}</title>\n<g fill="none" stroke="#000" stroke-width="0.1">\n${parts.join('\n')}\n</g>\n</svg>\n`;
    return { text, count: ss.length };
  }
  let last2D = null;
  async function save2D(ents, name, kind) {
    const r = kind === 'svg' ? entsToSVG(ents, name) : entsToDXF(ents);
    if (!r.count) { UI.toast('Da ist nichts zu speichern – Hilfslinien und Punkte zählen nicht.', { icon: 'info' }); return false; }
    last2D = { kind, text: r.text, count: r.count };
    return save(safeName(name) + (kind === 'svg' ? '.svg' : '.dxf'), new Blob([r.text], { type: kind === 'svg' ? 'image/svg+xml' : 'application/dxf' }));
  }
  // ebene Fläche eines Körpers in Originalgröße (Blick senkrecht darauf)
  async function faceTo2D(face, kind) {
    const r = App.results.get(face.id); if (!r || !face.info || face.info.t !== 'PLANE') return false;
    let loops; try { loops = await Kernel.call('faceLoops', { key: r.key, faceIdx: face.idx }); } catch (e) { UI.toast('Die Fläche konnte ich nicht lesen: ' + e.message, { kind: 'bad' }); return false; }
    const ents = SK.faceLoopsToEnts(Actions.faceFrame(face.info), loops);
    const it = (Model.find(App.doc, face.id) || { item: {} }).item;
    return save2D(ents, `${Model.label(it)} – Fläche`, kind);
  }
  // ---------- Drehteller-Video (AN-14): das Modell dreht sich einmal um sich selbst, als WebM ----------
  let lastVideo = null;
  function videoType() {
    if (!Viewer.canvas || typeof Viewer.canvas.captureStream !== 'function') return null;
    for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; } catch (_) {} }
    return null;
  }
  function turntableDialog() {
    const st = { sec: 6 };
    const body = h('div', { style: { display: 'grid', gap: '12px', minWidth: 'min(380px, 80vw)' } });
    body.append(UI.selectField({ id: 'tt-sec', label: T('dlg.tt.length'), value: '6', options: [['4', T('dlg.tt.sec', { n: 4 })], ['6', T('dlg.tt.sec', { n: 6 })], ['10', T('dlg.tt.sec', { n: 10 })], ['15', T('dlg.tt.sec', { n: 15 })]], onChange: (v) => { st.sec = +v; } }));
    body.append(h('div', { class: 'hint-box' }, T('dlg.tt.hint')));
    if (!videoType()) body.append(h('div', { class: 'err-box' }, T('dlg.tt.unsupported')));
    UI.modal({ title: T('dlg.tt.title'), body, actions: [{ label: T('common.cancel') }, { label: T('dlg.tt.recordBtn'), primary: true, run: () => { turntable({ seconds: st.sec }); } }] });
  }
  async function turntable({ seconds = 6, fps = 30, save: doSave = true } = {}) {
    const type = videoType(); if (!type) { UI.toast(T('dlg.tt.unsupported'), { kind: 'bad' }); return null; }
    const cv = Viewer.canvas, stream = cv.captureStream(fps), chunks = [];
    const track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const cam0 = Viewer.saveCamera(), tg = Viewer.controls.target.clone();
    const dx0 = cam0.p.x - tg.x, dy0 = cam0.p.y - tg.y;
    App.clearSelection(); Handles.clear();
    const tst = UI.toast(T('dlg.tt.recording'), { icon: 'play', ms: seconds * 1000 + 3000 });
    const done = new Promise((res) => { rec.onstop = res; rec.onerror = res; });
    rec.start(250);
    const dur = Math.max(100, seconds * 1000);
    const stepMs = Math.max(16, Math.round(1000 / Math.max(1, fps)));
    const minFrames = Math.max(12, Math.min(30, Math.round(seconds * 10)));
    const t0 = performance.now();
    await new Promise((res) => {
      let frames = 0, raf = 0, timer = 0;
      const step = () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        const k = frames === 0 ? 0 : Math.min(1, Math.max(0, (performance.now() - t0) / dur), frames / minFrames);
        const a = k * 2 * Math.PI, cs = Math.cos(a), sn = Math.sin(a);
        const c = Viewer.camera; c.position.set(tg.x + dx0 * cs - dy0 * sn, tg.y + dx0 * sn + dy0 * cs, cam0.p.z); c.lookAt(tg); Viewer.controls.update(); Viewer.renderNow();
        try { if (track && typeof track.requestFrame === 'function') track.requestFrame(); } catch (_) {}
        frames++;
        if (k < 1) { raf = requestAnimationFrame(step); timer = setTimeout(step, stepMs + 15); } else res();
      };
      step();
    });
    await new Promise((r) => setTimeout(r, 120));
    if (rec.state !== 'inactive') rec.stop();
    await done; stream.getTracks().forEach((x) => x.stop());
    Viewer.restoreCamera(cam0, false);
    tst.remove();
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    lastVideo = { size: blob.size, type: blob.type, seconds };
    if (doSave) await save(safeName(App.doc.name) + (blob.type.includes('mp4') ? '.mp4' : '.webm'), blob);
    return blob;
  }
  let lastExport = null, lastTris = 0, lastHoleComp = null;
  async function runExport(opts) {
    if (!opts.stl && !opts.mf && !opts.obj && !opts.glb && !opts.step && !opts.iges && !opts.brep && !(opts.dxf && opts.plates.length)) { UI.toast(T('dlg.export.needFmt'), { kind: 'bad' }); return; }
    const tst = UI.toast(T('dlg.export.building'), { icon: 'export', ms: 20000 });
    try {
      const scene = Model.kernelScene(App.doc);
      const only = opts.onlySel ? exportSelection() : null;
      const originMat = opts.csysId && typeof Datums !== 'undefined' ? Datums.csysExportMatrix(opts.csysId) : null;
      const csysObj = opts.csysId && typeof Datums !== 'undefined' ? Datums.findCsys(opts.csysId) : null;
      const hc = opts.holeComp != null ? Math.max(0, Math.min(1, Number(opts.holeComp) || 0)) : holeComp();
      const name = safeName(App.doc.name);
      const files = [];
      const mapObjs = (rawObjs) => (only ? rawObjs.filter((o) => only.includes(o.id)) : rawObjs).map((o) => {
        const f = Model.find(App.doc, o.id);
        return f ? { ...o, name: o.name || Model.label(f.item), color: o.bodyColor || o.color || f.item.color } : o;
      });
      let printObjs = null, visObjs = null;
      lastHoleComp = { mm: hc, holes: 0 };
      if (opts.stl || opts.mf) {
        const resPrint = await Kernel.call('exportMeshes', { scene, fine: true, q: opts.q || 1, originMat, holeComp: hc });
        lastTris = resPrint.objects.reduce((s, o) => s + o.triangles.length / 3, 0);
        lastHoleComp = { mm: hc, holes: resPrint.compensatedHoles || 0 };
        printObjs = mapObjs(resPrint.objects);
        if (!printObjs.length) throw new Error('Es gibt keinen Körper zum Speichern.');
        if (hc === 0) visObjs = printObjs;
      }
      if (opts.obj || opts.glb) {
        if (!visObjs) {
          const resVis = await Kernel.call('exportMeshes', { scene, fine: true, q: opts.q || 1, originMat, holeComp: 0 });
          if (!printObjs) lastTris = resVis.objects.reduce((s, o) => s + o.triangles.length / 3, 0);
          visObjs = mapObjs(resVis.objects);
          if (!visObjs.length) throw new Error('Es gibt keinen Körper zum Speichern.');
        }
      }
      const STL = opts.stlText ? buildSTLText : buildSTL;
      if (opts.stl) files.push({ name: name + '.stl', data: STL(printObjs, name) });
      if (opts.mf) files.push({ name: name + '.3mf', data: await build3MF(printObjs, name) });
      if (opts.obj) { const r = buildOBJ(visObjs, name); files.push({ name: name + '.obj', data: r.obj }, { name: name + '.mtl', data: r.mtl }); }
      if (opts.glb) files.push({ name: name + '.glb', data: buildGLB(visObjs, name) });
      if (opts.each) {
        const eachList = printObjs || visObjs || [];
        if (eachList.length) {
          const used = new Map();
          for (let i = 0; i < eachList.length; i++) {
            const po = (printObjs && printObjs[i]) || eachList[i];
            const vo = (visObjs && visObjs[i]) || eachList[i];
            const f = Model.find(App.doc, (po || vo).id);
            let base = safeName((po || vo).name || (f ? Model.label(f.item) : 'Körper'));
            const n = (used.get(base) || 0) + 1; used.set(base, n); if (n > 1) base += '-' + n;
            if (opts.stl) files.push({ name: 'Einzeln/' + base + '.stl', data: STL([po], base) });
            if (opts.mf) files.push({ name: 'Einzeln/' + base + '.3mf', data: await build3MF([po], base) });
            if (opts.obj) { const r = buildOBJ([vo], base); files.push({ name: 'Einzeln/' + base + '.obj', data: r.obj }, { name: 'Einzeln/' + base + '.mtl', data: r.mtl }); }
            if (opts.glb) files.push({ name: 'Einzeln/' + base + '.glb', data: buildGLB([vo], base) });
          }
        }
      }
      if (opts.step) { const r = await Kernel.call('exportSTEP', { scene, only, originMat }); files.push({ name: name + '.step', data: new Uint8Array(r.data) }); }
      if (opts.iges) { const r = await Kernel.call('exportIGES', { scene, only, originMat }); files.push({ name: name + '.igs', data: new Uint8Array(r.data) }); }
      if (opts.brep) { const r = await Kernel.call('exportBREP', { scene, only, originMat }); files.push({ name: name + '.brep', data: new Uint8Array(r.data) }); }
      if (opts.dxf) for (const id of opts.plates) { const f = await Plates.file(id); if (f && f.count) files.push({ name: 'DXF/' + f.name, data: f.data }); }
      files.push({ name: 'LIESMICH.txt', data: new TextEncoder().encode(`${App.doc.name}\nErstellt mit Tracery am ${new Date().toLocaleString('de-DE')}\n${csysObj ? `Nullpunkt: ${csysObj.name}\n` : ''}${hc > 0 ? `Loch-Ausgleich (STL/3MF): +${fmt(hc, 2)} mm Durchmesser\n` : ''}\nSTEP: exakte Geometrie mit Teilenamen, Farben und Gruppen-Struktur (XCAF) für andere CAD-Programme\nIGES / BREP: exakte Geometrie für andere CAD-Programme (BREP = OpenCascade-Format)\nSTL / 3MF: Dreiecksnetz (Millimeter)\nOBJ / MTL: Dreiecksnetz mit Farben (Millimeter)\nGLB: glTF 2.0 binär mit Werkstoff-Aussehen und Teilenamen (Meter)\n` + (opts.dxf ? 'DXF: Draufsicht jeder Platte in Originalgröße (Millimeter, Ebene KONTUR) – Dicke steht im Dateinamen\n' : '')) });
      lastExport = files.map((f) => f.name);
      const zip = await Zip.make(files);
      tst.remove();
      await save(name + '.zip', new Blob([zip]));
      try { Panels.firstStepDone('saved'); } catch (_) {}
    } catch (e) { tst.remove(); UI.toast('Export hat nicht geklappt: ' + e.message, { kind: 'bad' }); }
  }
  function init() {
    App.on('results', () => { wallCache = null; updateAmpel(); });
    App.on('doc', debounce(() => { wallCache = null; updateAmpel(); }, 200));
    $('#ampel').addEventListener('click', (e) => openAmpel(e.currentTarget));
  }
  return { PRINTERS, findPrinter, setPrinter, nozzle, setNozzle, printFit, setPrintFit, PRINT_FITS: typeof PRINT_FITS !== 'undefined' ? PRINT_FITS : [], printFitMm: typeof printFitMm === 'function' ? printFitMm : () => 0, holeComp, setHoleComp, fitCheck, applyRotationSuggestion, nozzleWallCheck, bestPrintOrientation, orientForPrint, get lastHoleComp() { return lastHoleComp; }, turntable, turntableDialog, get lastVideo() { return lastVideo; }, get lastTris() { return lastTris; }, buildSTL, buildSTLText, build3MF, buildOBJ, buildGLB, entsToDXF, entsToSVG, save2D, faceTo2D, get last2D() { return last2D; }, exportSelection, get lastExport() { return lastExport; }, runExport, init, stats, checks, exportDialog, imageDialog, saveImage, imageSize, save, safeName, updateAmpel };
})();

// ---------- ZIP (mit Kompression, wenn der Browser sie kann) ----------
const Zip = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function deflate(data) {
    if (typeof CompressionStream === 'undefined') return null;
    try { const cs = new CompressionStream('deflate-raw'); return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer()); } catch (_) { return null; }
  }
  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann komprimierte ZIP-Dateien nicht entpacken.');
    const ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function read(buf, filter) {
    const bytes = buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder('utf-8'), out = new Map();
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50 && i + 22 + dv.getUint16(i + 20, true) <= bytes.length) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Das ist keine gültige 3MF-/ZIP-Datei.');
    const entries = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    let p = cdOff;
    for (let i = 0; i < entries; i++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Die 3MF-/ZIP-Datei ist beschädigt.');
      const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true), uncompSize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/').replace(/^\/+/, '');
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/') || (filter && !filter(name))) continue;
      if (localOff + 30 > bytes.length || dv.getUint32(localOff, true) !== 0x04034b50) throw new Error('Die 3MF-/ZIP-Datei ist beschädigt.');
      const dataOff = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      if (dataOff + compSize > bytes.length) throw new Error('Die 3MF-/ZIP-Datei ist unvollständig.');
      const raw = bytes.subarray(dataOff, dataOff + compSize);
      if (uncompSize === 0 && compSize === 0) out.set(name, new Uint8Array(0));
      else if (method === 0) out.set(name, raw.slice());
      else if (method === 8) out.set(name, await inflate(raw));
      else throw new Error('Nicht unterstützte ZIP-Kompression (' + method + ').');
    }
    return out;
  }
  async function make(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
    const now = new Date(); const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff; const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    for (const f of files) {
      const name = enc.encode(f.name); const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const crc = crc32(data);
      let comp = data.length > 256 ? await deflate(data) : null; let method = 8;
      if (!comp || comp.length >= data.length) { comp = data; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, comp);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + comp.length;
    }
    const cdLen = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const total = all.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(total); let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }
  return { make, read, crc32 };
})();

