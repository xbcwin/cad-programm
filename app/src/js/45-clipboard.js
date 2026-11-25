// ================= Zwischenablage: Körper mit Schritten zwischen Projekten / Tabs kopieren (BE-13) =================
const Clipboard = (() => {
  const CLIP_KEY = 'tracery.bodyClip';
  const MAX_INLINE_BYTES = 1500000;
  const RESERVED_IDS = new Set(['wenn', 'if', 'runden', 'round', 'aufrunden', 'ceil', 'abrunden', 'floor', 'tabelle', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'pow', 'log', 'exp', 'mm', 'cm', 'm', 'in', 'zoll']);
  const SKIP_P_KEYS = new Set(['lib', 'op', 'pt', 'plane', 'extent', 'dir', 'wallSide', 'shape', 'profName', 'target', 'pivot', 'mode', 'side', 'face', 'toFace', 'axisId', 'axis3d', 'axis', 'wrapId', 'blobId', 'fmt', 'data', 'stepEntity', 'stepMat', 'sketch', 'sketches', 'path', 'rail', 'rail2', 'prof', 'path3d', 'features', 'datumId', 'faceRef', 'bind', 'places', 'skip', 'assembly', 'uniform', 'flip', 'ruled', 'head', 'fit', 'size', 'tipAngle', 'kind', 'seal', 'flange', 'pat', 'nut', 'form', 'conn', 'tol', 'align', 'sel']);

  let memClip = null;
  let pendingCopy = null;
  let lastPasteClipId = null;
  let pasteCount = 0;

  function writeClip(payload) {
    memClip = payload;
    try {
      storageSet(CLIP_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      try {
        const slim = deepClone(payload);
        for (const b of slim.bundles || []) {
          for (const it of b.items || []) {
            Model.walk([it], (x) => {
              if (x && x.kind === 'import' && x.p && x.p.blobId && x.p.data) delete x.p.data;
            });
          }
        }
        memClip = slim;
        return storageSet(CLIP_KEY, JSON.stringify(slim));
      } catch (__) {
        return false;
      }
    }
  }

  function readClip() {
    let ls = null;
    try {
      const raw = storageGet(CLIP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.format === 'tracery-clip' && Array.isArray(parsed.bundles)) ls = parsed;
      }
    } catch (_) {}
    if (memClip && ls) return (ls.ts || 0) >= (memClip.ts || 0) ? ls : memClip;
    return ls || memClip || null;
  }

  function hasData() {
    const c = readClip();
    return !!(c && Array.isArray(c.bundles) && c.bundles.length);
  }

  function clear() {
    memClip = null;
    lastPasteClipId = null;
    pasteCount = 0;
    storageDel(CLIP_KEY);
  }

  function whenReady() {
    return pendingCopy ? pendingCopy.catch(() => null) : Promise.resolve(readClip());
  }

  // ---------- Ausdrücke, Parameter, Tabellen & Schriften sammeln ----------
  function extractExprTokens(str, idsOut, tblsOut) {
    if (typeof str !== 'string' || !str.trim()) return;
    const tblRe = /tabelle\s*\(\s*["']?([^"';)]+)["']?\s*;/gi;
    let tm;
    while ((tm = tblRe.exec(str))) tblsOut.add(tm[1].trim().toLowerCase());
    const stripped = str.replace(/"[^"]*"|'[^']*'/g, ' ');
    const idRe = /[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*/g;
    let m;
    while ((m = idRe.exec(stripped))) {
      const low = m[0].toLowerCase();
      if (!RESERVED_IDS.has(low)) idsOut.add(low);
    }
  }

  function collectSketchRefs(sk, idsOut, tblsOut, fontsOut) {
    if (!sk) return;
    for (const d of sk.dims || []) if (d && typeof d.v === 'string') extractExprTokens(d.v, idsOut, tblsOut);
    for (const e of sk.ents || []) if (e && e.type === 'text' && e.font) fontsOut.add(e.font);
  }

  function collectItemRefs(it, idsOut, tblsOut, fontsOut) {
    if (!it || typeof it !== 'object') return;
    if (it.p) {
      for (const k of Object.keys(it.p)) {
        if (!SKIP_P_KEYS.has(k) && typeof it.p[k] === 'string') extractExprTokens(it.p[k], idsOut, tblsOut);
      }
      if (it.p.pt && it.p.op === 'pattern') {
        for (const k of ['nx', 'ny', 'dx', 'dy', 'n', 'ang', 'cx', 'cy', 'cz', 'd', 'off']) {
          if (typeof it.p[k] === 'string') extractExprTokens(it.p[k], idsOut, tblsOut);
        }
      }
      collectSketchRefs(it.p.sketch, idsOut, tblsOut, fontsOut);
      if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) collectSketchRefs(s, idsOut, tblsOut, fontsOut);
      collectSketchRefs(it.p.path, idsOut, tblsOut, fontsOut);
      collectSketchRefs(it.p.rail, idsOut, tblsOut, fontsOut);
      collectSketchRefs(it.p.rail2, idsOut, tblsOut, fontsOut);
      collectSketchRefs(it.p.prof, idsOut, tblsOut, fontsOut);
      if (it.p.path3d) {
        for (const pt of it.p.path3d.pts || []) for (const c of pt || []) if (typeof c === 'string') extractExprTokens(c, idsOut, tblsOut);
        for (const r of it.p.path3d.rules || []) if (r && typeof r.len === 'string') extractExprTokens(r.len, idsOut, tblsOut);
      }
    }
    if (it.t) {
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) if (typeof it.t[k] === 'string') extractExprTokens(it.t[k], idsOut, tblsOut);
    }
    for (const f of it.finishes || []) {
      if (typeof f.r === 'string') extractExprTokens(f.r, idsOut, tblsOut);
      if (typeof f.r2 === 'string') extractExprTokens(f.r2, idsOut, tblsOut);
      if (typeof f.a === 'string') extractExprTokens(f.a, idsOut, tblsOut);
      if (typeof f.d1 === 'string') extractExprTokens(f.d1, idsOut, tblsOut);
      if (typeof f.d2 === 'string') extractExprTokens(f.d2, idsOut, tblsOut);
      if (typeof f.d3 === 'string') extractExprTokens(f.d3, idsOut, tblsOut);
    }
    if (typeof it.massG === 'string') extractExprTokens(it.massG, idsOut, tblsOut);
    if (it.userPart && Array.isArray(it.userPart.params)) {
      for (const up of it.userPart.params) if (up && typeof up.expr === 'string') extractExprTokens(up.expr, idsOut, tblsOut);
    }
    if (Array.isArray(it.children)) for (const c of it.children) collectItemRefs(c, idsOut, tblsOut, fontsOut);
  }

  function escapeRe(s) {
    return String(s).replace(/[$^.*+?()[\]{}|\\]/g, '\\$&');
  }

  function renameInExpr(expr, oldName, newName) {
    if (typeof expr !== 'string' || !oldName || oldName === newName) return expr;
    const re = new RegExp('(^|[^A-Za-zÄÖÜäöüß_0-9])' + escapeRe(oldName) + '(?![A-Za-zÄÖÜäöüß_0-9])', 'gi');
    return expr.replace(re, (_, pre) => pre + newName);
  }

  function renameInItem(it, oldName, newName) {
    if (!it || typeof it !== 'object' || !oldName || oldName === newName) return;
    if (it.p) {
      for (const k of Object.keys(it.p)) {
        if (!SKIP_P_KEYS.has(k) && typeof it.p[k] === 'string') it.p[k] = renameInExpr(it.p[k], oldName, newName);
      }
      if (it.p.pt && it.p.op === 'pattern') {
        for (const k of ['nx', 'ny', 'dx', 'dy', 'n', 'ang', 'cx', 'cy', 'cz', 'd', 'off']) {
          if (typeof it.p[k] === 'string') it.p[k] = renameInExpr(it.p[k], oldName, newName);
        }
      }
      const fixSk = (sk) => { if (sk && Array.isArray(sk.dims)) for (const d of sk.dims) if (d && typeof d.v === 'string') d.v = renameInExpr(d.v, oldName, newName); };
      fixSk(it.p.sketch);
      if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) fixSk(s);
      fixSk(it.p.path); fixSk(it.p.rail); fixSk(it.p.rail2); fixSk(it.p.prof);
      if (it.p.path3d) {
        for (const pt of it.p.path3d.pts || []) for (let i = 0; i < (pt || []).length; i++) if (typeof pt[i] === 'string') pt[i] = renameInExpr(pt[i], oldName, newName);
        for (const r of it.p.path3d.rules || []) if (r && typeof r.len === 'string') r.len = renameInExpr(r.len, oldName, newName);
      }
    }
    if (it.t) {
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) if (typeof it.t[k] === 'string') it.t[k] = renameInExpr(it.t[k], oldName, newName);
    }
    for (const f of it.finishes || []) {
      if (typeof f.r === 'string') f.r = renameInExpr(f.r, oldName, newName);
      if (typeof f.r2 === 'string') f.r2 = renameInExpr(f.r2, oldName, newName);
      if (typeof f.a === 'string') f.a = renameInExpr(f.a, oldName, newName);
      if (typeof f.d1 === 'string') f.d1 = renameInExpr(f.d1, oldName, newName);
      if (typeof f.d2 === 'string') f.d2 = renameInExpr(f.d2, oldName, newName);
      if (typeof f.d3 === 'string') f.d3 = renameInExpr(f.d3, oldName, newName);
    }
    if (typeof it.massG === 'string') it.massG = renameInExpr(it.massG, oldName, newName);
    if (Array.isArray(it.children)) for (const c of it.children) renameInItem(c, oldName, newName);
  }

  // ---------- Geometrie- und Schritt-Hilfen ----------
  function worldBoxOf(doc, id) {
    if (typeof Actions !== 'undefined' && Actions.worldBox) {
      const b = Actions.worldBox(id);
      if (b && !b.isEmpty()) return b;
    }
    const ob = typeof App !== 'undefined' && App.ownBox ? App.ownBox(id) : null;
    if (Array.isArray(ob) && ob.length === 6) {
      return new THREE.Box3(new THREE.Vector3(ob[0], ob[1], ob[2]), new THREE.Vector3(ob[3], ob[4], ob[5]));
    }
    const f = Model.find(doc, id);
    if (!f) return null;
    const lb = Model.itemLocalBox(f.item, Model.itemVars(doc, id));
    if (!lb) return null;
    return new THREE.Box3(new THREE.Vector3(lb[0], lb[1], lb[2]), new THREE.Vector3(lb[3], lb[4], lb[5])).applyMatrix4(Model.worldMatrix(doc, id));
  }

  function boxesOverlap(a, b, tol = 1e-3) {
    if (!a || !b || a.isEmpty() || b.isEmpty()) return false;
    return a.min.x <= b.max.x + tol && a.max.x >= b.min.x - tol
      && a.min.y <= b.max.y + tol && a.max.y >= b.min.y - tol
      && a.min.z <= b.max.z + tol && a.max.z >= b.min.z - tol;
  }

  function isMergedStep(it) {
    if (!it) return false;
    if (it.op && it.op.target) return true;
    if (it.kind === 'transform' && !(it.p && it.p.copy)) return true;
    if (it.kind === 'scale' || it.kind === 'deform' || it.kind === 'deleteBody') return true;
    if (it.kind === 'thicken' && !(it.p && it.p.mode === 'new')) return true;
    if (it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'mountPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'mirrorStep' || it.kind === 'boss' || it.kind === 'lipGroove' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern' || it.kind === 'stackHole' || it.kind === 'asmCut') return true;
    if (it.kind === 'group' && it.p && it.p.op === 'pattern' && (it.children || []).some((c) => c.kind === 'rib')) return true;
    return false;
  }

  function stepTargets(it) {
    const out = [];
    if (!it) return out;
    if (it.op && it.op.target) out.push(it.op.target);
    if (it.p) {
      if ((it.kind === 'transform' && !it.p.copy) || it.kind === 'scale' || it.kind === 'deform' || (it.kind === 'thicken' && it.p.mode !== 'new') || it.kind === 'rib' || it.kind === 'vent' || it.kind === 'fins' || it.kind === 'fillPattern' || it.kind === 'mountPattern' || it.kind === 'web' || it.kind === 'wrap' || it.kind === 'emboss' || it.kind === 'splitFace' || it.kind === 'dome' || it.kind === 'boss' || it.kind === 'undercut' || it.kind === 'circlipGroove' || it.kind === 'keyway' || it.kind === 'splineProfile' || it.kind === 'knurl' || it.kind === 'gripPattern') {
        if (it.p.target) out.push(it.p.target);
      }
      if (it.kind === 'lipGroove') {
        if (it.p.lipTarget) out.push(it.p.lipTarget);
        if (it.p.grooveTarget) out.push(it.p.grooveTarget);
      }
      if (it.kind === 'deleteBody' || ((it.kind === 'stackHole' || it.kind === 'asmCut') && it.p.scope === 'selected')) {
        const tgs = Array.isArray(it.p.targets) ? it.p.targets : (it.p.target ? [it.p.target] : []);
        for (const tid of tgs) if (tid) out.push(tid);
      }
      if (it.kind === 'group' && it.p.op === 'pattern') {
        for (const c of it.children || []) if (c.kind === 'rib' && c.p && c.p.target) out.push(c.p.target);
      }
      if (it.kind === 'mirrorStep' && Array.isArray(it.p.features)) {
        for (const fid of it.p.features) if (fid) out.push(fid);
      }
      if (it.kind === 'sweep' && it.p.wrapId) out.push(it.p.wrapId);
    }
    return out;
  }

  function resolveSelectedEntries(doc, rawIds) {
    const topById = new Map((doc.items || []).map((x, idx) => [x.id, { item: x, idx }]));
    const active = Model.activeItems(doc);
    const activeSet = new Set(active.map((x) => x.id));
    const seen = new Set();
    const entries = [];

    for (const rawId of rawIds) {
      const f = Model.find(doc, rawId);
      if (!f) continue;
      if (!f.parent) {
        let curId = f.item.id;
        if (typeof App !== 'undefined' && App.mergedInto && App.mergedInto(curId)) {
          curId = App.mergedInto(curId);
        } else if (isMergedStep(f.item)) {
          const guard = new Set([curId]);
          let safety = 0;
          while (safety++ < 64) {
            const cur = topById.get(curId);
            if (!cur || !isMergedStep(cur.item)) break;
            const tgts = stepTargets(cur.item).filter((t) => topById.has(t) && !guard.has(t));
            if (!tgts.length) break;
            curId = tgts[0];
            guard.add(curId);
          }
        }
        const resolved = topById.get(curId);
        if (!resolved || seen.has(curId)) continue;
        seen.add(curId);
        entries.push({ mode: 'top', root: resolved.item, order: resolved.idx });
      } else {
        if (seen.has(rawId)) continue;
        seen.add(rawId);
        const top = Model.topOf(doc, rawId);
        entries.push({ mode: 'child', root: f.item, order: top ? (topById.get(top.id) || { idx: 9999 }).idx : 9999 });
      }
    }

    entries.sort((a, b) => a.order - b.order);
    return { entries, active, activeSet };
  }

  function collectBundleForTop(doc, root, active, otherSelectedRoots) {
    const idSet = new Set([root.id]);
    const stepItems = [root];
    let added = true;
    while (added) {
      added = false;
      for (const it of active) {
        if (idSet.has(it.id) || otherSelectedRoots.has(it.id)) continue;
        const tgts = stepTargets(it);
        if (tgts.some((tid) => idSet.has(tid))) {
          idSet.add(it.id);
          stepItems.push(it);
          added = true;
        }
      }
    }
    const orderMap = new Map(active.map((x, idx) => [x.id, idx]));
    stepItems.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

    // Lose oberste Löcher im Zielkörper (falls root ein Körper ist): an diesen Körper binden, damit sie im Ziel-Tab nicht fremde Körper anschneiden
    const attachedHoles = [];
    if (root.role !== 'hole') {
      const rootBox = worldBoxOf(doc, root.id);
      for (const h of active) {
        if (h.role !== 'hole' || h.hidden || idSet.has(h.id) || otherSelectedRoots.has(h.id)) continue;
        const hBox = worldBoxOf(doc, h.id);
        if (boxesOverlap(rootBox, hBox)) {
          attachedHoles.push(h);
          idSet.add(h.id);
        }
      }
    }
    return { root, stepItems, attachedHoles, idSet };
  }

  function effectiveMaterial(doc, it) {
    if (!it || it.role === 'hole' || it.massG != null) return it && it.mat ? it.mat : null;
    if (it.mat) return it.mat;
    return doc && doc.settings && doc.settings.material ? doc.settings.material : null;
  }

  function freezeExternalRefs(doc, clone, origId, idSet) {
    // Bezugsachsen aus doc.axes einfrieren, damit Revolve & Kreismuster im anderen Projekt exakt gleich drehen
    const axMap = new Map((doc.axes || []).map((a) => [a.id, a]));
    const walkFreeze = (it, curOrigId) => {
      if (!it) return;
      if (it.p && it.p.axisId) {
        const ax = axMap.get(it.p.axisId);
        if (ax && ax.axis && Array.isArray(ax.axis.o) && Array.isArray(ax.axis.d)) {
          const inv = Model.worldMatrix(doc, curOrigId || it.id).invert();
          const lo = new THREE.Vector3(...ax.axis.o).applyMatrix4(inv).toArray().map((v) => round(v, 6));
          const ld = new THREE.Vector3(...ax.axis.d).transformDirection(inv).normalize().toArray().map((v) => round(v, 6));
          if (it.kind === 'group' && it.p.op === 'pattern' && it.p.pt === 'circ') {
            it.p.axis = 'pick'; it.p.ao = lo; it.p.ad = ld;
          } else if (it.kind === 'revolve') {
            it.p.axis3d = { o: lo, d: ld };
          }
        }
        delete it.p.axisId;
      }
      if (it.link && !idSet.has(it.link)) delete it.link;
      delete it.linkLost;
      delete it.ai;
      if (it.p) {
        const cleanSk = (sk) => {
          if (!sk || !Array.isArray(sk.ents)) return;
          for (const e of sk.ents) if (e && e.link && e.link.id && !idSet.has(e.link.id)) delete e.link;
        };
        if (it.p.planeRef && it.p.planeRef.kind === 'face' && it.p.planeRef.id && !idSet.has(it.p.planeRef.id)) delete it.p.planeRef;
        cleanSk(it.p.sketch);
        if (Array.isArray(it.p.sketches)) for (const s of it.p.sketches) cleanSk(s);
        cleanSk(it.p.path); cleanSk(it.p.rail); cleanSk(it.p.rail2); cleanSk(it.p.prof);
        if (it.p.path3d && Array.isArray(it.p.path3d.bind)) {
          it.p.path3d.bind = it.p.path3d.bind.map((b) => (b && b.id && !idSet.has(b.id) ? null : b));
        }
      }
      if (Array.isArray(it.children)) for (const c of it.children) walkFreeze(c, c.id);
    };
    walkFreeze(clone, origId);
  }

  function needsBake(bundle, doc, forceBake) {
    if (bundle.root.role === 'hole') return false;
    if (forceBake) return true;
    const { root, stepItems, idSet } = bundle;
    if (root.kind === 'transform' && root.p && root.p.copy && root.p.target && !idSet.has(root.p.target)) return true;
    if (root.kind === 'thicken' && root.p && root.p.mode === 'new' && root.p.target && !idSet.has(root.p.target)) return true;
    if (root.kind === 'sweep' && root.p && root.p.wrapId && !idSet.has(root.p.wrapId)) return true;
    for (const it of stepItems) {
      const p = it.p || {};
      if (it.kind === 'extrude' && (p.extent === 'toNext' || (p.extent === 'toFace' && (!p.toFace || !idSet.has(p.toFace.targetId || p.toFace.id))))) return true;
      if (it.kind === 'revolve' && p.dir === 'toFace' && (!p.toFace || !idSet.has(p.toFace.targetId || p.toFace.id))) return true;
      if (it.kind === 'mirrorStep') {
        if (p.plane === 'DATUM') return true;
        if (p.plane === 'FACE' && (!p.faceRef || !idSet.has(p.faceRef.id))) return true;
      }
      if (it.kind === 'import' && !p.data && !(p.blobId && typeof Store !== 'undefined' && Store.getBlobSync && Store.getBlobSync(p.blobId))) return true;
    }
    return false;
  }

  function collectParamsAndTablesAndFonts(doc, bundles) {
    const ids = new Set();
    const tbls = new Set();
    const fonts = new Set();
    for (const b of bundles) {
      for (const it of b.items) collectItemRefs(it, ids, tbls, fonts);
    }
    const docParams = Array.isArray(doc.params) ? doc.params : [];
    const needed = new Set();
    let added = true;
    while (added) {
      added = false;
      for (const dp of docParams) {
        const low = String(dp.name || '').toLowerCase();
        if (!low || needed.has(low)) continue;
        if (ids.has(low)) {
          needed.add(low);
          added = true;
          if (typeof dp.expr === 'string') extractExprTokens(dp.expr, ids, tbls);
        }
      }
    }
    const V = Model.vars(doc).v;
    const params = [];
    for (const dp of docParams) {
      const low = String(dp.name || '').toLowerCase();
      if (!needed.has(low)) continue;
      params.push({ name: dp.name, expr: dp.expr, val: Model.num(dp.expr, V, 0) });
    }
    const tables = [];
    const seenT = new Set();
    for (const tb of doc.tables || []) {
      if (!tb || !tb.name) continue;
      const low = tb.name.toLowerCase();
      if (tbls.has(low) && !seenT.has(low)) { seenT.add(low); tables.push(deepClone(tb)); }
    }
    const fontList = [];
    for (const f of doc.fonts || []) {
      if (f && fonts.has(f.id)) fontList.push(deepClone(f));
    }
    return { params, tables, fonts: fontList };
  }

  function syncInlineImportBlobs(items) {
    if (typeof Store === 'undefined') return;
    for (const it of items) {
      Model.walk([it], (x) => {
        if (!x || x.kind !== 'import' || !x.p) return;
        if (x.p.blobId && !x.p.data && Store.getBlobSync) {
          const u8 = Store.getBlobSync(x.p.blobId);
          if (u8 && u8.byteLength <= MAX_INLINE_BYTES) x.p.data = Store.bytesToBase64(u8);
        }
      });
    }
  }

  function transformFaceColors(faceColors, m) {
    if (!Array.isArray(faceColors) || !faceColors.length || !m) return faceColors;
    const nMat = new THREE.Matrix3().getNormalMatrix(m);
    return faceColors.map((fc) => {
      if (!fc) return fc;
      const out = { ...fc };
      if (Array.isArray(fc.c) && fc.c.length >= 3) {
        out.c = new THREE.Vector3(fc.c[0], fc.c[1], fc.c[2]).applyMatrix4(m).toArray().map((v) => round(v, 6));
      }
      if (Array.isArray(fc.n) && fc.n.length >= 3) {
        out.n = new THREE.Vector3(fc.n[0], fc.n[1], fc.n[2]).applyMatrix3(nMat).normalize().toArray().map((v) => round(v, 6));
      }
      return out;
    });
  }

  async function bakeRootToImport(doc, root) {
    if (typeof Kernel !== 'undefined' && Kernel.ensure) await Kernel.ensure();
    const res = await Kernel.call('exportBREP', { scene: Model.kernelScene(doc), only: [root.id] });
    const bytes = new Uint8Array(res.data);
    let blobId = null;
    if (typeof Store !== 'undefined' && Store.putBlob) blobId = await Store.putBlob(bytes);
    const data = bytes.byteLength <= MAX_INLINE_BYTES && typeof Store !== 'undefined' && Store.bytesToBase64
      ? Store.bytesToBase64(bytes)
      : undefined;
    const mat = effectiveMaterial(doc, root);
    const imp = Model.newItem(
      'import',
      {
        fmt: 'brep',
        name: Model.label(root) + '.brep',
        ...(blobId ? { blobId } : {}),
        size: bytes.byteLength,
        ...(data ? { data } : {}),
      },
      { name: Model.label(root), color: root.color, mat: mat || undefined }
    );
    imp.id = root.id;
    imp.t = Model.T0();
    if (root.colorSet) imp.colorSet = true;
    if (root.opacity != null) imp.opacity = root.opacity;
    if (root.massG != null) imp.massG = root.massG;
    if (root.texture) imp.texture = deepClone(root.texture);
    if (Array.isArray(root.faceColors) && root.faceColors.length) {
      imp.faceColors = transformFaceColors(root.faceColors, Model.worldMatrix(doc, root.id));
    }
    if (Array.isArray(root.decals) && root.decals.length) {
      const wm = Model.worldMatrix(doc, root.id);
      const nMat = new THREE.Matrix3().getNormalMatrix(wm);
      imp.decals = root.decals.map((dc) => {
        const out = deepClone(dc);
        if (out.face) {
          if (Array.isArray(out.face.c) && out.face.c.length >= 3) {
            out.face.c = new THREE.Vector3(out.face.c[0], out.face.c[1], out.face.c[2]).applyMatrix4(wm).toArray().map((v) => round(v, 6));
          }
          if (Array.isArray(out.face.n) && out.face.n.length >= 3) {
            out.face.n = new THREE.Vector3(out.face.n[0], out.face.n[1], out.face.n[2]).applyMatrix3(nMat).normalize().toArray().map((v) => round(v, 6));
          }
        }
        return out;
      });
    }
    return imp;
  }

  function buildPlainBundle(doc, entry, active, otherSelectedRoots) {
    if (entry.mode === 'child') {
      const root = entry.root;
      const clone = deepClone(root);
      const wm = Model.worldMatrix(doc, root.id);
      Model.setFromMatrix(clone, wm);
      const parents = Model.parentsOf(doc, root.id);
      if (!clone.mat && clone.role !== 'hole' && clone.massG == null) {
        for (let i = parents.length - 1; i >= 0; i--) {
          if (parents[i].mat) { clone.mat = parents[i].mat; break; }
        }
        if (!clone.mat && doc.settings && doc.settings.material) clone.mat = doc.settings.material;
      }
      if (!clone.colorSet) {
        for (let i = parents.length - 1; i >= 0; i--) {
          if (parents[i].color && !clone.color) clone.color = parents[i].color;
          if (parents[i].colorSet && !root.color) { clone.color = parents[i].color; clone.colorSet = true; break; }
        }
      }
      freezeExternalRefs(doc, clone, root.id, new Set([root.id]));
      const items = [clone];
      syncInlineImportBlobs(items);
      return { rootId: clone.id, items, baked: false, label: Model.label(root) };
    }

    const bundle = collectBundleForTop(doc, entry.root, active, otherSelectedRoots);
    const mat = effectiveMaterial(doc, entry.root);
    const clones = [];
    for (const st of bundle.stepItems) {
      const c = deepClone(st);
      if (st.id === entry.root.id && mat && !c.mat) c.mat = mat;
      freezeExternalRefs(doc, c, st.id, bundle.idSet);
      clones.push(c);
    }
    for (const h of bundle.attachedHoles) {
      const hc = deepClone(h);
      freezeExternalRefs(doc, hc, h.id, bundle.idSet);
      hc.role = 'solid';
      hc.op = { type: 'cut', target: entry.root.id };
      clones.push(hc);
    }
    syncInlineImportBlobs(clones);
    return { rootId: entry.root.id, items: clones, baked: false, label: Model.label(entry.root) };
  }

  function finalizePayload(doc, bundles) {
    const deps = collectParamsAndTablesAndFonts(doc, bundles);
    return {
      format: 'tracery-clip',
      version: 1,
      id: uid('clip'),
      ts: Date.now(),
      sourceDocId: doc.id,
      sourceName: doc.name || 'Projekt',
      params: deps.params,
      tables: deps.tables,
      fonts: deps.fonts,
      bundles,
    };
  }

  function copyToastText(bundles) {
    const anyBaked = bundles.some((b) => b.baked);
    const suffix = anyBaked ? ' (als feste Form)' : '';
    if (bundles.length === 1) {
      return `„${bundles[0].label}“${suffix} kopiert – mit Strg V einfügen, auch in einem anderen Tab.`;
    }
    return `${bundles.length} Körper${suffix} kopiert – mit Strg V einfügen, auch in einem anderen Tab.`;
  }

  function copy(ids = null, opts = {}) {
    const doc = App.doc;
    const rawIds = (ids && ids.length ? ids : App.sel).filter(Boolean);
    if (!rawIds.length) {
      UI.toast('Wähle zuerst einen oder mehrere Körper zum Kopieren aus.', { icon: 'info' });
      return null;
    }
    const { entries, active } = resolveSelectedEntries(doc, rawIds);
    if (!entries.length) {
      UI.toast('Die Auswahl konnte nicht kopiert werden.', { icon: 'info' });
      return null;
    }
    const selectedTopIds = new Set(entries.filter((e) => e.mode === 'top').map((e) => e.root.id));
    const specs = entries.map((entry) => {
      if (entry.mode === 'child') return { entry, bake: false, bundle: null };
      const otherSelected = new Set(selectedTopIds);
      otherSelected.delete(entry.root.id);
      const rawBundle = collectBundleForTop(doc, entry.root, active, otherSelected);
      return { entry, bake: needsBake(rawBundle, doc, !!opts.bake), otherSelected };
    });

    if (!specs.some((s) => s.bake)) {
      const bundles = specs.map((s) => buildPlainBundle(doc, s.entry, active, s.otherSelected));
      const payload = finalizePayload(doc, bundles);
      writeClip(payload);
      if (!opts.silent) UI.toast(copyToastText(bundles), { icon: 'copy' });
      return payload;
    }

    const job = (async () => {
      const bundles = [];
      for (const s of specs) {
        if (s.bake) {
          const imp = await bakeRootToImport(doc, s.entry.root);
          bundles.push({ rootId: imp.id, items: [imp], baked: true, label: Model.label(s.entry.root) });
        } else {
          bundles.push(buildPlainBundle(doc, s.entry, active, s.otherSelected));
        }
      }
      const payload = finalizePayload(doc, bundles);
      writeClip(payload);
      if (!opts.silent) UI.toast(copyToastText(bundles), { icon: 'copy' });
      return payload;
    })();
    pendingCopy = job.finally(() => { if (pendingCopy === job) pendingCopy = null; });
    return pendingCopy;
  }

  // ---------- Einfügen ----------
  async function ensureClipBlobs(clip) {
    if (typeof Store === 'undefined') return;
    for (const b of clip.bundles || []) {
      for (const it of b.items || []) {
        const imports = [];
        Model.walk([it], (x) => { if (x && x.kind === 'import' && x.p) imports.push(x); });
        for (const imp of imports) {
          if (imp.p.blobId && Store.getBlobSync && Store.getBlobSync(imp.p.blobId)) continue;
          if (imp.p.blobId && Store.getBlob) {
            const got = await Store.getBlob(imp.p.blobId);
            if (got) continue;
          }
          if (typeof imp.p.data === 'string' && imp.p.data.length && Store.base64ToBytes && Store.registerBlob) {
            const u8 = Store.base64ToBytes(imp.p.data);
            imp.p.blobId = Store.registerBlob(u8);
            imp.p.size = u8.byteLength;
          }
        }
      }
    }
  }

  function shiftExpr(val, delta) {
    if (!delta) return val;
    if (typeof val === 'number') return round(val + delta, 4);
    if (typeof val === 'string' && val.trim() !== '') {
      const n = parseNum(val);
      if (!isNaN(n)) return round(n + delta, 4);
      const s = String(round(delta, 4)).replace('.', ',');
      return delta >= 0 ? `(${val}) + ${s}` : `(${val}) - ${s.slice(1)}`;
    }
    return round(delta, 4);
  }

  function remapTid(tid, idMap) {
    if (typeof tid !== 'string') return tid;
    const slash = tid.indexOf('/');
    if (slash > 0) {
      const head = tid.slice(0, slash);
      if (idMap.has(head)) return idMap.get(head) + tid.slice(slash);
    }
    return tid;
  }

  function remapItemTree(it, idMap, renames) {
    for (const [oldN, newN] of renames) renameInItem(it, oldN, newN);
    Model.walk([it], (x) => {
      if (!x) return;
      if (x.id && idMap.has(x.id)) x.id = idMap.get(x.id);
      if (Array.isArray(x.finishes)) {
        for (const f of x.finishes) {
          if (!f) continue;
          f.id = uid('f');
          for (const key of ['edges', 'faces']) {
            if (Array.isArray(f[key])) {
              for (const r of f[key]) if (r && r.tid) r.tid = remapTid(r.tid, idMap);
            }
          }
        }
      }
      if (x.op && x.op.target && idMap.has(x.op.target)) x.op.target = idMap.get(x.op.target);
      if (x.link && idMap.has(x.link)) x.link = idMap.get(x.link);
      if (x.p) {
        if (x.p.target && idMap.has(x.p.target)) x.p.target = idMap.get(x.p.target);
        if (x.p.wrapId && idMap.has(x.p.wrapId)) x.p.wrapId = idMap.get(x.p.wrapId);
        if (Array.isArray(x.p.features)) x.p.features = x.p.features.map((fid) => (idMap.has(fid) ? idMap.get(fid) : fid));
        if (x.p.faceRef && x.p.faceRef.id && idMap.has(x.p.faceRef.id)) x.p.faceRef.id = idMap.get(x.p.faceRef.id);
        if (x.p.toFace) {
          if (x.p.toFace.id && idMap.has(x.p.toFace.id)) x.p.toFace.id = idMap.get(x.p.toFace.id);
          if (x.p.toFace.targetId && idMap.has(x.p.toFace.targetId)) x.p.toFace.targetId = idMap.get(x.p.toFace.targetId);
        }
        if (x.p.planeRef && x.p.planeRef.id && idMap.has(x.p.planeRef.id)) x.p.planeRef.id = idMap.get(x.p.planeRef.id);
        const fixSk = (sk) => {
          if (!sk || !Array.isArray(sk.ents)) return;
          for (const e of sk.ents) if (e && e.link && e.link.id && idMap.has(e.link.id)) e.link.id = idMap.get(e.link.id);
        };
        fixSk(x.p.sketch);
        if (Array.isArray(x.p.sketches)) for (const s of x.p.sketches) fixSk(s);
        fixSk(x.p.path); fixSk(x.p.rail); fixSk(x.p.rail2); fixSk(x.p.prof);
        if (x.p.path3d && Array.isArray(x.p.path3d.bind)) {
          for (const b of x.p.path3d.bind) if (b && b.id && idMap.has(b.id)) b.id = idMap.get(b.id);
        }
      }
    });
  }

  function shiftPastedItem(it, dx, dy) {
    if (!dx && !dy) return;
    if (it.kind === 'import' && it.p && it.p.fmt === 'brep' && it.t) {
      it.t.x = shiftExpr(it.t.x || 0, dx);
      it.t.y = shiftExpr(it.t.y || 0, dy);
      return;
    }
    if (it.kind !== 'transform' && it.kind !== 'scale' && it.kind !== 'deform' && it.kind !== 'thicken' && it.kind !== 'rib' && it.kind !== 'vent' && it.kind !== 'fins' && it.kind !== 'fillPattern' && it.kind !== 'mountPattern' && it.kind !== 'web' && it.kind !== 'wrap' && it.kind !== 'emboss' && it.kind !== 'splitFace' && it.kind !== 'dome' && it.kind !== 'mirrorStep' && it.kind !== 'knurl' && it.kind !== 'gripPattern' && !(it.p && it.p.op)) {
      it.t = it.t || Model.T0();
      it.t.x = shiftExpr(it.t.x || 0, dx);
      it.t.y = shiftExpr(it.t.y || 0, dy);
    } else if (it.kind === 'transform' && it.p) {
      if (it.p.copy) {
        it.p.dx = shiftExpr(it.p.dx || 0, dx);
        it.p.dy = shiftExpr(it.p.dy || 0, dy);
      } else if (it.p.pivot === 'point') {
        it.p.px = shiftExpr(it.p.px || 0, dx);
        it.p.py = shiftExpr(it.p.py || 0, dy);
      }
    } else if (it.kind === 'mirrorStep' && it.p) {
      if (it.p.plane === 'YZ') it.p.off = shiftExpr(it.p.off || 0, dx);
      else if (it.p.plane === 'XZ') it.p.off = shiftExpr(it.p.off || 0, dy);
      else if (Array.isArray(it.p.mo) && it.p.mo.length >= 2) {
        it.p.mo[0] = round(Number(it.p.mo[0] || 0) + dx, 4);
        it.p.mo[1] = round(Number(it.p.mo[1] || 0) + dy, 4);
      }
    } else if (it.kind === 'group' && it.p && it.p.op) {
      it.t = it.t || Model.T0();
      it.t.x = shiftExpr(it.t.x || 0, dx);
      it.t.y = shiftExpr(it.t.y || 0, dy);
      if (it.p.op === 'pattern' && it.p.pt === 'mirror') {
        if (it.p.plane === 'YZ') it.p.off = shiftExpr(it.p.off || 0, dx);
        else if (it.p.plane === 'XZ') it.p.off = shiftExpr(it.p.off || 0, dy);
      }
    }
  }

  function mergeParamsIntoDoc(doc, clipParams) {
    const renames = [];
    if (!Array.isArray(clipParams) || !clipParams.length) return renames;
    doc.params = doc.params || [];
    const targetV = Model.vars(doc).v;
    const usedLower = new Set(doc.params.map((p) => String(p.name || '').toLowerCase()));
    const toAdd = [];

    for (const cp of clipParams) {
      if (!cp || !cp.name) continue;
      const low = cp.name.toLowerCase();
      const existing = doc.params.find((p) => String(p.name || '').toLowerCase() === low);
      if (!existing) {
        usedLower.add(low);
        toAdd.push({ id: uid('m'), name: cp.name, expr: cp.expr });
      } else {
        const curVal = Model.num(existing.expr, targetV, NaN);
        const clipVal = typeof cp.val === 'number' ? cp.val : NaN;
        if (!isFinite(curVal) || !isFinite(clipVal) || Math.abs(curVal - clipVal) > 1e-6) {
          let n = 2;
          let cand = `${cp.name}_${n}`;
          while (usedLower.has(cand.toLowerCase()) || RESERVED_IDS.has(cand.toLowerCase())) {
            n++;
            cand = `${cp.name}_${n}`;
          }
          usedLower.add(cand.toLowerCase());
          renames.push([cp.name, cand]);
          toAdd.push({ id: uid('m'), name: cand, expr: cp.expr });
        }
      }
    }
    for (const entry of toAdd) {
      let expr = entry.expr;
      for (const [oldN, newN] of renames) expr = renameInExpr(expr, oldN, newN);
      doc.params.push({ id: entry.id, name: entry.name, expr });
    }
    return renames;
  }

  function mergeTablesAndFonts(doc, clip) {
    if (Array.isArray(clip.tables) && clip.tables.length) {
      doc.tables = doc.tables || [];
      const haveT = new Set(doc.tables.map((t) => String(t.name || '').toLowerCase()));
      for (const tb of clip.tables) {
        if (!tb || !tb.name || haveT.has(tb.name.toLowerCase())) continue;
        haveT.add(tb.name.toLowerCase());
        const tc = deepClone(tb);
        tc.id = uid('tbl');
        doc.tables.push(tc);
      }
    }
    if (Array.isArray(clip.fonts) && clip.fonts.length) {
      doc.fonts = doc.fonts || [];
      const haveF = new Set(doc.fonts.map((f) => f && f.id));
      for (const f of clip.fonts) {
        if (!f || !f.id || haveF.has(f.id)) continue;
        haveF.add(f.id);
        doc.fonts.push(deepClone(f));
      }
      if (typeof SK !== 'undefined' && SK.syncFonts) SK.syncFonts(doc.fonts);
    }
  }

  async function paste(opts = {}) {
    if (pendingCopy) await whenReady();
    const clip = readClip();
    if (!clip || !Array.isArray(clip.bundles) || !clip.bundles.length) {
      if (!opts.silent) UI.toast('Die Zwischenablage ist leer – wähle zuerst einen Körper und drücke Strg C.', { icon: 'info' });
      return [];
    }
    await ensureClipBlobs(clip);

    const sameDoc = clip.sourceDocId === App.doc.id;
    if (sameDoc) {
      pasteCount = lastPasteClipId === clip.id ? pasteCount + 1 : 1;
      lastPasteClipId = clip.id;
    } else {
      lastPasteClipId = null;
      pasteCount = 0;
      if (!App.doc.items.some((x) => x.role !== 'hole' && !x.hidden)) App.fitAfterBuild();
    }
    const dx = sameDoc ? 10 * pasteCount : 0;
    const dy = sameDoc ? 10 * pasteCount : 0;

    const pastedRootIds = [];
    const label = clip.bundles.length === 1 ? `Eingefügt: ${clip.bundles[0].label || 'Körper'}` : `${clip.bundles.length} Körper eingefügt`;

    App.change(label, (doc) => {
      const renames = sameDoc ? [] : mergeParamsIntoDoc(doc, clip.params);
      if (!sameDoc) mergeTablesAndFonts(doc, clip);

      for (const bundle of clip.bundles) {
        const clones = (bundle.items || []).map(deepClone);
        const idMap = new Map();
        for (const it of clones) {
          Model.walk([it], (x) => {
            if (x && x.id) idMap.set(x.id, uid('i'));
            if (x && x.kind === 'import' && x.p && x.p.blobId && typeof Store !== 'undefined' && Store.getBlobSync && Store.getBlobSync(x.p.blobId)) {
              delete x.p.data;
            }
          });
        }
        for (const it of clones) {
          remapItemTree(it, idMap, renames);
          if (sameDoc) shiftPastedItem(it, dx, dy);
          doc.items.push(it);
        }
        const newRootId = idMap.get(bundle.rootId);
        if (newRootId) pastedRootIds.push(newRootId);
      }
    });

    if (pastedRootIds.length) App.select(pastedRootIds);
    if (!opts.silent) {
      const anyBaked = clip.bundles.some((b) => b.baked);
      const bakedNote = anyBaked ? ' (als feste Form)' : '';
      const fromSrc = !sameDoc && clip.sourceName ? ` aus „${clip.sourceName}“` : '';
      const msg = clip.bundles.length === 1
        ? `„${clip.bundles[0].label}“${fromSrc}${bakedNote} eingefügt.`
        : `${clip.bundles.length} Körper${fromSrc}${bakedNote} eingefügt.`;
      UI.toast(msg, { icon: 'copy' });
    }
    return pastedRootIds;
  }

  function copyFromShortcut() {
    if (!App.sel.length) {
      const selTxt = window.getSelection ? String(window.getSelection()).trim() : '';
      if (selTxt) return false;
    }
    copy();
    return true;
  }

  function pasteFromShortcut() {
    paste();
    return true;
  }

  return {
    CLIP_KEY,
    copy,
    paste,
    copyFromShortcut,
    pasteFromShortcut,
    hasData,
    peek: readClip,
    clear,
    whenReady,
    get busy() { return !!pendingCopy; },
  };
})();
